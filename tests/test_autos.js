// Node-Test des Auto-Katalogs: node tests/test_autos.js
const { ladeModule } = require('./lade');
const R = ladeModule(['src/config.js', 'src/physics/vehicle.js', 'src/cars/carCatalog.js']);
const dt = R.config.physik.schritt;
const katalog = R.carCatalog;
let fehler = 0;
function pruefe(name, ok, info) { console.log((ok ? 'OK   ' : 'FEHL ') + name + (info ? '  (' + info + ')' : '')); if (!ok) fehler++; }

// --- Katalog-Vollständigkeit ---
pruefe('Katalog ist ein Array mit 8 Autos', Array.isArray(katalog) && katalog.length === 8, 'n=' + katalog.length);
const ids = katalog.map((a) => a.id);
pruefe('ids eindeutig', new Set(ids).size === ids.length);

const pflichtTexte = ['id', 'name', 'marke', 'modell', 'farbeName', 'karosserie', 'beschreibung', 'generischerName'];
const pflichtWerte = ['vMax', 'beschleunigung', 'bremsen', 'rueckwaertsMax', 'wendigkeit', 'grip', 'masse', 'laenge', 'breite'];
// Runde 3: vMax 220–270 km/h (61,1–75 m/s), Bremsen stärker (18–26 m/s²); beschleunigung ist jetzt die
// Antriebskraft bei Stillstand (fällt zum vMax hin ab), darum kleinere Zahlen als früher.
const bereiche = {
  vMax: [61, 75.01], beschleunigung: [4, 9], bremsen: [18, 26], rueckwaertsMax: [5, 12],
  wendigkeit: [1.5, 2.3], grip: [0.78, 0.95], masse: [900, 2500], laenge: [3.5, 5.2], breite: [1.6, 2.1],
};
const erlaubt = ['cabrio', 'van', 'limousine', 'sportwagen', 'coupe', 'kombi', 'kleinwagen', 'suv'];

for (const a of katalog) {
  const fehlt = [];
  for (const f of pflichtTexte) if (typeof a[f] !== 'string' || !a[f].trim()) fehlt.push(f);
  if (!Number.isInteger(a.farbe) || a.farbe < 0 || a.farbe > 0xffffff) fehlt.push('farbe');
  if (a.farbe2 !== undefined && !Number.isInteger(a.farbe2)) fehlt.push('farbe2');
  if (!a.fahrwerte) fehlt.push('fahrwerte');
  else for (const f of pflichtWerte) if (typeof a.fahrwerte[f] !== 'number') fehlt.push('fahrwerte.' + f);
  pruefe(`${a.id}: Pflichtfelder vollständig`, fehlt.length === 0, fehlt.join(', '));
  if (fehlt.length) continue;

  pruefe(`${a.id}: Karosserie erlaubt`, erlaubt.includes(a.karosserie), a.karosserie);
  const ausserhalb = pflichtWerte.filter((f) => a.fahrwerte[f] < bereiche[f][0] || a.fahrwerte[f] > bereiche[f][1]);
  pruefe(`${a.id}: Fahrwerte im Wertebereich`, ausserhalb.length === 0, ausserhalb.join(', '));
  pruefe(`${a.id}: Beschreibung ist ein Satz`, a.beschreibung.length < 140 && /[.!?]$/.test(a.beschreibung));
}

// Pflichtautos vorhanden, Extremwerte wie vorgegeben
const vmaxe = katalog.map((a) => a.fahrwerte.vMax);
const sollKmh = { 'multivan': 220, 'troc-cabrio': 230, 'mini-cooper': 235, 'passat': 240, 'audi-rs6': 255, 'bmw-m4': 260, 'amg-gt': 265, 'porsche-911': 270 };
pruefe('vMax je Auto wie vorgegeben (220 … 270 km/h)', katalog.every((a) => Math.abs(a.fahrwerte.vMax * 3.6 - sollKmh[a.id]) < 0.01),
  vmaxe.map((x) => (x * 3.6).toFixed(0)).join('/'));
pruefe('Alle erlaubten Typen Pflicht: cabrio/van/limousine/sportwagen/coupe/kombi/kleinwagen vorhanden',
  ['cabrio', 'van', 'limousine', 'sportwagen', 'coupe', 'kombi', 'kleinwagen'].every((t) => katalog.some((a) => a.karosserie === t)));
pruefe('KAROSSERIEN-Liste im Katalog stimmt', JSON.stringify(katalog.KAROSSERIEN) === JSON.stringify(erlaubt));
pruefe('finde() liefert Auto', katalog.finde('passat') && katalog.finde('passat').karosserie === 'limousine');

// --- Fahrverhalten je Auto ---
console.log('\nAuto               0-100   100-200   200-0   R(65 km/h)  Gras-max');
const zeiten = [];
for (const a of katalog) {
  const v = new R.Vehicle(a.fahrwerte);
  let t = 0;
  while (v.vLaengs * 3.6 < 100 && t < 30) { v.schritt(dt, { gas: 1, bremse: 0, lenkung: 0 }); t += dt; }
  const t100 = t;
  while (v.vLaengs * 3.6 < 200 && t < 60) { v.schritt(dt, { gas: 1, bremse: 0, lenkung: 0 }); t += dt; }
  const t200 = t - t100;
  zeiten.push(t100);
  pruefe(`${a.id}: 0-100 km/h in 4 .. 9 s`, t100 >= 4 && t100 <= 9, t100.toFixed(2) + ' s');
  pruefe(`${a.id}: 100-200 km/h in 6 .. 14 s`, t200 >= 6 && t200 <= 14, t200.toFixed(2) + ' s');
  for (let i = 0; i < 60 * 60; i++) v.schritt(dt, { gas: 1, bremse: 0, lenkung: 0 });
  const vm = a.fahrwerte.vMax;
  pruefe(`${a.id}: erreicht vMax (>= 98 %) und überschreitet es nicht`,
    v.vLaengs >= vm * 0.98 && v.vLaengs <= vm + 0.01, (v.vLaengs * 3.6).toFixed(1) + ' / ' + (vm * 3.6).toFixed(0) + ' km/h');
  // Bremsen 200 → 0
  const b = new R.Vehicle(a.fahrwerte); b.vLaengs = 200 / 3.6;
  let tb = 0;
  while (b.vLaengs > 0 && tb < 20) { b.schritt(dt, { gas: 0, bremse: 1, lenkung: 0 }); tb += dt; }
  pruefe(`${a.id}: 200 → 0 km/h in < 6 s`, tb < 6, tb.toFixed(2) + ' s');
  // Haarnadel 25 m mit 65 km/h: Kreisradius bei Volleinschlag
  const h = new R.Vehicle(a.fahrwerte), vh = 65 / 3.6;
  const radius = vh / h.drehrateMax(vh);
  pruefe(`${a.id}: Haarnadel (25 m) mit 65 km/h fahrbar`, radius < 25, radius.toFixed(1) + ' m');
  console.log('  ' + a.id.padEnd(16) + [t100, t200, tb].map((x) => (x.toFixed(2) + ' s').padStart(8)).join('') +
    (radius.toFixed(1) + ' m').padStart(11) + ((h.vMaxAuf('gras') * 3.6).toFixed(0) + ' km/h').padStart(10));
}
const schnell = Math.min(...zeiten), langsam = Math.max(...zeiten);
pruefe('Spürbarer Unterschied Schnellster/Langsamster (>= 1.5 s), aber nicht hoffnungslos (<= 2.5-fach)',
  langsam - schnell >= 1.5 && langsam / schnell <= 2.5, schnell.toFixed(2) + ' .. ' + langsam.toFixed(2) + ' s');
const multivan = zeiten[katalog.findIndex((a) => a.id === 'multivan')], porsche = zeiten[katalog.findIndex((a) => a.id === 'porsche-911')];
pruefe('Multivan beschleunigt am langsamsten, Porsche am schnellsten', multivan === langsam && porsche === schnell,
  multivan.toFixed(2) + ' / ' + porsche.toFixed(2) + ' s');


// --- 3D-Modelle (carBuilder v2) mit Three.js in Node ---
console.log('\nAuto               Dreiecke  Meshes  L/B/H (m) Modell vs. Katalog');
const warn = console.warn; console.warn = () => {};           // Hinweis "three.min.js deprecated" unterdrücken
const R3 = ladeModule(['vendor/three.min.js', 'src/config.js', 'src/cars/carCatalog.js', 'src/cars/carBuilder.js']);
console.warn = warn;
for (const a of R3.carCatalog) {
  const ab = a.abmessungen;
  pruefe(`${a.id}: abmessungen vollständig`, ab && ['laenge', 'breite', 'hoehe', 'radstand', 'radRadius'].every((k) => typeof ab[k] === 'number'));
  pruefe(`${a.id}: form-Objekt vorhanden`, a.form && typeof a.form === 'object');
  const g = R3.carBuilder.bauen(a);
  const u = g.userData;
  pruefe(`${a.id}: userData-Felder`, u.raeder.length === 4 && u.vorderraeder.length === 2 && u.lenkObjekte.length === 2
    && u.bremslichter.length === 2 && u.scheinwerfer.length === 2 && u.autoId === a.id && !!u.bremslichtMaterial);
  pruefe(`${a.id}: Schattenquad 'schatten'`, g.children.some((c) => c.name === 'schatten'));
  let tris = 0, meshes = 0;
  const min = [1e9, 1e9, 1e9], max = [-1e9, -1e9, -1e9];
  let unterB = 0;                                  // halbe Breite unterhalb 2·r (ohne Spiegel)
  g.updateMatrixWorld(true);
  g.traverse((o) => {
    if (!o.isMesh) return;
    meshes++;
    if (o.name === 'schatten') return;
    const p = o.geometry.attributes.position;
    tris += p.count / 3;
    const v = { x: 0, y: 0, z: 0 };
    const e = o.matrixWorld.elements;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      v.x = e[0] * x + e[4] * y + e[8] * z + e[12]; v.y = e[1] * x + e[5] * y + e[9] * z + e[13]; v.z = e[2] * x + e[6] * y + e[10] * z + e[14];
      min[0] = Math.min(min[0], v.x); min[1] = Math.min(min[1], v.y); min[2] = Math.min(min[2], v.z);
      max[0] = Math.max(max[0], v.x); max[1] = Math.max(max[1], v.y); max[2] = Math.max(max[2], v.z);
      if (v.y < 2 * ab.radRadius) unterB = Math.max(unterB, Math.abs(v.x));
    }
  });
  const L = max[2] - min[2], H = max[1], Bu = 2 * unterB;
  console.log('  ' + a.id.padEnd(16) + String(tris).padStart(7) + String(meshes).padStart(8) + '   ' +
    [L, Bu, H].map((x) => x.toFixed(2)).join('/') + '  vs ' + [ab.laenge, ab.breite, ab.hoehe].join('/'));
  pruefe(`${a.id}: Dreiecke 1.500 .. 8.000`, tris >= 1500 && tris <= 8000, String(tris));
  pruefe(`${a.id}: höchstens 12 Meshes`, meshes <= 12, String(meshes));
  const nah = (ist, soll) => Math.abs(ist / soll - 1) <= 0.08;
  pruefe(`${a.id}: Länge ±8 %`, nah(L, ab.laenge), L.toFixed(3) + ' / ' + ab.laenge);
  pruefe(`${a.id}: Breite (ohne Spiegel) ±8 %`, nah(Bu, ab.breite), Bu.toFixed(3) + ' / ' + ab.breite);
  pruefe(`${a.id}: Höhe ±8 %`, nah(H, ab.hoehe), H.toFixed(3) + ' / ' + ab.hoehe);
  pruefe(`${a.id}: nichts unter dem Boden`, min[1] >= -0.001, min[1].toFixed(3));
  // Räder: Mittelpunkt auf Höhe radRadius, links/rechts symmetrisch, innerhalb der Karosseriebreite
  const halter = u.raeder.map((r) => r.parent.position);
  const rH = ab.radRadiusHinten || ab.radRadius;
  pruefe(`${a.id}: Radmitte y ≈ radRadius`, halter.every((p, i) => Math.abs(p.y - (i < 2 ? ab.radRadius : rH)) < 0.005),
    halter.map((p) => p.y.toFixed(3)).join('/'));
  pruefe(`${a.id}: Räder symmetrisch`, Math.abs(halter[0].x + halter[1].x) < 1e-6 && Math.abs(halter[2].x + halter[3].x) < 1e-6
    && halter[0].z === halter[1].z && halter[2].z === halter[3].z);
  pruefe(`${a.id}: Radstand ≈ Katalog`, Math.abs((halter[2].z - halter[0].z) - ab.radstand) < 0.01, (halter[2].z - halter[0].z).toFixed(3));
  pruefe(`${a.id}: Front bei -z (Scheinwerfer vorne, Rücklichter hinten)`,
    u.scheinwerfer.every((m) => { m.geometry.computeBoundingBox(); return m.geometry.boundingBox.max.z < 0; })
    && u.bremslichter.every((m) => { m.geometry.computeBoundingBox(); return m.geometry.boundingBox.min.z > 0; }));
  // Schnittstellen-Funktionen
  R3.carBuilder.lenkeRaeder(g, 0.3); R3.carBuilder.dreheRaeder(g, 1.2); R3.carBuilder.setzeBremslicht(g, true);
  pruefe(`${a.id}: lenken/drehen/bremsen wirken`, u.lenkObjekte[0].rotation.y === 0.3 && u.raeder[3].rotation.x === 1.2
    && u.bremslichtMaterial.color.getHex() === 0xff3b30);
}
pruefe('platzhalterAuto() liefert Group', !!R3.carBuilder.platzhalterAuto().isGroup);
R3.carBuilder.cacheLeeren();
pruefe('cacheLeeren() + Neubau klappt', R3.carBuilder.bauen(R3.carCatalog[0]).userData.raeder.length === 4);

console.log(fehler === 0 ? '\nALLE TESTS OK' : '\n' + fehler + ' FEHLER');
process.exit(fehler === 0 ? 0 : 1);
