// Node-Test der Fahrphysik: node tests/test_physik.js
const { ladeModule } = require('./lade');
const R = ladeModule(['src/config.js', 'src/physics/vehicle.js']);
const dt = R.config.physik.schritt;
let fehler = 0;
function pruefe(name, ok, info) { console.log((ok ? 'OK   ' : 'FEHL ') + name + (info ? '  (' + info + ')' : '')); if (!ok) fehler++; }

// 1) 0 -> 100 km/h Zeit
{
  const v = new R.Vehicle({});
  let t = 0;
  while (v.vLaengs * 3.6 < 100 && t < 30) { v.schritt(dt, { gas: 1, bremse: 0, lenkung: 0 }); t += dt; }
  pruefe('0-100 km/h zwischen 4 und 9 s', t > 4 && t < 9, t.toFixed(2) + ' s');
}
// 2) Höchsttempo wird erreicht und nicht überschritten
{
  const v = new R.Vehicle({ vMax: 42 });
  for (let i = 0; i < 60 * 40; i++) v.schritt(dt, { gas: 1, bremse: 0, lenkung: 0 });
  pruefe('Höchsttempo ~vMax', v.vLaengs > 36 && v.vLaengs <= 42.01, v.vLaengs.toFixed(1) + ' m/s');
}
// 3) Bremsen bis Stillstand, kein Rückwärtsrollen beim Bremsen
{
  const v = new R.Vehicle({});
  for (let i = 0; i < 60 * 10; i++) v.schritt(dt, { gas: 1, bremse: 0, lenkung: 0 });
  let t = 0;
  while (v.vLaengs > 0 && t < 20) { v.schritt(dt, { gas: 0, bremse: 1, lenkung: 0 }); t += dt; }
  pruefe('Bremsen 100+ -> 0 in < 4 s', t < 4, t.toFixed(2) + ' s');
  for (let i = 0; i < 30; i++) v.schritt(dt, { gas: 0, bremse: 1, lenkung: 0 });
  pruefe('Rückwärts mit Bremse-Taste', v.vLaengs < 0, v.vLaengs.toFixed(2));
}
// 4) Drehrate bei mittlerem Tempo (20 m/s): 1.0 .. 1.8 rad/s
{
  const v = new R.Vehicle({});
  v.vLaengs = 20;
  for (let i = 0; i < 60; i++) v.schritt(dt, { gas: 1, bremse: 0, lenkung: -1 }); // Lenkung einschwingen
  const h0 = v.heading;
  for (let i = 0; i < 60; i++) v.schritt(dt, { gas: 1, bremse: 0, lenkung: -1 });
  const rate = (v.heading - h0);
  pruefe('Drehrate links bei ~20 m/s', rate > 1.0 && rate < 1.8, rate.toFixed(2) + ' rad/s');
  pruefe('Links = Heading nimmt zu, x wird negativ', v.x < 0, 'x=' + v.x.toFixed(1));
}
// 5) Im Stand kein Drehen
{
  const v = new R.Vehicle({});
  for (let i = 0; i < 60; i++) v.schritt(dt, { gas: 0, bremse: 0, lenkung: 1 });
  pruefe('Kein Drehen im Stand', Math.abs(v.heading) < 1e-6);
}
// 6) Gras bremst deutlich
{
  const a = new R.Vehicle({}), b = new R.Vehicle({}); b.untergrund = 'gras';
  for (let i = 0; i < 60 * 15; i++) { a.schritt(dt, { gas: 1, bremse: 0, lenkung: 0 }); b.schritt(dt, { gas: 1, bremse: 0, lenkung: 0 }); }
  pruefe('Gras langsamer als Straße', b.vLaengs < a.vLaengs * 0.8, a.vLaengs.toFixed(1) + ' vs ' + b.vLaengs.toFixed(1));
}
// 7) Determinismus
{
  const a = new R.Vehicle({}), b = new R.Vehicle({});
  for (let i = 0; i < 600; i++) { const s = { gas: 1, bremse: 0, lenkung: Math.sin(i / 30) }; a.schritt(dt, s); b.schritt(dt, s); }
  pruefe('Deterministisch', a.x === b.x && a.z === b.z && a.heading === b.heading);
}
// 8) Quer-Vektor zeigt nach rechts (Heading 0 = Blick -z, rechts = +x)
{
  const v = new R.Vehicle({});
  const q0 = v.rechts();
  v.heading = Math.PI / 2;    // nach links gedreht → Blick -x, rechts = -z
  const q1 = v.rechts();
  pruefe('rechts() bei Heading 0 = +x', Math.abs(q0.x - 1) < 1e-9 && Math.abs(q0.z) < 1e-9);
  pruefe('rechts() bei Heading 90° links = -z', Math.abs(q1.x) < 1e-9 && Math.abs(q1.z + 1) < 1e-9);
  v.heading = 0; v.vQuer = 2;
  v.schritt(dt, { gas: 0, bremse: 0, lenkung: 0 });
  pruefe('vQuer > 0 bewegt nach rechts (+x)', v.x > 0, 'x=' + v.x.toFixed(3));
}
// 9) Linkskurve bei wenig Grip → Auto rutscht nach außen = rechts (vQuer > 0), Rechtskurve umgekehrt
{
  const l = new R.Vehicle({ grip: 0.5 }), r = new R.Vehicle({ grip: 0.5 });
  l.untergrund = r.untergrund = 'gras';
  l.vLaengs = r.vLaengs = 18;
  let minL = 0, maxR = 0;
  for (let i = 0; i < 60; i++) {
    l.schritt(dt, { gas: 1, bremse: 0, lenkung: -1 }); r.schritt(dt, { gas: 1, bremse: 0, lenkung: 1 });
    minL = Math.min(minL, l.vQuer); maxR = Math.max(maxR, r.vQuer);
  }
  pruefe('Linkskurve: Drift nach rechts (außen)', l.vQuer > 0.2 && minL >= 0, 'vQuer=' + l.vQuer.toFixed(2));
  pruefe('Rechtskurve: Drift nach links (außen)', r.vQuer < -0.2 && maxR <= 0, 'vQuer=' + r.vQuer.toFixed(2));
}
// 10) Nicken: Bremsen senkt den Bug, Anfahren hebt ihn (nur Optik)
{
  const v = new R.Vehicle({});
  for (let i = 0; i < 30; i++) v.schritt(dt, { gas: 1, bremse: 0, lenkung: 0 });
  const anfahren = v.nicken;
  for (let i = 0; i < 300; i++) v.schritt(dt, { gas: 1, bremse: 0, lenkung: 0 });
  for (let i = 0; i < 20; i++) v.schritt(dt, { gas: 0, bremse: 1, lenkung: 0 });
  pruefe('Nicken: Anfahren > 0, Bremsen < 0', anfahren > 0 && v.nicken < 0, anfahren.toFixed(3) + ' / ' + v.nicken.toFixed(3));
}
// 11) Lenk-Totzone: winzige Eingabe dreht nicht
{
  const v = new R.Vehicle({}); v.vLaengs = 20;
  for (let i = 0; i < 60; i++) v.schritt(dt, { gas: 1, bremse: 0, lenkung: 0.03 });
  pruefe('Totzone: Lenkung 0.03 wirkt nicht', v.heading === 0 && v.lenkung === 0);
}
console.log(fehler === 0 ? '\nALLE TESTS OK' : '\n' + fehler + ' FEHLER');
process.exit(fehler ? 1 : 0);
