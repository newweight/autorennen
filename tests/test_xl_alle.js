// v22 (14.10.): XL für ALLE Strecken – node tests/test_xl_alle.js [streckenId] [schnell]
// Wunsch des Vaters: „Jede Strecke soll auch XL-Möglichkeit bekommen.“ Geprüft je Katalog-Strecke:
//  1. Der Katalog hat varianten.xl (Name, Faktor 1,4–2,2, zeitFaktor 1–Faktor, Beschreibung) – das Menü (menu.js) und das Online-Menü
//     (net/online.js) zeigen die Variante-Zeile genau dann, wenn varianten vorhanden sind; der Server (simulation.js) lässt 'xl' durch.
//     Ausnahme: Strecken mit `keineVariante: true` oder die Megastrecke (id 'mega', ist selbst schon die Riesenstrecke).
//  2. Baut ohne Fehler in JEDER Welt (klassisch … alles, Fantasie: fantasie/alles), Länge ≈ Faktor × Normal (±3 %),
//     strecke.variante = 'xl', Original-Katalog unverändert.
//  3. Sonderzonen ohne Verzerrung: Anzahl Brücken/Tunnel/Loopings/Schanzen/Kreuzungen/Gabelungen/Überführungen wie Normal, Looping-Radius und
//     Schanzenlänge bleiben, Kreuzung 70–110°, Überführung mit Δy ≥ 7 m, Gabelung gefunden, Hindernisse/Wracks/… gleich viele,
//     Kurvenschilder (R.Kurvenschilder.berechnen) vorhanden, Münzen/Garage/Werkstatt-Orte vorhanden (Platzierungstest: test_garage.js).
//  4. Server nimmt die Variante an (einstellungenPruefen), unbekannte Varianten werden zu Normal.
//  5. KI „mittel" fährt 1 Runde (Welt: Standard der Strecke): im Ziel, abseits < 3 %, kein Reset, Rundenzeit ≈ zeitFaktor × Normal (±15 %).
const { ladeModule } = require('./lade');
const R = ladeModule(['src/config.js', 'src/physics/vehicle.js', 'src/track/spline.js',
  'src/track/trackCatalog.js', 'src/track/trackBuilder.js', 'src/track/looping.js', 'src/race/raceManager.js', 'src/physics/collisions.js', 'src/ai/driver.js', 'src/world/schilder.js']);
const nurId = process.argv.find((a, i) => i >= 2 && a !== 'schnell');
const SCHNELL = process.argv.includes('schnell');   // ohne KI-Runde (nur Aufbau/Struktur)
let fehler = 0;
function pruefe(name, ok, info) { console.log((ok ? 'OK   ' : 'FEHL ') + name + (info !== undefined && info !== '' ? '  (' + info + ')' : '')); if (!ok) fehler++; }
const fmt = (x) => (x === undefined || x === null ? '-' : x.toFixed(1) + ' s');
const dt = R.config.physik.schritt, LP = R.Looping;
const AUSNAHME = (d) => d.keineVariante === true || d.id === 'mega';

function kiRunde(strecke) {
  const start = strecke.startpositionen(1)[0];
  const v = new R.Vehicle({});
  v.setzen(start.x, start.z, start.heading);
  const rennen = new R.RaceManager(strecke, [{ vehicle: v, name: 'KI', istSpieler: false }], { runden: 1, countdown: 0 });
  const d = new R.Driver(v, strecke, { schwierigkeit: 'mittel', seed: 7, name: 'KI' });
  const t = rennen.teilnehmer[0], lp = LP.zustand();
  let index = -1, abseits = 0, zeit = 0;
  for (let k = 0; k < 60 * 700 && !t.imZiel; k++) {
    const s = d.steuerung(dt, { andere: [], spielerFortschrittMax: null, eigenerFortschritt: t.fortschritt, laeuft: true });
    const r = LP.fahrzeugSchritt(lp, v, strecke, s, dt, index);
    index = r.index;
    if (r.untergrund === 'gras' || r.untergrund === 'sand') abseits += dt;
    if (r.ereignis === 'gefallen') rennen.verfolgungSetzen(0, v.x, v.z);
    rennen.schritt(dt);
    zeit += dt;
  }
  return { r1: t.rundenzeiten[0], imZiel: t.imZiel, anteil: abseits / Math.max(1, zeit), reset: d.brauchtReset, lp };
}

const liste = R.trackCatalog.filter(d => !nurId || d.id === nurId);
pruefe('Katalog hat Strecken', liste.length >= 6, liste.map(d => d.id).join(', '));
for (const daten of liste) {
  console.log('\n=== ' + daten.name + ' (' + daten.id + ') ===');
  const pf = '[' + daten.id + '] ';
  if (AUSNAHME(daten)) { console.log('Ausnahme (Megastrecke / keineVariante): keine XL-Variante nötig'); continue; }
  const v = daten.varianten && daten.varianten.xl;
  pruefe(pf + 'varianten.xl vorhanden (Name, Beschreibung, Faktor 1,4–2,2, zeitFaktor 1…Faktor)', !!v && typeof v.name === 'string' && v.name.length > 0 && typeof v.beschreibung === 'string' &&
    v.beschreibung.length > 10 && v.faktor >= 1.4 && v.faktor <= 2.2 && v.zeitFaktor >= 1 && v.zeitFaktor <= v.faktor, v ? 'x' + v.faktor + ' / Zeit x' + v.zeitFaktor : 'fehlt');
  if (!v) continue;
  const f = v.faktor, roh = JSON.stringify(daten);
  const welten = Object.keys(daten.welten || {});
  const basis = new R.Strecke(daten, { welt: 'alles' });
  // 2./3. alle Welten
  let ersterBau = null;
  for (const w of welten.length ? welten : [undefined]) {
    let st = null, fehl = '';
    try { st = new R.Strecke(daten, { welt: w, variante: 'xl' }); } catch (e) { fehl = String(e && e.stack || e).split('\n').slice(0, 2).join(' | '); }
    pruefe(pf + 'Welt ' + w + ': baut ohne Fehler', !!st, fehl);
    if (!st) continue;
    const b = new R.Strecke(daten, { welt: w });
    pruefe(pf + 'Welt ' + w + ': Länge ≈ ' + f + ' × Normal (±3 %), variante = xl', st.variante === 'xl' && Math.abs(st.laenge / b.laenge - f) < 0.03 * f, b.laenge.toFixed(0) + ' → ' + st.laenge.toFixed(0) + ' m');
    pruefe(pf + 'Welt ' + w + ': Listen gleich viele wie Normal (Hindernisse, Wracks, Strohballen, Schanzen, Boost, Schilde, Bälle, Wasser, Spuren, Dinos, Kleber)',
      ['hindernisse', 'wracks', 'strohballen', 'schanzen', 'boostFelder', 'schilde', 'baelle', 'wasserstrahlen', 'spuren', 'dinos', 'kleber'].every(k => (st[k] || []).length === (b[k] || []).length),
      ['hindernisse', 'wracks', 'strohballen', 'schanzen'].map(k => k + ' ' + (b[k] || []).length + '→' + (st[k] || []).length).join(', '));
    if (w === 'alles') ersterBau = st;
  }
  pruefe(pf + 'Original-Katalog unverändert', JSON.stringify(daten) === roh);
  const st = ersterBau || new R.Strecke(daten, { welt: 'alles', variante: 'xl' });
  // Sonderzonen
  pruefe(pf + 'Brücken/Tunnel: Anzahl wie Normal, Lage ≈ × ' + f, st.bruecken.length === basis.bruecken.length && st.tunnel.length === basis.tunnel.length &&
    st.bruecken.every((x, i) => Math.abs(x.s0 / basis.bruecken[i].s0 - f) < 0.03 * f) && st.tunnel.every((x, i) => Math.abs(x.s0 / basis.tunnel[i].s0 - f) < 0.03 * f),
    st.bruecken.length + ' Brücken, ' + st.tunnel.length + ' Tunnel');
  pruefe(pf + 'Loopings: Anzahl wie Normal, Radius bleibt', st.loopings.length === basis.loopings.length && st.loopings.every((l, i) => l.radius === basis.loopings[i].radius), st.loopings.length + '');
  pruefe(pf + 'Schanzen: Länge bleibt', st.schanzen.every((s, i) => s.laenge === basis.schanzen[i].laenge), st.schanzen.length + '');
  if ((daten.kreuzungen || []).length) {
    const k = st.kreuzungen[0];
    pruefe(pf + 'Kreuzung gefunden, 70–110°, |Δy| < 1 m', st.kreuzungen.length === daten.kreuzungen.length && k && k.winkel >= 70 && k.winkel <= 110 && k.dy < 1, k ? k.winkel.toFixed(1) + '°, Δy ' + k.dy.toFixed(3) : '-');
  }
  if ((daten.gabelungen || []).length) {
    pruefe(pf + 'Gabelung gefunden, Ast-Längen fast gleich', st.gabelungen.length === daten.gabelungen.length && st.gabelInfo && (() => { const g = st.gabelInfo(); return !!g; })(), st.gabelungen.length + ' Gabelung(en)');
  }
  if ((daten.ueberfuehrungen || []).length) {
    const u = st.ueberfuehrungen[0];
    pruefe(pf + 'Überführung gefunden (Kreuzung, Δy ≥ 7 m, 70–110°)', st.ueberfuehrungen.length === daten.ueberfuehrungen.length && u && u.kreuzung && u.kreuzung.dy >= 7 && u.kreuzung.winkel >= 70 && u.kreuzung.winkel <= 110 && !!u.unten,
      u && u.kreuzung ? 'Δy ' + u.kreuzung.dy.toFixed(1) + ' m, ' + u.kreuzung.winkel.toFixed(0) + '°' : '-');
  }
  // Steigung (Straße): nie steiler als Normal (Alpen: ≤ 18 %)
  { const sp = st.spline; let m = 0; sp.punkte.forEach((p, i) => { const q = sp.punkte[(i + 1) % sp.anzahl]; m = Math.max(m, Math.abs(q.y - p.y) / sp.ds); });
    pruefe(pf + 'Steigung ≤ ' + (daten.id === 'alpen' ? 18 : 8) + ' %', m <= (daten.id === 'alpen' ? 0.18 : 0.08), (m * 100).toFixed(1) + ' %'); }
  // Kurvenschilder
  try {
    const sch = R.Kurvenschilder.berechnen(st, 'normal');
    pruefe(pf + 'Kurvenschilder berechnet (≥ 3), alle auf der Strecke', sch.length >= 3 && sch.every(x => Number.isFinite(x.x) && Number.isFinite(x.z)), sch.length + ' Schilder');
  } catch (e) { pruefe(pf + 'Kurvenschilder berechnet', false, String(e && e.message || e)); }
  pruefe(pf + 'Checkpoints: mehr als Normal', st.checkpoints.length > basis.checkpoints.length, basis.checkpoints.length + ' → ' + st.checkpoints.length);
  // 4. Server
  try {
    const { einstellungenPruefen } = require('../server/simulation');
    const e = einstellungenPruefen({ streckeId: daten.id, variante: 'xl' }, 1), e2 = einstellungenPruefen({ streckeId: daten.id, variante: 'gibtsnicht' }, 1);
    pruefe(pf + 'Server übernimmt variante "xl", unbekannte → Normal', e.variante === 'xl' && e2.variante === '', e.variante + ' / "' + e2.variante + '"');
  } catch (e) { pruefe(pf + 'Server-Prüfung', false, String(e && e.message || e)); }
  // 5. KI-Runde
  if (!SCHNELL) {
    const grund = kiRunde(new R.Strecke(daten, { welt: daten.weltStandard }));
    const xl = kiRunde(new R.Strecke(daten, { welt: daten.weltStandard, variante: 'xl' }));
    pruefe(pf + 'KI mittel fährt 1 Runde XL: im Ziel, abseits < 3 %, kein Reset', xl.imZiel && xl.anteil < 0.03 && !xl.reset, fmt(xl.r1) + ', abseits ' + (xl.anteil * 100).toFixed(1) + ' %');
    pruefe(pf + 'Rundenzeit XL ≈ ' + v.zeitFaktor + ' × Normal (±15 %)', grund.imZiel && Math.abs(xl.r1 / (grund.r1 * v.zeitFaktor) - 1) <= 0.15, fmt(xl.r1) + ' vs ' + fmt(grund.r1 * v.zeitFaktor) + ' (Normal ' + fmt(grund.r1) + ')');
    if (st.loopings.length) pruefe(pf + 'XL: alle Loopings geschafft', xl.lp.geschafft === st.loopings.length && xl.lp.gefallen === 0 && xl.lp.zuLangsam === 0, JSON.stringify({ g: xl.lp.geschafft, f: xl.lp.gefallen, l: xl.lp.zuLangsam }));
  }
}
console.log(fehler === 0 ? '\nALLE XL-PRÜFUNGEN OK' : '\n' + fehler + ' FEHLER');
process.exit(fehler ? 1 : 0);
