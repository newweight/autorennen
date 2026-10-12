// Node-Test Pickups (Runde 4, src/world/pickups.js): node tests/test_pickups.js
// Turbo: Faktoren 2,5 s (vMax × 1,25, Beschleunigung × 1,5), danach Auslauf auf 1 ohne Tempo-Sprung, Auto wird schneller
// (Einbau wie main.js: daten vor vehicle.schritt multiplizieren, danach exakt zurück). Schild: aufsammeln, blockt genau
// EINEN Treffer (schildVerbrauchen + vorTreffern/nachTreffern), Kugel nach 10 s wieder da. Welten: nur „Verrückt".
// KI (alle 7 Stufen, Wiese „Verrückt", 2 Runden): nimmt Turbo-Felder/Schilde ohne Umbau mit (Info + mind. 1 Turbo gesamt).
const { ladeModule } = require('./lade');
const R = ladeModule(['src/config.js', 'src/physics/vehicle.js', 'src/track/spline.js', 'src/track/trackCatalog.js',
  'src/track/trackBuilder.js', 'src/world/pickups.js', 'src/race/raceManager.js', 'src/physics/collisions.js', 'src/ai/driver.js']);

let fehler = 0;
function pruefe(name, ok, info) { console.log((ok ? 'OK   ' : 'FEHL ') + name + (info ? '  (' + info + ')' : '')); if (!ok) fehler++; }
const dt = R.config.physik.schritt, B = R.config.stunt.boost, CS = R.config.stunt.schild;
const katalog = (id) => R.trackCatalog.find(t => t.id === id);
const strecke = new R.Strecke(katalog('wiese'), { welt: 'verrueckt' });
// Turbo-Physik auf einem Oval mit 2 km langen Geraden (keine Kurve stört die Tempo-Messung)
const ovalPunkte = [];
for (let z = 0; z > -2000; z -= 50) ovalPunkte.push([0, 0, z]);
for (let w = 0; w < Math.PI; w += Math.PI / 16) ovalPunkte.push([300 - 300 * Math.cos(w), 0, -2000 - 300 * Math.sin(w)]);
for (let z = -2000; z < 0; z += 50) ovalPunkte.push([600, 0, z]);
for (let w = 0; w < Math.PI; w += Math.PI / 16) ovalPunkte.push([300 + 300 * Math.cos(w), 0, 300 * Math.sin(w)]);
const oval = new R.Strecke({ id: 'oval', name: 'Oval', thema: 'wiese', breite: 14, randBreite: 1.5, punkte: ovalPunkte, huegel: [],
  boostFelder: [{ s: 300, seitenabstand: 0, laenge: 12 }, { s: 900, seitenabstand: 2, laenge: 12 }], schilde: [] });
const sp = oval.spline;

/** main.js-Einbau: Faktoren nur für vehicle.schritt anwenden, danach exakt zurück. */
function schrittMitFaktoren(pk, i, v, s) {
  const fk = pk.faktoren(i), d = v.daten, vm0 = d.vMax, b0 = d.beschleunigung;
  d.vMax = vm0 * fk.vMax; d.beschleunigung = b0 * fk.beschleunigung;
  // Lenkhilfe hält das Testauto auf der Straße (wie die Fahrhilfe im Spiel)
  const n = oval.abfrage(v.x, v.z), p = sp.punktBei(n.s);
  v.untergrund = n.untergrund;
  v.schritt(dt, s, { lenkhilfe: 1, bremshilfe: 0, tangente: { tx: p.tx, tz: p.tz }, seitenabstand: n.seitenabstand });
  d.vMax = vm0; d.beschleunigung = b0;
  return n;
}
function autoBei(s, q, v0) {
  const p = sp.punktBei(s), v = new R.Vehicle({});
  v.setzen(p.x + p.nx * q, p.z + p.nz * q, R.headingAus(p.tx, p.tz)); v.vLaengs = v0 || 0;
  return v;
}

// ---------- Turbo ----------
pruefe('Wiese Verrückt: 2 Turbo-Felder, 2 Schild-Kugeln', (() => { const pk = new R.Pickups(strecke); return pk.felder.length === 2 && pk.kugeln.length === 2 && pk.aktiv; })());
{
  const pk = new R.Pickups(oval), F = pk.felder[0];
  const v = autoBei(F.s - 20, F.q, 30);
  const d0 = Object.assign({}, v.daten);
  let ev = [], t = 0, tTurbo = -1, mitTurbo = [], minA = Infinity;
  for (let k = 0; k < 60 * 10; k++) {
    const vAlt = v.vLaengs;
    schrittMitFaktoren(pk, 0, v, { gas: 1, bremse: 0, lenkung: 0 });
    const e = pk.schritt(dt, [v]); t += dt;
    if (e.length) { ev = ev.concat(e); if (tTurbo < 0) tTurbo = t; }
    if (tTurbo >= 0) mitTurbo.push({ t: t - tTurbo, f: Object.assign({}, pk.faktoren(0)), v: v.vLaengs });
    if (tTurbo >= 0) minA = Math.min(minA, (v.vLaengs - vAlt) / dt);
  }
  pruefe('Überfahren → genau 1 Ereignis turbo', ev.length === 1 && ev[0].typ === 'turbo' && ev[0].nr === 0, JSON.stringify(ev));
  const bei = (x) => mitTurbo.reduce((b, m) => (Math.abs(m.t - x) < Math.abs(b.t - x) ? m : b), mitTurbo[0]);
  // Feld 12 m bei ~30 m/s → Zeit wird ~0,4 s lang aufgefrischt; Turbo endet 2,5 s nach dem Verlassen
  const ende = mitTurbo.find(m => m.f.beschleunigung === 1);
  pruefe('Faktoren im Turbo: vMax 1,25, Beschleunigung 1,5', bei(1).f.vMax === B.vMaxFaktor && bei(1).f.beschleunigung === B.beschleunigungFaktor);
  pruefe('Turbo dauert 2,5 s ab dem Verlassen des Feldes (Beschleunigung × 1,5)', ende && ende.t > B.dauer && ende.t < B.dauer + 0.6,
    'Ende nach ' + (ende ? ende.t.toFixed(2) : '?') + ' s ab Feldbeginn');
  const auslauf = mitTurbo.find(m => m.f.vMax === 1);
  pruefe('Auslauf: vMax-Faktor sinkt in 2 s auf 1', auslauf && Math.abs(auslauf.t - ende.t - B.auslauf) < 0.05, ((auslauf ? auslauf.t : 0) - ende.t).toFixed(2) + ' s');
  pruefe('vehicle.daten nach jedem Schritt unverändert (vMax/beschleunigung)', v.daten.vMax === d0.vMax && v.daten.beschleunigung === d0.beschleunigung);
  const vMaxNormal = d0.vMax;
  const spitze = Math.max(...mitTurbo.map(m => m.v));
  console.log('INFO Turbo aus 30 m/s: Spitze ' + (spitze * 3.6).toFixed(0) + ' km/h (vMax ' + (vMaxNormal * 3.6).toFixed(0) + ' km/h)');
  pruefe('Kein Tempo-Sprung am Ende (Verzögerung ≥ −12 m/s²)', minA >= -12, 'min ' + minA.toFixed(1) + ' m/s²');
}
// ---------- Turbo bei Höchsttempo: über vMax hinaus ----------
{
  const pk = new R.Pickups(oval), F = pk.felder[0];
  const v = autoBei(F.s - 40, F.q, 0); v.vLaengs = v.daten.vMax;
  let maxV = 0, minA = Infinity;
  for (let k = 0; k < 60 * 8; k++) {
    const vAlt = v.vLaengs;
    schrittMitFaktoren(pk, 0, v, { gas: 1, bremse: 0, lenkung: 0 });
    pk.schritt(dt, [v]);
    maxV = Math.max(maxV, v.vLaengs); minA = Math.min(minA, (v.vLaengs - vAlt) / dt);
  }
  pruefe('Bei vMax: Turbo bringt deutlich über vMax (≥ +8 %), danach zurück auf vMax', maxV > v.daten.vMax * 1.08 && Math.abs(v.vLaengs - v.daten.vMax) < 0.5,
    (maxV * 3.6).toFixed(0) + ' km/h statt ' + (v.daten.vMax * 3.6).toFixed(0) + ', Ende ' + (v.vLaengs * 3.6).toFixed(0) + ', min a ' + minA.toFixed(1) + ' m/s²');
}
// ---------- Feld knapp verfehlt ----------
{
  const pk = new R.Pickups(oval), F = pk.felder[1];
  const v = autoBei(F.s - 10, F.q + F.halb + 1.5, 30);
  let n = 0;
  for (let k = 0; k < 90; k++) { v.untergrund = oval.untergrundAn(v.x, v.z); v.schritt(dt, { gas: 1 }); n += pk.schritt(dt, [v]).length; }
  pruefe('Neben dem Feld (Rand + 1,5 m): kein Turbo', n === 0 && pk.faktoren(0).vMax === 1);
  const w = autoBei(F.s - 10, F.q + F.halb + 0.5, 30), pk2 = new R.Pickups(oval);
  let m = 0;
  for (let k = 0; k < 90; k++) { w.untergrund = oval.untergrundAn(w.x, w.z); w.schritt(dt, { gas: 1 }); m += pk2.schritt(dt, [w]).length; }
  pruefe('Auto-Mitte 0,5 m neben dem Feldrand: Turbo (Autobreite zählt)', m === 1);
}

// ---------- Schild ----------
{
  const pk = new R.Pickups(strecke), K = pk.kugeln[0], ws = strecke.spline;
  const bei = (s0, q, v0) => { const p = ws.punktBei(s0), v = new R.Vehicle({}); v.setzen(p.x + p.nx * q, p.z + p.nz * q, R.headingAus(p.tx, p.tz)); v.vLaengs = v0; return v; };
  const v = bei(K.s - 15, K.q, 20), andere = bei(K.s - 30, K.q, 20);
  let ev = [];
  for (let k = 0; k < 60; k++) {
    v.schritt(dt, { gas: 0 }); andere.schritt(dt, { gas: 0 });
    ev = ev.concat(pk.schritt(dt, [v, andere]));
  }
  pruefe('Kugel aufgesammelt → Ereignis schild, hatSchild(0)', ev.length === 1 && ev[0].typ === 'schild' && ev[0].nr === 0 && pk.hatSchild(0), JSON.stringify(ev));
  pruefe('Kugel weg, zweites Auto bekommt keinen Schild', !K.da && !pk.hatSchild(1));
  pruefe('Erster Treffer: schildVerbrauchen → true, Schild weg, Hülle platzt', pk.schildVerbrauchen(0) === true && !pk.hatSchild(0) && pk.autos[0].platzt > 0 && pk.geplatzt.length === 1);
  pruefe('Zweiter Treffer: schildVerbrauchen → false (genau EIN Treffer geblockt)', pk.schildVerbrauchen(0) === false);
  // Respawn nach 10 s (ab dem Aufsammeln gezählt)
  const pk3 = new R.Pickups(strecke), K3 = pk3.kugeln[1], auf = new R.Vehicle({});
  auf.setzen(K3.x, K3.z, 0);
  const e3 = pk3.schritt(dt, [auf]);
  auf.setzen(K3.x + 50, K3.z, 0);
  let t = 0;
  while (!K3.da && t < 20) { pk3.schritt(dt, [auf]); t += dt; }
  pruefe('Kugel erscheint 10 s nach dem Aufsammeln wieder', e3.length === 1 && K3.da && Math.abs(t - CS.wiederDa) <= dt + 1e-9, t.toFixed(3) + ' s');
  // vorTreffern/nachTreffern: Treffer, die ein System schon angewendet hat (z. B. Ball: Tempo −60 %)
  const pk2 = new R.Pickups(strecke), a = bei(100, 0, 30), b = bei(140, 0, 30);
  pk2._auto(0).schild = true;
  pk2.vorTreffern([a, b]);
  a.vLaengs *= 0.4; a.vQuer = 6; b.vLaengs *= 0.4;          // „Ball" trifft beide, a zweimal
  const bleiben = pk2.nachTreffern([a, b], [{ nr: 0, typ: 'ball' }, { nr: 1, typ: 'ball' }, { nr: 0, typ: 'wasser' }]);
  pruefe('nachTreffern: Auto mit Schild → Tempo/Drift zurück, beide Treffer weg; Auto ohne Schild bleibt getroffen',
    a.vLaengs === 30 && a.vQuer === 0 && b.vLaengs === 12 && bleiben.length === 1 && bleiben[0].nr === 1 && !pk2.hatSchild(0), JSON.stringify(bleiben));
  pk2.vorTreffern([a, b]); a.vLaengs = 10;
  const nochmal = pk2.nachTreffern([a, b], [{ nr: 0 }]);
  pruefe('Danach wirkt der nächste Treffer normal', nochmal.length === 1 && a.vLaengs === 10);
  pk.zuruecksetzen();
  pk._auto(0).turbo = 2; pk._auto(0).vFaktor = 1.25; pk.zuruecksetzen();
  pruefe('zuruecksetzen: Kugeln da, keine Schilde/Turbos', pk.kugeln.every(k => k.da) && !pk.hatSchild(0) && pk.faktoren(0).vMax === 1 && !pk.turboAktiv(0));
}
// ---------- Im Flug/Looping: nichts aufsammeln ----------
{
  const pk = new R.Pickups(oval), F = pk.felder[0];
  const v = autoBei(F.s - 5, F.q, 30); v.imFlug = true;
  let n = 0;
  for (let k = 0; k < 60; k++) { v.schritt(dt, { gas: 1 }); n += pk.schritt(dt, [v]).length; }
  pruefe('Auto im Flug über dem Feld: kein Turbo', n === 0);
}

// ---------- Welten ----------
['wiese', 'wald', 'wueste', 'fantasie'].forEach((id) => {
  const d = katalog(id);
  Object.keys(d.welten).forEach((w) => {
    const pk = new R.Pickups(new R.Strecke(d, { welt: w })), sollF = d.welten[w].boost ? d.boostFelder.length : 0, sollK = d.welten[w].schild ? d.schilde.length : 0;
    pruefe(id + '/' + w + ': ' + sollF + ' Turbo-Felder, ' + sollK + ' Schilde', pk.felder.length === sollF && pk.kugeln.length === sollK);
  });
});

// ---------- KI nimmt Pickups mit (ohne driver-Umbau) ----------
{
  const STUFEN = Object.keys(R.config.schwierigkeiten).sort((x, y) => R.config.schwierigkeiten[x].rang - R.config.schwierigkeiten[y].rang);
  ['wiese', 'fantasie'].forEach((id) => {
    const st = new R.Strecke(katalog(id), { welt: 'verrueckt' });
    let turbos = 0, schilde = 0;
    const zeilen = [];
    STUFEN.forEach((stufe, nr) => {
      const start = st.startpositionen(1)[0], v = new R.Vehicle({});
      v.setzen(start.x, start.z, start.heading);
      const rennen = new R.RaceManager(st, [{ vehicle: v, name: 'KI', istSpieler: false }], { runden: 2, countdown: 0 });
      const d = new R.Driver(v, st, { schwierigkeit: stufe, seed: 3 + nr * 17, name: 'KI' });
      const t = rennen.teilnehmer[0], pk = new R.Pickups(st);
      let index = -1;
      for (let k = 0; k < 60 * 300 && !t.imZiel; k++) {
        const s = d.steuerung(dt, { andere: [], spielerFortschrittMax: null, eigenerFortschritt: t.fortschritt, laeuft: true });
        const n = st.abfrage(v.x, v.z, index); index = n.index; v.untergrund = n.untergrund;
        const fk = pk.faktoren(0), dd = v.daten, vm0 = dd.vMax, b0 = dd.beschleunigung;
        dd.vMax = vm0 * fk.vMax; dd.beschleunigung = b0 * fk.beschleunigung;
        v.schritt(dt, s);
        dd.vMax = vm0; dd.beschleunigung = b0;
        pk.schritt(dt, [v]);
        if (pk.hatSchild(0)) pk.schildVerbrauchen(0);      // sofort verbrauchen → kann wieder sammeln
        rennen.schritt(dt);
      }
      turbos += pk.autos[0].turbos; schilde += pk.autos[0].schilde;
      zeilen.push(stufe + ' ' + pk.autos[0].turbos + 'T/' + pk.autos[0].schilde + 'S' + (t.imZiel ? '' : ' (nicht im Ziel!)'));
      if (!t.imZiel) pruefe('KI ' + id + ' ' + stufe + ' im Ziel (mit Turbo)', false);
    });
    pruefe('KI ' + id + ' Verrückt (7 Stufen × 2 Runden): nimmt Turbo-Felder und Schilde mit', turbos > 0 && schilde > 0,
      'Turbos ' + turbos + ', Schilde ' + schilde + ' | ' + zeilen.join(', '));
  });
}

// ---------- Runde 6 (W3-H): Ölfalle ----------
{
  const CO = R.config.stunt.oelfalle, st = strecke, spl = st.spline;
  const bei = (s, q) => { const p = spl.punktBei(s), v = new R.Vehicle({}); v.setzen(p.x + p.nx * (q || 0), p.z + p.nz * (q || 0), R.headingAus(p.tx, p.tz)); return v; };
  const frisch = () => new R.Pickups(st);
  const pk0 = frisch();
  pruefe('Ölfalle: ein Ölfass je Schild-Kugel (Verrückt)', pk0.faesser.length === pk0.kugeln.length && pk0.faesser.length === 2 && pk0.aktiv);
  pruefe('Ölfalle: Tasten Space / KeyE', R.config.tasten.item1 === 'Space' && R.config.tasten.item2 === 'KeyE');

  // Aufsammeln, Fass weg, nach 10 s wieder da
  {
    const pk = frisch(), F = pk.faesser[0], v = bei(F.s, F.q);
    const ev = pk.schritt(dt, [v]);
    pruefe('Ölfalle: Aufsammeln → Ereignis oel + Item', ev.some(e => e.typ === 'oel' && e.nr === 0) && pk.itemVon(0) === 'oel' && !F.da, JSON.stringify(ev));
    v.setzen(v.x + 100, v.z, 0);
    for (let t = 0; t < CO.wiederDa - 0.2; t += dt) pk.schritt(dt, [v]);
    const nochWeg = !F.da;
    for (let t = 0; t < 0.5; t += dt) pk.schritt(dt, [v]);
    pruefe('Ölfalle: Fass respawnt nach 10 s', nochWeg && F.da);
    // ein Item reicht: zweites Fass wird nicht eingesammelt
    const F2 = pk.faesser[1], v2 = bei(F2.s, F2.q);
    pk.schritt(dt, [v2]);
    pruefe('Ölfalle: mit Item kein zweites Aufsammeln', F2.da && pk.itemVon(0) === 'oel');
  }

  // Legen: 8 m hinter dem Auto, Item weg; ohne Item nichts
  {
    const pk = frisch(), v = bei(300, 0), F = pk.faesser[0];
    pk.schritt(dt, [v]);
    pruefe('Ölfalle: ohne Item legt oelLegen nichts', pk.oelLegen(0) === null && pk.oel.length === 0);
    pk.autos[0].item = 1;
    const o = pk.oelLegen(0), r = v.richtung();
    const hinten = (v.x - o.x) * r.x + (v.z - o.z) * r.z, quer = Math.abs((v.x - o.x) * r.z - (v.z - o.z) * r.x);
    pruefe('Ölfalle: Fleck 8 m hinter dem Auto, Item verbraucht', Math.abs(hinten - CO.abstand) < 1e-6 && quer < 1e-6 && pk.itemVon(0) === null && pk.oel.length === 1,
      'hinten ' + hinten.toFixed(2));

    // Wirkung für ein anderes Auto: im Fleck → true (Untergrund 'oel' = grip 0,25), daneben false
    const b = new R.Vehicle({}); b.setzen(o.x, o.z, o.heading);
    pruefe('Ölfalle: anderes Auto im Fleck → Wirkung', pk.oelWirkt(1, b) === true && pk.rutscher.length === 1);
    pruefe('Ölfalle: Untergrund oel = grip 0,25 (rutschig)', R.config.physik.untergrund.oel.grip === 0.25 && b.gripGesamt('oel') < 0.3 * b.gripGesamt('strasse'),
      b.gripGesamt('oel').toFixed(2) + ' vs ' + b.gripGesamt('strasse').toFixed(2));
    b.setzen(o.x + 8, o.z, o.heading);
    pruefe('Ölfalle: neben dem Fleck keine Wirkung', pk.oelWirkt(1, b) === false);
    // Ellipse: längs ±3,2 m, quer ±2,6 m
    const rr = { x: -Math.sin(o.heading), z: -Math.cos(o.heading) };
    b.setzen(o.x + rr.x * 3.0, o.z + rr.z * 3.0, o.heading);
    const l1 = pk.oelWirkt(1, b);
    b.setzen(o.x + rr.x * 3.5, o.z + rr.z * 3.5, o.heading);
    pruefe('Ölfalle: Fleck-Ausdehnung längs 3,2 m', l1 === true && pk.oelWirkt(1, b) === false);

    // Immunität des legenden Autos 1 s
    v.setzen(o.x, o.z, o.heading);
    pruefe('Ölfalle: eigenes Auto 1 s immun', pk.oelWirkt(0, v) === false);
    for (let t = 0; t < CO.immun + 0.1; t += dt) pk.schritt(dt, [v]);
    pruefe('Ölfalle: danach wirkt der Fleck auch auf das eigene Auto', pk.oelWirkt(0, v) === true);

    // sichtbar 20 s
    let t0 = 0;
    for (; t0 < CO.dauer - 1.2 - CO.immun; t0 += dt) pk.schritt(dt, [bei(100)]);
    const nochDa = pk.oel.length === 1;
    for (let t = 0; t < 1.5; t += dt) pk.schritt(dt, [bei(100)]);
    pruefe('Ölfalle: Fleck bleibt 20 s, dann weg', nochDa && pk.oel.length === 0);
  }

  // Schild schützt vor Öl (verbraucht, genau dieser Fleck wirkt dann nicht mehr)
  {
    const pk = frisch(), v = bei(300, 0), b = bei(300, 0);
    pk.schritt(dt, [v, b]);
    pk.autos[0].item = 1; const o = pk.oelLegen(0);
    b.setzen(o.x, o.z, o.heading);
    pk.autos[1].schild = true;
    const w1 = pk.oelWirkt(1, b);
    pruefe('Ölfalle: Schild fängt den Fleck ab (verbraucht)', w1 === false && !pk.hatSchild(1) && pk.geplatzt.length === 1);
    pruefe('Ölfalle: derselbe Fleck wirkt für das Auto nicht mehr', pk.oelWirkt(1, b) === false);
    pk.autos[0].item = 1; const o2 = pk.oelLegen(0);
    b.setzen(o2.x, o2.z, o2.heading);
    pruefe('Ölfalle: ein weiterer Fleck wirkt ohne Schild', pk.oelWirkt(1, b) === true);
  }

  // Limit 6, der älteste weicht
  {
    const pk = frisch(), v = bei(300, 0);
    pk.schritt(dt, [v]);
    const xs = [];
    for (let k = 0; k < 8; k++) { v.setzen(v.x + 5, v.z, v.heading); pk.autos[0].item = 1; xs.push(pk.oelLegen(0)); }
    pruefe('Ölfalle: höchstens 6 Flecken gleichzeitig, die ältesten weichen', pk.oel.length === CO.max && !pk.oel.includes(xs[0]) && !pk.oel.includes(xs[1]) && pk.oel.includes(xs[7]));
  }

  // KI-Logik deterministisch + Wahrscheinlichkeit
  {
    const lauf = (abstand, runden, seedPk) => {
      const pk = frisch(); if (seedPk) pk._rnd = seedPk;
      const sp0 = 400, spieler = bei(sp0, 0), ki = bei(sp0 + 10, 0);
      const liste = [{ vehicle: spieler, istSpieler: true }, { vehicle: ki, istSpieler: false }];
      pk.schritt(dt, liste);
      let gelegt = 0, chancen = 0;
      for (let r = 0; r < runden; r++) {
        pk.autos[1].item = 1; pk.autos[1].itemZeit = 5;
        // Spieler weit hinten → keine Gelegenheit; dann dicht dahinter → eine Gelegenheit
        let p = spl.punktBei(sp0 - 40); spieler.setzen(p.x, p.z, R.headingAus(p.tx, p.tz)); pk.schritt(dt, liste);
        p = spl.punktBei(sp0 + 10 - abstand); spieler.setzen(p.x, p.z, R.headingAus(p.tx, p.tz));
        const ev = pk.schritt(dt, liste); chancen++;
        const vorher = pk.oel.length;
        gelegt += ev.filter(e => e.typ === 'oelGelegt').length;
        // weitere Schritte in derselben Gelegenheit würfeln nicht erneut
        for (let k = 0; k < 20; k++) gelegt += pk.schritt(dt, liste).filter(e => e.typ === 'oelGelegt').length;
        void vorher;
      }
      return { gelegt, chancen, oel: pk.oel.length, item: pk.itemVon(1) };
    };
    const a = lauf(10, 300), b = lauf(10, 300), fern = lauf(25, 100);
    pruefe('Ölfalle KI: deterministisch (zwei Läufe identisch)', a.gelegt === b.gelegt && a.oel === b.oel, a.gelegt + ' von ' + a.chancen);
    pruefe('Ölfalle KI: ~30 % je Gelegenheit (Spieler ≤ 15 m hinter ihr)', a.gelegt / a.chancen > 0.22 && a.gelegt / a.chancen < 0.38, (100 * a.gelegt / a.chancen).toFixed(1) + ' %');
    pruefe('Ölfalle KI: Spieler > 15 m hinter ihr → nie', fern.gelegt === 0 && fern.oel === 0);
    pruefe('Ölfalle KI: höchstens 6 Flecken auch bei vielen Gelegenheiten', a.oel <= 6);
    // KI legt nur mit Item und erst nach kiNachlauf, nie vor dem Spieler (Spieler vor der KI → keine Gelegenheit)
    const pk = frisch(), sp0 = 400, spieler = bei(sp0 + 10), ki = bei(sp0);
    const liste = [{ vehicle: spieler, istSpieler: true }, { vehicle: ki, istSpieler: false }];
    pk.schritt(dt, liste); pk.autos[1].item = 1; pk.autos[1].itemZeit = 5;
    let n = 0; for (let k = 0; k < 600; k++) n += pk.schritt(dt, liste).filter(e => e.typ === 'oelGelegt').length;
    pruefe('Ölfalle KI: Spieler VOR der KI → keine Gelegenheit', n === 0);
  }

  // KI-Auto mit Öl-Untergrund schlingert (Vehicle-Physik): Fleck ohne Lenkausgleich → Querbewegung
  {
    const v = new R.Vehicle({}); v.setzen(0, 0, 0); v.vLaengs = 30;
    let maxQ = 0;
    for (let k = 0; k < 90; k++) { v.untergrund = 'oel'; v.schritt(dt, { gas: 0.5, bremse: 0, lenkung: k < 20 ? 0.6 : -0.6 }); maxQ = Math.max(maxQ, Math.abs(v.vQuer)); }
    const w = new R.Vehicle({}); w.setzen(0, 0, 0); w.vLaengs = 30;
    let maxQs = 0;
    for (let k = 0; k < 90; k++) { w.untergrund = 'strasse'; w.schritt(dt, { gas: 0.5, bremse: 0, lenkung: k < 20 ? 0.6 : -0.6 }); maxQs = Math.max(maxQs, Math.abs(w.vQuer)); }
    pruefe('Ölfalle: auf Öl schlingert das Auto (vQuer > 0,5 m/s, mehr als auf Straße)', maxQ > 0.5 && maxQ > maxQs, 'Öl ' + maxQ.toFixed(2) + ' / Straße ' + maxQs.toFixed(2));
  }
}

console.log(fehler === 0 ? '\nALLE TESTS OK' : '\n' + fehler + ' FEHLER');
process.exit(fehler ? 1 : 0);
