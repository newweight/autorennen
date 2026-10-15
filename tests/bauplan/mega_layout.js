// Suche für das feste Layout der Megastrecke (src/track/megastrecke.js, LAYOUT):
//   node tests/bauplan/mega_layout.js [iterationen] [seed]
// Simulated Annealing über Reihenfolge (Wiese bleibt vorn), Spiegelung, Verbindungsbogen und Lücke je Stück.
// Verlustfunktion = Verstöße: fremde Teile (> 250 m Bogenlänge auseinander) näher als 80 m (Nachbarstücke 60 m), Schlussbogen mit
// Radius < 70 m oder kürzer als 140 m, Höhen-Restdifferenz > 40 m. Verlust 0 = gültig.
// Ausgabe: LAYOUT-Zeile zum Einfügen in megastrecke.js.
const { ladeModule } = require('../lade');
const R = ladeModule(['src/config.js', 'src/physics/vehicle.js', 'src/track/spline.js', 'src/track/trackCatalog.js', 'src/track/megastrecke.js']);
const M = R.Mega;
const ITER = +process.argv[2] || 20000;
let seed = (+process.argv[3] || 1) >>> 0;
const rnd = () => { seed = (seed + 0x6D2B79F5) >>> 0; let t = seed; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const MIN_ABSTAND = 80, MIN_NACHBAR = 60;
const basis = M.LAYOUT.abschnitte.map((a) => Object.assign({}, a));
const gruppe = (seg) => (seg === 'start' ? -1 : seg === 'ende' ? basis.length : +seg.slice(1));

function verlust(lay, detail) {
  const e = M._zusammenbauen({ abschnitte: lay });
  const pts = e.pts;
  let cum = 0; const c = pts.map((p, i) => { if (i) cum += Math.hypot(p.x - pts[i - 1].x, p.z - pts[i - 1].z); return cum; });
  const L = cum, g = pts.map((p) => gruppe(p.seg));
  let koll = 0, minD = Infinity;
  for (let i = 0; i < pts.length; i += 1) for (let j = i + 1; j < pts.length; j++) {
    const gd = Math.abs(g[i] - g[j]);
    if (gd === 0) continue;
    const dc = Math.min(c[j] - c[i], L - (c[j] - c[i]));
    if (dc < 250) continue;
    const d = Math.hypot(pts[i].x - pts[j].x, pts[i].z - pts[j].z);
    const thr = gd === 1 ? MIN_NACHBAR : MIN_ABSTAND;
    if (d < minD) minD = d;
    if (d < thr) koll += (thr - d) / 10;
  }
  let dreh = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const a1 = Math.atan2(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z), a2 = Math.atan2(pts[i + 1].x - pts[i].x, pts[i + 1].z - pts[i].z);
    let d = a2 - a1; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; dreh += d;
  }
  dreh = Math.abs(dreh * 180 / Math.PI);
  let minR = Infinity;
  for (let i = 1; i < pts.length - 1; i++) {
    if (pts[i].seg !== 'ende') continue;
    const a1 = Math.atan2(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z), a2 = Math.atan2(pts[i + 1].x - pts[i].x, pts[i + 1].z - pts[i].z);
    let d = a2 - a1; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
    minR = Math.min(minR, Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].z - pts[i].z) / Math.max(1e-6, Math.abs(d)));
  }
  let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
  pts.forEach((p) => { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); z0 = Math.min(z0, p.z); z1 = Math.max(z1, p.z); });
  const D = e.schluss.D;
  let v = koll;
  v += Math.max(0, 70 - minR) / 5;
  v += Math.max(0, 140 - D) / 20;
  v += Math.max(0, Math.abs(e.drift) - 40) / 5;
  const rest = v;
  v += (Math.max(x1 - x0, z1 - z0)) / 4000 + D / 4000;       // sanft: kompakt
  const info = { rest, koll, minD, minR, D, dreh, drift: e.drift, L: e.gesamt, breite: x1 - x0, tiefe: z1 - z0 };
  return detail ? info : v;
}

function zufallsLayout() {
  const rest = basis.slice(1); for (let i = rest.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [rest[i], rest[j]] = [rest[j], rest[i]]; }
  return [basis[0]].concat(rest).map((a, i) => Object.assign({}, a, { spiegel: rnd() < 0.5 ? 1 : 0, bogen: i ? Math.round((rnd() * 240 - 120) / 5) * 5 : 0, luecke: 50 + Math.round(rnd() * 15) * 10 }));
}
function nachbar(lay) {
  const n = lay.map((a) => Object.assign({}, a)), i = Math.floor(rnd() * n.length), r = rnd();
  if (r < 0.45 && i > 0) n[i].bogen = Math.max(-140, Math.min(140, n[i].bogen + Math.round((rnd() * 80 - 40) / 5) * 5));
  else if (r < 0.7) n[i].luecke = Math.max(40, Math.min(300, n[i].luecke + Math.round((rnd() * 120 - 60) / 10) * 10));
  else if (r < 0.82) n[i].spiegel = n[i].spiegel ? 0 : 1;
  else if (r < 0.92 && i > 0) { const j = 1 + Math.floor(rnd() * (n.length - 1)); const t = n[i]; n[i] = Object.assign({}, n[j], { bogen: n[i].bogen, luecke: n[i].luecke }); n[j] = Object.assign({}, t, { bogen: n[j].bogen, luecke: n[j].luecke }); }
  else if (i > 0) { n[i].bogen = Math.round((rnd() * 240 - 120) / 5) * 5; }
  return n;
}

let beste = null;
const start = Date.now();
for (let neustart = 0; neustart < 1000 && Date.now() - start < ITER * 1000; neustart++) {
  let cur = zufallsLayout(), cv = verlust(cur), T = 3;
  for (let it = 0; it < 1500; it++) {
    const nw = nachbar(cur), nv = verlust(nw);
    if (nv < cv || rnd() < Math.exp((cv - nv) / T)) { cur = nw; cv = nv; }
    T = Math.max(0.02, T * 0.996);
    if (cv < 0.7) { const info = verlust(cur, true); if (info.rest === 0) break; }
  }
  const info = verlust(cur, true);
  console.log('Neustart', neustart, 'Verlust', cv.toFixed(2), 'Rest', info.rest.toFixed(2), 'Länge', info.L.toFixed(0), 'Box', info.breite.toFixed(0), 'x', info.tiefe.toFixed(0), 'minAbst', info.minD.toFixed(0), 'D', info.D.toFixed(0), 'dreh', info.dreh.toFixed(0), 'drift', info.drift.toFixed(1));
  if (info.rest === 0 && (!beste || cv < beste.v)) {
    beste = { v: cv, lay: cur, info };
    console.log('FUND ' + JSON.stringify(cur.map((a) => ({ id: a.id, a: a.a, b: a.b, spiegel: a.spiegel, bogen: a.bogen, luecke: a.luecke }))));
  }
  if (beste && neustart >= 5) break;
}
if (!beste) console.log('keins gefunden');
