// v31 H1c: Kolonne im Looping – node tests/test_looping_kolonne.js
// collisions.loopingAbstand darf das hintere Auto nie unter das zum Durchkommen nötige Tempo bremsen (sonst: Tempo bricht auf 0,6 m/s ein
// → „Mehr Anlauf!“-Sturz, gefunden mit Stufe „leicht“ + Rempeln). a) Einheit: 3 Autos dicht hintereinander, vorderes nur mit Mindesttempo.
// b) Server-Simulation: 11 Teilnehmer, Stufe leicht, Seeds 4–6 × 3 Runden: 0 Stürze, 0 außen.
const { ladeModule } = require('./lade');
const R = ladeModule(['src/config.js', 'src/physics/vehicle.js', 'src/cars/carCatalog.js', 'src/track/spline.js', 'src/track/trackCatalog.js',
  'src/track/trackBuilder.js', 'src/track/looping.js', 'src/track/anlauf.js', 'src/race/raceManager.js', 'src/physics/collisions.js', 'src/ai/driver.js']);
let fehler = 0;
function pruefe(name, ok, info) { console.log((ok ? 'OK   ' : 'FEHL ') + name + (info ? '  (' + info + ')' : '')); if (!ok) fehler++; }
const dt = R.config.physik.schritt, LP = R.Looping, strecke = new R.Strecke(R.trackCatalog.find(t => t.id === 'fantasie')), L = strecke.loopings[0], sp = strecke.spline;
/** Zustand: Auto im Looping bei Winkel w mit Tempo v (Bogenlänge-Abstand wird von loopingAbstand geprüft). */
function imLooping(w, v) {
  const vh = new R.Vehicle({}), lp = LP.zustand();
  lp.aktiv = true; lp.looping = L; lp.winkel = lp.winkelVorher = w; lp.v = v; vh.imLooping = true;
  return { vehicle: vh, looping: lp };
}
const vNoetig = (w) => Math.sqrt(9.81 * L.radius * (3 + 2 * Math.cos(w)));
{
  // vorn (höher) langsamer als hinten: hinten wird nach hinten gesetzt (Abstand) und darf nicht aufs Tempo des Vordermanns fallen
  const liste = [imLooping(2.0, 10.5), imLooping(1.95, 27), imLooping(1.9, 28)];
  const n = R.Kollisionen.loopingAbstand(liste, strecke);
  const [a, b, c] = liste, mind = (a.vehicle.daten.laenge + b.vehicle.daten.laenge) / 2 + 0.1;
  pruefe('loopingAbstand: Abstand wird eingehalten (Bogenlänge ≥ Länge + 0,1 m)', n > 0 && (a.looping.winkel - b.looping.winkel) * L.radius >= mind - 1e-6 && (b.looping.winkel - c.looping.winkel) * L.radius >= mind - 1e-6,
    ((a.looping.winkel - b.looping.winkel) * L.radius).toFixed(2) + ' m');
  pruefe('loopingAbstand: hinteres Auto wird nie unter das nötige Tempo gebremst (v ≥ vNoetig(w), v nie größer als vorher)',
    b.looping.v >= vNoetig(b.looping.winkel) - 1e-6 && c.looping.v >= vNoetig(c.looping.winkel) - 1e-6 && b.looping.v <= 27 && c.looping.v <= 28,
    `${b.looping.v.toFixed(1)} ≥ ${vNoetig(b.looping.winkel).toFixed(1)} m/s, ${c.looping.v.toFixed(1)} ≥ ${vNoetig(c.looping.winkel).toFixed(1)} m/s`);
  const lang = [imLooping(2.0, 10.5), imLooping(1.95, 12)];     // hinten schon langsamer als nötig: wird nicht beschleunigt
  R.Kollisionen.loopingAbstand(lang, strecke);
  pruefe('loopingAbstand: ein schon langsames hinteres Auto wird nicht beschleunigt', lang[1].looping.v <= 12 + 1e-9, lang[1].looping.v.toFixed(2));
}
if (process.argv[2] !== 'kurz') {
  const { lauf } = require('./looping_log.js');
  for (const seed of [4, 5, 6]) {
    const e = lauf({ welt: 'alles', seed, n: 11, runden: 3, tiere: true, geister: true, stufe: 'leicht' });
    pruefe(`[Sim seed ${seed} leicht + Rempeln + Tiere + Verkehr] 11 Teilnehmer × 3 Runden: 0 Stürze, nichts außen (ohne Ausweichen), ${e.eintritte} Einfahrten`, e.gefallen === 0 && e.paesse.filter(x => x.ueber > 1.0 && !x.veto).length === 0 && e.eintritte > 40, `gestürzt ${e.gefallen}, außen (> 1 m, ohne Ausweichen) ${e.paesse.filter(x => x.ueber > 1.0 && !x.veto).length}`);
  }
}
console.log(fehler ? '\n' + fehler + ' FEHLER' : '\nALLE OK');
process.exit(fehler ? 1 : 0);
