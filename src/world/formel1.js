// ============================================================
// 17.10. (v29, F3) Formel-1-Strecke: Rennstrecken-Optik als Add-on (nur für Strecken mit `formel1: true` im Katalog, id 'formel1').
//   Wunsch des Vaters: „eine Formel-1-Strecke bauen, einfach und schnell“ – mit Boxengasse-Optik, Boxengebäude, Boxenmauer,
//   bunten Teamfarben, Werbebanden, Kiesbetten und rot-weißen Randsteinen (die Randsteine baut schon trackBuilder._randBauen).
//
//   R.Formel1.bauen(strecke)         → THREE.Group 'Formel1' | null   (Boxengasse + Mauer + 8 Boxen + Turm, Kiesbetten, Werbebanden, Reifenstapel;
//                                      Draw-Calls: Asphalt/Kies 1, Gebäude 1, Banden 1, Reifen 2)
//   R.Formel1.sperre(strecke, x, z)  → true, wenn (x, z) im Boxenbereich liegt (trackBuilder.dekoSperre: keine Bäume dort)
//   R.Formel1.zone(strecke)          → { s0, s1, mitte, seite, ... } | null
//   R.Formel1.kurven(strecke)        → [{ s0, s1, aussen (−1 links, +1 rechts), winkel, apexS }]  Kurvenbereiche (Kiesbett + Reifen auf der Außenseite)
//   R.Formel1.tribuenenKurven(strecke) → Kandidaten { apexS, dir, winkel } für die Kurventribünen (die Kurvenschilder-Suche erkennt weite Kurven nicht)
//   R.Formel1.TEAMFARBEN             die 8 Teamfarben (= Lackfarben der Formel-Renner im Modus „Nur Rennautos“, carCatalog.FORMEL_FARBEN)
//
//   Katalog (trackCatalog.js, Eintrag formel1): boxen: { s0, s1, mitte, seite } = Boxengasse von s0 bis s1 (Bogenlänge, darf negativ sein),
//   Garagenreihe um `mitte`, auf der Seite `seite` (+1 rechts = Innenseite der Rechtskurven). Reine Optik, keine Kollision:
//   die Bande (zaunAbstand) bleibt dort, wo sie ist; die Boxenmauer steht genau auf ihr, die Gebäude dahinter.
//   Läuft ohne DOM (Server lädt die Datei nur für sperre/zone); bauen() braucht THREE (und document für die Werbebanden-Textur).
// ============================================================
(function () {
  const R = window.Rennspiel;
  if (!R) return;

  const TEAMFARBEN = (R.carCatalog && R.carCatalog.FORMEL_FARBEN && R.carCatalog.FORMEL_FARBEN.slice())
    || [0xd7261e, 0x1e5bd8, 0xf6c20a, 0x1fa84f, 0xff7a00, 0x7a3cc8, 0x00b3b8, 0xf0409a];

  // Maße (m, quer zur Straße ab Mittellinie)
  const GASSE_IN = 11.5, GASSE_AUS = 19.5;        // Boxengasse (Asphalt) von … bis
  const MAUER_Q = 20.0;                            // Boxenmauer steht auf der Bande (zaunAbstand 12 → 8 + 12 = 20)
  const GARAGE_Q0 = 21.6, GARAGE_TIEFE = 9, GARAGE_BREITE = 24, GARAGE_LUECKE = 2, GARAGE_HOEHE = 4;
  const BANDE_Q = 20.55;                           // Werbebanden / Reifenstapel stehen hinter dem Zaun
  const KURVE_K = 1 / 450;                         // ab dieser Krümmung (1/m) zählt ein Stück als Kurve

  const num = (v, d) => (typeof v === 'number' && isFinite(v) ? v : d);
  const glatt = (t) => { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); };

  // ------------------------------------------------------------------ Zone
  function zone(st) {
    const b = st && st.daten && st.daten.boxen;
    if (!b || !st.spline) return null;
    const sp = st.spline, seite = b.seite === -1 ? -1 : 1;
    const len = b.s1 - b.s0;
    const P0 = sp.punktBei(sp.wrapS(b.s0));
    const reihe = 8 * GARAGE_BREITE + 7 * GARAGE_LUECKE;
    return { s0: b.s0, s1: b.s1, len, seite, mitte: num(b.mitte, (b.s0 + b.s1) / 2), reihe, P0,
      // lokale Achsen: u längs (Fahrtrichtung), q quer nach `seite`
      punkt(u, q) { return [P0.x + P0.tx * u + P0.nx * q * seite, P0.z + P0.tz * u + P0.nz * q * seite]; } };
  }

  /** Liegt (x, z) im Boxenbereich (Gasse, Mauer, Garagen, Turm) samt Rand? */
  function sperre(st, x, z, n) {
    const Z = zone(st);
    if (!Z) return false;
    const sp = st.spline;
    n = n || sp.naechster(x, z);
    if (n.seitenabstand * Z.seite < 5) return false;                 // andere Seite / Fahrbahn
    if (n.seitenabstand * Z.seite > GARAGE_Q0 + GARAGE_TIEFE + 14) return false;
    const d = sp.differenzS(n.s, sp.wrapS(Z.s0));                    // Abstand ab s0 (vorwärts positiv)
    return d > -18 && d < Z.len + 18;
  }

  // ------------------------------------------------------------------ Kurven (für Kiesbett, Reifen, Werbebanden, Tribünen)
  /**
   * Kurvenbereiche: zusammenhängende Stücke mit |Krümmung| > KURVE_K und gleichem Drehsinn (S-Kurve/Schikane = getrennte Kurven).
   * { s0, s1 (mit 38 m Auslauf), kern0, kern1, dir (+1 rechts), aussen (−1 links, +1 rechts), winkel (°), apexS }
   */
  function kurven(st) {
    if (st._f1Kurven) return st._f1Kurven;
    const sp = st.spline, L = sp.laenge, schritt = 4;
    const roh = [];
    let a = null, letzte = null, dir = 0, winkel = 0;
    const ende = () => { if (a !== null) roh.push({ kern0: a, kern1: letzte, dir, winkel: winkel * 180 / Math.PI }); a = null; winkel = 0; };
    for (let s = 0; s < L; s += schritt) {
      const k = sp.punktBei(s).kruemmung || 0, sg = Math.sign(k);
      if (Math.abs(k) > KURVE_K) {
        if (a !== null && sg !== dir) ende();
        if (a === null) { a = s; dir = sg; }
        letzte = s; winkel += Math.abs(k) * schritt;
      } else if (a !== null && s - letzte > 40) ende();
    }
    ende();
    st._f1Kurven = roh.map((c) => ({ s0: c.kern0 - 38, s1: c.kern1 + 38, kern0: c.kern0, kern1: c.kern1, dir: c.dir, aussen: c.dir > 0 ? -1 : 1,
      winkel: c.winkel, apexS: sp.wrapS((c.kern0 + c.kern1) / 2) }));
    return st._f1Kurven;
  }
  /** Kurven-Kandidaten für Kurventribünen (tribuenen.js, wenn der Katalog tribuenenOpt hat): { apexS, dir, winkel }. */
  function tribuenenKurven(st) {
    return kurven(st).map((c) => ({ apexS: c.apexS, dir: c.dir, winkel: c.winkel }));
  }

  // ------------------------------------------------------------------ Mesher (Vertexfarben, ein Mesh)
  function Mesher() { this.pos = []; this.nor = []; this.col = []; this.idx = []; this.uv = null; }
  Mesher.prototype.ecke = function (p, n, c) {
    this.pos.push(p[0], p[1], p[2]); this.nor.push(n[0], n[1], n[2]); this.col.push(c[0], c[1], c[2]);
    return this.pos.length / 3 - 1;
  };
  Mesher.prototype.quad = function (a, b, c, d, n, f) {
    const i = this.ecke(a, n, f); this.ecke(b, n, f); this.ecke(c, n, f); this.ecke(d, n, f);
    // Umlaufsinn so wählen, dass die Vorderseite in Richtung der Normale n zeigt (sonst wäre die Fläche unten hell/oben dunkel)
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - b[0], vy = c[1] - b[1], vz = c[2] - b[2];
    const gx = uy * vz - uz * vy, gy = uz * vx - ux * vz, gz = ux * vy - uy * vx;
    if (gx * n[0] + gy * n[1] + gz * n[2] >= 0) this.idx.push(i, i + 1, i + 2, i, i + 2, i + 3);
    else this.idx.push(i, i + 2, i + 1, i, i + 3, i + 2);
  };
  Mesher.prototype.geometrie = function () {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.pos), 3));
    g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(this.nor), 3));
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(this.col), 3));
    g.setIndex(this.idx.length > 65000 ? new THREE.BufferAttribute(new Uint32Array(this.idx), 1) : new THREE.BufferAttribute(new Uint16Array(this.idx), 1));
    return g;
  };
  const farbe = (hex) => { const c = new THREE.Color(hex); return [c.r, c.g, c.b]; };   // sRGB-Werte wie die übrigen Vertexfarben (trackBuilder)

  /** Quader im lokalen Rahmen Z (u längs, q quer, y hoch): u0..u1, q0..q1, y0..y1. Ohne Unterseite. */
  function quader(m, Z, u0, u1, q0, q1, y0, y1, hex) {
    const f = farbe(hex);
    const P = (u, q, y) => { const w = Z.punkt(u, q); return [w[0], y, w[1]]; };
    const tx = Z.P0.tx, tz = Z.P0.tz, nx = Z.P0.nx * Z.seite, nz = Z.P0.nz * Z.seite;
    // Ecken: unten 0..3 (u0q0, u1q0, u1q1, u0q1), oben 4..7
    const c = [P(u0, q0, y0), P(u1, q0, y0), P(u1, q1, y0), P(u0, q1, y0), P(u0, q0, y1), P(u1, q0, y1), P(u1, q1, y1), P(u0, q1, y1)];
    m.quad(c[4], c[5], c[6], c[7], [0, 1, 0], f);                                // oben
    m.quad(c[0], c[1], c[5], c[4], [-nx, 0, -nz], f);                            // zur Straße (kleineres q)
    m.quad(c[2], c[3], c[7], c[6], [nx, 0, nz], f);                              // weg von der Straße
    m.quad(c[3], c[0], c[4], c[7], [-tx, 0, -tz], f);                            // hinten (u0)
    m.quad(c[1], c[2], c[6], c[5], [tx, 0, tz], f);                              // vorn (u1)
  }

  // ------------------------------------------------------------------ Boden-Streifen entlang der Strecke
  /** Streifen von sA bis sB zwischen den Querabständen qa(s)…qb(s) auf Seite sg; hoch = Gelände + dy; Farbe c (Vertexfarbe). */
  function streifen(m, st, sA, sB, qa, qb, sg, dy, hex, schritt) {
    const sp = st.spline, f = farbe(hex), n = [0, 1, 0];
    const anz = Math.max(1, Math.ceil((sB - sA) / (schritt || 4)));
    let prev = null;
    for (let i = 0; i <= anz; i++) {
      const s = sA + (sB - sA) * i / anz, p = sp.punktBei(sp.wrapS(s));
      const a = qa(s), b = qb(s);
      const xa = p.x + p.nx * a * sg, za = p.z + p.nz * a * sg, xb = p.x + p.nx * b * sg, zb = p.z + p.nz * b * sg;
      const cur = [[xa, st.bodenHoehe(xa, za) + dy, za], [xb, st.bodenHoehe(xb, zb) + dy, zb]];
      if (prev) {
        m.quad(prev[0], cur[0], cur[1], prev[1], n, f);
      }
      prev = cur;
    }
  }

  // ------------------------------------------------------------------ Textur der Werbebanden (Canvas, nur Browser)
  const TEXTE = ['TURBO!', 'VOLLGAS!', 'SPEED', 'JONAS', 'GAS GEBEN!', 'RENNEN', 'SCHNELL!', 'ZIELFLAGGE'];
  function bandenTextur() {
    if (typeof document === 'undefined') return null;
    const c = document.createElement('canvas'); c.width = 1024; c.height = 1024;
    const g = c.getContext('2d'); if (!g) return null;
    const hexCss = (h) => '#' + ('000000' + (h >>> 0).toString(16)).slice(-6);
    TEXTE.forEach((t, i) => {
      const y = i * 128, fb = TEAMFARBEN[i % TEAMFARBEN.length];
      g.fillStyle = hexCss(fb); g.fillRect(0, y, 1024, 128);
      g.fillStyle = 'rgba(255,255,255,0.92)'; g.fillRect(0, y, 1024, 10); g.fillRect(0, y + 118, 1024, 10);
      // Schachbrett-Ecken
      for (let k = 0; k < 8; k++) for (let j = 0; j < 2; j++) if ((k + j) % 2 === 0) { g.fillStyle = '#111'; g.fillRect(8 + k * 12, y + 14 + j * 12, 12, 12); g.fillRect(1024 - 8 - (k + 1) * 12, y + 14 + j * 12, 12, 12); }
      g.font = 'bold 84px Arial, Helvetica, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      const hell = (fb === 0xf6c20a || fb === 0x00b3b8 || fb === 0xff7a00);
      g.lineWidth = 10; g.strokeStyle = hell ? 'rgba(0,0,0,0.0)' : 'rgba(0,0,0,0.35)'; g.strokeText(t, 512, y + 68);
      g.fillStyle = hell ? '#1b1b1b' : '#ffffff'; g.fillText(t, 512, y + 68);
    });
    const tex = new THREE.CanvasTexture(c);
    if ('encoding' in tex && THREE.sRGBEncoding) tex.encoding = THREE.sRGBEncoding;
    tex.anisotropy = 4; tex.needsUpdate = true;
    return tex;
  }

  // ------------------------------------------------------------------ Bauen
  function bauen(st) {
    const Z = zone(st);
    if (!Z || typeof THREE === 'undefined') return null;
    const sp = st.spline, L = sp.laenge;
    const gruppe = new THREE.Group(); gruppe.name = 'Formel1';
    const matLambert = (opt) => new THREE.MeshLambertMaterial(Object.assign({ vertexColors: true, side: THREE.DoubleSide }, opt || {}));

    // ---------- 1) Boden: Boxengasse + Kiesbetten (ein Mesh, Vertexfarben, über dem Gelände)
    const boden = new Mesher();
    const s0 = Z.s0, s1 = Z.s1, rampe = 34;
    const dEnde = (s) => Math.min(s - s0, s1 - s);
    const qIn = (s) => 9.7 + (GASSE_IN - 9.7) * glatt(dEnde(s) / 26);                  // Ein-/Ausfahrt: Keil aus dem Straßenrand
    const qAus = (s) => qIn(s) + (GASSE_AUS - qIn(s)) * glatt(dEnde(s) / (rampe * 1.8));
    streifen(boden, st, s0, s1, qIn, qAus, Z.seite, 0.045, 0x62666d, 4);                // Asphalt der Boxengasse
    streifen(boden, st, s0 + 8, s1 - 8, (s) => qIn(s) + 0.05, (s) => qIn(s) + 0.3, Z.seite, 0.06, 0xf2f2f2, 4);   // weiße Linie an der Fahrspur
    streifen(boden, st, s0 + 8, s1 - 8, (s) => qIn(s) + 3.9, (s) => qIn(s) + 4.15, Z.seite, 0.06, 0xf2c200, 4);   // gelbe Linie: Arbeitszone
    // Kiesbetten: Außenseite der Kurven
    const kv = kurven(st);
    kv.forEach((c) => {
      const lang = c.s1 - c.s0;
      streifen(boden, st, c.s0, c.s1, () => 10.2, (s) => 10.2 + (BANDE_Q - 0.9 - 10.2) * glatt(Math.min(s - c.s0, c.s1 - s) / 30), c.aussen, 0.04, 0xd6c79b, 5);
      streifen(boden, st, c.s0 + 4, c.s1 - 4, () => 10.2, () => 10.55, c.aussen, 0.055, 0xb9ab82, 5);   // Rand des Kiesbetts (dunkler Saum)
    });
    const bm = new THREE.Mesh(boden.geometrie(), matLambert({ polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }));
    bm.name = 'F1 Boden'; gruppe.add(bm);

    // ---------- 2) Gebäude: Boxenmauer, 8 Garagen (Teamfarben), Dächer, Vordächer, Turm (ein Mesh)
    const geb = new Mesher();
    const hoeheMitte = (u, q) => { const w = Z.punkt(u, q); return st.bodenHoehe(w[0], w[1]); };
    const uMitte = Z.mitte - Z.s0;                                            // lokales u der Garagenmitte
    const u0 = uMitte - Z.reihe / 2;
    // Boxenmauer in 8-m-Stücken (folgt dem Gelände), Streifen in Teamfarben
    for (let u = 10; u < Z.len - 10; u += 8) {
      const y0 = hoeheMitte(u + 4, MAUER_Q);
      quader(geb, Z, u, u + 8.02, MAUER_Q - 0.35, MAUER_Q + 0.35, y0 - 0.5, y0 + 1.05, 0xe9ecef);
      const gi = Math.floor((u + 4 - u0) / (GARAGE_BREITE + GARAGE_LUECKE));
      const teamHex = gi >= 0 && gi < 8 ? TEAMFARBEN[gi] : 0x303338;
      quader(geb, Z, u, u + 8.02, MAUER_Q - 0.38, MAUER_Q + 0.38, y0 + 0.78, y0 + 1.05, teamHex);
    }
    for (let i = 0; i < 8; i++) {
      const ua = u0 + i * (GARAGE_BREITE + GARAGE_LUECKE), ub = ua + GARAGE_BREITE, hex = TEAMFARBEN[i % TEAMFARBEN.length];
      const y0 = hoeheMitte((ua + ub) / 2, GARAGE_Q0 + 2);
      const q0 = GARAGE_Q0, q1 = GARAGE_Q0 + GARAGE_TIEFE, h = GARAGE_HOEHE;
      quader(geb, Z, ua, ub, q0, q1, y0 - 1.6, y0 + h, 0xe6e9ed);                   // Gebäudekörper
      quader(geb, Z, ua, ua + 2.2, q0 - 0.12, q1, y0 - 1.6, y0 + h, hex);            // Pfeiler in Teamfarbe (links)
      quader(geb, Z, ub - 2.2, ub, q0 - 0.12, q1, y0 - 1.6, y0 + h, hex);            // Pfeiler in Teamfarbe (rechts)
      quader(geb, Z, ua + 2.2, ub - 2.2, q0 - 0.06, q0 + 0.1, y0, y0 + 3.0, 0x23262b);   // Rolltor (dunkel)
      quader(geb, Z, ua + 2.2, ub - 2.2, q0 - 0.1, q0 + 0.12, y0 + 3.0, y0 + 3.9, hex);  // Schildband über dem Tor
      quader(geb, Z, ua + 2.2, ub - 2.2, q0 - 0.07, q0 + 0.1, y0 + 0.0, y0 + 0.35, hex);  // Farbstreifen unten am Tor
      quader(geb, Z, ua - 0.4, ub + 0.4, q0 - 0.45, q1 + 0.4, y0 + h, y0 + h + 0.28, 0x9aa1ab);   // Dachplatte mit Überstand
      // Vordach über dem Arbeitsbereich: Teamfarbe, auf zwei dünnen Pfosten an der Boxenmauer
      const dach = y0 + 2.9;
      quader(geb, Z, ua + 4, ub - 4, GASSE_AUS - 3.2, MAUER_Q - 0.3, dach, dach + 0.16, hex);
      quader(geb, Z, ua + 4.2, ua + 4.45, MAUER_Q - 0.75, MAUER_Q - 0.5, y0, dach, 0x555b63);
      quader(geb, Z, ub - 4.45, ub - 4.2, MAUER_Q - 0.75, MAUER_Q - 0.5, y0, dach, 0x555b63);
    }
    // Turm (Rennleitung) über den mittleren zwei Garagen
    {
      const ua = u0 + 3 * (GARAGE_BREITE + GARAGE_LUECKE) + 3, ub = u0 + 5 * (GARAGE_BREITE + GARAGE_LUECKE) - GARAGE_LUECKE - 3;
      const y0 = hoeheMitte((ua + ub) / 2, GARAGE_Q0 + 3) + GARAGE_HOEHE + 0.28;
      quader(geb, Z, ua, ub, GARAGE_Q0 + 0.6, GARAGE_Q0 + 7.4, y0, y0 + 4.6, 0xf1f3f5);
      quader(geb, Z, ua + 1.2, ub - 1.2, GARAGE_Q0 + 0.5, GARAGE_Q0 + 6.8, y0 + 1.0, y0 + 3.6, 0x2b4560);   // Glasband
      quader(geb, Z, ua - 0.7, ub + 0.7, GARAGE_Q0 - 0.6, GARAGE_Q0 + 8.2, y0 + 4.6, y0 + 4.95, 0x30343a);  // Dach
      quader(geb, Z, (ua + ub) / 2 - 0.1, (ua + ub) / 2 + 0.1, GARAGE_Q0 + 3.5, GARAGE_Q0 + 3.7, y0 + 4.95, y0 + 9.0, 0x707780);   // Mast
      quader(geb, Z, (ua + ub) / 2 + 0.1, (ua + ub) / 2 + 2.6, GARAGE_Q0 + 3.55, GARAGE_Q0 + 3.62, y0 + 7.4, y0 + 8.9, 0xf4f4f4);  // Fahne
      quader(geb, Z, (ua + ub) / 2 + 0.1, (ua + ub) / 2 + 1.35, GARAGE_Q0 + 3.55, GARAGE_Q0 + 3.63, y0 + 8.15, y0 + 8.9, 0x151515);   // Schachbrett (grob)
      quader(geb, Z, (ua + ub) / 2 + 1.35, (ua + ub) / 2 + 2.6, GARAGE_Q0 + 3.55, GARAGE_Q0 + 3.63, y0 + 7.4, y0 + 8.15, 0x151515);
    }
    const gm = new THREE.Mesh(geb.geometrie(), matLambert());
    gm.name = 'F1 Boxen'; gruppe.add(gm);

    // ---------- 3) Werbebanden (Textur-Atlas) + Reifenstapel
    const tex = bandenTextur();
    const wb = { pos: [], nor: [], uv: [], idx: [] };
    const aussenBereich = (s, sg) => kv.some((c) => c.aussen === sg && s >= c.s0 - 2 && s <= c.s1 + 2);
    const startSperrS = (s) => Math.abs(sp.differenzS(0, s)) < 24;               // Start/Ziel-Bogen
    const zugrund = (s, sg) => {
      const p = sp.punktBei(sp.wrapS(s)), x = p.x + p.nx * (BANDE_Q + 3) * sg, z = p.z + p.nz * (BANDE_Q + 3) * sg;
      return (st.tribuenen && st.tribuenen.length && R.Tribuenen && R.Tribuenen.sperre(st, x, z, 6)) || false;
    };
    let nb = 0;
    for (const sg of [-1, 1]) {
      for (let s = 12; s < L - 12; s += 12) {
        const sm = s + 4;
        if (aussenBereich(sm, sg) || startSperrS(sm) || zugrund(sm, sg)) continue;
        if (sg === Z.seite && sp.differenzS(sp.wrapS(sm), sp.wrapS(Z.s0)) > -8 && sp.differenzS(sp.wrapS(sm), sp.wrapS(Z.s0)) < Z.len + 8) continue;   // vor den Boxen steht die Mauer
        const pa = sp.punktBei(sp.wrapS(s)), pb = sp.punktBei(sp.wrapS(s + 8));
        const xa = pa.x + pa.nx * BANDE_Q * sg, za = pa.z + pa.nz * BANDE_Q * sg, xb = pb.x + pb.nx * BANDE_Q * sg, zb = pb.z + pb.nz * BANDE_Q * sg;
        const ya = st.bodenHoehe(xa, za), yb = st.bodenHoehe(xb, zb);
        const zeile = nb % TEXTE.length, v0 = 1 - (zeile * 128 + 4) / 1024, v1 = 1 - ((zeile + 1) * 128 - 4) / 1024;
        const base = wb.pos.length / 3;
        // Fläche zeigt zur Straße; Winkel der Normale aus der Normalen der Strecke
        const nx = -pa.nx * sg, nz = -pa.nz * sg;
        const h0 = 0.12, h1 = 1.12;
        wb.pos.push(xa, ya + h0, za, xb, yb + h0, zb, xb, yb + h1, zb, xa, ya + h1, za);
        for (let k = 0; k < 4; k++) wb.nor.push(nx, 0, nz);
        // Texturausrichtung: von links nach rechts aus Sicht der Straße (zur Fahrer-Seite hin lesbar)
        if (sg > 0) wb.uv.push(1, v1, 0, v1, 0, v0, 1, v0); else wb.uv.push(0, v1, 1, v1, 1, v0, 0, v0);
        wb.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
        nb++;
      }
    }
    if (nb) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(wb.pos), 3));
      g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(wb.nor), 3));
      g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(wb.uv), 2));
      g.setIndex(new THREE.BufferAttribute(new Uint16Array(wb.idx), 1));
      const bmat = new THREE.MeshLambertMaterial({ map: tex || null, color: tex ? 0xffffff : 0xdd3333, side: THREE.DoubleSide });
      const bandenMesh = new THREE.Mesh(g, bmat); bandenMesh.name = 'F1 Werbebanden'; gruppe.add(bandenMesh);
    }
    // Reifenstapel (rot/weiß) hinter dem Kiesbett: zwei InstancedMeshes, je Stapel 2 Reifen
    const reifenGeo = new THREE.CylinderGeometry(0.46, 0.46, 0.5, 8, 1, true);
    const rot = [], weiss = [];
    kv.forEach((c) => {
      for (let s = c.s0 + 18; s < c.s1 - 18; s += 1.2) {
        const p = sp.punktBei(sp.wrapS(s)), x = p.x + p.nx * (BANDE_Q + 0.2) * c.aussen, z = p.z + p.nz * (BANDE_Q + 0.2) * c.aussen;
        const y = st.bodenHoehe(x, z), liste = (Math.floor(s / 1.2) % 8 < 4) ? rot : weiss;
        liste.push([x, y + 0.25, z], [x, y + 0.76, z]);
      }
    });
    [[rot, 0xd42a2a], [weiss, 0xf2f2f2]].forEach(([liste, hex]) => {
      if (!liste.length) return;
      const im = new THREE.InstancedMesh(reifenGeo, new THREE.MeshLambertMaterial({ color: hex }), liste.length);
      const d = new THREE.Object3D();
      liste.forEach((p, i) => { d.position.set(p[0], p[1], p[2]); d.updateMatrix(); im.setMatrixAt(i, d.matrix); });
      im.instanceMatrix.needsUpdate = true; im.name = 'F1 Reifen ' + (hex === 0xd42a2a ? 'rot' : 'weiss');
      gruppe.add(im);
    });
    gruppe.userData.formel1 = { banden: nb, reifen: rot.length + weiss.length, kurven: kv.length };
    return gruppe;
  }

  R.Formel1 = { bauen, sperre, zone, kurven, tribuenenKurven, TEAMFARBEN, KURVE_K };
})();
