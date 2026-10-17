// Node-Test Strecke + Rennleitung für ALLE Katalog-Strecken: node tests/test_strecke.js [streckenId]
// Runde 4: Längen ×1,35/×1,25/×1,45, Welten (je Strecke + Welt: Länge, Steigung, Schichten), Spuren (breiteBei,
// Übergänge, Leitplanke), neue Listen (Wracks, Strohballen, Schanzen, Boost, Schilde) auf Straße + außerhalb der Sperrzonen.
const { ladeModule } = require('./lade');
const R = ladeModule(['src/config.js', 'src/physics/vehicle.js', 'src/track/spline.js',
  'src/track/trackCatalog.js', 'src/track/trackBuilder.js', 'src/race/raceManager.js',
  'src/track/schanze.js', 'src/world/pickups.js']);   // Runde 4 (W2-D): Schanzen + Pickups (ohne THREE)
let fehler = 0;
let praefix = '';
function pruefe(name, ok, info) { console.log((ok ? 'OK   ' : 'FEHL ') + praefix + name + (info ? '  (' + info + ')' : '')); if (!ok) fehler++; }


// Erwartungen je Strecke (Charakter): Kurvenzahl, lange Geraden, Höhe
// Runde 3: Wald/Wüste kräftiger (bis ±14 m), Wiese sanft (±6 m), Steigung überall ≤ 8 %
// Runde 4: Wiese ×1,35, Wald ×1,25, Wüste ×1,45 (Längen ~3.040 / 2.480 / 3.330 m); Runde 5b: Dino 2.750 m
const ERWARTUNG = {
  wiese:  { kurven: [10, 14], geraden: { min: 150, anzahl: [3, 5] }, hoehe: 6, hoeheMin: 5, laenge: [3000, 3080] },
  wald:   { kurven: [16, 30], geraden: { min: 200, anzahl: [0, 1] }, hoehe: 14, hoeheMin: 18, laenge: [2440, 2520] },
  wueste: { kurven: [7, 16], geraden: { min: 250, anzahl: [2, 4] }, hoehe: 14, hoeheMin: 15, laenge: [3290, 3370] },
  // Fantasie (Runde 3): kürzer, 2 Loopings auf langen Geraden, nur 1–2 Hindernisse
  // W4-J: Acht mit 270°-Schleife und EINER niveaugleichen Kreuzung (Ausnahme vom 40-m-Abstand, Δy < 1 m, 70–110°)
  fantasie: { kurven: [4, 12], geraden: { min: 150, anzahl: [2, 3] }, hoehe: 10, laenge: [1300, 1500], hindernisse: [1, 2], kreuzungen: 1 },
  // Runde 5b: Dino (mittel) 2.300–2.800 m, Hügel kräftig, 1 Schikane + 1 Haarnadel, lange Gerade (≥ 500 m) mit Schanze
  dino:   { kurven: [16, 30], geraden: { min: 150, anzahl: [2, 4] }, hoehe: 14, hoeheMin: 18, laenge: [2300, 2800], haarnadeln: 1, langeGerade: 500,
            hindernisse: [5, 6] },   // Runde 6 (W2-C): + 2 Lava-Zungen
  // Runde 6 (W4-I): Alpen 2.600–3.000 m, Pass +40 m, kräftiges Höhenprofil (≥ 40 m), 3 Haarnadeln (2 Serpentinen + Kehre),
  // Steigung bis 10 % (s. STEIGUNG_JE), eine Überführung (Ausnahme vom 40-m-Abstand), Höhenmodell 'strasse'
  alpen:  { kurven: [14, 30], geraden: { min: 150, anzahl: [3, 5] }, hoehe: 80, hoeheMin: 75, laenge: [2600, 3000], haarnadeln: 3,
            hindernisse: [4, 4], ueberfuehrungen: 1 },
};
// v29 (F3): Formel 1 – 4,4 km, zwei lange Geraden (≥ 700 m), weite Kurven (R > 150 m zählen hier nicht), eine Schikane (R 80 m), flach (±2,5 m), keine Hindernisse
ERWARTUNG.formel1 = { kurven: [2, 2], geraden: { min: 400, anzahl: [2, 2] }, hoehe: 6, laenge: [4350, 4470], langeGerade: 800, hindernisse: [0, 0] };
const STEIGUNG_MAX = 0.08;
// W4-I: Alpen dürfen steiler sein (Pass, Serpentinen): bis 10 %. Begründung: vehicle.js kennt keine Hangabtriebskraft – die
// Steigung wirkt nur optisch (Nicken/Kamera), Fahrbarkeit/KI ändern sich nicht; 10 % ist für eine Alpenstraße normal und
// im Bild deutlich zu sehen. Gebaut sind höchstens ~8 %.
// v22 (14.10.): Alpen noch hügeliger (Höhenunterschied 45 → ~80 m, Kuppen/Senken), Steigung bis 18 % (gebaut ≈ 17 %).
const STEIGUNG_JE = { alpen: 0.18 };
// W4-J: Paare an einer niveaugleichen Kreuzung (beide Abschnitte je ± Kreuzungsbereich + 40 m) dürfen näher als 40 m liegen
const anKreuzung = (st, sa, sb) => (st.kreuzungen || []).some(k =>
  (st._inBereich(k.a, sa, 40) && st._inBereich(k.b, sb, 40)) || (st._inBereich(k.a, sb, 40) && st._inBereich(k.b, sa, 40)));
const nurId = process.argv[2];
for (const daten of R.trackCatalog) {
if (nurId && daten.id !== nurId) continue;
praefix = '[' + daten.id + '] ';
console.log('\n=== ' + daten.name + ' ===');
const erw = ERWARTUNG[daten.id] || { kurven: [6, 40], geraden: { min: 150, anzahl: [0, 9] }, hoehe: 10 };
// Geometrie/Hindernisse in der ersten Welt mit Hindernissen (Wiese: 'hindernisse', Standard dort 'klassisch')
const weltH = Object.keys(daten.welten || {}).find(w => daten.welten[w].hindernisse);
const strecke = new R.Strecke(daten, { welt: weltH });
const sp = strecke.spline, N = sp.anzahl, L = strecke.laenge;
const steigMax = STEIGUNG_JE[daten.id] || STEIGUNG_MAX;
// W4-I: Paare an einer Überführung (oben im Brückenbereich, unten am unteren Abschnitt) dürfen näher als 40 m liegen
const anUeberfuehrung = (sa, sb) => (strecke.ueberfuehrungen || []).some(u => u.unten &&
  ((strecke._inBereich(u, sa) && strecke._inBereich(u.unten, sb, 40)) || (strecke._inBereich(u, sb) && strecke._inBereich(u.unten, sa, 40))));

/** Haarnadeln: zusammenhängende Kurve (R < 150 m) mit ≥ 150° Richtungsänderung → { s0, s1, scheitel } */
function haarnadelnSuchen() {
  const erg = [];
  const N2 = sp.anzahl, start = sp.punkte.findIndex(p => Math.abs(p.kruemmung) < 1 / 400);
  let winkel = 0, vz = 0, best = null, anfang = 0;
  for (let k = 0; k <= N2; k++) {
    const p = sp.punkte[(start + k) % N2], kurve = Math.abs(p.kruemmung) > 1 / 150;
    if (kurve && Math.sign(p.kruemmung) === vz) { winkel += Math.abs(p.kruemmung) * sp.ds; if (Math.abs(p.kruemmung) > Math.abs(best.kruemmung)) best = p; }
    else {
      if (vz && winkel * 180 / Math.PI >= 150) erg.push({ s0: anfang, s1: p.s, scheitel: best.s });
      winkel = kurve ? Math.abs(p.kruemmung) * sp.ds : 0; vz = kurve ? Math.sign(p.kruemmung) : 0; best = kurve ? p : null; anfang = p.s;
    }
  }
  return erg;
}

// ---------- Geometrie ----------
const lg = erw.laenge || [1900, 2400];
pruefe('Streckenlänge ' + lg[0] + '–' + lg[1] + ' m', L >= lg[0] && L <= lg[1], L.toFixed(1) + ' m');

let minR = Infinity, minRs = 0;
sp.punkte.forEach(p => { const r = 1 / Math.max(1e-9, Math.abs(p.kruemmung)); if (r < minR) { minR = r; minRs = p.s; } });
pruefe('Mindestradius ≥ 25 m', minR >= 25, minR.toFixed(1) + ' m bei s=' + minRs.toFixed(0));

// Abstand nicht benachbarter Streckenteile (> 150 m Bogenlänge auseinander)
let minAbst = Infinity, minUeber = Infinity, minDy = Infinity, nUeber = 0, nKreuz = 0, maxDyKreuz = 0;
for (let i = 0; i < N; i++) for (let j = i + 1; j < N; j++) {
  if (Math.abs(sp.differenzS(sp.punkte[i].s, sp.punkte[j].s)) < 150) continue;
  const d = Math.hypot(sp.punkte[i].x - sp.punkte[j].x, sp.punkte[i].z - sp.punkte[j].z);
  // W4-J: Ausnahme genau an der niveaugleichen Kreuzung – dort |Δy| < 1 m (sonst wäre es eine Überführung)
  if (d < 40 && anKreuzung(strecke, sp.punkte[i].s, sp.punkte[j].s)) {
    nKreuz++;
    if (d < 3) maxDyKreuz = Math.max(maxDyKreuz, Math.abs(sp.punkte[i].y - sp.punkte[j].y));
    continue;
  }
  // W4-I: Ausnahme genau an der Überführung – dort nur mit Höhenunterschied ≥ 7 m
  if (d < 40 && anUeberfuehrung(sp.punkte[i].s, sp.punkte[j].s)) {
    nUeber++; minUeber = Math.min(minUeber, d);
    if (d < 20) minDy = Math.min(minDy, Math.abs(sp.punkte[i].y - sp.punkte[j].y));
    continue;
  }
  minAbst = Math.min(minAbst, d);
}
pruefe('Abstand nicht benachbarter Teile ≥ 40 m (keine Überschneidung' + (nUeber ? ', außer an der Überführung' : '') + (nKreuz ? ', außer an der Kreuzung' : '') + ')', minAbst >= 40, minAbst.toFixed(1) + ' m');
if (erw.kreuzungen) {
  pruefe(erw.kreuzungen + ' Kreuzung(en) erkannt (Katalog kreuzungen)', (strecke.kreuzungen || []).length === erw.kreuzungen && (daten.kreuzungen || []).length === erw.kreuzungen,
    (strecke.kreuzungen || []).map(k => Math.round(k.sA) + '/' + Math.round(k.sB)).join(', '));
  pruefe('Kreuzung: Abstand < 40 m nur an der Kreuzung, dort |Δy| < 1 m', nKreuz > 0 && maxDyKreuz < 1, 'Paare ' + nKreuz + ', Δy max ' + maxDyKreuz.toFixed(2) + ' m');
} else pruefe('keine Kreuzung (Strecke ohne kreuzungen)', !(strecke.kreuzungen || []).length && nKreuz === 0);
if (erw.ueberfuehrungen) {
  pruefe(erw.ueberfuehrungen + ' Überführung(en), Kreuzung erkannt', strecke.ueberfuehrungen.length === erw.ueberfuehrungen && strecke.ueberfuehrungen.every(u => u.kreuzung),
    strecke.ueberfuehrungen.map(u => u.kreuzung ? Math.round(u.kreuzung.sOben) + '/' + Math.round(u.kreuzung.sUnten) : '-').join(', '));
  pruefe('Überführung: Abstand < 40 m nur an der Kreuzung, dort Δy ≥ 7 m', nUeber > 0 && minDy >= 7, 'Paare ' + nUeber + ', min ' + minUeber.toFixed(1) + ' m, Δy ' + minDy.toFixed(2) + ' m');
}

// Kurven zählen: zusammenhängende Bereiche mit Radius < 150 m und Richtungswechsel > 25°
{
  let kurven = 0, inKurve = false, winkel = 0, vz = 0;
  const start = sp.punkte.findIndex(p => Math.abs(p.kruemmung) < 1 / 400);
  for (let k = 0; k <= N; k++) {
    const p = sp.punkte[(start + k) % N];
    const kurve = Math.abs(p.kruemmung) > 1 / 150;
    const neuVz = Math.sign(p.kruemmung);
    if (kurve && (!inKurve || neuVz !== vz)) {
      if (inKurve && Math.abs(winkel) > 25) kurven++;
      inKurve = true; winkel = 0; vz = neuVz;
    } else if (!kurve && inKurve) {
      if (Math.abs(winkel) > 25) kurven++;
      inKurve = false;
    }
    if (inKurve) winkel += p.kruemmung * sp.ds * 180 / Math.PI;
  }
  pruefe(erw.kurven[0] + '–' + erw.kurven[1] + ' Kurven', kurven >= erw.kurven[0] && kurven <= erw.kurven[1], kurven + ' Kurven');
}
// Geraden ≥ 150 m (Krümmung < 1/500)
{
  const laengen = []; let lauf = 0;
  const start = sp.punkte.findIndex(p => Math.abs(p.kruemmung) > 1 / 100);
  for (let k = 1; k <= N; k++) {
    const p = sp.punkte[(start + k) % N];
    if (Math.abs(p.kruemmung) < 1 / 500) lauf += sp.ds; else { if (lauf > 0) laengen.push(lauf); lauf = 0; }
  }
  if (lauf > 0) laengen.push(lauf);
  const g = erw.geraden, lange = laengen.filter(l => l >= g.min);
  pruefe(g.anzahl[0] + '–' + g.anzahl[1] + ' Geraden ≥ ' + g.min + ' m', lange.length >= g.anzahl[0] && lange.length <= g.anzahl[1],
    lange.map(l => l.toFixed(0) + ' m').join(', ') || 'keine (alle: ' + laengen.map(l => l.toFixed(0)).join(', ') + ')');
  if (erw.langeGerade) pruefe('lange Gerade ≥ ' + erw.langeGerade + ' m', Math.max(...laengen) >= erw.langeGerade, Math.max(...laengen).toFixed(0) + ' m');
}
// Höhe und Steigung
{
  let maxY = 0, maxSteig = 0, yMin = Infinity, yMax = -Infinity;
  for (let i = 0; i < N; i++) {
    const p = sp.punkte[i], q = sp.punkte[(i + 1) % N];
    maxY = Math.max(maxY, Math.abs(p.y)); yMin = Math.min(yMin, p.y); yMax = Math.max(yMax, p.y);
    maxSteig = Math.max(maxSteig, Math.abs(q.y - p.y) / sp.ds);
  }
  pruefe('Höhe |y| ≤ ' + erw.hoehe + ' m', maxY <= erw.hoehe, maxY.toFixed(2) + ' m');
  if (erw.hoeheMin) pruefe('Höhenunterschied ≥ ' + erw.hoeheMin + ' m', yMax - yMin >= erw.hoeheMin, yMin.toFixed(1) + ' … ' + yMax.toFixed(1) + ' m');
  pruefe('Steigung ≤ ' + Math.round(steigMax * 100) + ' %', maxSteig <= steigMax, (maxSteig * 100).toFixed(2) + ' %');
  // Spline-Höhe passt zum Gelände (Straße liegt auf dem Boden)
  let maxAbw = 0;
  if (strecke.sModell) {
    // W4-I (Höhenmodell 'strasse'): Boden = Fahrbahn bis zum Randstreifen (außer auf der Überführung), Querneigung 0
    let wo = 0;
    sp.punkte.forEach((p) => {
      if (strecke.ueberfuehrungBei(p.s, 1)) return;
      for (const q of [0, -strecke.breite / 2 - strecke.randBreite, strecke.breite / 2 + strecke.randBreite]) {
        const d = Math.abs(p.y - strecke.hoeheAn(p.x + p.nx * q, p.z + p.nz * q));
        if (d > maxAbw) { maxAbw = d; wo = p.s; }
      }
    });
    pruefe('Höhenmodell strasse: Boden = Fahrbahn bis zum Rand (< 5 cm, außer Überführung)', maxAbw < 0.05, (maxAbw * 100).toFixed(1) + ' cm bei s=' + wo.toFixed(0));
  } else {
    sp.punkte.forEach(p => { maxAbw = Math.max(maxAbw, Math.abs(p.y - strecke.gelaendeHoehe(p.x, p.z))); });
    pruefe('Mittellinie liegt auf dem Gelände (< 5 cm)', maxAbw < 0.05, (maxAbw * 100).toFixed(1) + ' cm');
  }
}
// Start auf einer Geraden
pruefe('Start auf einer Geraden', [-40, -20, 0, 20, 40].every(d => Math.abs(sp.punktBei(d).kruemmung) < 1 / 500));

if (erw.haarnadeln !== undefined) pruefe(erw.haarnadeln + ' Haarnadel(n)', haarnadelnSuchen().length === erw.haarnadeln, haarnadelnSuchen().map(h => Math.round(h.scheitel)).join('/'));

// ---------- naechster(): global vs. lokal, Seitenabstand ----------
{
  let ok = true, info = '';
  for (let k = 0; k < 200; k++) {
    const p = sp.punkte[(k * 37) % N];
    if (strecke.ueberfuehrungNah(p.s, 10)) continue;    // W4-I: an der Kreuzung ist „global" mehrdeutig (dafür eigener Test)
    if (strecke.kreuzungNah(p.s, 15)) continue;         // W4-J: niveaugleiche Kreuzung ebenso (eigener Test unten)
    const q = ((k % 7) - 3) * 2.5;          // -7.5 .. 7.5 m seitlich
    const x = p.x + p.nx * q, z = p.z + p.nz * q;
    const g = sp.naechster(x, z), l = sp.naechster(x, z, (p.s / sp.ds + 5) | 0);
    if (Math.abs(g.seitenabstand - q) > 0.3 || Math.abs(sp.differenzS(g.s, p.s)) > 0.5 || Math.abs(l.s - g.s) > 0.01) {
      ok = false; info = `s=${p.s.toFixed(0)} q=${q} → ${g.seitenabstand.toFixed(2)} / s ${g.s.toFixed(1)} lokal ${l.s.toFixed(1)}`; break;
    }
  }
  pruefe('naechster(): Seitenabstand + s korrekt, lokal = global', ok, info);
  // Brute-Force-Vergleich mit zufälligen Punkten bis 300 m neben der Strecke
  let ok2 = true;
  const bx0 = Math.min(...sp.punkte.map(p => p.x)), bx1 = Math.max(...sp.punkte.map(p => p.x));
  const bz0 = Math.min(...sp.punkte.map(p => p.z)), bz1 = Math.max(...sp.punkte.map(p => p.z));
  for (let k = 0; k < 300; k++) {
    const x = bx0 - 300 + ((k * 7919) % (bx1 - bx0 + 600)), z = bz0 - 300 + ((k * 104729) % (bz1 - bz0 + 600));
    let best = Infinity;
    sp.punkte.forEach(p => { best = Math.min(best, Math.hypot(p.x - x, p.z - z)); });
    const n = sp.naechster(x, z);
    if (n.abstand > best + 0.01) { ok2 = false; break; }
  }
  pruefe('naechster() global findet den nächsten Punkt (300 Zufallsorte)', ok2);
}

// ---------- Runde 6 (W4-I): Überführung – Höhe aus s, Index-Kontinuität ----------
for (const u of strecke.ueberfuehrungen || []) {
  const kr = u.kreuzung, po = sp.punktBei(kr.sOben), pu = sp.punktBei(kr.sUnten);
  pruefe('Überführung: Kreuzung rechtwinklig-ish (≥ 60°), Δy ≥ 7 m', kr.winkel >= 60 && kr.dy >= 7, kr.winkel.toFixed(0) + '°, Δy ' + kr.dy.toFixed(2) + ' m');
  pruefe('Überführung: Brücke (s0–s1) umfasst die Kreuzung mit ≥ 40 m je Seite', sp.differenzS(kr.sOben, u.s0) >= 40 && sp.differenzS(u.s1, kr.sOben) >= 40,
    u.s0 + '–' + u.s1 + ' Kreuzung ' + kr.sOben.toFixed(0));
  // hoeheBeiS vs. hoeheAn an der Kreuzung
  const yO = strecke.hoeheBeiS(kr.sOben, 0), yU = strecke.hoeheBeiS(kr.sUnten, 0), yBoden = strecke.hoeheAn(po.x, po.z);
  pruefe('hoeheBeiS oben = Spline-y oben, unten = Spline-y unten', Math.abs(yO - po.y) < 1e-6 && Math.abs(yU - pu.y) < 1e-6, yO.toFixed(2) + ' / ' + yU.toFixed(2));
  pruefe('hoeheAn(x, z) an der Kreuzung = Boden = untere Fahrbahn (< 5 cm)', Math.abs(yBoden - pu.y) < 0.05, yBoden.toFixed(2) + ' m');
  pruefe('hoeheAn(x, z, Index oben) = obere Fahrbahn, (…, Index unten) = untere', Math.abs(strecke.hoeheAn(po.x, po.z, sp.indexBei(kr.sOben)) - po.y) < 0.05 &&
    Math.abs(strecke.hoeheAn(po.x, po.z, sp.indexBei(kr.sUnten)) - pu.y) < 0.05);
  // Index-Kontinuität: ein Auto fährt auf der oberen Bahn über die Kreuzung (seitlich versetzt) → bekommt obere s-Werte
  let okO = true, okU = true, infoO = '', infoU = '';
  for (const q of [-4, 0, 4]) {
    let idx = sp.indexBei(kr.sOben - 60), idxU = sp.indexBei(kr.sUnten - 60);
    for (let d = -60; d <= 60; d += 0.5) {
      const a = sp.punktBei(kr.sOben + d), n = strecke.abfrage(a.x + a.nx * q, a.z + a.nz * q, idx); idx = n.index;
      if (Math.abs(sp.differenzS(n.s, kr.sOben + d)) > 0.5) { okO = false; infoO = 'd=' + d + ' q=' + q + ' s=' + n.s.toFixed(1); }
      const b = sp.punktBei(kr.sUnten + d), m = strecke.abfrage(b.x + b.nx * q, b.z + b.nz * q, idxU); idxU = m.index;
      if (Math.abs(sp.differenzS(m.s, kr.sUnten + d)) > 0.5) { okU = false; infoU = 'd=' + d + ' q=' + q + ' s=' + m.s.toFixed(1); }
    }
  }
  pruefe('abfrage(): Auto oben bekommt obere s-Werte (Index-Kontinuität, nicht die unteren)', okO, infoO);
  pruefe('abfrage(): Auto unten bleibt unten', okU, infoU);
  // auf der Überführung: Bande = Geländer, Untergrund rand bis zum Geländer; unten normale Bande
  pruefe('Überführung: Bande oben = Geländer (grenzeEng), unten normal', Math.abs(strecke.grenzeBei(kr.sOben) - strecke.grenzeEng) < 1e-6 &&
    Math.abs(strecke.grenzeBei(kr.sUnten) - strecke.seitenabstandMax) < 1e-6, strecke.grenzeBei(kr.sOben).toFixed(1) + ' / ' + strecke.grenzeBei(kr.sUnten).toFixed(1));
  // Boden unter der Brücke liegt unter der Brückenplatte (≥ 4 m Luft, Platte 1,3 m)
  let minLuft = Infinity;
  for (let s = u.s0 + 14; s <= u.s1 - 14; s += 2) { const p = sp.punktBei(s); minLuft = Math.min(minLuft, p.y - strecke.hoeheAn(p.x, p.z)); }
  pruefe('Überführung: Boden unter der Brücke mind. 3 m tiefer (Tal, 14 m nach den Enden)', minLuft >= 3, minLuft.toFixed(2) + ' m');
  pruefe('Überführung: ueberfuehrungNah oben/unten, sonst nicht', strecke.ueberfuehrungNah(kr.sOben) && strecke.ueberfuehrungNah(kr.sUnten) &&
    !strecke.ueberfuehrungNah(sp.wrapS(kr.sUnten + 200)) && !strecke.ueberfuehrungNah(sp.wrapS(u.s1 + 100)));
  // Fahrbahn stetig: hoeheBeiS entlang der Strecke ohne Sprünge > 0,3 m je 2 m (auch neben der Fahrbahn bis zur Bande)
  let sprung = 0, wo = 0;
  for (const q of [0, 8, -8, 14]) {
    let alt = null;
    for (let s0 = 0; s0 <= L; s0 += 2) { const y = strecke.hoeheBeiS(s0, q); if (alt !== null && Math.abs(y - alt) > sprung) { sprung = Math.abs(y - alt); wo = s0; } alt = y; }
  }
  pruefe('hoeheBeiS stetig (≤ 0,4 m je 2 m, auch neben der Fahrbahn)', sprung <= 0.4, sprung.toFixed(2) + ' m bei s=' + wo);
}

// ---------- Runde 6 (W4-J): niveaugleiche Kreuzung ----------
for (const k of strecke.kreuzungen || []) {
  const pa = sp.punktBei(k.sA), pb = sp.punktBei(k.sB), b2 = strecke.breite / 2;
  pruefe('Kreuzung: Winkel 70–110°, |Δy| < 1 m, beide Mittellinien treffen sich (< 0,5 m)', k.winkel >= 70 && k.winkel <= 110 && k.dy < 1 && k.abstand < 0.5,
    k.winkel.toFixed(1) + '°, Δy ' + k.dy.toFixed(3) + ' m, sA ' + k.sA.toFixed(1) + ' / sB ' + k.sB.toFixed(1));
  pruefe('Kreuzung: Katalog-Bereich s0–s1 umfasst sA', k.sA >= k.s0 && k.sA <= k.s1, k.s0 + '–' + k.s1);
  pruefe('Kreuzung: Höhe beider Fahrbahnen gleich (hoeheBeiS, hoeheAn mit Index A/B, < 1 cm)', Math.abs(strecke.hoeheBeiS(k.sA, 0) - strecke.hoeheBeiS(k.sB, 0)) < 0.01 &&
    Math.abs(strecke.hoeheAn(k.x, k.z, sp.indexBei(k.sA)) - strecke.hoeheAn(k.x, k.z, sp.indexBei(k.sB))) < 0.01);
  pruefe('Kreuzung: nicht im Looping-/Anlauf-Bereich (Looping-s − 165 … Ausfahrt + 30)', [k.sA, k.sB].every(s => strecke.loopings.every(l => {
    const d = sp.differenzS(s, l.s); return d < -165 || d > l.versatz + l.radius * 1.3 + 30; })));
  pruefe('Kreuzung: ≥ 100 m vom Start/Ziel, Abschnitte ≥ 150 m auseinander', [k.sA, k.sB].every(s => Math.abs(sp.differenzS(s, 0)) >= 100) &&
    Math.abs(sp.differenzS(k.sA, k.sB)) >= 150);
  pruefe('kreuzungNah: an sA/sB (± Bereich), nicht 60 m daneben', strecke.kreuzungNah(k.sA) && strecke.kreuzungNah(k.sB) && strecke.kreuzungNah(k.sA + 14) &&
    !strecke.kreuzungNah(k.sA + 60) && !strecke.kreuzungNah(k.sB - 60) && strecke.kreuzungBei(k.sB).pass === 'b');
  // Index-Kontinuität: Fahrt quer über die Kreuzung (seitlich versetzt) → s bleibt im eigenen Abschnitt
  let okA = true, okB = true, infoA = '', infoB = '', ugOk = true, ugInfo = '';
  for (const q of [-5, -2, 0, 3, 5.5]) {
    let ia = sp.indexBei(k.sA - 80), ib = sp.indexBei(k.sB - 80);
    for (let d = -80; d <= 80; d += 0.5) {
      const a = sp.punktBei(k.sA + d), n = strecke.abfrage(a.x + a.nx * q, a.z + a.nz * q, ia); ia = n.index;
      if (Math.abs(sp.differenzS(n.s, k.sA + d)) > 0.5) { okA = false; infoA = 'd=' + d + ' q=' + q + ' s=' + n.s.toFixed(1); }
      const b = sp.punktBei(k.sB + d), m = strecke.abfrage(b.x + b.nx * q, b.z + b.nz * q, ib); ib = m.index;
      if (Math.abs(sp.differenzS(m.s, k.sB + d)) > 0.5) { okB = false; infoB = 'd=' + d + ' q=' + q + ' s=' + m.s.toFixed(1); }
      if (n.untergrund !== 'strasse' || m.untergrund !== 'strasse') { ugOk = false; ugInfo = 'd=' + d + ' q=' + q + ' ' + n.untergrund + '/' + m.untergrund; }
    }
  }
  pruefe('abfrage(): Auto auf Abschnitt A behält A über die Kreuzung (Index-Kontinuität)', okA, infoA);
  pruefe('abfrage(): Auto auf Abschnitt B behält B über die Kreuzung', okB, infoB);
  pruefe('Untergrund auf beiden Fahrbahnen durchgehend strasse (auch auf der Kreuzung)', ugOk, ugInfo);
  // querende Fahrbahn zählt als Straße/Rand (Auto auf A, Punkt auf der Fahrbahn von B neben A)
  const iA = sp.indexBei(k.sA), qB = (q) => { const x = pb.x + pb.nx * q + pb.tx * (b2 + 4), z = pb.z + pb.nz * q + pb.tz * (b2 + 4); return strecke.abfrage(x, z, iA); };
  const r1 = qB(0), r2 = qB(b2 + 0.7), r3 = qB(b2 + 5);
  pruefe('Kreuzung: Fahrbahn des anderen Abschnitts = strasse/rand, daneben Gras (Auto bleibt seinem Abschnitt zugeordnet)',
    r1.untergrund === 'strasse' && r2.untergrund === 'rand' && r3.untergrund === (daten.abseitsUntergrund || 'gras') && Math.abs(sp.differenzS(r1.s, k.sA)) < 15,
    r1.untergrund + '/' + r2.untergrund + '/' + r3.untergrund + ' s=' + r1.s.toFixed(1));
  // Bande: im Kreuzungsbereich normal (Zaun fehlt dort optisch automatisch), weit seitlich trotzdem (Index-Kontinuität: eigener Abschnitt)
  pruefe('Kreuzung: Bande normal (seitenabstandMax), Global-Fallback erst > Bande + 15 m', strecke.grenzeBei(k.sA) === strecke.seitenabstandMax && strecke.grenzeBei(k.sB) === strecke.seitenabstandMax &&
    // v16: 20 m seitlich IM Zwickel (12 m längs, nicht auf der Querstraße) bleibt A; 20 m seitlich AUF der Querstraße = Abschnittswechsel zu B (kein Wall quer über der Straße)
    Math.abs(sp.differenzS(strecke.abfrage(pa.x + pa.nx * 20 + pa.tx * 12, pa.z + pa.nz * 20 + pa.tz * 12, iA).s, k.sA + 12)) < 3);
  pruefe('v16 Kreuzung: 20 m seitlich auf der Querstraße = Abschnittswechsel (s nahe sB), 12 m seitlich = noch Abschnitt A',
    Math.abs(sp.differenzS(strecke.abfrage(pa.x + pa.nx * 20, pa.z + pa.nz * 20, iA).s, k.sB)) < 25 && Math.abs(sp.differenzS(strecke.abfrage(pa.x + pa.nx * 12, pa.z + pa.nz * 12, iA).s, k.sA)) < 3);
  // Masten: 4, je Zufahrt rechts / Ausfahrt links, neben beiden Fahrbahnen (nicht auf Straße oder Rand)
  const mOk = k.masten.length === 4 && k.masten.every((m) => {
    const ug = strecke.untergrundAn(m.x, m.z, sp.indexBei(m.s)), aa = sp.abschnitte(m.x, m.z, 30);
    return ug !== 'strasse' && ug !== 'rand' && aa.every(e => e.abstand > b2 + strecke.randBreite + 0.5) && strecke.saeulen.some(sa => sa.x === m.x && sa.z === m.z);
  });
  pruefe('Kreuzung: 4 Warnlicht-Masten neben den Fahrbahnen (Säulen für die Bande)', mOk, k.masten.map(m => m.pass + ' q=' + m.q.toFixed(1)).join(', '));
  // Listen nicht an der Kreuzung (Kleber, Hindernisse, Bälle, Wasser, Stroh, Turbo, Schilde, Loopings): ≥ Kreuzungsbereich + 20 m
  const nahe = [];
  (daten.kleber || []).forEach(e => { for (let s = e.s0; s <= e.s1; s += 2) if (strecke.kreuzungNah(s, 20)) { nahe.push('kleber@' + e.s0); break; } });
  ['hindernisse', 'baelle', 'wasserstrahlen', 'strohballen', 'boostFelder', 'schilde', 'loopings', 'wracks', 'schanzen', 'dinos'].forEach(fk =>
    (daten[fk] || []).forEach(e => { if (strecke.kreuzungNah(e.s, 20)) nahe.push(fk + '@' + e.s); }));
  pruefe('Kreuzung: keine Katalog-Listen (Kleber, Hindernisse, Bälle, Wasser, Turbo, Schilde …) an der Kreuzung (± 35 m)', nahe.length === 0, nahe.join(', '));
  // v14 Kreuzungs-Zaun: in den Zwickeln zwischen den Fahrbahnen steht der Zaun an der Bande (dort greift sie beim Abbiegen),
  // beide Fahrbahnen samt Randstein bleiben frei; je Abschnitt Zwickelstücke auf beiden Seiten und beiden Seiten der Querstraße
  {
    const kzJe = { a: [0, 0], b: [0, 0] }, zu = [];       // Anzahl je Abschnitt/Seite, Verstöße
    [-1, 1].forEach((seite, si) => strecke.zaunPunkte(seite).forEach((zp) => {
      if (!zp.kz) return;
      const pass = Math.abs(sp.differenzS(zp.s, k.sA)) < 60 ? 'a' : 'b';
      kzJe[pass][si]++;
      const aa = sp.abschnitte(zp.x, zp.z, 40), pq = aa.filter(e => Math.abs(sp.differenzS(e.s, pass === 'a' ? k.sB : k.sA)) < 60)[0];
      const own = aa.filter(e => Math.abs(sp.differenzS(e.s, zp.s)) < 6)[0];
      if (!pq || pq.abstand <= k.halbW + 0.5) zu.push('auf Querstraße ' + zp.s.toFixed(0));
      if (!own || Math.abs(own.abstand - strecke.grenzeBei(zp.s)) > 0.3) zu.push('nicht an der Bande ' + zp.s.toFixed(0));
    }));
    const alle = kzJe.a[0] > 3 && kzJe.a[1] > 3 && kzJe.b[0] > 3 && kzJe.b[1] > 3;
    pruefe('Kreuzungs-Zaun: Zwickelstücke an A und B, beide Seiten, an der Bande und nie auf einer Fahrbahn',
      alle && zu.length === 0, 'A ' + kzJe.a + ' B ' + kzJe.b + (zu.length ? ' ' + zu.slice(0, 3).join(', ') : ''));
    // Auto bleibt vom Zaun unberührt: kein Zaunpunkt innerhalb der Fahrbahn (beider Abschnitte) im ganzen Kreuzungsbereich
    let auf = 0;
    [-1, 1].forEach((seite) => strecke.zaunPunkte(seite).forEach((zp) => {
      if (!zp.ok || Math.hypot(zp.x - k.x, zp.z - k.z) > 60) return;
      if (sp.abschnitte(zp.x, zp.z, 40).some(e => e.abstand < strecke.breite / 2 + 0.3 && Math.abs(sp.differenzS(e.s, zp.s)) > 6)) auf++;
    }));
    pruefe('Kreuzungs-Zaun: kein Zaunpunkt auf der Fahrbahn (± 60 m um die Mitte)', auf === 0, auf + ' Punkte');
  }
  pruefe('Kreuzung: Deko-Sperre um die Mitte', strecke.dekoSperre(k.x + 20, k.z + 20) && strecke.dekoSperre(k.x, k.z) && !strecke.dekoSperre(k.x + 200, k.z + 200));
  // Warnlicht-Logik: Auto 30 m vor der Kreuzung auf A → Masten an B warnen (und umgekehrt), weit weg → keine Warnung
  strecke.kreuzungWarnung([{ s: sp.wrapS(k.sA - 30) }]); const w1 = [k.warnA, k.warnB];
  strecke.kreuzungWarnung([{ nah: { s: sp.wrapS(k.sB - 50) } }]); const w2 = [k.warnA, k.warnB];
  strecke.kreuzungWarnung([{ s: sp.wrapS(k.sA - 90) }, { s: sp.wrapS(k.sB + 30) }]); const w3 = [k.warnA, k.warnB];
  strecke.kreuzungWarnung([]);
  pruefe('Warnlicht: Auto auf A < 60 m → Masten an B warnen, Auto auf B → Masten an A, sonst aus', !w1[0] && w1[1] && w2[0] && !w2[1] && !w3[0] && !w3[1],
    JSON.stringify([w1, w2, w3]));
}

// ---------- Untergrund ----------
{
  // Stelle auf einer Geraden suchen (dort ist die Seite eindeutig)
  let sG = 300;
  for (let s = 0; s < L; s += 10) if (Math.abs(sp.punktBei(s).kruemmung) < 1 / 500 && s > 60) { sG = s; break; }
  const p = sp.punktBei(sG), b2 = strecke.breite / 2, ab = daten.abseitsUntergrund || 'gras';
  const an = (q) => strecke.untergrundAn(p.x + p.nx * q, p.z + p.nz * q);
  pruefe('Untergrund Mitte = strasse', an(0) === 'strasse', an(0));
  pruefe('Untergrund breite/2+0.5 = rand', an(b2 + 0.5) === 'rand' && an(-b2 - 0.5) === 'rand', an(b2 + 0.5) + '/' + an(-b2 - 0.5));
  pruefe('Untergrund breite/2+4 m = ' + ab, an(b2 + 4) === ab && an(-b2 - 4) === ab, an(b2 + 4));
  const nAb = strecke.abfrage(p.x + p.nx * (b2 + 4), p.z + p.nz * (b2 + 4));
  pruefe('abfrage() liefert Themen-Untergrund', nAb.untergrund === ab, nAb.untergrund);
}

// ---------- Brücken und Tunnel (Runde 3) ----------
{
  const b2 = strecke.breite / 2, rb = strecke.randBreite;
  const bereiche = strecke.bruecken.map(b => Object.assign({ was: 'Brücke' }, b)).concat(strecke.tunnel.map(t => Object.assign({ was: 'Tunnel' }, t)));
  bereiche.forEach((b) => {
    pruefe(b.was + ' ' + b.s0 + '–' + b.s1 + ' liegt auf der Strecke (30–150 m, ≥ 60 m vom Start)',
      b.s0 >= 60 && b.s1 <= L - 60 && b.s1 - b.s0 >= 30 && b.s1 - b.s0 <= 150, (b.s1 - b.s0) + ' m');
    const m = sp.punktBei(b.mitte);
    pruefe(b.was + ': Bande in der Mitte = Geländer/Wand an der Fahrbahnkante', Math.abs(strecke.grenzeBei(b.mitte) - strecke.grenzeEng) < 1e-6 &&
      strecke.grenzeEng < b2 + rb + 1, strecke.grenzeBei(b.mitte).toFixed(2) + ' m');
    pruefe(b.was + ': Trichter davor (Bande 30 m vorher wieder normal)', Math.abs(strecke.grenzeBei(b.s0 - 30) - strecke.seitenabstandMax) < 1e-6);
    pruefe(b.was + ': Mitte der Fahrbahn = strasse', strecke.untergrundAn(m.x, m.z) === 'strasse');
  });
  for (let i = 0; i < bereiche.length; i++) for (let j = i + 1; j < bereiche.length; j++) {
    const a = bereiche[i], c = bereiche[j];
    pruefe('Brücken/Tunnel überlappen nicht (mit 40 m Abstand)', a.s1 + 40 < c.s0 || c.s1 + 40 < a.s0, a.s0 + '/' + c.s0);
  }
  strecke.bruecken.forEach((b) => {
    const m = sp.punktBei(b.mitte);
    const tief = strecke.hoeheAn(m.x, m.z) - strecke.bodenHoehe(m.x, m.z);
    pruefe('Brücke ' + b.art + ': Senke darunter ≥ 3 m', tief >= 3, tief.toFixed(2) + ' m');
    // Boden an den Brückenenden wieder auf Straßenhöhe (Widerlager)
    const e0 = sp.punktBei(b.s0), e1 = sp.punktBei(b.s1);
    const rest = Math.max(strecke.senkeTiefe(e0.x, e0.z), strecke.senkeTiefe(e1.x, e1.z));
    pruefe('Brücke: Senke endet an den Brückenenden (< 5 cm)', rest < 0.05, (rest * 100).toFixed(1) + ' cm');
  });
  // Die Senke darf keine andere Stelle der Strecke absenken (Straße schwebt sonst)
  let maxAbs = 0, wo = -1;
  sp.punkte.forEach((p) => {
    if (strecke.brueckeBei(p.s, 2)) return;
    for (const q of [-b2 - rb, 0, b2 + rb]) {
      const t = strecke.senkeTiefe(p.x + p.nx * q, p.z + p.nz * q);
      if (t > maxAbs) { maxAbs = t; wo = p.s; }
    }
  });
  pruefe('Senken nur unter Brücken (Straße sonst auf dem Boden, < 2 cm)', maxAbs < 0.02, (maxAbs * 100).toFixed(1) + ' cm bei s=' + wo.toFixed(0));
  // imTunnel
  strecke.tunnel.forEach((t) => {
    const ok = strecke.imTunnel(t.s0 + 1) && strecke.imTunnel(t.mitte) && strecke.imTunnel(t.s1 - 1) &&
      !strecke.imTunnel(t.s0 - 1) && !strecke.imTunnel(t.s1 + 1) && strecke.imTunnel(t.s0 - 3, 5) && !strecke.imTunnel(t.s0 - 6, 5) &&
      strecke.imTunnel(t.s0 + L) && strecke.tunnelBei(t.mitte) === t;
    pruefe('imTunnel(s) korrekt (Grenzen, Zugabe, Rundenübergang)', ok);
  });
  if (!strecke.tunnel.length) pruefe('imTunnel(s) ohne Tunnel immer false', [0, 300, 900].every(s => !strecke.imTunnel(s)));
  // Auf der Brücke neben der Straße: Randstreifen (Bretter/Gehweg) bis zum Geländer
  strecke.bruecken.forEach((b) => {
    const p = sp.punktBei(b.mitte), q = b2 + rb + 0.2;
    const u = strecke.untergrundAn(p.x + p.nx * q, p.z + p.nz * q);
    pruefe('Brücke: zwischen Randstreifen und Geländer = rand', u === 'rand', u);
  });
}

// ---------- Hindernisse (Runde 3) ----------
{
  const ANZAHL = { wiese: { sand: 1, ast: 1, baustelle: 1 }, wald: { oel: 1, ast: 1, baustelle: 1, sand: 1 },
    wueste: { sand: 2, oel: 1, baustelle: 1 }, fantasie: { oel: 1, ast: 1 }, dino: { sand: 1, baustelle: 1, ast: 1, oel: 1, lava: 2 } }[daten.id];
  const hs = strecke.hindernisse, b2 = strecke.breite / 2, hz = erw.hindernisse || [3, 5];
  pruefe(hz[0] + '–' + hz[1] + ' Hindernisse', hs.length >= hz[0] && hs.length <= hz[1], hs.map(h => h.typ + '@' + Math.round(h.s)).join(', '));
  if (ANZAHL) {
    const ist = {}; hs.forEach(h => { ist[h.typ] = (ist[h.typ] || 0) + 1; });
    pruefe('Hindernis-Typen wie geplant', Object.keys(ANZAHL).every(k => ist[k] === ANZAHL[k]) && Object.keys(ist).every(k => ANZAHL[k]), JSON.stringify(ist));
  }
  const haarnadeln = haarnadelnSuchen().map(h => h.scheitel);
  const sperr = [];
  hs.forEach((h) => {
    const name = h.typ + '@' + Math.round(h.s);
    // auf der Fahrbahn
    pruefe(name + ': liegt auf der Fahrbahn', Math.abs(h.seitenabstand) + Math.min(h.halbbreite, 1) <= b2 + 0.01 && h.halbbreite > 0.5,
      'q=' + h.seitenabstand.toFixed(1) + ' ±' + h.halbbreite.toFixed(1));
    const p = sp.punktBei(h.s), mx = p.x + p.nx * h.seitenabstand, mz = p.z + p.nz * h.seitenabstand;
    if (h.typ !== 'baustelle') pruefe(name + ': Grund unter dem Hindernis = Straße', strecke.untergrundAn(p.x, p.z) !== 'gras' && strecke.untergrundAn(p.x, p.z) !== 'sand');
    // nicht auf Start/Ziel, nicht in Tunnel/Brücke (± 20 m), nicht direkt vor einer Haarnadel
    const s0 = h.s0, s1 = sp.wrapS(h.s0 + h.laenge);
    const nahStart = Math.min(Math.abs(sp.differenzS(s0, 0)), Math.abs(sp.differenzS(s1, 0))) < 60 || s1 < s0;
    const inEng = strecke._engstellen.some(b => [s0, h.s, s1].some(s => strecke._inBereich(b, s, 20))) ||
      [s0, h.s, s1].some(s => strecke.ueberfuehrungNah(s, 20)) ||    // W4-I: auch nicht unter der Überführung
      [s0, h.s, s1].some(s => strecke.kreuzungNah(s, 20));           // W4-J: nicht an der Kreuzung
    const vorHaar = haarnadeln.find(a => { const d = sp.differenzS(a, s1); return d > -10 && d < 50; });
    pruefe(name + ': nicht am Start, nicht in Tunnel/Brücke, nicht vor einer Haarnadel', !nahStart && !inEng && vorHaar === undefined,
      'Haarnadeln ' + haarnadeln.map(Math.round).join('/'));
    sperr.push([s0, s1]);
    if (h.untergrund) {
      pruefe(name + ': untergrundAn Mitte = ' + h.untergrund, strecke.untergrundAn(mx, mz) === h.untergrund, strecke.untergrundAn(mx, mz));
      const q2 = h.seitenabstand + (h.seitenabstand > 0 ? -1 : 1) * (h.halbbreite + 1);
      const u2 = strecke.untergrundAn(p.x + p.nx * q2, p.z + p.nz * q2);
      const pv = sp.punktBei(h.s + h.halblaenge + 2), u3 = strecke.untergrundAn(pv.x + pv.nx * h.seitenabstand, pv.z + pv.nz * h.seitenabstand);
      pruefe(name + ': daneben / dahinter wieder strasse', u2 === 'strasse' && u3 === 'strasse', u2 + '/' + u3);
      const n = strecke.abfrage(mx, mz);
      pruefe(name + ': abfrage() liefert den Fleck-Untergrund', n.untergrund === h.untergrund);
    }
    if (h.typ === 'baustelle') {
      let gerade = true;
      for (let s = h.s0; s <= h.s0 + h.laenge; s += 2) if (Math.abs(sp.punktBei(s).kruemmung) > 1 / 300) gerade = false;
      if (daten.id === 'wiese') pruefe(name + ': Baustelle auf einer Geraden', gerade);
      pruefe(name + ': Pylonen + Bake vorhanden, gesperrte Hälfte', h.pylonen.length >= 10 && h.segmente.length === 1 &&
        h.pylonen.every(pp => { const n = sp.naechster(pp.x, pp.z); return Math.abs(n.seitenabstand) <= b2 && Math.sign(n.seitenabstand) === h.seite; }));
    }
    if (h.typ === 'oel' && daten.id === 'wald') pruefe(name + ': Öl liegt in einer Kurve', Math.abs(p.kruemmung) > 1 / 150, 'R ' + (1 / Math.abs(p.kruemmung)).toFixed(0) + ' m');
  });
  // Hindernisse überlappen sich nicht (≥ 30 m Abstand)
  let ueber = false;
  for (let i = 0; i < sperr.length; i++) for (let j = i + 1; j < sperr.length; j++) {
    const a = sperr[i], c = sperr[j];
    if (!(sp.differenzS(c[0], a[1]) > 30 || sp.differenzS(a[0], c[1]) > 30)) ueber = true;
  }
  pruefe('Hindernisse mit ≥ 30 m Abstand zueinander', !ueber);
}

// ---------- Loopings, Bälle, Wasserstrahlen (Fantasie, Runde 3) ----------
if (strecke.loopings.length || daten.baelle || daten.wasserstrahlen) {
  const gerade = (s0, s1) => { for (let s = s0; s <= s1; s += 2) if (Math.abs(sp.punktBei(s).kruemmung) > 1 / 500) return false; return true; };
  if (daten.id === 'fantasie') pruefe('Fantasie: genau 2 Loopings', strecke.loopings.length === 2);
  strecke.loopings.forEach((l) => {
    const name = 'Looping@' + Math.round(l.s);
    pruefe(name + ': Radius 12 m, vMin ≈ 87 km/h', l.radius === 12 && Math.abs(l.vMin * 3.6 - 87.3) < 0.5, (l.vMin * 3.6).toFixed(1) + ' km/h');
    pruefe(name + ': auf einer Geraden mit ≥ 120 m Anlauf (bis Ausfahrt + 20 m gerade)', gerade(l.s - 120, l.s + l.versatz + 20));
    let anlauf = 0; while (anlauf < 600 && gerade(l.s - anlauf - 2, l.s)) anlauf += 2;
    console.log('     Anlauf vor ' + name + ': ' + anlauf + ' m gerade');
    pruefe(name + ': nicht am Start (≥ 60 m), nicht in Tunnel/Brücke', Math.abs(sp.differenzS(l.s, 0)) >= 60 && !strecke._engstellen.some(b => strecke._inBereich(b, l.s, 30)));
    pruefe(name + ': keine Hindernisse im Anlauf (60 m) und im Looping', hs_frei(l.s - 60, l.s1 + 10));
    const dyn = (daten.baelle || []).map(b => b.s).concat((daten.wasserstrahlen || []).map(w => w.s));
    pruefe(name + ': Bälle/Wasser ≥ 80 m vor und 30 m nach dem Looping', dyn.every(s => { const d = sp.differenzS(s, l.s); return d < -80 || d > l.versatz + 30; }),
      dyn.map(Math.round).join('/'));
  });
  function hs_frei(a, b) { return strecke.hindernisse.every(h => sp.differenzS(h.s1, a) < 0 || sp.differenzS(h.s0, b) > 0); }
  for (let i = 0; i < strecke.loopings.length; i++) for (let j = i + 1; j < strecke.loopings.length; j++)
    pruefe('Loopings weit auseinander (≥ 200 m)', Math.abs(sp.differenzS(strecke.loopings[i].s, strecke.loopings[j].s)) >= 200);
  (daten.baelle || []).forEach((b) => {
    pruefe('Ballstelle@' + b.s + ': nicht am Start, abRunde gültig, Seite ±1', Math.abs(sp.differenzS(b.s, 0)) >= 60 && (b.abRunde === 'letzte' || b.abRunde >= 2) && (b.von === -1 || b.von === 1));
  });
  (daten.wasserstrahlen || []).forEach((w) => {
    const pkt = sp.punktBei(w.s), x = pkt.x + pkt.nx * w.seitenabstand, z = pkt.z + pkt.nz * w.seitenabstand;
    pruefe('Wasserstrahl@' + w.s + ': Düse auf der Fahrbahn, ≥ 30 m von Hindernissen', strecke.untergrundAn(x, z) === 'strasse' &&
      hs_frei(w.s - 30, w.s + 30), 'q=' + w.seitenabstand);
  });
}

// ---------- Runde 4: Welten ----------
if (daten.welten) {
  const namen = Object.keys(daten.welten);
  const STANDARD = { wiese: 'klassisch', wald: 'hindernisse', wueste: 'hindernisse', fantasie: 'fantasie', dino: 'hindernisse' };
  if (STANDARD[daten.id]) pruefe('weltStandard = ' + STANDARD[daten.id], daten.weltStandard === STANDARD[daten.id], daten.weltStandard);
  const erwNamen = daten.id === 'formel1' ? ['klassisch'] : (daten.id === 'fantasie' ? ['fantasie', 'verrueckt'] : ['klassisch', 'hindernisse', 'stunt', 'verrueckt']).concat('alles');   // v29: Formel 1 nur Klassisch
  pruefe('Welten: ' + erwNamen.join(', '), JSON.stringify(namen) === JSON.stringify(erwNamen), namen.join(', '));
  pruefe('R.weltInfo kennt alle Welten (Name + Emoji)', namen.every(w => R.weltInfo[w] && R.weltInfo[w].name && R.weltInfo[w].emoji));
  // Runde 6 (B4): Welt „Alles" = alle Schichten an, vereinigt die Listen aller anderen Welten
  if (daten.welten.alles) {
    const ws = Object.keys(daten.welten).filter(w => w !== 'alles');
    const al = new R.Strecke(daten, { welt: 'alles' }), a = al.aktiveSchichten;
    pruefe('Welt alles: weltName akzeptiert, alle Schichten an', R.Strecke.weltName(daten, 'alles') === 'alles' && al.welt === 'alles' &&
      R.Strecke.SCHICHTEN.every(k => a[k] === true), Object.keys(a).filter(k => !a[k]).join(','));
    pruefe('Welt alles: R.weltInfo.alles = 🎪 Alles', R.weltInfo.alles && R.weltInfo.alles.name === 'Alles' && R.weltInfo.alles.emoji === '🎪');
    const unions = ['hindernisse', 'wracks', 'strohballen', 'schanzen', 'boostFelder', 'schilde'].every((l) =>
      ws.every(w => al[l].length >= new R.Strecke(daten, { welt: w })[l].length));
    pruefe('Welt alles vereinigt die Schichten (Listen >= jeder andere Welt)', unions);
    pruefe('Welt alles: Bälle/Wasserstrahlen/Dinos/Loopings wie Katalog', al.daten.baelle.length === (daten.baelle || []).length &&
      al.daten.wasserstrahlen.length === (daten.wasserstrahlen || []).length && (al.daten.dinos || []).length === (daten.dinos || []).length &&
      al.loopings.length === (daten.loopings || []).length);
    pruefe('Welt alles: Länge unverändert', Math.abs(al.laenge - L) < 1e-6);
  }
  const std = new R.Strecke(daten);
  pruefe('new Strecke(daten) → weltStandard', std.welt === daten.weltStandard, std.welt);
  pruefe('unbekannte Welt → weltStandard', new R.Strecke(daten, { welt: 'gibtsnicht' }).welt === daten.weltStandard);
  const katalogH = (daten.hindernisse || []).length;
  const listen = { wracks: 'wracks', strohballen: 'strohballen', schanzen: 'schanzen', boost: 'boostFelder', schild: 'schilde',
    baelle: 'baelle', wasserstrahlen: 'wasserstrahlen', spuren: 'spuren', dinos: 'dinos' };
  namen.forEach((w) => {
    const st = new R.Strecke(daten, { welt: w }), a = st.aktiveSchichten, pf = 'Welt ' + w + ': ';
    pruefe(pf + 'welt/weltDaten/aktiveSchichten gesetzt, alle Schichten bool', st.welt === w && R.Strecke.SCHICHTEN.every(k => typeof a[k] === 'boolean') &&
      JSON.stringify(st.weltDaten) === JSON.stringify(a));
    pruefe(pf + 'Länge + Steigung wie Standard', Math.abs(st.laenge - L) < 1e-6 && st.spline.punkte.every((p, i) => {
      const q = st.spline.punkte[(i + 1) % N]; return Math.abs(q.y - p.y) / st.spline.ds <= (STEIGUNG_JE[daten.id] || STEIGUNG_MAX); }), st.laenge.toFixed(1) + ' m');
    pruefe(pf + 'Hindernisse nur wenn aktiv', a.hindernisse ? st.hindernisse.length === katalogH : st.hindernisse.length === 0,
      st.hindernisse.length + ' von ' + katalogH);
    if (w === 'klassisch') {
      pruefe(pf + 'keine Hindernisse/Schichten, Breite konstant', st.hindernisse.length === 0 && st.wracks.length === 0 && st.schanzen.length === 0 &&
        st.boostFelder.length === 0 && st.spuren.length === 0 && st.daten.baelle.length === 0 && [0, 500, 900, 2000].every(s => st.breiteBei(s) === st.breite || st.gabelNah(s, 0)));   // v25: Gabelung (Dino 675–1025) zählt nicht als Spur
    }
    // strecke.daten zeigt nur aktive Listen (dynamik.js liest baelle/wasserstrahlen dort)
    const ok = Object.keys(listen).every((k) => {
      const f = listen[k], soll = a[k] ? (daten[f] || []).length : 0;
      return (st.daten[f] || []).length === soll;
    });
    pruefe(pf + 'strecke.daten enthält nur Listen aktiver Schichten', ok);
    pruefe(pf + 'Listen wracks/strohballen/schanzen/boostFelder/schilde nur wenn aktiv',
      st.wracks.length === (a.wracks ? (daten.wracks || []).length : 0) && st.strohballen.length === (a.strohballen ? (daten.strohballen || []).length : 0) &&
      st.schanzen.length === (a.schanzen ? (daten.schanzen || []).length : 0) && st.boostFelder.length === (a.boost ? (daten.boostFelder || []).length : 0) &&
      st.schilde.length === (a.schild ? (daten.schilde || []).length : 0));
    if (st.loopings.length || (daten.loopings || []).length) pruefe(pf + 'Loopings aktiv', st.loopings.length === (a.loopings ? daten.loopings.length : 0));
  });

  // ---------- Neue Listen: Anzahl, auf der Straße, außerhalb der Sperrzonen ----------
  const alle = new R.Strecke(daten, { welt: namen[namen.length - 1] });   // letzte Welt = alles an (Verrückt)
  const hn = haarnadelnSuchen();
  const hsAlle = strecke.hindernisse;   // Hindernisse (aus der Hindernis-Welt)
  const eng = alle.spuren.filter(e => e.spuren === 1), UE = R.Strecke.SPUR_UEBERGANG;
  const bereichAbstand = (a0, a1, b0, b1) => Math.max(0, sp.differenzS(b0, a1), sp.differenzS(a0, b1));
  const punkte = [];   // alle Einzel-Elemente für den Abstandstest
  const sperre = (s0, s1) => {
    const g = [];
    if (Math.min(Math.abs(sp.differenzS(s0, 0)), Math.abs(sp.differenzS(s1, 0))) < 60 || sp.differenzS(s1, s0) < 0 || (sp.differenzS(0, s0) > 0 && sp.differenzS(0, s1) < 0)) g.push('Start');
    if (alle._engstellen.some(b => [s0, (s0 + s1) / 2, s1].some(s => alle._inBereich(b, s, 20)))) g.push('Tunnel/Brücke');
    if (alle.ueberfuehrungNah && [s0, (s0 + s1) / 2, s1].some(s => alle.ueberfuehrungNah(s, 20))) g.push('Überführung');   // W4-I: auch darunter
    if (alle.kreuzungNah && [s0, (s0 + s1) / 2, s1].some(s => alle.kreuzungNah(s, 20))) g.push('Kreuzung');            // W4-J
    if (alle.loopings.some(l => bereichAbstand(s0, s1, l.s0, l.s1) < 30)) g.push('Looping');
    if (hn.some(h => bereichAbstand(s0, s1, h.s0, h.s1) < 5)) g.push('Haarnadel');
    if (eng.some(e => bereichAbstand(s0, s1, e.s0 - UE, e.s1 + UE) < 10)) g.push('1 Spur');
    if (hsAlle.some(h => bereichAbstand(s0, s1, h.s0, h.s1) < 30)) g.push('Hindernis');
    return g;
  };
  const ANZ = daten.id === 'formel1' ? { wracks: [0, 0], strohballen: [0, 0], schanzen: [0, 0], boostFelder: [0, 0], schilde: [0, 0] }
    : daten.id === 'fantasie' ? { wracks: [0, 0], strohballen: [2, 4], schanzen: [0, 0], boostFelder: [2, 4], schilde: [2, 4] }
    : { wracks: [2, 4], strohballen: daten.id === 'wueste' ? [0, 0] : [2, 4], schanzen: [2, 4], boostFelder: [2, 4], schilde: [2, 4] };
  Object.keys(ANZ).forEach((f) => {
    const n = (daten[f] || []).length;
    pruefe(f + ': ' + ANZ[f][0] + '–' + ANZ[f][1] + ' Einträge', n >= ANZ[f][0] && n <= ANZ[f][1], n);
  });
  const aufStrasse = (s, q) => { const p = sp.punktBei(s); return alle.untergrundAn(p.x + p.nx * q, p.z + p.nz * q) === 'strasse'; };
  const liste = (f, laengeVon, q) => (daten[f] || []).forEach((e) => {
    const l = laengeVon(e), name = f + '@' + e.s, g = sperre(e.s - 2, e.s + l + 2);
    pruefe(name + ': auf der Straße, nicht in Sperrzonen', aufStrasse(e.s, q(e)) && aufStrasse(e.s + l, q(e)) && g.length === 0, g.join(', ') || 'q=' + q(e));
    punkte.push({ name, s0: e.s, s1: e.s + l });
  });
  liste('wracks', () => 5, e => e.seitenabstand);
  liste('strohballen', () => 3, () => 0);
  liste('boostFelder', e => e.laenge || 12, e => e.seitenabstand);
  liste('schilde', () => 1, e => e.seitenabstand);
  liste('baelle', () => 3, () => 0);
  liste('wasserstrahlen', () => 3, e => e.seitenabstand);
  liste('dinos', () => 4, () => 0);
  liste('meteoriten', () => 4, () => 0);   // Runde 6 (W2-C): Brocken rollen quer über die Straße
  liste('tiere', () => 4, () => 0);        // Runde 6 (W2-C): Rehe/Bären (Wald)
  // Runde 5b: laufende Dinos nur Dino-Strecke (2 Stellen), nur ab Welt Hindernisse (Klassisch: nur Deko-Dinos)
  if (daten.id === 'dino') {
    pruefe('dinos: 4–5 Stellen (Runde 6: doppelt so viele; von ±1, intervall/tempo > 0, art dreihorn/langhals)', daten.dinos.length >= 4 && daten.dinos.length <= 5 &&
      daten.dinos.every(e => (e.von === 1 || e.von === -1) && e.intervall > 0 && e.tempo > 0 && ['dreihorn', 'langhals'].includes(e.art)));
    pruefe('dinos: Welt klassisch aus, hindernisse/stunt/verrueckt an', !daten.welten.klassisch.dinos &&
      ['hindernisse', 'stunt', 'verrueckt'].every(w => daten.welten[w].dinos) && new R.Strecke(daten, { welt: 'klassisch' }).dinos.length === 0 &&
      new R.Strecke(daten, { welt: 'hindernisse' }).dinos.length === daten.dinos.length);
    pruefe('Brücke art stamm, Tunnel art hoehle, strohOptik fels', strecke.bruecken[0].art === 'stamm' && strecke.tunnel[0].art === 'hoehle' && daten.strohOptik === 'fels');
    // ---------- Runde 6 (W2-C) ----------
    const [t1, t2] = strecke.tunnel;
    pruefe('C4: 2 Tunnel – Tunnel 1 kurz (60 m), Tunnel 2 lang (140 m)', strecke.tunnel.length === 2 && Math.abs(t1.laenge - 60) < 1 && Math.abs(t2.laenge - 140) < 1,
      strecke.tunnel.map(t => t.s0 + '–' + t.s1).join(', '));
    let kurveT2 = 0;
    for (let s = t2.s0; s < t2.s1; s += 2) kurveT2 += Math.abs(sp.punktBei(s).kruemmung) * 2;
    pruefe('C4: Tunnel 2 mit Kurve (≥ 45° Richtungsänderung im Tunnel)', kurveT2 * 180 / Math.PI >= 45, (kurveT2 * 180 / Math.PI).toFixed(0) + '°');
    pruefe('C4: beide Tunnel im selben Berg-Massiv (berg s0..s1 umfasst beide, Schlucht dazwischen ≥ 40 m)',
      daten.berg && daten.berg.s0 < t1.s0 && daten.berg.s1 > t2.s1 && t2.s0 - t1.s1 >= 40, JSON.stringify(daten.berg));
    pruefe('C4: Tunnel nicht am Start/Ziel (≥ 60 m)', strecke.tunnel.every(t => Math.abs(sp.differenzS(t.s0, 0)) >= 60 && Math.abs(sp.differenzS(t.s1, 0)) >= 60));
    const lav = strecke.hindernisse.filter(h => h.typ === 'lava');
    pruefe('C2: 2 Lava-Zungen über die halbe Fahrbahn (Seite frei), KI-Daten hart (gefahr 1, halbbreite, seite)', lav.length === 2 && lav.every(h =>
      h.hart && h.gefahr === 1 && h.seite === Math.sign(h.seitenabstand) && h.halbbreite > 2 && h.flaeche &&
      Math.min(Math.abs(h.flaeche.q0), Math.abs(h.flaeche.q1)) < 0.5 && Math.max(Math.abs(h.flaeche.q0), Math.abs(h.flaeche.q1)) > strecke.breite / 2), lav.map(h => h.s + '/' + h.seite).join(', '));
    pruefe('C2: Lava nur ab Welt Hindernisse', new R.Strecke(daten, { welt: 'klassisch' }).hindernisse.every(h => h.typ !== 'lava'));
    pruefe('C5: 2 Meteoriten-Stellen (von ±1)', (daten.meteoriten || []).length === 2 && daten.meteoriten.every(m => m.von === 1 || m.von === -1));
    const fl = daten.flugsaurier;
    let flGerade = !!fl;
    if (fl) for (let s = fl.s0; s <= fl.s1; s += 4) if (Math.abs(sp.punktBei(s).kruemmung) > 1 / 500) flGerade = false;
    pruefe('C6: Flugsaurier-Bereich auf der langen Geraden (≥ 400 m, kein Tunnel)', flGerade && fl.s1 - fl.s0 >= 400 &&
      !strecke.tunnel.some(t => t.s1 > fl.s0 && t.s0 < fl.s1), fl ? fl.s0 + '–' + fl.s1 : '-');
    pruefe('C3: Vulkanausbruch eingeschaltet', !!(daten.vulkan && daten.vulkan.ausbruch));
  }
  if (daten.id === 'wald') {
    const ti = daten.tiere || [];
    pruefe('Wald: Rehe + Bären (2–6 Stellen, art reh/baer, von ±1, intervall/tempo > 0)', ti.length >= 2 && ti.length <= 6 &&
      ti.some(t => t.art === 'reh') && ti.some(t => t.art === 'baer') && ti.every(t => ['reh', 'baer'].includes(t.art) && (t.von === 1 || t.von === -1) && t.intervall > 0 && t.tempo > 0));
  }
  (daten.wracks || []).forEach(e => pruefe('wracks@' + e.s + ': brennt bool, autoId gesetzt', typeof e.brennt === 'boolean' && typeof e.autoId === 'string'));
  (daten.strohballen || []).forEach(e => pruefe('strohballen@' + e.s + ': von ±1, intervall/tempo > 0', (e.von === 1 || e.von === -1) && e.intervall > 0 && e.tempo > 0));
  (daten.schanzen || []).forEach((e) => {
    const l = e.laenge || 10, name = 'Schanze@' + e.s;
    pruefe(name + ': winkel 8 oder 12, laenge 10', (e.winkel === 8 || e.winkel === 12) && l === 10);
    let gerade = true;
    for (let s = e.s - 10; s <= e.s + l + 60; s += 2) if (Math.abs(sp.punktBei(s).kruemmung) > 1 / 500) gerade = false;
    pruefe(name + ': Gerade mit ≥ 60 m freier Landung', gerade);
    const g = sperre(e.s - 2, e.s + l + 60);
    pruefe(name + ': Rampe + Landebereich auf der Straße, nicht in Sperrzonen', aufStrasse(e.s, 0) && aufStrasse(e.s + l, 0) && g.length === 0, g.join(', '));
    punkte.push({ name, s0: e.s, s1: e.s + l + 60 });
  });
  // keine zwei Elemente aufeinander (≥ 15 m Abstand, Landebereich der Schanzen frei)
  let doppelt = '';
  for (let i = 0; i < punkte.length; i++) for (let j = i + 1; j < punkte.length; j++) {
    if (bereichAbstand(punkte[i].s0, punkte[i].s1, punkte[j].s0, punkte[j].s1) < 15) doppelt += punkte[i].name + '/' + punkte[j].name + ' ';
  }
  pruefe('Wracks/Strohballen/Schanzen/Boost/Schilde/Bälle/Wasser ≥ 15 m auseinander', doppelt === '', doppelt);

  // ---------- Spuren ----------
  const stunt = namen.find(w => daten.welten[w].spuren);
  if ((daten.spuren || []).length) {
    pruefe('1–2 Spur-Abschnitte (1 und 3 Spuren)', daten.spuren.length >= 1 && daten.spuren.length <= 2 && daten.spuren.every(e => e.spuren === 1 || e.spuren === 3));
    const st = new R.Strecke(daten, { welt: stunt }), B = R.Strecke.SPUR_BREITE;
    st.spuren.forEach((e) => {
      const name = e.spuren + ' Spur(en) ' + e.s0 + '–' + e.s1;
      let innen = true;
      for (let s = e.s0; s <= e.s1; s += 2) if (Math.abs(st.breiteBei(s) - B[e.spuren]) > 1e-9) innen = false;
      pruefe(name + ': breiteBei = ' + B[e.spuren] + ' m im Abschnitt, außerhalb (± ' + UE + ' m) = ' + st.breite + ' m',
        innen && st.breiteBei(e.s0 - UE - 1) === st.breite && st.breiteBei(e.s1 + UE + 1) === st.breite,
        st.breiteBei(e.s0 - UE / 2).toFixed(2) + ' m mitten im Übergang');
      const g = sperre(e.s0 - UE, e.s1 + UE).filter(x => x !== '1 Spur');
      pruefe(name + ': nicht am Start, nicht in Tunnel/Brücke/Looping, keine Hindernisse', g.filter(x => x !== 'Haarnadel').length === 0, g.join(', '));
      const m = sp.punktBei((e.s0 + e.s1) / 2), an = q => st.untergrundAn(m.x + m.nx * q, m.z + m.nz * q);
      const b2 = B[e.spuren] / 2;
      pruefe(name + ': Untergrund strasse bis ' + b2 + ' m, dann rand', an(b2 - 0.3) === 'strasse' && an(-b2 + 0.3) === 'strasse' && an(b2 + 0.5) === 'rand',
        an(b2 - 0.3) + '/' + an(b2 + 0.5));
      if (e.spuren === 1) {
        const gm = st.grenzeBei((e.s0 + e.s1) / 2);
        pruefe(name + ': Leitplanke direkt am Rand (Bande ' + gm.toFixed(1) + ' m)', Math.abs(gm - (b2 + st.randBreite + 0.4)) < 1e-6);
        pruefe(name + ': Bande weit vorher/nachher normal', st.grenzeBei(e.s0 - UE - 30) === st.seitenabstandMax && st.grenzeBei(e.s1 + UE + 30) === st.seitenabstandMax);
      }
    });
    // stetig: Fahrbahnrand (halbe Breite) springt nie mehr als 0,5 m je 2 m, Bande nie enger als Fahrbahn + Rand
    let maxSprung = 0, wo = 0, bandeOk = true;
    for (let s = 0; s < L; s += 2) {
      if (st.gabelungen.some(g => s >= g.s0 - 3 && s <= g.s1 + 3)) continue;   // 14.10.: in der Gabelung ist breiteBei die Astbreite (eigener Test: test_gabelung.js)
      const d = Math.abs(st.breiteBei(s + 2) - st.breiteBei(s)) / 2;
      if (d > maxSprung) { maxSprung = d; wo = s; }
      if (st.grenzeBei(s) < st.breiteBei(s) / 2 + st.randBreite + 0.3) bandeOk = false;
    }
    pruefe('Spur-Übergänge stetig (Rand ≤ 0,5 m je 2 m)', maxSprung <= 0.5, maxSprung.toFixed(3) + ' m bei s=' + wo);
    pruefe('Bande überall hinter Fahrbahn + Randstreifen', bandeOk);
    pruefe('Checkpoints tragen die lokale Breite', st.checkpoints.every(c => Math.abs(c.breite - st.breiteBei(c.s)) < 1e-9));
    // Welten ohne Spuren: konstante Breite
    namen.filter(w => !daten.welten[w].spuren).forEach((w) => {
      const s2 = new R.Strecke(daten, { welt: w });
      pruefe('Welt ' + w + ': ohne Spuren konstante Breite', st.spuren.every(e => s2.breiteBei((e.s0 + e.s1) / 2) === s2.breite));
    });
  }
}

// ---------- Runde 4 (W2-D): Schanzen / Turbo-Felder / Schilde nur in passenden Welten ----------
if (daten.welten) {
  Object.keys(daten.welten).forEach((w) => {
    const st = new R.Strecke(daten, { welt: w }), pk = new R.Pickups(st), sch = R.Schanzen.liste(st);
    const sollSchanzen = (w === 'stunt' || w === 'verrueckt' || w === 'alles') && daten.id !== 'fantasie';
    const sollPickups = w === 'verrueckt' || w === 'alles';
    pruefe('Welt ' + w + ': Schanzen ' + (sollSchanzen ? 'da' : 'keine') + ', Turbo/Schild ' + (sollPickups ? 'da' : 'keine'),
      (sch.length > 0) === sollSchanzen && (pk.felder.length > 0) === sollPickups && (pk.kugeln.length > 0) === sollPickups,
      sch.length + ' Schanzen, ' + pk.felder.length + ' Turbo, ' + pk.kugeln.length + ' Schilde');
    if (sch.length) {
      const S0 = sch[0];
      pruefe('Welt ' + w + ': Rampe hebt den Spline nicht (hoeheAn unverändert), hoeheAuf(s0 + 5) = 5·tan', Math.abs(R.Schanzen.hoeheAuf(st, S0.s + 5) - 5 * S0.tan) < 1e-9 &&
        (() => { const p = st.spline.punktBei(S0.s + 5); return Math.abs(st.hoeheAn(p.x, p.z) - strecke.hoeheAn(p.x, p.z)) < 1e-9; })());
    }
  });
  // Landung: freie Gerade hinter jeder Schanze ≥ Flugweite bei 1,15 × Ideallinien-Tempo (vyMax gedeckelt, g = 9,81)
  const alle = new R.Strecke(daten, { welt: Object.keys(daten.welten).find(w => daten.welten[w].schanzen) || undefined });
  R.Schanzen.liste(alle).forEach((S) => {
    const C = R.config.stunt.schanze, sp2 = alle.spline, k = sp2.punktBei(S.s1);
    const v = Math.min(78, alle.tempoBei(S.s) * 1.15), vy = Math.min(v * S.sin, C.vyMax);
    const weite = v * (vy + Math.sqrt(vy * vy + 2 * C.g * S.hoehe)) / C.g;
    let frei = 0;
    for (let a = 0; a < 300; a++) {
      const n = sp2.naechster(k.x + k.tx * a, k.z + k.tz * a);
      if (Math.abs(n.seitenabstand) > alle.breiteBei(n.s) / 2 - 1.2) break;
      frei = a;
    }
    pruefe('Schanze@' + S.s.toFixed(0) + ' (' + S.grad + '°): freie Gerade ≥ Flugweite bei ' + (v * 3.6).toFixed(0) + ' km/h', frei >= weite,
      'frei ' + frei + ' m, Flug ' + weite.toFixed(0) + ' m');
  });
}

// ---------- Startaufstellung ----------
{
  const pos = strecke.startpositionen(4);
  const alleStrasse = pos.every(p => strecke.untergrundAn(p.x, p.z) === 'strasse');
  const alleHinter = pos.every(p => { const n = sp.naechster(p.x, p.z); return sp.differenzS(n.s, 0) < -2.2; });
  pruefe('startpositionen(4) auf der Straße', alleStrasse);
  pruefe('startpositionen(4) hinter der Startlinie', alleHinter,
    pos.map(p => sp.differenzS(sp.naechster(p.x, p.z).s, 0).toFixed(1)).join(', '));
  const n0 = sp.naechster(pos[0].x, pos[0].z), n1 = sp.naechster(pos[1].x, pos[1].z);
  pruefe('Pole vorne rechts', n0.seitenabstand > 0 && n1.seitenabstand < 0 && n0.s > n1.s);
  const v = new R.Vehicle({}); v.setzen(pos[0].x, pos[0].z, pos[0].heading);
  const r = v.richtung(), t = sp.punktBei(0);
  pruefe('Start-Heading zeigt in Fahrtrichtung', r.x * t.tx + r.z * t.tz > 0.99);
}

// ---------- Checkpoints ----------
pruefe('Checkpoint 0 = Start/Ziel', strecke.checkpoints[0].s === 0, strecke.checkpoints.length + ' Checkpoints');

// ---------- Ideallinie ----------
{
  // Haarnadel = Stelle mit größter Krümmung
  let iMax = 0;
  sp.punkte.forEach((p, i) => { if (Math.abs(p.kruemmung) > Math.abs(sp.punkte[iMax].kruemmung)) iMax = i; });
  const vHaar = strecke.idealLinie[iMax];
  pruefe('Ideallinie Haarnadel < ' + (daten.id === 'formel1' ? 26 : 18) + ' m/s' + (daten.id === 'formel1' ? ' (Formel 1: Schikane R 80 m)' : ''), vHaar < (daten.id === 'formel1' ? 26 : 18), vHaar.toFixed(1) + ' m/s bei s=' + sp.punkte[iMax].s.toFixed(0));
  // Mitte der längsten Geraden suchen (Krümmung < 1/500)
  let besteLaenge = 0, besteMitte = 0, lauf = 0;
  const st = sp.punkte.findIndex(p => Math.abs(p.kruemmung) > 1 / 100);
  for (let k = 1; k <= N; k++) {
    const p = sp.punkte[(st + k) % N];
    if (Math.abs(p.kruemmung) < 1 / 500) {
      lauf += sp.ds;
      if (lauf > besteLaenge) { besteLaenge = lauf; besteMitte = p.s - lauf / 2; }
    } else lauf = 0;
  }
  const vGerade = strecke.tempoBei(besteMitte);
  pruefe('Ideallinie auf der längsten Geraden > 35 m/s', vGerade > 35,
    vGerade.toFixed(1) + ' m/s bei s=' + sp.wrapS(besteMitte).toFixed(0));
  // Bremsen vor Kurven: Tempo-Abnahme pro Punkt nie stärker als aBrems erlaubt
  let ok = true;
  for (let i = 0; i < N; i++) {
    const a = strecke.idealLinie[i], b = strecke.idealLinie[(i + 1) % N];
    if (a * a - b * b > 2 * 8 * sp.ds + 1e-6) ok = false;
  }
  pruefe('Ideallinie bremst rechtzeitig (≤ 8 m/s²)', ok);
}

// ---------- Rennleitung ----------
/** Synthetisches Fahrzeug: fährt die Mittellinie ab (vorwärts oder rückwärts). */
const fahrer = function (s0) {
  const p = sp.punktBei(s0);
  return { x: p.x, z: p.z, heading: R.headingAus(p.tx, p.tz), s: s0, streckeFortschritt: 0 };
};
const bewegen = (f, s) => { const p = sp.punktBei(s); f.s = s; f.x = p.x; f.z = p.z; f.heading = R.headingAus(p.tx, p.tz); };
const dt = 1 / 60;

{
  // Eine Runde mit 18 m/s ab dem Startplatz
  const pos = strecke.startpositionen(1)[0];
  const n0 = sp.naechster(pos.x, pos.z);
  const f = fahrer(n0.s - L);   // s negativ = hinter der Linie
  const rennen = new R.RaceManager(strecke, [{ vehicle: f, name: 'Test', istSpieler: true }], { runden: 2 });
  const t = rennen.teilnehmer[0];
  let starts = 0, runden = [];
  rennen.bei('start', () => starts++);
  rennen.bei('runde', (tt, z) => runden.push(z));
  let zeit = 0;
  while (rennen.zustand === 'countdown') { rennen.schritt(dt); zeit += dt; }
  pruefe('Countdown dauert ' + R.config.rennen.countdownSekunden + ' s', Math.abs(zeit - R.config.rennen.countdownSekunden) < 0.05 && starts === 1, zeit.toFixed(2));
  const sStart = f.s;
  let s = sStart, k = 0;
  // fahren bis eine Runde (L) ab der Startlinie geschafft ist + 1 m
  while (s < L + 1 && k < 100000) { s += 18 * dt; bewegen(f, s); rennen.schritt(dt); k++; }
  const erwartet = (L - sStart) / 18;
  pruefe('Nach einer Runde: runde = 1', t.runde === 1, 'runde=' + t.runde);
  pruefe('Rundenzeit ≈ Weg/18', runden.length === 1 && Math.abs(runden[0] - erwartet) < 0.1,
    (runden[0] || 0).toFixed(2) + ' s, erwartet ' + erwartet.toFixed(2) + ' s (L/18 = ' + (L / 18).toFixed(2) + ')');
  // zweite Runde fliegend: genau L/18
  while (s < 2 * L + 1 && k < 200000) { s += 18 * dt; bewegen(f, s); rennen.schritt(dt); k++; }
  pruefe('Fliegende Runde = L/18', Math.abs(runden[1] - L / 18) < 0.05, (runden[1] || 0).toFixed(2) + ' s');
  pruefe('Ziel nach 2 Runden, Rennen fertig', t.imZiel && rennen.zustand === 'fertig', rennen.zustand);
}
{
  // Teleport über 3 Checkpoints zählt nicht
  const f = fahrer(-10);
  const rennen = new R.RaceManager(strecke, [{ vehicle: f, istSpieler: true }], { runden: 3, countdown: 0 });
  const t = rennen.teilnehmer[0];
  const cps = strecke.checkpoints;
  let s = -10;
  while (s < cps[1].s + 5) { s += 0.3; bewegen(f, s); rennen.schritt(dt); }
  pruefe('Checkpoint 1 normal passiert', t.naechsterCheckpoint === 2, 'nächster=' + t.naechsterCheckpoint);
  // Teleport hinter Checkpoint 4
  s = cps[4].s + 10; bewegen(f, s); rennen.schritt(dt);
  pruefe('Teleport über 3 Checkpoints: nicht gezählt', t.naechsterCheckpoint === 2, 'nächster=' + t.naechsterCheckpoint);
  const fortVorher = t.fortschritt;
  pruefe('Teleport bringt keinen Fortschritt', fortVorher <= cps[2].s + 1e-6, fortVorher.toFixed(0) + ' m');
  // Weiterfahren bis über die Ziellinie: keine Runde, weil Checkpoints fehlen
  while (s < L + 20) { s += 0.3; bewegen(f, s); rennen.schritt(dt); }
  pruefe('Ohne alle Checkpoints keine Runde', t.runde === 0, 'runde=' + t.runde);
  // Reset-Pose = letzter passierter Checkpoint (1), auf Straßenmitte
  const pose = rennen.resetPose(t);
  pruefe('resetPose am letzten Checkpoint', Math.hypot(pose.x - cps[1].x, pose.z - cps[1].z) < 0.01 &&
    strecke.untergrundAn(pose.x, pose.z) === 'strasse');
}
{
  // Rückwärts über die Ziellinie zählt nicht (auch nicht eine ganze Runde rückwärts)
  const f = fahrer(-10);
  const rennen = new R.RaceManager(strecke, [{ vehicle: f, istSpieler: true }], { runden: 3, countdown: 0 });
  const t = rennen.teilnehmer[0];
  let s = -10;
  while (s < 30) { s += 0.3; bewegen(f, s); rennen.schritt(dt); }     // Start überfahren
  const nachStart = t.naechsterCheckpoint;
  while (s > -L - 30) { s -= 0.3; bewegen(f, s); rennen.schritt(dt); } // ganze Runde rückwärts
  pruefe('Rückwärts über Ziellinie / ganze Runde rückwärts: keine Runde', t.runde === 0 && t.naechsterCheckpoint === nachStart,
    'runde=' + t.runde + ' nächster=' + t.naechsterCheckpoint);
  // vor und zurück über die Linie wackeln
  const f2 = fahrer(-10);
  const r2 = new R.RaceManager(strecke, [{ vehicle: f2, istSpieler: true }], { runden: 3, countdown: 0 });
  let s2 = -10;
  for (let w = 0; w < 5; w++) {
    while (s2 < 5) { s2 += 0.3; bewegen(f2, s2); r2.schritt(dt); }
    while (s2 > -5) { s2 -= 0.3; bewegen(f2, s2); r2.schritt(dt); }
  }
  pruefe('Hin und her über die Linie: keine Runde', r2.teilnehmer[0].runde === 0);
}
{
  // Platzierung: wer weiter vorne ist, hat Platz 1
  const a = fahrer(-30), b = fahrer(-10);
  const rennen = new R.RaceManager(strecke, [{ vehicle: a, istSpieler: true }, { vehicle: b }], { runden: 1, countdown: 0 });
  let sa = -30, sb = -10;
  for (let i = 0; i < 600; i++) { sa += 0.5; sb += 0.4; bewegen(a, sa); bewegen(b, sb); rennen.schritt(dt); }
  pruefe('Platzierung nach Fortschritt', rennen.teilnehmer[0].platz === 1 && rennen.teilnehmer[1].platz === 2,
    rennen.teilnehmer.map(t => t.platz).join(','));
}

}

// ---------- Runde 6 (W2-E): Streckenvarianten (XL) ----------
for (const daten of R.trackCatalog) {
  if (!daten.varianten) continue;
  if (nurId && daten.id !== nurId) continue;
  for (const vid of Object.keys(daten.varianten)) {
    const f = daten.varianten[vid].faktor;
    praefix = '[' + daten.id + ' ' + vid + '] ';
    console.log('\n=== ' + daten.name + ' ' + daten.varianten[vid].name + ' (×' + f + ') ===');
    const basis = new R.Strecke(daten, { welt: 'alles' });
    const st = new R.Strecke(daten, { welt: 'alles', variante: vid });
    const sp = st.spline, L = st.laenge, L0 = basis.laenge;
    const roh = JSON.stringify(daten);
    pruefe('strecke.variante = ' + vid + ', Normal = ""', st.variante === vid && basis.variante === '' && new R.Strecke(daten, { variante: 'gibtsnicht' }).variante === '');
    pruefe('Länge ≈ ' + f + ' × Normal (±2 %)', Math.abs(L / L0 - f) < 0.02 * f, L0.toFixed(0) + ' → ' + L.toFixed(0) + ' m');
    pruefe('Katalog unverändert (Kopie)', JSON.stringify(daten) === roh && st.katalog !== daten && basis.katalog === daten);
    const zf = daten.varianten[vid].zeitFaktor || f;
    pruefe('zielRundenzeit × zeitFaktor ' + zf, st.katalog.zielRundenzeit === Math.round(daten.zielRundenzeit * zf) && basis.katalog.zielRundenzeit === daten.zielRundenzeit,
      daten.zielRundenzeit + ' → ' + st.katalog.zielRundenzeit + ' s');
    let minR = Infinity, minR0 = Infinity, maxSteig = 0;
    basis.spline.punkte.forEach((p) => { minR0 = Math.min(minR0, 1 / Math.max(1e-9, Math.abs(p.kruemmung))); });
    sp.punkte.forEach((p, i) => {
      minR = Math.min(minR, 1 / Math.max(1e-9, Math.abs(p.kruemmung)));
      const q = sp.punkte[(i + 1) % sp.anzahl];
      maxSteig = Math.max(maxSteig, Math.abs(q.y - p.y) / Math.max(1e-6, Math.hypot(q.x - p.x, q.z - p.z)));
    });
    pruefe('Mindestradius wächst mit (0,7…1,1 × ' + f + ' × Normal, ≥ 25 m)', minR >= 25 && minR / minR0 > 0.7 * f && minR / minR0 < 1.1 * f, minR0.toFixed(0) + ' → ' + minR.toFixed(0) + ' m');
    const steigXL = STEIGUNG_JE[daten.id] || STEIGUNG_MAX;
    pruefe('Steigung ≤ ' + Math.round(steigXL * 100) + ' %', maxSteig <= steigXL, (maxSteig * 100).toFixed(2) + ' %');
    let minAbst = Infinity;
    for (let i = 0; i < sp.anzahl; i += 2) for (let j = i + 1; j < sp.anzahl; j += 2) {
      if (Math.abs(sp.differenzS(sp.punkte[i].s, sp.punkte[j].s)) < 150) continue;
      const dd = Math.hypot(sp.punkte[i].x - sp.punkte[j].x, sp.punkte[i].z - sp.punkte[j].z);
      if (dd < 40 && anKreuzung(st, sp.punkte[i].s, sp.punkte[j].s)) continue;   // W4-J
      if (dd < 40 && (st.ueberfuehrungen || []).some(u => u.unten && ((st._inBereich(u, sp.punkte[i].s) && st._inBereich(u.unten, sp.punkte[j].s, 40)) || (st._inBereich(u, sp.punkte[j].s) && st._inBereich(u.unten, sp.punkte[i].s, 40))))) continue;   // v22: Überführung (Alpen XL)
      minAbst = Math.min(minAbst, dd);
    }
    pruefe('Abstand nicht benachbarter Teile ≥ 40 m' + (st.kreuzungen.length ? ' (außer an der Kreuzung)' : ''), minAbst >= 40, minAbst.toFixed(0) + ' m');
    // W4-J: Kreuzung auch in der Variante (s-Bereich skaliert mit, Stelle wird neu gesucht)
    if ((daten.kreuzungen || []).length) {
      const k = st.kreuzungen[0], k0 = basis.kreuzungen[0];
      pruefe('Kreuzung auch in der Variante: erkannt, 70–110°, |Δy| < 1 m, sA ≈ ' + f + ' × Normal (±2 %)', st.kreuzungen.length === daten.kreuzungen.length && k &&
        k.winkel >= 70 && k.winkel <= 110 && k.dy < 1 && Math.abs(k.sA / k0.sA - f) < 0.02 * f && Math.abs(k.sB / k0.sB - f) < 0.02 * f,
        k ? k.sA.toFixed(0) + '/' + k.sB.toFixed(0) + ', ' + k.winkel.toFixed(1) + '°, Δy ' + k.dy.toFixed(3) : '-');
    }
    // Höhenmodell 'strasse' (Alpen): Fahrbahnhöhe ist eigenes Profil, Gelände wird angeglichen (Ausnahme unter der Überführung)
    if (!st.sModell) pruefe('Mittellinie auf dem (skalierten) Gelände', sp.punkte.every(p => Math.abs(p.y - st.gelaendeHoehe(p.x, p.z)) < 0.05));
    // alle s-Felder: ×f und innerhalb [0, L]
    let anz = 0, ok = true, info = '';
    Object.keys(daten).forEach((k) => {
      if (k === 'punkte' || k === 'huegel' || k === 'varianten' || !Array.isArray(daten[k])) return;
      daten[k].forEach((e, i) => {
        const n = st.katalog[k][i];
        ['s', 's0', 's1'].forEach((sk) => {
          if (typeof e[sk] !== 'number') return;
          anz++;
          const gut = Math.abs(n[sk] - e[sk] * f) < 0.011 && n[sk] >= 0 && n[sk] <= L + 1e-6;
          if (!gut) { ok = false; info = k + '[' + i + '].' + sk + ' ' + e[sk] + ' → ' + n[sk]; }
        });
        Object.keys(e).forEach((fk) => { if (!['s', 's0', 's1'].includes(fk) && n[fk] !== e[fk]) { ok = false; info = k + '[' + i + '].' + fk + ' verändert'; } });
      });
    });
    pruefe('alle s-Felder (' + anz + ') × ' + f + ', innerhalb der Strecke, übrige Felder unverändert', ok && anz > 10, info || anz + ' Werte');
    // Lage: Tunnel/Brücken/Loopings sitzen an der um den Schwerpunkt skalierten Stelle
    let cx = 0, cz = 0; daten.punkte.forEach(p => { cx += p[0]; cz += p[2]; }); cx /= daten.punkte.length; cz /= daten.punkte.length;
    const orte = [];
    st.tunnel.forEach((t, i) => orte.push([basis.tunnel[i].m, t.m, 'Tunnel']));
    st.bruecken.forEach((t, i) => orte.push([basis.bruecken[i].m, t.m, 'Brücke']));
    st.loopings.forEach((l, i) => orte.push([basis.spline.punktBei(basis.loopings[i].s), sp.punktBei(l.s), 'Looping']));
    orte.forEach(([a, b, was]) => {
      const soll = { x: cx + (a.x - cx) * f, z: cz + (a.z - cz) * f };
      const d = Math.hypot(b.x - soll.x, b.z - soll.z);
      pruefe(was + ' sitzt an der skalierten Stelle (< ' + Math.max(8, 0.01 * L).toFixed(0) + ' m)', d < Math.max(8, 0.01 * L), d.toFixed(1) + ' m');
    });
    // Loopings: Radius bleibt, Gerade mit Anlauf
    const gerade = (s0, s1) => { for (let s = s0; s <= s1; s += 2) if (Math.abs(sp.punktBei(s).kruemmung) > 1 / 500) return false; return true; };
    st.loopings.forEach((l) => {
      const name = 'Looping@' + Math.round(l.s);
      pruefe(name + ': Radius 12 m (bleibt), vMin ≈ 87 km/h', l.radius === 12 && Math.abs(l.vMin * 3.6 - 87.3) < 0.5);
      pruefe(name + ': Gerade mit ≥ 120 m Anlauf', gerade(l.s - 120, l.s + l.versatz + 20));
    });
    // Schanzen/Boost/Schilde/Bälle/Wasser: auf der Straße
    const aufStrasse = (s, q) => { const p = sp.punktBei(s); return st.untergrundAn(p.x + p.nx * q, p.z + p.nz * q) === 'strasse'; };
    let strOk = true, strInfo = '';
    ['boostFelder', 'schilde', 'baelle', 'wasserstrahlen', 'schanzen'].forEach((k) => (st.katalog[k] || []).forEach((e) => {
      if (!aufStrasse(e.s, e.seitenabstand || 0)) { strOk = false; strInfo = k + '@' + e.s; }
    }));
    pruefe('Schanzen, Turbo, Schilde, Bälle, Wasser liegen auf der Straße', strOk, strInfo);
    (st.katalog.schanzen || []).forEach(e => pruefe('Schanze@' + e.s + ': Länge bleibt 10 m, Gerade', e.laenge === 10 && gerade(e.s - 10, e.s + 60)));
    pruefe('Checkpoints: Abstand bleibt ' + st.katalog.checkpointAbstand + ' m → ≈ ' + f + '× mehr',
      Math.abs(st.checkpoints.length / basis.checkpoints.length - f) < 0.2 * f, basis.checkpoints.length + ' → ' + st.checkpoints.length);
    pruefe('Hindernisse berechnet (gleiche Anzahl wie Normal)', st.hindernisse.length === basis.hindernisse.length, st.hindernisse.length);
    pruefe('Spuren: Anzahl gleich, Abschnitte × ' + f, st.spuren.length === basis.spuren.length &&
      st.spuren.every((e, i) => Math.abs(e.s0 - basis.spuren[i].s0 * f) < 0.5));
    pruefe('Bande in Brücke/Tunnel eng', st.bruecken.concat(st.tunnel).every(b => Math.abs(st.grenzeBei(b.mitte) - st.grenzeEng) < 1e-6));
  }
}
// ---------- W2-C1: Varianten-Kompatibilität Dino – varianteAnwenden verliert nichts (Listen UND Einzel-Objekte berg/flugsaurier) ----------
{
  praefix = '[dino ×1,3 Test-Variante] ';
  const dino = R.trackCatalog.find(t => t.id === 'dino'), f = 1.3;
  const daten = Object.assign({}, dino, { varianten: { test: { name: 'Test', faktor: f } } });
  const k = R.Strecke.varianteAnwenden(daten, 'test');
  pruefe('alle Felder vorhanden (nichts verloren)', Object.keys(daten).every(x => x in k), Object.keys(daten).filter(x => !(x in k)).join(', '));
  let anz = 0, ok = true, info = '';
  const vergleich = (e, n, wo) => {
    ['s', 's0', 's1'].forEach((sk) => {
      if (typeof e[sk] !== 'number') return;
      anz++;
      if (Math.abs(n[sk] - e[sk] * f) > 0.011) { ok = false; info = wo + '.' + sk + ' ' + e[sk] + ' → ' + n[sk]; }
    });
    Object.keys(e).forEach((fk) => { if (!['s', 's0', 's1'].includes(fk) && JSON.stringify(n[fk]) !== JSON.stringify(e[fk])) { ok = false; info = wo + '.' + fk + ' verändert'; } });
  };
  Object.keys(daten).forEach((x) => {
    if (['punkte', 'huegel', 'varianten', 'welten'].includes(x)) return;
    const e = daten[x];
    if (Array.isArray(e)) { if (!Array.isArray(k[x]) || k[x].length !== e.length) { ok = false; info = x + ' Länge'; return; } e.forEach((el, i) => { if (el && typeof el === 'object') vergleich(el, k[x][i], x + '[' + i + ']'); }); }
    else if (e && typeof e === 'object') vergleich(e, k[x], x);
  });
  pruefe('alle s-Felder (' + anz + ', auch berg/flugsaurier) × ' + f + ', übrige Werte unverändert', ok && anz > 30, info || anz + ' Werte');
  pruefe('berg und flugsaurier mitskaliert', Math.abs(k.berg.s0 - dino.berg.s0 * f) < 0.02 && Math.abs(k.flugsaurier.s1 - dino.flugsaurier.s1 * f) < 0.02 &&
    k.flugsaurier.intervall === dino.flugsaurier.intervall);
  pruefe('Welten/Vulkan/Optik unverändert übernommen', k.welten === dino.welten && k.vulkan === dino.vulkan && k.strohOptik === dino.strohOptik);
  const st = new R.Strecke(daten, { welt: 'alles', variante: 'test' }), basis = new R.Strecke(dino, { welt: 'alles' });
  pruefe('Strecke baut: 2 Tunnel (60/140 m × f), Lava 2, Hindernisse gleich viele', st.tunnel.length === 2 && Math.abs(st.tunnel[0].laenge - 60 * f) < 1 &&
    Math.abs(st.tunnel[1].laenge - 140 * f) < 1 && st.hindernisse.filter(h => h.typ === 'lava').length === 2 && st.hindernisse.length === basis.hindernisse.length,
    st.tunnel.map(t => t.laenge.toFixed(0)).join('/'));
  pruefe('Katalog-Original unverändert', dino.berg.s0 === 2318 && dino.tunnel[0].s0 === 2345 && dino.varianten.xl.faktor === 1.6);
}
praefix = '';
console.log(fehler === 0 ? '\nALLE TESTS OK' : '\n' + fehler + ' FEHLER');
process.exit(fehler ? 1 : 0);
