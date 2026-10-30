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
