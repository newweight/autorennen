// W5-1/2 Mehrspieler: node tests/test_netz.js
// Startet den Server im selben Prozess (freier Port, leise, Zeitraffer ×6 für das Rennen) und prüft:
//  A) Vorhersage = Server-Physik: Client-Vorhersage (src/net/vorhersage.js) mit denselben Eingaben wie die
//     Server-Simulation (server/simulation.js) auf mehreren Strecken/Welten/Wettern – Abweichung vor jedem Abgleich
//  B) Geister (Stufe 1): zwei Spielerautos an derselben Stelle bleiben übereinander; Schalter kollisionen: true trennt sie
//  C) HTTP: nur Spielordner, kein Directory-Listing, Pfad-Traversal abgewiesen, MIME-Typen, nur GET/HEAD
//  D) WebSocket: falscher Pfad, kaputte/unbekannte/zu große Nachrichten → Fehler bzw. Trennung, Server läuft weiter
//  E) 2 Clients: Raum erstellen/beitreten (Code klein geschrieben), Fahrer eindeutig, nur Host stellt ein/startet,
//     Bereit nötig, Start, Zustände ~20 Hz, Folge-Nr-Bestätigung, Checkpoints, Runde/Ziel (Autopilot über Eingaben)
//  F) Gast trennt mitten im Rennen → Auto fährt als Computer weiter, Host bekommt „weg“, Rennen endet mit Ergebnis
//  G) Host trennt → Raum zu, Gast bekommt raumZu; max. 6 Spieler je Raum
//  H) Ping auf localhost (gemessene Latenz)
'use strict';
const http = require('http');
const path = require('path');
const WebSocket = require(path.join(__dirname, '..', 'server', 'node_modules', 'ws'));
const { starten } = require('../server/server');
const { Simulation, kontextLaden, laden, einstellungenPruefen } = require('../server/simulation');

let fehler = 0, ok = 0;
function pruefe(name, gut, info) { console.log((gut ? 'OK   ' : 'FEHL ') + name + (info !== undefined ? '  (' + info + ')' : '')); if (gut) ok++; else fehler++; }
const warte = (ms) => new Promise(r => setTimeout(r, ms));
const R = laden();
const DT = R.config.physik.schritt;

// „Browser“ ohne DOM: dieselben Dateien, die Autorennen.html für Physik/Vorhersage lädt
const C = kontextLaden(['vendor/three.min.js', 'src/config.js', 'src/physics/vehicle.js', 'src/physics/collisions.js', 'src/cars/carCatalog.js',
  'src/track/spline.js', 'src/track/trackCatalog.js', 'src/track/trackBuilder.js', 'src/track/looping.js', 'src/world/themes.js',
  'src/world/wetter.js', 'src/net/protokoll.js', 'src/net/vorhersage.js']);

/** Strecke wie im Browser (main.js streckeSzeneBauen, Physik-Teile) aus den Start-Einstellungen. */
function clientStrecke(e) {
  const daten = C.trackCatalog.find(t => t.id === e.streckeId);
  const st = new C.Strecke(daten, { welt: C.Strecke.weltName(daten, e.welt), variante: e.variante });
  const w = new C.Wetter(null, { jahreszeit: e.jahreszeit, wetter: e.wetter, wind: { staerke: e.windStaerke, richtung: e.windRichtung },
    thema: daten.thema, seed: 1, strecke: st, tageszeit: e.tageszeit });
  C.Kollisionen.pflanzenSammeln(st, C.themes.dekoBauen(daten.thema, st, w.jahreszeit));
  C.Kollisionen.wracksEinbauen(st);
  const th = C.themes[daten.thema];
  if (w.tz && w.tz.laternen && th.laternen) st.saeulen = (st.saeulen || []).concat(C.themes.laternenBauen(st, th, w.tz.laterne).masten);
  return { st, w };
}

/** Einfacher Autopilot (Pure Pursuit + Tempo der Ideallinie) aus der Pose → Steuerung. */
function autopilot(st, v, idx) {
  const n = st.abfrage(v.x, v.z, idx), sp = st.spline;
  const vl = Math.max(3, v.vLaengs), L = Math.max(9, Math.min(50, 0.55 * vl + 8));
  const ziel = sp.punktBei(n.s + L);
  let diff = C.headingAus(ziel.x - v.x, ziel.z - v.z) - v.heading;
  while (diff > Math.PI) diff -= 2 * Math.PI;
  while (diff < -Math.PI) diff += 2 * Math.PI;
  const lenkung = Math.max(-1, Math.min(1, -(2 * vl * Math.sin(diff) / Math.hypot(ziel.x - v.x, ziel.z - v.z)) / v.drehrateMax(vl)));
  const soll = st.tempoBei(n.s + vl * 0.3) * 0.85;
  return { s: { gas: v.vLaengs < soll ? 1 : 0, bremse: v.vLaengs > soll + 3 ? 0.5 : 0, lenkung }, idx: n.index };
}

// ------------------------------------------------------------------ A) Vorhersage = Server
{
  const faelle = [['wiese', '', 'tag', 'sommer', 'klar', 'wenig'], ['wald', 'hindernisse', 'nacht', 'herbst', 'zufall', 'viel'], ['wueste', 'stunt', 'daemmerung', 'winter', 'zufall', 'aus'],
    ['fantasie', '', 'tag', 'sommer', 'klar', 'wenig'], ['alpen', 'klassisch', 'tag', 'winter', 'schnee', 'wenig'], ['dino', '', 'nacht', 'zufall', 'zufall', 'viel']];
  for (const [id, welt, tz, jz, wetter, hilfe] of faelle) {
    const sim = new Simulation({ einstellungen: { streckeId: id, welt, runden: 2, gegner: 2, tageszeit: tz, jahreszeit: jz, wetter, windStaerke: 'zufall' },
      spieler: [{ fahrer: 'Jonas', auto: 'porsche-911', hilfe }], seed: 1234 });
    const info = sim.startInfo(), e = info.einstellungen, { st, w } = clientStrecke(e);
    const auto = C.carCatalog.waehlbare().find(a => a.id === 'porsche-911');
    const V = new C.NetzVorhersage({ strecke: st, auto, tempoKlasse: e.tempoKlasse, fahrhilfe: hilfe, umwelt: () => w.umwelt() });
    const p = st.startpositionen(info.teilnehmer.length)[0];
    V.vp.setzen(p.x, p.z, p.heading); V.vp.y = st.hoeheAn(p.x, p.z);
    const pv = new C.Vehicle(auto.fahrwerte, { tempoKlasse: e.tempoKlasse });
    let maxNormal = 0, maxStart = 0, sonder = 0, idx = -1, schritte = 0, gleich = 0;
    for (let n = 1; n <= 60 * 45; n++) {
      const ich0 = sim.ich(0);
      C.Netz.fahrzeugSchreiben(pv, ich0.v);
      const a = autopilot(st, pv, idx); idx = a.idx;
      const s = C.Netz.eingabeDekodieren(C.Netz.eingabeKodieren(a.s));
      const cd = sim.sim.rennen.zustand === 'countdown', ziel = sim.sim.rennen.teilnehmer[0].imZiel;
      sim.eingabeSetzen(0, s); sim.schritt();
      V.schritt(n, s, { countdown: cd, imZiel: ziel });
      if (n % 3 === 0) {
        const ich = sim.ich(0); ich.ack = n;
        const d = Math.hypot(V.vp.x - ich.v[0], V.vp.z - ich.v[1]);
        if (ich.so || V.sonder) sonder++;
        else if (n < 60 * 6) maxStart = Math.max(maxStart, d);     // Start-Boost: Faktor kommt erst mit dem nächsten Zustand
        else { maxNormal = Math.max(maxNormal, d); schritte++; if (d < 1e-3) gleich++; }
        V.abgleich(ich, null);
      }
    }
    const t = sim.sim.rennen.teilnehmer[0];
    // Hindernisse (Pylonen, Wracks), Bälle/Dinos/Strohballen rechnet nur der Server → dort darf es kurz abweichen
    const anteil = gleich / Math.max(1, schritte);
    pruefe(`A ${id}/${welt || 'Standard'}/${tz}/${e.wetter}${e.windStaerke ? ' Wind ' + e.windStaerke : ''}: Vorhersage = Server (≥ 95 % der Vergleiche < 1 mm, max < 3 m, Start < 5 cm)`,
      anteil >= 0.95 && maxNormal < 3 && maxStart < 0.05 && schritte > 100,
      `${(anteil * 100).toFixed(1)} % gleich, max ${maxNormal.toFixed(3)} m, Start ${maxStart.toFixed(3)} m, ${schritte} Vergleiche, ${sonder} Sonderzustand (Looping/Rampe), Fortschritt ${t.fortschritt.toFixed(0)} m`);
  }
}

// ------------------------------------------------------------------ B) Geister / Stufe 2
{
  const abstand = (kollisionen) => {
    const sim = new Simulation({ einstellungen: { streckeId: 'wiese', gegner: 0, kollisionen }, spieler: [{ fahrer: 'Jonas', auto: 'passat' }, { fahrer: 'Emmy', auto: 'passat' }], seed: 5 });
    const f = sim.sim.fahrzeuge, p = sim.sim.strecke.startpositionen(2)[0];
    for (let k = 0; k < 60 * 4; k++) sim.schritt();          // Countdown vorbei
    f[0].vehicle.setzen(p.x, p.z, p.heading); f[1].vehicle.setzen(p.x + 0.3, p.z, p.heading);
    for (let k = 0; k < 5; k++) sim.schritt();
    return Math.hypot(f[0].vehicle.x - f[1].vehicle.x, f[0].vehicle.z - f[1].vehicle.z);
  };
  const g = abstand(false), k = abstand(true);
  pruefe('B Geister: zwei Spielerautos übereinander werden nicht auseinandergeschoben (Stufe 1)', g < 0.35, g.toFixed(2) + ' m');
  pruefe('B Stufe 2 vorbereitet: Raum-Schalter kollisionen: true trennt sie (Auto↔Auto an)', k > 1.5, k.toFixed(2) + ' m');
}


// ------------------------------------------------------------------ K) Rempeln online (W5 Stufe 2): Vorhersage mit Stellvertretern
//   Server mit kollisionen: true, zwei Menschen (ich = Spieler 2). Die Server-Zustände kommen mit 100 ms Verzug beim
//   Client an (wie bei ~100 ms Ping): Vorhersage mit Stellvertretern der anderen Autos gegen Vorhersage ohne sie.
{
  // Server übernimmt kollisionen nur als echtes bool (Host-Nachricht 'einstellungen' läuft durch einstellungenPruefen)
  {
    const w = (x) => einstellungenPruefen({ kollisionen: x }, 2).kollisionen;
    pruefe('K Server: kollisionen nur true → an; Standard/„true“/1/null → Geister (bool-Prüfung)', w(true) === true && w(false) === false && w() === false && w('true') === false && w(1) === false && w(null) === false,
      [w(true), w(false), w(), w('true'), w(1), w(null)].join(' '));
  }
  const VERZUG = 6;                 // Zustände (und ack) kommen 6 Schritte = 100 ms zu spät an
  const ich_ = 1;
  function lauf(szenario, kollisionen) {
    const sim = new Simulation({ einstellungen: { streckeId: 'wiese', gegner: 0, kollisionen: true, runden: 3 },
      spieler: [{ fahrer: 'Jonas', auto: 'passat', hilfe: 'aus' }, { fahrer: 'Emmy', auto: 'porsche-911', hilfe: 'aus' }], seed: 77 });
    const info = sim.startInfo(), e = info.einstellungen, { st, w } = clientStrecke(e);
    const katalog = C.carCatalog.waehlbare(), auto = katalog.find(a => a.id === 'porsche-911');
    const andereAuto = katalog.find(a => a.id === 'passat');
    const neu = (opt) => new C.NetzVorhersage(Object.assign({ strecke: st, auto, tempoKlasse: e.tempoKlasse, fahrhilfe: 'aus', umwelt: () => w.umwelt() }, opt || {}));
    const vMit = neu({ kollisionen, andere: [{ nr: 0, auto: andereAuto }] });
    const vOhne = neu();                              // wie v11 (ohne Stellvertreter)
    const vAus = neu({ kollisionen: false, andere: [{ nr: 0, auto: andereAuto }] });   // kollisionen aus, aber Daten übergeben → muss = v11 sein
    const vV12 = neu({ kollisionen, andere: [{ nr: 0, auto: andereAuto }], gierrate: false });   // v12: Stellvertreter geradeaus (nur für den Test abschaltbar)
    const alle = [vMit, vOhne, vAus, vV12];
    const p = st.startpositionen(2);
    for (let k = 0; k < 60 * 4; k++) sim.schritt();   // Countdown vorbei (Server-Takt n läuft ab 1; Eingaben folgen)
    const f = sim.sim.fahrzeuge;
    // Ausgangslage auf der Startgeraden: Szenario 'hinten' = ich komme schneller von hinten, 'seitlich' = ich lenke in ein gleich schnelles Auto
    const a = f[0].vehicle, b = f[1].vehicle, h = p[0].heading;
    a.setzen(p[0].x, p[0].z, h); b.setzen(p[0].x, p[0].z, h);
    let r = a.richtung(), q = a.rechts();
    let kurveInfo = null, idxA = -1, idxB = -1;
    const kurve = szenario.startsWith('kurve');
    if (kurve) {
      // Stelle mit der stärksten Richtungsänderung (je 40 m) suchen; beide Autos fahren dort mit dem Autopiloten, ich lenke ggf. ins andere
      let bestS = 0, best = 0;
      for (let s0 = 0; s0 < st.spline.laenge; s0 += 10) {
        const d = Math.abs(C.Vehicle.winkelDiff(C.headingAus(st.spline.punktBei(s0 + 40).tx, st.spline.punktBei(s0 + 40).tz), C.headingAus(st.spline.punktBei(s0).tx, st.spline.punktBei(s0).tz)));
        if (d > best) { best = d; bestS = s0; }
      }
      const pa = st.spline.punktBei(bestS + 10), tr = (pp) => C.headingAus(pp.tx, pp.tz);
      a.setzen(pa.x, pa.z, tr(pa)); a.y = st.hoeheAn(a.x, a.z);
      const ra = a.richtung(), qa = a.rechts();
      if (szenario === 'kurve-seitlich') { b.setzen(pa.x + qa.x * 2.6, pa.z + qa.z * 2.6, tr(pa)); }
      else { b.setzen(pa.x - ra.x * 16, pa.z - ra.z * 16, tr(pa)); }
      b.y = st.hoeheAn(b.x, b.z);
      a.vLaengs = szenario === 'kurve-seitlich' ? 22 : 12; b.vLaengs = szenario === 'kurve-seitlich' ? 22 : 30;
      kurveInfo = { drehung: best, s: bestS };
    } else if (szenario === 'hinten') { b.x = a.x - r.x * 30; b.z = a.z - r.z * 30; a.vLaengs = 12; b.vLaengs = 28; }
    else { b.x = a.x + q.x * 2.6; b.z = a.z + q.z * 2.6; a.vLaengs = 25; b.vLaengs = 25; }
    for (const V of alle) {
      const pv = V.vp; C.Netz.fahrzeugSchreiben(pv, sim.ich(ich_).v);
    }
    const n0 = 60 * 4;                               // Server-Tick/Folge-Nr zählen ab hier gleich
    const snaps = new Map();
    const stat = alle.map(() => ({ summe: 0, max: 0, n: 0 }));
    let stoesse = 0, letzterStoss = -1e9;
    const d2 = (V, ich) => Math.hypot(V.vp.x - ich.v[0], V.vp.z - ich.v[1]);
    // Ausgangszustand "bekannt": erster Abgleich mit Snapshot des aktuellen Ticks
    const snap = (n) => { const ich = sim.ich(ich_); ich.ack = n; const a = sim.zustand().a; snaps.set(n, { k: n, ich, a, json: JSON.stringify(a) }); };
    let rueckfluss = 0;
    // Folge-Nr n ↔ Server-Tick n0 + n; die Vorhersage zählt n ab 1
    snap(0);
    for (const V of alle) V.abgleich(snaps.get(0).ich, null, snaps.get(0).a, 0);
    for (let n = 1; n <= 60 * 6; n++) {
      let s = szenario === 'hinten' ? { gas: 1, bremse: 0, lenkung: 0 } : { gas: 1, bremse: 0, lenkung: n < 30 ? -0.25 : 0 };
      let sa = szenario === 'hinten' ? { gas: 0.4, bremse: 0, lenkung: 0 } : { gas: 1, bremse: 0, lenkung: 0 };
      if (kurve) {
        const ap = autopilot(st, a, idxA); idxA = ap.idx; sa = ap.s;
        const bp = autopilot(st, b, idxB); idxB = bp.idx; s = bp.s;
        if (szenario === 'kurve-hinten') { s = { gas: 1, bremse: 0, lenkung: s.lenkung }; sa = { gas: 0, bremse: 0, lenkung: sa.lenkung }; }
        if (szenario === 'kurve-hinten' ? false : (n >= 10 && n < 50)) {                 // ich lenke zum anderen Auto hin (wie der Autopilot, nur mit dessen Position als Ziel)
          const dx = a.x - b.x, dz = a.z - b.z, diff = C.Vehicle.winkelDiff(C.headingAus(dx, dz), b.heading), vl = Math.max(3, b.vLaengs);
          s = { gas: 1, bremse: 0, lenkung: Math.max(-1, Math.min(1, -(2 * vl * Math.sin(diff) / Math.max(1, Math.hypot(dx, dz))) / b.drehrateMax(vl))) };
        }
      }
      const dek = C.Netz.eingabeDekodieren(C.Netz.eingabeKodieren(s));
      sim.eingabeSetzen(1, dek); sim.eingabeSetzen(0, C.Netz.eingabeDekodieren(C.Netz.eingabeKodieren(sa))); sim.schritt();
      if (sim.sim.stoesse.length) { stoesse++; letzterStoss = n; }
      for (const V of alle) V.schritt(n, dek, { countdown: false, imZiel: false });
      if (n % 3 === 0) snap(n);
      const alt = snaps.get(n - VERZUG);            // erst jetzt „angekommen“
      const ich = sim.ich(ich_);
      if (n - letzterStoss < 90 && n > 5 || stoesse > 0) {
        alle.forEach((V, i) => { const d = d2(V, ich); stat[i].summe += d; stat[i].max = Math.max(stat[i].max, d); stat[i].n++; });
      }
      if (alt) {
        for (const V of alle) V.abgleich(alt.ich, null, alt.a, alt.k);
        if (JSON.stringify(alt.a) !== alt.json) rueckfluss++;       // Stellvertreter dürfen die Zustandsreihen (= Anzeige der anderen) nie verändern
      }
      snaps.delete(n - VERZUG - 3);
    }
    // Vorhersage ohne kollisionen muss exakt v11 sein (gleiche Pose wie die Vorhersage ohne Daten)
    const gleich = vOhne.vp.x === vAus.vp.x && vOhne.vp.z === vAus.vp.z && vOhne.vp.heading === vAus.vp.heading && vOhne.vp.vLaengs === vAus.vp.vLaengs;
    return { stoesse, mit: stat[0], ohne: stat[1], aus: stat[2], v12: stat[3], kurveInfo, gleich, rueckfluss, V: vMit };
  }
  // v13: Kurven-Szenarien (stärkste Kurve der Wiese, beide Autos mit Autopilot, Zustände 100 ms verzögert): Stellvertreter folgen der Kurve
  //   (Gierrate aus zwei Server-Zuständen) gegen v12 (geradeaus, Gierrate per Test-Option gierrate:false aus) gegen ganz ohne Stellvertreter.
  for (const sz of ['kurve-seitlich', 'kurve-hinten']) {
    const o = lauf(sz, true), m = o.mit, v12 = o.v12, oh = o.ohne;
    const f = (x) => `Ø ${(x.summe / Math.max(1, x.n)).toFixed(3)} m / max ${x.max.toFixed(2)} m`;
    pruefe(`K Kurve (${sz}): Server stößt (≥ 3 Stöße), Stellvertreter mit Gierrate deutlich besser als v12 (geradeaus)`,
      o.stoesse >= 3 && v12.max > 0.03 && m.max < 0.6 * v12.max && m.summe < 0.8 * v12.summe && m.max < 0.5 * oh.max,
      `${o.stoesse} Stöße; neu ${f(m)}, v12 ${f(v12)}, ohne ${f(oh)}; Kurve ${o.kurveInfo.drehung.toFixed(2)} rad/40 m`);
    pruefe(`K Kurve (${sz}): mit kollisionen: false bitgleich zu v11, Stoß fließt nicht in die Server-Zustände zurück`, o.gleich && o.rueckfluss === 0 && o.V.stat.mitGier > 0, `${o.rueckfluss} Änderungen, ${o.V.stat.mitGier} Abgleiche mit Gierrate`);
  }
  {
    // Gültigkeit der Gierrate (Einheit): Abstand, Reset, Flug/Looping, Begrenzung, kein vorheriger Zustand
    const katalog = C.carCatalog.waehlbare(), au = katalog.find(a => a.id === 'passat');
    const V = new C.NetzVorhersage({ strecke: null, auto: au, tempoKlasse: 'normal', fahrhilfe: 'aus', kollisionen: true, andere: [{ nr: 0, auto: au }] });
    const Z = (h, extra) => [[0, 0, 0, h, 20, 0, 0, 0, 0, 0, 0, 0, 0, 0, extra && extra.loop]];
    const g = (a0, k0, a1, k1) => { V._vorher = null; if (a0) V._gierSetzen(a0, k0); V._gierSetzen(a1, k1); return V.stellvertreter[0].gier; };
    const dt = 1 / 60, r1 = g(Z(0), 100, Z(0.1), 103), r2 = g(Z(0), 100, Z(0.1), 120), r3 = g(Z(3.1), 100, Z(-3.1), 103);
    const a1 = Z(0.1); a1[0][13] = 1;
    const a2 = Z(0.1); a2[0][6] = 32;
    const r4 = g(Z(0), 100, a1, 103), r5 = g(Z(0), 100, a2, 103), r6 = g(Z(0), 100, Z(0.1, { loop: [1, 0, 0] }), 103), r7 = g(null, 0, Z(0.1), 103), r8 = g(Z(0), 100, Z(2), 103);
    pruefe('K Gierrate: 0,1 rad in 3 Ticks = 2 rad/s; Winkelsprung ±π richtig; Lücke > 0,25 s / Reset / Flug / Looping / kein Vorgänger → 0; Begrenzung',
      Math.abs(r1 - 0.1 / (3 * dt)) < 1e-9 && r2 === 0 && Math.abs(r3 - (R_(-3.1, 3.1)) / (3 * dt)) < 1e-9 && r4 === 0 && r5 === 0 && r6 === 0 && r7 === 0 && r8 === 3.5,
      [r1, r2, r3, r4, r5, r6, r7, r8].map(x => x.toFixed(2)).join(' '));
    function R_(h1, h0) { return C.Vehicle.winkelDiff(h1, h0); }
  }
  for (const sz of ['hinten', 'seitlich']) {
    const o = lauf(sz, true);
    const m = o.mit, oh = o.ohne;
    pruefe(`K Rempeln (${sz}): Server stößt (≥ 3 Stöße), Vorhersage mit Stellvertretern deutlich näher am Server als ohne`,
      o.stoesse >= 3 && oh.max > 0.1 && m.summe < 0.5 * oh.summe && m.max < 0.5 * oh.max,
      `${o.stoesse} Stöße; Fehler mit Ø ${(m.summe / Math.max(1, m.n)).toFixed(3)} m / max ${m.max.toFixed(2)} m, ohne Ø ${(oh.summe / Math.max(1, oh.n)).toFixed(3)} m / max ${oh.max.toFixed(2)} m, Stöße in der Vorhersage ${o.V.stat.stoesse}`);
    pruefe(`K Rempeln (${sz}): Gierrate macht die gerade Strecke nicht schlechter als v12`, o.mit.max <= o.v12.max + 0.01 && o.mit.summe <= o.v12.summe * 1.05 + 0.01,
      `neu max ${o.mit.max.toFixed(3)} / Σ ${o.mit.summe.toFixed(2)}, v12 max ${o.v12.max.toFixed(3)} / Σ ${o.v12.summe.toFixed(2)}`);
    pruefe(`K Rempeln (${sz}): mit kollisionen: false ist die Vorhersage bitgleich zu v11 (trotz übergebener Daten)`, o.gleich);
    pruefe(`K Rempeln (${sz}): Stoß der Stellvertreter fließt nicht in die Server-Zustände (= Anzeige der anderen Autos) zurück`, o.rueckfluss === 0 && o.V.stat.stoesse > 0, `${o.rueckfluss} Änderungen`);
  }
}

(async () => {
  const srv = await starten({ port: 0, host: '127.0.0.1', leise: true, tempo: 6, ladenMaxMs: 5000 });
  const port = srv.port;

  // ---------------------------------------------------------------- C) HTTP
  const hole = (pfad, methode) => new Promise((ok) => {
    const req = http.request({ host: '127.0.0.1', port, path: pfad, method: methode || 'GET' }, (r) => {
      let n = 0; r.on('data', (d) => { n += d.length; }); r.on('end', () => ok({ code: r.statusCode, typ: r.headers['content-type'], n }));
    });
    req.on('error', () => ok({ code: 0 }));
    req.end();
  });
  {
    const a = await hole('/');
    pruefe('C „/“ liefert Autorennen.html (text/html)', a.code === 200 && /text\/html/.test(a.typ) && a.n > 500, a.code + ' ' + a.typ);
    const b = await hole('/src/main.js'), c = await hole('/vendor/three.min.js'), d = await hole('/src/ui/styles.css');
    pruefe('C src/ und vendor/ mit passendem MIME-Typ', b.code === 200 && /javascript/.test(b.typ) && c.code === 200 && d.code === 200 && /text\/css/.test(d.typ), [b.typ, d.typ].join(', '));
    const boese = ['/../server/server.js', '/%2e%2e/server/server.js', '/src/../server/server.js', '/src%2f..%2fserver%2fserver.js', '/server/server.js',
      '/tests/lade.js', '/ERWEITERN.md', '/.git/config', '/src/.versteckt', '/src/', '/src', '/vendor/', '/src\\..\\server\\server.js', '/%00', '/..%5cserver',
      '/server/node_modules/ws/package.json', '/Autorennen.html/..', '/%E0%A4%A'];
    const codes = [];
    for (const p of boese) codes.push((await hole(p)).code);
    pruefe('C Pfad-Traversal / andere Ordner / Dotfiles / Verzeichnisse abgewiesen (404, kein Listing)', codes.every(x => x === 404), codes.join(' '));
    const post = await hole('/', 'POST'), head = await hole('/src/main.js', 'HEAD');
    pruefe('C nur GET/HEAD (POST → 405, HEAD ohne Inhalt)', post.code === 405 && head.code === 200 && head.n === 0, post.code + '/' + head.code);
  }

  // ---------------------------------------------------------------- Test-Client
  class Client {
    constructor(pfad) {
      this.ws = new WebSocket('ws://127.0.0.1:' + port + (pfad || '/ws'));
      this.alle = []; this.warter = []; this.zu = false; this.zustaende = 0;
      this.offen = new Promise((ok, nein) => { this.ws.on('open', ok); this.ws.on('error', nein); this.ws.on('unexpected-response', () => nein(new Error('abgewiesen'))); });
      this.ws.on('close', () => { this.zu = true; });
      this.ws.on('message', (d) => {
        let m; try { m = JSON.parse(d); } catch (e) { return; }
        if (m.t === 'zustand') { this.zustaende++; this.letzterZustand = m; if (this.beiZustand) this.beiZustand(m); }
        else this.alle.push(m);
        this.warter = this.warter.filter(w => { if (w.t === m.t && w.f(m)) { clearTimeout(w.zeit); w.ok(m); return false; } return true; });
      });
    }
    senden(o) { if (this.ws.readyState === 1) this.ws.send(typeof o === 'string' ? o : JSON.stringify(o)); }
    /** nächste Nachricht vom Typ t (nach jetzt), optional mit Bedingung */
    auf(t, f, ms) {
      return new Promise((ok) => {
        const w = { t, f: f || (() => true), ok, zeit: setTimeout(() => { this.warter = this.warter.filter(x => x !== w); ok(null); }, ms || 3000) };
        this.warter.push(w);
      });
    }
    zuletzt(t) { for (let i = this.alle.length - 1; i >= 0; i--) if (this.alle[i].t === t) return this.alle[i]; return null; }
    schliessen() { this.ws.terminate(); }
  }

  // ---------------------------------------------------------------- D) WebSocket-Fehlerfälle
  {
    let abgewiesen = false;
    try { const x = new Client('/falsch'); await x.offen; x.schliessen(); } catch (e) { abgewiesen = true; }
    pruefe('D WebSocket nur unter /ws (anderer Pfad abgewiesen)', abgewiesen);
    const k = new Client(); await k.offen;
    k.senden('kaputt{'); const f1 = await k.auf('fehler');
    k.senden({ t: 'gibtsnicht' }); const f2 = await k.auf('fehler');
    k.senden([1, 2]); const f3 = await k.auf('fehler');
    k.senden({ t: 'start' }); const f4 = await k.auf('fehler');
    k.senden({ t: 'raumBeitreten', code: 'O0I1' }); const f5 = await k.auf('fehler');
    k.senden({ t: 'raumBeitreten', code: '<script>' }); const f6 = await k.auf('fehler');
    pruefe('D kaputtes JSON, unbekannter Typ, Array, Start ohne Raum, Code mit 0/O/1/I, HTML als Code → Fehler-Antwort',
      [f1, f2, f3, f4, f5, f6].every(Boolean) && f1.grund === 'json' && f2.grund === 'unbekannt' && f4.grund === 'keinRaum' && f5.grund === 'unbekannt',
      [f1, f2, f3, f4, f5, f6].map(f => f && f.grund).join(','));
    k.senden({ t: 'hallo' }); const h = await k.auf('hallo');
    pruefe('D Verbindung bleibt nach Fehlern nutzbar (hallo → Antwort mit Version)', !!h && h.v === R.Netz.VERSION);
    k.senden(JSON.stringify({ t: 'hallo', x: 'x'.repeat(10000) }));
    await warte(300);
    pruefe('D zu große Nachricht (> 4 KB) → Verbindung getrennt', k.zu);
    const k2 = new Client(); await k2.offen; k2.senden({ t: 'hallo' });
    pruefe('D Server läuft danach weiter (neue Verbindung ok)', !!(await k2.auf('hallo')));
    k2.schliessen();
  }

  // ---------------------------------------------------------------- E) Raum + Rennen mit 2 Clients
  const host = new Client(), gast = new Client();
  await host.offen; await gast.offen;
  host.senden({ t: 'raumErstellen', fahrer: 'Jonas', auto: 'porsche-911', hilfe: 'viel', einstellungen: { streckeId: 'wiese', welt: 'klassisch', runden: 1, gegner: 2, schwierigkeit: 'leicht' } });
  const raum = await host.auf('raum');
  const code = raum && raum.code;
  pruefe('E Raum erstellt: Code aus 4 erlaubten Zeichen (ohne 0/O/1/I)', !!code && R.Netz.codeNormal(code) === code, code);
  gast.senden({ t: 'raumBeitreten', code: 'ZZZZ' === code ? 'YYYY' : 'ZZZZ', fahrer: 'Emmy' });
  const fu = await gast.auf('fehler');
  pruefe('E falscher Code → Fehler „unbekannt“', !!fu && fu.grund === 'unbekannt');
  gast.senden({ t: 'raumBeitreten', code: code.toLowerCase(), fahrer: 'Jonas', auto: 'multivan', hilfe: 'wenig' });
  const lg = await gast.auf('lobby');
  pruefe('E Gast tritt bei (Code klein geschrieben geht), Lobby mit 2 Spielern', !!lg && lg.spieler.length === 2 && lg.code === code);
  const sp = lg ? lg.spieler : [];
  pruefe('E Fahrer eindeutig: Gast wollte „Jonas“ (schon vergeben) → bekommt einen anderen aus der Liste', sp[1] && sp[1].fahrer !== 'Jonas' &&
    R.config.fahrer.some(f => f.name === sp[1].fahrer), sp.map(s => s.fahrer).join('/'));
  pruefe('E Lobby: Host markiert und bereit, Gast nicht bereit, Auto/Fahrhilfe übernommen', sp[0] && sp[0].istHost && sp[0].bereit && !sp[1].istHost && !sp[1].bereit &&
    sp[1].auto === 'multivan' && sp[1].hilfe === 'wenig');
  gast.senden({ t: 'wahl', fahrer: 'Jonas' }); const fv = await gast.auf('fehler');
  pruefe('E Wahl eines vergebenen Fahrers → Fehler', !!fv && fv.grund === 'fahrerVergeben');
  gast.senden({ t: 'wahl', fahrer: 'Emmy', auto: 'mini-cooper' }); const lw = await gast.auf('lobby');
  gast.senden({ t: 'wahl', fahrer: 'Hacker<b>' }); const fh = await gast.auf('fehler');
  pruefe('E Wahl Fahrer/Auto ändern; Freitext-Namen abgewiesen (nur Fahrerliste)', lw && lw.spieler[1].fahrer === 'Emmy' && lw.spieler[1].auto === 'mini-cooper' && fh && fh.grund === 'ungueltig');
  gast.senden({ t: 'einstellungen', einstellungen: { runden: 9 } }); const fe = await gast.auf('fehler');
  gast.senden({ t: 'start' }); const fs = await gast.auf('fehler');
  pruefe('E Gast darf nicht einstellen/starten', fe && fe.grund === 'nurHost' && fs && fs.grund === 'nurHost');
  host.senden({ t: 'einstellungen', einstellungen: { gegner: 2, runden: 1, schaden: true, tageszeit: 'quatsch', kollisionen: false } }); const le = await host.auf('lobby');
  pruefe('E Host-Einstellungen geprüft (Schaden bleibt online aus, ungültige Tageszeit → tag)', le && le.einstellungen.schaden === false && le.einstellungen.tageszeit === 'tag' && le.einstellungen.runden === 1);
  // W5 Stufe 2: Rempeln-Schalter aus dem Menü – Host schaltet um, Gast darf nicht, Nicht-bool wird ignoriert (→ Geister)
  host.senden({ t: 'einstellungen', einstellungen: { kollisionen: true } }); const lk1 = await host.auf('lobby');
  host.senden({ t: 'einstellungen', einstellungen: { kollisionen: 'ja' } }); const lk2 = await host.auf('lobby');
  host.senden({ t: 'einstellungen', einstellungen: { kollisionen: true } }); await host.auf('lobby');
  gast.senden({ t: 'einstellungen', einstellungen: { kollisionen: false } }); const lkg = await gast.auf('fehler');
  host.senden({ t: 'einstellungen', einstellungen: { kollisionen: false } }); const lk3 = await host.auf('lobby');
  pruefe('E Rempeln-Schalter: Host an/aus, „ja“ → Geister, Gast bekommt nurHost', lk1 && lk1.einstellungen.kollisionen === true && lk2 && lk2.einstellungen.kollisionen === false &&
    lkg && lkg.grund === 'nurHost' && lk3 && lk3.einstellungen.kollisionen === false);
  host.senden({ t: 'start' }); const fb = await host.auf('fehler');
  pruefe('E Start ohne „bereit“ des Gastes → Fehler', fb && fb.grund === 'nichtBereit');
  gast.senden({ t: 'bereit', an: true }); await host.auf('lobby', (m) => m.spieler[1].bereit);
  host.senden({ t: 'start' });
  const [sh, sg] = await Promise.all([host.auf('start', null, 5000), gast.auf('start', null, 5000)]);
  pruefe('E Start an beide: eigene Nummer, 4 Teilnehmer (2 Menschen + 2 Computer), konkretes Wetter/Wind',
    sh && sg && sh.du === 0 && sg.du === 1 && sh.teilnehmer.length === 4 && sh.teilnehmer.filter(t => t.mensch).length === 2 &&
    typeof sh.einstellungen.windRichtung === 'number' && sh.einstellungen.jahreszeit !== 'zufall', sh && sh.teilnehmer.map(t => t.name + (t.mensch ? '' : '🤖')).join(','));
  // Autopilot über Eingaben: je Zustand 3 Eingaben (Server: 3 Ticks je Zustand)
  const { st } = clientStrecke(sh.einstellungen);
  const fahrer = (cl, auto) => {
    const v = new C.Vehicle(auto.fahrwerte, { tempoKlasse: sh.einstellungen.tempoKlasse });
    cl.n = 0; cl.idx = -1; cl.acks = []; cl.cps = new Set(); cl.fort = 0;
    cl.beiZustand = (z) => {
      if (!z.ich) return;
      C.Netz.fahrzeugSchreiben(v, z.ich.v);
      cl.acks.push([cl.n, z.ich.ack]);
      cl.cps.add(z.a[z.ich.nr][11]); cl.fort = z.a[z.ich.nr][12];
      cl.letzteRunde = z.a[z.ich.nr][9];
      if (cl.stumm) return;
      const a = autopilot(st, v, cl.idx); cl.idx = a.idx;
      const k = C.Netz.eingabeKodieren(a.s);
      for (let i = 0; i < 3; i++) { cl.n++; cl.senden({ t: 'eingabe', n: cl.n, g: k.g, b: k.b, l: k.l }); }
    };
  };
  const autoH = R.carCatalog.waehlbare().find(a => a.id === 'porsche-911'), autoG = R.carCatalog.waehlbare().find(a => a.id === 'mini-cooper');
  fahrer(host, autoH); fahrer(gast, autoG);
  const zielH = host.auf('ereignis', (m) => m.art === 'ziel' && m.nr === 0, 60000);
  const ergH = host.auf('ergebnis', null, 70000);
  host.senden({ t: 'geladen' }); gast.senden({ t: 'geladen' });
  const t0 = Date.now(), z0 = host.zustaende;
  await warte(10000 / 6 * 1.0);                       // ≈ 10 s Spielzeit (Zeitraffer ×6)
  const zr = (host.zustaende - z0) / ((Date.now() - t0) / 1000) / 6;
  const lz = host.letzterZustand;
  pruefe('E Zustände ≈ 20 je Sekunde Spielzeit, mit allen 4 Autos', zr > 15 && zr < 25 && lz && lz.a.length === 4, zr.toFixed(1) + ' Hz');
  const acks = host.acks.slice(-20), ackOk = acks.every(([n, a]) => a <= n && a >= n - 30) && host.acks.length > 50;
  const mono = host.acks.every((x, i, l) => i === 0 || x[1] >= l[i - 1][1]);
  pruefe('E Folge-Nr bestätigt (ack steigt, höchstens 30 Eingaben hinter dem Gesendeten)', ackOk && mono, 'letzte ' + JSON.stringify(acks.slice(-3)));
  pruefe('E Checkpoint-Fortschritt beider Spieler (Checkpoints passiert, Fortschritt > 30 m hinter der Startlinie in 10 s inkl. Countdown)', host.cps.size >= 2 && gast.cps.size >= 2 && host.fort > 30 && gast.fort > 30,
    host.cps.size + '/' + gast.cps.size + ' Checkpoints, ' + host.fort.toFixed(0) + '/' + gast.fort.toFixed(0) + ' m');
  // F) Gast trennt mitten im Rennen
  gast.schliessen();
  const weg = await host.auf('ereignis', (m) => m.art === 'weg', 3000);
  await warte(300);
  const nachher = host.letzterZustand;
  pruefe('F Gast trennt → Host bekommt „weg“, sein Auto fährt als Computer weiter (kein Mensch mehr)', !!weg && weg.nr === 1 && !(nachher.a[1][6] & 128) && srv.raeume.size === 1);
  const tAlt = nachher.a[1][12];
  await warte(800);
  pruefe('F Server läuft weiter, Gast-Auto bewegt sich (Computer)', host.letzterZustand.k > nachher.k && host.letzterZustand.a[1][12] > tAlt,
    (host.letzterZustand.a[1][12] - tAlt).toFixed(0) + ' m');
  const ziel = await zielH;
  pruefe('E Runde gezählt: Host fährt per Autopilot 1 Runde → Ereignis „ziel“, Runde 1', !!ziel && host.letzteRunde === 1, ziel ? 'Zeit ' + ziel.zeit.toFixed(1) + ' s' : 'kein Ziel');
  const erg = await ergH;
  pruefe('E Ergebnis kommt (alle Menschen im Ziel), Zeilen mit Platz/Name/Auto', !!erg && erg.zeilen.length === 4 && erg.zeilen.some(z => z.weg),
    erg ? erg.zeilen.map(z => z.platz + '.' + z.name + (z.weg ? '(weg)' : '')).join(' ') : '');
  host.stumm = true;
  host.senden({ t: 'zurLobby' });
  const lz2 = await host.auf('lobby');
  pruefe('E Host: zurück in die Lobby (Raum bleibt)', !!lz2 && lz2.zustand === 'lobby' && lz2.spieler.length === 1);

  // ---------------------------------------------------------------- G) Host trennt, max. 6
  {
    const gs = [];
    for (let i = 0; i < 6; i++) { const g = new Client(); await g.offen; gs.push(g); }
    gs.forEach((g, i) => g.senden({ t: 'raumBeitreten', code, fahrer: R.config.fahrer[i].name }));
    const antworten = await Promise.all(gs.map(g => Promise.race([g.auf('raum'), g.auf('fehler')])));
    const voll = antworten.filter(a => a && a.t === 'fehler' && a.grund === 'voll').length, drin = antworten.filter(a => a && a.t === 'raum').length;
    pruefe('G max. 6 Spieler: Host + 5 Gäste, der 6. Gast bekommt „voll“', drin === 5 && voll === 1, drin + ' drin, ' + voll + ' voll');
    const zu = Promise.all(gs.filter((g, i) => antworten[i] && antworten[i].t === 'raum').map(g => g.auf('raumZu', null, 3000)));
    host.schliessen();
    const zus = await zu;
    await warte(200);
    pruefe('G Host trennt → alle Gäste bekommen raumZu, Raum ist weg', zus.every(z => z && z.grund === 'host') && srv.raeume.size === 0, zus.length + ' Gäste');
    gs[0].senden({ t: 'raumBeitreten', code, fahrer: 'Emmy' }); const f = await gs[0].auf('fehler');
    pruefe('G alter Code danach ungültig', !!f && f.grund === 'unbekannt');
    gs.forEach(g => g.schliessen());
  }

  // ---------------------------------------------------------------- H) Latenz (localhost)
  {
    const p = new Client(); await p.offen;
    const rtts = [];
    for (let i = 0; i < 40; i++) {
      const t = process.hrtime.bigint();
      p.senden({ t: 'ping', z: 1 });
      await p.auf('pong');
      rtts.push(Number(process.hrtime.bigint() - t) / 1e6);
    }
    rtts.sort((a, b) => a - b);
    const mittel = rtts.reduce((a, b) => a + b, 0) / rtts.length;
    pruefe('H Ping localhost (Mittel/Median/Max) < 20 ms', mittel < 20, `${mittel.toFixed(2)} / ${rtts[20].toFixed(2)} / ${rtts[rtts.length - 1].toFixed(2)} ms`);
    p.schliessen();
  }

  await srv.schliessen();

  // ---------------------------------------------------------------- J) Echtzeit + Netz-Zittern: Vorhersage/Neuabgleich wie im Browser
  // Server in Echtzeit, ein Client fährt 15 s mit R.NetzVorhersage (60 Hz Eingaben über eine Uhr wie online.js), alle Nachrichten in
  // beide Richtungen 20–80 ms verzögert (zufällig, Reihenfolge bleibt wie bei TCP) → Korrekturen zählen.
  {
    const s3 = await starten({ port: 0, host: '127.0.0.1', leise: true });
    const ws = new WebSocket('ws://127.0.0.1:' + s3.port + '/ws');
    await new Promise((ok) => ws.on('open', ok));
    let zufall = 12345;
    const rnd = () => { zufall = (zufall * 1103515245 + 12345) & 0x7fffffff; return zufall / 0x7fffffff; };
    let ausZeit = 0, einZeit = 0;
    const raus = (o) => { const t = Math.max(ausZeit, Date.now() + 20 + rnd() * 60); ausZeit = t; setTimeout(() => ws.readyState === 1 && ws.send(JSON.stringify(o)), t - Date.now()); };
    const handler = {};
    ws.on('message', (d) => { const m = JSON.parse(d); const t = Math.max(einZeit, Date.now() + 20 + rnd() * 60); einZeit = t; setTimeout(() => handler[m.t] && handler[m.t](m), t - Date.now()); });
    const start = await new Promise((ok) => {
      handler.lobby = () => raus({ t: 'start' });
      handler.start = ok;
      raus({ t: 'raumErstellen', fahrer: 'Jonas', auto: 'bmw-m4', hilfe: 'wenig', einstellungen: { streckeId: 'wald', welt: 'klassisch', runden: 2, gegner: 3 } });
    });
    handler.lobby = null;
    const e = start.einstellungen, { st, w } = clientStrecke(e);
    const auto = C.carCatalog.waehlbare().find(a => a.id === 'bmw-m4');
    const V = new C.NetzVorhersage({ strecke: st, auto, tempoKlasse: e.tempoKlasse, fahrhilfe: 'wenig', umwelt: () => w.umwelt() });
    const p0 = st.startpositionen(start.teilnehmer.length)[0];
    V.vp.setzen(p0.x, p0.z, p0.heading); V.vp.y = st.hoeheAn(p0.x, p0.z);
    let rz = 'countdown', imZiel = false, n = 0, idx = -1, fort = 0;
    const anzeige = () => ({ x: V.vp.x + V.korr.x, z: V.vp.z + V.korr.z, y: V.vp.y + V.korr.y, heading: V.vp.heading + V.korr.h });
    handler.zustand = (z) => { rz = z.rz; if (z.ich) { V.abgleich(z.ich, anzeige()); fort = z.a[z.ich.nr][12]; imZiel = !!(z.a[z.ich.nr][6] & 16); } };
    raus({ t: 'geladen' });
    const t0 = Date.now() / 1000;
    await new Promise((fertig) => {
      const iv = setInterval(() => {
        const soll = Math.floor((Date.now() / 1000 - t0) / DT);
        while (n < soll) {
          const a = autopilot(st, V.vp, idx); idx = a.idx;
          const k = C.Netz.eingabeKodieren(a.s), s = C.Netz.eingabeDekodieren(k);
          n++;
          raus({ t: 'eingabe', n, g: k.g, b: k.b, l: k.l });
          V.schritt(n, s, { countdown: rz === 'countdown', imZiel });
          V.abklingen(DT);
        }
        if (Date.now() / 1000 - t0 > 15) { clearInterval(iv); fertig(); }
      }, 8);
    });
    ws.terminate();
    await s3.schliessen();
    const S = V.stat, mittel = S.summeFehler / Math.max(1, S.abgleiche);
    pruefe('J Echtzeit mit 20–80 ms Zittern: Vorhersage hält (≤ 2 harte Korrekturen, mittlere Abweichung < 0,3 m, Auto fährt)', S.hart <= 2 && mittel < 0.3 && fort > 150,
      `${S.abgleiche} Abgleiche, ${S.weich} weich, ${S.hart} hart, max ${S.maxFehler.toFixed(2)} m, Mittel ${mittel.toFixed(3)} m, ${fort.toFixed(0)} m gefahren`);
  }

  // ---------------------------------------------------------------- I) öffentliche Adresse für Link/QR (Startskript --oeffentlich)
  for (const [wert, soll] of [['https://mac-mini.tail39c1c2.ts.net:8443', 'https://mac-mini.tail39c1c2.ts.net:8443/'], ['javascript:alert(1)', undefined],
    ['https://x.ts.net/../../etc', undefined]]) {
    const s2 = await starten({ port: 0, host: '127.0.0.1', leise: true, oeffentlich: wert });
    const ws = new WebSocket('ws://127.0.0.1:' + s2.port + '/ws');
    const lobby = await new Promise((ok) => {
      ws.on('open', () => ws.send(JSON.stringify({ t: 'raumErstellen', fahrer: 'Jonas' })));
      ws.on('message', (d) => { const m = JSON.parse(d); if (m.t === 'lobby') ok(m); });
      setTimeout(() => ok(null), 3000);
    });
    ws.terminate();
    await s2.schliessen();
    pruefe('I öffentliche Adresse ' + wert + ' → Lobby ' + (soll ? 'meldet ' + soll : 'ohne Adresse (abgewiesen)'), !!lobby && lobby.oeffentlich === soll, lobby && lobby.oeffentlich);
  }

  console.log(`\n${ok} OK, ${fehler} FEHL`);
  console.log(fehler ? 'FEHLER' : 'ALLE NETZ-TESTS OK');
  process.exit(fehler ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
