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
const bereiche = {
  vMax: [34, 48], beschleunigung: [6, 12], bremsen: [15, 22], rueckwaertsMax: [5, 12],
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
pruefe('vMax-Spanne 34 .. 48', Math.min(...vmaxe) === 34 && Math.max(...vmaxe) === 48, vmaxe.join('/'));
pruefe('Alle erlaubten Typen Pflicht: cabrio/van/limousine/sportwagen/coupe/kombi/kleinwagen vorhanden',
  ['cabrio', 'van', 'limousine', 'sportwagen', 'coupe', 'kombi', 'kleinwagen'].every((t) => katalog.some((a) => a.karosserie === t)));
pruefe('KAROSSERIEN-Liste im Katalog stimmt', JSON.stringify(katalog.KAROSSERIEN) === JSON.stringify(erlaubt));
pruefe('finde() liefert Auto', katalog.finde('passat') && katalog.finde('passat').karosserie === 'limousine');

// --- Fahrverhalten je Auto ---
console.log('\nAuto               0-100 km/h   vMax erreicht');
const zeiten = [];
for (const a of katalog) {
  const v = new R.Vehicle(a.fahrwerte);
  let t = 0;
  while (v.vLaengs * 3.6 < 100 && t < 30) { v.schritt(dt, { gas: 1, bremse: 0, lenkung: 0 }); t += dt; }
  zeiten.push(t);
  pruefe(`${a.id}: 0-100 km/h in 3.5 .. 10 s`, t >= 3.5 && t <= 10, t.toFixed(2) + ' s');
  for (let i = 0; i < 60 * 60; i++) v.schritt(dt, { gas: 1, bremse: 0, lenkung: 0 });
  const vm = a.fahrwerte.vMax;
  pruefe(`${a.id}: erreicht vMax (>= 98 %) und überschreitet es nicht`,
    v.vLaengs >= vm * 0.98 && v.vLaengs <= vm + 0.01, v.vLaengs.toFixed(1) + ' / ' + vm + ' m/s');
}
const schnell = Math.min(...zeiten), langsam = Math.max(...zeiten);
pruefe('Spürbarer Unterschied Schnellster/Langsamster (>= 1.5 s), aber nicht hoffnungslos (<= 2.5-fach)',
  langsam - schnell >= 1.5 && langsam / schnell <= 2.5, schnell.toFixed(2) + ' .. ' + langsam.toFixed(2) + ' s');

console.log(fehler === 0 ? '\nALLE TESTS OK' : '\n' + fehler + ' FEHLER');
process.exit(fehler === 0 ? 0 : 1);
