// Gemeinsamer Lader für die Kern-Tests (K1): lädt den KOMPLETTEN Modulsatz eines Spiels (Reihenfolge aus spiele.json bzw. aus einer HTML-Datei
// eines anderen Repos) in einen vm-Kontext – mit Platzhalter-DOM, ohne Browser. So sind auch Menü-/Spaß-/Rad-Dateien geladen.
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const WURZEL = path.join(__dirname, '..');

function nichts() { const f = function () { return nichts(); }; return new Proxy(f, { get: (t, k) => (k === Symbol.toPrimitive ? () => 0 : k === 'then' ? undefined : k === 'length' ? 0 : nichts()), set: () => true, apply: () => nichts(), construct: () => nichts() }); }

function spieleLesen() { return JSON.parse(fs.readFileSync(path.join(WURZEL, 'spiele.json'), 'utf8')).spiele; }

/** Modulliste (nur Script-Dateien) aus einer HTML-Datei: alle <script src="…"> in Reihenfolge. */
function listeAusHtml(htmlPfad) {
  const t = fs.readFileSync(htmlPfad, 'utf8');
  return [...t.matchAll(/<script src="([^"]+)"><\/script>/g)].map((m) => m[1]);
}

/** Modulsatz laden. basis = Ordner mit den Dateien, liste = Dateien in Ladereihenfolge, flags = z. B. { MOTORRAD: true } / { RADWELT: true }. */
function laden(basis, liste, flags) {
  const sb = Object.assign({ console: { log: console.log, warn() {}, error: console.error, info() {} }, Math, performance: { now: () => Date.now() }, setTimeout, clearTimeout,
    setInterval: () => 0, clearInterval() {}, document: nichts(), navigator: { userAgent: 'node', maxTouchPoints: 0 }, requestAnimationFrame: () => 0,
    innerWidth: 1280, innerHeight: 800, devicePixelRatio: 1, location: { search: '', href: '', hostname: 'localhost' }, URLSearchParams }, flags || {});
  sb.window = sb; sb.self = sb; sb.addEventListener = () => {}; sb.globalThis = sb;
  vm.createContext(sb);
  const fehl = [];
  for (const m of liste) {
    try { vm.runInContext(fs.readFileSync(path.join(basis, m), 'utf8'), sb, { filename: m }); } catch (e) { fehl.push(m + ': ' + e.message); }
  }
  return { R: sb.Rennspiel, sb, fehl };
}

/** Ladesatz eines Spiels dieses Repos nach spiele.json. */
function ladeSpiel(id, flags) {
  const s = spieleLesen()[id];
  return laden(WURZEL, s.module.filter((m) => typeof m === 'string'), flags);
}

module.exports = { laden, ladeSpiel, listeAusHtml, spieleLesen, WURZEL };
