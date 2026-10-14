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
