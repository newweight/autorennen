// Diagnose: Auto fährt auf der Fantasie-Kreuzung vom Abschnitt A / B quer auf die andere Fahrbahn ab –
// wo (Weltpunkt, Abstand zur Kreuzungsmitte) greift die Bande? node tests/kreuzung_bande_diag.js [json]
const { ladeModule } = require('./lade');
const R = ladeModule(['src/config.js', 'src/physics/vehicle.js', 'src/physics/collisions.js',
  'src/track/spline.js', 'src/track/trackCatalog.js', 'src/track/trackBuilder.js', 'src/cars/carCatalog.js', 'src/track/looping.js']);
const dt = R.config.physik.schritt, K = R.Kollisionen;
const st = new R.Strecke(R.trackCatalog.find(t => t.id === 'fantasie')), sp = st.spline, k = st.kreuzungen[0];
const erg = [];
for (const [pass, sK, sQ] of [['a', k.sA, k.sB], ['b', k.sB, k.sA]]) {
  for (const seite of [-1, 1]) {            // abbiegen nach links/rechts (auf die querende Fahrbahn, in beide Richtungen)
    for (const rueck of [1, -1]) {
      const p = sp.punktBei(sK - 12), q = sp.punktBei(sQ);
      const v = new R.Vehicle({});
      v.setzen(p.x, p.z, R.headingAus(p.tx, p.tz));
      v.vLaengs = 12; v._idx = -1;
      let treffer = null, idx = null;
      // erst geradeaus bis zur Mitte, dann in Richtung der Querstraße (heading nach q) abbiegen
      const ziel = R.headingAus(q.tx * rueck, q.tz * rueck);
      let abgebogen = false;
      for (let i = 0; i < 60 * 14 && !treffer; i++) {
        const n = st.abfrage(v.x, v.z, v._idx); v._idx = n.index; v.untergrund = n.untergrund;
        const dm = Math.hypot(v.x - k.x, v.z - k.z);
        if (!abgebogen && dm < 4) { abgebogen = true; v.heading = ziel; v.weltGeschwindigkeitSetzen(Math.sin(-ziel) * 0 + (-Math.sin(ziel)) * 14, -Math.cos(ziel) * 14); }
        v.schritt(dt, { gas: 0.6, bremse: 0, lenkung: 0 });
        const st0 = K.bande(v, st);
        if (abgebogen && st0 > 0.3) treffer = { x: v.x, z: v.z, abstand: dm, kmh: v.tempoKmh };
      }
      const lok = treffer ? { l: ((treffer.x - k.x) * q.tx + (treffer.z - k.z) * q.tz), qq: ((treffer.x - k.x) * q.nx + (treffer.z - k.z) * q.nz) } : null;
      erg.push({ pass, rueck, treffer, abstandMitte: treffer ? Math.hypot(treffer.x - k.x, treffer.z - k.z) : null, lok });
    }
  }
}
console.log('Kreuzung', { x: k.x, z: k.z, winkel: k.winkel, sA: k.sA, sB: k.sB, halbL: k.halbL, halbW: k.halbW, grenze: st.seitenabstandMax });
erg.forEach(e => console.log(JSON.stringify(e)));
