// ============================================================
// Megastrecke „🌍 Megastrecke" (14.10., v22) – ADD-ON, ändert keine bestehende Strecke.
//
// Wunsch: „Teile der vorhandenen Strecken hintereinander legen, so lang wie alle zusammen durch 2,
// dazu Jahreszeiten und Wetter total crazy nach Zufall."
//
// Aufbau (dieses Modul, nach trackCatalog.js/trackBuilder.js geladen, hängt den Eintrag 'mega' an R.trackCatalog an):
//   1. ZUSAMMENBAU: aus jeder der 6 Strecken (Wiese, Wald, Wüste, Fantasie, Dino, Alpen) ein zusammenhängendes Stück Mittellinie
//      (Kontrollpunkte inkl. Höhen, Anfang/Ende auf Geraden) – gespiegelt oder nicht – hintereinander gesetzt. Zwischen den Stücken
//      liegt je ein Verbindungsstück (Bogen + Gerade), die Stücke werden so gedreht, dass die Fahrtrichtung durchgehend stimmt.
//      Zum Schluss schließt ein Hermite-Bogen den Rundkurs auf die Start-/Ziel-Gerade. Höhen: Versatz je Stück, die Restdifferenz
//      wird gleichmäßig über die ganze Runde verteilt. Die Parameter (Reihenfolge, Spiegelung, Bogen, Lücken) hat
//      tests/bauplan/mega_layout.js einmal gesucht (Zufallssuche, Bedingung: fremde Teile ≥ 100 m auseinander) und stehen fest in LAYOUT.
//   2. Katalog-Listen (Hindernisse, Wracks, Stroh, Schanzen, Turbo, Schilde, Spuren, Kleber, Loopings) der Quellstrecken werden –
//      soweit sie im übernommenen Stück liegen – auf die Mega-Bogenlänge umgerechnet (ds-Verschiebung; Spiegelung dreht Seiten).
//   3. Höhenmodell 'strasse' (wie Alpen): y der Kontrollpunkte = Fahrbahnhöhe, Boden folgt der Straße.
//   4. Abschnitte (je Quellstrecke ein Thema) und Zonen (400–800 m, je Zone Jahreszeit + Wetter nach Zufalls-Seed) – siehe unten.
//
// Zufall: R.Mega.zonen(laenge, seed) – derselbe Seed (offline Math.random, online wetterSeed vom Server) → überall dieselbe Verteilung.
// ============================================================
(function () {
  const R = window.Rennspiel;
  if (!R || !R.trackCatalog || !R.Spline) return;

  // ------------------------------------------------------------------ Festes Layout (aus tests/bauplan/mega_layout.js)
  // a/b = Bogenlänge s (m) in der Quellstrecke (Anfang/Ende auf Geraden), spiegel = x spiegeln, bogen = Kurve vor dem Stück (Grad,
  // + = links), luecke = Gerade vor dem Stück (m). Reihenfolge = Fahrtrichtung.
  const LAYOUT = {
    abschnitte: [
      { id: 'wiese',    a: 2780, b: 1060, spiegel: 0, bogen: 0,   luecke: 40 },
      { id: 'dino',     a: 100,  b: 1240, spiegel: 1, bogen: 0,   luecke: 40 },
      { id: 'fantasie', a: 1200, b: 444,  spiegel: 0, bogen: -15, luecke: 200 },
      { id: 'wueste',   a: 1100, b: 2300, spiegel: 0, bogen: 65,  luecke: 50 },
      { id: 'alpen',    a: 330,  b: 1500, spiegel: 0, bogen: -45, luecke: 80 },
      { id: 'wald',     a: 1000, b: 2080, spiegel: 0, bogen: 15,  luecke: 70 },
    ],
  };
  const BREITE = 14, RAND = 1.5;      // einheitliche Fahrbahn (Quellen: 12–15 m)
  const START_VOR = 130, START_NACH = 150;   // Gerade vor/hinter dem Start-/Zielpunkt (m)
  const BOGEN_R = 110;                // Radius der Verbindungsbögen (m)
  const SCHRITT = 25;                 // Abstand der Verbindungs-Kontrollpunkte (m)
  const THEMEN = { wiese: 'wiese', wald: 'wald', wueste: 'wueste', fantasie: 'fantasie', dino: 'dino', alpen: 'alpen' };

  // ------------------------------------------------------------------ Hilfen
  const wrap = (s, L) => ((s % L) + L) % L;
  const rotieren = (x, z, a) => { const c = Math.cos(a), s = Math.sin(a); return [x * c + z * s, z * c - x * s]; };   // Heading + a (links)
  const dirH = (h) => ({ x: -Math.sin(h), z: -Math.cos(h) });
  const headingAus = (tx, tz) => Math.atan2(-tx, -tz);

  /** Quelle (Katalogeintrag ohne Variante): Spline, Kontrollpunkte mit s und Tangenten-Heading (einmal berechnet). */
  const _quellen = {};
  function quelle(id) {
    if (_quellen[id]) return _quellen[id];
    const d = R.trackCatalog.find((t) => t.id === id);
    if (!d) return null;
    const sp = new R.Spline(d.punkte, { abstand: 2 });
    const kp = d.punkte.map((p, i) => {
      const n = sp.naechster(p[0], p[2]), t = sp.punktBei(n.s);
      return { i, x: p[0], y: p[1], z: p[2], s: n.s, h: headingAus(t.tx, t.tz) };
    });
    return (_quellen[id] = { id, daten: d, sp, L: sp.laenge, kp });
  }

  /** Kontrollpunkte einer Quelle von s=a bis s=b (zyklisch, in Fahrtrichtung): erster ≥ a, letzter ≤ b. */
  function stueck(q, a, b) {
    const L = q.L, len = wrap(b - a, L);
    const liste = q.kp.map((k) => Object.assign({ ds: wrap(k.s - a, L) }, k)).filter((k) => k.ds <= len + 1e-6);
    liste.sort((u, v) => u.ds - v.ds);
    return liste;
  }

  /** Höhen eines Stücks stauchen, falls die Quelle steiler als STEIGUNG_MAX ist (Alpen „hügeliger"): Faktor ≤ 1. */
  const STEIGUNG_MAX = 0.10;
  function hoehenFaktor(q, s0, s1) {
    const sp = q.sp, len = wrap(s1 - s0, q.L);
    let m = 0;
    for (let d = 0; d < len; d += sp.ds) {
      const p = sp.punktBei(s0 + d), r = sp.punktBei(s0 + d + sp.ds);
      m = Math.max(m, Math.abs(r.y - p.y) / sp.ds);
    }
    return m > STEIGUNG_MAX ? STEIGUNG_MAX / m : 1;
  }

  /**
   * Zusammenbau der Mittellinie. layout = { abschnitte:[…] }.
   * @returns {{ punkte:number[][], abschnitte:object[], schliess:object, drift:number }}
   */
  function zusammenbauen(layout) {
    const pts = [];               // { x, y, z, seg }
    const add = (x, y, z, seg) => pts.push({ x, y, z, seg });
    // Start-/Ziel-Gerade: Punkt 0 bei z = 0, danach START_NACH m geradeaus (−z)
    for (let z = 0; z >= -START_NACH + 1e-6; z -= 30) add(0, 0, z, 'start');
    let pose = { x: 0, z: -Math.round(START_NACH / 30) * 30, h: 0, y: 0 };
    const info = [];
    layout.abschnitte.forEach((ab, k) => {
      // --- Verbindung: Bogen (bogen°) + Gerade (luecke m)
      let { x, z, h } = pose;
      const w = (ab.bogen || 0) * Math.PI / 180;
      if (Math.abs(w) > 1e-3) {
        const laenge = Math.abs(w) * BOGEN_R, n = Math.max(1, Math.ceil(laenge / SCHRITT)), dh = w / n;
        for (let i = 0; i < n; i++) {
          const d = dirH(h + dh / 2), ds = laenge / n;
          x += d.x * ds; z += d.z * ds; h += dh;
          add(x, pose.y, z, 'v' + k);
        }
      }
      const nl = Math.max(1, Math.round((ab.luecke || 60) / SCHRITT));
      for (let i = 0; i < nl; i++) {
        const d = dirH(h), ds = (ab.luecke || 60) / nl;
        x += d.x * ds; z += d.z * ds;
        if (i < nl - 1) add(x, pose.y, z, 'v' + k);     // letzter Punkt = erster Punkt des Stücks
      }
      // --- Stück platzieren: erster Kontrollpunkt auf (x, z), Tangente in Richtung h, Höhe y = pose.y
      const q = quelle(ab.id), st = stueck(q, ab.a, ab.b), p0 = st[0], sp = ab.spiegel ? -1 : 1;
      const hf = hoehenFaktor(q, p0.s, st[st.length - 1].s);
      const hs = sp * p0.h, alpha = h - hs;
      const idx0 = pts.length;
      st.forEach((kp) => {
        const [rx, rz] = rotieren(sp * (kp.x - p0.x), kp.z - p0.z, alpha);
        add(x + rx, pose.y + (kp.y - p0.y) * hf, z + rz, 'k' + k);
      });
      const pe = st[st.length - 1];
      pose = { x: pts[pts.length - 1].x, z: pts[pts.length - 1].z, h: sp * pe.h + alpha, y: pts[pts.length - 1].y };
      info.push({ id: ab.id, thema: THEMEN[ab.id] || 'wiese', spiegel: sp < 0, quelleA: ab.a, quelleB: ab.b, quelleL: q.L, quelleS0: p0.s,
        quelleS1: pe.s, idx0, idx1: pts.length - 1, anzahl: st.length, gedreht: alpha });
    });
    // --- Schluss: Hermite-Bogen von der Pose zum Eingang der Start-/Ziel-Geraden (0, +START_VOR), Richtung −z
    const ziel = { x: 0, z: START_VOR };
    const D = Math.hypot(ziel.x - pose.x, ziel.z - pose.z), m = 1.25 * D, t0 = dirH(pose.h);
    const nS = Math.max(2, Math.round(D / SCHRITT));
    const hy = pose.y;
    for (let i = 1; i < nS; i++) {
      const t = i / nS, t2 = t * t, t3 = t2 * t;
      const h00 = 2 * t3 - 3 * t2 + 1, h10 = t3 - 2 * t2 + t, h01 = -2 * t3 + 3 * t2, h11 = t3 - t2;
      add(h00 * pose.x + h10 * m * t0.x + h01 * ziel.x + h11 * m * 0,
        hy, h00 * pose.z + h10 * m * t0.z + h01 * ziel.z + h11 * m * (-1), 'ende');
    }
    for (let z = START_VOR; z > 1; z -= 30) add(0, hy, z, 'ende');
    // --- Höhen: Rest (hy − 0) gleichmäßig über die Länge verteilen, damit Punkt 0 und der letzte Punkt dieselbe Höhe haben
    let cum = 0;
    const cumA = pts.map((p, i) => { if (i) cum += Math.hypot(p.x - pts[i - 1].x, p.z - pts[i - 1].z); return cum; });
    const gesamt = cum + Math.hypot(pts[0].x - pts[pts.length - 1].x, pts[0].z - pts[pts.length - 1].z);
    const drift = hy - 0;
    pts.forEach((p, i) => { p.y -= drift * cumA[i] / gesamt; });
    return { punkte: pts.map((p) => [round2(p.x), round2(p.y), round2(p.z)]), pts, abschnitte: info, drift, gesamt,
      schluss: { D, x: pose.x, z: pose.z, h: pose.h, h0: pose.h } };
  }
  const round2 = (v) => Math.round(v * 100) / 100;


  // ------------------------------------------------------------------ Katalog-Listen der Quellen übernehmen
  // s-Listen (Eintrag.s), Seitenfeld wird bei gespiegeltem Stück negiert
  const LISTEN_S = ['hindernisse', 'wracks', 'strohballen', 'schanzen', 'boostFelder', 'schilde', 'baelle', 'wasserstrahlen', 'dinos', 'loopings'];
  const LISTEN_BEREICH = ['spuren', 'kleber'];     // s0..s1
  const SEITE = { hindernisse: 'seite', wracks: 'seitenabstand', strohballen: 'von', boostFelder: 'seitenabstand', schilde: 'seitenabstand',
    baelle: 'von', wasserstrahlen: 'seitenabstand', dinos: 'von', kleber: 'seite' };
  // Abstand zum Stückrand, ab dem ein Eintrag übernommen wird (m) – Verbindung/Lücke, Spur-Übergänge, Landung, Looping-Anlauf
  const MARGE = { standard: 90, schanzen: 120, loopings: 230, spuren: 70, kleber: 40 };

  function listenAbbilden(bau, msp) {
    const aus = {};
    LISTEN_S.concat(LISTEN_BEREICH).forEach((k) => { aus[k] = []; });
    bau.abschnitte.forEach((ab) => {
      const q = quelle(ab.id), L = q.L, len = wrap(ab.quelleS1 - ab.quelleS0, L);
      const p0 = bau.punkte[ab.idx0], sM0 = msp.naechster(p0[0], p0[2]).s;
      ab.megaS0 = sM0;
      const p1 = bau.punkte[ab.idx1];
      ab.megaS1 = msp.naechster(p1[0], p1[2]).s;
      const dreh = (e, key) => {
        const n = Object.assign({}, e);
        const f = SEITE[key];
        if (ab.spiegel && f && typeof n[f] === 'number') n[f] = -n[f];
        return n;
      };
      LISTEN_S.forEach((key) => {
        (q.daten[key] || []).forEach((e) => {
          const ds = wrap(e.s - ab.quelleS0, L), m = MARGE[key] || MARGE.standard;
          if (ds < m || ds > len - m) return;
          const n = dreh(e, key); n.s = Math.round((sM0 + ds) * 10) / 10;
          aus[key].push(n);
        });
      });
      LISTEN_BEREICH.forEach((key) => {
        (q.daten[key] || []).forEach((e) => {
          const d0 = wrap(e.s0 - ab.quelleS0, L), d1 = d0 + wrap(e.s1 - e.s0, L), m = MARGE[key];
          if (d0 < m || d1 > len - m) return;
          const n = dreh(e, key); n.s0 = Math.round((sM0 + d0) * 10) / 10; n.s1 = Math.round((sM0 + d1) * 10) / 10;
          aus[key].push(n);
        });
      });
    });
    return aus;
  }

  // ------------------------------------------------------------------ Abschnitte (Themen) und Katalogeintrag
  const SEKTION_NACH = 40;         // m hinter dem letzten Stück beginnt wieder der „Start-Abschnitt" (Wiese) bis zum Ziel
  /** Themenabschnitte [{ s0, s1, thema, id }] ohne Lücke von 0 bis L (Grenze = Mitte der Verbindung); Anfang und Schluss = Thema des ersten Stücks. */
  function sektionenBilden(bau, L) {
    const a = bau.abschnitte, g = [0];
    for (let k = 1; k < a.length; k++) g.push((a[k - 1].megaS1 + a[k].megaS0) / 2);
    g.push(Math.min(L - 60, a[a.length - 1].megaS1 + SEKTION_NACH));
    g.push(L);
    const sek = [];
    for (let k = 0; k < a.length; k++) sek.push({ s0: g[k], s1: g[k + 1], thema: a[k].thema, id: a[k].id });
    sek.push({ s0: g[a.length], s1: L, thema: a[0].thema, id: a[0].id });     // Schluss: wieder Wiese (Start-Ziel-Bereich)
    return sek;
  }

  function eintragBauen(layout) {
    const bau = zusammenbauen(layout);
    const msp = new R.Spline(bau.punkte, { abstand: 2 });
    const listen = listenAbbilden(bau, msp);
    const L = msp.laenge;
    const sektionen = sektionenBilden(bau, L);
    const wiese = R.trackCatalog.find((t) => t.id === 'wiese');
    const welten = JSON.parse(JSON.stringify((wiese && wiese.welten) || {}));
    // Loopings und Kleber (Fantasie-Stück) ab „Stunt" bzw. „Verrückt"
    ['stunt', 'verrueckt'].forEach((w) => { if (welten[w]) welten[w].loopings = true; });
    if (welten.verrueckt) welten.verrueckt.kleber = true;
    const summe = ['wiese', 'wald', 'wueste', 'fantasie', 'dino', 'alpen'].reduce((a, id) => a + (quelle(id) ? quelle(id).L : 0), 0);
    const km = (L / 1000).toFixed(1).replace('.', ',');
    const daten = {
      id: 'mega', name: '🌍 Megastrecke', thema: 'wiese', mega: true,
      beschreibung: '~' + km + ' km: alle Strecken hintereinander, Jahreszeit und Wetter wechseln – jede Fahrt anders!',
      schwierigkeit: 'spass',
      breite: BREITE, randBreite: RAND, checkpointAbstand: 150,
      zielRundenzeit: Math.round(L / 24),
      abseitsUntergrund: 'gras',
      weltStandard: 'hindernisse', welten,
      hoehenModell: 'strasse',
      huegel: [],
      bruecken: [], tunnel: [],
      punkte: bau.punkte,
    };
    LISTEN_S.concat(LISTEN_BEREICH).forEach((k) => { daten[k] = listen[k]; });
    daten.boostFelder = listen.boostFelder; daten.schilde = listen.schilde;
    R.Mega.info = { laenge: L, summeQuellen: summe, abschnitte: bau.abschnitte, sektionen, drift: bau.drift, layout };
    return daten;
  }

  R.Mega = R.Mega || {};
  R.Mega.LAYOUT = LAYOUT;
  R.Mega._zusammenbauen = zusammenbauen;
  R.Mega._quelle = quelle;
  R.Mega._stueck = stueck;
  R.Mega.konstanten = { BREITE, RAND, START_VOR, START_NACH, BOGEN_R, SCHRITT };
  R.Mega.eintragBauen = eintragBauen;
  R.Mega.erzeugen = function () {
    if (R.trackCatalog.some((t) => t.id === 'mega')) return;
    R.trackCatalog.push(eintragBauen(LAYOUT));
  };
  R.Mega.erzeugen();

  // ------------------------------------------------------------------ Zonen: Jahreszeit + Wetter nach Zufall
  const JAHRESZEITEN = ['fruehling', 'sommer', 'herbst', 'winter'];
  const ZONE_ZIEL = 600;           // m: mittlere Zonenlänge (400–800 m)
  const UEBERBLENDEN = 90;         // m: weicher Übergang beiderseits der Zonengrenze
  const ZUFALL_SALZ = 0x6d656761;  // 'mega'

  /** mulberry32 (wie themes/wetter) – lokal, damit Node-Tests ohne themes.js laufen. */
  function zufall(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /** Wetter-Auswahl je Thema + Jahreszeit (ohne R.Wetter: klar/regen). */
  function wetterFuer(thema, jz) {
    const liste = R.Wetter && R.Wetter.erlaubt ? R.Wetter.erlaubt(thema, jz) : ['klar', 'regen'];
    return liste && liste.length ? liste : ['klar'];
  }

  /**
   * Zonen für einen Seed. Jeder Themenabschnitt wird in gleich lange Zonen (≈ 600 m) geteilt; je Zone Jahreszeit und Wetter
   * (erlaubt für Thema + Jahreszeit; „klar" etwas seltener, damit es wirklich wechselt; nie zweimal dieselbe Kombination hintereinander).
   * Die letzte Zone (Schluss-Abschnitt) bekommt Jahreszeit/Wetter der ersten, damit an der Start-/Ziellinie nichts springt.
   * Reine Funktion von (seed, Layout) – Server und alle Browser rechnen gleich.
   * @returns {{s0:number,s1:number,thema:string,sektion:number,jz:string,wetter:string}[]}
   */
  function zonen(seed) {
    const info = R.Mega.info, rnd = zufall(((seed === undefined ? 1 : seed) >>> 0) ^ ZUFALL_SALZ);
    const z = [];
    let vor = null;
    info.sektionen.forEach((sek, k) => {
      const n = Math.max(1, Math.ceil((sek.s1 - sek.s0) / 800)), len = (sek.s1 - sek.s0) / n;
      for (let i = 0; i < n; i++) {
        let jz = null, w = null;
        for (let versuch = 0; versuch < 6; versuch++) {
          jz = JAHRESZEITEN[Math.floor(rnd() * JAHRESZEITEN.length)];
          const liste = wetterFuer(sek.thema, jz);
          const gewicht = liste.map((x) => (x === 'klar' ? 0.7 : 1));
          let r = rnd() * gewicht.reduce((a, b) => a + b, 0);
          w = liste[liste.length - 1];
          for (let j = 0; j < liste.length; j++) { r -= gewicht[j]; if (r <= 0) { w = liste[j]; break; } }
          if (!vor || vor.jz !== jz || vor.wetter !== w) break;
        }
        const zone = { s0: sek.s0 + i * len, s1: sek.s0 + (i + 1) * len, thema: sek.thema, sektion: k, jz, wetter: w };
        z.push(zone); vor = zone;
      }
    });
    // Schluss = Anfang (kein Sprung an der Start-/Ziellinie)
    const erste = z[0], letzte = z[z.length - 1];
    letzte.jz = erste.jz;
    letzte.wetter = wetterFuer(letzte.thema, letzte.jz).indexOf(erste.wetter) >= 0 ? erste.wetter : 'klar';
    if (letzte.wetter !== erste.wetter) erste.wetter = letzte.wetter = 'klar';
    return z;
  }

  const glatt = (t) => { t = t < 0 ? 0 : (t > 1 ? 1 : t); return t * t * (3 - 2 * t); };

  /**
   * Profil an Bogenlänge s: { a: Zone, b: Nachbarzone | null, w: Gewicht von b (0…0,5) }. An der Grenze 50/50, UEBERBLENDEN m davon
   * entfernt 100 % die eigene Zone. Rundenübergang (letzte ↔ erste Zone) ist ohnehin gleich.
   */
  function profilBei(zn, s, ziel) {
    const L = zn[zn.length - 1].s1;
    s = ((s % L) + L) % L;
    let i = 0;
    while (i < zn.length - 1 && s >= zn[i].s1) i++;
    const z = zn[i], o = ziel || {};
    o.a = z; o.b = null; o.w = 0; o.i = i;
    const dv = s - z.s0, dn = z.s1 - s;
    if (dv < UEBERBLENDEN) { o.b = zn[(i + zn.length - 1) % zn.length]; o.w = 0.5 * (1 - glatt(dv / UEBERBLENDEN)); }
    else if (dn < UEBERBLENDEN) { o.b = zn[(i + 1) % zn.length]; o.w = 0.5 * (1 - glatt(dn / UEBERBLENDEN)); }
    return o;
  }

  /** Erscheinung einer Zone (Himmel, Nebel, Licht, Niederschlag, Haftung …) aus Thema + Jahreszeit + Wetter; einmal je Zone berechnet. */
  function erscheinung(zone) {
    if (zone._ep) return zone._ep;
    const C = R.config, th = (R.themes && R.themes[zone.thema]) || {}, W = R.Wetter;
    const jz = W && W.jahreszeitDaten ? W.jahreszeitDaten(zone.thema, zone.jz) : (C.jahreszeiten[zone.jz] || {});
    const w = C.wetter[zone.wetter] || C.wetter.klar;
    const misch = (hex, m) => (m && W ? W.mischHex(hex, m[0], m[1]) : hex);
    const art = w.partikel ? { striche: 'regen', flocken: 'schnee', koerner: 'hagel', sand: 'sandsturm' }[w.partikel.art] : null;
    return (zone._ep = {
      himmel: misch(misch(th.himmel !== undefined ? th.himmel : 0x8fc8ff, jz.himmelMisch), w.himmelMisch),
      nebel: misch(misch(th.nebel !== undefined ? th.nebel : 0x8fc8ff, jz.nebelMisch), w.nebelFarbe),
      sicht: (th.sichtweite || C.grafik.sichtweite) * (jz.sichtweiteFaktor || 1) * (w.sichtweiteFaktor || 1),
      nebelNah: w.nebelNah !== undefined ? w.nebelNah : 0.55,
      licht: (jz.lichtFaktor || 1) * (w.lichtFaktor || 1),
      lichtFarbe: jz.lichtFarbe === undefined ? null : jz.lichtFarbe,
      sonnenHoehe: jz.sonnenHoehe === undefined ? null : jz.sonnenHoehe,
      bodenMisch: jz.bodenMisch || null, randSchnee: !!jz.randSchnee,
      decke: !!w.wolkenDecke, art,
      grip: w.gripFaktor === undefined ? 1 : w.gripFaktor, brems: w.bremsFaktor === undefined ? 1 : w.bremsFaktor,
      emoji: (jz.emoji || '') + (w.emoji || ''), name: (jz.name || '') + (w.name && zone.wetter !== 'klar' ? ' · ' + w.name : ''),
      boden: th.boden !== undefined ? th.boden : 0x5f9e3a, boden2: th.boden2,
    });
  }

  /** Gewichteter Mittelwert einer Zahleneigenschaft der Erscheinung über das Profil. */
  const mix = (p, f) => { const a = f(erscheinung(p.a)); return p.b ? a + (f(erscheinung(p.b)) - a) * p.w : a; };

  // ------------------------------------------------------------------ Bodenfarbe je Abschnitt/Zone (Strecke._bodenFarbe)
  // Boden, Böschung (und Randsteine) bekommen Farben ihres Abschnitts-Themas + Jahreszeit der Zone; Zuordnung über die nächste
  // Straßenstelle (Raster 32 m, Zwischenspeicher).
  function sBeiXZ(strecke, x, z) {
    const c = strecke._megaSRaster || (strecke._megaSRaster = new Map());
    const k = Math.floor(x / 24) * 100003 + Math.floor(z / 24);
    let s = c.get(k);
    if (s === undefined) { s = strecke.spline.naechster((Math.floor(x / 24) + 0.5) * 24, (Math.floor(z / 24) + 0.5) * 24).s; c.set(k, s); }
    return s;
  }
  function zonenVon(strecke) {
    if (!strecke.megaZonen) strecke.megaZonen = zonen(1);
    return strecke.megaZonen;
  }
  const _hexC = {};
  function bodenFarben(strecke, s, ziel) {
    const p = profilBei(zonenVon(strecke), s, ziel || {}), W = R.Wetter;
    const eine = (ep) => {
      const m = ep.bodenMisch;
      return { b1: m ? W.mischHex(ep.boden, m[0], m[1]) : ep.boden, b2: ep.boden2 === undefined ? undefined : (m ? W.mischHex(ep.boden2, m[0], m[1]) : ep.boden2) };
    };
    const A = eine(erscheinung(p.a));
    if (!p.b) return { b1: A.b1, b2: A.b2 };
    const B = eine(erscheinung(p.b));
    const t = p.w;
    return { b1: W.mischHex(A.b1, B.b1, t), b2: A.b2 === undefined || B.b2 === undefined ? (A.b2 === undefined ? B.b2 : A.b2) : W.mischHex(A.b2, B.b2, t) };
  }
  R.Mega._bodenFarben = bodenFarben;

  // ------------------------------------------------------------------ Deko je Zone (Thema des Abschnitts, Jahreszeit der Zone)
  // Das Original-dekoBauen baut ein Thema über die ganze Strecke; hier läuft es je Zone mit einer Strecken-Hülle, die nur das Stück
  // s0…s1 zeigt (spline.laenge/punktBei/punkte relativ), Dichte = Zonenlänge / Länge der Quellstrecke (Katalog-Dichte der Quelle).
  const THEMA_LAENGE = {};
  function themaLaenge(thema) { return THEMA_LAENGE[thema] || (THEMA_LAENGE[thema] = (quelle(thema) || { L: 3000 }).L); }

  function huelle(strecke, s0, s1, kennung) {
    const sp = strecke.spline, len = s1 - s0, pk = sp.punkte.filter((p) => p.s >= s0 && p.s < s1);
    const spH = new Proxy(sp, {
      get(t, k) {
        if (k === 'laenge') return len;
        if (k === 'punkte') return pk;
        if (k === 'punktBei') return (s) => t.punktBei(s0 + s);
        const v = t[k]; return typeof v === 'function' ? v.bind(t) : v;
      },
    });
    return new Proxy(strecke, {
      get(t, k) {
        if (k === 'spline') return spH;
        if (k === 'id') return kennung;
        const v = t[k]; return typeof v === 'function' ? v.bind(t) : v;
      },
    });
  }

  function dichteSkaliert(deko, f, rnd) {
    const aus = Array.isArray(deko) ? [] : {};
    Object.keys(deko).forEach((k) => {
      const v = deko[k];
      if (k === 'bandAbstand') aus[k] = v;
      else if (typeof v === 'number') aus[k] = Math.floor(v * f + rnd());
      else if (v && typeof v === 'object') aus[k] = dichteSkaliert(v, f, rnd);
      else aus[k] = v;
    });
    return aus;
  }

  /** Deko der ganzen Megastrecke: eine Gruppe, in der die Teile aller Zonen liegen (für statischVorbereiten + pflanzenSammeln). */
  function megaDeko(strecke, dekoOriginal) {
    const zn = zonenVon(strecke), gruppe = new THREE.Group();
    gruppe.name = 'Deko mega';
    let anzahl = 0;
    zn.forEach((z, k) => {
      const th = R.themes[z.thema];
      if (!th || z.s1 - z.s0 < 30) return;
      const rnd = zufall(((k + 1) * 7919) ^ ZUFALL_SALZ);
      const altDeko = th.deko, altVulkan = th.vulkan, altBerge = th.berge;
      try {
        th.deko = dichteSkaliert(altDeko, (z.s1 - z.s0) / themaLaenge(z.thema), rnd);
        if (altVulkan) th.vulkan = { richtung: 0.12, abstand: 6000, hoehe: 50, radius: 70 };   // Kulisse hängt an der Kamera → winzig und fern
        if (altBerge) th.berge = { anzahl: 1, seed: altBerge.seed };
        const g = dekoOriginal.call(R.themes, z.thema, huelle(strecke, z.s0, z.s1, 'mega-' + k + '-' + z.thema), z.jz);
        anzahl += (g.userData && g.userData.anzahl) ? 1 : 0;
        g.children.slice().forEach((c) => { c.userData.megaZone = k; gruppe.add(c); });
      } finally { th.deko = altDeko; th.vulkan = altVulkan; th.berge = altBerge; }
    });
    gruppe.userData.anzahl = anzahl;
    gruppe.userData.jahreszeit = null;
    return gruppe;
  }

  // ------------------------------------------------------------------ MegaWetter: Wetter/Jahreszeit je Zone, weich überblendet
  const ARTEN = ['regen', 'schnee', 'hagel', 'sandsturm'];
  const ART_WETTER = { regen: 'regen', schnee: 'schnee', hagel: 'hagel', sandsturm: 'sandsturm' };
  const TON_ART = { regen: 'regen', schnee: 'schnee', hagel: 'hagel', sandsturm: 'wind' };

  function mitMega(Basis) {
    class MegaWetter extends Basis {
      constructor(szene, opt) {
        opt = opt || {};
        // Basis: Sommer, klar, kein Wind – alles Weitere kommt aus den Zonen
        super(szene, Object.assign({}, opt, { jahreszeit: 'sommer', wetter: 'klar', wind: { staerke: 0, richtung: 0 }, thema: 'wiese' }));
        this.mega = true;
        this.megaSeed = (opt.seed === undefined ? 4711 : opt.seed) >>> 0;
        this.zonen = zonen(this.megaSeed);
        if (this.strecke) this.strecke.megaZonen = this.zonen;
        this._basisDaten = this.daten;
        this._profil = {};
        this._huds = new Set();
        this._umweltTmp = { gripFaktor: 1, bremsFaktor: 1, windX: 0, windZ: 0, windStaerke: 0, windRichtung: 0 };
        this._umwelt.mega = this;           // Marke für den Physik-Hook (Vehicle.schritt)
        this._gewicht = { regen: 0, schnee: 0, hagel: 0, sandsturm: 0 };
        this._mSys = {};
        this._lastEmoji = null;
        this._idx = -1;
        this._cA = null;
        this._tonZeit = 0;
        this.zoneNr = 0;
      }

      /** Zone/Profil an Bogenlänge s. */
      profil(s, ziel) { return profilBei(this.zonen, s, ziel); }

      /** Umwelt für ein Fahrzeug (Haftung/Bremsen je Zone, geblendet) – gleich auf Server und Browser (nur Funktion von x, z). */
      umweltFuer(v) {
        const u = this._umweltTmp, st = this.strecke;
        if (!st) { u.gripFaktor = u.bremsFaktor = 1; return u; }
        const n = st.spline.naechster(v.x, v.z, v._megaIdx === undefined ? -1 : v._megaIdx);
        v._megaIdx = n.index;
        const p = profilBei(this.zonen, n.s, this._pTmp || (this._pTmp = {}));
        u.gripFaktor = mix(p, (e) => e.grip); u.bremsFaktor = mix(p, (e) => e.brems);
        return u;
      }

      /** 15.10. (v24): Niederschlag (Regen, Schnee, Hagel) in der Zone, in der das Fahrzeug fährt? (Cabrio-Dach-Regel, cars/dachregel.js; nur Funktion von x, z) */
      nass(v) {
        const st = this.strecke;
        if (!st || !v) return false;
        const n = st.spline.naechster(v.x, v.z, v._megaIdx === undefined ? -1 : v._megaIdx);
        v._megaIdx = n.index;
        const p = profilBei(this.zonen, n.s, this._pNass || (this._pNass = {}));
        const art = erscheinung(p.a).art;
        return art === 'regen' || art === 'schnee' || art === 'hagel';
      }

      // ---------- Aussehen
      anwenden(thema, licht) {
        const erg = super.anwenden(thema, licht);
        const sz = this.szene;
        if (!sz) return erg;
        const so = licht && licht.sonne, hk = licht && licht.halbkugel;
        this._licht = { so, hk, soInt: so ? so.intensity : 1, hkInt: hk ? hk.intensity : 1, soFarbe: so ? so.color.getHex() : 0xffffff,
          hkBoden: hk ? hk.groundColor.getHex() : 0, basisSicht: erg.sicht };
        if (so && so.userData.basisPos) {
          const b = so.userData.basisPos; this._sonneBasis = { b, flach: Math.hypot(b.x, b.z), lang: b.length(), h: Math.atan2(b.y, Math.hypot(b.x, b.z)) };
        }
        this._randsteineFaerben(sz);
        this._basisSicht = erg.sicht;
        this._wolkenFaktor = 1;
        profilBei(this.zonen, 0, this._profil);
        this._zoneAnwenden(true);
        return erg;
      }

      /** Randsteine: Schnee-Rand (weiß) in Winter-Zonen, weich nach Zonen-Gewicht. */
      _randsteineFaerben(sz) {
        const st = this.strecke;
        if (!st) return;
        sz.traverse((o) => {
          if (!o.isMesh || o.name !== 'Randsteine' || o.userData.megaGefaerbt || !o.geometry.attributes.color) return;
          o.userData.megaGefaerbt = true;
          const col = o.geometry.attributes.color, pos = o.geometry.attributes.position, a = col.array, W = R.Wetter;
          const tmp = {}, weiss = new THREE.Color(0xf4f7fa), c = new THREE.Color();
          for (let i = 0; i < pos.count; i++) {
            const x = pos.getX(i) + o.position.x, z = pos.getZ(i) + o.position.z;
            const p = profilBei(this.zonen, sBeiXZ(st, x, z), tmp);
            const g = mix(p, (e) => (e.randSchnee ? 1 : 0));
            if (g <= 0.01) continue;
            if (Math.max(a[i * 3], a[i * 3 + 1], a[i * 3 + 2]) - Math.min(a[i * 3], a[i * 3 + 1], a[i * 3 + 2]) > 0.08) continue;   // nur graue Randsteine
            c.setRGB(a[i * 3], a[i * 3 + 1], a[i * 3 + 2]).lerp(weiss, 0.85 * g);
            a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b;
          }
          col.needsUpdate = true;
        });
      }

      /** Wolken: Größe nach Wolkendecke (mit _wolkenFaktor); sonst wie die Basis. */
      _wolkenMatrizen() {
        const m = this._wolken; if (!m) return;
        const g = this._wolkenFaktor || 1, kugeln = m.userData.kugeln, e = m.instanceMatrix.array, W = 680, H = 340;
        const vx = this._wolkenVersatz.x, vz = this._wolkenVersatz.z;
        for (let i = 0; i < kugeln.length; i++) {
          const k = kugeln[i], wd = this._wolkenDaten[k.wolke];
          let x = wd.cx + vx + H; x -= Math.floor(x / W) * W; x -= H;
          let z = wd.cz + vz + H; z -= Math.floor(z / W) * W; z -= H;
          const r = Math.hypot(x, z), f = (r > 300 ? Math.max(0, (340 - r) / 40) : 1) * g;
          const o = i * 16;
          e[o] = k.sx * f; e[o + 1] = 0; e[o + 2] = 0; e[o + 3] = 0;
          e[o + 4] = 0; e[o + 5] = k.sy * f; e[o + 6] = 0; e[o + 7] = 0;
          e[o + 8] = 0; e[o + 9] = 0; e[o + 10] = k.sz * f; e[o + 11] = 0;
          e[o + 12] = x + k.ox; e[o + 13] = wd.h + k.oy; e[o + 14] = z + k.oz; e[o + 15] = 1;
        }
        m.instanceMatrix.needsUpdate = true;
      }

      /** Himmel, Nebel, Licht, Wolken, Sonne und Niederschlags-Gewichte aus dem Profil an der Kamera setzen. */
      _zoneAnwenden(sofort) {
        const sz = this.szene, p = this._profil, L = this._licht;
        if (!sz || !L) return;
        const T = this.tz;
        const sicht = mix(p, (e) => e.sicht), nebelNah = mix(p, (e) => e.nebelNah);
        const lf = mix(p, (e) => e.licht), decke = mix(p, (e) => (e.decke ? 1 : 0));
        if (!this._cA) { this._cA = new THREE.Color(); this._cB = new THREE.Color(); this._wolkeW = new THREE.Color(0xffffff); this._wolkeG = new THREE.Color(0xa4abb4);
          this._eigenW = new THREE.Color(0x9a9fa6); this._eigenG = new THREE.Color(0x50565e); }
        const farbe = (f, ziel) => {
          this._cA.setHex(f(erscheinung(p.a)));
          if (p.b) { this._cB.setHex(f(erscheinung(p.b))); this._cA.lerp(this._cB, p.w); }
          return ziel.copy(this._cA);
        };
        const nebelFarbe = sz.fog ? sz.fog.color : null;
        if (!T) {                                    // Tageszeit-Himmel (Dämmerung/Nacht) bleibt wie in der Basis
          if (sz.background && sz.background.isColor) farbe((e) => e.himmel, sz.background);
          if (nebelFarbe) farbe((e) => e.nebel, nebelFarbe);
        }
        if (sz.fog) { sz.fog.far = sicht; sz.fog.near = sicht * nebelNah; }
        this.sicht = sicht; this.nebelNahAnteil = nebelNah;
        const so = L.so, hk = L.hk;
        if (so) {
          so.intensity = L.soInt * lf;
          if (!T) {
            const fc = mix(p, (e) => (e.lichtFarbe === null ? 0 : 1)) > 0.5;
            const e1 = erscheinung(p.a);
            if (e1.lichtFarbe !== null || fc) { const ziel = (e1.lichtFarbe !== null ? e1.lichtFarbe : L.soFarbe); so.color.setHex(ziel); } else so.color.setHex(L.soFarbe);
            const sb = this._sonneBasis;
            if (sb) {
              const grad = mix(p, (e) => (e.sonnenHoehe === null ? sb.h * 180 / Math.PI : e.sonnenHoehe)), h = grad * Math.PI / 180;
              so.position.set(sb.b.x / sb.flach * Math.cos(h) * sb.lang, Math.sin(h) * sb.lang, sb.b.z / sb.flach * Math.cos(h) * sb.lang);
            }
          }
        }
        if (hk) hk.intensity = L.hkInt * lf;
        // Wolken: weiß → grau, größer bei Decke; Sonne nur ohne Decke
        if (this._wolken) {
          this._wolken.material.color.copy(this._wolkeW).lerp(this._wolkeG, decke);
          this._wolken.material.emissive.copy(this._eigenW).lerp(this._eigenG, decke);
          this._wolkenFaktor = 1 + 0.7 * decke;
        }
        if (this._sonne) this._sonne.visible = decke < 0.5;
        // Niederschlag
        ARTEN.forEach((a) => { this._gewicht[a] = 0; });
        const gw = (zone, wgt) => { const art = erscheinung(zone).art; if (art) this._gewicht[art] += wgt; };
        gw(p.a, 1 - (p.b ? p.w : 0)); if (p.b) gw(p.b, p.w);
        // Anzeige: Zone mit dem größeren Gewicht
        const dom = p.b && p.w > 0.25 ? p.b : p.a;
        this.zoneNr = this.zonen.indexOf(dom);
        this.wetterArt = dom.wetter; this.jahreszeit = dom.jz;
        this._aktDaten = this.daten = R.config.wetter[dom.wetter] || R.config.wetter.klar;
        const em = erscheinung(dom).emoji;
        if (em !== this._lastEmoji) {
          const erstes = this._lastEmoji === null;
          this._lastEmoji = em; this._emoji = em;
          this._huds.forEach((h) => {
            if (h.wetterSetzen) h.wetterSetzen(this);
            if (!erstes && !sofort && h.meldung && h.f && h.f.istSpieler !== false) h.meldung(em + ' ' + erscheinung(dom).name, 2200);
          });
        }
      }

      get emoji() { return this._emoji !== undefined ? this._emoji : (this.daten.emoji || ''); }

      // ---------- Niederschlag: je Art ein eigenes System je Kamera, Deckkraft = Gewicht
      partikelBauen(kameraAnzahl) {
        this._megaPartikelAbbauen();
        if (!this.szene) return;
        ARTEN.forEach((a) => {
          this.daten = R.config.wetter[ART_WETTER[a]];
          super.partikelBauen(kameraAnzahl);
          this._mSys[a] = this._systeme.map((sy) => { sy.basisOpacity = sy.obj.material.opacity; sy.obj.visible = false; return sy; });
          this._systeme = [];
        });
        this.daten = this._aktDaten || this._basisDaten;
      }
      _megaPartikelAbbauen() {
        Object.keys(this._mSys).forEach((a) => {
          this._mSys[a].forEach((sy) => { if (sy.obj.parent) sy.obj.parent.remove(sy.obj); sy.obj.geometry.dispose(); sy.obj.material.dispose(); });
        });
        this._mSys = {};
      }

      update(dt, kameras) {
        if (!(dt > 0)) dt = 0;
        dt = Math.min(dt, 0.1);
        this._zeit += dt;
        const st = this.strecke;
        const k0 = kameras && kameras[0] && (kameras[0].kamera || kameras[0]);
        if (st && k0 && k0.position) {
          const n = st.spline.naechster(k0.position.x, k0.position.z, this._idx);
          this._idx = n.index;
          profilBei(this.zonen, n.s, this._profil);
          this._zoneAnwenden(false);
        } else if (!this._profil.a) { profilBei(this.zonen, 0, this._profil); this._zoneAnwenden(true); }
        // Wolken ziehen langsam
        if (this._wolken) {
          this._wolkenVersatz.x += 0.8 * dt; this._wolkenVersatz.z += 0.3 * dt;
          this._wolkenMatrizen();
        }
        if (kameras) {
          ARTEN.forEach((a) => {
            const w = this._gewicht[a], liste = this._mSys[a] || [];
            const aktiv = w > 0.02;
            if (aktiv) this.daten = R.config.wetter[ART_WETTER[a]];
            const nk = Math.min(kameras.length, liste.length);
            for (let i = 0; i < liste.length; i++) {
              const sy = liste[i];
              if (!aktiv || i >= nk) { sy.obj.visible = false; continue; }
              const k = kameras[i] && (kameras[i].kamera || kameras[i]);
              if (!k || !k.position) { sy.obj.visible = false; continue; }
              k.layers.enable(Basis.LAYER_BASIS + i);
              this._systemUpdate(sy, k, dt);
              sy.obj.material.opacity = sy.basisOpacity * Math.min(1, w);
            }
          });
          this.daten = this._aktDaten || this._basisDaten;
        }
        this._tonPruefen(dt);
      }

      _tonPruefen(dt) {
        if (!this.tonErlaubt) return;
        const A = R.Audio;
        if (!A || typeof A.wetter !== 'function' || !A._bereit || !A._bereit()) return;
        this._tonZeit -= dt || 0;
        if (this._tonZeit > 0) return;
        this._tonZeit = 0.3; this._ton = true;
        ARTEN.forEach((a) => {
          const w = Math.min(1, this._gewicht[a] || 0);
          if (w > 0.03) A.wetter(TON_ART[a], true, w); else A.wetter(TON_ART[a], false);
        });
      }

      zerstoeren() {
        this._megaPartikelAbbauen();
        super.zerstoeren();
      }
    }
    return MegaWetter;
  }

  // ------------------------------------------------------------------ Einhängen (ohne Änderung der bestehenden Module)
  // 1. R.Wetter: für die Megastrecke entsteht ein MegaWetter (new R.Wetter(szene, { strecke }) in main.js und server/simulation.js).
  if (R.Wetter && !R.Wetter.istMegaHuelle) {
    const Basis = R.Wetter, Mega = mitMega(Basis);
    const Huelle = function (szene, opt) { return (opt && opt.strecke && opt.strecke.id === 'mega') ? new Mega(szene, opt) : new Basis(szene, opt); };
    Huelle.prototype = Basis.prototype;
    Object.keys(Basis).forEach((k) => { Huelle[k] = Basis[k]; });
    Huelle.LAYER_BASIS = Basis.LAYER_BASIS;
    Huelle.istMegaHuelle = true;
    Huelle.MegaWetter = Mega;
    R.Wetter = Huelle;
  }
  // 2. Deko: für die Megastrecke je Zone.
  if (R.themes && R.themes.dekoBauen && !R.themes.dekoBauen.istMega) {
    const orig = R.themes.dekoBauen;
    R.themes.dekoBauen = function (themaName, strecke, jahreszeit) {
      if (strecke && strecke.id === 'mega') return megaDeko(strecke, orig);
      return orig.apply(this, arguments);
    };
    R.themes.dekoBauen.istMega = true;
  }
  // 3. Bodenfarbe (Boden + Böschung) je Abschnitt/Zone.
  if (R.Strecke && R.Strecke.prototype._bodenFarbe && !R.Strecke.prototype._bodenFarbe.istMega) {
    const orig = R.Strecke.prototype._bodenFarbe, tmp = (typeof THREE !== 'undefined') ? { a: new THREE.Color(), b: new THREE.Color() } : null;
    R.Strecke.prototype._bodenFarbe = function (x, z, basis, zweite, mitZweiter, c) {
      if (this.id !== 'mega' || !tmp) return orig.call(this, x, z, basis, zweite, mitZweiter, c);
      const f = bodenFarben(this, sBeiXZ(this, x, z));
      tmp.a.setHex(f.b1); tmp.b.setHex(f.b2 === undefined ? f.b1 : f.b2);
      return orig.call(this, x, z, tmp.a, tmp.b, f.b2 !== undefined, c);
    };
    R.Strecke.prototype._bodenFarbe.istMega = true;
  }
  // 4. Physik: Haftung/Bremsen je Zone (Position des Autos) – Vehicle.schritt bekommt die Umwelt des Fahrzeugs.
  if (R.Vehicle && R.Vehicle.prototype.schritt && !R.Vehicle.prototype.schritt.istMega) {
    const orig = R.Vehicle.prototype.schritt;
    R.Vehicle.prototype.schritt = function (dt, s, hilfe, umwelt) {
      if (umwelt && umwelt.mega) umwelt = umwelt.mega.umweltFuer(this);
      return orig.call(this, dt, s, hilfe, umwelt);
    };
    R.Vehicle.prototype.schritt.istMega = true;
  }
  // 5. HUD: Symbol Jahreszeit + Wetter aktuell halten.
  if (R.Hud && R.Hud.prototype.wetterSetzen && !R.Hud.prototype.wetterSetzen.istMega) {
    const orig = R.Hud.prototype.wetterSetzen;
    R.Hud.prototype.wetterSetzen = function (w) {
      orig.call(this, w);
      if (w && w.mega && w._huds) w._huds.add(this);
    };
    R.Hud.prototype.wetterSetzen.istMega = true;
  }

  R.Mega.zonen = zonen;
  R.Mega.profilBei = profilBei;
  R.Mega.erscheinung = erscheinung;
  R.Mega.huelle = huelle;
  R.Mega.megaDeko = megaDeko;
  R.Mega.JAHRESZEITEN = JAHRESZEITEN;
})();
