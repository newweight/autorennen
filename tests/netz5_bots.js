// Hilfsskript für tests/online5_test.py: N Computer-Gäste (WebSocket) treten einem Raum bei, sind bereit und fahren per Autopilot.
// node tests/netz5_bots.js <port> <code> [anzahl=4]
'use strict';
const path = require('path');
const WebSocket = require(path.join(__dirname, '..', 'server', 'node_modules', 'ws'));
const { kontextLaden, laden } = require('../server/simulation');
const R = laden();
const C = kontextLaden(['vendor/three.min.js', 'src/config.js', 'src/physics/vehicle.js', 'src/physics/collisions.js', 'src/cars/carCatalog.js',
  'src/track/spline.js', 'src/track/trackCatalog.js', 'src/track/trackBuilder.js', 'src/track/looping.js', 'src/track/schanze.js', 'src/track/anlauf.js',
  'src/world/themes.js', 'src/world/schilder.js', 'src/world/wetter.js', 'src/world/kleber.js', 'src/world/polizei.js', 'src/net/protokoll.js', 'src/net/vorhersage.js']);
const [port, code, anzahl] = [process.argv[2], process.argv[3], +(process.argv[4] || 4)];
const autos = ['porsche-911', 'mini-cooper', 'multivan', 'bmw-m4', 'amg-gt', 'passat'];
function clientStrecke(e) {
  const daten = C.trackCatalog.find(t => t.id === e.streckeId);
  const st = new C.Strecke(daten, { welt: C.Strecke.weltName(daten, e.welt), variante: e.variante, hindernisMenge: e.hindernisMenge });
  const w = new C.Wetter(null, { jahreszeit: e.jahreszeit, wetter: e.wetter, wind: { staerke: e.windStaerke, richtung: e.windRichtung }, thema: daten.thema, seed: 1, strecke: st, tageszeit: e.tageszeit });
  C.Kurvenschilder.einbauen(st, e.tempoKlasse);
  C.Kollisionen.pflanzenSammeln(st, C.themes.dekoBauen(daten.thema, st, w.jahreszeit));
  C.Kollisionen.wracksEinbauen(st);
  return st;
}
function autopilot(st, v, idx) {
  const n = st.abfrage(v.x, v.z, idx), sp = st.spline;
  const vl = Math.max(3, v.vLaengs), L = Math.max(9, Math.min(50, 0.55 * vl + 8));
  const ziel = sp.punktBei(n.s + L);
  let diff = C.headingAus(ziel.x - v.x, ziel.z - v.z) - v.heading;
  while (diff > Math.PI) diff -= 2 * Math.PI;
  while (diff < -Math.PI) diff += 2 * Math.PI;
  const lenkung = Math.max(-1, Math.min(1, -(2 * vl * Math.sin(diff) / Math.hypot(ziel.x - v.x, ziel.z - v.z)) / v.drehrateMax(vl)));
  const soll = st.tempoBei(n.s + vl * 0.3) * 0.8;
  return { s: { gas: v.vLaengs < soll ? 1 : 0, bremse: v.vLaengs > soll + 3 ? 0.5 : 0, lenkung }, idx: n.index };
}
for (let b = 0; b < anzahl; b++) {
  const ws = new WebSocket('ws://127.0.0.1:' + port + '/ws');
  let n = 0, idx = -1, v = null, st = null, bereit = false;
  ws.on('open', () => ws.send(JSON.stringify({ t: 'raumBeitreten', code, fahrer: R.config.fahrer[b + 1].name, auto: autos[(b + 1) % autos.length], hilfe: 'wenig' })));
  ws.on('message', (d) => {
    let m; try { m = JSON.parse(d); } catch (e) { return; }
    if (m.t === 'lobby') { if (!bereit) { bereit = true; ws.send(JSON.stringify({ t: 'bereit', an: true })); } }
    else if (m.t === 'start') {
      st = clientStrecke(m.einstellungen);
      const auto = R.carCatalog.waehlbare().find(a => a.id === m.teilnehmer[m.du].autoId) || R.carCatalog.waehlbare()[0];
      v = new C.Vehicle(auto.fahrwerte, { tempoKlasse: m.einstellungen.tempoKlasse });
      setTimeout(() => ws.send(JSON.stringify({ t: 'geladen' })), 1500);
    } else if (m.t === 'zustand' && m.ich && v) {
      C.Netz.fahrzeugSchreiben(v, m.ich.v);
      const a = autopilot(st, v, idx); idx = a.idx;
      const k = C.Netz.eingabeKodieren(a.s);
      for (let i = 0; i < 3; i++) { n++; ws.send(JSON.stringify({ t: 'eingabe', n, g: k.g, b: k.b, l: k.l })); }
    } else if (m.t === 'ergebnis') { console.log('bot' + b + ' ergebnis'); setTimeout(() => ws.close(), 500); }
    else if (m.t === 'raumZu') ws.close();
  });
  ws.on('close', () => { if (b === 0) setTimeout(() => process.exit(0), 300); });
  ws.on('error', (e) => console.error('bot', b, e.message));
}
