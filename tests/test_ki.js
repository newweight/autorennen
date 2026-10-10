// Node-Test KI-Fahrer (Abschnitt 5): node tests/test_ki.js
// Reine Mathematik, Schrittweite 1/60, ohne Kollisionsphysik.
const { ladeModule } = require('./lade');
const R = ladeModule(['src/config.js', 'src/physics/vehicle.js', 'src/track/spline.js',
  'src/track/trackCatalog.js', 'src/track/trackBuilder.js', 'src/race/raceManager.js', 'src/physics/collisions.js', 'src/ai/driver.js']);

let fehler = 0;
function pruefe(name, ok, info) { console.log((ok ? 'OK   ' : 'FEHL ') + name + (info ? '  (' + info + ')' : '')); if (!ok) fehler++; }
const t0 = Date.now();

const dt = R.config.physik.schritt;
const strecke = new R.Strecke(R.trackCatalog.find(t => t.id === 'wiese'));
const L = strecke.laenge;

/**
 * Rennen nur mit KI-Fahrern (optional ein synthetischer Spieler).
 * @param {{schwierigkeit:string, seed:any}[]} fahrer
 * @param {object} opt { runden, maxZeit, spieler (Tempo m/s), zwingeStillstand, abbruch(fn),
 *   hindernisse [{s, q}] (stehende Autos, nicht im Rennen), kollisionen (autoAuto + bande) }
 */
function simuliere(fahrer, opt) {
  const o = Object.assign({ runden: 2, maxZeit: 400 }, opt);
  const anzahl = fahrer.length + (o.spieler ? 1 : 0);
  const plaetze = strecke.startpositionen(anzahl);
  const teilnehmer = [];
  let spielerAuto = null, spielerS = 0;
  if (o.spieler) {
    // synthetischer Spieler: fährt exakt auf der Mittellinie mit konstantem Tempo
    spielerAuto = new R.Vehicle({});
    spielerS = strecke.spline.naechster(plaetze[0].x, plaetze[0].z).s;
    const p = strecke.spline.punktBei(spielerS);
    spielerAuto.setzen(p.x, p.z, R.headingAus(p.tx, p.tz));
    teilnehmer.push({ vehicle: spielerAuto, name: 'Spieler', istSpieler: true });
  }
  const ki = fahrer.map((f, i) => {
    const pl = plaetze[i + (o.spieler ? 1 : 0)];
    const v = new R.Vehicle({});
    v.setzen(pl.x, pl.z, pl.heading);
    const d = new R.Driver(v, strecke, { schwierigkeit: f.schwierigkeit, seed: f.seed, name: 'KI ' + i });
    teilnehmer.push({ vehicle: v, name: d.name, istSpieler: false });
    return { v, d, index: -1, gras: 0, zeit: 0 };
  });
  const rennen = new R.RaceManager(strecke, teilnehmer, { runden: o.runden, countdown: 0 });
  // stehende Autos (z. B. ein Kind, das an der Linie stehen bleibt)
  const steher = (o.hindernisse || []).map((h) => {
    const p = strecke.spline.punktBei(h.s);
    const v = new R.Vehicle({});
    v.setzen(p.x + p.nx * h.q, p.z + p.nz * h.q, R.headingAus(p.tx, p.tz));
    return { v, weg: 0, x: v.x, z: v.z, start: { x: v.x, z: v.z } };
  });
  const alleAutos = teilnehmer.map(t => t.vehicle).concat(steher.map(h => h.v));
  let stoesseMitSteher = 0;
  const tKi = rennen.teilnehmer.slice(o.spieler ? 1 : 0);
  const tSp = o.spieler ? rennen.teilnehmer[0] : null;
  let zeit = 0, maxVorne = -Infinity;

  for (; zeit < o.maxZeit; zeit += dt) {
    if (spielerAuto) {
      spielerS += o.spieler * dt;
      const p = strecke.spline.punktBei(spielerS);
      spielerAuto.x = p.x; spielerAuto.z = p.z; spielerAuto.heading = R.headingAus(p.tx, p.tz);
      spielerAuto.vLaengs = o.spieler;
    }
    const spielerMax = tSp ? tSp.fortschritt : null;
    ki.forEach((k, i) => {
      const t = tKi[i];
      if (t.imZiel) return;
      const andere = rennen.teilnehmer.filter(x => x !== t).map(x => ({ vehicle: x.vehicle, fortschritt: x.fortschritt }))
        .concat(steher.map(h => ({ vehicle: h.v, fortschritt: 0 })));
      const s = k.d.steuerung(dt, { andere, spielerFortschrittMax: spielerMax, eigenerFortschritt: t.fortschritt, laeuft: true });
      const n = strecke.abfrage(k.v.x, k.v.z, k.index);
      k.index = n.index;
      k.v.untergrund = n.untergrund;
      if (n.untergrund === 'gras') k.gras += dt;
      k.zeit += dt;
      k.v.schritt(dt, s);
      if (o.zwingeStillstand) { k.v.vLaengs = 0; k.v.vQuer = 0; }
    });
    steher.forEach(h => h.v.schritt(dt, { gas: 0, bremse: 0, lenkung: 0 }));
    if (o.kollisionen) {
      ki.forEach(k => R.Kollisionen.bande(k.v, strecke));
      const st = R.Kollisionen.autoAuto(alleAutos);
      const ersterSteher = teilnehmer.length;
      st.forEach(x => { if (x.a >= ersterSteher || x.b >= ersterSteher) stoesseMitSteher++; });
    }
    steher.forEach((h) => { h.weg += Math.hypot(h.v.x - h.x, h.v.z - h.z); h.x = h.v.x; h.z = h.v.z; });
    rennen.schritt(dt);
    if (tSp) {
      tKi.forEach(t => { maxVorne = Math.max(maxVorne, t.fortschritt - tSp.fortschritt); });
    }
    if (o.abbruch && o.abbruch({ zeit, rennen, ki, tKi, tSp })) break;
    if (!tSp && tKi.every(t => t.imZiel)) break;
  }
  return { ki, tKi, tSp, rennen, zeit, maxVorne, steher, stoesseMitSteher };
}

// ---------- 1) Jede Schwierigkeit allein, 2 Runden ----------
const stufen = ['leicht', 'mittel', 'schwer', 'unfair'];
const ergebnis = {};
for (const st of stufen) {
  const r = simuliere([{ schwierigkeit: st, seed: 7 }], { runden: 2 });
  const k = r.ki[0], t = r.tKi[0];
  const anteil = k.gras / Math.max(k.zeit, 1e-9);
  ergebnis[st] = { r1: t.rundenzeiten[0], r2: t.rundenzeiten[1], gesamt: t.zielZeit };
  pruefe(`${st}: 2 Runden im Ziel, Gras ${(anteil * 100).toFixed(1)} % < 3 %, kein Reset`,
    t.imZiel && anteil < 0.03 && !k.d.brauchtReset,
    `Runde 1 ${fmt(t.rundenzeiten[0])}, Runde 2 ${fmt(t.rundenzeiten[1])}`);
}
function fmt(x) { return x === undefined || x === null ? '-' : x.toFixed(1) + ' s'; }
const r2 = st => (ergebnis[st].r2 !== undefined ? ergebnis[st].r2 : Infinity);
pruefe('Rundenzeiten (fliegend): unfair < schwer < mittel < leicht',
  r2('unfair') < r2('schwer') && r2('schwer') < r2('mittel') && r2('mittel') < r2('leicht'),
  stufen.map(s => s + ' ' + fmt(ergebnis[s].r2)).join(', '));
pruefe('Spanne leicht – unfair ≥ 12 s', r2('leicht') - r2('unfair') >= 12, (r2('leicht') - r2('unfair')).toFixed(1) + ' s');
pruefe('unfair-Rundenzeit 95–125 s', r2('unfair') >= 95 && r2('unfair') <= 125, fmt(ergebnis.unfair.r2));

// ---------- 2) 4 KI-Fahrer gleichzeitig ----------
{
  const r = simuliere([
    { schwierigkeit: 'mittel', seed: 1 }, { schwierigkeit: 'mittel', seed: 2 },
    { schwierigkeit: 'mittel', seed: 3 }, { schwierigkeit: 'mittel', seed: 4 },
  ], { runden: 2 });
  const resets = r.ki.filter(k => k.d.brauchtReset).length;
  const allesImZiel = r.tKi.every(t => t.imZiel);
  const zeiten = r.tKi.map(t => t.zielZeit);
  const eindeutig = allesImZiel && new Set(r.tKi.map(t => t.zielPlatz)).size === 4 &&
    new Set(zeiten.map(z => z.toFixed(3))).size === 4;
  const gras = Math.max(...r.ki.map(k => k.gras / k.zeit));
  pruefe('4 KI (mittel): alle im Ziel, kein Reset, Reihenfolge eindeutig',
    resets === 0 && eindeutig,
    'Zielzeiten ' + r.tKi.slice().sort((a, b) => a.zielPlatz - b.zielPlatz).map(t => t.name + ' ' + fmt(t.zielZeit)).join(', ') +
    ` | max. Gras ${(gras * 100).toFixed(1)} %`);
}

// ---------- 3) Gummiband ----------
{
  let abstandEnde = null;
  const r = simuliere([{ schwierigkeit: 'leicht', seed: 11 }], {
    runden: 5, spieler: 20, maxZeit: 600,
    abbruch: ({ tSp, tKi }) => {
      if (tSp.runde >= 2) { abstandEnde = tKi[0].fortschritt - tSp.fortschritt; return true; }
      return false;
    },
  });
  pruefe('Gummiband: leicht-KI nach 2 Spieler-Runden (20 m/s) weniger als 150 m dahinter',
    abstandEnde !== null && abstandEnde > -150, 'Abstand ' + (abstandEnde === null ? '-' : abstandEnde.toFixed(0)) + ' m (+ = KI vorne)');
  pruefe('Gummiband: KI liegt nie mehr als 150 m vorne', r.maxVorne < 150, 'max. ' + r.maxVorne.toFixed(0) + ' m');
}

// ---------- 4) Festfahren ----------
{
  let resetZeit = null;
  simuliere([{ schwierigkeit: 'mittel', seed: 5 }], {
    runden: 2, maxZeit: 30, zwingeStillstand: true,
    abbruch: ({ zeit, ki }) => { if (ki[0].d.brauchtReset) { resetZeit = zeit; return true; } return false; },
  });
  pruefe('Festfahren: brauchtReset nach ≤ 15 s', resetZeit !== null && resetZeit <= 15, resetZeit === null ? 'nie' : resetZeit.toFixed(1) + ' s');
}

// ---------- 6) Stehende Autos auf der Strecke, mit Kollisionsphysik ----------
{
  const fahrer = [{ schwierigkeit: 'mittel', seed: 21 }, { schwierigkeit: 'mittel', seed: 22 }, { schwierigkeit: 'mittel', seed: 23 }];
  const frei = simuliere(fahrer, { runden: 1, kollisionen: true });
  const mit = simuliere(fahrer, { runden: 1, kollisionen: true, hindernisse: [{ s: 300, q: 0 }, { s: 900, q: 2 }] });
  const weg = Math.max(...mit.steher.map(h => h.weg));
  const versatz = Math.max(...mit.steher.map(h => Math.hypot(h.v.x - h.start.x, h.v.z - h.start.z)));
  pruefe('Stehende Autos: insgesamt < 5 m bewegt', weg < 5,
    `Weg max. ${weg.toFixed(2)} m, Endversatz ${versatz.toFixed(2)} m, Stöße mit Stehern ${mit.stoesseMitSteher}`);
  pruefe('Stehende Autos: alle KI im Ziel, kein Reset',
    mit.tKi.every(t => t.imZiel) && mit.ki.every(k => !k.d.brauchtReset));
  const mehr = Math.max(...mit.tKi.map((t, i) => (t.rundenzeiten[0] || Infinity) - frei.tKi[i].rundenzeiten[0]));
  pruefe('Stehende Autos: Rundenzeit < 8 s langsamer als freie Fahrt', mehr < 8,
    'frei ' + frei.tKi.map(t => fmt(t.rundenzeiten[0])).join('/') + ' | mit ' + mit.tKi.map(t => fmt(t.rundenzeiten[0])).join('/') +
    ' | max. +' + mehr.toFixed(1) + ' s');
}

// ---------- 5) Deterministisch ----------
{
  const lauf = (seed) => {
    const pos = [];
    simuliere([{ schwierigkeit: 'leicht', seed }, { schwierigkeit: 'mittel', seed: seed + 1 }], {
      runden: 1, maxZeit: 40,
      abbruch: ({ zeit, ki }) => { if (Math.abs(zeit % 5) < dt / 2) pos.push(ki.map(k => [k.v.x, k.v.z])); return false; },
    });
    pos.push(0);
    return JSON.stringify(pos);
  };
  const a = lauf(42), b = lauf(42), c = lauf(43);
  pruefe('Deterministisch: gleicher Seed → gleiche Positionen', a === b);
  pruefe('Anderer Seed → andere Positionen', a !== c);
}

const dauer = (Date.now() - t0) / 1000;
pruefe('Laufzeit < 20 s', dauer < 20, dauer.toFixed(1) + ' s');
console.log(fehler === 0 ? '\nAlle KI-Tests bestanden.' : `\n${fehler} Test(s) fehlgeschlagen.`);
process.exit(fehler === 0 ? 0 : 1);
