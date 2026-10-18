// Runde 5 (Fix-A Punkt 5): KI in allen Welten je Tempo-Klasse – node tests/test_welten_ki.js [streckenId]
// Je Strecke × Welt (alle Welten aus dem Katalog) × 7 Stufen: KI allein, 2 Runden, ohne Kollisionen.
// Prüft: im Ziel, kein Reset (brauchtReset), abseits < 3 %; Schanzen: jede Absprung-Geschwindigkeit ≥ 90 km/h
// (25 m/s – darunter wäre der Sprung ein Hüpfer) – ausgenommen eine Schanze direkt nach dem Start (Runde 1, < 300 m
// gefahren: aus dem Stand physikalisch nicht erreichbar), dort ≥ config.anlauf.schanzeMin bzw. 50 km/h; Loopings: alle geschafft, 0 Stürze, 0× zu langsam.
// Fahrzeugschritt wie main.js (ohne Fahrhilfe): Looping → Looping.schritt, Flug → Schanzen.flugSchritt,
// sonst vehicle.schritt + Schanzen.nachSchritt + Looping-Einfahrt.
// Ohne TEMPO_KLASSE: beide Klassen (normal, schnell) als eigene Prozesse.
// 12.10. Hindernis-Menge: zusätzlich läuft alles mit HINDERNIS_MENGE=sehrViele (nur Welten mit Hindernis-Schichten, sonst identisch zu normal).
if (!process.env.TEMPO_KLASSE) {
  const { spawnSync } = require('child_process');
  let rc = 0;
  const mengen = process.env.HINDERNIS_MENGE ? [process.env.HINDERNIS_MENGE] : ['normal', 'sehrViele'];
  for (const m of mengen) for (const k of ['normal', 'schnell']) {
    console.log('\n##### Tempo-Klasse ' + k + ' · Hindernis-Menge ' + m + ' #####');
    const r = spawnSync(process.execPath, [__filename].concat(process.argv.slice(2)),
      { stdio: 'inherit', env: Object.assign({}, process.env, { TEMPO_KLASSE: k, HINDERNIS_MENGE: m }) });
    rc = rc || r.status;
  }
  console.log(rc ? '\nFEHLER in mindestens einer Tempo-Klasse' : '\nALLE TEMPO-KLASSEN UND HINDERNIS-MENGEN OK');
  process.exit(rc);
  return;
}
const KLASSE = process.env.TEMPO_KLASSE;
const MENGE = process.env.HINDERNIS_MENGE || 'normal';
const ABSEITS_MAX = MENGE === 'normal' ? 0.03 : 0.1;   // mit vielen Hindernissen weicht die KI öfter auf den Rand aus
const { ladeModule } = require('./lade');
const fs = require('fs'), path = require('path');
const dateien = ['src/config.js', 'src/physics/vehicle.js', 'src/track/spline.js', 'src/track/trackCatalog.js',
  'src/track/trackBuilder.js', 'src/track/looping.js', 'src/track/schanze.js', 'src/race/raceManager.js',
  'src/physics/collisions.js', 'src/ai/driver.js'];
if (fs.existsSync(path.join(__dirname, '..', 'src/track/anlauf.js'))) dateien.splice(7, 0, 'src/track/anlauf.js');
const R = ladeModule(dateien);
R.Vehicle.klasseStandard = KLASSE;

const dt = R.config.physik.schritt, LP = R.Looping, S = R.Schanzen;
const SPRUNG_MIN = 25;   // m/s = 90 km/h
const START_MIN = (R.config.anlauf && R.config.anlauf.schanzeMin) || 14;   // m/s an einer Schanze kurz nach dem Start
const START_WEG = 300;   // m
const nurId = process.argv[2];
let fehler = 0;
function pruefe(name, ok, info) { console.log((ok ? 'OK   ' : 'FEHL ') + name + (info ? '  (' + info + ')' : '')); if (!ok) fehler++; }
const STUFEN = Object.keys(R.config.schwierigkeiten).sort((a, b) => R.config.schwierigkeiten[a].rang - R.config.schwierigkeiten[b].rang);

/** Ein Schritt wie main.js (Looping / Flug / Boden), liefert { ereignis, index, untergrund }. */
function schritt(lp, fz, v, st, s, index) {
  if (lp.aktiv || lp.fallen) return LP.fahrzeugSchritt(lp, v, st, s, dt, index);
  if (fz.aktiv) return S.fahrzeugSchritt(fz, v, st, s, dt, index);
  const n = st.abfrage(v.x, v.z, index);
  v.untergrund = n.untergrund;
  const xAlt = v.x, zAlt = v.z;
  v.schritt(dt, s);
  let e = S.nachSchritt(fz, v, st, n, xAlt, zAlt, dt);
  v.y = S.hoehe(fz, v, st, n.index);   // W4-I: Ebene über den Streckenindex
  if (st.loopings && st.loopings.length) {
    const pt = st.spline.punktBei(n.s), dx = v.x - xAlt, dz = v.z - zAlt;
    e = LP.einfahrt(lp, v, st, n.s, n.s + dx * pt.tx + dz * pt.tz, n.seitenabstand + dx * pt.nx + dz * pt.nz) || e;
  }
  return { ereignis: e, index: n.index, untergrund: n.untergrund };
}

function kiFahrt(st, stufe) {
  const start = st.startpositionen(1)[0];
  const v = new R.Vehicle({});
  v.setzen(start.x, start.z, start.heading);
  const rennen = new R.RaceManager(st, [{ vehicle: v, name: 'KI', istSpieler: false }], { runden: 2, countdown: 0 });
  const d = new R.Driver(v, st, { schwierigkeit: stufe, seed: 11, name: 'KI' });
  if (d.hindernisseSetzen) d.hindernisseSetzen(st.hindernisse);
  const t = rennen.teilnehmer[0], lp = LP.zustand(), fz = S.zustand();
  let index = -1, abseits = 0, zeit = 0, reset = false, sprungMin = Infinity, spruenge = 0, startSprung = Infinity, weg = 0;
  let yAlt = null, maxDy = 0, maxDyS = 0;   // W4-I: Höhen-Sprünge je Schritt (Überführung: Ebene darf nicht wechseln)
  for (let k = 0; k < 60 * 500 && !t.imZiel; k++) {
    const s = d.steuerung(dt, { andere: [], spielerFortschrittMax: null, eigenerFortschritt: t.fortschritt, laeuft: true });
    if (d.brauchtReset) { reset = true; break; }
    const vorher = v.vLaengs, warLuft = fz.aktiv || lp.aktiv || lp.fallen;
    const r = schritt(lp, fz, v, st, s, index);
    index = r.index;
    if (yAlt !== null && !warLuft && !fz.aktiv && !lp.aktiv && !lp.fallen && Math.abs(v.y - yAlt) > maxDy) { maxDy = Math.abs(v.y - yAlt); maxDyS = st.spline.punkte[index].s; }
    yAlt = v.y;
    weg += Math.abs(v.vLaengs) * dt;
    if (r.ereignis === 'abflug') {
      spruenge++;
      const vs = Math.min(vorher, v.vLaengs);
      if (weg < START_WEG) startSprung = Math.min(startSprung, vs); else sprungMin = Math.min(sprungMin, vs);
    }
    if (r.untergrund === 'gras' || r.untergrund === 'sand') abseits += dt;
    if (r.ereignis === 'gefallen') rennen.verfolgungSetzen(0, v.x, v.z);
    rennen.schritt(dt);
    zeit += dt;
  }
  return { imZiel: t.imZiel, reset, anteil: abseits / Math.max(zeit, dt), r2: t.rundenzeiten[1], sprungMin, spruenge, startSprung, maxDy, maxDyS,
    loop: { geschafft: lp.geschafft, gefallen: lp.gefallen, zuLangsam: lp.zuLangsam } };
}

console.log('Tempo-Klasse ' + KLASSE + ': Standard-Auto vMax ' + (new R.Vehicle({}).daten.vMax * 3.6).toFixed(0) + ' km/h');
for (const daten of R.trackCatalog) {
  if (nurId && daten.id !== nurId) continue;
  for (const welt of Object.keys(daten.welten || { klassisch: 1 })) {
    if (MENGE !== 'normal' && !R.Strecke.weltHatHindernisse(daten, welt)) continue;   // Menge wirkt nur in Welten mit Hindernissen
    const st = new R.Strecke(daten, { welt, hindernisMenge: MENGE });
    const nSch = S.liste(st).length, nLoop = st.loopings.length;
    const zeilen = [];
    let allesOk = true, sprungMinAlle = Infinity, startMinAlle = Infinity;
    for (const stufe of STUFEN) {
      const e = kiFahrt(st, stufe);
      sprungMinAlle = Math.min(sprungMinAlle, e.sprungMin); startMinAlle = Math.min(startMinAlle, e.startSprung);
      const ok = e.imZiel && !e.reset && e.anteil < ABSEITS_MAX && e.maxDy <= 1 &&
        (!nSch || (e.spruenge >= 2 * nSch && e.sprungMin >= SPRUNG_MIN && e.startSprung >= START_MIN)) &&
        (!nLoop || (e.loop.geschafft === 2 * nLoop && e.loop.gefallen === 0 && e.loop.zuLangsam === 0));
      if (!ok) { allesOk = false; zeilen.push(stufe + ': ' + JSON.stringify(e)); }
      else zeilen.push(stufe + ' ' + (e.r2 ? e.r2.toFixed(1) + ' s' : '-') + (st.ueberfuehrungen.length ? ' Δy≤' + e.maxDy.toFixed(2) : ''));
    }
    pruefe(`[${daten.id}/${welt}${MENGE !== 'normal' ? ' ' + MENGE : ''}] 7 Stufen × 2 Runden: im Ziel, kein Reset, abseits < ${Math.round(ABSEITS_MAX * 100)} %, Höhe ohne Sprung (≤ 1 m/Schritt)` +
      (nSch ? `, ${nSch} Schanzen je Runde mit ≥ 90 km/h` : '') + (nLoop ? `, ${nLoop} Loopings ohne Sturz` : ''),
      allesOk, (nSch ? 'Absprung min ' + (sprungMinAlle * 3.6).toFixed(0) + ' km/h' +
        (startMinAlle < Infinity ? ', Start-Schanze (Runde 1) ' + (startMinAlle * 3.6).toFixed(0) + ' km/h' : '') + ' | ' : '') + zeilen.join(', '));
  }
}
// ---------- Runde 6 (W2-E): Streckenvarianten (XL) in Welt „alles“ (1 Welt reicht): 7 Stufen × 2 Runden, Loopings/Schanzen ----------
for (const daten of R.trackCatalog) {
  if (!daten.varianten || (nurId && daten.id !== nurId)) continue;
  for (const vid of Object.keys(daten.varianten)) {
    const st = new R.Strecke(daten, { welt: 'alles', variante: vid, hindernisMenge: MENGE });
    const nSch = S.liste(st).length, nLoop = st.loopings.length;
    const zeilen = [];
    let allesOk = true, sprungMinAlle = Infinity, startMinAlle = Infinity;
    for (const stufe of STUFEN) {
      const e = kiFahrt(st, stufe);
      sprungMinAlle = Math.min(sprungMinAlle, e.sprungMin); startMinAlle = Math.min(startMinAlle, e.startSprung);
      const ok = e.imZiel && !e.reset && e.anteil < ABSEITS_MAX &&
        (!nSch || (e.spruenge >= 2 * nSch && e.sprungMin >= SPRUNG_MIN && e.startSprung >= START_MIN)) &&
        (!nLoop || (e.loop.geschafft === 2 * nLoop && e.loop.gefallen === 0 && e.loop.zuLangsam === 0));
      if (!ok) { allesOk = false; zeilen.push(stufe + ': ' + JSON.stringify(e)); }
      else zeilen.push(stufe + ' ' + (e.r2 ? e.r2.toFixed(1) + ' s' : '-'));
    }
    pruefe(`[${daten.id}/alles ${vid}${MENGE !== 'normal' ? ' ' + MENGE : ''}] 7 Stufen × 2 Runden: im Ziel, kein Reset, abseits < ${Math.round(ABSEITS_MAX * 100)} %` +
      (nSch ? `, ${nSch} Schanzen je Runde mit ≥ 90 km/h` : '') + (nLoop ? `, ${nLoop} Loopings ohne Sturz` : ''), allesOk, zeilen.join(', '));
  }
}
// ---------- Runde 6 (W1-A4/A5): alle 7 Stufen GEMEINSAM je Strecke × Welt, rempeln 'echt', 2 Runden ----------
// Kollisionen wie main.js: Bande → Auto-Auto (Rechtecke, Rempeln echt) → Bande für verschobene → Looping-Abstand →
// Pflanzen (echte Deko, mit THREE) → Hindernisse. Prüft: alle im Ziel (keine Endlosschleife), Resets ≤ 1 je Rennen,
// keine NaN. (Ohne Umgebungsvariable OHNE_REMPELN=1.)
const ARTEN = {}, MODUS = process.env.REMPELN_MODUS || 'echt';   // Diagnose: REMPELN_MODUS=sanft
if (!process.env.OHNE_REMPELN) {
  const R3 = ladeModule(['vendor/three.min.js'].concat(dateien, ['src/world/themes.js']));
  R3.Vehicle.klasseStandard = KLASSE;
  const K3 = R3.Kollisionen, LP3 = R3.Looping, S3 = R3.Schanzen;
  for (const daten of R3.trackCatalog) {
    if (nurId && daten.id !== nurId) continue;
    const deko = R3.themes.dekoBauen(daten.thema, new R3.Strecke(daten));   // Deko hängt nur von der Strecke ab
    for (const welt of Object.keys(daten.welten || { klassisch: 1 })) {
      if (MENGE !== 'normal' && !R3.Strecke.weltHatHindernisse(daten, welt)) continue;
      const st = new R3.Strecke(daten, { welt, hindernisMenge: MENGE });
      K3.pflanzenSammeln(st, deko);
      if (K3.wracksEinbauen) K3.wracksEinbauen(st);
      const starts = st.startpositionen(STUFEN.length);
      const fz = STUFEN.map((stufe, i) => {
        const v = new R3.Vehicle({}); v.setzen(starts[i].x, starts[i].z, starts[i].heading);
        const d = new R3.Driver(v, st, { schwierigkeit: stufe, seed: 11 + i, name: stufe });
        if (d.hindernisseSetzen) d.hindernisseSetzen(st.hindernisse);
        return { vehicle: v, driver: d, looping: LP3.zustand(), flug: S3.zustand(), index: -1, resets: 0 };
      });
      const rennen = new R3.RaceManager(st, fz.map(f => ({ vehicle: f.vehicle, name: f.driver.name, istSpieler: false })), { runden: 2, countdown: 0 });
      const tn = rennen.teilnehmer;
      let schritte = 0, nan = false, stoesse = 0, dreher = 0, baeume = 0, rempler = 0;
      const umf = { andere: tn, spielerFortschrittMax: null, laeuft: true, rempeln: MODUS };
      while (!tn.every(t => t.imZiel) && schritte < 60 * 600) {
        fz.forEach((f, i) => {
          if (tn[i].imZiel) { f.vehicle.vLaengs *= 0.98; return; }
          umf.eigenerFortschritt = tn[i].fortschritt;
          const s = f.driver.steuerung(dt, umf); let s2 = null;
          if (f.driver.brauchtReset) {
            const n = st.spline.naechster(f.vehicle.x, f.vehicle.z), p = st.spline.punktBei(n.s);
            if (process.env.RESET_LOG) console.log('  Reset', f.driver.name, 's=' + n.s.toFixed(0), 'q=' + n.seitenabstand.toFixed(1), 't=' + (schritte * dt).toFixed(1),
              'nah:', fz.filter(g => g !== f && Math.hypot(g.vehicle.x - f.vehicle.x, g.vehicle.z - f.vehicle.z) < 8).map(g => g.driver.name).join(','),
              'Pflanzen:', (st.pflanzenKollider || []).filter(k => Math.hypot(k.x - f.vehicle.x, k.z - f.vehicle.z) < k.r + 4).map(k => k.name + '/' + k.art).join(','));
            f.vehicle.setzen(p.x, p.z, R3.headingAus(p.tx, p.tz)); f.driver.zurueckgesetzt(); f.resets++;
            f.looping = LP3.zustand(); f.flug = S3.zustand(); f.vehicle.imLooping = false; f.vehicle.imFlug = false;
            return;
          }
          // wie main.js: KI nimmt Anlauf (Vollgas in der Anlauf-Zone) und stellt sich nach kiWarten s Stillstand vor Looping/Schanze
          // selbst auf die Anlaufposition (sonst bleibt sie nach einem Rempler dicht vor dem Looping mit Tempo 0 hängen)
          const AN = R3.Anlauf, az = AN ? (f.anlauf || (f.anlauf = AN.zustand())) : null;
          const nah = az ? st.spline.naechster(f.vehicle.x, f.vehicle.z) : null, xAlt = f.vehicle.x, zAlt = f.vehicle.z;
          if (az) s2 = AN.kiHilfe(az, f.vehicle, st, nah, s);
          let r;
          if (f.looping.aktiv || f.looping.fallen || !(st.loopings && st.loopings.length)) {
            r = (f.looping.aktiv || f.looping.fallen) ? LP3.fahrzeugSchritt(f.looping, f.vehicle, st, s2 || s, dt, f.index)
              : S3.fahrzeugSchritt(f.flug, f.vehicle, st, s2 || s, dt, f.index);
          } else r = LP3.fahrzeugSchritt(f.looping, f.vehicle, st, s2 || s, dt, f.index);
          f.index = r.index;
          if (az && nah) {
            AN.nachSchritt(az, f.vehicle, st, nah, xAlt, zAlt, s2 || s, dt);
            if (AN.aktiv(az) && az.stehZeit > ((R3.config.anlauf && R3.config.anlauf.kiWarten) || 2)) { AN.zurAnlaufposition(az, f.vehicle, st, fz); f.index = -1; f.anlaufHilfen = (f.anlaufHilfen || 0) + 1; }
          }
          if (r.ereignis === 'gefallen') rennen.verfolgungSetzen(i, f.vehicle.x, f.vehicle.z);
        });
        fz.forEach(f => K3.bande(f.vehicle, st));
        const alt = fz.map(f => [f.vehicle.x, f.vehicle.z]);
        const sts = K3.autoAuto(fz, { rempeln: MODUS, dt });
        stoesse += sts.length; dreher += sts.filter(x => x.dreht).length; if (process.env.ARTEN) sts.forEach(x => { const k = (x.art || "-") + (x.staerke >= 3 ? "3+" : x.staerke >= 1 ? "1+" : "<1"); ARTEN[k] = (ARTEN[k] || 0) + 1; });
        fz.forEach((f, i) => { if (f.vehicle.x !== alt[i][0] || f.vehicle.z !== alt[i][1]) K3.bande(f.vehicle, st); });
        K3.loopingAbstand(fz, st);
        baeume += K3.pflanzen(fz, st, { dt }).filter(x => x.typ === 'baum').length;
        K3.hindernisse(fz, st, { dt, zeit: schritte * dt });
        fz.forEach(f => { if (!Number.isFinite(f.vehicle.x) || !Number.isFinite(f.vehicle.z) || !Number.isFinite(f.vehicle.heading)) nan = true; });
        rennen.schritt(dt);
        schritte++;
      }
      rempler = fz.reduce((a, f) => a + (f.driver.rempler || 0), 0);
      const resets = fz.reduce((a, f) => a + f.resets, 0);
      const ok = tn.every(t => t.imZiel) && resets <= 1 && !nan;
      pruefe(`[${daten.id}/${welt}${MENGE !== 'normal' ? ' ' + MENGE : ''}] 7 Stufen gemeinsam, rempeln echt, 2 Runden: alle im Ziel, Resets ≤ 1, keine NaN`, ok,
        'Zeit ' + (schritte * dt).toFixed(0) + ' s, im Ziel ' + tn.filter(t => t.imZiel).length + '/7, Resets ' + resets +
        ' (' + fz.filter(f => f.resets).map(f => f.driver.name + ' ' + f.resets).join(', ') + '), Stöße ' + stoesse + ', Dreher ' + dreher +
        ', KI-Rempler ' + rempler + ', Baum-Treffer ' + baeume + (fz.some(f => f.anlaufHilfen) ? ', Anlauf-Neustarts ' + fz.reduce((a, f) => a + (f.anlaufHilfen || 0), 0) : '') +
        (tn.every(t => t.imZiel) ? '' : ' | nicht im Ziel: ' + fz.filter((f, i) => !tn[i].imZiel).map((f) => { const n = st.spline.naechster(f.vehicle.x, f.vehicle.z); return f.driver.name + ' s=' + n.s.toFixed(0) + ' q=' + n.seitenabstand.toFixed(1) + ' v=' + (f.vehicle.vLaengs * 3.6).toFixed(0) + (f.vehicle.imLooping ? ' (im Looping)' : '') + ' loop=' + JSON.stringify(f.looping) + ' fest=' + (f.driver.festZeit || 0).toFixed(1) + ' versuche=' + f.driver.fehlversuche; }).join(', ')));
    }
  }
}

// ---------- Runde 6 (W4-J): niveaugleiche Kreuzung (Fantasie, alle Welten + XL) ----------
// a) Begegnungen erzwingen: KI auf Abschnitt A und KI auf Abschnitt B kommen (bei 13 Zeitversätzen) gleichzeitig an der Kreuzung an.
//    Prüft: beide kommen durch (kein Hängen, kein Reset), Querverkehr wird erkannt (einer lässt den anderen vorbei), Zusammenstöße selten.
// b) Ein Auto steht MITTEN auf der Kreuzung (Spieler parkt): die KI auf A und auf B fahren vorbei (≤ 25 s), kein Reset.
// c) Alle 7 Stufen gemeinsam, 3 Runden (Fantasie alle Welten + XL), rempeln echt: alle im Ziel, 0 Resets, keine NaN,
//    Kreuzungs-Begegnungen gezählt (Autos auf A und B gleichzeitig in der Kreuzung ± 25 m).
if (!process.env.OHNE_KREUZUNG && MENGE === 'normal' && (!nurId || nurId === 'fantasie')) {   // Kreuzung hängt nicht an der Hindernis-Menge
  const R5 = ladeModule(dateien);
  R5.Vehicle.klasseStandard = KLASSE;
  const K5 = R5.Kollisionen, LP5 = R5.Looping, S5 = R5.Schanzen;
  const daten = R5.trackCatalog.find(d => d.id === 'fantasie');
  /** Autos (Liste { vehicle, driver|null, index, looping, flug }) dt-weise wie main.js bewegen, mit Bande/Auto-Auto; liefert Stöße A↔B. */
  const schrittAlle = (st, fz, rennen, umf) => {
    const sp = st.spline;
    fz.forEach((f, i) => {
      if (rennen && rennen.teilnehmer[i].imZiel) { f.vehicle.vLaengs *= 0.98; return; }
      if (rennen) umf.eigenerFortschritt = rennen.teilnehmer[i].fortschritt;
      const s = f.driver ? f.driver.steuerung(dt, umf) : { gas: 0, bremse: 1, lenkung: 0 };
      if (f.driver && f.driver.brauchtReset) { f.resets = (f.resets || 0) + 1; f.driver.zurueckgesetzt(f.index); return; }
      const r = LP5.fahrzeugSchritt(f.looping, f.vehicle, st, s, dt, f.index);   // Looping oder Boden (wie main.js)
      f.index = r.index;
    });
    fz.forEach(f => K5.bande(f.vehicle, st));
    const sts = K5.autoAuto(fz, { rempeln: 'echt', dt });
    fz.forEach(f => K5.bande(f.vehicle, st));
    if (rennen) rennen.schritt(dt);
    let ab = 0;
    for (const x of sts) {
      const a = fz[x.a] || fz[x.i], b = fz[x.b] || fz[x.j];
      if (!a || !b) continue;
      const na = st.abfrage(a.vehicle.x, a.vehicle.z, a.index), nb = st.abfrage(b.vehicle.x, b.vehicle.z, b.index);
      if (Math.abs(sp.differenzS(na.s, nb.s)) > 100) ab++;
    }
    return ab;
  };
  const neuesAuto = (st, s, q, stufe, seed, vStart) => {
    const p = st.spline.punktBei(s), v = new R5.Vehicle({});
    v.setzen(p.x + p.nx * q, p.z + p.nz * q, R5.headingAus(p.tx, p.tz)); v.vLaengs = vStart || 0;
    const d = stufe ? new R5.Driver(v, st, { schwierigkeit: stufe, seed, name: stufe + seed }) : null;
    if (d) { d.hindernisseSetzen(st.hindernisse); d.zurueckgesetzt(st.spline.indexBei(s)); }
    return { vehicle: v, driver: d, index: st.spline.indexBei(s), looping: LP5.zustand(), flug: S5.zustand(), resets: 0 };
  };
  for (const variante of ['', 'xl']) {
    const st = new R5.Strecke(daten, { welt: 'alles', variante }), sp = st.spline, k = st.kreuzungen[0];
    const name = '[fantasie' + (variante ? ' ' + variante : '') + '] W4-J Kreuzung';
    // a) Begegnungen
    let durch = 0, gewartet = 0, stoesse = 0, maxZeit = 0, resets = 0, faelle = 0;
    for (let off = -60; off <= 60; off += 10) {
      const fa = neuesAuto(st, k.sA - 160, 1.5, 'mittel', 1, 30), fb = neuesAuto(st, k.sB - 70 + off * 0.5, -1.5, 'schwer', 2, 15);
      const fz = [fa, fb], umf = { andere: fz.map(f => ({ vehicle: f.vehicle, get s() { return st.abfrage(f.vehicle.x, f.vehicle.z, f.index).s; } })), laeuft: true, rempeln: 'echt' };
      let zeit = 0, fertig = false;
      while (zeit < 40 && !fertig) {
        stoesse += schrittAlle(st, fz, null, umf) ? 1 : 0;
        zeit += dt;
        const da = sp.differenzS(st.abfrage(fa.vehicle.x, fa.vehicle.z, fa.index).s, k.sA), db = sp.differenzS(st.abfrage(fb.vehicle.x, fb.vehicle.z, fb.index).s, k.sB);
        fertig = da > 40 && db > 40;
      }
      faelle++; if (fertig) durch++; maxZeit = Math.max(maxZeit, zeit);
      if (fa.driver.querGewartet > 0 || fb.driver.querGewartet > 0) gewartet++;
      resets += fa.resets + fb.resets;
    }
    pruefe(name + ' a) gleichzeitige Ankunft (' + faelle + ' Versätze): beide durch, 0 Resets, Querverkehr erkannt, ≤ 3 Fälle mit Zusammenstoß',
      durch === faelle && resets === 0 && gewartet >= 3 && stoesse <= 3 * 60, 'durch ' + durch + '/' + faelle + ', nachgegeben in ' + gewartet + ' Fällen, Stoß-Schritte ' + stoesse +
      ', längste ' + maxZeit.toFixed(1) + ' s');
    // b) Auto steht auf der Kreuzung
    let okB = true, infoB = '';
    for (const [sStart, pass] of [[k.sA - 60, 'A'], [k.sB - 90, 'B']]) {   // A: erst nach Looping 2 starten
      const park = neuesAuto(st, k.sA + 1, 2, null, 0, 0), ki = neuesAuto(st, sStart, 0, 'mittel', 5, 20);
      const fz = [park, ki], umf = { andere: fz.map(f => ({ vehicle: f.vehicle, get s() { return st.abfrage(f.vehicle.x, f.vehicle.z, f.index).s; } })), laeuft: true, rempeln: 'sanft' };
      const sZiel = pass === 'A' ? k.sA : k.sB;
      let zeit = 0, ok = false;
      while (zeit < 25 && !ok) { schrittAlle(st, fz, null, umf); zeit += dt; ok = sp.differenzS(st.abfrage(ki.vehicle.x, ki.vehicle.z, ki.index).s, sZiel) > 30; }
      if (!ok || ki.resets) { okB = false; }
      infoB += pass + ' ' + zeit.toFixed(1) + ' s' + (ki.resets ? ' Reset' : '') + '; ';
    }
    pruefe(name + ' b) Auto parkt auf der Kreuzung: KI auf A und B fahren vorbei (≤ 25 s, 0 Resets)', okB, infoB);
    // c) 7 Stufen gemeinsam, 3 Runden
    for (const welt of variante ? ['alles'] : Object.keys(daten.welten)) {
      const st2 = new R5.Strecke(daten, { welt, variante }), sp2 = st2.spline, k2 = st2.kreuzungen[0];
      const starts = st2.startpositionen(STUFEN.length);
      const fz = STUFEN.map((stufe, i) => {
        const v = new R5.Vehicle({}); v.setzen(starts[i].x, starts[i].z, starts[i].heading);
        const d = new R5.Driver(v, st2, { schwierigkeit: stufe, seed: 31 + i, name: stufe }); d.hindernisseSetzen(st2.hindernisse);
        return { vehicle: v, driver: d, index: -1, looping: LP5.zustand(), flug: S5.zustand(), resets: 0 };
      });
      const rennen = new R5.RaceManager(st2, fz.map(f => ({ vehicle: f.vehicle, name: f.driver.name, istSpieler: false })), { runden: 3, countdown: 0 });
      const tn = rennen.teilnehmer, umf = { andere: tn, spielerFortschrittMax: null, laeuft: true, rempeln: 'echt' };
      let schritte = 0, nan = false, begegnung = 0, abStoss = 0, warten = 0;
      while (!tn.every(t => t.imZiel) && schritte < 60 * 900) {
        abStoss += schrittAlle(st2, fz, rennen, umf) ? 1 : 0;
        fz.forEach(f => { if (!Number.isFinite(f.vehicle.x) || !Number.isFinite(f.vehicle.z)) nan = true; });
        const aDa = tn.some(t => Math.abs(sp2.differenzS(t.s, k2.sA)) < 25), bDa = tn.some(t => Math.abs(sp2.differenzS(t.s, k2.sB)) < 25);
        if (aDa && bDa) begegnung++;
        schritte++;
      }
      fz.forEach(f => { warten += f.driver.querGewartet; });
      const res = fz.reduce((a, f) => a + f.resets, 0);
      pruefe(name + ' c) [' + welt + '] 7 Stufen gemeinsam, 3 Runden, rempeln echt: alle im Ziel, 0 Resets, keine NaN',
        tn.every(t => t.imZiel) && res === 0 && !nan, 'Zeit ' + (schritte * dt).toFixed(0) + ' s, im Ziel ' + tn.filter(t => t.imZiel).length + '/7, Resets ' + res +
        ', Begegnungen an der Kreuzung ' + (begegnung * dt).toFixed(1) + ' s, Stoß-Schritte A↔B ' + abStoss + ', KI-Wartezeit gesamt ' + warten.toFixed(1) + ' s');
    }
  }
}

// ---------- Runde 6 (W2-C): Dino (alle Welten) + Wald mit Tieren – KI allein MIT Dynamik (Dinos stehen/kehren um, Tiere,
// Meteoriten-Felsbrocken, Vulkan-Krater, Flugsaurier) und Hindernis-Kollisionen (Lava, Krater): 0 Resets, Lava gemieden ----------
const kraterSumme = {}, kraterAnzahl = {};
if (!process.env.OHNE_DYNAMIK) {
  const R4 = ladeModule(dateien.concat(['src/world/dynamik.js']));
  R4.Vehicle.klasseStandard = KLASSE;
  const LP4 = R4.Looping, S4 = R4.Schanzen;
  for (const daten of R4.trackCatalog) {
    if (!['dino', 'wald'].includes(daten.id) || (nurId && daten.id !== nurId)) continue;
    const welten = Object.keys(daten.welten);    // W2-C2: auch Wald in allen Welten (Tiere ab Hindernisse)
    for (const welt of welten) {
      if (MENGE !== 'normal' && !R4.Strecke.weltHatHindernisse(daten, welt)) continue;
      const zeilen = [];
      let allesOk = true;
      for (const stufe of STUFEN) {
        const st = new R4.Strecke(daten, { welt, hindernisMenge: MENGE });
        const start = st.startpositionen(1)[0], v = new R4.Vehicle({});
        v.setzen(start.x, start.z, start.heading); v.y = st.hoeheAn(v.x, v.z);
        const rennen = new R4.RaceManager(st, [{ vehicle: v, name: 'KI', istSpieler: false }], { runden: 2, countdown: 0 });
        const d = new R4.Driver(v, st, { schwierigkeit: stufe, seed: 11, name: 'KI' });
        if (d.hindernisseSetzen) d.hindernisseSetzen(st.hindernisse);
        const dyn = new R4.Dynamik(st, { seed: 4242 });
        const t = rennen.teilnehmer[0], lp = LP4.zustand(), fz = S4.zustand(), autos = [{ vehicle: v, istSpieler: false, fortschritt: 0 }];
        let index = -1, reset = false, lava = 0, krater = 0, dynTreffer = 0, ereig = 0, zeit = 0, hv = dyn.hindernisVersion || 0, kraterNeu = 0;
        for (let k = 0; k < 60 * 500 && !t.imZiel; k++) {
          const s = d.steuerung(dt, { andere: [], spielerFortschrittMax: null, eigenerFortschritt: t.fortschritt, laeuft: true });
          if (d.brauchtReset) { reset = true; break; }
          let r;
          if (lp.aktiv || lp.fallen) r = LP4.fahrzeugSchritt(lp, v, st, s, dt, index);
          else r = S4.fahrzeugSchritt(fz, v, st, s, dt, index);
          index = r.index;
          autos[0].fortschritt = t.fortschritt;
          ereig += dyn.schritt(dt, { fortschritt: t.fortschritt, runden: 2, autos }).ereignisse.length;
          // W2-C1: wie main.js – nach Einschlag/Ablauf eines Kraters kennt die KI die neue Hindernisliste
          if (dyn.hindernisVersion !== hv) { hv = dyn.hindernisVersion; kraterNeu++; d.hindernisseSetzen(st.hindernisse); }
          dynTreffer += dyn.kollisionen([v]).length;
          const hs = R4.Kollisionen.hindernisse([v], st, { dt, zeit });
          lava += hs.filter(x => x.lava).length; krater += hs.filter(x => x.typ === 'krater').length;
          if (!v.imFlug) v.y = st.hoeheAn(v.x, v.z);
          rennen.schritt(dt);
          zeit += dt;
        }
        const ok = t.imZiel && !reset && lava === 0;
        if (!ok) allesOk = false;
        zeilen.push(stufe + (ok ? ' ' + (t.rundenzeiten[1] || 0).toFixed(1) + ' s' : ' FEHL(imZiel ' + t.imZiel + ', reset ' + reset + ', lava ' + lava + ')') +
          ' [Treffer ' + dynTreffer + ', Krater ' + krater + '/' + Math.ceil(kraterNeu / 2) + ', Ereignisse ' + ereig + ']');
        kraterSumme[stufe] = (kraterSumme[stufe] || 0) + krater; kraterAnzahl[stufe] = (kraterAnzahl[stufe] || 0) + Math.ceil(kraterNeu / 2);
      }
      pruefe(`[${daten.id}/${welt}${MENGE !== "normal" ? " " + MENGE : ""}] W2-C mit Dynamik: 7 Stufen × 2 Runden im Ziel, 0 Resets, Lava gemieden`, allesOk, zeilen.join(', '));
    }
  }
}

// W2-C1: Die KI kennt Krater nach dem Einschlag (hindernisseSetzen zur Laufzeit) → ab profi höchstens jeder 4. Krater getroffen
if (!process.env.OHNE_DYNAMIK && (!nurId || nurId === 'dino')) {
  const profiPlus = ['profi', 'meister', 'legende', 'unschlagbar'];
  const tr = profiPlus.reduce((a, k) => a + (kraterSumme[k] || 0), 0), an = profiPlus.reduce((a, k) => a + (kraterAnzahl[k] || 0), 0);
  pruefe('[dino] W2-C1: KI profi+ weicht Kratern aus (Treffer ≤ 25 % der Krater auf der Fahrbahn)', an > 0 && tr <= an * (MENGE === 'normal' ? 0.25 : 0.4),   // mit vielen Hindernissen bleibt weniger Platz zum Ausweichen
    'Treffer ' + tr + ' bei ' + an + ' Kratern; je Stufe ' + JSON.stringify(kraterSumme));
}

if (process.env.ARTEN) console.log(JSON.stringify(ARTEN));
console.log(fehler === 0 ? '\nALLE TESTS OK' : '\n' + fehler + ' FEHLER');
process.exit(fehler ? 1 : 0);
