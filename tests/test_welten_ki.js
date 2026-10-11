// Runde 5 (Fix-A Punkt 5): KI in allen Welten je Tempo-Klasse – node tests/test_welten_ki.js [streckenId]
// Je Strecke × Welt (alle Welten aus dem Katalog) × 7 Stufen: KI allein, 2 Runden, ohne Kollisionen.
// Prüft: im Ziel, kein Reset (brauchtReset), abseits < 3 %; Schanzen: jede Absprung-Geschwindigkeit ≥ 90 km/h
// (25 m/s – darunter wäre der Sprung ein Hüpfer) – ausgenommen eine Schanze direkt nach dem Start (Runde 1, < 300 m
// gefahren: aus dem Stand physikalisch nicht erreichbar), dort ≥ config.anlauf.schanzeMin bzw. 50 km/h; Loopings: alle geschafft, 0 Stürze, 0× zu langsam.
// Fahrzeugschritt wie main.js (ohne Fahrhilfe): Looping → Looping.schritt, Flug → Schanzen.flugSchritt,
// sonst vehicle.schritt + Schanzen.nachSchritt + Looping-Einfahrt.
// Ohne TEMPO_KLASSE: beide Klassen (normal, schnell) als eigene Prozesse.
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
const fs = require('fs'), path = require('path');
const dateien = ['src/config.js', 'src/physics/vehicle.js', 'src/track/spline.js', 'src/track/trackCatalog.js',
  'src/track/trackBuilder.js', 'src/track/looping.js', 'src/track/schanze.js', 'src/race/raceManager.js',
  'src/physics/collisions.js', 'src/ai/driver.js'];
if (fs.existsSync(path.join(__dirname, '..', 'src/track/anlauf.js'))) dateien.splice(7, 0, 'src/track/anlauf.js');
const R = ladeModule(dateien);
R.Vehicle.klasseStandard = KLASSE;

const dt = R.config.physik.schritt, LP = R.Looping, S = R.Schanzen;
const SPRUNG_MIN = 25;   // m/s = 90 km/h
const START_MIN = (R.config.anlauf && R.config.anlauf.schanzeMin) || 14;   // m/s an einer Schanze kurz nach dem Start
const START_WEG = 300;   // m
const nurId = process.argv[2];
let fehler = 0;
function pruefe(name, ok, info) { console.log((ok ? 'OK   ' : 'FEHL ') + name + (info ? '  (' + info + ')' : '')); if (!ok) fehler++; }
const STUFEN = Object.keys(R.config.schwierigkeiten).sort((a, b) => R.config.schwierigkeiten[a].rang - R.config.schwierigkeiten[b].rang);

/** Ein Schritt wie main.js (Looping / Flug / Boden), liefert { ereignis, index, untergrund }. */
function schritt(lp, fz, v, st, s, index) {
  if (lp.aktiv || lp.fallen) return LP.fahrzeugSchritt(lp, v, st, s, dt, index);
  if (fz.aktiv) return S.fahrzeugSchritt(fz, v, st, s, dt, index);
  const n = st.abfrage(v.x, v.z, index);
  v.untergrund = n.untergrund;
  const xAlt = v.x, zAlt = v.z;
  v.schritt(dt, s);
  let e = S.nachSchritt(fz, v, st, n, xAlt, zAlt, dt);
  v.y = S.hoehe(fz, v, st);
  if (st.loopings && st.loopings.length) {
    const pt = st.spline.punktBei(n.s), dx = v.x - xAlt, dz = v.z - zAlt;
    e = LP.einfahrt(lp, v, st, n.s, n.s + dx * pt.tx + dz * pt.tz, n.seitenabstand + dx * pt.nx + dz * pt.nz) || e;
  }
  return { ereignis: e, index: n.index, untergrund: n.untergrund };
}

function kiFahrt(st, stufe) {
  const start = st.startpositionen(1)[0];
  const v = new R.Vehicle({});
  v.setzen(start.x, start.z, start.heading);
  const rennen = new R.RaceManager(st, [{ vehicle: v, name: 'KI', istSpieler: false }], { runden: 2, countdown: 0 });
  const d = new R.Driver(v, st, { schwierigkeit: stufe, seed: 11, name: 'KI' });
  if (d.hindernisseSetzen) d.hindernisseSetzen(st.hindernisse);
  const t = rennen.teilnehmer[0], lp = LP.zustand(), fz = S.zustand();
  let index = -1, abseits = 0, zeit = 0, reset = false, sprungMin = Infinity, spruenge = 0, startSprung = Infinity, weg = 0;
  for (let k = 0; k < 60 * 500 && !t.imZiel; k++) {
    const s = d.steuerung(dt, { andere: [], spielerFortschrittMax: null, eigenerFortschritt: t.fortschritt, laeuft: true });
    if (d.brauchtReset) { reset = true; break; }
    const vorher = v.vLaengs;
    const r = schritt(lp, fz, v, st, s, index);
    index = r.index;
    weg += Math.abs(v.vLaengs) * dt;
    if (r.ereignis === 'abflug') {
      spruenge++;
      const vs = Math.min(vorher, v.vLaengs);
      if (weg < START_WEG) startSprung = Math.min(startSprung, vs); else sprungMin = Math.min(sprungMin, vs);
    }
    if (r.untergrund === 'gras' || r.untergrund === 'sand') abseits += dt;
    if (r.ereignis === 'gefallen') rennen.verfolgungSetzen(0, v.x, v.z);
    rennen.schritt(dt);
    zeit += dt;
  }
  return { imZiel: t.imZiel, reset, anteil: abseits / Math.max(zeit, dt), r2: t.rundenzeiten[1], sprungMin, spruenge, startSprung,
    loop: { geschafft: lp.geschafft, gefallen: lp.gefallen, zuLangsam: lp.zuLangsam } };
}

console.log('Tempo-Klasse ' + KLASSE + ': Standard-Auto vMax ' + (new R.Vehicle({}).daten.vMax * 3.6).toFixed(0) + ' km/h');
for (const daten of R.trackCatalog) {
  if (nurId && daten.id !== nurId) continue;
  for (const welt of Object.keys(daten.welten || { klassisch: 1 })) {
    const st = new R.Strecke(daten, { welt });
    const nSch = S.liste(st).length, nLoop = st.loopings.length;
    const zeilen = [];
    let allesOk = true, sprungMinAlle = Infinity, startMinAlle = Infinity;
    for (const stufe of STUFEN) {
      const e = kiFahrt(st, stufe);
      sprungMinAlle = Math.min(sprungMinAlle, e.sprungMin); startMinAlle = Math.min(startMinAlle, e.startSprung);
      const ok = e.imZiel && !e.reset && e.anteil < 0.03 &&
        (!nSch || (e.spruenge >= 2 * nSch && e.sprungMin >= SPRUNG_MIN && e.startSprung >= START_MIN)) &&
        (!nLoop || (e.loop.geschafft === 2 * nLoop && e.loop.gefallen === 0 && e.loop.zuLangsam === 0));
      if (!ok) { allesOk = false; zeilen.push(stufe + ': ' + JSON.stringify(e)); }
      else zeilen.push(stufe + ' ' + (e.r2 ? e.r2.toFixed(1) + ' s' : '-'));
    }
    pruefe(`[${daten.id}/${welt}] 7 Stufen × 2 Runden: im Ziel, kein Reset, abseits < 3 %` +
      (nSch ? `, ${nSch} Schanzen je Runde mit ≥ 90 km/h` : '') + (nLoop ? `, ${nLoop} Loopings ohne Sturz` : ''),
      allesOk, (nSch ? 'Absprung min ' + (sprungMinAlle * 3.6).toFixed(0) + ' km/h' +
        (startMinAlle < Infinity ? ', Start-Schanze (Runde 1) ' + (startMinAlle * 3.6).toFixed(0) + ' km/h' : '') + ' | ' : '') + zeilen.join(', '));
  }
}
console.log(fehler === 0 ? '\nALLE TESTS OK' : '\n' + fehler + ' FEHLER');
process.exit(fehler ? 1 : 0);
