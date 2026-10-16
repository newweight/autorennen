// ============================================================
// W5-1 Mehrspieler: autoritative Rennsimulation im Server (Node, CommonJS).
//
// Lädt die klassischen Script-Dateien des Spiels über einen vm-Lader wie tests/lade.js (EIN Sandbox-Global für
// alle Räume; nur Logik + three.min.js für die Deko-Kollider, KEIN WebGL, kein DOM außer einem kleinen
// document-Stub für Canvas-Texturen). Der Physikschritt ist GENAU der des Spiels: Spiel.prototype.physikSchritt
// aus src/main.js läuft auf einem kopflosen Spiel-Objekt (keine Meshes, keine Kameras, kein Ton). Damit fahren
// Spieler und KI online nach denselben Regeln wie lokal (Bande, Pflanzen, Hindernisse, Loopings, Schanzen,
// Anlauf, Kleber, Turbo/Schild/Ölfalle, Dynamik, Start-Boost, KI-Fahrer aus driver.js, Rennleitung).
//
// Stufe 1 = Geister: Auto↔Auto-Kollisionen (und der Looping-Abstand) sind AUS, solange sim.kollisionen false ist
// (Schalter für Stufe 2: Raum-Einstellung `kollisionen: true`, im Menü nicht angeboten). Schaden, Polizei und
// Münzen sind online aus (Schaden zeigt das Menü als „aus (online)“).
// ============================================================
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const WURZEL = path.join(__dirname, '..');
// Reihenfolge wie in Autorennen.html (ohne Ton, Eingabe, Autos-Grafik, Kameras, HUD, Menü)
const MODULE = [
  'vendor/three.min.js',
  'src/config.js', 'src/physics/vehicle.js', 'src/physics/collisions.js', 'src/physics/schaden.js', 'src/cars/carCatalog.js', 'src/cars/dachregel.js',
  'src/track/spline.js', 'src/track/trackCatalog.js', 'src/track/trackBuilder.js', 'src/track/looping.js', 'src/track/schanze.js',
  'src/track/anlauf.js', 'src/world/themes.js', 'src/world/schilder.js', 'src/world/tribuenen.js', 'src/world/wetter.js', 'src/world/dynamik.js', 'src/world/pickups.js',
  'src/world/kleber.js', 'src/world/polizei.js', 'src/world/verkehr.js', 'src/race/raceManager.js', 'src/race/startBoost.js', 'src/ai/driver.js', 'src/net/protokoll.js',
  'src/track/megastrecke.js',   // v22: Megastrecke (Add-on, nach Wetter/Themen/Strecke geladen)
  'src/main.js',
];

/** Kleiner Ersatz für document.createElement('canvas') (Texturen der Deko werden im Server nie gezeichnet). */
function nichts() {
  const f = function () { return nichts(); };
  return new Proxy(f, {
    get: (t, k) => (k === Symbol.toPrimitive ? () => 0 : k === 'then' ? undefined : nichts()),
    set: () => true,
    apply: () => nichts(),
  });
}

let R = null;
let aktuell = null;      // Simulation, deren Schritt gerade läuft (Geister-Schalter in den Kollisions-Hüllen)

/**
 * Script-Dateien des Spiels in einen eigenen vm-Kontext laden (wie tests/lade.js, dazu ein document-Stub für
 * Canvas-Texturen). Auch für Tests nutzbar (z. B. eine „Browser-Seite“ ohne DOM für die Vorhersage).
 */
function kontextLaden(dateien, extra) {
  const leise = (...a) => { if (!String(a[0]).includes('deprecated')) console.warn(...a); };
  const sandbox = {
    console: { log: console.log, warn: leise, error: console.error, info: console.info },
    Math, performance: { now: () => Number(process.hrtime.bigint() / 1000n) / 1000 },
    document: { createElement: () => ({ width: 0, height: 0, style: {}, getContext: () => nichts() }) },
    setTimeout, clearTimeout,
  };
  if (extra) Object.assign(sandbox, extra);        // v23: Tests geben z. B. WebSocket mit (Netz-Client im Node-Kontext)
  sandbox.window = sandbox;
  sandbox.self = sandbox;
  sandbox.addEventListener = () => {};
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  for (const d of dateien) {
    const code = fs.readFileSync(path.join(WURZEL, d), 'utf8');
    vm.runInContext(code, sandbox, { filename: d });
  }
  return sandbox.Rennspiel;
}

function laden() {
  if (R) return R;
  R = kontextLaden(MODULE);
  // Geister-Modus (Stufe 1): Auto↔Auto aus, solange die laufende Simulation keine Kollisionen will
  const K = R.Kollisionen, autoAuto = K.autoAuto, loopingAbstand = K.loopingAbstand;
  // v25 (15.10., Verkehr): auch im Geister-Modus stoßen Teilnehmer mit Verkehrswagen (Geisterfahrer, Krankenwagen, Abschleppwagen), nie untereinander
  K.autoAuto = function (liste, opt) {
    if (!aktuell || aktuell.kollisionen) return autoAuto.call(this, liste, opt);
    if (!aktuell.sim || !aktuell.sim.verkehr) return [];
    return autoAuto.call(this, liste, Object.assign({}, opt, { paarNur: (a, b) => !!((a && a.verkehr) || (b && b.verkehr)) }));
  };
  if (loopingAbstand) K.loopingAbstand = function (liste, st) { return aktuell && !aktuell.kollisionen ? undefined : loopingAbstand.call(this, liste, st); };
  return R;
}

/** Einstellungen des Raums prüfen (nur erlaubte Werte; unbekannt → Standard). */
function einstellungenPruefen(roh, spielerAnzahl) {
  const R = laden(), c = R.config, r = roh || {}, N = R.Netz;
  const zahl = (v, lo, hi, d) => (Number.isFinite(+v) && v !== null && v !== '' ? Math.max(lo, Math.min(hi, Math.round(+v))) : d);
  const daten = R.trackCatalog.find(t => t.id === r.streckeId) || R.trackCatalog[0];
  const welt = typeof r.welt === 'string' && daten.welten && daten.welten[r.welt] ? r.welt : '';
  const variante = typeof r.variante === 'string' && daten.varianten && daten.varianten[r.variante] ? r.variante : '';
  const jz = (c.jahreszeiten && c.jahreszeiten[r.jahreszeit]) || r.jahreszeit === 'zufall' ? r.jahreszeit : 'sommer';
  let wetter = (c.wetter && c.wetter[r.wetter]) || r.wetter === 'zufall' ? r.wetter : 'klar';
  if (jz !== 'zufall' && wetter !== 'zufall' && R.Wetter.erlaubt && !R.Wetter.erlaubt(daten.thema, jz).includes(wetter)) wetter = 'klar';
  const maxKI = Math.max(0, Math.min(c.rennen.gegnerMax, N.MAX_AUTOS - Math.max(1, spielerAnzahl || 1)));
  const altVerkehr = r.verkehr === 'wenig' || r.verkehr === 'viel';       // v28 (W1): alter Client → beide an
  const krankenwagen = typeof r.krankenwagen === 'boolean' ? r.krankenwagen : altVerkehr;
  const abschleppwagen = typeof r.abschleppwagen === 'boolean' ? r.abschleppwagen : altVerkehr;
  return {
    streckeId: daten.id, welt, variante, jahreszeit: jz, wetter,
    windStaerke: r.windStaerke === 'zufall' ? 'zufall' : zahl(r.windStaerke, 0, 5, 0),
    runden: zahl(r.runden, c.rennen.rundenMin, c.rennen.rundenMax, c.rennen.rundenStandard),
    gegner: zahl(r.gegner, 0, maxKI, Math.min(3, maxKI)),
    schwierigkeit: c.schwierigkeiten[r.schwierigkeit] ? r.schwierigkeit : c.schwierigkeitStandard,
    tempoKlasse: c.tempoKlassen && c.tempoKlassen[r.tempoKlasse] ? r.tempoKlasse : (c.tempoKlasseStandard || 'normal'),
    tageszeit: c.tageszeit && c.tageszeit[r.tageszeit] ? r.tageszeit : 'tag',
    schaden: false,                       // Stufe 1: online immer aus
    kollisionen: typeof r.kollisionen === 'boolean' ? r.kollisionen : true,  // Stufe 2: Auto↔Auto (Rempeln); v28 W5: Standard Rempeln, nur echtes false = Geister
    polizei: r.polizei === true,          // v4 (14.10.): Streifenwagen (nur ein echtes true schaltet ihn an)
    // v25 (15.10., additiv): Verkehr – Geisterfahrer (true/false) und Krankenwagen/Abschleppwagen ('aus'|'wenig'|'viel'); alte Clients senden es nicht → aus
    geisterfahrer: r.geisterfahrer === true,
    // v28 (W1, additiv): Krankenwagen/Abschleppwagen je einzeln (nur ein echtes true schaltet ein); fehlen beide Felder (alter Client), gilt `verkehr` 'wenig'/'viel' → beide an.
    // `verkehr` bleibt als abgeleiteter Wert ('wenig' wenn einer an, sonst 'aus') in den Einstellungen, damit alte Clients weiter etwas Sinnvolles anzeigen.
    krankenwagen, abschleppwagen, verkehr: krankenwagen || abschleppwagen ? 'wenig' : 'aus',
    // 12.10. Hindernis-Menge: nur 'normal' | 'viele' | 'sehrViele' (unbekannt, Zahl, null … → 'normal'); alle Browser bauen dieselbe Strecke
    hindernisMenge: c.hindernisMenge && c.hindernisMenge.stufen && typeof r.hindernisMenge === 'string' &&
      Object.prototype.hasOwnProperty.call(c.hindernisMenge.stufen, r.hindernisMenge) ? r.hindernisMenge : ((c.hindernisMenge && c.hindernisMenge.standard) || 'normal'),
  };
}

class Simulation {
  /**
   * @param {object} opt { einstellungen (roh), spieler: [{ fahrer, auto, hilfe }] in Startreihenfolge, seed }
   */
  constructor(opt) {
    const R = laden(), c = R.config;
    this.R = R;
    const spieler = opt.spieler || [];
    const e = einstellungenPruefen(opt.einstellungen, spieler.length);
    this.einstellungen = e;
    this.kollisionen = e.kollisionen;
    this.tick = 0;
    const seed = (opt.seed >>> 0) || 1;
    const daten = R.trackCatalog.find(t => t.id === e.streckeId) || R.trackCatalog[0];
    const welt = R.Strecke.weltName ? R.Strecke.weltName(daten, e.welt) : (daten.weltStandard || undefined);
    const strecke = new R.Strecke(daten, { welt, variante: e.variante, hindernisMenge: e.hindernisMenge });
    // Wetter auflösen (Zufall nur hier, mit Seed) → konkrete Werte gehen an alle Browser (gleiche Umwelt-Physik)
    const wa = R.Wetter.aufloesen({ jahreszeit: e.jahreszeit, wetter: e.wetter, wind: { staerke: e.windStaerke, richtung: 'zufall' },
      thema: daten.thema, seed });
    this.wetterInfo = { jahreszeit: wa.jahreszeit, wetter: wa.wetter, windStaerke: wa.windStaerke, windRichtung: wa.windRichtung, seed };
    const wetter = new R.Wetter(null, { jahreszeit: wa.jahreszeit, wetter: wa.wetter, wind: { staerke: wa.windStaerke, richtung: wa.windRichtung },
      thema: daten.thema, seed, strecke, tageszeit: e.tageszeit });
    // Physik-relevante Teile von main.js streckeSzeneBauen (ohne Grafik): Pflanzen-Kollider aus der Deko,
    // Wracks in die Hindernisliste (hindernisseBauen), nachts Laternenmasten als Säulen
    strecke.tempoKlasse = e.tempoKlasse;
    if (R.Kurvenschilder) R.Kurvenschilder.einbauen(strecke, e.tempoKlasse);   // 14.10. (v21): Schild-Masten als feste Säulen (wie im Browser)
    if (R.Tribuenen) R.Tribuenen.einbauen(strecke);   // 15.10. (v25): Zuschauertribünen als feste Säulen (wie im Browser)
    R.Kollisionen.pflanzenSammeln(strecke, R.themes.dekoBauen(daten.thema, strecke, wetter.jahreszeit));
    if (R.Kollisionen.wracksEinbauen) R.Kollisionen.wracksEinbauen(strecke);
    const tz = wetter.tz, thema = R.themes[daten.thema] || R.themes.wiese;
    if (tz && tz.laternen && thema.laternen && R.themes.laternenBauen) {
      const lb = R.themes.laternenBauen(strecke, thema, tz.laterne);
      strecke.saeulen = (strecke.saeulen || []).concat(lb.masten);
    }
    let dynamik = null;
    const strohDa = !!(strecke.strohballen && strecke.strohballen.length) && !(strecke.aktiveSchichten && strecke.aktiveSchichten.strohballen === false);
    const dd = strecke.daten || daten;
    if (R.Dynamik && ((dd.baelle && dd.baelle.length) || (dd.wasserstrahlen && dd.wasserstrahlen.length) || strohDa ||
        (strecke.dinos && strecke.dinos.length) || (R.Dynamik.braucht && R.Dynamik.braucht(strecke)))) {
      dynamik = new R.Dynamik(strecke, { seed: 4242 });
    }
    let pickups = null;
    if (R.Pickups && ((strecke.boostFelder && strecke.boostFelder.length) || (strecke.schilde && strecke.schilde.length))) pickups = new R.Pickups(strecke);

    // Kopfloses Spiel-Objekt: physikSchritt & Co. aus main.js laufen darauf unverändert
    const sim = Object.create(R.Spiel.prototype);
    Object.assign(sim, {
      strecke, wetter, dynamik, pickups, schaden: null, polizei: null, muenzen: null, kameras: [], stoesse: [],
      fahrzeuge: [], tageszeitDaten: tz || null, tempoKlasse: e.tempoKlasse, _physikZeit: 0, _hindernisVersion: 0,
      einstellungen: { rempeln: 'sanft', tageszeit: e.tageszeit },
      huds: [], pausiert: false, zustand: 'rennen', netzKonto: spieler.map(() => 0),
    });
    this.sim = sim;
    this.eingaben = spieler.map(() => ({ gas: 0, bremse: 0, lenkung: 0 }));
    sim.input = { steuerung: (nr) => this.eingaben[nr] || { gas: 0, bremse: 0, lenkung: 0 } };
    this.ereignisse = [];                    // [{ an: nr|null, ... }] seit dem letzten abholen()
    // Meldungen gehen nur an den Betroffenen. Online ist jeder „Spieler 1“ an seinem Gerät: Tasten-Hinweise für Spieler 2
    // (T = Reset, E = Item) werden auf R / Leertaste umgeschrieben (beide Tasten gehen online ohnehin).
    const tastenText = (t) => String(t).replace(/oder T: /, 'oder R: ').replace(/\(E\)/, '(Leertaste)').replace(/2× S\b/, '2× ↓');   // v23: Polizei-Hinweis (Spieler 2: S) online als ↓
    sim.huds = spieler.map((s, nr) => ({ meldung: (text) => this.ereignisse.push({ an: nr, art: 'meldung', text: tastenText(text) }) }));

    // Teilnehmer wie main.js streckeAufbauen: Spieler vorne, dann die Computer mit den Autos, die kein Spieler fährt
    const katalog = R.carCatalog.waehlbare();
    const P = spieler.length, G = e.gegner;
    const spielerNamen = spieler.map(s => s.fahrer);
    const computerNamen = R.fahrerComputerNamen(spielerNamen, G);
    const spielerIds = spieler.map(s => s.auto);
    const plaetze = strecke.startpositionen(P + G);
    // 14.10. (v20): Computer-Füller wie im Einzelspiel nur aus Passat, Multivan, 911, T-Roc (gemischter Lack, T-Roc Dach/Lack); deterministisch je Rennen
    const gegnerAutos = R.carCatalog.gegnerAutos(G, { seed: [e.streckeId, G, spielerIds.join('+')].join('|'), spielerIds });
    const teilnehmer = plaetze.map((p, i) => {
      const istSpieler = i < P;
      const auto = istSpieler ? (katalog.find(a => a.id === spielerIds[i]) || katalog[0]) : (gegnerAutos[i - P] || katalog[0]);
      const vehicle = new R.Vehicle(auto.fahrwerte, { tempoKlasse: e.tempoKlasse });
      vehicle.setzen(p.x, p.z, p.heading);
      vehicle.y = strecke.hoeheAn(p.x, p.z);
      const f = { vehicle, mesh: null, auto, radwinkel: 0, looping: R.Looping ? R.Looping.zustand() : null, flug: R.Schanzen ? R.Schanzen.zustand() : null,
        vorher: { x: p.x, y: vehicle.y, z: p.z, heading: p.heading, nicken: 0, neigung: 0 } };
      f.anzeige = f.vorher;
      f.istSpieler = istSpieler; f.spielerNr = istSpieler ? i : -1;
      f.fahrhilfe = istSpieler && c.fahrhilfen[spieler[i].hilfe] ? spieler[i].hilfe : (c.fahrhilfeStandard || 'aus');
      f.index = -1; f.stehZeit = 0; f.resetHinweis = false; f.falschHerum = false; f.falschZeit = 0;
      f.netReset = 0;
      if (!istSpieler) f.driver = new R.Driver(vehicle, strecke, { schwierigkeit: e.schwierigkeit, seed: 1000 + i * 17, name: computerNamen[i - P] });
      sim.fahrzeuge.push(f);
      return { vehicle, name: istSpieler ? spielerNamen[i] : computerNamen[i - P], istSpieler };
    });
    this.teilnehmerInfo = teilnehmer.map((t, i) => ({ nr: i, name: t.name, autoId: sim.fahrzeuge[i].auto.id, optionen: !t.istSpieler && sim.fahrzeuge[i].auto.optionen ? sim.fahrzeuge[i].auto.optionen : undefined, mensch: t.istSpieler,
      hilfe: sim.fahrzeuge[i].fahrhilfe }));
    const rennen = new R.RaceManager(strecke, teilnehmer, { runden: e.runden });
    sim.rennen = rennen;
    sim.startBoost = R.StartBoost && rennen.countdownDauer > 0 ? new R.StartBoost(teilnehmer.length) : null;
    rennen.bei('runde', (t, zeit) => { strecke.pylonenZurueck(t.nr); this.ereignisse.push({ an: null, art: 'runde', nr: t.nr, runde: t.runde, zeit }); });
    rennen.bei('ziel', (t) => this.ereignisse.push({ an: null, art: 'ziel', nr: t.nr, platz: t.zielPlatz, zeit: t.zielZeit }));
    rennen.bei('start', () => this.ereignisse.push({ an: null, art: 'start' }));
    rennen.bei('fertig', () => { this.fertig = true; });
    sim.fahrzeuge.forEach((f) => { if (f.driver && f.driver.hindernisseSetzen) f.driver.hindernisseSetzen(strecke.hindernisse); });
    // 14.10. (v21) Polizei online: der Server simuliert die Streifenwagen autoritativ (dieselbe Logik wie offline, src/world/polizei.js).
    // Sie sind Einträge hinter den Teilnehmern in sim.fahrzeuge (f.polizei = true); zustand() meldet sie getrennt (`po`, `ps`, `pz`).
    this.nT = teilnehmer.length;
    sim.polizei = null;
    const verkehrAn = R.Verkehr && (e.geisterfahrer || e.krankenwagen || e.abschleppwagen);
    if ((e.polizei && R.Polizei) || verkehrAn) {
      sim.fahrzeugHinzufuegen = function (auto, x, z, heading) {     // kopflos: kein Mesh, keine Szene
        const vehicle = new R.Vehicle(auto.fahrwerte, { tempoKlasse: e.tempoKlasse });
        vehicle.setzen(x, z, heading);
        const vorher = { x, y: 0, z, heading, nicken: 0, neigung: 0 };
        const eintrag = { vehicle, mesh: null, auto, radwinkel: 0, looping: R.Looping ? R.Looping.zustand() : null, flug: R.Schanzen ? R.Schanzen.zustand() : null,
          vorher, anzeige: vorher, netReset: 0 };
        this.fahrzeuge.push(eintrag);
        return eintrag;
      };
      if (e.polizei && R.Polizei) {
        sim.polizei = new R.Polizei(sim);
        sim.polizei.einsetzen(strecke, teilnehmer.length, G);
        sim.polizei.idx.forEach((i) => { sim.fahrzeuge[i].netReset = 0; });
      }
    }
    // v25 (15.10.): Verkehr online – der Server simuliert Geisterfahrer/Krankenwagen/Abschleppwagen autoritativ (src/world/verkehr.js), Einträge HINTER der Polizei
    sim.verkehr = null;
    if (verkehrAn) {
      sim.verkehr = new R.Verkehr(sim);
      sim.verkehr.einsetzen(strecke, teilnehmer.length, { geister: e.geisterfahrer, krankenwagen: e.krankenwagen === true, abschleppwagen: e.abschleppwagen === true });
      sim.verkehr.idx.forEach((i) => { sim.fahrzeuge[i].netReset = 0; });
    }
    // Reset-Zähler (Clients interpolieren nicht über einen Sprung hinweg)
    const zurueck = sim.zuruecksetzen, zurAnlauf = sim._zurAnlauf;
    sim.zuruecksetzen = function (i) { const f = this.fahrzeuge[i]; if (f) f.netReset++; return zurueck.call(this, i); };
    sim._zurAnlauf = function (i) { const ok = zurAnlauf.call(this, i); if (ok && this.fahrzeuge[i]) this.fahrzeuge[i].netReset++; return ok; };
    this.fertig = false;
    this.nachZielZeit = 0;
  }

  /** Steuerung für Spieler nr setzen (bereits dekodiert: { gas, bremse, lenkung }). */
  eingabeSetzen(nr, s) { const z = this.eingaben[nr]; if (z) { z.gas = s.gas; z.bremse = s.bremse; z.lenkung = s.lenkung; } }

  /** v22 (additiv, Protokoll-Version bleibt 4): vom Browser gemeldetes Münzen-Guthaben von Spieler nr (für das Freikaufen bei der Polizei). */
  kontoSetzen(nr, k) { if (this.sim.netzKonto && nr >= 0 && nr < this.sim.netzKonto.length) this.sim.netzKonto[nr] = k; }

  /** v22: Freikaufen (Eingabe-Bit f) von Spieler nr: nur wenn von der Polizei angehalten; der Server prüft und zieht ab (sim.polizeiFreikaufen). */
  freikaufen(nr) {
    const sim = this.sim;
    if (!sim.polizei || !sim.rennen || !sim.rennen.gasErlaubt) return;
    const i = sim.fahrzeuge.findIndex(f => f.istSpieler && f.spielerNr === nr);
    if (i < 0) return;
    const erg = sim.polizeiFreikaufen(i);
    if (erg === 'ok') this.ereignisse.push({ an: nr, art: 'freikauf', kosten: sim.polizei.c.freikaufKosten, konto: sim.netzKonto[nr] });
  }

  /** v24 (15.10., Eingabe-Bit d): Dach-Geste (↑+↓ im Stand) von Spieler nr – der nächste Physikschritt prüft Stand/Klappzeit autoritativ (main.js _dachVorab). */
  dachGeste(nr) {
    const f = this.sim.fahrzeuge.find(x => x.istSpieler && x.spielerNr === nr);
    if (f && f.dachL !== null) f.dachGeste = true;
  }

  /** Item / Reset-Taste von Spieler nr (wie Tasten im lokalen Spiel). */
  item(nr) { this.sim.itemEinsetzen(nr); }
  reset(nr) {
    const sim = this.sim, i = sim.fahrzeuge.findIndex(f => f.istSpieler && f.spielerNr === nr);
    if (i < 0 || !sim.rennen.gasErlaubt) return;
    sim.spielerZuruecksetzen(nr);
    this.ereignisse.push({ an: null, art: 'reset', nr: i });
  }

  /** Ein fester Physikschritt (1/60 s). */
  schritt() {
    const dt = this.R.config.physik.schritt;
    aktuell = this;
    try {
      this.sim.physikSchritt(dt);
    } finally { aktuell = null; }
    this.tick++;
    const r = this.sim.rennen;
    // Kinder sollen nicht ewig warten: nach dem ersten Menschen im Ziel höchstens 60 s, dann Ergebnis
    if (!this.fertig && r.zustand === 'laeuft' && r.teilnehmer.some(t => t.istSpieler && t.imZiel)) {
      this.nachZielZeit += dt;
      if (this.nachZielZeit > 60) this.fertig = true;
    }
  }

  /** Spieler nr ist weg: sein Auto fährt als Computer weiter (zählt nicht mehr als Mensch für das Rennende). */
  zuKI(nr) {
    const sim = this.sim, R = this.R;
    const i = sim.fahrzeuge.findIndex(f => f.istSpieler && f.spielerNr === nr);
    if (i < 0) return;
    const f = sim.fahrzeuge[i], t = sim.rennen.teilnehmer[i];
    f.istSpieler = false; f.spielerNr = -1;
    t.istSpieler = false;
    f.driver = new R.Driver(f.vehicle, sim.strecke, { schwierigkeit: this.einstellungen.schwierigkeit, seed: 5000 + i * 31, name: t.name });
    if (f.driver.hindernisseSetzen) f.driver.hindernisseSetzen(sim.strecke.hindernisse);
    f.driver.zurueckgesetzt(f.index);
    this.teilnehmerInfo[i].mensch = false;
    this.teilnehmerInfo[i].weg = true;
    // sind keine Menschen mehr im Rennen, endet es sofort (Raum geht danach zurück in die Lobby)
    if (!sim.rennen.teilnehmer.some(x => x.istSpieler)) this.fertig = true;
  }

  /** Ereignisse seit dem letzten Aufruf (Meldungen, Runden, Ziel, Start, Reset). */
  abholen() { const e = this.ereignisse; this.ereignisse = []; return e; }

  /**
   * Gemeinsamer Teil der Zustand-Nachricht (für alle Empfänger gleich).
   * a[i] = [x, z, y, heading, vLaengs, lenkung, flags, nicken+flugNicken, neigung, runde, platz, cp, fortschritt, reset, looping?]
   * flags: 1 bremst, 2 Turbo, 4 Schild, 8 Item, 16 im Ziel, 32 Flug, 64 Schild platzt, 128 Mensch
   */
  zustand() {
    const sim = this.sim, r = sim.rennen, N = this.R.Netz, rd = N.rund, pu = sim.pickups;
    const autos = sim.fahrzeuge.slice(0, this.nT).map((f, i) => {
      const v = f.vehicle, t = r.teilnehmer[i], lp = f.looping, fz = f.flug;
      let flags = 0;
      if (f.bremst) flags |= 1;
      if (pu && pu.turboAktiv(i)) flags |= 2;
      if (pu && pu.hatSchild(i)) flags |= 4;
      if (pu && pu.itemVon(i)) flags |= 8;
      if (t.imZiel) flags |= 16;
      if (fz && fz.aktiv) flags |= 32;
      if (pu && pu.autos[i] && pu.autos[i].platzt > 0) flags |= 64;
      if (t.istSpieler) flags |= 128;
      const nick = v.nicken + (fz ? this.R.Schanzen.anzeigeNicken(fz, 1) : 0);
      const a = [rd(v.x, 3), rd(v.z, 3), rd(v.y, 3), rd(v.heading, 4), rd(v.vLaengs, 2), rd(v.lenkung, 3), flags, rd(nick, 3), rd(v.neigung, 3),
        t.runde, t.platz, t.naechsterCheckpoint, rd(t.fortschritt, 1), f.netReset];
      if (lp && lp.aktiv && lp.looping) a.push([sim.strecke.loopings.indexOf(lp.looping), rd(lp.winkel, 4), rd(lp.qEin || 0, 3)]);
      return a;
    });
    const z = { t: 'zustand', k: this.tick, rz: r.zustand, cd: rd(r.countdown, 3), zt: rd(r.zeit, 3), a: autos };
    // v24 (15.10., additiv): Dach-Zustand der Cabrios: dz = [[Teilnehmer-Nr, ziel 0 offen/1 zu, Rest der Klappzeit s]] – fehlt, wenn kein Auto ein Verdeck hat
    const dz = [];
    for (let i = 0; i < this.nT; i++) { const dl = sim.fahrzeuge[i].dachL; if (dl) dz.push([i, dl.ziel, rd(dl.rest, 2)]); }
    if (dz.length) z.dz = dz;
    // v4 (14.10.): Polizei. po[k] = Streifenwagen k im Format von `a` (x, z, y, richtung, tempo, lenkung, flags, nicken, neigung, 0, 0, 0, 0, resetZaehler),
    // ps = [[Teilnehmer-Nr, Rest der Anhaltung in s]] (nur wer gerade angehalten ist), pz = Ziel (Teilnehmer-Nr oder −1) je Streifenwagen
    const po = sim.polizei;
    if (po) {
      z.po = po.idx.map((fi) => {
        const f = sim.fahrzeuge[fi], v = f.vehicle;
        return [rd(v.x, 3), rd(v.z, 3), rd(v.y, 3), rd(v.heading, 4), rd(v.vLaengs, 2), rd(v.lenkung, 3), f.bremst ? 1 : 0, rd(v.nicken, 3), rd(v.neigung, 3), 0, 0, 0, 0, f.netReset || 0];
      });
      z.pz = po.idx.map((fi, k) => po.logik.zielVon(k));
      const ps = [];
      for (let i = 0; i < this.nT; i++) { const rest = po.logik.rest(i); if (rest > 0) ps.push([i, rd(rest, 2)]); }
      if (ps.length) z.ps = ps;
    }
    // v25 (15.10., additiv): vk[k] = Verkehrswagen k (Geisterfahrer, Krankenwagen, Abschleppwagen in dieser Reihenfolge) im Format von `a` mit 14 Zahlen;
    // flags: 1 bremst · 2 aktiv (sonst geparkt/unsichtbar) · 4 Lichthupe. Fehlt, wenn kein Verkehr eingestellt ist.
    if (sim.verkehr) z.vk = sim.verkehr.zustandKodieren();
    if (pu) {
      z.pu = {
        k: pu.kugeln.map(k => (k.da ? 1 : 0)).join(''), f: pu.faesser.map(k => (k.da ? 1 : 0)).join(''),
        o: pu.oel.map(o => [rd(o.x, 2), rd(o.z, 2), rd(o.heading, 3), rd(o.alter, 2), o.owner]),
        v: sim.fahrzeuge.map((f, i) => { const a = pu.autos[i]; return a ? [rd(a.turbo, 2), rd(a.vFaktor, 4), rd(a.bFaktor, 3)] : 0; }),
      };
    }
    return z;
  }

  /**
   * Eigener Teil für Spieler nr: vollständiger Fahrzeugzustand (für den Neuabgleich der Vorhersage), Index,
   * Faktoren (Turbo × Start-Boost), Sonderzustand `so` (Looping/Flug/Rampe/Anlauf/Kleber) und – v16 – dessen Zustand `sz` für die Vorhersage, Hinweise.
   */
  ich(nr) {
    const sim = this.sim, R = this.R, i = sim.fahrzeuge.findIndex(f => f.istSpieler && f.spielerNr === nr);
    if (i < 0) return null;
    const f = sim.fahrzeuge[i], v = f.vehicle, t = sim.rennen.teilnehmer[i];
    const fk = sim.pickups ? sim.pickups.faktoren(i) : null, fs = sim.startBoost ? sim.startBoost.faktoren(i) : null;
    const dl = f.dachL, dfk = dl && dl.gesund < 100 ? R.DachRegel.faktoren(dl) : null;     // v24: Nässe-Schaden (Tempo/Beschleunigung) steckt in fk
    const lp = f.looping, fz = f.flug, az = f.anlauf, kz = f.kleber;
    const sonder = !!((lp && (lp.aktiv || lp.fallen)) || (fz && (fz.aktiv || fz.rampe)) || (az && (az.bremst || (R.Anlauf && R.Anlauf.aktiv(az)))) ||
      (kz && R.Kleber && R.Kleber.gesperrt(kz)));
    // v16 (13.10.): Zustände der Sonderfälle für die Vorhersage (nur wenn etwas davon aktiv/nicht in Ruhe ist, sonst fehlt `sz`)
    const sz = this._sonderZustand(f);
    const erg = {
      nr: i, v: R.Netz.fahrzeugLesen(v), idx: f.index, bi: v._bandeIndex === undefined ? -1 : v._bandeIndex, bs: v._buschSperre || 0,
      fk: [(fk ? fk.vMax : 1) * (fs ? fs.vMax : 1) * (dfk ? dfk.vMax : 1), (fk ? fk.beschleunigung : 1) * (fs ? fs.beschleunigung : 1) * (dfk ? dfk.beschleunigung : 1)],
      gs: sim.startBoost && sim.startBoost.gasSperre(i) ? 1 : 0,
      so: sonder ? 1 : 0,
      rh: f.resetHinweis ? 1 : 0, fh: f.falschHerum ? 1 : 0,
      rs: t.rundenStart, rzn: t.rundenzeiten.map(x => R.Netz.rund(x, 3)), bz: t.bestzeit, zz: t.zielZeit, zp: t.zielPlatz || 0,
    };
    if (sz) erg.sz = sz;
    // v24 (15.10., additiv): Dach des eigenen Autos [ziel, Klappzeit-Rest (ungerundet), nass 0/1, Strafuhr s, Gesundheit %] – die Vorhersage sperrt damit das Gas beim Klappen
    if (dl) erg.dz = [dl.ziel, dl.rest, dl.nass ? 1 : 0, dl.uhr, dl.gesund];
    // v4: Rest der Polizei-Anhaltung (ungerundet: die Vorhersage zählt ihn im selben Takt herunter und ersetzt die Eingabe durch Bremsen)
    if (sim.polizei) { const rest = sim.polizei.logik.rest(i); if (rest > 0) erg.ps = rest; }
    return erg;
  }

  /**
   * v16: Zustand der Sonderfälle des Fahrzeugs f für `ich.sz` (Protokoll v2, abwärtskompatibel: alte Browser ignorieren das Feld).
   * Je Teil ein kurzes Zahlen-Array, nur wenn der Teil nicht in Ruhe ist (fehlt = Ruhe/Standardzustand):
   *   k Kleber  [zeit, klebt, frei, anzeige]
   *   a Anlauf  [stelle (Index in Anlauf.stellen, −1 keine), bremst 0/1, stehZeit]
   *   f Flug    [aktiv 0/1, rampe (Index in Schanzen.liste, −1 keine), rampenH, vy, t, y, nicken, index]
   *   l Looping [aktiv 0/1, fallen 0/1, Looping-Index, winkel, winkelVorher, v, qEin, fallZeit]
   * Zahlen ungerundet (volle double-Genauigkeit): Schwellen wie `zeit > 2`, `y <= boden`, `winkel >= 2π` müssen im selben Tick auslösen wie im Server.
   * Liefert null, wenn gar nichts davon aktiv ist.
   */
  _sonderZustand(f) {
    const R = this.R, st = this.sim.strecke, z = {};
    let any = false;
    const kz = f.kleber;
    if (kz && (kz.zeit > 0 || kz.klebt > 0 || kz.frei > 0)) { z.k = [kz.zeit, kz.klebt, kz.frei, kz.anzeige]; any = true; }
    const az = f.anlauf;
    if (az && R.Anlauf && (az.bremst || az.stelle || az.stehZeit > 0)) {
      const l = R.Anlauf.stellen(st);
      // (Anlauf.stellen baut bei Strecken ohne Schanzen die Liste jedes Mal neu → Stelle über art/nr suchen, nicht über die Objekt-Identität)
      z.a = [az.stelle ? l.findIndex(x => x.art === az.stelle.art && x.nr === az.stelle.nr) : -1, az.bremst ? 1 : 0, az.stehZeit]; any = true;
    }
    const fz = f.flug;
    if (fz && (fz.aktiv || fz.rampe || Math.abs(fz.nicken) > 1e-3)) {
      z.f = [fz.aktiv ? 1 : 0, fz.rampe ? R.Schanzen.liste(st).indexOf(fz.rampe) : -1, fz.rampenH, fz.vy, fz.t, fz.y,
        fz.nicken, fz.index === undefined ? -1 : fz.index]; any = true;
    }
    const lp = f.looping;
    if (lp && (lp.aktiv || lp.fallen)) {
      z.l = [lp.aktiv ? 1 : 0, lp.fallen ? 1 : 0, st.loopings.indexOf(lp.looping), lp.winkel, lp.winkelVorher, lp.v, lp.qEin || 0,
        lp.fallZeit || 0]; any = true;
    }
    return any ? z : null;
  }

  /** Startdaten für alle Browser (Szene bauen, Teilnehmerliste). */
  startInfo() {
    const e = this.einstellungen;
    return {
      einstellungen: Object.assign({}, e, { jahreszeit: this.wetterInfo.jahreszeit, wetter: this.wetterInfo.wetter,
        windStaerke: this.wetterInfo.windStaerke, windRichtung: this.wetterInfo.windRichtung }),
      wetterSeed: this.wetterInfo.seed,
      teilnehmer: this.teilnehmerInfo,
      countdown: this.sim.rennen.countdownDauer,
    };
  }

  /** Ergebnisliste (wie main.js rennenFertig, ohne Sterne/Preisgeld). */
  ergebnis() {
    const r = this.sim.rennen;
    return {
      runden: r.runden,
      zeilen: r.rangliste.map((t, i) => ({
        platz: i + 1, nr: t.nr, name: t.name, mensch: !!this.teilnehmerInfo[t.nr].mensch || !!this.teilnehmerInfo[t.nr].weg,
        weg: !!this.teilnehmerInfo[t.nr].weg, autoId: this.teilnehmerInfo[t.nr].autoId,
        zeit: t.imZiel ? t.zielZeit : null, beste: t.bestzeit, runden: t.runde,
      })),
    };
  }
}

module.exports = { laden, kontextLaden, Simulation, einstellungenPruefen, MODULE };
