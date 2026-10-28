// ============================================================
// Z1 (Zufall): Hindernisse und Münzen liegen in JEDEM Spiel anders und werden in JEDER Runde neu verteilt.
//
//   new R.Strecke(daten, { …, zufall: { seed } })   → R.Zufall.start(strecke, …): Lage für Runde 1 aus dem Rennseed (ohne `zufall` läuft nichts davon:
//                                                    „aus“ = bitgleich das alte Verhalten, Katalog-Lage)
//   R.Zufall.ereignis(strecke, { runde, n, v })     → eine Neuverteilung (rein, deterministisch): Seed je Runde = hash(rennSeed, runde), Wiederholung n
//   R.Zufall.kandidaten(strecke, v)                 → wie viele wartende Objekte sind inzwischen frei (Wiederholung lohnt sich)?
//
// Was wandert (jeweils mit den Sperrregeln der „Hindernis-Menge“, trackBuilder.js zusatzErzeugen: Start/Ziel, Tunnel/Brücke/Überführung/Kreuzung/Gabelung,
// Looping samt Anlauf, Schanze samt Anlauf + Flug/Landung, enge Spuren, Boost/Schild/Bälle/Fontänen, Kleber, Mindestabstände, enge Kurven/Haarnadeln;
// die MENGE je Strecke bleibt gleich):
//   Katalog-Hindernisse (Öl, Sand, Baustelle, Ast, Lava), Wracks, Strohballen-Stellen, Dino-Stellen, Wildtier-Stellen (Rehe/Bären) und die Münzen
//   (Reihen aus 5 und Einzelmünzen, world/muenzen.js). Fest bleiben: Meteoriten, Vulkan, Flugsaurier, Bälle, Fontänen, Boost, Schilde, Schanzen, Feuerring,
//   Bus-Reihen, Werkstatt/Krankenstation, Stunt-Park (eigene Strecke).
//
// Wann: Beginnt das FÜHRENDE Fahrzeug eine neue Runde, wird neu verteilt – aber nur, was gerade KEIN Fahrzeug in der Nähe hat
// (von rueck m hinter bis vor m vor jedem Fahrzeug): die anderen behalten ihre Lage (`ausstehend`) und wandern bei der nächsten Gelegenheit
// (Wiederholung n = 1, 2, … im Sekundentakt, sobald ein wartendes Objekt frei ist). Neue Lagen liegen NIE in einem solchen Fenster:
// kein Aufpoppen vor der Nase, nichts in Autos hinein, Münzen werden nie unter einem Auto verschoben.
//
// Determinismus: Ein Ereignis ist nur { runde, n, v } (v = Bogenlänge aller Fahrzeuge in ganzen Metern). Server und Browser rechnen daraus
// bitgleich dieselbe Lage (nur Ganzzahl-Zufall: hash32 + mulberry32; kein Math.random, keine Zeit). Online entscheidet der Server, wann ein Ereignis
// stattfindet (Spiel.physikSchritt → _zufallSchritt) und schickt { runde, n, v } als `ereignis` art 'zufall'; der Browser wendet es mit derselben Funktion an.
// Rechenteil ohne Three.js (Node-Tests: tests/test_zufall.js); die Grafik (Hindernis-Gruppe neu bauen) macht main.js.
// ============================================================
(function () {
  const R = window.Rennspiel;

  function cfg() { return R.config.zufall || {}; }
  function wert(x, std) { return x === undefined ? std : x; }

  // ------------------------------------------------------------------ Zufall (nur Ganzzahlen → überall bitgleich)
  /** Ganzzahlen → 32-Bit-Hash (FNV-1a über die 4 Bytes jeder Zahl + murmur-Endmischung). */
  function hash32() {
    let h = 0x811c9dc5;
    for (let i = 0; i < arguments.length; i++) {
      let x = arguments[i] | 0;
      for (let b = 0; b < 4; b++) { h ^= x & 0xff; h = Math.imul(h, 0x01000193); x >>>= 8; }
    }
    h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16;
    return h >>> 0;
  }
  /** mulberry32 (wie trackBuilder.zufallsFolge). */
  function folge(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  /** Seed der Runde (1-basiert): hash(rennSeed, runde). */
  function seedRunde(rennSeed, runde) { return hash32(rennSeed >>> 0, runde | 0); }
  const rund = (x) => Math.round(x * 100) / 100;

  // Ausdehnung je Art entlang s: [vor, nach] um s (m) und Klasse für den Mindestabstand (wie zusatzErzeugen)
  function ausdehnung(art, e, ZR, CH) {
    switch (art) {
      case 'oel': { const hl = (e.laenge || (CH.oel && CH.oel.laenge) || 8) / 2; return [hl, hl, 'fleck']; }
      case 'sand': { const hl = (e.laenge || (CH.sand && CH.sand.laenge) || 8) / 2; return [hl, hl, 'fleck']; }
      case 'baustelle': return [((CH.baustelle && CH.baustelle.vorlauf) || 9) + 12, (e.laenge || (CH.baustelle && CH.baustelle.laenge) || 30) + 1, 'sperr'];   // + Schild davor
      case 'ast': return [2, 2, 'sperr'];
      case 'lava': { const hl = (e.laenge || 12) / 2; return [hl + ZR.lava, hl + ZR.lava, 'sperr']; }
      case 'wrack': return [((CH[e.brennt ? 'brand' : 'wrack'] || CH.wrack || {}).dreieckAbstand || 9) + 3, 4, 'sperr'];
      case 'stroh': return [2, 2, 'stroh'];
      case 'dino': return [ZR.dino, ZR.dino, 'stroh'];
      default: return [2, 2, 'stroh'];   // tier
    }
  }
  // größte erlaubte Krümmung (1/Radius) dort – wie config.hindernisMenge.kurveMax
  function kurveMaxArt(art, KM) {
    if (art === 'lava') return KM.baustelle || 1 / 150;
    if (art === 'dino' || art === 'tier') return KM.stroh || 1 / 60;
    return KM[art] || 1 / 60;
  }

  // ------------------------------------------------------------------ Start (im Konstruktor der Strecke)
  /**
   * Lage für Runde 1 aus dem Rennseed. Wird von new R.Strecke(daten, { zufall: { seed } }) am Ende der Listenberechnung aufgerufen
   * (Hindernisse, Wracks, Strohballen, Dinos stehen schon in strecke.*; der Katalog bleibt unangetastet: es wird nur mit Kopien gearbeitet).
   */
  function start(strecke, opt, sicht) {
    const sp = strecke.spline, L = sp.laenge;
    const HM = R.config.hindernisMenge || {}, CH = R.config.hindernisse || {};
    const ZR = Object.assign({ tunnel: 30, bruecke: 30, ueberf: 30, kreuzung: 30, loopingVor: 90, loopingNach: 30, spuren: 45, schanzeVor: 70,
      schanzeNach: 80, boost: 12, schild: 12, ball: 16, wasser: 12, dino: 25, kleber: 15, lava: 55 }, HM.zonen || {});
    const zs = {
      seed: (opt && opt.seed >>> 0) || 0, runde: 1, n: 0, extern: [], muenzen: null,
      objekte: [], fest: [], ZR, CH, HM, log: [], version: 0,
    };
    strecke.zufall = zs;
    const katalog = strecke.katalog || {};
    // --- Objekte aufnehmen (feste Reihenfolge = feste Nummern) ---
    // Hindernisse: Kopien der Katalog-Einträge (der Katalog ist über alle Strecken geteilt und bleibt unverändert)
    sicht.hindernisse = (sicht.hindernisse || []).map((e) => Object.assign({}, e));
    sicht.hindernisse.forEach((e, i) => {
      if (!['oel', 'sand', 'baustelle', 'ast', 'lava'].includes(e.typ)) return;     // Krater (dynamisch) u. a. bleiben
      zs.objekte.push({ id: zs.objekte.length, art: e.typ, liste: 'hindernisse', i, e, s: e.s, ext: ausdehnung(e.typ, e, ZR, CH), ausstehend: false });
    });
    // Wracks, Strohballen, Dinos: strecke.* sind schon Kopien (kopie() im Konstruktor) – strecke.daten (Datensicht) zeigt ab jetzt auf dieselben Einträge
    if (strecke.aktiveSchichten && strecke.aktiveSchichten.wracks !== false) sicht.wracks = strecke.wracks;
    if (strecke.aktiveSchichten && strecke.aktiveSchichten.strohballen !== false) sicht.strohballen = strecke.strohballen;
    if (strecke.aktiveSchichten && strecke.aktiveSchichten.dinos !== false) sicht.dinos = strecke.dinos;
    (strecke.wracks || []).forEach((e, i) => {
      zs.objekte.push({ id: zs.objekte.length, art: 'wrack', liste: 'wracks', i, e, s: e.s, ext: ausdehnung('wrack', e, ZR, CH), ausstehend: false });
    });
    (strecke.strohballen || []).forEach((e, i) => {
      zs.objekte.push({ id: zs.objekte.length, art: 'stroh', liste: 'strohballen', i, e, s: e.s, ext: ausdehnung('stroh', e, ZR, CH), ausstehend: false });
    });
    (strecke.dinos || []).forEach((e, i) => {
      zs.objekte.push({ id: zs.objekte.length, art: 'dino', liste: 'dinos', i, e, s: e.s, ext: ausdehnung('dino', e, ZR, CH), ausstehend: false });
    });
    // Wildtiere (Rehe/Bären, Katalog tiere, nur Welten mit Schicht „dinos“): Stellen leben in dynamik.js, die Lage wird dort per dynamikSetzen übernommen
    zs.tiere = (strecke.aktiveSchichten && strecke.aktiveSchichten.dinos === false ? [] : (katalog.tiere || [])).map((e) => Object.assign({}, e));
    zs.tiere.forEach((e, i) => {
      zs.objekte.push({ id: zs.objekte.length, art: 'tier', liste: 'tiere', i, e, s: e.s, ext: ausdehnung('tier', e, ZR, CH), ausstehend: false });
    });
    // --- feste Sperrzonen (nicht beweglich) ---
    zs.fest = festeZonen(strecke, sicht, zs);
    // --- Krümmungsprofil (|1/Radius| alle 4 m) für die Kurven-Regeln ---
    const N = Math.max(8, Math.ceil(L / 4));
    zs.kr = new Float32Array(N);
    for (let k = 0; k < N; k++) zs.kr[k] = Math.abs(sp.punktBei(k * L / N).kruemmung || 0);
    zs.krDs = L / N;
    // --- Runde 1: alles frei (kein Fahrzeug) ---
    verteilen(strecke, zs, { runde: 1, n: 0, v: [] }, true);
    return zs;
  }

  /** Sperrzonen, die sich nie bewegen: Liste { c (Mitte), h (halbe Länge), klasse null | …, kleberSeite? } (wie zusatzErzeugen). */
  function festeZonen(st, sicht, zs) {
    const sp = st.spline, L = sp.laenge, ZR = zs.ZR, HM = zs.HM;
    const belegt = [];
    const zone = (s0, s1, vor, nach, klasse, extra) => {
      const len = sp.wrapS(s1 - s0);
      belegt.push(Object.assign({ c: s0 + (len + nach - vor) / 2, h: (len + vor + nach) / 2, klasse: klasse || null }, extra));
    };
    const punkt = (s, vor, nach, klasse) => belegt.push({ c: s + (nach - vor) / 2, h: (vor + nach) / 2, klasse: klasse || null });
    punkt(0, 0, HM.startFrei);                       // Start: Anfahren
    punkt(0, HM.zielFrei, 0);                        // vor der Ziellinie
    (st.tunnel || []).forEach((t) => zone(t.s0, t.s1, ZR.tunnel, ZR.tunnel));
    (st.bruecken || []).forEach((b) => zone(b.s0, b.s1, ZR.bruecke, ZR.bruecke));
    (st.ueberfuehrungen || []).forEach((u) => { zone(u.s0, u.s1, ZR.ueberf, ZR.ueberf); if (u.unten) zone(u.unten.s0, u.unten.s1, ZR.ueberf, ZR.ueberf); });
    (st.kreuzungen || []).forEach((k) => { zone(k.a.s0, k.a.s1, ZR.kreuzung, ZR.kreuzung); zone(k.b.s0, k.b.s1, ZR.kreuzung, ZR.kreuzung); });
    (st.loopings || []).forEach((l) => zone(l.s0, l.s1, ZR.loopingVor, ZR.loopingNach));
    (st.gabelungen || []).forEach((g) => zone(g.s0, g.s1, 30, 30));
    (st.spuren || []).forEach((e) => { if (e.breite < st.breite) zone(e.s0, e.s1, ZR.spuren, ZR.spuren); });
    (st.schanzen || []).forEach((e) => zone(e.s, e.s + (e.laenge || 10), (e.anlauf || 0) + ZR.schanzeVor, ZR.schanzeNach));
    (st.boostFelder || []).forEach((e) => zone(e.s, e.s + (e.laenge || 12), ZR.boost, ZR.boost));
    (st.schilde || []).forEach((e) => punkt(e.s, ZR.schild, ZR.schild));
    (sicht.baelle || []).forEach((e) => punkt(e.s, ZR.ball, ZR.ball));
    (sicht.wasserstrahlen || []).forEach((e) => punkt(e.s, ZR.wasser, ZR.wasser));
    (sicht.kleber || []).forEach((e) => zone(e.s0, e.s1, ZR.kleber, ZR.kleber, null, { kleberSeite: e.seite === 1 ? 1 : e.seite === -1 ? -1 : 0 }));
    // Meteoriten (Katalog meteoriten [{ s }]: feste Einschlagstellen samt Vorlauf) und Motorrad-Zonen (Wheelie/Stoppie) bleiben frei
    ((katalogVon(st)).meteoriten || []).forEach((e) => punkt(e.s, 60, 40));
    ((katalogVon(st)).motoZonen || []).forEach((e) => zone(e.s0, e.s1, 15, 15));
    // Formel 1: Boxengasse
    const bx = katalogVon(st).boxen;
    if (bx && typeof bx.s0 === 'number' && typeof bx.s1 === 'number') zone(Math.min(bx.s0, bx.s1), Math.max(bx.s0, bx.s1), 25, 25);
    void L;
    return belegt;
  }
  function katalogVon(st) { return st.katalog || st.daten || {}; }

  // ------------------------------------------------------------------ Neuverteilung (rein)
  /**
   * Eine Neuverteilung. ev = { runde (1-basiert), n (0 = Rundenwechsel, 1, 2 … = Nachzügler), v (Bogenlängen aller Fahrzeuge, ganze m) }.
   * Bewegt (n = 0) alle Objekte ohne Fahrzeug in der Nähe, (n ≥ 1) die wartenden, die inzwischen frei sind. Schreibt die neue Lage in die
   * Strecke (hindernisse, wracks, strohballen, dinos; _flecken, _dachZonen), in zs.tiere und – falls vorhanden – in zs.muenzen.
   * @returns {{ runde, n, bewegt: number[], wartend: number, muenzen: number }}
   */
  function verteilen(strecke, zs, ev, vollstaendig) {
    const sp = strecke.spline, L = sp.laenge, C = cfg();
    const RUECK = wert(C.rueck, 60), VOR = wert(C.vor, 300);
    const runde = ev.runde | 0, n = ev.n | 0, v = ev.v || [];
    const diff = (a, b) => sp.differenzS(a, b);
    const rng = folge(hash32(zs.seed, runde, n, 11));
    const fenster = v.map((s) => ({ c: s + (VOR - RUECK) / 2, h: (VOR + RUECK) / 2 }));
    const imFenster = (c, h) => { for (let k = 0; k < fenster.length; k++) if (Math.abs(diff(c, fenster[k].c)) < h + fenster[k].h) return true; return false; };
    const objFenster = (o) => imFenster(o.s + (o.ext[1] - o.ext[0]) / 2, (o.ext[0] + o.ext[1]) / 2);
    if (n === 0) zs.runde = runde;
    zs.n = n;
    const HM = zs.HM;
    // wer darf in diesem Ereignis wandern?
    const bewegen = [], bleiben = [];
    for (const o of zs.objekte) {
      const kandidat = n === 0 ? true : o.ausstehend;
      if (kandidat && !objFenster(o)) { bewegen.push(o); o.ausstehend = false; }
      else { bleiben.push(o); if (kandidat) o.ausstehend = true; }
    }
    // Münzen: wer wandert (Plan), die Bleibenden sperren Platz für die Hindernisse
    const mzZonen = zs.muenzen && zs.muenzen.zufallPlan ? zs.muenzen.zufallPlan({ n, imFenster }) : [];
    // Belegung: feste Zonen + extern gemeldete (Werkstatt …) + Fenster der Fahrzeuge + unbewegte Objekte + bleibende Münzen
    const belegt = zs.fest.slice();
    mzZonen.forEach((z) => belegt.push({ c: z.c, h: z.h, klasse: null }));
    zs.extern.forEach((z) => { const len = sp.wrapS(z.s1 - z.s0); belegt.push({ c: z.s0 + len / 2, h: len / 2 + wert(z.zugabe, 12), klasse: null }); });
    fenster.forEach((f) => belegt.push({ c: f.c, h: f.h, klasse: null }));
    const gapVon = (a, b) => (a === 'sperr' && b === 'sperr' ? HM.abstandSperr : (a === 'stroh' || b === 'stroh') ? HM.abstandStroh : HM.abstandFleck);
    const punkt = (o, s) => belegt.push({ c: s + (o.ext[1] - o.ext[0]) / 2, h: (o.ext[0] + o.ext[1]) / 2, klasse: o.ext[2] });
    bleiben.forEach((o) => punkt(o, o.s));
    // Krümmung entlang [a, b]
    const kMax = (a, b) => {
      const ds = zs.krDs, N = zs.kr.length;
      let i0 = Math.floor(a / ds), i1 = Math.ceil(b / ds), k = 0;
      if (i1 - i0 > N) { i0 = 0; i1 = N; }
      for (let i = i0; i <= i1; i++) { const x = zs.kr[((i % N) + N) % N]; if (x > k) k = x; }
      return k;
    };
    const kHaar = 1 / HM.haarnadelRadius;
    // passt(): false oder { seite } (≠ 0: Öl/Sand muss auf diese Fahrbahnhälfte, neben einem Klebestreifen am anderen Rand)
    const passt = (o, s) => {
      const [vor, nach, klasse] = o.ext;
      let seite = 0;
      for (let k = 0; k < belegt.length; k++) {
        const b = belegt[k];
        if (b.kleberSeite !== undefined) {
          if (Math.abs(diff(s + (nach - vor) / 2, b.c)) < (vor + nach) / 2 + b.h) {
            if (b.kleberSeite === 0 || (o.art !== 'oel' && o.art !== 'sand') || (seite !== 0 && seite !== -b.kleberSeite)) return false;
            seite = -b.kleberSeite;
          }
          continue;
        }
        const gap = b.klasse ? gapVon(klasse, b.klasse) : 0;
        if (Math.abs(diff(s + (nach - vor) / 2, b.c)) < (vor + nach) / 2 + b.h + gap) return false;
      }
      if (kMax(s - vor, s + nach) > kurveMaxArt(o.art, HM.kurveMax || {})) return false;
      if (kMax(s + nach, s + nach + HM.haarnadelVor) > kHaar) return false;
      return { seite };
    };
    // Platzieren: je Durchgang eine neue gemischte Reihenfolge (Fisher-Yates mit dem Ereignis-Zufall) und ein Abschnitt je Objekt (gleichmäßig über die
    // Runde); findet ein Objekt keine Stelle (dichte Strecke), kommt ein neuer Durchgang – bis alle liegen oder der beste Durchgang übrig bleibt.
    // Ein Objekt ohne Platz behält seine alte (gültige) Lage – die Menge ändert sich nie.
    const von = HM.startFrei, bis = L - HM.zielFrei, laenge = bis - von, m = Math.max(1, bewegen.length);
    const basisLen = belegt.length;
    const maxV = wert(HM.maxVersuche, 40), maxG = wert(HM.maxVersucheGlobal, maxV), maxDurchgang = wert(C.durchgaenge, 12);
    let beste = null;
    for (let dg = 0; dg < maxDurchgang; dg++) {
      belegt.length = basisLen;
      for (let i = bewegen.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); const t = bewegen[i]; bewegen[i] = bewegen[j]; bewegen[j] = t; }
      const plan = [];
      let fehl = 0;
      bewegen.forEach((o, i) => {
        const a = von + laenge * i / m, b = von + laenge * (i + 1) / m;
        let s = null, zwang = 0;
        for (let t = 0; t < maxV + maxG && s === null; t++) {
          const kand = Math.round((t < maxV ? a + rng() * (b - a) : von + rng() * laenge) * 2) / 2;   // auf 0,5 m
          const p = passt(o, kand);
          if (p) { s = kand; zwang = p.seite; }
        }
        if (s === null) { punkt(o, o.s); fehl++; return; }       // alte Lage bleibt (und sperrt Platz für die übrigen)
        punkt(o, s);
        const vz = rng() < 0.5 ? -1 : 1;
        const seite = (o.art === 'oel' || o.art === 'sand') ? (zwang ? rund(zwang * (0.15 + rng() * 0.5)) : rund((rng() * 2 - 1) * 0.65)) : vz;
        plan.push({ o, s, seite });
      });
      if (!beste || fehl < beste.fehl) beste = { plan, fehl };
      if (fehl === 0) break;
    }
    const bewegt = [];
    beste.plan.forEach((p) => { p.o.s = p.s; p.o.seite = p.seite; bewegt.push(p.o.id); });
    zs.fehl = beste.fehl;
    // in die Strecke schreiben
    uebernehmen(strecke, zs, bewegt, !!vollstaendig);
    // Münzen (nur Einzelspiel): gleiche Fenster, eigener Zufallsstrom
    let mz = 0;
    if (zs.muenzen && zs.muenzen.zufallVerteilen) {
      mz = zs.muenzen.zufallVerteilen({ strecke, rng: folge(hash32(zs.seed, runde, n, 22)), n, imFenster });
    }
    zs.version++;
    const offen = zs.objekte.reduce((x, o) => x + (o.ausstehend ? 1 : 0), 0);
    const erg = { runde, n, bewegt, wartend: offen, muenzen: mz };
    zs.log.push(erg);
    if (zs.log.length > 50) zs.log.shift();
    return erg;
  }

  /** Neue Lage der bewegten Objekte in die Strecke eintragen (Einträge, abgeleitete Strukturen, Caches). */
  function uebernehmen(strecke, zs, ids, vollstaendig) {
    const sp = strecke.spline, sicht = strecke.daten;
    const alleHind = vollstaendig;
    for (const id of ids) {
      const o = zs.objekte[id], e = o.e;
      e.s = o.s;
      if (o.liste === 'hindernisse') {
        e.seite = o.seite;
      } else if (o.liste === 'wracks') {
        const mag = Math.abs(e.seitenabstand) || Math.min(4, strecke.breite / 2 - 2.2);
        e.seitenabstand = rund(o.seite * mag);
        const k = strecke.wracks[o.i];
        if (k && k !== e) { k.s = sp.wrapS(o.s); k.seitenabstand = e.seitenabstand; }
      } else if (o.liste === 'strohballen' || o.liste === 'dinos') {
        e.von = o.seite;
        const k = strecke[o.liste][o.i];
        if (k && k !== e) { k.s = sp.wrapS(o.s); k.von = o.seite; }
      } else if (o.liste === 'tiere') {
        e.von = o.seite;
      }
    }
    // Hindernisse neu berechnen (Pylonen, Segmente, Flecken …): nur die bewegten (nr bleibt = Index), beim Start alle
    if (alleHind) {
      strecke.hindernisse = strecke._hindernisseBerechnen(sicht.hindernisse);
      strecke._flecken = strecke.hindernisse.filter((h) => h.untergrund);
      // beim Start ist `wracks` schon aus den Katalog-Einträgen kopiert (Lage jetzt aus zs): nichts weiter
    } else {
      let flecken = false;
      for (const id of ids) {
        const o = zs.objekte[id];
        if (o.liste === 'hindernisse') {
          const h = strecke._hindernisseBerechnen([o.e])[0];
          h.nr = o.i;
          strecke.hindernisse[o.i] = h;
          if (h.untergrund || o.art === 'oel' || o.art === 'sand') flecken = true;
        } else if (o.liste === 'wracks' && strecke._wracksEingebaut && R.Kollisionen && R.Kollisionen.wrackBauen) {
          const idx = strecke.hindernisse.findIndex((h) => h && h.quelle === o.i && (h.typ === 'wrack' || h.typ === 'brand'));
          if (idx >= 0) strecke.hindernisse[idx] = Object.assign(R.Kollisionen.wrackBauen(strecke, strecke.wracks[o.i], idx), { quelle: o.i });
        }
      }
      if (flecken) strecke._flecken = strecke.hindernisse.filter((h) => h.untergrund);
    }
    strecke._dachZonen = null;          // cars/dachregel.js: Halte-Zonen aus den Hindernissen neu berechnen
    strecke.zufallVersion = (strecke.zufallVersion || 0) + 1;
  }

  /** Wie viele wartende Objekte (und Münzgruppen) sind mit den Fahrzeugen bei v jetzt frei? (0 = keine Wiederholung nötig/möglich) */
  function kandidaten(strecke, v) {
    const zs = strecke.zufall;
    if (!zs) return 0;
    const sp = strecke.spline, C = cfg();
    const RUECK = wert(C.rueck, 60), VOR = wert(C.vor, 300);
    const fenster = (v || []).map((s) => ({ c: s + (VOR - RUECK) / 2, h: (VOR + RUECK) / 2 }));
    const imFenster = (c, h) => { for (let k = 0; k < fenster.length; k++) if (Math.abs(sp.differenzS(c, fenster[k].c)) < h + fenster[k].h) return true; return false; };
    let k = 0;
    for (const o of zs.objekte) if (o.ausstehend && !imFenster(o.s + (o.ext[1] - o.ext[0]) / 2, (o.ext[0] + o.ext[1]) / 2)) k++;
    if (zs.muenzen && zs.muenzen.zufallKandidaten) k += zs.muenzen.zufallKandidaten(imFenster);
    return k;
  }

  /** Gibt es noch wartende Objekte/Münzgruppen (egal ob frei)? */
  function wartend(strecke) {
    const zs = strecke.zufall;
    if (!zs) return 0;
    let k = 0;
    for (const o of zs.objekte) if (o.ausstehend) k++;
    if (zs.muenzen && zs.muenzen.zufallWartend) k += zs.muenzen.zufallWartend();
    return k;
  }

  /** Ereignis anwenden (Server und Browser): rein aus { runde, n, v }. */
  function ereignis(strecke, ev) {
    const zs = strecke.zufall;
    if (!zs) return null;
    return verteilen(strecke, zs, { runde: ev.runde, n: ev.n, v: (ev.v || []).map((x) => x | 0) });
  }

  /**
   * Taktgeber (Offline-Spiel und Server, jeden Physik-Schritt): liefert das nächste Ereignis { runde, n, v } oder null.
   * fort = Gesamtfortschritt (m, Runde × Länge + Bogenlänge) aller Fahrzeuge auf der Strecke (auch Polizei/Verkehr: kein Aufpoppen vor irgendeinem).
   * n = 0: das führende Fahrzeug hat eine neue Runde begonnen; n ≥ 1: Nachzügler (wartende Objekte, die inzwischen frei sind), höchstens alle nachholSekunden.
   */
  function takt(strecke, fort, dt, maxRunde) {
    const zs = strecke.zufall;
    if (!zs || !fort || !fort.length) return null;
    const L = strecke.spline.laenge, v = [];
    let max = -Infinity;
    for (const f of fort) { if (f > max) max = f; v.push(Math.round(((f % L) + L) % L)); }
    let fr = Math.floor(max / L) + 1;
    if (maxRunde > 0 && fr > maxRunde) fr = maxRunde;      // Führender im Ziel (Fortschritt = Runden × Länge): keine Neuverteilung mehr
    if (fr > zs.runde) { zs.nachUhr = 0; return { runde: fr, n: 0, v }; }
    zs.nachUhr = (zs.nachUhr || 0) + dt;
    if (zs.nachUhr >= wert(cfg().nachholSekunden, 1)) {
      zs.nachUhr = 0;
      if (wartend(strecke) > 0 && kandidaten(strecke, v) > 0) return { runde: zs.runde, n: zs.n + 1, v };
    }
    return null;
  }

  /**
   * Lage der Wildtier-/Strohballen-/Dino-Stellen in die Dynamik übernehmen (nach jeder Neuverteilung und einmal nach dem Bau der Dynamik).
   * Rollende/laufende Objekte tragen ihr eigenes s und laufen weiter; nur neue starten an der neuen Stelle.
   */
  function dynamikSetzen(strecke, dynamik) {
    const zs = strecke.zufall;
    if (!zs || !dynamik) return;
    const sp = strecke.spline, bhBei = (s) => (strecke.breiteBei ? strecke.breiteBei(s) : strecke.breite) / 2;
    const CS = R.config.strohballen || {}, CD = R.config.dinos || {}, CT = R.config.tiere || {};
    for (const o of zs.objekte) {
      const s = sp.wrapS(o.s), bh = bhBei(s), von = o.seite !== undefined ? o.seite : (o.e.von < 0 ? -1 : 1);
      if (o.liste === 'strohballen') {
        const st = dynamik.strohStellen && dynamik.strohStellen[o.i];
        if (!st || st.meteor) continue;
        const radius = wert(CS.radius, 0.75);
        st.s = s; st.von = von; st.qStart = von * (bh + wert(CS.ueberstand, 8)); st.randQ = bh + (strecke.randBreite || 1) * 0.5 + radius;
      } else if (o.liste === 'dinos') {
        const st = dynamik.dinoStellen && dynamik.dinoStellen[o.i];
        if (!st) continue;
        st.s = s; st.von = von; st.bh = bh; st.qStart = von * (bh + wert(CD.ueberstand, 12));
      } else if (o.liste === 'tiere') {
        const st = dynamik.tierStellen && dynamik.tierStellen[o.i];
        if (!st) continue;
        st.s = s; st.von = von; st.bh = bh; st.qStart = von * (bh + wert(CT.ueberstand, 9));
      }
    }
  }

  /** Externe Sperrzonen (Werkstatt, Krankenstation …) für künftige Neuverteilungen: [{ s0, s1, zugabe? }] (ersetzt die bisherigen). */
  function externSetzen(strecke, liste) {
    if (strecke.zufall) strecke.zufall.extern = (liste || []).filter((z) => z && typeof z.s0 === 'number' && typeof z.s1 === 'number');
  }

  R.Zufall = { hash32, folge, seedRunde, start, ereignis, takt, kandidaten, wartend, dynamikSetzen, externSetzen, verteilen };
})();
