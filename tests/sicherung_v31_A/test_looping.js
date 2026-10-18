// Node-Test Looping (Fantasie): node tests/test_looping.js
// a) Mathe: 30 m/s kommt durch (360°, Ausfahrt bei s + versatz), 15 m/s fällt vor 180° und wird zurückgesetzt,
//    zu langsam = keine Übernahme, Fortschritt monoton, Pose (Dach zum Mittelpunkt).
// b) KI: alle 7 Stufen fahren 2 Runden inkl. beider Loopings (keine Stürze, kein "zu langsam").
// c) Runde 5 (Anlauf, track/anlauf.js): zu langsam → sanfter Stopp vor der Einfahrt (kein Durchfahren), rückwärts löst,
//    R → Anlaufposition (freie Stelle), Vollgas von dort → durch (jedes Auto × jede Tempo-Klasse + Worst Case),
//    Mindesttempo + Gas → immer durch (Arcade-Hilfe oben), Mindest-Anlauf je Auto.
const { ladeModule } = require('./lade');
const R = ladeModule(['src/config.js', 'src/physics/vehicle.js', 'src/cars/carCatalog.js', 'src/track/spline.js', 'src/track/trackCatalog.js',
  'src/track/trackBuilder.js', 'src/track/looping.js', 'src/track/anlauf.js', 'src/race/raceManager.js', 'src/physics/collisions.js', 'src/ai/driver.js']);

let fehler = 0;
function pruefe(name, ok, info) { console.log((ok ? 'OK   ' : 'FEHL ') + name + (info ? '  (' + info + ')' : '')); if (!ok) fehler++; }
const dt = R.config.physik.schritt, LP = R.Looping;
const strecke = new R.Strecke(R.trackCatalog.find(t => t.id === 'fantasie'));
const sp = strecke.spline, L = strecke.loopings[0];

pruefe('Fantasie hat 2 Loopings mit Radius 12 m', strecke.loopings.length === 2 && strecke.loopings.every(l => l.radius === 12));
pruefe('vMin = sqrt(5·g·r) ≈ 24,3 m/s (87 km/h)', Math.abs(L.vMin - Math.sqrt(5 * 9.81 * 12)) < 1e-9, (L.vMin * 3.6).toFixed(0) + ' km/h');

/** Auto 4 m vor der Einfahrt mit Tempo v (Mitte + q), Looping-Zustand neu. */
function aufstellen(v0, q, l) {
  const LL = l || L, p = sp.punktBei(LL.s - 4);
  const v = new R.Vehicle({});
  v.setzen(p.x + p.nx * (q || 0), p.z + p.nz * (q || 0), R.headingAus(p.tx, p.tz));
  v.vLaengs = v0;
  return { v, lp: LP.zustand(), index: -1 };
}
/** Fahren bis zum Ereignis/Ende; liefert Verlauf. */
function fahren(a, steuerung, maxSchritte, stoppBei) {
  const verlauf = [];
  for (let k = 0; k < maxSchritte; k++) {
    const r = LP.fahrzeugSchritt(a.lp, a.v, strecke, steuerung, dt, a.index);
    a.index = r.index;
    verlauf.push({ e: r.ereignis, w: a.lp.winkel, v: a.lp.aktiv ? a.lp.v : a.v.vLaengs, s: sp.naechster(a.v.x, a.v.z).s, aktiv: a.lp.aktiv, fallen: a.lp.fallen });
    if (r.ereignis && stoppBei && stoppBei.includes(r.ereignis)) break;
  }
  return verlauf;
}

// ---------- 30 m/s: kommt durch ----------
{
  const a = aufstellen(30, -2);
  const verlauf = fahren(a, { gas: 0, bremse: 0, lenkung: 0 }, 600, ['geschafft', 'gefallen']);
  const ev = verlauf.filter(x => x.e).map(x => x.e);
  pruefe('30 m/s ohne Gas: Einfahrt → 360° → Ausfahrt (kein Sturz)', ev[0] === 'start' && ev[ev.length - 1] === 'geschafft' && !ev.includes('gefallen'), ev.join(' → '));
  const imLoop = verlauf.filter(x => x.aktiv);
  const maxW = Math.max(...verlauf.map(x => x.w));
  pruefe('Winkel erreicht 2π', maxW >= Math.PI * 2 - 1e-9, (maxW * 180 / Math.PI).toFixed(1) + '°');
  // Tempo oben ≥ sqrt(g·r)
  const oben = imLoop.reduce((b, x) => (Math.abs(x.w - Math.PI) < Math.abs(b.w - Math.PI) ? x : b), imLoop[0]);
  pruefe('Oben (180°) Tempo ≥ sqrt(g·r)', oben.v >= L.vObenMin, oben.v.toFixed(1) + ' m/s ≥ ' + L.vObenMin.toFixed(1));
  // Ausfahrt bei s + versatz, rechts versetzt, Restgeschwindigkeit
  const n = sp.naechster(a.v.x, a.v.z);
  pruefe('Ausfahrt bei s + versatz (± 0,5 m)', Math.abs(sp.differenzS(n.s, L.s + L.versatz)) < 0.5, 's=' + n.s.toFixed(2) + ' soll ' + (L.s + L.versatz));
  pruefe('Ausfahrt seitlich um seitenVersatz/2 rechts', Math.abs(n.seitenabstand - L.seitenVersatz / 2) < 0.2, n.seitenabstand.toFixed(2) + ' m');
  pruefe('Restgeschwindigkeit nach vorne (20–30 m/s)', a.v.vLaengs > 20 && a.v.vLaengs < 30 && !a.v.imLooping, a.v.vLaengs.toFixed(1) + ' m/s');
  // Fortschritt monoton (Bodenspur s + w/2π·versatz)
  let mono = true, vorher = -Infinity;
  for (const x of verlauf) { const d = sp.differenzS(x.s, L.s - 10) + 10; if (d < vorher - 1e-6) mono = false; vorher = d; }
  pruefe('Fortschritt (Bodenspur) monoton', mono);
  pruefe('fortschrittS = s + w/2π·versatz', (() => { const lp = { aktiv: true, looping: L, winkel: Math.PI }; return Math.abs(LP.fortschrittS(lp) - (L.s + L.versatz / 2)) < 1e-9; })());
  // nach der Ausfahrt normal weiterfahren: keine zweite Übernahme
  const weiter = fahren(a, { gas: 1, bremse: 0, lenkung: 0 }, 120);
  pruefe('Danach normal weiter (keine zweite Übernahme)', weiter.every(x => !x.e) && a.v.vLaengs > 20);
}

// ---------- Mit Rennleitung: Fortschritt monoton, Checkpoints laufen weiter ----------
{
  const a = aufstellen(30, 0);
  const rennen = new R.RaceManager(strecke, [{ vehicle: a.v, name: 'T', istSpieler: true }], { runden: 3, countdown: 0 });
  const t = rennen.teilnehmer[0];
  t.gestartet = true; t.letzterCheckpoint = 1; t.naechsterCheckpoint = 2;
  let mono = true, f0 = -Infinity, imLoop = 0;
  for (let k = 0; k < 400; k++) {
    const r = LP.fahrzeugSchritt(a.lp, a.v, strecke, { gas: 1 }, dt, a.index); a.index = r.index;
    rennen.schritt(dt);
    if (a.lp.aktiv) imLoop++;
    if (t.fortschritt < f0 - 1e-6) mono = false;
    f0 = t.fortschritt;
  }
  pruefe('RaceManager-Fortschritt monoton durch den Looping', mono && imLoop > 30, imLoop + ' Schritte im Looping, Fortschritt ' + f0.toFixed(0) + ' m');
}

// ---------- 15 m/s erzwungen: fällt vor 180°, zurück zur Einfahrt ----------
{
  const a = aufstellen(30, 1.5);
  fahren(a, { gas: 0 }, 60, ['start']);
  pruefe('Einfahrt übernommen', a.lp.aktiv);
  a.lp.v = 15;                  // zu langsam erzwingen
  const verlauf = fahren(a, { gas: 0 }, 600, ['gefallen']);
  const fall = verlauf[verlauf.length - 1];
  const wFall = verlauf[verlauf.length - 2].w;
  pruefe('15 m/s: fällt (Ereignis gefallen)', fall.e === 'gefallen', fall.e);
  pruefe('15 m/s: fällt bei Winkel < 180°', wFall < Math.PI, (wFall * 180 / Math.PI).toFixed(0) + '°');
  const n = sp.naechster(a.v.x, a.v.z);
  pruefe('Zurückgesetzt vor die Einfahrt (s − zurueck), Tempo 0', Math.abs(sp.differenzS(n.s, L.s - R.config.fantasie.looping.zurueck)) < 0.3 &&
    a.v.vLaengs === 0 && Math.abs(n.seitenabstand - 1.5) < 0.2, 's=' + n.s.toFixed(1) + ' q=' + n.seitenabstand.toFixed(2));
  pruefe('Während des Fallens keine Kollisionen (imLooping)', a.v.imLooping && a.lp.fallen);
  const nach = fahren(a, { gas: 1 }, 120, ['gelandet']);
  pruefe('Nach fallDauer gelandet, wieder fahrbar', nach[nach.length - 1].e === 'gelandet' && !a.v.imLooping && !a.lp.fallen,
    (nach.length * dt).toFixed(2) + ' s');
  pruefe('Sturz gezählt', a.lp.gefallen === 1);
}

// ---------- Zu langsam: keine Übernahme ----------
{
  const a = aufstellen(18, 0);
  const verlauf = fahren(a, { gas: 0 }, 120);
  const ev = verlauf.filter(x => x.e).map(x => x.e);
  // Runde 5: kein Durchfahren mehr – ohne Anlauf-Zustand greift der Notstopp direkt vor der Einfahrt
  const nE = sp.naechster(a.v.x, a.v.z);
  pruefe('18 m/s (ohne Anlauf-Bremse): keine Übernahme, "zuLangsam", Notstopp vor der Einfahrt (kein Durchfahren)',
    ev.length >= 1 && ev[0] === 'zuLangsam' && !a.lp.aktiv && sp.differenzS(nE.s, L.s) < 0 && a.v.vLaengs === 0, ev.join(',') + ', s−Einfahrt ' + sp.differenzS(nE.s, L.s).toFixed(2) + ' m');
  const b = aufstellen(30, 9);     // neben der Fahrbahn
  const vb = fahren(b, { gas: 0 }, 60);
  pruefe('Neben der Fahrbahn: keine Übernahme', vb.every(x => !x.e));
  const c = aufstellen(L.vMin + 1, 0);
  const vc = fahren(c, { gas: 1 }, 600, ['geschafft', 'gefallen']);
  pruefe('Knapp über vMin mit Gas: schafft den Looping', vc[vc.length - 1].e === 'geschafft', vc.filter(x => x.e).map(x => x.e).join(' → '));
}

// ---------- Bahn: Dach zeigt zum Kreismittelpunkt, Helix ----------
{
  let ok = true, info = '';
  for (let w = 0; w <= Math.PI * 2 + 1e-9; w += Math.PI / 8) {
    const b = LP.bahn(strecke, L, w, LP.bandQ(L, w));
    const dot = b.fx * b.ux + b.fy * b.uy + b.fz * b.uz;
    if (Math.abs(dot) > 1e-6) { ok = false; info = 'nicht senkrecht bei ' + w.toFixed(2); }
    if (Math.abs(w - Math.PI) < 1e-6 && !(b.uy < -0.99 && b.h > 2 * L.radius - 0.01)) { ok = false; info = 'oben: uy=' + b.uy.toFixed(2) + ' h=' + b.h.toFixed(2); }
    if (Math.abs(w) < 1e-6 && !(b.uy > 0.99)) { ok = false; info = 'unten: uy=' + b.uy.toFixed(2); }
  }
  pruefe('Bahn: oben-Vektor ⟂ vorwärts, oben (180°) kopfüber in 2r Höhe, unten aufrecht', ok, info);
  const e = LP.bahn(strecke, L, 0, LP.bandQ(L, 0)), x = LP.bahn(strecke, L, Math.PI * 2, LP.bandQ(L, Math.PI * 2));
  pruefe('Helix: Ein- und Ausfahrt um Breite × 0,6 seitlich versetzt', Math.abs(Math.hypot(x.x - e.x, x.z - e.z) - Math.hypot(L.versatz, L.seitenVersatz)) < 0.3,
    Math.hypot(x.x - e.x, x.z - e.z).toFixed(2) + ' m');
}

// ---------- Kollisionen: Auto im Looping wird ignoriert ----------
{
  const a = new R.Vehicle({}), b = new R.Vehicle({});
  a.setzen(0, 0, 0); b.setzen(0.5, 0, 0); a.imLooping = true;
  pruefe('autoAuto ignoriert Autos im Looping', R.Kollisionen.autoAuto([a, b]).length === 0 && a.x === 0);
}

// ---------- Runde 5: Anlauf-Bremse, Anlaufposition, Vollgas von dort ----------
const AN = R.Anlauf, CA = R.config.anlauf;
const stellen = AN.stellen(strecke);
pruefe('Anlauf-Stellen: 2 Loopings', stellen.length === 2 && stellen.every(s => s.art === 'looping'),
  stellen.map(s => 's=' + s.s.toFixed(0) + ' abstand ' + s.abstand + ' m (' + s.quelle + ', langsamstes Auto ' + s.auto + '/' + s.klasse + ' braucht ' + s.berechnet.toFixed(0) + ' m)').join(' | '));
/** Einfacher Spurhalter (Tangente + Mitte), Vollgas wahlweise. */
function spur(v, gas) {
  const n = sp.naechster(v.x, v.z), p = sp.punktBei(n.s + 4);
  const fehler = R.Vehicle.winkelDiff(v.heading, R.headingAus(p.tx, p.tz));
  return { gas, bremse: 0, lenkung: Math.max(-1, Math.min(1, fehler * 2.5 - n.seitenabstand * 0.08)) };
}
/** Ein Lauf mit Anlauf-Zustand: liefert Ereignisse, Minimal-Abstand zur Einfahrt, Verlauf. */
function anlaufLauf(v, az, lp, steuerFn, n, stoppBei) {
  let index = -1, ev = [], minD = Infinity, maxVerz = 0, vAlt = v.vLaengs, eintritt = null;
  for (let k = 0; k < n; k++) {
    const s = steuerFn(v, k);
    const r = LP.fahrzeugSchritt(lp, v, strecke, s, dt, index, az); index = r.index;
    if (r.ereignis) ev.push(r.ereignis);
    if (r.ereignis === 'start') eintritt = lp.v;
    if (!lp.aktiv && !lp.fallen) {
      const d = stellen.reduce((m, st) => { const x = sp.differenzS(st.s, sp.naechster(v.x, v.z).s); return x > -3 && x < m ? x : m; }, Infinity);
      minD = Math.min(minD, d);
      if (az.bremst && vAlt > 1.5) maxVerz = Math.max(maxVerz, (vAlt - v.vLaengs) / dt);   // ohne den letzten Halt (< 1,5 m/s)
    }
    vAlt = v.vLaengs;
    if (stoppBei && stoppBei(r, v, k)) break;
  }
  return { ev, minD, maxVerz, eintritt };
}
for (const [nr, L2] of strecke.loopings.entries()) {
  const st = stellen[nr];
  // a) 60 m vor der Einfahrt mit 18 m/s, ohne Gas → Bremse greift, steht 10 m davor, kein Looping, kein Durchfahren
  {
    const p = sp.punktBei(L2.s - 60), v = new R.Vehicle({});
    v.setzen(p.x + p.nx * 1.5, p.z + p.nz * 1.5, R.headingAus(p.tx, p.tz)); v.vLaengs = 18;
    const az = AN.zustand(), lp = LP.zustand();
    const e = anlaufLauf(v, az, lp, (vv) => ({ gas: 0, bremse: 0, lenkung: 0 }), 60 * 8);
    const d = sp.differenzS(L2.s, sp.naechster(v.x, v.z).s);
    pruefe(`Looping ${nr + 1}: 18 m/s ohne Gas → sanfter Stopp ${CA.stopp} m vor der Einfahrt, kein Durchfahren`,
      e.ev[0] === 'zuLangsam' && e.ev.includes('gestoppt') && !e.ev.includes('start') && Math.abs(d - CA.stopp) < 0.6 && v.vLaengs === 0 &&
      lp.geschafft === 0 && e.maxVerz <= CA.bremsVerz + 0.6 && AN.aktiv(az),
      `steht ${d.toFixed(2)} m davor, max. Verzögerung ${e.maxVerz.toFixed(1)} m/s², Ereignisse ${e.ev.join(',')}`);
    // b) Gas aus dem Stand an der Linie → bleibt stehen (würde Mindesttempo nie erreichen)
    const e2 = anlaufLauf(v, az, lp, () => ({ gas: 1, bremse: 0, lenkung: 0 }), 60 * 3);
    const d2 = sp.differenzS(L2.s, sp.naechster(v.x, v.z).s);
    pruefe(`Looping ${nr + 1}: Gas an der Linie → kommt nicht durch (bleibt vor der Einfahrt)`, !e2.ev.includes('start') && d2 > CA.stopp - 0.6 && lp.geschafft === 0,
      'Abstand ' + d2.toFixed(2) + ' m');
    // c) Rückwärts (Bremse) → fährt zurück, Bremse gelöst; R-Zustand bleibt (aktiv)
    anlaufLauf(v, az, lp, () => ({ gas: 0, bremse: 1, lenkung: 0 }), 60 * 3);
    const d3 = sp.differenzS(L2.s, sp.naechster(v.x, v.z).s);
    pruefe(`Looping ${nr + 1}: rückwärts möglich (Bremse-Taste)`, d3 > CA.stopp + 5 && !az.bremst && AN.aktiv(az), 'jetzt ' + d3.toFixed(1) + ' m davor');
    // d) R → Anlaufposition (anderes Auto genau dort → 10 m weiter zurück)
    const frei = AN.position(strecke, st, [], null);
    const anderes = new R.Vehicle({}); anderes.setzen(frei.x + 2, frei.z, 0);
    const pose = AN.zurAnlaufposition(az, v, strecke, [anderes, v]);
    const nP = sp.naechster(pose.x, pose.z);
    pruefe(`Looping ${nr + 1}: R → Anlaufposition ${st.abstand} m (+10 m, weil dort ein Auto steht), Tempo 0, Blick nach vorne`,
      Math.abs(sp.differenzS(L2.s, nP.s) - st.abstand - 10) < 0.6 && v.vLaengs === 0 && Math.abs(nP.seitenabstand) < 0.2 &&
      Math.abs(R.Vehicle.winkelDiff(v.heading, R.headingAus(sp.punktBei(nP.s).tx, sp.punktBei(nP.s).tz))) < 0.01 && !AN.aktiv(az),
      sp.differenzS(L2.s, nP.s).toFixed(1) + ' m vor der Einfahrt');
  }
  // e) Von der Anlaufposition Vollgas: jedes Auto × jede Tempo-Klasse + Worst Case → Einfahrt ≥ vMin × 1,1, geschafft
  {
    const pose = AN.position(strecke, st, [], null), klassen = Object.keys(R.config.tempoKlassen || { schnell: 1 });
    let alle = 0, ok = 0, minV = Infinity, wer = '', schlecht = [];
    R.carCatalog.forEach((auto) => klassen.concat(['worst']).forEach((k) => {
      const v = new R.Vehicle(auto.fahrwerte, { tempoKlasse: k === 'worst' ? null : k });
      if (k === 'worst') { v.daten.vMax = auto.fahrwerte.vMax * 0.7; v.daten.beschleunigung = auto.fahrwerte.beschleunigung * 0.85; }
      v.setzen(pose.x, pose.z, pose.heading);
      const az = AN.zustand(), lp = LP.zustand();
      const e = anlaufLauf(v, az, lp, (vv) => spur(vv, 1), 60 * 25, (r) => r.ereignis === 'geschafft' || r.ereignis === 'gefallen');
      alle++;
      const gut = lp.geschafft === 1 && lp.gefallen === 0 && az.eingriffe === 0 && e.eintritt >= L2.vMin * (1 + CA.reserve) - 1e-6;
      if (gut) ok++; else schlecht.push(auto.id + '/' + k + ' ' + (e.eintritt ? (e.eintritt * 3.6).toFixed(0) + ' km/h' : e.ev.join(',')));
      if (e.eintritt !== null && e.eintritt < minV) { minV = e.eintritt; wer = auto.id + '/' + k; }
    }));
    pruefe(`Looping ${nr + 1}: von der Anlaufposition mit Vollgas kommen alle durch (Einfahrt ≥ vMin + 10 %, ${alle} Läufe)`, ok === alle,
      `langsamste Einfahrt ${(minV * 3.6).toFixed(0)} km/h (${wer}), vMin+10 % = ${(L2.vMin * 1.1 * 3.6).toFixed(0)} km/h` + (schlecht.length ? ' | FEHL: ' + schlecht.join('; ') : ''));
  }
}
// f) Mindesttempo + Gas → immer durch (Arcade-Hilfe oben), jedes Auto × Klasse
{
  let alle = 0, ok = 0, geschoben = 0, klassen = Object.keys(R.config.tempoKlassen || { schnell: 1 });
  R.carCatalog.forEach((auto) => klassen.concat(['worst']).forEach((k) => {
    const v = new R.Vehicle(auto.fahrwerte, { tempoKlasse: k === 'worst' ? null : k });
    if (k === 'worst') { v.daten.vMax = auto.fahrwerte.vMax * 0.7; v.daten.beschleunigung = auto.fahrwerte.beschleunigung * 0.85; }
    const p = sp.punktBei(L.s - 1); v.setzen(p.x, p.z, R.headingAus(p.tx, p.tz)); v.vLaengs = L.vMin + 0.01;
    const lp = LP.zustand(); let index = -1, e = null;
    for (let i = 0; i < 600 && e !== 'geschafft' && e !== 'gefallen'; i++) { const r = LP.fahrzeugSchritt(lp, v, strecke, { gas: 1 }, dt, index); index = r.index; e = r.ereignis || e; }
    alle++; if (lp.geschafft === 1 && lp.gefallen === 0) ok++;
    geschoben += lp.geschoben ? 1 : 0;
  }));
  pruefe(`Mindesttempo + Gas: alle Autos × Klassen kommen durch (${alle} Läufe)`, ok === alle, `${ok}/${alle}, Arcade-Hilfe nötig bei ${geschoben}`);
  // ohne Gas knapp unter dem Nötigen → fällt weiterhin (Hilfe nur mit Gas)
  const v = new R.Vehicle({}), p = sp.punktBei(L.s - 1); v.setzen(p.x, p.z, R.headingAus(p.tx, p.tz)); v.vLaengs = L.vMin + 0.01;
  const lp = LP.zustand(); let index = -1, e = null;
  v.vLaengs = L.vMin + 0.3;
  for (let i = 0; i < 600 && e !== 'geschafft' && e !== 'gefallen'; i++) {
    const r = LP.fahrzeugSchritt(lp, v, strecke, { gas: 0, bremse: lp.aktiv ? 1 : 0 }, dt, index); index = r.index; e = r.ereignis || e;
  }
  pruefe('Mindesttempo, im Looping gebremst → fällt (Hilfe nur mit Gas)', e === 'gefallen', e);
}
// g) Mindest-Anlauf je Auto (aus dem Stand bis vMin + 10 %)
{
  const ziel = L.vMin * (1 + CA.reserve), zeilen = [], klassen = Object.keys(R.config.tempoKlassen || {});
  let max = 0;
  R.carCatalog.forEach((auto) => {
    const w = klassen.map((k) => {
      const v = new R.Vehicle(auto.fahrwerte, { tempoKlasse: k }); v.setzen(0, 0, 0); v.untergrund = 'strasse';
      let weg = Infinity;
      for (let i = 0; i < 3600; i++) { v.schritt(dt, { gas: 1 }); if (v.vLaengs >= ziel) { weg = -v.z; break; } }
      max = Math.max(max, weg);
      return k + ' ' + weg.toFixed(0) + ' m';
    });
    zeilen.push(auto.id + ': ' + w.join(', '));
  });
  console.log('INFO Mindest-Anlauf bis ' + (ziel * 3.6).toFixed(0) + ' km/h: ' + zeilen.join(' | '));
  pruefe('Anlauf-Abstand ≥ Mindest-Anlauf des langsamsten Autos', stellen.every(s => s.abstand >= max), 'max ' + max.toFixed(0) + ' m, Abstand ' + stellen.map(s => s.abstand).join('/'));
}

// ---------- KI: alle 7 Stufen, 2 Runden, beide Loopings ----------
const STUFEN = Object.keys(R.config.schwierigkeiten).sort((x, y) => R.config.schwierigkeiten[x].rang - R.config.schwierigkeiten[y].rang);
const zeiten = {};
for (const stufe of STUFEN) {
  const start = strecke.startpositionen(1)[0];
  const v = new R.Vehicle({});
  v.setzen(start.x, start.z, start.heading);
  const rennen = new R.RaceManager(strecke, [{ vehicle: v, name: 'KI', istSpieler: false }], { runden: 2, countdown: 0 });
  const d = new R.Driver(v, strecke, { schwierigkeit: stufe, seed: 7, name: 'KI' });
  const t = rennen.teilnehmer[0], lp = LP.zustand(), az = R.Anlauf.zustand();
  let index = -1, vEin = Infinity;
  for (let k = 0; k < 60 * 300 && !t.imZiel; k++) {
    const s = d.steuerung(dt, { andere: [], spielerFortschrittMax: null, eigenerFortschritt: t.fortschritt, laeuft: true });
    const r = LP.fahrzeugSchritt(lp, v, strecke, s, dt, index, az);
    index = r.index;
    if (r.ereignis === 'start') vEin = Math.min(vEin, v.vLaengs);
    if (r.ereignis === 'gefallen') rennen.verfolgungSetzen(0, v.x, v.z);
    rennen.schritt(dt);
  }
  zeiten[stufe] = t.rundenzeiten;
  pruefe(`KI ${stufe}: 2 Runden, 4 Loopings geschafft, 0 Stürze, 0× zu langsam, Anlauf-Bremse nie nötig`, t.imZiel && lp.geschafft === 4 && lp.gefallen === 0 && lp.zuLangsam === 0 && az.eingriffe === 0 && !d.brauchtReset,
    `Runden ${t.rundenzeiten.map(z => z.toFixed(1)).join(' / ')} s | geschafft ${lp.geschafft}, gefallen ${lp.gefallen}, zu langsam ${lp.zuLangsam} | min. Einfahrt ${(vEin * 3.6).toFixed(0)} km/h`);
}
console.log('\nFantasie (' + strecke.laenge.toFixed(0) + ' m), Runde 2: ' + STUFEN.map(s => s + ' ' + (zeiten[s][1] || 0).toFixed(1) + ' s').join(', '));
console.log(fehler === 0 ? '\nALLE TESTS OK' : '\n' + fehler + ' FEHLER');
process.exit(fehler ? 1 : 0);
