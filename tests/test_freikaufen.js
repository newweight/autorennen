// 14.10. (v22) Polizei freikaufen (Doppeltipp Rückwärts, 10 Münzen): node tests/test_freikaufen.js
//  F1) Polizei-Logik: freikaufen(i) beendet die Anhaltung beim nächsten Schritt ('weiter' mit gekauft), Schonfrist wie sonst; nicht angehalten → false
//  F2) Input: Doppeltipp ≤ 0,5 s (↓ Spieler 1, S Spieler 2) → genau einmal true; zu langsam / mit Gas (Dach-Geste ↑+↓) / falsche Taste → false
//  F3) Server (Simulation): Stopp erzwingen, kontoSetzen(25) → freikaufen: Konto 15, Stopp weg, Ereignis 'freikauf' + Meldung „💰 −10 – weiter!“;
//      Konto 5 → Meldung „Zu wenig Münzen (10 nötig)“, Stopp bleibt; nicht angehalten → nichts, kein Abzug
//  F4) Server (WebSocket): geladen mit k, Eingabe-Bit f → Ereignis freikauf; ohne Konto (k fehlt) → zu wenig; k wird geklemmt (negativ/Text/riesig)
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
let fehler = 0, geprueft = 0;
function pruefe(name, ok, info) { geprueft++; console.log((ok ? 'OK   ' : 'FEHL ') + name + (info !== undefined ? '  (' + info + ')' : '')); if (!ok) fehler++; }

// ---- Lader mit Tastatur-Ereignissen und steuerbarer Uhr ----
let jetztMs = 100000;
const hoerer = {};
const sandbox = { console, Math, performance: { now: () => jetztMs } };
sandbox.window = sandbox; sandbox.globalThis = sandbox;
sandbox.addEventListener = (art, fn) => { (hoerer[art] = hoerer[art] || []).push(fn); };
vm.createContext(sandbox);
for (const d of ['src/config.js', 'src/world/polizei.js', 'src/input.js']) vm.runInContext(fs.readFileSync(path.join(__dirname, '..', d), 'utf8'), sandbox, { filename: d });
const R = sandbox.Rennspiel;
const taste = (art, code) => (hoerer[art] || []).forEach(fn => fn({ code, preventDefault() {} }));
const runter = (c) => taste('keydown', c), hoch = (c) => taste('keyup', c);
const T = R.config.tasten.spieler;

// ---------------- F1 Polizei-Logik
{
  const P = R.Polizei, C = R.config.polizei, dt = 1 / 60, L = 2000;
  const auto = (s, q, o) => Object.assign({ x: q || 0, z: -s, heading: 0, laenge: 4.5, breite: 1.8, s, runde: 0, istSpieler: false, imZiel: false, frei: true, schild: false }, o || {});
  const streife = (s, q) => ({ x: q || 0, z: -s, heading: 0, laenge: 4.7, breite: 1.83, s });
  pruefe('F1 Config: freikaufKosten 10, Fenster 0,5 s', C.freikaufKosten === 10 && C.freikaufFenster === 0.5, C.freikaufKosten + '/' + C.freikaufFenster);
  const lg = new P.Logik(), sp = auto(500, 0, { istSpieler: true }), st = [streife(493)];
  let ev = [];
  for (let k = 0; k < 120 && !lg.gesperrt(0); k++) ev.push(...lg.schritt(dt, [sp], st, L));
  pruefe('F1 Anhaltung beginnt (gesperrt)', lg.gesperrt(0) && ev.some(e => e.art === 'anhalten'));
  for (let k = 0; k < 30; k++) ev.push(...lg.schritt(dt, [sp], st, L));
  pruefe('F1 nach 0,5 s noch gesperrt, Rest ≈ 3,5 s', lg.gesperrt(0) && Math.abs(lg.rest(0) - 3.5) < 0.1, lg.rest(0).toFixed(2));
  pruefe('F1 freikaufen(0) → true', lg.freikaufen(0) === true);
  const e2 = lg.schritt(dt, [sp], st, L);
  pruefe('F1 nächster Schritt: Ereignis weiter mit gekauft:true, nicht mehr gesperrt, Rest 0', e2.length === 1 && e2[0].art === 'weiter' && e2[0].gekauft === true && !lg.gesperrt(0) && lg.rest(0) === 0, JSON.stringify(e2));
  pruefe('F1 Schonfrist wie sonst (nicht sofort wieder wählbar)', lg.waehlbar(0, sp, 0) === false);
  pruefe('F1 nicht angehalten → freikaufen false', lg.freikaufen(0) === false && lg.freikaufen(7) === false);
  // normales Ende hat gekauft:false
  const lg2 = new P.Logik(), sp2 = auto(500, 0, { istSpieler: true }), st2 = [streife(493)];
  let weiter = null;
  for (let k = 0; k < 60 * 10 && !weiter; k++) weiter = lg2.schritt(dt, [sp2], st2, L).find(e => e.art === 'weiter') || null;
  pruefe('F1 normales Ende: weiter mit gekauft:false', !!weiter && weiter.gekauft === false);
  // anzeige liefert Kosten (für den HUD-Hinweis) – die Klasse Polizei braucht Spiel; Logik: Kosten stehen in c
  pruefe('F1 Logik kennt Kosten (c.freikaufKosten) für den HUD-Hinweis', lg.c.freikaufKosten === 10);
}

// ---------------- F2 Input: Doppeltipp
{
  const I = new R.Input();
  const tippe = (code, haltMs) => { runter(code); jetztMs += haltMs || 40; hoch(code); };
  const pruefeDoppel = (nr) => I.rueckwaertsDoppel(nr);
  I.rueckwaertsDoppel(0); I.rueckwaertsDoppel(1);
  // 1) schneller Doppeltipp ↓
  tippe('ArrowDown'); jetztMs += 200; tippe('ArrowDown');
  pruefe('F2 ↓ ↓ in 0,28 s → Spieler 1 true (genau einmal)', pruefeDoppel(0) === true && pruefeDoppel(0) === false);
  pruefe('F2 … Spieler 2 nicht betroffen', pruefeDoppel(1) === false);
  // 2) zu langsam
  jetztMs += 2000; tippe('ArrowDown'); jetztMs += 700; tippe('ArrowDown');
  pruefe('F2 ↓ … 0,74 s … ↓ → false (zu langsam)', pruefeDoppel(0) === false);
  // 3) drei Tipps: erst zu langsam, dann schnell → der dritte zählt mit dem zweiten
  jetztMs += 300; tippe('ArrowDown');
  pruefe('F2 3. Tipp 0,3 s nach dem 2. → true', pruefeDoppel(0) === true);
  // 4) einzelner Tipp
  jetztMs += 2000; tippe('ArrowDown');
  pruefe('F2 einzelner Tipp → false', pruefeDoppel(0) === false);
  // 5) Spieler 2: S S
  jetztMs += 2000; tippe('KeyS'); jetztMs += 150; tippe('KeyS');
  pruefe('F2 S S in 0,2 s → Spieler 2 true, Spieler 1 false', pruefeDoppel(1) === true && pruefeDoppel(0) === false);
  // 6) Dach-Geste (Gas gehalten): ↑ gedrückt, ↓ ↓ → zählt nicht
  jetztMs += 2000; runter('ArrowUp'); tippe('ArrowDown'); jetztMs += 100; tippe('ArrowDown'); hoch('ArrowUp');
  pruefe('F2 mit gehaltenem Gas (↑+↓, T-Roc-Dach-Geste) → false', pruefeDoppel(0) === false);
  // 7) nach der Dach-Geste: Reihe wurde gelöscht → ein einzelner Tipp reicht nicht
  jetztMs += 100; tippe('ArrowDown');
  pruefe('F2 danach ein Tipp allein → false', pruefeDoppel(0) === false);
  // 8) andere Tasten
  jetztMs += 2000; tippe('ArrowLeft'); jetztMs += 100; tippe('ArrowLeft'); tippe('Space'); tippe('Space');
  pruefe('F2 andere Tasten (←, Leertaste) → false', pruefeDoppel(0) === false && pruefeDoppel(1) === false);
  // 9) Flag verfällt nach 1 s (wird sonst bei der nächsten Abfrage – auch ohne Polizei – verbraucht)
  jetztMs += 2000; tippe('ArrowDown'); jetztMs += 100; tippe('ArrowDown'); jetztMs += 1200;
  pruefe('F2 Doppeltipp wird 1,2 s später nicht mehr geliefert (verfallen)', pruefeDoppel(0) === false);
  jetztMs += 2000; tippe('ArrowDown'); jetztMs += 100; tippe('ArrowDown'); jetztMs += 400;
  pruefe('F2 Doppeltipp 0,4 s später (niedrige Bildrate) wird noch geliefert', pruefeDoppel(0) === true);
  // 10) Touch ▼: steuerung(0).bremse ohne Tastatur → Flanke über Abfrage
  jetztMs += 2000;
  const orig = I.steuerung.bind(I); let touchBremse = 0;
  I.steuerung = (nr) => { const s = orig(nr); return nr === 0 ? Object.assign({}, s, { bremse: Math.max(s.bremse, touchBremse) }) : s; };
  I.rueckwaertsDoppel(0);
  touchBremse = 1; I.rueckwaertsDoppel(0); jetztMs += 80; touchBremse = 0; I.rueckwaertsDoppel(0); jetztMs += 150; touchBremse = 1;
  const t2 = I.rueckwaertsDoppel(0); touchBremse = 0; I.rueckwaertsDoppel(0);
  pruefe('F2 Touch ▼ zweimal kurz → true', t2 === true);
  // 11) Touch ▼ gehalten (kein Doppeltipp)
  jetztMs += 2000; touchBremse = 1; let n = 0; for (let k = 0; k < 20; k++) { jetztMs += 50; if (I.rueckwaertsDoppel(0)) n++; } touchBremse = 0; I.rueckwaertsDoppel(0);
  pruefe('F2 Touch ▼ gehalten (1 s) → kein Doppeltipp', n === 0);
  // 12) Taste gehalten: keine Wiederholung durch Auto-Repeat (keydown ohne keyup)
  jetztMs += 2000; runter('ArrowDown'); for (let k = 0; k < 6; k++) { jetztMs += 40; runter('ArrowDown'); } hoch('ArrowDown');
  pruefe('F2 Taste gehalten (Auto-Repeat) → false', pruefeDoppel(0) === false);
  // Dach-Flanken unverändert: ↑ dann ↓ gleichzeitig gehalten meldet weiter die Dach-Geste
  const I2 = new R.Input(); runter('ArrowUp'); runter('ArrowDown');
  pruefe('F2 Dach-Geste ↑+↓ funktioniert weiterhin (dachGeste)', I.dachGeste(0, false) === true);
  hoch('ArrowUp'); hoch('ArrowDown');
}

// ---------------- F3 Server-Simulation
const S = require('../server/simulation.js');
{
  const { Simulation, laden } = S;
  const Rs = laden();
  const neu = () => new Simulation({ einstellungen: { streckeId: 'wiese', runden: 3, gegner: 0, tageszeit: 'tag', jahreszeit: 'sommer', wetter: 'klar', windStaerke: 0, polizei: true },
    spieler: [{ fahrer: 'Jonas', auto: 'porsche-911', hilfe: 'aus' }], seed: 77 });
  const sim = neu();
  for (let k = 0; k < 60 * 6; k++) sim.schritt();
  sim.abholen();
  const po = sim.sim.polizei;
  const anhalten = () => { const a = po.logik._a(0); a.stopp = 4; a.stoppK = 0; po.logik._s(0).phase = 'halt'; po.logik._s(0).ziel = 0; };
  sim.freikaufen(0);
  pruefe('F3 nicht angehalten: kein Ereignis, kein Abzug', sim.abholen().length === 0 && sim.sim.netzKonto[0] === 0);
  sim.kontoSetzen(0, 25);
  sim.freikaufen(0);
  pruefe('F3 nicht angehalten (Konto 25): nichts passiert, Konto bleibt 25', sim.sim.netzKonto[0] === 25 && sim.abholen().length === 0);
  anhalten();
  pruefe('F3 Vorbedingung: Auto ist angehalten', po.logik.gesperrt(0));
  sim.freikaufen(0);
  const ev1 = sim.abholen();
  pruefe('F3 freikaufen mit Konto 25: Konto 15, Stopp-Flag gesetzt', sim.sim.netzKonto[0] === 15);
  pruefe('F3 Ereignis freikauf (kosten 10, konto 15) + Meldung „💰 −10 – weiter!“', ev1.some(e => e.art === 'freikauf' && e.kosten === 10 && e.konto === 15 && e.an === 0) &&
    ev1.some(e => e.art === 'meldung' && /💰 −10 – weiter!/.test(e.text)), JSON.stringify(ev1));
  sim.schritt();
  const ev2 = sim.abholen();
  pruefe('F3 nach dem nächsten Schritt nicht mehr angehalten, KEINE zweite „Weiterfahren“-Meldung', !po.logik.gesperrt(0) && !ev2.some(e => e.art === 'meldung' && /Weiterfahren/.test(e.text)), JSON.stringify(ev2));
  anhalten(); sim.freikaufen(0); sim.abholen();
  pruefe('F3 zweites Freikaufen: Konto 5', sim.sim.netzKonto[0] === 5);
  sim.schritt(); sim.schritt();
  po.logik.autos[0].schonBis = -Infinity;
  anhalten();
  sim.freikaufen(0);
  const ev3 = sim.abholen();
  pruefe('F3 Konto 5: Meldung „Zu wenig Münzen (10 nötig)“, Stopp bleibt, Konto 5, kein freikauf', po.logik.gesperrt(0) && sim.sim.netzKonto[0] === 5 &&
    ev3.some(e => e.art === 'meldung' && e.text === 'Zu wenig Münzen (10 nötig)') && !ev3.some(e => e.art === 'freikauf'), JSON.stringify(ev3));
  sim.kontoSetzen(0, 10); sim.freikaufen(0); sim.abholen();
  pruefe('F3 genau 10 Münzen reichen (Konto 0 danach)', sim.sim.netzKonto[0] === 0);
  // Countdown: vor dem Start nicht möglich
  const sim2 = neu(); sim2.kontoSetzen(0, 50);
  const p2 = sim2.sim.polizei; const a = p2.logik._a(0); a.stopp = 4; a.stoppK = 0;
  sim2.freikaufen(0);
  pruefe('F3 im Countdown (Rennen nicht freigegeben): kein Freikaufen', sim2.sim.netzKonto[0] === 50 && p2.logik.gesperrt(0));
  // kontoSetzen mit falschem Index
  sim.kontoSetzen(5, 99); sim.kontoSetzen(-1, 99);
  pruefe('F3 kontoSetzen mit ungültigem Index wirkungslos', sim.sim.netzKonto.length === 1);
}

// ---------------- F4 WebSocket
const WebSocket = require(path.join(__dirname, '..', 'server', 'node_modules', 'ws'));
const { starten } = require('../server/server');
(async () => {
  const srv = await starten({ port: 0, host: '127.0.0.1', leise: true, tempo: 6, ladenMaxMs: 5000 });
  const warte = (ms) => new Promise(r => setTimeout(r, ms));
  class Client {
    constructor() {
      this.ws = new WebSocket('ws://127.0.0.1:' + srv.port + '/ws'); this.alle = []; this.warter = [];
      this.offen = new Promise((o, n) => { this.ws.on('open', o); this.ws.on('error', n); });
      this.ws.on('message', (d) => { let m; try { m = JSON.parse(d); } catch (e) { return; } if (m.t !== 'zustand') this.alle.push(m);
        this.warter = this.warter.filter(w => { if (w.t === m.t && w.f(m)) { clearTimeout(w.zeit); w.ok(m); return false; } return true; }); });
    }
    senden(o) { this.ws.send(JSON.stringify(o)); }
    auf(t, f, ms) { return new Promise((ok) => { const w = { t, f: f || (() => true), ok, zeit: setTimeout(() => { this.warter = this.warter.filter(x => x !== w); ok(null); }, ms || 3000) }; this.warter.push(w); }); }
  }
  const lauf = async (k) => {
    const c = new Client(); await c.offen;
    c.senden({ t: 'raumErstellen', fahrer: 'Jonas', auto: 'porsche-911', hilfe: 'aus', einstellungen: { streckeId: 'wiese', runden: 3, gegner: 0, polizei: true } });
    await c.auf('raum'); c.senden({ t: 'start' }); await c.auf('start', null, 5000);
    c.senden(k === undefined ? { t: 'geladen' } : { t: 'geladen', k });
    const raum = [...srv.raeume.values()].pop();
    // Countdown abwarten (Zeitraffer 6)
    for (let i = 0; i < 100 && !(raum.sim && raum.sim.sim.rennen && raum.sim.sim.rennen.gasErlaubt); i++) await warte(100);
    return { c, raum };
  };
  let n = 0;
  const eingabe = (c, extra) => { n++; c.senden(Object.assign({ t: 'eingabe', n: 1000 + n, g: 0, b: 100, l: 0 }, extra || {})); };
  for (const [name, k, soll] of [['k=25', 25, 15], ['ohne k', undefined, 0], ['k negativ', -50, 0], ['k Text', '99', 0], ['k riesig', 1e12, 99999 - 10], ['k Kommazahl', 25.5, 0]]) {
    const { c, raum } = await lauf(k);
    const po = raum.sim.sim.polizei;
    const a = po.logik._a(0); a.stopp = 4; a.stoppK = 0; po.logik._s(0).phase = 'halt'; po.logik._s(0).ziel = 0;
    const erg = c.auf('ereignis', (m) => m.art === 'freikauf' || (m.art === 'meldung' && /Zu wenig/.test(m.text)), 2000);
    eingabe(c, { f: 1 });
    const m = await erg;
    const hat = (soll === 0 && name !== 'k=25') ? (m && m.art === 'meldung') : (m && m.art === 'freikauf' && m.konto === soll);
    pruefe('F4 ' + name + ': ' + (soll ? 'freigekauft, Konto ' + soll : 'zu wenig Münzen'), !!hat, JSON.stringify(m));
    if (name === 'k=25') {
      await warte(200);
      pruefe('F4 Stopp danach beendet (Server)', !po.logik.gesperrt(0));
      // ohne Bit f passiert beim Bremsen nichts
      const a2 = po.logik._a(0); a2.schonBis = -Infinity; a2.stopp = 4; a2.stoppK = 0; po.logik._s(0).phase = 'halt';
      for (let i = 0; i < 20; i++) eingabe(c);
      await warte(200);
      pruefe('F4 ohne Bit f: Bremsen kauft nicht frei (Stopp läuft, Konto 15)', po.logik.gesperrt(0) && raum.sim.sim.netzKonto[0] === 15);
      eingabe(c, { f: '1' }); eingabe(c, { f: true }); eingabe(c, { f: 2 });
      await warte(200);
      pruefe('F4 f nur mit Zahl 1 gültig ("1", true, 2 ignoriert)', po.logik.gesperrt(0) && raum.sim.sim.netzKonto[0] === 15);
    }
    c.ws.terminate(); await warte(100);
  }
  await srv.schliessen();
  console.log(fehler ? '\n' + fehler + ' FEHLER von ' + geprueft : '\nALLE ' + geprueft + ' PRÜFUNGEN OK');
  process.exit(fehler ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
