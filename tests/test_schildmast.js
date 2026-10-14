// Schild-Masten als feste Hindernisse (14.10., v21): node tests/test_schildmast.js [streckenId]
//  A) einbauen(): je Schild + Leitpfeil genau eine Säule { art:'schildmast', r ≈ 0,12 } in strecke.saeulen, idempotent, an=false/mastKollision=false → keine
//  B) Aufprall: Auto fährt auf einen Mast zu → bleibt draußen (Mast nie im Auto-Rechteck), verliert Tempo, Bande() meldet einen Stoß
//  C) nur der Mast: knapp daneben (Tafel hängt darüber, kein Kollider) wird nichts gebremst
//  D) KI (schwer, 1 Runde, mit Bande + Hindernissen) auf jeder Strecke: im Ziel, nie am Mast (≥ 2,5 m), Rundenzeit normal (kein Hängenbleiben)
//  E) Server: Simulation hat die Masten in sim.strecke.saeulen (gleiche Anzahl wie ein „Browser“-Aufbau mit einbauen())
const S = require('../server/simulation.js');
const nurId = process.argv.slice(2).find((a) => !a.startsWith('--'));
const R = S.kontextLaden(S.MODULE.slice(0, -1));
let fehler = 0, geprueft = 0;
function pruefe(name, ok, info) { geprueft++; if (!ok) { fehler++; console.log('FEHL ' + name + (info ? '  (' + info + ')' : '')); } else if (process.argv.includes('--v')) console.log('OK   ' + name + (info ? '  (' + info + ')' : '')); }
const K = R.Kurvenschilder, dt = R.config.physik.schritt;
const masten = (st) => (st.saeulen || []).filter((q) => q.art === 'schildmast');

for (const daten of R.trackCatalog) {
  if (nurId && daten.id !== nurId) continue;
  const t = `[${daten.id}]`;
  const st = new R.Strecke(daten, { welt: daten.weltStandard });
  const vorher = (st.saeulen || []).length;
  const liste = K.einbauen(st, 'normal');
  const erwartet = liste.reduce((a, s) => a + 1 + s.leitpfeile.length, 0);
  // A
  pruefe(`${t} A Anzahl Masten = Schilder + Leitpfeile`, masten(st).length === erwartet && erwartet > 0, `${masten(st).length} vs ${erwartet}`);
  pruefe(`${t} A Radius 0,05…0,2 m`, masten(st).every((q) => q.r >= 0.05 && q.r <= 0.2));
  K.einbauen(st, 'normal');
  pruefe(`${t} A idempotent (zweiter Aufruf verdoppelt nichts)`, masten(st).length === erwartet && st.saeulen.length === vorher + erwartet, `${st.saeulen.length}`);
  // Mast liegt höchstens 0,3 m neben dem Schild (Mast steht hinter der Tafel)
  pruefe(`${t} A Mast bei Schild`, liste.every((s) => masten(st).some((q) => Math.hypot(q.x - s.x, q.z - s.z) < 0.5)));

  // B/C: erster Mast
  const m = masten(st)[0], sp = st.spline, n = sp.naechster(m.x, m.z);
  const p = sp.punktBei(n.s);
  const auto = (x, z, h, v) => { const a = new R.Vehicle({}); a.setzen(x, z, h); a.y = st.hoeheAn(x, z); a.vLaengs = v; return a; };
  // B: von der Straße auf den Mast zu
  {
    const h = R.headingAus(m.x - p.x, m.z - p.z);          // genau auf den Mast
    const fx = -Math.sin(h), fz = -Math.cos(h);
    const a = auto(m.x - fx * 8, m.z - fz * 8, h, 16);
    let stoss = 0, minD = Infinity, vVor = 16, vNach = null;
    for (let i = 0; i < 240; i++) {
      a.untergrund = 'gras';
      a.schritt(dt, { gas: 1, bremse: 0, lenkung: 0 });
      const s = R.Kollisionen.bande(a, st);
      if (s > stoss) { stoss = s; vNach = a.vLaengs; }
      // Mast im Auto-Rechteck?
      const lx = (m.x - a.x) * -Math.sin(a.heading) + (m.z - a.z) * -Math.cos(a.heading), lq = (m.x - a.x) * Math.cos(a.heading) + (m.z - a.z) * -Math.sin(a.heading);
      const innen = Math.abs(lx) < a.daten.laenge / 2 - 0.2 && Math.abs(lq) < a.daten.breite / 2 - 0.1;
      if (innen) minD = -1;
    }
    pruefe(`${t} B Aufprall: Stoß gemeldet`, stoss > 1, 'Stärke ' + stoss.toFixed(1));
    pruefe(`${t} B Mast nie im Auto`, minD !== -1);
    pruefe(`${t} B Tempo nach dem Stoß deutlich kleiner`, vNach !== null && Math.abs(vNach) < vVor * 0.7, vNach === null ? '-' : vNach.toFixed(1));
  }
  // C: knapp daneben (parallel zur Straße, Auto-Mitte 1,6 m näher an der Straße als der Mast: Karosserie-Rand 0,9 m → 0,7 m Luft;
  //    die Tafel hängt darüber, hat aber keinen Kollider)
  {
    const sg = n.seitenabstand >= 0 ? 1 : -1;
    const h = R.headingAus(p.tx, p.tz), tx = p.tx, tz = p.tz;
    const a = auto(m.x - tx * 8 - p.nx * sg * 1.6, m.z - tz * 8 - p.nz * sg * 1.6, h, 14);
    let vMin = 99, stoss = 0;
    for (let i = 0; i < 60; i++) {
      a.untergrund = 'gras';
      a.schritt(dt, { gas: 1, bremse: 0, lenkung: 0 });
      stoss = Math.max(stoss, R.Kollisionen.bande(a, st));
      vMin = Math.min(vMin, a.vLaengs);
    }
    pruefe(`${t} C knapp daneben: kein Stoß, kein Abbremsen`, stoss === 0 && vMin > 12, `Stoß ${stoss.toFixed(2)}, vMin ${vMin.toFixed(1)}`);
  }

  // D: KI-Runde mit Bande
  {
    const plaetze = st.startpositionen(1), pl = plaetze[0];
    const v = new R.Vehicle({}); v.setzen(pl.x, pl.z, pl.heading);
    const d = new R.Driver(v, st, { schwierigkeit: 'schwer', seed: 5, name: 'KI' });
    const tn = [{ vehicle: v, name: 'KI', istSpieler: false }];
    const rennen = new R.RaceManager(st, tn, { runden: 1, countdown: 0 }), rt = rennen.teilnehmer[0];
    if (st.pylonenZurueck) st.pylonenZurueck();
    let idx = -1, zeit = 0, minAbstand = Infinity, stoesse = 0;
    const lp = R.Looping.zustand();
    const ms = masten(st);
    for (; zeit < 300; zeit += dt) {
      if (rt.imZiel) break;
      const s = d.steuerung(dt, { andere: [], spielerFortschrittMax: null, eigenerFortschritt: rt.fortschritt, laeuft: true });
      const nn = st.abfrage(v.x, v.z, idx); idx = nn.index; v.untergrund = nn.untergrund;
      if (st.loopings.length) { const lr = R.Looping.fahrzeugSchritt(lp, v, st, s, dt, idx); if (lr.ereignis === 'gefallen') rennen.verfolgungSetzen(0, v.x, v.z); } else v.schritt(dt, s);
      if (R.Kollisionen.hindernisse) R.Kollisionen.hindernisse([v], st, { dt, zeit });
      if (R.Kollisionen.bande(v, st) > 0.5) stoesse++;
      rennen.schritt(dt);
      if ((Math.round(zeit / dt)) % 6 === 0) for (const q of ms) minAbstand = Math.min(minAbstand, Math.hypot(q.x - v.x, q.z - v.z));
    }
    pruefe(`${t} D KI im Ziel (kein Hängenbleiben)`, rt.imZiel, `Zeit ${zeit.toFixed(0)} s`);
    pruefe(`${t} D KI nie am Mast (≥ 2,5 m von der Auto-Mitte)`, minAbstand >= 2.5, minAbstand.toFixed(1) + ' m');
    pruefe(`${t} D keine Bande-/Mast-Stöße der KI`, stoesse === 0, String(stoesse));
  }
}

// E: Server-Simulation
{
  const id = nurId || 'wiese';
  const sim = new S.Simulation({ einstellungen: { streckeId: id, gegner: 1, runden: 1 }, spieler: [{ fahrer: S.laden().config.fahrer[0].name, auto: 'passat', hilfe: 'aus' }], seed: 3 });
  const ms = masten(sim.sim.strecke);
  const daten = sim.R.trackCatalog.find((t) => t.id === id);
  const st2 = new sim.R.Strecke(daten, { welt: sim.R.Strecke.weltName(daten, '') });
  const erw = sim.R.Kurvenschilder.einbauen(st2, sim.einstellungen.tempoKlasse).reduce((a, s) => a + 1 + s.leitpfeile.length, 0);
  pruefe(`[${id}] E Server kennt die Masten (wie Browser)`, ms.length === erw && erw > 0, `${ms.length} vs ${erw}`);
}
console.log(`\n${geprueft} Prüfungen, ${fehler} FEHL`);
console.log(fehler ? 'FEHLER' : 'ALLE MAST-PRÜFUNGEN OK');
process.exit(fehler ? 1 : 0);
