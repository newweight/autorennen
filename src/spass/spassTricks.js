// ============================================================
// Spaß-Paket S3 – Neue Tricks (Motorrad UND Auto): Rechenkern + Verdrahtung. Läuft im Browser (beide Spiele) UND im Server (Motorrad-Räume), deterministisch:
// keine Zeit, kein Math.random, nur Eingaben und Physik-Schritte. Darstellung (Fahrer-Animation, Auto-Pose, Zeitlupe, Kamera) steht in spassTricksFahrer.js / spassTricksUI.js.
//
// Motorrad (Haken am Muster src/moto/stuntStart.js; Punkte/Combo teilen sich den Zustand der Stunts, spiel.stunt.fz[i]):
//   in der Luft: Trick-Taste (rechte Umschalt / Spieler 2: linke Umschalt) UND eine Pfeil-Richtung kurz antippen (in beliebiger Reihenfolge, Fenster 0,25 s):
//     Trick + ↓ (Bremse)      Backflip   (Rückwärtssalto, 360° um die Querachse nach hinten)
//     Trick + ↑ (Gas)         Superman   (Fahrer streckt sich nach hinten, Hände am Lenker)
//     Trick + ← oder →        Handstand  (Fahrer im Handstand auf dem Lenker)
//   Trick allein = Drehung / zweimal = Salto bleibt unverändert (stunts.js). Ein Richtungs-Trick ersetzt eine gerade begonnene Drehung.
// Auto (neu, Schalter „🤸 Auto-Tricks“, Standard an offline; online mit dem Raum-Schalter `tricks`, siehe server/r3Sim.js): in der Luft Trick-Taste (rechte Umschalt; Spieler 2: linke Umschalt – im Autorennen frei):
//     Taste allein oder + ← / →   Fassrolle (Drehung um die Längsachse, Richtung nach Pfeil)
//     Taste + ↑ / ↓               Schraube   (Drehung um die Hochachse)
//   Landung mit unfertigem Trick (oder schiefe Landung nach einem Trick): kurzes Wackeln + Abbremsen, Schaden nur bei eingeschaltetem Schaden-Modus.
// Punkte, Combo (gleiche Combo wie die alten Stunts), Vielfalt: jeder weitere VERSCHIEDENE Trick in derselben Combo-Kette gibt +25 % (höchstens +100 %).
// Online (Motorrad-Räume immer, Auto-Räume mit Raum-Schalter `tricks`, R3): der Server rechnet dieselben Tricks (Richtung aus der übertragenen Eingabe), Punkte als normale Stunt-Ereignisse; zustand.mo[i] bekommt
//   [13] Trick-Code (0 keiner · 1 Superman · 2 Handstand · 3 Backflip) und [14] Fortschritt 0..1. Der Backflip läuft zusätzlich über salto (mo[8]).
//
//   R.SpassTricks.config / plan / gewicht / anzeige / schritt / zNeu     reine Logik (Node-Test tests/test_spass_s3.js)
//   R.SpassTricks.an(art) / anSetzen(art, bool)                          Schalter 'auto' (Auto-Tricks) und 'zeit' (Zeitlupe), Standard an, eigener Speicher
//   R.SpassTricks.restFlug(fl)                                           Restflugzeit (Ballistik oder Kanone)
// ============================================================
(function () {
  const R = window.Rennspiel;
  if (!R) return;
  R.config = R.config || {};
  R.config.spass = R.config.spass || {};
  if (!R.config.spass.tricks) {
    R.config.spass.tricks = {
      punkte: { superman: 500, handstand: 700, backflip: 500, fassrolle: 300, schraube: 250 },
      // dauer = normale Dauer, min = kürzeste (abgekürzte) Dauer; reserve = so viel Zeit vor der Landung muss der Trick fertig sein
      zeit: { superman: { dauer: 1.1, min: 0.7 }, handstand: { dauer: 1.2, min: 0.8 }, backflip: { dauer: 1.0, min: 0.7 }, fassrolle: { dauer: 0.9, min: 0.6 }, schraube: { dauer: 0.8, min: 0.55 } },
      reserve: 0.15, frueh: 0.1, fenster: 0.25,        // frueh: frühestens so lange nach dem Absprung; fenster: Trick-Taste und Richtung höchstens so weit auseinander
      einblend: 0.25,                                  // Haltetricks (Superman/Handstand): so lange in die Pose hinein bzw. wieder heraus (Anteil der Dauer)
      autoWarte: 0.12,                                 // Auto: Trick-Taste allein startet die Fassrolle erst nach dieser Wartezeit (falls noch eine Richtung kommt)
      vielfalt: 0.25, vielfaltMax: 4,                  // +25 % je weiterem verschiedenen Trick in der Combo-Kette, höchstens +100 %
      combo: { fenster: 4, max: 5 },                   // Auto: gleiche Combo-Regel wie beim Motorrad
      taste: ['ShiftRight', 'ShiftLeft'],              // Auto: Spieler 1 (Pfeile) / Spieler 2 (WASD)
      hoehe: { backflip: 0.35, fassrolle: 0.45, schraube: 0.25 },     // kleiner Hüpfer in der Mitte (nur Anzeige)
      wackeln: { dauer: 0.5, amp: 0.16, tempo: 0.88, schaden: 6 },   // Auto: Landung unfertig/schief nach Trick
      zeitlupe: {
        minFlug: 1.5,                                  // s Gesamtflugzeit, ab der ein Sprung „groß“ ist (Trampolin 1,8 s, Kanone 2,4 s)
        start: 0.3,                                    // Beginn bei diesem Anteil der Flugzeit (kurz vor dem Scheitel); Kanone: nach dem Schuss
        faktor: 0.4, dauer: 1.0, ein: 0.15, aus: 0.25, // Anzeige-Zeit ×0,4 für ~1 s (echte Zeit), weich ein/aus
        onlineMinLuft: 0.7,                            // online (keine Zeitlupe, nur Kamera): so lange schon in der Luft → Schwenk
        schwenk: { winkel: 1.05, dauer: 1.5, abstand: 7.5, hoehe: 1.6 },   // Kamera schwenkt seitlich (rad, s), Abstand/Höhe zum Fahrzeug
      },
    };
  }
  if (!R.config.spass.tricks.ki) {
    // R3 (KI-Tricks offline): Chance je Flug nach Schwierigkeit; Auto: Anteil Schraube (Rest Fassrolle); Motorrad: Anteile [Superman, Backflip, Handstand];
    // startMin/startSpanne: Zeit nach dem Absprung (s), zusatz: so viel Restflugzeit über Trickdauer + Reserve muss übrig sein (sonst macht die KI gar keinen Trick – nie ein Fehltrick)
    const mo = { leicht: [1, 0, 0], mittel: [0.7, 0.3, 0], schwer: [0.4, 0.4, 0.2], profi: [0.2, 0.4, 0.4], meister: [0.1, 0.4, 0.5], legende: [0.1, 0.4, 0.5], unschlagbar: [0.1, 0.4, 0.5] };
    R.config.spass.tricks.ki = {
      chance: { leicht: 0.10, mittel: 0.25, schwer: 0.40, profi: 0.55, meister: 0.65, legende: 0.75, unschlagbar: 0.85 },
      schraube: { leicht: 0, mittel: 0.2, schwer: 0.35, profi: 0.5, meister: 0.55, legende: 0.6, unschlagbar: 0.6 },
      moto: mo, startMin: 0.25, startSpanne: 0.2, zusatz: 0.3, standard: 'mittel',
    };
  }
  const C = () => R.config.spass.tricks;
  const ARTEN_MOTO = ['superman', 'handstand', 'backflip'];
  const ARTEN_AUTO = ['fassrolle', 'schraube'];
  const NAMEN = { superman: 'Superman!', handstand: 'Handstand!', backflip: 'Backflip!', fassrolle: 'Fassrolle!', schraube: 'Schraube!' };
  const CODE = { superman: 1, handstand: 2, backflip: 3 };           // Protokoll mo[13]
  const RICHTUNGEN = ['runter', 'hoch', 'links', 'rechts'];
  const klemme = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
  const glatt = (p) => { p = klemme(p, 0, 1); return p * p * (3 - 2 * p); };
  const moto = () => window.MOTORRAD === true;

  // ---------------------------------------------------------------- Schalter (Auto-Tricks, Zeitlupe): eigener Speicher, Standard an
  const ramAn = {};
  const KEY = (a) => 'rennspiel.spass.tricks.' + a + '.' + (moto() ? 'motorrad' : 'auto');
  function an(art) {
    try { const ls = typeof localStorage !== 'undefined' ? localStorage : null; if (ls) { const v = ls.getItem(KEY(art)); if (v === '1') return true; if (v === '0') return false; } } catch (e) { /* ohne Speicher */ }
    const r = ramAn[KEY(art)];
    return r === undefined ? true : r;
  }
  function anSetzen(art, v) {
    ramAn[KEY(art)] = !!v;
    try { const ls = typeof localStorage !== 'undefined' ? localStorage : null; if (ls) ls.setItem(KEY(art), v ? '1' : '0'); } catch (e) { /* egal */ }
  }

  // ---------------------------------------------------------------- reine Logik
  /** Restflugzeit eines Fluges (s): Ballistik wie stunts.restFlugzeit, Kanone: Rest bis zur Landung. null = keine Tricks möglich (Kanone: noch im Rohr). */
  function restFlug(fl, boden) {
    if (!fl) return null;
    if (fl.kanone) {
      const k = R.config.spass && R.config.spass.kanone, K = fl.kanone;
      if (!k) return null;
      const tC = k.einziehen + k.countdown;
      return K.t < tC ? null : tC + k.flugZeit - K.t;
    }
    const g = (R.config.stunt && R.config.stunt.schanze && R.config.stunt.schanze.g) || 9.81, h = Math.max(0, fl.y - boden);
    return (fl.vy + Math.sqrt(Math.max(0, fl.vy * fl.vy + 2 * g * h))) / g;
  }
  /** Zeitplan: { dauer, abgekuerzt } oder null (zu kurz → gar nicht erst beginnen). Der Trick ist spätestens `reserve` s vor der Landung fertig. */
  function plan(rest, art, cfg) {
    const k = cfg || C(), c = k.zeit[art];
    if (!c || !(rest > 0)) return null;
    const frei = rest - k.reserve;
    if (frei >= c.dauer) return { dauer: c.dauer, abgekuerzt: false };
    if (frei >= c.min) return { dauer: frei, abgekuerzt: true };
    return null;
  }
  /** Einblend-Gewicht eines Haltetricks bei Zeitanteil p: sanft in die Pose, halten, sanft heraus (0..1). */
  function gewicht(p, cfg) {
    const a = (cfg || C()).einblend;
    return glatt(p / a) * glatt((1 - p) / a);
  }
  /** Anzeige-Pose eines laufenden Tricks bei Zeitanteil p: salto (Motorrad-Backflip, + = nach hinten), rolle/schraube (Auto, rad), hoehe (m), w (Haltetricks). */
  function anzeige(art, p, dir, cfg) {
    const k = cfg || C(), e = glatt(p), pp = klemme(p, 0, 1), h = (k.hoehe && k.hoehe[art]) || 0, d = dir || 1;
    const o = { art, p: pp, w: 0, salto: 0, rolle: 0, schraube: 0, hoehe: 0 };
    if (art === 'backflip') { o.salto = 2 * Math.PI * e; o.hoehe = h * Math.sin(Math.PI * pp); }
    else if (art === 'superman' || art === 'handstand') o.w = gewicht(pp, k);
    else if (art === 'fassrolle') { o.rolle = d * 2 * Math.PI * e; o.hoehe = h * Math.sin(Math.PI * pp); }
    else if (art === 'schraube') { o.schraube = d * 2 * Math.PI * e; o.hoehe = h * Math.sin(Math.PI * pp); }
    return o;
  }

  // ---------------------------------------------------------------- Fahrer-Pose (reine Zahlen, Fahrzeugraum des Cross-Motorrads: Front −z, y oben)
  // Der Oberkörper (Becken, Rumpf, Schultern, Rückenschutz, Nacken) wird starr gedreht: erst Rz(rho) (Rolle um die Längsachse: Handstand = π), dann Rx(theta) (Nicken).
  // Kopf: Position starr mit dem Oberkörper, Ausrichtung Rz(rho) (Helm bleibt „aufrecht“ zur Blickrichtung). Beine: Zwei-Knochen-IK von der Hüfte zum Fuß-Ziel
  // (Seite = Vorzeichen der Hüft-x-Lage nach der Drehung), Arme: von der Schulter zum Lenkergriff (die Hände bleiben am Griff, auch beim Lenken).
  const FAHRER = {
    A: [0, 1.07, 0.19], B: [0, 1.46, -0.05],             // Rumpf-Anfang / -Ende der festen Sitzpose (motoModell.js fahrerGeo)
    hueft: [0.11, 1.0, 0.20], schulter: [0.19, 1.45, -0.05], kopf: [0, 1.64, -0.13],
    ober: 0.27, unter: 0.27, bein: 0.43,
    ruhe: { A: [0, 1.07, 0.19], rho: 0, theta: 0, fuss: [[-0.245, 0.52, 0.19], [0.245, 0.52, 0.19]], knie: [[-0.25, 0.3, -1], [0.25, 0.3, -1]], ellbogen: [[-0.8, 0.4, 0.35], [0.8, 0.4, 0.35]], kopfRoll: 0 },
    superman: { A: [0, 1.26, 0.49], rho: 0, theta: -41 * Math.PI / 180, fuss: [[-0.17, 1.40, 1.34], [0.17, 1.40, 1.34]], knie: [[-0.15, 1, -0.1], [0.15, 1, -0.1]], ellbogen: [[-0.6, 0.8, 0], [0.6, 0.8, 0]], kopfRoll: 0 },
    handstand: { A: [0, 2.115, -0.24], rho: Math.PI, theta: -24 * Math.PI / 180, fuss: [[-0.26, 2.95, -0.10], [0.26, 2.95, -0.10]], knie: [[-0.2, 0.1, -1], [0.2, 0.1, -1]], ellbogen: [[-0.8, 0, -0.6], [0.8, 0, -0.6]], kopfRoll: Math.PI },
  };
  /**
   * Pose des Fahrers: art 'superman' | 'handstand' (sonst Ruhe), w = Einblend-Gewicht 0..1, t = Zeit (s, für das Wackeln der Beine).
   * Rückgabe { A, rho, theta, fuss [links(x<0), rechts(x>0)], knie, ellbogen, kopfRoll } – Zahlenlisten.
   */
  function fahrerPose(art, w, t) {
    const Z = FAHRER[art] || FAHRER.ruhe, N = FAHRER.ruhe, k = klemme(w, 0, 1), L = (a, b) => a + (b - a) * k;
    const v3 = (a, b) => [L(a[0], b[0]), L(a[1], b[1]), L(a[2], b[2])];
    const o = { A: v3(N.A, Z.A), rho: L(N.rho, Z.rho), theta: L(N.theta, Z.theta), kopfRoll: L(N.kopfRoll, Z.kopfRoll), fuss: [], knie: [], ellbogen: [] };
    const bogen = Math.sin(Math.PI * k);
    for (let s = 0; s < 2; s++) {
      const f = v3(N.fuss[s], Z.fuss[s]), sg = s === 0 ? -1 : 1;
      f[0] += sg * 0.12 * bogen;                                   // Füße schwingen seitlich aus (nicht durch Auspuff/Heck)
      f[1] += 0.15 * bogen;
      o.fuss.push(f); o.knie.push(v3(N.knie[s], Z.knie[s])); o.ellbogen.push(v3(N.ellbogen[s], Z.ellbogen[s]));
    }
    if (t !== undefined && k > 0) {
      if (art === 'handstand') { const a = 2 * Math.PI * 1.4 * t; o.fuss[0][0] += -0.04 * k * Math.sin(a); o.fuss[1][0] += 0.04 * k * Math.sin(a + 1); o.fuss[0][2] += 0.05 * k * Math.sin(a + 2); o.fuss[1][2] += 0.05 * k * Math.sin(a + 0.5); }
      else if (art === 'superman') { o.A[1] += 0.012 * k * Math.sin(2 * Math.PI * 3 * t); o.fuss[0][1] += 0.02 * k * Math.sin(2 * Math.PI * 2.5 * t); o.fuss[1][1] += 0.02 * k * Math.sin(2 * Math.PI * 2.5 * t + 1); }
    }
    return o;
  }
  /** Punkt aus Oberkörper-Koordinaten (relativ zum Rumpf-Anfang A der Sitzpose) in den Fahrzeugraum: A' + Rx(theta)·Rz(rho)·(p − A). Reine Zahlen (Tests). */
  function ausKoerper(pose, p) {
    const a = FAHRER.A, x0 = p[0] - a[0], y0 = p[1] - a[1], z0 = p[2] - a[2];
    const cr = Math.cos(pose.rho), sr = Math.sin(pose.rho), x1 = x0 * cr - y0 * sr, y1 = x0 * sr + y0 * cr, z1 = z0;
    const ct = Math.cos(pose.theta), st = Math.sin(pose.theta), y2 = y1 * ct - z1 * st, z2 = y1 * st + z1 * ct;
    return [pose.A[0] + x1, pose.A[1] + y2, pose.A[2] + z2];
  }

  // ---------------------------------------------------------------- R3: KI-Tricks (offline), reine Logik
  function hash(text) { let h = 0x811c9dc5; for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return h >>> 0; }
  function zufall(seed) {
    let a = seed >>> 0;
    return function () { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  /**
   * Trick-Plan der KI für EINEN Flug (deterministisch, einmal je Flug beim Abflug). saat = 'streckenId|variante', nr = Fahrzeugnummer, flugNr = laufende Flugnummer,
   * schwierigkeit = 'leicht'…'unschlagbar' (unbekannt → mittel), spielart 'auto' | 'moto'.
   * → null (kein Trick) | { art, richtung ('hoch'|'runter'|'links'|'rechts' – die „gedrückte“ Richtung), dir (±1), startT (s nach dem Absprung) }
   */
  function kiPlanNeu(saat, nr, flugNr, schwierigkeit, spielart, cfg) {
    const k = (cfg || C()).ki, sw = k.chance[schwierigkeit] !== undefined ? schwierigkeit : k.standard;
    const r = zufall(hash('r3|' + saat + '|' + nr + '|' + flugNr));
    const wurf = r(), wahl = r(), start = r(), seite = r();
    if (wurf >= k.chance[sw]) return null;
    const startT = k.startMin + k.startSpanne * start;
    if (spielart === 'moto') {
      const a = k.moto[sw];
      if (wahl < a[0]) return { art: 'superman', richtung: 'hoch', dir: 1, startT };
      if (wahl < a[0] + a[1]) return { art: 'backflip', richtung: 'runter', dir: 1, startT };
      return seite < 0.5 ? { art: 'handstand', richtung: 'links', dir: -1, startT } : { art: 'handstand', richtung: 'rechts', dir: 1, startT };
    }
    if (wahl < k.schraube[sw]) return seite < 0.5 ? { art: 'schraube', richtung: 'hoch', dir: 1, startT } : { art: 'schraube', richtung: 'runter', dir: -1, startT };
    return seite < 0.5 ? { art: 'fassrolle', richtung: 'links', dir: -1, startT } : { art: 'fassrolle', richtung: 'rechts', dir: 1, startT };
  }
  /** Genug Restflugzeit, damit die KI den Trick sicher fertig bekommt (Dauer + Reserve + Zusatz)? */
  function kiGenugZeit(rest, art, cfg) {
    const k = cfg || C();
    return rest !== null && rest !== undefined && rest >= k.zeit[art].dauer + k.reserve + k.ki.zusatz;
  }

  function comboNeu() { return { zaehler: 0, letzter: -Infinity, max: 0 }; }
  /** Combo für das Auto (gleiche Regel wie Moto.stunts.comboStunt); liefert den Faktor für diesen Trick. */
  function comboStunt(c, jetzt, cfg) {
    const k = (cfg || C()).combo;
    c.zaehler = (jetzt - c.letzter <= k.fenster && c.zaehler > 0) ? c.zaehler + 1 : 1;
    c.letzter = jetzt;
    c.max = Math.max(c.max, Math.min(k.max, c.zaehler));
    return Math.min(k.max, c.zaehler);
  }

  function zNeu() {
    const dirT = {}, dirPrev = {};
    RICHTUNGEN.forEach((d) => { dirT[d] = -Infinity; dirPrev[d] = false; });
    return {
      jetzt: 0, luft: false, flugT: 0, flugNr: 0, trick: null, startT: -Infinity,
      tasteT: -Infinity, tastePrev: false, dirT, dirPrev, cnt: {},
      arten: {}, punkte: 0, combo: comboNeu(), ereignisse: [], tricksImFlug: 0,
      pose: { art: null, p: 0, w: 0, salto: 0, rolle: 0, schraube: 0, hoehe: 0, dir: 1 },
      wackel: null, landeFehler: false,
      stat: { superman: 0, handstand: 0, backflip: 0, fassrolle: 0, schraube: 0, abgekuerzt: 0 },
      gross: false, zlGetan: false, rest0: 0, t0: 0,
    };
  }

  function fertig(z3, e, k, cfg) {
    const t = z3.trick;
    if (!t) return;
    z3.stat[t.art]++; if (t.abgekuerzt) z3.stat.abgekuerzt++;
    const mult = e.comboStunt ? e.comboStunt(e.jetzt) : comboStunt(z3.combo, e.jetzt, cfg);
    const kette = e.comboZaehler ? e.comboZaehler() : z3.combo.zaehler;
    if (kette <= 1) z3.arten = {};
    z3.arten[t.art] = true;
    const verschieden = Object.keys(z3.arten).length, bonus = 1 + k.vielfalt * Math.min(k.vielfaltMax, verschieden - 1);
    const basis = k.punkte[t.art], punkte = Math.round(basis * mult * bonus);
    z3.tricksImFlug++;
    z3.ereignisse.push({ art: t.art, name: NAMEN[t.art], basis, mult, punkte, combo: kette, vielfalt: verschieden - 1, abgekuerzt: t.abgekuerzt });
  }

  /**
   * Ein Schritt. e = { dt, jetzt (Spielzeit s), luft, abflug, landung, flugT, rest (Restflugzeit s oder null), art 'moto'|'auto',
   *   taste (Trick-Taste neu gedrückt), halten (gehalten), dir { runter, hoch, links, rechts } (neu getippt: true), dirHalten (nur Dokumentation),
   *   comboStunt(jetzt) → Faktor (Motorrad: gemeinsame Combo), comboZaehler() → Länge der Kette }
   * Rückgabe: { start: art | null (neuer Trick begonnen) } – z3.ereignisse enthält fertige Tricks (der Aufrufer leert die Liste).
   */
  function schritt(z3, e, cfg) {
    const k = cfg || C(), dt = e.dt, ret = { start: null };
    z3.jetzt = e.jetzt;
    if (e.abflug) {
      z3.luft = true; z3.flugT = 0; z3.flugNr++; z3.trick = null; z3.startT = -Infinity; z3.tricksImFlug = 0; z3.landeFehler = false;
      z3.gross = false; z3.zlGetan = false; z3.rest0 = 0; z3.t0 = 0;
      RICHTUNGEN.forEach((d) => { z3.dirT[d] = -Infinity; }); z3.tasteT = -Infinity;
    }
    if (e.luft) z3.flugT = e.flugT;
    if (e.taste) z3.tasteT = e.jetzt;
    if (e.dir) RICHTUNGEN.forEach((d) => { if (e.dir[d]) z3.dirT[d] = e.jetzt; });
    // --- Landung ---
    if (e.landung || (z3.luft && !e.luft && !e.abflug)) {
      z3.luft = false;
      const t = z3.trick;
      if (t) {
        const anteil = t.t / t.dauer;
        if (anteil >= 0.5 && (e.art === 'moto' || anteil >= 0.9)) fertig(z3, e, k, cfg);                // Motorrad wie die alten Stunts (≥ 50 %); Auto: fast fertig, sonst Wackeln
        else if (e.art === 'auto') z3.landeFehler = true;
      }
      z3.trick = null;
    }
    // --- Start ---
    const frei = z3.luft && e.luft && e.rest !== null && e.rest !== undefined && z3.flugT >= k.frueh && !z3.trick;
    if (frei && (e.halten || e.jetzt - z3.tasteT <= k.fenster)) {
      let art = null, dir = 1, genutzt = null;
      const frisch = (d) => e.jetzt - z3.dirT[d] <= k.fenster && z3.dirT[d] > z3.startT;
      if (e.art === 'moto') {
        if (frisch('runter')) { art = 'backflip'; genutzt = 'runter'; }
        else if (frisch('hoch')) { art = 'superman'; genutzt = 'hoch'; }
        else if (frisch('links')) { art = 'handstand'; genutzt = 'links'; }
        else if (frisch('rechts')) { art = 'handstand'; genutzt = 'rechts'; }
      } else {
        if (frisch('links')) { art = 'fassrolle'; dir = -1; genutzt = 'links'; }
        else if (frisch('rechts')) { art = 'fassrolle'; dir = 1; genutzt = 'rechts'; }
        else if (frisch('hoch')) { art = 'schraube'; dir = 1; genutzt = 'hoch'; }
        else if (frisch('runter')) { art = 'schraube'; dir = -1; genutzt = 'runter'; }
        else if (z3.tasteT > z3.startT && e.jetzt - z3.tasteT >= k.autoWarte) { art = 'fassrolle'; dir = 1; }       // Taste allein
      }
      if (art) {
        const p = plan(e.rest, art, k);
        if (p) {
          z3.trick = { art, t: 0, dauer: p.dauer, abgekuerzt: p.abgekuerzt, dir, start: z3.flugT };
          z3.startT = e.jetzt; if (genutzt) z3.dirT[genutzt] = -Infinity;
          z3.tasteT = Math.min(z3.tasteT, e.jetzt - k.fenster - 1);              // Taste verbraucht (gehalten zählt für einen weiteren Richtungs-Trick weiter)
          ret.start = art;
        }
      }
    }
    // --- laufender Trick ---
    if (z3.trick && !ret.start) {
      z3.trick.t += dt;
      if (z3.trick.t >= z3.trick.dauer) { z3.trick.t = z3.trick.dauer; fertig(z3, e, k, cfg); z3.trick = null; }
    }
    // --- Auto: Wackeln nach unfertiger/schiefer Landung ---
    if (z3.wackel) { z3.wackel.t += dt; if (z3.wackel.t >= z3.wackel.dauer) z3.wackel = null; }
    // --- Anzeige-Pose ---
    const po = z3.pose;
    if (z3.trick) {
      const a = anzeige(z3.trick.art, z3.trick.t / z3.trick.dauer, z3.trick.dir, k);
      po.art = a.art; po.p = a.p; po.w = a.w; po.salto = a.salto; po.rolle = a.rolle; po.schraube = a.schraube; po.hoehe = a.hoehe; po.dir = z3.trick.dir;
    } else { po.art = null; po.p = 0; po.w = 0; po.salto = 0; po.rolle = 0; po.schraube = 0; po.hoehe = 0; }
    if (z3.wackel) { const w = z3.wackel, f = 1 - w.t / w.dauer; po.rolle += w.amp * f * Math.sin(w.t * 26); }
    return ret;
  }

  /** Wackel-Zustand starten (Auto): wird vom Aufrufer nach landeFehler gesetzt. */
  function wackelStarten(z3, cfg) { const w = (cfg || C()).wackeln; z3.wackel = { t: 0, dauer: w.dauer, amp: w.amp }; }

  R.SpassTricks = Object.assign(R.SpassTricks || {}, { config: C, kiPlanNeu, kiGenugZeit, hash, zufall, plan, gewicht, anzeige, schritt, zNeu, restFlug, comboStunt, comboNeu, an, anSetzen, wackelStarten, FAHRER, fahrerPose, ausKoerper,
    ARTEN_MOTO, ARTEN_AUTO, NAMEN, CODE, RICHTUNGEN, glatt });

  // ================================================================ Verdrahtung (Browser und Server)
  const P = R.Spiel && R.Spiel.prototype;
  if (!P || P._spassTricks) return;
  P._spassTricks = true;

  // ---- Tastenzähler (Browser): jeder Tastendruck zählt, auch wenn er zwischen zwei Physik-Schritten losgelassen wird ----
  const ZAEHL = {};
  let lauscher = false;
  function lauschen() {
    if (lauscher || typeof window === 'undefined' || !window.addEventListener) return;
    lauscher = true;
    window.addEventListener('keydown', (ev) => { if (!ev.repeat) ZAEHL[ev.code] = (ZAEHL[ev.code] || 0) + 1; }, true);
  }
  lauschen();
  // R3 (online): im Server-Raum mit Raum-Schalter `tricks` (spiel.tricksRaum === true) hat jeder Teilnehmer seine eigene Trick-Taste 'Trick<Nr>' (server/r3Sim.js, Eingabe-Bit k)
  const tastenCode = (nr, spiel) => (moto() ? ((R.config.motoStunts && R.config.motoStunts.taste) || [])[nr] : (spiel && spiel.tricksRaum === true ? 'Trick' + nr : C().taste[nr]));

  // ---- R3: KI-Tricks (nur offline im Browser; Server/Online-Clients haben kein spiel.szene bzw. spiel.online) ----
  // R3 online: im Server-Raum mit Raum-Schalter `tricks` (spiel.tricksRaum === true, kopflos) machen die Computer Tricks – unabhängig vom Menü-Schalter; sonst nur offline mit Szene und Schalter
  const kiAktiv = (spiel) => !!(spiel && ((spiel.tricksRaum === true && !spiel.szene) || (spiel.szene && !spiel.online && spiel.zustand !== 'online' && an('ki'))));
  const kiFahrerOk = (f) => !!(f && !f.istSpieler && !f.ausgeschieden && !f.polizei && !f.polizeiFahrer && !(f.looping && (f.looping.aktiv || f.looping.fallen)) && !(f.flug && f.flug.kanone));
  /** Plan der KI für den laufenden Flug (einmal je Flug, im Fahrzeug gemerkt). null = kein Trick. */
  function kiPlanFlug(spiel, i, f, flugNr) {
    if (f._r3 && f._r3.nr === flugNr) return f._r3.plan;
    const st = spiel.strecke, saat = (st ? st.id : '') + '|' + (st ? st.variante : '');
    const plan = R.SpassTricks.kiPlanNeu(saat, i, flugNr, f.driver && f.driver.schwierigkeit, moto() ? 'moto' : 'auto');
    f._r3 = { nr: flugNr, plan, getan: false };
    return plan;
  }
  /** Haken für src/moto/stuntStart.js: alter KI-Plan (Drehung/Salto). Schalter aus = wie bisher; an = neuer Trick ersetzt ihn, sonst seltener (0,6·(1−Chance)). */
  function kiAlt(spiel, i, f, saat, flugNr, St) {
    if (!kiAktiv(spiel) || !kiFahrerOk(f)) return St.kiPlan(saat, i, flugNr);
    if (kiPlanFlug(spiel, i, f, flugNr)) return null;
    const k = R.config.motoStunts, sw = f.driver && f.driver.schwierigkeit, c = C().ki.chance[C().ki.chance[sw] !== undefined ? sw : C().ki.standard];
    return St.kiPlan(saat, i, flugNr, Object.assign({}, k, { ki: Object.assign({}, k.ki, { trickChance: k.ki.trickChance * (1 - c) }) }));
  }

  function z3Holen(spiel) {
    const s = spiel._t3;
    if (s && s.rennen === spiel.rennen && s.fz.length === spiel.fahrzeuge.length) return s;
    return (spiel._t3 = { rennen: spiel.rennen, fz: spiel.fahrzeuge.map(() => null) });
  }

  function schrittSpiel(spiel, dt) {
    const rennen = spiel.rennen, strecke = spiel.strecke, input = spiel.input, sz = spiel.stunt;
    const istMoto = moto();
    if (spiel.tricksRaum !== undefined && spiel.tricksRaum !== true && !istMoto) return;      // R3 online: Auto-Raum ohne Raum-Schalter `tricks` → sofort zurück (bitgleich wie ohne dieses Modul)
    if (!rennen || !strecke || !input || spiel.zustand !== 'rennen' || spiel.pausiert || !(dt > 0) || !spiel.fahrzeuge) return;
    if (istMoto && (!sz || !sz.fz)) return;
    const kiAn = kiAktiv(spiel);
    // PRUEF-FIX 2: Auto-Tricks (Menschen) und KI-Tricks sind getrennte Schalter. Nur wenn BEIDE aus sind, endet der Schritt wie bisher (bitgleich); ist nur „Auto-Tricks“ aus, machen die Computer-Gegner trotzdem Tricks, die Menschen nicht.
    const menschAn = istMoto || spiel.tricksRaum === true || an('auto');
    if (!istMoto && !menschAn && !kiAn) { if (spiel._t3) spiel._t3 = null; return; }
    const S = z3Holen(spiel), T = R.config.tasten && R.config.tasten.spieler;
    const jetzt = istMoto ? sz.zeit : (spiel._t3.zeit = (spiel._t3.zeit || 0) + dt);
    for (let i = 0; i < spiel.fahrzeuge.length; i++) {
      const f = spiel.fahrzeuge[i], fl = f && f.flug;
      if (!f || !fl || f.ausgeschieden) continue;
      const ki = !f.istSpieler;                                             // R3: KI nur mit Schalter „KI-Tricks“ (kiAktiv), sonst wie bisher übersprungen
      if (ki ? !(kiAn && kiFahrerOk(f)) : !(f.spielerNr >= 0 && menschAn)) continue;
      const z = istMoto ? sz.fz[i] : null;
      if (istMoto && !z) continue;
      const z3 = S.fz[i] || (S.fz[i] = zNeu());
      const nr = f.spielerNr, v = f.vehicle;
      // --- Eingaben (Mensch: Tasten; KI: Plan, aber dieselbe Eingabe-Schnittstelle wie ein Mensch) ---
      let taste = false, halten = false;
      const dir = {};
      const luft = !!fl.aktiv, abflug = fl.fluege > (z3.fluegeGesehen || 0);
      if (!ki) {
        const code = tastenCode(nr, spiel), tc = T && T[nr];
        const st = input.steuerung ? input.steuerung(nr) : { gas: 0, bremse: 0, lenkung: 0 };
        halten = !!(code && input.istGedrueckt && input.istGedrueckt(code));
        const kante = (c, h, vor) => { const n = ZAEHL[c] || 0, neu = c !== undefined && n > (z3.cnt[c] || 0); if (c !== undefined) z3.cnt[c] = n; return neu || (h && !vor); };
        taste = kante(code, halten, z3.tastePrev); z3.tastePrev = halten;
        const hold = { hoch: st.gas > 0.5, runter: st.bremse > 0.5, links: st.lenkung < -0.5, rechts: st.lenkung > 0.5 };
        const codeVon = { hoch: tc && tc.gas, runter: tc && tc.bremse, links: tc && tc.links, rechts: tc && tc.rechts };
        RICHTUNGEN.forEach((d) => { dir[d] = kante(codeVon[d], hold[d], z3.dirPrev[d]); z3.dirPrev[d] = hold[d]; });
      } else RICHTUNGEN.forEach((d) => { dir[d] = false; });
      // --- Flug ---
      if (abflug) { z3.fluegeGesehen = fl.fluege; z3.rest0 = 0; z3.t0 = 0; z3.zlGetan = false; z3.gross = false; }
      const boden = strecke.hoeheAn(v.x, v.z, f.index);
      const rest = luft ? restFlug(fl, boden) : null;
      const landung = !luft && z3.luft;
      // große Sprünge (Zeitlupe/Kamera-Schwenk): einmal je Flug, wenn die Flugzeit ab dem ersten Moment mit Tricks (Kanone: ab dem Schuss) lang genug ist
      if (luft && rest !== null && !z3.rest0) { z3.rest0 = rest; z3.t0 = 0; }
      if (luft && z3.rest0) z3.t0 += dt;
      if (!ki && luft && !z3.zlGetan && z3.rest0 >= C().zeitlupe.minFlug && z3.t0 >= C().zeitlupe.start * z3.rest0) {
        z3.zlGetan = true; z3.gross = true;
        if (typeof spiel.spassGrosserSprung === 'function') spiel.spassGrosserSprung(i, z3.rest0);
      }
      if (ki && luft) {                                                      // KI: einmal je Flug zum Startzeitpunkt, nur mit sicherer Restflugzeit (kein Fehltrick)
        const plan = kiPlanFlug(spiel, i, f, fl.fluege), g = f._r3;
        if (plan && !g.getan && !z3.trick && fl.t >= plan.startT) {
          g.getan = true;
          if (kiGenugZeit(rest, plan.art)) { taste = true; dir[plan.richtung] = true; }
        }
      }
      const e = {
        dt, jetzt, luft, abflug, landung, flugT: fl.t, rest, art: istMoto ? 'moto' : 'auto', taste, halten, dir,
        comboStunt: istMoto ? (j) => R.Moto.stunts.comboStunt(z.combo, j) : null,
        comboZaehler: istMoto ? () => z.combo.zaehler : null,
      };
      // Motorrad: während eines Richtungs-Tricks keine Drehung/Salto der alten Stunts; frisch begonnene Drehung wird sanft zurückgenommen
      if (istMoto && z3.trick) { z.trick = null; z.wartend = null; z.folge = null; z.gierRest = 0; }
      const r = schritt(z3, e);
      if (istMoto && r.start && z.trick && z.trick.t < 0.35) {
        const Sx = R.Moto.stunts;
        z.gierRest = z.trick.art === 'drehung' ? Sx.trickPose('drehung', z.trick.t / z.trick.dauer).gier : 0;
        z.trick = null; z.wartend = null; z.folge = null;
      }
      if (istMoto && z3.trick) { z.trick = null; z.wartend = null; z.folge = null; }
      // --- Ereignisse ---
      if (z3.ereignisse.length) {
        for (let q = 0; q < z3.ereignisse.length; q++) {
          const ev = z3.ereignisse[q];
          if (istMoto) {
            z.punkte += ev.punkte; z.stat.ereignisse++;
            const x = Object.assign({}, ev, { gesamt: z.punkte });
            sz.alle.push(Object.assign({ fahrzeug: i, zeit: sz.zeit }, x));
            if (R.Moto.stuntHud && f.istSpieler) R.Moto.stuntHud.ereignis(spiel, i, x);
          } else if (ki) {
            z3.punkte += ev.punkte;                                           // KI-Auto: nur zählen, keine Anzeige
          } else {
            z3.punkte += ev.punkte;
            if (typeof spiel.spassTrickEreignis === 'function') spiel.spassTrickEreignis(i, Object.assign({}, ev, { gesamt: z3.punkte }));
          }
          if (!ki && typeof spiel.spassTrickSticker === 'function') spiel.spassTrickSticker(i, ev.art);
        }
        z3.ereignisse.length = 0;
      }
      // --- Auto: unfertige Landung → Wackeln, Abbremsen, Schaden nur mit Schaden-Modus ---
      if (!istMoto && z3.landeFehler && ki) z3.landeFehler = false;       // KI: nie Wackeln/Abbremsen
      if (!istMoto && z3.landeFehler) {
        z3.landeFehler = false;
        autoLandeFehler(spiel, i, f, z3);
      }
      // --- Pose in den gemeinsamen Zustand (Motorrad: Backflip über salto; Superman/Handstand über neuPose) ---
      if (istMoto) {
        const po = z3.pose;
        if (z3.trick && po.art === 'backflip') { z.pose.salto = po.salto; z.pose.hoehe = po.hoehe; z.pose.gier = 0; }
        else if (z3.trick) { z.pose.gier = 0; z.pose.salto = 0; }
        z.neuPose = z3.trick && (po.art === 'superman' || po.art === 'handstand') ? { code: CODE[po.art], p: Math.round(po.p * 1000) / 1000 } : (z3.trick && po.art === 'backflip' ? { code: 3, p: Math.round(po.p * 1000) / 1000 } : null);
      }
    }
  }

  function autoLandeFehler(spiel, i, f, z3) {
    const w = C().wackeln;
    wackelStarten(z3);
    f.vehicle.vLaengs *= w.tempo;
    if (spiel.schaden && spiel.schaden.an && typeof spiel.schaden.treffer === 'function') spiel.schaden.treffer(i, 'hindernis', w.schaden);
    if (typeof spiel.spassTrickWackeln === 'function') spiel.spassTrickWackeln(i);
  }

  const physikSchritt = P.physikSchritt;
  P.physikSchritt = function (dt) {
    const r = physikSchritt.apply(this, arguments);
    try { schrittSpiel(this, dt); } catch (e) { if (typeof console !== 'undefined') console.error('Tricks (S3):', e && e.stack || e); }
    return r;
  };

  // Landung schief nach einem Auto-Trick: zusätzlich Wackeln/Abbremsen (die schiefe Landung selbst rechnet schanze.js wie bisher)
  const flugEreignis = P._flugEreignis;
  if (flugEreignis) {
    P._flugEreignis = function (i, e) {
      const r = flugEreignis.apply(this, arguments);
      try {
        if (e === 'landungSchraeg' && !moto() && this.fahrzeuge[i] && this.fahrzeuge[i].istSpieler && this._t3 && this._t3.fz[i] && this._t3.fz[i].tricksImFlug > 0) {
          const z3 = this._t3.fz[i];
          if (!z3.wackel) autoLandeFehler(this, i, this.fahrzeuge[i], z3);
        }
      } catch (err) { if (typeof console !== 'undefined') console.error('Tricks (Landung):', err); }
      return r;
    };
  }

  R.SpassTricks.kiAlt = kiAlt;
  R.SpassTricks._intern = { schrittSpiel, kiAktiv, kiPlanFlug, ZAEHL, z3Holen, lauschen };
})();
