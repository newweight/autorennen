// Node-Test für Bande, Auto-Auto-Kollisionen und Fahrhilfen: node tests/test_kollisionen.js
const { ladeModule } = require('./lade');
const R = ladeModule(['src/config.js', 'src/physics/vehicle.js', 'src/physics/collisions.js',
  'src/track/spline.js', 'src/track/trackCatalog.js', 'src/track/trackBuilder.js', 'src/cars/carCatalog.js', 'src/track/looping.js']);
const dt = R.config.physik.schritt;
const K = R.Kollisionen;
let fehler = 0;
function pruefe(name, ok, info) { console.log((ok ? 'OK   ' : 'FEHL ') + name + (info ? '  (' + info + ')' : '')); if (!ok) fehler++; }

const strecke = new R.Strecke(R.trackCatalog.find(t => t.id === 'wiese'));
const sp = strecke.spline;

/** Ein Schritt wie in main.js: Untergrund, Vehicle, Bande. */
function fahre(v, s, hilfe) {
  const n = strecke.abfrage(v.x, v.z, v._idx);
  v._idx = n.index; v.untergrund = n.untergrund;
  v.schritt(dt, s, hilfe);
  K.bande(v, strecke);
}

// 1) Bande: Vollgas quer zur Strecke (rechts raus und links raus, auch schräg)
{
  pruefe('seitenabstandMax = breite/2 + 18', strecke.seitenabstandMax === strecke.breite / 2 + 18, strecke.seitenabstandMax + ' m');
  let maxAbstand = 0, endTempo = [];
  for (const [s0, winkel] of [[60, -90], [60, 90], [500, -45], [1200, 135], [1500, -60]]) {
    const p = sp.punktBei(s0);
    const v = new R.Vehicle({});
    v.setzen(p.x, p.z, R.headingAus(p.tx, p.tz) + winkel * Math.PI / 180);
    v.vLaengs = 30;
    for (let i = 0; i < 60 * 10; i++) {
      fahre(v, { gas: 1, bremse: 0, lenkung: 0 });
      maxAbstand = Math.max(maxAbstand, Math.abs(sp.naechster(v.x, v.z, v._idx).seitenabstand));
    }
    endTempo.push(v.tempo);
  }
  pruefe('Bande hält Auto innerhalb seitenabstandMax + 0,5', maxAbstand <= strecke.seitenabstandMax + 0.5,
    'max ' + maxAbstand.toFixed(2) + ' m');
  // Runde 6: Gras ≤ 60 km/h, Rollwiderstand 4,5 → wer mit Vollgas und ohne Lenken quer an der Bande schleift, kriecht
  // nur noch (vorher Schwelle 1 m/s); geprüft wird: nicht festgeklemmt
  pruefe('An der Bande kein Hängenbleiben (fährt weiter)', endTempo.every(t => t > 0.3), endTempo.map(t => t.toFixed(1)).join(', ') + ' m/s');
}
// 1b) Bande: Aufprall baut Tempo ab, Heading dreht zur Straße
{
  const p = sp.punktBei(60);
  const v = new R.Vehicle({});
  const hT = R.headingAus(p.tx, p.tz);
  v.setzen(p.x + p.nx * (strecke.seitenabstandMax - 1), p.z + p.nz * (strecke.seitenabstandMax - 1), hT - 1.0); // schräg nach rechts raus
  v.vLaengs = 25;
  let staerke = 0;
  for (let i = 0; i < 10; i++) { v.schritt(dt, { gas: 0, bremse: 0, lenkung: 0 }); staerke = Math.max(staerke, K.bande(v, strecke)); }
  const w = Math.abs(R.Vehicle.winkelDiff(hT, v.heading));
  pruefe('Bande: Stoß gemeldet, Tempo abgebaut', staerke > 5 && v.tempo < 20, 'Stärke ' + staerke.toFixed(1) + ', Tempo ' + v.tempo.toFixed(1));
  pruefe('Bande: Heading zur Straße gedreht', w < 1.0, 'Winkel zur Tangente ' + w.toFixed(2) + ' rad');
}

/** Zwei Autos einfach nebeneinander/gegeneinander simulieren (ohne Strecke). */
function simuliere(a, b, sa, sb, schritte) {
  let minAbstand = Infinity, stoesse = [];
  for (let i = 0; i < schritte; i++) {
    a.schritt(dt, sa); b.schritt(dt, sb);
    stoesse = stoesse.concat(K.autoAuto([a, b]));
    minAbstand = Math.min(minAbstand, Math.hypot(a.x - b.x, a.z - b.z));
  }
  return { minAbstand, stoesse };
}

// 2) Frontal: beide verlangsamt, nicht durchdrungen
{
  const a = new R.Vehicle({}), b = new R.Vehicle({});
  a.setzen(0, 0, 0); b.setzen(0, -30, Math.PI);   // a fährt nach -z, b nach +z
  a.vLaengs = 15; b.vLaengs = 15;
  const leer = { gas: 0, bremse: 0, lenkung: 0 };
  const e = simuliere(a, b, leer, leer, 120);
  pruefe('Frontal: Stoß erkannt', e.stoesse.length > 0, e.stoesse.length ? 'Stärke ' + e.stoesse[0].staerke.toFixed(1) + ' m/s' : '');
  pruefe('Frontal: beide verlangsamt', a.tempo < 8 && b.tempo < 8, a.vLaengs.toFixed(1) + ' / ' + b.vLaengs.toFixed(1));
  pruefe('Frontal: nicht durchdrungen', e.minAbstand >= a.daten.laenge - 0.4 && a.z > b.z,
    'min. Mittelpunktabstand ' + e.minAbstand.toFixed(2) + ' m (Länge ' + a.daten.laenge + ')');
}
// 3) Schweres Auto schiebt leichtes (Auffahrunfall + seitliche Trennung)
{
  const schwer = new R.Vehicle({ masse: 2400 }), leicht = new R.Vehicle({ masse: 900 });
  schwer.setzen(0, 0, 0); leicht.setzen(0, -8, 0);
  schwer.vLaengs = 12;
  const leer = { gas: 0, bremse: 0, lenkung: 0 };
  simuliere(schwer, leicht, leer, leer, 40);
  pruefe('Schwer schiebt leicht: leichtes schneller als schweres danach', leicht.vLaengs > schwer.vLaengs && leicht.vLaengs > 8,
    'schwer ' + schwer.vLaengs.toFixed(1) + ', leicht ' + leicht.vLaengs.toFixed(1) + ' m/s');
  const s2 = new R.Vehicle({ masse: 2400 }), l2 = new R.Vehicle({ masse: 900 });
  s2.setzen(0, 0, 0); l2.setzen(1.2, 0, 0);       // überlappen seitlich
  K.autoAuto([s2, l2]);
  pruefe('Trennung nach Masse: leichtes weicht weiter aus', Math.abs(l2.x - 1.2) > 2 * Math.abs(s2.x),
    'schwer ' + s2.x.toFixed(2) + ' m, leicht +' + (l2.x - 1.2).toFixed(2) + ' m');
  // langsameres wird stärker geschoben (gleiche Masse)
  const schnell = new R.Vehicle({}), langsam = new R.Vehicle({});
  schnell.setzen(0, 0, 0); langsam.setzen(1.2, 0, 0); schnell.vLaengs = 25;
  K.autoAuto([schnell, langsam]);
  pruefe('Gleiche Masse: langsames weicht weiter aus', Math.abs(langsam.x - 1.2) > Math.abs(schnell.x),
    'schnell ' + schnell.x.toFixed(2) + ', langsam +' + (langsam.x - 1.2).toFixed(2));
}
// 4) Countdown: keine Kollision
{
  const a = new R.Vehicle({}), b = new R.Vehicle({});
  a.setzen(0, 0, 0); b.setzen(1.0, 0, 0);
  const st = K.autoAuto([{ vehicle: a }, { vehicle: b }], { countdown: true });
  pruefe('Countdown: Auto-Auto ignoriert', st.length === 0 && a.x === 0 && b.x === 1.0);
  const st2 = K.autoAuto([{ vehicle: a }, { vehicle: b }]);
  pruefe('Ohne Countdown: getrennt (Listeneinträge mit .vehicle)', b.x - a.x > 1.0 && st2.length === 0, 'Abstand ' + (b.x - a.x).toFixed(2));
}
// 5) Lenkhilfe: Geradeausfahrt mit 3 m Versatz → zurück zur Mitte in < 6 s
for (const stufe of ['wenig', 'viel']) {
  const h = R.config.fahrhilfen[stufe];
  const v = new R.Vehicle({});
  v.setzen(3, 0, 0); v.vLaengs = 15;          // Straße entlang -z, Mitte x = 0, rechts = +x
  let zeit = null, maxUeber = 0;
  for (let i = 0; i < 60 * 8; i++) {
    const hilfe = { lenkhilfe: h.lenkhilfe, bremshilfe: 0, tangente: { tx: 0, tz: -1 }, seitenabstand: v.x, zieltempo: 40 };
    v.schritt(dt, { gas: v.vLaengs < 15 ? 1 : 0, bremse: 0, lenkung: 0 }, hilfe);
    if (zeit === null && Math.abs(v.x) < 0.5) zeit = (i + 1) * dt;
    if (zeit !== null) maxUeber = Math.max(maxUeber, Math.abs(v.x));
  }
  pruefe('Lenkhilfe "' + stufe + '": 3 m Versatz → Mitte in < 6 s, ohne Aufschaukeln',
    zeit !== null && zeit < 6 && maxUeber < 1.0 && Math.abs(v.x) < 0.3,
    (zeit !== null ? zeit.toFixed(1) + ' s' : 'nie') + ', danach max |x| ' + maxUeber.toFixed(2) + ' m');
}
// 5b) Lenkhilfe aus = bleibt versetzt; Spieler kann gegen die Hilfe lenken
{
  const v = new R.Vehicle({}); v.setzen(3, 0, 0); v.vLaengs = 15;
  for (let i = 0; i < 300; i++) v.schritt(dt, { gas: 0, bremse: 0, lenkung: 0 }, { lenkhilfe: 0, bremshilfe: 0, tangente: { tx: 0, tz: -1 }, seitenabstand: v.x, zieltempo: 40 });
  pruefe('Lenkhilfe aus: kein Eingriff', Math.abs(v.x - 3) < 1e-9);
  const w = new R.Vehicle({}); w.setzen(0, 0, 0); w.vLaengs = 15;
  for (let i = 0; i < 90; i++) w.schritt(dt, { gas: 0, bremse: 0, lenkung: 1 }, { lenkhilfe: 0.7, bremshilfe: 0, tangente: { tx: 0, tz: -1 }, seitenabstand: w.x, zieltempo: 40 });
  pruefe('Lenkhilfe "viel": Spieler kann trotzdem nach rechts ausscheren', w.x > 3, 'x=' + w.x.toFixed(1));
}
// 6) Bremshilfe senkt Tempo vor der Haarnadel (Vollgas, Lenkung folgt der Linie)
{
  let haar = sp.punkte[0];
  sp.punkte.forEach(p => { if (Math.abs(p.kruemmung) > Math.abs(haar.kruemmung)) haar = p; });
  // Kurveneingang: erster Punkt vor der Haarnadel mit deutlicher Krümmung
  let sEin = haar.s;
  while (Math.abs(sp.punktBei(sEin - 2).kruemmung) > Math.abs(haar.kruemmung) * 0.5) sEin -= 2;
  function lauf(bremshilfe) {
    const p = sp.punktBei(sEin - 220);
    const v = new R.Vehicle({}); v.setzen(p.x, p.z, R.headingAus(p.tx, p.tz)); v.vLaengs = 35;
    let idx = -1, tempoEin = null;
    for (let i = 0; i < 60 * 20 && tempoEin === null; i++) {
      const n = strecke.abfrage(v.x, v.z, idx); idx = n.index; v.untergrund = n.untergrund;
      const ziel = sp.punktBei(n.s + 12);
      const diff = R.Vehicle.winkelDiff(R.headingAus(ziel.x - v.x, ziel.z - v.z), v.heading);
      const q = sp.punktBei(n.s);
      v.schritt(dt, { gas: 1, bremse: 0, lenkung: Math.max(-1, Math.min(1, -diff * 4)) }, {
        lenkhilfe: 0, bremshilfe, tangente: { tx: q.tx, tz: q.tz }, seitenabstand: n.seitenabstand,
        zieltempo: strecke.tempoBei(n.s + Math.max(0, v.vLaengs) * 0.4),
      });
      K.bande(v, strecke);
      if (sp.differenzS(n.s, sEin) >= 0 && sp.differenzS(n.s, sEin) < 20) tempoEin = v.vLaengs;
    }
    return tempoEin;
  }
  const ohne = lauf(0), wenig = lauf(R.config.fahrhilfen.wenig.bremshilfe), viel = lauf(R.config.fahrhilfen.viel.bremshilfe);
  const ziel = strecke.tempoBei(sEin);
  pruefe('Bremshilfe senkt Tempo am Haarnadel-Eingang', viel < ohne - 5 && wenig < ohne && viel < wenig,
    'ohne ' + (ohne * 3.6).toFixed(0) + ', wenig ' + (wenig * 3.6).toFixed(0) + ', viel ' + (viel * 3.6).toFixed(0) +
    ' km/h (Ideallinie ' + (ziel * 3.6).toFixed(0) + ' km/h)');
}
// =====================================================================================================
// Runde 6 (W1-A3/A4): Rechtecke (SAT), keine Verschmelzung bei 75 m/s, Rempeln sanft/echt, Looping-Abstand
// =====================================================================================================
const KAT = (id) => R.carCatalog.find(a => a.id === id).fahrwerte;
const MIND = R.config.kollision.mindestAbstand;
/** Zwei Autos fahren ohne Strecke; nach jedem autoAuto: Abstand (Rechtecke) messen. */
function lauf2(a, b, rempeln, schritte, sa, sb) {
  const leer = { gas: 0, bremse: 0, lenkung: 0 };
  let minAbst = Infinity, stoesse = [], erstVQ = null, drehMax = [0, 0];
  for (let i = 0; i < schritte; i++) {
    a.schritt(dt, sa || leer); b.schritt(dt, sb || leer);
    const vqA = a.vQuer, vqB = b.vQuer;
    const st = K.autoAuto([a, b], { rempeln, dt });
    if (st.length && erstVQ === null) erstVQ = { a: a.vQuer - vqA, b: b.vQuer - vqB, art: st[0].art };
    stoesse = stoesse.concat(st);
    minAbst = Math.min(minAbst, K.obbAbstand(a, b));
    drehMax[0] = Math.max(drehMax[0], Math.abs(a.drehImpuls)); drehMax[1] = Math.max(drehMax[1], Math.abs(b.drehImpuls));
  }
  return { minAbst, stoesse, erstVQ, drehMax };
}
const H = (grad) => grad * Math.PI / 180;
/** Rempler b so starten, dass seine Mitte nach T s (relativ zu a, das mit vA geradeaus nach −z fährt) bei (zx, zz) ist. */
function zielStart(a, b, vA, hB, vB, zx, zz, T) {
  a.setzen(0, 0, 0); a.vLaengs = vA;
  const bx = -Math.sin(hB) * vB, bz = -Math.cos(hB) * vB;          // Geschwindigkeit b (Welt)
  b.setzen(zx - (bx - 0) * T, zz - (bz + vA) * T, hB); b.vLaengs = vB;
}
/** Szenen: a = Opfer/erstes Auto, b = zweites. */
const SCHNELL = { vMax: 80 };   // 75 m/s ohne vMax-Deckel (Standard-Auto: 240 km/h)
// versetzter Auffahrer (5°, 0,9 m versetzt) → darf drehen (PIT); siehe Test unten
const SZENEN = {
  frontal: () => { const a = new R.Vehicle(SCHNELL), b = new R.Vehicle(SCHNELL); a.setzen(0, 0, 0); b.setzen(0.4, -40, Math.PI); a.vLaengs = 75; b.vLaengs = 75; return [a, b]; },
  seitlich: () => { const a = new R.Vehicle(SCHNELL), b = new R.Vehicle(SCHNELL); a.setzen(0, 0, 0); b.setzen(30, -1.2, H(90)); a.vLaengs = 10; b.vLaengs = 75; return [a, b]; },
  schraeg: () => { const a = new R.Vehicle(SCHNELL), b = new R.Vehicle(SCHNELL); zielStart(a, b, 30, H(30), 75, 0.6, 3.8, 0.5); return [a, b]; },
  heckMittig: () => { const a = new R.Vehicle(SCHNELL), b = new R.Vehicle(SCHNELL); a.setzen(0, 0, 0); b.setzen(0, 12, 0); a.vLaengs = 20; b.vLaengs = 75; return [a, b]; },
  seitFlach: () => { const a = new R.Vehicle(SCHNELL), b = new R.Vehicle(SCHNELL); a.setzen(0, 0, 0); b.setzen(2.6, 0.5, H(5)); a.vLaengs = 30; b.vLaengs = 32; return [a, b]; },
};
for (const rempeln of ['sanft', 'echt']) {
  for (const name of Object.keys(SZENEN)) {
    const [a, b] = SZENEN[name]();
    const e = lauf2(a, b, rempeln, 90);
    pruefe(`[${rempeln}] ${name} 75 m/s: Stoß erkannt, nie Durchdringung (Abstand ≥ ${MIND} m nach jeder Auflösung)`,
      e.stoesse.length > 0 && e.minAbst >= MIND - 1e-6, 'min. Abstand ' + e.minAbst.toFixed(3) + ' m, Stöße ' + e.stoesse.length +
      (e.stoesse.length ? ', Stärke ' + e.stoesse[0].staerke.toFixed(1) : ''));
    if (name === 'frontal') pruefe(`[${rempeln}] frontal: nicht durchgeschossen (Reihenfolge bleibt)`, a.z > b.z, 'a.z ' + a.z.toFixed(1) + ', b.z ' + b.z.toFixed(1));
    if (rempeln === 'sanft') pruefe(`[sanft] ${name}: keine Drehung`, e.drehMax[0] === 0 && e.drehMax[1] === 0);
    if (rempeln === 'echt' && name === 'seitlich') pruefe('[echt] seitlicher/versetzter Treffer → Opfer dreht sich (≤ drehMax)',
      e.drehMax[0] >= R.config.kollision.rempeln.drehMin && e.drehMax[0] <= R.config.kollision.rempeln.drehMax + 1e-9 &&
      e.stoesse.some(s => s.dreht && s.dreht[0]), 'drehImpuls max ' + e.drehMax[0].toFixed(2) + ' rad/s');
    if (rempeln === 'echt' && name === 'schraeg') pruefe('[echt] schräg von hinten (30°) → Opfer abgedrängt (Querimpuls ≥ 3 m/s), keine Drehung',
      e.erstVQ && e.erstVQ.art === 'abdraengen' && Math.abs(e.erstVQ.a) >= 3 - 1e-9 && e.drehMax[0] === 0,
      e.erstVQ ? e.erstVQ.art + ', ΔvQuer ' + e.erstVQ.a.toFixed(2) + ' m/s' : 'kein Stoß');
    if (rempeln === 'echt' && name === 'seitFlach') pruefe('[echt] flacher Winkel (5°) nebeneinander → nur schieben, keine Drehung',
      e.erstVQ && e.erstVQ.art === 'schieben' && e.drehMax[0] === 0 && e.drehMax[1] === 0, e.erstVQ ? e.erstVQ.art : 'kein Stoß');
    if (rempeln === 'echt' && name === 'heckMittig') pruefe('[echt] mittiger Auffahrer → Stoß ohne Drehung',
      e.erstVQ && e.erstVQ.art === 'stoss' && e.drehMax[0] === 0 && e.drehMax[1] === 0, e.erstVQ ? e.erstVQ.art : 'kein Stoß');
  }
}
{
  const a = new R.Vehicle(SCHNELL), b = new R.Vehicle(SCHNELL); a.setzen(0, 0, 0); b.setzen(1.2, 12, H(5)); a.vLaengs = 20; b.vLaengs = 45;
  const e = lauf2(a, b, 'echt', 60);
  pruefe('[echt] versetzter Auffahrer (Heckecke) → Opfer dreht sich', e.drehMax[0] >= R.config.kollision.rempeln.drehMin,
    'drehImpuls ' + e.drehMax[0].toFixed(2) + ' rad/s, ' + (e.erstVQ ? e.erstVQ.art : '-'));
}
// Drehung: Auto dreht höchstens ~90° und Lenkung wirkt dabei nur zu 30 %
{
  const v = new R.Vehicle({}); v.setzen(0, 0, 0); v.vLaengs = 25; v.drehImpuls = R.config.kollision.rempeln.drehMax;
  for (let i = 0; i < 120; i++) v.schritt(dt, { gas: 0, bremse: 0, lenkung: 0 });
  const grad = v.heading * 180 / Math.PI;
  pruefe('Drehung bei drehMax: klingt in ~1 s ab, dreht ≈ 90° (70–100°)', v.drehImpuls === 0 && grad > 70 && grad < 100, grad.toFixed(0) + '°');
  const l1 = new R.Vehicle({}), l2 = new R.Vehicle({}); l1.vLaengs = l2.vLaengs = 20; l2.drehImpuls = 1e-6;
  // l2: winziger Drehimpuls (sofort abgeklungen) → nur der Lenk-Anteil im ersten Schritt zählt
  l1.lenkung = l2.lenkung = 1;
  l1.schritt(dt, { gas: 0, bremse: 0, lenkung: 1 }); l2.schritt(dt, { gas: 0, bremse: 0, lenkung: 1 });
  pruefe('Während der Drehung wirkt die Lenkung nur zu 30 %', Math.abs(l2.heading / l1.heading - 0.3) < 0.02, (l2.heading / l1.heading).toFixed(3));
}
// Masse × Tempo: Multivan schiebt Mini stärker als umgekehrt; schneller = stärker
{
  function abdraengen(fwOpfer, fwRempler, tempo) {
    const a = new R.Vehicle(Object.assign({}, fwOpfer, SCHNELL)), b = new R.Vehicle(Object.assign({}, fwRempler, SCHNELL));
    zielStart(a, b, 30, H(30), tempo, 0.6, 3.8, 0.5);
    const e = lauf2(a, b, 'echt', 60);
    return e.erstVQ ? Math.abs(e.erstVQ.a) : 0;
  }
  const mvMini = abdraengen(KAT('mini-cooper'), KAT('multivan'), 60), miniMv = abdraengen(KAT('multivan'), KAT('mini-cooper'), 60);
  pruefe('Multivan schiebt Mini stärker ab als Mini den Multivan', mvMini > miniMv * 1.2, 'Mini ' + mvMini.toFixed(2) + ' m/s, Multivan ' + miniMv.toFixed(2) + ' m/s');
  // nur der Rempel-Anteil: echt − sanft (gleiche Szene, gleiche Masse) = 3–6 m/s quer
  const quer = (rempeln) => { const a = new R.Vehicle(SCHNELL), b = new R.Vehicle(SCHNELL); zielStart(a, b, 30, H(30), 60, 0.6, 3.8, 0.5);
    const e = lauf2(a, b, rempeln, 60); return e.erstVQ ? e.erstVQ.a : 0; };
  const zusatz = Math.abs(quer('echt') - quer('sanft'));
  pruefe('Abdrängen: zusätzlicher Querimpuls 3–6 m/s (gleiche Masse)', zusatz >= 3 - 1e-9 && zusatz <= 6 + 1e-9, zusatz.toFixed(2) + ' m/s');
  const langsam = abdraengen({}, {}, 34), schnell = abdraengen({}, {}, 60);
  pruefe('Tempo: schnellerer Rempler drängt stärker ab', schnell > langsam, langsam.toFixed(2) + ' → ' + schnell.toFixed(2) + ' m/s');
  function dreh(fwOpfer, fwRempler) {
    const a = new R.Vehicle(fwOpfer), b = new R.Vehicle(fwRempler);
    a.setzen(0, 0, 0); b.setzen(12, -1.0, H(90)); a.vLaengs = 0; b.vLaengs = 12;
    return lauf2(a, b, 'echt', 90).drehMax[0];
  }
  const dMini = dreh(KAT('mini-cooper'), KAT('multivan')), dMv = dreh(KAT('multivan'), KAT('mini-cooper'));
  pruefe('Seitentreffer: Multivan dreht Mini stärker als Mini den Multivan', dMini > dMv, 'Mini ' + dMini.toFixed(2) + ', Multivan ' + dMv.toFixed(2) + ' rad/s');
}
// Auto an der Bande gilt als schwer: das freie Auto weicht aus
{
  const a = new R.Vehicle({}), b = new R.Vehicle({}); a.setzen(0, 0, 0); b.setzen(1.5, 0, 0); a._anBande = true;
  K.autoAuto([a, b]);
  pruefe('Trennung: Auto an der Bande bleibt fast stehen, das andere weicht aus', Math.abs(a.x) < 0.05 && b.x - 1.5 > 0.3,
    'a ' + a.x.toFixed(3) + ', b +' + (b.x - 1.5).toFixed(3));
}
// Looping: zwei Autos gleichzeitig nebeneinander → keine Durchdringung im Looping, beide schaffen ihn
{
  const st = new R.Strecke(R.trackCatalog.find(t => t.id === 'fantasie'));
  const L = st.loopings[0], sp = st.spline;
  for (const [name, q2, ds2] of [['nebeneinander', 2.5, 0], ['dicht dahinter', 0, -2]]) {
    const fz = [0, 1].map((k) => {
      const v = new R.Vehicle({}), p = sp.punktBei(L.s - 30 + (k ? ds2 : 0)), q = k ? q2 : -2.5 * (ds2 === 0 ? 1 : 0);
      v.setzen(p.x + p.nx * q, p.z + p.nz * q, R.headingAus(p.tx, p.tz)); v.vLaengs = 32;
      return { vehicle: v, looping: R.Looping.zustand(), index: -1 };
    });
    let minLuecke = Infinity, beideDrin = 0;
    for (let i = 0; i < 60 * 6; i++) {
      fz.forEach((f) => { f.index = R.Looping.fahrzeugSchritt(f.looping, f.vehicle, st, { gas: 1, bremse: 0, lenkung: 0 }, dt, f.index).index; });
      K.loopingAbstand(fz, st);
      const [l0, l1] = fz.map(f => f.looping);
      if (l0.aktiv && l1.aktiv && l0.looping === l1.looping) {
        beideDrin++;
        minLuecke = Math.min(minLuecke, Math.abs(l0.winkel - l1.winkel) * L.radius);
      }
    }
    const soll = fz[0].vehicle.daten.laenge + R.config.kollision.loopingAbstand;
    pruefe(`Looping ${name}: Abstand im Looping ≥ Länge + 0,1 m, beide geschafft, kein Sturz`,
      (beideDrin === 0 || minLuecke >= soll - 1e-6) && fz.every(f => f.looping.geschafft >= 1 && f.looping.gefallen === 0),
      'gemeinsam im Looping ' + beideDrin + ' Schritte, min. Bogenabstand ' + (minLuecke === Infinity ? '-' : minLuecke.toFixed(2)) + ' m, geschafft ' +
      fz.map(f => f.looping.geschafft).join('/'));
  }
}
// Runde 6 (W4-I): Überführung (Alpen) – zwei Autos übereinander an der Kreuzung kollidieren nicht (|Δy| ≥ 2 m),
// dasselbe Auto-Paar auf gleicher Höhe schon. Beide fahren gleichzeitig durch die Kreuzung (oben quer über unten).
{
  const st = new R.Strecke(R.trackCatalog.find(t => t.id === 'alpen')), sp2 = st.spline, kr = st.ueberfuehrungen[0].kreuzung;
  const setze = (s, nr) => {
    const v = new R.Vehicle({}), p = sp2.punktBei(s);
    v.setzen(p.x, p.z, R.headingAus(p.tx, p.tz)); v.vLaengs = 20; v._idx = sp2.indexBei(s);
    v.y = st.hoeheAn(v.x, v.z, v._idx); v.nr = nr;
    return v;
  };
  const schritt2 = (v) => {
    const n = st.abfrage(v.x, v.z, v._idx); v._idx = n.index; v.untergrund = n.untergrund;
    v.schritt(dt, { gas: 0.4, bremse: 0, lenkung: 0 });
    K.bande(v, st);
    v.y = st.hoeheAn(v.x, v.z, v._idx);
  };
  // Start so, dass beide gleichzeitig an der Kreuzung sind (je 30 m davor, gleiches Tempo)
  const oben = setze(kr.sOben - 30, 0), unten = setze(kr.sUnten - 30, 1);
  let stoesse = 0, minAbst = Infinity, minDy = Infinity, sObenMax = 0;
  for (let i = 0; i < 60 * 4; i++) {
    schritt2(oben); schritt2(unten);
    const d = Math.hypot(oben.x - unten.x, oben.z - unten.z);
    if (d < minAbst) { minAbst = d; minDy = Math.abs(oben.y - unten.y); }
    stoesse += K.autoAuto([oben, unten], { dt }).length;
    sObenMax = Math.max(sObenMax, sp2.differenzS(st.abfrage(oben.x, oben.z, oben._idx).s, kr.sOben));
  }
  pruefe('Überführung: Autos übereinander (Abstand in x/z < 3 m, Δy ≥ 7 m) kollidieren nicht', minAbst < 3 && minDy >= 7 && stoesse === 0,
    'min. Abstand ' + minAbst.toFixed(2) + ' m bei Δy ' + minDy.toFixed(2) + ' m, Stöße ' + stoesse);
  pruefe('Überführung: oberes Auto fährt über die Kreuzung hinweg (bleibt auf seinem Abschnitt)', sObenMax > 20, sObenMax.toFixed(1) + ' m');
  // Gegenprobe: gleiche Lage, aber gleiche Höhe → Stoß
  const a = setze(kr.sUnten, 0), b = setze(kr.sUnten, 1);
  b.x += 1.0; b.y = a.y;
  K.autoAuto([a, b], { dt });
  pruefe('Gegenprobe: gleiche Höhe + Überlappung → getrennt (Stoß wirkt)', Math.hypot(a.x - b.x, a.z - b.z) > 1.0,
    'Abstand nach Stoß ' + Math.hypot(a.x - b.x, a.z - b.z).toFixed(2) + ' m');
  const c = setze(kr.sUnten, 0), e = setze(kr.sUnten, 1);
  e.x += 1.0; e.y = c.y + 2.5;
  const vorher = [e.x, e.z];
  K.autoAuto([c, e], { dt });
  pruefe('Δy 2,5 m + Überlappung → keine Trennung (übereinander)', e.x === vorher[0] && e.z === vorher[1]);
}
console.log(fehler === 0 ? '\nALLE TESTS OK' : '\n' + fehler + ' FEHLER');
process.exit(fehler ? 1 : 0);
