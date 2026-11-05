#!/usr/bin/env node
// ============================================================
// werkzeuge/html_bauen.js – erzeugt aus spiele.json
//   1. die <script>-Zeilen zwischen <!-- MODULE:ANFANG --> und <!-- MODULE:ENDE --> in Autorennen.html und Motorrad.html
//   2. src/kern/profilDaten.js (die Erlaubt-Listen der Spiel-Profile, im Browser UND im Server-vm ladbar)
// Aufruf:
//   node werkzeuge/html_bauen.js             HTML + profilDaten.js neu schreiben (nur wenn sich etwas ändert)
//   node werkzeuge/html_bauen.js --pruefen   nichts schreiben; Abweichungen melden, Exit-Code 1 bei Abweichung (für Tests/alle_pruefen.sh)
// Einträge in spiele.json → spiele.<id>.module (Ladereihenfolge):
//   "src/x.js"                     → <script src="src/x.js"></script>
//   { "kommentar": "Text" }        → <!-- Text -->
//   { "roh": "<script>…</script>" } → Zeile unverändert (z. B. window.MOTORRAD = true)
// ============================================================
'use strict';
const fs = require('fs');
const path = require('path');

const WURZEL = path.join(__dirname, '..');
const ANFANG = '<!-- MODULE:ANFANG -->';
const ENDE = '<!-- MODULE:ENDE -->';
const PROFIL_DATEI = 'src/kern/profilDaten.js';

function lesen(rel) { return fs.readFileSync(path.join(WURZEL, rel), 'utf8'); }

function zeilen(module) {
  return module.map((m) => {
    if (typeof m === 'string') return '<script src="' + m + '"></script>';
    if (m && typeof m.kommentar === 'string') return '<!-- ' + m.kommentar + ' -->';
    if (m && typeof m.roh === 'string') return m.roh;
    throw new Error('Unbekannter Eintrag in spiele.json: ' + JSON.stringify(m));
  }).join('\n') + '\n';
}

/** Neuer HTML-Text: alles zwischen den Markern ersetzt. Ohne Marker: Fehler. */
function htmlErzeugen(alt, spiel) {
  const a = alt.indexOf(ANFANG), e = alt.indexOf(ENDE);
  if (a < 0 || e < 0 || e < a) throw new Error(spiel.html + ': Marker ' + ANFANG + ' / ' + ENDE + ' fehlen');
  const vorn = alt.slice(0, a + ANFANG.length + 1);   // inkl. Zeilenumbruch nach dem Marker
  return vorn + zeilen(spiel.module) + alt.slice(e);
}

function profilDatenErzeugen(spiele) {
  const p = {};
  for (const id of Object.keys(spiele)) {
    if (id.startsWith('_')) continue;
    const pr = spiele[id].profil;
    if (!pr) continue;
    p[id] = { erlaubt: pr.erlaubt.slice() };
  }
  return '// ERZEUGT von werkzeuge/html_bauen.js aus spiele.json (Abschnitt „profil“ je Spiel) – NICHT von Hand ändern.\n' +
    '// Profile der Spiele: welche Spaß-/Zusatzfunktionen erlaubt sind (["*"] = alle, [] = keine). Gelesen von src/kern/profil.js.\n' +
    '(function () {\n  var R = (window.Rennspiel = window.Rennspiel || {});\n  R.ProfilDaten = ' + JSON.stringify(p) + ';\n})();\n';
}

function main() {
  const nurPruefen = process.argv.includes('--pruefen');
  const spiele = JSON.parse(lesen('spiele.json')).spiele;
  const abweichungen = [];
  const schreiben = [];

  for (const id of Object.keys(spiele)) {
    const s = spiele[id];
    if (!s.html || !Array.isArray(s.module) || !s.module.length) continue;       // z. B. radwelt: noch nicht umgezogen
    // 1) Dateien vorhanden, keine doppelten
    const gesehen = new Set();
    for (const m of s.module) {
      if (typeof m !== 'string') continue;
      if (gesehen.has(m)) abweichungen.push(id + ': Datei doppelt in der Modulliste: ' + m);
      gesehen.add(m);
      if (!fs.existsSync(path.join(WURZEL, m))) abweichungen.push(id + ': Datei fehlt auf der Platte: ' + m);
    }
    // 2) HTML
    let alt;
    try { alt = lesen(s.html); } catch (e) { abweichungen.push(id + ': ' + s.html + ' nicht lesbar'); continue; }
    let neu;
    try { neu = htmlErzeugen(alt, s); } catch (e) { abweichungen.push(String(e.message)); continue; }
    if (neu !== alt) { abweichungen.push(s.html + ' weicht von spiele.json ab' + (nurPruefen ? '' : ' → wird neu geschrieben')); schreiben.push([s.html, neu]); }
  }
  // 3) profilDaten.js
  const pd = profilDatenErzeugen(spiele);
  let pdAlt = null;
  try { pdAlt = lesen(PROFIL_DATEI); } catch (e) { /* neu */ }
  if (pdAlt !== pd) { abweichungen.push(PROFIL_DATEI + (pdAlt === null ? ' fehlt' : ' weicht von spiele.json ab')); schreiben.push([PROFIL_DATEI, pd]); }

  if (nurPruefen) {
    if (abweichungen.length) { abweichungen.forEach((a) => console.log('FEHL ' + a)); console.log('html_bauen --pruefen: ' + abweichungen.length + ' Abweichung(en)'); process.exit(1); }
    console.log('OK   html_bauen --pruefen: HTML-Dateien und ' + PROFIL_DATEI + ' stimmen mit spiele.json überein'); return;
  }
  const echteFehler = abweichungen.filter((a) => /fehlt auf der Platte|doppelt|nicht lesbar|Marker/.test(a));
  if (echteFehler.length) { echteFehler.forEach((a) => console.log('FEHL ' + a)); process.exit(1); }
  for (const [rel, text] of schreiben) { fs.mkdirSync(path.dirname(path.join(WURZEL, rel)), { recursive: true }); fs.writeFileSync(path.join(WURZEL, rel), text); console.log('geschrieben: ' + rel); }
  if (!schreiben.length) console.log('nichts zu tun – alles gleich');
}
main();
