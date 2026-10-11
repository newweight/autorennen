// Rundenzeit-Check für alle Katalog-Strecken (oder eine: node tests/test_rundenzeit.js [streckenId]).
// a) KI-Fahrer (ai/driver.js) je Schwierigkeit (7 Stufen) allein auf der Strecke, 2 Runden, ohne Kollisionen.
//    Prüfkriterien (Runde 3, 220–270 km/h):
//    - jede Stufe: im Ziel, Gras/Sand < 3 % der Fahrzeit, kein Reset
//    - Runde 2 (fliegend) streng monoton fallend von leicht → unschlagbar
//    - Abstand leicht – unschlagbar ≥ 25 s je Runde (Kinder müssen spürbar gewinnen können)
//    - unschlagbar höchstens 3 % langsamer als die "perfekte Fahrt" (b)
// b) "Perfekte Fahrt": Mittellinien-Fahrer (Pure-Pursuit-Lenkung) mit Ideallinien-Tempo 100 %
//    (Driver.tempoProfil, gleiches Auto, ohne Bonus) – Referenz, bleibt auf Straße + Randstreifen.
const { ladeModule } = require('./lade');
const R = ladeModule(['src/config.js', 'src/physics/vehicle.js', 'src/track/spline.js',
  'src/track/trackCatalog.js', 'src/track/trackBuilder.js', 'src/track/looping.js', 'src/race/raceManager.js', 'src/physics/collisions.js', 'src/ai/driver.js']);
// Loopings (Fantasie): Fahrzeugschritt über Looping.fahrzeugSchritt (wie main.js, ohne Fahrhilfe)
const LP = R.Looping;
// Erwartungen je Strecke (Spanne leicht – unschlagbar je Runde); Fantasie ist kurz (1,4 km)
const SPANNE = { fantasie: 12 };

const dt = R.config.physik.schritt;
const nurId = process.argv[2];
let fehler = 0;
function pruefe(name, ok, info) { console.log((ok ? 'OK   ' : 'FEHL ') + name + (info ? '  (' + info + ')' : '')); if (!ok) fehler++; }
const fmt = (x) => (x === undefined || x === null ? '-' : x.toFixed(1) + ' s');
// Stufen in Rang-Reihenfolge (aus der Config, nicht hart verdrahtet)
const STUFEN = Object.keys(R.config.schwierigkeiten).sort((a, b) => R.config.schwierigkeiten[a].rang - R.config.schwierigkeiten[b].rang);

/** KI-Fahrer allein, 2 Runden. */
function kiRunde(strecke, stufe) {
  const start = strecke.startpositionen(1)[0];
  const v = new R.Vehicle({});
  v.setzen(start.x, start.z, start.heading);
  const rennen = new R.RaceManager(strecke, [{ vehicle: v, name: 'KI', istSpieler: false }], { runden: 2, countdown: 0 });
  const d = new R.Driver(v, strecke, { schwierigkeit: stufe, seed: 7, name: 'KI' });
  const t = rennen.teilnehmer[0], lp = LP.zustand();
  let index = -1, abseits = 0, zeit = 0, maxAbstand = 0, vMax = 0;
  for (let k = 0; k < 60 * 500 && !t.imZiel; k++) {
    const s = d.steuerung(dt, { andere: [], spielerFortschrittMax: null, eigenerFortschritt: t.fortschritt, laeuft: true });
    const r = LP.fahrzeugSchritt(lp, v, strecke, s, dt, index);
    index = r.index;
    if (r.untergrund === 'gras' || r.untergrund === 'sand') abseits += dt;
    if (!lp.aktiv) maxAbstand = Math.max(maxAbstand, Math.abs(strecke.spline.naechster(v.x, v.z, index).seitenabstand));
    if (r.ereignis === 'gefallen') rennen.verfolgungSetzen(0, v.x, v.z);
    rennen.schritt(dt);
    zeit += dt;
    vMax = Math.max(vMax, v.vLaengs);
  }
  return { r1: t.rundenzeiten[0], r2: t.rundenzeiten[1], imZiel: t.imZiel, abseits, anteil: abseits / zeit, maxAbstand, reset: d.brauchtReset, vMax,
    loop: { geschafft: lp.geschafft, gefallen: lp.gefallen, zuLangsam: lp.zuLangsam } };
}

/** "Perfekte Fahrt": Mittellinie, Ideallinien-Tempo 100 %. */
function perfekteRunde(strecke) {
  const sp = strecke.spline;
  const start = strecke.startpositionen(1)[0];
  const v = new R.Vehicle({});
  v.setzen(start.x, start.z, start.heading);
  const profil = R.Driver.tempoProfil(strecke, v);
  const rennen = new R.RaceManager(strecke, [{ vehicle: v, name: 'Test', istSpieler: true }], { runden: 2, countdown: 0 });
  const t = rennen.teilnehmer[0];
  let index = -1, maxAbseits = 0, vMax = 0;
  const zeiten = [], lp = LP.zustand();
  rennen.bei('runde', (tt, z) => zeiten.push(z));
  for (let k = 0; k < 60 * 600 && t.runde < 2; k++) {
    const n = strecke.abfrage(v.x, v.z, index);
    index = n.index;
    v.untergrund = n.untergrund;
    maxAbseits = Math.max(maxAbseits, n.abstand);
    const L = Math.max(9, Math.min(50, 0.55 * v.vLaengs + 8));
    const ziel = sp.punktBei(n.s + L);
    const hZiel = R.headingAus(ziel.x - v.x, ziel.z - v.z);
    let diff = hZiel - v.heading;
    while (diff > Math.PI) diff -= 2 * Math.PI;
    while (diff < -Math.PI) diff += 2 * Math.PI;
    const vl = Math.max(3, v.vLaengs);
    const lenkung = Math.max(-1, Math.min(1, -(2 * vl * Math.sin(diff) / Math.hypot(ziel.x - v.x, ziel.z - v.z)) / v.drehrateMax(vl)));
    const soll = profil.tempoBei(n.s + v.vLaengs * 0.1);
    const e = soll - v.vLaengs;
    LP.fahrzeugSchritt(lp, v, strecke, e > 0 ? { gas: 1, bremse: 0, lenkung } : { gas: 0, bremse: e < -1 ? Math.min(1, 0.35 - e / 2) : 0, lenkung }, dt, index);
    vMax = Math.max(vMax, v.vLaengs);
    rennen.schritt(dt);
  }
  return { zeiten, maxAbseits, vMax };
}

const tabelle = [];
for (const daten of R.trackCatalog) {
  if (nurId && daten.id !== nurId) continue;
  const strecke = new R.Strecke(daten);
  console.log('\n=== ' + daten.name + ' (' + strecke.laenge.toFixed(0) + ' m, Breite ' + strecke.breite + ' m) ===');
  const zeile = { id: daten.id, laenge: strecke.laenge };
  for (const stufe of STUFEN) {
    const e = kiRunde(strecke, stufe);
    zeile[stufe] = e.r2;
    console.log(`KI ${stufe.padEnd(11)} Runde 1 ${fmt(e.r1)}, Runde 2 ${fmt(e.r2)} | abseits ${(e.anteil * 100).toFixed(1)} % | max. Abstand ${e.maxAbstand.toFixed(1)} m | max ${(e.vMax * 3.6).toFixed(0)} km/h`);
    pruefe(`[${daten.id}] ${stufe}: 2 Runden im Ziel, abseits < 3 %, kein Reset`, e.imZiel && e.anteil < 0.03 && !e.reset,
      (e.anteil * 100).toFixed(1) + ' %');
    if (strecke.loopings.length) {
      pruefe(`[${daten.id}] ${stufe}: alle Loopings geschafft (${2 * strecke.loopings.length}×), 0 Stürze, 0× zu langsam`,
        e.loop.geschafft === 2 * strecke.loopings.length && e.loop.gefallen === 0 && e.loop.zuLangsam === 0, JSON.stringify(e.loop));
    }
  }
  const pf = perfekteRunde(strecke);
  zeile.perfekt = pf.zeiten[1];
  console.log(`Perfekte Fahrt: Runde 1 ${fmt(pf.zeiten[0])}, Runde 2 ${fmt(pf.zeiten[1])} | max ${(pf.vMax * 3.6).toFixed(0)} km/h`);
  pruefe(`[${daten.id}] Perfekte Fahrt: 2 Runden, auf Straße + Rand`,
    pf.zeiten.length === 2 && pf.maxAbseits < strecke.breite / 2 + strecke.randBreite, 'max. Abstand ' + pf.maxAbseits.toFixed(1) + ' m');

  const z = STUFEN.map((s) => (zeile[s] === undefined ? Infinity : zeile[s]));
  pruefe(`[${daten.id}] Rundenzeiten streng fallend leicht → unschlagbar`, z.every((x, i) => i === 0 || x < z[i - 1]),
    z.map((x) => x.toFixed(1)).join(' > '));
  const spanne = z[0] - z[z.length - 1];
  const spMin = SPANNE[daten.id] || 25;
  pruefe(`[${daten.id}] Abstand leicht – unschlagbar ≥ ${spMin} s/Runde`, spanne >= spMin, spanne.toFixed(1) + ' s');
  const unschl = z[z.length - 1];
  pruefe(`[${daten.id}] unschlagbar innerhalb 3 % der perfekten Fahrt`, unschl <= zeile.perfekt * 1.03,
    fmt(unschl) + ' vs ' + fmt(zeile.perfekt) + ' (' + ((unschl / zeile.perfekt - 1) * 100).toFixed(1) + ' %)');
  tabelle.push(zeile);
}
console.log('\nRunde 2 (fliegend), Standard-Auto 240 km/h');
console.log('Strecke  Länge  ' + STUFEN.map((s) => s.slice(0, 7).padStart(8)).join('') + '  perfekt');
tabelle.forEach((z) => console.log(z.id.padEnd(8), (z.laenge.toFixed(0) + ' m').padEnd(6),
  STUFEN.concat(['perfekt']).map((s) => fmt(z[s]).padStart(8)).join('')));
console.log(fehler === 0 ? '\nALLE TESTS OK' : '\n' + fehler + ' FEHLER');
process.exit(fehler ? 1 : 0);
