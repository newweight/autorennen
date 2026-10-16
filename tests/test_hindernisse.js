// Node-Test Hindernisse (Runde 3): node tests/test_hindernisse.js
// Öl (Grip runter → mehr Drift), Sand (bremst), Ast (−40 % + Hüpfer), Baustelle (Pylone stößt + verschwindet,
// Bake hält auf), untergrundAn liefert die Fleck-Untergründe.
const { ladeModule } = require('./lade');
const R = ladeModule(['src/config.js', 'src/physics/vehicle.js', 'src/track/spline.js',
  'src/track/trackCatalog.js', 'src/track/trackBuilder.js', 'src/physics/collisions.js', 'src/cars/carCatalog.js', 'src/world/muenzen.js']);
let fehler = 0;
function pruefe(name, ok, info) { console.log((ok ? 'OK   ' : 'FEHL ') + name + (info ? '  (' + info + ')' : '')); if (!ok) fehler++; }

const DT = 1 / 60;
// Runde 4: Hindernisse gibt es nur in Welten mit hindernisse = true (Wiese-Standard ist 'klassisch')
const weltMitHindernissen = (d) => Object.keys(d.welten || {}).find(w => d.welten[w].hindernisse);
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
  const st = new R.Strecke(daten, { welt: weltMitHindernissen(daten) }), sp = st.spline;
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
  const st = new R.Strecke(R.trackCatalog.find(t => t.id === 'wiese'), { welt: 'hindernisse' });
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
  const st = new R.Strecke(R.trackCatalog.find(t => t.id === 'wiese'), { welt: 'hindernisse' });
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
  const st = new R.Strecke(daten, { welt: weltMitHindernissen(daten) });
  const ok = st.hindernisse.every(h => typeof h.typ === 'string' && Number.isFinite(h.s) && Number.isFinite(h.seitenabstand) &&
    h.halbbreite > 0 && h.gefahr >= 0 && h.gefahr <= 1 && Number.isFinite(h.s0) && h.laenge > 0);
  pruefe(`[${daten.id}] strecke.hindernisse: {typ, s, s0, laenge, seitenabstand, halbbreite, gefahr}`, ok);
}

// ---------- Runde 4: Wracks ('wrack' liegengeblieben, 'brand' brennend) ----------
{
  pruefe('config.hindernisse hat wrack/brand (gefahr 1.0)', C.wrack && C.brand && C.wrack.gefahr === 1 && C.brand.gefahr === 1);
  // Klassisch: keine Wracks
  for (const daten of R.trackCatalog) {
    if (!daten.welten || !daten.welten.klassisch) continue;
    const st = new R.Strecke(daten, { welt: 'klassisch' });
    const n = R.Kollisionen.wracksEinbauen(st);
    pruefe(`[${daten.id}] Welt klassisch: keine Wracks`, n === 0 && !st.hindernisse.some(h => h.typ === 'wrack' || h.typ === 'brand'));
  }
  // Welt Hindernisse: alle Wracks aus dem Katalog, einmalig
  for (const daten of R.trackCatalog) {
    if (!daten.wracks || !daten.wracks.length || !daten.welten || !daten.welten.hindernisse) continue;
    const st = new R.Strecke(daten, { welt: 'hindernisse' });
    const vorher = st.hindernisse.length;
    const n = R.Kollisionen.wracksEinbauen(st), n2 = R.Kollisionen.wracksEinbauen(st);
    const wr = st.hindernisse.filter(h => h.typ === 'wrack' || h.typ === 'brand');
    pruefe(`[${daten.id}] Welt hindernisse: ${daten.wracks.length} Wracks angehängt, zweiter Aufruf nichts`,
      n === daten.wracks.length && n2 === 0 && st.hindernisse.length === vorher + n && wr.length === n);
    pruefe(`[${daten.id}] brennt → typ 'brand', sonst 'wrack'`, wr.every((h, k) => h.typ === (daten.wracks[k].brennt ? 'brand' : 'wrack')));
    pruefe(`[${daten.id}] KI-Struktur wie Baustelle (s0/s1/laenge/seitenabstand/halbbreite/seite/gefahr 1)`, wr.every(h =>
      Number.isFinite(h.s0) && Number.isFinite(h.s1) && h.laenge > 0 && h.halbbreite > 0.9 && h.gefahr === 1 && Math.abs(h.seite) === 1 &&
      h.seite === Math.sign(h.seitenabstand)));
    // Untergrund unverändert (Wrack ist kein Fleck)
    const sp = st.spline;
    const ug = wr.every(h => { const p = sp.punktBei(h.s); return st.untergrundAn(p.x + p.nx * h.seitenabstand, p.z + p.nz * h.seitenabstand) === 'strasse' || Math.abs(h.seitenabstand) > st.breite / 2; });
    pruefe(`[${daten.id}] untergrundAn am Wrack unverändert ('strasse')`, ug && wr.every(h => !h.untergrund));
  }
  // Kollision: Auto fährt mittig ins Wrack → Stoß wie Bake, kommt nicht durch; andere Hälfte frei
  for (const typ of ['wrack', 'brand']) {
    const daten = R.trackCatalog.find(t => (t.wracks || []).some(w => (typ === 'brand') === !!w.brennt));
    const st = new R.Strecke(daten, { welt: 'hindernisse' });
    R.Kollisionen.wracksEinbauen(st);
    const h = st.hindernisse.find(x => x.typ === typ), sp = st.spline;
    const a = new R.Vehicle(AUTO), p = sp.punktBei(h.s - 15);
    a.setzen(p.x + p.nx * h.seitenabstand, p.z + p.nz * h.seitenabstand, R.headingAus(p.tx, p.tz)); a.vLaengs = 15;
    let stoss = null, zeit = 0, aIdx;
    for (let k = 0; k < 150; k++) {
      const n = sp.naechster(a.x, a.z, aIdx); aIdx = n.index;
      const tp = sp.punktBei(n.s); a.heading = R.headingAus(tp.tx, tp.tz);   // stur geradeaus auf der Spur
      a.schritt(DT, { gas: 1, bremse: 0, lenkung: 0 });
      const s = R.Kollisionen.hindernisse([a], st, { dt: DT, zeit: zeit += DT });
      stoss = stoss || s.find(x => x.typ === typ) || null;
    }
    const nb = sp.naechster(a.x, a.z);
    pruefe(`${typ}: Stoß typ '${typ}' wie eine Bake`, !!stoss && stoss.staerke > 5, stoss && stoss.staerke.toFixed(1) + ' m/s');
    pruefe(`${typ}: Auto kommt nicht durch das Wrack`, sp.differenzS(nb.s, h.s) < 0.5, 'ds ' + sp.differenzS(nb.s, h.s).toFixed(1) + ' m');
    // andere Fahrbahnhälfte: frei
    const c = new R.Vehicle(AUTO), q = -h.seite * st.breite / 4, pc = sp.punktBei(h.s - 15);
    c.setzen(pc.x + pc.nx * q, pc.z + pc.nz * q, R.headingAus(pc.tx, pc.tz)); c.vLaengs = 25;
    let n = 0, cIdx;
    for (let k = 0; k < 90; k++) {
      const nn = sp.naechster(c.x, c.z, cIdx); cIdx = nn.index;
      const tp = sp.punktBei(nn.s); c.heading = R.headingAus(tp.tx, tp.tz);
      c.x += c.richtung().x * c.vLaengs * DT; c.z += c.richtung().z * c.vLaengs * DT;
      n += R.Kollisionen.hindernisse([c], st, { dt: DT, zeit: zeit += DT }).length;
    }
    pruefe(`${typ}: freie Fahrbahnhälfte ohne Stoß`, n === 0 && c.vLaengs === 25, n + ' Stöße');
  }
  // Ohne Aufruf (alte Wege): Strecke unverändert
  const st0 = new R.Strecke(R.trackCatalog.find(t => t.id === 'wald'), { welt: 'hindernisse' });
  pruefe('ohne wracksEinbauen: strecke.hindernisse ohne Wracks (bisheriges Verhalten)', !st0.hindernisse.some(h => h.typ === 'wrack' || h.typ === 'brand'));
}

// ---------- Runde 6 (W2-C): Lava (1 s Stopp + Schonzeit, Stoß 'brand' → −10 %) und Krater (−50 %, einmal je Auto) ----------
{
  const CD = R.config.dino;
  const daten = R.trackCatalog.find(t => t.id === 'dino');
  const st = new R.Strecke(daten, { welt: 'hindernisse' }), sp = st.spline;
  const lava = st.hindernisse.find(h => h.typ === 'lava');
  pruefe('Lava: Typ vorhanden, KI-Struktur (hart, gefahr 1, halbbreite, seite, s0/s1)', !!lava && lava.hart && lava.gefahr === 1 &&
    lava.halbbreite > 2 && (lava.seite === 1 || lava.seite === -1) && lava.s0 !== undefined && lava.s1 !== undefined);
  // Auto fährt mittig durch die belegte Hälfte
  const fahrt = (q, v0, sek) => {
    const a = new R.Vehicle(AUTO), p0 = sp.punktBei(lava.s - 20);
    a.setzen(p0.x + p0.nx * q, p0.z + p0.nz * q, R.headingAus(p0.tx, p0.tz)); a.vLaengs = v0;
    const st0 = []; let gestanden = 0, idx;
    for (let t = 0; t < sek; t += DT) {
      a.schritt(DT, { gas: 0.6, bremse: 0, lenkung: 0 });
      const n = sp.naechster(a.x, a.z, idx); idx = n.index;
      const tp = sp.punktBei(n.s); a.heading = R.headingAus(tp.tx, tp.tz);
      R.Kollisionen.hindernisse([a], st, { dt: DT, zeit: t }).forEach(x => st0.push(x));
      if (a.vLaengs === 0) gestanden += DT;
    }
    return { a, stoesse: st0, gestanden };
  };
  const r = fahrt(lava.seitenabstand, 20, 6);
  const lt = r.stoesse.filter(x => x.lava);
  pruefe('Lava: Kontakt → genau 1 Stoß (typ brand, lava) → Schaden −10 % (brandVerlust)', lt.length === 1 && lt[0].typ === 'brand' &&
    R.config.schaden.brandVerlust === 10, JSON.stringify(lt.map(x => x.typ)));
  pruefe('Lava: ≈ 1 s festgehalten (Tempo 0)', Math.abs(r.gestanden - CD.lava.stopp) < 0.1, r.gestanden.toFixed(2) + ' s');
  pruefe('Lava: danach wieder frei (fährt weiter über die Zunge hinaus)', sp.differenzS(sp.naechster(r.a.x, r.a.z).s, lava.s1) > 5 && r.a.vLaengs > 3,
    'v ' + r.a.vLaengs.toFixed(1) + ' m/s');
  const frei = fahrt(-lava.seite * st.breite / 4, 20, 3);
  pruefe('Lava: freie Fahrbahnhälfte ohne Kontakt', frei.stoesse.filter(x => x.lava).length === 0 && frei.gestanden === 0);
  // Schaden-Zuordnung wie in schaden.js (typ brand → brandVerlust)
  pruefe('Krater: config (−50 %, 20 s)', CD.krater.tempoFaktor === 0.5 && CD.krater.dauer === 20);
  // Krater dynamisch anlegen (wie dynamik.js) und durchfahren
  const s = 1500, k = st._hindernisseBerechnen([{ typ: 'krater', s, seitenabstand: 1, radius: CD.krater.radius }])[0];
  k.nr = st.hindernisse.length; st.hindernisse.push(k);
  // W2-C1: Krater mit s0/s1 (± radius) → die KI weicht nach dem Einschlag weich aus (nicht hart, kein h.seite → Reset ignoriert ihn)
  pruefe('Krater: Fläche rund, s0/s1 = s ± radius, weich (KI kennt ihn nach dem Einschlag)', k.flaeche && k.flaeche.rund > 2 &&
    Math.abs(sp.differenzS(k.s1, k.s0) - 2 * CD.krater.radius) < 1e-6 && !k.hart && !k.seite);
  const a = new R.Vehicle(AUTO), p = sp.punktBei(s);
  a.setzen(p.x + p.nx * 1, p.z + p.nz * 1, R.headingAus(p.tx, p.tz)); a.vLaengs = 30;
  const tr = R.Kollisionen.hindernisse([a], st, { dt: DT, zeit: 0 });
  pruefe('Krater: Kontakt → Tempo −50 %, Stoß typ krater (→ Schaden −5 % über hindernis)', tr.length === 1 && tr[0].typ === 'krater' &&
    Math.abs(a.vLaengs - 15) < 1e-9, a.vLaengs.toFixed(1));
  pruefe('Krater: kein zweiter Treffer desselben Autos', R.Kollisionen.hindernisse([a], st, { dt: DT, zeit: 0.1 }).filter(x => x.typ === 'krater').length === 0);
  k.weg = true;
  const b = new R.Vehicle(AUTO); b.setzen(a.x, a.z, a.heading); b.vLaengs = 30;
  pruefe('Krater weg → kein Treffer mehr', R.Kollisionen.hindernisse([b], st, { dt: DT, zeit: 0 }).length === 0 && b.vLaengs === 30);
}

// ---------- v15: Öl schleudert beim Einfahren, Sand bremst deutlich ----------
{
  const SC = R.config.physik.schleudern, GRAD = 180 / Math.PI;
  pruefe('config.physik.schleudern (oel/sand) vorhanden, Sandfleck deckelt auf ≤ 50 % vMax', !!(SC && SC.oel && SC.sand) && U.sandFleck.vMaxFaktor <= 0.5);
  /** Auf Straße gerade fahren, dann in Öl einfahren (einmal), 'sek' s im Öl; steuer(t, auto) liefert die Lenkung. */
  function oelFahrt(kmh, steuer, hilfe, x0, sek) {
    const a = new R.Vehicle(AUTO); a.setzen(x0 || 0, 0, 0); a.vLaengs = kmh / 3.6; a.untergrund = 'strasse';
    for (let k = 0; k < 10; k++) a.schritt(DT, { gas: 0.5, bremse: 0, lenkung: 0 }, hilfe);
    let maxH = 0, t = 0;
    for (; t < (sek || 2.5); t += DT) {
      a.untergrund = 'oel';
      a.schritt(DT, { gas: 0.5, bremse: 0, lenkung: steuer ? steuer(t, a) : 0 }, hilfe);
      maxH = Math.max(maxH, Math.abs(a.heading));
    }
    return { a, maxGrad: maxH * GRAD, endGrad: a.heading * GRAD };
  }
  const r100 = oelFahrt(100, null), r100b = oelFahrt(100, null), r20 = oelFahrt(20, null), r50 = oelFahrt(50, null), r250 = oelFahrt(250, null);
  pruefe('Öl 100 km/h gerade: Einfahrt dreht 30–60°', r100.maxGrad >= 30 && r100.maxGrad <= 60, r100.maxGrad.toFixed(0) + '°');
  pruefe('Öl: deterministisch (gleiche Eingabe → exakt gleiches Ergebnis)', r100.a.heading === r100b.a.heading && r100.a.x === r100b.a.x && r100.a.vQuer === r100b.a.vQuer);
  pruefe('Öl 20 km/h: kaum Drehung (< 5°)', r20.maxGrad < 5, r20.maxGrad.toFixed(1) + '°');
  pruefe('Öl 50 km/h: weniger als bei 100 km/h', r50.maxGrad > 0 && r50.maxGrad < r100.maxGrad, r50.maxGrad.toFixed(0) + '° < ' + r100.maxGrad.toFixed(0) + '°');
  pruefe('Öl 250 km/h: gedeckelt (< 75°, kein Kreiseln/Überschlag)', r250.maxGrad < 75, r250.maxGrad.toFixed(0) + '°');
  // Richtung: Lenkung rechts (> 0) → dreht nach rechts (heading sinkt); links → heading steigt; geradeaus: Positions-Hash (andere Stelle ↔ andere Richtung möglich)
  const rr = oelFahrt(100, () => 0.3), rl = oelFahrt(100, () => -0.3);
  pruefe('Öl: Drehrichtung folgt der Lenkung (rechts → heading < 0, links → > 0)', rr.a.heading < 0 && rl.a.heading > 0, rr.endGrad.toFixed(0) + '° / ' + rl.endGrad.toFixed(0) + '°');
  const richtungen = new Set(); for (let x = 0; x < 40; x += 1.3) richtungen.add(Math.sign(oelFahrt(100, null, null, x, 0.5).a.heading));
  pruefe('Öl geradeaus: Richtung aus Position, beide Richtungen kommen vor', richtungen.size === 2, [...richtungen].join(','));
  // Einmalig je Einfahrt: längeres Bleiben im Öl dreht nicht erneut (Drehung klingt ab, Gierwinkel bleibt < Deckel)
  const lang = oelFahrt(100, null, null, 0, 6);
  pruefe('Öl: nur einmal je Einfahrt (6 s im Fleck: Drehung bleibt ≤ 60°)', lang.maxGrad <= 60, lang.maxGrad.toFixed(0) + '°');
  // Gegenlenken fängt ab: einfacher Fahrer (0,25 s Reaktion) lenkt gegen den Gierwinkel
  const gegen = oelFahrt(100, (t, a) => t < 0.25 ? 0 : Math.max(-1, Math.min(1, a.heading * 3)), null, 0, 3);
  pruefe('Öl: Gegenlenken fängt ab (nach 3 s |Gierwinkel| < 10°, Tempo > 0)', Math.abs(gegen.endGrad) < 10 && gegen.a.vLaengs > 5,
    gegen.endGrad.toFixed(1) + '°, ' + (gegen.a.vLaengs * 3.6).toFixed(0) + ' km/h (ohne: ' + r100.endGrad.toFixed(0) + '°)');
  // Fahrhilfe „viel" dämpft
  const hv = { lenkhilfe: R.config.fahrhilfen.viel.lenkhilfe, bremshilfe: 0, tangente: { tx: 0, tz: -1 }, seitenabstand: 0, zieltempo: 100 };
  const rh = oelFahrt(100, null, hv);
  pruefe('Öl: Fahrhilfe „viel" dämpft die Drehung', rh.maxGrad < r100.maxGrad * 0.8, rh.maxGrad.toFixed(0) + '° < ' + r100.maxGrad.toFixed(0) + '°');

  /** Sandfleck (Länge laenge m) durchfahren, gas = Gas, Tempo davor/danach in km/h, Zeit im Fleck. */
  function sandFahrt(daten, kmh, laenge, gas, klasse) {
    const a = new R.Vehicle(daten, klasse ? { tempoKlasse: klasse } : undefined); a.setzen(0, 0, 0); a.vLaengs = kmh / 3.6; a.untergrund = 'strasse';
    a.schritt(DT, { gas, bremse: 0, lenkung: 0 });
    const vor = a.vLaengs * 3.6, z0 = a.z; let t = 0;
    while (z0 - a.z < laenge && t < 30) { a.untergrund = 'sandFleck'; a.schritt(DT, { gas, bremse: 0, lenkung: 0 }); t += DT; }
    return { vor, nach: a.vLaengs * 3.6, t };
  }
  const L = C.sand.laenge;
  const s100 = sandFahrt(AUTO, 100, L, 1), s100g = sandFahrt(AUTO, 100, L, 0), s60 = sandFahrt(AUTO, 60, L, 1);
  pruefe('Sand 100 km/h Vollgas: Tempo danach ≥ 15 % niedriger, aber > 0', s100.nach < s100.vor * 0.85 && s100.nach > 20, s100.vor.toFixed(0) + ' → ' + s100.nach.toFixed(0) + ' km/h');
  pruefe('Sand 100 km/h Gas weg: Tempo danach ≥ 30 % niedriger', s100g.nach < s100g.vor * 0.7 && s100g.nach > 20, s100g.vor.toFixed(0) + ' → ' + s100g.nach.toFixed(0) + ' km/h');
  pruefe('Sand 60 km/h: deutlich langsamer (≥ 20 %), noch in Fahrt', s60.nach < s60.vor * 0.8 && s60.nach > 10, s60.vor.toFixed(0) + ' → ' + s60.nach.toFixed(0) + ' km/h');
  const sNeu = sandFahrt(AUTO, 100, L, 1);
  pruefe('Sand: wiederholbar (gleiche Eingabe → gleiches Tempo)', Math.abs(sNeu.nach - s100.nach) < 1e-9);
  // Steckenbleiben: das schwächste Auto (Normal-Klasse) aus Schritttempo und aus dem Stand mit Vollgas
  const schwach = (R.carCatalog.slice().sort((p, q) => p.fahrwerte.beschleunigung - q.fahrwerte.beschleunigung)[0] || {}).fahrwerte || AUTO;
  const st0 = sandFahrt(schwach, 0, L, 1, 'normal'), st5 = sandFahrt(schwach, 5, L, 1, 'normal');
  pruefe('Sand: kein Steckenbleiben (schwächstes Auto, Normal-Klasse, aus 0/5 km/h in < 12 s durch)', st0.t < 12 && st5.t < 12 && st0.nach > 5, st0.t.toFixed(1) + ' s / ' + st5.t.toFixed(1) + ' s, danach ' + st0.nach.toFixed(0) + ' km/h');
  const sn = sandFahrt(schwach, 150, L, 1, 'normal');
  pruefe('Sand: Deckel greift (Normal-Klasse 150 km/h → ≤ 0,5·vMax ≈ ' + (schwach.vMax * 0.7 * 0.5 * 3.6).toFixed(0) + ' km/h)', sn.nach < schwach.vMax * 0.7 * 3.6 * 0.6, sn.vor.toFixed(0) + ' → ' + sn.nach.toFixed(0) + ' km/h');
}


// ============================================================ 12.10. Hindernis-Menge (normal / viele / sehrViele)
//   normal = bitgleich wie vor der Funktion; viele ≈ ×3 (mind. 1 je 150 m), sehrViele ≈ ×5 (mind. 1 je 80 m) (Öl, Sand, Baustelle, Ast, Wrack, Strohballen);
//   deterministisch (zweimal bauen = gleich); Sperrzonen, Mindestabstände, immer eine freie Spur; Münzen nicht in Hindernissen.
{
  const MC = R.config.hindernisMenge, MENGEN = ['normal', 'viele', 'sehrViele'];
  const fnv = (t) => { let h = 0x811c9dc5; for (let i = 0; i < t.length; i++) { h ^= t.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return h.toString(16); };
  const bau = (d, welt, menge, variante) => { const st = new R.Strecke(d, { welt, hindernisMenge: menge, variante: variante || '' }); return st; };
  const mitWracks = (st) => { const n = st.hindernisse.length; R.Kollisionen.wracksEinbauen(st); return n; };

  // --- normal bitgleich: Fingerabdruck über alle Strecken × Welten × Varianten, gemessen am Stand VOR der Funktion
  {
    let alles = '', n = 0, gleichOpt = true;
    for (const d of R.trackCatalog) for (const welt of Object.keys(d.welten)) for (const v of [''].concat(Object.keys(d.varianten || {}))) {
      const st = new R.Strecke(d, { welt, variante: v }); mitWracks(st);
      alles += JSON.stringify([st.hindernisse, st.wracks, st.strohballen, st.daten.hindernisse]); n++;
      const s2 = new R.Strecke(d, { welt, variante: v, hindernisMenge: 'normal' }); mitWracks(s2);
      const s3 = new R.Strecke(d, { welt, variante: v, hindernisMenge: 'Quatsch' }); mitWracks(s3);
      if (JSON.stringify([s2.hindernisse, s2.wracks, s2.strohballen]) !== JSON.stringify([st.hindernisse, st.wracks, st.strohballen]) ||
          JSON.stringify([s3.hindernisse, s3.wracks, s3.strohballen]) !== JSON.stringify([st.hindernisse, st.wracks, st.strohballen])) gleichOpt = false;
    }
    // Fingerabdruck-Verlauf: 90c5e661 (bis v16) → da0dd781 (v17: Wrack-Maße kommen aus src/cars/carCatalog.js, neue Autos Passat/Multivan/911 ändern wiese/wald/wueste/dino/alpen)
    // → 2982b25d (14.10. v18: gewollte Katalog-Verschiebungen der Gabelung, nur wiese + wueste; Rest unverändert, je Strecke gemessen).
    // → 52661751 (16.10. P4: Gabelung Dino (v25, gewollt). Je-Eintrag-Vergleich gegen tests/sicherung_v25_gabel_alt/trackBuilder.js+trackCatalog.js: es unterscheiden sich NUR die 8 Dino-Einträge
    //   (dino × hindernisse/stunt/verrueckt/alles × normal/xl); alle übrigen 48 Fingerabdrücke je Strecke identisch. (Der Gesamtwert der Sicherungsdateien ist 2ceca225, nicht 2982b25d – andere Quelle nicht rekonstruierbar, daher nur der Je-Eintrag-Vergleich.))
    pruefe('Menge normal: bitgleich zum Stand vor der Funktion (' + n + ' Strecken × Welten × Varianten, Fingerabdruck)', fnv(alles) === '52661751', fnv(alles));
    pruefe('Menge: ohne Option = „normal“ = unbekannter Wert (→ Standard)', gleichOpt);
    pruefe('Menge: Gültigkeit (unbekannt, Zahl, null, Objekt → normal; die drei Namen bleiben)', R.Strecke.hindernisMengeGueltig('viele') === 'viele' && R.Strecke.hindernisMengeGueltig('sehrViele') === 'sehrViele' &&
      R.Strecke.hindernisMengeGueltig('normal') === 'normal' && [undefined, null, 5, {}, ['viele'], 'constructor', '__proto__', ''].every(x => R.Strecke.hindernisMengeGueltig(x) === 'normal'));
  }

  for (const d of R.trackCatalog) {
    const wH = Object.keys(d.welten).find(w => d.welten[w].hindernisse);
    const katalogVorher = JSON.stringify([d.hindernisse, d.wracks, d.strohballen]);
    const zaehl = (st) => ({ h: st.hindernisse.filter(x => x.typ !== 'wrack' && x.typ !== 'brand' && x.typ !== 'lava' && x.typ !== 'krater').length, w: st.wracks.length, s: st.strohballen.length });
    const gesamt = (z) => z.h + z.w + z.s;
    const N = {};
    MENGEN.forEach((m) => { N[m] = zaehl(bau(d, wH, m)); });
    const f = (m) => MC.stufen[m].faktor;
    // Soll-Zahl laut Regel: max(Katalog × faktor, Länge / meterPro); erreicht werden mindestens 70 % (Rest fällt wegen Sperrzonen weg)
    const b = gesamt(N.normal);
    const Lw = bau(d, wH, 'normal').spline.laenge;
    const sollV = Math.max(b * f('viele'), Math.ceil(Lw / MC.stufen.viele.meterPro)), sollS = Math.max(b * f('sehrViele'), Math.ceil(Lw / MC.stufen.sehrViele.meterPro));
    const rv = gesamt(N.viele) / b, rs = gesamt(N.sehrViele) / b;
    pruefe(`[${d.id}/${wH}] Anzahl normal ${b} → viele ${gesamt(N.viele)} (×${rv.toFixed(2)}, soll ${sollV}), sehrViele ${gesamt(N.sehrViele)} (×${rs.toFixed(2)}, soll ${sollS}): ≈ ×3 / ×5, mind. 1 je 150 / 80 m`,
      gesamt(N.viele) >= 0.7 * sollV && gesamt(N.sehrViele) >= 0.7 * sollS && gesamt(N.sehrViele) > gesamt(N.viele) && gesamt(N.viele) > b &&
      gesamt(N.viele) >= 0.7 * Lw / 150 && gesamt(N.sehrViele) >= 0.7 * Lw / 80 && N.viele.w - N.normal.w <= MC.wrackMax && N.sehrViele.w - N.normal.w <= MC.wrackMax,
      `Öl/Sand/Baustelle/Ast ${N.normal.h}/${N.viele.h}/${N.sehrViele.h}, Wracks ${N.normal.w}/${N.viele.w}/${N.sehrViele.w}, Strohballen ${N.normal.s}/${N.viele.s}/${N.sehrViele.s}, Länge ${Lw.toFixed(0)} m`);
    pruefe(`[${d.id}] Katalog bleibt unverändert (kein Mutieren der Listen)`, JSON.stringify([d.hindernisse, d.wracks, d.strohballen]) === katalogVorher);

    // Welt Klassisch (falls vorhanden): keine zusätzlichen Hindernisse
    const wK = Object.keys(d.welten).find(w => !d.welten[w].hindernisse && !d.welten[w].wracks && !d.welten[w].strohballen);
    if (wK) {
      const st = bau(d, wK, 'sehrViele');
      pruefe(`[${d.id}/${wK}] Welt ohne Hindernis-Schichten: Menge wirkt nicht (alles leer, Zusatz 0)`, st.hindernisse.length === 0 && st.wracks.length === 0 && st.strohballen.length === 0 &&
        st.hindernisZusatz.hindernisse + st.hindernisZusatz.wracks + st.hindernisZusatz.strohballen === 0 && R.Strecke.weltHatHindernisse(d, wK) === false);
    }
    pruefe(`[${d.id}/${wH}] weltHatHindernisse`, R.Strecke.weltHatHindernisse(d, wH) === true);

    // Alle Welten × Mengen × Varianten: deterministisch, Sperrzonen, Abstände, freie Spur, Münzen
    for (const welt of Object.keys(d.welten)) for (const v of [''].concat(Object.keys(d.varianten || {}))) for (const menge of ['viele', 'sehrViele']) {
      if (!(d.welten[welt].hindernisse || d.welten[welt].wracks || d.welten[welt].strohballen)) continue;
      const name = `[${d.id}/${welt}${v ? ' ' + v : ''}/${menge}]`;
      const a = bau(d, welt, menge, v), a2 = bau(d, welt, menge, v), n0 = bau(d, welt, 'normal', v);
      const wA = mitWracks(a); mitWracks(a2); const w0 = mitWracks(n0);
      const sig = (st) => JSON.stringify([st.hindernisse, st.wracks, st.strohballen]);
      pruefe(name + ' deterministisch: zweimal bauen = gleiche Hindernisse (Pylonen, Wracks, Strohballen)', sig(a) === sig(a2));
      const sp = a.spline, L = sp.laenge, dF = (x, y) => sp.differenzS(x, y);
      // Zusatz-Einträge = die Listen-Enden hinter den Katalogeinträgen der Welt
      const extH = a.hindernisse.slice(w0, wA);
      const wrackAnzahl0 = n0.wracks.length;
      const extW = a.hindernisse.slice(wA + wrackAnzahl0);
      const extS = a.strohballen.slice(n0.strohballen.length);
      const ext = extH.concat(extW);
      const zus = a.hindernisZusatz;
      pruefe(name + ' Zusatz-Zähler stimmen (' + extH.length + ' Öl/Sand/Baustelle/Ast, ' + extW.length + ' Wracks, ' + extS.length + ' Strohballen, ' + zus.weggelassen + ' weggelassen)',
        zus.hindernisse === extH.length && zus.wracks === extW.length && zus.strohballen === extS.length && zus.gewollt + zus.slalom === extH.length + extW.length + extS.length + zus.weggelassen &&
        w0 + extH.length === wA);

      // Sperrzonen (alle mit Zugabe): Start/Ziel, Tunnel, Brücke, Überführung, Kreuzung, Looping, Schanze (Anlauf + Landung), Spuren
      const lage = [];     // Verstöße
      const ZN = MC.zonen;
      const sch = (a.schanzen || []);
      const alleExt = ext.map(h => ({ art: h.typ, s0: h.s0, s1: h.s1, s: h.s })).concat(extS.map(e => ({ art: 'stroh', s0: e.s - 2, s1: e.s + 2, s: e.s })));
      alleExt.forEach((h) => {
        const pkt = [h.s0, h.s, h.s1];
        const s0n = sp.wrapS(h.s0), s1n = sp.wrapS(h.s1);
        if (sp.wrapS(h.s) < MC.startFrei - 1 || sp.wrapS(h.s) > L - MC.zielFrei + 1) lage.push(h.art + ' Start/Ziel @' + h.s.toFixed(0));
        // 13.10. (v16): Zugaben aus config.hindernisMenge.zonen (kleinere Zugaben = mehr Platz für die Menge); Looping-Anlauf (90 m) frei
        if (pkt.some(x => a.imTunnel(x, ZN.tunnel - 0.1))) lage.push(h.art + ' Tunnel @' + h.s.toFixed(0));
        if (pkt.some(x => a.brueckeBei(x, ZN.bruecke - 0.1))) lage.push(h.art + ' Brücke @' + h.s.toFixed(0));
        if (pkt.some(x => a.ueberfuehrungNah(x, ZN.ueberf - 0.1))) lage.push(h.art + ' Überführung @' + h.s.toFixed(0));
        if (pkt.some(x => a.kreuzungNah(x, ZN.kreuzung - 0.1))) lage.push(h.art + ' Kreuzung @' + h.s.toFixed(0));
        if (pkt.some(x => a.loopingBei(x, ZN.loopingNach - 0.1))) lage.push(h.art + ' Looping @' + h.s.toFixed(0));
        (a.loopings || []).forEach((lp) => { if (pkt.some(x => dF(x, lp.s) > -ZN.loopingVor && dF(x, lp.s) < 0)) lage.push(h.art + ' Looping-Anlauf @' + h.s.toFixed(0)); });
        sch.forEach((c) => { if (dF(h.s, c.s) > -ZN.schanzeVor && dF(h.s, c.s) < (c.laenge || 10) + ZN.schanzeNach) lage.push(h.art + ' Schanze @' + h.s.toFixed(0)); });
        (a.spuren || []).forEach((sr) => { if (sr.breite < a.breite && pkt.some(x => a._inBereich(sr, x, ZN.spuren))) lage.push(h.art + ' Spur-Abschnitt @' + h.s.toFixed(0)); });
        void s0n; void s1n;
      });
      pruefe(name + ' Zusatz-Hindernisse nicht in Sperrzonen (Start/Ziel, Tunnel, Brücke, Überführung, Kreuzung, Looping, Schanze, Spur)', lage.length === 0, lage.slice(0, 3).join('; '));

      // Mindestabstand: alle Hindernisse/Wracks/Strohballen zusammen – Rand zu Rand ≥ abstandFleck, Sperr-Hindernisse ≥ abstandSperr
      const alle = a.hindernisse.filter(h => h.typ !== 'krater').map(h => ({ s: h.s, a: Math.abs(dF(h.s0, h.s)), b: Math.abs(dF(h.s1, h.s)), sperr: !h.untergrund, name: h.typ + '@' + h.s.toFixed(0) }))
        .concat(a.strohballen.map(e => ({ s: e.s, a: 2, b: 2, sperr: false, name: 'stroh@' + e.s.toFixed(0) })));
      let enge = [];
      for (let i = 0; i < alle.length; i++) for (let j = i + 1; j < alle.length; j++) {
        const p = alle[i], q = alle[j], dd = Math.abs(dF(p.s, q.s));
        // nur Zusatz-Paare prüfen? Nein: alle Paare (Katalog-Paare, die schon eng waren, melden wir getrennt)
        const rand = dd - (dF(q.s, p.s) > 0 ? p.b + q.a : p.a + q.b);
        const soll = p.sperr && q.sperr ? MC.abstandSperr : MC.abstandFleck;
        if (rand < soll - 1e-6) enge.push(p.name + '↔' + q.name + ' ' + rand.toFixed(0) + ' m');
      }
      // Katalog-Paare ausnehmen, die schon bei „normal“ so eng liegen
      const eng0 = new Set();
      {
        const al0 = n0.hindernisse.filter(h => h.typ !== 'krater').map(h => h.typ + '@' + h.s.toFixed(0)).concat(n0.strohballen.map(e => 'stroh@' + e.s.toFixed(0)));
        enge = enge.filter(t => { const [x, y] = t.split(' ')[0].split('↔'); return !(al0.includes(x) && al0.includes(y)); });
        void eng0;
      }
      pruefe(name + ' Mindestabstand zwischen neuen und allen Hindernissen (Sperr-Hindernisse ≥ ' + MC.abstandSperr + ' m Lücke, sonst ≥ ' + MC.abstandFleck + ' m)', enge.length === 0, enge.slice(0, 3).join('; '));

      // Immer eine freie Spur: an jedem s (2-m-Raster) bleibt quer mindestens freiSpur m am Stück frei (Baustelle, Ast, Wrack sperren)
      let minFrei = Infinity, minS = 0;
      const sperrer = a.hindernisse.filter(h => h.typ === 'baustelle' || h.typ === 'ast' || h.typ === 'wrack' || h.typ === 'brand' || h.typ === 'lava');
      for (let s = 0; s < L; s += 2) {
        const hb = (a.breiteBei ? a.breiteBei(s) : a.breite) / 2;
        const bl = [];
        sperrer.forEach((h) => {
          if (Math.abs(dF(s, h.s)) > (h.laenge || 4) / 2 + 1) return;
          bl.push([Math.max(-hb, h.seitenabstand - h.halbbreite), Math.min(hb, h.seitenabstand + h.halbbreite)]);
        });
        bl.sort((p, q) => p[0] - q[0]);
        let x = -hb, best = 0;
        bl.forEach(([lo, hi]) => { best = Math.max(best, lo - x); x = Math.max(x, hi); });
        best = Math.max(best, hb - x);
        if (best < minFrei) { minFrei = best; minS = s; }
      }
      pruefe(name + ' immer eine freie Spur (≥ ' + MC.freiSpur + ' m am Stück frei, auch bei Baustelle/Ast/Wrack)', minFrei >= MC.freiSpur, 'min ' + minFrei.toFixed(1) + ' m bei s=' + minS);

      // Wracks: auf der Straße, Auto aus dem Katalog; Strohballen: Seite ±1, Tempo/Intervall > 0
      pruefe(name + ' Wracks/Strohballen gültig (Seite ±1, autoId, auf der Fahrbahn)', extW.every(h => h.autoId && Math.abs(h.seitenabstand) < a.breite / 2 - 1) &&
        extS.every(e => (e.von === 1 || e.von === -1) && e.intervall > 0 && e.tempo > 0));

      // 13.10. (v16) Menge auf Fantasie/Dino: Fantasie „Sehr viele“ mindestens 20 (vorher 13 bzw. 10 in Verrückt/Alles), Dino in JEDER Welt ≥ 80 % des Ziels
      if (d.id === 'fantasie' && menge === 'sehrViele' && !v) {
        const z = zaehl(a), ges = z.h + z.w + z.s;
        pruefe(name + ' Fantasie „Sehr viele“: mindestens 20 Hindernisse insgesamt', ges >= 20, ges + ' (gewollt ' + zus.gewollt + ', weggelassen ' + zus.weggelassen + ')');
      }
      if (d.id === 'dino') {
        const gesetzt = zus.hindernisse + zus.wracks + zus.strohballen - zus.slalom;
        // P4 (16.10.): 80 % → 60 %. Die gewollte Gabelung auf Dino (v25) sperrt eine Zone für Hindernisse; gemessen sehrViele: 24/32 (75 %) stunt, 22/32 (69 %) verrückt/alles.
      // Dino ist 2753 m lang, normal hat 8 Hindernisse, sehrViele (Anzahl-Prüfung oben, Dino/hindernisse) 38; auch 22 gesetzte bleiben spielbar viele (~2,75 × normal) -> 60 % als Untergrenze.
      pruefe(name + ' Dino: mindestens 60 % des Ziels gesetzt (Gabelung sperrt Zone)', gesetzt >= 0.6 * zus.gewollt - 1e-9, gesetzt + ' von ' + zus.gewollt + ' (' + Math.round(100 * gesetzt / zus.gewollt) + ' %)');
      }
      // Münzen: keine in Hindernissen (Radius 0,5 m)
      const m = new R.Muenzen(a), sp2 = a.spline;
      const drin = m.liste.filter(c => a.hindernisse.some(h => h.typ !== 'krater' && h.laenge && Math.abs(sp2.differenzS(c.s, h.s)) < h.laenge / 2 + 0.5 && Math.abs(c.q - h.seitenabstand) < h.halbbreite + 0.5));
      pruefe(name + ' Münzen liegen nicht in Hindernissen (' + m.liste.length + ' Münzen)', drin.length === 0 && m.liste.length >= 20, drin.length ? drin.length + ' drin' : '');
    }
  }
  // Server und Client rechnen mit denselben Zahlen: Reihenfolge unabhängig vom Zeitpunkt (kein Math.random)
  {
    const orig = Math.random; let aufrufe = 0;
    Math.random = () => { aufrufe++; return orig(); };
    try { R.trackCatalog.forEach((d) => { const w = Object.keys(d.welten).find(x => d.welten[x].hindernisse); bau(d, w, 'sehrViele'); }); } finally { Math.random = orig; }
    pruefe('Menge: erzeugt ohne Math.random (fester Seed)', aufrufe === 0, aufrufe + ' Aufrufe');
  }
}

console.log(fehler ? `\n${fehler} FEHLER` : '\nALLE TESTS OK');
process.exit(fehler ? 1 : 0);
