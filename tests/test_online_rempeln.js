// v28 W5: node tests/test_online_rempeln.js
// Beweist, dass „Rempeln“ online wirklich stößt – echter Server (im selben Prozess, freier Port) + 2 WebSocket-Clients,
// Messung aus dem Zustands-Strom, den die Clients bekommen (so wie der Browser ihn sieht), dazu Server-seitig der
// Rechteck-Abstand (Kollisionen.obbAbstand, < 0 = Durchdringung):
//  L) Lobby-Standard: Raum ohne Feld `kollisionen` → Rempeln; nur echtes false → Geister
//  R1) Rempeln: Auto A steht, Auto B fährt mit 20 m/s HINTEN auf  → Mittelpunkt-Abstand ≥ ~Fahrzeuglänge, Tempo von B sinkt
//  R2) Rempeln: frontal (B fährt A entgegen)                      → dito
//  R3) Rempeln: Spieler B ↔ KI-Gegner (KI festgehalten)            → dito
//  R4) Rempeln: Spieler B ↔ Verkehrswagen (Abschleppwagen steht)   → dito
//  G1) Geister (Gegenprobe): B fährt durch A hindurch (Durchdringung, Tempo bleibt)
//  G2) Geister: Spieler ↔ Verkehrswagen stößt trotzdem (v25)
//  P)  Ping auf localhost (2 Fenster auf einem Mac) ≈ 1 ms → weit unter 100 ms
//  U)  v28c: Überlappung je Quelle (tests/rempeln_netz_messung.js, Gleichschritt: echter Server-Code + 2 Clients mit dem Browser-Code der Anzeige,
//      Latenz 0/50/100/200 ms) in 7 Fällen (Stand/Stand überlappend abgestellt, langsam, schnell, schieben, schräg, frontal, nebeneinander):
//      Server nach 0,5 s 0 m; Host- und Gast-Anzeige ≤ 0,3 m dauerhaft (kurze Spitzen ≤ 0,8 m für ≤ 150 ms); Gegenprobe ohne Trennung (Stand v28b) > 1 m
'use strict';
const path = require('path');
const WebSocket = require(path.join(__dirname, '..', 'server', 'node_modules', 'ws'));
const { starten } = require('../server/server');
const { laden } = require('../server/simulation');

let fehler = 0, ok = 0;
function pruefe(name, gut, info) { console.log((gut ? 'OK   ' : 'FEHL ') + name + (info !== undefined ? '  (' + info + ')' : '')); if (gut) ok++; else fehler++; }
const warte = (ms) => new Promise(r => setTimeout(r, ms));
const R = laden();

class Client {
  constructor(port) {
    this.ws = new WebSocket('ws://127.0.0.1:' + port + '/ws');
    this.alle = []; this.warter = []; this.n = 0; this.s = { g: 0, b: 0, l: 0 };
    this.offen = new Promise((ok2, nein) => { this.ws.on('open', ok2); this.ws.on('error', nein); });
    this.ws.on('message', (d) => {
      let m; try { m = JSON.parse(d); } catch (e) { return; }
      if (m.t === 'zustand') {
        this.letzter = m; if (this.beiZustand) this.beiZustand(m);
        // je Zustand 3 Eingaben (Server: 3 Ticks je Zustand)
        for (let i = 0; i < 3; i++) { this.n++; this.senden({ t: 'eingabe', n: this.n, g: this.s.g, b: this.s.b, l: this.s.l }); }
      } else this.alle.push(m);
      this.warter = this.warter.filter(w => { if (w.t === m.t && w.f(m)) { clearTimeout(w.zeit); w.ok(m); return false; } return true; });
    });
  }
  senden(o) { if (this.ws.readyState === 1) this.ws.send(JSON.stringify(o)); }
  auf(t, f, ms) {
    return new Promise((ok2) => {
      const w = { t, f: f || (() => true), ok: ok2, zeit: setTimeout(() => { this.warter = this.warter.filter(x => x !== w); ok2(null); }, ms || 5000) };
      this.warter.push(w);
    });
  }
  steuer(gas, bremse) { const k = R.Netz.eingabeKodieren({ gas, bremse, lenkung: 0 }); this.s = { g: k.g, b: k.b, l: k.l }; }
  schliessen() { this.ws.terminate(); }
}

/** Raum mit 2 Menschen aufbauen und bis „laeuft“ bringen. */
async function raumMit(port, srv, einst) {
  const host = new Client(port), gast = new Client(port);
  await host.offen; await gast.offen;
  host.senden({ t: 'raumErstellen', fahrer: 'Jonas', auto: 'passat', hilfe: 'aus', einstellungen: einst });
  const raum = await host.auf('raum');
  gast.senden({ t: 'raumBeitreten', code: raum.code, fahrer: 'Emmy', auto: 'passat', hilfe: 'aus' });
  const lobby = await gast.auf('lobby');
  gast.senden({ t: 'bereit', an: true }); await host.auf('lobby', (m) => m.spieler[1] && m.spieler[1].bereit);
  host.senden({ t: 'start' });
  const [sh] = await Promise.all([host.auf('start', null, 8000), gast.auf('start', null, 8000)]);
  host.senden({ t: 'geladen' }); gast.senden({ t: 'geladen' });
  const r = srv.raeume.get(raum.code);
  for (let i = 0; i < 200 && !(r.sim && r.sim.sim.rennen.gasErlaubt); i++) await warte(50);
  return { host, gast, r, start: sh, lobby };
}

/** Szenario: Ziel-Fahrzeug (Index zi) steht bei s, B (Index bi, Client gast) kommt mit 20 m/s von hinten oder vorn. */
async function szenario(raum, opt) {
  // (async: der Verkehrswagen bekommt nach dem Auftauchen im ersten Schritt noch seine Spur – erst danach B dahinter setzen)
  const sim = raum.r.sim, S = sim.sim, sp = S.strecke.spline, F = S.fahrzeuge;
  const sPos = opt.s || 420;
  let ziel = F[opt.zi];
  if (opt.verkehr) {                       // Abschleppwagen auftauchen lassen (wie tests/test_verkehr.js V5)
    const vk = S.verkehr, e = vk.eintraege.find(x => x.art === 'abschleppwagen');
    e.route = { a: sPos - 50, b: sPos + 600 }; vk._erscheinen(e, sPos, 0, 0); ziel = e.f;
    await warte(150); ziel.vehicle.vLaengs = 0;
  }
  const p = sp.punktBei(sPos), h = R.headingAus(p.tx, p.tz);
  const T = ziel.vehicle, B = F[opt.bi].vehicle;
  if (!opt.verkehr) { T.setzen(p.x, p.z, h); T.vLaengs = 0; T.y = S.strecke.hoeheAn(p.x, p.z); ziel.index = -1; }
  const rt = T.richtung(), abst = 16;
  if (opt.frontal) { B.setzen(T.x + rt.x * abst, T.z + rt.z * abst, T.heading + Math.PI); }
  else B.setzen(T.x - rt.x * abst, T.z - rt.z * abst, T.heading);
  B.vLaengs = 20; B.y = S.strecke.hoeheAn(B.x, B.z); F[opt.bi].index = -1;
  // Rennleitung umsetzen (sonst gilt der Sprung als Abkürzung/falsch abgebogen → Reset), wie tests/test_netz.js M2
  S.rennen.verfolgungSetzen(opt.bi, B.x, B.z, sPos);
  if (!opt.verkehr) S.rennen.verfolgungSetzen(opt.zi, T.x, T.z, sPos);
  [ziel, F[opt.bi]].forEach(f => { f.netReset = (f.netReset || 0) + 1; f.stehZeit = 0; f.falschHerum = false; f.falschZeit = 0; });
  const LA = T.daten.laenge, LB = B.daten.laenge, soll = (LA + LB) / 2;
  // festhalten (Ziel steht) + Server-Abstand nach jedem Schritt messen
  const alt = sim.schritt;
  let minObb = Infinity, stoesse = 0, schritte = 0;
  sim.schritt = function () {
    if (opt.halten) { T.vLaengs = 0; if (T.vQuer !== undefined) T.vQuer = 0; }
    alt.call(this);
    minObb = Math.min(minObb, R.Kollisionen.obbAbstand(T, B));
    if (process.env.DEBUG && (schritte++ % 30) === 0) console.log('   s', schritte, T.x.toFixed(1), T.z.toFixed(1), B.x.toFixed(1), B.z.toFixed(1), B.vLaengs.toFixed(1), R.Kollisionen.obbAbstand(T, B).toFixed(2));
    if (S.stoesse && S.stoesse.length) stoesse++;
  };
  raum.gast.steuer(1, 0);                 // B gibt Vollgas
  if (opt.zi < 2) raum.host.steuer(0, 0); // A (Mensch) rollt (Bremse im Stand wäre Rückwärtsgang)
  // Messung aus dem Zustands-Strom des Gastes (= was sein Browser bekommt)
  let minD = Infinity, vMin = Infinity, n = 0, vStart = null;
  const vonStrom = (z) => {
    let za = null;
    if (opt.verkehr) { za = z.vk && z.vk.find(x => (x[6] & 2) && Math.hypot(x[0] - T.x, x[1] - T.z) < 3); }
    else za = z.a[opt.zi];
    const zb = z.a[opt.bi];
    if (!za || !zb) return;
    const d = Math.hypot(za[0] - zb[0], za[1] - zb[1]);
    n++; if (vStart === null) vStart = zb[4];
    minD = Math.min(minD, d); vMin = Math.min(vMin, zb[4]);
  };
  await warte(150);                        // den alten Zustand verwerfen
  raum.gast.beiZustand = vonStrom;
  await warte(opt.ms || 2500);
  raum.gast.beiZustand = null;
  sim.schritt = alt;
  raum.gast.steuer(0, 0); raum.host.steuer(0, 0);
  if (process.env.DEBUG) console.log('  dbg', JSON.stringify({ T: [T.x, T.z, T.vLaengs], B: [B.x, B.z, B.vLaengs], p: [p.x, p.z], aktiv: opt.verkehr ? ziel.verkehr && ziel.verkehr.aktiv : null, gas: raum.r.sim.sim.rennen.gasErlaubt }));
  return { minD, vMin, vStart, soll, minObb, stoesse, n, LA, LB };
}

// ---------------- U) Überlappung je Quelle (synchron, ohne Netzwerk-Zeitrauschen)
{
  const M = require('./rempeln_netz_messung');
  const LAT = [0, 50, 100, 200];
  const anzOk = (x) => x.tief <= 0.3 || (x.tief <= 0.8 && x.ms03 <= 150);
  const f = (x) => `${x.tief.toFixed(2)} m${x.ms03 ? ' [' + x.ms03 + ' ms > 0,3]' : ''}`;
  for (const name of Object.keys(M.SZENARIEN)) {
    const zeilen = [], serverZ = [];
    let gutS = true, gutA = true, stoss = true;
    for (const l of LAT) {
      const r = M.lauf(name, l), a = M.auswerten(r), a05 = M.auswerten(r, { ab: 30 });
      if (!(a05.server.tief < 0.01)) gutS = false;
      if (!anzOk(a.host) || !anzOk(a.gast)) gutA = false;
      if (name !== 'stand_stand' && !(r.stoesseVorhersage[1] > 0)) stoss = false;
      serverZ.push(`${l} ms ${a05.server.tief.toFixed(2)}`);
      zeilen.push(`${l} ms: Gast ${f(a.gast)} / Host ${f(a.host)} (Versatz max ${a.gastTrenn.toFixed(2)} m)`);
    }
    pruefe(`U ${name}: Server-Überlappung nach 0,5 s = 0 (0/50/100/200 ms)`, gutS, serverZ.join(', '));
    pruefe(`U ${name}: Anzeige Host + Gast ≤ 0,3 m (Spitzen ≤ 0,8 m ≤ 150 ms)` + (name !== 'stand_stand' ? ', Gast-Vorhersage stößt' : ''), gutA && stoss, zeilen.join(' | '));
  }
  // Gegenprobe: ohne Anzeige-Trennung (Stand v28b) misst der Test das gemeldete Durchfahren (Gast-Sicht 1–2 m)
  const g = M.auswerten(M.lauf('schieben', 100, { ohneTrennen: true }));
  pruefe('U Gegenprobe ohne Trennung (v28b): Gast-Sicht beim Schieben (100 ms) > 1 m Überlappung, Server 0', g.gast.tief > 1 && g.server.tief < 0.01, `Gast ${f(g.gast)}, Server ${g.server.tief.toFixed(2)} m`);
}

(async () => {
  const srv = await starten({ port: 0, host: '127.0.0.1', leise: true, tempo: 2, ladenMaxMs: 5000 });
  const port = srv.port;
  const basis = { streckeId: 'wiese', welt: 'klassisch', runden: 3, gegner: 1, schwierigkeit: 'leicht', verkehr: 'wenig' };

  // ---------------- L) Standard der Lobby
  {
    const k = new Client(port); await k.offen;
    k.senden({ t: 'raumErstellen', fahrer: 'Jonas', auto: 'passat', einstellungen: { streckeId: 'wiese' } });
    const l1 = await k.auf('lobby');
    k.senden({ t: 'einstellungen', einstellungen: { kollisionen: false } }); const l2 = await k.auf('lobby');
    k.senden({ t: 'einstellungen', einstellungen: { kollisionen: true } }); const l3 = await k.auf('lobby');
    pruefe('L Raum ohne Feld kollisionen → Standard Rempeln; false → Geister; true → Rempeln',
      l1 && l1.einstellungen.kollisionen === true && l2 && l2.einstellungen.kollisionen === false && l3 && l3.einstellungen.kollisionen === true,
      [l1, l2, l3].map(l => l && l.einstellungen.kollisionen).join('/'));
    k.schliessen(); await warte(300);
  }

  // ---------------- R) Rempeln
  const rr = await raumMit(port, srv, Object.assign({ kollisionen: true }, basis));
  pruefe('R Rennen mit Rempeln läuft (2 Menschen + 1 KI + Verkehr)', !!rr.r.sim && rr.r.sim.kollisionen === true && rr.r.sim.sim.rennen.gasErlaubt,
    rr.start.teilnehmer.map(t => t.name + (t.mensch ? '' : '🤖')).join(','));
  const kiNr = rr.start.teilnehmer.findIndex(t => !t.mensch);
  const fall = (name, e) => {
    const gut = e.minD >= 0.9 * e.soll && e.minObb > -0.35 && e.vMin < e.vStart - 6 && e.n > 20;
    pruefe(name, gut, `Mitte-Abstand min ${e.minD.toFixed(2)} m (Länge ${e.soll.toFixed(2)} m), Rechteck min ${e.minObb.toFixed(2)} m, Tempo B ${e.vStart.toFixed(1)} → min ${e.vMin.toFixed(1)} m/s, Stöße ${e.stoesse}, ${e.n} Zustände`);
  };
  fall('R1 Rempeln hinten: B fährt auf das stehende Auto A auf → kein Durchfahren, B wird langsamer', await szenario(rr, { zi: 0, bi: 1, s: 420 }));
  fall('R2 Rempeln frontal: B fährt A entgegen → kein Durchfahren, B wird langsamer', await szenario(rr, { zi: 0, bi: 1, s: 700, frontal: true }));
  fall('R3 Rempeln Spieler ↔ KI-Gegner (KI steht) → kein Durchfahren', await szenario(rr, { zi: kiNr, bi: 1, s: 1000, halten: true }));
  fall('R4 Rempeln Spieler ↔ Verkehrswagen (Abschleppwagen steht) → kein Durchfahren', await szenario(rr, { zi: -1, bi: 1, s: 1300, halten: true, verkehr: true }));

  // ---------------- P) Ping (2 Fenster auf einem Mac = localhost)
  {
    const t = []; for (let i = 0; i < 10; i++) { const t0 = Date.now(); rr.gast.senden({ t: 'ping', z: t0 }); const m = await rr.gast.auf('pong', null, 1000); if (m) t.push(Date.now() - t0); }
    const med = t.length ? t.sort((a, b) => a - b)[t.length >> 1] : NaN;
    pruefe('P Ping localhost (2 Fenster auf einem Mac) weit unter 100 ms', t.length >= 5 && med < 20, t.length ? `Median ${med} ms aus ${t.length}` : 'keine Antwort auf ping');
  }
  rr.host.schliessen(); rr.gast.schliessen(); await warte(400);

  // ---------------- G) Geister (Gegenprobe)
  const rg = await raumMit(port, srv, Object.assign({ kollisionen: false }, basis));
  const g2 = await szenario(rg, { zi: -1, bi: 1, s: 1300, halten: true, verkehr: true });
  const g1 = await szenario(rg, { zi: 0, bi: 1, s: 420 });
  pruefe('G1 Geister (Gegenprobe): B fährt durch A hindurch (Durchdringung, Mitten fast deckungsgleich)', g1.minObb < -1 && g1.minD < 0.5 * g1.soll,
    `Mitte-Abstand min ${g1.minD.toFixed(2)} m, Rechteck min ${g1.minObb.toFixed(2)} m, Tempo ${g1.vStart.toFixed(1)} → ${g1.vMin.toFixed(1)}`);
  pruefe('G2 Geister: Spieler ↔ Verkehrswagen stößt trotzdem', g2.minD >= 0.9 * g2.soll && g2.minObb > -0.35 && g2.vMin < g2.vStart - 6,
    `Mitte-Abstand min ${g2.minD.toFixed(2)} m (Länge ${g2.soll.toFixed(2)}), Rechteck min ${g2.minObb.toFixed(2)} m, Tempo ${g2.vStart.toFixed(1)} → ${g2.vMin.toFixed(1)}`);
  rg.host.schliessen(); rg.gast.schliessen();

  await warte(300);
  srv.schliessen();
  console.log(`\n${ok} OK, ${fehler} FEHL`);
  process.exit(fehler ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
