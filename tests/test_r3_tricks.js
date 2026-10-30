// R3 – KI-Tricks offline (Auto + Motorrad): node tests/test_r3_tricks.js
//  A) kiPlanNeu: Determinismus, Häufigkeit über 10 000 Flüge je Stufe, Monotonie, Verteilung Schraube / Superman-Backflip-Handstand, kein Math.random
//  C) Auto-Raum online (Server rechnet Fassrolle/Schraube/Fehltrick, Computer-Tricks)  D) Raum ohne tricks bitgleich zur Basis a69f2ec  E) Motorrad-Raum Computer-Tricks
//  F) Vorhersage-Messung Fehltrick-Sprung  G) Client-Stub (spassOnlineR3.js)  H) echter Server per WebSocket (hallo.r3, Raum-Schalter, alter Client)   – Einzelteil: node tests/test_r3_tricks.js C
//  B) Verdrahtung (schrittSpiel mit Attrappe): Schalter aus = nichts, an = KI macht Tricks, nie ein Fehltrick, nie im Looping/Kanone/Ausgeschieden, Spieler unberührt
'use strict';
const { ladeModule } = require('./lade');
let fehler = 0, ok = 0;
setTimeout(() => { console.log('FEHL Wächter: Test hängt'); process.exit(3); }, 300000).unref();
function pruefe(name, gut, info) { console.log((gut ? 'OK   ' : 'FEHL ') + name + (info !== undefined ? '  (' + info + ')' : '')); if (gut) ok++; else fehler++; }

const R = ladeModule(['src/config.js', 'src/spass/spassSticker.js', 'src/spass/spassTricks.js']);
const T = R.SpassTricks, K = T.config(), STUFEN = ['leicht', 'mittel', 'schwer', 'profi', 'meister', 'legende', 'unschlagbar'];

// ---------------------------------------------------------------- A) Plan
{
  const a = [], b = [];
  for (let nr = 0; nr < 6; nr++) for (let f = 1; f <= 30; f++) for (const art of ['auto', 'moto']) { a.push(JSON.stringify(T.kiPlanNeu('wiese|1', nr, f, 'profi', art))); b.push(JSON.stringify(T.kiPlanNeu('wiese|1', nr, f, 'profi', art))); }
  pruefe('A Determinismus: gleiche Saat = gleiche Pläne', a.join() === b.join());
  const c = []; for (let nr = 0; nr < 6; nr++) for (let f = 1; f <= 30; f++) for (const art of ['auto', 'moto']) c.push(JSON.stringify(T.kiPlanNeu('wald|2', nr, f, 'profi', art)));
  pruefe('A andere Strecke = andere Pläne', a.join() !== c.join());
  pruefe('A unbekannte Schwierigkeit = mittel', JSON.stringify(T.kiPlanNeu('x', 1, 1, 'quatsch', 'auto')) === JSON.stringify(T.kiPlanNeu('x', 1, 1, 'mittel', 'auto')));
  const N = 10000, anteil = {}, schr = {}, mo = {};
  let startOk = true, richtigeRichtung = true;
  for (const s of STUFEN) {
    let n = 0, sc = 0, sm = 0, bf = 0, hs = 0, sp = 0;
    for (let i = 0; i < N; i++) {
      const p = T.kiPlanNeu('s' + (i % 37) + '|' + (i % 3), i % 7, 1 + ((i / 7) | 0), s, 'auto');
      if (p) { n++; if (p.art === 'schraube') sc++; if (p.startT < K.ki.startMin - 1e-9 || p.startT > K.ki.startMin + K.ki.startSpanne + 1e-9) startOk = false; if ((p.art === 'schraube') !== (p.richtung === 'hoch' || p.richtung === 'runter')) richtigeRichtung = false; }
      const q = T.kiPlanNeu('s' + (i % 37) + '|' + (i % 3), i % 7, 1 + ((i / 7) | 0), s, 'moto');
      if (q) { sp++; if (q.art === 'superman') sm++; else if (q.art === 'backflip') bf++; else hs++; if (q.startT < K.ki.startMin - 1e-9 || q.startT > K.ki.startMin + K.ki.startSpanne + 1e-9) startOk = false; }
    }
    anteil[s] = n / N; schr[s] = sc / Math.max(1, n); mo[s] = { chance: sp / N, sm: sm / Math.max(1, sp), bf: bf / Math.max(1, sp), hs: hs / Math.max(1, sp) };
  }
  pruefe('A Häufigkeit Auto je Stufe = Tabelle (±2 %)', STUFEN.every((s) => Math.abs(anteil[s] - K.ki.chance[s]) < 0.02), STUFEN.map((s) => s + ' ' + anteil[s].toFixed(3)).join(' '));
  pruefe('A Häufigkeit Motorrad je Stufe = Tabelle (±2 %)', STUFEN.every((s) => Math.abs(mo[s].chance - K.ki.chance[s]) < 0.02), STUFEN.map((s) => s + ' ' + mo[s].chance.toFixed(3)).join(' '));
  pruefe('A Schraube-Anteil Auto = Tabelle (±4 %)', STUFEN.every((s) => Math.abs(schr[s] - K.ki.schraube[s]) < 0.04), STUFEN.map((s) => s + ' ' + schr[s].toFixed(2)).join(' '));
  pruefe('A Motorrad Superman/Backflip/Handstand = Tabelle (±4 %)', STUFEN.every((s) => Math.abs(mo[s].sm - K.ki.moto[s][0]) < 0.04 && Math.abs(mo[s].bf - K.ki.moto[s][1]) < 0.04 && Math.abs(mo[s].hs - K.ki.moto[s][2]) < 0.04),
    STUFEN.map((s) => s + ' ' + [mo[s].sm, mo[s].bf, mo[s].hs].map((x) => x.toFixed(2)).join('/')).join(' '));
  pruefe('A monoton: höhere Stufe = nie weniger Tricks (Auto und Motorrad)', STUFEN.every((s, i) => i === 0 || (anteil[s] >= anteil[STUFEN[i - 1]] && mo[s].chance >= mo[STUFEN[i - 1]].chance)));
  pruefe('A Startzeit im Bereich 0,25…0,45 s, Richtung passt zur Art', startOk && richtigeRichtung);
  pruefe('A Tabelle: Auto leicht kein Schraube; Motorrad leicht nur Superman', schr.leicht === 0 && mo.leicht.bf === 0 && mo.leicht.hs === 0);
  pruefe('A Genug-Zeit-Regel: Dauer + Reserve + 0,3 s', T.kiGenugZeit(K.zeit.backflip.dauer + K.reserve + 0.3, 'backflip') && !T.kiGenugZeit(K.zeit.backflip.dauer + K.reserve + 0.29, 'backflip') && !T.kiGenugZeit(null, 'backflip'));
  const quelle = require('fs').readFileSync(require('path').join(__dirname, '../src/spass/spassTricks.js'), 'utf8');
  pruefe('A kein Math.random in spassTricks.js', !/Math\.random/.test(quelle.replace(/\/\/.*$/gm, '')));
}

// ---------------------------------------------------------------- B) Verdrahtung mit Attrappe (schrittSpiel)
const fs = require('fs'), path = require('path'), vm = require('vm');
function ladeMit(dateien, moto) {
  const sb = { console, Math, performance: { now: () => Date.now() } };
  sb.window = sb; sb.addEventListener = () => {}; sb.globalThis = sb;
  if (moto) sb.MOTORRAD = true;
  vm.createContext(sb);
  vm.runInContext('window.Rennspiel = { Spiel: class { physikSchritt() {} }, config: {} };', sb);
  for (const d of dateien) vm.runInContext(fs.readFileSync(path.join(__dirname, '..', d), 'utf8'), sb, { filename: d });
  return sb.Rennspiel;
}
const G = 9.81;
/** Spielt Flüge (Absprunggeschwindigkeit vy, Dauer = 2·vy/G) durch; liefert Zählwerte der KI (Fahrzeug 1) und des Spielers (Fahrzeug 0). */
function spielen(art, schw, opt) {
  opt = opt || {};
  const moto = art === 'moto';
  const R2 = ladeMit(moto ? ['src/config.js', 'src/moto/stunts.js', 'src/spass/spassSticker.js', 'src/spass/spassTricks.js'] : ['src/config.js', 'src/spass/spassSticker.js', 'src/spass/spassTricks.js'], moto);
  const S = R2.SpassTricks;
  if (opt.ki === false) S.anSetzen('ki', false);
  if (opt.auto === false) S.anSetzen('auto', false);      // PRUEF-FIX 2: Schalter „Auto-Tricks“ (Menschen) getrennt von „KI-Tricks"
  const mk = (ist, nr) => ({ istSpieler: ist, spielerNr: ist ? nr : -1, ausgeschieden: false, index: 0, vehicle: { x: 0, z: 0, vLaengs: 30 }, driver: ist ? undefined : { schwierigkeit: schw },
    flug: { aktiv: false, t: 0, fluege: 0, y: 0, vy: 0 }, looping: { aktiv: false, fallen: false }, mesh: null });
  const spiel = Object.create(R2.Spiel.prototype);
  const fz = [mk(true, 0), mk(false), mk(false)];
  if (opt.sonder) opt.sonder(fz);
  Object.assign(spiel, { rennen: {}, strecke: { id: 'test', variante: 'a', hoeheAn: () => 0 }, zustand: 'rennen', pausiert: false, szene: opt.ohneSzene ? null : {},
    input: { steuerung: () => ({ gas: 0, bremse: 0, lenkung: 0 }), istGedrueckt: () => false }, fahrzeuge: fz });
  if (moto) {
    const St = R2.Moto.stunts;
    spiel.stunt = { zeit: 0, saat: 'moto|test|a', alle: [], fz: fz.map(() => ({ punkte: 0, combo: St.comboNeu(), stat: { ereignisse: 0 }, pose: { salto: 0, hoehe: 0, gier: 0 }, trick: null, wartend: null, folge: null, gierRest: 0 })) };
  }
  const dt = 1 / 60, ergebnis = { gestartet: [0, 0, 0], fertig: [0, 0, 0], abgekuerzt: 0, fehl: 0, arten: {}, fluege: 0, punkteKi: 0 };
  const S3 = () => spiel._t3;
  const dauern = [];
  for (let n = 0; n < 60; n++) dauern.push(0.5 + ((n * 37) % 100) / 100 * 2.7);        // 0,5…3,2 s, deterministisch gemischt
  let flugNr = 0;
  for (const D of dauern) {
    flugNr++;
    const vy = G * D / 2;
    for (const f of fz) { f.flug.fluege = flugNr; f.flug.aktiv = true; f.flug.t = 0; f.flug.vy = vy; f.flug.y = 0; }
    const gesehen = [false, false, false];
    for (let t = 0; t < D + 0.3; t += dt) {
      const luft = t < D;
      for (const f of fz) { f.flug.aktiv = luft; f.flug.t = luft ? t : 0; f.flug.y = luft ? vy * t - 0.5 * G * t * t : 0; f.flug.vy = vy - G * t; if (!luft) f.flug.vy = 0; }
      if (moto) spiel.stunt.zeit += dt;
      const vorLetzte = fz.map((f, i) => ({ vl: f.vehicle.vLaengs }));
      spiel.physikSchritt = R2.Spiel.prototype.physikSchritt;
      spiel.physikSchritt(dt);
      const s3 = S3();
      for (let i = 0; i < 3; i++) {
        const z3 = s3 && s3.fz[i];
        if (z3 && z3.trick && !gesehen[i]) { gesehen[i] = true; ergebnis.gestartet[i]++; if (i > 0) { ergebnis.arten[z3.trick.art] = (ergebnis.arten[z3.trick.art] || 0) + 1; if (z3.trick.abgekuerzt) ergebnis.abgekuerzt++; } }
        if (z3 && (z3.landeFehler || z3.wackel)) ergebnis.fehl += i > 0 ? 1 : 0;
      }
      if (fz[1].vehicle.vLaengs !== 30 || fz[2].vehicle.vLaengs !== 30) ergebnis.fehl++;
    }
    ergebnis.fluege++;
  }
  const s3 = S3();
  for (let i = 0; i < 3; i++) { const z3 = s3 && s3.fz[i]; if (z3) ergebnis.fertig[i] = Object.keys(z3.stat).filter((k) => k !== 'abgekuerzt').reduce((a, k) => a + z3.stat[k], 0); }
  ergebnis.spielerEreignisse = s3 && s3.fz[0] ? 1 : 0;
  ergebnis.kiHatZustand = !!(s3 && (s3.fz[1] || s3.fz[2]));
  ergebnis.sz = spiel.stunt;
  return ergebnis;
}
// Die Attrappe ruft die in main.js umhüllte physikSchritt-Kette ohne Stunt-Schritt – die KI-Eingabe kommt allein aus spassTricks.js.
for (const art of ['auto', 'moto']) {
  const aus = spielen(art, 'profi', { ki: false });
  pruefe('B ' + art + ': Schalter aus → KI hat keinerlei Trick-Zustand', !aus.kiHatZustand && aus.gestartet[1] === 0 && aus.gestartet[2] === 0);
  if (art === 'auto') {
    // PRUEF-FIX 2: „Auto-Tricks“ aus + „KI-Tricks“ an → die Computer-Gegner machen Tricks, der Mensch nicht; beide aus → Schritt endet sofort (kein Zustand, nichts verändert)
    const ma = spielen(art, 'unschlagbar', { auto: false });
    const gm = ma.gestartet[1] + ma.gestartet[2], vollAn = spielen(art, 'unschlagbar');
    pruefe('B auto: Auto-Tricks AUS + KI-Tricks AN → KI macht trotzdem Tricks (wie bei beiden an), Mensch keine', gm >= 20 && gm === vollAn.gestartet[1] + vollAn.gestartet[2] && ma.gestartet[0] === 0 && ma.abgekuerzt === 0 && ma.fehl === 0, gm + ' gestartet');
    const beide = spielen(art, 'unschlagbar', { auto: false, ki: false });
    pruefe('B auto: beide AUS → bitgleich wie bisher (kein Trick-Zustand, keine Eingriffe)', !beide.kiHatZustand && beide.gestartet.every((x) => x === 0) && beide.fehl === 0 && beide.spielerEreignisse === 0);
    const nurMensch = spielen(art, 'unschlagbar', { ki: false });
    pruefe('B auto: Auto-Tricks AN + KI AUS → nur Menschen (KI ohne Zustand)', !nurMensch.kiHatZustand && nurMensch.gestartet[1] === 0);
  }
  const ohne = spielen(art, 'profi', { ohneSzene: true });
  pruefe('B ' + art + ': ohne Szene (Server/kopflos) → keine KI-Tricks', !ohne.kiHatZustand);
  const r = spielen(art, 'unschlagbar');
  const gest = r.gestartet[1] + r.gestartet[2], fert = r.fertig[1] + r.fertig[2];
  pruefe('B ' + art + ': KI macht Tricks (unschlagbar, 60 Flüge × 2 KI)', gest >= 20, gest + ' gestartet, ' + JSON.stringify(r.arten));
  pruefe('B ' + art + ': jeder gestartete KI-Trick wird fertig und nie abgekürzt = kein Fehltrick', gest === fert && r.abgekuerzt === 0 && r.fehl === 0, 'gestartet ' + gest + ' fertig ' + fert + ' abgekürzt ' + r.abgekuerzt + ' fehl ' + r.fehl);
  const l = spielen(art, 'leicht');
  pruefe('B ' + art + ': leicht seltener als unschlagbar', l.gestartet[1] + l.gestartet[2] < gest, (l.gestartet[1] + l.gestartet[2]) + ' < ' + gest);
  const r2 = spielen(art, 'unschlagbar');
  pruefe('B ' + art + ': zweimal gespielt = identisch (deterministisch)', JSON.stringify([r.gestartet, r.fertig, r.arten]) === JSON.stringify([r2.gestartet, r2.fertig, r2.arten]));
  const sp = spielen(art, 'unschlagbar', { sonder: (fz) => { fz[1].ausgeschieden = true; fz[2].looping.aktiv = true; } });
  pruefe('B ' + art + ': ausgeschieden / im Looping → kein Trick', sp.gestartet[1] === 0 && sp.gestartet[2] === 0);
  const ka = spielen(art, 'unschlagbar', { sonder: (fz) => { fz[1].flug.kanone = { t: 0 }; fz[2].polizei = true; } });
  pruefe('B ' + art + ': Kanone / Polizei → kein Trick', ka.gestartet[1] === 0 && ka.gestartet[2] === 0);
  if (art === 'moto') {
    pruefe('B moto: Superman/Backflip/Handstand kommen vor', ['superman', 'backflip', 'handstand'].every((a) => r.arten[a] > 0), JSON.stringify(r.arten));
    const alle = r.sz.alle.filter((e) => e.fahrzeug > 0);
    pruefe('B moto: KI-Tricks als Stunt-Punkte gutgeschrieben', alle.length === fert && alle.every((e) => e.punkte > 0), alle.length + ' Ereignisse');
  } else pruefe('B auto: Fassrolle und Schraube kommen vor', r.arten.fassrolle > 0 && r.arten.schraube > 0, JSON.stringify(r.arten));
  pruefe('B ' + art + ': Spieler ohne Eingabe bleibt unberührt (keine Tricks)', r.gestartet[0] === 0);
}
// Haken für stuntStart.js (kiAlt): aus = alter Plan bitgleich; an = neuer Trick ersetzt den alten, sonst seltener
{
  const R2 = ladeMit(['src/config.js', 'src/moto/stunts.js', 'src/spass/spassSticker.js', 'src/spass/spassTricks.js'], true), St = R2.Moto.stunts, S = R2.SpassTricks;
  const sp = { szene: {}, strecke: { id: 'wiese', variante: '1' } };
  const f = { istSpieler: false, driver: { schwierigkeit: 'mittel' }, flug: {}, looping: {} };
  let gleich = true, neuP = 0, altN = 0, altRef = 0, n = 3000;
  S.anSetzen('ki', false);
  for (let i = 0; i < 300; i++) if (JSON.stringify(S.kiAlt(sp, i % 4, f, 'moto|wiese|1', 1 + i, St)) !== JSON.stringify(St.kiPlan('moto|wiese|1', i % 4, 1 + i))) gleich = false;
  pruefe('B Haken kiAlt: Schalter aus = alter Plan bitgleich', gleich);
  S.anSetzen('ki', true);
  for (let i = 0; i < n; i++) { f._r3 = null; const nr = i % 4, fl = 1 + i, p = S.kiAlt(sp, nr, f, 'moto|wiese|1', fl, St); if (f._r3.plan) { neuP++; if (p !== null) gleich = false; } else if (p) altN++; }
  pruefe('B Haken kiAlt: neuer Plan ersetzt den alten (null); sonst alter Plan nur noch 0,6·(1−Chance)', gleich && Math.abs(neuP / n - 0.25) < 0.03 && Math.abs(altN / (n - neuP) - 0.6 * 0.75) < 0.04, 'neu ' + (neuP / n).toFixed(3) + ' alt ' + (altN / (n - neuP)).toFixed(3));
  void altRef;
}

// ================================================================ ONLINE (R3 C–G): Server in-process, Basisvergleich, Vorhersage, Client-Stub, echter Server mit WebSocket
const http = require('http'), os = require('os'), cp = require('child_process');
const WebSocket = require(path.join(__dirname, '..', 'server', 'node_modules', 'ws'));
const { Simulation, laden, ladenMoto, kontextLaden, einstellungenPruefen } = require('../server/simulation');
const json = (x) => JSON.stringify(x);
const SR = laden();
const warte = (ms) => new Promise((r) => setTimeout(r, ms));
const teil = process.argv[2] || '';
const mit = (k) => !teil || teil === k;

function autopilot(C, st, v, idx) {
  const n = st.abfrage(v.x, v.z, idx), sp = st.spline;
  const vl = Math.max(3, v.vLaengs), L = Math.max(9, Math.min(50, 0.55 * vl + 8));
  const ziel = sp.punktBei(n.s + L);
  let diff = C.headingAus(ziel.x - v.x, ziel.z - v.z) - v.heading;
  while (diff > Math.PI) diff -= 2 * Math.PI;
  while (diff < -Math.PI) diff += 2 * Math.PI;
  const lenkung = Math.max(-1, Math.min(1, -(2 * vl * Math.sin(diff) / Math.hypot(ziel.x - v.x, ziel.z - v.z)) / v.drehrateMax(vl)));
  const soll = st.tempoBei(n.s + vl * 0.3) * 0.85;
  return { s: { gas: v.vLaengs < soll ? 1 : 0, bremse: v.vLaengs > soll + 3 ? 0.5 : 0, lenkung }, idx: n.index };
}
const neueSim = (Sim, einst, n, moto, seed) => new Sim({ moto: !!moto, einstellungen: einst, spieler: Array.from({ length: n || 1 }, (_, i) => ({ fahrer: 'S' + i, auto: moto ? 'superbike' : 'porsche-911', hilfe: 'aus' })), seed: seed || 5 });
/** Fährt mit Autopilot für alle Menschen; plan(f, i, n) darf { s (Steuerung überschreiben), k (Trick-Taste) } liefern; beiSchritt(n) nach jedem Schritt. */
function fahre(sim, ticks, plan, beiSchritt) {
  const idx = {}, C = sim.R, ereig = [];
  for (let n = 0; n < ticks && !sim.fertig; n++) {
    for (let i = 0; i < sim.teilnehmerInfo.length; i++) {
      const f = sim.sim.fahrzeuge[i];
      if (!f.istSpieler) continue;
      const a = autopilot(C, sim.sim.strecke, f.vehicle, idx[i] === undefined ? -1 : idx[i]); idx[i] = a.idx;
      const p = plan ? plan(f, i, n) : null;
      sim.eingabeSetzen(i, p && p.s ? Object.assign({}, a.s, p.s) : a.s);
      sim.trickSetzen(i, !!(p && p.k));
    }
    sim.schritt();
    for (const e of sim.abholen()) ereig.push(Object.assign({ n }, e));
    if (beiSchritt && beiSchritt(n, ereig) === 'stop') break;
  }
  return ereig;
}
const AUTO = { streckeId: 'wiese', spass: true, tricks: true, gegner: 0 };
/** Ein Flug mit Trick: Taste (3 Ticks) bei flug.t 0,35, Richtung (Steuerung) bei 0,3–0,5. dirS = Teil der Steuerung, z. B. { lenkung: 1 }; ohneDir = nur Taste. */
function trickLauf(einst, dirS, opt) {
  opt = opt || {};
  const sim = neueSim(Simulation, einst, 1);
  const atLog = [];
  const ev = fahre(sim, 4000, (f) => {
    const t = f.flug.aktiv ? f.flug.t : -1;
    if (opt.keinTrick) return null;
    return { s: t >= 0.3 && t < 0.5 && dirS ? dirS : null, k: t >= 0.35 && t < 0.4 };
  }, (n) => {
    const z = sim.zustand(), a = z.at && z.at[0];
    if (a && a[0]) atLog.push(a.slice());
    if (opt.beiSchritt) opt.beiSchritt(sim, n, atLog);
    const f = sim.sim.fahrzeuge[0];
    if (f.flug.fluege >= 1 && !f.flug.aktiv) return 'stop';
  });
  return { sim, ev, atLog, tricks: ev.filter((e) => e.art === 'trick') };
}

(async () => {
  // ---------------------------------------------------------------- C) Auto-Raum: Server rechnet Fassrolle / Schraube
  if (mit('C')) {
    const a = trickLauf(AUTO, { lenkung: 1 });
    const e = a.tricks;
    pruefe('C Auto-Raum: Taste + → in der Luft = Fassrolle (at-Code 4, Richtung +1, Fortschritt wächst monoton auf ≥ 0,95)', a.atLog.length > 20 && a.atLog.every((x) => x[0] === 4 && x[2] === 1) && a.atLog.every((x, i) => i === 0 || x[1] >= a.atLog[i - 1][1]) && a.atLog[a.atLog.length - 1][1] >= 0.95, a.atLog.length + ' Zustände, letzter ' + json(a.atLog[a.atLog.length - 1]));
    pruefe('C Ereignis trick { nr, st, name, p, m, g }: Fassrolle +300, ×1, gesamt 300 – genau einmal', e.length === 1 && e[0].nr === 0 && e[0].st === 'fassrolle' && e[0].name === 'Fassrolle!' && e[0].p === 300 && e[0].m === 1 && e[0].g === 300, json(e));
    const l = trickLauf(AUTO, { lenkung: -1 });
    pruefe('C Taste + ← = Fassrolle in die andere Richtung (at-Richtung −1)', l.atLog.length > 20 && l.atLog.every((x) => x[0] === 4 && x[2] === -1), json(l.atLog[0]));
    // Schraube: erst ↑ loslassen (Gas 0), dann ↑ drücken = steigende Flanke
    const hoch = trickLauf(AUTO, { gas: 1, bremse: 0 }, { }), sraube = (() => {
      const sim = neueSim(Simulation, AUTO, 1), log = [];
      const ev = fahre(sim, 4000, (f) => { const t = f.flug.aktiv ? f.flug.t : -1; return { s: t >= 0 && t < 0.3 ? { gas: 0, bremse: 0 } : (t >= 0.3 && t < 0.5 ? { gas: 1, bremse: 0 } : null), k: t >= 0.35 && t < 0.4 }; },
        (n) => { const a = sim.zustand().at[0]; if (a[0]) log.push(a.slice()); const f = sim.sim.fahrzeuge[0]; if (f.flug.fluege >= 1 && !f.flug.aktiv) return 'stop'; });
      return { ev: ev.filter((x) => x.art === 'trick'), log };
    })();
    void hoch;
    pruefe('C Taste + ↑ = Schraube (at-Code 5, +250 Punkte)', sraube.log.length > 20 && sraube.log.every((x) => x[0] === 5 && x[2] === 1) && sraube.ev.length === 1 && sraube.ev[0].st === 'schraube' && sraube.ev[0].p === 250, json(sraube.ev));
    const alleine = trickLauf(AUTO, null);
    pruefe('C Taste allein (ohne Richtung) = Fassrolle nach der Wartezeit (Richtung +1)', alleine.atLog.length > 20 && alleine.atLog[0][0] === 4 && alleine.tricks.length === 1 && alleine.tricks[0].st === 'fassrolle', json(alleine.tricks));
    const keiner = trickLauf(AUTO, null, { keinTrick: true });
    pruefe('C ohne Taste: kein Trick, kein at-Code, kein Ereignis', keiner.atLog.length === 0 && keiner.tricks.length === 0);
    const a2 = trickLauf(AUTO, { lenkung: 1 });
    pruefe('C zweimal gespielt = bitgleich (at-Strom, Ereignisse, Endpose)', json([a.atLog, a.tricks, a.sim.zustand().a]) === json([a2.atLog, a2.tricks, a2.sim.zustand().a]));
    // Fehltrick: nach dem fertigen Trick eine schiefe Landung → Wackeln, Tempo × 0,88, Ereignis fehl
    let vorher = null, nachher = null, fehl = null;
    const f1 = trickLauf(AUTO, { lenkung: 1 }, { beiSchritt: (sim, n, log) => {
      const f = sim.sim.fahrzeuge[0], z3 = sim.sim._t3 && sim.sim._t3.fz[0];
      if (!vorher && z3 && z3.tricksImFlug > 0 && f.flug.aktiv) { vorher = f.vehicle.vLaengs; sim.sim._flugEreignis(0, 'landungSchraeg'); nachher = f.vehicle.vLaengs; fehl = sim.ereignisse.filter((x) => x.art === 'trick' && x.st === 'fehl'); }
    } });
    pruefe('C unfertige/schiefe Landung nach einem Trick: Tempo × 0,88 (R.config.spass.tricks.wackeln.tempo) und Ereignis st "fehl"', vorher !== null && Math.abs(nachher / vorher - 0.88) < 1e-9 && fehl && fehl.length === 1 && fehl[0].nr === 0, vorher + ' → ' + nachher);
    void f1;
    // Menschen ohne Luft: Taste am Boden = nichts
    const boden = neueSim(Simulation, AUTO, 1); let at = 0;
    fahre(boden, 600, () => ({ k: true }), () => { const a = boden.zustand().at[0]; if (a[0]) at++; if (boden.sim.fahrzeuge[0].flug.aktiv) return 'stop'; });
    pruefe('C Taste am Boden (keine Luft) löst nichts aus', at === 0);
    // Computer-Tricks im Server (Auto): unschlagbar, Trampolin 1,8 s
    const ki = neueSim(Simulation, Object.assign({}, AUTO, { gegner: 3, schwierigkeit: 'unschlagbar' }), 1);
    const kiLog = [[], [], [], []], kiEv = []; let kiFehl = 0;
    const evs = fahre(ki, 60 * 80, null, (n) => { const z = ki.zustand().at; for (let i = 1; i < 4; i++) if (z[i][0]) kiLog[i].push(z[i].slice()); });
    for (const x of evs) if (x.art === 'trick') { kiEv.push(x); if (x.st === 'fehl') kiFehl++; }
    const kiTricks = kiLog.slice(1).filter((l) => l.length > 5).length;
    const fertigKi = kiLog.slice(1).every((l) => l.length === 0 || l[l.length - 1][1] >= 0.9);
    pruefe('C Auto-Raum: Computer machen Tricks (at-Strom der Computer-Fahrzeuge), jeder wird fertig (kein Fehltrick, kein "fehl"-Ereignis)', kiTricks >= 1 && fertigKi && kiFehl === 0, kiLog.map((l) => l.length).join('/') + ' at-Zustände, fehl ' + kiFehl);
    pruefe('C Computer-Tricks erzeugen keine Ereignisse (nur der Mensch bekommt Meldungen)', kiEv.every((x) => x.nr === 0));
    const ki2 = neueSim(Simulation, Object.assign({}, AUTO, { gegner: 3, schwierigkeit: 'unschlagbar' }), 1); const kiLog2 = [[], [], [], []];
    fahre(ki2, 60 * 80, null, (n) => { const z = ki2.zustand().at; for (let i = 1; i < 4; i++) if (z[i][0]) kiLog2[i].push(z[i].slice()); });
    pruefe('C Computer-Tricks sind deterministisch (zweiter Lauf identisch)', json(kiLog) === json(kiLog2));
  }

  // ---------------------------------------------------------------- D) Raum ohne tricks = bitgleich zur Basis (Commit a69f2ec, vor R3 online)
  if (mit('D')) {
    const wurzel = path.join(__dirname, '..'), basisDir = fs.mkdtempSync(path.join(os.tmpdir(), 'r3basis-'));
    let Basis = null;
    try {
      cp.execSync('git archive a69f2ec | tar -x -C ' + JSON.stringify(basisDir), { cwd: wurzel, stdio: 'pipe' });
      if (!fs.existsSync(path.join(basisDir, 'server', 'node_modules'))) fs.symlinkSync(path.join(wurzel, 'server', 'node_modules'), path.join(basisDir, 'server', 'node_modules'));
      Basis = require(path.join(basisDir, 'server', 'simulation.js'));
    } catch (e) { console.log('INFO Basis (a69f2ec) nicht erreichbar: ' + (e && e.message).split('\n')[0]); }
    if (!Basis) pruefe('D Basis a69f2ec lesbar (git archive)', false);
    else {
      const hashen = (Sim, einst, moto, taste) => {
        const sim = neueSim(Sim, einst, 2, moto, 9), h = require('crypto').createHash('sha1');
        const ev = fahre(sim, 60 * 55, (f, i, n) => (taste ? { k: (n % 90) < 4, s: (n % 150) < 5 ? { lenkung: 1, gas: 0 } : null } : null), (n) => {
          if (n % 3 === 0) h.update(json(sim.zustand())); if (n % 20 === 0) h.update(json(sim.ich(0)) + json(sim.ich(1)));
        });
        h.update(json(ev)); h.update(json(sim.startInfo())); h.update(json(sim.ergebnis ? sim.ergebnis() : 0));
        return { hash: h.digest('hex'), zustand: sim.zustand(), einst: sim.einstellungen };
      };
      for (const [name, moto, einst] of [['Auto wiese+Spaß', false, { streckeId: 'wiese', spass: true, gegner: 3 }], ['Auto alpen', false, { streckeId: 'alpen', gegner: 2, runden: 2 }], ['Motorrad stuntpark', true, { streckeId: 'stuntpark', gegner: 3, schwierigkeit: 'unschlagbar' }]]) {
        const neu = hashen(Simulation, einst, moto, true), neuFalse = hashen(Simulation, Object.assign({}, einst, { tricks: false }), moto, true), alt = hashen(Basis.Simulation, einst, moto, true);
        pruefe('D ' + name + ': Raum ohne tricks bitgleich zur Basis a69f2ec (3300 Ticks, 2 Menschen mit Trick-/Richtungs-Tasten, Zustand/ich/Ereignisse/Start/Ergebnis)', neu.hash === alt.hash, neu.hash.slice(0, 10) + ' / ' + alt.hash.slice(0, 10));
        pruefe('D ' + name + ': tricks:false (ausdrücklich) = ohne Schalter, ohne Schlüssel tricks, ohne at', neuFalse.hash === neu.hash && !('tricks' in neu.einst) && !('tricks' in neuFalse.einst) && !neu.zustand.at);
      }
      const e1 = Basis.einstellungenPruefen({ streckeId: 'wald', runden: 3, gegner: 2, spass: true }, 2, false), e2 = einstellungenPruefen({ streckeId: 'wald', runden: 3, gegner: 2, spass: true }, 2, false);
      pruefe('D Raum-Einstellungen ohne tricks: Objekt bitgleich zur Basis', json(e1) === json(e2));
    }
    try { fs.rmSync(basisDir, { recursive: true, force: true }); } catch (e) { /* egal */ }
    const unsinn = [true, 'ja', 1, null, 'true', {}, [true], 0].map((t) => einstellungenPruefen({ streckeId: 'wiese', tricks: t }, 2, false));
    pruefe('D nur ein echtes true schaltet tricks ein (Unsinn → kein Schlüssel)', unsinn[0].tricks === true && unsinn.slice(1).every((x) => !('tricks' in x)) && einstellungenPruefen({ streckeId: 'wiese', tricks: true }, 2, true).tricks === true);
  }

  // ---------------------------------------------------------------- E) Motorrad-Raum: Computer-Tricks online
  if (mit('E')) {
    const RM = ladenMoto(), ki0 = RM.config.spass.tricks.ki.zusatz;
    const lauf = (einst) => {
      const sim = neueSim(Simulation, Object.assign({ streckeId: 'stuntpark', gegner: 4, schwierigkeit: 'unschlagbar' }, einst), 1, true);
      const arten = {}, mo = [];
      const ev = fahre(sim, 60 * 100, (f) => {          // der Mensch macht in jedem Flug einen Backflip (Taste + ↓)
        const t = f.flug.aktiv ? f.flug.t : -1; return { s: t >= 0.3 && t < 0.5 ? { bremse: 1, gas: 0 } : null, k: t >= 0.35 && t < 0.4 };
      }, (n) => { const z = sim.zustand().mo; for (let i = 1; i < z.length; i++) if (z[i][13]) mo.push([i, z[i][13], z[i][14]]); });
      for (const x of ev) if (x.art === 'stunt') { const k = (x.nr === 0 ? 'M:' : 'K:') + x.st; arten[k] = (arten[k] || 0) + 1; }
      return { arten, mo, sim };
    };
    try {
      RM.config.spass.tricks.ki.zusatz = -0.3;      // nur für den Test: Stunt-Park-Flüge sind kurz (~1,4 s); mit der Regel „+0,3 s Reserve“ würde die KI hier nichts wagen
      const an = lauf({ tricks: true }), aus = lauf({});
      const neuK = (r) => Object.keys(r.arten).filter((k) => k.startsWith('K:') && /superman|backflip|handstand/.test(k)).reduce((s, k) => s + r.arten[k], 0);
      pruefe('E Motorrad-Raum mit tricks: Computer machen Superman/Backflip/Handstand (Stunt-Ereignisse + zustand.mo[13..14])', neuK(an) >= 1 && an.mo.length > 5, json(an.arten) + ' mo ' + an.mo.length);
      pruefe('E Motorrad-Raum ohne tricks: Computer wie bisher (nur Drehung/Salto, keine neuen Tricks, mo[13] bleibt 0)', neuK(aus) === 0 && aus.mo.length === 0, json(aus.arten));
      pruefe('E der Mensch macht seine Tricks in beiden Räumen gleich (Backflip bleibt, Ereignisse M:backflip gleich)', (an.arten['M:backflip'] || 0) >= 1 && an.arten['M:backflip'] === aus.arten['M:backflip'], (an.arten['M:backflip']) + ' / ' + (aus.arten['M:backflip']));
      const an2 = lauf({ tricks: true });
      pruefe('E Motorrad-Computer-Tricks deterministisch (zweiter Lauf identisch)', json(an.arten) === json(an2.arten) && json(an.mo) === json(an2.mo));
    } finally { RM.config.spass.tricks.ki.zusatz = ki0; }
    // Standardregel: KI wagt nur mit genug Restflug, nie ein Fehltrick (kein abgekürzter Trick, alle fertig)
    const sim = neueSim(Simulation, { streckeId: 'stuntpark', gegner: 4, schwierigkeit: 'unschlagbar', tricks: true }, 1, true);
    const ev = fahre(sim, 60 * 100);
    const kiS = ev.filter((x) => x.art === 'stunt' && x.nr > 0 && /superman|backflip|handstand/.test(x.st));
    const st = sim.sim.stunt.fz; const abg = st.some((z, i) => i > 0 && z && z.stat && z.stat.abgekuerzt > 0);
    pruefe('E Standardregel (Restflug ≥ Dauer + 0,45 s): kein abgekürzter Computer-Trick', !abg, kiS.length + ' Computer-Tricks im Lauf');
  }

  // ---------------------------------------------------------------- F) Vorhersage-Messung: Fehltrick-Sprung (Tempo × 0,88 bei der Landung, die Vorhersage kennt es nicht)
  if (mit('F')) {
    const C = kontextLaden(['vendor/three.min.js', 'src/config.js', 'src/physics/vehicle.js', 'src/physics/collisions.js', 'src/cars/carCatalog.js',
      'src/track/spline.js', 'src/track/trackCatalog.js', 'src/track/trackBuilder.js', 'src/track/looping.js', 'src/track/schanze.js', 'src/track/anlauf.js',
      'src/world/themes.js', 'src/world/schilder.js', 'src/world/wetter.js', 'src/world/kleber.js', 'src/world/polizei.js', 'src/net/protokoll.js', 'src/net/vorhersage.js']);
    function messe(mitFehl, lat) {
      const sim = new Simulation({ einstellungen: { streckeId: 'wiese', welt: 'stunt', runden: 5, gegner: 0, tageszeit: 'tag', jahreszeit: 'sommer', wetter: 'klar', windStaerke: 0, tricks: true },
        spieler: [{ fahrer: 'Jonas', auto: 'porsche-911', hilfe: 'aus' }], seed: 77 });
      const e = sim.startInfo().einstellungen;
      const daten = C.trackCatalog.find((t) => t.id === e.streckeId);
      const st = new C.Strecke(daten, { welt: C.Strecke.weltName(daten, e.welt), variante: e.variante, hindernisMenge: e.hindernisMenge });
      const w = new C.Wetter(null, { jahreszeit: e.jahreszeit, wetter: e.wetter, wind: { staerke: e.windStaerke, richtung: e.windRichtung }, thema: daten.thema, seed: 1, strecke: st, tageszeit: e.tageszeit });
      C.Kurvenschilder.einbauen(st, e.tempoKlasse);
      const auto = C.carCatalog.waehlbare().find((a) => a.id === 'porsche-911');
      const V = new C.NetzVorhersage({ strecke: st, auto, tempoKlasse: e.tempoKlasse, fahrhilfe: 'aus', umwelt: () => w.umwelt() });
      const F = sim.sim.fahrzeuge[0], sv0 = F.vehicle, sst = sim.sim.strecke, sp = sst.spline;
      for (let k = 0; k < 60 * 12 && !sim.sim.rennen.gasErlaubt; k++) sim.schritt();
      for (let k = 0; k < 60 * 4; k++) sim.schritt();
      { const p = sp.punktBei(2560); sv0.setzen(p.x, p.z, C.headingAus(p.tx, p.tz)); sv0.vLaengs = 28; sv0.y = sst.hoeheAn(sv0.x, sv0.z); F.index = -1; sim.sim.rennen.verfolgungSetzen(0, sv0.x, sv0.z, 2560); }
      const ich0 = JSON.parse(JSON.stringify(sim.ich(0))); ich0.ack = 0; V.abgleich(ich0, null); V._ersterAbgleich = false;
      const ankunft = [], truth = [], disp = [];
      let idx = -1, pd = { x: V.vp.x, z: V.vp.z, y: V.vp.y, heading: V.vp.heading }, gefehlt = false, tFehl = -1, hart = 0;
      for (let n = 1; n <= 60 * 14; n++) {
        const a = autopilot(sim.R, sst, sv0, idx); idx = a.idx;
        const t = F.flug.aktiv ? F.flug.t : -1;
        let s = a.s;
        if (F.flug.aktiv) s = Object.assign({}, a.s, { gas: 1, bremse: 0, lenkung: t < 1.2 ? 0.7 : -0.5 });
        if (t >= 0.3 && t < 0.5) s = Object.assign({}, s, { lenkung: 1 });
        s = C.Netz.eingabeDekodieren(C.Netz.eingabeKodieren(s));
        sim.eingabeSetzen(0, s); sim.trickSetzen(0, t >= 0.35 && t < 0.4);
        sim.schritt();
        if (mitFehl && !gefehlt) { const z3 = sim.sim._t3 && sim.sim._t3.fz[0]; if (z3 && z3.tricksImFlug > 0 && F.flug.aktiv) { sim.sim._flugEreignis(0, 'landungSchraeg'); gefehlt = true; tFehl = n; } }
        truth.push([sv0.x, sv0.y, sv0.z]);
        if (n % 3 === 0) { const ich = JSON.parse(JSON.stringify(sim.ich(0))); ich.ack = n; ankunft.push({ an: n + lat, ich, k: sim.tick }); }
        while (ankunft.length && ankunft[0].an <= n) {
          const m = ankunft.shift();
          V.abgleich(m.ich, { x: pd.x, z: pd.z, y: pd.y, heading: pd.heading }, undefined, m.k);
          if (V.hart) { hart++; V.hart = false; }
        }
        V.schritt(n, s, { countdown: false, imZiel: false });
        V.abklingen(1 / 60);
        const d = { x: V.vp.x + V.korr.x, z: V.vp.z + V.korr.z, y: V.vp.y + V.korr.y, heading: V.vp.heading + V.korr.h };
        pd = d; disp.push([d.x, d.y, d.z]);
      }
      // Anzeige-Sprung = Abweichung der Frame-zu-Frame-Bewegung von der echten Bewegung (wie Block M in test_netz.js); Fehler = Abstand Anzeige – Server
      let jmax = 0, fmax = 0;
      const von = tFehl > 0 ? tFehl - 5 : 60 * 4, bis = tFehl > 0 ? tFehl + 90 : 60 * 14 - 1;
      for (let i = Math.max(1, von); i < Math.min(truth.length, bis); i++) {
        const j = Math.hypot(...disp[i].map((v, k) => (v - disp[i - 1][k]) - (truth[i][k] - truth[i - 1][k])));
        const f = Math.hypot(...disp[i].map((v, k) => v - truth[i][k]));
        jmax = Math.max(jmax, j); fmax = Math.max(fmax, f);
      }
      return { jmax, fmax, hart, tFehl };
    }
    const lat = 6;
    const ohne = messe(false, lat), mitF = messe(true, lat), mitF2 = messe(true, 12);
    console.log('MESSUNG Fehltrick-Sprung (Anzeige gegen Server, Fenster −5…+90 Ticks um die Wackel-Landung; Latenz 6 Ticks = 100 ms, 20 Hz):');
    console.log('   ohne Fehltrick (Vergleichslauf): größter Anzeige-Sprung ' + ohne.jmax.toFixed(3) + ' m, größter Fehler ' + ohne.fmax.toFixed(3) + ' m, harte Sprünge ' + ohne.hart);
    console.log('   mit Fehltrick, 100 ms:           größter Anzeige-Sprung ' + mitF.jmax.toFixed(3) + ' m, größter Fehler ' + mitF.fmax.toFixed(3) + ' m, harte Sprünge ' + mitF.hart + ' (Landung bei Tick ' + mitF.tFehl + ')');
    console.log('   mit Fehltrick, 200 ms:           größter Anzeige-Sprung ' + mitF2.jmax.toFixed(3) + ' m, größter Fehler ' + mitF2.fmax.toFixed(3) + ' m, harte Sprünge ' + mitF2.hart);
    pruefe('F Fehltrick-Landung wurde ausgelöst (Messung gültig)', mitF.tFehl > 0 && mitF2.tFehl > 0);
    pruefe('F Phase 1 (Vorhersage ohne Tricks, Server korrigiert): kein harter Sprung (> 3 m) bei 100 und 200 ms', mitF.hart === 0 && mitF2.hart === 0);
    pruefe('F Fehltrick-Korrektur sichtbar? Anzeige-Sprung ≤ 0,5 m bei 100 ms (Schwelle "hart" aus Block M), sonst Phase 2 nötig', mitF.jmax <= 0.5, mitF.jmax.toFixed(3) + ' m (Vergleichslauf ' + ohne.jmax.toFixed(3) + ' m)');
  }

  // ---------------------------------------------------------------- G) Client-Stub (spassOnlineR3.js ohne Browser): Lobby, Taste, Zustand, Ereignis, Pose
  if (mit('G')) {
    const sb = { console, Math, performance: { now: () => Date.now() } };
    sb.window = sb; sb.addEventListener = () => {}; sb.globalThis = sb;
    vm.createContext(sb);
    vm.runInContext(`
      window.Rennspiel = { Spiel: class { physikSchritt() {} }, config: {}, dach: { frame(spiel, dt) { window.__frames = (window.__frames || 0) + 1; } },
        NetzVerbindung: class { constructor() { this.gesendet = []; this.bei_ = {}; } bei(t, fn) { (this.bei_[t] = this.bei_[t] || []).push(fn); } senden(m) { this.gesendet.push(m); } },
        Online: { Bildschirm: class {
          zeilen() { return ['strecke', 'runden']; } werte(z) { return { wert: 'x', liste: [] }; } wertSetzen() { window.__alt = true; }
          htmlLobby() { return '<div class="on-zusammen">Z</div><div class="on-fest">F</div>'; } lobbyEmpfangen() {}
          rennenAufbauen(m) { this.spiel = window.__spiel; } rennenAbbauen() {} zustandEmpfangen(z) { this.zst = z; } ereignisEmpfangen(m) {} } } };`, sb);
    for (const d of ['src/config.js', 'src/spass/spassSticker.js', 'src/spass/spassTricks.js', 'src/spass/spassOnlineR3.js']) vm.runInContext(fs.readFileSync(path.join(__dirname, '..', d), 'utf8'), sb, { filename: d });
    const RR = sb.Rennspiel, B = RR.Online.Bildschirm.prototype, ST = RR.SpassTricks;
    // hallo.r3
    const v = new RR.NetzVerbindung(); v.bei('hallo', () => {}); v.bei_.hallo.forEach((f) => f({ t: 'hallo', r3: true }));
    const ui = Object.create(B); ui.istHost = true; ui.lobby = { einstellungen: {} }; ui.fokus = 0; ui.verb = v;
    pruefe('G Client: Host sieht Zeile r3tricks nur nach hallo.r3', ui.zeilen().includes('r3tricks'));
    const v2 = new RR.NetzVerbindung(); v2.bei('hallo', () => {}); v2.bei_.hallo.forEach((f) => f({ t: 'hallo' }));
    pruefe('G Client: alter Server (hallo ohne r3) → keine Zeile', !ui.zeilen().includes('r3tricks'));
    v.bei_.hallo.forEach((f) => f({ t: 'hallo', r3: true }));
    pruefe('G Client: Werte der Zeile (Standard aus, Pillen Aus / An)', json(ui.werte('r3tricks')) === json({ wert: 'aus', liste: [{ k: 'aus', text: 'Aus' }, { k: 'an', text: '🤸 An' }] }));
    ui.wertSetzen('r3tricks', 'an');
    pruefe('G Client: Wahl "An" sendet einstellungen { tricks: true }', json(v.gesendet.filter((m) => m.t === 'einstellungen')) === json([{ t: 'einstellungen', einstellungen: { tricks: true } }]));
    ui.wertSetzen('strecke', 'wald');
    pruefe('G Client: andere Zeilen laufen unverändert weiter (Basis-wertSetzen)', sb.__alt === true);
    ui.lobby.einstellungen.tricks = true;
    const h = ui.htmlLobby();
    pruefe('G Client: Lobby-HTML hat die Zeile 🤸 Tricks mit aktiver Pille "An" und Hinweistext', h.includes('🤸 Tricks') && /aktiv" data-a="wert:r3tricks:an"/.test(h) && h.includes('on-r3'));
    // Rennen: Aufbau nur Auto + Schalter
    const spiel = { rennen: {}, input: { spielTasten: new Set(), istGedrueckt: () => false }, fahrzeuge: [{ vehicle: { x: 0, y: 0, z: 0 } }, { vehicle: { x: 0, y: 0, z: 0 } }], huds: [{ meldung: (t, ms) => { spiel.meldungen.push(t); } }], meldungen: [], kameras: [], spassKonfetti: { burst: () => { spiel.konfetti++; } }, konfetti: 0 };
    sb.__spiel = spiel;
    const ui2 = Object.create(B); ui2.verb = v; ui2.phase = 'rennen'; ui2.spiel = spiel; ui2.du = 0;
    ui2.rennenAufbauen({ einstellungen: {}, teilnehmer: [{}, {}], du: 0 });
    pruefe('G Client: ohne Raum-Schalter kein Aufbau (spiel._t3 bleibt leer, Eingabe unverändert)', !ui2._r3 && !spiel._t3);
    ui2.rennenAufbauen({ einstellungen: { tricks: true }, teilnehmer: [{}, {}], du: 0 });
    pruefe('G Client: mit tricks Aufbau (spiel._t3.fz je Teilnehmer, Trick-Tasten in spielTasten)', !!ui2._r3 && spiel._t3.fz.length === 2 && spiel.input.spielTasten.has('ShiftRight') && spiel.input.spielTasten.has('ShiftLeft'));
    // Eingabe-Bit k: Tipp (Zähler) und Halten
    const msg1 = { t: 'eingabe', n: 1 }; v.senden(msg1);
    pruefe('G Client: ohne Taste kein Bit k', msg1.k === undefined);
    ST._intern.ZAEHL.ShiftRight = (ST._intern.ZAEHL.ShiftRight || 0) + 1;
    const msg2 = { t: 'eingabe', n: 2 }; v.senden(msg2);
    const msg3 = { t: 'eingabe', n: 3 }; v.senden(msg3);
    pruefe('G Client: Taste angetippt → genau eine Nachricht mit k = 1 (Tipp geht nicht verloren, wird nicht wiederholt)', msg2.k === 1 && msg3.k === undefined);
    spiel.input.istGedrueckt = (c) => c === 'ShiftLeft';
    const msg4 = { t: 'eingabe', n: 4 }; v.senden(msg4);
    pruefe('G Client: Taste gehalten (auch linke Umschalt) → k = 1', msg4.k === 1);
    spiel.input.istGedrueckt = () => false;
    // Zustand → Pose
    ui2.zustandEmpfangen({ at: [[0, 0, 1], [4, 0.5, -1]] });
    RR.dach.frame(spiel, 1 / 60);
    const p1 = spiel._t3.fz[1].pose, p0 = spiel._t3.fz[0].pose;
    pruefe('G Client: zustand.at → Pose des Computer-Fahrzeugs (Fassrolle, Richtung −1, Rolle negativ) und frame läuft weiter', p1.art === 'fassrolle' && p1.rolle < 0 && p0.art === null && p0.rolle === 0 && sb.__frames === 1, json({ art: p1.art, rolle: +p1.rolle.toFixed(3) }));
    ui2.zustandEmpfangen({ at: [[5, 0.2, 1], [0, 0, 1]] });
    RR.dach.frame(spiel, 1 / 60);
    pruefe('G Client: Schraube (Code 5) = schraube-Winkel, Ende (Code 0) setzt die Pose zurück', spiel._t3.fz[0].pose.art === 'schraube' && spiel._t3.fz[0].pose.schraube > 0 && spiel._t3.fz[1].pose.art === null && spiel._t3.fz[1].pose.rolle === 0);
    // weich: Fortschritt springt nie rückwärts
    let ruecksprung = false, last = -1;
    ui2.zustandEmpfangen({ at: [[4, 0.3, 1], [0, 0, 1]] });
    for (let i = 0; i < 20; i++) { RR.dach.frame(spiel, 1 / 60); const p = spiel._t3.fz[0].pose.p; if (p < last - 1e-9) ruecksprung = true; last = p; if (i === 10) ui2.zustandEmpfangen({ at: [[4, 0.45, 1], [0, 0, 1]] }); }
    pruefe('G Client: Pose wird weich nachgeführt (nie rückwärts, bleibt ≤ Serverwert + 0,12)', !ruecksprung && last <= 0.45 + 0.12 + 1e-9, last.toFixed(3));
    // Ereignisse
    ui2.ereignisEmpfangen({ art: 'trick', nr: 0, st: 'fassrolle', name: 'Fassrolle!', p: 300, m: 2, g: 600 });
    pruefe('G Client: eigenes Trick-Ereignis → Meldung mit Punkten, Faktor und Gesamt + Konfetti', spiel.meldungen.length === 1 && /Fassrolle! \+300 ×2/.test(spiel.meldungen[0]) && /600 Trickpunkte/.test(spiel.meldungen[0]) && spiel.konfetti === 1, spiel.meldungen[0]);
    ui2.ereignisEmpfangen({ art: 'trick', nr: 1, st: 'schraube', name: 'Schraube!', p: 250, m: 1, g: 250 });
    pruefe('G Client: Trick eines anderen Fahrers → keine eigene Meldung', spiel.meldungen.length === 1);
    ui2.ereignisEmpfangen({ art: 'trick', nr: 0, st: 'fehl', name: 'Wackel!', p: 0, m: 0, g: 600 });
    pruefe('G Client: Wackel-Landung → Meldung "Wackel!"', spiel.meldungen.length === 2 && /Wackel/.test(spiel.meldungen[1]));
    ui2.ereignisEmpfangen({ art: 'trick', nr: 1, st: 'fehl', name: 'Wackel!', p: 0, m: 0, g: 0 });
    ui2.zustandEmpfangen({ at: [[0, 0, 1], [0, 0, 1]] }); RR.dach.frame(spiel, 1 / 60);
    pruefe('G Client: Wackeln anderer Fahrzeuge schwingt in der Pose (rolle ≠ 0)', spiel._t3.fz[1].pose.rolle !== 0);
    ui2.rennenAbbauen();
    pruefe('G Client: Abbau räumt auf (kein Zustand, keine Eingabe-Bits mehr)', !ui2._r3 && !spiel._t3 && (() => { const m = { t: 'eingabe' }; v.senden(m); return m.k === undefined; })());
  }

  // ---------------------------------------------------------------- H) echter Server mit WebSocket: hallo.r3, Raum-Schalter, at im Zustand, alter Client, kaputte Werte
  if (mit('H')) {
    const { starten } = require('../server/server');
    const srv = await starten({ port: 0, host: '127.0.0.1', leise: true, tempo: 4, ladenMaxMs: 8000, motorrad: true });
    class Client {
      constructor(port) {
        this.ws = new WebSocket('ws://127.0.0.1:' + port + '/ws'); this.alle = []; this.warter = []; this.zustaende = []; this.ereignisse = [];
        this.offen = new Promise((f, n) => { this.ws.on('open', f); this.ws.on('error', n); });
        this.ws.on('message', (d) => {
          let m; try { m = JSON.parse(d); } catch (e) { return; }
          if (m.t === 'zustand') { if (this.zustaende.length < 400) this.zustaende.push(m); } else { this.alle.push(m); if (m.t === 'ereignis') this.ereignisse.push(m); }
          this.warter = this.warter.filter((w) => { if (w.t === m.t && w.f(m)) { clearTimeout(w.zeit); w.ok(m); return false; } return true; });
        });
      }
      senden(o) { if (this.ws.readyState === 1) this.ws.send(typeof o === 'string' ? o : JSON.stringify(o)); }
      auf(t, f, ms) { return new Promise((fertig) => { const w = { t, f: f || (() => true), ok: fertig, zeit: setTimeout(() => { this.warter = this.warter.filter((x) => x !== w); fertig(null); }, ms || 4000) }; this.warter.push(w); }); }
      zu() { this.ws.terminate(); }
    }
    async function rennen(art, einst) {
      const h = new Client(srv.port); await h.offen;
      h.senden({ t: 'hallo', v: SR.Netz.VERSION }); const hallo = await h.auf('hallo');
      h.senden({ t: 'raumErstellen', fahrer: 'Jonas', auto: art === 'moto' ? 'superbike' : 'porsche-911', einstellungen: Object.assign({ streckeId: art === 'moto' ? 'stuntpark' : 'wiese', gegner: 2 }, einst), moto: art === 'moto' });
      const lob = await h.auf('lobby');
      h.senden({ t: 'bereit', an: true }); h.senden({ t: 'start' });
      const st = await h.auf('start', null, 8000);
      h.senden({ t: 'geladen' });
      let n = 0;
      for (let i = 0; i < 90; i++) { h.senden({ t: 'eingabe', n: ++n, g: 1, b: 0, l: 0, k: i % 5 === 0 ? 1 : 'x' }); await warte(16); }
      await warte(300);
      const z = h.zustaende[h.zustaende.length - 1];
      return { h, hallo, lob, st, z };
    }
    const r1 = await rennen('auto', { tricks: true });
    pruefe('H hallo meldet r3: true (und r2: true)', !!r1.hallo && r1.hallo.r3 === true && r1.hallo.r2 === true);
    pruefe('H Auto-Raum mit tricks: Lobby und Start tragen tricks: true, zustand.at hat einen Eintrag je Teilnehmer ([0,0,1] am Boden)', r1.lob.einstellungen.tricks === true && r1.st.einstellungen.tricks === true && r1.z && Array.isArray(r1.z.at) && r1.z.at.length === r1.z.a.length && r1.z.at.every((x) => x.length === 3), json(r1.z && r1.z.at));
    r1.h.zu();
    const r2 = await rennen('auto', {});
    pruefe('H alter Client / Raum ohne tricks: kein Schlüssel tricks, kein zustand.at, Eingabe mit Bit k wird ignoriert', r2.lob.einstellungen.tricks === undefined && r2.st.einstellungen.tricks === undefined && r2.z && r2.z.at === undefined);
    r2.h.zu();
    const r3 = await rennen('auto', { tricks: 'ja' });
    pruefe('H kaputter Wert (tricks: "ja") → wie aus', r3.lob.einstellungen.tricks === undefined && r3.z && r3.z.at === undefined);
    r3.h.zu();
    const r4 = await rennen('moto', { tricks: true });
    pruefe('H Motorrad-Raum mit tricks: Schlüssel gesetzt, zustand.mo da, kein zustand.at', r4.st.einstellungen.tricks === true && r4.z && Array.isArray(r4.z.mo) && r4.z.at === undefined);
    r4.h.zu();
    // Host schaltet in der Lobby um
    const h = new Client(srv.port); await h.offen; h.senden({ t: 'hallo', v: SR.Netz.VERSION }); await h.auf('hallo');
    h.senden({ t: 'raumErstellen', fahrer: 'Jonas', auto: 'porsche-911', einstellungen: { streckeId: 'wiese' } }); await h.auf('lobby');
    h.senden({ t: 'einstellungen', einstellungen: { tricks: true } });
    const an = await h.auf('lobby', (m) => m.einstellungen.tricks === true);
    h.senden({ t: 'einstellungen', einstellungen: { tricks: false } });
    const aus = await h.auf('lobby', (m) => m.einstellungen.tricks === undefined);
    pruefe('H Host schaltet 🤸 Tricks in der Lobby an und wieder aus (aus = Schlüssel weg)', !!an && !!aus);
    h.zu();
    await srv.schliessen();
  }

  console.log('\n' + ok + ' OK, ' + fehler + ' FEHL');
  process.exit(fehler ? 1 : 0);
})().catch((e) => { console.error('FEHL Ausnahme:', e && e.stack); process.exit(2); });
