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
