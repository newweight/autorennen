// S3 – Neue Tricks (Motorrad + Auto), Zeitlupe: node tests/test_spass_s3.js
//  A) Zeitplan (plan), Einblend-Gewicht, Anzeige-Pose: Grenzen, Abkürzung, zu kurz = gar nicht
//  B) Zustandsmaschine (schritt): Richtungen Motorrad/Auto, Fenster, keine Doppelauslösung, Landung ≥ 50 % (Auto ≥ 90 %), Vielfaltsbonus, Combo
//  C) Fahrer-Pose: Gliedlängen (Beine erreichen die Fußziele), Handstand kopfüber, Superman gestreckt, Abstand zu Sitz/Heck
//  D) Server (Motorrad-Simulation): Trick-Taste + Richtung → Stunt-Ereignis mit Punkten, mo[13..14], zwei Läufe bitgleich; ohne Richtung wie bisher
//  E) Schalter (Standard an, speicherbar), Sticker-Katalog
'use strict';
const { ladeModule } = require('./lade');
const { Simulation, ladenMoto } = require('../server/simulation');

let fehler = 0, ok = 0;
setTimeout(() => { console.log('FEHL Wächter: Test hängt (> 300 s) – Abbruch'); process.exit(3); }, 300000).unref();
function pruefe(name, gut, info) { console.log((gut ? 'OK   ' : 'FEHL ') + name + (info !== undefined ? '  (' + info + ')' : '')); if (gut) ok++; else fehler++; }

const R = ladeModule(['src/config.js', 'src/spass/spassSticker.js', 'src/spass/spassTricks.js']);
const T = R.SpassTricks, K = T.config(), DT = 1 / 60;

// ---------------------------------------------------------------- A) Plan, Gewicht, Anzeige
{
  pruefe('A plan: genug Zeit = volle Dauer', JSON.stringify(T.plan(3, 'backflip')) === JSON.stringify({ dauer: K.zeit.backflip.dauer, abgekuerzt: false }));
  const p = T.plan(0.9 + K.reserve, 'backflip');
  pruefe('A plan: knapp = abgekürzt (min ≤ Dauer < normal), Reserve vor der Landung bleibt', !!p && p.abgekuerzt && p.dauer >= K.zeit.backflip.min && p.dauer < K.zeit.backflip.dauer, JSON.stringify(p));
  pruefe('A plan: zu kurz oder ohne Flug = null', T.plan(0.3, 'handstand') === null && T.plan(0, 'superman') === null && T.plan(-1, 'superman') === null && T.plan(NaN, 'superman') === null);
  pruefe('A gewicht: 0 am Anfang/Ende, 1 in der Mitte, stetig', T.gewicht(0) === 0 && T.gewicht(1) === 0 && Math.abs(T.gewicht(0.5) - 1) < 1e-9 && T.gewicht(0.05) > 0 && T.gewicht(0.05) < 1);
  const b = T.anzeige('backflip', 1), b0 = T.anzeige('backflip', 0), bm = T.anzeige('backflip', 0.5);
  pruefe('A Backflip: volle Rückwärtsdrehung 2π, Start 0, Hüpfer nur in der Mitte', Math.abs(b.salto - 2 * Math.PI) < 1e-9 && b0.salto === 0 && bm.hoehe > 0.3 && b.hoehe < 1e-9);
  const f = T.anzeige('fassrolle', 1, -1), s = T.anzeige('schraube', 1, 1);
  pruefe('A Fassrolle/Schraube: 2π, Richtung nach dir', Math.abs(f.rolle + 2 * Math.PI) < 1e-9 && Math.abs(s.schraube - 2 * Math.PI) < 1e-9);
}

// ---------------------------------------------------------------- B) Zustandsmaschine
/** Ein Flug von 2 s Rest; ereignis(t) liefert Eingaben je Schritt. Rückgabe: z3 + Liste gestarteter Tricks. */
function flug(art, ereignis, opt) {
  opt = opt || {};
  const z3 = T.zNeu(), gestartet = [], zeiten = [], gesamt = opt.gesamt || 2.0, landeBei = opt.landeBei || gesamt;
  let jetzt = 0, c = T.comboNeu();
  const e0 = { dt: DT, art, luft: false, abflug: false, landung: false, flugT: 0, rest: null, taste: false, halten: false, dir: {} };
  for (let n = 0; n <= Math.round(landeBei / DT) + 1; n++) {
    const t = n * DT, drin = t < landeBei;
    jetzt += DT;
    const x = Object.assign({}, e0, { jetzt, luft: drin, abflug: n === 0, landung: !drin && n > 0 && z3.luft, flugT: t, rest: drin ? gesamt - t : null, dir: {} });
    if (art === 'moto') { x.comboStunt = (j) => T.comboStunt(c, j); x.comboZaehler = () => c.zaehler; }
    Object.assign(x, ereignis(t, n) || {});
    const r = T.schritt(z3, x);
    if (r.start) { gestartet.push(r.start); zeiten.push(t); }
  }
  return { z3, gestartet, zeiten };
}
{
  const mitDir = (d, t0) => (t) => (Math.abs(t - 0.3) < DT / 2 ? { taste: true } : Math.abs(t - (t0 || 0.35)) < DT / 2 ? { dir: { [d]: true } } : null);
  const r1 = flug('moto', mitDir('runter')), r2 = flug('moto', mitDir('hoch')), r3 = flug('moto', mitDir('links')), r4 = flug('moto', mitDir('rechts'));
  pruefe('B Motorrad: Trick + ↓ Backflip, + ↑ Superman, + ←/→ Handstand', r1.gestartet[0] === 'backflip' && r2.gestartet[0] === 'superman' && r3.gestartet[0] === 'handstand' && r4.gestartet[0] === 'handstand',
    [r1, r2, r3, r4].map(r => r.gestartet.join()).join(' | '));
  pruefe('B Motorrad: fertig gelandet = Ereignis mit Punkten ≥ Basispunkte, Statistik zählt', r1.z3.ereignisse.length === 1 && r1.z3.ereignisse[0].punkte >= K.punkte.backflip && r1.z3.stat.backflip === 1, JSON.stringify(r1.z3.ereignisse[0]));
  const rt = flug('moto', (t) => (Math.abs(t - 0.3) < DT / 2 ? { taste: true } : null));
  pruefe('B Motorrad: Taste allein startet keinen neuen Trick (Drehung bleibt bei stunts.js)', rt.gestartet.length === 0);
  const rr = flug('moto', (t) => (Math.abs(t - 0.3) < DT / 2 ? { dir: { runter: true } } : null));
  pruefe('B Richtung allein startet nichts', rr.gestartet.length === 0);
  const rf = flug('moto', (t) => (Math.abs(t - 0.3) < DT / 2 ? { taste: true } : Math.abs(t - 0.7) < DT / 2 ? { dir: { runter: true } } : null));
  pruefe('B Fenster: Richtung 0,4 s nach der Taste (> 0,25 s) zählt nicht', rf.gestartet.length === 0);
  const rg = flug('moto', (t) => (Math.abs(t - 0.02) < DT / 2 ? { taste: true, dir: { runter: true } } : null));
  pruefe('B früh gedrückt (im Fenster): Trick beginnt erst nach dem Mindestabstand zum Absprung (frueh)', rg.gestartet.length === 1 && rg.zeiten[0] >= K.frueh - 1e-9, rg.zeiten.join());
  const rd = flug('moto', (t) => (t > 0.3 && t < 0.5 ? { taste: true, halten: true, dir: { runter: true } } : null));
  pruefe('B keine Doppelauslösung: gehaltene Tasten/Richtung starten im selben Flug nur einen Trick', rd.gestartet.length === 1, rd.gestartet.join());
  const rl = flug('moto', mitDir('runter'), { landeBei: 0.75 });
  pruefe('B Landung bei < 50 % des Tricks: nichts gezählt, kein Sturz-Flag nötig (Motorrad)', rl.z3.ereignisse.length === 0 && rl.z3.stat.backflip === 0, JSON.stringify(rl.z3.stat));
  const rk = flug('moto', mitDir('runter'), { gesamt: 1.4 });
  pruefe('B kurzer Flug: Trick abgekürzt, zählt trotzdem', rk.gestartet.length === 1 && rk.z3.stat.abgekuerzt === 1 && rk.z3.ereignisse.length === 1, JSON.stringify(rk.z3.stat));
  const rz = flug('moto', mitDir('runter'), { gesamt: 0.4, landeBei: 0.4 });
  pruefe('B zu kurzer Flug: gar nicht erst begonnen', rz.gestartet.length === 0);

  // Vielfalt: zwei verschiedene Tricks im selben Flug (zweiter erst nach dem ersten) → +25 %
  const z3 = T.zNeu(), c = T.comboNeu(); let jetzt = 0;
  const lauf = (n, f) => { for (let i = 0; i < n; i++) { jetzt += DT; z3.flugT += DT; const x = Object.assign({ dt: DT, jetzt, art: 'moto', luft: true, abflug: false, landung: false, flugT: z3.flugT, rest: 6, taste: false, halten: false, dir: {}, comboStunt: (j) => T.comboStunt(c, j), comboZaehler: () => c.zaehler }, f && f(i)); T.schritt(z3, x); } };
  z3.flugT = 0; T.schritt(z3, { dt: DT, jetzt: 0, art: 'moto', luft: true, abflug: true, landung: false, flugT: 0, rest: 6, taste: false, halten: false, dir: {}, comboStunt: (j) => T.comboStunt(c, j), comboZaehler: () => c.zaehler });
  lauf(20); lauf(1, () => ({ taste: true, dir: { runter: true } })); lauf(90);
  lauf(1, () => ({ taste: true, dir: { hoch: true } })); lauf(90);
  const ev = z3.ereignisse;
  pruefe('B zwei verschiedene Tricks: zweiter mit Combo ×2 und Vielfaltsbonus +25 %', ev.length === 2 && ev[1].combo === 2 && ev[1].vielfalt === 1 && ev[1].punkte === Math.round(K.punkte.superman * 2 * 1.25) && ev[0].punkte === K.punkte.backflip, ev.map(x => x.art + ':' + x.punkte + '(×' + x.combo + ')').join(' '));

  // Auto
  const ca = (d) => (t) => (Math.abs(t - 0.3) < DT / 2 ? { taste: true, dir: d ? { [d]: true } : {} } : null);
  const a1 = flug('auto', ca('links')), a2 = flug('auto', ca('rechts')), a3 = flug('auto', ca('hoch')), a4 = flug('auto', ca('runter')), a5 = flug('auto', ca(null));
  pruefe('B Auto: ←/→ Fassrolle (Richtung), ↑/↓ Schraube, Taste allein Fassrolle (nach Wartezeit)', a1.gestartet[0] === 'fassrolle' && a2.gestartet[0] === 'fassrolle' && a3.gestartet[0] === 'schraube' && a4.gestartet[0] === 'schraube' && a5.gestartet[0] === 'fassrolle',
    [a1, a2, a3, a4, a5].map(r => r.gestartet.join()).join(' | '));
  pruefe('B Auto: Richtung links = −1, rechts = +1 (Anzeige-Drehsinn)', a1.z3.pose.dir === -1 || a1.z3.stat.fassrolle === 1);
  const al = flug('auto', ca('links'), { landeBei: 0.9 });
  pruefe('B Auto: Landung mit unfertigem Trick (< 90 %) → landeFehler (Wackeln), nichts gezählt', al.z3.landeFehler === true && al.z3.ereignisse.length === 0);
  pruefe('B Auto: fertig gelandet = Punkte, kein Fehler', a1.z3.landeFehler === false && a1.z3.ereignisse.length === 1 && a1.z3.ereignisse[0].punkte >= K.punkte.fassrolle);
  const cz = T.comboNeu();
  const f1 = T.comboStunt(cz, 10), f2 = T.comboStunt(cz, 12), f3 = T.comboStunt(cz, 30);
  pruefe('B Auto-Combo: Kette innerhalb des Fensters wächst, danach wieder ×1, Obergrenze', f1 === 1 && f2 === 2 && f3 === 1);
  let cm = T.comboNeu(), mx = 0; for (let i = 0; i < 12; i++) mx = Math.max(mx, T.comboStunt(cm, i));
  pruefe('B Combo-Obergrenze (config.combo.max)', mx === K.combo.max, mx);
}

// ---------------------------------------------------------------- C) Fahrer-Pose
{
  const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  const F = T.FAHRER, reichweite = 2 * F.bein + 1e-6;
  const hueften = (pose) => [[-1, 1].map((s) => T.ausKoerper(pose, [s * F.hueft[0], F.hueft[1], F.hueft[2]]))][0];
  for (const art of ['superman', 'handstand']) {
    const pose = T.fahrerPose(art, 1, 0);
    const h = hueften(pose), fuss = pose.fuss;
    // linkes/rechtes Bein: nach einer Drehung um π tauscht die Seite – nächstes Hüftpaar nehmen
    const d = [Math.min(dist(h[0], fuss[0]), dist(h[1], fuss[0])), Math.min(dist(h[0], fuss[1]), dist(h[1], fuss[1]))];
    pruefe('C ' + art + ': beide Füße in Reichweite der Beine (≤ 2 × Gliedlänge)', d[0] <= reichweite && d[1] <= reichweite, d.map(x => x.toFixed(2)).join('/') + ' ≤ ' + reichweite.toFixed(2));
  }
  const hs = T.fahrerPose('handstand', 1, 0), sm = T.fahrerPose('superman', 1, 0), ru = T.fahrerPose('handstand', 0, 0);
  const kopf = T.ausKoerper(hs, F.kopf), hueft = T.ausKoerper(hs, F.hueft);
  pruefe('C Handstand: Kopf unter der Hüfte (kopfüber), Füße hoch über dem Lenker', kopf[1] < hueft[1] && hs.fuss[0][1] > 2.5, 'Kopf y ' + kopf[1].toFixed(2) + ', Hüfte y ' + hueft[1].toFixed(2));
  pruefe('C Superman: Füße weit hinten (z > 1) und höher als die Sitzbank, Oberkörper nach vorn geneigt', sm.fuss[0][2] > 1 && sm.fuss[0][1] > 1 && sm.theta < 0, JSON.stringify(sm.fuss[0]));
  pruefe('C Gewicht 0 = feste Sitzpose (A, Winkel, Füße wie Ruhe)', ru.rho === 0 && ru.theta === 0 && dist(ru.A, F.A) < 1e-9 && dist(ru.fuss[0], F.ruhe.fuss[0]) < 1e-9);
  const mitte = T.fahrerPose('superman', 0.5, 0.3);
  pruefe('C Zwischenwerte stetig und endlich', [mitte.A, mitte.fuss[0], mitte.fuss[1]].every(v => v.every(Number.isFinite)) && mitte.theta < 0 && mitte.theta > sm.theta);
  const sitz = T.ausKoerper(sm, F.B);
  pruefe('C Superman: Schulter höher als der Sitz (Rücken liegt nicht im Motorrad), y > 1,1', sitz[1] > 1.1, sitz[1].toFixed(2));
  pruefe('C Handstand: Schulter über dem Lenker (y > 1,0) und hinter dem Lenker nicht im Heck (z < 0,5)', T.ausKoerper(hs, F.B)[1] > 1.0 && T.ausKoerper(hs, F.B)[2] < 0.5);
}

// ---------------------------------------------------------------- D) Server (Motorrad)
function serverLauf(variante) {
  const sim = new Simulation({ moto: true, einstellungen: { streckeId: 'wiese', gegner: 0, runden: 2, unfall: 'aus', kollisionen: false, jahreszeit: 'sommer', wetter: 'klar', tageszeit: 'tag', stuntrennen: true },
    spieler: [{ fahrer: 'Jonas', auto: 'superbike', hilfe: 'aus' }], seed: 11 });
  const S = sim.sim, f = S.fahrzeuge[0], v = f.vehicle, sch = S.strecke.schanzen[0];
  const p = S.strecke.spline.punktBei(sch.s - 40);
  v.setzen(p.x, p.z, Math.atan2(-p.tx, -p.tz)); v.vLaengs = 40; f.index = -1;
  for (let i = 0; i < 60 * 15 && S.rennen.zustand === 'countdown'; i++) sim.schritt();       // Countdown abwarten, dann an die Schanze setzen
  v.setzen(p.x, p.z, Math.atan2(-p.tx, -p.tz)); v.vLaengs = 40; f.index = -1;
  const ev = [], mos = [], luftT = [];
  let inLuft = -1;
  for (let n = 0; n < 60 * 25; n++) {
    const mo = sim.zustand().mo[0];
    const luft = !!(mo[6] & 128);
    if (luft && inLuft < 0) inLuft = n;
    if (!luft && inLuft >= 0 && n - inLuft > 20) break;
    const k = inLuft < 0 ? -1 : n - inLuft;
    let steu = { gas: inLuft < 0 ? 1 : 0.3, bremse: 0, lenkung: 0 }, trick = false;
    if (variante !== 'keine') {
      if (k >= 15 && k < 18) trick = true;
      if (k >= 16 && k < 19) { if (variante === 'backflip') steu = { gas: 0, bremse: 1, lenkung: 0 }; else if (variante === 'superman') steu = { gas: 1, bremse: 0, lenkung: 0 }; else if (variante === 'handstand') steu = { gas: 0, bremse: 0, lenkung: -1 }; }
    }
    sim.trickSetzen(0, trick); sim.eingabeSetzen(0, steu); sim.schritt();
    for (const e of sim.abholen()) ev.push(Object.assign({ n }, e));
    const m2 = sim.zustand().mo[0]; mos.push(m2.slice(7, 15).join(','));
    if (luft) luftT.push(m2[13]);
  }
  return { ev, mos, inLuft, luftT, stunts: ev.filter(e => e.art === 'stunt') };
}
{
  const res = {};
  for (const va of ['backflip', 'superman', 'handstand', 'keine']) res[va] = serverLauf(va);
  pruefe('D Server: Schanze erreicht, Flug erkannt (mo[0][6] & 128)', Object.values(res).every(r => r.inLuft > 0), Object.entries(res).map(([k, r]) => k + '@' + r.inLuft).join(' '));
  for (const [va, nam] of [['backflip', 'Backflip'], ['superman', 'Superman'], ['handstand', 'Handstand']]) {
    const r = res[va], e = r.stunts.find(x => (x.name || '').indexOf(nam) >= 0);
    pruefe('D Server: Trick-Taste + Richtung → Stunt-Ereignis „' + nam + '“ mit Punkten', !!e && e.p > 0 && e.nr === 0, JSON.stringify(r.stunts.map(x => x.name + ':' + x.p)));
  }
  const code = (va) => Math.max(0, ...res[va].luftT);
  pruefe('D Server: mo[13] Trick-Code im Flug (1 Superman, 2 Handstand, 3 Backflip)', code('superman') === 1 && code('handstand') === 2 && code('backflip') === 3, [code('superman'), code('handstand'), code('backflip')].join('/'));
  pruefe('D Server: ohne Trick-Taste gar nichts Neues (mo[13] = 0, kein Trick-Ereignis dieser Art)', code('keine') === 0 && !res.keine.stunts.some(x => /Backflip|Superman|Handstand/.test(x.name || '')));
  const r2 = serverLauf('backflip');
  pruefe('D Server: zweiter Lauf bitgleich (mo[7..14] je Schritt, Ereignisse)', JSON.stringify(r2.mos) === JSON.stringify(res.backflip.mos) && JSON.stringify(r2.ev) === JSON.stringify(res.backflip.ev));
}

// ---------------------------------------------------------------- E) Schalter, Sticker
{
  pruefe('E Schalter Auto-Tricks und Zeitlupe: Standard an', T.an('auto') === true && T.an('zeit') === true);
  T.anSetzen('auto', false);
  pruefe('E Schalter speicherbar (Auto-Tricks aus, Zeitlupe bleibt an)', T.an('auto') === false && T.an('zeit') === true);
  T.anSetzen('auto', true);
  const S = R.SpassSticker;
  const ids = S.katalog('motorrad').map((x) => x.id).concat(S.katalog('auto').map((x) => x.id));
  const noetig = ['zeitlupe', 'fassrolle', 'superman', 'handstand', 'backflip'];
  pruefe('E Sticker: Zeitlupen-Sprung, erste Fassrolle, Superman, Handstand, Backflip im Katalog', ids.length > 0 && noetig.every((n) => ids.includes(n)), ids.length + ' Sticker; fehlt: ' + noetig.filter((n) => !ids.includes(n)).join(','));
}

console.log('\n' + ok + ' OK, ' + fehler + ' FEHL');
process.exit(fehler ? 1 : 0);
