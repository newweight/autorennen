// Regressionstest P4 F1: "Letzter fliegt raus" + Pickups-Welt. Ausgeschiedenes (geparktes, x=100000) Auto darf keine
// Spline-Gesamtsuche auslösen (vorher ~3 s je Physikschritt). Aufruf: node tests/test_elimination_pickups.js
const { Simulation } = require('../server/simulation.js');
const ms = (t0) => Number(process.hrtime.bigint() - t0) / 1e6;
let fehler = 0;
function pruefe(name, ok, info) { console.log((ok ? 'OK   ' : 'FEHL ') + name + (info ? '  (' + info + ')' : '')); if (!ok) fehler++; }
function neu(streckeId, welt, extra) {
  const e = Object.assign({ streckeId, gegner: 3, runden: 3 }, extra || {}); if (welt) e.welt = welt;
  return new Simulation({ einstellungen: e, spieler: [{ fahrer: 'Jonas', auto: 'passat' }], seed: 1 });
}
function raus(sim, nr) { const S = sim.sim; S.rennen.teilnehmer[nr].ausgeschieden = true; S._ausgeschieden(S.rennen.teilnehmer[nr]); }
const GRENZE = 20;
for (const [s, w] of [['wiese', 'verrueckt'], ['wueste', 'alles'], ['wiese', 'klassisch'], ['wueste', 'verrueckt'], ['wiese', 'alles']]) {
  const sim = neu(s, w);
  for (let k = 0; k < 300; k++) sim.schritt();
  raus(sim, 2);
  let max = 0; for (let k = 0; k < 5; k++) { const t0 = process.hrtime.bigint(); sim.schritt(); max = Math.max(max, ms(t0)); }
  pruefe(`${s}/${w}: Schritt nach Ausscheiden < ${GRENZE} ms`, max < GRENZE, max.toFixed(1) + ' ms max');
  raus(sim, 1);
  let max2 = 0; for (let k = 0; k < 5; k++) { const t0 = process.hrtime.bigint(); sim.schritt(); max2 = Math.max(max2, ms(t0)); }
  pruefe(`${s}/${w}: auch nach 2. Ausscheiden < ${GRENZE} ms`, max2 < GRENZE, max2.toFixed(1) + ' ms max');
}
// Polizei + Elimination: Ziel darf kein ausgeschiedenes Auto sein, Schritt bleibt schnell
for (const [s, w] of [['wiese', 'verrueckt'], ['wueste', 'alles']]) {
  const sim = neu(s, w, { polizei: true });
  const S = sim.sim;
  if (!S.polizei) { pruefe(`${s}/${w}: Polizei aktiv`, false); continue; }
  for (let k = 0; k < 600; k++) sim.schritt();
  raus(sim, 2); raus(sim, 1);
  let max = 0, bad = 0;
  for (let k = 0; k < 900; k++) {
    const t0 = process.hrtime.bigint(); sim.schritt(); max = Math.max(max, ms(t0));
    for (const st of S.polizei.logik.streifen) if (st && st.ziel >= 0 && S.rennen.teilnehmer[st.ziel] && S.rennen.teilnehmer[st.ziel].ausgeschieden) bad++;
  }
  pruefe(`${s}/${w} Polizei+Elimination: Ziel nie ausgeschieden`, bad === 0, bad + ' Verstöße');
  pruefe(`${s}/${w} Polizei+Elimination: Schritt < ${GRENZE} ms`, max < GRENZE, max.toFixed(1) + ' ms max');
}
console.log(fehler ? `\n${fehler} FEHLER` : '\nALLE TESTS OK');
process.exit(fehler ? 1 : 0);
