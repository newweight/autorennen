// Radwelt R4-F Mehrspieler: node tests/test_radraum.js
// Startet server/server.js im selben Prozess (freier Port, verkürzte Zeiten) und prüft /ws-rad mit 2–9 simulierten Clients:
// Origin-Schutz, Raum erstellen/beitreten (Code, bis 8, voll, falscher Code, Bremse), Gastgeber-Rechte + Einstellungen, Bereit/Start, Laden → Countdown → los,
// Zustand 5×/s, Rangliste + Abstand s/m, Plausibilität (Watt, Tempo, Sprung, zurück, Disqualifikation), Ziel + Ergebnis, Reconnect (60 s → hier 0,8 s),
// Gastgeber-Wechsel, Bots vom Gastgeber, Raum schließt leer, Limits (Größe, Rate), Autorennen-/ws und /ws-brett unberührt.
// R6: Tailnet-Szenarien mit Tailnet-Adressen (100.x) – öffentliche Adressen gelten als „Internet“ (nur bei Schalter an, s. tests/test_rad_internet.js).
'use strict';
const path = require('path');
const WebSocket = require(path.join(__dirname, '..', 'server', 'node_modules', 'ws'));
const { starten } = require('../server/server');
const RadRaum = require('../server/radRaum');
let ok = 0, fehl = 0;
const pruefe = (n, g, i) => { console.log((g ? 'OK   ' : 'FEHL ') + n + (i !== undefined ? '  (' + (typeof i === 'object' ? JSON.stringify(i) : i) + ')' : '')); g ? ok++ : fehl++; };
const warte = (ms) => new Promise(r => setTimeout(r, ms));
const TEMPO = 10;

function verbinden(port, o) {
  o = o || {};
  return new Promise((res) => {
    const opt = { headers: {} }; if (o.origin) opt.origin = o.origin; if (o.host) opt.headers.Host = o.host; if (o.xff) opt.headers['X-Forwarded-For'] = o.xff; if (o.login) opt.headers['Tailscale-User-Login'] = o.login;
    const ws = new WebSocket('ws://127.0.0.1:' + port + (o.pfad || '/ws-rad'), opt);
    const c = { ws, nachr: [], zu: false };
    ws.on('message', d => { try { c.nachr.push(JSON.parse(d.toString())); } catch (e) { /* */ } });
    ws.on('close', (code) => { c.zu = true; c.zuCode = code; });
    ws.on('open', () => res(c));
    ws.on('unexpected-response', (req, r) => { c.abgewiesen = r.statusCode; res(c); });
    ws.on('error', () => { if (!c.abgewiesen) { c.fehler = true; res(c); } });
    c.senden = (x) => { if (ws.readyState === 1) ws.send(typeof x === 'string' ? x : JSON.stringify(x)); };
    c.warten = async (pred, ms) => { const t0 = Date.now(); for (;;) { const i = c.nachr.findIndex(pred); if (i >= 0) return c.nachr.splice(i, 1)[0]; if (Date.now() - t0 > (ms || 2500)) return null; await warte(5); } };
    c.typ = (t, ms) => c.warten(m => m.t === t, ms);
    c.lobby = async (ms) => { await warte(30); const l = c.nachr.filter(m => m.t === 'lobby'); c.nachr = c.nachr.filter(m => m.t !== 'lobby'); return l[l.length - 1] || await c.typ('lobby', ms); };
    c.stand = async () => { await warte(70); const l = c.nachr.filter(m => m.t === 'stand'); c.nachr = c.nachr.filter(m => m.t !== 'stand'); return l[l.length - 1] || await c.typ('stand'); };
  });
}

(async () => {
  const srv = await starten({ port: 0, host: '127.0.0.1', leise: true,
    radRaum: { countdownMs: 300, reconnectMs: 800, leerMs: 1200, aufraeumenMs: 100, taktMs: 50, staleMs: 3000, nachZielMs: 60000, tempo: TEMPO } });
  const port = srv.port;
  const offen = [];
  const neu = async (o) => { const c = await verbinden(port, o); offen.push(c); return c; };
  const neuAuf = async (pt, o) => { const c = await verbinden(pt, o); offen.push(c); return c; };

  // ---------------------------------------------------------------- Origin-Schutz
  {
    const ohne = await neu(); pruefe('ohne Origin (kein Browser) → verbunden + hallo', !ohne.abgewiesen && !!(await ohne.typ('hallo')));
    const lok = await neu({ origin: 'http://localhost:10100' }); pruefe('Origin http://localhost:10100 erlaubt', !lok.abgewiesen && !lok.fehler);
    const lok2 = await neu({ origin: 'http://127.0.0.1:10100' }); pruefe('Origin http://127.0.0.1:10100 erlaubt', !lok2.abgewiesen && !lok2.fehler);
    const gleich = await neu({ origin: 'http://127.0.0.1:' + port }); pruefe('gleiche Herkunft erlaubt', !gleich.abgewiesen && !gleich.fehler);
    const fremd = await neu({ origin: 'https://boese.example' }); pruefe('fremde Webseite abgewiesen (403)', fremd.abgewiesen === 403, fremd.abgewiesen);
    const port2 = await neu({ origin: 'http://localhost:9999' }); pruefe('localhost mit anderem Port abgewiesen', port2.abgewiesen === 403, port2.abgewiesen);
    const nul = await neu({ origin: 'null' }); pruefe('Origin "null" (file://) abgewiesen', nul.abgewiesen === 403, nul.abgewiesen);
    const tn = await neu({ origin: 'https://macbook.tail39c1c2.ts.net', host: 'mac-mini-von-sebastian.tail39c1c2.ts.net:10000' });
    pruefe('Seite im selben Tailnet erlaubt', !tn.abgewiesen && !tn.fehler, tn.abgewiesen);
    const tn2 = await neu({ origin: 'https://boese.tailfremd.ts.net', host: 'mac-mini-von-sebastian.tail39c1c2.ts.net:10000' });
    pruefe('Seite aus fremdem Tailnet abgewiesen', tn2.abgewiesen === 403, tn2.abgewiesen);
    const tn3 = await neu({ origin: 'http://macbook.tail39c1c2.ts.net', host: 'mac-mini-von-sebastian.tail39c1c2.ts.net:10000' });
    pruefe('Tailnet nur per https', tn3.abgewiesen === 403, tn3.abgewiesen);
    const og = RadRaum.originErlaubt;
    pruefe('originErlaubt: --oeffentlich als gleiche Herkunft', og({ headers: { origin: 'https://mini.tailx.ts.net:10000', host: '127.0.0.1:8444' } }, 'mini.tailx.ts.net:10000'));
    pruefe('originErlaubt: ftp:// nein', !og({ headers: { origin: 'ftp://localhost:10100', host: 'x' } }, ''));
    pruefe('originErlaubt: Zusatzliste (RADWELT_ORIGINS)', og({ headers: { origin: 'http://192.168.1.5:10100', host: 'x' } }, '', ['http://192.168.1.5:10100']));
    for (const c of [ohne, lok, lok2, gleich, tn]) c.ws.close();
  }

  // ---------------------------------------------------------------- Raum, Lobby, bis 8
  const optik = (i) => ({ g: i % 2 ? 'w' : 'm', haar: i, typ: 'rennrad', rahmen: i, akzent: 1, marke: 'Canyon', trikot: i, helm: i, ul: i === 3 });
  const host = await neu();
  host.senden({ t: 'erstellen', v: 2, name: 'Papa<script>', optik: optik(0), einst: { strecke: 'alpen', runden: 2, wind: 'mittel', windRichtung: 'zufall', realismus: 100, windschatten: true } });
  const raumH = await host.typ('raum');
  const code = raumH && raumH.code;
  pruefe('Raum erstellt: 4-stelliger Code ohne 0/O/1/I', !!code && /^[A-HJ-NP-Z2-9]{4}$/.test(code), code);
  pruefe('Gastgeber bekommt id + token (24)', raumH && raumH.host === true && /^[0-9a-f]{8}$/.test(raumH.id) && raumH.token.length === 24);
  let lb = await host.lobby();
  pruefe('Lobby: Gastgeber, Einstellungen übernommen', lb && lb.fahrer.length === 1 && lb.fahrer[0].host && lb.einst.strecke === 'alpen' && lb.einst.runden === 2 && lb.einst.realismus === 100, lb && lb.einst);
  pruefe('Name ohne <> gespeichert', lb && lb.fahrer[0].name === 'Papascript', lb && lb.fahrer[0].name);
  const gaeste = [];
  for (let i = 1; i < 8; i++) {
    const g = await neu(); g.senden({ t: 'beitreten', v: 2, code: code.toLowerCase(), name: i === 1 ? 'Papascript' : 'Fahrer ' + i, optik: optik(i) });
    const r = await g.typ('raum'); if (r) { g.id = r.id; g.token = r.token; }
    gaeste.push(g);
  }
  lb = await host.lobby();
  pruefe('8 Fahrer im Raum (Code klein geschrieben geht)', lb && lb.fahrer.length === 8, lb && lb.fahrer.length);
  pruefe('gleicher Name bekommt Nummer', lb && lb.fahrer.some(f => f.name === 'Papascript 2'));
  pruefe('Optik geprüft übertragen (Unterlenker, Indizes)', lb && lb.fahrer[3].optik.ul === true && lb.fahrer[2].optik.rahmen === 2);
  const neunter = await neu(); neunter.senden({ t: 'beitreten', v: 2, code, name: 'Neun' });
  const f9 = await neunter.typ('fehler'); pruefe('9. Fahrer: Raum voll', f9 && f9.grund === 'voll', f9);
  for (let i = 0; i < 5; i++) neunter.senden({ t: 'beitreten', v: 2, code: 'ZZZZ' });
  await warte(80); neunter.nachr = [];
  neunter.senden({ t: 'beitreten', v: 2, code: 'ZZZZ' }); const fz = await neunter.typ('fehler'); pruefe('5 falsche Codes → Bremse', fz && fz.grund === 'zu_schnell', fz);
  neunter.ws.close();

  // Gastgeber-Rechte
  gaeste[0].senden({ t: 'einstellungen', einst: { strecke: 'wald' } });
  const nh = await gaeste[0].typ('fehler'); pruefe('Gast darf Einstellungen nicht ändern', nh && nh.grund === 'nurHost');
  host.senden({ t: 'einstellungen', einst: { strecke: 'bauen', bau: { km: 500, anstiege: 3, hm: 300, maxSteig: 8, art: 'rund', seed: 4711 }, runden: 99, wind: 'orkan' } });
  lb = await host.lobby();
  pruefe('Einstellungen geprüft: gebaute Strecke (km ≤ 100, Seed), Runden ≤ 20, unbekannter Wind bleibt', lb && lb.einst.strecke === 'bauen' && lb.einst.bau.km === 100 && lb.einst.bau.seed === 4711 && lb.einst.runden === 20 && lb.einst.wind === 'mittel', lb && lb.einst);
  host.senden({ t: 'einstellungen', einst: { strecke: 'wiese', runden: 1, wind: 'mittel', windRichtung: 'zufall', windschatten: true } });
  lb = await host.lobby();
  pruefe('Einstellungen zurück auf Wiese/1 Runde', lb && lb.einst.strecke === 'wiese' && lb.einst.bau === null && lb.einst.runden === 1);
  // R5: GPX-Strecke im Mehrspieler → Fehlertext, Strecke bleibt
  host.senden({ t: 'einstellungen', einst: { strecke: 'gpx-0123456789abcdef', runden: 1, wind: 'mittel', windRichtung: 'zufall', windschatten: true } });
  const fg = await host.typ('fehler'); lb = await host.lobby();
  pruefe('GPX-Strecke: Fehlermeldung „GPX-Strecken gehen (noch) nicht im Mehrspieler“, Strecke bleibt Wiese', fg && fg.grund === 'gpx' && /GPX-Strecken gehen/.test(fg.text) && lb && lb.einst.strecke === 'wiese', fg);

  // Gastgeber-Bots (nur Platz bis 8 → hier 0)
  host.senden({ t: 'bots', liste: [{ name: 'Merckx', optik: optik(5) }] });
  lb = await host.lobby(); pruefe('Bots nur bis 8 Fahrer insgesamt (voll → keine)', lb && lb.fahrer.filter(f => f.bot).length === 0);

  // Start erst, wenn alle bereit
  host.senden({ t: 'start' });
  const nb = await host.typ('fehler'); pruefe('Start ohne „bereit“ abgelehnt', nb && nb.grund === 'nichtBereit');
  gaeste[0].senden({ t: 'start' }); const ns = await gaeste[0].typ('fehler'); pruefe('Gast darf nicht starten', ns && ns.grund === 'nurHost');

  // 5 Gäste verlassen → 3 Menschen; dann Bots
  for (const g of gaeste.slice(2)) { g.senden({ t: 'verlassen' }); }
  await warte(100);
  lb = await host.lobby(); pruefe('Verlassen in der Lobby entfernt Fahrer', lb && lb.fahrer.length === 3, lb && lb.fahrer.length);
  host.senden({ t: 'bots', liste: [{ name: 'Merckx', optik: optik(5) }, { name: 'Pantani' }, { name: 'X' }, { name: 'Y' }, { name: 'Z' }, { name: 'Q' }] });
  lb = await host.lobby();
  pruefe('Bots vom Gastgeber: bis 8 insgesamt (3 Menschen + 5 Bots)', lb && lb.fahrer.filter(f => f.bot).length === 5 && lb.fahrer.length === 8, lb && lb.fahrer.length);
  pruefe('Bot-Name mit 🤖', lb && lb.fahrer.some(f => f.bot && f.name === '🤖 Merckx'));
  host.senden({ t: 'bots', liste: [{ name: 'Merckx', optik: optik(5) }] });
  lb = await host.lobby(); pruefe('Bots ändern (1 Bot)', lb && lb.fahrer.filter(f => f.bot).length === 1);
  gaeste[1].senden({ t: 'bots', liste: [{ name: 'B' }] }); const nbo = await gaeste[1].typ('fehler'); pruefe('Gast darf keine Bots melden', nbo && nbo.grund === 'nurHost');

  // ---------------------------------------------------------------- Rennen: 3 Menschen + 1 Bot
  const [g1, g2] = gaeste;
  g1.senden({ t: 'bereit', an: true }); g2.senden({ t: 'bereit', an: true });
  await warte(60); host.nachr = []; g1.nachr = []; g2.nachr = [];
  host.senden({ t: 'start' });
  const ld = await g1.typ('laden');
  pruefe('laden: Einstellungen an alle, Windrichtung ausgewürfelt', ld && ld.einst.strecke === 'wiese' && ld.einst.windRichtung !== 'zufall' && ld.einst.wind === 'mittel', ld && ld.einst);
  const ld2 = await host.typ('laden'); pruefe('laden: gleiche Windrichtung für alle', ld2 && ld && ld2.einst.windRichtung === ld.einst.windRichtung);
  const ZIEL = 2400;
  for (const c of [host, g1, g2]) c.senden({ t: 'geladen', L: 600, zielM: ZIEL, fp: 'abc', app: 'r4f2' });
  const cd = await g2.typ('countdown'); pruefe('Countdown nach „alle geladen“, Zielstrecke vom Gastgeber', cd && cd.ms === 300 && cd.zielM === ZIEL, cd);
  const los = await g2.typ('los', 2000); pruefe('los nach Countdown', !!los);
  // Fahren: 5×/s (bei Tempo 10 → je Nachricht 10× weiter), host 12 m/s, g1 10 m/s, g2 8 m/s, Bot 11 m/s
  const v = { host: 12, g1: 10, g2: 8, bot: 11 }, d = { host: 0, g1: 0, g2: 0, bot: 0 };
  let tick = 0, verstossGesendet = false;
  const fahren = setInterval(() => {
    tick++;
    for (const [n, c] of [['host', host], ['g1', g1], ['g2', g2]]) {
      d[n] += v[n] * 0.2 * TEMPO;
      const m = { t: 'z', d: d[n], s: d[n] % 600, r: 1, v: v[n], w: 200 + v[n] * 5, wkg: 2.8, q: 0.2, k: 88 };
      if (n === 'host') { d.bot += v.bot * 0.2 * TEMPO; m.bots = [{ d: d.bot, s: d.bot % 600, r: 1, v: v.bot, w: 250, wkg: 3.5, q: -0.5, k: 90 }]; }
      c.senden(m);
    }
  }, 200);
  await warte(1050);
  const st = await g1.stand();
  const reihe = st ? st.fahrer.map(f => f.id) : [];
  const idH = raumH.id, botId = st && (st.fahrer.find(f => f.bot) || {}).id;
  pruefe('stand: alle 4 Fahrer (inkl. Bot)', st && st.fahrer.length === 4, st && st.fahrer.length);
  pruefe('Rangliste nach Weg: Gastgeber, Bot, g1, g2', st && reihe.join() === [idH, botId, g1.id, g2.id].join(), st && st.fahrer.map(f => f.d));
  const fg2 = st && st.fahrer.find(f => f.id === g2.id), fh = st && st.fahrer.find(f => f.id === idH);
  pruefe('Abstand in m = Wegdifferenz', fg2 && Math.abs(fg2.gm - (fh.d - fg2.d)) < 0.2, fg2 && [fg2.gm, fh.d - fg2.d]);
  const erwS = fg2 ? (fh.d - fg2.d) / (v.host * TEMPO) : 0;
  pruefe('Abstand in s ≈ Wegdifferenz / Tempo des Ersten', fg2 && fg2.gs > 0 && Math.abs(fg2.gs - erwS * TEMPO) < 0.4 * TEMPO, fg2 && [fg2.gs, erwS * TEMPO]);
  pruefe('stand: Platz, Watt, W/kg, Spur, Kadenz', fh && fh.platz === 1 && fh.w === 260 && fh.wkg === 2.8 && fh.q === 0.2 && fh.k === 88);

  // Plausibilität (Gast g2 schickt Unsinn, dann wieder normal)
  g2.nachr = [];
  g2.senden({ t: 'z', d: d.g2 + 1, s: 0, r: 1, v: 8, w: 3000, wkg: 3 });
  let w = await g2.typ('warnung'); pruefe('> 2500 W → Warnung, nicht übernommen', w && w.grund === 'watt', w);
  await warte(3100);
  g2.senden({ t: 'z', d: d.g2 + 1, s: 0, r: 1, v: 30, w: 200, wkg: 3 });
  w = await g2.typ('warnung'); pruefe('> 100 km/h → Warnung', w && w.grund === 'tempo', w);
  await warte(3100);
  g2.senden({ t: 'z', d: d.g2 + 4000, s: 0, r: 1, v: 8, w: 200, wkg: 3 });
  w = await g2.typ('warnung'); pruefe('Sprung nach vorn → Warnung', w && w.grund === 'sprung', w);
  const st2 = await g1.stand(); const g2d = st2 && st2.fahrer.find(f => f.id === g2.id);
  pruefe('Sprung nicht übernommen', g2d && g2d.d < d.g2 + 100, g2d && [g2d.d, d.g2]);
  void verstossGesendet;

  // Reconnect: g1 trennt, kommt mit id/token zurück
  g1.ws.terminate();
  await warte(150);
  const st3 = await host.stand(); pruefe('getrennter Fahrer: online=false', st3 && st3.fahrer.find(f => f.id === g1.id).on === false);
  const g1b = await neu(); g1b.senden({ t: 'wieder', code, id: g1.id, token: 'x'.repeat(24) });
  pruefe('falsches Token → wiederNein', !!(await g1b.typ('wiederNein')));
  g1b.senden({ t: 'wieder', code, id: g1.id, token: g1.token });
  const wd = await g1b.typ('raum'); pruefe('Reconnect mit gleicher ID innerhalb der Frist', wd && wd.wieder === true && wd.id === g1.id && wd.zustand === 'fahrt', wd);
  const altG1 = g1; gaeste[0] = g1b; g1b.id = g1.id;
  // weiterfahren mit g1b
  clearInterval(fahren);
  const fahren2 = setInterval(() => {
    for (const [n, c] of [['host', host], ['g1', g1b], ['g2', g2]]) {
      d[n] += v[n] * 0.2 * TEMPO;
      const m = { t: 'z', d: d[n], s: d[n] % 600, r: 1, v: v[n], w: 200, wkg: 2.8, q: 0, k: 85 };
      if (n === 'host') { d.bot += v.bot * 0.2 * TEMPO; m.bots = [{ d: d.bot, s: d.bot % 600, r: 1, v: v.bot, w: 250, wkg: 3.5, q: 0 }]; }
      c.senden(m);
    }
  }, 200);
  // Ziel: host (12 m/s ×10 → 600 m in 5 s)
  const erg = await host.typ('ergebnis', 40000);
  clearInterval(fahren2);
  pruefe('Ergebnis, wenn alle im Ziel', erg && erg.grund === 'alleImZiel', erg && erg.grund);
  const ids = erg ? erg.liste.map(x => x.id) : [];
  pruefe('Ergebnis-Reihenfolge nach Zielzeit: Gastgeber, Bot, g1, g2', ids.join() === [idH, botId, g1b.id, g2.id].join(), erg && erg.liste.map(x => [x.name, x.zeit]));
  const e1 = erg && erg.liste[0], e4 = erg && erg.liste[3];
  pruefe('Zielzeit (Rennuhr) ≈ 2400 m / 12 m/s = 200 s (±5 %, Zeitraffer 10× unter Last)', e1 && Math.abs(e1.zeit - ZIEL / v.host) < 10, e1 && e1.zeit);
  pruefe('Abstand des Letzten in s = Zielzeitdifferenz', e4 && Math.abs(e4.gs - (e4.zeit - e1.zeit)) < 0.01 && e4.gs > 10, e4 && [e4.gs, e4.zeit]);
  pruefe('Ø Watt im Ergebnis', e1 && e1.avgW >= 200 && e1.avgW <= 262, e1 && e1.avgW);
  pruefe('alle Status „ziel“', erg && erg.liste.every(x => x.status === 'ziel'));
  const ergG = await g2.typ('ergebnis'); pruefe('Ergebnis auch beim Gast', !!ergG);
  void altG1;

  // Nach Ergebnis: zurück in die Lobby, zweites Rennen mit Disqualifikation, Aufgeben, Reconnect-Frist
  host.senden({ t: 'zurLobby' });
  lb = await host.lobby(); pruefe('Gastgeber: zurück in die Lobby', lb && lb.zustand === 'lobby');
  g1b.senden({ t: 'bereit' }); g2.senden({ t: 'bereit', an: true }); await warte(60);
  host.senden({ t: 'start' });
  // Start-Bremse 2 s
  let ld3 = await host.typ('laden', 300);
  if (!ld3) { await warte(2000); host.senden({ t: 'start' }); ld3 = await host.typ('laden'); }
  pruefe('2. Rennen startet', !!ld3);
  for (const c of [host, g1b, g2]) c.senden({ t: 'geladen', L: 600, zielM: 2000, fp: 'abc', app: 'r4f2' });
  await g2.typ('los', 3000);
  // g2: 15 Verstöße → disqualifiziert; g1b: trennt und kommt nicht wieder → raus; Gastgeber gibt auf (fertig)
  for (let i = 0; i < 16; i++) g2.senden({ t: 'z', d: 1, s: 0, r: 1, v: 5, w: 9999, wkg: 2 });
  await warte(150);
  g1b.senden({ t: 'z', d: 30, s: 30, r: 1, v: 9, w: 180, wkg: 2.5, q: 0 });
  await warte(100);
  g1b.ws.terminate();
  host.senden({ t: 'z', d: 50, s: 50, r: 1, v: 9, w: 180, wkg: 2.5, q: 0, bots: [{ d: 40, s: 40, r: 1, v: 8, w: 150, wkg: 2 }] });
  const st4 = await host.stand(); const g2s = st4 && st4.fahrer.find(f => f.id === g2.id);
  pruefe('15 Verstöße → disqualifiziert, ans Ende', g2s && g2s.dq === true && st4.fahrer[st4.fahrer.length - 1].id === g2.id, st4 && st4.fahrer.map(f => [f.dq, f.raus]));
  await warte(1100);       // > reconnectMs (0,8 s)
  const st5 = await host.stand(); const g1s = st5 && st5.fahrer.find(f => f.id === g1b.id);
  pruefe('nach Reconnect-Frist: getrennter Fahrer „raus“', g1s && g1s.raus === true, g1s);
  const g1c = await neu(); g1c.senden({ t: 'wieder', code, id: g1b.id, token: g1.token });
  const wd2 = await g1c.typ('raum', 500); pruefe('Reconnect nach Frist: Platz bleibt raus (Ergebnisliste), keine Wiederaufnahme ins Rennen', !wd2 || (wd2.du && wd2.du.raus === true), wd2 && wd2.du);
  g1c.ws.close();
  host.senden({ t: 'z', d: 60, s: 60, r: 1, v: 0, w: 0, wkg: 0, q: 0, fertig: true, bots: [{ d: 50, s: 50, r: 1, v: 0, w: 0, wkg: 0, fertig: true }] });
  const erg2 = await host.typ('ergebnis', 3000);
  pruefe('Ergebnis, wenn niemand mehr fährt (Aufgabe/raus/dq)', erg2 && erg2.liste.length === 4, erg2 && erg2.liste.map(x => x.status));
  pruefe('Status: raus/raus/raus/dq', erg2 && erg2.liste.map(x => x.status).join() === 'raus,raus,raus,dq', erg2 && erg2.liste.map(x => x.status));

  // Gastgeber geht in der Lobby → Gastgeber wechselt, Bots fallen weg
  host.senden({ t: 'zurLobby' }); await host.lobby();
  host.senden({ t: 'verlassen' });
  lb = await g2.lobby();
  pruefe('Gastgeber verlässt Raum → g2 wird Gastgeber, Bots weg', lb && lb.hostId === g2.id && lb.fahrer.every(f => !f.bot), lb && [lb.hostId, lb.fahrer.length]);

  // Raum schließt nach „leer“ (hier 1,2 s)
  g2.ws.terminate();
  await warte(400);
  pruefe('Raum bleibt kurz bestehen (Reconnect möglich)', srv.radRaum.raeume.has(code));
  await warte(1300);
  pruefe('Raum ohne verbundene Fahrer schließt nach Frist', !srv.radRaum.raeume.has(code));

  // ---------------------------------------------------------------- Limits
  {
    const gross = await neu(); gross.senden({ t: 'hallo', x: 'a'.repeat(7000) }); await warte(150);
    pruefe('Nachricht > 6 KB → Verbindung zu', gross.zu === true, gross.zuCode);
    const flut = await neu(); for (let i = 0; i < 300; i++) flut.senden({ t: 'ping' }); await warte(200);
    pruefe('> 250 Nachrichten/s → getrennt', flut.zu === true);
    const kaputt = await neu(); kaputt.senden('{kein json'); const fj = await kaputt.typ('fehler'); pruefe('kaputtes JSON → Fehler', fj && fj.grund === 'json');
    kaputt.senden({ t: 'z', d: 1 }); const fk = await kaputt.typ('fehler'); pruefe('Zustand ohne Raum → keinRaum', fk && fk.grund === 'keinRaum');
    kaputt.ws.close();
    const ra = []; for (let i = 0; i < 5; i++) { const c = await neu(); c.senden({ t: 'erstellen', v: 2, name: 'R' + i }); ra.push(c); }
    await warte(100);
    pruefe('mehrere Räume parallel', srv.radRaum.raeume.size >= 5, srv.radRaum.raeume.size);
    ra.forEach(c => c.ws.close());
  }

  // ---------------------------------------------------------------- Autorennen /ws und /ws-brett unberührt
  {
    const auto = await neu({ pfad: '/ws' }); auto.senden({ t: 'hallo' }); const ah = await auto.typ('hallo');
    pruefe('Autorennen /ws antwortet wie bisher (hallo + Version)', ah && typeof ah.v === 'number' && typeof ah.id === 'string', ah);
    auto.senden({ t: 'raumErstellen' }); const ar = await auto.typ('raum'); pruefe('Autorennen-Raum erstellen geht', ar && /^[A-Z2-9]{4}$/.test(ar.code));
    pruefe('Autorennen-Räume getrennt von Radwelt-Räumen', srv.raeume.has(ar.code) && !srv.radRaum.raeume.has(ar.code));
    const auto2 = await neu({ pfad: '/ws', origin: 'https://boese.example' }); pruefe('Autorennen /ws: Origin-Regel unverändert (kein 403)', !auto2.abgewiesen);
    const brett = await neu({ pfad: '/ws-brett' }); brett.senden({ t: 'hallo' }); const bh = await brett.typ('hallo'); pruefe('/ws-brett antwortet wie bisher', bh && Array.isArray(bh.spiele));
    const falsch = await neu({ pfad: '/ws-radx' }); pruefe('unbekannter Pfad → 404', falsch.abgewiesen === 404, falsch.abgewiesen);
    [auto, auto2, brett].forEach(c => c.ws.close());
  }

  // ================================================================ R4-F2 (Gegenlesen)
  {
    // Version
    const alt = await neu(); alt.senden({ t: 'erstellen', name: 'Alt' }); const fv = await alt.typ('fehler');
    pruefe('F2 #1 erstellen ohne passende Version → Fehler „version“', fv && fv.grund === 'version', fv);
    alt.senden({ t: 'beitreten', v: 1, code: 'ABCD' }); const fv2 = await alt.typ('fehler'); pruefe('F2 #1 beitreten mit alter Version → Fehler „version“', fv2 && fv2.grund === 'version');
    pruefe('F2 hallo meldet Version 2', RadRaum.VERSION === 2);

    // Origin: DNS-Rebinding (fremder Name als Host) → 403; IP-Adresse als Host (Heimnetz) → erlaubt
    const reb = await neu({ origin: 'http://angreifer.example:8444', host: 'angreifer.example:8444' }); pruefe('F2 #4 DNS-Rebinding (Origin = Host = fremder Name) → 403', reb.abgewiesen === 403, reb.abgewiesen);
    const lan = await neu({ origin: 'http://192.168.1.5:8444', host: '192.168.1.5:8444' }); pruefe('F2 #4 gleiche Herkunft über IP-Adresse (Heimnetz) erlaubt', !lan.abgewiesen && !lan.fehler);
    lan.ws.close();
    const AS = RadRaum.adressSchluessel;
    pruefe('F2 #3 X-Forwarded-For nur vom lokalen Proxy: fremde Quelle → Socket-Adresse', AS({ socket: { remoteAddress: '192.168.1.9' }, headers: { 'x-forwarded-for': '1.2.3.4' } }) === 'ip:192.168.1.9');
    pruefe('F2 #3 vom lokalen Proxy: X-Forwarded-For zählt (R6: der LETZTE Eintrag – den setzt der Proxy)', AS({ socket: { remoteAddress: '127.0.0.1' }, headers: { 'x-forwarded-for': '100.101.1.2, 1.1.1.1' } }) === 'ip:1.1.1.1');
    pruefe('R6 eingeschmuggelter X-Forwarded-For-Eintrag zählt nicht', AS({ socket: { remoteAddress: '127.0.0.1' }, headers: { 'x-forwarded-for': '6.6.6.6, 203.0.113.7', 'tailscale-funnel-request': '?1' } }) === 'ip:203.0.113.7');
    pruefe('R6 Funnel: Identitäts-Header wird ignoriert', AS({ socket: { remoteAddress: '127.0.0.1' }, headers: { 'tailscale-user-login': 'papa@example.com', 'x-forwarded-for': '203.0.113.7', 'tailscale-funnel-request': '?1' } }) === 'ip:203.0.113.7');
    pruefe('F2 #2 Tailnet-Identität als Schlüssel', AS({ socket: { remoteAddress: '::1' }, headers: { 'tailscale-user-login': 'papa@example.com', 'x-forwarded-for': '100.1.1.1' } }) === 'id:papa@example.com');
    pruefe('F2 lokal ohne Header → „lokal“', AS({ socket: { remoteAddress: '127.0.0.1' }, headers: {} }) === 'lokal');

    // Räume je Adresse (3)
    const rr = [];
    for (let i = 0; i < 4; i++) { const c = await neu({ xff: '100.99.9.9' }); c.senden({ t: 'erstellen', v: 2, name: 'X' + i }); rr.push(c); }
    const rOk = []; for (const c of rr) rOk.push(await c.warten(m => m.t === 'raum' || m.t === 'fehler'));
    pruefe('F2 #3 höchstens 3 Räume je Adresse', rOk.slice(0, 3).every(m => m && m.t === 'raum') && rOk[3] && rOk[3].t === 'fehler' && rOk[3].grund === 'voll', rOk.map(m => m && (m.grund || m.t)));
    rr.forEach(c => c.ws.close());

    // Code-Raten je Adresse (über mehrere Verbindungen), exponentiell
    const ra = [];
    for (let i = 0; i < 5; i++) { const c = await neu({ xff: '100.77.7.7' }); c.senden({ t: 'beitreten', v: 2, code: 'ZZZZ' }); await c.typ('fehler'); ra.push(c); }
    const r6 = await neu({ xff: '100.77.7.7' }); r6.senden({ t: 'beitreten', v: 2, code: 'ZZZZ' }); const f6 = await r6.typ('fehler');
    pruefe('F2 #2 Sperre gilt je Adresse, auch über neue Verbindungen', f6 && f6.grund === 'zu_schnell', f6 && f6.text);
    const anders = await neu({ xff: '100.88.8.8' }); anders.senden({ t: 'beitreten', v: 2, code: 'ZZZZ' }); const fa = await anders.typ('fehler');
    pruefe('F2 #2 andere Adresse nicht betroffen', fa && fa.grund === 'unbekannt');
    await warte(1100); r6.senden({ t: 'beitreten', v: 2, code: 'ZZZZ' }); await r6.typ('fehler');
    r6.senden({ t: 'beitreten', v: 2, code: 'ZZZZ' }); const f7 = await r6.typ('fehler');
    pruefe('F2 #2 exponentiell: nach weiterem Fehlversuch 2 s Sperre', f7 && f7.grund === 'zu_schnell' && /2 s/.test(f7.text), f7 && f7.text);
    ra.concat([r6, anders]).forEach(c => c.ws.close());

    // Rauswerfen + Sperren + wieder auf fremdem Platz
    const h = await neu(); h.senden({ t: 'erstellen', v: 2, name: 'Host', einst: { strecke: 'wiese', runden: 1 } }); const hr = await h.typ('raum');
    const gA = await neu({ xff: '100.65.5.5' }); gA.senden({ t: 'beitreten', v: 2, code: hr.code, name: 'A' }); const ar = await gA.typ('raum');
    const gB = await neu(); gB.senden({ t: 'beitreten', v: 2, code: hr.code, name: 'B' }); const br = await gB.typ('raum');
    gA.senden({ t: 'rauswerfen', id: br.id }); const nk = await gA.typ('fehler'); pruefe('F2 #2 nur der Gastgeber darf rauswerfen', nk && nk.grund === 'nurHost');
    h.senden({ t: 'rauswerfen', id: ar.id }); const zu = await gA.typ('raumZu');
    pruefe('F2 #2 Gastgeber wirft Mitfahrer raus', zu && zu.grund === 'rausgeworfen');
    let lb2 = await h.lobby(); pruefe('F2 #2 Rausgeworfener nicht mehr in der Lobby', lb2 && !lb2.fahrer.some(x => x.id === ar.id));
    const gA2 = await neu({ xff: '100.65.5.5' }); gA2.senden({ t: 'beitreten', v: 2, code: hr.code, name: 'A' }); const fk = await gA2.typ('fehler');
    pruefe('F2 #2 Rausgeworfener kommt mit dem Code nicht wieder rein', fk && fk.grund === 'gesperrt', fk);
    h.senden({ t: 'sperren', an: true }); lb2 = await h.lobby(); pruefe('F2 #2 Raum sperren', lb2 && lb2.gesperrt === true);
    const gC = await neu(); gC.senden({ t: 'beitreten', v: 2, code: hr.code, name: 'C' }); const fc = await gC.typ('fehler'); pruefe('F2 #2 gesperrter Raum: kein Beitritt', fc && fc.grund === 'gesperrt');
    gB.ws.terminate(); await warte(100);
    const gB2 = await neu(); gB2.senden({ t: 'wieder', code: hr.code, id: br.id, token: br.token }); const wb = await gB2.typ('raum'); pruefe('F2 #2 gesperrt: Reconnect geht trotzdem', wb && wb.wieder);
    h.senden({ t: 'sperren', an: false }); await h.lobby();
    // #16 wieder auf einem Socket, der schon einen anderen Platz hat
    const gD = await neu(); gD.senden({ t: 'beitreten', v: 2, code: hr.code, name: 'D' }); const dr = await gD.typ('raum'); await warte(50);
    gD.senden({ t: 'wieder', code: hr.code, id: br.id, token: br.token }); await gD.typ('raum'); lb2 = await h.lobby();
    pruefe('F2 #16 wieder auf fremdem Platz: alter Platz wird abgegeben', lb2 && !lb2.fahrer.some(x => x.id === dr.id) && lb2.fahrer.find(x => x.id === br.id).online, lb2 && lb2.fahrer.map(x => x.name));
    [h, gA, gA2, gB2, gC, gD].forEach(c => c.ws.close());
  }

  // ---------------------------------------------------------------- F2: zweiter Server (kurze Fristen) – Abgleich, stale/getrennt zurück, Ziel bei „fertig“, Simulator, Laufzeit
  {
    const s2 = await starten({ port: 0, host: '127.0.0.1', leise: true, brett: {}, radRaum: { countdownMs: 200, reconnectMs: 400, leerMs: 5000, aufraeumenMs: 50, taktMs: 50, staleMs: 300, tempo: 1 } });
    const p2 = s2.port;
    const H = await neuAuf(p2), A = await neuAuf(p2), B2 = await neuAuf(p2), C = await neuAuf(p2), D = await neuAuf(p2);
    H.senden({ t: 'erstellen', v: 2, app: 'r4f2', name: 'H', einst: { strecke: 'wiese', runden: 1 } }); const hr = await H.typ('raum');
    const ids = {};
    for (const [n, c] of [['A', A], ['B', B2], ['C', C], ['D', D]]) { c.senden({ t: 'beitreten', v: 2, app: n === 'C' ? 'r4alt' : 'r4f2', code: hr.code, name: n }); ids[n] = (await c.typ('raum')).id; c.senden({ t: 'bereit', an: true }); }
    await warte(80); H.senden({ t: 'start' }); await A.typ('laden');
    H.senden({ t: 'geladen', L: 30, zielM: 30, fp: 'f00d', app: 'r4f2', sim: false });
    A.senden({ t: 'geladen', L: 30, zielM: 30, fp: 'f00d', app: 'r4f2', sim: true });
    B2.senden({ t: 'geladen', L: 29, zielM: 29, fp: 'beef', app: 'r4f2' });
    C.senden({ t: 'geladen', L: 30, zielM: 30, fp: 'f00d', app: 'r4alt' });
    D.senden({ t: 'geladen', L: 30, zielM: 30, fp: 'f00d', app: 'r4f2' });
    const cd = await A.typ('countdown'); pruefe('F2 #1 Countdown trägt Länge, Fingerabdruck und Version des Gastgebers', cd && cd.zielM === 30 && cd.L === 30 && cd.fp === 'f00d' && cd.app === 'r4f2', cd);
    const abB = await B2.typ('abweichung'); pruefe('F2 #1 andere Strecke erkannt (vor dem Countdown) + klare Meldung', abB && abB.grund === 'strecke' && /bitte aktualisieren/.test(abB.text), abB);
    const abC = await C.typ('abweichung'); pruefe('F2 #1 andere Radwelt-Version erkannt', abC && abC.grund === 'version', abC);
    pruefe('F2 #1 passende Fahrer bekommen keine Abweichung', !(await A.typ('abweichung', 150)) && !(await D.typ('abweichung', 50)));
    await A.typ('los', 1500);
    let st = await A.stand();
    pruefe('F2 #1 Abweichler fahren nicht mit (raus, Grund abweichung)', st && st.fahrer.find(x => x.id === ids.B).raus && st.fahrer.find(x => x.id === ids.C).raus, st && st.fahrer.map(x => [x.raus]));
    // A fährt mit Simulator, H mit Laufzeit 800 ms; D hört auf zu senden (stale) und kommt zurück
    const t0 = Date.now(); let dA = 0, dH = 0;
    const iv = setInterval(() => { const dt = 0.1; dA += 9 * dt; dH += 10 * dt; A.senden({ t: 'z', d: Math.min(dA, 25), s: 0, r: 1, v: 9, w: 200, wkg: 3, sim: true }); H.senden({ t: 'z', d: Math.min(dH, 34), s: 0, r: 1, v: 10, w: 220, wkg: 3, rtt: 800 }); }, 100);
    D.senden({ t: 'z', d: 2, s: 2, r: 1, v: 5, w: 100, wkg: 1 });
    await warte(800);
    st = await A.stand(); const sd = st && st.fahrer.find(x => x.id === ids.D);
    pruefe('F2 #6 ohne Daten > 2 × staleMs → raus', sd && sd.raus === true, sd);
    D.senden({ t: 'z', d: 6, s: 6, r: 1, v: 5, w: 100, wkg: 1 }); st = await A.stand(); const sd2 = st && st.fahrer.find(x => x.id === ids.D);
    pruefe('F2 #6 Daten kommen zurück → wieder dabei', sd2 && sd2.raus === false && sd2.d === 6, sd2);
    pruefe('F2 #7 Simulator in der Rangliste gekennzeichnet', st && st.fahrer.find(x => x.id === ids.A).sim === true && !st.fahrer.find(x => x.id === hr.id).sim);
    // D getrennt > reconnectMs → raus (getrennt), wieder + Daten → dabei
    const dTok = D; D.ws.terminate(); await warte(700);
    st = await A.stand(); pruefe('F2 #6 getrennt über die Frist → raus', st && st.fahrer.find(x => x.id === ids.D).raus === true);
    void dTok;
    // (Token von D aus 'raum' nicht gespeichert → neu holen über wieder geht nicht; Prüfung der Rücknahme über stale reicht)
    // Gastgeber im Ziel: Zielzeit um halbe Laufzeit (0,4 s) früher
    let erg = null;
    for (let i = 0; i < 80 && !erg; i++) { await warte(100); const s2st = H.nachr.filter(m => m.t === 'stand').pop(); if (s2st) { const h0 = s2st.fahrer.find(x => x.id === hr.id); if (h0 && h0.ziel) erg = h0; } H.nachr = H.nachr.filter(m => m.t !== 'stand'); }
    pruefe('F2 #13 Zielzeit ≈ Empfangszeit − halbe Laufzeit (0,4 s)', erg && erg.zz <= erg.tz - 0.35 && erg.zz >= erg.tz - 0.5, erg && [erg.zz, erg.tz]);
    // A beendet 1 m vor der Zielstrecke (Rundung) → Ziel statt raus
    clearInterval(iv);
    A.senden({ t: 'z', d: 29.2, s: 0, r: 1, v: 9, w: 200, wkg: 3, fertig: true, sim: true });
    const e2 = await A.typ('ergebnis', 3000);
    const eA = e2 && e2.liste.find(x => x.id === ids.A);
    pruefe('F2 #1 „fertig“ 0,8 m vor der Zielstrecke zählt als Ziel', eA && eA.status === 'ziel', eA);
    pruefe('F2 #7 Simulator im Ergebnis gekennzeichnet', eA && eA.sim === true);
    pruefe('F2 Ergebnis nennt den Grund (abweichung)', e2 && e2.liste.find(x => x.id === ids.B).grund === 'abweichung');
    void t0;
    [H, A, B2, C].forEach(c => c.ws.close());
    await s2.schliessen();
  }

  // ---------------------------------------------------------------- F2 #5: Fehlerinjektion – der Prozess läuft weiter, Autorennen /ws bleibt
  {
    const fehlerAlt = console.error; let fehlerZahl = 0; console.error = () => { fehlerZahl++; };
    const s3 = await starten({ port: 0, host: '127.0.0.1', leise: true, radRaum: { aufraeumenMs: 30, taktMs: 30, testFehler: new Set(['aufraeumen', 'takt', 'close', 'nachricht']) } });
    const a = await neuAuf(s3.port); a.senden({ t: 'erstellen', v: 2, name: 'X' }); const fi = await a.typ('fehler');
    pruefe('F2 #5 Fehler im Nachrichten-Handler → „intern“, Verbindung bleibt', fi && fi.grund === 'intern' && !a.zu);
    s3.radRaum.raeume.set('TEST', { code: 'TEST', fahrer: [], zustand: 'fahrt', hostId: '', einst: {}, verbannt: new Set() });      // Raum für takt/aufraeumen
    a.ws.terminate(); await warte(300);
    pruefe('F2 #5 Fehler in close/takt/aufräumen fangen (Prozess lebt, Fehler protokolliert)', fehlerZahl >= 3, fehlerZahl);
    const auto = await neuAuf(s3.port, { pfad: '/ws' }); auto.senden({ t: 'hallo' }); const ah = await auto.typ('hallo');
    pruefe('F2 #5 Autorennen /ws läuft nach den Fehlern weiter', ah && typeof ah.v === 'number');
    const b = await neuAuf(s3.port); const hb = await b.typ('hallo'); pruefe('F2 #5 /ws-rad nimmt weiter Verbindungen an', hb && hb.v === 2);
    auto.ws.close(); b.ws.close();
    await s3.schliessen();
    console.error = fehlerAlt;
  }

  // Prüfroutinen
  const E = RadRaum.einstPruefen;
  pruefe('einstPruefen: Unsinn → Standard (Wiese, 3 Runden, kein Wind, 75 %)', JSON.stringify(E({ strecke: '../x', runden: 'a', realismus: 33 })) === JSON.stringify({ strecke: 'wiese', runden: 3, wind: 'aus', windRichtung: 'zufall', realismus: 75, windschatten: true, bau: null }));
  const O = RadRaum.optikPruefen({ g: 'x', typ: 'Rakete!', marke: '<b>Canyon</b>', trikot: 999, ul: 'ja' });
  pruefe('optikPruefen: begrenzt + bereinigt', O.g === 'm' && O.typ === 'rennrad' && O.marke === 'bCanyon/b' && O.trikot === 63 && O.ul === false, O);

  for (const c of offen) { try { c.ws.terminate(); } catch (e) { /* */ } }
  await srv.schliessen();
  console.log('\n' + ok + ' OK, ' + fehl + ' FEHL');
  process.exit(fehl ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
