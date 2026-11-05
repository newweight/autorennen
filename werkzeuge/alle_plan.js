#!/usr/bin/env node
// werkzeuge/alle_plan.js – Hilfe für alle_pruefen.sh: welche Dateien sind geändert, welche Spiele betrifft das, was ist zu prüfen?
// Aufruf: node werkzeuge/alle_plan.js [--basis <git-ref>] [--spiel a,b] [--alles]   → JSON auf stdout
//   --basis   Vergleichsstand (Standard: spiele.json → pruefung.basis, sonst origin/motorrad)
//   --spiel   Spiele erzwingen (Komma-Liste, Namen aus spiele.json)
//   --alles   alle Spiele gelten als betroffen (Gesamtlauf)
'use strict';
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const WURZEL = path.join(__dirname, '..');
const args = process.argv.slice(2);
const wert = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
const cfg = JSON.parse(fs.readFileSync(path.join(WURZEL, 'spiele.json'), 'utf8'));
const spiele = cfg.spiele;
const pr = cfg.pruefung || {};
const basis = wert('--basis') || pr.basis || 'origin/motorrad';

function git(c) { return execSync('git ' + c, { cwd: WURZEL, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).split('\n').filter(Boolean); }
let geaendert = [];
try {
  geaendert = Array.from(new Set(git('diff --name-only ' + basis).concat(git('ls-files --others --exclude-standard'))));
} catch (e) { process.stderr.write('git diff gegen ' + basis + ' nicht möglich (' + String(e.message).split('\n')[0] + ') – alle Spiele gelten als betroffen\n'); geaendert = null; }

const ids = Object.keys(spiele).filter((i) => !i.startsWith('_'));
const modulDateien = (id) => (spiele[id].module || []).filter((m) => typeof m === 'string');
const betroffen = new Set();
const gruende = {};
const grund = (id, g) => { betroffen.add(id); (gruende[id] = gruende[id] || []).push(g); };

if (args.includes('--alles') || geaendert === null) ids.forEach((i) => { if (modulDateien(i).length) grund(i, 'Gesamtlauf'); });
else if (wert('--spiel')) wert('--spiel').split(',').forEach((i) => { if (spiele[i]) grund(i, 'erzwungen'); });
else {
  // Dateien, die jedes Spiel betreffen: Server, Kern, Werkzeuge, Modulliste/Profile, Golden-Referenzen, gemeinsame Test-Hilfen
  const ALLE = pr.betrifftAlle || ['server/', 'src/kern/', 'werkzeuge/', 'spiele.json', 'tests/golden/', 'tests/kern_', 'tests/test_kern_', 'tests/lade.js', 'tests/matrix_alle.py'];
  for (const f of geaendert) {
    if (ALLE.some((p) => f.startsWith(p))) { ids.forEach((i) => { if (modulDateien(i).length) grund(i, f); }); continue; }
    ids.forEach((i) => { if (modulDateien(i).includes(f) || (spiele[i].html === f)) grund(i, f); });
    // geänderte Node-Tests ziehen ihre eigenen Spiele nach
    ids.forEach((i) => { const t = spiele[i].tests || {}; if ((t.node || []).some((n) => 'tests/' + n === f) || (t.browser || []).some((n) => 'tests/' + n === f)) grund(i, f); });
  }
}
// Radwelt: solange spiele.json keine Modulliste hat, wird sie hier NICHT geprüft (liegt noch im eigenen Repo)
const radwelt = spiele.radwelt && !modulDateien('radwelt').length ? { noch_nicht_umgezogen: true, pfad: spiele.radwelt.pfad } : null;
// Geteilte Kern-Dateien (Strecke/Grafik/Welt/Konfiguration): Radwelt-Golden bewusst gegenprüfen
const kernGeteilt = (geaendert || []).filter((f) => /^(src\/track\/|src\/grafik\/|src\/world\/|src\/config\.js|src\/main\.js)/.test(f));

const sortiert = ids.filter((i) => betroffen.has(i));
const eindeutig = (a) => Array.from(new Set(a));
const nodeTests = eindeutig([].concat(...sortiert.map((i) => (spiele[i].tests && spiele[i].tests.node) || [])));
const nodeVoll = eindeutig([].concat(...sortiert.map((i) => (spiele[i].tests && spiele[i].tests.voll) || [])));
const rauch = eindeutig(sortiert.map((i) => spiele[i].tests && spiele[i].tests.rauch).filter(Boolean));
const matrix = eindeutig(sortiert.map((i) => spiele[i].tests && spiele[i].tests.matrix).filter(Boolean));
const nodeAlle = fs.readdirSync(path.join(WURZEL, 'tests')).filter((f) => /^test_.*\.js$/.test(f));

process.stdout.write(JSON.stringify({
  basis, geaendert: geaendert, betroffen: sortiert, gruende: Object.fromEntries(Object.entries(gruende).map(([k, v]) => [k, eindeutig(v).slice(0, 8)])),
  immer: pr.immer || { node: ['test_kern_profil.js', 'test_kern_golden.js'] }, node: nodeTests, voll: nodeVoll, rauch, matrix, nodeAlle, radwelt, kernGeteilt,
}, null, 1) + '\n');
