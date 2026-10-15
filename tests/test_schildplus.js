// 14.10. (v22) Zweite Schild-Kugel bei vorhandenem Schild: node tests/test_schildplus.js
// Pickups: Auto MIT Schild fährt durch eine Kugel → Schild bleibt, Kugel weg (Respawn 10 s), Ereignis 'schildPlus' (kein 'schild', kein neuer Zähler);
// Schaden.heilen(i, 10): +10 Prozentpunkte, max. 100 %, nicht bei Schaden aus / liegengeblieben / Reparatur; Stufe/Faktoren ziehen nach.
const { ladeModule } = require('./lade');
const R = ladeModule(['src/config.js', 'src/physics/vehicle.js', 'src/physics/schaden.js', 'src/track/spline.js', 'src/track/trackCatalog.js',
  'src/track/trackBuilder.js', 'src/world/pickups.js', 'src/physics/collisions.js']);
let fehler = 0;
function pruefe(name, ok, info) { console.log((ok ? 'OK   ' : 'FEHL ') + name + (info ? '  (' + info + ')' : '')); if (!ok) fehler++; }
const dt = R.config.physik.schritt, CS = R.config.stunt.schild;
const strecke = new R.Strecke(R.trackCatalog.find(t => t.id === 'wiese'), { welt: 'verrueckt' });
const ws = strecke.spline;
const bei = (s0, q, v0) => { const p = ws.punktBei(s0), v = new R.Vehicle({}); v.setzen(p.x + p.nx * q, p.z + p.nz * q, R.headingAus(p.tx, p.tz)); v.vLaengs = v0; return v; };

// ---- Pickups ----
{
  const pk = new R.Pickups(strecke), K = pk.kugeln[0], K1 = pk.kugeln[1];
  const v = bei(K.s - 15, K.q, 20);
  let ev = [];
  for (let k = 0; k < 60; k++) { v.schritt(dt, { gas: 0 }); ev = ev.concat(pk.schritt(dt, [v])); }
  pruefe('erste Kugel: Ereignis schild, Schild da', ev.length === 1 && ev[0].typ === 'schild' && pk.hatSchild(0) && pk.autos[0].schilde === 1, JSON.stringify(ev));
  // zweite Kugel mit vorhandenem Schild
  const v2 = bei(K1.s - 15, K1.q, 20);
  v2.x += 0; ev = [];
  const alt = pk.autos[0];
  alt.schild = true;
  for (let k = 0; k < 60; k++) { v2.schritt(dt, { gas: 0 }); ev = ev.concat(pk.schritt(dt, [v2])); }
  pruefe('zweite Kugel mit Schild: genau 1 Ereignis schildPlus (kein schild)', ev.length === 1 && ev[0].typ === 'schildPlus' && ev[0].nr === 0, JSON.stringify(ev));
  pruefe('alter Schild bleibt, Zähler schilde unverändert (1), schildPlus-Zähler 1', pk.hatSchild(0) && pk.autos[0].schilde === 1 && pk.autos[0].schildPlus === 1);
  pruefe('Kugel ist weg (da = false) und kommt nach wiederDa wieder', K1.da === false);
  let t = 0; const weit = bei(K1.s + 200, K1.q, 0);
  while (!K1.da && t < 20) { pk.schritt(dt, [weit]); t += dt; }
  pruefe('Kugel erscheint nach ' + CS.wiederDa + ' s wieder', K1.da && Math.abs(t - CS.wiederDa) < 1, t.toFixed(2));
  // ohne Schild: alte Wirkung
  const pk2 = new R.Pickups(strecke), v3 = bei(pk2.kugeln[0].s - 15, pk2.kugeln[0].q, 20);
  let ev2 = [];
  for (let k = 0; k < 60; k++) { v3.schritt(dt, { gas: 0 }); ev2 = ev2.concat(pk2.schritt(dt, [v3])); }
  pruefe('ohne Schild wie bisher: schild', ev2.length === 1 && ev2[0].typ === 'schild' && !pk2.autos[0].schildPlus);
  // Schild verbrauchen danach: genau 1 Treffer gefangen
  pruefe('danach fängt der (alte) Schild genau einen Treffer ab', pk.schildVerbrauchen(0) === true && pk.schildVerbrauchen(0) === false);
}

// ---- Schaden.heilen ----
{
  const mk = (an) => { const autos = [{ vehicle: new R.Vehicle({}) }]; return { autos, s: new R.Schaden(autos, { an }) }; };
  const { s } = mk(true);
  s._punkteSetzen(0, 55);
  const ev = []; s.bei((e) => ev.push(e.art));
  pruefe('heilen(0, 10): 55 % → 65 %', s.heilen(0, 10) === 10 && s.zustand(0).prozent === 65, s.zustand(0).prozent);
  s._punkteSetzen(0, 95);
  pruefe('95 % + 10 → 100 % (max), geheilt 5', s.heilen(0, 10) === 5 && s.zustand(0).prozent === 100);
  pruefe('bei 100 % nichts (0)', s.heilen(0, 10) === 0 && s.zustand(0).prozent === 100);
  pruefe('Ereignis „heilen“ gemeldet', ev.includes('heilen'));
  s._punkteSetzen(0, 41);
  const stufeVor = s.zustand(0).stufe; s.heilen(0, 10);
  pruefe('Stufe zieht nach (41 % Stufe 2 → 51 % Stufe 2/ 60: Stufe ≤ vorher)', s.zustand(0).stufe <= stufeVor, stufeVor + ' → ' + s.zustand(0).stufe);
  s._punkteSetzen(0, 55); s._punkteSetzen(0, 69); s.heilen(0, 10);
  pruefe('69 → 79 % : Stufe 1 (80 % Grenze) / 79 ⇒ Stufe 2 oder 1 konsistent mit stufeAus', s.zustand(0).stufe === R.Schaden.stufeAus(79));
  const aus = mk(false).s; 
  pruefe('Schaden aus: heilen → 0', aus.heilen(0, 10) === 0);
  const lb = mk(true).s; lb._punkteSetzen(0, 40); lb.z[0].liegengeblieben = true;
  pruefe('liegengeblieben: heilen → 0 (keine Heilung während des Wartens)', lb.heilen(0, 10) === 0 && lb.zustand(0).prozent === 40);
  const rp = mk(true).s; rp._punkteSetzen(0, 40); rp.z[0].rep = true;
  pruefe('in Abschlepp-Reparatur: heilen → 0', rp.heilen(0, 10) === 0);
  const kein = mk(true).s; kein._punkteSetzen(0, 50);
  pruefe('negativer Wert heilt nicht', kein.heilen(0, -5) === 0 && kein.zustand(0).prozent === 50);
}
console.log(fehler ? '\n' + fehler + ' FEHLER' : '\nALLE TESTS OK');
process.exit(fehler ? 1 : 0);
