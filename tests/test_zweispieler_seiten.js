// v31 (H3): Zweispieler am selben Rechner – WASD = linke Bildhälfte, Pfeile = rechte. node tests/test_zweispieler_seiten.js
const { ladeModule } = require('./lade.js');
const fs = require('fs');
const R = ladeModule(['src/config.js', 'src/input.js']);
let fehl = 0;
const ok = (n, b, i) => { if (!b) fehl++; console.log((b ? 'OK   ' : 'FEHL ') + n + (i !== undefined ? ' – ' + i : '')); };
const T = R.config.tasten;
ok('Spieler 0 = Pfeile, Spieler 1 = WASD (Indizes unverändert)', T.spieler[0].gas === 'ArrowUp' && T.spieler[1].gas === 'KeyW');
ok('config.tasten.zweiLinks = 1 (WASD-Spieler links)', T.zweiLinks === 1);
// Main.halbe(i) ohne Three.js: Funktion aus dem Quelltext holen und gegen die Config ausführen
const src = fs.readFileSync(__dirname + '/../src/main.js', 'utf8');
const m = src.match(/halbe\(i\) \{\s*return ([^;]+);/);
ok('Main.halbe vorhanden', !!m);
const mitKameras = (n, i) => { const kameras = new Array(n); return new Function('R', 'kameras', 'i', 'return ' + m[1].replace(/this\.kameras/g, 'kameras'))(R, kameras, i); };
ok('zu zweit: Spieler 1 (WASD) links (Hälfte 0)', mitKameras(2, 1) === 0);
ok('zu zweit: Spieler 0 (Pfeile) rechts (Hälfte 1)', mitKameras(2, 0) === 1);
ok('solo: Hälfte 0', mitKameras(1, 0) === 0);
T.zweiLinks = 0;
ok('zweiLinks = 0 stellt die alte Lage her', mitKameras(2, 0) === 0 && mitKameras(2, 1) === 1);
T.zweiLinks = 1;
// Eingabe: W/A/S/D steuern Spieler 1, Pfeile Spieler 0
const inp = new R.Input();
inp.gedrueckt.add('KeyW'); inp.gedrueckt.add('KeyA');
ok('WASD → steuerung(1) gas+links, steuerung(0) leer', inp.steuerung(1).gas === 1 && inp.steuerung(1).lenkung === -1 && inp.steuerung(0).gas === 0);
inp.gedrueckt.clear(); inp.gedrueckt.add('ArrowUp'); inp.gedrueckt.add('ArrowRight');
ok('Pfeile → steuerung(0) gas+rechts, steuerung(1) leer', inp.steuerung(0).gas === 1 && inp.steuerung(0).lenkung === 1 && inp.steuerung(1).gas === 0);
// Spiegel-Config
const sp = R.config.cockpit.spiegel;
ok('Zweispieler-Spiegel an, halbe Auflösung, ohne Deko', sp.zweispieler === 'an' && sp.zweiAufloesung === 0.5 && sp.zweiDeko === false);
console.log(fehl ? `\n${fehl} FEHLER` : '\nalles OK'); process.exit(fehl ? 1 : 0);
