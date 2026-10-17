// F7 (v29): wie lange fährt der Krankenwagen ≤ 15 m hinter dem Abschleppwagen (gleiche Spur)? node tests/verkehr_haengt_messung.js [sekunden] [strecken,..] [seeds]
// Seeds 0..9 = verschiedene Teilnehmerzahlen/Tempo des Autopiloten (der Verkehrs-Seed hängt an Strecke + Teilnehmerzahl; der Autopilot-Anteil verschiebt die Auftritte).
const S = require('../server/simulation.js');
const { Simulation, laden } = S;
const R = laden();

function autopilot(st, v, idx, anteil) {
  const n = st.abfrage(v.x, v.z, idx), sp = st.spline;
  const vl = Math.max(3, v.vLaengs), L = Math.max(9, Math.min(50, 0.55 * vl + 8));
  const ziel = sp.punktBei(n.s + L);
  let diff = R.headingAus(ziel.x - v.x, ziel.z - v.z) - v.heading;
  while (diff > Math.PI) diff -= 2 * Math.PI;
  while (diff < -Math.PI) diff += 2 * Math.PI;
  const lenkung = Math.max(-1, Math.min(1, -(2 * vl * Math.sin(diff) / Math.hypot(ziel.x - v.x, ziel.z - v.z)) / v.drehrateMax(vl)));
  const soll = st.tempoBei(n.s + vl * 0.3) * anteil;
  return { s: { gas: v.vLaengs < soll ? 1 : 0, bremse: v.vLaengs > soll + 3 ? 0.5 : 0, lenkung }, idx: n.index };
}

/** Ein Lauf; Rückgabe { haengt (s), beide (s beide aktiv), auftritte, seitlich (s auf Nachbarspur neben/vor dem Lkw) , kontakt (Stöße K↔A) } */
function messen(streckeId, seedNr, sekunden, nurMessen) {
  const gegner = seedNr % 5, anteil = seedNr < 5 ? 0.8 : 0.95;
  const sim = new Simulation({ einstellungen: { streckeId, runden: 20, gegner, tageszeit: 'tag', jahreszeit: 'sommer', wetter: 'klar', windStaerke: 0, krankenwagen: true, abschleppwagen: true },
    spieler: [{ fahrer: 'Jonas', auto: 'porsche-911', hilfe: 'aus' }], seed: 11 + seedNr });
  const st = sim.sim.strecke, vk = sim.sim.verkehr, L = st.spline.laenge;
  const pv = new R.Vehicle(R.carCatalog.find(a => a.id === 'porsche-911').fahrwerte, { tempoKlasse: sim.sim.tempoKlasse });
  const K = vk.eintraege.find(e => e.art === 'krankenwagen'), A = vk.eintraege.find(e => e.art === 'abschleppwagen');
  let idx = -1, haengt = 0, beide = 0, nebenA = 0, minQuer = 1e9, beruehr = 0;
  const dt = R.config.physik.schritt;
  for (let n = 0; n < sekunden / dt; n++) {
    R.Netz.fahrzeugSchreiben(pv, sim.ich(0).v);
    const a = autopilot(st, pv, idx, anteil); idx = a.idx;
    sim.eingabeSetzen(0, a.s); sim.schritt();
    if (K.aktiv && A.aktiv && K.f.nah && A.f.nah) {
      beide += dt;
      let d = A.f.nah.s - K.f.nah.s; if (d < -L / 2) d += L; if (d > L / 2) d -= L;       // d > 0: Lkw liegt vor dem Krankenwagen
      const rk = K.f.vehicle.rechts(), vk0 = K.f.vehicle, va = A.f.vehicle, quer = Math.abs((va.x - vk0.x) * rk.x + (va.z - vk0.z) * rk.z);     // Weltquerabstand (auch auf Gabelungs-Ästen richtig)
      if (d > 0 && d <= 15 && quer < 2.6) haengt += dt;
      if (Math.abs(d) < 15 && quer >= 2.6) nebenA += dt;
      if (Math.abs(d) < 12) minQuer = Math.min(minQuer, quer);
      const lk = (K.f.vehicle.daten.laenge + A.f.vehicle.daten.laenge) / 2, bk = (K.f.vehicle.daten.breite + A.f.vehicle.daten.breite) / 2;
      if (Math.abs(d) < lk && quer < bk) beruehr += dt;                       // Rechtecke (grob, Kurven ignoriert) überlappen
    }
  }
  void nurMessen;
  return { haengt, beide, neben: nebenA, beruehr, ueberholt: vk.statistik.ueberholt || 0, minQuer, auftritte: vk.statistik.kranken + '/' + vk.statistik.abschlepp, haengen: vk.statistik.haengen };
}
module.exports = { messen };

if (require.main === module) {
  const sek = Number(process.argv[2]) || 200, strecken = (process.argv[3] || 'wiese,wald,wueste').split(','), seeds = Number(process.argv[4]) || 10;
  let gesamt = 0, max = 0;
  for (const id of strecken) {
    const zeilen = [];
    let summe = 0;
    for (let k = 0; k < seeds; k++) { const r = messen(id, k, sek); zeilen.push(r.haengt.toFixed(1)); summe += r.haengt; max = Math.max(max, r.haengt); }
    gesamt += summe;
    console.log(id.padEnd(8), 'hängt-s je Seed:', zeilen.join(' '), ' Summe', summe.toFixed(1), ' Ø', (summe / seeds).toFixed(1));
  }
  console.log('Gesamt', gesamt.toFixed(1), 's, Max je Lauf', max.toFixed(1));
}
