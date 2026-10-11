// Node-Test der Fahrphysik: node tests/test_physik.js
const { ladeModule } = require('./lade');
const R = ladeModule(['src/config.js', 'src/physics/vehicle.js', 'src/cars/carCatalog.js']);
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
// 4b) Runde 5: bei hohem Tempo direkter als Runde 3/4 (dort 0,35 rad/s bei vMax, „deutlich schwieriger"),
//     aber weiter träger als langsam: je Tempo-Klasse vMax 0,5 .. 0,6 rad/s, 50 % vMax ≥ 0,75 rad/s
//     (Untergrenze config.physik.lenkung; Runde 2 – „fühlte sich gut an" – hatte ≈ 0,8 bei vMax).
for (const k of ['normal', 'schnell']) {
  const vm = new R.Vehicle({}, { tempoKlasse: k }).daten.vMax;
  const r20 = drehrate(new R.Vehicle({}, { tempoKlasse: k }), 20), rMax = drehrate(new R.Vehicle({}, { tempoKlasse: k }), vm);
  const rHalb = drehrate(new R.Vehicle({}, { tempoKlasse: k }), vm / 2);
  pruefe(`[${k}] Drehrate bei vMax (${(vm * 3.6).toFixed(0)} km/h) 0,5 .. 0,6 rad/s und < 65 % von 20 m/s`, rMax >= 0.5 && rMax < 0.6 && rMax < 0.65 * r20,
    rMax.toFixed(2) + ' vs ' + r20.toFixed(2) + ' rad/s');
  pruefe(`[${k}] Drehrate bei 50 % vMax ≥ 0,75 rad/s`, rHalb >= 0.75, rHalb.toFixed(2) + ' rad/s');
}
// 4b') Tempo-Klasse: normal = Katalog × 0,70 / 0,85 / 0,9, schnell = Katalog; ohne Option = Vehicle.klasseStandard (null)
{
  const n = new R.Vehicle({ vMax: 70, beschleunigung: 6, bremsen: 20 }, { tempoKlasse: 'normal' });
  const s = new R.Vehicle({ vMax: 70, beschleunigung: 6, bremsen: 20 }, { tempoKlasse: 'schnell' });
  const o = new R.Vehicle({ vMax: 70, beschleunigung: 6, bremsen: 20 });
  pruefe('Tempo-Klasse normal: vMax × 0,7, Beschleunigung × 0,85, Bremsen × 0,9', Math.abs(n.daten.vMax - 49) < 1e-9 &&
    Math.abs(n.daten.beschleunigung - 5.1) < 1e-9 && Math.abs(n.daten.bremsen - 18) < 1e-9 && n.tempoKlasse === 'normal',
    (n.daten.vMax * 3.6).toFixed(0) + ' km/h');
  pruefe('Tempo-Klasse schnell / ohne Option: Katalogwerte', s.daten.vMax === 70 && o.daten.vMax === 70 && o.tempoKlasse === null);
  const kmh = R.carCatalog.map(a => new R.Vehicle(a.fahrwerte, { tempoKlasse: 'normal' }).daten.vMax * 3.6);
  pruefe('Tempo-Klasse normal: Katalog 150–190 km/h', Math.min(...kmh) >= 150 && Math.max(...kmh) <= 190,
    Math.min(...kmh).toFixed(0) + '–' + Math.max(...kmh).toFixed(0) + ' km/h');
}
// 4b'') Lenkung spricht schneller an: 90 % des Volleinschlags nach ≤ 0,27 s (einschwingen 9/s), zurück auf < 10 % in ≤ 0,2 s (12/s)
{
  const v = new R.Vehicle({}); v.vLaengs = 20;
  let t = 0;
  while (v.lenkung < 0.9 && t < 2) { v.schritt(dt, { gas: 1, bremse: 0, lenkung: 1 }); t += dt; }
  let t2 = 0;
  while (v.lenkung > 0.1 && t2 < 2) { v.schritt(dt, { gas: 1, bremse: 0, lenkung: 0 }); t2 += dt; }
  pruefe('Lenkung: 90 % nach ≤ 0,27 s, zurück < 10 % nach ≤ 0,2 s', t <= 0.27 && t2 <= 0.2, t.toFixed(3) + ' s / ' + t2.toFixed(3) + ' s');
}
// 4c) Haarnadel (Radius 25 m) mit 65 km/h fahrbar: Volleinschlag ergibt einen Kreis < 25 m
{
  const v = new R.Vehicle({});
  const tempo = 65 / 3.6, rate = drehrate(v, tempo);
  pruefe('Haarnadel: Kreisradius bei 65 km/h < 25 m', tempo / rate < 25, (tempo / rate).toFixed(1) + ' m');
}
// 4d) Runde 5: Volleinschlag bei vMax, JEDES Katalog-Auto × beide Tempo-Klassen: kein Spin (Heading-Änderung in 2 s
//     < 1,3 rad), Drift < 1,5 m/s; über der Haftgrenze spürbar untersteuern: Drift > 0,1 m/s nach außen und
//     Tempoverlust gegenüber geradeaus (≥ 0,3 m/s beim trägsten Auto, Bus in „normal"; Sportwagen deutlich mehr) (vorher: Drehrate exakt an der Haftgrenze, < 1 rad, kaum Drift)
for (const k of ['normal', 'schnell']) {
  let schlimmsterH = 0, schlimmsterD = 0, minDrift = Infinity, minVerlust = Infinity, wer = '';
  for (const a of R.carCatalog) {
    const v = new R.Vehicle(a.fahrwerte, { tempoKlasse: k }), g = new R.Vehicle(a.fahrwerte, { tempoKlasse: k });
    v.vLaengs = g.vLaengs = v.daten.vMax;
    let maxQuer = 0;
    for (let i = 0; i < 120; i++) { v.schritt(dt, { gas: 1, bremse: 0, lenkung: 1 }); g.schritt(dt, gerade); maxQuer = Math.max(maxQuer, Math.abs(v.vQuer)); }
    if (Math.abs(v.heading) > schlimmsterH) { schlimmsterH = Math.abs(v.heading); wer = a.id; }
    schlimmsterD = Math.max(schlimmsterD, maxQuer); minDrift = Math.min(minDrift, maxQuer);
    minVerlust = Math.min(minVerlust, g.vLaengs - v.vLaengs);
  }
  pruefe(`[${k}] vMax Volleinschlag (alle Autos): Heading in 2 s < 1,3 rad, Drift < 1,5 m/s`, schlimmsterH < 1.3 && schlimmsterD < 1.5,
    'max ' + schlimmsterH.toFixed(2) + ' rad (' + wer + '), Drift max ' + schlimmsterD.toFixed(2) + ' m/s');
  pruefe(`[${k}] vMax Volleinschlag: untersteuert spürbar (Drift > 0,1 m/s, ≥ 0,3 m/s langsamer als geradeaus)`, minDrift > 0.1 && minVerlust >= 0.3,
    'Drift min ' + minDrift.toFixed(2) + ' m/s, Tempoverlust min ' + minVerlust.toFixed(1) + ' m/s');
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
// 13b) Runde 5: Lenkhilfe 'wenig' arbeitet nicht gegen den Spieler: Spieler lenkt 1 s nach links (Überholen) bei
//      Tempo-Klasse normal / 120 km/h – mit Hilfe (auf 30 % reduziert) mindestens 80 % des Versatzes ohne Hilfe
{
  const versatz = (staerke) => {
    const v = new R.Vehicle({}, { tempoKlasse: 'normal' });
    v.setzen(0, 0, 0); v.vLaengs = 120 / 3.6;
    const hilfe = { lenkhilfe: staerke, bremshilfe: 0, tangente: { tx: 0, tz: -1 }, zieltempo: 0 };
    for (let i = 0; i < 60; i++) { hilfe.seitenabstand = v.x; v.schritt(dt, { gas: 1, bremse: 0, lenkung: -0.6 }, hilfe); }
    return -v.x;
  };
  const ohne = versatz(0), mit = versatz(R.config.fahrhilfen.wenig.lenkhilfe);
  pruefe('Lenkhilfe wenig (normal): Spielerlenkung wirkt ≥ 80 % (Hilfe auf 30 % reduziert)', mit >= 0.8 * ohne && ohne > 1,
    mit.toFixed(2) + ' m vs ' + ohne.toFixed(2) + ' m ohne Hilfe');
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
// ---------------- Runde 4: Umwelt (Wetter/Wind) – optionales 4. Argument von schritt() ----------------
// 14) Ohne umwelt identisch wie vor Runde 4: Fingerabdruck einer festen Fahrt (Gas/Bremse/Lenkung/Gras/Fahrhilfe),
//     aufgenommen mit vehicle.js VOR dem Einbau (11.10.2026). Ändert sich config.physik, muss er neu erzeugt werden.
//     Runde 5 (11.10.2026): neu erzeugt nach Lenkgefühl-Änderung (Drehrate/Lenktempo/Untersteuern) – nur der
//     Vergleich ohne/neutral umwelt ist die eigentliche Aussage.
function fingerabdruck(umwelt) {
  const v = new R.Vehicle({ grip: 0.8 });
  for (let i = 0; i < 1500; i++) {
    const s = { gas: i % 400 < 300 ? 1 : 0, bremse: i % 400 >= 320 ? 1 : 0, lenkung: Math.sin(i / 37) };
    v.untergrund = (i % 500 < 450) ? 'strasse' : 'gras';
    const h = i % 3 === 0 ? { lenkhilfe: 0.3, bremshilfe: 0.2, tangente: { tx: 0, tz: -1 }, seitenabstand: v.x, zieltempo: 40 } : undefined;
    if (umwelt === 'ohne') v.schritt(dt, s, h); else v.schritt(dt, s, h, umwelt);
  }
  return [v.x, v.z, v.heading, v.vLaengs, v.vQuer].map(x => x.toPrecision(17)).join(',');
}
{
  const VORHER = '63.569917157452885,-4.4506437793157909,-1.6991742455600745,2.4872273895626793,0.0000000000000000';   // Runde 5 neu
  const ohne = fingerabdruck('ohne');
  pruefe('Ohne umwelt: bitgenau wie vor Runde 4', ohne === VORHER, ohne === VORHER ? '' : ohne);
  pruefe('umwelt undefined / neutral {1,1,Wind 0}: identisch', fingerabdruck(undefined) === ohne &&
    fingerabdruck({ gripFaktor: 1, bremsFaktor: 1, windX: 0, windZ: 0 }) === ohne);
}
// 15) Wenig Grip (Schnee 0,6): Auto rutscht in der Kurve stärker (mehr Drift, kleinere Drehrate)
{
  const schnee = { gripFaktor: 0.6, bremsFaktor: 0.6, windX: 0, windZ: 0 };
  const a = new R.Vehicle({}), b = new R.Vehicle({});
  a.vLaengs = b.vLaengs = 25;
  let driftA = 0, driftB = 0;
  for (let i = 0; i < 90; i++) {
    a.schritt(dt, { gas: 1, bremse: 0, lenkung: -1 }); b.schritt(dt, { gas: 1, bremse: 0, lenkung: -1 }, undefined, schnee);
    driftA = Math.max(driftA, Math.abs(a.vQuer)); driftB = Math.max(driftB, Math.abs(b.vQuer));
  }
  pruefe('Grip 0,6: mehr Drift (≥ 1,5×) und weniger Drehung', driftB > driftA * 1.5 && Math.abs(b.heading) < Math.abs(a.heading),
    'Drift ' + driftA.toFixed(2) + ' → ' + driftB.toFixed(2) + ' m/s, Drehung ' + a.heading.toFixed(2) + ' → ' + b.heading.toFixed(2) + ' rad');
  pruefe('Grip 0,6: KI-Planung sieht weniger Querhaftung (querBeschleunigungMax)',
    b.querBeschleunigungMax(25) < a.querBeschleunigungMax(25) * 0.62, b.querBeschleunigungMax(25).toFixed(1) + ' vs ' + a.querBeschleunigungMax(25).toFixed(1));
}
// 16) Bremsweg 150 → 0 km/h: × 1/bremsFaktor (Rollwiderstand/Luft machen ihn etwas kürzer als exakt)
for (const [name, bf] of [['Regen', 0.8], ['Schnee', 0.6]]) {
  const weg = (umwelt) => {
    const v = new R.Vehicle({}); v.vLaengs = 150 / 3.6;
    let s = 0;
    while (v.vLaengs > 0) { const z0 = v.z; v.schritt(dt, { gas: 0, bremse: 1, lenkung: 0 }, undefined, umwelt); s += Math.abs(v.z - z0); }
    return s;
  };
  const trocken = weg(undefined), nass = weg({ gripFaktor: 1, bremsFaktor: bf, windX: 0, windZ: 0 });
  const verh = nass / trocken;
  pruefe(`Bremsweg ${name}: × ${(1 / bf).toFixed(2)} (±8 %)`, verh > (1 / bf) * 0.92 && verh < (1 / bf) * 1.04,
    trocken.toFixed(1) + ' m → ' + nass.toFixed(1) + ' m (× ' + verh.toFixed(2) + ')');
}
// 17) Seitenwind Stufe 5 bei 55 m/s, ohne Gegenlenken: 2–6 m Versatz in 3 s; Stufe 1 kaum (< 1,2 m);
//     Gegenlenken (einfacher Regler) hält das Auto in der Spur
{
  const versatz = (stufe, gegenlenken) => {
    const v = new R.Vehicle({ vMax: 75, beschleunigung: 7.4 });
    v.setzen(0, 0, 0); v.vLaengs = 55;                  // fährt nach −z, rechts = +x
    const u = { gripFaktor: 1, bremsFaktor: 1, windX: stufe, windZ: 0 };   // Wind weht nach +x = von links
    let lenk = 0;
    for (let i = 0; i < 180; i++) {
      if (gegenlenken) lenk = Math.max(-1, Math.min(1, -(v.x * 0.6 + (-v.heading) * 6)));
      v.schritt(dt, { gas: 0.75, bremse: 0, lenkung: lenk }, undefined, u);
    }
    return v.x;
  };
  const x5 = versatz(5, false), x1 = versatz(1, false), xg = versatz(5, true);
  pruefe('Seitenwind 5 bei 55 m/s: 2–6 m nach rechts in 3 s', x5 > 2 && x5 < 6, x5.toFixed(2) + ' m');
  pruefe('Seitenwind 1: kaum (< 1,2 m)', x1 > 0 && x1 < 1.2, x1.toFixed(2) + ' m');
  pruefe('Seitenwind 5 mit Gegenlenken: < 1 m', Math.abs(xg) < 1, xg.toFixed(2) + ' m');
  const v = new R.Vehicle({}); v.vLaengs = 30;
  v.schritt(dt, gerade, undefined, { gripFaktor: 1, bremsFaktor: 1, windX: 5, windZ: 0 });
  pruefe('vehicle.windSeite: Wind von links = +1', Math.abs(v.windSeite - 1) < 1e-9, v.windSeite.toFixed(3));
}
console.log(fehler === 0 ? '\nALLE TESTS OK' : '\n' + fehler + ' FEHLER');
process.exit(fehler ? 1 : 0);
