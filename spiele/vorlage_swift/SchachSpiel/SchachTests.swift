// SchachTests.swift — Smoke-Tests fuer SchachSpiel
// Wird als main.swift kompiliert: swiftc -D TESTMODE main.swift SchachSpiel.swift
// (Das Skript "SchachSpiel-Testen-und-Bauen.command" erledigt das automatisch.)

import Foundation
import SceneKit

var passed = 0
var failed = 0

func check(_ name: String, _ condition: Bool, _ detail: String = "") {
    if condition {
        passed += 1
        print("  ✅ \(name)")
    } else {
        failed += 1
        print("  ❌ \(name) \(detail)")
    }
}

print("═══ SchachSpiel Smoke-Tests ═══\n")

// ── 1. Zuggenerierung (Perft: bekannte Referenzwerte) ──
print("1) Zuggenerierung (Perft)")
func perft(_ board: ChessBoard, _ color: PlayerColor, _ depth: Int) -> Int {
    if depth == 0 { return 1 }
    var nodes = 0
    for m in board.allLegalMoves(for: color) {
        let tmp = ChessBoard(copyFrom: board)
        tmp.executeMove(m)
        nodes += perft(tmp, color.opposite, depth - 1)
    }
    return nodes
}
let start = ChessBoard()
check("Perft(1) = 20", perft(start, .white, 1) == 20, "-> \(perft(start, .white, 1))")
check("Perft(2) = 400", perft(start, .white, 2) == 400, "-> \(perft(start, .white, 2))")
check("Perft(3) = 8902", perft(start, .white, 3) == 8902, "-> \(perft(start, .white, 3))")

// ── 2. Schachmatt-Erkennung (Schaefermatt) ──
print("\n2) Matt / Patt / Remis")
let scholars = ChessBoard(fen: "r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR")
let mateMove = ChessMove(from: Position(row: 3, col: 7), to: Position(row: 1, col: 5), capturedPiece: .pawn)
scholars.executeMove(mateMove)
check("Schaefermatt: Schwarz ist matt",
      scholars.isInCheck(.black) && !scholars.hasLegalMoves(for: .black))
if case .checkmate(let w) = scholars.checkGameResult(for: .black) {
    check("Gewinner ist Weiss", w == .white)
} else { check("checkGameResult liefert Matt", false) }

// Patt: Schwarz Ka8, Weiss Kb6 + Db6?? klassisch: Dame c7, Koenig b6 -> Patt fuer Schwarz
let stale = ChessBoard(fen: "k7/2Q5/1K6/8/8/8/8/8")
check("Patt korrekt erkannt", {
    if case .stalemate = stale.checkGameResult(for: .black) { return true }
    return false
}())

let insuff = ChessBoard(fen: "k7/8/8/8/8/8/8/K5N1")
check("K+S vs K = Remis (totes Remis)", insuff.isInsufficientMaterial())

// ── 3. Spezialregeln ──
print("\n3) Spezialregeln")
let castleBoard = ChessBoard(fen: "4k3/8/8/8/8/8/8/4K2R")
let castleMoves = castleBoard.allLegalMoves(for: .white).filter { $0.isCastling }
check("Kurze Rochade wird generiert", castleMoves.count == 1)
if let cm = castleMoves.first {
    castleBoard.executeMove(cm)
    check("Rochade: Koenig auf g1", castleBoard.piece(at: Position(row: 7, col: 6))?.type == .king)
    check("Rochade: Turm auf f1", castleBoard.piece(at: Position(row: 7, col: 5))?.type == .rook)
}

let epBoard = ChessBoard(fen: "7k/8/8/3pP3/8/8/8/7K w d6")
let epMoves = epBoard.allLegalMoves(for: .white).filter { $0.isEnPassant }
check("En passant wird generiert", epMoves.count == 1)
if let ep = epMoves.first {
    epBoard.executeMove(ep)
    check("En passant: geschlagener Bauer entfernt", epBoard.piece(at: Position(row: 3, col: 3)) == nil)
}

let promoBoard = ChessBoard(fen: "7k/4P3/8/8/8/8/8/7K")
let promos = promoBoard.allLegalMoves(for: .white).filter { $0.promotion != nil }
check("Umwandlung: 4 Varianten (D/T/L/S)", promos.count == 4)

// ── 4. KI-Engine ──
print("\n4) KI-Engine")
let ai = ChessAIEngine(difficulty: 3)
let aiBoard = ChessBoard()
if let mv = ai.bestMove(board: aiBoard, color: .white) {
    let legal = aiBoard.allLegalMoves(for: .white)
    check("KI liefert legalen Zug", legal.contains(mv))
} else { check("KI liefert Zug", false) }

// KI-STAERKE (FIX #12/#13): haengende Dame schlagen, gedeckte Figur NICHT schlagen
let midAI = ChessAIEngine(difficulty: 5)
let hangBoard = ChessBoard(fen: "7k/8/8/3q4/8/8/8/3R3K")
if let mv = midAI.bestMove(board: hangBoard, color: .white) {
    check("KI (Stufe 5) schlaegt haengende Dame", moveToUci(mv) == "d1d5", "-> spielte \(moveToUci(mv))")
} else { check("KI (Stufe 5) schlaegt haengende Dame", false) }

let poisonBoard = ChessBoard(fen: "7k/8/3p4/4p2Q/8/8/8/7K")
if let mv = midAI.bestMove(board: poisonBoard, color: .white) {
    check("KI (Stufe 5) nimmt KEINEN gedeckten Bauern mit der Dame (Ruhe-Suche)",
          moveToUci(mv) != "h5e5", "-> spielte \(moveToUci(mv))")
} else { check("KI vergiftete-Bauern-Test", false) }

// Eroeffnungsbuch fuer die KI: Nach 1.e4 e5 kennt das Buch 2.Sf3 & Co.
let bookNext = ChessOpeningBook.nextBookMoves(afterMoves: ["e2e4", "e7e5"])
check("Buch kennt Fortsetzungen nach 1.e4 e5", !bookNext.isEmpty)

// KI findet Matt in 1 (Grundreihe)
let m1Board = ChessBoard(fen: "6k1/5ppp/8/8/8/8/8/R5K1")
let strongAI = ChessAIEngine(difficulty: 6)
if let mv = strongAI.bestMove(board: m1Board, color: .white) {
    let tmp = ChessBoard(copyFrom: m1Board)
    tmp.executeMove(mv)
    check("KI (Stufe 6) findet Matt in 1", tmp.isInCheck(.black) && !tmp.hasLegalMoves(for: .black),
          "-> spielte \(moveToUci(mv))")
}

// ── 5. Zugbewertung 1-15 ──
print("\n5) Zugbewertung 1-15")
let rater = ChessMoveRater()
// Bester Zug: Dame gratis schlagen
let rateBoard = ChessBoard(fen: "7k/8/8/q7/8/8/8/R6K")
let good = ChessMove(from: Position(row: 7, col: 0), to: Position(row: 3, col: 0), capturedPiece: .queen)
let afterGood = ChessBoard(copyFrom: rateBoard); afterGood.executeMove(good)
let r1 = rater.rate(move: good, boardBefore: rateBoard, boardAfter: afterGood, color: .white)
check("Dame gratis schlagen -> Wert >= 13 (war \(r1.value))", r1.value >= 13)

// Schlechter Zug: Turm einstellen statt Dame schlagen
let bad = ChessMove(from: Position(row: 7, col: 0), to: Position(row: 7, col: 1))
let afterBad = ChessBoard(copyFrom: rateBoard); afterBad.executeMove(bad)
let r2 = rater.rate(move: bad, boardBefore: rateBoard, boardAfter: afterBad, color: .white)
check("Dame stehen lassen -> Wert <= 5 (war \(r2.value))", r2.value <= 5)
check("Erklaerung nennt besseren Zug", r2.text.contains("Besser war"))

// Matt = 15
let mateB = ChessBoard(fen: "6k1/5ppp/8/8/8/8/8/R5K1")
let mateM = ChessMove(from: Position(row: 7, col: 0), to: Position(row: 0, col: 0))
let afterM = ChessBoard(copyFrom: mateB); afterM.executeMove(mateM)
let r3 = rater.rate(move: mateM, boardBefore: mateB, boardAfter: afterM, color: .white)
check("Matt setzen -> Wert 15", r3.value == 15)
check("Alle Werte in 1...15", (1...15).contains(r1.value) && (1...15).contains(r2.value) && (1...15).contains(r3.value))

// ── 6. Akademie-Daten ──
print("\n6) Schach-Akademie (10 Stufen)")
check("47 Aufgaben vorhanden", ChessAcademy.lessons.count == 47, "-> \(ChessAcademy.lessons.count)")
check("10 Stufen definiert", ChessAcademy.levelInfo.count == 10)
var lessonErrors = 0
for lesson in ChessAcademy.lessons {
    let b = ChessBoard(fen: lesson.fen)
    if b.findKing(.white) == nil || b.findKing(.black) == nil {
        lessonErrors += 1
        print("    ⚠️ \(lesson.id): Koenig fehlt!")
        continue
    }
    if lesson.freePlayMoves == 0 {
        let legal = b.allLegalMoves(for: .white)
        for sol in lesson.solutions {
            if !legal.contains(where: { moveToUci($0) == sol }) {
                lessonErrors += 1
                print("    ⚠️ \(lesson.id): Loesung \(sol) nicht legal!")
            }
        }
        if lesson.solutions.isEmpty { lessonErrors += 1; print("    ⚠️ \(lesson.id): keine Loesung!") }
    }
}
check("Alle Aufgaben-Loesungen sind legale Zuege", lessonErrors == 0)

// Matt-in-1-Aufgaben ergeben wirklich Matt
let mate1Ids = ["L4-1", "L4-2", "L4-3", "L4-4", "L4-5", "L5-5", "L10-2", "L10-3", "L10-4"]
var mateErrors = 0
for id in mate1Ids {
    guard let lesson = ChessAcademy.lessons.first(where: { $0.id == id }) else { mateErrors += 1; continue }
    let b = ChessBoard(fen: lesson.fen)
    guard let sol = b.allLegalMoves(for: .white).first(where: { moveToUci($0) == lesson.solutions[0] }) else { mateErrors += 1; continue }
    let tmp = ChessBoard(copyFrom: b)
    tmp.executeMove(sol)
    if !(tmp.isInCheck(.black) && !tmp.hasLegalMoves(for: .black)) {
        mateErrors += 1
        print("    ⚠️ \(id): Loesung ist KEIN Matt!")
    }
}
check("Alle Matt-in-1-Aufgaben korrekt", mateErrors == 0)

// Stufen-Freischaltung
var testProfile = PlayerProfile(name: "TESTSPIELER_INTERN")
check("Stufe 1 offen, Stufe 2 gesperrt",
      ChessAcademy.isLevelUnlocked(profile: testProfile, level: 1) &&
      !ChessAcademy.isLevelUnlocked(profile: testProfile, level: 2))
for lesson in ChessAcademy.lessons(forLevel: 1) {
    testProfile.lessonProgress[lesson.id] = LessonProgress(completed: true, attempts: 1, stars: 3)
}
check("Stufe 2 nach Stufe-1-Abschluss frei", ChessAcademy.isLevelUnlocked(profile: testProfile, level: 2))

// ── 7. Profil-Speicherung ──
print("\n7) Spielerprofile")
let store = PlayerProfileStore.shared
let before = store.profiles.count
var p = store.createOrGet(name: "TESTSPIELER_INTERN")
p.lessonProgress["L1-1"] = LessonProgress(completed: true, attempts: 2, stars: 2)
store.update(p)
store.load()
let reloaded = store.profile(named: "TESTSPIELER_INTERN")
check("Profil gespeichert & geladen", reloaded != nil)
check("Fortschritt persistiert", reloaded?.lessonProgress["L1-1"]?.stars == 2)
// Testprofil wieder entfernen
store.removeProfile(named: "TESTSPIELER_INTERN")
check("Testprofil aufgeraeumt", store.profile(named: "TESTSPIELER_INTERN") == nil && store.profiles.count == before)

// ── 8. Dreifache Stellungswiederholung (FIX #6) ──
print("\n8) Remis-Regeln")
let repBoard = ChessBoard()
var hashes: [String: Int] = [:]
func rec(_ b: ChessBoard, _ stm: PlayerColor) { hashes[b.boardHash() + (stm == .white ? "w" : "b"), default: 0] += 1 }
rec(repBoard, .white)
let seq = [("g1","f3"), ("g8","f6"), ("f3","g1"), ("f6","g8"), ("g1","f3"), ("g8","f6"), ("f3","g1"), ("f6","g8")]
var stm = PlayerColor.white
for (f, t) in seq {
    func parse(_ s: String) -> Position {
        Position(row: 8 - Int(String(s.last!))!, col: Int(s.first!.asciiValue! - 97))
    }
    repBoard.executeMove(ChessMove(from: parse(f), to: parse(t)))
    stm = stm.opposite
    rec(repBoard, stm)
}
check("3fache Wiederholung der Grundstellung erkannt", (hashes[ChessBoard().boardHash() + "w"] ?? 0) >= 3,
      "-> \(hashes[ChessBoard().boardHash() + "w"] ?? 0)x")

// ── 9. Eroeffnungsbuch & Wissensbasis ──
print("\n9) Eroeffnungsbuch & Wissensbasis")
let italian = ChessOpeningBook.findOpening(moves: ["e2e4", "e7e5", "g1f3", "b8c6", "f1c4"])
check("Italienische Partie erkannt", italian?.name.contains("Italienisch") == true, "-> \(italian?.name ?? "nichts")")
let najdorf = ChessOpeningBook.findOpening(moves: ["e2e4", "c7c5", "g1f3", "d7d6", "d2d4", "c5d4", "f3d4", "g8f6", "b1c3", "a7a6"])
check("Najdorf erkannt", najdorf?.name.contains("Najdorf") == true)
check("Buchfortsetzungen nach 1.e4 vorhanden", !ChessOpeningBook.nextBookMoves(afterMoves: ["e2e4"]).isEmpty)
let stats = ChessKnowledgeBase.stats
check("20 Buecher in der Wissensbasis", stats.books == 20, "-> \(stats.books)")
check("Konzepte fuer alle Kategorien", ["eroeffnung", "mittelspiel", "endspiel", "taktik", "strategie", "psychologie"].allSatisfy { ChessKnowledgeBase.findConcept(category: $0) != nil })

// ── 10. Taktik-Erkennung ──
print("\n10) Taktik-Erkennung")
// Springergabel aus Aufgabe L6-1 nachspielen
let forkBoard = ChessBoard(fen: "r3k3/8/8/3N4/8/8/8/4K3")
let forkMove = ChessMove(from: Position(row: 3, col: 3), to: Position(row: 1, col: 2))
forkBoard.executeMove(forkMove)
check("Springergabel erkannt", ChessTacticsDetector.detectFork(board: forkBoard, move: forkMove, color: .white) != nil)
// Fesselung: Laeufer b5 fesselt Springer c6 gegen Koenig e8
let pinBoard = ChessBoard(fen: "4k3/8/2n5/1B6/3P4/8/8/4K3")
check("Fesselung erkannt", ChessTacticsDetector.detectPin(board: pinBoard, color: .white) != nil)
// Doppelschach (FIX #4): Springer zieht mit Abzug UND eigenem Schach
let dblBoard = ChessBoard(fen: "6k1/8/8/3N4/8/1B6/8/6K1")
let dblMove = ChessMove(from: Position(row: 3, col: 3), to: Position(row: 2, col: 5))
dblBoard.executeMove(dblMove)
let dblMsg = ChessTacticsDetector.detectCheck(board: dblBoard, move: dblMove, color: .white)
check("DOPPELSCHACH erkannt (FIX #4)", dblMsg?.contains("DOPPELSCHACH") == true, "-> \(dblMsg ?? "nichts")")
// Einfaches Schach
let chkBoard = ChessBoard(fen: "4k3/8/8/8/8/8/8/R6K")
let chkMove = ChessMove(from: Position(row: 7, col: 0), to: Position(row: 0, col: 0))
chkBoard.executeMove(chkMove)
check("Einfaches Schach erkannt", ChessTacticsDetector.detectCheck(board: chkBoard, move: chkMove, color: .white)?.contains("Schach") == true)

// ── 11. Positionelle Analyse ──
print("\n11) Positionelle Analyse")
let isoBoard = ChessBoard(fen: "4k3/8/8/8/8/8/P7/4K3")
check("Isolierter Bauer erkannt", ChessPositionalAnalyzer.isolatedPawns(board: isoBoard, color: .white) == [0])
let dblPawn = ChessBoard(fen: "4k3/8/8/8/4P3/8/4P3/4K3")
check("Doppelbauer erkannt", ChessPositionalAnalyzer.doubledPawns(board: dblPawn, color: .white) == [4])
let passBoard = ChessBoard(fen: "4k3/8/1P6/8/8/8/8/4K3")
check("Freibauer erkannt", ChessPositionalAnalyzer.passedPawns(board: passBoard, color: .white).count == 1)
let safeBoard = ChessBoard(fen: "4k3/8/8/8/8/8/5PPP/6K1")
check("Koenigssicherheit: volles Bauernschild = +15", ChessPositionalAnalyzer.kingSafety(board: safeBoard, color: .white).score == 15)
let nakedBoard = ChessBoard(fen: "4k3/8/8/8/8/8/8/6K1")
check("Koenigssicherheit: nackter Koenig negativ", ChessPositionalAnalyzer.kingSafety(board: nakedBoard, color: .white).score < 0)

// ── 12. Notation & Brett-Grundlagen ──
print("\n12) Notation & Brett-Grundlagen")
check("posToAlgebraic a8", posToAlgebraic(Position(row: 0, col: 0)) == "a8")
check("posToAlgebraic h1", posToAlgebraic(Position(row: 7, col: 7)) == "h1")
let promoUci = ChessMove(from: Position(row: 1, col: 4), to: Position(row: 0, col: 4), promotion: .queen)
check("moveToUci mit Umwandlung: e7e8q", moveToUci(promoUci) == "e7e8q")
let orig = ChessBoard()
let copy = ChessBoard(copyFrom: orig)
copy.executeMove(ChessMove(from: Position(row: 6, col: 4), to: Position(row: 4, col: 4)))
check("Brett-Kopie ist unabhaengig", orig.piece(at: Position(row: 6, col: 4)) != nil &&
      copy.piece(at: Position(row: 6, col: 4)) == nil)
check("boardHash aendert sich nach Zug", orig.boardHash() != copy.boardHash())
check("boardHash gleich fuer gleiche Stellung", ChessBoard().boardHash() == ChessBoard().boardHash())
let fenRoundtrip = ChessBoard(fen: "r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR")
check("FEN-Parser: 32 Figuren geladen", (0..<8).flatMap { r in (0..<8).compactMap { c in fenRoundtrip.grid[r][c] } }.count == 32)
check("FEN-Parser: weisse Dame auf h5", fenRoundtrip.piece(at: Position(row: 3, col: 7))?.type == .queen)
let insuffB = ChessBoard(fen: "k7/8/8/8/8/8/8/K5B1")
check("K+L vs K = totes Remis", insuffB.isInsufficientMaterial())
let notInsuff = ChessBoard(fen: "k7/8/8/8/8/8/8/K5R1")
check("K+T vs K = KEIN totes Remis", !notInsuff.isInsufficientMaterial())
let evalStart = ChessAIEngine(difficulty: 3)
check("Startstellung symmetrisch bewertet (0)", evalStart.evaluate(board: ChessBoard(), for: .white) == 0)

// ── 13. Akademie: Stufen-Struktur im Detail ──
print("\n13) Akademie-Stufenaufbau")
let expectedCounts = [1: 6, 2: 4, 3: 4, 4: 5, 5: 5, 6: 4, 7: 4, 8: 5, 9: 5, 10: 5]
for level in 1...10 {
    let n = ChessAcademy.lessons(forLevel: level).count
    check("Stufe \(level): \(expectedCounts[level]!) Aufgaben", n == expectedCounts[level]!, "-> \(n)")
}
let freePlayLessons = ChessAcademy.lessons.filter { $0.freePlayMoves > 0 }
check("3 Spielpraxis-Aufgaben (Stufe 8/9/10)", freePlayLessons.count == 3 &&
      Set(freePlayLessons.map { $0.level }) == Set([8, 9, 10]))

// ── 14. Optik: Farbthemen (NEU) ──
print("\n14) Farbthemen")
check("6 Farbthemen vorhanden", BoardTheme.themes.count == 6, "-> \(BoardTheme.themes.count)")
check("Themen-Namen eindeutig", Set(BoardTheme.themes.map { $0.name }).count == BoardTheme.themes.count)
check("Hell != Dunkel in jedem Thema", BoardTheme.themes.allSatisfy { $0.light != $0.dark })
let savedIdx = BoardTheme.currentIndex
BoardTheme.currentIndex = 2
check("Thema wechseln & speichern", BoardTheme.current.name == "Ozean")
BoardTheme.currentIndex = 7
check("Themen-Index rotiert sauber (7 -> 1)", BoardTheme.currentIndex == 1)
BoardTheme.currentIndex = savedIdx
check("Thema zurueckgesetzt", BoardTheme.currentIndex == savedIdx % BoardTheme.themes.count)

// ── 15. Optik: Brett-View & Animation (NEU) ──
print("\n15) Brett-View & 3D-Animation")
let testBoardView = ChessBoardView(frame: NSRect(x: 0, y: 0, width: 400, height: 400))
check("Zellgroesse bei 400pt = 50pt", testBoardView.cellSize == 50)
let c00 = testBoardView.centerOfSquare(Position(row: 0, col: 0))
check("Feldmitte a8 korrekt (25/25)", c00.x == 25 && c00.y == 25)
let c77 = testBoardView.centerOfSquare(Position(row: 7, col: 7))
check("Feldmitte h1 korrekt (375/375)", c77.x == 375 && c77.y == 375)
testBoardView.hiddenSquares = [Position(row: 0, col: 0)]
check("hiddenSquares setzbar (fuer Animation)", testBoardView.hiddenSquares.count == 1)
testBoardView.nameTags = [PlayerColor.white.rawValue: (type: .king, name: "Seb")]
check("Namens-Schild am Koenig setzbar", testBoardView.nameTags[0]?.name == "Seb")

let anim = PieceAnimationView(frame: NSRect(x: 0, y: 0, width: 400, height: 400))
check("Animation: klickdurchlaessig (hitTest nil)", anim.hitTest(NSPoint(x: 10, y: 10)) == nil)
check("Animation: anfangs inaktiv", !anim.isAnimating)
var animDone = false
anim.animate(moving: (.queen, .white), captured: (.rook, .black),
             from: NSPoint(x: 25, y: 25), to: NSPoint(x: 375, y: 375), cell: 50) { animDone = true }
check("Animation: laeuft nach Start", anim.isAnimating)
anim.cancel()
check("Animation: cancel beendet & ruft Abschluss auf", !anim.isAnimating && animDone)
check("Fenstergroesse skaliert Brett (relayout nutzt min(B,H))", ChessBoardView(frame: NSRect(x: 0, y: 0, width: 800, height: 600)).cellSize == 75)

// ── 16. Paw-Patrol-Modus (NEU) ──
print("\n16) Paw-Patrol-Figuren 🐾")
let allTypes: [ChessPieceType] = [.king, .queen, .rook, .bishop, .knight, .pawn]
check("Jede Figur hat ein Paw-Patrol-Emoji", allTypes.allSatisfy { !pawPatrolGlyph($0).isEmpty })
check("Emojis eindeutig pro Figurentyp", Set(allTypes.map { pawPatrolGlyph($0) }).count == 6)
check("Chase ist der Koenig", pawPatrolName(.king) == "Chase")
check("Skye ist die Dame", pawPatrolName(.queen) == "Skye")
check("Figuren sind Hunde: Chase = Polizeihund", pawPatrolGlyph(.king) == "🐕‍🦺")
check("Fahrzeug-Abzeichen: Marshall faehrt Feuerwehrauto", pawPatrolBadge(.rook) == "🚒")
check("Abzeichen: Skye fliegt Helikopter", pawPatrolBadge(.queen) == "🚁")
check("Pfoetchen haben kein Fahrzeug", pawPatrolBadge(.pawn).isEmpty)
check("Charakterfarben eindeutig (Chase blau, Marshall rot, ...)",
      Set([ChessPieceType.king, .queen, .rook, .bishop, .knight].map { pawPatrolColor($0).description }).count == 5)
let savedStyle = PieceStyle.current
PieceStyle.current = .pawPatrol
check("Paw-Patrol-Stil speicherbar", PieceStyle.current == .pawPatrol)
PieceStyle.current = .klassisch
check("Zurueck zu klassischen Figuren", PieceStyle.current == .klassisch)
// Erklaertexte sprechen im Paw-Modus Paw-Patrol
PieceStyle.current = .pawPatrol
check("displayName: 'Chase (Koenig)' im Paw-Modus", ChessPieceType.king.displayName == "Chase (Koenig)")
check("displayName: 'Marshall (Turm)' im Paw-Modus", ChessPieceType.rook.displayName == "Marshall (Turm)")
PieceStyle.current = .klassisch
check("displayName: klassisch nur 'Turm'", ChessPieceType.rook.displayName == "Turm")

// Kampf-Animation auch im Paw-Patrol-Stil lauffaehig
PieceStyle.current = .pawPatrol
let pawAnim = PieceAnimationView(frame: NSRect(x: 0, y: 0, width: 400, height: 400))
var pawDone = false
pawAnim.animate(moving: (.king, .white), captured: (.rook, .black),
                from: NSPoint(x: 25, y: 25), to: NSPoint(x: 375, y: 375), cell: 50) { pawDone = true }
check("Paw-Patrol-Kampfanimation startet", pawAnim.isAnimating)
pawAnim.cancel()
check("Paw-Patrol-Kampfanimation sauber beendet", !pawAnim.isAnimating && pawDone)
PieceStyle.current = savedStyle

// ── 17. v3: Coach, Abtausch-Rechnung, Notation, Brett wenden, 3D ──
print("\n17) v3: Coach & echtes 3D")
let seeBoard = ChessBoard(fen: "4k3/8/8/3q4/8/8/8/3QK3")
let freeQ = ChessMove(from: Position(row: 7, col: 3), to: Position(row: 3, col: 3), capturedPiece: .queen)
check("SEE: ungedeckte Dame schlagen = +900", CoachTools.exchangeResult(of: freeQ, board: seeBoard) == 900,
      "-> \(CoachTools.exchangeResult(of: freeQ, board: seeBoard))")
let defBoard = ChessBoard(fen: "4k3/8/2p5/3p4/8/8/8/3QK3")
let badQ = ChessMove(from: Position(row: 7, col: 3), to: Position(row: 3, col: 3), capturedPiece: .pawn)
check("SEE: gedeckten Bauern mit Dame schlagen verliert", CoachTools.exchangeResult(of: badQ, board: defBoard) < 0)
let coachHangBoard = ChessBoard(fen: "4k3/8/8/3r4/8/8/3N4/7K")
check("Haengende Figur erkannt (Springer d2 vom Turm angegriffen)",
      CoachTools.hangingPieces(of: .white, board: coachHangBoard).contains { $0.pos == Position(row: 6, col: 3) })
check("Gedeckte Figur haengt nicht", CoachTools.hangingPieces(of: .white, board: ChessBoard()).isEmpty)

let sanStart = ChessBoard()
check("Notation: e2-e4 = e4", CoachTools.san(ChessMove(from: Position(row: 6, col: 4), to: Position(row: 4, col: 4)), board: sanStart) == "e4")
check("Notation: Sg1-f3 = Sf3", CoachTools.san(ChessMove(from: Position(row: 7, col: 6), to: Position(row: 5, col: 5)), board: sanStart) == "Sf3")
let castleSan = ChessBoard(fen: "4k3/8/8/8/8/8/8/4K2R")
check("Notation: Rochade = 0-0", CoachTools.san(ChessMove(from: Position(row: 7, col: 4), to: Position(row: 7, col: 6), isCastling: true), board: castleSan) == "0-0")

let rankEngine = ChessAIEngine(difficulty: 1)
let ranked = rankEngine.rankMoves(board: ChessBoard(), color: .white, maxDepth: 2, nodeBudget: 50_000)
check("rankMoves: alle 20 Startzuege bewertet", ranked.ranked.count == 20, "-> \(ranked.ranked.count)")
check("rankMoves: sortiert (bester zuerst)", zip(ranked.ranked, ranked.ranked.dropFirst()).allSatisfy { $0.score >= $1.score })

let coach = ChessCoach()
let mateBoard = ChessBoard(fen: "r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR")
let adv = coach.advise(board: mateBoard, color: .white, history: [], budget: 120_000)
check("Coach findet Matt in 1 (Dxf7#)", adv.move.map { moveToUci($0) } == "h5f7", "-> \(adv.move.map { moveToUci($0) } ?? "nichts")")
check("Coach-Denkanstoss verraet die Loesung nicht", !adv.nudge.contains("f7"))
check("Coach-Loesung begruendet das Matt", adv.full.contains("MATT") || adv.full.contains("matt"))
let rescueBoard = ChessBoard(fen: "4k3/8/8/3r4/8/8/3N4/7K")
let adv2 = coach.advise(board: rescueBoard, color: .white, history: [], budget: 80_000)
check("Coach rettet den haengenden Springer", adv2.move?.from == Position(row: 6, col: 3) || (adv2.full.contains("Rettet")),
      "-> \(adv2.move.map { moveToUci($0) } ?? "nichts")")
let fb = coach.feedbackAfterOwnMove(before: defBoard, after: { let b = ChessBoard(copyFrom: defBoard); b.executeMove(badQ); return b }(),
                                    move: badQ, color: .white)
check("Rueckmeldung warnt vor gedecktem Schlagen", fb.text.contains("gedeckt"))

let flipView = ChessBoardView(frame: NSRect(x: 0, y: 0, width: 400, height: 400))
flipView.viewFromBlack = true
let a8Flipped = flipView.centerOfSquare(Position(row: 0, col: 0))
check("Brett wenden: a8 liegt unten rechts (375/375)", a8Flipped.x == 375 && a8Flipped.y == 375)

let knightNode = Piece3DFactory.makePiece(ChessPiece(color: .white, type: .knight))
check("3D: Springer hat Pferdekopf", knightNode.childNode(withName: "kopf", recursively: true) != nil)
check("3D: Figurenschluessel", knightNode.name == "P_w2")
let latheGeo = Piece3DFactory.lathe(Piece3DFactory.profile(.pawn))
check("3D: Drehkoerper hat Geometrie", !latheGeo.sources.isEmpty && !latheGeo.elements.isEmpty)
let view3D = Board3DView(boardFrame: NSRect(x: 0, y: 0, width: 500, height: 400))
view3D.refresh(board: ChessBoard(), selected: nil, targets: [], last: nil, check: nil, hint: nil, danger: [], focus: nil)
check("3D-Brett: anfangs keine Animation", !view3D.isAnimating)
let b3Before = ChessBoard(fen: "4k3/8/8/3q4/8/8/8/3QK3")
let b3After = ChessBoard(copyFrom: b3Before); b3After.executeMove(freeQ)
var fightDone = false
view3D.animateMove(freeQ, before: b3Before, after: b3After, fights: true) { fightDone = true }
check("3D-Kampfszene startet", view3D.isAnimating)
view3D.finishNow()
check("3D-Kampfszene sauber abbrechbar", !view3D.isAnimating && fightDone)
view3D.setViewFromBlack(true, animated: false)
check("3D: Brett gewendet", view3D.viewFromBlack)

// ── 18. v3.1: Hunde-Team & genauere Eroeffnungs-Bewertung ──
print("\n18) v3.1: Hunde-Team & Eroeffnungsprinzipien")
Piece3DFactory.dogMode = true
let dogKing = Piece3DFactory.makePiece(ChessPiece(color: .white, type: .king))
check("Hunde-Team: Koenig hat Hundekopf", dogKing.childNode(withName: "hundekopf", recursively: true) != nil)
check("Hunde-Team: eigener Figurenschluessel", dogKing.name == "P_w6d", "-> \(dogKing.name ?? "-")")
check("Hunde-Team: alle Figuren baubar",
      allTypes.allSatisfy { Piece3DFactory.makePiece(ChessPiece(color: .black, type: $0)).childNode(withName: "hundekopf", recursively: true) != nil })
check("Hunde-Team: Namen (Bruno = Koenig, Luna = Dame)", Piece3DFactory.dogName(.king) == "Bruno" && Piece3DFactory.dogName(.queen) == "Luna")
check("Hunde-Team: Koenig ist der groesste Hund", Piece3DFactory.height(.king) > Piece3DFactory.height(.pawn))
Piece3DFactory.active3D = true
check("Anzeigename im 3D-Hunde-Modus: 'Brocken (Turm)'", ChessPieceType.rook.displayName == "Brocken (Turm)")
Piece3DFactory.active3D = false
Piece3DFactory.dogMode = false
check("Klassischer Schluessel nach Umschalten", Piece3DFactory.key(ChessPiece(color: .white, type: .king)) == "P_w6")

let openRater = ChessMoveRater()
let startPos = ChessBoard()
let f3 = ChessMove(from: Position(row: 6, col: 5), to: Position(row: 5, col: 5))
let afterF3 = ChessBoard(copyFrom: startPos); afterF3.executeMove(f3)
let rF3 = openRater.rate(move: f3, boardBefore: startPos, boardAfter: afterF3, color: .white)
check("1.f3 wird als Ungenauigkeit bewertet (<= 8, war 12)", rF3.value <= 8, "-> \(rF3.value)")
check("1.f3: Begruendung nennt den f-Bauern", rF3.text.contains("f-Bauer"))
let e4 = ChessMove(from: Position(row: 6, col: 4), to: Position(row: 4, col: 4))
let afterE4 = ChessBoard(copyFrom: startPos); afterE4.executeMove(e4)
let rE4 = openRater.rate(move: e4, boardBefore: startPos, boardAfter: afterE4, color: .white)
check("1.e4 bleibt ein guter Zug (>= 11)", rE4.value >= 11, "-> \(rE4.value)")
let a4 = ChessMove(from: Position(row: 6, col: 0), to: Position(row: 4, col: 0))
let afterA4 = ChessBoard(copyFrom: startPos); afterA4.executeMove(a4)
check("1.a4 hoechstens 10 Punkte", openRater.rate(move: a4, boardBefore: startPos, boardAfter: afterA4, color: .white).value <= 10)

// ── Ergebnis ──
print("\n═══════════════════════════════")
print("ERGEBNIS: \(passed) Tests bestanden, \(failed) fehlgeschlagen")
if failed > 0 {
    print("❌ SMOKE-TESTS FEHLGESCHLAGEN")
    exit(1)
}
print("✅ ALLE SMOKE-TESTS BESTANDEN")
exit(0)
