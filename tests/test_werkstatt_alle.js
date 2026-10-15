// 15.10. (v25) Werkstatt auf JEDER Strecke – node tests/test_werkstatt_alle.js [--diag] [--vorher] [--schnell] [streckenId]
// Wunsch des Vaters: „Garage (Reparatur) auf jeder Strecke einbinden, und die Zone zum Abstellen soll deutlich länger sein.“
// Geprüft je Strecke × Variante (normal, XL) × Welt × Hindernis-Menge (normal, sehrViele) × Tempo-Klasse (normal, schnell):
//   1. Die Platzsuche findet einen Platz (Werkstatt vorhanden).
//   2. Fläche ≥ 30 m lang (config.werkstatt.laenge), Boxen ≥ 3, weicher Keil (Zufahrt/Ausfahrt) vorhanden, Gebäude so lang wie die Fläche.
//   3. Keine Überschneidung von Fläche + Keil + Gebäude mit: Sperrzonen (Tunnel, Brücke, Überführung, Kreuzung, Gabelung, Looping/Schanze samt
//      Anlauf, Start/Ziel, Spur-Engstellen, Tribünen falls vorhanden), festen Säulen (Kurvenschild-Masten, Startbogen, Looping-Beine, Warnlichter),
//      Hindernissen/Wracks/Strohballen/Klebestreifen/Pickups und Deko-Kollidern (Bäume, Felsen, Büsche – nach freiraeumen()).
//   4. Deterministisch (zweimal derselbe Platz), Heil-Regeln unverändert (15 %/s, einmal je Runde: test_garage_werkstatt.js).
//   5. Megastrecke (8 km > 6 km): zwei Werkstätten, weit auseinander; Strecken < 6 km: genau eine.
//   6. Computer-Auto (30 %) fährt hin, steht auf der langen Fläche und wird auf 100 % repariert – je Strecke, normal + XL + Mega (beide Plätze).
//   --vorher: nur zählen, wo die Suche den ALTEN Stand (tests/sicherung_v25_werkstatt_alt/garage.js, 13 m) einen Platz findet (Vergleichstabelle).
const S = require('../server/simulation.js');
const ALT = process.argv.includes('--vorher');
const diag = process.argv.includes('--diag'), SCHNELL = process.argv.includes('--schnell');
const nurId = process.argv.find((a, i) => i >= 2 && !a.startsWith('--'));
S.MODULE.splice(S.MODULE.indexOf('src/main.js'), 0, ALT ? 'tests/sicherung_v25_werkstatt_alt/garage.js' : 'src/world/garage.js');
const { Simulation } = S;
let fehler = 0;
function pruefe(name, ok, info) { console.log((ok ? 'OK   ' : 'FEHL ') + name + (info ? '  (' + info + ')' : '')); if (!ok) fehler++; }

const sim0 = new Simulation({ einstellungen: { streckeId: 'wiese', gegner: 0 }, spieler: [{ fahrer: 'T', auto: 'passat' }], seed: 1 });
const R = sim0.R, C = R.config.werkstatt, dt = R.config.physik.schritt;
if (ALT) Object.assign(C, process.argv.includes('--laenge35') ? { laenge: 35, gebaeudeBreite: 12, sucheAb: 70, sucheFenster: 36 } : { laenge: 13, gebaeudeBreite: 12, sucheAb: 70, sucheFenster: 36 });   // Stand vor v25 (--laenge35: alte Suche mit der neuen langen Fläche)

// ---------------------------------------------------------------- Hilfen
/** Abfolge wie im Spiel (main.js/Server): Strecke → Kurvenschild-Masten → Deko-Kollider → Wracks. */
function strecke(daten, welt, variante, menge, klasse) {
  const st = new R.Strecke(daten, { welt, variante, hindernisMenge: menge });
  st.tempoKlasse = klasse;
  R.Kurvenschilder.einbauen(st, klasse);
  R.Kollisionen.pflanzenSammeln(st, R.themes.dekoBauen(daten.thema, st, 'sommer'));
  if (R.Kollisionen.wracksEinbauen) R.Kollisionen.wracksEinbauen(st);
  if (R.Tribuenen) R.Tribuenen.einbauen(st);        // Zuschauertribünen (Säulen + strecke.tribuenen), falls das Modul da ist
  return st;
}
/** Punkte auf Fläche, Keil und Gebäude einer Werkstatt (Weltkoordinaten) – Raster ≈ 1,5 m. */
function umriss(w) {
  const P = w.platz, pts = [], h = P.laenge / 2, qE = P.qE !== undefined ? P.qE : P.qA - 0.4;
  const aussen = P.gebQ + P.gebTiefe / 2;
  const add = (ds, q, art) => { const p = w.welt(P.s + ds, q); pts.push({ x: p.x, z: p.z, ds, q, art }); };
  for (let ds = -h; ds <= h + 1e-6; ds += 1.5) for (let q = P.qA; q <= P.qB + 1e-6; q += 1.4) add(ds, q, 'flaeche');
  for (let ds = -h - P.zufahrt; ds <= h + P.ausfahrt + 1e-6; ds += 1.5) { const b = w.keilBreite(ds); for (let q = qE; q <= qE + b + 1e-6; q += 1.4) add(ds, q, 'keil'); }
  for (let ds = -P.gebBreite / 2; ds <= P.gebBreite / 2 + 1e-6; ds += 1.5) for (let q = P.gebQ - P.gebTiefe / 2; q <= aussen + 1e-6; q += 1.4) add(ds, q, 'gebaeude');
  return pts;
}
const naheDist = (pts, x, z) => { let m = Infinity; for (const p of pts) { const d = Math.hypot(p.x - x, p.z - z); if (d < m) m = d; } return m; };
/** Alle Sperrzonen (Bogenlänge) der Strecke, die die Werkstatt nie berühren darf. */
function sperrzonen(st) {
  const z = [], dazu = (art, e, zug) => { if (!e || typeof e !== 'object') return; zug = zug || 0;
    if (typeof e.s0 === 'number' && typeof e.s1 === 'number') z.push({ art, s0: e.s0 - zug, s1: e.s1 + zug });
    else if (typeof e.s === 'number') z.push({ art, s0: e.s - zug, s1: e.s + zug }); };
  (st.bruecken || []).forEach(e => dazu('Brücke', e)); (st.tunnel || []).forEach(e => dazu('Tunnel', e));
  (st.ueberfuehrungen || []).forEach(e => dazu('Überführung', e));
  (st.kreuzungen || []).forEach((k) => { dazu('Kreuzung', k); if (typeof k.sA === 'number') z.push({ art: 'Kreuzung', s0: k.sA - 20, s1: k.sA + 20 }); if (typeof k.sB === 'number') z.push({ art: 'Kreuzung', s0: k.sB - 20, s1: k.sB + 20 }); });
  (st.gabelungen || (st.daten && st.daten.gabelungen) || []).forEach(e => dazu('Gabelung', e));
  (st.loopings || []).forEach(e => dazu('Looping', e)); (st.schanzen || []).forEach(e => dazu('Schanze', e));
  (st._engstellen || []).forEach(e => dazu('Engstelle', e));
  (st.tribuenen || []).forEach(e => { if (typeof e.s === 'number') z.push({ art: 'Tribüne', s0: e.s - (e.laenge || 30) / 2, s1: e.s + (e.laenge || 30) / 2 }); });
  try { R.Anlauf.stellen(st).forEach(a => z.push({ art: 'Anlauf', s0: a.s - (a.abstand || 0) - 10, s1: a.s + 5 })); } catch (e) { /* ohne Anlauf */ }
  return z;
}
const hinein = (sp, z, s) => { const m = (z.s0 + z.s1) / 2, h = Math.abs(sp.differenzS(z.s1, z.s0)) / 2; return Math.abs(sp.differenzS(s, m)) <= h; };

// ---------------------------------------------------------------- A: alle Kombinationen
const tabelle = {};         // "strecke/variante" → { n, ok, stufen:{}, laenge }
let n = 0, fehlend = [], zuKurz = [], nichtDet = [], kollisionen = [], zweiOk = true, zweiMeldung = [], raeumTotal = 0;
const t0 = Date.now();
for (const daten of R.trackCatalog) {
  if (nurId && daten.id !== nurId) continue;
  const welten = Object.keys(daten.welten || {}); if (!welten.length) welten.push('');
  for (const variante of ['', ...Object.keys(daten.varianten || {})]) {
    const tk = daten.id + (variante ? '/' + variante : '');
    const tab = tabelle[tk] = { n: 0, ok: 0, stufen: {}, laengeMin: 1e9, plaetze: new Set() };
    for (const welt of welten) for (const menge of ['normal', 'sehrViele']) {
      let st = null;
      for (const klasse of ['normal', 'schnell']) {
        if (!st) st = strecke(daten, welt, variante, menge, klasse); else { st.tempoKlasse = klasse; R.Kurvenschilder.einbauen(st, klasse); }
        const name = [tk, welt, menge, klasse].join('/');
        n++; tab.n++;
        const w = R.Werkstatt.fuer ? R.Werkstatt.fuer(st) : new R.Werkstatt(st);
        if (!w.vorhanden) { fehlend.push(name); continue; }
        tab.ok++;
        const teile = w.teile || [w];
        if (ALT) { tab.stufen[teile[0].platz.stufe] = (tab.stufen[teile[0].platz.stufe] || 0) + 1; continue; }
        const w2 = R.Werkstatt.fuer(st);
        if (JSON.stringify((w2.teile || [w2]).map(t => t.platz)) !== JSON.stringify(teile.map(t => t.platz))) nichtDet.push(name);
        // Anzahl Werkstätten
        const erwartet = st.spline.laenge > C.zweiteAb ? 2 : 1;
        if (teile.length !== erwartet) { zweiOk = false; zweiMeldung.push(name + ': ' + teile.length + ' statt ' + erwartet); }
        if (teile.length === 2 && Math.abs(st.spline.differenzS(teile[0].platz.s, teile[1].platz.s)) < st.spline.laenge * 0.25) { zweiOk = false; zweiMeldung.push(name + ': zu nah beieinander'); }
        for (const t of teile) {
          const P = t.platz;
          tab.stufen[P.stufe] = (tab.stufen[P.stufe] || 0) + 1; tab.laengeMin = Math.min(tab.laengeMin, P.laenge); tab.plaetze.add(Math.round(P.s));
          if (P.laenge < 30 || P.boxen < 3 || !(P.zufahrt >= 12 && P.ausfahrt >= 6) || P.gebBreite < P.laenge - 6) zuKurz.push(name + ' L ' + P.laenge + ' Boxen ' + P.boxen + ' Geb ' + P.gebBreite);
          // Bäume im Weg entfernen (wie main.js nach dem Bauen), dann gegen alles prüfen
          raeumTotal += t.freiraeumen() || 0;
          const pts = umriss(t), sp = st.spline, h = P.laenge / 2, L = sp.laenge;
          // Sperrzonen: gesamter Bereich Keil + Fläche + Gebäude
          const sVon = P.s - h - P.zufahrt - 4, sBis = P.s + h + P.ausfahrt + 4;
          for (const z of sperrzonen(st)) for (let s = sVon; s <= sBis; s += 3) if (hinein(sp, z, sp.wrapS(s))) { kollisionen.push(name + ': ' + z.art + ' bei s ' + Math.round(s)); break; }
          if (P.s - h - P.zufahrt < 85 || P.s + h + P.ausfahrt > L - 120) kollisionen.push(name + ': zu nah an Start/Ziel (s ' + Math.round(P.s) + ')');
          // feste Säulen (ohne die der Werkstatt selbst, da noch nicht gebaut)
          for (const c of st.saeulen || []) { if (c.art === 'werkstatt') continue; const d = naheDist(pts, c.x, c.z); if (d < (c.r || 0.3) + 0.3) kollisionen.push(name + ': Säule ' + (c.art || '?') + ' ' + d.toFixed(1) + ' m'); }
          // Hindernisse, Wracks, Strohballen, Kleber, Pickups, Münzen-freie Dinge mit Ort
          for (const k of ['hindernisse', 'wracks', 'strohballen', 'kleber', 'boostFelder', 'schilde', 'dinos']) for (const e of st[k] || []) {
            if (typeof e.x !== 'number' || typeof e.z !== 'number') continue;
            if (typeof e.s0 === 'number' && typeof e.s1 === 'number' && typeof e.seitenabstand === 'number' && typeof e.halbbreite === 'number') {
              // echte Grundfläche (Länge × Breite) im s-q-Raster statt Hüllkreis
              const hit = pts.some(q => { const sa = P.s + q.ds; return sp.differenzS(sa, e.s0) >= -0.6 && sp.differenzS(e.s1, sa) >= -0.6 && Math.abs(q.q - e.seitenabstand * P.seite) <= e.halbbreite + 0.4; });
              if (hit) kollisionen.push(name + ': ' + k + ' ' + (e.typ || '') + ' Grundfläche überlappt (s ' + Math.round(e.s0) + '–' + Math.round(e.s1) + ')');
              continue;
            }
            const r = e.radius || e.r || 2, d = naheDist(pts, e.x, e.z);
            if (d < r * 0.8) kollisionen.push(name + ': ' + k + ' ' + (e.typ || '') + ' ' + d.toFixed(1) + ' m (r ' + r.toFixed(1) + ')');
          }
          // Deko-Kollider (Baum/Fels/Busch)
          for (const c of st.pflanzenKollider || []) { const d = naheDist(pts, c.x, c.z); if (d < c.r) { kollisionen.push(name + ': ' + (c.name || 'Pflanze') + ' ' + d.toFixed(1) + ' m (r ' + c.r.toFixed(1) + ')'); break; } }
        }
      }
    }
  }
}
// Gebäude-Aufbau (Säulen, Gruppe) einmal je Strecke prüfen, soweit THREE im Kontext läuft
console.log('Dauer Suche: ' + ((Date.now() - t0) / 1000).toFixed(0) + ' s');
pruefe('A: Werkstatt gefunden auf allen ' + n + ' Kombinationen (Strecke × Variante × Welt × Menge × Tempo-Klasse)', fehlend.length === 0, fehlend.slice(0, 8).join(', ') + (fehlend.length > 8 ? ' … ' + fehlend.length + ' fehlen' : ''));
if (ALT) {
  console.log('\nVORHER (13-m-Stand) – Stufen:');
  for (const [k, t] of Object.entries(tabelle)) console.log('  ' + k.padEnd(14) + ' gefunden ' + t.ok + '/' + t.n + '  Stufen ' + JSON.stringify(t.stufen));
  console.log(JSON.stringify(Object.fromEntries(Object.entries(tabelle).map(([k, t]) => [k, [t.ok, t.n]]))));
  process.exit(0);
}
pruefe('A: Fläche ≥ 30 m (config ' + C.laenge + ' m), ≥ 3 Boxen, Keil 12/6 m, Halle ≈ so lang wie die Fläche', zuKurz.length === 0, zuKurz.slice(0, 3).join(' | '));
pruefe('A: nichts überschneidet sich: Sperrzonen, Säulen/Masten, Hindernisse/Wracks/Kleber/Pickups, Deko (Bäume/Felsen/Büsche)', kollisionen.length === 0, kollisionen.slice(0, 6).join(' | ') + (kollisionen.length > 6 ? ' … ' + kollisionen.length : ''));
pruefe('A: deterministisch (zweimal derselbe Platz)', nichtDet.length === 0, nichtDet.slice(0, 3).join(', '));
pruefe('A: Anzahl Werkstätten: eine pro Strecke, zwei nur über ' + C.zweiteAb + ' m (Megastrecke), weit auseinander', zweiOk, zweiMeldung.slice(0, 3).join(' | '));
pruefe('A: config: nurMitSchaden = true (Standard), 15 %/s, Fläche ' + C.laenge + ' m', C.nurMitSchaden === true && C.prozentProSekunde === 15 && C.laenge >= 30, JSON.stringify({ nurMitSchaden: C.nurMitSchaden, rate: C.prozentProSekunde, laenge: C.laenge }));
console.log('\nStrecke/Variante   gefunden   Länge  verschiedene Plätze  Stufen (1 streng … 6 locker)   (Bäume entfernt: ' + raeumTotal + ')');
for (const [k, t] of Object.entries(tabelle)) console.log('  ' + k.padEnd(15) + t.ok + '/' + t.n + '   '.concat(String(t.laengeMin === 1e9 ? '-' : t.laengeMin)).padEnd(8) + String(t.plaetze.size).padEnd(6) + JSON.stringify(t.stufen));

// ---------------------------------------------------------------- B: Gebäude bauen (THREE im Server-Kontext)
if (typeof sim0.R.Werkstatt === 'function') {
  let gebaut = 0, fehlerB = [], ohneSaeulen = 0;
  for (const id of ['wiese', 'alpen', 'mega']) {
    if (nurId && nurId !== id) continue;
    const daten = R.trackCatalog.find(d => d.id === id), st = strecke(daten, Object.keys(daten.welten)[0], '', 'normal', 'normal');
    const w = R.Werkstatt.fuer(st);
    const vor = (st.saeulen || []).length;
    try { const g = w.bauen(); if (g) { gebaut++; if ((st.saeulen || []).length <= vor) ohneSaeulen++; } } catch (e) { fehlerB.push(id + ': ' + e.message); }
    w.zerstoeren();
    if ((st.saeulen || []).length !== vor) fehlerB.push(id + ': zerstoeren() räumt die Säulen nicht auf');
  }
  pruefe('B: bauen()/zerstoeren() laufen (Fläche, Keil, Halle in Segmenten, Säulen alle 4 m, Aufräumen)', fehlerB.length === 0 && ohneSaeulen === 0, fehlerB.join(' | ') + ' · gebaut ' + gebaut);
}

// ---------------------------------------------------------------- C: Computer-Auto repariert sich auf der langen Fläche
if (!SCHNELL) {
  function kiHeilen(id, variante, plazNr) {
    const sim = new Simulation({ einstellungen: { streckeId: id, variante, gegner: 1, runden: 3, tempoKlasse: 'normal', schwierigkeit: 'mittel' },
      spieler: [{ fahrer: 'T', auto: 'passat' }], seed: 11 });
    const g = sim.sim, st = g.strecke;
    g.schaden = new R.Schaden(g.fahrzeuge, { an: true });
    g.fahrzeuge.forEach((f, i) => g.schaden.meshBauen(i, f.mesh));
    g.schaden.bei((e) => g._schadenEreignis(e));
    const w = R.Werkstatt.fuer(st); g.werkstatt = w;
    const teil = (w.teile || [w])[plazNr || 0], P = teil.platz;
    let k = 0; while (!g.rennen.gasErlaubt && k++ < 60 * 12) sim.schritt();
    const f = g.fahrzeuge[1], v = f.vehicle, sp = st.spline, s0 = P.s - P.laenge / 2 - 150, p = sp.punktBei(s0);
    v.setzen(p.x, p.z, Math.atan2(-p.tx, -p.tz)); v.vLaengs = 20; v.vQuer = 0; v.y = st.hoeheAn(p.x, p.z);
    f.index = -1; f.nah = st.abfrage(v.x, v.z, undefined);
    f.vorher && Object.assign(f.vorher, { x: v.x, y: v.y, z: v.z, heading: v.heading });
    g.schaden._punkteSetzen(1, 30);
    // Spieler stehen lassen
    let drin = 0, max = 30, tDrin = -1, t = 0;
    for (let j = 0; j < 60 * 60; j++) {
      sim.eingabeSetzen(0, { gas: 0, bremse: 1, lenkung: 0 });
      sim.schritt(); t += dt;
      if (teil.istDrin(f.nah)) { drin += dt; if (tDrin < 0) tDrin = t; }
      max = Math.max(max, g.schaden.zustand(1).prozent);
      if (max >= 100 && !teil.istDrin(f.nah)) break;
    }
    return { max, drin, tDrin, reset: f.netReset || 0, plaetze: (w.teile || [w]).length };
  }
  const fall = [];
  for (const daten of R.trackCatalog) {
    if (nurId && daten.id !== nurId) continue;
    fall.push([daten.id, '']);
    if (daten.varianten && daten.varianten.xl) fall.push([daten.id, 'xl']);
  }
  for (const [id, v] of fall) {
    const anz = id === 'mega' ? 2 : 1;
    for (let pn = 0; pn < anz; pn++) {
      const r = kiHeilen(id, v, pn);
      pruefe('C: KI (30 %) fährt hin und wird repariert – ' + id + (v ? '/' + v : '') + (anz > 1 ? ' Werkstatt ' + (pn + 1) : ''), r.max === 100 && r.drin > 2 && r.reset === 0,
        'Wert bis ' + r.max + ' %, ' + r.drin.toFixed(1) + ' s auf der Fläche, ab ' + (r.tDrin > 0 ? r.tDrin.toFixed(1) + ' s' : '-') + ', Resets ' + r.reset);
    }
  }
}

console.log(fehler ? '\n' + fehler + ' FEHLER' : '\nALLE TESTS OK');
process.exit(fehler ? 1 : 0);
