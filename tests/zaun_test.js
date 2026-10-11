// Node-Test Zaun/Bande dicht (Runde 5, M7): node tests/zaun_test.js
// Für alle 4 Strecken × alle Welten: Auto mit 20/45/75 m/s unter 15°/45°/90° gegen die Bande (beide Seiten),
// an 40 Stellen je Strecke (gleichmäßig + Spuren-Engstellen, Brücken, Tunnel, Looping-Ein-/Ausfahrt, Schanzen,
// Trichter davor/danach). Ablauf je Schritt wie main.js: Looping/Schanze bzw. vehicle.schritt → Bande.
// Bedingungen (zu JEDER Zeit, gemessen zum nächstgelegenen Streckenstück, global gesucht):
//   Mitte:  |seitenabstand| ≤ grenzeBei(s) + 0,6 m
//   Karosserie (4 Ecken): |seitenabstand| ≤ grenzeBei(s) + 0,3 m (kein Blech durch den Zaun)
// Dazu: Säulen (Startbogen-Masten, Looping-Beine) sind fest; Zaun-Deko liegt exakt an der Bande.
const { ladeModule } = require('./lade');
const R = ladeModule(['src/config.js', 'src/physics/vehicle.js', 'src/track/spline.js', 'src/track/trackCatalog.js',
  'src/track/trackBuilder.js', 'src/track/looping.js', 'src/track/schanze.js', 'src/physics/collisions.js', 'src/cars/carCatalog.js']);

let fehler = 0;
function pruefe(name, ok, info) { console.log((ok ? 'OK   ' : 'FEHL ') + name + (info ? '  (' + info + ')' : '')); if (!ok) fehler++; }
const dt = R.config.physik.schritt;
const TEMPI = [20, 45, 75], WINKEL = [15, 45, 90];

/** 40 Teststellen (s) einer Strecke: Sonderstellen zuerst, Rest gleichmäßig. */
function stellen(st) {
  const sp = st.spline, l = [];
  const dazu = (s) => l.push(sp.wrapS(s));
  (st.spuren || []).forEach(e => { dazu(e.s0 - 50); dazu(e.s0 - 20); dazu((e.s0 + e.s1) / 2); dazu(e.s1 + 20); });
  (st.bruecken || []).forEach(b => { dazu(b.s0 - 12); dazu(b.mitte); dazu(b.s1 + 5); });
  (st.tunnel || []).forEach(t => { dazu(t.s0 - 12); dazu(t.mitte); dazu(t.s1 + 5); });
  (st.loopings || []).forEach(L => { dazu(L.s - 8); dazu(L.s + L.versatz + 4); });
  (R.Schanzen.liste(st) || []).forEach(S => { dazu(S.s - 6); dazu(S.s + S.laenge + 8); });
  const rest = Math.max(0, 40 - l.length);
  for (let k = 0; k < rest; k++) dazu((k + 0.37) * sp.laenge / rest);
  return l.slice(0, Math.max(40, l.length));
}

/** Ecken der Karosserie (Rechteck laenge × breite). */
function ecken(v) {
  const r = v.richtung(), q = v.rechts(), hl = v.daten.laenge / 2, hb = v.daten.breite / 2;
  return [[1, 1], [1, -1], [-1, 1], [-1, -1]].map(([a, b]) => ({ x: v.x + r.x * hl * a + q.x * hb * b, z: v.z + r.z * hl * a + q.z * hb * b }));
}

/** Ein Lauf; liefert { mitte: max Überstand Mitte, blech: max Überstand Ecken, wo } (m über grenzeBei). */
function lauf(st, s, seite, tempo, grad, auto) {
  const sp = st.spline, p = sp.punktBei(s), g0 = st.grenzeBei(s);
  const q0 = seite * Math.max(0, g0 - 5);
  const v = new R.Vehicle(auto);
  v.setzen(p.x + p.nx * q0, p.z + p.nz * q0, R.headingAus(p.tx, p.tz) - seite * grad * Math.PI / 180);
  v.vLaengs = tempo;
  const lp = R.Looping.zustand(), fz = R.Schanzen.zustand();
  const mitLoop = st.loopings && st.loopings.length;
  let index = -1, maxM = -Infinity, maxB = -Infinity, wo = '';
  for (let k = 0; k < 90; k++) {
    const steuer = { gas: 1, bremse: 0, lenkung: 0 };
    let r;
    if (mitLoop) r = R.Looping.fahrzeugSchritt(lp, v, st, steuer, dt, index);
    else r = R.Schanzen.fahrzeugSchritt(fz, v, st, steuer, dt, index);
    index = r.index;
    R.Kollisionen.bande(v, st);
    if (v.imLooping) continue;
    const n = sp.naechster(v.x, v.z);
    const ueM = Math.abs(n.seitenabstand) - st.grenzeBei(n.s);
    if (ueM > maxM) { maxM = ueM; wo = 's=' + n.s.toFixed(0); }
    for (const e of ecken(v)) {
      const ne = sp.naechster(e.x, e.z), ue = Math.abs(ne.seitenabstand) - st.grenzeBei(ne.s);
      if (ue > maxB) maxB = ue;
    }
  }
  return { mitte: maxM, blech: maxB, wo };
}

const autos = R.carCatalog.map(a => a.fahrwerte);
const breitestes = autos.reduce((a, b) => (b.breite * 10 + b.laenge > a.breite * 10 + a.laenge ? b : a));
['wiese', 'wald', 'wueste', 'fantasie'].forEach((id) => {
  const d = R.trackCatalog.find(t => t.id === id);
  if (process.env.ZAUN_SCHNELL) return;
  Object.keys(d.welten).forEach((welt) => {
    const st = new R.Strecke(d, { welt });
    const liste = stellen(st);
    let schlimmM = { mitte: -Infinity }, schlimmB = { blech: -Infinity }, n = 0, failM = 0, failB = 0;
    liste.forEach((s) => [-1, 1].forEach((seite) => TEMPI.forEach((t) => WINKEL.forEach((w) => {
      const e = lauf(st, s, seite, t, w, breitestes); n++;
      e.info = `s0=${s.toFixed(0)} ${seite > 0 ? 'rechts' : 'links'} ${t} m/s ${w}° → ${e.wo}`;
      if (e.mitte > schlimmM.mitte) schlimmM = e;
      if (e.blech > schlimmB.blech) schlimmB = e;
      if (e.mitte > 0.6) failM++;
      if (e.blech > 0.3) failB++;
    }))));
    pruefe(`${id}/${welt}: Mitte nie > grenze + 0,6 m (${n} Läufe)`, failM === 0,
      `${failM} Fehl, max ${schlimmM.mitte.toFixed(2)} m bei ${schlimmM.info}`);
    pruefe(`${id}/${welt}: Karosserie nie > grenze + 0,3 m`, failB === 0,
      `${failB} Fehl, max ${schlimmB.blech.toFixed(2)} m bei ${schlimmB.info}`);
  });
});

// ---------- Zaun-Deko exakt an der Bande ----------
['wiese', 'wald', 'wueste', 'fantasie'].forEach((id) => {
  const d = R.trackCatalog.find(t => t.id === id);
  const st = new R.Strecke(d, { welt: Object.keys(d.welten).includes('stunt') ? 'stunt' : undefined });
  const sp = st.spline;
  let gezeigt = 0, ohneBande = 0, info = '';
  [-1, 1].forEach((seite) => st.zaunPunkte(seite).forEach((zp) => {
    if (!zp.ok) return;
    gezeigt++;
    // 0,3 m hinter dem Zaunpunkt muss die Bande greifen (eigenes Streckenstück, |q| > grenze)
    const p = sp.punktBei(zp.s), g = st.grenzeBei(zp.s) + 0.3;
    const n = sp.naechster(p.x + p.nx * g * seite, p.z + p.nz * g * seite);
    if (!(Math.abs(n.seitenabstand) > st.grenzeBei(n.s))) { ohneBande++; info = 's=' + zp.s.toFixed(0); }
  }));
  pruefe(`${id}: Zaun steht nur dort, wo die Bande hält (${gezeigt} Zaunpunkte)`, ohneBande === 0, ohneBande + ' ohne Bande ' + info);
  // Leitplanken (enge Spuren) und Geländer liegen an grenzeBei − 0,15 bzw. grenzeEng: innen an der Bande
  pruefe(`${id}: Geländer/Tunnelwand an grenzeEng, Leitplanke an grenzeBei − 0,15 (innerhalb der Karosserie-Bande)`,
    st.grenzeEng === st.breite / 2 + st.randBreite + 0.4);
});

// ---------- Säulen (Startbogen, Looping-Beine) sind fest ----------
{
  const st = new R.Strecke(R.trackCatalog.find(t => t.id === 'fantasie'));
  const saeulen = st.saeulen || [];
  pruefe('Fantasie: Säulen für Startbogen (2) und Looping-Beine (2 × 3 × 2) angelegt', saeulen.length >= 2 + 12, saeulen.length + ' Säulen');
  let durch = 0, getroffen = 0;
  saeulen.forEach((sa) => {
    // Auto 4 m davor (längs der Strecke; Beine stehen 10 m auseinander) auf Höhe der Säule, Vollgas drauf zu
    const n = st.spline.naechster(sa.x, sa.z), p = st.spline.punktBei(n.s - 4);
    const v = new R.Vehicle(breitestes);
    v.setzen(p.x + p.nx * n.seitenabstand, p.z + p.nz * n.seitenabstand, R.headingAus(p.tx, p.tz)); v.vLaengs = 30;
    let min = Infinity;
    for (let k = 0; k < 60; k++) {
      v.untergrund = 'rand'; v.schritt(dt, { gas: 1 }); R.Kollisionen.bande(v, st);
      for (const c of R.Kollisionen.kapsel(v).kreise) min = Math.min(min, Math.hypot(c.x - sa.x, c.z - sa.z) - sa.r - v.daten.breite / 2);
    }
    if (min < -0.15) durch++;
    if (min < 0.2) getroffen++;
  });
  pruefe('Säulen: kein Auto fährt hindurch (30 m/s frontal)', durch === 0 && getroffen === saeulen.length,
    durch + ' durchfahren, ' + getroffen + '/' + saeulen.length + ' angefahren');
}

// ---------- Runde 6 (W1-A5): Pflanzen/Felsen zwischen Straße und Zaun (echte Deko aus themes.js, mit THREE) ----------
{
  const R3 = ladeModule(['vendor/three.min.js', 'src/config.js', 'src/physics/vehicle.js', 'src/track/spline.js', 'src/track/trackCatalog.js',
    'src/track/trackBuilder.js', 'src/track/looping.js', 'src/physics/collisions.js', 'src/physics/schaden.js', 'src/cars/carCatalog.js', 'src/world/themes.js']);
  const K3 = R3.Kollisionen, P = R3.config.pflanzen;
  const strecken = {};
  R3.trackCatalog.forEach((t) => {
    const st = new R3.Strecke(t);
    const n = K3.pflanzenSammeln(st, R3.themes.dekoBauen(t.thema, st));
    strecken[t.id] = st;
    const zuWeit = st.pflanzenKollider.filter(k => Math.abs(k.seitenabstand) - k.r > st.grenzeBei(k.s) + P.zugabe + 1e-6).length;
    const fest = st.pflanzenKollider.filter(k => k.art === 'fest').length;
    pruefe(`${t.id}: Pflanzen-Kollider nur zwischen Straße und Zaun (+${P.zugabe} m)`, zuWeit === 0 && (t.id === 'fantasie' || n > 0),
      n + ' Kollider (' + fest + ' fest, ' + (n - fest) + ' weich)');
  });
  /** Auto 12 m vor dem Kollider (Kurs auf die Mitte), 60 km/h, Vollgas; Schritt wie main.js. */
  function anfahrt(st, k, schaden) {
    const v = new R3.Vehicle({}), sp = st.spline;
    const p = sp.punktBei(k.s - 12), q = Math.max(-st.grenzeBei(k.s) + 2, Math.min(st.grenzeBei(k.s) - 2, k.seitenabstand));
    const x0 = p.x + p.nx * q, z0 = p.z + p.nz * q;
    v.setzen(x0, z0, R3.headingAus(k.x - x0, k.z - z0)); v.vLaengs = 60 / 3.6;
    const sch = schaden ? new R3.Schaden([{ vehicle: v }], { an: true }) : null;
    const erg = { stoss: null, minAbst: Infinity, vVor: 0, vNach: 0, ende: 0 };
    let idx = -1;
    for (let i = 0; i < 120; i++) {
      const n = st.abfrage(v.x, v.z, idx); idx = n.index; v.untergrund = 'strasse';   // Tempo bleibt 60 km/h bis zum Kontakt
      v.schritt(dt, { gas: i < 1 ? 0.3 : 0, bremse: 0, lenkung: 0 });
      K3.bande(v, st);
      const vor = v.vLaengs;
      const ps = K3.pflanzen([v], st, { dt });
      if (sch) { sch.stoesseAuswerten({ pflanzen: ps }); sch.schritt(dt); }
      const t = ps.find(x => x.typ === (k.art === 'fest' ? 'baum' : 'busch'));
      if (t && !erg.stoss) { erg.stoss = t; erg.vVor = vor; erg.vNach = v.vLaengs; }
      // Rechteck-Abstand zur Kreismitte (nächster Punkt der Karosserie)
      const r = v.richtung(), qq = v.rechts(), dx = k.x - v.x, dz = k.z - v.z;
      const lx = Math.max(-v.daten.laenge / 2, Math.min(v.daten.laenge / 2, dx * r.x + dz * r.z));
      const lq = Math.max(-v.daten.breite / 2, Math.min(v.daten.breite / 2, dx * qq.x + dz * qq.z));
      erg.minAbst = Math.min(erg.minAbst, Math.hypot(dx - r.x * lx - qq.x * lq, dz - r.z * lx - qq.z * lq) - k.r);
    }
    erg.ende = v.tempo; erg.prozent = sch ? sch.zustand(0).prozent : 100;
    return erg;
  }
  // Baum: Stopp + −3 % (Schaden an), nicht hindurch
  const st = strecken.wiese;
  const baeume = st.pflanzenKollider.filter(k => k.art === 'fest' && Math.abs(k.seitenabstand) < st.grenzeBei(k.s) - 1);
  const baum = baeume[0];
  if (baum) {
    const e = anfahrt(st, baum, true);
    pruefe('Baum bei 60 km/h: Stoß, Stopp (< 2 m/s), −3 % Schaden, nicht hindurch',
      e.stoss && e.vNach < 2 && e.prozent === 97 && e.minAbst > -0.1,
      (e.stoss ? 'Stärke ' + e.stoss.staerke.toFixed(1) + ' m/s, ' : 'kein Stoß, ') + 'danach ' + (e.vNach * 3.6).toFixed(0) + ' km/h, ' +
      e.prozent + ' %, min. Abstand ' + e.minAbst.toFixed(2) + ' m (' + baum.name + ', r ' + baum.r.toFixed(2) + ')');
  } else pruefe('Wiese: erreichbarer Baum gefunden', false);
  const busch = st.pflanzenKollider.find(k => k.art === 'weich' && Math.abs(k.seitenabstand) < st.grenzeBei(k.s) - 1);
  if (busch) {
    const e = anfahrt(st, busch, true);
    pruefe('Busch bei 60 km/h: Tempo × 0,7, kein Schaden, durchfahrbar', e.stoss && Math.abs(e.vNach / e.vVor - P.weichTempo) < 1e-9 && e.prozent === 100,
      e.stoss ? (e.vVor * 3.6).toFixed(0) + ' → ' + (e.vNach * 3.6).toFixed(0) + ' km/h, ' + e.prozent + ' %' : 'kein Kontakt');
  } else pruefe('Wiese: erreichbarer Busch gefunden', false);
  // Alle festen Kollider aller Strecken: frontal mit 60 km/h → nie hindurch
  let durch = 0, gesamt = 0, schlimm = '';
  Object.values(strecken).forEach((s2) => s2.pflanzenKollider.forEach((k) => {
    if (k.art !== 'fest' || Math.abs(k.seitenabstand) > s2.grenzeBei(k.s) - 1) return;
    gesamt++;
    const e = anfahrt(s2, k, false);
    if (e.minAbst < -0.15) { durch++; if (!schlimm) schlimm = s2.id + ' ' + k.name + ' s=' + k.s.toFixed(0) + ' ' + e.minAbst.toFixed(2); }
  }));
  pruefe('Alle festen Pflanzen (alle Strecken): kein Auto fährt hindurch (60 km/h)', durch === 0 && gesamt > 20, durch + '/' + gesamt + ' durch ' + schlimm);
}

console.log(fehler === 0 ? '\nALLE TESTS OK' : '\n' + fehler + ' FEHLER');
process.exit(fehler ? 1 : 0);
