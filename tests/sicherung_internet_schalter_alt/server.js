#!/usr/bin/env node
// ============================================================
// W5-1 Mehrspieler-Server für „Jonas Hot Steering Wheel“ (Node ≥ 18, CommonJS, einzige Abhängigkeit: ws).
//
//   node server/server.js [--port 8443] [--host 0.0.0.0]     (oder PORT=… node server/server.js)
//
// - Liefert das Spiel per HTTP aus (nur Autorennen.html, src/, vendor/ – kein Verzeichnis-Listing, kein `..`).
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

const WURZEL = path.resolve(__dirname, '..');
const ERLAUBT = ['src', 'vendor'];               // Ordner, die ausgeliefert werden (dazu Autorennen.html)
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

// ------------------------------------------------------------------ statische Dateien
/** URL-Pfad → Datei im Spielordner oder null (verboten/unbekannt). */
function dateiFuer(urlPfad) {
  let p;
  try { p = decodeURIComponent(urlPfad.split('?')[0].split('#')[0]); } catch (e) { return null; }
  if (p.includes('\0') || p.includes('\\')) return null;
  if (p === '/' || p === '') p = '/Autorennen.html';
  const teile = p.split('/').filter(Boolean);
  if (!teile.length || teile.some(t => t === '..' || t === '.' || t.startsWith('.'))) return null;
  if (!(teile.length === 1 && teile[0] === 'Autorennen.html') && !ERLAUBT.includes(teile[0])) return null;
  const voll = path.resolve(WURZEL, ...teile);
  if (!voll.startsWith(WURZEL + path.sep)) return null;
  return voll;
}

function httpAntwort(req, res) {
  const ende = (code, text) => { res.writeHead(code, { 'Content-Type': 'text/plain; charset=utf-8', 'X-Content-Type-Options': 'nosniff' }); res.end(req.method === 'HEAD' ? undefined : text); };
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.setHeader('Allow', 'GET, HEAD'); return ende(405, 'Nicht erlaubt'); }
  const datei = dateiFuer(req.url || '/');
  if (!datei) return ende(404, 'Nicht gefunden');
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

// ------------------------------------------------------------------ Server
/**
 * Server starten. opt: { port (0 = frei), host, leise, ladenMaxMs }
 * @returns {Promise<{ port, http, wss, raeume, schliessen() }>}
 */
function starten(opt) {
  // tempo: Zeitraffer NUR für Tests (tests/test_netz.js), 1 = Echtzeit
  opt = Object.assign({ port: 8443, host: '0.0.0.0', leise: false, ladenMaxMs: 20000, tempo: 1, oeffentlich: '' }, opt);
  // öffentliche Adresse (Tailscale Funnel), damit Link/QR in der Lobby auch stimmen, wenn der Host das Spiel über
  // http://localhost:8443 geöffnet hat. Nur https-Adressen ohne Pfad-Tricks.
  const oeffentlich = /^https:\/\/[a-z0-9.-]+(:\d{1,5})?\/?$/i.test(opt.oeffentlich || '') ? opt.oeffentlich.replace(/\/?$/, '/') : '';
  const maxSchritte = Math.ceil(6 * opt.tempo);
  const log = (...a) => { if (!opt.leise) console.log(new Date().toISOString().slice(11, 19), ...a); };
  const raeume = new Map();
  const fahrerNamen = R.config.fahrer.map(f => f.name);
  const autoIds = R.carCatalog.waehlbare().map(a => a.id);
  const hilfen = Object.keys(R.config.fahrhilfen);
  let verbindungen = 0;

  const srv = http.createServer(httpAntwort);
  const wss = new WebSocketServer({ noServer: true, maxPayload: 4096, perMessageDeflate: false, clientTracking: true });
  srv.on('upgrade', (req, socket, kopf) => {
    let pfad = '';
    try { pfad = new URL(req.url, 'http://x').pathname; } catch (e) { /* ungültig */ }
    if (pfad !== N.PFAD || verbindungen >= 80) { socket.write('HTTP/1.1 404 Not Found\r\n\r\n'); socket.destroy(); return; }
    wss.handleUpgrade(req, socket, kopf, (ws) => wss.emit('connection', ws, req));
  });

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
      case 'raumErstellen': {
        if (raum) verlassen(c, 'neuer Raum');
        if (raeume.size >= 30) return fehler(c.ws, 'voll', 'Zu viele Räume – später nochmal');
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
        const code = N.codeNormal(m.code);
        const ziel = code && raeume.get(code);
        if (!ziel) return fehler(c.ws, 'unbekannt', 'Diesen Raum gibt es nicht');
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
        rennenStarten(raum);
        return;
      case 'geladen':
        if (raum.zustand === 'laden') c.geladen = true;
        return;
      case 'eingabe': {
        if (raum.zustand !== 'rennen' && raum.zustand !== 'laden') return;
        const n = m.n;
        if (!Number.isInteger(n) || n <= c.letzteN || n > c.letzteN + 100000) return;
        c.letzteN = n;
        const e = { n, s: N.eingabeDekodieren(m), i: m.i === 1, r: m.r === 1 };
        c.eingaben.push(e);
        if (c.eingaben.length > 45) {        // > 3/4 s gepuffert (Paketstau, sehr langsames Gerät): Älteste verwerfen, Tasten-Flanken behalten
          const weg = c.eingaben.splice(0, c.eingaben.length - 10);
          if (weg.some(x => x.i)) c.eingaben[0].i = true;
          if (weg.some(x => x.r)) c.eingaben[0].r = true;
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

  wss.on('connection', (ws) => {
    verbindungen++;
    const c = { ws, id: crypto.randomBytes(4).toString('hex'), raum: null, lebt: true, eingaben: [], simNr: -1, letzteN: -1, ack: -1,
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
    ws.on('close', () => { verbindungen--; verlassen(c, 'Verbindung zu'); });
    ws.on('error', () => {});
    c.herz = setInterval(() => {
      if (!c.lebt) { ws.terminate(); return; }
      c.lebt = false;
      try { ws.ping(); } catch (e) { /* zu */ }
    }, N.HERZSCHLAG_MS);
    ws.on('close', () => clearInterval(c.herz));
  });

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
    raum.acc += Math.min(0.25, (jetzt - raum.letzteZeit) / 1000) * opt.tempo;
    raum.letzteZeit = jetzt;
    let schritte = 0;
    while (raum.acc >= DT && schritte < maxSchritte) {
      raum.acc -= DT; schritte++;
      for (const c of raum.spieler) {
        if (c.simNr < 0) continue;
        // Warteschlange klein halten: war sie eine ganze Sekunde lang nie kürzer als 3 (Paketstau/Uhren-Drift über
        // Mobilfunk), werden die überzähligen ältesten Eingaben verworfen (Item/Reset bleiben) → kein wachsender Verzug.
        c.minQ = Math.min(c.minQ, c.eingaben.length);
        if (++c.qTicks >= 60) {
          if (c.minQ > 2 && c.minQ < Infinity) {
            const weg = c.eingaben.splice(0, c.minQ - 2);
            if (weg.some(x => x.i)) c.eingaben[0].i = true;
            if (weg.some(x => x.r)) c.eingaben[0].r = true;
            c.verworfen = (c.verworfen || 0) + weg.length;
          }
          c.minQ = Infinity; c.qTicks = 0;
        }
        const e = c.eingaben.shift();
        if (e) {
          sim.eingabeSetzen(c.simNr, e.s); c.ack = e.n; c.letzteEingabe = jetzt;
          if (e.r) sim.reset(c.simNr);
          if (e.i) sim.item(c.simNr);
        } else if (jetzt - c.letzteEingabe > 300) sim.eingabeSetzen(c.simNr, { gas: 0, bremse: 0, lenkung: 0 });   // Tab im Hintergrund
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
  }
  const schleife = setInterval(() => {
    const jetzt = Number(process.hrtime.bigint() / 1000n) / 1000;
    for (const raum of raeume.values()) {
      try { tickRaum(raum, jetzt); } catch (e) { console.error('Fehler in Raum ' + raum.code, e && e.stack); raumSchliessen(raum, 'fehler'); }
    }
  }, 4);

  return new Promise((ok, nein) => {
    srv.once('error', nein);
    srv.listen(opt.port, opt.host, () => {
      const port = srv.address().port;
      ok({
        port, http: srv, wss, raeume,
        schliessen: () => new Promise((fertig) => {
          clearInterval(schleife);
          for (const ws of wss.clients) ws.terminate();
          wss.close();
          srv.close(() => fertig());
        }),
      });
    });
  });
}

module.exports = { starten, dateiFuer };

// ------------------------------------------------------------------ Start von der Kommandozeile
if (require.main === module) {
  const arg = (name) => { const i = process.argv.indexOf('--' + name); return i >= 0 ? process.argv[i + 1] : undefined; };
  const port = +(arg('port') || process.env.PORT || 8443);
  const host = arg('host') || process.env.HOST || '0.0.0.0';
  const oeffentlich = arg('oeffentlich') || process.env.OEFFENTLICH || '';
  starten({ port, host, oeffentlich }).then((s) => {
    const netz = [];
    for (const liste of Object.values(require('os').networkInterfaces())) {
      for (const a of liste || []) if (a.family === 'IPv4' && !a.internal) netz.push(a.address);
    }
    console.log('');
    console.log('🏎️  Jonas Hot Steering Wheel – Mehrspieler-Server läuft (Port ' + s.port + ')');
    console.log('   Auf diesem Mac:        http://localhost:' + s.port);
    netz.forEach(ip => console.log('   Im Heimnetz (WLAN):    http://' + ip + ':' + s.port));
    console.log('   Übers Internet:        /Applications/Tailscale.app/Contents/MacOS/Tailscale funnel --https=' + s.port + ' ' + s.port + '   (siehe server/README.md)');
    if (oeffentlich) console.log('   Öffentliche Adresse:   ' + oeffentlich + '   (Link/QR in der Lobby)');
    console.log('   Beenden: Ctrl+C (oder Fenster schließen)');
    console.log('');
  }).catch((e) => {
    console.error(e && e.code === 'EADDRINUSE' ? 'Port ' + port + ' ist schon belegt – läuft der Server schon?' : e);
    process.exit(1);
  });
}
