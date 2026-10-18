// v31 H1: Positionslog im Looping – node tests/looping_log.js [welt] [seed] [teilnehmer] [runden] [tiere:0/1] [stufe]
// Fantasie online-Simulation (server/simulation.js = main.js physikSchritt). 2 Spieler (Autopilot-Fahrer) + KI.
// Je Auto im Looping: Winkel, q (Auto), Bandmitte, Abstand zur Bandmitte (Soll ≤ bandHalb − Autobreite/2),
// Looping-Pose vs. Physik-Position (Bodenspur), Ereignisse davor (Rempeln, Reset, Tier/Verkehr).
'use strict';
const { Simulation } = require('../server/simulation.js');
function lauf(opt) {
  const welt = opt.welt || 'alles', seed = opt.seed || 1, N = opt.n || 11, runden = opt.runden || 3;
  const sim = new Simulation({ einstellungen: { streckeId: 'fantasie', welt, gegner: N - 2, runden, schwierigkeit: opt.stufe || 'mittel', kollisionen: opt.kollisionen !== false,
    tiere: opt.tiere !== false, geisterfahrer: !!opt.geister, polizei: false, krankenwagen: !!opt.geister, abschleppwagen: !!opt.geister, tempoKlasse: opt.klasse || 'normal' },
    spieler: [{ fahrer: 'A', auto: 'passat' }, { fahrer: 'B', auto: 'multivan' }], seed });
  const S = sim.sim, R = sim.R, st = S.strecke, LP = R.Looping, dt = R.config.physik.schritt;
  [0, 1].forEach((i) => { const f = S.fahrzeuge[i]; f.autopilot = new R.Driver(f.vehicle, st, { schwierigkeit: opt.stufe || 'mittel', seed: 7000 + i + seed }); });
  const ergebnis = { seed, welt, N, runden, eintritte: 0, geschafft: 0, gefallen: 0, aussen: [], aussenAnz: 0, sprung: [], resetsImLooping: 0, maxAbstand: 0, maxPoseDiff: 0, unterLooping: [], endeS: 0, zeit: 0, imZiel: 0 };
  // größter Querversatz je Physikschritt durch den Einstiegsfang auf der Geraden (looping.fuehren) und Anzahl Schritte mit Fang
  if (!LP._fuehrMess) {
    const orig = LP.einfahrt; LP._fuehrMess = { max: 0, n: 0 };
    LP.einfahrt = function (lp, v, st2, sA, sN, q) { const x0 = v.x, z0 = v.z, r = orig.apply(this, arguments); if (!r) { const d = Math.hypot(v.x - x0, v.z - z0); if (d > 1e-9) { LP._fuehrMess.n++; if (d > LP._fuehrMess.max) LP._fuehrMess.max = d; } } return r; };
  }
  LP._fuehrMess.max = 0; LP._fuehrMess.n = 0;
  const lastRempel = new Map();
  const bAlt = new Map();
  for (let k = 0; k < 60 * 900 && !sim.fertig; k++) {
    S.fahrzeuge.slice(0, 2).forEach((f, i) => { if (f.autopilot && S.rennen.gasErlaubt) { const s = f.autopilot.steuerung(dt, { andere: [], spielerFortschrittMax: null, eigenerFortschritt: S.rennen.teilnehmer[i].fortschritt, laeuft: true }); if (f.looping.aktiv) { s.gas = 1; s.bremse = 0; }   // Mensch hält im Looping Gas (der Fahrer kennt den Looping nicht und würde bremsen)
 sim.eingabeSetzen(i, s); } });
    const vorher = S.fahrzeuge.map(f => ({ lp: f.looping.aktiv, nr: f.netReset || 0 }));
    sim.schritt();
    for (let i = 0; i < sim.nT; i++) {
      const f = S.fahrzeuge[i], lp = f.looping, v = f.vehicle;
      if (lp.aktiv !== vorher[i].lp) { if (lp.aktiv) { ergebnis.eintritte++; lp._log = { veto: lp.vetoEin, t: k * dt, qEin: lp.qEin, vEin: lp.v, nr: i, max: 0, ueber: -1, L: lp.looping.s }; } }
      if ((f.netReset || 0) !== vorher[i].nr && vorher[i].lp) ergebnis.resetsImLooping++;
      if (lp.aktiv) {
        const L = lp.looping, w = Math.min(lp.winkel, 2 * Math.PI), q = LP.autoQ(L, lp, w), bq = LP.bandQ(L, w), ab = Math.abs(q - bq);
        const b = LP.bahn(st, L, w, q), gp = st.spline.punktBei(L.s + L.versatz * w / (2 * Math.PI));
        const physQ = (v.x - gp.x) * gp.nx + (v.z - gp.z) * gp.nz;
        const poseDiff = Math.abs(physQ - q);
        const aussenMass = (b.h > 0.3) ? ab - (L.bandHalb - 1.0) : -1;   // Auto 2 m breit; nur wenn vom Boden abgehoben (h > 0,3 m): > 0 → Auto-Rand über Bandkante hinaus
        if (lp._log) { if (b.h > 0.3 && lp._log.wAb === undefined) { lp._log.wAb = w * 180 / Math.PI; lp._log.abAb = ab; } if (b.h > 0.3 && aussenMass > lp._log.ueber) lp._log.ueber = aussenMass; }
        if (lp._qAlt !== undefined && lp._log) { const dq = Math.abs(q - lp._qAlt); if (dq > (ergebnis.maxDq || 0)) ergebnis.maxDq = +dq.toFixed(3); }
        lp._qAlt = q;
        if (ab > ergebnis.maxAbstand) ergebnis.maxAbstand = ab;
        if (poseDiff > ergebnis.maxPoseDiff) ergebnis.maxPoseDiff = poseDiff;
        if (lp._log && ab > lp._log.max) lp._log.max = ab;
        if (aussenMass > 0.01) {
          ergebnis.aussenAnz++;
          const e = ergebnis.aussen[ergebnis.aussen.length - 1];
          if (!e || e.nr !== i || e.ein !== lp._log.t) ergebnis.aussen.push({ nr: i, ein: lp._log.t, t: +(k * dt).toFixed(2), wGrad: Math.round(w * 180 / Math.PI), qEin: +lp.qEin.toFixed(2), ab: +ab.toFixed(2), v: +lp.v.toFixed(1), h: +b.h.toFixed(1), name: S.rennen.teilnehmer[i].name });
          else e.ab = Math.max(e.ab, +ab.toFixed(2)), e.wGrad = Math.max(e.wGrad, Math.round(w * 180 / Math.PI));
        }
      }
      if (!lp.aktiv && !lp.fallen && !v.imLooping && f.looping) {
        // am Boden mit Tempo durch den Looping-Bereich (zwischen Einfahrt und Ausfahrt) = „unten durch“
        for (const LL of st.loopings) {
          const n = f.nah;
          if (n && Math.abs(v.vLaengs) > 8 && st.spline.differenzS(n.s, LL.s) > 1 && st.spline.differenzS(n.s, LL.s) < LL.versatz - 1 && Math.abs(n.seitenabstand) < st.breite / 2) {
            ergebnis.unterLooping.push({ nr: i, s: +n.s.toFixed(1), v: +v.vLaengs.toFixed(1), t: +(k * dt).toFixed(1) });
          }
        }
      }
      if (lp.aktiv === false && vorher[i].lp && lp._log) { lp._qAlt = undefined; ergebnis.paesse = ergebnis.paesse || []; ergebnis.paesse.push({ nr: i, qEin: +lp._log.qEin.toFixed(2), vEin: +lp._log.vEin.toFixed(1), wAb: lp._log.wAb === undefined ? null : Math.round(lp._log.wAb), abAb: lp._log.abAb === undefined ? null : +lp._log.abAb.toFixed(2), ueber: +lp._log.ueber.toFixed(2), veto: !!lp._log.veto, s: lp._log.L, t: +lp._log.t.toFixed(1) }); lp._log = null; }
    }
  }
  S.fahrzeuge.slice(0, sim.nT).forEach((f) => { ergebnis.geschafft += f.looping.geschafft; ergebnis.gefallen += f.looping.gefallen; });
  ergebnis.maxFuehr = +LP._fuehrMess.max.toFixed(3); ergebnis.nFuehr = LP._fuehrMess.n;
  ergebnis.nochDrin = S.fahrzeuge.slice(0, sim.nT).filter(f => f.looping.aktiv).length;   // beim Rennende gerade im Looping
  ergebnis.imZiel = S.rennen.teilnehmer.filter(t => t.imZiel).length; ergebnis.zeit = sim.tick * dt;
  return ergebnis;
}
module.exports = { lauf };
if (require.main === module) {
  const a = process.argv.slice(2);
  const e = lauf({ welt: a[0] || 'alles', seed: +a[1] || 1, n: +a[2] || 11, runden: +a[3] || 3, tiere: a[4] !== '0', stufe: a[5] });
  const p = e.paesse || [], schlecht = p.filter(x => x.ueber > 0);
  console.log(JSON.stringify(Object.assign({}, e, { aussen: undefined, paesse: undefined })));
  console.log('Durchfahrten ' + p.length + ', davon Auto-Rand über Bandkante (h>0,3 m): ' + schlecht.length + ', max über Kante ' + Math.max(0, ...p.map(x => x.ueber)).toFixed(2) + ' m');
  const nach = {}; p.forEach(x => { const k = Math.round(x.qEin / 2) * 2; (nach[k] = nach[k] || []).push(x.ueber); });
  console.log('qEin-Klasse (m): Anzahl, davon schlecht, max über'); Object.keys(nach).sort((x, y) => x - y).forEach(k => console.log(' ' + k + ': ' + nach[k].length + ', ' + nach[k].filter(u => u > 0).length + ', ' + Math.max(...nach[k]).toFixed(2)));
}
