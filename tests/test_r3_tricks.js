// R3 – KI-Tricks offline (Auto + Motorrad): node tests/test_r3_tricks.js
//  A) kiPlanNeu: Determinismus, Häufigkeit über 10 000 Flüge je Stufe, Monotonie, Verteilung Schraube / Superman-Backflip-Handstand, kein Math.random
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
console.log('\n' + ok + ' OK, ' + fehler + ' FEHL');
process.exit(fehler ? 1 : 0);
