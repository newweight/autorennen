// Node-Test Strecke + Rennleitung für ALLE Katalog-Strecken: node tests/test_strecke.js [streckenId]
const { ladeModule } = require('./lade');
const R = ladeModule(['src/config.js', 'src/physics/vehicle.js', 'src/track/spline.js',
  'src/track/trackCatalog.js', 'src/track/trackBuilder.js', 'src/race/raceManager.js']);
let fehler = 0;
let praefix = '';
function pruefe(name, ok, info) { console.log((ok ? 'OK   ' : 'FEHL ') + praefix + name + (info ? '  (' + info + ')' : '')); if (!ok) fehler++; }


// Erwartungen je Strecke (Charakter): Kurvenzahl, lange Geraden, Höhe
// Runde 3: Wald/Wüste kräftiger (bis ±14 m), Wiese sanft (±6 m), Steigung überall ≤ 8 %
const ERWARTUNG = {
  wiese:  { kurven: [10, 14], geraden: { min: 150, anzahl: [2, 3] }, hoehe: 6, hoeheMin: 5 },
  wald:   { kurven: [16, 30], geraden: { min: 200, anzahl: [0, 0] }, hoehe: 14, hoeheMin: 18 },
  wueste: { kurven: [8, 16], geraden: { min: 250, anzahl: [2, 4] }, hoehe: 14, hoeheMin: 15 },
  // Fantasie (Runde 3): kürzer, 2 Loopings auf langen Geraden, nur 1–2 Hindernisse
  fantasie: { kurven: [4, 12], geraden: { min: 150, anzahl: [2, 3] }, hoehe: 10, laenge: [1300, 1500], hindernisse: [1, 2] },
};
const STEIGUNG_MAX = 0.08;
const nurId = process.argv[2];
for (const daten of R.trackCatalog) {
if (nurId && daten.id !== nurId) continue;
praefix = '[' + daten.id + '] ';
console.log('\n=== ' + daten.name + ' ===');
const erw = ERWARTUNG[daten.id] || { kurven: [6, 40], geraden: { min: 150, anzahl: [0, 9] }, hoehe: 10 };
const strecke = new R.Strecke(daten);
const sp = strecke.spline, N = sp.anzahl, L = strecke.laenge;

// ---------- Geometrie ----------
const lg = erw.laenge || [1900, 2400];
pruefe('Streckenlänge ' + lg[0] + '–' + lg[1] + ' m', L >= lg[0] && L <= lg[1], L.toFixed(1) + ' m');

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
  pruefe('Steigung ≤ ' + STEIGUNG_MAX * 100 + ' %', maxSteig <= STEIGUNG_MAX, (maxSteig * 100).toFixed(2) + ' %');
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
    wueste: { sand: 2, oel: 1, baustelle: 1 }, fantasie: { oel: 1, ast: 1 } }[daten.id];
  const hs = strecke.hindernisse, b2 = strecke.breite / 2, hz = erw.hindernisse || [3, 5];
  pruefe(hz[0] + '–' + hz[1] + ' Hindernisse', hs.length >= hz[0] && hs.length <= hz[1], hs.map(h => h.typ + '@' + Math.round(h.s)).join(', '));
  if (ANZAHL) {
    const ist = {}; hs.forEach(h => { ist[h.typ] = (ist[h.typ] || 0) + 1; });
    pruefe('Hindernis-Typen wie geplant', Object.keys(ANZAHL).every(k => ist[k] === ANZAHL[k]) && Object.keys(ist).every(k => ANZAHL[k]), JSON.stringify(ist));
  }
  // Haarnadeln: zusammenhängende Kurve mit ≥ 150° Richtungsänderung → Scheitel = stärkste Krümmung
  const haarnadeln = [];
  {
    const N2 = sp.anzahl, start = sp.punkte.findIndex(p => Math.abs(p.kruemmung) < 1 / 400);
    let winkel = 0, vz = 0, best = null;
    for (let k = 0; k <= N2; k++) {
      const p = sp.punkte[(start + k) % N2], kurve = Math.abs(p.kruemmung) > 1 / 150;
      if (kurve && Math.sign(p.kruemmung) === vz) { winkel += Math.abs(p.kruemmung) * sp.ds; if (Math.abs(p.kruemmung) > Math.abs(best.kruemmung)) best = p; }
      else {
        if (vz && winkel * 180 / Math.PI >= 150) haarnadeln.push(best.s);
        winkel = kurve ? Math.abs(p.kruemmung) * sp.ds : 0; vz = kurve ? Math.sign(p.kruemmung) : 0; best = kurve ? p : null;
      }
    }
  }
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
    const inEng = strecke._engstellen.some(b => [s0, h.s, s1].some(s => strecke._inBereich(b, s, 20)));
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
