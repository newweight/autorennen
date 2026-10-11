// Node-Test der Fahrphysik: node tests/test_physik.js
const { ladeModule } = require('./lade');
const R = ladeModule(['src/config.js', 'src/physics/vehicle.js']);
const dt = R.config.physik.schritt;
let fehler = 0;
function pruefe(name, ok, info) { console.log((ok ? 'OK   ' : 'FEHL ') + name + (info ? '  (' + info + ')' : '')); if (!ok) fehler++; }

// Runde 3: Standard-Auto = Mittelklasse 240 km/h (66,7 m/s). Kurven sind jetzt durch die
// Querhaftung begrenzt (config.physik.querGrip), darum neue Erwartungswerte (Begründung je Test).
const P = R.config.physik;
const gerade = { gas: 1, bremse: 0, lenkung: 0 };

// 1) 0 -> 100 km/h Zeit (Mittelklasse soll sich flott, aber nicht wie ein Sportwagen anfühlen)
{
  const v = new R.Vehicle({});
  let t = 0, t200 = null;
  while (v.vLaengs * 3.6 < 100 && t < 30) { v.schritt(dt, gerade); t += dt; }
  const t100 = t;
  while (v.vLaengs * 3.6 < 200 && t < 60) { v.schritt(dt, gerade); t += dt; }
  t200 = t - t100;
  pruefe('0-100 km/h zwischen 4 und 9 s', t100 > 4 && t100 < 9, t100.toFixed(2) + ' s');
  pruefe('100-200 km/h zwischen 6 und 14 s', t200 > 6 && t200 < 14, t200.toFixed(2) + ' s');
}
// 2) Höchsttempo wird erreicht und nicht überschritten (Netto-Kraft bei vMax > 0 → wird sicher erreicht)
{
  const v = new R.Vehicle({ vMax: 75, beschleunigung: 7.4 });
  for (let i = 0; i < 60 * 40; i++) v.schritt(dt, gerade);
  pruefe('Höchsttempo ~vMax (270 km/h)', v.vLaengs > 75 * 0.98 && v.vLaengs <= 75.0001, (v.vLaengs * 3.6).toFixed(1) + ' km/h');
}
// 3) Bremsen bis Stillstand, kein Rückwärtsrollen beim Bremsen; 200 → 0 deutlich unter 6 s
{
  const v = new R.Vehicle({});
  v.vLaengs = 200 / 3.6;
  let t = 0;
  while (v.vLaengs > 0 && t < 20) { v.schritt(dt, { gas: 0, bremse: 1, lenkung: 0 }); t += dt; }
  pruefe('Bremsen 200 -> 0 km/h in < 6 s', t < 6, t.toFixed(2) + ' s');
  for (let i = 0; i < 30; i++) v.schritt(dt, { gas: 0, bremse: 1, lenkung: 0 });
  pruefe('Rückwärts mit Bremse-Taste', v.vLaengs < 0, v.vLaengs.toFixed(2));
}
// 4) Drehrate bei mittlerem Tempo (20 m/s): jetzt 0,7 .. 1,1 rad/s (früher 1,0 .. 1,8).
//    Begründung: Querhaftung 16 × 0,9 × (1 + 20/110) ≈ 17 m/s² → 0,85 rad/s. Mehr wäre bei 250 km/h
//    unfahrbar; 0,72 rad/s reichen für die Haarnadel (25 m) mit 65 km/h (Test 4c).
function drehrate(vehicle, tempo) {
  vehicle.vLaengs = tempo;
  for (let i = 0; i < 60; i++) { vehicle.schritt(dt, { gas: 1, bremse: 0, lenkung: -1 }); vehicle.vLaengs = tempo; }
  const h0 = vehicle.heading;
  for (let i = 0; i < 60; i++) { vehicle.schritt(dt, { gas: 1, bremse: 0, lenkung: -1 }); vehicle.vLaengs = tempo; }
  return vehicle.heading - h0;
}
{
  const v = new R.Vehicle({});
  const rate = drehrate(v, 20);
  pruefe('Drehrate links bei ~20 m/s: 0,7 .. 1,1 rad/s', rate > 0.7 && rate < 1.1, rate.toFixed(2) + ' rad/s');
  pruefe('Links = Heading nimmt zu, x wird negativ', v.x < 0, 'x=' + v.x.toFixed(1));
}
// 4b) Bei Höchsttempo deutlich träger (stabil): < 0,45 rad/s und < 50 % der Rate bei 20 m/s
{
  const r20 = drehrate(new R.Vehicle({}), 20), rMax = drehrate(new R.Vehicle({}), 240 / 3.6);
  pruefe('Drehrate bei vMax < 0,45 rad/s und < 50 % von 20 m/s', rMax < 0.45 && rMax < 0.5 * r20,
    rMax.toFixed(2) + ' vs ' + r20.toFixed(2) + ' rad/s');
}
// 4c) Haarnadel (Radius 25 m) mit 65 km/h fahrbar: Volleinschlag ergibt einen Kreis < 25 m
{
  const v = new R.Vehicle({});
  const tempo = 65 / 3.6, rate = drehrate(v, tempo);
  pruefe('Haarnadel: Kreisradius bei 65 km/h < 25 m', tempo / rate < 25, (tempo / rate).toFixed(1) + ' m');
}
// 4d) Volleinschlag bei 200 km/h: sauber untersteuern – Drehrate an der Haftgrenze, kaum Drift,
//     Tempo sinkt (Reifen radieren), kein Wegdrehen
{
  const v = new R.Vehicle({});
  v.vLaengs = 200 / 3.6;
  let maxQuer = 0;
  for (let i = 0; i < 120; i++) { v.schritt(dt, { gas: 1, bremse: 0, lenkung: 1 }); maxQuer = Math.max(maxQuer, Math.abs(v.vQuer)); }
  const aQuer = v.querBeschleunigungMax(200 / 3.6);
  pruefe('200 km/h Volleinschlag: Heading-Änderung in 2 s < 1 rad (kein Spin)', Math.abs(v.heading) < 1, v.heading.toFixed(2) + ' rad');
  pruefe('200 km/h Volleinschlag: Querbeschleunigung ≤ Haftgrenze, Drift < 1 m/s', maxQuer < 1 && aQuer < 30,
    'aQuer ' + aQuer.toFixed(1) + ' m/s², Drift ' + maxQuer.toFixed(2) + ' m/s');
  const g = new R.Vehicle({}); g.vLaengs = 200 / 3.6;
  for (let i = 0; i < 120; i++) g.schritt(dt, gerade);
  pruefe('200 km/h Volleinschlag: Reifen radieren (≥ 1 m/s langsamer als geradeaus)', v.vLaengs < g.vLaengs - 1,
    (v.vLaengs * 3.6).toFixed(0) + ' vs ' + (g.vLaengs * 3.6).toFixed(0) + ' km/h');
}
// 5) Im Stand kein Drehen
{
  const v = new R.Vehicle({});
  for (let i = 0; i < 60; i++) v.schritt(dt, { gas: 0, bremse: 0, lenkung: 1 });
  pruefe('Kein Drehen im Stand', Math.abs(v.heading) < 1e-6);
}
// 6) Gras bremst deutlich; Deckel absolut ≤ 90 km/h (auch für 270-km/h-Autos), aber kein Tempo-Sprung
{
  const a = new R.Vehicle({}), b = new R.Vehicle({}); b.untergrund = 'gras';
  for (let i = 0; i < 60 * 15; i++) { a.schritt(dt, gerade); b.schritt(dt, gerade); }
  pruefe('Gras langsamer als Straße', b.vLaengs < a.vLaengs * 0.8, a.vLaengs.toFixed(1) + ' vs ' + b.vLaengs.toFixed(1));
  const p = new R.Vehicle({ vMax: 75, beschleunigung: 7.4 });
  p.vLaengs = 75; p.untergrund = 'gras';
  p.schritt(dt, gerade);
  const nachEinemSchritt = p.vLaengs;
  for (let i = 0; i < 60 * 4; i++) p.schritt(dt, gerade);
  pruefe('Gras-Deckel ≤ 90 km/h für Porsche (270 km/h)', p.vLaengs <= 25.001, (p.vLaengs * 3.6).toFixed(0) + ' km/h');
  pruefe('Gras: kein Tempo-Sprung (abbremsen statt abschneiden)', nachEinemSchritt > 70, (nachEinemSchritt * 3.6).toFixed(0) + ' km/h');
  const s = new R.Vehicle({ vMax: 75 }); s.untergrund = 'sand';
  pruefe('Sand-Deckel < Gras-Deckel', s.vMaxAuf('sand') < s.vMaxAuf('gras'), (s.vMaxAuf('sand') * 3.6).toFixed(0) + ' km/h');
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
// 12) Stabilität bei vMax: Lenkimpuls 0,3 s (Volleinschlag) → kein Spin, Drift klingt in < 2 s ab
{
  const v = new R.Vehicle({ vMax: 75, beschleunigung: 7.4, grip: 0.78 });   // rutschigstes Auto (Porsche)
  v.vLaengs = 75;
  let t = 0, maxH = 0, driftEnde = null;
  for (; t < 0.3; t += dt) { v.schritt(dt, { gas: 1, bremse: 0, lenkung: 1 }); maxH = Math.max(maxH, Math.abs(v.heading)); }
  for (; t < 5; t += dt) {
    v.schritt(dt, gerade);
    maxH = Math.max(maxH, Math.abs(v.heading));
    if (driftEnde === null && Math.abs(v.vQuer) < 0.05 && Math.abs(v.lenkung) < 0.01) driftEnde = t - 0.3;
  }
  pruefe('vMax + Lenkimpuls 0,3 s: Heading-Änderung < 0,6 rad', maxH < 0.6, maxH.toFixed(3) + ' rad');
  pruefe('vMax + Lenkimpuls: Drift klingt in < 2 s ab', driftEnde !== null && driftEnde < 2, driftEnde === null ? 'nie' : driftEnde.toFixed(2) + ' s');
}
// 13) Lenkhilfe "viel" und "wenig" bei 250 km/h, 2 m neben der Mitte, Spieler lenkt nicht:
//     zieht zur Mitte, ohne aufzuschaukeln (höchstens 1 Nulldurchgang, Überschwingen < 0,5 m)
for (const [name, staerke] of [['viel', 0.7], ['wenig', 0.3]]) {
  const v = new R.Vehicle({ vMax: 75, beschleunigung: 7.4 });
  v.setzen(2, 0, 0); v.vLaengs = 250 / 3.6;                 // Heading 0 = −z, rechts = +x
  const hilfe = { lenkhilfe: staerke, bremshilfe: 0, tangente: { tx: 0, tz: -1 }, zieltempo: 0 };
  let wechsel = 0, ueber = 0, vorher = Math.sign(v.x);
  for (let i = 0; i < 60 * 12; i++) {
    hilfe.seitenabstand = v.x;
    v.schritt(dt, gerade, hilfe);
    const sg = Math.abs(v.x) > 0.05 ? Math.sign(v.x) : 0;   // Wechsel erst ab 5 cm (Rauschen um 0 zählt nicht)
    if (sg !== 0 && sg !== vorher) { wechsel++; vorher = sg; }
    if (v.x < 0) ueber = Math.max(ueber, -v.x);
  }
  pruefe(`Lenkhilfe ${name} bei 250 km/h: kein Aufschaukeln, zieht zur Mitte`, wechsel <= 1 && ueber < 0.3 && Math.abs(v.x) < 0.3,
    'Nulldurchgänge ' + wechsel + ', Überschwingen ' + ueber.toFixed(2) + ' m, Ende ' + v.x.toFixed(2) + ' m');
}
console.log(fehler === 0 ? '\nALLE TESTS OK' : '\n' + fehler + ' FEHLER');
process.exit(fehler ? 1 : 0);
