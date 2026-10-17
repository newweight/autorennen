// Test Cockpit-Hilfen (14.10. v21): node tests/test_cockpit.js
// Drehzahl/Gang-Simulation (rein), Wischer-Hilfen, Rechteck-Umrechnung, Config-Plausibilität.
const { ladeModule } = require('./lade.js');
const R = ladeModule(['src/config.js', 'src/cars/carCatalog.js', 'src/ui/rueckspiegel.js', 'src/render/wischer.js', 'src/ui/cockpit.js']);
let fehl = 0;
const ok = (name, bed, info) => { if (!bed) fehl++; console.log((bed ? 'OK   ' : 'FEHL ') + name + (info !== undefined ? ' – ' + info : '')); };
const C = R.config.cockpit, K = R.cockpit;

// --- Drehzahl für alle Autos
R.carCatalog.forEach((a) => {
  const m = K.motor(a), vm = a.fahrwerte.vMax;
  let max = 0, min = 1e9, spruenge = 0, vorher = -1, gaenge = new Set(), monotonGang = true, gOld = 0;
  for (let v = 0; v <= vm * 1.0001; v += vm / 400) {
    const g = K.getriebe(a, v), r = g.rpm;
    max = Math.max(max, r); min = Math.min(min, r); gaenge.add(g.gang);
    if (g.gang < gOld) monotonGang = false; gOld = g.gang;
    if (K.drehzahl(a, v) !== r) ok(a.id + ': drehzahl() = getriebe().rpm', false);
  }
  const leer = K.drehzahl(a, 0), rueck = K.getriebe(a, -3);
  ok(`${a.id}: Leerlauf ${leer} (${m.name}), max ${Math.round(max)} ≤ Rot ${m.rot}·1,02, min ≥ Leerlauf`, leer === m.leerlauf && max <= m.rot * 1.02 + 1 && min >= m.leerlauf - 1);
  ok(`${a.id}: alle ${m.uebers.length} Gänge werden durchlaufen, Gang steigt mit dem Tempo`, gaenge.size === m.uebers.length && monotonGang, [...gaenge].join(','));
  ok(`${a.id}: Rückwärts = Gang −1`, rueck.gang === -1);
  const topRpm = K.drehzahl(a, vm);
  ok(`${a.id}: bei Höchsttempo knapp unter Rot (${Math.round(topRpm)})`, topRpm > m.rot * 0.85 && topRpm <= m.rot);
});
const p = R.carCatalog.finde('porsche-911'), pv = R.carCatalog.finde('passat');
ok('911: Rot 7500, 8 Gänge', K.motor(p).rot === 7500 && K.motor(p).uebers.length === 8);
ok('Passat: Diesel Rot 4500, 7 Gänge', K.motor(pv).rot === 4500 && K.motor(pv).uebers.length === 7);
ok('T-Roc: Benziner Rot 6500', K.motor('troc-cabrio').rot === 6500);
ok('drehzahl(id-String, v, vMax) funktioniert', K.drehzahl('porsche-911', 40, 60) > 0 && K.drehzahl('porsche-911', 40, 60) !== K.drehzahl('porsche-911', 40, 80));
// Stile
['passat', 'polizei', 'multivan', 'troc-cabrio'].forEach((id) => ok('Stil ' + id + ' = vw', K.stilFuer(id) === 'vw'));
ok('Stil porsche-911 = porsche', K.stilFuer('porsche-911') === 'porsche');
['bmw-m4', 'amg-gt', 'audi-rs6', 'mini-cooper', 'formel'].forEach((id) => ok('Stil ' + id + ' = standard (alte Anzeige)', K.stilFuer(id) === 'standard'));

// --- Rechteck-Umrechnung
const rc = R.rueckspiegel.rechteckAus({ x: 50, y: 50, b: 20, h: 10 }, 1000, 500, 1);
ok('rechteckAus: Mitte 50/50, 20 %×10 % von 1000×500', rc.x === 400 && rc.b === 200 && rc.h === 50 && rc.y === 225, JSON.stringify(rc));
const rq = R.rueckspiegel.rechteckAus({ x: 25, y: 90, b: 10 }, 1000, 500, 1);
ok('rechteckAus: ohne h quadratisch (Pixel)', rq.b === 100 && rq.h === 100 && rq.x === 200);
const r2 = R.rueckspiegel.rechteckAus({ x: 25, y: 90, b: 10 }, 1000, 500, 2);
ok('rechteckAus: Faktor 2 skaliert um unten Mitte', Math.abs(r2.b - 200) < 1e-9 && Math.abs((r2.x + r2.b / 2) - 0) < 1e-9 && Math.abs((r2.y + r2.h / 2) - 500 * 0.8) < 1e-9, JSON.stringify(r2));

// --- Wischer
const w = R.wischer;
ok('wischer.art: regen/schnee/hagel ja, klar/nebel/sandsturm nein', ['regen', 'schnee', 'hagel'].every((a) => w.art({ wetterArt: a }) === a) && ['klar', 'nebel', 'sandsturm', 'wind'].every((a) => w.art({ wetterArt: a }) === null) && w.art(null) === null);
const wc = C.wischer;
ok('wischer.winkel: Ruhelage 180°, Umkehrpunkt 180 − Schwenkbereich, weich', w.winkel(0, wc) === 180 && Math.abs(w.winkel(0.5, wc) - (180 - wc.armWinkel)) < 1e-9 && Math.abs(w.winkel(1, wc) - 180) < 1e-9 && w.winkel(0.25, wc) > 180 - wc.armWinkel && w.winkel(0.25, wc) < 180);
ok('wischer.winkel: symmetrisch hin/zurück', Math.abs(w.winkel(0.2, wc) - w.winkel(0.8, wc)) < 1e-9);

// --- Config
const alleElemente = [];
['vw', 'porsche'].forEach((s) => Object.keys(C[s]).forEach((n) => { if (typeof C[s][n] === 'object') alleElemente.push([s + '.' + n, C[s][n]]); }));
alleElemente.push(['spiegel', C.spiegel]);
alleElemente.forEach(([n, e]) => ok('Config ' + n + ': x/y/b in 0..100 und Element liegt im Bild', e.x > 0 && e.x < 100 && e.y > 0 && e.y <= 100 && e.b > 0 && e.b <= 100 && (e.h === undefined || (e.h > 0 && e.h <= 100)) && e.x - e.b / 2 >= -0.01 && e.x + e.b / 2 <= 100.01));
ok('Standardwerte: Spiegel an, Zweispieler aus, Wischer nur Cockpit', C.an && C.spiegel.an && C.spiegel.zweispieler === 'aus' && C.wischer.modi.join() === 'cockpit');
console.log(fehl ? '\n' + fehl + ' FEHLER' : '\nALLE TESTS OK');
process.exit(fehl ? 1 : 0);
