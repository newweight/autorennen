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
