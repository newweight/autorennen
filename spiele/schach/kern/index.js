/* Schach-Kern fuer Node: const K = require('./spiele/schach/kern');  -> alle Module am Namensraum K (wie window.SchachKern im Browser). */
'use strict';
['modelle', 'brett', 'profile', 'daten_akademie', 'daten_buch', 'daten_wissen', 'akademie', 'eroeffnungsbuch', 'wissen',
  'ki', 'tutorial', 'analyse', 'coach', 'bewertung', 'jobs', 'partie'].forEach(function (n) { require('./' + n + '.js'); });
module.exports = require('./namespace.js');
