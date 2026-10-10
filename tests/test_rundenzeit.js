// Rundenzeit-Check für alle Katalog-Strecken (oder eine: node tests/test_rundenzeit.js [streckenId]).
// a) KI-Fahrer (ai/driver.js) je Schwierigkeit allein auf der Strecke, 2 Runden, ohne Kollisionen.
//    Prüfkriterium: KI 'mittel' Runde 1 (stehender Start) 100–140 s, kein Abseits, kein Reset.
// b) Einfacher Mittellinien-Fahrer (Lenkung zum Punkt 12 m voraus, Gas unter Ideallinien-Tempo)
//    als Gegenprobe der Ideallinie – nur Info, plus: bleibt auf Straße + Randstreifen.
const { ladeModule } = require('./lade');
const R = ladeModule(['src/config.js', 'src/physics/vehicle.js', 'src/track/spline.js',
  'src/track/trackCatalog.js', 'src/track/trackBuilder.js', 'src/race/raceManager.js', 'src/physics/collisions.js', 'src/ai/driver.js']);

const dt = R.config.physik.schritt;
const nurId = process.argv[2];
let fehler = 0;
function pruefe(name, ok, info) { console.log((ok ? 'OK   ' : 'FEHL ') + name + (info ? '  (' + info + ')' : '')); if (!ok) fehler++; }
const fmt = (x) => (x === undefined || x === null ? '-' : x.toFixed(1) + ' s');

/** KI-Fahrer allein, 2 Runden. */
function kiRunde(strecke, stufe) {
  const start = strecke.startpositionen(1)[0];
  const v = new R.Vehicle({});
  v.setzen(start.x, start.z, start.heading);
  const rennen = new R.RaceManager(strecke, [{ vehicle: v, name: 'KI', istSpieler: false }], { runden: 2, countdown: 0 });
  const d = new R.Driver(v, strecke, { schwierigkeit: stufe, seed: 7, name: 'KI' });
  const t = rennen.teilnehmer[0];
  let index = -1, abseits = 0, zeit = 0, maxAbstand = 0;
  for (let k = 0; k < 60 * 500 && !t.imZiel; k++) {
    const s = d.steuerung(dt, { andere: [], spielerFortschrittMax: null, eigenerFortschritt: t.fortschritt, laeuft: true });
    const n = strecke.abfrage(v.x, v.z, index);
    index = n.index;
    v.untergrund = n.untergrund;
    if (n.untergrund === 'gras' || n.untergrund === 'sand') abseits += dt;
    maxAbstand = Math.max(maxAbstand, n.abstand);
    v.schritt(dt, s);
    v.y = strecke.hoeheAn(v.x, v.z);
    rennen.schritt(dt);
    zeit += dt;
  }
  return { r1: t.rundenzeiten[0], r2: t.rundenzeiten[1], imZiel: t.imZiel, abseits, maxAbstand, reset: d.brauchtReset };
}

/** Einfacher Mittellinien-Fahrer (Gegenprobe). */
function einfacheRunde(strecke) {
  const sp = strecke.spline;
  const start = strecke.startpositionen(1)[0];
  const v = new R.Vehicle({});
  v.setzen(start.x, start.z, start.heading);
  const rennen = new R.RaceManager(strecke, [{ vehicle: v, name: 'Test', istSpieler: true }], { runden: 2, countdown: 0 });
  const t = rennen.teilnehmer[0];
  let index = -1, maxAbseits = 0, vMax = 0;
  const zeiten = [];
  rennen.bei('runde', (tt, z) => zeiten.push(z));
  for (let k = 0; k < 60 * 600 && t.runde < 2; k++) {
    const n = strecke.abfrage(v.x, v.z, index);
    index = n.index;
    v.untergrund = n.untergrund;
    maxAbseits = Math.max(maxAbseits, n.abstand);
    const ziel = sp.punktBei(n.s + 12);
    const hZiel = R.headingAus(ziel.x - v.x, ziel.z - v.z);
    let diff = hZiel - v.heading;
    while (diff > Math.PI) diff -= 2 * Math.PI;
    while (diff < -Math.PI) diff += 2 * Math.PI;
    const lenkung = Math.max(-1, Math.min(1, -diff * 4));   // heading größer = links = negativ
    const soll = strecke.tempoBei(n.s);
    v.schritt(dt, v.vLaengs < soll ? { gas: 1, bremse: 0, lenkung } : { gas: 0, bremse: 1, lenkung });
    v.y = strecke.hoeheAn(v.x, v.z);
    vMax = Math.max(vMax, v.vLaengs);
    rennen.schritt(dt);
  }
  return { zeiten, maxAbseits, vMax };
}

const tabelle = [];
for (const daten of R.trackCatalog) {
  if (nurId && daten.id !== nurId) continue;
  const strecke = new R.Strecke(daten);
  console.log('\n=== ' + daten.name + ' (' + strecke.laenge.toFixed(0) + ' m, Breite ' + strecke.breite + ' m) ===');
  const zeile = { id: daten.id, laenge: strecke.laenge };
  for (const stufe of ['leicht', 'mittel', 'schwer', 'unfair']) {
    const e = kiRunde(strecke, stufe);
    zeile[stufe] = e.r1;
    console.log(`KI ${stufe.padEnd(7)} Runde 1 ${fmt(e.r1)}, Runde 2 ${fmt(e.r2)} | abseits ${e.abseits.toFixed(1)} s | max. Abstand ${e.maxAbstand.toFixed(1)} m`);
    if (stufe === 'mittel') {
      pruefe(`[${daten.id}] KI mittel: Runde 1 in 100–140 s, im Ziel, kein Reset`,
        e.imZiel && e.r1 >= 100 && e.r1 <= 140 && !e.reset, fmt(e.r1));
      pruefe(`[${daten.id}] KI mittel: bleibt auf Straße + Rand`, e.abseits === 0, 'max. ' + e.maxAbstand.toFixed(1) + ' m');
    }
  }
  const ef = einfacheRunde(strecke);
  console.log(`Einfacher Fahrer: Runde 1 ${fmt(ef.zeiten[0])}, Runde 2 ${fmt(ef.zeiten[1])} | Ø ${ef.zeiten[1] ? (strecke.laenge / ef.zeiten[1] * 3.6).toFixed(0) : '-'} km/h | max ${(ef.vMax * 3.6).toFixed(0)} km/h`);
  pruefe(`[${daten.id}] Einfacher Fahrer: 2 Runden, auf Straße + Rand`,
    ef.zeiten.length === 2 && ef.maxAbseits < strecke.breite / 2 + strecke.randBreite, 'max. Abstand ' + ef.maxAbseits.toFixed(1) + ' m');
  tabelle.push(zeile);
}
console.log('\nStrecke  Länge   leicht  mittel  schwer  unfair  (Runde 1, stehender Start)');
tabelle.forEach(z => console.log(z.id.padEnd(8), (z.laenge.toFixed(0) + ' m').padEnd(7),
  ['leicht', 'mittel', 'schwer', 'unfair'].map(s => fmt(z[s]).padStart(7)).join(' ')));
console.log(fehler === 0 ? '\nALLE TESTS OK' : '\n' + fehler + ' FEHLER');
process.exit(fehler ? 1 : 0);
