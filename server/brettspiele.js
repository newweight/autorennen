'use strict';
// ============================================================
// Brettspiele online (4 gewinnt, Schach) – eigener WebSocket-Pfad /ws-brett. Das Autorennen-Protokoll (/ws) bleibt unberührt.
// Wird von server.js eingebunden (require('./brettspiele').erzeugen(opt) → { upgrade, schliessen, raeume }).
//
// - Server ist autoritativ: Zugfolge und Legalität werden mit denselben Regeldateien geprüft wie im Browser
//   (spiele/gemeinsam/*.js als UMD).
// - Kinder-Sicherheit wie beim Autorennen: kein Chat, keine Freitexte (Namen nur aus der Liste in konstanten.js), keine Dateizugriffe,
//   Konsole nennt nur Raumcodes. Raumcode: 4 Zeichen ohne 0/O/1/I.
// - Raum: zwei Plätze (Farbe w = Weiß bzw. Rot, beginnt · b = Schwarz bzw. Gelb) + Zuschauer. Wer die Verbindung verliert, behält den
//   Platz (Token, Wiederverbinden mit { t:'wiederverbinden', code, token }); ein Raum ohne verbundene Leute verschwindet nach RAUM_MINUTEN.
// - Limits: max. 40 Räume, 60 Verbindungen (8 je Adresse), Nachrichten ≤ 512 Byte, > 30/s ignoriert, > 300/s getrennt.
// Protokoll: server/PROTOKOLL.md, Abschnitt „/ws-brett“.
// ============================================================
const crypto = require('crypto');
const { WebSocketServer } = require('ws');
const K = require('../spiele/gemeinsam/konstanten.js');
const Vier = require('../spiele/gemeinsam/vier-regeln.js');
const Schach = require('../spiele/gemeinsam/schach-regeln.js');

const NAMEN = new Map(K.NAMEN.map(n => [n.id, n]));
const MAX_VERBINDUNGEN = 60;
const MAX_PRO_IP = 8;   // pro Adresse (X-Forwarded-For von Serve/Funnel); lokale Verbindungen ohne Header zählen nicht

function erzeugen(opt) {
  opt = Object.assign({ leise: false, raumMs: K.RAUM_MINUTEN * 60000, aufraeumenMs: 15000, maxRaeume: K.MAX_RAEUME }, opt);
  const log = (...a) => { if (!opt.leise) console.log(new Date().toISOString().slice(11, 19), '[brett]', ...a); };
  const raeume = new Map();
  let verbindungen = 0;
  const proIp = new Map();
  const wss = new WebSocketServer({ noServer: true, maxPayload: 512, perMessageDeflate: false, clientTracking: true });

  const senden = (ws, obj) => { if (ws && ws.readyState === 1) ws.send(typeof obj === 'string' ? obj : JSON.stringify(obj)); };
  const fehler = (ws, grund, text) => senden(ws, { t: 'fehler', grund, text });

  function zufallsCode() {
    for (let k = 0; k < 1000; k++) {
      let c = '';
      for (let i = 0; i < K.CODE_LAENGE; i++) c += K.CODE_ZEICHEN[crypto.randomInt(K.CODE_ZEICHEN.length)];
      if (!raeume.has(c)) return c;
    }
    return null;
  }
  const codeNormal = (t) => {
    const c = String(t || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    return c.length === K.CODE_LAENGE && [...c].every(x => K.CODE_ZEICHEN.includes(x)) ? c : null;
  };

  // ---------------------------------------------------------------- Spiele
  function spielNeu(raum) {
    raum.partie = raum.spiel === 'schach' ? new Schach.Partie() : Vier.neu();
    raum.ergebnis = null;
    raum.revanche = { w: false, b: false };
    raum.runde = (raum.runde || 0) + 1;
  }
  const zuegeListe = (raum) => raum.spiel === 'schach' ? raum.partie.textListe() : raum.partie.zug.slice();
  /** Wer ist am Zug? 'w' | 'b' */
  const amZug = (raum) => raum.spiel === 'schach' ? (raum.partie.am === 1 ? 'w' : 'b') : (raum.partie.am === 1 ? 'w' : 'b');

  function ergebnisPruefen(raum) {
    if (raum.spiel === 'schach') {
      const st = raum.partie.status();
      if (st.ende) raum.ergebnis = { art: st.ende, sieger: st.sieger === 1 ? 'w' : st.sieger === -1 ? 'b' : null };
    } else if (raum.partie.ende) {
      const e = raum.partie.ende;
      raum.ergebnis = { art: e.sieger ? 'reihe' : 'voll', sieger: e.sieger === 1 ? 'w' : e.sieger === 2 ? 'b' : null, reihe: e.reihe || undefined };
    }
    if (raum.ergebnis) raum.zustand = 'ende';
  }

  function stand(raum, c) {
    const plaetze = ['w', 'b'].map(f => { const p = raum.plaetze[f]; return p ? { farbe: f, name: p.name, online: !!p.ws } : null; });
    const rolle = c.platz || 'z';
    const o = { t: 'stand', spiel: raum.spiel, code: raum.code, du: { rolle, name: c.platz ? raum.plaetze[c.platz].name : undefined },
      spieler: plaetze, zuschauer: raum.zuschauer.size, zustand: raum.zustand, am: amZug(raum), zuege: zuegeListe(raum),
      ergebnis: raum.ergebnis || undefined, revanche: raum.revanche, runde: raum.runde };
    if (raum.spiel === 'schach' && raum.zustand !== 'warten') { const st = raum.partie.status(); o.schach = st.schach; }
    return o;
  }
  function alleSenden(raum, extra) {
    for (const f of ['w', 'b']) { const p = raum.plaetze[f]; if (p && p.ws) senden(p.ws, Object.assign(stand(raum, p.ws.c), extra || {})); }
    for (const z of raum.zuschauer) senden(z, Object.assign(stand(raum, z.c), extra || {}));
  }

  function nameVergeben(raum, id) {
    const n = NAMEN.get(id) || K.NAMEN[crypto.randomInt(K.NAMEN.length)];
    let name = n.emoji + ' ' + n.text;
    const belegt = new Set(['w', 'b'].map(f => raum.plaetze[f] && raum.plaetze[f].name));
    if (belegt.has(name)) name += ' 2';
    return name;
  }

  function platzNehmen(raum, c, farbe, name) {
    const token = crypto.randomBytes(12).toString('hex');
    raum.plaetze[farbe] = { ws: c.ws, name, token };
    c.raum = raum; c.platz = farbe; c.zuschauer = false;
    raum.leerSeit = 0;
    return token;
  }

  function raumLoeschen(raum, grund, ausser) {
    for (const f of ['w', 'b']) {
      const p = raum.plaetze[f];
      if (p && p.ws) { if (p.ws !== ausser) senden(p.ws, { t: 'raumZu', grund }); p.ws.c.raum = null; p.ws.c.platz = null; }
    }
    for (const z of raum.zuschauer) { senden(z, { t: 'raumZu', grund }); z.c.raum = null; }
    raeume.delete(raum.code);
    log('Raum ' + raum.code + ' geschlossen (' + grund + '), offen: ' + raeume.size);
  }

  /** Verbindung weg (Netz oder Tab zu): Platz bleibt reserviert. */
  function getrennt(c) {
    const raum = c.raum;
    if (!raum) return;
    if (c.platz) {
      const p = raum.plaetze[c.platz];
      if (p && p.ws === c.ws) { p.ws = null; }
      if (!raum.plaetze.w || !raum.plaetze.w.ws) { if (!raum.plaetze.b || !raum.plaetze.b.ws) raum.leerSeit = Date.now(); }
      alleSenden(raum);
    } else { raum.zuschauer.delete(c.ws); alleSenden(raum); }
    c.raum = null;
  }

  /** Raumwechsel: Saß der Wechselnde ALLEIN im Raum (Gegenplatz nie besetzt), Raum sofort schließen – sonst bliebe er 10 min als Leiche (Räume-Flut). */
  function raumVerlassen(c) {
    const raum = c.raum;
    if (!raum) return;
    const andere = c.platz ? (c.platz === 'w' ? 'b' : 'w') : null;
    if (c.platz && !raum.plaetze[andere] && raum.zuschauer.size === 0) raumLoeschen(raum, 'weg', c.ws);
    else getrennt(c);
  }

  // ---------------------------------------------------------------- Nachrichten
  function nachricht(c, m) {
    const ws = c.ws, raum = c.raum;
    switch (m.t) {
      case 'hallo': return senden(ws, { t: 'hallo', v: K.VERSION, spiele: K.SPIELE });
      case 'ping': return senden(ws, { t: 'pong', z: typeof m.z === 'number' ? m.z : 0 });
      case 'raumErstellen': {
        if (!K.SPIELE.includes(m.spiel)) return fehler(ws, 'ungueltig', 'Unbekanntes Spiel');
        if (raum) raumVerlassen(c);
        if (raeume.size >= opt.maxRaeume) return fehler(ws, 'voll', 'Zu viele Räume – später nochmal');
        const code = zufallsCode();
        if (!code) return fehler(ws, 'voll', 'Zu viele Räume – später nochmal');
        const farbe = m.farbe === 'w' || m.farbe === 'b' ? m.farbe : (crypto.randomInt(2) ? 'w' : 'b');
        const neu = { code, spiel: m.spiel, plaetze: { w: null, b: null }, zuschauer: new Set(), zustand: 'warten', leerSeit: 0, aktiv: Date.now(), runde: 0 };
        spielNeu(neu);
        raeume.set(code, neu);
        const token = platzNehmen(neu, c, farbe, nameVergeben(neu, m.name));
        senden(ws, { t: 'raum', code, rolle: farbe, token, spiel: neu.spiel });
        alleSenden(neu);
        log('Raum ' + code + ' (' + neu.spiel + ') erstellt, offen: ' + raeume.size);
        return;
      }
      case 'raumBeitreten': {
        const code = codeNormal(m.code), ziel = code && raeume.get(code);
        if (!ziel) return fehler(ws, 'unbekannt', 'Diesen Raum gibt es nicht');
        if (ziel.spiel !== m.spiel && m.spiel !== undefined) return fehler(ws, 'anderesSpiel', 'Dieser Raum ist für ' + (ziel.spiel === 'vier' ? '4 gewinnt' : 'Schach'), ziel.spiel);
        if (ziel === raum) return alleSenden(ziel);
        const frei = ['w', 'b'].filter(f => !ziel.plaetze[f]);
        if (m.zuschauer === true || !frei.length) {
          if (!frei.length && m.zuschauer !== true) return fehler(ws, 'voll', 'Der Raum ist voll – du kannst zuschauen');
          if (ziel.zuschauer.size >= K.MAX_ZUSCHAUER) return fehler(ws, 'voll', 'Zu viele Zuschauer');
          if (raum) raumVerlassen(c);
          ziel.zuschauer.add(ws); c.raum = ziel; c.platz = null; c.zuschauer = true;
          senden(ws, { t: 'raum', code: ziel.code, rolle: 'z', spiel: ziel.spiel });
          return alleSenden(ziel);
        }
        if (raum) raumVerlassen(c);
        const token = platzNehmen(ziel, c, frei[0], nameVergeben(ziel, m.name));
        if (ziel.plaetze.w && ziel.plaetze.b && ziel.zustand === 'warten') ziel.zustand = 'spiel';
        ziel.aktiv = Date.now();
        senden(ws, { t: 'raum', code: ziel.code, rolle: frei[0], token, spiel: ziel.spiel });
        alleSenden(ziel);
        log('Raum ' + ziel.code + ': Spieler dazu');
        return;
      }
      case 'wiederverbinden': {
        const code = codeNormal(m.code), ziel = code && raeume.get(code);
        const f = ziel && ['w', 'b'].find(x => ziel.plaetze[x] && typeof m.token === 'string' && ziel.plaetze[x].token === m.token);
        if (!f) return senden(ws, { t: 'wiederNein' });
        if (raum && raum !== ziel) getrennt(c);
        const p = ziel.plaetze[f];
        if (p.ws && p.ws !== ws) { p.ws.c.raum = null; p.ws.c.platz = null; try { senden(p.ws, { t: 'raumZu', grund: 'andererTab' }); } catch (e) { /* zu */ } }
        p.ws = ws; c.raum = ziel; c.platz = f; c.zuschauer = false; ziel.leerSeit = 0; ziel.aktiv = Date.now();
        senden(ws, { t: 'raum', code: ziel.code, rolle: f, token: p.token, spiel: ziel.spiel, wieder: true });
        alleSenden(ziel);
        log('Raum ' + ziel.code + ': Spieler wieder da');
        return;
      }
      case 'verlassen':
        if (raum) {
          if (c.platz) raumLoeschen(raum, 'weg', ws); else getrennt(c);
        }
        return senden(ws, { t: 'verlassen' });
    }
    if (!raum) return fehler(ws, 'keinRaum', 'Du bist in keinem Raum');
    raum.aktiv = Date.now();
    switch (m.t) {
      case 'zug': {
        if (!c.platz) return fehler(ws, 'zuschauer', 'Zuschauer dürfen nicht ziehen');
        if (raum.zustand !== 'spiel') return fehler(ws, 'nichtAktiv', 'Gerade läuft kein Spiel');
        if (amZug(raum) !== c.platz) return fehler(ws, 'nichtDran', 'Du bist nicht dran');
        if (raum.spiel === 'schach') {
          if (typeof m.z !== 'string' || m.z.length > 5) return fehler(ws, 'unlegal', 'Dieser Zug geht nicht');
          const z = raum.partie.ausText(m.z);
          if (z === null || !raum.partie.ziehen(z)) return fehler(ws, 'unlegal', 'Dieser Zug geht nicht');
        } else if (!Number.isInteger(m.z) || !Vier.ziehen(raum.partie, m.z)) return fehler(ws, 'unlegal', 'In diese Spalte geht kein Stein mehr');
        ergebnisPruefen(raum);
        alleSenden(raum);
        if (raum.ergebnis) log('Raum ' + raum.code + ': Ende (' + raum.ergebnis.art + ')');
        return;
      }
      case 'aufgeben':
        if (!c.platz || raum.zustand !== 'spiel') return;
        raum.ergebnis = { art: 'aufgegeben', sieger: c.platz === 'w' ? 'b' : 'w' };
        raum.zustand = 'ende';
        return alleSenden(raum);
      case 'revanche': {
        if (!c.platz || raum.zustand !== 'ende') return;
        raum.revanche[c.platz] = m.an !== false;
        if (raum.revanche.w && raum.revanche.b) {
          // Farben tauschen, neues Spiel
          const w = raum.plaetze.w, b = raum.plaetze.b;
          raum.plaetze.w = b; raum.plaetze.b = w;
          for (const f of ['w', 'b']) { const p = raum.plaetze[f]; if (p && p.ws) p.ws.c.platz = f; }
          spielNeu(raum);
          raum.zustand = 'spiel';
          for (const f of ['w', 'b']) { const p = raum.plaetze[f]; if (p && p.ws) senden(p.ws, { t: 'raum', code: raum.code, rolle: f, token: p.token, spiel: raum.spiel, neu: true }); }
          log('Raum ' + raum.code + ': Revanche');
        }
        return alleSenden(raum);
      }
      default:
        fehler(ws, 'unbekannt', 'Unbekannte Nachricht');
    }
  }

  function verbinden(ws) {
    verbindungen++;
    const c = { ws, raum: null, platz: null, zaehler: 0, zaehlerSeit: Date.now(), lebt: true };
    ws.c = c;
    ws.on('pong', () => { c.lebt = true; });
    ws.on('message', (daten, binaer) => {
      c.lebt = true;
      const jetzt = Date.now();
      if (jetzt - c.zaehlerSeit > 1000) { c.zaehler = 0; c.zaehlerSeit = jetzt; }
      if (++c.zaehler > 300) { ws.terminate(); return; }
      if (c.zaehler > 30 || binaer) return;
      let m;
      try { m = JSON.parse(daten.toString('utf8')); } catch (e) { return fehler(ws, 'json', 'Ungültige Nachricht'); }
      if (!m || typeof m !== 'object' || Array.isArray(m) || typeof m.t !== 'string') return fehler(ws, 'json', 'Ungültige Nachricht');
      try { nachricht(c, m); } catch (e) { console.error('[brett] Fehler bei', m.t, e && e.stack); fehler(ws, 'intern', 'Interner Fehler'); }
    });
    ws.on('close', () => { verbindungen--; if (ws.ipKey) { const n = (proIp.get(ws.ipKey) || 1) - 1; if (n > 0) proIp.set(ws.ipKey, n); else proIp.delete(ws.ipKey); } clearInterval(c.herz); getrennt(c); });
    ws.on('error', () => {});
    c.herz = setInterval(() => {
      if (!c.lebt) { ws.terminate(); return; }
      c.lebt = false;
      try { ws.ping(); } catch (e) { /* zu */ }
    }, 15000);
  }
  wss.on('connection', verbinden);

  const aufraeumen = setInterval(() => {
    const jetzt = Date.now();
    for (const raum of [...raeume.values()]) {
      const leer = raum.leerSeit && jetzt - raum.leerSeit > opt.raumMs;
      const alt = jetzt - raum.aktiv > 3 * 3600000;        // 3 h ohne Zug/Nachricht
      if (leer || alt) raumLoeschen(raum, leer ? 'leer' : 'alt');
    }
  }, opt.aufraeumenMs);
  if (aufraeumen.unref) aufraeumen.unref();

  return {
    raeume,
    verbindungen: () => verbindungen,
    /** Aus server.js: Upgrade-Anfrage auf PFAD annehmen oder abweisen. */
    upgrade(req, socket, kopf) {
      if (verbindungen >= MAX_VERBINDUNGEN) { socket.write('HTTP/1.1 503 Service Unavailable\r\n\r\n'); socket.destroy(); return; }
      let key = null;
      const xff = req.headers && req.headers['x-forwarded-for'];
      if (typeof xff === 'string' && xff.trim()) key = xff.split(',')[0].trim().slice(0, 64);
      if (key && (proIp.get(key) || 0) >= MAX_PRO_IP) { socket.write('HTTP/1.1 429 Too Many Requests\r\n\r\n'); socket.destroy(); return; }
      wss.handleUpgrade(req, socket, kopf, (ws) => {
        if (key) { ws.ipKey = key; proIp.set(key, (proIp.get(key) || 0) + 1); }
        wss.emit('connection', ws, req);
      });
    },
    schliessen() { clearInterval(aufraeumen); for (const ws of wss.clients) ws.terminate(); wss.close(); },
  };
}

module.exports = { erzeugen, PFAD: K.PFAD };
