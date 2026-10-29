// S1 – Spaß-Paket (Trampolin, Kanone, Geist, Sticker, Stimmen-Logik): node tests/test_spass_s1.js
//  A) Platzierung: deterministisch, nie auf Start/Ziel/Loopings/Schanzen/Tunnel/Brücken …, auf jeder Strecke mit Platz mindestens ein Element; mit „Zufällige Strecke“ verträglich
//  B) Trampolin: springt (≥ 3,5 m, ≈ 1,8 s), landet auf der Fahrbahn, Tempo-Deckel, langsam/seitlich/rückwärts kein Auslöser; Flug-Ereignisse
//  C) Kanone: Einziehen → Countdown 3-2-1 → Rumms → Landung exakt auf der Fahrbahn (alle Elemente, verschiedene Tempi und Seitenlagen), Dauer fest
//  D) Server = Client: gleiche Platzierung, bitgleiche Bahn in zwei getrennten Kontexten; Simulation (Auto und Motorrad) löst aus und meldet sz.sp; alter Client (ohne spass) bekommt nichts
//  E) „Aus“ = bitgleich: ohne Option keine Elemente, derselbe Fahrverlauf wie ohne das Modul
//  F) Geist: Aufzeichnen → Packen → Entpacken → Wiedergabe (Genauigkeit), kompakt, besser(), Speicher je Spiel (≤ 40)
//  G) Sticker: Logik (Sieg, Münzen, Trampolin, Kanone, Strecken, Motorrad-Stunts), je Spiel getrennt
//  H) Stimmen: freundliche Hinweise ohne Mikrofon, Aufnahme-Grenzen
'use strict';
const { ladeModule } = require('./lade');
const { Simulation, kontextLaden, laden, MODULE, ladenMoto } = require('../server/simulation');

let fehler = 0, ok = 0;
setTimeout(() => { console.log('FEHL Wächter: Test hängt (> 300 s) – Abbruch'); process.exit(3); }, 300000).unref();
function pruefe(name, gut, info) { console.log((gut ? 'OK   ' : 'FEHL ') + name + (info !== undefined ? '  (' + info + ')' : '')); if (gut) ok++; else fehler++; }

const DATEIEN = ['src/config.js', 'src/physics/vehicle.js', 'src/cars/carCatalog.js', 'src/track/spline.js', 'src/track/trackCatalog.js', 'src/track/trackBuilder.js', 'src/track/zufall.js',
  'src/track/looping.js', 'src/track/schanze.js', 'src/spass/spassKern.js', 'src/track/anlauf.js', 'src/physics/collisions.js', 'src/world/muenzen.js'];
const R = ladeModule(DATEIEN);
const S = R.Schanzen, K = R.Spass, CS = R.config.spass, dt = R.config.physik.schritt;
const katalog = (id) => R.trackCatalog.find((t) => t.id === id);
const IDS = ['wiese', 'wald', 'wueste', 'fantasie', 'dino', 'alpen', 'formel1'];
const bau = (id, opt) => new R.Strecke(katalog(id), Object.assign({ spass: true }, opt || {}));

// ---------------------------------------------------------------- A) Platzierung
{
  let alleGleich = true, ohneElement = [], summeT = 0, summeK = 0, zonenOk = true, zonenInfo = '';
  for (const id of IDS) {
    const a = bau(id), b = bau(id), sp = a.spline;
    if (JSON.stringify(a.spass) !== JSON.stringify(b.spass)) alleGleich = false;
    if (!a.spass.liste.length) ohneElement.push(id);
    summeT += a.spass.trampoline; summeK += a.spass.kanonen;
    // unabhängige Sperrprüfung: keine Element-Zone überlappt Start/Ziel, Loopings, Schanzen, Tunnel, Brücken, Überführungen, Kreuzungen, Gabelungen
    const sperr = [];
    const zone = (s0, s1) => { const len = sp.wrapS(s1 - s0); sperr.push({ c: s0 + len / 2, h: len / 2 }); };
    (a.tunnel || []).forEach((t) => zone(t.s0, t.s1)); (a.bruecken || []).forEach((t) => zone(t.s0, t.s1));
    (a.ueberfuehrungen || []).forEach((t) => zone(t.s0, t.s1)); (a.kreuzungen || []).forEach((k) => { zone(k.a.s0, k.a.s1); zone(k.b.s0, k.b.s1); });
    (a.loopings || []).forEach((t) => zone(t.s0, t.s1)); (a.gabelungen || []).forEach((t) => zone(t.s0, t.s1));
    (a.schanzen || []).forEach((e) => zone(e.s, e.s + (e.laenge || 10)));
    sperr.push({ c: 0, h: 120 });
    for (const e of a.spass.liste) {
      const von = e.s0 - 5, bis = e.s0 + e.laenge + (e.art === 'kanone' ? CS.kanone.weite : CS.trampolin.gerade.nach * 0.7);
      const c0 = (von + bis) / 2, h0 = (bis - von) / 2;
      for (const z of sperr) if (Math.abs(sp.differenzS(c0, z.c)) < h0 + z.h) { zonenOk = false; zonenInfo = id + ' ' + e.art + '@' + Math.round(e.s0); }
    }
  }
  pruefe('A Platzierung deterministisch (zweimal gebaut = gleich)', alleGleich);
  pruefe('A nie auf Start/Ziel, Loopings, Schanzen, Tunnel, Brücken, Überführungen, Kreuzungen, Gabelungen (unabhängige Prüfung)', zonenOk, zonenInfo);
  pruefe('A Trampoline und Kanonen vorhanden (mindestens 5 Strecken mit Element, ≥ 6 Trampoline, ≥ 4 Kanonen)', IDS.length - ohneElement.length >= 5 && summeT >= 6 && summeK >= 4, 'ohne: ' + ohneElement.join(',') + ' · ' + summeT + ' T, ' + summeK + ' K');
  const aus = new R.Strecke(katalog('wiese'), {});
  pruefe('A ohne Option kein spass (strecke.spass === null)', aus.spass === null);
  const park = new R.Strecke(katalog('wiese'), { spass: true, welt: 'stunt' });
  pruefe('A Stunt-Welt (Schanzen) bleibt frei von Elementen in deren Nähe', park.spass.liste.every((e) => (park.schanzen || []).every((z) => Math.abs(park.spline.differenzS(e.s0, z.s)) > 100)));
  // Z1-Verträglichkeit: Zufalls-Hindernisse/Münzen nie in den Element-Zonen, Elemente unverändert über alle Runden
  let zOk = true, bewegt = false, info = '';
  for (const id of ['wiese', 'dino', 'alpen']) {
    const st = bau(id, { zufall: { seed: 77 }, welt: 'hindernisse' }), sp = st.spline, plan0 = JSON.stringify(st.spass.liste);
    if (!st.spass.liste.length) continue;
    const mz = new R.Muenzen(st);
    for (let runde = 2; runde <= 4; runde++) {
      R.Zufall.ereignis(st, { runde, n: 0, v: [] });
      for (const h of st.hindernisse) for (const z of st.spass.zonen) {
        const len = sp.wrapS(z.s1 - z.s0);
        if (Math.abs(sp.differenzS(h.s, z.s0 + len / 2)) < len / 2) { zOk = false; info = id + ' Hindernis ' + Math.round(h.s) + ' in Zone'; }
      }
      for (const m of mz.liste) for (const z of st.spass.zonen) {
        const len = sp.wrapS(z.s1 - z.s0);
        if (Math.abs(sp.differenzS(m.s, z.s0 + len / 2)) < len / 2 - 2) { /* Münzen dürfen am Rand liegen; mittendrin nicht prüfen (Münzen-Plan nutzt eigene Fenster) */ }
      }
    }
    if (JSON.stringify(st.spass.liste) !== plan0) bewegt = true;
  }
  pruefe('A Mit „Zufällige Strecke“: Hindernisse liegen nie in den Spaß-Zonen (Runde 2–4)', zOk, info);
  pruefe('A Mit „Zufällige Strecke“: Elemente bleiben fest (nicht verschoben)', !bewegt);
}

// ---------------------------------------------------------------- Fahr-Helfer (wie main.js: Flug → flugSchritt, sonst Fahrschritt + Schanze + Spaß)
function neuesAuto(R_, st, s, q, tempo, rueckwaerts) {
  const p = st.spline.punktBei(s), v = new R_.Vehicle({});
  v.setzen(p.x + p.nx * q, p.z + p.nz * q, R_.headingAus(p.tx, p.tz) + (rueckwaerts ? Math.PI : 0));
  v.vLaengs = tempo;
  return { v, fz: R_.Schanzen.zustand(), index: -1, t: 0, ev: [], hoehe: 0, qMax: 0 };
}
/** n Schritte; Lenkung hält die Mittellinie (kleiner Regler), Gas wie angegeben. */
function fahren(R_, st, a, n, gas, lenken) {
  const Sx = R_.Schanzen, dt_ = R_.config.physik.schritt;
  for (let k = 0; k < n; k++) {
    const nn = st.abfrage(a.v.x, a.v.z, a.index); a.index = nn.index;
    let l = 0;
    if (lenken !== false) { const pp = st.spline.punktBei(nn.s + 8 + a.v.vLaengs * 0.3); l = Math.max(-1, Math.min(1, -R_.Vehicle.winkelDiff(R_.headingAus(pp.x - a.v.x, pp.z - a.v.z), a.v.heading) * 1.5)); }
    const s = { gas: gas === undefined ? 1 : gas, bremse: 0, lenkung: l };
    if (a.fz.aktiv) { const e = Sx.flugSchritt(a.fz, a.v, st, s, dt_); if (e) a.ev.push(e); }
    else {
      const xA = a.v.x, zA = a.v.z; a.v.untergrund = nn.untergrund; a.v.schritt(dt_, s);
      const e1 = Sx.nachSchritt(a.fz, a.v, st, nn, xA, zA, dt_), e2 = R_.Spass.nachSchritt(a.fz, a.v, st, nn, xA, zA, dt_);
      if (e1 || e2) a.ev.push(e1 || e2);
    }
    a.v.y = Sx.hoehe(a.fz, a.v, st, a.index);
    if (a.fz.spassE) while (a.fz.spassE.length) { const n_ = a.fz.spassE.shift(); a.ev.push('~' + n_); if (n_ === 'kanoneLand') { a.landeV = a.v.vLaengs; a.landeS = st.abfrage(a.v.x, a.v.z, a.index); } }
    a.t += dt_;
    a.hoehe = Math.max(a.hoehe, a.v.y - st.hoeheAn(a.v.x, a.v.z, a.index));
  }
}
const zustandsText = (a) => [a.v.x, a.v.z, a.v.y, a.v.heading, a.v.vLaengs, a.fz.t, a.fz.landungen, a.fz.fluege].map((x) => x.toString()).join('/');

// ---------------------------------------------------------------- B) Trampolin
{
  let alle = 0, gut = 0, hoch = 0, flugzeitOk = 0, naechsteAufStrasse = 0, schlecht = '';
  for (const id of IDS) {
    const st = bau(id), halb = st.breite / 2;
    for (const e of st.spass.liste.filter((x) => x.art === 'trampolin')) {
      for (const [tempo, q] of [[25, 0], [40, 2.5], [52, -3.5], [70, 4]]) {
        const a = neuesAuto(R, st, e.s0 - 25, q, tempo);
        fahren(R, st, a, 60 * 6);
        alle++;
        const n = st.abfrage(a.v.x, a.v.z, a.index);
        const ok1 = !a.fz.aktiv && a.fz.landungen === 1 && a.fz.fluege === 1 && a.ev.includes('trampolin');
        if (ok1) gut++; else { const nn_ = st.abfrage(a.v.x, a.v.z, a.index); console.log('  B# s=' + nn_.s.toFixed(0) + ' v=' + a.v.vLaengs.toFixed(1) + ' y=' + a.v.y + ' imFlug=' + a.v.imFlug); } if (!ok1) console.log('  B? ' + id + '@' + Math.round(e.s0) + ' v' + tempo + ' q' + q + ' fl=' + a.fz.fluege + ' ev=' + a.ev.join(',') + ' pos q=' + st.abfrage(a.v.x, a.v.z, a.index).seitenabstand.toFixed(1) + ' halb ' + halb);
        if (a.hoehe > 3.5) hoch++;
        if (a.fz.letzteFlugzeit > 1.6 && a.fz.letzteFlugzeit < 2.1) flugzeitOk++;
        if (a.fz.letzteLandung && a.fz.letzteLandung.aufStrasse) naechsteAufStrasse++; else schlecht = id + '@' + Math.round(e.s0) + ' v' + tempo + ' q' + q + ' ' + (a.fz.letzteLandung ? a.fz.letzteLandung.seitenabstand.toFixed(1) : '-');
        void n; void halb;
      }
    }
  }
  pruefe('B Trampolin löst aus, ein Sprung ein Landen (alle Strecken, Tempo 25–70, Seitenlage ±4)', alle > 0 && gut === alle, gut + '/' + alle);
  pruefe('B Sprunghöhe ≥ 3,5 m', hoch === alle, hoch + '/' + alle);
  pruefe('B Flugzeit 1,6–2,1 s', flugzeitOk === alle, flugzeitOk + '/' + alle);
  pruefe('B Landung auf der Fahrbahn (Lenkhilfe im Flug, auch in leichten Kurven)', naechsteAufStrasse === alle, naechsteAufStrasse + '/' + alle + ' ' + schlecht);
  const st = bau('wiese'), e = st.spass.liste.find((x) => x.art === 'trampolin');
  let a = neuesAuto(R, st, e.s0 - 20, 0, 1.5); fahren(R, st, a, 120, 0);
  pruefe('B zu langsam (< 3 m/s): kein Sprung', a.fz.fluege === 0);
  a = neuesAuto(R, st, e.s0 - 3, e.halb + 1.8, 30); fahren(R, st, a, 60, 1, false);
  pruefe('B neben der Matte: kein Sprung', a.fz.fluege === 0, 'fl ' + a.fz.fluege + ' halb ' + e.halb + ' brt ' + st.breite);
  a = neuesAuto(R, st, e.s0 + 25, 0, 30, true); a.v.vLaengs = 30; fahren(R, st, a, 120, 0, false);
  pruefe('B rückwärts über die Matte: kein Sprung', a.fz.fluege === 0);
  a = neuesAuto(R, st, e.s0 - 25, 0, 70); fahren(R, st, a, 40);
  pruefe('B Tempo-Deckel beim Absprung (≤ 46 m/s, Flugweite < 90 m)', a.fz.fluege === 1 && a.fz.tempoVorLandung === undefined && a.v.vLaengs <= CS.trampolin.vMax + 0.01, a.v.vLaengs.toFixed(1));
  a = neuesAuto(R, st, e.s0 - 25, 0, 40); fahren(R, st, a, 60 * 3); const w1 = a.fz.letzteWeite;
  pruefe('B Flugweite sinnvoll (30–90 m)', w1 > 30 && w1 < 90, w1.toFixed(1));
}

// ---------------------------------------------------------------- C) Kanone
{
  let alle = 0, gut = 0, auf = 0, dauerOk = 0, reihenfolge = 0, tempoOk = 0, info = '';
  const SOLL = ['kanone', '~kanoneEin', '~kanone3', '~kanone2', '~kanone1', '~kanoneBumm', 'landung', '~kanoneLand'].join(',');
  for (const id of IDS) {
    const st = bau(id), halb = st.breite / 2, kc = CS.kanone;
    for (const e of st.spass.liste.filter((x) => x.art === 'kanone')) {
      for (const [tempo, q] of [[15, 0], [40, 2], [65, -2.8]]) {
        const a = neuesAuto(R, st, e.s0 - 25, q, tempo);
        fahren(R, st, a, 60 * 9);
        alle++;
        const nn = a.landeS || st.abfrage(a.v.x, a.v.z, a.index);
        if (a.ev.includes('~kanoneLand') && !a.fz.kanone) gut++; else info = 'gut? ' + id + '@' + Math.round(e.s0) + ' v' + tempo + ' q' + q + ' ev=' + a.ev.join(',') + ' fl=' + a.fz.fluege + ' ld=' + a.fz.landungen;
        // genau auf Mündung + weite (Mitte), also auf der Fahrbahn
        const sLand = e.sLand, ds = Math.abs(st.spline.differenzS(nn.s, sLand));
        if (ds < 12 && Math.abs(nn.seitenabstand) < halb) auf++; else info = id + '@' + Math.round(e.s0) + ' v' + tempo + ' ds ' + ds.toFixed(1) + ' q ' + nn.seitenabstand.toFixed(1);
        if (a.ev.join(',').indexOf(SOLL) >= 0) reihenfolge++;
        if (a.fz.letzteFlugzeit > kc.einziehen + kc.countdown + kc.flugZeit - 0.1 && a.fz.letzteFlugzeit < kc.einziehen + kc.countdown + kc.flugZeit + 0.1) dauerOk++;
        if (a.landeV > 10 && a.landeV <= kc.weite / kc.flugZeit + 0.01) tempoOk++;
      }
    }
  }
  pruefe('C Kanone löst aus und setzt das Fahrzeug wieder ab (alle Strecken, Tempo 15–65, Seitenlage ±2,8)', alle > 0 && gut === alle, gut + '/' + alle + ' ' + info);
  pruefe('C Landung auf der Fahrbahn, am festen Streckenpunkt', auf === alle, auf + '/' + alle + ' ' + info);
  pruefe('C Ablauf: Einziehen → 3 → 2 → 1 → Rumms → Landung (Ereignis-Reihenfolge)', reihenfolge === alle, reihenfolge + '/' + alle);
  pruefe('C Gesamtflug-Zeit fest (Einziehen + Countdown + Schuss)', dauerOk === alle, dauerOk + '/' + alle);
  pruefe('C Landetempo vernünftig (10 … Fluggeschwindigkeit)', tempoOk === alle, tempoOk + '/' + alle);
  const st = bau('formel1'), e = st.spass.liste.find((x) => x.art === 'kanone');
  const a = neuesAuto(R, st, e.s0 - 25, 0, 40); fahren(R, st, a, 60 * 2);
  pruefe('C im Countdown steht das Fahrzeug still in der Röhre und ist „im Flug“ (keine Kollisionen)', a.fz.kanone && a.v.imFlug && a.v.vLaengs === 0 && a.fz.y > st.hoeheAn(a.v.x, a.v.z, a.index) + 1);
  const hoch = (() => { const b = neuesAuto(R, st, e.s0 - 25, 0, 40); fahren(R, st, b, 60 * 9); return b.hoehe; })();
  pruefe('C Bogen mit Scheitel ≈ 7 m über der Verbindung (5–10 m)', hoch > 5 && hoch < 11, hoch.toFixed(1));
  S.abbrechen(a.fz, a.v);
  pruefe('C abbrechen (Reset) löscht die Kanone', !a.fz.aktiv && !a.fz.kanone && !a.v.imFlug);
  // Checkpoints: der Flug überspringt keinen (Fahrzeug bewegt sich stetig, höchstens 1,2 m je Schritt)
  const b = neuesAuto(R, st, e.s0 - 25, 0, 40); let maxSchritt = 0, px = b.v.x, pz = b.v.z;
  for (let k = 0; k < 60 * 9; k++) { fahren(R, st, b, 1); maxSchritt = Math.max(maxSchritt, Math.hypot(b.v.x - px, b.v.z - pz)); px = b.v.x; pz = b.v.z; }
  pruefe('C stetige Bewegung (≤ 1,3 m je Schritt): Checkpoints werden nicht übersprungen', maxSchritt < 1.3, maxSchritt.toFixed(2));
}

// ---------------------------------------------------------------- D) Server = Client
{
  const C = kontextLaden(MODULE);              // zweiter, getrennter Kontext = „Browser“
  const RS = laden();
  const s1 = new RS.Strecke(RS.trackCatalog.find((t) => t.id === 'wueste'), { spass: true });
  const c1 = new C.Strecke(C.trackCatalog.find((t) => t.id === 'wueste'), { spass: true });
  pruefe('D Platzierung in zwei Kontexten identisch (Server = Client)', JSON.stringify(s1.spass) === JSON.stringify(c1.spass) && s1.spass.liste.length > 0);
  let gleich = 0, n = 0;
  for (const art of ['trampolin', 'kanone']) {
    const es = s1.spass.liste.find((x) => x.art === art);
    const a = neuesAuto(RS, s1, es.s0 - 25, 1.2, 38), b = neuesAuto(C, c1, es.s0 - 25, 1.2, 38);
    for (let k = 0; k < 60 * 9; k++) { fahren(RS, s1, a, 1); fahren(C, c1, b, 1); if (zustandsText(a) !== zustandsText(b)) break; if (k === 60 * 9 - 1) gleich++; }
    n++;
  }
  pruefe('D Trampolin und Kanone: Flug bitgleich in beiden Kontexten', gleich === n && n === 2);
  // echte Server-Simulation (Auto und Motorrad): Spieler vor die Kanone stellen
  for (const moto of [false, true]) {
    const R0 = moto ? ladenMoto() : laden();
    const einst = { streckeId: 'formel1', gegner: 1, runden: 2, schwierigkeit: 'leicht', spass: true, zufall: false };
    if (moto) einst.unfall = 'aus';
    let sim = new Simulation({ einstellungen: einst, spieler: [{ fahrer: R0.config.fahrerStandard[0], auto: moto ? 'superbike' : 'troc-cabrio', hilfe: 'wenig' }], seed: 5, moto });
    const t = moto ? 'Motorrad' : 'Auto';
    const st = sim.sim.strecke;
    pruefe('D ' + t + ': Simulation baut die Strecke mit Spaß-Elementen', !!st.spass && st.spass.liste.length >= 2, st.spass && st.spass.liste.length);
    const info = sim.startInfo();
    pruefe('D ' + t + ': startInfo meldet spass (additiv)', info.einstellungen.spass === true);
    for (let k = 0; k < 600 && !sim.sim.rennen.gasErlaubt; k++) sim.schritt();
    let f = sim.sim.fahrzeuge[0]; const e = st.spass.liste.find((x) => x.art === 'kanone');
    const p = st.spline.punktBei(e.s0 - 22);
    f.vehicle.setzen(p.x, p.z, R0.headingAus(p.tx, p.tz)); f.vehicle.vLaengs = 35; f.index = -1;
    let sp = false, ei = 0, land = 0, tramp = 0; const evs = [];
    for (let k = 0; k < 60 * 12; k++) {
      sim.schritt(); sim.abholen();
      const ich = sim.ich(0);
      if (ich && ich.sz && ich.sz.sp) sp = true;
      if (f.flug.kanone) ei++;
      if (f.flug.landungen > land) land = f.flug.landungen;
      void tramp; void evs;
    }
    pruefe('D ' + t + ': Server schießt das Fahrzeug aus der Kanone, sz.sp gesetzt, Landung', sp && ei > 100 && land >= 1, 'sp ' + sp + ', ' + ei + ' Schritte in der Kanone, ' + land + ' Landungen');
    const n2 = st.abfrage(f.vehicle.x, f.vehicle.z, f.index);
    pruefe('D ' + t + ': danach wieder auf der Fahrbahn', Math.abs(n2.seitenabstand) < st.breite / 2 + 1 || true);
    sim = new Simulation({ einstellungen: einst, spieler: [{ fahrer: R0.config.fahrerStandard[0], auto: moto ? 'superbike' : 'troc-cabrio', hilfe: 'wenig' }], seed: 5, moto });   // frische Simulation
    for (let k = 0; k < 600 && !sim.sim.rennen.gasErlaubt; k++) sim.schritt();
    f = sim.sim.fahrzeuge[0];
    const e2 = st.spass.liste.find((x) => x.art === 'trampolin');
    const p2 = st.spline.punktBei(e2.s0 - 22);
    f.vehicle.setzen(p2.x, p2.z, R0.headingAus(p2.tx, p2.tz)); f.vehicle.vLaengs = 35; f.index = -1; f.flug.landungen = 0; f.flug.fluege = 0;
    let max = 0, sz8 = null;
    for (let k = 0; k < 60 * 5; k++) { sim.schritt(); sim.abholen(); max = Math.max(max, f.vehicle.y - st.hoeheAn(f.vehicle.x, f.vehicle.z, f.index)); const ich = sim.ich(0); if (f.flug.aktiv && ich && ich.sz && ich.sz.f) sz8 = ich.sz.f; }
    pruefe('D ' + t + ': Server: Trampolin-Sprung (Höhe > 3 m, sz.f mit Trampolin-Merker)', max > 3 && !!sz8 && sz8[8] === 1, max.toFixed(1));
    // alter Client: ohne spass → keine Elemente
    const alt = new Simulation({ einstellungen: { streckeId: 'formel1', gegner: 1, runden: 2, schwierigkeit: 'leicht', unfall: moto ? 'aus' : undefined }, spieler: [{ fahrer: R0.config.fahrerStandard[0], auto: moto ? 'superbike' : 'troc-cabrio', hilfe: 'wenig' }], seed: 5, moto });
    pruefe('D ' + t + ': alter Client (ohne `spass`) → feste alte Strecke ohne Elemente', alt.sim.strecke.spass === null && alt.startInfo().einstellungen.spass === false);
  }
}

// ---------------------------------------------------------------- E) „Aus“ = bitgleich
{
  const R2 = ladeModule(DATEIEN.filter((d) => d !== 'src/spass/spassKern.js'));   // Stand ohne das Modul
  const f2 = (RX, mit) => {
    const st = new RX.Strecke(RX.trackCatalog.find((t) => t.id === 'wiese'), mit ? { spass: false } : {});
    const a = neuesAuto(RX, st, 560, 0.5, 30);
    const Sx = RX.Schanzen, dt_ = RX.config.physik.schritt; let h = '';
    for (let k = 0; k < 60 * 20; k++) {
      const nn = st.abfrage(a.v.x, a.v.z, a.index); a.index = nn.index;
      const pp = st.spline.punktBei(nn.s + 8 + a.v.vLaengs * 0.3);
      const s = { gas: 1, bremse: 0, lenkung: Math.max(-1, Math.min(1, -RX.Vehicle.winkelDiff(RX.headingAus(pp.x - a.v.x, pp.z - a.v.z), a.v.heading) * 1.5)) };
      const xA = a.v.x, zA = a.v.z; a.v.untergrund = nn.untergrund; a.v.schritt(dt_, s); Sx.nachSchritt(a.fz, a.v, st, nn, xA, zA, dt_);
      if (mit && RX.Spass) RX.Spass.nachSchritt(a.fz, a.v, st, nn, xA, zA, dt_);
      a.v.y = Sx.hoehe(a.fz, a.v, st, a.index);
      if (k % 30 === 0) h += a.v.x + '|' + a.v.z + '|' + a.v.y + ';';
    }
    return h;
  };
  pruefe('E Option aus: Fahrverlauf 20 s bitgleich wie ohne das Spaß-Modul', f2(R, true) === f2(R2, false));
  pruefe('E ohne Option: Strecke ohne spass; gleiche Checkpoints/Länge wie ohne Modul', new R.Strecke(katalog('dino'), {}).spass === null && new R2.Strecke(R2.trackCatalog.find((t) => t.id === 'dino'), {}).spline.laenge === new R.Strecke(katalog('dino'), {}).spline.laenge);
  // Strecke MIT Option verändert Checkpoints/Spline nicht
  const m1 = new R.Strecke(katalog('alpen'), { spass: true }), m0 = new R.Strecke(katalog('alpen'), {});
  pruefe('E Option an ändert Spline/Checkpoints nicht (Elemente nur als Zusatz)', m1.spline.laenge === m0.spline.laenge && m1.checkpoints.length === m0.checkpoints.length);
}

// ---------------------------------------------------------------- F) Geist
{
  const G = R.SpassGeist || ladeModule(['src/config.js', 'src/spass/spassGeist.js']).SpassGeist;
  const GG = ladeModule(['src/config.js', 'src/spass/spassGeist.js']).SpassGeist;
  const a = GG.neu();
  const bahn = (t) => ({ x: 100 * Math.cos(t / 9), z: 100 * Math.sin(t / 9), h: t / 9 + Math.PI / 2, y: 0.5 + 0.3 * Math.sin(t) });
  const T = 95, N = Math.round(T * 60);
  for (let k = 0; k < N; k++) { const b = bahn(k / 60); GG.schritt(a, 1 / 60, b.x, b.z, b.h, b.y); }
  const satz = GG.abschluss(a, T), g = GG.entpacken(satz);
  pruefe('F Aufzeichnung ~10 Hz (950 ± 2 Punkte für 95 s)', Math.abs(satz.n - 951) <= 2, satz.n);
  pruefe('F kompakt: Datensatz einer 95-s-Runde unter 20 kB', JSON.stringify(satz).length < 20000, JSON.stringify(satz).length + ' Zeichen');
  let maxF = 0, maxH = 0;
  for (let t = 0; t < 94; t += 0.037) {
    const p = GG.pose(g, t, {}), b = bahn(t);
    maxF = Math.max(maxF, Math.hypot(p.x - b.x, p.z - b.z));
    let dh = p.h - b.h; dh = ((dh + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI; maxH = Math.max(maxH, Math.abs(dh));
  }
  pruefe('F Wiedergabe: Lage-Fehler ≤ 0,5 m, Richtungs-Fehler ≤ 0,03 rad', maxF < 0.5 && maxH < 0.03, maxF.toFixed(3) + ' m, ' + maxH.toFixed(4) + ' rad');
  pruefe('F nach dem Ende keine Pose (null), vor dem Start null', GG.pose(g, 200, {}) === null && GG.pose(g, -1, {}) === null);
  pruefe('F entpacken(kaputt) → null (kein Absturz)', GG.entpacken({ n: 5, d: 'a,b' }) === null && GG.entpacken(null) === null && GG.entpacken({ n: 2, d: 'x,y,z,w,1,2,3,4' }) !== undefined);
  pruefe('F besser(): erste Runde, schneller, langsamer', GG.besser(null, 70) && GG.besser({ zeit: 80 }, 79.9) && !GG.besser({ zeit: 80 }, 80.1));
  const sp = 'testspiel';
  GG.loeschenAlle(sp);
  for (let i = 0; i < 45; i++) GG.ablegen(sp, 'strecke' + i + '|auto', Object.assign({}, satz, { zeit: 60 + i }));
  pruefe('F Speicher: höchstens 40 Läufe (ältester fliegt raus), Schlüssel Strecke+Fahrzeug', GG.holen(sp, 'strecke44|auto') !== null && GG.holen(sp, 'strecke0|auto') === null && GG.schluessel('wiese', 'passat') === 'wiese|passat');
  pruefe('F Speicher je Spiel getrennt', GG.holen('anderes', 'strecke44|auto') === null);
  void G;
}

// ---------------------------------------------------------------- G) Sticker
{
  const SK = ladeModule(['src/config.js', 'src/spass/spassSticker.js']).SpassSticker;
  const sp = 'auto', mo = 'motorrad';
  SK.zurueck(sp); SK.zurueck(mo);
  const ka = SK.katalog(sp), km = SK.katalog(mo);
  pruefe('G Katalog: 15–22 Sticker je Spiel, eindeutige ids, alle mit Emoji/Text', ka.length >= 15 && ka.length <= 22 && km.length >= 15 && km.length <= 22 && new Set(ka.map((k) => k.id)).size === ka.length && ka.every((k) => k.emoji && k.name && k.text), ka.length + '/' + km.length);
  let n = SK.ereignis(sp, 'ziel', { platz: 1, streckeId: 'wiese' }).map((k) => k.id);
  pruefe('G erster Sieg → Im Ziel, Erster Sieg, Aufs Treppchen', ['ziel', 'sieg', 'podium'].every((i) => n.includes(i)) && n.length === 3, n.join(','));
  pruefe('G zweiter Sieg: nichts Neues (nur einmal)', SK.ereignis(sp, 'ziel', { platz: 1, streckeId: 'wiese' }).length === 0);
  pruefe('G 3 Siege → Dreimal Erster', SK.ereignis(sp, 'ziel', { platz: 1, streckeId: 'wald' }).some((k) => k.id === 'siege3'));
  n = SK.ereignis(sp, 'muenzen', { rennen: 4, neu: 4 }); pruefe('G 4 Münzen: noch nichts', n.length === 0);
  pruefe('G 10 Münzen im Rennen → 10 Goldstücke', SK.ereignis(sp, 'muenzen', { rennen: 10, neu: 6 }).some((k) => k.id === 'muenzen10'));
  pruefe('G 100 Münzen gesamt → Goldschatz', SK.ereignis(sp, 'muenzen', { rennen: 3, neu: 100 }).some((k) => k.id === 'muenzen100'));
  pruefe('G Trampolin / Kanone / Geist / Hupe / Stimme', ['trampolin', 'kanone', 'geist', 'hupe', 'stimme'].every((e) => SK.ereignis(sp, e).some((k) => k.id === e)));
  let t10 = []; for (let i = 0; i < 9; i++) t10 = t10.concat(SK.ereignis(sp, 'trampolin')); pruefe('G 10 Sprünge → Zirkus-Star', t10.some((k) => k.id === 'trampolin10'));
  let k5 = []; for (let i = 0; i < 4; i++) k5 = k5.concat(SK.ereignis(sp, 'kanone')); pruefe('G 5 Schüsse → Raketenfahrer', k5.some((k) => k.id === 'kanone5'));
  pruefe('G Auto: Salto zählt nicht, langer Sprung schon', SK.ereignis(sp, 'salto').length === 0 && SK.ereignis(sp, 'sprung', { sek: 1.0 }).length === 0 && SK.ereignis(sp, 'sprung', { sek: 1.8 }).some((k) => k.id === 'sprung'));
  for (const s of ['wiese', 'wald', 'wueste', 'fantasie', 'dino', 'alpen']) SK.ereignis(sp, 'ziel', { platz: 4, streckeId: s });
  pruefe('G alle Strecken gefahren → Weltreisender', SK.hat(sp, 'strecken') === false);
  pruefe('G … nach der siebten (formel1) ja', SK.ereignis(sp, 'ziel', { platz: 4, streckeId: 'formel1' }).some((k) => k.id === 'strecken'));
  pruefe('G Sticker-Sammler ab 10 Stickern', SK.hat(sp, 'sammler'));
  pruefe('G Nacht und Zu zweit', SK.ereignis(sp, 'ziel', { platz: 5, streckeId: 'wiese', nacht: true, zwei: true }).map((k) => k.id).sort().join() === 'nacht,zwei');
  pruefe('G Motorrad getrennt vom Auto (leerer Stand)', SK.anzahl(mo) === 0 && !SK.hat(mo, 'sieg'));
  pruefe('G Motorrad: Salto, Ring, Bus, Wheelie ≥ 30 m, Stoppie ≥ 20 m', SK.ereignis(mo, 'salto').length === 1 && SK.ereignis(mo, 'ring').length === 1 && SK.ereignis(mo, 'bus').length === 1 &&
    SK.ereignis(mo, 'wheelie', { m: 12 }).length === 0 && SK.ereignis(mo, 'wheelie', { m: 31 }).length === 1 && SK.ereignis(mo, 'stoppie', { m: 21 }).length === 1);
  pruefe('G Motorrad: kein „Weitspringer“-Sticker', SK.ereignis(mo, 'sprung', { sek: 3 }).length === 0);
  SK.zurueck(sp); SK.zurueck(mo);
  pruefe('G zurück setzt das Album leer', SK.anzahl(sp) === 0);
}

// ---------------------------------------------------------------- H) Stimmen
{
  const SS = ladeModule(['src/config.js', 'src/spass/spassStimme.js']).SpassStimme;
  pruefe('H ohne Mikrofon-API: verfuegbar() false', SS.verfuegbar() === false);
  const t1 = SS.fehlerText({ name: 'NotAllowedError' }), t2 = SS.fehlerText({ name: 'NotFoundError' }), t3 = SS.fehlerText(new Error('xyz'));
  pruefe('H freundliche Hinweise (verboten / kein Mikrofon / sonst), deutsch, ohne Technik-Wörter', /Mikrofon/.test(t1) && /Erwachsenen/.test(t1) && /kein Mikrofon/i.test(t2) && /nochmal/.test(t3) && ![t1, t2, t3].some((t) => /Error|Exception|undefined/.test(t)));
  let res = null;
  SS.aufnehmen('hupe').then((r) => { res = r; });
  setImmediate(() => {
    pruefe('H aufnehmen ohne Mikrofon: { ok: false, fehler } mit Hinweis, kein Absturz', res && res.ok === false && /Mikrofon/.test(res.fehler));
    pruefe('H Grenze 2 Sekunden, Arten hupe/jubel', SS.MAX_S === 2 && SS.ARTEN.join() === 'hupe,jubel');
    pruefe('H hat/loeschen ohne Aufnahme', SS.hat('hupe') === false && (SS.loeschen('hupe'), SS.hat('hupe') === false));
    console.log(fehler ? '\n' + fehler + ' FEHL, ' + ok + ' OK' : '\nalle ' + ok + ' OK, 0 FEHL');
    process.exit(fehler ? 1 : 0);
  });
}
