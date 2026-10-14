// 14.10. (v18) Abschleppwagen + Werkstatt – node tests/test_garage_werkstatt.js [--diag]
// Prüft: (A) Platz der Werkstatt auf ALLEN Strecken/Welten/Varianten (Fläche vor der Bande, deterministisch), (B) +15 %/s im Stand bis 100 %,
// (C) nur im Stand, (D) einmal pro Runde, (E) nicht bei Liegenbleiben/Reparatur, (F) Schaden aus → keine Wirkung, (G) KI fährt bei < 40 % hin
// und wird repariert, bei 80 % fährt sie vorbei, (H) Abschleppwagen-Ablauf (Ereignisse/Zeiten, Mesh-Bewegung), (I) 10 % = 3 s, Losfahren ab 30 % nach 9 s,
// KI ab 40 %. Echtes main.js (kopflose Server-Simulation); Werkstatt/Schaden werden wie in streckeAufbauen angehängt.
const S = require('../server/simulation.js');
// Die beiden neuen Module gehören (noch) nicht in die Server-Modulliste (online ist Schaden aus) → für den Test vor main.js laden
S.MODULE.splice(S.MODULE.indexOf('src/main.js'), 0, 'src/world/abschleppwagen.js', 'src/world/garage.js');
const { Simulation } = S;
const diag = process.argv.includes('--diag');
let fehler = 0;
function pruefe(name, ok, info) { console.log((ok ? 'OK   ' : 'FEHL ') + name + (info ? '  (' + info + ')' : '')); if (!ok) fehler++; }

const sim0 = new Simulation({ einstellungen: { streckeId: 'wiese', gegner: 0 }, spieler: [{ fahrer: 'T', auto: 'passat' }], seed: 1 });
const R = sim0.R, C = R.config.werkstatt, CS = R.config.schaden, dt = R.config.physik.schritt;

/** Neue Simulation mit Schaden an + Werkstatt wie main.js streckeAufbauen. */
function aufbau(opt) {
  opt = opt || {};
  const sim = new Simulation({ einstellungen: Object.assign({ streckeId: 'wiese', gegner: 0, runden: 3, tempoKlasse: 'normal', schwierigkeit: 'mittel' }, opt.einst || {}),
    spieler: [{ fahrer: 'T', auto: 'passat' }], seed: opt.seed || 7 });
  const g = sim.sim, st = g.strecke;
  g.schaden = new R.Schaden(g.fahrzeuge, { an: opt.schadenAn !== false });
  g.fahrzeuge.forEach((f, i) => { g.schaden.meshBauen(i, f.mesh); });
  g.schaden.bei((e) => g._schadenEreignis(e));
  const ereignisse = [];
  g.schaden.bei((e) => ereignisse.push({ art: e.art, i: e.i, t: g.rennen.zeit, prozent: e.prozent }));
  let w = null;
  if (opt.werkstatt !== false) {
    w = new R.Werkstatt(st);
    g.werkstatt = w;
    w.bei((e) => ereignisse.push({ art: 'w:' + e.art, i: e.i, t: g.rennen.zeit, prozent: e.prozent }));
  }
  let k = 0; while (!g.rennen.gasErlaubt && k++ < 60 * 12) sim.schritt();
  return { sim, g, st, w, schaden: g.schaden, ereignisse, f: g.fahrzeuge[0], v: g.fahrzeuge[0].vehicle };
}
/** Auto i in Box k der Werkstatt stellen (Stand, Fahrtrichtung der Strecke). */
function inBox(T, i, k) {
  const f = T.g.fahrzeuge[i], v = f.vehicle, b = T.w.boxMitte(k), p = T.st.spline.punktBei(b.s);
  v.setzen(b.x, b.z, Math.atan2(-p.tx, -p.tz)); v.vLaengs = 0; v.vQuer = 0; v.y = T.st.hoeheAn(b.x, b.z);
  f.index = -1; f.nah = T.st.abfrage(v.x, v.z, undefined);
  f.vorher && Object.assign(f.vorher, { x: v.x, y: v.y, z: v.z, heading: v.heading });
}
const still = (T, sek, stand) => { for (let t = 0; t < sek - 1e-9; t += dt) { if (stand) { T.v.vLaengs = 0; T.v.vQuer = 0; } T.sim.schritt(); } };

// ======================================================= A. Platz auf allen Strecken
{
  let n = 0, fehlend = [], zuEng = [], nichtDet = [], stufen = {}, minTiefe = 99;
  for (const daten of R.trackCatalog) {
    const welten = Object.keys(daten.welten || {}); if (!welten.length) welten.push('');
    for (const welt of welten) for (const variante of ['', ...Object.keys(daten.varianten || {})]) for (const menge of ['normal', 'sehrViele']) {
      const st = new R.Strecke(daten, { welt, variante, hindernisMenge: menge });
      R.Kollisionen.pflanzenSammeln(st, R.themes.dekoBauen(daten.thema, st, 'sommer'));
      const name = [daten.id, welt, variante, menge].join('/');
      const p = R.Werkstatt.platzSuchen(st), p2 = R.Werkstatt.platzSuchen(st);
      n++;
      if (!p) { fehlend.push(name); continue; }
      stufen[p.stufe] = (stufen[p.stufe] || 0) + 1;
      minTiefe = Math.min(minTiefe, p.gebTiefe);
      if (JSON.stringify(p) !== JSON.stringify(p2)) nichtDet.push(name);
      // Fläche muss vor der Bande liegen (mit Reserve für die Fahrzeugbreite), Gebäude dahinter; Fläche breiter als ein Auto
      let grenze = Infinity; for (let k = -p.laenge / 2; k <= p.laenge / 2; k += 2) grenze = Math.min(grenze, st.grenzeBei(p.s + k));
      if (!(p.qB <= grenze - 1.7 && p.qA > st.breite / 2 + (st.randBreite || 0) && p.breite >= 4.3 && p.gebTiefe >= 2.4)) zuEng.push(name + ' qB ' + p.qB.toFixed(1) + ' grenze ' + grenze.toFixed(1));
    }
  }
  pruefe('A: Platz gefunden auf allen ' + n + ' Strecken/Welten/Varianten/Mengen', fehlend.length === 0, fehlend.slice(0, 5).join(', ') + ' · Stufen ' + JSON.stringify(stufen));
  pruefe('A: Fläche liegt vor der Bande (≥ 1,7 m Reserve), hinter dem Randstreifen, ≥ 4,3 m breit; Gebäude ≥ 2,4 m tief', zuEng.length === 0, zuEng.slice(0, 3).join(' | ') + ' · min. Tiefe ' + minTiefe.toFixed(1));
  pruefe('A: Platzsuche deterministisch (zweimal gleiches Ergebnis)', nichtDet.length === 0, nichtDet.slice(0, 3).join(', '));
}

// ======================================================= B. +15 %/s im Stand bis 100 %
{
  const T = aufbau();
  T.schaden._punkteSetzen(0, 40);
  inBox(T, 0, 0);
  T.sim.schritt();   // Zustand aktualisieren
  const z = () => T.schaden.zustand(0).prozent;
  const p0 = z();
  still(T, 1.0, true);
  const p1 = z();
  pruefe('B: 1 s im Stand auf der Fläche: +15 % (40 → 55)', p1 - p0 >= 14 && p1 - p0 <= 16, p0 + ' → ' + p1 + ' %');
  still(T, 1.0, true);
  pruefe('B: nach 2 s +30 % (70)', Math.abs(z() - 70) <= 1, z() + ' %');
  pruefe('B: HUD-Zustand „heilt“', T.w.zustand(0).status === 'heilt', T.w.zustand(0).status);
  still(T, 2.2, true);
  pruefe('B: nach 4,2 s volle 100 % (60 % / 15 = 4 s), Ereignisse start/voll genau einmal',
    z() === 100 && T.ereignisse.filter(e => e.art === 'w:start').length === 1 && T.ereignisse.filter(e => e.art === 'w:voll').length === 1, z() + ' %');
  pruefe('B: Stufe 0 (volle Leistung) nach der Heilung, Ereignis heilen je 10 % (≥ 5×)', T.schaden.zustand(0).stufe === 0 && T.ereignisse.filter(e => e.art === 'w:heilen').length >= 5,
    T.ereignisse.filter(e => e.art === 'w:heilen').length + '×');
  // Stufen laufen mit: 20 % → Stufe 4, nach 2 s (50 %) Stufe 2
  const T2 = aufbau(); T2.schaden._punkteSetzen(0, 20); inBox(T2, 0, 1); T2.sim.schritt();
  const stufe0 = T2.schaden.zustand(0).stufe; still(T2, 2.0, true);
  pruefe('B: Stufe sinkt mit der Heilung mit (20 % Stufe 4 → ≈ 50 % Stufe 2)', stufe0 === 4 && T2.schaden.zustand(0).stufe === 2, 'Stufe ' + stufe0 + ' → ' + T2.schaden.zustand(0).stufe + ', ' + T2.schaden.zustand(0).prozent + ' %');
}

// ======================================================= C. nur im Stand
{
  const T = aufbau();
  T.schaden._punkteSetzen(0, 40);
  inBox(T, 0, 0);
  let p0 = T.schaden.zustand(0).prozent, bewegt = 0;
  for (let t = 0; t < 0.9; t += dt) {                              // rollt mit 3 m/s über die Fläche (jeden Schritt neu gesetzt)
    T.v.vLaengs = 3; T.sim.schritt(); bewegt++;
  }
  pruefe('C: mit 3 m/s auf der Fläche (Tempo > 1 m/s) kein Heilen', T.schaden.zustand(0).prozent === p0, p0 + ' → ' + T.schaden.zustand(0).prozent + ' %');
  pruefe('C: dabei HUD-Zustand „drin“ (anhalten!)', T.w.zustand(0).status === 'drin' || T.w.zustand(0).status === 'aus', T.w.zustand(0).status);
  // Fläche neben der Fläche: im Stand auf der Fahrbahn kein Heilen
  const b = T.st.spline.punktBei(T.w.platz.s), f = T.g.fahrzeuge[0], v = T.v;
  v.setzen(b.x, b.z, Math.atan2(-b.tx, -b.tz)); v.vLaengs = 0; f.index = -1; f.nah = T.st.abfrage(v.x, v.z);
  still(T, 1.5, true);
  pruefe('C: im Stand auf der Fahrbahn (neben der Fläche) kein Heilen', T.schaden.zustand(0).prozent === p0, T.schaden.zustand(0).prozent + ' %');
  // Langsam (0,5 m/s) zählt als Stand
  inBox(T, 0, 1); T.sim.schritt();
  for (let t = 0; t < 1.0; t += dt) { T.v.vLaengs = 0.5; T.sim.schritt(); }
  pruefe('C: mit 0,5 m/s (< 1 m/s) wird geheilt', T.schaden.zustand(0).prozent > p0 + 10, p0 + ' → ' + T.schaden.zustand(0).prozent + ' %');
}

// ======================================================= D. einmal pro Runde
{
  const T = aufbau();
  T.schaden._punkteSetzen(0, 30);
  inBox(T, 0, 0); T.sim.schritt();
  still(T, 2.0, true);                                       // ≈ 60 %
  const teil = T.schaden.zustand(0).prozent;
  // Fläche verlassen (auf die Fahrbahn) → benutzt
  const b = T.st.spline.punktBei(T.w.platz.s);
  T.v.setzen(b.x, b.z, Math.atan2(-b.tx, -b.tz)); T.v.vLaengs = 0; T.g.fahrzeuge[0].nah = T.st.abfrage(T.v.x, T.v.z); still(T, 0.2, true);
  inBox(T, 0, 1); T.sim.schritt();
  const nachher = T.schaden.zustand(0).prozent;
  still(T, 2.0, true);
  pruefe('D: 2. Besuch in derselben Runde heilt nicht mehr', T.schaden.zustand(0).prozent === nachher && nachher === teil, teil + ' / ' + nachher + ' / ' + T.schaden.zustand(0).prozent + ' %');
  pruefe('D: HUD „benutzt“ („schon benutzt – nächste Runde“)', T.w.zustand(0).status === 'benutzt', T.w.zustand(0).status);
  T.g.rennen.teilnehmer[0].runde++;                            // nächste Runde
  still(T, 1.0, true);
  pruefe('D: nächste Runde wieder frei: +15 % in 1 s', T.schaden.zustand(0).prozent - nachher >= 14, nachher + ' → ' + T.schaden.zustand(0).prozent + ' %');
  // Bis 100 % ohne Verlassen: danach ebenfalls benutzt (Status voll bleibt, kein Heilen nötig)
  still(T, 4, true);
  pruefe('D: bei 100 % angekommen, Anzeige „voll“ (kein „benutzt“-Fehlalarm)', T.schaden.zustand(0).prozent === 100 && T.w.zustand(0).status === 'voll', T.w.zustand(0).status);
  // 100 % ohne Heilung: gar nicht „benutzt“ (Besuch ohne Nutzen verbraucht die Runde nicht)
  const T3 = aufbau(); inBox(T3, 0, 0); still(T3, 1, true);
  T3.schaden._punkteSetzen(0, 50); still(T3, 1, true);
  pruefe('D: Besuch bei 100 % verbraucht die Runde nicht (danach bei 50 % wird geheilt)', T3.schaden.zustand(0).prozent > 55, T3.schaden.zustand(0).prozent + ' %');
}

// ======================================================= E. nicht bei Liegenbleiben / Abschlepp-Reparatur
{
  const T = aufbau();
  inBox(T, 0, 0);
  T.schaden._punkteSetzen(0, 5); T.schaden.z[0].punkte = 0; T.schaden._liegenbleiben(0);
  still(T, 1.5, true);
  pruefe('E: liegengeblieben (0 %) → Werkstatt heilt nicht', T.schaden.z[0].punkte === 0 && T.schaden.zustand(0).liegengeblieben);
  // Abschleppen läuft durch, danach Abschlepp-Reparatur (Auto steht am Reset-Punkt, nicht in der Werkstatt) → Werkstatt-Heilung greift nicht
  const rep = T.schaden.z[0]; rep.liegengeblieben = false; rep.rep = true; rep.punkte = 10;
  inBox(T, 0, 1);
  const w0 = T.schaden.werkstattHeilen(0, 100);
  pruefe('E: in der Abschlepp-Reparatur wird nicht doppelt geheilt (werkstattHeilen = 0)', w0 === 0 && rep.punkte === 10);
}

// ======================================================= F. Schaden aus → keine Wirkung
{
  const T = aufbau({ schadenAn: false });
  inBox(T, 0, 0); T.sim.schritt();
  T.schaden.z[0].punkte = 30;                                 // (künstlich) – bei „aus“ zählt der Wert nicht
  still(T, 3, true);
  pruefe('F: Schaden aus → Werkstatt-Heilung wirkungslos (Wert unverändert), HUD-Zustand „aus“', T.schaden.z[0].punkte === 30 && T.w.zustand(0).status === 'aus' && T.schaden.werkstattHeilen(0, 50) === 0);
  pruefe('F: Schaden aus → kein Ereignis der Werkstatt', !T.ereignisse.some(e => e.art.startsWith('w:')));
  // ohne Werkstatt (Server): main.js läuft unverändert
  const T2 = aufbau({ werkstatt: false }); still(T2, 2, true);
  pruefe('F: ohne Werkstatt-Objekt (this.werkstatt fehlt) läuft der Physikschritt ohne Fehler', T2.sim.sim.werkstatt === null || T2.sim.sim.werkstatt === undefined);
}

// ======================================================= G. KI fährt bei < 40 % hin
{
  /** Rennen mit Gegnern; KI 1 auf `prozent` setzen, bis 70 s fahren; wann steht sie auf der Fläche, was wird aus ihrem Wert? */
  function kiLauf(prozent, einst, seed) {
    const T = aufbau({ einst: Object.assign({ gegner: 2, runden: 2 }, einst || {}), seed: seed || 5 });
    T.schaden._punkteSetzen(1, prozent);
    // Spieler aus dem Weg (parken weit weg: auf der Gegengeraden-Seite ist schwierig → einfach Zustand „im Ziel“ geben ist zu invasiv: Spieler fährt mit Vollgas geradeaus-ähnlich)
    let drinMax = 0, drinZeit = 0, maxP = prozent, neuP = prozent, t = 0, zuStart = -1;
    const kiF = T.g.fahrzeuge[1];
    const sp = T.st.spline;
    for (let k = 0; k < 60 * 75; k++) {
      // Spieler: einfach bremsen/stehen (soll nicht stören) – bleibt hinter dem Start
      T.sim.eingabeSetzen(0, { gas: 0, bremse: 1, lenkung: 0 });
      T.sim.schritt(); t += dt;
      const n = kiF.nah;
      if (n && T.w.istDrin(n)) { drinZeit += dt; if (zuStart < 0) zuStart = t; }
      maxP = Math.max(maxP, T.schaden.zustand(1).prozent);
      if (T.g.rennen.teilnehmer[1].letzterCheckpoint >= 3 && T.schaden.zustand(1).prozent >= prozent) { /* weitergefahren */ }
    }
    neuP = T.schaden.zustand(1).prozent;
    const fort = T.g.rennen.teilnehmer[1].fortschritt;
    return { T, drinZeit, maxP, neuP, fort, zuStart, ereignisse: T.ereignisse.filter(e => e.i === 1).map(e => e.art + (e.t !== undefined ? '@' + e.t.toFixed(1) : '')) };
  }
  const a = kiLauf(30);
  pruefe('G: KI mit 30 % (< 40 %) fährt auf die Fläche, steht dort und wird auf 100 % repariert', a.drinZeit > 2 && a.maxP === 100, 'auf der Fläche ' + a.drinZeit.toFixed(1) + ' s, Wert bis ' + a.maxP + ' %, ab ' + (a.zuStart > 0 ? a.zuStart.toFixed(1) + ' s' : '-'));
  pruefe('G: danach fährt die KI weiter (Fortschritt > 600 m, nicht auf der Fläche hängen)', a.fort > 600 && !a.T.w.istDrin(a.T.g.fahrzeuge[1].nah), 'Fortschritt ' + a.fort.toFixed(0) + ' m');
  pruefe('G: kein erneuter Reset der KI (netReset = 0) und nicht liegengeblieben', a.T.g.fahrzeuge[1].netReset === 0 && !a.T.schaden.zustand(1).liegengeblieben, 'netReset ' + a.T.g.fahrzeuge[1].netReset);
  const b = kiLauf(80);
  pruefe('G: KI mit 80 % fährt vorbei (nie auf der Fläche, Wert bleibt 80 %)', b.drinZeit === 0 && b.neuP === 80, 'auf der Fläche ' + b.drinZeit.toFixed(1) + ' s, ' + b.neuP + ' %');
  const c = kiLauf(39);
  pruefe('G: Grenze: 39 % → hin, 40 % → vorbei', c.maxP === 100 && kiLauf(40).drinZeit === 0, '39 %: bis ' + c.maxP + ' %');
  if (diag) console.log('  diag a:', a.ereignisse.join(' '));
}

// ======================================================= H. Abschleppwagen-Ablauf
{
  // H1: Schaden-Logik: Ereignisse und Zeiten
  const T = aufbau();
  const gesamt = CS.liegenZeit;
  T.schaden._punkteSetzen(0, 5);
  T.schaden.treffer(0, 'hindernis', 5);                              // → 0 %: liegengeblieben
  const tl = T.g.rennen.zeit;
  const zeit = (art) => { const e = T.ereignisse.find(x => x.art === art && x.i === 0); return e ? e.t - tl : null; };
  pruefe('H: Wert 0 % → Ereignis liegengeblieben', T.schaden.zustand(0).liegengeblieben && zeit('liegengeblieben') !== null);
  const verlauf = [];
  for (let k = 0; k < 60 * 8; k++) { T.sim.schritt(); if (k % 30 === 29) verlauf.push([T.g.rennen.zeit - tl, T.schaden.zustand(0).liegengeblieben]); }
  const th = zeit('abschleppwagen'), ta = zeit('abschleppen');
  pruefe('H: Ereignis abschleppwagen (Meldung + Hupe) hupeBei = ' + CS.abschlepp.hupeBei + ' s nach dem Liegenbleiben', th !== null && Math.abs(th - CS.abschlepp.hupeBei) < 0.1, th && th.toFixed(2) + ' s');
  pruefe('H: Ereignis abschleppen (Reset) nach liegenZeit = ' + gesamt + ' s', ta !== null && Math.abs(ta - gesamt) < 0.1, ta && ta.toFixed(2) + ' s');
  pruefe('H: Reihenfolge liegengeblieben < abschleppwagen < abschleppen', T.ereignisse.map(e => e.art).filter(a => ['liegengeblieben', 'abschleppwagen', 'abschleppen'].includes(a)).join(',') === 'liegengeblieben,abschleppwagen,abschleppen');
  pruefe('H: Ankunft des Abschleppwagens sichtbar früh (anfahrt ' + CS.abschlepp.anfahrt + ' s im Bereich 2–3 s)', CS.abschlepp.anfahrt >= 2 && CS.abschlepp.anfahrt <= 3);
  pruefe('H: Phasen anfahrt + aufladen < liegenZeit (Rest = Wegfahren ≥ 1 s)', CS.abschlepp.anfahrt + CS.abschlepp.aufladen + 1 <= gesamt, (gesamt - CS.abschlepp.anfahrt - CS.abschlepp.aufladen).toFixed(2) + ' s');
  // H2: Ablauf-Funktion
  const A = R.Abschleppwagen;
  const ph = (t) => A.ablauf(t, gesamt, CS.abschlepp);
  pruefe('H: ablauf(): 1 s = Anfahrt (Phase 0), 3 s = Aufladen (1), 5 s = Wegfahren (2), Schwund erst in den letzten 0,35 s',
    ph(1).phase === 0 && ph(3).phase === 1 && ph(5).phase === 2 && ph(5).schwund === 0 && ph(gesamt - 0.1).schwund > 0.5 && ph(gesamt).schwund > 0.999);
  // H3: Mesh-Bewegung mit echtem THREE (Server-Kontext hat three.min.js)
  if (typeof R.Abschleppwagen === 'function') {
    const T2 = aufbau();
    const TH = R.Vehicle.constructor('return THREE')();            // THREE aus dem Kontext des Spiels (three.min.js im Server-Kontext)
    const szene = new TH.Group();
    const mesh = new TH.Group();
    T2.g.fahrzeuge[0].mesh = mesh;
    const aw = new R.Abschleppwagen(T2.st, T2.g.fahrzeuge, T2.schaden, szene);
    T2.schaden._punkteSetzen(0, 5); T2.schaden.treffer(0, 'hindernis', 5);
    const v = T2.v, start = { x: v.x, z: v.z };
    const lkwPos = () => { const l = aw.eintraege[0] && aw.eintraege[0].lkw; return l ? { x: l.position.x, z: l.position.z, y: l.position.y, sichtbar: l.visible } : null; };
    const proben = {};
    for (let k = 0; k < 60 * 6; k++) {
      T2.sim.schritt(); mesh.position.set(v.x, v.y, v.z); mesh.rotation.set(0, v.heading, 0); aw.update(dt);
      const t = T2.schaden.zustand(0).liegeVergangen;
      for (const tt of [0.05, 1.2, 2.5, 3.2, 4.0, 5.0]) if (!(tt in proben) && t >= tt) proben[tt] = { lkw: lkwPos(), car: { x: mesh.position.x, y: mesh.position.y, z: mesh.position.z, vis: mesh.visible, sc: mesh.scale.x } };
      if (!T2.schaden.zustand(0).liegengeblieben) break;
    }
    const d = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
    const p0 = proben[0.05], p1 = proben[1.2], p2 = proben[2.5], p3 = proben[3.2], p4 = proben[4.0], p5 = proben[5.0];
    pruefe('H: Abschleppwagen erscheint (sichtbar) und kommt näher: Abstand zum Wrack 0,05 s > 1,2 s > 2,5 s', p0 && p0.lkw && p0.lkw.sichtbar && d(p0.lkw, start) > d(p1.lkw, start) && d(p1.lkw, start) > d(p2.lkw, start),
      [p0, p1, p2].map(p => p && d(p.lkw, start).toFixed(1)).join(' > ') + ' m');
    pruefe('H: nach der Anfahrt (2,5 s) hält er neben dem Auto (Abstand ≈ seitlich ' + CS.abschlepp.seitlich + ' m)', Math.abs(d(p2.lkw, start) - CS.abschlepp.seitlich) < 1.2, d(p2.lkw, start).toFixed(2) + ' m');
    pruefe('H: beim Aufladen (3,2 s) hebt der Kran das Auto an (y über Boden, Auto bewegt sich Richtung Ladefläche)', p3.car.y > p2.car.y + 0.3 && d(p3.car, start) > 0.3, 'y ' + p2.car.y.toFixed(2) + ' → ' + p3.car.y.toFixed(2));
    pruefe('H: ab 4,0 s liegt das Auto auf der Ladefläche (Höhe ≈ ladeHoehe) und fährt mit dem Wagen weg', Math.abs(p4.car.y - (p4.lkw.y + CS.abschlepp.ladeHoehe)) < 0.3 && d(p5.car, start) > d(p4.car, start) + 1 && d(p5.lkw, p5.car) < 1.5,
      'Abstand Start→4 s ' + d(p4.car, start).toFixed(1) + ' → 5 s ' + d(p5.car, start).toFixed(1) + ' m');
    // Ende: Reset → Mesh frei
    for (let k = 0; k < 90; k++) { T2.sim.schritt(); mesh.position.set(v.x, v.y, v.z); aw.update(dt); }
    pruefe('H: nach dem Abschleppen ist das Auto-Mesh wieder sichtbar, Größe 1, und der Wagen weg', mesh.visible && Math.abs(mesh.scale.x - 1) < 1e-9 && !aw.eintraege[0].lkw.visible);
    aw.zerstoeren();
  }
}

// ======================================================= I. 10 % = 3 s; Losfahren ab 30 % nach 9 s; KI ab 40 %
{
  pruefe('I: config: 10 % = 3 s, Losfahren ab 30 %, KI ab 40 %', CS.reparaturJe10 === 3 && CS.losfahrenAb === 30 && CS.kiLosfahrenAb === 40);
  const bau = (mensch) => {
    const autos = [{ vehicle: new R.Vehicle(R.carCatalog[0].fahrwerte), istSpieler: mensch }];
    const s = new R.Schaden(autos, { an: true }), ev = [];
    s.bei((e) => ev.push(e));
    s.z[0].punkte = 5; s.treffer(0, 'hindernis', 5);
    let t = 0; while (s.zustand(0).liegengeblieben && t < 20) { s.schritt(dt); t += dt; }
    return { s, ev, liegen: t };
  };
  const m = bau(true);
  const marken = [];
  for (let t = 0, p = 0; t < 31; t += dt) { m.s.schritt(dt); const z = m.s.zustand(0).prozent; if (z !== p) { marken.push([z, t]); p = z; } if (!m.s.reparatur(0)) break; }
  pruefe('I: Liegen + Abschleppen dauert ' + CS.liegenZeit + ' s (Ereignis abschleppen)', Math.abs(m.liegen - CS.liegenZeit) < 0.05, m.liegen.toFixed(2) + ' s');
  pruefe('I: Reparatur 0 → 10 → 20 → 30: je 3,0 s (30 % nach 9 s)', marken.length >= 3 && marken[0][0] === 10 && Math.abs(marken[0][1] - 3) < 0.05 && marken[2][0] === 30 && Math.abs(marken[2][1] - 9) < 0.05,
    marken.slice(0, 4).map(x => x[0] + ' % @' + x[1].toFixed(2) + ' s').join(', '));
  pruefe('I: 100 % nach 30 s, dann endet die Reparatur', marken.length === 10 && marken[9][0] === 100 && Math.abs(marken[9][1] - 30) < 0.05, marken.length + ' Schritte, letzter ' + (marken.length ? marken[marken.length - 1][0] + ' % @' + marken[marken.length - 1][1].toFixed(2) : '-'));
  // Gas bei 30 % beendet die Reparatur
  const m2 = bau(true); for (let t = 0; t < 9.05; t += dt) m2.s.schritt(dt);
  const o = m2.s.reparaturSteuerung(0, { gas: 1, bremse: 0, lenkung: 0 });
  pruefe('I: Gas ab 30 % (nach 9 s) → losfahren', o.gas === 1 && !m2.s.reparatur(0) && m2.s.zustand(0).prozent === 30);
  const m3 = bau(true); for (let t = 0; t < 8.9; t += dt) m3.s.schritt(dt);
  pruefe('I: Gas bei 20 % (8,9 s) noch gesperrt', m3.s.reparaturSteuerung(0, { gas: 1, bremse: 0, lenkung: 0 }).gas === 0);
  const k = bau(false); let tk = 0; while (k.s.gesperrt(0) && tk < 40) { k.s.schritt(dt); tk += dt; }
  pruefe('I: KI frei bei 40 % nach 12 s Reparatur (zusammen ' + (CS.liegenZeit + 12) + ' s Stillstand)', k.s.zustand(0).prozent === 40 && Math.abs(tk - 12) < 0.1, tk.toFixed(2) + ' s, ' + k.s.zustand(0).prozent + ' %');
}

console.log(fehler ? `\n${fehler} FEHLER` : '\nALLE TESTS OK');
process.exit(fehler ? 1 : 0);
