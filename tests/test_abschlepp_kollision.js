// v32 N1 (22.10.2026): „Auto fährt durch den Abschleppwagen“ – node tests/test_abschlepp_kollision.js
// Teil A  offline, Modul direkt (abschleppwagen.js kollidieren): Auffahren auf den stehenden Lkw, Lkw fährt von hinten an ein stehendes Auto,
//         Lkw erscheint im Auto (kein Wegschleudern/Festklemmen), Schaden höchstens ein Auto-Treffer je Kontakt, Lkw bleibt auf seiner Spur.
//         Vorher-Nachweis: config.schaden.abschlepp.kollision = false (= Stand bis v31, nur Optik) → das Auto fährt durch.
// Teil B  offline, ganzer Physikschritt aus main.js (kopfloses Spiel wie der Server, dazu Schaden + Abschleppwagen): Spieler (Autopilot)
//         und KI fahren an einem Wrack mit Abschleppwagen vorbei – niemand im Lkw, niemand hängt fest.
// Teil C  online (server/simulation.js): Verkehrs-Abschleppwagen stößt Spieler bei Rempeln UND im Geister-Modus (Hülle Z. ~76–79);
//         der Crash-Abschleppwagen existiert online nicht (Schaden aus) → Server unverändert.
'use strict';
const fs = require('fs');
const path = require('path');
const S = require('../server/simulation.js');
const { Simulation, laden } = S;
const R = laden();
// abschleppwagen.js ist im Server nicht geladen (nur Optik + v32-Körper) → für die Tests in denselben Kontext einhängen
new Function('window', fs.readFileSync(path.join(__dirname, '..', 'src/world/abschleppwagen.js'), 'utf8'))({ Rennspiel: R });
const K = R.Kollisionen, dt = R.config.physik.schritt;
let fehler = 0, ok = 0;
function pruefe(name, b, info) { console.log((b ? 'OK   ' : 'FEHL ') + name + (info !== undefined ? '  (' + info + ')' : '')); if (b) ok++; else fehler++; }
const AC = R.config.schaden.abschlepp;

// ---------------------------------------------------------------- Teil A
const strecke = new R.Strecke(R.trackCatalog.find(t => t.id === 'wiese'));
const sp = strecke.spline;
const PORSCHE = R.carCatalog.find(a => a.id === 'porsche-911');
function auto(s, q, tempo) {
  const p = sp.punktBei(s), v = new R.Vehicle(PORSCHE.fahrwerte);
  v.setzen(p.x + p.nx * q, p.z + p.nz * q, R.headingAus(p.tx, p.tz)); v.vLaengs = tempo || 0; v.y = strecke.hoeheAn(v.x, v.z);
  return { vehicle: v, istSpieler: true, index: -1, auto: PORSCHE };
}
/** Spur halten (q) mit einfachem Autopilot. */
function spurHalten(f, q, gas) {
  const v = f.vehicle, n = strecke.abfrage(v.x, v.z, f.index); f.index = n.index; v.untergrund = n.untergrund;
  const z = sp.punktBei(n.s + 12), zx = z.x + z.nx * q, zz = z.z + z.nz * q;
  let d = R.headingAus(zx - v.x, zz - v.z) - v.heading; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
  v.schritt(dt, { gas, bremse: 0, lenkung: Math.max(-1, Math.min(1, -d * 2.5)) }, 'aus');
  K.bande(v, strecke);
  return n;
}
/** Lkw-Körper (wie kollidieren) unabhängig nachrechnen: Rechteck 8,0 × 2,55 an der Spur → Eindringtiefe eines Autos. */
function lkwTief(A, i, v) {
  const e = A._holen(i), zs = A.schaden.zustand(i), ab = R.Abschleppwagen.ablauf(zs.liegeVergangen, zs.liegeGesamt);
  if (!zs.liegengeblieben || ab.schwund > 0) return 0;
  if (!e.spurOk) A._spur(i, e);            // VORHER-Lauf (kollidieren aus): Spur trotzdem nachrechnen
  const p = A._pose(e, A._sBei(e, ab));
  const b = new R.Vehicle({ laenge: 8.0, breite: 2.55, masse: 1e7, vMax: 1, rueckwaertsMax: 1, beschleunigung: 1, bremsen: 1 });
  b.x = p.x - Math.sin(p.heading) * 0.425; b.z = p.z - Math.cos(p.heading) * 0.425; b.heading = p.heading; b.y = v.y;
  const k = K.eindringung(v, b);
  return k ? k.tief : 0;
}
/** Szene: Wrack (Index 0) bei s0/q0, Auto 1 nach start(); läuft sek Sekunden ab dem Liegenbleiben. */
function szene(opt) {
  const s0 = 400, q0 = 2.0;
  const wrack = auto(s0, q0, 0); wrack.istSpieler = false;
  const f = opt.auto();
  const fz = [wrack, f];
  const sc = new R.Schaden(fz, { an: true });
  const A = new R.Abschleppwagen(strecke, fz, sc, null);
  sc.z[0].abkling = 0; sc._punkteSetzen(0, 1); sc.treffer(0, 'hindernis', 10);
  const qL = q0 - AC.seitlich;
  const log = { maxTief: 0, kontakte: 0, maxSprung: 0, sMax: -1e9, sEnde: 0, vMax: 0, punkte0: sc.z[1].punkte, lkwAbweichung: 0, n: null };
  let t = 0;
  for (let k = 0; t < opt.sek; k++) {
    const zs = sc.zustand(0);
    if (!zs.liegengeblieben) break;
    if (opt.vorher && opt.vorher(t, f, sc)) { /* Szene greift ein */ }
    const n = opt.steuern ? opt.steuern(f, qL, t) : spurHalten(f, qL, 0);
    const xA = f.vehicle.x, zA = f.vehicle.z;
    const st = A.kollidieren(dt, {});
    log.kontakte += st.length;
    log.maxSprung = Math.max(log.maxSprung, Math.hypot(f.vehicle.x - xA, f.vehicle.z - zA));
    log.maxTief = Math.max(log.maxTief, lkwTief(A, 0, f.vehicle));
    log.vMax = Math.max(log.vMax, f.vehicle.tempo);
    const e = A.eintraege[0];
    if (e && e.koerper && e.koerperAn) {        // Lkw-Körper liegt exakt auf der Spur (nie verschoben)
      const ab = R.Abschleppwagen.ablauf(zs.liegeVergangen, zs.liegeGesamt), p = A._pose(e, A._sBei(e, ab));
      log.lkwAbweichung = Math.max(log.lkwAbweichung, Math.hypot(e.koerper.x - (p.x - Math.sin(p.heading) * 0.425), e.koerper.z - (p.z - Math.cos(p.heading) * 0.425)));
    }
    const nn = strecke.abfrage(f.vehicle.x, f.vehicle.z, f.index);
    log.sMax = Math.max(log.sMax, nn.s); log.sEnde = nn.s; log.n = n;
    sc.schritt(dt);
    t += dt;
  }
  log.verlust = log.punkte0 - sc.z[1].punkte;
  log.lkw = A.eintraege[0];
  return log;
}
const mitUndOhne = (fn) => { const alt = AC.kollision; AC.kollision = false; const vor = fn(); AC.kollision = alt; return { vor, nach: fn() }; };

// A1: Auffahren mit 20 m/s auf den Lkw, der neben dem Wrack steht (Phase 1: 2,5 … 4,0 s) – Auto fährt in der Lkw-Spur
{
  const r = mitUndOhne(() => szene({ sek: 4.0, auto: () => auto(300, 2.0 - AC.seitlich, 0),
    vorher: (t, f) => { if (t >= 2.5 && !f.gesetzt) { f.gesetzt = true; const p = sp.punktBei(384), q = 2.0 - AC.seitlich;      // Lkw steht → Auto 12 m dahinter mit 8 m/s in seine Spur
      f.vehicle.setzen(p.x + p.nx * q, p.z + p.nz * q, R.headingAus(p.tx, p.tz)); f.vehicle.vLaengs = 8; } },
    steuern: (f, q, t) => spurHalten(f, q, t > 2.5 ? 1 : 0) }));
  pruefe('A1 VORHER (nur Optik): Auto fährt durch den stehenden Lkw', r.vor.maxTief > 1.5 && r.vor.kontakte === 0, 'Tiefe ' + r.vor.maxTief.toFixed(2) + ' m, Kontakte ' + r.vor.kontakte);
  pruefe('A1 NACHHER: Kontakt, Auto bleibt draußen (Tiefe ≤ 0,25 m)', r.nach.kontakte > 0 && r.nach.maxTief <= 0.25, 'Tiefe ' + r.nach.maxTief.toFixed(2) + ' m, Kontakte ' + r.nach.kontakte + ', vMax ' + r.nach.vMax.toFixed(1) + ', s ' + r.nach.sMax.toFixed(1) + ' q ' + (r.nach.n && r.nach.n.seitenabstand.toFixed(2)));
  pruefe('A1 Auto kommt nicht am Lkw-Heck vorbei (s ≤ Lkw-Heck)', r.nach.sMax <= 400 - 3.5 + 0.6, 's max ' + r.nach.sMax.toFixed(1) + ' (Heck ' + (400 - 3.5).toFixed(1) + ')');
  pruefe('A1 Schaden: höchstens ein paar Auto-Treffer (Abklingzeit, kein Overkill: ≤ 15 %)', r.nach.verlust > 0 && r.nach.verlust <= 15, '−' + r.nach.verlust + ' %');
  pruefe('A1 Lkw bleibt exakt auf seiner Spur (unbeweglich, unbeschädigt)', r.nach.lkwAbweichung < 1e-9 && !(r.nach.lkw.koerper.daten.masse < 1e6), r.nach.lkwAbweichung.toExponential(1));
  pruefe('A1 kein Sprung (≤ 1 m je Schritt)', r.nach.maxSprung <= 1.0, r.nach.maxSprung.toFixed(2) + ' m');
}
// A2: Lkw fährt in der Anfahrt (0 … 2,5 s) von hinten an ein stehendes Auto in seiner Spur heran → schiebt es weich nach vorn
{
  const r = mitUndOhne(() => szene({ sek: 4.0, auto: () => auto(385, 2.0 - AC.seitlich, 0), steuern: (f, q) => spurHalten(f, q, 0) }));
  pruefe('A2 VORHER: Lkw fährt durch das stehende Auto', r.vor.maxTief > 1.5, 'Tiefe ' + r.vor.maxTief.toFixed(2) + ' m');
  pruefe('A2 NACHHER: Auto wird geschoben, nicht durchfahren (Tiefe ≤ 0,25 m)', r.nach.kontakte > 0 && r.nach.maxTief <= 0.25 && r.nach.sEnde > 385 + 2, 'Tiefe ' + r.nach.maxTief.toFixed(2) + ' m, geschoben ' + (r.nach.sEnde - 385).toFixed(1) + ' m');
  pruefe('A2 weich: kein Wegschleudern (Auto ≤ 6,5 m/s, Sprung ≤ 1 m)', r.nach.vMax <= 6.5 && r.nach.maxSprung <= 1.0, 'vMax ' + r.nach.vMax.toFixed(1) + ' m/s, Sprung ' + r.nach.maxSprung.toFixed(2));
  pruefe('A2 Schaden ≤ 15 %', r.nach.verlust <= 15, '−' + r.nach.verlust + ' %');
}
// A3: Lkw erscheint mitten im Auto (Auto steht genau am Startpunkt der Anfahrt) → durchlassen, kein Sprung, fährt dann frei weg
{
  const sStart = 400 - AC.anfahrtWeg;
  const r = szene({ sek: 2.0, auto: () => auto(sStart + 0.5, 2.0 - AC.seitlich, 0), steuern: (f, q, t) => spurHalten(f, q + (t > 0.2 ? 2.8 : 0), t > 0.2 ? 0.6 : 0) });
  pruefe('A3 Lkw erscheint im Auto: kein Sprung/Wegschleudern (≤ 1 m je Schritt, ≤ 14 m/s)', r.maxSprung <= 1.0 && r.vMax <= 14, 'Sprung ' + r.maxSprung.toFixed(2) + ' m, vMax ' + r.vMax.toFixed(1));
  pruefe('A3 kein Festklemmen: Auto fährt weiter (> 5 m)', r.sEnde - (sStart + 0.5) > 5, (r.sEnde - sStart - 0.5).toFixed(1) + ' m');
}
// A4: von der Seite gegen den stehenden Lkw (quer, 10 m/s, Phase 1) – prallt ab, steckt nicht fest
{
  const r = szene({ sek: 4.0, auto: () => auto(300, 2.0 - AC.seitlich, 0),
    vorher: (t, f) => { if (t >= 2.6 && !f.gesetzt) { f.gesetzt = true; const p = sp.punktBei(399.6), q = 2.0 - AC.seitlich - 6;
      f.vehicle.setzen(p.x + p.nx * q, p.z + p.nz * q, R.headingAus(p.nx, p.nz)); f.vehicle.vLaengs = 10; } },
    steuern: (f, q, t) => { const v = f.vehicle; const n = strecke.abfrage(v.x, v.z, f.index); f.index = n.index; v.untergrund = n.untergrund;
      v.schritt(dt, { gas: 0, bremse: 0, lenkung: 0 }, 'aus'); K.bande(v, strecke); return n; } });
  pruefe('A4 seitlich: Kontakt, Tiefe ≤ 0,25 m, kein Sprung', r.kontakte > 0 && r.maxTief <= 0.25 && r.maxSprung <= 1.0, 'Tiefe ' + r.maxTief.toFixed(2) + ', Kontakte ' + r.kontakte + ', Sprung ' + r.maxSprung.toFixed(2));
}
// A6 (v32 N1c): Verkehrswagen/Polizei stehen in main.js HINTER den Schaden-Einträgen (sc.z kürzer als fahrzeuge) – auch sie stoßen an den Lkw
{
  const s0 = 400, q0 = 2.0, qL = q0 - AC.seitlich;
  const wrack = auto(s0, q0, 0), f = auto(300, qL, 0), vkw = auto(300, qL + 6, 0);
  wrack.istSpieler = false; vkw.istSpieler = false; vkw.polizei = true; vkw.verkehr = { art: 'krankenwagen' }; vkw.vehicle.verkehrWagen = true;
  const fz = [wrack, f], sc = new R.Schaden(fz, { an: true });
  fz.push(vkw);                                         // wie main.js: Verkehr wird NACH new Schaden angehängt
  const A = new R.Abschleppwagen(strecke, fz, sc, null);
  sc.z[0].abkling = 0; sc._punkteSetzen(0, 1); sc.treffer(0, 'hindernis', 10);
  let t = 0, kontakte = 0, maxTief = 0, gesetzt = false, err = null;
  try {
    while (t < 4.0) {
      if (!gesetzt && t >= 2.5) { gesetzt = true; const p = sp.punktBei(386); vkw.vehicle.setzen(p.x + p.nx * qL, p.z + p.nz * qL, R.headingAus(p.tx, p.tz)); vkw.vehicle.vLaengs = 10; }
      if (gesetzt) spurHalten(vkw, qL, 1);
      kontakte += A.kollidieren(dt, {}).filter(x => x.nr === 2).length;
      if (gesetzt) maxTief = Math.max(maxTief, lkwTief(A, 0, vkw.vehicle));
      sc.schritt(dt); t += dt;
    }
  } catch (e) { err = e.message; }
  pruefe('A6 Verkehrswagen hinter den Schaden-Einträgen stößt an den Lkw (Tiefe ≤ 0,25 m, kein Fehler)', !err && kontakte > 0 && maxTief <= 0.25, err || ('Kontakte ' + kontakte + ', Tiefe ' + maxTief.toFixed(2)));
}
// A7/A8 (v32 N1d): Auto steht vor dem WEGFAHRENDEN Lkw in seiner Spur → Lkw wartet (kein Bulldozer); fährt das Auto weg, fährt der Lkw weiter
function wegSzene(losNach, dauerMax) {
  const s0 = 400, q0 = 2.0, qL = q0 - AC.seitlich;
  const wrack = auto(s0, q0, 0), f = auto(300, qL, 0); wrack.istSpieler = false;
  const fz = [wrack, f], sc = new R.Schaden(fz, { an: true }), A = new R.Abschleppwagen(strecke, fz, sc, null);
  sc.z[0].abkling = 0; sc._punkteSetzen(0, 1); sc.treffer(0, 'hindernis', 10);
  const aZeit = AC.anfahrt + AC.aufladen;
  let t = 0, gesetzt = null, schub = 0, ende = null, kontakte = 0, tGesetzt = 0;
  while (t < (dauerMax || 14)) {
    const zs = sc.zustand(0);
    if (!zs.liegengeblieben) { ende = t; break; }
    if (!gesetzt && zs.liegeVergangen >= aZeit + 0.2) {          // Lkw fährt gerade an → Auto 9 m vor die Lkw-Front in seine Spur, steht
      const e = A.eintraege[0], ab = R.Abschleppwagen.ablauf(zs.liegeVergangen, zs.liegeGesamt), sL = A._sBei(e, ab), p = sp.punktBei(sL + 4.35 + 9 + 2.3);
      f.vehicle.setzen(p.x + p.nx * qL, p.z + p.nz * qL, R.headingAus(p.tx, p.tz)); gesetzt = { x: f.vehicle.x, z: f.vehicle.z }; tGesetzt = t;
    }
    if (gesetzt) spurHalten(f, qL, losNach !== undefined && t - tGesetzt > losNach ? 1 : 0); else spurHalten(f, qL, 0);
    kontakte += A.kollidieren(dt, {}).length;
    if (gesetzt && !(losNach !== undefined && t - tGesetzt > losNach)) schub = Math.max(schub, Math.hypot(f.vehicle.x - gesetzt.x, f.vehicle.z - gesetzt.z));
    sc.schritt(dt); t += dt;
  }
  return { schub, ende, kontakte, aufgegeben: !!(A.eintraege[0] && A.eintraege[0].aufgegeben), warte: A.eintraege[0] ? A.eintraege[0].warte : 0 };
}
{
  const alt = AC.wegHalten; AC.wegHalten = false; const vor = wegSzene(); AC.wegHalten = alt;
  const r = wegSzene(), r2 = wegSzene(1.5);
  pruefe('A7 VORHER: wegfahrender Lkw schiebt stehendes Auto vor sich her (Bulldozer)', vor.schub > 3, 'geschoben ' + vor.schub.toFixed(1) + ' m');
  pruefe('A7 NACHHER: Lkw wartet, Auto nicht mitgeschoben (≤ 1 m), kein Stoß', r.schub <= 1 && r.kontakte === 0, 'geschoben ' + r.schub.toFixed(2) + ' m, Kontakte ' + r.kontakte);
  pruefe('A7 Höchstdauer: nach ≤ 10 s verkleinert/abgeschleppt wie bisher', r.ende !== null && r.ende <= 10.1 && r.aufgegeben, 'Ende ' + (r.ende && r.ende.toFixed(2)) + ' s, aufgegeben ' + r.aufgegeben);
  pruefe('A8 Auto fährt nach 1,5 s weg → Lkw fährt weiter, ohne Höchstdauer', r2.ende !== null && !r2.aufgegeben && r2.ende > AC.anfahrt + AC.aufladen + 1 && r2.ende < 10 && r2.kontakte === 0, 'Ende ' + (r2.ende && r2.ende.toFixed(2)) + ' s, gewartet ' + r2.warte.toFixed(2) + ' s, Kontakte ' + r2.kontakte);
}
// A5: Schalter config.schaden.abschlepp.kollision = false → kollidieren tut nichts (alter Stand)
{
  const alt = AC.kollision; AC.kollision = false;
  const fz = [auto(400, 0, 0), auto(400, -3.6, 0)], sc = new R.Schaden(fz, { an: true }), A = new R.Abschleppwagen(strecke, fz, sc, null);
  sc._punkteSetzen(0, 1); sc.treffer(0, 'hindernis', 10);
  const r = A.kollidieren(dt, {});
  AC.kollision = alt;
  const B = new R.Abschleppwagen(strecke, fz, new R.Schaden(fz, { an: false }), null);
  pruefe('A5 Schalter aus / Schaden aus / Countdown → keine Kollision', r.length === 0 && B.kollidieren(dt, {}).length === 0 && A.kollidieren(dt, { countdown: true }).length === 0);
}

// ---------------------------------------------------------------- Teil B: ganzer Physikschritt (main.js) mit Spieler + KI
function rennenMitWrack(sid, ohne) {
  const sim = new Simulation({ einstellungen: { streckeId: sid, runden: 3, gegner: 5, tageszeit: 'tag', jahreszeit: 'sommer', wetter: 'klar', windStaerke: 0, kollisionen: true,
    polizei: true, krankenwagen: true, abschleppwagen: true, geisterfahrer: true },
    spieler: [{ fahrer: 'Jonas', auto: 'porsche-911', hilfe: 'aus' }], seed: 5 });
  const s = sim.sim, fz = s.fahrzeuge, st = s.strecke;
  // v32 N1c: Reihenfolge wie main.js – Schaden kennt nur die Teilnehmer, Polizei/Verkehr hängen dahinter (sc.z kürzer als fahrzeuge)
  s.schaden = new R.Schaden(fz.slice(0, sim.nT), { an: true }); s.schaden.fahrzeuge = fz;
  s.schaden.bei((e) => { try { s._schadenEreignis(e); } catch (err) { /* HUD/Ton fehlen im kopflosen Spiel */ } });
  s.abschlepp = new R.Abschleppwagen(st, fz, s.schaden, null);
  if (ohne) s.abschlepp.kollidieren = () => [];
  const log = { liegen: 0, kontakte: 0, kontakteKI: 0, kontakteMensch: 0, maxTief: 0, steck: 0, verlustMax: 0, drinMax: 0, durchFaelle: 0, kontakteVerkehr: 0, verkehrTief: 0, nT: sim.nT, nAlle: fz.length };
  let idx = -1, ruhe = 0;
  const steh = fz.map(() => 0), drin = fz.map(() => 0);
  for (let k = 0; k < 60 * 75; k++) {
    // Spieler-Autopilot (wie test_verkehr): fährt die Ideallinie
    const v = fz[0].vehicle, n = st.abfrage(v.x, v.z, idx); idx = n.index;
    const vl = Math.max(3, v.vLaengs), L = Math.max(9, Math.min(50, 0.55 * vl + 8)), z = st.spline.punktBei(n.s + L);
    let d = R.headingAus(z.x - v.x, z.z - v.z) - v.heading; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
    const soll = st.tempoBei(n.s + vl * 0.3) * 0.75;
    sim.eingabeSetzen(0, { gas: v.vLaengs < soll ? 1 : 0, bremse: v.vLaengs > soll + 3 ? 0.5 : 0, lenkung: Math.max(-1, Math.min(1, -(2 * vl * Math.sin(d) / Math.hypot(z.x - v.x, z.z - v.z)) / v.drehrateMax(vl))) });
    // alle 12 s ein Computerauto (reihum 1…5) liegenbleiben lassen, wenn gerade keins liegt – möglichst kurz VOR dem Spieler
    if (s.rennen.gasErlaubt && ruhe <= 0 && !s.schaden.z.some(x => x.liegengeblieben)) {
      const tn = s.rennen.teilnehmer, fs0 = tn[0].fortschritt;
      let w = -1, best = 1e9;
      for (let i = 1; i < 6; i++) { const dd = tn[i].fortschritt - fs0; if (dd > 25 && dd < best && !s.schaden.z[i].rep) { best = dd; w = i; } }
      if (w < 0) w = 1 + (log.liegen % 5);
      s.schaden.z[w].abkling = 0; s.schaden._punkteSetzen(w, 1); s.schaden.treffer(w, 'hindernis', 10);
      if (s.schaden.z[w].liegengeblieben) { log.liegen++; ruhe = 12; }
    }
    ruhe -= dt;
    const vorP = fz.map((f, i) => (s.schaden.z[i] ? s.schaden.z[i].punkte : 100));
    sim.schritt();
    const stz = s.abschlepp.stoesse || [];
    for (const x of stz) { log.kontakte++; if (x.nr >= sim.nT) log.kontakteVerkehr++; else if (fz[x.nr].istSpieler) log.kontakteMensch++; else log.kontakteKI++; log.verlustMax = Math.max(log.verlustMax, vorP[x.nr] - (s.schaden.z[x.nr] ? s.schaden.z[x.nr].punkte : 100)); }
    for (let i = 0; i < 6; i++) {
      const zs = s.schaden.z.findIndex(x => x.liegengeblieben);
      // Tiefe nur außerhalb des „Erscheinen im Auto“-Falls (durch: wird sanft herausgeschoben) – dort zählt die Dauer im Lkw
      if (zs >= 0 && i !== zs) {
        // gemessen am tatsächlichen Körper dieses Schritts (lkwTief rechnet mit der Uhr NACH schaden.schritt – in Phase 2 fährt der Lkw bis ~35 m/s, das wären 0,6 m Versatz)
        const e = s.abschlepp.eintraege[zs], kt = e && e.koerper && e.koerperAn ? K.eindringung(fz[i].vehicle, e.koerper) : null, tt = kt ? kt.tief : 0;
        if (e.durch && e.durch[i]) { drin[i] += dt; log.drinMax = Math.max(log.drinMax, drin[i]); log.durchFaelle += drin[i] === dt ? 1 : 0; }
        else { drin[i] = 0; log.maxTief = Math.max(log.maxTief, tt); }
      } else drin[i] = 0;
      // (der einfache Spieler-Autopilot lenkt nicht um Wracks herum – wer am Wrack selbst ansteht, zählt nicht: das ist nicht der Lkw)
      const amWrack = s.stoesse.some(x => (x.a === i && s.schaden.z[x.b] && s.schaden.z[x.b].liegengeblieben) || (x.b === i && s.schaden.z[x.a] && s.schaden.z[x.a].liegengeblieben));
      if (s.rennen.gasErlaubt && !amWrack && !s.schaden.z[i].liegengeblieben && !s.schaden.z[i].rep && !s.rennen.teilnehmer[i].imZiel && fz[i].vehicle.tempo < 0.5) steh[i] += dt; else steh[i] = 0;
      if (i === 0) for (let j = sim.nT; j < fz.length; j++) { const zw = s.schaden.z.findIndex(x => x.liegengeblieben); if (zw >= 0 && !fz[j].ausgeschieden) log.verkehrTief = Math.max(log.verkehrTief, lkwTief(s.abschlepp, zw, fz[j].vehicle)); }
      if (steh[i] > log.steck) { log.steck = steh[i]; log.steckWer = i + (fz[i].istSpieler ? ' Mensch' : ' KI') + ' s=' + Math.round(st.abfrage(fz[i].vehicle.x, fz[i].vehicle.z, -1).s) + ' t=' + Math.round(k / 60); }
    }
  }
  return log;
}
for (const seed of ['wiese', 'wald']) {
  const r = rennenMitWrack(seed);
  pruefe('B ' + seed + ': Wracks mit Abschleppwagen im Rennen (≥ 4)', r.liegen >= 4, r.liegen);
  pruefe('B ' + seed + ': Spieler/KI stoßen an den Lkw (Kontakte > 0) und stecken nie darin (Tiefe ≤ 0,4 m)', r.kontakte > 0 && r.maxTief <= 0.4, 'Kontakte ' + r.kontakte + ' (Mensch ' + r.kontakteMensch + ', KI ' + r.kontakteKI + '), Tiefe ' + r.maxTief.toFixed(2));
  pruefe('B ' + seed + ': Reihenfolge wie main.js (Schaden ' + r.nT + ' < Fahrzeuge ' + r.nAlle + '), Polizei/Verkehr nie im Lkw (Tiefe ≤ 0,4 m)', r.nAlle > r.nT && r.verkehrTief <= 0.4, 'Verkehr-Kontakte ' + r.kontakteVerkehr + ', Tiefe ' + r.verkehrTief.toFixed(2));
  pruefe('B ' + seed + ': Lkw erscheint im Auto → in ≤ 1,5 s sanft heraus', r.drinMax <= 1.5, r.durchFaelle + ' Fälle, längste ' + r.drinMax.toFixed(2) + ' s');
  pruefe('B ' + seed + ': niemand hängt fest (Stillstand < 4 s außer Wrack/Reparatur)', r.steck < 4, r.steck.toFixed(1) + ' s ' + (r.steckWer || ''));
  pruefe('B ' + seed + ': Schaden je Lkw-Treffer ≤ 5 % (normaler Auto-Treffer)', r.verlustMax <= 5, '−' + r.verlustMax + ' %');
}

// ---------------------------------------------------------------- Teil D (v32 N1b): alter Liegeplatz nach dem Aufladen kollisionsfrei
// ganzer Physikschritt (main.js): Wrack = KI 1 bei s 400; Spieler wird zu Zeit tSetz 15 m davor in die Wrack-Spur gesetzt und fährt mit 12 m/s hindurch.
function liegeplatz(tSetz, ohneFix, sAuto) {
  const sim = new Simulation({ einstellungen: { streckeId: 'wiese', runden: 3, gegner: 1, tageszeit: 'tag', jahreszeit: 'sommer', wetter: 'klar', windStaerke: 0, kollisionen: true },
    spieler: [{ fahrer: 'Jonas', auto: 'porsche-911', hilfe: 'aus' }], seed: 5 });
  const s = sim.sim, fz = s.fahrzeuge, st = s.strecke, sp2 = st.spline;
  s.schaden = new R.Schaden(fz, { an: true });
  s.schaden.bei((e) => { try { s._schadenEreignis(e); } catch (err) { /* kopflos */ } });
  s.abschlepp = new R.Abschleppwagen(st, fz, s.schaden, null);
  if (ohneFix) s.abschlepp._freiSetzen = function () { this.frei = false; };
  for (let k = 0; k < 60 * 6; k++) sim.schritt();          // Countdown vorbei
  const setz = (f, sS, q, v0) => { const p = sp2.punktBei(sS); f.vehicle.setzen(p.x + p.nx * q, p.z + p.nz * q, R.headingAus(p.tx, p.tz)); f.vehicle.vLaengs = v0; f.vehicle.y = st.hoeheAn(f.vehicle.x, f.vehicle.z); f.index = -1; f.nah = null; s._vorherAngleichen && s._vorherAngleichen(f); };
  setz(fz[1], 400, 1.5, 0); setz(fz[0], 250, -4, 0);
  s.schaden.z[1].abkling = 0; s.schaden._punkteSetzen(1, 1); s.schaden.treffer(1, 'hindernis', 10);
  const log = { wrackStoss: 0, gesetzt: false, phase: -1, vorbei: false };
  for (let k = 0; k < 60 * 6; k++) {
    const zs = s.schaden.zustand(1);
    if (!log.gesetzt && zs.liegengeblieben && zs.liegeVergangen >= tSetz) { log.gesetzt = true; setz(fz[0], sAuto || 386, 1.5, 12); log.phase = R.Abschleppwagen.ablauf(zs.liegeVergangen, zs.liegeGesamt).phase; }
    const v = fz[0].vehicle, n = st.abfrage(v.x, v.z, -1), z = sp2.punktBei(n.s + 12);
    let d = R.headingAus(z.x + z.nx * 1.5 - v.x, z.z + z.nz * 1.5 - v.z) - v.heading; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
    sim.eingabeSetzen(0, log.gesetzt ? { gas: v.vLaengs < 12 ? 1 : 0, bremse: 0, lenkung: Math.max(-1, Math.min(1, -d * 2.5)) } : { gas: 0, bremse: 1, lenkung: 0 });
    sim.schritt();
    if (log.gesetzt && s.schaden.zustand(1).liegengeblieben && s.stoesse.some(x => (x.a === 0 && x.b === 1) || (x.a === 1 && x.b === 0))) log.wrackStoss++;
    if (log.gesetzt && st.abfrage(v.x, v.z, -1).s > 404) log.vorbei = true;
    if (log.gesetzt && (log.vorbei || !s.schaden.zustand(1).liegengeblieben)) break;
  }
  return log;
}
{
  const tA = AC.anfahrt + AC.aufladen * 0.3, tW = AC.anfahrt + AC.aufladen + 0.3;
  const vA = liegeplatz(tA, true), nA = liegeplatz(tA), nW = liegeplatz(tW, false, 392), n0 = liegeplatz(0.5);
  pruefe('D VORHER: Auto stößt beim Aufladen am alten Liegeplatz an ein unsichtbares Wrack', vA.phase === 1 && vA.wrackStoss > 0, 'Stöße ' + vA.wrackStoss);
  pruefe('D NACHHER Aufladen: Auto fährt durch den alten Liegeplatz – kein Stoß', nA.phase === 1 && nA.wrackStoss === 0 && nA.vorbei, 'Stöße ' + nA.wrackStoss + ', vorbei ' + nA.vorbei);
  pruefe('D NACHHER Wegfahren: kein Stoß am alten Liegeplatz', nW.phase === 2 && nW.wrackStoss === 0 && nW.vorbei, 'Stöße ' + nW.wrackStoss + ', vorbei ' + nW.vorbei);
  pruefe('D Anfahrt (Wrack liegt noch sichtbar da): Stoß wie bisher', n0.phase === 0 && n0.wrackStoss > 0, 'Stöße ' + n0.wrackStoss);
}

// ---------------------------------------------------------------- Teil C: online (server/simulation.js)
function verkehrStoss(koll) {
  const sim = new Simulation({ einstellungen: { streckeId: 'wiese', runden: 2, gegner: 0, abschleppwagen: true, kollisionen: koll }, spieler: [{ fahrer: 'J', auto: 'porsche-911', hilfe: 'aus' }], seed: 3 });
  const s = sim.sim, st = s.strecke, vk = s.verkehr, e = vk.eintraege.find(x => x.art === 'abschleppwagen');
  for (let k = 0; k < 60 * 5; k++) sim.schritt();
  const p = s.fahrzeuge[0].vehicle, n = st.abfrage(p.x, p.z, -1);
  e.route = { a: n.s, b: n.s + 2000 }; vk._erscheinen(e, n.s + 60, n.seitenabstand / (st.breite / 2), 9.5); e.pause = 1e9;
  let minD = 1e9, kontakt = 0, maxTief = 0;
  const lv = e.f.vehicle;
  for (let k = 0; k < 60 * 12; k++) {
    let d = R.headingAus(lv.x - p.x, lv.z - p.z) - p.heading; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
    sim.eingabeSetzen(0, { gas: 1, bremse: 0, lenkung: Math.max(-1, Math.min(1, -d * 3)) });
    sim.schritt();
    minD = Math.min(minD, Math.hypot(lv.x - p.x, lv.z - p.z));
    if (s.stoesse.some(x => x.a === 0 || x.b === 0)) kontakt++;
    const t = K.eindringung(p, lv); if (t) maxTief = Math.max(maxTief, t.tief);
  }
  return { minD, kontakt, maxTief, aktiv: e.aktiv, abschlepp: s.abschlepp };
}
for (const koll of [true, false]) {
  const r = verkehrStoss(koll);
  pruefe('C online ' + (koll ? 'Rempeln' : 'Geister') + ': Spieler stößt mit Verkehrs-Abschleppwagen (Abstand ≥ 5 m, Tiefe ≤ 0,3 m)', r.aktiv && r.kontakt > 0 && r.minD >= 5 && r.maxTief <= 0.3,
    'Kontakt-Schritte ' + r.kontakt + ', min. Mittenabstand ' + r.minD.toFixed(2) + ' m, Tiefe ' + r.maxTief.toFixed(2));
  pruefe('C online ' + (koll ? 'Rempeln' : 'Geister') + ': kein Crash-Abschleppwagen im Server (Schaden aus)', !r.abschlepp);
}

console.log('\n' + ok + ' OK, ' + fehler + ' FEHL');
process.exit(fehler ? 1 : 0);
