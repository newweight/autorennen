// Fairness der 4 Gegner-Modelle (v20): node tests/test_gegner_fair.js
// KI „mittel“ allein auf der Strecke, 2 Runden, je Modell mit seinen Katalog-Fahrwerten (Passat, Multivan, 911, T-Roc), Tempo-Klassen normal + schnell.
// Prüft: alle im Ziel, kein Reset, Gras/Sand < 3 %, Rundenzeit-Spanne zwischen schnellstem und langsamstem Modell ≤ 20 % (Gummiband gleicht den Rest aus),
// Rundenzeit KI „mittel“ weiter im Zielbereich der Tempo-Klasse (normal 110–140 s Wiese/Wald/Wüste).
const { ladeModule } = require('./lade');
const R = ladeModule(['src/config.js', 'src/physics/vehicle.js', 'src/track/spline.js', 'src/cars/carCatalog.js',
  'src/track/trackCatalog.js', 'src/track/trackBuilder.js', 'src/track/looping.js', 'src/race/raceManager.js', 'src/physics/collisions.js', 'src/ai/driver.js']);
let fehler = 0;
function pruefe(name, ok, info) { console.log((ok ? 'OK   ' : 'FEHL ') + name + (info ? '  (' + info + ')' : '')); if (!ok) fehler++; }
const dt = R.config.physik.schritt, LP = R.Looping;
const MODELLE = R.carCatalog.GEGNER_MODELLE;
function lauf(strecke, auto, klasse) {
  const start = strecke.startpositionen(1)[0];
  const v = new R.Vehicle(auto.fahrwerte, { tempoKlasse: klasse });
  v.setzen(start.x, start.z, start.heading);
  const rennen = new R.RaceManager(strecke, [{ vehicle: v, name: 'KI', istSpieler: false }], { runden: 2, countdown: 0 });
  const d = new R.Driver(v, strecke, { schwierigkeit: 'mittel', seed: 7, name: 'KI' });
  const t = rennen.teilnehmer[0], lp = LP.zustand();
  let index = -1, abseits = 0, zeit = 0;
  for (let k = 0; k < 60 * 600 && !t.imZiel; k++) {
    const s = d.steuerung(dt, { andere: [], spielerFortschrittMax: null, eigenerFortschritt: t.fortschritt, laeuft: true });
    const r = LP.fahrzeugSchritt(lp, v, strecke, s, dt, index);
    index = r.index;
    if (r.untergrund === 'gras' || r.untergrund === 'sand') abseits += dt;
    if (r.ereignis === 'gefallen') rennen.verfolgungSetzen(0, v.x, v.z);
    rennen.schritt(dt); zeit += dt;
  }
  return { r2: t.rundenzeiten[1], imZiel: t.imZiel, anteil: abseits / zeit, reset: d.brauchtReset };
}
for (const klasse of ['normal', 'schnell']) {
  for (const id of ['wiese', 'fantasie']) {
    const daten = R.trackCatalog.find(t => t.id === id), strecke = new R.Strecke(daten, { welt: daten.weltStandard });
    const erg = MODELLE.map(m => Object.assign({ m }, lauf(strecke, R.carCatalog.finde(m), klasse)));
    const zeiten = erg.map(e => e.r2);
    const sp = Math.max(...zeiten) / Math.min(...zeiten) - 1;
    console.log(`  ${klasse}/${id}: ` + erg.map(e => `${e.m} ${e.r2 ? e.r2.toFixed(1) : '-'} s`).join(' | ') + `  Spanne ${(sp * 100).toFixed(1)} %`);
    pruefe(`${klasse}/${id}: alle 4 Modelle im Ziel, kein Reset, abseits < 3 %`, erg.every(e => e.imZiel && !e.reset && e.anteil < 0.03), erg.map(e => (e.anteil * 100).toFixed(1) + '%').join(' '));
    pruefe(`${klasse}/${id}: Rundenzeit-Spanne der Modelle ≤ 20 %`, sp <= 0.20, (sp * 100).toFixed(1) + ' %');
  }
}
console.log(fehler ? '\n' + fehler + ' FEHLER' : '\nGegner-Fairness OK');
process.exit(fehler ? 1 : 0);
