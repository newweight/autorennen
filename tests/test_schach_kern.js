// Test Schach-Kern (14.10. v21): node tests/test_schach_kern.js
// Uebertragung der Swift-Smoke-Tests (SchachTests.swift, nur Logik) + Perft + Profile + Partie-Ablauf + Worker-Jobs.
// UI-Tests des Originals (Farbthemen, ChessBoardView, PieceAnimationView, SceneKit, Paw-Patrol-Glyphen) entfallen bzw. sind durch Hunde-Team-Tests ersetzt.
const path = require('path');
const K = require(path.join(__dirname, '..', 'spiele', 'schach', 'kern'));

let fehl = 0, gesamt = 0;
const ok = (name, bed, info) => { gesamt++; if (!bed) fehl++; console.log((bed ? 'OK   ' : 'FEHL ') + name + (info !== undefined && !bed ? ' – ' + info : '')); };
const WHITE = 0, BLACK = 1;
const { ChessBoard, ChessAIEngine, ChessCoach, ChessMoveRater, ChessAcademy, ChessOpeningBook, ChessKnowledgeBase,
  ChessTacticsDetector, ChessPositionalAnalyzer, CoachTools, PlayerProfileStore, moveToUci, posToAlgebraic, makeMove, Piece } = K;
const P = (row, col) => ({ row, col });
const mm = (f, t, o) => makeMove(f, t, o);
const QUEEN = 5, KING = 6, ROOK = 4, PAWN = 1, KNIGHT = 2, BISHOP = 3;
const uciList = (b, c) => b.allLegalMoves(c).map(moveToUci);
const copyAfter = (b, m) => { const t = ChessBoard.copyFrom(b); t.executeMove(m); return t; };

function perft(board, color, depth) {
  if (depth === 0) return 1;
  let n = 0;
  for (const m of board.allLegalMoves(color)) n += perft(copyAfter(board, m), 1 - color, depth - 1);
  return n;
}

// ── 1. Zuggenerierung (Perft) ──
console.log('1) Zuggenerierung (Perft)');
const start = new ChessBoard();
ok('Perft(1) = 20', perft(start, WHITE, 1) === 20);
ok('Perft(2) = 400', perft(start, WHITE, 2) === 400);
ok('Perft(3) = 8902', perft(start, WHITE, 3) === 8902);
ok('Perft(4) = 197281', perft(start, WHITE, 4) === 197281);
const kiwi = ChessBoard.fromFEN('r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq -');
ok('Kiwipete Perft(1) = 48', perft(kiwi, WHITE, 1) === 48);
ok('Kiwipete Perft(2) = 2039', perft(kiwi, WHITE, 2) === 2039);
ok('Kiwipete Perft(3) = 97862', perft(kiwi, WHITE, 3) === 97862);
// weitere Standardstellungen (Rochaderechte, en passant, Umwandlung)
const pos3 = ChessBoard.fromFEN('8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - -');
ok('Stellung 3 (en passant/Fesselung) Perft 1-4 = 14/191/2812/43238', [1, 2, 3, 4].map(d => perft(pos3, WHITE, d)).join() === '14,191,2812,43238');
const pos4 = ChessBoard.fromFEN('r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1');
ok('Stellung 4 (Umwandlung, nur Schwarz darf rochieren) Perft 1-3 = 6/264/9467', [1, 2, 3].map(d => perft(pos4, WHITE, d)).join() === '6,264,9467');
const pos5 = ChessBoard.fromFEN('rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ - 1 8');
ok('Stellung 5 Perft 1-3 = 44/1486/62379', [1, 2, 3].map(d => perft(pos5, WHITE, d)).join() === '44,1486,62379');

// Optimierte Zuggenerierung == Swift-Referenzverfahren (Kopie + Zug + Schachtest) auf Zufallspartien
{
  K.Zufall.samen(2024);
  const ref = (b, c) => b.pseudoLegalMoves(c).filter(m => { const t = ChessBoard.copyFrom(b); t.applyMoveUnchecked(m); return !t.isInCheck(c); });
  let positionen = 0, diff = 0, capDiff = 0, hasDiff = 0;
  for (let partie = 0; partie < 40; partie++) {
    let b = partie % 4 === 0 ? ChessBoard.fromFEN('r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq -') : new ChessBoard(), c = WHITE;
    for (let z = 0; z < 80; z++) {
      const a = b.allLegalMoves(c), r = ref(b, c);
      positionen++;
      if (a.map(moveToUci).join() !== r.map(moveToUci).join() || a.some((m, i) => m.isCastling !== r[i].isCastling || m.isEnPassant !== r[i].isEnPassant || m.capturedPiece !== r[i].capturedPiece)) diff++;
      if (b.allLegalCaptures(c).map(moveToUci).join() !== r.filter(m => m.capturedPiece).map(moveToUci).join()) capDiff++;
      if (b.hasLegalMoves(c) !== (r.length > 0)) hasDiff++;
      if (!a.length) break;
      b.executeMove(a[K.Zufall.ganz(a.length)]); c = 1 - c;
    }
  }
  ok(`Zuggenerierung == Referenzverfahren auf ${positionen} Zufallsstellungen (Zuege, Rochade, en passant)`, diff === 0, diff + ' Abweichungen');
  ok('allLegalCaptures == Filter auf Schlagzuege / hasLegalMoves == (Zuege > 0)', capDiff === 0 && hasDiff === 0, capDiff + '/' + hasDiff);
  K.Zufall.zuruecksetzen();
}

// ── 2. Matt / Patt / Remis ──
console.log('2) Matt / Patt / Remis');
const scholars = ChessBoard.fromFEN('r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR');
scholars.executeMove(mm(P(3, 7), P(1, 5), { capturedPiece: PAWN }));
ok('Schaefermatt: Schwarz ist matt', scholars.isInCheck(BLACK) && !scholars.hasLegalMoves(BLACK));
const res = scholars.checkGameResult(BLACK);
ok('Gewinner ist Weiss', res.kind === 'checkmate' && res.winner === WHITE);
ok('Patt korrekt erkannt', ChessBoard.fromFEN('k7/2Q5/1K6/8/8/8/8/8').checkGameResult(BLACK).kind === 'stalemate');
ok('K+S vs K = Remis (totes Remis)', ChessBoard.fromFEN('k7/8/8/8/8/8/8/K5N1').isInsufficientMaterial());

// ── 3. Spezialregeln ──
console.log('3) Spezialregeln');
const castleBoard = ChessBoard.fromFEN('4k3/8/8/8/8/8/8/4K2R');
const castleMoves = castleBoard.allLegalMoves(WHITE).filter(m => m.isCastling);
ok('Kurze Rochade wird generiert', castleMoves.length === 1);
castleBoard.executeMove(castleMoves[0]);
ok('Rochade: Koenig auf g1', castleBoard.piece(P(7, 6)).type === KING);
ok('Rochade: Turm auf f1', castleBoard.piece(P(7, 5)).type === ROOK);
const epBoard = ChessBoard.fromFEN('7k/8/8/3pP3/8/8/8/7K w d6');
const epMoves = epBoard.allLegalMoves(WHITE).filter(m => m.isEnPassant);
ok('En passant wird generiert', epMoves.length === 1);
epBoard.executeMove(epMoves[0]);
ok('En passant: geschlagener Bauer entfernt', epBoard.piece(P(3, 3)) === null);
ok('Umwandlung: 4 Varianten (D/T/L/S)', ChessBoard.fromFEN('7k/4P3/8/8/8/8/8/7K').allLegalMoves(WHITE).filter(m => m.promotion).length === 4);
// Regel-Details (zusaetzlich)
ok('Rochade nur mit ungezogenem Koenig auf e1 (FIX #7): Koenig auf d1 rochiert nicht', ChessBoard.fromFEN('4k3/8/8/8/8/8/8/3K3R').allLegalMoves(WHITE).every(m => !m.isCastling));
ok('Keine Rochade ueber angegriffenes Feld (f1 vom Turm bedroht)', ChessBoard.fromFEN('4kr2/8/8/8/8/8/8/4K2R').allLegalMoves(WHITE).every(m => !m.isCastling));
ok('Keine Rochade im Schach', ChessBoard.fromFEN('4k3/8/8/8/8/8/4r3/4K2R').allLegalMoves(WHITE).every(m => !m.isCastling));
ok('Fesselung: gefesselter Springer hat keine Zuege', ChessBoard.fromFEN('4r2k/8/8/8/8/8/4N3/4K3').allLegalMoves(WHITE).every(m => m.from.row !== 6 || m.from.col !== 4 || (m.to.col === 4)) && !ChessBoard.fromFEN('4r2k/8/8/8/8/8/4N3/4K3').allLegalMoves(WHITE).some(m => m.from.row === 6 && m.from.col === 4));
ok('Rochaderecht geht nach Koenigszug verloren (Hash)', (() => { const b = ChessBoard.fromFEN('r3k2r/8/8/8/8/8/8/R3K2R w KQkq -'); const h0 = b.boardHash(); b.executeMove(mm(P(7, 4), P(7, 5))); b.executeMove(mm(P(0, 4), P(0, 5))); b.executeMove(mm(P(7, 5), P(7, 4))); b.executeMove(mm(P(0, 5), P(0, 4))); return b.boardHash() !== h0 && h0.endsWith('KQkq'); })());
ok('Bauer 50-Zuege-Zaehler wird bei Bauernzug/Schlag zurueckgesetzt', (() => { const b = new ChessBoard(); b.executeMove(mm(P(7, 6), P(5, 5))); const a = b.halfMoveClock; b.executeMove(mm(P(6, 4), P(4, 4))); return a === 1 && b.halfMoveClock === 0; })());
ok('50-Zuege-Regel: Remis ab halfMoveClock 100', (() => { const b = ChessBoard.fromFEN('4k3/8/8/8/8/8/8/4K2R'); b.halfMoveClock = 100; return b.checkGameResult(BLACK).kind === 'draw'; })());

// ── 4. KI-Engine ──
console.log('4) KI-Engine');
const ai = new ChessAIEngine(3);
const mv0 = ai.bestMove(new ChessBoard(), WHITE);
ok('KI liefert legalen Zug', !!mv0 && uciList(new ChessBoard(), WHITE).includes(moveToUci(mv0)));
const midAI = new ChessAIEngine(5);
ok('KI (Stufe 5) schlaegt haengende Dame', moveToUci(midAI.bestMove(ChessBoard.fromFEN('7k/8/8/3q4/8/8/8/3R3K'), WHITE)) === 'd1d5');
ok('KI (Stufe 5) nimmt KEINEN gedeckten Bauern mit der Dame (Ruhe-Suche)', moveToUci(midAI.bestMove(ChessBoard.fromFEN('7k/8/3p4/4p2Q/8/8/8/7K'), WHITE)) !== 'h5e5');
ok('Buch kennt Fortsetzungen nach 1.e4 e5', ChessOpeningBook.nextBookMoves(['e2e4', 'e7e5']).length > 0);
const m1Board = ChessBoard.fromFEN('6k1/5ppp/8/8/8/8/8/R5K1');
{
  const mv = new ChessAIEngine(6).bestMove(m1Board, WHITE), t = copyAfter(m1Board, mv);
  ok('KI (Stufe 6) findet Matt in 1', t.isInCheck(BLACK) && !t.hasLegalMoves(BLACK));
}
ok('Stufen werden begrenzt (0 -> 1, 99 -> 10)', new ChessAIEngine(0).difficulty === 1 && new ChessAIEngine(99).difficulty === 10);
ok('Knotenbudget je Stufe wie Swift', [1, 3, 4, 5, 6, 7, 8, 9, 10].map(d => new ChessAIEngine(d).maxNodes()).join() === '50000,50000,100000,200000,400000,600000,900000,1200000,2000000');
ok('Matt-in-2 (L7-3 Stellung): Stufe 6 gewinnt nicht ab', (() => { const b = ChessBoard.fromFEN('3k4/8/6Q1/8/8/8/8/6KR'); const m = new ChessAIEngine(6).bestMove(b, WHITE); return !!m; })());
// Fehlerquoten der Anfaengerstufen: Stufe 1 = 72 %, 2 = 54 %, 3 = 36 %, 4 = 18 % (zweit-/drittbester Zug), ab 5 nie
{
  const board = ChessBoard.fromFEN('7k/8/8/8/8/8/8/K7'), quoten = {};
  for (const st of [1, 3, 4, 5]) {
    K.Zufall.samen(1234 + st);
    const e = new ChessAIEngine(st);
    let abw = 0; const n = 200;
    // Referenz ohne Wackler: Zufall auf konstant hoch setzen (kein Wackeln)
    K.Zufall.fn = () => 0.9999;
    const ref = moveToUci(e.bestMove(board, WHITE));
    K.Zufall.samen(99 + st);
    for (let i = 0; i < n; i++) if (moveToUci(e.bestMove(board, WHITE)) !== ref) abw++;
    quoten[st] = abw / n;
  }
  K.Zufall.zuruecksetzen();
  ok(`Fehlerquote Stufe 1 ca. 72 % (gemessen ${Math.round(quoten[1] * 100)} %)`, quoten[1] > 0.6 && quoten[1] < 0.82);
  ok(`Fehlerquote Stufe 3 ca. 36 % (gemessen ${Math.round(quoten[3] * 100)} %)`, quoten[3] > 0.26 && quoten[3] < 0.46);
  ok(`Fehlerquote Stufe 4 ca. 18 % (gemessen ${Math.round(quoten[4] * 100)} %)`, quoten[4] > 0.10 && quoten[4] < 0.27);
  ok('Fehlerquote Stufe 5 = 0 %', quoten[5] === 0);
}

// ── 5. Zugbewertung 1-15 ──
console.log('5) Zugbewertung 1-15');
const rater = new ChessMoveRater();
const rateBoard = ChessBoard.fromFEN('7k/8/8/q7/8/8/8/R6K');
const good = mm(P(7, 0), P(3, 0), { capturedPiece: QUEEN });
const r1 = rater.rate(good, rateBoard, copyAfter(rateBoard, good), WHITE);
ok('Dame gratis schlagen -> Wert >= 13 (war ' + r1.value + ')', r1.value >= 13);
const bad = mm(P(7, 0), P(7, 1));
const r2 = rater.rate(bad, rateBoard, copyAfter(rateBoard, bad), WHITE);
ok('Dame stehen lassen -> Wert <= 5 (war ' + r2.value + ')', r2.value <= 5);
ok('Erklaerung nennt besseren Zug', r2.text.includes('Besser war'));
const mateB = ChessBoard.fromFEN('6k1/5ppp/8/8/8/8/8/R5K1');
const mateM = mm(P(7, 0), P(0, 0));
const r3 = rater.rate(mateM, mateB, copyAfter(mateB, mateM), WHITE);
ok('Matt setzen -> Wert 15', r3.value === 15);
ok('Alle Werte in 1...15', [r1, r2, r3].every(r => r.value >= 1 && r.value <= 15));

// ── 6. Akademie ──
console.log('6) Schach-Akademie (10 Stufen)');
ok('47 Aufgaben vorhanden', ChessAcademy.lessons.length === 47, ChessAcademy.lessons.length);
ok('10 Stufen definiert', ChessAcademy.levelInfo.length === 10);
let lessonErrors = 0;
for (const lesson of ChessAcademy.lessons) {
  const b = ChessBoard.fromFEN(lesson.fen);
  if (!b.findKing(WHITE) || !b.findKing(BLACK)) { lessonErrors++; console.log('    Koenig fehlt: ' + lesson.id); continue; }
  if (lesson.freePlayMoves === 0) {
    const legal = uciList(b, WHITE);
    for (const sol of lesson.solutions) if (!legal.includes(sol)) { lessonErrors++; console.log('    Loesung nicht legal: ' + lesson.id + ' ' + sol); }
    if (!lesson.solutions.length) { lessonErrors++; console.log('    keine Loesung: ' + lesson.id); }
  }
}
ok('Alle Aufgaben-Loesungen sind legale Zuege', lessonErrors === 0);
let mateErrors = 0;
for (const id of ['L4-1', 'L4-2', 'L4-3', 'L4-4', 'L4-5', 'L5-5', 'L10-2', 'L10-3', 'L10-4']) {
  const lesson = ChessAcademy.lessonById(id);
  if (!lesson) { mateErrors++; continue; }
  const b = ChessBoard.fromFEN(lesson.fen);
  const sol = b.allLegalMoves(WHITE).find(m => moveToUci(m) === lesson.solutions[0]);
  if (!sol) { mateErrors++; continue; }
  const t = copyAfter(b, sol);
  if (!(t.isInCheck(BLACK) && !t.hasLegalMoves(BLACK))) { mateErrors++; console.log('    kein Matt: ' + id); }
}
ok('Alle Matt-in-1-Aufgaben korrekt', mateErrors === 0);
const testProfile = K.PlayerProfile('TESTSPIELER_INTERN');
ok('Stufe 1 offen, Stufe 2 gesperrt', ChessAcademy.isLevelUnlocked(testProfile, 1) && !ChessAcademy.isLevelUnlocked(testProfile, 2));
for (const l of ChessAcademy.lessonsForLevel(1)) testProfile.lessonProgress[l.id] = K.LessonProgress({ completed: true, attempts: 1, stars: 3 });
ok('Stufe 2 nach Stufe-1-Abschluss frei', ChessAcademy.isLevelUnlocked(testProfile, 2));
ok('Fortschritt Stufe 1: 6/6 und 18 Sterne', (() => { const p = ChessAcademy.progress(testProfile, 1); return p.done === 6 && p.total === 6 && p.stars === 18; })());
ok('Freischaltquote 70 %: 3 von 4 Aufgaben (75 %) genuegen, 2 von 4 nicht', (() => {
  const p = K.PlayerProfile('x'); const ls = ChessAcademy.lessonsForLevel(2);
  ls.slice(0, 2).forEach(l => p.lessonProgress[l.id] = K.LessonProgress({ completed: true, stars: 1 }));
  const a = ChessAcademy.isLevelUnlocked(p, 3);
  ls.slice(2, 3).forEach(l => p.lessonProgress[l.id] = K.LessonProgress({ completed: true, stars: 1 }));
  return !a && ChessAcademy.isLevelUnlocked(p, 3);
})());
ok('Aufgabentexte woertlich (L1-1 / L10-5)', ChessAcademy.lessonById('L1-1').teach.startsWith('Der Bauer ist der kleinste Kaempfer.') && ChessAcademy.lessonById('L10-5').prompt.includes('mindestens 9/15'));

// ── 7. Profile ──
console.log('7) Spielerprofile');
const fakeStorage = (() => { const d = {}; return { getItem: k => (k in d ? d[k] : null), setItem: (k, v) => { d[k] = v; }, _d: d }; })();
{
  const store = new PlayerProfileStore({ storage: fakeStorage, key: 'test.profile' });
  const before = store.profiles.length;
  const p = store.createOrGet('TESTSPIELER_INTERN');
  p.lessonProgress['L1-1'] = K.LessonProgress({ completed: true, attempts: 2, stars: 2 });
  store.update(p);
  store.load();
  const re = store.profile('testspieler_intern');
  ok('Profil gespeichert & geladen (Gross-/Kleinschreibung egal)', !!re);
  ok('Fortschritt persistiert', re && re.lessonProgress['L1-1'].stars === 2);
  const store2 = new PlayerProfileStore({ storage: fakeStorage, key: 'test.profile' });
  ok('Zweite Store-Instanz liest dieselben Daten', store2.profile('TESTSPIELER_INTERN').lessonProgress['L1-1'].attempts === 2);
  ok('createOrGet liefert den vorhandenen Spieler', store.createOrGet('  TESTSPIELER_INTERN ').lessonProgress['L1-1'].completed === true && store.profiles.length === before + 1);
  ok('Leerer Name -> "Spieler"', store.createOrGet('   ').name === 'Spieler');
  ok('Profil-Kopien sind unabhaengig (wie Swift-Struct)', (() => { const a = store.profile('TESTSPIELER_INTERN'); a.lastLevel = 9; return store.profile('TESTSPIELER_INTERN').lastLevel !== 9; })());
  ok('Sterne gesamt', K.profileTotalStars(re) === 2);
  store.removeProfile('TESTSPIELER_INTERN'); store.removeProfile('Spieler');
  ok('Testprofil aufgeraeumt', store.profile('TESTSPIELER_INTERN') === null && store.profiles.length === before);
}
{
  const kaputt = { getItem() { throw new Error('gesperrt'); }, setItem() { throw new Error('gesperrt'); } };
  const s = new PlayerProfileStore({ storage: kaputt });
  const p = s.createOrGet('Anna');
  ok('Gesperrter Speicher: kein Absturz, Profil bleibt im Arbeitsspeicher', p.name === 'Anna' && s.profile('anna') !== null && s.persistFailed === true);
  const s2 = new PlayerProfileStore({ storage: null });
  s2.createOrGet('Ben'); s2.update(Object.assign(s2.profile('Ben'), { lastLevel: 4 }));
  ok('Ohne Speicher (null): update/laden funktionieren im Arbeitsspeicher', s2.profile('Ben').lastLevel === 4);
  fakeStorage.setItem('kaputt.key', '{{{nicht json');
  ok('Kaputte gespeicherte Daten werden ignoriert', new PlayerProfileStore({ storage: fakeStorage, key: 'kaputt.key' }).profiles.length === 0);
}

// ── 8. Remis-Regeln ──
console.log('8) Remis-Regeln');
{
  const repBoard = new ChessBoard(), hashes = {};
  const rec = (b, stm) => { const h = b.boardHash() + (stm === WHITE ? 'w' : 'b'); hashes[h] = (hashes[h] || 0) + 1; };
  rec(repBoard, WHITE);
  const seq = [['g1', 'f3'], ['g8', 'f6'], ['f3', 'g1'], ['f6', 'g8'], ['g1', 'f3'], ['g8', 'f6'], ['f3', 'g1'], ['f6', 'g8']];
  let stm = WHITE;
  for (const [f, t] of seq) {
    repBoard.executeMove(mm(K.algebraicToPos(f), K.algebraicToPos(t)));
    stm = 1 - stm; rec(repBoard, stm);
  }
  ok('3fache Wiederholung der Grundstellung erkannt', (hashes[new ChessBoard().boardHash() + 'w'] || 0) >= 3);
}

// ── 9. Eroeffnungsbuch & Wissensbasis ──
console.log('9) Eroeffnungsbuch & Wissensbasis');
const italian = ChessOpeningBook.findOpening(['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1c4']);
ok('Italienische Partie erkannt', !!italian && italian.name.includes('Italienisch'), italian && italian.name);
const najdorf = ChessOpeningBook.findOpening(['e2e4', 'c7c5', 'g1f3', 'd7d6', 'd2d4', 'c5d4', 'f3d4', 'g8f6', 'b1c3', 'a7a6']);
ok('Najdorf erkannt', !!najdorf && najdorf.name.includes('Najdorf'));
ok('Buchfortsetzungen nach 1.e4 vorhanden', ChessOpeningBook.nextBookMoves(['e2e4']).length > 0);
ok('Leerer Zugverlauf: keine Eroeffnung', ChessOpeningBook.findOpening([]) === null);
ok('Buch hat 87 Eintraege', ChessOpeningBook.entries.length === 87, ChessOpeningBook.entries.length);
const stats = ChessKnowledgeBase.stats();
ok('20 Buecher in der Wissensbasis', stats.books === 20, stats.books);
ok('49 Konzepte, 33 Partien', stats.concepts === 49 && stats.games === 33, JSON.stringify(stats));
ok('Konzepte fuer alle Kategorien', ['eroeffnung', 'mittelspiel', 'endspiel', 'taktik', 'strategie', 'psychologie'].every(c => ChessKnowledgeBase.findConcept(c) !== null));
ok('Beruehmte Partie zur ECO gefunden', ChessKnowledgeBase.findFamousGame('C50') !== null);

// ── 10. Taktik-Erkennung ──
console.log('10) Taktik-Erkennung');
{
  const forkBoard = ChessBoard.fromFEN('r3k3/8/8/3N4/8/8/8/4K3'), forkMove = mm(P(3, 3), P(1, 2));
  forkBoard.executeMove(forkMove);
  ok('Springergabel erkannt', ChessTacticsDetector.detectFork(forkBoard, forkMove, WHITE) !== null);
  ok('Fesselung erkannt', ChessTacticsDetector.detectPin(ChessBoard.fromFEN('4k3/8/2n5/1B6/3P4/8/8/4K3'), WHITE) !== null);
  const dblBoard = ChessBoard.fromFEN('6k1/8/8/3N4/8/1B6/8/6K1'), dblMove = mm(P(3, 3), P(2, 5));
  dblBoard.executeMove(dblMove);
  const dblMsg = ChessTacticsDetector.detectCheck(dblBoard, dblMove, WHITE);
  ok('DOPPELSCHACH erkannt (FIX #4)', !!dblMsg && dblMsg.includes('DOPPELSCHACH'), dblMsg);
  const chk = ChessBoard.fromFEN('4k3/8/8/8/8/8/8/R6K'), chkMove = mm(P(7, 0), P(0, 0));
  chk.executeMove(chkMove);
  ok('Einfaches Schach erkannt', ChessTacticsDetector.detectCheck(chk, chkMove, WHITE).includes('Schach'));
  const abz = ChessBoard.fromFEN('4k3/8/8/8/4B3/8/4R3/4K3'), abzMove = mm(P(4, 4), P(3, 3));
  abz.executeMove(abzMove);
  ok('Abzugsschach erkannt (Laeufer gibt Turm-Linie frei)', (ChessTacticsDetector.detectCheck(abz, abzMove, WHITE) || '').startsWith('Abzugsschach'));
  ok('Bauerngabel erkannt (L6-2)', (() => { const b = ChessBoard.fromFEN('7k/8/3n1b2/8/4P3/8/8/7K'); const m = mm(P(4, 4), P(3, 4)); b.executeMove(m); return ChessTacticsDetector.detectFork(b, m, WHITE) !== null; })());
  // Swift-Verhalten: detectSkewer bricht nach der ersten Figur ab und loest nie aus; mit Korrektur-Schalter funktioniert er
  const sk = ChessBoard.fromFEN('4q3/8/8/4k3/8/8/8/4R1K1'), skm = mm(P(7, 0), P(7, 4));
  const skA = ChessBoard.fromFEN('4q3/8/8/4k3/8/8/8/4R1K1');
  ok('Spiess (Swift-Original): toter Code, loest nicht aus', ChessTacticsDetector.detectSkewer(skA, mm(P(7, 4), P(7, 4)), WHITE) === null);
  ChessTacticsDetector.spiessKorrigiert = true;
  ok('Spiess mit Korrektur-Schalter: Turm e1 spiesst Koenig und Dame', (ChessTacticsDetector.detectSkewer(skA, mm(P(7, 4), P(7, 4)), WHITE) || '').startsWith('Spiess!'));
  ChessTacticsDetector.spiessKorrigiert = false;
}

// ── 11. Positionelle Analyse ──
console.log('11) Positionelle Analyse');
ok('Isolierter Bauer erkannt', JSON.stringify(ChessPositionalAnalyzer.isolatedPawns(ChessBoard.fromFEN('4k3/8/8/8/8/8/P7/4K3'), WHITE)) === '[0]');
ok('Doppelbauer erkannt', JSON.stringify(ChessPositionalAnalyzer.doubledPawns(ChessBoard.fromFEN('4k3/8/8/8/4P3/8/4P3/4K3'), WHITE)) === '[4]');
ok('Freibauer erkannt', ChessPositionalAnalyzer.passedPawns(ChessBoard.fromFEN('4k3/8/1P6/8/8/8/8/4K3'), WHITE).length === 1);
ok('Koenigssicherheit: volles Bauernschild = +15', ChessPositionalAnalyzer.kingSafety(ChessBoard.fromFEN('4k3/8/8/8/8/8/5PPP/6K1'), WHITE).score === 15);
ok('Koenigssicherheit: nackter Koenig negativ', ChessPositionalAnalyzer.kingSafety(ChessBoard.fromFEN('4k3/8/8/8/8/8/8/6K1'), WHITE).score < 0);
ok('analyze() liefert Texte', ChessPositionalAnalyzer.analyze(ChessBoard.fromFEN('4k3/8/8/8/8/8/P7/4K3'), WHITE).some(t => t.startsWith('Isolierter Bauer auf a-Linie')));

// ── 12. Notation & Brett-Grundlagen ──
console.log('12) Notation & Brett-Grundlagen');
ok('posToAlgebraic a8', posToAlgebraic(P(0, 0)) === 'a8');
ok('posToAlgebraic h1', posToAlgebraic(P(7, 7)) === 'h1');
ok('moveToUci mit Umwandlung: e7e8q', moveToUci(mm(P(1, 4), P(0, 4), { promotion: QUEEN })) === 'e7e8q');
ok('algebraicToPos e4 / ungueltig', JSON.stringify(K.algebraicToPos('e4')) === '{"row":4,"col":4}' && K.algebraicToPos('i9') === null && K.algebraicToPos('x') === null);
ok('uciToMoveParts e7e8n', (() => { const p = K.uciToMoveParts('e7e8n'); return p.from.row === 1 && p.to.row === 0 && p.promotion === KNIGHT; })());
{
  const orig = new ChessBoard(), copy = ChessBoard.copyFrom(orig);
  copy.executeMove(mm(P(6, 4), P(4, 4)));
  ok('Brett-Kopie ist unabhaengig', orig.piece(P(6, 4)) !== null && copy.piece(P(6, 4)) === null);
  ok('boardHash aendert sich nach Zug', orig.boardHash() !== copy.boardHash());
  ok('boardHash gleich fuer gleiche Stellung', new ChessBoard().boardHash() === new ChessBoard().boardHash());
}
const fenRt = ChessBoard.fromFEN('r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR');
ok('FEN-Parser: 32 Figuren geladen', fenRt.pieceCount() === 32, fenRt.pieceCount());
ok('FEN-Parser: weisse Dame auf h5', fenRt.piece(P(3, 7)).type === QUEEN && fenRt.piece(P(3, 7)).color === WHITE);
ok('K+L vs K = totes Remis', ChessBoard.fromFEN('k7/8/8/8/8/8/8/K5B1').isInsufficientMaterial());
ok('K+T vs K = KEIN totes Remis', !ChessBoard.fromFEN('k7/8/8/8/8/8/8/K5R1').isInsufficientMaterial());
ok('Startstellung symmetrisch bewertet (0)', new ChessAIEngine(3).evaluate(new ChessBoard(), WHITE) === 0);
ok('FEN-Ausgabe der Startstellung', new ChessBoard().toFEN(WHITE) === 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
ok('FEN-Rundreise Kiwipete', ChessBoard.fromFEN(kiwi.toFEN(WHITE)).toFEN(WHITE) === kiwi.toFEN(WHITE));
ok('Serialisierung toObject/fromObject (Worker) erhaelt hasMoved, en passant, Zaehler', (() => {
  const b = new ChessBoard(); b.executeMove(mm(P(6, 4), P(4, 4))); b.executeMove(mm(P(1, 3), P(3, 3))); b.executeMove(mm(P(4, 4), P(3, 4)));
  const c = ChessBoard.fromObject(JSON.parse(JSON.stringify(b.toObject())));
  return c.boardHash() === b.boardHash() && c.halfMoveClock === b.halfMoveClock && c.fullMoveNumber === b.fullMoveNumber && c.toFEN(BLACK) === b.toFEN(BLACK);
})());
ok('findMoveByUci: e2e4, e7e8q, e7e8n', (() => { const b = ChessBoard.fromFEN('7k/4P3/8/8/8/8/8/7K'); return b.findMoveByUci('e7e8', WHITE).promotion === QUEEN && b.findMoveByUci('e7e8n', WHITE).promotion === KNIGHT && new ChessBoard().findMoveByUci('e2e4', WHITE) !== null && new ChessBoard().findMoveByUci('e2e5', WHITE) === null; })());
ok('fmtFix wie C-printf (Halbwerte zur geraden Ziffer: 1.25 -> 1.2, 2.5 -> 2, 3.5 -> 4)', K.fmtFix(1.25, 1) === '1.2' && K.fmtFix(2.5, 0) === '2' && K.fmtFix(3.5, 0) === '4' && K.fmtFix(-1.75, 1, true) === '-1.8' && K.fmtFix(0.25, 1, true) === '+0.2' && K.fmtFix(0, 1, true) === '+0.0');

// ── 13. Akademie: Stufenaufbau ──
console.log('13) Akademie-Stufenaufbau');
{
  const expected = { 1: 6, 2: 4, 3: 4, 4: 5, 5: 5, 6: 4, 7: 4, 8: 5, 9: 5, 10: 5 };
  for (let level = 1; level <= 10; level++) ok(`Stufe ${level}: ${expected[level]} Aufgaben`, ChessAcademy.lessonsForLevel(level).length === expected[level]);
  const fp = ChessAcademy.lessons.filter(l => l.freePlayMoves > 0);
  ok('3 Spielpraxis-Aufgaben (Stufe 8/9/10)', fp.length === 3 && new Set(fp.map(l => l.level)).size === 3 && fp.every(l => [8, 9, 10].includes(l.level)));
  ok('Spielpraxis-Parameter: L8-5 10 Zuege KI 3, L9-5 15 Zuege KI 6 Matt, L10-5 25 Zuege KI 7', (() => {
    const a = ChessAcademy.lessonById('L8-5'), b = ChessAcademy.lessonById('L9-5'), c = ChessAcademy.lessonById('L10-5');
    return a.freePlayMoves === 10 && a.freePlayAI === 3 && !a.winByMate && b.freePlayMoves === 15 && b.freePlayAI === 6 && b.winByMate && c.freePlayMoves === 25 && c.freePlayAI === 7;
  })());
  {
    const fs = require('fs'), dir = path.join(__dirname, '..', 'spiele', 'schach', 'kern');
    const quelle = fs.readdirSync(dir).filter(f => f.endsWith('.js') && f !== 'kern-alles.js').map(f => fs.readFileSync(path.join(dir, f), 'utf8')).join('\n');
    ok('Keine Paw-Patrol-Figurennamen/-Funktionen im Kern (Marke nicht uebernommen)', !/Skye|Rubble|\bChase\b|pawPatrol/i.test(quelle));
  }
}

// ── 14. Hunde-Team (statt Paw Patrol) ──
console.log('14) Hunde-Team');
{
  const types = [KING, QUEEN, ROOK, BISHOP, KNIGHT, PAWN];
  ok('Namen: Bruno = Koenig, Luna = Dame, Brocken = Turm, Wurzel = Laeufer, Falko = Springer, Welpe = Bauer', types.map(K.Stil.dogName).join() === 'Bruno,Luna,Brocken,Wurzel,Falko,Welpe');
  ok('Rassen: Bernhardiner, Windhund, Bulldogge, Dackel, Schaeferhund, Welpe', types.map(K.Stil.dogBreed).join() === 'Bernhardiner,Windhund,Bulldogge,Dackel,Schaeferhund,Welpe');
  ok('Klassisch: displayName nur "Turm"', Piece.displayName(ROOK) === 'Turm');
  K.Stil.setzeHunde(true);
  ok('Hunde-Modus: "Brocken (Turm)" und "Bruno (Koenig)"', Piece.displayName(ROOK) === 'Brocken (Turm)' && Piece.displayName(KING) === 'Bruno (Koenig)');
  const tut = new K.ChessTutorialEngine();
  ok('Tutorial-Erklaerung nennt den Hund ("Das ist Bruno, der Bernhardiner – dein Koenig!")', tut.getPieceExplanation(KING).startsWith('🐶 Das ist Bruno, der Bernhardiner – dein Koenig! Koenig:'));
  ok('Tutorial-Erklaerung weiblich: "deine Dame"', tut.getPieceExplanation(QUEEN).includes('deine Dame!'));
  ok('Coach-Texte nutzen die Hundenamen', CoachTools.describe(mm(P(7, 6), P(5, 5)), new ChessBoard()).startsWith('Falko (Springer) g1'));
  K.Stil.setzeHunde(false);
  ok('Zurueck zu klassisch', Piece.displayName(ROOK) === 'Turm' && !tut.getPieceExplanation(KING).startsWith('🐶'));
  ok('Hunde-Glyphen eindeutig', new Set(types.map(K.HundeTeam.glyph)).size === 6);
}

// ── 15. Coach, Abtausch-Rechnung, Notation ──
console.log('15) Coach & Abtausch-Rechnung');
{
  const seeBoard = ChessBoard.fromFEN('4k3/8/8/3q4/8/8/8/3QK3');
  const freeQ = mm(P(7, 3), P(3, 3), { capturedPiece: QUEEN });
  ok('SEE: ungedeckte Dame schlagen = +900', CoachTools.exchangeResult(freeQ, seeBoard) === 900, CoachTools.exchangeResult(freeQ, seeBoard));
  const defBoard = ChessBoard.fromFEN('4k3/8/2p5/3p4/8/8/8/3QK3');
  const badQ = mm(P(7, 3), P(3, 3), { capturedPiece: PAWN });
  ok('SEE: gedeckten Bauern mit Dame schlagen verliert', CoachTools.exchangeResult(badQ, defBoard) < 0);
  ok('Haengende Figur erkannt (Springer d2 vom Turm angegriffen)', CoachTools.hangingPieces(WHITE, ChessBoard.fromFEN('4k3/8/8/3r4/8/8/3N4/7K')).some(h => h.pos.row === 6 && h.pos.col === 3));
  ok('Gedeckte Figur haengt nicht', CoachTools.hangingPieces(WHITE, new ChessBoard()).length === 0);
  ok('Notation: e2-e4 = e4', CoachTools.san(mm(P(6, 4), P(4, 4)), new ChessBoard()) === 'e4');
  ok('Notation: Sg1-f3 = Sf3', CoachTools.san(mm(P(7, 6), P(5, 5)), new ChessBoard()) === 'Sf3');
  ok('Notation: Rochade = 0-0', CoachTools.san(mm(P(7, 4), P(7, 6), { isCastling: true }), ChessBoard.fromFEN('4k3/8/8/8/8/8/8/4K2R')) === '0-0');
  ok('Notation: Schach "+" und Matt "#", Schlag "x", Umwandlung "=D"', (() => {
    const b1 = ChessBoard.fromFEN('6k1/5ppp/8/8/8/8/8/R5K1');
    const m1 = b1.findMoveByUci('a1a8', WHITE);
    const b2 = ChessBoard.fromFEN('4k3/8/8/8/8/8/8/R6K');
    const b3 = ChessBoard.fromFEN('8/4P3/8/8/8/8/8/k6K');
    const b4 = ChessBoard.fromFEN('4k3/8/8/3p4/4P3/8/8/4K3');
    return CoachTools.san(m1, b1) === 'Ta8#' && CoachTools.san(b2.findMoveByUci('a1a8', WHITE), b2) === 'Ta8+' && CoachTools.san(b3.findMoveByUci('e7e8q', WHITE), b3) === 'e8=D' && CoachTools.san(b4.findMoveByUci('e4d5', WHITE), b4) === 'exd5';
  })());
  ok('Notation: Mehrdeutigkeit (zwei Tuerme -> Tad1, Tfd1 / zwei Springer gleiche Linie -> S1d2)', (() => {
    const b = ChessBoard.fromFEN('4k3/8/8/8/8/K7/8/R6R');
    const c = ChessBoard.fromFEN('4k3/8/8/8/8/8/8/3N1N1K'); void c;
    const d = ChessBoard.fromFEN('4k3/8/8/8/3N4/8/8/3N3K');
    return CoachTools.san(b.findMoveByUci('a1d1', WHITE), b) === 'Tad1' && CoachTools.san(b.findMoveByUci('h1d1', WHITE), b) === 'Thd1' && CoachTools.san(d.findMoveByUci('d4b3', WHITE), d) === 'Sb3' && CoachTools.san(ChessBoard.fromFEN('4k3/8/8/8/3N4/8/3N4/7K').findMoveByUci('d4b3', WHITE), ChessBoard.fromFEN('4k3/8/8/8/3N4/8/3N4/7K')) === 'S4b3';
  })());
  ok('pawns(): Formatierung "1,5" / "9" / "3"', CoachTools.pawns(150) === '1,5' && CoachTools.pawns(900) === '9' && CoachTools.pawns(-300) === '3' && CoachTools.pawns(1050) === '10');
  const rk = new ChessAIEngine(1).rankMoves(new ChessBoard(), WHITE, 2, 50000);
  ok('rankMoves: alle 20 Startzuege bewertet', rk.ranked.length === 20, rk.ranked.length);
  ok('rankMoves: sortiert (bester zuerst)', rk.ranked.every((x, i) => i === 0 || rk.ranked[i - 1].score >= x.score));
  const coach = new ChessCoach();
  const mateBoard = ChessBoard.fromFEN('r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR');
  const adv = coach.advise(mateBoard, WHITE, [], 120000);
  ok('Coach findet Matt in 1 (Dxf7#)', adv.move && moveToUci(adv.move) === 'h5f7', adv.move && moveToUci(adv.move));
  ok('Coach-Denkanstoss verraet die Loesung nicht', !adv.nudge.includes('f7'));
  ok('Coach-Loesung begruendet das Matt', adv.full.includes('MATT') || adv.full.includes('matt'));
  ok('Coach: Denkanstoss/Loesung haben die Original-Praefixe', adv.nudge.startsWith('🤔 DENKANSTOSS: ') && adv.full.startsWith('💡 EMPFEHLUNG: Dame h5 → f7 (Dxf7#)'));
  const adv2 = coach.advise(ChessBoard.fromFEN('4k3/8/8/3r4/8/8/3N4/7K'), WHITE, [], 80000);
  ok('Coach rettet den haengenden Springer', (adv2.move && adv2.move.from.row === 6 && adv2.move.from.col === 3) || adv2.full.includes('Rettet'), adv2.move && moveToUci(adv2.move));
  const afterBad = copyAfter(defBoard, badQ);
  ok('Rueckmeldung warnt vor gedecktem Schlagen', coach.feedbackAfterOwnMove(defBoard, afterBad, badQ, WHITE).text.includes('gedeckt'));
  ok('Coach: Bewertungszeile am Ende', adv2.full.split('\n').pop().startsWith('Bewertung'));
  const adv0 = coach.advise(new ChessBoard(), WHITE, [], 60000);
  ok('Coach (Startstellung) empfiehlt prinzipiellen Zug und nennt Buch', adv0.move && ['e2e4', 'd2d4', 'g1f3', 'c2c4', 'b1c3', 'e2e3', 'd2d3', 'g2g3'].includes(moveToUci(adv0.move)) && adv0.full.includes('Eroeffnungstheorie'), adv0.move && moveToUci(adv0.move));
  ok('Bedrohungsbericht nach Gegnerzug (Matt-Drohung / Schach)', (() => {
    const before = ChessBoard.fromFEN('6k1/5ppp/8/8/8/8/5PPP/r5K1'); const m = before.findMoveByUci('a1a8', BLACK); void m;
    const b = ChessBoard.fromFEN('4k3/8/8/8/8/8/8/R3K3'); const mv = b.findMoveByUci('a1a8', WHITE); const a = copyAfter(b, mv);
    const tr = coach.threatReport(a, b, mv, BLACK);
    return tr.text.startsWith('Der Gegner spielte Turm a1 → a8 (Ta8+).') && tr.text.includes('Du stehst im SCHACH!');
  })());
}

// ── 16. Zugbewertung: Eroeffnungsprinzipien (v3.1) ──
console.log('16) Eroeffnungsprinzipien');
{
  const startPos = new ChessBoard();
  const rt = (uci) => { const m = startPos.findMoveByUci(uci, WHITE); return new ChessMoveRater().rate(m, startPos, copyAfter(startPos, m), WHITE); };
  const rF3 = rt('f2f3');
  ok('1.f3 wird als Ungenauigkeit bewertet (<= 8, war 12)', rF3.value <= 8, rF3.value);
  ok('1.f3: Begruendung nennt den f-Bauern', rF3.text.includes('f-Bauer'));
  ok('1.e4 bleibt ein guter Zug (>= 11)', rt('e2e4').value >= 11);
  ok('1.a4 hoechstens 10 Punkte', rt('a2a4').value <= 10);
}

// ── 17. Analyzer ──
console.log('17) Zuganalyse');
{
  const an = new K.ChessMoveAnalyzer();
  const b0 = new ChessBoard(), m = b0.findMoveByUci('e2e4', WHITE), b1 = copyAfter(b0, m);
  const r = an.analyze(m, b0, b1, WHITE, true);
  ok('Analyse: 1.e4 mit Zugwert >= 11 und positiver Klassifikation', r.rating >= 11 && ['good', 'neutral', 'brilliant', 'book'].includes(r.classification), r.rating + ' ' + r.classification);
  ok('Analyse: Zusammenfassung beginnt mit "Zugwert: n/15 - "', /^Zugwert: \d+\/15 - /.test(r.summary));
  ok('Analyse: Lernmodus enthaelt Buchfortsetzung', r.summary.includes('Buchfortsetzung: '));
  ok('Klassifikation: Symbole und Namen', K.MoveClassification.rawValue('blunder') === '??' && K.MoveClassification.germanName('mistake') === 'Fehler' && K.MoveClassification.rawValue('neutral') === '');
  an.rewind(['e2e4'], b1);
  ok('rewind setzt den Zaehler', an.moveNumber === 1);
}

// ── 18. Partie (Spielablauf ohne Oberflaeche) ──
console.log('18) Partie');
(async () => {
  try {
    // 18a) Zwei Spieler, Schaefermatt
    {
      const p = new K.Partie({ autoComputer: true });
      const ereignisse = [];
      ['status', 'zug', 'spielende'].forEach(n => p.on(n, d => ereignisse.push(n)));
      p.neuesSpiel({ modus: 'playerVsPlayer', weissName: 'Anna', schwarzName: 'Ben', analyse: false });
      ok('Partie: Statuszeile "Anna ist am Zug"', p.statusZeile() === 'Anna ist am Zug');
      for (const u of ['e2e4', 'e7e5', 'f1c4', 'b8c6', 'd1h5', 'g8f6']) p.playerMoveUci(u);
      ok('Partie: 6 Zuege, Weiss am Zug, Undo-Stack 6', p.gameMoveHistory.length === 6 && p.currentPlayer === WHITE && p.undoStack.length === 6);
      const r = p.playerMoveUci('h5f7');
      ok('Partie: Schaefermatt beendet das Spiel (Weiss gewinnt)', p.gameOver && p.letztesErgebnis.art === 'matt' && p.letztesErgebnis.gewinner === WHITE && p.letztesErgebnis.text === 'Schachmatt! Anna gewinnt!', JSON.stringify(p.letztesErgebnis));
      ok('Partie: Ereignisse status/zug/spielende gefeuert', ['status', 'zug', 'spielende'].every(n => ereignisse.includes(n)));
      ok('Partie: nach Spielende keine Klicks', p.handleClick(6, 4).typ === 'ignoriert');
      ok('Partie: undoMove nimmt den Mattzug zurueck', p.undoMove() && !p.gameOver && p.currentPlayer === WHITE && p.gameMoveHistory.length === 6);
      ok('Partie: Material-Anzeige', p.materialLabels().weiss.startsWith('♔ Anna'));
    }
    // 18b) Klicks, Auswahl, Umwandlung
    {
      const p = new K.Partie();
      p.neuesSpiel({ modus: 'playerVsPlayer', analyse: false });
      const a = p.handleClick(6, 4);
      ok('Klick auf e2 waehlt den Bauern (2 Ziele)', a.typ === 'auswahl' && a.ziele.length === 2);
      ok('Klick auf leeres Feld hebt Auswahl auf', p.handleClick(3, 0).typ === 'abwahl' && p.selectedPos === null);
      p.handleClick(6, 4); const z = p.handleClick(4, 4);
      ok('Klick auf e4 zieht', z.typ === 'zug' && p.currentPlayer === BLACK);
      const q = new K.Partie(); q.gameMode = 'playerVsPlayer'; q.board = ChessBoard.fromFEN('7k/4P3/8/8/8/8/8/7K');
      q.currentPlayer = WHITE; q.handleClick(1, 4);
      const u = q.handleClick(0, 4);
      ok('Umwandlung: Klick auf e8 liefert 4 Zuege zur Auswahl', u.typ === 'umwandlung' && u.zuege.length === 4);
    }
    // 18c) Gegen den Computer (Stufe 2), Undo, Tipp in zwei Stufen
    {
      K.Zufall.samen(7);
      const p = new K.Partie({ autoComputer: true });
      p.neuesSpiel({ modus: 'playerVsComputer', stufe: 2, weissName: 'Seb', analyse: false });
      ok('Computer-Spiel: Schwarz heisst "Computer"', p.blackName === 'Computer');
      p.playerMoveUci('e2e4');
      await p.warteAufFertig();
      ok('Computer antwortet automatisch', p.gameMoveHistory.length === 2 && p.currentPlayer === WHITE && !p.computerThinking, p.gameMoveHistory.join());
      ok('Undo bei Computerspiel stellt die Stellung vor dem Menschenzug her', p.undoMove() && p.gameMoveHistory.length === 0 && p.board.boardHash() === new ChessBoard().boardHash());
      const tipps = [];
      p.on('coachBlase', d => tipps.push(d.titel));
      p.on('tippKnopf', d => tipps.push(d.text));
      await p.showHint();
      ok('Tipp 1: Denkanstoss, Knopf "💡 Lösung"', p.hintStage === 1 && p.hintButtonTitle === '💡 Lösung' && tipps.includes('🤔 Denkanstoss'), JSON.stringify(tipps));
      await p.showHint();
      ok('Tipp 2: Loesung mit Pfeil, Auswahl des Zugs', p.hintStage === 2 && p.hintArrow !== null && p.selectedPos !== null && tipps.includes('💡 Empfehlung fuer Seb'));
      p.playerMove(p.hintArrow);
      await p.warteAufFertig();
      ok('Coach-Zustand nach dem Zug zurueckgesetzt', p.hintStage === 0 && p.hintArrow === null);
    }
    // 18d) Lernmodus: Coach-Rueckmeldung und Zugwert
    {
      K.Zufall.samen(11);
      const p = new K.Partie({ autoComputer: true });
      const texte = [];
      p.on('erklaerung', d => texte.push(d.text));
      p.neuesSpiel({ modus: 'tutorial' });
      ok('Lernmodus: Eroeffnungs-Tipp wird gezeigt, Analyse an, Stufe 3', texte[0].startsWith('Willkommen im Lernmodus!') && p.analysisEnabled && p.difficulty === 3);
      p.playerMoveUci('e2e4');
      await p.warteAufFertig();
      ok('Lernmodus: Rueckmeldung zum eigenen Zug + Gegnerzug', texte.some(t => t.startsWith('DEIN ZUG: ')) && p.gameMoveHistory.length === 2, texte[texte.length - 1]);
    }
    // 18e) Akademie: Aufgabe loesen, Profil speichern
    {
      const store = new PlayerProfileStore({ storage: null });
      const p = new K.Partie({ profileStore: store, autoComputer: true });
      p.setzeProfil('Mia');
      const l = ChessAcademy.lessonById('L1-1');
      p.startLesson(l);
      ok('Akademie: Aufgaben-Stellung geladen, Status = Titel', p.board.piece(P(6, 4)).type === PAWN && p.statusText === 'Der Bauer');
      p.playerMoveUci('e2e3');
      ok('Akademie: falscher Zug -> Fehlermeldung, nicht geloest', p.letzterVersuch.richtig === false && !p.lessonSolved && p.lessonAttempts === 1);
      p.board = ChessBoard.fromFEN(l.fen);           // Stellung zurueck (der falsche Zug wurde nur geprueft, nicht gespielt)
      ok('Akademie: falscher Zug wurde nicht ausgefuehrt', p.board.piece(P(6, 4)) !== null);
      p.playerMoveUci('e2e4'); const okz = p.letzterVersuch;
      ok('Akademie: richtiger Zug -> 2 Sterne (2. Versuch), Profil gespeichert', okz.richtig && okz.sterne === 2 && store.profile('Mia').lessonProgress['L1-1'].stars === 2 && store.profile('Mia').lessonProgress['L1-1'].completed);
      ok('Akademie: naechste Lektion = L1-2', p.naechsteLektion().id === 'L1-2');
      ok('Akademie: Hinweis-Text', (() => { let t = ''; p.on('erklaerung', d => { t = d.text; }); p.showLessonHint(); return t.startsWith('💡 TIPP: ') && t.includes('➤ AUFGABE: '); })());
      // Matt-in-1-Aufgabe: 3 Sterne
      p.startLesson(ChessAcademy.lessonById('L4-1'));
      ok('Akademie L4-1 geloest mit 3 Sternen', (p.playerMoveUci('a1a8'), p.letzterVersuch.sterne === 3) && p.gameOver);
    }
    // 18f) Akademie-Freispiel: Zuglimit
    {
      K.Zufall.samen(5);
      const store = new PlayerProfileStore({ storage: null });
      const p = new K.Partie({ profileStore: store, autoComputer: true });
      p.setzeProfil('Leo');
      p.startLesson(ChessAcademy.lessonById('L8-5'));
      ok('Freispiel: KI spielt Schwarz, Analyse an, Stufe 3', p.aiPlaysBlack && p.analysisEnabled && p.difficulty === 3);
      let ende = null;
      p.on('lektionGeloest', d => { ende = { ok: true, d }; }); p.on('lektionFehlgeschlagen', d => { ende = { ok: false, d }; });
      const zuege = ['e2e4', 'g1f3', 'f1c4', 'e1g1', 'd2d3', 'b1c3', 'c1e3', 'a2a3', 'h2h3', 'a1b1'];
      for (let i = 0; i < 10 && !p.gameOver; i++) {
        let m = p.board.findMoveByUci(zuege[i], WHITE);
        if (!m) { const alle = p.board.allLegalMoves(WHITE); m = alle[0]; }
        p.playerMove(m);
        await p.warteAufFertig();
      }
      await p.warteAufFertig();
      ok('Freispiel: nach 10 eigenen Zuegen endet die Aufgabe mit Wertung', p.gameOver && ende !== null && p.lessonOwnMoves === 10 && p.lessonRatingCount === 10, JSON.stringify({ own: p.lessonOwnMoves, n: p.lessonRatingCount, ende: !!ende }));
    }
    // 18g) Remis durch Wiederholung in der Partie
    {
      const p = new K.Partie({ autoComputer: true });
      p.neuesSpiel({ modus: 'playerVsPlayer', analyse: false });
      for (const u of ['g1f3', 'g8f6', 'f3g1', 'f6g8', 'g1f3', 'g8f6', 'f3g1', 'f6g8']) p.playerMoveUci(u);
      ok('Partie: dreifache Wiederholung -> Remis', p.gameOver && p.letztesErgebnis.art === 'wiederholung' && p.letztesErgebnis.text === 'Remis durch Stellungswiederholung!', JSON.stringify(p.letztesErgebnis));
    }
    // 18h) Worker-Jobs (serialisierbar)
    {
      const rechner = new K.LokalerRechner();
      const b = new ChessBoard();
      const r1 = await rechner.ausfuehren('computerZug', JSON.parse(JSON.stringify({ brett: b.toObject(), farbe: WHITE, stufe: 4, verlauf: [] })));
      ok('Rechner-Job computerZug liefert legalen Zug (JSON-klonbar)', uciList(b, WHITE).includes(moveToUci(r1.zug)));
      const r2 = await rechner.ausfuehren('coachRat', JSON.parse(JSON.stringify({ brett: ChessBoard.fromFEN('r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR').toObject(), farbe: WHITE, verlauf: [], budget: 60000 })));
      ok('Rechner-Job coachRat findet Dxf7#', moveToUci(r2.move) === 'h5f7');
      const r3 = await rechner.ausfuehren('bewerteZug', JSON.parse(JSON.stringify({ zug: mm(P(7, 0), P(3, 0), { capturedPiece: QUEEN }), davor: rateBoard.toObject(), danach: copyAfter(rateBoard, good).toObject(), farbe: WHITE })));
      ok('Rechner-Job bewerteZug', r3.value >= 13);
    }
  } catch (e) {
    console.log(e.stack);
    ok('Partie-Tests ohne Ausnahme', false, e.message);
  }
  console.log(`\n${gesamt} Pruefungen, ${fehl} FEHL`);
  console.log(fehl ? 'FEHLER' : 'ALLE OK');
  process.exit(fehl ? 1 : 0);
})();
