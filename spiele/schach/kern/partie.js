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
