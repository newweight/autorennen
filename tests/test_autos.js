// Node-Test des Auto-Katalogs: node tests/test_autos.js
const { ladeModule } = require('./lade');
const R = ladeModule(['src/config.js', 'src/physics/vehicle.js', 'src/cars/carCatalog.js']);
const dt = R.config.physik.schritt;
const katalog = R.carCatalog;
let fehler = 0;
function pruefe(name, ok, info) { console.log((ok ? 'OK   ' : 'FEHL ') + name + (info ? '  (' + info + ')' : '')); if (!ok) fehler++; }

// --- Katalog-Vollständigkeit ---
// 10 Autos: 8 Straßenautos + Formel-Renner (wählbar) + Streifenwagen (waehlbar: false, nur vom Spiel eingesetzt)
pruefe('Katalog ist ein Array mit 10 Autos', Array.isArray(katalog) && katalog.length === 10, 'n=' + katalog.length);
const ids = katalog.map((a) => a.id);
pruefe('ids eindeutig', new Set(ids).size === ids.length);
const waehlbar = katalog.filter((a) => a.waehlbar !== false);
pruefe('9 Autos wählbar (inkl. formel), polizei nicht', waehlbar.length === 9 && waehlbar.some((a) => a.id === 'formel')
  && katalog.finde('polizei') && katalog.finde('polizei').waehlbar === false, waehlbar.map((a) => a.id).join(','));
pruefe('waehlbare() liefert genau die wählbaren Autos', typeof katalog.waehlbare === 'function'
  && JSON.stringify(katalog.waehlbare().map((a) => a.id)) === JSON.stringify(waehlbar.map((a) => a.id)));
pruefe('waehlbar ist (falls gesetzt) ein Boolean', katalog.every((a) => a.waehlbar === undefined || typeof a.waehlbar === 'boolean'));
const STRASSE = katalog.filter((a) => a.karosserie !== 'formel' && a.waehlbar !== false);   // die 8 Straßenautos

const pflichtTexte = ['id', 'name', 'marke', 'modell', 'farbeName', 'karosserie', 'beschreibung', 'generischerName'];
const pflichtWerte = ['vMax', 'beschleunigung', 'bremsen', 'rueckwaertsMax', 'wendigkeit', 'grip', 'masse', 'laenge', 'breite'];
// Runde 3: vMax 220–270 km/h (61,1–75 m/s), Bremsen stärker (18–26 m/s²); beschleunigung ist jetzt die
// Antriebskraft bei Stillstand (fällt zum vMax hin ab), darum kleinere Zahlen als früher.
const bereiche = {
  vMax: [61, 75.01], beschleunigung: [4, 9], bremsen: [18, 26], rueckwaertsMax: [5, 12],
  wendigkeit: [1.5, 2.3], grip: [0.78, 0.95], masse: [900, 2500], laenge: [3.5, 5.2], breite: [1.6, 2.1],
};
// Sonderbereiche: Formel-Renner (280 km/h, Beschleunigung 12, Haftung extrem, 800 kg, 5,5 m lang)
// und Streifenwagen (Beschleunigung 9,5, damit er Raser einholen kann)
const sonderBereiche = {
  formel: { vMax: [77, 78.01], beschleunigung: [10, 13], grip: [0.95, 0.99], masse: [700, 900], laenge: [5.2, 5.7], breite: [1.9, 2.1] },
  polizei: { beschleunigung: [8, 10.5] },
};
const erlaubt = ['cabrio', 'van', 'limousine', 'sportwagen', 'coupe', 'kombi', 'kleinwagen', 'suv', 'formel'];

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
  const br = Object.assign({}, bereiche, sonderBereiche[a.id] || {});
  const ausserhalb = pflichtWerte.filter((f) => a.fahrwerte[f] < br[f][0] || a.fahrwerte[f] > br[f][1]);
  pruefe(`${a.id}: Fahrwerte im Wertebereich`, ausserhalb.length === 0, ausserhalb.join(', '));
  pruefe(`${a.id}: Beschreibung ist ein Satz`, a.beschreibung.length < 140 && /[.!?]$/.test(a.beschreibung));
}

// Pflichtautos vorhanden, Extremwerte wie vorgegeben
const vmaxe = katalog.map((a) => a.fahrwerte.vMax);
const sollKmh = { 'multivan': 220, 'troc-cabrio': 230, 'mini-cooper': 235, 'passat': 240, 'audi-rs6': 255, 'bmw-m4': 260, 'amg-gt': 265,
  'porsche-911': 270, 'formel': 280, 'polizei': 62 * 3.6 };
pruefe('vMax je Auto wie vorgegeben (Straße 220 … 270 km/h, Streifenwagen 223, Formel 280)', katalog.every((a) => Math.abs(a.fahrwerte.vMax * 3.6 - sollKmh[a.id]) < 0.01),
  vmaxe.map((x) => (x * 3.6).toFixed(0)).join('/'));
// 13.10. Passat ist jetzt ein Kombi (Variant) -> kein Katalogauto mehr mit Typ 'limousine'; der Typ bleibt im carBuilder (TYP_STANDARD) nutzbar
pruefe('Alle erlaubten Typen Pflicht: cabrio/van/sportwagen/coupe/kombi/kleinwagen vorhanden (limousine nur noch als Builder-Typ)',
  ['cabrio', 'van', 'sportwagen', 'coupe', 'kombi', 'kleinwagen'].every((t) => katalog.some((a) => a.karosserie === t)));
pruefe('KAROSSERIEN-Liste im Katalog stimmt', JSON.stringify(katalog.KAROSSERIEN) === JSON.stringify(erlaubt));
pruefe('finde() liefert Auto', katalog.finde('passat') && katalog.finde('passat').karosserie === 'kombi');
pruefe('Formel-Renner ist das schnellste Auto (vMax)', Math.max(...vmaxe) === katalog.finde('formel').fahrwerte.vMax);
pruefe('Formel-Renner: Haftung am höchsten, leichtestes Auto', katalog.every((a) => a.id === 'formel'
  || (a.fahrwerte.grip < katalog.finde('formel').fahrwerte.grip && a.fahrwerte.masse > katalog.finde('formel').fahrwerte.masse)));

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
  // Formel: 0-100 um 3 s (2,3 .. 3,5), 100-200 sehr kurz; Streifenwagen: flott (Einholen), sonst Straßenautos
  const [b0, b1, c0, c1] = a.id === 'formel' ? [2.3, 3.5, 2.5, 5] : a.id === 'polizei' ? [3, 9, 4, 14] : [4, 9, 6, 14];
  pruefe(`${a.id}: 0-100 km/h in ${b0} .. ${b1} s`, t100 >= b0 && t100 <= b1, t100.toFixed(2) + ' s');
  pruefe(`${a.id}: 100-200 km/h in ${c0} .. ${c1} s`, t200 >= c0 && t200 <= c1, t200.toFixed(2) + ' s');
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
// Vergleiche unter den 8 Straßenautos (Formel-Renner und Streifenwagen sind Sonderfälle)
const zeitVon = (id) => zeiten[katalog.findIndex((a) => a.id === id)];
const zStrasse = STRASSE.map((a) => zeitVon(a.id));
const schnell = Math.min(...zStrasse), langsam = Math.max(...zStrasse);
pruefe('Straßenautos: spürbarer Unterschied Schnellster/Langsamster (>= 1.5 s), aber nicht hoffnungslos (<= 2.5-fach)',
  langsam - schnell >= 1.5 && langsam / schnell <= 2.5, schnell.toFixed(2) + ' .. ' + langsam.toFixed(2) + ' s');
const multivan = zeitVon('multivan'), porsche = zeitVon('porsche-911');
pruefe('Straßenautos: Multivan beschleunigt am langsamsten, Porsche am schnellsten', multivan === langsam && porsche === schnell,
  multivan.toFixed(2) + ' / ' + porsche.toFixed(2) + ' s');
pruefe('Formel-Renner beschleunigt am schnellsten von allen', zeitVon('formel') === Math.min(...zeiten), zeitVon('formel').toFixed(2) + ' s');


// --- 3D-Modelle (carBuilder v2) mit Three.js in Node ---
console.log('\nAuto               Dreiecke  Meshes  L/B/H (m) Modell vs. Katalog');
const warn = console.warn; console.warn = () => {};           // Hinweis "three.min.js deprecated" unterdrücken
const R3 = ladeModule(['vendor/three.min.js', 'src/config.js', 'src/cars/carCatalog.js', 'src/cars/carBuilder.js']);
pruefe('carBuilder kennt den Typ limousine weiterhin (TYP_STANDARD)', !!R3.carBuilder.TYP_STANDARD.limousine);
console.warn = warn;
for (const a of R3.carCatalog) {
  const ab = a.abmessungen;
  pruefe(`${a.id}: abmessungen vollständig`, ab && ['laenge', 'breite', 'hoehe', 'radstand', 'radRadius'].every((k) => typeof ab[k] === 'number'));
  pruefe(`${a.id}: form-Objekt vorhanden`, a.form && typeof a.form === 'object');
  const g = R3.carBuilder.bauen(a);
  const u = g.userData;
  const formel = a.karosserie === 'formel', blau = !!(a.form && a.form.blaulicht);
  // Formel: keine Scheinwerfer (leer erlaubt); Streifenwagen: zwei Blaulicht-Meshes; alle anderen: blaulicht = []
  pruefe(`${a.id}: userData-Felder`, u.raeder.length === 4 && u.vorderraeder.length === 2 && u.lenkObjekte.length === 2
    && u.bremslichter.length === 2 && u.scheinwerfer.length === (formel ? 0 : 2) && u.autoId === a.id && !!u.bremslichtMaterial
    && Array.isArray(u.blaulicht) && u.blaulicht.length === (blau ? 2 : 0) && u.karosserie === a.karosserie);
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
  const sollMeshes = formel ? 8 : blau ? 12 : 10;
  pruefe(`${a.id}: Meshzahl je Typ (${sollMeshes})`, meshes === sollMeshes, String(meshes));
  const nah = (ist, soll) => Math.abs(ist / soll - 1) <= 0.08;
  // Höhe: beim Streifenwagen kommt der Blaulichtbalken (~0,19 m) aufs Dach
  const sollH = ab.hoehe + (blau ? 0.19 : 0);
  pruefe(`${a.id}: Länge ±8 %`, nah(L, ab.laenge), L.toFixed(3) + ' / ' + ab.laenge);
  pruefe(`${a.id}: Breite (ohne Spiegel) ±8 %`, nah(Bu, ab.breite), Bu.toFixed(3) + ' / ' + ab.breite);
  pruefe(`${a.id}: Höhe ±8 %` + (blau ? ' (mit Blaulichtbalken)' : ''), nah(H, sollH), H.toFixed(3) + ' / ' + sollH.toFixed(2));
  pruefe(`${a.id}: nichts unter dem Boden`, min[1] >= -0.001, min[1].toFixed(3));
  // Räder: Mittelpunkt auf Höhe radRadius, links/rechts symmetrisch, innerhalb der Karosseriebreite
  const halter = u.raeder.map((r) => r.parent.position);
  const rH = ab.radRadiusHinten || ab.radRadius;
  pruefe(`${a.id}: Radmitte y ≈ radRadius`, halter.every((p, i) => Math.abs(p.y - (i < 2 ? ab.radRadius : rH)) < 0.005),
    halter.map((p) => p.y.toFixed(3)).join('/'));
  pruefe(`${a.id}: Räder symmetrisch`, Math.abs(halter[0].x + halter[1].x) < 1e-6 && Math.abs(halter[2].x + halter[3].x) < 1e-6
    && halter[0].z === halter[1].z && halter[2].z === halter[3].z);
  pruefe(`${a.id}: Radstand ≈ Katalog`, Math.abs((halter[2].z - halter[0].z) - ab.radstand) < 0.01, (halter[2].z - halter[0].z).toFixed(3));
  if (formel) {
    // Monoposto: Räder frei stehend außerhalb des Rumpfs, vorn kleiner/schmaler als hinten, keine Radhäuser
    const ausserhalbRumpf = halter.every((p, i) => Math.abs(p.x) - (i < 2 ? ab.radBreite : ab.radBreiteHinten) / 2 > 0.45);
    pruefe(`${a.id}: Räder freistehend (Innenkante > 0,45 m von der Mitte)`, ausserhalbRumpf, halter.map((p) => Math.abs(p.x).toFixed(2)).join('/'));
    pruefe(`${a.id}: Räder vorn kleiner als hinten`, ab.radRadius < ab.radRadiusHinten && ab.radBreite < ab.radBreiteHinten);
    pruefe(`${a.id}: flach (Höhe < 1 m) und breiter als die Straßenautos`, H < 1.0 && Bu >= 1.95, H.toFixed(2) + ' / ' + Bu.toFixed(2));
  }
  pruefe(`${a.id}: Front bei -z (Scheinwerfer vorne, Rücklichter hinten)`,
    u.scheinwerfer.every((m) => { m.geometry.computeBoundingBox(); return m.geometry.boundingBox.max.z < 0; })
    && u.bremslichter.every((m) => { m.geometry.computeBoundingBox(); return m.geometry.boundingBox.min.z > 0; }));
  // Schnittstellen-Funktionen
  R3.carBuilder.lenkeRaeder(g, 0.3); R3.carBuilder.dreheRaeder(g, 1.2); R3.carBuilder.setzeBremslicht(g, true);
  pruefe(`${a.id}: lenken/drehen/bremsen wirken`, u.lenkObjekte[0].rotation.y === 0.3 && u.raeder[3].rotation.x === 1.2
    && u.bremslichtMaterial.color.getHex() === 0xff3b30);
  // setzeBlaulicht: läuft für jedes Auto ohne Fehler; beim Streifenwagen schalten die Seiten einzeln
  let blauOk = true;
  try { [0, 1, 2, 3].forEach((ph) => R3.carBuilder.setzeBlaulicht(g, ph)); R3.carBuilder.setzeBlaulicht(g, 1, 'rot'); } catch (e) { blauOk = false; }
  if (blau && blauOk) {
    const farbe = () => u.blaulicht.map((m) => m.material.color.getHex());
    R3.carBuilder.setzeBlaulicht(g, 0); const aus = farbe();
    R3.carBuilder.setzeBlaulicht(g, 1); const p1 = farbe();
    R3.carBuilder.setzeBlaulicht(g, 2); const p2 = farbe();
    R3.carBuilder.setzeBlaulicht(g, 3); const p3 = farbe();
    R3.carBuilder.setzeBlaulicht(g, 1, 'rot'); const rot = farbe();
    blauOk = aus[0] === aus[1] && p1[0] !== aus[0] && p1[1] === aus[1] && p2[0] === aus[0] && p2[1] !== aus[1]
      && p3[0] === p1[0] && p3[1] === p2[1] && rot[0] !== p1[0] && u.blaulicht[0].material !== u.blaulicht[1].material
      && u.blaulicht[0].material !== u.bremslichtMaterial;
    // links = -x, rechts = +x
    u.blaulicht.forEach((m) => m.geometry.computeBoundingBox());
    blauOk = blauOk && u.blaulicht[0].geometry.boundingBox.max.x < 0 && u.blaulicht[1].geometry.boundingBox.min.x > 0
      && u.blaulicht[0].geometry.boundingBox.min.y > ab.hoehe - 0.1;
  }
  pruefe(`${a.id}: setzeBlaulicht läuft` + (blau ? ' (0 aus / 1 links / 2 rechts / 3 beide / rot, Balken auf dem Dach)' : ' (ohne Wirkung)'), blauOk);
}
// --- Runde 6: Räder (Profil, Felge 3D, Slicks) und Multivan in Bronze ---
for (const a of R3.carCatalog) {
  const g = R3.carBuilder.bauen(a), rad = g.userData.raeder[0], rad2 = g.userData.raeder[3];
  const tri = (m) => m.geometry.attributes.position.count / 3;
  pruefe(`${a.id}: Rad-Dreiecke <= 600 (vorn/hinten)`, tri(rad) <= 600 && tri(rad2) <= 600 && tri(rad) >= 100, tri(rad) + '/' + tri(rad2));
  if (a.karosserie === 'formel') pruefe(`${a.id}: Slicks einfacher als Straßenreifen (<= 400 Dreiecke, ohne Profilblöcke)`, tri(rad) <= 400);
  else pruefe(`${a.id}: Straßenrad mit Profil/Speichen (>= 350 Dreiecke)`, tri(rad) >= 350, String(tri(rad)));
  // Rad bleibt in der Breite innerhalb von Katalogbreite +2 % (steht leicht nach außen)
  g.updateMatrixWorld(true);
}
const mv = R3.carCatalog.finde('multivan');
const heller = (h) => ((h >> 16) & 255) + ((h >> 8) & 255) + (h & 255);
// Multivan = VW T6.1 Multivan Edition: Kupferbronze, Dach schwarz (farbe2) – 13.10. Umbau nach Fotos
pruefe('Multivan: Kupferbronze mit schwarzem Dach (farbe2)', ((mv.farbe >> 16) & 255) > ((mv.farbe) & 255) + 40 && heller(mv.farbe2) < 120 && heller(mv.farbe) > heller(mv.farbe2) + 200
  && /bronze/i.test(mv.farbeName) && /bronze/i.test(mv.generischerName), mv.farbeName);
pruefe('Multivan: T6.1-Maße 4,904 × 1,904 × 1,970 m, Radstand 3,0, Kollisionsbox ≈ Katalogmaß (±0,1 m)', mv.abmessungen.laenge === 4.904 && mv.abmessungen.breite === 1.904 && mv.abmessungen.hoehe === 1.97 && mv.abmessungen.radstand === 3
  && Math.abs(mv.fahrwerte.laenge - 4.904) < 0.1 && Math.abs(mv.fahrwerte.breite - 1.904) < 0.1, mv.fahrwerte.laenge + ' × ' + mv.fahrwerte.breite);
pruefe('platzhalterAuto() liefert Group', !!R3.carBuilder.platzhalterAuto().isGroup);
R3.carBuilder.cacheLeeren();
pruefe('cacheLeeren() + Neubau klappt', R3.carBuilder.bauen(R3.carCatalog[0]).userData.raeder.length === 4);

console.log(fehler === 0 ? '\nALLE TESTS OK' : '\n' + fehler + ' FEHLER');
process.exit(fehler === 0 ? 0 : 1);
