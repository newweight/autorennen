// 15.10. (v24) Cabrio-Dach bei Regen: node tests/test_dach_regen.js [kurz]
// Prüft die Regeln aus src/cars/dachregel.js (config.dachRegen) – Spieler offline (derselbe physikSchritt wie im Browser, kopflos wie der Server),
// Schaden-System, KI-Cabrios, Megastrecke (Zonenwechsel), Online (Server-Zustand, Vorhersage = Server, Ende-zu-Ende per WebSocket), Determinismus.
//   A  reine Logik (R.DachRegel): Niederschlag, Geste nur im Stand, Klappzeit 3 s, Strafuhr 60 s, Faktoren, Anzeige
//   B  Spieler (Simulation = main.js physikSchritt): Strafe nach 60/120 s, keine Strafe mit zuem Dach, Klappen nur im Stand mit Gas-Sperre, Pause der Uhr,
//      trocken/Nebel/Sandsturm, Rennstart mit Regen (Schließen im Countdown), Meldungen
//   C  Schaden an: schaden.treffer 'nass' (−10 %), Wiederholung nach Abklingzeit
//   D  KI: Aufstellung (schließt im Countdown), plötzlicher Regen auf normaler Strecke (hält an einem erlaubten Ort am Rand, schließt, fährt weiter),
//      Megastrecke (mehrere Seeds, nie in Sperrzonen), Determinismus
//   E  Megastrecke: Zonenwechsel löst aus (nass/trocken/Nebel/Sandsturm je Position)
//   F  Online: zustand.dz / ich.dz, fk (Nässe-Schaden), Vorhersage = Server (Gas-Sperre, kein Ruckeln), Ende-zu-Ende über WebSocket
'use strict';
const path = require('path');
const { Simulation, kontextLaden, laden } = require('../server/simulation');
const kurz = process.argv.includes('kurz');

let fehler = 0, ok = 0;
function pruefe(name, gut, info) { console.log((gut ? 'OK   ' : 'FEHL ') + name + (info !== undefined ? '  (' + info + ')' : '')); if (gut) ok++; else fehler++; }
const R = laden();
const D = R.DachRegel, DT = R.config.physik.schritt, TICKS = (s) => Math.round(s / DT);

// ------------------------------------------------------------------ Hilfen
function neuSim(opt, spieler) {
  return new Simulation({
    einstellungen: Object.assign({ streckeId: 'wiese', runden: 9, gegner: 0, tageszeit: 'tag', jahreszeit: 'sommer', wetter: 'regen', windStaerke: 0, schwierigkeit: 'mittel' }, opt || {}),
    spieler: spieler || [{ fahrer: 'Jonas', auto: 'troc-cabrio', hilfe: 'aus' }], seed: 77 });
}
const meldungen = (sim) => sim.abholen().filter(e => e.art === 'meldung').map(e => e.text);
/** Bis das Rennen läuft (Countdown vorbei). */
function bisStart(sim) { for (let k = 0; k < 60 * 20 && !sim.sim.rennen.gasErlaubt; k++) sim.schritt(); return sim.sim.rennen.gasErlaubt; }
function lauf(sim, ticks, fn) { for (let k = 0; k < ticks; k++) { sim.schritt(); if (fn) fn(k); } }
const F0 = (sim) => sim.sim.fahrzeuge[0];
/** Auto an die Bogenlänge s stellen (Stand oder Tempo v). */
function setzeAn(sim, i, s, q, v) {
  const S = sim.sim, f = S.fahrzeuge[i], sp = S.strecke.spline, p = sp.punktBei(s);
  f.vehicle.setzen(p.x + p.nx * (q || 0), p.z + p.nz * (q || 0), R.headingAus(p.tx, p.tz));
  f.vehicle.vLaengs = v || 0; f.vehicle.vQuer = 0; f.vehicle.y = S.strecke.hoeheAn(f.vehicle.x, f.vehicle.z); f.index = -1; f.vehicle._megaIdx = undefined;
}

// ------------------------------------------------------------------ A) reine Logik
{
  const katalog = R.carCatalog.waehlbare();
  const mit = katalog.filter(a => D.hat(a)).map(a => a.id);
  pruefe('A1 nur der T-Roc Cabrio hat ein Verdeck (Formel ist offen, hat aber kein Dach zum Schließen)', mit.length === 1 && mit[0] === 'troc-cabrio', mit.join(','));
  pruefe('A2 Niederschlag = Regen, Schnee, Hagel (wie die Scheibenwischer); Nebel, Sandsturm, klar nicht',
    ['regen', 'schnee', 'hagel'].every(a => D.nass(a)) && ['nebel', 'sandsturm', 'klar', null, undefined].every(a => !D.nass(a)));
  pruefe('A2b entspricht R.wischer.art', ['regen', 'schnee', 'hagel', 'nebel', 'sandsturm', 'klar'].every(a => !!D.nass(a) === !!(a === 'regen' || a === 'schnee' || a === 'hagel')));
  const troc = katalog.find(a => a.id === 'troc-cabrio');
  const z0 = D.neu(troc);
  pruefe('A3 neu: offen, nichts klappt, Uhr 60 s, Gesundheit 100', z0 && z0.ziel === 0 && z0.rest === 0 && z0.uhr === 60 && z0.gesund === 100);
  pruefe('A3b Auto mit optionen.dach "zu" startet geschlossen', D.neu(Object.assign({}, troc, { optionen: { dach: 'zu', lack: 'blau' } })).ziel === 1);
  pruefe('A3c Auto ohne Verdeck: kein Zustand', D.neu(katalog.find(a => a.id === 'passat')) === null && D.neu(katalog.find(a => a.id === 'formel')) === null);
  // Geste
  let z = D.neu(troc);
  pruefe('A4 Geste in Fahrt (≥ 0,5 m/s) wirkt nicht', D.geste(z, 0.5) === false && D.geste(z, -3) === false && z.rest === 0 && z.ziel === 0);
  pruefe('A4b Geste im Stand: Klappen beginnt (ziel zu, rest 3 s)', D.geste(z, 0.2) === true && z.ziel === 1 && z.rest === 3);
  pruefe('A4c während des Klappens wirkt eine zweite Geste nicht', D.geste(z, 0) === false && z.ziel === 1);
  let n = 0; while (z.rest > 0 && n < 1000) { D.schritt(z, DT, false, true); n++; }
  pruefe('A5 Klappzeit = genau 3 s (180 Schritte)', n === 180 && z.rest === 0 && z.ziel === 1, n);
  pruefe('A5b danach wieder umschaltbar (zu → offen)', D.geste(z, 0) && z.ziel === 0);
  // Strafuhr
  z = D.neu(troc);
  let strafen = 0, erst = null;
  for (let k = 1; k <= TICKS(130); k++) { D.schritt(z, DT, true, true); if (z.faellig) { strafen++; if (erst === null) erst = k; D.strafeAnwenden(z); } }
  pruefe('A6 nass + offen + läuft: Strafe alle 60 s (nach 60 s und 120 s, nicht davor)', strafen === 2 && Math.abs(erst - TICKS(60)) <= 1, strafen + ' × ersteBei ' + erst);
  pruefe('A6b −10 % je Strafe → Gesundheit 80', z.gesund === 80, z.gesund);
  z = D.neu(troc); z.gesund = 15;
  D.strafeAnwenden(z); D.strafeAnwenden(z);
  pruefe('A6c Gesundheit nie unter mindestGesund (10 %)', z.gesund === 10, z.gesund);
  z = D.neu(troc);
  for (let k = 0; k < TICKS(200); k++) D.schritt(z, DT, true, false);
  pruefe('A7 Countdown (läuft = false): Uhr steht, keine Strafe', z.uhr === 60 && !z.faellig && z.strafen === 0);
  z = D.neu(troc);
  for (let k = 0; k < TICKS(200); k++) D.schritt(z, DT, false, true);
  pruefe('A7b trocken: keine Strafe', z.strafen === 0 && z.uhr === 60);
  z = D.neu(Object.assign({}, troc, { optionen: { dach: 'zu' } }));
  for (let k = 0; k < TICKS(200); k++) D.schritt(z, DT, true, true);
  pruefe('A7c Dach zu: keine Strafe', z.strafen === 0 && z.uhr === 60);
  z = D.neu(troc);
  for (let k = 0; k < TICKS(30); k++) D.schritt(z, DT, true, true);
  const uhr30 = z.uhr; D.geste(z, 0);
  for (let k = 0; k < TICKS(2); k++) D.schritt(z, DT, true, true);
  pruefe('A8 beim Klappen pausiert die Uhr (kein Schaden während des Schließens)', Math.abs(z.uhr - uhr30) < 1e-9 && z.strafen === 0, z.uhr.toFixed(3));
  for (let k = 0; k < TICKS(2); k++) D.schritt(z, DT, true, true);
  pruefe('A8b nach dem Schließen: Uhr wieder 60 s', z.ziel === 1 && z.rest === 0 && z.uhr === 60);
  z = D.neu(troc); for (let k = 0; k < TICKS(20); k++) D.schritt(z, DT, true, true);
  const u20 = z.uhr; for (let k = 0; k < 5; k++) D.schritt(z, DT, false, true);
  pruefe('A8c trocken: Uhr springt auf 60 s zurück (60-s-Uhr startet beim Nasswerden neu)', u20 < 41 && z.uhr === 60);
  // Ereignisse
  z = D.neu(troc); const evs = [];
  for (let k = 0; k < 3; k++) { const e = D.schritt(z, DT, k > 0, true); if (e) evs.push(e); }
  pruefe('A9 Ereignis „nass“ beim Nasswerden mit offenem Dach', evs.join() === 'nass', evs.join());
  z = D.neu(troc); D.geste(z, 0); const ev2 = []; for (let k = 0; k < 200; k++) { const e = D.schritt(z, DT, true, true); if (e) ev2.push(e); }
  pruefe('A9b Ereignis „zu“ nach dem Schließen', ev2.join() === 'zu', ev2.join());
  // Faktoren
  z = D.neu(troc); z.gesund = 70;
  pruefe('A10 Faktoren wie Schadensstufen (70 % → Stufe 1: vMax −4 %, Beschleunigung −6 %)', Math.abs(D.faktoren(z).vMax - 0.96) < 1e-12 && Math.abs(D.faktoren(z).beschleunigung - 0.94) < 1e-12);
  z.gesund = 100; pruefe('A10b 100 % → Faktor 1', D.faktoren(z).vMax === 1 && D.faktoren(z).beschleunigung === 1);
  // Anzeige
  z = D.neu(troc);
  pruefe('A11 Anzeige: trocken → nichts', D.anzeige(z, true, 0) === null);
  D.schritt(z, DT, true, false);
  pruefe('A11b Countdown + nass + offen: Hinweis mit Taste', /Regen.*↑\+↓/.test(D.anzeige(z, false, 0).text) && /W\+S/.test(D.anzeige(z, false, 1).text), D.anzeige(z, false, 0).text);
  for (let k = 0; k < TICKS(15); k++) D.schritt(z, DT, true, true);
  pruefe('A11c im Rennen: „Dach zu! noch 45 s“', /Dach zu! noch 45 s/.test(D.anzeige(z, true, 0).text), D.anzeige(z, true, 0).text);
  D.geste(z, 0);
  pruefe('A11d beim Klappen: „Dach schließt … 3“', /Dach schließt … 3/.test(D.anzeige(z, true, 0).text), D.anzeige(z, true, 0).text);
}

// ------------------------------------------------------------------ B) Spieler (Simulation)
{
  // B1 Strafe nach 60 s / 120 s
  let sim = neuSim();
  const wetterOk = sim.sim.wetter.wetterArt === 'regen';
  pruefe('B0 Regen-Rennen: Wetter regen', wetterOk, sim.sim.wetter.wetterArt);
  bisStart(sim); const f = F0(sim);
  lauf(sim, 1);
  pruefe('B1 Auto mit Verdeck hat Zustand (offen), nass erkannt', f.dachL && f.dachL.ziel === 0 && f.dachL.nass === true);
  const t0 = sim.tick; sim.abholen();
  let g59 = null, g61 = null, g119 = null, g121 = null, texte = [];
  lauf(sim, TICKS(121), (k) => {
    const t = k + 1;
    if (t === TICKS(59)) g59 = f.dachL.gesund; if (t === TICKS(61)) g61 = f.dachL.gesund;
    if (t === TICKS(119)) g119 = f.dachL.gesund; if (t === TICKS(121)) g121 = f.dachL.gesund;
    if (t % 30 === 0) texte = texte.concat(meldungen(sim));
  });
  pruefe('B1 Strafe: bei 59 s noch 100 %, bei 61 s 90 %', g59 === 100 && g61 === 90, g59 + ' → ' + g61);
  pruefe('B1b zweite Strafe: bei 119 s 90 %, bei 121 s 80 %', g119 === 90 && g121 === 80, g119 + ' → ' + g121);
  pruefe('B1c Meldung „💧 Nass! −10 %“', texte.filter(t => t === '💧 Nass! −10 %').length === 2, texte.join(' | '));
  // Wirkung auf die Fahrwerte (Schaden aus): 80 % = Stufe 1 → ich.fk
  const ich = sim.ich(0);
  pruefe('B1d 80 % = Stufe 1 → Höchsttempo −4 %, Beschleunigung −6 % (ich.fk)', Math.abs(ich.fk[0] - 0.96) < 1e-9 && Math.abs(ich.fk[1] - 0.94) < 1e-9, ich.fk.join(','));
  pruefe('B1e Server meldet das Dach in ich.dz [ziel, rest, nass, uhr, gesund]', Array.isArray(ich.dz) && ich.dz.length === 5 && ich.dz[0] === 0 && ich.dz[2] === 1 && ich.dz[4] === 80, JSON.stringify(ich.dz));
  // Tempo wirklich geringer
  const vMax = (gesund) => { const s2 = neuSim({ wetter: 'klar' }); bisStart(s2); const g = F0(s2); g.dachL.gesund = gesund; s2.eingabeSetzen(0, { gas: 1, bremse: 0, lenkung: 0 });
    let m = 0; lauf(s2, TICKS(4), () => { m = Math.max(m, g.vehicle.vLaengs); }); return m; };
  const v100 = vMax(100), v60 = vMax(60);
  pruefe('B1f Nässe-Schaden wirkt auf die Beschleunigung (nach 4 s mit 60 % langsamer als mit 100 %)', v60 < v100 - 0.3, v60.toFixed(2) + ' < ' + v100.toFixed(2));

  // B2 Dach zu → keine Strafe
  sim = neuSim(); bisStart(sim); const f2 = F0(sim);
  lauf(sim, 1); sim.dachGeste(0);
  lauf(sim, TICKS(135));
  pruefe('B2 Dach zu: nach 135 s keine Strafe (100 %), Dach zu', f2.dachL.gesund === 100 && f2.dachL.ziel === 1 && f2.dachL.strafen === 0, `${f2.dachL.gesund} %, ziel ${f2.dachL.ziel}`);

  // B3 Klappen nur im Stand, Gas gesperrt
  sim = neuSim(); bisStart(sim); const f3 = F0(sim);
  sim.eingabeSetzen(0, { gas: 1, bremse: 0, lenkung: 0 });
  lauf(sim, TICKS(0.5)); const vor = f3.vehicle.vLaengs;
  sim.dachGeste(0); lauf(sim, 1);
  pruefe('B3 in Fahrt (> 0,5 m/s) wird die Geste ignoriert', vor > 0.5 && f3.dachL.rest === 0 && f3.dachL.ziel === 0, 'v ' + vor.toFixed(2));
  sim.eingabeSetzen(0, { gas: 0, bremse: 1, lenkung: 0 }); lauf(sim, TICKS(1.2));
  f3.vehicle.vLaengs = 0; sim.eingabeSetzen(0, { gas: 0, bremse: 0, lenkung: 0 }); lauf(sim, 3);    // (Bremse im Stand würde rückwärts fahren – das Auto steht jetzt)
  const xStand = f3.vehicle.x, zStand = f3.vehicle.z;
  pruefe('B3b Auto steht (nach Bremsen)', Math.abs(f3.vehicle.vLaengs) < 0.5, f3.vehicle.vLaengs.toFixed(2));
  sim.eingabeSetzen(0, { gas: 1, bremse: 0, lenkung: 0 });          // Gas voll gedrückt, während das Dach klappt
  sim.dachGeste(0); lauf(sim, 1);
  pruefe('B3c Geste im Stand: Klappen beginnt (rest ≈ 3 s)', f3.dachL.rest > 2.9 && f3.dachL.ziel === 1, f3.dachL.rest.toFixed(2));
  let vMaxKlapp = 0, lock = 0;
  lauf(sim, TICKS(2.9), () => { vMaxKlapp = Math.max(vMaxKlapp, Math.abs(f3.vehicle.vLaengs)); if (f3.dachL.rest > 0) lock++; });
  const bew = Math.hypot(f3.vehicle.x - xStand, f3.vehicle.z - zStand);
  pruefe('B3d während des Klappens: Gas gesperrt, das Auto bleibt stehen (Weg < 0,3 m, Tempo < 0,5)', bew < 0.3 && vMaxKlapp < 0.5, `${bew.toFixed(3)} m, ${vMaxKlapp.toFixed(2)} m/s`);
  lauf(sim, TICKS(0.4) + 2);
  pruefe('B3e Dach fertig (rest 0, zu) und Losfahren möglich (Gas wirkt wieder)', f3.dachL.rest === 0 && f3.dachL.ziel === 1 && f3.vehicle.vLaengs > 0.5, f3.vehicle.vLaengs.toFixed(2));
  lauf(sim, TICKS(3));
  pruefe('B3f „Losfahren bricht nicht ab, sondern wird verhindert“: nach 3 s Gas ≥ 3 m/s', f3.vehicle.vLaengs > 3, f3.vehicle.vLaengs.toFixed(1));

  // B4 Uhr pausiert beim Schließen: Geste bei 58 s
  sim = neuSim(); bisStart(sim); const f4 = F0(sim);
  lauf(sim, TICKS(58)); sim.dachGeste(0);
  lauf(sim, TICKS(10));
  pruefe('B4 Schließen bei 58 s (kurz vor der Strafe): kein Schaden, Uhr zurück auf 60 s', f4.dachL.gesund === 100 && f4.dachL.strafen === 0 && f4.dachL.uhr === 60 && f4.dachL.ziel === 1, `${f4.dachL.gesund} %, uhr ${f4.dachL.uhr}`);
  // B4b wieder öffnen im Regen → Uhr startet neu
  sim.dachGeste(0); lauf(sim, TICKS(3.2) + 2); const uOffen = f4.dachL.uhr;
  lauf(sim, TICKS(10));
  pruefe('B4b Dach im Regen wieder geöffnet (erlaubt): Uhr läuft von 60 s los', f4.dachL.ziel === 0 && f4.dachL.uhr < uOffen && f4.dachL.uhr > 49, f4.dachL.uhr.toFixed(1));

  // B5 trocken: Öffnen/Schließen erlaubt, keine Wirkung auf die Uhr
  sim = neuSim({ wetter: 'klar' }); bisStart(sim); const f5 = F0(sim);
  lauf(sim, TICKS(70));
  pruefe('B5 trockenes Wetter: nichts passiert (nass false, 100 %)', f5.dachL.nass === false && f5.dachL.gesund === 100 && f5.dachL.strafen === 0);
  sim.dachGeste(0); lauf(sim, TICKS(3.3)); const zuTrocken = f5.dachL.ziel;
  sim.dachGeste(0); lauf(sim, TICKS(3.3));
  pruefe('B5b bei trockenem Wetter zu und wieder auf (optional, keine Pflicht)', zuTrocken === 1 && f5.dachL.ziel === 0 && f5.dachL.rest === 0);

  // B6 Rennstart mit Regen: Hinweis in der Aufstellung, im Countdown schließen
  sim = neuSim(); const f6 = F0(sim); sim.schritt();
  const t6 = meldungen(sim);
  pruefe('B6 Hinweis schon in der Startaufstellung (Meldung bei Tick 1: Regen, Dach zu, Tasten)', t6.some(t => /Regen! Dach zu: ↑\+↓ im Stand/.test(t)), t6.join(' | '));
  pruefe('B6b Countdown läuft noch, Uhr steht', !sim.sim.rennen.gasErlaubt && f6.dachL.uhr === 60);
  sim.dachGeste(0); lauf(sim, TICKS(1));
  pruefe('B6c im Countdown darf man schon schließen', f6.dachL.ziel === 1 && f6.dachL.rest > 0 && !sim.sim.rennen.gasErlaubt);
  lauf(sim, TICKS(20), null); lauf(sim, TICKS(70));
  pruefe('B6d Rennstart mit geschlossenem Dach: keine Strafe', f6.dachL.gesund === 100 && f6.dachL.strafen === 0);
  // B6e Start mit Regen und offenem Dach: Uhr beginnt erst mit dem Rennen
  sim = neuSim(); const f6b = F0(sim); const mit = [];
  lauf(sim, TICKS(2.5)); mit.push(f6b.dachL.uhr);
  bisStart(sim); lauf(sim, TICKS(10));
  pruefe('B6e Strafuhr startet erst mit dem Rennstart (Countdown 60,0; 10 s später < 51 s)', mit[0] === 60 && f6b.dachL.uhr < 51 && f6b.dachL.uhr > 49, f6b.dachL.uhr.toFixed(1));

  // B7 Wetterarten
  const art = (wetter, jz, thema) => new R.Wetter(null, { jahreszeit: jz, wetter, wind: { staerke: 0, richtung: 0 }, thema, seed: 1 });
  const proben = [['regen', 'herbst', 'wiese', true], ['schnee', 'winter', 'wiese', true], ['hagel', 'winter', 'wiese', true], ['nebel', 'herbst', 'wiese', false],
    ['sandsturm', 'sommer', 'wueste', false], ['klar', 'sommer', 'wiese', false]];
  const erg = proben.map(([w, jz, th, soll]) => { const wt = art(w, jz, th); return [wt.wetterArt, wt.nass({ x: 0, z: 0 }), soll]; });
  pruefe('B7 Wetter.nass: Regen/Schnee/Hagel ja, Nebel/Sandsturm/klar nein', erg.every(e => e[1] === e[2]), erg.map(e => e[0] + ':' + e[1]).join(' '));
  // B8 kein Cabrio: Passat bekommt nichts
  const sp = neuSim({}, [{ fahrer: 'Jonas', auto: 'passat', hilfe: 'aus' }]); bisStart(sp); lauf(sp, TICKS(70));
  pruefe('B8 Auto ohne Verdeck (Passat): kein Dach-Zustand, ich.dz fehlt, zustand.dz fehlt', F0(sp).dachL === null && sp.ich(0).dz === undefined && sp.zustand().dz === undefined);
  // B9 Regel aus: config.dachRegen.an = false → alter Zustand
  R.config.dachRegen.an = false;
  const aus = neuSim(); bisStart(aus); lauf(aus, TICKS(70));
  pruefe('B9 config.dachRegen.an = false: keine Regel (kein Zustand)', F0(aus).dachL === null);
  R.config.dachRegen.an = true;
}

// ------------------------------------------------------------------ C) Schaden an
{
  const sim = neuSim(); const S = sim.sim;
  S.schaden = new R.Schaden(S.fahrzeuge, { an: true });
  bisStart(sim); const f = F0(sim);
  lauf(sim, TICKS(59)); const v59 = S.schaden.zustand(0).prozent;
  lauf(sim, TICKS(2)); const v61 = S.schaden.zustand(0).prozent;
  pruefe('C1 Schaden an: nach 60 s −10 % im Schadensystem (100 → 90)', v59 === 100 && v61 === 90, v59 + ' → ' + v61);
  pruefe('C1b eigener Wert bleibt 100 (nicht doppelt)', f.dachL.gesund === 100);
  const txt = meldungen(sim);
  pruefe('C1c Meldung „💧 Nass! −10 %“', txt.indexOf('💧 Nass! −10 %') >= 0, txt.join('|'));
  // Treffer kurz vor der Strafe: Abklingzeit → Wiederholung
  const sim2 = neuSim(); const S2 = sim2.sim; S2.schaden = new R.Schaden(S2.fahrzeuge, { an: true });
  bisStart(sim2); lauf(sim2, TICKS(59.9));
  S2.schaden.treffer(0, 'bande', 9);                                  // −3 %, Abklingzeit 0,7 s
  lauf(sim2, TICKS(2));
  const p2 = S2.schaden.zustand(0).prozent;
  pruefe('C2 Strafe fällt in die Abklingzeit eines anderen Treffers: wird kurz danach angewendet (100 − 3 − 10 = 87 %)', p2 === 87, p2);
  // liegengeblieben: Uhr läuft normal weiter, nichts mehr abzuziehen
  const sim3 = neuSim(); const S3 = sim3.sim; S3.schaden = new R.Schaden(S3.fahrzeuge, { an: true });
  bisStart(sim3); lauf(sim3, TICKS(30)); S3.schaden._punkteSetzen(0, 5); S3.schaden.treffer(0, 'brand', 9);   // → 0 % liegengeblieben
  lauf(sim3, TICKS(31));
  pruefe('C3 liegengeblieben: Uhr läuft normal weiter (1 Strafe nach 60 s gezählt), nichts hängt, Abschleppwagen-Ablauf normal', F0(sim3).dachL.strafen === 1 && !F0(sim3).dachL.faellig, F0(sim3).dachL.strafen + ' Strafe(n), ' + S3.schaden.zustand(0).prozent + ' %');
}

// ------------------------------------------------------------------ D) KI
{
  // D1 Aufstellung: KI-Cabrio mit offenem Dach schließt im Countdown und startet pünktlich
  const sim = neuSim({ gegner: 6 }, [{ fahrer: 'Jonas', auto: 'passat', hilfe: 'aus' }]); const S = sim.sim;
  sim.schritt();
  const cab = S.fahrzeuge.map((f, i) => (f.dachL ? i : -1)).filter(i => i >= 0);
  const offen = cab.filter(i => S.fahrzeuge[i].auto.optionen && S.fahrzeuge[i].auto.optionen.dach === 'offen'), zu = cab.filter(i => !offen.includes(i));
  pruefe('D1 Gegnerfeld enthält ein offenes und ein geschlossenes T-Roc-Cabrio (Seed)', offen.length >= 1 && zu.length >= 1, 'offen ' + offen + ' zu ' + zu);
  sim.eingabeSetzen(0, { gas: 1, bremse: 0, lenkung: 0 });
  let zuBeiStart = null, bewegt = [];
  for (let k = 0; k < 60 * 12; k++) {
    sim.schritt();
    if (S.rennen.gasErlaubt && zuBeiStart === null) zuBeiStart = offen.map(i => S.fahrzeuge[i].dachL.ziel + '/' + S.fahrzeuge[i].dachL.rest.toFixed(2)).join(',');
    if (S.rennen.zustand === 'laeuft' && k > 60 * 9) { bewegt = cab.map(i => S.fahrzeuge[i].vehicle.vLaengs); }
  }
  pruefe('D1b offenes KI-Cabrio hat im Countdown geschlossen (zu, fertig, spätestens beim Start)', offen.every(i => S.fahrzeuge[i].dachL.ziel === 1) && /^1\/0\.00/.test(zuBeiStart), zuBeiStart);
  pruefe('D1c alle KI-Cabrios fahren nach dem Start (> 5 m/s) – das offene hält nicht ewig', bewegt.every(v => v > 5), bewegt.map(v => v.toFixed(0)).join(','));
  pruefe('D1d das geschlossene KI-Cabrio hielt nie an (Strafe 0)', zu.every(i => S.fahrzeuge[i].dachL.strafen === 0 && S.fahrzeuge[i].dachKi.sStop === null));
}
function kiMitten(streckeId, seed, regenAb, maxS, bez) {
  // Normale Strecke, Wetter klar → bei regenAb s „plötzlich Regen“ (wetterArt umgestellt, die Strecke hat ein festes Wetter pro Rennen)
  const sim = new Simulation({ einstellungen: { streckeId, runden: 9, gegner: 7, tageszeit: 'tag', jahreszeit: 'sommer', wetter: 'klar', windStaerke: 0, schwierigkeit: 'mittel' },
    spieler: [{ fahrer: 'Jonas', auto: 'passat', hilfe: 'aus' }], seed });
  const S = sim.sim, st = S.strecke; sim.schritt();
  const cab = S.fahrzeuge.map((f, i) => (f.dachL ? i : -1)).filter(i => i >= 0);
  cab.forEach(i => { S.fahrzeuge[i].dachL.ziel = 0; });
  sim.eingabeSetzen(0, { gas: 1, bremse: 0, lenkung: 0 });
  const stopps = {}; const halte = [];
  let schlecht = [], resets0 = cab.map(i => S.fahrzeuge[i].netReset || 0), unbewegt = {};
  for (let k = 0; k < TICKS(maxS); k++) {
    if (k === TICKS(regenAb)) S.wetter.wetterArt = 'regen';
    sim.schritt();
    cab.forEach((i) => {
      const f = S.fahrzeuge[i], d = f.dachL, n = f.nah, still = Math.abs(f.vehicle.vLaengs) < 0.5;
      if (d.rest > 0 && d.ziel === 1 && !stopps[i + 'k' + d.rest.toFixed(2)] && d.rest > 2.99 && k > TICKS(regenAb)) {
        halte.push({ i, s: n.s, q: n.seitenabstand, ok: D.stoppOk(st, n.s), t: k * DT });
      }
    });
  }
  const klein = cab.map(i => S.fahrzeuge[i].dachL);
  const zuErgebnis = cab.every(i => S.fahrzeuge[i].dachL.ziel === 1);
  const resets = cab.some((i, j) => (S.fahrzeuge[i].netReset || 0) !== resets0[j]);
  pruefe(bez + ' alle KI-Cabrios haben angehalten und das Dach geschlossen (' + cab.length + ')', zuErgebnis && halte.length === cab.length, 'Halte ' + halte.length + '/' + cab.length);
  pruefe(bez + ' Haltepunkte nie in Sperrzonen (Tunnel/Brücke/Überführung/Kreuzung/Looping/Schanze/Gabelung/Start-Ziel/enge Spur)', halte.every(h => h.ok), halte.map(h => h.s.toFixed(0) + (h.ok ? '' : '!')).join(' '));
  pruefe(bez + ' am Rand bzw. aus der Fahrlinie (|Seitenabstand| ≥ ' + (/alpen/i.test(bez) ? '0,8' : '1,5') + ' m, innerhalb der Straße; Alpen: kurvig, Auto schafft den Rand nicht immer)', halte.every(h => Math.abs(h.q) >= (/alpen/i.test(bez) ? 0.8 : 1.5) && Math.abs(h.q) < st.breiteBei(h.s) / 2), halte.map(h => h.q.toFixed(1)).join(' '));
  pruefe(bez + ' ohne Strafe, ohne Reset', klein.every(d => d.strafen === 0) && !resets, klein.map(d => d.gesund + '%').join(' '));
  // weiterfahren
  const weiter = cab.map(i => S.fahrzeuge[i].vehicle.vLaengs);
  pruefe(bez + ' danach fahren sie weiter (> 5 m/s am Ende)', weiter.every(v => v > 5), weiter.map(v => v.toFixed(0)).join(','));
  return halte;
}
if (!kurz) {
  kiMitten('wiese', 77, 25, 130, 'D2 wiese:');
  kiMitten('fantasie', 77, 40, 160, 'D3 fantasie (Looping, Kreuzung, Schanze):');
  kiMitten('alpen', 5, 30, 150, 'D4 alpen (Überführung, Tunnel):');
}

// ------------------------------------------------------------------ E) Megastrecke: Zone entscheidet
{
  const sim = neuSim({ streckeId: 'mega', wetter: 'klar' }); const S = sim.sim, st = S.strecke, Z = S.wetter.zonen;
  const art = (z) => R.Mega.erscheinung(z).art;
  const finde = (pred) => Z.find(pred);
  const nassZ = finde(z => ['regen', 'schnee', 'hagel'].includes(art(z))), trockenZ = finde(z => !art(z) && z.wetter === 'klar'),
    nebelZ = finde(z => z.wetter === 'nebel'), sandZ = finde(z => z.wetter === 'sandsturm');
  pruefe('E0 Megastrecke hat nasse, trockene, Nebel- und Sandsturm-Zonen (Seed 77)', !!(nassZ && trockenZ && nebelZ && sandZ), [nassZ, trockenZ, nebelZ, sandZ].map(z => z && z.wetter).join(','));
  bisStart(sim); const f = F0(sim);
  const mitte = (z) => (z.s0 + z.s1) / 2;
  const lauf2 = (z, sek) => { setzeAn(sim, 0, mitte(z), 0, 0); f.dachL.uhr = 60; f.dachL.nass = false; f.dachL.strafen = 0; f.dachL.gesund = 100; f.dachL.ziel = 0; lauf(sim, TICKS(sek)); return { nass: f.dachL.nass, strafen: f.dachL.strafen, uhr: f.dachL.uhr }; };
  const eN = lauf2(nassZ, 61.5), eT = lauf2(trockenZ, 61.5), eNe = lauf2(nebelZ, 61.5), eS = lauf2(sandZ, 61.5);
  pruefe('E1 nasse Zone (' + nassZ.wetter + '): Nässe erkannt, nach 60 s Strafe', eN.nass && eN.strafen === 1, JSON.stringify(eN));
  pruefe('E2 trockene Zone: keine Nässe, keine Strafe', !eT.nass && eT.strafen === 0, JSON.stringify(eT));
  pruefe('E3 Nebel-Zone: kein Niederschlag, keine Strafe', !eNe.nass && eNe.strafen === 0, JSON.stringify(eNe));
  pruefe('E4 Sandsturm-Zone: kein Niederschlag, keine Strafe', !eS.nass && eS.strafen === 0, JSON.stringify(eS));
  // Zonenwechsel trocken → nass löst aus, nass → trocken stoppt die Uhr
  setzeAn(sim, 0, nassZ.s0 - 60, 0, 0); f.dachL.nass = false; f.dachL.strafen = 0; f.dachL.uhr = 60; f.dachL.ziel = 0;
  const vor = (() => { const z = Z[Z.indexOf(nassZ) - 1]; return !z || !D.nass(art(z)); })();
  lauf(sim, TICKS(1)); const vorNass = f.dachL.nass;
  setzeAn(sim, 0, nassZ.s0 + 60, 0, 0); lauf(sim, TICKS(1)); const nachNass = f.dachL.nass;
  pruefe('E5 Zonenwechsel: vor der Zone trocken, in der Zone nass' + (vor ? '' : ' (Vorgänger-Zone auch nass – Test unscharf)'), (vor ? !vorNass : true) && nachNass, vorNass + ' → ' + nachNass);
  // Rundenschluss: Zonen sind eine reine Funktion der Position (Server und Browser gleich)
  const a = R.Mega.zonen(77), b = R.Mega.zonen(77);
  pruefe('E6 Zonen deterministisch (gleicher Seed → gleiche Verteilung)', JSON.stringify(a) === JSON.stringify(b));
}

// ------------------------------------------------------------------ F) Online: Server-Zustand, Vorhersage = Server, WebSocket
const C = kontextLaden(['vendor/three.min.js', 'src/config.js', 'src/physics/vehicle.js', 'src/physics/collisions.js', 'src/cars/carCatalog.js', 'src/cars/dachregel.js',
  'src/track/spline.js', 'src/track/trackCatalog.js', 'src/track/trackBuilder.js', 'src/track/looping.js', 'src/track/schanze.js', 'src/track/anlauf.js',
  'src/world/themes.js', 'src/world/schilder.js', 'src/world/wetter.js', 'src/world/kleber.js', 'src/world/polizei.js', 'src/net/protokoll.js', 'src/net/vorhersage.js']);
function clientStrecke(e) {
  const daten = C.trackCatalog.find(t => t.id === e.streckeId);
  const st = new C.Strecke(daten, { welt: C.Strecke.weltName(daten, e.welt), variante: e.variante, hindernisMenge: e.hindernisMenge });
  const w = new C.Wetter(null, { jahreszeit: e.jahreszeit, wetter: e.wetter, wind: { staerke: e.windStaerke, richtung: e.windRichtung }, thema: daten.thema, seed: 1, strecke: st, tageszeit: e.tageszeit });
  C.Kurvenschilder.einbauen(st, e.tempoKlasse);
  C.Kollisionen.pflanzenSammeln(st, C.themes.dekoBauen(daten.thema, st, w.jahreszeit));
  C.Kollisionen.wracksEinbauen(st);
  return { st, w };
}
{
  // F1 Zustand: dz für alle Cabrios, ich.dz für den eigenen
  const sim = neuSim({ gegner: 6 }, [{ fahrer: 'Jonas', auto: 'troc-cabrio', hilfe: 'aus' }]);
  sim.schritt(); const z = sim.zustand();
  const nCab = sim.sim.fahrzeuge.filter(f => f.dachL).length;
  pruefe('F1 zustand.dz: ein Eintrag je Cabrio [Nr, ziel, Rest]', Array.isArray(z.dz) && z.dz.length === nCab && z.dz.every(e => e.length === 3), JSON.stringify(z.dz));
  pruefe('F1b Eintrag des Spielers: offen (0), rest 0', z.dz.find(e => e[0] === 0)[1] === 0);
  // F2 Vorhersage = Server (Gas-Sperre beim Klappen, kein Ruckeln)
  const s2 = neuSim({ gegner: 0 }); const e = s2.startInfo().einstellungen, { st, w } = clientStrecke(e);
  const auto = C.carCatalog.waehlbare().find(a => a.id === 'troc-cabrio');
  const V = new C.NetzVorhersage({ strecke: st, auto, tempoKlasse: e.tempoKlasse, fahrhilfe: 'aus', umwelt: () => w.umwelt() });
  pruefe('F2 Vorhersage kennt das Dach (dz)', !!V.dz && V.dz.ziel === 0);
  const N = C.Netz;
  const F = s2.sim.fahrzeuge[0], v = F.vehicle;
  for (let k = 0; k < 60 * 12 && !s2.sim.rennen.gasErlaubt; k++) s2.schritt();
  V.vp.setzen(v.x, v.z, v.heading); V.vp.vLaengs = 0; V.vp.y = v.y;
  const ich0 = JSON.parse(JSON.stringify(s2.ich(0))); ich0.ack = 0; V.abgleich(ich0, null); V._ersterAbgleich = false;
  let maxAbw = 0, maxV = 0, abwDz = 0, n = 0;
  const eingabe = (k) => {
    if (k < 120) return { gas: 0, bremse: 0, lenkung: 0 };                    // 2 s Stand
    return { gas: 1, bremse: 0, lenkung: 0 };                                 // dann Gas voll, auch während des Klappens
  };
  for (let k = 0; k < TICKS(14); k++) {
    const s = eingabe(k), kod = N.eingabeKodieren(s), sd = N.eingabeDekodieren(kod);
    const geste = k === 120;                                                  // Geste im Stand (Gas bleibt gedrückt)
    s2.eingabeSetzen(0, sd);
    if (geste) s2.dachGeste(0);
    s2.schritt(); n++;
    V.schritt(n, sd, { countdown: false, imZiel: false, dach: geste });
    const abw = Math.hypot(V.vp.x - v.x, V.vp.z - v.z);
    maxAbw = Math.max(maxAbw, abw);
    if (k > 120 && k < 120 + 180) maxV = Math.max(maxV, Math.abs(v.vLaengs));
    abwDz = Math.max(abwDz, Math.abs(V.dz.rest - F.dachL.rest) + Math.abs(V.dz.ziel - F.dachL.ziel));
  }
  pruefe('F2b Vorhersage = Server (Position, ohne Abgleich, 14 s mit Gas-Sperre): Abweichung < 1 cm', maxAbw < 0.01, maxAbw.toExponential(2) + ' m');
  pruefe('F2c Vorhersage-Dachzustand = Server (Klappzeit, Ziel)', abwDz < 1e-9, abwDz.toExponential(2));
  pruefe('F2d während des Klappens steht das Auto (Server, < 0,5 m/s) und fährt danach', maxV < 0.5 && v.vLaengs > 3, maxV.toFixed(2) + ' / ' + v.vLaengs.toFixed(1));
  // F3 Abgleich übernimmt ich.dz
  const ich = JSON.parse(JSON.stringify(s2.ich(0))); ich.ack = n; V.abgleich(ich, null);
  pruefe('F3 abgleich(ich.dz) übernimmt Ziel/Rest/Gesundheit', V.dz.ziel === 1 && V.dz.rest === 0 && V.dz.gesund === 100);
  // F4 ohne Verdeck: kein dz in der Vorhersage
  const V2 = new C.NetzVorhersage({ strecke: st, auto: C.carCatalog.waehlbare().find(a => a.id === 'passat'), tempoKlasse: 'normal', fahrhilfe: 'aus' });
  pruefe('F4 Passat: Vorhersage ohne Dach', V2.dz === null);
}

// ------------------------------------------------------------------ G) Ende-zu-Ende: echter Server + WebSocket
async function online() {
  const WebSocket = require(path.join(__dirname, '..', 'server', 'node_modules', 'ws'));
  const { starten } = require('../server/server');
  const N = R.Netz;
  const srv = await starten({ port: 0, host: '127.0.0.1', leise: true, ladenMaxMs: 3000 });
  const ws = new WebSocket('ws://127.0.0.1:' + srv.port + '/ws');
  await new Promise((ok2) => ws.on('open', ok2));
  const warte = (ms) => new Promise(r => setTimeout(r, ms));
  const handler = {}, ereignisse = [];
  let startMsg = null, z = null, V = null, rz = 'countdown';
  const anzeige = () => V ? { x: V.vp.x + V.korr.x, z: V.vp.z + V.korr.z, y: V.vp.y + V.korr.y, heading: V.vp.heading + V.korr.h } : null;
  const dzLog = [];
  ws.on('message', (d) => {
    const m = JSON.parse(d);
    if (m.t === 'zustand') { z = m; rz = m.rz; if (V && m.ich) V.abgleich(m.ich, anzeige(), undefined, m.k); if (m.dz) dzLog.push(m.dz[0]); }
    if (m.t === 'start') startMsg = m; if (m.t === 'ereignis') ereignisse.push(m); if (handler[m.t]) handler[m.t](m);
  });
  const senden = (o) => ws.send(JSON.stringify(o));
  await new Promise((ok2) => {
    handler.lobby = () => senden({ t: 'start' });
    handler.start = ok2;
    senden({ t: 'raumErstellen', fahrer: 'Jonas', auto: 'troc-cabrio', hilfe: 'aus', einstellungen: { streckeId: 'wiese', welt: 'klassisch', runden: 99, gegner: 0, schwierigkeit: 'leicht', wetter: 'regen', jahreszeit: 'herbst' } });
  });
  handler.lobby = null;
  {
    const e = startMsg.einstellungen, { st: cst, w } = clientStrecke(e), auto = C.carCatalog.waehlbare().find(a => a.id === 'troc-cabrio');
    V = new C.NetzVorhersage({ strecke: cst, auto, tempoKlasse: e.tempoKlasse, fahrhilfe: 'aus', umwelt: () => w.umwelt() });
    const p0 = cst.startpositionen(startMsg.teilnehmer.length)[0];
    V.vp.setzen(p0.x, p0.z, p0.heading); V.vp.y = cst.hoeheAn(p0.x, p0.z);
  }
  senden({ t: 'geladen' });
  let cur = { gas: 0, bremse: 0, lenkung: 0 }, dFlag = false, n = 0;
  const t0 = Date.now() / 1000; let maxAbw = 0;
  const iv = setInterval(() => {
    const soll = Math.floor((Date.now() / 1000 - t0) / DT);
    while (n < soll) {
      const k = N.eingabeKodieren(cur); n++;
      const msg = { t: 'eingabe', n, g: k.g, b: k.b, l: k.l };
      const dach = dFlag; if (dFlag) { msg.d = 1; dFlag = false; }
      senden(msg);
      V.schritt(n, N.eingabeDekodieren(k), { countdown: rz === 'countdown', imZiel: false, dach }); V.abklingen(DT);
    }
  }, 8);
  const raum = srv.raeume.values().next().value, sim = raum.sim, S = sim.sim, f = S.fahrzeuge[0], v = f.vehicle;
  for (let k = 0; k < 400 && !(z && z.rz === 'laeuft'); k++) await warte(50);
  pruefe('G0 Rennen läuft (Regen, T-Roc, Dach offen)', !!z && z.rz === 'laeuft' && f.dachL && f.dachL.ziel === 0 && f.dachL.nass, z && z.rz);
  pruefe('G0b Server: wetter regen, ich.dz im Zustand', S.wetter.wetterArt === 'regen' && Array.isArray(z.ich.dz), JSON.stringify(z.ich.dz));
  // Geste (Bit d), Gas gedrückt
  cur = { gas: 1, bremse: 0, lenkung: 0 };
  await warte(40); cur = { gas: 0, bremse: 0, lenkung: 0 }; await warte(1500);
  const xs = v.x, zs = v.z;
  cur = { gas: 1, bremse: 0, lenkung: 0 }; dFlag = true;
  await warte(700);
  pruefe('G1 Server hat das Dach geschlossen (ziel 1, Klappen läuft) – Eingabe-Bit d', f.dachL.ziel === 1 && f.dachL.rest > 0 && f.dachL.rest < 3, JSON.stringify([f.dachL.ziel, f.dachL.rest.toFixed(2)]));
  pruefe('G1b zustand.dz meldet ziel 1', z.dz && z.dz[0][1] === 1, JSON.stringify(z.dz));
  pruefe('G1c ich.dz → Vorhersage kennt das Klappen (gleiche Restzeit ± 0,15 s)', V.dz.ziel === 1 && Math.abs(V.dz.rest - f.dachL.rest) < 0.15, V.dz.rest.toFixed(2) + ' vs ' + f.dachL.rest.toFixed(2));
  await warte(1500);
  const bew = Math.hypot(v.x - xs, v.z - zs);
  pruefe('G1d Gas war die ganze Zeit gedrückt, das Auto steht trotzdem (Server, < 0,6 m in 2 s)', bew < 0.6 && f.dachL.rest > 0, bew.toFixed(2));
  { const a = anzeige(); maxAbw = Math.hypot(a.x - v.x, a.z - v.z); }
  pruefe('G1e Anzeige/Vorhersage folgt dem Server (Abstand < 0,5 m, kein Ruckeln durch die Gas-Sperre)', maxAbw < 0.5, maxAbw.toFixed(3) + ' m');
  await warte(2500);
  pruefe('G2 nach 3 s fertig und das Auto fährt los (Server > 2 m/s)', f.dachL.rest === 0 && v.vLaengs > 2, v.vLaengs.toFixed(1));
  { const a = anzeige(); pruefe('G2b Vorhersage folgt weiter (< 1 m)', Math.hypot(a.x - v.x, a.z - v.z) < 1, Math.hypot(a.x - v.x, a.z - v.z).toFixed(2)); }
  // in Fahrt: Geste wirkt nicht (Server prüft autoritativ)
  const ziel0 = f.dachL.ziel; dFlag = true; await warte(300);
  pruefe('G3 Geste in Fahrt wird vom Server ignoriert', f.dachL.ziel === ziel0 && f.dachL.rest === 0, v.vLaengs.toFixed(1));
  clearInterval(iv);
  ws.close(); await warte(100); try { srv.schliessen && srv.schliessen(); } catch (e) { /* egal */ }
  return srv;
}

// ------------------------------------------------------------------ H) Determinismus (Megastrecke, KI)
function det() {
  const lauf3 = () => {
    const sim = new Simulation({ einstellungen: { streckeId: 'mega', runden: 3, gegner: 8, tageszeit: 'tag', jahreszeit: 'sommer', wetter: 'klar', windStaerke: 0, schwierigkeit: 'mittel' },
      spieler: [{ fahrer: 'Jonas', auto: 'passat', hilfe: 'aus' }], seed: 77 });
    sim.eingabeSetzen(0, { gas: 1, bremse: 0, lenkung: 0 });
    const S = sim.sim; let h = 0;
    for (let k = 0; k < TICKS(kurz ? 40 : 110); k++) {
      sim.schritt();
      S.fahrzeuge.forEach((f) => { const d = f.dachL; h = (h * 31 + Math.round(f.vehicle.x * 1000) + Math.round(f.vehicle.z * 1000) * 7 + (d ? d.ziel * 13 + Math.round(d.rest * 100) + Math.round(d.uhr * 100) : 0)) | 0; });
    }
    return h;
  };
  const a = lauf3(), b = lauf3();
  pruefe('H1 Determinismus: zwei identische Läufe (Megastrecke, KI-Cabrios) → gleicher Hash', a === b, a + ' / ' + b);
}
det();

(async () => {
  if (!kurz || true) await online();
  console.log('\n' + ok + ' OK, ' + fehler + ' FEHL');
  console.log(fehler ? 'FEHLER' : 'ALLE DACH-REGEN-TESTS OK');
  process.exit(fehler ? 1 : 0);
})();
