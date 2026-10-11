// Node-Test Hindernisse (Runde 3): node tests/test_hindernisse.js
// Öl (Grip runter → mehr Drift), Sand (bremst), Ast (−40 % + Hüpfer), Baustelle (Pylone stößt + verschwindet,
// Bake hält auf), untergrundAn liefert die Fleck-Untergründe.
const { ladeModule } = require('./lade');
const R = ladeModule(['src/config.js', 'src/physics/vehicle.js', 'src/track/spline.js',
  'src/track/trackCatalog.js', 'src/track/trackBuilder.js', 'src/physics/collisions.js']);
let fehler = 0;
function pruefe(name, ok, info) { console.log((ok ? 'OK   ' : 'FEHL ') + name + (info ? '  (' + info + ')' : '')); if (!ok) fehler++; }

const DT = 1 / 60;
const AUTO = (R.carCatalog && R.carCatalog[0] && R.carCatalog[0].fahrwerte) || {};
const C = R.config.hindernisse;
const U = R.config.physik.untergrund;

// ---------- Konfiguration ----------
pruefe('config.hindernisse hat oel/sand/baustelle/ast', ['oel', 'sand', 'baustelle', 'ast'].every(k => C[k]));
pruefe('Untergründe für Öl/Sand in physik.untergrund', !!U[C.oel.untergrund] && !!U[C.sand.untergrund],
  C.oel.untergrund + ' grip ' + (U[C.oel.untergrund] || {}).grip + ', ' + C.sand.untergrund + ' grip ' + (U[C.sand.untergrund] || {}).grip);

/** Auto mit Tempo v auf Untergrund ug fahren lassen (feste Steuerung), liefert das Auto. */
function fahre(ug, v0, sek, steuer) {
  const a = new R.Vehicle(AUTO);
  a.setzen(0, 0, 0); a.vLaengs = v0; a.untergrund = ug;
  let maxQuer = 0;
  for (let t = 0; t < sek; t += DT) { a.schritt(DT, steuer); maxQuer = Math.max(maxQuer, Math.abs(a.vQuer)); }
  a.maxQuer = maxQuer;
  return a;
}

// ---------- Öl: weniger Grip → Lenkung wirkt schwächer, Auto rutscht mehr ----------
{
  const lenk = { gas: 0.5, bremse: 0, lenkung: 1 };
  const s = fahre('strasse', 30, 1.0, lenk), o = fahre(C.oel.untergrund, 30, 1.0, lenk);
  pruefe('Öl: Auto dreht weniger (Lenkung wirkt schwach)', Math.abs(o.heading) < Math.abs(s.heading) * 0.9,
    'Straße ' + Math.abs(s.heading).toFixed(2) + ' rad, Öl ' + Math.abs(o.heading).toFixed(2) + ' rad');
  pruefe('Öl: Auto driftet stärker (Querrutschen)', o.maxQuer > s.maxQuer * 1.3 + 0.1,
    'Straße ' + s.maxQuer.toFixed(2) + ' m/s, Öl ' + o.maxQuer.toFixed(2) + ' m/s');
  const g = fahre(C.oel.untergrund, 40, 0.5, { gas: 0, bremse: 0, lenkung: 0 });
  pruefe('Öl: kein starkes Abbremsen beim Geradeausrollen (kein Tempodeckel)', g.vLaengs > 36, g.vLaengs.toFixed(1) + ' m/s nach 0,5 s');
}

// ---------- Sand: bremst ----------
{
  const s = fahre('strasse', 40, 1.0, { gas: 0, bremse: 0, lenkung: 0 }), f = fahre(C.sand.untergrund, 40, 1.0, { gas: 0, bremse: 0, lenkung: 0 });
  pruefe('Sand: Auto wird langsamer als auf der Straße', f.vLaengs < s.vLaengs - 2, 'Straße ' + s.vLaengs.toFixed(1) + ', Sand ' + f.vLaengs.toFixed(1) + ' m/s');
  const gs = fahre('strasse', 40, 1.0, { gas: 1, bremse: 0, lenkung: 0 }), gf = fahre(C.sand.untergrund, 40, 1.0, { gas: 1, bremse: 0, lenkung: 0 });
  pruefe('Sand: auch mit Vollgas langsamer', gf.vLaengs < gs.vLaengs - 1, 'Straße ' + gs.vLaengs.toFixed(1) + ', Sand ' + gf.vLaengs.toFixed(1) + ' m/s');
}

// ---------- untergrundAn auf allen Strecken ----------
for (const daten of R.trackCatalog) {
  const st = new R.Strecke(daten), sp = st.spline;
  for (const h of st.hindernisse.filter(x => x.untergrund)) {
    const p = sp.punktBei(h.s);
    const an = (ds, q) => { const pp = sp.punktBei(h.s + ds); return st.untergrundAn(pp.x + pp.nx * q, pp.z + pp.nz * q); };
    const innen = an(0, h.seitenabstand) === h.untergrund && an(h.halblaenge * 0.6, h.seitenabstand) === h.untergrund;
    const qDaneben = h.seitenabstand > 0 ? h.seitenabstand - h.halbbreite - 0.8 : h.seitenabstand + h.halbbreite + 0.8;
    const daneben = an(0, qDaneben), davor = an(-h.halblaenge - 1.5, h.seitenabstand);
    pruefe(`[${daten.id}] ${h.typ}@${Math.round(h.s)}: innen '${h.untergrund}', daneben/davor 'strasse'`,
      innen && daneben === 'strasse' && davor === 'strasse', daneben + '/' + davor);
    void p;
  }
}

// ---------- Ast: Tempo −40 %, Hüpfer, danach kurz Ruhe ----------
{
  const st = new R.Strecke(R.trackCatalog.find(t => t.id === 'wiese'));
  const h = st.hindernisse.find(x => x.typ === 'ast'), sp = st.spline;
  const a = new R.Vehicle(AUTO);
  const p = sp.punktBei(h.s - 6);
  a.setzen(p.x + p.nx * h.seitenabstand, p.z + p.nz * h.seitenabstand, R.headingAus(p.tx, p.tz));
  a.vLaengs = 25;
  let stoss = null, vorher = 0, zeit = 0, nachher = 0;
  for (let k = 0; k < 60 && !stoss; k++) {
    vorher = a.vLaengs;
    a.x += a.richtung().x * a.vLaengs * DT; a.z += a.richtung().z * a.vLaengs * DT;   // nur rollen (ohne Fahrphysik)
    const s = R.Kollisionen.hindernisse([a], st, { dt: DT, zeit: zeit += DT });
    if (s.length) { stoss = s[0]; nachher = a.vLaengs; }
  }
  pruefe('Ast: Kontakt wird erkannt (Stoß-Liste)', !!stoss && stoss.typ === 'ast' && stoss.staerke > 0, stoss && JSON.stringify(stoss));
  pruefe('Ast: Tempo −40 %', stoss && Math.abs(nachher / vorher - 0.6) < 0.01, (nachher / vorher).toFixed(3));
  pruefe('Ast: Hüpfer (vehicle.huepfer > 0)', a.huepfer > 0, a.huepfer);
  const v2 = a.vLaengs;
  const s2 = R.Kollisionen.hindernisse([a], st, { dt: DT, zeit: zeit += DT });
  pruefe('Ast: im nächsten Schritt kein zweiter Stoß (Sperrzeit)', s2.length === 0 && a.vLaengs === v2);
  // Auf der anderen Fahrbahnhälfte: kein Kontakt
  const b = new R.Vehicle(AUTO), q = -h.seitenabstand;
  const pb = sp.punktBei(h.s);
  b.setzen(pb.x + pb.nx * q, pb.z + pb.nz * q, R.headingAus(pb.tx, pb.tz)); b.vLaengs = 25;
  pruefe('Ast: freie Fahrbahnhälfte ohne Kontakt', R.Kollisionen.hindernisse([b], st, { dt: DT }).length === 0 && b.vLaengs === 25);
}

// ---------- Baustelle: Pylone stößt und verschwindet, Bake hält auf ----------
{
  const st = new R.Strecke(R.trackCatalog.find(t => t.id === 'wiese'));
  const h = st.hindernisse.find(x => x.typ === 'baustelle'), sp = st.spline;
  // a) Auto fährt auf der gesperrten Seite in die Pylonen-Schräge
  const a = new R.Vehicle(AUTO);
  const p = sp.punktBei(h.s0 - 10);
  a.setzen(p.x + p.nx * h.seitenabstand, p.z + p.nz * h.seitenabstand, R.headingAus(p.tx, p.tz));
  a.vLaengs = 20;
  let pylonStoss = null, vorher = 0, nachher = 0, zeit = 0;
  for (let k = 0; k < 120 && !pylonStoss; k++) {
    vorher = a.vLaengs;
    a.schritt(DT, { gas: 0.3, bremse: 0, lenkung: 0 });
    const s = R.Kollisionen.hindernisse([a], st, { dt: DT, zeit: zeit += DT });
    pylonStoss = s.find(x => x.typ === 'pylone') || null;
    if (pylonStoss) nachher = a.vLaengs;
  }
  const weg = h.pylonen.filter(x => x.weg);
  pruefe('Baustelle: Pylone wird angefahren (Stoß)', !!pylonStoss && pylonStoss.staerke > 0, pylonStoss && JSON.stringify(pylonStoss));
  pruefe('Baustelle: Pylone bremst das Auto (Tempo × ' + C.baustelle.pylonTempo + ')', pylonStoss && nachher < vorher * 0.95, vorher.toFixed(1) + ' → ' + nachher.toFixed(1));
  pruefe('Baustelle: Pylone ist weg (umgefahren, merkt Verursacher + Zeit)', weg.length >= 1 && weg[0].von === 0 && weg[0].wegZeit > 0, weg.length + ' weg');
  pruefe('Baustelle: Strecke meldet Änderung für die Grafik', st.pylonenGeaendert === true);
  const nochmal = R.Kollisionen.hindernisse([a], st, { dt: DT, zeit }).filter(x => x.typ === 'pylone' && weg.includes(h.pylonen[x.hindernis]));
  pruefe('Baustelle: umgefallene Pylone stößt nicht noch einmal', nochmal.length === 0);
  pruefe('Baustelle: pylonenZurueck(nr anderer) stellt nichts auf', st.pylonenZurueck(3) === 0 && h.pylonen.some(x => x.weg));
  pruefe('Baustelle: pylonenZurueck(Verursacher) stellt wieder auf (Rundenende)', st.pylonenZurueck(0) === weg.length && h.pylonen.every(x => !x.weg));

  // b) Auto steht direkt vor der Bake und fährt hinein: kommt nicht durch, Tempo weg
  const b = new R.Vehicle(AUTO);
  const pb = sp.punktBei(h.sperrS - 4);
  const qb = h.seite * (st.breite / 2) * 0.7;
  b.setzen(pb.x + pb.nx * qb, pb.z + pb.nz * qb, R.headingAus(pb.tx, pb.tz));
  b.vLaengs = 15;
  let bake = null;
  for (let k = 0; k < 90; k++) {
    b.schritt(DT, { gas: 1, bremse: 0, lenkung: 0 });
    const s = R.Kollisionen.hindernisse([b], st, { dt: DT, zeit: zeit += DT });
    bake = bake || s.find(x => x.typ === 'bake') || null;
  }
  const nb = sp.naechster(b.x, b.z);
  pruefe('Baustelle: Bake stößt wie eine Bande', !!bake && bake.staerke > 5, bake && bake.staerke.toFixed(1) + ' m/s');
  pruefe('Baustelle: Auto kommt nicht durch die Bake', sp.differenzS(nb.s, h.sperrS) < 0.8, 's ' + nb.s.toFixed(1) + ' vs Bake ' + h.sperrS.toFixed(1));
  pruefe('Baustelle: Auto steht fast (Tempo < 5 m/s)', Math.abs(b.vLaengs) < 5, b.vLaengs.toFixed(1));

  // c) offene Fahrbahnhälfte: freie Fahrt durch die ganze Baustelle
  const c = new R.Vehicle(AUTO);
  const pc = sp.punktBei(h.s0 - 10), qc = -h.seite * (st.breite / 4);
  c.setzen(pc.x + pc.nx * qc, pc.z + pc.nz * qc, R.headingAus(pc.tx, pc.tz)); c.vLaengs = 25;
  let stoesse = 0, cIndex;
  for (let k = 0; k < 150; k++) {
    // auf der Spur halten: Heading = Tangente (Strecke ist dort gerade)
    const n = sp.naechster(c.x, c.z, cIndex); cIndex = n.index;
    const tp = sp.punktBei(n.s); c.heading = R.headingAus(tp.tx, tp.tz);
    c.x += c.richtung().x * c.vLaengs * DT; c.z += c.richtung().z * c.vLaengs * DT;
    stoesse += R.Kollisionen.hindernisse([c], st, { dt: DT, zeit: zeit += DT }).length;
  }
  pruefe('Baustelle: offene Hälfte ohne Stoß befahrbar', stoesse === 0 && c.vLaengs === 25, stoesse + ' Stöße');

  // d) Countdown: keine Kollisionen
  const d = new R.Vehicle(AUTO);
  d.setzen(h.pylonen[0].x, h.pylonen[0].z, 0);
  pruefe('Countdown: keine Hindernis-Stöße', R.Kollisionen.hindernisse([d], st, { countdown: true }).length === 0);
}

// ---------- Datenstruktur für die KI ----------
for (const daten of R.trackCatalog) {
  const st = new R.Strecke(daten);
  const ok = st.hindernisse.every(h => typeof h.typ === 'string' && Number.isFinite(h.s) && Number.isFinite(h.seitenabstand) &&
    h.halbbreite > 0 && h.gefahr >= 0 && h.gefahr <= 1 && Number.isFinite(h.s0) && h.laenge > 0);
  pruefe(`[${daten.id}] strecke.hindernisse: {typ, s, s0, laenge, seitenabstand, halbbreite, gefahr}`, ok);
}

console.log(fehler ? `\n${fehler} FEHLER` : '\nALLE TESTS OK');
process.exit(fehler ? 1 : 0);
