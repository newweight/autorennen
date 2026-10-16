// v27 F5: node tests/test_ki_geisterfahrer.js
// Wiese, 5 KI + Autopilot (6 x 2 = 12 KI-Runden), Kollisionen an. Frontalstöße KI <-> Geisterfahrer (Annäherung > 20 m/s):
// alter Fahrer (tests/sicherung_v27_F5/driver.js) >= 5, neuer <= 1. Ohne Geisterfahrer müssen die Zielzeiten beider Fahrer bitgleich sein.
'use strict';
const path = require('path'), fs = require('fs'), { spawnSync } = require('child_process');
const strecke = 'wiese';
if (process.env.KI_LAUF) {
  const alt = process.env.KI_LAUF === 'alt';
  if (alt) {
    const orig = fs.readFileSync, altDatei = path.join(__dirname, 'sicherung_v27_F5', 'driver.js');
    fs.readFileSync = function (p, ...r) { return (typeof p === 'string' && /src[\\/]ai[\\/]driver\.js$/.test(p)) ? orig.call(fs, altDatei, ...r) : orig.call(fs, p, ...r); };
  }
  const { Simulation } = require('../server/simulation.js');
  const geister = process.env.KI_GEISTER === '1';
  const sim = new Simulation({ einstellungen: { streckeId: strecke, gegner: 5, runden: 2, geisterfahrer: geister, kollisionen: true, schwierigkeit: 'mittel' }, spieler: [{ fahrer: 'Jonas', auto: 'passat' }], seed: 1 });
  const S = sim.sim, R = sim.R, f0 = S.fahrzeuge[0];
  f0.autopilot = new R.Driver(f0.vehicle, S.strecke, { schwierigkeit: 'mittel', seed: 7000 });
  const nT = S.rennen.teilnehmer.length, letzt = new Map(); let frontal = 0, kontakte = 0, schritte = 0, prev = [];
  const istG = (f) => f && f.verkehr && f.verkehr.art === 'geisterfahrer';
  while (schritte < 60 * 600) {
    const vorher = S.fahrzeuge.map(f => [f.vehicle.x, f.vehicle.z]);
    sim.schritt(); schritte++;
    const vel = (i) => prev[i] && vorher[i] ? [(vorher[i][0] - prev[i][0]) * 60, (vorher[i][1] - prev[i][1]) * 60] : [0, 0];
    for (const st of S.stoesse || []) {
      const fa = S.fahrzeuge[st.a], fb = S.fahrzeuge[st.b], ki = st.a < nT ? st.a : st.b < nT ? st.b : -1, g = istG(fa) ? fa : istG(fb) ? fb : null;
      if (ki < 0 || !g) continue;
      const key = ki + '-' + (st.a < nT ? st.b : st.a), t = schritte / 60;
      if (letzt.has(key) && t - letzt.get(key) < 2) { letzt.set(key, t); continue; }
      letzt.set(key, t); kontakte++;
      const A = vel(ki), B = vel(S.fahrzeuge.indexOf(g));
      if (Math.hypot(A[0] - B[0], A[1] - B[1]) > 20) frontal++;
    }
    prev = vorher;
    if (S.rennen.teilnehmer.every(t => t.imZiel)) break;
  }
  console.log(JSON.stringify({ frontal, kontakte, zeiten: S.rennen.teilnehmer.map(t => t.imZiel ? t.zielZeit : null) }));
  process.exit(0);
}
const lauf = (lauf, g) => JSON.parse(spawnSync(process.execPath, [__filename], { env: Object.assign({}, process.env, { KI_LAUF: lauf, KI_GEISTER: g }), encoding: 'utf8', maxBuffer: 1e8 }).stdout.trim().split('\n').pop());
let ok = 0, fehl = 0; const pruefe = (n, g, i) => { console.log((g ? 'OK   ' : 'FEHL ') + n + (i !== undefined ? '  (' + i + ')' : '')); g ? ok++ : fehl++; };
const altG = lauf('alt', '1'), neuG = lauf('neu', '1'), altO = lauf('alt', '0'), neuO = lauf('neu', '0');
pruefe('alt: Frontalstöße mit Geisterfahrern >= 5', altG.frontal >= 5, altG.frontal);
pruefe('neu: Frontalstöße mit Geisterfahrern <= 1', neuG.frontal <= 1, neuG.frontal);
pruefe('ohne Geisterfahrer: Zielzeiten bitgleich (alt = neu)', JSON.stringify(altO.zeiten) === JSON.stringify(neuO.zeiten), neuO.zeiten.map(z => z && z.toFixed(2)).join(' '));
pruefe('ohne Geisterfahrer: 0 Kontakte', neuO.kontakte === 0);
console.log('\n' + ok + ' OK, ' + fehl + ' FEHL'); process.exit(fehl ? 1 : 0);
