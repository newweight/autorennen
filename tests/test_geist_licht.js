// v27 F6b: node tests/test_geist_licht.js – online.js geist() + carBuilder.setzeLicht: 5x an/aus, Kopienzahl konstant, Opazität 0,6
'use strict';
const fs = require('fs'), path = require('path'), { ladeModule } = require('./lade');
console.warn = () => {};
const R = ladeModule(['vendor/three.min.js', 'src/config.js', 'src/cars/carCatalog.js', 'src/cars/carBuilder.js']);
const src = fs.readFileSync(path.join(__dirname, '..', 'src/net/online.js'), 'utf8');
const i0 = src.indexOf('    geist(mesh) {'), i1 = src.indexOf('    rennenAbbauen()');
const geist = new Function('return {' + src.slice(i0, i1).trim().replace(/\}\s*$/, '}') + '}')().geist;
let ok = 0, fehl = 0; const pruefe = (n, g, i) => { console.log((g ? 'OK   ' : 'FEHL ') + n + (i !== undefined ? '  (' + i + ')' : '')); g ? ok++ : fehl++; };
const mesh = R.carBuilder.bauen(R.carCatalog[0]), ud = mesh.userData, dies = { geisterMat: [] };
geist.call(dies, mesh);
const n0 = dies.geisterMat.length; R.carBuilder.setzeLicht(mesh, true);
const n1 = dies.geisterMat.length, fl0 = ud.fahrlicht ? ud.fahrlicht.material.opacity : null; R.carBuilder.setzeLicht(mesh, false);
for (let i = 0; i < 5; i++) { R.carBuilder.setzeLicht(mesh, true); R.carBuilder.setzeLicht(mesh, false); }
R.carBuilder.setzeLicht(mesh, true);
const n2 = dies.geisterMat.length;
pruefe('Kopienzahl nach 5x an/aus gleich wie nach dem 1. Schalten', n2 === n1, n0 + ' -> ' + n1 + ' -> ' + n2);
pruefe('Fahrlicht-Opazität 0,6', !ud.fahrlicht || Math.abs(ud.fahrlicht.material.opacity - 0.6) < 1e-9, ud.fahrlicht && ud.fahrlicht.material.opacity);
pruefe('Scheinwerfer-Opazität 0,6 (an)', (ud.scheinwerfer || []).every(m => Math.abs(m.material.opacity - 0.6) < 1e-9), (ud.scheinwerfer || []).map(m => m.material.opacity.toFixed(3)).join(','));
R.carBuilder.setzeLicht(mesh, false);
pruefe('Scheinwerfer-Opazität 0,6 (aus)', (ud.scheinwerfer || []).every(m => Math.abs(m.material.opacity - 0.6) < 1e-9));
pruefe('alle Kopien in geisterMat (Freigabe vollständig)', dies.geisterMat.every(m => m.transparent) && new Set(dies.geisterMat).size === n2);
const nicht = R.carBuilder.bauen(R.carCatalog[0]); R.carBuilder.setzeLicht(nicht, true);
pruefe('Nicht-Geist unberührt (kein geistKopie)', nicht.userData.geistKopie === undefined);
console.log('\n' + ok + ' OK, ' + fehl + ' FEHL'); process.exit(fehl ? 1 : 0);
