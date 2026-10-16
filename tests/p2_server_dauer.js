// Phase 2 D: Server-Dauerlauf.  node tests/p2_server_dauer.js [minuten=20] [port=18420]
// Startet den echten Server als Kindprozess (node --expose-gc --require tests/p2_mem_hook.js server/server.js --port P --statistik 10) und fährt im Takt von 20 s:
//   Raum erstellen (Strecken abwechselnd inkl. mega, Verkehr viel, 2 Bot-Clients: Host + Gast) → Rennen starten → ~11 s Bot-Eingaben (Gas) → Raum verlassen
//   (Takt 1: beide 'verlassen', 2: Gast zuerst, 3: abruptes Trennen beider); PARALLEL ein Brettspiel-Raum (4 gewinnt/Schach abwechselnd, Züge, Aufgeben, Revanche, Verlassen).
// Speicher: process.memoryUsage() des Servers alle 60 s (nach gc) in tests/out/p2/servermem_dauer.jsonl; Tick-Statistik aus den STAT-Zeilen (tests/out/p2/server_dauer_stat.log).
// Ausgabe am Ende: Speicherverlauf + max. Tick (JSON in tests/out/p2/server_dauer_ergebnis.json).
'use strict';
const path = require('path'), fs = require('fs'), cp = require('child_process');
const WebSocket = require(path.join(__dirname, '..', 'server', 'node_modules', 'ws'));
const { kontextLaden } = require('../server/simulation');
const C = kontextLaden(['vendor/three.min.js', 'src/config.js', 'src/net/protokoll.js']);
const minuten = +process.argv[2] || 20, port = +process.argv[3] || 18420;
const OUT = path.join(__dirname, 'out', 'p2');
const MEM = path.join(OUT, 'servermem_dauer.jsonl'), LOG = path.join(OUT, 'server_dauer_stat.log'), ERG = path.join(OUT, 'server_dauer_ergebnis.json');
for (const f of [MEM, LOG]) try { fs.unlinkSync(f); } catch (e) { /* neu */ }
const warte = (ms) => new Promise(r => setTimeout(r, ms));
const Z = { raeume: 0, gast: 0, start: 0, zustandMsg: 0, ergebnisMsg: 0, brettRaeume: 0, brettZuege: 0, fehler: {}, wsFehler: 0, ohneStart: 0, ohneRaum: 0, abrupt: 0, brettOhneAntwort: 0 };
const fehlerZaehlen = (g) => { Z.fehler[g] = (Z.fehler[g] || 0) + 1; };

const srv = cp.spawn('node', ['--expose-gc', '--require', path.join(__dirname, 'p2_mem_hook.js'), path.join(__dirname, '..', 'server', 'server.js'), '--port', String(port), '--host', '127.0.0.1', '--statistik', '10'],
  { env: Object.assign({}, process.env, { P2_MEM_FILE: MEM, P2_MEM_SEK: '60' }), stdio: ['ignore', 'pipe', 'pipe'] });
const logS = fs.createWriteStream(LOG);
srv.stdout.pipe(logS); srv.stderr.pipe(logS);
let srvTot = false; srv.on('exit', (c) => { srvTot = true; console.log('SERVER BEENDET code=' + c); });

function client(pfad, fn) {
  const ws = new WebSocket('ws://127.0.0.1:' + port + pfad);
  const c = { ws, msgs: [], zu: false };
  ws.on('message', (d) => { let m; try { m = JSON.parse(d.toString()); } catch (e) { return; } c.msgs.push(m); if (m.t === 'fehler') fehlerZaehlen(m.grund); if (fn) fn(m, c); });
  ws.on('error', () => { Z.wsFehler++; });
  ws.on('close', () => { c.zu = true; });
  c.senden = (o) => { if (ws.readyState === 1) ws.send(JSON.stringify(o)); };
  c.offen = new Promise(r => ws.on('open', r));
  c.warten = async (pred, ms) => { const t0 = Date.now(); for (;;) { const i = c.msgs.findIndex(pred); if (i >= 0) return c.msgs[i]; if (Date.now() - t0 > ms) return null; await warte(40); } };
  return c;
}
const STRECKEN = ['wiese', 'mega', 'wald', 'wueste', 'mega', 'fantasie', 'dino', 'alpen'];
const AUTOS = ['porsche-911', 'mini-cooper', 'multivan', 'bmw-m4', 'amg-gt', 'passat'];

async function rennZyklus(nr) {
  const strecke = STRECKEN[nr % STRECKEN.length], art = nr % 3;
  const host = client('/ws'), gast = client('/ws');
  await Promise.all([host.offen, gast.offen]);
  host.senden({ t: 'raumErstellen', fahrer: C.config.fahrer[0].name, auto: AUTOS[nr % AUTOS.length], hilfe: 'wenig', einstellungen: {} });
  const raum = await host.warten(m => m.t === 'raum', 3000);
  if (!raum) { Z.ohneRaum++; return; }
  Z.raeume++;
  host.senden({ t: 'einstellungen', einstellungen: { streckeId: strecke, runden: 1, gegner: 2, tageszeit: ['tag', 'nacht', 'daemmerung'][nr % 3], wetter: ['klar', 'regen', 'schnee'][nr % 3], verkehr: 'viel', polizei: nr % 2 === 0 } });
  await warte(150);
  const lobby = await host.warten(m => m.t === 'lobby', 2000);
  const code = lobby && (lobby.code || lobby.raum || (lobby.lobby && lobby.lobby.code));
  const codeEff = code || (host.msgs.find(m => m.code) || {}).code || raum.code;
  gast.senden({ t: 'raumBeitreten', code: codeEff, fahrer: C.config.fahrer[1].name, auto: AUTOS[(nr + 1) % AUTOS.length], hilfe: 'wenig' });
  if (await gast.warten(m => m.t === 'raum', 3000)) { Z.gast++; gast.senden({ t: 'bereit', an: true }); }
  await warte(300);
  for (const c of [host, gast]) { c.n = 0; }
  host.senden({ t: 'start' });
  const st = await host.warten(m => m.t === 'start', 5000);
  if (!st) { Z.ohneStart++; } else {
    Z.start++;
    setTimeout(() => { host.senden({ t: 'geladen' }); gast.senden({ t: 'geladen' }); }, 500);
    const k = C.Netz.eingabeKodieren({ gas: 1, bremse: 0, lenkung: nr % 2 ? 0.1 : -0.1 });
    const t0 = Date.now();
    const iv = setInterval(() => { for (const c of [host, gast]) { for (let i = 0; i < 3; i++) { c.n++; c.senden({ t: 'eingabe', n: c.n, g: k.g, b: k.b, l: k.l }); } } }, 50);
    await warte(11000);
    clearInterval(iv);
    Z.zustandMsg += host.msgs.filter(m => m.t === 'zustand').length;
    Z.ergebnisMsg += host.msgs.filter(m => m.t === 'ergebnis').length;
  }
  if (art === 0) { host.senden({ t: 'verlassen' }); gast.senden({ t: 'verlassen' }); await warte(300); }
  else if (art === 1) { gast.senden({ t: 'verlassen' }); await warte(300); host.senden({ t: 'verlassen' }); await warte(300); }
  else { Z.abrupt++; try { gast.ws.terminate(); host.ws.terminate(); } catch (e) { /* zu */ } await warte(300); }
  for (const c of [host, gast]) try { c.ws.close(); } catch (e) { /* zu */ }
}

async function brettZyklus(nr) {
  const spiel = nr % 2 ? 'schach' : 'vier';
  const a = client('/ws-brett'), b = client('/ws-brett');
  await Promise.all([a.offen, b.offen]);
  a.senden({ t: 'raumErstellen', spiel, name: 'A' });
  const r = await a.warten(m => m.t === 'raum', 3000);
  if (!r) { Z.brettOhneAntwort++; return; }
  Z.brettRaeume++;
  b.senden({ t: 'raumBeitreten', code: r.code, spiel, name: 'B' });
  const rb = await b.warten(m => m.t === 'raum', 3000);
  if (!rb) { Z.brettOhneAntwort++; return; }
  const sp = { [r.rolle]: a, [rb.rolle]: b };
  const zuege = spiel === 'vier' ? [3, 3, 4, 4, 2, 2, 5] : ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1c4', 'g8f6'];
  let am = 'w';
  for (const z of zuege) {
    const c = spiel === 'vier' ? (zuege.indexOf(z) % 2 === 0 ? sp.w : sp.b) : sp[am];
    c.senden({ t: 'zug', z }); Z.brettZuege++; am = am === 'w' ? 'b' : 'w'; await warte(120);
  }
  a.senden({ t: 'aufgeben' }); await warte(200);
  a.senden({ t: 'revanche', an: true }); b.senden({ t: 'revanche', an: true }); await warte(300);
  if (nr % 2) { a.senden({ t: 'verlassen' }); await warte(200); } else { try { a.ws.terminate(); b.ws.terminate(); } catch (e) { /* zu */ } }
  for (const c of [a, b]) try { c.ws.close(); } catch (e) { /* zu */ }
}

(async () => {
  for (let i = 0; i < 100 && !fs.existsSync(MEM); i++) await warte(100);
  await warte(1200);
  const ende = Date.now() + minuten * 60000;
  let nr = 0;
  const t0 = Date.now();
  while (Date.now() < ende && !srvTot) {
    const start = Date.now();
    await Promise.all([rennZyklus(nr).catch(e => { fehlerZaehlen('ausnahme:' + e.message); }), brettZyklus(nr).catch(e => { fehlerZaehlen('brettAusnahme:' + e.message); })]);
    nr++;
    if (nr % 3 === 0) console.log(((Date.now() - t0) / 1000).toFixed(0) + ' s Zyklen ' + nr + ' ' + JSON.stringify(Z));
    const rest = 20000 - (Date.now() - start);
    if (rest > 0) await warte(rest);
  }
  await warte(3000);
  // Auswertung
  const mem = fs.existsSync(MEM) ? fs.readFileSync(MEM, 'utf8').trim().split('\n').map(z => JSON.parse(z)) : [];
  const stat = fs.readFileSync(LOG, 'utf8').split('\n').filter(z => z.startsWith('STAT ')).map(z => { try { return JSON.parse(z.slice(5)); } catch (e) { return null; } }).filter(Boolean);
  const maxTick = stat.reduce((m, s) => Math.max(m, s.tick.max), 0), maxP99 = stat.reduce((m, s) => Math.max(m, s.tick.p99), 0), maxLag = stat.reduce((m, s) => Math.max(m, s.schleifenLag.max), 0);
  const maxAbstand = stat.reduce((m, s) => Math.max(m, s.zustandAbstand.max), 0);
  const ergebnis = { minuten, zyklen: nr, zaehler: Z, serverTot: srvTot,
    speicher: mem.map(m => ({ min: +((m.t - mem[0].t) / 60000).toFixed(1), rssMB: +(m.rss / 1048576).toFixed(1), heapMB: +(m.heapUsed / 1048576).toFixed(2), externalMB: +(m.external / 1048576).toFixed(2), handles: m.handles })),
    statZeilen: stat.length, maxTickMs: maxTick, maxTickP99Ms: maxP99, maxSchleifenLagMs: maxLag, maxZustandAbstandMs: maxAbstand };
  fs.writeFileSync(ERG, JSON.stringify(ergebnis, null, 1));
  console.log('ENDE ' + JSON.stringify(ergebnis));
  try { srv.kill('SIGTERM'); } catch (e) { /* tot */ }
  await warte(500); process.exit(0);
})();
