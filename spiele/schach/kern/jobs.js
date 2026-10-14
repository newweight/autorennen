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
