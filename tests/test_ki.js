// Node-Test KI-Fahrer (Abschnitt 5): node tests/test_ki.js
// Reine Mathematik, Schrittweite 1/60, ohne Kollisionsphysik.
// Runde 5: ohne TEMPO_KLASSE läuft der Test für beide Tempo-Klassen (normal, schnell) als eigene Prozesse.
if (!process.env.TEMPO_KLASSE) {
  const { spawnSync } = require('child_process');
  let rc = 0;
  for (const k of ['normal', 'schnell']) {
    console.log('\n##### Tempo-Klasse ' + k + ' #####');
    const r = spawnSync(process.execPath, [__filename].concat(process.argv.slice(2)),
      { stdio: 'inherit', env: Object.assign({}, process.env, { TEMPO_KLASSE: k }) });
    rc = rc || r.status;
  }
  console.log(rc ? '\nFEHLER in mindestens einer Tempo-Klasse' : '\nBEIDE TEMPO-KLASSEN OK');
  process.exit(rc);
  return;
}
const KLASSE = process.env.TEMPO_KLASSE;
const { ladeModule } = require('./lade');
const R = ladeModule(['src/config.js', 'src/physics/vehicle.js', 'src/track/spline.js',
  'src/track/trackCatalog.js', 'src/track/trackBuilder.js', 'src/track/looping.js', 'src/race/raceManager.js', 'src/physics/collisions.js', 'src/ai/driver.js']);
R.Vehicle.klasseStandard = KLASSE;   // Runde 5: alle new R.Vehicle({}) dieses Laufs in dieser Tempo-Klasse

let fehler = 0;
function pruefe(name, ok, info) { console.log((ok ? 'OK   ' : 'FEHL ') + name + (info ? '  (' + info + ')' : '')); if (!ok) fehler++; }
const t0 = Date.now();

const dt = R.config.physik.schritt;
// Runde 4: Standardwelt je Strecke (Wiese klassisch, Wald/Wüste hindernisse, Fantasie fantasie); Abschnitt 8: Stunt-Welt
const STRECKEN = R.trackCatalog.map((d) => new R.Strecke(d));
let strecke = STRECKEN.find((s) => s.id === 'wiese');
// Stufen in Rang-Reihenfolge (aus der Config)
const stufen = Object.keys(R.config.schwierigkeiten).sort((a, b) => R.config.schwierigkeiten[a].rang - R.config.schwierigkeiten[b].rang);

/**
 * Rennen nur mit KI-Fahrern (optional ein synthetischer Spieler).
 * @param {{schwierigkeit:string, seed:any}[]} fahrer
 * @param {object} opt { runden, maxZeit, spieler (Tempo m/s), zwingeStillstand, abbruch(fn),
 *   hindernisse [{s, q}] (stehende Autos, nicht im Rennen), kollisionen (autoAuto + bande) }
 */
function simuliere(fahrer, opt) {
  const o = Object.assign({ runden: 2, maxZeit: 400 }, opt);
  const anzahl = fahrer.length + (o.spieler ? 1 : 0);
  const plaetze = strecke.startpositionen(anzahl);
  const teilnehmer = [];
  let spielerAuto = null, spielerS = 0;
  if (o.spieler) {
    // synthetischer Spieler: fährt exakt auf der Mittellinie mit konstantem Tempo
    spielerAuto = new R.Vehicle({});
    spielerS = strecke.spline.naechster(plaetze[0].x, plaetze[0].z).s;
    const p = strecke.spline.punktBei(spielerS);
    spielerAuto.setzen(p.x, p.z, R.headingAus(p.tx, p.tz));
    teilnehmer.push({ vehicle: spielerAuto, name: 'Spieler', istSpieler: true });
  }
  const ki = fahrer.map((f, i) => {
    const pl = plaetze[i + (o.spieler ? 1 : 0)];
    const v = new R.Vehicle({});
    v.setzen(pl.x, pl.z, pl.heading);
    const d = new R.Driver(v, strecke, { schwierigkeit: f.schwierigkeit, seed: f.seed, name: 'KI ' + i });
    teilnehmer.push({ vehicle: v, name: d.name, istSpieler: false });
    return { v, d, index: -1, gras: 0, zeit: 0, treffer: { pylone: 0, bake: 0, ast: 0 }, lp: R.Looping.zustand(), engUeber: -Infinity, engZeit: 0 };
  });
  const rennen = new R.RaceManager(strecke, teilnehmer, { runden: o.runden, countdown: 0 });
  if (strecke.pylonenZurueck) strecke.pylonenZurueck();   // umgefahrene Pylonen vom letzten Lauf aufstellen
  // stehende Autos (z. B. ein Kind, das an der Linie stehen bleibt)
  const steher = (o.hindernisse || []).map((h) => {
    const p = strecke.spline.punktBei(h.s);
    const v = new R.Vehicle({});
    v.setzen(p.x + p.nx * h.q, p.z + p.nz * h.q, R.headingAus(p.tx, p.tz));
    return { v, weg: 0, x: v.x, z: v.z, start: { x: v.x, z: v.z } };
  });
  const alleAutos = teilnehmer.map(t => t.vehicle).concat(steher.map(h => h.v));
  let stoesseMitSteher = 0;
  const tKi = rennen.teilnehmer.slice(o.spieler ? 1 : 0);
  const tSp = o.spieler ? rennen.teilnehmer[0] : null;
  let zeit = 0, maxVorne = -Infinity;

  for (; zeit < o.maxZeit; zeit += dt) {
    if (spielerAuto) {
      spielerS += o.spieler * dt;
      const p = strecke.spline.punktBei(spielerS);
      spielerAuto.x = p.x; spielerAuto.z = p.z; spielerAuto.heading = R.headingAus(p.tx, p.tz);
      spielerAuto.vLaengs = o.spieler;
    }
    const spielerMax = tSp ? tSp.fortschritt : null;
    ki.forEach((k, i) => {
      const t = tKi[i];
      if (t.imZiel) return;
      const andere = rennen.teilnehmer.filter(x => x !== t).map(x => ({ vehicle: x.vehicle, fortschritt: x.fortschritt }))
        .concat(steher.map(h => ({ vehicle: h.v, fortschritt: 0 })));
      const s = k.d.steuerung(dt, { andere, spielerFortschrittMax: spielerMax, eigenerFortschritt: t.fortschritt, laeuft: true });
      const n = strecke.abfrage(k.v.x, k.v.z, k.index);
      k.index = n.index;
      k.v.untergrund = n.untergrund;
      if (n.untergrund === 'gras') k.gras += dt;
      // Runde 4: enge Spur (1 Spur inkl. Übergang) – Abstand der Auto-Mitte zum Fahrbahnrand
      const sb = strecke.spurBei && strecke.spurBei(n.s);
      if (sb && sb.spuren === 1) { k.engUeber = Math.max(k.engUeber, Math.abs(n.seitenabstand) - strecke.breiteBei(n.s) / 2); k.engZeit += dt; }
      k.zeit += dt;
      // Loopings (Fantasie) wie im Spiel: im Looping übernimmt track/looping.js
      if (strecke.loopings.length) {
        const lr = R.Looping.fahrzeugSchritt(k.lp, k.v, strecke, s, dt, k.index);
        if (lr.ereignis === 'gefallen') rennen.verfolgungSetzen(t, k.v.x, k.v.z);
      } else k.v.schritt(dt, s);
      if (o.zwingeStillstand) { k.v.vLaengs = 0; k.v.vQuer = 0; }
    });
    steher.forEach(h => h.v.schritt(dt, { gas: 0, bremse: 0, lenkung: 0 }));
    // Streckenhindernisse (Pylonen, Bake, Ast) wie im Spiel jeden Schritt
    if (o.streckenKollision !== false && R.Kollisionen.hindernisse) {
      R.Kollisionen.hindernisse(ki.map(k => k.v), strecke, { dt, zeit }).forEach((st) => {
        if (ki[st.nr].treffer[st.typ] !== undefined) ki[st.nr].treffer[st.typ]++;
      });
    }
    if (o.kollisionen) {
      ki.forEach(k => R.Kollisionen.bande(k.v, strecke));
      const st = R.Kollisionen.autoAuto(alleAutos);
      const ersterSteher = teilnehmer.length;
      st.forEach(x => { if (x.a >= ersterSteher || x.b >= ersterSteher) stoesseMitSteher++; });
    }
    steher.forEach((h) => { h.weg += Math.hypot(h.v.x - h.x, h.v.z - h.z); h.x = h.v.x; h.z = h.v.z; });
    rennen.schritt(dt);
    if (tSp) {
      tKi.forEach(t => { maxVorne = Math.max(maxVorne, t.fortschritt - tSp.fortschritt); });
    }
    if (o.abbruch && o.abbruch({ zeit, rennen, ki, tKi, tSp })) break;
    if (!tSp && tKi.every(t => t.imZiel)) break;
  }
  return { ki, tKi, tSp, rennen, zeit, maxVorne, steher, stoesseMitSteher };
}

// ---------- 0) Config: 7 Stufen mit name/rang, Werte monoton ----------
{
  const S = R.config.schwierigkeiten;
  pruefe('7 Stufen leicht … unschlagbar in Rang-Reihenfolge',
    JSON.stringify(stufen) === JSON.stringify(['leicht', 'mittel', 'schwer', 'profi', 'meister', 'legende', 'unschlagbar']) &&
    JSON.stringify(Object.keys(S)) === JSON.stringify(stufen) && stufen.every((k) => typeof S[k].name === 'string'));
  pruefe('tempoFaktor steigend bis 1.0, gummiband und fehler fallend bis 0',
    stufen.every((k, i) => i === 0 || (S[k].tempoFaktor > S[stufen[i - 1]].tempoFaktor && S[k].gummiband <= S[stufen[i - 1]].gummiband &&
      S[k].fehler <= S[stufen[i - 1]].fehler)) && S.unschlagbar.tempoFaktor === 1 && S.unschlagbar.gummiband === 0 && S.unschlagbar.fehler === 0);
  const v = new R.Vehicle({});
  const d = new R.Driver(v, strecke, { schwierigkeit: 'unschlagbar', seed: 1 });
  const dm = new R.Driver(new R.Vehicle({}), strecke, { schwierigkeit: 'mittel', seed: 1 });
  pruefe('unschlagbar: gripBonus am Auto, später bremsen, innen schneiden',
    v.gripBonus === 1.05 && d.aBrems > dm.aBrems * 1.09 && d.innenSchneiden === 1.5 && dm.vehicle.gripBonus === 1);
}

// ---------- 1) Jede Schwierigkeit allein, 2 Runden, auf allen Strecken ----------
const ergebnis = {};
for (const st of STRECKEN) {
  strecke = st;
  ergebnis[st.id] = {};
  for (const stufe of stufen) {
    const r = simuliere([{ schwierigkeit: stufe, seed: 7 }], { runden: 2 });
    const k = r.ki[0], t = r.tKi[0];
    const anteil = k.gras / Math.max(k.zeit, 1e-9);
    ergebnis[st.id][stufe] = { r1: t.rundenzeiten[0], r2: t.rundenzeiten[1], gesamt: t.zielZeit,
      loop: { geschafft: k.lp.geschafft, gefallen: k.lp.gefallen, zuLangsam: k.lp.zuLangsam } };
    const tr = k.treffer, trText = `Pylonen ${tr.pylone}, Bake ${tr.bake}, Ast ${tr.ast}`;
    pruefe(`[${st.id}] ${stufe}: 2 Runden im Ziel (mit Hindernissen), Gras ${(anteil * 100).toFixed(1)} % < 3 %, kein Reset`,
      t.imZiel && anteil < 0.03 && !k.d.brauchtReset,
      `Runde 1 ${fmt(t.rundenzeiten[0])}, Runde 2 ${fmt(t.rundenzeiten[1])} | ${trText}`);
    // ab "profi" fehlerfrei durch Baustelle und an Ästen vorbei; darunter nur Bake/Ast tabu
    const rang = R.config.schwierigkeiten[stufe].rang;
    pruefe(`[${st.id}] ${stufe}: ${rang >= 4 ? 'keine Treffer' : 'keine Bake/Ast-Treffer'}`,
      tr.bake === 0 && tr.ast === 0 && (rang < 4 || tr.pylone === 0), trText);
  }
  const r2 = (s) => (ergebnis[st.id][s].r2 !== undefined ? ergebnis[st.id][s].r2 : Infinity);
  pruefe(`[${st.id}] Rundenzeiten (fliegend) streng fallend leicht → unschlagbar`,
    stufen.every((s, i) => i === 0 || r2(s) < r2(stufen[i - 1])), stufen.map((s) => r2(s).toFixed(1)).join(' > '));
  const spanneMin = st.id === 'fantasie' ? 12 : 25;   // Fantasie ist kurz (1,4 km)
  pruefe(`[${st.id}] Spanne leicht – unschlagbar ≥ ${spanneMin} s`, r2('leicht') - r2('unschlagbar') >= spanneMin, (r2('leicht') - r2('unschlagbar')).toFixed(1) + ' s');
  // Fantasie ist kürzer (1,4 km): Runde 40–70 s, Spanne ≥ 12 s
  // Runde 4: Strecken länger (Wiese ×1,35, Wald ×1,25, Wüste ×1,45) → unschlagbar 75–110 s
  const kurz = st.id === 'fantasie', zMin = kurz ? 40 : 75, zMax = kurz ? 70 : 110;
  pruefe(`[${st.id}] unschlagbar-Rundenzeit ${zMin}–${zMax} s`, r2('unschlagbar') >= zMin && r2('unschlagbar') <= zMax, fmt(r2('unschlagbar')));
  if (st.loopings.length) {
    const ks = Object.keys(ergebnis[st.id]).map(s => ergebnis[st.id][s].loop);
    pruefe(`[${st.id}] alle Stufen: ${2 * st.loopings.length} Loopings je Fahrt, 0 Stürze, 0× zu langsam`,
      ks.every(l => l.geschafft === 2 * st.loopings.length && l.gefallen === 0 && l.zuLangsam === 0), JSON.stringify(ks[0]));
  }
}
strecke = STRECKEN.find((s) => s.id === 'wiese');
function fmt(x) { return x === undefined || x === null ? '-' : x.toFixed(1) + ' s'; }

// ---------- 2) 4 KI-Fahrer gleichzeitig ----------
{
  const r = simuliere([
    { schwierigkeit: 'mittel', seed: 1 }, { schwierigkeit: 'mittel', seed: 2 },
    { schwierigkeit: 'mittel', seed: 3 }, { schwierigkeit: 'mittel', seed: 4 },
  ], { runden: 2 });
  const resets = r.ki.filter(k => k.d.brauchtReset).length;
  const allesImZiel = r.tKi.every(t => t.imZiel);
  const zeiten = r.tKi.map(t => t.zielZeit);
  const eindeutig = allesImZiel && new Set(r.tKi.map(t => t.zielPlatz)).size === 4 &&
    new Set(zeiten.map(z => z.toFixed(3))).size === 4;
  const gras = Math.max(...r.ki.map(k => k.gras / k.zeit));
  pruefe('4 KI (mittel): alle im Ziel, kein Reset, Reihenfolge eindeutig',
    resets === 0 && eindeutig,
    'Zielzeiten ' + r.tKi.slice().sort((a, b) => a.zielPlatz - b.zielPlatz).map(t => t.name + ' ' + fmt(t.zielZeit)).join(', ') +
    ` | max. Gras ${(gras * 100).toFixed(1)} %`);
}

// ---------- 3) Gummiband (leicht + mittel) ----------
// Synthetischer Spieler fährt konstant auf der Mittellinie. Tempo relativ zum Schnitt der Stufe:
// 115 % → die KI muss aufholen (danach < 150 m dahinter), 90 % → die KI darf nie > 150 m vorne liegen.
// (Der synthetische Spieler fährt auch durch die Haarnadel mit konstantem Tempo – 115 % sind für ein Kind
//  schon eine sehr schnelle Runde.)
const FAKTOR_SCHNELL = +(process.env.GS || 1.15), FAKTOR_LANGSAM = +(process.env.GL || 0.9);
// Runde 4: Wiese ist 1,35× so lang → Abstandsgrenzen mit der Länge mitskaliert (Bezug 2.250 m)
const GUMMI_SKALA = Math.max(1, strecke.laenge / 2250);
const G150 = Math.round(150 * GUMMI_SKALA), G250 = Math.round(250 * GUMMI_SKALA);
for (const stufe of ['leicht', 'mittel']) {
  const schnitt = strecke.laenge / ergebnis.wiese[stufe].r2;
  for (const [faktor, art] of [[FAKTOR_SCHNELL, 'schneller'], [FAKTOR_LANGSAM, 'langsamer']]) {
    let abstandEnde = null;
    const r = simuliere([{ schwierigkeit: stufe, seed: 11 }], {
      runden: 5, spieler: schnitt * faktor, maxZeit: 600,
      abbruch: ({ tSp, tKi }) => {
        if (tSp.runde >= 2) { abstandEnde = tKi[0].fortschritt - tSp.fortschritt; return true; }
        return false;
      },
    });
    const info = `Spieler ${(schnitt * faktor * 3.6).toFixed(0)} km/h, Abstand Ende ${abstandEnde === null ? '-' : abstandEnde.toFixed(0)} m, max. vorne ${r.maxVorne.toFixed(0)} m`;
    if (art === 'schneller') {
      pruefe(`Gummiband ${stufe}: Spieler ${art} – KI nach 2 Runden < ${G150} m dahinter`, abstandEnde !== null && abstandEnde > -G150, info);
    } else {
      // Der Spieler fährt konstant, die KI schnell auf Geraden und langsam in Kurven → der Abstand pendelt
      // bei 250 km/h um ±50 m. Darum: am Ende < 150 m vorne, Spitze < 250 m.
      pruefe(`Gummiband ${stufe}: Spieler ${art} – KI am Ende < ${G150} m, nie > ${G250} m vorne`, abstandEnde !== null && abstandEnde < G150 && r.maxVorne < G250, info);
    }
  }
}

// ---------- 4) Festfahren ----------
{
  let resetZeit = null;
  simuliere([{ schwierigkeit: 'mittel', seed: 5 }], {
    runden: 2, maxZeit: 30, zwingeStillstand: true,
    abbruch: ({ zeit, ki }) => { if (ki[0].d.brauchtReset) { resetZeit = zeit; return true; } return false; },
  });
  pruefe('Festfahren: brauchtReset nach ≤ 15 s', resetZeit !== null && resetZeit <= 15, resetZeit === null ? 'nie' : resetZeit.toFixed(1) + ' s');
}

// ---------- 6) Stehende Autos auf der Strecke, mit Kollisionsphysik ----------
{
  const fahrer = [{ schwierigkeit: 'mittel', seed: 21 }, { schwierigkeit: 'mittel', seed: 22 }, { schwierigkeit: 'mittel', seed: 23 }];
  const frei = simuliere(fahrer, { runden: 1, kollisionen: true });
  const mit = simuliere(fahrer, { runden: 1, kollisionen: true, hindernisse: [{ s: 300, q: 0 }, { s: 900, q: 2 }] });
  const weg = Math.max(...mit.steher.map(h => h.weg));
  const versatz = Math.max(...mit.steher.map(h => Math.hypot(h.v.x - h.start.x, h.v.z - h.start.z)));
  pruefe('Stehende Autos: insgesamt < 5 m bewegt', weg < 5,
    `Weg max. ${weg.toFixed(2)} m, Endversatz ${versatz.toFixed(2)} m, Stöße mit Stehern ${mit.stoesseMitSteher}`);
  pruefe('Stehende Autos: alle KI im Ziel, kein Reset',
    mit.tKi.every(t => t.imZiel) && mit.ki.every(k => !k.d.brauchtReset));
  const mehr = Math.max(...mit.tKi.map((t, i) => (t.rundenzeiten[0] || Infinity) - frei.tKi[i].rundenzeiten[0]));
  pruefe('Stehende Autos: Rundenzeit < 8 s langsamer als freie Fahrt', mehr < 8,
    'frei ' + frei.tKi.map(t => fmt(t.rundenzeiten[0])).join('/') + ' | mit ' + mit.tKi.map(t => fmt(t.rundenzeiten[0])).join('/') +
    ' | max. +' + mehr.toFixed(1) + ' s');
}

// ---------- 5) Deterministisch ----------
{
  const lauf = (seed) => {
    const pos = [];
    simuliere([{ schwierigkeit: 'leicht', seed }, { schwierigkeit: 'mittel', seed: seed + 1 }], {
      runden: 1, maxZeit: 40,
      abbruch: ({ zeit, ki }) => { if (Math.abs(zeit % 5) < dt / 2) pos.push(ki.map(k => [k.v.x, k.v.z])); return false; },
    });
    pos.push(0);
    return JSON.stringify(pos);
  };
  const a = lauf(42), b = lauf(42), c = lauf(43);
  pruefe('Deterministisch: gleicher Seed → gleiche Positionen', a === b);
  pruefe('Anderer Seed → andere Positionen', a !== c);
}

// ---------- 7) Stabilität bei 250 km/h: Geradeaus mit 2 m Versatz, Lenkung darf nicht aufschwingen ----------
{
  // Synthetisches Oval mit 2,4 km langen Geraden (die echten Strecken erreichen kaum 200 km/h)
  const punkte = [];
  const G = 2400, Rk = 250;
  for (let z = 0; z >= -G; z -= 40) punkte.push([0, 0, z]);
  for (let w = 10; w < 180; w += 10) { const a = w * Math.PI / 180; punkte.push([Rk - Rk * Math.cos(a), 0, -G - Rk * Math.sin(a)]); }
  for (let z = -G; z <= 0; z += 40) punkte.push([2 * Rk, 0, z]);
  for (let w = 10; w < 180; w += 10) { const a = w * Math.PI / 180; punkte.push([Rk + Rk * Math.cos(a), 0, Rk * Math.sin(a)]); }
  const oval = new R.Strecke({ id: 'oval', name: 'Oval', thema: 'wiese', breite: 14, randBreite: 1.5, punkte });
  for (const stufe of ['mittel', 'unschlagbar']) {
    const v = new R.Vehicle({ vMax: 75, beschleunigung: 7.4, bremsen: 25, grip: 0.78 });   // Porsche-Werte
    const d = new R.Driver(v, oval, { schwierigkeit: stufe, seed: 3 });
    d.fehler = 0;                                    // nur die Regelung prüfen, keine Schlenker
    const s0 = 200;
    const p = oval.spline.punktBei(s0);
    const ziel = d._grundVersatz(s0);
    v.setzen(p.x + p.nx * (ziel + 2), p.z + p.nz * (ziel + 2), R.headingAus(p.tx, p.tz));
    v.vLaengs = 250 / 3.6;
    let index = -1, wechsel = 0, vorher = 0, ueber = 0, maxLenk = 0, endFehler = 0;
    for (let i = 0; i < 60 * 8; i++) {
      const st = d.steuerung(dt, { andere: [], spielerFortschrittMax: null, laeuft: true });
      v.schritt(dt, st);
      v.vLaengs = 250 / 3.6;                         // Tempo halten (nur die Lenkung wird geprüft)
      const n = oval.abfrage(v.x, v.z, index); index = n.index;
      const e = n.seitenabstand - d._grundVersatz(n.s);
      const sg = Math.abs(st.lenkung) > 0.02 ? Math.sign(st.lenkung) : 0;
      if (sg !== 0 && vorher !== 0 && sg !== vorher) wechsel++;
      if (sg !== 0) vorher = sg;
      if (e < 0) ueber = Math.max(ueber, -e);
      maxLenk = Math.max(maxLenk, Math.abs(st.lenkung));
      endFehler = Math.abs(e);
    }
    pruefe(`Stabilität ${stufe} bei 250 km/h, 2 m Versatz: Lenkung schwingt nicht auf`,
      wechsel <= 1 && ueber < 0.5 && endFehler < 0.3,
      `Lenk-Vorzeichenwechsel ${wechsel}, Überschwingen ${ueber.toFixed(2)} m, Restfehler ${endFehler.toFixed(2)} m, max. Lenkung ${maxLenk.toFixed(2)}`);
  }
}

// ---------- 8) Runde 4: Stunt-Welt – enge (1 Spur, 5 m) und breite (3 Spuren) Stellen ----------
// 3 KI gemeinsam mit Bande (Leitplanke) und Auto-Kollisionen: alle im Ziel, kein Reset, Gras < 3 %,
// an engen Stellen bleibt die Auto-Mitte auf der Fahrbahn (≤ Rand + 0,5 m, Leitplanke bei Rand + 1,9 m).
for (const daten of R.trackCatalog) {
  if (!daten.welten || !daten.welten.stunt) continue;
  strecke = new R.Strecke(daten, { welt: 'stunt' });
  const r = simuliere([{ schwierigkeit: 'leicht', seed: 31 }, { schwierigkeit: 'mittel', seed: 32 }, { schwierigkeit: 'unschlagbar', seed: 33 }],
    { runden: 2, kollisionen: true, maxZeit: 500 });
  const gras = Math.max(...r.ki.map(k => k.gras / Math.max(k.zeit, 1e-9)));
  const eng = Math.max(...r.ki.map(k => k.engUeber)), engZeit = Math.min(...r.ki.map(k => k.engZeit));
  pruefe(`[${daten.id}/stunt] 3 KI × 2 Runden mit Bande: im Ziel, 0 Resets, Gras < 3 %`,
    r.tKi.every(t => t.imZiel) && r.ki.every(k => !k.d.brauchtReset) && gras < 0.03,
    'Zielzeiten ' + r.tKi.map(t => fmt(t.zielZeit)).join('/') + ` | Gras ${(gras * 100).toFixed(1)} %`);
  pruefe(`[${daten.id}/stunt] enge Stelle befahren, Auto-Mitte ≤ 0,5 m über dem Fahrbahnrand`, engZeit > 1 && eng <= 0.5,
    `max. ${eng.toFixed(2)} m, je KI ≥ ${engZeit.toFixed(1)} s in der engen Stelle`);
}

const dauer = (Date.now() - t0) / 1000;
pruefe('Laufzeit < 60 s', dauer < 60, dauer.toFixed(1) + ' s');
console.log(fehler === 0 ? '\nAlle KI-Tests bestanden.' : `\n${fehler} Test(s) fehlgeschlagen.`);
process.exit(fehler === 0 ? 0 : 1);
