// v28c B: node tests/rempeln_netz_messung.js [latenzen ms, z. B. 0,50,100,200]
// Gleichschritt-Messung „Rempeln online“ OHNE Browser-Zeitrauschen: echte Server-Simulation (server/simulation.js, kollisionen: true)
// + zwei Clients (Host = Nr 0, Gast = Nr 1) mit genau dem Browser-Code für die Anzeige (src/net/vorhersage.js: NetzVorhersage für das
// eigene Auto inkl. Stellvertreter, NetzPuffer + NetzAnzeige für das andere Auto). Latenz als Ticks: Eingabe hoch (U), Server-Warteschlange
// (Q = 2 Ticks, wie server.js eingabeTick Ziel 2), Zustand runter (D); Zustände 20 Hz (alle 3 Ticks). Server-Uhr des Clients = Server-Tick − D
// (schnellster Weg), Verzug 0,1 s (NetzVerbindung.verzug ohne Zittern).
// Gemessen je Tick als Rechteck-Abstand (Kollisionen.obbAbstand, < 0 = Überlappung):
//   server = beide Autos auf dem Server | host/gast = was der jeweilige Bildschirm zeigt (eigenes = Vorhersage + Korrektur, anderes = NetzAnzeige)
//   gastVp = eigene Vorhersage OHNE Korrektur gegen die Anzeige des anderen (Zerlegung der Ursache)
// Wird von tests/test_online_rempeln.js (Block U) benutzt; als Skript gibt es eine Tabelle aus.
'use strict';
const path = require('path');
const { Simulation, kontextLaden } = require('../server/simulation');

let C = null;
function client() {
  if (C) return C;
  C = kontextLaden(['vendor/three.min.js', 'src/config.js', 'src/physics/vehicle.js', 'src/physics/collisions.js', 'src/cars/carCatalog.js',
    'src/track/spline.js', 'src/track/trackCatalog.js', 'src/track/trackBuilder.js', 'src/track/looping.js', 'src/track/schanze.js', 'src/track/anlauf.js',
    'src/world/themes.js', 'src/world/schilder.js', 'src/world/wetter.js', 'src/world/kleber.js', 'src/world/polizei.js', 'src/net/protokoll.js', 'src/net/vorhersage.js']);
  return C;
}
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

// Szenarien: A = Host (Nr 0), B = Gast (Nr 1). s = Streckenmeter (Wiese, Gerade), Lage von B relativ zu A (vorn/quer in m, Winkel rad),
// Tempi, Eingaben je Auto (fest). ms = Dauer.
const SZENARIEN = {
  stand_stand: { s: 420, bVorn: -3.0, bQuer: 0.4, bWinkel: 0, vA: 0, vB: 0, eA: { gas: 0, bremse: 0, lenkung: 0 }, eB: { gas: 0, bremse: 0, lenkung: 0 }, ms: 1500 },   // überlappend abgestellt
  langsam: { s: 420, bVorn: -9, bQuer: 0.3, bWinkel: 0, vA: 0, vB: 3, eA: { gas: 0, bremse: 0, lenkung: 0 }, eB: { gas: 0.3, bremse: 0, lenkung: 0 }, ms: 4000 },
  schnell: { s: 420, bVorn: -20, bQuer: 0.3, bWinkel: 0, vA: 0, vB: 25, eA: { gas: 0, bremse: 0, lenkung: 0 }, eB: { gas: 1, bremse: 0, lenkung: 0 }, ms: 2500 },
  schieben: { s: 420, bVorn: -12, bQuer: 0, bWinkel: 0, vA: 0, vB: 8, eA: { gas: 0, bremse: 0, lenkung: 0 }, eB: { gas: 1, bremse: 0, lenkung: 0 }, ms: 4000 },   // wie der Browser-Test: Gas halten, A wird geschoben
  schraeg: { s: 420, bVorn: -9, bQuer: 5, bWinkel: 0.6, vA: 0, vB: 12, eA: { gas: 0, bremse: 0, lenkung: 0 }, eB: { gas: 1, bremse: 0, lenkung: 0 }, ms: 3000 },
  frontal: { s: 700, bVorn: 22, bQuer: 0.3, bWinkel: Math.PI, vA: 8, vB: 15, eA: { gas: 0.5, bremse: 0, lenkung: 0 }, eB: { gas: 1, bremse: 0, lenkung: 0 }, ms: 2500 },
  nebeneinander: { s: 420, bVorn: 0, bQuer: 2.6, bWinkel: 0, vA: 22, vB: 22, eA: { gas: 1, bremse: 0, lenkung: 0 }, eB: { gas: 1, bremse: 0, lenkung: -0.6 }, ms: 2500, eBDauer: 30 },
};

/**
 * Ein Lauf. lat = { U, D } in Ticks (Einweg hoch/runter), Q = Server-Warteschlange in Ticks.
 * Rückgabe je Quelle: Reihe der Rechteck-Abstände (m) je Tick + Zusammenfassung.
 */
function lauf(name, latMs, opt) {
  client();
  const o = opt || {}, def = SZENARIEN[name], DT = C.config.physik.schritt;
  const half = Math.round(latMs / 2 / (DT * 1000));
  const U = o.U !== undefined ? o.U : half, D = o.D !== undefined ? o.D : half, Q = o.Q !== undefined ? o.Q : 2;
  const sim = new Simulation({ einstellungen: { streckeId: 'wiese', gegner: 0, kollisionen: true, runden: 3, tiere: false, polizei: false },
    spieler: [{ fahrer: 'Jonas', auto: 'passat', hilfe: 'aus' }, { fahrer: 'Emmy', auto: 'passat', hilfe: 'aus' }], seed: 77 });
  const e = sim.startInfo().einstellungen, { st, w } = clientStrecke(e);
  const S = sim.sim, F = S.fahrzeuge, R = sim.R;
  for (let k = 0; k < 60 * 12 && !S.rennen.gasErlaubt; k++) sim.schritt();
  for (let k = 0; k < 60 * 3; k++) sim.schritt();
  const sp = S.strecke.spline, p = sp.punktBei(def.s), h = R.headingAus(p.tx, p.tz);
  const A = F[0].vehicle, B = F[1].vehicle;
  A.setzen(p.x, p.z, h); A.y = S.strecke.hoeheAn(A.x, A.z); A.vLaengs = def.vA;
  const ra = A.richtung(), qa = A.rechts();
  B.setzen(A.x + ra.x * def.bVorn + qa.x * def.bQuer, A.z + ra.z * def.bVorn + qa.z * def.bQuer, h + def.bWinkel);
  B.y = S.strecke.hoeheAn(B.x, B.z); B.vLaengs = def.vB;
  F[0].index = -1; F[1].index = -1;
  S.rennen.verfolgungSetzen(0, A.x, A.z, def.s); S.rennen.verfolgungSetzen(1, B.x, B.z, def.s + def.bVorn);
  for (const f of F) { f.stehZeit = 0; f.falschHerum = false; f.falschZeit = 0; }
  A._kollAlt = null; B._kollAlt = null;
  const katalog = C.carCatalog.waehlbare(), auto = katalog.find(a => a.id === 'passat');
  // Clients
  const kl = [0, 1].map(nr => {
    const V = new C.NetzVorhersage({ strecke: st, auto, tempoKlasse: e.tempoKlasse, fahrhilfe: 'aus', umwelt: () => w.umwelt(),
      kollisionen: true, andere: [{ nr: 1 - nr, auto }], rempeln: 'sanft' });
    const puffer = new C.NetzPuffer();
    let uhr = null;
    const verb = { serverTick: () => uhr, verzug: () => C.Netz.INTERP_VERZUG };
    const anz = new C.NetzAnzeige(verb, puffer);
    const ich0 = JSON.parse(JSON.stringify(sim.ich(nr))); ich0.ack = 0;
    const z0 = JSON.parse(JSON.stringify(sim.zustand())); z0.k = 0;
    puffer.rein(z0);
    V.abgleich(ich0, null, z0.a, 0);
    const mein = new C.Vehicle(auto.fahrwerte, { tempoKlasse: e.tempoKlasse }), er = new C.Vehicle(auto.fahrwerte, { tempoKlasse: e.tempoKlasse });
    V.anzeigen(mein);
    return { nr, V, puffer, anz, setUhr: (t) => { uhr = t; }, mein, er, eing: [], ank: [], hart: 0 };
  });
  const eingabe = (nr, T) => {
    let s = nr === 0 ? def.eA : def.eB;
    if (nr === 1 && def.eBDauer !== undefined && T > def.eBDauer) s = Object.assign({}, s, { lenkung: 0 });
    return C.Netz.eingabeDekodieren(C.Netz.eingabeKodieren(s));
  };
  const N = Math.round(def.ms / 1000 / DT);
  const reihe = { server: [], host: [], gast: [], gastVp: [], hostVp: [], gastFehler: [], gastAnzLag: [], gastTrenn: [], gastSprung: [] };
  let vorM = null;
  const offen = [];                       // Server-Eingaben { an: Tick, nr, n, s }
  const nl = [0, 0];
  const ack = [0, 0];
  for (let T = 1; T <= N; T++) {
    // 1) Clients: angekommene Zustände, dann ihr Schritt T (Eingabe T geht los)
    for (const c of kl) {
      while (c.ank.length && c.ank[0].an <= T) {
        const m = c.ank.shift();
        c.puffer.rein(m.z);
        const v = c.mein, tr = c.V.trenn || { x: 0, z: 0 }, anzeige = { x: v.x - tr.x, z: v.z - tr.z, y: v.y, heading: v.heading };   // wie online.js: ohne Trenn-Versatz
        c.V.abgleich(m.ich, anzeige, m.z.a, m.z.k);
        if (c.V.hart) { c.hart++; c.V.anzeigen(v); c.V.hart = false; }
      }
      const s = eingabe(c.nr, T);
      c.V.schritt(T, s, { countdown: false, imZiel: false });
      offen.push({ an: T + U + Q, nr: c.nr, n: T, s });
      c.setUhr(T - D);                     // geschätzte Server-Uhr = jüngster (schnellster) Zustand
      c.anz.schritt(0);
      c.V.abklingen(DT);
      c.V.anzeigen(c.mein);
      c.anz.pose(1 - c.nr, c.er);
      if (!o.ohneTrennen && c.V.trennen) c.V.trennen(c.mein, [c.er], DT);     // v28c: wie online.js (o.ohneTrennen = Stand vor v28c)
    }
    // 2) Server: fällige Eingaben setzen, Schritt T
    for (let i = offen.length - 1; i >= 0; i--) {
      const x = offen[i];
      if (x.an <= T) { sim.eingabeSetzen(x.nr, x.s); ack[x.nr] = Math.max(ack[x.nr], x.n); offen.splice(i, 1); }
    }
    sim.schritt();
    if (T % 3 === 0) {
      const z = JSON.parse(JSON.stringify(sim.zustand())); z.k = T;
      for (const c of kl) { const ich = JSON.parse(JSON.stringify(sim.ich(c.nr))); ich.ack = ack[c.nr]; c.ank.push({ an: T + D, z, ich }); }
    }
    // 3) messen
    const K = C.Kollisionen;
    reihe.server.push(K.obbAbstand(A, B));
    reihe.host.push(K.obbAbstand(kl[0].mein, kl[0].er));
    reihe.gast.push(K.obbAbstand(kl[1].mein, kl[1].er));
    reihe.gastVp.push(K.obbAbstand(kl[1].V.vp, kl[1].er));
    reihe.hostVp.push(K.obbAbstand(kl[0].V.vp, kl[0].er));
    reihe.gastFehler.push(Math.hypot(kl[1].mein.x - B.x, kl[1].mein.z - B.z));
    reihe.gastAnzLag.push(Math.hypot(kl[1].er.x - A.x, kl[1].er.z - A.z));
    const gm = kl[1].mein, gv = kl[1].V.vp;
    reihe.gastTrenn.push(Math.hypot(kl[1].V.trenn.x, kl[1].V.trenn.z));
    reihe.gastSprung.push(vorM ? Math.hypot((gm.x - vorM[0]) - (gv.x - vorM[2]), (gm.z - vorM[1]) - (gv.z - vorM[3])) : 0);   // Anzeige-Bewegung minus Vorhersage-Bewegung je Tick
    vorM = [gm.x, gm.z, gv.x, gv.z];
    if (o.spur) o.spur.push({ T, A: [A.x, A.z, A.vLaengs], B: [B.x, B.z, B.vLaengs], gm: [kl[1].mein.x, kl[1].mein.z], ge: [kl[1].er.x, kl[1].er.z], vp: [kl[1].V.vp.x, kl[1].V.vp.z], tr: [kl[1].V.trenn.x, kl[1].V.trenn.z], ra: [ra.x, ra.z, qa.x, qa.z], p0: [p.x, p.z] });
  }
  return { name, latMs, U, D, Q, reihe, N, hart: kl.map(c => c.hart), stoesseVorhersage: kl.map(c => c.V.stat.stoesse), vEnde: [A.vLaengs, B.vLaengs] };
}

/** Zusammenfassung einer Reihe: tiefste Überlappung, Dauer (Ticks) mit Überlappung > grenze, längste Strecke am Stück > spitze. */
function auswerten(r, opt) {
  const o = opt || {}, DT = 1 / 60, ab = o.ab || 0;
  const z = {};
  for (const [q, l] of Object.entries(r.reihe)) {
    if (q === 'gastFehler' || q === 'gastAnzLag' || q === 'gastTrenn' || q === 'gastSprung') { z[q] = Math.max(...l); continue; }
    let min = Infinity, ueber03 = 0, lauf03 = 0, max03 = 0, ueber08 = 0;
    for (let i = ab; i < l.length; i++) {
      const v = l[i];
      min = Math.min(min, v);
      if (v < -0.3) { ueber03++; lauf03++; max03 = Math.max(max03, lauf03); } else lauf03 = 0;
      if (v < -0.8) ueber08++;
    }
    z[q] = { tief: -Math.min(0, min), ms03: Math.round(max03 * DT * 1000), n03: ueber03, n08: ueber08 };
  }
  return z;
}

module.exports = { lauf, auswerten, SZENARIEN };

if (require.main === module) {
  const lats = (process.argv[2] || '0,50,100,200').split(',').map(Number), ohne = process.argv.includes('--ohne');
  const namen = process.argv[3] ? process.argv[3].split(',') : Object.keys(SZENARIEN);
  console.log('Überlappung (m, tiefste) je Quelle; [ms am Stück > 0,3 m]');
  for (const n of namen) for (const l of lats) {
    const r = lauf(n, l, { ohneTrennen: ohne }), a = auswerten(r), f = (x) => `${x.tief.toFixed(2)} [${x.ms03}]`;
    const a05 = auswerten(r, { ab: 30 });
    console.log(`${n.padEnd(14)} ${String(l).padStart(3)} ms  server ${f(a.server)} (ab 0,5 s ${a05.server.tief.toFixed(2)})  host ${f(a.host)}  gast ${f(a.gast)}  gastVp ${f(a.gastVp)}  hostVp ${f(a.hostVp)}  gastFehler max ${a.gastFehler.toFixed(2)}  Versatz max ${a.gastTrenn.toFixed(2)} m  Sprung/Tick max ${a.gastSprung.toFixed(2)} m  hart ${r.hart}  stoesseV ${r.stoesseVorhersage}  v ${r.vEnde.map(x => x.toFixed(1))}`);
  }
}
