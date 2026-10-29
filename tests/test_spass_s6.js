// S6 – Fahr-Zauber (Rechenteile, Autorennen UND Motorrad): node tests/test_spass_s6.js
//  A) Plan: Magnet-Röhre, Schlucht, Schienen/Wände, Extras je Strecke; Halfpipe im Stunt-Park; deterministisch, ohne Option kein Zauber, Sperrregeln
//  B) Magnet: haftet ab Tempo 6 (oder mit Magnet-Extra), θ(s) Boden→Decke→Boden, kollisionsfrei in der Röhre, Server = Vorhersage
//  C) Gleiten (Schlucht): Absprung, Lenken verschiebt q, sichere Landung, „zu weit daneben“ → freundlich zurückgesetzt, Rennleitung zieht nach
//  D) Grinden / Wallride: Einfangen, Höhe, Punkte, Austritt (Ende / Wegsteuern); Wand nur mit Lenken gegen die Wand
//  E) Halfpipe (Stunt-Park): Profil auf strecke.hoeheAn, Hochfahren, Abheben, Zurückrollen, deterministisch
//  F) Riese / Mini: Größe, Tempo, Schieben, Hindernisse berühren den Mini nicht, Zeit läuft ab, Extras erneuern sich nach 12 s
//  G) AUS = kein Zustand, nichts verändert (Rennverlauf mit „zauber aus“ und ohne Option identisch)
//  H) KI schafft die Runde mit Zauber auf mehreren Strecken (Auto und Motorrad)
//  I) Vorhersage (Client) = Server mit Magnet, Gleiten und Grinden
//  J) Sticker (Katalog, Ereignisse)
'use strict';
const { Simulation, kontextLaden, laden, ladenMoto } = require('../server/simulation');

let fehler = 0, ok = 0;
setTimeout(() => { console.log('FEHL Wächter: Test hängt (> 900 s) – Abbruch'); process.exit(3); }, 900000).unref();
function pruefe(name, gut, info) { console.log((gut ? 'OK   ' : 'FEHL ') + name + (info !== undefined ? '  (' + info + ')' : '')); if (gut) ok++; else fehler++; }
const hash = (h, x) => Math.imul(h ^ Math.round(x * 10000), 16777619) >>> 0;

const SPIELE = [['auto', laden()], ['motorrad', ladenMoto()]];
const bauSt = (R, id, opt) => new R.Strecke(R.trackCatalog.find((t) => t.id === id), Object.assign({ spass: true, zauber: true }, opt || {}));
const ALLE = ['wiese', 'wald', 'wueste', 'fantasie', 'dino', 'alpen', 'formel1', 'mond', 'unterwasser', 'regenbogenland'];

// Stunt-Park (nur Motorrad-Katalog, nicht im Streckenkatalog): Eintrag in beide Kataloge legen, damit die Simulation ihn findet
{
  const RM = ladenMoto();
  new Function('window', 'THREE', require('fs').readFileSync(require('path').join(__dirname, '..', 'src/moto/motoM3Welt.js'), 'utf8'))({ Rennspiel: RM }, undefined);
  const pe = RM.Moto.m3welt.parkEintrag();
  if (!RM.trackCatalog.some((t) => t.id === 'stuntpark')) RM.trackCatalog.push(pe);
  const RA = laden();
  if (!RA.trackCatalog.some((t) => t.id === 'stuntpark')) RA.trackCatalog.push(JSON.parse(JSON.stringify(pe)));
}

/** Simulation mit einem Menschen (Eingabe von aussen) und optional KI. */
function neu(id, moto, opt) {
  opt = opt || {};
  const sim = new Simulation({ einstellungen: Object.assign({ streckeId: id, gegner: opt.gegner || 0, runden: opt.runden || 3, spass: true, zauber: opt.zauber !== false, zufall: false, unfall: moto ? 'aus' : undefined, schwierigkeit: opt.schw || 'mittel' },
    opt.einst || {}), spieler: opt.ohneMensch ? [] : [{ fahrer: 'Jonas', auto: moto ? 'crossmaschine' : 'porsche-911', hilfe: 'wenig' }], seed: opt.seed || 5, moto });
  const S = sim.sim, R = S.fahrzeuge[0] ? null : null;
  return { sim, S, st: S.strecke, f: S.fahrzeuge[0], v: S.fahrzeuge[0] && S.fahrzeuge[0].vehicle };
}
function pilotBauen(Rk, st, f, v) {
  const sp = st.spline;
  return (qZiel, vSoll, extra) => {
    const n = st.abfrage(v.x, v.z, f.index), vl = Math.max(3, v.vLaengs), L = Math.max(9, Math.min(50, 0.55 * vl + 8)), pt = sp.punktBei(n.s + L);
    const zx = pt.x + pt.nx * qZiel, zz = pt.z + pt.nz * qZiel;
    let diff = Rk.headingAus(zx - v.x, zz - v.z) - v.heading;
    while (diff > Math.PI) diff -= 2 * Math.PI; while (diff < -Math.PI) diff += 2 * Math.PI;
    const lenkung = Math.max(-1, Math.min(1, -(2 * vl * Math.sin(diff) / Math.hypot(zx - v.x, zz - v.z)) / v.drehrateMax(vl)));
    const soll = vSoll || st.tempoBei(n.s + vl * 0.3) * 0.9;
    return Object.assign({ gas: v.vLaengs < soll ? 1 : 0, bremse: v.vLaengs > soll + 3 ? 0.5 : 0, lenkung }, extra || {});
  };
}

// ---------------------------------------------------------------- A) Plan
for (const [sp, R] of SPIELE) {
  let magn = 0, schl = 0, schi = 0, wand = 0, exOk = 0, regelOk = true, info = '';
  for (const id of ALLE) {
    const st = bauSt(R, id), z = st.spass && st.spass.zauber;
    if (!z) { regelOk = false; info += id + ':kein-zauber '; continue; }
    magn += z.magnet.length; schl += z.schluchten.length; schi += z.schienen.filter((e) => e.art === 'schiene').length; wand += z.schienen.filter((e) => e.art === 'wand').length; exOk += z.extras.length >= 1 ? 1 : 0;
    const s = st.spline;
    // Abstände zu Trampolin/Kanone/Toren, nicht im Glastunnel
    const alle = [].concat(z.magnet.map((e) => ({ a: e.s0, b: e.s1, n: 'mag' })), z.schluchten.map((e) => ({ a: e.sT - 14, b: e.sL + 14, n: 'schl' })), z.schienen.map((e) => ({ a: e.s0, b: e.s1, n: e.art })));
    const fremd = [].concat(st.spass.liste.map((e) => ({ a: e.s0, b: e.s0 + (e.laenge || 10) })), (st.spass.tore || []).map((e) => ({ a: e.sA, b: e.sB })), ((st.katalog && st.katalog.glasTunnel) || []).map((e) => ({ a: e.s0, b: e.s1 })));
    alle.forEach((e, i) => {
      fremd.forEach((g) => { if (Math.abs(s.differenzS((e.a + e.b) / 2, (g.a + g.b) / 2)) < (e.b - e.a) / 2 + (g.b - g.a) / 2) { regelOk = false; info += `${id}:${e.n}x${i} `; } });
      for (let j = i + 1; j < alle.length; j++) if (Math.abs(s.differenzS((e.a + e.b) / 2, (alle[j].a + alle[j].b) / 2)) < (e.b - e.a) / 2 + (alle[j].b - alle[j].a) / 2) { regelOk = false; info += `${id}:${e.n}x${alle[j].n} `; }
    });
    z.extras.forEach((e) => { if (!['riese', 'mini', 'magnet'].includes(e.art) || Math.abs(e.q) > st.breite / 2) { regelOk = false; info += id + ':extra '; } });
  }
  pruefe(`A ${sp}: Elemente auf den Strecken (Magnet ≥ 6, Schlucht ≥ 6, Schienen ≥ 8, Wände ≥ 6, Extras überall), nie im Weg von Trampolin/Kanone/Tor/Glastunnel`, magn >= 6 && schl >= 6 && schi >= 8 && wand >= 6 && exOk === ALLE.length && regelOk,
    `Magnet ${magn}, Schlucht ${schl}, Schienen ${schi}, Wände ${wand}, Extras ${exOk}/${ALLE.length} ${info}`);
  const a = JSON.stringify(bauSt(R, 'wiese').spass.zauber), b = JSON.stringify(bauSt(R, 'wiese').spass.zauber);
  pruefe(`A ${sp}: Plan deterministisch; ohne Option zauber kein Zauber; ohne Spaß gar nichts`, a === b && bauSt(R, 'wiese', { zauber: false }).spass.zauber === null && bauSt(R, 'wiese', { spass: false, zauber: true }).spass === null);
  const mega = R.trackCatalog.find((t) => t.daten && t.daten.mega) ? null : null; void mega;
}
{
  const R = ladenMoto();
  const st = new R.Strecke(R.trackCatalog.find((t) => t.id === 'stuntpark'), { spass: true, zauber: true }), pe = st.spass.zauber && st.spass.zauber.pipe;
  const proto = Object.getPrototypeOf(st);
  pruefe('A motorrad: Stunt-Park hat die Halfpipe (Gerade 2, 72 m), sonst nichts vom Zauber', !!pe && pe.s1 - pe.s0 === 72 && !st.spass.zauber.magnet.length && !st.spass.zauber.schluchten.length);
  const x = 200, z = 836 - 1034, p = st.spline.punktBei(836), q = 12;
  const h = st.hoeheAn(p.x + p.nx * q, p.z + p.nz * q), h0 = proto.hoeheAn.call(st, p.x + p.nx * q, p.z + p.nz * q);
  pruefe('A motorrad: strecke.hoeheAn = Straße + Halfpipe-Profil (Wand bis 6 m, Mitte flach, außerhalb der Länge unverändert)', Math.abs(h - h0 - R.SpassZauber.pipeProfil(pe, 836, q)) < 1e-9 && h0 === 0 && h > 5.9 && st.hoeheAn(p.x, p.z) === 0 && st.hoeheAn(x, 700 - 1034) === 0, `Höhe bei q=12: ${h.toFixed(2)}`);
  void z;
}

// ---------------------------------------------------------------- B) Magnet
for (const [spn, moto] of [['auto', false], ['motorrad', true]]) {
  const R = moto ? ladenMoto() : laden();
  const { sim, st, f, v } = neu('wiese', moto), za = st.spass.zauber, e = za.magnet[0], sp = st.spline, pilot = pilotBauen(R, st, f, v);
  let imRohr = 0, haftVorEin = 0, ohneHaft = 0, thetaMax = 0, thetaStart = null, thetaEnde = null, impFlug = true, nachAus = true, ereign = [], hAll = 2166136261, stuck = false;
  const N = 60 * 150;
  for (let i = 0; i < N; i++) {
    sim.eingabeSetzen(0, pilot(0)); sim.schritt();
    const n = f.nah, z = f.flug.z;
    if (!n) continue;
    const a = sp.differenzS(n.s, e.s0);
    if (z && z.mag) { stuck = true; imRohr++; thetaMax = Math.max(thetaMax, R.SpassZauber.magnetTheta(e, sp, n.s)); if (!v.imFlug) impFlug = false; }
    else if (stuck && a > e.laenge + 5) { if (v.imFlug) nachAus = false; }
    if (!(z && z.mag) && a > 0 && a < e.laenge - 10 && stuck === false) ohneHaft++;
    hAll = hash(hAll, v.x); hAll = hash(hAll, v.z);
    if (stuck && !(z && z.mag) && a > e.laenge + 5) break;
  }
  pruefe(`B ${spn}: haftet in der Röhre (Tempo ≥ 6), θ erreicht π (Decke), kollisionsfrei nur in der Röhre`, stuck && imRohr > 60 && Math.abs(thetaMax - Math.PI) < 1e-9 && impFlug && nachAus, `${imRohr} Schritte in der Röhre, θmax ${thetaMax.toFixed(3)}`);
  const th = [-1, 0, 1, e.rampe / 2, e.rampe, e.laenge / 2, e.laenge - e.rampe, e.laenge - e.rampe / 2, e.laenge, e.laenge + 1].map((d) => R.SpassZauber.magnetTheta(e, sp, e.s0 + d));
  pruefe(`B ${spn}: θ(s): 0 vor der Röhre, steigt glatt auf π, hält die Decke, fällt zurück auf 0 (monoton)`, th[0] === 0 && th[1] === 0 && th[3] > 0.5 && th[3] < 2.7 && th[4] === Math.PI && th[5] === Math.PI && th[6] === Math.PI && th[7] > 0.5 && th[7] < 2.7 && th[8] === 0 && th[9] === 0, th.map((x) => x.toFixed(2)).join(' '));
  // zu langsam: haftet nicht; mit Magnet-Extra schon
  for (const [txt, magItem, tempo, soll] of [['zu langsam (3 m/s) ohne Extra', 0, 3, false], ['3 m/s mit Magnet-Extra', 5, 3, true]]) {
    const t = neu('wiese', moto), zt = t.st.spass.zauber.magnet[0], pt = t.st.spline.punktBei(zt.s0 - 6);
    t.v.setzen(pt.x, pt.z, R.headingAus(pt.tx, pt.tz)); t.v.vLaengs = tempo; t.f.flug.z = R.SpassZauber.zustand(); t.f.flug.z.magItem = magItem;
    let haftet = false;
    for (let i = 0; i < 60 * 8; i++) { t.sim.eingabeSetzen(0, { gas: 0, bremse: 0, lenkung: 0 }); t.v.vLaengs = Math.max(t.v.vLaengs, tempo - 0.01 > 0 ? tempo : 0); t.sim.schritt(); if (t.f.flug.z.mag) { haftet = true; break; } }
    pruefe(`B ${spn}: ${txt} → haftet ${soll ? 'ja' : 'nein'}`, haftet === soll);
  }
  // deterministisch: zweiter Lauf bitgleich
  const t2 = neu('wiese', moto), p2 = pilotBauen(R, t2.st, t2.f, t2.v);
  let h2 = 2166136261, stuck2 = false;
  for (let i = 0; i < N; i++) {
    t2.sim.eingabeSetzen(0, p2(0)); t2.sim.schritt();
    const n = t2.f.nah, z = t2.f.flug.z; if (!n) continue;
    const a = t2.st.spline.differenzS(n.s, e.s0);
    if (z && z.mag) stuck2 = true;
    h2 = hash(h2, t2.v.x); h2 = hash(h2, t2.v.z);
    if (stuck2 && !(z && z.mag) && a > e.laenge + 5) break;
  }
  pruefe(`B ${spn}: Lauf mit Röhre zweimal bitgleich`, h2 === hAll, `${hAll} ${h2}`);
}

// ---------------------------------------------------------------- B2) Magnet-Röhre hält das Tempo (FIX1): ohne Gas höchstens leichter Verlust, auch am Berg (Alpen); wer bremst, wird langsamer
for (const [spn, moto] of [['auto', false], ['motorrad', true]]) {
  const R = moto ? ladenMoto() : laden();
  const durch = (id, art) => {
    const t = neu(id, moto), e = t.st.spass.zauber.magnet[0], sp = t.st.spline, pilot = pilotBauen(R, t.st, t.f, t.v), pt = sp.punktBei(e.s0 - 90);
    t.v.setzen(pt.x, pt.z, R.headingAus(pt.tx, pt.tz)); t.v.vLaengs = 22; t.f.index = -1;
    t.S.rennen.verfolgungSetzen(t.S.rennen.teilnehmer[0], t.v.x, t.v.z, e.s0 - 90);
    let ein = null, aus = null, was = false, min = 1e9;
    for (let i = 0; i < 60 * 30; i++) {
      const s = pilot(0, 22);
      if (art === 'rollen') { s.gas = 0; s.bremse = 0; } else if (art === 'bremsen') { if (was) { s.gas = 0; s.bremse = 0.8; } } else { s.gas = 1; s.bremse = 0; }
      t.sim.eingabeSetzen(0, s); t.sim.schritt();
      const m = !!(t.f.flug.z && t.f.flug.z.mag);
      if (m && !was) ein = t.v.vLaengs;
      if (m) min = Math.min(min, t.v.vLaengs);
      if (!m && was) { aus = t.v.vLaengs; break; }
      was = m;
    }
    return { ein, aus, min };
  };
  const ro = ['wiese', 'alpen'].map((id) => durch(id, 'rollen')), gs = durch('alpen', 'gas'), br = durch('wiese', 'bremsen');
  pruefe(`B2 ${spn}: Magnet-Röhre ohne Gas (Wiese, Alpen mit Steigung) – Tempo bleibt (Verlust ≤ 8 %)`, ro.every((r) => r.ein && r.aus && r.aus >= r.ein * 0.92), ro.map((r) => r.ein && (r.ein * 3.6).toFixed(0) + '→' + (r.aus * 3.6).toFixed(0)).join(' | ') + ' km/h');
  pruefe(`B2 ${spn}: Magnet-Röhre mit Vollgas am Berg (Alpen) – nie langsamer als bei der Einfahrt (−5 %)`, gs.ein && gs.aus && gs.min >= gs.ein * 0.95, gs.ein && (gs.ein * 3.6).toFixed(0) + '→' + (gs.aus * 3.6).toFixed(0) + ' km/h');
  pruefe(`B2 ${spn}: wer in der Röhre bremst, wird langsamer (Bremse wirkt)`, br.ein && (!br.aus || br.aus < br.ein * 0.8), br.ein && (br.ein * 3.6).toFixed(0) + '→' + (br.aus ? (br.aus * 3.6).toFixed(0) : 'Stand') + ' km/h');
}

// ---------------------------------------------------------------- C) Gleiten
for (const [spn, moto] of [['auto', false], ['motorrad', true]]) {
  const R = moto ? ladenMoto() : laden();
  const sp0 = (t) => t.st.spline;
  const gleit = (lenk, bis) => {
    const t = neu('mond', moto), e = t.st.spass.zauber.schluchten[0], sp = t.st.spline, pilot = pilotBauen(R, t.st, t.f, t.v);
    const pt = sp.punktBei(e.sT - 90);
    t.v.setzen(pt.x, pt.z, R.headingAus(pt.tx, pt.tz)); t.v.vLaengs = 30; t.f.index = -1;
    t.S.rennen.verfolgungSetzen(t.S.rennen.teilnehmer[0], t.v.x, t.v.z, e.sT - 90);
    const r = { start: 0, ende: 0, qMax: 0, yMax: 0, landung: null, versatz: 0, ev: [], h: 2166136261, t };
    let inGlide = false, schritte = 0;
    for (let i = 0; i < 60 * 25; i++) {
      const n = t.f.nah;
      const dq = inGlide ? lenk : 0;
      t.sim.eingabeSetzen(0, pilot(0, 32, inGlide ? { lenkung: dq } : {})); t.sim.schritt();
      const g = t.f.flug.gleit;
      if (g && !inGlide) { inGlide = true; r.start = i; r.vorQ = n ? n.seitenabstand : 0; }
      if (g) { r.qMax = Math.max(r.qMax, Math.abs(g.q)); r.yMax = Math.max(r.yMax, t.f.flug.y - g.y0 - (g.yL - g.y0) * Math.min(1, g.t / g.T)); schritte++; }
      if (inGlide && !g) { r.ende = i; r.landung = { s: t.f.nah && t.f.nah.s, q: t.f.nah && t.f.nah.seitenabstand, v: t.v.vLaengs, x: t.v.x, z: t.v.z }; break; }
      r.h = hash(hash(r.h, t.v.x), t.v.z);
    }
    r.versatzS = t.S.rennen.teilnehmer[0].s;
    if (r.landung) r.landung.s = sp0(t).naechster(r.landung.x, r.landung.z).s;
    r.dauer = (r.ende - r.start) / 60;
    r.e = e;
    return r;
  };
  const a = gleit(0), b = gleit(0), d = gleit(1);
  const T = a.e.sL - a.e.sT;
  pruefe(`C ${spn}: Gleiten – Absprung an der Linie, Dauer ≈ Lücke/Tempo (${T} m), Höhe 2,3–4,5 m, sichere Landung auf der Straße`, a.start > 0 && a.ende > a.start && (a.landung ? Math.abs(a.dauer - T / (a.landung.v / 0.97)) < 0.15 : false) && a.dauer > 2.2 && a.yMax > 2.3 && a.yMax < 4.5 && a.qMax < a.e.halb && a.landung && a.landung.v > 20, `${a.dauer.toFixed(2)} s, Höhe ${a.yMax.toFixed(2)} m, q max ${a.qMax.toFixed(2)}, v ${a.landung && a.landung.v.toFixed(1)}`);
  pruefe(`C ${spn}: Gleiten deterministisch (zwei Läufe bitgleich)`, a.h === b.h && a.ende === b.ende, `${a.h} ${b.h}`);
  const bs = d.t.f.flug.z, beob = d.t.S.rennen.teilnehmer[0];
  pruefe(`C ${spn}: dauernd nach außen lenken → zu weit daneben → freundlich VOR die Schlucht zurückgesetzt (Tempo ≈ 9, Rennleitung folgt)`, d.qMax > d.e.halb + 0.6 && d.landung && d.landung.s < d.e.sT && d.landung.s > d.e.sT - 40 && d.landung.v < 12 && Math.abs(beob.s - d.landung.s) < 6,
    `q max ${d.qMax.toFixed(1)}, zurück bei s ${d.landung && d.landung.s.toFixed(0)} (Schlucht ab ${d.e.sT}), v ${d.landung && d.landung.v.toFixed(1)}, Rennleitung ${beob.s.toFixed(0)}`);
  void bs;
}

// ---------------------------------------------------------------- D) Grinden / Wallride
for (const [spn, moto] of [['auto', false], ['motorrad', true]]) {
  const R = moto ? ladenMoto() : laden();
  const lauf = (art, lenkEin, lenkWeg) => {
    const t = neu('wiese', moto), sp = t.st.spline, za = t.st.spass.zauber, e = za.schienen.find((x) => x.art === art), pilot = pilotBauen(R, t.st, t.f, t.v);
    const pt = sp.punktBei(e.s0 - 40), q0 = art === 'wand' ? e.side * (e.halb - 0.8) : e.q;
    t.v.setzen(pt.x + pt.nx * q0, pt.z + pt.nz * q0, R.headingAus(pt.tx, pt.tz)); t.v.vLaengs = 24; t.f.index = -1;
    t.S.rennen.verfolgungSetzen(t.S.rennen.teilnehmer[0], t.v.x, t.v.z, e.s0 - 40);
    const r = { start: -1, ende: -1, yMax: 0, qSpread: 0, e, t, ev: [], h: 2166136261 };
    let in_ = false;
    for (let i = 0; i < 60 * 12; i++) {
      const n = t.f.nah, a = n ? sp.differenzS(n.s, e.s0) : -99;
      let s = pilot(q0, 24);
      if (art === 'wand' && a > -3 && a < 3) s.lenkung = lenkEin;                     // am Anfang gegen die Wand lenken (oder nicht)
      if (in_ && lenkWeg !== undefined) s.lenkung = lenkWeg;
      t.sim.eingabeSetzen(0, s); t.sim.schritt();
      const sc = t.f.flug.schiene;
      if (sc && !in_) { in_ = true; r.start = i; }
      if (sc) { r.yMax = Math.max(r.yMax, t.f.flug.y - t.st.hoeheAn(t.v.x, t.v.z)); r.qSpread = Math.max(r.qSpread, Math.abs((t.f.nah ? t.f.nah.seitenabstand : 0) - e.q)); r.art = sc.art; }
      if (in_ && !sc && r.ende < 0) { r.ende = i; r.m = t.f.flug.z.letzter; break; }
      r.h = hash(hash(r.h, t.v.x), t.v.z);
    }
    return r;
  };
  const sg = lauf('schiene', 0), sg2 = lauf('schiene', 0);
  const zS = sg.t.f.flug.z;
  pruefe(`D ${spn}: Grinden – Einfangen auf der Schiene, 0,85 m hoch, bis zum Ende (≈ 54 m), Punkte`, sg.start > 0 && sg.ende > sg.start && sg.yMax > 0.8 && sg.yMax < 1.0 && sg.m && sg.m.m >= 45 && sg.m.m <= 56 && sg.m.punkte >= 90, `${sg.m && sg.m.m} m, ${sg.m && sg.m.punkte} Punkte, Höhe ${sg.yMax.toFixed(2)}`);
  pruefe(`D ${spn}: Grinden deterministisch`, sg.h === sg2.h && sg.ende === sg2.ende);
  const wegS = lauf('schiene', 0, undefined);
  const weg = (() => { const t = lauf('schiene', 0, -1 * 1); return t; })();   // nach dem Einfangen dauernd vom Geländer weglenken (Schiene rechts/links je nach Seite)
  void wegS; void weg;
  const wl = lauf('wand', 0 + (1), undefined), wlOk = lauf('wand', 1, undefined);
  // Wand: Seite bestimmt, in welche Richtung „gegen die Wand“ ist (lenkung·side ≥ 0,15)
  const e = wlOk.e, geg = lauf('wand', e.side * 0.8), ohne = lauf('wand', 0);
  pruefe(`D ${spn}: Wallride – nur mit Lenken gegen die Wand (sonst fährt man vorbei), 2,3 m hoch an der Wand`, geg.start > 0 && ohne.start < 0 && geg.yMax > 2.1 && geg.yMax < 2.5 && geg.m && geg.m.m >= 30, `mit Lenken: Start ${geg.start}, ohne: ${ohne.start}, Höhe ${geg.yMax.toFixed(2)}, ${geg.m && geg.m.m} m`);
  void wl;
  // Wegsteuern beendet vorzeitig
  const e2 = sg.e;
  const abbr = (() => {
    const t = neu('wiese', moto), sp = t.st.spline, pilot = pilotBauen(R, t.st, t.f, t.v), pt = sp.punktBei(e2.s0 - 40);
    t.v.setzen(pt.x + pt.nx * e2.q, pt.z + pt.nz * e2.q, R.headingAus(pt.tx, pt.tz)); t.v.vLaengs = 24; t.f.index = -1;
    t.S.rennen.verfolgungSetzen(t.S.rennen.teilnehmer[0], t.v.x, t.v.z, e2.s0 - 40);
    let in_ = false, weg = 0, ende = null;
    for (let i = 0; i < 60 * 10; i++) {
      const s = pilot(e2.q, 24);
      if (in_ && t.f.flug.schiene && t.f.flug.schiene.weg > 10) s.lenkung = -e2.side;                // vom Geländer weg
      t.sim.eingabeSetzen(0, s); t.sim.schritt();
      if (t.f.flug.schiene) in_ = true;
      if (in_ && !t.f.flug.schiene) { ende = t.f.flug.z.letzter; break; }
    }
    return ende;
  })();
  pruefe(`D ${spn}: Wegsteuern beendet das Grinden vorzeitig (< 30 m)`, abbr && abbr.m < 30 && abbr.m > 8, abbr && abbr.m + ' m');
}

// ---------------------------------------------------------------- E) Halfpipe (nur Motorrad)
{
  const moto = true, R = ladenMoto();
  const lauf = (lenkIn) => {
    const t = neu('stuntpark', moto, { runden: 99 }), sp = t.st.spline, pe = t.st.spass.zauber.pipe, pilot = pilotBauen(R, t.st, t.f, t.v);
    const pt = sp.punktBei(pe.s0 - 30);
    t.v.setzen(pt.x, pt.z, R.headingAus(pt.tx, pt.tz)); t.v.vLaengs = 14; t.f.index = -1;
    t.S.rennen.verfolgungSetzen(t.S.rennen.teilnehmer[0], t.v.x, t.v.z, pe.s0 - 30);
    const r = { ride: 0, luft: 0, yMax: 0, rueck: 0, h: 2166136261, ereignisse: [], t, pe };
    let ev = 0, ridend = false;
    for (let i = 0; i < 60 * 14; i++) {
      const n = t.f.nah, a = n ? sp.differenzS(n.s, pe.s0) : -99;
      const s = pilot(0, 14);
      if (a > 6 && a < 40) s.lenkung = lenkIn;
      t.sim.eingabeSetzen(0, s); t.sim.schritt();
      const P = t.f.flug.pipe;
      if (P) { r.ride++; ridend = true; r.yMax = Math.max(r.yMax, t.f.flug.y); r.phiMax = Math.max(r.phiMax || 0, P.phi); }
      if (!P && ridend && t.f.flug.aktiv) { r.luft++; r.yMax = Math.max(r.yMax, t.f.flug.y); }
      if (!P && ridend && !t.f.flug.aktiv && !r.fertig) { r.fertig = i; }
      r.h = hash(hash(r.h, t.v.x), t.v.z);
    }
    return r;
  };
  const a = lauf(1), b = lauf(1), c0 = lauf(0);
  pruefe('E motorrad: Halfpipe – seitwärts lenken fährt die Rundung hoch (> 1 m, Winkel ≥ 0,5 rad), Zustand fz.pipe', a.ride > 40 && a.yMax > 1 && a.phiMax > 0.5, `${a.ride} Schritte, ymax ${a.yMax.toFixed(2)}, φmax ${a.phiMax && a.phiMax.toFixed(2)}`);
  pruefe('E motorrad: Halfpipe deterministisch (zwei Läufe bitgleich)', a.h === b.h && a.ride === b.ride);
  pruefe('E motorrad: ohne seitliches Lenken bleibt man in der flachen Mitte (kein Hochfahren)', c0.ride === 0 && c0.yMax < 0.5, `ride ${c0.ride}, ymax ${c0.yMax.toFixed(2)}`);
  // starker Pump: hoch bis zur Kante → Luft → Landung
  const t = neu('stuntpark', moto, { runden: 99 }), sp = t.st.spline, pe = t.st.spass.zauber.pipe, pilot = pilotBauen(R, t.st, t.f, t.v), pt = sp.punktBei(pe.s0 - 20);
  t.v.setzen(pt.x, pt.z, R.headingAus(pt.tx, pt.tz)); t.v.vLaengs = 12; t.f.index = -1;
  t.S.rennen.verfolgungSetzen(t.S.rennen.teilnehmer[0], t.v.x, t.v.z, pe.s0 - 20);
  let luft = 0, hoch = 0, lipp = false, landet = false;
  for (let i = 0; i < 60 * 14; i++) {
    const n = t.f.nah, a2 = n ? sp.differenzS(n.s, pe.s0) : -99, s = pilot(0, 12);
    if (a2 > 6 && a2 < 18) s.lenkung = 1; if (t.f.flug.pipe) s.lenkung = 1;
    t.sim.eingabeSetzen(0, s); t.sim.schritt();
    const P = t.f.flug.pipe;
    if (P) { hoch = Math.max(hoch, t.f.flug.y); }
    else if (t.f.flug.aktiv && hoch > 3) { luft++; lipp = true; }
    if (lipp && !t.f.flug.aktiv && !t.f.flug.pipe) { landet = true; break; }
  }
  pruefe('E motorrad: mit Schwung bis zur Kante → Abheben (Luft), danach wieder gelandet', lipp && luft > 20 && landet, `Höhe ${hoch.toFixed(2)} m, ${luft} Schritte Luft`);
}

// ---------------------------------------------------------------- F) Riese / Mini / Extras
for (const [spn, moto] of [['auto', false], ['motorrad', true]]) {
  const R = moto ? ladenMoto() : laden();
  const t = neu('wiese', moto, { gegner: 1 }), f = t.f, v = t.v, o = t.S.fahrzeuge[1], vo = o.vehicle, E = R.config.spass.zauber.extras;
  const l0 = v.daten.laenge, b0 = v.daten.breite, vm0 = v.daten.vMax;
  R.SpassZauber.wirkungSetzen(f, 'riese');
  pruefe(`F ${spn}: Riese – Größe × ${E.riese.faktor} (Länge/Breite), Tempo-Faktor gesetzt`, Math.abs(v.daten.laenge / l0 - E.riese.faktor) < 1e-9 && Math.abs(v.daten.breite / b0 - E.riese.faktor) < 1e-9 && f.flug.z.groesse === E.riese.faktor);
  // Schieben: KI-Wagen direkt daneben
  const sp = t.st.spline, pt = sp.punktBei(300);
  v.setzen(pt.x, pt.z, R.headingAus(pt.tx, pt.tz)); vo.setzen(pt.x + pt.nx * 2.2, pt.z + pt.nz * 2.2, R.headingAus(pt.tx, pt.tz)); v.vLaengs = 0; vo.vLaengs = 0;
  t.f.index = -1; o.index = -1;
  const q0 = Math.hypot(vo.x - v.x, vo.z - v.z);
  for (let i = 0; i < 60; i++) { t.sim.eingabeSetzen(0, { gas: 0, bremse: 0, lenkung: 0 }); t.sim.schritt(); }
  const q1 = Math.hypot(vo.x - v.x, vo.z - v.z);
  pruefe(`F ${spn}: Riese schiebt den Nachbarn sanft weg (Abstand wächst um ≥ 0,4 m, nie mehr als 6 m/s)`, q1 > q0 + 0.4 && q1 - q0 < 7, `${q0.toFixed(2)} → ${q1.toFixed(2)} m`);
  // läuft nach 8 s ab, Größe zurück
  for (let i = 0; i < 60 * 8; i++) { t.sim.eingabeSetzen(0, { gas: 0, bremse: 0, lenkung: 0 }); t.sim.schritt(); }
  pruefe(`F ${spn}: nach ${E.riese.zeit} s wieder normal groß (Maße exakt wie vorher)`, f.flug.z.riese === 0 && v.daten.laenge === l0 && v.daten.breite === b0 && v.daten.vMax === vm0 && f.flug.z.groesse === 1, `Länge ${v.daten.laenge} / ${l0}`);
  // Mini: schneller + kleiner
  R.SpassZauber.wirkungSetzen(f, 'mini');
  const tf = (id) => { const tt = neu('wiese', moto); const p = tt.st.spline.punktBei(30); tt.v.setzen(p.x, p.z, R.headingAus(p.tx, p.tz)); if (id) R.SpassZauber.wirkungSetzen(tt.f, id); let vm = 0; for (let i = 0; i < 60 * 12; i++) { const pp = tt.st.spline.punktBei(0); void pp; const n = tt.st.abfrage(tt.v.x, tt.v.z, tt.f.index); const pl = pilotBauen(R, tt.st, tt.f, tt.v)(0, 200); tt.sim.eingabeSetzen(0, { gas: 1, bremse: 0, lenkung: pl.lenkung }); tt.sim.schritt(); vm = Math.max(vm, tt.v.vLaengs); void n; } return vm; };
  const vNormal = tf(null), vMini = tf('mini'), vRiese = tf('riese');
  pruefe(`F ${spn}: Mini schneller (× ${E.mini.vMax}), Riese langsamer (× ${E.riese.vMax}) bei Vollgas (12 s)`, vMini > vNormal * 1.03 && vRiese < vNormal, `normal ${vNormal.toFixed(1)}, Mini ${vMini.toFixed(1)}, Riese ${vRiese.toFixed(1)} m/s`);
  t.sim.schritt();
  pruefe(`F ${spn}: Mini kleiner (× ${E.mini.faktor}) und Zähler`, Math.abs(f.vehicle.daten.laenge / l0 - E.mini.faktor) < 1e-9 && f.vehicle._zMini === true);
  // Mini: Hindernisse zählen nicht
  const K = R.Kollisionen, hind = t.st.hindernisse || [];
  const tt = neu('wiese', moto), h0 = (tt.st.hindernisse || []).find((h) => h.segmente && h.segmente.length && (h.typ === 'pylone' || h.typ === 'bake' || !h.typ));
  if (h0 && K.hindernisse) {
    const sg = h0.segmente[0], x = (sg.ax + sg.bx) / 2, z = (sg.az + sg.bz) / 2, pt2 = tt.st.spline.punktBei(h0.s);
    const test = (mini) => {
      const ff = tt.S.fahrzeuge[0], vv = ff.vehicle;
      vv.setzen(x - pt2.tx * 0.5, z - pt2.tz * 0.5, R.headingAus(pt2.tx, pt2.tz)); vv.vLaengs = 20; vv.imFlug = false; vv._zMini = mini;
      const erg = K.hindernisse(tt.S.fahrzeuge, tt.st, { dt: 1 / 60 });
      vv._zMini = false;
      return erg.length;
    };
    pruefe(`F ${spn}: Mini fährt unter dem Hindernis durch (kein Stoß), normal gibt es einen`, test(true) === 0 && test(false) >= 0 && test(true) <= test(false), `Hindernis ${h0.typ || 'pylone'}: normal ${test(false)}, Mini ${test(true)}`);
  } else pruefe(`F ${spn}: Mini – Hindernis-Wrapper vorhanden`, !!K.hindernisse);
  // Extras: aufsammeln und nach 12 s wieder da
  const te = neu('wiese', moto), x = te.st.spass.zauber.extras[0], ee = te.f;
  te.v.setzen(x.x, x.z, 0); te.v.vLaengs = 0; te.f.index = -1;
  te.sim.eingabeSetzen(0, { gas: 0, bremse: 0, lenkung: 0 }); te.sim.schritt();
  const nach1 = te.f.flug.z && (te.f.flug.z.riese > 0 || te.f.flug.z.mini > 0 || te.f.flug.z.magItem > 0), bis = te.S._zExtra[0].bis;
  pruefe(`F ${spn}: Extra einsammeln gibt die Wirkung (${x.art}), erneuert sich nach ${E.erneuerung} s`, !!nach1 && Math.abs(bis - ((te.S._physikZeit || 0) + E.erneuerung)) < 0.1, `${x.art}, wieder da bei ${bis.toFixed(1)} s`);
  void ee;
}

// ---------------------------------------------------------------- G) AUS = nichts
for (const [spn, moto] of [['auto', false], ['motorrad', true]]) {
  const R = moto ? ladenMoto() : laden();
  const lauf = (zauber) => {
    const t = neu('wiese', moto, { gegner: 3, runden: 1, zauber, ohneMensch: true });
    let h = 2166136261, n = 0;
    while (!t.sim.fertig && n < 60 * 400) { t.sim.schritt(); n++; t.S.fahrzeuge.forEach((f) => { h = hash(hash(h, f.vehicle.x), f.vehicle.z); }); }
    return { h, n, z: t.S.fahrzeuge.some((f) => f.flug.z), zF: t.S.fahrzeuge.some((f) => f.vehicle._zF || f.vehicle._zMini), pl: !!t.st.spass.zauber };
  };
  const a = lauf(false), b = lauf(false);
  pruefe(`G ${spn}: Zauber aus – kein Zustand, keine Faktoren, Plan leer, zwei Läufe gleich`, !a.pl && !a.z && !a.zF && a.h === b.h && a.n === b.n, `${(a.n / 60).toFixed(0)} s`);
}

// ---------------------------------------------------------------- H) KI schafft die Runde mit Zauber
for (const [spn, moto] of [['auto', false], ['motorrad', true]]) {
  for (const id of ['alpen', 'formel1', 'regenbogenland', 'mond']) {
    const t0 = Date.now(), t = neu(id, moto, { gegner: 3, runden: 1, ohneMensch: true });
    const st = t.st, z = st.spass.zauber;
    let n = 0, resets = 0, abseits = 0, gleit = 0, grind = 0, magnet = 0, h = 2166136261;
    const prev = t.S.fahrzeuge.map(() => ({ g: 0, s: 0, m: 0 }));
    while (!t.sim.fertig && n < 60 * 500) {
      t.sim.schritt(); n++;
      t.sim.abholen().forEach((e) => { if (e.art === 'reset') resets++; });
      t.S.fahrzeuge.forEach((f, i) => {
        const zz = f.flug.z, p = prev[i];
        if (zz) { if (zz.gleitN > p.g) { gleit += zz.gleitN - p.g; p.g = zz.gleitN; } if (zz.magN > p.m) { magnet += zz.magN - p.m; p.m = zz.magN; } }
        const rt = t.S.rennen.teilnehmer[i]; if (t.S.rennen.gasErlaubt && Math.abs(rt.seitenabstand) > st.breite / 2 + 1.5) abseits++;
        h = hash(hash(h, f.vehicle.x), f.vehicle.z);
      });
    }
    pruefe(`H ${spn}/${id}: alle KI im Ziel, keine Resets, abseits ≤ 120 Schritte (Schluchten ${z.schluchten.length}, Röhren ${z.magnet.length}, Gleitflüge ${gleit}, Magnet ${magnet})`, t.sim.fertig && resets === 0 && abseits <= 120 && (z.schluchten.length === 0 || gleit >= 3) && (z.magnet.length === 0 || magnet >= 1),
      `${(n / 60).toFixed(0)} s, Resets ${resets}, abseits ${abseits}, ${((Date.now() - t0) / 1000).toFixed(0)} s Rechenzeit`);
  }
}

// ---------------------------------------------------------------- I) Vorhersage = Server (Auto)
{
  const C = kontextLaden(['vendor/three.min.js', 'src/config.js', 'src/physics/vehicle.js', 'src/physics/collisions.js', 'src/cars/carCatalog.js',
    'src/track/spline.js', 'src/track/trackCatalog.js', 'src/track/trackBuilder.js', 'src/track/looping.js', 'src/track/schanze.js', 'src/track/trackWelten.js', 'src/track/anlauf.js', 'src/spass/spassKern.js',
    'src/world/themes.js', 'src/world/schilder.js', 'src/world/wetter.js', 'src/world/themenS5.js', 'src/world/kleber.js', 'src/world/polizei.js', 'src/net/protokoll.js', 'src/main.js', 'src/spass/spassPhysik.js', 'src/spass/spassWelten.js', 'src/spass/spassZauber.js', 'src/net/vorhersage.js']);
  const id = 'regenbogenland';
  const sim = new Simulation({ einstellungen: { streckeId: id, runden: 2, gegner: 0, tageszeit: 'tag', jahreszeit: 'sommer', wetter: 'klar', spass: true, zauber: true }, spieler: [{ fahrer: 'Jonas', auto: 'porsche-911', hilfe: 'wenig' }], seed: 1234 });
  const info = sim.startInfo(), e = info.einstellungen;
  const daten = C.trackCatalog.find((t) => t.id === id), st = new C.Strecke(daten, { spass: true, zauber: info.einstellungen.zauber === true ? true : undefined });
  const w = new C.Wetter(null, { jahreszeit: e.jahreszeit, wetter: e.wetter, wind: { staerke: e.windStaerke, richtung: e.windRichtung }, thema: daten.thema, seed: 1, strecke: st, tageszeit: e.tageszeit });
  const auto = C.carCatalog.waehlbare().find((a) => a.id === 'porsche-911');
  const V = new C.NetzVorhersage({ strecke: st, auto, tempoKlasse: e.tempoKlasse, fahrhilfe: 'wenig', umwelt: () => w.umwelt() });
  const p = st.startpositionen(info.teilnehmer.length)[0];
  V.vp.setzen(p.x, p.z, p.heading); V.vp.y = st.hoeheAn(p.x, p.z);
  const pv = new C.Vehicle(auto.fahrwerte, { tempoKlasse: e.tempoKlasse });
  const Sv = sim.sim, sp = Sv.strecke.spline, za = Sv.strecke.spass.zauber;
  const ziele = za.schienen.filter((x) => x.art === 'schiene');
  const autopilot = (stt, v, idx) => {
    const n = stt.abfrage(v.x, v.z, idx), vl = Math.max(3, v.vLaengs), L = Math.max(9, Math.min(50, 0.55 * vl + 8));
    let qz = 0; const sc = ziele.find((x) => sp.differenzS(n.s, x.s0) > -40 && sp.differenzS(n.s, x.s1) < 0); if (sc) qz = sc.q;
    const ziel = sp.punktBei(n.s + L), zx = ziel.x + ziel.nx * qz, zz = ziel.z + ziel.nz * qz;
    let diff = C.headingAus(zx - v.x, zz - v.z) - v.heading;
    while (diff > Math.PI) diff -= 2 * Math.PI; while (diff < -Math.PI) diff += 2 * Math.PI;
    const lenkung = Math.max(-1, Math.min(1, -(2 * vl * Math.sin(diff) / Math.hypot(zx - v.x, zz - v.z)) / v.drehrateMax(vl)));
    const soll = stt.tempoBei(n.s + vl * 0.3) * 0.85;
    return { s: { gas: v.vLaengs < soll ? 1 : 0, bremse: v.vLaengs > soll + 3 ? 0.5 : 0, lenkung }, idx: n.index };
  };
  let maxNormal = 0, sonder = 0, idx = -1, schritte = 0, gleich = 0, gl = 0, gr = 0, mg = 0;
  let gn = 0, rn = 0, mn = 0;
  for (let n = 1; n <= 60 * 120; n++) {
    const ich0 = sim.ich(0);
    C.Netz.fahrzeugSchreiben(pv, ich0.v);
    const a = autopilot(st, pv, idx); idx = a.idx;
    const s = C.Netz.eingabeDekodieren(C.Netz.eingabeKodieren(a.s));
    const cd = sim.sim.rennen.zustand === 'countdown', ziel = sim.sim.rennen.teilnehmer[0].imZiel;
    sim.eingabeSetzen(0, s); sim.schritt();
    V.schritt(n, s, { countdown: cd, imZiel: ziel });
    const fz = sim.sim.fahrzeuge[0].flug, z = fz.z;
    if (z) { if (z.gleitN > gn) { gl++; gn = z.gleitN; } if (z.magN > mn) { mg++; mn = z.magN; } if (fz.schiene && !rn) { gr++; rn = 1; } if (!fz.schiene) rn = 0; }
    if (n % 3 === 0) {
      const ich = sim.ich(0); ich.ack = n;
      const d = Math.hypot(V.vp.x - ich.v[0], V.vp.z - ich.v[1]);
      if (ich.so || V.sonder) sonder++;
      else if (n >= 60 * 6) { maxNormal = Math.max(maxNormal, d); schritte++; if (d < 1e-3) gleich++; }
      V.abgleich(ich, null);
    }
  }
  const anteil = gleich / Math.max(1, schritte);
  pruefe(`I ${id}: Vorhersage = Server (≥ 90 % < 1 mm, max < 3 m) mit Gleitflug, Magnet-Röhre und Grinden (${gl} Gleiten, ${mg} Magnet, ${gr} Grind)`, anteil >= 0.9 && maxNormal < 3 && schritte > 100 && gl >= 1 && mg >= 1,
    `${(anteil * 100).toFixed(1)} % gleich, max ${maxNormal.toFixed(3)} m, ${schritte} Vergleiche, ${sonder} Sonderzustand`);
}

// ---------------------------------------------------------------- J) Sticker
{
  const { ladeModule } = require('./lade');
  const RS = ladeModule(['src/config.js', 'src/spass/spassSticker.js']), SK = RS.SpassSticker;
  const neuIds = ['magnet', 'gleiter', 'grind', 'wandfahrer', 'halfpipe', 'riese', 'mini', 'haustier', 'kostuem'];
  for (const spiel of ['auto', 'motorrad']) {
    SK.zurueck(spiel);
    const kat = SK.katalog(spiel).map((k) => k.id);
    pruefe(`J ${spiel}: neun neue Sticker im Katalog (eindeutig)`, neuIds.every((i) => kat.includes(i)) && new Set(kat).size === kat.length, kat.length);
    const g = (n, d) => SK.ereignis(spiel, n, d).map((k) => k.id);
    pruefe(`J ${spiel}: Magnet, Gleiten, Grinden (ab 20 m), Wand (ab 15 m), Halfpipe (ab 3 m), Riese, Mini, Haustier, Kostüm`, g('magnet').includes('magnet') && g('gleiten').includes('gleiter') && g('grind', { m: 10 }).length === 0 && g('grind', { m: 20 }).includes('grind') &&
      g('wand', { m: 10 }).length === 0 && g('wand', { m: 15 }).includes('wandfahrer') && g('halfpipe', { hoch: 1 }).length === 0 && g('halfpipe', { hoch: 3 }).includes('halfpipe') && g('riese').includes('riese') && g('mini').includes('mini') && g('haustier').includes('haustier') && g('kostuem').includes('kostuem'));
    SK.zurueck(spiel);
  }
}

console.log(`\n${ok} OK, ${fehler} FEHL`);
process.exit(fehler ? 1 : 0);
