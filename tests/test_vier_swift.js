// 4 gewinnt – Computer 1:1 wie in der Swift-App (VierGewinnt.swift v2.1): node tests/test_vier_swift.js
// Referenz = wörtliche Übersetzung des Swift-Codes (Board als Array von Reihen, "struct"-Kopie je Zug, Int.min/Int.max),
// verglichen mit der schnellen Fassung in spiele/gemeinsam/vier-ki.js: gleiche Züge in vielen Stellungen und Tiefen.
'use strict';
const KI = require('../spiele/gemeinsam/vier-ki.js');
const V = require('../spiele/gemeinsam/vier-regeln.js');
let ok = 0, fehl = 0;
const pruefe = (n, g, i) => { console.log((g ? 'OK   ' : 'FEHL ') + n + (i !== undefined ? '  (' + i + ')' : '')); g ? ok++ : fehl++; };

// ================= Referenz: Swift 1:1 =================
const ROWS = 6, COLS = 7, NONE = 0;
const opposite = (c) => c === 1 ? 2 : 1;                     // Chip.opposite
const INT_MIN = -9223372036854775808n, INT_MAX = 9223372036854775807n;     // BigInt = echte Int64
const kopie = (b) => b.map(r => r.slice());                  // struct-Kopie
function drop(b, col, chip) { for (let row = ROWS - 1; row >= 0; row--) { if (b[row][col] === NONE) { b[row][col] = chip; return row; } } return null; }
const isColumnFull = (b, col) => b[0][col] !== NONE;
const isFull = (b) => { for (let c = 0; c < COLS; c++) if (!isColumnFull(b, c)) return false; return true; };
function checkWin(b, row, col) {
  const chip = b[row][col]; if (chip === NONE) return false;
  for (const [dr, dc] of [[0, 1], [1, 0], [1, 1], [1, -1]]) {
    let count = 1;
    for (const sign of [1, -1]) {
      let r = row + dr * sign, c = col + dc * sign;
      while (r >= 0 && r < ROWS && c >= 0 && c < COLS && b[r][c] === chip) { count += 1; r += dr * sign; c += dc * sign; }
    }
    if (count >= 4) return true;
  }
  return false;
}
function score(b, chip) {
  let s = 0;
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) for (const [dr, dc] of [[0, 1], [1, 0], [1, 1], [1, -1]]) {
    let my = 0, empty = 0;
    for (let i = 0; i < 4; i++) {
      const nr = r + dr * i, nc = c + dc * i;
      if (!(nr >= 0 && nr < ROWS && nc >= 0 && nc < COLS)) { my = -1; break; }
      const cell = b[nr][nc];
      if (cell === chip) my += 1; else if (cell === NONE) empty += 1; else { my = -1; break; }
    }
    if (my < 0) continue;
    if (my === 3 && empty === 1) s += 100; else if (my === 2 && empty === 2) s += 10; else if (my === 1 && empty === 3) s += 1;
  }
  return s;
}
function refMinimax(b, depth, alpha, beta, maximizing, chip) {
  if (isFull(b)) return 0n;
  if (depth === 0) return BigInt(score(b, chip) - score(b, opposite(chip)));
  let a = alpha, bb = beta;
  if (maximizing) {
    let val = INT_MIN + 1n;
    for (let col = 0; col < COLS; col++) {
      if (isColumnFull(b, col)) continue;
      const tmp = kopie(b); const row = drop(tmp, col, chip);
      if (row !== null) {
        if (checkWin(tmp, row, col)) return 1000000n;
        const w = refMinimax(tmp, depth - 1, a, bb, false, chip); val = val > w ? val : w;
        a = a > val ? a : val; if (a >= bb) break;
      }
    }
    return val;
  } else {
    let val = INT_MAX; const opp = opposite(chip);
    for (let col = 0; col < COLS; col++) {
      if (isColumnFull(b, col)) continue;
      const tmp = kopie(b); const row = drop(tmp, col, opp);
      if (row !== null) {
        if (checkWin(tmp, row, col)) return -1000000n;
        const w = refMinimax(tmp, depth - 1, a, bb, true, chip); val = val < w ? val : w;
        bb = bb < val ? bb : val; if (a >= bb) break;
      }
    }
    return val;
  }
}
function refBestMove(b, chip, depth) {
  let best = -1, bestScore = INT_MIN;
  for (let col = 0; col < COLS; col++) {
    if (isColumnFull(b, col)) continue;
    const tmp = kopie(b); const row = drop(tmp, col, chip);
    if (row !== null) {
      if (checkWin(tmp, row, col)) return col;
      const s = refMinimax(tmp, depth - 1, INT_MIN + 1n, INT_MAX, false, chip);
      if (s > bestScore) { bestScore = s; best = col; }
    }
  }
  if (best < 0) { for (let c = 0; c < COLS; c++) if (!isColumnFull(b, c)) return c; return 0; }
  return best;
}
const leer = () => Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
function ausFolge(folge, ersterChip) { const b = leer(); let chip = ersterChip || 1; for (const c of folge) { drop(b, c, chip); chip = opposite(chip); } return b; }

// ================= Bewertungsfunktion =================
{
  const mini = ausFolge([1, 2, 1, 2, 3, 4, 2, 3]);               // Vorschau-Brett aus MiniBoardView
  const g = KI.ausZustand((() => { const st = V.neu(); for (const c of [1, 2, 1, 2, 3, 4, 2, 3]) V.ziehen(st, c); return st; })());
  let gleich = true; for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (g[r * COLS + c] !== mini[r][c]) gleich = false;
  pruefe('Raster aus vier-regeln.js = Swift-Raster (Reihe 0 oben)', gleich);
  pruefe('score(Rot) auf dem Vorschau-Brett = Referenz', KI.score(g, 1) === score(mini, 1), KI.score(g, 1));
  pruefe('score(Gelb) auf dem Vorschau-Brett = Referenz', KI.score(g, 2) === score(mini, 2), KI.score(g, 2));
  pruefe('leeres Brett: score 0 (kein Fenster mit eigenem Stein)', KI.score(new Int8Array(42), 1) === 0 && score(leer(), 1) === 0);
}

// ================= Gleiche Züge wie die Swift-Logik =================
let seed = 987654321; const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
function zufallsStellung(n) {                                   // n zufällige Steine, ohne Sieger, nicht voll
  for (;;) {
    const b = leer(); let chip = 1, ok2 = true;
    for (let i = 0; i < n; i++) {
      const frei = []; for (let c = 0; c < COLS; c++) if (!isColumnFull(b, c)) frei.push(c);
      const c = frei[Math.floor(rnd() * frei.length)]; const r = drop(b, c, chip);
      if (checkWin(b, r, c)) { ok2 = false; break; }
      chip = opposite(chip);
    }
    if (ok2) return { b, chip };
  }
}
{
  let gleich = 0, gesamt = 0, erster = null;
  for (const tiefe of [2, 3, 4, 5]) for (let k = 0; k < 40; k++) {
    const n = Math.floor(rnd() * 30);
    const { b, chip } = zufallsStellung(n);
    const soll = refBestMove(b, chip, tiefe);
    const ist = KI.bestMove(b, chip, tiefe);
    gesamt++; if (soll === ist) gleich++; else if (!erster) erster = { tiefe, n, chip, soll, ist };
  }
  pruefe('Zufallsstellungen Tiefe 2–5: gleicher Zug wie die wörtliche Swift-Übersetzung', gleich === gesamt, gleich + '/' + gesamt + (erster ? ' erster Fehler ' + JSON.stringify(erster) : ''));
}
{
  // ganze Partien: Port gegen Referenz (Port=Rot, Referenz=Gelb) und umgekehrt → jeweils identische Zugfolge wie Referenz gegen Referenz
  let gleich = true;
  for (const [tr, tg] of [[3, 4], [5, 2], [4, 4]]) {
    const b1 = leer(), b2 = leer(); let chip = 1, n = 0, abw = null;
    while (n < 42) {
      const t = chip === 1 ? tr : tg;
      const a = refBestMove(b1, chip, t), c = KI.bestMove(b2, chip, t);
      if (a !== c) { abw = { n, a, c }; break; }
      const r1 = drop(b1, a, chip), r2 = drop(b2, c, chip);
      if (checkWin(b1, r1, a)) break;
      chip = opposite(chip); n++;
    }
    if (abw) gleich = false;
    pruefe('Partie Rot-Tiefe ' + tr + ' gegen Gelb-Tiefe ' + tg + ': jeder Zug identisch (' + n + ' Züge)', !abw, abw && JSON.stringify(abw));
  }
}

// ================= Bekannte Eigenschaften der Swift-KI =================
{
  const st = V.neu();
  pruefe('leeres Brett Tiefe 5: Zug wie Referenz', KI.waehle(st, 5) === refBestMove(leer(), 1, 5), KI.waehle(st, 5));
  pruefe('KI ist deterministisch (kein Zufall wie früher)', [0, 1, 2, 3, 4].every(() => KI.waehle(st, 4) === KI.waehle(st, 4)));
  const w = V.ausZuegen([0, 6, 0, 6, 0, 5]);   // Rot am Zug: Spalte 0 gewinnt
  pruefe('Sofortgewinn: linkeste gewinnende Spalte', KI.waehle(w, 2) === 0);
  const b2 = V.ausZuegen([0, 6, 1, 6, 2]);      // Gelb am Zug muss Spalte 3 blocken
  pruefe('blockt (Tiefe 2…9)', [2, 3, 4, 5, 6, 7, 9].every(t => KI.waehle(b2, t) === 3));
  // letzte freie Spalte
  const st3 = V.neu(); for (const c of [0, 1, 2, 3, 4, 5]) for (let i = 0; i < 6; i++) V.ziehen(st3, c);
  pruefe('letzte freie Spalte wird gewählt, auch ohne Gewinn', st3.ende ? true : KI.waehle(st3, 5) === 6);
  pruefe('Regler → Tiefe wie Swift: 1→2, 2→2, 5→5, 9→9, 10→9', [1, 2, 5, 9, 10].map(KI.stufeZuTiefe).join() === '2,2,5,9,9');
  pruefe('Regler → Name wie Swift', [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(KI.stufenName).join('|') === 'Sehr leicht|Leicht|Leicht|Mittel|Mittel|Stark|Stark|Sehr stark|Sehr stark|Experte');
}
console.log('\n' + ok + ' OK, ' + fehl + ' FEHL');
process.exit(fehl ? 1 : 0);
