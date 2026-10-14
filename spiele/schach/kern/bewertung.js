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
