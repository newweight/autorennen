// Runde 4: Node-Test Jahreszeit/Wetter/Wind (ohne THREE): node tests/test_wetter.js
const { ladeModule } = require('./lade');
const R = ladeModule(['src/config.js', 'src/physics/vehicle.js', 'src/world/wetter.js']);
const W = R.Wetter, C = R.config;
let fehler = 0;
function pruefe(name, ok, info) { console.log((ok ? 'OK   ' : 'FEHL ') + name + (info ? '  (' + info + ')' : '')); if (!ok) fehler++; }
const nah = (a, b, e) => Math.abs(a - b) < (e || 1e-9);

// 1) Standard = Sommer, klar, Wind 0 → neutrale Umwelt
{
  const w = new W(null, { thema: 'wiese' });
  const u = w.umwelt();
  pruefe('Standard: Sommer/klar/Wind 0', w.jahreszeit === 'sommer' && w.wetterArt === 'klar' && w.windStaerke === 0,
    w.jahreszeit + '/' + w.wetterArt + '/' + w.windStaerke);
  pruefe('Standard: Umwelt neutral (Faktoren 1, kein Wind)', u.gripFaktor === 1 && u.bremsFaktor === 1 && u.windX === 0 && u.windZ === 0);
  pruefe('umwelt() liefert immer dasselbe Objekt (keine Allokation)', w.umwelt() === u);
}
// 2) Umwelt-Faktoren je Wetter (Vorgabe)
{
  const soll = { regen: [0.85, 0.8], hagel: [0.75, 0.7], schnee: [0.6, 0.6], nebel: [1, 1], sandsturm: [0.9, 0.9], klar: [1, 1] };
  Object.keys(soll).forEach((art) => {
    const u = W.umweltAus({ wetter: art, windStaerke: 0, windRichtung: 0 });
    pruefe('Faktoren ' + art, u.gripFaktor === soll[art][0] && u.bremsFaktor === soll[art][1], u.gripFaktor + ' / ' + u.bremsFaktor);
  });
}
// 3) Erlaubte Wetter je Jahreszeit/Thema
{
  const gleich = (a, b) => a.length === b.length && a.every(x => b.includes(x));
  pruefe('Frühling: klar/regen', gleich(W.erlaubt('wiese', 'fruehling'), ['klar', 'regen']));
  pruefe('Sommer: klar/regen', gleich(W.erlaubt('wald', 'sommer'), ['klar', 'regen']));
  pruefe('Herbst: klar/regen/hagel/nebel', gleich(W.erlaubt('wiese', 'herbst'), ['klar', 'regen', 'hagel', 'nebel']));
  pruefe('Winter: klar/schnee/hagel', gleich(W.erlaubt('wald', 'winter'), ['klar', 'schnee', 'hagel']));
  let wuesteOhneSchnee = true, sandNurWueste = true;
  Object.keys(C.jahreszeiten).forEach((jz) => {
    const l = W.erlaubt('wueste', jz);
    if (l.includes('schnee') || l.includes('hagel')) wuesteOhneSchnee = false;
    ['wiese', 'wald', 'fantasie'].forEach(t => { if (W.erlaubt(t, jz).includes('sandsturm')) sandNurWueste = false; });
  });
  pruefe('Wüste: nie Schnee/Hagel', wuesteOhneSchnee);
  pruefe('Wüste Winter: klar/sandsturm', gleich(W.erlaubt('wueste', 'winter'), ['klar', 'sandsturm']));
  pruefe('Sandsturm nur in der Wüste', sandNurWueste);
  const w = new W(null, { thema: 'wueste', jahreszeit: 'winter', wetter: 'schnee' });
  pruefe('Schnee in der Wüste gewählt → klar', w.wetterArt === 'klar', w.wetterArt);
  const h = new W(null, { thema: 'wiese', jahreszeit: 'sommer', wetter: 'hagel' });
  pruefe('Hagel im Sommer gewählt → klar', h.wetterArt === 'klar', h.wetterArt);
  const s = new W(null, { thema: 'wueste', jahreszeit: 'winter', wetter: 'sandsturm' });
  pruefe('Sandsturm: Wind mindestens Stufe 3', s.windStaerke >= 3, 'Stufe ' + s.windStaerke);
  const wd = W.jahreszeitDaten('wueste', 'winter');
  pruefe('Wüste Winter: kein weißer Boden/Schneerand', !wd.bodenMisch && !wd.randSchnee);
}
// 4) 'zufall' deterministisch mit seed, erlaubt, verschiedene Seeds streuen
{
  const opt = (seed) => ({ thema: 'wiese', jahreszeit: 'zufall', wetter: 'zufall', wind: { staerke: 'zufall', richtung: 'zufall' }, seed });
  const a = new W(null, opt(123)), b = new W(null, opt(123));
  pruefe('Zufall mit gleichem Seed identisch', a.jahreszeit === b.jahreszeit && a.wetterArt === b.wetterArt &&
    a.windStaerke === b.windStaerke && a.windRichtung === b.windRichtung,
    a.jahreszeit + '/' + a.wetterArt + '/' + a.windStaerke + '/' + a.windRichtung.toFixed(3));
  const jz = new Set(), we = new Set(), st = new Set();
  let alleErlaubt = true;
  for (let s = 0; s < 200; s++) {
    const w = new W(null, opt(s));
    jz.add(w.jahreszeit); we.add(w.wetterArt); st.add(w.windStaerke);
    if (!W.erlaubt('wiese', w.jahreszeit).includes(w.wetterArt)) alleErlaubt = false;
    if (w.windRichtung < 0 || w.windRichtung >= 2 * Math.PI) alleErlaubt = false;
  }
  pruefe('Zufall: alle 4 Jahreszeiten, ≥ 4 Wetter, Stufen 1–5 kommen vor', jz.size === 4 && we.size >= 4 && st.size === 5 && !st.has(0),
    [...jz].join(',') + ' | ' + [...we].join(',') + ' | ' + [...st].sort().join(','));
  pruefe('Zufall: Wetter immer erlaubt, Richtung in [0, 2π)', alleErlaubt);
  const f = new W(null, { thema: 'wald', wind: { staerke: 3, richtung: 'zufall' }, seed: 9 });
  const g = new W(null, { thema: 'wald', wind: { staerke: 3, richtung: 'zufall' }, seed: 10 });
  pruefe('Zufallswind: anderer Seed → andere Richtung', f.windRichtung !== g.windRichtung);
  const k = new W(null, { thema: 'wald', wind: { staerke: 9, richtung: 1 } });
  pruefe('Windstärke auf 0–5 begrenzt, feste Richtung bleibt', k.windStaerke === 5 && k.windRichtung === 1);
}
// 5) Wind-Projektion: Richtung wie heading (0 = weht nach −z)
{
  const u = W.umweltAus({ wetter: 'klar', windStaerke: 5, windRichtung: 0 });
  pruefe('Wind Richtung 0, Stufe 5 → (0, −5)', nah(u.windX, 0) && nah(u.windZ, -5), u.windX.toFixed(3) + ', ' + u.windZ.toFixed(3));
  const vor = W.windRelativ(u, 0);                 // Auto fährt nach −z → Rückenwind
  pruefe('Auto fährt mit dem Wind: laengs = +1, seitlich = 0', nah(vor.laengs, 1) && nah(vor.seitlich, 0));
  const gegen = W.windRelativ(u, Math.PI);         // Auto fährt nach +z → Gegenwind
  pruefe('Auto fährt gegen den Wind: laengs = −1', nah(gegen.laengs, -1) && nah(gegen.seitlich, 0));
  const quer = W.windRelativ(u, Math.PI / 2);      // Auto blickt nach −x, rechts = −z → Wind drückt nach rechts
  pruefe('Wind von links (Auto nach −x): seitlich = +1 (nach rechts)', nah(quer.seitlich, 1) && nah(quer.laengs, 0),
    quer.seitlich.toFixed(3) + ' / ' + quer.laengs.toFixed(3));
  const w = new W(null, { thema: 'wiese', wind: { staerke: 2, richtung: Math.PI / 2 } });
  const v = new R.Vehicle({}); v.heading = 0;      // Wind weht nach −x, Auto nach −z: rechts = +x → Wind drückt nach links
  const r = w.windFuer(v);
  pruefe('windFuer: Stufe 2 von rechts → seitlich −0,4', nah(r.seitlich, -0.4) && nah(r.laengs, 0) && r.staerke === 2,
    r.seitlich.toFixed(3));
  pruefe('windFuer: liefert wiederverwendetes Objekt', w.windFuer(v) === r);
  // Physik und Helfer rechnen dieselbe Projektion
  v.vLaengs = 30; v.schritt(1 / 60, { gas: 1, bremse: 0, lenkung: 0 }, undefined, w.umwelt());
  pruefe('vehicle.windSeite = windFuer().seitlich', nah(v.windSeite, -0.4, 1e-3), v.windSeite.toFixed(3));
}
// 6) Gegen-/Rückenwind ±3 % vMax je Stufe (Endtempo nach 60 s Vollgas)
{
  const lauf = (richtung, st) => {
    const v = new R.Vehicle({});
    const u = W.umweltAus({ wetter: 'klar', windStaerke: st, windRichtung: richtung });
    for (let i = 0; i < 60 * 60; i++) v.schritt(1 / 60, { gas: 1, bremse: 0, lenkung: 0 }, undefined, u);
    return v.vLaengs;
  };
  const vMax = 240 / 3.6, ohne = lauf(0, 0), rueck = lauf(0, 5), gegen = lauf(Math.PI, 5), gegen1 = lauf(Math.PI, 1);
  pruefe('Rückenwind 5: Endtempo ≈ +15 %', nah(rueck / vMax, 1.15, 0.01), (rueck * 3.6).toFixed(1) + ' km/h');
  pruefe('Gegenwind 5: Endtempo ≈ −15 %', nah(gegen / vMax, 0.85, 0.01), (gegen * 3.6).toFixed(1) + ' km/h');
  pruefe('Gegenwind 1: Endtempo ≈ −3 %', nah(gegen1 / vMax, 0.97, 0.01), (gegen1 * 3.6).toFixed(1) + ' km/h');
  pruefe('Kein Wind: Endtempo = vMax', nah(ohne / vMax, 1, 0.01), (ohne * 3.6).toFixed(1) + ' km/h');
}
// 7) Jahreszeit-Daten: Sommer neutral (Standard sieht aus wie bisher)
{
  const s = W.jahreszeitDaten('wiese', 'sommer');
  pruefe('Sommer: keine Farbmischung, Licht unverändert', !s.laub && !s.bodenMisch && !s.himmelMisch && !s.nebelMisch &&
    s.sichtweiteFaktor === 1 && s.sonnenHoehe === null && s.lichtFaktor === 1);
  pruefe('Mischfarbe: 0x000000 ↔ 0xffffff zur Hälfte = 0x808080', W.mischHex(0, 0xffffff, 0.5) === 0x808080);
}

console.log(fehler === 0 ? '\nALLE TESTS OK' : '\n' + fehler + ' FEHLER');
process.exit(fehler ? 1 : 0);
