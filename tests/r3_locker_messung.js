// R3-LOCKER – Messung: KI-Tricks je Stufe/Art und Fehltrick-Quote (abgekürzt) über viele Flüge, deterministisch.
// Aufruf: node tests/r3_locker_messung.js [zusatz] [auto|moto|beide]   (zusatz überschreibt ki.zusatz nur für diese Messung)
'use strict';
const { Simulation, laden, ladenMoto } = require('../server/simulation');
const zus = process.argv[2] !== undefined && process.argv[2] !== '-' ? parseFloat(process.argv[2]) : null;
const welche = process.argv[3] || 'beide';
const STUFEN = (process.env.STUFEN || 'leicht,mittel,schwer,profi,unschlagbar').split(',');
const SEKUNDEN = parseInt(process.env.SEK || '100', 10);
function autopilot(C, st, v, idx) {
  const n = st.abfrage(v.x, v.z, idx), sp = st.spline, vl = Math.max(3, v.vLaengs), L = Math.max(9, Math.min(50, 0.55 * vl + 8));
  const ziel = sp.punktBei(n.s + L);
  let diff = C.headingAus(ziel.x - v.x, ziel.z - v.z) - v.heading;
  while (diff > Math.PI) diff -= 2 * Math.PI; while (diff < -Math.PI) diff += 2 * Math.PI;
  const lenkung = Math.max(-1, Math.min(1, -(2 * vl * Math.sin(diff) / Math.hypot(ziel.x - v.x, ziel.z - v.z)) / v.drehrateMax(vl)));
  const soll = st.tempoBei(n.s + vl * 0.3) * 0.85;
  return { s: { gas: v.vLaengs < soll ? 1 : 0, bremse: v.vLaengs > soll + 3 ? 0.5 : 0, lenkung }, idx: n.index };
}
function lauf(moto, einst, stufe) {
  const sim = new Simulation({ moto, einstellungen: Object.assign({ gegner: 4, schwierigkeit: stufe, tricks: true }, einst), spieler: [{ fahrer: 'S0', auto: moto ? 'superbike' : 'porsche-911', hilfe: 'aus' }], seed: 5 });
  if (zus !== null) sim.R.config.spass.tricks.ki.zusatz = zus;
  const idx = {}; let schlimm = 0; const vorT = {}, log = [];
  for (let n = 0; n < 60 * SEKUNDEN && !sim.fertig; n++) {
    const f = sim.sim.fahrzeuge[0], a = autopilot(sim.R, sim.sim.strecke, f.vehicle, idx[0] === undefined ? -1 : idx[0]); idx[0] = a.idx;
    sim.eingabeSetzen(0, a.s); sim.trickSetzen(0, false); sim.schritt(); sim.abholen();
    const T0 = sim.sim._t3;
    if (T0) for (let i = 1; i < sim.sim.fahrzeuge.length; i++) { const z = T0.fz[i]; if (z && z.trick && z.trick !== vorT[i]) { log.push({ art: z.trick.art, rest: z.trick.rest, abg: z.trick.abgekuerzt, fehl: !!z.trick.verpatzt }); } vorT[i] = z ? z.trick : null; }
    // Schlimmes bei KI: Sturz/Unfall/Hänger im Flug
    for (let i = 1; i < sim.sim.fahrzeuge.length; i++) { const g = sim.sim.fahrzeuge[i]; if (g.vehicle && !isFinite(g.vehicle.x + g.vehicle.z + g.vehicle.vLaengs)) schlimm++; }
  }
  const r = { fluege: 0, sup: 0, hand: 0, back: 0, fass: 0, schr: 0, abg: 0, fehl: 0, stuerze: 0, langeLuft: 0 };
  const T = sim.sim._t3;
  sim.sim.fahrzeuge.forEach((f, i) => {
    if (i === 0) return;
    r.fluege += f.flug.fluege;
    const z = T && T.fz[i]; if (z) { r.sup += z.stat.superman; r.hand += z.stat.handstand; r.back += z.stat.backflip; r.fass += z.stat.fassrolle; r.schr += z.stat.schraube; r.abg += z.stat.abgekuerzt; r.fehl += z.stat.verpatzt; }
    if (f.unfall && (f.unfall.aktiv || f.unfall.zaehler)) r.stuerze += f.unfall.zaehler || 1;
  });
  r.log = log; r.tricks = r.sup + r.hand + r.back + r.fass + r.schr + r.fehl; r.schlimm = schlimm;
  return r;
}
const faelle = [];
if (welche !== 'auto') faelle.push(['Moto', true, [['wiese', { streckeId: 'wiese', spass: true }], ['wald', { streckeId: 'wald', spass: true }], ['alpen', { streckeId: 'alpen', spass: true }], ['stuntpark', { streckeId: 'stuntpark' }]]]);
if (welche !== 'moto') faelle.push(['Auto', false, [['wiese', { streckeId: 'wiese', spass: true }], ['wald', { streckeId: 'wald', spass: true }], ['alpen', { streckeId: 'alpen', spass: true }]]]);
const pct = (a, b) => (b ? (100 * a / b).toFixed(1) : '-') + '%';
console.log('zusatz =', zus === null ? '(Standard aus Datei)' : zus, ' Sekunden/Lauf', SEKUNDEN);
for (const [name, moto, strecken] of faelle) {
  for (const stufe of STUFEN) {
    const s = { fluege: 0, sup: 0, hand: 0, back: 0, fass: 0, schr: 0, abg: 0, fehl: 0, tricks: 0, schlimm: 0, stuerze: 0 };
    const teil = []; const alle = [];
    for (const [sn, einst] of strecken) { const r = lauf(moto, einst, stufe); for (const k in s) s[k] += r[k]; alle.push(...r.log); teil.push(sn + ':' + r.tricks + '/' + r.fluege); }
    console.log(name.padEnd(5), stufe.padEnd(11), 'Flüge', String(s.fluege).padStart(4), 'Tricks', String(s.tricks).padStart(3), '(' + pct(s.tricks, s.fluege) + ')',
      moto ? 'Sup ' + s.sup + ' Hand ' + s.hand + ' Back ' + s.back : 'Fass ' + s.fass + ' Schr ' + s.schr, ' hastig', s.abg, '(' + pct(s.abg, s.tricks) + ')', ' FEHLTRICK', s.fehl, '(' + pct(s.fehl, s.tricks) + ')', ' NaN', s.schlimm, ' [' + teil.join(' ') + ']');
    if (process.env.DUMP) require('fs').appendFileSync(process.env.DUMP, JSON.stringify({ name, stufe, alle }) + '\n');
    if (process.env.VERTEILUNG) { const K = (moto ? ladenMoto : laden)().config.spass.tricks; const z = [0.3, 0, -0.1, -0.2, -0.3, -0.4, -0.5]; console.log('      erlaubt/fehl-Anteil nach zusatz:', z.map((q) => { const ok = alle.filter((x) => x.rest >= K.zeit[x.art].dauer + K.reserve + q), f = ok.filter((x) => x.rest < K.zeit[x.art].dauer + K.reserve); return q + ': ' + ok.length + '/' + alle.length + ' fehl ' + f.length + ' (' + pct(f.length, ok.length) + ')'; }).join(' | ')); }
  }
}
