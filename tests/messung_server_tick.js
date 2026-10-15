// Server-Tick-Kosten (Hypothese c): Simulation direkt (ohne Netz), 2 Menschen + 5 KI, je Strecke/Variante.
// node tests/messung_server_tick.js [sekunden=40]   – misst sim.schritt(), zustand()+ich()+JSON je 3. Tick (p50/p99/max in ms)
'use strict';
const { Simulation } = require('../server/simulation');
const sek = +(process.argv[2] || 40);
const faelle = [['wiese', '', ''], ['wald', 'hindernisse', ''], ['wueste', 'stunt', 'xl'], ['fantasie', 'alles', 'xl'], ['dino', 'alles', ''], ['alpen', 'alles', 'xl'], ['mega', '', ''], ['wiese', 'alles', 'xl']];
const pk = (a, p) => { const s = a.slice().sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(s.length * p))]; };
const nur = process.argv[3];
for (const [id, welt, variante] of faelle) {
  if (nur && nur !== id) continue;
  const t00 = Date.now();
  const sim = new Simulation({ einstellungen: { streckeId: id, welt, variante, runden: 3, gegner: 5, polizei: true, kollisionen: true, hindernisMenge: 'viele' },
    spieler: [{ fahrer: 'Jonas', auto: 'porsche-911', hilfe: 'wenig' }, { fahrer: 'Emmy', auto: 'passat', hilfe: 'wenig' }], seed: 7 });
  const bau = Date.now() - t00;
  const tS = [], tZ = [];
  for (let n = 0; n < 60 * sek; n++) {
    sim.eingabeSetzen(0, { gas: 1, bremse: 0, lenkung: Math.sin(n / 90) * 0.3 }); sim.eingabeSetzen(1, { gas: 1, bremse: 0, lenkung: Math.cos(n / 70) * 0.3 });
    const a = process.hrtime.bigint(); sim.schritt(); sim.abholen(); const b = process.hrtime.bigint();
    tS.push(Number(b - a) / 1e6);
    if (sim.tick % 3 === 0) {
      const c = process.hrtime.bigint();
      const g = JSON.stringify(sim.zustand()); const k = g.slice(0, -1);
      const s0 = k + ',"ich":' + JSON.stringify(sim.ich(0)) + '}', s1 = k + ',"ich":' + JSON.stringify(sim.ich(1)) + '}';
      const d = process.hrtime.bigint(); tZ.push(Number(d - c) / 1e6);
      if (n === 60) var bytes = s0.length;
    }
    if (sim.fertig) break;
  }
  const f = (x) => x.toFixed(2).padStart(6);
  console.log(`${id.padEnd(8)} ${(welt || '-').padEnd(11)} ${(variante || '-').padEnd(3)} bau ${String(bau).padStart(5)} ms | schritt p50 ${f(pk(tS, .5))} p99 ${f(pk(tS, .99))} max ${f(Math.max(...tS))} ms | zustand+json p50 ${f(pk(tZ, .5))} p99 ${f(pk(tZ, .99))} max ${f(Math.max(...tZ))} | ${bytes} B/Zustand`);
}
