// F2 Reproduktion: Auto fährt auf jeden Ast (alle Strecken/Welten mit Ast), verschiedene Querlagen/Tempi/Winkel.
// node tests/ast_repro.js [wurzelordner]   -> zählt: Kontakt (Stoß-Liste), und ob das Auto den Ast hinterher überquert hat
const path = require('path');
const wurzel = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const { ladeModule } = require(path.join(wurzel, 'tests/lade'));
const R = ladeModule(['src/config.js', 'src/physics/vehicle.js', 'src/track/spline.js',
  'src/track/trackCatalog.js', 'src/track/trackBuilder.js', 'src/physics/collisions.js', 'src/cars/carCatalog.js', 'src/world/muenzen.js'], wurzel);
const DT = 1 / 60, AUTO = (R.carCatalog && R.carCatalog[0] && R.carCatalog[0].fahrwerte) || {};
let gesamt = 0, stoss = 0, ohne = [];
for (const td of R.trackCatalog) {
  for (const welt of Object.keys(td.welten || {})) {
    if (!td.welten[welt].hindernisse) continue;
    let st; try { st = new R.Strecke(td, { welt, hindernisMenge: process.env.MENGE || 'normal' }); } catch (e) { continue; }
    const aeste = st.hindernisse.filter(h => h.typ === 'ast'), sp = st.spline;
    for (const h of aeste) {
      const sg = h.segmente[0];
      for (const v0 of [8, 25, 50]) for (const dq of [-1.2, -0.4, 0, 0.4, 1.2]) for (const psi of [0, 0.5, -0.5]) {
        // Startpunkt 8 m vor dem Ast, querversetzt zur Segmentmitte
        const mx = (sg.ax + sg.bx) / 2, mz = (sg.az + sg.bz) / 2;
        const p = sp.punktBei(h.s - 8);
        const a = new R.Vehicle(AUTO);
        // Quer so wählen, dass Fahrspur durch das Segment bei Parameter u läuft
        const L = Math.hypot(sg.bx - sg.ax, sg.bz - sg.az), u = 0.5 + dq / (L + 2.4);
        const zx = sg.ax + (sg.bx - sg.ax) * u, zz = sg.az + (sg.bz - sg.az) * u;
        const q = (zx - p.x) * p.nx + (zz - p.z) * p.nz;
        a.setzen(p.x + p.nx * q, p.z + p.nz * q, R.headingAus(p.tx, p.tz) + psi * 0.2);
        a.vLaengs = v0; gesamt++;
        let hit = false, zeit = 0;
        for (let k = 0; k < Math.ceil(16 / v0 * 60) + 20; k++) {
          const r = a.richtung(); a.x += r.x * a.vLaengs * DT; a.z += r.z * a.vLaengs * DT;
          const s = R.Kollisionen.hindernisse([a], st, { dt: DT, zeit: zeit += DT });
          if (s.some(x => x.typ === 'ast')) { hit = true; break; }
        }
        if (hit) stoss++; else ohne.push(`${td.id}/${welt} s${Math.round(h.s)} v${v0} dq${dq} psi${psi}`);
      }
    }
  }
}
console.log(`Fälle ${gesamt}, Stoß ${stoss}, ohne Stoß ${ohne.length}`); ohne.slice(0, 15).forEach(x => console.log('  ' + x));
