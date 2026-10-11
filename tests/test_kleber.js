// Node-Test Klebe-Seitenstreifen (Runde 5, src/world/kleber.js): node tests/test_kleber.js
// a) Katalog/Welten: nur Fantasie (beide Welten), 3–4 Abschnitte, nicht an Loopings/Bällen/Anlauf-Zonen.
// b) Untergrund 'kleber' nur auf dem Randstreifen der richtigen Seite; Werte grip 0,7 / rollwiderstand 8; bremst deutlich.
// c) > 2 s am Stück darauf → festgeklebt (5 s, Steuerung aus, Tempo 0, Sekunden-Ticks) → gelöst (Rückstoß zur Mitte,
//    Schonzeit) → kann wegfahren; kurz darüber fahren (< 2 s) klebt nicht.
// d) KI (alle Stufen) fährt 2 Runden Fantasie mit Kleber-Logik, ohne festzukleben.
const { ladeModule } = require('./lade');
const R = ladeModule(['src/config.js', 'src/physics/vehicle.js', 'src/cars/carCatalog.js', 'src/track/spline.js', 'src/track/trackCatalog.js',
  'src/track/trackBuilder.js', 'src/track/looping.js', 'src/track/anlauf.js', 'src/world/kleber.js', 'src/race/raceManager.js',
  'src/physics/collisions.js', 'src/ai/driver.js']);

let fehler = 0;
function pruefe(name, ok, info) { console.log((ok ? 'OK   ' : 'FEHL ') + name + (info ? '  (' + info + ')' : '')); if (!ok) fehler++; }
const dt = R.config.physik.schritt, K = R.Kleber, CK = R.config.kleber;
const kat = (id) => R.trackCatalog.find(t => t.id === id);

// ---------- a) Katalog / Welten ----------
const fd = kat('fantasie');
pruefe('Fantasie: 3–4 Kleber-Abschnitte im Katalog', fd.kleber && fd.kleber.length >= 3 && fd.kleber.length <= 4, (fd.kleber || []).map(k => k.s0 + '–' + k.s1 + '/' + k.seite).join(', '));
['fantasie', 'verrueckt'].forEach(w => pruefe('Fantasie/' + w + ': Kleber aktiv', new R.Strecke(fd, { welt: w }).kleber.length === fd.kleber.length));
['wiese', 'wald', 'wueste'].forEach(id => Object.keys(kat(id).welten).forEach(w => {
  const st = new R.Strecke(kat(id), { welt: w });
  if (st.kleber.length) pruefe(id + '/' + w + ': kein Kleber', false);
}));
pruefe('Andere Strecken/Welten: kein Kleber', true);
const st = new R.Strecke(fd, { welt: 'fantasie' }), sp = st.spline;
{
  const sperr = [];
  st.loopings.forEach(L => sperr.push([L.s - 165, L.s + L.versatz + 30, 'Looping/Anlauf']));
  (fd.baelle || []).forEach(b => sperr.push([b.s - 30, b.s + 30, 'Ball']));
  const kollision = st.kleber.filter(k => sperr.some(([a, b]) => sp.differenzS(k.s1, a) > 0 && sp.differenzS(b, k.s0) > 0));
  pruefe('Kleber nicht an Loopings (inkl. Anlauf-Zone) und nicht ±30 m an Bällen', kollision.length === 0, kollision.map(k => k.s0).join(','));
}

// ---------- b) Untergrund ----------
const k0 = st.kleber.find(k => k.seite !== 0), kBeide = st.kleber.find(k => k.seite === 0);
const ug = (s, q) => { const p = sp.punktBei(s); return st.abfrage(p.x + p.nx * q, p.z + p.nz * q).untergrund; };
const rand = st.breite / 2 + st.randBreite / 2;
pruefe('Untergrund: Randstreifen im Abschnitt = kleber, Gegenseite = rand, Fahrbahn = strasse, davor = rand',
  ug((k0.s0 + k0.s1) / 2, k0.seite * rand) === 'kleber' && ug((k0.s0 + k0.s1) / 2, -k0.seite * rand) === 'rand' &&
  ug((k0.s0 + k0.s1) / 2, 0) === 'strasse' && ug(k0.s0 - 5, k0.seite * rand) === 'rand' &&
  ug((kBeide.s0 + kBeide.s1) / 2, rand) === 'kleber' && ug((kBeide.s0 + kBeide.s1) / 2, -rand) === 'kleber');
const U = R.config.physik.untergrund.kleber;
pruefe('physik.untergrund.kleber: grip 0,7, rollwiderstand 8', U && U.grip === 0.7 && U.rollwiderstand === 8, JSON.stringify(U));
{
  const roll = (u) => { const v = new R.Vehicle({}); v.setzen(0, 0, 0); v.vLaengs = 25; v.untergrund = u; for (let i = 0; i < 60; i++) v.schritt(dt, { gas: 0 }); return v.vLaengs; };
  const r = roll('rand'), k = roll('kleber');
  pruefe('Kleber bremst deutlich (1 s ausrollen ab 90 km/h)', k < r - 3, 'rand ' + (r * 3.6).toFixed(0) + ' km/h, kleber ' + (k * 3.6).toFixed(0) + ' km/h');
}

// ---------- c) Kleben / Lösen ----------
/** Schritt wie main.js (Eingabe sperren, Untergrund mit Schonzeit, vehicle.schritt, Kleber.nachSchritt). */
function schritt(a, s) {
  const n = st.abfrage(a.v.x, a.v.z, a.index); a.index = n.index;
  a.v.untergrund = K.untergrund(a.kz, n.untergrund);
  const steuer = K.gesperrt(a.kz) ? { gas: 0, bremse: 0, lenkung: 0 } : s;
  a.v.schritt(dt, steuer);
  R.Kollisionen.bande(a.v, st);
  return K.nachSchritt(a.kz, a.v, st, n, dt);
}
{
  const sm = (k0.s0 + k0.s1) / 2, p = sp.punktBei(sm - 12), v = new R.Vehicle({});
  v.setzen(p.x + p.nx * k0.seite * rand, p.z + p.nz * k0.seite * rand, R.headingAus(p.tx, p.tz)); v.vLaengs = 4;
  const a = { v, kz: K.zustand(), index: -1 };
  const ev = []; let tKleb = null, t = 0, maxV = 0;
  for (let i = 0; i < 60 * 12 && !ev.some(e => e.typ === 'geloest'); i++) {
    const e = schritt(a, { gas: 0.15, bremse: 0, lenkung: 0 }); t += dt;
    if (e) { ev.push(e); if (e.typ === 'klebt') tKleb = t; }
    if (K.gesperrt(a.kz) && e && e.typ !== 'klebt') maxV = Math.max(maxV, Math.abs(v.vLaengs));
    if (K.gesperrt(a.kz)) maxV = Math.max(maxV, Math.hypot(v.vLaengs, v.vQuer));
  }
  const ticks = ev.filter(e => e.typ === 'tick').map(e => e.rest);
  pruefe('Langsam auf dem Streifen: nach > 2 s „klebt" (Meldung 5 s)', ev[0] && ev[0].typ === 'klebt' && ev[0].rest === 5 && tKleb > CK.sekunden && tKleb < CK.sekunden + 0.1,
    'nach ' + (tKleb || 0).toFixed(2) + ' s');
  pruefe('Festgeklebt: Tempo 0 trotz Gas, Ticks 4–3–2–1, nach 5 s „gelöst"', maxV === 0 && ticks.join(',') === '4,3,2,1' &&
    ev[ev.length - 1].typ === 'geloest' && Math.abs(t - tKleb - CK.dauer) < 0.05, 'Ticks ' + ticks.join(',') + ', gelöst nach ' + (t - tKleb).toFixed(2) + ' s');
  // Rückstoß zur Mitte
  const n = sp.naechster(v.x, v.z), p2 = sp.punktBei(n.s), w = v.weltGeschwindigkeit();
  const zurMitte = -(w.x * p2.nx + w.z * p2.nz) * Math.sign(n.seitenabstand);
  pruefe('Gelöst: Rückstoß 2 m/s Richtung Fahrbahnmitte, Schonzeit läuft', Math.abs(zurMitte - CK.rueckstoss) < 0.05 && a.kz.frei > 0,
    'zur Mitte ' + zurMitte.toFixed(2) + ' m/s, frei ' + a.kz.frei.toFixed(1) + ' s');
  // Danach: Gas + leicht zur Mitte lenken → kommt runter, klebt nicht sofort wieder
  let wieder = false;
  for (let i = 0; i < 60 * 4; i++) {
    const nn = sp.naechster(v.x, v.z), pp = sp.punktBei(nn.s + 4);
    const fe = R.Vehicle.winkelDiff(v.heading, R.headingAus(pp.tx, pp.tz));
    const e = schritt(a, { gas: 1, bremse: 0, lenkung: Math.max(-1, Math.min(1, fe * 2.5 - nn.seitenabstand * 0.15)) });
    if (e && e.typ === 'klebt') wieder = true;
  }
  const n3 = sp.naechster(v.x, v.z);
  pruefe('Nach dem Lösen: mit Gas zur Mitte → runter vom Streifen, kein erneutes Kleben', !wieder && Math.abs(n3.seitenabstand) < st.breite / 2 && v.vLaengs > 5,
    'q=' + n3.seitenabstand.toFixed(1) + ' m, ' + (v.vLaengs * 3.6).toFixed(0) + ' km/h');
}
{
  // schnell (25 m/s) 30 m über den Streifen und wieder runter: < 2 s → klebt nicht
  const p = sp.punktBei(k0.s0 - 5), v = new R.Vehicle({});
  v.setzen(p.x + p.nx * k0.seite * rand, p.z + p.nz * k0.seite * rand, R.headingAus(p.tx, p.tz)); v.vLaengs = 25;
  const a = { v, kz: K.zustand(), index: -1 }; let geklebt = false, drauf = 0;
  for (let i = 0; i < 60 * 3; i++) {
    const q = sp.naechster(v.x, v.z).seitenabstand;
    const e = schritt(a, { gas: 1, bremse: 0, lenkung: i > 50 ? Math.max(-1, Math.min(1, q * k0.seite * -0.3)) : 0 });
    if (v.untergrund === 'kleber') drauf += dt;
    if (e && e.typ === 'klebt') geklebt = true;
  }
  pruefe('Kurz drüber (< 2 s am Stück) → klebt nicht', !geklebt && drauf > 0.3, 'auf dem Kleber ' + drauf.toFixed(2) + ' s');
}
{
  const a = K.zustand(); a.klebt = 3; a.frei = 1; K.abbrechen(a);
  pruefe('abbrechen(): Zustand frei', !K.gesperrt(a) && a.frei === 0 && a.zeit === 0);
  pruefe('Schonzeit: Untergrund kleber → rand', K.untergrund({ frei: 1 }, 'kleber') === 'rand' && K.untergrund({ frei: 0 }, 'kleber') === 'kleber');
}

// ---------- d) KI: 2 Runden, nie festgeklebt ----------
const STUFEN = Object.keys(R.config.schwierigkeiten);
['fantasie', 'verrueckt'].forEach((welt) => {
  const s2 = new R.Strecke(fd, { welt });
  STUFEN.forEach((stufe) => {
    const start = s2.startpositionen(1)[0], v = new R.Vehicle({});
    v.setzen(start.x, start.z, start.heading);
    const rennen = new R.RaceManager(s2, [{ vehicle: v, name: 'KI', istSpieler: false }], { runden: 2, countdown: 0 });
    const d = new R.Driver(v, s2, { schwierigkeit: stufe, seed: 5, name: 'KI' });
    const t = rennen.teilnehmer[0], lp = R.Looping.zustand(), kz = K.zustand(), az = R.Anlauf.zustand();
    let index = -1, aufKleber = 0;
    for (let k = 0; k < 60 * 300 && !t.imZiel; k++) {
      let s = d.steuerung(dt, { andere: [], spielerFortschrittMax: null, eigenerFortschritt: t.fortschritt, laeuft: true });
      if (K.gesperrt(kz)) s = { gas: 0, bremse: 0, lenkung: 0 };
      const n = s2.abfrage(v.x, v.z, index);
      if (n.untergrund === 'kleber') aufKleber += dt;
      const r = R.Looping.fahrzeugSchritt(lp, v, s2, s, dt, index, az); index = r.index;
      if (!lp.aktiv && !lp.fallen) K.nachSchritt(kz, v, s2, n, dt);
      R.Kollisionen.bande(v, s2);
      rennen.schritt(dt);
    }
    pruefe(`KI ${welt}/${stufe}: 2 Runden, nie festgeklebt`, t.imZiel && kz.klebungen === 0, 'auf Kleber ' + aufKleber.toFixed(2) + ' s, Runde 2 ' + (t.rundenzeiten[1] || 0).toFixed(1) + ' s');
  });
});

console.log(fehler === 0 ? '\nALLE TESTS OK' : '\n' + fehler + ' FEHLER');
process.exit(fehler ? 1 : 0);
