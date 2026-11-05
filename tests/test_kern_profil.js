// K1 – Spiel-Profil mit Erlaubt-Liste (src/kern/profil.js): node tests/test_kern_profil.js
//  A) Profil-Logik: Autorennen/Motorrad erlauben alles (bitgleich zu vorher), Radwelt nichts, unbekanntes Profil nichts, ohne Daten alles
//  B) Radwelt-Profil, ALLE Spaß-Dateien geladen (kompletter Autorennen-Ladesatz aus spiele.json, ohne Browser): nach den Strecken-Optionen von streckeSzeneBauen,
//     einstellungenPruefen, Server-einstellungenPruefen (Spaß, Zauber, Zufall, Tuning, Tricks, Loop-Magnet, Modi, Geist, Dino) ist NICHTS davon an
//  C) Autorennen-/Motorrad-Profil: dieselben Eingaben ergeben weiterhin „an“ (Standard an bleibt an)
//  D) Wächter: jeder im Quelltext abgefragte Profil-Name steht in R.Profil.NAMEN; jeder Name in NAMEN wird irgendwo abgefragt
'use strict';
const fs = require('fs');
const path = require('path');
const WURZEL = path.join(__dirname, '..');
let fehler = 0, ok = 0;
function pruefe(name, gut, info) { console.log((gut ? 'OK   ' : 'FEHL ') + name + (info !== undefined ? '  (' + info + ')' : '')); if (gut) ok++; else fehler++; }
setTimeout(() => { console.log('FEHL Wächter: Test hängt (> 120 s)'); process.exit(3); }, 120000).unref();

const spiele = JSON.parse(fs.readFileSync(path.join(WURZEL, 'spiele.json'), 'utf8')).spiele;

const { ladeSpiel: ladeSpielKern } = require('./kern_lader');
/** Kompletter Ladesatz eines Spiels (wie im Browser, mit Platzhalter-DOM) in einem eigenen vm-Kontext. flags = window.RADWELT / window.MOTORRAD */
const ladeSpiel = (id, flags) => ladeSpielKern(id, flags);

// ------------------------------------------------------------------ A) Logik
{
  const A = ladeSpiel('autorennen', {}), M = ladeSpiel('autorennen', { MOTORRAD: true }), RW = ladeSpiel('autorennen', { RADWELT: true });
  pruefe('A0 alle Module laden ohne Fehler (Autorennen/Motorrad/Radwelt-Profil)', !A.fehl.length && !M.fehl.length && !RW.fehl.length, [].concat(A.fehl, M.fehl, RW.fehl).join(' | '));
  const N = A.R.Profil.NAMEN;
  pruefe('A1 Profilnamen', A.R.Profil.name() === 'autorennen' && M.R.Profil.name() === 'motorrad' && RW.R.Profil.name() === 'radwelt', [A, M, RW].map((x) => x.R.Profil.name()).join(','));
  pruefe('A2 Autorennen erlaubt alles', N.every((n) => A.R.Profil.erlaubt(n)));
  pruefe('A3 Motorrad erlaubt alles', N.every((n) => M.R.Profil.erlaubt(n)));
  pruefe('A4 Radwelt erlaubt NICHTS (' + N.length + ' Schalter)', N.every((n) => !RW.R.Profil.erlaubt(n)) && !RW.R.Profil.erlaubt('irgendwas.neues'));
  // neue Funktion: einem Spiel nur gezielt freigeben – Radwelt mit Einzelfreigabe
  RW.R.ProfilDaten.radwelt = { erlaubt: ['regenbogenspur'] };
  pruefe('A5 Einzelfreigabe wirkt nur für den genannten Namen', RW.R.Profil.erlaubt('regenbogenspur') && !RW.R.Profil.erlaubt('spass') && !RW.R.Profil.erlaubt('dino'));
  RW.R.ProfilDaten.radwelt = { erlaubt: [] };
  RW.R.Profil.setzen('gibtEsNicht');
  pruefe('A6 unbekanntes Profil erlaubt nichts', N.every((n) => !RW.R.Profil.erlaubt(n)));
  RW.R.Profil.setzen(null);
  const ohne = RW.R.ProfilDaten; RW.R.ProfilDaten = undefined;
  pruefe('A7 ohne Profildaten (alte Testladung) ist alles erlaubt', N.every((n) => RW.R.Profil.erlaubt(n)));
  RW.R.ProfilDaten = ohne;
  const pd = JSON.parse(JSON.stringify(A.R.ProfilDaten));
  pruefe('A8 Profildaten = spiele.json', ['autorennen', 'motorrad', 'radwelt'].every((id) => JSON.stringify(pd[id].erlaubt) === JSON.stringify(spiele[id].profil.erlaubt)));
}

// ------------------------------------------------------------------ B/C) Wirkung an den Schaltern
const ALLES_AN = { spass: true, zauber: true, zufall: true, loopMag: true, geist: true, tuning: true, tricks: true, kiTricks: true, raumOnline: true };
function pruefeSpiel(id, flags, erwartetAn) {
  const L = ladeSpiel(id, flags), R = L.R, E = erwartetAn;
  const tag = (E ? 'C ' : 'B ') + R.Profil.name() + ': ';
  const daten = R.trackCatalog.find((t) => t.id === 'wiese');
  // Strecken-Optionen (streckeSzeneBauen)
  R.SpassZauber.erzwingen(false);
  // streckeSzeneBauen ECHT aufrufen: new R.Strecke wird abgefangen (Optionen merken, dann abbrechen) – so prüfen wir genau den Code des Spiels
  const fake = { _zufallSeed: 12345, zufallSeed: null, einstellungen: Object.assign({}, ALLES_AN) };
  const StreckeEcht = R.Strecke;
  let o = null;
  R.Strecke = Object.assign(function (d, opt) { o = opt; throw new Error('STOP-NACH-OPTIONEN'); }, { weltName: StreckeEcht.weltName });
  try { R.Spiel.prototype.streckeSzeneBauen.call(fake, 'wiese'); } catch (e) { if (!/STOP-NACH-OPTIONEN/.test(e.message)) throw e; } finally { R.Strecke = StreckeEcht; }
  pruefe(tag + 'streckeSzeneBauen erreicht new R.Strecke (Optionen abgefangen)', !!o);
  pruefe(tag + 'streckeSzeneBauen-Option: spass', (o.spass === true) === E, o.spass);
  pruefe(tag + 'streckeSzeneBauen-Option: zauber', (o.zauber === true) === E, o.zauber);
  pruefe(tag + 'streckeSzeneBauen-Option: loopingMagnet', (o.loopingMagnet === true) === E, o.loopingMagnet);
  pruefe(tag + 'streckeSzeneBauen-Option: zufall', (!!o.zufall) === E, JSON.stringify(o.zufall));
  // einstellungenPruefen (Menü/Speicher) + Standard
  const std = R.standardEinstellungen(), pr = R.einstellungenPruefen({ spass: true, zufall: true, geist: true });
  pruefe(tag + 'Standard-Einstellungen: spass/zufall/geist', [std.spass, std.zufall, std.geist].every((x) => x === E), [std.spass, std.zufall, std.geist].join(','));
  pruefe(tag + 'einstellungenPruefen: spass/zufall/geist', [pr.spass, pr.zufall, pr.geist].every((x) => x === E), [pr.spass, pr.zufall, pr.geist].join(','));
  // Schalter-Module
  const zufallOpt = (() => { const f = { _zufallSeed: 99, zufallSeed: null }; return R.ZufallSpiel.opt(f, daten); })();
  pruefe(tag + 'ZufallSpiel.opt', (!!zufallOpt) === E);
  pruefe(tag + 'Fahr-Zauber an()', R.SpassZauber.an() === E);
  pruefe(tag + 'Loop-Magnet (Speicher an)', (() => { R.SpassZauber.loopMagSetzen(true); const v = R.SpassZauber.loopMag(); R.SpassZauber.loopMagSetzen(false); return v === E; })());
  pruefe(tag + 'Tuning an()', R.SpassTuning.an() === E);
  pruefe(tag + 'Auto-Tricks / KI-Tricks / Zeitlupe', ['auto', 'ki', 'zeit'].every((a) => R.SpassTricks.an(a) === E), ['auto', 'ki', 'zeit'].map((a) => R.SpassTricks.an(a)).join(','));
  if (R.SpassZauberFigur) pruefe(tag + 'Haustier/Kostüm an()', R.SpassZauberFigur.an() === E);
  // Regenbogenspur und Dino: Speicher-Zustand „an“ erzwingen
  const W0 = R.SpassWeltenUI.einst(); W0.spur = true; W0.dino = 'immer';          // wie ein gespeicherter Menü-Zustand „an“
  const W = R.SpassWeltenUI.einst();
  pruefe(tag + 'Regenbogenspur / Dino-Begleiter', E ? (W.spur === true && W.dino === 'immer') : (W.spur === false && W.dino === 'aus'), 'spur=' + W.spur + ' dino=' + W.dino);
  // Menü: Modus-Karten (Kurz/Frei/K.-o./Arena)
  let html = '';
  try { html = String(R.Menue.prototype.htmlModus.call({ e: { spassModus: '' }, onlineGewaehlt: false, spiel: {} })); } catch (e) { html = 'FEHLER ' + e.message; }
  pruefe(tag + 'Menü: Spaß-Modus-Karten (s4-reihe)', (html.indexOf('s4-reihe') >= 0) === E, html.slice(0, 60));
  // Server-Einstellungen (R2-Modi, Geist, Dino) über den Kern der R2-Einstellungen
  const r2 = R.SpassR2;
  const roh = { streckeId: 'wiese', spass: true, zauber: true, zufall: true, geist: true, dino: 'immer', modus: 'kurz' };
  const e2 = r2.einstellungen({ spass: true, zauber: true }, roh, id === 'motorrad' ? 'motorrad' : 'auto', 1);
  pruefe(tag + 'R2-Einstellungen: Modus Kurz-Level', (e2.modus === 'kurz') === E, e2.modus);
  ['frei', 'ko'].forEach((m) => { const x = r2.einstellungen({}, { modus: m, geist: true, dino: 'dino' }, 'auto', 2); pruefe(tag + 'R2-Einstellungen: Modus ' + m, (x.modus === m) === E, x.modus); });
  const eg = r2.einstellungen({}, { geist: true, dino: 'immer' }, 'auto', 1);
  pruefe(tag + 'R2-Einstellungen: Geist/Dino im Raum', (eg.geist === true && eg.dino === 'immer') === E, eg.geist + '/' + eg.dino);
  L.R.Profil.setzen(null);
}
pruefeSpiel('autorennen', { RADWELT: true }, false);
pruefeSpiel('autorennen', {}, true);
pruefeSpiel('autorennen', { MOTORRAD: true }, true);

// ------------------------------------------------------------------ B2) Server-Einstellungen mit Radwelt-Profil
{
  const S = require('../server/simulation');
  const R = S.laden();
  const roh = { streckeId: 'wiese', spass: true, zauber: true, zufall: true, tuning: true, tricks: true, loopMag: true, geist: true, dino: 'immer' };
  R.Profil.setzen('radwelt');
  const e = S.einstellungenPruefen(roh, 2);
  const e2 = S.einstellungenPruefen(Object.assign({}, roh, { modus: 'frei' }), 2), e3 = S.einstellungenPruefen(Object.assign({}, roh, { modus: 'kurz' }), 1), e4 = S.einstellungenPruefen(Object.assign({}, roh, { modus: 'ko' }), 2);
  R.Profil.setzen(null);
  pruefe('B Server (Radwelt-Profil): spass/zauber/zufall/tuning aus', !e.spass && !e.zauber && !e.zufall && !e.tuning, [e.spass, e.zauber, e.zufall, e.tuning].join(','));
  pruefe('B Server (Radwelt-Profil): tricks/loopMag nicht gesetzt', e.tricks === undefined && e.loopMag === undefined);
  pruefe('B Server (Radwelt-Profil): Modus/Geist/Dino weg', (e.modus === undefined || e.modus === 'rennen') && !e.geist && !e.dino && !e2.modus && !e3.modus && !e4.modus);
  const n = S.einstellungenPruefen(roh, 2);
  pruefe('C Server (Autorennen-Profil): alles an wie bisher', n.spass === true && n.zauber === true && n.zufall === true && n.tuning === true && n.tricks === true && n.loopMag === true && n.geist === true && n.dino === 'immer', JSON.stringify([n.spass, n.zauber, n.zufall, n.tuning, n.tricks, n.loopMag, n.geist, n.dino]));
  const nm = S.einstellungenPruefen(Object.assign({}, roh, { modus: 'frei' }), 2), nk = S.einstellungenPruefen(Object.assign({}, roh, { modus: 'kurz' }), 1), nko = S.einstellungenPruefen(Object.assign({}, roh, { modus: 'ko' }), 2);
  pruefe('C Server (Autorennen-Profil): Modi Frei/Kurz/K.-o. wie bisher', nm.modus === 'frei' && nk.modus === 'kurz' && nko.modus === 'ko', [nm.modus, nk.modus, nko.modus].join(','));
  const m = (() => { const RM = S.ladenMoto(); return RM.Profil.name(); })();
  pruefe('C Server-Motorrad-Kontext: Profil motorrad', m === 'motorrad', m);
}

// ------------------------------------------------------------------ D) Wächter: Namen im Quelltext
{
  const L = ladeSpiel('autorennen', {});
  const NAMEN = L.R.Profil.NAMEN;
  const dateien = [];
  (function lauf(d) { for (const f of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, f.name); if (f.isDirectory()) { if (f.name !== 'node_modules') lauf(p); } else if (f.name.endsWith('.js')) dateien.push(p); } })(path.join(WURZEL, 'src'));
  dateien.push(path.join(WURZEL, 'server', 'simulation.js'));
  const benutzt = new Set(), unbekannt = [];
  for (const d of dateien) {
    if (d.endsWith('profil.js')) continue;
    const t = fs.readFileSync(d, 'utf8');
    const re = /(?:erlaubt|profilOk|\bP)\(\s*'([A-Za-z0-9_.]+)'\s*\)/g;
    let m;
    while ((m = re.exec(t))) { benutzt.add(m[1]); if (!NAMEN.includes(m[1])) unbekannt.push(path.relative(WURZEL, d) + ': ' + m[1]); }
    // Modus-Tabellen (MODUS_PROFIL)
    if (/R\.Profil|profilOk/.test(t)) NAMEN.forEach((n) => { if (t.indexOf("'" + n + "'") >= 0) benutzt.add(n); });      // Namen, die über Tabellen/Bedingungen abgefragt werden
    const tab = /MODUS_PROFIL\s*=\s*\{([^}]*)\}/.exec(t);
    if (tab) { const re2 = /'([A-Za-z]+)'/g; let k; while ((k = re2.exec(tab[1]))) { benutzt.add(k[1]); if (!NAMEN.includes(k[1])) unbekannt.push(path.relative(WURZEL, d) + ': ' + k[1]); } }
  }
  pruefe('D1 jeder abgefragte Profil-Name steht in R.Profil.NAMEN', !unbekannt.length, unbekannt.join(' | '));
  const unbenutzt = NAMEN.filter((n) => !benutzt.has(n));
  pruefe('D2 jeder Name in NAMEN hängt irgendwo im Quelltext', !unbenutzt.length, unbenutzt.join(','));
}

console.log(fehler ? '\n' + fehler + ' FEHL, ' + ok + ' OK' : '\nalle ' + ok + ' OK, 0 FEHL');
process.exit(fehler ? 1 : 0);
