/* Schach-Kern: ChessBoard (Regeln, FEN, Hash, Serialisierung).
   1:1-Uebersetzung von "Chess Board Logic" + "FEN-Unterstuetzung" aus SchachSpiel.swift.
   Felder als {row,col} wie in Swift (row 0 = Reihe 8 oben, col 0 = a-Linie).
   Figuren sind unveraenderliche Objekte {color,type,hasMoved} (Brett-Kopien teilen sie). */
(function (root, factory) {
  var K;
  if (typeof module === 'object' && module.exports) { require('./modelle.js'); K = require('./namespace.js'); factory(K); module.exports = K; }
  else { K = root.SchachKern = root.SchachKern || {}; factory(K); }
})(typeof self !== 'undefined' ? self : this, function (K) {
  'use strict';

  var PAWN = 1, KNIGHT = 2, BISHOP = 3, ROOK = 4, QUEEN = 5, KING = 6;
  var WHITE = 0, BLACK = 1;
  var VAL = [0, 100, 320, 330, 500, 900, 20000];

  var KNIGHT_OFFS = [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]];
  var DIRS_B = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
  var DIRS_R = [[0, 1], [0, -1], [1, 0], [-1, 0]];
  var DIRS_Q = [[0, 1], [0, -1], [1, 0], [-1, 0], [1, 1], [1, -1], [-1, 1], [-1, -1]];
  var PROMO_TYPES = [QUEEN, ROOK, BISHOP, KNIGHT];
  var KN_DR = [-2, -2, -1, -1, 1, 1, 2, 2], KN_DC = [-1, 1, -2, 2, -2, 2, -1, 1];
  var Q_DR = [0, 0, 1, -1, 1, 1, -1, -1], Q_DC = [1, -1, 0, 0, 1, -1, 1, -1];

  function P(color, type, hasMoved) { return { color: color, type: type, hasMoved: !!hasMoved }; }
  function mv(fr, fc, tr, tc, cap, promo, castle, ep) {
    return { from: { row: fr, col: fc }, to: { row: tr, col: tc }, capturedPiece: cap || null, promotion: promo || null, isCastling: !!castle, isEnPassant: !!ep };
  }

  function ChessBoard() {
    this.grid = [];
    for (var r = 0; r < 8; r++) this.grid.push([null, null, null, null, null, null, null, null]);
    this.enPassantTarget = null;
    this.halfMoveClock = 0;
    this.fullMoveNumber = 1;
    this.moveHistory = [];
    this.sideToMoveFromFen = null;   // nur gesetzt, wenn eine FEN " w"/" b" enthielt
    this.setupInitialPosition();
  }
  ChessBoard.size = 8;

  // Swift: init(copyFrom:)
  ChessBoard.copyFrom = function (o) {
    var b = Object.create(ChessBoard.prototype);
    var g = o.grid, ng = new Array(8);
    for (var r = 0; r < 8; r++) ng[r] = g[r].slice();
    b.grid = ng;
    b.enPassantTarget = o.enPassantTarget;           // unveraenderliches Objekt, darf geteilt werden
    b.halfMoveClock = o.halfMoveClock;
    b.fullMoveNumber = o.fullMoveNumber;
    b.moveHistory = o.moveHistory.length ? o.moveHistory.slice() : o.moveHistory;
    b.sideToMoveFromFen = o.sideToMoveFromFen;
    return b;
  };
  ChessBoard.prototype.copy = function () { return ChessBoard.copyFrom(this); };

  ChessBoard.prototype.setupInitialPosition = function () {
    for (var r = 0; r < 8; r++) for (var c = 0; c < 8; c++) this.grid[r][c] = null;
    var back = [ROOK, KNIGHT, BISHOP, QUEEN, KING, BISHOP, KNIGHT, ROOK];
    for (var c2 = 0; c2 < 8; c2++) {
      this.grid[0][c2] = P(BLACK, back[c2]);
      this.grid[1][c2] = P(BLACK, PAWN);
      this.grid[6][c2] = P(WHITE, PAWN);
      this.grid[7][c2] = P(WHITE, back[c2]);
    }
  };

  ChessBoard.prototype.piece = function (p) {
    if (p.row < 0 || p.row >= 8 || p.col < 0 || p.col >= 8) return null;
    return this.grid[p.row][p.col];
  };
  ChessBoard.prototype.setPiece = function (piece, p) {
    if (p.row < 0 || p.row >= 8 || p.col < 0 || p.col >= 8) return;
    this.grid[p.row][p.col] = piece;
  };

  ChessBoard.prototype.findKing = function (color) {
    var g = this.grid;
    for (var r = 0; r < 8; r++) for (var c = 0; c < 8; c++) {
      var p = g[r][c];
      if (p && p.color === color && p.type === KING) return { row: r, col: c };
    }
    return null;
  };

  // schnelle Variante mit Zahlen statt Objekten (Ergebnis identisch zu Swift isSquareAttacked)
  ChessBoard.prototype._attacked = function (row, col, color) {
    var g = this.grid, p, i, nr, nc, r, c, dr, dc;
    var pawnDir = color === WHITE ? 1 : -1;
    nr = row + pawnDir;
    if (nr >= 0 && nr < 8) {
      var pr = g[nr];
      if (col > 0) { p = pr[col - 1]; if (p !== null && p.color === color && p.type === PAWN) return true; }
      if (col < 7) { p = pr[col + 1]; if (p !== null && p.color === color && p.type === PAWN) return true; }
    }
    for (i = 0; i < 8; i++) {
      nr = row + KN_DR[i]; nc = col + KN_DC[i];
      if (nr >= 0 && nr < 8 && nc >= 0 && nc < 8) { p = g[nr][nc]; if (p !== null && p.color === color && p.type === KNIGHT) return true; }
    }
    for (i = 0; i < 8; i++) {
      nr = row + Q_DR[i]; nc = col + Q_DC[i];
      if (nr >= 0 && nr < 8 && nc >= 0 && nc < 8) { p = g[nr][nc]; if (p !== null && p.color === color && p.type === KING) return true; }
    }
    for (i = 0; i < 4; i++) {            // Q_DR[0..3] = gerade Richtungen
      dr = Q_DR[i]; dc = Q_DC[i]; r = row + dr; c = col + dc;
      while (r >= 0 && r < 8 && c >= 0 && c < 8) {
        p = g[r][c];
        if (p !== null) { if (p.color === color && (p.type === ROOK || p.type === QUEEN)) return true; break; }
        r += dr; c += dc;
      }
    }
    for (i = 4; i < 8; i++) {            // Q_DR[4..7] = Diagonalen
      dr = Q_DR[i]; dc = Q_DC[i]; r = row + dr; c = col + dc;
      while (r >= 0 && r < 8 && c >= 0 && c < 8) {
        p = g[r][c];
        if (p !== null) { if (p.color === color && (p.type === BISHOP || p.type === QUEEN)) return true; break; }
        r += dr; c += dc;
      }
    }
    return false;
  };

  // Ist das Feld von `color` angegriffen?
  ChessBoard.prototype.isSquareAttacked = function (pos, color) { return this._attacked(pos.row, pos.col, color); };

  ChessBoard.prototype.isInCheck = function (color) {
    var k = this.findKing(color);
    if (!k) return false;
    return this._attacked(k.row, k.col, color === WHITE ? BLACK : WHITE);
  };

  // Alle pseudo-legalen Zuege (vor dem Schach-Filter), Reihenfolge wie in Swift
  ChessBoard.prototype.pseudoLegalMoves = function (color, capturesOnly) {
    var moves = [], g = this.grid;
    this._co = !!capturesOnly;
    for (var r = 0; r < 8; r++) for (var c = 0; c < 8; c++) {
      var p = g[r][c];
      if (p && p.color === color) {
        switch (p.type) {
          case PAWN: this._pawnMoves(r, c, color, moves); break;
          case KNIGHT: this._knightMoves(r, c, color, moves); break;
          case BISHOP: this._slidingMoves(r, c, color, DIRS_B, moves); break;
          case ROOK: this._slidingMoves(r, c, color, DIRS_R, moves); break;
          case QUEEN: this._slidingMoves(r, c, color, DIRS_Q, moves); break;
          case KING: this._kingMoves(r, c, color, moves); break;
        }
      }
    }
    this._co = false;
    return moves;
  };

  ChessBoard.prototype._pawnMoves = function (fr, fc, color, moves) {
    var g = this.grid;
    var dir = color === WHITE ? -1 : 1;
    var startRow = color === WHITE ? 6 : 1;
    var promoRow = color === WHITE ? 0 : 7;
    var f1r = fr + dir, i, co = this._co;
    if (!co && f1r >= 0 && f1r < 8 && g[f1r][fc] === null) {
      if (f1r === promoRow) {
        for (i = 0; i < 4; i++) moves.push(mv(fr, fc, f1r, fc, null, PROMO_TYPES[i]));
      } else {
        moves.push(mv(fr, fc, f1r, fc));
      }
      if (fr === startRow) {
        var f2r = fr + 2 * dir;
        if (g[f2r][fc] === null) moves.push(mv(fr, fc, f2r, fc));
      }
    }
    var ep = this.enPassantTarget;
    for (var k = 0; k < 2; k++) {
      var dc = k === 0 ? -1 : 1;
      var cr = fr + dir, cc = fc + dc;
      if (!(cr >= 0 && cr < 8 && cc >= 0 && cc < 8)) continue;
      var t = g[cr][cc];
      if (t && t.color !== color) {
        if (cr === promoRow) {
          for (i = 0; i < 4; i++) moves.push(mv(fr, fc, cr, cc, t.type, PROMO_TYPES[i]));
        } else {
          moves.push(mv(fr, fc, cr, cc, t.type));
        }
      }
      if (ep && ep.row === cr && ep.col === cc) moves.push(mv(fr, fc, cr, cc, PAWN, null, false, true));
    }
  };

  ChessBoard.prototype._knightMoves = function (fr, fc, color, moves) {
    var g = this.grid;
    for (var i = 0; i < 8; i++) {
      var tr = fr + KNIGHT_OFFS[i][0], tc = fc + KNIGHT_OFFS[i][1];
      if (!(tr >= 0 && tr < 8 && tc >= 0 && tc < 8)) continue;
      var t = g[tr][tc];
      if (t) { if (t.color !== color) moves.push(mv(fr, fc, tr, tc, t.type)); }
      else if (!this._co) moves.push(mv(fr, fc, tr, tc));
    }
  };

  ChessBoard.prototype._slidingMoves = function (fr, fc, color, dirs, moves) {
    var g = this.grid;
    for (var i = 0; i < dirs.length; i++) {
      var dr = dirs[i][0], dc = dirs[i][1], r = fr + dr, c = fc + dc;
      while (r >= 0 && r < 8 && c >= 0 && c < 8) {
        var t = g[r][c];
        if (t) { if (t.color !== color) moves.push(mv(fr, fc, r, c, t.type)); break; }
        if (!this._co) moves.push(mv(fr, fc, r, c));
        r += dr; c += dc;
      }
    }
  };

  ChessBoard.prototype._kingMoves = function (fr, fc, color, moves) {
    var g = this.grid, dr, dc;
    for (dr = -1; dr <= 1; dr++) for (dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue;
      var tr = fr + dr, tc = fc + dc;
      if (!(tr >= 0 && tr < 8 && tc >= 0 && tc < 8)) continue;
      var t = g[tr][tc];
      if (t) { if (t.color !== color) moves.push(mv(fr, fc, tr, tc, t.type)); }
      else if (!this._co) moves.push(mv(fr, fc, tr, tc));
    }
    if (this._co) return;
    // Rochade. FIX #7 (Swift): nur, wenn der Koenig wirklich auf e1/e8 steht.
    // Abweichung zu Swift (Regelkorrektur): Der Turm muss zusaetzlich die EIGENE Farbe haben.
    var homeRow = color === WHITE ? 7 : 0;
    var king = g[fr][fc];
    var opp = color === WHITE ? BLACK : WHITE;
    if (king && !king.hasMoved && fr === homeRow && fc === 4 && !this.isInCheck(color)) {
      var row = homeRow, rook = g[row][7];
      if (rook && rook.type === ROOK && rook.color === color && !rook.hasMoved) {
        if (g[row][5] === null && g[row][6] === null) {
          if (!this._attacked(row, 5, opp) && !this._attacked(row, 6, opp)) moves.push(mv(fr, fc, row, 6, null, null, true));
        }
      }
      rook = g[row][0];
      if (rook && rook.type === ROOK && rook.color === color && !rook.hasMoved) {
        if (g[row][1] === null && g[row][2] === null && g[row][3] === null) {
          if (!this._attacked(row, 3, opp) && !this._attacked(row, 2, opp)) moves.push(mv(fr, fc, row, 2, null, null, true));
        }
      }
    }
  };

  // Laesst der Zug den eigenen Koenig im Schach? (aequivalent zu Swift: Kopie + applyMoveUnchecked + isInCheck,
  // aber ohne Brettkopie: Felder werden voruebergehend geaendert und zurueckgesetzt)
  ChessBoard.prototype._leavesKingSafe = function (m, color, kingPos) {
    var g = this.grid;
    var fr = m.from.row, fc = m.from.col, tr = m.to.row, tc = m.to.col;
    var pc = g[fr][fc];
    if (!pc) return true;                       // Swift: applyMoveUnchecked tut nichts
    var savedTo = g[tr][tc], savedEp = null, epRow = fr;
    var rookFrom = null, rookTo = null, savedRookFrom = null, savedRookTo = null, rc1 = 0, rc2 = 0;
    if (m.isEnPassant) { savedEp = g[epRow][tc]; g[epRow][tc] = null; }
    if (m.isCastling) {
      rc1 = tc === 6 ? 7 : 0; rc2 = tc === 6 ? 5 : 3;
      savedRookFrom = g[fr][rc1]; savedRookTo = g[fr][rc2];
      g[fr][rc2] = savedRookFrom; g[fr][rc1] = null;
    }
    g[fr][fc] = null;
    g[tr][tc] = pc;
    var k = kingPos;
    if (pc.type === KING) k = { row: tr, col: tc };
    var safe = k ? !this._attacked(k.row, k.col, color === WHITE ? BLACK : WHITE) : true;
    // zuruecksetzen (Reihenfolge wichtig: zuerst Zielfeld, dann Startfeld)
    g[tr][tc] = savedTo;
    g[fr][fc] = pc;
    if (m.isEnPassant) g[epRow][tc] = savedEp;
    if (m.isCastling) { g[fr][rc1] = savedRookFrom; g[fr][rc2] = savedRookTo; }
    return safe;
  };

  // Ist der Zug legal? Gleiches Ergebnis wie "Kopie + applyMoveUnchecked + isInCheck" (Swift), aber ohne
  // vollen Test, wenn der Koenig nicht im Schach steht und die Figur nicht auf einer Linie mit ihm steht.
  ChessBoard.prototype._legal = function (m, color, kp, inCheck) {
    if (!kp) return true;                                        // kein Koenig: Swift findet kein Schach
    var g = this.grid, pc = g[m.from.row][m.from.col];
    if (!pc) return true;
    if (!inCheck && pc.type !== KING && !m.isEnPassant) {
      var dr = m.from.row - kp.row, dc = m.from.col - kp.col;
      if (dr !== 0 && dc !== 0 && dr !== dc && dr !== -dc) return true;   // nicht auf Linie/Diagonale mit dem Koenig
    }
    return this._leavesKingSafe(m, color, kp);
  };

  // Alle legalen Zuege
  ChessBoard.prototype.allLegalMoves = function (color, capturesOnly) {
    var pseudo = this.pseudoLegalMoves(color, capturesOnly), legal = [];
    var kp = this.findKing(color);
    var inCheck = kp ? this._attacked(kp.row, kp.col, color === WHITE ? BLACK : WHITE) : false;
    for (var i = 0; i < pseudo.length; i++) {
      var m = pseudo[i];
      if (this._legal(m, color, kp, inCheck)) legal.push(m);
    }
    return legal;
  };
  // Nur Schlagzuege (inkl. en passant), Reihenfolge wie in allLegalMoves(...).filter(capturedPiece != nil)
  ChessBoard.prototype.allLegalCaptures = function (color) { return this.allLegalMoves(color, true); };

  ChessBoard.prototype.hasLegalMoves = function (color) {
    var pseudo = this.pseudoLegalMoves(color);
    var kp = this.findKing(color);
    var inCheck = kp ? this._attacked(kp.row, kp.col, color === WHITE ? BLACK : WHITE) : false;
    for (var i = 0; i < pseudo.length; i++) if (this._legal(pseudo[i], color, kp, inCheck)) return true;
    return false;
  };

  // Zug ohne Legalitaetspruefung ausfuehren (Swift: applyMoveUnchecked)
  ChessBoard.prototype.applyMoveUnchecked = function (move) {
    var g = this.grid;
    var fr = move.from.row, fc = move.from.col, tr = move.to.row, tc = move.to.col;
    var pc = g[fr][fc];
    if (!pc) return;
    if (move.isEnPassant) g[fr][tc] = null;
    if (move.isCastling) {
      var row = fr;
      if (tc === 6) {
        var rk = g[row][7];
        g[row][5] = P(rk.color, rk.type, true);
        g[row][7] = null;
      } else {
        var rq = g[row][0];
        g[row][3] = P(rq.color, rq.type, true);
        g[row][0] = null;
      }
    }
    if (pc.type === PAWN || move.capturedPiece) this.halfMoveClock = 0;
    else this.halfMoveClock += 1;
    if (pc.type === PAWN && Math.abs(tr - fr) === 2) this.enPassantTarget = { row: (fr + tr) >> 1, col: fc };
    else this.enPassantTarget = null;
    g[fr][fc] = null;
    g[tr][tc] = null;
    if (move.promotion) pc = P(pc.color, move.promotion, true);
    else pc = P(pc.color, pc.type, true);
    g[tr][tc] = pc;
    if (pc.color === BLACK) this.fullMoveNumber += 1;
  };

  ChessBoard.prototype.executeMove = function (move) { this.applyMoveUnchecked(move); };

  // Ergebnis fuer den Spieler, der als naechstes zieht
  ChessBoard.prototype.checkGameResult = function (nextPlayer) {
    var R = K.GameResult;
    if (!this.hasLegalMoves(nextPlayer)) {
      if (this.isInCheck(nextPlayer)) return R.checkmate(nextPlayer === WHITE ? BLACK : WHITE);
      return R.stalemate();
    }
    if (this.halfMoveClock >= 100) return R.draw();
    if (this.isInsufficientMaterial()) return R.draw();
    return R.ongoing();
  };

  ChessBoard.prototype.isInsufficientMaterial = function () {
    var w = [], b = [], g = this.grid;
    for (var r = 0; r < 8; r++) for (var c = 0; c < 8; c++) {
      var p = g[r][c];
      if (p) { if (p.color === WHITE) w.push(p.type); else b.push(p.type); }
    }
    if (w.length === 1 && b.length === 1) return true;
    var other;
    if (w.length === 1 && b.length === 2) {
      other = b.filter(function (t) { return t !== KING; })[0];
      if (other === BISHOP || other === KNIGHT) return true;
    }
    if (b.length === 1 && w.length === 2) {
      other = w.filter(function (t) { return t !== KING; })[0];
      if (other === BISHOP || other === KNIGHT) return true;
    }
    return false;
  };

  ChessBoard.prototype.countMaterial = function (color) {
    var total = 0, g = this.grid;
    for (var r = 0; r < 8; r++) for (var c = 0; c < 8; c++) {
      var p = g[r][c];
      if (p && p.color === color && p.type !== KING) total += VAL[p.type];
    }
    return total;
  };

  var HASH_CH = ['', 'p', 'n', 'b', 'r', 'q', 'k'];
  // FIX #2 (Swift): Rochaderechte im Hash fuer korrekte Stellungswiederholung
  ChessBoard.prototype.boardHash = function () {
    var h = '', g = this.grid, r, c;
    for (r = 0; r < 8; r++) for (c = 0; c < 8; c++) {
      var p = g[r][c];
      if (p) { var ch = HASH_CH[p.type]; h += p.color === WHITE ? ch.toUpperCase() : ch; }
      else h += '.';
    }
    var wk = g[7][4];
    if (wk && wk.type === KING && !wk.hasMoved) {
      var wr1 = g[7][7]; if (wr1 && wr1.type === ROOK && !wr1.hasMoved) h += 'K';
      var wr2 = g[7][0]; if (wr2 && wr2.type === ROOK && !wr2.hasMoved) h += 'Q';
    }
    var bk = g[0][4];
    if (bk && bk.type === KING && !bk.hasMoved) {
      var br1 = g[0][7]; if (br1 && br1.type === ROOK && !br1.hasMoved) h += 'k';
      var br2 = g[0][0]; if (br2 && br2.type === ROOK && !br2.hasMoved) h += 'q';
    }
    if (this.enPassantTarget) h += 'e' + this.enPassantTarget.col;
    return h;
  };

  // ---------- FEN (Swift: convenience init(fen:)) ----------
  // Format: 8 Reihen mit '/' (Reihe 8 zuerst), optional " w"/" b", En-passant-Feld (" w d6").
  // Erweiterung (additiv): Ein Rochade-Feld ("KQkq", "Kq", "-") wird beachtet, ein Halbzug-/Zugzaehler uebernommen.
  // Ohne Rochade-Feld verhaelt sich der Parser wie in Swift (hasMoved = false fuer alle Figuren).
  ChessBoard.fromFEN = function (fen) {
    var b = new ChessBoard();
    for (var r = 0; r < 8; r++) for (var c = 0; c < 8; c++) b.grid[r][c] = null;
    var parts = String(fen).split(' ').filter(function (s) { return s.length > 0; });
    var rows = parts[0].split('/').filter(function (s) { return s.length > 0; });
    var TYPE = { p: PAWN, n: KNIGHT, b: BISHOP, r: ROOK, q: QUEEN, k: KING };
    for (var ri = 0; ri < rows.length && ri < 8; ri++) {
      var rowStr = rows[ri], col = 0;
      for (var i = 0; i < rowStr.length; i++) {
        var ch = rowStr.charAt(i);
        if (ch >= '1' && ch <= '8') { col += parseInt(ch, 10); }
        else if (col < 8) {
          var lower = ch.toLowerCase();
          var t = TYPE[lower];
          if (t) {
            b.grid[ri][col] = P(ch !== lower ? WHITE : BLACK, t, false);
            col += 1;
          }
        }
      }
    }
    for (var pi = 1; pi < parts.length; pi++) {
      var p = parts[pi];
      if (p.length === 2) {
        var file = p.charCodeAt(0), rank = parseInt(p.charAt(1), 10);
        if (file >= 97 && file <= 104 && rank >= 1 && rank <= 8) b.enPassantTarget = { row: 8 - rank, col: file - 97 };
      }
    }
    if (parts.length > 1 && (parts[1] === 'w' || parts[1] === 'b')) b.sideToMoveFromFen = parts[1] === 'w' ? WHITE : BLACK;
    if (parts.length >= 3 && /^(-|[KQkq]+)$/.test(parts[2])) {
      var rights = parts[2] === '-' ? '' : parts[2];
      var mark = function (r, c, type, color, has) {
        var q = b.grid[r][c];
        if (q && q.type === type && q.color === color && !has) b.grid[r][c] = P(color, type, true);
      };
      // Figuren auf Grundfeldern ohne passendes Recht gelten als bereits gezogen
      mark(7, 4, KING, WHITE, rights.indexOf('K') >= 0 || rights.indexOf('Q') >= 0);
      mark(7, 7, ROOK, WHITE, rights.indexOf('K') >= 0);
      mark(7, 0, ROOK, WHITE, rights.indexOf('Q') >= 0);
      mark(0, 4, KING, BLACK, rights.indexOf('k') >= 0 || rights.indexOf('q') >= 0);
      mark(0, 7, ROOK, BLACK, rights.indexOf('k') >= 0);
      mark(0, 0, ROOK, BLACK, rights.indexOf('q') >= 0);
    }
    if (parts.length >= 5) {
      var hm = parseInt(parts[parts.length - 2], 10), fm = parseInt(parts[parts.length - 1], 10);
      if (!isNaN(hm)) b.halfMoveClock = hm;
      if (!isNaN(fm)) b.fullMoveNumber = fm;
    }
    return b;
  };
  K.boardFromFEN = ChessBoard.fromFEN;

  // Neu: FEN-Ausgabe (vollstaendig). Rochaderechte wie im boardHash (König + Turm ungezogen).
  ChessBoard.prototype.toFEN = function (sideToMove) {
    var g = this.grid, s = [], r, c;
    var LET = ['', 'p', 'n', 'b', 'r', 'q', 'k'];
    for (r = 0; r < 8; r++) {
      var row = '', empty = 0;
      for (c = 0; c < 8; c++) {
        var p = g[r][c];
        if (!p) { empty++; continue; }
        if (empty) { row += empty; empty = 0; }
        row += p.color === WHITE ? LET[p.type].toUpperCase() : LET[p.type];
      }
      if (empty) row += empty;
      s.push(row);
    }
    var rights = '';
    var wk = g[7][4], bk = g[0][4];
    if (wk && wk.type === KING && wk.color === WHITE && !wk.hasMoved) {
      if (g[7][7] && g[7][7].type === ROOK && g[7][7].color === WHITE && !g[7][7].hasMoved) rights += 'K';
      if (g[7][0] && g[7][0].type === ROOK && g[7][0].color === WHITE && !g[7][0].hasMoved) rights += 'Q';
    }
    if (bk && bk.type === KING && bk.color === BLACK && !bk.hasMoved) {
      if (g[0][7] && g[0][7].type === ROOK && g[0][7].color === BLACK && !g[0][7].hasMoved) rights += 'k';
      if (g[0][0] && g[0][0].type === ROOK && g[0][0].color === BLACK && !g[0][0].hasMoved) rights += 'q';
    }
    var ep = this.enPassantTarget ? K.posToAlgebraic(this.enPassantTarget) : '-';
    return s.join('/') + ' ' + (sideToMove === BLACK ? 'b' : 'w') + ' ' + (rights || '-') + ' ' + ep + ' ' + this.halfMoveClock + ' ' + this.fullMoveNumber;
  };

  // ---------- Hilfen fuer die Oberflaeche (neu) ----------
  // Legale Zuege, die von `pos` ausgehen
  ChessBoard.prototype.legalMovesFrom = function (pos, color) {
    var p = this.piece(pos);
    var col = color === undefined ? (p ? p.color : WHITE) : color;
    return this.allLegalMoves(col).filter(function (m) { return m.from.row === pos.row && m.from.col === pos.col; });
  };
  // Zug anhand von UCI-Text ('e2e4', 'e7e8q') unter den legalen Zuegen finden (ohne Umwandlungsbuchstaben: Dame)
  ChessBoard.prototype.findMoveByUci = function (uci, color) {
    var parts = K.uciToMoveParts(uci);
    if (!parts) return null;
    var legal = this.allLegalMoves(color);
    var want = parts.promotion || null;
    for (var i = 0; i < legal.length; i++) {
      var m = legal[i];
      if (m.from.row === parts.from.row && m.from.col === parts.from.col && m.to.row === parts.to.row && m.to.col === parts.to.col) {
        if (m.promotion) { if (m.promotion === (want || QUEEN)) return m; }
        else return m;
      }
    }
    return null;
  };
  // Anzahl Figuren auf dem Brett
  ChessBoard.prototype.pieceCount = function () {
    var n = 0;
    for (var r = 0; r < 8; r++) for (var c = 0; c < 8; c++) if (this.grid[r][c]) n++;
    return n;
  };

  // ---------- Serialisierung (fuer Web-Worker / Speichern) ----------
  // 64 Zahlen: 0 = leer, sonst type + 8*color + 16*hasMoved
  ChessBoard.prototype.toObject = function () {
    var cells = new Array(64);
    for (var r = 0; r < 8; r++) for (var c = 0; c < 8; c++) {
      var p = this.grid[r][c];
      cells[r * 8 + c] = p ? p.type + 8 * p.color + (p.hasMoved ? 16 : 0) : 0;
    }
    return { cells: cells, ep: this.enPassantTarget ? [this.enPassantTarget.row, this.enPassantTarget.col] : null, half: this.halfMoveClock, full: this.fullMoveNumber };
  };
  ChessBoard.fromObject = function (o) {
    var b = new ChessBoard();
    for (var i = 0; i < 64; i++) {
      var v = o.cells[i];
      b.grid[i >> 3][i & 7] = v ? P((v >> 3) & 1, v & 7, (v & 16) !== 0) : null;
    }
    b.enPassantTarget = o.ep ? { row: o.ep[0], col: o.ep[1] } : null;
    b.halfMoveClock = o.half | 0;
    b.fullMoveNumber = o.full | 0;
    return b;
  };

  K.ChessBoard = ChessBoard;
  K.Brett = ChessBoard;
});
