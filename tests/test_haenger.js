// Hänger-Test (15.10. v26b): Server-Simulation (Node) in allen Kombinationen Strecke × Tageszeit × Wetter × Verkehr × Schaden × XL × Auto
// mit hartem Zeitlimit je Aufbau und je 10 s Simulation (600 Schritte). Läuft als Kindprozess mit Timeout → echte Endlosschleife wird erkannt.
// Aufruf: node tests/test_haenger.js            (Hauptprozess startet je Kombination einen Kindprozess)
const { spawnSync } = require('child_process');
if (process.argv[2] === '--eine') {
  const k = JSON.parse(process.argv[3]);
  const { Simulation } = require('../server/simulation');
  const t0 = Date.now();
  const sim = new Simulation({ einstellungen: k, spieler: [{ fahrer: 'Jonas', auto: 'troc-cabrio' }, { fahrer: 'Emmy', auto: 'multivan' }].slice(0, k.zwei ? 2 : 1), seed: 99 });
  const tAufbau = Date.now() - t0;
  const t1 = Date.now();
  for (let n = 0; n < 600; n++) { sim.ich(0); sim.schritt(); sim.abholen && sim.abholen(); }
  console.log(JSON.stringify({ aufbau: tAufbau, sim10s: Date.now() - t1 }));
  process.exit(0);
}
const strecken = ['wiese', 'wald', 'wueste', 'fantasie', 'dino', 'alpen'];
const LIMIT_MS = 30000;      // Aufbau + 10 s Simulation: weit unter „Seite reagiert nicht“
let n = 0, fehl = 0, maxAufbau = 0, maxSim = 0;
for (const streckeId of strecken) for (const tageszeit of ['nacht', 'daemmerung']) for (const [verkehr, geisterfahrer] of [['aus', false], ['wenig', false], ['viel', true]])
  for (const schaden of [false, true]) for (const variante of ['', 'xl']) for (const zwei of [false, true]) {
    const k = { streckeId, tageszeit, wetter: 'regen', jahreszeit: 'sommer', verkehr, geisterfahrer, schaden, variante, runden: 3, gegner: zwei ? 7 : 8, polizei: schaden, zwei };
    const r = spawnSync(process.execPath, [__filename, '--eine', JSON.stringify(k)], { timeout: LIMIT_MS, encoding: 'utf8' });
    n++;
    let ok = r.status === 0, info = '';
    if (ok) { try { const d = JSON.parse(r.stdout.trim().split('\n').pop()); maxAufbau = Math.max(maxAufbau, d.aufbau); maxSim = Math.max(maxSim, d.sim10s); info = r.stdout.trim(); if (d.aufbau + d.sim10s > LIMIT_MS) ok = false; } catch (e) { ok = false; } }
    if (!ok) { fehl++; console.log('FEHL', JSON.stringify(k), r.error ? String(r.error.code) : '', (r.stderr || '').split('\n').slice(0, 4).join(' | '), info); }
  }
console.log(`${n} Kombinationen, ${fehl} Fehler, max Aufbau ${maxAufbau} ms, max 10 s Simulation ${maxSim} ms`);
process.exit(fehl ? 1 : 0);
