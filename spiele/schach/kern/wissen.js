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
