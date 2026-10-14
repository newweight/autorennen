#!/usr/bin/env node
/* Fasst alle Kern-Module in EINE Browser-Datei zusammen: kern/kern-alles.js (gleiche Reihenfolge wie in API.md).
   Aufruf: node spiele/schach/kern/_werkzeug/buendeln.js */
'use strict';
const fs = require('fs'), path = require('path');
const dir = path.join(__dirname, '..');
const reihenfolge = ['modelle', 'brett', 'profile', 'daten_akademie', 'daten_buch', 'daten_wissen', 'akademie', 'eroeffnungsbuch', 'wissen',
  'ki', 'tutorial', 'analyse', 'coach', 'bewertung', 'jobs', 'partie'];
let out = '/* GENERIERT (node _werkzeug/buendeln.js): alle Schach-Kern-Module in einer Datei. Nicht von Hand aendern. */\n';
for (const n of reihenfolge) out += '\n/* ===== ' + n + '.js ===== */\n' + fs.readFileSync(path.join(dir, n + '.js'), 'utf8') + '\n';
fs.writeFileSync(path.join(dir, 'kern-alles.js'), out);
console.log('kern-alles.js', out.length, 'Zeichen');
