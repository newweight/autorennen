// Gabelung (14.10., v18): node tests/test_gabelung.js [wiese|wueste|dino]
// Wiese + Wüste + Dino (15.10. v25): die doppelspurige Straße teilt sich in zwei einspurige Äste mit Insel und führt wieder zusammen (trackBuilder.js, Kopfkommentar).
// Prüft: Katalog (Lage, Länge, Sperrzonen aller Listen, alle Welten + XL), Äste (Längenunterschied, Krümmungsradius), Abfrage (Untergrund
// auf Ästen / Rand / Insel, nahtloser Übergang an Y-Spitze und Zusammenführung, Bande), keine Abkürzung über die Insel (Autos quer über
// die Insel bei 20–75 m/s), beide Äste fahrbar (KI mit erzwungenem Ast, Checkpoints + Runden), KI nutzt beide Äste (je Runde Wechsel),
// Reset nie auf der Insel, Hindernis-Extras/Münzen/Deko-Sperre, Minimap-Zeichnung, Determinismus, andere Strecken ohne Gabelung.
const { ladeModule } = require('./lade');
const fs = require('fs'), path = require('path');
const dateien = ['src/config.js', 'src/physics/vehicle.js', 'src/track/spline.js', 'src/track/trackCatalog.js', 'src/track/trackBuilder.js',
  'src/track/looping.js', 'src/track/schanze.js', 'src/race/raceManager.js', 'src/physics/collisions.js', 'src/ai/driver.js', 'src/world/muenzen.js'];
if (fs.existsSync(path.join(__dirname, '..', 'src/track/anlauf.js'))) dateien.splice(7, 0, 'src/track/anlauf.js');
const R = ladeModule(dateien);
const dt = R.config.physik.schritt;
const nurId = process.argv[2];
let fehler = 0;
function pruefe(name, ok, info) { console.log((ok ? 'OK   ' : 'FEHL ') + name + (info ? '  (' + info + ')' : '')); if (!ok) fehler++; }
const IDS = ['wiese', 'wueste', 'dino'].filter((i) => !nurId || nurId === i);
const katalog = (id) => R.trackCatalog.find((t) => t.id === id);
const f1 = (x) => (Math.round(x * 10) / 10);

// ---------------------------------------------------------------- A: Katalog
for (const daten of R.trackCatalog) {
  const soll = ['wiese', 'wueste', 'dino'].includes(daten.id);
  if (!nurId) pruefe(`[${daten.id}] Gabelung im Katalog: ${soll ? 'ja' : 'nein'}`, (daten.gabelungen || []).length === (soll ? 1 : 0));
}
const VARIANTEN = (id) => [''].concat(Object.keys(katalog(id).varianten || {}));
for (const id of IDS) {
  const daten = katalog(id);
  for (const variante of VARIANTEN(id)) for (const welt of Object.keys(daten.welten)) {
    const st = new R.Strecke(daten, { welt, variante: variante || undefined });
    const g = st.gabelungen[0], tag = `[${id}${variante ? '/' + variante : ''}/${welt}]`;
    if (!g) { pruefe(`${tag} Gabelung vorhanden`, false); continue; }
    if (welt !== Object.keys(daten.welten)[0]) { if (variante === '' ) pruefe(`${tag} Gabelung identisch in jeder Welt`, st.gabelungen[0].s0 === new R.Strecke(daten, { welt: Object.keys(daten.welten)[0] }).gabelungen[0].s0); }
    else {
      const faktor = variante ? daten.varianten[variante].faktor : 1;
      pruefe(`${tag} Länge ${f1(g.L)} m (Normal 300–500 m, Variante entsprechend skaliert), nicht an Start/Ziel`,
        g.L >= 300 * faktor - 12 && g.L <= 500 * faktor + 12 && g.s0 > 200 * faktor && g.s1 < st.laenge - 200 * faktor);
      let kMax = 0;
      for (let s = g.s0 - 10; s <= g.s1 + 10; s += 2) kMax = Math.max(kMax, Math.abs(st.spline.punktBei(s).kruemmung));
      pruefe(`${tag} Mittellinie fast gerade (Radius ≥ 150 m)`, kMax < 1 / 150, 'Rmin ' + (kMax ? Math.round(1 / kMax) : '∞') + ' m');
      const info = st.gabelInfo()[0];
      pruefe(`${tag} beide Äste fast gleich lang (Unterschied < 3 m)`, info.unterschied < 3, `links ${f1(info.links)} m, rechts ${f1(info.rechts)} m, Δ ${info.unterschied.toFixed(2)} m`);
      pruefe(`${tag} Ast-Krümmungsradius ≥ 180 m (fahrbar bei hohem Tempo)`, info.rMin >= 180, 'Rmin ' + Math.round(info.rMin) + ' m');
      // Sperrzonen: nichts aus Katalog/Welt in [s0 − 30, s1 + 30] (Spuren inkl. 40 m Übergang)
      const z0 = g.s0 - 30, z1 = g.s1 + 30, belegt = [];
      const im = (a, b, zu) => (b >= z0 - (zu || 0) && a <= z1 + (zu || 0));
      (st.bruecken || []).forEach((e) => { if (im(e.s0, e.s1)) belegt.push('Brücke'); });
      (st.tunnel || []).forEach((e) => { if (im(e.s0, e.s1)) belegt.push('Tunnel'); });
      (st.spuren || []).forEach((e) => { if (im(e.s0, e.s1, 40)) belegt.push('Spur'); });
      (st.hindernisse || []).forEach((e) => { if (im(e.s0 - 12, e.s1 + 5)) belegt.push('Hindernis ' + e.typ + ' ' + Math.round(e.s)); });
      (st.wracks || []).forEach((e) => { if (im(e.s - 20, e.s + 10)) belegt.push('Wrack'); });
      (st.strohballen || []).forEach((e) => { if (im(e.s - 5, e.s + 5)) belegt.push('Strohballen'); });
      (st.schanzen || []).forEach((e) => { if (im(e.s - 20, e.s + 100)) belegt.push('Schanze'); });
      (st.boostFelder || []).forEach((e) => { if (im(e.s - 5, e.s + (e.laenge || 12) + 5)) belegt.push('Boost'); });
      (st.schilde || []).forEach((e) => { if (im(e.s - 5, e.s + 5)) belegt.push('Schild'); });
      ((st.daten && st.daten.baelle) || []).forEach((e) => { if (im(e.s - 15, e.s + 15)) belegt.push('Ball'); });
      ((st.daten && st.daten.wasserstrahlen) || []).forEach((e) => { if (im(e.s - 15, e.s + 15)) belegt.push('Wasser'); });
      (st.dinos || []).forEach((e) => { if (im(e.s - 25, e.s + 25)) belegt.push('Dino'); });
      (st.loopings || []).forEach((e) => { if (im(e.s0 - 90, e.s1 + 30)) belegt.push('Looping'); });
      pruefe(`${tag} keine Strecken-Elemente in der Gabelung ± 30 m`, belegt.length === 0, belegt.join(', '));
    }
  }
}

// ---------------------------------------------------------------- B: Abfrage / Untergrund / Bande
for (const id of IDS) {
  for (const welt of ['klassisch', 'alles']) {
    if (!katalog(id).welten[welt]) continue;
    const st = new R.Strecke(katalog(id), { welt }), g = st.gabelungen[0], sp = st.spline, rb = st.randBreite;
    const tag = `[${id}/${welt}]`;
    const abfr = (s, q) => { const p = sp.punktBei(s); return st.abfrage(p.x + p.nx * q, p.z + p.nz * q); };
    let ok = true, info = '', n = 0;
    // 1) auf der Mitte jedes Astes: Straße, Seitenabstand 0, richtiger Ast; Rand/Gras daneben
    for (let s = g.s0 + 3; s < g.s1 - 3; s += 7.3) {
      const w = st.gabelBei(s);
      for (const ast of [-1, 1]) {
        const a = abfr(s, ast * w.c);
        n++;
        if (a.untergrund !== 'strasse' || Math.abs(a.seitenabstand) > 0.02 || a.ast !== ast || Math.abs(a.abstand) > 0.05) { ok = false; info = `s ${f1(s)} ast ${ast}: ${a.untergrund} q ${a.seitenabstand.toFixed(2)} ast ${a.ast}`; }
        const k = abfr(s, ast * (w.c + w.h + 0.5 * rb));    // Randstein außen
        if (k.untergrund !== 'rand') { ok = false; info = `Rand außen s ${f1(s)}: ${k.untergrund}`; }
        const e = abfr(s, ast * (w.c + w.h + rb + 1.5));    // dahinter: Gras/Sand (hinter der Leitplanke)
        if (e.untergrund !== st.abseitsUntergrund) { ok = false; info = `hinter dem Rand s ${f1(s)}: ${e.untergrund}`; }
        const inRand = abfr(s, ast * (w.c - w.h - 0.4 * rb));  // Randstein zur Insel (nur wo die Insel breit genug ist)
        if (w.c - w.h > rb + 0.2 && inRand.untergrund !== 'rand') { ok = false; info = `Rand innen s ${f1(s)}: ${inRand.untergrund}`; }
      }
      if (w.t > 0.9) {
        const mitte = abfr(s, 0);                           // Inselmitte: Gras/Sand, nicht befahrbar
        if (mitte.untergrund !== st.abseitsUntergrund) { ok = false; info = `Inselmitte s ${f1(s)}: ${mitte.untergrund}`; }
      }
    }
    pruefe(`${tag} Abfrage: Ast-Mitte = Straße (Seitenabstand 0, Ast ±1), Rand außen/innen, Gras dahinter, Inselmitte = ${st.abseitsUntergrund} (${n} Stellen)`, ok, info);
    // 2) nahtlos: die befahrbare Breite ist 1 m vor und 1 m hinter der Y-Spitze / Zusammenführung gleich (volle Straße)
    ok = true; info = '';
    for (const [sv, sn] of [[g.s0 - 1.5, g.s0 + 1.5], [g.s1 + 1.5, g.s1 - 1.5]]) {
      for (let q = -st.breite / 2 - rb - 1 + 0.05; q <= st.breite / 2 + rb + 1; q += 0.25) {   // v25: +0,05 m, damit das Raster nicht genau auf die Straßenkante (Dino: 8,00 m) fällt
        const a = abfr(sv, q).untergrund, b = abfr(sn, q).untergrund;
        const abs = (u) => u === 'gras' || u === 'sand', gleich = abs(a) === abs(b);   // Randstein/Asphalt zwischen den Ästen an der Spitze egal, Gras/Sand muss gleich sein
        if (!gleich) { ok = false; info = `q ${q.toFixed(2)}: ${a} → ${b} (s ${f1(sv)} → ${f1(sn)})`; }
      }
    }
    pruefe(`${tag} nahtloser Übergang an Y-Spitze und Zusammenführung (gleiche Untergründe davor/dahinter über die ganze Breite)`, ok, info);
    // 3) breiteBei / grenzeBei
    const w0 = st.gabelBei(g.s0 + g.L / 2);
    pruefe(`${tag} breiteBei in der Mitte = Astbreite, grenzeBei = Astbreite/2 + Rand + 0,4`,
      Math.abs(st.breiteBei(g.s0 + g.L / 2) - 2 * w0.h) < 1e-9 && Math.abs(st.grenzeBei(g.s0 + g.L / 2) - (w0.h + rb + 0.4)) < 1e-9, `Ast ${f1(2 * w0.h)} m, Bande ${st.grenzeBei(g.s0 + g.L / 2).toFixed(2)} m`);
    pruefe(`${tag} Bande: Trichter davor/danach stetig (Sprünge < 2,5 m je 2 m)`, (() => {
      let m = 0, v = st.grenzeBei(g.s0 - 40);
      for (let s = g.s0 - 40; s < g.s1 + 40; s += 2) { if (s > g.s0 - 3 && s < g.s0 + 3) { v = st.grenzeBei(s); continue; } const x = st.grenzeBei(s); if (s < g.s0 - 1 || s > g.s1 + 4) m = Math.max(m, Math.abs(x - v)); v = x; }
      return m < 2.5;
    })());
    // 4) Bande hält Autos auf dem Ast: Auto in der Inselmitte wird auf SEINEN Ast zurückgeschoben, nie auf die andere Seite
    ok = true; info = '';
    const sM = g.s0 + g.L / 2, wM = st.gabelBei(sM), pM = sp.punktBei(sM);
    for (const q0 of [-3, -1.5, 1.5, 3]) {
      const v = new R.Vehicle({}); v.setzen(pM.x + pM.nx * q0, pM.z + pM.nz * q0, R.headingAus(pM.tx, pM.tz));
      R.Kollisionen.bande(v, st);
      const a = st.abfrage(v.x, v.z), hb = (v.daten.breite || 1.8) / 2;
      if (Math.sign(a.q0) !== Math.sign(q0) || Math.abs(a.q0) < wM.c - wM.h - rb - 0.4 - 0.05 - hb - 0.1) { ok = false; info = `q0 ${q0} → ${a.q0.toFixed(2)}`; }
    }
    pruefe(`${tag} Bande: Auto auf der Insel wird auf den Ast zurückgeschoben (gleiche Seite), Leitplanke an der Inselkante`, ok, info);
  }
}

// ---------------------------------------------------------------- D: keine Abkürzung über die Insel
for (const id of IDS) {
  const st = new R.Strecke(katalog(id), { welt: 'klassisch' }), g = st.gabelungen[0], sp = st.spline;
  let ok = true, info = '', versuche = 0;
  for (const tempo of [20, 50, 75]) for (const winkelGrad of [10, 25, 45, 80]) for (const vonAst of [-1, 1]) {
    const sS = g.s0 + g.P + 25;                               // Plateau: beide Inselkanten voll ausgebildet
    const P = st.astPunkt(sS, vonAst), ziel = -vonAst;        // fährt Richtung anderer Ast
    const v = new R.Vehicle({}); v.setzen(P.x, P.z, R.headingAus(P.tx, P.tz) + (vonAst < 0 ? -1 : 1) * winkelGrad * Math.PI / 180 * -1 * (ziel > 0 ? -1 : 1) * -1);
    // Heading: positiver Winkel = links; zum rechten Ast (ziel +1) nach rechts (= negativ), zum linken nach links (= positiv)
    v.heading = R.headingAus(P.tx, P.tz) + (ziel > 0 ? -1 : 1) * winkelGrad * Math.PI / 180;
    v.vLaengs = tempo;
    let index = -1, maxLinks = vonAst < 0 ? -Infinity : Infinity;
    for (let k = 0; k < 60 * 6; k++) {
      const n = st.abfrage(v.x, v.z, index); index = n.index; v.untergrund = n.untergrund;
      v.schritt(dt, { gas: 1, bremse: 0, lenkung: 0 });
      R.Kollisionen.bande(v, st);
      const a = st.abfrage(v.x, v.z, index);
      if (a.ast) { if (vonAst < 0) maxLinks = Math.max(maxLinks, a.q0); else maxLinks = Math.min(maxLinks, a.q0); }
    }
    versuche++;
    // beim Start auf dem linken Ast (q0 < 0) darf q0 nie > 0 werden (andere Fahrbahnhälfte), rechts umgekehrt
    const gekreuzt = vonAst < 0 ? maxLinks > 0 : maxLinks < 0;
    if (gekreuzt) { ok = false; info = `von Ast ${vonAst}, ${tempo} m/s, ${winkelGrad}°: q0 bis ${maxLinks.toFixed(2)}`; }
  }
  pruefe(`[${id}] keine Abkürzung: ${versuche} Fahrten quer über die Insel (20/50/75 m/s, 10–80°) bleiben auf ihrer Seite`, ok, info);
  // Trotz Bande bleibt der Fortschritt konsistent: Fahrt entlang eines Astes ändert s monoton
}

// ---------------------------------------------------------------- E/F: beide Äste fahrbar, KI nutzt beide Äste
const STUFEN = Object.keys(R.config.schwierigkeiten).sort((a, b) => R.config.schwierigkeiten[a].rang - R.config.schwierigkeiten[b].rang);
/** Eine KI-Fahrt (2 Runden, mit Bande wie main.js) – erzwingt optional den Ast; liefert Kennzahlen. */
function kiFahrt(st, opt) {
  const start = st.startpositionen(1)[0], v = new R.Vehicle({});
  v.setzen(start.x, start.z, start.heading);
  const rennen = new R.RaceManager(st, [{ vehicle: v, name: 'KI', istSpieler: false }], { runden: opt.runden || 2, countdown: 0 });
  const d = new R.Driver(v, st, { schwierigkeit: opt.stufe || 'normal', seed: opt.seed === undefined ? 11 : opt.seed, name: 'KI' });
  if (opt.ast) d.astWunsch = opt.ast;
  d.hindernisseSetzen(st.hindernisse);
  const t = rennen.teilnehmer[0], g = st.gabelungen[0];
  let index = -1, zeit = 0, abseits = 0, bande = 0, reset = false, plateau = {}, minQ = Infinity, maxQ = 0, cps = 0, letzterCp = -1, rest = 0;
  const rundenAst = [];
  for (let k = 0; k < 60 * 700 && !t.imZiel; k++) {
    const s = d.steuerung(dt, { andere: [], spielerFortschrittMax: null, eigenerFortschritt: t.fortschritt, laeuft: true });
    if (d.brauchtReset) { reset = true; break; }
    const n = st.abfrage(v.x, v.z, index); index = n.index; v.untergrund = n.untergrund;
    v.schritt(dt, s);
    if (R.Kollisionen.bande(v, st) > 0) bande++;
    const a = st.abfrage(v.x, v.z, index);
    if (a.untergrund === 'gras' || a.untergrund === 'sand') abseits += dt;
    if (a.ast) {
      const w = st.gabelBei(a.s);
      if (w.t > 0.99) { plateau[a.ast] = (plateau[a.ast] || 0) + dt; rundenAst[t.runde] = a.ast; }
      maxQ = Math.max(maxQ, Math.abs(a.seitenabstand));
    }
    rennen.schritt(dt); zeit += dt;
    if (t.letzterCheckpoint !== letzterCp) { letzterCp = t.letzterCheckpoint; cps++; }
  }
  return { imZiel: t.imZiel, reset, zeit, anteil: abseits / Math.max(zeit, dt), bande, plateau, maxQ, runden: t.runde, rundenzeiten: t.rundenzeiten.slice(), rundenAst, cps,
    x: v.x, z: v.z };
}
for (const id of IDS) {
  const st = new R.Strecke(katalog(id), { welt: 'klassisch' }), g = st.gabelungen[0];
  const nCp = st.checkpoints.filter((c) => c.s >= g.s0 && c.s <= g.s1).length;
  const erg = {};
  for (const ast of [-1, 1]) {
    for (const stufe of ['normal', 'unschlagbar']) {
      const e = kiFahrt(st, { ast, stufe });
      erg[ast + stufe] = e;
      const nurAst = Object.keys(e.plateau).length === 1 && Number(Object.keys(e.plateau)[0]) === ast;
      pruefe(`[${id}] Ast ${ast < 0 ? 'links' : 'rechts'}, KI ${stufe}: 2 Runden im Ziel, kein Reset, abseits < 1 %, Bande ≤ 5 Berührungen, nur dieser Ast auf dem Plateau`,
        e.imZiel && !e.reset && e.anteil < 0.01 && e.bande <= 5 && nurAst && e.runden === 2, `Runden ${e.rundenzeiten.map(f1).join(' / ')} s, Bande ${e.bande}, abseits ${(e.anteil * 100).toFixed(2)} %, maxQ ${e.maxQ.toFixed(2)} m`);
    }
  }
  const links = erg['-1normal'], rechts = erg['1normal'];
  pruefe(`[${id}] Checkpoints im Abschnitt (${nCp}) zählen in beiden Ästen gleich, Rundenzeiten beider Äste ≤ 1,5 s auseinander`,
    links.cps === rechts.cps && nCp >= 2 && Math.abs(links.rundenzeiten[0] - rechts.rundenzeiten[0]) <= 1.5 && Math.abs(links.rundenzeiten[1] - rechts.rundenzeiten[1]) <= 1.5,
    `Checkpoints ${links.cps}/${rechts.cps}, ${f1(links.rundenzeiten[0])} vs ${f1(rechts.rundenzeiten[0])} s`);
  // KI wählt den Ast selbst: 8 Seeds × 4 Runden – beide Äste kommen vor, jedes Auto wechselt je Runde, deterministisch
  const nutzung = { '-1': 0, '1': 0 }; let wechsel = true, alleOk = true, info = '';
  for (let seed = 1; seed <= 8; seed++) {
    const e = kiFahrt(st, { seed, runden: 4, stufe: STUFEN[seed % STUFEN.length] });
    e.rundenAst.forEach((a) => { if (a) nutzung[a]++; });
    for (let r = 1; r < e.rundenAst.length; r++) if (e.rundenAst[r] === e.rundenAst[r - 1]) wechsel = false;
    if (!e.imZiel || e.reset || e.anteil > 0.02) { alleOk = false; info += ` seed ${seed}: ${JSON.stringify({ z: e.imZiel, r: e.reset, a: e.anteil })}`; }
  }
  pruefe(`[${id}] KI nutzt beide Äste (8 Autos × 4 Runden: links ${nutzung['-1']}×, rechts ${nutzung['1']}×), jedes Auto wechselt je Runde, alle sauber im Ziel`,
    nutzung['-1'] >= 8 && nutzung['1'] >= 8 && nutzung['-1'] + nutzung['1'] === 32 && wechsel && alleOk, info);
  // deterministisch: zweite Fahrt desselben Seeds = identisches Ergebnis
  const a1 = kiFahrt(st, { seed: 5, runden: 2 }), a2 = kiFahrt(new R.Strecke(katalog(id), { welt: 'klassisch' }), { seed: 5, runden: 2 });
  pruefe(`[${id}] deterministisch: gleiche Strecke + Seed → identische Endposition und Rundenzeiten`, a1.x === a2.x && a1.z === a2.z && a1.rundenzeiten.join() === a2.rundenzeiten.join());
}

// ---------------------------------------------------------------- E2: Gruppenrennen mit Verkehr (Autos in beiden Ästen, Überholen/Ausweichen)
for (const id of IDS) {
  const st = new R.Strecke(katalog(id), { welt: 'klassisch' });
  const pos = st.startpositionen(6), fz = [], ds = [];
  for (let i = 0; i < 6; i++) {
    const v = new R.Vehicle({}); v.setzen(pos[i].x, pos[i].z, pos[i].heading); fz.push(v);
    const d = new R.Driver(v, st, { schwierigkeit: STUFEN[2 + (i % 3)], seed: 20 + i, name: 'KI' + i }); d.hindernisseSetzen(st.hindernisse); ds.push(d);
  }
  const rennen = new R.RaceManager(st, fz.map((v, i) => ({ vehicle: v, name: 'KI' + i, istSpieler: false })), { runden: 3, countdown: 0 });
  const idx = fz.map(() => -1), abseits = fz.map(() => 0), asts = { '-1': 0, '1': 0 }; let reset = 0, zeit = 0;
  for (let k = 0; k < 60 * 400 && !rennen.teilnehmer.every((t) => t.imZiel); k++) {
    const andere = rennen.teilnehmer;
    for (let i = 0; i < fz.length; i++) {
      const v = fz[i];
      const s = ds[i].steuerung(dt, { andere, spielerFortschrittMax: null, eigenerFortschritt: rennen.teilnehmer[i].fortschritt, laeuft: true });
      if (ds[i].brauchtReset) { reset++; const P = rennen.resetPose(i); v.setzen(P.x, P.z, P.heading); v.vLaengs = 0; ds[i].zurueckgesetzt(); idx[i] = -1; continue; }
      const n = st.abfrage(v.x, v.z, idx[i]); idx[i] = n.index; v.untergrund = n.untergrund; v.schritt(dt, s);
      R.Kollisionen.bande(v, st);
      const a = st.abfrage(v.x, v.z, idx[i]);
      if (a.untergrund === 'gras' || a.untergrund === 'sand') abseits[i] += dt;
      if (a.ast && st.gabelBei(a.s).t > 0.99 && k % 30 === 0) asts[a.ast]++;
    }
    if (R.Kollisionen.autoAuto) { /* nicht nötig: Test ohne Auto-Auto-Stoß */ }
    rennen.schritt(dt); zeit += dt;
  }
  const ziel = rennen.teilnehmer.filter((t) => t.imZiel).length, maxAbs = Math.max.apply(null, abseits) / zeit;
  pruefe(`[${id}] Gruppenrennen 6 KI × 3 Runden: alle im Ziel, höchstens 1 Reset, beide Äste befahren (${asts['-1']}/${asts['1']} Messpunkte), abseits < 3 %`,
    ziel === 6 && reset <= 1 && asts['-1'] > 20 && asts['1'] > 20 && maxAbs < 0.03, `im Ziel ${ziel}, Resets ${reset}, abseits max ${(maxAbs * 100).toFixed(2)} %`);
}

// ---------------------------------------------------------------- G: Reset nie auf der Insel
for (const id of IDS) {
  const st = new R.Strecke(katalog(id), { welt: 'klassisch' }), g = st.gabelungen[0];
  let ok = true, info = '', n = 0;
  const v = new R.Vehicle({});
  const rennen = new R.RaceManager(st, [{ vehicle: v, name: 'S', istSpieler: true }], { runden: 3, countdown: 0 });
  const t = rennen.teilnehmer[0];
  st.checkpoints.forEach((cp) => {
    if (cp.s < g.s0 - 1 || cp.s > g.s1 + 1) return;
    for (const ast of [-1, 1]) {
      // Auto auf dem Ast knapp vor dem Checkpoint, fährt hinüber, danach Reset
      const von = st.astPunkt(cp.s - 3, ast), P = st.astPunkt(cp.s + 3, ast);
      rennen.verfolgungSetzen(t, von.x, von.z, cp.s - 3); t.naechsterCheckpoint = cp.nr; t.gestartet = true; t.letzterCheckpoint = cp.nr - 1;
      v.setzen(von.x, von.z, R.headingAus(von.tx, von.tz));
      rennen.schritt(dt);
      v.setzen(P.x, P.z, R.headingAus(P.tx, P.tz));
      rennen.schritt(dt);
      const pose = rennen.resetPose(0), a = st.abfrage(pose.x, pose.z);
      n++;
      const ok1 = t.letzterCheckpoint === cp.nr && a.untergrund === 'strasse' && a.ast === ast && Math.abs(a.seitenabstand) < 0.05;
      if (!ok1) { ok = false; info = `cp ${cp.nr} Ast ${ast}: cp ${t.letzterCheckpoint}, ${a.untergrund}, ast ${a.ast}, q ${a.seitenabstand.toFixed(2)}`; }
    }
  });
  pruefe(`[${id}] Reset-Punkt (${n} Fälle: Checkpoints der Gabelung × beide Äste) liegt auf dem Ast, auf dem der Checkpoint passiert wurde – nie auf der Insel`, ok && n >= 4, info);
}

// ---------------------------------------------------------------- H: Hindernis-Extras, Münzen, Deko-Sperre, Minimap
for (const id of IDS) {
  const daten = katalog(id);
  let ok = true, info = '';
  for (const welt of ['hindernisse', 'alles']) {
    if (!daten.welten[welt]) continue;
    for (const menge of ['viele', 'sehrViele']) {
      const st = new R.Strecke(daten, { welt, hindernisMenge: menge }), g = st.gabelungen[0];
      for (const h of st.hindernisse) if (h.s1 >= g.s0 - 20 && h.s0 <= g.s1 + 20) { ok = false; info = `${welt}/${menge}: ${h.typ} s ${f1(h.s)}`; }
      for (const w of st.wracks.concat(st.strohballen)) if (w.s >= g.s0 - 20 && w.s <= g.s1 + 20) { ok = false; info = `${welt}/${menge}: Wrack/Stroh s ${f1(w.s)}`; }
    }
  }
  pruefe(`[${id}] Hindernis-Menge viele/sehrViele: keine Extras in der Gabelung ± 20 m`, ok, info);
  const st = new R.Strecke(daten, { welt: 'klassisch' }), g = st.gabelungen[0];
  const m = new R.Muenzen(st);
  pruefe(`[${id}] Münzen: keine in der Gabelung (${m.liste.length} Münzen)`, m.liste.length >= 20 && m.liste.every((c) => c.s < g.s0 - 14 || c.s > g.s1 + 14));
  const sp = st.spline, p = sp.punktBei(g.s0 + g.L / 2), w = st.gabelBei(g.s0 + g.L / 2);
  const nn = (q) => sp.naechster(p.x + p.nx * q, p.z + p.nz * q);
  pruefe(`[${id}] Deko-Sperre: Äste samt Rand + Insel gesperrt, 25 m neben der Mitte frei`,
    st.dekoSperre(p.x + p.nx * w.c, p.z + p.nz * w.c, nn(w.c)) && st.dekoSperre(p.x, p.z, nn(0)) && st.dekoSperre(p.x - p.nx * (w.c + w.h + 2), p.z - p.nz * (w.c + w.h + 2), nn(-(w.c + w.h + 2))) &&
    !st.dekoSperre(p.x + p.nx * 25, p.z + p.nz * 25, nn(25)));
  // Minimap: Zeichenaufrufe ohne Fehler (Fake-Canvas)
  const calls = []; const g2 = new Proxy({}, { get: (o, k) => (k in o ? o[k] : (...a) => { calls.push(k); }), set: (o, k, v) => { o[k] = v; return true; } });
  let mmOk = true; try { st.gabelMinimap(g2, (x, z) => [x * 0.1, z * 0.1], 0.1, 1, 4); } catch (e) { mmOk = false; console.log(e); }
  pruefe(`[${id}] Minimap: gabelMinimap zeichnet zwei Äste (ohne Fehler, ${calls.filter((c) => c === 'stroke').length} Striche)`, mmOk && calls.filter((c) => c === 'stroke').length === 5);
}

// ---------------------------------------------------------------- I: andere Strecken ohne Gabelung, Welten unverändert
for (const daten of R.trackCatalog) {
  if (nurId || ['wiese', 'wueste', 'dino'].includes(daten.id)) continue;
  const st = new R.Strecke(daten, { welt: Object.keys(daten.welten)[0] });
  pruefe(`[${daten.id}] keine Gabelung, breiteBei/grenzeBei/abfrage ohne Ast-Felder`, st.gabelungen.length === 0 && st.abfrage(st.spline.punkte[3].x, st.spline.punkte[3].z).ast === undefined && st.gabelC(10) === 0);
}
console.log(fehler ? '\n' + fehler + ' FEHLER' : '\nALLE GABELUNGS-PRÜFUNGEN OK');
process.exit(fehler ? 1 : 0);
