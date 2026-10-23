// ============================================================
// Radwelt R3c-D – Speicher-API (nur 127.0.0.1). Eigene Datei; server.js ruft nur behandeln() vor den statischen Dateien auf.
//
//   Ablage (Dateien, Standard $HOME/Documents/Radwelt-Projekt/Daten, per --daten bzw. RADWELT_DATEN):
//     fahrten/<id>.json      Zusammenfassung (klein, wird für Listen/Vergleich gelesen)
//     fahrten/<id>.fit       FIT-Datei (Strava/Garmin)
//     fahrten/<id>.pos.json  Zeit + Watt je Streckenposition alle 5 m  { ds:5, zeit:[s bei 0,5,10 … m], watt:[Ø W je 5-m-Stück], ende:{m,zeit} }
//     strecken/<id>.json     gebaute Strecke (Parameter + Seed + Name)
//   Routen (alle unter /api/rad/):
//     GET  status                    → { ok:true, api:2, ordner, fahrten, strecken }  (api:2 = R3c-D2: clientId-Dedupe, unterlenker, atomar mit fsync)
//     POST fahrt                     Body JSON { …Zusammenfassung, fit (Base64), pos } → { ok, id }
//     GET  fahrten                   → { fahrten:[Zusammenfassung…] } (neueste zuerst, höchstens 1000)
//     GET  fahrt/<id>  |  fahrt/<id>/pos  |  fahrt/<id>/fit
//     DELETE fahrt/<id>
//     POST strecke                   Body { name, bau:{km,anstiege,hm,maxSteig,art,thema,seed}, km?, hm? } → { ok, id }
//     GET  strecken  |  DELETE strecke/<id>
//     R5 GPX: POST gpx  Body { id?, name, datei, teile?:'erster', roh:{ art, name, punkte:[[lat·1e6, lon·1e6, Höhe·10|null] …] } } → { ok, id, km, hm, maxSteig }
//             Der Server bereinigt selbst (src/rad/gpx.js, gleicher Code wie im Browser): ID = Hash der Rohpunkte, Länge 0,5–200 km, ≥ 10 Punkte,
//             Kennzahlen aus den Punkten, höchstens GPX_PUNKTE_MAX bereinigte Punkte. Gespeichert wird nur die bereinigte Form (+ glaettung = Version).
//             GET gpxstrecken → { strecken:[Kopfdaten] } (aus gpx/_index.json, fehlt der Index: einmal neu aufbauen)  |  GET gpx/<id> (mit punkte)  |  DELETE gpx/<id>
//   Schreiben atomar (tmp + fsync + rename + fsync Ordner); beim Start werden *.tmp und Waisen (.pos.json/.fit ohne .json, älter als 60 s) aufgeräumt; Symlinks im Datenordner werden ignoriert (nur echte Dateien).
//   Schutz: nur Loopback-Quelle, keine Proxy-/Funnel-/Tailscale-Header, Host muss localhost/127.0.0.1/[::1] sein, Origin (falls da) muss zum Host
//   passen, POST nur als application/json, Größenlimit je Anfrage, IDs nur [a-z0-9_-], Pfade werden zusätzlich geprüft (kein ../).
// ============================================================
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

const BODY_MAX = 8 * 1024 * 1024;           // Anfrage insgesamt
const FIT_MAX = 4 * 1024 * 1024;            // FIT-Datei (entpackt)
const POS_MAX = 60000;                      // 5 m × 60000 = 300 km
const FAHRTEN_MAX = 5000, STRECKEN_MAX = 300, LISTE_MAX = 1000, GPX_MAX = 300, GPX_PUNKTE_MAX = 30000;
const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);
const FREMD_KOPF = ['x-forwarded-for', 'x-forwarded-host', 'forwarded', 'x-real-ip', 'cf-connecting-ip', 'cf-ray', 'tailscale-funnel-request', 'tailscale-user-login'];
const ID_RE = /^[a-z0-9][a-z0-9_-]{0,79}$/;

const klemm = (x, a, b) => Math.max(a, Math.min(b, x));
const zahl = (v, lo, hi, d) => (typeof v === 'number' && Number.isFinite(v) ? klemm(v, lo, hi) : d);
const text = (v, max) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f<>]/g, '').trim().slice(0, max) : '');

class Fehler extends Error { constructor(code, msg) { super(msg); this.code = code; } }

/** Zahlen-Objekt (höchstens 2 Ebenen, 40 Schlüssel, nur endliche Zahlen/null). */
function zahlenObjekt(o, tiefe) {
  const r = {};
  if (!o || typeof o !== 'object' || Array.isArray(o)) return r;
  let n = 0;
  for (const k of Object.keys(o)) {
    if (++n > 40) break;
    if (!/^[A-Za-z0-9_]{1,24}$/.test(k)) continue;
    const v = o[k];
    if (typeof v === 'number' && Number.isFinite(v)) r[k] = v;
    else if (v === null) r[k] = null;
    else if (tiefe < 1 && v && typeof v === 'object' && !Array.isArray(v)) r[k] = zahlenObjekt(v, tiefe + 1);
  }
  return r;
}
function bauPruefen(b) {
  if (!b || typeof b !== 'object') return null;
  return {
    km: zahl(b.km, 2, 100, 20), anstiege: Math.round(zahl(b.anstiege, 0, 10, 3)), hm: zahl(b.hm, 0, 20000, 300), maxSteig: zahl(b.maxSteig, 2, 20, 8),
    art: b.art === 'ab' ? 'ab' : 'rund', thema: b.thema === 'wald' ? 'wald' : 'wiese', seed: Math.round(zahl(b.seed, 1, 999999, 1)),
  };
}
/** R5: Bereinigung wie im Browser (src/rad/gpx.js; lazy, damit radApi.js auch ohne src/ lädt). */
let _G = null;
function gpxModul() {
  if (_G) return _G;
  try { _G = require(path.join(__dirname, '..', 'src', 'rad', 'gpx.js')); } catch (e) { throw new Fehler(501, 'GPX-Modul fehlt'); }
  return _G;
}
/** POST-Body → gespeicherte Strecke (bereinigt auf dem Server). */
function gpxBereinigen(b) {
  if (!b || typeof b !== 'object' || !b.roh || typeof b.roh !== 'object') throw new Fehler(400, 'Rohpunkte fehlen');
  const G = gpxModul(), p = G.ausKompakt(b.roh);
  if (!p.ok) throw new Fehler(400, p.fehler);
  const r = G.bereinigen(p, text(b.datei, 80), { teile: b.teile === 'erster' ? 'erster' : undefined });
  if (!r.ok) throw new Fehler(400, r.fehler);
  if (b.id !== undefined && b.id !== r.id) throw new Fehler(400, 'id passt nicht zum Inhalt');
  if (r.daten.punkte.length > GPX_PUNKTE_MAX) throw new Fehler(413, 'zu viele Punkte nach dem Bereinigen');
  const d = r.daten, name = text(b.name, 40) || text(d.name, 40) || 'GPX-Strecke';
  return { v: 2, id: r.id, name, glaettung: d.glaettung, geschlossen: d.geschlossen, punkte: d.punkte, lat0: d.lat0, lon0: d.lon0, quelle: d.quelle,
    km: Math.round(r.kz.km * 1000) / 1000, hm: Math.round(r.kz.hm * 10) / 10, maxSteig: Math.round(r.kz.maxSteig * 10) / 10 };
}
function nullbar(v, lo, hi) { return typeof v === 'number' && Number.isFinite(v) ? klemm(v, lo, hi) : null; }

/** Fahrt-Zusammenfassung aus dem Body streng zusammenbauen (nur bekannte Felder). */
function fahrtBereinigen(b) {
  if (!b || typeof b !== 'object') throw new Fehler(400, 'Body fehlt');
  let wind = null;
  if (b.wind !== undefined && b.wind !== null) { try { const s = JSON.stringify(b.wind); if (s.length <= 500) wind = JSON.parse(s); } catch (e) { /* egal */ } }
  const modus = b.modus === 'workout' ? 'workout' : 'strecke';
  return {
    v: 1, startMs: zahl(b.startMs, 0, 4e12, Date.now()),
    streckeId: text(b.streckeId, 100), streckeName: text(b.streckeName, 60), routeKey: text(b.routeKey, 120), bau: bauPruefen(b.bau),
    runden: Math.round(zahl(b.runden, 0, 100, 0)), wind, windKey: text(b.windKey, 120), realismus: zahl(b.realismus, 0, 100, 75),
    wetter: text(b.wetter, 20), tageszeit: text(b.tageszeit, 20), modus, sim: !!b.sim, vergleichbar: !!b.vergleichbar && modus === 'strecke',
    name: text(b.name, 24), unterlenker: !!b.unterlenker, glaettung: nullbar(b.glaettung, 0, 1000),      // R5: Version der GPX-Bereinigung (null = keine GPX-Strecke)
    clientId: /^[A-Za-z0-9_-]{1,40}$/.test(b.clientId || '') ? b.clientId : '', gewicht: zahl(b.gewicht, 30, 200, 80), ftp: zahl(b.ftp, 50, 600, 200),
    streckeLaenge: zahl(b.streckeLaenge, 0, 1e7, 0), zielM: zahl(b.zielM, 0, 1e7, 0), zielZeit: nullbar(b.zielZeit, 0, 1e6), endeM: zahl(b.endeM, 0, 1e7, 0), endeZeit: zahl(b.endeZeit, 0, 1e6, 0),
    rundenZeit: Array.isArray(b.rundenZeit) ? b.rundenZeit.slice(0, 500).filter(x => typeof x === 'number' && Number.isFinite(x)).map(x => Math.round(klemm(x, 0, 1e5) * 100) / 100) : [],
    ftpTest: nullbar(b.ftpTest, 50, 600), z: zahlenObjekt(b.z, 0),
  };
}
function posBereinigen(p) {
  if (!p || typeof p !== 'object' || !Array.isArray(p.zeit) || !Array.isArray(p.watt)) throw new Fehler(400, 'pos fehlt');
  if (p.zeit.length > POS_MAX + 1 || p.watt.length > POS_MAX) throw new Fehler(413, 'pos zu groß');
  const ok = (a) => a.every(x => typeof x === 'number' && Number.isFinite(x));
  if (!ok(p.zeit) || !ok(p.watt)) throw new Fehler(400, 'pos ungültig');
  const ende = p.ende && typeof p.ende === 'object' ? { m: zahl(p.ende.m, 0, 1e7, 0), zeit: zahl(p.ende.zeit, 0, 1e6, 0) } : null;
  return { ds: 5, zeit: p.zeit.map(x => Math.round(x * 100) / 100), watt: p.watt.map(x => Math.round(x)), ende };
}

function erzeugen(opt) {
  opt = opt || {};
  const wurzel = path.resolve(opt.daten || process.env.RADWELT_DATEN || path.join(os.homedir(), 'Documents', 'Radwelt-Projekt', 'Daten'));
  const dirF = path.join(wurzel, 'fahrten'), dirS = path.join(wurzel, 'strecken'), dirG = path.join(wurzel, 'gpx');

  const pfad = (dir, id, endung) => {
    if (!ID_RE.test(id)) throw new Fehler(400, 'ungültige ID');
    const p = path.resolve(dir, id + endung);
    if (path.dirname(p) !== dir) throw new Fehler(400, 'ungültiger Pfad');
    return p;
  };
  const verzSync = (dir) => { try { const fd = fs.openSync(dir, 'r'); try { fs.fsyncSync(fd); } finally { fs.closeSync(fd); } } catch (e) { /* Windows/ohne Rechte: egal */ } };
  const schreiben = (datei, inhalt) => {      // atomar + stromausfallsicher: .tmp schreiben, fsync, umbenennen, Ordner fsync
    const tmp = datei + '.' + crypto.randomBytes(4).toString('hex') + '.tmp';
    try {
      const fd = fs.openSync(tmp, 'wx', 0o644);
      try { fs.writeFileSync(fd, inhalt); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
      fs.renameSync(tmp, datei); verzSync(path.dirname(datei));
    } catch (e) { try { fs.unlinkSync(tmp); } catch (e2) { /* egal */ } throw e; }
  };
  /** nur echte Dateien (Symlinks werden ignoriert) */
  const istDatei = (p) => { try { return fs.lstatSync(p).isFile(); } catch (e) { return false; } };
  const dateien = (dir, endung) => { try { return fs.readdirSync(dir).filter(n => n.endsWith(endung) && !n.endsWith('.pos.json') && ID_RE.test(n.slice(0, -endung.length)) && istDatei(path.join(dir, n))).sort().reverse(); } catch (e) { return []; } };
  const lesenJson = (datei) => { if (!istDatei(datei)) throw new Error('keine Datei'); return JSON.parse(fs.readFileSync(datei, 'utf8')); };
  /** Start: *.tmp und Waisen (.pos.json/.fit ohne .json) entfernen; Waisen erst ab 60 s Alter (läuft noch ein anderer Prozess?) */
  function aufraeumen() {
    let n = 0;
    for (const dir of [dirF, dirS, dirG]) {
      let namen = []; try { namen = fs.readdirSync(dir); } catch (e) { continue; }
      const set = new Set(namen);
      for (const nm of namen) {
        const p = path.join(dir, nm);
        let st; try { st = fs.lstatSync(p); } catch (e) { continue; }
        if (!st.isFile() || Date.now() - st.mtimeMs < 60000) continue;
        let weg = nm.endsWith('.tmp');
        if (!weg && dir === dirF) { const m = /^(.*?)(\.pos\.json|\.fit)$/.exec(nm); weg = !!m && !set.has(m[1] + '.json'); }
        if (weg) { try { fs.unlinkSync(p); n++; } catch (e) { /* egal */ } }
      }
    }
    return n;
  }
  const aufgeraeumt = aufraeumen();

  function ersteller(req) {
    // Quelle prüfen
    const h = req.headers || {};
    if (!req.socket || !LOOPBACK.has(req.socket.remoteAddress)) throw new Fehler(403, 'nur lokal');
    for (const k of FREMD_KOPF) if (h[k] !== undefined) throw new Fehler(403, 'nur lokal');
    const host = String(h.host || '').toLowerCase();
    if (!/^(localhost|127\.0\.0\.1|\[::1\])(:\d{1,5})?$/.test(host)) throw new Fehler(403, 'nur lokal');
    if (h.origin !== undefined) {
      let oh = '';
      try { const u = new URL(h.origin); oh = u.host.toLowerCase(); } catch (e) { throw new Fehler(403, 'Origin ungültig'); }
      if (oh !== host) throw new Fehler(403, 'Origin passt nicht');
    }
  }

  function body(req) {
    return new Promise((ok, nein) => {
      const ct = String(req.headers['content-type'] || '').toLowerCase();
      if (!ct.startsWith('application/json')) return nein(new Fehler(415, 'nur application/json'));
      const laenge = +req.headers['content-length'];
      if (Number.isFinite(laenge) && laenge > BODY_MAX) return nein(new Fehler(413, 'zu groß'));
      const teile = []; let n = 0, fertig = false;
      req.on('data', (c) => {
        if (fertig) return;
        n += c.length;
        if (n > BODY_MAX) { fertig = true; nein(new Fehler(413, 'zu groß')); req.destroy(); return; }
        teile.push(c);
      });
      req.on('end', () => { if (fertig) return; fertig = true; try { ok(JSON.parse(Buffer.concat(teile).toString('utf8'))); } catch (e) { nein(new Fehler(400, 'JSON ungültig')); } });
      req.on('error', () => { if (!fertig) { fertig = true; nein(new Fehler(400, 'Abbruch')); } });
    });
  }

  function senden(res, code, daten, typ) {
    const roh = Buffer.isBuffer(daten) ? daten : Buffer.from(typ ? String(daten) : JSON.stringify(daten));
    res.writeHead(code, { 'Content-Type': typ || 'application/json; charset=utf-8', 'Content-Length': roh.length, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    res.end(roh);
  }

  // ---------- Fahrten ----------
  function fahrtSpeichern(b) {
    const z = fahrtBereinigen(b), pos = posBereinigen(b.pos);
    let fit = null;
    if (b.fit !== undefined && b.fit !== null) {
      if (typeof b.fit !== 'string' || b.fit.length > FIT_MAX * 1.4 || !/^[A-Za-z0-9+/]*={0,2}$/.test(b.fit)) throw new Fehler(400, 'fit ungültig');
      fit = Buffer.from(b.fit, 'base64');
      if (fit.length > FIT_MAX) throw new Fehler(413, 'fit zu groß');
      if (fit.length < 14 || fit.toString('latin1', 8, 12) !== '.FIT') throw new Fehler(400, 'fit ungültig');
    }
    if (dateien(dirF, '.json').length >= FAHRTEN_MAX) throw new Fehler(507, 'zu viele Fahrten');
    fs.mkdirSync(dirF, { recursive: true });
    const d = new Date(z.startMs), p2 = (n) => String(n).padStart(2, '0');
    // mit clientId (Upload aus dem Browser-Speicher): ID ist aus Startzeit + clientId abgeleitet → derselbe Upload zweimal = dieselbe Fahrt, keine Doppelten
    const zufall = z.clientId ? crypto.createHash('sha1').update(z.clientId + '|' + z.startMs).digest('hex').slice(0, 6) : crypto.randomBytes(3).toString('hex');
    const id = 'f' + d.getUTCFullYear() + p2(d.getUTCMonth() + 1) + p2(d.getUTCDate()) + '-' + p2(d.getUTCHours()) + p2(d.getUTCMinutes()) + p2(d.getUTCSeconds()) + '-' + zufall;
    if (z.clientId && istDatei(pfad(dirF, id, '.json'))) return { id, doppelt: true };
    z.id = id; z.gespeichert = new Date().toISOString(); z.hatFit = !!fit; z.posN = pos.zeit.length;
    schreiben(pfad(dirF, id, '.pos.json'), JSON.stringify(pos));
    if (fit) schreiben(pfad(dirF, id, '.fit'), fit);
    schreiben(pfad(dirF, id, '.json'), JSON.stringify(z, null, 1));      // Zusammenfassung zuletzt: Liste zeigt nur vollständige Fahrten
    return { id, doppelt: false };
  }
  function fahrtenListe() {
    const r = [];
    for (const n of dateien(dirF, '.json').slice(0, LISTE_MAX)) { try { r.push(lesenJson(path.join(dirF, n))); } catch (e) { /* kaputte Datei überspringen */ } }
    return r;
  }

  // ---------- Strecken ----------
  function streckeSpeichern(b) {
    if (!b || typeof b !== 'object') throw new Fehler(400, 'Body fehlt');
    const name = text(b.name, 40), bau = bauPruefen(b.bau);
    if (!name) throw new Fehler(400, 'Name fehlt');
    if (!bau) throw new Fehler(400, 'bau fehlt');
    const schluessel = [bau.km, bau.anstiege, Math.round(bau.hm), bau.maxSteig, bau.art, bau.thema, bau.seed].join('_');
    const slug = name.toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30) || 'strecke';
    const id = 's-' + slug + '-' + crypto.createHash('sha1').update(schluessel).digest('hex').slice(0, 8);
    fs.mkdirSync(dirS, { recursive: true });
    const datei = pfad(dirS, id, '.json');
    // gleiche Parameter unter anderem Namen: alte Datei ersetzen (ein Eintrag je Strecke); erst zählen/prüfen, dann löschen (Limit voll → nichts verlieren)
    let vorhanden = 0; const alt = [];
    for (const n of dateien(dirS, '.json')) {
      try { const s = lesenJson(path.join(dirS, n)); if (s.schluessel === schluessel) { if (n !== id + '.json') alt.push(n); } else vorhanden++; } catch (e) { /* egal */ }
    }
    if (vorhanden >= STRECKEN_MAX) throw new Fehler(507, 'zu viele Strecken');
    schreiben(datei, JSON.stringify({ v: 1, id, name, bau, schluessel, km: zahl(b.km, 0, 1000, bau.km), hm: zahl(b.hm, 0, 100000, bau.hm), maxSteig: zahl(b.maxSteigErgebnis, 0, 100, bau.maxSteig), gespeichert: new Date().toISOString() }, null, 1));
    for (const n of alt) { try { fs.unlinkSync(path.join(dirS, n)); } catch (e) { /* egal */ } }
    return id;
  }
  function streckenListe() {
    const r = [];
    for (const n of dateien(dirS, '.json').slice(0, STRECKEN_MAX)) { try { r.push(lesenJson(path.join(dirS, n))); } catch (e) { /* egal */ } }
    return r.sort((a, b) => String(b.gespeichert).localeCompare(String(a.gespeichert)));
  }

  // ---------- R5: GPX-Strecken ----------
  const gpxIndexDatei = path.join(dirG, '_index.json');
  const kopf = (g) => ({ id: g.id, name: g.name, geschlossen: !!g.geschlossen, km: g.km, hm: g.hm, maxSteig: g.maxSteig, glaettung: g.glaettung || 1, punkte: Array.isArray(g.punkte) ? g.punkte.length : g.punkte, gespeichert: g.gespeichert });
  function gpxIndex() {
    try { if (istDatei(gpxIndexDatei)) { const j = lesenJson(gpxIndexDatei); if (j && Array.isArray(j.strecken)) return j.strecken; } } catch (e) { /* neu aufbauen */ }
    const r = [];      // fehlt/kaputt: einmal aus den Dateien aufbauen (liest dabei auch die Punkte, danach nie wieder)
    for (const n of dateien(dirG, '.json').slice(0, GPX_MAX)) { try { r.push(kopf(lesenJson(path.join(dirG, n)))); } catch (e) { /* egal */ } }
    gpxIndexSchreiben(r);
    return r;
  }
  function gpxIndexSchreiben(liste) { try { fs.mkdirSync(dirG, { recursive: true }); schreiben(gpxIndexDatei, JSON.stringify({ v: 1, strecken: liste })); } catch (e) { /* Liste wird beim nächsten Mal neu gebaut */ } }
  function gpxSpeichern(b) {
    if (b && b.nurName === true) {      // gespeicherte Strecke umbenennen (ohne Rohpunkte)
      if (typeof b.id !== 'string' || !/^gpx-[0-9a-f]{16}$/.test(b.id)) throw new Fehler(400, 'ungültige ID');
      const datei = pfad(dirG, b.id, '.json'); if (!istDatei(datei)) throw new Fehler(404, 'nicht gefunden');
      const g = lesenJson(datei), name = text(b.name, 40); if (!name) throw new Fehler(400, 'Name fehlt');
      g.name = name; schreiben(datei, JSON.stringify(g));
      gpxIndexSchreiben(gpxIndex().filter(x => x.id !== g.id).concat([kopf(g)]));
      return g;
    }
    const g = gpxBereinigen(b);
    fs.mkdirSync(dirG, { recursive: true });
    const datei = pfad(dirG, g.id, '.json');
    if (!istDatei(datei) && dateien(dirG, '.json').length >= GPX_MAX) throw new Fehler(507, 'zu viele GPX-Strecken');
    g.gespeichert = new Date().toISOString();
    schreiben(datei, JSON.stringify(g));
    gpxIndexSchreiben(gpxIndex().filter(x => x.id !== g.id).concat([kopf(g)]));
    return g;
  }
  function gpxListe() {
    return gpxIndex().filter(x => x && x.id && istDatei(path.join(dirG, x.id + '.json'))).sort((a, b) => String(b.gespeichert).localeCompare(String(a.gespeichert)));
  }

  /** → true, wenn die Anfrage zur Radwelt-API gehört (und beantwortet wird). */
  function behandeln(req, res) {
    let url;
    try { url = new URL(req.url, 'http://x'); } catch (e) { return false; }
    if (!url.pathname.startsWith('/api/rad/') && url.pathname !== '/api/rad') return false;
    (async () => {
      try {
        ersteller(req);
        const teile = url.pathname.replace(/^\/api\/rad\/?/, '').split('/').filter(Boolean).map(t => { try { return decodeURIComponent(t); } catch (e) { throw new Fehler(400, 'ungültiger Pfad'); } });
        const [a, id, sub] = teile, m = req.method;
        if (teile.length > 3 || teile.some(t => t.includes('/') || t.includes('\\') || t.includes('\0') || t === '..' || t === '.')) throw new Fehler(400, 'ungültiger Pfad');
        if (m === 'GET' && a === 'status' && !id) return senden(res, 200, { ok: true, api: 2, gpx: true, ordner: wurzel, fahrten: dateien(dirF, '.json').length, strecken: dateien(dirS, '.json').length, gpxStrecken: dateien(dirG, '.json').length });
        if (m === 'GET' && a === 'fahrten' && !id) return senden(res, 200, { fahrten: fahrtenListe() });
        if (m === 'GET' && a === 'strecken' && !id) return senden(res, 200, { strecken: streckenListe() });
        if (m === 'POST' && a === 'fahrt' && !id) return senden(res, 200, Object.assign({ ok: true }, fahrtSpeichern(await body(req))));
        if (m === 'POST' && a === 'strecke' && !id) return senden(res, 200, { ok: true, id: streckeSpeichern(await body(req)) });
        if (a === 'fahrt' && id) {
          const dat = pfad(dirF, id, sub === 'pos' ? '.pos.json' : sub === 'fit' ? '.fit' : '.json');
          if (sub && sub !== 'pos' && sub !== 'fit') throw new Fehler(404, 'unbekannt');
          if (m === 'GET') {
            let inh; try { if (!istDatei(dat)) throw new Error('keine Datei'); inh = fs.readFileSync(dat); } catch (e) { throw new Fehler(404, 'nicht gefunden'); }
            return senden(res, 200, inh, sub === 'fit' ? 'application/octet-stream' : 'application/json; charset=utf-8');
          }
          if (m === 'DELETE' && !sub) {
            if (!['.json', '.fit', '.pos.json'].some(e => fs.existsSync(pfad(dirF, id, e)))) throw new Fehler(404, 'nicht gefunden');      // auch Waisen (ohne .json) lassen sich löschen
            for (const e of ['.json', '.fit', '.pos.json']) { try { fs.unlinkSync(pfad(dirF, id, e)); } catch (x) { /* egal */ } }
            return senden(res, 200, { ok: true });
          }
        }
        if (m === 'GET' && a === 'gpxstrecken' && !id) return senden(res, 200, { strecken: gpxListe() });
        if (m === 'POST' && a === 'gpx' && !id) { const g = gpxSpeichern(await body(req)); return senden(res, 200, { ok: true, id: g.id, km: g.km, hm: g.hm, maxSteig: g.maxSteig, glaettung: g.glaettung }); }
        if (a === 'gpx' && id && !sub && (m === 'GET' || m === 'DELETE')) {
          if (!/^gpx-[0-9a-f]{16}$/.test(id)) throw new Fehler(400, 'ungültige ID');
          const dat = pfad(dirG, id, '.json');
          if (!istDatei(dat)) throw new Fehler(404, 'nicht gefunden');
          if (m === 'DELETE') { fs.unlinkSync(dat); gpxIndexSchreiben(gpxIndex().filter(x => x.id !== id)); return senden(res, 200, { ok: true }); }
          return senden(res, 200, fs.readFileSync(dat), 'application/json; charset=utf-8');
        }
        if (a === 'strecke' && id && !sub && m === 'DELETE') {
          const dat = pfad(dirS, id, '.json');
          if (!fs.existsSync(dat)) throw new Fehler(404, 'nicht gefunden');
          fs.unlinkSync(dat); return senden(res, 200, { ok: true });
        }
        throw new Fehler(a ? 405 : 404, 'unbekannte Route');
      } catch (e) {
        const code = e instanceof Fehler ? e.code : 500;
        if (!(e instanceof Fehler)) console.error('radApi:', e && e.message);
        try { senden(res, code, { ok: false, fehler: e instanceof Fehler ? e.message : 'Serverfehler' }); } catch (e2) { /* Verbindung weg */ }
      }
    })();
    return true;
  }

  return { behandeln, wurzel, aufgeraeumt };
}

module.exports = { erzeugen, fahrtBereinigen, posBereinigen, bauPruefen, gpxBereinigen };
