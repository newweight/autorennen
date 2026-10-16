// v27 F5b: node tests/messung_ki_gegen.js [alt.js] – Rechenzeit je Schritt, 6 KI (5 + Autopilot), 2000 Schritte, ohne/mit Geisterfahrern
// KI_FAHRER=<Pfad> ersetzt src/ai/driver.js (Vergleich mit Sicherung)
'use strict';
const path = require('path'), fs = require('fs');
if (process.env.KI_FAHRER) {
  const orig = fs.readFileSync, alt = path.resolve(process.env.KI_FAHRER);
  fs.readFileSync = function (p, ...r) { return (typeof p === 'string' && /src[\\/]ai[\\/]driver\.js$/.test(p)) ? orig.call(fs, alt, ...r) : orig.call(fs, p, ...r); };
}
const { Simulation } = require('../server/simulation.js');
const mess = (geister) => {
  const sim = new Simulation({ einstellungen: { streckeId: 'wiese', gegner: 5, runden: 50, geisterfahrer: geister, verkehr: process.env.KI_VERKEHR || 'aus', polizei: !!process.env.KI_VERKEHR, kollisionen: true, schwierigkeit: 'mittel' }, spieler: [{ fahrer: 'Jonas', auto: 'passat' }], seed: 1 });
  const S = sim.sim, R = sim.R, f0 = S.fahrzeuge[0];
  f0.autopilot = new R.Driver(f0.vehicle, S.strecke, { schwierigkeit: 'mittel', seed: 7000 });
  let tk = 0n; const st = R.Driver.prototype.steuerung;   // Zeit nur im Fahrer (steuerung)
  R.Driver.prototype.steuerung = function (...a) { const t = process.hrtime.bigint(); const r = st.apply(this, a); tk += process.hrtime.bigint() - t; return r; };
  for (let i = 0; i < 300; i++) sim.schritt();    // Warmlaufen
  tk = 0n;
  const t0 = process.hrtime.bigint();
  for (let i = 0; i < 2000; i++) sim.schritt();
  const gesamt = Number(process.hrtime.bigint() - t0) / 1e6 / 2000;
  R.Driver.prototype.steuerung = st;
  return Number(tk) / 1e6 / 2000;   // ms/Schritt im Fahrer 
};
const res = {};
for (const g of [false, true]) { const m = []; for (let k = 0; k < 3; k++) m.push(mess(g)); res[g ? 'mit' : 'ohne'] = Math.min(...m).toFixed(3) + ' ms/Schritt'; }
console.log(JSON.stringify(res));
