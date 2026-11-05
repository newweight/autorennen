// K1-FIX – html_bauen.js: Fehler in spiele.json dürfen im Schreibmodus NICHT als „nichts zu tun“ (Exit 0) durchgehen.
//   Arbeitet auf einer Kopie des Repos (Umgebungsvariable HTML_BAUEN_WURZEL) – das echte Repo wird nicht angefasst.   Aufruf: node tests/test_html_bauen.js
'use strict';
const fs = require('fs'), os = require('os'), path = require('path'), cp = require('child_process');
const WURZEL = path.join(__dirname, '..');
let ok = 0, fehler = 0;
function pruefe(name, gut, info) { console.log((gut ? 'OK   ' : 'FEHL ') + name + (info !== undefined ? '  (' + info + ')' : '')); if (gut) ok++; else fehler++; }

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'html_bauen_'));
for (const f of ['spiele.json', 'Autorennen.html', 'Motorrad.html']) fs.copyFileSync(path.join(WURZEL, f), path.join(tmp, f));
fs.cpSync(path.join(WURZEL, 'vendor'), path.join(tmp, 'vendor'), { recursive: true });
fs.cpSync(path.join(WURZEL, 'src'), path.join(tmp, 'src'), { recursive: true });
const J = JSON.parse(fs.readFileSync(path.join(WURZEL, 'spiele.json'), 'utf8'));
const lauf = (...args) => { const r = cp.spawnSync(process.execPath, [path.join(WURZEL, 'werkzeuge', 'html_bauen.js'), ...args], { env: Object.assign({}, process.env, { HTML_BAUEN_WURZEL: tmp }), encoding: 'utf8' }); return { rc: r.status, out: (r.stdout || '') + (r.stderr || '') }; };
const setze = (j) => fs.writeFileSync(path.join(tmp, 'spiele.json'), JSON.stringify(j, null, 1));
const kopie = () => JSON.parse(JSON.stringify(J));

try {
  let r = lauf();
  pruefe('0 unveränderte Kopie: Schreibmodus Exit 0', r.rc === 0, 'rc=' + r.rc + ' ' + r.out.trim().split('\n')[0]);
  r = lauf('--pruefen');
  pruefe('0b unveränderte Kopie: --pruefen Exit 0', r.rc === 0, 'rc=' + r.rc);

  // 1) Tippfehler im Modul-Eintrag (Objekt ohne kommentar/roh) → „Unbekannter Eintrag“
  const a = kopie(); const id = Object.keys(a.spiele).find((k) => !k.startsWith('_') && a.spiele[k].html && Array.isArray(a.spiele[k].module));
  a.spiele[id].module.push({ komentar: 'Tippfehler' });
  setze(a);
  r = lauf();
  pruefe('1 Tippfehler-Eintrag, Schreibmodus: Exit 1 + Meldung', r.rc === 1 && /Unbekannter Eintrag/.test(r.out), 'rc=' + r.rc + ' ' + r.out.trim().split('\n')[0]);
  r = lauf('--pruefen');
  pruefe('1b Tippfehler-Eintrag, --pruefen: Exit 1', r.rc === 1, 'rc=' + r.rc);
  pruefe('1c nichts geschrieben (HTML unverändert)', fs.readFileSync(path.join(tmp, 'Autorennen.html'), 'utf8') === fs.readFileSync(path.join(WURZEL, 'Autorennen.html'), 'utf8'));

  // 2) Datei fehlt auf der Platte
  const b = kopie(); b.spiele[id].module.push('src/gibt/es/nicht.js'); setze(b);
  r = lauf(); pruefe('2 fehlende Datei, Schreibmodus: Exit 1', r.rc === 1 && /fehlt auf der Platte/.test(r.out), 'rc=' + r.rc);

  // 3) Profil ohne „erlaubt“ → saubere Meldung, kein Stacktrace
  const c = kopie(); const pid = Object.keys(c.spiele).find((k) => c.spiele[k].profil); delete c.spiele[pid].profil.erlaubt; setze(c);
  r = lauf(); pruefe('3 Profil ohne erlaubt, Schreibmodus: Exit 1, saubere Meldung ohne Stacktrace', r.rc === 1 && /Profil ohne Liste/.test(r.out) && !/\n\s+at /.test(r.out), 'rc=' + r.rc + ' ' + r.out.trim().split('\n')[0]);
  r = lauf('--pruefen'); pruefe('3b Profil ohne erlaubt, --pruefen: Exit 1, ohne Stacktrace', r.rc === 1 && !/\n\s+at /.test(r.out), 'rc=' + r.rc);

  // 4) kaputtes JSON
  fs.writeFileSync(path.join(tmp, 'spiele.json'), '{ kaputt');
  r = lauf(); pruefe('4 kaputtes JSON: Exit 1, ohne Stacktrace', r.rc === 1 && !/\n\s+at /.test(r.out), 'rc=' + r.rc);

  // 5) wieder heil → Exit 0
  setze(J); r = lauf(); pruefe('5 wieder heile spiele.json: Exit 0', r.rc === 0, 'rc=' + r.rc);
} finally { fs.rmSync(tmp, { recursive: true, force: true }); }
console.log(fehler ? '\n' + fehler + ' FEHL, ' + ok + ' OK' : '\nalle ' + ok + ' OK, 0 FEHL');
process.exit(fehler ? 1 : 0);
