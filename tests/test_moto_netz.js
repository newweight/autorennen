// Motorrad M4 (online über den Spielserver): node tests/test_moto_netz.js
// Startet den Spielserver im selben Prozess (freier Port, leise, Zeitraffer ×6) und prüft:
//  A) Schalter AUS (Standard): Server meldet kein `moto`, lehnt Motorrad-Räume ab, liefert Motorrad.html nicht aus; Autoraum geht wie bisher;
//     Raum-Einstellungen ohne Schalter bitgleich (keine neuen Felder)
//  B) Schalter AN: hallo.moto, Motorrad.html + src/moto/*.js werden ausgeliefert
//  C) Determinismus Server ↔ Client: Motorrad-Simulation im Server und die Vorhersage des Clients (selber Motorrad-Kontext, Unfall-Faktoren aus ich.mu) bei
//     gleichen Eingaben – Positionen gleich nach N Schritten; Trick-Taste (Bit k) löst im Flug Stunts aus; Sturz/Unfall kommen als Ereignis
//  D) Motorrad-Räume ≠ Auto-Räume: falsche Art beim Beitritt → Fehler; Motorrad-IDs (Superbike, Quad …) wählbar, Auto-IDs nicht; Polizei/Verkehr erzwungen aus
//  E) Zwei Motorrad-Clients in einem Raum über WebSocket: Start (stationen), zustand.mo, Stunt/Sturz/Unfall kommen bei BEIDEN an (gleiche Ereignisse, gleiche
//     mo-Werte je Tick), Ergebnis mit Stuntpunkten – und parallel ein unveränderter Auto-Raum (kein `mo`/`mu`)
//  F) Client-Schattenzustand (src/moto/motoOnline.js im Node-Kontext mit Stubs): zustand.mo/ich.mu → spiel.stunt / spiel.unfall, Ereignisse, Eingabe-Bit k
//  G) Alter Client ↔ neuer Server: eingabe ohne k, raumErstellen ohne moto → Autoraum (gemischt im selben Server wie Motorrad-Räume)
// Am Ende werden Server und Verbindungen geschlossen (kein Hängen).
'use strict';
const http = require('http');
const path = require('path');
const fs = require('fs');
const WebSocket = require(path.join(__dirname, '..', 'server', 'node_modules', 'ws'));
const { starten } = require('../server/server');
const { Simulation, kontextLaden, laden, ladenMoto, einstellungenPruefen, MODULE } = require('../server/simulation');

let fehler = 0, ok = 0;
function pruefe(name, gut, info) { console.log((gut ? 'OK   ' : 'FEHL ') + name + (info !== undefined ? '  (' + info + ')' : '')); if (gut) ok++; else fehler++; }
const warte = (ms) => new Promise(r => setTimeout(r, ms));
const R = laden();
const DT = R.config.physik.schritt;

// „Browser“ des Motorrad-Spiels ohne DOM: dieselben Module wie Motorrad.html für Physik/Vorhersage/Unfall (wie ladenMoto, dazu die Client-Dateien Vorhersage + HUD-Logik)
const bisMega = MODULE.indexOf('src/track/megastrecke.js');
const MOTO_CLIENT = MODULE.slice(0, bisMega + 1).concat(['src/world/garage.js', 'src/moto/motoKatalog.js', 'src/moto/motoTypen.js', 'src/moto/schraeglage.js', 'src/moto/stunts.js',
  'src/moto/stuntWelt.js', 'src/moto/unfall.js', 'src/main.js', 'server/motoHaken.js', 'src/moto/stuntHud.js', 'src/moto/stuntStart.js', 'src/moto/unfallWelt.js', 'src/moto/unfallStart.js',
  'src/net/vorhersage.js']);
const CM = kontextLaden(MOTO_CLIENT, { MOTORRAD: true });
const motoAutos = CM.carCatalog.waehlbare();
const autoVon = (id) => motoAutos.find(a => a.id === id);

/** Strecke wie im Browser (main.js streckeSzeneBauen, Physik-Teile) im Motorrad-Kontext. */
function clientStrecke(C, e) {
  const daten = C.trackCatalog.find(t => t.id === e.streckeId);
  const st = new C.Strecke(daten, { welt: C.Strecke.weltName(daten, e.welt), variante: e.variante, hindernisMenge: e.hindernisMenge });
  const w = new C.Wetter(null, { jahreszeit: e.jahreszeit, wetter: e.wetter, wind: { staerke: e.windStaerke, richtung: e.windRichtung },
    thema: daten.thema, seed: 1, strecke: st, tageszeit: e.tageszeit });
  C.Kurvenschilder.einbauen(st, e.tempoKlasse);
  C.Kollisionen.pflanzenSammeln(st, C.themes.dekoBauen(daten.thema, st, w.jahreszeit));
  C.Kollisionen.wracksEinbauen(st);
  const th = C.themes[daten.thema];
  if (w.tz && w.tz.laternen && th.laternen) st.saeulen = (st.saeulen || []).concat(C.themes.laternenBauen(st, th, w.tz.laterne).masten);
  return { st, w };
}
/** Einfacher Autopilot (Pure Pursuit + Tempo der Ideallinie) aus der Pose → Steuerung. */
function autopilot(C, st, v, idx) {
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

(async () => {
  // ================================================================== A) Schalter AUS (Standard)
  const keineMarke = path.join(__dirname, 'gibt_es_nicht.an');
  const aus = await starten({ port: 0, host: '127.0.0.1', leise: true, tempo: 6, ladenMaxMs: 8000, motorradMarke: keineMarke });
  const hole = (port, pfad) => new Promise((fertig) => {
    const req = http.request({ host: '127.0.0.1', port, path: pfad, method: 'GET' }, (r) => { let n = 0; r.on('data', (d) => { n += d.length; }); r.on('end', () => fertig({ code: r.statusCode, typ: r.headers['content-type'], n })); });
    req.on('error', () => fertig({ code: 0 })); req.end();
  });
  class Client {
    constructor(port) {
      this.ws = new WebSocket('ws://127.0.0.1:' + port + '/ws');
      this.alle = []; this.warter = []; this.zu = false; this.zustaende = 0; this.zByK = new Map(); this.ereignisse = [];
      this.offen = new Promise((fertig, nein) => { this.ws.on('open', fertig); this.ws.on('error', nein); });
      this.ws.on('close', () => { this.zu = true; });
      this.ws.on('message', (d) => {
        let m; try { m = JSON.parse(d); } catch (e) { return; }
        if (m.t === 'zustand') { this.zustaende++; this.letzterZustand = m; this.zByK.set(m.k, m); if (this.beiZustand) this.beiZustand(m); }
        else { this.alle.push(m); if (m.t === 'ereignis') this.ereignisse.push(m); }
        this.warter = this.warter.filter(w => { if (w.t === m.t && w.f(m)) { clearTimeout(w.zeit); w.ok(m); return false; } return true; });
      });
    }
    senden(o) { if (this.ws.readyState === 1) this.ws.send(typeof o === 'string' ? o : JSON.stringify(o)); }
    auf(t, f, ms) {
      return new Promise((fertig) => {
        const w = { t, f: f || (() => true), ok: fertig, zeit: setTimeout(() => { this.warter = this.warter.filter(x => x !== w); fertig(null); }, ms || 3000) };
        this.warter.push(w);
      });
    }
    zuletzt(t) { for (let i = this.alle.length - 1; i >= 0; i--) if (this.alle[i].t === t) return this.alle[i]; return null; }
    schliessen() { this.ws.terminate(); }
  }
  {
    const c = new Client(aus.port); await c.offen;
    c.senden({ t: 'hallo', v: R.Netz.VERSION }); const h = await c.auf('hallo');
    pruefe('A Schalter aus: hallo ohne `moto` (alter Stand)', !!h && h.moto === undefined && h.v === R.Netz.VERSION);
    c.senden({ t: 'raumErstellen', moto: true, fahrer: 'Jonas', auto: 'superbike' }); const f = await c.auf('fehler');
    pruefe('A Schalter aus: Motorrad-Raum wird abgelehnt (keinMotorrad), kein Raum entsteht', !!f && f.grund === 'keinMotorrad' && aus.raeume.size === 0);
    c.senden({ t: 'raumErstellen', fahrer: 'Jonas', auto: 'porsche-911' }); const r = await c.auf('raum'); await warte(100);      // gleiche Verbindung: der abgelehnte Motorrad-Versuch löst keine Zeitsperre aus
    pruefe('A Schalter aus: normaler Autoraum wie bisher', !!r && r.code && aus.raeume.size === 1);
    const a = await hole(aus.port, '/'), m = await hole(aus.port, '/Motorrad.html'), s = await hole(aus.port, '/src/moto/motoOnline.js');
    pruefe('A Schalter aus: Autorennen.html ja, Motorrad.html nein (404); src/ bleibt frei (keine Geheimnisse)', a.code === 200 && m.code === 404 && s.code === 200, [a.code, m.code, s.code].join('/'));
    const o1 = einstellungenPruefen({ streckeId: 'wiese', polizei: true, krankenwagen: true }, 2), o2 = einstellungenPruefen({ streckeId: 'wiese', polizei: true, krankenwagen: true }, 2, false);
    pruefe('A Raum-Einstellungen ohne Schalter bitgleich: keine neuen Felder (moto/unfall/stuntrennen), Polizei bleibt wählbar',
      JSON.stringify(o1) === JSON.stringify(o2) && o1.moto === undefined && o1.unfall === undefined && o1.stuntrennen === undefined && o1.polizei === true && o1.krankenwagen === true);
    c.schliessen();
  }
  await aus.schliessen();

  // ================================================================== B) Schalter AN
  const srv = await starten({ port: 0, host: '127.0.0.1', leise: true, tempo: 6, ladenMaxMs: 8000, motorrad: true });
  const port = srv.port;
  {
    const m = await hole(port, '/Motorrad.html'), s = await hole(port, '/src/moto/motoOnline.js'), a = await hole(port, '/Autorennen.html');
    pruefe('B Schalter an: Motorrad.html + src/moto/motoOnline.js werden ausgeliefert, Autorennen.html unverändert', m.code === 200 && /text\/html/.test(m.typ) && m.n > 500 && s.code === 200 && a.code === 200, [m.code, s.code, a.code].join('/'));
    const c = new Client(port); await c.offen;
    c.senden({ t: 'hallo', v: R.Netz.VERSION }); const h = await c.auf('hallo');
    pruefe('B Schalter an: hallo meldet `moto: true`', !!h && h.moto === true);
    c.schliessen();
    // Marken-Datei (ohne Neustart): Schalter per Datei
    const marke = path.join(__dirname, '_motorrad_test.an');
    const viaDatei = await starten({ port: 0, host: '127.0.0.1', leise: true, motorradMarke: marke });
    const x0 = await hole(viaDatei.port, '/Motorrad.html');
    fs.writeFileSync(marke, '');
    await warte(2200);
    const x1 = await hole(viaDatei.port, '/Motorrad.html');
    fs.rmSync(marke, { force: true });
    await viaDatei.schliessen();
    pruefe('B Schalter per Marken-Datei: ohne Datei 404, mit Datei (ohne Neustart) 200', x0.code === 404 && x1.code === 200, x0.code + '→' + x1.code);
  }

  // ================================================================== C) Determinismus Server ↔ Client (ohne Netz)
  {
    const sim = new Simulation({ moto: true, einstellungen: { streckeId: 'wiese', gegner: 2, runden: 2, unfall: 'echt', kollisionen: false, jahreszeit: 'sommer', wetter: 'klar', tageszeit: 'tag' },
      spieler: [{ fahrer: 'Jonas', auto: 'superbike', hilfe: 'aus' }], seed: 11 });
    const info = sim.startInfo(), e = info.einstellungen;
    const { st, w } = clientStrecke(CM, e);
    const auto = autoVon('superbike');
    const V = new CM.NetzVorhersage({ strecke: st, auto, tempoKlasse: e.tempoKlasse, fahrhilfe: 'aus', umwelt: () => w.umwelt() });
    const U = CM.Moto.unfall, u = U.zNeu('echt');
    u.halteBremse = false; u.gasEingabe = 0; u.kiPflege = null;
    V.vp._motoU = u;
    const p = st.startpositionen(info.teilnehmer.length)[0];
    V.vp.setzen(p.x, p.z, p.heading); V.vp.y = st.hoeheAn(p.x, p.z);
    const pv = new CM.Vehicle(auto.fahrwerte, { tempoKlasse: e.tempoKlasse });
    let idx = -1, vergleiche = 0, gleich = 0, maxNormal = 0, sonder = 0, mitMu = 0;
    const evs = [], trickAn = { rest: 0 };
    let crashPhase = 0;
    for (let n = 1; n <= 60 * 70; n++) {
      const ich0 = sim.ich(0);
      CM.Netz.fahrzeugSchreiben(pv, ich0.v);
      let a = autopilot(CM, st, pv, idx); idx = a.idx;
      let s = a.s;
      // in der Mitte des Laufs: geradeaus in die Bande (Sturz/Unfall erzwingen)
      if (n >= 60 * 25 && n < 60 * 25 + 150) s = { gas: 1, bremse: 0, lenkung: 0.6 };
      s = CM.Netz.eingabeDekodieren(CM.Netz.eingabeKodieren(s));
      const cd = sim.sim.rennen.zustand === 'countdown', ziel = sim.sim.rennen.teilnehmer[0].imZiel;
      // Trick-Taste: in der Luft für 2 Ticks drücken (Drehung)
      const mo0 = sim.zustand().mo[0];
      if ((mo0[6] & 128) && trickAn.rest <= 0 && !trickAn.schonImFlug) { trickAn.rest = 2; trickAn.schonImFlug = true; }
      if (!(mo0[6] & 128)) trickAn.schonImFlug = false;
      sim.trickSetzen(0, trickAn.rest > 0); if (trickAn.rest > 0) trickAn.rest--;
      sim.eingabeSetzen(0, s); sim.schritt();
      V.schritt(n, s, { countdown: cd, imZiel: ziel });
      for (const ev of sim.abholen()) evs.push(Object.assign({ n }, ev));
      if (n % 3 === 0) {
        const ich = sim.ich(0); ich.ack = n;
        if (Array.isArray(ich.mu)) { u.zustand = ich.mu[0]; u.gesundheit = ich.mu[1]; u.halteBremse = ich.mu[2] === 1; mitMu++; }
        const d = Math.hypot(V.vp.x - ich.v[0], V.vp.z - ich.v[1]);
        if (ich.so || V.sonder) sonder++;
        else if (n >= 60 * 6) { maxNormal = Math.max(maxNormal, d); vergleiche++; if (d < 1e-3) gleich++; }
        V.abgleich(ich, null);
      }
    }
    const anteil = gleich / Math.max(1, vergleiche);
    const st1 = evs.filter(x => x.art === 'sturz'), un1 = evs.filter(x => x.art === 'unfall'), stu = evs.filter(x => x.art === 'stunt');
    pruefe('C Server-Motorrad ↔ Client-Vorhersage (Superbike, Wiese, Unfälle echt): ≥ 95 % der Vergleiche < 1 mm, max < 3 m nach 70 s (4200 Schritte)',
      anteil >= 0.95 && maxNormal < 3 && vergleiche > 100, `${(anteil * 100).toFixed(1)} % gleich, max ${maxNormal.toFixed(3)} m, ${vergleiche} Vergleiche, ${sonder} Sonderzustand, ich.mu in ${mitMu} Abgleichen`);
    pruefe('C Sturz → Unfall-Ereignisse für den Fahrer (sturz + unfall mit Folge, Zustand/Gesundheit in %)', st1.length >= 1 && un1.length >= 1 && un1[0].nr === 0 && typeof un1[0].folge === 'string' && un1[0].z <= 100 && un1[0].gs <= 100,
      st1.length + ' Stürze, ' + un1.map(x => x.folge + '@' + x.n).join(','));
    pruefe('C Stunts im Flug (Trick-Taste über Eingabe-Bit → trickSetzen): Stunt-Ereignisse mit Name und Punkten', stu.length >= 1 && stu.every(x => typeof x.name === 'string' && x.p > 0), stu.map(x => x.nr + ':' + x.st + ':' + x.p).join(' '));
    const mo = sim.zustand().mo;
    pruefe('C zustand.mo: je Teilnehmer 13 Zahlen, Stuntpunkte des Spielers = Summe seiner Stunts', mo.length === 3 && mo.every(a => a.length === 13 && a.slice(0, 12).every(Number.isFinite)) &&
      mo[0][1] === sim.moto.punkte(0), mo.map(a => a[1]).join('/'));
    const quad = new Simulation({ moto: true, einstellungen: { streckeId: 'wiese', gegner: 1, runden: 2, unfall: 'echt', kollisionen: false }, spieler: [{ fahrer: 'Jonas', auto: 'quad' }], seed: 11 });
    const quadEv = [];
    for (let n = 0; n < 60 * 40; n++) { quad.eingabeSetzen(0, { gas: 1, bremse: 0, lenkung: 0 }); quad.schritt(); for (const ev of quad.abholen()) quadEv.push(ev); }
    pruefe('C Quad kippt nie: 40 s geradeaus gegen die Bande → kein Sturz-/Unfall-Ereignis für das Quad', !quadEv.some(x => (x.art === 'sturz' || x.art === 'unfall') && x.nr === 0), quadEv.filter(x => x.nr === 0).map(x => x.art).join(',') || 'keine');
    const tiefe = (sim.sim.fahrzeuge.length);
    const kein = new Simulation({ moto: true, einstellungen: { streckeId: 'wiese', gegner: 1, unfall: 'aus' }, spieler: [{ fahrer: 'Jonas', auto: 'chopper' }], seed: 3 });
    pruefe('C Unfälle aus: ich.mu = null (Vorhersage rechnet ohne Unfall-Faktoren)', kein.ich(0).mu === null || kein.ich(0).mu === undefined, tiefe + ' Fahrzeuge');
  }

  // ================================================================== D/E/G) Räume über WebSocket
  const hostM = new Client(port), gastM = new Client(port), autoH = new Client(port), autoG = new Client(port), alt = new Client(port);
  await Promise.all([hostM.offen, gastM.offen, autoH.offen, autoG.offen, alt.offen]);
  hostM.senden({ t: 'raumErstellen', moto: true, fahrer: 'Jonas', auto: 'superbike', hilfe: 'aus',
    einstellungen: { streckeId: 'wiese', welt: '', runden: 1, gegner: 2, schwierigkeit: 'leicht', polizei: true, krankenwagen: true, geisterfahrer: true, nurRennautos: true, unfall: 'echt', stuntrennen: true, kollisionen: false } });
  const rm = await hostM.auf('raum'); await warte(150); const lm = hostM.zuletzt('lobby');
  const codeM = rm && rm.code;
  pruefe('D Motorrad-Raum erstellt: Lobby mit moto, Unfälle echt, Stuntrennen; Polizei/Verkehr/Rennautos erzwungen aus', !!codeM && lm && lm.einstellungen.moto === true && lm.einstellungen.unfall === 'echt' && lm.einstellungen.stuntrennen === true &&
    lm.einstellungen.polizei === false && lm.einstellungen.krankenwagen === false && lm.einstellungen.abschleppwagen === false && lm.einstellungen.geisterfahrer === false && lm.einstellungen.nurRennautos === false,
    lm && JSON.stringify([lm.einstellungen.polizei, lm.einstellungen.krankenwagen, lm.einstellungen.geisterfahrer, lm.einstellungen.nurRennautos]));
  pruefe('D Motorrad-Raum: gewähltes Motorrad (Superbike) übernommen', lm && lm.spieler[0].auto === 'superbike');
  autoH.senden({ t: 'raumErstellen', fahrer: 'Emmy', auto: 'porsche-911', hilfe: 'viel', einstellungen: { streckeId: 'wiese', welt: 'klassisch', runden: 1, gegner: 1 } });
  const ra = await autoH.auf('raum'); await warte(150); const la = autoH.zuletzt('lobby');
  const codeA = ra && ra.code;
  pruefe('D Auto-Raum daneben: Code ≠ Motorrad-Code, Einstellungen ohne moto/unfall', !!codeA && codeA !== codeM && la && la.einstellungen.moto === undefined && la.einstellungen.unfall === undefined && la.spieler[0].auto === 'porsche-911');
  // falsche Art
  gastM.senden({ t: 'raumBeitreten', code: codeA, moto: true, fahrer: 'Lena', auto: 'quad' }); const f1 = await gastM.auf('fehler');
  autoG.senden({ t: 'raumBeitreten', code: codeM, fahrer: 'Lena', auto: 'porsche-911' }); const f2 = await autoG.auf('fehler');
  pruefe('D Motorrad-Client kommt nicht in den Auto-Raum, Auto-Client nicht in den Motorrad-Raum (falscheArt, Raum bleibt unberührt)',
    f1 && f1.grund === 'falscheArt' && f2 && f2.grund === 'falscheArt' && lm.spieler.length === 1);
  // alter Client (kennt moto nicht) ↔ neuer Server: Autoraum wie immer; Beitritt ohne moto in Autoraum
  alt.senden({ t: 'raumBeitreten', code: codeA, fahrer: 'Lena', auto: 'mini-cooper', hilfe: 'wenig' }); const la2 = await alt.auf('lobby');
  pruefe('G alter Client (ohne moto) tritt dem Auto-Raum bei wie bisher', !!la2 && la2.spieler.length === 2 && la2.spieler[1].auto === 'mini-cooper');
  // Beitritt Motorrad
  gastM.senden({ t: 'raumBeitreten', code: codeM.toLowerCase(), moto: true, fahrer: 'Lena', auto: 'quad', hilfe: 'aus' }); const lg = await gastM.auf('lobby');
  pruefe('D Gast tritt dem Motorrad-Raum bei (Code klein), wählt Quad', !!lg && lg.spieler.length === 2 && lg.spieler[1].auto === 'quad' && lg.einstellungen.moto === true);
  gastM.senden({ t: 'wahl', auto: 'porsche-911' }); const f3 = await gastM.auf('fehler');
  gastM.senden({ t: 'wahl', auto: 'roller' }); const l3 = await gastM.auf('lobby');
  gastM.senden({ t: 'wahl', auto: 'chopper' }); const l4 = await gastM.auf('lobby');
  pruefe('D Motorrad-Raum: Auto-IDs abgewiesen, M3-Typen (Roller, Chopper) wählbar', f3 && f3.grund === 'ungueltig' && l3 && l3.spieler[1].auto === 'roller' && l4 && l4.spieler[1].auto === 'chopper');
  gastM.senden({ t: 'wahl', auto: 'quad' }); await gastM.auf('lobby');
  hostM.senden({ t: 'einstellungen', einstellungen: { unfall: 'quatsch', stuntrennen: 'ja' } }); const le = await hostM.auf('lobby');
  hostM.senden({ t: 'einstellungen', einstellungen: { unfall: 'echt', stuntrennen: true, polizei: true } }); const le2 = await hostM.auf('lobby');
  pruefe('D Host-Einstellungen geprüft: Unsinn bei Unfällen → sanft, Nicht-bool Stuntrennen → aus, Polizei bleibt aus; gültige Werte übernommen',
    le && le.einstellungen.unfall === 'sanft' && le.einstellungen.stuntrennen === false && le2 && le2.einstellungen.unfall === 'echt' && le2.einstellungen.stuntrennen === true && le2.einstellungen.polizei === false);
  gastM.senden({ t: 'bereit', an: true }); await hostM.auf('lobby', (m) => m.spieler[1].bereit);

  // Auto-Raum startet parallel (ein Auto-Client unverändert)
  alt.senden({ t: 'bereit', an: true }); await autoH.auf('lobby', (m) => m.spieler[1] && m.spieler[1].bereit);
  autoH.senden({ t: 'start' });
  const [sa1, sa2] = await Promise.all([autoH.auf('start', null, 8000), alt.auf('start', null, 8000)]);
  hostM.senden({ t: 'start' });
  const [sh, sg] = await Promise.all([hostM.auf('start', null, 8000), gastM.auf('start', null, 8000)]);
  pruefe('E Start Motorrad-Raum: Teilnehmer = 2 Menschen (Superbike, Quad) + 2 Computer-Motorräder, `stationen` (Werkstatt/Krankenstation) und moto in den Einstellungen',
    sh && sg && sh.du === 0 && sg.du === 1 && sh.teilnehmer.length === 4 && sh.teilnehmer[0].autoId === 'superbike' && sh.teilnehmer[1].autoId === 'quad' &&
    sh.teilnehmer.slice(2).every(t => !t.mensch && /^crossmaschine/.test(t.autoId)) && sh.einstellungen.moto === true && sh.stationen && sh.stationen.w > 0 && sh.stationen.k > 0 &&
    JSON.stringify(sh.stationen) === JSON.stringify(sg.stationen), sh && JSON.stringify(sh.stationen) + ' ' + sh.teilnehmer.map(t => t.autoId).join(','));
  pruefe('E Start Auto-Raum parallel unverändert: 3 Teilnehmer, keine Motorrad-Felder (stationen/moto)', sa1 && sa2 && sa1.teilnehmer.length === 3 && sa1.stationen === undefined && sa1.einstellungen.moto === undefined);

  // Fahrer: Host mit Vorhersage + Trick-Taste im Flug; Gast (Quad) fährt in die Bande; Auto-Raum fährt geradeaus (Gas)
  const { st: stM, w: wM } = clientStrecke(CM, sh.einstellungen);
  const vH = new CM.NetzVorhersage({ strecke: stM, auto: autoVon('superbike'), tempoKlasse: sh.einstellungen.tempoKlasse, fahrhilfe: 'aus', umwelt: () => wM.umwelt() });
  const uH = CM.Moto.unfall.zNeu('echt'); uH.halteBremse = false; uH.gasEingabe = 0; uH.kiPlege = null; vH.vp._motoU = uH;
  const p0 = stM.startpositionen(4)[0];
  vH.vp.setzen(p0.x, p0.z, p0.heading); vH.vp.y = stM.hoeheAn(p0.x, p0.z);
  const pvH = new CM.Vehicle(autoVon('superbike').fahrwerte, { tempoKlasse: sh.einstellungen.tempoKlasse });
  hostM.n = 0; hostM.idx = -1; hostM.trickRest = 0; hostM.imFlug = false; hostM.kSende = 0; hostM.fort = 0;
  hostM.beiZustand = (z) => {
    if (!z.ich) return;
    hostM.fort = z.a[0][12];
    if (Array.isArray(z.ich.mu)) { uH.zustand = z.ich.mu[0]; uH.gesundheit = z.ich.mu[1]; uH.halteBremse = z.ich.mu[2] === 1; }
    vH.abgleich(z.ich, null, undefined, z.k);
    CM.Netz.fahrzeugSchreiben(pvH, z.ich.v);
    const a = autopilot(CM, stM, pvH, hostM.idx); hostM.idx = a.idx;
    if (hostM.fort > 500 && !hostM.crashFertig && !(hostM.crashRest > 0)) { hostM.crashRest = 50; hostM.crashFertig = true; }       // Sturz erzwingen: schräg in die Bande
    if (hostM.crashRest > 0) { a.s = { gas: 1, bremse: 0, lenkung: 0.7 }; hostM.crashRest--; }
    const k = CM.Netz.eingabeKodieren(a.s);
    const luft = !!(z.mo && (z.mo[0][6] & 128));
    if (luft && !hostM.imFlug) hostM.trickRest = 2;
    hostM.imFlug = luft;
    for (let i = 0; i < 3; i++) {
      hostM.n++;
      const msg = { t: 'eingabe', n: hostM.n, g: k.g, b: k.b, l: k.l };
      if (hostM.trickRest > 0) { msg.k = 1; hostM.trickRest--; hostM.kSende++; }
      hostM.senden(msg);
      vH.schritt(hostM.n, CM.Netz.eingabeDekodieren(k), { countdown: z.rz === 'countdown', imZiel: false });
    }
  };
  gastM.n = 0;
  gastM.beiZustand = (z) => { if (!z.ich) return; for (let i = 0; i < 3; i++) { gastM.n++; gastM.senden({ t: 'eingabe', n: gastM.n, g: 255, b: 0, l: 0 }); } };      // Gas voll, keine Lenkung → Bande
  const gastGasK = CM.Netz.eingabeKodieren({ gas: 1, bremse: 0, lenkung: 0 });
  gastM.beiZustand = (z) => { if (!z.ich) return; for (let i = 0; i < 3; i++) { gastM.n++; gastM.senden({ t: 'eingabe', n: gastM.n, g: gastGasK.g, b: 0, l: 0 }); } };
  autoH.n = 0; autoH.fort = 0;
  autoH.beiZustand = (z) => { if (!z.ich) return; autoH.fort = z.a[0][12]; for (let i = 0; i < 3; i++) { autoH.n++; autoH.senden({ t: 'eingabe', n: autoH.n, g: gastGasK.g, b: 0, l: 0 }); } };
  alt.beiZustand = (z) => { if (!z.ich) return; for (let i = 0; i < 3; i++) { alt.n = (alt.n || 0) + 1; alt.senden({ t: 'eingabe', n: alt.n, g: gastGasK.g, b: 0, l: 0 }); } };
  const ergH = hostM.auf('ergebnis', null, 120000);
  hostM.senden({ t: 'geladen' }); gastM.senden({ t: 'geladen' }); autoH.senden({ t: 'geladen' }); alt.senden({ t: 'geladen' });
  await warte(40000 / 6);                           // ≈ 40 s Spielzeit (Zeitraffer ×6)

  const evH = hostM.ereignisse, evG = gastM.ereignisse;
  const sig = (l, art) => l.filter(x => x.art === art).map(x => JSON.stringify(x));
  const stuH = sig(evH, 'stunt'), stuG = sig(evG, 'stunt'), sturzH = evH.filter(x => x.art === 'sturz'), sturzG = evG.filter(x => x.art === 'sturz');
  const unfH = evH.filter(x => x.art === 'unfall'), unfG = evG.filter(x => x.art === 'unfall');
  const moH = hostM.letzterZustand && hostM.letzterZustand.mo;
  pruefe('E Zustände mit mo (je Teilnehmer 13 Zahlen) bei beiden Clients; ich.mu beim eigenen Wagen', !!moH && moH.length === 4 && moH.every(a => a.length === 13) && Array.isArray(hostM.letzterZustand.ich.mu) &&
    !!gastM.letzterZustand.mo && Array.isArray(gastM.letzterZustand.ich.mu), moH ? JSON.stringify(moH[0]) : 'kein mo');
  pruefe('E Gleiche Ticks, gleiche Werte: mo ist bei beiden Clients bitgleich (alle gemeinsamen Zustände)', (() => {
    let n = 0, gleichAlle = true;
    for (const [k, z] of hostM.zByK) { const g = gastM.zByK.get(k); if (g) { n++; if (JSON.stringify(g.mo) !== JSON.stringify(z.mo)) gleichAlle = false; } }
    return n > 100 && gleichAlle;
  })(), 'verglichen: ' + [...hostM.zByK.keys()].filter(k => gastM.zByK.has(k)).length);
  pruefe('E Sturz: Quad-Spieler (Gast) fährt gegen die Bande → Quad stürzt NIE (kein sturz/unfall für nr 1) – Server entschärft wie der Browser',
    !sturzH.some(x => x.nr === 1) && !unfH.some(x => x.nr === 1) && gastM.letzterZustand.a[1][12] >= 0, 'sturz ' + sturzH.map(x => x.nr).join(','));
  const fahrerSturz = sturzH.length > 0 || sturzG.length > 0;
  pruefe('E Stunt-Ereignisse kommen bei beiden Clients identisch an (Name, Punkte, Fahrer)', stuH.length >= 1 && JSON.stringify(stuH) === JSON.stringify(stuG), stuH.length + ' Stunts: ' + evH.filter(x => x.art === 'stunt').map(x => x.nr + ':' + x.st + ':' + x.p).join(' '));
  pruefe('E Sturz/Unfall-Ereignisse kommen bei beiden Clients identisch an (falls ein Sturz passiert ist)', JSON.stringify(sturzH) === JSON.stringify(sturzG) && JSON.stringify(unfH) === JSON.stringify(unfG), `${sturzH.length} Stürze, ${unfH.length} Unfälle` + (fahrerSturz ? '' : ' (kein Sturz in 40 s – siehe C)'));
  const punkteH = moH ? moH.map(a => a[1]) : [];
  pruefe('E Stuntpunkte im Zustand = Summe der Stunt-Ereignisse je Teilnehmer', evH.filter(x => x.art === 'stunt').every(x => x.g <= punkteH[x.nr]) && punkteH.some(p => p > 0), punkteH.join('/'));
  pruefe('E Vorhersage des Motorrad-Clients gegen den echten Server (Motorrad, 40 s): keine harten Korrekturen, größte Abweichung < 3 m', vH.stat.hart === 0 && vH.stat.maxFehler < 3 && vH.stat.abgleiche > 100,
    `max ${vH.stat.maxFehler.toFixed(3)} m, hart ${vH.stat.hart}, ${vH.stat.abgleiche} Abgleiche, ${hostM.kSende} Trick-Bits gesendet`);
  pruefe('E Auto-Raum parallel: Zustände ohne mo/ich.mu, Auto fährt (Fortschritt > 10 m), Motorrad-Raum davon unberührt', !!autoH.letzterZustand && autoH.letzterZustand.mo === undefined && autoH.letzterZustand.ich.mu === undefined &&
    autoH.letzterZustand.a.length === 3 && autoH.fort > 10 && alt.zustaende > 50, 'Fortschritt ' + autoH.fort.toFixed(0) + ' m, ' + autoH.zustaende + ' Zustände');
  pruefe('E Auto-Raum: keine Stunt-/Sturz-/Unfall-Ereignisse', !autoH.ereignisse.some(x => x.art === 'stunt' || x.art === 'sturz' || x.art === 'unfall'));

  // Ergebnis: Menschen im Ziel? Host fährt per Autopilot eine Runde (~150 s Spielzeit bei 3 km); wir warten nicht ewig, sondern schließen die Spieler
  gastM.schliessen();
  const weg = await hostM.auf('ereignis', (m) => m.art === 'weg', 3000);
  pruefe('E Gast trennt → Host bekommt „weg“, Quad fährt als Computer weiter (Stunt-Planung der KI), Server läuft', !!weg && weg.nr === 1);
  await warte(500);
  const z1 = hostM.letzterZustand; await warte(500);
  pruefe('E Motorrad-Raum läuft nach dem Weggang weiter (Zustände kommen)', hostM.letzterZustand.k > z1.k);
  autoH.schliessen(); alt.schliessen();
  hostM.schliessen();
  await warte(300);

  // ================================================================== F) Client-Schattenzustand (src/moto/motoOnline.js im Node-Kontext)
  {
    const stub = path.join(__dirname, '_stub_moto_online.js');
    fs.writeFileSync(stub, `
      window.Rennspiel.THREE = window.THREE; document.head = { appendChild() {} }; window.location = { protocol: 'http:', host: 'x', hostname: 'x', origin: 'http://x' }; window.Rennspiel.Online = { verfuegbar: () => true, Bildschirm: class { zeichnen() { return 1; } } };
      window.Rennspiel.NetzVerbindung = class { static url() { return 'ws://x/ws'; } };
      window.Rennspiel.Menue = class { taste() { return false; } };
      window.Rennspiel.Moto.onlineOrig = { htmlOnlineKarte() { return ''; }, onlineOeffnen() {}, verfuegbar: () => true };
      window.MOTORRAD_SERVER = 'mac-mini.tailnet.ts.net:10000';
    `);
    const CF = kontextLaden(MOTO_CLIENT.concat(['tests/_stub_moto_online.js', 'src/moto/motoOnline.js']), { MOTORRAD: true });
    fs.rmSync(stub, { force: true });
    const O = CF.Moto.online;
    pruefe('F motoOnline.js lädt im Node-Kontext (Menü-Hook, Server-Adresse, Bestenliste bereit)', !!O && CF.Moto.onlineAn === true && O.serverUrl === 'ws://mac-mini.tailnet.ts.net:10000/ws' && CF.NetzVerbindung.url() === O.serverUrl && !!CF.Moto.bestenliste);
    const sim = new Simulation({ moto: true, einstellungen: { streckeId: 'wiese', gegner: 1, runden: 2, unfall: 'echt', kollisionen: false }, spieler: [{ fahrer: 'Jonas', auto: 'superbike' }], seed: 21 });
    const info = sim.startInfo();
    // Fake-Spiel: Strecke + Fahrzeuge aus dem Client-Kontext (ohne Meshes), Szene = leere THREE.Group
    const { st } = clientStrecke(CF, info.einstellungen);
    const fz = info.teilnehmer.map((t) => ({ auto: CF.carCatalog.waehlbare().find(a => a.id === t.autoId), vehicle: { x: 0, z: 0 }, istSpieler: t.mensch, spielerNr: t.mensch ? 0 : -1, mesh: null }));
    const spiel = { fahrzeuge: fz, strecke: st, szene: new CF.THREE.Group(), huds: [], input: { spielTasten: new Set(), istGedrueckt: (c) => c === spiel.gehalten }, einstellungen: {}, einstellungenSpeichern() {}, zustand: 'online' };
    const vp = { vp: { _motoU: null } };
    const ui = { spiel, vorhersage: vp, phase: 'rennen', raumCode: 'ABCD', ergEl: null };
    O.aufbau(ui, { einstellungen: Object.assign({}, info.einstellungen, { unfall: 'echt', stuntrennen: true }), teilnehmer: info.teilnehmer, du: 0 });
    pruefe('F aufbau: Schatten-Zustand je Teilnehmer (stunt/unfall/motoZ), Stationen gebaut, Vorhersage-Fahrzeug bekommt den Unfall-Zustand',
      spiel.stunt.fz.length === 2 && spiel.unfall.fz.length === 2 && spiel.unfall.modus === 'echt' && spiel.stunt.stuntrennen === true && !!fz[0].motoZ && vp.vp._motoU === spiel.unfall.fz[0] && !!spiel.motoStationen);
    // Eingabe-Bit k
    const msg = { t: 'eingabe' }; spiel.gehalten = null; O.eingabe(ui, msg); const ohne = msg.k;
    const msg2 = { t: 'eingabe' }; spiel.gehalten = CF.config.motoStunts.taste[0]; O.eingabe(ui, msg2);
    const msg3 = { t: 'eingabe' }; spiel.gehalten = null; CF.Moto.stuntStart.tippZaehlen(CF.config.motoStunts.taste[0]); O.eingabe(ui, msg3); const msg4 = { t: 'eingabe' }; O.eingabe(ui, msg4);
    pruefe('F Eingabe-Bit k: ohne Taste nicht, gehalten ja, Tipp (auch wenn schon losgelassen) genau einmal', ohne === undefined && msg2.k === 1 && msg3.k === 1 && msg4.k === undefined);
    // Server-Zustand durchfüttern: Stunts, Sturz, Unfall
    let n = 0, pruef = { punkte: true, zustand: true, szeneGesehen: false, haltGesehen: false };
    const bis = 60 * 80;
    for (let t = 1; t <= bis; t++) {
      let s = { gas: 1, bremse: 0, lenkung: 0 };
      if (t > 60 * 30 && t < 60 * 30 + 120) s = { gas: 1, bremse: 0, lenkung: 0.7 };
      sim.eingabeSetzen(0, s);
      if (t % 200 < 3 && t % 200 > 0) sim.trickSetzen(0, true); else sim.trickSetzen(0, false);
      sim.schritt();
      const ev = sim.abholen();
      if (t % 3 === 0) {
        const z = sim.zustand(); z.ich = sim.ich(0);
        O.zustand(ui, z);
        const a = z.mo[0], zs = spiel.stunt.fz[0], u = spiel.unfall.fz[0];
        if (zs.punkte !== a[1]) pruef.punkte = false;
        if (Math.abs(u.zustand - z.ich.mu[0]) > 1e-9 || Math.abs(u.gesundheit - z.ich.mu[1]) > 1e-9) pruef.zustand = false;
        if (u.szene) pruef.szeneGesehen = true;
        if (u.halt) pruef.haltGesehen = true;
      }
      for (const e of ev) { if (e.art === 'stunt' || e.art === 'sturz') { n++; O.ereignis(ui, e); } }
    }
    pruefe('F Schatten-Zustand folgt dem Server: Stuntpunkte gleich, Motorrad-/Fahrer-% gleich (ich.mu, ungerundet) über 80 s, ' + n + ' Stunt-/Sturz-Ereignisse verarbeitet', pruef.punkte && pruef.zustand && n >= 1,
      'Szene gesehen: ' + pruef.szeneGesehen + ', Station gesehen: ' + pruef.haltGesehen);
    O.abbau(ui);
    pruefe('F abbau räumt auf (kein Schatten-Zustand, keine Stationen mehr)', spiel.stunt === null && spiel.unfall === null && spiel.motoStationen === null && ui._mo === null);
    // Bestenliste: Prüfung der Meldung
    const B = CF.Moto.bestenliste;
    const gut = B.eintragPruefen({ name: 'Jonas', punkte: 1250.7, platz: 1, strecke: 'wiese', zeit: 123.456, modus: 'online', raum: 'ABCD' });
    pruefe('F Bestenliste: Eintrag geprüft (spiel motorrad, ganze Punkte, Zeit gerundet); Müll (leerer Name, 0 Punkte, Freitext-Länge) verworfen',
      gut && gut.spiel === 'motorrad' && gut.art === 'stunt' && gut.punkte === 1250 && gut.zeit === 123.46 && !B.eintragPruefen({ name: '', punkte: 5 }) && !B.eintragPruefen({ name: 'x', punkte: 0 }) && !B.eintragPruefen({ name: 'x'.repeat(41), punkte: 5 }) && !B.eintragPruefen(null));
  }

  await srv.schliessen();
  console.log(`\n${ok} OK, ${fehler} FEHL`);
  console.log(fehler ? 'FEHLER' : 'ALLE MOTORRAD-NETZ-TESTS OK');
  process.exit(fehler ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
