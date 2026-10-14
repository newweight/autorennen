// Node-Test Polizei (Runde 5b, src/world/polizei.js – Logik ohne Three.js): node tests/test_polizei.js
// a) Zielwahl: nächster Spieler vor ihm; KI nur, wenn kein Spieler in 300 m voraus; Schonfrist/angehaltene nicht.
// b) Nähe ≥ 1,5 s (Kapsel ≤ 6 m, neben/hinter) → Anhalten 4 s (v15, vorher 10 s) → Freigabe ('weiter'), vorher keine Freigabe.
// c) Schonfrist 30 s, max. 1 Anhaltung je Auto pro Runde. d) Schild blockt (Schild-Ereignis statt Stopp).
// e) Kein Stopp: Streifenwagen vor dem Ziel, Ziel im Looping/Flug (frei = false), zu weit weg, Kontakt-Unterbrechung.
// f) Kapsel-Abstand, Anzahl (2 ab 6 Gegnern), Park-Steuerung bringt den Wagen neben ein stehendes Auto.
const { ladeModule } = require('./lade');
const R = ladeModule(['src/config.js', 'src/physics/vehicle.js', 'src/world/polizei.js']);

let fehler = 0;
function pruefe(name, ok, info) { console.log((ok ? 'OK   ' : 'FEHL ') + name + (info !== undefined && info !== '' ? '  (' + info + ')' : '')); if (!ok) fehler++; }
const P = R.Polizei, C = R.config.polizei, dt = 1 / 60, L = 2000;

// Auto auf einer geraden Strecke entlang −z (heading 0): s = Bogenlänge = −z
const auto = (s, q, o) => Object.assign({ x: q || 0, z: -s, heading: 0, laenge: 4.5, breite: 1.8, s, runde: 0, istSpieler: false, imZiel: false, frei: true, schild: false }, o || {});
const streife = (s, q) => ({ x: q || 0, z: -s, heading: 0, laenge: 4.7, breite: 1.83, s });
/** n Schritte; liefert alle Ereignisse. fn(t) darf die Autos je Schritt ändern. */
function laufen(lg, autos, st, sek, fn) {
  const ev = [];
  for (let k = 0, n = Math.round(sek / dt); k < n; k++) { if (fn) fn(k * dt); ev.push(...lg.schritt(dt, autos, st, L).map(e => Object.assign({ t: +(lg.zeit).toFixed(3) }, e))); }
  return ev;
}

// ---------- a) Zielwahl ----------
{
  pruefe('Config: Standard aus, 6 m / 1,5 s / 4 s / 30 s / 300 m', C.standardAn === false && C.naheAbstand === 6 && C.naheZeit === 1.5 &&
    C.stoppDauer === 4 && C.schonfrist === 30 && C.kiRadius === 300);
  const lg = new P.Logik(), p = streife(100);
  pruefe('Zielwahl: Spieler 100 m voraus vor KI 20 m voraus', lg.waehlen(0, [auto(120), auto(200, 0, { istSpieler: true })], p, L) === 1);
  pruefe('Zielwahl: Spieler 450 m voraus, KI 50 m → KI (kein Spieler in 300 m)', lg.waehlen(0, [auto(150), auto(550, 0, { istSpieler: true })], p, L) === 0);
  pruefe('Zielwahl: Spieler 450 m, KI 350 m → Spieler (KI auch nicht in 300 m)', lg.waehlen(0, [auto(450), auto(550, 0, { istSpieler: true })], p, L) === 1);
  pruefe('Zielwahl: Spieler 50 m HINTER ihm zählt als weit voraus (Runde rum) → KI 80 m voraus',
    lg.waehlen(0, [auto(180), auto(50, 0, { istSpieler: true })], p, L) === 0);
  pruefe('Zielwahl: Spieler 5 m hinter (neben) ihm zählt noch als vor ihm', lg.waehlen(0, [auto(180), auto(95, 0, { istSpieler: true })], p, L) === 1);
  pruefe('Zielwahl: nächster von zwei Spielern', lg.waehlen(0, [auto(300, 0, { istSpieler: true }), auto(140, 0, { istSpieler: true })], p, L) === 1);
  pruefe('Zielwahl: Spieler im Ziel → nicht wählbar', lg.waehlen(0, [auto(130, 0, { istSpieler: true, imZiel: true }), auto(160)], p, L) === 1);
  pruefe('Zielwahl: Strecken-Umlauf (Polizei s 1950, Spieler s 30 = 80 m voraus)', lg.waehlen(0, [auto(30, 0, { istSpieler: true })], streife(1950), L) === 0);
  pruefe('vorAbstand Umlauf', Math.abs(P.vorAbstand(1950, 30, L) - 80) < 1e-9 && Math.abs(P.vorAbstand(100, 95, L) + 5) < 1e-9);
  // Zwei Streifenwagen: zweiter nimmt nicht dasselbe Ziel, wenn es ein anderes gibt
  const lg2 = new P.Logik(), a2 = [auto(150, 0, { istSpieler: true }), auto(170)], s2 = [streife(100), streife(90)];
  lg2.schritt(dt, a2, s2, L);
  pruefe('Zwei Streifenwagen: verschiedene Ziele', lg2.zielVon(0) === 0 && lg2.zielVon(1) === 1, lg2.zielVon(0) + '/' + lg2.zielVon(1));
}

// ---------- b) Nähe 1,5 s → Anhalten 4 s (v15, vorher 10 s) → Freigabe ----------
{
  const lg = new P.Logik(), sp = auto(500, 0, { istSpieler: true }), autos = [sp], st = [streife(493)];   // 7 m Mitte, ~2,4 m Karosserie
  pruefe('Kapsel-Abstand hintereinander 7 m Mitte ≈ 2,4 m', Math.abs(P.kapselAbstand(st[0], sp) - (7 - (4.7 / 2 - 0.915) - (2.25 - 0.9) - 0.915 - 0.9)) < 1e-6,
    P.kapselAbstand(st[0], sp).toFixed(3));
  let ev = laufen(lg, autos, st, 1.4);
  pruefe('1,4 s nah: noch kein Stopp', !ev.some(e => e.art === 'anhalten') && !lg.gesperrt(0));
  ev = laufen(lg, autos, st, 0.15);
  const an = ev.find(e => e.art === 'anhalten');
  pruefe('≥ 1,5 s nah: Anhalten (Spieler, Streifenwagen 0)', !!an && an.nr === 0 && an.k === 0 && lg.gesperrt(0), an && an.t);
  pruefe('Anhalten nach 1,5 s (± 1 Schritt)', an && Math.abs(an.t - 1.5) <= dt + 1e-6, an && an.t);
  pruefe('Streifenwagen-Phase halt, Restzeit 4 s ab dem Anhalten', lg.streifen[0].phase === 'halt' && Math.abs(lg.rest(0) - (4 - (lg.zeit - an.t))) < 1e-6, lg.rest(0).toFixed(3));
  ev = laufen(lg, autos, st, 3.9);
  pruefe('nach 3,9 s noch gesperrt, Rest ≈ 0,1 s, keine Freigabe', lg.gesperrt(0) && !ev.some(e => e.art === 'weiter'), lg.rest(0).toFixed(3));
  ev = laufen(lg, autos, st, 0.12);
  const w = ev.find(e => e.art === 'weiter');
  pruefe('nach 4 s: Freigabe (weiter), nicht mehr gesperrt, Streifenwagen jagt wieder', !!w && !lg.gesperrt(0) && lg.streifen[0].phase === 'jagd', w && w.t);
  pruefe('Freigabe nach 5,5 s (1,5 + 4)', w && Math.abs(w.t - 5.5) <= dt + 1e-6, w && w.t);

  // ---------- c) Schonfrist + max. 1 je Runde ----------
  ev = laufen(lg, autos, st, 29);
  pruefe('Schonfrist: 29 s daneben → kein Ziel, kein Stopp', !ev.some(e => e.art === 'anhalten') && lg.zielVon(0) === -1, lg.zielVon(0));
  ev = laufen(lg, autos, st, 5);
  pruefe('nach Schonfrist, gleiche Runde: kein zweiter Stopp (max 1/Runde)', !ev.some(e => e.art === 'anhalten'));
  sp.runde = 1;
  ev = laufen(lg, autos, st, 2.6);
  pruefe('nächste Runde + Schonfrist vorbei: wieder anhaltbar', ev.some(e => e.art === 'anhalten' && e.nr === 0) && lg.autos[0].anzahl === 2);

  // Schonfrist gilt auch bei neuer Runde
  const lg3 = new P.Logik(), sp3 = auto(500, 0, { istSpieler: true }), st3 = [streife(494)];
  laufen(lg3, [sp3], st3, 11.6);
  sp3.runde = 1;
  ev = laufen(lg3, [sp3], st3, 20);
  pruefe('Schonfrist 30 s gilt auch nach Rundenwechsel', !ev.some(e => e.art === 'anhalten'));
  ev = laufen(lg3, [sp3], st3, 12);
  pruefe('… danach wieder Stopp', ev.some(e => e.art === 'anhalten'));
}

// ---------- d) Schild blockt ----------
{
  const lg = new P.Logik(), sp = auto(500, 2.5, { istSpieler: true, schild: true }), st = [streife(499, -1.5)];   // schräg daneben
  let ev = laufen(lg, [sp], st, 1.6);
  const sch = ev.find(e => e.art === 'schild');
  pruefe('Schild: Schild-Ereignis statt Anhalten', !!sch && !ev.some(e => e.art === 'anhalten') && !lg.gesperrt(0));
  sp.schild = false;    // main.js: pickups.schildVerbrauchen → Schild weg
  ev = laufen(lg, [sp], st, 1.0);
  pruefe('Schild weg: Nähe-Zeit beginnt neu (1,0 s → noch nichts)', !ev.some(e => e.art === 'anhalten'));
  ev = laufen(lg, [sp], st, 0.6);
  pruefe('… nach weiteren 1,5 s angehalten', ev.some(e => e.art === 'anhalten'));
}

// ---------- e) kein Stopp ----------
{
  const lg = new P.Logik(), sp = auto(500, 0, { istSpieler: true });
  let ev = laufen(lg, [sp], [streife(507)], 3);
  pruefe('Streifenwagen 7 m VOR dem Ziel: kein Stopp', !ev.some(e => e.art === 'anhalten'));
  ev = laufen(new P.Logik(), [sp], [streife(500, 3.6)], 1.6);
  pruefe('Streifenwagen genau daneben (3,6 m): Stopp', ev.some(e => e.art === 'anhalten'));
  ev = laufen(new P.Logik(), [sp], [streife(489)], 3);
  pruefe('Mitte 11 m dahinter (Karosserie > 6 m): kein Stopp', P.kapselAbstand(streife(489), sp) > 6 && !ev.some(e => e.art === 'anhalten'), P.kapselAbstand(streife(489), sp).toFixed(2));
  const imLoop = auto(500, 0, { istSpieler: true, frei: false });
  ev = laufen(new P.Logik(), [imLoop], [streife(494)], 3);
  pruefe('Ziel im Looping/Flug (frei = false): kein Stopp', !ev.some(e => e.art === 'anhalten'));
  const lg4 = new P.Logik(), sp4 = auto(500, 0, { istSpieler: true }), st4 = [streife(494)];
  ev = laufen(lg4, [sp4], st4, 3, (t) => { st4[0].z = (Math.floor(t / 1.0) % 2) ? -470 : -494; });   // immer nur 1 s nah
  pruefe('Nähe unterbrochen (je 1 s): kein Stopp', !ev.some(e => e.art === 'anhalten'));
  // KI wird angehalten, wenn kein Spieler in 300 m
  const lg5 = new P.Logik(), ki = auto(300), weit = auto(900, 0, { istSpieler: true });
  ev = laufen(lg5, [ki, weit], [streife(294)], 2);
  pruefe('KI angehalten, wenn Spieler > 300 m voraus', ev.some(e => e.art === 'anhalten' && e.nr === 0));
  const lg6 = new P.Logik(), nahSp = auto(450, 0, { istSpieler: true });
  ev = laufen(lg6, [auto(300), nahSp], [streife(294)], 2);
  pruefe('KI NICHT angehalten, wenn ein Spieler in 300 m voraus ist', !ev.some(e => e.art === 'anhalten') && lg6.zielVon(0) === 1);
}

// ---------- f) Anzahl, Park-Steuerung ----------
{
  pruefe('Anzahl Streifenwagen: 5 Gegner → 1, 6 → 2, 10 → 2', P.anzahl(5) === 1 && P.anzahl(6) === 2 && P.anzahl(10) === 2);
  pruefe('Kapsel-Abstand nebeneinander 3,8 m ≈ 2,0 m', Math.abs(P.kapselAbstand({ x: 0, z: 0, heading: 0, laenge: 4.5, breite: 1.8 }, { x: 3.8, z: 0, heading: 0, laenge: 4.5, breite: 1.8 }) - 2.0) < 1e-6);
  pruefe('Kapsel-Abstand quer (T) korrekt', Math.abs(P.kapselAbstand({ x: 0, z: 0, heading: 0, laenge: 4.5, breite: 1.8 }, { x: 5, z: 0, heading: Math.PI / 2, laenge: 4.5, breite: 1.8 }) - (5 - 1.35 - 0.9 - 0.9)) < 1e-6);
  [[-1, 'links'], [1, 'rechts']].forEach(([seite, name]) => {
    const v = new R.Vehicle({}); v.setzen(seite * 1.5, 12, 0); v.vLaengs = 8;    // 12 m hinter dem stehenden Ziel
    const ziel = { x: 0, z: 0, heading: 0, breite: 1.8 };
    const D = P.parkAbstand(ziel, 1.83, C);
    let maxV = 0;
    for (let k = 0; k < 60 * 12; k++) { v.schritt(dt, P.parkSteuerung(v, ziel, seite, D, C.versatzVor)); P.einparken(v, ziel, seite, D, C.versatzVor, dt, C.einparkRate); maxV = Math.max(maxV, v.vLaengs); }
    const quer = v.x, laengs = -v.z;
    pruefe('Park-Steuerung ' + name + ': steht neben dem Ziel (quer = ' + (seite * D).toFixed(2) + ' m ± 0,1, längs 0,4 ± 0,2, Tempo < 0,5)',
      Math.abs(quer - seite * D) < 0.1 && Math.abs(laengs - C.versatzVor) < 0.2 && Math.abs(v.vLaengs) < 0.5 && Math.abs(v.heading) < 0.03,
      'x ' + quer.toFixed(2) + ', längs ' + laengs.toFixed(2) + ', v ' + v.vLaengs.toFixed(2) + ', max ' + maxV.toFixed(1) + ', heading ' + v.heading.toFixed(3));
    const gap = P.kapselAbstand({ x: v.x, z: v.z, heading: v.heading, laenge: 4.88, breite: 1.83 }, { x: 0, z: 0, heading: 0, laenge: 4.5, breite: 1.8 });
    pruefe('Park-Steuerung ' + name + ': Karosserie-Abstand 0,6–1 m', gap >= 0.6 && gap <= 1.0, gap.toFixed(2));
  });
  // angehaltenes Auto: haltSteuerung bremst bis zum Stand und fährt NICHT rückwärts
  const v = new R.Vehicle({}); v.setzen(0, 0, 0); v.vLaengs = 30;
  const halt = P.prototype.haltSteuerung;
  let minV = 99;
  for (let k = 0; k < 600; k++) { v.schritt(dt, halt(v)); minV = Math.min(minV, v.vLaengs); }
  pruefe('haltSteuerung: bremst auf 0, nicht rückwärts', Math.abs(v.vLaengs) < 0.05 && minV > -0.3, 'v ' + v.vLaengs.toFixed(3) + ', min ' + minV.toFixed(3));
}

console.log(fehler ? '\n' + fehler + ' FEHLER' : '\nAlle Polizei-Tests OK');
process.exit(fehler ? 1 : 0);
