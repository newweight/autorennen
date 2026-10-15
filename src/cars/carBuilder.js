// ============================================================
// Auto-Bauer v2: detailreiche Low-Poly-Karosserien aus echten Maßen.
//
// Aufruf:  const auto = Rennspiel.carBuilder.bauen(autoDatenAusKatalog);
//   -> THREE.Group, Ursprung = Bodenmitte, Fahrtrichtung = -z (Front bei -z).
//
// userData am Ergebnis (Schnittstelle unverändert zu v1):
//   raeder[4]         alle Räder (vorne links, vorne rechts, hinten links, hinten rechts);
//                     rad.rotation.x = Rolldrehung
//   vorderraeder[2]   die zwei vorderen Räder
//   lenkObjekte[2]    Halter der vorderen Räder – um y drehen = Lenkeinschlag
//   bremslichter[2]   Rücklicht-Meshes (eigenes Material je Auto, siehe setzeBremslicht)
//   scheinwerfer[2]   Scheinwerfer-Meshes (inkl. Tagfahrlicht)
//   autoId, karosserie, bremslichtMaterial
//   blaulicht[2]      (nur Autos mit form.blaulicht, z. B. Streifenwagen) linke/rechte Leuchte im Dachbalken,
//                     je eigenes Material; schalten mit setzeBlaulicht(auto, phase, farbe). Sonst [].
//                     14.10. (v20): Streifenwagen = Passat-Geometrie + Optionen (auto.optionen / bauen(auto, opt)): lack 'polizei' (Katalog-lackVarianten),
//                     lichtbalken true (form.blaulicht), farbe (Hauptlack, auch für Gegner). form.polizeiDekor = zusätzliches Mesh 'polizeiDekor'
//                     (Canvas-Textur „POLIZEI“ auf Seiten/Haube/Heck, 1 Draw-Call; im Browser sichtbar, ohne Canvas unsichtbar).
//   Formel-Renner (Typ 'formel'): scheinwerfer = [] (keine Scheinwerfer); bremslichter = [Regenlicht hinten,
//                     Leuchtstreifen an den Heckflügel-Endplatten].
//
// Aufbau (10 Meshes pro Auto; Streifenwagen 12, Formel-Renner 8): Karosserie = EIN Mesh mit Vertex-Farben (Lack, Glas,
// Kunststoff, Chrom, Radhäuser, Innenraum …), 2 Scheinwerfer, 2 Rücklichter, 4 Räder,
// Blob-Schatten (name 'schatten').
//
// Wie die Karosserie entsteht:
//   1. Unterbau („Rumpf"): ein Loft aus Querschnitten entlang z. Jeder Querschnitt hat
//      Schweller, Flanke, Schulter, Haube/Deck. Radhäuser entstehen, indem die Unterkante
//      über den Rädern als Halbkreis hochgezogen wird; Kotflügel-Wölbung über die Schulterlinie.
//   2. Kabine: zweiter Loft (Frontscheibe → Dach → Heckscheibe) mit Einzug (Tumblehome);
//      Fenster, Säulen und Dach sind nur Flächenfarben (keine Z-Kämpfe).
//   3. Anbauteile (Lichter, Grill, Kennzeichen, Spiegel …) werden mit flaecheZ() exakt auf
//      die gewölbte Front/Heck gesetzt und nach der Flächennormale ausgerichtet.
//   Alle Formdaten kommen aus auto.abmessungen + auto.form (Katalog), ergänzt durch
//   TYP_STANDARD je Karosserie-Typ. Ein Typ, viele Varianten.
// Keine Logos, Embleme, Schriftzüge: nur Proportionen, Formen und Farben; Grills generisch.
// ============================================================
(function () {
  const R = window.Rennspiel;

  // --- Farben der Anbauteile ---
  const FARBE = {
    GLAS: 0x18222c, GLAS_CABRIO: 0x2c3c4c, KUNSTSTOFF: 0x26292e, SCHWARZ: 0x131518, CHROM: 0xd3d8de,
    RADHAUS: 0x0d0e10, UNTERBODEN: 0x17181a, REIFEN: 0x1b1b1c, FELGE_INNEN: 0x25272b, BREMSE: 0x80868d,
    INNEN: 0x2c2e33, SITZ: 0xcdb48a, VERDECK: 0x1e1f23, WEISS: 0xf2f2ee, NEBEL: 0xc9ced4, GITTER: 0x41454c,
    FUGE: 0x15171a,
  };
  const LICHT_AUS = 0xa31414;      // Rücklicht normal
  const LICHT_AN = 0xff3b30;       // Rücklicht beim Bremsen
  const LICHT_NACHT = 0xe0201a;    // Runde 6: Rücklicht mit Fahrlicht (Dämmerung/Nacht)
  const LICHT_NACHT_BREMSE = 0xff6a50;   // Runde 6: Bremslicht mit Fahrlicht (heller, leicht orange)
  const SCHEINWERFER = 0xfff6c8;
  const BLAULICHT = { aus: { blau: 0x1c2f63, rot: 0x5a1c1c }, an: { blau: 0x3f8cff, rot: 0xff2b2b } };

  // --- Caches (gemeinsame Instanzen) ---
  const cache = { karosserie: {}, rad: {}, material: {}, farbe: {}, schatten: null };

  // ------------------------------------------------------------
  // Standardwerte je Karosserie-Typ (werden von auto.form überschrieben)
  // Höhen = Anteil von hoehe, Längen = Anteil von laenge, x = Anteil der halben Breite
  // ------------------------------------------------------------
  const BASIS = {
    hoehe: 1.45, dachHoehe: 1, sill: 0.14, nase: 0.50, haubeH: 0.60, guertel: 0.64, deck: 0.68, heckH: 0.66,
    scheibeUnten: 0.30, dachVorn: 0.43, dachHinten: 0.66, heckscheibeEnde: 0.82, heckTyp: 'stufe', dachAbfall: 0,
    frontNeigung: 0.07, heckNeigung: 0.08, unterNeigung: 0.06, eckVorn: 0.28, eckHinten: 0.26,
    huefteV: 0, huefteH: 0, kotfluegel: 0.08, schulterX: 0.925, wolbung: 0.025, haubenBuckel: 0, tumble: 0.16,
    tueren: 4, tuerFugen: null, fenster: null, fensterleiste: 'lack', schwarzeSaeulen: false,
    kontrastdach: false, zweifarbig: false, verkleidung: false, tornado: false, cabrio: false,
    spiegelFarbe: 'lack', griffFarbe: 'lack', felgeFarbe: 0xc9ced6,
    licht: { form: 'eckig', x: 0.70, y: 0.48, b: 0.36, h: 0.11 }, tfl: 'linie', grill: 'quer', einlass: null, nebel: false,
    rueck: { form: 'eckig', y: 0.62, h: 0.10, x0: 0.50, x1: 0.98 }, endrohre: { n: 2, form: 'rund', x: 0.6 },
    spoiler: null, dachreling: false, diffusor: false, kennzeichenY: 0.27, kennzeichenHY: 0.50,
  };
  const TYP_STANDARD = {
    limousine: {},
    kombi: { heckTyp: 'steil', dachHinten: 0.93, heckscheibeEnde: 0.985, heckNeigung: 0.15, dachreling: true,
      rueck: { form: 'kombi', y: 0.66, h: 0.08, x0: 0.42, x1: 0.98 }, spoiler: 'dach' },
    coupe: { hoehe: 1.39, tueren: 2, scheibeUnten: 0.35, dachVorn: 0.48, dachHinten: 0.66, heckscheibeEnde: 0.85 },
    sportwagen: { hoehe: 1.30, tueren: 2, heckTyp: 'fliess', nase: 0.45, haubeH: 0.55, guertel: 0.62, deck: 0.66,
      dachHinten: 0.56, heckscheibeEnde: 0.80, tumble: 0.22, spoiler: 'lippe' },
    kleinwagen: { hoehe: 1.42, tueren: 2, heckTyp: 'steil', dachHinten: 0.95, heckscheibeEnde: 0.99, heckNeigung: 0.06,
      licht: { form: 'rund', x: 0.64, y: 0.53, b: 0.24 } },
    van: { hoehe: 1.97, heckTyp: 'steil', scheibeUnten: 0.18, dachVorn: 0.31, dachHinten: 0.975, heckscheibeEnde: 0.995,
      nase: 0.50, haubeH: 0.585, guertel: 0.585, tumble: 0.07, frontNeigung: 0.12 },
    suv: { hoehe: 1.65, sill: 0.17, nase: 0.55, haubeH: 0.62, guertel: 0.63, deck: 0.64, heckH: 0.62, heckTyp: 'steil',
      dachHinten: 0.93, heckscheibeEnde: 0.985, heckNeigung: 0.16, verkleidung: true, dachreling: true, spoiler: 'dach',
      rueck: { form: 'eckig', y: 0.64, h: 0.09, x0: 0.50, x1: 0.98 } },
    // Monoposto: eigener Bauplan (baueFormel), die Loft-Werte oben gelten hier nicht
    formel: { hoehe: 0.95, felgeFarbe: 0x2a2d33, nummer: 1, helm: 0xffcc1a },
    cabrio: { hoehe: 1.52, cabrio: true, tueren: 2, sill: 0.165, nase: 0.56, haubeH: 0.655, guertel: 0.67, deck: 0.66,
      heckH: 0.645, scheibeUnten: 0.335, dachVorn: 0.445, dachHoehe: 0.93, verdeck: [0.80, 0.93], verkleidung: true },
  };

  // ------------------------------------------------------------
  // Kleine Helfer
  // ------------------------------------------------------------
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const smooth = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
  /** Kosinus-Fenster: 1 bei d = 0, 0 ab |d| >= w. */
  const kosFenster = (d, w) => (Math.abs(d) < w ? 0.5 + 0.5 * Math.cos(Math.PI * d / w) : 0);

  /** Stückweise Kurve durch [[z, y], …] mit weichen (smoothstep) Übergängen. */
  function kurve(punkte, z) {
    if (z <= punkte[0][0]) return punkte[0][1];
    for (let i = 0; i < punkte.length - 1; i++) {
      const a = punkte[i], b = punkte[i + 1];
      if (z <= b[0]) return lerp(a[1], b[1], smooth((z - a[0]) / (b[0] - a[0])));
    }
    return punkte[punkte.length - 1][1];
  }
  /** Hex-Farbe aufhellen/abdunkeln (Faktor je Kanal). */
  function farbeMal(hex, f) {
    const r = clamp(Math.round(((hex >> 16) & 255) * f), 0, 255);
    const g = clamp(Math.round(((hex >> 8) & 255) * f), 0, 255);
    const b = clamp(Math.round((hex & 255) * f), 0, 255);
    return (r << 16) | (g << 8) | b;
  }
  function farbObjekt(hex) {
    if (!cache.farbe[hex]) cache.farbe[hex] = new THREE.Color(hex);
    return cache.farbe[hex];
  }

  // ------------------------------------------------------------
  // Sammler: Dreiecke mit Normalen und Vertex-Farben -> EINE BufferGeometry
  // ------------------------------------------------------------
  function Sammler() { this.p = []; this.n = []; this.c = []; }
  Sammler.prototype = {
    ecke(p, n, col) {
      this.p.push(p[0], p[1], p[2]); this.n.push(n[0], n[1], n[2]); this.c.push(col.r, col.g, col.b);
    },
    /** Dreieck mit eigenen Normalen (glatt) oder Flächennormale (n weglassen). */
    dreieck(a, b, c, farbe, na, nb, nc) {
      const col = farbObjekt(farbe);
      if (!na) {
        const n = flaechenNormale(a, b, c);
        na = nb = nc = n;
      }
      this.ecke(a, na, col); this.ecke(b, nb, col); this.ecke(c, nc, col);
    },
    /** Dreieck, dessen Vorderseite garantiert in Richtung „soll" zeigt. */
    dreieckNach(a, b, c, soll, farbe) {
      const n = flaechenNormale(a, b, c);
      if (n[0] * soll[0] + n[1] * soll[1] + n[2] * soll[2] < 0) this.dreieck(a, c, b, farbe);
      else this.dreieck(a, b, c, farbe);
    },
    viereckNach(a, b, c, d, soll, farbe) { this.dreieckNach(a, b, c, soll, farbe); this.dreieckNach(a, c, d, soll, farbe); },
    /** Fertige THREE-Geometrie übernehmen (wird danach freigegeben). */
    geo(g, farbe) {
      const ng = g.index ? g.toNonIndexed() : g;
      if (!ng.attributes.normal) ng.computeVertexNormals();
      const p = ng.attributes.position.array, n = ng.attributes.normal.array;
      const col = farbObjekt(farbe);
      for (let i = 0; i < p.length; i++) { this.p.push(p[i]); this.n.push(n[i]); }
      for (let i = 0; i < p.length / 3; i++) this.c.push(col.r, col.g, col.b);
      if (ng !== g) ng.dispose();
      g.dispose();
    },
    fertig() {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.p), 3));
      geo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(this.n), 3));
      geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(this.c), 3));
      geo.computeBoundingSphere();
      geo.computeBoundingBox();
      return geo;
    },
  };
  function flaechenNormale(a, b, c) {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    let x = uy * vz - uz * vy, y = uz * vx - ux * vz, z = ux * vy - uy * vx;
    const l = Math.hypot(x, y, z) || 1;
    return [x / l, y / l, z / l];
  }

  // --- Platzieren von Teilgeometrien (Drehung in Reihenfolge Gieren → Nicken) ---
  const _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _eu = new THREE.Euler();
  const _p = new THREE.Vector3(), _sk = new THREE.Vector3();
  function setze(g, x, y, z, rx, ry, rz, sx, sy, sz) {
    _eu.set(rx || 0, ry || 0, rz || 0, 'YXZ');
    _q.setFromEuler(_eu);
    _m4.compose(_p.set(x, y, z), _q, _sk.set(sx || 1, sy || 1, sz || 1));
    g.applyMatrix4(_m4);
    return g;
  }
  function quader(S, farbe, x, y, z, w, h, d, rx, ry, rz) {
    S.geo(setze(new THREE.BoxGeometry(w, h, d), x, y, z, rx, ry, rz), farbe);
  }

  // --- 2D-Umrisse (lokal x/y, Mitte 0/0) ---
  function kreisPunkte(r, n, cx, cy, sx) {
    const a = [];
    for (let i = 0; i < n; i++) {
      const w = (2 * Math.PI * i) / n;
      a.push([(cx || 0) + r * Math.cos(w) * (sx || 1), (cy || 0) + r * Math.sin(w)]);
    }
    return a;
  }
  function rechteckRund(b, h, r, cx, cy) {
    r = Math.min(r, b / 2 - 0.001, h / 2 - 0.001);
    cx = cx || 0; cy = cy || 0;
    const a = [], ecken = [[b / 2 - r, -h / 2 + r, -90], [b / 2 - r, h / 2 - r, 0], [-b / 2 + r, h / 2 - r, 90], [-b / 2 + r, -h / 2 + r, 180]];
    ecken.forEach(([ex, ey, w0]) => {
      for (let i = 0; i <= 2; i++) {
        const w = (w0 + i * 45) * Math.PI / 180;
        a.push([cx + ex + r * Math.cos(w), cy + ey + r * Math.sin(w)]);
      }
    });
    return a;
  }
  function umriss(punkte, loecher) {
    const s = new THREE.Shape(punkte.map(([x, y]) => new THREE.Vector2(x, y)));
    (loecher || []).forEach((l) => s.holes.push(new THREE.Path(l.map(([x, y]) => new THREE.Vector2(x, y)))));
    return s;
  }
  /** Flaches Teil: Umriss mit Tiefe; ragt bei 'vorn' nach -z, bei 'hinten' nach +z aus dem Ursprung. */
  function platte(punkte, tiefe, seite, loecher) {
    const g = new THREE.ExtrudeGeometry(umriss(punkte, loecher), { depth: tiefe, bevelEnabled: false, curveSegments: 4 });
    if (seite === 'vorn') g.translate(0, 0, -tiefe);
    return g;
  }

  // ------------------------------------------------------------
  // Modell: alle Maße in Metern aus Katalog + Typ-Standard
  // ------------------------------------------------------------
  function modell(auto) {
    const typ = TYP_STANDARD[auto.karosserie] ? auto.karosserie : 'limousine';
    const f = Object.assign({}, BASIS, TYP_STANDARD[typ], auto.form || {});
    const a = auto.abmessungen || {};
    const fw = auto.fahrwerte || {};
    const L = a.laenge || fw.laenge || 4.4, B = a.breite || fw.breite || 1.8, H = a.hoehe || f.hoehe;
    const RS = a.radstand || L * 0.6;
    const uv = a.ueberhangVorn || (L - RS) * 0.48;
    const rV = a.radRadius || Math.max(0.3, H * 0.22), rH = a.radRadiusHinten || rV;
    const M = {
      typ, f, L, B, H,
      zF: -L / 2, zR: L / 2,
      rV, rH, wV: a.radBreite || 0.225, wH: a.radBreiteHinten || a.radBreite || 0.225,
      zollV: a.felgeZoll || 17, zollH: a.felgeZollHinten || a.felgeZoll || 17,
      farbe: auto.farbe !== undefined ? auto.farbe : 0x2255cc,
      farbe2: auto.farbe2,
    };
    M.zVA = M.zF + uv; M.zHA = M.zVA + RS;
    const spalt = f.radSpalt !== undefined ? f.radSpalt : 0.055;      // optional: engerer Radlauf
    M.archV = rV + spalt; M.archH = rH + spalt;
    M.sill = f.sill * H; M.nase = f.nase * H; M.haubeH = f.haubeH * H; M.guertel = f.guertel * H;
    M.deck = f.deck * H; M.heckH = f.heckH * H;
    M.zWS = M.zF + f.scheibeUnten * L; M.zDV = M.zF + f.dachVorn * L;
    M.zDH = M.zF + (f.dachHinten || 0.66) * L; M.zEnd = M.zF + (f.heckscheibeEnde || 0.82) * L;
    M.kronK = 0.03;                                  // Dachwölbung quer
    M.Htop = (f.dachHoehe || 1) * H - M.kronK;
    M.hw0 = B / 2 - Math.max(f.huefteV, f.huefteH);  // halbe Grundbreite ohne Hüften
    // Farben
    const lack = M.farbe;
    M.lack = lack;
    M.dach = f.kontrastdach || f.zweifarbig ? (M.farbe2 !== undefined ? M.farbe2 : lack) : lack;
    M.oben = f.zweifarbig && M.farbe2 !== undefined ? M.farbe2 : lack;   // Kabine/Säulen
    M.saeuleA = f.schwarzeSaeulen ? FARBE.SCHWARZ : M.oben;
    M.saeuleB = FARBE.SCHWARZ;
    M.saeuleC = f.schwarzeSaeulen ? FARBE.SCHWARZ : M.oben;
    M.leiste = f.fensterleiste === 'chrom' ? FARBE.CHROM : f.fensterleiste === 'schwarz' ? FARBE.SCHWARZ : M.oben;
    M.fuge = farbeMal(lack, 0.35);
    M.lackHell = farbeMal(lack, 1.3);
    M.lackDunkel = farbeMal(lack, 0.75);

    // Fensterflächen (absolute z), Standard aus Türzahl
    const t = (v) => M.zF + v * L;
    let fenster = f.fenster;
    if (!fenster) {
      const ende = f.heckTyp === 'steil' ? f.dachHinten - 0.04 : f.dachHinten + (f.heckscheibeEnde - f.dachHinten) * 0.3;
      if (f.tueren >= 4) {
        const mitte = (f.scheibeUnten + f.dachHinten) / 2 + 0.02;
        fenster = [[f.scheibeUnten + 0.01, mitte - 0.012], [mitte + 0.012, ende]];
      } else fenster = [[f.scheibeUnten + 0.01, ende]];
    }
    M.fenster = f.cabrio ? [] : fenster.map(([a0, a1]) => [t(a0), t(a1)]);

    // Türfugen (absolute z)
    let fugen;
    if (f.tuerFugen) fugen = f.tuerFugen.map(t);
    else {
      const vorn = Math.max(M.zWS - 0.05, M.zVA + M.archV + 0.05);
      const hintenMax = M.zHA - M.archH - 0.04;
      if (f.tueren >= 4) {
        const b = M.fenster.length > 1 ? (M.fenster[0][1] + M.fenster[1][0]) / 2 : (vorn + hintenMax) / 2;
        fugen = [vorn, b, hintenMax];
      } else fugen = [vorn, Math.min(vorn + (L < 4 ? 1.05 : 1.2), hintenMax)];
    }
    M.fugen = fugen.filter((z) => z > M.zVA + M.archV + 0.01 && z < M.zHA - M.archH - 0.01);
    return M;
  }

  // ------------------------------------------------------------
  // Unterbau-Profile (alle Funktionen von z)
  // ------------------------------------------------------------
  function achsen(M) {
    return [{ zc: M.zVA, r: M.rV, R: M.archV, w: M.wV, vorn: true }, { zc: M.zHA, r: M.rH, R: M.archH, w: M.wH, vorn: false }];
  }
  /** Mittellinie oben (Haube, Gürtel unter der Kabine, Kofferraum/Heckdeckel). */
  function mitteProfil(M) {
    const f = M.f, p = [];
    p.push([M.zF, M.nase - 0.05], [M.zF + 0.05, M.nase - 0.012], [M.zF + 0.2, lerp(M.nase, M.haubeH, 0.35)]);
    p.push([M.zWS, M.haubeH], [M.zWS + 0.35, M.guertel]);
    if (f.heckTyp === 'steil') {
      p.push([M.zR - 0.25, M.guertel], [M.zR - 0.04, M.heckH], [M.zR, M.heckH - 0.04]);
    } else {
      p.push([M.zEnd - 0.12, M.guertel], [M.zEnd, M.deck], [M.zR - 0.16, M.heckH], [M.zR - 0.035, M.heckH - 0.015], [M.zR, M.heckH - 0.06]);
    }
    // nur streng steigende z behalten
    const q = [p[0]];
    for (let i = 1; i < p.length; i++) if (p[i][0] > q[q.length - 1][0] + 0.02) q.push(p[i]);
    return q;
  }
  function mitte(M, z) { return kurve(M._mitte, z); }
  function wolbung(M, z) {
    let w = M.f.wolbung;
    if (M.f.haubenBuckel && z < M.zWS) w += M.f.haubenBuckel * kosFenster(z - (M.zF + M.zWS) / 2 - 0.1, (M.zWS - M.zF) * 0.55);
    return w;
  }
  /** Oberkante der Kotflügel über den Rädern (Kotflügel-Wölbung). */
  function kotfluegel(M, z) {
    let y = -1;
    achsen(M).forEach((a) => {
      const u = (z - a.zc) / (a.R * (M.f.kotfluegelBreite || 1.8));       // optional: breiterer/schmalerer Buckel
      const k = !a.vorn && M.f.kotfluegelH !== undefined ? M.f.kotfluegelH : M.f.kotfluegel;   // optional: hinten eigene Höhe (Hüften)
      if (Math.abs(u) < 1) y = Math.max(y, a.r + a.R * Math.sqrt(1 - u * u) + k);
    });
    return y;
  }
  function schulter(M, z) { return Math.max(mitte(M, z) - 0.02, kotfluegel(M, z)); }
  /** Unterkante der Seitenwand: Schweller oder Radausschnitt. */
  function unterkante(M, z, bogen) {
    if (bogen === 'aussen') return M.sill;
    for (const a of achsen(M)) {
      const dz = z - a.zc;
      if (bogen === 'innen' && Math.abs(Math.abs(dz) - a.R) < 1e-6) return a.r;
      if (Math.abs(dz) < a.R) return a.r + Math.sqrt(a.R * a.R - dz * dz);
    }
    const d = Math.min(z - M.zF, M.zR - z);
    return M.sill + (d < 0.3 ? 0.05 * (1 - d / 0.3) : 0);
  }
  /** Halbe Breite in Länge z; g = Gewicht der Hüften (0 oben … 1 Flankenmitte). */
  function halbBreite(M, z, g) {
    const f = M.f;
    let hw = M.hw0 + g * Math.max(f.huefteV * kosFenster(z - M.zVA, f.huefteVBreite || 0.95), f.huefteH * kosFenster(z - M.zHA, f.huefteHBreite || 1.05));
    const dv = z - M.zF, dh = M.zR - z;
    const ecke = (d, rc) => (d < rc ? rc * (1 - Math.sqrt(Math.max(0, 1 - (1 - d / rc) * (1 - d / rc)))) : 0);
    hw -= ecke(dv, f.eckVorn) + ecke(dh, f.eckHinten);
    return hw;
  }
  /** Mulden-Gewicht (offener Innenraum beim Cabrio). */
  function muldeGewicht(M, z) {
    if (!M.f.cabrio) return 0;
    const z0 = M.zWS + 0.10, z1 = M.zF + M.f.verdeck[0] * M.L - 0.02;
    return smooth((z - z0) / 0.1) * smooth((z1 - z) / 0.1);
  }
  /** z-Versatz an Front/Heck (Neigung der Stirnflächen). */
  function endVersatz(M, z, y) {
    const f = M.f, D = 0.45;
    let dz = 0;
    const dv = z - M.zF, dh = M.zR - z;
    if (dv < D) {
      const yRef = M.sill + (M.nase - M.sill) * 0.45;
      const o = y > yRef ? f.frontNeigung * Math.pow((y - yRef) / Math.max(0.1, M.haubeH - yRef), 1.3)
        : f.unterNeigung * (yRef - y) / Math.max(0.05, yRef - M.sill);
      dz += o * (1 - dv / D);
    }
    if (dh < D) {
      const yRef = M.sill + (M.heckH - M.sill) * 0.4;
      const o = y > yRef ? f.heckNeigung * Math.pow((y - yRef) / Math.max(0.1, M.heckH - yRef), 1.3)
        : f.unterNeigung * (yRef - y) / Math.max(0.05, yRef - M.sill);
      dz -= o * (1 - dh / D);
    }
    return dz;
  }

  /** Halber Querschnitt (von unten zur Mitte, x >= 0) des Unterbaus an Station st. */
  function halbRingRumpf(M, st) {
    const z = st.z, f = M.f;
    const yU = unterkante(M, z, st.bogen);
    const yS = schulter(M, z);
    const yO = mitte(M, z) + wolbung(M, z);
    const b = (g) => halbBreite(M, z, g);
    const s = M.sill;
    const mw = muldeGewicht(M, z), md = 0.42;
    const h = [
      [b(0.6) * 0.955, yU],
      [b(0.9) * 0.99, yU + 0.05],
      [b(1), Math.max(yU + 0.08, lerp(s, yS, 0.40))],
      [b(1) * 0.993, Math.max(yU + 0.11, lerp(s, yS, 0.72))],
      [b(0.7) * 0.972, Math.max(yU + 0.13, yS - 0.04)],
      [b(0.4) * f.schulterX, Math.max(yU + 0.14, yS)],
    ];
    const ys = h[5][1];
    const n6 = [b(0.2) * Math.min(0.72, f.schulterX - 0.1), lerp(ys, yO, 0.62)];
    const n7 = [b(0) * 0.36, lerp(ys, yO, 0.93)];
    const n8 = [0, yO];
    const m6 = [b(0.2) * (f.schulterX - 0.05), ys - 0.01], m7 = [b(0.2) * (f.schulterX - 0.11), ys - md], m8 = [0, ys - md];
    const mix = (p, q) => [lerp(p[0], q[0], mw), lerp(p[1], q[1], mw)];
    h.push(mix(n6, m6), mix(n7, m7), mix(n8, m8));
    return h.map(([x, y]) => [x, y, z + endVersatz(M, z, y)]);
  }

  /** Stationen des Unterbaus (z-Werte, dicht an Enden, Radhäusern und Türfugen). */
  function rumpfStationen(M) {
    const st = [], fest = [];
    const neu = (z) => st.push({ z });
    // Enden (Rundung)
    [0, 0.012, 0.04, 0.085, 0.15, 0.23, 0.33, 0.45].forEach((d) => { neu(M.zF + d); neu(M.zR - d); });
    // Radhäuser: Kanten doppelt (außen = Schwellerhöhe, innen = Radmitte)
    achsen(M).forEach((a) => {
      fest.push({ z: a.zc - a.R, bogen: 'aussen', k: -1e-6 }, { z: a.zc - a.R, bogen: 'innen', k: 1e-6 });
      fest.push({ z: a.zc + a.R, bogen: 'innen', k: -1e-6 }, { z: a.zc + a.R, bogen: 'aussen', k: 1e-6 });
      [18, 45, 70, 90, 110, 135, 162].forEach((w) => neu(a.zc - a.R * Math.cos(w * Math.PI / 180)));
      neu(a.zc - a.R - 0.22); neu(a.zc + a.R + 0.22);
    });
    // Türfugen
    M.fugen.forEach((z) => { fest.push({ z: z - 0.006, k: 0 }, { z: z + 0.006, k: 0 }); });
    // Haube/Kabine/Cockpit
    neu(M.zWS); neu(M.zWS + 0.35); neu(M.zEnd);
    if (M.f.cabrio) { neu(M.zWS + 0.1); neu(M.zWS + 0.2); const v = M.zF + M.f.verdeck[0] * M.L; neu(v - 0.12); neu(v - 0.02); }
    // Füllen
    for (let z = M.zF + 0.5; z < M.zR - 0.5; z += 0.34) neu(z);
    // Zusammenführen: feste Stationen haben Vorrang, normale dürfen nicht zu dicht liegen
    const alle = fest.map((s) => Object.assign({}, s));
    st.sort((a, b) => a.z - b.z).forEach((s) => {
      if (s.z < M.zF - 1e-6 || s.z > M.zR + 1e-6) return;
      if (alle.some((q) => Math.abs(q.z - s.z) < (q.bogen || q.k === 0 ? 0.02 : 0.01))) return;
      alle.push({ z: s.z, k: 0 });
    });
    alle.sort((a, b) => (a.z + (a.k || 0)) - (b.z + (b.k || 0)));
    return alle;
  }

  // ------------------------------------------------------------
  // Loft: Ringe (Stationen × Ringpunkte) -> glatte Fläche mit Flächenfarben
  // ------------------------------------------------------------
  function loft(S, ringe, stationZ, farbeFn) {
    const ns = ringe.length, nr = ringe[0].length;
    const gleich = (i, k) => Math.abs(stationZ[i] - stationZ[k]) < 1e-5;
    const N = [];
    for (let i = 0; i < ns; i++) {
      N.push([]);
      const ip = i + 1 < ns && !gleich(i, i + 1) ? i + 1 : i;
      const im = i > 0 && !gleich(i, i - 1) ? i - 1 : i;
      for (let j = 0; j < nr; j++) {
        const jp = Math.min(nr - 1, j + 1), jm = Math.max(0, j - 1);
        const a = ringe[ip][j], b = ringe[im][j], c = ringe[i][jp], d = ringe[i][jm];
        let tS = [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
        if (Math.hypot(tS[0], tS[1], tS[2]) < 1e-7) tS = [0, 0, 1];
        const tR = [c[0] - d[0], c[1] - d[1], c[2] - d[2]];
        let n = [tS[1] * tR[2] - tS[2] * tR[1], tS[2] * tR[0] - tS[0] * tR[2], tS[0] * tR[1] - tS[1] * tR[0]];
        const l = Math.hypot(n[0], n[1], n[2]);
        n = l > 1e-9 ? [n[0] / l, n[1] / l, n[2] / l] : [0, 1, 0];
        N[i].push(n);
      }
    }
    for (let i = 0; i < ns - 1; i++) {
      for (let j = 0; j < nr - 1; j++) {
        const farbe = farbeFn(i, j);
        if (farbe === null) continue;
        const a = ringe[i][j], b = ringe[i + 1][j], c = ringe[i + 1][j + 1], d = ringe[i][j + 1];
        if (gleich(i, i + 1)) {          // Kante zweier gleicher Stationen: flach schattieren
          S.dreieck(a, b, c, farbe); S.dreieck(a, c, d, farbe);
          continue;
        }
        S.dreieck(a, b, c, farbe, N[i][j], N[i + 1][j], N[i + 1][j + 1]);
        S.dreieck(a, c, d, farbe, N[i][j], N[i + 1][j + 1], N[i][j + 1]);
      }
    }
  }
  /** Deckel (Fächer) über einen Ring, Vorderseite in Richtung soll. */
  function deckel(S, ring, soll, farbe) {
    const m = [0, 0, 0];
    ring.forEach((p) => { m[0] += p[0]; m[1] += p[1]; m[2] += p[2]; });
    m[0] /= ring.length; m[1] /= ring.length; m[2] /= ring.length;
    for (let j = 0; j < ring.length; j++) S.dreieckNach(m, ring[j], ring[(j + 1) % ring.length], soll, farbe);
  }
  /** Halbring (x >= 0, unten → Mitte) zu vollem Ring links → rechts spiegeln. */
  function vollRing(halb) {
    const links = halb.slice(0, -1).map(([x, y, z]) => [-x, y, z]);
    const rechts = halb.slice(0, -1).reverse();
    return links.concat([halb[halb.length - 1]], rechts);
  }

  // ------------------------------------------------------------
  // Flächenabfragen (für das Anbringen von Teilen)
  // ------------------------------------------------------------
  /** Äußerster Schnitt eines Halbrings mit der Höhe y -> {x, z} oder null. */
  function ringBeiY(halb, y) {
    let best = null;
    for (let i = 0; i < halb.length - 1; i++) {
      const a = halb[i], b = halb[i + 1];
      if (a[1] === b[1] || (y - a[1]) * (y - b[1]) > 0) continue;
      const t = (y - a[1]) / (b[1] - a[1]);
      const x = lerp(a[0], b[0], t);
      if (!best || x > best.x) best = { x, z: lerp(a[2], b[2], t) };
    }
    return best;
  }
  /** z der Front-/Heckfläche an (x, y), oder null. */
  function flaecheZ(K, seite, x, y) {
    const liste = seite === 'vorn' ? K.halb : K.halbRueck;
    const ax = Math.abs(x);
    let prev = null;
    for (const h of liste) {
      const p = ringBeiY(h, y);
      if (!p) { prev = null; continue; }
      if (ax <= p.x) {
        if (!prev) return p.z;
        const t = clamp((ax - prev.x) / ((p.x - prev.x) || 1e-6), 0, 1);
        return lerp(prev.z, p.z, t);
      }
      prev = p;
    }
    return null;
  }
  /** x der Seitenwand (Unterbau) an (z, y). */
  function seitenX(K, z, y) {
    const st = K.stationen;
    let i = 0;
    while (i < st.length - 2 && st[i + 1].z < z) i++;
    const a = ringBeiY(K.halb[i], y), b = ringBeiY(K.halb[i + 1], y);
    if (!a && !b) return halbBreite(K.M, z, 1);
    if (!a || !b) return (a || b).x;
    const t = clamp((z - st[i].z) / ((st[i + 1].z - st[i].z) || 1e-6), 0, 1);
    return lerp(a.x, b.x, t);
  }
  /** Höhe der Oberseite an (z, x) für Unterbau (K.halb) oder Kabine (K.kabHalb). */
  function obenY(K, z, x, kabine) {
    const halbe = kabine ? K.kabHalb : K.halb, zs = kabine ? K.kabZ : K.stationen.map((s) => s.z);
    let i = 0;
    while (i < zs.length - 2 && zs[i + 1] < z) i++;
    const yBei = (h) => {
      let y = null;
      const ax = Math.abs(x);
      for (let k = 0; k < h.length - 1; k++) {
        const a = h[k], b = h[k + 1];
        if ((ax - a[0]) * (ax - b[0]) > 0 || a[0] === b[0]) continue;
        const v = lerp(a[1], b[1], (ax - a[0]) / (b[0] - a[0]));
        if (y === null || v > y) y = v;
      }
      return y === null ? h[h.length - 1][1] : y;
    };
    const t = clamp((z - zs[i]) / ((zs[i + 1] - zs[i]) || 1e-6), 0, 1);
    return lerp(yBei(halbe[i]), yBei(halbe[i + 1]), t);
  }
  /** Lage + Ausrichtung für ein Anbauteil auf Front/Heck an (x, y). */
  function anbau(K, seite, x, y) {
    const d = 0.03;
    const z0 = flaecheZ(K, seite, x, y);
    if (z0 === null) return null;              // keine Fläche dort: Teil weglassen statt schweben lassen
    const zl = flaecheZ(K, seite, x - d, y), zr = flaecheZ(K, seite, x + d, y);
    const zu = flaecheZ(K, seite, x, y - d), zo = flaecheZ(K, seite, x, y + d);
    const dzdx = zl !== null && zr !== null ? clamp((zr - zl) / (2 * d), -3, 3) : 0;
    const dzdy = zu !== null && zo !== null ? clamp((zo - zu) / (2 * d), -3, 3) : 0;
    return { x, y, z: z0, ry: clamp(-Math.atan(dzdx), -0.95, 0.95), rx: Math.atan(dzdy) };
  }
  /** Flaches Teil auf Front/Heck setzen; vor = wie weit die Sichtfläche über die Karosserie ragt. */
  function anbauTeil(S, K, farbe, seite, x, y, punkte, vor, tiefe, loecher, kipp) {
    tiefe = tiefe || 0.06;
    const a = anbau(K, seite, x, y);
    if (!a) return;
    const g = platte(punkte, tiefe, seite, loecher);
    const zz = seite === 'vorn' ? a.z + (tiefe - vor) : a.z - (tiefe - vor);
    S.geo(setze(g, a.x, a.y, zz, a.rx + (kipp || 0) * (seite === 'vorn' ? 1 : -1), a.ry, 0), farbe);
  }
  /** Einseitiges flaches Teil (nur Vorderfläche, 2 Dreiecke je Viereck) auf Front/Heck – für Emblem und Schrift. */
  function anbauFlach(S, K, farbe, seite, x, y, punkte, vor) {
    const a = anbau(K, seite, x, y);
    if (!a) return;
    const vorn = seite === 'vorn';
    const g = new THREE.ShapeGeometry(umriss(vorn ? punkte.map(([px, py]) => [-px, py]) : punkte));
    if (vorn) g.rotateY(Math.PI);                  // Vorderseite nach -z (Fahrtrichtung), x-Spiegelung vorher ausgeglichen
    S.geo(setze(g, a.x, a.y, vorn ? a.z - vor : a.z + vor, a.rx, a.ry, 0), farbe);
  }
  /** Flaches einseitiges Teil (lokale x/y-Punkte) auf einer Fläche: Mitte p, Flächennormale n, Abstand off entlang n. */
  const _vz = new THREE.Vector3(0, 0, 1), _vn = new THREE.Vector3(), _qn = new THREE.Quaternion();
  function flachSchraeg(S, farbe, p, n, punkte, off) {
    const g = new THREE.ShapeGeometry(umriss(punkte));
    g.applyQuaternion(_qn.setFromUnitVectors(_vz, _vn.set(n[0], n[1], n[2])));
    g.translate(p[0] + n[0] * off, p[1] + n[1] * off, p[2] + n[2] * off);
    S.geo(g, farbe);
  }
  /** Leiste aus Segmenten, die der gewölbten Front/Heck folgt (x0 < x1). */
  function anbauLeiste(S, K, farbe, seite, x0, x1, y, h, vor, n) {
    // Bogenlänge abschätzen: an gerundeten Ecken braucht es mehr, kürzere Segmente
    let bogen = 0, zp = null;
    for (let i = 0; i <= 16; i++) {
      const x = lerp(x0, x1, i / 16), z = flaecheZ(K, seite, x, y);
      if (z !== null && zp !== null) bogen += Math.hypot((x1 - x0) / 16, z - zp);
      else if (i > 0) bogen += Math.abs(x1 - x0) / 16;
      zp = z;
    }
    n = Math.min(12, Math.max(n || 1, Math.ceil(bogen / (K.M.f.leistenSeg || 0.09))));   // leistenSeg: optional gröbere Segmente (weniger Dreiecke)
    for (let i = 0; i < n; i++) {
      const xa = lerp(x0, x1, i / n), xb = lerp(x0, x1, (i + 1) / n);
      const za = flaecheZ(K, seite, xa, y), zb = flaecheZ(K, seite, xb, y);
      const lang = za !== null && zb !== null ? Math.hypot(xb - xa, zb - za) : xb - xa;
      const b2 = (lang + 0.004) / 2, h2 = h / 2;
      anbauTeil(S, K, farbe, seite, (xa + xb) / 2, y, [[-b2, -h2], [b2, -h2], [b2, h2], [-b2, h2]], vor, 0.04);
    }
  }

  /** Flache einseitige Leiste auf Front/Heck (wie anbauLeiste, aber nur 2 Dreiecke je Segment) – für Dekor und Aufkleber. */
  function anbauLeisteFlach(S, K, farbe, seite, x0, x1, y, h, vor, n) {
    for (let i = 0; i < n; i++) {
      const xa = lerp(x0, x1, i / n), xb = lerp(x0, x1, (i + 1) / n);
      const za = flaecheZ(K, seite, xa, y), zb = flaecheZ(K, seite, xb, y);
      const lang = za !== null && zb !== null ? Math.hypot(xb - xa, zb - za) : xb - xa;
      const b2 = (lang + 0.004) / 2, h2 = h / 2;
      anbauFlach(S, K, farbe, seite, (xa + xb) / 2, y, [[-b2, -h2], [b2, -h2], [b2, h2], [-b2, h2]], vor);
    }
  }
  /** Flache Fläche auf der Seitenwand (beide Seiten, z0 < z1, y0 < y1), folgt der Wölbung der Flanke. */
  function seitenFlaeche(S, K, farbe, z0, z1, y0, y1, n, vor) {
    [-1, 1].forEach((s) => {
      for (let i = 0; i < n; i++) {
        const za = lerp(z0, z1, i / n), zb = lerp(z0, z1, (i + 1) / n);
        const p = (z, y) => [s * (seitenX(K, z, y) + vor), y, z];
        S.viereckNach(p(za, y0), p(zb, y0), p(zb, y1), p(za, y1), [s, 0, 0], farbe);
      }
    });
  }
  /** Punkt auf der schrägen Heckscheibe (Kabine) bei Breite x und Höhe y -> { z, rx } (Nicken der Scheibenebene). */
  function heckScheibe(K, x, y) {
    const M = K.M;
    let a = M.zDH, b = M.zEnd;
    for (let i = 0; i < 16; i++) { const m = (a + b) / 2; if (obenY(K, m, x, true) > y) a = m; else b = m; }
    const z = (a + b) / 2, d = 0.02;
    const sl = (obenY(K, z + d, x, true) - obenY(K, z - d, x, true)) / (2 * d);
    return { z, rx: sl < -0.01 ? Math.atan(1 / sl) : 0 };
  }
  /** Flaches Teil (Umriss in lokalen x/y) auf der Heckscheibe, Mitte bei (x, y). */
  function heckScheibeTeil(S, K, farbe, x, y, punkte, vor) {
    const h = heckScheibe(K, x, y);
    S.geo(setze(new THREE.ShapeGeometry(umriss(punkte)), x, y, h.z + vor, h.rx, 0, 0), farbe);
  }

  // ------------------------------------------------------------
  // 1. Unterbau
  // ------------------------------------------------------------
  function baueRumpf(S, K) {
    const M = K.M, f = M.f;
    const st = rumpfStationen(M);
    K.stationen = st;
    K.halb = st.map((s) => halbRingRumpf(M, s));
    K.halbRueck = K.halb.slice().reverse();
    const ringe = K.halb.map(vollRing);
    const zs = st.map((s) => s.z);
    const nr = ringe[0].length, mitteJ = (nr - 1) / 2;
    const inBogen = (z) => achsen(M).some((a) => Math.abs(z - a.zc) < a.R + 0.005);
    const inFuge = (z) => M.fugen.some((q) => Math.abs(z - q) < 0.0065);
    loft(S, ringe, zs, (i, j) => {
      const zm = (zs[i] + zs[i + 1]) / 2;
      const k = j < mitteJ ? j : nr - 2 - j;            // Segment im Halbring (0 = unten)
      const ende = zm < M.zF + 0.33 || zm > M.zR - 0.33;
      if (Math.abs(zs[i] - zs[i + 1]) < 1e-5) return f.verkleidung ? FARBE.KUNSTSTOFF : M.lackDunkel;
      if (k === 0) return inBogen(zm) && !f.verkleidung ? M.lack : FARBE.KUNSTSTOFF;
      if (k === 1 && f.verkleidung) return FARBE.KUNSTSTOFF;
      if (k >= 1 && k <= 4 && inFuge(zm)) return M.fuge;
      // Seitenstreifen (z. B. Streifenwagen): Farbe je Flanken-Segment k, nicht um die Ecken herum
      if (f.flankenStreifen && f.flankenStreifen[k] !== undefined && zm > M.zF + 0.3 && zm < M.zR - 0.3) {
        const sf = f.flankenStreifen[k];
        return sf === 'farbe2' ? (M.farbe2 !== undefined ? M.farbe2 : M.lack) : sf;
      }
      if (k === 4 && f.tornado && !ende) return M.lackHell;
      if (k >= 6 && muldeGewicht(M, zm) > 0.5) return FARBE.INNEN;
      return M.lack;
    });
    deckel(S, ringe[0], [0, 0, -1], M.lack);
    deckel(S, ringe[ringe.length - 1], [0, 0, 1], M.lack);
  }

  // ------------------------------------------------------------
  // 2. Kabine (Glashaus)
  // ------------------------------------------------------------
  function kabinenHoehe(M, z, yb) {
    const f = M.f;
    if (z <= M.zDV) {
      const u = clamp((z - M.zWS) / (M.zDV - M.zWS), 0, 1);
      return lerp(yb, M.Htop, u + (f.scheibeWoelb !== undefined ? f.scheibeWoelb : 0.25) * u * (1 - u));   // optional: scheibeWoelb = Wölbung der Frontscheibe (Standard 0,25)
    }
    const dachHinten = M.Htop - f.dachAbfall * M.H;
    if (z <= M.zDH) {
      const u = (z - M.zDV) / (M.zDH - M.zDV);
      return M.Htop - f.dachAbfall * M.H * Math.pow(u, 1.5) + 0.012 * Math.sin(Math.PI * u);
    }
    const u = clamp((z - M.zDH) / (M.zEnd - M.zDH), 0, 1);
    const e = f.heckTyp === 'steil' ? u : f.heckTyp === 'fliess' ? Math.pow(u, 1.5) : Math.pow(u, 1.25);
    return lerp(dachHinten, yb, e);
  }
  function baueKabine(S, K) {
    const M = K.M, f = M.f;
    const GLAS = M.glas !== undefined ? M.glas : FARBE.GLAS;     // optional (Verdeck): hellere Scheiben
    const wichtig = [M.zWS, M.zDV, M.zDH, M.zEnd];
    M.fenster.forEach(([a, b]) => { wichtig.push(a, b); });
    const weitere = [];
    [0.12, 0.3, 0.5, 0.7, 0.87].forEach((u) => weitere.push(lerp(M.zWS, M.zDV, u)));
    const nDach = Math.max(2, Math.ceil((M.zDH - M.zDV) / 0.22));
    for (let i = 1; i < nDach; i++) weitere.push(lerp(M.zDV, M.zDH, i / nDach));
    [0.15, 0.32, 0.5, 0.68, 0.85].forEach((u) => weitere.push(lerp(M.zDH, M.zEnd, u)));
    const zs = [];
    wichtig.forEach((z) => { if (z >= M.zWS - 1e-6 && z <= M.zEnd + 1e-6 && !zs.some((q) => Math.abs(q - z) < 0.004)) zs.push(z); });
    weitere.forEach((z) => { if (!zs.some((q) => Math.abs(q - z) < 0.03)) zs.push(z); });
    zs.sort((a, b) => a - b);
    const hRef = Math.max(0.2, M.H - M.guertel);
    K.kabZ = zs;
    K.kabHalb = zs.map((z) => {
      const yb = schulter(M, z) - 0.004;
      const yt = Math.max(yb, kabinenHoehe(M, z, yb));
      const h = yt - yb;
      const wb = halbBreite(M, z, 0.4) * f.schulterX - 0.025;
      let wt = wb - f.tumble * clamp(h / hRef, 0, 1);
      if (f.heckVerjuengung && z > M.zDH) wt *= 1 - f.heckVerjuengung * smooth((z - M.zDH) / (M.zEnd - M.zDH));   // optional: Dach läuft nach hinten schmaler zu
      const kr = M.kronK * clamp(h / 0.25, 0, 1);
      return [
        [wb, yb - 0.015, z],
        [wb - f.tumble * 0.05, yb + Math.min(0.035, h * 0.3), z],
        [wt + 0.012, yt - Math.min(0.065, h * 0.4), z],
        [wt, yt - Math.min(0.018, h * 0.15), z],
        [wt * 0.86, yt + kr * 0.55, z],
        [wt * 0.45, yt + kr * 0.9, z],
        [0, yt + kr, z],
      ];
    });
    const ringe = K.kabHalb.map(vollRing);
    const nr = ringe[0].length, mitteJ = (nr - 1) / 2;
    const imFenster = (z) => M.fenster.some(([a, b]) => z > a && z < b);
    const ersteFenster = M.fenster.length ? M.fenster[0][0] : M.zDV;
    const letzteFenster = M.fenster.length ? M.fenster[M.fenster.length - 1][1] : M.zDH;
    loft(S, ringe, zs, (i, j) => {
      const zm = (zs[i] + zs[i + 1]) / 2;
      const k = j < mitteJ ? j : nr - 2 - j;
      const zone = zm < M.zDV ? 'vorn' : zm > M.zDH ? 'hinten' : 'dach';
      if (k === 0) return M.leiste;
      if (k === 1) {
        if (imFenster(zm)) return GLAS;
        if (zm < ersteFenster) return M.saeuleA;
        if (zm > letzteFenster) return M.saeuleC;
        return M.saeuleB;
      }
      if (f.heckGlas && zone === 'hinten' && (k <= 3 || zm < M.zDH + (M.zEnd - M.zDH) * f.heckGlas.oben)) return M.lack;   // Heckklappe: Lackrahmen um die Scheibe
      if (f.fensterRahmen && k === 2 && zm > M.zWS + 0.02 && zm < ersteFenster + 0.02 + (letzteFenster - ersteFenster)) return f.fensterRahmen === 'schwarz' ? FARBE.SCHWARZ : FARBE.CHROM;   // Chrom-Rahmen oberhalb der Seitenfenster
      if (k <= 3) return zone === 'vorn' ? M.saeuleA : zone === 'dach' ? M.dach : (f.heckTyp === 'steil' ? M.dach : M.saeuleC);
      if (f.heckGlasAb !== undefined && zone === 'hinten' && zm < M.zDH + (M.zEnd - M.zDH) * f.heckGlasAb) return M.dach;   // optional (Verdeck): Stoff bis zur kleinen Heckscheibe
      return zone === 'dach' ? M.dach : GLAS;
    });
    // Heck-Abschluss (bei steilem Heck bleibt eine kleine Stirnfläche)
    deckel(S, ringe[ringe.length - 1], [0, 0, 1], GLAS);
  }

  // ------------------------------------------------------------
  // 2b. Cabrio: Frontscheibe mit Rahmen, Innenraum, Verdeckpaket
  // ------------------------------------------------------------
  function baueCabrio(S, K) {
    const M = K.M, f = M.f;
    const yb = schulter(M, M.zWS) - 0.01, yt = M.Htop + M.kronK;
    const wb = halbBreite(M, M.zWS, 0.4) * f.schulterX - 0.03;
    const dz = M.zDV - M.zWS, dy = yt - yb, lang = Math.hypot(dz, dy);
    const neig = -Math.atan2(dy, dz);
    const zm = (M.zWS + M.zDV) / 2, ym = (yb + yt) / 2;
    quader(S, FARBE.GLAS_CABRIO, 0, ym, zm, 2 * wb - 0.1, 0.012, lang, neig);
    [-1, 1].forEach((s) => quader(S, FARBE.SCHWARZ, s * (wb - 0.035), ym, zm, 0.06, 0.05, lang + 0.02, neig));
    quader(S, FARBE.SCHWARZ, 0, yt - 0.012, M.zDV + 0.01, 2 * wb - 0.02, 0.05, 0.09);
    // Armaturenbrett und Lenkrad (Fahrer links = -x)
    const boden = yb - 0.42;
    const SITZ = f.sitzFarbe !== undefined ? f.sitzFarbe : FARBE.SITZ;     // optional: dunkle Sitze
    quader(S, FARBE.INNEN, 0, yb - 0.08, M.zWS + 0.2, 2 * wb - 0.16, 0.2, 0.32);
    const lr = setze(new THREE.TorusGeometry(0.17, 0.022, 4, 14), -0.36, yb + 0.06, M.zWS + 0.46, 0.45, 0, 0);
    S.geo(lr, FARBE.SCHWARZ);
    quader(S, FARBE.SCHWARZ, -0.36, yb + 0.0, M.zWS + 0.40, 0.05, 0.05, 0.16, 0.45);
    // Sitze (Fläche, Lehne, Kopfstütze)
    const zS = M.zWS + 0.86;
    [-0.36, 0.36].forEach((x) => {
      quader(S, SITZ, x, boden + 0.14, zS, 0.48, 0.12, 0.48);
      quader(S, SITZ, x, boden + 0.44, zS + 0.27, 0.48, 0.52, 0.12, 0.22);
      quader(S, SITZ, x, boden + 0.77, zS + 0.34, 0.26, 0.15, 0.1, 0.22);
    });
    const zH = zS + 0.72;
    quader(S, SITZ, 0, boden + 0.18, zH, 1.15, 0.12, 0.42);
    quader(S, SITZ, 0, boden + 0.46, zH + 0.22, 1.15, 0.48, 0.11, 0.18);
    [-0.32, 0.32].forEach((x) => quader(S, SITZ, x, boden + 0.76, zH + 0.27, 0.24, 0.14, 0.09, 0.18));
    // Verdeckpaket: abgerundeter Stoffwulst hinter der Rückbank
    const v0 = M.zF + f.verdeck[0] * M.L, v1 = M.zF + f.verdeck[1] * M.L;
    const yv = schulter(M, (v0 + v1) / 2);
    const vf = f.verdeckFlach !== undefined ? f.verdeckFlach : 1;   // optional: flacheres Verdeckpaket (Faktor auf die Wulsthöhe)
    const prof = [[v0 - 0.02, yv - 0.08], [v0, yv + 0.05 * vf], [v0 + 0.06, yv + 0.1 * vf], [lerp(v0, v1, 0.5), yv + 0.115 * vf], [v1 - 0.06, yv + 0.08 * vf], [v1, yv - 0.02], [v1, yv - 0.08]];
    const g = new THREE.ExtrudeGeometry(umriss(prof), { depth: 2 * wb - 0.06, bevelEnabled: false });
    g.translate(0, 0, -(2 * wb - 0.06) / 2);
    g.rotateY(-Math.PI / 2);
    S.geo(g, FARBE.VERDECK);
    // Überrollbügel (optional): zwei schlanke schwarze Bügel hinter den Rücksitz-Kopfstützen mit Querstrebe
    if (f.ueberrollbuegel) {
      // eigene Geometrie (K.buegel): nur bei offenem Verdeck sichtbar (bei geschlossenem Dach sind die Bügel „eingefahren“)
      const B = K.buegel = new Sammler(), zb = zH + 0.36, yu = boden + 0.9;
      [-0.32, 0.32].forEach((x) => {
        quader(B, FARBE.SCHWARZ, x, (boden + 0.5 + yu) / 2, zb, 0.05, yu - boden - 0.5, 0.05);
        quader(B, 0x3a3d44, x, yu + 0.012, zb, 0.06, 0.026, 0.06);
      });
      quader(B, FARBE.SCHWARZ, 0, yu, zb, 0.69, 0.04, 0.045);
    }
  }

  // ------------------------------------------------------------
  // 2c. Cabrio-Verdeck (geschlossen) als eigene Geometrie – wird in bauen() als eigenes Mesh in einer Gruppe um den Drehpunkt
  // gehängt und von dach.js auf-/zugeklappt. Nutzt die Kabinen-Schleife (baueKabine) mit anderen Maßen: Stoff schwarz, Seitenscheiben
  // (Tür + kleine hintere), kleine Heckscheibe, dazu zwei Glasdreiecke vor der Tür (unter dem Dachvorderrand).
  // form.dach = { hinten, ende (Anteile von laenge), fenster [[z0, z1], …] (Anteile), heckGlasAb (Anteil der Heckschräge ohne Glas) }
  // ------------------------------------------------------------
  function baueDach(M, K) {
    const f0 = M.f, dh = f0.dach;
    if (!f0.cabrio || !dh) return null;
    const t = (v) => M.zF + v * M.L;
    const f2 = Object.assign({}, f0, { cabrio: false, heckTyp: 'stufe', dachHinten: dh.hinten, heckscheibeEnde: dh.ende,
      heckGlasAb: dh.heckGlasAb, dachAbfall: dh.abfall || 0, heckVerjuengung: dh.heckVerjuengung !== undefined ? dh.heckVerjuengung : 0.08, tumble: 0.1, schwarzeSaeulen: true });
    const M2 = Object.assign({}, M, { f: f2, zWS: M.zDV - 0.03, zDH: t(dh.hinten), zEnd: t(dh.ende),
      fenster: (dh.fenster || []).map(([a, b]) => [Math.max(a * M.L + M.zF, M.zDV - 0.02), t(b)]),
      glas: 0x3b4d62, dach: FARBE.VERDECK, saeuleA: FARBE.SCHWARZ, saeuleB: FARBE.VERDECK, saeuleC: FARBE.VERDECK, leiste: M.lack });
    const S = new Sammler();
    const K2 = { M: M2 };
    baueKabine(S, K2);
    // Glasdreiecke vorn (zwischen Scheibenfuß, Dachvorderrand und Gürtellinie)
    const zA = M.zWS + 0.1, zB = M.zDV - 0.03;
    [-1, 1].forEach((s) => {
      const xa = halbBreite(M, zA, 0.4) * f0.schulterX - 0.05, xb = halbBreite(M, zB, 0.4) * f0.schulterX - 0.05;
      const ya = schulter(M, zA) + 0.02, yb = schulter(M, zB) + 0.035, yt = kabinenHoehe(M2, zB + 0.02, schulter(M, zB)) - 0.07;
      S.dreieckNach([s * xa, ya, zA], [s * xb, yb, zB], [s * xb, yt, zB], [s, 0, 0], FARBE.GLAS);
    });
    // Dachvorderrand-Abschluss (schwarze Stoffkante) – Stirnfläche der ersten Kabinenstation ist null hoch, daher kein Deckel nötig
    return { geo: S.fertig(), pivot: { y: schulter(M, M2.zEnd) + 0.02, z: M2.zEnd } };
  }

  // ------------------------------------------------------------
  // 3. Radhäuser und Unterboden
  // ------------------------------------------------------------
  function baueRadhaeuser(S, K) {
    const M = K.M;
    achsen(M).forEach((a) => {
      const Rr = a.R + 0.02;
      const xAussen = halbBreite(M, a.zc, 1) - 0.01;
      const xRad = xAussen - a.w / 2 - 0.005;
      const xInnen = Math.max(0.2, xRad - a.w / 2 - 0.06);
      [-1, 1].forEach((s) => {
        const n = 10;
        const pkt = (i) => { const w = Math.PI * i / n; return [a.zc - Rr * Math.cos(w), a.r + Rr * Math.sin(w)]; };
        for (let i = 0; i < n; i++) {
          const [z0, y0] = pkt(i), [z1, y1] = pkt(i + 1);
          const wm = Math.PI * (i + 0.5) / n;
          S.viereckNach([s * xAussen, y0, z0], [s * xInnen, y0, z0], [s * xInnen, y1, z1], [s * xAussen, y1, z1],
            [0, -Math.sin(wm), Math.cos(wm)], FARBE.RADHAUS);
        }
        // senkrechte Wände vor/hinter dem Rad bis zum Schweller
        [-1, 1].forEach((v) => {
          const z = a.zc + v * Rr;
          S.viereckNach([s * xAussen, a.r, z], [s * xInnen, a.r, z], [s * xInnen, M.sill - 0.03, z], [s * xAussen, M.sill - 0.03, z],
            [0, 0, -v], FARBE.RADHAUS);
        });
        // Innenwand
        const umr = [];
        for (let i = 0; i <= n; i++) umr.push(pkt(i));
        umr.push([a.zc + Rr, M.sill - 0.03], [a.zc - Rr, M.sill - 0.03]);
        const m = [s * xInnen, a.r, a.zc];
        for (let i = 0; i < umr.length; i++) {
          const p = umr[i], q = umr[(i + 1) % umr.length];
          S.dreieckNach(m, [s * xInnen, p[1], p[0]], [s * xInnen, q[1], q[0]], [s, 0, 0], FARBE.RADHAUS);
        }
      });
    });
    // Unterboden
    const xi = Math.min(...achsen(M).map((a) => halbBreite(M, a.zc, 1) - a.w - 0.07));
    quader(S, FARBE.UNTERBODEN, 0, M.sill + 0.02, 0, 2 * xi, 0.06, M.L - 0.5);
  }

  // ------------------------------------------------------------
  // 4. Front: Scheinwerfer, Tagfahrlicht, Grill, Einlässe, Nebel, Kennzeichen
  // ------------------------------------------------------------
  function baueFront(S, SW, K) {
    const M = K.M, f = M.f, H = M.H, hb = M.B / 2;
    const li = Object.assign({}, BASIS.licht, f.licht);
    const ly = li.y * H, lx = li.x * hb;
    const lb = li.b, lh = li.h || li.b;
    const xInnen = lx - lb / 2;                      // Innenkante der Scheinwerfer
    [-1, 1].forEach((s, si) => {
      const x = s * lx;
      if (li.form === 'rund' && li.vier) {
        // flacher runder LED-Scheinwerfer, bündig auf dem Kotflügel (folgt der Oberfläche): dunkler Rahmen, dunkles Glas,
        // vier helle Punkte (2 × 2) und helle Tagfahrlicht-Bögen oben
        const r = lb / 2, zl = M.zF + (li.z || 0.5), d = 0.05, ob = (zz, xx) => obenY(K, zz, xx, false);
        const gx = (ob(zl, x + d) - ob(zl, x - d)) / (2 * d), gz = (ob(zl + d, x) - ob(zl - d, x)) / (2 * d);
        const nl = Math.hypot(gx, 1, gz), nn = [-gx / nl, 1 / nl, -gz / nl], pp = [x, ob(zl, x), zl];
        flachSchraeg(S, FARBE.SCHWARZ, pp, nn, kreisPunkte(r + 0.016, 20), 0.008);
        flachSchraeg(S, 0x2c3138, pp, nn, kreisPunkte(r, 20), 0.013);
        [[-1, 1], [1, 1], [-1, -1], [1, -1]].forEach(([px, py]) => flachSchraeg(SW[si], 0, pp, nn, kreisPunkte(r * 0.17, 8, px * r * 0.36, -py * r * 0.34), 0.018));   // lokal +y zeigt nach vorn: Muster gespiegelt, damit der Bogen oben/hinten liegt
        for (let i = 0; i < 4; i++) {                              // Tagfahrlicht: Bogen über den vier Punkten
          const w0 = (28 + i * 34) * Math.PI / 180, w1 = (28 + (i + 1) * 34) * Math.PI / 180, rr = r * 0.8;
          flachSchraeg(SW[si], 0, pp, nn, strich(rr * Math.cos(w0), -rr * Math.sin(w0), rr * Math.cos(w1), -rr * Math.sin(w1), 0.012), 0.018);
        }
      } else if (li.form === 'rund') {
        const r = lb / 2;
        anbauTeil(S, K, f.tfl === 'ring' && f.spiegelFarbe === 'dach' ? FARBE.CHROM : FARBE.SCHWARZ, 'vorn', x, ly, kreisPunkte(r + 0.025, 18), 0.012, 0.08);
        anbauTeil(SW[si], K, 0, 'vorn', x, ly, kreisPunkte(r, 18), 0.02, 0.08);
        anbauTeil(S, K, FARBE.SCHWARZ, 'vorn', x, ly, kreisPunkte(r * 0.72, 16), 0.026, 0.08, [kreisPunkte(r * 0.42, 12).reverse()]);
      } else if (li.form === 'eckig') {
        anbauTeil(S, K, FARBE.SCHWARZ, 'vorn', x, ly, rechteckRund(lb + 0.03, lh + 0.03, 0.03), 0.01, 0.08);
        anbauTeil(SW[si], K, 0, 'vorn', x, ly, rechteckRund(lb, lh, 0.025), 0.018, 0.08);
        if (li.blende) {                               // optional: dunkle Blende unten (nur der obere Streifen leuchtet) statt zwei Punkten
          anbauTeil(S, K, FARBE.KUNSTSTOFF, 'vorn', x, ly - lh * (0.5 - li.blende / 2) + lh * 0.02, rechteckRund(lb - 0.02, lh * li.blende, 0.015), 0.024, 0.08);
        } else [-0.22, 0.2].forEach((o) => anbauTeil(S, K, FARBE.KUNSTSTOFF, 'vorn', x + s * o * lb, ly + lh * 0.12, kreisPunkte(lh * 0.24, 12), 0.024, 0.08));
      } else {                                       // 'schmal': Keil, außen höher
        const pk = [[-lb / 2, -lh / 2], [lb / 2, -lh * 0.15], [lb / 2, lh / 2], [-lb / 2, lh * 0.25]].map(([a, b]) => [a * s, b]);
        anbauTeil(S, K, FARBE.SCHWARZ, 'vorn', x, ly, pk.map(([a, b]) => [a * 1.06, b * 1.25]), 0.01, 0.08);
        anbauTeil(SW[si], K, 0, 'vorn', x, ly, pk, 0.018, 0.08);
        anbauTeil(S, K, FARBE.KUNSTSTOFF, 'vorn', x - s * lb * 0.08, ly - lh * 0.05, rechteckRund(lb * 0.42, lh * 0.38, 0.01), 0.024, 0.08);
        anbauTeil(S, K, FARBE.KUNSTSTOFF, 'vorn', x + s * lb * 0.3, ly + lh * 0.05, kreisPunkte(lh * 0.2, 10), 0.024, 0.08);
      }
      // Tagfahrlicht
      if (f.tfl === 'linie' && li.form !== 'rund') {
        anbauLeiste(SW[si], K, 0, 'vorn', Math.min(x - s * lb * 0.45, x + s * lb * 0.45), Math.max(x - s * lb * 0.45, x + s * lb * 0.45), ly + lh * 0.42, 0.016, 0.028, 2);
      } else if (f.tfl === 'L') {
        anbauLeiste(SW[si], K, 0, 'vorn', Math.min(x, x + s * lb * 0.45), Math.max(x, x + s * lb * 0.45), ly + lh * 0.3, 0.016, 0.028, 2);
        anbauTeil(SW[si], K, 0, 'vorn', x - s * lb * 0.02, ly - lh * 0.05, rechteckRund(0.016, lh * 0.75, 0.004), 0.028, 0.06);
      } else if (f.tfl === 'leiste') {
        // durchgehende Lichtleiste über die Front (jede Hälfte gehört zu einem Scheinwerfer)
        anbauLeiste(SW[si], K, 0, 'vorn', s < 0 ? -xInnen : 0.005, s < 0 ? -0.005 : xInnen, ly - lh * 0.15 + (f.tflY || 0), f.tflH || 0.014, f.tflVor || 0.022, f.tflN || 4);   // optional: dickere/feiner unterteilte Leiste (T-Roc)
      }
    });

    // --- Grill ---
    const kY = f.kennzeichenY * H;
    const g = f.grill;
    if (g === 'leiste') {
      anbauTeil(S, K, FARBE.SCHWARZ, 'vorn', 0, ly + 0.0, rechteckRund(2 * xInnen, 0.1, 0.02), 0.008, 0.07);
      if (f.grillChrom !== false) anbauTeil(S, K, FARBE.CHROM, 'vorn', 0, ly + 0.055, rechteckRund(2 * xInnen - 0.04, 0.014, 0.005), 0.014, 0.07);   // optional: ohne Chromleiste
      anbauTeil(S, K, FARBE.SCHWARZ, 'vorn', 0, kY + 0.02, [[-0.42, -0.13], [0.42, -0.13], [0.52, 0.13], [-0.52, 0.13]], 0.008, 0.07);
      [-0.06, 0.06].forEach((o) => anbauTeil(S, K, FARBE.GITTER, 'vorn', 0, kY + 0.02 + o * 1.4, rechteckRund(0.9, 0.012, 0.004), 0.012, 0.07));
    } else if (g === 'quer' || g === 'van') {
      const hG = f.grillHoehe || (g === 'van' ? 0.19 : 0.15), nB = f.grillLeisten || (g === 'van' ? 3 : 4);
      const gy = f.grillY || 0;                      // optional: Grill gegenüber den Scheinwerfern verschieben
      anbauLeiste(S, K, FARBE.SCHWARZ, 'vorn', -xInnen - 0.01, xInnen + 0.01, ly - 0.005 + gy, hG, 0.008, 3);
      for (let i = 0; i < nB; i++) {
        const y = ly - hG / 2 + (hG * (i + 0.6)) / nB + gy;
        anbauLeiste(S, K, FARBE.CHROM, 'vorn', -xInnen - (i === 0 ? 0.02 : 0), xInnen + (i === 0 ? 0.02 : 0), y, 0.013, 0.014, 3);
      }
      if (f.grillRahmen) {                           // Chromrahmen oben/unten um den Grill
        anbauLeiste(S, K, FARBE.CHROM, 'vorn', -xInnen - 0.02, xInnen + 0.02, ly - 0.005 + gy + hG / 2 + 0.006, 0.013, 0.016, 3);
        anbauLeiste(S, K, FARBE.CHROM, 'vorn', -xInnen - 0.02, xInnen + 0.02, ly - 0.005 + gy - hG / 2 - 0.004, 0.013, 0.016, 3);
      }
      const bU = f.stossBreite || (g === 'van' ? 1.3 : 1.2), hU = f.stossHoehe || (g === 'van' ? 0.24 : 0.12);
      if (f.chromSpange) {                           // dicke Chromspange unter dem Grill, durchgehend bis unter die Scheinwerfer
        const cs = f.chromSpange;
        anbauLeiste(S, K, FARBE.CHROM, 'vorn', -cs.x * hb, cs.x * hb, ly + (cs.y || -0.085), cs.d || 0.03, 0.02, 3);
      }
      if (f.grillUnten) {                            // unteres, breiteres Grillfeld mit waagrechten Lamellen
        const gu = f.grillUnten, yu = ly + gu.y;
        anbauLeiste(S, K, FARBE.SCHWARZ, 'vorn', -gu.b / 2, gu.b / 2, yu, gu.h, 0.008, 4);
        for (let i = 0; i < gu.n; i++) anbauLeisteFlach(S, K, FARBE.GITTER, 'vorn', -gu.b / 2 + 0.03, gu.b / 2 - 0.03, yu - gu.h / 2 + (gu.h * (i + 0.7)) / gu.n, 0.012, 0.014, gu.seg || 4);
      }
      if (f.stossForm === 'seiten') {                // zwei schwarze Seitenteile (mit Nebelscheinwerfern) + schmaler Mittelschlitz hinter dem Kennzeichen
        const yS = kY + (f.stossY || 0), xi = f.stossInnen * hb;
        [-1, 1].forEach((s) => anbauLeiste(S, K, FARBE.SCHWARZ, 'vorn', Math.min(s * xi, s * bU / 2), Math.max(s * xi, s * bU / 2), yS, hU, 0.008, 3));
        anbauLeiste(S, K, FARBE.SCHWARZ, 'vorn', -bU / 2 + 0.05, bU / 2 - 0.05, kY + 0.005, hU * 0.42, 0.008, 4);
        anbauLeisteFlach(S, K, FARBE.GITTER, 'vorn', -xi + 0.02, xi - 0.02, kY + hU * 0.1, 0.01, 0.014, 4);
      } else
      anbauLeiste(S, K, FARBE.SCHWARZ, 'vorn', -bU / 2, bU / 2, kY + (g === 'van' ? 0.02 : 0.0) + (f.stossY || 0), hU, 0.008, 6);
      if (g === 'quer') anbauLeiste(S, K, FARBE.CHROM, 'vorn', -bU / 2 + 0.04, bU / 2 - 0.04, kY + hU / 2 + 0.012, 0.012, 0.012, 6);
    } else if (g === 'doppelt') {
      // generische, hohe zweigeteilte dunkle Fläche (keine Markenform)
      const oben = M.nase - 0.05, unten = kY - 0.02, hG = oben - unten, yG = (oben + unten) / 2;
      [-1, 1].forEach((s) => {
        anbauTeil(S, K, FARBE.SCHWARZ, 'vorn', s * 0.155, yG, rechteckRund(0.27, hG, 0.06), 0.01, 0.08);
        for (let i = -1; i <= 1; i++) anbauTeil(S, K, FARBE.GITTER, 'vorn', s * 0.155 + i * 0.07, yG, rechteckRund(0.012, hG - 0.08, 0.004), 0.014, 0.08);
      });
    } else if (g === 'senkrecht') {
      const oben = M.nase - 0.04, unten = kY - 0.03, hG = oben - unten, yG = (oben + unten) / 2;
      anbauTeil(S, K, FARBE.SCHWARZ, 'vorn', 0, yG, [[-0.42, -hG / 2], [0.42, -hG / 2], [0.33, hG / 2], [-0.33, hG / 2]], 0.01, 0.08);
      for (let i = -5; i <= 5; i++) anbauTeil(S, K, FARBE.CHROM, 'vorn', i * 0.066, yG, rechteckRund(0.012, hG - 0.05, 0.004), 0.016, 0.08);
    } else if (g === 'waben') {
      const oben = M.nase - 0.04, unten = kY - 0.1, hG = oben - unten, yG = (oben + unten) / 2;
      anbauTeil(S, K, FARBE.SCHWARZ, 'vorn', 0, yG,
        [[-0.38, -hG / 2], [0.38, -hG / 2], [0.5, -hG * 0.2], [0.46, hG / 2], [-0.46, hG / 2], [-0.5, -hG * 0.2]], 0.01, 0.08);
      for (let r = 0; r < 4; r++) {
        for (let c = -4; c <= 4; c++) {
          const x = c * 0.09 + (r % 2 ? 0.045 : 0), y = yG - hG / 2 + 0.07 + r * (hG - 0.1) / 3.4;
          if (Math.abs(x) > 0.4 - (r === 0 ? 0.05 : 0)) continue;
          anbauTeil(S, K, FARBE.GITTER, 'vorn', x, y, kreisPunkte(0.03, 6), 0.014, 0.08);
        }
      }
    } else if (g === 'sechseck') {
      const yG = ly - 0.16;
      const sechs = (b, h) => [[-b / 2, 0], [-b * 0.38, -h / 2], [b * 0.38, -h / 2], [b / 2, 0], [b * 0.4, h / 2], [-b * 0.4, h / 2]];
      anbauTeil(S, K, FARBE.CHROM, 'vorn', 0, yG, sechs(0.66, 0.32), 0.008, 0.08);
      anbauTeil(S, K, FARBE.SCHWARZ, 'vorn', 0, yG, sechs(0.6, 0.27), 0.013, 0.08);
      anbauTeil(S, K, FARBE.CHROM, 'vorn', 0, yG + 0.02, rechteckRund(0.56, 0.02, 0.006), 0.018, 0.08);
    }
    // --- Markenzeichen vorn (optional, vereinfachtes rundes Emblem) ---
    if (f.logo) bauLogo(S, K, 'vorn', 0, ly + (f.logo.y || 0), f.logo.r || 0.06, f.logo.stil);
    // --- Lufteinlässe unten ---
    const ex = 0.66 * hb, ey = Math.max(M.sill + 0.12, kY + 0.0);
    if (f.einlass === '911') {
      anbauLeiste(S, K, FARBE.SCHWARZ, 'vorn', -0.32, 0.32, kY - 0.08, 0.08, 0.008, 4);
      [-1, 1].forEach((s) => anbauTeil(S, K, FARBE.SCHWARZ, 'vorn', s * 0.6 * hb, kY + 0.0, rechteckRund(0.3, 0.15, 0.04), 0.008, 0.08));
      [-1, 1].forEach((s) => anbauTeil(SW[s < 0 ? 0 : 1], K, 0, 'vorn', s * 0.6 * hb, kY + 0.05, rechteckRund(0.22, 0.014, 0.004), 0.014, 0.06));
    } else if (f.einlass === '992') {
      // 992.2-Front: zwei große schwarze Seiteneinlässe mit waagrechten Lamellen, breiter dunkler Mittelschlitz hinter dem Kennzeichen,
      // schwarze Frontlippe unten
      const eh = f.einlassH || 0.2, ew = f.einlassB || 0.34, yE = f.einlassY !== undefined ? f.einlassY * H : ey;
      [-1, 1].forEach((s) => {
        const xo = s * (f.einlassX || 0.66) * hb;
        anbauTeil(S, K, FARBE.SCHWARZ, 'vorn', xo, yE, rechteckRund(ew, eh, 0.045), 0.008, 0.08);
        for (let i = 0; i < 3; i++) anbauLeisteFlach(S, K, 0x585d66, 'vorn', xo - ew * 0.44, xo + ew * 0.44, yE - eh * 0.28 + i * eh * 0.2, 0.012, 0.014, 3);
      });
      anbauLeiste(S, K, FARBE.SCHWARZ, 'vorn', -(f.mittelB || 0.34), f.mittelB || 0.34, kY, f.mittelH || 0.15, 0.008, 4);
      anbauLeiste(S, K, FARBE.SCHWARZ, 'vorn', -(f.lippeB || 0.84) * hb, (f.lippeB || 0.84) * hb, M.sill + (f.lippeY !== undefined ? f.lippeY : 0.03), 0.05, 0.01, 8);
    } else if (f.einlass === 'rline') {
      // R-Line-Stoßfänger (T-Roc): breiter schwarzer Mittel-Einlass mit Wabengitter hinter dem Kennzeichen, außen zwei große schwarze
      // Einlässe mit senkrechtem LED-Streifen (Nebel/Kurvenlicht), schlanke silberne Lippe unten
      const eh = f.einlassH || 0.17, yE = f.einlassY !== undefined ? f.einlassY * H : ey;
      anbauTeil(S, K, FARBE.SCHWARZ, 'vorn', 0, kY + 0.012, [[-0.5, -0.115], [0.5, -0.115], [0.6, 0.115], [-0.6, 0.115]], 0.008, 0.08);
      for (let i = 0; i < 3; i++) anbauLeisteFlach(S, K, FARBE.GITTER, 'vorn', -0.46, 0.46, kY - 0.05 + i * 0.075, 0.01, 0.012, 4);
      [-1, 1].forEach((s2, si) => {
        const xo = s2 * (f.einlassX || 0.70) * hb, w = 0.2;
        anbauTeil(S, K, FARBE.SCHWARZ, 'vorn', xo, yE, rechteckRund(2 * w, eh, 0.05), 0.012, 0.08);
        anbauLeisteFlach(S, K, FARBE.GITTER, 'vorn', xo - w * 0.8, xo + w * 0.8, yE - eh * 0.2, 0.012, 0.014, 3);
        anbauLeisteFlach(S, K, FARBE.GITTER, 'vorn', xo - w * 0.8, xo + w * 0.8, yE + eh * 0.12, 0.012, 0.014, 3);
        anbauTeil(SW[si], K, 0, 'vorn', xo + s2 * w * 0.78, yE, rechteckRund(0.018, eh * 0.7, 0.004), 0.018, 0.06);
      });
      anbauLeiste(S, K, 0xaeb4bc, 'vorn', -0.84 * hb, 0.84 * hb, M.sill + 0.07, 0.016, 0.014, 8);
    } else if (f.einlass === 'gross') {
      [-1, 1].forEach((s) => {
        anbauTeil(S, K, FARBE.SCHWARZ, 'vorn', s * ex, ey, [[-0.15, -0.09], [0.15, -0.09], [0.15 + s * 0.03, 0.09], [-0.12, 0.09]].map(([a, b]) => [a * s, b]), 0.008, 0.08);
        anbauTeil(S, K, FARBE.GITTER, 'vorn', s * ex, ey, rechteckRund(0.24, 0.012, 0.004), 0.012, 0.08);
      });
    } else if (f.einlass === 'chromrahmen') {
      // breiter dunkler Mitteleinlass hinter dem Kennzeichen, außen Einlässe mit Chromrahmen und L-förmiger LED-Linie,
      // darunter eine durchgehende Chromspange am Stoßfänger
      anbauLeiste(S, K, FARBE.SCHWARZ, 'vorn', -0.52, 0.52, kY + 0.005, 0.17, 0.008, 4);
      [-1, 1].forEach((s, si) => {
        const xo = s * 0.64 * hb, yo = ey + 0.0;
        anbauTeil(S, K, FARBE.CHROM, 'vorn', xo, yo, rechteckRund(0.36, 0.17, 0.035), 0.008, 0.08);
        anbauTeil(S, K, FARBE.SCHWARZ, 'vorn', xo, yo, rechteckRund(0.32, 0.135, 0.03), 0.013, 0.08);
        anbauLeiste(SW[si], K, 0, 'vorn', Math.min(xo - s * 0.13, xo + s * 0.13), Math.max(xo - s * 0.13, xo + s * 0.13), yo + 0.035, 0.014, 0.018, 1);
        anbauTeil(SW[si], K, 0, 'vorn', xo - s * 0.13, yo + 0.0, rechteckRund(0.014, 0.07, 0.004), 0.018, 0.06);
      });
      anbauLeiste(S, K, FARBE.CHROM, 'vorn', -0.86 * hb, 0.86 * hb, M.sill + 0.075, 0.014, 0.016, 8);
    } else if (f.einlass === 'flach') {
      [-1, 1].forEach((s) => anbauTeil(S, K, FARBE.SCHWARZ, 'vorn', s * ex, ey - 0.02, rechteckRund(0.22, 0.05, 0.02), 0.008, 0.08));
    }
    // --- Nebelscheinwerfer-Mulden ---
    if (f.nebel) {
      [-1, 1].forEach((s) => {
        const nx = (f.nebelX || 0.72) * hb;
        anbauTeil(S, K, FARBE.SCHWARZ, 'vorn', s * nx, ey + 0.01, rechteckRund(0.17, 0.09, 0.04), 0.008, 0.08);
        anbauTeil(S, K, FARBE.NEBEL, 'vorn', s * nx, ey + 0.01, kreisPunkte(0.032, 12), 0.013, 0.08);
      });
    }
    // --- Kennzeichen (leer, weiß) ---
    anbauTeil(S, K, FARBE.SCHWARZ, 'vorn', 0, kY, rechteckRund(0.55, 0.14, 0.01), 0.016, 0.08);
    anbauTeil(S, K, FARBE.WEISS, 'vorn', 0, kY, rechteckRund(0.52, 0.11, 0.008), 0.022, 0.08);
  }

  // ------------------------------------------------------------
  // Emblem und Schriftzug (vereinfacht, nur bei form.logo / form.logoHeck / form.schriftzug)
  // ------------------------------------------------------------
  /** Schräger Strich als Parallelogramm (Mittelpunkte der Enden, Strichbreite w). */
  function strich(x0, y0, x1, y1, w) {
    const dx = x1 - x0, dy = y1 - y0, l = Math.hypot(dx, dy) || 1, nx = -dy / l * w / 2, ny = dx / l * w / 2;
    return [[x0 + nx, y0 + ny], [x1 + nx, y1 + ny], [x1 - nx, y1 - ny], [x0 - nx, y0 - ny]];
  }
  /** Rundes Emblem: Chromring, dunkle Scheibe, stilisiertes „V“ über „W“ in Chrom. */
  function bauLogo(S, K, seite, x, y, r, stil) {
    if (stil === 'porsche') {                      // optional: Wappen – goldener Rand, vier Felder (rot/schwarz), goldener Mittelschild
      anbauFlach(S, K, 0xc9a24a, seite, x, y, kreisPunkte(r, 14), 0.012);
      [[0, 0xb3202a], [1, 0x17181a], [2, 0xb3202a], [3, 0x17181a]].forEach(([q, c]) => {
        const pk = [[0, 0]];
        for (let i = 0; i <= 3; i++) { const w = (q * 90 + 90 * i / 3 + 4) * Math.PI / 180; pk.push([r * 0.8 * Math.cos(w), r * 0.8 * Math.sin(w)]); }
        anbauFlach(S, K, c, seite, x, y, pk, 0.016);
      });
      anbauFlach(S, K, 0xc9a24a, seite, x, y, kreisPunkte(r * 0.36, 8), 0.02);
      anbauFlach(S, K, 0x17181a, seite, x, y, kreisPunkte(r * 0.16, 6), 0.024);
      return;
    }
    anbauFlach(S, K, FARBE.CHROM, seite, x, y, kreisPunkte(r, 14), 0.012);
    anbauFlach(S, K, 0x2a4c8f, seite, x, y, kreisPunkte(r * 0.84, 14), 0.016);
    const w = r * 0.2;
    [[-0.5, 0.62, -0.02, -0.08], [0.5, 0.62, 0.02, -0.08],                                       // V
      [-0.62, -0.1, -0.33, -0.6], [-0.33, -0.6, 0, -0.18], [0, -0.18, 0.33, -0.6], [0.33, -0.6, 0.62, -0.1]]   // W
      .forEach(([a, b, c, d]) => anbauFlach(S, K, FARBE.CHROM, seite, x, y, strich(a * r * 0.8, b * r * 0.8, c * r * 0.8, d * r * 0.8, w), 0.02));
  }
  /** Blockschrift aus Rechtecken (3 × 5 Raster) – nur die benötigten Buchstaben. */
  const GLYPHEN = {
    A: [[0, 0, 0.7, 4.3], [2.3, 0, 3, 4.3], [0, 4.3, 3, 5], [0, 2.2, 3, 2.9]],
    E: [[0, 0, 0.7, 5], [0, 4.3, 3, 5], [0, 2.15, 2.5, 2.85], [0, 0, 3, 0.7]],
    H: [[0, 0, 0.7, 5], [2.3, 0, 3, 5], [0, 2.15, 3, 2.85]],
    I: [[1.15, 0, 1.85, 5]],
    L: [[0, 0, 0.7, 5], [0, 0, 3, 0.7]],
    O: [[0, 0, 0.7, 5], [2.3, 0, 3, 5], [0, 4.3, 3, 5], [0, 0, 3, 0.7]],
    P: [[0, 0, 0.7, 5], [0, 4.3, 3, 5], [0, 2.3, 3, 3], [2.3, 2.3, 3, 5]],
    S: [[0, 4.3, 3, 5], [0, 2.15, 3, 2.85], [0, 0, 3, 0.7], [0, 2.15, 0.7, 5], [2.3, 0, 3, 2.85]],
    T: [[0, 4.3, 3, 5], [1.15, 0, 1.85, 4.3]],
    U: [[0, 0, 0.7, 5], [2.3, 0, 3, 5], [0, 0, 3, 0.7]],
    D: [[0, 0, 0.7, 5], [0, 4.3, 2.4, 5], [0, 0, 2.4, 0.7], [2.3, 0.8, 3, 4.2]],
    N: [[0, 0, 0.7, 5], [2.3, 0, 3, 5], [0.7, 3.5, 1.4, 5], [1.15, 2.1, 1.85, 3.6], [1.6, 0, 2.3, 1.6]],
    M: [[0, 0, 0.7, 5], [2.3, 0, 3, 5], [0.7, 3.7, 1.4, 5], [1.6, 3.7, 2.3, 5], [1.15, 2.4, 1.85, 4]],
    R: [[0, 0, 0.7, 5], [0, 4.3, 3, 5], [0, 2.3, 3, 3], [2.3, 2.3, 3, 5], [2.0, 0, 3, 2.3]],
    C: [[0, 0, 0.7, 5], [0, 4.3, 3, 5], [0, 0, 3, 0.7]],
    9: [[0, 2.1, 0.7, 5], [2.3, 0, 3, 5], [0, 4.3, 3, 5], [0, 2.15, 3, 2.85], [0, 0, 3, 0.7]],
    1: [[1.15, 0, 1.85, 5], [0.2, 3.6, 1.15, 4.4]],
    V: [[0, 2.8, 0.7, 5], [2.3, 2.8, 3, 5], [0.45, 1.3, 1.2, 3], [1.8, 1.3, 2.55, 3], [1.1, 0, 1.9, 1.5]],
  };
  function bauSchrift(S, K, text, x, y, h, breite, farbe, lueckeF, vor) {
    const n = text.length, zelle = h / 5;
    const luecke = zelle * (lueckeF || 1.2);        // optional: weit gesperrte Buchstaben (lueckeF größer)
    const soll = n * 3 * zelle + (n - 1) * luecke;
    const sk = breite > 0 ? Math.min(1, breite / soll) : 1;       // zu breit -> schmaler
    const c = zelle * sk, lk = luecke * sk, ges = n * 3 * c + (n - 1) * lk;
    let x0 = x - ges / 2;
    for (const ch of text) {
      (GLYPHEN[ch] || []).forEach(([a, b, d, e]) => {
        const w = (d - a) * c, hh = (e - b) * zelle;
        anbauFlach(S, K, farbe !== undefined ? farbe : FARBE.CHROM, 'hinten', x0 + (a + d) / 2 * c, y - h / 2 + (b + e) / 2 * zelle, [[-w / 2, -hh / 2], [w / 2, -hh / 2], [w / 2, hh / 2], [-w / 2, hh / 2]], vor || 0.01);
      });
      x0 += 3 * c + lk;
    }
  }

  // ------------------------------------------------------------
  // 5. Heck: Rückleuchten, Kennzeichen, Endrohre, Diffusor, Spoiler
  // ------------------------------------------------------------
  function baueHeck(S, BL, K) {
    const M = K.M, f = M.f, H = M.H, hb = M.B / 2;
    const ru = Object.assign({}, BASIS.rueck, f.rueck);
    const ry = ru.y * H, rh = ru.h;
    [-1, 1].forEach((s, si) => {
      const xa = ru.x0 * hb, xb = ru.x1 * hb;
      const lo = (a, b) => (s < 0 ? -b : a), hi = (a, b) => (s < 0 ? -a : b);
      if (ru.form === 'leiste') {
        anbauLeiste(S, K, FARBE.SCHWARZ, 'hinten', lo(0, xb + 0.015), hi(0, xb + 0.015), ry, rh + 0.03, 0.012, 8);
        anbauLeiste(BL[si], K, 0, 'hinten', lo(Math.max(0.004, xa), xb), hi(Math.max(0.004, xa), xb), ry, rh, 0.02, 8);
        anbauLeiste(BL[si], K, 0, 'hinten', lo(xb - 0.22, xb - 0.01), hi(xb - 0.22, xb - 0.01), ry - 0.01, rh + 0.03, 0.024, 2);
        anbauLeiste(S, K, FARBE.SCHWARZ, 'hinten', lo(0, xb - 0.05), hi(0, xb - 0.05), ry - rh / 2 - 0.06, 0.1, 0.008, 6);
      } else if (ru.form === 'band') {
        // 992: durchgehendes Leuchtband über die ganze Breite – dunkles Gehäuse, oben dünner roter Streifen, unten helle Linie
        // (nur außen; in der Mitte steht der Schriftzug). x0 = Beginn der hellen Linie, x1 = Außenkante
        anbauLeiste(S, K, FARBE.SCHWARZ, 'hinten', lo(0, xb + 0.015), hi(0, xb + 0.015), ry, rh, 0.012, 8);
        anbauLeiste(BL[si], K, 0, 'hinten', lo(0.004, xb - 0.01), hi(0.004, xb - 0.01), ry + rh * 0.26, ru.rot || 0.02, 0.02, 8);
        anbauLeiste(S, K, 0xdfe3e8, 'hinten', lo(xa, xb - 0.03), hi(xa, xb - 0.03), ry - rh * 0.32, 0.011, 0.018, 4);
      } else if (ru.form === 'geteilt') {
        // zwei Teile je Seite: Kotflügel-Leuchte (außen, um die Ecke) + Heckklappen-Leuchte (innen, Keil) mit LED-Linie, Fuge dazwischen
        const xm = ru.xm * hb, xf = ru.xf * hb;      // xm: Ende der Heckklappen-Leuchte, xf: Beginn der Kotflügel-Leuchte
        anbauLeiste(S, K, FARBE.SCHWARZ, 'hinten', lo(xa - 0.01, xf - 0.015), hi(xa - 0.01, xf - 0.015), ry, rh + 0.03, 0.01, 4);
        anbauLeiste(BL[si], K, 0, 'hinten', lo(xa, xm), hi(xa, xm), ry, rh, 0.018, 4);
        anbauLeiste(BL[si], K, 0, 'hinten', lo(xa + 0.03, xm - 0.08), hi(xa + 0.03, xm - 0.08), ry + rh * 0.62, rh * 0.28, 0.022, 3);   // oberer Keil (Bremslicht-Linie)
        anbauLeiste(S, K, FARBE.SCHWARZ, 'hinten', lo(xa + 0.03, xm - 0.02), hi(xa + 0.03, xm - 0.02), ry + rh * 0.12, rh * 0.14, 0.024, 3);   // dunkle LED-Trennlinie
        anbauLeiste(S, K, FARBE.SCHWARZ, 'hinten', lo(xf - 0.015, xb + 0.015), hi(xf - 0.015, xb + 0.015), ry + 0.005, rh + 0.04, 0.01, 4);
        anbauLeiste(BL[si], K, 0, 'hinten', lo(xf, xb), hi(xf, xb), ry + 0.005, rh + 0.01, 0.018, 4);
        anbauLeiste(S, K, FARBE.SCHWARZ, 'hinten', lo(xf + 0.02, xb - 0.03), hi(xf + 0.02, xb - 0.03), ry + 0.01, rh * 0.16, 0.024, 2);
      } else if (ru.form === 'senkrecht' || ru.form === 'hoch') {
        const xm = s * (xa + xb) / 2, w = xb - xa;
        anbauTeil(S, K, ru.form === 'senkrecht' ? FARBE.CHROM : FARBE.SCHWARZ, 'hinten', xm, ry, rechteckRund(w + 0.03, rh + 0.03, 0.05), 0.01, 0.08);
        anbauTeil(BL[si], K, 0, 'hinten', xm, ry, rechteckRund(w, rh, 0.045), 0.018, 0.08);
        anbauTeil(S, K, FARBE.WEISS, 'hinten', xm, ry - rh * 0.25, rechteckRund(w * 0.6, rh * 0.12, 0.01), 0.024, 0.06);
        for (let i = 0; i < (ru.balken || 0); i++) anbauFlach(S, K, FARBE.SCHWARZ, 'hinten', xm, ry + rh * (0.30 - i * 0.2), rechteckRund(w * 0.9, 0.016, 0.004), 0.026);   // optional: dunkle LED-Balken
      } else {
        anbauLeiste(BL[si], K, 0, 'hinten', lo(xa, xb), hi(xa, xb), ry, rh, 0.018, 4);
        anbauLeiste(S, K, FARBE.SCHWARZ, 'hinten', lo(xa + 0.03, xb - 0.04), hi(xa + 0.03, xb - 0.04), ry - rh * 0.05, rh * 0.22, 0.022, 3);
        if (ru.form === 'L') anbauTeil(BL[si], K, 0, 'hinten', s * (xb - 0.07), ry - rh / 2 - 0.05, rechteckRund(0.08, 0.1, 0.01), 0.018, 0.06);
      }
    });
    if (ru.form === 'kombi') anbauLeiste(S, K, FARBE.SCHWARZ, 'hinten', -ru.x0 * hb, ru.x0 * hb, ry, rh * 0.7, 0.012, 6);
    // optional (T-Roc Facelift): dünne durchgehende Leuchtlinie zwischen den Rückleuchten (rot, leuchtet mit dem Bremslicht)
    if (ru.verbinder) {
      anbauLeiste(S, K, FARBE.SCHWARZ, 'hinten', -ru.x0 * hb - 0.01, ru.x0 * hb + 0.01, ry, 0.04, 0.012, 6);
      anbauLeiste(BL[0], K, 0, 'hinten', -ru.x0 * hb - 0.01, ru.x0 * hb + 0.01, ry + 0.004, 0.016, 0.018, 6);
    }

    // Heckklappe (Van): Kennzeichenmulde, Dekorleiste unten mit rotem Strich, Reflektoren, Griffleiste (alles optional)
    if (f.heckMulde) {
      const hm = f.heckMulde, my = hm.y * H;
      anbauFlach(S, K, M.lackDunkel, 'hinten', 0, my, [[-hm.bo / 2, hm.h / 2], [-hm.bu / 2, -hm.h / 2], [hm.bu / 2, -hm.h / 2], [hm.bo / 2, hm.h / 2]], 0.006);
    }
    if (f.heckGriff) {
      const hg = f.heckGriff;
      anbauFlach(S, K, M.lackDunkel, 'hinten', 0, hg.y * H, rechteckRund(hg.b, hg.h, 0.01), 0.008);
      anbauLeisteFlach(S, K, FARBE.SCHWARZ, 'hinten', -hg.b / 2 + 0.01, hg.b / 2 - 0.01, hg.y * H - hg.h / 2 + 0.004, 0.008, 0.012, 1);
    }
    if (f.heckDeko) {
      const hd = f.heckDeko;
      anbauLeisteFlach(S, K, FARBE.SCHWARZ, 'hinten', -hd.x * hb, hd.x * hb, hd.y * H, hd.h, 0.012, hd.n || 6);
      anbauLeisteFlach(S, K, 0xc4281c, 'hinten', -hd.x * hb + 0.02, hd.x * hb - 0.02, hd.y * H - hd.h / 2 + 0.012, 0.007, 0.016, hd.n || 6);
    }
    if (f.reflektoren) {
      const rfl = f.reflektoren, rb = rfl.b || 0.07;                            // optional: Breite, Höhe, Farbe (orange Reflektoren)
      [-1, 1].forEach((s) => anbauLeisteFlach(S, K, rfl.farbe !== undefined ? rfl.farbe : 0xc4281c, 'hinten', s * (rfl.x - rb) * hb, s * (rfl.x + rb) * hb, rfl.y * H, rfl.h || 0.03, 0.012, 1));
    }
    // Heckscheibe (Kabine): Wischer und dritte Bremsleuchte oben
    if (f.heckGlas) {
      const hg = f.heckGlas;
      if (hg.wischer) {
        const w = hg.wischer;
        heckScheibeTeil(S, K, FARBE.SCHWARZ, w.x * hb, w.y * H, strich(-0.02, 0, w.l, w.l * 0.14, 0.024), 0.006);
        heckScheibeTeil(S, K, FARBE.SCHWARZ, w.x * hb, w.y * H, kreisPunkte(0.022, 8), 0.007);
      }
      if (hg.bremsleuchte) {
        const b = hg.bremsleuchte, hh = heckScheibe(K, 0, b.y * H);
        BL[0].geo(setze(new THREE.ShapeGeometry(umriss(rechteckRund(b.b, 0.022, 0.006))), 0, b.y * H, hh.z + 0.005, hh.rx, 0, 0), 0);
      }
    }

    // Kennzeichen
    const kY = f.kennzeichenHY * H;
    anbauTeil(S, K, FARBE.SCHWARZ, 'hinten', 0, kY, rechteckRund(0.56, 0.15, 0.01), 0.006, 0.08);
    anbauTeil(S, K, FARBE.WEISS, 'hinten', 0, kY, rechteckRund(0.52, 0.11, 0.008), 0.014, 0.08);

    // Markenzeichen und Schriftzug (optional)
    if (f.logoHeck) bauLogo(S, K, 'hinten', 0, f.logoHeck.y * H, f.logoHeck.r || 0.05, f.logoHeck.stil);
    if (f.schriftzug) bauSchrift(S, K, f.schriftzug.text, (f.schriftzug.x || 0) * hb, f.schriftzug.y * H, f.schriftzug.h || 0.04, f.schriftzug.b || 0.4, f.schriftzug.farbe, f.schriftzug.luecke, f.schriftzug.vor);
    if (f.schriftzug2) bauSchrift(S, K, f.schriftzug2.text, (f.schriftzug2.x || 0) * hb, f.schriftzug2.y * H, f.schriftzug2.h || 0.04, f.schriftzug2.b || 0.4, f.schriftzug2.farbe, f.schriftzug2.luecke, f.schriftzug2.vor);
    // Chromleiste oben am hinteren Stoßfänger (optional)
    if (f.heckLeiste) anbauLeiste(S, K, FARBE.CHROM, 'hinten', -f.heckLeiste.x * hb, f.heckLeiste.x * hb, f.heckLeiste.y * H, 0.016, 0.014, 8);
    // Diffusor / dunkler Stoßfänger unten
    const yD = M.sill + 0.07;
    if (f.diffusor) {
      const dx = (f.diffusorX || 0.72) * hb;                                  // optional: breiter/höher (schwarzer Stoßfänger unten)
      anbauLeiste(S, K, FARBE.SCHWARZ, 'hinten', -dx, dx, f.diffusorY !== undefined ? f.diffusorY * H : yD, f.diffusorH || 0.12, 0.01, 8);
      if (f.diffusor !== 'glatt') [-0.3, -0.1, 0.1, 0.3].forEach((x) => anbauTeil(S, K, FARBE.KUNSTSTOFF, 'hinten', x, yD, rechteckRund(0.02, 0.11, 0.005), 0.05, 0.08));
    }
    // Endrohre
    const er = Object.assign({ n: 0, form: 'rund', x: 0.6, r: 0.045 }, f.endrohre);
    const pos = [];
    if (er.n === 1) pos.push(-er.x * hb);
    else if (er.n === 2) pos.push(...(er.mitte ? [-er.x, er.x] : [-er.x * hb, er.x * hb]));
    else if (er.n === 4) [-1, 1].forEach((s) => pos.push(s * (er.x * hb - 0.06), s * (er.x * hb + 0.06)));
    pos.forEach((x) => {
      const yE = M.sill + 0.115;
      const r = er.r;
      if (er.form === 'trapez') {
        anbauTeil(S, K, FARBE.CHROM, 'hinten', x, yE, rechteckRund(r * 2.6, r * 1.3, 0.015), 0.03, 0.1);
        anbauTeil(S, K, FARBE.SCHWARZ, 'hinten', x, yE, rechteckRund(r * 2.2, r * 0.9, 0.012), 0.034, 0.1);
      } else {
        const sx = er.form === 'oval' ? 1.5 : 1;
        anbauTeil(S, K, FARBE.CHROM, 'hinten', x, yE, kreisPunkte(r, 12, 0, 0, sx), 0.035, 0.12);
        anbauTeil(S, K, FARBE.SCHWARZ, 'hinten', x, yE, kreisPunkte(r * 0.72, 10, 0, 0, sx), 0.039, 0.12);
      }
    });

    // Dritte Bremsleuchte in der Mitte des Motorgitters (optional)
    if (f.motorgitter && f.motorgitterBremse) {
      const z0 = M.zEnd + 0.04, z1 = M.zR - (f.motorgitterZ1 || 0.33), zm = z0 + (z1 - z0) * 0.55;
      quader(BL[0], 0, 0, obenY(K, zm, 0) + 0.013, zm, 0.075, 0.012, (z1 - z0) * 0.34, -0.1);
    }
    // Spoiler
    if (f.spoiler === 'integriert') {
      // kleiner, in die Lamellen integrierter Spoiler (ausgefahren): flache Lackklinge am hinteren Rand des Motorgitters
      const z1 = M.zR - (f.motorgitterZ1 || 0.33), zs = z1 - 0.07, bs = (f.motorgitterB || 0.36) - 0.02;
      quader(S, M.lack, 0, obenY(K, zs, 0) + 0.012, zs, 2 * bs, 0.014, 0.13, -0.07);
    } else if (f.spoiler === 'lippe') {
      const z = M.zR - 0.07, y = obenY(K, z, 0);
      const sl = f.lippe || {};   // optional (T-Roc): flachere, niedrigere Lippe direkt auf der Heckklappe { dy, dick, tief, neig }
      quader(S, f.kontrastdach ? M.dach : M.lack, 0, y + (sl.dy !== undefined ? sl.dy : 0.015), z, 2 * halbBreite(M, z, 0.3) * 0.8, sl.dick || 0.025, sl.tief || 0.12, sl.neig !== undefined ? sl.neig : -0.2);
    } else if (f.spoiler === 'aktiv') {
      const z = M.zR - 0.17, y = obenY(K, z, 0) + 0.018, b = 2 * halbBreite(M, z, 0.3) * 0.8;
      quader(S, M.lack, 0, y, z, b, 0.022, 0.2, -0.1);
      quader(S, FARBE.SCHWARZ, 0, y - 0.022, z - 0.01, b * 0.7, 0.025, 0.12);
    } else if (f.spoiler === 'dach' && !f.cabrio) {
      const z = M.zDH, y = obenY(K, z, 0, true) - 0.005;
      const halb = K.kabHalb[K.kabZ.indexOf(M.zDH)] || K.kabHalb[K.kabHalb.length - 1];
      quader(S, M.dach, 0, y, z + 0.06, 2 * halb[3][0] + 0.02, 0.035, 0.2, 0.12);
      if (f.dachBremsleuchte) quader(BL[0], 0, 0, y - 0.012, z + 0.158, 2 * halb[3][0] * 0.6, 0.012, 0.03, 0.12);   // dritte Bremsleuchte unter dem Spoiler
    }
  }

  // ------------------------------------------------------------
  // 6. Oberseite und Flanken: Spiegel, Griffe, Kiemen, Reling, Streifen, Gitter …
  // ------------------------------------------------------------
  /** Dünner Belag, der der Oberseite folgt (z0..z1, x0..x1). */
  function belag(S, K, farbe, z0, z1, x0, x1, dy, nz, kabine) {
    nz = nz || 4;
    for (let i = 0; i < nz; i++) {
      const za = lerp(z0, z1, i / nz), zb = lerp(z0, z1, (i + 1) / nz);
      const p = (z, x) => [x, obenY(K, z, x, kabine) + dy, z];
      S.viereckNach(p(za, x0), p(zb, x0), p(zb, x1), p(za, x1), [0, 1, 0], farbe);
    }
  }
  function baueAnbauten(S, K) {
    const M = K.M, f = M.f;
    // Außenspiegel mit Fuß
    const zSp = M.zWS + (M.zDV - M.zWS) * 0.22 + 0.06;
    const ySp = schulter(M, zSp);
    const xSp = halbBreite(M, zSp, 0.4) * f.schulterX - 0.03;
    const kappe = f.spiegelFarbe === 'dach' ? M.dach : f.spiegelFarbe === 'schwarz' ? FARBE.SCHWARZ : M.oben;
    const gross = M.typ === 'van' ? 1.35 : 1;
    [-1, 1].forEach((s) => {
      if (f.spiegelForm === 'sport') {               // optional: strömungsgünstige Kappe (länger als breit), schwarzer Fuß, Glas nach hinten
        quader(S, FARBE.SCHWARZ, s * (xSp + 0.045), ySp + 0.022, zSp + 0.05, 0.09, 0.04, 0.09);
        quader(S, kappe, s * (xSp + 0.115), ySp + 0.058, zSp + 0.03, 0.12, 0.085, 0.2, 0, s * 0.1);
        quader(S, FARBE.SCHWARZ, s * (xSp + 0.115), ySp + 0.058, zSp + 0.03 + 0.103, 0.1, 0.07, 0.008, 0, s * 0.1);
        return;
      }
      quader(S, FARBE.SCHWARZ, s * (xSp + 0.05), ySp + 0.03, zSp + 0.02, 0.12, 0.04, 0.09);
      quader(S, kappe, s * (xSp + 0.15 * gross), ySp + 0.09 * gross, zSp, 0.2 * gross, 0.12 * gross, 0.1, 0, s * 0.12);
      quader(S, FARBE.SCHWARZ, s * (xSp + 0.15 * gross), ySp + 0.09 * gross, zSp + 0.052, 0.17 * gross, 0.095 * gross, 0.01, 0, s * 0.12);
      if (f.spiegelBlinker) quader(S, 0xff9a1a, s * (xSp + 0.215), ySp + 0.065, zSp - 0.045, 0.045, 0.014, 0.05, 0, s * 0.12);   // Blinker an der Spiegelkappe
    });
    // Chrom-Zierleiste unten an den Türen (zwischen den Radhäusern)
    if (f.schwellerLeiste) {
      const z0 = M.zVA + M.archV + 0.06, z1 = M.zHA - M.archH - 0.06, y = M.sill + 0.075, n = 4;
      [-1, 1].forEach((s) => {
        for (let i = 0; i < n; i++) {
          const za = lerp(z0, z1, i / n), zb = lerp(z0, z1, (i + 1) / n), z = (za + zb) / 2;
          quader(S, FARBE.CHROM, s * (seitenX(K, z, y) + 0.004), y, z, 0.012, 0.018, zb - za + 0.004);
        }
      });
    }
    // Türgriffe (hinten an jeder Tür)
    const griff = f.griffFarbe === 'chrom' ? FARBE.CHROM : M.lackDunkel;
    const yG = M.guertel - 0.11;
    const tuerEnden = M.fugen.slice(1);
    if (M.typ === 'van' && f.schiebetuer) tuerEnden.splice(0, tuerEnden.length, M.fugen[1], M.fugen[2]);
    let griffZ = tuerEnden.map((zE) => zE - 0.17);
    if (f.schiebetuerGriffVorn && M.typ === 'van' && f.schiebetuer && M.fugen.length > 2) griffZ = [M.fugen[1] - 0.2, M.fugen[1] + 0.19];   // Schiebetür-Griff vorn (hinter der B-Säule)
    griffZ.forEach((z) => {
      [-1, 1].forEach((s) => {
        const x = seitenX(K, z, yG);
        quader(S, griff, s * (x + 0.006), yG, z, 0.025, 0.035, 0.16);
      });
    });
    // Seitendekor unten (schwarz + roter Strich, optional) und Charakterlinie der Flanke
    if (f.seitenDeko) {
      const z0 = M.zVA + M.archV + 0.05, z1 = M.zHA - M.archH - 0.05, sd = f.seitenDeko;
      seitenFlaeche(S, K, FARBE.SCHWARZ, z0, z1, M.sill + 0.075, M.sill + 0.075 + sd.h, 4, 0.004);
      seitenFlaeche(S, K, 0xc4281c, z0, z1, M.sill + 0.075 - 0.028, M.sill + 0.075 - 0.01, 4, 0.005);
    }
    if (f.seitenLinie) {
      const sl = f.seitenLinie, z0 = M.zF + sl.z0 * M.L, z1 = M.zF + sl.z1 * M.L;
      seitenFlaeche(S, K, M.lackDunkel, z0, z1, sl.y * M.H, sl.y * M.H + 0.014, sl.n || 8, 0.004);
    }
    if (f.seitenBlinker) {                 // kleiner oranger Blinker vorn an der Flanke + Typenschild
      const sb = f.seitenBlinker, zb = M.zF + (sb.z !== undefined ? sb.z : 0.24), yb = sb.y * M.H;
      seitenFlaeche(S, K, sb.farbe !== undefined ? sb.farbe : 0xffa020, zb, zb + (sb.l || 0.07), yb, yb + (sb.h || 0.032), 1, 0.006);
      if (sb.schild !== false) seitenFlaeche(S, K, FARBE.CHROM, zb + 0.23, zb + 0.37, yb + 0.02, yb + 0.05, 1, 0.006);
    }
    // Schiebetür-Schiene (Van)
    if (f.schiebetuer) {
      const z0 = M.zF + f.schiebetuer * M.L, z1 = M.zHA + M.archH + 0.15;
      const y = M.guertel - 0.035;
      [-1, 1].forEach((s) => {
        const x = seitenX(K, (z0 + z1) / 2, y);
        quader(S, FARBE.SCHWARZ, s * (x + 0.012), y, (z0 + z1) / 2, 0.03, 0.035, z1 - z0);
      });
    }
    // Seitenkieme hinter dem Vorderrad
    if (f.seitenKieme) {
      const z = M.zVA + M.archV + 0.2, y = (M.sill + M.guertel) / 2 + 0.06;
      [-1, 1].forEach((s) => {
        const x = seitenX(K, z, y);
        quader(S, FARBE.SCHWARZ, s * (x + 0.004), y, z, 0.02, 0.06, 0.22, 0, 0, s * 0.1);
        quader(S, FARBE.CHROM, s * (x + 0.01), y + 0.04, z, 0.015, 0.012, 0.22);
      });
    }
    // Rennstreifen auf der Haube
    if (f.streifen) {
      const z0 = M.zF + 0.12, z1 = M.zWS - 0.04;
      [[-0.21, -0.09], [0.09, 0.21]].forEach(([a, b]) => belag(S, K, M.dach, z0, z1, a, b, 0.006, 5));
    }
    // Gulf-Lackierung (optional, f.gulfStreifen = Farbe): zwei Streifen über Haube, Dach-Stoffpaket und Heckdeckel, Seitenstreifen über den Schwellern
    if (f.gulfStreifen !== undefined) {
      const gc = f.gulfStreifen;
      [[-0.2, -0.07], [0.07, 0.2]].forEach(([a, b]) => {
        belag(S, K, gc, M.zF + 0.1, M.zWS - 0.03, a, b, 0.006, 5);
        belag(S, K, gc, M.zEnd + 0.02, M.zR - 0.1, a, b, 0.006, 4);
      });
      const z0 = M.zVA + M.archV + 0.04, z1 = M.zHA - M.archH - 0.04;
      seitenFlaeche(S, K, gc, z0, z1, M.sill + 0.17, M.sill + 0.235, 4, 0.005);
    }
    // Fugen zwischen Haube und Kotflügeln (optional): dünne dunkle Linien von vorn nach hinten, nach außen laufend
    if (f.haubenFugen) {
      const hf = f.haubenFugen, z0 = M.zF + hf.z0, z1 = M.zWS - 0.01, n = 5;
      [-1, 1].forEach((s) => {
        for (let i = 0; i < n; i++) {
          const za = lerp(z0, z1, i / n), zb = lerp(z0, z1, (i + 1) / n);
          const xa = s * lerp(hf.x0, hf.x1, i / n), xb = s * lerp(hf.x0, hf.x1, (i + 1) / n);
          const p = (z, x, d) => [x + d, obenY(K, z, x + d, false) + 0.004, z];
          S.viereckNach(p(za, xa, -0.005), p(zb, xb, -0.005), p(zb, xb, 0.005), p(za, xa, 0.005), [0, 1, 0], M.fuge);
        }
      });
    }
    // Wischer-/Wasserkasten-Streifen (schwarz) am Fuß der Frontscheibe (optional)
    if (f.scheibenRand) belag(S, K, FARBE.SCHWARZ, M.zWS - 0.1, M.zWS + 0.03, -0.66 * M.B / 2, 0.66 * M.B / 2, 0.004, 2);
    // Hauben-Lüftungsschlitze
    if (f.haubenSchlitze) {
      [-1, 1].forEach((s) => {
        for (let i = 0; i < 4; i++) {
          const z = M.zWS - 0.55 + i * 0.07, x = s * 0.36;
          quader(S, FARBE.SCHWARZ, x, obenY(K, z, x) + 0.002, z, 0.2, 0.012, 0.025);
        }
      });
    }
    // Motorgitter auf dem Heckdeckel (Heckmotor)
    if (f.motorgitter) {
      const z0 = M.zEnd + 0.04, z1 = M.zR - (f.motorgitterZ1 || 0.33);
      const gb = f.motorgitterB || 0.36, gn = f.motorgitterN || 6;            // optional: breiteres Gitter, mehr Lamellen
      if (z1 > z0 + 0.05) {
        belag(S, K, FARBE.SCHWARZ, z0, z1, -gb, gb, 0.005, 3);
        for (let i = -gn; i <= gn; i++) {
          const x = i * (f.motorgitterN ? (gb - 0.03) / gn : 0.052), zm = (z0 + z1) / 2;
          quader(S, FARBE.GITTER, x, obenY(K, zm, x) + 0.012, zm, 0.014, 0.012, z1 - z0 - 0.03, Math.atan2(obenY(K, z0, x) - obenY(K, z1, x), z1 - z0) * 0);
        }
      }
    }
    // Dachreling
    if (f.dachreling && !f.cabrio) {
      const rE = f.relingEnden || [0.15, -0.1];                  // optional: Reling über die ganze Dachlänge
      const z0 = M.zDV + rE[0], z1 = M.zDH + rE[1], n = f.relingEnden ? 6 : 5;
      const relingF = f.relingFarbe !== undefined ? f.relingFarbe : FARBE.SCHWARZ;   // optional: Alu statt schwarz
      [-1, 1].forEach((s) => {
        const xr = (z) => {
          const i = K.kabZ.findIndex((q) => q >= z);
          const h = K.kabHalb[Math.max(0, i)];
          return s * h[4][0] * 0.98;
        };
        for (let i = 0; i < n; i++) {
          const za = lerp(z0, z1, i / n), zb = lerp(z0, z1, (i + 1) / n);
          const ya = obenY(K, za, xr(za), true) + 0.05, yb = obenY(K, zb, xr(zb), true) + 0.05;
          const lang = Math.hypot(zb - za, yb - ya);
          quader(S, relingF, xr((za + zb) / 2), (ya + yb) / 2, (za + zb) / 2, 0.035, 0.03, lang + 0.01, -Math.atan2(yb - ya, zb - za));
        }
        [z0, (z0 + z1) / 2, z1].forEach((z) => quader(S, FARBE.SCHWARZ, xr(z), obenY(K, z, xr(z), true) + 0.02, z, 0.04, 0.05, 0.07));
      });
    }
  }

  // ------------------------------------------------------------
  // Rad (Runde 6): Reifen mit Profilrillen + Querblöcken und heller Flanke, Felge 3D (Felgenhorn, Bett, Nabe,
  // 5 Speichen), dahinter Bremsscheibe (der rote Sattel sitzt fest in der Karosserie, siehe bremssattel()).
  // Formel-Slicks: breit, ohne Rillen, mit Felgenabdeckung. Gecacht je Radgröße; höchstens 600 Dreiecke je Rad.
  // Lokal: Achse = x, +x = Außenseite (linke Räder werden um y gewendet).
  // ------------------------------------------------------------
  const GUMMI = { LAUF: 0x18181a, BLOCK: 0x242427, FLANKE: 0x34353a };
  const RAD_BLOECKE = 6;

  /** Quader ohne Unterseite (Querblock auf dem Reifen), Länge b in x, Höhe h radial, Tiefe d tangential. */
  function blockOhneBoden(b, h, d, face) {
    const f0 = (face === undefined ? 3 : face) * 6;   // Flächen: +x, -x, +y, -y, +z, -z
    const g = new THREE.BoxGeometry(b, h, d).toNonIndexed();
    const pos = g.attributes.position.array, nor = g.attributes.normal.array;
    const keep = (arr) => { const o = []; for (let i = 0; i < arr.length; i++) if (i < f0 * 3 || i >= (f0 + 6) * 3) o.push(arr[i]); return o; };
    const g2 = new THREE.BufferGeometry();
    g2.setAttribute('position', new THREE.BufferAttribute(new Float32Array(keep(pos)), 3));
    g2.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(keep(nor)), 3));
    g.dispose();
    return g2;
  }
  function lathe(punkte, seg, eckig) {
    const g = new THREE.LatheGeometry(punkte.map(([a, b]) => new THREE.Vector2(a, b)), seg);
    g.rotateZ(-Math.PI / 2);                       // Drehachse y -> x
    if (eckig) g.deleteAttribute('normal');        // Flächennormalen: Rillenwände heben sich ab
    return g;
  }

  function radGeometrie(r, w, zoll, felgeFarbe, slick, speichen) {
    const doppel = speichen === 'doppel';                   // optional: 5 Doppelspeichen (10 flache, nach außen breiter werdende Speichen)
    const nSp = doppel ? 10 : (speichen || 5);              // optional: andere Speichenzahl (Standard 5)
    const key = [r, w, zoll, felgeFarbe, slick ? 's' : 'n'].join('_') + (nSp === 5 ? '' : '_sp' + nSp) + (doppel ? '_dp' : '');
    if (cache.rad[key]) return cache.rad[key];
    const S = new Sammler();
    const rf = clamp(zoll * 0.0127, r * 0.55, r * 0.8);   // Felgenradius
    const hw = w / 2;
    const x0 = hw - 0.012;                                  // Außenkante der Felge
    const rb = rf * 0.97;                                   // Wulst (Reifen sitzt auf dem Felgenhorn)
    if (slick) {
      // Slick: glatte, breite Lauffläche, kaum Flanke
      const e = hw - 0.05;
      S.geo(lathe([[rb, hw - 0.01], [r - 0.045, hw], [r - 0.008, hw - 0.022], [r, e]], 16), GUMMI.FLANKE);
      S.geo(lathe([[r, e], [r, -e]], 16), GUMMI.LAUF);
      S.geo(lathe([[r, -e], [r - 0.008, -hw + 0.022], [r - 0.045, -hw], [rb, -hw + 0.01]], 16), GUMMI.FLANKE);
      // Felgenabdeckung: Scheibe + heller Ring + Mutter
      const cover = new THREE.CircleGeometry(rf * 0.97, 16); cover.rotateY(Math.PI / 2); cover.translate(x0 - 0.002, 0, 0);
      S.geo(cover, 0x565c67);
      const ring = new THREE.RingGeometry(rf * 0.8, rf * 0.97, 16); ring.rotateY(Math.PI / 2); ring.translate(x0 + 0.002, 0, 0);
      S.geo(ring, 0x9aa0aa);
      const mutter = new THREE.CylinderGeometry(rf * 0.16, rf * 0.16, 0.035, 6); mutter.rotateZ(-Math.PI / 2); mutter.translate(x0 + 0.004, 0, 0);
      S.geo(mutter, 0xc9ced6);
      cache.rad[key] = S.fertig();
      return cache.rad[key];
    }
    // Straßenreifen: Flanke (heller) + Lauffläche mit 2 umlaufenden Rillen
    const e = hw - 0.045, g1 = e * 0.42, gb = 0.02, tiefe = 0.013;
    S.geo(lathe([[rb, hw - 0.012], [r - 0.04, hw], [r - 0.006, hw - 0.03]], 16), GUMMI.FLANKE);
    S.geo(lathe([
      [r - 0.006, hw - 0.03], [r, e], [r, g1 + gb], [r - tiefe, g1], [r, g1 - gb],
      [r, -g1 + gb], [r - tiefe, -g1], [r, -g1 - gb], [r, -e], [r - 0.006, -hw + 0.03],
    ], 16, true), GUMMI.LAUF);
    S.geo(lathe([[r - 0.006, -hw + 0.03], [r - 0.04, -hw], [rb, -hw + 0.012]], 16), GUMMI.FLANKE);
    // Querblöcke (flache Boxen) auf der Lauffläche
    for (let i = 0; i < RAD_BLOECKE; i++) {
      const bl = blockOhneBoden(e * 1.7, 0.012, 0.05);
      bl.translate(0, r + 0.001, 0);
      bl.rotateX(((i + 0.5) / RAD_BLOECKE) * Math.PI * 2);
      S.geo(bl, GUMMI.BLOCK);
    }
    // Felgenbett (dunkel, tief innen) und Bremsscheibe dahinter
    const scheibe = (radius, x, farbe, seg) => {
      const g = new THREE.CircleGeometry(radius, seg || 12);
      g.rotateY(Math.PI / 2);
      g.translate(x, 0, 0);
      S.geo(g, farbe);
    };
    scheibe(rf * 0.97, x0 - 0.11, FARBE.FELGE_INNEN, 12);
    scheibe(rf * 0.7, x0 - 0.075, FARBE.BREMSE, 12);
    // Felgenhorn (Ring, hell) mit dunklem Innenring (Felgenbett)
    const ring = new THREE.RingGeometry(rf * 0.86, rf * 1.0, 12);
    ring.rotateY(Math.PI / 2);
    ring.translate(x0 - 0.004, 0, 0);
    S.geo(ring, felgeFarbe);
    // Nabe
    const nabe = new THREE.CylinderGeometry(rf * 0.2, rf * 0.24, 0.06, 6);
    nabe.rotateZ(-Math.PI / 2);
    nabe.translate(x0 - 0.035, 0, 0);
    S.geo(nabe, felgeFarbe);
    // 5 Speichen als Kranz (optional mehr, dann schmaler)
    for (let i = 0; i < nSp; i++) {
      const wnk = (i * 2 * Math.PI) / nSp;
      const len = rf * 0.72;
      let sp;
      if (doppel) {                                         // Paare: zwei Speichen laufen von der Nabe leicht auseinander
        const a = Math.floor(i / 2) * 2 * Math.PI / 5 + (i % 2 ? 1 : -1) * 0.12;
        sp = new THREE.ShapeGeometry(umriss([[-rf * 0.05, rf * 0.18], [rf * 0.05, rf * 0.18], [rf * 0.09, rf * 0.97], [-rf * 0.09, rf * 0.97]]));
        sp.rotateY(Math.PI / 2); sp.translate(x0 - 0.013, 0, 0); sp.rotateX(a);
        S.geo(sp, felgeFarbe);
        continue;
      }
      if (nSp > 5) {                                       // viele Speichen: nur die sichtbare Außenfläche (spart Dreiecke)
        sp = new THREE.PlaneGeometry(rf * 0.13, len); sp.rotateY(Math.PI / 2); sp.translate(x0 - 0.013, rf * 0.18 + len / 2, 0);
      } else {
        sp = blockOhneBoden(0.03, len, rf * 0.2, 1);       // Innenseite (-x) wird nie gesehen
        sp.translate(x0 - 0.028, rf * 0.18 + len / 2, 0);
      }
      sp.rotateX(wnk);
      S.geo(sp, felgeFarbe);
    }
    cache.rad[key] = S.fertig();
    return cache.rad[key];
  }

  /** Roter Bremssattel, fest in der Karosserie (dreht nicht mit dem Rad) – sitzt an der Bremsscheibe, hinten-oben. */
  function bremssattel(S, a, M) {
    const rf = clamp((a.vorn ? M.zollV : M.zollH) * 0.0127, a.r * 0.55, a.r * 0.8);
    const hw = a.w / 2, xs = hw - 0.012 - 0.075;
    [-1, 1].forEach((s) => {
      const wnk = 0.9;                                   // Winkel von „oben" nach hinten
      const ry = a.r + Math.cos(wnk) * rf * 0.55, rz = a.z + Math.sin(wnk) * rf * 0.55;
      quader(S, 0xc4141b, s * (a.x + xs), ry, rz, 0.075, rf * 0.34, rf * 0.34);
    });
  }

  // ------------------------------------------------------------
  // 7. Blaulichtbalken auf dem Dach (form.blaulicht, z. B. Streifenwagen)
  //    Sockel/Halter -> Karosserie-Sammler S; Leuchten -> BLAU[0] (links, -x) und BLAU[1] (rechts, +x)
  // ------------------------------------------------------------
  function baueBlaulicht(S, BLAU, K) {
    const M = K.M;
    const z = lerp(M.zDV, M.zDH, 0.22);
    const y = obenY(K, z, 0, true);
    const halb = K.kabHalb[Math.max(0, K.kabZ.findIndex((q) => q >= z))];
    const b = Math.min(1.2, 2 * halb[4][0] + 0.06);            // Balkenbreite ≈ Dachbreite
    // Füße und Sockel
    [-1, 1].forEach((s) => quader(S, FARBE.SCHWARZ, s * b * 0.36, y + 0.02, z, 0.08, 0.05, 0.22));
    quader(S, FARBE.SCHWARZ, 0, y + 0.05, z, b, 0.035, 0.3);
    quader(S, FARBE.CHROM, 0, y + 0.11, z, 0.14, 0.09, 0.26);  // silbernes Mittelstück
    // Leuchten: zweistufig (breiter Körper + schmalere Kuppe) für eine weichere Form
    [-1, 1].forEach((s, si) => {
      const w = b / 2 - 0.08, x = s * (0.07 + w / 2);
      BLAU[si].geo(setze(new THREE.BoxGeometry(w, 0.09, 0.28), x, y + 0.11, z), 0);
      BLAU[si].geo(setze(new THREE.BoxGeometry(w - 0.06, 0.035, 0.2), x, y + 0.17, z), 0);
    });
  }

  // ------------------------------------------------------------
  // 7b. Rettungsdienst-Warnmarkierung (form.rettungDekor, 15.10. v25): Battenburg-Muster leuchtgelb/rot (DIN-Stil) als Flächenfarben in der Karosserie
  //     (kein eigener Draw-Call): unterer Streifen zwischen den Radhäusern auf beiden Seiten, breite Doppelreihe auf den Hecktüren, Streifen vorn an der Haube.
  // ------------------------------------------------------------
  function baueRettungDekor(S, K) {
    const M = K.M, GELB = 0xdcf11a, ROT = 0xd4141c;
    // Seiten: zwei Reihen Quadrate unter der roten Flanke, zwischen den Radhäusern (Vorder- und Hinterachse)
    const z0 = M.zVA + M.archV + 0.10, z1 = M.zHA - M.archH - 0.10, n = Math.max(6, Math.round((z1 - z0) / 0.2)), zs = (z1 - z0) / n;
    const yu = M.sill + 0.025, hr = 0.095;
    [0, 1].forEach((reihe) => {
      for (let i = 0; i < n; i++) {
        const za = z0 + i * zs, zb = za + zs, farbe = (i + reihe) % 2 ? ROT : GELB;
        seitenFlaeche(S, K, farbe, za, zb, yu + reihe * hr, yu + (reihe + 1) * hr, 1, 0.006);
      }
    });
    // Heck: Battenburg über die ganze Breite, 2 Reihen
    const H = M.H, hb = 0.88 * (M.B / 2);
    for (let reihe = 0; reihe < 2; reihe++) {
      const nx = 10;
      for (let i = 0; i < nx; i++) {
        const xa = -hb + (2 * hb) * i / nx, xb = -hb + (2 * hb) * (i + 1) / nx;
        anbauLeisteFlach(S, K, (i + reihe) % 2 ? ROT : GELB, 'hinten', xa, xb, H * 0.255 + reihe * 0.12, 0.12, 0.004, 1);
      }
    }
  }

  // ------------------------------------------------------------
  // 8. Formel-Renner (Typ 'formel'): Monoposto aus eigenem Loft + Anbauteilen
  //    Nase, Frontflügel, Seitenkästen, Airbox, Halo-Bügel, Heckflügel, Fahrerhelm, Radaufhängung;
  //    freistehende Räder (keine Radhäuser). Generisch: Startnummer 1, keine Logos/Sponsoren.
  // ------------------------------------------------------------
  /** Stab (Quader) von Punkt p nach q (z. B. Querlenker). */
  function stab(S, farbe, p, q, b, h) {
    const a = new THREE.Vector3(p[0], p[1], p[2]), e = new THREE.Vector3(q[0], q[1], q[2]);
    const d = e.clone().sub(a), len = d.length();
    const g = new THREE.BoxGeometry(b, h || b, len);
    const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), d.normalize());
    g.applyMatrix4(new THREE.Matrix4().compose(a.add(e).multiplyScalar(0.5), quat, new THREE.Vector3(1, 1, 1)));
    S.geo(g, farbe);
  }
  /** Flache Ziffer „1" (aus drei Balken) in der Ebene: u = rechts, v = oben, n = Normale (Einheitsvektoren). */
  function zifferEins(S, farbe, mitte, u, v, h) {
    const st = h * 0.17;
    const teil = (cu, cv, bu, bv, wnk) => {
      const g = new THREE.BoxGeometry(bu, bv, 0.012);
      g.rotateZ(wnk || 0);
      g.translate(cu, cv, 0);
      const n = new THREE.Vector3().crossVectors(u, v);
      const m = new THREE.Matrix4().makeBasis(u, v, n).setPosition(mitte);
      g.applyMatrix4(m);
      S.geo(g, farbe);
    };
    teil(0, 0, st, h);                                         // Hauptstrich
    teil(-h * 0.14, h * 0.36, st * 0.9, h * 0.34, -0.85);     // Fähnchen oben links
    teil(0, -h / 2 + st / 2, h * 0.5, st);                     // Fuß
  }

  function baueFormel(S, BL, M) {
    const f = M.f, blau = M.lack, weiss = M.farbe2 !== undefined ? M.farbe2 : FARBE.WEISS;
    const zF = M.zF, zR = M.zR;                                // ±L/2
    const zNase = zF + 0.13, zEnde = zR - 0.43;                // Rumpf: Nasenspitze bis Getriebe
    const zVA = M.zVA, zHA = M.zHA;
    // --- Profile des Rumpfs (alle über z) ---
    const P = {
      hm: [[zNase, 0.07], [zNase + 0.4, 0.11], [zVA + 0.2, 0.19], [zVA + 0.85, 0.29], [zVA + 1.45, 0.35], [zVA + 2.3, 0.29], [zHA - 0.3, 0.17], [zEnde, 0.12]],
      pod: [[zVA + 0.85, 0], [zVA + 1.15, 0.70], [zVA + 1.95, 0.72], [zVA + 2.75, 0.44], [zHA - 0.25, 0.2], [zEnde, 0]],
      yb: [[zNase, 0.21], [zVA + 0.1, 0.16], [zVA + 0.75, 0.07], [zHA - 0.3, 0.08], [zEnde, 0.13]],
      yt: [[zNase, 0.29], [zNase + 0.5, 0.40], [zVA + 0.4, 0.53], [zVA + 1.0, 0.64], [zVA + 1.55, 0.655], [zVA + 1.75, 0.80],
        [zVA + 1.9, 0.935], [zVA + 2.15, 0.95], [zVA + 2.8, 0.74], [zHA - 0.1, 0.52], [zEnde, 0.43]],
      yp: [[zVA + 0.85, 0.40], [zVA + 1.2, 0.50], [zVA + 2.0, 0.52], [zVA + 2.9, 0.37], [zEnde, 0.30]],
    };
    const hm = (z) => kurve(P.hm, z), yb = (z) => kurve(P.yb, z), yt = (z) => kurve(P.yt, z);
    const hp = (z) => Math.max(hm(z), (z > P.pod[0][0] && z < zEnde) ? kurve(P.pod, z) : 0);
    const yp = (z) => {
      const b = yb(z), t = yt(z);
      const roh = hp(z) > hm(z) + 0.01 ? kurve(P.yp, z) : lerp(b, t, 0.45);
      return clamp(roh, b + 0.04, t - 0.03);
    };
    const zCockpit0 = zVA + 0.98, zCockpit1 = zVA + 1.62;      // Cockpit-Öffnung
    const zEinlass0 = zVA + 0.85, zEinlass1 = zVA + 1.2;        // Seitenkasten-Lufteinlass
    function halbRing(z) {
      const b = yb(z), t = yt(z), m = hm(z), p = hp(z), q = yp(z), d = q - b;
      let top = t;
      if (z > zCockpit0 && z < zCockpit1) top = t - 0.1 * kosFenster(z - (zCockpit0 + zCockpit1) / 2, (zCockpit1 - zCockpit0) / 2);
      return [
        [m * 0.9, b], [p, b + 0.2 * d], [p, b + 0.8 * d], [lerp(m, p, 0.9), q], [lerp(m, p, 0.3), q + Math.min(0.02, 0.1 * (t - q))],
        [m, lerp(q, t, 0.55)], [m * 0.6, t - 0.012], [0, top],
      ].map(([x, y]) => [x, y, z]);
    }
    // Stationen: dicht an der Nase, an Einlass/Cockpit/Airbox und am Ende
    const zs = [];
    for (let z = zNase; z < zEnde - 0.01; z += 0.1) zs.push(z);
    [zNase + 0.02, zNase + 0.05, zEinlass0, zEinlass0 + 0.06, zEinlass1, zCockpit0, zCockpit1, zVA + 1.75, zVA + 1.85, zEnde - 0.04, zEnde]
      .forEach((z) => { if (!zs.some((q) => Math.abs(q - z) < 0.025)) zs.push(z); });
    zs.sort((a, b) => a - b);
    const halbe = zs.map(halbRing);
    const ringe = halbe.map(vollRing);
    const nr = ringe[0].length, mitteJ = (nr - 1) / 2;
    loft(S, ringe, zs, (i, j) => {
      const zm = (zs[i] + zs[i + 1]) / 2;
      const k = j < mitteJ ? j : nr - 2 - j;
      const hatPod = hp(zm) > hm(zm) + 0.05;
      if (k === 0) return FARBE.SCHWARZ;                                      // Unterseite
      if (k >= 1 && k <= 3 && zm > zEinlass0 - 0.02 && zm < zEinlass1 && hatPod) return FARBE.SCHWARZ;  // Lufteinlass
      if (k === 7 - 1 && zm > zCockpit0 && zm < zCockpit1) return FARBE.INNEN;                     // Cockpit
      if ((k === 3 || k === 4) && hatPod) return weiss;                       // weißer Streifen auf den Seitenkästen
      if (zm < zNase + 0.35 && k >= 5) return weiss;                          // weiße Nasenspitze
      if (k === 6 && zm > zVA + 1.75 && zm < zVA + 2.5) return weiss;         // weißer Rücken hinter der Airbox
      return blau;
    });
    deckel(S, ringe[0], [0, 0, -1], weiss);
    deckel(S, ringe[ringe.length - 1], [0, 0, 1], FARBE.SCHWARZ);

    // --- Unterboden (flach, mit Seitenkante) und Diffusor ---
    quader(S, FARBE.SCHWARZ, 0, 0.045, (zVA + 0.45 + zHA - 0.42) / 2, 1.26, 0.03, (zHA - 0.42) - (zVA + 0.45));
    quader(S, FARBE.SCHWARZ, 0, 0.11, zHA + 0.05, 0.9, 0.025, 0.55, 0.32);
    // --- Airbox-Öffnung über dem Fahrerkopf ---
    const zAir = zVA + 1.72;
    quader(S, FARBE.SCHWARZ, 0, yt(zAir) - 0.045, zAir + 0.02, 0.17, 0.12, 0.05);
    // --- Haifischflosse auf der Motorabdeckung ---
    const flosse = [];
    for (let z = zVA + 2.2; z <= zEnde - 0.05; z += 0.12) flosse.push([z, yt(z) - 0.02]);
    const zf1 = zEnde - 0.05;
    flosse.push([zf1, yt(zf1) + 0.2], [zVA + 2.2, yt(zVA + 2.2) + 0.02]);
    const gFl = new THREE.ExtrudeGeometry(umriss(flosse), { depth: 0.014, bevelEnabled: false });
    gFl.rotateY(-Math.PI / 2); gFl.translate(0.007, 0, 0);
    S.geo(gFl, blau);
    // --- Fahrerhelm mit Visier ---
    const zHelm = zVA + 1.42;
    S.geo(setze(new THREE.SphereGeometry(0.13, 12, 8), 0, 0.73, zHelm), f.helm || 0xffcc1a);
    quader(S, FARBE.SCHWARZ, 0, 0.75, zHelm - 0.105, 0.2, 0.055, 0.06, 0.15);
    // --- Halo-Bügel (Schutzbügel über dem Cockpit) ---
    const hy = 0.86, haloPkt = [[-0.27, 0.64, zHelm + 0.22], [-0.27, 0.82, zHelm + 0.05], [-0.21, hy, zHelm - 0.2], [0, hy + 0.01, zHelm - 0.35],
      [0.21, hy, zHelm - 0.2], [0.27, 0.82, zHelm + 0.05], [0.27, 0.64, zHelm + 0.22]].map(([x, y, z]) => new THREE.Vector3(x, y, z));
    S.geo(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(haloPkt), 18, 0.026, 6, false), FARBE.SCHWARZ);
    stab(S, FARBE.SCHWARZ, [0, hy, zHelm - 0.35], [0, yt(zHelm - 0.6) - 0.02, zHelm - 0.6], 0.05, 0.035);
    // --- Rückspiegel ---
    [-1, 1].forEach((s) => {
      const z = zCockpit0 - 0.05, x = s * (hm(z) + 0.13);
      stab(S, FARBE.SCHWARZ, [s * hm(z) * 0.8, yt(z) - 0.03, z], [x, 0.69, z], 0.025);
      quader(S, blau, x + s * 0.05, 0.7, z, 0.13, 0.065, 0.05);
      quader(S, FARBE.GLAS, x + s * 0.05, 0.7, z + 0.027, 0.11, 0.05, 0.006);
    });
    // --- Startnummer „1" (generisch): auf der Nase ---
    // liegend auf der Nase, lesbar von vorn: v zeigt nach hinten die Nase hinauf, u = rechts des Betrachters (-x)
    const zNr = zNase + 0.6, steig = (yt(zNr + 0.05) - yt(zNr - 0.05)) / 0.1;
    zifferEins(S, weiss, new THREE.Vector3(0, yt(zNr) + 0.008, zNr), new THREE.Vector3(-1, 0, 0),
      new THREE.Vector3(0, steig, 1).normalize(), 0.2);

    // --- Frontflügel: Hauptblatt + 2 Klappen, Endplatten, Halter zur Nase ---
    const zW = zF + 0.13, bW = M.B - 0.12;
    quader(S, blau, 0, 0.085, zW, bW, 0.025, 0.25, 0.06);
    [-1, 1].forEach((s) => {
      const xm = s * (0.25 + (bW / 2 - 0.25) / 2), bb = bW / 2 - 0.25;
      quader(S, FARBE.SCHWARZ, xm, 0.13, zW + 0.1, bb, 0.018, 0.12, -0.35);
      quader(S, weiss, xm, 0.175, zW + 0.15, bb, 0.016, 0.09, -0.6);
      quader(S, weiss, s * (bW / 2 + 0.01), 0.15, zF + 0.18, 0.02, 0.2, 0.36);     // Endplatte
      stab(S, FARBE.SCHWARZ, [s * 0.06, 0.095, zW + 0.05], [s * 0.05, yb(zNase + 0.15) + 0.01, zNase + 0.15], 0.025, 0.06);
    });
    // --- Heckflügel: Hauptblatt, Klappe, Beam-Wing, Endplatten (mit Leuchtstreifen), Halter ---
    const zHF = zR - 0.2, bH = 1.0;
    quader(S, FARBE.SCHWARZ, 0, 0.79, zHF, bH, 0.03, 0.3, 0.12);
    quader(S, blau, 0, 0.885, zHF + 0.06, bH, 0.022, 0.17, 0.45);
    quader(S, FARBE.SCHWARZ, 0, 0.43, zHF - 0.04, bH * 0.92, 0.02, 0.2, 0.1);
    [-1, 1].forEach((s) => {
      const x = s * (bH / 2 + 0.01);
      quader(S, blau, x, 0.65, zR - 0.215, 0.02, 0.6, 0.43);
      zifferEins(S, weiss, new THREE.Vector3(x + s * 0.0125, 0.62, zR - 0.24), new THREE.Vector3(0, 0, -s), new THREE.Vector3(0, 1, 0), 0.22);
      BL[1].geo(setze(new THREE.BoxGeometry(0.025, 0.24, 0.02), x, 0.66, zR - 0.006), 0);
    });
    stab(S, FARBE.SCHWARZ, [0, yt(zEnde) - 0.05, zEnde - 0.05], [0, 0.785, zHF - 0.02], 0.04, 0.09);
    // Crashstruktur + Regenlicht (Bremslicht) am Heck
    quader(S, FARBE.SCHWARZ, 0, 0.3, zEnde + 0.06, 0.16, 0.13, 0.13);
    BL[0].geo(setze(new THREE.BoxGeometry(0.11, 0.06, 0.02), 0, 0.31, zEnde + 0.13), 0);

    // --- Radaufhängung: je Rad zwei Querlenker + Spurstange zum Rumpf ---
    const raeder = [
      { vorn: true, z: zVA, r: M.rV, w: M.wV, x: M.B / 2 - M.wV / 2 },
      { vorn: false, z: zHA, r: M.rH, w: M.wH, x: M.B / 2 - M.wH / 2 },
    ];
    raeder.forEach((a) => {
      const xi = a.x - a.w / 2 + 0.04;
      [-1, 1].forEach((s) => {
        const zk = clamp(a.z, zNase + 0.3, zEnde - 0.1);
        const xk = hm(zk) * 0.9, yo = Math.min(yt(zk) - 0.05, a.r + 0.13);
        stab(S, FARBE.SCHWARZ, [s * xk, yo, zk - 0.16], [s * xi, a.r + 0.1, a.z], 0.03, 0.022);
        stab(S, FARBE.SCHWARZ, [s * xk, yo, zk + 0.16], [s * xi, a.r + 0.1, a.z], 0.03, 0.022);
        stab(S, FARBE.SCHWARZ, [s * xk, yb(zk) + 0.03, zk - 0.18], [s * xi, a.r - 0.1, a.z], 0.03, 0.022);
        stab(S, FARBE.SCHWARZ, [s * xk, yb(zk) + 0.03, zk + 0.18], [s * xi, a.r - 0.1, a.z], 0.03, 0.022);
        quader(S, FARBE.KUNSTSTOFF, s * (xi - 0.03), a.r, a.z, 0.06, 0.26, 0.14);   // Radträger
      });
    });
    return raeder.map((a) => Object.assign(a, { geo: radGeometrie(a.r, a.w, a.vorn ? M.zollV : M.zollH, f.felgeFarbe, true) }));
  }

  // ------------------------------------------------------------
  // 9. Polizei-Dekor (form.polizeiDekor, 14.10. v20): Schriftzug „POLIZEI“ als Canvas-Textur auf Seiten, Haube und Heck.
  //    EIN zusätzliches Mesh 'polizeiDekor' (alle Flächen in einer Geometrie, ein Textur-Atlas 1024 × 512):
  //    Zeile 0–128 Seite (weiß auf der blauen Flanke), 128–352 Haube (blau auf Silber, von vorn lesbar), 352–512 Heck.
  // ------------------------------------------------------------
  const DEKOR_TEX = { w: 1024, h: 512, seite: [0, 128], haube: [128, 352], heck: [352, 512] };
  function bauePolizeiDekor(M, K) {
    const pos = [], nrm = [], uv = [], idx = [];
    const gitter = (nu, nv, reg, punkt, normal) => {
      const base = pos.length / 3, [y0, y1] = DEKOR_TEX[reg];
      for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) {
        const u = i / nu, v = j / nv, p = punkt(u, v);
        pos.push(p[0], p[1], p[2]); nrm.push(normal[0], normal[1], normal[2]);
        uv.push(u, 1 - (y1 - (y1 - y0) * v) / DEKOR_TEX.h);
      }
      for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
        const a = base + j * (nu + 1) + i, b = a + 1, c = b + nu + 1, d = a + nu + 1;
        idx.push(a, b, c, a, c, d);
      }
    };
    // Seiten: zwischen den Radhäusern, auf dem blauen Flankenband (Ring-Segment 2)
    const z0 = M.zVA + M.archV + 0.08, z1 = M.zHA - M.archH - 0.08, zc = (z0 + z1) / 2, len = Math.min(1.6, z1 - z0), h = len / 8;
    const yc = lerp(M.sill, schulter(M, zc), 0.56);
    [-1, 1].forEach((sd) => {
      gitter(8, 1, 'seite', (u, v) => {
        const z = sd > 0 ? zc + (0.5 - u) * len : zc - len / 2 + u * len, y = yc - h / 2 + v * h;
        return [sd * (seitenX(K, z, y) + 0.006), y, z];
      }, [sd, 0, 0]);
    });
    // Haube: von vorn lesbar (u nach −x, v nach hinten)
    const hz = lerp(M.zF, M.zWS, 0.56), hb = 0.92, hh = hb * 224 / 1024;
    gitter(6, 2, 'haube', (u, v) => {
      const x = -(u - 0.5) * hb, z = hz - hh / 2 + v * hh;
      return [x, obenY(K, z, x) + 0.006, z];
    }, [0, 1, 0]);
    // Heck: Streifen auf der Heckklappe an Stelle des PASSAT-Schriftzugs
    const ry = M.H * 0.575, rb = 0.8, rh = rb * 160 / 1024;
    gitter(4, 1, 'heck', (u, v) => {
      const x = (u - 0.5) * rb, y = ry - rh / 2 + v * rh, z = flaecheZ(K, 'hinten', x, y);
      return [x, y, (z === null ? M.zR : z) + 0.005];
    }, [0, 0, 1]);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    return g;
  }
  /** Canvas-Textur mit dem Schriftzug (nur im Browser; ohne document → null, das Dekor-Mesh bleibt dann unsichtbar). */
  // 15.10. (v25): Dekor-Varianten: 'POLIZEI' (Standard, unverändert) oder z. B. 'RETTUNGSDIENST' (Krankenwagen: weiße Schrift auf der roten Flanke,
  // rote Schrift auf Haube und Heck). Schlüssel im Cache: Text; der Polizei-Eintrag behält seinen alten Namen.
  const DEKOR_FARBEN = { POLIZEI: { seite: '#f4f6f8', haube: '#1d4fb0', heck: '#1d4fb0', linien: true },
    RETTUNGSDIENST: { seite: '#ffffff', haube: '#d4141c', heck: '#d4141c', linien: false } };
  function dekorSchluessel(text) { return !text || text === 'POLIZEI' ? 'polizeiDekor' : 'dekor_' + text; }
  function polizeiTextur(dtext) {
    const dtxt = dtext || 'POLIZEI', dkey = dekorSchluessel(dtext), DF = DEKOR_FARBEN[dtxt] || DEKOR_FARBEN.POLIZEI;
    if (cache.material[dkey] !== undefined) return cache.material[dkey];
    let tex = null;
    try {
      if (typeof document !== 'undefined' && THREE.CanvasTexture) {
        const T = DEKOR_TEX, c = document.createElement('canvas');
        c.width = T.w; c.height = T.h;
        const x = c.getContext('2d');
        x.clearRect(0, 0, T.w, T.h);
        const BLAU = DF.haube, WEISS = DF.seite;
        const text = (reg, farbe, breiteAnteil, spiegeln) => {
          const [y0, y1] = T[reg], hh = y1 - y0;
          let px = hh * 0.9;
          x.font = '800 ' + px + 'px "Arial Black", Arial, Helvetica, sans-serif';
          x.textBaseline = 'middle'; x.textAlign = 'center';
          const buchst = dtxt.split(''), luecke = hh * 0.1;
          let w = buchst.reduce((a, ch) => a + x.measureText(ch).width, 0) + luecke * (buchst.length - 1);
          const soll = T.w * breiteAnteil;
          if (w > soll) { px *= soll / w; x.font = '800 ' + px + 'px "Arial Black", Arial, Helvetica, sans-serif'; w = soll; }
          let cx = (T.w - w) / 2;
          x.fillStyle = farbe; x.textAlign = 'left';
          x.strokeStyle = farbe; x.lineWidth = px * 0.05; x.lineJoin = 'round';
          buchst.forEach((ch) => { const bw = x.measureText(ch).width, yy = (y0 + y1) / 2 + hh * 0.04; x.strokeText(ch, cx, yy); x.fillText(ch, cx, yy); cx += bw + luecke * (px / (hh * 0.9)); });
        };
        text('seite', WEISS, 0.9);
        // Haube: blaue Schrift mit schmalen Linien darüber/darunter
        text('haube', BLAU, 0.9);
        if (DF.linien) { x.fillStyle = BLAU; x.fillRect(T.w * 0.05, T[ 'haube' ][0] + 6, T.w * 0.9, 7); x.fillRect(T.w * 0.05, T['haube'][1] - 13, T.w * 0.9, 7); }
        // Heck: Schrift in der Haubenfarbe
        text('heck', DF.heck, 0.88);
        tex = new THREE.CanvasTexture(c);
        if (THREE.sRGBEncoding !== undefined && 'encoding' in tex) tex.encoding = THREE.sRGBEncoding;
        else if (THREE.SRGBColorSpace !== undefined && 'colorSpace' in tex) tex.colorSpace = THREE.SRGBColorSpace;
        tex.anisotropy = 4;
      }
    } catch (e) { tex = null; }
    cache.material[dkey] = tex;
    return tex;
  }
  function polizeiDekorMaterial(dtext) {
    const mk = dekorSchluessel(dtext) + 'Mat';
    if (!cache.material[mk]) {
      const map = polizeiTextur(dtext);
      cache.material[mk] = new THREE.MeshLambertMaterial({ map, transparent: true, depthWrite: false, polygonOffset: true,
        polygonOffsetFactor: -2, polygonOffsetUnits: -2, side: THREE.FrontSide, emissive: 0x4a4a4a });
      cache.material[mk].userData.ohneTextur = !map;
    }
    return cache.material[mk];
  }

  // ------------------------------------------------------------
  // Material, Schatten
  // ------------------------------------------------------------
  function karosserieMaterial() {
    if (!cache.material.karosserie) cache.material.karosserie = new THREE.MeshLambertMaterial({ vertexColors: true });
    return cache.material.karosserie;
  }
  function scheinwerferMaterial() {
    if (!cache.material.scheinwerfer) cache.material.scheinwerfer = new THREE.MeshBasicMaterial({ color: SCHEINWERFER });
    return cache.material.scheinwerfer;
  }
  function material(farbe) { return new THREE.MeshLambertMaterial({ color: farbe }); }

  /** Blob-Schatten; zusatzL/zusatzB = Rand um das Auto (Formel-Renner: schmaler, die Räder stehen frei). */
  function schattenMesh(L, B, zusatzL, zusatzB) {
    if (!cache.schatten) {
      let map = null;
      try {
        const c = document.createElement('canvas');
        c.width = 128; c.height = 256;
        const g = c.getContext('2d');
        g.translate(64, 128); g.scale(1, 2);
        const grad = g.createRadialGradient(0, 0, 0, 0, 0, 64);
        grad.addColorStop(0, 'rgba(0,0,0,0.85)');
        grad.addColorStop(0.6, 'rgba(0,0,0,0.6)');
        grad.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = grad;
        g.fillRect(-64, -64, 128, 128);
        map = new THREE.CanvasTexture(c);
      } catch (e) { map = null; }
      cache.schatten = new THREE.MeshBasicMaterial(map
        ? { map, transparent: true, opacity: 0.55, depthWrite: false }
        : { color: 0x000000, transparent: true, opacity: 0.3, depthWrite: false });
    }
    const m = new THREE.Mesh(new THREE.PlaneGeometry(B + (zusatzB !== undefined ? zusatzB : 0.9), L + (zusatzL !== undefined ? zusatzL : 1.0)), cache.schatten);
    m.rotation.x = -Math.PI / 2;
    m.position.y = 0.02;
    m.name = 'schatten';
    return m;
  }

  // ------------------------------------------------------------
  // Hauptfunktion
  // ------------------------------------------------------------
  /** Karosserie, Lichter-Geometrien und Radlagen für ein Auto erzeugen (gecacht). */
  function karosserieBauen(auto) {
    const M = modell(auto);
    const S = new Sammler();
    const BL = [new Sammler(), new Sammler()];
    if (M.typ === 'formel') {
      const raeder = baueFormel(S, BL, M);
      return { geo: S.fertig(), sw: [], bl: BL.map((s) => s.fertig()), blau: [], raeder, M, schatten: [0.4, 0.3] };
    }
    M._mitte = mitteProfil(M);
    const K = { M };
    const SW = [new Sammler(), new Sammler()];
    const BLAU = [new Sammler(), new Sammler()];
    baueRumpf(S, K);
    if (M.f.cabrio) baueCabrio(S, K); else baueKabine(S, K);
    baueRadhaeuser(S, K);
    baueFront(S, SW, K);
    baueHeck(S, BL, K);
    baueAnbauten(S, K);
    if (M.f.blaulicht && !M.f.cabrio) baueBlaulicht(S, BLAU, K);
    if (M.f.rettungDekor) baueRettungDekor(S, K);     // 15.10. (v25): Krankenwagen – Battenburg-Warnmarkierung
    const dach = baueDach(M, K);
    const dekor = M.f.polizeiDekor ? bauePolizeiDekor(M, K) : null;
    const raeder = achsen(M).map((a) => ({
      vorn: a.vorn, z: a.zc, r: a.r, w: a.w, x: halbBreite(M, a.zc, 1) - a.w / 2 - 0.005,   // Rad steht leicht nach außen
      geo: radGeometrie(a.r, a.w, a.vorn ? M.zollV : M.zollH, M.f.felgeFarbe, false, M.f.felgeSpeichen),
    }));
    raeder.forEach((a) => bremssattel(S, a, M));
    return { geo: S.fertig(), sw: SW.map((s) => s.fertig()), bl: BL.map((s) => s.fertig()), buegel: K.buegel ? K.buegel.fertig() : null,
      blau: M.f.blaulicht && !M.f.cabrio ? BLAU.map((s) => s.fertig()) : [], raeder, M, schatten: null, dach, dekor };
  }

  /**
   * Baut ein Auto aus einem Katalog-Eintrag (Rennspiel.carCatalog[i]).
   * @returns {THREE.Group} Ursprung = Bodenmitte, Front bei -z
   */
  function bauen(autoDaten, opt) {
    // 15.10. (v25): Sonderbauten (z. B. Abschleppwagen, world/verkehr.js): auto.sonderbau = Name in R.sonderbauten → eigene Gruppe mit denselben userData-Feldern
    if (autoDaten && autoDaten.sonderbau && R.sonderbauten && R.sonderbauten[autoDaten.sonderbau]) return R.sonderbauten[autoDaten.sonderbau](autoDaten, opt);
    // Optionen: auto.optionen = { dach: 'offen'|'zu', lack: <Schlüssel aus auto.lackVarianten, z. B. 'gulf'> } und/oder bauen(auto, { dach, lack, farbe }).
    // opt überschreibt auto.optionen. Lack: Variante wird in farbe/farbeName/form gemischt (eigener Cache-Eintrag), danach gilt opt.farbe (Garage).
    const optionen = Object.assign({}, autoDaten.optionen || {}, opt || {});
    if (optionen.lack && autoDaten.lackVarianten && autoDaten.lackVarianten[optionen.lack] && Object.keys(autoDaten.lackVarianten[optionen.lack]).length) {
      const v = autoDaten.lackVarianten[optionen.lack];
      autoDaten = Object.assign({}, autoDaten, v, v.form ? { form: Object.assign({}, autoDaten.form, v.form) } : {});
    }
    // 14.10. (v20): optionen.lichtbalken = true → Lichtbalken + Blaulicht auf dem Dach (form.blaulicht), z. B. Streifenwagen = Passat mit lack 'polizei'
    if (optionen.lichtbalken && !(autoDaten.form && autoDaten.form.blaulicht)) autoDaten = Object.assign({}, autoDaten, { form: Object.assign({}, autoDaten.form, { blaulicht: true }) });
    else if (optionen.lichtbalken === false && autoDaten.form && autoDaten.form.blaulicht) autoDaten = Object.assign({}, autoDaten, { form: Object.assign({}, autoDaten.form, { blaulicht: false }) });
    // Runde 6 (W3-G): Garage-Lack – bauen(auto, { farbe: 0xff5fb8 }) ersetzt die Hauptfarbe (Formel-Renner: Hauptlack,
    // farbe2 bleibt). Ohne opt/farbe = Katalogfarbe → derselbe Cache-Eintrag wie bisher (Standard-Autos unverändert);
    // die Farbe steht im Cache-Schlüssel, jede Garage-Farbe bekommt also eine eigene Karosserie-Geometrie.
    // 14.10. (v20): auch auto.optionen.farbe (Computer-Gegner in anderen Lackfarben) wirkt wie opt.farbe
    if (optionen.farbe !== undefined && optionen.farbe !== null && Number.isFinite(optionen.farbe) && optionen.farbe !== autoDaten.farbe) {
      autoDaten = Object.assign({}, autoDaten, { farbe: optionen.farbe >>> 0 });
    }
    const typ = TYP_STANDARD[autoDaten.karosserie] ? autoDaten.karosserie : 'limousine';
    const key = JSON.stringify([autoDaten.id, typ, autoDaten.farbe, autoDaten.farbe2, autoDaten.abmessungen, autoDaten.form,
      autoDaten.fahrwerte && autoDaten.fahrwerte.laenge, autoDaten.fahrwerte && autoDaten.fahrwerte.breite]);
    let e = cache.karosserie[key];
    if (!e) { e = karosserieBauen(autoDaten); cache.karosserie[key] = e; }

    const g = new THREE.Group();
    g.name = autoDaten.id || typ;
    const koerper = new THREE.Mesh(e.geo, karosserieMaterial());
    koerper.name = 'karosserie';
    g.add(koerper);

    const scheinwerfer = e.sw.map((geo) => {
      const m = new THREE.Mesh(geo, scheinwerferMaterial());
      m.name = 'scheinwerfer';
      g.add(m);
      return m;
    });
    // Rücklichter: eigenes Material je Auto, damit sie einzeln heller werden können
    const bremslichtMat = new THREE.MeshBasicMaterial({ color: LICHT_AUS });
    const bremslichter = e.bl.map((geo) => {
      const m = new THREE.Mesh(geo, bremslichtMat);
      m.name = 'bremslicht';
      g.add(m);
      return m;
    });

    // Räder: Halter (Lenkung um y) -> Rad-Mesh (Rollen um x); linke Räder um y gewendet
    const raeder = [], vorderraeder = [], lenkObjekte = [];
    const reihenfolge = [[-1, e.raeder[0]], [1, e.raeder[0]], [-1, e.raeder[1]], [1, e.raeder[1]]];
    reihenfolge.forEach(([s, a]) => {
      const halter = new THREE.Group();
      halter.position.set(s * a.x, a.r, a.z);
      halter.name = a.vorn ? 'lenkhalter' : 'radhalter';
      const rad = new THREE.Mesh(a.geo, karosserieMaterial());
      rad.name = 'rad';
      if (s < 0) rad.rotation.y = Math.PI;
      halter.add(rad);
      g.add(halter);
      raeder.push(rad);
      if (a.vorn) { vorderraeder.push(rad); lenkObjekte.push(halter); }
    });

    // Blaulicht-Leuchten (Streifenwagen): je Seite eigenes Material, Start = aus
    const blaulicht = e.blau.map((geo, i) => {
      const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: BLAULICHT.aus.blau }));
      m.name = i === 0 ? 'blaulicht-links' : 'blaulicht-rechts';
      g.add(m);
      return m;
    });

    // Polizei-Dekor: ein Mesh mit Canvas-Textur (Schriftzug „POLIZEI“); ohne Canvas (Node-Tests) unsichtbar
    if (e.dekor) {
      const dtext = autoDaten.form && autoDaten.form.dekorText;
      const dm = new THREE.Mesh(e.dekor, polizeiDekorMaterial(dtext));
      dm.name = 'polizeiDekor'; dm.renderOrder = 1;
      if (polizeiDekorMaterial(dtext).userData.ohneTextur) dm.visible = false;
      g.add(dm);
    }

    g.add(e.schatten ? schattenMesh(e.M.L, e.M.B, e.schatten[0], e.schatten[1]) : schattenMesh(e.M.L, e.M.B));

    // Verdeck (nur Cabrio mit form.dach): Gruppe um den Drehpunkt hinten; Zustand 0 = offen (Standard), 1 = geschlossen
    let dachInfo = null;
    if (e.dach) {
      const gr = new THREE.Group();
      gr.name = 'dachGruppe';
      gr.position.set(0, e.dach.pivot.y, e.dach.pivot.z);
      const dm = new THREE.Mesh(e.dach.geo, karosserieMaterial());
      dm.name = 'dach';
      dm.position.set(0, -e.dach.pivot.y, -e.dach.pivot.z);
      gr.add(dm);
      g.add(gr);
      dachInfo = { gruppe: gr, pivot: e.dach.pivot, p: 0, ziel: 0, buegel: null };
      if (e.buegel) { dachInfo.buegel = new THREE.Mesh(e.buegel, karosserieMaterial()); dachInfo.buegel.name = 'ueberrollbuegel'; g.add(dachInfo.buegel); }
    }

    g.userData = {
      dach: dachInfo,
      autoId: autoDaten.id, karosserie: typ, lackFarbe: autoDaten.farbe,   // W3-G: tatsächlicher Lack (Garage-Tests)
      raeder, vorderraeder, lenkObjekte, bremslichter, scheinwerfer,
      bremslichtMaterial: bremslichtMat,
      blaulicht,
    };
    if (dachInfo) { const zu = optionen.dach === 'zu'; dachInfo.ziel = zu ? 1 : 0; setzeDach(g, zu ? 1 : 0); }
    return g;
  }

  /**
   * Verdeck stellen (nur Autos mit userData.dach, sonst ohne Wirkung): p = 0 offen (Dach unsichtbar), 1 geschlossen.
   * Dazwischen klappt das Dach um den hinteren Drehpunkt nach hinten weg und schrumpft dabei in der Länge (vereinfachtes Z-Falten).
   * Rückgabe: true, wenn das Auto ein Verdeck hat.
   */
  function setzeDach(auto, p) {
    const d = auto && auto.userData && auto.userData.dach;
    if (!d) return false;
    p = clamp(p, 0, 1); d.p = p;
    const gr = d.gruppe;
    if (d.buegel) d.buegel.visible = p < 0.5;
    if (p <= 0.01) { gr.visible = false; gr.rotation.x = 0; gr.scale.set(1, 1, 1); gr.position.set(0, d.pivot.y, d.pivot.z); return true; }
    gr.visible = true;
    const t = smooth(1 - p);                           // 0 = zu, 1 = offen
    gr.rotation.x = t * Math.PI;                       // klappt hoch, über die Senkrechte und legt sich umgedreht auf das Verdeckfach
    gr.scale.set(1, 1, 1 - 0.7 * t);                   // wird dabei in der Länge kürzer (Z-Faltung vereinfacht)
    gr.position.y = d.pivot.y - 0.1 * t;
    gr.position.z = d.pivot.z - 0.7 * t;               // und rückt nach vorn, damit es nicht über das Heck ragt
    return true;
  }

  /** Bremslichter an/aus (heller beim Bremsen). Runde 6: mit eingeschaltetem Licht (setzeLicht) leuchtend rot. */
  function setzeBremslicht(auto, an) {
    const m = auto.userData.bremslichtMaterial;
    if (m) m.color.setHex(an ? (auto.userData.lichtAn ? LICHT_NACHT_BREMSE : LICHT_AN) : (auto.userData.lichtAn ? LICHT_NACHT : LICHT_AUS));
  }

  /** Runde 6: Scheinwerfer-Material „Licht an" (weiß, ohne Nebel → leuchtet auch in der Ferne). */
  function scheinwerferAnMaterial() {
    if (!cache.material.scheinwerferAn) cache.material.scheinwerferAn = new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false });
    return cache.material.scheinwerferAn;
  }

  /**
   * Runde 6 (Dämmerung/Nacht): Fahrlicht an/aus – Scheinwerfer leuchten weiß (ohne Nebel), Rücklichter hellrot
   * (Bremsen noch heller). Kein echtes Licht (das setzt main.js nur für Spielerautos). an = false → genau wie vorher.
   */
  // ---- 14.10. (v22) Lichtkegel: billige additive Geometrie (kein echtes Licht) ----
  // Je Auto EIN Mesh 'fahrlicht' (1 Draw-Call, nur sichtbar bei eingeschaltetem Licht): je Scheinwerfer ein Lichtteppich auf der Fahrbahn
  // (Trapezstreifen, vorn hell → hinten 0) und eine senkrechte Lichtbahn in der Luft; hinter jedem Rücklicht ein kurzer roter Schein.
  // Entsteht erst beim ersten Einschalten (setzeLicht(auto, true)); bauen() und damit die Auto-Geometrie bleiben unverändert.
  const FAHRLICHT = { laenge: 13, breiteEnde: 1.5, hoehe: 0.07, vorneHell: 0.14, mitteHell: 0.24, mitteAbstand: 3.2, luftHell: 0.025, rotLaenge: 2.6, rotHell: 0.32 };
  function fahrlichtTextur() {
    if (!cache.material.fahrlichtTextur) {
      const n = 64, d = new Uint8Array(n * 4);
      for (let i = 0; i < n; i++) {
        const u = Math.abs((i + 0.5) / n * 2 - 1), v = Math.pow(Math.max(0, 1 - u), 1.6) * 255;      // weich zum Rand
        d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = v; d[i * 4 + 3] = 255;
      }
      const t = new THREE.DataTexture(d, n, 1, THREE.RGBAFormat);
      t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearFilter; t.needsUpdate = true;
      cache.material.fahrlichtTextur = t;
    }
    return cache.material.fahrlichtTextur;
  }
  function fahrlichtMaterial() {
    if (!cache.material.fahrlicht) {
      cache.material.fahrlicht = new THREE.MeshBasicMaterial({ map: fahrlichtTextur(), vertexColors: true, transparent: true, depthWrite: false, fog: false,
        blending: THREE.AdditiveBlending, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
    }
    return cache.material.fahrlicht;
  }
  /** Stellen der Lichter eines Autos (Karosserie-Koordinaten, vorn = −z): { v: [{x, y, z}] Scheinwerfer, h: [{x, y, z}] Rücklichter }. */
  function lichtStellen(ud) {
    const mitte = (geo) => { geo.computeBoundingBox(); return geo.boundingBox; };
    const liste = (meshes, vorn) => {
      const erg = [];
      (meshes || []).forEach((m) => {
        const b = mitte(m.geometry), ax = Math.max(Math.abs(b.min.x), Math.abs(b.max.x)), vorz = (b.min.x + b.max.x) >= 0 ? 1 : -1;
        const x = (b.max.x - b.min.x) > 0.5 ? vorz * ax * 0.72 : (b.min.x + b.max.x) / 2;     // breite Leiste (Tagfahrlicht) → äußeres Drittel
        erg.push({ x, y: Math.max(0.4, Math.min(1.1, (b.min.y + b.max.y) / 2)), z: vorn ? b.min.z : b.max.z });
      });
      return erg;
    };
    return { v: liste(ud.scheinwerfer, true), h: liste(ud.bremslichter, false) };
  }
  function fahrlichtGeometrie(st) {
    const F = FAHRLICHT, pos = [], col = [], uv = [], idx = [];
    const punkt = (x, y, z, hell, farbe, u) => { pos.push(x, y, z); col.push(farbe[0] * hell, farbe[1] * hell, farbe[2] * hell); uv.push(u, 0.5); return pos.length / 3 - 1; };
    const streifen = (reihen, farbe) => {      // reihen: [[{x,y,z,hell} links, {…} rechts], …] von nah nach fern
      let vor = null;
      reihen.forEach((r) => {
        const a = punkt(r[0].x, r[0].y, r[0].z, r[0].hell, farbe, 0), b = punkt(r[1].x, r[1].y, r[1].z, r[1].hell, farbe, 1);
        if (vor) idx.push(vor[0], vor[1], b, vor[0], b, a);
        vor = [a, b];
      });
    };
    const WEISS = [1, 0.93, 0.72], ROT = [1, 0.12, 0.06];
    st.v.forEach((l) => {
      const z0 = l.z - 0.05, z1 = z0 - F.mitteAbstand, z2 = z0 - F.laenge, h = F.hoehe;
      const w0 = 0.25, w1 = 0.6, w2 = F.breiteEnde;
      streifen([[{ x: l.x - w0, y: h, z: z0, hell: F.vorneHell }, { x: l.x + w0, y: h, z: z0, hell: F.vorneHell }],
        [{ x: l.x - w1, y: h, z: z1, hell: F.mitteHell }, { x: l.x + w1, y: h, z: z1, hell: F.mitteHell }],
        [{ x: l.x - w2, y: h, z: z2, hell: 0 }, { x: l.x + w2, y: h, z: z2, hell: 0 }]], WEISS);
      // Lichtbahn in der Luft: senkrechte Fläche in Fahrtrichtung, am Ende sinkt sie auf die Fahrbahn
      const yo = Math.max(0.35, l.y - 0.1);
      streifen([[{ x: l.x, y: yo - 0.12, z: z0, hell: F.luftHell }, { x: l.x, y: yo + 0.12, z: z0, hell: F.luftHell }],
        [{ x: l.x, y: yo * 0.5, z: z1, hell: F.luftHell * 0.8 }, { x: l.x, y: yo * 0.5 + 0.8, z: z1, hell: F.luftHell * 0.8 }],
        [{ x: l.x, y: h, z: z2, hell: 0 }, { x: l.x, y: h + 1.2, z: z2, hell: 0 }]], WEISS);
    });
    st.h.forEach((l) => {
      const z0 = l.z + 0.05, z1 = z0 + F.rotLaenge, h = F.hoehe;
      streifen([[{ x: l.x - 0.3, y: h, z: z0, hell: F.rotHell }, { x: l.x + 0.3, y: h, z: z0, hell: F.rotHell }],
        [{ x: l.x - 0.6, y: h, z: z1, hell: 0 }, { x: l.x + 0.6, y: h, z: z1, hell: 0 }]], ROT);
    });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx);
    return geo;
  }
  function fahrlichtMesh(auto) {
    const ud = auto.userData;
    if (ud.fahrlicht !== undefined) return ud.fahrlicht;
    const st = lichtStellen(ud);
    if (!st.v.length && !st.h.length) { ud.fahrlicht = null; return null; }
    const key = 'fl' + JSON.stringify(st, (k, v) => (typeof v === 'number' ? Math.round(v * 100) / 100 : v));
    if (!cache.karosserie[key]) cache.karosserie[key] = { geo: fahrlichtGeometrie(st), sw: [], bl: [], blau: [] };     // im Cache: cacheLeeren() räumt auf
    const m = new THREE.Mesh(cache.karosserie[key].geo, fahrlichtMaterial());
    m.name = 'fahrlicht'; m.renderOrder = 2; m.frustumCulled = true;
    auto.add(m);
    ud.fahrlicht = m;
    return m;
  }

  function setzeLicht(auto, an) {
    if (!auto || !auto.userData) return;
    const ud = auto.userData;
    ud.lichtAn = !!an;
    if (an) { const fl = fahrlichtMesh(auto); if (fl) fl.visible = true; }
    else if (ud.fahrlicht) ud.fahrlicht.visible = false;
    (ud.scheinwerfer || []).forEach((m) => { m.material = an ? scheinwerferAnMaterial() : scheinwerferMaterial(); });
    const bm = ud.bremslichtMaterial;
    if (bm && bm.fog !== !an) { bm.fog = !an; bm.needsUpdate = true; }
    setzeBremslicht(auto, false);
  }

  /**
   * Blaulicht schalten (nur Autos mit userData.blaulicht; sonst ohne Wirkung).
   * @param {number} phase 0 = aus, 1 = links an, 2 = rechts an, 3 = beide an (Wechselblinken: 1/2 abwechseln)
   * @param {string} [farbe] 'blau' (Standard) oder 'rot' – Farbe der eingeschalteten Leuchten
   */
  function setzeBlaulicht(auto, phase, farbe) {
    const bl = auto && auto.userData && auto.userData.blaulicht;
    if (!bl || !bl.length) return;
    const art = farbe === 'rot' ? 'rot' : 'blau';
    bl.forEach((m, i) => {
      const an = phase === 3 || (phase === 1 && i === 0) || (phase === 2 && i === 1);
      m.material.color.setHex(an ? BLAULICHT.an[art] : BLAULICHT.aus[art]);
    });
  }

  /** Vorderräder einschlagen (Winkel in Radiant, positiv = nach links). */
  function lenkeRaeder(auto, winkel) {
    auto.userData.lenkObjekte.forEach((h) => { h.rotation.y = winkel; });
  }

  /** Alle Räder um den Rollwinkel drehen (aus gefahrener Strecke / Radradius). */
  function dreheRaeder(auto, winkel) {
    auto.userData.raeder.forEach((r) => { r.rotation.x = winkel; });
  }

  /** Cache leeren (nur falls Katalog zur Laufzeit geändert wird). */
  function cacheLeeren() {
    Object.values(cache.karosserie).forEach((e) => {
      e.geo.dispose(); e.sw.forEach((x) => x.dispose()); e.bl.forEach((x) => x.dispose()); (e.blau || []).forEach((x) => x.dispose());
    });
    Object.values(cache.rad).forEach((geo) => geo.dispose());
    cache.karosserie = {}; cache.rad = {};
  }

  /** Einfaches Platzhalter-Auto (Kasten + Kabine + 4 Räder). */
  function platzhalterAuto(farbe = 0x2255cc) {
    const g = new THREE.Group();
    const karosserie = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.55, 4.3), material(farbe));
    karosserie.position.y = 0.55;
    g.add(karosserie);
    const kabine = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.5, 2.0), material(0x222222));
    kabine.position.set(0, 1.05, -0.2);
    g.add(kabine);
    const radGeo = new THREE.CylinderGeometry(0.34, 0.34, 0.25, 12);
    radGeo.rotateZ(Math.PI / 2);
    const radMat = material(0x111111);
    [[-0.85, 1.4], [0.85, 1.4], [-0.85, -1.4], [0.85, -1.4]].forEach(([x, z]) => {
      const rad = new THREE.Mesh(radGeo, radMat);
      rad.position.set(x, 0.34, z);
      g.add(rad);
    });
    const schatten = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 4.8),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35 }));
    schatten.rotation.x = -Math.PI / 2; schatten.position.y = 0.02;
    g.add(schatten);
    return g;
  }

  R.carBuilder = { bauen, platzhalterAuto, setzeBremslicht, setzeLicht, setzeBlaulicht, setzeDach, lenkeRaeder, dreheRaeder, cacheLeeren, TYP_STANDARD };
})();
