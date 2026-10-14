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
