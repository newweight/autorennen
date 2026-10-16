// Node-Test W6 (v28) Strohballen-Geometrie: node tests/test_stroh_kappen.js
// Rundballen (dynamik.js _strohGeo): Mantel UND beide Stirnseiten (Kappen) müssen nach außen zeigen (sonst sind die Kappen von außen unsichtbar
// und der Ballen wirkt wie ein offenes Rohr = „vordere Begrenzung fehlt“). Entartete Dreiecke (Mittelpunkt, Fläche 0) zählen nicht.
const fs = require('fs'), path = require('path'), vm = require('vm');
const root = path.join(__dirname, '..');
const sb = { console, Math, performance: { now: () => Date.now() } };
sb.window = sb; sb.addEventListener = () => {}; sb.globalThis = sb; sb.self = sb;
const ctx2d = new Proxy({}, { get: () => () => ({ addColorStop() {} }) });
sb.document = { createElement: () => ({ getContext: () => ctx2d, style: {} }) };
vm.createContext(sb);
const log = console.log; console.log = () => {}; console.warn = () => {};
['vendor/three.min.js', 'src/config.js', 'src/physics/vehicle.js', 'src/physics/collisions.js', 'src/cars/carCatalog.js', 'src/track/spline.js', 'src/track/trackCatalog.js',
  'src/track/trackBuilder.js', 'src/track/schanze.js', 'src/world/themes.js', 'src/world/dynamik.js'].forEach(d => vm.runInContext(fs.readFileSync(path.join(root, d), 'utf8'), sb, { filename: d }));
console.log = log;
const R = sb.Rennspiel, V = sb.THREE.Vector3;
let fehler = 0;
function pruefe(name, ok, info) { console.log((ok ? 'OK   ' : 'FEHL ') + name + (info ? '  (' + info + ')' : '')); if (!ok) fehler++; }
const st = new R.Strecke(R.trackCatalog.find(t => t.id === 'wiese'), { welt: 'hindernisse' }); st.bauen && st.bauen();
const geo = new R.Dynamik(st, { seed: 1 })._strohGeo(), p = geo.attributes.position;
const z = { mantelAussen: 0, mantelInnen: 0, kappeAussen: [0, 0], kappeInnen: [0, 0] };   // Kappen je Seite (y > 0, y < 0)
for (let i = 0; i < p.count; i += 3) {
  const a = new V(p.getX(i), p.getY(i), p.getZ(i)), b = new V(p.getX(i + 1), p.getY(i + 1), p.getZ(i + 1)), c = new V(p.getX(i + 2), p.getY(i + 2), p.getZ(i + 2));
  const n = b.clone().sub(a).cross(c.clone().sub(a)); if (n.length() < 1e-9) continue;
  const m = a.clone().add(b).add(c).divideScalar(3);
  const kappe = [a, b, c].every(v => Math.abs(Math.abs(v.y) - 0.5) < 1e-6);
  if (kappe) { const k = m.y > 0 ? 0 : 1, aus = n.y * Math.sign(m.y) > 0; (aus ? z.kappeAussen : z.kappeInnen)[k]++; }
  else (n.x * m.x + n.z * m.z > 0 ? z.mantelAussen++ : z.mantelInnen++);
}
pruefe('Mantel zeigt nach außen', z.mantelInnen === 0 && z.mantelAussen > 0, JSON.stringify(z));
pruefe('Kappe +y (Stirnseite) zeigt nach außen', z.kappeInnen[0] === 0 && z.kappeAussen[0] > 0);
pruefe('Kappe −y (Stirnseite) zeigt nach außen', z.kappeInnen[1] === 0 && z.kappeAussen[1] > 0);
console.log(fehler ? `\n${fehler} FEHLER` : '\nALLE TESTS OK'); process.exit(fehler ? 1 : 0);
