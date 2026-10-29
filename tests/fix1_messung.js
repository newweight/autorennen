// FIX1 – Messung: Magnet-Tempo und Gleitdauer (Server-Simulation, echte Anfahrt)   node tests/fix1_messung.js [magnet|gleit]
'use strict';
const { Simulation, laden, ladenMoto } = require('../server/simulation');
const bauPilot = (Rk, st, f, v) => {
  const sp = st.spline;
  return (qZiel, vSoll, extra) => {
    const n = st.abfrage(v.x, v.z, f.index), vl = Math.max(3, v.vLaengs), L = Math.max(9, Math.min(50, 0.55 * vl + 8)), pt = sp.punktBei(n.s + L);
    const zx = pt.x + pt.nx * qZiel, zz = pt.z + pt.nz * qZiel;
    let d = Rk.headingAus(zx - v.x, zz - v.z) - v.heading;
    while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
    const lenkung = Math.max(-1, Math.min(1, -(2 * vl * Math.sin(d) / Math.hypot(zx - v.x, zz - v.z)) / v.drehrateMax(vl)));
    return Object.assign({ gas: v.vLaengs < vSoll ? 1 : 0, bremse: v.vLaengs > vSoll + 3 ? 0.5 : 0, lenkung }, extra || {});
  };
};
function neu(id, moto) {
  const sim = new Simulation({ einstellungen: { streckeId: id, gegner: 0, runden: 3, spass: true, zauber: true, zufall: false, unfall: moto ? 'aus' : undefined, schwierigkeit: 'mittel' },
    spieler: [{ fahrer: 'Jonas', auto: moto ? 'crossmaschine' : 'porsche-911', hilfe: process.env.HILFE || 'wenig' }], seed: 5, moto });
  const S = sim.sim;
  return { sim, S, st: S.strecke, f: S.fahrzeuge[0], v: S.fahrzeuge[0].vehicle };
}
const modus = process.argv[2] || 'magnet';
for (const [spn, moto] of [['auto', false], ['motorrad', true]]) {
  const R = moto ? ladenMoto() : laden();
  if (modus === 'tabelle') {
    // je Röhre: Anfahrt 90 m davor mit 80 km/h, (a) Vollgas, (b) rollen ohne Gas, (c) Bremse – Tempo bei Einfahrt / Minimum / Ausfahrt
    let sumA = 0, sumB = 0, nA = 0;
    for (const id of ['wiese', 'wald', 'wueste', 'fantasie', 'dino', 'alpen', 'formel1', 'mond', 'unterwasser', 'regenbogenland']) {
      const zz0 = neu(id, moto).st.spass.zauber.magnet;
      for (const e of zz0) {
        const zeile = [];
        for (const art of ['gas', 'rollen']) {
          const t2 = neu(id, moto), sp = t2.st.spline, pilot = bauPilot(R, t2.st, t2.f, t2.v), pt = sp.punktBei(e.s0 - 90);
          t2.v.setzen(pt.x, pt.z, R.headingAus(pt.tx, pt.tz)); t2.v.vLaengs = 80 / 3.6; t2.f.index = -1;
          t2.S.rennen.verfolgungSetzen(t2.S.rennen.teilnehmer[0], t2.v.x, t2.v.z, e.s0 - 90);
          let vEin = null, vAus = null, vMin = 1e9, was = false;
          for (let i = 0; i < 60 * 25; i++) {
            const s = pilot(0, 80 / 3.6);
            if (art === 'gas') { s.gas = 1; s.bremse = 0; } else { s.gas = 0; s.bremse = 0; }
            t2.sim.eingabeSetzen(0, s); t2.sim.schritt();
            const m = !!(t2.f.flug.z && t2.f.flug.z.mag);
            if (m && !was) vEin = t2.v.vLaengs;
            if (m) vMin = Math.min(vMin, t2.v.vLaengs);
            if (!m && was) { vAus = t2.v.vLaengs; break; }
            was = m;
          }
          zeile.push(`${art}: ein ${vEin && (vEin * 3.6).toFixed(0)} min ${(vMin * 3.6).toFixed(0)} aus ${vAus && (vAus * 3.6).toFixed(0)}`);
          if (vEin && vAus) { if (art === 'gas') { sumA += vAus / vEin; nA++; } else sumB += vAus / vEin; }
        }
        console.log(`${spn} ${id} #${e.nr}  ${zeile.join('  |  ')}`);
      }
    }
    console.log(`${spn}: mittleres Verhältnis Ausfahrt/Einfahrt  Vollgas ${(sumA / nA).toFixed(3)}  rollen ${(sumB / nA).toFixed(3)}`);
  }
  if (modus === 'magnetalle') {
    for (const id of ['wiese', 'wald', 'wueste', 'fantasie', 'dino', 'alpen', 'formel1', 'mond', 'unterwasser', 'regenbogenland']) {
      const t = neu(id, moto), zz0 = t.st.spass.zauber && t.st.spass.zauber.magnet;
      if (!zz0 || !zz0.length) continue;
      for (const e of zz0) {
        const t2 = neu(id, moto), sp = t2.st.spline, pilot = bauPilot(R, t2.st, t2.f, t2.v), pt = sp.punktBei(e.s0 - 120);
        t2.v.setzen(pt.x, pt.z, R.headingAus(pt.tx, pt.tz)); t2.v.vLaengs = 25; t2.f.index = -1;
        t2.S.rennen.verfolgungSetzen(t2.S.rennen.teilnehmer[0], t2.v.x, t2.v.z, e.s0 - 120);
        let vEin = null, vAus = null, vMin = 1e9, was = false, vVor = null;
        for (let i = 0; i < 60 * 20; i++) {
          const n = t2.f.nah, a = n ? sp.differenzS(n.s, e.s0) : -999;
          if (a > -15 && vVor === null) vVor = t2.v.vLaengs;
          t2.sim.eingabeSetzen(0, pilot(0, 60)); t2.sim.schritt();
          const z = t2.f.flug.z, m = !!(z && z.mag);
          if (m && !was) vEin = t2.v.vLaengs;
          if (m) vMin = Math.min(vMin, t2.v.vLaengs);
          if (!m && was) { vAus = t2.v.vLaengs; break; }
          was = m;
        }
        const h = (s) => t2.st.hoeheAn(sp.punktBei(s).x, sp.punktBei(s).z);
        console.log(`${spn} ${id} #${e.nr}: vor ${vVor && (vVor * 3.6).toFixed(0)} ein ${vEin && (vEin * 3.6).toFixed(0)} min ${(vMin * 3.6).toFixed(0)} aus ${vAus && (vAus * 3.6).toFixed(0)}  Steigung ${(h(e.s1) - h(e.s0)).toFixed(1)} m`);
      }
    }
  }
  if (modus === 'magnet') {
    for (const kmh of [60, 90, 120]) for (const gas of [true, false]) {
      const t = neu('wiese', moto), e = t.st.spass.zauber.magnet[0], sp = t.st.spline, pilot = bauPilot(R, t.st, t.f, t.v), V = kmh / 3.6;
      const pt = sp.punktBei(e.s0 - 80);
      t.v.setzen(pt.x, pt.z, R.headingAus(pt.tx, pt.tz)); t.v.vLaengs = V; t.f.index = -1;
      t.S.rennen.verfolgungSetzen(t.S.rennen.teilnehmer[0], t.v.x, t.v.z, e.s0 - 80);
      let vEin = null, vAus = null, vMin = 1e9, was = false;
      const log = [];
      for (let i = 0; i < 60 * 14; i++) {
        const s = pilot(0, V, gas ? {} : { gas: 0, bremse: 0 });
        t.sim.eingabeSetzen(0, s); t.sim.schritt();
        const z = t.f.flug.z, m = !!(z && z.mag);
        if (m && !was) vEin = t.v.vLaengs;
        if (m) { vMin = Math.min(vMin, t.v.vLaengs); if (i % 30 === 0) log.push((t.v.vLaengs * 3.6) | 0); }
        if (!m && was) { vAus = t.v.vLaengs; break; }
        was = m;
      }
      console.log(`${spn} ${kmh}km/h ${gas ? 'Gas' : 'rollen'}: ein ${vEin && (vEin * 3.6).toFixed(1)} min ${(vMin * 3.6).toFixed(1)} aus ${vAus && (vAus * 3.6).toFixed(1)} km/h  verlauf/0.5s ${log.join(',')}`);
    }
  }
}
