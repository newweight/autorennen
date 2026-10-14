// Leistungsmessung Schach-Kern (14.10. v21): node tests/test_schach_kern_leistung.js [maxStufe]
// Misst je KI-Stufe die Zeit fuer 10 Stellungen (bestMove) in Node. Die Zahlen haengen von der Maschine/Last ab.
// Prueft nur Plausibilitaet (Zug legal, Zeit je Stellung < 60 s); die Referenz aus Swift (Knotenbudgets) ist identisch.
const path = require('path');
const K = require(path.join(__dirname, '..', 'spiele', 'schach', 'kern'));
const STELLUNGEN = [
  ['Startstellung', 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', 0],
  ['Italienisch', 'r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 0 1', 1],
  ['Sizilianisch', 'rnbqkb1r/1p2pppp/p2p1n2/8/3NP3/2N5/PPP2PPP/R1BQKB1R w KQkq - 0 1', 0],
  ['Mittelspiel ruhig', 'r1bq1rk1/ppp2ppp/2np1n2/2b1p3/2B1P3/2NP1N2/PPP2PPP/R1BQ1RK1 w - - 0 1', 0],
  ['Kiwipete (scharf)', 'r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1', 0],
  ['Damenindisch', 'rn1qkb1r/pb1ppppp/1p3n2/8/2pP4/2N2NP1/PP2PP1P/R1BQKB1R w KQkq - 0 1', 0],
  ['Turmendspiel', '8/5pk1/6p1/8/5P2/6P1/R5K1/4r3 w - - 0 1', 0],
  ['Dame gegen Turm', '8/8/3k4/8/8/3K4/1q6/4R3 w - - 0 1', 0],
  ['Leichtfiguren', '2r2rk1/pp3ppp/2n1bn2/2bpp3/8/1BP1PN2/PP1NBPPP/2RR2K1 w - - 0 1', 0],
  ['Bauernendspiel', '8/8/4k3/3p4/3P4/4K3/8/8 w - - 0 1', 0]
];
const maxStufe = parseInt(process.argv[2] || '10', 10);
let fehl = 0;
console.log('Stufe | Knotenbudget | Zeit 10 Stellungen | je Stellung | Knoten/s');
for (let stufe = 1; stufe <= maxStufe; stufe++) {
  const t0 = Date.now(); let knoten = 0, langsam = 0, illegal = 0;
  for (const [, fen, farbe] of STELLUNGEN) {
    const b = K.ChessBoard.fromFEN(fen), e = new K.ChessAIEngine(stufe), t1 = Date.now();
    const m = e.bestMove(b, farbe);
    knoten += e.nodeCount;
    if (Date.now() - t1 > 60000) langsam++;
    if (!m || !b.allLegalMoves(farbe).some(x => K.moveToUci(x) === K.moveToUci(m))) illegal++;
  }
  const ms = Date.now() - t0;
  console.log(`  ${String(stufe).padStart(2)}  | ${String(new K.ChessAIEngine(stufe).maxNodes()).padStart(9)}    | ${(ms / 1000).toFixed(2).padStart(8)} s        | ${(ms / 10).toFixed(0).padStart(6)} ms  | ${Math.round(knoten / (ms / 1000))}`);
  if (langsam || illegal) { fehl++; console.log('FEHL Stufe ' + stufe + ': langsam ' + langsam + ', illegal ' + illegal); }
}
console.log(fehl ? 'FEHLER' : 'ALLE OK');
process.exit(fehl ? 1 : 0);
