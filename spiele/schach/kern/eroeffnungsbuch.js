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
