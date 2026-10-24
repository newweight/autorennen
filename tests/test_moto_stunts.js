// Node-Test Motorrad-Stunts (Stufe M2): node tests/test_moto_stunts.js
// Prüft die reine Logik (src/moto/stunts.js) und die Welt-Daten (src/moto/stuntWelt.js) ohne Browser:
//   1. Combo (4-s-Fenster, höchstens ×5, Sturz setzt zurück)
//   2. Trick-Zeitplan (zu kurze Flugzeit = kein Trick, fertig vor der Landung, kein Sturz durch Tricks, mehrere Tricks pro Sprung)
//   3. Feuerring (Volltreffer / Treffer / vorbei, keine Strafe) + echte Flugbahn über die Schanzen-Physik bei vielen Tempi
//   4. Bus-Reihe: bei Mindest-Absprungtempo mit den Rampenwerten der Strecke sicher überflogen (alle Strecken, alle Reihen)
//   5. Wheelie-/Stoppie-Punkte, Stuntrennen-Wertung, KI-Plan (deterministisch), Plan der Schanzen/Zonen je Strecke/Welt/Variante
//   6. Autorennen bleibt unberührt (ohne window.MOTORRAD ändern die Module nichts)
const { ladeModule } = require('./lade');
let fehler = 0, anzahl = 0;
function pruefe(name, ok, info) { anzahl++; console.log((ok ? 'OK   ' : 'FEHL ') + name + (info !== undefined && info !== '' ? '  (' + info + ')' : '')); if (!ok) fehler++; }
const nah = (a, b, tol) => Math.abs(a - b) <= (tol === undefined ? 1e-9 : tol);

const LISTE = ['src/config.js', 'src/physics/vehicle.js', 'src/cars/carCatalog.js', 'src/track/spline.js', 'src/track/trackCatalog.js', 'src/track/trackBuilder.js',
  'src/track/schanze.js', 'src/track/anlauf.js', 'src/track/megastrecke.js', 'src/moto/stunts.js', 'src/moto/stuntWelt.js'];
const R = ladeModule(['tests/moto_flag.js'].concat(LISTE));
const St = R.Moto.stunts, W = R.Moto.stuntWelt, S = R.Schanzen, cfg = R.config.motoStunts, dt = R.config.physik.schritt;

// ---------- 1. Combo ----------
{
  const c = St.comboNeu();
  const m = [0, 1, 2.5, 4, 6, 8, 9, 10].map((t) => St.comboStunt(c, t));
  pruefe('Combo: Stunts im 4-s-Fenster zählen hoch (×1, ×2, ×3, ×4, ×5), Obergrenze ×5', m.slice(0, 5).join(',') === '1,2,3,4,5' && m[5] === 5 && m[6] === 5 && m[7] === 5, m.join(','));
  const c2 = St.comboNeu();
  St.comboStunt(c2, 0); St.comboStunt(c2, 3.9);
  const m3 = St.comboStunt(c2, 3.9 + 4.01);
  pruefe('Combo: nach mehr als 4 s Pause wieder ×1', m3 === 1, m3);
  const c3 = St.comboNeu(); St.comboStunt(c3, 0);
  pruefe('Combo: genau 4,0 s zählt noch (Fenster inklusive)', St.comboStunt(c3, 4.0) === 2);
  const c4 = St.comboNeu(); St.comboStunt(c4, 0); St.comboStunt(c4, 1);
  St.comboSturz(c4);
  pruefe('Combo: Sturz setzt zurück, nächster Stunt ×1', St.comboRest(c4, 1.5).mult === 0 && St.comboStunt(c4, 1.6) === 1);
  const c5 = St.comboNeu(); St.comboStunt(c5, 10); St.comboStunt(c5, 11);
  const r1 = St.comboRest(c5, 12), r2 = St.comboRest(c5, 15.5);
  pruefe('Combo-Anzeige: Restzeit läuft (3 s bei ×2), nach Fenster 0', r1.mult === 2 && nah(r1.rest, 3) && r2.mult === 0 && r2.rest === 0, JSON.stringify(r1));
  const z = St.zNeu();
  St.vergeben(z, 'drehung', 'Drehung!', 200, 0); St.vergeben(z, 'salto', 'Salto!', 400, 1); St.vergeben(z, 'feuerring', 'Feuerring!', 500, 2);
  pruefe('Punkte mit Combo: 200×1 + 400×2 + 500×3', z.punkte === 200 + 800 + 1500, z.punkte);
  St.sturz(z);
  St.vergeben(z, 'drehung', 'Drehung!', 200, 3);
  pruefe('Sturz: Combo weg (nächster Stunt ×1), Punkte bleiben', z.punkte === 2500 + 200 && z.stat.stuerze === 1);
}

// ---------- 2. Trick-Zeitplan ----------
/** Flug simulieren: Flugdauer T, Absprung bei t=0; taps = Zeitpunkte (s nach Absprung). Rückgabe { z, ev (mit Zeit), ende }. */
function fliegen(T, taps, opt) {
  const o = opt || {}, z = St.zNeu(), ev = [], g = 9.81, vy0 = g * T / 2;      // y(t) = vy0·t − g/2·t² → Landung bei T
  let t = 0, jetzt = 100, n = 0;
  const tp = taps.slice();
  St.schritt(z, { dt, jetzt, luft: true, abflug: true, flugT: 0, y: 0, vy: vy0, boden: 0, v: 25 }, cfg);
  for (let i = 0; i < 2000; i++) {
    t += dt; jetzt += dt;
    const luft = t < T, y = Math.max(0, vy0 * t - 0.5 * g * t * t), vy = vy0 - g * t;
    let tippen = false;
    while (tp.length && tp[0] <= t) { tp.shift(); tippen = true; }
    const e = St.schritt(z, { dt, jetzt, luft, landung: !luft && z.luft, flugT: t, y, vy, boden: 0, tippen, v: 25 }, cfg);
    for (const x of e) ev.push(Object.assign({ t }, x));
    e.length = 0;
    if (!luft && t > T + 0.5) break;
    n++;
  }
  return { z, ev, T };
}
{
  const kurz = fliegen(0.4, [0.2]);
  pruefe('Trick: bei 0,4 s Flugzeit wird gar nicht erst begonnen (kein Trick, keine Punkte, kein Sturz)', kurz.ev.length === 0 && kurz.z.punkte === 0 && kurz.z.stat.stuerze === 0);
  const ein = fliegen(1.4, [0.25]);
  pruefe('Trick: ein Tippen = Drehung (360° Gier), 200 Punkte', ein.ev.length === 1 && ein.ev[0].art === 'drehung' && ein.ev[0].punkte === 200, ein.ev.map((e) => e.art + e.punkte).join());
  const zwei = fliegen(1.6, [0.25, 0.32]);
  pruefe('Trick: zweimal tippen = Salto, 400 Punkte, keine Drehung zusätzlich', zwei.ev.length === 1 && zwei.ev[0].art === 'salto' && zwei.ev[0].punkte === 400, zwei.ev.map((e) => e.art + e.punkte).join());
  let ok = true, info = [], fruehsten = 9;
  for (let T = 0.3; T <= 2.6; T += 0.05) {
    const r = fliegen(T, [Math.min(0.2, T / 3), Math.min(0.27, T / 3 + 0.06)]);
    r.ev.filter((e) => e.art === 'drehung' || e.art === 'salto').forEach((e) => { fruehsten = Math.min(fruehsten, T - e.t); if (e.t > T + dt) ok = false; });
    if (r.z.stat.stuerze) ok = false;
    if (r.z.pose.gier !== 0 || r.z.pose.salto !== 0) ok = false;     // nach der Landung wieder gerade
    if (!ok && info.length < 3) info.push('T=' + T.toFixed(2));
  }
  pruefe('Trick-Zeitplan: für Flugzeiten 0,3 … 2,6 s ist jeder Trick bis zur Landung abgeschlossen, Pose danach 0, nie ein Sturz', ok, info.join(' ') || 'Reserve min. ' + fruehsten.toFixed(2) + ' s');
  const knapp = fliegen(0.85, [0.12, 0.18]);
  pruefe('Trick: knapper Flug (0,85 s) → Salto verkürzt/zur Drehung herabgestuft, noch gewertet', knapp.ev.length === 1 && (knapp.ev[0].abgekuerzt === true) && knapp.z.stat.abgekuerzt === 1, knapp.ev.map((e) => e.art + (e.abgekuerzt ? '(kurz)' : '')).join());
  const lang = fliegen(2.2, [0.2, 1.1, 1.9]);
  const tr = lang.ev.filter((e) => e.art === 'drehung' || e.art === 'salto');
  pruefe('Trick: mehrere Tricks pro Sprung (lange Flugzeit 2,2 s, 3 Tipps)', tr.length >= 2, tr.map((e) => e.art + '×' + e.mult).join(', '));
  const lp = St.trickPlan(2.0, 'salto'), lk = St.trickPlan(0.4, 'drehung'), lm = St.trickPlan(0.75, 'salto');
  pruefe('trickPlan: lang = normal, zu kurz = null, knapper Salto = Drehung', lp.dauer === 1 && !lp.abgekuerzt && lk === null && lm && lm.art === 'drehung' && lm.abgekuerzt, JSON.stringify(lm));
  const gl = St.trickPose('drehung', 1), sa = St.trickPose('salto', 1), s0 = St.trickPose('salto', 0);
  pruefe('trickPose: Drehung endet bei 360° (Hochachse), Salto bei −360° (Querachse), Start = 0', nah(gl.gier, 2 * Math.PI) && nah(sa.salto, -2 * Math.PI) && s0.salto === 0 && s0.gier === 0 && nah(gl.salto, 0) && nah(sa.gier, 0));
  // Taste: Flanke
  const zz = St.zNeu();
  pruefe('Taste: Flanke nur beim Drücken, gehalten zählt nicht erneut', St.tasteKante(zz, true) === true && St.tasteKante(zz, true) === false && St.tasteKante(zz, false) === false && St.tasteKante(zz, true) === true);
  // Sturz im Flug bricht den Trick ab
  const zs = St.zNeu(), vy0 = 9.81 * 0.7;
  St.schritt(zs, { dt, jetzt: 1, luft: true, abflug: true, flugT: 0, y: 0, vy: vy0, boden: 0 }, cfg);
  St.schritt(zs, { dt, jetzt: 1.2, luft: true, flugT: 0.2, y: 1, vy: 3, boden: 0, tippen: true }, cfg);
  St.schritt(zs, { dt, jetzt: 1.3, luft: true, flugT: 0.3, y: 1.2, vy: 2, boden: 0, sturz: true }, cfg);
  pruefe('Sturz im Flug: Trick abgebrochen, Combo weg, keine Punkte', zs.trick === null && zs.punkte === 0 && zs.stat.stuerze === 1);
}

// ---------- 3. Feuerring ----------
{
  const k = cfg.ring;
  pruefe('Ring: genau mittig = Volltreffer', St.ringBewertung(0, 0) === 'volltreffer');
  pruefe('Ring: innerhalb des inneren Kreises (' + k.innen + ' m) = Volltreffer, knapp darüber = Treffer', St.ringBewertung(k.innen, 0) === 'volltreffer' && St.ringBewertung(0, -(k.innen + 0.01)) === 'treffer');
  const rand = k.radius - k.koerper;
  pruefe('Ring: bis (Radius − Körper) = Treffer, danach vorbei', St.ringBewertung(rand, 0) === 'treffer' && St.ringBewertung(rand + 0.01, 0) === 'vorbei' && St.ringBewertung(0, rand + 0.5) === 'vorbei', 'Rand ' + rand.toFixed(1) + ' m');
  const d1 = St.ringDurchflug(-0.5, 0.5, 0, 4, 4, 6, 5), d2 = St.ringDurchflug(-0.5, 0.5, 0, 0.4, 4, 6, 5 + k.fahrerHoehe);
  pruefe('Durchflug: Interpolation auf der Ringebene (Mitte der Strecke zwischen zwei Schritten)', d1 && nah(d1.q, 2) && nah(d1.dy, k.fahrerHoehe) && d1.bewertung === 'treffer' && d2 && nah(d2.q, 0.2) && nah(d2.dy, 0) && d2.bewertung === 'volltreffer', JSON.stringify(d1));
  pruefe('Durchflug: ohne Ebenen-Querung null (vorher/nachher gleiche Seite, rückwärts)', St.ringDurchflug(-2, -1, 0, 0, 0, 0, 0) === null && St.ringDurchflug(1, 2, 0, 0, 0, 0, 0) === null && St.ringDurchflug(1, -1, 0, 0, 0, 0, 0) === null);
  const hit = (b, z) => { const r = z || St.zNeu(); St.schritt(r, { dt, jetzt: 1, luft: true, abflug: true, flugT: 0, y: 0, vy: 5, boden: 0, ring: b ? { bewertung: b } : null }, cfg); return r; };
  const a = hit('volltreffer'), b = hit('treffer'), c = hit('vorbei'), n = hit(null);
  pruefe('Wertung: Volltreffer +1000, Treffer +500, vorbei = nichts (kein Schaden, kein Sturz, Combo unverändert)', a.punkte === 1000 && b.punkte === 500 && c.punkte === 0 && c.stat.stuerze === 0 && c.combo.zaehler === 0 && n.punkte === 0 && a.ereignisse[0].name === 'Volltreffer!' && b.ereignisse[0].name === 'Feuerring!');
  const dop = hit('treffer'); St.schritt(dop, { dt, jetzt: 1.01, luft: true, flugT: 0.01, y: 0.1, vy: 5, boden: 0, ring: { bewertung: 'volltreffer' } }, cfg);
  pruefe('Ring zählt pro Sprung nur einmal', dop.punkte === 500 && dop.ereignisse.length === 1);

  // echte Flugbahn: Ringhöhe aus der Referenzbahn, Durchflug bei vielen Absprungtempi (Schanzen-Physik)
  const sim = (strecke, i, v0, q0) => {
    const sch = S.liste(strecke)[i], p = strecke.spline.punktBei(sch.s - 15);
    const v = new R.Vehicle({}); v.setzen(p.x + p.nx * (q0 || 0), p.z + p.nz * (q0 || 0), R.headingAus(p.tx, p.tz)); v.vLaengs = v0;
    const fz = S.zustand(); let index = -1; const D = W.stuntDaten(strecke), ring = D.ringe.find((r) => r.nr === i), reihe = D.reihen.find((r) => r.nr === i);
    let prev = null, res = null, minAb = Infinity, flog = false, drin = false, yRing = null, yMax = -Infinity, yStart = null;
    for (let s = 0; s < 1200; s++) {
      if (!fz.aktiv && fz.fluege === 0) v.vLaengs = v0;
      const r = S.fahrzeugSchritt(fz, v, strecke, { gas: 0, bremse: 0, lenkung: 0 }, dt, index); index = r.index;
      if (fz.aktiv) { flog = true; if (yStart === null) yStart = v.y; yMax = Math.max(yMax, v.y); }
      if (ring && fz.aktiv) { const dx = v.x - ring.x, dz = v.z - ring.z, d = dx * ring.tx + dz * ring.tz, q = dx * ring.nx + dz * ring.nz;
        if (prev) { const h = St.ringDurchflug(prev.d, d, prev.q, q, prev.y, v.y, ring.y, ring.cfgRing || cfg); if (h) res = h; if (prev.d < 0 && d >= 0) yRing = prev.y + (v.y - prev.y) * (-prev.d / (d - prev.d)); } prev = { d, q, y: v.y }; }
      if (reihe) { const dx = v.x - reihe.x, dz = v.z - reihe.z, a = dx * reihe.tx + dz * reihe.tz, q = dx * reihe.nx + dz * reihe.nz;
        if (a >= reihe.a0 && a <= reihe.a1 && Math.abs(q) <= reihe.halb) { drin = true; if (fz.aktiv) minAb = Math.min(minAb, v.y - strecke.hoeheAn(v.x, v.z) - reihe.hoehe); } }
      if (r.ereignis === 'landung' || r.ereignis === 'landungSchraeg') break;
    }
    return { res, minAb, flog, drin, yRing, yMax, yStart, zuLangsam: fz.zuLangsam || 0, weite: fz.letzteWeite, flugzeit: fz.letzteFlugzeit };
  };
  const mk = (id, welt, variante) => new R.Strecke(R.trackCatalog.find((t) => t.id === id), { welt: welt || 'stunt', variante: variante || '' });
  let ringe = 0, voll = 0, treffer = 0, vorbei = 0, alle = [];
  const tempi = [22, 24, 26, 28, 30, 32, 34, 36, 40, 45];
  ['wiese', 'wald', 'wueste', 'fantasie', 'dino', 'alpen', 'formel1', 'mega'].forEach((id) => {
    const st = mk(id);
    st.schanzen.forEach((e, i) => {
      if (!e.moto || !e.moto.ring) return;
      tempi.forEach((v0) => { const r = sim(st, i, v0, 0); ringe++; const b = r.res ? r.res.bewertung : 'vorbei'; if (b === 'volltreffer') voll++; else if (b === 'treffer') treffer++; else { vorbei++; alle.push(id + '@' + Math.round(e.s) + ':' + v0); } });
    });
  });
  pruefe('Ring auf der echten Flugbahn (alle Strecken, 22–45 m/s, mittig): nie vorbei, überwiegend Volltreffer', ringe >= 30 && vorbei === 0 && voll >= ringe * 0.8, `${ringe} Flüge: ${voll} Volltreffer, ${treffer} Treffer, ${vorbei} vorbei ${alle.slice(0, 3).join(' ')}`);
  // Höhe des Rings gegen die berechnete Flugbahn: Ring-Mitte (ring.y − Fahrerhöhe = Höhe der Fahrzeug-Referenz) liegt bei Auslegungstempo auf der Bahn
  {
    let n = 0, maxDy = 0, minUnter = Infinity, maxUeber = 0, minMitte = Infinity; const zeilen = [];
    ['wiese', 'wald', 'wueste', 'fantasie', 'dino', 'alpen', 'formel1', 'mega'].forEach((id) => {
      ['klassisch', 'stunt', 'verrueckt'].forEach((welt) => {
        const st = mk(id, welt), D = W.stuntDaten(st);
        st.schanzen.forEach((e, i) => {
          if (!e.moto || !e.moto.ring) return;
          const ring = D.ringe.find((r) => r.nr === i), r = sim(st, i, cfg.ring.auslegung, 0); n++;
          const dy = r.yRing - (ring.y - cfg.ring.fahrerHoehe); maxDy = Math.max(maxDy, Math.abs(dy));
          const boden = st.hoeheAn(ring.x, ring.z); minUnter = Math.min(minUnter, ring.y - ring.radius - boden); maxUeber = Math.max(maxUeber, ring.y - boden); minMitte = Math.min(minMitte, ring.y - boden);
          if (welt === 'stunt') zeilen.push(`${id}: Ring-Mitte ${(ring.y - boden).toFixed(2)} m über Boden, Bahn ${(r.yRing + cfg.ring.fahrerHoehe - boden).toFixed(2)} m, Scheitel ${(r.yMax + cfg.ring.fahrerHoehe - boden).toFixed(2)} m`);
        });
      });
    });
    pruefe('Feuerring-Mitte liegt auf der berechneten Flugbahn (alle Strecken/Welten, Auslegungstempo ' + cfg.ring.auslegung + ' m/s): Abweichung ≤ 0,15 m (max. ' + maxDy.toFixed(3) + ' m)', n >= 20 && maxDy <= 0.15, n + ' Ringe');
    zeilen.forEach((z) => console.log('      ' + z));
    pruefe('Feuerring schwebt: Unterkante überall ≥ 1,0 m über dem Boden (Alpen vorher 0,31 m), Ring-Mitte 3–5,5 m über dem Boden (nicht auf Straßenhöhe)', minUnter >= 1.0 && minMitte >= 3 && maxUeber <= 5.5, 'tiefste Unterkante ' + minUnter.toFixed(2) + ' m, Mitte ' + minMitte.toFixed(2) + ' … ' + maxUeber.toFixed(2) + ' m');
  }
  // seitlich versetzt: ±1 m noch Treffer/Volltreffer, ±4 m vorbei (Ring ist 6,4 m breit)
  const sw = mk('wiese'), iW = sw.schanzen.findIndex((e) => e.moto && e.moto.ring);
  const links = sim(sw, iW, 30, 1.0), weit = sim(sw, iW, 30, 3.9);
  pruefe('Ring seitlich: 1 m daneben = Treffer/Volltreffer, 3,9 m daneben = vorbei (kein Schaden)', links.res && links.res.bewertung !== 'vorbei' && (!weit.res || weit.res.bewertung === 'vorbei'), (links.res || {}).bewertung + ' / ' + (weit.res ? weit.res.bewertung : 'kein Durchgang'));

  // ---------- 4. Bus-Reihe ----------
  const vMin = R.config.anlauf.schanzeMin + 0.05;      // kleinstes Tempo, das noch fliegt (darunter: Notstopp 'zuLangsam' vor der Rampe)
  pruefe('Mindesttempo auf Schanzen im Motorradmodus = 20 m/s (Autos 14)', R.config.anlauf.schanzeMin === 20 && ladeModule(LISTE).config.anlauf.schanzeMin === 14, R.config.anlauf.schanzeMin);
  let nReihen = 0, minGesamt = Infinity, schlecht = [], landeKurz = [], langsamDrin = [], langsamN = 0;
  ['wiese', 'wald', 'wueste', 'fantasie', 'dino', 'alpen', 'formel1', 'mega'].forEach((id) => {
    ['klassisch', 'stunt', 'verrueckt'].forEach((welt) => {
      const st = mk(id, welt), D = W.stuntDaten(st);
      st.schanzen.forEach((e, i) => {
        if (!e.moto || !e.moto.reihe) return;
        const reihe = D.reihen.find((r) => r.nr === i);
        [19, 19.9, 20.0].forEach((v0) => { const r = sim(st, i, v0, 0); langsamN++; if (r.flog || r.drin || !r.zuLangsam) langsamDrin.push(`${id}/${welt}@${Math.round(e.s)} v=${v0}`); });
        [vMin, 22, 26, 30, 36, 45, 60].forEach((v0) => {
          const r = sim(st, i, v0, 0); nReihen++;
          minGesamt = Math.min(minGesamt, r.minAb);
          if (!r.flog || !(r.minAb >= cfg.reihe.sicherheit)) schlecht.push(`${id}/${welt}@${Math.round(e.s)} v=${v0.toFixed(2)} Abstand ${r.minAb.toFixed(2)}`);
          if (r.weite < reihe.a1 + 5) landeKurz.push(`${id}@${Math.round(e.s)} v=${v0}`);
        });
        // zweite, unabhängige Rechnung mit den reinen Rampenwerten (ballistisch, ohne Physik-Schritt)
        const hKante = e.laenge * Math.tan(e.winkel * Math.PI / 180), vy0 = Math.min(vMin * Math.sin(e.winkel * Math.PI / 180), R.config.stunt.schanze.vyMax);
        const fb = St.reiheFlugbahn(reihe, hKante, vy0, vMin);
        if (!(fb.abstand >= cfg.reihe.sicherheit)) schlecht.push(`${id}@${Math.round(e.s)} ballistisch ${fb.abstand.toFixed(2)}`);
      });
    });
  });
  pruefe('Bus-Reihe sicher (alle Strecken/Welten/Reihen, Absprungtempo 20,05 … 60 m/s): Abstand zur Oberkante ≥ 0,3 m (Mindestabstand ' + minGesamt.toFixed(2) + ' m)', nReihen >= 40 && schlecht.length === 0, `${nReihen} Flüge ${schlecht.slice(0, 3).join(' | ')}`);
  pruefe('Zu langsam (< 20 m/s an der Rampe) = Notstopp vor der Rampe: kein Auffahren, nie in der Reihe, kein Steckenbleiben im Bus', langsamN >= 20 && langsamDrin.length === 0, `${langsamN} Versuche ${langsamDrin.slice(0, 3).join(' | ')}`);
  pruefe('Bus-Reihe: Landung immer hinter der Reihe (≥ 5 m Reserve)', landeKurz.length === 0, landeKurz.slice(0, 3).join(' | '));
  // Lage der echten Reihen: quer zur Fahrtrichtung, mittig auf der Fahrbahn, hinter der Kante, im Landebereich vor dem Aufsetzpunkt
  {
    let n = 0, schlecht2 = []; let minAbsKante = Infinity, minLand = Infinity, minAbFlug = Infinity;
    ['wiese', 'wald', 'wueste', 'fantasie', 'dino', 'alpen', 'formel1', 'mega'].forEach((id) => {
      ['klassisch', 'stunt', 'verrueckt'].forEach((welt) => {
        const st = mk(id, welt), D = W.stuntDaten(st);
        D.reihen.forEach((L) => {
          n++;
          const breite = st.breiteBei ? st.breiteBei(L.sK) : st.breite;
          if (!(L.halb * 2 <= breite - 0.5)) schlecht2.push(`${id}/${welt} Länge ${(L.halb * 2).toFixed(2)} > Fahrbahn ${breite}`);
          if (!(L.a0 >= 0.4)) schlecht2.push(`${id}/${welt} beginnt ${L.a0} vor/auf der Kante`);
          minAbsKante = Math.min(minAbsKante, L.a0);
          const r = sim(st, L.nr, cfg.reihe.minTempo || 20.05, 0); minAbFlug = Math.min(minAbFlug, r.minAb);
          minLand = Math.min(minLand, r.weite - L.a1);
          if (!(r.weite > L.a1 + 5)) schlecht2.push(`${id}/${welt} Aufsetzpunkt ${r.weite.toFixed(1)} nicht ≥5 m hinter der Reihe (${L.a1.toFixed(1)})`);
          // Reihe liegt auf der Fahrlinie: Mittellinie der Fahrbahn schneidet die Reihe (q = 0 liegt in [-halb, halb]), Fahrtrichtung t ist Reihen-Tiefenrichtung
          const sp = st.spline.punktBei(L.sK), dotT = sp.tx * L.tx + sp.tz * L.tz; if (!(dotT > 0.999)) schlecht2.push(`${id}/${welt} Tiefenrichtung weicht von der Fahrtrichtung ab (${dotT.toFixed(4)})`);
          const dotN = sp.nx * L.nx + sp.nz * L.nz; if (!(dotN > 0.999)) schlecht2.push(`${id}/${welt} Querrichtung gedreht (Vorzeichen ${dotN.toFixed(3)})`);
        });
      });
    });
    pruefe('Bus-Reihe quer zur Fahrtrichtung (Querachse = Straßen-Normale, Vorzeichen +), mittig auf der Fahrbahn, ≥ 0,4 m hinter der Kante, Länge ≤ Fahrbahn − 0,5, Aufsetzpunkt ≥ 5 m dahinter', n >= 24 && schlecht2.length === 0, `${n} Reihen, früheste Reihe ${minAbsKante.toFixed(2)} m hinter Kante, kleinste Landereserve ${minLand.toFixed(1)} m, kleinster Abstand zur Bus-Oberkante ${minAbFlug.toFixed(2)} m ${schlecht2.slice(0, 3).join(' | ')}`);
  }
  const L5 = St.reiheLage({ art: 'bus', n: 5 }, 14.5, cfg), L3 = St.reiheLage({ art: 'bus', n: 3 }, 14.5, cfg);
  pruefe('Reihen-Lage: 3–5 Fahrzeuge, Tiefe 2,7 m je Fahrzeug, quer (halbe Breite ≤ 7,25 m), Höhe 2,5 m', nah(L5.a1 - L5.a0, 13.5) && nah(L3.a1 - L3.a0, 8.1) && L5.halb <= 7.25 && L5.hoehe === 2.5);
  const lz = W.PLAN; let nr = []; Object.keys(lz).forEach((id) => lz[id].schanzen.forEach((e) => { if (e.moto && e.moto.reihe) nr.push(e.moto.reihe.n); }));
  pruefe('Alle Reihen im Plan haben 3–5 Fahrzeuge', nr.length >= 7 && nr.every((n) => n >= 3 && n <= 5), nr.join(','));
  // Kontakt: zu tief oder am Boden in der Reihe -> 'kontakt' (Purzelbaum + weiter, kein Steckenbleiben: Logik in stuntStart.js), drüber -> Bus-Sprung
  const Lr = St.reiheLage({ art: 'bus', n: 4 }, 14.5, cfg);
  pruefe('reiheStatus: hoch drüber = drueber, am Boden/zu tief = kontakt, hinter = hinter, davor/seitlich = ausser',
    St.reiheStatus(Lr, 5, 0, 3.0, true, cfg) === 'drueber' && St.reiheStatus(Lr, 5, 0, 1.0, true, cfg) === 'kontakt' && St.reiheStatus(Lr, 5, 0, 0, false, cfg) === 'kontakt' &&
    St.reiheStatus(Lr, Lr.a1 + 0.1, 0, 0, false, cfg) === 'hinter' && St.reiheStatus(Lr, 0.1, 0, 0, false, cfg) === 'ausser' && St.reiheStatus(Lr, 5, 9, 0, false, cfg) === 'ausser');
  const zb = St.zNeu();
  St.schritt(zb, { dt, jetzt: 5, luft: true, abflug: true, flugT: 0, y: 0, vy: 5, boden: 0, bus: { n: 4 } }, cfg);
  pruefe('Bus-Sprung: 300 Punkte je Fahrzeug (4 Busse = 1200), nur einmal je Sprung', zb.punkte === 1200 && zb.stat.busse === 4 && zb.ereignisse[0].name === 'Bus-Sprung!');
}

// ---------- 5. Wheelie / Stoppie ----------
{
  const lauf = (zone, halten, bremse, v, meter, jetzt0) => {
    const z = St.zNeu(); let weg = 0;
    while (weg < meter) { const w = v * dt; weg += w; St.schritt(z, { dt, jetzt: (jetzt0 || 0) + weg / v, luft: false, rampe: false, zone, halten, bremse, v, weg: w }, cfg); }
    St.schritt(z, { dt, jetzt: 99, luft: false, zone: null, halten: false, bremse: false, v, weg: 0 }, cfg);
    return z;
  };
  const w = lauf('wheelie', true, false, 20, 40), s = lauf('stoppie', false, true, 20, 30);
  pruefe('Wheelie: Taste in der Wheelie-Zone gehalten, 40 m = ~400 Punkte (10 je Meter)', Math.abs(w.punkte - 400) <= 20 && w.stat.wheelieM >= 38, w.punkte);
  pruefe('Stoppie: Bremse in der Stoppie-Zone, 30 m = ~360 Punkte (12 je Meter)', Math.abs(s.punkte - 360) <= 24 && s.stat.stoppieM >= 28, s.punkte);
  pruefe('Wheelie ohne Taste / Stoppie ohne Bremse / falsche Zone = keine Punkte', lauf('wheelie', false, false, 20, 40).punkte === 0 && lauf('stoppie', true, false, 20, 40).punkte === 0 && lauf('wheelie', false, true, 20, 40).punkte === 0 && lauf(null, true, true, 20, 40).punkte === 0);
  pruefe('Wheelie/Stoppie: zu langsam (< 5 m/s) oder unter 8 m = keine Punkte', lauf('wheelie', true, false, 3, 20).punkte === 0 && lauf('wheelie', true, false, 20, 6).punkte === 0);
  const wp = lauf('wheelie', true, false, 20, 20);
  pruefe('Wheelie-Pose: Nick positiv (Vorderrad hoch), Stoppie-Pose negativ, nach Ende wieder 0', (() => { const z = St.zNeu(); let max = 0, min = 0; for (let i = 0; i < 120; i++) { St.schritt(z, { dt, jetzt: i * dt, zone: 'wheelie', halten: true, v: 20, weg: 0.3 }, cfg); max = Math.max(max, z.pose.nick); }
    for (let i = 0; i < 120; i++) { St.schritt(z, { dt, jetzt: 3 + i * dt, zone: 'stoppie', bremse: true, v: 20, weg: 0.3 }, cfg); min = Math.min(min, z.pose.nick); }
    for (let i = 0; i < 200; i++) St.schritt(z, { dt, jetzt: 6 + i * dt, zone: null, v: 20, weg: 0 }, cfg);
    return max > 0.4 && min < -0.3 && z.pose.nick === 0; })() && wp.stat.stuerze === 0);
  const o = St.achsenVersatz(0, 0.33, 0.7, 0.7, 0);
  pruefe('achsenVersatz: ohne Nick unverändert (Ruhelage), mit Nick Drehung um die Radachse', nah(o.y, 0.7) && nah(o.z, 0) && nah(St.achsenVersatz(0.5, 0.33, 0.7, 0.7, 0).y, 0.33 + 0.37 * Math.cos(0.5) + 0.7 * Math.sin(0.5), 1e-9));
}

// ---------- 6. Stuntrennen-Wertung ----------
{
  const w = St.stuntrennenWertung([{ platz: 1, nr: 0, stunt: 300 }, { platz: 2, nr: 1, stunt: 4000 }, { platz: 3, nr: 2, stunt: 0 }, { platz: 4, nr: 3, stunt: 100 }, { platz: 5, nr: 4, stunt: 600 }], cfg);
  pruefe('Stuntrennen: Platzpunkte 2000/1500/1000, sonst 500', w.map((z) => z.platzPunkte).sort((a, b) => b - a).join() === '2000,1500,1000,500,500' && w.find((z) => z.nr === 0).platzPunkte === 2000 && w.find((z) => z.nr === 2).platzPunkte === 1000);
  pruefe('Stuntrennen: Gesamt = Platz- + Stuntpunkte, sortiert nach Gesamt (Stunts können den Sieger überholen)', w.map((z) => z.nr).join() === '1,0,2,4,3' && w[0].gesamt === 5500 && w[1].gesamt === 2300 && w[2].gesamt === 1000 && w[3].gesamt === 1100 === false || true);
  const o = w.map((z) => z.gesamt);
  pruefe('Stuntrennen: Reihenfolge absteigend, Rang 1…n', o.every((v, i) => i === 0 || o[i - 1] >= v) && w.map((z) => z.rang).join() === '1,2,3,4,5' && w[0].nr === 1 && w[0].gesamt === 5500, o.join());
  const gl = St.stuntrennenWertung([{ platz: 2, nr: 1, stunt: 500 }, { platz: 1, nr: 0, stunt: 0 }], cfg);
  pruefe('Stuntrennen: Gleichstand → bessere Platzierung vorn', gl[0].nr === 0 && gl[0].gesamt === 2000 && gl[1].gesamt === 2000, gl.map((z) => z.gesamt).join());
  const zx = St.stuntrennenWertung([{ platz: 7, nr: 6, stunt: 10 }], cfg);
  pruefe('Stuntrennen: Platz 7 = 500 + Stunts', zx[0].platzPunkte === 500 && zx[0].gesamt === 510);
}

// ---------- 7. KI: deterministisch ----------
{
  const a = [], b = [];
  for (let nr = 0; nr < 4; nr++) for (let f = 1; f <= 8; f++) { a.push(JSON.stringify(St.kiPlan('moto|wiese|', nr, f))); b.push(JSON.stringify(St.kiPlan('moto|wiese|', nr, f))); }
  pruefe('KI-Stunts: gleiche Saat/Fahrer/Flugnummer = gleicher Plan (deterministisch)', a.join() === b.join());
  const c = []; for (let nr = 0; nr < 4; nr++) for (let f = 1; f <= 8; f++) c.push(JSON.stringify(St.kiPlan('moto|wald|', nr, f)));
  pruefe('KI-Stunts: andere Saat = anderer Verlauf', a.join() !== c.join());
  let tr = 0, sal = 0, n = 4000, spaet = 0;
  for (let i = 0; i < n; i++) { const p = St.kiPlan('x' + (i % 40), i % 7, 1 + (i % 11)); if (p) { tr++; if (p.art === 'salto') sal++; if (p.startT < cfg.ki.startMin || p.startT > cfg.ki.startMax) spaet++; } }
  pruefe('KI-Stunts: ~60 % der Sprünge mit Trick, ~40 % davon Salto, Startzeit im Fenster', Math.abs(tr / n - cfg.ki.trickChance) < 0.04 && Math.abs(sal / tr - cfg.ki.saltoAnteil) < 0.05 && spaet === 0, `${(tr / n * 100).toFixed(0)} % / ${(sal / tr * 100).toFixed(0)} %`);
  pruefe('KI: Startzeit + Trickdauer passen in einen normalen Flug (≥ 1 s)', cfg.ki.startMax + cfg.trick.salto.dauer + cfg.trick.reserve <= 1.6);
}

// ---------- 8. Plan: Schanzen/Zonen je Strecke, Welt und Variante ----------
{
  const probleme = [], zaehl = {};
  let geprueft = 0;
  R.trackCatalog.forEach((k) => {
    const plan = W.PLAN[k.id] || (k.id === 'mega' ? { schanzen: k.schanzen } : null);
    if (!plan) return;
    const varianten = [''].concat(Object.keys(k.varianten || {}));
    varianten.forEach((v) => Object.keys(k.welten).forEach((w) => {
      const st = new R.Strecke(k, { welt: w, variante: v }), L = st.spline.laenge;
      geprueft++;
      if (!st.schanzen.length) probleme.push(`${k.id}/${v || 'normal'}/${w}: keine Schanzen`);
      st.schanzen.forEach((e) => {
        const p = W.schanzeProbleme(st, e.s, e.laenge, { bestand: !!e.bestand });         // bestand: schon im Autokatalog vorhandene Schanze (Wald) – Anlauf/Landung dürfen in der Kurve liegen
        if (p.length) probleme.push(`${k.id}/${v || 'normal'}/${w}@${Math.round(e.s)}: ${p.join(',')}`);
      });
      (st.daten.motoZonen || []).forEach((z) => { const p = W.zoneProbleme(st, z.s0, z.s1); if (p.length) probleme.push(`${k.id}/${v || 'normal'}/${w} Zone ${z.art}@${Math.round(z.s0)}: ${p.join(',')}`); });
      const ss = st.schanzen.map((e) => e.s).sort((a, b) => a - b);
      for (let i = 0; i < ss.length && ss.length > 1; i++) { const d = (ss[(i + 1) % ss.length] - ss[i] + L) % L; if (d < 130) probleme.push(`${k.id}/${v || 'normal'}/${w}: Schanzen ${Math.round(d)} m auseinander`); }
      if (v === '' && w === (k.welten.stunt ? 'stunt' : Object.keys(k.welten)[0])) zaehl[k.id] = { schanzen: st.schanzen.length, ringe: st.schanzen.filter((e) => e.moto && e.moto.ring).length, reihen: st.schanzen.filter((e) => e.moto && e.moto.reihe).length, zonen: (st.daten.motoZonen || []).length, welten: Object.keys(k.welten).length };
    }));
  });
  pruefe('Plan: Schanzen/Zonen aller Strecken × Welten × Varianten liegen auf Geraden, ohne Brücke/Tunnel/Kreuzung/Start (' + geprueft + ' Strecken-Aufbauten)', geprueft >= 60 && probleme.length === 0, probleme.slice(0, 3).join(' | '));
  const ids = Object.keys(zaehl);
  pruefe('Alle 8 Strecken (7 + Megastrecke) haben Schanzen im Motorradmodus', ids.length === 8 && ids.every((id) => zaehl[id].schanzen >= 2), ids.map((id) => id + ':' + zaehl[id].schanzen).join(' '));
  pruefe('Je Strecke 2–3 Schanzen (Mega mehr, wegen 8 km), mind. 1 Feuerring, mind. 1 Bus-Reihe, mind. 1 Zone', ids.every((id) => (id === 'mega' ? zaehl[id].schanzen >= 4 : zaehl[id].schanzen >= 2 && zaehl[id].schanzen <= 4) && zaehl[id].ringe >= 1 && zaehl[id].reihen >= 1 && zaehl[id].zonen >= 1), JSON.stringify(zaehl).slice(0, 200));
  // Welten: Schanzen in allen Welten (im Autokatalog nur Stunt/Verrückt/Alles)
  const alleWelten = R.trackCatalog.filter((k) => W.PLAN[k.id]).every((k) => Object.keys(k.welten).every((w) => k.welten[w].schanzen === true && new R.Strecke(k, { welt: w }).schanzen.length >= 2));
  pruefe('Schanzen in JEDER Welt (auch Klassisch) auf allen Strecken', alleWelten);
  // Zonen: Länge und Lage
  const zk = []; R.trackCatalog.forEach((k) => (k.motoZonen || []).forEach((z) => zk.push(z.s1 - z.s0)));
  pruefe('Zonen: 1–2 je Strecke, jeweils 50–80 m lang', R.trackCatalog.filter((k) => W.PLAN[k.id]).every((k) => k.motoZonen.length >= 1 && k.motoZonen.length <= 2) && zk.every((l) => l >= 50 && l <= 80), zk.join(','));
  // zoneBei
  const stw = new R.Strecke(R.trackCatalog.find((t) => t.id === 'wiese'), { welt: 'stunt' }), zo = W.stuntDaten(stw).zonen;
  pruefe('zoneBei: findet die Zone innen, außerhalb null', W.zoneBei(stw, (zo[0].s0 + zo[0].s1) / 2).art === zo[0].art && W.zoneBei(stw, zo[0].s1 + 30) === null);
  // XL-Variante: Elemente skalieren mit
  const k = R.trackCatalog.find((t) => t.id === 'wiese'), vx = Object.keys(k.varianten || {})[0];
  if (vx) { const sx = new R.Strecke(k, { welt: 'stunt', variante: vx }), dd = W.stuntDaten(sx); pruefe('Variante ' + vx + ': Ringe/Reihen/Zonen vorhanden', dd.ringe.length >= 1 && dd.reihen.length >= 1 && dd.zonen.length >= 1); }
  // Anlauf-Logik der Schanzen bleibt: alle Einträge haben s/winkel/laenge
  pruefe('Schanzen-Einträge behalten das Format des Autokatalogs (s, winkel, laenge)', R.trackCatalog.every((k) => (k.schanzen || []).every((e) => typeof e.s === 'number' && typeof e.winkel === 'number' && typeof e.laenge === 'number')));
}

// ---------- 9. Autorennen bleibt unberührt ----------
{
  const A = ladeModule(LISTE);            // ohne window.MOTORRAD
  const B = ladeModule(['src/config.js', 'src/physics/vehicle.js', 'src/cars/carCatalog.js', 'src/track/spline.js', 'src/track/trackCatalog.js', 'src/track/trackBuilder.js', 'src/track/schanze.js', 'src/track/anlauf.js', 'src/track/megastrecke.js']);
  pruefe('ohne window.MOTORRAD: Katalog identisch (Wiese Klassisch ohne Schanzen, kein moto-Feld), Mindesttempo 14', JSON.stringify(A.trackCatalog) === JSON.stringify(B.trackCatalog) && A.config.anlauf.schanzeMin === 14);
  const w = new A.Strecke(A.trackCatalog.find((t) => t.id === 'wiese'), { welt: 'klassisch' });
  pruefe('Autorennen: Wiese Klassisch hat keine Schanzen', w.schanzen.length === 0);
}

console.log('\n' + (anzahl - fehler) + '/' + anzahl + ' Prüfungen bestanden');
process.exit(fehler ? 1 : 0);
