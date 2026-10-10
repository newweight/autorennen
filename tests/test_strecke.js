// Node-Test Strecke + Rennleitung für ALLE Katalog-Strecken: node tests/test_strecke.js [streckenId]
const { ladeModule } = require('./lade');
const R = ladeModule(['src/config.js', 'src/physics/vehicle.js', 'src/track/spline.js',
  'src/track/trackCatalog.js', 'src/track/trackBuilder.js', 'src/race/raceManager.js']);
let fehler = 0;
let praefix = '';
function pruefe(name, ok, info) { console.log((ok ? 'OK   ' : 'FEHL ') + praefix + name + (info ? '  (' + info + ')' : '')); if (!ok) fehler++; }


// Erwartungen je Strecke (Charakter): Kurvenzahl, lange Geraden, Höhe
const ERWARTUNG = {
  wiese:  { kurven: [10, 14], geraden: { min: 150, anzahl: [2, 3] }, hoehe: 6 },
  wald:   { kurven: [16, 30], geraden: { min: 200, anzahl: [0, 0] }, hoehe: 10, hoeheMin: 8 },
  wueste: { kurven: [8, 16], geraden: { min: 250, anzahl: [2, 4] }, hoehe: 10 },
};
const nurId = process.argv[2];
for (const daten of R.trackCatalog) {
if (nurId && daten.id !== nurId) continue;
praefix = '[' + daten.id + '] ';
console.log('\n=== ' + daten.name + ' ===');
const erw = ERWARTUNG[daten.id] || { kurven: [6, 40], geraden: { min: 150, anzahl: [0, 9] }, hoehe: 10 };
const strecke = new R.Strecke(daten);
const sp = strecke.spline, N = sp.anzahl, L = strecke.laenge;

// ---------- Geometrie ----------
pruefe('Streckenlänge 1900–2400 m', L >= 1900 && L <= 2400, L.toFixed(1) + ' m');

let minR = Infinity, minRs = 0;
sp.punkte.forEach(p => { const r = 1 / Math.max(1e-9, Math.abs(p.kruemmung)); if (r < minR) { minR = r; minRs = p.s; } });
pruefe('Mindestradius ≥ 25 m', minR >= 25, minR.toFixed(1) + ' m bei s=' + minRs.toFixed(0));

// Abstand nicht benachbarter Streckenteile (> 150 m Bogenlänge auseinander)
let minAbst = Infinity;
for (let i = 0; i < N; i++) for (let j = i + 1; j < N; j++) {
  if (Math.abs(sp.differenzS(sp.punkte[i].s, sp.punkte[j].s)) < 150) continue;
  minAbst = Math.min(minAbst, Math.hypot(sp.punkte[i].x - sp.punkte[j].x, sp.punkte[i].z - sp.punkte[j].z));
}
pruefe('Abstand nicht benachbarter Teile ≥ 40 m (keine Überschneidung)', minAbst >= 40, minAbst.toFixed(1) + ' m');

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
  pruefe('Steigung < 6 %', maxSteig < 0.06, (maxSteig * 100).toFixed(2) + ' %');
  // Spline-Höhe passt zum Gelände (Straße liegt auf dem Boden)
  let maxAbw = 0;
  sp.punkte.forEach(p => { maxAbw = Math.max(maxAbw, Math.abs(p.y - strecke.gelaendeHoehe(p.x, p.z))); });
  pruefe('Mittellinie liegt auf dem Gelände (< 5 cm)', maxAbw < 0.05, (maxAbw * 100).toFixed(1) + ' cm');
}
// Start auf einer Geraden
pruefe('Start auf einer Geraden', [-40, -20, 0, 20, 40].every(d => Math.abs(sp.punktBei(d).kruemmung) < 1 / 500));

// ---------- naechster(): global vs. lokal, Seitenabstand ----------
{
  let ok = true, info = '';
  for (let k = 0; k < 200; k++) {
    const p = sp.punkte[(k * 37) % N];
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
  if (daten.bruecke) {
    const pb = sp.punktBei((daten.bruecke.von + daten.bruecke.bis) / 2);
    const aufSteg = strecke.untergrundAn(pb.x + pb.nx * (b2 + 5), pb.z + pb.nz * (b2 + 5));
    pruefe('Brücke: neben der Straße Bretter (rand)', aufSteg === 'rand', aufSteg);
  }
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
  pruefe('Ideallinie Haarnadel < 15 m/s', vHaar < 15, vHaar.toFixed(1) + ' m/s bei s=' + sp.punkte[iMax].s.toFixed(0));
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
praefix = '';
console.log(fehler === 0 ? '\nALLE TESTS OK' : '\n' + fehler + ' FEHLER');
process.exit(fehler ? 1 : 0);
