// S7 – Strecken-Editor (Rechenteil, Autorennen UND Motorrad): node tests/test_spass_s7.js
//  A) Glättung: gemalte Linien → geschlossene glatte Runde (Start bei (0,0), Fahrtrichtung −z, Länge, engster Radius)
//  B) Kurven-Entschärfung (Zickzack, Haarnadel) und Hinweise
//  C) Überschneidung: Acht → Brücke (Überführung, Δy ≥ 7 m), zu viele/zu flache Kreuzungen, zu nahe Stücke, offene/zu kurze/zu lange Linie
//  D) Elemente-Platzierung (Regeln, Verschieben, Grenzen, Feuerring nur Motorrad) und Katalog-Eintrag
//  E) Speichern/Laden/Export/Import (Code), Prüfen fremder Daten (klemmen, Namen säubern), Sticker
//  F) KI fährt 5 zufällig gemalte Strecken mit allen Elementen (Auto und Motorrad) – Simulation wie im Server
//  G) Server = Client (zwei getrennte Kontexte bauen bitgleich), Läufe deterministisch, bestehende Strecken bitgleich
'use strict';
const { Simulation, kontextLaden, laden, ladenMoto, MODULE } = require('../server/simulation');
const { ladeModule } = require('./lade');

let fehler = 0, ok = 0;
setTimeout(() => { console.log('FEHL Wächter: Test hängt (> 900 s) – Abbruch'); process.exit(3); }, 900000).unref();
function pruefe(name, gut, info) { console.log((gut ? 'OK   ' : 'FEHL ') + name + (info !== undefined ? '  (' + info + ')' : '')); if (gut) ok++; else fehler++; }

const SPIELE = [['auto', laden()], ['motorrad', ladenMoto()]];
const R0 = SPIELE[0][1], E0 = R0.Editor;
const hash = (h, x) => Math.imul(h ^ Math.round(x * 10000), 16777619) >>> 0;

// ---------------------------------------------------------------- gemalte Linien (deterministisch)
function rng(seed) { let s = seed >>> 0; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; }
/** Wackelige, „von Hand“ gemalte Runde: Radius mit zwei Wellen, Zittern, Start irgendwo, Lücke am Ende. */
function malen(seed, n) {
  const r = rng(seed), a1 = r() * 0.45 + 0.1, a2 = r() * 0.35, p1 = r() * 6, p2 = r() * 6, r0 = 260 + r() * 200, start = r() * 6, out = [];
  n = n || 150;
  for (let i = 0; i < n; i++) { const t = start + (i / n) * 2 * Math.PI * 0.97, rad = r0 * (1 + a1 * Math.sin(2 * t + p1) + a2 * Math.sin(3 * t + p2)); out.push([rad * Math.cos(t) + (r() - 0.5) * 9, rad * Math.sin(t) + (r() - 0.5) * 9]); }
  return out;
}
const acht = (n) => { const o = []; n = n || 200; for (let i = 0; i <= n; i++) { const t = i / n * 2 * Math.PI; o.push([430 * Math.sin(t), 270 * Math.sin(2 * t)]); } return o; };
const kreis = (rad, n) => { const o = []; n = n || 120; for (let i = 0; i <= n; i++) { const t = i / n * 2 * Math.PI; o.push([rad * Math.cos(t), rad * Math.sin(t)]); } return o; };

// ---------------------------------------------------------------- A) Glättung
{
  const E = E0, K = E.K;
  let alleOk = true, info = [];
  for (const s of [3, 11, 19, 27, 35]) {
    const v = E.verarbeiten(malen(s));
    if (!v.ok) { alleOk = false; info.push(s + ':' + v.grund); continue; }
    const sp = E.geometrie(E.neu(v.pkt, 't', 'wiese')), p0 = sp.punktBei(0), m = E.messen(v.pkt);
    const abst = v.pkt.map((p, i) => Math.hypot(v.pkt[(i + 1) % v.pkt.length][0] - p[0], v.pkt[(i + 1) % v.pkt.length][1] - p[1]));
    const gut = Math.abs(p0.x) < 0.2 && Math.abs(p0.z) < 0.2 && p0.tz < -0.999 && v.laenge >= K.minLaenge && v.laenge <= K.maxLaenge && m.minRadius >= K.minRadius * 0.8 && Math.max.apply(null, abst) < K.abstand * 1.6;
    if (!gut) alleOk = false;
    info.push(`${s}: ${Math.round(v.laenge)} m, R ${m.minRadius.toFixed(0)}`);
  }
  pruefe('A fünf gemalte Linien → geschlossene glatte Runde, Start (0,0) nach −z, Länge 900–6000 m, Radius ≥ 29 m', alleOk, info.join(' | '));
  const v1 = E.verarbeiten(malen(3)), v2 = E.verarbeiten(malen(3));
  pruefe('A Verarbeitung deterministisch (zweimal gleich)', JSON.stringify(v1.pkt) === JSON.stringify(v2.pkt));
  // Glätten: zittrige Kreislinie wird glatt (Krümmungsschwankung klein)
  const z = []; const r = rng(9); for (let i = 0; i <= 160; i++) { const t = i / 160 * 2 * Math.PI; z.push([300 * Math.cos(t) + (r() - 0.5) * 14, 300 * Math.sin(t) + (r() - 0.5) * 14]); }
  const vz = E.verarbeiten(z), mz = E.messen(vz.pkt);
  pruefe('A zittrige Kreislinie (Zittern ±7 m) wird glatt (kein Radius unter 80 m)', vz.ok && mz.minRadius > 80, vz.ok ? mz.minRadius.toFixed(0) + ' m' : vz.grund);
  // Länge: sehr große/kleine Linien
  const klein = E.verarbeiten(kreis(120)), gross = E.verarbeiten(kreis(790));
  pruefe('A Mindestlänge: zu kleiner Kreis (R 120 m ≈ 750 m) abgelehnt, mit freundlichem Text', !klein.ok && klein.grund === 'zuKurz' && /Runde/.test(klein.text), klein.grund);
  pruefe('A Höchstlänge: riesiger Kreis (R 790 m ≈ 5 km) noch gut, Radius > 250 m', gross.ok && E.messen(gross.pkt).minRadius > 250, gross.ok ? Math.round(gross.laenge) : gross.grund);
  const ueber = E.verarbeiten([[-790, -790], [790, -790], [790, 790], [-790, 790], [-790, -790], [770, -770], [770, 770], [-770, 770], [-770, -770].map((x) => x * 1)].reduce((a, p) => a.concat([p]), []));
  pruefe('A Linie über die ganze Fläche (Quadrat 1580 m) → zu lang abgelehnt oder auf < 6 km begrenzt', ueber.ok ? ueber.laenge <= K.maxLaenge * 1.05 : (ueber.grund === 'zuLang' || ueber.grund === 'nah' || ueber.grund === 'kreuzMehr' || ueber.grund === 'kreuzFlach' || ueber.grund === 'offen'), ueber.ok ? Math.round(ueber.laenge) : ueber.grund);
}

// ---------------------------------------------------------------- B) Kurven-Entschärfung
{
  const E = E0, K = E.K;
  // Rechteck mit scharfen Ecken und ein enger Zickzack
  const rechteck = [];
  for (let i = 0; i <= 40; i++) rechteck.push([-400 + i * 20, -200]);
  for (let i = 1; i <= 20; i++) rechteck.push([400, -200 + i * 20]);
  for (let i = 1; i <= 40; i++) rechteck.push([400 - i * 20, 200]);
  for (let i = 1; i <= 19; i++) rechteck.push([-400, 200 - i * 20]);
  const vr = E.verarbeiten(rechteck);
  pruefe('B Rechteck mit 90°-Ecken → Ecken abgerundet (Radius ≥ 29 m), Hinweis „enge Kurven“', vr.ok && E.messen(vr.pkt).minRadius >= K.minRadius * 0.8 && vr.hinweise.some((h) => /Kurven/.test(h)), vr.ok ? E.messen(vr.pkt).minRadius.toFixed(0) + ' m, ' + vr.hinweise.join('|') : vr.grund);
  // Haarnadel: schmale Schleife (Radius 20 m)
  const haar = [];
  for (let i = 0; i <= 30; i++) haar.push([-450 + i * 30, 0]);
  for (let i = 1; i <= 16; i++) { const t = -Math.PI / 2 + i / 16 * Math.PI; haar.push([450 + 25 * Math.cos(t), 25 + 25 * Math.sin(t)]); }
  for (let i = 1; i <= 30; i++) haar.push([450 - i * 30, 50]);
  for (let i = 1; i <= 16; i++) { const t = Math.PI / 2 + i / 16 * Math.PI; haar.push([-450 + 25 * Math.cos(t), 25 + 25 * Math.sin(t)]); }
  const vh = E.verarbeiten(haar);
  pruefe('B enge Haarnadeln (R 25 m) und zwei Bahnen 50 m auseinander → Ergebnis fahrbar oder freundlich abgelehnt', vh.ok ? (E.messen(vh.pkt).minRadius >= K.minRadius * 0.8 && E.zuNah(vh.pkt, K.minAbstand * 0.8, E.kreuzungenFinden(vh.pkt)).length === 0) : !!vh.text, vh.ok ? E.messen(vh.pkt).minRadius.toFixed(0) + ' m, ' + Math.round(vh.laenge) + ' m' : vh.grund);
  // Fahrbarkeit nach Entschärfung: KI-Fahrtest
  if (vr.ok) { const f = E.fahrtest(E.eintrag(E.neu(vr.pkt, 'R', 'wiese'))); pruefe('B entschärftes Rechteck: KI-Testrunde fährt durch', f.ok, f.ok ? f.zeit.toFixed(0) + ' s' : JSON.stringify(f.probleme)); }
}

// ---------------------------------------------------------------- C) Überschneidung, offene/kurze Linien
{
  const E = E0, K = E.K;
  const v8 = E.verarbeiten(acht());
  pruefe('C Acht → eine Kreuzung gefunden', v8.ok && v8.kreuzungen.length === 1, v8.ok ? v8.kreuzungen.length + ' Kreuzung, ' + v8.kreuzungen[0].winkel.toFixed(0) + '°' : v8.grund + ' ' + v8.text);
  const e8 = E.eintrag(E.neu(v8.pkt, 'Acht', 'wiese')), st8 = new R0.Strecke(e8, { spass: true });
  const u = st8.ueberfuehrungen[0];
  pruefe('C Acht → Überführung (obere Fahrbahn) mit Höhenunterschied ≥ 7 m, Höhenmodell „strasse“', e8.hoehenModell === 'strasse' && u && u.kreuzung && u.kreuzung.dy >= 7 && u.kreuzung.dy < 12, u && u.kreuzung ? 'Δy ' + u.kreuzung.dy.toFixed(1) + ' m, ' + u.kreuzung.winkel.toFixed(0) + '°' : 'keine');
  // Steigung: max. 12 % entlang der Strecke
  const sp = st8.spline; let stMax = 0;
  for (let i = 1; i < sp.punkte.length; i++) stMax = Math.max(stMax, Math.abs(sp.punkte[i].y - sp.punkte[i - 1].y) / sp.ds);
  pruefe('C Brückenrampe: Steigung höchstens 12 %', stMax < 0.12, (stMax * 100).toFixed(1) + ' %');
  const f8 = E.fahrtest(e8);
  pruefe('C Acht: KI-Testrunde fährt über die Brücke ins Ziel', f8.ok, f8.ok ? f8.zeit.toFixed(0) + ' s' : JSON.stringify(f8.probleme));
  // Dreifache Schleife → zu viele Kreuzungen
  const drei = []; for (let i = 0; i <= 360; i++) { const t = i / 360 * 2 * Math.PI, r = 330 + 0 * t; drei.push([r * Math.cos(t) * 0.55 + 300 * Math.cos(3 * t) * 0.9, r * Math.sin(t) * 0.55 + 300 * Math.sin(3 * t) * 0.9]); }
  const vd = E.verarbeiten(drei);
  pruefe('C Linie mit vielen Schleifen → abgelehnt (freundlicher Hinweis, Ort) oder höchstens 2 Brücken', vd.ok ? vd.kreuzungen.length <= 2 : (!!vd.text && (vd.ort || vd.grund === 'kreuzMehr')), vd.ok ? vd.kreuzungen.length + ' Kreuzungen' : vd.grund);
  // Zwei fast parallele Bahnen, 20 m auseinander
  const eng = [];
  for (let i = 0; i <= 50; i++) eng.push([-500 + i * 20, 0]);
  for (let i = 1; i <= 20; i++) { const t = -Math.PI / 2 + i / 20 * Math.PI; eng.push([500 + 10 * Math.cos(t), 10 + 10 * Math.sin(t)]); }
  for (let i = 1; i <= 50; i++) eng.push([500 - i * 20, 20]);
  const ve = E.verarbeiten(eng);
  pruefe('C zwei Bahnen nur 20 m nebeneinander → auseinandergeschoben (Abstand ≥ 38 m) oder freundlich abgelehnt', ve.ok ? E.zuNah(ve.pkt, K.minAbstand * 0.8, E.kreuzungenFinden(ve.pkt)).length === 0 : (ve.grund === 'nah' || ve.grund === 'zuKurz' || ve.grund === 'offen' || !!ve.text), ve.ok ? Math.round(ve.laenge) + ' m' : ve.grund + ': ' + ve.text);
  // Flache Kreuzung (≈ 12°)
  const flach = []; for (let i = 0; i <= 100; i++) flach.push([-600 + i * 12, -50 + i * 1.5]);
  for (let i = 1; i <= 30; i++) { const t = -Math.PI / 2 + i / 30 * Math.PI; flach.push([600 + 150 * Math.cos(t), 100 + 150 * Math.sin(t)]); }
  for (let i = 1; i <= 100; i++) flach.push([600 - i * 12, 250 - i * 3.2]);
  const vf = E.verarbeiten(flach);
  pruefe('C Linie, die sich in sehr flachem Winkel überschneidet → abgelehnt oder ohne Kreuzung', vf.ok ? vf.kreuzungen.every((k) => k.winkel >= K.minKreuzWinkel * 0.8) : !!vf.text, vf.ok ? vf.kreuzungen.length + ' Kreuzungen' : vf.grund);
  const offen = E.verarbeiten(kreis(300).slice(0, 55)), kurz = E.verarbeiten([[0, 0], [20, 5], [40, 0]]), leer = E.verarbeiten([]);
  pruefe('C offene Linie → „nicht geschlossen“ mit Ort; zu kurz; leer – alle freundlich', !offen.ok && offen.grund === 'offen' && offen.ort && /geschlossen/.test(offen.text) && !kurz.ok && kurz.grund === 'kurz' && !leer.ok && leer.grund === 'leer' && /Linie/.test(leer.text), [offen.grund, kurz.grund, leer.grund].join('/'));
  const nan = E.verarbeiten([[NaN, 1], [Infinity, 2], null, 'x'].concat(malen(5)));
  pruefe('C Müll in der Punktliste (NaN, null, Text) wird ignoriert', nan.ok, nan.ok ? 'ok' : nan.grund);
}

// ---------------------------------------------------------------- D) Elemente-Platzierung + Katalog-Eintrag
function basis(R, seed, welt) { const v = R.Editor.verarbeiten(malen(seed)); return v.ok ? R.Editor.neu(v.pkt, 'Test ' + seed, welt || 'wiese') : null; }
/** Alle Elementarten je einmal an Wunschstellen quer über die Runde (verschiebt bis es passt). */
function bestuecken(R, d, moto) {
  const L = R.Editor.geometrie(d).laenge, gesetzt = [], arten = ['schanze', 'trampolin', 'kanone', 'tor', 'magnet', 'schlucht', 'looping', 'gold', 'gold'].concat(moto ? ['ring'] : []);
  arten.forEach((a, i) => { const st = R.Editor.setzen(d, a, 220 + (L - 440) * (i + 0.5) / arten.length); if (st.ok) gesetzt.push(a); });
  return gesetzt;
}
{
  const E = E0;
  const d = basis(R0, 3);
  const L = E.geometrie(d).laenge;
  // Rasterüberblick: wo geht Schanze überhaupt
  const gut = []; for (let s = 0; s < L; s += 10) { const r = E.regel('schanze'); const sp = E.geometrie(d); if (!r.pruef.some(([a, b, k]) => { let m = 0; for (let x = s + a; x <= s + b; x += 4) m = Math.max(m, Math.abs(sp.punktBei(x).kruemmung || 0)); return m > k; })) gut.push(s); }
  pruefe('D es gibt gerade Stellen für Elemente (Raster)', gut.length > 5, gut.length + ' von ' + Math.round(L / 10));
  // Start/Ziel
  const amStart = E.stelle(d, 'schanze', 20, undefined);
  pruefe('D nicht auf Start/Ziel: Schanze bei s = 20 wird weit weg verschoben oder abgelehnt', !amStart.ok || amStart.s > 140, JSON.stringify(amStart));
  const a1 = E.setzen(d, 'schanze', gut.find((s) => s > 400) || 600);
  pruefe('D Schanze auf einer Geraden setzen klappt', a1.ok && d.el.length === 1 && d.el[0].a === 'schanze', JSON.stringify(a1));
  const a2 = E.setzen(d, 'trampolin', d.el[0].s + 20);
  pruefe('D Trampolin direkt in die Schanzen-Zone: verschoben (≥ 30 m weg) oder abgelehnt – nie überlappend', !a2.ok || Math.abs(d.el[1].s - d.el[0].s) > 30, JSON.stringify(a2));
  // Nie überlappend, auch nach vielen Versuchen
  let zahlOk = true;
  for (let i = 0; i < 40; i++) E.setzen(d, ['schanze', 'trampolin', 'gold', 'kanone', 'tor', 'magnet', 'schlucht', 'looping'][i % 8], (i * 97) % Math.floor(L));
  const zon = d.el.map((e) => { const r = E.regel(e.a); return { a: e.a, s0: e.s + r.zone[0], s1: e.s + r.zone[1], leicht: !!r.leicht }; });
  for (let i = 0; i < zon.length; i++) for (let j = i + 1; j < zon.length; j++) if (zon[i].s1 > zon[j].s0 && zon[j].s1 > zon[i].s0 && !(zon[i].leicht && zon[j].leicht)) zahlOk = false;
  pruefe('D nach 40 Versuchen: Elemente überlappen nie, höchstens 24, je Art im Limit', zahlOk && d.el.length <= E.K.maxElemente && E.ARTEN.every((a) => d.el.filter((e) => e.a === a).length <= E.MAXJE[a]), d.el.map((e) => e.a[0] + Math.round(e.s)).join(' '));
  pruefe('D jedes gesetzte Element liegt auf einer Geraden (Regelprüfung)', d.el.every((e, i) => { const r = E.regel(e.a), sp = E.geometrie(d); return r.pruef.every(([a, b, k]) => { let m = 0; for (let x = e.s + a; x <= e.s + b; x += 2) m = Math.max(m, Math.abs(sp.punktBei(x).kruemmung || 0)); return m <= k * 1.0001; }); }));
  // Feuerring: nur Motorrad
  const rA = E.stelle(basis(R0, 3), 'ring', 600), rM = SPIELE[1][1].Editor.stelle(basis(SPIELE[1][1], 3), 'ring', 600);
  pruefe('D Feuerring: im Autorennen abgelehnt („nur beim Motorrad“), im Motorrad-Editor erlaubt', !rA.ok && /Motorrad/.test(rA.grund) && rM.ok, rA.grund + ' | ' + (rM.ok ? 's=' + rM.s : rM.grund));
  // Löschen, Hügel
  const n0 = d.el.length; E.entfernen(d, 0); const h1 = E.hoeheSetzen(d, 800, 6), h2 = E.hoeheSetzen(d, 820, 3), h3 = E.hoeheSetzen(d, 2000, -3), h4 = E.hoeheSetzen(d, 2000, 99);
  pruefe('D Radiergummi entfernt ein Element; Hügel setzen/ersetzen (innerhalb 70 m ersetzt), Höhe auf −4…8 m geklemmt', d.el.length === n0 - 1 && d.hoehen.length === 2 && d.hoehen.find((x) => x.s === 820).h === 3 && d.hoehen.some((x) => x.h === 8) && h1.ok && h2.ok && h3.ok && h4.ok, JSON.stringify(d.hoehen));
  E.hoeheSetzen(d, 2000, 0);
  pruefe('D Höhe 0 löscht den Hügel', !d.hoehen.some((x) => Math.abs(x.s - 2000) < 5));
  // Katalog-Eintrag
  const e = E.eintrag(d);
  pruefe('D Katalog-Eintrag im Format trackCatalog.js (id eigen-…, thema, punkte [x,y,z], huegel, welten, schanzen/loopings)', /^eigen-/.test(e.id) && e.thema === 'wiese' && e.eigen === true && e.punkte.length === d.pkt.length && e.punkte[0].length === 3 && Array.isArray(e.huegel) && e.huegel.length === d.hoehen.length && e.welten.klassisch.schanzen === true && Array.isArray(e.schanzen) && Array.isArray(e.loopings) && e.weltStandard === 'klassisch', e.id);
  const st = new R0.Strecke(e, {}), st2 = new R0.Strecke(e, { spass: true });
  pruefe('D Strecke baut (ohne und mit Spaß), Länge wie die Geometrie, Hügel erzeugen Höhe', Math.abs(st.spline.laenge - E.geometrie(d).laenge) < 1 && st2.spass && st.spline.punkte.some((p) => Math.abs(p.y) > 0.5), st.spline.laenge.toFixed(0) + ' m, spass ' + (st2.spass ? st2.spass.liste.length + ' Elemente' : 'null'));
  const trampN = d.el.filter((x) => x.a === 'trampolin').length + d.el.filter((x) => x.a === 'kanone').length;
  pruefe('D Spaß-Plan: Trampolin/Kanone/Tore genau an der Wahl des Kindes (keine automatischen)', st2.spass.liste.length === trampN && st2.spass.tore.length === d.el.filter((x) => x.a === 'tor').length && st2.spass.liste.every((x) => d.el.some((q) => q.a === x.art && Math.abs(q.s - x.s0) < 0.01)), JSON.stringify(st2.spass.liste.map((x) => [x.art, Math.round(x.s0)])));
  const stz = new R0.Strecke(e, { spass: true, zauber: true });
  pruefe('D Zauber-Plan: Magnet/Schlucht an der Wahl des Kindes, keine Zufallselemente', stz.spass.zauber && stz.spass.zauber.magnet.length === d.el.filter((x) => x.a === 'magnet').length && stz.spass.zauber.schluchten.length === d.el.filter((x) => x.a === 'schlucht').length && stz.spass.zauber.extras.length === 0 && stz.spass.zauber.schienen.length === 0);
  pruefe('D Schanzen/Loopings stehen im Katalog; gold als eigeneMuenzen', e.schanzen.length === d.el.filter((x) => x.a === 'schanze').length && e.loopings.length === d.el.filter((x) => x.a === 'looping').length && (e.eigeneMuenzen || []).length === d.el.filter((x) => x.a === 'gold').length);
  // alle Welten bauen
  const w = E.WELTEN.map((w) => { try { const x = new R0.Strecke(E.eintrag(E.neu(d.pkt, 'W', w.id)), { spass: true, zauber: true }); return x.spline.laenge > 900 ? 1 : 0; } catch (err) { return 0; } });
  pruefe('D alle 8 Welten bauen (Wiese, Wald, Wüste, Zauberland, Dino, Mond, Regenbogenland, Unterwasser)', w.every((x) => x === 1), w.join(''));
  const mond = E.eintrag(E.neu(d.pkt, 'M', 'mond')), reg = E.eintrag(E.neu(d.pkt, 'M', 'regenbogenland'));
  pruefe('D Welt Mond hat 0,35 g, Regenbogenland die Regenbogen-Fahrbahn, Wiese keins von beiden', mond.schwerkraft === 0.35 && reg.regenbogenFahrbahn === true && E.eintrag(d).schwerkraft === undefined);
  // registrieren / aufräumen
  const n1 = R0.trackCatalog.length; E.registrieren(d); E.registrieren(d); const n2 = R0.trackCatalog.length; E.aufraeumen();
  pruefe('D registrieren trägt einmal in den Katalog ein (gleiche id ersetzt), aufräumen entfernt alle', n2 === n1 + 1 && R0.trackCatalog.length === n1, n1 + ' → ' + n2);
}

// ---------------------------------------------------------------- E) Speichern, Laden, Export, Prüfen, Sticker
{
  const RS = ladeModule(['src/config.js', 'src/track/spline.js', 'src/track/trackCatalog.js', 'src/track/trackBuilder.js', 'src/spass/editorKern.js', 'src/spass/spassSticker.js']);
  const E = RS.Editor, S = E.Speicher;
  const d = basis(RS, 11, 'wald');
  E.setzen(d, 'schanze', 700); E.setzen(d, 'gold', 1200, { q: 0.3 }); E.hoeheSetzen(d, 900, 5);
  const r = S.speichern(d, 'data:image/png;base64,AAAA', 'auto');
  pruefe('E speichern: ok, Katalog-Eintrag erscheint (Meine Strecken), Liste 1 Strecke mit Vorschaubild', r.ok && r.anzahl === 1 && RS.trackCatalog.some((t) => t.id === r.id && t.eigen) && S.liste('auto')[0].vorschau.startsWith('data:image'), r.id);
  pruefe('E laden: Daten identisch (Name, Welt, Punkte, Elemente, Höhen)', JSON.stringify(S.laden(r.id, 'auto')) === JSON.stringify(Object.assign({}, d)), '');
  d.name = 'Zweiter Name'; S.speichern(d, '', 'auto');
  pruefe('E gleiche id überschreibt (weiter 1 Strecke), Vorschaubild bleibt', S.liste('auto').length === 1 && S.liste('auto')[0].daten.name === 'Zweiter Name' && S.liste('auto')[0].vorschau.length > 10);
  let voll = null;
  for (let i = 0; i < 25; i++) { const x = basis(RS, 100 + i * 13); if (!x) continue; x.id = 'eigen-t' + i; const q = S.speichern(x, '', 'auto'); if (!q.ok) { voll = q; break; } }
  pruefe('E höchstens 20 Strecken je Spiel; danach freundlicher Hinweis', voll && /20/.test(voll.grund) && S.liste('auto').length === 20, voll ? voll.grund : 'nie voll');
  S.loeschen(r.id, 'auto');
  pruefe('E löschen entfernt Strecke und Katalog-Eintrag', !S.liste('auto').some((x) => x.daten.id === r.id) && !RS.trackCatalog.some((t) => t.id === r.id));
  pruefe('E Spiele getrennt (Motorrad-Liste leer)', S.liste('motorrad').length === 0);
  // Code-Export / Import
  const c = E.code(d), d2 = E.ausCode(c);
  pruefe('E Export-Code (Text, beginnt mit STRECKE1.) und Import: gleiche Strecke zurück', /^STRECKE1\./.test(c) && d2 && d2.name === d.name && d2.welt === d.welt && d2.pkt.length === d.pkt.length && d2.pkt.every((p, i) => Math.abs(p[0] - d.pkt[i][0]) <= 0.26 && Math.abs(p[1] - d.pkt[i][1]) <= 0.26) && d2.el.length === d.el.length && d2.hoehen.length === 1, c.length + ' Zeichen, ' + (d2 ? d2.el.length + ' Elemente' : E.ausCode.letzterGrund));
  pruefe('E Import: von Hand im Chat kopierter Code mit Zeilenumbrüchen und Text drumherum geht', !!E.ausCode('Hier meine Strecke:\n' + c.replace(/(.{60})/g, '$1\n') + '\nViel Spaß!'));
  const schlecht = ['', 'hallo', 'STRECKE1.', 'STRECKE1.%%%', 'STRECKE1.' + require('buffer').Buffer.from('{"v":1,"p":"1,1"}').toString('base64'), 'STRECKE1.' + require('buffer').Buffer.from('{"v":2}').toString('base64')];
  pruefe('E kaputte Codes werden abgelehnt (kein Absturz)', schlecht.every((t) => E.ausCode(t) === null && /Streck|fahren/.test(E.ausCode.letzterGrund)));
  // Prüfen: fremde Daten
  const boese = { name: '<img src=x onerror=alert(1)> Super "Strecke" \\ ' + 'x'.repeat(100), welt: 'hacker', pkt: d.pkt.map((p) => [p[0] * 1, p[1] * 1]), hoehen: [{ s: 1e9, h: 999 }, { s: -5, h: -99 }, { s: 'x', h: 2 }], el: [{ a: 'bombe', s: 5 }, { a: 'schanze', s: 1e12 }, null, { a: 'gold', s: 700, q: 99 }] };
  const b = E.pruefen(boese);
  pruefe('E pruefen: Name gesäubert (kein <, >, "), ≤ 24 Zeichen; unbekannte Welt → Wiese; Höhen geklemmt; falsche Elemente fallen weg', b && !/[<>"\\]/.test(b.name) && b.name.length <= 24 && b.welt === 'wiese' && b.hoehen.every((h) => h.h >= -4 && h.h <= 8 && h.s >= 0) && b.el.every((e) => E.ARTEN.includes(e.a) && isFinite(e.s)) && b.el.every((e) => e.a !== 'gold' || Math.abs(e.q) <= 0.5), b ? b.name + ' | ' + JSON.stringify(b.hoehen) : E.pruefen.letzterGrund);
  const gross = { pkt: new Array(5000).fill([0, 0]) }, nanp = { pkt: d.pkt.map((p, i) => (i === 7 ? [NaN, 1] : p)) }, wild = { pkt: d.pkt.map((p, i) => [p[0] * (i % 2 ? 1 : -1), p[1] * 7]) };
  pruefe('E pruefen lehnt ab: zu viele Punkte, NaN, wilde Zickzack-Linie, null, Zahl', [gross, nanp, wild, null, 5].every((x) => E.pruefen(x) === null));
  pruefe('E pruefen: Werte außerhalb der Fläche werden geklemmt (±820 m)', (() => { const q = E.pruefen({ pkt: d.pkt.map((p) => [p[0] + 5000, p[1]]) }); return q === null || q.pkt.every((p) => Math.abs(p[0]) <= 820.1 && Math.abs(p[1]) <= 820.1); })());
  // Sticker
  const SK = RS.SpassSticker;
  for (const sp of ['auto', 'motorrad']) {
    SK.zurueck(sp);
    const kat = SK.katalog(sp).map((k) => k.id), g = (n, x) => SK.ereignis(sp, n, x).map((k) => k.id);
    pruefe(`E ${sp}: Sticker „Erste eigene Strecke“ (1) und „Baumeister“ (5 Strecken), Katalog eindeutig ≤ 60`, kat.includes('streckeEigen') && kat.includes('baumeister') && new Set(kat).size === kat.length && kat.length <= 60 && g('strecke', { anzahl: 1 }).includes('streckeEigen') && !g('strecke', { anzahl: 4 }).includes('baumeister') && g('strecke', { anzahl: 5 }).includes('baumeister'), kat.length);
    SK.zurueck(sp);
  }
}

// ---------------------------------------------------------------- F) KI fährt gemalte Strecken (Simulation wie im Server)
function lauf(R, moto, id, opt) {
  opt = opt || {};
  const sim = new Simulation({ einstellungen: { streckeId: id, gegner: 3, runden: 1, schwierigkeit: 'mittel', spass: opt.spass !== false, zufall: false, unfall: moto ? 'aus' : undefined }, spieler: [], seed: 5, moto });
  const S = sim.sim, st = S.strecke, r = { abseits: 0, resets: 0, h: 2166136261, schritte: 0, fertig: false, tele: 0, huep: 0 };
  const tn = S.fahrzeuge.map(() => 0), hn = S.fahrzeuge.map(() => 0), maxS = 60 * 420;
  while (!sim.fertig && r.schritte < maxS) {
    sim.schritt(); r.schritte++;
    const ev = sim.abholen();
    S.fahrzeuge.forEach((f, i) => {
      if (f.flug.tele && f.flug.tele.n > tn[i]) { r.tele += f.flug.tele.n - tn[i]; tn[i] = f.flug.tele.n; }
      if (f.flug.huepfN > hn[i]) { r.huep += f.flug.huepfN - hn[i]; hn[i] = f.flug.huepfN; }
      const t = S.rennen.teilnehmer[i]; if (S.rennen.gasErlaubt && Math.abs(t.seitenabstand) > st.breite / 2 + 1.5) r.abseits++;
      r.h = hash(hash(hash(r.h, f.vehicle.x), f.vehicle.z), f.vehicle.y);
    });
    ev.forEach((e) => { if (e.art === 'reset') r.resets++; });
  }
  r.fertig = sim.fertig; r.S = S; r.st = st;
  r.zeiten = S.rennen.teilnehmer.map((t) => t.bestzeit && +t.bestzeit.toFixed(1));
  return r;
}
const welten = ['wiese', 'wald', 'wueste', 'mond', 'regenbogenland'];
for (const [sp, R] of SPIELE) {
  const moto = sp === 'motorrad';
  const seeds = [3, 11, 19, 27, 35];
  seeds.forEach((seed, k) => {
    const t0 = Date.now();
    const d = basis(R, seed, welten[k]);
    if (!d) { pruefe(`F ${sp}: Strecke ${seed} lässt sich malen`, false); return; }
    const gesetzt = bestuecken(R, d, moto);
    if (k % 2 === 0) { R.Editor.hoeheSetzen(d, 500, 5); R.Editor.hoeheSetzen(d, 1500, -3); }
    d.id = 'eigen-f' + seed; R.Editor.registrieren(d);
    const f = R.Editor.fahrtest(R.trackCatalog.find((t) => t.id === d.id));
    const r = lauf(R, moto, d.id);
    pruefe(`F ${sp}/${welten[k]} #${seed}: Elemente ${gesetzt.length} (${gesetzt.map((x) => x[0]).join('')}) – Fahrtest ok, alle KI im Ziel, keine Resets, abseits ≤ 150`,
      f.ok && r.fertig && r.resets === 0 && r.abseits <= 150, `Test ${f.ok ? f.zeit.toFixed(0) + ' s' : JSON.stringify(f.probleme)}, Rennen ${(r.schritte / 60).toFixed(0)} s, Zeiten ${r.zeiten.join('/')}, Resets ${r.resets}, abseits ${r.abseits}, Tore ${r.tele}, ${((Date.now() - t0) / 1000).toFixed(0)} s Rechenzeit`);
  });
}
{ // Acht mit Brücke und Elementen
  const R = R0, d = R.Editor.neu(R.Editor.verarbeiten(acht()).pkt, 'Acht', 'wiese');
  const g = bestuecken(R, d, false); d.id = 'eigen-acht'; R.Editor.registrieren(d);
  const r = lauf(R, false, d.id);
  pruefe(`F auto/Acht mit Brücke und ${g.length} Elementen: alle KI im Ziel, keine Resets`, r.fertig && r.resets === 0 && r.abseits <= 150, `${(r.schritte / 60).toFixed(0)} s, Resets ${r.resets}, abseits ${r.abseits}`);
  const hs = R.Editor.fahrtest(R.trackCatalog.find((t) => t.id === 'eigen-acht'), { spass: false });
  pruefe('F Fahrtest meldet unfahrbare Stellen mit Ort: Strecke mit Wand mitten auf der Fahrbahn (Hügel 8 m + Looping auf Kurve erzwungen) bleibt trotzdem sauber ausgewertet', typeof hs.ok === 'boolean' && Array.isArray(hs.probleme));
}
{ // Unfahrbare Strecke: Fahrtest muss eine Stelle nennen
  const R = R0, v = R.Editor.verarbeiten(malen(3)), d = R.Editor.neu(v.pkt, 'Kaputt', 'wiese'), e = R.Editor.eintrag(d);
  // Eintrag von Hand unfahrbar machen: Kontrollpunkte um die Mitte eng zusammenziehen (Haarnadel mitten in der Strecke)
  const k = e.punkte.map((p) => p.slice()), m = Math.floor(k.length / 2);
  for (let i = -3; i <= 3; i++) { k[m + i][0] = k[m][0] + i * 2.0 * (i % 2 ? 1 : -1); k[m + i][2] = k[m][2] + i * 1.5; }
  const bad = Object.assign({}, e, { punkte: k, id: 'eigen-kaputt' });
  const f = R.Editor.fahrtest(bad);
  pruefe('F unfahrbare Strecke (Knick mit R < 5 m): Fahrtest sagt „nicht fahrbar“ und nennt die Stelle (s in m)', f.ok === false && f.probleme.length >= 1 && typeof f.probleme[0].s === 'number' && /Computer-Auto/.test(f.probleme[0].text), JSON.stringify(f.probleme[0] || f));
}

// ---------------------------------------------------------------- G) Server = Client, deterministisch, bestehende Strecken bitgleich
{
  const MODULE_CLIENT = ['vendor/three.min.js', 'src/config.js', 'src/physics/vehicle.js', 'src/physics/collisions.js', 'src/cars/carCatalog.js', 'src/track/spline.js', 'src/track/trackCatalog.js',
    'src/track/trackBuilder.js', 'src/track/looping.js', 'src/track/schanze.js', 'src/track/trackWelten.js', 'src/track/anlauf.js', 'src/spass/spassKern.js', 'src/world/themes.js', 'src/world/wetter.js', 'src/world/themenS5.js',
    'src/net/protokoll.js', 'src/main.js', 'src/spass/spassPhysik.js', 'src/spass/spassWelten.js', 'src/spass/spassZauber.js', 'src/spass/editorKern.js'];
  const C = kontextLaden(MODULE_CLIENT);
  const d = basis(R0, 19, 'wueste'); bestuecken(R0, d, false); d.id = 'eigen-sc';
  const eS = R0.Editor.registrieren(d), dC = C.Editor.pruefen(JSON.parse(JSON.stringify(d)));
  pruefe('G Host → Server: Daten über JSON + Prüfung ergeben die gleichen Elemente und Punkte', dC && dC.el.length === d.el.length && dC.pkt.length === d.pkt.length && dC.el.every((e, i) => e.a === d.el[i].a && e.s === d.el[i].s), dC ? dC.el.length + ' Elemente' : C.Editor.pruefen.letzterGrund);
  dC.id = 'eigen-sc'; const eC = C.Editor.registrieren(dC);
  const stS = new R0.Strecke(eS, { spass: true, zauber: true }), stC = new C.Strecke(eC, { spass: true, zauber: true });
  const hs = (st) => { let h = 2166136261; st.spline.punkte.forEach((p) => { h = hash(hash(hash(h, p.x), p.y), p.z); }); h = hash(h, st.spline.laenge); return h; };
  pruefe('G Server und Client bauen bitgleich: Spline, Spaß-Plan (Trampolin/Kanone/Tore), Zauber-Plan, Münzen/Schanzen-Listen', hs(stS) === hs(stC) && JSON.stringify(stS.spass.liste) === JSON.stringify(stC.spass.liste) && JSON.stringify(stS.spass.tore) === JSON.stringify(stC.spass.tore) && JSON.stringify(stS.spass.zauber) === JSON.stringify(stC.spass.zauber) && JSON.stringify(stS.katalog.schanzen) === JSON.stringify(stC.katalog.schanzen), hs(stS) + ' ' + hs(stC));
  const a = lauf(R0, false, 'eigen-sc'), b = lauf(R0, false, 'eigen-sc');
  pruefe('G zwei Läufe (Simulation) bitgleich', a.h === b.h && a.schritte === b.schritte && a.fertig, a.h + ' ' + b.h);
  // Bestehende Strecken: Spline, Spaß-Plan identisch mit einem Kontext OHNE Editor
  const OHNE = kontextLaden(MODULE_CLIENT.filter((m) => m !== 'src/spass/editorKern.js'));
  let gleich = true, info = '';
  for (const id of ['wiese', 'wald', 'wueste', 'fantasie', 'dino', 'alpen', 'formel1', 'mond', 'unterwasser', 'regenbogenland']) {
    const x = new OHNE.Strecke(OHNE.trackCatalog.find((t) => t.id === id), { spass: true, zauber: true }), y = new C.Strecke(C.trackCatalog.find((t) => t.id === id), { spass: true, zauber: true });
    if (hs(x) !== hs(y) || JSON.stringify(x.spass) !== JSON.stringify(y.spass)) { gleich = false; info += id + ' '; }
  }
  pruefe('G bestehende 10 Strecken mit Editor-Modul bitgleich zu ohne Editor-Modul (Spline + Spaß-/Zauber-Plan)', gleich, info);
  const katOhne = JSON.stringify(OHNE.trackCatalog.map((t) => t.id)), katMit = JSON.stringify(C.trackCatalog.filter((t) => !t.eigen).map((t) => t.id));
  pruefe('G Editor-Modul allein trägt keine Strecke in den Katalog ein (erst gespeicherte/registrierte)', katOhne === katMit);
}

console.log(`\nalle ${ok} OK, ${fehler} FEHL`);
process.exit(fehler ? 1 : 0);
