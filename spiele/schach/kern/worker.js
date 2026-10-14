/* Schach-Kern als Web-Worker. Nachricht: { id, job, args } -> { id, ergebnis } | { id, fehler }
   Jobs siehe jobs.js (computerZug, coachRat, analyse, analyseReset, analyseRewind, bewerteZug).
   Einbindung: new Worker('kern/worker.js')  - oder bequemer: new SchachKern.WorkerRechner('kern/worker.js'). */
importScripts('modelle.js', 'brett.js', 'daten_buch.js', 'daten_wissen.js', 'eroeffnungsbuch.js', 'wissen.js',
  'ki.js', 'analyse.js', 'coach.js', 'bewertung.js', 'jobs.js');
(function () {
  'use strict';
  var jobs = new self.SchachKern.Jobs();
  self.onmessage = function (e) {
    var d = e.data;
    try { self.postMessage({ id: d.id, ergebnis: jobs.run(d.job, d.args) }); }
    catch (err) { self.postMessage({ id: d.id, fehler: String(err && err.message || err) }); }
  };
})();
