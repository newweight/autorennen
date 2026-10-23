// R6 „Internet für Freunde“: node tests/test_rad_internet.js
// Prüft im selben Prozess (freier Port, eigener Steuerungs-, Daten- und rad-Ordner; Funnel/Tailscale-Header simuliert):
//  A rad-kopieren.sh: nur Radwelt.html + src/ + vendor/, keine Links/versteckten/_-Dateien/fremden Endungen, Ziel muss leer sein
//  B /rad/…: Dateien der EIGENEN Kopie ausgeliefert, /rad → /rad/Radwelt.html (Abfrage bleibt), Pfad-Tricks abgewiesen, Link aus rad/ heraus abgewiesen,
//    Autorennen-Dateien (/, /Autorennen.html, /src/…, /vendor/…, /spiele/) byte-gleich wie auf der Platte
//  C /api/rad/… über Proxy/Funnel NIE (403), direkt 127.0.0.1 ja
//  D /ws-rad aus dem Internet: Schalter aus/unbekannt/alt → 403, an → erlaubt; Origin = Funnel-Adresse erlaubt, fremd 403; Internet-Gäste dürfen
//    beitreten, aber keine Räume erstellen; Limits + Code-Raten je öffentlicher Adresse (letzter X-Forwarded-For-Eintrag); Schalter aus → Internet-
//    Verbindungen getrennt, Tailnet bleibt
//  E Schalter über /ws-rad: Recht nur Tailnet (auch von http://localhost:10100), Wunsch-Datei, Rate-Limit 5 s gemeinsam mit /ws, Einladungslink/radDa/radApp;
//    Internet-Gäste nie Recht. Autorennen /ws: Schalter wie vorher, über Funnel weiter erreichbar (unverändert).
'use strict';
const path = require('path');
const fs = require('fs');
const os = require('os');
const http = require('http');
const { execFileSync } = require('child_process');
const WebSocket = require(path.join(__dirname, '..', 'server', 'node_modules', 'ws'));
const { starten } = require('../server/server');
const RadRaum = require('../server/radRaum');
let ok = 0, fehl = 0;
const pruefe = (n, g, i) => { console.log((g ? 'OK   ' : 'FEHL ') + n + (i !== undefined ? '  (' + (typeof i === 'object' ? JSON.stringify(i) : i) + ')' : '')); g ? ok++ : fehl++; };
const warte = (ms) => new Promise(r => setTimeout(r, ms));
const WURZEL = path.resolve(__dirname, '..');
const SKRIPT = path.join(WURZEL, 'server', 'autostart', 'rad-kopieren.sh');
const MINI = 'mini.tailx.ts.net:10000';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rad-internet-'));
const STEU = path.join(tmp, 'steuerung'); fs.mkdirSync(STEU);
const status = (funnel, alterMs) => fs.writeFileSync(path.join(STEU, 'status.json'),
  JSON.stringify({ funnel, bis: funnel === 'an' ? Date.now() + 3600e3 : null, zeit: Date.now() - (alterMs || 0) }).replace(/\s/g, ''));

function holen(port, pfad, kopf, methode, body) {
  return new Promise((res) => {
    const r = http.request({ host: '127.0.0.1', port, path: pfad, method: methode || 'GET', headers: kopf || {} }, (a) => {
      const teile = []; a.on('data', d => teile.push(d)); a.on('end', () => res({ code: a.statusCode, kopf: a.headers, body: Buffer.concat(teile) }));
    });
    r.on('error', () => res({ code: 0, body: Buffer.alloc(0), kopf: {} }));
    if (body) r.write(body);
    r.end();
  });
}
/** roher Pfad (ohne Normalisierung durch http.request) */
function roh(port, pfad) {
  return new Promise((res) => {
    const s = require('net').connect(port, '127.0.0.1', () => s.write('GET ' + pfad + ' HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n'));
    let d = ''; s.on('data', x => { d += x; }); s.on('end', () => res(+((/^HTTP\/1\.1 (\d{3})/.exec(d) || [])[1] || 0))); s.on('error', () => res(0));
  });
}
const FUNNEL = (ip, extra) => Object.assign({ 'Tailscale-Funnel-Request': '?1', 'X-Forwarded-For': ip || '203.0.113.7', Host: MINI, 'X-Forwarded-Host': MINI, 'X-Forwarded-Proto': 'https' }, extra || {});
const TAILNET = (extra) => Object.assign({ 'Tailscale-User-Login': 'papa@example.com', 'X-Forwarded-For': '100.101.2.3', Host: MINI, 'X-Forwarded-Host': MINI }, extra || {});

function verbinden(port, pfad, kopf, origin) {
  return new Promise((res) => {
    const opt = { headers: Object.assign({}, kopf || {}) }; if (origin) opt.origin = origin;
    const ws = new WebSocket('ws://127.0.0.1:' + port + (pfad || '/ws-rad'), opt);
    const c = { ws, nachr: [], zu: false };
    ws.on('message', d => { try { c.nachr.push(JSON.parse(d.toString())); } catch (e) { /* */ } });
    ws.on('close', (code) => { c.zu = true; c.zuCode = code; });
    ws.on('open', () => res(c));
    ws.on('unexpected-response', (req, r) => { c.abgewiesen = r.statusCode; res(c); });
    ws.on('error', () => { if (!c.abgewiesen) { c.fehler = true; res(c); } });
    c.senden = (x) => { if (ws.readyState === 1) ws.send(JSON.stringify(x)); };
    c.warten = async (pred, ms) => { const t0 = Date.now(); for (;;) { const i = c.nachr.findIndex(pred); if (i >= 0) return c.nachr.splice(i, 1)[0]; if (Date.now() - t0 > (ms || 2500)) return null; await warte(5); } };
    c.typ = (t, ms) => c.warten(m => m.t === t, ms);
  });
}

(async () => {
  // ---------------------------------------------------------------- A rad-kopieren.sh
  const QUELLE = path.join(tmp, 'radwelt-quelle'), RAD = path.join(tmp, 'spiel-rad');
  const schreib = (rel, inhalt) => { const f = path.join(QUELLE, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, inhalt); };
  schreib('Radwelt.html', '<!doctype html><title>Radwelt</title>RADKOPIE');
  schreib('Autorennen.html', 'AUTORENNEN-NICHT-KOPIEREN');
  schreib('src/main.js', '// RADKOPIE main.js (anders als das Autorennen)');
  schreib('src/rad/mehrspieler.js', "const MP_APP = 'r9test';");
  schreib('src/rad/vorschau/wiese.jpg', 'JPG');
  schreib('src/ui/styles.css', 'body{}');
  schreib('src/_werkzeug.js', 'GEHEIM');
  schreib('src/.versteckt.js', 'GEHEIM');
  schreib('src/rad/notiz.txt', 'NICHT');
  schreib('vendor/three.min.js', '// three');
  schreib('server/server.js', 'NICHT');
  schreib('Radwelt starten.command', 'NICHT');
  fs.mkdirSync(path.join(QUELLE, 'prof'), { recursive: true }); schreib('prof/x.js', 'NICHT');
  fs.symlinkSync('/etc/passwd', path.join(QUELLE, 'src', 'passwd.js'));
  const nachher = (rel) => fs.existsSync(path.join(RAD, rel));
  let aus = '';
  try { aus = execFileSync('/bin/bash', [SKRIPT, QUELLE, RAD], { encoding: 'utf8' }); } catch (e) { aus = 'FEHLER ' + e.message; }
  pruefe('A rad-kopieren.sh läuft', /kopiert: 6 Dateien/.test(aus), aus.trim());
  pruefe('A kopiert Radwelt.html, src/**, vendor/**', ['Radwelt.html', 'src/main.js', 'src/rad/mehrspieler.js', 'src/rad/vorschau/wiese.jpg', 'src/ui/styles.css', 'vendor/three.min.js'].every(nachher));
  pruefe('A nicht kopiert: Autorennen.html, server/, .command, prof/, _/.-Dateien, .txt, Links',
    !['Autorennen.html', 'server', 'Radwelt starten.command', 'prof', 'src/_werkzeug.js', 'src/.versteckt.js', 'src/rad/notiz.txt', 'src/passwd.js'].some(nachher));
  let zweimal = 0; try { execFileSync('/bin/bash', [SKRIPT, QUELLE, RAD], { stdio: 'ignore' }); } catch (e) { zweimal = e.status; }
  pruefe('A Ziel nicht leer → Abbruch (Exit 1)', zweimal === 1, zweimal);
  let ohne = 0; try { execFileSync('/bin/bash', [SKRIPT, path.join(tmp, 'gibtsnicht'), path.join(tmp, 'z2')], { stdio: 'ignore' }); } catch (e) { ohne = e.status; }
  pruefe('A keine Radwelt in der Quelle → Exit 1', ohne === 1, ohne);
  // Link aus rad/ heraus (nachträglich, z. B. von Hand): darf der Server NICHT ausliefern
  fs.symlinkSync(path.join(WURZEL, 'server', 'server.js'), path.join(RAD, 'src', 'link.js'));
  fs.symlinkSync(path.join(WURZEL, 'server'), path.join(RAD, 'src', 'linkordner'));

  status('aus');
  const DATEN = path.join(tmp, 'daten');
  const srv = await starten({ port: 0, host: '127.0.0.1', leise: true, steuerung: STEU, oeffentlich: 'https://' + MINI + '/', rad: RAD, daten: DATEN,
    radRaum: { internetPruefMs: 100, internetCacheMs: 30, countdownMs: 300, aufraeumenMs: 100, taktMs: 50, internetFehlMax: 25, internetSperreMs: 600 } });
  const port = srv.port;

  // ---------------------------------------------------------------- B /rad/ + Autorennen-Dateien
  {
    const r1 = await holen(port, '/rad/Radwelt.html');
    pruefe('B /rad/Radwelt.html = eigene Kopie (200, html)', r1.code === 200 && /RADKOPIE/.test(r1.body) && /text\/html/.test(r1.kopf['content-type']), r1.code);
    const r2 = await holen(port, '/rad/'); pruefe('B /rad/ → Radwelt.html', r2.code === 200 && /RADKOPIE/.test(r2.body), r2.code);
    const r3 = await holen(port, '/rad?raum=ABCD'); pruefe('B /rad?raum=ABCD → 301 /rad/Radwelt.html?raum=ABCD', r3.code === 301 && r3.kopf.location === '/rad/Radwelt.html?raum=ABCD', r3.kopf.location);
    const r4 = await holen(port, '/rad/Radwelt.html?raum=ABCD'); pruefe('B mit ?raum= ausgeliefert', r4.code === 200);
    const r5 = await holen(port, '/rad/src/main.js'); pruefe('B /rad/src/main.js aus der Kopie (nicht das Autorennen-main.js)', r5.code === 200 && /RADKOPIE/.test(r5.body) && /javascript/.test(r5.kopf['content-type']));
    const r6 = await holen(port, '/rad/src/rad/vorschau/wiese.jpg'); pruefe('B Bild aus der Kopie', r6.code === 200 && r6.kopf['content-type'] === 'image/jpeg');
    const r7 = await holen(port, '/rad/vendor/three.min.js'); pruefe('B vendor aus der Kopie', r7.code === 200 && /three/.test(r7.body));
    const tricks = ['/rad/../server/server.js', '/rad/%2e%2e/server/server.js', '/rad/src/..%2f..%2fserver/server.js', '/rad/src/%2e%2e/%2e%2e/server/radApi.js', '/rad/..%5cserver%5cserver.js',
      '/rad/server/server.js', '/rad/Autorennen.html', '/rad/prof/x.js', '/rad/.geheim', '/rad/src/_werkzeug.js', '/rad/src', '/rad/src/', '/rad/src/link.js', '/rad/src/linkordner/server.js',
      '/rad/src/rad/notiz.txt', '/rad/Radwelt.html%00.js', '/rad//etc/passwd', '/rad/%2fetc%2fpasswd', '/rad/index.html', '/radx/Radwelt.html', '/rad/src/../../Autorennen.html'];
    const codes = [];
    for (const t of tricks) codes.push(await roh(port, t));
    pruefe('B Pfad-Tricks/Links/fremde Dateien unter /rad/ → nie 200 (' + tricks.length + ' Fälle)', codes.every(c => c === 404 || c === 400 || c === 301), tricks.map((t, i) => codes[i] === 404 || codes[i] === 400 ? '' : t + '=' + codes[i]).filter(Boolean).join(' '));
    // Autorennen-Dateien byte-gleich
    const gleich = async (url, datei) => { const r = await holen(port, url); return r.code === 200 && r.body.equals(fs.readFileSync(path.join(WURZEL, datei))); };
    const ar = [['/', 'Autorennen.html'], ['/Autorennen.html', 'Autorennen.html'], ['/src/main.js', 'src/main.js'], ['/src/track/trackBuilder.js', 'src/track/trackBuilder.js'],
      ['/src/world/themes.js', 'src/world/themes.js'], ['/vendor/three.min.js', 'vendor/three.min.js'], ['/spiele/', 'spiele/index.html']];
    const erg = []; for (const [u, d] of ar) erg.push(await gleich(u, d));
    pruefe('B Autorennen-Dateien unverändert ausgeliefert (byte-gleich, ' + ar.length + ')', erg.every(Boolean), ar.filter((x, i) => !erg[i]).map(x => x[0]));
    const fu = await holen(port, '/Autorennen.html', FUNNEL()); pruefe('B Autorennen über Funnel weiter erreichbar (unverändert)', fu.code === 200);
    const fr = await holen(port, '/rad/Radwelt.html', FUNNEL()); pruefe('B /rad/ über Funnel erreichbar (Freund öffnet den Link)', fr.code === 200);
    const sv = await holen(port, '/server/server.js'); pruefe('B /server/… weiterhin 404', sv.code === 404);
  }

  // ---------------------------------------------------------------- C /api/rad über Proxy nie
  {
    const lok = await holen(port, '/api/rad/status', { Host: '127.0.0.1:' + port }); pruefe('C /api/rad/status direkt 127.0.0.1 → 200', lok.code === 200, lok.code);
    const fun = await holen(port, '/api/rad/status', FUNNEL()); pruefe('C /api/rad/status über Funnel → 403', fun.code === 403, fun.code);
    const tn = await holen(port, '/api/rad/status', TAILNET()); pruefe('C /api/rad/status über Tailnet-Proxy → 403', tn.code === 403, tn.code);
    const nurHost = await holen(port, '/api/rad/fahrten', { Host: MINI }); pruefe('C /api/rad mit Funnel-Host (ohne Proxy-Header) → 403', nurHost.code === 403, nurHost.code);
    const xffLok = await holen(port, '/api/rad/fahrten', { Host: 'localhost', 'X-Forwarded-For': '127.0.0.1' }); pruefe('C /api/rad mit X-Forwarded-For (auch 127.0.0.1) → 403', xffLok.code === 403, xffLok.code);
    const post = await holen(port, '/api/rad/fahrt', FUNNEL(null, { 'Content-Type': 'application/json' }), 'POST', '{}'); pruefe('C POST /api/rad/fahrt über Funnel → 403', post.code === 403, post.code);
    const del = await holen(port, '/api/rad/fahrt/x1', FUNNEL(), 'DELETE'); pruefe('C DELETE über Funnel → 403', del.code === 403, del.code);
    const fr = await holen(port, '/api/rad/status', { Host: '127.0.0.1:' + port, 'Tailscale-Funnel-Request': '?1' }); pruefe('C nur Funnel-Header (Host lokal) → 403', fr.code === 403, fr.code);
  }

  // ---------------------------------------------------------------- D /ws-rad aus dem Internet
  const AI = RadRaum.ausDemInternet;
  const rq = (ra, h) => ({ socket: { remoteAddress: ra }, headers: h || {} });
  pruefe('D ausDemInternet: Funnel-Header → ja', AI(rq('127.0.0.1', { 'tailscale-funnel-request': '?1', 'x-forwarded-for': '100.64.1.1' })));
  pruefe('D ausDemInternet: Tailnet (Serve) → nein', !AI(rq('127.0.0.1', { 'x-forwarded-for': '100.101.2.3', 'tailscale-user-login': 'a@b' })));
  pruefe('D ausDemInternet: lokal ohne Header → nein', !AI(rq('127.0.0.1')) && !AI(rq('::1')));
  pruefe('D ausDemInternet: öffentliche Adresse in X-Forwarded-For → ja', AI(rq('127.0.0.1', { 'x-forwarded-for': '100.101.2.3, 8.8.8.8' })));
  pruefe('D ausDemInternet: Heimnetz direkt → nein, öffentliche Socket-Adresse → ja', !AI(rq('192.168.1.20')) && !AI(rq('::ffff:10.0.0.5')) && AI(rq('8.8.4.4')) && AI(rq('2a00:1450::1')));
  pruefe('D Funnel ohne X-Forwarded-For → Schlüssel „ip:internet“ (nicht „lokal“)', RadRaum.adressSchluessel(rq('127.0.0.1', { 'tailscale-funnel-request': '?1' })) === 'ip:internet');
  pruefe('D ausDemInternet: Cloudflare/X-Real-IP/Forwarded → ja', AI(rq('127.0.0.1', { 'cf-connecting-ip': '1.1.1.1' })) && AI(rq('127.0.0.1', { 'x-real-ip': '1.1.1.1' })) && AI(rq('127.0.0.1', { forwarded: 'for=1.1.1.1' })));
  {
    status('aus'); await warte(60);
    const a1 = await verbinden(port, '/ws-rad', FUNNEL(), 'https://' + MINI); pruefe('D Schalter aus: Funnel → /ws-rad 403', a1.abgewiesen === 403, a1.abgewiesen);
    const a2 = await verbinden(port, '/ws-rad', { 'X-Forwarded-For': '198.51.100.4' }); pruefe('D Schalter aus: öffentliche Adresse ohne Funnel-Header → 403', a2.abgewiesen === 403, a2.abgewiesen);
    fs.unlinkSync(path.join(STEU, 'status.json')); await warte(60);
    const a3 = await verbinden(port, '/ws-rad', FUNNEL()); pruefe('D Status fehlt (Helfer weg) → 403', a3.abgewiesen === 403, a3.abgewiesen);
    status('an', 60000); await warte(60);
    const a4 = await verbinden(port, '/ws-rad', FUNNEL()); pruefe('D Status „an“, aber 60 s alt → 403', a4.abgewiesen === 403, a4.abgewiesen);
    fs.writeFileSync(path.join(STEU, 'status.json'), '{"funnel":"an", kaputt'); await warte(60);
    const a5 = await verbinden(port, '/ws-rad', FUNNEL()); pruefe('D Status kaputt → 403', a5.abgewiesen === 403, a5.abgewiesen);
    status('aus'); await warte(60);
    const t1 = await verbinden(port, '/ws-rad', TAILNET(), 'http://localhost:10100'); pruefe('D Schalter aus: Tailnet weiter erlaubt', !t1.abgewiesen && !t1.fehler && !!(await t1.typ('hallo')));
    const l1 = await verbinden(port, '/ws-rad'); pruefe('D Schalter aus: lokal weiter erlaubt', !l1.abgewiesen && !l1.fehler);
    const ar = await verbinden(port, '/ws', FUNNEL(), 'https://' + MINI); pruefe('D Autorennen /ws über Funnel unverändert erreichbar', !ar.abgewiesen && !ar.fehler, ar.abgewiesen);
    const br = await verbinden(port, '/ws-brett', FUNNEL(), 'https://' + MINI); pruefe('D Brettspiele /ws-brett über Funnel unverändert', !br.abgewiesen && !br.fehler, br.abgewiesen);
    [l1, ar, br].forEach(c => c.ws.close());

    // Schalter an → erlaubt
    status('an'); await warte(60);
    const g1 = await verbinden(port, '/ws-rad', FUNNEL('203.0.113.7'), 'https://' + MINI); pruefe('D Schalter an: Funnel mit Origin = eigene Funnel-Adresse erlaubt', !g1.abgewiesen && !g1.fehler && !!(await g1.typ('hallo')), g1.abgewiesen);
    const g2 = await verbinden(port, '/ws-rad', FUNNEL('203.0.113.8'), 'https://boese.example'); pruefe('D Schalter an: fremder Origin weiter 403', g2.abgewiesen === 403, g2.abgewiesen);
    const g3 = await verbinden(port, '/ws-rad', FUNNEL('203.0.113.9'), 'https://fremd.tailandere.ts.net'); pruefe('D Schalter an: Seite aus fremdem Tailnet 403', g3.abgewiesen === 403, g3.abgewiesen);
    g1.senden({ t: 'erstellen', v: RadRaum.VERSION, name: 'Fremd' }); const fe = await g1.typ('fehler');
    pruefe('D Internet-Gast darf keinen Raum erstellen', fe && fe.grund === 'nurTailnet', fe);
    t1.senden({ t: 'erstellen', v: RadRaum.VERSION, name: 'Papa', einst: { strecke: 'wiese', runden: 1 } }); const rh = await t1.typ('raum');
    pruefe('D Gastgeber im Tailnet erstellt Raum (Schalter an)', rh && rh.host === true, rh);
    // R6-2 S1: aus dem Internet nur mit Einladungs-Token
    g1.senden({ t: 'beitreten', v: RadRaum.VERSION, code: rh.code, name: 'Freund' }); const oT = await g1.typ('fehler');
    pruefe('S1 Internet-Gast nur mit Code (ohne Token) → abgewiesen', oT && oT.grund === 'unbekannt' && /Einladung/.test(oT.text), oT);
    g1.senden({ t: 'einladung' }); const eg = await g1.typ('fehler'); pruefe('S1 Internet-Gast kann keinen Token holen', eg && eg.grund === 'nurHost', eg);
    t1.senden({ t: 'einladung' }); const ein = await t1.typ('einladung');
    pruefe('S1 Gastgeber bekommt Token (128 Bit, 22 Zeichen)', ein && ein.code === rh.code && /^[A-Za-z0-9_-]{22}$/.test(ein.k), ein);
    t1.senden({ t: 'einladung' }); const ein2 = await t1.typ('einladung'); pruefe('S1 erneute Abfrage → derselbe Token', ein2 && ein2.k === ein.k);
    g1.senden({ t: 'beitreten', v: RadRaum.VERSION, code: rh.code, k: ein.k.slice(0, 21) + (ein.k[21] === 'A' ? 'B' : 'A'), name: 'Freund' }); const fT = await g1.typ('fehler');
    pruefe('S1 falscher Token → abgewiesen', fT && fT.grund === 'unbekannt', fT && fT.grund);
    g1.senden({ t: 'beitreten', v: RadRaum.VERSION, code: rh.code, k: ein.k, name: 'Freund' }); const rg = await g1.typ('raum');
    pruefe('D Internet-Gast tritt mit Code + Token bei', rg && rg.code === rh.code && rg.host === false, rg);
    const tn2 = await verbinden(port, '/ws-rad', TAILNET({ 'Tailscale-User-Login': 'mama@example.com', 'X-Forwarded-For': '100.102.3.4' }), 'https://' + MINI);
    tn2.senden({ t: 'beitreten', v: RadRaum.VERSION, code: rh.code, name: 'Mama' }); const rTn = await tn2.typ('raum'); pruefe('S1 Tailnet-Gast weiter nur mit Code', rTn && rTn.code === rh.code, rTn);
    tn2.ws.close();
    t1.senden({ t: 'einladung', neu: true }); const ein3 = await t1.typ('einladung'); pruefe('S1 „neuer Link“ → neuer Token', ein3 && ein3.k !== ein.k && ein3.k.length === 22);
    const g5 = await verbinden(port, '/ws-rad', FUNNEL('203.0.113.70'), 'https://' + MINI);
    g5.senden({ t: 'beitreten', v: RadRaum.VERSION, code: rh.code, k: ein.k, name: 'Alt' }); const fAlt = await g5.typ('fehler'); pruefe('S1 alter Token nach „neuer Link“ ungültig', fAlt && fAlt.grund === 'unbekannt', fAlt && fAlt.grund);
    g5.senden({ t: 'beitreten', v: RadRaum.VERSION, code: rh.code, k: ein3.k, name: 'Neu' }); const rNeu = await g5.typ('raum'); pruefe('S1 neuer Token geht', rNeu && rNeu.code === rh.code);
    g5.senden({ t: 'verlassen' }); await g5.typ('verlassen'); g5.ws.close();
    const k3 = ein3.k;
    // Code-Raten je öffentlicher Adresse, auch mit eingeschmuggeltem ersten X-Forwarded-For-Eintrag
    const rater = [];
    for (let i = 0; i < 5; i++) { const c = await verbinden(port, '/ws-rad', FUNNEL('10.0.0.' + i + ', 198.51.100.50')); c.senden({ t: 'beitreten', v: RadRaum.VERSION, code: 'ZZZZ' }); await c.typ('fehler'); rater.push(c); }
    const r6 = await verbinden(port, '/ws-rad', FUNNEL('100.70.0.9, 198.51.100.50')); r6.senden({ t: 'beitreten', v: RadRaum.VERSION, code: 'ZZZZ' }); const f6 = await r6.typ('fehler');
    pruefe('D Code-Raten-Sperre je öffentlicher Adresse (trotz wechselnder eingeschmuggelter Einträge)', f6 && f6.grund === 'zu_schnell', f6 && f6.text);
    const r7 = await verbinden(port, '/ws-rad', FUNNEL('198.51.100.51')); r7.senden({ t: 'beitreten', v: RadRaum.VERSION, code: 'ZZZZ' }); const f7 = await r7.typ('fehler');
    pruefe('D andere öffentliche Adresse nicht gesperrt', f7 && f7.grund === 'unbekannt', f7 && f7.grund);
    rater.concat([r6, r7]).forEach(c => c.ws.close()); await warte(80);
    // Verbindungs-Limit je Adresse (8)
    const viele = []; for (let i = 0; i < 9; i++) viele.push(await verbinden(port, '/ws-rad', FUNNEL('1.2.3.' + i + ', 198.51.100.60')));
    pruefe('D höchstens 8 Verbindungen je öffentlicher Adresse (9. → 429)', viele.slice(0, 8).every(c => !c.abgewiesen) && viele[8].abgewiesen === 429, viele.map(c => c.abgewiesen || 'ok'));
    viele.forEach(c => { try { c.ws.close(); } catch (e) { /* */ } }); await warte(80);
    // S1: IPv6 je /64
    const V6 = RadRaum.v6Netz, rqI = (ip) => ({ socket: { remoteAddress: '127.0.0.1' }, headers: { 'tailscale-funnel-request': '?1', 'x-forwarded-for': ip } });
    pruefe('S1 v6Netz: 2001:db8:1:2::a und 2001:db8:1:2:ffff:1:2:3 → dasselbe /64', V6('2001:db8:1:2::a', rqI('x')) === '2001:db8:1:2::/64' && V6('2001:0db8:0001:0002:ffff:1:2:3', rqI('x')) === '2001:db8:1:2::/64', V6('2001:db8:1:2::a', rqI('x')));
    pruefe('S1 Schlüssel IPv6 aus dem Internet = /64, Tailnet-IPv6 unverändert', RadRaum.adressSchluessel(rqI('2001:db8:1:2::77')) === 'ip:2001:db8:1:2::/64' &&
      RadRaum.adressSchluessel({ socket: { remoteAddress: '127.0.0.1' }, headers: { 'x-forwarded-for': 'fd7a:115c:a1e0::5' } }) === 'ip:fd7a:115c:a1e0::5');
    const v6 = [];
    for (let i = 1; i <= 5; i++) { const c = await verbinden(port, '/ws-rad', FUNNEL('2001:db8:1:2::' + i.toString(16) + 'a')); c.senden({ t: 'beitreten', v: RadRaum.VERSION, code: 'ZZZZ' }); await c.typ('fehler'); v6.push(c); }
    const v6b = await verbinden(port, '/ws-rad', FUNNEL('2001:db8:1:2:abcd::99')); v6b.senden({ t: 'beitreten', v: RadRaum.VERSION, code: 'ZZZZ' }); const fv6 = await v6b.typ('fehler');
    pruefe('S1 IPv6: neue Adresse im selben /64 bleibt gesperrt', fv6 && fv6.grund === 'zu_schnell', fv6 && fv6.text);
    const v6c = await verbinden(port, '/ws-rad', FUNNEL('2001:db8:1:3::1')); v6c.senden({ t: 'beitreten', v: RadRaum.VERSION, code: 'ZZZZ' }); const fv6c = await v6c.typ('fehler');
    pruefe('S1 IPv6: anderes /64 nicht gesperrt', fv6c && fv6c.grund === 'unbekannt', fv6c && fv6c.grund);
    v6.concat([v6b, v6c]).forEach(c => c.ws.close()); await warte(80);
    // S1: gemeinsames Fehlversuch-Limit aller Internet-Gäste (Test: 25/min → 0,6 s Sperre)
    let gesperrt = null; const glob = [];
    for (let i = 0; i < 30 && !gesperrt; i++) { const c = await verbinden(port, '/ws-rad', FUNNEL('192.0.2.' + (10 + i))); glob.push(c); c.senden({ t: 'beitreten', v: RadRaum.VERSION, code: 'ZZZZ' }); const f = await c.typ('fehler'); if (f && f.grund === 'zu_schnell') gesperrt = i; }
    pruefe('S1 gemeinsames Limit: nach ≤ 25 Fehlversuchen (verschiedene Adressen) Sperre für alle Internet-Gäste', gesperrt !== null && gesperrt <= 25, gesperrt);
    const echt = await verbinden(port, '/ws-rad', FUNNEL('198.51.100.200')); echt.senden({ t: 'beitreten', v: RadRaum.VERSION, code: rh.code, k: k3, name: 'Spät' }); const fe2 = await echt.typ('fehler');
    pruefe('S1 … auch mit gültigem Token während der Sperre', fe2 && fe2.grund === 'zu_schnell', fe2 && fe2.text);
    await warte(700);
    echt.senden({ t: 'beitreten', v: RadRaum.VERSION, code: rh.code, k: k3, name: 'Spät' }); const rEcht = await echt.typ('raum'); pruefe('S1 nach Ablauf der Sperre: Token geht wieder', rEcht && rEcht.code === rh.code, rEcht);
    echt.senden({ t: 'verlassen' }); await echt.typ('verlassen');
    glob.concat([echt]).forEach(c => c.ws.close()); await warte(80);
    // Schalter-Recht: Internet-Gast nie
    g1.senden({ t: 'schalterFrage' }); const sg = await g1.typ('schalter'); pruefe('E Internet-Gast: Schalter-Recht nein (ohne Grund)', sg && sg.recht === false && !sg.grund && !sg.einladung, sg);
    g1.senden({ t: 'schalterUmschalten', an: false }); const sg2 = await g1.typ('schalter'); pruefe('E Internet-Gast kann nicht ausschalten', sg2 && sg2.recht === false);
    pruefe('E Wunsch-Datei vom Gast nicht geschrieben', !fs.existsSync(path.join(STEU, 'wunsch.json')));

    // Schalter aus → Internet-Verbindungen getrennt, Tailnet bleibt
    status('aus');
    const zu = await g1.warten(m => m.t === 'fehler' && m.grund === 'internetAus', 2000);
    await warte(300);
    pruefe('D Schalter aus → Internet-Gast bekommt „internetAus“ und wird getrennt', !!zu && g1.zu, { zu: !!zu, getrennt: g1.zu, code: g1.zuCode });
    pruefe('D Tailnet-Gastgeber bleibt verbunden', !t1.zu && t1.ws.readyState === 1);
    const lb = await t1.warten(m => m.t === 'lobby' && m.fahrer.some(f => f.name === 'Freund' && !f.online), 2000);
    pruefe('D Platz des Freundes bleibt (offline, Reconnect-Frist)', !!lb);
    const kn = await t1.warten(m => m.t === 'einladung' && m.k === null, 1500); pruefe('S1 Internet aus → Token erloschen, Gastgeber erfährt es', !!kn);
    status('an'); await warte(150);
    const g6 = await verbinden(port, '/ws-rad', FUNNEL('203.0.113.71'), 'https://' + MINI); g6.senden({ t: 'beitreten', v: RadRaum.VERSION, code: rh.code, k: k3, name: 'X' }); const fOld = await g6.typ('fehler');
    pruefe('S1 alter Token nach Aus/An ungültig', fOld && fOld.grund === 'unbekannt', fOld && fOld.grund);
    g6.ws.close(); status('aus'); await warte(150);
    const g4 = await verbinden(port, '/ws-rad', FUNNEL('203.0.113.7'), 'https://' + MINI); pruefe('D danach: Internet-Reconnect 403', g4.abgewiesen === 403, g4.abgewiesen);
    t1.ws.close();
  }

  // ---------------------------------------------------------------- E Schalter über /ws-rad (Gastgeber im Tailnet)
  {
    status('aus'); await warte(60);
    // S3: von der eigenen Radwelt (http://localhost:10100) bzw. einer anderen Tailnet-Seite: KEIN Recht, nur Status + Mini-Seite
    for (const og of ['http://localhost:10100', 'https://anderes-geraet.tailx.ts.net', 'https://mini.tailx.ts.net:8443']) {
      const x = await verbinden(port, '/ws-rad', TAILNET(), og);
      x.senden({ t: 'schalterFrage' }); const sx = await x.typ('schalter');
      x.senden({ t: 'schalterUmschalten', an: true }); const sx2 = await x.typ('schalter');
      pruefe('S3 Schalter von ' + og + ': kein Recht, Hinweis „seite“ + Status + Mini-Seite, Umschalten wirkungslos', sx && sx.recht === false && sx.grund === 'seite' && sx.funnel === 'aus' &&
        sx.miniSeite === 'https://' + MINI + '/rad/Radwelt.html' && sx2 && sx2.recht === false && !fs.existsSync(path.join(STEU, 'wunsch.json')), sx);
      x.ws.close();
    }
    const h = await verbinden(port, '/ws-rad', TAILNET(), 'https://' + MINI);
    h.senden({ t: 'schalterFrage' }); const s1 = await h.typ('schalter');
    pruefe('E Tailnet von der Mac-mini-Seite (gleiche Herkunft): Recht ja, funnel aus', s1 && s1.recht === true && s1.funnel === 'aus', s1);
    pruefe('E Einladungslink-Basis = --oeffentlich + rad/Radwelt.html', s1 && s1.einladung === 'https://' + MINI + '/rad/Radwelt.html', s1 && s1.einladung);
    pruefe('E radDa + radApp aus der Kopie', s1 && s1.radDa === true && s1.radApp === 'r9test', s1 && [s1.radDa, s1.radApp]);
    h.senden({ t: 'schalterUmschalten', an: true }); const s2 = await h.typ('schalter');
    let w = null; try { w = fs.readFileSync(path.join(STEU, 'wunsch.json'), 'utf8'); } catch (e) { /* */ }
    pruefe('E Umschalten an → Wunsch-Datei {"funnel":"an","seit":…}', /^\{"funnel":"an","seit":\d{13}\}$/.test(w || '') && s2 && s2.recht && s2.wartet === true, w);
    h.senden({ t: 'schalterUmschalten', an: false }); const s3 = await h.typ('schalter'); pruefe('E zweiter Wunsch < 5 s → zuSchnell', s3 && s3.fehler === 'zuSchnell', s3 && s3.fehler);
    // gemeinsames Rate-Limit mit dem Autorennen-Schalter
    const a = await verbinden(port, '/ws', TAILNET(), 'https://' + MINI);
    a.senden({ t: 'schalterUmschalten', an: false }); const sa = await a.typ('schalter'); pruefe('E Autorennen-/ws teilt das Rate-Limit (zuSchnell)', sa && sa.recht === true && sa.fehler === 'zuSchnell', sa);
    a.senden({ t: 'schalterFrage' }); const sa2 = await a.typ('schalter'); pruefe('E Autorennen-/ws Schalterantwort wie vorher (kein einladung-Feld)', sa2 && sa2.recht === true && sa2.einladung === undefined && sa2.funnel === 'aus', sa2);
    status('an'); await warte(60);
    h.senden({ t: 'schalterFrage' }); const s4 = await h.typ('schalter'); pruefe('E Status an → funnel an + Restzeit', s4 && s4.funnel === 'an' && s4.rest > 3500, s4 && s4.rest);
    const lok = await verbinden(port, '/ws-rad'); lok.senden({ t: 'schalterFrage' }); const s5 = await lok.typ('schalter');
    pruefe('E lokal ohne Tailscale-Merkmale: kein Recht (Grund keinTailnet)', s5 && s5.recht === false && s5.grund === 'keinTailnet', s5);
    const xo = await verbinden(port, '/ws-rad', TAILNET({ 'X-Forwarded-For': '100.101.2.3, 9.9.9.9' })); pruefe('E Tailnet-Login mit öffentlicher Adresse in XFF → als Internet behandelt, Schalter an → verbunden', !xo.abgewiesen);
    xo.senden({ t: 'schalterFrage' }); const s6 = await xo.typ('schalter'); pruefe('E … aber kein Schalter-Recht', s6 && s6.recht === false && !s6.grund, s6);
    [h, a, lok, xo].forEach(c => c.ws.close());
  }

  // ---------------------------------------------------------------- S2 höchstens 40 Internet-Verbindungen
  {
    status('an'); await warte(150);
    const l = []; for (let i = 0; i < 41; i++) l.push(await verbinden(port, '/ws-rad', FUNNEL('198.18.' + (i >> 4) + '.' + ((i & 15) + 1))));
    pruefe('S2 40 Internet-Verbindungen ok, 41. → 503', l.slice(0, 40).every(c => !c.abgewiesen && !c.fehler) && l[40].abgewiesen === 503, l.map(c => c.abgewiesen || '').filter(Boolean));
    const tn = await verbinden(port, '/ws-rad', TAILNET(), 'https://' + MINI); pruefe('S2 Tailnet-Gastgeber kommt trotzdem rein', !tn.abgewiesen && !tn.fehler, tn.abgewiesen);
    l.concat([tn]).forEach(c => { try { c.ws.close(); } catch (e) { /* */ } }); await warte(200);
    const wieder = await verbinden(port, '/ws-rad', FUNNEL('198.18.9.9')); pruefe('S2 nach dem Schließen wieder Platz', !wieder.abgewiesen, wieder.abgewiesen); wieder.ws.close();
    status('aus'); await warte(150);
  }

  // ---------------------------------------------------------------- ohne --steuerung: Internet nie
  {
    const srv2 = await starten({ port: 0, host: '127.0.0.1', leise: true, rad: RAD, daten: DATEN });
    const x = await verbinden(srv2.port, '/ws-rad', FUNNEL()); pruefe('ohne --steuerung: /ws-rad aus dem Internet → 403', x.abgewiesen === 403, x.abgewiesen);
    const y = await verbinden(srv2.port, '/ws-rad', TAILNET(), 'https://' + MINI); y.senden({ t: 'schalterFrage' }); const sy = await y.typ('schalter');
    pruefe('ohne --steuerung: Tailnet verbunden, Schalter „ohneSteuerung“', !y.abgewiesen && sy && sy.recht === false && sy.grund === 'ohneSteuerung', sy);
    y.ws.close();
    const leer = await starten({ port: 0, host: '127.0.0.1', leise: true, rad: path.join(tmp, 'gibtsnicht'), daten: DATEN });
    const r = await holen(leer.port, '/rad/Radwelt.html'); pruefe('ohne rad-Ordner: /rad/Radwelt.html → 404, Autorennen geht', r.code === 404 && (await holen(leer.port, '/')).code === 200, r.code);
    await srv2.schliessen(); await leer.schliessen();
  }

  await srv.schliessen();
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) { /* egal */ }
  console.log('\n' + ok + ' OK, ' + fehl + ' FEHL');
  process.exit(fehl ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
