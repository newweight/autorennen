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
const MotoSim = require('./motoSim');     // M4: Motorrad-Zusatz der Simulation (nur in Motorrad-Räumen benutzt)

const WURZEL = path.join(__dirname, '..');
// Reihenfolge wie in Autorennen.html (ohne Ton, Eingabe, Autos-Grafik, Kameras, HUD, Menü)
const MODULE = [
  'vendor/three.min.js',
  'src/config.js', 'src/physics/vehicle.js', 'src/physics/collisions.js', 'src/physics/schaden.js', 'src/cars/carCatalog.js', 'src/cars/dachregel.js',
  'src/track/spline.js', 'src/track/trackCatalog.js', 'src/track/trackBuilder.js', 'src/track/zufall.js', 'src/track/looping.js', 'src/track/schanze.js',
  'src/track/trackWelten.js',   // S5: neue Strecken (Mond, Unterwasser, Regenbogenland)
  'src/track/anlauf.js', 'src/spass/spassKern.js', 'src/spass/spassTuning.js', 'src/world/themes.js', 'src/world/schilder.js', 'src/world/tribuenen.js', 'src/world/formel1.js', 'src/world/wetter.js', 'src/world/dynamik.js', 'src/world/pickups.js',
  'src/world/kleber.js', 'src/world/polizei.js', 'src/world/verkehr.js', 'src/world/tiere.js', 'src/race/raceManager.js', 'src/race/startBoost.js', 'src/ai/driver.js', 'src/net/protokoll.js',
  'src/track/megastrecke.js',   // v22: Megastrecke (Add-on, nach Wetter/Themen/Strecke geladen)
  'src/world/themenS5.js',      // S5: Themen Mond/Ozean/Regenbogen (nach themes/wetter)
  'src/main.js', 'src/spass/spassPhysik.js',      // S1: Trampolin/Kanone (Add-on, nach main.js)
  'src/spass/spassWelten.js',                     // S5: Hüpfer, Teleport-Tore, Grip je Strecke (Add-on, nach spassPhysik)
  'src/spass/spassZauber.js',                     // S6: Magnet-Röhre, Schlucht-Gleiten, Grinden/Wallride, Halfpipe, Riese/Mini (Add-on, nach spassWelten)
  'src/spass/editorKern.js',                      // S7: Strecken-Editor (eigene Strecken 'eigen-…', Haken in R.Spass.plan – nach spassZauber)
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

/** Geister-Modus (Stufe 1) und Verkehrs-Kollisionen: Hüllen um Kollisionen.autoAuto/loopingAbstand (gilt für jeden geladenen Kontext). */
function kollisionsHuelle(R) {
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

function laden() {
  if (R) return R;
  R = kontextLaden(MODULE);
  return kollisionsHuelle(R);
}

// ---------------------------------------------------------------- M4: Motorrad-Kontext (nur für Motorrad-Räume, Schalter `moto`)
// Zweiter, getrennter vm-Kontext: dieselben Module wie oben, dazu der Motorrad-Modus (window.MOTORRAD === true) wie in Motorrad.html – Motorrad-Katalog (inkl.
// M3-Typen), angepasste Strecken (Schanzen/Zonen), Schräglage/Sturz, Stunts, Unfälle. Der Autorennen-Kontext (laden) bleibt unberührt: Auto-Räume laufen bitgleich wie vorher.
// Reihenfolge wie Motorrad.html: Katalog/Typen/Logik VOR main.js, die Verdrahtungs-Umhüllungen (Spiel.physikSchritt …) danach.
const MOTO_VOR = ['src/world/garage.js', 'src/moto/motoKatalog.js', 'src/moto/motoTypen.js', 'src/moto/schraeglage.js', 'src/moto/stunts.js', 'src/moto/stuntWelt.js', 'src/moto/unfall.js'];
const MOTO_NACH = ['server/motoHaken.js', 'src/moto/stuntStart.js', 'src/moto/unfallWelt.js', 'src/moto/unfallStart.js', 'src/spass/spassTricks.js', 'src/moto/motoS8Welt.js'];
const MOTO_UNFALL = ['aus', 'sanft', 'echt'];       // erlaubte Werte der Raum-Einstellung `unfall` (Standard sanft)
let RM = null;
function ladenMoto() {
  if (RM) return RM;
  const bisMega = MODULE.indexOf('src/world/themenS5.js');   // S5: Themen-Add-on gehört dazu
  const liste = MODULE.slice(0, bisMega + 1).concat(MOTO_VOR, ['src/main.js', 'src/spass/spassPhysik.js', 'src/spass/spassWelten.js', 'src/spass/spassZauber.js', 'src/spass/editorKern.js'], MOTO_NACH);
  RM = kontextLaden(liste, { MOTORRAD: true });
  return kollisionsHuelle(RM);
}

/**
 * Einstellungen des Raums prüfen (nur erlaubte Werte; unbekannt → Standard).
 * moto (M4, Standard false = bitgleich wie vorher): Motorrad-Raum – zusätzliche Felder `moto: true`, `unfall` ('aus'|'sanft'|'echt'), `stuntrennen` (bool);
 * Polizei, Verkehr (Geisterfahrer/Krankenwagen/Abschleppwagen) und „Nur Rennautos“ gibt es für Motorräder nicht und sind immer aus.
 */
// S8: eigene Strecke (S7-Editor) online – der Host schickt den Streckencode (in Teilen), der Server prüft ihn mit R.Editor.ausCode → pruefen (Größe, Kurven,
// Kreuzungen, Elemente; fremde Daten werden bereinigt), trägt die Strecke deterministisch (id = Hash der Punkte) in den Katalog ein und alle Browser tun dasselbe aus
// demselben Code. Höchstens EIGEN_MAX Strecken gleichzeitig im Katalog (älteste fliegt raus); der Code bleibt in den Raum-Einstellungen (`eigen`) und wird bei jeder Prüfung
// still neu eingetragen, falls die Strecke inzwischen verdrängt wurde.
const EIGEN_MAX = 16, EIGEN_CODE_MAX = 14000;
const eigenListe = [];            // [{ code, id }] – neueste hinten
function eigenRegistrieren(code, moto) {
  if (typeof code !== 'string' || !code || code.length > EIGEN_CODE_MAX) return null;
  const kontexte = [laden()].concat(moto ? [ladenMoto()] : []);
  let id = null;
  const i0 = eigenListe.findIndex((x) => x.code === code);
  if (i0 >= 0 && kontexte.every((R) => R.trackCatalog.some((t) => t.id === eigenListe[i0].id))) return eigenListe[i0].id;
  for (const R of kontexte) {
    if (!R.Editor) return null;
    const d = R.Editor.ausCode(code);
    if (!d) return null;
    id = R.Editor.registrieren(d).id;
  }
  if (i0 >= 0) eigenListe.splice(i0, 1);
  eigenListe.push({ code, id });
  while (eigenListe.length > EIGEN_MAX) {
    const alt = eigenListe.shift();
    if (!eigenListe.some((x) => x.id === alt.id)) for (const R of [laden()].concat(RM ? [RM] : [])) { const k = R.trackCatalog.findIndex((t) => t.id === alt.id && t.eigen); if (k >= 0) R.trackCatalog.splice(k, 1); }
  }
  return id;
}
function eigenPruefen(code) { const R = laden(); if (!R.Editor || typeof code !== 'string' || code.length > EIGEN_CODE_MAX) return null; const d = R.Editor.ausCode(code); return d ? { name: d.name } : null; }

function einstellungenPruefen(roh, spielerAnzahl, moto) {
  const R = laden(), c = R.config, r0 = roh || {}, N = R.Netz;
  const eigenId = typeof r0.eigen === 'string' && r0.eigen ? eigenRegistrieren(r0.eigen, moto === true) : null;       // S8: eigene Strecke (fehlt/ungültig → normale Wahl)
  const r = eigenId ? Object.assign({}, r0, { streckeId: eigenId, welt: '', variante: '' }) : r0;
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
  const erg = {
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
    // v28 (W10, additiv): Tiere queren die Straße (Server simuliert, Protokoll zustand.ti); nur ein echtes true schaltet ein – ein alter Browser kennt `ti` nicht und sendet nichts
    // (sonst gäbe es unsichtbare Tiere); der neue Browser sendet `tiere` (Standard true) in den Raum-Einstellungen
    tiere: r.tiere === true,
    // v29 (F3, additiv): Modus „Nur Rennautos“ – alle Computer-Gegner fahren den Formel-Renner, jeder in eigener Farbe (Autowahl macht der Server,
    // teilnehmerInfo.optionen.farbe); nur ein echtes true schaltet ein (alter Client sendet es nicht → wie bisher). Menschen behalten ihre Wahl.
    nurRennautos: r.nurRennautos === true,
    // Z1 (additiv): Zufällige Strecke – Münzen/Hindernisse jede Runde neu (track/zufall.js); nur ein echtes true schaltet ein (ein alter Browser sendet das Feld nicht
    // und kennt das Ereignis `zufall` nicht → bekommt die feste Strecke); der neue Browser sendet `zufall` (Standard true) in raumErstellen/einstellungen
    zufall: r.zufall === true,
    // S1 (additiv): Spaß-Elemente (Trampolin/Kanone, src/spass); nur ein echtes true schaltet ein (alter Browser sendet das Feld nicht → feste alte Strecke)
    spass: r.spass === true,
    // S6 (additiv): Fahr-Zauber (src/spass/spassZauber.js: Magnet-Röhre, Schlucht, Schienen/Wände, Halfpipe, Riese/Mini); nur ein echtes true schaltet ein (setzt spass voraus)
    zauber: r.zauber === true,
    // S2 (additiv): Tuning mit Goldstücken (src/spass/spassTuning.js) wirkt nur, wenn der Raum es erlaubt (Lobby-Schalter, Standard AUS = fair); nur ein echtes true schaltet ein
    tuning: r.tuning === true,
    // 12.10. Hindernis-Menge: nur 'normal' | 'viele' | 'sehrViele' (unbekannt, Zahl, null … → 'normal'); alle Browser bauen dieselbe Strecke
    hindernisMenge: c.hindernisMenge && c.hindernisMenge.stufen && typeof r.hindernisMenge === 'string' &&
      Object.prototype.hasOwnProperty.call(c.hindernisMenge.stufen, r.hindernisMenge) ? r.hindernisMenge : ((c.hindernisMenge && c.hindernisMenge.standard) || 'normal'),
  };
  if (eigenId) erg.eigen = r0.eigen;      // S8: Streckencode der eigenen Strecke (Gäste tragen sie damit selbst ein); ohne eigene Strecke fehlt das Feld (bitgleich wie vorher)
  if (moto === true) {
    Object.assign(erg, { polizei: false, geisterfahrer: false, krankenwagen: false, abschleppwagen: false, verkehr: 'aus', nurRennautos: false,
      moto: true, unfall: MOTO_UNFALL.includes(r.unfall) ? r.unfall : 'sanft', stuntrennen: r.stuntrennen === true });
  }
  return erg;
}

class Simulation {
  /**
   * @param {object} opt { einstellungen (roh), spieler: [{ fahrer, auto, hilfe }] in Startreihenfolge, seed }
   */
  constructor(opt) {
    const moto = opt.moto === true;                  // M4: Motorrad-Raum → eigener Kontext (Motorrad-Katalog, Stunts, Unfälle); Standard (fehlt/false) = Autorennen wie bisher
    const R = moto ? ladenMoto() : laden(), c = R.config;
    this.R = R;
    this.moto = null;
    const spieler = opt.spieler || [];
    const e = einstellungenPruefen(opt.einstellungen, spieler.length, moto);
    this.einstellungen = e;
    this.kollisionen = e.kollisionen;
    this.tick = 0;
    const seed = (opt.seed >>> 0) || 1;
    const daten = R.trackCatalog.find(t => t.id === e.streckeId) || R.trackCatalog[0];
    const welt = R.Strecke.weltName ? R.Strecke.weltName(daten, e.welt) : (daten.weltStandard || undefined);
    // Z1: Rennseed der Zufalls-Strecke aus dem Raum-Seed (Ganzzahl-Hash, bitgleich im Browser); null = feste Strecke wie bisher
    this.zufallSeed = e.zufall === true && R.Zufall ? R.Zufall.hash32(seed, 0x5a31, 1, 7) : null;
    const sOpt = { welt, variante: e.variante, hindernisMenge: e.hindernisMenge };
    if (this.zufallSeed !== null) sOpt.zufall = { seed: this.zufallSeed };
    if (e.spass === true) { sOpt.spass = true; if (e.zauber === true) sOpt.zauber = true; }
    const strecke = new R.Strecke(daten, sOpt);
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
    let gegnerAutos = R.carCatalog.gegnerAutos(G, { seed: [e.streckeId, G, spielerIds.join('+')].join('|'), spielerIds, schwierigkeit: e.schwierigkeit });   // S8: schwierigkeit nur für das Motorrad-Feld
    // v29 (F3): Modus „Nur Rennautos“ – Gegner = Formel-Renner in eigenen Farben (wie main.js streckeAufbauen)
    if (e.nurRennautos === true && R.carCatalog.formelFeld) {
      gegnerAutos = R.carCatalog.formelFeld({ spieler: spielerIds.map(id => katalog.find(a => a.id === id) || katalog[0]), gegner: G, seed: [e.streckeId, G, spielerIds.join('+')].join('|') }).gegner;
    }
    // S2: Tuning nur mit Raum-Schalter; Menschen bringen ihre Stufen mit (geklemmt auf 0..5), Computer bekommen gleichwertiges (R.SpassTuning.kiStufen) – Server und Browser rechnen gleich
    const tuMenschen = e.tuning === true && R.SpassTuning ? spieler.map(s => R.SpassTuning.saeubern(s.tuning)) : null;
    const tuKi = tuMenschen ? R.SpassTuning.kiStufen(tuMenschen.map(x => x || {}), e.schwierigkeit) : null;
    const tuStufen = [];
    const teilnehmer = plaetze.map((p, i) => {
      const istSpieler = i < P;
      const auto = istSpieler ? (katalog.find(a => a.id === spielerIds[i]) || katalog[0]) : (gegnerAutos[i - P] || katalog[0]);
      const vehicle = new R.Vehicle(auto.fahrwerte, { tempoKlasse: e.tempoKlasse });
      if (tuMenschen) { const ts = istSpieler ? tuMenschen[i] : tuKi; if (ts && R.SpassTuning.anwenden(vehicle, ts)) tuStufen[i] = R.SpassTuning.alsListe(ts); }
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
      hilfe: sim.fahrzeuge[i].fahrhilfe, tuning: tuStufen[i] || undefined }));
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
    // v28 (W10): Tiere queren die Straße – autoritativ im Server (src/world/tiere.js); Zustand `ti` im Zustand
    sim.tiere = null;
    if (e.tiere === true && R.Tiere) {
      sim.tiere = new R.Tiere(sim);
      sim.tiere.einsetzen(strecke, teilnehmer.length, { seed });
    }
    // Reset-Zähler (Clients interpolieren nicht über einen Sprung hinweg)
    const zurueck = sim.zuruecksetzen, zurAnlauf = sim._zurAnlauf;
    sim.zuruecksetzen = function (i) { const f = this.fahrzeuge[i]; if (f) f.netReset++; return zurueck.call(this, i); };
    sim._zurAnlauf = function (i) { const ok = zurAnlauf.call(this, i); if (ok && this.fahrzeuge[i]) this.fahrzeuge[i].netReset++; return ok; };
    this.fertig = false;
    this.nachZielZeit = 0;
    // M4: Motorrad-Zusatz (Stunts, Sturz, Unfälle, Stationen) – nur in Motorrad-Räumen; Autorennen-Räume laufen ohne diese Zeile
    if (moto) this.moto = MotoSim.einbauen(this, R, e);
  }

  /** Steuerung für Spieler nr setzen (bereits dekodiert: { gas, bremse, lenkung }). */
  eingabeSetzen(nr, s) { const z = this.eingaben[nr]; if (z) { z.gas = s.gas; z.bremse = s.bremse; z.lenkung = s.lenkung; } }

  /** M4 (nur Motorrad-Räume): Trick-Taste von Spieler nr in diesem Schritt gehalten? (Eingabe-Bit k; tippen = kurz halten.) */
  trickSetzen(nr, an) { if (this.moto) this.moto.trick[nr] = !!an; }

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
      if (this.moto) this.moto.nachSchritt(dt);       // M4: Sturz-Purzelbaum weiterzählen, Quad entschärfen, Stunt-/Sturz-/Unfall-Ereignisse
      this.zufallSchritt(dt);                         // Z1: Zufällige Strecke – Rundenwechsel des Führenden / Nachzügler → Neuverteilung + Ereignis `zufall`
    } finally { aktuell = null; }
    this.tick++;
    const r = this.sim.rennen;
    // Kinder sollen nicht ewig warten: nach dem ersten Menschen im Ziel höchstens 60 s, dann Ergebnis
    if (!this.fertig && r.zustand === 'laeuft' && r.teilnehmer.some(t => t.istSpieler && t.imZiel)) {
      this.nachZielZeit += dt;
      if (this.nachZielZeit > 60) this.fertig = true;
    }
  }

  /**
   * Z1: Taktgeber der Zufalls-Strecke (nur wenn `einstellungen.zufall`). Das Ereignis { runde, n, v } wird hier angewendet und als `zufall`-Ereignis an alle
   * Browser geschickt; sie rechnen daraus bitgleich dieselbe Lage (track/zufall.js, ganzzahlig). v = Bogenlängen aller Fahrzeuge in ganzen m.
   */
  zufallSchritt(dt) {
    const st = this.sim.strecke;
    if (!st.zufall || !this.sim.rennen.gasErlaubt) return;
    const R = this.R, sim = this.sim;
    const ev = R.Zufall.takt(st, R.Zufall.fortschritte(sim), dt, sim.rennen.runden);
    if (!ev) return;
    R.Zufall.externAus(st, sim);
    R.Zufall.ereignis(st, ev);
    for (const f of sim.fahrzeuge) for (const d of [f.driver, f.autopilot, f.polizeiFahrer]) if (d && typeof d.hindernisseSetzen === 'function') d.hindernisseSetzen(st.hindernisse);
    if (sim.dynamik) R.Zufall.dynamikSetzen(st, sim.dynamik);
    this.ereignisse.push({ an: null, art: 'zufall', runde: ev.runde, n: ev.n, v: ev.v });
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
    // M4 (nur Motorrad-Räume, additiv): mo[i] = Motorrad-Zustand von Teilnehmer i (Sturz, Stunts, Unfall, Pose) – Format in server/PROTOKOLL.md
    if (this.moto) z.mo = this.moto.zustand();
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
    // v28 (W10, additiv): ti[k] = Tier-Platz k im Format von `a` (14 Zahlen; flags: 2 aktiv · 4 steht · 8 erschrocken; 0 = leer, hinten abgeschnitten). Fehlt, wenn Tiere aus sind.
    if (sim.tiere) z.ti = sim.tiere.zustandKodieren();
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
    // M4 (nur Motorrad-Räume, additiv): mu = [Motorrad %, Fahrer %, Haltebremse 0/1] des eigenen Fahrers (ungerundet) – die Vorhersage rechnet Tempo-Wirkung und Haltebremse wie der Server
    if (this.moto) { const mu = this.moto.ich(i); if (mu) erg.mu = mu; }
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
        fz.nicken, fz.index === undefined ? -1 : fz.index, fz.trampolin ? 1 : 0]; any = true;
    }
    if (fz && fz.kanone) { z.sp = 1; any = true; }      // S1: in der Kanone rechnet der Server allein (Anzeige folgt ihm)
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
      zufallSeed: this.zufallSeed === null ? undefined : this.zufallSeed,       // Z1 (additiv): Rennseed der Zufalls-Strecke (fehlt = feste Strecke)
      stationen: this.moto ? this.moto.stationenInfo() : undefined,        // M4: Bogenlänge der Werkstatt/Krankenstation (Gegenprobe im Browser)
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
        ...(this.moto ? { stunt: this.moto.punkte(t.nr) } : {}),       // M4: Stuntpunkte je Teilnehmer (nur Motorrad-Räume)
      })),
      ...(this.moto ? { stuntrennen: this.einstellungen.stuntrennen === true } : {}),
    };
  }
}

module.exports = { laden, ladenMoto, kontextLaden, Simulation, einstellungenPruefen, eigenRegistrieren, eigenPruefen, EIGEN_CODE_MAX, MODULE, MOTO_UNFALL };
