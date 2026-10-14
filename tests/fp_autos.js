// Geometrie-Prüfsumme je Auto: node tests/fp_autos.js [datei.json]  (FNV über Position+Farbe aller Meshes)
const { ladeModule } = require('./lade');
const w = console.warn; console.warn = () => {};
const R = ladeModule(['vendor/three.min.js', 'src/config.js', 'src/cars/carCatalog.js', 'src/cars/carBuilder.js']);
const out = {};
for (const a of R.carCatalog) {
  const g = R.carBuilder.bauen(a); g.updateMatrixWorld(true);
  let h = 2166136261 >>> 0, tris = 0, meshes = 0;
  const mix = (x) => { h ^= x >>> 0; h = Math.imul(h, 16777619) >>> 0; };
  g.traverse((o) => { if (!o.geometry) return; meshes++;
    const p = o.geometry.attributes.position, c = o.geometry.attributes.color; tris += p.count / 3;
    const e = o.matrixWorld.elements;
    for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      mix(Math.round((e[0]*x+e[4]*y+e[8]*z+e[12]) * 1e5)); mix(Math.round((e[1]*x+e[5]*y+e[9]*z+e[13]) * 1e5)); mix(Math.round((e[2]*x+e[6]*y+e[10]*z+e[14]) * 1e5));
      if (c) mix(Math.round(c.getX(i) * 255) * 65536 + Math.round(c.getY(i) * 255) * 256 + Math.round(c.getZ(i) * 255)); } });
  out[a.id] = h.toString(16) + ' ' + meshes + ' ' + tris;
}
require('fs').writeFileSync(process.argv[2] || '/dev/stdout', JSON.stringify(out, null, 1));
