// Node-Test W4 (v28) "Räder": node tests/test_raeder.js
// Wie main.js (Pose aus Position + Steigung + gelaendePose, dann dreheRaeder/lenkeRaeder) für Startaufstellung, Werkstatt-Zufahrt/Fläche und Hang (Alpen):
// nach dem 1., 2. und 100. Frame sind alle Räder uniform skaliert (Skalierung 1, keine Scherung), ohne NaN, und der Radmittelpunkt liegt
// ≈ Radius über dem Boden (hoeheAn am Rad; ±5 cm auf Straße/Fläche, ±10 cm am Hang, wo Nicken/Querneigung die Ecken verschieben).
// Außerdem: Räder drehen nur in laufender Spielzeit (Regel aus main.js: dt nur bei aktiv) – Pause = Räder stehen.
// v28 W4b („Rad verschmolzen"): Pose wie main.js inkl. strecke.radBodenPose; Radhöhe jetzt gegen die SICHTBARE Oberfläche (echte Meshes:
// Straße, Randsteine, Start/Ziel, Boden, Böschung, Werkstatt) statt hoeheAn; dazu Boden-Prüfung (tests/raeder_boden_mess.js) für alle 7 Strecken:
// kein Rad > 1 cm im Boden (Startaufstellung, Fahrbahn, Gras, Brücke, Gabelungs-Insel; Werkstatt-Platte 1,5 cm wegen Farb-Streifen), Startaufstellung
// schwebt ≤ 1 cm.  node tests/test_raeder.js [--schnell]  (--schnell: Boden-Prüfung nur wiese + alpen)
const fs = require('fs'), path = require('path'), vm = require('vm');
const root = path.join(__dirname, '..');
const sb = { console, Math, performance: { now: () => Date.now() } };
sb.window = sb; sb.addEventListener = () => {}; sb.globalThis = sb; sb.self = sb;
const ctx2d = new Proxy({}, { get: () => () => ({ addColorStop() {} }) });
sb.document = { createElement: () => ({ getContext: () => ctx2d, style: {} }) };
vm.createContext(sb);
const log = console.log; console.log = () => {}; const warn = console.warn; console.warn = () => {};
['vendor/three.min.js'].forEach(d => vm.runInContext(fs.readFileSync(path.join(root, d), 'utf8'), sb, { filename: d }));
['src/config.js', 'src/physics/vehicle.js', 'src/physics/collisions.js', 'src/cars/carCatalog.js', 'src/cars/carBuilder.js', 'src/track/spline.js', 'src/track/trackCatalog.js',
  'src/track/trackBuilder.js', 'src/track/schanze.js', 'src/world/themes.js', 'src/world/wetter.js', 'src/track/megastrecke.js', 'src/world/garage.js'].forEach(d => vm.runInContext(fs.readFileSync(path.join(root, d), 'utf8'), sb, { filename: d }));
console.log = log;
const R = sb.Rennspiel, T = sb.THREE;
let fehler = 0;
function pruefe(name, ok, info) { console.log((ok ? 'OK   ' : 'FEHL ') + name + (info ? '  (' + info + ')' : '')); if (!ok) fehler++; }

/** Ein Anzeige-Frame wie main.js: Pose + Rollen + Lenken. aktiv=false → dt wird nicht eingerechnet (Pause). */
function frame(st, f, x, z, heading, vLaengs, lenkung, dt, aktiv) {
  const mesh = f.mesh, d = { x, z, heading, nicken: 0, neigung: 0 };
  d.y = st.hoeheAn(x, z, f.index);
  mesh.position.set(d.x, d.y, d.z);
  const r = { x: -Math.sin(heading), z: -Math.cos(heading) };
  let steigung = Math.atan2(st.hoeheAn(x + r.x * 1.6, z + r.z * 1.6, f.index) - st.hoeheAn(x - r.x * 1.6, z - r.z * 1.6, f.index), 3.2), geleNeig = 0;
  const nah = st.abfrage(x, z); const gw = st.abseitsGewicht ? st.abseitsGewicht(nah) : 0;
  if (gw > 0.001) {
    const gp = st.gelaendePose(x, z, r.x, r.z, f.laenge / 2, f.breite / 2, f.index, f._gp || (f._gp = {}));
    steigung += (gp.nicken - steigung) * gw; geleNeig = gp.neigung * gw; if (gp.dy) mesh.position.y += gp.dy * gw;
  }
  // v28 W4b: wie main.js – Räder auf die sichtbare Oberfläche (Auto steht/rollt langsam: Glättung = Endwert)
  const rb = st.radBodenPose(x, z, heading, mesh.position.y, d.nicken, d.neigung, f._auf || (f._auf = st.radAufstand(mesh)), f.index, st.abfrage(x, z), f.werkstatt || null, f._rb || (f._rb = {}));
  if (rb.ok) { mesh.position.y += rb.dy; steigung = rb.nicken; geleNeig = rb.neigung; }
  mesh.rotation.set(d.nicken + steigung, heading, d.neigung + geleNeig, 'YXZ');
  f.radwinkel -= vLaengs * (aktiv ? dt : 0) / 0.34;
  R.carBuilder.dreheRaeder(mesh, f.radwinkel); R.carBuilder.lenkeRaeder(mesh, -lenkung * 0.5);
  mesh.updateMatrixWorld(true);
  return { gw };
}
const MESS = require('./raeder_boden_mess.js');
/** Messwerte der 4 Räder: Skalierung, Scherung, NaN; Radkontur gegen die sichtbare Oberfläche (feld): sinken (≤ 0) / schweben (≥ 0) in m. */
function messen(st, f, feld) {
  const o = { skal: 0, scher: 0, nan: false, sinken: 0, schweben: 0 };
  MESS.radDaten(T, f, feld).forEach((r) => { if (isFinite(r.gap)) { o.sinken = Math.min(o.sinken, r.gap); o.schweben = Math.max(o.schweben, r.gap); } });
  f.mesh.userData.raeder.forEach((rad) => {
    const e = rad.matrixWorld.elements;
    if (e.some(v => !isFinite(v))) { o.nan = true; return; }
    const sx = Math.hypot(e[0], e[1], e[2]), sy = Math.hypot(e[4], e[5], e[6]), sz = Math.hypot(e[8], e[9], e[10]);
    o.skal = Math.max(o.skal, Math.abs(sx - 1), Math.abs(sy - 1), Math.abs(sz - 1));
    const dot = (a, b) => Math.abs((e[a] * e[b] + e[a + 1] * e[b + 1] + e[a + 2] * e[b + 2]) / (Math.hypot(e[a], e[a + 1], e[a + 2]) * Math.hypot(e[b], e[b + 1], e[b + 2])));
    o.scher = Math.max(o.scher, dot(0, 4), dot(0, 8), dot(4, 8));
  });
  return o;
}
function auto(id) {
  const a = R.carCatalog.find(c => c.id === id), mesh = R.carBuilder.bauen(a);
  const w = a.abmessungen || a.fahrwerte || {};
  return { mesh, radwinkel: 0, index: -1, laenge: w.laenge || 4.5, breite: w.breite || 1.85 };
}
const AUTOS = ['troc-cabrio', 'multivan', 'porsche-911', 'formel', 'mini-cooper'];
const FRAMES = [1, 2, 100];
for (const sid of ['wiese', 'alpen']) {
  const daten = R.trackCatalog.find(d => d.id === sid), st = new R.Strecke(daten, { welt: 'klassisch' });
  const gruppe = st.bauen();
  const w = new R.Werkstatt(st); const platz = w.platz;
  const flaechen = []; gruppe.traverse(o => { if (o.isMesh && MESS.FLAECHEN.has(o.name)) flaechen.push(o); });
  const wg = platz ? w.bauen() : null; if (wg) { wg.updateMatrixWorld(true); wg.children.forEach(o => { if (o.isMesh && o.geometry.type === 'BufferGeometry') flaechen.push(o); }); }
  const feld = MESS.hoehenFeld(T, flaechen);
  // Orte: [Name, s, Querabstand (m, + zur Werkstattseite), Toleranz Schweben (m)] – Sinken überall höchstens 1 cm
  const orte = [['Startaufstellung', 6, -1.5, 0.01], ['Startaufstellung 2. Reihe', 11, 1.5, 0.01]];
  if (platz) { const sg = platz.seite;
    orte.push(['Werkstatt-Zufahrt', platz.s - 20, sg * 3, 0.03], ['Werkstatt-Keil', platz.s - 8, sg * 5, 0.03], ['Werkstatt-Fläche', platz.s, sg * 7, 0.03]);
    if (sid === 'alpen') orte.push(['Hang neben Werkstatt', platz.s, sg * 12, 0.12], ['Hang weit', platz.s + 20, sg * 15, 0.12]); }
  for (const [name, s0, q, tol] of orte) {
    for (const id of AUTOS) {
      const f = auto(id); f.werkstatt = platz ? w : null; const p = st.spline.punktBei(st.spline.wrapS(s0));
      const x = p.x + p.nx * q, z = p.z + p.nz * q, h = Math.atan2(-p.tx, -p.tz);
      const erg = [];
      for (let k = 1; k <= 100; k++) {
        frame(st, f, x, z, h, 12, 0.6 * Math.sin(k / 9), 1 / 60, true);
        if (FRAMES.includes(k)) erg.push(messen(st, f, feld));
      }
      const skal = Math.max(...erg.map(e => e.skal)), scher = Math.max(...erg.map(e => e.scher)), nan = erg.some(e => e.nan);
      const sinken = Math.min(...erg.map(e => e.sinken)), schweben = Math.max(...erg.map(e => e.schweben));
      pruefe(`[${sid}] ${name} / ${id}: Frame 1,2,100 uniform skaliert, keine NaN, kein Rad > 1 cm im Boden, schwebt ≤ ${tol * 100} cm`, skal < 1e-6 && scher < 1e-6 && !nan && sinken >= -0.01 && schweben <= tol,
        `Skal ${skal.toExponential(1)}, Scherung ${scher.toExponential(1)}, NaN ${nan}, sinkt ${(-sinken * 100).toFixed(1)} cm, schwebt ${(schweben * 100).toFixed(1)} cm`);
    }
  }
}
// Pause: Auto mit 13 m/s, Pause (aktiv=false) mit dt 1 s → Räder drehen nicht; laufend (aktiv) schon
{
  const st = new R.Strecke(R.trackCatalog.find(d => d.id === 'wiese'), { welt: 'klassisch' }); st.bauen();
  const f = auto('troc-cabrio'), p = st.spline.punktBei(30), h = Math.atan2(-p.tx, -p.tz);
  frame(st, f, p.x, p.z, h, 13, 0, 1 / 60, true); const a0 = f.radwinkel;
  for (let k = 0; k < 60; k++) frame(st, f, p.x, p.z, h, 13, 0, 1 / 60, false);
  pruefe('Pause: Räder drehen nicht weiter (Radwinkel unverändert)', f.radwinkel === a0, `Δ ${(f.radwinkel - a0).toFixed(3)} rad`);
  for (let k = 0; k < 60; k++) frame(st, f, p.x, p.z, h, 13, 0, 1 / 60, true);
  pruefe('Laufend: Räder drehen (≈ v·t/0,34)', Math.abs((f.radwinkel - a0) + 13 / 0.34) < 1e-6, `Δ ${(f.radwinkel - a0).toFixed(2)} rad`);
}
// Quelltext-Prüfung: main.js rechnet dt nur bei aktiv ein
{
  const m = fs.readFileSync(path.join(root, 'src/main.js'), 'utf8');
  pruefe('main.js: radwinkel nur mit (aktiv ? dt : 0)', /f\.radwinkel -= v\.vLaengs \* \(aktiv \? dt : 0\) \/ 0\.34/.test(m));
  pruefe('main.js (v28 W4b): Anzeige-Pose über strecke.radBodenPose (Räder auf der sichtbaren Oberfläche)', /this\.strecke\.radBodenPose\(d\.x, d\.z, d\.heading, mesh\.position\.y/.test(m));
}
// v28 W4b: Boden-Prüfung (alle 9 Autos auf allen Startplätzen, Werkstatt, Fahrbahn, Gras, Brücke, Gabelungs-Insel; Pose wie main.js)
{
  const nur = process.argv.includes('--schnell') ? ['wiese', 'alpen'] : null;
  const alt = console.log; let zeilen; console.log = () => {};
  try { zeilen = MESS.main('nachher', nur); } finally { console.log = alt; }
  for (const z of zeilen) {
    const grenze = /Werkstatt-Fläche/.test(z.ort) ? -1.5 : /Fahrbahn|Gras|Kreuzung/.test(z.ort) && /alpen|mega|fantasie/.test(z.strecke) ? -3 : -1;   // cm
    const ok = z.min >= grenze && (z.ort !== 'Startaufstellung' || z.max <= 1);
    pruefe(`[${z.strecke}] Boden ${z.ort}: tiefstes Rad ≥ ${grenze} cm${z.ort === 'Startaufstellung' ? ', schwebt ≤ 1 cm' : ''}`, ok, `min ${z.min} / max ${z.max} cm, Mitte ${z.p50}, 95 % ${z.p95} cm, n ${z.n}`);
  }
}
console.log(fehler ? `\n${fehler} FEHLER` : '\nALLE TESTS OK');
process.exit(fehler ? 1 : 0);
