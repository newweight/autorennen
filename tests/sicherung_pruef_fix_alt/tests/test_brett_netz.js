// Brettspiele online: node tests/test_brett_netz.js
// Startet server/server.js im selben Prozess (freier Port) und prüft /ws-brett mit echten WebSocket-Clients:
// Raum erstellen/beitreten, Zugfolge, illegale Züge, Matt/Gewinn, Aufgeben, Revanche (Farbtausch), Wiederverbinden, Zuschauer,
// Raum-Aufräumen, Limits (Räume, Nachrichtengröße, Rate), HTTP (spiele/, Redirect, Pfad-Traversal), Autorennen-/ws unberührt.
'use strict';
const path = require('path');
const http = require('http');
const WebSocket = require(path.join(__dirname, '..', 'server', 'node_modules', 'ws'));
const { starten } = require('../server/server');
let ok = 0, fehl = 0;
const pruefe = (n, g, i) => { console.log((g ? 'OK   ' : 'FEHL ') + n + (i !== undefined ? '  (' + i + ')' : '')); g ? ok++ : fehl++; };
const warte = (ms) => new Promise(r => setTimeout(r, ms));

function client(port, pfad) {
  return new Promise((res, rej) => {
    const ws = new WebSocket('ws://127.0.0.1:' + port + (pfad || '/ws-brett'));
    const c = { ws, nachr: [], zu: false, code: null };
    ws.on('message', d => { try { c.nachr.push(JSON.parse(d.toString())); } catch (e) { /* */ } });
    ws.on('close', (code) => { c.zu = true; c.zuCode = code; });
    ws.on('open', () => res(c));
    ws.on('error', rej);
    c.senden = (o) => ws.send(typeof o === 'string' ? o : JSON.stringify(o));
    c.warten = async (pred, ms) => { const t0 = Date.now(); for (;;) { const i = c.nachr.findIndex(pred); if (i >= 0) return c.nachr.splice(i, 1)[0]; if (Date.now() - t0 > (ms || 2000)) return null; await warte(5); } };
    c.letzterStand = async () => { await warte(40); const l = c.nachr.filter(m => m.t === 'stand'); c.nachr = c.nachr.filter(m => m.t !== 'stand'); return l[l.length - 1] || null; };
  });
}
function get(port, url, opt) {
  return new Promise((res) => {
    const r = http.request({ host: '127.0.0.1', port, path: url, method: (opt && opt.method) || 'GET' }, (a) => { let d = ''; a.on('data', x => d += x); a.on('end', () => res({ status: a.statusCode, head: a.headers, body: d })); });
    r.on('error', () => res({ status: 0 })); r.end();
  });
}

(async () => {
  const srv = await starten({ port: 0, host: '127.0.0.1', leise: true, brett: { raumMs: 900, aufraeumenMs: 100, maxRaeume: 4 } });
  const port = srv.port;

  // ---------- HTTP ----------
  let r = await get(port, '/spiele/');
  pruefe('HTTP /spiele/ → 200 HTML', r.status === 200 && /text\/html/.test(r.head['content-type']), r.status);
  r = await get(port, '/spiele'); pruefe('HTTP /spiele → 301 auf spiele/', r.status === 301 && r.head.location === 'spiele/', r.head.location);
  r = await get(port, '/spiele/schach'); pruefe('HTTP /spiele/schach → 301', r.status === 301 && r.head.location === 'schach/');
  r = await get(port, '/spiele/schach/?raum=ABCD'); pruefe('HTTP /spiele/schach/?raum=… → 200', r.status === 200);
  r = await get(port, '/spiele/vier-gewinnt/'); pruefe('HTTP /spiele/vier-gewinnt/ → 200', r.status === 200);
  for (const f of ['gemeinsam/schach-regeln.js', 'gemeinsam/vier-regeln.js', 'gemeinsam/konstanten.js', 'gemeinsam/rahmen.js', 'gemeinsam/stil.css', 'schach/kern/worker.js']) {
    r = await get(port, '/spiele/' + f); pruefe('HTTP /spiele/' + f + ' → 200 mit passendem Typ', r.status === 200 && /javascript|css/.test(r.head['content-type']), r.status);
  }
  for (const u of ['/spiele/../server/server.js', '/spiele/%2e%2e/server/server.js', '/spiele/..%2fserver/server.js', '/spiele/gemeinsam/', '/spiele/.git/config', '/server/server.js', '/spiele/%00', '/spiele/..\\server\\server.js']) {
    r = await get(port, u); pruefe('HTTP gesperrt: ' + u, r.status === 404 || r.status === 301, r.status);
  }
  r = await get(port, '/spiele/', { method: 'POST' }); pruefe('HTTP POST abgelehnt', r.status === 405);
  r = await get(port, '/'); pruefe('Autorennen unter / unverändert', r.status === 200 && /Hot Steering Wheel|Autorennen/i.test(r.body));
  r = await get(port, '/src/net/qr.js'); pruefe('src/net/qr.js weiter erreichbar (QR-Code-Wiederverwendung)', r.status === 200);

  // ---------- Autorennen-/ws unberührt ----------
  const rennen = await client(port, '/ws'); rennen.senden({ t: 'hallo' });
  const h = await rennen.warten(m => m.t === 'hallo'); pruefe('Autorennen /ws antwortet weiter (hallo)', !!h && typeof h.v === 'number');
  rennen.ws.close();
  const bogus = await client(port, '/ws-brett/x').catch(() => 'abgelehnt'); pruefe('falscher Pfad /ws-brett/x abgewiesen', bogus === 'abgelehnt');

  // ---------- Schach ----------
  const A = await client(port), B = await client(port);
  A.senden({ t: 'hallo' }); pruefe('hallo-Antwort', !!(await A.warten(m => m.t === 'hallo')));
  A.senden({ t: 'raumErstellen', spiel: 'schach', name: 'fuchs', farbe: 'w' });
  const ra = await A.warten(m => m.t === 'raum');
  pruefe('Raum erstellt: 4-stelliger Code ohne 0/O/1/I, Platz Weiß, Token', ra && /^[A-HJ-NP-Z2-9]{4}$/.test(ra.code) && ra.rolle === 'w' && ra.token.length >= 20, ra && ra.code);
  let sa = await A.letzterStand();
  pruefe('Zustand „warten“, ein Spieler (Name aus Liste)', sa.zustand === 'warten' && sa.spieler[0].name === '🦊 Fuchs' && sa.spieler[1] === null);
  A.senden({ t: 'zug', z: 'e2e4' }); pruefe('Zug vor dem Spielstart abgelehnt', !!(await A.warten(m => m.t === 'fehler' && m.grund === 'nichtAktiv')));
  B.senden({ t: 'raumBeitreten', code: ra.code.toLowerCase(), spiel: 'schach', name: 'fuchs' });
  const rb = await B.warten(m => m.t === 'raum');
  pruefe('Beitritt (Code klein geschrieben), Platz Schwarz', rb && rb.rolle === 'b' && rb.code === ra.code);
  sa = await A.letzterStand(); let sb = await B.letzterStand();
  pruefe('beide sehen Zustand „spiel“, Weiß am Zug', sa.zustand === 'spiel' && sb.zustand === 'spiel' && sa.am === 'w');
  pruefe('gleicher Name wird eindeutig (Fuchs 2)', sb.spieler[1].name === '🦊 Fuchs 2', sb.spieler[1].name);
  B.senden({ t: 'zug', z: 'e7e5' }); pruefe('Schwarz zieht außer der Reihe → abgelehnt', !!(await B.warten(m => m.t === 'fehler' && m.grund === 'nichtDran')));
  A.senden({ t: 'zug', z: 'e2e5' }); pruefe('illegaler Zug (e2e5) abgelehnt', !!(await A.warten(m => m.t === 'fehler' && m.grund === 'unlegal')));
  A.senden({ t: 'zug', z: 7 }); pruefe('Zug als Zahl abgelehnt', !!(await A.warten(m => m.t === 'fehler' && m.grund === 'unlegal')));
  A.senden({ t: 'zug', z: 'e7e5' }); pruefe('Zug einer gegnerischen Figur abgelehnt', !!(await A.warten(m => m.t === 'fehler' && m.grund === 'unlegal')));
  A.senden({ t: 'zug', z: 'f2f3' });
  sb = await B.letzterStand(); await A.letzterStand();
  pruefe('legaler Zug kommt bei beiden an, Schwarz am Zug', sb.zuege.join() === 'f2f3' && sb.am === 'b');
  B.senden({ t: 'zug', z: 'e7e5' }); A.senden({ t: 'zug', z: 'g2g4' }); await warte(60); B.senden({ t: 'zug', z: 'd8h4' });
  sa = null; await warte(80); const lst = A.nachr.filter(m => m.t === 'stand'); sa = lst[lst.length - 1]; A.nachr = A.nachr.filter(m => m.t !== 'stand');
  pruefe('Narrenmatt: Server erkennt Matt, Schwarz gewinnt, Schach-Flag', sa && sa.zustand === 'ende' && sa.ergebnis.art === 'matt' && sa.ergebnis.sieger === 'b' && sa.schach === true, sa && JSON.stringify(sa.ergebnis));
  A.senden({ t: 'zug', z: 'a2a3' }); pruefe('nach dem Ende kein Zug mehr', !!(await A.warten(m => m.t === 'fehler')));
  // Zuschauer
  const Z = await client(port);
  Z.senden({ t: 'raumBeitreten', code: ra.code, zuschauer: true });
  const rz = await Z.warten(m => m.t === 'raum'); const sz = await Z.letzterStand();
  pruefe('Zuschauer sieht die Stellung, darf nicht ziehen', rz.rolle === 'z' && sz.zuege.length === 4 && sz.zuschauer === 1);
  Z.senden({ t: 'zug', z: 'a2a3' }); pruefe('Zuschauer-Zug abgelehnt', !!(await Z.warten(m => m.t === 'fehler')));
  // Dritter Spieler (Raum voll)
  const D = await client(port); D.senden({ t: 'raumBeitreten', code: ra.code }); pruefe('3. Spieler: Raum voll', !!(await D.warten(m => m.t === 'fehler' && m.grund === 'voll'))); D.ws.close();
  // Revanche mit Farbtausch
  A.senden({ t: 'revanche' }); await warte(60);
  sb = (await B.letzterStand());
  pruefe('Revanche-Wunsch von A sichtbar', sb.revanche.w === true && sb.revanche.b === false && sb.zustand === 'ende');
  B.senden({ t: 'revanche' });
  const neuA = await A.warten(m => m.t === 'raum' && m.neu); const neuB = await B.warten(m => m.t === 'raum' && m.neu);
  pruefe('beide stimmen zu → neues Spiel, Farben getauscht (A jetzt Schwarz)', neuA.rolle === 'b' && neuB.rolle === 'w');
  sa = await A.letzterStand();
  pruefe('neue Partie leer, Weiß (B) am Zug, Runde 2', sa.zustand === 'spiel' && sa.zuege.length === 0 && sa.runde === 2 && sa.am === 'w' && sa.spieler[0].name === '🦊 Fuchs 2');
  // Wiederverbinden
  B.senden({ t: 'zug', z: 'e2e4' }); await warte(60);
  const tokenA = ra.token;
  A.ws.terminate(); await warte(100);
  sb = await B.letzterStand();
  pruefe('Gegner sieht „offline“', sb.spieler.find(s => s.farbe === 'b').online === false);
  const A2 = await client(port);
  A2.senden({ t: 'wiederverbinden', code: ra.code, token: 'falsch' }); pruefe('falscher Token: wiederNein', !!(await A2.warten(m => m.t === 'wiederNein')));
  A2.senden({ t: 'wiederverbinden', code: ra.code, token: tokenA });
  const rw = await A2.warten(m => m.t === 'raum' && m.wieder); const sw = await A2.letzterStand();
  pruefe('Wiederverbinden mit Token: gleicher Platz, Stellung erhalten', rw && rw.rolle === 'b' && sw.zuege.join() === 'e2e4' && sw.am === 'b');
  A2.senden({ t: 'zug', z: 'c7c5' }); sb = await B.letzterStand(); await warte(50);
  pruefe('A zieht nach Wiederverbinden weiter, Gegner online', sb.zuege.join() === 'e2e4,c7c5' && sb.spieler.every(s => s.online));
  // Umwandlung via Server
  // Aufgeben
  B.senden({ t: 'aufgeben' }); await warte(60); sa = await A2.letzterStand();
  pruefe('Aufgeben: Gegner gewinnt', sa.zustand === 'ende' && sa.ergebnis.art === 'aufgegeben' && sa.ergebnis.sieger === 'b');
  // Raum-Aufräumen: alle weg
  const code1 = ra.code;
  A2.ws.terminate(); B.ws.terminate(); Z.ws.terminate();
  await warte(300); pruefe('Raum bleibt kurz nach dem Verlassen bestehen (Wiederverbinden möglich)', srv.brett.raeume.has(code1));
  await warte(1300); pruefe('Raum nach Ablauf (raumMs) aufgeräumt', !srv.brett.raeume.has(code1), 'Räume: ' + srv.brett.raeume.size);
  const X = await client(port); X.senden({ t: 'wiederverbinden', code: code1, token: tokenA }); pruefe('Wiederverbinden nach Ablauf: wiederNein', !!(await X.warten(m => m.t === 'wiederNein')));

  // ---------- 4 gewinnt ----------
  const V1 = X, V2 = await client(port);
  V1.senden({ t: 'raumErstellen', spiel: 'vier', name: 'baer', farbe: 'b' });
  const v1 = await V1.warten(m => m.t === 'raum');
  V2.senden({ t: 'raumBeitreten', code: v1.code, spiel: 'schach', name: 'hase' });
  pruefe('falsches Spiel beim Beitreten abgelehnt', !!(await V2.warten(m => m.t === 'fehler' && m.grund === 'anderesSpiel')));
  V2.senden({ t: 'raumBeitreten', code: v1.code, spiel: 'vier', name: 'hase' });
  const v2 = await V2.warten(m => m.t === 'raum');
  pruefe('4g: Ersteller wählte Gelb (b), Gast bekommt Rot (w, beginnt)', v1.rolle === 'b' && v2.rolle === 'w');
  await warte(50); V1.nachr = []; V2.nachr = [];
  V1.senden({ t: 'zug', z: 0 }); pruefe('4g: Gelb zieht nicht zuerst', !!(await V1.warten(m => m.t === 'fehler' && m.grund === 'nichtDran')));
  V2.senden({ t: 'zug', z: 7 }); pruefe('4g: Spalte 7 abgelehnt', !!(await V2.warten(m => m.t === 'fehler' && m.grund === 'unlegal')));
  V2.senden({ t: 'zug', z: 'a' }); pruefe('4g: Text als Spalte abgelehnt', !!(await V2.warten(m => m.t === 'fehler' && m.grund === 'unlegal')));
  for (const [c, z] of [[V2, 0], [V1, 6], [V2, 1], [V1, 6], [V2, 2], [V1, 6], [V2, 3]]) { c.senden({ t: 'zug', z }); await warte(30); }
  const s4 = await V1.letzterStand();
  pruefe('4g: Rot gewinnt waagrecht, Reihe wird mitgeliefert', s4.zustand === 'ende' && s4.ergebnis.art === 'reihe' && s4.ergebnis.sieger === 'w' && s4.ergebnis.reihe.length === 4, JSON.stringify(s4.ergebnis));
  V2.senden({ t: 'revanche' }); V1.senden({ t: 'revanche' });
  const nv = await V1.warten(m => m.t === 'raum' && m.neu); pruefe('4g: Revanche tauscht die Farben (Gelb-Spieler jetzt Rot)', nv && nv.rolle === 'w');
  V1.senden({ t: 'verlassen' }); await warte(80);
  const nz = await V2.warten(m => m.t === 'raumZu'); pruefe('Verlassen schließt den Raum, anderer bekommt raumZu', !!nz && !srv.brett.raeume.has(v1.code));

  // ---------- Limits ----------
  const C = []; const codes = [];
  for (let i = 0; i < 5; i++) { const c = await client(port); C.push(c); c.senden({ t: 'raumErstellen', spiel: 'vier', name: 'igel' }); }
  await warte(150);
  const nOk = C.filter(c => c.nachr.some(m => m.t === 'raum')).length, nVoll = C.filter(c => c.nachr.some(m => m.t === 'fehler' && m.grund === 'voll')).length;
  pruefe('Raumlimit (4): 4 Räume ok, der 5. abgelehnt', nOk === 4 && nVoll === 1, nOk + '/' + nVoll);
  const gross = await client(port); const zu = new Promise(res => gross.ws.on('close', c => res(c)));
  gross.ws.send(JSON.stringify({ t: 'ping', z: 'x'.repeat(2000) }));
  pruefe('zu große Nachricht (> 512 Byte) trennt die Verbindung', (await Promise.race([zu, warte(1000).then(() => 0)])) === 1009);
  const J = await client(port); J.senden('kein json'); pruefe('kaputtes JSON → Fehler, Verbindung bleibt', !!(await J.warten(m => m.t === 'fehler' && m.grund === 'json')) && !J.zu);
  J.senden({ t: 'gibtsnicht' }); pruefe('unbekannte Nachricht ohne Raum → Fehler', !!(await J.warten(m => m.t === 'fehler')));
  J.senden([1]); pruefe('Array statt Objekt → Fehler', !!(await J.warten(m => m.t === 'fehler')));
  J.senden({ t: 'raumErstellen', spiel: 'dame' }); pruefe('unbekanntes Spiel → Fehler', !!(await J.warten(m => m.t === 'fehler' && m.grund === 'ungueltig')));
  J.senden({ t: 'raumBeitreten', code: 'ZZZZ' }); pruefe('unbekannter Raumcode → Fehler', !!(await J.warten(m => m.t === 'fehler' && m.grund === 'unbekannt')));
  J.senden({ t: 'raumBeitreten', code: { a: 1 } }); pruefe('Code als Objekt → Fehler ohne Absturz', !!(await J.warten(m => m.t === 'fehler')));
  for (let i = 0; i < 60; i++) J.senden({ t: 'ping', z: i });
  await warte(150); const pongs = J.nachr.filter(m => m.t === 'pong').length;
  pruefe('Rate-Limit: von 60 Pings in einer Sekunde höchstens ~30 beantwortet', pongs <= 31 && pongs >= 10 && !J.zu, pongs);
  for (let i = 0; i < 400; i++) J.senden({ t: 'ping' });
  await warte(300); pruefe('> 300 Nachrichten/s → getrennt', J.zu);
  const nach = await client(port); nach.senden({ t: 'hallo' }); pruefe('Server läuft weiter', !!(await nach.warten(m => m.t === 'hallo')));
  await srv.schliessen();
  console.log('\n' + ok + ' OK, ' + fehl + ' FEHL');
  process.exit(fehl ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
