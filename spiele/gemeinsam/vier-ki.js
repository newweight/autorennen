// ============================================================
// 4 gewinnt – Computergegner (UMD). 1:1-Übersetzung der KI aus der Swift-App (VierGewinnt.swift v2.1, struct AI / Board.score):
//   - Minimax mit Alpha-Beta, Spalten immer von links nach rechts (0…6), KEIN Zufall, KEINE Mittelspalten-Sortierung.
//   - Sofortgewinn: erste Spalte (von links), die gewinnt, wird sofort gespielt.
//   - Wurzel: Suche mit vollem Fenster je Zug, nur strikt bessere Werte ersetzen (bei Gleichstand gewinnt die linkeste Spalte).
//   - Blatt (depth == 0): score(chip) - score(gegner); Gewinn im Baum = ±1_000_000 (ohne Tiefenabzug); volles Brett = 0.
//   - score: alle Vierer-Fenster; 3 eigene + 1 leer = 100, 2 + 2 leer = 10, 1 + 3 leer = 1; Fenster mit Gegnerstein zählen nicht.
// Brett wie in Swift: grid[reihe][spalte], Reihe 0 = OBEN, Steine fallen auf die unterste freie Reihe (5). Chip: 0 leer, 1 Rot, 2 Gelb.
// Schnittstelle:
//   BRETT.VierKI.bestMove(grid, chip, tiefe)   grid = Int8Array(42) (Index reihe*7+spalte) oder Array von 6 Reihen; → Spalte 0…6 (wie AI.bestMove)
//   BRETT.VierKI.waehle(st, tiefe)             st = Zustand aus vier-regeln.js (Reihe 0 = UNTEN) → Spalte für st.am
//   BRETT.VierKI.ausZustand(st)                vier-regeln-Zustand → Swift-Raster
//   BRETT.VierKI.stufeZuTiefe(wert)            Regler 1…10 → Tiefe (Swift: max(2, min(9, wert)))
// ============================================================
(function (root, f) {
  if (typeof module === 'object' && module.exports) module.exports = f();
  else { root.BRETT = root.BRETT || {}; root.BRETT.VierKI = f(); }
})(typeof self !== 'undefined' ? self : this, function () {
  const ROWS = 6, COLS = 7;
  const MIN = -9007199254740991, MAX = 9007199254740991;     // Int.min / Int.max

  // alle Vierer-Fenster (Richtungen wie in Swift: (0,1) (1,0) (1,1) (1,-1)); nur vollständig im Brett liegende zählen
  const FENSTER = [];
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) for (const [dr, dc] of [[0, 1], [1, 0], [1, 1], [1, -1]]) {
    const w = []; let ok = true;
    for (let i = 0; i < 4; i++) { const nr = r + dr * i, nc = c + dc * i; if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS) { ok = false; break; } w.push(nr * COLS + nc); }
    if (ok) FENSTER.push(w);
  }
  const NF = FENSTER.length;
  const FIDX = new Int16Array(NF * 4);
  FENSTER.forEach((w, i) => w.forEach((x, k) => { FIDX[i * 4 + k] = x; }));

  function rasterAus(grid) {
    if (grid instanceof Int8Array && grid.length === ROWS * COLS) return grid.slice();
    if (Array.isArray(grid) && Array.isArray(grid[0])) { const g = new Int8Array(ROWS * COLS); for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) g[r * COLS + c] = grid[r][c]; return g; }
    return Int8Array.from(grid);
  }

  function drop(g, col, chip) {                 // Board.drop: von unten (Reihe 5) nach oben die erste freie Reihe; → Reihe oder -1
    for (let r = ROWS - 1; r >= 0; r--) if (g[r * COLS + col] === 0) { g[r * COLS + col] = chip; return r; }
    return -1;
  }
  const isColumnFull = (g, col) => g[col] !== 0;
  function isFull(g) { for (let c = 0; c < COLS; c++) if (g[c] === 0) return false; return true; }

  function checkWin(g, row, col) {
    const chip = g[row * COLS + col];
    if (chip === 0) return false;
    for (const [dr, dc] of [[0, 1], [1, 0], [1, 1], [1, -1]]) {
      let count = 1;
      for (const sign of [1, -1]) {
        let r = row + dr * sign, c = col + dc * sign;
        while (r >= 0 && r < ROWS && c >= 0 && c < COLS && g[r * COLS + c] === chip) { count++; r += dr * sign; c += dc * sign; }
      }
      if (count >= 4) return true;
    }
    return false;
  }

  /** Board.score(for:) */
  function score(g, chip) {
    let s = 0;
    for (let w = 0; w < NF; w++) {
      let my = 0, empty = 0;
      for (let i = 0; i < 4; i++) {
        const cell = g[FIDX[w * 4 + i]];
        if (cell === chip) my++; else if (cell === 0) empty++; else { my = -1; break; }
      }
      if (my < 0) continue;
      if (my === 3 && empty === 1) s += 100; else if (my === 2 && empty === 2) s += 10; else if (my === 1 && empty === 3) s += 1;
    }
    return s;
  }
  const gegner = (chip) => chip === 1 ? 2 : 1;       // Chip.opposite (Swift: self == .red ? .yellow : .red)

  function minimax(g, depth, alpha, beta, maximizing, chip) {
    if (isFull(g)) return 0;
    if (depth === 0) return score(g, chip) - score(g, gegner(chip));
    let a = alpha, b = beta;
    if (maximizing) {
      let val = MIN + 1;
      for (let col = 0; col < COLS; col++) {
        if (isColumnFull(g, col)) continue;
        const row = drop(g, col, chip);
        if (checkWin(g, row, col)) { g[row * COLS + col] = 0; return 1000000; }
        const w = minimax(g, depth - 1, a, b, false, chip);
        g[row * COLS + col] = 0;
        if (w > val) val = w;
        if (val > a) a = val;
        if (a >= b) break;
      }
      return val;
    } else {
      let val = MAX;
      const opp = gegner(chip);
      for (let col = 0; col < COLS; col++) {
        if (isColumnFull(g, col)) continue;
        const row = drop(g, col, opp);
        if (checkWin(g, row, col)) { g[row * COLS + col] = 0; return -1000000; }
        const w = minimax(g, depth - 1, a, b, true, chip);
        g[row * COLS + col] = 0;
        if (w < val) val = w;
        if (val < b) b = val;
        if (a >= b) break;
      }
      return val;
    }
  }

  /** AI.bestMove(board:chip:) mit AI.depth = tiefe */
  function bestMove(grid, chip, tiefe) {
    const g = rasterAus(grid);
    let best = -1, bestScore = MIN;
    for (let col = 0; col < COLS; col++) {
      if (isColumnFull(g, col)) continue;
      const row = drop(g, col, chip);
      if (row >= 0) {
        if (checkWin(g, row, col)) return col;
        const s = minimax(g, tiefe - 1, MIN + 1, MAX, false, chip);
        g[row * COLS + col] = 0;
        if (s > bestScore) { bestScore = s; best = col; }
      }
    }
    if (best >= 0) return best;
    for (let c = 0; c < COLS; c++) if (!isColumnFull(g, c)) return c;
    return 0;
  }

  /** vier-regeln.js-Zustand (b[zeile*7+spalte], Zeile 0 unten) → Swift-Raster (Reihe 0 oben) */
  function ausZustand(st) {
    const g = new Int8Array(ROWS * COLS);
    for (let z = 0; z < ROWS; z++) for (let s = 0; s < COLS; s++) g[(ROWS - 1 - z) * COLS + s] = st.b[z * COLS + s];
    return g;
  }
  const waehle = (st, tiefe) => bestMove(ausZustand(st), st.am, tiefe);
  const stufeZuTiefe = (wert) => Math.max(2, Math.min(9, Math.trunc(wert)));
  const STUFEN_NAMEN = ['', 'Sehr leicht', 'Leicht', 'Leicht', 'Mittel', 'Mittel', 'Stark', 'Stark', 'Sehr stark', 'Sehr stark', 'Experte'];
  const stufenName = (wert) => wert < STUFEN_NAMEN.length ? STUFEN_NAMEN[wert] : 'Experte';

  return { bestMove, waehle, ausZustand, stufeZuTiefe, stufenName, score, minimax, checkWin, drop, ROWS, COLS };
});
