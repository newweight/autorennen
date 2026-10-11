// Runde 5 (Fix-A Punkt 5): KI in allen Welten je Tempo-Klasse – node tests/test_welten_ki.js [streckenId]
// Je Strecke × Welt (alle Welten aus dem Katalog) × 7 Stufen: KI allein, 2 Runden, ohne Kollisionen.
// Prüft: im Ziel, kein Reset (brauchtReset), abseits < 3 %; Schanzen: jede Absprung-Geschwindigkeit ≥ 90 km/h
// (25 m/s – darunter wäre der Sprung ein Hüpfer) – ausgenommen eine Schanze direkt nach dem Start (Runde 1, < 300 m
// gefahren: aus dem Stand physikalisch nicht erreichbar), dort ≥ config.anlauf.schanzeMin bzw. 50 km/h; Loopings: alle geschafft, 0 Stürze, 0× zu langsam.
// Fahrzeugschritt wie main.js (ohne Fahrhilfe): Looping → Looping.schritt, Flug → Schanzen.flugSchritt,
// sonst vehicle.schritt + Schanzen.nachSchritt + Looping-Einfahrt.
// Ohne TEMPO_KLASSE: beide Klassen (normal, schnell) als eigene Prozesse.
if (!process.env.TEMPO_KLASSE) {
  const { spawnSync } = require('child_process');
  let rc = 0;
  for (const k of ['normal', 'schnell']) {
    console.log('\n##### Tempo-Klasse ' + k + ' #####');
    const r = spawnSync(process.execPath, [__filename].concat(process.argv.slice(2)),
      { stdio: 'inherit', env: Object.assign({}, process.env, { TEMPO_KLASSE: k }) });
    rc = rc || r.status;
  }
  console.log(rc ? '\nFEHLER in mindestens einer Tempo-Klasse' : '\nBEIDE TEMPO-KLASSEN OK');
  process.exit(rc);
  return;
}
const KLASSE = process.env.TEMPO_KLASSE;
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
  v.y = S.hoehe(fz, v, st);
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
  for (let k = 0; k < 60 * 500 && !t.imZiel; k++) {
    const s = d.steuerung(dt, { andere: [], spielerFortschrittMax: null, eigenerFortschritt: t.fortschritt, laeuft: true });
    if (d.brauchtReset) { reset = true; break; }
    const vorher = v.vLaengs;
    const r = schritt(lp, fz, v, st, s, index);
    index = r.index;
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
  return { imZiel: t.imZiel, reset, anteil: abseits / Math.max(zeit, dt), r2: t.rundenzeiten[1], sprungMin, spruenge, startSprung,
    loop: { geschafft: lp.geschafft, gefallen: lp.gefallen, zuLangsam: lp.zuLangsam } };
}

console.log('Tempo-Klasse ' + KLASSE + ': Standard-Auto vMax ' + (new R.Vehicle({}).daten.vMax * 3.6).toFixed(0) + ' km/h');
for (const daten of R.trackCatalog) {
  if (nurId && daten.id !== nurId) continue;
  for (const welt of Object.keys(daten.welten || { klassisch: 1 })) {
    const st = new R.Strecke(daten, { welt });
    const nSch = S.liste(st).length, nLoop = st.loopings.length;
    const zeilen = [];
    let allesOk = true, sprungMinAlle = Infinity, startMinAlle = Infinity;
    for (const stufe of STUFEN) {
      const e = kiFahrt(st, stufe);
      sprungMinAlle = Math.min(sprungMinAlle, e.sprungMin); startMinAlle = Math.min(startMinAlle, e.startSprung);
      const ok = e.imZiel && !e.reset && e.anteil < 0.03 &&
        (!nSch || (e.spruenge >= 2 * nSch && e.sprungMin >= SPRUNG_MIN && e.startSprung >= START_MIN)) &&
        (!nLoop || (e.loop.geschafft === 2 * nLoop && e.loop.gefallen === 0 && e.loop.zuLangsam === 0));
      if (!ok) { allesOk = false; zeilen.push(stufe + ': ' + JSON.stringify(e)); }
      else zeilen.push(stufe + ' ' + (e.r2 ? e.r2.toFixed(1) + ' s' : '-'));
    }
    pruefe(`[${daten.id}/${welt}] 7 Stufen × 2 Runden: im Ziel, kein Reset, abseits < 3 %` +
      (nSch ? `, ${nSch} Schanzen je Runde mit ≥ 90 km/h` : '') + (nLoop ? `, ${nLoop} Loopings ohne Sturz` : ''),
      allesOk, (nSch ? 'Absprung min ' + (sprungMinAlle * 3.6).toFixed(0) + ' km/h' +
        (startMinAlle < Infinity ? ', Start-Schanze (Runde 1) ' + (startMinAlle * 3.6).toFixed(0) + ' km/h' : '') + ' | ' : '') + zeilen.join(', '));
  }
}
// ---------- Runde 6 (W2-E): Streckenvarianten (XL) in Welt „alles“ (1 Welt reicht): 7 Stufen × 2 Runden, Loopings/Schanzen ----------
for (const daten of R.trackCatalog) {
  if (!daten.varianten || (nurId && daten.id !== nurId)) continue;
  for (const vid of Object.keys(daten.varianten)) {
    const st = new R.Strecke(daten, { welt: 'alles', variante: vid });
    const nSch = S.liste(st).length, nLoop = st.loopings.length;
    const zeilen = [];
    let allesOk = true, sprungMinAlle = Infinity, startMinAlle = Infinity;
    for (const stufe of STUFEN) {
      const e = kiFahrt(st, stufe);
      sprungMinAlle = Math.min(sprungMinAlle, e.sprungMin); startMinAlle = Math.min(startMinAlle, e.startSprung);
      const ok = e.imZiel && !e.reset && e.anteil < 0.03 &&
        (!nSch || (e.spruenge >= 2 * nSch && e.sprungMin >= SPRUNG_MIN && e.startSprung >= START_MIN)) &&
        (!nLoop || (e.loop.geschafft === 2 * nLoop && e.loop.gefallen === 0 && e.loop.zuLangsam === 0));
      if (!ok) { allesOk = false; zeilen.push(stufe + ': ' + JSON.stringify(e)); }
      else zeilen.push(stufe + ' ' + (e.r2 ? e.r2.toFixed(1) + ' s' : '-'));
    }
    pruefe(`[${daten.id}/alles ${vid}] 7 Stufen × 2 Runden: im Ziel, kein Reset, abseits < 3 %` +
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
      const st = new R3.Strecke(daten, { welt });
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
          const s = f.driver.steuerung(dt, umf);
          if (f.driver.brauchtReset) {
            const n = st.spline.naechster(f.vehicle.x, f.vehicle.z), p = st.spline.punktBei(n.s);
            if (process.env.RESET_LOG) console.log('  Reset', f.driver.name, 's=' + n.s.toFixed(0), 'q=' + n.seitenabstand.toFixed(1), 't=' + (schritte * dt).toFixed(1),
              'nah:', fz.filter(g => g !== f && Math.hypot(g.vehicle.x - f.vehicle.x, g.vehicle.z - f.vehicle.z) < 8).map(g => g.driver.name).join(','),
              'Pflanzen:', (st.pflanzenKollider || []).filter(k => Math.hypot(k.x - f.vehicle.x, k.z - f.vehicle.z) < k.r + 4).map(k => k.name + '/' + k.art).join(','));
            f.vehicle.setzen(p.x, p.z, R3.headingAus(p.tx, p.tz)); f.driver.zurueckgesetzt(); f.resets++;
            f.looping = LP3.zustand(); f.flug = S3.zustand(); f.vehicle.imLooping = false; f.vehicle.imFlug = false;
            return;
          }
          let r;
          if (f.looping.aktiv || f.looping.fallen || !(st.loopings && st.loopings.length)) {
            r = (f.looping.aktiv || f.looping.fallen) ? LP3.fahrzeugSchritt(f.looping, f.vehicle, st, s, dt, f.index)
              : S3.fahrzeugSchritt(f.flug, f.vehicle, st, s, dt, f.index);
          } else r = LP3.fahrzeugSchritt(f.looping, f.vehicle, st, s, dt, f.index);
          f.index = r.index;
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
      pruefe(`[${daten.id}/${welt}] 7 Stufen gemeinsam, rempeln echt, 2 Runden: alle im Ziel, Resets ≤ 1, keine NaN`, ok,
        'Zeit ' + (schritte * dt).toFixed(0) + ' s, im Ziel ' + tn.filter(t => t.imZiel).length + '/7, Resets ' + resets +
        ' (' + fz.filter(f => f.resets).map(f => f.driver.name + ' ' + f.resets).join(', ') + '), Stöße ' + stoesse + ', Dreher ' + dreher +
        ', KI-Rempler ' + rempler + ', Baum-Treffer ' + baeume);
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
      const zeilen = [];
      let allesOk = true;
      for (const stufe of STUFEN) {
        const st = new R4.Strecke(daten, { welt });
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
      pruefe(`[${daten.id}/${welt}] W2-C mit Dynamik: 7 Stufen × 2 Runden im Ziel, 0 Resets, Lava gemieden`, allesOk, zeilen.join(', '));
    }
  }
}

// W2-C1: Die KI kennt Krater nach dem Einschlag (hindernisseSetzen zur Laufzeit) → ab profi höchstens jeder 4. Krater getroffen
if (!process.env.OHNE_DYNAMIK && (!nurId || nurId === 'dino')) {
  const profiPlus = ['profi', 'meister', 'legende', 'unschlagbar'];
  const tr = profiPlus.reduce((a, k) => a + (kraterSumme[k] || 0), 0), an = profiPlus.reduce((a, k) => a + (kraterAnzahl[k] || 0), 0);
  pruefe('[dino] W2-C1: KI profi+ weicht Kratern aus (Treffer ≤ 25 % der Krater auf der Fahrbahn)', an > 0 && tr <= an * 0.25,
    'Treffer ' + tr + ' bei ' + an + ' Kratern; je Stufe ' + JSON.stringify(kraterSumme));
}

if (process.env.ARTEN) console.log(JSON.stringify(ARTEN));
console.log(fehler === 0 ? '\nALLE TESTS OK' : '\n' + fehler + ' FEHLER');
process.exit(fehler ? 1 : 0);
