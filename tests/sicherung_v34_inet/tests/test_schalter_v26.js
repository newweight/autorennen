// v26 Internet-Schalter: Herkunftsprüfung (Header-Varianten von tailscaled), Rechte der Wunsch-Datei als anderer Benutzer, Statusgründe.
// node tests/test_schalter_v26.js        (--schnell: ohne die 21-s-Wartezeit für „haengt“)
'use strict';
const fs = require('fs'), os = require('os'), path = require('path'), cp = require('child_process'), net = require('net');
const WebSocket = require('../server/node_modules/ws');
const { starten, schalterBewertung } = require('../server/server');
const schnell = process.argv.includes('--schnell');
let ok = 0, fehl = 0;
const pruefe = (n, b, info) => { if (b) ok++; else fehl++; console.log((b ? 'OK   ' : 'FEHL ') + n + (info !== undefined && (!b || process.argv.includes('--diag')) ? '  (' + info + ')' : '')); };
const warte = (ms) => new Promise(r => setTimeout(r, ms));
const frei = () => new Promise(r => { const s = net.createServer().listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => r(p)); }); });

// ---------------------------------------------------------------- A) Was macht der Server mit welchen Headern?
const L = '127.0.0.1';
const req = (h, adr) => ({ socket: { remoteAddress: adr || L }, headers: h });
const TS = { 'tailscale-user-login': 'sebastian@example.com', 'tailscale-user-name': 'Sebastian' };
const FALL = [
  // [Beschreibung, req, erwartet recht, erwarteter Grund, erwarteter Weg]
  ['Serve, Normalfall: Identität + XFF Tailnet-IPv4', req(Object.assign({ 'x-forwarded-for': '100.101.102.103' }, TS)), true, 'ok', 'identitaet'],
  ['Serve, nur Identität (XFF fehlt)', req(Object.assign({}, TS)), true, 'ok', 'identitaet'],
  ['Serve, KEINE Identität, nur XFF Tailnet-IPv4 (Homebrew-tailscaled-Variante?)', req({ 'x-forwarded-for': '100.101.102.103' }), true, 'ok', 'xff'],
  ['Serve, KEINE Identität, nur XFF Tailnet-IPv6', req({ 'x-forwarded-for': 'fd7a:115c:a1e0::1234' }), true, 'ok', 'xff'],
  ['Serve, Identität, XFF IPv6 in Klammern/::ffff:', req(Object.assign({ 'x-forwarded-for': '::ffff:100.64.0.7' }, TS)), true, 'ok', 'identitaet'],
  ['Serve, Identität leer ("")', req({ 'tailscale-user-login': '' }), false, 'keinTailnet'],
  ['Serve, Identität mit Leerzeichen/Komma (kaputt)', req({ 'tailscale-user-login': 'a b,c' }), false, 'keinTailnet'],
  ['Serve, getaggtes Gerät: weder Identität noch XFF', req({}), false, 'keinTailnet'],
  ['Funnel: Funnel-Header + öffentliche XFF', req({ 'tailscale-funnel-request': '?1', 'x-forwarded-for': '203.0.113.50' }), false, 'oeffentlich'],
  ['Funnel + gefälschte Identität im Browser-Header', req(Object.assign({ 'tailscale-funnel-request': '?1', 'x-forwarded-for': '203.0.113.50' }, TS)), false, 'oeffentlich'],
  ['Funnel + gefälschte Tailnet-XFF + gefälschte Identität (alles gefälscht, Funnel-Header bleibt)', req(Object.assign({ 'tailscale-funnel-request': '?1', 'x-forwarded-for': '100.64.0.1' }, TS)), false, 'oeffentlich'],
  ['Funnel, nur Funnel-Header', req({ 'tailscale-funnel-request': '?1' }), false, 'oeffentlich'],
  ['cloudflared: öffentliche XFF + cf-connecting-ip', req({ 'x-forwarded-for': '203.0.113.50', 'cf-connecting-ip': '203.0.113.50' }), false, 'oeffentlich'],
  ['cloudflared, Angreifer fälscht XFF „100.64.0.1“ (Cloudflare hängt echte IP an)', req({ 'x-forwarded-for': '100.64.0.1, 203.0.113.50', 'cf-connecting-ip': '203.0.113.50' }), false, 'oeffentlich'],
  ['cloudflared, Angreifer fälscht XFF „100.64.0.1“ UND Identität, Cloudflare-Header da', req(Object.assign({ 'x-forwarded-for': '100.64.0.1', 'cf-ray': 'abc' }, TS)), false, 'oeffentlich'],
  ['fremder Proxy mit x-real-ip', req({ 'x-forwarded-for': '100.64.0.1', 'x-real-ip': '203.0.113.9' }), false, 'oeffentlich'],
  ['nur „von 127.0.0.1“ (z. B. localhost-Browser, jeder lokale Proxy)', req({}), false, 'keinTailnet'],
  ['Heimnetz direkt (192.168.x) mit gefälschter Identität', req(Object.assign({ 'x-forwarded-for': '100.64.0.1' }, TS), '192.168.1.20'), false, 'keinTailnet'],
  ['Heimnetz direkt mit öffentlicher XFF', req({ 'x-forwarded-for': '203.0.113.5' }, '192.168.1.20'), false, 'oeffentlich'],
  ['Serve + fremder Origin (fremde Webseite im Tailnet-Browser)', req(Object.assign({ 'x-forwarded-for': '100.64.0.9', origin: 'https://boese.example', host: 'mac.tail1.ts.net:10000' }, TS)), false, 'oeffentlich'],
  ['Serve + Origin = Host (eigene Seite)', req(Object.assign({ 'x-forwarded-for': '100.64.0.9', origin: 'https://mac.tail1.ts.net:10000', host: 'mac.tail1.ts.net:10000' }, TS)), true, 'ok', 'identitaet'],
  ['Serve ohne Identität + Origin = X-Forwarded-Host', req({ 'x-forwarded-for': '100.64.0.9', origin: 'https://mac.tail1.ts.net:10000', host: '127.0.0.1:8444', 'x-forwarded-host': 'mac.tail1.ts.net:10000' }), true, 'ok', 'xff'],
];
console.log('--- A) Header-Varianten → Entscheidung des Servers ---');
for (const [name, r, recht, grund, weg] of FALL) {
  const b = schalterBewertung(r, '');
  pruefe('A ' + name + '  →  ' + (b.recht ? 'RECHT (' + b.weg + ')' : 'kein Recht (' + b.grund + ')'), b.recht === recht && b.grund === grund && (weg === undefined || b.weg === weg), JSON.stringify(b));
}

// ---------------------------------------------------------------- B) Ende-zu-Ende über Proxy-Attrappen
function proxy(zielPort, art) {
  return new Promise(async (res) => {
    const p = await frei();
    const pr = cp.spawn('node', [path.join(__dirname, 'tailscale_proxy_stub.js'), String(p), String(zielPort), art], { stdio: ['ignore', 'pipe', 'inherit'] });
    pr.stdout.once('data', () => res({ port: p, stop: () => pr.kill() }));
  });
}
const verbinden = (port, headers) => new Promise((ok_, nein) => {
  const ws = new WebSocket('ws://127.0.0.1:' + port + '/ws', { headers: headers || {} });
  const wartende = [];
  ws.on('message', (d) => { const m = JSON.parse(d); if (m.t === 'schalter' && wartende.length) wartende.shift()(m); });
  ws.on('open', () => ok_({ ws, frage: (obj) => new Promise((r) => { wartende.push(r); ws.send(JSON.stringify(obj)); setTimeout(() => r(null), 2500); }) }));
  ws.on('error', nein);
});

(async () => {
  console.log('--- B) Ende-zu-Ende über Proxy-Attrappen (Antwort des Servers) ---');
  const ordner = fs.mkdtempSync(path.join(os.tmpdir(), 'steuerung26-'));
  fs.writeFileSync(path.join(ordner, 'wunsch.json'), '{"funnel":"aus","seit":0}');
  const status = (f, bis, zeit) => fs.writeFileSync(path.join(ordner, 'status.json'), `{"funnel":"${f}","bis":${bis},"zeit":${zeit === undefined ? Date.now() : zeit}}`);
  const logZeilen = [];
  const olog = console.log; 
  const s = await starten({ port: 0, host: '127.0.0.1', leise: true, steuerung: ordner });
  status('aus', 'null');
  for (const [art, soll, grund] of [['serve', true], ['serve-ohne-identitaet', true], ['serve-ohne-xff', true], ['serve-nichts', false, 'keinTailnet'],
    ['funnel', false, undefined], ['cloudflared', false, undefined]]) {
    const px = await proxy(s.port, art);
    const k = await verbinden(px.port);
    const a = await k.frage({ t: 'schalterFrage' });
    pruefe('B Proxy „' + art + '“: ' + (soll ? 'Schalter-Recht' : 'kein Recht' + (grund ? ' + Grund ' + grund : ' und keine Erklärung (verrät nichts)')),
      a && a.recht === soll && (soll || (a.grund === grund && Object.keys(a).length === (grund ? 3 : 2))), JSON.stringify(a));
    if (soll) { const u = await k.frage({ t: 'schalterUmschalten', an: true }); pruefe('B Proxy „' + art + '“: Umschalten schreibt wunsch.json', u && u.recht === true && /"funnel":"an"/.test(fs.readFileSync(path.join(ordner, 'wunsch.json'), 'utf8')), JSON.stringify(u));
      fs.writeFileSync(path.join(ordner, 'wunsch.json'), '{"funnel":"aus","seit":0}'); await warte(5100); }
    k.ws.terminate(); px.stop();
  }
  // Ohne Funnel-Merkmale direkt (localhost-Browser)
  let k = await verbinden(s.port);
  let a = await k.frage({ t: 'schalterFrage' });
  pruefe('B localhost-Browser ohne Header: kein Recht + Grund keinTailnet', a && a.recht === false && a.grund === 'keinTailnet', JSON.stringify(a)); k.ws.terminate();

  console.log('--- C) Status-Gründe (Helfer) ---');
  k = await verbinden(s.port, Object.assign({ 'x-forwarded-for': '100.64.0.5' }, { 'tailscale-user-login': 'a@b.de' }));
  fs.rmSync(path.join(ordner, 'status.json'), { force: true });
  a = await k.frage({ t: 'schalterFrage' });
  pruefe('C status.json fehlt → unbekannt, helfer „fehlt“', a && a.funnel === 'unbekannt' && a.helfer === 'fehlt', JSON.stringify(a));
  status('aus', 'null', Date.now() - 90000);
  a = await k.frage({ t: 'schalterFrage' });
  pruefe('C status.json 90 s alt → unbekannt, helfer „alt“', a && a.funnel === 'unbekannt' && a.helfer === 'alt', JSON.stringify(a));
  fs.writeFileSync(path.join(ordner, 'status.json'), 'müll');
  a = await k.frage({ t: 'schalterFrage' });
  pruefe('C status.json kaputt → unbekannt, helfer „kaputt“', a && a.funnel === 'unbekannt' && a.helfer === 'kaputt', JSON.stringify(a));
  status('aus', 'null');
  a = await k.frage({ t: 'schalterFrage' });
  pruefe('C status.json gut → kein „helfer“-Feld', a && a.funnel === 'aus' && a.helfer === undefined && !a.haengt, JSON.stringify(a));
  // Wunsch geschrieben, Helfer setzt ihn nicht um (Funnel nicht erlaubt): wartet → nach 20 s haengt
  a = await k.frage({ t: 'schalterUmschalten', an: true });
  pruefe('C Wunsch AN: wartet', a && a.wartet === true && !a.haengt, JSON.stringify(a));
  if (!schnell) {
    for (let i = 0; i < 5; i++) { status('aus', 'null'); await warte(4300); }          // Helfer lebt (frischer Status), bleibt aber „aus“
    status('aus', 'null');
    a = await k.frage({ t: 'schalterFrage' });
    pruefe('C nach 21 s ohne Umsetzung: haengt = „an“ (Anzeige „Tailscale hat nicht umgeschaltet“), nicht mehr wartet', a && a.haengt === 'an' && a.wartet === false, JSON.stringify(a));
    status('an', Date.now() + 14400000);
    a = await k.frage({ t: 'schalterFrage' });
    pruefe('C Helfer setzt um → funnel an, kein haengt', a && a.funnel === 'an' && !a.haengt && !a.wartet, JSON.stringify(a));
  }
  k.ws.terminate(); await s.schliessen();

  // ohne --steuerung: Tailnet-Gerät bekommt die Erklärung, Funnel nicht
  const s0 = await starten({ port: 0, host: '127.0.0.1', leise: true });
  for (const [art, grund] of [['serve', 'ohneSteuerung'], ['funnel', undefined], ['serve-nichts', 'keinTailnet']]) {
    const px = await proxy(s0.port, art), kk = await verbinden(px.port);
    const aa = await kk.frage({ t: 'schalterFrage' });
    pruefe('C ohne --steuerung, Proxy „' + art + '“: ' + (grund ? 'Grund ' + grund : 'nur recht:false'), aa && aa.recht === false && aa.grund === grund && Object.keys(aa).length === (grund ? 3 : 2), JSON.stringify(aa));
    kk.ws.terminate(); px.stop();
  }
  await s0.schliessen();

  // ---------------------------------------------------------------- D) Dateirechte wie auf dem Mac mini (Server als anderer Benutzer)
  console.log('--- D) Rechte: Server als Benutzer „nobody“, Ordner root 755, wunsch.json 644 ---');
  const root = process.getuid && process.getuid() === 0;
  let nobodyOk = false;
  try { nobodyOk = root && /uid=\d+\(nobody\)/.test(cp.execSync('id nobody', { encoding: 'utf8' })) && !!cp.execSync('which setpriv', { encoding: 'utf8' }).trim(); } catch (e) { /* kein setpriv */ }
  if (!nobodyOk) { pruefe('D übersprungen (kein root / kein nobody / kein setpriv)', true); }
  else {
    const kopie = fs.mkdtempSync(path.join(os.tmpdir(), 'spielkopie26-'));
    for (const x of ['server', 'src', 'vendor', 'spiele', 'Autorennen.html']) cp.execSync(`cp -R "${path.join(__dirname, '..', x)}" "${kopie}/"`);
    cp.execSync(`chmod -R a+rX "${kopie}"; chmod a+rx "${kopie}"`);
    const steu = fs.mkdtempSync(path.join(os.tmpdir(), 'steu-root26-'));
    cp.execSync(`chown root:root "${steu}"; chmod 755 "${steu}"`);
    const server = async (log) => {
      const p = await frei();
      const pr = cp.spawn('setpriv', ['--reuid=65534', '--regid=65534', '--clear-groups', 'node', path.join(kopie, 'server', 'server.js'), '--port', String(p), '--host', '127.0.0.1', '--steuerung', steu],
        { stdio: ['ignore', 'pipe', 'pipe'], cwd: kopie });
      let ausgabe = ''; pr.stdout.on('data', d => ausgabe += d); pr.stderr.on('data', d => ausgabe += d);
      for (let i = 0; i < 60; i++) { try { await new Promise((r, n) => net.connect(p, '127.0.0.1').once('connect', function () { this.destroy(); r(); }).once('error', n)); break; } catch (e) { await warte(100); } }
      return { port: p, ausgabe: () => ausgabe, stop: () => pr.kill() };
    };
    const TAILH = { 'tailscale-user-login': 'sebastian@example.com', 'x-forwarded-for': '100.64.0.5' };
    const stat = () => fs.statSync(path.join(steu, 'wunsch.json'));
    // D1 Installer-Zustand: Datei gehört nobody (= „autorennen“), 644
    cp.execSync(`echo '{"funnel":"aus","seit":0}' > "${steu}/wunsch.json"; chown 65534:65534 "${steu}/wunsch.json"; chmod 644 "${steu}/wunsch.json"`);
    fs.writeFileSync(path.join(steu, 'status.json'), `{"funnel":"aus","bis":null,"zeit":${Date.now()}}`);
    const ino = stat().ino;
    let sv = await server(); let c2 = await verbinden(sv.port, TAILH);
    let r = await c2.frage({ t: 'schalterUmschalten', an: true });
    pruefe('D1 Installer-Zustand (Datei autorennen:644, Ordner root:755): Server schreibt den Wunsch', r && r.recht === true && !r.fehler && /^\{"funnel":"an","seit":\d{13}\}$/.test(fs.readFileSync(path.join(steu, 'wunsch.json'), 'utf8')), JSON.stringify(r));
    pruefe('D1b dieselbe Datei (gleiche Inode, kein Ersetzen/Umbenennen) und Eigentümer bleibt autorennen', stat().ino === ino && stat().uid === 65534, stat().ino + ' vs ' + ino);
    // Gegenprobe zur Hypothese (c): Umbenennen/Neuanlegen ginge im root-Ordner NICHT – der Server tut es nicht
    const gegenprobe = cp.spawnSync('setpriv', ['--reuid=65534', '--regid=65534', '--clear-groups', 'node', '-e',
      `const fs=require('fs');try{fs.writeFileSync('${steu}/neu.tmp','x');console.log('neu:OK')}catch(e){console.log('neu:'+e.code)}try{fs.renameSync('${steu}/wunsch.json','${steu}/w2.json');console.log('ren:OK')}catch(e){console.log('ren:'+e.code)}`], { encoding: 'utf8' }).stdout;
    pruefe('D1c Gegenprobe (Hypothese c): als autorennen im root-Ordner Datei anlegen/umbenennen → verboten (EACCES) – der Server schreibt deshalb nur IN die bestehende Datei', /neu:EACCES/.test(gegenprobe) && /ren:EACCES/.test(gegenprobe), gegenprobe.replace(/\n/g, ' '));
    c2.ws.terminate(); sv.stop(); await warte(300);

    // D2 Datei gehört root (z. B. von Hand mit sudo angelegt) → Server kann nicht schreiben → klare Fehlermeldung
    cp.execSync(`chown root:root "${steu}/wunsch.json"`);
    sv = await server(); c2 = await verbinden(sv.port, TAILH);
    r = await c2.frage({ t: 'schalterUmschalten', an: true });
    pruefe('D2 wunsch.json gehört root: Antwort fehler „schreiben“ + Code EACCES (Spiel zeigt: Rechte / installieren.command)', r && r.fehler === 'schreiben' && r.code === 'EACCES', JSON.stringify(r));
    await warte(200);
    pruefe('D2b Server-Protokoll nennt die Ursache (EACCES + installieren.command)', /nicht beschreibbar \(EACCES\)/.test(sv.ausgabe()), sv.ausgabe().slice(-200));
    c2.ws.terminate(); sv.stop(); await warte(300);

    // D3 Datei fehlt
    fs.rmSync(path.join(steu, 'wunsch.json'));
    sv = await server(); c2 = await verbinden(sv.port, TAILH);
    r = await c2.frage({ t: 'schalterUmschalten', an: true });
    pruefe('D3 wunsch.json fehlt (Ordner root): fehler „schreiben“ + EACCES', r && r.fehler === 'schreiben' && r.code === 'EACCES', JSON.stringify(r));
    c2.ws.terminate(); sv.stop();
    fs.rmSync(kopie, { recursive: true, force: true }); fs.rmSync(steu, { recursive: true, force: true });
  }
  fs.rmSync(ordner, { recursive: true, force: true });
  console.log('\n' + ok + ' OK, ' + fehl + ' FEHL');
  process.exit(fehl ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
