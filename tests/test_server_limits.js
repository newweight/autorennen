// v27 F4: node tests/test_server_limits.js  – Limits auf /ws (je Adresse, Rate, Raumcode-Raten, Räume je Adresse)
'use strict';
const path = require('path');
const WebSocket = require(path.join(__dirname, '..', 'server', 'node_modules', 'ws'));
const { starten } = require('../server/server');
let ok = 0, fehl = 0;
const pruefe = (n, g, i) => { console.log((g ? 'OK   ' : 'FEHL ') + n + (i !== undefined ? '  (' + i + ')' : '')); g ? ok++ : fehl++; };
const warte = (ms) => new Promise(r => setTimeout(r, ms));
function verbinde(port, xff) {
  return new Promise((res) => {
    const ws = new WebSocket('ws://127.0.0.1:' + port + '/ws', { headers: xff ? { 'X-Forwarded-For': xff } : {} });
    const c = { ws, nachr: [], status: 0 };
    ws.on('message', d => { try { c.nachr.push(JSON.parse(d.toString())); } catch (e) { /* */ } });
    ws.on('open', () => res(c));
    ws.on('unexpected-response', (rq, a) => { c.status = a.statusCode; res(c); });
    ws.on('error', () => {});
    c.senden = (o) => ws.send(JSON.stringify(o));
  });
}
(async () => {
  const srv = await starten({ port: 0, host: '127.0.0.1', leise: true });
  const port = srv.port;
  // A) mit XFF: ab der 9. abgelehnt
  let cs = [], abgelehnt = 0, erste = 0;
  for (let i = 0; i < 10; i++) { const c = await verbinde(port, '203.0.113.9, 10.0.0.1'); cs.push(c); if (c.status) { abgelehnt++; if (i < 8) erste++; } }
  pruefe('A) XFF: Verbindungen 1-8 ok, 9+10 abgelehnt (429)', erste === 0 && abgelehnt === 2 && cs[8].status === 429, 'abgelehnt ' + abgelehnt);
  const anderer = await verbinde(port, '203.0.113.10');
  pruefe('A) andere Adresse nicht betroffen', anderer.status === 0);
  cs.forEach(c => c.ws.terminate()); anderer.ws.terminate(); await warte(150);
  const nochmal = await verbinde(port, '203.0.113.9');
  pruefe('A) nach Schließen wieder frei (Zähler sinkt)', nochmal.status === 0); nochmal.ws.terminate();
  // B) ohne XFF: unbegrenzt bis 80, 81. -> 404
  cs = []; let st = []; 
  for (let i = 0; i < 81; i++) { const c = await verbinde(port); cs.push(c); st.push(c.status); }
  pruefe('B) ohne XFF: 80 ok, 81. abgelehnt (globales Limit)', st.slice(0, 80).every(x => x === 0) && st[80] === 404, 'ok ' + st.filter(x => !x).length);
  cs.forEach(c => c.ws.terminate()); await warte(300);
  // C) Mega-Start-Schleife: zweiter Client bekommt schnell Antwort
  const a = await verbinde(port), b = await verbinde(port);
  const mega = { streckeId: 'mega', gegner: 11, verkehr: 'viel', geisterfahrer: true, polizei: true, hindernisMenge: 'sehrViele' };
  // Aufwärmen (erster Mega-Bau füllt den Cache, ~1,7 s einmalig – das ist ein einzelner Start, kein Missbrauch)
  a.senden({ t: 'raumErstellen', einstellungen: mega }); a.senden({ t: 'start' }); await warte(3500);
  a.nachr.length = 0; a.ws.send(JSON.stringify({ t: 'verlassen' })); await warte(3200);
  for (let i = 0; i < 6; i++) { a.senden({ t: 'raumErstellen', einstellungen: mega }); a.senden({ t: 'start' }); }
  const t0 = Date.now(); b.senden({ t: 'hallo' });
  while (!b.nachr.some(m => m.t === 'hallo') && Date.now() - t0 < 6000) await warte(5);
  const dt = Date.now() - t0;
  pruefe('C) Mega-Start-Schleife: zweiter Client antwortet < 1500 ms', dt < 1500, dt + ' ms');
  const zs = a.nachr.filter(m => m.t === 'fehler' && m.grund === 'zu_schnell').length;
  pruefe('C) Spam-Starts/Erstellen mit zu_schnell beantwortet', zs >= 5, zs + 'x');
  a.ws.terminate(); b.ws.terminate(); await warte(200);
  // D) Raumcode-Raten: 5 Fehlversuche, danach zu_schnell
  const d = await verbinde(port);
  for (let i = 0; i < 12; i++) d.senden({ t: 'raumBeitreten', code: 'AAA' + i });
  await warte(300);
  const unb = d.nachr.filter(m => m.grund === 'unbekannt').length, zs2 = d.nachr.filter(m => m.grund === 'zu_schnell').length;
  pruefe('D) Raumcode-Raten: 5 unbekannt, Rest zu_schnell', unb === 5 && zs2 === 7, unb + '/' + zs2);
  d.ws.terminate();
  // E) Räume je Adresse höchstens 5 (6 Verbindungen derselben Adresse, je 1 Raum)
  const es = []; for (let i = 0; i < 7; i++) es.push(await verbinde(port, '198.51.100.7'));
  for (const e of es) e.senden({ t: 'raumErstellen', einstellungen: {} });
  await warte(400);
  const raeumeOk = es.filter(e => e.nachr.some(m => m.t === 'raum')).length, voll = es.filter(e => e.nachr.some(m => m.grund === 'voll')).length;
  pruefe('E) max 5 Räume je Adresse', raeumeOk === 5 && voll === 2, raeumeOk + ' ok / ' + voll + ' voll');
  es.forEach(e => e.ws.terminate());
  console.log('\n' + ok + ' OK, ' + fehl + ' FEHL');
  srv.schliessen && srv.schliessen(); process.exit(fehl ? 1 : 0);
})();
