'use strict';
// ============================================================
// Radwelt R4-F – Mehrspieler „👥 Zusammen fahren“: eigener WebSocket-Pfad /ws-rad (wie brettspiele.js; Autorennen /ws und /ws-brett bleiben unberührt).
// Wird von server.js eingebunden: require('./radRaum').erzeugen(opt) → { upgrade, schliessen, raeume, verbindungen }.
//
// Architektur: Jeder fährt in seiner LOKALEN Radwelt (Physik, Rolle, Speichern lokal). Der Server vermittelt nur:
//   Raum mit 4-stelligem Code (ohne 0/O/1/I), bis 8 Fahrer (Menschen + Gastgeber-Bots), Gastgeber legt Strecke (Katalog oder gebaute Strecke per
//   Parameter + Seed), Runden, Wind, Steigungsgrad und Windschatten fest. Zustände: lobby → laden → countdown → fahrt → ergebnis (→ lobby).
//   Clients senden 5×/s ihren Zustand { d (Gesamtweg m), s, r, v (m/s), w, wkg, q (Spur), k (Kadenz) }; der Server prüft Plausibilität
//   (≤ 2500 W, ≤ 100 km/h, keine Sprünge), führt die Rangliste (Zeit = Server-Uhr ab „los“), erkennt das Ziel (Gesamtweg ≥ Zielstrecke des Gastgebers)
//   und verteilt 5×/s „stand“ an alle. Reconnect innerhalb 60 s mit gleicher Spieler-ID + Token. Raum ohne verbundene Menschen schließt nach 10 min.
// Schutz: Origin (falls vorhanden – Browser senden ihn immer) muss sein: http://localhost:10100 · http://127.0.0.1:10100 · gleiche Herkunft
//   (Host / X-Forwarded-Host / --oeffentlich) · Seiten im selben Tailnet (*.<tailnet>.ts.net wie der Host) · opt.origins / RADWELT_ORIGINS.
//   Fehlt Origin → kein Browser (Node/curl) → erlaubt (wie beim Internet-Schalter). Limits: 80 Verbindungen, 8 je Adresse (X-Forwarded-For),
//   30 Räume, 5 Räume je Adresse, Nachricht ≤ 6 KB, > 25/s ignoriert, > 250/s getrennt, 5 falsche Codes je 10 s.
// Datenschutz: Konsole nennt nur Raumcodes und Zahlen (keine Namen/Adressen). Namen: max. 24 Zeichen, ohne Steuerzeichen/<>.
// Protokoll: server/PROTOKOLL.md, Abschnitt „/ws-rad“ (und docs/MEHRSPIELER.md).
// Tests: tests/test_radraum.js. Nur für Tests: RADWELT_RAUM_TEMPO (Zeitraffer der Rennuhr + Sprung-Toleranz, für vorgespulte Browser-Fahrten).
// ============================================================
const crypto = require('crypto');
const { WebSocketServer } = require('ws');

const PFAD = '/ws-rad', VERSION = 2;      // 2 = R4-F2: Versions-/Strecken-Fingerabdruck, Rauswerfen/Sperren, Simulator-Kennung
const CODE_ZEICHEN = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789', CODE_LAENGE = 4;
const MAX_FAHRER = 8, MAX_W = 2500, MAX_V = 100 / 3.6, MAX_WKG = 35, DQ_AB = 15;
const STRECKEN = ['alpen', 'wiese', 'wald', 'mega', 'bauen'];
const WIND = ['aus', 'leicht', 'mittel', 'stark', 'boeig'];
const RICHTUNGEN = ['N', 'NO', 'O', 'SO', 'S', 'SW', 'W', 'NW'];
const LOKAL_ORIGINS = ['http://localhost:10100', 'http://127.0.0.1:10100', 'http://[::1]:10100'];
const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);
const MAX_RAEUME_JE_ADRESSE = 3;

const klemm = (x, a, b) => Math.max(a, Math.min(b, x));
const zahl = (v, lo, hi, d) => (typeof v === 'number' && Number.isFinite(v) ? klemm(v, lo, hi) : d);
const ganz = (v, lo, hi, d) => Math.round(zahl(v, lo, hi, d));
const text = (v, max) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f<>"'`\\]/g, '').replace(/\s+/g, ' ').trim().slice(0, max) : '');

/** Einstellungen des Gastgebers prüfen (unbekannt/ungültig → Standard). */
function einstPruefen(e, alt) {
  e = e && typeof e === 'object' ? e : {};
  const a = alt || { strecke: 'wiese', bau: null, runden: 3, wind: 'aus', windRichtung: 'zufall', realismus: 75, windschatten: true };
  const r = {
    strecke: STRECKEN.includes(e.strecke) ? e.strecke : a.strecke,
    runden: e.runden === undefined ? a.runden : ganz(e.runden, 1, 20, a.runden),
    wind: WIND.includes(e.wind) ? e.wind : a.wind,
    windRichtung: e.windRichtung === 'zufall' || RICHTUNGEN.includes(e.windRichtung) ? e.windRichtung : a.windRichtung,
    realismus: [50, 75, 100].includes(e.realismus) ? e.realismus : a.realismus,
    windschatten: typeof e.windschatten === 'boolean' ? e.windschatten : a.windschatten,
    bau: null,
  };
  if (r.strecke === 'bauen') {
    const b = e.bau && typeof e.bau === 'object' ? e.bau : (a.bau || {});
    r.bau = { km: zahl(b.km, 2, 100, 20), anstiege: ganz(b.anstiege, 0, 10, 3), hm: zahl(b.hm, 0, 20000, 300), maxSteig: zahl(b.maxSteig, 2, 20, 8),
      art: b.art === 'ab' ? 'ab' : 'rund', thema: b.thema === 'wald' ? 'wald' : 'wiese', seed: ganz(b.seed, 1, 999999, 1) };
  }
  return r;
}

/** Fahrer-/Rad-Optik (nur Indizes/kurze Kennungen; der Browser prüft gegen seine Listen noch einmal). */
function optikPruefen(o) {
  o = o && typeof o === 'object' ? o : {};
  const i = (v) => ganz(v, 0, 63, 0);
  return { g: o.g === 'w' ? 'w' : 'm', haar: i(o.haar), typ: typeof o.typ === 'string' && /^[a-z]{1,12}$/.test(o.typ) ? o.typ : 'rennrad',
    rahmen: i(o.rahmen), akzent: i(o.akzent), marke: text(o.marke, 20), trikot: i(o.trikot), helm: i(o.helm), ul: o.ul === true };
}

/** Host, unter dem der Server echt erreichbar ist: localhost, IP-Adresse, *.ts.net (Tailnet). Ein fremder DNS-Name (DNS-Rebinding) zählt nicht als „gleiche Herkunft“. */
function bekannterHost(hp) {
  const h = String(hp || '').toLowerCase().replace(/:\d{1,5}$/, '');
  if (h === 'localhost' || h === '[::1]' || /^\[[0-9a-f:.]+\]$/.test(h)) return true;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(h)) return true;
  return /^[a-z0-9-]+\.[a-z0-9-]+\.ts\.net$/.test(h);
}
/** Schlüssel für Limits/Sperren: X-Forwarded-For (bzw. Tailscale-Identität) nur vom lokalen Proxy (Loopback), sonst die Socket-Adresse; lokal ohne Header = 'lokal'. */
function adressSchluessel(req) {
  try {
    const h = (req && req.headers) || {}, ra = String((req && req.socket && req.socket.remoteAddress) || '');
    if (LOOPBACK.has(ra)) {
      const login = h['tailscale-user-login'];
      if (typeof login === 'string' && /^[^\s,<>"'\\]{1,200}$/.test(login)) return 'id:' + login.slice(0, 100);
      const xff = h['x-forwarded-for'];
      if (typeof xff === 'string' && xff.trim()) return 'ip:' + xff.split(',')[0].trim().slice(0, 64);
      return 'lokal';
    }
    return 'ip:' + ra.replace(/^::ffff:/, '').slice(0, 64);
  } catch (e) { return 'unbekannt'; }
}

/** Darf diese Seite (Origin) /ws-rad öffnen? Ohne Origin (kein Browser) ja. */
function originErlaubt(req, oeffentlichHost, extra) {
  try {
    const h = (req && req.headers) || {};
    const origin = h['origin'];
    if (origin === undefined) return true;
    if (typeof origin !== 'string') return false;
    let u; try { u = new URL(origin); } catch (e) { return false; }
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
    const o = u.protocol + '//' + u.host.toLowerCase();
    if (LOKAL_ORIGINS.includes(o)) return true;
    if ((extra || []).some(x => typeof x === 'string' && x.replace(/\/$/, '').toLowerCase() === o)) return true;
    const hosts = [h['host'], h['x-forwarded-host'], oeffentlichHost].filter(x => typeof x === 'string' && x).map(x => x.split(',')[0].trim().toLowerCase()).filter(bekannterHost);
    const oh = u.host.toLowerCase();
    if (hosts.includes(oh)) return true;                                               // gleiche Herkunft – nur bei bekannten Hosts (kein DNS-Rebinding über fremde Namen)
    // gleiches Tailnet: https://<gerät>.<tailnet>.ts.net[:port] – nur wenn der Server selbst unter diesem Tailnet-Namen erreicht wurde
    const tn = (x) => { const m = /^[a-z0-9-]+\.([a-z0-9-]+\.ts\.net)(:\d+)?$/.exec(x); return m ? m[1] : null; };
    const ot = u.protocol === 'https:' ? tn(oh) : null;
    if (ot && hosts.some(x => tn(x) === ot)) return true;
    return false;
  } catch (e) { return false; }
}

function erzeugen(opt) {
  opt = Object.assign({ leise: false, oeffentlich: '', origins: [], reconnectMs: 60000, leerMs: 2 * 60000, countdownMs: 5000, ladenMaxMs: 30000,
    nachZielMs: 5 * 60000, staleMs: 30000, taktMs: 200, aufraeumenMs: 2000, maxRaeume: 30, tempo: 0, fehlFenster: 5, fehlSperreMaxS: 300, testFehler: null }, opt);
  const testFehler = (stelle) => { if (opt.testFehler && opt.testFehler.has && opt.testFehler.has(stelle)) throw new Error('Testfehler ' + stelle); };   // nur Tests: Fehlerinjektion
  const tempo = opt.tempo > 0 ? opt.tempo : (Math.max(1, Math.min(100, +process.env.RADWELT_RAUM_TEMPO || 1)) || 1);   // Zeitraffer nur für Tests
  const extraOrigins = (opt.origins || []).concat(String(process.env.RADWELT_ORIGINS || '').split(',').map(x => x.trim()).filter(Boolean));
  let oeffentlichHost = '';
  try { if (opt.oeffentlich) oeffentlichHost = new URL(opt.oeffentlich).host.toLowerCase(); } catch (e) { /* egal */ }
  const log = (...a) => { if (!opt.leise) console.log(new Date().toISOString().slice(11, 19), '[rad]', ...a); };
  const raeume = new Map();
  const proIp = new Map();
  const fehlVersuche = new Map();      // Code-Raten je Adresse/Tailnet-Identität: { n, sperreBis, letzte }
  let verbindungen = 0;
  const wss = new WebSocketServer({ noServer: true, maxPayload: 6144, perMessageDeflate: false, clientTracking: true });
  const jetztMs = () => Date.now();
  const rennZeit = (raum, ms) => raum.losMs ? Math.max(0, ((ms === undefined ? jetztMs() : ms) - raum.losMs) / 1000 * tempo) : 0;

  const senden = (ws, obj) => { if (ws && ws.readyState === 1) ws.send(typeof obj === 'string' ? obj : JSON.stringify(obj)); };
  const fehler = (ws, grund, txt) => senden(ws, { t: 'fehler', grund, text: txt });

  function zufallsCode() {
    for (let k = 0; k < 1000; k++) {
      let c = '';
      for (let i = 0; i < CODE_LAENGE; i++) c += CODE_ZEICHEN[crypto.randomInt(CODE_ZEICHEN.length)];
      if (!raeume.has(c)) return c;
    }
    return null;
  }
  const codeNormal = (t) => {
    const c = String(t || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    return c.length === CODE_LAENGE && [...c].every(x => CODE_ZEICHEN.includes(x)) ? c : null;
  };

  // ---------------------------------------------------------------- Fahrer
  function rennFelderNeu(f) {
    Object.assign(f, { d: 0, s: 0, r: 1, v: 0, w: 0, wkg: 0, q: 0, k: 0, tz: 0, letzteMs: 0, geladen: false, L: 0, zielM: 0, ziel: false, zielZeit: null,
      raus: false, rausGrund: '', dq: false, verstoesse: 0, wSum: 0, tSum: 0, hist: [[0, 0]], fertigGemeldet: false, fp: '', sim: false, rtt: 0 });
  }
  function fahrerNeu(raum, name, optik, bot, app) {
    const f = { id: crypto.randomBytes(4).toString('hex'), token: bot ? '' : crypto.randomBytes(12).toString('hex'), name: nameFrei(raum, name, bot), optik: optikPruefen(optik),
      bot: !!bot, ws: null, online: !bot, wegSeit: 0, bereit: false, app: text(app, 24), schluessel: '' };
    rennFelderNeu(f);
    return f;
  }
  function nameFrei(raum, wunsch, bot) {
    let n = text(wunsch, 24) || (bot ? 'Bot' : 'Fahrer');
    const belegt = new Set(raum.fahrer.map(f => f.name));
    if (!belegt.has(n)) return n;
    for (let i = 2; i < 20; i++) { const x = n.slice(0, 21) + ' ' + i; if (!belegt.has(x)) return x; }
    return n.slice(0, 18) + ' ' + crypto.randomInt(100, 999);
  }
  const menschen = (raum) => raum.fahrer.filter(f => !f.bot);
  const hostVon = (raum) => raum.fahrer.find(f => f.id === raum.hostId) || null;

  function lobbyListe(raum) {
    return raum.fahrer.map(f => ({ id: f.id, name: f.name, optik: f.optik, bereit: f.id === raum.hostId || f.bot || !!f.bereit, host: f.id === raum.hostId, online: f.bot ? true : f.online, bot: f.bot,
      app: f.app || undefined, sim: f.sim || undefined, abw: f.rausGrund === 'abweichung' || undefined }));
  }
  function lobbySenden(raum, hinweis) {
    const fahrer = lobbyListe(raum);
    for (const f of menschen(raum)) {
      if (f.ws) senden(f.ws, { t: 'lobby', v: VERSION, code: raum.code, zustand: raum.zustand, du: f.id, hostId: raum.hostId, einst: raum.einst, fahrer, max: MAX_FAHRER, lauf: raum.lauf, gesperrt: !!raum.gesperrt, hinweis: hinweis || undefined });
    }
  }
  function anAlle(raum, obj) { const s = JSON.stringify(obj); for (const f of menschen(raum)) if (f.ws) senden(f.ws, s); }

  /** Gastgeber wechseln (alter weg): nächster verbundener Mensch. Bots des alten Gastgebers fahren nicht weiter. */
  function hostWechsel(raum) {
    const neu = menschen(raum).find(f => f.online && f.id !== raum.hostId) || menschen(raum).find(f => f.id !== raum.hostId);
    if (!neu) return false;
    raum.hostId = neu.id;
    if (raum.zustand === 'lobby' || raum.zustand === 'ergebnis') raum.fahrer = raum.fahrer.filter(f => !f.bot);
    else raum.fahrer.forEach(f => { if (f.bot && !f.ziel) { f.raus = true; f.rausGrund = 'gastgeber'; } });
    log('Raum ' + raum.code + ': neuer Gastgeber');
    return true;
  }

  function raumLoeschen(raum, grund) {
    for (const f of menschen(raum)) if (f.ws) { senden(f.ws, { t: 'raumZu', grund }); f.ws.c.raum = null; f.ws.c.fahrer = null; }
    raeume.delete(raum.code);
    log('Raum ' + raum.code + ' geschlossen (' + grund + '), offen: ' + raeume.size);
  }

  /** Fahrer verlässt den Raum (Nachricht „verlassen“): Lobby → entfernt; Rennen → „raus“ (bleibt in der Ergebnisliste). */
  function verlassen(c) {
    const raum = c.raum, f = c.fahrer;
    c.raum = null; c.fahrer = null;
    if (!raum || !f) return;
    f.ws = null; f.online = false; f.wegSeit = jetztMs();
    if (raum.zustand === 'lobby' || raum.zustand === 'ergebnis') raum.fahrer = raum.fahrer.filter(x => x !== f);
    else if (!f.ziel) { f.raus = true; f.rausGrund = 'verlassen'; }
    if (raum.hostId === f.id) hostWechsel(raum);
    if (!menschen(raum).some(x => x.online)) {
      if (!menschen(raum).length || raum.zustand === 'lobby' || raum.zustand === 'ergebnis') return raumLoeschen(raum, 'leer');
      raum.leerSeit = jetztMs();
    }
    lobbySenden(raum);
    log('Raum ' + raum.code + ': Fahrer weg, jetzt ' + menschen(raum).filter(x => x.online).length + ' verbunden');
  }

  /** Verbindung weg (Netz/Tab zu): Platz bleibt reconnectMs reserviert. */
  function getrennt(c) {
    const raum = c.raum, f = c.fahrer;
    c.raum = null; c.fahrer = null;
    if (!raum || !f || f.ws !== c.ws) return;
    f.ws = null; f.online = false; f.wegSeit = jetztMs();
    if (!menschen(raum).some(x => x.online)) raum.leerSeit = jetztMs();
    lobbySenden(raum);
  }

  // ---------------------------------------------------------------- Rennen
  function rennenStarten(raum) {
    raum.lauf = (raum.lauf || 0) + 1;
    const e = Object.assign({}, raum.einst);
    if (e.wind !== 'aus' && e.windRichtung === 'zufall') e.windRichtung = RICHTUNGEN[crypto.randomInt(RICHTUNGEN.length)];   // alle haben denselben Wind
    raum.rennEinst = e;
    raum.zustand = 'laden'; raum.ladenSeit = jetztMs(); raum.losMs = 0; raum.countdownBis = 0; raum.ersteZielMs = 0; raum.ergebnis = null; raum.zielM = 0;
    raum.fahrer.forEach(f => { rennFelderNeu(f); f.bereit = false; if (f.bot) f.geladen = true; });
    anAlle(raum, { t: 'laden', einst: e, lauf: raum.lauf });
    lobbySenden(raum);
    log('Raum ' + raum.code + ': Rennen wird geladen (' + menschen(raum).length + ' Menschen, ' + (raum.fahrer.length - menschen(raum).length) + ' Bots)');
  }

  function countdownStarten(raum) {
    const h = hostVon(raum);
    const quelle = (h && h.geladen && h.zielM > 0) ? h : raum.fahrer.find(f => !f.bot && f.geladen && f.zielM > 0);
    raum.zielM = quelle ? quelle.zielM : 0;
    raum.L = quelle ? quelle.L : 0;
    raum.fp = quelle ? quelle.fp : ''; raum.app = quelle ? quelle.app : '';
    for (const f of menschen(raum)) if (f.geladen && f !== quelle) abgleich(raum, f);      // Abweichler fahren nicht mit (vor dem Countdown)
    raum.zustand = 'countdown'; raum.countdownBis = jetztMs() + opt.countdownMs;
    anAlle(raum, { t: 'countdown', ms: opt.countdownMs, zielM: raum.zielM, L: raum.L, fp: raum.fp, app: raum.app });
    lobbySenden(raum);
  }

  /** Strecke/Version eines Mitfahrers mit dem Gastgeber vergleichen; Abweichung → Fahrer fährt nicht mit (raus, Grund „abweichung“) + Meldung an ihn. */
  function abgleich(raum, f) {
    if (!raum.zielM) return true;
    let grund = '';
    if (raum.app && f.app && raum.app !== f.app) grund = 'version';
    else if (raum.fp && f.fp !== raum.fp) grund = 'strecke';
    else if (Math.abs(f.zielM - raum.zielM) > 0.5) grund = 'strecke';
    if (!grund) return true;
    f.raus = true; f.rausGrund = 'abweichung';
    senden(f.ws, { t: 'abweichung', grund, deine: { app: f.app, zielM: f.zielM, fp: f.fp }, gastgeber: { app: raum.app, zielM: raum.zielM, fp: raum.fp },
      text: 'Deine Radwelt-Version/Strecke weicht ab – bitte aktualisieren' + (grund === 'version' ? ' (du: ' + (f.app || '?') + ', Gastgeber: ' + (raum.app || '?') + ')' : ' (Strecke anders gebaut)') });
    log('Raum ' + raum.code + ': Fahrer weicht ab (' + grund + ')');
    return false;
  }

  /** Zeit (Rennuhr), zu der Fahrer f den Gesamtweg d erreichte (lineare Interpolation in hist), sonst null. */
  function zeitBei(f, d) {
    const h = f.hist; if (!h.length || d > h[h.length - 1][1]) return null;
    if (d <= 0) return 0;
    let lo = 0, hi = h.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (h[m][1] >= d) hi = m; else lo = m; }
    const a = h[lo], b = h[hi];
    if (b[1] <= a[1]) return b[0];
    return a[0] + (d - a[1]) / (b[1] - a[1]) * (b[0] - a[0]);
  }
  function histAdd(f, t, d) {
    const h = f.hist, l = h[h.length - 1];
    if (d < l[1]) return;
    if (h.length > 1 && t - h[h.length - 2][0] < 0.25) { l[0] = t; l[1] = d; return; }   // höchstens ein Punkt je 0,25 s (der letzte wird bis dahin nachgeführt)
    h.push([t, d]);
    if (h.length > 20000) f.hist = h.filter((x, i) => i % 2 === 0 || i === h.length - 1);
  }

  /** Ein Zustands-Datensatz (Mensch oder Bot) prüfen und übernehmen. */
  function zustandAnnehmen(raum, f, m, ms) {
    if (f.raus && (f.rausGrund === 'stale' || f.rausGrund === 'getrennt') && raum.zustand === 'fahrt') { f.raus = false; f.rausGrund = ''; log('Raum ' + raum.code + ': Fahrer wieder dabei'); }   // Daten kommen zurück → wieder aufnehmen
    if (f.dq || f.raus) return;
    if (f.ziel) { if (typeof m.d === 'number' && Number.isFinite(m.d)) f.v = zahl(m.v, 0, MAX_V, 0); return; }
    const t = rennZeit(raum, ms);
    const num = (x) => typeof x === 'number' && Number.isFinite(x);
    if (!num(m.d) || !num(m.v) || !num(m.w)) return verstoss(raum, f, 'zahl');
    const tol = tempo;
    if (m.w > MAX_W + 0.5 || m.w < -0.5) return verstoss(raum, f, 'watt');
    if (m.v > MAX_V + 0.3 || m.v < -0.3) return verstoss(raum, f, 'tempo');
    if (num(m.wkg) && (m.wkg > MAX_WKG || m.wkg < -0.1)) return verstoss(raum, f, 'wkg');
    const dtS = f.letzteMs ? Math.max(0, (ms - f.letzteMs) / 1000) : Math.max(0, (ms - raum.losMs) / 1000);
    const dMax = f.d + MAX_V * tol * (dtS + 0.5) + 3;
    if (m.d > dMax) return verstoss(raum, f, 'sprung');
    if (m.d < f.d - 2) return verstoss(raum, f, 'zurueck');
    if (m.d > MAX_V * (t + 1.5 * tol) + 5) return verstoss(raum, f, 'sprung');
    const dAlt = f.d, tAlt = f.tz;
    if (f.letzteMs) { const dtR = (ms - f.letzteMs) / 1000 * tempo; if (dtR > 0 && dtR < 5) { f.wSum += klemm(m.w, 0, MAX_W) * dtR; f.tSum += dtR; } }
    f.d = Math.max(f.d, m.d); f.v = klemm(m.v, 0, MAX_V); f.w = klemm(m.w, 0, MAX_W); f.wkg = num(m.wkg) ? klemm(m.wkg, 0, MAX_WKG) : 0;
    f.s = num(m.s) ? klemm(m.s, 0, 1e6) : 0; f.r = Number.isInteger(m.r) ? klemm(m.r, 1, 999) : 1; f.q = num(m.q) ? klemm(m.q, -12, 12) : 0; f.k = num(m.k) ? klemm(m.k, 0, 250) : 0;
    f.tz = t; f.letzteMs = ms;
    if (raum.zielM > 0 && f.d >= raum.zielM - 0.05) {
      const tZ = f.d > dAlt ? tAlt + (raum.zielM - dAlt) / (f.d - dAlt) * (t - tAlt) : t;
      const korr = klemm(f.rtt || 0, 0, 1000) / 2000 * tempo;      // halbe Laufzeit (Ping) abziehen: Zielzeit ≈ Zeitpunkt beim Fahrer
      const tz2 = Math.max(0, klemm(tZ, tAlt, t) - korr);
      histAdd(f, klemm(tZ, tAlt, t), raum.zielM);
      f.ziel = true; f.zielZeit = Math.round(tz2 * 1000) / 1000;
      if (!raum.ersteZielMs) raum.ersteZielMs = ms;
      log('Raum ' + raum.code + ': Fahrer im Ziel');
    } else histAdd(f, t, f.d);
  }
  function verstoss(raum, f, grund) {
    f.verstoesse++;
    if (f.verstoesse >= DQ_AB && !f.dq) { f.dq = true; log('Raum ' + raum.code + ': Fahrer disqualifiziert (' + grund + ')'); }
    const ws = f.bot ? (hostVon(raum) || {}).ws : f.ws;
    const ms = jetztMs();
    if (ws && (!f.warnMs || ms - f.warnMs > 3000)) { f.warnMs = ms; senden(ws, { t: 'warnung', grund, id: f.id, dq: f.dq, anzahl: f.verstoesse }); }
  }

  /** Rangliste: im Ziel (nach Zeit) → unterwegs (nach Weg) → raus → disqualifiziert. Abstand zum Ersten in s (gs) und m (gm). */
  function rangliste(raum) {
    const rang = (f) => (f.dq ? 3 : f.ziel ? 0 : f.raus ? 2 : 1);
    const liste = raum.fahrer.slice().sort((a, b) => rang(a) - rang(b) || (rang(a) === 0 ? a.zielZeit - b.zielZeit : b.d - a.d));
    const erster = liste[0];
    return liste.map((f, i) => {
      let gs = null, gm = null;
      if (erster && f !== erster && !f.dq) {
        gm = Math.max(0, erster.d - f.d);
        if (f.ziel && erster.ziel) gs = f.zielZeit - erster.zielZeit;
        else { const te = zeitBei(erster, f.d); if (te !== null) gs = Math.max(0, f.tz - te); }
      } else if (f === erster) { gs = 0; gm = 0; }
      return { f, platz: i + 1, gs: gs === null ? null : Math.round(gs * 100) / 100, gm: gm === null ? null : Math.round(gm * 10) / 10 };
    });
  }
  function standSenden(raum) {
    const zeit = rennZeit(raum);
    const fahrer = rangliste(raum).map(({ f, platz, gs, gm }) => ({ id: f.id, platz, d: Math.round(f.d * 100) / 100, s: Math.round(f.s * 100) / 100, r: f.r, v: Math.round(f.v * 100) / 100,
      w: Math.round(f.w), wkg: Math.round(f.wkg * 100) / 100, q: Math.round(f.q * 100) / 100, k: Math.round(f.k), tz: Math.round(f.tz * 1000) / 1000, ziel: f.ziel, zz: f.zielZeit,
      on: f.bot ? !f.raus : f.online, raus: f.raus, dq: f.dq, bot: f.bot, sim: f.sim || undefined, gs, gm }));
    anAlle(raum, { t: 'stand', zeit: Math.round(zeit * 1000) / 1000, zielM: raum.zielM, zustand: raum.zustand, fahrer });
  }
  function ergebnisSenden(raum, grund) {
    const zeit = rennZeit(raum);
    raum.zustand = 'ergebnis';
    raum.ergebnis = rangliste(raum).map(({ f, platz, gs, gm }) => ({ platz, id: f.id, name: f.name, bot: f.bot, zeit: f.zielZeit, gs, gm, d: Math.round(f.d * 10) / 10,
      avgW: f.tSum > 0 ? Math.round(f.wSum / f.tSum) : 0, status: f.dq ? 'dq' : f.ziel ? 'ziel' : f.raus ? 'raus' : 'unterwegs', grund: f.rausGrund || undefined, sim: f.sim || undefined }));
    raum.fahrer.forEach(f => { f.bereit = false; });
    anAlle(raum, { t: 'ergebnis', grund, zeit: Math.round(zeit * 1000) / 1000, zielM: raum.zielM, liste: raum.ergebnis, lauf: raum.lauf });
    lobbySenden(raum);
    log('Raum ' + raum.code + ': Ergebnis (' + grund + ')');
  }

  // ---------------------------------------------------------------- Takt (5×/s)
  function takt() {
    const ms = jetztMs();
    for (const raum of [...raeume.values()]) {
      try {
        testFehler('takt');
        if (raum.zustand === 'laden') {
          const alle = menschen(raum).filter(f => f.online).every(f => f.geladen);
          if (alle || ms - raum.ladenSeit > opt.ladenMaxMs) countdownStarten(raum);
        } else if (raum.zustand === 'countdown') {
          if (ms >= raum.countdownBis) {
            raum.zustand = 'fahrt'; raum.losMs = ms;
            raum.fahrer.forEach(f => { f.letzteMs = 0; });
            anAlle(raum, { t: 'los', zielM: raum.zielM });
            lobbySenden(raum);
            log('Raum ' + raum.code + ': los');
          }
        } else if (raum.zustand === 'fahrt') {
          for (const f of raum.fahrer) {
            if (f.ziel || f.raus || f.dq) continue;
            const still = f.letzteMs ? ms - f.letzteMs : ms - raum.losMs;
            if (!f.bot && !f.online && ms - f.wegSeit > opt.reconnectMs) { f.raus = true; f.rausGrund = 'getrennt'; }      // kommt er (bis zum Rennende) mit Daten zurück, fährt er weiter
            else if (still > opt.staleMs * 2) { f.raus = true; f.rausGrund = 'stale'; }
          }
          standSenden(raum);
          const aktiv = raum.fahrer.filter(f => !f.ziel && !f.raus && !f.dq);
          if (!aktiv.length) ergebnisSenden(raum, 'alleImZiel');
          else if (raum.ersteZielMs && ms - raum.ersteZielMs > opt.nachZielMs) ergebnisSenden(raum, 'zeit');
        }
      } catch (e) { console.error('[rad] Fehler in Raum ' + raum.code, e && e.stack); raumLoeschen(raum, 'fehler'); }
    }
  }
  const taktTimer = setInterval(() => { try { takt(); } catch (e) { console.error('[rad] Takt:', e && e.stack); } }, opt.taktMs);
  if (taktTimer.unref) taktTimer.unref();

  function aufraeumen() {
    const ms = jetztMs();
    try { for (const [k, v] of fehlVersuche) if (ms - v.letzte > 10 * 60000 && ms > v.sperreBis) fehlVersuche.delete(k); } catch (e) { /* egal */ }
    for (const raum of [...raeume.values()]) {
      try { aufraeumenRaum(raum, ms); } catch (e) { console.error('[rad] Fehler beim Aufräumen von Raum ' + raum.code, e && e.stack); try { raumLoeschen(raum, 'fehler'); } catch (e2) { raeume.delete(raum.code); } }
    }
  }
  function aufraeumenRaum(raum, ms) {
    {
      testFehler('aufraeumen');
      let geaendert = false;
      for (const f of menschen(raum)) {
        if (f.online || ms - f.wegSeit <= opt.reconnectMs) continue;
        if (raum.zustand === 'lobby' || raum.zustand === 'ergebnis') { raum.fahrer = raum.fahrer.filter(x => x !== f); geaendert = true; }
        else if (!f.ziel && !f.raus) { f.raus = true; f.rausGrund = 'getrennt'; geaendert = true; }
        if (raum.hostId === f.id && hostWechsel(raum)) geaendert = true;
      }
      const verbunden = menschen(raum).some(f => f.online);
      if (!verbunden) {
        if (!raum.leerSeit) raum.leerSeit = ms;
        if (ms - raum.leerSeit > opt.leerMs) { raumLoeschen(raum, 'leer'); return; }
      } else raum.leerSeit = 0;
      if (geaendert) lobbySenden(raum);
    }
  }
  const aufrTimer = setInterval(() => { try { aufraeumen(); } catch (e) { console.error('[rad] Aufräumen:', e && e.stack); } }, opt.aufraeumenMs);
  if (aufrTimer.unref) aufrTimer.unref();

  // ---------------------------------------------------------------- Nachrichten
  function nachricht(c, m) {
    const ws = c.ws, raum = c.raum, f = c.fahrer, ms = jetztMs();
    switch (m.t) {
      case 'hallo': return senden(ws, { t: 'hallo', v: VERSION, pfad: PFAD, max: MAX_FAHRER });
      case 'ping': return senden(ws, { t: 'pong', z: typeof m.z === 'number' ? m.z : 0, k: raum ? rennZeit(raum) : 0 });
      case 'erstellen': {
        if (ms - (c.erstelltAm || 0) < 2000) return fehler(ws, 'zu_schnell', 'Bitte einen Moment warten');
        c.erstelltAm = ms;
        if (m.v !== VERSION) return fehler(ws, 'version', 'Deine Radwelt-Version passt nicht zum Server (Server ' + VERSION + ') – bitte aktualisieren');
        if (raum) verlassen(c);
        if (raeume.size >= opt.maxRaeume) return fehler(ws, 'voll', 'Zu viele Räume – später nochmal');
        if (c.schluessel !== 'lokal') { let n = 0; for (const r of raeume.values()) if (r.schluessel === c.schluessel) n++; if (n >= MAX_RAEUME_JE_ADRESSE) return fehler(ws, 'voll', 'Zu viele Räume von dieser Adresse'); }
        const code = zufallsCode(); if (!code) return fehler(ws, 'voll', 'Zu viele Räume');
        const neu = { code, fahrer: [], hostId: '', zustand: 'lobby', einst: einstPruefen(m.einst), lauf: 0, leerSeit: 0, schluessel: c.schluessel, zielM: 0, losMs: 0, gesperrt: false, verbannt: new Set() };
        const ich = fahrerNeu(neu, m.name, m.optik, false, m.app);
        ich.ws = ws; ich.schluessel = c.schluessel; neu.fahrer.push(ich); neu.hostId = ich.id;
        raeume.set(code, neu);
        c.raum = neu; c.fahrer = ich;
        senden(ws, { t: 'raum', code, id: ich.id, token: ich.token, host: true });
        lobbySenden(neu);
        log('Raum ' + code + ' erstellt, offen: ' + raeume.size);
        return;
      }
      case 'beitreten': {
        // Code-Raten: Sperre je Adresse/Tailnet-Identität (nicht je Verbindung), ab 5 Fehlversuchen exponentiell 1, 2, 4 … s (höchstens fehlSperreMaxS)
        const fv = fehlVersuche.get(c.schluessel);
        if (fv && ms < fv.sperreBis) return fehler(ws, 'zu_schnell', 'Zu viele falsche Codes – bitte ' + Math.ceil((fv.sperreBis - ms) / 1000) + ' s warten');
        if (m.v !== VERSION) return fehler(ws, 'version', 'Deine Radwelt-Version passt nicht zum Server (Server ' + VERSION + ') – bitte aktualisieren');
        const code = codeNormal(m.code), ziel = code && raeume.get(code);
        if (!ziel) {
          const x = fv || { n: 0, sperreBis: 0, letzte: 0 };
          x.n++; x.letzte = ms;
          if (x.n >= opt.fehlFenster) x.sperreBis = ms + Math.min(opt.fehlSperreMaxS, Math.pow(2, x.n - opt.fehlFenster)) * 1000;
          fehlVersuche.set(c.schluessel, x);
          return fehler(ws, 'unbekannt', 'Diesen Raum gibt es nicht');
        }
        if (ziel === raum) return lobbySenden(ziel);
        if (ziel.gesperrt) return fehler(ws, 'gesperrt', 'Der Gastgeber hat den Raum gesperrt');
        if (c.schluessel !== 'lokal' && ziel.verbannt.has(c.schluessel)) return fehler(ws, 'gesperrt', 'Du wurdest aus diesem Raum entfernt');
        if (ziel.zustand !== 'lobby' && ziel.zustand !== 'ergebnis') return fehler(ws, 'laeuft', 'Dort läuft gerade eine Fahrt – gleich nochmal versuchen');
        if (menschen(ziel).length >= MAX_FAHRER) return fehler(ws, 'voll', 'Der Raum ist voll (8 Fahrer)');
        if (raum) verlassen(c);
        if (ziel.fahrer.length >= MAX_FAHRER) { const b = ziel.fahrer.map(x => x.bot).lastIndexOf(true); if (b >= 0) ziel.fahrer.splice(b, 1); }   // Menschen vor Bots
        const ich = fahrerNeu(ziel, m.name, m.optik, false, m.app);
        ich.ws = ws; ich.schluessel = c.schluessel; ziel.fahrer.push(ich); ziel.leerSeit = 0;
        if (fv) fehlVersuche.delete(c.schluessel);
        c.raum = ziel; c.fahrer = ich;
        senden(ws, { t: 'raum', code: ziel.code, id: ich.id, token: ich.token, host: false });
        lobbySenden(ziel);
        log('Raum ' + ziel.code + ': Fahrer dazu, jetzt ' + menschen(ziel).length);
        return;
      }
      case 'wieder': {
        const code = codeNormal(m.code), ziel = code && raeume.get(code);
        const x = ziel && typeof m.id === 'string' && typeof m.token === 'string' && m.token.length === 24 ? ziel.fahrer.find(y => !y.bot && y.id === m.id && y.token === m.token) : null;
        if (!x) return senden(ws, { t: 'wiederNein' });
        if (c.fahrer && c.fahrer !== x) verlassen(c);      // dieser Socket hatte schon einen anderen Platz: erst abgeben
        if (x.ws && x.ws !== ws) { const alt = x.ws; alt.c.raum = null; alt.c.fahrer = null; senden(alt, { t: 'raumZu', grund: 'andererTab' }); }
        x.ws = ws; x.online = true; x.wegSeit = 0; ziel.leerSeit = 0;
        c.raum = ziel; c.fahrer = x;
        senden(ws, { t: 'raum', code: ziel.code, id: x.id, token: x.token, host: ziel.hostId === x.id, wieder: true, zustand: ziel.zustand, einst: ziel.rennEinst || ziel.einst,
          zielM: ziel.zielM, zeit: rennZeit(ziel), du: { d: x.d, ziel: x.ziel, raus: x.raus } });
        lobbySenden(ziel);
        if (ziel.zustand === 'ergebnis' && ziel.ergebnis) senden(ws, { t: 'ergebnis', grund: 'wieder', zielM: ziel.zielM, liste: ziel.ergebnis, lauf: ziel.lauf });
        log('Raum ' + ziel.code + ': Fahrer wieder da');
        return;
      }
      case 'verlassen':
        verlassen(c);
        return senden(ws, { t: 'verlassen' });
    }
    if (!raum || !f) return fehler(ws, 'keinRaum', 'Du bist in keinem Raum');
    const istHost = raum.hostId === f.id;
    switch (m.t) {
      case 'einstellungen':
        if (!istHost) return fehler(ws, 'nurHost', 'Nur der Gastgeber darf das ändern');
        if (raum.zustand !== 'lobby' && raum.zustand !== 'ergebnis') return;
        raum.einst = einstPruefen(m.einst, raum.einst);
        if (m.einst && typeof m.einst.strecke === 'string' && /^gpx-/.test(m.einst.strecke)) fehler(ws, 'gpx', 'GPX-Strecken gehen (noch) nicht im Mehrspieler – es bleibt die bisherige Strecke');      // R5
        return lobbySenden(raum);
      case 'optik':
        if (raum.zustand !== 'lobby' && raum.zustand !== 'ergebnis') return;
        f.optik = optikPruefen(m.optik);
        if (typeof m.name === 'string' && text(m.name, 24) && text(m.name, 24) !== f.name) { const alt = f.name; f.name = ''; f.name = nameFrei(raum, m.name, false) || alt; }
        return lobbySenden(raum);
      case 'bots': {
        if (!istHost) return fehler(ws, 'nurHost', 'Nur der Gastgeber bringt Bots mit');
        if (raum.zustand !== 'lobby' && raum.zustand !== 'ergebnis') return;
        const liste = Array.isArray(m.liste) ? m.liste.slice(0, MAX_FAHRER) : [];
        const platz = MAX_FAHRER - menschen(raum).length;
        const alt = raum.fahrer.filter(x => x.bot);
        raum.fahrer = raum.fahrer.filter(x => !x.bot);
        liste.slice(0, platz).forEach((b, i) => {
          const name = '🤖 ' + (text(b && b.name, 20) || 'Bot ' + (i + 1));
          const vorher = alt[i] && alt[i].name === name ? alt[i] : null;
          const bot = vorher || fahrerNeu(raum, name, b && b.optik, true);
          bot.optik = optikPruefen(b && b.optik);
          raum.fahrer.push(bot);
        });
        return lobbySenden(raum);
      }
      case 'bereit':
        if (raum.zustand !== 'lobby' && raum.zustand !== 'ergebnis') return;
        f.bereit = m.an !== false;
        return lobbySenden(raum);
      case 'start':
        if (!istHost) return fehler(ws, 'nurHost', 'Nur der Gastgeber startet');
        if (raum.zustand !== 'lobby' && raum.zustand !== 'ergebnis') return;
        if (menschen(raum).some(x => x.online && x !== f && !x.bereit)) return fehler(ws, 'nichtBereit', 'Noch nicht alle sind bereit');
        if (ms - (c.startAm || 0) < 2000) return fehler(ws, 'zu_schnell', 'Bitte einen Moment warten');
        c.startAm = ms;
        return rennenStarten(raum);
      case 'geladen':
        if (raum.zustand !== 'laden' && raum.zustand !== 'countdown' && raum.zustand !== 'fahrt') return;
        f.geladen = true;
        f.L = zahl(m.L, 0, 400000, 0); f.zielM = zahl(m.zielM, 0, 400000, 0);
        f.fp = typeof m.fp === 'string' && /^[0-9a-z]{1,40}$/.test(m.fp) ? m.fp : ''; f.sim = m.sim === true;
        if (typeof m.app === 'string') f.app = text(m.app, 24);
        if (raum.zustand !== 'laden' && !f.raus) abgleich(raum, f);      // zu spät geladen: gleich hier prüfen
        return;
      case 'z': {
        if (raum.zustand !== 'fahrt') return;
        if (typeof m.rtt === 'number' && Number.isFinite(m.rtt)) f.rtt = klemm(m.rtt, 0, 5000);
        if (m.sim === true || m.sim === false) f.sim = m.sim;
        zustandAnnehmen(raum, f, m, ms);
        if (m.fertig === true && !f.ziel && !f.dq && !f.raus) {
          if (raum.zielM > 0 && f.d >= raum.zielM - 2) { f.ziel = true; f.zielZeit = Math.round(f.tz * 1000) / 1000; if (!raum.ersteZielMs) raum.ersteZielMs = ms; }      // knapp vor der Zielstrecke beendet (Rundung) = im Ziel
          else { f.raus = true; f.rausGrund = 'aufgegeben'; }
          f.fertigGemeldet = true;
        }
        if (istHost && Array.isArray(m.bots)) {
          const bots = raum.fahrer.filter(x => x.bot);
          m.bots.slice(0, bots.length).forEach((b, i) => { if (b && typeof b === 'object') zustandAnnehmen(raum, bots[i], b, ms); if (b && b.fertig === true && !bots[i].ziel && !bots[i].raus) { bots[i].raus = true; bots[i].rausGrund = 'gastgeber'; } });
        }
        return;
      }
      case 'beenden':
        if (!istHost) return fehler(ws, 'nurHost', 'Nur der Gastgeber beendet die Fahrt');
        if (raum.zustand === 'laden' || raum.zustand === 'countdown' || raum.zustand === 'fahrt') return ergebnisSenden(raum, 'gastgeber');
        return;
      case 'rauswerfen': {
        if (!istHost) return fehler(ws, 'nurHost', 'Nur der Gastgeber darf das');
        const x = raum.fahrer.find(y => !y.bot && y.id === m.id && y !== f); if (!x) return;
        if (x.schluessel && x.schluessel !== 'lokal') raum.verbannt.add(x.schluessel);
        if (x.ws) { senden(x.ws, { t: 'raumZu', grund: 'rausgeworfen' }); x.ws.c.raum = null; x.ws.c.fahrer = null; }
        x.ws = null; x.online = false; x.wegSeit = ms;
        if (raum.zustand === 'lobby' || raum.zustand === 'ergebnis') raum.fahrer = raum.fahrer.filter(y => y !== x);
        else if (!x.ziel) { x.raus = true; x.rausGrund = 'rausgeworfen'; x.token = crypto.randomBytes(12).toString('hex'); }
        log('Raum ' + raum.code + ': Fahrer vom Gastgeber entfernt');
        return lobbySenden(raum);
      }
      case 'sperren':
        if (!istHost) return fehler(ws, 'nurHost', 'Nur der Gastgeber darf das');
        raum.gesperrt = m.an !== false;
        return lobbySenden(raum);
      case 'zurLobby':
        if (!istHost || raum.zustand !== 'ergebnis') return;
        raum.zustand = 'lobby';
        raum.fahrer.forEach(x => { x.bereit = false; });
        return lobbySenden(raum);
      default:
        return fehler(ws, 'unbekannt', 'Unbekannte Nachricht');
    }
  }

  function verbinden(ws, req) {
    verbindungen++;
    const c = { ws, raum: null, fahrer: null, zaehler: 0, zaehlerSeit: jetztMs(), lebt: true, schluessel: adressSchluessel(req) };
    ws.c = c;
    ws.on('pong', () => { c.lebt = true; });
    ws.on('message', (daten, binaer) => { try {
      c.lebt = true;
      const ms = jetztMs();
      if (ms - c.zaehlerSeit > 1000) { c.zaehler = 0; c.zaehlerSeit = ms; }
      if (++c.zaehler > 250) { ws.terminate(); return; }
      if (c.zaehler > 25 || binaer) return;
      let m;
      try { m = JSON.parse(daten.toString('utf8')); } catch (e) { return fehler(ws, 'json', 'Ungültige Nachricht'); }
      if (!m || typeof m !== 'object' || Array.isArray(m) || typeof m.t !== 'string') return fehler(ws, 'json', 'Ungültige Nachricht');
      try { testFehler('nachricht'); nachricht(c, m); } catch (e) { console.error('[rad] Fehler bei', String(m.t).slice(0, 20), e && e.stack); try { fehler(ws, 'intern', 'Interner Fehler'); } catch (e2) { /* egal */ } }
    } catch (e) { console.error('[rad] Nachricht:', e && e.stack); } });
    ws.on('close', () => {
      try {
        verbindungen--; clearInterval(c.herz);
        if (ws.ipKey) { const n = (proIp.get(ws.ipKey) || 1) - 1; if (n > 0) proIp.set(ws.ipKey, n); else proIp.delete(ws.ipKey); }
        testFehler('close');
        getrennt(c);
      } catch (e) { console.error('[rad] Fehler beim Schließen:', e && e.stack); }
    });
    ws.on('error', () => {});
    c.herz = setInterval(() => {
      try { if (!c.lebt) { ws.terminate(); return; } c.lebt = false; ws.ping(); } catch (e) { /* zu */ }
    }, 15000);
    senden(ws, { t: 'hallo', v: VERSION, pfad: PFAD, max: MAX_FAHRER });
  }
  wss.on('connection', (ws, req) => { try { verbinden(ws, req); } catch (e) { console.error('[rad] Verbinden:', e && e.stack); try { ws.terminate(); } catch (e2) { /* egal */ } } });

  return {
    raeume,
    verbindungen: () => verbindungen,
    /** Aus server.js: Upgrade-Anfrage auf PFAD annehmen oder abweisen. */
    upgrade(req, socket, kopf) {
      try {
        if (!originErlaubt(req, oeffentlichHost, extraOrigins)) { socket.write('HTTP/1.1 403 Forbidden\r\n\r\n'); socket.destroy(); return; }
        if (verbindungen >= 80) { socket.write('HTTP/1.1 503 Service Unavailable\r\n\r\n'); socket.destroy(); return; }
        const sk = adressSchluessel(req), key = sk === 'lokal' ? null : sk;      // X-Forwarded-For nur vom lokalen Proxy, sonst Socket-Adresse
        if (key && (proIp.get(key) || 0) >= 8) { socket.write('HTTP/1.1 429 Too Many Requests\r\n\r\n'); socket.destroy(); return; }
        wss.handleUpgrade(req, socket, kopf, (ws) => {
          if (key) { ws.ipKey = key; proIp.set(key, (proIp.get(key) || 0) + 1); }
          wss.emit('connection', ws, req);
        });
      } catch (e) { console.error('[rad] Upgrade:', e && e.stack); try { socket.destroy(); } catch (e2) { /* egal */ } }
    },
    schliessen() { clearInterval(taktTimer); clearInterval(aufrTimer); for (const ws of wss.clients) ws.terminate(); wss.close(); },
  };
}

module.exports = { erzeugen, PFAD, VERSION, originErlaubt, adressSchluessel, bekannterHost, einstPruefen, optikPruefen, MAX_FAHRER, MAX_W, MAX_V };
