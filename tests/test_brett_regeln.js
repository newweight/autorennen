// Brettspiele – Regeln: node tests/test_brett_regeln.js
//  Schach: Perft (Startstellung 1–4, Kiwipete 1–3, weitere Standard-Stellungen), Matt/Patt/50 Züge/Wiederholung/Material/Umwandlung/en passant/Rochade
//  4 gewinnt: Gewinnerkennung (waagrecht/senkrecht/beide Diagonalen), Unentschieden, Rückgängig, KI (Stufen, blockt/gewinnt)
'use strict';
const S = require('../spiele/gemeinsam/schach-regeln.js');
const V = require('../spiele/gemeinsam/vier-regeln.js');
const VK = require('../spiele/gemeinsam/vier-ki.js');
const SK = require('../spiele/gemeinsam/schach-ki.js');
let ok = 0, fehl = 0;
const pruefe = (n, g, i) => { console.log((g ? 'OK   ' : 'FEHL ') + n + (i !== undefined ? '  (' + i + ')' : '')); g ? ok++ : fehl++; };

// ---- Perft ----
const PERFT = [
  ['Startstellung', S.START_FEN, [20, 400, 8902, 197281]],
  ['Kiwipete', 'r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1', [48, 2039, 97862]],
  ['Position 3 (Endspiel, en passant)', '8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1', [14, 191, 2812, 43238]],
  ['Position 4 (Umwandlung, Rochade im Schach)', 'r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1', [6, 264, 9467]],
  ['Position 5', 'rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ - 1 8', [44, 1486, 62379]],
];
for (const [name, fen, soll] of PERFT) {
  const s = S.ausFen(fen);
  soll.forEach((n, i) => { const t0 = Date.now(), ist = S.perft(s, i + 1); pruefe('Perft ' + name + ' Tiefe ' + (i + 1) + ' = ' + n, ist === n, ist + ' in ' + (Date.now() - t0) + ' ms'); });
  pruefe('Perft ' + name + ' stellt Ausgangsstellung wieder her', S.zuFen(s) === S.zuFen(S.ausFen(fen)));
}
pruefe('FEN-Rundreise', S.zuFen(S.ausFen(S.START_FEN)) === S.START_FEN);

// ---- Spielende-Regeln ----
function spiel(texte, fen) { const p = S.Partie.ausTexten(texte, fen); if (!p) throw new Error('Zug unzulässig in ' + texte.join(' ')); return p; }
let p = spiel(['f2f3', 'e7e5', 'g2g4', 'd8h4']);
pruefe('Narrenmatt: Matt, Schwarz gewinnt', p.status().ende === 'matt' && p.status().sieger === -1 && p.status().schach);
pruefe('nach Matt kein Zug mehr', p.ziehen(p.legale()[0] || 0) === false);
p = new S.Partie('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1');
pruefe('Patt erkannt', p.status().ende === 'patt' && p.status().sieger === 0);
p = new S.Partie('8/8/8/4k3/8/3K4/8/8 w - - 0 1');
pruefe('K gegen K: unzureichendes Material', p.status().ende === 'material');
pruefe('K+L gegen K: Material', new S.Partie('8/8/8/4k3/8/3K4/8/5B2 w - - 0 1').status().ende === 'material');
pruefe('K+S gegen K: Material', new S.Partie('8/8/8/4k3/8/3K4/8/5N2 w - - 0 1').status().ende === 'material');
pruefe('K+L gegen K+L (gleiche Farbe): Material', new S.Partie('8/8/8/4k3/8/3K4/6b1/5B2 w - - 0 1').status().ende === 'material');
pruefe('K+L gegen K+L (verschiedene Farbe): weiter', new S.Partie('8/8/8/4k3/8/3K4/5b2/5B2 w - - 0 1').status().ende === null);
pruefe('K+S+S gegen K: weiter', new S.Partie('8/8/8/4k3/8/3K4/8/4NN2 w - - 0 1').status().ende === null);
pruefe('K+Bauer gegen K: weiter', new S.Partie('8/8/8/4k3/8/3K4/4P3/8 w - - 0 1').status().ende === null);
p = new S.Partie('8/8/8/4k3/8/3K4/8/R7 w - - 99 80');
pruefe('Halbzugzähler 99 → noch weiter', p.status().ende === null);
p.ziehen(p.ausText('a1a2'));
pruefe('50-Züge-Regel greift bei 100 Halbzügen', p.status().ende === 'fuenfzig');
p = spiel(['g1f3', 'g8f6', 'f3g1', 'f6g8', 'g1f3', 'g8f6', 'f3g1', 'f6g8']);
pruefe('dreifache Wiederholung (Startstellung 3×)', p.status().ende === 'wiederholung');
p = spiel(['g1f3', 'g8f6', 'f3g1', 'f6g8']);
pruefe('zweimal noch nicht', p.status().ende === null);

// en passant, Rochade, Umwandlung
p = spiel(['e2e4', 'a7a6', 'e4e5', 'd7d5']);
pruefe('en passant ist möglich', p.ausText('e5d6') !== null);
p.ziehen(p.ausText('e5d6'));
pruefe('en passant schlägt den Bauern auf d5', p.s.b[S.feldAus('d5')] === 0 && p.s.b[S.feldAus('d6')] === S.P);
p.rueckgaengig();
pruefe('en passant rückgängig: Bauer wieder da', p.s.b[S.feldAus('d5')] === -S.P && p.s.b[S.feldAus('d6')] === 0 && S.zuFen(p.s).includes('d6'));
p = spiel(['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1c4', 'g8f6']);
pruefe('kurze Rochade möglich', p.ausText('e1g1') !== null);
p.ziehen(p.ausText('e1g1'));
pruefe('Rochade: König g1, Turm f1', p.s.b[6] === S.K && p.s.b[5] === S.R && p.s.b[7] === 0 && p.s.b[4] === 0);
p = new S.Partie('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1');
pruefe('beide Rochaden', p.ausText('e1g1') !== null && p.ausText('e1c1') !== null);
p = new S.Partie('r3k2r/8/8/8/8/4r3/8/R3K2R w KQkq - 0 1');
pruefe('keine Rochade im Schach', p.ausText('e1g1') === null && p.ausText('e1c1') === null);
p = new S.Partie('r3k2r/8/8/8/8/6r1/8/R3K2R w KQkq - 0 1');
pruefe('keine Rochade über ein bedrohtes Feld (g3-Turm bedroht g1)', p.ausText('e1g1') === null && p.ausText('e1c1') !== null);
p = new S.Partie('4k3/P7/8/8/8/8/8/4K3 w - - 0 1');
pruefe('Umwandlung: 4 Auswahlmöglichkeiten', p.ziele(S.feldAus('a7'))[0].umw.length === 4 && p.ausText('a7a8') === null);
p.ziehen(p.ausText('a7a8n'));
pruefe('Umwandlung in Springer', p.s.b[S.feldAus('a8')] === S.N);
p.rueckgaengig();
pruefe('Umwandlung rückgängig: Bauer', p.s.b[S.feldAus('a7')] === S.P && p.s.b[S.feldAus('a8')] === 0);
p = new S.Partie();
pruefe('Startstellung: Figur-Ziele e2 = e3, e4', p.ziele(S.feldAus('e2')).map(z => S.feldName(z.nach)).sort().join() === 'e3,e4');
pruefe('illegaler Text-Zug abgelehnt', p.ausText('e2e5') === null && p.ausText('zz') === null && p.ausText('e7e5') === null);

// ---- Schach-KI ----
const t0 = Date.now();
for (const st of [1, 2, 3]) {
  const q = new S.Partie();
  const z = SK.waehle(q, st, { zeitMs: 1500 });
  pruefe('Schach-KI Stufe ' + st + ' liefert legalen Zug', z !== null && q.legale().includes(z.m !== undefined ? z.m : z), S.zuText(z.m !== undefined ? z.m : z));
}
let q = new S.Partie('6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1');
let z = SK.waehle(q, 2); z = z.m !== undefined ? z.m : z;
pruefe('Schach-KI Stufe 2 findet Matt in 1 (Ta8#)', S.zuText(z) === 'a1a8');
q = new S.Partie('6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1');
z = SK.waehle(q, 3, { zeitMs: 2000 }); z = z.m !== undefined ? z.m : z;
pruefe('Schach-KI Stufe 3 findet Matt in 1', S.zuText(z) === 'a1a8');
q = new S.Partie('4k3/8/8/3q4/8/8/8/4K2R w - - 0 1');
z = SK.waehle(q, 2); z = z.m !== undefined ? z.m : z;
pruefe('Schach-KI schlägt die ungedeckte Dame nicht (Turm kann sie nicht erreichen) – Zug legal', q.legale().includes(z));
q = new S.Partie('4k3/8/8/3q4/8/8/3R4/4K3 w - - 0 1');
z = SK.waehle(q, 2); z = z.m !== undefined ? z.m : z;
pruefe('Schach-KI Stufe 2 schlägt die ungedeckte Dame (Txd5)', S.zuText(z) === 'd2d5');
// Partie KI gegen KI läuft sauber zu Ende (oder 60 Züge) ohne illegale Züge
{
  const g = new S.Partie(); let n = 0, schlecht = false;
  while (!g.status().ende && n < 80) { const r = SK.waehle(g, n % 2 ? 1 : 2, { zeitMs: 300 }); const m = r.m !== undefined ? r.m : r; if (!g.ziehen(m)) { schlecht = true; break; } n++; }
  pruefe('KI gegen KI: ' + n + ' legale Züge, Ende: ' + g.status().ende, !schlecht);
}
console.log('KI-Zeit gesamt ' + (Date.now() - t0) + ' ms');

// ---- 4 gewinnt ----
function vz(spalten) { const st = V.neu(); for (const s of spalten) if (!V.ziehen(st, s)) throw new Error('unzulässig ' + s); return st; }
let st = vz([0, 6, 1, 6, 2, 6, 3]);
pruefe('4g waagrecht (Rot, Spalten 0–3)', st.ende && st.ende.sieger === 1 && st.ende.reihe.length === 4);
st = vz([0, 1, 0, 1, 0, 1, 0]);
pruefe('4g senkrecht', st.ende && st.ende.sieger === 1 && st.ende.reihe.length === 4);
st = vz([0, 1, 1, 2, 2, 3, 2, 3, 3, 6, 3]);
pruefe('4g Diagonale aufwärts', st.ende && st.ende.sieger === 1, st.ende && st.ende.reihe);
st = vz([6, 5, 5, 4, 4, 3, 4, 3, 3, 0, 3]);
pruefe('4g Diagonale abwärts', st.ende && st.ende.sieger === 1);
st = vz([0, 1, 2, 3, 4, 5]);
pruefe('4g kein Gewinn bei nichts', !st.ende);
st = vz([0, 1, 1, 0, 2, 2, 3, 3, 3, 4, 1, 4, 1]);
pruefe('4g Gelb-Sieg erkannt oder offen (Spiel läuft konsistent)', st.ende === null || st.ende.sieger >= 0);
// Unentschieden: Muster füllen (Spaltenfolge ohne Vierer)
{
  const muster = [[0, 1, 0, 1, 0, 1], [1, 0, 1, 0, 1, 0]];
  // klassisches Remis: Spalten paarweise füllen mit wechselnden Startfarben
  const st2 = V.neu(); const folge = [];
  const reihenfolge = [0, 1, 2, 3, 4, 5, 6];
  // Brute force: zufällige Partien suchen bis eine remis endet
  let gefunden = false;
  let seed = 12345; const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  for (let v = 0; v < 20000 && !gefunden; v++) {
    const s2 = V.neu();
    while (!s2.ende) { const frei = [0, 1, 2, 3, 4, 5, 6].filter(c => V.erlaubt(s2, c)); V.ziehen(s2, frei[Math.floor(rnd() * frei.length)]); }
    if (s2.ende.sieger === 0 && s2.zug.length === 42) gefunden = true;
  }
  pruefe('4g Unentschieden (42 Steine, kein Sieger) kommt vor und wird erkannt', gefunden);
}
st = vz([0, 0, 0, 0, 0, 0]);
pruefe('4g volle Spalte: 7. Stein abgelehnt', V.ziehen(st, 0) === null && V.erlaubt(st, 1));
st = vz([3, 3, 4]);
V.zurueck(st); V.zurueck(st); V.zurueck(st);
pruefe('4g Rückgängig bis zum Anfang', st.zug.length === 0 && st.b.every(x => x === 0) && st.am === 1);
pruefe('4g ungültige Spalte abgelehnt', V.ziehen(V.neu(), 7) === null && V.ziehen(V.neu(), -1) === null && V.ziehen(V.neu(), 1.5) === null);
// KI
st = vz([0, 6, 1, 6, 2]);          // Rot hat 0,1,2 unten → Rot am Zug? nein: nach 5 Zügen ist Gelb dran → Gelb muss Spalte 3 blocken
{
  for (const stufe of [2, 3]) {
    const c = VK.waehle(vz([0, 6, 1, 6, 2]), stufe);
    pruefe('4g-KI (Swift-Port) Tiefe ' + stufe + ' blockt drohende Reihe (Spalte 3)', c === 3, c);
  }
  const gewinn = vz([0, 6, 0, 6, 0]);          // Rot hat 3 übereinander, Gelb am Zug (Gelb: 6,6) → Gelb blockt Spalte 0
  pruefe('4g-KI blockt senkrechte Drohung', VK.waehle(gewinn, 2) === 0);
  const g2 = vz([0, 6, 0, 6, 0, 5]);           // Rot am Zug und gewinnt mit Spalte 0
  pruefe('4g-KI gewinnt sofort (Spalte 0)', VK.waehle(g2, 2) === 0 && VK.waehle(vz([0, 6, 0, 6, 0, 5]), 5) === 0);
  const t1 = Date.now(); VK.waehle(V.neu(), 9); pruefe('4g-KI Tiefe 9 (Regler „Experte“) aus der Startstellung < 15 s', Date.now() - t1 < 15000, (Date.now() - t1) + ' ms');
  // KI gegen KI endet sauber
  const s3 = V.neu(); let n = 0; while (!s3.ende && n < 50) { V.ziehen(s3, VK.waehle(s3, n % 2 ? 2 : 4)); n++; }
  pruefe('4g KI gegen KI endet regelkonform', !!s3.ende && s3.zug.length <= 42, s3.zug.length + ' Züge');
}
console.log('\n' + ok + ' OK, ' + fehl + ' FEHL');
process.exit(fehl ? 1 : 0);
