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
