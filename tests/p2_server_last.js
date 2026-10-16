// Phase 2: Server-Dauerlauf – Räume erstellen/verlassen im Takt (WebSocket-Clients, kein Browser).
// node tests/p2_server_dauer.js <port> <minuten> [seed]   Ausgabe: Zähler je Minute und am Ende (Räume erstellt/betreten/gestartet/verlassen/abrupt getrennt/Fehler).
'use strict';
const path = require('path');
const WebSocket = require(path.join(__dirname, '..', 'server', 'node_modules', 'ws'));
const [port, minuten, seed0] = [+process.argv[2], +process.argv[3] || 20, +process.argv[4] || 27];
let s = seed0 >>> 0; const rnd = () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const wahl = (a) => a[Math.floor(rnd() * a.length)];
const Z = { erstellt: 0, betreten: 0, gestartet: 0, ergebnis: 0, verlassen: 0, abrupt: 0, fehlerMsg: 0, offen: 0, wsFehler: 0, raumZu: 0 };
const fehlerGrund = {};
const strecken = ['wiese', 'wald', 'wueste', 'fantasie', 'dino', 'alpen', 'mega'];
const autos = ['porsche-911', 'mini-cooper', 'multivan', 'bmw-m4', 'amg-gt', 'passat', 'troc-cabrio'];
const fahrer = ['Löwe', 'Pinguin', 'Fuchs', 'Bär', 'Hase', 'Igel'];
function client(fn) {
  const ws = new WebSocket('ws://127.0.0.1:' + port + '/ws');
  const c = { ws, code: null, lobby: null, zu: false };
  ws.on('message', (d) => { let m; try { m = JSON.parse(d); } catch (e) { return; }
    if (m.t === 'fehler') { Z.fehlerMsg++; fehlerGrund[m.grund] = (fehlerGrund[m.grund] || 0) + 1; }
    if (m.t === 'raumZu') Z.raumZu++;
    if (m.t === 'ergebnis') Z.ergebnis++;
    fn(m, c); });
  ws.on('error', () => { Z.wsFehler++; });
  ws.on('close', () => { c.zu = true; });
  return c;
}
const senden = (c, o) => { if (c.ws.readyState === 1) c.ws.send(JSON.stringify(o)); };
function zyklus() {
  Z.offen++;
  const mitGast = rnd() < 0.7, startet = rnd() < 0.5, abrupt = rnd() < 0.3;
  const dauer = 1500 + rnd() * 5000;
  let gast = null;
  const host = client((m, c) => {
    if (m.t === 'raum' && m.host) { c.code = m.code; Z.erstellt++;
      senden(c, { t: 'einstellungen', einstellungen: { streckeId: wahl(strecken), runden: 1, gegner: Math.floor(rnd() * 4), tageszeit: wahl(['tag', 'daemmerung', 'nacht']), wetter: wahl(['klar', 'regen', 'schnee']), verkehr: wahl(['aus', 'wenig', 'viel']), polizei: rnd() < 0.5 } });
      if (mitGast) {
        gast = client((m2, c2) => {
          if (m2.t === 'raum') { Z.betreten++; senden(c2, { t: 'bereit', an: true }); }
          else if (m2.t === 'start') setTimeout(() => senden(c2, { t: 'geladen' }), 300);
        });
        gast.ws.on('open', () => senden(gast, { t: 'raumBeitreten', code: c.code, fahrer: fahrer[1], auto: wahl(autos), hilfe: 'wenig' }));
      }
      setTimeout(() => { if (startet) { senden(c, { t: 'start' }); Z.gestartet++; } }, 800 + rnd() * 600);
    } else if (m.t === 'start') setTimeout(() => senden(c, { t: 'geladen' }), 300);
  });
  host.ws.on('open', () => senden(host, { t: 'raumErstellen', fahrer: fahrer[0], auto: wahl(autos), hilfe: 'wenig', einstellungen: {} }));
  setTimeout(() => {
    for (const c of [gast, host]) { if (!c) continue;
      if (abrupt) { Z.abrupt++; try { c.ws.terminate(); } catch (e) {} } else { senden(c, { t: 'verlassen' }); Z.verlassen++; setTimeout(() => { try { c.ws.close(); } catch (e) {} }, 200); } }
    Z.offen--;
  }, dauer);
}
const ende = Date.now() + minuten * 60000;
let minute = 0;
const takt = setInterval(zyklus, 1500);
const proMin = setInterval(() => { minute++; console.log('MIN ' + minute + ' ' + JSON.stringify(Z)); }, 60000);
setTimeout(() => { clearInterval(takt); setTimeout(() => { clearInterval(proMin); console.log('ENDE ' + JSON.stringify(Z) + ' fehlerGrund=' + JSON.stringify(fehlerGrund)); setTimeout(() => process.exit(0), 500); }, 12000); }, ende - Date.now());
