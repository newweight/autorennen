// Node-Test für Bande, Auto-Auto-Kollisionen und Fahrhilfen: node tests/test_kollisionen.js
const { ladeModule } = require('./lade');
const R = ladeModule(['src/config.js', 'src/physics/vehicle.js', 'src/physics/collisions.js',
  'src/track/spline.js', 'src/track/trackCatalog.js', 'src/track/trackBuilder.js']);
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
  pruefe('An der Bande kein Hängenbleiben (fährt weiter)', endTempo.every(t => t > 1), endTempo.map(t => t.toFixed(1)).join(', ') + ' m/s');
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
console.log(fehler === 0 ? '\nALLE TESTS OK' : '\n' + fehler + ' FEHLER');
process.exit(fehler ? 1 : 0);
