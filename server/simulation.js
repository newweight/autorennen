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
  'src/config.js', 'src/physics/vehicle.js', 'src/physics/collisions.js', 'src/physics/schaden.js', 'src/cars/carCatalog.js',
  'src/track/spline.js', 'src/track/trackCatalog.js', 'src/track/trackBuilder.js', 'src/track/looping.js', 'src/track/schanze.js',
  'src/track/anlauf.js', 'src/world/themes.js', 'src/world/wetter.js', 'src/world/dynamik.js', 'src/world/pickups.js',
  'src/world/kleber.js', 'src/race/raceManager.js', 'src/race/startBoost.js', 'src/ai/driver.js', 'src/net/protokoll.js',
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
function kontextLaden(dateien) {
  const leise = (...a) => { if (!String(a[0]).includes('deprecated')) console.warn(...a); };
  const sandbox = {
    console: { log: console.log, warn: leise, error: console.error, info: console.info },
    Math, performance: { now: () => Number(process.hrtime.bigint() / 1000n) / 1000 },
    document: { createElement: () => ({ width: 0, height: 0, style: {}, getContext: () => nichts() }) },
    setTimeout, clearTimeout,
  };
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
  K.autoAuto = function (liste, opt) { return aktuell && !aktuell.kollisionen ? [] : autoAuto.call(this, liste, opt); };
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
  return {
    streckeId: daten.id, welt, variante, jahreszeit: jz, wetter,
    windStaerke: r.windStaerke === 'zufall' ? 'zufall' : zahl(r.windStaerke, 0, 5, 0),
    runden: zahl(r.runden, c.rennen.rundenMin, c.rennen.rundenMax, c.rennen.rundenStandard),
    gegner: zahl(r.gegner, 0, maxKI, Math.min(3, maxKI)),
    schwierigkeit: c.schwierigkeiten[r.schwierigkeit] ? r.schwierigkeit : c.schwierigkeitStandard,
    tempoKlasse: c.tempoKlassen && c.tempoKlassen[r.tempoKlasse] ? r.tempoKlasse : (c.tempoKlasseStandard || 'normal'),
    tageszeit: c.tageszeit && c.tageszeit[r.tageszeit] ? r.tageszeit : 'tag',
    schaden: false,                       // Stufe 1: online immer aus
    kollisionen: r.kollisionen === true,  // Stufe 2 (nicht im Menü): Auto↔Auto an
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
    const strecke = new R.Strecke(daten, { welt, variante: e.variante });
    // Wetter auflösen (Zufall nur hier, mit Seed) → konkrete Werte gehen an alle Browser (gleiche Umwelt-Physik)
    const wa = R.Wetter.aufloesen({ jahreszeit: e.jahreszeit, wetter: e.wetter, wind: { staerke: e.windStaerke, richtung: 'zufall' },
      thema: daten.thema, seed });
    this.wetterInfo = { jahreszeit: wa.jahreszeit, wetter: wa.wetter, windStaerke: wa.windStaerke, windRichtung: wa.windRichtung, seed };
    const wetter = new R.Wetter(null, { jahreszeit: wa.jahreszeit, wetter: wa.wetter, wind: { staerke: wa.windStaerke, richtung: wa.windRichtung },
      thema: daten.thema, seed, strecke, tageszeit: e.tageszeit });
    // Physik-relevante Teile von main.js streckeSzeneBauen (ohne Grafik): Pflanzen-Kollider aus der Deko,
    // Wracks in die Hindernisliste (hindernisseBauen), nachts Laternenmasten als Säulen
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
      huds: [], pausiert: false, zustand: 'rennen',
    });
    this.sim = sim;
    this.eingaben = spieler.map(() => ({ gas: 0, bremse: 0, lenkung: 0 }));
    sim.input = { steuerung: (nr) => this.eingaben[nr] || { gas: 0, bremse: 0, lenkung: 0 } };
    this.ereignisse = [];                    // [{ an: nr|null, ... }] seit dem letzten abholen()
    // Meldungen gehen nur an den Betroffenen. Online ist jeder „Spieler 1“ an seinem Gerät: Tasten-Hinweise für Spieler 2
    // (T = Reset, E = Item) werden auf R / Leertaste umgeschrieben (beide Tasten gehen online ohnehin).
    const tastenText = (t) => String(t).replace(/oder T: /, 'oder R: ').replace(/\(E\)/, '(Leertaste)');
    sim.huds = spieler.map((s, nr) => ({ meldung: (text) => this.ereignisse.push({ an: nr, art: 'meldung', text: tastenText(text) }) }));

    // Teilnehmer wie main.js streckeAufbauen: Spieler vorne, dann die Computer mit den Autos, die kein Spieler fährt
    const katalog = R.carCatalog.waehlbare();
    const P = spieler.length, G = e.gegner;
    const spielerNamen = spieler.map(s => s.fahrer);
    const computerNamen = R.fahrerComputerNamen(spielerNamen, G);
    const spielerIds = spieler.map(s => s.auto);
    const frei = katalog.filter(a => !spielerIds.includes(a.id));
    const plaetze = strecke.startpositionen(P + G);
    const teilnehmer = plaetze.map((p, i) => {
      const istSpieler = i < P;
      const auto = istSpieler ? (katalog.find(a => a.id === spielerIds[i]) || katalog[0]) : (frei.length ? frei[(i - P) % frei.length] : katalog[0]);
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
    this.teilnehmerInfo = teilnehmer.map((t, i) => ({ nr: i, name: t.name, autoId: sim.fahrzeuge[i].auto.id, mensch: t.istSpieler,
      hilfe: sim.fahrzeuge[i].fahrhilfe }));
    const rennen = new R.RaceManager(strecke, teilnehmer, { runden: e.runden });
    sim.rennen = rennen;
    sim.startBoost = R.StartBoost && rennen.countdownDauer > 0 ? new R.StartBoost(teilnehmer.length) : null;
    rennen.bei('runde', (t, zeit) => { strecke.pylonenZurueck(t.nr); this.ereignisse.push({ an: null, art: 'runde', nr: t.nr, runde: t.runde, zeit }); });
    rennen.bei('ziel', (t) => this.ereignisse.push({ an: null, art: 'ziel', nr: t.nr, platz: t.zielPlatz, zeit: t.zielZeit }));
    rennen.bei('start', () => this.ereignisse.push({ an: null, art: 'start' }));
    rennen.bei('fertig', () => { this.fertig = true; });
    sim.fahrzeuge.forEach((f) => { if (f.driver && f.driver.hindernisseSetzen) f.driver.hindernisseSetzen(strecke.hindernisse); });
    // Reset-Zähler (Clients interpolieren nicht über einen Sprung hinweg)
    const zurueck = sim.zuruecksetzen, zurAnlauf = sim._zurAnlauf;
    sim.zuruecksetzen = function (i) { const f = this.fahrzeuge[i]; if (f) f.netReset++; return zurueck.call(this, i); };
    sim._zurAnlauf = function (i) { const ok = zurAnlauf.call(this, i); if (ok && this.fahrzeuge[i]) this.fahrzeuge[i].netReset++; return ok; };
    this.fertig = false;
    this.nachZielZeit = 0;
  }

  /** Steuerung für Spieler nr setzen (bereits dekodiert: { gas, bremse, lenkung }). */
  eingabeSetzen(nr, s) { const z = this.eingaben[nr]; if (z) { z.gas = s.gas; z.bremse = s.bremse; z.lenkung = s.lenkung; } }

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
    const autos = sim.fahrzeuge.map((f, i) => {
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
   * Faktoren (Turbo × Start-Boost), Sonderzustand (Looping/Flug/Rampe/Anlauf/Kleber → keine Vorhersage), Hinweise.
   */
  ich(nr) {
    const sim = this.sim, R = this.R, i = sim.fahrzeuge.findIndex(f => f.istSpieler && f.spielerNr === nr);
    if (i < 0) return null;
    const f = sim.fahrzeuge[i], v = f.vehicle, t = sim.rennen.teilnehmer[i];
    const fk = sim.pickups ? sim.pickups.faktoren(i) : null, fs = sim.startBoost ? sim.startBoost.faktoren(i) : null;
    const lp = f.looping, fz = f.flug, az = f.anlauf, kz = f.kleber;
    const sonder = !!((lp && (lp.aktiv || lp.fallen)) || (fz && (fz.aktiv || fz.rampe)) || (az && (az.bremst || (R.Anlauf && R.Anlauf.aktiv(az)))) ||
      (kz && R.Kleber && R.Kleber.gesperrt(kz)));
    return {
      nr: i, v: R.Netz.fahrzeugLesen(v), idx: f.index, bi: v._bandeIndex === undefined ? -1 : v._bandeIndex, bs: v._buschSperre || 0,
      fk: [(fk ? fk.vMax : 1) * (fs ? fs.vMax : 1), (fk ? fk.beschleunigung : 1) * (fs ? fs.beschleunigung : 1)],
      gs: sim.startBoost && sim.startBoost.gasSperre(i) ? 1 : 0,
      so: sonder ? 1 : 0,
      rh: f.resetHinweis ? 1 : 0, fh: f.falschHerum ? 1 : 0,
      rs: t.rundenStart, rzn: t.rundenzeiten.map(x => R.Netz.rund(x, 3)), bz: t.bestzeit, zz: t.zielZeit, zp: t.zielPlatz || 0,
    };
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
