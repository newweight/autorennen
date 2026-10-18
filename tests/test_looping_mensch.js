// v31 H1d: node tests/test_looping_mensch.js – Mensch (ohne Computerfahrer) am Looping 1 der Fantasie-Strecke
// a) lenkt 30 m vorher über die Wiese weg → kommt am Looping vorbei wie in v30 (wird nicht ins Band geschoben, fährt nicht hinein)
// b) fährt rechts (q +5,5 / +6) oder mittig geradeaus in den Looping → gleitet aufs Band: max. Querversatz je Schritt ≤ 0,5 m, kein Sturz
// c) dasselbe Wegfahren mit Computerauto-Flag (loopingFuehren): fuehren() setzt aus, solange es vom Band wegfährt
const { ladeModule } = require('./lade');
const R = ladeModule(['src/config.js', 'src/physics/vehicle.js', 'src/cars/carCatalog.js', 'src/track/spline.js', 'src/track/trackCatalog.js',
  'src/track/trackBuilder.js', 'src/track/looping.js', 'src/track/anlauf.js', 'src/race/raceManager.js', 'src/physics/collisions.js', 'src/ai/driver.js']);
let fehler = 0;
function pruefe(name, ok, info) { console.log((ok ? 'OK   ' : 'FEHL ') + name + (info ? '  (' + info + ')' : '')); if (!ok) fehler++; }
const dt = R.config.physik.schritt, LP = R.Looping, strecke = new R.Strecke(R.trackCatalog.find(t => t.id === 'fantasie')), sp = strecke.spline, L = strecke.loopings[0];

/** Auto `vor` m vor der Einfahrt bei Seitenabstand q, Tempo v; steuerung(k, abstand) → { gas, bremse, lenkung }. */
function fahrt(opt) {
  const p = sp.punktBei(L.s - opt.vor), v = new R.Vehicle({}), lp = LP.zustand();
  v.setzen(p.x + p.nx * opt.q, p.z + p.nz * opt.q, R.headingAus(p.tx, p.tz)); v.vLaengs = opt.v;
  if (opt.ki) v.loopingFuehren = true;
  let index = -1, maxQ = 0, maxQLoop = 0, qAlt = null, wAlt = null, ereignisse = [], inLoop = false, maxGerade = 0, qEin = null, qEnde = 0, sEnde = 0, aktivGewesen = false;
  for (let k = 0; k < 60 * 14; k++) {
    const n0 = sp.naechster(v.x, v.z), abst = sp.differenzS(L.s, n0.s);
    const r = LP.fahrzeugSchritt(lp, v, strecke, opt.steuerung(k, abst), dt, index); index = r.index;
    if (r.ereignis) ereignisse.push(r.ereignis);
    if (lp.aktiv) {
      aktivGewesen = true;
      const w = Math.min(lp.winkel, 2 * Math.PI), q = LP.autoQ(L, lp, w);
      if (inLoop && qAlt !== null) maxQLoop = Math.max(maxQLoop, Math.abs(q - qAlt));
      qAlt = q; inLoop = true; if (qEin === null) qEin = lp.qEin;
    } else {
      const n = sp.naechster(v.x, v.z); if (!inLoop && qAlt !== null) maxGerade = Math.max(maxGerade, Math.abs(n.seitenabstand - qAlt));
      if (!inLoop) qAlt = n.seitenabstand; else { inLoop = false; qAlt = null; }
      if (!inLoop && !aktivGewesen) maxGerade = Math.max(maxGerade, 0);
      qEnde = n.seitenabstand; sEnde = sp.differenzS(n.s, L.s);
    }
    if (sEnde > 40 || lp.geschafft || lp.gefallen) { if (!lp.aktiv && !lp.fallen && (lp.geschafft || lp.gefallen || sEnde > 40)) break; }
  }
  return { lp, ereignisse, maxQLoop, maxGerade, aktivGewesen, qEin, qEnde, sEnde, v };
}
const nichts = () => ({ gas: 0.6, bremse: 0, lenkung: 0 });

// ---- b) geradeaus ----
for (const q of [6, 5.5, 4.7, 2, 0, -3]) {
  const e = fahrt({ vor: 45, q, v: 33, steuerung: nichts });
  // Querversatz je Schritt auf der Geraden (reine Fahrphysik, ohne Schub): Seitenabstand ändert sich kaum
  pruefe(`Mensch geradeaus q ${q}: Looping geschafft, kein Sturz, nie geschoben (Gerade ≤ 0,05 m/Schritt), im Looping ≤ 0,5 m/Schritt`,
    e.lp.geschafft === 1 && e.lp.gefallen === 0 && e.maxGerade <= 0.05 && e.maxQLoop <= 0.5,
    `qEin ${e.qEin !== null ? e.qEin.toFixed(2) : '-'}, Gerade ${e.maxGerade.toFixed(3)} m, Looping ${e.maxQLoop.toFixed(3)} m, ${e.ereignisse.join(' → ')}`);
}
// ---- a) 30 m vorher wegfahren (Wiese) ----
for (const ki of [false, true]) {
  const e = fahrt({ vor: 70, q: 2, v: 32, ki, steuerung: (k, abst) => ({ gas: 0.6, bremse: 0, lenkung: abst < 30 ? 1 : 0 }) });
  pruefe(`Mensch${ki ? ' (mit Computerauto-Flag: fuehren() setzt beim Wegfahren aus)' : ''} lenkt 30 m vorher über die Wiese weg → fährt am Looping vorbei (kein Looping, Seitenabstand > 7 m)`,
    !e.aktivGewesen && e.qEnde > strecke.breite / 2, `Looping ${e.aktivGewesen ? 'JA' : 'nein'}, Seitenabstand ${e.qEnde.toFixed(1)} m bei s+${e.sEnde.toFixed(0)}`);
}
console.log(fehler ? '\n' + fehler + ' FEHLER' : '\nALLE OK');
process.exit(fehler ? 1 : 0);
