// v28 W4b: Räder gegen die SICHTBARE Oberfläche (echte Meshes: Boden, Böschung, Straße, Randsteine, Start/Ziel, Gabelung, Werkstatt …).
// node tests/raeder_boden_mess.js [vorher|nachher] [streckenIds,…]   → Tabelle je Ort: min/max (Radunterkante − Oberfläche) in cm (negativ = im Boden)
// Pose wie main.js (_frameRumpf): v.y = hoeheAn(x, z, index), Nicken aus ±1,6 m, abseits gelaendePose (v20); 'nachher' zusätzlich Strecke.radBodenPose (W4b).
const fs = require('fs'), path = require('path'), vm = require('vm');
const root = path.join(__dirname, '..');
function laden() {
  const sb = { console, Math, performance: { now: () => Date.now() } };
  sb.window = sb; sb.addEventListener = () => {}; sb.globalThis = sb; sb.self = sb;
  const ctx2d = new Proxy({}, { get: () => () => ({ addColorStop() {} }) });
  sb.document = { createElement: () => ({ getContext: () => ctx2d, style: {} }) };
  vm.createContext(sb);
  const log = console.log, warn = console.warn; console.log = () => {}; console.warn = () => {};
  ['vendor/three.min.js', 'src/config.js', 'src/physics/vehicle.js', 'src/physics/collisions.js', 'src/cars/carCatalog.js', 'src/cars/carBuilder.js', 'src/track/spline.js', 'src/track/trackCatalog.js',
    'src/track/trackBuilder.js', 'src/track/schanze.js', 'src/world/themes.js', 'src/world/wetter.js', 'src/track/megastrecke.js', 'src/world/garage.js'].forEach(d => vm.runInContext(fs.readFileSync(path.join(root, d), 'utf8'), sb, { filename: d }));
  console.log = log; console.warn = warn;
  return sb;
}
const FLAECHEN = new Set(['Boden', 'Boeschung', 'Strasse', 'Mittellinie', 'Randsteine', 'StartZiel', 'Gabelung', 'Senke', 'Bruecke', 'Ueberfuehrung', 'Kreuzungsplatte', 'Kreuzungszeichen']);
/** Höhenfeld über Dreiecke: höchste Fläche über (x, z), die nicht höher als yMax liegt. */
function hoehenFeld(T, meshes) {
  const B = 8, tab = new Map(), tris = [], v = new T.Vector3();
  for (const m of meshes) {
    m.updateMatrixWorld(true);
    const g = m.geometry, p = g.attributes.position, idx = g.index ? g.index.array : null, n = idx ? idx.length : p.count;
    const W = (i) => { v.fromBufferAttribute(p, i).applyMatrix4(m.matrixWorld); return [v.x, v.y, v.z]; };
    for (let i = 0; i < n; i += 3) {
      const a = W(idx ? idx[i] : i), b = W(idx ? idx[i + 1] : i + 1), c = W(idx ? idx[i + 2] : i + 2);
      const t = a.concat(b, c), k = tris.push(t) - 1;
      const x0 = Math.floor(Math.min(t[0], t[3], t[6]) / B), x1 = Math.floor(Math.max(t[0], t[3], t[6]) / B);
      const z0 = Math.floor(Math.min(t[2], t[5], t[8]) / B), z1 = Math.floor(Math.max(t[2], t[5], t[8]) / B);
      if (x1 - x0 > 50 || z1 - z0 > 50) continue;
      for (let gx = x0; gx <= x1; gx++) for (let gz = z0; gz <= z1; gz++) { const key = gx * 100003 + gz; (tab.get(key) || tab.set(key, []).get(key)).push(k); }
    }
  }
  return (x, z, yMax) => {
    const l = tab.get(Math.floor(x / B) * 100003 + Math.floor(z / B));
    let top = -Infinity;
    if (!l) return top;
    for (const k of l) {
      const t = tris[k];
      const d = (t[5] - t[8]) * (t[0] - t[6]) + (t[6] - t[3]) * (t[2] - t[8]);
      if (Math.abs(d) < 1e-12) continue;
      const u = ((t[5] - t[8]) * (x - t[6]) + (t[6] - t[3]) * (z - t[8])) / d, w2 = ((t[8] - t[2]) * (x - t[6]) + (t[0] - t[6]) * (z - t[8])) / d, w = 1 - u - w2;
      if (u < -1e-4 || w2 < -1e-4 || w < -1e-4) continue;
      const y = u * t[1] + w2 * t[4] + w * t[7];
      if (y <= yMax && y > top) top = y;
    }
    return top;
  };
}
/** Anzeige-Pose wie main.js (alpha 1, kein Flug/Looping, Auto steht: nicken/neigung 0). */
function pose(R, st, f, x, z, heading, modus) {
  const mesh = f.mesh;
  let n = st.abfrage(x, z, f.index); f.index = n.index; n = st.abfrage(x, z, f.index); f.index = n.index; f.nah = n;
  const y = st.hoeheAn(x, z, f.index);
  mesh.position.set(x, y, z);
  const r = { x: -Math.sin(heading), z: -Math.cos(heading) };
  let steigung = Math.atan2(st.hoeheAn(x + r.x * 1.6, z + r.z * 1.6, f.index) - st.hoeheAn(x - r.x * 1.6, z - r.z * 1.6, f.index), 3.2), geleNeig = 0;
  const gw = st.abseitsGewicht ? st.abseitsGewicht(f.nah) : 0;
  if (gw > 0.001) {
    const gp = st.gelaendePose(x, z, r.x, r.z, f.laenge / 2, f.breite / 2, f.index, {});
    steigung += (gp.nicken - steigung) * gw; geleNeig = gp.neigung * gw; if (gp.dy) mesh.position.y += gp.dy * gw;
  }
  if (modus === 'nachher' && st.radBodenPose) {
    const rb = st.radBodenPose(x, z, heading, mesh.position.y, 0, 0, f._auf || (f._auf = st.radAufstand(mesh)), f.index, f.nah, f.werkstatt, f._rb || (f._rb = {}));
    if (rb.ok) { mesh.position.y += rb.dy; steigung = rb.nicken; geleNeig = rb.neigung; }
  }
  mesh.rotation.set(steigung, heading, geleNeig, 'YXZ');
  mesh.updateMatrixWorld(true);
}
/** Je Rad: kleinster Abstand der unteren Radscheibe (Bogen ±60° um den tiefsten Punkt, Reifen-Außenkontur = Radius) zur Oberfläche (feld). */
function radDaten(T, f, feld) {
  const out = [], ax = new T.Vector3(), w = new T.Vector3(), u = new T.Vector3(), up = new T.Vector3(0, 1, 0);
  f.mesh.userData.raeder.forEach((rad) => {
    if (!rad.geometry.boundingBox) rad.geometry.computeBoundingBox();
    const bb = rad.geometry.boundingBox, radius = (bb.max.y - bb.min.y) / 2;
    const e = rad.matrixWorld.elements;
    ax.set(e[0], e[1], e[2]).normalize();
    w.copy(up).addScaledVector(ax, -up.dot(ax)).normalize(); u.crossVectors(ax, w);
    let gap = Infinity, unten = Infinity, wo = null;
    for (let g = -60; g <= 60; g += 5) {
      const t = g * Math.PI / 180, px = e[12] + radius * (-w.x * Math.cos(t) + u.x * Math.sin(t)), py = e[13] + radius * (-w.y * Math.cos(t) + u.y * Math.sin(t)), pz = e[14] + radius * (-w.z * Math.cos(t) + u.z * Math.sin(t));
      unten = Math.min(unten, py);
      if (!feld) continue;
      const ob = feld(px, pz, e[13]);
      if (isFinite(ob) && py - ob < gap) { gap = py - ob; wo = [px, py, pz, g]; }
    }
    out.push({ x: e[12], y: e[13], z: e[14], unten, radius, gap, wo });
  });
  return out;
}
function main(modusArg, nurArg) {
  const modus = modusArg || process.argv[2] || 'vorher', nur = nurArg !== undefined ? nurArg : (process.argv[3] ? process.argv[3].split(',') : null);
  const sb = laden(), R = sb.Rennspiel, T = sb.THREE;
  const autos = R.carCatalog.waehlbare();
  const flotte = autos.map(a => { const mesh = R.carBuilder.bauen(a); const w = a.fahrwerte || {}; return { id: a.id, mesh, index: -1, laenge: w.laenge || 4.5, breite: w.breite || 1.85 }; });
  const zeilen = [];
  for (const daten of R.trackCatalog.filter(d => !nur || nur.includes(d.id))) {
    const st = new R.Strecke(daten, { welt: 'klassisch' });
    const gruppe = st.bauen();
    const meshes = [];
    gruppe.traverse(o => { if (o.isMesh && FLAECHEN.has(o.name)) meshes.push(o); });
    const ws = new R.Werkstatt(st), P = ws.platz, wg = P ? ws.bauen() : null;
    if (wg) { wg.updateMatrixWorld(true); wg.children.forEach(o => { if (o.isMesh && o.geometry.type === 'BufferGeometry') meshes.push(o); }); }   // Fläche, Keile, Linien (direkte Kinder; Halle = Gruppen)
    const feld = hoehenFeld(T, meshes);
    const sp = st.spline, L = sp.laenge, rand = st.breite / 2 + st.randBreite;
    const orte = {};   // name → [{x,z,h}]
    const add = (name, x, z, h) => (orte[name] || (orte[name] = [])).push({ x, z, h });
    const hd = (p) => Math.atan2(-p.tx, -p.tz);
    st.startpositionen(9).forEach(p => add('Startaufstellung', p.x, p.z, p.heading));
    if (P) {
      const s0 = P.s - P.laenge / 2, s1 = P.s + P.laenge / 2, qE = P.qE !== undefined ? P.qE : P.qA - 0.4;
      for (let k = 0; k <= 6; k++) { const sk = s0 - P.zufahrt + P.zufahrt * k / 6, wk = ws.keilBreite(sk - P.s); for (const t of [0.3, 0.7]) { const w = ws.welt(sk, qE - 1 + (wk + 1) * t); add('Werkstatt-Zufahrt/Keil', w.x, w.z, hd(w)); } }
      for (let k = 0; k <= 6; k++) { const sk = s0 + P.laenge * k / 6; for (const t of [0.2, 0.5, 0.8]) { const w = ws.welt(sk, P.qA + (P.qB - P.qA) * t); add('Werkstatt-Fläche', w.x, w.z, hd(w)); } }
    }
    const tabu = (s) => (st.bruecken || []).some(b => st._inBereich(b, s, 30)) || (st.tunnel || []).some(t => st._inBereich(t, s, 30)) || (st.ueberfuehrungen || []).some(u => st._inBereich(u, s, 60) || (u.unten && st._inBereich(u.unten, s, 80)))
      || (st.gabelNah && st.gabelNah(s, 20)) || (P && Math.abs(sp.wrapS(s - P.s + L / 2) - L / 2) < P.laenge / 2 + P.zufahrt + P.ausfahrt + 8) || (st.loopings || []).some(l => Math.abs(sp.wrapS(s - l.s + L / 2) - L / 2) < 60);
    for (let s = 40; s < L - 20; s += 37) {
      if (tabu(s)) continue;
      const p = sp.punktBei(s);
      add('Fahrbahn', p.x + p.nx * 2, p.z + p.nz * 2, hd(p));
      for (const sg of [-1, 1]) for (const d of [2, 5, 10, 15]) {
        const q = sg * (st.breiteBei(s) / 2 + st.randBreite + d);
        const g = st.grenzeBei ? st.grenzeBei(s, sg) : 1e9;
        if (isFinite(g) && Math.abs(q) > Math.abs(g) - 2.5) continue;
        add(st.sModell ? 'Gras/Hang 2–15 m' : 'Gras 2–15 m', p.x + p.nx * q, p.z + p.nz * q, hd(p));
      }
    }
    (st.bruecken || []).forEach(b => { for (let k = 1; k < 6; k++) { const s = b.s0 + (b.s1 - b.s0) * k / 6, p = sp.punktBei(s); for (const q of [-3, 0, 2.5]) add('Brücke (' + b.art + ')', p.x + p.nx * q, p.z + p.nz * q, hd(p)); } });
    (st.kreuzungen || []).forEach(k => { for (const d of [-6, -2, 2, 6]) add('Kreuzung', k.x + d * 0.7, k.z + d * 0.7, 0.3); });
    (st.gabelungen || []).forEach(g => {
      for (let k = 1; k < 8; k++) {
        const s = g.s0 + g.L * k / 8, w = st.gabelBei(s); if (!w || w.t < 0.6) continue;
        const p = sp.punktBei(s), innen = w.c - w.h - st.randBreite;
        for (const sg of [-1, 1]) for (const d of [-0.5, 0.3, 1.2]) { const q = sg * (innen - d); add('Gabelungs-Insel-Rand', p.x + p.nx * q, p.z + p.nz * q, hd(p)); }
      }
    });
    for (const [name, liste] of Object.entries(orte)) {
      let mn = Infinity, mx = -Infinity, wo = '', woMax = '', n = 0, ecke = Infinity; const alle = [];
      const ev = new T.Vector3();
      for (const o of liste) for (const f of flotte) {
        f.index = -1; f._rb = null; f.werkstatt = P ? ws : null;
        pose(R, st, f, o.x, o.z, o.h, modus);
        for (const [a, b] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) { ev.set(a * f.breite / 2, 0, b * f.laenge / 2).applyMatrix4(f.mesh.matrixWorld); const ob = feld(ev.x, ev.z, ev.y + 0.4); if (isFinite(ob)) ecke = Math.min(ecke, ev.y - ob); }
        for (const r of radDaten(T, f, feld)) {
          if (!isFinite(r.gap)) continue;
          const d = r.gap; n++; alle.push(d);
          if (d < mn) { mn = d; wo = `${f.id} @${o.x.toFixed(1)},${o.z.toFixed(1)}`; }
          if (d > mx) { mx = d; woMax = `${f.id} @${o.x.toFixed(1)},${o.z.toFixed(1)}`; }
        }
      }
      alle.sort((a, b) => a - b); const pz = (t) => alle.length ? +(alle[Math.min(alle.length - 1, Math.floor(t * alle.length))] * 100).toFixed(1) : null;
      zeilen.push({ strecke: daten.id, ort: name, n, p5: pz(0.05), p50: pz(0.5), p95: pz(0.95), min: +(mn * 100).toFixed(1), max: +(mx * 100).toFixed(1), ecke: +(ecke * 100).toFixed(1), wo, woMax });
      console.log(`${daten.id.padEnd(9)} ${name.padEnd(24)} n=${String(n).padStart(4)}  min ${(mn * 100).toFixed(1).padStart(6)} cm  max ${(mx * 100).toFixed(1).padStart(6)} cm  Ecke ${(ecke * 100).toFixed(1).padStart(6)}  p5/50/95 ${pz(0.05)}/${pz(0.5)}/${pz(0.95)}  (tiefstes: ${wo}; höchstes: ${woMax})`);
    }
  }
  fs.mkdirSync(path.join(root, 'tests/out/v28'), { recursive: true });
  fs.writeFileSync(path.join(root, 'tests/out/v28/raeder_boden_' + modus + '.json'), JSON.stringify(zeilen, null, 1));
  return zeilen;
}
if (require.main === module) main();
module.exports = { laden, hoehenFeld, pose, radDaten, FLAECHEN, main };
