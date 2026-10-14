/* GENERIERT (node _werkzeug/buendeln.js): alle Schach-Kern-Module in einer Datei. Nicht von Hand aendern. */

/* ===== modelle.js ===== */
/* Schach-Kern: Modelle, Notation, Hunde-Team, Zufall, Formatierung.
   Uebersetzung von SchachSpiel.swift (Chess Models, Notation-Helfer, Artikel-Erweiterung, Hunde-Team-Namen).
   UMD: Browser -> window.SchachKern, Node -> require('./modelle.js'). Keine DOM-Zugriffe (Web-Worker-tauglich). */
(function (root, factory) {
  var K;
  if (typeof module === 'object' && module.exports) { K = require('./namespace.js'); factory(K); module.exports = K; }
  else { K = root.SchachKern = root.SchachKern || {}; factory(K); }
})(typeof self !== 'undefined' ? self : this, function (K) {
  'use strict';

  // ---------- Figurentypen (Swift: ChessPieceType, rawValue 1...6) ----------
  var PieceType = { pawn: 1, knight: 2, bishop: 3, rook: 4, queen: 5, king: 6 };
  K.PieceType = PieceType;
  K.ChessPieceType = PieceType;
  K.PieceTypes = [1, 2, 3, 4, 5, 6];

  var VALUES = [0, 100, 320, 330, 500, 900, 20000];
  var SYMBOLS = ['', 'B', 'S', 'L', 'T', 'D', 'K'];
  var NAMES = ['', 'Bauer', 'Springer', 'Laeufer', 'Turm', 'Dame', 'Koenig'];

  // ---------- Farben (Swift: PlayerColor white=0, black=1) ----------
  var Color = {
    white: 0, black: 1,
    opposite: function (c) { return c === 0 ? 1 : 0; },
    displayName: function (c) { return c === 0 ? 'Weiss' : 'Schwarz'; }
  };
  K.PlayerColor = Color;
  K.Color = Color;

  // ---------- Spielmodi / Ergebnis ----------
  K.GameMode = { playerVsComputer: 'playerVsComputer', playerVsPlayer: 'playerVsPlayer', tutorial: 'tutorial', academy: 'academy' };
  K.GameResult = {
    ongoing: function () { return { kind: 'ongoing', winner: null }; },
    checkmate: function (winner) { return { kind: 'checkmate', winner: winner }; },
    stalemate: function () { return { kind: 'stalemate', winner: null }; },
    draw: function () { return { kind: 'draw', winner: null }; }
  };

  // ---------- Position / Zug ----------
  function Position(row, col) { return { row: row, col: col }; }
  K.Position = Position;
  K.samePos = function (a, b) { return !!a && !!b && a.row === b.row && a.col === b.col; };
  K.posKey = function (p) { return p.row * 8 + p.col; };

  // Swift: ChessMove(from:to:capturedPiece:promotion:isCastling:isEnPassant:)
  function makeMove(from, to, o) {
    o = o || {};
    return {
      from: from, to: to,
      capturedPiece: o.capturedPiece || null,
      promotion: o.promotion || null,
      isCastling: !!o.isCastling,
      isEnPassant: !!o.isEnPassant
    };
  }
  K.makeMove = makeMove;
  // Swift: ChessMove.== vergleicht NUR from, to, promotion
  K.moveEq = function (a, b) {
    return !!a && !!b && a.from.row === b.from.row && a.from.col === b.from.col &&
      a.to.row === b.to.row && a.to.col === b.to.col && (a.promotion || null) === (b.promotion || null);
  };
  K.makePiece = function (color, type, hasMoved) { return { color: color, type: type, hasMoved: !!hasMoved }; };

  // ---------- Notation (Swift: posToAlgebraic, moveToAlgebraic, moveToUci) ----------
  function posToAlgebraic(p) { return String.fromCharCode(97 + p.col) + (8 - p.row); }
  function moveToAlgebraic(m) { return posToAlgebraic(m.from) + posToAlgebraic(m.to); }
  function moveToUci(m) {
    var s = posToAlgebraic(m.from) + posToAlgebraic(m.to);
    switch (m.promotion) {
      case 5: s += 'q'; break;
      case 4: s += 'r'; break;
      case 3: s += 'b'; break;
      case 2: s += 'n'; break;
    }
    return s;
  }
  // Neu (fuer die Oberflaeche): 'e4' -> {row,col}; null bei ungueltig
  function algebraicToPos(s) {
    if (typeof s !== 'string' || s.length < 2) return null;
    var c = s.charCodeAt(0) - 97, r = parseInt(s.charAt(1), 10);
    if (!(c >= 0 && c < 8) || !(r >= 1 && r <= 8)) return null;
    return { row: 8 - r, col: c };
  }
  var PROMO_LETTER = { q: 5, r: 4, b: 3, n: 2 };
  // 'e7e8q' -> { from, to, promotion } (ohne Regelpruefung; null bei ungueltig)
  function uciToMoveParts(u) {
    if (typeof u !== 'string' || u.length < 4) return null;
    var f = algebraicToPos(u.substr(0, 2)), t = algebraicToPos(u.substr(2, 2));
    if (!f || !t) return null;
    return { from: f, to: t, promotion: u.length >= 5 ? (PROMO_LETTER[u.charAt(4).toLowerCase()] || null) : null };
  }
  K.posToAlgebraic = posToAlgebraic;
  K.moveToAlgebraic = moveToAlgebraic;
  K.moveToUci = moveToUci;
  K.algebraicToPos = algebraicToPos;
  K.uciToMoveParts = uciToMoveParts;
  K.Notation = { posToAlgebraic: posToAlgebraic, moveToAlgebraic: moveToAlgebraic, moveToUci: moveToUci, algebraicToPos: algebraicToPos, uciToMoveParts: uciToMoveParts, colLetter: function (c) { return String.fromCharCode(97 + c); } };

  // ---------- Figuren-Stil / Hunde-Team ----------
  // Swift: PieceStyle (klassisch | Marken-Team) + Piece3DFactory.dogMode/active3D.
  // Das Marken-Team (geschuetzte Serie) wurde NICHT uebernommen: Stattdessen ueberall das eigene Hunde-Team (Bruno, Luna, Brocken, Wurzel, Falko, Welpen).
  var DOG_NAMES = ['', 'Welpe', 'Falko', 'Wurzel', 'Brocken', 'Luna', 'Bruno'];
  var DOG_BREEDS = ['', 'Welpe', 'Schaeferhund', 'Dackel', 'Bulldogge', 'Windhund', 'Bernhardiner'];
  var Stil = {
    hunde: false,                       // true = Anzeigenamen wie "Bruno (Koenig)"
    setzeHunde: function (an) { Stil.hunde = !!an; },
    dogName: function (t) { return DOG_NAMES[t]; },
    dogBreed: function (t) { return DOG_BREEDS[t]; }
  };
  K.Stil = Stil;
  K.HundeTeam = {
    dogName: Stil.dogName, dogBreed: Stil.dogBreed,
    // Emoji-Glyphen frei gewaehlt (eigenes Team, kein Markenbezug)
    glyph: function (t) { return ['', '🐶', '🐕‍🦺', '🐾', '🐩', '🦮', '🐕'][t]; },
    teamName: 'Hunde-Team'
  };

  // ---------- Figuren-Texte (Swift: extension ChessPieceType) ----------
  function name(t) { return NAMES[t]; }
  function displayName(t) { return Stil.hunde ? (DOG_NAMES[t] + ' (' + NAMES[t] + ')') : NAMES[t]; }
  function isFem(t) { return t === 5; }
  var Piece = {
    value: function (t) { return VALUES[t]; },
    symbol: function (t) { return SYMBOLS[t]; },
    name: name,
    displayName: displayName,
    isFeminine: isFem,
    derName: function (t) { return (isFem(t) ? 'die ' : 'der ') + displayName(t); },
    denName: function (t) { return (isFem(t) ? 'die ' : 'den ') + displayName(t); },
    vomName: function (t) { return (isFem(t) ? 'von der ' : 'vom ') + displayName(t); },
    deinNom: function (t) { return (isFem(t) ? 'deine ' : 'dein ') + displayName(t); },
    deinAkk: function (t) { return (isFem(t) ? 'deine ' : 'deinen ') + displayName(t); },
    pronoun: function (t) { return isFem(t) ? 'sie' : 'er'; },
    // Unicode-Schachfiguren (gefuellte Symbole, Farbe per CSS)
    unicode: function (t) { return ['', '♟', '♞', '♝', '♜', '♛', '♚'][t]; }
  };
  K.Piece = Piece;

  // Swift: cap1 - ersten Buchstaben gross
  K.cap1 = function (s) { return s.charAt(0).toUpperCase() + s.slice(1); };

  // ---------- Zufall (ersetzt Int.random; fuer Tests mit festem Samen ersetzbar) ----------
  var Zufall = {
    fn: Math.random,
    ganz: function (n) { return Math.floor(Zufall.fn() * n); },       // 0..<n
    samen: function (seed) {                                           // deterministisch (mulberry32)
      var a = seed >>> 0;
      Zufall.fn = function () {
        a = (a + 0x6D2B79F5) >>> 0;
        var t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    },
    zuruecksetzen: function () { Zufall.fn = Math.random; }
  };
  K.Zufall = Zufall;

  // ---------- printf-aehnliche Formatierung wie Swift String(format:) ("%.1f", "%+.1f", "%.0f") ----------
  // C rundet exakte Halbwerte zur geraden Ziffer (1.25 -> "1.2"), JS toFixed auf (1.3). Hier C-Verhalten.
  function fmtFix(v, d, plus) {
    var neg = v < 0 || (v === 0 && 1 / v < 0);
    var a = Math.abs(v);
    var s = a.toFixed(d);
    var long = a.toFixed(Math.min(100, d + 40));
    var tail = long.slice(long.length - 40);
    if (tail.charAt(0) === '5' && /^50*$/.test(tail)) {              // exakter Halbwert
      var trunc = long.slice(0, long.length - 40);
      if (trunc.charAt(trunc.length - 1) === '.') trunc = trunc.slice(0, -1);
      var lastDigit = parseInt(trunc.charAt(trunc.length - 1), 10);
      if (lastDigit % 2 === 0) s = trunc;                            // abrunden auf gerade
    }
    return (neg ? '-' : (plus ? '+' : '')) + s;
  }
  K.fmtFix = fmtFix;
});


/* ===== brett.js ===== */
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


/* ===== profile.js ===== */
/* Schach-Kern: Spielerprofile (Swift: LessonProgress, PlayerProfile, PlayerProfileStore).
   Speicher: localStorage statt Application-Support-Datei; jeder Zugriff in try/catch, Fallback = Arbeitsspeicher.
   Profile sind einfache Objekte; wie Swift-Structs werden Kopien herausgegeben (aendern -> update() aufrufen). */
(function (root, factory) {
  var K;
  if (typeof module === 'object' && module.exports) { require('./modelle.js'); K = require('./namespace.js'); factory(K); module.exports = K; }
  else { K = root.SchachKern = root.SchachKern || {}; factory(K); }
})(typeof self !== 'undefined' ? self : this, function (K) {
  'use strict';

  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  K.LessonProgress = function (o) {
    o = o || {};
    return { completed: !!o.completed, attempts: o.attempts | 0, stars: o.stars | 0 };   // stars: 3 = 1. Versuch, 2 = 2.-3., 1 = spaeter
  };
  K.PlayerProfile = function (name) {
    return { name: name, createdAt: new Date().toISOString(), lessonProgress: {}, lastLevel: 1, gamesPlayed: 0 };
  };
  K.profileTotalStars = function (p) {
    var n = 0, lp = p.lessonProgress || {};
    for (var k in lp) if (Object.prototype.hasOwnProperty.call(lp, k)) n += lp[k].stars | 0;
    return n;
  };

  var KEY = 'schach.spielerprofile.v1';

  function defaultStorage() {
    try { if (typeof localStorage !== 'undefined' && localStorage) return localStorage; } catch (e) { /* gesperrt */ }
    return null;
  }

  // opts: { storage: {getItem,setItem}, key: 'name' }
  function PlayerProfileStore(opts) {
    opts = opts || {};
    this.key = opts.key || KEY;
    this._storage = opts.storage === undefined ? defaultStorage() : opts.storage;
    this._mem = null;            // Fallback, wenn Speicher fehlt/blockiert ist
    this.profiles = [];
    this.persistFailed = false;
    this.load();
  }

  PlayerProfileStore.prototype.load = function () {
    var raw = null;
    try { raw = this._storage ? this._storage.getItem(this.key) : null; } catch (e) { raw = null; this._storage = null; }
    if (raw === null || raw === undefined) raw = this._mem;
    if (!raw) return;
    try {
      var list = JSON.parse(raw);
      if (Array.isArray(list)) this.profiles = list.filter(function (p) { return p && typeof p.name === 'string'; });
    } catch (e) { /* kaputte Daten: leer lassen wie Swift (try? decode) */ }
  };

  PlayerProfileStore.prototype.persist = function () {
    var raw = JSON.stringify(this.profiles);
    this._mem = raw;
    try {
      if (this._storage) { this._storage.setItem(this.key, raw); this.persistFailed = false; }
      else this.persistFailed = true;
    } catch (e) { this.persistFailed = true; }
  };

  function same(a, b) { return String(a).toLowerCase() === String(b).toLowerCase(); }

  PlayerProfileStore.prototype.profile = function (name) {   // Swift: profile(named:)
    for (var i = 0; i < this.profiles.length; i++) if (same(this.profiles[i].name, name)) return clone(this.profiles[i]);
    return null;
  };
  PlayerProfileStore.prototype.profileNamed = PlayerProfileStore.prototype.profile;

  PlayerProfileStore.prototype.createOrGet = function (name) {
    var clean = String(name === undefined || name === null ? '' : name).trim();
    var existing = this.profile(clean);
    if (existing) return existing;
    var p = K.PlayerProfile(clean === '' ? 'Spieler' : clean);
    this.profiles.push(p);
    this.persist();
    return clone(p);
  };

  PlayerProfileStore.prototype.update = function (profile) {
    var c = clone(profile), found = false;
    for (var i = 0; i < this.profiles.length; i++) {
      if (same(this.profiles[i].name, c.name)) { this.profiles[i] = c; found = true; break; }
    }
    if (!found) this.profiles.push(c);
    this.persist();
  };

  PlayerProfileStore.prototype.removeProfile = function (name) {   // Swift: removeProfile(named:)
    this.profiles = this.profiles.filter(function (p) { return !same(p.name, name); });
    this.persist();
  };
  PlayerProfileStore.prototype.removeProfileNamed = PlayerProfileStore.prototype.removeProfile;

  PlayerProfileStore.prototype.names = function () { return this.profiles.map(function (p) { return p.name; }); };

  var shared = null;
  Object.defineProperty(PlayerProfileStore, 'shared', {
    get: function () { if (!shared) shared = new PlayerProfileStore(); return shared; }
  });

  K.PlayerProfileStore = PlayerProfileStore;
});


/* ===== daten_akademie.js ===== */
/* GENERIERT von _werkzeug/swift_daten_konverter.py aus SchachSpiel.swift (Texte woertlich uebernommen). Nicht von Hand aendern. */
(function (root, factory) {
  var K;
  if (typeof module === 'object' && module.exports) { K = require('./namespace.js'); factory(K); module.exports = K; }
  else { K = root.SchachKern = root.SchachKern || {}; factory(K); }
})(typeof self !== 'undefined' ? self : this, function (K) {
  'use strict';
  K.Daten = K.Daten || {};
  K.Daten.levelInfo = [
    {name: "Stufe 1 · Kinderstufe", subtitle: "Die Figuren kennenlernen – wie zieht was?"},
    {name: "Stufe 2 · Schlagen & Werte", subtitle: "Figuren schlagen und ihren Wert kennen"},
    {name: "Stufe 3 · Schach!", subtitle: "Schach geben und Schach abwehren"},
    {name: "Stufe 4 · Matt in 1", subtitle: "Die wichtigsten Mattbilder"},
    {name: "Stufe 5 · Spezialregeln", subtitle: "Rochade, en passant, Umwandlung, Patt"},
    {name: "Stufe 6 · Taktik I", subtitle: "Gabel, Fesselung, Spiess"},
    {name: "Stufe 7 · Taktik II", subtitle: "Abzugsschach, Doppelangriff, Matt in 2"},
    {name: "Stufe 8 · Eroeffnung", subtitle: "Zentrum, Entwicklung, Rochade"},
    {name: "Stufe 9 · Endspiel & Strategie", subtitle: "Opposition, Freibauern, Turmtechnik"},
    {name: "Stufe 10 · Meisterstufe", subtitle: "Beruehmte Kombinationen & Meisterpruefung"}
  ];
  K.Daten.unlockQuote = 0.7;
  K.Daten.lessons = [
    {id: "L1-1", level: 1, title: "Der Bauer", teach: "Der Bauer ist der kleinste Kaempfer. Er zieht immer 1 Feld geradeaus. Nur bei seinem allerersten Zug darf er 2 Felder auf einmal ziehen!", fen: "7k/8/8/8/8/8/4P3/7K", prompt: "Ziehe den Bauern 2 Felder vor: von e2 nach e4!", solutions: ["e2e4"], hint: "Klicke den Bauern auf e2 an, dann das Feld e4 (2 Felder weiter oben).", successText: "Super! Der Bauern-Doppelschritt geht nur vom Startfeld aus. Danach zieht er immer nur 1 Feld.", failText: "Fast! Der Bauer sollte von e2 genau nach e4 ziehen. Versuch es nochmal!", freePlayMoves: 0, freePlayAI: 3, winByMate: false},
    {id: "L1-2", level: 1, title: "Der Turm", teach: "Der Turm ist stark wie eine Burg! Er zieht gerade: nach vorn, hinten, links und rechts – so weit er will.", fen: "7k/8/8/8/8/8/8/R6K", prompt: "Ziehe den Turm von a1 gerade nach oben auf a5!", solutions: ["a1a5"], hint: "Der Turm steht links unten auf a1. Klicke ihn an und dann das Feld a5.", successText: "Klasse! Der Turm ist etwa 5 Punkte wert – nur die Dame ist wertvoller.", failText: "Der Turm zieht nur gerade Linien. Ziehe ihn von a1 nach a5.", freePlayMoves: 0, freePlayAI: 3, winByMate: false},
    {id: "L1-3", level: 1, title: "Der Laeufer", teach: "Der Laeufer zieht schraeg (diagonal) – so weit er will. Er bleibt sein Leben lang auf seiner Feldfarbe!", fen: "7k/8/8/8/8/8/8/2B4K", prompt: "Ziehe den Laeufer diagonal von c1 nach g5!", solutions: ["c1g5"], hint: "Diagonal heisst schraeg: c1 → d2 → e3 → f4 → g5.", successText: "Prima! Merke: Zwei Laeufer zusammen sind ein starkes Team, weil sie beide Feldfarben abdecken.", failText: "Der Laeufer zieht nur schraeg. Von c1 gibt es einen schraegen Weg nach g5.", freePlayMoves: 0, freePlayAI: 3, winByMate: false},
    {id: "L1-4", level: 1, title: "Der Springer", teach: "Der Springer ist der einzige, der springen kann! Er zieht in L-Form: 2 Felder gerade + 1 Feld zur Seite.", fen: "7k/8/8/8/8/8/8/6NK", prompt: "Ziehe den Springer in L-Form von g1 nach f3!", solutions: ["g1f3"], hint: "Von g1: 2 Felder hoch, 1 nach links = f3.", successText: "Toll! Der Springer darf ueber andere Figuren springen – das kann sonst niemand!", failText: "Denk an das L: 2 Felder in eine Richtung, dann 1 zur Seite. Von g1 nach f3.", freePlayMoves: 0, freePlayAI: 3, winByMate: false},
    {id: "L1-5", level: 1, title: "Die Dame", teach: "Die Dame ist die staerkste Figur! Sie kann gerade UND schraeg ziehen – wie Turm und Laeufer zusammen. Sie ist 9 Punkte wert.", fen: "7k/8/8/8/8/8/8/3Q3K", prompt: "Ziehe die Dame von d1 gerade nach oben auf d5!", solutions: ["d1d5"], hint: "Die Dame steht auf d1. Klicke sie an und dann d5.", successText: "Wunderbar! Aber Vorsicht: Weil die Dame so wertvoll ist, darf man sie nicht leichtsinnig verlieren.", failText: "Ziehe die Dame von d1 nach d5 – das ist eine gerade Linie nach oben.", freePlayMoves: 0, freePlayAI: 3, winByMate: false},
    {id: "L1-6", level: 1, title: "Der Koenig", teach: "Der Koenig ist die wichtigste Figur – verliert er, ist das Spiel vorbei! Er zieht nur 1 Feld in jede Richtung.", fen: "7k/8/8/8/8/8/8/4K3", prompt: "Ziehe den Koenig 1 Feld vor: von e1 nach e2!", solutions: ["e1e2"], hint: "Der Koenig macht kleine Schritte: nur 1 Feld. Von e1 nach e2.", successText: "Sehr gut! Der Koenig muss immer beschuetzt werden – er darf niemals geschlagen werden koennen.", failText: "Der Koenig zieht nur 1 Feld weit. Ziehe ihn von e1 nach e2.", freePlayMoves: 0, freePlayAI: 3, winByMate: false},
    {id: "L2-1", level: 2, title: "Schlagen macht stark", teach: "Figurenwerte: Bauer 1, Springer 3, Laeufer 3, Turm 5, Dame 9. Wenn du eine gegnerische Figur schlaegst, gehoert ihr Feld dir!", fen: "7k/8/8/q7/8/8/8/R6K", prompt: "Die schwarze Dame steht ungeschuetzt! Schlage sie mit deinem Turm!", solutions: ["a1a5"], hint: "Dein Turm auf a1 und die Dame auf a5 stehen auf derselben Linie...", successText: "9 Punkte gewonnen! Immer pruefen: Steht eine gegnerische Figur ungeschuetzt im Weg?", failText: "Der Turm kann die Dame auf a5 direkt schlagen – gleiche Linie!", freePlayMoves: 0, freePlayAI: 3, winByMate: false},
    {id: "L2-2", level: 2, title: "Den besten Fang waehlen", teach: "Wenn du mehrere Figuren schlagen kannst, nimm die wertvollste! Ein Turm (5) ist mehr wert als ein Bauer (1).", fen: "7k/8/3r1p2/8/4N3/8/8/7K", prompt: "Dein Springer kann zwei Figuren schlagen. Nimm die wertvollere!", solutions: ["e4d6"], hint: "Turm = 5 Punkte, Bauer = 1 Punkt. Der Turm steht auf d6.", successText: "Richtig! Turm (5 Punkte) schlaegt Bauer (1 Punkt). Immer den Wert vergleichen!", failText: "Der Bauer bringt nur 1 Punkt. Der Turm auf d6 bringt 5!", freePlayMoves: 0, freePlayAI: 3, winByMate: false},
    {id: "L2-3", level: 2, title: "Der Bauer schlaegt schraeg", teach: "Achtung, Besonderheit: Der Bauer ZIEHT gerade, aber er SCHLAEGT schraeg – 1 Feld diagonal nach vorn!", fen: "7k/8/8/3p1r2/4P3/8/8/7K", prompt: "Dein Bauer kann schraeg links oder schraeg rechts schlagen. Nimm die wertvollere Figur!", solutions: ["e4f5"], hint: "Links steht ein Bauer (1), rechts ein Turm (5). Schlage schraeg nach rechts!", successText: "Perfekt! Bauer schlaegt diagonal – und du hast den wertvollen Turm erwischt!", failText: "Der Bauer schlaegt schraeg. Der Turm auf f5 ist wertvoller als der Bauer auf d5.", freePlayMoves: 0, freePlayAI: 3, winByMate: false},
    {id: "L2-4", level: 2, title: "Gedeckt oder ungedeckt?", teach: "Bevor du schlaegst, schau genau hin: Wird die Figur verteidigt (gedeckt)? Wenn ja, schlaegt der Gegner zurueck!", fen: "k7/8/4p3/3n3b/8/8/8/3Q3K", prompt: "Springer oder Laeufer? Eine der beiden Figuren ist gedeckt. Schlage die UNGEDECKTE!", solutions: ["d1h5"], hint: "Der Springer d5 wird vom Bauern e6 gedeckt. Der Laeufer h5 ist allein...", successText: "Exzellent! Der Springer war vom Bauern gedeckt – die Dame haette man zurueckgeschlagen. Der Laeufer war gratis!", failText: "Vorsicht: Der Bauer auf e6 deckt den Springer! Nimm lieber den ungedeckten Laeufer auf h5.", freePlayMoves: 0, freePlayAI: 3, winByMate: false},
    {id: "L3-1", level: 3, title: "Schach geben", teach: "Schach heisst: Der Koenig wird angegriffen! Der Gegner MUSS sofort reagieren. Sag beim Spielen ruhig laut 'Schach!'", fen: "4k3/8/8/8/8/8/8/R6K", prompt: "Gib dem schwarzen Koenig Schach mit deinem Turm!", solutions: ["a1a8", "a1e1"], hint: "Der Turm muss auf eine Linie oder Reihe mit dem Koenig (e8) ziehen.", successText: "Schach! Der Koenig ist angegriffen und muss reagieren. So setzt man den Gegner unter Druck!", failText: "Der Turm gibt Schach, wenn er auf derselben Linie wie der Koenig steht: Reihe 8 oder e-Linie.", freePlayMoves: 0, freePlayAI: 3, winByMate: false},
    {id: "L3-2", level: 3, title: "Schach abwehren: Wegziehen", teach: "Gegen Schach gibt es 3 Rezepte: 1) Koenig wegziehen, 2) eine Figur dazwischenstellen, 3) den Angreifer schlagen.", fen: "4r2k/8/8/8/8/8/8/4K3", prompt: "Dein Koenig steht im Schach! Ziehe ihn aus der Gefahrenzone!", solutions: ["e1d1", "e1d2", "e1f1", "e1f2"], hint: "Der Turm greift die ganze e-Linie an. Der Koenig muss die e-Linie verlassen!", successText: "Gerettet! Rezept 1: Wegziehen. Der Koenig darf nie auf einem angegriffenen Feld stehen bleiben.", failText: "Der Koenig muss weg von der e-Linie – der schwarze Turm greift sie komplett an!", freePlayMoves: 0, freePlayAI: 3, winByMate: false},
    {id: "L3-3", level: 3, title: "Schach abwehren: Blocken", teach: "Rezept 2 gegen Schach: Stelle eine eigene Figur dazwischen! Sie faengt den Angriff ab wie ein Schild.", fen: "4r2k/8/8/8/8/8/8/2B1K3", prompt: "Dein Koenig steht im Schach. Blocke das Schach mit deinem Laeufer!", solutions: ["c1e3"], hint: "Der Laeufer kann diagonal auf die e-Linie springen: c1 → d2 → e3.", successText: "Stark! Der Laeufer ist jetzt ein Schutzschild. Blocken geht nur bei Angriffen aus der Ferne.", failText: "Der Laeufer muss zwischen Turm und Koenig: Das Feld e3 blockt die e-Linie.", freePlayMoves: 0, freePlayAI: 3, winByMate: false},
    {id: "L3-4", level: 3, title: "Schach abwehren: Schlagen", teach: "Rezept 3 gegen Schach: Schlage den Angreifer einfach! Das ist oft die beste Loesung.", fen: "7k/8/8/8/8/8/R3q3/4K3", prompt: "Die schwarze Dame gibt Schach. Schlage sie!", solutions: ["a2e2", "e1e2"], hint: "Dein Turm auf a2 (oder dein Koenig!) kann die Dame auf e2 schlagen.", successText: "Angreifer beseitigt! Und du hast sogar 9 Punkte gewonnen. Doppelter Erfolg!", failText: "Die Dame auf e2 kann geschlagen werden: mit dem Turm von a2 oder mit dem Koenig.", freePlayMoves: 0, freePlayAI: 3, winByMate: false},
    {id: "L4-1", level: 4, title: "Grundreihenmatt", teach: "Das Grundreihenmatt: Der Koenig ist hinter seinen eigenen Bauern gefangen. Ein Turm auf der Grundreihe = Matt! (Fischer: 'Schaffe deinem Koenig ein Luftloch!')", fen: "6k1/5ppp/8/8/8/8/8/R5K1", prompt: "Setze Matt in 1 Zug!", solutions: ["a1a8"], hint: "Die 8. Reihe ist frei – und der Koenig kann nicht entkommen, seine eigenen Bauern stehen im Weg!", successText: "SCHACHMATT! Das Grundreihenmatt ist eine der haeufigsten Mattarten. Denk daran, wenn dein eigener Koenig so steht!", failText: "Der Turm muss auf die 8. Reihe: a8! Dort gibt er Schach, und der Koenig hat keinen Fluchtweg.", freePlayMoves: 0, freePlayAI: 3, winByMate: false},
    {id: "L4-2", level: 4, title: "Das Damenmatt", teach: "Die Dame setzt matt, wenn sie direkt neben dem Koenig steht und selbst geschuetzt ist – z.B. von deinem Koenig!", fen: "3k4/Q7/3K4/8/8/8/8/8", prompt: "Setze Matt in 1 Zug mit der Dame!", solutions: ["a7d7"], hint: "Die Dame muss direkt vor den schwarzen Koenig – dein eigener Koenig deckt sie.", successText: "SCHACHMATT! Die Dame nimmt dem Koenig alle Felder, dein Koenig beschuetzt die Dame. Perfektes Teamwork!", failText: "Ziehe die Dame nach d7: direkt vor den Koenig, gedeckt von deinem Koenig auf d6.", freePlayMoves: 0, freePlayAI: 3, winByMate: false},
    {id: "L4-3", level: 4, title: "Das Treppenmatt", teach: "Zwei Tuerme setzen matt wie eine Treppe: Einer sperrt eine Reihe, der andere gibt auf der naechsten Reihe Schach!", fen: "3k4/R7/8/8/8/8/8/1R5K", prompt: "Ein Turm sperrt schon die 7. Reihe. Setze Matt in 1 Zug!", solutions: ["b1b8"], hint: "Der Turm auf a7 sperrt die 7. Reihe. Der andere Turm muss auf die 8. Reihe!", successText: "SCHACHMATT! Das Treppenmatt (auch Rasenmaeher-Matt genannt) – zwei Tuerme sind ein unschlagbares Team!", failText: "Der b1-Turm muss nach b8: Schach auf der 8. Reihe, und die 7. Reihe ist schon gesperrt!", freePlayMoves: 0, freePlayAI: 3, winByMate: false},
    {id: "L4-4", level: 4, title: "Das erstickte Matt", teach: "Das erstickte Matt: Der Koenig wird von seinen EIGENEN Figuren eingesperrt – und nur ein Springer kommt an ihn heran! (Fischer nannte es das schoenste Matt.)", fen: "6rk/6pp/8/6N1/8/8/8/6K1", prompt: "Der schwarze Koenig ist von eigenen Figuren umzingelt. Setze Matt mit dem Springer!", solutions: ["g5f7"], hint: "Der Springer springt in L-Form von g5... welches Feld greift h8 an?", successText: "SCHACHMATT! Das erstickte Matt! Der Koenig erstickt an seinen eigenen Figuren – nur der springende Springer kommt durch.", failText: "Von g5 nach f7 – von dort greift der Springer h8 an, und der Koenig kann nirgendwohin!", freePlayMoves: 0, freePlayAI: 3, winByMate: false},
    {id: "L4-5", level: 4, title: "Das Schaefermatt (Vorsicht!)", teach: "Das Schaefermatt gewinnt in 4 Zuegen gegen Unaufmerksame: Dame und Laeufer greifen gemeinsam f7 an – den schwaechsten Punkt! Lerne es, um es zu VERMEIDEN.", fen: "r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR", prompt: "Weiss am Zug: Vollende das Schaefermatt!", solutions: ["h5f7"], hint: "Dame und Laeufer zielen beide auf dasselbe Feld neben dem Koenig...", successText: "SCHACHMATT auf f7! Merke zur Verteidigung: Bei fruehen Damenausfluegen immer f7/f2 im Auge behalten!", failText: "Die Dame schlaegt auf f7 – gedeckt vom Laeufer c4. Das ist das beruehmte Schaefermatt.", freePlayMoves: 0, freePlayAI: 3, winByMate: false},
    {id: "L5-1", level: 5, title: "Die kurze Rochade", teach: "Die Rochade: Der einzige Zug, bei dem 2 Figuren gleichzeitig ziehen! Koenig 2 Felder zum Turm, Turm springt auf die andere Seite. Bedingungen: Beide noch nie gezogen, nichts dazwischen, kein Schach auf dem Weg.", fen: "4k3/8/8/8/8/8/8/4K2R", prompt: "Fuehre die kurze Rochade aus: Klicke den Koenig und dann g1!", solutions: ["e1g1"], hint: "Klicke den Koenig auf e1 an, dann das Feld g1 (2 Felder Richtung Turm).", successText: "Rochade! Dein Koenig ist in Sicherheit und der Turm ist aktiviert. Rochiere in echten Partien FRUEH!", failText: "Fuer die kurze Rochade zieht der Koenig von e1 genau 2 Felder nach rechts auf g1.", freePlayMoves: 0, freePlayAI: 3, winByMate: false},
    {id: "L5-2", level: 5, title: "Die lange Rochade", teach: "Es gibt auch die LANGE Rochade zur anderen Seite: Koenig nach c1, Turm von a1 nach d1. Sie ist mutiger – der Koenig steht etwas offener.", fen: "4k3/8/8/8/8/8/8/R3K3", prompt: "Fuehre die lange Rochade aus: Koenig nach c1!", solutions: ["e1c1"], hint: "Klicke den Koenig auf e1 an, dann das Feld c1 (2 Felder Richtung a1-Turm).", successText: "Lange Rochade! Wird oft fuer Angriffsplaene genutzt: Der Turm steht sofort aktiv auf d1.", failText: "Bei der langen Rochade zieht der Koenig von e1 zwei Felder nach LINKS auf c1.", freePlayMoves: 0, freePlayAI: 3, winByMate: false},
    {id: "L5-3", level: 5, title: "En passant – im Vorbeigehen", teach: "En passant (franzoesisch: 'im Vorbeigehen'): Zieht ein gegnerischer Bauer 2 Felder und landet NEBEN deinem Bauern, darfst du ihn schlagen, als waere er nur 1 Feld gezogen – aber nur SOFORT im naechsten Zug!", fen: "7k/8/8/3pP3/8/8/8/7K w d6", prompt: "Schwarz zog gerade d7-d5. Schlage den Bauern en passant!", solutions: ["e5d6"], hint: "Dein Bauer e5 schlaegt schraeg nach d6 – und der schwarze Bauer auf d5 verschwindet!", successText: "En passant! Der schwarze Bauer wollte vorbeischleichen – aber du hast ihn im Vorbeigehen erwischt!", failText: "Schlage schraeg nach d6 (nicht d5!) – genau das ist der Trick beim En-passant-Schlag.", freePlayMoves: 0, freePlayAI: 3, winByMate: false},
    {id: "L5-4", level: 5, title: "Die Umwandlung", teach: "Erreicht ein Bauer die letzte Reihe, verwandelt er sich! Meistens waehlt man die Dame – aus dem kleinsten Kaempfer wird die staerkste Figur!", fen: "7k/4P3/8/8/8/8/8/7K", prompt: "Ziehe den Bauern auf die letzte Reihe und verwandle ihn in eine Dame!", solutions: ["e7e8q"], hint: "Ziehe den Bauern von e7 nach e8 – dann darfst du eine neue Figur waehlen. Nimm die Dame!", successText: "Verwandlung! Aus Bauer wird Dame. Deshalb sind Freibauern im Endspiel Gold wert!", failText: "Ziehe den Bauern nach e8 und waehle die Dame – die staerkste Wahl!", freePlayMoves: 0, freePlayAI: 3, winByMate: false},
    {id: "L5-5", level: 5, title: "Patt vermeiden – Matt setzen!", teach: "PATT ist die Falle am Schluss: Der Gegner hat KEINEN legalen Zug, steht aber NICHT im Schach → nur Remis! Mit grossem Vorteil musst du sauber mattsetzen.", fen: "k7/8/1K6/8/8/8/7Q/8", prompt: "Vorsicht, Patt-Gefahr! Setze sauber Matt in 1 Zug!", solutions: ["h2h8"], hint: "Die Dame muss SCHACH geben, waehrend dein Koenig die Fluchtfelder nimmt. Die 8. Reihe...", successText: "SCHACHMATT – kein Patt! Merke: Vor jedem Zug im Endspiel pruefen, ob der Gegner noch Zuege hat.", failText: "Dame nach h8: Schach auf der 8. Reihe! Dein Koenig auf b6 bewacht a7 und b7 – Matt!", freePlayMoves: 0, freePlayAI: 3, winByMate: false},
    {id: "L6-1", level: 6, title: "Die Springergabel", teach: "Die Gabel: EINE Figur greift ZWEI an! Der Springer ist der Gabel-Meister – sein L-Zug wird oft uebersehen. (Pachman: 'Der Doppelangriff ist das haeufigste Gewinnmotiv.')", fen: "r3k3/8/8/3N4/8/8/8/4K3", prompt: "Gabele Koenig und Turm mit deinem Springer!", solutions: ["d5c7"], hint: "Suche das Feld, von dem der Springer GLEICHZEITIG Koenig (e8) und Turm (a8) angreift.", successText: "Springergabel auf c7! Schach dem Koenig – und naechsten Zug frisst der Springer den Turm. Koenigsgabel = Traumzug!", failText: "Von c7 aus greift der Springer e8 UND a8 gleichzeitig an. Das ist die Gabel!", freePlayMoves: 0, freePlayAI: 3, winByMate: false},
    {id: "L6-2", level: 6, title: "Die Bauerngabel", teach: "Auch der kleine Bauer kann gabeln! Ein Bauer, der zwischen zwei Figuren vorrueckt, greift beide gleichzeitig an – und ist selbst fast nichts wert.", fen: "7k/8/3n1b2/8/4P3/8/8/7K", prompt: "Gabele Springer und Laeufer mit deinem Bauern!", solutions: ["e4e5"], hint: "Ruecke den Bauern vor – dann greift er schraeg links UND schraeg rechts an.", successText: "Bauerngabel! Der Bauer (1 Punkt) greift zwei 3-Punkte-Figuren an. Eine geht sicher verloren!", failText: "Ziehe den Bauern nach e5 – von dort greift er d6 und f6 gleichzeitig an.", freePlayMoves: 0, freePlayAI: 3, winByMate: false},
    {id: "L6-3", level: 6, title: "Die Fesselung nutzen", teach: "Fesselung: Eine Figur kann nicht ziehen, weil dahinter der Koenig steht! Gefesselte Figuren sind hilflos – greife sie nochmal an!", fen: "4k3/8/2n5/1B6/3P4/8/8/4K3", prompt: "Der Springer c6 ist gefesselt! Greife ihn mit dem Bauern an!", solutions: ["d4d5"], hint: "Der Springer kann nicht fliehen (Fesselung durch deinen Laeufer!). Welcher Bauernzug greift ihn an?", successText: "Stark! Der gefesselte Springer darf nicht ziehen (sonst faellt der Koenig) – naechsten Zug ist er weg!", failText: "Ziehe den Bauern nach d5: Er greift den gefesselten Springer an, der nicht weglaufen darf!", freePlayMoves: 0, freePlayAI: 3, winByMate: false},
    {id: "L6-4", level: 6, title: "Der Spiess", teach: "Der Spiess ist die umgekehrte Fesselung: Du greifst die WERTVOLLE Figur vorne an – sie muss weg, und du gewinnst die Figur DAHINTER! (Vukovic)", fen: "4q3/8/8/4k3/8/8/8/R5K1", prompt: "Spiesse Koenig und Dame auf: Gib Schach auf der e-Linie!", solutions: ["a1e1"], hint: "Turm auf die e-Linie: Der Koenig muss aus dem Schach ziehen – dahinter wartet die Dame!", successText: "Spiess! Der Koenig muss weichen, und dein Turm schlaegt naechsten Zug die Dame auf e8!", failText: "Ziehe den Turm nach e1: Schach! Koenig und Dame stehen auf derselben Linie aufgespiesst.", freePlayMoves: 0, freePlayAI: 3, winByMate: false},
    {id: "L7-1", level: 7, title: "Das Abzugsschach", teach: "Abzugsschach: Eine Figur zieht WEG und oeffnet dahinter einen Angriff auf den Koenig! Die ziehende Figur darf machen, was sie will – der Gegner muss erst das Schach abwehren. Zieht sie MIT eigenem Schach: Doppelschach!", fen: "6k1/8/8/3N4/8/1B6/8/6K1", prompt: "Ziehe den Springer mit Abzugsschach – am besten mit Doppelschach!", solutions: ["d5f6", "d5e7"], hint: "Der Laeufer b3 zielt verdeckt auf g8. Zieht der Springer weg UND gibt selbst Schach...", successText: "DOPPELSCHACH! Laeufer und Springer geben gleichzeitig Schach – dagegen hilft NUR ein Koenigszug. Die staerkste Waffe im Schach!", failText: "Der Springer muss wegziehen und selbst Schach geben: f6 oder e7 – dann wirken Laeufer UND Springer!", freePlayMoves: 0, freePlayAI: 3, winByMate: false},
    {id: "L7-2", level: 7, title: "Doppelangriff mit der Dame", teach: "Die Dame ist die Koenigin des Doppelangriffs: Mit einem Zug kann sie in ZWEI Richtungen gleichzeitig drohen!", fen: "r5k1/8/8/8/8/8/8/3Q2K1", prompt: "Finde den Damenzug, der Schach gibt UND den Turm angreift!", solutions: ["d1d5"], hint: "Suche ein Feld, von dem die Dame diagonal den Koenig UND diagonal den Turm sieht.", successText: "Doppelangriff! Schach auf g8 und Angriff auf a8 – der Turm ist verloren. Die Dame sieht eben alles!", failText: "Von d5 aus: Diagonale nach g8 (Schach!) und Diagonale nach a8 (Turm!). Beides gleichzeitig!", freePlayMoves: 0, freePlayAI: 3, winByMate: false},
    {id: "L7-3", level: 7, title: "Matt in 2: Der stille Zug", teach: "Nicht immer ist der laute Zug der beste! Ein 'stiller Zug' bereitet das Matt unaufhaltsam vor: Erst die 7. Reihe nehmen, dann Matt auf der 8.", fen: "3k4/8/6Q1/8/8/8/8/6KR", prompt: "Matt in 2 Zuegen: Finde den stillen Vorbereitungszug der Dame!", solutions: ["g6g7"], hint: "Die Dame nimmt zuerst die 7. Reihe (ohne Schach!) – dann ist Turm h8 nicht mehr zu verhindern.", successText: "Der stille Zug! Die Dame sperrt die 7. Reihe, der Koenig ist auf der 8. gefangen – Th8 setzt naechsten Zug matt!", failText: "Ziehe die Dame nach g7: Sie sperrt die ganze 7. Reihe. Danach ist Turm h1-h8 matt!", freePlayMoves: 0, freePlayAI: 3, winByMate: false},
    {id: "L7-4", level: 7, title: "Koenigsgabel unter Druck", teach: "Taktik rettet! Deine Figur wird angegriffen? Suche erst nach einem GEGENANGRIFF – vielleicht gibt es eine Gabel mit Schach!", fen: "6k1/3q4/8/3N4/8/8/8/6K1", prompt: "Die schwarze Dame greift deinen Springer an! Rette ihn mit einer Koenigsgabel!", solutions: ["d5f6"], hint: "Nicht fliehen – angreifen! Von welchem Feld gabelt der Springer Koenig UND Dame?", successText: "Nf6+! Schach – und naechsten Zug schlaegt der Springer die Dame. Aus Verteidigung wird Angriff!", failText: "Von f6 aus gibt der Springer Schach auf g8 und greift die Dame auf d7 an. Gabel!", freePlayMoves: 0, freePlayAI: 3, winByMate: false},
    {id: "L8-1", level: 8, title: "Das Zentrum besetzen", teach: "Eroeffnungsregel Nr. 1: Besetze das Zentrum! Die Felder e4, d4, e5, d5 sind das Herz des Brettes. Wer sie kontrolliert, hat mehr Raum. (Lasker)", fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR", prompt: "Mache den klassischen ersten Zug: Setze einen Zentrumsbauern 2 Felder vor!", solutions: ["e2e4", "d2d4"], hint: "Die Koenigs- oder Damenbauern (e2/d2) gehoeren ins Zentrum: e4 oder d4!", successText: "Perfekter Start! 1.e4 ('best by test' – Fischer) oder 1.d4 – beide besetzen das Zentrum und oeffnen Wege fuer die Figuren.", failText: "Ziehe den e- oder d-Bauern zwei Felder vor: Das kontrolliert das Zentrum!", freePlayMoves: 0, freePlayAI: 3, winByMate: false},
    {id: "L8-2", level: 8, title: "Figuren entwickeln", teach: "Eroeffnungsregel Nr. 2: Entwickle Springer und Laeufer schnell! Springer VOR Laeufern, und moeglichst Richtung Zentrum. Die Dame bleibt erstmal zuhause!", fen: "rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR", prompt: "Entwickle einen Springer Richtung Zentrum!", solutions: ["g1f3", "b1c3"], hint: "Springer nach f3 oder c3 – von dort kontrollieren sie Zentrumsfelder.", successText: "Entwicklung! Sf3 greift sogar den Bauern e5 an. Jeder Eroeffnungszug soll entwickeln oder drohen!", failText: "Entwickle einen Springer: g1-f3 oder b1-c3. (Tarrasch: 'Springer am Rand ist eine Schande!')", freePlayMoves: 0, freePlayAI: 3, winByMate: false},
    {id: "L8-3", level: 8, title: "Der aktive Laeufer", teach: "Nach den Springern kommen die Laeufer. Stelle sie AKTIV: auf Diagonalen, die aufs Zentrum oder den gegnerischen Koenig zielen (z.B. das beruehmte Italienisch mit Lc4).", fen: "r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R", prompt: "Entwickle den Koenigslaeufer aktiv (Italienische oder Spanische Partie)!", solutions: ["f1c4", "f1b5"], hint: "Lc4 zielt auf f7 (Italienisch), Lb5 bedraengt den Springer c6 (Spanisch). Beides ist gut!", successText: "Aktiv entwickelt! Lc4 = Italienische Partie (zielt auf den schwachen Punkt f7). Lb5 = Spanische Partie, die 'Koenigin der Eroeffnungen'.", failText: "Der f1-Laeufer gehoert nach c4 (Italienisch) oder b5 (Spanisch) – aktiv Richtung Gegner!", freePlayMoves: 0, freePlayAI: 3, winByMate: false},
    {id: "L8-4", level: 8, title: "Der Koenig in Sicherheit", teach: "Eroeffnungsregel Nr. 3: Rochiere frueh! Ein Koenig in der Mitte ist ein Angriffsziel. Nach der Rochade ist er sicher und die Tuerme sind verbunden.", fen: "r1bqk2r/pppp1ppp/2n2n2/2b1p3/2B1P3/5N2/PPPP1PPP/RNBQK2R", prompt: "Alles ist vorbereitet: Bringe deinen Koenig JETZT in Sicherheit!", solutions: ["e1g1"], hint: "Kurze Rochade: Koenig von e1 nach g1!", successText: "Rochade! Koenig sicher, Turm aktiviert – die Eroeffnung ist fast geschafft. So machen es die Meister in fast jeder Partie!", failText: "Rochiere kurz: Klicke den Koenig (e1) und dann g1.", freePlayMoves: 0, freePlayAI: 3, winByMate: false},
    {id: "L8-5", level: 8, title: "Praxis: Die ersten 10 Zuege", teach: "Jetzt du! Spiele die Eroeffnung gegen den Computer und wende die 3 Regeln an: 1) Zentrum besetzen, 2) Figuren entwickeln, 3) frueh rochieren. Dein Coach bewertet jeden Zug von 1-15!", fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR", prompt: "Spiele 10 gute Eroeffnungszuege (Durchschnittswert mindestens 8/15)!", solutions: [], hint: "Zentrumsbauern, Springer, Laeufer, Rochade – in dieser Reihenfolge machst du nichts falsch.", successText: "Eroeffnung bestanden! Du beherrschst die goldenen Regeln. Weiter zur Endspielschule!", failText: "Durchschnitt unter 8/15. Denk an: Zentrum, Entwicklung, Rochade – und verliere keine Figuren! Versuch es nochmal.", freePlayMoves: 10, freePlayAI: 3, winByMate: false},
    {id: "L9-1", level: 9, title: "Die Opposition", teach: "Bauernendspiele entscheidet die OPPOSITION: Stehen sich die Koenige mit einem Feld Abstand gegenueber, muss der andere weichen – wer NICHT ziehen muss, hat die Opposition! (Capablanca)", fen: "8/8/4k3/8/8/4K3/4P3/8", prompt: "Nimm die Opposition: Stelle deinen Koenig direkt gegenueber!", solutions: ["e3e4"], hint: "Ziehe den Koenig nach e4 – dann stehen sich die Koenige mit 1 Feld Abstand gegenueber, und Schwarz muss weichen.", successText: "Opposition! Schwarz muss jetzt zur Seite weichen, und dein Koenig marschiert vorwaerts. So gewinnt man Bauernendspiele!", failText: "Koenig nach e4: Auge in Auge mit einem Feld Abstand – der Gegner am Zug muss weichen.", freePlayMoves: 0, freePlayAI: 3, winByMate: false},
    {id: "L9-2", level: 9, title: "Turm hinter den Freibauern", teach: "Tarrasch-Regel: Der Turm gehoert HINTER den Freibauern – den eigenen wie den gegnerischen! Von hinten schiebt er ihn an und wird mit jedem Schritt staerker.", fen: "6k1/8/8/P7/8/8/7R/6K1", prompt: "Stelle deinen Turm hinter deinen Freibauern!", solutions: ["h2a2"], hint: "Dein Freibauer steht auf a5 und will nach a8. 'Hinter' ihm heisst: auf der a-Linie unterhalb, also a2!", successText: "Perfekt nach Tarrasch! Der Turm schiebt den Bauern von hinten zur Umwandlung – und bleibt dabei maximal beweglich.", failText: "Ziehe den Turm nach a2: auf die a-Linie, HINTER den Bauern (aus deiner Sicht unten).", freePlayMoves: 0, freePlayAI: 3, winByMate: false},
    {id: "L9-3", level: 9, title: "Freibauern muessen laufen!", teach: "Nimzowitsch: 'Der Freibauer ist ein Verbrecher, der ins Zuchthaus gehoert – oder zur Dame!' Kein gegnerischer Bauer kann ihn mehr aufhalten – also VORWAERTS!", fen: "8/8/1P6/8/8/8/8/K6k", prompt: "Dein Freibauer ist nicht zu stoppen. Ruecke ihn vor!", solutions: ["b6b7"], hint: "Einfach vorwaerts! b7 – und naechsten Zug wird er zur Dame.", successText: "Lauf, Bauer, lauf! Naechster Halt: b8 = Dame. Im Endspiel zaehlt jedes Tempo beim Wettrennen!", failText: "Ziehe den b-Bauern vor nach b7 – niemand kann ihn aufhalten!", freePlayMoves: 0, freePlayAI: 3, winByMate: false},
    {id: "L9-4", level: 9, title: "Den Koenig abschneiden", teach: "Turmtechnik: Schneide den gegnerischen Koenig mit dem Turm ab! Eine Turm-Linie ist wie ein Zaun, den der Koenig nie ueberqueren kann.", fen: "8/4k3/P7/8/7R/8/8/K7", prompt: "Dein a-Bauer will zur Dame. Sperre den schwarzen Koenig mit dem Turm aus!", solutions: ["h4d4"], hint: "Der schwarze Koenig will nach links zum Bauern. Ein Turm auf der d-Linie sperrt ihm den Weg fuer immer.", successText: "Abgeschnitten! Der Koenig kommt nie mehr ueber die d-Linie – dein Bauer spaziert gemuetlich zur Dame.", failText: "Turm nach d4: Die d-Linie wird zum unueberwindbaren Zaun zwischen Koenig und Bauer.", freePlayMoves: 0, freePlayAI: 3, winByMate: false},
    {id: "L9-5", level: 9, title: "Praxis: Matt mit der Dame", teach: "Die wichtigste Endspiel-Technik: Matt mit Koenig + Dame gegen Koenig. Plan: 1) Dame draengt den Koenig an den Rand (immer Springer-Abstand halten!), 2) dein Koenig kommt zu Hilfe, 3) Matt am Rand. VORSICHT: Patt vermeiden!", fen: "8/8/8/4k3/8/8/8/3Q1K2", prompt: "Setze den schwarzen Koenig matt – du hast 15 Zuege. Achtung: Kein Patt!", solutions: [], hint: "Draenge den Koenig mit der Dame Schritt fuer Schritt an den Rand (Springer-Abstand!). Dann hilf mit deinem Koenig und setze matt.", successText: "MATT! Die Koenigsdisziplin des Endspiels sitzt. Diese Technik gewinnt dir hunderte Partien!", failText: "Kein Matt in 15 Zuegen (oder Patt?). Rezept: Dame im Springer-Abstand zum Koenig draengt ihn an den Rand, dein Koenig hilft, dann Matt. Nochmal!", freePlayMoves: 15, freePlayAI: 6, winByMate: true},
    {id: "L10-1", level: 10, title: "Philidors Vermaechtnis", teach: "Die beruehmteste Kombination der Schachgeschichte: Das Damenopfer, das zum erstickten Matt fuehrt! Der Springer auf h6 deckt g8 – die Dame darf sich opfern.", fen: "5r1k/6pp/4Q2N/8/8/8/8/6K1", prompt: "Matt in 2: Opfere die Dame!", solutions: ["e6g8"], hint: "Dg8+!! Der Turm MUSS nehmen (der Koenig darf nicht – der Springer bewacht g8!). Und dann...?", successText: "BRILLANT! Dg8+ Txg8, Sf7 MATT – das erstickte Matt! Philidor beschrieb es schon 1749. Du opferst wie ein Meister!", failText: "Die Dame zieht nach g8: Schach! Der Turm muss schlagen (Kxg8 ist verboten – der Springer h6 deckt g8), dann Sf7 matt!", freePlayMoves: 0, freePlayAI: 3, winByMate: false},
    {id: "L10-2", level: 10, title: "Das Anastasia-Matt", teach: "Das Anastasia-Matt: Springer und Turm arbeiten zusammen. Der Springer auf e7 nimmt dem Koenig g8 und g6 – der Turm gibt an der Kante Matt!", fen: "8/4N1pk/8/8/8/R7/8/6K1", prompt: "Setze das Anastasia-Matt: Matt in 1!", solutions: ["a3h3"], hint: "Der Springer bewacht schon g8 und g6. Welcher Turmzug gibt Schach an der h-Kante?", successText: "Anastasia-Matt! Der Koenig ist zwischen Springer-Feldern und Brettrand gefangen. Benannt nach einem Roman von 1803!", failText: "Turm nach h3: Schach auf der h-Linie – g8 und g6 bewacht dein Springer, g7 der eigene Bauer!", freePlayMoves: 0, freePlayAI: 3, winByMate: false},
    {id: "L10-3", level: 10, title: "Das Arabische Matt", teach: "Das aelteste Mattbild der Welt (aus dem arabischen Schach): Springer und Turm Seite an Seite. Der Springer deckt den Turm UND das Fluchtfeld!", fen: "7k/1R6/5N2/8/8/8/8/6K1", prompt: "Setze das Arabische Matt: Matt in 1!", solutions: ["b7h7"], hint: "Der Turm muss direkt neben den Koenig – dein Springer f6 deckt ihn und bewacht g8!", successText: "Das Arabische Matt! Ueber 1000 Jahre alt und immer noch toedlich. Springer + Turm = perfektes Duo.", failText: "Turm nach h7: Schach! Der Koenig kann ihn nicht schlagen (Springer f6 deckt h7) und g8 ist auch bewacht.", freePlayMoves: 0, freePlayAI: 3, winByMate: false},
    {id: "L10-4", level: 10, title: "Den Verteidiger beseitigen", teach: "Meister-Denken: Der Gegner hat nur EINEN Verteidiger gegen dein Grundreihenmatt? Dann beseitige ihn – notfalls mit der Dame!", fen: "3r2k1/5ppp/8/Q7/8/8/8/6K1", prompt: "Nur der Turm d8 bewacht die Grundreihe. Matt in 1!", solutions: ["a5d8"], hint: "Deine Dame kann den einzigen Verteidiger schlagen – mit Schach... und es ist sogar Matt!", successText: "Dxd8 MATT! Der Verteidiger ist weg, die Grundreihe gehoert dir. Immer fragen: Wer verteidigt eigentlich?", failText: "Die Dame schlaegt den Turm auf d8: Schach auf der Grundreihe – und die Bauern sperren den eigenen Koenig ein. Matt!", freePlayMoves: 0, freePlayAI: 3, winByMate: false},
    {id: "L10-5", level: 10, title: "Die Meisterpruefung", teach: "Die Abschlusspruefung der Akademie: Eine komplette Partie gegen die starke KI (Stufe 7). Dein Coach bewertet jeden Zug. Zeige alles, was du gelernt hast: Eroeffnung, Taktik, Strategie, Endspiel!", fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR", prompt: "Bestehe die Meisterpruefung: Gewinne ODER halte einen Zugdurchschnitt von mindestens 9/15 ueber 25 Zuege!", solutions: [], hint: "Alles zaehlt: Zentrum, Entwicklung, Rochade, keine Figuren einstellen, Taktik-Chancen nutzen!", successText: "MEISTERPRUEFUNG BESTANDEN! Du hast alle 10 Stufen der Schach-Akademie absolviert. Herzlichen Glueckwunsch, Schachmeister!", failText: "Noch nicht bestanden – aber jede Partie macht dich staerker! Analysiere deine Fehler und versuch es erneut.", freePlayMoves: 25, freePlayAI: 7, winByMate: false}
  ];
});


/* ===== daten_buch.js ===== */
/* GENERIERT von _werkzeug/swift_daten_konverter.py aus SchachSpiel.swift (Texte woertlich uebernommen). Nicht von Hand aendern. */
(function (root, factory) {
  var K;
  if (typeof module === 'object' && module.exports) { K = require('./namespace.js'); factory(K); module.exports = K; }
  else { K = root.SchachKern = root.SchachKern || {}; factory(K); }
})(typeof self !== 'undefined' ? self : this, function (K) {
  'use strict';
  K.Daten = K.Daten || {};
  K.Daten.openingEntries = [
    {eco: "A00", name: "Sokolsky (Polnisch)", moves: ["b2b4"], explanation: "Seltene Flankeneroeffnung. Weiss kontrolliert c5 und bereitet Lb2 vor. Ueberraschungswaffe in Blitzpartien.", bookSource: "Schiller: Unorthodox Chess Openings"},
    {eco: "A02", name: "Bird-Eroeffnung", moves: ["f2f4"], explanation: "Weiss kontrolliert e5 und plant einen Koenigsfluegelangriff. Dynamisch aber riskant - der Koenig wird leicht exponiert.", bookSource: "Lakdawala: Bird Eroeffnung"},
    {eco: "A04", name: "Reti-Eroeffnung", moves: ["g1f3"], explanation: "Hypermoderner Aufbau: Springer vor Bauern! Weiss verzoegert d4/e4 und kontrolliert das Zentrum aus der Ferne.", bookSource: "Reti: Die neuen Ideen im Schach"},
    {eco: "A04", name: "Reti mit d5", moves: ["g1f3", "d7d5"], explanation: "Schwarz besetzt das Zentrum klassisch. Weiss wird mit c4 das Zentrum untergraben - typische hypermoderne Strategie.", bookSource: "Reti: Die neuen Ideen im Schach"},
    {eco: "A05", name: "Reti - Koenigsindischer Angriff", moves: ["g1f3", "g8f6"], explanation: "Beide Seiten entwickeln Springer. Flexible Stellung mit vielen Uebergaengen zu anderen Eroeffnungen.", bookSource: "Reti: Die neuen Ideen im Schach"},
    {eco: "A10", name: "Englische Eroeffnung", moves: ["c2c4"], explanation: "Kontrolliert d5 ohne das Zentrum frueh festzulegen. Fuehrt oft zu positionellen Manoeverkampfen. Botwinnik-Favorit.", bookSource: "Marin: Englisch 1.c4"},
    {eco: "A13", name: "Englisch mit e6", moves: ["c2c4", "e7e6"], explanation: "Schwarz bereitet d5 vor und haelt die Stellung flexibel. Kann in Damenindisch oder Damengambit uebergehen.", bookSource: "Marin: Englisch 1.c4"},
    {eco: "A15", name: "Englisch mit Sf6", moves: ["c2c4", "g8f6"], explanation: "Schwarz entwickelt den Springer und haelt alle Optionen offen. Kann zu Koenigsindisch oder Nimzoindisch fuehren.", bookSource: "Marin: Englisch 1.c4"},
    {eco: "A20", name: "Englisch mit e5", moves: ["c2c4", "e7e5"], explanation: "Sizilianisch mit vertauschten Farben! Schwarz besetzt das Zentrum aggressiv. Weiss hat einen Tempovorteil.", bookSource: "Kosten: Sizilianisch im Anzug"},
    {eco: "A30", name: "Englisch Symmetrisch", moves: ["c2c4", "c7c5"], explanation: "Symmetrische Bauernstruktur. Weiss versucht mit Sf3, g3, Lg2 die Initiative zu ergreifen.", bookSource: "Marin: Englisch 1.c4"},
    {eco: "A40", name: "Damenbauernspiel", moves: ["d2d4", "e7e6"], explanation: "Solider schwarzer Aufbau. Kann zu Franzoesisch (nach e4) oder Damengambit (nach d5, c4) fuehren.", bookSource: "Watson: Damenbauernspiel"},
    {eco: "A43", name: "Altindisch", moves: ["d2d4", "g8f6", "c2c4", "d7d6"], explanation: "Schwarz baut eine flexible Stellung auf und vermeidet fruehe Festlegungen. Kann zu Koenigsindisch transponieren.", bookSource: "Bologan: Koenigsindisch"},
    {eco: "A45", name: "Trompowsky-Angriff", moves: ["d2d4", "g8f6", "c1g5"], explanation: "Weiss setzt den Laeufer aggressiv ein und droht Lxf6 mit Verdopplung der Bauern. Moderner Ueberraschungszug.", bookSource: "Rapport: Trompowsky Angriff"},
    {eco: "A51", name: "Budapester Gambit", moves: ["d2d4", "g8f6", "c2c4", "e7e5"], explanation: "Schwarz opfert einen Bauern fuer schnelle Entwicklung und Angriff. Taktisch gefaehrlich fuer Unvorbereitete!", bookSource: "Tseitlin: Budapester Gambit"},
    {eco: "A56", name: "Benoni-Verteidigung", moves: ["d2d4", "g8f6", "c2c4", "c7c5"], explanation: "Schwarz erzeugt Asymmetrie und Gegenspiel am Damenflügel. Tal und Kasparov liebten diese scharfe Verteidigung.", bookSource: "Palliser: Moderne Benoni"},
    {eco: "A57", name: "Benko-Gambit", moves: ["d2d4", "g8f6", "c2c4", "c7c5", "d4d5", "b7b5"], explanation: "Positionelles Gambit! Schwarz opfert einen Bauern fuer langfristigen Druck auf den offenen a- und b-Linien.", bookSource: "Pedersen: Benko-Gambit"},
    {eco: "A60", name: "Moderne Benoni", moves: ["d2d4", "g8f6", "c2c4", "c7c5", "d4d5", "e7e6"], explanation: "Schwarz erzeugt einen asymmetrischen Bauernhebel. Typisch: Weiss hat Raumvorteil, Schwarz hat dynamisches Gegenspiel.", bookSource: "Palliser: Moderne Benoni"},
    {eco: "A80", name: "Hollaendische Verteidigung", moves: ["d2d4", "f7f5"], explanation: "Schwarz kontrolliert e4 und plant einen Koenigsfluegelangriff. Botwinnik setzte dies erfolgreich ein.", bookSource: "Moskalenko: Hollaendisch"},
    {eco: "B00", name: "Nimzowitsch-Verteidigung", moves: ["e2e4", "b8c6"], explanation: "Hypermodern: Schwarz kontrolliert d4 mit dem Springer statt mit Bauern. Ungewoehnlich aber solide.", bookSource: "Nimzowitsch: Mein System"},
    {eco: "B00", name: "Owen-Verteidigung", moves: ["e2e4", "b7b6"], explanation: "Schwarz fianchettiert den Damenlaeufer. Ungewoehnlich gegen 1.e4, aber flexibel und ueberraschend.", bookSource: "Keene: Flank Openings"},
    {eco: "B01", name: "Skandinavische Verteidigung", moves: ["e2e4", "d7d5"], explanation: "Sofortige Konfrontation im Zentrum! Nach exd5 Dxd5 verliert Schwarz ein Tempo durch Damenzug, gewinnt aber Raum.", bookSource: "Houska: Skandinavisch"},
    {eco: "B01", name: "Skandinavisch Sf6", moves: ["e2e4", "d7d5", "e4d5", "g8f6"], explanation: "Moderne Variante: Schwarz nimmt mit dem Springer statt der Dame zurueck und vermeidet Tempoverlust.", bookSource: "Houska: Skandinavisch"},
    {eco: "B02", name: "Aljechin-Verteidigung", moves: ["e2e4", "g8f6"], explanation: "Provokation! Schwarz lockt die weissen Bauern vor, um sie spaeter anzugreifen. Aljechins genialer Beitrag zur Theorie.", bookSource: "Davies: Aljechin-Verteidigung"},
    {eco: "B06", name: "Moderne Verteidigung", moves: ["e2e4", "g7g6"], explanation: "Schwarz fianchettiert und laesst Weiss das Zentrum besetzen, um es spaeter zu untergraben. Hypermoderner Ansatz.", bookSource: "Norwood: Moderne Verteidigung"},
    {eco: "B07", name: "Pirc-Verteidigung", moves: ["e2e4", "d7d6", "d2d4", "g8f6", "b1c3", "g7g6"], explanation: "Aehnlich der Modernen, mit fruehemSf6. Schwarz baut eine elastische Stellung auf und schlaegt im Mittelspiel zurueck.", bookSource: "Vigus: Pirc-Verteidigung"},
    {eco: "B10", name: "Caro-Kann-Verteidigung", moves: ["e2e4", "c7c6"], explanation: "Solide und zuverlaessig! c6 bereitet d5 vor ohne den Damenlaeufer einzusperren. Karpow und Anand spielten dies oft.", bookSource: "Houska: Caro-Kann"},
    {eco: "B12", name: "Caro-Kann Vorstoßvariante", moves: ["e2e4", "c7c6", "d2d4", "d7d5", "e4e5"], explanation: "Weiss gewinnt Raum mit e5. Schwarz muss geduldig spielen und die Kette mit c5 und f6 angreifen.", bookSource: "Houska: Caro-Kann"},
    {eco: "B18", name: "Caro-Kann Klassisch", moves: ["e2e4", "c7c6", "d2d4", "d7d5", "b1c3", "d5e4", "c3e4", "c8f5"], explanation: "Schwarzer Hauptplan: Laeufer nach f5 BEVOR e6 gespielt wird. Perfekte Entwicklung fuer den problematischen c8-Laeufer.", bookSource: "Karpow: Caro-Kann Verteidigung"},
    {eco: "B20", name: "Sizilianische Verteidigung", moves: ["e2e4", "c7c5"], explanation: "Die beliebteste Antwort auf 1.e4! Asymmetrischer Kampf: Weiss hat Koenigsfluegelangriff, Schwarz Damenfluegelinitiative.", bookSource: "Kasparov: Meine grossen Vorkämpfer"},
    {eco: "B22", name: "Sizilianisch Alapin", moves: ["e2e4", "c7c5", "c2c3"], explanation: "Weiss bereitet d4 vor und vermeidet die gefaehrlichen offenen Sizilianisch-Varianten. Solide und praktisch.", bookSource: "Sveshnikov: Sizilianisch c3"},
    {eco: "B23", name: "Sizilianisch Geschlossen", moves: ["e2e4", "c7c5", "b1c3"], explanation: "Weiss entwickelt zunaechst Figuren statt sofort d4. Ruhiger als die offene Sizilianische, aber mit Gift.", bookSource: "Soltis: Sizilianisch"},
    {eco: "B30", name: "Sizilianisch Sc6", moves: ["e2e4", "c7c5", "g1f3", "b8c6"], explanation: "Klassischer Aufbau. Schwarz entwickelt den Springer nach c6 und bereitet sich auf d4 cxd4 Sxd4 vor.", bookSource: "Kasparov: Meine grossen Vorkämpfer"},
    {eco: "B33", name: "Sizilianisch Sveshnikov", moves: ["e2e4", "c7c5", "g1f3", "b8c6", "d2d4", "c5d4", "f3d4", "g8f6", "b1c3", "e7e5"], explanation: "Aggressiv! Schwarz akzeptiert ein Loch auf d5 fuer aktives Figurenspiel. Sveshnikov revolutionierte diese Variante.", bookSource: "Yakovich: Sveshnikov-Sizilianisch"},
    {eco: "B40", name: "Sizilianisch Paulsen", moves: ["e2e4", "c7c5", "g1f3", "e7e6"], explanation: "Flexibler Aufbau: e6 unterstuetzt d5 und ermoeglicht den Laeufer nach e7 oder b4. Korchnoi-Favorit.", bookSource: "Soltis: Sizilianisch"},
    {eco: "B44", name: "Sizilianisch Taimanov", moves: ["e2e4", "c7c5", "g1f3", "e7e6", "d2d4", "c5d4", "f3d4", "b8c6"], explanation: "Solide und flexibel. Schwarz entwickelt den Springer nach c6 und haelt viele Optionen offen.", bookSource: "Soltis: Sizilianisch"},
    {eco: "B50", name: "Sizilianisch d6", moves: ["e2e4", "c7c5", "g1f3", "d7d6"], explanation: "Schwarz spielt d6 und bereitet Sf6, g6 oder e5 vor. Fuehrt oft zum Najdorf oder Drachen.", bookSource: "Kasparov: Meine grossen Vorkämpfer"},
    {eco: "B70", name: "Sizilianisch Drache", moves: ["e2e4", "c7c5", "g1f3", "d7d6", "d2d4", "c5d4", "f3d4", "g8f6", "b1c3", "g7g6"], explanation: "Der feuerspeiende Drache! Schwarzer Laeufer auf g7 ist eine Waffe. Beruehmt fuer scharfe Angriffe beider Seiten.", bookSource: "Golubev: Sizilianisch Drache"},
    {eco: "B90", name: "Sizilianisch Najdorf", moves: ["e2e4", "c7c5", "g1f3", "d7d6", "d2d4", "c5d4", "f3d4", "g8f6", "b1c3", "a7a6"], explanation: "Fischers und Kasparovs Lieblingseroeffnung! a6 bereitet b5/e5 vor und vermeidet Lb5+. Extrem dynamisch.", bookSource: "Kasparov: Meine grossen Vorkämpfer"},
    {eco: "C00", name: "Franzoesische Verteidigung", moves: ["e2e4", "e7e6"], explanation: "Solider schwarzer Aufbau: e6 unterstuetzt d5 und schafft eine feste Bauernkette. Problem: der c8-Laeufer ist eingesperrt.", bookSource: "Moskalenko: Franzoesisch"},
    {eco: "C01", name: "Franzoesisch Abtauschvariante", moves: ["e2e4", "e7e6", "d2d4", "d7d5", "e4d5", "e6d5"], explanation: "Symmetrische Bauernstruktur nach dem Abtausch. Ruhige Stellung mit kleinem weissen Raumvorteil.", bookSource: "Moskalenko: Franzoesisch"},
    {eco: "C02", name: "Franzoesisch Vorstoßvariante", moves: ["e2e4", "e7e6", "d2d4", "d7d5", "e4e5"], explanation: "Weiss gewinnt Raum! Schwarz muss die Kette mit c5 und f6 angreifen. Nimzowitschs Kettenblockade-Theorie gilt hier.", bookSource: "Nimzowitsch: Mein System"},
    {eco: "C03", name: "Franzoesisch Tarrasch", moves: ["e2e4", "e7e6", "d2d4", "d7d5", "b1d2"], explanation: "Sd2 statt Sc3 - vermeidet die Festnagelung durch Lb4. Solider weisser Aufbau ohne fruehe Komplikationen.", bookSource: "Moskalenko: Franzoesisch"},
    {eco: "C11", name: "Franzoesisch Klassisch", moves: ["e2e4", "e7e6", "d2d4", "d7d5", "b1c3", "g8f6"], explanation: "Schwarz entwickelt den Springer natuerlich. Es folgen oft scharfe Varianten mit Le2 und 0-0.", bookSource: "Moskalenko: Franzoesisch"},
    {eco: "C15", name: "Franzoesisch Winawer", moves: ["e2e4", "e7e6", "d2d4", "d7d5", "b1c3", "f8b4"], explanation: "Strategisch komplex! Schwarz nagelt den Springer fest, Weiss gewinnt oft das Laeuferpaar. Botwinnik-Variante.", bookSource: "Moskalenko: Franzoesisch"},
    {eco: "C25", name: "Wiener Partie", moves: ["e2e4", "e7e5", "b1c3"], explanation: "Weiss entwickelt den Springer nach c3 und haelt f2-f4 als Option. Weniger theoretisch als 2.Sf3.", bookSource: "Tseitlin: Wiener Partie"},
    {eco: "C30", name: "Koenigsgambit", moves: ["e2e4", "e7e5", "f2f4"], explanation: "Das aelteste Gambit! Weiss opfert einen Bauern fuer offene Linien und schnellen Angriff. Anderssens Lieblingseroeffnung.", bookSource: "Gallagher: Koenigsgambit"},
    {eco: "C33", name: "Koenigsgambit Angenommen", moves: ["e2e4", "e7e5", "f2f4", "e5f4"], explanation: "Schwarz nimmt den Bauern an. Jetzt muss Weiss schnell entwickeln und angreifen bevor Schwarz konsolidiert.", bookSource: "Gallagher: Koenigsgambit"},
    {eco: "C41", name: "Philidor-Verteidigung", moves: ["e2e4", "e7e5", "g1f3", "d7d6"], explanation: "Solide aber passiv. d6 stuetzt e5 ohne den d-Bauern zu blockieren. Philidor nannte Bauern die Seele des Schachs.", bookSource: "Bauer: Philidor-Verteidigung"},
    {eco: "C42", name: "Russische Verteidigung (Petrov)", moves: ["e2e4", "e7e5", "g1f3", "g8f6"], explanation: "Schwarz kontert sofort im Zentrum statt e5 zu verteidigen. Sehr solide, beliebt bei Kramnik und Caruana.", bookSource: "Karpow: Russische Verteidigung"},
    {eco: "C44", name: "Schottische Partie", moves: ["e2e4", "e7e5", "g1f3", "b8c6", "d2d4"], explanation: "Sofortige Zentrumsoefffnung! Weiss opfert den d-Bauern fuer schnelle Entwicklung. Kasparov belebte dies 1990 wieder.", bookSource: "Wells: Schottisch"},
    {eco: "C44", name: "Schottisches Gambit", moves: ["e2e4", "e7e5", "g1f3", "b8c6", "d2d4", "e5d4", "f1c4"], explanation: "Weiss opfert den d-Bauern und entwickelt den Laeufer aktiv. Kombiniert Entwicklungsvorsprung mit Angriffsmoeglichkeiten.", bookSource: "Wells: Schottisch"},
    {eco: "C47", name: "Vierspringerspiel", moves: ["e2e4", "e7e5", "g1f3", "b8c6", "b1c3", "g8f6"], explanation: "Alle vier Springer sind entwickelt! Symmetrische Stellung mit vielen taktischen Moeglichkeiten.", bookSource: "Karpow: Offene Spiele"},
    {eco: "C50", name: "Italienische Partie", moves: ["e2e4", "e7e5", "g1f3", "b8c6", "f1c4"], explanation: "Klassische Eroeffnung seit dem 16. Jahrhundert. Lc4 zielt auf f7, den schwaechsten Punkt in der Anfangsstellung.", bookSource: "Pinski: Italienisch"},
    {eco: "C50", name: "Ungarische Verteidigung", moves: ["e2e4", "e7e5", "g1f3", "b8c6", "f1c4", "f8e7"], explanation: "Schwarz spielt vorsichtig Le7 statt Lc5. Solide aber gibt Weiss leichten Entwicklungsvorsprung.", bookSource: "Pinski: Italienisch"},
    {eco: "C51", name: "Evans-Gambit", moves: ["e2e4", "e7e5", "g1f3", "b8c6", "f1c4", "f8c5", "b2b4"], explanation: "Brillantes Gambit! Weiss opfert den b-Bauern fuer Tempo und offene Linien. Anderssens geniale Angriffswaffe.", bookSource: "Harding: Evans-Gambit"},
    {eco: "C53", name: "Giuoco Piano", moves: ["e2e4", "e7e5", "g1f3", "b8c6", "f1c4", "f8c5"], explanation: "Das 'ruhige Spiel' - aber die Ruhe truegt! Beide Laeufer sind aktiv, und taktische Schlaege lauern.", bookSource: "Pinski: Italienisch"},
    {eco: "C55", name: "Zweispringerspiel", moves: ["e2e4", "e7e5", "g1f3", "b8c6", "f1c4", "g8f6"], explanation: "Schwarz kontert aktiv mit Sf6 statt Lc5. Fuehrt zu scharfen taktischen Kampf. Sehr beliebte Anfaengereroeffnung.", bookSource: "Pinski: Italienisch"},
    {eco: "C60", name: "Spanische Partie (Ruy Lopez)", moves: ["e2e4", "e7e5", "g1f3", "b8c6", "f1b5"], explanation: "Die Koenigin der Eroeffnungen! Lb5 setzt Druck auf e5 via c6. Die tiefste und meisterforschte Eroeffnung ueberhaupt.", bookSource: "Karpow: Spanische Partie"},
    {eco: "C65", name: "Spanisch Berliner Mauer", moves: ["e2e4", "e7e5", "g1f3", "b8c6", "f1b5", "g8f6"], explanation: "Die 'Berliner Mauer' - Kramnik entthronte Kasparov 2000 damit! Ultra-solide Verteidigung, fuehrt oft ins Endspiel.", bookSource: "Kaufman: Berliner Mauer"},
    {eco: "C77", name: "Spanisch Morphy-Verteidigung", moves: ["e2e4", "e7e5", "g1f3", "b8c6", "f1b5", "a7a6", "b5a4"], explanation: "a6 vertreibt den Laeufer. La4 erhaelt den Druck auf c6. Dies ist der Hauptweg in allen geschlossenen Spanisch-Varianten.", bookSource: "Karpow: Spanische Partie"},
    {eco: "C78", name: "Spanisch Geschlossen", moves: ["e2e4", "e7e5", "g1f3", "b8c6", "f1b5", "a7a6", "b5a4", "g8f6", "e1g1"], explanation: "Weiss rochiert frueh und setzt auf langfristigen positionellen Druck. Die Hauptvariante des Spanisch.", bookSource: "Karpow: Spanische Partie"},
    {eco: "C89", name: "Spanisch Marshall-Angriff", moves: ["e2e4", "e7e5", "g1f3", "b8c6", "f1b5", "a7a6", "b5a4", "g8f6", "e1g1", "f8e7", "f1e1", "b7b5", "a4b3", "e8g8", "c2c3", "d7d5"], explanation: "Marshalls geniales Gambit! Schwarz opfert einen Bauern fuer gewaltigen Angriff auf den weissen Koenig.", bookSource: "Karpow: Spanische Partie"},
    {eco: "D00", name: "Damenbauernspiel", moves: ["d2d4", "d7d5"], explanation: "Solider Start. Beide Seiten besetzen das Zentrum mit Bauern. Der Kampf um d4/d5 bestimmt die weitere Partie.", bookSource: "Watson: Geheimnisse der modernen Schachstrategie"},
    {eco: "D02", name: "Londoner System", moves: ["d2d4", "d7d5", "g1f3", "g8f6", "c1f4"], explanation: "Solides weisses System: Lf4 vor e3! Einfach zu lernen, schwer zu knacken. Ideal fuer Vereinsspieler.", bookSource: "Lakdawala: Londoner System"},
    {eco: "D06", name: "Damengambit", moves: ["d2d4", "d7d5", "c2c4"], explanation: "Kein echtes Gambit! Weiss bietet c4 an um das Zentrum zu oeffnen. Eine der aeltesten und besten Eroeffnungen.", bookSource: "Sadler: Damengambit"},
    {eco: "D10", name: "Slawische Verteidigung", moves: ["d2d4", "d7d5", "c2c4", "c7c6"], explanation: "Schwarz stuetzt d5 mit c6 und haelt den Weg frei fuer den Damenlaeufer. Sehr solide, Kramnik-Favorit.", bookSource: "Schandorff: Slawisch"},
    {eco: "D13", name: "Slawisch Abtauschvariante", moves: ["d2d4", "d7d5", "c2c4", "c7c6", "g1f3", "g8f6", "c4d5", "c6d5"], explanation: "Symmetrische Stellung nach dem Abtausch. Minoritaetsangriff mit b4-b5 ist Weiss' typischer Plan.", bookSource: "Schandorff: Slawisch"},
    {eco: "D20", name: "Damengambit Angenommen", moves: ["d2d4", "d7d5", "c2c4", "d5c4"], explanation: "Schwarz nimmt an! Gibt das Zentrum auf fuer aktives Figurenspiel. Moderner und dynamischer als sein Ruf.", bookSource: "Raetsky: Damengambit Angenommen"},
    {eco: "D30", name: "Damengambit Abgelehnt", moves: ["d2d4", "d7d5", "c2c4", "e7e6"], explanation: "Schwarz haelt das Zentrum mit e6. Nachteil: der c8-Laeufer ist eingesperrt. Klassische Verteidigung.", bookSource: "Sadler: Damengambit"},
    {eco: "D32", name: "Tarrasch-Verteidigung", moves: ["d2d4", "d7d5", "c2c4", "e7e6", "b1c3", "c7c5"], explanation: "Tarrasch akzeptiert einen isolierten d-Bauern fuer aktives Figurenspiel. Dynamik vs Struktur!", bookSource: "Sadler: Damengambit"},
    {eco: "D35", name: "Damengambit Abtauschvariante", moves: ["d2d4", "d7d5", "c2c4", "e7e6", "b1c3", "g8f6", "c4d5", "e6d5"], explanation: "Minoritaetsangriff! Weiss spielt b4-b5 am Damenflügel um Schwaechen in Schwarzens Stellung zu erzeugen.", bookSource: "Sadler: Damengambit"},
    {eco: "D37", name: "Damengambit mit Sf3", moves: ["d2d4", "d7d5", "c2c4", "e7e6", "g1f3", "g8f6", "b1c3"], explanation: "Hauptvariante des Damengambits. Weiss baut systematisch auf und bereitet e4 oder Lg5 vor.", bookSource: "Sadler: Damengambit"},
    {eco: "D43", name: "Semi-Slawisch", moves: ["d2d4", "d7d5", "c2c4", "c7c6", "g1f3", "g8f6", "b1c3", "e7e6"], explanation: "Kombiniert Slawisch und Damengambit-Ideen. Hochkomplex! Fuehrt zu den schaerfsten Varianten des d4-Komplexes.", bookSource: "Schandorff: Slawisch"},
    {eco: "D52", name: "Cambridge-Springs-Variante", moves: ["d2d4", "d7d5", "c2c4", "e7e6", "b1c3", "g8f6", "c1g5", "b8d7", "g1f3", "c7c6", "e2e3", "d8a5"], explanation: "Taktische Ueberraschung! Da5 greift gleichzeitig den Laeufer auf g5 und den Bauern auf c4 an.", bookSource: "Sadler: Damengambit"},
    {eco: "E01", name: "Katalanische Eroeffnung", moves: ["d2d4", "g8f6", "c2c4", "e7e6", "g2g3"], explanation: "Weiss fianchettiert und kombiniert Damengambit-Raumvorteil mit dem starken g2-Laeufer. Kramnik-Spezialitaet.", bookSource: "Avrukh: Katalanisch"},
    {eco: "E11", name: "Bogoinidisch", moves: ["d2d4", "g8f6", "c2c4", "e7e6", "g1f3", "f8b4"], explanation: "Aehnlich dem Nimzoindischen, aber gegen Sf3 statt Sc3. Schwarz setzt den Laeufer aktiv ein.", bookSource: "Pinski: Bogoinidisch"},
    {eco: "E12", name: "Damenindische Verteidigung", moves: ["d2d4", "g8f6", "c2c4", "e7e6", "g1f3", "b7b6"], explanation: "Schwarz fianchettiert am Damenflügel und kontrolliert e4. Sehr solide, Karpow spielte dies meisterhaft.", bookSource: "Avrukh: Damenindisch"},
    {eco: "E20", name: "Nimzoindische Verteidigung", moves: ["d2d4", "g8f6", "c2c4", "e7e6", "b1c3", "f8b4"], explanation: "Nimzowitschs Meisterwerk! Lb4 nagelt den Springer fest und kontrolliert e4. Strategisch reichhaltigste Eroeffnung.", bookSource: "Nimzowitsch: Mein System"},
    {eco: "E32", name: "Nimzoindisch Klassisch", moves: ["d2d4", "g8f6", "c2c4", "e7e6", "b1c3", "f8b4", "d1c2"], explanation: "Dc2 verhindert die Verdopplung der c-Bauern. Weiss strebt nach e4 und vollem Zentrum.", bookSource: "Kasparov: Meine grossen Vorkämpfer"},
    {eco: "E60", name: "Koenigsindische Verteidigung", moves: ["d2d4", "g8f6", "c2c4", "g7g6"], explanation: "Kasparovs Geheimwaffe! Schwarz gibt das Zentrum auf fuer einen gewaltigen Koenigsfluegelangriff. Philosophie: Dynamik ueber Struktur.", bookSource: "Bologan: Koenigsindisch"},
    {eco: "E61", name: "Koenigsindisch mit Sc3", moves: ["d2d4", "g8f6", "c2c4", "g7g6", "b1c3"], explanation: "Weiss baut klassisch auf. Es folgt meist e4, Le2/Ld3, Sf3 - das sogenannte Klassische System.", bookSource: "Bologan: Koenigsindisch"},
    {eco: "E62", name: "Koenigsindisch Fianchetto", moves: ["d2d4", "g8f6", "c2c4", "g7g6", "b1c3", "f8g7", "g1f3", "d7d6", "g2g3"], explanation: "Beide Seiten fianchettieren! Positioneller Ansatz mit langem Manoeverkampf. Gelfand-Favorit.", bookSource: "Bologan: Koenigsindisch"},
    {eco: "E76", name: "Koenigsindisch Vierbauernangriff", moves: ["d2d4", "g8f6", "c2c4", "g7g6", "b1c3", "f8g7", "e2e4", "d7d6", "f2f4"], explanation: "Aggressiv! Weiss besetzt das ganze Zentrum mit vier Bauern. Schwarz muss taktisch exakt spielen.", bookSource: "Gallagher: Koenigsindisch"},
    {eco: "E80", name: "Koenigsindisch Saemisch", moves: ["d2d4", "g8f6", "c2c4", "g7g6", "b1c3", "f8g7", "e2e4", "d7d6", "f2f3"], explanation: "f3 sichert e4 und bereitet Le3 vor. Weiss plant langfristig mit 0-0-0 und Koenigsfluegelattacke.", bookSource: "Bologan: Koenigsindisch"},
    {eco: "E90", name: "Koenigsindisch Klassisch", moves: ["d2d4", "g8f6", "c2c4", "g7g6", "b1c3", "f8g7", "e2e4", "d7d6", "g1f3"], explanation: "Die Hauptvariante! Schwarzs Gegenspiel mit e5, f5 oder c5 fuehrt zu den tiefsten Kampfen im Schach.", bookSource: "Kasparov: Meine grossen Vorkämpfer"},
    {eco: "E97", name: "Koenigsindisch Mar del Plata", moves: ["d2d4", "g8f6", "c2c4", "g7g6", "b1c3", "f8g7", "e2e4", "d7d6", "g1f3", "e8g8", "f1e2", "e7e5", "e1g1", "b8c6"], explanation: "Die beruehmt-beruechtigte Mar-del-Plata-Variante! Beide Seiten stuermen mit Bauern auf entgegengesetzten Fluegeln.", bookSource: "Kasparov: Meine grossen Vorkämpfer"},
    {eco: "D80", name: "Gruenfeld-Verteidigung", moves: ["d2d4", "g8f6", "c2c4", "g7g6", "b1c3", "d7d5"], explanation: "Schwarz gibt Weiss ein maechtiges Zentrum - um es dann zu zerstoeren! Kasparovs Hauptwaffe gegen 1.d4.", bookSource: "Avrukh: Gruenfeld"}
  ];
});


/* ===== daten_wissen.js ===== */
/* GENERIERT von _werkzeug/swift_daten_konverter.py aus SchachSpiel.swift (Texte woertlich uebernommen). Nicht von Hand aendern. */
(function (root, factory) {
  var K;
  if (typeof module === 'object' && module.exports) { K = require('./namespace.js'); factory(K); module.exports = K; }
  else { K = root.SchachKern = root.SchachKern || {}; factory(K); }
})(typeof self !== 'undefined' ? self : this, function (K) {
  'use strict';
  K.Daten = K.Daten || {};
  K.Daten.bookConcepts = [
    {book: "Mein System", author: "Nimzowitsch", category: "strategie", concept: "Ueberdeckung (Overprotection)", explanation: "Wichtige zentrale Felder sollten ueberdeckt (mehr als noetig beschuetzt) werden. Die Figuren gewinnen dadurch Kraft und Beweglichkeit."},
    {book: "Mein System", author: "Nimzowitsch", category: "strategie", concept: "Die Blockade", explanation: "Feindliche Freibauern muessen blockiert werden, am besten mit einem Springer auf dem Blockadefeld. Die blockierende Figur wird stark!"},
    {book: "Mein System", author: "Nimzowitsch", category: "strategie", concept: "Prophylaxe", explanation: "Bevor du deinen eigenen Plan ausfuehrst, frage: Was will mein Gegner? Verhindere seinen Plan zuerst! Prophylaktisches Denken ist der Schluessel."},
    {book: "Mein System", author: "Nimzowitsch", category: "strategie", concept: "Der Freibauer", explanation: "Ein Freibauer muss vorruecken! Sein Vormarsch bindet feindliche Figuren. Im Endspiel ist ein Freibauer oft spielentscheidend."},
    {book: "Mein System", author: "Nimzowitsch", category: "strategie", concept: "Bauernkette und Basis", explanation: "Greife die Bauernkette an ihrer Basis an! Der hinterste Bauer der Kette ist am verwundbarsten."},
    {book: "Denke wie ein Grossmeister", author: "Kotov", category: "strategie", concept: "Der Variantenbaum", explanation: "Berechne systematisch: Finde alle Kandidatenzuege, berechne jeden einmal bis zum Ende, und entscheide dich dann. Springe nie zwischen Varianten hin und her!"},
    {book: "Denke wie ein Grossmeister", author: "Kotov", category: "strategie", concept: "Kandidatenzuege", explanation: "In jeder Stellung gibt es nur 2-3 ernsthafte Kandidatenzuege. Finde sie zuerst, bevor du rechnest. Spart enorm Zeit!"},
    {book: "Denke wie ein Grossmeister", author: "Kotov", category: "strategie", concept: "Intuition und Berechnung", explanation: "Nutze Intuition fuer den Plan, Berechnung fuer die Ausfuehrung. Beide Faehigkeiten ergaenzen sich."},
    {book: "Grundzuege des Schachspiels", author: "Capablanca", category: "endspiel", concept: "Turm hinter den Freibauern", explanation: "Stelle deinen Turm HINTER einen Freibauern (eigenen oder gegnerischen). Er gewinnt Raum bei jedem Bauernzug."},
    {book: "Grundzuege des Schachspiels", author: "Capablanca", category: "endspiel", concept: "Opposition im Bauernendspiel", explanation: "Im Bauernendspiel ist die Opposition entscheidend: Wer den feindlichen Koenig blockiert, gewinnt. Direkte und Fernopposition beherrschen!"},
    {book: "Grundzuege des Schachspiels", author: "Capablanca", category: "strategie", concept: "Einfachheit", explanation: "Wenn du Material vorne liegst, tausche Figuren ab! Je weniger Figuren auf dem Brett, desto leichter ist der Vorteil zu verwerten."},
    {book: "Urteil und Plan", author: "Euwe & Kramer", category: "strategie", concept: "Stellungsbeurteilung in 5 Schritten", explanation: "1. Materialbilanz 2. Koenigssicherheit 3. Bauernstruktur 4. Figurenaktivitaet 5. Raumvorteil. Beurteile jede Stellung so!"},
    {book: "Urteil und Plan", author: "Euwe & Kramer", category: "strategie", concept: "Plan aus der Stellungsbeurteilung", explanation: "Erst beurteilen, dann planen! Dein Plan muss sich aus den konkreten Vorteilen und Schwaechen der Stellung ergeben."},
    {book: "Urteil und Plan", author: "Euwe & Kramer", category: "strategie", concept: "Schwache Felder", explanation: "Ein schwaches Feld ist eines, das nicht mehr von eigenen Bauern kontrolliert werden kann. Besetze gegnerische Schwachfelder mit Figuren!"},
    {book: "Die Kunst des Angriffs", author: "Vukovic", category: "taktik", concept: "Opfer auf h7", explanation: "Das klassische Laeuferopfer Lxh7+! Es funktioniert wenn: Dame und Springer koordinieren, der Koenig nach h7 muss, und Sg5+ folgt."},
    {book: "Die Kunst des Angriffs", author: "Vukovic", category: "taktik", concept: "Doppellaeufer im Angriff", explanation: "Zwei Laeufer die auf den Koenig zielen sind verheerend! Sie kontrollieren Diagonalen und unterstuetzen Opfer."},
    {book: "Die Kunst des Angriffs", author: "Vukovic", category: "taktik", concept: "Angriff bei entgegengesetzter Rochade", explanation: "Bei Rochade auf verschiedenen Seiten: Sturmmarsch! Oeffne Linien mit Bauernvorstoessen gegen den feindlichen Koenig."},
    {book: "Reassess Your Chess", author: "Silman", category: "strategie", concept: "Ungleichgewichte", explanation: "Suche Ungleichgewichte: Material, Raum, Bauernstruktur, Figurenaktivitaet, Entwicklung, Koenigssicherheit. Spiele auf DEINE Vorteile!"},
    {book: "Reassess Your Chess", author: "Silman", category: "strategie", concept: "Laeufer vs Springer", explanation: "Laeufer sind besser in offenen Stellungen, Springer in geschlossenen. Gestalte die Bauernstruktur passend zu deinen Figuren!"},
    {book: "Reassess Your Chess", author: "Silman", category: "endspiel", concept: "Schlechter Laeufer", explanation: "Ein Laeufer der von eigenen Bauern blockiert wird ist 'schlecht'. Stelle Bauern auf die Gegenfarbe deines Laeufers!"},
    {book: "Zuerich 1953", author: "Bronstein", category: "mittelspiel", concept: "Dynamisches Gleichgewicht", explanation: "Jede Stellung hat ein dynamisches Gleichgewicht. Kleine Vorteile koennen durch aktives Spiel in grosse umgewandelt werden."},
    {book: "Zuerich 1953", author: "Bronstein", category: "mittelspiel", concept: "Initiative", explanation: "Die Initiative ist ein temporaerer Vorteil. Nutze sie sofort oder sie verfluechtigt sich! Tempogewinn ist der Schluessel."},
    {book: "Bobby Fischer lehrt Schach", author: "Fischer", category: "taktik", concept: "Grundmuster: Grundreihematt", explanation: "Ein Turm oder Dame auf der 8. Reihe gibt Matt wenn der Koenig keinen Fluchtweg hat. Schaffe immer ein Luftloch fuer deinen Koenig!"},
    {book: "Bobby Fischer lehrt Schach", author: "Fischer", category: "taktik", concept: "Grundmuster: Stickmate", explanation: "Der Koenig wird von eigenen Figuren eingeschlossen und dann mattgesetzt (Ersticktes Matt). Der Springer ist der Spezialist dafuer!"},
    {book: "Lehrbuch des Schachspiels", author: "Lasker", category: "eroeffnung", concept: "Eroeffnungsprinzipien", explanation: "1. Entwickle alle Figuren 2. Kontrolliere das Zentrum 3. Bringe den Koenig in Sicherheit 4. Verbinde die Tuerme."},
    {book: "Lehrbuch des Schachspiels", author: "Lasker", category: "strategie", concept: "Kampf und Widerstand", explanation: "Im Schach wie im Leben: Verteidige dich in schlechten Stellungen zaeh! Gib niemals auf - auch verlorene Stellungen haben Ressourcen."},
    {book: "Moderne Schachtaktik", author: "Pachman", category: "taktik", concept: "Die Doppelangriff-Motive", explanation: "Gabel, Fesselung, Spiess, Ablenkung, Hinlenkung - diese taktischen Motive gewinnen Material. Pruefe in jeder Stellung auf Doppeldrohungen!"},
    {book: "Moderne Schachtaktik", author: "Pachman", category: "taktik", concept: "Kombination erkennen", explanation: "Kombinationen entstehen wenn: a) der Koenig exponiert ist b) Figuren ungedeckt sind c) ueberlastete Figuren existieren."},
    {book: "Endspiel-Manual", author: "Dvoretsky", category: "endspiel", concept: "Lucena-Stellung", explanation: "Im Turmendspiel: Wenn du einen Bauern auf der 7. Reihe hast und der Koenig davor steht, baue eine Bruecke fuer den Turm! Die Lucena-Methode gewinnt immer."},
    {book: "Endspiel-Manual", author: "Dvoretsky", category: "endspiel", concept: "Philidor-Stellung", explanation: "Im Turmendspiel: In der Philidor-Stellung haelt die passive Seite remis indem der Turm auf der 6. Reihe den Koenig blockiert und dann auf die 1. Reihe wechselt."},
    {book: "Endspielstrategie", author: "Shereshevsky", category: "endspiel", concept: "Koenig ins Zentrum", explanation: "Im Endspiel MUSS der Koenig aktiv werden! Bringe ihn ins Zentrum oder zu den gegnerischen Schwaechen. Ein zentralisierter Koenig ist wie eine Extrafigur."},
    {book: "Endspielstrategie", author: "Shereshevsky", category: "endspiel", concept: "Zwei Schwaechen Prinzip", explanation: "Eine Schwaeche kann man oft verteidigen. Schaffe eine ZWEITE Schwaeche! Der Gegner kann nicht beides gleichzeitig schuetzen."},
    {book: "Meine grossen Vorkaempfer", author: "Kasparov", category: "mittelspiel", concept: "Dynamik vs Material", explanation: "Manchmal ist ein Bauer weniger wert als schnelle Entwicklung und Initiative. Kasparov: Die Initiative kann wichtiger sein als Material!"},
    {book: "Meine grossen Vorkaempfer", author: "Kasparov", category: "strategie", concept: "Qualitaet der Figuren", explanation: "Nicht alle Springer sind gleich stark! Ein Springer auf e5 kann staerker sein als ein Turm auf a1. Figurenaktivitaet ist entscheidend."},
    {book: "Die moderne Schachpartie", author: "Tarrasch", category: "eroeffnung", concept: "Springer am Rand = Schande", explanation: "Tarrasch: Ein Springer am Rand ist eine Schande! Am Rand kontrolliert er nur 2-4 Felder statt 8 im Zentrum."},
    {book: "Die moderne Schachpartie", author: "Tarrasch", category: "strategie", concept: "Isolierter Damenbauer", explanation: "Der isolierte d-Bauer ist gleichzeitig Staerke und Schwaeche. Er gibt Raum und offene Linien, ist aber im Endspiel verwundbar."},
    {book: "Leben und Partien", author: "Tal", category: "taktik", concept: "Praktische Opfer", explanation: "Tal: Man muss nicht alles bis zum Matt berechnen! Wenn das Gefuehl sagt der Angriff gewinnt, opfere und stelle den Gegner vor Probleme."},
    {book: "Leben und Partien", author: "Tal", category: "taktik", concept: "Intuition im Angriff", explanation: "Tal: Wenn dir ein Opfer in den Sinn kommt, pruefe es! Wenn du keinen Fehler findest - spiele es! Mut wird im Schach belohnt."},
    {book: "Stellungsspiel", author: "Karpov", category: "strategie", concept: "Prophylaktisches Spiel", explanation: "Karpov: Verbessere deine Stellung Zug fuer Zug. Keine Schwaechen erlauben! Der Gegner wird irgendwann unter dem Druck zusammenbrechen."},
    {book: "Stellungsspiel", author: "Karpov", category: "strategie", concept: "Kleiner Vorteil reicht", explanation: "Karpov zeigte: Ein winziger Vorteil (besserer Laeufer, aktiverer Turm) genuegt zum Sieg wenn man praezise spielt."},
    {book: "Gewinnstrategien", author: "Seirawan", category: "eroeffnung", concept: "Tempogewinn in der Eroeffnung", explanation: "Jedes Tempo zaehlt! Greife gegnerische Figuren an waehrend du eigene entwickelst. Tempo = Zeit = Initiative."},
    {book: "Gewinnstrategien", author: "Seirawan", category: "mittelspiel", concept: "Angriffsplanung", explanation: "Greife dort an wo du staerker bist! Bauernmehrheit am Koenigsflügel = Angriff. Am Damenflügel = Freibauer schaffen."},
    {book: "Berechnung im Schach", author: "Aagaard", category: "taktik", concept: "Zwischenzug (Intermezzo)", explanation: "Ein ueberraschender Zwischenzug aendert die Zugfolge! Bevor du zurueckschlägst: Gibt es einen staerkeren Zug dazwischen?"},
    {book: "Berechnung im Schach", author: "Aagaard", category: "taktik", concept: "Schach-Disziplin beim Rechnen", explanation: "Erzwungene Zuege zuerst pruefen: Schach, Schlagen, Drohen. In dieser Reihenfolge! Das spart Rechenzeit."},
    {book: "Moderne Schachstrategie", author: "Watson", category: "strategie", concept: "Regelverstoss als Fortschritt", explanation: "Moderne Grossmeister verletzen klassische Regeln bewusst! Fruehe Damenzuege, Randspringer - erlaubt wenn konkret begruendet."},
    {book: "Moderne Schachstrategie", author: "Watson", category: "strategie", concept: "Flexibilitaet", explanation: "Halte die Stellung flexibel! Lege dich nicht zu frueh auf einen Plan fest. Die modernste Strategie: Alle Optionen offenhalten."},
    {book: "Die sieben Todsuenden", author: "Rowson", category: "psychologie", concept: "Materialismus", explanation: "Zu viel Fixierung auf Material ist eine Todsünde! Manchmal ist Aktivitaet, Initiative oder Koenigssicherheit wichtiger als ein Bauer."},
    {book: "Die sieben Todsuenden", author: "Rowson", category: "psychologie", concept: "Perfektionismus", explanation: "Suche nicht den perfekten Zug - suche einen GUTEN Zug und spiele ihn! Zeitnot durch Perfektion ist eine haeufige Todsuende."},
    {book: "Die sieben Todsuenden", author: "Rowson", category: "psychologie", concept: "Egoismus", explanation: "Beruecksichtige IMMER die Ideen des Gegners! Wer nur eigene Plaene verfolgt und den Gegner ignoriert, wird bestraft."}
  ];
  K.Daten.famousGames = [
    {name: "Die Unsterbliche Partie", white: "Anderssen", black: "Kieseritzky", year: 1851, eco: "C33", opening: "Koenigsgambit", keyLesson: "Figurenopfer fuer den Angriff! Anderssen opferte Laeufer, beide Tuerme und die Dame - und gewann mit einem genialen Matt."},
    {name: "Die Immergruene Partie", white: "Anderssen", black: "Dufresne", year: 1852, eco: "C52", opening: "Evans-Gambit", keyLesson: "Das brillanteste Damenopfer der Geschichte. Zeigt die Macht offener Linien und koordinierter Leichtfiguren."},
    {name: "Die Opernpartie", white: "Morphy", black: "Hzg. Braunschweig & Gf. Isouard", year: 1858, eco: "C41", opening: "Philidor", keyLesson: "Perfekte Eroeffnungsprinzipien: Schnelle Entwicklung, Zentrum oeffnen, Figuren koordinieren. DAS Lehrstueck fuer Anfaenger!"},
    {name: "Morphys Miniatur", white: "Morphy", black: "Paulsen", year: 1857, eco: "C48", opening: "Vierspringerspiel", keyLesson: "Morphy zeigte die Kraft schneller Entwicklung gegenueber Materialgewinn."},
    {name: "Steinitz' Verteidigung", white: "Zukertort", black: "Steinitz", year: 1886, eco: "D55", opening: "Damengambit", keyLesson: "Die erste offizielle WM-Partie! Steinitz bewies dass solide Verteidigung und Akkumulation kleiner Vorteile gewinnt."},
    {name: "Pillsbury vs Lasker", white: "Pillsbury", black: "Lasker", year: 1895, eco: "D50", opening: "Damengambit", keyLesson: "Laskers zaehe Verteidigung und psychologisches Spiel waren legendaer. Er provozierte Fehler durch Widerstand."},
    {name: "Das Endspielwunder", white: "Lasker", black: "Capablanca", year: 1914, eco: "C68", opening: "Spanisch", keyLesson: "Lasker verteidigte eine schlechtere Stellung genial und zeigte: Aufgeben ist nie die Antwort."},
    {name: "Capablancas Meisterwerk", white: "Capablanca", black: "Marshall", year: 1918, eco: "C89", opening: "Spanisch Marshall", keyLesson: "Capablanca widerlegte Marshalls 8 Jahre lang vorbereitetes Gambit ueber das Brett! Genie vs Vorbereitung."},
    {name: "Aljechins Perle", white: "Reti", black: "Aljechin", year: 1925, eco: "A00", opening: "Reti", keyLesson: "Aljechins Kombinationskunst: Damenopfer mit weitreichenden Folgen. Zeigt die Kraft der Initiative."},
    {name: "Die Perle von Stettin", white: "Rotlevi", black: "Rubinstein", year: 1907, eco: "D40", opening: "Tarrasch", keyLesson: "Rubinsteins geniales Damen- und Turmopfer - zeigt perfekte Figurenkoordination im Angriff."},
    {name: "Die Polnische Unsterbliche", white: "Glucksberg", black: "Najdorf", year: 1929, eco: "A80", opening: "Hollaendisch", keyLesson: "Najdorf opferte fast alle Figuren fuer ein spektakulaeres Matt. Kreativitaet kennt keine Grenzen!"},
    {name: "Botwinnik vs Capablanca", white: "Botwinnik", black: "Capablanca", year: 1938, eco: "E40", opening: "Nimzoindisch", keyLesson: "Botwinniks tiefe Vorbereitung besiegte Capablancas natuerliches Talent. Zeigt den Wert der Analyse."},
    {name: "Byrne vs Fischer", white: "D. Byrne", black: "Fischer", year: 1956, eco: "D97", opening: "Gruenfeld", keyLesson: "Die 'Partie des Jahrhunderts'! 13-jaehriger Fischer opfert die Dame und gewinnt. Genie erkennt man frueh!"},
    {name: "Fischer vs Spassky Spiel 6", white: "Fischer", black: "Spassky", year: 1972, eco: "D59", opening: "Damengambit", keyLesson: "Fischers perfektes Positionsspiel. Spassky applaudierte nach der Partie! Zeigt die Schoenheit der Strategie."},
    {name: "Fischer vs Spassky Spiel 1", white: "Spassky", black: "Fischer", year: 1972, eco: "E56", opening: "Nimzoindisch", keyLesson: "Fischer verlor durch einen riskanten Endspielzug. Lehre: Bleibe in der Verteidigung diszipliniert!"},
    {name: "Karpov vs Kasparov WM 1985", white: "Kasparov", black: "Karpov", year: 1985, eco: "B44", opening: "Sizilianisch", keyLesson: "Kasparovs erster WM-Sieg! Zeigt wie Initiative und Energie positionelle Perfektion schlagen koennen."},
    {name: "Kasparov vs Topalov", white: "Kasparov", black: "Topalov", year: 1999, eco: "B07", opening: "Pirc", keyLesson: "Kasparovs Unsterbliche! Doppelturmopfer mit 24.Txd4!! Zeigt die Macht der Berechnung und des Mutes."},
    {name: "Kasparov vs Deep Blue Sp.1", white: "Kasparov", black: "Deep Blue", year: 1996, eco: "B22", opening: "Sizilianisch", keyLesson: "Mensch besiegt Maschine! Kasparov zeigte strategisches Verstaendnis das dem Computer fehlte."},
    {name: "Deep Blue vs Kasparov Sp.6", white: "Deep Blue", black: "Kasparov", year: 1997, eco: "B17", opening: "Caro-Kann", keyLesson: "Die Maschine gewinnt die Revanche! Ein historischer Moment: Computer werden zu ernsthaften Gegnern."},
    {name: "Karpov vs Spassky", white: "Karpov", black: "Spassky", year: 1974, eco: "E18", opening: "Damenindisch", keyLesson: "Karpovs Wuergegriff: Kleine Vorteile akkumulieren bis der Gegner erstickt. Meisterhaftes Positionsspiel."},
    {name: "Tal vs Botwinnik WM", white: "Tal", black: "Botwinnik", year: 1960, eco: "C18", opening: "Franzoesisch", keyLesson: "Tals magische Opfer verwirrten selbst Botwinnik. Zeigt: Komplikationen bestrafen den Schwaeacheren."},
    {name: "Ivanchuk vs Yusupov", white: "Ivanchuk", black: "Yusupov", year: 1991, eco: "E67", opening: "Koenigsindisch", keyLesson: "Ein modernes Meisterwerk im Koenigsindischen. Zeigt perfekten Angriff auf dem Koenigsfluegel."},
    {name: "Anand vs Carlsen WM 2013", white: "Carlsen", black: "Anand", year: 2013, eco: "B51", opening: "Sizilianisch", keyLesson: "Carlsens unerbittlicher Druck in scheinbar remisen Stellungen. Der neue Stil: Technik plus Ausdauer."},
    {name: "Carlsen vs Karjakin WM 2016", white: "Carlsen", black: "Karjakin", year: 2016, eco: "C65", opening: "Spanisch", keyLesson: "Carlsen gewann die entscheidende Schnellpartie. Zeigt die Bedeutung von Nervenstaerke in kritischen Momenten."},
    {name: "Morphy Miniatur-Sammlung", white: "Morphy", black: "Verschiedene", year: 1858, eco: "C50", opening: "Italienisch", keyLesson: "Morphys 15+ Kurzpartien zeigen: Schnelle Entwicklung und offene Linien sind die Basis jedes Angriffs."},
    {name: "Capablanca Endspiel-Sammlung", white: "Capablanca", black: "Verschiedene", year: 1920, eco: "D30", opening: "Damengambit", keyLesson: "20+ perfekte Endspiele zeigen: Einfachheit und Praezision sind der Schluessel. Capablanca machte nie ueberflüssige Zuege."},
    {name: "Aljechin Angriffspartien", white: "Aljechin", black: "Verschiedene", year: 1930, eco: "D06", opening: "Damengambit", keyLesson: "15+ brillante Angriffspartien. Aljechin kombinierte tiefe Strategie mit explosiver Taktik wie kein anderer."},
    {name: "Fischer Sizilianisch-Perlen", white: "Fischer", black: "Verschiedene", year: 1970, eco: "B90", opening: "Najdorf", keyLesson: "10+ Najdorf-Meisterwerke. Fischer spielte den Najdorf wie kein anderer und brachte ihn zur Perfektion."},
    {name: "Kasparov Koenigsindisch", white: "Verschiedene", black: "Kasparov", year: 1990, eco: "E97", opening: "Koenigsindisch", keyLesson: "15+ KID-Partien die zeigen wie man als Schwarz dynamisch gegen das weisse Zentrum anspielt."},
    {name: "Karpov Spanisch-Meisterschaft", white: "Karpov", black: "Verschiedene", year: 1980, eco: "C78", opening: "Spanisch", keyLesson: "12+ Lektionen in positionellem Spanisch. Karpov quetschte jeden Tropfen Vorteil aus dieser Eroeffnung."},
    {name: "Tal Opferpartien", white: "Tal", black: "Verschiedene", year: 1960, eco: "B10", opening: "Verschiedene", keyLesson: "20+ spektakulaere Opferpartien. Tal: 'Es gibt zwei Arten von Opfern: korrekte und meine!' Mut wird belohnt."},
    {name: "Kramnik Berliner Mauer", white: "Verschiedene", black: "Kramnik", year: 2000, eco: "C65", opening: "Berliner", keyLesson: "8+ Partien die zeigen wie die Berliner Verteidigung selbst gegen die staerksten Angreifer haelt."},
    {name: "Carlsen Endspielkunst", white: "Carlsen", black: "Verschiedene", year: 2015, eco: "D37", opening: "Damengambit", keyLesson: "15+ Endspiele die zeigen wie Carlsen aus 'nichts' gewinnt. Technik, Geduld und Praezision auf hoechstem Niveau."}
  ];
});


/* ===== akademie.js ===== */
/* Schach-Kern: ChessAcademy (10 Stufen, 47 Aufgaben). Daten stehen woertlich in daten_akademie.js (aus Swift generiert).
   Swift: ChessAcademy.lessons(forLevel:), progress(profile:level:), isLevelUnlocked(profile:level:). */
(function (root, factory) {
  var K;
  if (typeof module === 'object' && module.exports) { require('./modelle.js'); require('./daten_akademie.js'); K = require('./namespace.js'); factory(K); module.exports = K; }
  else { K = root.SchachKern = root.SchachKern || {}; factory(K); }
})(typeof self !== 'undefined' ? self : this, function (K) {
  'use strict';

  var ChessAcademy = {
    levelInfo: K.Daten.levelInfo,                 // [{name, subtitle}] fuer Stufe 1..10 (Index 0..9)
    unlockQuote: K.Daten.unlockQuote,             // 0.7: Anteil geloester Aufgaben fuer die naechste Stufe
    lessons: K.Daten.lessons,                     // {id, level, title, teach, fen, prompt, solutions[], hint, successText, failText, freePlayMoves, freePlayAI, winByMate}

    lessonsForLevel: function (level) {           // Swift: lessons(forLevel:)
      return ChessAcademy.lessons.filter(function (l) { return l.level === level; });
    },
    lessonById: function (id) {
      for (var i = 0; i < ChessAcademy.lessons.length; i++) if (ChessAcademy.lessons[i].id === id) return ChessAcademy.lessons[i];
      return null;
    },
    // -> { done, total, stars }
    progress: function (profile, level) {
      var ls = ChessAcademy.lessonsForLevel(level), done = 0, stars = 0;
      var lp = (profile && profile.lessonProgress) || {};
      for (var i = 0; i < ls.length; i++) {
        var p = lp[ls[i].id];
        if (p && p.completed) { done += 1; stars += p.stars; }
      }
      return { done: done, total: ls.length, stars: stars };
    },
    isLevelUnlocked: function (profile, level) {
      if (level <= 1) return true;
      var prev = ChessAcademy.progress(profile, level - 1);
      if (!(prev.total > 0)) return true;
      return prev.done / prev.total >= ChessAcademy.unlockQuote;
    }
  };
  K.ChessAcademy = ChessAcademy;
});


/* ===== eroeffnungsbuch.js ===== */
/* Schach-Kern: ChessOpeningBook (87 Eintraege, Daten woertlich in daten_buch.js) + findOpening / nextBookMoves.
   Zuege als UCI-Text ("e2e4"). */
(function (root, factory) {
  var K;
  if (typeof module === 'object' && module.exports) { require('./modelle.js'); require('./daten_buch.js'); K = require('./namespace.js'); factory(K); module.exports = K; }
  else { K = root.SchachKern = root.SchachKern || {}; factory(K); }
})(typeof self !== 'undefined' ? self : this, function (K) {
  'use strict';

  function prefixEq(moves, entryMoves, n) {
    for (var i = 0; i < n; i++) if (moves[i] !== entryMoves[i]) return false;
    return true;
  }

  var ChessOpeningBook = {
    entries: K.Daten.openingEntries,   // {eco, name, moves[], explanation, bookSource}

    // Laengste passende Eroeffnung fuer die bisherigen Zuege (null, wenn keine)
    findOpening: function (moves) {
      if (!moves || moves.length === 0) return null;
      var best = null, es = ChessOpeningBook.entries;
      for (var i = 0; i < es.length; i++) {
        var e = es[i];
        if (moves.length >= e.moves.length && prefixEq(moves, e.moves, e.moves.length)) {
          if (best === null || e.moves.length > best.moves.length) best = e;
        }
      }
      return best;
    },

    // Moegliche naechste Buchzuege -> [{move, openingName}]
    nextBookMoves: function (moves) {
      var results = [], es = ChessOpeningBook.entries;
      for (var i = 0; i < es.length; i++) {
        var e = es[i];
        if (e.moves.length > moves.length && prefixEq(moves, e.moves, moves.length)) {
          var next = e.moves[moves.length];
          var dup = false;
          for (var j = 0; j < results.length; j++) if (results[j].move === next) { dup = true; break; }
          if (!dup) results.push({ move: next, openingName: e.name });
        }
      }
      return results;
    }
  };
  K.ChessOpeningBook = ChessOpeningBook;
});


/* ===== wissen.js ===== */
/* Schach-Kern: ChessKnowledgeBase (49 Buchkonzepte aus 20 Buechern, 33 beruehmte Partien). Daten woertlich in daten_wissen.js. */
(function (root, factory) {
  var K;
  if (typeof module === 'object' && module.exports) { require('./modelle.js'); require('./daten_wissen.js'); K = require('./namespace.js'); factory(K); module.exports = K; }
  else { K = root.SchachKern = root.SchachKern || {}; factory(K); }
})(typeof self !== 'undefined' ? self : this, function (K) {
  'use strict';

  var KB = {
    bookConcepts: K.Daten.bookConcepts,    // {book, author, category, concept, explanation}
    famousGames: K.Daten.famousGames,      // {name, white, black, year, eco, opening, keyLesson}

    // Zufaelliges Buchkonzept einer Kategorie ("eroeffnung", "mittelspiel", "endspiel", "taktik", "strategie", "psychologie")
    findConcept: function (category) {
      var m = KB.bookConcepts.filter(function (c) { return c.category === category; });
      if (m.length === 0) return null;
      return m[K.Zufall.ganz(m.length)];
    },
    // Zufaellige beruehmte Partie zur ECO (oder zum selben Anfangsbuchstaben - wie in Swift: eco.hasPrefix(Praefix der Partie))
    findFamousGame: function (eco) {
      var by = KB.famousGames.filter(function (g) { return g.eco === eco || eco.indexOf(g.eco.charAt(0)) === 0; });
      if (by.length === 0) return null;
      return by[K.Zufall.ganz(by.length)];
    },
    stats: function () {
      var set = {}, n = 0;
      KB.bookConcepts.forEach(function (c) { if (!set[c.book]) { set[c.book] = 1; n++; } });
      return { books: n, games: KB.famousGames.length, concepts: KB.bookConcepts.length };
    }
  };
  K.ChessKnowledgeBase = KB;
});


/* ===== ki.js ===== */
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


/* ===== tutorial.js ===== */
/* Schach-Kern: ChessTutorialEngine (Lernmodus: Tipps, Erklaerungen nach dem Zug, Figuren-Erklaerung).
   1:1 aus SchachSpiel.swift. Hunde-Team statt Paw Patrol: Ist K.Stil.hunde gesetzt, nennen Texte "Bruno (Koenig)" usw. */
(function (root, factory) {
  var K;
  if (typeof module === 'object' && module.exports) { require('./modelle.js'); require('./brett.js'); require('./ki.js'); K = require('./namespace.js'); factory(K); module.exports = K; }
  else { K = root.SchachKern = root.SchachKern || {}; factory(K); }
})(typeof self !== 'undefined' ? self : this, function (K) {
  'use strict';

  var Piece = K.Piece, ChessBoard = K.ChessBoard;
  var PAWN = 1, KNIGHT = 2, BISHOP = 3, ROOK = 4, QUEEN = 5, KING = 6;

  function ChessTutorialEngine() {
    this.aiEngine = new K.ChessAIEngine(4);
    this.reset();
  }
  ChessTutorialEngine.prototype.reset = function () {
    this.moveCount = 0;
    this.lastPieceMoved = null;
    this.lastWasCapture = false;
    this.hasBeenInCheck = false;
  };

  // -> { move, explanation }
  ChessTutorialEngine.prototype.getHint = function (board, color) {
    var moves = board.allLegalMoves(color);
    if (moves.length === 0) return { move: null, explanation: 'Keine Zuege moeglich!' };
    this.moveCount += 1;

    if (board.isInCheck(color)) {
      this.hasBeenInCheck = true;
      var best0 = this.aiEngine.bestMove(board, color) || moves[0];
      if (best0.isCastling) return { move: best0, explanation: 'Du stehst im Schach! Rochiere, um deinen Koenig in Sicherheit zu bringen.' };
      if (best0.capturedPiece) return { move: best0, explanation: 'Du stehst im Schach! Schlage die angreifende Figur, um das Schach abzuwehren.' };
      return { move: best0, explanation: 'Du stehst im Schach! Du musst den Koenig aus dem Schach ziehen. Der markierte Zug bringt ihn in Sicherheit.' };
    }
    var best = this.aiEngine.bestMove(board, color) || moves[0];
    return { move: best, explanation: this.explainMove(best, board, color, moves) };
  };

  ChessTutorialEngine.prototype.explainAfterMove = function (move, board, mover) {
    var parts = [];
    var movedPiece = board.piece(move.to);

    if (move.capturedPiece) {
      var capName = Piece.displayName(move.capturedPiece);
      var movName = movedPiece ? Piece.displayName(movedPiece.type) : 'Figur';
      parts.push(movName + ' schlaegt ' + capName + '!');
      if (Piece.value(move.capturedPiece) > (movedPiece ? Piece.value(movedPiece.type) : 0)) {
        parts.push('Guter Tausch - du hast eine wertvollere Figur geschlagen.');
      }
    }
    if (move.isCastling) {
      if (move.to.col === 6) parts.push('Kurze Rochade! Koenig und Turm tauschen Plaetze. Der Koenig steht jetzt sicher hinter den Bauern.');
      else parts.push('Lange Rochade! Der Koenig ist jetzt auf der Damenseite in Sicherheit.');
    }
    if (move.promotion) {
      parts.push('Bauernumwandlung! Der Bauer wird zur ' + Piece.displayName(move.promotion) + '. Meistens waehlt man die Dame (staerkste Figur).');
    }
    if (move.isEnPassant) {
      parts.push('En passant! Ein spezieller Bauernschlag: Wenn ein Bauer zwei Felder vorrueckt, kann der gegnerische Bauer ihn im Vorbeigehen schlagen.');
    }
    var opponent = 1 - mover;
    if (board.isInCheck(opponent)) {
      if (!board.hasLegalMoves(opponent)) parts.push('Schachmatt! Der gegnerische Koenig kann dem Schach nicht entkommen.');
      else parts.push('Schach! Der gegnerische Koenig wird angegriffen und muss reagieren.');
    }
    var whiteMat = board.countMaterial(0), blackMat = board.countMaterial(1);
    var diff = whiteMat - blackMat;
    if (Math.abs(diff) >= 200) {
      if (diff > 0) parts.push('Weiss hat Materialvorteil (' + Math.trunc(diff / 100) + ' Punkte).');
      else parts.push('Schwarz hat Materialvorteil (' + Math.trunc(-diff / 100) + ' Punkte).');
    }
    if (parts.length === 0) {
      if (this.moveCount <= 6) parts.push('Entwickle deine Figuren! Bringe Springer und Laeufer ins Spiel, bevor du rochierst.');
      else parts.push('Guter Zug. Achte auf die Kontrolle des Zentrums und die Sicherheit deines Koenigs.');
    }
    this.lastPieceMoved = movedPiece ? movedPiece.type : null;
    this.lastWasCapture = !!move.capturedPiece;
    return parts.join(' ');
  };

  ChessTutorialEngine.prototype.getOpeningTip = function () {
    return 'Willkommen im Lernmodus! Du spielst Weiss, dein Coach schaut dir ueber die Schulter.\n• 💡 Tipp: 1× = Denkanstoss, 2× = Loesung mit Pfeil und Begruendung\n• ↶ Zurück: letzten Zug zuruecknehmen und es besser machen\n• Nach jedem Zug sagt dir der Coach, ob etwas haengt – orange Ringe = Gefahr!\n• 🧊 3D-Brett: mit der Maus drehen, scrollen zum Zoomen, 🔄 wendet das Brett\nGrundregel: Springer und Laeufer entwickeln, Zentrum besetzen, frueh rochieren!';
  };

  // Swift: getPieceExplanation. Hunde-Team statt Paw Patrol (auch im 2D-Brett).
  ChessTutorialEngine.prototype.getPieceExplanation = function (type) {
    var intro = '';
    if (K.Stil.hunde) {
      intro = '🐶 Das ist ' + K.Stil.dogName(type) + ', der ' + K.Stil.dogBreed(type) + ' – ' +
        (Piece.isFeminine(type) ? 'deine' : 'dein') + ' ' + Piece.name(type) + '! ';
    }
    return intro + this.basePieceExplanation(type);
  };

  ChessTutorialEngine.prototype.basePieceExplanation = function (type) {
    switch (type) {
      case PAWN: return 'Bauer: Zieht 1 Feld vorwaerts (2 vom Start). Schlaegt diagonal. Erreicht er die letzte Reihe, wird er umgewandelt (meist zur Dame).';
      case KNIGHT: return 'Springer: Zieht in L-Form (2+1 Felder). Einzige Figur die ueber andere springen kann. Stark im Zentrum.';
      case BISHOP: return 'Laeufer: Zieht diagonal beliebig weit. Bleibt immer auf seiner Feldfarbe. Zwei Laeufer sind staerker als zwei Springer.';
      case ROOK: return 'Turm: Zieht horizontal und vertikal beliebig weit. Stark auf offenen Linien. Wert: ca. 5 Punkte.';
      case QUEEN: return 'Dame: Kombiniert Turm und Laeufer - zieht in alle Richtungen beliebig weit. Staerkste Figur (9 Punkte). Nicht zu frueh entwickeln!';
      case KING: return 'Koenig: Zieht 1 Feld in alle Richtungen. Kann rochieren (einmal pro Spiel). Darf nie ins Schach ziehen. Muss geschuetzt werden!';
    }
    return '';
  };

  ChessTutorialEngine.prototype.explainMove = function (move, board, color, allMoves) {
    var piece = board.piece(move.from);
    var pieceType = piece ? piece.type : PAWN;
    var dn = Piece.displayName;

    if (move.capturedPiece) {
      var attackerVal = Piece.value(pieceType), targetVal = Piece.value(move.capturedPiece);
      if (targetVal > attackerVal) {
        return 'Tipp: Schlage ' + dn(move.capturedPiece) + ' mit deinem ' + dn(pieceType) + '! Ein guter Tausch - du gewinnst Material.';
      }
      return 'Tipp: Du kannst ' + dn(move.capturedPiece) + ' schlagen. ' + dn(pieceType) + ' nimmt die gegnerische Figur.';
    }
    if (move.isCastling) {
      return 'Tipp: Rochiere jetzt! Rochade bringt den Koenig in Sicherheit und aktiviert den Turm. Ein sehr wichtiger Zug.';
    }
    if (this.moveCount <= 3) {
      if (pieceType === PAWN && (move.from.col === 3 || move.from.col === 4)) {
        return 'Tipp: Kontrolliere das Zentrum mit deinen Bauern (d- und e-Linie). Das gibt deinen Figuren mehr Raum.';
      }
      if (pieceType === KNIGHT || pieceType === BISHOP) {
        return 'Tipp: Entwickle deine Leichtfiguren (' + dn(pieceType) + ') frueh. Springer und Laeufer sollten vor der Dame ins Spiel kommen.';
      }
    }
    if (pieceType === PAWN) {
      var promoRow = color === 0 ? 0 : 7;
      var dist = Math.abs(move.to.row - promoRow);
      if (dist <= 2) return 'Tipp: Dein Bauer ist nah an der Umwandlung! Noch ' + dist + ' Felder bis zur Dame.';
    }
    if (move.to.row >= 3 && move.to.row <= 4 && move.to.col >= 3 && move.to.col <= 4) {
      return 'Tipp: ' + dn(pieceType) + ' ins Zentrum! Figuren im Zentrum kontrollieren mehr Felder und sind flexibler.';
    }
    if (pieceType === KNIGHT) {
      var tmp = ChessBoard.copyFrom(board);
      tmp.executeMove(move);
      var attacked = 0;
      for (var r = 0; r < 8; r++) for (var c = 0; c < 8; c++) {
        var p = tmp.grid[r][c];
        if (p && p.color === 1 - color && (p.type === ROOK || p.type === QUEEN || p.type === KING)) {
          if (tmp.isSquareAttacked({ row: r, col: c }, color)) attacked += 1;
        }
      }
      if (attacked >= 2) return 'Tipp: Springergabel! Der Springer greift mehrere wertvolle Figuren gleichzeitig an - ein starker taktischer Zug!';
    }
    var sq = String.fromCharCode(97 + move.to.col) + (8 - move.to.row);
    if (this.moveCount <= 10) return 'Tipp: ' + dn(pieceType) + ' nach ' + sq + '. Entwickle alle Figuren, bevor du angreifst.';
    return 'Tipp: Laut KI-Analyse ist ' + dn(pieceType) + ' nach ' + sq + ' der beste Zug in dieser Stellung.';
  };

  K.ChessTutorialEngine = ChessTutorialEngine;
});


/* ===== analyse.js ===== */
/* Schach-Kern: ChessTacticsDetector (Gabel, Fesselung, Spiess, Schach) und ChessPositionalAnalyzer (Bauern, Koenigssicherheit, Zentrum).
   1:1 aus SchachSpiel.swift. Alle Texte woertlich. */
(function (root, factory) {
  var K;
  if (typeof module === 'object' && module.exports) { require('./modelle.js'); require('./brett.js'); K = require('./namespace.js'); factory(K); module.exports = K; }
  else { K = root.SchachKern = root.SchachKern || {}; factory(K); }
})(typeof self !== 'undefined' ? self : this, function (K) {
  'use strict';

  var Piece = K.Piece, cap1 = K.cap1;
  var PAWN = 1, KNIGHT = 2, BISHOP = 3, ROOK = 4, QUEEN = 5, KING = 6;
  var DIRS8 = [[0, 1], [0, -1], [1, 0], [-1, 0], [1, 1], [1, -1], [-1, 1], [-1, -1]];
  var KNIGHT_T = [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]];

  var ChessTacticsDetector = {
    // Swift-Verhalten: detectSkewer bricht nach der ERSTEN gegnerischen Figur ab und kann daher nie ausloesen
    // (toter Code im Original). Mit true wird die Linie hinter der ersten Figur weiter untersucht (echter Spiess).
    spiessKorrigiert: false,

    // Gabel: eine Figur (Springer/Bauer) greift zwei oder mehr wertvolle Figuren gleichzeitig an
    detectFork: function (board, move, color) {
      var piece = board.piece(move.to);
      if (!piece) return null;
      var opponent = 1 - color, targets;
      if (piece.type === KNIGHT) targets = KNIGHT_T;
      else if (piece.type === PAWN) { var dir = color === 0 ? -1 : 1; targets = [[dir, -1], [dir, 1]]; }
      else return null;

      var attacked = [];
      for (var i = 0; i < targets.length; i++) {
        var r = move.to.row + targets[i][0], c = move.to.col + targets[i][1];
        if (!(r >= 0 && r < 8 && c >= 0 && c < 8)) continue;
        var t = board.grid[r][c];
        if (t && t.color === opponent) {
          if (t.type === KING || t.type === QUEEN || t.type === ROOK ||
              (piece.type === PAWN && (t.type === KNIGHT || t.type === BISHOP))) {
            attacked.push({ type: t.type, pos: { row: r, col: c } });
          }
        }
      }
      if (attacked.length >= 2) {
        var names = attacked.map(function (a) { return Piece.denName(a.type); }).join(' und ');
        if (piece.type === KNIGHT) {
          return 'Springergabel! ' + cap1(Piece.deinNom(piece.type)) + ' greift ' + names + " gleichzeitig an - ein starker taktischer Zug! (Nimzowitsch: 'Die Gabel ist die haeufigste Gewinnkombination.')";
        }
        return 'Bauerngabel! ' + cap1(Piece.deinNom(piece.type)) + ' greift ' + names + ' gleichzeitig an.';
      }
      return null;
    },

    // Fesselung durch eigene Laeufer/Tuerme/Damen
    detectPin: function (board, color) {
      var opponent = 1 - color;
      for (var r = 0; r < 8; r++) for (var c = 0; c < 8; c++) {
        var piece = board.grid[r][c];
        if (!piece || piece.color !== color) continue;
        var isDiagonal = (piece.type === BISHOP || piece.type === QUEEN);
        var isStraight = (piece.type === ROOK || piece.type === QUEEN);
        for (var d = 0; d < 8; d++) {
          var dr = DIRS8[d][0], dc = DIRS8[d][1];
          var diagonal = (dr !== 0 && dc !== 0);
          if (diagonal && !isDiagonal) continue;
          if (!diagonal && !isStraight) continue;
          var nr = r + dr, nc = c + dc, pinned = null;
          while (nr >= 0 && nr < 8 && nc >= 0 && nc < 8) {
            var target = board.grid[nr][nc];
            if (target) {
              if (target.color === opponent) {
                if (pinned === null) pinned = target.type;
                else {
                  if (target.type === KING || target.type === QUEEN || (target.type === ROOK && (pinned === KNIGHT || pinned === BISHOP))) {
                    return 'Fesselung! ' + cap1(Piece.derName(pinned)) + ' des Gegners ist gefesselt und schuetzt ' + Piece.denName(target.type) + ". (Pachman: 'Die Fesselung ist eines der maechtigsten taktischen Motive.')";
                  }
                  break;
                }
              } else {
                break;   // eigene Figur im Weg
              }
            }
            nr += dr; nc += dc;
          }
        }
      }
      return null;
    },

    // Spiess (umgekehrte Fesselung) - siehe Hinweis zu spiessKorrigiert
    detectSkewer: function (board, move, color) {
      var piece = board.piece(move.to);
      if (!piece) return null;
      var opponent = 1 - color;
      var isDiag = (piece.type === BISHOP || piece.type === QUEEN);
      var isStraight = (piece.type === ROOK || piece.type === QUEEN);
      for (var d = 0; d < 8; d++) {
        var dr = DIRS8[d][0], dc = DIRS8[d][1];
        var diagonal = (dr !== 0 && dc !== 0);
        if (diagonal && !isDiag) continue;
        if (!diagonal && !isStraight) continue;
        var nr = move.to.row + dr, nc = move.to.col + dc, first = null;
        while (nr >= 0 && nr < 8 && nc >= 0 && nc < 8) {
          var target = board.grid[nr][nc];
          if (target) {
            if (target.color === opponent) {
              if (first === null) {
                first = target.type;
                if (ChessTacticsDetector.spiessKorrigiert) { nr += dr; nc += dc; continue; }
              } else if (Piece.value(first) > Piece.value(target.type)) {
                return 'Spiess! ' + cap1(Piece.deinNom(piece.type)) + ' greift ' + Piece.denName(first) + ' an - dahinter steht ' + Piece.derName(target.type) + ". (Vukovic: 'Der Spiess ist die umgekehrte Fesselung.')";
              }
            }
            break;   // Swift: Abbruch nach der ersten gefundenen Figur (siehe spiessKorrigiert)
          }
          nr += dr; nc += dc;
        }
      }
      return null;
    },

    // Alle Figuren von `color`, die den Koenig auf kingPos direkt angreifen -> [Position]
    checkingPieces: function (board, kingPos, color) {
      var checkers = [];
      for (var r = 0; r < 8; r++) for (var c = 0; c < 8; c++) {
        var p = board.grid[r][c];
        if (!p || p.color !== color) continue;
        var from = { row: r, col: c };
        switch (p.type) {
          case PAWN: {
            var dir = color === 0 ? -1 : 1;
            if (kingPos.row === r + dir && Math.abs(kingPos.col - c) === 1) checkers.push(from);
            break;
          }
          case KNIGHT: {
            var ddr = Math.abs(kingPos.row - r), ddc = Math.abs(kingPos.col - c);
            if ((ddr === 2 && ddc === 1) || (ddr === 1 && ddc === 2)) checkers.push(from);
            break;
          }
          case KING:
            if (Math.abs(kingPos.row - r) <= 1 && Math.abs(kingPos.col - c) <= 1 && !(from.row === kingPos.row && from.col === kingPos.col)) checkers.push(from);
            break;
          default: {   // Laeufer, Turm, Dame
            var dr = kingPos.row - r, dc = kingPos.col - c;
            var diagonal = Math.abs(dr) === Math.abs(dc) && dr !== 0;
            var straight = (dr === 0) !== (dc === 0);
            var mayDiag = p.type === BISHOP || p.type === QUEEN;
            var mayStraight = p.type === ROOK || p.type === QUEEN;
            if ((diagonal && mayDiag) || (straight && mayStraight)) {
              var stepR = dr === 0 ? 0 : (dr > 0 ? 1 : -1);
              var stepC = dc === 0 ? 0 : (dc > 0 ? 1 : -1);
              var rr = r + stepR, cc = c + stepC, blocked = false;
              while (rr !== kingPos.row || cc !== kingPos.col) {
                if (board.grid[rr][cc]) { blocked = true; break; }
                rr += stepR; cc += stepC;
              }
              if (!blocked) checkers.push(from);
            }
          }
        }
      }
      return checkers;
    },

    // Schach / Abzugsschach / Doppelschach nach dem Zug (FIX #4)
    detectCheck: function (board, move, color) {
      var opponent = 1 - color;
      if (!board.isInCheck(opponent)) return null;
      var kingPos = board.findKing(opponent);
      if (!kingPos) return null;
      var checkers = ChessTacticsDetector.checkingPieces(board, kingPos, color);
      var movedGivesCheck = checkers.some(function (p) { return p.row === move.to.row && p.col === move.to.col; });
      if (checkers.length >= 2) return 'DOPPELSCHACH! Zwei Figuren greifen den Koenig gleichzeitig an - dagegen hilft nur ein Koenigszug!';
      if (!movedGivesCheck && checkers.length > 0) return 'Abzugsschach! Durch das Wegziehen der Figur wurde ein Angriff auf den Koenig freigelegt.';
      return 'Schach! Der Koenig wird angegriffen und muss reagieren.';
    },

    // Alle taktischen Motive nach dem Zug -> [Text]
    detectAll: function (board, move, color) {
      var T = ChessTacticsDetector, tactics = [], x;
      if ((x = T.detectFork(board, move, color))) tactics.push(x);
      if ((x = T.detectPin(board, color))) tactics.push(x);
      if ((x = T.detectSkewer(board, move, color))) tactics.push(x);
      if ((x = T.detectCheck(board, move, color))) tactics.push(x);
      return tactics;
    }
  };

  K.ChessTacticsDetector = ChessTacticsDetector;

  // ===================================================================================================
  var ChessPositionalAnalyzer = {
    isolatedPawns: function (board, color) {
      var cols = {};
      for (var r = 0; r < 8; r++) for (var c = 0; c < 8; c++) {
        var p = board.grid[r][c];
        if (p && p.color === color && p.type === PAWN) cols[c] = true;
      }
      var iso = [];
      for (var col = 0; col < 8; col++) {   // Swift: Set-Reihenfolge beliebig; hier aufsteigend
        if (cols[col] && !(cols[col - 1] || cols[col + 1])) iso.push(col);
      }
      return iso;
    },
    doubledPawns: function (board, color) {
      var doubled = [];
      for (var c = 0; c < 8; c++) {
        var n = 0;
        for (var r = 0; r < 8; r++) { var p = board.grid[r][c]; if (p && p.color === color && p.type === PAWN) n++; }
        if (n >= 2) doubled.push(c);
      }
      return doubled;
    },
    // -> [[row, col], ...]
    passedPawns: function (board, color) {
      var dir = color === 0 ? -1 : 1, opponent = 1 - color, passed = [];
      for (var r = 0; r < 8; r++) for (var c = 0; c < 8; c++) {
        var p = board.grid[r][c];
        if (!p || p.color !== color || p.type !== PAWN) continue;
        var isPassed = true, checkRow = r + dir;
        while (checkRow >= 0 && checkRow < 8) {
          for (var dc = -1; dc <= 1; dc++) {
            var cc = c + dc;
            if (cc >= 0 && cc < 8) {
              var b = board.grid[checkRow][cc];
              if (b && b.color === opponent && b.type === PAWN) { isPassed = false; break; }
            }
          }
          if (!isPassed) break;
          checkRow += dir;
        }
        if (isPassed) passed.push([r, c]);
      }
      return passed;
    },
    // -> { score, comment }
    kingSafety: function (board, color) {
      var k = board.findKing(color);
      if (!k) return { score: 0, comment: '' };
      var shieldRow = color === 0 ? k.row - 1 : k.row + 1;
      if (!(shieldRow >= 0 && shieldRow < 8)) return { score: -20, comment: 'Koenig ohne Bauernschild!' };
      var n = 0;
      for (var dc = -1; dc <= 1; dc++) {
        var c = k.col + dc;
        if (c >= 0 && c < 8) { var p = board.grid[shieldRow][c]; if (p && p.color === color && p.type === PAWN) n++; }
      }
      switch (n) {
        case 3: return { score: 15, comment: 'Solides Bauernschild vor dem Koenig.' };
        case 2: return { score: 5, comment: 'Bauernschild hat eine Luecke.' };
        case 1: return { score: -10, comment: 'Schwaches Bauernschild - der Koenig ist exponiert!' };
        default: return { score: -25, comment: "Kein Bauernschild! Der Koenig ist sehr verwundbar. (Vukovic: 'Ein exponierter Koenig ist eine permanente Schwaeche.')" };
      }
    },
    centerControl: function (board, color) {
      var sq = [[3, 3], [3, 4], [4, 3], [4, 4]], control = 0;
      for (var i = 0; i < 4; i++) {
        if (board.isSquareAttacked({ row: sq[i][0], col: sq[i][1] }, color)) control += 1;
        var p = board.grid[sq[i][0]][sq[i][1]];
        if (p && p.color === color) control += 2;
      }
      return control;
    },
    // Positionelle Zusammenfassung -> [Text]
    analyze: function (board, color) {
      var A = ChessPositionalAnalyzer, notes = [], opponent = 1 - color;
      var letter = function (c) { return String.fromCharCode(97 + c); };

      var iso = A.isolatedPawns(board, color);
      if (iso.length) notes.push('Isolierter Bauer auf ' + iso.map(letter).join(', ') + "-Linie. (Tarrasch: 'Isolierte Bauern verbreiten Truebsal.')");
      var oppIso = A.isolatedPawns(board, opponent);
      if (oppIso.length) notes.push('Gegner hat isolierten Bauern auf ' + oppIso.map(letter).join(', ') + '-Linie - eine Schwaeche zum Angreifen!');
      var dbl = A.doubledPawns(board, color);
      if (dbl.length) notes.push('Doppelbauern auf der ' + letter(dbl[0]) + '-Linie. Sie sind weniger beweglich.');
      var passed = A.passedPawns(board, color);
      if (passed.length) {
        var promoRow = color === 0 ? 0 : 7, closest = 8;
        passed.forEach(function (p) { closest = Math.min(closest, Math.abs(p[0] - promoRow)); });
        notes.push('Freibauer erkannt! Nur noch ' + closest + " Reihen bis zur Umwandlung. (Nimzowitsch: 'Freibauern muessen vorruecken!')");
      }
      var oppPassed = A.passedPawns(board, opponent);
      if (oppPassed.length) notes.push("Achtung: Gegner hat einen Freibauern! Blockieren! (Nimzowitsch: 'Blockiere Freibauern mit Figuren.')");

      var safety = A.kingSafety(board, color);
      if (safety.comment !== '') notes.push(safety.comment);

      var myCenter = A.centerControl(board, color), oppCenter = A.centerControl(board, opponent);
      if (myCenter > oppCenter + 3) notes.push("Starke Zentrumskontrolle! (Lasker: 'Wer das Zentrum beherrscht, beherrscht die Partie.')");
      else if (oppCenter > myCenter + 3) notes.push('Gegner dominiert das Zentrum. Versuche c5 oder f5 um gegenzuhalten.');
      return notes;
    }
  };
  K.ChessPositionalAnalyzer = ChessPositionalAnalyzer;
});


/* ===== coach.js ===== */
/* Schach-Kern: CoachTools (Abtausch-Rechnung SEE, haengende Figuren, Zugnotation) und ChessCoach
   (Denkanstoss / Loesung / Warnungen / Rueckmeldung). 1:1 aus SchachSpiel.swift (v3). Kein DOM -> Worker-tauglich. */
(function (root, factory) {
  var K;
  if (typeof module === 'object' && module.exports) { require('./modelle.js'); require('./brett.js'); require('./ki.js'); require('./analyse.js'); K = require('./namespace.js'); factory(K); module.exports = K; }
  else { K = root.SchachKern = root.SchachKern || {}; factory(K); }
})(typeof self !== 'undefined' ? self : this, function (K) {
  'use strict';

  var Piece = K.Piece, cap1 = K.cap1, ChessBoard = K.ChessBoard;
  var posToAlgebraic = K.posToAlgebraic, moveToUci = K.moveToUci;
  var PAWN = 1, KNIGHT = 2, BISHOP = 3, ROOK = 4, QUEEN = 5, KING = 6;
  var CVAL = [0, 100, 320, 330, 500, 900, 10000];   // Koenig "unendlich"
  function pkey(p) { return p.row * 8 + p.col; }
  function copy(b) { return ChessBoard.copyFrom(b); }

  var CoachTools = {
    val: function (t) { return CVAL[t]; },

    // Bauern-Einheiten huebsch ("1,5")
    pawns: function (cp) {
      var v = Math.abs(cp) / 100.0;
      var s = (v >= 9.5 || Math.abs(v - Math.round(v)) < 0.05) ? K.fmtFix(v, 0) : K.fmtFix(v, 1);
      return s.replace('.', ',');
    },

    // Billigster legaler Schlagzug von `color` auf `sq` (ohne en passant)
    cheapestCapture: function (sq, color, board) {
      var target = board.piece(sq);
      if (!target || target.color === color) return null;
      var best = null, bestVal = Infinity, ms = board.allLegalMoves(color);
      for (var i = 0; i < ms.length; i++) {
        var m = ms[i];
        if (!(m.to.row === sq.row && m.to.col === sq.col) || m.isEnPassant) continue;
        if (m.promotion && m.promotion !== QUEEN) continue;
        var pc = board.piece(m.from);
        var v = CVAL[pc ? pc.type : PAWN];
        if (v < bestVal) { bestVal = v; best = m; }
      }
      return best;
    },

    // Wie viel gewinnt `side` (>= 0), wenn sie auf `sq` zu schlagen beginnt und jederzeit aufhoeren darf
    seeGain: function (sq, side, board, depth) {
      depth = depth || 0;
      if (!(depth < 12)) return 0;
      var victim = board.piece(sq);
      if (!victim || victim.type === KING) return 0;
      var cap = CoachTools.cheapestCapture(sq, side, board);
      if (!cap) return 0;
      var tmp = copy(board);
      tmp.executeMove(cap);
      var gain = CVAL[victim.type];
      if (cap.promotion) gain += CVAL[cap.promotion] - 100;
      return Math.max(0, gain - CoachTools.seeGain(sq, 1 - side, tmp, depth + 1));
    },

    // Materialbilanz eines Zuges fuer den Ziehenden nach dem Abtausch auf dem Zielfeld (Centibauern; negativ = Verlust)
    exchangeResult: function (move, board) {
      var mover = board.piece(move.from);
      if (!mover) return 0;
      var gain = 0;
      if (move.capturedPiece) gain += CVAL[move.capturedPiece];
      if (move.promotion) gain += CVAL[move.promotion] - 100;
      var tmp = copy(board);
      tmp.executeMove(move);
      return gain - CoachTools.seeGain(move.to, 1 - mover.color, tmp);
    },

    // Figuren von `color`, die der Gegner mit Gewinn schlagen koennte -> [{pos, type, loss, attacker}] (groesster Verlust zuerst)
    hangingPieces: function (color, board) {
      var result = new Map(), ms = board.allLegalMoves(1 - color);
      for (var i = 0; i < ms.length; i++) {
        var m = ms[i];
        if (!m.capturedPiece || m.isEnPassant) continue;
        var victim = board.piece(m.to);
        if (!victim || victim.color !== color || victim.type === KING) continue;
        var g = CoachTools.exchangeResult(m, board);
        var k = pkey(m.to), old = result.get(k);
        if (g > 50 && (old ? old.loss : 0) < g) result.set(k, { pos: m.to, type: victim.type, loss: g, attacker: m });
      }
      var arr = Array.from(result.values());
      arr.sort(function (a, b) { return b.loss - a.loss; });
      return arr;
    },

    // Alle Zuege, mit denen `color` sofort mattsetzen koennte
    mateInOneMoves: function (color, board) {
      var r = [], ms = board.allLegalMoves(color);
      for (var i = 0; i < ms.length; i++) {
        var tmp = copy(board);
        tmp.executeMove(ms[i]);
        if (tmp.isInCheck(1 - color) && !tmp.hasLegalMoves(1 - color)) r.push(ms[i]);
      }
      return r;
    },

    // Deutscher Figurenbuchstabe (K D T L S, Bauer ohne)
    letter: function (t) { return t === PAWN ? '' : Piece.symbol(t); },

    // Deutsche Kurznotation: "Sf3", "exd5", "Lxc4+", "0-0", "e8=D#"
    san: function (m, board) {
      var p = board.piece(m.from);
      if (!p) return moveToUci(m);
      var s;
      if (m.isCastling) {
        s = m.to.col === 6 ? '0-0' : '0-0-0';
      } else {
        s = CoachTools.letter(p.type);
        var file = String.fromCharCode(97 + m.from.col);
        if (p.type === PAWN) {
          if (m.capturedPiece) s = file;
        } else {
          var others = board.allLegalMoves(p.color).filter(function (o) {
            if (!(o.to.row === m.to.row && o.to.col === m.to.col)) return false;
            if (o.from.row === m.from.row && o.from.col === m.from.col) return false;
            var q = board.piece(o.from);
            return !!q && q.type === p.type;
          });
          if (others.length) {
            if (!others.some(function (o) { return o.from.col === m.from.col; })) s += file;
            else if (!others.some(function (o) { return o.from.row === m.from.row; })) s += String(8 - m.from.row);
            else s += posToAlgebraic(m.from);
          }
        }
        if (m.capturedPiece) s += 'x';
        s += posToAlgebraic(m.to);
        if (m.promotion) s += '=' + CoachTools.letter(m.promotion);
      }
      var tmp = copy(board);
      tmp.executeMove(m);
      var opp = 1 - p.color;
      if (tmp.isInCheck(opp)) s += tmp.hasLegalMoves(opp) ? '+' : '#';
      return s;
    },

    // Kindgerechte Beschreibung: "Springer g1 → f3 (Sf3)"
    describe: function (m, board) {
      var pc = board.piece(m.from);
      var name = pc ? Piece.displayName(pc.type) : 'Figur';
      if (m.isCastling) return (m.to.col === 6 ? 'Kurze Rochade' : 'Lange Rochade') + ' (' + CoachTools.san(m, board) + ')';
      return name + ' ' + posToAlgebraic(m.from) + ' → ' + posToAlgebraic(m.to) + ' (' + CoachTools.san(m, board) + ')';
    },

    isPassedPawn: function (pos, color, board) {
      var p = board.piece(pos);
      if (!p || p.type !== PAWN || p.color !== color) return false;
      var dir = color === 0 ? -1 : 1, r = pos.row + dir;
      while (r >= 0 && r < 8) {
        for (var c = Math.max(0, pos.col - 1); c <= Math.min(7, pos.col + 1); c++) {
          var q = board.grid[r][c];
          if (q && q.type === PAWN && q.color !== color) return false;
        }
        r += dir;
      }
      return true;
    },

    // Ziele (gegnerische Figuren), die die Figur auf `from` direkt angreift -> [[pos, type]]
    attackedTargets: function (from, board) {
      var p = board.piece(from);
      if (!p) return [];
      var out = [], ms = board.pseudoLegalMoves(p.color);
      for (var i = 0; i < ms.length; i++) {
        var m = ms[i];
        if (m.from.row === from.row && m.from.col === from.col && m.capturedPiece && !m.isEnPassant) {
          var t = board.piece(m.to);
          if (t) out.push([m.to, t.type]);
        }
      }
      return out;
    },

    pieceCount: function (board) { return board.pieceCount(); },

    // Eroeffnungsphase: fast alle Figuren und fruehe Zugnummer
    isOpeningPhase: function (b) { return b.fullMoveNumber <= 12 && CoachTools.pieceCount(b) >= 26; },

    // Folgt der Zug den Eroeffnungsprinzipien? bookMoves = Set<UCI>, hanging = Set<posKey>
    isPrincipledOpeningMove: function (m, board, bookMoves, hanging) {
      if (m.isCastling || m.capturedPiece || bookMoves.has(moveToUci(m))) return true;
      var p = board.piece(m.from);
      if (!p) return true;
      if (hanging.has(pkey(m.from))) return true;
      switch (p.type) {
        case KNIGHT: case BISHOP: return true;
        case PAWN: if (m.from.col >= 2 && m.from.col <= 4) return true; break;
      }
      var after = copy(board);
      after.executeMove(m);
      return after.isInCheck(1 - p.color);
    }
  };
  K.CoachTools = CoachTools;

  // =====================================================================================================
  // Der Coach rechnet mit eigener, fehlerfreier Engine (Stufe 10, keine Anfaenger-Wackler)
  function ChessCoach() { this.engine = new K.ChessAIEngine(10); }

  // history = bisherige Zuege als UCI-Texte. -> CoachAdvice {move, nudge, full, focus, dangerSquares}
  ChessCoach.prototype.advise = function (board, color, history, budget) {
    if (budget === undefined) budget = 130000;
    history = history || [];
    var legal = board.allLegalMoves(color);
    if (legal.length === 0) return { move: null, nudge: 'Keine Zuege moeglich.', full: 'Keine Zuege moeglich.', focus: null, dangerSquares: [] };
    var opp = 1 - color;
    var rk = this.engine.rankMoves(board, color, 4, budget, 150);
    var ranked = rk.ranked, depth = rk.depth;
    var best = ranked[0];
    var homeRow = color === 0 ? 7 : 0;

    // Eroeffnungsbuch: der haeufigste Theoriezug wird bevorzugt, wenn er (fast) gleich gut ist
    var bookName = null, bookCounts = {}, bookNames = {}, i;
    if (history.length < 20) {
      var nb = K.ChessOpeningBook.nextBookMoves(history);
      for (i = 0; i < nb.length; i++) {
        bookCounts[nb[i].move] = (bookCounts[nb[i].move] || 0) + 1;
        if (bookNames[nb[i].move] === undefined) bookNames[nb[i].move] = nb[i].openingName;
      }
    }
    var hasBook = Object.keys(bookCounts).length > 0;
    if (best.score < 90000 && hasBook) {
      var pick = null, pc = -1, ps = -Infinity;
      for (i = 0; i < ranked.length; i++) {
        var r = ranked[i], cnt = bookCounts[moveToUci(r.move)];
        if (cnt !== undefined && best.score - r.score <= 40) {
          if (pick === null || pc < cnt || (pc === cnt && ps < r.score)) { pick = r; pc = cnt; ps = r.score; }
        }
      }
      if (pick) { best = pick; bookName = bookNames[moveToUci(pick.move)]; }
    }
    // In der Eroeffnung nur "prinzipielle" Zuege empfehlen
    var openingPhase = CoachTools.isOpeningPhase(board);
    var bookSet = new Set(Object.keys(bookCounts));
    var hangSet = new Set();
    if (openingPhase) CoachTools.hangingPieces(color, board).forEach(function (h) { hangSet.add(pkey(h.pos)); });
    var principled = function (m) { return !openingPhase || CoachTools.isPrincipledOpeningMove(m, board, bookSet, hangSet); };
    if (bookName === null && best.score < 90000 && !principled(best.move)) {
      for (i = 0; i < ranked.length; i++) {
        if (principled(ranked[i].move) && best.score - ranked[i].score <= 30) { best = ranked[i]; break; }
      }
    }

    var move = best.move;
    var pTypeP = board.piece(move.from);
    var pType = pTypeP ? pTypeP.type : PAWN;
    var after = copy(board);
    after.executeMove(move);
    var sanStr = CoachTools.san(move, board);
    var hangingBefore = CoachTools.hangingPieces(color, board);
    var hangingAfter = CoachTools.hangingPieces(color, after);
    var exch = CoachTools.exchangeResult(move, board);

    var reasons = [], nudge = null, focus = move.from;

    // 1) Matt
    if (best.score >= 90000) {
      var plies = depth - (best.score - 100000);
      var n = Math.max(1, Math.trunc((plies + 1) / 2));
      if (after.isInCheck(opp) && !after.hasLegalMoves(opp)) {
        reasons.push('SCHACHMATT! ' + sanStr + ' setzt sofort matt – der Koenig kann nirgends mehr hin.');
        nudge = 'Hier gibt es ein Matt in 1! Welche Figur kann den Koenig so angreifen, dass er nicht mehr entkommt?';
      } else {
        reasons.push('Erzwingt Matt in ' + n + ' Zuegen – egal, was der Gegner macht.');
        nudge = 'Hier ist ein erzwungenes Matt drin (in ' + n + ' Zuegen)! Suche Schachgebote, die dem Koenig die Fluchtfelder nehmen.';
      }
    }

    // 2) Selbst im Schach
    if (board.isInCheck(color)) {
      if (nudge === null) nudge = 'Du stehst im Schach! Es gibt drei Wege: Koenig wegziehen, eine Figur dazwischenstellen oder den Angreifer schlagen. Welcher ist hier am sichersten?';
      if (move.capturedPiece) reasons.push('Schlaegt die Figur, die Schach gibt.');
      else if (pType === KING) reasons.push('Der Koenig geht auf ein sicheres Feld.');
      else reasons.push('Stellt eine Figur dazwischen und blockt das Schach.');
    }

    // 3) Material gewinnen
    if (move.capturedPiece && exch >= 90) {
      var cap = move.capturedPiece;
      var free = exch >= CoachTools.val(cap) - 20;
      reasons.push(free
        ? 'Gewinnt Material: ' + cap1(Piece.derName(cap)) + ' auf ' + posToAlgebraic(move.to) + ' ist nicht gedeckt (+' + CoachTools.pawns(exch) + ').'
        : 'Gewinnt Material: Auch nach dem Zurueckschlagen bleibst du vorn (+' + CoachTools.pawns(exch) + ').');
      if (nudge === null) {
        nudge = 'Schau genau hin: Eine gegnerische Figur ist nicht genug gedeckt. Welche kannst du gewinnbringend schlagen?';
        focus = move.to;
      }
    }

    // 4) Bedrohte eigene Figur retten
    if (hangingBefore.length) {
      var h = hangingBefore[0];
      var lossAfter = hangingAfter.length ? hangingAfter[0].loss : 0;
      if (lossAfter < h.loss - 50) {
        var ap = board.piece(h.attacker.from);
        var attackerT = ap ? ap.type : PAWN;
        reasons.push('Rettet ' + Piece.deinAkk(h.type) + ' auf ' + posToAlgebraic(h.pos) + ' – ' + Piece.pronoun(h.type) + ' wurde ' + Piece.vomName(attackerT) + ' auf ' + posToAlgebraic(h.attacker.from) + ' angegriffen und war nicht genug gedeckt.');
        if (nudge === null) {
          nudge = 'Achtung, Gefahr! Eine deiner Figuren wird angegriffen und ist nicht genug gedeckt. Schau dir die orange markierte Figur an.';
          focus = h.pos;
        }
      }
    }

    // 5) Taktik nach dem Zug: Doppelangriff, Schach, Spiess, Fesselung
    var targets = CoachTools.attackedTargets(move.to, after).filter(function (t) { return t[1] === KING || CoachTools.val(t[1]) >= 300; });
    if (targets.length >= 2) {
      var names = targets.map(function (t) { return t[1] === KING ? 'den Koenig' : Piece.denName(t[1]); });
      reasons.push('Doppelangriff! ' + cap1(Piece.derName(pType)) + ' greift ' + names.join(' und ') + ' gleichzeitig an – beides kann der Gegner nicht retten.');
      if (nudge === null) nudge = 'Suche einen Doppelangriff: Eine deiner Figuren kann zwei Ziele auf einmal angreifen. Denk besonders an ' + Piece.deinAkk(pType) + '!';
    } else if (after.isInCheck(opp) && best.score < 90000) {
      reasons.push('Gibt Schach – der Gegner muss reagieren und du behaeltst die Initiative.');
    }
    var sk = K.ChessTacticsDetector.detectSkewer(after, move, color);
    if (sk) reasons.push(sk);
    if (K.ChessTacticsDetector.detectPin(board, color) === null) {
      var pin = K.ChessTacticsDetector.detectPin(after, color);
      if (pin !== null) reasons.push(pin);
    }

    // 6) Neue Drohung, die der Zug aufstellt
    var theirBefore = new Set(CoachTools.hangingPieces(opp, board).map(function (x) { return pkey(x.pos); }));
    if (!move.capturedPiece) {
      var theirAfter = CoachTools.hangingPieces(opp, after);
      if (theirAfter.length && !theirBefore.has(pkey(theirAfter[0].pos))) {
        var t0 = theirAfter[0];
        reasons.push('Droht, ' + Piece.denName(t0.type) + ' auf ' + posToAlgebraic(t0.pos) + ' zu gewinnen.');
      }
    }
    if (best.score < 90000) {
      var mm = CoachTools.mateInOneMoves(color, after);
      if (mm.length) reasons.push('Droht Matt mit ' + CoachTools.san(mm[0], after) + '!');
    }

    // 7) Eroeffnung & Grundprinzipien
    if (bookName !== null) reasons.push('📖 Eroeffnungstheorie: ' + bookName + '.');
    if (reasons.length === 0 || bookName !== null) {
      if (move.isCastling) {
        reasons.push('Rochade: Der Koenig kommt in Sicherheit und der Turm ins Spiel.');
      } else if ((pType === KNIGHT || pType === BISHOP) && move.from.row === homeRow) {
        reasons.push('Entwickelt eine Leichtfigur – je schneller alle Figuren mitspielen, desto staerker bist du.');
      } else if (pType === PAWN && move.to.row >= 3 && move.to.row <= 4 && move.to.col >= 3 && move.to.col <= 4) {
        reasons.push('Besetzt das Zentrum – von dort kontrollieren deine Figuren das ganze Brett.');
      }
    }
    if (reasons.length === 0) {
      var pieces = CoachTools.pieceCount(board);
      var ownPawnOnFile = false;
      for (var rr = 0; rr < 8; rr++) {
        var q = after.grid[rr][move.to.col];
        if (q && q.type === PAWN && q.color === color) { ownPawnOnFile = true; break; }
      }
      if (pType === ROOK && !ownPawnOnFile) {
        reasons.push('Der Turm geht auf eine offene Linie – dort ist er am staerksten.');
      } else if (pType === PAWN && CoachTools.isPassedPawn(move.to, color, after)) {
        reasons.push('Schiebt den Freibauern vor – kein gegnerischer Bauer kann ihn mehr aufhalten.');
      } else if (pType === KING && pieces <= 12) {
        reasons.push('Im Endspiel ist der Koenig eine starke Kampffigur – ab Richtung Zentrum!');
      } else {
        var mobBefore = board.allLegalMoves(color).length;
        var mobAfter = after.allLegalMoves(color).length;
        if (mobAfter - mobBefore >= 4) reasons.push('Macht deine Figuren beweglicher (+' + (mobAfter - mobBefore) + ' Zugmoeglichkeiten).');
        else reasons.push('Der Coach hat ' + Math.max(depth, 1) + ' Halbzuege vorausgerechnet: Dieser Zug haelt deine Stellung am besten zusammen.');
      }
    }
    if (nudge === null) nudge = 'Denk an die Grundregeln: Figuren entwickeln, Zentrum kontrollieren, Koenig in Sicherheit bringen. Schau dir mal ' + Piece.deinAkk(pType) + ' an!';

    // Erwartete Antwort des Gegners
    var replyLine = null;
    if (best.score < 90000 && after.hasLegalMoves(opp)) {
      var rp = this.engine.rankMoves(after, opp, 3, 25000, 150).ranked;
      if (rp.length) replyLine = '↪ Erwartete Antwort: ' + CoachTools.san(rp[0].move, after);
    }

    // Alternativen
    var alts = [], lim = Math.min(8, ranked.length);
    for (i = 0; i < lim; i++) {
      var alt = ranked[i];
      if (K.moveEq(alt.move, move) || alts.length >= 2 || !principled(alt.move)) continue;
      var diff = best.score - alt.score;
      if (diff > 90 || (alt.score >= 90000) !== (best.score >= 90000)) continue;
      var tag = diff <= 15 ? 'gleich stark' : '−' + CoachTools.pawns(diff);
      alts.push(CoachTools.san(alt.move, board) + ' (' + tag + ')');
    }

    // Fallen-Warnung: verlockender Schlagzug, der Material kostet
    var trap = null;
    var tempting = legal.filter(function (m) { return m.capturedPiece && !K.moveEq(m, move); })
      .map(function (m) { return [m, CoachTools.exchangeResult(m, board)]; })
      .filter(function (x) { return x[1] < -50 && CoachTools.val(x[0].capturedPiece) >= 300; });
    tempting.sort(function (a, b) { return CoachTools.val(b[0].capturedPiece) - CoachTools.val(a[0].capturedPiece); });
    if (tempting.length) {
      trap = '⚠️ Vorsicht Falle: ' + CoachTools.san(tempting[0][0], board) + ' sieht verlockend aus, kostet aber nach dem Zurueckschlagen etwa ' + CoachTools.pawns(-tempting[0][1]) + ' Bauern.';
    }

    // Stellungsbewertung
    var evalLine;
    if (best.score >= 90000) evalLine = 'Bewertung: Matt ist sicher! 🏆';
    else if (best.score <= -90000) evalLine = 'Bewertung: Leider ist Matt nicht mehr zu verhindern – mach es dem Gegner so schwer wie moeglich.';
    else {
      var v = best.score / 100.0;
      var txt = K.fmtFix(v, 1, true).replace('.', ',');
      var word = Math.abs(v) < 0.3 ? 'ausgeglichen' : (v > 0 ? 'du stehst besser' : 'der Gegner steht besser');
      evalLine = 'Bewertung nach dem Zug: ' + txt + ' (' + word + ')';
    }

    var full = '💡 EMPFEHLUNG: ' + CoachTools.describe(move, board) + '\n';
    full += reasons.slice(0, 3).map(function (x) { return '• ' + x; }).join('\n');
    if (replyLine) full += '\n' + replyLine;
    if (alts.length) full += '\n➕ Auch gut: ' + alts.join(' · ');
    if (trap) full += '\n' + trap;
    full += '\n' + evalLine;

    return { move: move, nudge: '🤔 DENKANSTOSS: ' + nudge, full: full, focus: focus, dangerSquares: hangingBefore.map(function (x) { return x.pos; }) };
  };

  // Rueckmeldung nach dem EIGENEN Zug (Lernmodus) -> { text, danger: [Position] }
  ChessCoach.prototype.feedbackAfterOwnMove = function (before, after, move, color) {
    var parts = [], danger = [], opp = 1 - color;
    var mp = after.piece(move.to);
    var movedType = mp ? mp.type : PAWN;

    if (move.capturedPiece) {
      var cap = move.capturedPiece;
      var ex = CoachTools.exchangeResult(move, before);
      if (ex >= CoachTools.val(cap) - 20) parts.push('✅ Du schlaegst ' + Piece.denName(cap) + ' – ' + Piece.pronoun(cap) + ' war nicht gedeckt: +' + CoachTools.pawns(ex) + '.');
      else if (ex > 20) parts.push('✅ Guter Tausch: Auch nach dem Zurueckschlagen gewinnst du etwa ' + CoachTools.pawns(ex) + '.');
      else if (ex >= -20) parts.push('Gleicher Tausch – das Material bleibt ausgeglichen.');
      else parts.push('⚠️ Vorsicht: ' + cap1(Piece.derName(cap)) + ' war gedeckt. Nach dem Zurueckschlagen verlierst du etwa ' + CoachTools.pawns(-ex) + '.');
    }
    if (move.isCastling) {
      parts.push(move.to.col === 6
        ? 'Kurze Rochade! Dein Koenig steht jetzt sicher hinter den Bauern.'
        : 'Lange Rochade! Der Koenig ist auf der Damenseite in Sicherheit, der Turm steht schon im Zentrum.');
    }
    if (move.promotion) parts.push('Bauernumwandlung zur ' + Piece.displayName(move.promotion) + '!');
    if (move.isEnPassant) parts.push('En passant! Der Bauer wurde im Vorbeigehen geschlagen.');
    if (after.isInCheck(opp)) parts.push(after.hasLegalMoves(opp) ? 'Schach! Der Gegner muss reagieren.' : 'SCHACHMATT! 🎉');

    var hangBefore = new Set(CoachTools.hangingPieces(color, before).map(function (h) { return pkey(h.pos); }));
    var hangAfter = CoachTools.hangingPieces(color, after);
    hangAfter.slice(0, 2).forEach(function (h) {
      var ap = after.piece(h.attacker.from);
      var attT = ap ? ap.type : PAWN;
      if (h.pos.row === move.to.row && h.pos.col === move.to.col) {
        parts.push('⚠️ Achtung: ' + cap1(Piece.deinNom(h.type)) + ' auf ' + posToAlgebraic(h.pos) + ' kann jetzt ' + Piece.vomName(attT) + ' geschlagen werden!');
        danger.push(h.pos);
      } else if (!hangBefore.has(pkey(h.pos))) {
        parts.push('⚠️ Durch diesen Zug haengt jetzt ' + Piece.deinNom(h.type) + ' auf ' + posToAlgebraic(h.pos) + '.');
        danger.push(h.pos);
      }
    });
    if (hangBefore.size > 0 && hangAfter.length === 0) parts.push('👍 Gut – deine bedrohte Figur ist jetzt in Sicherheit.');
    if (after.hasLegalMoves(opp)) {
      var mm = CoachTools.mateInOneMoves(opp, after);
      if (mm.length) {
        parts.push('🚨 GEFAHR: Jetzt droht ' + CoachTools.san(mm[0], after) + ' Matt! (↶ Zurueck hilft)');
        danger.push(mm[0].to);
      }
    }

    // v3: Klassischer Anfaengerfehler: f-Bauer frueh ziehen schwaecht den Koenig
    if (movedType === PAWN && move.from.col === 5 && before.fullMoveNumber <= 12) {
      var k = after.findKing(color);
      if (k && k.row === (color === 0 ? 7 : 0) && k.col >= 4) {
        var diag = color === 0 ? 'e1–h4' : 'e8–h5';
        parts.push('⚠️ Tipp: Der f-Bauer beschuetzt deinen Koenig. Wenn er frueh zieht, wird die Diagonale ' + diag + ' schwach – Vorsicht vor Angriffen der gegnerischen Dame!');
      }
    }

    if (parts.length === 0) {
      var homeRow = color === 0 ? 7 : 0;
      if ((movedType === KNIGHT || movedType === BISHOP) && move.from.row === homeRow) {
        parts.push('👍 Figur entwickelt – so kommen deine Kaempfer ins Spiel.');
      } else if (movedType === PAWN && move.to.row >= 3 && move.to.row <= 4 && move.to.col >= 3 && move.to.col <= 4) {
        parts.push('👍 Bauer ins Zentrum – das gibt deinen Figuren Platz.');
      } else if (movedType === QUEEN && before.fullMoveNumber <= 6) {
        parts.push('Tipp: Die Dame so frueh zu ziehen ist riskant – sie kann von kleineren Figuren gejagt werden.');
      } else if (movedType === KING && !move.isCastling && CoachTools.pieceCount(after) > 16) {
        parts.push('Tipp: Im Mittelspiel sollte der Koenig lieber sicher stehen – denk an die Rochade.');
      } else {
        parts.push('Solider Zug. Pruefe nach jedem gegnerischen Zug: Was greift er an? Was droht er?');
      }
    }
    return { text: parts.join(' '), danger: danger };
  };

  // Nach dem Zug des GEGNERS: Was spielte er, was droht jetzt? (fuer den Menschen `defender`) -> { text, danger }
  ChessCoach.prototype.threatReport = function (after, before, move, defender) {
    var opp = 1 - defender, parts = [], danger = [];
    parts.push('Der Gegner spielte ' + CoachTools.describe(move, before) + '.');
    if (move.capturedPiece) parts.push('Er hat ' + Piece.deinAkk(move.capturedPiece) + ' geschlagen – kannst du zurueckschlagen?');
    if (after.isInCheck(defender)) parts.push('Du stehst im SCHACH!');
    var mm = CoachTools.mateInOneMoves(opp, after);
    if (mm.length) {
      parts.push('🚨 Er droht Matt mit ' + CoachTools.san(mm[0], after) + '! Verteidige dich!');
      danger.push(mm[0].to);
    }
    CoachTools.hangingPieces(defender, after).slice(0, 2).forEach(function (h) {
      var ap = after.piece(h.attacker.from);
      var attT = ap ? ap.type : PAWN;
      parts.push('⚠️ ' + cap1(Piece.deinNom(h.type)) + ' auf ' + posToAlgebraic(h.pos) + ' wird ' + Piece.vomName(attT) + ' angegriffen und ist nicht genug gedeckt.');
      danger.push(h.pos);
    });
    if (danger.length === 0 && !after.isInCheck(defender)) parts.push('Keine direkte Drohung – du kannst in Ruhe deinen Plan verfolgen.');
    return { text: parts.join(' '), danger: danger };
  };

  K.ChessCoach = ChessCoach;
});


/* ===== bewertung.js ===== */
/* Schach-Kern: MoveClassification, ChessMoveRater (Zugwert 1-15), ChessMoveAnalyzer (Zuganalyse + Zusammenfassung).
   1:1 aus SchachSpiel.swift (v3.1). Kein DOM -> Worker-tauglich. */
(function (root, factory) {
  var K;
  if (typeof module === 'object' && module.exports) { require('./modelle.js'); require('./brett.js'); require('./ki.js'); require('./eroeffnungsbuch.js'); require('./wissen.js'); require('./analyse.js'); require('./coach.js'); K = require('./namespace.js'); factory(K); module.exports = K; }
  else { K = root.SchachKern = root.SchachKern || {}; factory(K); }
})(typeof self !== 'undefined' ? self : this, function (K) {
  'use strict';

  var Piece = K.Piece, cap1 = K.cap1, ChessBoard = K.ChessBoard, CoachTools = K.CoachTools;
  var PAWN = 1, KNIGHT = 2, BISHOP = 3, ROOK = 4, QUEEN = 5, KING = 6;
  function pkey(p) { return p.row * 8 + p.col; }

  // ---------- MoveClassification (Swift-Enum mit rawValue-Symbol) ----------
  var CLS = {
    brilliant: { symbol: '!!', germanName: 'Brillanter Zug' },
    good: { symbol: '!', germanName: 'Guter Zug' },
    book: { symbol: '📖', germanName: 'Buchzug' },
    neutral: { symbol: '', germanName: 'Solider Zug' },
    inaccuracy: { symbol: '?!', germanName: 'Ungenauigkeit' },
    mistake: { symbol: '?', germanName: 'Fehler' },
    blunder: { symbol: '??', germanName: 'Grober Fehler' }
  };
  K.MoveClassification = {
    brilliant: 'brilliant', good: 'good', book: 'book', neutral: 'neutral', inaccuracy: 'inaccuracy', mistake: 'mistake', blunder: 'blunder',
    rawValue: function (c) { return CLS[c].symbol; },       // Swift: rawValue ("!!", "!", "📖", "", "?!", "?", "??")
    germanName: function (c) { return CLS[c].germanName; }
  };

  // ---------- Zugbewertung 1-15 ----------
  function ChessMoveRater() { this.engine = new K.ChessAIEngine(3); }

  // -> MoveRating { value, text, scoreForMover, bestMove }
  ChessMoveRater.prototype.rate = function (move, boardBefore, boardAfter, color, history) {
    history = history || [];
    var opponent = 1 - color;

    // Matt gesetzt? Sofort Bestnote.
    if (boardAfter.isInCheck(opponent) && !boardAfter.hasLegalMoves(opponent)) {
      return { value: 15, text: 'SCHACHMATT! Der perfekte Abschluss - besser geht es nicht.', scoreForMover: 5000, bestMove: move };
    }

    // v3.1: 3 Halbzuege tief
    var rk = this.engine.rankMoves(boardBefore, color, 3, 170000);
    var ranked = rk.ranked;
    if (ranked.length === 0) return { value: 8, text: 'Keine Alternativen vorhanden.', scoreForMover: 0, bestMove: null };
    var top = ranked[0];
    var bestMove = top.move, bestScore = top.score;
    var playedScore = null, i;
    for (i = 0; i < ranked.length; i++) if (K.moveEq(ranked[i].move, move)) { playedScore = ranked[i].score; break; }
    if (playedScore === null) playedScore = -this.engine.shallowScore(boardAfter, opponent, 1);
    var cap = function (x) { return Math.max(-3000, Math.min(3000, x)); };
    var mate = 90000;

    var value, special = null;
    if (bestScore >= mate && playedScore < mate) {
      value = playedScore > 150 ? 7 : 5;
      special = 'Du hattest ein erzwungenes Matt – das hast du verpasst!';
    } else if (playedScore <= -mate && bestScore > -mate) {
      value = 1;
      special = 'Achtung: Dieser Zug erlaubt dem Gegner ein Matt!';
    } else if (bestScore >= mate && playedScore >= mate) {
      value = playedScore >= bestScore - 1 ? 15 : 13;
      special = 'Das Matt ist nicht mehr aufzuhalten!';
    } else {
      var loss = Math.max(0, cap(bestScore) - cap(playedScore));
      if (loss === 0) value = 14;
      else if (loss <= 15) value = 13;
      else if (loss <= 35) value = 12;
      else if (loss <= 60) value = 11;
      else if (loss <= 90) value = 10;
      else if (loss <= 130) value = 8;
      else if (loss <= 200) value = 7;
      else if (loss <= 290) value = 5;
      else if (loss <= 450) value = 4;
      else if (loss <= 700) value = 2;
      else value = 1;
      // Bonus: bester Zug UND gewinnt Material oder gibt Schach -> 15
      if (loss === 0) {
        var capturedValue = move.capturedPiece ? Piece.value(move.capturedPiece) : 0;
        if (capturedValue >= 300 || boardAfter.isInCheck(opponent) || move.promotion) value = 15;
      }
    }

    // v3.1: Eroeffnungsprinzipien - Obergrenze mit Begruendung
    var principleNote = null;
    if (value > 8 && value < 15 && CoachTools.isOpeningPhase(boardBefore)) {
      var book = new Set(K.ChessOpeningBook.nextBookMoves(history).map(function (x) { return x.move; }));
      var hang = new Set(CoachTools.hangingPieces(color, boardBefore).map(function (h) { return pkey(h.pos); }));
      var ok = function (m) { return CoachTools.isPrincipledOpeningMove(m, boardBefore, book, hang); };
      if (!ok(move)) {
        var tp = boardBefore.piece(move.from);
        var t = tp ? tp.type : PAWN;
        if (t === PAWN && move.from.col === 5) {
          value = Math.min(value, 8);
          principleNote = 'Der f-Bauer schuetzt deinen Koenig – frueh gezogen schwaecht er die Koenigsstellung.';
        } else if (t === QUEEN) {
          value = Math.min(value, 9);
          principleNote = 'Die Dame so frueh ins Spiel zu bringen ist riskant – kleinere Figuren koennen sie jagen und gewinnen dabei Zeit.';
        } else if (t === KING) {
          value = Math.min(value, 8);
          principleNote = 'Den Koenig ohne Rochade zu ziehen kostet das Rochaderecht und Zeit.';
        } else if (t === ROOK) {
          value = Math.min(value, 9);
          principleNote = 'Tuerme kommen erst nach der Entwicklung der Leichtfiguren ins Spiel.';
        } else {
          value = Math.min(value, 10);
          principleNote = 'In der Eroeffnung zaehlen Entwicklung, Zentrum und Koenigssicherheit – dieser Randbauern-Zug hilft dabei wenig.';
        }
        // Als "besser" einen prinzipiellen Zug nennen, der (fast) so gut rechnet
        for (i = 0; i < ranked.length; i++) {
          if (ok(ranked[i].move) && top.score - ranked[i].score <= 60) { bestMove = ranked[i].move; break; }
        }
      }
    }

    var text;
    switch (value) {
      case 15: text = 'Perfekt! Der staerkste Zug in dieser Stellung - mit maximaler Wirkung.'; break;
      case 14: text = 'Exzellent! Genau das haette auch der Computer gespielt.'; break;
      case 13: text = 'Sehr stark - praktisch gleichwertig mit dem besten Zug.'; break;
      case 12: text = 'Guter Zug. Nur eine Winzigkeit vom Optimum entfernt.'; break;
      case 11: text = 'Solider Zug, die Stellung bleibt in Ordnung.'; break;
      case 10: text = 'Ordentlich, aber es gab etwas Staerkeres.'; break;
      case 8: case 9: text = 'Ungenauigkeit: Da ging etwas mehr.'; break;
      case 7: text = 'Kleiner Fehler - die Stellung verschlechtert sich spuerbar.'; break;
      case 5: case 6: text = 'Fehler! Hier ging deutlich mehr.'; break;
      case 4: text = 'Schwerer Fehler - das kann Material oder die Partie kosten.'; break;
      case 2: case 3: text = 'Grober Fehler! Der Gegner kann das hart bestrafen.'; break;
      default: text = 'Katastrophaler Zug - wahrscheinlich geht eine Figur oder die Partie verloren.';
    }
    if (special !== null) text = special + ' ' + text;
    if (principleNote !== null) text += ' ' + principleNote;

    // Bei schwaecheren Zuegen: besten Zug als Lerntipp nennen (mit Begruendung)
    if (value <= 10 && !K.moveEq(bestMove, move)) {
      var bp = boardBefore.piece(bestMove.from);
      var pieceName = bp ? Piece.displayName(bp.type) : 'Figur';
      text += ' Besser war: ' + pieceName + ' ' + K.posToAlgebraic(bestMove.from) + '-' + K.posToAlgebraic(bestMove.to);
      text += ' (' + CoachTools.san(bestMove, boardBefore) + ').';
      var hp = CoachTools.hangingPieces(color, boardAfter);
      if (hp.length) {
        text += ' Problem: ' + cap1(Piece.deinNom(hp[0].type)) + ' auf ' + K.posToAlgebraic(hp[0].pos) + ' kann geschlagen werden.';
      } else {
        var mm = CoachTools.mateInOneMoves(opponent, boardAfter);
        if (mm.length) text += ' Problem: Der Gegner droht Matt mit ' + CoachTools.san(mm[0], boardAfter) + '.';
      }
    }

    var scoreForMover;
    if (playedScore >= mate) scoreForMover = 5000;
    else if (playedScore <= -mate) scoreForMover = -5000;
    else scoreForMover = cap(playedScore);
    return { value: value, text: text, scoreForMover: scoreForMover, bestMove: bestMove };
  };
  K.ChessMoveRater = ChessMoveRater;

  // ---------- Zuganalyse ----------
  function ChessMoveAnalyzer() {
    this.evalEngine = new K.ChessAIEngine(3);
    this.rater = new ChessMoveRater();
    this.reset();
  }
  ChessMoveAnalyzer.prototype.reset = function () { this.moveHistory = []; this.moveNumber = 0; this.lastEval = 0; };

  // v3: nach "Zug zuruecknehmen" den Analysestand auf die verbleibenden Zuege setzen (history = Liste von Zugtexten)
  ChessMoveAnalyzer.prototype.rewind = function (history, board) {
    this.moveHistory = history.slice();
    this.moveNumber = history.length;
    this.lastEval = this.evalEngine.evaluate(board, 0);
  };

  // -> MoveAnalysisResult { evalBefore, evalAfter, classification, opening, tactics, positionalNotes, bookComment, gameReference, summary, rating, ratingText }
  ChessMoveAnalyzer.prototype.analyze = function (move, boardBefore, boardAfter, color, isLearningMode) {
    this.moveNumber += 1;
    this.moveHistory.push(K.moveToAlgebraic(move));

    var moveRating = this.rater.rate(move, boardBefore, boardAfter, color, this.moveHistory.slice(0, -1));

    var evalBefore = this.lastEval;
    var evalAfter = color === 0 ? moveRating.scoreForMover : -moveRating.scoreForMover;
    this.lastEval = evalAfter;

    var classification;
    var opening = K.ChessOpeningBook.findOpening(this.moveHistory);
    if (opening && this.moveNumber <= opening.moves.length && moveRating.value >= 10) {
      classification = 'book';
    } else {
      var v = moveRating.value;
      if (v === 15) classification = 'brilliant';
      else if (v >= 13 && v <= 14) classification = 'good';
      else if (v >= 10 && v <= 12) classification = 'neutral';
      else if (v >= 8 && v <= 9) classification = 'inaccuracy';
      else if (v >= 4 && v <= 7) classification = 'mistake';
      else classification = 'blunder';
    }

    var tactics = K.ChessTacticsDetector.detectAll(boardAfter, move, color);
    var positionalNotes = K.ChessPositionalAnalyzer.analyze(boardAfter, color);

    var bookComment = null;
    if (isLearningMode) {
      var gamePhase, totalPieces = boardAfter.pieceCount();
      if (this.moveNumber <= 10) gamePhase = 'eroeffnung';
      else if (totalPieces <= 10) gamePhase = 'endspiel';
      else if (tactics.length) gamePhase = 'taktik';
      else gamePhase = 'strategie';
      var concept = K.ChessKnowledgeBase.findConcept(gamePhase);
      if (concept) bookComment = concept.author + ' (' + concept.book + '): ' + concept.explanation;
    }

    var gameReference = null;
    if (opening && isLearningMode) {
      var game = K.ChessKnowledgeBase.findFamousGame(opening.eco);
      if (game) gameReference = game.name + ' (' + game.white + ' vs ' + game.black + ', ' + game.year + '): ' + game.keyLesson;
    }

    var summary = 'Zugwert: ' + moveRating.value + '/15 - ' + moveRating.text + '\n';
    summary += this.buildSummary(move, color, classification, evalBefore, evalAfter, opening, tactics, positionalNotes, bookComment, gameReference, isLearningMode);

    return {
      evalBefore: evalBefore, evalAfter: evalAfter,
      classification: classification,
      classificationSymbol: K.MoveClassification.rawValue(classification),     // Zusatz: "!!", "?" ...
      classificationName: K.MoveClassification.germanName(classification),      // Zusatz: "Brillanter Zug" ...
      opening: opening, tactics: tactics, positionalNotes: positionalNotes,
      bookComment: bookComment, gameReference: gameReference,
      summary: summary, rating: moveRating.value, ratingText: moveRating.text,
      bestMove: moveRating.bestMove                                              // Zusatz: besserer Zug (fuer Pfeil)
    };
  };

  ChessMoveAnalyzer.prototype.buildSummary = function (move, color, classification, evalBefore, evalAfter, opening, tactics, positionalNotes, bookComment, gameReference, isLearningMode) {
    var parts = [];
    var evalPawns = evalAfter / 100.0, evalStr;
    if (Math.abs(evalPawns) < 0.3) evalStr = 'Ausgeglichene Stellung';
    else if (evalPawns > 0) evalStr = 'Weiss steht besser (+' + K.fmtFix(evalPawns, 1) + ')';
    else evalStr = 'Schwarz steht besser (' + K.fmtFix(evalPawns, 1) + ')';

    parts.push(K.MoveClassification.germanName(classification) + ' ' + K.MoveClassification.rawValue(classification) + ' | ' + evalStr);

    if (opening) {
      parts.push('Eroeffnung: ' + opening.name + ' [' + opening.eco + ']');
      if (isLearningMode) parts.push(opening.explanation);
    }
    if (tactics.length) tactics.slice(0, 2).forEach(function (t) { parts.push(t); });
    var maxNotes = isLearningMode ? 3 : 2;
    if (positionalNotes.length) positionalNotes.slice(0, maxNotes).forEach(function (n) { parts.push(n); });
    if (bookComment && isLearningMode) parts.push('Buchwissen: ' + bookComment);
    if (gameReference && isLearningMode) parts.push('Beruehmte Partie: ' + gameReference);
    if (isLearningMode) {
      var nextMoves = K.ChessOpeningBook.nextBookMoves(this.moveHistory);
      if (nextMoves.length) parts.push('Buchfortsetzung: ' + nextMoves.slice(0, 2).map(function (x) { return x.openingName; }).join(' oder '));
    }
    return parts.join('\n');
  };

  K.ChessMoveAnalyzer = ChessMoveAnalyzer;
});


/* ===== jobs.js ===== */
/* Schach-Kern: Rechen-Auftraege (KI-Zug, Coach, Zugbewertung) fuer Web-Worker ODER direkten Aufruf.
   Alle Argumente/Ergebnisse sind einfache, klonbare Daten (Bretter als board.toObject()). Kein DOM.
   - K.Jobs            : haelt Coach-/Analyse-Zustand (im Worker genau eine Instanz)
   - K.LokalerRechner  : fuehrt Auftraege im selben Thread aus (Promise)
   - K.WorkerRechner   : schickt Auftraege an kern/worker.js (nur Browser) */
(function (root, factory) {
  var K;
  if (typeof module === 'object' && module.exports) { require('./modelle.js'); require('./brett.js'); require('./ki.js'); require('./coach.js'); require('./bewertung.js'); K = require('./namespace.js'); factory(K); module.exports = K; }
  else { K = root.SchachKern = root.SchachKern || {}; factory(K); }
})(typeof self !== 'undefined' ? self : this, function (K) {
  'use strict';

  var Board = K.ChessBoard;

  function Jobs() {
    this.hintCoach = new K.ChessCoach();       // wie hintCoach / feedbackCoach im Swift-Controller
    this.feedbackCoach = new K.ChessCoach();
    this.analyzer = new K.ChessMoveAnalyzer();
  }

  // job: 'computerZug' | 'coachRat' | 'analyseReset' | 'analyseRewind' | 'analyse' | 'bewerteZug'
  Jobs.prototype.run = function (job, a) {
    switch (job) {
      case 'computerZug': {   // {brett, farbe, stufe, verlauf:[uci]} -> {zug}
        var b = Board.fromObject(a.brett);
        return { zug: K.ChessAIEngine.computerMove(b, a.farbe, a.stufe, a.verlauf || []) };
      }
      case 'coachRat': {      // {brett, farbe, verlauf:[uci], budget?} -> CoachAdvice
        return this.hintCoach.advise(Board.fromObject(a.brett), a.farbe, a.verlauf || [], a.budget);
      }
      case 'analyseReset':
        this.analyzer.reset();
        return { ok: true };
      case 'analyseRewind':   // {verlauf, brett}
        this.analyzer.rewind(a.verlauf || [], Board.fromObject(a.brett));
        return { ok: true };
      case 'analyse': {       // {zug, davor, danach, farbe, lernen, analysieren, coach, mensch} -> {analyse, coachText, coachDanger}
        var before = Board.fromObject(a.davor), after = Board.fromObject(a.danach);
        var analysis = a.analysieren ? this.analyzer.analyze(a.zug, before, after, a.farbe, !!a.lernen) : null;
        var coachText = null, coachDanger = [];
        if (a.coach) {
          if (a.mensch) {
            var fb = this.feedbackCoach.feedbackAfterOwnMove(before, after, a.zug, a.farbe);
            coachText = fb.text; coachDanger = fb.danger;
          } else {
            var tr = this.feedbackCoach.threatReport(after, before, a.zug, 1 - a.farbe);
            coachText = tr.text; coachDanger = tr.danger;
          }
        }
        return { analyse: analysis, coachText: coachText, coachDanger: coachDanger };
      }
      case 'bewerteZug': {    // {zug, davor, danach, farbe, verlauf} -> MoveRating (ohne Analyzer-Zustand)
        if (!this._rater) this._rater = new K.ChessMoveRater();
        return this._rater.rate(a.zug, Board.fromObject(a.davor), Board.fromObject(a.danach), a.farbe, a.verlauf || []);
      }
    }
    throw new Error('Unbekannter Auftrag: ' + job);
  };
  K.Jobs = Jobs;

  // ---- im selben Thread (Promise, damit die Aufrufer immer asynchron arbeiten) ----
  function LokalerRechner() { this.jobs = new Jobs(); }
  LokalerRechner.prototype.ausfuehren = function (job, args) {
    var self = this;
    return new Promise(function (resolve, reject) {
      Promise.resolve().then(function () { try { resolve(self.jobs.run(job, args)); } catch (e) { reject(e); } });
    });
  };
  LokalerRechner.prototype.beenden = function () {};
  K.LokalerRechner = LokalerRechner;

  // ---- Web-Worker (nur Browser) ----
  // url: Pfad zu kern/worker.js, z. B. 'kern/worker.js'. Faellt bei Fehlern auf LokalerRechner zurueck, wenn fallback=true.
  function WorkerRechner(url, fallback) {
    this.pending = {};
    this.nextId = 1;
    this.worker = null;
    this.lokal = null;
    var self = this;
    try {
      this.worker = new Worker(url);
      this.worker.onmessage = function (e) {
        var d = e.data, p = self.pending[d.id];
        if (!p) return;
        delete self.pending[d.id];
        if (d.fehler) p.reject(new Error(d.fehler)); else p.resolve(d.ergebnis);
      };
      this.worker.onerror = function (e) {
        // Worker nicht ladbar (z. B. file://): Auftraege lokal weiterrechnen
        if (fallback !== false) {
          self.lokal = self.lokal || new LokalerRechner();
          var ps = self.pending; self.pending = {};
          Object.keys(ps).forEach(function (id) { ps[id].erneut(); });
        }
      };
    } catch (e) {
      this.worker = null;
      this.lokal = new LokalerRechner();
    }
  }
  WorkerRechner.prototype.ausfuehren = function (job, args) {
    var self = this;
    if (!this.worker || this.lokal) {
      this.lokal = this.lokal || new LokalerRechner();
      return this.lokal.ausfuehren(job, args);
    }
    return new Promise(function (resolve, reject) {
      var id = self.nextId++;
      self.pending[id] = {
        resolve: resolve, reject: reject,
        erneut: function () { self.lokal.ausfuehren(job, args).then(resolve, reject); }
      };
      self.worker.postMessage({ id: id, job: job, args: args });
    });
  };
  WorkerRechner.prototype.beenden = function () { if (this.worker) this.worker.terminate(); this.worker = null; };
  K.WorkerRechner = WorkerRechner;
});


/* ===== partie.js ===== */
/* Schach-Kern: Partie = Spiellogik des SchachWindowController ohne Oberflaeche
   (Spielmodi, Zugablauf, Remis-Erkennung, Zugruecknahme-Snapshots, Coach-Tipp in zwei Stufen, Zugwert-Analyse,
   Computerzug mit Buch, Akademie-Aufgaben und Freispiel, Profil-Speicherung) + GameSnapshot + Einstellungen.
   Die Oberflaeche hoert auf Ereignisse (partie.on('status', fn) ...) und ruft Methoden auf. Rechenintensives
   (Computerzug, Coach, Analyse) laeuft ueber einen "Rechner" (WorkerRechner im Browser, LokalerRechner in Node). */
(function (root, factory) {
  var K;
  if (typeof module === 'object' && module.exports) {
    require('./modelle.js'); require('./brett.js'); require('./profile.js'); require('./akademie.js'); require('./tutorial.js');
    require('./jobs.js'); require('./wissen.js'); K = require('./namespace.js'); factory(K); module.exports = K;
  } else { K = root.SchachKern = root.SchachKern || {}; factory(K); }
})(typeof self !== 'undefined' ? self : this, function (K) {
  'use strict';

  var Board = K.ChessBoard, Piece = K.Piece;
  var WHITE = 0, BLACK = 1, KING = 6, QUEEN = 5;

  // ---------- Einstellungen (Swift: UserDefaults) ----------
  var SETT_PREFIX = 'schach.kern.';
  var memSett = {};
  var Einstellungen = {
    // Schluessel wie in Swift: kiStufe, analyseAktiv, nameWeiss, nameSchwarz, autoWenden, hundeTeam3D, ...
    get: function (key, def) {
      try { if (typeof localStorage !== 'undefined') { var v = localStorage.getItem(SETT_PREFIX + key); if (v !== null) return JSON.parse(v); } } catch (e) { /* gesperrt */ }
      return Object.prototype.hasOwnProperty.call(memSett, key) ? memSett[key] : def;
    },
    set: function (key, value) {
      memSett[key] = value;
      try { if (typeof localStorage !== 'undefined') localStorage.setItem(SETT_PREFIX + key, JSON.stringify(value)); } catch (e) { /* gesperrt */ }
    }
  };
  K.Einstellungen = Einstellungen;

  // Swift updateDiffLabel
  K.Spielstaerke = {
    names: ['', 'Sehr leicht', 'Leicht', 'Leicht', 'Mittel', 'Mittel', 'Stark', 'Stark', 'Sehr stark', 'Sehr stark', 'Experte'],
    name: function (stufe) { var n = K.Spielstaerke.names; return stufe < n.length ? n[stufe] : 'Experte'; }
  };

  // ---------- GameSnapshot (Zug zuruecknehmen) ----------
  function GameSnapshot(board, currentPlayer, lastMove, positionHistory, gameMoveHistory) {
    return {
      board: Board.copyFrom(board), currentPlayer: currentPlayer, lastMove: lastMove,
      positionHistory: Object.assign({}, positionHistory), gameMoveHistory: gameMoveHistory.slice()
    };
  }
  K.GameSnapshot = GameSnapshot;

  function sleepFn(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  // opts: { rechner, autoComputer (true: Computerzug sofort ausfuehren), computerVerzoegerung (ms, bei autoComputer), analyse }
  function Partie(opts) {
    opts = opts || {};
    this.rechner = opts.rechner || new K.LokalerRechner();
    this.autoComputer = opts.autoComputer === undefined ? false : !!opts.autoComputer;
    this.computerVerzoegerung = opts.computerVerzoegerung || 0;
    this.listeners = {};
    this.profileStore = opts.profileStore || null;     // Standard: PlayerProfileStore.shared (erst bei Bedarf)

    this.board = new Board();
    this.currentPlayer = WHITE;
    this.gameMode = K.GameMode.playerVsPlayer;
    this.difficulty = 5;                                // aiEngine.difficulty
    this.selectedPos = null;
    this.validMoves = [];
    this.lastMove = null;
    this.computerThinking = false;
    this.gameOver = false;
    this.gameSessionID = 0;
    this.aiCancelled = false;
    this.positionHistory = {};
    this.tutorialEngine = new K.ChessTutorialEngine();
    this.hintMove = null;
    this.analysisEnabled = false;
    this.gameMoveHistory = [];                          // UCI
    this.whiteName = ''; this.blackName = '';
    this.whiteTagType = KING; this.blackTagType = KING;
    this.hintStage = 0;
    this.pendingAdvice = null;
    this.coachBusy = false;
    this.dangerSquares = [];
    this.focusSquare = null;
    this.hintArrow = null;
    this.undoStack = [];
    this.pendingAnalyses = 0;
    this.pendingFreePlayResult = null;
    this.lastOwnFeedback = null;
    this.academyProfile = null;
    this.currentLesson = null;
    this.currentLevelShown = 1;
    this.lessonAttempts = 0;
    this.lessonSolved = false;
    this.lessonOwnMoves = 0;
    this.lessonRatingSum = 0;
    this.lessonRatingCount = 0;
    this.hintButtonTitle = '💡 Tipp';
    this.readyComputerMove = null;                      // berechneter, noch nicht gespielter Computerzug
    this._kette = Promise.resolve();                    // Analysen laufen der Reihe nach (wie die serielle Queue in Swift)
    this._offen = 0;                                    // laufende Hintergrundauftraege
    this._leerlauf = [];
    this.letztesErgebnis = null;
    this.letzterVersuch = null;                         // Ergebnis der letzten Aufgaben-Pruefung {richtig, sterne}
  }

  // ---------- Ereignisse ----------
  // Namen: 'brett', 'status', 'erklaerung', 'analyseText', 'analyseTitel', 'bewertung', 'coachBlase', 'coachBlaseAus',
  //        'tippKnopf', 'zug', 'computerDenkt', 'computerZugBereit', 'spielende', 'lektionGeloest', 'lektionFehlgeschlagen',
  //        'lektionStart', 'ansicht' (Brett wenden), 'zugZurueck'
  Partie.prototype.on = function (name, fn) { (this.listeners[name] = this.listeners[name] || []).push(fn); return this; };
  Partie.prototype.off = function (name, fn) {
    var l = this.listeners[name]; if (!l) return this;
    this.listeners[name] = fn ? l.filter(function (x) { return x !== fn; }) : [];
    return this;
  };
  Partie.prototype.emit = function (name, data) {
    var l = this.listeners[name];
    if (l) l.slice().forEach(function (fn) { try { fn(data); } catch (e) { if (typeof console !== 'undefined') console.error(e); } });
  };

  // ---------- Hilfen ----------
  Object.defineProperty(Partie.prototype, 'aiPlaysBlack', {
    get: function () {
      var m = this.gameMode;
      return m === 'playerVsComputer' || m === 'tutorial' || (m === 'academy' && ((this.currentLesson && this.currentLesson.freePlayMoves) || 0) > 0);
    }
  });
  Partie.prototype.displayName = function (color) {
    var n = color === WHITE ? this.whiteName : this.blackName;
    return n === '' ? K.Color.displayName(color) : n;
  };
  Partie.prototype._freePlay = function () { return (this.currentLesson && this.currentLesson.freePlayMoves) || 0; };

  // Hintergrundauftrag mit Zaehler (fuer warteAufFertig)
  Partie.prototype._auftrag = function (job, args, seriell) {
    var self = this;
    this._offen += 1;
    var run = function () { return self.rechner.ausfuehren(job, args); };
    var p = seriell ? (this._kette = this._kette.then(run, run)) : run();
    var fertig = function () { self._offen -= 1; if (self._offen === 0) { var l = self._leerlauf; self._leerlauf = []; l.forEach(function (f) { f(); }); } };
    p.then(fertig, fertig);
    return p;
  };
  // Promise, das erfuellt wird, wenn keine Hintergrundrechnung mehr laeuft (und kein Computerzug mehr wartet, wenn autoComputer)
  Partie.prototype.warteAufFertig = function () {
    var self = this;
    return new Promise(function (resolve) {
      var pruefen = function () {
        if (self._offen === 0) resolve(); else self._leerlauf.push(pruefen);
      };
      pruefen();
    });
  };

  // ---------- Stellungs-Erfassung (Remis) ----------
  // FIX #6 (Swift): Stellung mit der Farbe erfassen, die als NAECHSTES zieht
  Partie.prototype.recordPosition = function (sideToMove) {
    var stm = sideToMove === undefined ? this.currentPlayer : sideToMove;
    var hash = this.board.boardHash() + (stm === WHITE ? 'w' : 'b');
    this.positionHistory[hash] = (this.positionHistory[hash] || 0) + 1;
  };
  Partie.prototype.checkDraw = function (sideToMove) {
    if (this.board.halfMoveClock >= 100) return true;
    var stm = sideToMove === undefined ? this.currentPlayer : sideToMove;
    var hash = this.board.boardHash() + (stm === WHITE ? 'w' : 'b');
    return (this.positionHistory[hash] || 0) >= 3;
  };

  // ---------- Spielstart ----------
  // opts: { modus, stufe, weissName, schwarzName, weissTag (5|6), schwarzTag, lektion, analyse, profil }
  Partie.prototype.neuesSpiel = function (opts) {
    opts = opts || {};
    if (opts.modus) this.gameMode = opts.modus;
    if (opts.stufe) this.difficulty = Math.max(1, Math.min(10, opts.stufe));
    if (opts.weissName !== undefined) this.whiteName = opts.weissName;
    if (opts.schwarzName !== undefined) this.blackName = opts.schwarzName;
    else if (this.gameMode === 'playerVsComputer' && opts.weissName !== undefined) this.blackName = 'Computer';
    if (opts.weissTag) this.whiteTagType = opts.weissTag;
    if (opts.schwarzTag) this.blackTagType = opts.schwarzTag;
    if (this.gameMode === 'tutorial' && !opts.stufe) this.difficulty = 3;       // Swift startTutorial
    if (opts.lektion) this.currentLesson = opts.lektion;
    return this.start(opts.analyse);
  };

  // Swift: askPlayerNames. daten = { weiss: {name, tag}, schwarz: {name, tag} } (tag: 'koenig' | 'dame'; schwarz nur bei 2 Spielern)
  // oder null = "Ohne Namen spielen". Merkt die Namen in den Einstellungen (nameWeiss / nameSchwarz).
  Partie.prototype.setzeNamen = function (zweiSpieler, daten) {
    if (daten) {
      var w = daten.weiss || {}, b = daten.schwarz || {};
      this.whiteName = String(w.name || '').trim();
      this.whiteTagType = w.tag === 'dame' ? QUEEN : KING;
      if (zweiSpieler) {
        this.blackName = String(b.name || '').trim();
        this.blackTagType = b.tag === 'dame' ? QUEEN : KING;
      } else { this.blackName = 'Computer'; this.blackTagType = KING; }
      Einstellungen.set('nameWeiss', this.whiteName);
      if (zweiSpieler) Einstellungen.set('nameSchwarz', this.blackName);
    } else {
      this.whiteName = ''; this.blackName = zweiSpieler ? '' : 'Computer';
      this.whiteTagType = KING; this.blackTagType = KING;
    }
  };
  Partie.prototype.gemerkteNamen = function () {
    return { weiss: Einstellungen.get('nameWeiss', ''), schwarz: Einstellungen.get('nameSchwarz', '') };
  };

  // Swift: startGame()
  Partie.prototype.start = function (analyse) {
    this.aiCancelled = true; this.computerThinking = false; this.gameSessionID += 1;
    if (this.gameMode === 'academy' && this.currentLesson) {
      var lesson = this.currentLesson;
      this.board = Board.fromFEN(lesson.fen);
      this.difficulty = lesson.freePlayAI;
      this.lessonSolved = false; this.lessonOwnMoves = 0;
      this.lessonRatingSum = 0; this.lessonRatingCount = 0;
    } else {
      this.board = new Board();
    }
    this.currentPlayer = WHITE; this.selectedPos = null;
    this.validMoves = []; this.lastMove = null; this.computerThinking = false;
    this.gameOver = false; this.aiCancelled = false; this.hintMove = null;
    this.tutorialEngine.reset(); this.positionHistory = {}; this.recordPosition();
    this.gameMoveHistory = [];
    this._auftrag('analyseReset', {}, true);
    this.undoStack = []; this.pendingAnalyses = 0; this.pendingFreePlayResult = null; this.lastOwnFeedback = null;
    this.hintStage = 0; this.pendingAdvice = null; this.dangerSquares = []; this.focusSquare = null; this.hintArrow = null; this.coachBusy = false;
    this.readyComputerMove = null;
    this.hintButtonTitle = '💡 Tipp';
    switch (this.gameMode) {
      case 'tutorial': this.analysisEnabled = true; break;
      case 'academy': this.analysisEnabled = this._freePlay() > 0; break;
      default: this.analysisEnabled = analyse === undefined ? !!Einstellungen.get('analyseAktiv', false) : !!analyse;
    }
    this.emit('ansicht', { vonSchwarz: false });
    this.updateUI();
    if (this.gameMode === 'tutorial') {
      this.showExplanation(this.tutorialEngine.getOpeningTip());
      var st = K.ChessKnowledgeBase.stats();
      this.showAnalysis('Lernmodus mit Coach und Wissensdatenbank: ' + st.books + ' Schachbuecher, ' + st.games + ' beruehmte Partien, ' + st.concepts + ' strategische Konzepte. Jeder Zug bekommt einen Zugwert 1-15 mit Begruendung. Mache deinen ersten Zug!');
    }
    return this;
  };

  Partie.prototype.setzeAnalyse = function (an) {          // Swift: toggleAnalysis
    this.analysisEnabled = !!an;
    if (this.gameMode !== 'tutorial' && this.gameMode !== 'academy') Einstellungen.set('analyseAktiv', this.analysisEnabled);
    if (this.analysisEnabled) this.showAnalysis('Analyse aktiv - mache einen Zug...');
  };

  // ---------- Anzeige-Texte ----------
  Partie.prototype.showExplanation = function (t) { this.emit('erklaerung', { text: t }); };
  Partie.prototype.showAnalysis = function (t) { this.emit('analyseText', { text: t }); };
  Partie.prototype.setStatus = function (t) { this.statusText = t; this.emit('status', { text: t }); };

  // Swift: presentCoachText - im Lernmodus im Coach-Panel, sonst Sprechblase
  Partie.prototype.presentCoachText = function (text, title) {
    if (this.gameMode === 'tutorial') { this.showExplanation(text); return; }
    this.emit('coachBlase', { text: title + '\n' + text, titel: title, inhalt: text });
  };
  Partie.prototype.hideCoachBubble = function () { this.emit('coachBlaseAus', {}); };

  Partie.prototype.materialLabels = function () {
    var wMat = this.board.countMaterial(WHITE), bMat = this.board.countMaterial(BLACK);
    var wDiff = Math.max(0, Math.trunc((wMat - bMat) / 100)), bDiff = Math.max(0, Math.trunc((bMat - wMat) / 100));
    var wName = this.whiteName === '' ? '' : ' ' + this.whiteName.slice(0, 9);
    var bName = this.blackName === '' ? '' : ' ' + this.blackName.slice(0, 9);
    return {
      weiss: '♔' + wName + ' ' + Math.trunc(wMat / 100) + (wDiff > 0 ? ' +' + wDiff : ''),
      schwarz: '♚' + bName + ' ' + Math.trunc(bMat / 100) + (bDiff > 0 ? ' +' + bDiff : '')
    };
  };

  // Statuszeile wie in updateUI (null, wenn das Spiel vorbei ist - dann gilt der Text des Spielendes)
  Partie.prototype.statusZeile = function () {
    var b = this.board, cp = this.currentPlayer, t;
    var humanTurn = this.displayName(cp);
    if (b.isInCheck(cp)) {
      if (this.aiPlaysBlack) {
        t = cp === WHITE
          ? 'Schach! ' + (this.whiteName === '' ? 'Du bist dran' : humanTurn + ', du bist dran!')
          : 'Schach! Computer denkt...';
      } else t = 'Schach! ' + humanTurn + ' am Zug';
    } else if (this.aiPlaysBlack) {
      t = cp === WHITE ? (this.whiteName === '' ? 'Du bist am Zug' : humanTurn + ' ist am Zug') : 'Computer denkt nach...';
    } else t = humanTurn + ' ist am Zug';
    if (this.gameMode === 'academy' && this.currentLesson && this.currentLesson.freePlayMoves === 0 && !this.lessonSolved) t = this.currentLesson.title;
    return t;
  };

  // Alles, was die Oberflaeche zum Zeichnen braucht
  Partie.prototype.zustand = function () {
    var cp = this.currentPlayer;
    var checkPos = this.board.isInCheck(cp) ? this.board.findKing(cp) : null;
    return {
      brett: this.board, ausgewaehlt: this.selectedPos, ziele: this.validMoves.map(function (m) { return m.to; }),
      letzterZug: this.lastMove, schach: checkPos, hinweisPfeil: this.hintArrow,
      gefahrFelder: this.dangerSquares, fokusFeld: this.focusSquare,
      amZug: cp, spielVorbei: this.gameOver, material: this.materialLabels(), status: this.gameOver ? this.statusText : this.statusZeile(),
      tippKnopf: this.hintButtonTitle
    };
  };

  Partie.prototype.updateUI = function () {
    if (!this.gameOver) this.statusText = this.statusZeile();
    this.emit('brett', this.zustand());
    if (!this.gameOver) this.emit('status', { text: this.statusText });
  };

  // ---------- Klicks / Auswahl ----------
  // Rueckgabe: { typ: 'ignoriert' | 'auswahl' | 'abwahl' | 'umwandlung' | 'zug', ... }
  //  - 'umwandlung': zuege = die vier Umwandlungszuege -> Oberflaeche fragt nach der Figur, dann partie.playerMove(gewaehlterZug)
  Partie.prototype.handleClick = function (row, col) {
    if (this.gameOver || this.computerThinking) return { typ: 'ignoriert' };
    if (this.aiPlaysBlack && this.currentPlayer === BLACK) return { typ: 'ignoriert' };
    if (this.gameMode === 'academy' && this.lessonSolved && this._freePlay() === 0) return { typ: 'ignoriert' };

    var pos = { row: row, col: col };
    var allMoves = this.board.allLegalMoves(this.currentPlayer);
    var piece = this.board.piece(pos);

    if (this.gameMode === 'tutorial' && this.selectedPos === null) {
      if (piece && piece.color === this.currentPlayer) this.showExplanation(this.tutorialEngine.getPieceExplanation(piece.type));
    }
    if (this.selectedPos !== null) {
      var atTarget = this.validMoves.filter(function (m) { return m.to.row === row && m.to.col === col; });
      if (atTarget.length) {
        if (atTarget[0].promotion) return { typ: 'umwandlung', zuege: atTarget };
        this.playerMove(atTarget[0]);
        return { typ: 'zug', zug: atTarget[0] };
      }
      if (piece && piece.color === this.currentPlayer) {
        var pm = allMoves.filter(function (m) { return m.from.row === row && m.from.col === col; });
        if (pm.length) {
          this.selectedPos = pos; this.validMoves = pm;
          if (this.gameMode === 'tutorial') this.showExplanation(this.tutorialEngine.getPieceExplanation(piece.type));
          this.updateUI();
          return { typ: 'auswahl', von: pos, ziele: pm.map(function (m) { return m.to; }), zuege: pm };
        }
      }
      this.selectedPos = null; this.validMoves = [];
      this.updateUI();
      return { typ: 'abwahl' };
    }
    if (piece && piece.color === this.currentPlayer) {
      var pm2 = allMoves.filter(function (m) { return m.from.row === row && m.from.col === col; });
      if (pm2.length) {
        this.selectedPos = pos; this.validMoves = pm2;
        this.updateUI();
        return { typ: 'auswahl', von: pos, ziele: pm2.map(function (m) { return m.to; }), zuege: pm2 };
      }
    }
    return { typ: 'ignoriert' };
  };

  // Menschlicher Zug: In der Akademie wird die Loesung geprueft, sonst normal gezogen
  Partie.prototype.playerMove = function (move) {
    if (this.gameMode === 'academy' && this.currentLesson && this.currentLesson.freePlayMoves === 0) return this.attemptLessonMove(move);
    return this.doMove(move);
  };
  // Zug anhand von 'e2e4' (Umwandlung 'e7e8q'; ohne Buchstaben = Dame)
  Partie.prototype.playerMoveUci = function (uci) {
    var m = this.board.findMoveByUci(uci, this.currentPlayer);
    if (!m) return null;
    this.playerMove(m);
    return m;
  };

  // ---------- Zug ausfuehren (Swift: doMove) ----------
  Partie.prototype.doMove = function (move) {
    var self = this;
    var boardBeforeMove = Board.copyFrom(this.board);
    var mover = this.currentPlayer;
    var isHumanMove = !(this.aiPlaysBlack && mover === BLACK);

    // v3: Schnappschuss fuer "Zug zuruecknehmen" (vor jedem menschlichen Zug)
    if (isHumanMove && this.gameMode !== 'academy') {
      this.undoStack.push(GameSnapshot(boardBeforeMove, mover, this.lastMove, this.positionHistory, this.gameMoveHistory));
      if (this.undoStack.length > 300) this.undoStack.shift();
    }

    this.board.executeMove(move);
    this.lastMove = move;
    this.selectedPos = null; this.validMoves = []; this.hintMove = null;
    this.resetCoachState();
    this.gameMoveHistory.push(K.moveToUci(move));
    this.emit('zug', { zug: move, ziehender: mover, vorher: boardBeforeMove, nachher: this.board, mensch: isHumanMove });

    // Zugwert-Analyse & Coach-Rueckmeldung im Hintergrund
    var wantAnalysis = this.analysisEnabled;
    var wantCoach = this.gameMode === 'tutorial';
    var isLearning = this.gameMode === 'tutorial' || this.gameMode === 'academy';
    var countRating = this.gameMode === 'academy' && mover === WHITE && this._freePlay() > 0;
    if (countRating) this.lessonOwnMoves += 1;
    if (wantAnalysis || wantCoach) {
      var after = Board.copyFrom(this.board);
      var session = this.gameSessionID;
      this.pendingAnalyses += 1;
      this._auftrag('analyse', {
        zug: move, davor: boardBeforeMove.toObject(), danach: after.toObject(), farbe: mover,
        lernen: isLearning, analysieren: wantAnalysis, coach: wantCoach, mensch: isHumanMove
      }, true).then(function (res) {
        self.pendingAnalyses = Math.max(0, self.pendingAnalyses - 1);
        if (self.gameSessionID !== session) return;
        var a = res.analyse;
        if (a) {
          self.emit('bewertung', { wert: a.evalAfter / 100.0 });
          var pt = after.piece(move.to);
          var pieceName = pt ? Piece.displayName(pt.type) : 'Figur';
          var moveNotation = pieceName + ' ' + K.posToAlgebraic(move.from) + '-' + K.posToAlgebraic(move.to);
          self.emit('analyseTitel', { text: self.displayName(mover) + ': ' + moveNotation + ' · Zugwert ' + a.rating + '/15 ' + a.classificationSymbol });
          self.showAnalysis(a.summary);
          self.emit('zugwert', { zug: move, ziehender: mover, analyse: a });
          if (countRating) { self.lessonRatingSum += a.rating; self.lessonRatingCount += 1; }
        }
        var t = res.coachText;
        if (t !== null && t !== undefined) {
          if (isHumanMove) {
            if (a && a.rating <= 5) t += ' ↶ Tipp: Mit „Zurück“ kannst du den Zug zurücknehmen und es besser machen.';
            self.lastOwnFeedback = t;
          } else if (self.lastOwnFeedback !== null) {
            t = 'DEIN ZUG: ' + self.lastOwnFeedback + '\n\nGEGNER: ' + t;
            self.lastOwnFeedback = null;
          }
          self.showExplanation(t);
          // Gefahren nur markieren, solange die Stellung noch aktuell ist
          if (self.board.boardHash() === after.boardHash() && self.hintStage === 0) {
            self.dangerSquares = res.coachDanger || [];
            self.updateUI();
          }
        }
        if (self.pendingFreePlayResult && self.pendingAnalyses === 0) {
          var r = self.pendingFreePlayResult; self.pendingFreePlayResult = null;
          self.lessonFreePlayEnded(r.won, r.drawn);
        }
      }, function (e) {
        self.pendingAnalyses = Math.max(0, self.pendingAnalyses - 1);
        if (typeof console !== 'undefined') console.error('Analyse fehlgeschlagen', e);
      });
    }

    var nextPlayer = 1 - mover;
    this.recordPosition(nextPlayer);

    var result = this.board.checkGameResult(nextPlayer);
    var academy = this.gameMode === 'academy', fp = this._freePlay() > 0;

    if (result.kind === 'checkmate') {
      this.gameOver = true;
      this.updateUI();
      var winner = result.winner, msg;
      if (academy) {
        if (fp) this.endFreePlayWhenReady(winner === WHITE, false);
        else this.setStatus(winner === WHITE ? 'SCHACHMATT! 🎉' : 'Schachmatt.');
        return this._ende('matt', null, winner, true);
      }
      if (this.aiPlaysBlack) {
        var winName = this.whiteName === '' ? 'Du hast' : this.whiteName + ' hat';
        msg = winner === WHITE ? 'Schachmatt! ' + winName + ' gewonnen!' : 'Schachmatt! Computer gewinnt!';
      } else msg = 'Schachmatt! ' + this.displayName(winner) + ' gewinnt!';
      this.setStatus(msg);
      if (this.gameMode === 'tutorial') {
        this.showExplanation(winner === WHITE
          ? '🏆 Schachmatt! Der Koenig kann dem Angriff nicht entkommen. Grossartig gespielt!'
          : 'Schachmatt – diesmal hat der Computer gewonnen. Mit ↶ Zurück kannst du die letzten Zuege zuruecknehmen und einen anderen Weg probieren!');
      }
      return this._ende('matt', msg, winner, false);
    }
    if (result.kind === 'stalemate') {
      this.gameOver = true;
      this.updateUI();
      if (academy) {
        if (fp) this.endFreePlayWhenReady(false, true);
        else {
          this.setStatus('Patt - Unentschieden!');
          this.showExplanation("⚠️ PATT! Der Gegner hat keinen Zug mehr, steht aber nicht im Schach - nur Remis! Druecke 'Nochmal'.");
        }
        return this._ende('patt', null, null, true);
      }
      this.setStatus('Patt - Unentschieden!');
      if (this.gameMode === 'tutorial') {
        this.showExplanation('Patt! Der Koenig steht nicht im Schach, hat aber keinen legalen Zug. Das Spiel endet unentschieden. Tipp: Wer vorn liegt, muss dem gegnerischen Koenig immer ein Feld lassen!');
      }
      return this._ende('patt', 'Patt - Unentschieden!', null, false);
    }
    if (result.kind === 'draw') {
      this.gameOver = true;
      this.updateUI();
      if (academy) {
        if (fp) this.endFreePlayWhenReady(false, true);
        else this.setStatus('Remis.');
        return this._ende('remis', null, null, true);
      }
      this.setStatus('Remis!');
      return this._ende('remis', 'Remis - Unentschieden!', null, false);
    }

    // 3-fache Stellungswiederholung
    if (this.checkDraw(nextPlayer)) {
      this.gameOver = true;
      this.updateUI();
      if (academy) {
        if (fp) this.endFreePlayWhenReady(false, true);
        else this.setStatus('Remis (Stellungswiederholung)');
        return this._ende('wiederholung', null, null, true);
      }
      this.setStatus('Remis (Stellungswiederholung)');
      return this._ende('wiederholung', 'Remis durch Stellungswiederholung!', null, false);
    }

    this.currentPlayer = nextPlayer;
    this.updateUI();

    // v3: Im 2-Spieler-Modus auf Wunsch zum Spieler am Zug drehen (die Oberflaeche entscheidet nach autoWenden)
    if (this.gameMode === 'playerVsPlayer') this.emit('ansicht', { vonSchwarz: this.currentPlayer === BLACK, automatisch: true });

    // Akademie-Freispiel: Zuglimit erreicht?
    if (academy && this.currentLesson && this.currentLesson.freePlayMoves > 0 &&
        this.lessonOwnMoves >= this.currentLesson.freePlayMoves && this.currentPlayer === BLACK) {
      this.endFreePlayWhenReady(false, false);
      return { status: 'freispiel-ende' };
    }

    if (this.aiPlaysBlack && this.currentPlayer === BLACK) this._computerZugStarten();
    return { status: 'laeuft' };
  };

  // Spielende melden (Swift: showGameOverAlert; Akademie: keine Meldung)
  Partie.prototype._ende = function (art, text, gewinner, akademie) {
    var r = { status: 'ende', art: art, text: text, gewinner: gewinner };
    this.letztesErgebnis = r;
    if (!akademie) this.emit('spielende', { art: art, text: text, gewinner: gewinner });
    return r;
  };

  // ---------- Computerzug ----------
  // FIX #14: Buch ab Stufe 4. Der Zug wird SOFORT berechnet; ausgefuehrt wird er, wenn die Oberflaeche
  // computerZugAusfuehren() ruft (nach der Animation) - oder automatisch bei autoComputer.
  Partie.prototype._computerZugStarten = function () {
    var self = this;
    this.computerThinking = true;
    this.aiCancelled = false;
    this.setStatus('Computer denkt nach...');
    this.emit('computerDenkt', {});
    var sessionID = this.gameSessionID;
    this._auftrag('computerZug', {
      brett: this.board.toObject(), farbe: BLACK, stufe: this.difficulty, verlauf: this.gameMoveHistory.slice()
    }, false).then(function (res) {
      if (self.aiCancelled || self.gameSessionID !== sessionID) return;
      self.readyComputerMove = { zug: res.zug, session: sessionID };
      self.emit('computerZugBereit', { zug: res.zug });
      if (self.autoComputer) {
        if (self.computerVerzoegerung > 0) sleepFn(self.computerVerzoegerung).then(function () { self.computerZugAusfuehren(); });
        else self.computerZugAusfuehren();
      }
    }, function (e) { if (typeof console !== 'undefined') console.error('Computerzug fehlgeschlagen', e); });
  };

  // Spielt den berechneten Computerzug (Swift: runWhenBoardIdle { doMove(aiMove) })
  Partie.prototype.computerZugAusfuehren = function () {
    var r = this.readyComputerMove;
    if (!r || r.session !== this.gameSessionID || this.aiCancelled) return false;
    this.readyComputerMove = null;
    this.computerThinking = false;
    if (r.zug) { this.doMove(r.zug); }
    else {
      this.gameOver = true;
      this.setStatus('Du hast gewonnen!');
      this._ende('gewonnen', 'Du hast gewonnen!', WHITE, false);
    }
    return true;
  };

  // ---------- Zug zuruecknehmen ----------
  Partie.prototype.undoMove = function () {
    if (this.gameMode === 'academy') return false;
    var snap = this.undoStack.pop();
    if (!snap) { this.setStatus('↶ Nichts zum Zuruecknehmen'); return false; }
    this.aiCancelled = true; this.computerThinking = false; this.gameSessionID += 1;   // laufende KI/Analyse verwerfen
    this.readyComputerMove = null;
    this.board = Board.copyFrom(snap.board);
    this.currentPlayer = snap.currentPlayer;
    this.lastMove = snap.lastMove;
    this.positionHistory = Object.assign({}, snap.positionHistory);
    this.gameMoveHistory = snap.gameMoveHistory.slice();
    this.gameOver = false; this.aiCancelled = false;
    this.selectedPos = null; this.validMoves = []; this.hintMove = null;
    this.pendingAnalyses = 0; this.pendingFreePlayResult = null; this.lastOwnFeedback = null;
    this.resetCoachState();
    this._auftrag('analyseRewind', { verlauf: this.gameMoveHistory.slice(), brett: this.board.toObject() }, true);
    if (this.gameMode === 'playerVsPlayer') this.emit('ansicht', { vonSchwarz: this.currentPlayer === BLACK, automatisch: true });
    this.updateUI();
    var msg = '↶ Zug zurückgenommen – probier es nochmal!';
    if (this.gameMode === 'tutorial') this.showExplanation(msg + ' Tipp: Druecke 💡 fuer einen Denkanstoss.');
    else this.setStatus(msg);
    this.emit('zugZurueck', {});
    return true;
  };
  Partie.prototype.kannZuruecknehmen = function () { return this.undoStack.length > 0 && this.gameMode !== 'academy'; };

  // ---------- Coach (Tipp in zwei Stufen) ----------
  Partie.prototype.resetCoachState = function () {
    this.hintStage = 0; this.pendingAdvice = null; this.dangerSquares = []; this.focusSquare = null; this.hintArrow = null;
    if (this.gameMode !== 'academy') this.setTippKnopf('💡 Tipp');
    this.hideCoachBubble();
  };
  Partie.prototype.setTippKnopf = function (t) { this.hintButtonTitle = t; this.emit('tippKnopf', { text: t }); };

  // 1. Aufruf: Denkanstoss (Figur markiert, Loesung geheim). 2. Aufruf: Loesung mit Pfeil und Begruendung.
  // Gibt ein Promise zurueck (erfuellt, wenn der Tipp angezeigt ist).
  Partie.prototype.showHint = function () {
    var self = this;
    if (this.gameMode === 'academy') { this.showLessonHint(); return Promise.resolve(); }
    if (this.gameOver || this.computerThinking || this.coachBusy) return Promise.resolve();
    if (this.aiPlaysBlack && this.currentPlayer === BLACK) return Promise.resolve();
    var mover = this.currentPlayer;

    if (this.hintStage === 1 && this.pendingAdvice) {
      var adv = this.pendingAdvice, m = adv.move;
      if (m) {
        this.hintMove = m; this.hintArrow = m; this.selectedPos = m.from;
        this.validMoves = this.board.allLegalMoves(mover).filter(function (x) { return x.from.row === m.from.row && x.from.col === m.from.col; });
      }
      this.focusSquare = null;
      this.hintStage = 2;
      this.setTippKnopf('💡 Tipp');
      this.presentCoachText(adv.full, '💡 Empfehlung fuer ' + this.displayName(mover));
      this.updateUI();
      return Promise.resolve();
    }

    this.coachBusy = true;
    this.setTippKnopf('⏳ Coach …');
    var session = this.gameSessionID, hash = this.board.boardHash();
    return this._auftrag('coachRat', { brett: this.board.toObject(), farbe: mover, verlauf: this.gameMoveHistory.slice() }, false).then(function (adv2) {
      self.coachBusy = false;
      if (self.gameSessionID !== session || self.currentPlayer !== mover || self.board.boardHash() !== hash || self.gameOver) {
        self.setTippKnopf('💡 Tipp');
        return;
      }
      self.pendingAdvice = adv2;
      self.hintStage = 1;
      self.focusSquare = adv2.focus;
      self.dangerSquares = adv2.dangerSquares;
      self.setTippKnopf('💡 Lösung');
      self.presentCoachText(adv2.nudge + '\n(Nochmal 💡 = Lösung mit Begründung)', '🤔 Denkanstoss');
      self.updateUI();
    }, function (e) { self.coachBusy = false; self.setTippKnopf('💡 Tipp'); });
  };

  // ---------- Akademie ----------
  Partie.prototype.store = function () { return this.profileStore || (this.profileStore = K.PlayerProfileStore.shared); };
  Partie.prototype.setzeProfil = function (name) {      // Swift: academyStartPressed -> createOrGet
    this.academyProfile = this.store().createOrGet(name);
    return this.academyProfile;
  };

  Partie.prototype.startLesson = function (lesson) {
    this.currentLesson = lesson;
    this.lessonAttempts = 0;
    this.gameMode = 'academy';
    this.start();
    this.showLessonIntro();
    this.emit('lektionStart', { lektion: lesson });
  };
  Partie.prototype.showLessonIntro = function () {
    var lesson = this.currentLesson;
    if (!lesson) return;
    this.showExplanation('📚 ' + lesson.teach + '\n➤ AUFGABE: ' + lesson.prompt);
    this.setStatus(lesson.title);
    if (lesson.freePlayMoves > 0) {
      this.showAnalysis('Spielpraxis: Dein Coach bewertet jeden deiner Zuege von 1-15. Viel Erfolg, ' + ((this.academyProfile && this.academyProfile.name) || 'Schachfreund') + '!');
    }
  };
  Partie.prototype.showLessonHint = function () {
    var l = this.currentLesson;
    if (!l) return;
    this.showExplanation('💡 TIPP: ' + l.hint + '\n➤ AUFGABE: ' + l.prompt);
  };
  Partie.prototype.retryLesson = function () {
    if (!this.currentLesson) return;
    this.start();
    this.showLessonIntro();
  };

  // Prueft den Zug des Schuelers gegen die Loesung(en)
  Partie.prototype.attemptLessonMove = function (move) {
    var lesson = this.currentLesson;
    if (!lesson) return null;
    this.lessonAttempts += 1;
    var uci = K.moveToUci(move);
    if (lesson.solutions.indexOf(uci) >= 0) {
      this.doMove(move);        // ausfuehren, KI antwortet nicht
      this.lessonSolved = true;
      this.gameOver = true;
      var stars = this.lessonAttempts <= 1 ? 3 : (this.lessonAttempts <= 3 ? 2 : 1);
      this.saveLessonResult(stars);
      var starStr = new Array(stars + 1).join('⭐');
      this.showExplanation('✅ RICHTIG! ' + starStr + '\n' + lesson.successText);
      this.setStatus('Geloest! ' + starStr);
      this.emit('lektionGeloest', { lektion: lesson, sterne: stars });
      return (this.letzterVersuch = { richtig: true, sterne: stars });
    }
    this.selectedPos = null; this.validMoves = [];
    this.updateUI();
    this.setStatus(lesson.title);
    this.showExplanation('❌ Das war nicht die Loesung. ' + lesson.failText + '\n(Der Tipp-Knopf hilft dir!)');
    this.emit('lektionFehlgeschlagen', { lektion: lesson, versuche: this.lessonAttempts });
    return (this.letzterVersuch = { richtig: false });
  };

  // Akademie-Freispiel beenden - wartet ggf. auf die letzte Zugbewertung
  Partie.prototype.endFreePlayWhenReady = function (playerWon, drawn) {
    this.gameOver = true;
    if (this.pendingAnalyses > 0) { this.pendingFreePlayResult = { won: playerWon, drawn: drawn }; return; }
    this.lessonFreePlayEnded(playerWon, drawn);
  };

  Partie.prototype.lessonFreePlayEnded = function (playerWon, drawn) {
    var lesson = this.currentLesson;
    if (!lesson) return;
    this.gameOver = true;
    var avg = this.lessonRatingCount > 0 ? this.lessonRatingSum / this.lessonRatingCount : 0;
    var avgStr = K.fmtFix(avg, 1);
    var passAvg = lesson.id === 'L10-5' ? 9.0 : 8.0;
    var success = lesson.winByMate ? playerWon : (playerWon || avg >= passAvg);

    if (success) {
      this.lessonSolved = true;
      var stars;
      if (playerWon) stars = 3;
      else if (avg >= passAvg + 2.5) stars = 3;
      else if (avg >= passAvg + 1) stars = 2;
      else stars = 1;
      this.saveLessonResult(stars);
      var starStr = new Array(stars + 1).join('⭐');
      this.showExplanation('✅ GESCHAFFT! ' + starStr + '\n' + lesson.successText + '\nDein Zugdurchschnitt: ' + avgStr + '/15');
      this.setStatus('Bestanden! ' + starStr);
      this.emit('lektionGeloest', { lektion: lesson, sterne: stars, durchschnitt: avg });
    } else {
      this.showExplanation('❌ ' + lesson.failText + '\nDein Zugdurchschnitt: ' + avgStr + '/15' + (lesson.winByMate ? ' - Ziel: Schachmatt!' : ' - Ziel: ' + K.fmtFix(passAvg, 0) + '/15'));
      this.setStatus('Nochmal versuchen!');
      this.emit('lektionFehlgeschlagen', { lektion: lesson, durchschnitt: avg });
    }
  };

  Partie.prototype.saveLessonResult = function (stars) {
    var profile = this.academyProfile, lesson = this.currentLesson;
    if (!profile || !lesson) return;
    var p = profile.lessonProgress[lesson.id] || K.LessonProgress();
    p.attempts += Math.max(1, this.lessonAttempts);
    p.stars = p.completed ? Math.max(p.stars, stars) : stars;
    p.completed = true;
    profile.lessonProgress[lesson.id] = p;
    profile.lastLevel = Math.max(profile.lastLevel, lesson.level);
    this.academyProfile = profile;
    this.store().update(profile);
  };

  // Naechste Aufgabe (Swift: nextLesson). Rueckgabe: Lektion oder null (= Stufenuebersicht anzeigen)
  Partie.prototype.naechsteLektion = function () {
    var lesson = this.currentLesson, profile = this.academyProfile;
    if (!lesson || !profile) return null;
    var same = K.ChessAcademy.lessonsForLevel(lesson.level), idx = -1, i;
    for (i = 0; i < same.length; i++) if (same[i].id === lesson.id) { idx = i; break; }
    if (idx >= 0) {
      var after = same.slice(idx + 1).concat(same.slice(0, idx));
      for (i = 0; i < after.length; i++) {
        var pr = profile.lessonProgress[after[i].id];
        if (!(pr && pr.completed === true)) return after[i];
      }
      if (idx + 1 < same.length) return same[idx + 1];
    }
    return null;
  };
  Partie.prototype.nextLesson = function () {
    var n = this.naechsteLektion();
    if (n) { this.startLesson(n); return n; }
    return null;
  };

  K.Partie = Partie;
});

