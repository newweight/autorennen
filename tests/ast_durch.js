// F2 Messung: fährt das Auto NACH dem Stoß durch den Ast? (Voll-Physik, Gas voll, Lenkung geradeaus, 2,5 s)
// node tests/ast_durch.js [wurzel]  -> Anteil Fälle, in denen ein Kapselkreis tiefer als halbe Astdicke ins Segment kommt / die Linie quert
const path = require('path');
const wurzel = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const { ladeModule } = require(path.join(wurzel, 'tests/lade'));
const R = ladeModule(['src/config.js', 'src/physics/vehicle.js', 'src/track/spline.js',
  'src/track/trackCatalog.js', 'src/track/trackBuilder.js', 'src/physics/collisions.js', 'src/cars/carCatalog.js', 'src/world/muenzen.js']);
const DT = 1 / 60, AUTO = (R.carCatalog && R.carCatalog[0] && R.carCatalog[0].fahrwerte) || {};
const seg = (ax, az, bx, bz, x, z) => { const dx = bx - ax, dz = bz - az, t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz))); return Math.hypot(x - (ax + dx * t), z - (az + dz * t)); };
let n = 0, durch = 0, tiefMax = 0, vMin = [];
for (const td of R.trackCatalog) for (const welt of Object.keys(td.welten || {})) {
  if (!td.welten[welt].hindernisse) continue;
  const st = new R.Strecke(td, { welt }), sp = st.spline;
  for (const h of st.hindernisse.filter(x => x.typ === 'ast')) {
    const sg = h.segmente[0];
    for (const v0 of [10, 25, 45]) for (const u of [0.2, 0.5, 0.8]) for (const psi of [0, 0.3, -0.3]) {
      const p = sp.punktBei(h.s - 8), zx = sg.ax + (sg.bx - sg.ax) * u, zz = sg.az + (sg.bz - sg.az) * u;
      const q = (zx - p.x) * p.nx + (zz - p.z) * p.nz;
      const a = new R.Vehicle(AUTO); a.setzen(p.x + p.nx * q, p.z + p.nz * q, R.headingAus(p.tx, p.tz) + psi * 0.2); a.vLaengs = v0;
      const sgn = (x, z) => Math.sign((sg.bx - sg.ax) * (z - sg.az) - (sg.bz - sg.az) * (x - sg.ax));
      const s0 = sgn(a.x, a.z); let tief = 0, gekreuzt = false, z = 0;
      for (let k = 0; k < 150; k++) {
        a.schritt(DT, { gas: 1, bremse: 0, lenkung: 0 });
        R.Kollisionen.hindernisse([a], st, { dt: DT, zeit: z += DT });
        for (const c of R.Kollisionen.kapsel(a).kreise) tief = Math.max(tief, (sg.dicke || 0.28) - seg(sg.ax, sg.az, sg.bx, sg.bz, c.x, c.z));
        if (sgn(a.x, a.z) !== s0) gekreuzt = true;
      }
      n++; if (tief > 0.15) durch++; tiefMax = Math.max(tiefMax, tief);
    }
  }
}
console.log(`Fälle ${n}, Durchfahren (Kapselkreis > 0,15 m tief im Stamm) ${durch} = ${(100 * durch / n).toFixed(1)} %, max. Eindringung ${tiefMax.toFixed(2)} m`);
