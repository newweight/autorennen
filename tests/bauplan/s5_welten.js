// S5 (Neue Welten): erzeugt Kontrollpunkte + Hügel der drei neuen Strecken (Mond, Unterwasser, Regenbogenland)
//   node tests/bauplan/s5_welten.js        → schreibt den Datenblock zwischen den Marken DATEN-BEGIN/DATEN-ENDE in src/track/trackWelten.js
// Straßenverlauf aus Bausteinen (wie generator.js; Pläne per Zufallssuche gefunden, geschlossen, ohne Selbstannäherung < 200 m);
// Hügel aus dem Verlauf abgeleitet (Seed je Strecke) – damit gleich bei jedem Lauf.
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const GEN = path.join(__dirname, 'generator.js'), ZIEL = path.join(__dirname, '..', '..', 'src', 'track', 'trackWelten.js');
const tmp = path.join(require('os').tmpdir(), 's5_bauplan.json');
function mulberry(a) { return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const PLAENE = {
  mond: { seed: 101, plan: [['G', 200], ['G', 250], ['K', 170, 130], ['G?'], ['K', 120, 40], ['G?'], ['K', 130, 50], ['G', 100], ['K', 170, 90], ['G', 260], ['K', 110, 50], ['G', 180]] },
  unterwasser: { seed: 202, plan: [['G', 220], ['G', 90], ['K', 120, 80], ['G', 280], ['K', 130, 60], ['G?'], ['K', 110, 40], ['G', 110], ['K', 110, 30], ['G', 260], ['K', 120, 40], ['G?'], ['K', 160, 40], ['G', 100], ['K', 160, 70], ['G', 150]] },
  regenbogenland: { seed: 303, plan: [['G', 200], ['G', 110], ['K', 130, 40], ['G', 210], ['K', 130, 70], ['G', 180], ['K', 140, 90], ['G?'], ['K', 130, 60], ['G?'], ['K', 120, 100], ['G', 160]] },
};
function gen(plan, huegel) {
  fs.writeFileSync(tmp, JSON.stringify({ plan, huegel }));
  return JSON.parse(execFileSync('node', [GEN, tmp]).toString());
}
function bogen(pts) { const s = [0]; for (let i = 1; i < pts.length; i++) s.push(s[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][2] - pts[i - 1][2])); return s; }
/** Gerade Stücke (Krümmung ≈ 0) der Strecke: [{ a, b }] in Bogenlänge. */
function geraden(pts, s) {
  const L = s[s.length - 1] + Math.hypot(pts[0][0] - pts[pts.length - 1][0], pts[0][2] - pts[pts.length - 1][2]), n = pts.length, ok = [];
  for (let i = 0; i < n; i++) {
    const a = pts[(i + n - 2) % n], b = pts[i], c = pts[(i + 2) % n];
    const h1 = Math.atan2(b[0] - a[0], b[2] - a[2]), h2 = Math.atan2(c[0] - b[0], c[2] - b[2]);
    let d = h2 - h1; d = Math.atan2(Math.sin(d), Math.cos(d));
    ok.push(Math.abs(d) < 0.004);
  }
  const res = []; let a0 = null;
  for (let i = 0; i < n; i++) { if (ok[i] && a0 === null) a0 = s[i]; if ((!ok[i] || i === n - 1) && a0 !== null) { const b0 = s[i]; if (b0 - a0 > 120) res.push({ a: a0, b: b0 }); a0 = null; } }
  return { L, res };
}
function punktBei(pts, s, L, sArr) {
  s = ((s % L) + L) % L; let i = 0; while (i < sArr.length - 1 && sArr[i + 1] < s) i++;
  const p = pts[i], q = pts[(i + 1) % pts.length], t = (s - sArr[i]) / Math.max(1e-6, (i + 1 < sArr.length ? sArr[i + 1] : L) - sArr[i]);
  const x = p[0] + (q[0] - p[0]) * t, z = p[2] + (q[2] - p[2]) * t, tx = q[0] - p[0], tz = q[2] - p[2], l = Math.hypot(tx, tz) || 1;
  return { x, z, nx: tz / l, nz: -tx / l };
}
const r1 = (v) => Math.round(v * 10) / 10;
const aus = {};
for (const id of Object.keys(PLAENE)) {
  const P = PLAENE[id], rnd = mulberry(P.seed);
  const g0 = gen(P.plan, []), pts = g0.punkte, s = bogen(pts), { L, res } = geraden(pts, s);
  const huegel = [], st = (sx, off) => { const p = punktBei(pts, sx, L, s); return { x: p.x + p.nx * off, z: p.z + p.nz * off }; };
  const rand = (a, b) => a + (b - a) * rnd();
  if (id === 'mond') {
    // Bodenwellen auf den Geraden (Hüpfer bei Tempo): alle ~75 m, nicht in den ersten 150 m und nicht am Rand der Gerade
    const gl = res.slice().sort((a, b) => (b.b - b.a) - (a.b - a.a))[0], sKrater = gl ? (gl.a + gl.b) / 2 + 30 : -999;   // eine Kraterdurchfahrt (sanfte Mulde auf der längsten Geraden)
    res.forEach((g) => { for (let x = Math.max(g.a + 60, 150); x < g.b - 40; x += rand(52, 74)) { if (Math.abs(x - sKrater) < 90) continue; const p = st(x, 0); huegel.push({ x: r1(p.x), z: r1(p.z), r: r1(rand(32, 42)), h: r1(rand(3.2, 4.6)) }); } });
    // Krater neben der Straße (Mulden), dazu Randhügel weiter außen
    for (let i = 0; i < 22; i++) { const sx = rnd() * L, side = rnd() < 0.5 ? -1 : 1, p = st(sx, side * rand(62, 110)); huegel.push({ x: r1(p.x), z: r1(p.z), r: r1(rand(26, 48)), h: r1(-rand(4, 8)) }); }
    for (let i = 0; i < 14; i++) { const sx = rnd() * L, side = rnd() < 0.5 ? -1 : 1, p = st(sx, side * rand(130, 260)); huegel.push({ x: r1(p.x), z: r1(p.z), r: r1(rand(70, 130)), h: r1(rand(7, 15)) }); }
    if (gl) { const p = st(sKrater, 0); huegel.push({ x: r1(p.x), z: r1(p.z), r: 46, h: -3.8 }); }
  } else if (id === 'unterwasser') {
    for (let i = 0; i < 16; i++) { const sx = rnd() * L, p = st(sx, (rnd() < 0.5 ? -1 : 1) * rand(0, 40)); huegel.push({ x: r1(p.x), z: r1(p.z), r: r1(rand(70, 130)), h: r1((rnd() < 0.5 ? -1 : 1) * rand(2, 5)) }); }
    for (let i = 0; i < 10; i++) { const sx = rnd() * L, p = st(sx, (rnd() < 0.5 ? -1 : 1) * rand(120, 260)); huegel.push({ x: r1(p.x), z: r1(p.z), r: r1(rand(80, 150)), h: r1(rand(6, 14)) }); }
  } else {
    for (let i = 0; i < 18; i++) { const sx = rnd() * L, p = st(sx, (rnd() < 0.5 ? -1 : 1) * rand(0, 30)); huegel.push({ x: r1(p.x), z: r1(p.z), r: r1(rand(80, 140)), h: r1((rnd() < 0.5 ? -1 : 1) * rand(3, 6.5)) }); }
    for (let i = 0; i < 8; i++) { const sx = rnd() * L, p = st(sx, (rnd() < 0.5 ? -1 : 1) * rand(110, 240)); huegel.push({ x: r1(p.x), z: r1(p.z), r: r1(rand(80, 140)), h: r1(rand(8, 16)) }); }
  }
  const g1 = gen(P.plan, huegel);
  aus[id] = { laenge: Math.round(L), geraden: res.map((g) => [Math.round(g.a), Math.round(g.b)]), huegel, punkte: g1.punkte };
  console.log(id, 'L', Math.round(L), 'Geraden', JSON.stringify(aus[id].geraden), 'Hügel', huegel.length, 'Punkte', g1.punkte.length);
}
const text = '/*DATEN-BEGIN*/\n  const DATEN = ' + JSON.stringify(Object.fromEntries(Object.keys(aus).map((k) => [k, { huegel: aus[k].huegel, punkte: aus[k].punkte }]))).replace(/\],\[/g, '],\n    [') + ';\n  /*DATEN-ENDE*/';
if (fs.existsSync(ZIEL)) {
  const alt = fs.readFileSync(ZIEL, 'utf8');
  fs.writeFileSync(ZIEL, alt.replace(/\/\*DATEN-BEGIN\*\/[\s\S]*\/\*DATEN-ENDE\*\//, () => text));
  console.log('geschrieben:', ZIEL);
} else console.log(text.slice(0, 300));
fs.writeFileSync(path.join(require('os').tmpdir(), 's5_geraden.json'), JSON.stringify(Object.fromEntries(Object.keys(aus).map((k) => [k, { laenge: aus[k].laenge, geraden: aus[k].geraden }]))));
