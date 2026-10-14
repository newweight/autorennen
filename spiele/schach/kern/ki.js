/* Schach-Kern: ChessAIEngine (Stufen 1-10). 1:1 nach SchachSpiel.swift "AI Engine":
   Negamax + Alpha-Beta mit iterativer Vertiefung (FIX #12), Ruhesuche (FIX #13), Knotenbudget je Stufe,
   Matt/Patt an Blaettern (FIX #9), gleiche Bewertung (Material + Positions-Boni + Koenigsschutz),
   gleiche Fehlerquoten der Anfaengerstufen (Stufe 1: 72 %, 2: 54 %, 3: 36 %, 4: 18 % zweit-/drittbester Zug).
   Kein DOM: laeuft im Web-Worker. */
(function (root, factory) {
  var K;
  if (typeof module === 'object' && module.exports) { require('./modelle.js'); require('./brett.js'); require('./eroeffnungsbuch.js'); K = require('./namespace.js'); factory(K); module.exports = K; }
  else { K = root.SchachKern = root.SchachKern || {}; factory(K); }
})(typeof self !== 'undefined' ? self : this, function (K) {
  'use strict';

  var ChessBoard = K.ChessBoard;
  var WHITE = 0, BLACK = 1;
  var PAWN = 1, KNIGHT = 2, BISHOP = 3, ROOK = 4, QUEEN = 5, KING = 6;
  var VAL = [0, 100, 320, 330, 500, 900, 20000];
  var NEG = -1e15, POS = 1e15;     // Swift: Int.min + 1 / Int.max

  function copyBoard(b) { return ChessBoard.copyFrom(b); }

  function ChessAIEngine(difficulty) {
    if (difficulty === undefined) difficulty = 5;
    this.difficulty = Math.max(1, Math.min(10, difficulty));
    this.nodeCount = 0;
    this.nodeBudgetOverride = null;   // v3: fester Knotenbudget-Wert fuer Coach/Analyse (null = nach Spielstaerke)
    this.aborted = false;
  }

  // FIX #1 (Swift): Knotenbudget skaliert mit der Stufe
  ChessAIEngine.prototype.maxNodes = function () {
    if (this.nodeBudgetOverride !== null) return this.nodeBudgetOverride;
    var d = this.difficulty;
    if (d >= 1 && d <= 3) return 50000;
    switch (d) {
      case 4: return 100000;
      case 5: return 200000;
      case 6: return 400000;
      case 7: return 600000;
      case 8: return 900000;
      case 9: return 1200000;
      case 10: return 2000000;
      default: return 600000;
    }
  };

  // ---------- Zugwahl ----------
  ChessAIEngine.prototype.bestMove = function (board, color) {
    var moves = board.allLegalMoves(color);
    if (moves.length === 0) return null;
    if (moves.length === 1) return moves[0];

    this.nodeCount = 0;
    this.aborted = false;
    this._max = this.maxNodes();
    var ordered = this.orderMoves(moves, board, color);
    var lastCompletedBest = ordered[0];
    var maxDepth = Math.max(2, Math.min(this.difficulty + 1, 8));

    for (var depth = 2; depth <= maxDepth; depth++) {
      var alpha = NEG;
      var bestThisDepth = ordered[0];
      var completed = true;

      for (var i = 0; i < ordered.length; i++) {
        var move = ordered[i];
        var tmp = copyBoard(board);
        tmp.executeMove(move);
        var score = -this.negamax(tmp, depth - 1, NEG, -alpha, 1 - color, color);
        if (this.aborted) { completed = false; break; }
        if (score > alpha) { alpha = score; bestThisDepth = move; }
      }

      if (completed) {
        lastCompletedBest = bestThisDepth;
        // Besten Zug nach vorn sortieren -> naechste Iteration schneller
        var rest = [];
        for (var j = 0; j < ordered.length; j++) if (!K.moveEq(ordered[j], bestThisDepth)) rest.push(ordered[j]);
        rest.unshift(bestThisDepth);
        ordered = rest;
      } else {
        break;   // abgebrochene Tiefe verwerfen
      }
    }

    // Kinder-/Anfaengerstufen: gelegentlich absichtlich den zweit-/drittbesten Zug spielen
    if (this.difficulty < 5 && ordered.length >= 2) {
      var wobbleChance = (5 - this.difficulty) * 18;   // Stufe 1: 72 %, Stufe 4: 18 %
      if (K.Zufall.ganz(100) < wobbleChance) {
        return ordered[1 + K.Zufall.ganz(Math.min(3, ordered.length) - 1)];
      }
    }
    return lastCompletedBest;
  };

  // Ruhesuche (FIX #13)
  ChessAIEngine.prototype.quiesce = function (board, alpha, beta, color, qdepth) {
    this.nodeCount += 1;
    if (this.nodeCount > this._max) this.aborted = true;
    var standPat = this.evaluate(board, color);
    if (this.aborted || qdepth <= 0) return standPat;
    if (standPat >= beta) return standPat;
    var a = Math.max(alpha, standPat);

    var captures = board.allLegalCaptures(color);   // = allLegalMoves(...).filter(capturedPiece != nil)
    captures.sort(function (x, y) { return VAL[y.capturedPiece] - VAL[x.capturedPiece]; });
    for (var k = 0; k < captures.length; k++) {
      var tmp = copyBoard(board);
      tmp.executeMove(captures[k]);
      var score = -this.quiesce(tmp, -beta, -a, 1 - color, qdepth - 1);
      if (score > a) a = score;
      if (a >= beta) break;
    }
    return a;
  };

  ChessAIEngine.prototype.orderMoves = function (moves, board, color) {
    var self = this;
    var dec = moves.map(function (m, i) { return { m: m, s: self.moveOrderScore(m, board), i: i }; });
    dec.sort(function (a, b) { return (b.s - a.s) || (a.i - b.i); });   // stabil, hoechster Wert zuerst
    return dec.map(function (d) { return d.m; });
  };

  ChessAIEngine.prototype.moveOrderScore = function (move, board) {
    var score = 0;
    if (move.capturedPiece) {
      var p = board.grid[move.from.row][move.from.col];
      var attackerValue = p ? VAL[p.type] : 100;
      score += VAL[move.capturedPiece] * 10 - attackerValue;   // MVV-LVA
    }
    if (move.promotion) score += 800;
    if (move.isCastling) score += 50;
    return score;
  };

  ChessAIEngine.prototype.negamax = function (board, depth, alpha, beta, color, aiColor) {
    this.nodeCount += 1;
    if (this.nodeCount > this._max) this.aborted = true;
    if (this.aborted) return this.evaluate(board, color);   // Budget auf: Wert egal (FIX #12)

    if (depth === 0) {
      // FIX #9: auch an Blattknoten Matt/Patt erkennen
      if (board.isInCheck(color)) {
        if (!board.hasLegalMoves(color)) return -100000 - depth;
      } else {
        var pieceCount = 0, g = board.grid;
        for (var r = 0; r < 8; r++) for (var c = 0; c < 8; c++) if (g[r][c]) pieceCount++;
        if (pieceCount <= 8 && !board.hasLegalMoves(color)) return 0;   // Patt
      }
      return this.quiesce(board, alpha, beta, color, 6);
    }

    var moves = board.allLegalMoves(color);
    if (moves.length === 0) {
      if (board.isInCheck(color)) return -100000 - depth;   // Matt (je frueher, desto schlimmer)
      return 0;                                              // Patt
    }

    var a = alpha;
    var ordered = this.orderMoves(moves, board, color);
    for (var i = 0; i < ordered.length; i++) {
      var tmp = copyBoard(board);
      tmp.executeMove(ordered[i]);
      var score = -this.negamax(tmp, depth - 1, -beta, -a, 1 - color, aiColor);
      if (this.aborted) return a;
      if (score > a) a = score;
      if (a >= beta) break;
    }
    return a;
  };

  // v3 (Coach): bewertet ALLE Zuege mit echter Suche, ohne absichtliche Fehler.
  // window: null = volles Fenster (exakte Werte); sonst nur Zuege bis `window` Centibauern unter dem besten exakt.
  // Rueckgabe { ranked: [{move, score}] (bester zuerst), depth: letzte voll gerechnete Tiefe }
  ChessAIEngine.prototype.rankMoves = function (board, color, maxDepth, nodeBudget, window) {
    var moves = board.allLegalMoves(color);
    if (moves.length === 0) return { ranked: [], depth: 0 };
    if (window === undefined) window = null;
    this.nodeBudgetOverride = nodeBudget;
    try {
      this.nodeCount = 0;
      this.aborted = false;
      this._max = this.maxNodes();

      var ordered = this.orderMoves(moves, board, color);
      var result = [];
      var completedDepth = 0;
      var top = Math.max(1, maxDepth);

      for (var depth = 1; depth <= top; depth++) {
        var scores = [];
        var bestSoFar = NEG;
        for (var i = 0; i < ordered.length; i++) {
          var m = ordered[i];
          var tmp = copyBoard(board);
          tmp.executeMove(m);
          var alpha = NEG;
          if (window !== null && i > 0 && bestSoFar > NEG + window) alpha = bestSoFar - window;
          var s = -this.negamax(tmp, depth - 1, alpha, POS, 1 - color, color);
          if (this.aborted) break;
          scores.push({ move: m, score: s });
          if (s > bestSoFar) bestSoFar = s;
        }
        if (this.aborted) break;
        scores.sort(function (x, y) { return y.score - x.score; });   // stabil
        result = scores;
        completedDepth = depth;
        ordered = scores.map(function (x) { return x.move; });
        if (scores.length && scores[0].score >= 90000) break;          // Matt gefunden: fertig
      }

      if (result.length === 0) {
        // Budget reichte nicht fuer Tiefe 1: statische Bewertung als Notnagel
        var self = this;
        result = moves.map(function (m) {
          var t = copyBoard(board);
          t.executeMove(m);
          return { move: m, score: -self.evaluate(t, 1 - color) };
        });
        result.sort(function (x, y) { return y.score - x.score; });
      }
      return { ranked: result, depth: completedDepth };
    } finally {
      this.nodeBudgetOverride = null;
    }
  };

  // Flache Suche fuer die Live-Zugbewertung
  ChessAIEngine.prototype.shallowScore = function (board, color, depth) {
    if (depth <= 0) return this.evaluate(board, color);
    var moves = board.allLegalMoves(color);
    if (moves.length === 0) return board.isInCheck(color) ? (-100000 - depth) : 0;
    var best = NEG;
    for (var i = 0; i < moves.length; i++) {
      var tmp = copyBoard(board);
      tmp.executeMove(moves[i]);
      var score = -this.shallowScore(tmp, 1 - color, depth - 1);
      if (score > best) best = score;
    }
    return best;
  };

  // Tabelle aus positionalBonus (Wert je Figurtyp/Farbe/Feld) + Materialwert - nur Beschleunigung, gleiche Zahlen
  var TAB = null;
  function buildTab(eng) {
    TAB = new Int32Array(7 * 2 * 64);
    for (var t = 1; t <= 6; t++) for (var col = 0; col < 2; col++) for (var r = 0; r < 8; r++) for (var c = 0; c < 8; c++) {
      TAB[(t * 2 + col) * 64 + r * 8 + c] = VAL[t] + eng.positionalBonus(t, r, c, col);
    }
  }

  ChessAIEngine.prototype.evaluate = function (board, color) {
    var score = 0, wKing = null, bKing = null, g = board.grid;
    if (TAB === null) buildTab(this);
    for (var r = 0; r < 8; r++) { var row = g[r]; for (var c = 0; c < 8; c++) {
      var p = row[c];
      if (p !== null) {
        var val = TAB[(p.type * 2 + p.color) * 64 + r * 8 + c];
        if (p.color === color) score += val; else score -= val;
        if (p.type === KING) { if (p.color === WHITE) wKing = { row: r, col: c }; else bKing = { row: r, col: c }; }
      }
    } }
    // v3: Koenigsschutz - vorgerueckte f/g/h-Bauern vor dem noch kurz stehenden Koenig kosten Punkte
    var wShelter = this.shelterPenalty(board, WHITE, wKing);
    var bShelter = this.shelterPenalty(board, BLACK, bKing);
    score += color === WHITE ? (bShelter - wShelter) : (wShelter - bShelter);
    return score;
  };

  ChessAIEngine.prototype.shelterPenalty = function (board, color, k) {
    if (!k) return 0;
    var home = color === WHITE ? 7 : 0, start = color === WHITE ? 6 : 1;
    if (!(k.row === home && k.col >= 4)) return 0;
    var pen = 0, cols = [5, 6, 7], ws = [16, 8, 5];
    for (var i = 0; i < 3; i++) {
      var p = board.grid[start][cols[i]];
      if (p && p.type === PAWN && p.color === color) continue;
      pen += ws[i];
    }
    return pen;
  };

  ChessAIEngine.prototype.positionalBonus = function (type, row, col, color) {
    var rr = color === WHITE ? 7 - row : row;   // 0 = eigene Grundreihe
    var centerDist;
    switch (type) {
      case PAWN: {
        var central = col >= 2 && col <= 5;
        var centerBonus = central ? 10 : 0;
        var occupy = ((col === 3 || col === 4) && rr >= 3 && rr <= 4) ? 8 : 0;
        return rr * (central ? 5 : 3) + centerBonus + occupy;
      }
      case KNIGHT:
        centerDist = Math.min(Math.abs(col - 3), Math.abs(col - 4)) + Math.min(Math.abs(row - 3), Math.abs(row - 4));
        return Math.max(0, 20 - centerDist * 5) - (rr === 0 ? 10 : 0);
      case BISHOP:
        centerDist = Math.min(Math.abs(col - 3), Math.abs(col - 4)) + Math.min(Math.abs(row - 3), Math.abs(row - 4));
        return Math.max(0, 15 - centerDist * 3) - (rr === 0 ? 10 : 0);
      case ROOK:
        return rr === 6 ? 20 : 0;
      case QUEEN:
        return rr <= 1 ? 0 : -5;
      case KING:
        if (rr <= 1) return (col <= 2 || col >= 6) ? 15 : 0;
        return -20;
    }
    return 0;
  };

  // ---------- Computerzug wie in SchachWindowController.doMove (Buch + Engine) ----------
  // FIX #14 (Swift): Ab Stufe 4 spielt der Computer bekannte Eroeffnungstheorie (history = UCI-Zuege der Partie).
  // Gibt den Zug (Objekt) oder null zurueck (kein legaler Zug).
  ChessAIEngine.computerMove = function (board, color, difficulty, history) {
    history = history || [];
    var aiMove = null;
    if (difficulty >= 4 && history.length <= 16) {
      var bookOptions = K.ChessOpeningBook.nextBookMoves(history);
      if (bookOptions.length > 0) {
        var pick = bookOptions[K.Zufall.ganz(bookOptions.length)];
        var legal = board.allLegalMoves(color);
        for (var i = 0; i < legal.length; i++) if (K.moveToUci(legal[i]) === pick.move) { aiMove = legal[i]; break; }
      }
    }
    if (!aiMove) aiMove = new ChessAIEngine(difficulty).bestMove(board, color);
    return aiMove;
  };

  K.ChessAIEngine = ChessAIEngine;
});
