// v23 Online-Ruckeln: node tests/test_netz_jitter.js [Optionen]
//
// Messharness: ECHTER Server (Kindprozess, node server/server.js) ← Jitter-Proxy (TCP, zufällige Verzögerung je Datenpaket, FIFO wie TCP → Bursts nach
// Verzögerungen, gelegentlich 300-ms-Lücke) ← 2 „Browser“ im Node-Kontext (dieselben Dateien wie Autorennen.html: client.js NetzVerbindung inkl.
// Server-Uhr, vorhersage.js NetzVorhersage/NetzPuffer; Rahmenschleife wie main.js frame(): Akkumulator, 0/1/2 Physikschritte je Bild, Grafik-Interpolation
// vorher→jetzt mit alpha; Eingaben im Echtzeit-Takt wie online.js physikSchritt).
//
// Metrik „Ruckeln“ (je GEZEICHNETEM Bild und Auto: eigenes / anderer Mensch / Computer): Anzeige-Geschwindigkeit u = |Δpos| / Δt_Bild gegen die
// Median-Geschwindigkeit der Nachbarbilder (±6). Ruckel-Bild = |u/Median − 1| > 10 % (bei Median > 4 m/s). Dazu p99 der Abweichung und größter
// Positionssprung (m) = |u − Median| · Δt. Außerdem: Anteil Schritte mit leerem Interpolationspuffer („Puffer leer“), Vorhersage-Korrekturen, Server-Statistik.
//
// Optionen:  --wurzel <Ordner>   Spielordner (Standard: dieser; für „vorher“ eine Kopie des alten Stands)
//            --profil lan|mild|hart|tailscale   (Standard hart)   --sek 40   --strecke wiese|mega|…   --bild 60|120|75   --gast-bild <fps>
//            --alt               alle v23-Maßnahmen des Clients abschalten (= v22b-Verhalten)   --aus eins,uhrGlatt,pll,adaptiv,extra,glatt,abgleich   einzeln abschalten
//            --rausch <ms>  Rauschen der Bild-Zeitstempel (Standard 0 = ideal)   --muster gleichmaessig|unruhig   --ki 5   --kollisionen
//            --pause <start s>,<Dauer s>,ohne|pumpe  Gast-Fenster verdeckt (keine Bilder)   --scheibe <s>  Ergebnis in Zeitscheiben (Langlauf)   --eingabe-alt  Server mit der v22b-Eingabe-Warteschlange starten (Vergleich)
// Ohne Optionen: Testlauf mit Grenzwerten (exit 1 bei Verstoß).
'use strict';
const net = require('net');
const path = require('path');
const { spawn } = require('child_process');
const { monitorEventLoopDelay } = require('perf_hooks');

const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf('--' + n); return i >= 0 ? (argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : true) : d; };
const WURZEL = path.resolve(opt('wurzel', path.join(__dirname, '..')));
const WebSocket = require(path.join(WURZEL, 'server', 'node_modules', 'ws'));
const { kontextLaden } = require(path.join(WURZEL, 'server', 'simulation'));

const warte = (ms) => new Promise(r => setTimeout(r, ms));
const jetztMs = () => performance.now();

// ------------------------------------------------------------------ Zufall (deterministisch)
function zufall(seed) { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// ------------------------------------------------------------------ Jitter-Proxy
const PROFILE = {
  keins: { basis: 0, klein: 0, mittel: [0, 0], gross: [0, 0], pMittel: 0, pGross: 0, luecke: 0 },
  lan: { basis: 2, klein: 3, mittel: [3, 8], gross: [8, 15], pMittel: 0.05, pGross: 0.01, luecke: 0 },                  // Tailscale direkt im Heimnetz
  mild: { basis: 15, klein: 15, mittel: [15, 40], gross: [40, 70], pMittel: 0.2, pGross: 0.03, luecke: 0 },
  tailscale: { basis: 20, klein: 25, mittel: [25, 70], gross: [70, 120], pMittel: 0.2, pGross: 0.04, luecke: 0 },       // Proxy + Relais: 20–120 ms
  hart: { basis: 20, klein: 25, mittel: [25, 80], gross: [80, 130], pMittel: 0.25, pGross: 0.05, luecke: 300 },         // 20–150 ms, Bursts, alle ~8–14 s eine 300-ms-Lücke
};
class JitterProxy {
  constructor(zielPort, profil, seed) {
    this.zielPort = zielPort; this.p = PROFILE[profil] || PROFILE.hart; this.rng = zufall(seed || 1);
    this.stallStart = 0; this.stallEnde = 0; this.naechsterStall = jetztMs() + 6000 + this.rng() * 6000;
    this.srv = net.createServer((c) => this.verbindung(c));
  }
  freigabe(jetzt) {              // absoluter Zeitpunkt, zu dem ein Paket, das jetzt ankommt, weitergegeben wird
    const p = this.p, r = this.rng;
    if (p.luecke && jetzt >= this.naechsterStall) { this.stallStart = jetzt; this.stallEnde = jetzt + p.luecke; this.naechsterStall = this.stallEnde + 8000 + r() * 6000; }
    let d = p.basis + r() * p.klein;
    const q = r();
    if (q < p.pGross) d = p.basis + p.gross[0] + r() * (p.gross[1] - p.gross[0]);
    else if (q < p.pGross + p.pMittel) d = p.basis + p.mittel[0] + r() * (p.mittel[1] - p.mittel[0]);
    let t = jetzt + d;
    if (jetzt >= this.stallStart && jetzt < this.stallEnde) t = Math.max(t, this.stallEnde + r() * 5);
    return t;
  }
  verbindung(c) {
    const s = net.connect(this.zielPort, '127.0.0.1');
    c.setNoDelay(true); s.setNoDelay(true);
    const leitung = (von, nach) => {
      let letzte = 0;
      von.on('data', (buf) => {
        const jetzt = jetztMs();
        const t = Math.max(letzte, this.freigabe(jetzt));          // FIFO (TCP): ein später Block hält alle folgenden zurück → Burst
        letzte = t;
        if (t - jetzt < 0.5 && !this.p.basis) { if (!nach.destroyed) nach.write(buf); return; }
        setTimeout(() => { if (!nach.destroyed) nach.write(buf); }, Math.max(0, t - jetzt));
      });
    };
    leitung(c, s); leitung(s, c);
    const zu = () => { c.destroy(); s.destroy(); };
    c.on('close', zu); s.on('close', zu); c.on('error', zu); s.on('error', zu);
  }
  starten() { return new Promise(ok => this.srv.listen(0, '127.0.0.1', () => ok(this.srv.address().port))); }
  schliessen() { this.srv.close(); }
}

// ------------------------------------------------------------------ Server als Kindprozess
function serverStarten(port, eingabeAlt) {
  return new Promise((ok, nein) => {
    const k = spawn(process.execPath, [path.join(WURZEL, 'server', 'server.js'), '--port', String(port), '--host', '127.0.0.1', '--statistik', '5'].concat(eingabeAlt ? ['--eingabe-alt'] : []), { stdio: ['ignore', 'pipe', 'pipe'] });
    const stat = [];
    let puffer = '', bereit = false;
    k.stdout.on('data', (d) => {
      puffer += d;
      let i;
      while ((i = puffer.indexOf('\n')) >= 0) {
        const z = puffer.slice(0, i); puffer = puffer.slice(i + 1);
        if (z.startsWith('STAT ')) { try { stat.push(JSON.parse(z.slice(5))); } catch (e) { /* egal */ } }
        if (z.includes('Mehrspieler-Server läuft') && !bereit) { bereit = true; ok({ k, stat }); }
      }
    });
    k.stderr.on('data', (d) => process.stderr.write('[server] ' + d));
    k.on('error', nein);
    setTimeout(() => { if (!bereit) nein(new Error('Server startet nicht')); }, 15000);
  });
}

// ------------------------------------------------------------------ Client („Browser“ im Node-Kontext)
const DATEIEN = ['vendor/three.min.js', 'src/config.js', 'src/physics/vehicle.js', 'src/physics/collisions.js', 'src/cars/carCatalog.js',
  'src/track/spline.js', 'src/track/trackCatalog.js', 'src/track/trackBuilder.js', 'src/track/looping.js', 'src/track/schanze.js', 'src/track/anlauf.js',
  'src/world/themes.js', 'src/world/schilder.js', 'src/world/wetter.js', 'src/world/kleber.js', 'src/world/polizei.js', 'src/net/protokoll.js',
  'src/net/client.js', 'src/net/vorhersage.js'];

function kontext() { return kontextLaden(DATEIEN.concat(opt('strecke', 'wiese') === 'mega' ? ['src/track/megastrecke.js'] : []), { WebSocket, setInterval, clearInterval }); }

function clientStrecke(C, e) {
  const daten = C.trackCatalog.find(t => t.id === e.streckeId);
  const st = new C.Strecke(daten, { welt: C.Strecke.weltName(daten, e.welt), variante: e.variante, hindernisMenge: e.hindernisMenge });
  const w = new C.Wetter(null, { jahreszeit: e.jahreszeit, wetter: e.wetter, wind: { staerke: e.windStaerke, richtung: e.windRichtung }, thema: daten.thema, seed: e.wetterSeed >>> 0 || 1, strecke: st, tageszeit: e.tageszeit });
  C.Kurvenschilder.einbauen(st, e.tempoKlasse);
  C.Kollisionen.pflanzenSammeln(st, C.themes.dekoBauen(daten.thema, st, w.jahreszeit));
  C.Kollisionen.wracksEinbauen(st);
  return { st, w };
}
function autopilot(C, st, v, idx) {
  const n = st.abfrage(v.x, v.z, idx), sp = st.spline;
  const vl = Math.max(3, v.vLaengs), L = Math.max(9, Math.min(50, 0.55 * vl + 8));
  const ziel = sp.punktBei(n.s + L);
  let diff = C.headingAus(ziel.x - v.x, ziel.z - v.z) - v.heading;
  while (diff > Math.PI) diff -= 2 * Math.PI;
  while (diff < -Math.PI) diff += 2 * Math.PI;
  const lenkung = Math.max(-1, Math.min(1, -(2 * vl * Math.sin(diff) / Math.hypot(ziel.x - v.x, ziel.z - v.z)) / v.drehrateMax(vl)));
  const soll = st.tempoBei(n.s + vl * 0.3) * 0.9;
  return { s: { gas: v.vLaengs < soll ? 1 : 0, bremse: v.vLaengs > soll + 3 ? 0.5 : 0, lenkung }, idx: n.index };
}

class Klient {
  /** o: { name, wurzelPort, host, bildMs, bildRauschen, altAnzeige, seed } */
  constructor(o) {
    Object.assign(this, o);
    this.C = kontext();
    if (this.C.NetzOptionen) for (const k of (o.aus || [])) this.C.NetzOptionen[k] = false;      // einzelne v23-Maßnahmen abschalten (Vorher/Nachher je Ursache)
    this.verb = new this.C.NetzVerbindung();
    this.rng = zufall(o.seed || 7);
    this.phase = 'lobby';
    this.reihen = null;              // Messreihen je Auto
    this.leerSchritte = 0; this.schritteGesamt = 0; this.eingabenGesendet = 0;
    this.frames = 0; this.schrittProFrame = [0, 0, 0, 0];
  }
  async verbinden(port) {
    await this.verb.verbinden('ws://127.0.0.1:' + port + '/ws');
    this.verb.bei('lobby', (m) => { this.lobby = m; });
    this.verb.bei('raum', (m) => { this.code = m.code; });
    this.verb.bei('start', (m) => this.startEmpfangen(m));
    this.verb.bei('zustand', (z) => this.zustandEmpfangen(z));
    this.verb.bei('ereignis', (m) => { if (m.art === 'start') this._start(m.k); });
    this.verb.bei('fehler', (m) => console.error('Fehler vom Server:', m.grund, m.text));
  }
  startEmpfangen(m) {
    const C = this.C, e = m.einstellungen;
    this.du = m.du; this.teilnehmer = m.teilnehmer; this.nT = m.teilnehmer.length;
    const { st, w } = clientStrecke(C, Object.assign({}, e, { wetterSeed: m.wetterSeed }));
    this.st = st;
    const katalog = C.carCatalog.waehlbare();
    const auto = katalog.find(a => a.id === m.teilnehmer[m.du].autoId) || katalog[0];
    const kollisionen = e.kollisionen === true;
    const andere = kollisionen ? m.teilnehmer.map((t, i) => (i === m.du ? null : { nr: i, auto: katalog.find(a => a.id === t.autoId) || katalog[0] })).filter(Boolean) : [];
    this.V = new C.NetzVorhersage({ strecke: st, auto, tempoKlasse: e.tempoKlasse, fahrhilfe: m.teilnehmer[m.du].hilfe, umwelt: () => w.umwelt(), kollisionen, andere, rempeln: 'sanft' });
    this.kollisionen = kollisionen;
    const plaetze = st.startpositionen(m.teilnehmer.length), p0 = plaetze[m.du];
    this.V.vp.setzen(p0.x, p0.z, p0.heading); this.V.vp.y = st.hoeheAn(p0.x, p0.z);
    this.puffer = new C.NetzPuffer();
    this.verb.uhrNeu();
    this.anz = C.NetzAnzeige ? new C.NetzAnzeige(this.verb, this.puffer) : null;        // v23-Code vorhanden? sonst alte Logik nachbilden (--wurzel auf den alten Stand)
    this.takt = C.NetzEingabeTakt ? new C.NetzEingabeTakt() : null;
    this.n = 0; this.t0 = null; this.empfangen = false; this._gestartet = false; this.startTick = null;
    this.rz = 'countdown'; this.imZiel = false; this.idx = -1;
    this.fz = m.teilnehmer.map((t, i) => {
      const pl = plaetze[i] || p0;
      const o = { x: pl.x, y: 0, z: pl.z, heading: pl.heading, vLaengs: 0, lenkung: 0, nicken: 0, neigung: 0 };
      return { vehicle: o, vorher: Object.assign({}, o), mensch: !!t.mensch };
    });
    this.reihen = this.fz.map(() => ({ t: [], x: [], z: [] }));
    this.rest = 0; this.letzteFrame = null; this._letzteS = null;
    this.phase = 'rennen';
    this.verb.senden({ t: 'geladen', k: 0 });
  }
  _start(k) { if (this._gestartet) return; this._gestartet = true; this.startTick = k; this.rennenStart = jetztMs(); }
  zustandEmpfangen(z) {
    if (this.phase !== 'rennen') return;
    this.empfangen = true;
    this.puffer.rein(z);
    this.rz = z.rz;
    if (z.rz !== 'countdown') this._start(z.k);
    const a = z.a[this.du];
    if (a) this.imZiel = !!(a[6] & 16);
    if (z.ich) {
      const v = this.fz[this.du].vehicle;
      this.V.abgleich(z.ich, { x: v.x, z: v.z, y: v.y, heading: v.heading }, this.kollisionen ? z.a : undefined, z.k);
      if (this.V.hart) { this.V.anzeigen(v); this.angleichen(this.fz[this.du]); this.V.hart = false; }
    }
  }
  angleichen(f) { const v = f.vehicle, a = f.vorher; a.x = v.x; a.y = v.y; a.z = v.z; a.heading = v.heading; a.nicken = v.nicken; a.neigung = v.neigung; }

  /** Spiegel von online.js _hintergrundTakt: rAF steht (verdecktes Fenster) → neutrale Eingaben im 60-Hz-Takt weitersenden. */
  hintergrundTakt() {
    if (this.phase !== 'rennen' || !this.empfangen || !this.takt) return;
    const C = this.C, N = C.Netz, S = C.config.physik.schritt;
    const anzahl = this.takt.anzahl(performance.now() / 1000, S, this.n);
    for (let k = 0; k < anzahl; k++) {
      const sd = N.eingabeDekodieren(N.eingabeKodieren({ gas: 0, bremse: 0, lenkung: 0 }));
      this._letzteS = sd; this.n++;
      this.verb.senden({ t: 'eingabe', n: this.n, g: 0, b: 0, l: 0 });
      this.V.schritt(this.n, sd, { countdown: this.rz === 'countdown', imZiel: this.imZiel });
    }
  }

  // ----- main.js frame(): Akkumulator, Physikschritte, Grafik-Interpolation
  frame(jetzt) {
    if (this.phase !== 'rennen') return;
    const p = this.C.config.physik, S = p.schritt;
    if (this.letzteFrame === null) { this.letzteFrame = jetzt; return; }
    let dt = (jetzt - this.letzteFrame) / 1000;
    const dtMs = jetzt - this.letzteFrame;
    this.letzteFrame = jetzt;
    if (dt > 0.25) dt = 0.25;
    this.rest += dt;
    const langer = dt * 1000 > (p.frameVerwerfenMs || 80);
    let schritte = 0;
    while (this.rest >= S && schritte < p.maxSchritteProFrame) { this.physikSchritt(S); this.rest -= S; schritte++; }
    if ((schritte === p.maxSchritteProFrame || langer) && this.rest >= S) this.rest = this.rest % S;
    this.frames++; this.schrittProFrame[Math.min(3, schritte)]++;
    const alpha = Math.min(1, this.rest / S);
    // gezeichnete Position = vorher + (jetzt − vorher) · alpha
    if (this.startTick !== null && this.rennenStart && jetzt - this.rennenStart > 1000) {
      for (let i = 0; i < this.fz.length; i++) {
        const f = this.fz[i], v = f.vehicle, a = f.vorher, r = this.reihen[i];
        r.t.push(jetzt); r.x.push(a.x + (v.x - a.x) * alpha); r.z.push(a.z + (v.z - a.z) * alpha);
      }
    }
  }

  physikSchritt(S) {
    const C = this.C, N = C.Netz, fz = this.fz, V = this.V;
    for (const f of fz) this.angleichen(f);
    const mein = fz[this.du];
    let sd = this._letzteS || { gas: 0, bremse: 0, lenkung: 0 };
    if (this.empfangen) {
      const jetzt = performance.now() / 1000;
      let anzahl;
      if (this.takt) anzahl = this.takt.anzahl(jetzt, S, this.n);
      else {                                              // v22b online.js
        if (this.t0 === null) this.t0 = jetzt - S;
        let soll = Math.floor((jetzt - this.t0) / S);
        if (soll - this.n > 120) { this.t0 = jetzt - (this.n + 1) * S; soll = this.n + 1; }
        anzahl = Math.max(0, Math.min(40, soll - this.n));
      }
      for (let k = 0; k < anzahl; k++) {
        const a = autopilot(C, this.st, V.vp, this.idx); this.idx = a.idx;
        const kod = N.eingabeKodieren(a.s);
        sd = N.eingabeDekodieren(kod);
        this._letzteS = sd;
        this.n++;
        this.verb.senden({ t: 'eingabe', n: this.n, g: kod.g, b: kod.b, l: kod.l });
        this.eingabenGesendet++;
        V.schritt(this.n, sd, { countdown: this.rz === 'countdown', imZiel: this.imZiel });
      }
    }
    const tick = this.verb.serverTick();
    const DT = S;
    // --- eigener Wagen
    if (!V.sonder) { V.abklingen(S); V.anzeigen(mein.vehicle); }
    else if (tick !== null) {
      const ziel = this._tmp || (this._tmp = { x: 0, z: 0, y: 0, heading: 0, vLaengs: 0, lenkung: 0, nicken: 0, neigung: 0 });
      const um = this.puffer.um(tick - 0.05 / DT);
      if (um) {
        C.NetzPuffer.interpolieren(um.a.a[this.du], um.b.a[this.du], um.t, ziel);
        if (!this.warSonder) { this.warSonder = true; V.uebergang(mein.vehicle, ziel); }
        V.abklingen(S);
        const v = mein.vehicle, c = V.korr;
        v.x = ziel.x + c.x; v.z = ziel.z + c.z; v.y = ziel.y + c.y; v.heading = ziel.heading + c.h;
        if (V.hart) { this.angleichen(mein); V.hart = false; }
      }
    }
    if (V.sonder === false) this.warSonder = false;
    // --- andere Autos
    this.schritteGesamt++;
    if (tick !== null) this.andereAnzeigen(tick, S);
  }
  andereAnzeigen(tick, S) {
    if (!this.anz) return this.andereAnzeigenAlt(tick, S);
    const t = this.anz.schritt(Math.max(0, this.rest - S));            // wie online.js: Akkumulator-Rest NACH diesem Schritt
    if (t === null) return;
    const neu = this.puffer.neuester;
    if (neu && t > neu.k) this.leerSchritte++;
    if (!this.anz.um()) return;
    for (let i = 0; i < this.nT; i++) if (i !== this.du) this.anz.pose(i, this.fz[i].vehicle);
  }

  /** ALT (v22b, online.js): Pose der anderen Autos zur Wanduhr-Zeit des Aufrufs, feste 100 ms hinter dem Server, kein Extrapolieren. */
  andereAnzeigenAlt(tick, S) {
    const C = this.C, N = C.Netz;
    const um = this.puffer.um(tick - N.INTERP_VERZUG / S);
    const neu = this.puffer.neuester;
    if (neu && tick - N.INTERP_VERZUG / S > neu.k) this.leerSchritte++;
    if (!um) return;
    for (let i = 0; i < this.nT; i++) {
      if (i === this.du) continue;
      const a0 = um.a.a[i], a1 = um.b.a[i], f = this.fz[i];
      if (!a0 || !a1) continue;
      C.NetzPuffer.interpolieren(a0, a1, um.t, f.vehicle);
    }
  }
}

// ------------------------------------------------------------------ Auswertung
function median(a) { const s = a.slice().sort((x, y) => x - y); return s[s.length >> 1]; }
function quantil(a, q) { if (!a.length) return 0; const s = a.slice().sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(s.length * q))]; }
/** Ruckel-Kennzahlen einer Messreihe {t,x,z}: Anteil Ruckel-Bilder, p99 |rel|, größter Sprung (m). skip = erste Sekunden auslassen. */
function ruckeln(r, skipMs) {
  const n = r.t.length, u = [], dts = [];
  for (let i = 1; i < n; i++) {
    const dt = (r.t[i] - r.t[i - 1]) / 1000, d = Math.hypot(r.x[i] - r.x[i - 1], r.z[i] - r.z[i - 1]);
    u.push(dt > 0 ? d / dt : 0); dts.push(dt);
  }
  const t0 = r.t[0] + skipMs;
  let ruck = 0, zaehl = 0, rueck = 0;
  const rel = [], sprung = [];
  for (let i = 6; i < u.length - 6; i++) {
    if (r.t[i] < t0) continue;
    const m = median(u.slice(i - 6, i + 7));
    if (m < 4) continue;
    if (Math.hypot(r.x[i + 1] - r.x[i], r.z[i + 1] - r.z[i]) > 20) continue;       // Reset/Teleport
    zaehl++;
    const re = Math.abs(u[i] / m - 1);
    rel.push(re); sprung.push(Math.abs(u[i] - m) * dts[i]);
    if (re > 0.10) ruck++;
  }
  return { bilder: zaehl, anteil: zaehl ? ruck / zaehl : 0, p99: quantil(rel, 0.99), sprungMax: sprung.length ? Math.max(...sprung) : 0, sprungP99: quantil(sprung, 0.99) };
}
function zusammen(liste) {      // mehrere Kennzahl-Sätze mitteln (Bilder-gewichtet)
  const b = liste.reduce((s, x) => s + x.bilder, 0) || 1;
  return { bilder: b, anteil: liste.reduce((s, x) => s + x.anteil * x.bilder, 0) / b, p99: Math.max(0, ...liste.map(x => x.p99)), sprungMax: Math.max(0, ...liste.map(x => x.sprungMax)), sprungP99: Math.max(0, ...liste.map(x => x.sprungP99)) };
}

// ------------------------------------------------------------------ Lauf
/** Ein Messlauf: Server + Proxy + 2 Klienten. cfg: { profil, sek, strecke, bild, gastBild, ki, kollisionen, altAnzeige, seed } */
async function lauf(cfg) {
  const sport = 20000 + Math.floor(Math.random() * 20000);
  const srv = await serverStarten(sport, cfg.eingabeAlt);
  const proxy = new JitterProxy(sport, cfg.profil, cfg.seed || 3);
  const pport = await proxy.starten();
  const lag = monitorEventLoopDelay({ resolution: 1 }); lag.enable();
  const mk = (name, bildMs, seed) => new Klient({ name, bildMs, seed, aus: cfg.aus });
  const host = mk('host', cfg.bild, 11), gast = mk('gast', cfg.gastBild || cfg.bild, 12);
  await host.verbinden(pport); await gast.verbinden(pport);
  host.verb.senden({ t: 'raumErstellen', fahrer: host.C.config.fahrer[0].name, auto: 'porsche-911', hilfe: 'wenig',
    einstellungen: { streckeId: cfg.strecke, welt: cfg.welt || '', variante: cfg.variante || '', runden: 9, gegner: cfg.ki, tageszeit: 'tag', jahreszeit: 'sommer', wetter: 'klar', windStaerke: 'aus', kollisionen: !!cfg.kollisionen, schwierigkeit: 'mittel' } });
  for (let i = 0; i < 100 && !host.code; i++) await warte(50);
  if (!host.code) throw new Error('kein Raumcode');
  gast.verb.senden({ t: 'raumBeitreten', code: host.code, fahrer: gast.C.config.fahrer[1].name, auto: 'passat', hilfe: 'wenig' });
  await warte(300);
  gast.verb.senden({ t: 'bereit', an: true });
  await warte(300);
  host.verb.senden({ t: 'start' });
  for (let i = 0; i < 200 && !(host.phase === 'rennen' && gast.phase === 'rennen'); i++) await warte(50);
  // Rahmenschleifen wie requestAnimationFrame: das Bild bekommt den (idealen) Vsync-Zeitstempel k·Takt (+ optionales Rauschen), der Aufruf selbst
  // kommt mit der üblichen Verspätung des Timers (performance.now() ist dann etwas später – wie im Browser). Verpasste Bilder entfallen.
  // Muster: bildMuster 'gleichmaessig' | 'unruhig' (GPU/CPU ausgelastet: ab und zu ein doppelt langes Bild, gelegentlich 50 ms)
  let aktiv = true;
  const schleife = (k) => {
    const rng = zufall(k.seed * 31);
    const start = jetztMs() + 5;
    let kk = 0, ideal = start;
    const lauf1 = () => {
      if (!aktiv) return;
      const jetzt = jetztMs();
      const pz = cfg.pause && k === gast && k.rennenStart ? jetzt - k.rennenStart - cfg.pause.start * 1000 : -1;      // Verdecktes Fenster: Bilder stehen still
      if (pz >= 0 && pz < cfg.pause.dauer * 1000) { if (cfg.pause.modus === 'pumpe') k.hintergrundTakt(); if (!k.pauseStart) k.pauseStart = jetzt; }
      else if (k.pauseStart && !k.pauseEnde) { k.pauseEnde = jetzt; k.hartBeiEnde = k.V.stat.hart; }
      if (!(pz >= 0 && pz < cfg.pause.dauer * 1000) || !cfg.pause) k.frame(ideal + (cfg.bildRauschen ? (rng() - 0.5) * cfg.bildRauschen : 0));
      let iv = k.bildMs;
      if (cfg.bildMuster === 'unruhig') { const q = rng(); if (q < 0.08) iv *= 2; else if (q < 0.085) iv *= 3; }
      ideal += iv;
      let warteMs = ideal - jetztMs() - 0.3;
      if (warteMs < -iv) { ideal = jetztMs() + 1; warteMs = 0; }                 // zu spät: Bilder entfallen
      setTimeout(lauf1, Math.max(0, warteMs));
    };
    setTimeout(lauf1, 5);
  };
  schleife(host); schleife(gast);
  // Speicher des Servers (RSS) und des Harness (Heap) alle 10 s – Langlauf-Prüfung (d)
  const speicher = [];
  const rss = () => { try { return +/VmRSS:\s+(\d+)/.exec(require('fs').readFileSync('/proc/' + srv.k.pid + '/status', 'utf8'))[1] / 1024; } catch (e) { return 0; } };
  const tStart = jetztMs();
  while (jetztMs() - tStart < cfg.sek * 1000) {
    await warte(Math.min(10000, cfg.sek * 1000 - (jetztMs() - tStart)) + 1);
    speicher.push({ t: (jetztMs() - tStart) / 1000, server: rss(), heap: process.memoryUsage().heapUsed / 1048576 });
  }
  aktiv = false;
  lag.disable();
  await warte(100);
  srv.k.kill('SIGTERM'); proxy.schliessen();
  host.verb.schliessen(); gast.verb.schliessen();
  // Auswertung
  const skip = 6000;                                       // Start (Beschleunigung, Countdown-Ende) auslassen
  const kat = { eigen: [], mensch: [], ki: [] };
  for (const k of [host, gast]) {
    k.reihen.forEach((r, i) => {
      if (r.t.length < 100) return;
      const m = ruckeln(r, skip);
      if (i === k.du) kat.eigen.push(m); else if (k.fz[i].mensch) kat.mensch.push(m); else kat.ki.push(m);
    });
  }
  const res = { eigen: zusammen(kat.eigen), mensch: zusammen(kat.mensch), ki: zusammen(kat.ki) };
  const vs = (k) => ({ abgleiche: k.V.stat.abgleiche, hart: k.V.stat.hart, weich: k.V.stat.weich, maxFehler: k.V.stat.maxFehler, mittel: k.V.stat.summeFehler / Math.max(1, k.V.stat.abgleiche) });
  res.pufferLeer = [host, gast].map(k => k.leerSchritte / Math.max(1, k.schritteGesamt));
  res.vorhersage = [host, gast].map(vs);
  res.ping = [host.verb.ping, gast.verb.ping];
  res.schritteProBild = [host, gast].map(k => k.schrittProFrame.map(x => +(x / Math.max(1, k.frames)).toFixed(3)));
  res.eingaben = [host.eingabenGesendet, gast.eingabenGesendet];
  res.harnessLag = { p99: lag.percentile(99) / 1e6, max: lag.max / 1e6 };
  const st = srv.stat.filter(s => s.spieler && s.spieler.length);
  const agg = (f) => (st.length ? f(st) : null);
  res.server = agg((l) => ({
    zeilen: l.length,
    tickP99: Math.max(...l.map(s => s.tick.p99)), tickMax: Math.max(...l.map(s => s.tick.max)),
    abstandP50: l[l.length >> 1].zustandAbstand.p50, abstandP99: Math.max(...l.map(s => s.zustandAbstand.p99)), abstandMax: Math.max(...l.map(s => s.zustandAbstand.max)),
    lagP99: Math.max(...l.map(s => s.schleifenLag.p99)), lagMax: Math.max(...l.map(s => s.schleifenLag.max)),
    leer: [0, 1].map(i => l.reduce((a, s) => a + ((s.spieler[i] || {}).leer || 0), 0)), verworfen: [0, 1].map(i => l.reduce((a, s) => a + ((s.spieler[i] || {}).verworfen || 0), 0)),
    qMax: [0, 1].map(i => Math.max(...l.map(s => (s.spieler[i] || { q: { max: 0 } }).q.max))),
  }));
  res.dauer = cfg.sek;
  res.speicher = speicher;
  if (cfg.pause && gast.pauseEnde) {
    const r = gast.reihen[gast.du], nach = { t: [], x: [], z: [] };
    for (let i = 0; i < r.t.length; i++) if (r.t[i] > gast.pauseEnde + 200 && r.t[i] < gast.pauseEnde + 6000) { nach.t.push(r.t[i]); nach.x.push(r.x[i]); nach.z.push(r.z[i]); }
    const m = nach.t.length > 50 ? ruckeln(nach, 0) : null;
    const letzte = r.t.length - 1, vor = r.t.findIndex(t => t > r.t[letzte] - 5000);
    res.pause = { nach: m, ende5s: Math.hypot(r.x[letzte] - r.x[vor], r.z[letzte] - r.z[vor]), hartGast: gast.V.stat.hart - (gast.hartBeiEnde || 0), abgleicheGast: gast.V.stat.abgleiche, maxFehlerGast: gast.V.stat.maxFehler };
  }
  if (cfg.scheibe) {                                        // Zeitscheiben: wird es mit der Zeit schlechter?
    res.scheiben = [];
    const t0 = Math.min(...[host, gast].map(k => k.reihen[0].t[0])) + skip;
    for (let a = t0; a < t0 + (cfg.sek * 1000 - skip) - cfg.scheibe / 2; a += cfg.scheibe) {
      const katS = { eigen: [], mensch: [], ki: [] };
      for (const k of [host, gast]) k.reihen.forEach((r, i) => {
        const idx = r.t.map((t, j) => (t >= a && t < a + cfg.scheibe ? j : -1)).filter(j => j >= 0);
        if (idx.length < 100) return;
        const teil = { t: idx.map(j => r.t[j]), x: idx.map(j => r.x[j]), z: idx.map(j => r.z[j]) };
        const m = ruckeln(teil, 0);
        if (i === k.du) katS.eigen.push(m); else if (k.fz[i].mensch) katS.mensch.push(m); else katS.ki.push(m);
      });
      res.scheiben.push({ ab: Math.round((a - t0 + skip) / 1000), eigen: zusammen(katS.eigen), mensch: zusammen(katS.mensch), ki: zusammen(katS.ki) });
    }
  }
  return res;
}

function drucken(titel, r) {
  const f = (x) => (x * 100).toFixed(1).padStart(5) + ' %';
  const z = (m) => `${f(m.anteil)} Ruckel-Bilder, p99 ${(m.p99 * 100).toFixed(0).padStart(3)} %, Sprung p99 ${m.sprungP99.toFixed(2)} m / max ${m.sprungMax.toFixed(2)} m`;
  console.log('== ' + titel);
  console.log('   eigenes Auto : ' + z(r.eigen));
  console.log('   anderer Mensch: ' + z(r.mensch));
  console.log('   Computer (KI)  : ' + z(r.ki));
  console.log(`   Puffer leer: ${r.pufferLeer.map(x => (x * 100).toFixed(1) + ' %').join(' / ')} | Ping ${r.ping.map(x => Math.round(x)).join('/')} ms | Schritte/Bild (0,1,2,3+) ${JSON.stringify(r.schritteProBild[0])} | Harness-Lag p99 ${r.harnessLag.p99.toFixed(1)} max ${r.harnessLag.max.toFixed(0)} ms`);
  console.log(`   Vorhersage: ` + r.vorhersage.map(v => `Abgleiche ${v.abgleiche}, hart ${v.hart}, weich ${v.weich}, Fehler Ø ${(v.mittel * 100).toFixed(1)} cm / max ${v.maxFehler.toFixed(2)} m`).join(' | '));
  if (r.pause) console.log(`   Pause des Gast-Fensters: danach (6 s) ${r.pause.nach ? f(r.pause.nach.anteil) + ' Ruckel-Bilder, Sprung max ' + r.pause.nach.sprungMax.toFixed(2) + ' m' : 'zu wenig Bilder'} | letzte 5 s gefahren ${r.pause.ende5s.toFixed(0)} m | harte Korrekturen NACH der Pause ${r.pause.hartGast} (während der Pause zählen sie mit: die Anzeige steht)`);
  if (r.scheiben) {
    console.log('   Zeitscheiben (Ruckel-Bilder eigen / Mensch / KI):');
    for (const sc of r.scheiben) console.log(`     ab ${String(sc.ab).padStart(4)} s: ${f(sc.eigen.anteil)} / ${f(sc.mensch.anteil)} / ${f(sc.ki.anteil)}`);
  }
  if (r.speicher && r.speicher.length > 2) console.log('   Speicher Server-RSS MB: ' + r.speicher.filter((_, i) => i % Math.ceil(r.speicher.length / 8) === 0).map(x => x.server.toFixed(0)).join(' → ') + ' | Harness-Heap MB: ' + r.speicher.filter((_, i) => i % Math.ceil(r.speicher.length / 8) === 0).map(x => x.heap.toFixed(0)).join(' → '));
  if (r.server) console.log(`   Server: Tick p99 ${r.server.tickP99} / max ${r.server.tickMax} ms | Zustand-Abstand p50 ${r.server.abstandP50} p99 ${r.server.abstandP99} max ${r.server.abstandMax} ms | Schleifen-Lag p99 ${r.server.lagP99} max ${r.server.lagMax} ms | Eingabe-Warteschlange leer ${r.server.leer.join('/')} Ticks, verworfen ${r.server.verworfen.join('/')}, Q max ${r.server.qMax.join('/')}`);
}

module.exports = { lauf, drucken, JitterProxy, PROFILE, ruckeln };

/** Testlauf mit Grenzwerten (ohne Optionen). Die Grenzen liegen bewusst mit Luft über den Messwerten von v23 (VERLAUF.md) und weit unter v22b. */
async function testlauf() {
  let ok = 0, fehler = 0;
  const pruefe = (name, gut, info) => { console.log((gut ? 'OK   ' : 'FEHL ') + name + (info !== undefined ? '  (' + info + ')' : '')); if (gut) ok++; else fehler++; };
  const pct = (x) => (x * 100).toFixed(1) + ' %';
  const alleAus = ['eins', 'uhrGlatt', 'pll', 'adaptiv', 'extra', 'glatt', 'abgleich'];
  const sek = +opt('sek', 25);
  const L = async (titel, cfg) => { const r = await lauf(Object.assign({ profil: 'tailscale', sek, strecke: 'wiese', ki: 5, bild: 1000 / 60, aus: [] }, cfg)); drucken(titel, r); return r; };

  let r = await L('A kein Netz-Zittern (Rahmenschleife allein)', { profil: 'keins' });
  pruefe('A eigenes Auto ruckelt nicht (Rahmenschleife: je Physikschritt genau ein Eingabe-Schritt)', r.eigen.anteil <= 0.01, pct(r.eigen.anteil));
  pruefe('A andere Menschen und Computer ruckeln nicht', r.mensch.anteil <= 0.01 && r.ki.anteil <= 0.01, pct(r.mensch.anteil) + ' / ' + pct(r.ki.anteil));

  r = await L('B Tailscale-Zittern 20–120 ms', { profil: 'tailscale' });
  pruefe('B eigenes Auto: ≤ 3 % Ruckel-Bilder, Sprung p99 ≤ 0,15 m', r.eigen.anteil <= 0.03 && r.eigen.sprungP99 <= 0.15, pct(r.eigen.anteil) + ', ' + r.eigen.sprungP99.toFixed(2) + ' m');
  pruefe('B andere Menschen / Computer: ≤ 2 % Ruckel-Bilder, Sprung max ≤ 0,5 m', r.mensch.anteil <= 0.02 && r.ki.anteil <= 0.02 && r.mensch.sprungMax <= 0.5 && r.ki.sprungMax <= 0.5,
    pct(r.mensch.anteil) + ' / ' + pct(r.ki.anteil) + ', ' + r.ki.sprungMax.toFixed(2) + ' m');
  pruefe('B Puffer fast nie leer (≤ 3 %)', Math.max(...r.pufferLeer) <= 0.03, r.pufferLeer.map(pct).join(' / '));
  pruefe('B Vorhersage: höchstens 2 harte Korrekturen, mittlerer Fehler ≤ 5 cm', r.vorhersage.every(v => v.hart <= 2 && v.mittel <= 0.05), r.vorhersage.map(v => `${v.hart} hart, ${(v.mittel * 100).toFixed(1)} cm`).join(' | '));
  if (r.server) pruefe('B Server: Tick p99 < 10 ms, Zustände kommen im Abstand ≤ 150 ms', r.server.tickP99 < 10 && r.server.abstandMax <= 150, `${r.server.tickP99} ms, ${r.server.abstandMax} ms`);

  r = await L('C hartes Netz: 20–150 ms, Bursts, 300-ms-Lücken', { profil: 'hart' });
  pruefe('C eigenes Auto: ≤ 6 % Ruckel-Bilder', r.eigen.anteil <= 0.06, pct(r.eigen.anteil));
  pruefe('C andere Menschen / Computer: ≤ 2 % Ruckel-Bilder', r.mensch.anteil <= 0.02 && r.ki.anteil <= 0.02, pct(r.mensch.anteil) + ' / ' + pct(r.ki.anteil));

  r = await L('D unruhige Bildrate (jedes 12. Bild doppelt lang), LAN', { profil: 'lan', bildMuster: 'unruhig' });
  pruefe('D alle Autos ≤ 2 % Ruckel-Bilder', Math.max(r.eigen.anteil, r.mensch.anteil, r.ki.anteil) <= 0.02, [r.eigen, r.mensch, r.ki].map(x => pct(x.anteil)).join(' / '));

  r = await L('E MESSUNG GREIFT: alle v23-Maßnahmen im Browser AUS + Server-Eingabe wie v22b (= v22b-Verhalten)', { profil: 'tailscale', aus: alleAus, eingabeAlt: true });
  pruefe('E v22b ruckelt messbar (eigenes Auto ≥ 10 % ODER andere ≥ 5 %) – die Metrik erkennt den Fehler', r.eigen.anteil >= 0.10 || r.mensch.anteil >= 0.05 || r.ki.anteil >= 0.05,
    [r.eigen, r.mensch, r.ki].map(x => pct(x.anteil)).join(' / '));

  r = await L('F Gast-Fenster 3 s verdeckt (Bilder stehen), danach weiter – mit neutralem Eingabe-Takt', { profil: 'tailscale', sek: 30, pause: { start: 10, dauer: 3, modus: 'pumpe' } });
  pruefe('F Gast fährt danach weiter (≥ 60 m in den letzten 5 s), höchstens 3 harte Korrekturen nach der Pause', r.pause && r.pause.ende5s >= 60 && r.pause.hartGast <= 3, r.pause ? `${r.pause.ende5s.toFixed(0)} m, ${r.pause.hartGast} hart` : 'keine Pause');
  pruefe('F nach der Pause: kein Sprung des Gast-Autos > 1,5 m', !r.pause || !r.pause.nach || r.pause.nach.sprungMax <= 1.5, r.pause && r.pause.nach ? r.pause.nach.sprungMax.toFixed(2) + ' m' : '-');

  console.log(`\n${ok} OK, ${fehler} FEHL`);
  process.exit(fehler ? 1 : 0);
}

if (require.main === module) (async () => {
  if (process.argv.length <= 2 || (argv.length === 1 && argv[0] === '--test')) return testlauf();

  const bild = opt('bild', '60');
  const cfg = { profil: opt('profil', 'hart'), sek: +opt('sek', 40), strecke: opt('strecke', 'wiese'), ki: +opt('ki', 5), kollisionen: !!opt('kollisionen', false),
    bild: 1000 / +bild, gastBild: opt('gast-bild', null) ? 1000 / +opt('gast-bild') : null, aus: opt('aus', '') === 'alle' || opt('alt', false) === true ? ['eins', 'uhrGlatt', 'pll', 'adaptiv', 'extra', 'glatt', 'abgleich'] : String(opt('aus', '')).split(',').filter(Boolean), welt: opt('welt', ''), variante: opt('variante', ''), bildRauschen: opt('rausch', null) === null ? 0 : +opt('rausch'), bildMuster: opt('muster', 'gleichmaessig'), scheibe: +opt('scheibe', 0) * 1000, pause: opt('pause', null) ? (([a, b, c]) => ({ start: +a, dauer: +b, modus: c || 'ohne' }))(String(opt('pause')).split(',')) : null, eingabeAlt: !!opt('eingabe-alt', false) };
  const r = await lauf(cfg);
  drucken(`${cfg.strecke} ${cfg.profil} ${bild} Hz ${cfg.sek} s${cfg.aus.length ? ' (aus: ' + cfg.aus.join(',') + ')' : ''}${cfg.eingabeAlt ? ' (Server-Eingabe alt)' : ''}  [${path.basename(WURZEL)}]`, r);
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(2); });
