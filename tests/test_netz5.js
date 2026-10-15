// 14.10. (v22) Online mit 5 Menschen: node tests/test_netz5.js
// 5 WebSocket-Clients (Host + 4 Gäste) + Computer-Autos: Lobby (5 Spieler, alle verschiedene Fahrer), Start (jeder bekommt eigene Nummer,
// Teilnehmerliste mit 5 Menschen, Startaufstellung ohne Überlappung), Rennen (alle fahren per Autopilot, Zustände mit allen Autos),
// Ergebnis für ALLE 5 (jeder Mensch mit Platz), 12-Autos-Grenze (5 Menschen + 7 Computer), 6. Mensch geht, 7. nicht.
'use strict';
const path = require('path');
const WebSocket = require(path.join(__dirname, '..', 'server', 'node_modules', 'ws'));
const { starten } = require('../server/server');
const { kontextLaden, laden } = require('../server/simulation');
let fehler = 0, ok = 0;
function pruefe(name, gut, info) { console.log((gut ? 'OK   ' : 'FEHL ') + name + (info !== undefined ? '  (' + info + ')' : '')); if (gut) ok++; else fehler++; }
const warte = (ms) => new Promise(r => setTimeout(r, ms));
const R = laden();
const C = kontextLaden(['vendor/three.min.js', 'src/config.js', 'src/physics/vehicle.js', 'src/physics/collisions.js', 'src/cars/carCatalog.js',
  'src/track/spline.js', 'src/track/trackCatalog.js', 'src/track/trackBuilder.js', 'src/track/looping.js', 'src/track/schanze.js', 'src/track/anlauf.js',
  'src/world/themes.js', 'src/world/schilder.js', 'src/world/wetter.js', 'src/world/kleber.js', 'src/world/polizei.js', 'src/net/protokoll.js', 'src/net/vorhersage.js']);

function clientStrecke(e) {
  const daten = C.trackCatalog.find(t => t.id === e.streckeId);
  const st = new C.Strecke(daten, { welt: C.Strecke.weltName(daten, e.welt), variante: e.variante, hindernisMenge: e.hindernisMenge });
  const w = new C.Wetter(null, { jahreszeit: e.jahreszeit, wetter: e.wetter, wind: { staerke: e.windStaerke, richtung: e.windRichtung }, thema: daten.thema, seed: 1, strecke: st, tageszeit: e.tageszeit });
  C.Kurvenschilder.einbauen(st, e.tempoKlasse);
  C.Kollisionen.pflanzenSammeln(st, C.themes.dekoBauen(daten.thema, st, w.jahreszeit));
  C.Kollisionen.wracksEinbauen(st);
  return { st, w };
}
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

(async () => {
  const srv = await starten({ port: 0, host: '127.0.0.1', leise: true, tempo: 6, ladenMaxMs: 8000 });
  class Client {
    constructor() {
      this.ws = new WebSocket('ws://127.0.0.1:' + srv.port + '/ws');
      this.alle = []; this.warter = []; this.zu = false; this.zustaende = 0;
      this.offen = new Promise((o, n) => { this.ws.on('open', o); this.ws.on('error', n); });
      this.ws.on('close', () => { this.zu = true; });
      this.ws.on('message', (d) => {
        let m; try { m = JSON.parse(d); } catch (e) { return; }
        if (m.t === 'zustand') { this.zustaende++; this.letzterZustand = m; if (this.beiZustand) this.beiZustand(m); } else this.alle.push(m);
        this.warter = this.warter.filter(w => { if (w.t === m.t && w.f(m)) { clearTimeout(w.zeit); w.ok(m); return false; } return true; });
      });
    }
    senden(o) { if (this.ws.readyState === 1) this.ws.send(JSON.stringify(o)); }
    auf(t, f, ms) { return new Promise((ok) => { const w = { t, f: f || (() => true), ok, zeit: setTimeout(() => { this.warter = this.warter.filter(x => x !== w); ok(null); }, ms || 3000) }; this.warter.push(w); }); }
    schliessen() { this.ws.terminate(); }
  }
  const autos = ['porsche-911', 'mini-cooper', 'multivan', 'bmw-m4', 'amg-gt', 'passat'];
  const cl = [];
  for (let i = 0; i < 5; i++) { const c = new Client(); await c.offen; cl.push(c); }
  const host = cl[0];
  host.senden({ t: 'raumErstellen', fahrer: R.config.fahrer[0].name, auto: autos[0], hilfe: 'viel',
    einstellungen: { streckeId: 'wiese', welt: 'klassisch', runden: 1, gegner: 7, schwierigkeit: 'leicht' } });
  const raum = await host.auf('raum');
  const code = raum.code;
  for (let i = 1; i < 5; i++) {
    cl[i].senden({ t: 'raumBeitreten', code, fahrer: R.config.fahrer[0].name, auto: autos[i], hilfe: 'wenig' });   // alle wollen denselben Fahrer
    await cl[i].auf('lobby');
  }
  await warte(150);
  const lob = host.alle.filter(m => m.t === 'lobby').pop();
  pruefe('N5 Lobby: 5 Spieler, alle Fahrer verschieden, 1 Host', lob.spieler.length === 5 && new Set(lob.spieler.map(s => s.fahrer)).size === 5 && lob.spieler.filter(s => s.istHost).length === 1,
    lob.spieler.map(s => s.fahrer).join('/'));
  pruefe('N5 Lobby meldet max 6 und Gegner-Obergrenze 12 − 5 = 7 (gegner 7 angenommen)', lob.max === 6 && lob.einstellungen.gegner === 7, 'max ' + lob.max + ', gegner ' + lob.einstellungen.gegner);
  host.senden({ t: 'start' });
  const f0 = await host.auf('fehler', null, 400);
  pruefe('N5 Start ohne „bereit“ der 4 Gäste → Fehler', !!f0 && f0.grund === 'nichtBereit');
  cl.slice(1).forEach(c => c.senden({ t: 'bereit', an: true }));
  await host.auf('lobby', (m) => m.spieler.every(s => s.bereit), 2000);
  host.senden({ t: 'start' });
  const starts = await Promise.all(cl.map(c => c.auf('start', null, 6000)));
  const s0 = starts[0];
  pruefe('N5 Start bei allen 5; du = 0..4 eindeutig', starts.every(Boolean) && starts.map(s => s.du).sort().join() === '0,1,2,3,4');
  pruefe('N5 Teilnehmer: 12 Autos, davon genau 5 Menschen mit verschiedenen Namen', s0.teilnehmer.length === 12 && s0.teilnehmer.filter(t => t.mensch).length === 5 &&
    new Set(s0.teilnehmer.map(t => t.name)).size === 12, s0.teilnehmer.map(t => (t.mensch ? '' : '🤖') + t.name).join(','));
  const { st } = clientStrecke(s0.einstellungen);
  const plaetze = st.startpositionen(12);
  let minAbst = 1e9;
  for (let i = 0; i < plaetze.length; i++) for (let j = i + 1; j < plaetze.length; j++) minAbst = Math.min(minAbst, Math.hypot(plaetze[i].x - plaetze[j].x, plaetze[i].z - plaetze[j].z));
  pruefe('N5 Startaufstellung 12 Plätze, kleinster Abstand ≥ 4,5 m (keine Überlappung)', plaetze.length === 12 && minAbst >= 4.5, minAbst.toFixed(2) + ' m');
  const fahrer = (c, auto) => {
    const v = new C.Vehicle(auto.fahrwerte, { tempoKlasse: s0.einstellungen.tempoKlasse });
    c.n = 0; c.idx = -1;
    c.beiZustand = (z) => {
      if (!z.ich) return;
      C.Netz.fahrzeugSchreiben(v, z.ich.v);
      const a = autopilot(st, v, c.idx); c.idx = a.idx;
      const k = C.Netz.eingabeKodieren(a.s);
      for (let i = 0; i < 3; i++) { c.n++; c.senden({ t: 'eingabe', n: c.n, g: k.g, b: k.b, l: k.l }); }
    };
  };
  cl.forEach((c, i) => fahrer(c, R.carCatalog.waehlbare().find(a => a.id === s0.teilnehmer[starts[i].du].autoId) || R.carCatalog.waehlbare()[0]));
  const ergs = cl.map(c => c.auf('ergebnis', null, 150000));
  cl.forEach(c => c.senden({ t: 'geladen' }));
  await warte(3000);
  const z = host.letzterZustand;
  pruefe('N5 Zustände enthalten alle 12 Autos', !!z && z.a.length === 12, z && z.a.length);
  pruefe('N5 jeder Mensch sieht sein „ich“ mit eigener Nummer', cl.every((c, i) => c.letzterZustand && c.letzterZustand.ich && c.letzterZustand.ich.nr === starts[i].du));
  const er = await Promise.all(ergs);
  pruefe('N5 Ergebnis kommt bei allen 5', er.every(Boolean));
  const e0 = er[0];
  const zeilen = e0 ? e0.zeilen : [];
  const menschen = zeilen.filter(zl => zl.mensch);
  pruefe('N5 Ergebnisliste: 12 Zeilen, alle 5 Menschen mit Platz und Zeit', zeilen.length === 12 && menschen.length === 5 && menschen.every(zl => zl.platz >= 1 && (zl.zeit > 0 || zl.zeit === 0 || zl.weg !== undefined)),
    JSON.stringify(menschen.map(zl => [zl.name, zl.platz, zl.zeit])));
  pruefe('N5 Ergebnis bei allen 5 gleich', er.every(e => e && JSON.stringify(e.zeilen) === JSON.stringify(e0.zeilen)));
  pruefe('N5 Plätze eindeutig 1..12', new Set(zeilen.map(zl => zl.platz)).size === 12);
  cl.forEach(c => c.schliessen());
  await warte(200);

  // 6. Mensch geht, 7. nicht; 12-Autos-Grenze mit 6 Menschen (gegner automatisch ≤ 6)
  const c6 = []; for (let i = 0; i < 7; i++) { const c = new Client(); await c.offen; c6.push(c); }
  c6[0].senden({ t: 'raumErstellen', fahrer: R.config.fahrer[0].name, auto: 'passat', hilfe: 'viel', einstellungen: { streckeId: 'wiese', runden: 1, gegner: 12 } });
  const r6 = await c6[0].auf('raum');
  for (let i = 1; i < 7; i++) c6[i].senden({ t: 'raumBeitreten', code: r6.code, fahrer: R.config.fahrer[i].name });
  const an = await Promise.all(c6.slice(1).map(c => Promise.race([c.auf('raum'), c.auf('fehler')])));
  const l6 = c6[0].alle.filter(m => m.t === 'lobby').pop();
  pruefe('N6 sechs Menschen im Raum, der siebte bekommt „voll“', an.filter(a => a && a.t === 'raum').length === 5 && an.filter(a => a && a.t === 'fehler' && a.grund === 'voll').length === 1);
  pruefe('N6 Gegner mit 6 Menschen auf 12 − 6 = 6 begrenzt', l6 && l6.einstellungen.gegner <= 6, l6 && l6.einstellungen.gegner);
  c6.forEach(c => c.schliessen());
  await srv.schliessen();
  console.log(`\n${ok} OK, ${fehler} FEHL`);
  process.exit(fehler ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
