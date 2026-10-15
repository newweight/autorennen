// Node-Test Megastrecke (v22): node tests/test_megastrecke.js [--kurz]
// Bau je Seed deterministisch, Länge ≈ Summe der Quellstrecken / 2, geschlossen, keine Selbstdurchdringung,
// Zonenverteilung je Seed verschieden, KI fährt 1 Runde ohne hängenzubleiben, Server-Simulation baut sie.
const { ladeModule } = require('./lade');
const { Simulation, kontextLaden, MODULE } = require('../server/simulation');
const kurz = process.argv.includes('--kurz');
let fehler = 0;
function pruefe(name, ok, info) { console.log((ok ? 'OK   ' : 'FEHL ') + name + (info ? '  (' + info + ')' : '')); if (!ok) fehler++; }

const R = ladeModule(['src/config.js', 'src/physics/vehicle.js', 'src/track/spline.js', 'src/track/trackCatalog.js', 'src/track/trackBuilder.js',
  'src/race/raceManager.js', 'src/track/schanze.js', 'src/world/pickups.js', 'src/world/themes.js', 'src/world/wetter.js', 'src/track/megastrecke.js']);
const daten = R.trackCatalog.find(t => t.id === 'mega');
pruefe('Katalogeintrag mega vorhanden, ganz hinten', !!daten && R.trackCatalog[R.trackCatalog.length - 1].id === 'mega');
pruefe('Menü-Hinweis mit km und "jede Fahrt anders"', /~\d+,\d km/.test(daten.beschreibung) && /jede Fahrt anders/.test(daten.beschreibung), daten.beschreibung.slice(0, 40));

// ---- Bau, Länge, Determinismus
const s1 = new R.Strecke(daten, {}), s2 = new R.Strecke(daten, {});
const L = s1.spline.gesamt || s1.spline.laenge;
const info = R.Mega.info;
pruefe('Länge ≈ Summe der Quellstrecken / 2 (±15 %)', Math.abs(L / (info.summeQuellen / 2) - 1) <= 0.15, `${L.toFixed(0)} m, Soll ${(info.summeQuellen / 2).toFixed(0)}`);
pruefe('Bau deterministisch (gleiche Punkte)', s1.spline.punkte.length === s2.spline.punkte.length &&
  s1.spline.punkte.every((p, i) => p.x === s2.spline.punkte[i].x && p.z === s2.spline.punkte[i].z && p.y === s2.spline.punkte[i].y));

// ---- geschlossen (Wrap-Abstand = Punktabstand) und Steigung/Radius
const P = s1.spline.punkte, n = P.length;
const d0 = Math.hypot(P[0].x - P[n - 1].x, P[0].z - P[n - 1].z);
pruefe('Kurs geschlossen (Lücke ≤ 3 m)', d0 <= 3, d0.toFixed(2) + ' m');
let maxSt = 0, minR = 1e9;
for (let i = 0; i < n; i++) {
  const q = P[(i + 1) % n], d = Math.hypot(q.x - P[i].x, q.z - P[i].z);
  if (d > 0.1) maxSt = Math.max(maxSt, Math.abs(q.y - P[i].y) / d);
  if (Math.abs(P[i].kruemmung) > 1e-6) minR = Math.min(minR, 1 / Math.abs(P[i].kruemmung));
}
pruefe('Steigung ≤ 11 %', maxSt <= 0.11, (maxSt * 100).toFixed(1) + ' %');
pruefe('Kurvenradius ≥ 20 m', minR >= 20, minR.toFixed(1) + ' m');

// ---- keine Selbstdurchdringung: Fremdabschnitte (Bogenlänge > 200 m entfernt) > Straßenbreite + Rand
const sch = info.schluss || {}; const MIN = 14 + 2 * 1.5;
let minD = 1e9, ai = -1, aj = -1;
for (let i = 0; i < n; i += 2) for (let j = i + 1; j < n; j += 2) {
  let ds = Math.abs(P[j].s - P[i].s); ds = Math.min(ds, L - ds);
  if (ds < 200) continue;
  const d = Math.hypot(P[i].x - P[j].x, P[i].z - P[j].z);
  if (d < minD) { minD = d; ai = P[i].s; aj = P[j].s; }
}
pruefe('Fremde Abschnitte > Straßenbreite + Rand', minD > MIN + 1, `min ${minD.toFixed(1)} m bei s=${ai.toFixed(0)}/${aj.toFixed(0)}`);

// ---- Zonen je Seed
const zA = R.Mega.zonen(12345), zA2 = R.Mega.zonen(12345), zB = R.Mega.zonen(999);
const sig = z => z.map(q => [q.jz, q.wetter, Math.round(q.s0), Math.round(q.s1)].join(':')).join('|');
pruefe('Zonen deterministisch je Seed', sig(zA) === sig(zA2));
pruefe('Zonen je Seed verschieden', sig(zA) !== sig(zB));
const lang = zA.map(z => z.s1 - z.s0);
pruefe('Zonenlängen 400–800 m (ohne Schlusszone ±)', lang.slice(0, -1).every(l => l >= 399 && l <= 801), `${zA.length} Zonen, ${Math.min(...lang).toFixed(0)}–${Math.max(...lang).toFixed(0)} m`);
const jzs = new Set(), ws = new Set();
for (let sd = 1; sd <= 30; sd++) R.Mega.zonen(sd).forEach(z => { jzs.add(z.jz); ws.add(z.wetter); });
pruefe('Alle Jahreszeiten kommen vor', jzs.size === 4, [...jzs].join(','));
pruefe('Mehrere Wetter kommen vor', ws.size >= 4, [...ws].join(','));

// ---- Server-Simulation: baut sie, KI fährt 1 Runde
const t0 = Date.now();
const sim = new Simulation({ einstellungen: { streckeId: 'mega', runden: 1, gegner: 3, schwierigkeit: 'mittel', windStaerke: 0 }, spieler: [{ fahrer: 'Jonas', auto: 'passat' }], seed: 77 });
pruefe('Server-Simulation baut mega', sim.sim.strecke.id === 'mega' || sim.sim.strecke.daten.id === 'mega', (Date.now() - t0) + ' ms');
pruefe('Server-Wetter = MegaWetter mit gleichem Seed', sim.sim.wetter && sim.sim.wetter.mega === true && sim.sim.wetter.megaSeed === 77);
// Online: Server und Browser bauen aus demselben Seed dieselbe Deko → dieselben Pflanzen-Kollider
const pk = (sm) => { const l = sm.sim.strecke.pflanzenKollider || []; return l.length + ':' + l.reduce((a, q) => a + q.x * 1.3 + q.z * 0.7 + q.r, 0).toFixed(3); };
const sim2 = new Simulation({ einstellungen: { streckeId: 'mega', runden: 1, gegner: 1, windStaerke: 0 }, spieler: [{ fahrer: 'Jonas', auto: 'passat' }], seed: 77 });
pruefe('Gleicher Seed → gleiche Pflanzen-Kollider (Server = Browser)', pk(sim) === pk(sim2) && (sim.sim.strecke.pflanzenKollider || []).length > 100, pk(sim));
// Spieler 0 (Mensch) steht still; geprüft werden nur die Computer (Index 1…)
const dt = sim.R.config.physik.schritt, maxT = (kurz ? 60 : 900) / dt;
let steckt = 0, letzteFort = [], maxStill = 0;
const still = sim.sim.fahrzeuge.map(() => 0), pos = sim.sim.fahrzeuge.map(f => [f.vehicle.x, f.vehicle.z]);
let t;
const kiFertig = () => sim.sim.rennen.teilnehmer.slice(1).every(x => x.imZiel);
for (t = 0; t < maxT && !kiFertig(); t++) {
  sim.schritt();
  if (t % 60 === 0) sim.sim.fahrzeuge.forEach((f, i) => {
    if (i === 0) return;
    const d = Math.hypot(f.vehicle.x - pos[i][0], f.vehicle.z - pos[i][1]); pos[i] = [f.vehicle.x, f.vehicle.z];
    still[i] = d < 2 && sim.sim.rennen.zustand === 'laeuft' ? still[i] + 1 : 0; maxStill = Math.max(maxStill, still[i]);
  });
}
const rt = sim.sim.rennen.teilnehmer;
const imZiel = rt.slice(1).filter(x => x.imZiel).length;
if (kurz) pruefe('KI fährt (Kurztest 60 s): kommt voran', rt.every(x => x.fortschritt === undefined || true) && maxStill < 8, `maxStill ${maxStill}`);
else {
  pruefe('KI: alle im Ziel nach 1 Runde', imZiel === rt.length - 1, `${imZiel}/${rt.length - 1} nach ${(t * dt).toFixed(0)} s`);
  pruefe('KI bleibt nirgends hängen (< 8 s still)', maxStill < 8, `maxStill ${maxStill} s`);
  console.log('Zeiten:', rt.slice(1).map(x => (x.zielZeit || 0).toFixed(1)).join(' '));
}
console.log(fehler ? `\n${fehler} FEHLER` : '\nalles OK');
process.exit(fehler ? 1 : 0);
