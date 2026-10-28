#!/usr/bin/env node
// ============================================================
// W5-1 Mehrspieler-Server für „Jonas Hot Steering Wheel“ (Node ≥ 18, CommonJS, einzige Abhängigkeit: ws).
//
//   node server/server.js [--port 8444] [--host 0.0.0.0] [--oeffentlich https://…/] [--steuerung <Ordner>]   (oder PORT=… node server/server.js)
//   --steuerung: Internet-Schalter im Spiel (nur Wunsch-Datei schreiben/Status lesen, s. u.) – ohne = Funktion aus
//
// - Liefert das Spiel per HTTP aus (nur Autorennen.html, src/, vendor/ – kein Verzeichnis-Listing, kein `..`).
//   R6 (Internet für Freunde): /rad/… = EIGENE Kopie der Radwelt im Ordner <Spielordner>/rad (nur Radwelt.html, rad/src/, rad/vendor/;
//   Kopie macht server/autostart/rad-kopieren.sh beim Installieren). Gemeinsame Dateien von Autorennen und Radwelt überschreiben sich so nie.
//   „/“ = Autorennen.html. Funktioniert hinter einem HTTPS-Reverse-Proxy (Tailscale Funnel, cloudflared):
//   alles relativ, WebSocket unter /ws.
// - WebSocket /ws: Räume mit 4-stelligem Code (ohne 0/O/1/I), max. 6 Spieler, Zustände lobby → laden → rennen → ergebnis.
//   Protokoll: server/PROTOKOLL.md. Rennen läuft autoritativ hier (server/simulation.js, 60 Hz), Zustand 20 Hz an alle.
// - Kinder-Sicherheit: kein Chat, keine Freitexte (Namen nur aus der Fahrerliste), Raum verschwindet, wenn der Host
//   geht. Das Protokoll (Konsole) enthält keine Namen, Adressen oder Eingaben – nur Raumcodes und Zahlen.
// ============================================================
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { WebSocketServer } = require('ws');
const { laden, Simulation, einstellungenPruefen } = require('./simulation');
const RadApi = require('./radApi');                 // Radwelt R3c-D: Speicher-API (/api/rad/…, nur 127.0.0.1), eigene Datei
const Brett = require('./brettspiele');            // Brettspiele (4 gewinnt, Schach): eigener WebSocket-Pfad /ws-brett, eigene Datei
const RadRaum = require('./radRaum');              // Radwelt R4-F: „Zusammen fahren“, eigener WebSocket-Pfad /ws-rad, eigene Datei

const WURZEL = path.resolve(__dirname, '..');
const ERLAUBT = ['src', 'vendor', 'spiele'];        // Ordner, die ausgeliefert werden (dazu Autorennen.html); spiele/ = Brettspiele
const RAD_ORDNER = path.join(WURZEL, 'rad');         // R6: eigene Radwelt-Kopie (für Freunde über den Internet-Schalter); fehlt der Ordner → /rad/… = 404
const RAD_ERLAUBT = ['src', 'vendor'];               // in rad/: nur diese Ordner + rad/Radwelt.html
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml', '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg', '.json': 'application/json; charset=utf-8', '.woff2': 'font/woff2', '.ico': 'image/x-icon',
};

const R = laden();
const RAUM_NACHRICHTEN = new Set(['wahl', 'bereit', 'einstellungen', 'start', 'geladen', 'eingabe', 'zurLobby']);
const N = R.Netz;
const DT = R.config.physik.schritt;

function zufallsCode(belegt) {
  for (let k = 0; k < 1000; k++) {
    let c = '';
    for (let i = 0; i < N.CODE_LAENGE; i++) c += N.CODE_ZEICHEN[crypto.randomInt(N.CODE_ZEICHEN.length)];
    if (!belegt.has(c)) return c;
  }
  return null;
}

// ------------------------------------------------------------------ Internet-Schalter (v19, Protokoll 3)
// Der Spielserver läuft als unprivilegierter Benutzer und führt NIE Befehle aus. Er schreibt nur eine Wunsch-Datei
// (<steuerung>/wunsch.json) und liest die Status-Datei (<steuerung>/status.json) des root-Helfers
// (server/autostart/internet-schalter.sh). Ohne `--steuerung <Ordner>` ist die ganze Funktion aus.
//
// WER DARF SCHALTEN? Nur wer über das eigene Tailnet kommt (Tailscale Serve). Annahmen (Tailscale-Dokumentation „Serve“,
// geprüft 14.10.2026; auf dem Mac mini praktisch nachprüfen, siehe README):
//  1. Serve hängt bei Tailnet-Anfragen die Header `Tailscale-User-Login` / `-Name` an und ENTFERNT dabei vom Client
//     mitgeschickte Header gleichen Namens (Schutz vor Fälschung). Tagged Devices bekommen keine Header → kein Recht.
//  2. Über Funnel (öffentlich) kommen KEINE Identitäts-Header; zusätzlich setzt Funnel `Tailscale-Funnel-Request: ?1`.
//     Wir verlangen darum: Identitäts-Header da UND `Tailscale-Funnel-Request` fehlt.
//  3. Serve/Funnel verbinden sich von 127.0.0.1 (bzw. ::1) mit dem Server. Jede andere Quelladresse (WLAN, LAN) könnte die
//     Header selbst setzen → dort NIE Recht. Lokale Prozesse auf dem Mac könnten Header fälschen (der Server hört auch auf
//     dem Heimnetz; lokale Fälscher hätten aber ohnehin Zugriff auf den Mac) – darum nur Wunsch-Datei, keine Rechte.
//  4. Zusätzlich (Tiefenschutz): ist `X-Forwarded-For` gesetzt (Serve setzt die Tailnet-IP), muss jede Adresse darin eine
//     Tailscale-Adresse sein (100.64.0.0/10 oder fd7a:115c:a1e0::/48); eine öffentliche IP (Funnel) → kein Recht.
//  5. Schutz gegen fremde Webseiten (Cross-Site-WebSocket): Ein Browser im Tailnet schickt die Identität automatisch mit, auch
//     wenn eine fremde Webseite die Verbindung öffnet. Darum muss der `Origin` (falls vorhanden – Browser senden ihn immer)
//     zu Host / X-Forwarded-Host / `--oeffentlich` passen. Fehlt Origin, ist es kein Browser (z. B. curl) → erlaubt.
// Das Recht wird einmal beim Verbindungsaufbau entschieden. Die Identität selbst wird weder gespeichert noch protokolliert.
const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);
function tailnetIP(a) {
  a = String(a || '').trim().replace(/^\[|\]$/g, '').replace(/^::ffff:/i, '');
  const m = /^(\d{1,3})\.(\d{1,3})\.\d{1,3}\.\d{1,3}$/.exec(a);
  if (m) return +m[1] === 100 && +m[2] >= 64 && +m[2] <= 127;
  return /^fd7a:115c:a1e0:/i.test(a);
}
/**
 * v26: Bewertung einer WebSocket-Verbindung für den Internet-Schalter → { recht, grund, weg }.
 *   grund (Diagnose/Anzeige): 'ok' | 'oeffentlich' (Funnel/fremde IP/Cloudflare/falscher Origin – wird dem Client NIE erklärt)
 *                             | 'keinTailnet' (lokal/Heimnetz/ohne Tailscale-Merkmale – darf erklärt werden)
 *   weg: womit das Recht begründet wurde – 'identitaet' (Tailscale-User-Login) oder 'xff' (nur Tailnet-Quelladresse, s. u.).
 * Ablauf: Funnel-Header = nein → Cloudflare-/Real-IP-Header = nein → X-Forwarded-For nur Tailnet-Adressen → nur 127.0.0.1
 *   → Identität ODER Tailnet-Adresse in X-Forwarded-For → Origin.
 * v26 NEU „weg: xff“: Fehlt der Identitäts-Header (anderer tailscaled-Aufbau), genügt eine NICHT-leere X-Forwarded-For-Liste aus
 *   lauter Tailnet-Adressen – Serve setzt sie aus der echten Quelladresse des Tailnet-Geräts. Sicherheit: Fremde über Funnel tragen
 *   IMMER `Tailscale-Funnel-Request` (→ nein, wird vor allem anderen geprüft) und haben eine öffentliche Quelladresse (→ nein); ein
 *   anderer Reverse-Proxy (cloudflared) hängt die öffentliche Adresse an die Liste (→ nein) und setzt cf-*-Header (→ nein).
 *   Reines „kommt von 127.0.0.1“ reicht bewusst NICHT (das täte auch cloudflared).
 */
function schalterBewertung(req, oeffentlichHost, o) {
  const nein = (grund) => ({ recht: false, grund, weg: '' });
  try {
    const h = (req && req.headers) || {};
    if (!req || !req.socket) return nein('oeffentlich');
    if (h['tailscale-funnel-request'] !== undefined) return nein('oeffentlich');                   // Funnel nie
    if (h['cf-connecting-ip'] !== undefined || h['cf-ray'] !== undefined || h['x-real-ip'] !== undefined) return nein('oeffentlich');
    const xff = h['x-forwarded-for'];
    const xffListe = xff === undefined ? null : String(xff).split(',');
    if (xffListe && !xffListe.every(tailnetIP)) return nein('oeffentlich');                         // öffentliche Quelladresse
    if (!LOOPBACK.has(req.socket.remoteAddress)) return nein('keinTailnet');                         // Heimnetz/WLAN direkt: Header könnten gefälscht sein
    const login = h['tailscale-user-login'];
    const identOk = typeof login === 'string' && /^[^\s,<>"'\\]{1,200}$/.test(login);               // leer/doppelt/seltsam → nein
    if (login !== undefined && !identOk) return nein('keinTailnet');
    if (!identOk && !(xffListe && xffListe.length && xffListe.every(tailnetIP))) return nein('keinTailnet');
    const origin = h['origin'];
    if (origin !== undefined && !(o && o.originGeprueft === true)) {      // R6: /ws-rad prüft den Origin selbst (radRaum.originErlaubt: auch http://localhost:10100)
      let oh;
      try { const u = new URL(origin); oh = u.host.toLowerCase(); if (!/^https?:$/.test(u.protocol)) return nein('oeffentlich'); } catch (e) { return nein('oeffentlich'); }
      const ok = [h['host'], h['x-forwarded-host'], oeffentlichHost].some(x => typeof x === 'string' && x.toLowerCase() === oh);
      if (!ok) return nein('oeffentlich');
    }
    return { recht: true, grund: 'ok', weg: identOk ? 'identitaet' : 'xff' };
  } catch (e) { return nein('oeffentlich'); }
}
/** Darf diese WebSocket-Verbindung (Upgrade-Request) den Internet-Schalter bedienen? req: { socket:{remoteAddress}, headers }. */
function schalterRecht(req, oeffentlichHost) { return schalterBewertung(req, oeffentlichHost).recht; }
/** Welche Header-NAMEN (nie Werte) trägt die Anfrage? Für das Diagnose-Protokoll – damit man sieht, was tailscaled wirklich schickt. */
function schalterKopfNamen(req) {
  try {
    const h = (req && req.headers) || {};
    return Object.keys(h).filter(k => /^(tailscale-|x-forwarded-|cf-|x-real-ip|origin$|host$)/.test(k)).sort().join(',') || '-';
  } catch (e) { return '-'; }
}

/** status.json des Helfers streng lesen → { funnel:'an'|'aus'|'unbekannt', bis:ms|null, helfer? } (alt/kaputt/fehlt → unbekannt, helfer = Grund). */
function statusLesen(ordner, jetzt) {
  try {
    const f = path.join(ordner, 'status.json');
    const st = fs.lstatSync(f);
    if (!st.isFile() || st.size > 200) return { funnel: 'unbekannt', bis: null, helfer: 'kaputt' };
    const m = /^\{"funnel":"(an|aus)","bis":(\d{1,16}|null),"zeit":(\d{1,16})\}\s*$/.exec(fs.readFileSync(f, 'utf8'));
    if (!m) return { funnel: 'unbekannt', bis: null, helfer: 'kaputt' };
    if (jetzt - +m[3] > 30000) return { funnel: 'unbekannt', bis: null, helfer: 'alt' };           // Helfer schreibt alle ~5 s
    return { funnel: m[1], bis: m[2] === 'null' ? null : +m[2] };
  } catch (e) { return { funnel: 'unbekannt', bis: null, helfer: e && e.code === 'ENOENT' ? 'fehlt' : 'kaputt' }; }
}

// ------------------------------------------------------------------ statische Dateien
/** URL-Pfad → Datei im Spielordner oder null (verboten/unbekannt). radOrdner: Ordner der Radwelt-Kopie für /rad/… (Standard <Spielordner>/rad). */
function dateiFuer(urlPfad, radOrdner) {
  let p;
  try { p = decodeURIComponent(urlPfad.split('?')[0].split('#')[0]); } catch (e) { return null; }
  if (p.includes('\0') || p.includes('\\')) return null;
  if (p === '/' || p === '') p = '/Autorennen.html';
  else if (p === '/rad/') p = '/rad/Radwelt.html';      // R6
  else if (p.endsWith('/')) p += 'index.html';        // Brettspiele: /spiele/ → spiele/index.html
  const teile = p.split('/').filter(Boolean);
  if (!teile.length || teile.some(t => t === '..' || t === '.' || t.startsWith('.'))) return null;
  if (teile.some(t => t === 'vorlage_swift' || t.startsWith('_'))) return null;      // Entwicklungsdateien (_werkzeug, _alt_…, Swift-Vorlage) nie ausliefern
  if (teile[0] === 'rad') {                            // R6: nur die eigene Radwelt-Kopie (rad/Radwelt.html, rad/src/…, rad/vendor/…)
    const rest = teile.slice(1);
    if (!rest.length || !((rest.length === 1 && rest[0] === 'Radwelt.html') || (rest.length > 1 && RAD_ERLAUBT.includes(rest[0])))) return null;
    const basis = path.resolve(radOrdner || RAD_ORDNER);
    const vollR = path.resolve(basis, ...rest);
    return vollR.startsWith(basis + path.sep) ? vollR : null;
  }
  if (!(teile.length === 1 && (teile[0] === 'Autorennen.html' || teile[0] === 'Radwelt.html')) && !ERLAUBT.includes(teile[0])) return null;
  const voll = path.resolve(WURZEL, ...teile);
  if (!voll.startsWith(WURZEL + path.sep)) return null;
  return voll;
}

function httpAntwort(req, res, radOrdner) {
  const ende = (code, text) => { res.writeHead(code, { 'Content-Type': 'text/plain; charset=utf-8', 'X-Content-Type-Options': 'nosniff' }); res.end(req.method === 'HEAD' ? undefined : text); };
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.setHeader('Allow', 'GET, HEAD'); return ende(405, 'Nicht erlaubt'); }
  if (/^\/spiele(\/(vier-gewinnt|schach))?(\?.*)?$/.test(req.url || '')) {      // ohne Schrägstrich → relative Links würden brechen
    const q = (req.url.match(/\?.*$/) || [''])[0], n = req.url.replace(/\?.*$/, '').split('/').pop();
    res.writeHead(301, { Location: n + '/' + q }); return res.end();
  }
  if (/^\/rad(\?.*)?$/.test(req.url || '')) {                     // R6: /rad → /rad/Radwelt.html (Abfrage, z. B. ?raum=, bleibt)
    res.writeHead(301, { Location: '/rad/Radwelt.html' + (req.url.match(/\?.*$/) || [''])[0] }); return res.end();
  }
  const radBasis = path.resolve(radOrdner || RAD_ORDNER);
  const datei = dateiFuer(req.url || '/', radBasis);
  if (!datei) return ende(404, 'Nicht gefunden');
  // R6: in rad/ zusätzlich den echten Pfad prüfen (kein Link aus dem Ordner heraus)
  if (datei.startsWith(radBasis + path.sep)) {
    return fs.realpath(radBasis, (e1, basisEcht) => fs.realpath(datei, (e2, echt) => {
      if (e1 || e2 || !echt.startsWith(basisEcht + path.sep)) return ende(404, 'Nicht gefunden');
      ausliefern(echt);
    }));
  }
  ausliefern(datei);
  function ausliefern(datei) {
  fs.stat(datei, (err, st) => {
    if (err || !st.isFile()) return ende(404, 'Nicht gefunden');
    const typ = MIME[path.extname(datei).toLowerCase()];
    if (!typ) return ende(404, 'Nicht gefunden');
    res.writeHead(200, { 'Content-Type': typ, 'Content-Length': st.size, 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer' });
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(datei).on('error', () => res.destroy()).pipe(res);
  });
  }
}

// ------------------------------------------------------------------ Server
/**
 * Server starten. opt: { port (0 = frei), host, leise, ladenMaxMs }
 * @returns {Promise<{ port, http, wss, raeume, schliessen() }>}
 */
function starten(opt) {
  // tempo: Zeitraffer NUR für Tests (tests/test_netz.js), 1 = Echtzeit
  opt = Object.assign({ port: 8444, host: '0.0.0.0', leise: false, ladenMaxMs: 20000, tempo: 1, oeffentlich: '', steuerung: '', statistik: 0, eingabeAlt: false, rad: '' }, opt);
  const radOrdner = path.resolve(typeof opt.rad === 'string' && opt.rad ? opt.rad : RAD_ORDNER);      // R6: Radwelt-Kopie für /rad/ (Tests: eigener Ordner)
  // öffentliche Adresse (Tailscale Funnel), damit Link/QR in der Lobby auch stimmen, wenn der Host das Spiel über
  // http://localhost:8444 geöffnet hat. Nur https-Adressen ohne Pfad-Tricks.
  const oeffentlich = /^https:\/\/[a-z0-9.-]+(:\d{1,5})?\/?$/i.test(opt.oeffentlich || '') ? opt.oeffentlich.replace(/\/?$/, '/') : '';
  // Internet-Schalter: Ordner mit wunsch.json (wir schreiben) und status.json (Helfer schreibt); '' = Funktion aus
  const steuerung = typeof opt.steuerung === 'string' && opt.steuerung ? path.resolve(opt.steuerung) : '';
  let oeffentlichHost = '';
  try { if (oeffentlich) oeffentlichHost = new URL(oeffentlich).host.toLowerCase(); } catch (e) { /* egal */ }
  let letzterWunsch = { art: '', zeit: 0 };                       // Rate-Limit: 1 Umschaltung / 5 s (für alle zusammen)
  const maxSchritte = Math.ceil(6 * opt.tempo);
  const log = (...a) => { if (!opt.leise) console.log(new Date().toISOString().slice(11, 19), ...a); };
  const raeume = new Map();
  const brett = Brett.erzeugen(Object.assign({ leise: opt.leise }, opt.brett || {}));
  // R6: /ws-rad bekommt den Internet-Schalter (gleiche Wunsch-Datei, gleiche Rechte-Prüfung) und „ist das Internet gerade an?“
  const radRaum = RadRaum.erzeugen(Object.assign({ leise: opt.leise, oeffentlich,
    internetAn: () => !!steuerung && statusLesen(steuerung, Date.now()).funnel === 'an',
    schalter: {
      // R6-2: Recht nur mit der STRENGEN Origin-Prüfung wie /ws; „lose“ (ohne Origin-Abgleich, radRaum hat den Origin geprüft) nur für den Status-Hinweis
      bewerten: (req) => { const b = schalterBewertung(req, oeffentlichHost); if (!steuerung) b.recht = false; schalterProtokoll(b, req); return b; },
      bewertenLose: (req) => { const b = schalterBewertung(req, oeffentlichHost, { originGeprueft: true }); if (!steuerung) b.recht = false; return b; },
      status: () => { const st = steuerung ? statusLesen(steuerung, Date.now()) : { funnel: 'unbekannt', bis: null };
        return { funnel: st.funnel, rest: st.funnel === 'an' && st.bis ? Math.max(0, Math.round((st.bis - Date.now()) / 1000)) : null, miniSeite: oeffentlich ? oeffentlich + 'rad/Radwelt.html' : '' }; },
      frage: (b) => radSchalterExtra(schalterMeldung(b.recht, b.recht ? '' : b.grund)),
      umschalten: (b, an) => radSchalterExtra(schalterWunsch(b.recht, b.recht ? '' : b.grund, an)),
    } }, opt.radRaum || {}));
  /** Zusatz für die Radwelt-Lobby (nur mit Recht): Einladungslink-Basis, liegt die Radwelt-Kopie auf dem Server, welche Mehrspieler-Version hat sie. */
  let radInfo = { t: 0, da: false, app: '' };
  function radSchalterExtra(m) {
    if (!m || !m.recht) return m;
    if (Date.now() - radInfo.t > 10000) {
      let da = false, app = '';
      try { da = fs.statSync(path.join(radOrdner, 'Radwelt.html')).isFile(); } catch (e) { /* fehlt */ }
      try { const x = /MP_APP\s*=\s*'([a-z0-9_-]{1,24})'/.exec(fs.readFileSync(path.join(radOrdner, 'src', 'rad', 'mehrspieler.js'), 'utf8')); app = x ? x[1] : ''; } catch (e) { /* fehlt */ }
      radInfo = { t: Date.now(), da, app };
    }
    m.einladung = oeffentlich ? oeffentlich + 'rad/Radwelt.html' : '';
    m.radDa = radInfo.da; m.radApp = radInfo.app;
    return m;
  }
  const fahrerNamen = R.config.fahrer.map(f => f.name);
  const autoIds = R.carCatalog.waehlbare().map(a => a.id);
  const hilfen = Object.keys(R.config.fahrhilfen);
  let verbindungen = 0;
  const MAX_PRO_IP = 8, MAX_RAEUME_PRO_IP = 5, TEUER_MS = 3000, BEITRITT_FENSTER_MS = 10000, BEITRITT_FEHLER = 5;   // v27 F4
  const proIp = new Map();

  const radApi = RadApi.erzeugen({ daten: opt.daten });      // Radwelt-Ablage: --daten bzw. RADWELT_DATEN, Standard ~/Documents/Radwelt-Projekt/Daten
  if (radApi.aufgeraeumt) console.log('Radwelt-Ablage: ' + radApi.aufgeraeumt + ' Waisen-/Temp-Datei(en) aufgeräumt');
  const srv = http.createServer((req, res) => { if (!radApi.behandeln(req, res)) httpAntwort(req, res, radOrdner); });
  const wss = new WebSocketServer({ noServer: true, maxPayload: 4096, perMessageDeflate: false, clientTracking: true });
  srv.on('upgrade', (req, socket, kopf) => {
    let pfad = '';
    try { pfad = new URL(req.url, 'http://x').pathname; } catch (e) { /* ungültig */ }
    if (pfad === Brett.PFAD) return brett.upgrade(req, socket, kopf);       // Brettspiele (eigenes Protokoll, eigene Limits)
    if (pfad === RadRaum.PFAD) return radRaum.upgrade(req, socket, kopf);   // Radwelt-Mehrspieler (eigenes Protokoll, Origin-Schutz, eigene Limits)
    if (pfad !== N.PFAD || verbindungen >= 80) { socket.write('HTTP/1.1 404 Not Found\r\n\r\n'); socket.destroy(); return; }
    // v27 F4: Limit je Adresse (wie Brettspiele MAX_PRO_IP): Schlüssel = erste X-Forwarded-For-Adresse; lokale Verbindungen ohne Header zählen nicht
    let ipKey = null;
    const xff = req.headers && req.headers['x-forwarded-for'];
    if (typeof xff === 'string' && xff.trim()) ipKey = xff.split(',')[0].trim().slice(0, 64);
    if (ipKey && (proIp.get(ipKey) || 0) >= MAX_PRO_IP) { socket.write('HTTP/1.1 429 Too Many Requests\r\n\r\n'); socket.destroy(); return; }
    const bew = schalterBewertung(req, oeffentlichHost);
    if (!steuerung) bew.recht = false;                     // Funktion aus: nie Recht (der Grund „ohneSteuerung“ wird nur Tailnet-Geräten erklärt, s. schalterAntwort)
    schalterProtokoll(bew, req);
    wss.handleUpgrade(req, socket, kopf, (ws) => {
      if (ipKey) { ws.ipKey = ipKey; proIp.set(ipKey, (proIp.get(ipKey) || 0) + 1); }
      wss.emit('connection', ws, req, bew);
    });
  });

  // v26 Diagnose: pro Kombination (Ergebnis + Header-Namen) nur EINMAL eine Zeile ins Protokoll (höchstens 30) – ohne Namen/Adressen/Werte.
  const protokolliert = new Set();
  function schalterProtokoll(bew, req) {
    if (opt.leise) return;
    const namen = schalterKopfNamen(req), schl = (steuerung ? 'S' : 'o') + bew.recht + bew.grund + bew.weg + namen;
    if (protokolliert.has(schl) || protokolliert.size >= 30) return;
    protokolliert.add(schl);
    log('Internet-Schalter: ' + (steuerung ? '' : '(ohne --steuerung) ') + (bew.recht ? 'Recht (' + bew.weg + ')' : 'KEIN Recht (' + bew.grund + ')') + ' · Quelle ' +
      (LOOPBACK.has(req.socket.remoteAddress) ? 'lokal/Proxy' : 'direkt') + ' · Header: ' + namen);
  }

  const senden = (ws, obj) => { if (ws.readyState === 1) ws.send(typeof obj === 'string' ? obj : JSON.stringify(obj)); };
  const fehler = (ws, grund, text) => senden(ws, { t: 'fehler', grund, text });

  function lobbySenden(raum, hinweis) {
    const spieler = raum.spieler.map((c, i) => ({ id: c.id, nr: i, fahrer: c.fahrer, auto: c.auto, hilfe: c.hilfe, bereit: c === raum.host || !!c.bereit, istHost: c === raum.host }));
    for (const c of raum.spieler) {
      senden(c.ws, { t: 'lobby', code: raum.code, zustand: raum.zustand, du: c.id, spieler, einstellungen: raum.einstellungen,
        max: N.MAX_SPIELER, hinweis: hinweis || undefined, oeffentlich: oeffentlich || undefined });
    }
  }

  function freierFahrer(raum, wunsch) {
    const belegt = new Set(raum.spieler.map(c => c.fahrer));
    if (fahrerNamen.includes(wunsch) && !belegt.has(wunsch)) return wunsch;
    return fahrerNamen.find(n => !belegt.has(n)) || null;
  }

  function raumSchliessen(raum, grund) {
    for (const c of raum.spieler) {
      if (c !== raum.host) senden(c.ws, { t: 'raumZu', grund });
      c.raum = null; c.bereit = false; c.eingaben = [];
    }
    raeume.delete(raum.code);
    log('Raum ' + raum.code + ' geschlossen (' + grund + '), offen: ' + raeume.size);
  }

  /** Verbindung verlässt ihren Raum (Nachricht „verlassen“ oder Verbindung weg). */
  function verlassen(c, grund) {
    const raum = c.raum;
    if (!raum) return;
    if (c === raum.host) { raumSchliessen(raum, 'host'); return; }
    const nr = raum.spieler.indexOf(c);
    raum.spieler.splice(nr, 1);
    c.raum = null; c.bereit = false;
    if ((raum.zustand === 'rennen' || raum.zustand === 'laden') && raum.sim && c.simNr >= 0) {
      raum.sim.zuKI(c.simNr);
      for (const d of raum.spieler) senden(d.ws, { t: 'ereignis', art: 'weg', nr: c.simNr, text: '🚪 ' + c.fahrer + ' ist weg – Computer fährt weiter' });
    }
    c.simNr = -1;
    lobbySenden(raum);
    log('Raum ' + raum.code + ': Spieler weg (' + grund + '), jetzt ' + raum.spieler.length);
  }

  function rennenStarten(raum) {
    const spieler = raum.spieler.slice();
    let sim;
    try {
      sim = new Simulation({ einstellungen: raum.einstellungen, spieler: spieler.map(c => ({ fahrer: c.fahrer, auto: c.auto, hilfe: c.hilfe })),
        seed: crypto.randomInt(1, 2 ** 31) });
    } catch (e) {
      console.error('Simulation konnte nicht gebaut werden:', e && e.stack);
      for (const c of spieler) fehler(c.ws, 'intern', 'Rennen konnte nicht gestartet werden');
      return;
    }
    raum.sim = sim;
    raum.zustand = 'laden';
    raum.ladenSeit = Date.now();
    raum.acc = 0;
    raum.letzteZeit = null;
    const info = sim.startInfo();
    spieler.forEach((c, i) => {
      c.simNr = i; c.geladen = false; c.eingaben = []; c.ack = -1; c.letzteN = -1; c.letzteEingabe = Date.now();
      c.minQ = Infinity; c.qTicks = 0; c.verworfen = 0;
      c.ziel = 2; c.erw = null; c.fensterT = 0; c.leerFenster = 0; c.tiefeMin = Infinity; c.ruhe = 0; c.halten = 0; c.haltenT = 0; c.auslassen = false; c.spaetTicks = 0; c.spaetMax = 0;   // v23 eingabeTick
      senden(c.ws, Object.assign({ t: 'start', du: i }, info));
    });
    log('Raum ' + raum.code + ': Rennen wird geladen (' + spieler.length + ' Spieler, ' + sim.einstellungen.gegner + ' Computer, ' + sim.einstellungen.streckeId + ')');
  }

  function ergebnisSenden(raum) {
    const erg = raum.sim.ergebnis();
    raum.zustand = 'ergebnis';
    for (const c of raum.spieler) { c.bereit = false; senden(c.ws, Object.assign({ t: 'ergebnis' }, erg)); }
    raum.sim = null;
    log('Raum ' + raum.code + ': Rennen fertig');
  }

  /** Antwort auf schalterFrage/schalterUmschalten. Ohne Recht antworten Funnel-/Fremd-Verbindungen immer nur { recht:false } – verrät nichts.
   *  Tailnet-/lokale Verbindungen (grund 'keinTailnet') bekommen zusätzlich einen Grund, damit das Spiel erklären kann, warum der Knopf fehlt:
   *  'ohneSteuerung' (Server ohne --steuerung, aber Gerät sieht aus wie Tailnet) oder 'keinTailnet' (lokal/Heimnetz/ohne Tailscale-Merkmale). */
  function schalterAntwort(c, extra) { senden(c.ws, schalterMeldung(c.schalter, c.schalterGrund, extra)); }
  /** R6: Inhalt der Schalter-Antwort (auch für /ws-rad). recht/grund wie c.schalter/c.schalterGrund. */
  function schalterMeldung(recht, schalterGrund, extra) {
    if (!steuerung || !recht) {
      const m = { t: 'schalter', recht: false };
      if (schalterGrund === 'keinTailnet') m.grund = 'keinTailnet';
      else if (!steuerung && schalterGrund === 'ok') m.grund = 'ohneSteuerung';          // Gerät hätte Recht, nur die Funktion ist aus
      return m;
    }
    const jetzt = Date.now();
    const st = statusLesen(steuerung, jetzt);
    const seitWunsch = jetzt - letzterWunsch.zeit;
    let wartet = false, haengt = false;
    if (letzterWunsch.art && st.funnel === letzterWunsch.art) letzterWunsch.art = '';          // Wunsch erfüllt → später kein falscher „hängt“-Alarm (z. B. Handaufruf AUS)
    if (letzterWunsch.art && st.funnel !== 'unbekannt' && letzterWunsch.art !== st.funnel) {
      if (seitWunsch < 20000) wartet = true;
      else if (seitWunsch < 300000) haengt = true;               // Helfer lebt (frischer Status), hat den Wunsch aber nicht umgesetzt (z. B. Funnel in Tailscale nicht erlaubt)
    }
    const m = Object.assign({ t: 'schalter', recht: true, funnel: st.funnel, wartet,
      rest: st.funnel === 'an' && st.bis ? Math.max(0, Math.round((st.bis - jetzt) / 1000)) : null }, extra || {});
    if (haengt) m.haengt = letzterWunsch.art;
    if (st.helfer) m.helfer = st.helfer;                         // 'fehlt' | 'alt' | 'kaputt' – warum der Status unbekannt ist
    return m;
  }

  function schalterUmschalten(c, an) { senden(c.ws, schalterWunsch(c.schalter, c.schalterGrund, an)); }
  /** R6: Wunsch schreiben (Rate-Limit 1 / 5 s für /ws und /ws-rad zusammen) → Schalter-Antwort. */
  function schalterWunsch(recht, schalterGrund, an) {
    const antwort = (extra) => schalterMeldung(recht, schalterGrund, extra);
    if (!steuerung || !recht) return antwort();
    const jetzt = Date.now();
    if (jetzt - letzterWunsch.zeit < 5000) return antwort({ fehler: 'zuSchnell' });
    const art = an === true ? 'an' : 'aus';
    try {
      // feste Form, nur zwei mögliche Werte + Zeit; der Helfer prüft sie noch einmal streng
      fs.writeFileSync(path.join(steuerung, 'wunsch.json'), JSON.stringify({ funnel: art, seit: jetzt }), { mode: 0o644 });
    } catch (e) {
      console.error('Internet-Schalter: wunsch.json nicht beschreibbar (' + (e && e.code) + ') – installieren.command erneut ausführen');
      return antwort({ fehler: 'schreiben', code: String((e && e.code) || '').slice(0, 12) });
    }
    letzterWunsch = { art, zeit: jetzt };
    log('Internet-Schalter: ' + art + ' gewünscht');
    return antwort();
  }

  // --- Nachrichten ---
  function nachricht(c, m) {
    const raum = c.raum;
    switch (m.t) {
      case 'hallo':
        senden(c.ws, { t: 'hallo', v: N.VERSION, id: c.id });
        return;
      case 'ping':
        senden(c.ws, { t: 'pong', z: typeof m.z === 'number' ? m.z : 0, k: raum && raum.sim ? raum.sim.tick : 0 });
        return;
      case 'schalterFrage':
        return schalterAntwort(c);
      case 'schalterUmschalten':
        return schalterUmschalten(c, m.an);
      case 'raumErstellen': {
        if (Date.now() - (c.erstelltAm || 0) < TEUER_MS) return fehler(c.ws, 'zu_schnell', 'Bitte einen Moment warten');   // v27 F4 (M2/H1)
        c.erstelltAm = Date.now();
        if (raum) verlassen(c, 'neuer Raum');
        if (raeume.size >= 30) return fehler(c.ws, 'voll', 'Zu viele Räume – später nochmal');
        if (c.ws.ipKey) { let n = 0; for (const r of raeume.values()) if (r.host && r.host.ws && r.host.ws.ipKey === c.ws.ipKey) n++; if (n >= MAX_RAEUME_PRO_IP) return fehler(c.ws, 'voll', 'Zu viele Räume von dieser Adresse'); }   // v27 F4 (H2)
        const code = zufallsCode(new Set(raeume.keys()));
        const neu = { code, host: c, spieler: [c], zustand: 'lobby', einstellungen: einstellungenPruefen(m.einstellungen || {}, 1), sim: null };
        raeume.set(code, neu);
        c.raum = neu; c.bereit = true;
        c.fahrer = fahrerNamen.includes(m.fahrer) ? m.fahrer : fahrerNamen[0];
        c.auto = autoIds.includes(m.auto) ? m.auto : autoIds[0];
        c.hilfe = hilfen.includes(m.hilfe) ? m.hilfe : R.config.fahrhilfeStandard;
        senden(c.ws, { t: 'raum', code, du: c.id, host: true });
        lobbySenden(neu);
        log('Raum ' + code + ' erstellt, offen: ' + raeume.size);
        return;
      }
      case 'raumBeitreten': {
        // v27 F4 (M2): höchstens 5 Fehlversuche je 10 s je Verbindung
        const jetztB = Date.now();
        c.beitrittFehler = (c.beitrittFehler || []).filter(t => jetztB - t < BEITRITT_FENSTER_MS);
        if (c.beitrittFehler.length >= BEITRITT_FEHLER) return fehler(c.ws, 'zu_schnell', 'Zu viele falsche Codes – kurz warten');
        const code = N.codeNormal(m.code);
        const ziel = code && raeume.get(code);
        if (!ziel) { c.beitrittFehler.push(jetztB); return fehler(c.ws, 'unbekannt', 'Diesen Raum gibt es nicht'); }
        if (ziel === raum) return lobbySenden(ziel);
        if (ziel.spieler.length >= N.MAX_SPIELER) return fehler(c.ws, 'voll', 'Der Raum ist voll (6 Spieler)');
        if (ziel.zustand === 'laden' || ziel.zustand === 'rennen') return fehler(c.ws, 'laeuft', 'Dort läuft gerade ein Rennen – gleich nochmal versuchen');
        if (raum) verlassen(c, 'Raumwechsel');
        c.fahrer = freierFahrer(ziel, m.fahrer);
        c.auto = autoIds.includes(m.auto) ? m.auto : autoIds[0];
        c.hilfe = hilfen.includes(m.hilfe) ? m.hilfe : R.config.fahrhilfeStandard;
        c.bereit = false;
        ziel.spieler.push(c);
        c.raum = ziel;
        // Kollisionen-Schalter (Stufe 2) und KI-Zahl an die neue Spielerzahl anpassen
        ziel.einstellungen = einstellungenPruefen(ziel.einstellungen, ziel.spieler.length);
        senden(c.ws, { t: 'raum', code: ziel.code, du: c.id, host: false });
        lobbySenden(ziel);
        log('Raum ' + ziel.code + ': Spieler dazu, jetzt ' + ziel.spieler.length);
        return;
      }
      case 'verlassen':
        verlassen(c, 'verlassen');
        senden(c.ws, { t: 'verlassen' });
        return;
    }
    if (!RAUM_NACHRICHTEN.has(m.t)) return fehler(c.ws, 'unbekannt', 'Unbekannte Nachricht');
    if (!raum) return fehler(c.ws, 'keinRaum', 'Du bist in keinem Raum');
    switch (m.t) {
      case 'wahl': {
        if (raum.zustand !== 'lobby' && raum.zustand !== 'ergebnis') return;
        if (m.fahrer !== undefined) {
          if (!fahrerNamen.includes(m.fahrer)) return fehler(c.ws, 'ungueltig', 'Unbekannter Fahrer');
          if (raum.spieler.some(d => d !== c && d.fahrer === m.fahrer)) { fehler(c.ws, 'fahrerVergeben', 'Diesen Fahrer hat schon jemand'); return lobbySenden(raum); }
          c.fahrer = m.fahrer;
        }
        if (m.auto !== undefined) { if (!autoIds.includes(m.auto)) return fehler(c.ws, 'ungueltig', 'Unbekanntes Auto'); c.auto = m.auto; }
        if (m.hilfe !== undefined) { if (!hilfen.includes(m.hilfe)) return fehler(c.ws, 'ungueltig', 'Unbekannte Fahrhilfe'); c.hilfe = m.hilfe; }
        lobbySenden(raum);
        return;
      }
      case 'bereit':
        if (raum.zustand !== 'lobby' && raum.zustand !== 'ergebnis') return;
        c.bereit = !!m.an;
        lobbySenden(raum);
        return;
      case 'einstellungen':
        if (c !== raum.host) return fehler(c.ws, 'nurHost', 'Nur der Host darf das ändern');
        if (raum.zustand !== 'lobby' && raum.zustand !== 'ergebnis') return;
        raum.einstellungen = einstellungenPruefen(Object.assign({}, raum.einstellungen, m.einstellungen || {}), raum.spieler.length);
        lobbySenden(raum);
        return;
      case 'start':
        if (c !== raum.host) return fehler(c.ws, 'nurHost', 'Nur der Host startet das Rennen');
        if (raum.zustand !== 'lobby' && raum.zustand !== 'ergebnis') return;
        if (raum.spieler.some(d => d !== raum.host && !d.bereit)) return fehler(c.ws, 'nichtBereit', 'Noch nicht alle sind bereit');
        if (Date.now() - (c.startAm || 0) < TEUER_MS) return fehler(c.ws, 'zu_schnell', 'Bitte einen Moment warten');   // v27 F4 (H1)
        c.startAm = Date.now();
        rennenStarten(raum);
        return;
      case 'geladen':
        if (raum.zustand === 'laden') {
          c.geladen = true;
          // v22 (additiv, Protokoll-Version bleibt 4): optional k = Münzen-Guthaben des Fahrers (ganze Zahl 0 … 99999) – nur für „Polizei freikaufen“ (10 Münzen)
          if (raum.sim && c.simNr >= 0 && Number.isInteger(m.k)) raum.sim.kontoSetzen(c.simNr, Math.max(0, Math.min(99999, m.k)));
        }
        return;
      case 'eingabe': {
        if (raum.zustand !== 'rennen' && raum.zustand !== 'laden') return;
        const n = m.n;
        if (!Number.isInteger(n) || n <= c.letzteN || n > c.letzteN + 100000) return;
        c.letzteN = n;
        const e = { n, s: N.eingabeDekodieren(m), i: m.i === 1, r: m.r === 1, f: m.f === 1, d: m.d === 1 };   // d: v24 Dach-Geste
        c.eingaben.push(e);
        if (c.eingaben.length > 45) {        // > 3/4 s gepuffert (Paketstau, sehr langsames Gerät): Älteste verwerfen, Tasten-Flanken behalten
          c.erw = null;                      // v23: neu ausrichten (eingabeTick)
          const weg = c.eingaben.splice(0, c.eingaben.length - 10);
          if (weg.some(x => x.i)) c.eingaben[0].i = true;
          if (weg.some(x => x.r)) c.eingaben[0].r = true;
          if (weg.some(x => x.f)) c.eingaben[0].f = true;
          if (weg.some(x => x.d)) c.eingaben[0].d = true;
        }
        return;
      }
      case 'zurLobby':
        if (c !== raum.host || raum.zustand !== 'ergebnis') return;
        raum.zustand = 'lobby';
        raum.spieler.forEach(d => { d.bereit = false; });
        lobbySenden(raum);
        return;
      default:
        fehler(c.ws, 'unbekannt', 'Unbekannte Nachricht');
    }
  }

  wss.on('connection', (ws, req, bew) => {
    verbindungen++;
    if (typeof bew !== 'object' || !bew) bew = { recht: bew === true, grund: bew === true ? 'ok' : 'oeffentlich' };
    const c = { ws, schalter: bew.recht === true, schalterGrund: bew.recht === true ? '' : bew.grund, id: crypto.randomBytes(4).toString('hex'), raum: null, lebt: true, eingaben: [], simNr: -1, letzteN: -1, ack: -1,
      zaehler: 0, zaehlerSeit: Date.now() };
    ws.on('pong', () => { c.lebt = true; });
    ws.on('message', (daten, binaer) => {
      c.lebt = true;
      // einfache Bremse: > 400 Nachrichten/s → ignorieren, > 2000 → trennen
      const jetzt = Date.now();
      if (jetzt - c.zaehlerSeit > 1000) { c.zaehler = 0; c.zaehlerSeit = jetzt; }
      if (++c.zaehler > 2000) { ws.terminate(); return; }
      if (c.zaehler > 400 || binaer) return;
      let m;
      try { m = JSON.parse(daten.toString('utf8')); } catch (e) { return fehler(ws, 'json', 'Ungültige Nachricht'); }
      if (!m || typeof m !== 'object' || Array.isArray(m) || typeof m.t !== 'string') return fehler(ws, 'json', 'Ungültige Nachricht');
      try { nachricht(c, m); } catch (e) { console.error('Fehler bei Nachricht', m.t, e && e.stack); fehler(ws, 'intern', 'Interner Fehler'); }
    });
    ws.on('close', () => {
      verbindungen--; verlassen(c, 'Verbindung zu');
      if (ws.ipKey) { const n = (proIp.get(ws.ipKey) || 1) - 1; if (n <= 0) proIp.delete(ws.ipKey); else proIp.set(ws.ipKey, n); }
    });
    ws.on('error', () => {});
    c.herz = setInterval(() => {
      if (!c.lebt) { ws.terminate(); return; }
      c.lebt = false;
      try { ws.ping(); } catch (e) { /* zu */ }
    }, N.HERZSCHLAG_MS);
    ws.on('close', () => clearInterval(c.herz));
  });

  // --- Server-Tick-Statistik (v23 Online-Ruckeln): nur Zahlen, keine Namen. opt.statistik = Sekunden zwischen den Zeilen (0 = aus) ---
  // Je Raum: Dauer eines Schleifendurchgangs (Schritte + Senden), Abstand der Zustand-Sendungen (soll 50 ms), Verspätung der Schleife
  // (setInterval-Drift), je Mensch: Ticks ohne Eingabe in der Warteschlange („leer“ = Server rechnet ohne frische Eingabe), verworfene, Länge.
  const fensterNeu = () => ({ n: 0, a: [] });
  const fensterZu = (w) => {
    if (!w.n) return { n: 0, p50: 0, p99: 0, max: 0 };
    const s = w.a.slice().sort((x, y) => x - y), p = (q) => +s[Math.min(s.length - 1, Math.floor(s.length * q))].toFixed(2);
    return { n: w.n, p50: p(0.5), p99: p(0.99), max: +s[s.length - 1].toFixed(2) };
  };
  const fensterAdd = (w, x) => { w.n++; if (w.a.length < 4000) w.a.push(x); };
  function statNeu() { return { dauer: fensterNeu(), abstand: fensterNeu(), lag: fensterNeu(), letzteSendung: 0, seit: 0 }; }
  function statAusgeben(raum, jetzt) {
    const s = raum.stat;
    if (!s || !opt.statistik) return;
    if (!s.seit) { s.seit = jetzt; return; }
    if (jetzt - s.seit < opt.statistik * 1000) return;
    const sp = raum.spieler.filter(c => c.simNr >= 0).map(c => ({ leer: c.statLeer || 0, verworfen: c.verworfen || 0, q: fensterZu(c.statQ || fensterNeu()) }));
    const zeile = { raum: raum.code, sek: +((jetzt - s.seit) / 1000).toFixed(1), tick: fensterZu(s.dauer), zustandAbstand: fensterZu(s.abstand), schleifenLag: fensterZu(s.lag), spieler: sp };
    raum.statLetzte = zeile;
    if (!opt.leise) console.log('STAT ' + JSON.stringify(zeile));
    raum.stat = statNeu(); raum.stat.seit = jetzt;
    for (const c of raum.spieler) { c.statLeer = 0; c.verworfen = 0; c.statQ = fensterNeu(); }
  }

  // --- Eingaben je Tick ---
  const flankenAnwenden = (sim, c, e) => { if (e.r) sim.reset(c.simNr); if (e.i) sim.item(c.simNr); if (e.f) sim.freikaufen(c.simNr); if (e.d) sim.dachGeste(c.simNr); };

  /**
   * v23 (Online-Ruckeln): Eingabe nach INDEX statt „eine Eingabe je Tick aus der Warteschlange“.
   * Problem v22b: Kam in einem Tick keine Eingabe (Netz-Zittern, Burst), rechnete der Server den Wagen mit der alten Eingabe weiter, die Bestätigung (ack)
   * blieb aber stehen → der Server stand danach „einen Schritt weiter“ als die Bestätigung sagt → die Vorhersage im Browser (Zustand + Replay ab ack) sprang
   * je leerem Tick um einen Schritt (0,5–1 m bei 30–60 m/s) VORWÄRTS, und das spätere Kürzen der Warteschlange sprang wieder zurück.
   * Jetzt: `erw` = Nummer der Eingabe, die in diesem Tick fällig ist; sie rückt mit JEDEM Tick um 1 vor (ack = erw, Server-Zustand und Bestätigung laufen
   * im Gleichschritt). Liegt die fällige Eingabe nicht da, wird mit der letzten weitergerechnet (nur der INHALT weicht ab, nicht die Anzahl der Schritte);
   * kommt sie später doch, ist sie überholt und wird verworfen (Item/Reset/Freikaufen-Flanken bleiben erhalten). Die Tiefe (Eingaben, die vorab bereitliegen)
   * passt sich an: kommen in 0,5 s mindestens 3 Ticks mit überholten Eingaben (oder 3 leere Ticks) vor – das ist KEIN einmaliger Aussetzer (der wird
   * einfach überbrückt), sondern ein Dauerzustand wie ein Gerät mit wenigen Bildern je Sekunde, das die Eingaben in Paketen schickt –, wächst das Ziel sofort um die
   * größte Verspätung (höchstens 16 Ticks); die Pause dafür (`halten`) ist ein einmaliger Sprung der Vorhersage. 10 s ruhig → Ziel −1, dauerhaft Überschuss → eine
   * Eingabe auslassen. Ganz neu ausrichten (Hintergrund-Tab, Paketstau): `erw = null`.
   */
  function eingabeTick(c, sim, jetzt) {
    const q = c.eingaben;
    if (!c.statQ) c.statQ = fensterNeu();
    if (c.ziel === undefined) { c.ziel = 2; c.erw = null; c.fensterT = 0; c.leerFenster = 0; c.tiefeMin = Infinity; c.ruhe = 0; c.halten = 0; c.haltenT = 0; c.auslassen = false; c.spaetTicks = 0; c.spaetMax = 0; }
    if (c.erw === null || c.erw === undefined) {
      if (!q.length) { fensterAdd(c.statQ, 0); return; }
      const neuest = q[q.length - 1].n;
      c.erw = neuest - c.ziel + 1;                             // die letzten `ziel` Eingaben liegen bereit
      c.fensterT = 0; c.leerFenster = 0; c.tiefeMin = Infinity;
    }
    if (c.halten > 0 && ++c.haltenT >= 6) {                    // Ziel wurde erhöht: jeder 6. Tick nimmt nichts (Tiefe wächst um 1; verteilt, damit die Vorhersage nicht auf einmal springt)
      c.haltenT = 0; c.halten--;
      fensterAdd(c.statQ, q.length);
      return;
    }
    // überholte Eingaben (n < erw) verwerfen, Flanken sofort anwenden; Lücke > 3: neu ausrichten
    let spaetL = 0, letzteN = -1;
    while (q.length && q[0].n < c.erw) { spaetL = Math.max(spaetL, c.erw - q[0].n); letzteN = q[0].n; flankenAnwenden(sim, c, q[0]); q.shift(); c.verworfen = (c.verworfen || 0) + 1; }
    if (spaetL) {
      c.spaetTicks++; c.spaetMax = Math.max(c.spaetMax, spaetL);
      // Der Strom hängt weit hinter der Fälligkeit (Fenster war > 0,3 s still, Aussetzer, Ruhezustand) und nichts Rechtzeitiges ist dabei: auf den Strom neu ausrichten,
      // sonst wären ALLE späteren Eingaben ebenfalls „überholt“ und das Auto bliebe für immer unbedient. (Ein Aussetzer mit Burst danach hat rechtzeitige Eingaben dabei → kein Neuabgleich.)
      if (!q.length && c.erw - letzteN > 8) { c.erw = letzteN + 1 - c.ziel; c.halten = 0; c.haltenT = 0; }
    }
    if (c.auslassen) {                                         // dauerhafter Überschuss: eine Eingabe auslassen (ack springt um 2)
      c.auslassen = false;
      if (q.length > 1 && q[0].n === c.erw) { flankenAnwenden(sim, c, q[0]); q.shift(); c.erw++; c.verworfen = (c.verworfen || 0) + 1; }
    }
    if (q.length && q[0].n > c.erw + 3) c.erw = q[0].n;
    const e = q.length && q[0].n === c.erw ? q.shift() : null;
    if (e) {
      sim.eingabeSetzen(c.simNr, e.s); c.letzteEingabe = jetzt; c.warLeer = false;
      flankenAnwenden(sim, c, e);
    } else {
      c.statLeer = (c.statLeer || 0) + 1;
      if (!c.warLeer) c.leerFenster++;                           // gezählt wird jede neue Lücke, nicht jeder leere Tick (ein langer Aussetzer ist EIN Ereignis)
      c.warLeer = true;
      // Tab im Hintergrund: nach 0,7 s ohne Eingabe rollt das Auto ohne Gas (v22b: 0,3 s – ein Netz-Aussetzer von 0,3 s riss dann Lenkung und Gas weg:
      // Auto in der Kurve geradeaus, Abweichung 3–4 m = harte Korrektur). Neue Browser schicken im Hintergrund selbst neutrale Eingaben.
      if (jetzt - c.letzteEingabe > 700) sim.eingabeSetzen(c.simNr, { gas: 0, bremse: 0, lenkung: 0 });
    }
    c.ack = c.erw;                                             // dieser Tick deckt die Eingabe `erw` ab (echt oder gehalten)
    c.erw++;
    fensterAdd(c.statQ, q.length);
    c.tiefeMin = Math.min(c.tiefeMin, q.length);
    // Tiefe anpassen (alle 0,5 s)
    if (++c.fensterT >= 30) {
      if (c.halten > 0) { /* Ziel wird gerade erst erreicht: nicht noch einmal erhöhen */ }
      else if (c.spaetTicks >= 3 || c.leerFenster >= 3) {
        const neu = Math.min(16, c.ziel + Math.max(1, c.spaetMax));
        if (neu > c.ziel) { c.halten = neu - c.ziel; c.ziel = neu; }
        c.ruhe = 0;
      } else if (++c.ruhe >= 20 && c.ziel > 2) { c.ziel--; c.ruhe = 0; }
      if (c.tiefeMin !== Infinity && c.tiefeMin >= c.ziel + 2) {
        if (c.tiefeMin >= 20) c.erw = null; else c.auslassen = true;     // riesiger Überschuss (Burst/Hintergrund): neu ausrichten
      }
      c.fensterT = 0; c.leerFenster = 0; c.tiefeMin = Infinity; c.spaetTicks = 0; c.spaetMax = 0;
    }
  }

  /** v22b (nur Vergleich/Test: --eingabe-alt): eine Eingabe je Tick aus der Warteschlange, leere Ticks rechnen mit der alten Eingabe ohne ack. */
  function eingabeTickAlt(c, sim, jetzt) {
    // Warteschlange klein halten: war sie eine ganze Sekunde lang nie kürzer als 3 (Paketstau/Uhren-Drift über
    // Mobilfunk), werden die überzähligen ältesten Eingaben verworfen (Item/Reset bleiben) → kein wachsender Verzug.
    c.minQ = Math.min(c.minQ, c.eingaben.length);
    if (++c.qTicks >= 60) {
      if (c.minQ > 2 && c.minQ < Infinity) {
        const weg = c.eingaben.splice(0, c.minQ - 2);
        if (weg.some(x => x.i)) c.eingaben[0].i = true;
        if (weg.some(x => x.r)) c.eingaben[0].r = true;
        if (weg.some(x => x.f)) c.eingaben[0].f = true;
        if (weg.some(x => x.d)) c.eingaben[0].d = true;
        c.verworfen = (c.verworfen || 0) + weg.length;
      }
      c.minQ = Infinity; c.qTicks = 0;
    }
    if (!c.statQ) c.statQ = fensterNeu();
    fensterAdd(c.statQ, c.eingaben.length);
    const e = c.eingaben.shift();
    if (!e) c.statLeer = (c.statLeer || 0) + 1;       // Statistik: dieser Tick lief ohne frische Eingabe
    if (e) {
      sim.eingabeSetzen(c.simNr, e.s); c.ack = e.n; c.letzteEingabe = jetzt;
      flankenAnwenden(sim, c, e);
    } else if (jetzt - c.letzteEingabe > 300) sim.eingabeSetzen(c.simNr, { gas: 0, bremse: 0, lenkung: 0 });   // Tab im Hintergrund
  }

  // --- Spielschleife: alle Räume, fester Schritt 1/60 s mit Zeitakkumulator ---
  function tickRaum(raum, jetzt) {
    const sim = raum.sim;
    if (raum.zustand === 'laden') {
      const alle = raum.spieler.every(c => c.geladen);
      if (!alle && jetzt - raum.ladenSeit < opt.ladenMaxMs) return;
      raum.zustand = 'rennen';
      raum.letzteZeit = jetzt; raum.acc = 0;
      log('Raum ' + raum.code + ': Rennen läuft');
    }
    if (raum.zustand !== 'rennen' || !sim) return;
    if (!raum.stat) raum.stat = statNeu();
    const tickStart = performance.now();
    raum.acc += Math.min(0.25, (jetzt - raum.letzteZeit) / 1000) * opt.tempo;
    raum.letzteZeit = jetzt;
    let schritte = 0;
    while (raum.acc >= DT && schritte < maxSchritte) {
      raum.acc -= DT; schritte++;
      for (const c of raum.spieler) {
        if (c.simNr < 0) continue;
        if (opt.eingabeAlt) eingabeTickAlt(c, sim, jetzt); else eingabeTick(c, sim, jetzt);
      }
      sim.schritt();
      const ev = sim.abholen();
      for (const e of ev) {
        const an = e.an;
        delete e.an;
        const text = JSON.stringify(Object.assign({ t: 'ereignis', k: sim.tick }, e));
        for (const c of raum.spieler) if (an === null || an === undefined || c.simNr === an) senden(c.ws, text);
      }
      if (sim.tick % N.ZUSTAND_JE_TICKS === 0 || sim.fertig) {
        const tS = performance.now();
        if (raum.stat.letzteSendung) fensterAdd(raum.stat.abstand, tS - raum.stat.letzteSendung);
        raum.stat.letzteSendung = tS;
        const gemeinsam = JSON.stringify(sim.zustand());
        const kopf = gemeinsam.slice(0, -1);
        for (const c of raum.spieler) {
          const ich = c.simNr >= 0 ? sim.ich(c.simNr) : null;
          if (ich) ich.ack = c.ack;
          senden(c.ws, ich ? kopf + ',"ich":' + JSON.stringify(ich) + '}' : gemeinsam);
        }
      }
      if (sim.fertig) { ergebnisSenden(raum); break; }
    }
    if (raum.acc > DT * maxSchritte) raum.acc = 0;       // Server war zu langsam: nicht nachholen
    if (raum.stat) { fensterAdd(raum.stat.dauer, performance.now() - tickStart); statAusgeben(raum, jetzt); }
  }
  let schleifeLetzte = 0;
  const schleife = setInterval(() => {
    const jetzt = Number(process.hrtime.bigint() / 1000n) / 1000;
    const lag = schleifeLetzte ? jetzt - schleifeLetzte : 0;
    schleifeLetzte = jetzt;
    for (const raum of raeume.values()) {
      if (lag && raum.stat && raum.zustand === 'rennen') fensterAdd(raum.stat.lag, lag);
      try { tickRaum(raum, jetzt); } catch (e) { console.error('Fehler in Raum ' + raum.code, e && e.stack); raumSchliessen(raum, 'fehler'); }
    }
  }, 4);

  return new Promise((ok, nein) => {
    srv.once('error', nein);
    srv.listen(opt.port, opt.host, () => {
      const port = srv.address().port;
      ok({
        port, http: srv, wss, raeume, brett, radRaum, radDaten: radApi.wurzel, radOrdner,
        schliessen: () => new Promise((fertig) => {
          clearInterval(schleife); brett.schliessen(); radRaum.schliessen();
          for (const ws of wss.clients) ws.terminate();
          wss.close();
          srv.close(() => fertig());
        }),
      });
    });
  });
}

module.exports = { starten, dateiFuer, schalterRecht, schalterBewertung };

// ------------------------------------------------------------------ Start von der Kommandozeile
if (require.main === module) {
  const arg = (name) => { const i = process.argv.indexOf('--' + name); return i >= 0 ? process.argv[i + 1] : undefined; };
  const port = +(arg('port') || process.env.PORT || 8444);
  const host = arg('host') || process.env.HOST || '0.0.0.0';
  const oeffentlich = arg('oeffentlich') || process.env.OEFFENTLICH || '';
  const daten = arg('daten') || '';               // Radwelt: Ordner für gespeicherte Fahrten/Strecken (leer = Standard)
  const steuerung = arg('steuerung') || '';       // Ordner für den Internet-Schalter (wunsch.json / status.json); ohne = aus
  const rad = arg('rad') || '';                   // R6: Ordner der Radwelt-Kopie für /rad/ (Standard <Spielordner>/rad)
  const statistik = Math.max(0, +(arg('statistik') || process.env.STATISTIK || 0)) || 0;   // v23: Sekunden zwischen den Tick-Statistik-Zeilen (0 = aus)
  const eingabeAlt = process.argv.includes('--eingabe-alt');       // nur Vergleich/Test: v22b-Verhalten der Eingabe-Warteschlange
  starten({ port, host, oeffentlich, steuerung, statistik, eingabeAlt, daten, rad }).then((s) => {
    const netz = [];
    for (const liste of Object.values(require('os').networkInterfaces())) {
      for (const a of liste || []) if (a.family === 'IPv4' && !a.internal) netz.push(a.address);
    }
    console.log('');
    console.log('🏎️  Jonas Hot Steering Wheel – Mehrspieler-Server läuft (Port ' + s.port + ')');
    console.log('   Auf diesem Mac:        http://localhost:' + s.port);
    netz.forEach(ip => console.log('   Im Heimnetz (WLAN):    http://' + ip + ':' + s.port));
    console.log('   Übers Internet:        sudo /opt/homebrew/bin/tailscale funnel --https=' + s.port + ' ' + s.port + '   (siehe server/README.md)');
    if (steuerung) console.log('   Internet-Schalter:     an (Ordner ' + steuerung + ')');
    if (oeffentlich) console.log('   Öffentliche Adresse:   ' + oeffentlich + '   (Link/QR in der Lobby)');
    console.log('   Beenden: Ctrl+C (oder Fenster schließen)');
    console.log('');
  }).catch((e) => {
    console.error(e && e.code === 'EADDRINUSE' ? 'Port ' + port + ' ist schon belegt – läuft der Server schon?' : e);
    process.exit(1);
  });
}
