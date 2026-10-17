// Test Drehzahl-Skalen (17.10. v29, F6/F8): node tests/test_drehzahl.js
// Je Auto: angezeigte Drehzahl (Cockpit) und Motorton-Drehzahl (motorProfile) bleiben unter dem Skalenende; Begrenzer greift bei Vollgas im
// hoechsten Gang (auch bei 125 % Hoechsttempo) nicht ueber die Skala; Diesel <= 6000, Formel >= 10000 bei Vollgas.
const { ladeModule } = require('./lade.js');
const R = ladeModule(['src/config.js', 'src/cars/carCatalog.js', 'src/ui/rueckspiegel.js', 'src/render/wischer.js', 'src/ui/cockpit.js', 'src/audio/motorProfile.js']);
let fehl = 0;
const ok = (n, b, i) => { if (!b) fehl++; console.log((b ? 'OK   ' : 'FEHL ') + n + (i !== undefined ? ' – ' + i : '')); };
const K = R.cockpit, MP = R.MotorProfile;
const DIESEL = ['passat', 'polizei', 'multivan', 'krankenwagen'];
const erw = { diesel: [6000, 4500, 4800], benzin: [8000], porsche: [8000, 7000, 7500], formel: [13000, 11500, 12000] };

const ids = R.carCatalog.map((a) => a.id);
ids.forEach((id) => {
  const a = R.carCatalog.finde(id), m = K.motor(a), vm = a.fahrwerte.vMax, p = MP.fuer(a);
  // Cockpit: Vollgas = Tempo bis 125 % vMax (Boost/Gefaelle)
  let max = 0;
  for (let v = 0; v <= vm * 1.25; v += vm / 500) max = Math.max(max, K.drehzahl(a, v, vm));
  ok(`${id}: Anzeige max ${Math.round(max)} <= Begrenzer ${m.begr} < Skala ${m.skala}`, max <= m.begr + 1e-6 && m.begr < m.skala && m.rot < m.begr + 1);
  // Motorton: hoechster Gang, Tempo bis 125 % -> rpmGang kann ueberschreiten, engine.js klemmt auf rpmMax*0.995
  let maxTon = 0; const n = p.gaenge.length;
  for (let g = 0; g < n; g++) for (let v = 0; v <= vm * 1.25; v += vm / 100) maxTon = Math.max(maxTon, Math.min(p.rpmMax * 0.995, MP.rpmGang(p, g, v, vm)));
  ok(`${id}: Motorton max ${Math.round(maxTon)} <= Skala ${m.skala} (rpmMax ${p.rpmMax}), Leerlauf-Anzeige ${K.drehzahl(a, 0, vm)}`, maxTon <= m.skala && p.rpmMax <= m.skala && p.rpmVmax <= m.begr);
  // Vollgas im hoechsten Gang bei vMax
  const top = K.drehzahl(a, vm, vm), g = K.getriebe(a, vm, vm);
  ok(`${id}: Vollgas bei vMax ${Math.round(top)} U/min im Gang ${g.gang}/${g.gaenge}, <= rot ${m.rot}`, top <= m.rot && g.gang === g.gaenge);
});
DIESEL.forEach((id) => {
  const m = K.motor(id);
  ok(`${id}: Diesel Skala 6000, rot ab 4500, Begrenzer 4800`, m.skala === 6000 && m.rot === 4500 && m.begr === 4800);
  const p = MP.fuer(id);
  ok(`${id}: Motorton-Begrenzer <= 4800 (rpmMax ${p.rpmMax})`, p.rpmMax <= 4800);
});
const f = K.motor('formel'), fa = R.carCatalog.finde('formel');
ok('Formel: Skala 13000, rot ab 11500, Begrenzer 12000, Zahlen 2er-Schritt', f.skala === 13000 && f.rot === 11500 && f.begr === 12000 && f.gross === 2);
ok('Formel: Anzeige bei Vollgas (vMax) >= 10000', K.drehzahl(fa, fa.fahrwerte.vMax) >= 10000, Math.round(K.drehzahl(fa, fa.fahrwerte.vMax)));
ok('Formel: Motorton bei Vollgas (vMax, hoechster Gang) >= 10000', MP.rpmGang(MP.fuer('formel'), MP.fuer('formel').gaenge.length - 1, fa.fahrwerte.vMax, fa.fahrwerte.vMax) >= 10000);
const po = K.motor('porsche-911');
ok('Porsche: Skala 8000, rot ab 7000, Begrenzer 7500', po.skala === 8000 && po.rot === 7000 && po.begr === 7500);
ok('Porsche/Formel: Stil porsche (Drehzahlmesser + Tacho)', K.stilFuer('porsche-911') === 'porsche' && K.stilFuer('formel') === 'porsche');
['troc-cabrio', 'bmw-m4', 'amg-gt', 'audi-rs6', 'mini-cooper'].forEach((id) => ok(id + ': Benziner Skala 8000', K.motor(id).skala === 8000));
// Config: Porsche-Elemente liegen im Bild und ueberlappen sich nicht
const C = R.config.cockpit.porsche, teile = ['linksAussen', 'linksInnen', 'drehzahl', 'tacho', 'rechtsInnen', 'rechtsAussen'].map((n) => ({ n, x0: C[n].x - C[n].b / 2, x1: C[n].x + C[n].b / 2 }));
teile.sort((a, b) => a.x0 - b.x0);
let ueber = false; for (let i = 1; i < teile.length; i++) if (teile[i].x0 < teile[i - 1].x1) ueber = true;
ok('Porsche-Layout: 6 Instrumente ohne Ueberlappung, innerhalb der Tafel', !ueber && teile[0].x0 >= C.tafel.x - C.tafel.b / 2 && teile[5].x1 <= C.tafel.x + C.tafel.b / 2, teile.map((t) => t.n + ':' + t.x0.toFixed(1) + '-' + t.x1.toFixed(1)).join(' '));
console.log(fehl ? '\n' + fehl + ' FEHLER' : '\nALLE TESTS OK');
process.exit(fehl ? 1 : 0);
