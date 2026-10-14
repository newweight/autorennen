// Polizei ONLINE (14.10., v21): node tests/test_polizei_online.js
// Server (server/simulation.js) simuliert die Streifenwagen autoritativ mit derselben Logik wie offline (src/world/polizei.js).
//  P1) Protokoll: einstellungen.polizei nur bei echtem true; ohne Polizei kein po/ps/pz im Zustand (abwärtskompatibel); Netz.VERSION ≥ 4;
//      Anzahl Streifenwagen = Polizei.anzahl(gegner); `a` enthält weiter nur die Teilnehmer
//  P2) Ablauf: Spieler fährt langsam → Streifenwagen holt ihn ein → Anhaltung 4 s (ps/ich.ps sinkt von 4 auf 0), Auto steht, Streifenwagen
//      steht NEBEN dem Auto (parallel, ~2,6 m Mitte–Mitte), danach Meldung „Weiterfahren!“ an den Spieler und Schonfrist
//  P3) Vorhersage berücksichtigt den Stopp: Client-Vorhersage (vorhersage.js, ich.ps) bleibt vor/während/nach dem Stopp beim Server (< 1 cm im Stopp, max. 6 cm Übergang)
//  P4) Streifenwagen springen nicht: Position von po ändert sich je Zustand höchstens um tempo·dt + Einparken; Reset-Zähler vorhanden
const S = require('../server/simulation.js');
const { Simulation, kontextLaden, laden, einstellungenPruefen } = S;
const R = laden(), DT = R.config.physik.schritt;
let fehler = 0, geprueft = 0;
function pruefe(name, ok, info) { geprueft++; console.log((ok ? 'OK   ' : 'FEHL ') + name + (info !== undefined ? '  (' + info + ')' : '')); if (!ok) fehler++; }

const C = kontextLaden(['vendor/three.min.js', 'src/config.js', 'src/physics/vehicle.js', 'src/physics/collisions.js', 'src/cars/carCatalog.js',
  'src/track/spline.js', 'src/track/trackCatalog.js', 'src/track/trackBuilder.js', 'src/track/looping.js', 'src/track/schanze.js', 'src/track/anlauf.js',
  'src/world/themes.js', 'src/world/schilder.js', 'src/world/wetter.js', 'src/world/kleber.js', 'src/world/polizei.js', 'src/net/protokoll.js', 'src/net/vorhersage.js']);

function clientStrecke(e) {
  const daten = C.trackCatalog.find(t => t.id === e.streckeId);
  const st = new C.Strecke(daten, { welt: C.Strecke.weltName(daten, e.welt), variante: e.variante, hindernisMenge: e.hindernisMenge });
  const w = new C.Wetter(null, { jahreszeit: e.jahreszeit, wetter: e.wetter, wind: { staerke: e.windStaerke, richtung: e.windRichtung },
    thema: daten.thema, seed: 1, strecke: st, tageszeit: e.tageszeit });
  C.Kurvenschilder.einbauen(st, e.tempoKlasse);
  C.Kollisionen.pflanzenSammeln(st, C.themes.dekoBauen(daten.thema, st, w.jahreszeit));
  C.Kollisionen.wracksEinbauen(st);
  return { st, w };
}
/** Langsamer Autopilot (Pure Pursuit, Anteil der Ideallinien-Geschwindigkeit): wird von der Polizei eingeholt. */
function autopilot(st, v, idx, anteil) {
  const n = st.abfrage(v.x, v.z, idx), sp = st.spline;
  const vl = Math.max(3, v.vLaengs), L = Math.max(9, Math.min(50, 0.55 * vl + 8));
  const ziel = sp.punktBei(n.s + L);
  let diff = C.headingAus(ziel.x - v.x, ziel.z - v.z) - v.heading;
  while (diff > Math.PI) diff -= 2 * Math.PI;
  while (diff < -Math.PI) diff += 2 * Math.PI;
  const lenkung = Math.max(-1, Math.min(1, -(2 * vl * Math.sin(diff) / Math.hypot(ziel.x - v.x, ziel.z - v.z)) / v.drehrateMax(vl)));
  const soll = st.tempoBei(n.s + vl * 0.3) * anteil;
  return { s: { gas: v.vLaengs < soll ? 1 : 0, bremse: v.vLaengs > soll + 3 ? 0.5 : 0, lenkung }, idx: n.index };
}
const neu = (opt) => new Simulation({ einstellungen: Object.assign({ streckeId: 'wiese', runden: 3, gegner: 0, tageszeit: 'tag', jahreszeit: 'sommer', wetter: 'klar', windStaerke: 0, polizei: true }, opt),
  spieler: [{ fahrer: 'Jonas', auto: 'porsche-911', hilfe: 'aus' }], seed: 77 });

// ---------------- P1 Protokoll
{
  pruefe('P1 Netz.VERSION ≥ 4', R.Netz.VERSION >= 4, R.Netz.VERSION);
  const e = (v) => einstellungenPruefen({ polizei: v }, 1).polizei;
  pruefe('P1 einstellungen.polizei: nur echtes true schaltet an', e(true) === true && e('true') === false && e(1) === false && e(null) === false && e(undefined) === false && e({}) === false);
  const aus = neu({ polizei: false }), z0 = aus.zustand();
  pruefe('P1 ohne Polizei: kein po/ps/pz (wie Version 3)', z0.po === undefined && z0.ps === undefined && z0.pz === undefined && z0.a.length === 1 && aus.sim.polizei === null);
  const an = neu({ polizei: true }), z1 = an.zustand();
  pruefe('P1 mit Polizei: po (1 Streifenwagen bei 0 Gegnern), a nur Teilnehmer', Array.isArray(z1.po) && z1.po.length === R.Polizei.anzahl(0) && z1.po[0].length === 14 && z1.a.length === 1, JSON.stringify(z1.po));
  const viele = neu({ polizei: true, gegner: 6 }), z2 = viele.zustand();
  pruefe('P1 6 Gegner: 2 Streifenwagen, a = 7 Teilnehmer, Teilnehmerliste unverändert', z2.po.length === 2 && z2.a.length === 7 && viele.teilnehmerInfo.length === 7 && R.Polizei.anzahl(6) === 2, `po ${z2.po.length}, a ${z2.a.length}`);
  pruefe('P1 startInfo meldet polizei:true', an.startInfo().einstellungen.polizei === true && aus.startInfo().einstellungen.polizei === false);
  pruefe('P1 Streifenwagen nicht im Rennen (Teilnehmer, Rangliste, Ergebnis)', an.sim.rennen.teilnehmer.length === 1 && an.ergebnis().zeilen.length === 1);
}

// ---------------- P2/P3/P4: Verfolgung
{
  const sim = neu({}), info = sim.startInfo(), e = info.einstellungen, { st, w } = clientStrecke(e);
  const auto = C.carCatalog.waehlbare().find(a => a.id === 'porsche-911');
  const V = new C.NetzVorhersage({ strecke: st, auto, tempoKlasse: e.tempoKlasse, fahrhilfe: 'aus', umwelt: () => w.umwelt() });
  const p = st.startpositionen(1)[0];
  V.vp.setzen(p.x, p.z, p.heading); V.vp.y = st.hoeheAn(p.x, p.z);
  const pv = new C.Vehicle(auto.fahrwerte, { tempoKlasse: e.tempoKlasse });
  let idx = -1, stoppTicks = 0, startTick = -1, endTick = -1, maxRest = 0, meldung = false, d0 = null;
  const hist = [], LAG = 6;
  let maxStopp = 0, maxUeber = 0, maxNormal = 0, vorher = null, maxSprung = 0, seiteMess = null, z = null;
  for (let n = 1; n <= 60 * 150; n++) {
    C.Netz.fahrzeugSchreiben(pv, sim.ich(0).v);
    const a = autopilot(st, pv, idx, 0.55); idx = a.idx;
    const s = C.Netz.eingabeDekodieren(C.Netz.eingabeKodieren(a.s));
    const cd = sim.sim.rennen.zustand === 'countdown', zielSp = sim.sim.rennen.teilnehmer[0].imZiel;
    sim.eingabeSetzen(0, s); sim.schritt();
    V.schritt(n, s, { countdown: cd, imZiel: zielSp });
    for (const ev of sim.abholen()) if (ev.art === 'meldung' && /Weiterfahren/.test(ev.text) && startTick >= 0) meldung = true;
    z = sim.zustand();
    const ps = z.ps && z.ps.find(x => x[0] === 0);
    // P4: Streifenwagen springt nicht
    const po = z.po[0];
    if (vorher && vorher[13] === po[13]) maxSprung = Math.max(maxSprung, Math.hypot(po[0] - vorher[0], po[1] - vorher[1]));
    vorher = po;
    if (ps) {
      if (startTick < 0) startTick = n;
      stoppTicks++; maxRest = Math.max(maxRest, ps[1]);
      // Mitte der Anhaltung (nach 1,5 s): Streifenwagen neben dem Auto?
      if (stoppTicks === 150) {
        const a0 = z.a[0], dx = po[0] - a0[0], dz = po[1] - a0[1];
        const fx = -Math.sin(a0[3]), fz = -Math.cos(a0[3]), qx = Math.cos(a0[3]), qz = -Math.sin(a0[3]);
        seiteMess = { laengs: dx * fx + dz * fz, quer: dx * qx + dz * qz, winkel: Math.abs(C.Vehicle.winkelDiff(po[3], a0[3])), tempo: a0[4] };
      }
    } else if (startTick >= 0 && endTick < 0) endTick = n;
    hist.push(sim.ich(0)); hist[hist.length - 1].ack = n; if (hist.length > 8) hist.shift();
    if (n % 3 === 0 && hist.length > LAG) {
      const ich = hist[hist.length - 1 - LAG];             // Server-Zustand von vor LAG Ticks (Latenz): die Vorhersage rechnet LAG Eingaben nach
      const dServer = V.vp;
      // Vergleich mit dem Server-Zustand DERSELBEN Folge-Nr: aktuelle Vorhersage (n) gegen aktuellen Server (n)
      const jetzt = hist[hist.length - 1];
      const d = Math.hypot(V.vp.x - jetzt.v[0], V.vp.z - jetzt.v[1]);
      if (!ich.so && !V.sonder) {
        const imStopp = startTick >= 0 && endTick < 0;
        if (imStopp && n - startTick > LAG + 3) maxStopp = Math.max(maxStopp, d);
        else if (startTick >= 0 && n - startTick <= LAG + 3) maxUeber = Math.max(maxUeber, d);
        else if (startTick < 0 && n > 360) maxNormal = Math.max(maxNormal, d);
        else if (endTick >= 0 && n - endTick > 6) maxNormal = Math.max(maxNormal, d);
      }
      V.abgleich(ich, null);
    }
    if (endTick >= 0 && n > endTick + 600) break;
  }
  pruefe('P2 Streifenwagen holt den langsamen Spieler ein und hält ihn an', startTick > 0, 'Tick ' + startTick + ' (' + (startTick * DT).toFixed(1) + ' s)');
  pruefe('P2 Anhaltung dauert 4 s (240 Ticks ± 2), Rest beginnt bei ≤ 4,0 s', Math.abs(stoppTicks - 240) <= 2 && maxRest > 3.9 && maxRest <= 4.0001, `${stoppTicks} Ticks, Rest max ${maxRest}`);
  pruefe('P2 Auto steht in der Mitte der Anhaltung (Tempo < 0,5 m/s)', seiteMess && Math.abs(seiteMess.tempo) < 0.5, seiteMess && seiteMess.tempo.toFixed(2));
  pruefe('P2 Streifenwagen steht NEBEN dem Auto: parallel (< 0,1 rad), quer 2,3…3,0 m, längs ≤ 1,5 m', seiteMess && seiteMess.winkel < 0.1 && Math.abs(seiteMess.quer) > 2.3 && Math.abs(seiteMess.quer) < 3 && Math.abs(seiteMess.laengs) <= 1.5,
    seiteMess && `quer ${seiteMess.quer.toFixed(2)}, längs ${seiteMess.laengs.toFixed(2)}, Winkel ${seiteMess.winkel.toFixed(3)}`);
  pruefe('P2 danach Meldung „Weiterfahren!“ an den Spieler', meldung);
  pruefe('P2 Spieler fährt nach dem Stopp wieder (Tempo > 3 m/s nach 3 s)', sim.zustand().a[0][4] > 3 || endTick < 0, sim.zustand().a[0][4].toFixed(1));
  pruefe('P3 Vorhersage im Stopp: Abweichung zum Server < 1 cm', maxStopp < 0.01, maxStopp.toFixed(4) + ' m (Latenz 6 Ticks = 100 ms)');
  pruefe('P3 Vorhersage beim Übergang (erste 9 Ticks = Latenz, Server-Zustand noch unbekannt): < 0,4 m', maxUeber < 0.4, maxUeber.toFixed(4) + ' m');
  pruefe('P3 Vorhersage sonst unverändert gut (< 1 cm, kein Hindernis/Sonderzustand)', maxNormal < 0.01, maxNormal.toFixed(4) + ' m');
  pruefe('P4 Streifenwagen springt nie (max. Weg je Zustand-Tick < 1 m)', maxSprung < 1.0, maxSprung.toFixed(3) + ' m');
  // ohne Vorhersage-Berücksichtigung wäre der Fehler groß (Gegenprobe: ps ignorieren)
  {
    const V2 = new C.NetzVorhersage({ strecke: st, auto, tempoKlasse: e.tempoKlasse, fahrhilfe: 'aus', umwelt: () => w.umwelt() });
    V2.vp.setzen(p.x, p.z, p.heading);
    const sim2 = neu({}), hist2 = [];
    let idx2 = -1, gegen = 0;
    for (let n = 1; n <= 60 * 150; n++) {
      C.Netz.fahrzeugSchreiben(pv, sim2.ich(0).v);
      const a = autopilot(st, pv, idx2, 0.55); idx2 = a.idx;
      const s = C.Netz.eingabeDekodieren(C.Netz.eingabeKodieren(a.s));
      sim2.eingabeSetzen(0, s); sim2.schritt();
      V2.schritt(n, s, { countdown: sim2.sim.rennen.zustand === 'countdown', imZiel: false });
      hist2.push(sim2.ich(0)); hist2[hist2.length - 1].ack = n; if (hist2.length > 8) hist2.shift();
      if (n % 3 === 0 && hist2.length > LAG) {
        const jetzt = hist2[hist2.length - 1], ich = Object.assign({}, hist2[hist2.length - 1 - LAG]);
        const stopp = jetzt.ps > 0 && ich.ps > 0; delete ich.ps;
        if (stopp && !ich.so && jetzt.v[4] < 5) gegen = Math.max(gegen, Math.hypot(V2.vp.x - jetzt.v[0], V2.vp.z - jetzt.v[1]));
        V2.abgleich(ich, null);
      }
      if (gegen > 1) break;
    }
    pruefe('P3 Gegenprobe: ohne ich.ps weicht die Vorhersage im Stopp deutlich ab (> 0,1 m) – der Test misst also wirklich', gegen > 0.1, gegen.toFixed(2) + ' m');
  }
}
console.log(`\n${geprueft} Prüfungen, ${fehler} FEHL`);
console.log(fehler ? 'FEHLER' : 'ALLE POLIZEI-ONLINE-PRÜFUNGEN OK');
process.exit(fehler ? 1 : 0);
