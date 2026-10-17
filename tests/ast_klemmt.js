// F2-Nebenwirkung: bleibt ein Auto mit Vollgas und fast geradem Lenken am festen Ast hängen? (aus dem KI-Test wiese/stunt sehrViele, Ast@585)
// node tests/ast_klemmt.js [wurzel]
const path = require('path');
const wurzel = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const { ladeModule } = require(path.join(wurzel, 'tests/lade'));
const R = ladeModule(['src/config.js', 'src/physics/vehicle.js', 'src/track/spline.js', 'src/track/trackCatalog.js', 'src/track/trackBuilder.js', 'src/physics/collisions.js', 'src/cars/carCatalog.js', 'src/world/muenzen.js']);
const DT = 1 / 60;
const td = R.trackCatalog.find(t => t.id === 'wiese');
const st = new R.Strecke(td, { welt: 'stunt', hindernisMenge: 'sehrViele' });
const h = st.hindernisse.find(x => x.typ === 'ast' && Math.abs(x.s - 585) < 3);
if (!h) { console.log('Ast@585 nicht gefunden', st.hindernisse.filter(x => x.typ === 'ast').map(x => Math.round(x.s)).join(',')); process.exit(1); }
const sg = h.segmente[0];
let n = 0, klemmt = 0;
for (const lenk of [0, 0.1, 0.2, -0.1, -0.2]) for (const dpsi of [-0.4, -0.2, 0, 0.2, 0.4]) for (const u of [0.5, 0.8, 1.0, 1.1]) for (const v0 of [6, 12]) {
  const a = new R.Vehicle({});
  const zx = sg.ax + (sg.bx - sg.ax) * Math.min(u, 1) + (u > 1 ? (sg.bx - sg.ax) * (u - 1) : 0), zz = sg.az + (sg.bz - sg.az) * Math.min(u, 1) + (u > 1 ? (sg.bz - sg.az) * (u - 1) : 0);
  const L = Math.hypot(sg.bx - sg.ax, sg.bz - sg.az), tx = (sg.bx - sg.ax) / L, tz = (sg.bz - sg.az) / L;
  // Anfahrt aus Richtung der Strecke
  const p = st.spline.punktBei(h.s - 7);
  const q = (zx - p.x) * p.nx + (zz - p.z) * p.nz;
  a.setzen(p.x + p.nx * q, p.z + p.nz * q, R.headingAus(p.tx, p.tz) + dpsi); a.vLaengs = v0;
  let z = 0, sMax = -1e9;
  for (let k = 0; k < 60 * 6; k++) {
    a.schritt(DT, { gas: 1, bremse: 0, lenkung: lenk });
    R.Kollisionen.hindernisse([a], st, { dt: DT, zeit: z += DT });
    const nn = st.spline.naechster(a.x, a.z); if (k > 60 * 5) sMax = nn.s;
  }
  n++; if (Math.abs(a.vLaengs) < 1.5) klemmt++;
}
console.log(`Fälle ${n}, nach 6 s mit Vollgas noch fast stehend (< 1,5 m/s): ${klemmt}`);
