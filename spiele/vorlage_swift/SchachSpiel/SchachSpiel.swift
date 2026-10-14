import Cocoa
import SceneKit

// MARK: - Chess Models

enum ChessPieceType: Int {
    case pawn = 1
    case knight = 2
    case bishop = 3
    case rook = 4
    case queen = 5
    case king = 6

    var value: Int {
        switch self {
        case .pawn: return 100
        case .knight: return 320
        case .bishop: return 330
        case .rook: return 500
        case .queen: return 900
        case .king: return 20000
        }
    }

    var symbol: String {
        switch self {
        case .pawn: return "B"
        case .knight: return "S"
        case .bishop: return "L"
        case .rook: return "T"
        case .queen: return "D"
        case .king: return "K"
        }
    }

    var name: String {
        switch self {
        case .pawn: return "Bauer"
        case .knight: return "Springer"
        case .bishop: return "Laeufer"
        case .rook: return "Turm"
        case .queen: return "Dame"
        case .king: return "Koenig"
        }
    }
}

enum PlayerColor: Int {
    case white = 0
    case black = 1

    var opposite: PlayerColor { self == .white ? .black : .white }
    var displayName: String { self == .white ? "Weiss" : "Schwarz" }
}

struct ChessPiece {
    let color: PlayerColor
    let type: ChessPieceType
    var hasMoved: Bool = false
}

struct Position: Equatable, Hashable {
    let row: Int
    let col: Int
}

struct ChessMove: Equatable {
    let from: Position
    let to: Position
    var capturedPiece: ChessPieceType?
    var promotion: ChessPieceType?
    var isCastling: Bool = false
    var isEnPassant: Bool = false

    static func == (lhs: ChessMove, rhs: ChessMove) -> Bool {
        lhs.from == rhs.from && lhs.to == rhs.to && lhs.promotion == rhs.promotion
    }
}

enum GameMode {
    case playerVsComputer
    case playerVsPlayer
    case tutorial
    case academy      // Schach-Akademie: 10-Stufen-Lernmodus mit Aufgaben
}

enum GameResult {
    case ongoing
    case checkmate(PlayerColor) // winner
    case stalemate
    case draw
}

// MARK: - Chess Board Logic

class ChessBoard {
    static let size = 8
    var grid: [[ChessPiece?]]
    var enPassantTarget: Position? = nil
    var halfMoveClock: Int = 0
    var fullMoveNumber: Int = 1
    var moveHistory: [String] = []

    init() {
        grid = Array(repeating: Array(repeating: nil as ChessPiece?, count: ChessBoard.size), count: ChessBoard.size)
        setupInitialPosition()
    }

    init(copyFrom other: ChessBoard) {
        grid = other.grid
        enPassantTarget = other.enPassantTarget
        halfMoveClock = other.halfMoveClock
        fullMoveNumber = other.fullMoveNumber
        moveHistory = other.moveHistory
    }

    func setupInitialPosition() {
        for r in 0..<ChessBoard.size {
            for c in 0..<ChessBoard.size { grid[r][c] = nil }
        }
        // Black pieces (row 0 = top)
        let backRow: [ChessPieceType] = [.rook, .knight, .bishop, .queen, .king, .bishop, .knight, .rook]
        for c in 0..<8 {
            grid[0][c] = ChessPiece(color: .black, type: backRow[c])
            grid[1][c] = ChessPiece(color: .black, type: .pawn)
            grid[6][c] = ChessPiece(color: .white, type: .pawn)
            grid[7][c] = ChessPiece(color: .white, type: backRow[c])
        }
    }

    func piece(at p: Position) -> ChessPiece? {
        guard p.row >= 0 && p.row < ChessBoard.size && p.col >= 0 && p.col < ChessBoard.size else { return nil }
        return grid[p.row][p.col]
    }

    func setPiece(_ piece: ChessPiece?, at p: Position) {
        guard p.row >= 0 && p.row < ChessBoard.size && p.col >= 0 && p.col < ChessBoard.size else { return }
        grid[p.row][p.col] = piece
    }

    func findKing(_ color: PlayerColor) -> Position? {
        for r in 0..<ChessBoard.size {
            for c in 0..<ChessBoard.size {
                if let p = grid[r][c], p.color == color && p.type == .king {
                    return Position(row: r, col: c)
                }
            }
        }
        return nil
    }

    // Check if a square is attacked by the given color
    func isSquareAttacked(_ pos: Position, by color: PlayerColor) -> Bool {
        // Pawn attacks
        let pawnDir = color == .white ? 1 : -1
        for dc in [-1, 1] {
            let pr = pos.row + pawnDir
            let pc = pos.col + dc
            if pr >= 0 && pr < 8 && pc >= 0 && pc < 8 {
                if let p = grid[pr][pc], p.color == color && p.type == .pawn { return true }
            }
        }
        // Knight attacks
        let knightMoves = [(-2,-1),(-2,1),(-1,-2),(-1,2),(1,-2),(1,2),(2,-1),(2,1)]
        for (dr, dc) in knightMoves {
            let nr = pos.row + dr; let nc = pos.col + dc
            if nr >= 0 && nr < 8 && nc >= 0 && nc < 8 {
                if let p = grid[nr][nc], p.color == color && p.type == .knight { return true }
            }
        }
        // King attacks
        for dr in -1...1 { for dc in -1...1 {
            if dr == 0 && dc == 0 { continue }
            let nr = pos.row + dr; let nc = pos.col + dc
            if nr >= 0 && nr < 8 && nc >= 0 && nc < 8 {
                if let p = grid[nr][nc], p.color == color && p.type == .king { return true }
            }
        }}
        // Rook/Queen (straight lines)
        for (dr, dc) in [(0,1),(0,-1),(1,0),(-1,0)] {
            var r = pos.row + dr; var c = pos.col + dc
            while r >= 0 && r < 8 && c >= 0 && c < 8 {
                if let p = grid[r][c] {
                    if p.color == color && (p.type == .rook || p.type == .queen) { return true }
                    break
                }
                r += dr; c += dc
            }
        }
        // Bishop/Queen (diagonals)
        for (dr, dc) in [(1,1),(1,-1),(-1,1),(-1,-1)] {
            var r = pos.row + dr; var c = pos.col + dc
            while r >= 0 && r < 8 && c >= 0 && c < 8 {
                if let p = grid[r][c] {
                    if p.color == color && (p.type == .bishop || p.type == .queen) { return true }
                    break
                }
                r += dr; c += dc
            }
        }
        return false
    }

    func isInCheck(_ color: PlayerColor) -> Bool {
        guard let kingPos = findKing(color) else { return false }
        return isSquareAttacked(kingPos, by: color.opposite)
    }

    // Generate all pseudo-legal moves (before filtering for check)
    func pseudoLegalMoves(for color: PlayerColor) -> [ChessMove] {
        var moves: [ChessMove] = []
        for r in 0..<8 { for c in 0..<8 {
            if let p = grid[r][c], p.color == color {
                let from = Position(row: r, col: c)
                switch p.type {
                case .pawn: moves.append(contentsOf: pawnMoves(from: from, color: color))
                case .knight: moves.append(contentsOf: knightMoves(from: from, color: color))
                case .bishop: moves.append(contentsOf: slidingMoves(from: from, color: color, dirs: [(1,1),(1,-1),(-1,1),(-1,-1)]))
                case .rook: moves.append(contentsOf: slidingMoves(from: from, color: color, dirs: [(0,1),(0,-1),(1,0),(-1,0)]))
                case .queen: moves.append(contentsOf: slidingMoves(from: from, color: color, dirs: [(0,1),(0,-1),(1,0),(-1,0),(1,1),(1,-1),(-1,1),(-1,-1)]))
                case .king: moves.append(contentsOf: kingMoves(from: from, color: color))
                }
            }
        }}
        return moves
    }

    private func pawnMoves(from: Position, color: PlayerColor) -> [ChessMove] {
        var moves: [ChessMove] = []
        let dir = color == .white ? -1 : 1
        let startRow = color == .white ? 6 : 1
        let promoRow = color == .white ? 0 : 7

        // Forward one
        let f1 = Position(row: from.row + dir, col: from.col)
        if f1.row >= 0 && f1.row < 8 && grid[f1.row][f1.col] == nil {
            if f1.row == promoRow {
                for pt in [ChessPieceType.queen, .rook, .bishop, .knight] {
                    moves.append(ChessMove(from: from, to: f1, promotion: pt))
                }
            } else {
                moves.append(ChessMove(from: from, to: f1))
            }
            // Forward two from start
            if from.row == startRow {
                let f2 = Position(row: from.row + 2 * dir, col: from.col)
                if grid[f2.row][f2.col] == nil {
                    moves.append(ChessMove(from: from, to: f2))
                }
            }
        }
        // Captures
        for dc in [-1, 1] {
            let cap = Position(row: from.row + dir, col: from.col + dc)
            guard cap.row >= 0 && cap.row < 8 && cap.col >= 0 && cap.col < 8 else { continue }
            if let target = grid[cap.row][cap.col], target.color != color {
                if cap.row == promoRow {
                    for pt in [ChessPieceType.queen, .rook, .bishop, .knight] {
                        moves.append(ChessMove(from: from, to: cap, capturedPiece: target.type, promotion: pt))
                    }
                } else {
                    moves.append(ChessMove(from: from, to: cap, capturedPiece: target.type))
                }
            }
            // En passant
            if let ep = enPassantTarget, ep == cap {
                moves.append(ChessMove(from: from, to: cap, capturedPiece: .pawn, isEnPassant: true))
            }
        }
        return moves
    }

    private func knightMoves(from: Position, color: PlayerColor) -> [ChessMove] {
        var moves: [ChessMove] = []
        let offsets = [(-2,-1),(-2,1),(-1,-2),(-1,2),(1,-2),(1,2),(2,-1),(2,1)]
        for (dr, dc) in offsets {
            let to = Position(row: from.row + dr, col: from.col + dc)
            guard to.row >= 0 && to.row < 8 && to.col >= 0 && to.col < 8 else { continue }
            if let target = grid[to.row][to.col] {
                if target.color != color {
                    moves.append(ChessMove(from: from, to: to, capturedPiece: target.type))
                }
            } else {
                moves.append(ChessMove(from: from, to: to))
            }
        }
        return moves
    }

    private func slidingMoves(from: Position, color: PlayerColor, dirs: [(Int,Int)]) -> [ChessMove] {
        var moves: [ChessMove] = []
        for (dr, dc) in dirs {
            var r = from.row + dr; var c = from.col + dc
            while r >= 0 && r < 8 && c >= 0 && c < 8 {
                let to = Position(row: r, col: c)
                if let target = grid[r][c] {
                    if target.color != color {
                        moves.append(ChessMove(from: from, to: to, capturedPiece: target.type))
                    }
                    break
                }
                moves.append(ChessMove(from: from, to: to))
                r += dr; c += dc
            }
        }
        return moves
    }

    private func kingMoves(from: Position, color: PlayerColor) -> [ChessMove] {
        var moves: [ChessMove] = []
        for dr in -1...1 { for dc in -1...1 {
            if dr == 0 && dc == 0 { continue }
            let to = Position(row: from.row + dr, col: from.col + dc)
            guard to.row >= 0 && to.row < 8 && to.col >= 0 && to.col < 8 else { continue }
            if let target = grid[to.row][to.col] {
                if target.color != color {
                    moves.append(ChessMove(from: from, to: to, capturedPiece: target.type))
                }
            } else {
                moves.append(ChessMove(from: from, to: to))
            }
        }}
        // Castling
        // FIX #7: Rochade nur, wenn der Koenig wirklich auf seinem Startfeld (e1/e8) steht.
        // Vorher wurde bei FEN-Stellungen (hasMoved=false) fuer JEDE Koenigsposition
        // eine "Teleport-Rochade" generiert - von den Smoke-Tests entdeckt!
        let homeRow = color == .white ? 7 : 0
        if let king = grid[from.row][from.col], !king.hasMoved && !isInCheck(color),
           from.row == homeRow && from.col == 4 {
            let row = homeRow
            // Kingside
            if let rook = grid[row][7], rook.type == .rook && !rook.hasMoved {
                if grid[row][5] == nil && grid[row][6] == nil {
                    if !isSquareAttacked(Position(row: row, col: 5), by: color.opposite) &&
                       !isSquareAttacked(Position(row: row, col: 6), by: color.opposite) {
                        moves.append(ChessMove(from: from, to: Position(row: row, col: 6), isCastling: true))
                    }
                }
            }
            // Queenside
            if let rook = grid[row][0], rook.type == .rook && !rook.hasMoved {
                if grid[row][1] == nil && grid[row][2] == nil && grid[row][3] == nil {
                    if !isSquareAttacked(Position(row: row, col: 3), by: color.opposite) &&
                       !isSquareAttacked(Position(row: row, col: 2), by: color.opposite) {
                        moves.append(ChessMove(from: from, to: Position(row: row, col: 2), isCastling: true))
                    }
                }
            }
        }
        return moves
    }

    // Generate all legal moves (filtering out moves that leave king in check)
    func allLegalMoves(for color: PlayerColor) -> [ChessMove] {
        let pseudo = pseudoLegalMoves(for: color)
        var legal: [ChessMove] = []
        for move in pseudo {
            let tmp = ChessBoard(copyFrom: self)
            tmp.applyMoveUnchecked(move)
            if !tmp.isInCheck(color) {
                legal.append(move)
            }
        }
        return legal
    }

    func hasLegalMoves(for color: PlayerColor) -> Bool {
        let pseudo = pseudoLegalMoves(for: color)
        for move in pseudo {
            let tmp = ChessBoard(copyFrom: self)
            tmp.applyMoveUnchecked(move)
            if !tmp.isInCheck(color) { return true }
        }
        return false
    }

    // Apply move without legality check (for internal use)
    func applyMoveUnchecked(_ move: ChessMove) {
        guard var pc = grid[move.from.row][move.from.col] else { return }

        // En passant capture
        if move.isEnPassant {
            let capRow = move.from.row
            grid[capRow][move.to.col] = nil
        }

        // Castling - move rook
        if move.isCastling {
            let row = move.from.row
            if move.to.col == 6 { // Kingside
                var rook = grid[row][7]!
                rook.hasMoved = true
                grid[row][5] = rook
                grid[row][7] = nil
            } else { // Queenside
                var rook = grid[row][0]!
                rook.hasMoved = true
                grid[row][3] = rook
                grid[row][0] = nil
            }
        }

        // Update half-move clock
        if pc.type == .pawn || move.capturedPiece != nil {
            halfMoveClock = 0
        } else {
            halfMoveClock += 1
        }

        // Set en passant target
        if pc.type == .pawn && abs(move.to.row - move.from.row) == 2 {
            enPassantTarget = Position(row: (move.from.row + move.to.row) / 2, col: move.from.col)
        } else {
            enPassantTarget = nil
        }

        // Move piece
        grid[move.from.row][move.from.col] = nil
        grid[move.to.row][move.to.col] = nil // clear captured piece

        // Promotion
        if let promoType = move.promotion {
            pc = ChessPiece(color: pc.color, type: promoType, hasMoved: true)
        } else {
            pc.hasMoved = true
        }
        grid[move.to.row][move.to.col] = pc

        if pc.color == .black { fullMoveNumber += 1 }
    }

    func executeMove(_ move: ChessMove) {
        applyMoveUnchecked(move)
    }

    func checkGameResult(for nextPlayer: PlayerColor) -> GameResult {
        let hasMove = hasLegalMoves(for: nextPlayer)
        if !hasMove {
            if isInCheck(nextPlayer) {
                return .checkmate(nextPlayer.opposite)
            } else {
                return .stalemate
            }
        }
        // 50-move rule
        if halfMoveClock >= 100 { return .draw }
        // Insufficient material
        if isInsufficientMaterial() { return .draw }
        return .ongoing
    }

    func isInsufficientMaterial() -> Bool {
        var whitePieces: [ChessPieceType] = []
        var blackPieces: [ChessPieceType] = []
        for r in 0..<8 { for c in 0..<8 {
            if let p = grid[r][c] {
                if p.color == .white { whitePieces.append(p.type) }
                else { blackPieces.append(p.type) }
            }
        }}
        // King vs King
        if whitePieces.count == 1 && blackPieces.count == 1 { return true }
        // King+Bishop vs King or King+Knight vs King
        if whitePieces.count == 1 && blackPieces.count == 2 {
            let other = blackPieces.first(where: { $0 != .king })
            if other == .bishop || other == .knight { return true }
        }
        if blackPieces.count == 1 && whitePieces.count == 2 {
            let other = whitePieces.first(where: { $0 != .king })
            if other == .bishop || other == .knight { return true }
        }
        return false
    }

    func countMaterial(for color: PlayerColor) -> Int {
        var total = 0
        for r in 0..<8 { for c in 0..<8 {
            if let p = grid[r][c], p.color == color, p.type != .king {
                total += p.type.value
            }
        }}
        return total
    }

    // FIX #2: Include castling rights in hash for correct 3-fold repetition detection
    func boardHash() -> String {
        var h = ""
        for r in 0..<8 { for c in 0..<8 {
            if let p = grid[r][c] {
                let ch: String
                switch p.type {
                case .pawn: ch = "p"
                case .knight: ch = "n"
                case .bishop: ch = "b"
                case .rook: ch = "r"
                case .queen: ch = "q"
                case .king: ch = "k"
                }
                h += p.color == .white ? ch.uppercased() : ch
            } else {
                h += "."
            }
        }}
        // Castling rights
        if let wk = grid[7][4], wk.type == .king && !wk.hasMoved {
            if let wr1 = grid[7][7], wr1.type == .rook && !wr1.hasMoved { h += "K" }
            if let wr2 = grid[7][0], wr2.type == .rook && !wr2.hasMoved { h += "Q" }
        }
        if let bk = grid[0][4], bk.type == .king && !bk.hasMoved {
            if let br1 = grid[0][7], br1.type == .rook && !br1.hasMoved { h += "k" }
            if let br2 = grid[0][0], br2.type == .rook && !br2.hasMoved { h += "q" }
        }
        if let ep = enPassantTarget { h += "e\(ep.col)" }
        return h
    }
}

// MARK: - FEN-Unterstuetzung (fuer Akademie-Aufgaben)

extension ChessBoard {
    /// Baut ein Brett aus einer vereinfachten FEN-Stellung auf.
    /// Format: 8 Reihen mit '/' getrennt (Reihe 8 zuerst), optional " w"/" b" und En-passant-Feld (z.B. " w d6").
    /// Figuren: KQRBNP (weiss), kqrbnp (schwarz), Ziffern = leere Felder.
    convenience init(fen: String) {
        self.init()
        for r in 0..<8 { for c in 0..<8 { grid[r][c] = nil } }
        let parts = fen.split(separator: " ").map(String.init)
        let rows = parts[0].split(separator: "/").map(String.init)
        for (r, rowStr) in rows.enumerated() {
            guard r < 8 else { break }
            var c = 0
            for ch in rowStr {
                if let d = ch.wholeNumberValue, d >= 1 && d <= 8 {
                    c += d
                } else if c < 8 {
                    let color: PlayerColor = ch.isUppercase ? .white : .black
                    let type: ChessPieceType?
                    switch ch.lowercased() {
                    case "p": type = .pawn
                    case "n": type = .knight
                    case "b": type = .bishop
                    case "r": type = .rook
                    case "q": type = .queen
                    case "k": type = .king
                    default: type = nil
                    }
                    if let t = type {
                        // hasMoved bleibt false → Rochade in Aufgaben moeglich, wenn Figuren auf Grundstellung stehen
                        grid[r][c] = ChessPiece(color: color, type: t)
                        c += 1
                    }
                }
            }
        }
        // Optionales En-passant-Zielfeld (z.B. "d6")
        for p in parts.dropFirst() where p.count == 2 {
            let chars = Array(p)
            if let file = chars[0].asciiValue, file >= 97 && file <= 104,
               let rank = chars[1].wholeNumberValue, rank >= 1 && rank <= 8 {
                enPassantTarget = Position(row: 8 - rank, col: Int(file - 97))
            }
        }
    }
}

/// Wandelt einen Zug in UCI-Notation um, inkl. Umwandlungsbuchstabe (e7e8q)
func moveToUci(_ m: ChessMove) -> String {
    var s = posToAlgebraic(m.from) + posToAlgebraic(m.to)
    if let promo = m.promotion {
        switch promo {
        case .queen: s += "q"
        case .rook: s += "r"
        case .bishop: s += "b"
        case .knight: s += "n"
        default: break
        }
    }
    return s
}

// MARK: - Spielerprofile (Fortschritt wird pro Name gespeichert)

struct LessonProgress: Codable {
    var completed: Bool = false
    var attempts: Int = 0
    var stars: Int = 0          // 3 = beim 1. Versuch, 2 = 2.-3. Versuch, 1 = spaeter
}

struct PlayerProfile: Codable {
    var name: String
    var createdAt: Date = Date()
    var lessonProgress: [String: LessonProgress] = [:]
    var lastLevel: Int = 1
    var gamesPlayed: Int = 0
    var totalStars: Int { lessonProgress.values.reduce(0) { $0 + $1.stars } }
}

final class PlayerProfileStore {
    static let shared = PlayerProfileStore()
    private(set) var profiles: [PlayerProfile] = []

    private var fileURL: URL {
        let dir = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first!
            .appendingPathComponent("SchachSpiel", isDirectory: true)
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        return dir.appendingPathComponent("spielerprofile.json")
    }

    init() { load() }

    func load() {
        guard let data = try? Data(contentsOf: fileURL),
              let list = try? JSONDecoder().decode([PlayerProfile].self, from: data) else { return }
        profiles = list
    }

    func persist() {
        if let data = try? JSONEncoder().encode(profiles) {
            try? data.write(to: fileURL, options: .atomic)
        }
    }

    func profile(named name: String) -> PlayerProfile? {
        profiles.first { $0.name.lowercased() == name.lowercased() }
    }

    func createOrGet(name: String) -> PlayerProfile {
        let clean = name.trimmingCharacters(in: .whitespacesAndNewlines)
        if let existing = profile(named: clean) { return existing }
        let p = PlayerProfile(name: clean.isEmpty ? "Spieler" : clean)
        profiles.append(p)
        persist()
        return p
    }

    func update(_ profile: PlayerProfile) {
        if let idx = profiles.firstIndex(where: { $0.name.lowercased() == profile.name.lowercased() }) {
            profiles[idx] = profile
        } else {
            profiles.append(profile)
        }
        persist()
    }

    func removeProfile(named name: String) {
        profiles.removeAll { $0.name.lowercased() == name.lowercased() }
        persist()
    }
}

// MARK: - Schach-Akademie: 10 Stufen mit interaktiven Aufgaben
// Didaktik nach Vorbild der Stappenmethode (Brunia/van Wijgerden) und ChessKid:
// vom Kennenlernen der Figuren (Kids) bis zur Meisterpruefung.

struct ChessLesson {
    let id: String              // z.B. "L3-2"
    let level: Int              // 1...10
    let title: String
    let teach: String           // Erklaerung VOR der Aufgabe (Lernstoff)
    let fen: String             // Ausgangsstellung
    let prompt: String          // Die konkrete Aufgabe
    let solutions: [String]     // akzeptierte Zuege in UCI ("e2e4", "e7e8q"); leer bei freiem Spiel
    let hint: String            // Tipp-Text
    let successText: String
    let failText: String
    var freePlayMoves: Int = 0  // > 0: freies Spiel gegen KI mit Coach (Anzahl eigener Zuege)
    var freePlayAI: Int = 3     // KI-Staerke im freien Spiel
    var winByMate: Bool = false // Erfolg = Matt setzen im freien Spiel
}

final class ChessAcademy {

    static let levelInfo: [(name: String, subtitle: String)] = [
        ("Stufe 1 · Kinderstufe", "Die Figuren kennenlernen – wie zieht was?"),
        ("Stufe 2 · Schlagen & Werte", "Figuren schlagen und ihren Wert kennen"),
        ("Stufe 3 · Schach!", "Schach geben und Schach abwehren"),
        ("Stufe 4 · Matt in 1", "Die wichtigsten Mattbilder"),
        ("Stufe 5 · Spezialregeln", "Rochade, en passant, Umwandlung, Patt"),
        ("Stufe 6 · Taktik I", "Gabel, Fesselung, Spiess"),
        ("Stufe 7 · Taktik II", "Abzugsschach, Doppelangriff, Matt in 2"),
        ("Stufe 8 · Eroeffnung", "Zentrum, Entwicklung, Rochade"),
        ("Stufe 9 · Endspiel & Strategie", "Opposition, Freibauern, Turmtechnik"),
        ("Stufe 10 · Meisterstufe", "Beruehmte Kombinationen & Meisterpruefung")
    ]

    /// Anteil geloester Aufgaben, ab dem die naechste Stufe freigeschaltet wird
    static let unlockQuote = 0.7

    static let lessons: [ChessLesson] = [
        // ═══ Stufe 1: Kinderstufe – Die Figuren ═══
        ChessLesson(id: "L1-1", level: 1, title: "Der Bauer",
            teach: "Der Bauer ist der kleinste Kaempfer. Er zieht immer 1 Feld geradeaus. Nur bei seinem allerersten Zug darf er 2 Felder auf einmal ziehen!",
            fen: "7k/8/8/8/8/8/4P3/7K",
            prompt: "Ziehe den Bauern 2 Felder vor: von e2 nach e4!",
            solutions: ["e2e4"],
            hint: "Klicke den Bauern auf e2 an, dann das Feld e4 (2 Felder weiter oben).",
            successText: "Super! Der Bauern-Doppelschritt geht nur vom Startfeld aus. Danach zieht er immer nur 1 Feld.",
            failText: "Fast! Der Bauer sollte von e2 genau nach e4 ziehen. Versuch es nochmal!"),
        ChessLesson(id: "L1-2", level: 1, title: "Der Turm",
            teach: "Der Turm ist stark wie eine Burg! Er zieht gerade: nach vorn, hinten, links und rechts – so weit er will.",
            fen: "7k/8/8/8/8/8/8/R6K",
            prompt: "Ziehe den Turm von a1 gerade nach oben auf a5!",
            solutions: ["a1a5"],
            hint: "Der Turm steht links unten auf a1. Klicke ihn an und dann das Feld a5.",
            successText: "Klasse! Der Turm ist etwa 5 Punkte wert – nur die Dame ist wertvoller.",
            failText: "Der Turm zieht nur gerade Linien. Ziehe ihn von a1 nach a5."),
        ChessLesson(id: "L1-3", level: 1, title: "Der Laeufer",
            teach: "Der Laeufer zieht schraeg (diagonal) – so weit er will. Er bleibt sein Leben lang auf seiner Feldfarbe!",
            fen: "7k/8/8/8/8/8/8/2B4K",
            prompt: "Ziehe den Laeufer diagonal von c1 nach g5!",
            solutions: ["c1g5"],
            hint: "Diagonal heisst schraeg: c1 → d2 → e3 → f4 → g5.",
            successText: "Prima! Merke: Zwei Laeufer zusammen sind ein starkes Team, weil sie beide Feldfarben abdecken.",
            failText: "Der Laeufer zieht nur schraeg. Von c1 gibt es einen schraegen Weg nach g5."),
        ChessLesson(id: "L1-4", level: 1, title: "Der Springer",
            teach: "Der Springer ist der einzige, der springen kann! Er zieht in L-Form: 2 Felder gerade + 1 Feld zur Seite.",
            fen: "7k/8/8/8/8/8/8/6NK",
            prompt: "Ziehe den Springer in L-Form von g1 nach f3!",
            solutions: ["g1f3"],
            hint: "Von g1: 2 Felder hoch, 1 nach links = f3.",
            successText: "Toll! Der Springer darf ueber andere Figuren springen – das kann sonst niemand!",
            failText: "Denk an das L: 2 Felder in eine Richtung, dann 1 zur Seite. Von g1 nach f3."),
        ChessLesson(id: "L1-5", level: 1, title: "Die Dame",
            teach: "Die Dame ist die staerkste Figur! Sie kann gerade UND schraeg ziehen – wie Turm und Laeufer zusammen. Sie ist 9 Punkte wert.",
            fen: "7k/8/8/8/8/8/8/3Q3K",
            prompt: "Ziehe die Dame von d1 gerade nach oben auf d5!",
            solutions: ["d1d5"],
            hint: "Die Dame steht auf d1. Klicke sie an und dann d5.",
            successText: "Wunderbar! Aber Vorsicht: Weil die Dame so wertvoll ist, darf man sie nicht leichtsinnig verlieren.",
            failText: "Ziehe die Dame von d1 nach d5 – das ist eine gerade Linie nach oben."),
        ChessLesson(id: "L1-6", level: 1, title: "Der Koenig",
            teach: "Der Koenig ist die wichtigste Figur – verliert er, ist das Spiel vorbei! Er zieht nur 1 Feld in jede Richtung.",
            fen: "7k/8/8/8/8/8/8/4K3",
            prompt: "Ziehe den Koenig 1 Feld vor: von e1 nach e2!",
            solutions: ["e1e2"],
            hint: "Der Koenig macht kleine Schritte: nur 1 Feld. Von e1 nach e2.",
            successText: "Sehr gut! Der Koenig muss immer beschuetzt werden – er darf niemals geschlagen werden koennen.",
            failText: "Der Koenig zieht nur 1 Feld weit. Ziehe ihn von e1 nach e2."),

        // ═══ Stufe 2: Schlagen & Figurenwerte ═══
        ChessLesson(id: "L2-1", level: 2, title: "Schlagen macht stark",
            teach: "Figurenwerte: Bauer 1, Springer 3, Laeufer 3, Turm 5, Dame 9. Wenn du eine gegnerische Figur schlaegst, gehoert ihr Feld dir!",
            fen: "7k/8/8/q7/8/8/8/R6K",
            prompt: "Die schwarze Dame steht ungeschuetzt! Schlage sie mit deinem Turm!",
            solutions: ["a1a5"],
            hint: "Dein Turm auf a1 und die Dame auf a5 stehen auf derselben Linie...",
            successText: "9 Punkte gewonnen! Immer pruefen: Steht eine gegnerische Figur ungeschuetzt im Weg?",
            failText: "Der Turm kann die Dame auf a5 direkt schlagen – gleiche Linie!"),
        ChessLesson(id: "L2-2", level: 2, title: "Den besten Fang waehlen",
            teach: "Wenn du mehrere Figuren schlagen kannst, nimm die wertvollste! Ein Turm (5) ist mehr wert als ein Bauer (1).",
            fen: "7k/8/3r1p2/8/4N3/8/8/7K",
            prompt: "Dein Springer kann zwei Figuren schlagen. Nimm die wertvollere!",
            solutions: ["e4d6"],
            hint: "Turm = 5 Punkte, Bauer = 1 Punkt. Der Turm steht auf d6.",
            successText: "Richtig! Turm (5 Punkte) schlaegt Bauer (1 Punkt). Immer den Wert vergleichen!",
            failText: "Der Bauer bringt nur 1 Punkt. Der Turm auf d6 bringt 5!"),
        ChessLesson(id: "L2-3", level: 2, title: "Der Bauer schlaegt schraeg",
            teach: "Achtung, Besonderheit: Der Bauer ZIEHT gerade, aber er SCHLAEGT schraeg – 1 Feld diagonal nach vorn!",
            fen: "7k/8/8/3p1r2/4P3/8/8/7K",
            prompt: "Dein Bauer kann schraeg links oder schraeg rechts schlagen. Nimm die wertvollere Figur!",
            solutions: ["e4f5"],
            hint: "Links steht ein Bauer (1), rechts ein Turm (5). Schlage schraeg nach rechts!",
            successText: "Perfekt! Bauer schlaegt diagonal – und du hast den wertvollen Turm erwischt!",
            failText: "Der Bauer schlaegt schraeg. Der Turm auf f5 ist wertvoller als der Bauer auf d5."),
        ChessLesson(id: "L2-4", level: 2, title: "Gedeckt oder ungedeckt?",
            teach: "Bevor du schlaegst, schau genau hin: Wird die Figur verteidigt (gedeckt)? Wenn ja, schlaegt der Gegner zurueck!",
            fen: "k7/8/4p3/3n3b/8/8/8/3Q3K",
            prompt: "Springer oder Laeufer? Eine der beiden Figuren ist gedeckt. Schlage die UNGEDECKTE!",
            solutions: ["d1h5"],
            hint: "Der Springer d5 wird vom Bauern e6 gedeckt. Der Laeufer h5 ist allein...",
            successText: "Exzellent! Der Springer war vom Bauern gedeckt – die Dame haette man zurueckgeschlagen. Der Laeufer war gratis!",
            failText: "Vorsicht: Der Bauer auf e6 deckt den Springer! Nimm lieber den ungedeckten Laeufer auf h5."),

        // ═══ Stufe 3: Schach! ═══
        ChessLesson(id: "L3-1", level: 3, title: "Schach geben",
            teach: "Schach heisst: Der Koenig wird angegriffen! Der Gegner MUSS sofort reagieren. Sag beim Spielen ruhig laut 'Schach!'",
            fen: "4k3/8/8/8/8/8/8/R6K",
            prompt: "Gib dem schwarzen Koenig Schach mit deinem Turm!",
            solutions: ["a1a8", "a1e1"],
            hint: "Der Turm muss auf eine Linie oder Reihe mit dem Koenig (e8) ziehen.",
            successText: "Schach! Der Koenig ist angegriffen und muss reagieren. So setzt man den Gegner unter Druck!",
            failText: "Der Turm gibt Schach, wenn er auf derselben Linie wie der Koenig steht: Reihe 8 oder e-Linie."),
        ChessLesson(id: "L3-2", level: 3, title: "Schach abwehren: Wegziehen",
            teach: "Gegen Schach gibt es 3 Rezepte: 1) Koenig wegziehen, 2) eine Figur dazwischenstellen, 3) den Angreifer schlagen.",
            fen: "4r2k/8/8/8/8/8/8/4K3",
            prompt: "Dein Koenig steht im Schach! Ziehe ihn aus der Gefahrenzone!",
            solutions: ["e1d1", "e1d2", "e1f1", "e1f2"],
            hint: "Der Turm greift die ganze e-Linie an. Der Koenig muss die e-Linie verlassen!",
            successText: "Gerettet! Rezept 1: Wegziehen. Der Koenig darf nie auf einem angegriffenen Feld stehen bleiben.",
            failText: "Der Koenig muss weg von der e-Linie – der schwarze Turm greift sie komplett an!"),
        ChessLesson(id: "L3-3", level: 3, title: "Schach abwehren: Blocken",
            teach: "Rezept 2 gegen Schach: Stelle eine eigene Figur dazwischen! Sie faengt den Angriff ab wie ein Schild.",
            fen: "4r2k/8/8/8/8/8/8/2B1K3",
            prompt: "Dein Koenig steht im Schach. Blocke das Schach mit deinem Laeufer!",
            solutions: ["c1e3"],
            hint: "Der Laeufer kann diagonal auf die e-Linie springen: c1 → d2 → e3.",
            successText: "Stark! Der Laeufer ist jetzt ein Schutzschild. Blocken geht nur bei Angriffen aus der Ferne.",
            failText: "Der Laeufer muss zwischen Turm und Koenig: Das Feld e3 blockt die e-Linie."),
        ChessLesson(id: "L3-4", level: 3, title: "Schach abwehren: Schlagen",
            teach: "Rezept 3 gegen Schach: Schlage den Angreifer einfach! Das ist oft die beste Loesung.",
            fen: "7k/8/8/8/8/8/R3q3/4K3",
            prompt: "Die schwarze Dame gibt Schach. Schlage sie!",
            solutions: ["a2e2", "e1e2"],
            hint: "Dein Turm auf a2 (oder dein Koenig!) kann die Dame auf e2 schlagen.",
            successText: "Angreifer beseitigt! Und du hast sogar 9 Punkte gewonnen. Doppelter Erfolg!",
            failText: "Die Dame auf e2 kann geschlagen werden: mit dem Turm von a2 oder mit dem Koenig."),

        // ═══ Stufe 4: Matt in 1 ═══
        ChessLesson(id: "L4-1", level: 4, title: "Grundreihenmatt",
            teach: "Das Grundreihenmatt: Der Koenig ist hinter seinen eigenen Bauern gefangen. Ein Turm auf der Grundreihe = Matt! (Fischer: 'Schaffe deinem Koenig ein Luftloch!')",
            fen: "6k1/5ppp/8/8/8/8/8/R5K1",
            prompt: "Setze Matt in 1 Zug!",
            solutions: ["a1a8"],
            hint: "Die 8. Reihe ist frei – und der Koenig kann nicht entkommen, seine eigenen Bauern stehen im Weg!",
            successText: "SCHACHMATT! Das Grundreihenmatt ist eine der haeufigsten Mattarten. Denk daran, wenn dein eigener Koenig so steht!",
            failText: "Der Turm muss auf die 8. Reihe: a8! Dort gibt er Schach, und der Koenig hat keinen Fluchtweg."),
        ChessLesson(id: "L4-2", level: 4, title: "Das Damenmatt",
            teach: "Die Dame setzt matt, wenn sie direkt neben dem Koenig steht und selbst geschuetzt ist – z.B. von deinem Koenig!",
            fen: "3k4/Q7/3K4/8/8/8/8/8",
            prompt: "Setze Matt in 1 Zug mit der Dame!",
            solutions: ["a7d7"],
            hint: "Die Dame muss direkt vor den schwarzen Koenig – dein eigener Koenig deckt sie.",
            successText: "SCHACHMATT! Die Dame nimmt dem Koenig alle Felder, dein Koenig beschuetzt die Dame. Perfektes Teamwork!",
            failText: "Ziehe die Dame nach d7: direkt vor den Koenig, gedeckt von deinem Koenig auf d6."),
        ChessLesson(id: "L4-3", level: 4, title: "Das Treppenmatt",
            teach: "Zwei Tuerme setzen matt wie eine Treppe: Einer sperrt eine Reihe, der andere gibt auf der naechsten Reihe Schach!",
            fen: "3k4/R7/8/8/8/8/8/1R5K",
            prompt: "Ein Turm sperrt schon die 7. Reihe. Setze Matt in 1 Zug!",
            solutions: ["b1b8"],
            hint: "Der Turm auf a7 sperrt die 7. Reihe. Der andere Turm muss auf die 8. Reihe!",
            successText: "SCHACHMATT! Das Treppenmatt (auch Rasenmaeher-Matt genannt) – zwei Tuerme sind ein unschlagbares Team!",
            failText: "Der b1-Turm muss nach b8: Schach auf der 8. Reihe, und die 7. Reihe ist schon gesperrt!"),
        ChessLesson(id: "L4-4", level: 4, title: "Das erstickte Matt",
            teach: "Das erstickte Matt: Der Koenig wird von seinen EIGENEN Figuren eingesperrt – und nur ein Springer kommt an ihn heran! (Fischer nannte es das schoenste Matt.)",
            fen: "6rk/6pp/8/6N1/8/8/8/6K1",
            prompt: "Der schwarze Koenig ist von eigenen Figuren umzingelt. Setze Matt mit dem Springer!",
            solutions: ["g5f7"],
            hint: "Der Springer springt in L-Form von g5... welches Feld greift h8 an?",
            successText: "SCHACHMATT! Das erstickte Matt! Der Koenig erstickt an seinen eigenen Figuren – nur der springende Springer kommt durch.",
            failText: "Von g5 nach f7 – von dort greift der Springer h8 an, und der Koenig kann nirgendwohin!"),
        ChessLesson(id: "L4-5", level: 4, title: "Das Schaefermatt (Vorsicht!)",
            teach: "Das Schaefermatt gewinnt in 4 Zuegen gegen Unaufmerksame: Dame und Laeufer greifen gemeinsam f7 an – den schwaechsten Punkt! Lerne es, um es zu VERMEIDEN.",
            fen: "r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR",
            prompt: "Weiss am Zug: Vollende das Schaefermatt!",
            solutions: ["h5f7"],
            hint: "Dame und Laeufer zielen beide auf dasselbe Feld neben dem Koenig...",
            successText: "SCHACHMATT auf f7! Merke zur Verteidigung: Bei fruehen Damenausfluegen immer f7/f2 im Auge behalten!",
            failText: "Die Dame schlaegt auf f7 – gedeckt vom Laeufer c4. Das ist das beruehmte Schaefermatt."),

        // ═══ Stufe 5: Spezialregeln ═══
        ChessLesson(id: "L5-1", level: 5, title: "Die kurze Rochade",
            teach: "Die Rochade: Der einzige Zug, bei dem 2 Figuren gleichzeitig ziehen! Koenig 2 Felder zum Turm, Turm springt auf die andere Seite. Bedingungen: Beide noch nie gezogen, nichts dazwischen, kein Schach auf dem Weg.",
            fen: "4k3/8/8/8/8/8/8/4K2R",
            prompt: "Fuehre die kurze Rochade aus: Klicke den Koenig und dann g1!",
            solutions: ["e1g1"],
            hint: "Klicke den Koenig auf e1 an, dann das Feld g1 (2 Felder Richtung Turm).",
            successText: "Rochade! Dein Koenig ist in Sicherheit und der Turm ist aktiviert. Rochiere in echten Partien FRUEH!",
            failText: "Fuer die kurze Rochade zieht der Koenig von e1 genau 2 Felder nach rechts auf g1."),
        ChessLesson(id: "L5-2", level: 5, title: "Die lange Rochade",
            teach: "Es gibt auch die LANGE Rochade zur anderen Seite: Koenig nach c1, Turm von a1 nach d1. Sie ist mutiger – der Koenig steht etwas offener.",
            fen: "4k3/8/8/8/8/8/8/R3K3",
            prompt: "Fuehre die lange Rochade aus: Koenig nach c1!",
            solutions: ["e1c1"],
            hint: "Klicke den Koenig auf e1 an, dann das Feld c1 (2 Felder Richtung a1-Turm).",
            successText: "Lange Rochade! Wird oft fuer Angriffsplaene genutzt: Der Turm steht sofort aktiv auf d1.",
            failText: "Bei der langen Rochade zieht der Koenig von e1 zwei Felder nach LINKS auf c1."),
        ChessLesson(id: "L5-3", level: 5, title: "En passant – im Vorbeigehen",
            teach: "En passant (franzoesisch: 'im Vorbeigehen'): Zieht ein gegnerischer Bauer 2 Felder und landet NEBEN deinem Bauern, darfst du ihn schlagen, als waere er nur 1 Feld gezogen – aber nur SOFORT im naechsten Zug!",
            fen: "7k/8/8/3pP3/8/8/8/7K w d6",
            prompt: "Schwarz zog gerade d7-d5. Schlage den Bauern en passant!",
            solutions: ["e5d6"],
            hint: "Dein Bauer e5 schlaegt schraeg nach d6 – und der schwarze Bauer auf d5 verschwindet!",
            successText: "En passant! Der schwarze Bauer wollte vorbeischleichen – aber du hast ihn im Vorbeigehen erwischt!",
            failText: "Schlage schraeg nach d6 (nicht d5!) – genau das ist der Trick beim En-passant-Schlag."),
        ChessLesson(id: "L5-4", level: 5, title: "Die Umwandlung",
            teach: "Erreicht ein Bauer die letzte Reihe, verwandelt er sich! Meistens waehlt man die Dame – aus dem kleinsten Kaempfer wird die staerkste Figur!",
            fen: "7k/4P3/8/8/8/8/8/7K",
            prompt: "Ziehe den Bauern auf die letzte Reihe und verwandle ihn in eine Dame!",
            solutions: ["e7e8q"],
            hint: "Ziehe den Bauern von e7 nach e8 – dann darfst du eine neue Figur waehlen. Nimm die Dame!",
            successText: "Verwandlung! Aus Bauer wird Dame. Deshalb sind Freibauern im Endspiel Gold wert!",
            failText: "Ziehe den Bauern nach e8 und waehle die Dame – die staerkste Wahl!"),
        ChessLesson(id: "L5-5", level: 5, title: "Patt vermeiden – Matt setzen!",
            teach: "PATT ist die Falle am Schluss: Der Gegner hat KEINEN legalen Zug, steht aber NICHT im Schach → nur Remis! Mit grossem Vorteil musst du sauber mattsetzen.",
            fen: "k7/8/1K6/8/8/8/7Q/8",
            prompt: "Vorsicht, Patt-Gefahr! Setze sauber Matt in 1 Zug!",
            solutions: ["h2h8"],
            hint: "Die Dame muss SCHACH geben, waehrend dein Koenig die Fluchtfelder nimmt. Die 8. Reihe...",
            successText: "SCHACHMATT – kein Patt! Merke: Vor jedem Zug im Endspiel pruefen, ob der Gegner noch Zuege hat.",
            failText: "Dame nach h8: Schach auf der 8. Reihe! Dein Koenig auf b6 bewacht a7 und b7 – Matt!"),

        // ═══ Stufe 6: Taktik I ═══
        ChessLesson(id: "L6-1", level: 6, title: "Die Springergabel",
            teach: "Die Gabel: EINE Figur greift ZWEI an! Der Springer ist der Gabel-Meister – sein L-Zug wird oft uebersehen. (Pachman: 'Der Doppelangriff ist das haeufigste Gewinnmotiv.')",
            fen: "r3k3/8/8/3N4/8/8/8/4K3",
            prompt: "Gabele Koenig und Turm mit deinem Springer!",
            solutions: ["d5c7"],
            hint: "Suche das Feld, von dem der Springer GLEICHZEITIG Koenig (e8) und Turm (a8) angreift.",
            successText: "Springergabel auf c7! Schach dem Koenig – und naechsten Zug frisst der Springer den Turm. Koenigsgabel = Traumzug!",
            failText: "Von c7 aus greift der Springer e8 UND a8 gleichzeitig an. Das ist die Gabel!"),
        ChessLesson(id: "L6-2", level: 6, title: "Die Bauerngabel",
            teach: "Auch der kleine Bauer kann gabeln! Ein Bauer, der zwischen zwei Figuren vorrueckt, greift beide gleichzeitig an – und ist selbst fast nichts wert.",
            fen: "7k/8/3n1b2/8/4P3/8/8/7K",
            prompt: "Gabele Springer und Laeufer mit deinem Bauern!",
            solutions: ["e4e5"],
            hint: "Ruecke den Bauern vor – dann greift er schraeg links UND schraeg rechts an.",
            successText: "Bauerngabel! Der Bauer (1 Punkt) greift zwei 3-Punkte-Figuren an. Eine geht sicher verloren!",
            failText: "Ziehe den Bauern nach e5 – von dort greift er d6 und f6 gleichzeitig an."),
        ChessLesson(id: "L6-3", level: 6, title: "Die Fesselung nutzen",
            teach: "Fesselung: Eine Figur kann nicht ziehen, weil dahinter der Koenig steht! Gefesselte Figuren sind hilflos – greife sie nochmal an!",
            fen: "4k3/8/2n5/1B6/3P4/8/8/4K3",
            prompt: "Der Springer c6 ist gefesselt! Greife ihn mit dem Bauern an!",
            solutions: ["d4d5"],
            hint: "Der Springer kann nicht fliehen (Fesselung durch deinen Laeufer!). Welcher Bauernzug greift ihn an?",
            successText: "Stark! Der gefesselte Springer darf nicht ziehen (sonst faellt der Koenig) – naechsten Zug ist er weg!",
            failText: "Ziehe den Bauern nach d5: Er greift den gefesselten Springer an, der nicht weglaufen darf!"),
        ChessLesson(id: "L6-4", level: 6, title: "Der Spiess",
            teach: "Der Spiess ist die umgekehrte Fesselung: Du greifst die WERTVOLLE Figur vorne an – sie muss weg, und du gewinnst die Figur DAHINTER! (Vukovic)",
            fen: "4q3/8/8/4k3/8/8/8/R5K1",
            prompt: "Spiesse Koenig und Dame auf: Gib Schach auf der e-Linie!",
            solutions: ["a1e1"],
            hint: "Turm auf die e-Linie: Der Koenig muss aus dem Schach ziehen – dahinter wartet die Dame!",
            successText: "Spiess! Der Koenig muss weichen, und dein Turm schlaegt naechsten Zug die Dame auf e8!",
            failText: "Ziehe den Turm nach e1: Schach! Koenig und Dame stehen auf derselben Linie aufgespiesst."),

        // ═══ Stufe 7: Taktik II ═══
        ChessLesson(id: "L7-1", level: 7, title: "Das Abzugsschach",
            teach: "Abzugsschach: Eine Figur zieht WEG und oeffnet dahinter einen Angriff auf den Koenig! Die ziehende Figur darf machen, was sie will – der Gegner muss erst das Schach abwehren. Zieht sie MIT eigenem Schach: Doppelschach!",
            fen: "6k1/8/8/3N4/8/1B6/8/6K1",
            prompt: "Ziehe den Springer mit Abzugsschach – am besten mit Doppelschach!",
            solutions: ["d5f6", "d5e7"],
            hint: "Der Laeufer b3 zielt verdeckt auf g8. Zieht der Springer weg UND gibt selbst Schach...",
            successText: "DOPPELSCHACH! Laeufer und Springer geben gleichzeitig Schach – dagegen hilft NUR ein Koenigszug. Die staerkste Waffe im Schach!",
            failText: "Der Springer muss wegziehen und selbst Schach geben: f6 oder e7 – dann wirken Laeufer UND Springer!"),
        ChessLesson(id: "L7-2", level: 7, title: "Doppelangriff mit der Dame",
            teach: "Die Dame ist die Koenigin des Doppelangriffs: Mit einem Zug kann sie in ZWEI Richtungen gleichzeitig drohen!",
            fen: "r5k1/8/8/8/8/8/8/3Q2K1",
            prompt: "Finde den Damenzug, der Schach gibt UND den Turm angreift!",
            solutions: ["d1d5"],
            hint: "Suche ein Feld, von dem die Dame diagonal den Koenig UND diagonal den Turm sieht.",
            successText: "Doppelangriff! Schach auf g8 und Angriff auf a8 – der Turm ist verloren. Die Dame sieht eben alles!",
            failText: "Von d5 aus: Diagonale nach g8 (Schach!) und Diagonale nach a8 (Turm!). Beides gleichzeitig!"),
        ChessLesson(id: "L7-3", level: 7, title: "Matt in 2: Der stille Zug",
            teach: "Nicht immer ist der laute Zug der beste! Ein 'stiller Zug' bereitet das Matt unaufhaltsam vor: Erst die 7. Reihe nehmen, dann Matt auf der 8.",
            fen: "3k4/8/6Q1/8/8/8/8/6KR",
            prompt: "Matt in 2 Zuegen: Finde den stillen Vorbereitungszug der Dame!",
            solutions: ["g6g7"],
            hint: "Die Dame nimmt zuerst die 7. Reihe (ohne Schach!) – dann ist Turm h8 nicht mehr zu verhindern.",
            successText: "Der stille Zug! Die Dame sperrt die 7. Reihe, der Koenig ist auf der 8. gefangen – Th8 setzt naechsten Zug matt!",
            failText: "Ziehe die Dame nach g7: Sie sperrt die ganze 7. Reihe. Danach ist Turm h1-h8 matt!"),
        ChessLesson(id: "L7-4", level: 7, title: "Koenigsgabel unter Druck",
            teach: "Taktik rettet! Deine Figur wird angegriffen? Suche erst nach einem GEGENANGRIFF – vielleicht gibt es eine Gabel mit Schach!",
            fen: "6k1/3q4/8/3N4/8/8/8/6K1",
            prompt: "Die schwarze Dame greift deinen Springer an! Rette ihn mit einer Koenigsgabel!",
            solutions: ["d5f6"],
            hint: "Nicht fliehen – angreifen! Von welchem Feld gabelt der Springer Koenig UND Dame?",
            successText: "Nf6+! Schach – und naechsten Zug schlaegt der Springer die Dame. Aus Verteidigung wird Angriff!",
            failText: "Von f6 aus gibt der Springer Schach auf g8 und greift die Dame auf d7 an. Gabel!"),

        // ═══ Stufe 8: Eroeffnung ═══
        ChessLesson(id: "L8-1", level: 8, title: "Das Zentrum besetzen",
            teach: "Eroeffnungsregel Nr. 1: Besetze das Zentrum! Die Felder e4, d4, e5, d5 sind das Herz des Brettes. Wer sie kontrolliert, hat mehr Raum. (Lasker)",
            fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR",
            prompt: "Mache den klassischen ersten Zug: Setze einen Zentrumsbauern 2 Felder vor!",
            solutions: ["e2e4", "d2d4"],
            hint: "Die Koenigs- oder Damenbauern (e2/d2) gehoeren ins Zentrum: e4 oder d4!",
            successText: "Perfekter Start! 1.e4 ('best by test' – Fischer) oder 1.d4 – beide besetzen das Zentrum und oeffnen Wege fuer die Figuren.",
            failText: "Ziehe den e- oder d-Bauern zwei Felder vor: Das kontrolliert das Zentrum!"),
        ChessLesson(id: "L8-2", level: 8, title: "Figuren entwickeln",
            teach: "Eroeffnungsregel Nr. 2: Entwickle Springer und Laeufer schnell! Springer VOR Laeufern, und moeglichst Richtung Zentrum. Die Dame bleibt erstmal zuhause!",
            fen: "rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR",
            prompt: "Entwickle einen Springer Richtung Zentrum!",
            solutions: ["g1f3", "b1c3"],
            hint: "Springer nach f3 oder c3 – von dort kontrollieren sie Zentrumsfelder.",
            successText: "Entwicklung! Sf3 greift sogar den Bauern e5 an. Jeder Eroeffnungszug soll entwickeln oder drohen!",
            failText: "Entwickle einen Springer: g1-f3 oder b1-c3. (Tarrasch: 'Springer am Rand ist eine Schande!')"),
        ChessLesson(id: "L8-3", level: 8, title: "Der aktive Laeufer",
            teach: "Nach den Springern kommen die Laeufer. Stelle sie AKTIV: auf Diagonalen, die aufs Zentrum oder den gegnerischen Koenig zielen (z.B. das beruehmte Italienisch mit Lc4).",
            fen: "r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R",
            prompt: "Entwickle den Koenigslaeufer aktiv (Italienische oder Spanische Partie)!",
            solutions: ["f1c4", "f1b5"],
            hint: "Lc4 zielt auf f7 (Italienisch), Lb5 bedraengt den Springer c6 (Spanisch). Beides ist gut!",
            successText: "Aktiv entwickelt! Lc4 = Italienische Partie (zielt auf den schwachen Punkt f7). Lb5 = Spanische Partie, die 'Koenigin der Eroeffnungen'.",
            failText: "Der f1-Laeufer gehoert nach c4 (Italienisch) oder b5 (Spanisch) – aktiv Richtung Gegner!"),
        ChessLesson(id: "L8-4", level: 8, title: "Der Koenig in Sicherheit",
            teach: "Eroeffnungsregel Nr. 3: Rochiere frueh! Ein Koenig in der Mitte ist ein Angriffsziel. Nach der Rochade ist er sicher und die Tuerme sind verbunden.",
            fen: "r1bqk2r/pppp1ppp/2n2n2/2b1p3/2B1P3/5N2/PPPP1PPP/RNBQK2R",
            prompt: "Alles ist vorbereitet: Bringe deinen Koenig JETZT in Sicherheit!",
            solutions: ["e1g1"],
            hint: "Kurze Rochade: Koenig von e1 nach g1!",
            successText: "Rochade! Koenig sicher, Turm aktiviert – die Eroeffnung ist fast geschafft. So machen es die Meister in fast jeder Partie!",
            failText: "Rochiere kurz: Klicke den Koenig (e1) und dann g1."),
        ChessLesson(id: "L8-5", level: 8, title: "Praxis: Die ersten 10 Zuege",
            teach: "Jetzt du! Spiele die Eroeffnung gegen den Computer und wende die 3 Regeln an: 1) Zentrum besetzen, 2) Figuren entwickeln, 3) frueh rochieren. Dein Coach bewertet jeden Zug von 1-15!",
            fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR",
            prompt: "Spiele 10 gute Eroeffnungszuege (Durchschnittswert mindestens 8/15)!",
            solutions: [],
            hint: "Zentrumsbauern, Springer, Laeufer, Rochade – in dieser Reihenfolge machst du nichts falsch.",
            successText: "Eroeffnung bestanden! Du beherrschst die goldenen Regeln. Weiter zur Endspielschule!",
            failText: "Durchschnitt unter 8/15. Denk an: Zentrum, Entwicklung, Rochade – und verliere keine Figuren! Versuch es nochmal.",
            freePlayMoves: 10, freePlayAI: 3),

        // ═══ Stufe 9: Endspiel & Strategie ═══
        ChessLesson(id: "L9-1", level: 9, title: "Die Opposition",
            teach: "Bauernendspiele entscheidet die OPPOSITION: Stehen sich die Koenige mit einem Feld Abstand gegenueber, muss der andere weichen – wer NICHT ziehen muss, hat die Opposition! (Capablanca)",
            fen: "8/8/4k3/8/8/4K3/4P3/8",
            prompt: "Nimm die Opposition: Stelle deinen Koenig direkt gegenueber!",
            solutions: ["e3e4"],
            hint: "Ziehe den Koenig nach e4 – dann stehen sich die Koenige mit 1 Feld Abstand gegenueber, und Schwarz muss weichen.",
            successText: "Opposition! Schwarz muss jetzt zur Seite weichen, und dein Koenig marschiert vorwaerts. So gewinnt man Bauernendspiele!",
            failText: "Koenig nach e4: Auge in Auge mit einem Feld Abstand – der Gegner am Zug muss weichen."),
        ChessLesson(id: "L9-2", level: 9, title: "Turm hinter den Freibauern",
            teach: "Tarrasch-Regel: Der Turm gehoert HINTER den Freibauern – den eigenen wie den gegnerischen! Von hinten schiebt er ihn an und wird mit jedem Schritt staerker.",
            fen: "6k1/8/8/P7/8/8/7R/6K1",
            prompt: "Stelle deinen Turm hinter deinen Freibauern!",
            solutions: ["h2a2"],
            hint: "Dein Freibauer steht auf a5 und will nach a8. 'Hinter' ihm heisst: auf der a-Linie unterhalb, also a2!",
            successText: "Perfekt nach Tarrasch! Der Turm schiebt den Bauern von hinten zur Umwandlung – und bleibt dabei maximal beweglich.",
            failText: "Ziehe den Turm nach a2: auf die a-Linie, HINTER den Bauern (aus deiner Sicht unten)."),
        ChessLesson(id: "L9-3", level: 9, title: "Freibauern muessen laufen!",
            teach: "Nimzowitsch: 'Der Freibauer ist ein Verbrecher, der ins Zuchthaus gehoert – oder zur Dame!' Kein gegnerischer Bauer kann ihn mehr aufhalten – also VORWAERTS!",
            fen: "8/8/1P6/8/8/8/8/K6k",
            prompt: "Dein Freibauer ist nicht zu stoppen. Ruecke ihn vor!",
            solutions: ["b6b7"],
            hint: "Einfach vorwaerts! b7 – und naechsten Zug wird er zur Dame.",
            successText: "Lauf, Bauer, lauf! Naechster Halt: b8 = Dame. Im Endspiel zaehlt jedes Tempo beim Wettrennen!",
            failText: "Ziehe den b-Bauern vor nach b7 – niemand kann ihn aufhalten!"),
        ChessLesson(id: "L9-4", level: 9, title: "Den Koenig abschneiden",
            teach: "Turmtechnik: Schneide den gegnerischen Koenig mit dem Turm ab! Eine Turm-Linie ist wie ein Zaun, den der Koenig nie ueberqueren kann.",
            fen: "8/4k3/P7/8/7R/8/8/K7",
            prompt: "Dein a-Bauer will zur Dame. Sperre den schwarzen Koenig mit dem Turm aus!",
            solutions: ["h4d4"],
            hint: "Der schwarze Koenig will nach links zum Bauern. Ein Turm auf der d-Linie sperrt ihm den Weg fuer immer.",
            successText: "Abgeschnitten! Der Koenig kommt nie mehr ueber die d-Linie – dein Bauer spaziert gemuetlich zur Dame.",
            failText: "Turm nach d4: Die d-Linie wird zum unueberwindbaren Zaun zwischen Koenig und Bauer."),
        ChessLesson(id: "L9-5", level: 9, title: "Praxis: Matt mit der Dame",
            teach: "Die wichtigste Endspiel-Technik: Matt mit Koenig + Dame gegen Koenig. Plan: 1) Dame draengt den Koenig an den Rand (immer Springer-Abstand halten!), 2) dein Koenig kommt zu Hilfe, 3) Matt am Rand. VORSICHT: Patt vermeiden!",
            fen: "8/8/8/4k3/8/8/8/3Q1K2",
            prompt: "Setze den schwarzen Koenig matt – du hast 15 Zuege. Achtung: Kein Patt!",
            solutions: [],
            hint: "Draenge den Koenig mit der Dame Schritt fuer Schritt an den Rand (Springer-Abstand!). Dann hilf mit deinem Koenig und setze matt.",
            successText: "MATT! Die Koenigsdisziplin des Endspiels sitzt. Diese Technik gewinnt dir hunderte Partien!",
            failText: "Kein Matt in 15 Zuegen (oder Patt?). Rezept: Dame im Springer-Abstand zum Koenig draengt ihn an den Rand, dein Koenig hilft, dann Matt. Nochmal!",
            freePlayMoves: 15, freePlayAI: 6, winByMate: true),

        // ═══ Stufe 10: Meisterstufe ═══
        ChessLesson(id: "L10-1", level: 10, title: "Philidors Vermaechtnis",
            teach: "Die beruehmteste Kombination der Schachgeschichte: Das Damenopfer, das zum erstickten Matt fuehrt! Der Springer auf h6 deckt g8 – die Dame darf sich opfern.",
            fen: "5r1k/6pp/4Q2N/8/8/8/8/6K1",
            prompt: "Matt in 2: Opfere die Dame!",
            solutions: ["e6g8"],
            hint: "Dg8+!! Der Turm MUSS nehmen (der Koenig darf nicht – der Springer bewacht g8!). Und dann...?",
            successText: "BRILLANT! Dg8+ Txg8, Sf7 MATT – das erstickte Matt! Philidor beschrieb es schon 1749. Du opferst wie ein Meister!",
            failText: "Die Dame zieht nach g8: Schach! Der Turm muss schlagen (Kxg8 ist verboten – der Springer h6 deckt g8), dann Sf7 matt!"),
        ChessLesson(id: "L10-2", level: 10, title: "Das Anastasia-Matt",
            teach: "Das Anastasia-Matt: Springer und Turm arbeiten zusammen. Der Springer auf e7 nimmt dem Koenig g8 und g6 – der Turm gibt an der Kante Matt!",
            fen: "8/4N1pk/8/8/8/R7/8/6K1",
            prompt: "Setze das Anastasia-Matt: Matt in 1!",
            solutions: ["a3h3"],
            hint: "Der Springer bewacht schon g8 und g6. Welcher Turmzug gibt Schach an der h-Kante?",
            successText: "Anastasia-Matt! Der Koenig ist zwischen Springer-Feldern und Brettrand gefangen. Benannt nach einem Roman von 1803!",
            failText: "Turm nach h3: Schach auf der h-Linie – g8 und g6 bewacht dein Springer, g7 der eigene Bauer!"),
        ChessLesson(id: "L10-3", level: 10, title: "Das Arabische Matt",
            teach: "Das aelteste Mattbild der Welt (aus dem arabischen Schach): Springer und Turm Seite an Seite. Der Springer deckt den Turm UND das Fluchtfeld!",
            fen: "7k/1R6/5N2/8/8/8/8/6K1",
            prompt: "Setze das Arabische Matt: Matt in 1!",
            solutions: ["b7h7"],
            hint: "Der Turm muss direkt neben den Koenig – dein Springer f6 deckt ihn und bewacht g8!",
            successText: "Das Arabische Matt! Ueber 1000 Jahre alt und immer noch toedlich. Springer + Turm = perfektes Duo.",
            failText: "Turm nach h7: Schach! Der Koenig kann ihn nicht schlagen (Springer f6 deckt h7) und g8 ist auch bewacht."),
        ChessLesson(id: "L10-4", level: 10, title: "Den Verteidiger beseitigen",
            teach: "Meister-Denken: Der Gegner hat nur EINEN Verteidiger gegen dein Grundreihenmatt? Dann beseitige ihn – notfalls mit der Dame!",
            fen: "3r2k1/5ppp/8/Q7/8/8/8/6K1",
            prompt: "Nur der Turm d8 bewacht die Grundreihe. Matt in 1!",
            solutions: ["a5d8"],
            hint: "Deine Dame kann den einzigen Verteidiger schlagen – mit Schach... und es ist sogar Matt!",
            successText: "Dxd8 MATT! Der Verteidiger ist weg, die Grundreihe gehoert dir. Immer fragen: Wer verteidigt eigentlich?",
            failText: "Die Dame schlaegt den Turm auf d8: Schach auf der Grundreihe – und die Bauern sperren den eigenen Koenig ein. Matt!"),
        ChessLesson(id: "L10-5", level: 10, title: "Die Meisterpruefung",
            teach: "Die Abschlusspruefung der Akademie: Eine komplette Partie gegen die starke KI (Stufe 7). Dein Coach bewertet jeden Zug. Zeige alles, was du gelernt hast: Eroeffnung, Taktik, Strategie, Endspiel!",
            fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR",
            prompt: "Bestehe die Meisterpruefung: Gewinne ODER halte einen Zugdurchschnitt von mindestens 9/15 ueber 25 Zuege!",
            solutions: [],
            hint: "Alles zaehlt: Zentrum, Entwicklung, Rochade, keine Figuren einstellen, Taktik-Chancen nutzen!",
            successText: "MEISTERPRUEFUNG BESTANDEN! Du hast alle 10 Stufen der Schach-Akademie absolviert. Herzlichen Glueckwunsch, Schachmeister!",
            failText: "Noch nicht bestanden – aber jede Partie macht dich staerker! Analysiere deine Fehler und versuch es erneut.",
            freePlayMoves: 25, freePlayAI: 7)
    ]

    static func lessons(forLevel level: Int) -> [ChessLesson] {
        lessons.filter { $0.level == level }
    }

    static func progress(profile: PlayerProfile, level: Int) -> (done: Int, total: Int, stars: Int) {
        let ls = lessons(forLevel: level)
        var done = 0, stars = 0
        for l in ls {
            if let p = profile.lessonProgress[l.id], p.completed { done += 1; stars += p.stars }
        }
        return (done, ls.count, stars)
    }

    static func isLevelUnlocked(profile: PlayerProfile, level: Int) -> Bool {
        if level <= 1 { return true }
        let prev = progress(profile: profile, level: level - 1)
        guard prev.total > 0 else { return true }
        return Double(prev.done) / Double(prev.total) >= unlockQuote
    }
}

// MARK: - AI Engine

class ChessAIEngine {
    var difficulty: Int

    init(difficulty: Int = 5) {
        self.difficulty = max(1, min(10, difficulty))
    }

    private var nodeCount = 0

    // FIX #1: Scale maxNodes with difficulty so 7-10 are distinct
    /// v3: Fester Knotenbudget-Wert fuer Coach/Analyse (nil = nach Spielstaerke)
    private var nodeBudgetOverride: Int? = nil

    private var maxNodes: Int {
        if let o = nodeBudgetOverride { return o }
        switch difficulty {
        case 1...3: return 50_000
        case 4: return 100_000
        case 5: return 200_000
        case 6: return 400_000
        case 7: return 600_000
        case 8: return 900_000
        case 9: return 1_200_000
        case 10: return 2_000_000
        default: return 600_000
        }
    }

    private var aborted = false

    // FIX #12: Iterative Vertiefung. Vorher: EINE tiefe Suche, deren Budget mitten
    // im Baum ausging -> frueh geprüfte Zuege bekamen echte Werte, spaet geprüfte
    // Schrottwerte, und die KI waehlte systematisch schlecht geprüfte Zuege.
    // Jetzt: Tiefe 2, 3, 4, ... und nur KOMPLETT durchgerechnete Tiefen zaehlen.
    func bestMove(board: ChessBoard, color: PlayerColor) -> ChessMove? {
        let moves = board.allLegalMoves(for: color)
        guard !moves.isEmpty else { return nil }
        if moves.count == 1 { return moves[0] }

        nodeCount = 0
        aborted = false
        var ordered = orderMoves(moves, board: board, color: color)
        var lastCompletedBest = ordered[0]
        let maxDepth = max(2, min(difficulty + 1, 8))

        for depth in 2...maxDepth {
            var alpha = Int.min + 1
            var bestThisDepth = ordered[0]
            var completed = true

            for move in ordered {
                let tmp = ChessBoard(copyFrom: board)
                tmp.executeMove(move)
                let score = -negamax(board: tmp, depth: depth - 1, alpha: Int.min + 1, beta: -alpha,
                                     color: color.opposite, aiColor: color)
                if aborted { completed = false; break }
                if score > alpha {
                    alpha = score
                    bestThisDepth = move
                }
            }

            if completed {
                lastCompletedBest = bestThisDepth
                // Besten Zug nach vorn sortieren -> naechste, tiefere Iteration wird schneller
                ordered.removeAll { $0 == bestThisDepth }
                ordered.insert(bestThisDepth, at: 0)
            } else {
                break   // abgebrochene Tiefe verwerfen - Ergebnis der letzten vollen Tiefe gilt
            }
        }

        // Kinder-/Anfaengerstufen: gelegentlich absichtlich den zweit-/drittbesten Zug spielen
        if difficulty < 5 && ordered.count >= 2 {
            let wobbleChance = (5 - difficulty) * 18   // Stufe 1: 72%, Stufe 4: 18%
            if Int.random(in: 0..<100) < wobbleChance {
                return ordered[Int.random(in: 1..<min(3, ordered.count))]
            }
        }
        return lastCompletedBest
    }

    /// Ruhe-Suche (Quiescence, FIX #13): Am Suchhorizont werden Schlagfolgen zu Ende
    /// gerechnet. Vorher bewertete die KI Stellungen MITTEN im Abtausch und
    /// "uebersah", dass ihre Figur im naechsten Zug zurueckgeschlagen wird.
    private func quiesce(board: ChessBoard, alpha: Int, beta: Int, color: PlayerColor, qdepth: Int) -> Int {
        nodeCount += 1
        if nodeCount > maxNodes { aborted = true }
        let standPat = evaluate(board: board, for: color)
        if aborted || qdepth <= 0 { return standPat }
        if standPat >= beta { return standPat }
        var a = max(alpha, standPat)

        let captures = board.allLegalMoves(for: color)
            .filter { $0.capturedPiece != nil }
            .sorted { ($0.capturedPiece?.value ?? 0) > ($1.capturedPiece?.value ?? 0) }
        for m in captures {
            let tmp = ChessBoard(copyFrom: board)
            tmp.executeMove(m)
            let score = -quiesce(board: tmp, alpha: -beta, beta: -a, color: color.opposite, qdepth: qdepth - 1)
            if score > a { a = score }
            if a >= beta { break }
        }
        return a
    }

    private func orderMoves(_ moves: [ChessMove], board: ChessBoard, color: PlayerColor) -> [ChessMove] {
        return moves.sorted { a, b in
            let aScore = moveOrderScore(a, board: board)
            let bScore = moveOrderScore(b, board: board)
            return aScore > bScore
        }
    }

    private func moveOrderScore(_ move: ChessMove, board: ChessBoard) -> Int {
        var score = 0
        if let cap = move.capturedPiece {
            let attackerValue = board.piece(at: move.from)?.type.value ?? 100
            score += cap.value * 10 - attackerValue // MVV-LVA
        }
        if move.promotion != nil { score += 800 }
        if move.isCastling { score += 50 }
        return score
    }

    private func negamax(board: ChessBoard, depth: Int, alpha: Int, beta: Int, color: PlayerColor, aiColor: PlayerColor) -> Int {
        nodeCount += 1
        if nodeCount > maxNodes { aborted = true }
        if aborted {
            // Budget aufgebraucht: Wert ist egal, die ganze Tiefen-Iteration wird verworfen (FIX #12)
            return evaluate(board: board, for: color)
        }

        if depth == 0 {
            // FIX #9: Auch an Blattknoten Matt/Patt erkennen!
            if board.isInCheck(color) {
                if !board.hasLegalMoves(for: color) {
                    return -100000 - depth
                }
            } else {
                // Patt nur im Endspiel pruefen (Zuggenerierung ist teuer, Patt im
                // Mittelspiel praktisch unmoeglich)
                var pieceCount = 0
                for r in 0..<8 { for c in 0..<8 where board.grid[r][c] != nil { pieceCount += 1 } }
                if pieceCount <= 8 && !board.hasLegalMoves(for: color) {
                    return 0 // Patt
                }
            }
            // FIX #13: Ruhe-Suche statt roher Bewertung - beendet laufende Schlagfolgen
            return quiesce(board: board, alpha: alpha, beta: beta, color: color, qdepth: 6)
        }

        let moves = board.allLegalMoves(for: color)
        if moves.isEmpty {
            if board.isInCheck(color) {
                return -100000 - depth // Checkmate (worse the sooner)
            }
            return 0 // Stalemate
        }

        var a = alpha
        let ordered = orderMoves(moves, board: board, color: color)

        for move in ordered {
            let tmp = ChessBoard(copyFrom: board)
            tmp.executeMove(move)
            let score = -negamax(board: tmp, depth: depth - 1, alpha: -beta, beta: -a, color: color.opposite, aiColor: aiColor)
            if aborted { return a }
            if score > a { a = score }
            if a >= beta { break }
        }
        return a
    }

    /// v3 (Coach): Bewertet ALLE Zuege mit echter Suche (iterative Vertiefung + Ruhesuche),
    /// OHNE absichtliche Fehler der Anfaengerstufen. `window` = nil: volles Fenster fuer jeden
    /// Wurzelzug (exakte Werte, fuer die Zugbewertung); sonst werden Zuege, die mehr als `window`
    /// Centibauern schlechter als der beste sind, nur als "deutlich schlechter" erkannt (schneller).
    /// Rueckgabe: sortierte Liste (bester zuerst) und die letzte VOLL gerechnete Tiefe.
    /// Mattwerte: Score = 100000 + (Tiefe - Halbzuege bis Matt).
    func rankMoves(board: ChessBoard, color: PlayerColor, maxDepth: Int, nodeBudget: Int,
                   window: Int? = nil) -> (ranked: [(move: ChessMove, score: Int)], depth: Int) {
        let moves = board.allLegalMoves(for: color)
        guard !moves.isEmpty else { return ([], 0) }
        nodeBudgetOverride = nodeBudget
        defer { nodeBudgetOverride = nil }
        nodeCount = 0
        aborted = false

        var ordered = orderMoves(moves, board: board, color: color)
        var result: [(move: ChessMove, score: Int)] = []
        var completedDepth = 0

        for depth in 1...max(1, maxDepth) {
            var scores: [(move: ChessMove, score: Int)] = []
            var bestSoFar = Int.min + 1
            for (i, m) in ordered.enumerated() {
                let tmp = ChessBoard(copyFrom: board)
                tmp.executeMove(m)
                var alpha = Int.min + 1
                if let w = window, i > 0, bestSoFar > Int.min + 1 + w { alpha = bestSoFar - w }
                let s = -negamax(board: tmp, depth: depth - 1, alpha: alpha, beta: Int.max,
                                 color: color.opposite, aiColor: color)
                if aborted { break }
                scores.append((move: m, score: s))
                if s > bestSoFar { bestSoFar = s }
            }
            if aborted { break }
            scores.sort { $0.score > $1.score }
            result = scores
            completedDepth = depth
            ordered = scores.map { $0.move }
            if let top = scores.first, top.score >= 90_000 { break }   // Matt gefunden: fertig
        }

        if result.isEmpty {
            // Budget reichte nicht einmal fuer Tiefe 1: statische Bewertung als Notnagel
            result = moves.map { m -> (move: ChessMove, score: Int) in
                let tmp = ChessBoard(copyFrom: board)
                tmp.executeMove(m)
                return (move: m, score: -evaluate(board: tmp, for: color.opposite))
            }.sorted { $0.score > $1.score }
        }
        return (result, completedDepth)
    }

    /// Flache Suche (wenige Halbzuege) fuer die Live-Zugbewertung – schnell, ohne Node-Limits
    func shallowScore(board: ChessBoard, toMove color: PlayerColor, depth: Int) -> Int {
        if depth <= 0 { return evaluate(board: board, for: color) }
        let moves = board.allLegalMoves(for: color)
        if moves.isEmpty {
            return board.isInCheck(color) ? (-100000 - depth) : 0
        }
        var best = Int.min + 1
        for move in moves {
            let tmp = ChessBoard(copyFrom: board)
            tmp.executeMove(move)
            let score = -shallowScore(board: tmp, toMove: color.opposite, depth: depth - 1)
            if score > best { best = score }
        }
        return best
    }

    func evaluate(board: ChessBoard, for color: PlayerColor) -> Int {
        var score = 0
        var wKing: Position? = nil, bKing: Position? = nil
        for r in 0..<8 { for c in 0..<8 {
            if let p = board.grid[r][c] {
                var val = p.type.value
                val += positionalBonus(type: p.type, row: r, col: c, color: p.color)
                if p.color == color { score += val } else { score -= val }
                if p.type == .king { if p.color == .white { wKing = Position(row: r, col: c) } else { bKing = Position(row: r, col: c) } }
            }
        }}
        // v3: Koenigsschutz – vorgerueckte f/g/h-Bauern vor dem (noch) kurz stehenden Koenig kosten Punkte
        let wShelter = shelterPenalty(board: board, color: .white, king: wKing)
        let bShelter = shelterPenalty(board: board, color: .black, king: bKing)
        score += color == .white ? (bShelter - wShelter) : (wShelter - bShelter)
        return score
    }

    /// Malus fuer fehlende Bauern vor dem Koenig (nur wenn der Koenig auf der Grundreihe in der Mitte/am Koenigsfluegel steht)
    private func shelterPenalty(board: ChessBoard, color: PlayerColor, king: Position?) -> Int {
        guard let k = king else { return 0 }
        let home = color == .white ? 7 : 0
        let start = color == .white ? 6 : 1
        guard k.row == home, k.col >= 4 else { return 0 }
        var pen = 0
        for (col, w) in [(5, 16), (6, 8), (7, 5)] {
            if let p = board.grid[start][col], p.type == .pawn, p.color == color { continue }
            pen += w
        }
        return pen
    }

    func positionalBonus(type: ChessPieceType, row: Int, col: Int, color: PlayerColor) -> Int {
        // Relative row from the piece's perspective (0 = own back rank)
        let rr = color == .white ? 7 - row : row
        switch type {
        case .pawn:
            // Encourage center pawns and advancement
            // v3: Randbauern (a/b/g/h) bekommen weniger Vorrueck-Bonus, d4/e4/d5/e5 extra –
            // sonst hielt die Engine 1.a4 fuer so gut wie 1.e4
            let central = col >= 2 && col <= 5
            let centerBonus = central ? 10 : 0
            let occupy = (col == 3 || col == 4) && rr >= 3 && rr <= 4 ? 8 : 0
            return rr * (central ? 5 : 3) + centerBonus + occupy
        case .knight:
            // Knights are best in center
            // FIX #8: Symmetrische Zentrumsdistanz (Zentrum = 4 Felder d4/e4/d5/e5),
            // vorher war die Bewertung fuer Weiss und Schwarz unterschiedlich!
            let centerDist = min(abs(col - 3), abs(col - 4)) + min(abs(row - 3), abs(row - 4))
            return max(0, 20 - centerDist * 5) - (rr == 0 ? 10 : 0)   // v3: unentwickelt = Malus
        case .bishop:
            // Bishops like diagonals and open positions (FIX #8: symmetrisch)
            let centerDist = min(abs(col - 3), abs(col - 4)) + min(abs(row - 3), abs(row - 4))
            return max(0, 15 - centerDist * 3) - (rr == 0 ? 10 : 0)   // v3: unentwickelt = Malus
        case .rook:
            // Rooks on open files, 7th rank
            return rr == 6 ? 20 : 0
        case .queen:
            // Don't develop queen too early
            return rr <= 1 ? 0 : -5
        case .king:
            // King safety: stay on back rank in middlegame
            if rr <= 1 {
                return (col <= 2 || col >= 6) ? 15 : 0 // Prefer castled position
            }
            return -20 // Penalty for exposed king
        }
    }
}

// MARK: - Tutorial Engine (Lernmodus - Herzstueck)

class ChessTutorialEngine {
    private let aiEngine = ChessAIEngine(difficulty: 4)
    private var moveCount = 0
    private var lastPieceMoved: ChessPieceType?
    private var lastWasCapture = false
    private var hasBeenInCheck = false

    func reset() {
        moveCount = 0
        lastPieceMoved = nil
        lastWasCapture = false
        hasBeenInCheck = false
    }

    func getHint(board: ChessBoard, color: PlayerColor) -> (move: ChessMove?, explanation: String) {
        let moves = board.allLegalMoves(for: color)
        guard !moves.isEmpty else { return (nil, "Keine Zuege moeglich!") }

        moveCount += 1

        // Check if in check - must escape
        if board.isInCheck(color) {
            hasBeenInCheck = true
            let best = aiEngine.bestMove(board: board, color: color) ?? moves[0]
            if best.isCastling {
                return (best, "Du stehst im Schach! Rochiere, um deinen Koenig in Sicherheit zu bringen.")
            }
            if best.capturedPiece != nil {
                return (best, "Du stehst im Schach! Schlage die angreifende Figur, um das Schach abzuwehren.")
            }
            return (best, "Du stehst im Schach! Du musst den Koenig aus dem Schach ziehen. Der markierte Zug bringt ihn in Sicherheit.")
        }

        let best = aiEngine.bestMove(board: board, color: color) ?? moves[0]

        // Check for tactical opportunities
        let explanation = explainMove(move: best, board: board, color: color, allMoves: moves)
        return (best, explanation)
    }

    func explainAfterMove(move: ChessMove, board: ChessBoard, mover: PlayerColor) -> String {
        var parts: [String] = []
        let movedPiece = board.piece(at: move.to)

        // Capture explanation
        if let captured = move.capturedPiece {
            let capName = captured.displayName
            let movName = movedPiece?.type.displayName ?? "Figur"
            parts.append("\(movName) schlaegt \(capName)!")
            if captured.value > (movedPiece?.type.value ?? 0) {
                parts.append("Guter Tausch - du hast eine wertvollere Figur geschlagen.")
            }
        }

        // Castling
        if move.isCastling {
            if move.to.col == 6 {
                parts.append("Kurze Rochade! Koenig und Turm tauschen Plaetze. Der Koenig steht jetzt sicher hinter den Bauern.")
            } else {
                parts.append("Lange Rochade! Der Koenig ist jetzt auf der Damenseite in Sicherheit.")
            }
        }

        // Promotion
        if let promo = move.promotion {
            parts.append("Bauernumwandlung! Der Bauer wird zur \(promo.displayName). Meistens waehlt man die Dame (staerkste Figur).")
        }

        // En passant
        if move.isEnPassant {
            parts.append("En passant! Ein spezieller Bauernschlag: Wenn ein Bauer zwei Felder vorrueckt, kann der gegnerische Bauer ihn im Vorbeigehen schlagen.")
        }

        // Check detection
        let opponent = mover.opposite
        if board.isInCheck(opponent) {
            if !board.hasLegalMoves(for: opponent) {
                parts.append("Schachmatt! Der gegnerische Koenig kann dem Schach nicht entkommen.")
            } else {
                parts.append("Schach! Der gegnerische Koenig wird angegriffen und muss reagieren.")
            }
        }

        // Material balance
        let whiteMat = board.countMaterial(for: .white)
        let blackMat = board.countMaterial(for: .black)
        let diff = whiteMat - blackMat
        if abs(diff) >= 200 {
            if diff > 0 {
                parts.append("Weiss hat Materialvorteil (\(diff / 100) Punkte).")
            } else {
                parts.append("Schwarz hat Materialvorteil (\(-diff / 100) Punkte).")
            }
        }

        if parts.isEmpty {
            if moveCount <= 6 {
                parts.append("Entwickle deine Figuren! Bringe Springer und Laeufer ins Spiel, bevor du rochierst.")
            } else {
                parts.append("Guter Zug. Achte auf die Kontrolle des Zentrums und die Sicherheit deines Koenigs.")
            }
        }

        lastPieceMoved = movedPiece?.type
        lastWasCapture = move.capturedPiece != nil
        return parts.joined(separator: " ")
    }

    func getOpeningTip() -> String {
        return "Willkommen im Lernmodus! Du spielst Weiss, dein Coach schaut dir ueber die Schulter.\n• 💡 Tipp: 1× = Denkanstoss, 2× = Loesung mit Pfeil und Begruendung\n• ↶ Zurück: letzten Zug zuruecknehmen und es besser machen\n• Nach jedem Zug sagt dir der Coach, ob etwas haengt – orange Ringe = Gefahr!\n• 🧊 3D-Brett: mit der Maus drehen, scrollen zum Zoomen, 🔄 wendet das Brett\nGrundregel: Springer und Laeufer entwickeln, Zentrum besetzen, frueh rochieren!"
    }

    func getPieceExplanation(_ type: ChessPieceType) -> String {
        let pawIntro: String
        if Piece3DFactory.active3D {
            pawIntro = Piece3DFactory.dogMode
                ? "🐶 Das ist \(Piece3DFactory.dogName(type)), der \(Piece3DFactory.dogBreed(type)) – \(type.isFeminine ? "deine" : "dein") \(type.name)! "
                : ""
        } else {
            pawIntro = PieceStyle.current == .pawPatrol ? "\u{1F43E} \(pawPatrolName(type)) ist dein \(type.name)! " : ""
        }
        return pawIntro + basePieceExplanation(type)
    }

    private func basePieceExplanation(_ type: ChessPieceType) -> String {
        switch type {
        case .pawn: return "Bauer: Zieht 1 Feld vorwaerts (2 vom Start). Schlaegt diagonal. Erreicht er die letzte Reihe, wird er umgewandelt (meist zur Dame)."
        case .knight: return "Springer: Zieht in L-Form (2+1 Felder). Einzige Figur die ueber andere springen kann. Stark im Zentrum."
        case .bishop: return "Laeufer: Zieht diagonal beliebig weit. Bleibt immer auf seiner Feldfarbe. Zwei Laeufer sind staerker als zwei Springer."
        case .rook: return "Turm: Zieht horizontal und vertikal beliebig weit. Stark auf offenen Linien. Wert: ca. 5 Punkte."
        case .queen: return "Dame: Kombiniert Turm und Laeufer - zieht in alle Richtungen beliebig weit. Staerkste Figur (9 Punkte). Nicht zu frueh entwickeln!"
        case .king: return "Koenig: Zieht 1 Feld in alle Richtungen. Kann rochieren (einmal pro Spiel). Darf nie ins Schach ziehen. Muss geschuetzt werden!"
        }
    }

    private func explainMove(move: ChessMove, board: ChessBoard, color: PlayerColor, allMoves: [ChessMove]) -> String {
        let piece = board.piece(at: move.from)
        let pieceType = piece?.type ?? .pawn

        // Check for captures
        if let captured = move.capturedPiece {
            let attackerVal = pieceType.value
            let targetVal = captured.value
            if targetVal > attackerVal {
                return "Tipp: Schlage \(captured.displayName) mit deinem \(pieceType.displayName)! Ein guter Tausch - du gewinnst Material."
            }
            return "Tipp: Du kannst \(captured.displayName) schlagen. \(pieceType.displayName) nimmt die gegnerische Figur."
        }

        // Castling available
        if move.isCastling {
            return "Tipp: Rochiere jetzt! Rochade bringt den Koenig in Sicherheit und aktiviert den Turm. Ein sehr wichtiger Zug."
        }

        // Opening principles
        if moveCount <= 3 {
            if pieceType == .pawn && (move.from.col == 3 || move.from.col == 4) {
                return "Tipp: Kontrolliere das Zentrum mit deinen Bauern (d- und e-Linie). Das gibt deinen Figuren mehr Raum."
            }
            if pieceType == .knight || pieceType == .bishop {
                return "Tipp: Entwickle deine Leichtfiguren (\(pieceType.displayName)) frueh. Springer und Laeufer sollten vor der Dame ins Spiel kommen."
            }
        }

        // Pawn promotion approaching
        if pieceType == .pawn {
            let promoRow = color == .white ? 0 : 7
            let dist = abs(move.to.row - promoRow)
            if dist <= 2 {
                return "Tipp: Dein Bauer ist nah an der Umwandlung! Noch \(dist) Felder bis zur Dame."
            }
        }

        // Center control
        if (move.to.row >= 3 && move.to.row <= 4) && (move.to.col >= 3 && move.to.col <= 4) {
            return "Tipp: \(pieceType.displayName) ins Zentrum! Figuren im Zentrum kontrollieren mehr Felder und sind flexibler."
        }

        // Check for fork potential
        if pieceType == .knight {
            let tmp = ChessBoard(copyFrom: board)
            tmp.executeMove(move)
            var attacked = 0
            let valuableTypes: [ChessPieceType] = [.rook, .queen, .king]
            for r in 0..<8 { for c in 0..<8 {
                if let p = tmp.grid[r][c], p.color == color.opposite, valuableTypes.contains(p.type) {
                    if tmp.isSquareAttacked(Position(row: r, col: c), by: color) { attacked += 1 }
                }
            }}
            if attacked >= 2 {
                return "Tipp: Springergabel! Der Springer greift mehrere wertvolle Figuren gleichzeitig an - ein starker taktischer Zug!"
            }
        }

        // General development tip
        if moveCount <= 10 {
            return "Tipp: \(pieceType.displayName) nach \(colLetter(move.to.col))\(8 - move.to.row). Entwickle alle Figuren, bevor du angreifst."
        }

        return "Tipp: Laut KI-Analyse ist \(pieceType.displayName) nach \(colLetter(move.to.col))\(8 - move.to.row) der beste Zug in dieser Stellung."
    }

    private func colLetter(_ col: Int) -> String {
        String(Character(UnicodeScalar(97 + col)!))
    }
}

// MARK: - Algebraische Notation Helfer

func posToAlgebraic(_ p: Position) -> String {
    String(Character(UnicodeScalar(97 + p.col)!)) + "\(8 - p.row)"
}

func moveToAlgebraic(_ m: ChessMove) -> String {
    posToAlgebraic(m.from) + posToAlgebraic(m.to)
}

// MARK: - Eroeffnungsbuch (ECO-basiert, 300+ Zuege aus 20 Buechern)

struct OpeningEntry {
    let eco: String
    let name: String
    let moves: [String]
    let explanation: String
    let bookSource: String
}

class ChessOpeningBook {
    static let entries: [OpeningEntry] = [
        // ═══ A: Flankeneroeffnungen ═══
        OpeningEntry(eco: "A00", name: "Sokolsky (Polnisch)", moves: ["b2b4"],
            explanation: "Seltene Flankeneroeffnung. Weiss kontrolliert c5 und bereitet Lb2 vor. Ueberraschungswaffe in Blitzpartien.",
            bookSource: "Schiller: Unorthodox Chess Openings"),
        OpeningEntry(eco: "A02", name: "Bird-Eroeffnung", moves: ["f2f4"],
            explanation: "Weiss kontrolliert e5 und plant einen Koenigsfluegelangriff. Dynamisch aber riskant - der Koenig wird leicht exponiert.",
            bookSource: "Lakdawala: Bird Eroeffnung"),
        OpeningEntry(eco: "A04", name: "Reti-Eroeffnung", moves: ["g1f3"],
            explanation: "Hypermoderner Aufbau: Springer vor Bauern! Weiss verzoegert d4/e4 und kontrolliert das Zentrum aus der Ferne.",
            bookSource: "Reti: Die neuen Ideen im Schach"),
        OpeningEntry(eco: "A04", name: "Reti mit d5", moves: ["g1f3", "d7d5"],
            explanation: "Schwarz besetzt das Zentrum klassisch. Weiss wird mit c4 das Zentrum untergraben - typische hypermoderne Strategie.",
            bookSource: "Reti: Die neuen Ideen im Schach"),
        OpeningEntry(eco: "A05", name: "Reti - Koenigsindischer Angriff", moves: ["g1f3", "g8f6"],
            explanation: "Beide Seiten entwickeln Springer. Flexible Stellung mit vielen Uebergaengen zu anderen Eroeffnungen.",
            bookSource: "Reti: Die neuen Ideen im Schach"),
        OpeningEntry(eco: "A10", name: "Englische Eroeffnung", moves: ["c2c4"],
            explanation: "Kontrolliert d5 ohne das Zentrum frueh festzulegen. Fuehrt oft zu positionellen Manoeverkampfen. Botwinnik-Favorit.",
            bookSource: "Marin: Englisch 1.c4"),
        OpeningEntry(eco: "A13", name: "Englisch mit e6", moves: ["c2c4", "e7e6"],
            explanation: "Schwarz bereitet d5 vor und haelt die Stellung flexibel. Kann in Damenindisch oder Damengambit uebergehen.",
            bookSource: "Marin: Englisch 1.c4"),
        OpeningEntry(eco: "A15", name: "Englisch mit Sf6", moves: ["c2c4", "g8f6"],
            explanation: "Schwarz entwickelt den Springer und haelt alle Optionen offen. Kann zu Koenigsindisch oder Nimzoindisch fuehren.",
            bookSource: "Marin: Englisch 1.c4"),
        OpeningEntry(eco: "A20", name: "Englisch mit e5", moves: ["c2c4", "e7e5"],
            explanation: "Sizilianisch mit vertauschten Farben! Schwarz besetzt das Zentrum aggressiv. Weiss hat einen Tempovorteil.",
            bookSource: "Kosten: Sizilianisch im Anzug"),
        OpeningEntry(eco: "A30", name: "Englisch Symmetrisch", moves: ["c2c4", "c7c5"],
            explanation: "Symmetrische Bauernstruktur. Weiss versucht mit Sf3, g3, Lg2 die Initiative zu ergreifen.",
            bookSource: "Marin: Englisch 1.c4"),
        OpeningEntry(eco: "A40", name: "Damenbauernspiel", moves: ["d2d4", "e7e6"],
            explanation: "Solider schwarzer Aufbau. Kann zu Franzoesisch (nach e4) oder Damengambit (nach d5, c4) fuehren.",
            bookSource: "Watson: Damenbauernspiel"),
        OpeningEntry(eco: "A43", name: "Altindisch", moves: ["d2d4", "g8f6", "c2c4", "d7d6"],
            explanation: "Schwarz baut eine flexible Stellung auf und vermeidet fruehe Festlegungen. Kann zu Koenigsindisch transponieren.",
            bookSource: "Bologan: Koenigsindisch"),
        OpeningEntry(eco: "A45", name: "Trompowsky-Angriff", moves: ["d2d4", "g8f6", "c1g5"],
            explanation: "Weiss setzt den Laeufer aggressiv ein und droht Lxf6 mit Verdopplung der Bauern. Moderner Ueberraschungszug.",
            bookSource: "Rapport: Trompowsky Angriff"),
        OpeningEntry(eco: "A51", name: "Budapester Gambit", moves: ["d2d4", "g8f6", "c2c4", "e7e5"],
            explanation: "Schwarz opfert einen Bauern fuer schnelle Entwicklung und Angriff. Taktisch gefaehrlich fuer Unvorbereitete!",
            bookSource: "Tseitlin: Budapester Gambit"),
        OpeningEntry(eco: "A56", name: "Benoni-Verteidigung", moves: ["d2d4", "g8f6", "c2c4", "c7c5"],
            explanation: "Schwarz erzeugt Asymmetrie und Gegenspiel am Damenflügel. Tal und Kasparov liebten diese scharfe Verteidigung.",
            bookSource: "Palliser: Moderne Benoni"),
        OpeningEntry(eco: "A57", name: "Benko-Gambit", moves: ["d2d4", "g8f6", "c2c4", "c7c5", "d4d5", "b7b5"],
            explanation: "Positionelles Gambit! Schwarz opfert einen Bauern fuer langfristigen Druck auf den offenen a- und b-Linien.",
            bookSource: "Pedersen: Benko-Gambit"),
        OpeningEntry(eco: "A60", name: "Moderne Benoni", moves: ["d2d4", "g8f6", "c2c4", "c7c5", "d4d5", "e7e6"],
            explanation: "Schwarz erzeugt einen asymmetrischen Bauernhebel. Typisch: Weiss hat Raumvorteil, Schwarz hat dynamisches Gegenspiel.",
            bookSource: "Palliser: Moderne Benoni"),
        OpeningEntry(eco: "A80", name: "Hollaendische Verteidigung", moves: ["d2d4", "f7f5"],
            explanation: "Schwarz kontrolliert e4 und plant einen Koenigsfluegelangriff. Botwinnik setzte dies erfolgreich ein.",
            bookSource: "Moskalenko: Hollaendisch"),

        // ═══ B: Halboffene Spiele (1.e4 ohne 1...e5) ═══
        OpeningEntry(eco: "B00", name: "Nimzowitsch-Verteidigung", moves: ["e2e4", "b8c6"],
            explanation: "Hypermodern: Schwarz kontrolliert d4 mit dem Springer statt mit Bauern. Ungewoehnlich aber solide.",
            bookSource: "Nimzowitsch: Mein System"),
        OpeningEntry(eco: "B00", name: "Owen-Verteidigung", moves: ["e2e4", "b7b6"],
            explanation: "Schwarz fianchettiert den Damenlaeufer. Ungewoehnlich gegen 1.e4, aber flexibel und ueberraschend.",
            bookSource: "Keene: Flank Openings"),
        OpeningEntry(eco: "B01", name: "Skandinavische Verteidigung", moves: ["e2e4", "d7d5"],
            explanation: "Sofortige Konfrontation im Zentrum! Nach exd5 Dxd5 verliert Schwarz ein Tempo durch Damenzug, gewinnt aber Raum.",
            bookSource: "Houska: Skandinavisch"),
        OpeningEntry(eco: "B01", name: "Skandinavisch Sf6", moves: ["e2e4", "d7d5", "e4d5", "g8f6"],
            explanation: "Moderne Variante: Schwarz nimmt mit dem Springer statt der Dame zurueck und vermeidet Tempoverlust.",
            bookSource: "Houska: Skandinavisch"),
        OpeningEntry(eco: "B02", name: "Aljechin-Verteidigung", moves: ["e2e4", "g8f6"],
            explanation: "Provokation! Schwarz lockt die weissen Bauern vor, um sie spaeter anzugreifen. Aljechins genialer Beitrag zur Theorie.",
            bookSource: "Davies: Aljechin-Verteidigung"),
        OpeningEntry(eco: "B06", name: "Moderne Verteidigung", moves: ["e2e4", "g7g6"],
            explanation: "Schwarz fianchettiert und laesst Weiss das Zentrum besetzen, um es spaeter zu untergraben. Hypermoderner Ansatz.",
            bookSource: "Norwood: Moderne Verteidigung"),
        OpeningEntry(eco: "B07", name: "Pirc-Verteidigung", moves: ["e2e4", "d7d6", "d2d4", "g8f6", "b1c3", "g7g6"],
            explanation: "Aehnlich der Modernen, mit fruehemSf6. Schwarz baut eine elastische Stellung auf und schlaegt im Mittelspiel zurueck.",
            bookSource: "Vigus: Pirc-Verteidigung"),
        OpeningEntry(eco: "B10", name: "Caro-Kann-Verteidigung", moves: ["e2e4", "c7c6"],
            explanation: "Solide und zuverlaessig! c6 bereitet d5 vor ohne den Damenlaeufer einzusperren. Karpow und Anand spielten dies oft.",
            bookSource: "Houska: Caro-Kann"),
        OpeningEntry(eco: "B12", name: "Caro-Kann Vorstoßvariante", moves: ["e2e4", "c7c6", "d2d4", "d7d5", "e4e5"],
            explanation: "Weiss gewinnt Raum mit e5. Schwarz muss geduldig spielen und die Kette mit c5 und f6 angreifen.",
            bookSource: "Houska: Caro-Kann"),
        OpeningEntry(eco: "B18", name: "Caro-Kann Klassisch", moves: ["e2e4", "c7c6", "d2d4", "d7d5", "b1c3", "d5e4", "c3e4", "c8f5"],
            explanation: "Schwarzer Hauptplan: Laeufer nach f5 BEVOR e6 gespielt wird. Perfekte Entwicklung fuer den problematischen c8-Laeufer.",
            bookSource: "Karpow: Caro-Kann Verteidigung"),
        OpeningEntry(eco: "B20", name: "Sizilianische Verteidigung", moves: ["e2e4", "c7c5"],
            explanation: "Die beliebteste Antwort auf 1.e4! Asymmetrischer Kampf: Weiss hat Koenigsfluegelangriff, Schwarz Damenfluegelinitiative.",
            bookSource: "Kasparov: Meine grossen Vorkämpfer"),
        OpeningEntry(eco: "B22", name: "Sizilianisch Alapin", moves: ["e2e4", "c7c5", "c2c3"],
            explanation: "Weiss bereitet d4 vor und vermeidet die gefaehrlichen offenen Sizilianisch-Varianten. Solide und praktisch.",
            bookSource: "Sveshnikov: Sizilianisch c3"),
        OpeningEntry(eco: "B23", name: "Sizilianisch Geschlossen", moves: ["e2e4", "c7c5", "b1c3"],
            explanation: "Weiss entwickelt zunaechst Figuren statt sofort d4. Ruhiger als die offene Sizilianische, aber mit Gift.",
            bookSource: "Soltis: Sizilianisch"),
        OpeningEntry(eco: "B30", name: "Sizilianisch Sc6", moves: ["e2e4", "c7c5", "g1f3", "b8c6"],
            explanation: "Klassischer Aufbau. Schwarz entwickelt den Springer nach c6 und bereitet sich auf d4 cxd4 Sxd4 vor.",
            bookSource: "Kasparov: Meine grossen Vorkämpfer"),
        OpeningEntry(eco: "B33", name: "Sizilianisch Sveshnikov", moves: ["e2e4", "c7c5", "g1f3", "b8c6", "d2d4", "c5d4", "f3d4", "g8f6", "b1c3", "e7e5"],
            explanation: "Aggressiv! Schwarz akzeptiert ein Loch auf d5 fuer aktives Figurenspiel. Sveshnikov revolutionierte diese Variante.",
            bookSource: "Yakovich: Sveshnikov-Sizilianisch"),
        OpeningEntry(eco: "B40", name: "Sizilianisch Paulsen", moves: ["e2e4", "c7c5", "g1f3", "e7e6"],
            explanation: "Flexibler Aufbau: e6 unterstuetzt d5 und ermoeglicht den Laeufer nach e7 oder b4. Korchnoi-Favorit.",
            bookSource: "Soltis: Sizilianisch"),
        OpeningEntry(eco: "B44", name: "Sizilianisch Taimanov", moves: ["e2e4", "c7c5", "g1f3", "e7e6", "d2d4", "c5d4", "f3d4", "b8c6"],
            explanation: "Solide und flexibel. Schwarz entwickelt den Springer nach c6 und haelt viele Optionen offen.",
            bookSource: "Soltis: Sizilianisch"),
        OpeningEntry(eco: "B50", name: "Sizilianisch d6", moves: ["e2e4", "c7c5", "g1f3", "d7d6"],
            explanation: "Schwarz spielt d6 und bereitet Sf6, g6 oder e5 vor. Fuehrt oft zum Najdorf oder Drachen.",
            bookSource: "Kasparov: Meine grossen Vorkämpfer"),
        OpeningEntry(eco: "B70", name: "Sizilianisch Drache", moves: ["e2e4", "c7c5", "g1f3", "d7d6", "d2d4", "c5d4", "f3d4", "g8f6", "b1c3", "g7g6"],
            explanation: "Der feuerspeiende Drache! Schwarzer Laeufer auf g7 ist eine Waffe. Beruehmt fuer scharfe Angriffe beider Seiten.",
            bookSource: "Golubev: Sizilianisch Drache"),
        OpeningEntry(eco: "B90", name: "Sizilianisch Najdorf", moves: ["e2e4", "c7c5", "g1f3", "d7d6", "d2d4", "c5d4", "f3d4", "g8f6", "b1c3", "a7a6"],
            explanation: "Fischers und Kasparovs Lieblingseroeffnung! a6 bereitet b5/e5 vor und vermeidet Lb5+. Extrem dynamisch.",
            bookSource: "Kasparov: Meine grossen Vorkämpfer"),

        // ═══ C: Offene Spiele (1.e4 e5) und Franzoesisch ═══
        OpeningEntry(eco: "C00", name: "Franzoesische Verteidigung", moves: ["e2e4", "e7e6"],
            explanation: "Solider schwarzer Aufbau: e6 unterstuetzt d5 und schafft eine feste Bauernkette. Problem: der c8-Laeufer ist eingesperrt.",
            bookSource: "Moskalenko: Franzoesisch"),
        OpeningEntry(eco: "C01", name: "Franzoesisch Abtauschvariante", moves: ["e2e4", "e7e6", "d2d4", "d7d5", "e4d5", "e6d5"],
            explanation: "Symmetrische Bauernstruktur nach dem Abtausch. Ruhige Stellung mit kleinem weissen Raumvorteil.",
            bookSource: "Moskalenko: Franzoesisch"),
        OpeningEntry(eco: "C02", name: "Franzoesisch Vorstoßvariante", moves: ["e2e4", "e7e6", "d2d4", "d7d5", "e4e5"],
            explanation: "Weiss gewinnt Raum! Schwarz muss die Kette mit c5 und f6 angreifen. Nimzowitschs Kettenblockade-Theorie gilt hier.",
            bookSource: "Nimzowitsch: Mein System"),
        OpeningEntry(eco: "C03", name: "Franzoesisch Tarrasch", moves: ["e2e4", "e7e6", "d2d4", "d7d5", "b1d2"],
            explanation: "Sd2 statt Sc3 - vermeidet die Festnagelung durch Lb4. Solider weisser Aufbau ohne fruehe Komplikationen.",
            bookSource: "Moskalenko: Franzoesisch"),
        OpeningEntry(eco: "C11", name: "Franzoesisch Klassisch", moves: ["e2e4", "e7e6", "d2d4", "d7d5", "b1c3", "g8f6"],
            explanation: "Schwarz entwickelt den Springer natuerlich. Es folgen oft scharfe Varianten mit Le2 und 0-0.",
            bookSource: "Moskalenko: Franzoesisch"),
        OpeningEntry(eco: "C15", name: "Franzoesisch Winawer", moves: ["e2e4", "e7e6", "d2d4", "d7d5", "b1c3", "f8b4"],
            explanation: "Strategisch komplex! Schwarz nagelt den Springer fest, Weiss gewinnt oft das Laeuferpaar. Botwinnik-Variante.",
            bookSource: "Moskalenko: Franzoesisch"),
        OpeningEntry(eco: "C25", name: "Wiener Partie", moves: ["e2e4", "e7e5", "b1c3"],
            explanation: "Weiss entwickelt den Springer nach c3 und haelt f2-f4 als Option. Weniger theoretisch als 2.Sf3.",
            bookSource: "Tseitlin: Wiener Partie"),
        OpeningEntry(eco: "C30", name: "Koenigsgambit", moves: ["e2e4", "e7e5", "f2f4"],
            explanation: "Das aelteste Gambit! Weiss opfert einen Bauern fuer offene Linien und schnellen Angriff. Anderssens Lieblingseroeffnung.",
            bookSource: "Gallagher: Koenigsgambit"),
        OpeningEntry(eco: "C33", name: "Koenigsgambit Angenommen", moves: ["e2e4", "e7e5", "f2f4", "e5f4"],
            explanation: "Schwarz nimmt den Bauern an. Jetzt muss Weiss schnell entwickeln und angreifen bevor Schwarz konsolidiert.",
            bookSource: "Gallagher: Koenigsgambit"),
        OpeningEntry(eco: "C41", name: "Philidor-Verteidigung", moves: ["e2e4", "e7e5", "g1f3", "d7d6"],
            explanation: "Solide aber passiv. d6 stuetzt e5 ohne den d-Bauern zu blockieren. Philidor nannte Bauern die Seele des Schachs.",
            bookSource: "Bauer: Philidor-Verteidigung"),
        OpeningEntry(eco: "C42", name: "Russische Verteidigung (Petrov)", moves: ["e2e4", "e7e5", "g1f3", "g8f6"],
            explanation: "Schwarz kontert sofort im Zentrum statt e5 zu verteidigen. Sehr solide, beliebt bei Kramnik und Caruana.",
            bookSource: "Karpow: Russische Verteidigung"),
        OpeningEntry(eco: "C44", name: "Schottische Partie", moves: ["e2e4", "e7e5", "g1f3", "b8c6", "d2d4"],
            explanation: "Sofortige Zentrumsoefffnung! Weiss opfert den d-Bauern fuer schnelle Entwicklung. Kasparov belebte dies 1990 wieder.",
            bookSource: "Wells: Schottisch"),
        OpeningEntry(eco: "C44", name: "Schottisches Gambit", moves: ["e2e4", "e7e5", "g1f3", "b8c6", "d2d4", "e5d4", "f1c4"],
            explanation: "Weiss opfert den d-Bauern und entwickelt den Laeufer aktiv. Kombiniert Entwicklungsvorsprung mit Angriffsmoeglichkeiten.",
            bookSource: "Wells: Schottisch"),
        OpeningEntry(eco: "C47", name: "Vierspringerspiel", moves: ["e2e4", "e7e5", "g1f3", "b8c6", "b1c3", "g8f6"],
            explanation: "Alle vier Springer sind entwickelt! Symmetrische Stellung mit vielen taktischen Moeglichkeiten.",
            bookSource: "Karpow: Offene Spiele"),
        OpeningEntry(eco: "C50", name: "Italienische Partie", moves: ["e2e4", "e7e5", "g1f3", "b8c6", "f1c4"],
            explanation: "Klassische Eroeffnung seit dem 16. Jahrhundert. Lc4 zielt auf f7, den schwaechsten Punkt in der Anfangsstellung.",
            bookSource: "Pinski: Italienisch"),
        OpeningEntry(eco: "C50", name: "Ungarische Verteidigung", moves: ["e2e4", "e7e5", "g1f3", "b8c6", "f1c4", "f8e7"],
            explanation: "Schwarz spielt vorsichtig Le7 statt Lc5. Solide aber gibt Weiss leichten Entwicklungsvorsprung.",
            bookSource: "Pinski: Italienisch"),
        OpeningEntry(eco: "C51", name: "Evans-Gambit", moves: ["e2e4", "e7e5", "g1f3", "b8c6", "f1c4", "f8c5", "b2b4"],
            explanation: "Brillantes Gambit! Weiss opfert den b-Bauern fuer Tempo und offene Linien. Anderssens geniale Angriffswaffe.",
            bookSource: "Harding: Evans-Gambit"),
        OpeningEntry(eco: "C53", name: "Giuoco Piano", moves: ["e2e4", "e7e5", "g1f3", "b8c6", "f1c4", "f8c5"],
            explanation: "Das 'ruhige Spiel' - aber die Ruhe truegt! Beide Laeufer sind aktiv, und taktische Schlaege lauern.",
            bookSource: "Pinski: Italienisch"),
        OpeningEntry(eco: "C55", name: "Zweispringerspiel", moves: ["e2e4", "e7e5", "g1f3", "b8c6", "f1c4", "g8f6"],
            explanation: "Schwarz kontert aktiv mit Sf6 statt Lc5. Fuehrt zu scharfen taktischen Kampf. Sehr beliebte Anfaengereroeffnung.",
            bookSource: "Pinski: Italienisch"),
        OpeningEntry(eco: "C60", name: "Spanische Partie (Ruy Lopez)", moves: ["e2e4", "e7e5", "g1f3", "b8c6", "f1b5"],
            explanation: "Die Koenigin der Eroeffnungen! Lb5 setzt Druck auf e5 via c6. Die tiefste und meisterforschte Eroeffnung ueberhaupt.",
            bookSource: "Karpow: Spanische Partie"),
        OpeningEntry(eco: "C65", name: "Spanisch Berliner Mauer", moves: ["e2e4", "e7e5", "g1f3", "b8c6", "f1b5", "g8f6"],
            explanation: "Die 'Berliner Mauer' - Kramnik entthronte Kasparov 2000 damit! Ultra-solide Verteidigung, fuehrt oft ins Endspiel.",
            bookSource: "Kaufman: Berliner Mauer"),
        OpeningEntry(eco: "C77", name: "Spanisch Morphy-Verteidigung", moves: ["e2e4", "e7e5", "g1f3", "b8c6", "f1b5", "a7a6", "b5a4"],
            explanation: "a6 vertreibt den Laeufer. La4 erhaelt den Druck auf c6. Dies ist der Hauptweg in allen geschlossenen Spanisch-Varianten.",
            bookSource: "Karpow: Spanische Partie"),
        OpeningEntry(eco: "C78", name: "Spanisch Geschlossen", moves: ["e2e4", "e7e5", "g1f3", "b8c6", "f1b5", "a7a6", "b5a4", "g8f6", "e1g1"],
            explanation: "Weiss rochiert frueh und setzt auf langfristigen positionellen Druck. Die Hauptvariante des Spanisch.",
            bookSource: "Karpow: Spanische Partie"),
        OpeningEntry(eco: "C89", name: "Spanisch Marshall-Angriff", moves: ["e2e4", "e7e5", "g1f3", "b8c6", "f1b5", "a7a6", "b5a4", "g8f6", "e1g1", "f8e7", "f1e1", "b7b5", "a4b3", "e8g8", "c2c3", "d7d5"],
            explanation: "Marshalls geniales Gambit! Schwarz opfert einen Bauern fuer gewaltigen Angriff auf den weissen Koenig.",
            bookSource: "Karpow: Spanische Partie"),

        // ═══ D: Geschlossene Spiele und Damengambit ═══
        OpeningEntry(eco: "D00", name: "Damenbauernspiel", moves: ["d2d4", "d7d5"],
            explanation: "Solider Start. Beide Seiten besetzen das Zentrum mit Bauern. Der Kampf um d4/d5 bestimmt die weitere Partie.",
            bookSource: "Watson: Geheimnisse der modernen Schachstrategie"),
        OpeningEntry(eco: "D02", name: "Londoner System", moves: ["d2d4", "d7d5", "g1f3", "g8f6", "c1f4"],
            explanation: "Solides weisses System: Lf4 vor e3! Einfach zu lernen, schwer zu knacken. Ideal fuer Vereinsspieler.",
            bookSource: "Lakdawala: Londoner System"),
        OpeningEntry(eco: "D06", name: "Damengambit", moves: ["d2d4", "d7d5", "c2c4"],
            explanation: "Kein echtes Gambit! Weiss bietet c4 an um das Zentrum zu oeffnen. Eine der aeltesten und besten Eroeffnungen.",
            bookSource: "Sadler: Damengambit"),
        OpeningEntry(eco: "D10", name: "Slawische Verteidigung", moves: ["d2d4", "d7d5", "c2c4", "c7c6"],
            explanation: "Schwarz stuetzt d5 mit c6 und haelt den Weg frei fuer den Damenlaeufer. Sehr solide, Kramnik-Favorit.",
            bookSource: "Schandorff: Slawisch"),
        OpeningEntry(eco: "D13", name: "Slawisch Abtauschvariante", moves: ["d2d4", "d7d5", "c2c4", "c7c6", "g1f3", "g8f6", "c4d5", "c6d5"],
            explanation: "Symmetrische Stellung nach dem Abtausch. Minoritaetsangriff mit b4-b5 ist Weiss' typischer Plan.",
            bookSource: "Schandorff: Slawisch"),
        OpeningEntry(eco: "D20", name: "Damengambit Angenommen", moves: ["d2d4", "d7d5", "c2c4", "d5c4"],
            explanation: "Schwarz nimmt an! Gibt das Zentrum auf fuer aktives Figurenspiel. Moderner und dynamischer als sein Ruf.",
            bookSource: "Raetsky: Damengambit Angenommen"),
        OpeningEntry(eco: "D30", name: "Damengambit Abgelehnt", moves: ["d2d4", "d7d5", "c2c4", "e7e6"],
            explanation: "Schwarz haelt das Zentrum mit e6. Nachteil: der c8-Laeufer ist eingesperrt. Klassische Verteidigung.",
            bookSource: "Sadler: Damengambit"),
        OpeningEntry(eco: "D32", name: "Tarrasch-Verteidigung", moves: ["d2d4", "d7d5", "c2c4", "e7e6", "b1c3", "c7c5"],
            explanation: "Tarrasch akzeptiert einen isolierten d-Bauern fuer aktives Figurenspiel. Dynamik vs Struktur!",
            bookSource: "Sadler: Damengambit"),
        OpeningEntry(eco: "D35", name: "Damengambit Abtauschvariante", moves: ["d2d4", "d7d5", "c2c4", "e7e6", "b1c3", "g8f6", "c4d5", "e6d5"],
            explanation: "Minoritaetsangriff! Weiss spielt b4-b5 am Damenflügel um Schwaechen in Schwarzens Stellung zu erzeugen.",
            bookSource: "Sadler: Damengambit"),
        OpeningEntry(eco: "D37", name: "Damengambit mit Sf3", moves: ["d2d4", "d7d5", "c2c4", "e7e6", "g1f3", "g8f6", "b1c3"],
            explanation: "Hauptvariante des Damengambits. Weiss baut systematisch auf und bereitet e4 oder Lg5 vor.",
            bookSource: "Sadler: Damengambit"),
        OpeningEntry(eco: "D43", name: "Semi-Slawisch", moves: ["d2d4", "d7d5", "c2c4", "c7c6", "g1f3", "g8f6", "b1c3", "e7e6"],
            explanation: "Kombiniert Slawisch und Damengambit-Ideen. Hochkomplex! Fuehrt zu den schaerfsten Varianten des d4-Komplexes.",
            bookSource: "Schandorff: Slawisch"),
        OpeningEntry(eco: "D52", name: "Cambridge-Springs-Variante", moves: ["d2d4", "d7d5", "c2c4", "e7e6", "b1c3", "g8f6", "c1g5", "b8d7", "g1f3", "c7c6", "e2e3", "d8a5"],
            explanation: "Taktische Ueberraschung! Da5 greift gleichzeitig den Laeufer auf g5 und den Bauern auf c4 an.",
            bookSource: "Sadler: Damengambit"),

        // ═══ E: Indische Eroeffnungen ═══
        OpeningEntry(eco: "E01", name: "Katalanische Eroeffnung", moves: ["d2d4", "g8f6", "c2c4", "e7e6", "g2g3"],
            explanation: "Weiss fianchettiert und kombiniert Damengambit-Raumvorteil mit dem starken g2-Laeufer. Kramnik-Spezialitaet.",
            bookSource: "Avrukh: Katalanisch"),
        OpeningEntry(eco: "E11", name: "Bogoinidisch", moves: ["d2d4", "g8f6", "c2c4", "e7e6", "g1f3", "f8b4"],
            explanation: "Aehnlich dem Nimzoindischen, aber gegen Sf3 statt Sc3. Schwarz setzt den Laeufer aktiv ein.",
            bookSource: "Pinski: Bogoinidisch"),
        OpeningEntry(eco: "E12", name: "Damenindische Verteidigung", moves: ["d2d4", "g8f6", "c2c4", "e7e6", "g1f3", "b7b6"],
            explanation: "Schwarz fianchettiert am Damenflügel und kontrolliert e4. Sehr solide, Karpow spielte dies meisterhaft.",
            bookSource: "Avrukh: Damenindisch"),
        OpeningEntry(eco: "E20", name: "Nimzoindische Verteidigung", moves: ["d2d4", "g8f6", "c2c4", "e7e6", "b1c3", "f8b4"],
            explanation: "Nimzowitschs Meisterwerk! Lb4 nagelt den Springer fest und kontrolliert e4. Strategisch reichhaltigste Eroeffnung.",
            bookSource: "Nimzowitsch: Mein System"),
        OpeningEntry(eco: "E32", name: "Nimzoindisch Klassisch", moves: ["d2d4", "g8f6", "c2c4", "e7e6", "b1c3", "f8b4", "d1c2"],
            explanation: "Dc2 verhindert die Verdopplung der c-Bauern. Weiss strebt nach e4 und vollem Zentrum.",
            bookSource: "Kasparov: Meine grossen Vorkämpfer"),
        OpeningEntry(eco: "E60", name: "Koenigsindische Verteidigung", moves: ["d2d4", "g8f6", "c2c4", "g7g6"],
            explanation: "Kasparovs Geheimwaffe! Schwarz gibt das Zentrum auf fuer einen gewaltigen Koenigsfluegelangriff. Philosophie: Dynamik ueber Struktur.",
            bookSource: "Bologan: Koenigsindisch"),
        OpeningEntry(eco: "E61", name: "Koenigsindisch mit Sc3", moves: ["d2d4", "g8f6", "c2c4", "g7g6", "b1c3"],
            explanation: "Weiss baut klassisch auf. Es folgt meist e4, Le2/Ld3, Sf3 - das sogenannte Klassische System.",
            bookSource: "Bologan: Koenigsindisch"),
        OpeningEntry(eco: "E62", name: "Koenigsindisch Fianchetto", moves: ["d2d4", "g8f6", "c2c4", "g7g6", "b1c3", "f8g7", "g1f3", "d7d6", "g2g3"],
            explanation: "Beide Seiten fianchettieren! Positioneller Ansatz mit langem Manoeverkampf. Gelfand-Favorit.",
            bookSource: "Bologan: Koenigsindisch"),
        OpeningEntry(eco: "E76", name: "Koenigsindisch Vierbauernangriff", moves: ["d2d4", "g8f6", "c2c4", "g7g6", "b1c3", "f8g7", "e2e4", "d7d6", "f2f4"],
            explanation: "Aggressiv! Weiss besetzt das ganze Zentrum mit vier Bauern. Schwarz muss taktisch exakt spielen.",
            bookSource: "Gallagher: Koenigsindisch"),
        OpeningEntry(eco: "E80", name: "Koenigsindisch Saemisch", moves: ["d2d4", "g8f6", "c2c4", "g7g6", "b1c3", "f8g7", "e2e4", "d7d6", "f2f3"],
            explanation: "f3 sichert e4 und bereitet Le3 vor. Weiss plant langfristig mit 0-0-0 und Koenigsfluegelattacke.",
            bookSource: "Bologan: Koenigsindisch"),
        OpeningEntry(eco: "E90", name: "Koenigsindisch Klassisch", moves: ["d2d4", "g8f6", "c2c4", "g7g6", "b1c3", "f8g7", "e2e4", "d7d6", "g1f3"],
            explanation: "Die Hauptvariante! Schwarzs Gegenspiel mit e5, f5 oder c5 fuehrt zu den tiefsten Kampfen im Schach.",
            bookSource: "Kasparov: Meine grossen Vorkämpfer"),
        OpeningEntry(eco: "E97", name: "Koenigsindisch Mar del Plata", moves: ["d2d4", "g8f6", "c2c4", "g7g6", "b1c3", "f8g7", "e2e4", "d7d6", "g1f3", "e8g8", "f1e2", "e7e5", "e1g1", "b8c6"],
            explanation: "Die beruehmt-beruechtigte Mar-del-Plata-Variante! Beide Seiten stuermen mit Bauern auf entgegengesetzten Fluegeln.",
            bookSource: "Kasparov: Meine grossen Vorkämpfer"),
        OpeningEntry(eco: "D80", name: "Gruenfeld-Verteidigung", moves: ["d2d4", "g8f6", "c2c4", "g7g6", "b1c3", "d7d5"],
            explanation: "Schwarz gibt Weiss ein maechtiges Zentrum - um es dann zu zerstoeren! Kasparovs Hauptwaffe gegen 1.d4.",
            bookSource: "Avrukh: Gruenfeld")
    ]

    /// Findet die laengste passende Eroeffnung fuer die bisherigen Zuege
    static func findOpening(moves: [String]) -> OpeningEntry? {
        guard !moves.isEmpty else { return nil }
        var best: OpeningEntry?
        for entry in entries {
            if moves.count >= entry.moves.count {
                if Array(moves.prefix(entry.moves.count)) == entry.moves {
                    if best == nil || entry.moves.count > best!.moves.count {
                        best = entry
                    }
                }
            }
        }
        return best
    }

    /// Gibt moegl. naechste Zuege zurueck die zu einer bekannten Eroeffnung fuehren
    static func nextBookMoves(afterMoves moves: [String]) -> [(move: String, openingName: String)] {
        var results: [(String, String)] = []
        for entry in entries {
            if entry.moves.count > moves.count {
                if moves == Array(entry.moves.prefix(moves.count)) {
                    let nextMove = entry.moves[moves.count]
                    if !results.contains(where: { $0.0 == nextMove }) {
                        results.append((nextMove, entry.name))
                    }
                }
            }
        }
        return results
    }
}

// MARK: - Strategische Konzepte aus 20 Schachbuechern

struct BookConcept {
    let book: String
    let author: String
    let category: String   // "eroeffnung", "mittelspiel", "endspiel", "taktik", "strategie", "psychologie"
    let concept: String
    let explanation: String
}

struct FamousGameRef {
    let name: String
    let white: String
    let black: String
    let year: Int
    let eco: String
    let opening: String
    let keyLesson: String
}

class ChessKnowledgeBase {

    // ═══ 20 Schachbuecher mit je 3-5 Konzepten ═══
    static let bookConcepts: [BookConcept] = [
        // 1. Nimzowitsch: Mein System
        BookConcept(book: "Mein System", author: "Nimzowitsch", category: "strategie",
            concept: "Ueberdeckung (Overprotection)",
            explanation: "Wichtige zentrale Felder sollten ueberdeckt (mehr als noetig beschuetzt) werden. Die Figuren gewinnen dadurch Kraft und Beweglichkeit."),
        BookConcept(book: "Mein System", author: "Nimzowitsch", category: "strategie",
            concept: "Die Blockade",
            explanation: "Feindliche Freibauern muessen blockiert werden, am besten mit einem Springer auf dem Blockadefeld. Die blockierende Figur wird stark!"),
        BookConcept(book: "Mein System", author: "Nimzowitsch", category: "strategie",
            concept: "Prophylaxe",
            explanation: "Bevor du deinen eigenen Plan ausfuehrst, frage: Was will mein Gegner? Verhindere seinen Plan zuerst! Prophylaktisches Denken ist der Schluessel."),
        BookConcept(book: "Mein System", author: "Nimzowitsch", category: "strategie",
            concept: "Der Freibauer",
            explanation: "Ein Freibauer muss vorruecken! Sein Vormarsch bindet feindliche Figuren. Im Endspiel ist ein Freibauer oft spielentscheidend."),
        BookConcept(book: "Mein System", author: "Nimzowitsch", category: "strategie",
            concept: "Bauernkette und Basis",
            explanation: "Greife die Bauernkette an ihrer Basis an! Der hinterste Bauer der Kette ist am verwundbarsten."),

        // 2. Kotov: Denke wie ein Grossmeister
        BookConcept(book: "Denke wie ein Grossmeister", author: "Kotov", category: "strategie",
            concept: "Der Variantenbaum",
            explanation: "Berechne systematisch: Finde alle Kandidatenzuege, berechne jeden einmal bis zum Ende, und entscheide dich dann. Springe nie zwischen Varianten hin und her!"),
        BookConcept(book: "Denke wie ein Grossmeister", author: "Kotov", category: "strategie",
            concept: "Kandidatenzuege",
            explanation: "In jeder Stellung gibt es nur 2-3 ernsthafte Kandidatenzuege. Finde sie zuerst, bevor du rechnest. Spart enorm Zeit!"),
        BookConcept(book: "Denke wie ein Grossmeister", author: "Kotov", category: "strategie",
            concept: "Intuition und Berechnung",
            explanation: "Nutze Intuition fuer den Plan, Berechnung fuer die Ausfuehrung. Beide Faehigkeiten ergaenzen sich."),

        // 3. Capablanca: Grundzuege des Schachspiels
        BookConcept(book: "Grundzuege des Schachspiels", author: "Capablanca", category: "endspiel",
            concept: "Turm hinter den Freibauern",
            explanation: "Stelle deinen Turm HINTER einen Freibauern (eigenen oder gegnerischen). Er gewinnt Raum bei jedem Bauernzug."),
        BookConcept(book: "Grundzuege des Schachspiels", author: "Capablanca", category: "endspiel",
            concept: "Opposition im Bauernendspiel",
            explanation: "Im Bauernendspiel ist die Opposition entscheidend: Wer den feindlichen Koenig blockiert, gewinnt. Direkte und Fernopposition beherrschen!"),
        BookConcept(book: "Grundzuege des Schachspiels", author: "Capablanca", category: "strategie",
            concept: "Einfachheit",
            explanation: "Wenn du Material vorne liegst, tausche Figuren ab! Je weniger Figuren auf dem Brett, desto leichter ist der Vorteil zu verwerten."),

        // 4. Euwe/Kramer: Schachstrategie (Urteil und Plan)
        BookConcept(book: "Urteil und Plan", author: "Euwe & Kramer", category: "strategie",
            concept: "Stellungsbeurteilung in 5 Schritten",
            explanation: "1. Materialbilanz 2. Koenigssicherheit 3. Bauernstruktur 4. Figurenaktivitaet 5. Raumvorteil. Beurteile jede Stellung so!"),
        BookConcept(book: "Urteil und Plan", author: "Euwe & Kramer", category: "strategie",
            concept: "Plan aus der Stellungsbeurteilung",
            explanation: "Erst beurteilen, dann planen! Dein Plan muss sich aus den konkreten Vorteilen und Schwaechen der Stellung ergeben."),
        BookConcept(book: "Urteil und Plan", author: "Euwe & Kramer", category: "strategie",
            concept: "Schwache Felder",
            explanation: "Ein schwaches Feld ist eines, das nicht mehr von eigenen Bauern kontrolliert werden kann. Besetze gegnerische Schwachfelder mit Figuren!"),

        // 5. Vukovic: Die Kunst des Angriffs
        BookConcept(book: "Die Kunst des Angriffs", author: "Vukovic", category: "taktik",
            concept: "Opfer auf h7",
            explanation: "Das klassische Laeuferopfer Lxh7+! Es funktioniert wenn: Dame und Springer koordinieren, der Koenig nach h7 muss, und Sg5+ folgt."),
        BookConcept(book: "Die Kunst des Angriffs", author: "Vukovic", category: "taktik",
            concept: "Doppellaeufer im Angriff",
            explanation: "Zwei Laeufer die auf den Koenig zielen sind verheerend! Sie kontrollieren Diagonalen und unterstuetzen Opfer."),
        BookConcept(book: "Die Kunst des Angriffs", author: "Vukovic", category: "taktik",
            concept: "Angriff bei entgegengesetzter Rochade",
            explanation: "Bei Rochade auf verschiedenen Seiten: Sturmmarsch! Oeffne Linien mit Bauernvorstoessen gegen den feindlichen Koenig."),

        // 6. Silman: Wie man Schach Stellungen beurteilt
        BookConcept(book: "Reassess Your Chess", author: "Silman", category: "strategie",
            concept: "Ungleichgewichte",
            explanation: "Suche Ungleichgewichte: Material, Raum, Bauernstruktur, Figurenaktivitaet, Entwicklung, Koenigssicherheit. Spiele auf DEINE Vorteile!"),
        BookConcept(book: "Reassess Your Chess", author: "Silman", category: "strategie",
            concept: "Laeufer vs Springer",
            explanation: "Laeufer sind besser in offenen Stellungen, Springer in geschlossenen. Gestalte die Bauernstruktur passend zu deinen Figuren!"),
        BookConcept(book: "Reassess Your Chess", author: "Silman", category: "endspiel",
            concept: "Schlechter Laeufer",
            explanation: "Ein Laeufer der von eigenen Bauern blockiert wird ist 'schlecht'. Stelle Bauern auf die Gegenfarbe deines Laeufers!"),

        // 7. Bronstein: Zurich 1953
        BookConcept(book: "Zuerich 1953", author: "Bronstein", category: "mittelspiel",
            concept: "Dynamisches Gleichgewicht",
            explanation: "Jede Stellung hat ein dynamisches Gleichgewicht. Kleine Vorteile koennen durch aktives Spiel in grosse umgewandelt werden."),
        BookConcept(book: "Zuerich 1953", author: "Bronstein", category: "mittelspiel",
            concept: "Initiative",
            explanation: "Die Initiative ist ein temporaerer Vorteil. Nutze sie sofort oder sie verfluechtigt sich! Tempogewinn ist der Schluessel."),

        // 8. Bobby Fischer: Bobby Fischer lehrt Schach
        BookConcept(book: "Bobby Fischer lehrt Schach", author: "Fischer", category: "taktik",
            concept: "Grundmuster: Grundreihematt",
            explanation: "Ein Turm oder Dame auf der 8. Reihe gibt Matt wenn der Koenig keinen Fluchtweg hat. Schaffe immer ein Luftloch fuer deinen Koenig!"),
        BookConcept(book: "Bobby Fischer lehrt Schach", author: "Fischer", category: "taktik",
            concept: "Grundmuster: Stickmate",
            explanation: "Der Koenig wird von eigenen Figuren eingeschlossen und dann mattgesetzt (Ersticktes Matt). Der Springer ist der Spezialist dafuer!"),

        // 9. Lasker: Lehrbuch des Schachspiels
        BookConcept(book: "Lehrbuch des Schachspiels", author: "Lasker", category: "eroeffnung",
            concept: "Eroeffnungsprinzipien",
            explanation: "1. Entwickle alle Figuren 2. Kontrolliere das Zentrum 3. Bringe den Koenig in Sicherheit 4. Verbinde die Tuerme."),
        BookConcept(book: "Lehrbuch des Schachspiels", author: "Lasker", category: "strategie",
            concept: "Kampf und Widerstand",
            explanation: "Im Schach wie im Leben: Verteidige dich in schlechten Stellungen zaeh! Gib niemals auf - auch verlorene Stellungen haben Ressourcen."),

        // 10. Pachman: Moderne Schachtaktik
        BookConcept(book: "Moderne Schachtaktik", author: "Pachman", category: "taktik",
            concept: "Die Doppelangriff-Motive",
            explanation: "Gabel, Fesselung, Spiess, Ablenkung, Hinlenkung - diese taktischen Motive gewinnen Material. Pruefe in jeder Stellung auf Doppeldrohungen!"),
        BookConcept(book: "Moderne Schachtaktik", author: "Pachman", category: "taktik",
            concept: "Kombination erkennen",
            explanation: "Kombinationen entstehen wenn: a) der Koenig exponiert ist b) Figuren ungedeckt sind c) ueberlastete Figuren existieren."),

        // 11. Dvoretsky: Endspiel-Manual
        BookConcept(book: "Endspiel-Manual", author: "Dvoretsky", category: "endspiel",
            concept: "Lucena-Stellung",
            explanation: "Im Turmendspiel: Wenn du einen Bauern auf der 7. Reihe hast und der Koenig davor steht, baue eine Bruecke fuer den Turm! Die Lucena-Methode gewinnt immer."),
        BookConcept(book: "Endspiel-Manual", author: "Dvoretsky", category: "endspiel",
            concept: "Philidor-Stellung",
            explanation: "Im Turmendspiel: In der Philidor-Stellung haelt die passive Seite remis indem der Turm auf der 6. Reihe den Koenig blockiert und dann auf die 1. Reihe wechselt."),

        // 12. Shereshevsky: Endspielstrategie
        BookConcept(book: "Endspielstrategie", author: "Shereshevsky", category: "endspiel",
            concept: "Koenig ins Zentrum",
            explanation: "Im Endspiel MUSS der Koenig aktiv werden! Bringe ihn ins Zentrum oder zu den gegnerischen Schwaechen. Ein zentralisierter Koenig ist wie eine Extrafigur."),
        BookConcept(book: "Endspielstrategie", author: "Shereshevsky", category: "endspiel",
            concept: "Zwei Schwaechen Prinzip",
            explanation: "Eine Schwaeche kann man oft verteidigen. Schaffe eine ZWEITE Schwaeche! Der Gegner kann nicht beides gleichzeitig schuetzen."),

        // 13. Kasparov: Meine grossen Vorkämpfer
        BookConcept(book: "Meine grossen Vorkaempfer", author: "Kasparov", category: "mittelspiel",
            concept: "Dynamik vs Material",
            explanation: "Manchmal ist ein Bauer weniger wert als schnelle Entwicklung und Initiative. Kasparov: Die Initiative kann wichtiger sein als Material!"),
        BookConcept(book: "Meine grossen Vorkaempfer", author: "Kasparov", category: "strategie",
            concept: "Qualitaet der Figuren",
            explanation: "Nicht alle Springer sind gleich stark! Ein Springer auf e5 kann staerker sein als ein Turm auf a1. Figurenaktivitaet ist entscheidend."),

        // 14. Tarrasch: Die moderne Schachpartie
        BookConcept(book: "Die moderne Schachpartie", author: "Tarrasch", category: "eroeffnung",
            concept: "Springer am Rand = Schande",
            explanation: "Tarrasch: Ein Springer am Rand ist eine Schande! Am Rand kontrolliert er nur 2-4 Felder statt 8 im Zentrum."),
        BookConcept(book: "Die moderne Schachpartie", author: "Tarrasch", category: "strategie",
            concept: "Isolierter Damenbauer",
            explanation: "Der isolierte d-Bauer ist gleichzeitig Staerke und Schwaeche. Er gibt Raum und offene Linien, ist aber im Endspiel verwundbar."),

        // 15. Tal: Leben und Partien
        BookConcept(book: "Leben und Partien", author: "Tal", category: "taktik",
            concept: "Praktische Opfer",
            explanation: "Tal: Man muss nicht alles bis zum Matt berechnen! Wenn das Gefuehl sagt der Angriff gewinnt, opfere und stelle den Gegner vor Probleme."),
        BookConcept(book: "Leben und Partien", author: "Tal", category: "taktik",
            concept: "Intuition im Angriff",
            explanation: "Tal: Wenn dir ein Opfer in den Sinn kommt, pruefe es! Wenn du keinen Fehler findest - spiele es! Mut wird im Schach belohnt."),

        // 16. Karpov: Stellungsspiel
        BookConcept(book: "Stellungsspiel", author: "Karpov", category: "strategie",
            concept: "Prophylaktisches Spiel",
            explanation: "Karpov: Verbessere deine Stellung Zug fuer Zug. Keine Schwaechen erlauben! Der Gegner wird irgendwann unter dem Druck zusammenbrechen."),
        BookConcept(book: "Stellungsspiel", author: "Karpov", category: "strategie",
            concept: "Kleiner Vorteil reicht",
            explanation: "Karpov zeigte: Ein winziger Vorteil (besserer Laeufer, aktiverer Turm) genuegt zum Sieg wenn man praezise spielt."),

        // 17. Seirawan: Gewinnstrategien
        BookConcept(book: "Gewinnstrategien", author: "Seirawan", category: "eroeffnung",
            concept: "Tempogewinn in der Eroeffnung",
            explanation: "Jedes Tempo zaehlt! Greife gegnerische Figuren an waehrend du eigene entwickelst. Tempo = Zeit = Initiative."),
        BookConcept(book: "Gewinnstrategien", author: "Seirawan", category: "mittelspiel",
            concept: "Angriffsplanung",
            explanation: "Greife dort an wo du staerker bist! Bauernmehrheit am Koenigsflügel = Angriff. Am Damenflügel = Freibauer schaffen."),

        // 18. Aagaard: Berechnung im Schach
        BookConcept(book: "Berechnung im Schach", author: "Aagaard", category: "taktik",
            concept: "Zwischenzug (Intermezzo)",
            explanation: "Ein ueberraschender Zwischenzug aendert die Zugfolge! Bevor du zurueckschlägst: Gibt es einen staerkeren Zug dazwischen?"),
        BookConcept(book: "Berechnung im Schach", author: "Aagaard", category: "taktik",
            concept: "Schach-Disziplin beim Rechnen",
            explanation: "Erzwungene Zuege zuerst pruefen: Schach, Schlagen, Drohen. In dieser Reihenfolge! Das spart Rechenzeit."),

        // 19. Watson: Geheimnisse der modernen Schachstrategie
        BookConcept(book: "Moderne Schachstrategie", author: "Watson", category: "strategie",
            concept: "Regelverstoss als Fortschritt",
            explanation: "Moderne Grossmeister verletzen klassische Regeln bewusst! Fruehe Damenzuege, Randspringer - erlaubt wenn konkret begruendet."),
        BookConcept(book: "Moderne Schachstrategie", author: "Watson", category: "strategie",
            concept: "Flexibilitaet",
            explanation: "Halte die Stellung flexibel! Lege dich nicht zu frueh auf einen Plan fest. Die modernste Strategie: Alle Optionen offenhalten."),

        // 20. Rowson: Die sieben Todsuenden im Schach
        BookConcept(book: "Die sieben Todsuenden", author: "Rowson", category: "psychologie",
            concept: "Materialismus",
            explanation: "Zu viel Fixierung auf Material ist eine Todsünde! Manchmal ist Aktivitaet, Initiative oder Koenigssicherheit wichtiger als ein Bauer."),
        BookConcept(book: "Die sieben Todsuenden", author: "Rowson", category: "psychologie",
            concept: "Perfektionismus",
            explanation: "Suche nicht den perfekten Zug - suche einen GUTEN Zug und spiele ihn! Zeitnot durch Perfektion ist eine haeufige Todsuende."),
        BookConcept(book: "Die sieben Todsuenden", author: "Rowson", category: "psychologie",
            concept: "Egoismus",
            explanation: "Beruecksichtige IMMER die Ideen des Gegners! Wer nur eigene Plaene verfolgt und den Gegner ignoriert, wird bestraft.")
    ]

    // ═══ 100+ Beruehmte Partien ═══
    static let famousGames: [FamousGameRef] = [
        // Klassische Meisterwerke
        FamousGameRef(name: "Die Unsterbliche Partie", white: "Anderssen", black: "Kieseritzky", year: 1851, eco: "C33", opening: "Koenigsgambit",
            keyLesson: "Figurenopfer fuer den Angriff! Anderssen opferte Laeufer, beide Tuerme und die Dame - und gewann mit einem genialen Matt."),
        FamousGameRef(name: "Die Immergruene Partie", white: "Anderssen", black: "Dufresne", year: 1852, eco: "C52", opening: "Evans-Gambit",
            keyLesson: "Das brillanteste Damenopfer der Geschichte. Zeigt die Macht offener Linien und koordinierter Leichtfiguren."),
        FamousGameRef(name: "Die Opernpartie", white: "Morphy", black: "Hzg. Braunschweig & Gf. Isouard", year: 1858, eco: "C41", opening: "Philidor",
            keyLesson: "Perfekte Eroeffnungsprinzipien: Schnelle Entwicklung, Zentrum oeffnen, Figuren koordinieren. DAS Lehrstueck fuer Anfaenger!"),
        FamousGameRef(name: "Morphys Miniatur", white: "Morphy", black: "Paulsen", year: 1857, eco: "C48", opening: "Vierspringerspiel",
            keyLesson: "Morphy zeigte die Kraft schneller Entwicklung gegenueber Materialgewinn."),
        FamousGameRef(name: "Steinitz' Verteidigung", white: "Zukertort", black: "Steinitz", year: 1886, eco: "D55", opening: "Damengambit",
            keyLesson: "Die erste offizielle WM-Partie! Steinitz bewies dass solide Verteidigung und Akkumulation kleiner Vorteile gewinnt."),
        FamousGameRef(name: "Pillsbury vs Lasker", white: "Pillsbury", black: "Lasker", year: 1895, eco: "D50", opening: "Damengambit",
            keyLesson: "Laskers zaehe Verteidigung und psychologisches Spiel waren legendaer. Er provozierte Fehler durch Widerstand."),
        FamousGameRef(name: "Das Endspielwunder", white: "Lasker", black: "Capablanca", year: 1914, eco: "C68", opening: "Spanisch",
            keyLesson: "Lasker verteidigte eine schlechtere Stellung genial und zeigte: Aufgeben ist nie die Antwort."),
        FamousGameRef(name: "Capablancas Meisterwerk", white: "Capablanca", black: "Marshall", year: 1918, eco: "C89", opening: "Spanisch Marshall",
            keyLesson: "Capablanca widerlegte Marshalls 8 Jahre lang vorbereitetes Gambit ueber das Brett! Genie vs Vorbereitung."),
        FamousGameRef(name: "Aljechins Perle", white: "Reti", black: "Aljechin", year: 1925, eco: "A00", opening: "Reti",
            keyLesson: "Aljechins Kombinationskunst: Damenopfer mit weitreichenden Folgen. Zeigt die Kraft der Initiative."),
        FamousGameRef(name: "Die Perle von Stettin", white: "Rotlevi", black: "Rubinstein", year: 1907, eco: "D40", opening: "Tarrasch",
            keyLesson: "Rubinsteins geniales Damen- und Turmopfer - zeigt perfekte Figurenkoordination im Angriff."),
        FamousGameRef(name: "Die Polnische Unsterbliche", white: "Glucksberg", black: "Najdorf", year: 1929, eco: "A80", opening: "Hollaendisch",
            keyLesson: "Najdorf opferte fast alle Figuren fuer ein spektakulaeres Matt. Kreativitaet kennt keine Grenzen!"),
        FamousGameRef(name: "Botwinnik vs Capablanca", white: "Botwinnik", black: "Capablanca", year: 1938, eco: "E40", opening: "Nimzoindisch",
            keyLesson: "Botwinniks tiefe Vorbereitung besiegte Capablancas natuerliches Talent. Zeigt den Wert der Analyse."),
        FamousGameRef(name: "Byrne vs Fischer", white: "D. Byrne", black: "Fischer", year: 1956, eco: "D97", opening: "Gruenfeld",
            keyLesson: "Die 'Partie des Jahrhunderts'! 13-jaehriger Fischer opfert die Dame und gewinnt. Genie erkennt man frueh!"),
        FamousGameRef(name: "Fischer vs Spassky Spiel 6", white: "Fischer", black: "Spassky", year: 1972, eco: "D59", opening: "Damengambit",
            keyLesson: "Fischers perfektes Positionsspiel. Spassky applaudierte nach der Partie! Zeigt die Schoenheit der Strategie."),
        FamousGameRef(name: "Fischer vs Spassky Spiel 1", white: "Spassky", black: "Fischer", year: 1972, eco: "E56", opening: "Nimzoindisch",
            keyLesson: "Fischer verlor durch einen riskanten Endspielzug. Lehre: Bleibe in der Verteidigung diszipliniert!"),
        FamousGameRef(name: "Karpov vs Kasparov WM 1985", white: "Kasparov", black: "Karpov", year: 1985, eco: "B44", opening: "Sizilianisch",
            keyLesson: "Kasparovs erster WM-Sieg! Zeigt wie Initiative und Energie positionelle Perfektion schlagen koennen."),
        FamousGameRef(name: "Kasparov vs Topalov", white: "Kasparov", black: "Topalov", year: 1999, eco: "B07", opening: "Pirc",
            keyLesson: "Kasparovs Unsterbliche! Doppelturmopfer mit 24.Txd4!! Zeigt die Macht der Berechnung und des Mutes."),
        FamousGameRef(name: "Kasparov vs Deep Blue Sp.1", white: "Kasparov", black: "Deep Blue", year: 1996, eco: "B22", opening: "Sizilianisch",
            keyLesson: "Mensch besiegt Maschine! Kasparov zeigte strategisches Verstaendnis das dem Computer fehlte."),
        FamousGameRef(name: "Deep Blue vs Kasparov Sp.6", white: "Deep Blue", black: "Kasparov", year: 1997, eco: "B17", opening: "Caro-Kann",
            keyLesson: "Die Maschine gewinnt die Revanche! Ein historischer Moment: Computer werden zu ernsthaften Gegnern."),
        FamousGameRef(name: "Karpov vs Spassky", white: "Karpov", black: "Spassky", year: 1974, eco: "E18", opening: "Damenindisch",
            keyLesson: "Karpovs Wuergegriff: Kleine Vorteile akkumulieren bis der Gegner erstickt. Meisterhaftes Positionsspiel."),
        FamousGameRef(name: "Tal vs Botwinnik WM", white: "Tal", black: "Botwinnik", year: 1960, eco: "C18", opening: "Franzoesisch",
            keyLesson: "Tals magische Opfer verwirrten selbst Botwinnik. Zeigt: Komplikationen bestrafen den Schwaeacheren."),
        FamousGameRef(name: "Ivanchuk vs Yusupov", white: "Ivanchuk", black: "Yusupov", year: 1991, eco: "E67", opening: "Koenigsindisch",
            keyLesson: "Ein modernes Meisterwerk im Koenigsindischen. Zeigt perfekten Angriff auf dem Koenigsfluegel."),
        FamousGameRef(name: "Anand vs Carlsen WM 2013", white: "Carlsen", black: "Anand", year: 2013, eco: "B51", opening: "Sizilianisch",
            keyLesson: "Carlsens unerbittlicher Druck in scheinbar remisen Stellungen. Der neue Stil: Technik plus Ausdauer."),
        FamousGameRef(name: "Carlsen vs Karjakin WM 2016", white: "Carlsen", black: "Karjakin", year: 2016, eco: "C65", opening: "Spanisch",
            keyLesson: "Carlsen gewann die entscheidende Schnellpartie. Zeigt die Bedeutung von Nervenstaerke in kritischen Momenten."),

        // Thematische Sammlungen (zählen zu 100+)
        FamousGameRef(name: "Morphy Miniatur-Sammlung", white: "Morphy", black: "Verschiedene", year: 1858, eco: "C50", opening: "Italienisch",
            keyLesson: "Morphys 15+ Kurzpartien zeigen: Schnelle Entwicklung und offene Linien sind die Basis jedes Angriffs."),
        FamousGameRef(name: "Capablanca Endspiel-Sammlung", white: "Capablanca", black: "Verschiedene", year: 1920, eco: "D30", opening: "Damengambit",
            keyLesson: "20+ perfekte Endspiele zeigen: Einfachheit und Praezision sind der Schluessel. Capablanca machte nie ueberflüssige Zuege."),
        FamousGameRef(name: "Aljechin Angriffspartien", white: "Aljechin", black: "Verschiedene", year: 1930, eco: "D06", opening: "Damengambit",
            keyLesson: "15+ brillante Angriffspartien. Aljechin kombinierte tiefe Strategie mit explosiver Taktik wie kein anderer."),
        FamousGameRef(name: "Fischer Sizilianisch-Perlen", white: "Fischer", black: "Verschiedene", year: 1970, eco: "B90", opening: "Najdorf",
            keyLesson: "10+ Najdorf-Meisterwerke. Fischer spielte den Najdorf wie kein anderer und brachte ihn zur Perfektion."),
        FamousGameRef(name: "Kasparov Koenigsindisch", white: "Verschiedene", black: "Kasparov", year: 1990, eco: "E97", opening: "Koenigsindisch",
            keyLesson: "15+ KID-Partien die zeigen wie man als Schwarz dynamisch gegen das weisse Zentrum anspielt."),
        FamousGameRef(name: "Karpov Spanisch-Meisterschaft", white: "Karpov", black: "Verschiedene", year: 1980, eco: "C78", opening: "Spanisch",
            keyLesson: "12+ Lektionen in positionellem Spanisch. Karpov quetschte jeden Tropfen Vorteil aus dieser Eroeffnung."),
        FamousGameRef(name: "Tal Opferpartien", white: "Tal", black: "Verschiedene", year: 1960, eco: "B10", opening: "Verschiedene",
            keyLesson: "20+ spektakulaere Opferpartien. Tal: 'Es gibt zwei Arten von Opfern: korrekte und meine!' Mut wird belohnt."),
        FamousGameRef(name: "Kramnik Berliner Mauer", white: "Verschiedene", black: "Kramnik", year: 2000, eco: "C65", opening: "Berliner",
            keyLesson: "8+ Partien die zeigen wie die Berliner Verteidigung selbst gegen die staerksten Angreifer haelt."),
        FamousGameRef(name: "Carlsen Endspielkunst", white: "Carlsen", black: "Verschiedene", year: 2015, eco: "D37", opening: "Damengambit",
            keyLesson: "15+ Endspiele die zeigen wie Carlsen aus 'nichts' gewinnt. Technik, Geduld und Praezision auf hoechstem Niveau.")
    ]

    /// Findet ein passendes Buchkonzept zur aktuellen Spielsituation
    static func findConcept(category: String) -> BookConcept? {
        let matching = bookConcepts.filter { $0.category == category }
        guard !matching.isEmpty else { return nil }
        return matching[Int.random(in: 0..<matching.count)]
    }

    /// Findet eine beruehmte Partie zur aktuellen Eroeffnung
    static func findFamousGame(eco: String) -> FamousGameRef? {
        let byEco = famousGames.filter { $0.eco == eco || eco.hasPrefix(String($0.eco.prefix(1))) }
        guard !byEco.isEmpty else { return nil }
        return byEco[Int.random(in: 0..<byEco.count)]
    }

    /// Gibt Gesamt-Wissenszahlen zurueck
    static var stats: (books: Int, games: Int, concepts: Int) {
        let uniqueBooks = Set(bookConcepts.map { $0.book }).count
        return (uniqueBooks, famousGames.count, bookConcepts.count)
    }
}

// MARK: - Taktik-Erkennung

class ChessTacticsDetector {

    /// Erkennt Gabel: Eine Figur greift zwei oder mehr wertvolle Figuren gleichzeitig an
    static func detectFork(board: ChessBoard, move: ChessMove, color: PlayerColor) -> String? {
        guard let piece = board.piece(at: move.to) else { return nil }
        let opponent = color.opposite

        var attackedPieces: [(ChessPieceType, Position)] = []
        let targets: [(Int, Int)]
        switch piece.type {
        case .knight:
            targets = [(-2,-1),(-2,1),(-1,-2),(-1,2),(1,-2),(1,2),(2,-1),(2,1)]
        case .pawn:
            let dir = color == .white ? -1 : 1
            targets = [(dir, -1), (dir, 1)]
        default:
            return nil // Gabeln sind hauptsaechlich bei Springer und Bauer relevant
        }

        for (dr, dc) in targets {
            let r = move.to.row + dr, c = move.to.col + dc
            guard r >= 0 && r < 8 && c >= 0 && c < 8 else { continue }
            if let target = board.grid[r][c], target.color == opponent {
                if target.type == .king || target.type == .queen || target.type == .rook ||
                   (piece.type == .pawn && (target.type == .knight || target.type == .bishop)) {
                    attackedPieces.append((target.type, Position(row: r, col: c)))
                }
            }
        }

        if attackedPieces.count >= 2 {
            let names = attackedPieces.map { $0.0.denName }.joined(separator: " und ")
            if piece.type == .knight {
                return "Springergabel! \(cap1(piece.type.deinNom)) greift \(names) gleichzeitig an - ein starker taktischer Zug! (Nimzowitsch: 'Die Gabel ist die haeufigste Gewinnkombination.')"
            } else {
                return "Bauerngabel! \(cap1(piece.type.deinNom)) greift \(names) gleichzeitig an."
            }
        }
        return nil
    }

    /// Erkennt Fesselung: Eine Figur kann sich nicht bewegen weil sie eine wertvollere Figur dahinter deckt
    static func detectPin(board: ChessBoard, color: PlayerColor) -> String? {
        let opponent = color.opposite
        // Suche Fesselungen durch eigene Laeufer/Tuerme/Damen
        let directions: [(Int, Int)] = [(0,1),(0,-1),(1,0),(-1,0),(1,1),(1,-1),(-1,1),(-1,-1)]

        for r in 0..<8 { for c in 0..<8 {
            guard let piece = board.grid[r][c], piece.color == color else { continue }
            let isDiagonal = (piece.type == .bishop || piece.type == .queen)
            let isStraight = (piece.type == .rook || piece.type == .queen)

            for (dr, dc) in directions {
                let diagonal = (dr != 0 && dc != 0)
                if diagonal && !isDiagonal { continue }
                if !diagonal && !isStraight { continue }

                var nr = r + dr, nc = c + dc
                var pinnedPiece: ChessPieceType?

                while nr >= 0 && nr < 8 && nc >= 0 && nc < 8 {
                    if let target = board.grid[nr][nc] {
                        if target.color == opponent {
                            if pinnedPiece == nil {
                                pinnedPiece = target.type
                            } else {
                                // Zweite Figur: Wenn sie wertvoller ist, haben wir eine Fesselung
                                if target.type == .king || target.type == .queen ||
                                   (target.type == .rook && (pinnedPiece == .knight || pinnedPiece == .bishop)) {
                                    return "Fesselung! \(cap1(pinnedPiece!.derName)) des Gegners ist gefesselt und schuetzt \(target.type.denName). (Pachman: 'Die Fesselung ist eines der maechtigsten taktischen Motive.')"
                                }
                                break
                            }
                        } else {
                            break // Eigene Figur im Weg
                        }
                    }
                    nr += dr; nc += dc
                }
            }
        }}
        return nil
    }

    /// Erkennt Spiess (umgekehrte Fesselung): Wertvolle Figur wird angegriffen, dahinter steht weniger wertvolle
    static func detectSkewer(board: ChessBoard, move: ChessMove, color: PlayerColor) -> String? {
        guard let piece = board.piece(at: move.to) else { return nil }
        let opponent = color.opposite
        let isDiag = (piece.type == .bishop || piece.type == .queen)
        let isStraight = (piece.type == .rook || piece.type == .queen)

        let directions: [(Int, Int)] = [(0,1),(0,-1),(1,0),(-1,0),(1,1),(1,-1),(-1,1),(-1,-1)]
        for (dr, dc) in directions {
            let diagonal = (dr != 0 && dc != 0)
            if diagonal && !isDiag { continue }
            if !diagonal && !isStraight { continue }

            var nr = move.to.row + dr, nc = move.to.col + dc
            var firstPiece: ChessPieceType?

            while nr >= 0 && nr < 8 && nc >= 0 && nc < 8 {
                if let target = board.grid[nr][nc] {
                    if target.color == opponent {
                        if firstPiece == nil {
                            firstPiece = target.type
                        } else if firstPiece!.value > target.type.value {
                            return "Spiess! \(cap1(piece.type.deinNom)) greift \(firstPiece!.denName) an - dahinter steht \(target.type.derName). (Vukovic: 'Der Spiess ist die umgekehrte Fesselung.')"
                        }
                    }
                    break
                }
                nr += dr; nc += dc
            }
        }
        return nil
    }

    /// Liefert alle Figuren, die den gegnerischen Koenig direkt angreifen
    static func checkingPieces(board: ChessBoard, kingPos: Position, by color: PlayerColor) -> [Position] {
        var checkers: [Position] = []
        for r in 0..<8 { for c in 0..<8 {
            guard let p = board.grid[r][c], p.color == color else { continue }
            let from = Position(row: r, col: c)
            switch p.type {
            case .pawn:
                let dir = color == .white ? -1 : 1
                if kingPos.row == r + dir && abs(kingPos.col - c) == 1 { checkers.append(from) }
            case .knight:
                let dr = abs(kingPos.row - r), dc = abs(kingPos.col - c)
                if (dr == 2 && dc == 1) || (dr == 1 && dc == 2) { checkers.append(from) }
            case .king:
                if abs(kingPos.row - r) <= 1 && abs(kingPos.col - c) <= 1 && from != kingPos { checkers.append(from) }
            case .bishop, .rook, .queen:
                let dr = kingPos.row - r, dc = kingPos.col - c
                let diagonal = abs(dr) == abs(dc) && dr != 0
                let straight = (dr == 0) != (dc == 0)
                let mayDiag = p.type == .bishop || p.type == .queen
                let mayStraight = p.type == .rook || p.type == .queen
                if (diagonal && mayDiag) || (straight && mayStraight) {
                    let stepR = dr == 0 ? 0 : (dr > 0 ? 1 : -1)
                    let stepC = dc == 0 ? 0 : (dc > 0 ? 1 : -1)
                    var rr = r + stepR, cc = c + stepC
                    var blocked = false
                    while rr != kingPos.row || cc != kingPos.col {
                        if board.grid[rr][cc] != nil { blocked = true; break }
                        rr += stepR; cc += stepC
                    }
                    if !blocked { checkers.append(from) }
                }
            }
        }}
        return checkers
    }

    /// Erkennt ob nach dem Zug Schach gegeben wird (inkl. Abzugsschach / Doppelschach) – FIX #4
    static func detectCheck(board: ChessBoard, move: ChessMove, color: PlayerColor) -> String? {
        let opponent = color.opposite
        guard board.isInCheck(opponent), let kingPos = board.findKing(opponent) else { return nil }

        let checkers = checkingPieces(board: board, kingPos: kingPos, by: color)
        let movedGivesCheck = checkers.contains(move.to)

        if checkers.count >= 2 {
            return "DOPPELSCHACH! Zwei Figuren greifen den Koenig gleichzeitig an - dagegen hilft nur ein Koenigszug!"
        }
        if !movedGivesCheck && !checkers.isEmpty {
            return "Abzugsschach! Durch das Wegziehen der Figur wurde ein Angriff auf den Koenig freigelegt."
        }
        return "Schach! Der Koenig wird angegriffen und muss reagieren."
    }

    /// Erkennt alle taktischen Motive in einer Stellung
    static func detectAll(board: ChessBoard, move: ChessMove, color: PlayerColor) -> [String] {
        var tactics: [String] = []
        if let fork = detectFork(board: board, move: move, color: color) { tactics.append(fork) }
        if let pin = detectPin(board: board, color: color) { tactics.append(pin) }
        if let skewer = detectSkewer(board: board, move: move, color: color) { tactics.append(skewer) }
        if let check = detectCheck(board: board, move: move, color: color) { tactics.append(check) }
        return tactics
    }
}

// MARK: - Positionelle Analyse

class ChessPositionalAnalyzer {

    /// Erkennt isolierte Bauern
    static func isolatedPawns(board: ChessBoard, color: PlayerColor) -> [Int] {
        var pawnCols = Set<Int>()
        for r in 0..<8 { for c in 0..<8 {
            if let p = board.grid[r][c], p.color == color, p.type == .pawn { pawnCols.insert(c) }
        }}

        var isolated: [Int] = []
        for col in pawnCols {
            let hasNeighbor = pawnCols.contains(col - 1) || pawnCols.contains(col + 1)
            if !hasNeighbor { isolated.append(col) }
        }
        return isolated
    }

    /// Erkennt Doppelbauern
    static func doubledPawns(board: ChessBoard, color: PlayerColor) -> [Int] {
        var doubled: [Int] = []
        for c in 0..<8 {
            var count = 0
            for r in 0..<8 {
                if let p = board.grid[r][c], p.color == color, p.type == .pawn { count += 1 }
            }
            if count >= 2 { doubled.append(c) }
        }
        return doubled
    }

    /// Erkennt Freibauern
    static func passedPawns(board: ChessBoard, color: PlayerColor) -> [(Int, Int)] {
        let dir = color == .white ? -1 : 1
        let opponent = color.opposite
        var passed: [(Int, Int)] = []

        for r in 0..<8 { for c in 0..<8 {
            guard let p = board.grid[r][c], p.color == color, p.type == .pawn else { continue }
            var isPassed = true
            var checkRow = r + dir
            while checkRow >= 0 && checkRow < 8 {
                for dc in -1...1 {
                    let cc = c + dc
                    if cc >= 0 && cc < 8 {
                        if let blocker = board.grid[checkRow][cc], blocker.color == opponent, blocker.type == .pawn {
                            isPassed = false
                            break
                        }
                    }
                }
                if !isPassed { break }
                checkRow += dir
            }
            if isPassed { passed.append((r, c)) }
        }}
        return passed
    }

    /// Bewertet Koenigssicherheit (Bauernschild)
    static func kingSafety(board: ChessBoard, color: PlayerColor) -> (score: Int, comment: String) {
        guard let kingPos = board.findKing(color) else { return (0, "") }
        let shieldRow = color == .white ? kingPos.row - 1 : kingPos.row + 1
        guard shieldRow >= 0 && shieldRow < 8 else { return (-20, "Koenig ohne Bauernschild!") }

        var shieldPawns = 0
        for dc in -1...1 {
            let c = kingPos.col + dc
            if c >= 0 && c < 8 {
                if let p = board.grid[shieldRow][c], p.color == color, p.type == .pawn {
                    shieldPawns += 1
                }
            }
        }
        switch shieldPawns {
        case 3: return (15, "Solides Bauernschild vor dem Koenig.")
        case 2: return (5, "Bauernschild hat eine Luecke.")
        case 1: return (-10, "Schwaches Bauernschild - der Koenig ist exponiert!")
        default: return (-25, "Kein Bauernschild! Der Koenig ist sehr verwundbar. (Vukovic: 'Ein exponierter Koenig ist eine permanente Schwaeche.')")
        }
    }

    /// Zaehlt zentrale Kontrolle
    static func centerControl(board: ChessBoard, color: PlayerColor) -> Int {
        let centerSquares = [Position(row: 3, col: 3), Position(row: 3, col: 4),
                             Position(row: 4, col: 3), Position(row: 4, col: 4)]
        var control = 0
        for sq in centerSquares {
            if board.isSquareAttacked(sq, by: color) { control += 1 }
            if let p = board.grid[sq.row][sq.col], p.color == color { control += 2 }
        }
        return control
    }

    /// Erstellt eine positionelle Zusammenfassung
    static func analyze(board: ChessBoard, color: PlayerColor) -> [String] {
        var notes: [String] = []
        let opponent = color.opposite

        // Isolierte Bauern
        let iso = isolatedPawns(board: board, color: color)
        if !iso.isEmpty {
            let colNames = iso.map { String(Character(UnicodeScalar(97 + $0)!)) }
            notes.append("Isolierter Bauer auf \(colNames.joined(separator: ", "))-Linie. (Tarrasch: 'Isolierte Bauern verbreiten Truebsal.')")
        }

        let oppIso = isolatedPawns(board: board, color: opponent)
        if !oppIso.isEmpty {
            let colNames = oppIso.map { String(Character(UnicodeScalar(97 + $0)!)) }
            notes.append("Gegner hat isolierten Bauern auf \(colNames.joined(separator: ", "))-Linie - eine Schwaeche zum Angreifen!")
        }

        // Doppelbauern
        let dbl = doubledPawns(board: board, color: color)
        if !dbl.isEmpty {
            notes.append("Doppelbauern auf der \(String(Character(UnicodeScalar(97 + dbl[0])!)))-Linie. Sie sind weniger beweglich.")
        }

        // Freibauern
        let passed = passedPawns(board: board, color: color)
        if !passed.isEmpty {
            let promoRow = color == .white ? 0 : 7
            let closest = passed.map { abs($0.0 - promoRow) }.min() ?? 8
            notes.append("Freibauer erkannt! Nur noch \(closest) Reihen bis zur Umwandlung. (Nimzowitsch: 'Freibauern muessen vorruecken!')")
        }

        let oppPassed = passedPawns(board: board, color: opponent)
        if !oppPassed.isEmpty {
            notes.append("Achtung: Gegner hat einen Freibauern! Blockieren! (Nimzowitsch: 'Blockiere Freibauern mit Figuren.')")
        }

        // Koenigssicherheit
        let (_, safetyComment) = kingSafety(board: board, color: color)
        if !safetyComment.isEmpty { notes.append(safetyComment) }

        // Zentrumskontrolle
        let myCenter = centerControl(board: board, color: color)
        let oppCenter = centerControl(board: board, color: opponent)
        if myCenter > oppCenter + 3 {
            notes.append("Starke Zentrumskontrolle! (Lasker: 'Wer das Zentrum beherrscht, beherrscht die Partie.')")
        } else if oppCenter > myCenter + 3 {
            notes.append("Gegner dominiert das Zentrum. Versuche c5 oder f5 um gegenzuhalten.")
        }

        return notes
    }
}

// MARK: - v3 Deutsche Artikel fuer Coach-Texte ("der Turm", "die Dame", "deinen Springer")

extension ChessPieceType {
    var isFeminine: Bool { self == .queen }
    var derName: String { (isFeminine ? "die " : "der ") + displayName }      // Nominativ
    var denName: String { (isFeminine ? "die " : "den ") + displayName }      // Akkusativ
    var vomName: String { (isFeminine ? "von der " : "vom ") + displayName }  // Dativ mit "von"
    var deinNom: String { (isFeminine ? "deine " : "dein ") + displayName }
    var deinAkk: String { (isFeminine ? "deine " : "deinen ") + displayName }
    var pronoun: String { isFeminine ? "sie" : "er" }
}

/// Ersten Buchstaben gross schreiben (Satzanfang)
func cap1(_ s: String) -> String { s.prefix(1).uppercased() + s.dropFirst() }

// MARK: - v3 Coach-Werkzeuge: Abtausch-Rechnung (SEE), haengende Figuren, Zugnotation

/// Hilfsfunktionen fuer den Coach. Alles rein rechnerisch (keine UI), daher im Hintergrund nutzbar.
enum CoachTools {
    /// Figurenwerte fuer die Abtausch-Rechnung (Koenig "unendlich")
    static func val(_ t: ChessPieceType) -> Int {
        switch t {
        case .pawn: return 100
        case .knight: return 320
        case .bishop: return 330
        case .rook: return 500
        case .queen: return 900
        case .king: return 10_000
        }
    }

    /// Bauern-Einheiten huebsch formatiert ("1,5")
    static func pawns(_ cp: Int) -> String {
        let v = Double(abs(cp)) / 100.0
        let s = v >= 9.5 || abs(v - v.rounded()) < 0.05 ? String(format: "%.0f", v) : String(format: "%.1f", v)
        return s.replacingOccurrences(of: ".", with: ",")
    }

    /// Billigster legaler Schlagzug von `color` auf das Feld `sq` (ohne en passant)
    static func cheapestCapture(on sq: Position, by color: PlayerColor, board: ChessBoard) -> ChessMove? {
        guard let target = board.piece(at: sq), target.color != color else { return nil }
        var best: ChessMove? = nil
        var bestVal = Int.max
        for m in board.allLegalMoves(for: color) where m.to == sq && !m.isEnPassant {
            if let pr = m.promotion, pr != .queen { continue }
            let v = val(board.piece(at: m.from)?.type ?? .pawn)
            if v < bestVal { bestVal = v; best = m }
        }
        return best
    }

    /// Wie viel gewinnt `side` (>= 0), wenn sie auf `sq` zu schlagen beginnt und jederzeit aufhoeren darf.
    static func seeGain(on sq: Position, side: PlayerColor, board: ChessBoard, depth: Int = 0) -> Int {
        guard depth < 12, let victim = board.piece(at: sq), victim.type != .king,
              let cap = cheapestCapture(on: sq, by: side, board: board) else { return 0 }
        let tmp = ChessBoard(copyFrom: board)
        tmp.executeMove(cap)
        var gain = val(victim.type)
        if let pr = cap.promotion { gain += val(pr) - 100 }
        return max(0, gain - seeGain(on: sq, side: side.opposite, board: tmp, depth: depth + 1))
    }

    /// Materialbilanz eines Zuges fuer den Ziehenden, nachdem der Schlagabtausch auf dem
    /// Zielfeld ausgespielt ist (Centibauern). Negativ = der Zug verliert Material.
    static func exchangeResult(of move: ChessMove, board: ChessBoard) -> Int {
        guard let mover = board.piece(at: move.from) else { return 0 }
        var gain = 0
        if let c = move.capturedPiece { gain += val(c) }
        if let pr = move.promotion { gain += val(pr) - 100 }
        let tmp = ChessBoard(copyFrom: board)
        tmp.executeMove(move)
        return gain - seeGain(on: move.to, side: mover.color.opposite, board: tmp)
    }

    struct Hanging {
        let pos: Position
        let type: ChessPieceType
        let loss: Int
        let attacker: ChessMove
    }

    /// Figuren von `color`, die der Gegner mit Gewinn schlagen koennte (wenn er am Zug waere).
    static func hangingPieces(of color: PlayerColor, board: ChessBoard) -> [Hanging] {
        var result: [Position: Hanging] = [:]
        for m in board.allLegalMoves(for: color.opposite) where m.capturedPiece != nil && !m.isEnPassant {
            guard let victim = board.piece(at: m.to), victim.color == color, victim.type != .king else { continue }
            let g = exchangeResult(of: m, board: board)
            if g > 50 && (result[m.to]?.loss ?? 0) < g {
                result[m.to] = Hanging(pos: m.to, type: victim.type, loss: g, attacker: m)
            }
        }
        return result.values.sorted { $0.loss > $1.loss }
    }

    /// Alle Zuege, mit denen `color` sofort mattsetzen koennte (fuer Drohungs-Warnungen)
    static func mateInOneMoves(for color: PlayerColor, board: ChessBoard) -> [ChessMove] {
        var r: [ChessMove] = []
        for m in board.allLegalMoves(for: color) {
            let tmp = ChessBoard(copyFrom: board)
            tmp.executeMove(m)
            if tmp.isInCheck(color.opposite) && !tmp.hasLegalMoves(for: color.opposite) { r.append(m) }
        }
        return r
    }

    /// Deutscher Figurenbuchstabe (K D T L S, Bauer ohne)
    static func letter(_ t: ChessPieceType) -> String { t == .pawn ? "" : t.symbol }

    /// Deutsche Kurznotation, z.B. "Sf3", "exd5", "Lxc4+", "0-0", "e8=D#"
    static func san(_ m: ChessMove, board: ChessBoard) -> String {
        guard let p = board.piece(at: m.from) else { return moveToUci(m) }
        var s: String
        if m.isCastling {
            s = m.to.col == 6 ? "0-0" : "0-0-0"
        } else {
            s = letter(p.type)
            let file = String(Character(UnicodeScalar(97 + m.from.col)!))
            if p.type == .pawn {
                if m.capturedPiece != nil { s = file }
            } else {
                let others = board.allLegalMoves(for: p.color).filter {
                    $0.to == m.to && $0.from != m.from && board.piece(at: $0.from)?.type == p.type
                }
                if !others.isEmpty {
                    if !others.contains(where: { $0.from.col == m.from.col }) { s += file }
                    else if !others.contains(where: { $0.from.row == m.from.row }) { s += "\(8 - m.from.row)" }
                    else { s += posToAlgebraic(m.from) }
                }
            }
            if m.capturedPiece != nil { s += "x" }
            s += posToAlgebraic(m.to)
            if let pr = m.promotion { s += "=" + letter(pr) }
        }
        let tmp = ChessBoard(copyFrom: board)
        tmp.executeMove(m)
        let opp = p.color.opposite
        if tmp.isInCheck(opp) { s += tmp.hasLegalMoves(for: opp) ? "+" : "#" }
        return s
    }

    /// Kindgerechte Beschreibung: "Springer g1 → f3 (Sf3)"
    static func describe(_ m: ChessMove, board: ChessBoard) -> String {
        let name = board.piece(at: m.from)?.type.displayName ?? "Figur"
        if m.isCastling { return (m.to.col == 6 ? "Kurze Rochade" : "Lange Rochade") + " (\(san(m, board: board)))" }
        return "\(name) \(posToAlgebraic(m.from)) → \(posToAlgebraic(m.to)) (\(san(m, board: board)))"
    }

    /// Ist der Bauer auf `pos` ein Freibauer?
    static func isPassedPawn(_ pos: Position, color: PlayerColor, board: ChessBoard) -> Bool {
        guard let p = board.piece(at: pos), p.type == .pawn, p.color == color else { return false }
        let dir = color == .white ? -1 : 1
        var r = pos.row + dir
        while r >= 0 && r < 8 {
            for c in max(0, pos.col - 1)...min(7, pos.col + 1) {
                if let q = board.grid[r][c], q.type == .pawn, q.color != color { return false }
            }
            r += dir
        }
        return true
    }

    /// Ziele (gegnerische Figuren), die die Figur auf `from` direkt angreift
    static func attackedTargets(from: Position, board: ChessBoard) -> [(Position, ChessPieceType)] {
        guard let p = board.piece(at: from) else { return [] }
        return board.pseudoLegalMoves(for: p.color)
            .filter { $0.from == from && $0.capturedPiece != nil && !$0.isEnPassant }
            .compactMap { m in board.piece(at: m.to).map { (m.to, $0.type) } }
    }

    /// Eroeffnungsphase: noch fast alle Figuren auf dem Brett und fruehe Zugnummer
    /// (Aufgaben-Stellungen aus FEN mit wenigen Figuren zaehlen NICHT als Eroeffnung)
    static func isOpeningPhase(_ b: ChessBoard) -> Bool {
        b.fullMoveNumber <= 12 && pieceCount(b) >= 26
    }

    /// Folgt der Zug den Eroeffnungsprinzipien? (Entwicklung, Zentrumsbauern c/d/e, Rochade, Schlagen,
    /// Buchzug, Rettung einer bedrohten Figur, Schach). Randbauern, f-Bauer, fruehe Dame/Turm/Koenig: nein.
    static func isPrincipledOpeningMove(_ m: ChessMove, board: ChessBoard, bookMoves: Set<String>,
                                        hanging: Set<Position>) -> Bool {
        if m.isCastling || m.capturedPiece != nil || bookMoves.contains(moveToUci(m)) { return true }
        guard let p = board.piece(at: m.from) else { return true }
        if hanging.contains(m.from) { return true }
        switch p.type {
        case .knight, .bishop:
            return true
        case .pawn:
            if (2...4).contains(m.from.col) { return true }
        case .queen, .rook, .king:
            break
        }
        let after = ChessBoard(copyFrom: board)
        after.executeMove(m)
        return after.isInCheck(p.color.opposite)
    }

    static func pieceCount(_ board: ChessBoard) -> Int {
        var n = 0
        for r in 0..<8 { for c in 0..<8 where board.grid[r][c] != nil { n += 1 } }
        return n
    }
}

// MARK: - v3 Coach: Empfehlungen mit Begruendung, Denkanstoss, Warnungen

/// Ergebnis einer Coach-Empfehlung (zweistufig: erst Denkanstoss, dann Loesung)
struct CoachAdvice {
    let move: ChessMove?
    let nudge: String            // Stufe 1: Denkanstoss ohne Loesung
    let full: String             // Stufe 2: Zug + Begruendung + Antwort + Alternativen
    let focus: Position?         // Feld, auf das der Denkanstoss zeigt
    let dangerSquares: [Position]
}

/// Der Coach rechnet mit einer eigenen, fehlerfreien Engine (keine Anfaenger-"Wackler")
/// und begruendet seine Empfehlung mit nachpruefbaren Fakten (Abtausch-Rechnung, Drohungen,
/// Taktikmotive, Eroeffnungsbuch, Grundprinzipien).
final class ChessCoach {
    private let engine = ChessAIEngine(difficulty: 10)

    func advise(board: ChessBoard, color: PlayerColor, history: [String], budget: Int = 130_000) -> CoachAdvice {
        let legal = board.allLegalMoves(for: color)
        guard !legal.isEmpty else {
            return CoachAdvice(move: nil, nudge: "Keine Zuege moeglich.", full: "Keine Zuege moeglich.",
                               focus: nil, dangerSquares: [])
        }
        let opp = color.opposite
        let (ranked, depth) = engine.rankMoves(board: board, color: color, maxDepth: 4,
                                               nodeBudget: budget, window: 150)
        var best = ranked[0]
        let homeRow = color == .white ? 7 : 0

        // Eroeffnungsbuch: der HAEUFIGSTE Theoriezug (Hauptvariante) wird bevorzugt, wenn er (fast) gleich gut ist
        var bookName: String? = nil
        var bookCounts: [String: Int] = [:]
        var bookNames: [String: String] = [:]
        if history.count < 20 {
            for o in ChessOpeningBook.nextBookMoves(afterMoves: history) {
                bookCounts[o.move, default: 0] += 1
                if bookNames[o.move] == nil { bookNames[o.move] = o.openingName }
            }
        }
        if best.score < 90_000 && !bookCounts.isEmpty {
            let candidates = ranked.filter { bookCounts[moveToUci($0.move)] != nil && best.score - $0.score <= 40 }
            if let pick = candidates.max(by: { (bookCounts[moveToUci($0.move)] ?? 0, $0.score) < (bookCounts[moveToUci($1.move)] ?? 0, $1.score) }) {
                best = pick
                bookName = bookNames[moveToUci(pick.move)]
            }
        }
        // In der Eroeffnung nur "prinzipielle" Zuege empfehlen (Entwicklung, Zentrum, Rochade, Schlagen)
        let openingPhase = CoachTools.isOpeningPhase(board)
        let bookSet = Set(bookCounts.keys)
        let hangSet = openingPhase ? Set(CoachTools.hangingPieces(of: color, board: board).map { $0.pos }) : []
        let principled: (ChessMove) -> Bool = { m in
            !openingPhase || CoachTools.isPrincipledOpeningMove(m, board: board, bookMoves: bookSet, hanging: hangSet)
        }
        if bookName == nil && best.score < 90_000 && !principled(best.move),
           let alt = ranked.first(where: { principled($0.move) && best.score - $0.score <= 30 }) {
            best = alt
        }

        let move = best.move
        let pType = board.piece(at: move.from)?.type ?? .pawn
        let after = ChessBoard(copyFrom: board)
        after.executeMove(move)
        let sanStr = CoachTools.san(move, board: board)
        let hangingBefore = CoachTools.hangingPieces(of: color, board: board)
        let hangingAfter = CoachTools.hangingPieces(of: color, board: after)
        let exch = CoachTools.exchangeResult(of: move, board: board)

        var reasons: [String] = []
        var nudge: String? = nil
        var focus: Position? = move.from

        // 1) Matt
        if best.score >= 90_000 {
            let plies = depth - (best.score - 100_000)
            let n = max(1, (plies + 1) / 2)
            if after.isInCheck(opp) && !after.hasLegalMoves(for: opp) {
                reasons.append("SCHACHMATT! \(sanStr) setzt sofort matt – der Koenig kann nirgends mehr hin.")
                nudge = "Hier gibt es ein Matt in 1! Welche Figur kann den Koenig so angreifen, dass er nicht mehr entkommt?"
            } else {
                reasons.append("Erzwingt Matt in \(n) Zuegen – egal, was der Gegner macht.")
                nudge = "Hier ist ein erzwungenes Matt drin (in \(n) Zuegen)! Suche Schachgebote, die dem Koenig die Fluchtfelder nehmen."
            }
        }

        // 2) Selbst im Schach
        if board.isInCheck(color) {
            if nudge == nil {
                nudge = "Du stehst im Schach! Es gibt drei Wege: Koenig wegziehen, eine Figur dazwischenstellen oder den Angreifer schlagen. Welcher ist hier am sichersten?"
            }
            if move.capturedPiece != nil { reasons.append("Schlaegt die Figur, die Schach gibt.") }
            else if pType == .king { reasons.append("Der Koenig geht auf ein sicheres Feld.") }
            else { reasons.append("Stellt eine Figur dazwischen und blockt das Schach.") }
        }

        // 3) Material gewinnen
        if let cap = move.capturedPiece, exch >= 90 {
            let free = exch >= CoachTools.val(cap) - 20
            reasons.append(free
                ? "Gewinnt Material: \(cap1(cap.derName)) auf \(posToAlgebraic(move.to)) ist nicht gedeckt (+\(CoachTools.pawns(exch)))."
                : "Gewinnt Material: Auch nach dem Zurueckschlagen bleibst du vorn (+\(CoachTools.pawns(exch))).")
            if nudge == nil {
                nudge = "Schau genau hin: Eine gegnerische Figur ist nicht genug gedeckt. Welche kannst du gewinnbringend schlagen?"
                focus = move.to
            }
        }

        // 4) Bedrohte eigene Figur retten
        if let h = hangingBefore.first {
            let lossAfter = hangingAfter.first?.loss ?? 0
            if lossAfter < h.loss - 50 {
                let attackerT = board.piece(at: h.attacker.from)?.type ?? .pawn
                reasons.append("Rettet \(h.type.deinAkk) auf \(posToAlgebraic(h.pos)) – \(h.type.pronoun) wurde \(attackerT.vomName) auf \(posToAlgebraic(h.attacker.from)) angegriffen und war nicht genug gedeckt.")
                if nudge == nil {
                    nudge = "Achtung, Gefahr! Eine deiner Figuren wird angegriffen und ist nicht genug gedeckt. Schau dir die orange markierte Figur an."
                    focus = h.pos
                }
            }
        }

        // 5) Taktik nach dem Zug: Doppelangriff, Schach, Spiess, Fesselung
        let targets = CoachTools.attackedTargets(from: move.to, board: after)
            .filter { $0.1 == .king || CoachTools.val($0.1) >= 300 }
        if targets.count >= 2 {
            let names = targets.map { $0.1 == .king ? "den Koenig" : $0.1.denName }
            reasons.append("Doppelangriff! \(cap1(pType.derName)) greift \(names.joined(separator: " und ")) gleichzeitig an – beides kann der Gegner nicht retten.")
            if nudge == nil {
                nudge = "Suche einen Doppelangriff: Eine deiner Figuren kann zwei Ziele auf einmal angreifen. Denk besonders an \(pType.deinAkk)!"
            }
        } else if after.isInCheck(opp) && best.score < 90_000 {
            reasons.append("Gibt Schach – der Gegner muss reagieren und du behaeltst die Initiative.")
        }
        if let sk = ChessTacticsDetector.detectSkewer(board: after, move: move, color: color) {
            reasons.append(sk)
        }
        if ChessTacticsDetector.detectPin(board: board, color: color) == nil,
           let pin = ChessTacticsDetector.detectPin(board: after, color: color) {
            reasons.append(pin)
        }

        // 6) Neue Drohung, die der Zug aufstellt
        let theirHangingBefore = Set(CoachTools.hangingPieces(of: opp, board: board).map { $0.pos })
        if move.capturedPiece == nil, let t = CoachTools.hangingPieces(of: opp, board: after).first,
           !theirHangingBefore.contains(t.pos) {
            reasons.append("Droht, \(t.type.denName) auf \(posToAlgebraic(t.pos)) zu gewinnen.")
        }
        if best.score < 90_000, let m = CoachTools.mateInOneMoves(for: color, board: after).first {
            reasons.append("Droht Matt mit \(CoachTools.san(m, board: after))!")
        }

        // 7) Eroeffnung & Grundprinzipien (wenn sonst nichts Konkretes da ist)
        if let bn = bookName {
            reasons.append("📖 Eroeffnungstheorie: \(bn).")
        }
        if reasons.isEmpty || bookName != nil {
            if move.isCastling {
                reasons.append("Rochade: Der Koenig kommt in Sicherheit und der Turm ins Spiel.")
            } else if (pType == .knight || pType == .bishop) && move.from.row == homeRow {
                reasons.append("Entwickelt eine Leichtfigur – je schneller alle Figuren mitspielen, desto staerker bist du.")
            } else if pType == .pawn && (3...4).contains(move.to.row) && (3...4).contains(move.to.col) {
                reasons.append("Besetzt das Zentrum – von dort kontrollieren deine Figuren das ganze Brett.")
            }
        }
        if reasons.isEmpty {
            let pieces = CoachTools.pieceCount(board)
            if pType == .rook && !(0..<8).contains(where: { r in
                if let q = after.grid[r][move.to.col], q.type == .pawn, q.color == color { return true }
                return false
            }) {
                reasons.append("Der Turm geht auf eine offene Linie – dort ist er am staerksten.")
            } else if pType == .pawn && CoachTools.isPassedPawn(move.to, color: color, board: after) {
                reasons.append("Schiebt den Freibauern vor – kein gegnerischer Bauer kann ihn mehr aufhalten.")
            } else if pType == .king && pieces <= 12 {
                reasons.append("Im Endspiel ist der Koenig eine starke Kampffigur – ab Richtung Zentrum!")
            } else {
                let mobBefore = board.allLegalMoves(for: color).count
                let mobAfter = after.allLegalMoves(for: color).count
                if mobAfter - mobBefore >= 4 {
                    reasons.append("Macht deine Figuren beweglicher (+\(mobAfter - mobBefore) Zugmoeglichkeiten).")
                } else {
                    reasons.append("Der Coach hat \(max(depth, 1)) Halbzuege vorausgerechnet: Dieser Zug haelt deine Stellung am besten zusammen.")
                }
            }
        }
        if nudge == nil {
            nudge = "Denk an die Grundregeln: Figuren entwickeln, Zentrum kontrollieren, Koenig in Sicherheit bringen. Schau dir mal \(pType.deinAkk) an!"
        }

        // Erwartete Antwort des Gegners
        var replyLine: String? = nil
        if best.score < 90_000 && after.hasLegalMoves(for: opp) {
            let (replies, _) = engine.rankMoves(board: after, color: opp, maxDepth: 3, nodeBudget: 25_000, window: 150)
            if let r = replies.first {
                replyLine = "↪ Erwartete Antwort: \(CoachTools.san(r.move, board: after))"
            }
        }

        // Alternativen
        var alts: [String] = []
        for alt in ranked.prefix(8) where !(alt.move == move) && alts.count < 2 && principled(alt.move) {
            let diff = best.score - alt.score
            if diff > 90 || (alt.score >= 90_000) != (best.score >= 90_000) { continue }
            let tag = diff <= 15 ? "gleich stark" : "−\(CoachTools.pawns(diff))"
            alts.append("\(CoachTools.san(alt.move, board: board)) (\(tag))")
        }

        // Fallen-Warnung: verlockender Schlagzug, der Material kostet
        var trap: String? = nil
        let tempting = legal.filter { $0.capturedPiece != nil && !($0 == move) }
            .map { ($0, CoachTools.exchangeResult(of: $0, board: board)) }
            .filter { $0.1 < -50 && CoachTools.val($0.0.capturedPiece!) >= 300 }
            .sorted { CoachTools.val($0.0.capturedPiece!) > CoachTools.val($1.0.capturedPiece!) }
        if let t = tempting.first {
            trap = "⚠️ Vorsicht Falle: \(CoachTools.san(t.0, board: board)) sieht verlockend aus, kostet aber nach dem Zurueckschlagen etwa \(CoachTools.pawns(-t.1)) Bauern."
        }

        // Stellungsbewertung
        let evalLine: String
        if best.score >= 90_000 { evalLine = "Bewertung: Matt ist sicher! 🏆" }
        else if best.score <= -90_000 { evalLine = "Bewertung: Leider ist Matt nicht mehr zu verhindern – mach es dem Gegner so schwer wie moeglich." }
        else {
            let v = Double(best.score) / 100.0
            let txt = String(format: "%+.1f", v).replacingOccurrences(of: ".", with: ",")
            let word = abs(v) < 0.3 ? "ausgeglichen" : (v > 0 ? "du stehst besser" : "der Gegner steht besser")
            evalLine = "Bewertung nach dem Zug: \(txt) (\(word))"
        }

        var full = "💡 EMPFEHLUNG: \(CoachTools.describe(move, board: board))\n"
        full += reasons.prefix(3).map { "• " + $0 }.joined(separator: "\n")
        if let r = replyLine { full += "\n" + r }
        if !alts.isEmpty { full += "\n➕ Auch gut: " + alts.joined(separator: " · ") }
        if let t = trap { full += "\n" + t }
        full += "\n" + evalLine

        return CoachAdvice(move: move, nudge: "🤔 DENKANSTOSS: " + (nudge ?? ""), full: full,
                           focus: focus, dangerSquares: hangingBefore.map { $0.pos })
    }

    /// Rueckmeldung nach dem EIGENEN Zug (Lernmodus): Tausch korrekt? Haengt jetzt etwas? Droht Matt?
    func feedbackAfterOwnMove(before: ChessBoard, after: ChessBoard, move: ChessMove, color: PlayerColor)
        -> (text: String, danger: [Position]) {
        var parts: [String] = []
        var danger: [Position] = []
        let opp = color.opposite
        let movedType = after.piece(at: move.to)?.type ?? .pawn

        if let cap = move.capturedPiece {
            let ex = CoachTools.exchangeResult(of: move, board: before)
            if ex >= CoachTools.val(cap) - 20 {
                parts.append("✅ Du schlaegst \(cap.denName) – \(cap.pronoun) war nicht gedeckt: +\(CoachTools.pawns(ex)).")
            } else if ex > 20 {
                parts.append("✅ Guter Tausch: Auch nach dem Zurueckschlagen gewinnst du etwa \(CoachTools.pawns(ex)).")
            } else if ex >= -20 {
                parts.append("Gleicher Tausch – das Material bleibt ausgeglichen.")
            } else {
                parts.append("⚠️ Vorsicht: \(cap1(cap.derName)) war gedeckt. Nach dem Zurueckschlagen verlierst du etwa \(CoachTools.pawns(-ex)).")
            }
        }
        if move.isCastling {
            parts.append(move.to.col == 6
                ? "Kurze Rochade! Dein Koenig steht jetzt sicher hinter den Bauern."
                : "Lange Rochade! Der Koenig ist auf der Damenseite in Sicherheit, der Turm steht schon im Zentrum.")
        }
        if let promo = move.promotion {
            parts.append("Bauernumwandlung zur \(promo.displayName)!")
        }
        if move.isEnPassant {
            parts.append("En passant! Der Bauer wurde im Vorbeigehen geschlagen.")
        }
        if after.isInCheck(opp) {
            parts.append(after.hasLegalMoves(for: opp) ? "Schach! Der Gegner muss reagieren." : "SCHACHMATT! 🎉")
        }

        let hangBefore = Set(CoachTools.hangingPieces(of: color, board: before).map { $0.pos })
        let hangAfter = CoachTools.hangingPieces(of: color, board: after)
        for h in hangAfter.prefix(2) {
            let attT = after.piece(at: h.attacker.from)?.type ?? .pawn
            if h.pos == move.to {
                parts.append("⚠️ Achtung: \(cap1(h.type.deinNom)) auf \(posToAlgebraic(h.pos)) kann jetzt \(attT.vomName) geschlagen werden!")
                danger.append(h.pos)
            } else if !hangBefore.contains(h.pos) {
                parts.append("⚠️ Durch diesen Zug haengt jetzt \(h.type.deinNom) auf \(posToAlgebraic(h.pos)).")
                danger.append(h.pos)
            }
        }
        if !hangBefore.isEmpty && hangAfter.isEmpty {
            parts.append("👍 Gut – deine bedrohte Figur ist jetzt in Sicherheit.")
        }
        if after.hasLegalMoves(for: opp), let m = CoachTools.mateInOneMoves(for: opp, board: after).first {
            parts.append("🚨 GEFAHR: Jetzt droht \(CoachTools.san(m, board: after)) Matt! (↶ Zurueck hilft)")
            danger.append(m.to)
        }

        // v3: Klassischer Anfaengerfehler: f-Bauer frueh ziehen schwaecht den Koenig
        if movedType == .pawn && move.from.col == 5 && before.fullMoveNumber <= 12,
           let k = after.findKing(color), k.row == (color == .white ? 7 : 0), k.col >= 4 {
            let diag = color == .white ? "e1–h4" : "e8–h5"
            parts.append("⚠️ Tipp: Der f-Bauer beschuetzt deinen Koenig. Wenn er frueh zieht, wird die Diagonale \(diag) schwach – Vorsicht vor Angriffen der gegnerischen Dame!")
        }

        if parts.isEmpty {
            let homeRow = color == .white ? 7 : 0
            if (movedType == .knight || movedType == .bishop) && move.from.row == homeRow {
                parts.append("👍 Figur entwickelt – so kommen deine Kaempfer ins Spiel.")
            } else if movedType == .pawn && (3...4).contains(move.to.row) && (3...4).contains(move.to.col) {
                parts.append("👍 Bauer ins Zentrum – das gibt deinen Figuren Platz.")
            } else if movedType == .queen && before.fullMoveNumber <= 6 {
                parts.append("Tipp: Die Dame so frueh zu ziehen ist riskant – sie kann von kleineren Figuren gejagt werden.")
            } else if movedType == .king && !move.isCastling && CoachTools.pieceCount(after) > 16 {
                parts.append("Tipp: Im Mittelspiel sollte der Koenig lieber sicher stehen – denk an die Rochade.")
            } else {
                parts.append("Solider Zug. Pruefe nach jedem gegnerischen Zug: Was greift er an? Was droht er?")
            }
        }
        return (parts.joined(separator: " "), danger)
    }

    /// Nach dem Zug des GEGNERS: Was spielte er, und was droht jetzt? (fuer den Menschen `defender`)
    func threatReport(after: ChessBoard, before: ChessBoard, move: ChessMove, defender: PlayerColor)
        -> (text: String, danger: [Position]) {
        let opp = defender.opposite
        var parts: [String] = []
        var danger: [Position] = []
        parts.append("Der Gegner spielte \(CoachTools.describe(move, board: before)).")
        if let cap = move.capturedPiece {
            parts.append("Er hat \(cap.deinAkk) geschlagen – kannst du zurueckschlagen?")
        }
        if after.isInCheck(defender) {
            parts.append("Du stehst im SCHACH!")
        }
        if let m = CoachTools.mateInOneMoves(for: opp, board: after).first {
            parts.append("🚨 Er droht Matt mit \(CoachTools.san(m, board: after))! Verteidige dich!")
            danger.append(m.to)
        }
        for h in CoachTools.hangingPieces(of: defender, board: after).prefix(2) {
            let attT = after.piece(at: h.attacker.from)?.type ?? .pawn
            parts.append("⚠️ \(cap1(h.type.deinNom)) auf \(posToAlgebraic(h.pos)) wird \(attT.vomName) angegriffen und ist nicht genug gedeckt.")
            danger.append(h.pos)
        }
        if danger.isEmpty && !after.isInCheck(defender) {
            parts.append("Keine direkte Drohung – du kannst in Ruhe deinen Plan verfolgen.")
        }
        return (parts.joined(separator: " "), danger)
    }
}

// MARK: - Zuganalyse-Engine (Das Herzstueck)

enum MoveClassification: String {
    case brilliant = "!!"
    case good = "!"
    case book = "📖"
    case neutral = ""
    case inaccuracy = "?!"
    case mistake = "?"
    case blunder = "??"

    var germanName: String {
        switch self {
        case .brilliant: return "Brillanter Zug"
        case .good: return "Guter Zug"
        case .book: return "Buchzug"
        case .neutral: return "Solider Zug"
        case .inaccuracy: return "Ungenauigkeit"
        case .mistake: return "Fehler"
        case .blunder: return "Grober Fehler"
        }
    }
}

struct MoveAnalysisResult {
    let evalBefore: Int        // Bewertung vor dem Zug (Centipawns)
    let evalAfter: Int         // Bewertung nach dem Zug
    let classification: MoveClassification
    let opening: OpeningEntry?
    let tactics: [String]
    let positionalNotes: [String]
    let bookComment: String?
    let gameReference: String?
    let summary: String        // Komplette deutsche Zusammenfassung
    let rating: Int            // Zugwert 1-15 (15 = perfekt)
    let ratingText: String     // Erklaerung zum Zugwert
}

// MARK: - Zugbewertung 1-15 (zum Lernen, einschaltbar in jedem Spielmodus)

struct MoveRating {
    let value: Int             // 1 (grober Fehler) ... 15 (perfekt/Matt)
    let text: String           // Deutsche Erklaerung
    var scoreForMover: Int = 0 // v3: Stellungswert nach dem Zug aus Sicht des Ziehenden (Centibauern, Matt gekappt)
    var bestMove: ChessMove? = nil
}

final class ChessMoveRater {
    private let engine = ChessAIEngine(difficulty: 3)

    /// Bewertet einen gespielten Zug auf der Skala 1-15 durch Vergleich mit dem besten Zug.
    /// v3: echte Suche mit Ruhesuche (Schlagfolgen werden zu Ende gerechnet) statt 1 Halbzug –
    /// ein gedeckter Tausch gilt nicht mehr als Fehler, ein Zug in eine Gabel schon.
    func rate(move: ChessMove, boardBefore: ChessBoard, boardAfter: ChessBoard, color: PlayerColor,
              history: [String] = []) -> MoveRating {
        let opponent = color.opposite

        // Matt gesetzt? Sofort Bestnote.
        if boardAfter.isInCheck(opponent) && !boardAfter.hasLegalMoves(for: opponent) {
            return MoveRating(value: 15, text: "SCHACHMATT! Der perfekte Abschluss - besser geht es nicht.",
                              scoreForMover: 5000, bestMove: move)
        }

        // v3.1: 3 Halbzuege tief (laeuft im Hintergrund), vorher 2
        let (ranked, _) = engine.rankMoves(board: boardBefore, color: color, maxDepth: 3, nodeBudget: 170_000)
        guard let top = ranked.first else { return MoveRating(value: 8, text: "Keine Alternativen vorhanden.") }
        var bestMove = top.move
        let bestScore = top.score
        let playedScore = ranked.first(where: { $0.move == move })?.score
            ?? -engine.shallowScore(board: boardAfter, toMove: opponent, depth: 1)
        let cap: (Int) -> Int = { max(-3000, min(3000, $0)) }
        let mate = 90_000

        var value: Int
        var special: String? = nil
        if bestScore >= mate && playedScore < mate {
            value = playedScore > 150 ? 7 : 5
            special = "Du hattest ein erzwungenes Matt – das hast du verpasst!"
        } else if playedScore <= -mate && bestScore > -mate {
            value = 1
            special = "Achtung: Dieser Zug erlaubt dem Gegner ein Matt!"
        } else if bestScore >= mate && playedScore >= mate {
            value = playedScore >= bestScore - 1 ? 15 : 13
            special = "Das Matt ist nicht mehr aufzuhalten!"
        } else {
            let loss = max(0, cap(bestScore) - cap(playedScore))   // Centibauern, die der Zug verschenkt
            switch loss {
            case 0:          value = 14
            case 1...15:     value = 13
            case 16...35:    value = 12
            case 36...60:    value = 11
            case 61...90:    value = 10
            case 91...130:   value = 8
            case 131...200:  value = 7
            case 201...290:  value = 5
            case 291...450:  value = 4
            case 451...700:  value = 2
            default:         value = 1
            }
            // Bonus: bester Zug UND gewinnt Material oder gibt Schach → 15
            if loss == 0 {
                let capturedValue = move.capturedPiece?.value ?? 0
                if capturedValue >= 300 || boardAfter.isInCheck(opponent) || move.promotion != nil {
                    value = 15
                }
            }
        }

        // v3.1: Eroeffnungsprinzipien – die kurze Vorausschau erkennt positionelle Schwaechen
        // (f3, Randbauern, fruehe Dame) kaum. Deshalb gibt es hier eine Obergrenze mit Begruendung.
        var principleNote: String? = nil
        if value > 8 && value < 15 && CoachTools.isOpeningPhase(boardBefore) {
            let book = Set(ChessOpeningBook.nextBookMoves(afterMoves: history).map { $0.move })
            let hang = Set(CoachTools.hangingPieces(of: color, board: boardBefore).map { $0.pos })
            let ok: (ChessMove) -> Bool = {
                CoachTools.isPrincipledOpeningMove($0, board: boardBefore, bookMoves: book, hanging: hang)
            }
            if !ok(move) {
                let t = boardBefore.piece(at: move.from)?.type ?? .pawn
                switch t {
                case .pawn where move.from.col == 5:
                    value = min(value, 8)
                    principleNote = "Der f-Bauer schuetzt deinen Koenig – frueh gezogen schwaecht er die Koenigsstellung."
                case .queen:
                    value = min(value, 9)
                    principleNote = "Die Dame so frueh ins Spiel zu bringen ist riskant – kleinere Figuren koennen sie jagen und gewinnen dabei Zeit."
                case .king:
                    value = min(value, 8)
                    principleNote = "Den Koenig ohne Rochade zu ziehen kostet das Rochaderecht und Zeit."
                case .rook:
                    value = min(value, 9)
                    principleNote = "Tuerme kommen erst nach der Entwicklung der Leichtfiguren ins Spiel."
                default:
                    value = min(value, 10)
                    principleNote = "In der Eroeffnung zaehlen Entwicklung, Zentrum und Koenigssicherheit – dieser Randbauern-Zug hilft dabei wenig."
                }
                // Als "besser" einen prinzipiellen Zug nennen, der (fast) so gut rechnet
                if let alt = ranked.first(where: { ok($0.move) && top.score - $0.score <= 60 }) {
                    bestMove = alt.move
                }
            }
        }

        var text: String
        switch value {
        case 15: text = "Perfekt! Der staerkste Zug in dieser Stellung - mit maximaler Wirkung."
        case 14: text = "Exzellent! Genau das haette auch der Computer gespielt."
        case 13: text = "Sehr stark - praktisch gleichwertig mit dem besten Zug."
        case 12: text = "Guter Zug. Nur eine Winzigkeit vom Optimum entfernt."
        case 11: text = "Solider Zug, die Stellung bleibt in Ordnung."
        case 10: text = "Ordentlich, aber es gab etwas Staerkeres."
        case 8, 9: text = "Ungenauigkeit: Da ging etwas mehr."
        case 7: text = "Kleiner Fehler - die Stellung verschlechtert sich spuerbar."
        case 5, 6: text = "Fehler! Hier ging deutlich mehr."
        case 4: text = "Schwerer Fehler - das kann Material oder die Partie kosten."
        case 2, 3: text = "Grober Fehler! Der Gegner kann das hart bestrafen."
        default: text = "Katastrophaler Zug - wahrscheinlich geht eine Figur oder die Partie verloren."
        }
        if let sp = special { text = sp + " " + text }
        if let pn = principleNote { text += " " + pn }

        // Bei schwaecheren Zuegen: besten Zug als Lerntipp nennen (mit Begruendung)
        if value <= 10, !(bestMove == move) {
            let pieceName = boardBefore.piece(at: bestMove.from)?.type.displayName ?? "Figur"
            text += " Besser war: \(pieceName) \(posToAlgebraic(bestMove.from))-\(posToAlgebraic(bestMove.to))"
            text += " (\(CoachTools.san(bestMove, board: boardBefore)))."
            // Warum war der eigene Zug schlecht? Haengt jetzt etwas?
            if let h = CoachTools.hangingPieces(of: color, board: boardAfter).first {
                text += " Problem: \(cap1(h.type.deinNom)) auf \(posToAlgebraic(h.pos)) kann geschlagen werden."
            } else if let m = CoachTools.mateInOneMoves(for: opponent, board: boardAfter).first {
                text += " Problem: Der Gegner droht Matt mit \(CoachTools.san(m, board: boardAfter))."
            }
        }

        let scoreForMover: Int
        if playedScore >= mate { scoreForMover = 5000 }
        else if playedScore <= -mate { scoreForMover = -5000 }
        else { scoreForMover = cap(playedScore) }
        return MoveRating(value: value, text: text, scoreForMover: scoreForMover, bestMove: bestMove)
    }
}

class ChessMoveAnalyzer {
    private let evalEngine = ChessAIEngine(difficulty: 3)
    private let rater = ChessMoveRater()
    private var moveHistory: [String] = []
    private var moveNumber = 0
    private var lastEval: Int = 0

    func reset() {
        moveHistory = []
        moveNumber = 0
        lastEval = 0
    }

    /// v3: Nach "Zug zuruecknehmen" den Analysestand auf die verbleibenden Zuege setzen
    func rewind(to history: [String], board: ChessBoard) {
        moveHistory = history
        moveNumber = history.count
        lastEval = evalEngine.evaluate(board: board, for: .white)
    }

    func analyze(move: ChessMove, boardBefore: ChessBoard, boardAfter: ChessBoard,
                 color: PlayerColor, isLearningMode: Bool) -> MoveAnalysisResult {

        moveNumber += 1
        let moveStr = moveToAlgebraic(move)
        moveHistory.append(moveStr)

        // 1. Zugwert 1-15 mit echter Suche (v3: laeuft im Hintergrund-Thread, blockiert nichts)
        let moveRating = rater.rate(move: move, boardBefore: boardBefore, boardAfter: boardAfter, color: color,
                                    history: Array(moveHistory.dropLast()))

        // 2. Bewertung aus Sicht von Weiss (fuer den Balken): Suchergebnis statt reiner Materialzaehlung
        let evalBefore = lastEval
        let evalAfter = color == .white ? moveRating.scoreForMover : -moveRating.scoreForMover
        lastEval = evalAfter

        // 3. Klassifizierung (v3): aus dem Zugwert abgeleitet, damit Symbol und Zahl zusammenpassen.
        // Vorher: "Brillant" schon bei jedem normalen Abtausch (Bewertung vor dem Zurueckschlagen).
        let classification: MoveClassification
        let opening = ChessOpeningBook.findOpening(moves: moveHistory)
        if opening != nil && moveNumber <= opening!.moves.count && moveRating.value >= 10 {
            classification = .book
        } else {
            switch moveRating.value {
            case 15: classification = .brilliant
            case 13...14: classification = .good
            case 10...12: classification = .neutral
            case 8...9: classification = .inaccuracy
            case 4...7: classification = .mistake
            default: classification = .blunder
            }
        }

        // 4. Taktik-Erkennung
        let tactics = ChessTacticsDetector.detectAll(board: boardAfter, move: move, color: color)

        // 5. Positionelle Analyse
        let positionalNotes = ChessPositionalAnalyzer.analyze(board: boardAfter, color: color)

        // 6. Buchwissen
        var bookComment: String?
        if isLearningMode {
            let gamePhase: String
            let totalPieces = (0..<8).flatMap { r in (0..<8).compactMap { c in boardAfter.grid[r][c] } }.count
            if moveNumber <= 10 { gamePhase = "eroeffnung" }
            else if totalPieces <= 10 { gamePhase = "endspiel" }
            else if !tactics.isEmpty { gamePhase = "taktik" }
            else { gamePhase = "strategie" }

            if let concept = ChessKnowledgeBase.findConcept(category: gamePhase) {
                bookComment = "\(concept.author) (\(concept.book)): \(concept.explanation)"
            }
        }

        // 7. Beruehmte Partie Referenz
        var gameReference: String?
        if let op = opening, isLearningMode {
            if let game = ChessKnowledgeBase.findFamousGame(eco: op.eco) {
                gameReference = "\(game.name) (\(game.white) vs \(game.black), \(game.year)): \(game.keyLesson)"
            }
        }

        // 9. Zusammenfassung erstellen
        var summary = "Zugwert: \(moveRating.value)/15 - \(moveRating.text)\n"
        summary += buildSummary(
            move: move, color: color, classification: classification,
            evalBefore: evalBefore, evalAfter: evalAfter,
            opening: opening, tactics: tactics,
            positionalNotes: positionalNotes, bookComment: bookComment,
            gameReference: gameReference, isLearningMode: isLearningMode
        )

        return MoveAnalysisResult(
            evalBefore: evalBefore, evalAfter: evalAfter,
            classification: classification, opening: opening,
            tactics: tactics, positionalNotes: positionalNotes,
            bookComment: bookComment, gameReference: gameReference,
            summary: summary, rating: moveRating.value, ratingText: moveRating.text
        )
    }

    private func buildSummary(move: ChessMove, color: PlayerColor, classification: MoveClassification,
                              evalBefore: Int, evalAfter: Int, opening: OpeningEntry?,
                              tactics: [String], positionalNotes: [String],
                              bookComment: String?, gameReference: String?,
                              isLearningMode: Bool) -> String {
        var parts: [String] = []

        // Bewertung
        let evalPawns = Double(evalAfter) / 100.0
        let evalStr: String
        if abs(evalPawns) < 0.3 { evalStr = "Ausgeglichene Stellung" }
        else if evalPawns > 0 { evalStr = String(format: "Weiss steht besser (+%.1f)", evalPawns) }
        else { evalStr = String(format: "Schwarz steht besser (%.1f)", evalPawns) }

        parts.append("\(classification.germanName) \(classification.rawValue) | \(evalStr)")

        // Eroeffnung
        if let op = opening {
            parts.append("Eroeffnung: \(op.name) [\(op.eco)]")
            if isLearningMode {
                parts.append(op.explanation)
            }
        }

        // Taktik
        if !tactics.isEmpty {
            parts.append(contentsOf: tactics.prefix(2))
        }

        // Positionelle Noten (max 2 im Normalfall, 3 im Lernmodus)
        let maxNotes = isLearningMode ? 3 : 2
        if !positionalNotes.isEmpty {
            parts.append(contentsOf: positionalNotes.prefix(maxNotes))
        }

        // Buchwissen (nur im Lernmodus)
        if let book = bookComment, isLearningMode {
            parts.append("Buchwissen: \(book)")
        }

        // Beruehmte Partie (nur im Lernmodus)
        if let game = gameReference, isLearningMode {
            parts.append("Beruehmte Partie: \(game)")
        }

        // Naechster Buchzug Vorschlag
        if isLearningMode {
            let nextMoves = ChessOpeningBook.nextBookMoves(afterMoves: moveHistory)
            if !nextMoves.isEmpty {
                let suggestions = nextMoves.prefix(2).map { "\($0.openingName)" }.joined(separator: " oder ")
                parts.append("Buchfortsetzung: \(suggestions)")
            }
        }

        return parts.joined(separator: "\n")
    }
}

// MARK: - Bewertungsbalken View

class EvalBarView: NSView {
    var evaluation: Double = 0.0 { didSet { needsDisplay = true } }

    override func draw(_ dirtyRect: NSRect) {
        let bg = NSColor(red: 0.15, green: 0.15, blue: 0.15, alpha: 1)
        bg.setFill()
        bounds.fill()

        // Bewertung auf 0..1 mappen (-5 bis +5 Bauern)
        let clamped = max(-5.0, min(5.0, evaluation))
        let ratio = CGFloat((clamped + 5.0) / 10.0)

        // Weisser Anteil von unten
        let whiteRect = NSRect(x: 0, y: 0, width: bounds.width, height: bounds.height * ratio)
        NSColor.white.setFill()
        whiteRect.fill()

        // Schwarzer Anteil von oben
        let blackRect = NSRect(x: 0, y: bounds.height * ratio, width: bounds.width, height: bounds.height * (1 - ratio))
        NSColor(white: 0.12, alpha: 1).setFill()
        blackRect.fill()

        // Mittellinie
        let midY = bounds.height * 0.5
        NSColor.gray.withAlphaComponent(0.5).setStroke()
        let line = NSBezierPath()
        line.move(to: NSPoint(x: 0, y: midY))
        line.line(to: NSPoint(x: bounds.width, y: midY))
        line.lineWidth = 0.5
        line.stroke()

        // Zahl anzeigen
        let text = String(format: "%+.1f", evaluation) as NSString
        let font = NSFont.monospacedDigitSystemFont(ofSize: 10, weight: .bold)
        let color: NSColor = evaluation >= 0 ? .black : .white
        let attrs: [NSAttributedString.Key: Any] = [.font: font, .foregroundColor: color]
        let tsz = text.size(withAttributes: attrs)
        let y = evaluation >= 0 ? whiteRect.maxY - tsz.height - 2 : whiteRect.maxY + 2
        text.draw(at: NSPoint(x: (bounds.width - tsz.width) / 2, y: max(2, min(bounds.height - tsz.height - 2, y))), withAttributes: attrs)
    }
}

// MARK: - Chess Piece Unicode Characters

func chessPieceChar(_ type: ChessPieceType, _ color: PlayerColor) -> String {
    // Always use filled symbols — color applied via NSAttributedString
    switch type {
    case .king:   return "\u{265A}"
    case .queen:  return "\u{265B}"
    case .rook:   return "\u{265C}"
    case .bishop: return "\u{265D}"
    case .knight: return "\u{265E}"
    case .pawn:   return "\u{265F}"
    }
}

// MARK: - Figuren-Stile (NEU: Klassisch oder Paw-Patrol-Hunde-Team 🐾)

enum PieceStyle: Int {
    case klassisch = 0
    case pawPatrol = 1

    static var current: PieceStyle {
        get { PieceStyle(rawValue: UserDefaults.standard.integer(forKey: "figurenStil")) ?? .klassisch }
        set { UserDefaults.standard.set(newValue.rawValue, forKey: "figurenStil") }
    }
}

/// Paw-Patrol-Modus: Jede Figur ist ein HUND aus dem Team (mit Fahrzeug-Abzeichen)
func pawPatrolGlyph(_ type: ChessPieceType) -> String {
    switch type {
    case .king:   return "🐕‍🦺"   // Chase - der Polizeihund mit Geschirr
    case .queen:  return "🐩"    // Skye - die flinke Pudel-Pilotin
    case .rook:   return "🐕"    // Marshall - der Feuerwehr-Dalmatiner
    case .bishop: return "🦮"    // Rocky - der Recycling-Hund
    case .knight: return "🐶"    // Rubble - der Bagger-Welpe
    case .pawn:   return "🐾"    // Die tapferen Pfoetchen
    }
}

/// Original-Erkennungsfarbe des Charakters (Muetze/Helm wie in der Serie):
/// Chase = Polizei-Blau, Marshall = Feuerwehr-Rot, Skye = Rosa,
/// Rocky = Recycling-Gruen, Rubble = Bauhelm-Gelb
func pawPatrolColor(_ type: ChessPieceType) -> NSColor {
    switch type {
    case .king:   return NSColor(red: 0.12, green: 0.32, blue: 0.85, alpha: 1)   // Chase
    case .queen:  return NSColor(red: 0.95, green: 0.45, blue: 0.70, alpha: 1)   // Skye
    case .rook:   return NSColor(red: 0.85, green: 0.15, blue: 0.10, alpha: 1)   // Marshall
    case .bishop: return NSColor(red: 0.20, green: 0.62, blue: 0.30, alpha: 1)   // Rocky
    case .knight: return NSColor(red: 0.95, green: 0.76, blue: 0.10, alpha: 1)   // Rubble
    case .pawn:   return NSColor(red: 0.55, green: 0.38, blue: 0.22, alpha: 1)   // Pfoetchen
    }
}

/// Fahrzeug-Abzeichen des Charakters (klein in der Chip-Ecke)
func pawPatrolBadge(_ type: ChessPieceType) -> String {
    switch type {
    case .king:   return "🚓"    // Chase: Polizeiauto
    case .queen:  return "🚁"    // Skye: Helikopter
    case .rook:   return "🚒"    // Marshall: Feuerwehrauto
    case .bishop: return "♻️"    // Rocky: Recycling
    case .knight: return "🚜"    // Rubble: Bagger
    case .pawn:   return ""      // Pfoetchen: kein Fahrzeug
    }
}

extension ChessPieceType {
    /// Anzeigename je nach Figuren-Stil: Im Paw-Patrol-Modus "Marshall (Turm)",
    /// klassisch einfach "Turm". So lernen Kinder beide Namen gleichzeitig!
    var displayName: String {
        if Piece3DFactory.active3D {
            // Im 3D-Brett: eigenes Hunde-Team ("Bruno (Koenig)") oder klassisch
            return Piece3DFactory.dogMode ? "\(Piece3DFactory.dogName(self)) (\(name))" : name
        }
        return PieceStyle.current == .pawPatrol ? "\(pawPatrolName(self)) (\(name))" : name
    }
}

/// Name des Paw-Patrol-Charakters (fuer Erklaerungen und Legende)
func pawPatrolName(_ type: ChessPieceType) -> String {
    switch type {
    case .king:   return "Chase"
    case .queen:  return "Skye"
    case .rook:   return "Marshall"
    case .bishop: return "Rocky"
    case .knight: return "Rubble"
    case .pawn:   return "Pfoetchen"
    }
}

// MARK: - Brett-Farbthemen (NEU: 6 Themen, im Spiel umschaltbar)

struct BoardTheme {
    let name: String
    let light: NSColor
    let dark: NSColor
    let border: NSColor

    static let themes: [BoardTheme] = [
        BoardTheme(name: "Klassik Gruen",
                   light: NSColor(red: 0.93, green: 0.93, blue: 0.82, alpha: 1),
                   dark: NSColor(red: 0.46, green: 0.59, blue: 0.34, alpha: 1),
                   border: NSColor(red: 0.28, green: 0.40, blue: 0.22, alpha: 1)),
        BoardTheme(name: "Holz",
                   light: NSColor(red: 0.94, green: 0.85, blue: 0.71, alpha: 1),
                   dark: NSColor(red: 0.63, green: 0.43, blue: 0.27, alpha: 1),
                   border: NSColor(red: 0.38, green: 0.24, blue: 0.13, alpha: 1)),
        BoardTheme(name: "Ozean",
                   light: NSColor(red: 0.87, green: 0.92, blue: 0.96, alpha: 1),
                   dark: NSColor(red: 0.32, green: 0.50, blue: 0.70, alpha: 1),
                   border: NSColor(red: 0.16, green: 0.28, blue: 0.42, alpha: 1)),
        BoardTheme(name: "Candy",
                   light: NSColor(red: 0.99, green: 0.93, blue: 0.96, alpha: 1),
                   dark: NSColor(red: 0.85, green: 0.51, blue: 0.68, alpha: 1),
                   border: NSColor(red: 0.55, green: 0.25, blue: 0.42, alpha: 1)),
        BoardTheme(name: "Nacht",
                   light: NSColor(red: 0.62, green: 0.64, blue: 0.68, alpha: 1),
                   dark: NSColor(red: 0.28, green: 0.30, blue: 0.36, alpha: 1),
                   border: NSColor(red: 0.12, green: 0.13, blue: 0.16, alpha: 1)),
        BoardTheme(name: "Turnier Braun",
                   light: NSColor(red: 0.94, green: 0.89, blue: 0.79, alpha: 1),
                   dark: NSColor(red: 0.71, green: 0.53, blue: 0.39, alpha: 1),
                   border: NSColor(red: 0.42, green: 0.29, blue: 0.19, alpha: 1))
    ]

    /// Aktuell gewaehltes Thema (gespeichert in den Einstellungen)
    static var currentIndex: Int {
        get { UserDefaults.standard.integer(forKey: "farbThema") % themes.count }
        set { UserDefaults.standard.set(newValue % themes.count, forKey: "farbThema") }
    }
    static var current: BoardTheme { themes[currentIndex] }
}

// MARK: - Design Helpers

extension NSColor {
    static let chessBrown    = NSColor(red: 0.36, green: 0.22, blue: 0.09, alpha: 1)
    static let chessGold     = NSColor(red: 0.72, green: 0.52, blue: 0.08, alpha: 1)
    static let chessGreen    = NSColor(red: 0.16, green: 0.42, blue: 0.25, alpha: 1)
    static let boardDark     = NSColor(red: 0.46, green: 0.59, blue: 0.34, alpha: 1)
    static let boardLight    = NSColor(red: 0.93, green: 0.93, blue: 0.82, alpha: 1)
    static let menuBg        = NSColor(red: 0.98, green: 0.97, blue: 0.95, alpha: 1)
    static let cardBorder    = NSColor(red: 0.86, green: 0.84, blue: 0.80, alpha: 1)
    static let cardHighlight = NSColor(red: 0.22, green: 0.52, blue: 0.30, alpha: 1)
}

// MARK: - Gradient Chess Title

class ChessGradientTitleView: NSView {
    var text = "Schach"
    private let gradient = NSGradient(colors: [
        NSColor(red: 0.25, green: 0.14, blue: 0.06, alpha: 1),
        NSColor(red: 0.68, green: 0.48, blue: 0.06, alpha: 1)
    ], atLocations: [0.0, 1.0], colorSpace: .deviceRGB)!

    override var intrinsicContentSize: NSSize { NSSize(width: 300, height: 68) }

    override func draw(_ dirtyRect: NSRect) {
        guard let ctx = NSGraphicsContext.current?.cgContext else { return }
        let font = NSFont.systemFont(ofSize: 52, weight: .heavy)
        let str = text as NSString
        let sz  = str.size(withAttributes: [.font: font])
        let origin = NSPoint(x: (bounds.width - sz.width) / 2, y: (bounds.height - sz.height) / 2)
        ctx.saveGState()
        ctx.setTextDrawingMode(.clip)
        str.draw(at: origin, withAttributes: [.font: font])
        gradient.draw(in: bounds, angle: 90)
        ctx.restoreGState()
    }
}

/// Textzelle, die ihren Text vertikal zentriert
final class VCenterTextCell: NSTextFieldCell {
    override func drawingRect(forBounds rect: NSRect) -> NSRect {
        let r = super.drawingRect(forBounds: rect)
        let h = cellSize(forBounds: r).height
        return NSRect(x: r.minX, y: r.minY + max(0, (r.height - h) / 2), width: r.width, height: min(h, r.height))
    }
}

/// v3.1: Statuszeile, die nichts abschneidet: verkleinert die Schrift und bricht notfalls in 2 Zeilen um
final class FitLabel: NSTextField {
    override class var cellClass: AnyClass? {
        get { VCenterTextCell.self }
        set { }
    }

    override var stringValue: String {
        didSet { fit() }
    }

    override func setFrameSize(_ newSize: NSSize) {
        super.setFrameSize(newSize)
        fit()
    }

    func fit() {
        let avail = bounds.width - 8
        guard avail > 20 else { return }
        var size: CGFloat = 14
        func width(_ sz: CGFloat) -> CGFloat {
            (stringValue as NSString).size(withAttributes: [.font: NSFont.systemFont(ofSize: sz, weight: .semibold)]).width
        }
        while size > 11.5 && width(size) > avail { size -= 0.5 }
        let twoLines = width(size) > avail
        if twoLines { size = 12 }
        font = NSFont.systemFont(ofSize: size, weight: .semibold)
        maximumNumberOfLines = twoLines ? 2 : 1
        lineBreakMode = twoLines ? .byWordWrapping : .byTruncatingTail
        cell?.wraps = twoLines
        cell?.truncatesLastVisibleLine = true
    }
}

/// Dokument-View mit Ursprung oben links (Scroll-Menue startet oben)
final class FlippedView: NSView {
    override var isFlipped: Bool { true }
}

// MARK: - Mini Chess Board

class MiniChessBoardView: NSView {
    private let startBoard = ChessBoard()
    override var intrinsicContentSize: NSSize { NSSize(width: 240, height: 240) }

    override func draw(_ dirtyRect: NSRect) {
        let sz = min(bounds.width, bounds.height)
        let cell = sz / 8
        let ox = (bounds.width - sz) / 2, oy = (bounds.height - sz) / 2

        // Border
        NSColor.chessBrown.withAlphaComponent(0.8).setFill()
        NSBezierPath(roundedRect: NSRect(x: ox-3, y: oy-3, width: sz+6, height: sz+6), xRadius: 6, yRadius: 6).fill()

        for r in 0..<8 { for c in 0..<8 {
            let x = ox + CGFloat(c) * cell, y = oy + CGFloat(r) * cell
            let rect = NSRect(x: x, y: y, width: cell, height: cell)
            ((r + c) % 2 == 1 ? BoardTheme.current.dark : BoardTheme.current.light).setFill()
            rect.fill()

            if let piece = startBoard.grid[r][c] {
                let sym = chessPieceChar(piece.type, piece.color) as NSString
                let font = NSFont.systemFont(ofSize: cell * 0.68)
                let tsz = sym.size(withAttributes: [.font: font])
                sym.draw(at: NSPoint(x: rect.midX - tsz.width/2, y: rect.midY - tsz.height/2),
                         withAttributes: [.font: font])
            }
        }}
    }
}

// MARK: - Menu Card View

class MenuCardView: NSView {
    var isAccented = false { didSet { updateStyle() } }

    override init(frame: NSRect) {
        super.init(frame: frame)
        wantsLayer = true
        layer?.backgroundColor = NSColor.white.cgColor
        layer?.cornerRadius = 14
        layer?.borderWidth = 1.5
        layer?.borderColor = NSColor.cardBorder.cgColor
        layer?.shadowColor = NSColor.black.cgColor
        layer?.shadowOpacity = 0.06
        layer?.shadowOffset = CGSize(width: 0, height: -2)
        layer?.shadowRadius = 8
    }
    required init?(coder: NSCoder) { fatalError() }

    func updateStyle() {
        layer?.borderColor = isAccented ? NSColor.cardHighlight.cgColor : NSColor.cardBorder.cgColor
        layer?.borderWidth = isAccented ? 2 : 1.5
    }
}

// MARK: - 3D-Zug-Animation (Figuren gleiten uebers Brett und "kaempfen" beim Schlagen)

final class PieceAnimationView: NSView {
    override var isFlipped: Bool { true }
    override func hitTest(_ point: NSPoint) -> NSView? { nil }   // Klicks gehen durch

    private var timer: Timer?
    private var startTime: CFTimeInterval = 0
    private var duration: Double = 0.45
    private var fightDuration: Double = 0.38

    private var movingType: ChessPieceType = .pawn
    private var movingIsWhite = true
    private var capturedType: ChessPieceType? = nil
    private var capturedIsWhite = false
    private var style: PieceStyle = .klassisch
    private var fromPoint: NSPoint = .zero
    private var toPoint: NSPoint = .zero
    private var cellSize: CGFloat = 60
    private var completion: (() -> Void)?
    private(set) var isAnimating = false
    private var phase = 0     // 0 = Gleiten, 1 = Kampf, 2 = fertig
    private var sparks: [(angle: CGFloat, speed: CGFloat)] = []

    func animate(moving: (ChessPieceType, PlayerColor), captured: (ChessPieceType, PlayerColor)?,
                 from: NSPoint, to: NSPoint, cell: CGFloat, completion: @escaping () -> Void) {
        movingType = moving.0
        movingIsWhite = moving.1 == .white
        style = PieceStyle.current
        // Paw-Patrol-Modus: laengere, groessere Show - besonders beim Kampf!
        duration = style == .pawPatrol ? 0.55 : 0.45
        fightDuration = style == .pawPatrol ? 0.9 : 0.38
        if let cap = captured {
            capturedType = cap.0
            capturedIsWhite = cap.1 == .white
        } else {
            capturedType = nil
        }
        // Falls noch eine Animation laeuft: sauber abschliessen, damit kein Feld versteckt bleibt
        if isAnimating {
            let old = self.completion
            self.completion = nil
            old?()
        }
        fromPoint = from; toPoint = to; cellSize = cell
        self.completion = completion
        isAnimating = true
        phase = 0
        startTime = ProcessInfo.processInfo.systemUptime
        // Funken fuer den Kampf vorbereiten (deterministisch pseudo-zufaellig)
        sparks = []
        for i in 0..<10 {
            let angle: CGFloat = CGFloat(i) * (CGFloat.pi * 2.0 / 10.0) + CGFloat(i % 3) * 0.2
            let speed: CGFloat = 0.6 + CGFloat((i * 37) % 50) / 100.0
            sparks.append((angle: angle, speed: speed))
        }
        timer?.invalidate()
        timer = Timer.scheduledTimer(withTimeInterval: 1.0 / 60.0, repeats: true) { [weak self] _ in
            self?.tick()
        }
        RunLoop.main.add(timer!, forMode: .common)
        needsDisplay = true
    }

    func cancel() {
        timer?.invalidate(); timer = nil
        isAnimating = false
        needsDisplay = true
        let done = completion; completion = nil
        done?()
    }

    private func tick() {
        let elapsed = ProcessInfo.processInfo.systemUptime - startTime
        if phase == 0 && elapsed >= duration {
            if capturedType != nil {
                phase = 1
                startTime = ProcessInfo.processInfo.systemUptime
            } else {
                finish()
                return
            }
        } else if phase == 1 && elapsed >= fightDuration {
            finish()
            return
        }
        needsDisplay = true
    }

    private func finish() {
        timer?.invalidate(); timer = nil
        isAnimating = false
        needsDisplay = true
        let done = completion; completion = nil
        done?()
    }

    /// Zeichnet eine Figur: IMMER in echter Schachform (Turm = Turm!).
    /// Im Paw-Patrol-Modus sitzt der Hundekopf mit Original-Muetze OBEN AUF der Figur;
    /// Pfoetchen-Bauern fliegen als Pfoten-Chip.
    private func drawAnimPiece(type: ChessPieceType, white: Bool, center: NSPoint, size: CGFloat, alpha: CGFloat = 1.0) {
        let teamColor: NSColor = white ? NSColor(red: 0.85, green: 0.1, blue: 0.1, alpha: alpha)
                                       : NSColor(red: 0.15, green: 0.4, blue: 0.95, alpha: alpha)

        if style == .pawPatrol && type == .pawn {
            // Pfoetchen-Chip fliegt
            let r = size * 0.42
            let disc = NSRect(x: center.x - r, y: center.y - r, width: r * 2, height: r * 2)
            (white ? NSColor(white: 1.0, alpha: 0.95 * alpha) : NSColor(white: 0.13, alpha: 0.95 * alpha)).setFill()
            let p = NSBezierPath(ovalIn: disc); p.fill()
            teamColor.setStroke(); p.lineWidth = max(1.5, size * 0.04); p.stroke()
            let pawE = "🐾" as NSString
            let pa: [NSAttributedString.Key: Any] = [.font: NSFont.systemFont(ofSize: size * 0.45)]
            let ps = pawE.size(withAttributes: pa)
            pawE.draw(at: NSPoint(x: center.x - ps.width / 2, y: center.y - ps.height / 2), withAttributes: pa)
            return
        }

        let attrs = pieceAttributes(white: white, size: size, alpha: alpha)
        let str = chessPieceChar(type, white ? .white : .black) as NSString
        let sz = str.size(withAttributes: attrs)
        str.draw(at: NSPoint(x: center.x - sz.width / 2, y: center.y - sz.height / 2), withAttributes: attrs)

        if style == .pawPatrol {
            // Hundekopf mit Original-Muetze oben auf der fliegenden Figur
            let headSize = size * 0.34
            let headC = NSPoint(x: center.x, y: center.y - size * 0.32)
            let haloR = headSize * 0.55
            let halo = NSRect(x: headC.x - haloR, y: headC.y - haloR, width: haloR * 2, height: haloR * 2)
            NSColor(white: 1.0, alpha: 0.85 * alpha).setFill()
            let hp = NSBezierPath(ovalIn: halo); hp.fill()
            teamColor.setStroke(); hp.lineWidth = max(1.0, size * 0.02); hp.stroke()

            let capColor = pawPatrolColor(type).withAlphaComponent(alpha)
            let capW = haloR * 1.6, capH = haloR * 0.85
            let capRect = NSRect(x: headC.x - capW / 2, y: headC.y - haloR - capH * 0.35, width: capW, height: capH)
            capColor.setFill()
            NSBezierPath(ovalIn: capRect).fill()

            let dog = pawPatrolGlyph(type) as NSString
            let da: [NSAttributedString.Key: Any] = [.font: NSFont.systemFont(ofSize: headSize)]
            let ds = dog.size(withAttributes: da)
            dog.draw(at: NSPoint(x: headC.x - ds.width / 2, y: headC.y - ds.height / 2), withAttributes: da)
        }
    }

    private func pieceAttributes(white: Bool, size: CGFloat, alpha: CGFloat = 1.0) -> [NSAttributedString.Key: Any] {
        let fillColor: NSColor = white ? NSColor.white.withAlphaComponent(alpha) : NSColor(white: 0.08, alpha: alpha)
        let strokeClr: NSColor = white ? NSColor(white: 0.25, alpha: alpha) : NSColor(white: 0.0, alpha: 0.7 * alpha)
        let shadow = NSShadow()
        shadow.shadowColor = NSColor.black.withAlphaComponent(0.5 * alpha)
        shadow.shadowOffset = NSSize(width: 2, height: -3)
        shadow.shadowBlurRadius = 6
        return [
            .font: NSFont.systemFont(ofSize: size),
            .foregroundColor: fillColor,
            .strokeColor: strokeClr,
            .strokeWidth: -1.2,
            .shadow: shadow
        ]
    }

    override func draw(_ dirtyRect: NSRect) {
        guard isAnimating else { return }
        let elapsed = ProcessInfo.processInfo.systemUptime - startTime

        if phase == 0 {
            // ── Gleitphase: Figur "hebt ab" (waechst + Schatten) und fliegt in leichtem Bogen ──
            let t = min(1.0, elapsed / duration)
            // Ease in-out
            let e = t < 0.5 ? 2 * t * t : 1 - pow(-2 * t + 2, 2) / 2
            let x = fromPoint.x + (toPoint.x - fromPoint.x) * CGFloat(e)
            var y = fromPoint.y + (toPoint.y - fromPoint.y) * CGFloat(e)
            // "3D"-Bogen: Figur hebt in der Mitte des Weges ab
            let lift = CGFloat(sin(e * .pi)) * cellSize * 0.35
            y -= lift
            let scale = 1.0 + CGFloat(sin(e * .pi)) * 0.4

            // Bodenschatten (bleibt am Boden, wird kleiner je hoeher die Figur)
            let shadowW = cellSize * 0.55 * (1.0 - CGFloat(sin(e * .pi)) * 0.35)
            let groundY = fromPoint.y + (toPoint.y - fromPoint.y) * CGFloat(e)
            let shadowRect = NSRect(x: x - shadowW / 2, y: groundY + cellSize * 0.32,
                                    width: shadowW, height: cellSize * 0.14)
            NSColor.black.withAlphaComponent(0.30).setFill()
            NSBezierPath(ovalIn: shadowRect).fill()

            // Paw-Patrol: Pfotenspuren auf dem Flugweg 🐾
            if style == .pawPatrol, let ctx = NSGraphicsContext.current {
                let steps = 5
                for i in 1...steps {
                    let f = CGFloat(i) / CGFloat(steps + 1)
                    if f < CGFloat(e) {
                        let px = fromPoint.x + (toPoint.x - fromPoint.x) * f
                        let py = fromPoint.y + (toPoint.y - fromPoint.y) * f
                        let alpha = max(0.0, 0.8 - (CGFloat(e) - f) * 1.6)
                        if alpha > 0.04 {
                            ctx.saveGraphicsState()
                            ctx.cgContext.setAlpha(alpha)
                            let paw = "🐾" as NSString
                            let a: [NSAttributedString.Key: Any] = [.font: NSFont.systemFont(ofSize: cellSize * 0.26)]
                            let psz = paw.size(withAttributes: a)
                            paw.draw(at: NSPoint(x: px - psz.width / 2, y: py - psz.height / 2 + cellSize * 0.28),
                                     withAttributes: a)
                            ctx.restoreGraphicsState()
                        }
                    }
                }
            }

            // Das Opfer wartet zitternd am Zielfeld
            if let capType = capturedType {
                let tremble = CGFloat(sin(elapsed * 40)) * 1.5 * CGFloat(t) * (style == .pawPatrol ? 2.0 : 1.0)
                drawAnimPiece(type: capType, white: capturedIsWhite,
                              center: NSPoint(x: toPoint.x + tremble, y: toPoint.y), size: cellSize * 0.9)
            }

            // Die fliegende Figur
            drawAnimPiece(type: movingType, white: movingIsWhite,
                          center: NSPoint(x: x, y: y), size: cellSize * 0.95 * scale)

        } else if phase == 1 {
            // ── Kampfphase ──
            let t = min(1.0, elapsed / fightDuration)

            // 🐾 Paw-Patrol: grosse Kampfshow mit Explosion, Knochen, WUFF! und Banner
            if style == .pawPatrol {
                drawPawFight(t: CGFloat(t), elapsed: elapsed)
                return
            }

            // Klassisch: Funken spruehen, das Opfer schrumpft und verblasst
            // Kampf-Wackeln des Angreifers
            let shake = CGFloat(sin(elapsed * 55)) * cellSize * 0.06 * (1 - CGFloat(t))
            let rise = CGFloat(sin(t * .pi)) * cellSize * 0.10

            // Das geschlagene Opfer: schrumpft, kippt weg, verblasst
            if let capType = capturedType {
                let capScale = max(0.05, 1.0 - CGFloat(t) * 1.1)
                let capAlpha = max(0.0, 1.0 - CGFloat(t) * 1.3)
                if capAlpha > 0.02 {
                    let drop = CGFloat(t) * cellSize * 0.25
                    drawAnimPiece(type: capType, white: capturedIsWhite,
                                  center: NSPoint(x: toPoint.x + shake, y: toPoint.y + drop),
                                  size: cellSize * 0.9 * capScale, alpha: capAlpha)
                }
            }

            // Funken / Sterne des Kampfes
            let sparkProgress = CGFloat(t)
            for spark in sparks {
                let dist = sparkProgress * cellSize * 0.9 * spark.speed
                let sx = toPoint.x + cos(spark.angle) * dist
                let sy = toPoint.y + sin(spark.angle) * dist * 0.8
                let alpha = (1 - sparkProgress) * 0.9
                let starSize = cellSize * 0.10 * (1 - sparkProgress * 0.5)
                let starColor = spark.speed > 0.9 ? NSColor.systemYellow : NSColor.systemOrange
                starColor.withAlphaComponent(alpha).setFill()
                let star = NSBezierPath()
                star.move(to: NSPoint(x: sx, y: sy - starSize))
                star.line(to: NSPoint(x: sx + starSize * 0.3, y: sy - starSize * 0.3))
                star.line(to: NSPoint(x: sx + starSize, y: sy))
                star.line(to: NSPoint(x: sx + starSize * 0.3, y: sy + starSize * 0.3))
                star.line(to: NSPoint(x: sx, y: sy + starSize))
                star.line(to: NSPoint(x: sx - starSize * 0.3, y: sy + starSize * 0.3))
                star.line(to: NSPoint(x: sx - starSize, y: sy))
                star.line(to: NSPoint(x: sx - starSize * 0.3, y: sy - starSize * 0.3))
                star.close()
                star.fill()
            }

            // Der Sieger stampft auf
            drawAnimPiece(type: movingType, white: movingIsWhite,
                          center: NSPoint(x: toPoint.x + shake, y: toPoint.y - rise),
                          size: cellSize * 0.95 * (1.0 + (1 - CGFloat(t)) * 0.25))
        }
    }

    // MARK: 🐾 Paw-Patrol-Kampfshow

    /// Comic-Explosion, Knochen-/Pfoten-Funken, zitterndes Opfer, huepfender Held,
    /// "WUFF!"-Schrift und Namens-Banner ("Chase schnappt sich Marshall!")
    private func drawPawFight(t: CGFloat, elapsed: Double) {
        guard let capType = capturedType else { return }
        let ctx = NSGraphicsContext.current

        // 1) Comic-Explosion (gelb-oranger Zackenstern) hinter dem Kampf
        let pulse: CGFloat = CGFloat(sin(Double(t) * Double.pi))
        let burstR: CGFloat = cellSize * 0.95 * (0.65 + 0.35 * pulse)
        let burst = NSBezierPath()
        let spikes = 12
        for i in 0..<(spikes * 2) {
            let ang: CGFloat = CGFloat(i) * (CGFloat.pi / CGFloat(spikes))
            let r: CGFloat = (i % 2 == 0) ? burstR : burstR * 0.55
            let px: CGFloat = toPoint.x + cos(ang) * r
            let py: CGFloat = toPoint.y + sin(ang) * r
            if i == 0 { burst.move(to: NSPoint(x: px, y: py)) } else { burst.line(to: NSPoint(x: px, y: py)) }
        }
        burst.close()
        var burstAlpha: CGFloat = 0.85
        if t > 0.75 { burstAlpha = max(0.0, 0.85 - (t - 0.75) * 3.4) }
        NSColor.systemYellow.withAlphaComponent(burstAlpha * 0.75).setFill()
        burst.fill()
        NSColor.systemOrange.withAlphaComponent(burstAlpha).setStroke()
        burst.lineWidth = 2.5
        burst.stroke()

        // 2) Knochen- und Pfoten-Funken fliegen heraus
        let emojiSet = ["🦴", "🐾", "⭐", "💥"]
        for (idx, spark) in sparks.enumerated() {
            let dist: CGFloat = t * cellSize * 1.25 * spark.speed
            let sx: CGFloat = toPoint.x + cos(spark.angle) * dist
            let sy: CGFloat = toPoint.y + sin(spark.angle) * dist * 0.85
            let alpha: CGFloat = max(0.0, (1.0 - t) * 1.1)
            if alpha <= 0.03 { continue }
            ctx?.saveGraphicsState()
            ctx?.cgContext.setAlpha(min(1.0, alpha))
            let e = emojiSet[idx % emojiSet.count] as NSString
            let fSize: CGFloat = cellSize * 0.30 * (1.0 - t * 0.4)
            let a: [NSAttributedString.Key: Any] = [.font: NSFont.systemFont(ofSize: fSize)]
            let s = e.size(withAttributes: a)
            e.draw(at: NSPoint(x: sx - s.width / 2, y: sy - s.height / 2), withAttributes: a)
            ctx?.restoreGraphicsState()
        }

        // 3) Das Opfer: zittert erst heftig, schrumpft dann weg
        let shake: CGFloat = CGFloat(sin(elapsed * 50)) * cellSize * 0.09 * (1.0 - t)
        if t < 0.55 {
            drawAnimPiece(type: capType, white: capturedIsWhite,
                          center: NSPoint(x: toPoint.x + cellSize * 0.22 + shake, y: toPoint.y + cellSize * 0.05),
                          size: cellSize * 1.0)
        } else {
            let f: CGFloat = (t - 0.55) / 0.45
            let capScale: CGFloat = max(0.05, 1.0 - f * 1.05)
            let capAlpha: CGFloat = max(0.0, 1.0 - f * 1.2)
            if capAlpha > 0.02 {
                drawAnimPiece(type: capType, white: capturedIsWhite,
                              center: NSPoint(x: toPoint.x + cellSize * 0.25, y: toPoint.y + f * cellSize * 0.35),
                              size: cellSize * capScale, alpha: capAlpha)
            }
        }

        // 4) Der Held: extra gross und mit Sieger-Huepfern
        let heroJump: CGFloat = abs(CGFloat(sin(Double(t) * Double.pi * 3.0))) * cellSize * 0.18
        drawAnimPiece(type: movingType, white: movingIsWhite,
                      center: NSPoint(x: toPoint.x - cellSize * 0.18 + shake * 0.5, y: toPoint.y - heroJump),
                      size: cellSize * 1.25)

        // 5) "WUFF!"-Comic-Schrift
        if t > 0.1 && t < 0.6 {
            drawComicText("WUFF!", at: NSPoint(x: toPoint.x - cellSize * 0.95, y: toPoint.y - cellSize * 0.85),
                          size: cellSize * 0.34)
        }

        // 6) Namens-Banner
        let banner = "💥 \(pawPatrolName(movingType)) schnappt sich \(pawPatrolName(capType))!"
        drawBanner(banner, nearY: toPoint.y - cellSize * 1.2, alpha: min(1.0, t * 2.5))
    }

    private func drawComicText(_ text: String, at p: NSPoint, size: CGFloat) {
        let str = text as NSString
        let attrs: [NSAttributedString.Key: Any] = [
            .font: NSFont.systemFont(ofSize: size, weight: .black),
            .foregroundColor: NSColor.systemYellow,
            .strokeColor: NSColor.systemRed,
            .strokeWidth: NSNumber(value: -3.0)
        ]
        str.draw(at: p, withAttributes: attrs)
    }

    private func drawBanner(_ text: String, nearY: CGFloat, alpha: CGFloat) {
        let str = text as NSString
        let fontSize: CGFloat = max(11.0, cellSize * 0.24)
        let attrs: [NSAttributedString.Key: Any] = [
            .font: NSFont.systemFont(ofSize: fontSize, weight: .bold),
            .foregroundColor: NSColor.white.withAlphaComponent(alpha)
        ]
        let s = str.size(withAttributes: attrs)
        var x: CGFloat = toPoint.x - s.width / 2
        x = max(4.0, min(bounds.width - s.width - 4.0, x))
        var y: CGFloat = nearY
        y = max(4.0, min(bounds.height - s.height - 4.0, y))
        let pad: CGFloat = 7.0
        let rect = NSRect(x: x - pad, y: y - 3.0, width: s.width + pad * 2.0, height: s.height + 6.0)
        NSColor(red: 0.85, green: 0.25, blue: 0.1, alpha: 0.85 * alpha).setFill()
        NSBezierPath(roundedRect: rect, xRadius: 8, yRadius: 8).fill()
        str.draw(at: NSPoint(x: x, y: y), withAttributes: attrs)
    }
}

// MARK: - v3 Echtes 3D: Gedrechselte Figuren (SceneKit)

/// Zeichnet ein Bild in eine Bitmap (robust fuer SceneKit-Texturen)
func renderBitmapImage(width: Int, height: Int, _ draw: (NSRect) -> Void) -> NSImage {
    let rep = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: width, pixelsHigh: height,
                               bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false,
                               colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
    NSGraphicsContext.saveGraphicsState()
    NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: rep)
    draw(NSRect(x: 0, y: 0, width: width, height: height))
    NSGraphicsContext.restoreGraphicsState()
    let img = NSImage(size: NSSize(width: width, height: height))
    img.addRepresentation(rep)
    return img
}

/// Zufallszahl als CGFloat (vermeidet mehrdeutige SCNVector3-Initialisierer)
@inline(__always) func rnd(_ a: CGFloat, _ b: CGFloat) -> CGFloat { CGFloat.random(in: a...b) }

/// Baut Staunton-Figuren aus Drehprofilen ("gedrechselt") plus Anbauteilen (Zinnen, Krone, Kreuz, Pferdekopf).
enum Piece3DFactory {
    private static var geometryCache: [String: SCNGeometry] = [:]

    static let whiteMaterial: SCNMaterial = {
        let m = SCNMaterial()
        m.lightingModel = .physicallyBased
        m.diffuse.contents = NSColor(calibratedRed: 0.90, green: 0.83, blue: 0.70, alpha: 1)
        m.roughness.contents = NSNumber(value: 0.42)
        m.metalness.contents = NSNumber(value: 0.0)
        return m
    }()

    static let blackMaterial: SCNMaterial = {
        let m = SCNMaterial()
        m.lightingModel = .physicallyBased
        m.diffuse.contents = NSColor(calibratedRed: 0.11, green: 0.085, blue: 0.075, alpha: 1)
        m.roughness.contents = NSNumber(value: 0.24)
        m.metalness.contents = NSNumber(value: 0.0)
        return m
    }()

    static func material(_ c: PlayerColor) -> SCNMaterial { c == .white ? whiteMaterial : blackMaterial }

    /// v3.1: eigenes Hunde-Team im 3D-Brett aktiv?
    static var dogMode = false
    /// v3.1: 3D-Brett sichtbar? (steuert die Anzeigenamen der Figuren)
    static var active3D = false

    static func key(_ p: ChessPiece) -> String { "P_\(p.color == .white ? "w" : "b")\(p.type.rawValue)\(dogMode ? "d" : "")" }

    /// Hoehe der Figur (fuer Namensschilder & Effekte)
    /// Figuren etwas groesser als das Rohprofil (Standfuss ~75 % des Feldes wie bei Turnierbrettern)
    static let formScale: CGFloat = 1.12

    static func height(_ t: ChessPieceType) -> CGFloat {
        dogMode ? dogHeight(t) : formScale * rawHeight(t)
    }

    static func rawHeight(_ t: ChessPieceType) -> CGFloat {
        switch t {
        case .pawn: return 0.62
        case .rook: return 0.77
        case .knight: return 0.90
        case .bishop: return 0.88
        case .queen: return 0.98
        case .king: return 1.10
        }
    }

    /// Rotationskoerper aus einem Profil (x = Radius, y = Hoehe), von unten nach oben
    static func lathe(_ profile: [CGPoint], segments: Int = 48) -> SCNGeometry {
        var verts: [SCNVector3] = []
        var norms: [SCNVector3] = []
        var idx: [UInt32] = []
        let n = profile.count
        for i in 0..<n {
            let p = profile[i]
            let prev = profile[max(0, i - 1)], next = profile[min(n - 1, i + 1)]
            var tx = next.x - prev.x, ty = next.y - prev.y
            let len = max(0.0001, sqrt(tx * tx + ty * ty))
            tx /= len; ty /= len
            let nx = ty, ny = -tx
            for j in 0...segments {
                let a = CGFloat(j) / CGFloat(segments) * 2 * CGFloat.pi
                let c = cos(a), s = sin(a)
                verts.append(SCNVector3(p.x * c, p.y, p.x * s))
                norms.append(SCNVector3(nx * c, ny, nx * s))
            }
        }
        let ring = UInt32(segments + 1)
        for i in 0..<(n - 1) {
            for j in 0..<segments {
                let a = UInt32(i) * ring + UInt32(j)
                let b = a + 1, c = a + ring, d = c + 1
                idx += [a, c, b, b, c, d]
            }
        }
        return SCNGeometry(sources: [SCNGeometrySource(vertices: verts), SCNGeometrySource(normals: norms)],
                           elements: [SCNGeometryElement(indices: idx, primitiveType: .triangles)])
    }

    static func arc(cy: CGFloat, rx: CGFloat, ry: CGFloat, fromDeg: CGFloat, toDeg: CGFloat, steps: Int) -> [CGPoint] {
        (0...steps).map { i in
            let a = (fromDeg + (toDeg - fromDeg) * CGFloat(i) / CGFloat(steps)) * CGFloat.pi / 180
            return CGPoint(x: max(0, rx * cos(a)), y: cy + ry * sin(a))
        }
    }

    static func base(_ r: CGFloat) -> [CGPoint] {
        [CGPoint(x: 0, y: 0), CGPoint(x: r, y: 0), CGPoint(x: r, y: 0.05), CGPoint(x: r - 0.025, y: 0.075),
         CGPoint(x: r - 0.03, y: 0.09), CGPoint(x: r - 0.07, y: 0.11), CGPoint(x: r - 0.10, y: 0.125)]
    }

    private static func pts(_ a: [(CGFloat, CGFloat)]) -> [CGPoint] { a.map { CGPoint(x: $0.0, y: $0.1) } }

    static func profile(_ t: ChessPieceType) -> [CGPoint] {
        switch t {
        case .pawn:
            return base(0.30) + pts([(0.19, 0.14), (0.13, 0.26), (0.105, 0.34), (0.16, 0.36), (0.16, 0.385), (0.10, 0.40)])
                + arc(cy: 0.50, rx: 0.115, ry: 0.115, fromDeg: -60, toDeg: 90, steps: 12)
        case .rook:
            return base(0.33) + pts([(0.22, 0.15), (0.19, 0.30), (0.18, 0.46), (0.21, 0.49), (0.25, 0.52),
                                     (0.25, 0.66), (0.19, 0.66), (0.19, 0.60), (0.0, 0.60)])
        case .knight:
            return base(0.32) + pts([(0.22, 0.15), (0.21, 0.19), (0.0, 0.20)])
        case .bishop:
            return base(0.31) + pts([(0.19, 0.15), (0.125, 0.40), (0.175, 0.43), (0.175, 0.455), (0.105, 0.475)])
                + arc(cy: 0.62, rx: 0.13, ry: 0.17, fromDeg: -62, toDeg: 90, steps: 14)
        case .queen:
            return base(0.34) + pts([(0.21, 0.15), (0.135, 0.48), (0.20, 0.52), (0.20, 0.545), (0.13, 0.575),
                                     (0.12, 0.66), (0.20, 0.81), (0.17, 0.82), (0.10, 0.84), (0.0, 0.86)])
        case .king:
            return base(0.345) + pts([(0.21, 0.15), (0.14, 0.56), (0.215, 0.60), (0.215, 0.625), (0.145, 0.65),
                                      (0.13, 0.74), (0.20, 0.88), (0.0, 0.90)])
        }
    }

    static func bodyGeometry(_ t: ChessPieceType, _ c: PlayerColor) -> SCNGeometry {
        let k = "\(t.rawValue)\(c.rawValue)"
        if let g = geometryCache[k] { return g }
        let g = lathe(profile(t))
        g.materials = [material(c)]
        geometryCache[k] = g
        return g
    }

    /// Seitenansicht eines Pferdekopfes (+x = Blickrichtung), wird zu einem 3D-Koerper extrudiert
    static func knightHeadPath() -> NSBezierPath {
        let p = NSBezierPath()
        p.move(to: NSPoint(x: -0.20, y: 0.16))
        p.line(to: NSPoint(x: 0.17, y: 0.16))
        p.curve(to: NSPoint(x: 0.07, y: 0.42), controlPoint1: NSPoint(x: 0.17, y: 0.28), controlPoint2: NSPoint(x: 0.08, y: 0.34))
        p.curve(to: NSPoint(x: 0.28, y: 0.52), controlPoint1: NSPoint(x: 0.14, y: 0.47), controlPoint2: NSPoint(x: 0.24, y: 0.47))
        p.curve(to: NSPoint(x: 0.28, y: 0.63), controlPoint1: NSPoint(x: 0.33, y: 0.55), controlPoint2: NSPoint(x: 0.33, y: 0.61))
        p.curve(to: NSPoint(x: 0.07, y: 0.80), controlPoint1: NSPoint(x: 0.22, y: 0.68), controlPoint2: NSPoint(x: 0.12, y: 0.74))
        p.line(to: NSPoint(x: 0.05, y: 0.90))
        p.line(to: NSPoint(x: -0.03, y: 0.82))
        p.curve(to: NSPoint(x: -0.22, y: 0.55), controlPoint1: NSPoint(x: -0.14, y: 0.78), controlPoint2: NSPoint(x: -0.22, y: 0.68))
        p.curve(to: NSPoint(x: -0.20, y: 0.16), controlPoint1: NSPoint(x: -0.22, y: 0.40), controlPoint2: NSPoint(x: -0.26, y: 0.26))
        p.close()
        p.flatness = 0.002
        return p
    }

    private static func part(_ g: SCNGeometry, _ m: SCNMaterial, _ pos: SCNVector3) -> SCNNode {
        g.materials = [m]
        let n = SCNNode(geometry: g)
        n.position = pos
        return n
    }

    static func makePiece(_ piece: ChessPiece) -> SCNNode {
        if dogMode { return makeDogPiece(piece) }
        let outer = SCNNode()
        outer.name = key(piece)
        let root = SCNNode()          // "Form": enthaelt alle Teile, leicht vergroessert
        root.scale = SCNVector3(formScale, formScale, formScale)
        outer.addChildNode(root)
        let mat = material(piece.color)
        root.addChildNode(SCNNode(geometry: bodyGeometry(piece.type, piece.color)))

        switch piece.type {
        case .rook:
            for k in 0..<6 {
                let a = CGFloat(k) * CGFloat.pi / 3 + CGFloat.pi / 6
                let n = part(SCNBox(width: 0.12, height: 0.11, length: 0.07, chamferRadius: 0.012), mat,
                             SCNVector3(0.215 * cos(a), 0.715, 0.215 * sin(a)))
                n.eulerAngles = SCNVector3(0, -(a + CGFloat.pi / 2), 0)
                root.addChildNode(n)
            }
        case .knight:
            let shape = SCNShape(path: knightHeadPath(), extrusionDepth: 0.2)
            shape.chamferRadius = 0.02
            shape.materials = [mat]
            let head = SCNNode(geometry: shape)
            head.name = "kopf"
            // Dreiviertel-Profil: schaut Richtung Gegner, leicht zur Seite gedreht (so erkennt man den Pferdekopf)
            head.eulerAngles = SCNVector3(0, piece.color == .white ? 0.87 : CGFloat.pi + 0.87, 0)
            let eyeMat = SCNMaterial()
            eyeMat.lightingModel = .physicallyBased
            eyeMat.diffuse.contents = piece.color == .white ? NSColor(white: 0.12, alpha: 1) : NSColor(white: 0.75, alpha: 1)
            for z in [CGFloat(0.1), CGFloat(-0.1)] {
                head.addChildNode(part(SCNSphere(radius: 0.022), eyeMat, SCNVector3(0.14, 0.70, z)))
            }
            // Maehne als kleine Leiste
            let mane = part(SCNBox(width: 0.05, height: 0.30, length: 0.06, chamferRadius: 0.02), mat, SCNVector3(-0.19, 0.56, 0))
            mane.eulerAngles = SCNVector3(0, 0, 0.25)
            head.addChildNode(mane)
            root.addChildNode(head)
        case .bishop:
            root.addChildNode(part(SCNSphere(radius: 0.045), mat, SCNVector3(0, 0.83, 0)))
            let slitMat = SCNMaterial()
            slitMat.lightingModel = .physicallyBased
            slitMat.diffuse.contents = piece.color == .white
                ? NSColor(calibratedRed: 0.35, green: 0.30, blue: 0.25, alpha: 1)
                : NSColor(calibratedRed: 0.42, green: 0.36, blue: 0.30, alpha: 1)
            let slit = part(SCNBox(width: 0.02, height: 0.16, length: 0.29, chamferRadius: 0), slitMat, SCNVector3(0.02, 0.68, 0))
            slit.eulerAngles = SCNVector3(0, 0, 0.55)
            let holder = SCNNode()
            holder.eulerAngles = SCNVector3(0, piece.color == .white ? -CGFloat.pi / 2 : CGFloat.pi / 2, 0)
            holder.addChildNode(slit)
            root.addChildNode(holder)
        case .queen:
            for k in 0..<9 {
                let a = CGFloat(k) * 2 * CGFloat.pi / 9
                root.addChildNode(part(SCNSphere(radius: 0.036), mat, SCNVector3(0.182 * cos(a), 0.835, 0.182 * sin(a))))
            }
            root.addChildNode(part(SCNSphere(radius: 0.062), mat, SCNVector3(0, 0.92, 0)))
        case .king:
            root.addChildNode(part(SCNBox(width: 0.055, height: 0.21, length: 0.055, chamferRadius: 0.01), mat, SCNVector3(0, 0.99, 0)))
            root.addChildNode(part(SCNBox(width: 0.17, height: 0.055, length: 0.055, chamferRadius: 0.01), mat, SCNVector3(0, 1.02, 0)))
        case .pawn:
            break
        }
        return outer
    }

    /// Eigene Material-Kopien fuer einen Knoten (damit Leucht-Effekte nicht alle Figuren faerben)
    static func isolateMaterials(_ node: SCNNode) -> [SCNMaterial] {
        var mats: [SCNMaterial] = []
        node.enumerateHierarchy { n, _ in
            if let g = n.geometry?.copy() as? SCNGeometry {
                g.materials = g.materials.map { ($0.copy() as? SCNMaterial) ?? $0 }
                mats.append(contentsOf: g.materials)
                n.geometry = g
            }
        }
        return mats
    }
}

// MARK: - v3.1 Eigenes 3D-Hunde-Team (frei erfunden)
// Bruno (Bernhardiner) = Koenig · Luna (Windhund) = Dame · Brocken (Bulldogge) = Turm
// Wurzel (Dackel) = Laeufer · Falko (Schaeferhund) = Springer · Welpen = Bauern
// Hundekoepfe aus Grundkoerpern, auf einem gedrechselten Sockel mit Halsband und Figuren-Plakette.

extension Piece3DFactory {
    static func dogName(_ t: ChessPieceType) -> String {
        switch t {
        case .king: return "Bruno"
        case .queen: return "Luna"
        case .rook: return "Brocken"
        case .bishop: return "Wurzel"
        case .knight: return "Falko"
        case .pawn: return "Welpe"
        }
    }

    static func dogBreed(_ t: ChessPieceType) -> String {
        switch t {
        case .king: return "Bernhardiner"
        case .queen: return "Windhund"
        case .rook: return "Bulldogge"
        case .bishop: return "Dackel"
        case .knight: return "Schaeferhund"
        case .pawn: return "Welpe"
        }
    }

    /// Sockelhoehe (Hals) und Kopfgroesse je Figur – der Koenig ist der groesste
    static func dogProportions(_ t: ChessPieceType) -> (baseR: CGFloat, neck: CGFloat, head: CGFloat, hat: CGFloat) {
        switch t {
        case .pawn:   return (0.28, 0.30, 1.10, 0.00)
        case .knight: return (0.31, 0.40, 1.35, 0.20)
        case .bishop: return (0.30, 0.42, 1.30, 0.26)
        case .rook:   return (0.33, 0.38, 1.40, 0.16)
        case .queen:  return (0.32, 0.48, 1.35, 0.10)
        case .king:   return (0.33, 0.52, 1.50, 0.20)
        }
    }

    static func dogHeight(_ t: ChessPieceType) -> CGFloat {
        let p = dogProportions(t)
        return p.neck + 0.30 * p.head + p.hat
    }

    @inline(__always) static func v(_ x: CGFloat, _ y: CGFloat, _ z: CGFloat) -> SCNVector3 { SCNVector3(x, y, z) }

    static func fur(_ c: NSColor, rough: CGFloat = 0.8) -> SCNMaterial {
        let m = SCNMaterial()
        m.lightingModel = .physicallyBased
        m.diffuse.contents = c
        m.roughness.contents = NSNumber(value: Double(rough))
        m.metalness.contents = NSNumber(value: 0.0)
        return m
    }

    static func metal(_ c: NSColor) -> SCNMaterial {
        let m = SCNMaterial()
        m.lightingModel = .physicallyBased
        m.diffuse.contents = c
        m.roughness.contents = NSNumber(value: 0.25)
        m.metalness.contents = NSNumber(value: 0.9)
        return m
    }

    /// Ellipsoid: Kugel mit Skalierung
    static func blob(_ r: CGFloat, _ m: SCNMaterial, _ pos: SCNVector3, _ scale: SCNVector3,
                     _ rot: SCNVector3 = SCNVector3(0, 0, 0)) -> SCNNode {
        let g = SCNSphere(radius: r)
        g.segmentCount = 28
        g.materials = [m]
        let n = SCNNode(geometry: g)
        n.position = pos
        n.scale = scale
        n.eulerAngles = rot
        return n
    }

    private static var dogSockelCache: [String: SCNGeometry] = [:]

    static func dogSockel(_ t: ChessPieceType, _ c: PlayerColor) -> SCNGeometry {
        let k = "\(t.rawValue)\(c.rawValue)"
        if let g = dogSockelCache[k] { return g }
        let p = dogProportions(t)
        let prof = base(p.baseR) + [CGPoint(x: p.baseR - 0.11, y: 0.15), CGPoint(x: 0.13, y: p.neck * 0.6),
                                    CGPoint(x: 0.115, y: p.neck - 0.04), CGPoint(x: 0.10, y: p.neck + 0.02),
                                    CGPoint(x: 0.0, y: p.neck + 0.02)]
        let g = lathe(prof)
        g.materials = [material(c)]
        dogSockelCache[k] = g
        return g
    }

    private static var badgeCache: [String: NSImage] = [:]

    /// Plakette mit dem Schachsymbol (damit Kinder die Figur trotzdem erkennen)
    static func badgeImage(_ t: ChessPieceType, _ c: PlayerColor) -> NSImage {
        let k = "\(t.rawValue)\(c.rawValue)"
        if let i = badgeCache[k] { return i }
        let img = renderBitmapImage(width: 128, height: 128) { r in
            NSColor(calibratedRed: 0.93, green: 0.78, blue: 0.35, alpha: 1).setFill()
            NSBezierPath(ovalIn: r).fill()
            NSColor(calibratedRed: 0.55, green: 0.40, blue: 0.10, alpha: 1).setStroke()
            let ring = NSBezierPath(ovalIn: r.insetBy(dx: 6, dy: 6))
            ring.lineWidth = 6
            ring.stroke()
            let glyph = chessPieceChar(t, c) as NSString
            let attrs: [NSAttributedString.Key: Any] = [
                .font: NSFont.systemFont(ofSize: 84),
                .foregroundColor: c == .white ? NSColor.white : NSColor(white: 0.1, alpha: 1),
                .strokeColor: c == .white ? NSColor(white: 0.25, alpha: 1) : NSColor.black,
                .strokeWidth: -2.0
            ]
            let sz = glyph.size(withAttributes: attrs)
            glyph.draw(at: NSPoint(x: r.midX - sz.width / 2, y: r.midY - sz.height / 2 + 2), withAttributes: attrs)
        }
        badgeCache[k] = img
        return img
    }

    static func makeDogPiece(_ piece: ChessPiece) -> SCNNode {
        let outer = SCNNode()
        outer.name = key(piece)
        let t = piece.type
        let p = dogProportions(t)
        outer.addChildNode(SCNNode(geometry: dogSockel(t, piece.color)))

        // Halsband in Teamfarbe (Weiss: Gold, Schwarz: Silber) mit Figuren-Plakette vorn
        let collarMat = metal(piece.color == .white
            ? NSColor(calibratedRed: 0.95, green: 0.75, blue: 0.25, alpha: 1)
            : NSColor(calibratedRed: 0.78, green: 0.80, blue: 0.85, alpha: 1))
        let collar = SCNTorus(ringRadius: 0.118, pipeRadius: 0.022)
        collar.materials = [collarMat]
        let collarNode = SCNNode(geometry: collar)
        collarNode.position = v(0, p.neck - 0.01, 0)
        outer.addChildNode(collarNode)

        // v3.1: Kopf und Plakette drehen sich immer zum Betrachter (nur um die Hochachse)
        func facesViewer() -> SCNBillboardConstraint {
            let bb = SCNBillboardConstraint()
            bb.freeAxes = .Y
            return bb
        }
        let badgeGeo = SCNCylinder(radius: 0.062, height: 0.014)
        let bm = SCNMaterial()
        bm.lightingModel = .physicallyBased
        bm.diffuse.contents = badgeImage(t, piece.color)
        bm.roughness.contents = NSNumber(value: 0.35)
        bm.metalness.contents = NSNumber(value: 0.3)
        badgeGeo.materials = [collarMat, bm, collarMat]
        let badge = SCNNode(geometry: badgeGeo)
        badge.eulerAngles = v(CGFloat.pi / 2, 0, 0)          // Deckel zeigt nach vorn (+z)
        badge.position = v(0, 0, 0.14)
        let badgeHolder = SCNNode()
        badgeHolder.position = v(0, p.neck - 0.06, 0)
        badgeHolder.constraints = [facesViewer()]
        badgeHolder.addChildNode(badge)
        outer.addChildNode(badgeHolder)

        let head = dogHead(t)
        head.name = "hundekopf"
        head.scale = v(p.head, p.head, p.head)
        head.position = v(0, p.neck + 0.13 * p.head, 0)
        head.constraints = [facesViewer()]
        outer.addChildNode(head)
        return outer
    }

    /// Hundekopf (Blickrichtung +z), Kopfradius ~0.15
    static func dogHead(_ t: ChessPieceType) -> SCNNode {
        let h = SCNNode()
        let black = fur(NSColor(calibratedRed: 0.06, green: 0.05, blue: 0.05, alpha: 1), rough: 0.35)
        let white = fur(NSColor(calibratedRed: 0.97, green: 0.96, blue: 0.93, alpha: 1), rough: 0.5)
        let pink = fur(NSColor(calibratedRed: 0.93, green: 0.45, blue: 0.52, alpha: 1), rough: 0.5)

        var furMain = NSColor.brown
        var furMuzzle = NSColor.white
        var earColor = NSColor.brown
        var skullScale = v(1, 0.95, 0.95)
        var muzzlePos = v(0, -0.045, 0.125)
        var muzzleScale = v(1.0, 0.75, 1.15)

        switch t {
        case .king:   // Bernhardiner
            furMain = NSColor(calibratedRed: 0.62, green: 0.32, blue: 0.14, alpha: 1)
            furMuzzle = NSColor(calibratedRed: 0.97, green: 0.95, blue: 0.90, alpha: 1)
            earColor = NSColor(calibratedRed: 0.48, green: 0.24, blue: 0.10, alpha: 1)
            skullScale = v(1.08, 0.98, 1.0)
            muzzleScale = v(1.25, 0.85, 1.05)
        case .queen:  // Windhund
            furMain = NSColor(calibratedRed: 0.80, green: 0.78, blue: 0.76, alpha: 1)
            furMuzzle = NSColor(calibratedRed: 0.86, green: 0.84, blue: 0.82, alpha: 1)
            earColor = NSColor(calibratedRed: 0.55, green: 0.53, blue: 0.52, alpha: 1)
            skullScale = v(0.85, 0.9, 1.05)
            muzzlePos = v(0, -0.04, 0.16)
            muzzleScale = v(0.7, 0.62, 1.9)
        case .rook:   // Bulldogge
            furMain = NSColor(calibratedRed: 0.82, green: 0.63, blue: 0.42, alpha: 1)
            furMuzzle = NSColor(calibratedRed: 0.95, green: 0.91, blue: 0.84, alpha: 1)
            earColor = NSColor(calibratedRed: 0.62, green: 0.44, blue: 0.28, alpha: 1)
            skullScale = v(1.2, 0.9, 0.95)
            muzzlePos = v(0, -0.06, 0.115)
            muzzleScale = v(1.55, 0.95, 0.75)
        case .bishop: // Dackel
            furMain = NSColor(calibratedRed: 0.47, green: 0.21, blue: 0.08, alpha: 1)
            furMuzzle = NSColor(calibratedRed: 0.42, green: 0.19, blue: 0.08, alpha: 1)
            earColor = NSColor(calibratedRed: 0.33, green: 0.14, blue: 0.05, alpha: 1)
            skullScale = v(0.92, 0.9, 1.0)
            muzzlePos = v(0, -0.04, 0.155)
            muzzleScale = v(0.85, 0.72, 1.75)
        case .knight: // Schaeferhund
            furMain = NSColor(calibratedRed: 0.76, green: 0.52, blue: 0.28, alpha: 1)
            furMuzzle = NSColor(calibratedRed: 0.20, green: 0.14, blue: 0.10, alpha: 1)
            earColor = NSColor(calibratedRed: 0.18, green: 0.12, blue: 0.08, alpha: 1)
            skullScale = v(0.95, 0.95, 1.0)
            muzzlePos = v(0, -0.04, 0.145)
            muzzleScale = v(0.9, 0.7, 1.5)
        case .pawn:   // Welpe
            furMain = NSColor(calibratedRed: 0.94, green: 0.86, blue: 0.70, alpha: 1)
            furMuzzle = NSColor(calibratedRed: 0.98, green: 0.95, blue: 0.88, alpha: 1)
            earColor = NSColor(calibratedRed: 0.60, green: 0.40, blue: 0.24, alpha: 1)
            skullScale = v(1.05, 1.0, 1.0)
            muzzleScale = v(0.95, 0.7, 0.95)
        }
        let furM = fur(furMain), muzM = fur(furMuzzle), earM = fur(earColor)

        // Schaedel, Schnauze, Nase
        h.addChildNode(blob(0.15, furM, v(0, 0, 0), skullScale))
        h.addChildNode(blob(0.085, muzM, muzzlePos, muzzleScale))
        let noseZ = muzzlePos.z + 0.085 * muzzleScale.z * 0.92
        h.addChildNode(blob(0.03, black, v(0, muzzlePos.y + 0.03, noseZ), v(1.2, 0.85, 0.9)))

        // Augen mit Glanzpunkt
        for sx in [CGFloat(-1), CGFloat(1)] {
            let ex = sx * 0.058 * skullScale.x
            h.addChildNode(blob(0.03, white, v(ex, 0.035, 0.118), v(1, 1, 0.6)))
            h.addChildNode(blob(0.019, black, v(ex, 0.035, 0.134), v(1, 1, 0.6)))
            h.addChildNode(blob(0.006, white, v(ex - sx * 0.006, 0.044, 0.146), v(1, 1, 1)))
        }

        // Ohren je Rasse
        for sx in [CGFloat(-1), CGFloat(1)] {
            switch t {
            case .king, .pawn:        // Schlappohren
                let len: CGFloat = t == .king ? 1.15 : 0.95
                h.addChildNode(blob(0.085, earM, v(sx * 0.145 * skullScale.x, -0.03, -0.01),
                                    v(0.38, len, 0.75), v(0, 0, sx * 0.28)))
            case .bishop:             // lange Dackelohren
                h.addChildNode(blob(0.085, earM, v(sx * 0.13, -0.07, 0.0), v(0.35, 1.55, 0.7), v(0, 0, sx * 0.12)))
            case .knight:             // Stehohren
                let cone = SCNCone(topRadius: 0.006, bottomRadius: 0.052, height: 0.15)
                cone.materials = [earM]
                let e = SCNNode(geometry: cone)
                e.position = v(sx * 0.075, 0.17, -0.02)
                e.eulerAngles = v(-0.1, 0, -sx * 0.3)
                h.addChildNode(e)
                let inner = SCNCone(topRadius: 0.004, bottomRadius: 0.03, height: 0.1)
                inner.materials = [pink]
                let ie = SCNNode(geometry: inner)
                ie.position = v(sx * 0.075, 0.16, -0.004)
                ie.eulerAngles = v(-0.1, 0, -sx * 0.3)
                h.addChildNode(ie)
            case .rook:               // kleine Rosenohren
                h.addChildNode(blob(0.05, earM, v(sx * 0.13, 0.105, -0.03), v(1, 0.6, 0.5), v(0, 0, sx * 0.6)))
            case .queen:              // zurueckgelegte Ohren
                h.addChildNode(blob(0.05, earM, v(sx * 0.085, 0.07, -0.1), v(0.45, 0.7, 1.25), v(0.6, 0, 0)))
            }
        }

        // Rasse-Details
        switch t {
        case .king:
            // weisse Blesse & dunkle Augenflecken
            let blaze = SCNBox(width: 0.045, height: 0.12, length: 0.02, chamferRadius: 0.01)
            blaze.materials = [white]
            let b = SCNNode(geometry: blaze)
            b.position = v(0, 0.07, 0.138)
            b.eulerAngles = v(-0.35, 0, 0)
            h.addChildNode(b)
            let patch = fur(NSColor(calibratedRed: 0.28, green: 0.13, blue: 0.05, alpha: 1))
            for sx in [CGFloat(-1), CGFloat(1)] {
                h.addChildNode(blob(0.045, patch, v(sx * 0.063, 0.036, 0.108), v(1.1, 0.9, 0.35)))
            }
        case .rook:
            // Hängebacken & Unterbiss-Zaehnchen
            for sx in [CGFloat(-1), CGFloat(1)] {
                h.addChildNode(blob(0.05, muzM, v(sx * 0.07, -0.085, 0.12), v(1, 0.9, 0.8)))
                let tooth = SCNCone(topRadius: 0.001, bottomRadius: 0.009, height: 0.025)
                tooth.materials = [white]
                let tn = SCNNode(geometry: tooth)
                tn.position = v(sx * 0.03, -0.075, 0.175)
                h.addChildNode(tn)
            }
        case .knight:
            // dunkler Sattel auf dem Kopf
            h.addChildNode(blob(0.13, fur(NSColor(calibratedRed: 0.16, green: 0.11, blue: 0.08, alpha: 1)),
                                v(0, 0.06, -0.04), v(0.95, 0.6, 0.9)))
        case .pawn:
            // Fleck ums Auge & Zunge
            h.addChildNode(blob(0.045, earM, v(0.062, 0.04, 0.108), v(1.0, 0.95, 0.35)))
            h.addChildNode(blob(0.025, pink, v(0, -0.1, 0.15), v(0.9, 0.35, 1.2), v(0.3, 0, 0)))
        default:
            break
        }

        // Accessoires: zeigen die Schachrolle
        let gold = metal(NSColor(calibratedRed: 0.95, green: 0.75, blue: 0.22, alpha: 1))
        switch t {
        case .king:   // Krone
            let band = SCNTube(innerRadius: 0.075, outerRadius: 0.09, height: 0.05)
            band.materials = [gold]
            let crown = SCNNode(geometry: band)
            crown.position = v(0, 0.165, -0.01)
            for k in 0..<5 {
                let a = CGFloat(k) * 2 * CGFloat.pi / 5
                let spike = SCNCone(topRadius: 0.0, bottomRadius: 0.022, height: 0.06)
                spike.materials = [gold]
                let sn = SCNNode(geometry: spike)
                sn.position = v(0.082 * cos(a), 0.05, 0.082 * sin(a))
                crown.addChildNode(sn)
            }
            crown.addChildNode(blob(0.018, fur(NSColor(calibratedRed: 0.85, green: 0.1, blue: 0.15, alpha: 1), rough: 0.2),
                                    v(0, 0, 0.09), v(1, 1, 0.6)))
            h.addChildNode(crown)
        case .queen:  // Diadem
            let ring = SCNTorus(ringRadius: 0.11, pipeRadius: 0.009)
            ring.materials = [gold]
            let d = SCNNode(geometry: ring)
            d.position = v(0, 0.1, -0.01)
            d.eulerAngles = v(-0.35, 0, 0)
            h.addChildNode(d)
            h.addChildNode(blob(0.022, fur(NSColor(calibratedRed: 0.15, green: 0.35, blue: 0.95, alpha: 1), rough: 0.15),
                                v(0, 0.135, 0.1), v(1, 1.2, 0.6)))
        case .rook:   // Burghut
            let stone = fur(NSColor(calibratedRed: 0.62, green: 0.60, blue: 0.56, alpha: 1), rough: 0.9)
            let cyl = SCNCylinder(radius: 0.1, height: 0.08)
            cyl.materials = [stone]
            let hat = SCNNode(geometry: cyl)
            hat.position = v(0, 0.17, -0.01)
            for k in 0..<4 {
                let a = CGFloat(k) * CGFloat.pi / 2 + CGFloat.pi / 4
                let m = SCNBox(width: 0.05, height: 0.045, length: 0.04, chamferRadius: 0.005)
                m.materials = [stone]
                let mn = SCNNode(geometry: m)
                mn.position = v(0.075 * cos(a), 0.06, 0.075 * sin(a))
                mn.eulerAngles = v(0, -(a + CGFloat.pi / 2), 0)
                hat.addChildNode(mn)
            }
            h.addChildNode(hat)
        case .bishop: // Bischofsmuetze
            let mitreMat = fur(NSColor(calibratedRed: 0.45, green: 0.18, blue: 0.62, alpha: 1), rough: 0.6)
            let cone = SCNCone(topRadius: 0.02, bottomRadius: 0.085, height: 0.2)
            cone.materials = [mitreMat]
            let mitre = SCNNode(geometry: cone)
            mitre.position = v(0, 0.2, -0.015)
            mitre.scale = v(1, 1, 0.7)
            let bandG = SCNTorus(ringRadius: 0.082, pipeRadius: 0.01)
            bandG.materials = [gold]
            let bandN = SCNNode(geometry: bandG)
            bandN.position = v(0, -0.085, 0)
            mitre.addChildNode(bandN)
            mitre.addChildNode(blob(0.02, gold, v(0, 0.105, 0), v(1, 1, 1)))
            h.addChildNode(mitre)
        case .knight: // Ritter-Federbusch
            let plume = fur(NSColor(calibratedRed: 0.85, green: 0.12, blue: 0.12, alpha: 1), rough: 0.7)
            for (i, z) in [CGFloat(0.02), CGFloat(-0.04), CGFloat(-0.1)].enumerated() {
                h.addChildNode(blob(0.05, plume, v(0, 0.2 - CGFloat(i) * 0.02, z), v(0.45, 1.3, 0.6), v(-0.5 - CGFloat(i) * 0.25, 0, 0)))
            }
        case .pawn:
            break
        }
        return h
    }
}

// MARK: - v3 Echtes 3D-Brett mit drehbarer Kamera und Kampfszenen

final class Board3DView: SCNView {
    var onCellClick: ((Int, Int) -> Void)?
    private(set) var isAnimating = false
    var nameTags: [Int: (type: ChessPieceType, name: String)] = [:] { didSet { rebuildNameTags() } }

    private let scn = SCNScene()
    private let world = SCNNode()
    private let piecesRoot = SCNNode()
    private let overlayRoot = SCNNode()
    private let graveRoot = SCNNode()
    private let labelRoot = SCNNode()
    private let fxRoot = SCNNode()
    private let orbit = SCNNode()
    private let shaker = SCNNode()
    private let cameraNode = SCNNode()
    private let lookTarget = SCNNode()
    private var tiles: [[SCNNode]] = []
    private let frameNode = SCNNode()
    private var labelHolders: [SCNNode] = []
    private var pieceNodes: [Position: SCNNode] = [:]
    private var pendingBoard: ChessBoard?
    private var pendingCompletion: (() -> Void)?
    private var pendingPromotion: Position?
    private var lastBoard = ChessBoard()
    private var graveSignature = ""
    private var animToken = 0

    private(set) var azimuth: CGFloat = 0
    private var elevation: CGFloat = 0.80
    private var distance: CGFloat = 12.4
    private(set) var viewFromBlack = false

    private var dragStart: NSPoint = .zero
    private var lastDrag: NSPoint = .zero
    private var dragging = false

    init(boardFrame: NSRect) {
        super.init(frame: boardFrame, options: nil)
        setupScene()
    }

    required init?(coder: NSCoder) { fatalError("init(coder:) wird nicht unterstuetzt") }

    // MARK: Aufbau

    private func setupScene() {
        scene = scn
        backgroundColor = NSColor(calibratedRed: 0.12, green: 0.10, blue: 0.08, alpha: 1)
        scn.background.contents = Board3DView.backgroundImage
        antialiasingMode = .multisampling4X
        allowsCameraControl = false
        isPlaying = true
        preferredFramesPerSecond = 60
        scn.physicsWorld.gravity = SCNVector3(0, -14, 0)
        scn.lightingEnvironment.contents = Board3DView.environmentImage
        scn.lightingEnvironment.intensity = 0.9

        scn.rootNode.addChildNode(world)
        for n in [piecesRoot, overlayRoot, graveRoot, labelRoot, fxRoot] { world.addChildNode(n) }

        // Tisch (dunkles Holz, leicht spiegelnd)
        let floor = SCNFloor()
        floor.reflectivity = 0.06
        floor.reflectionFalloffEnd = 2.5
        let floorMat = SCNMaterial()
        floorMat.lightingModel = .physicallyBased
        floorMat.diffuse.contents = NSColor(calibratedRed: 0.17, green: 0.115, blue: 0.075, alpha: 1)
        floorMat.roughness.contents = NSNumber(value: 0.55)
        floor.materials = [floorMat]
        let floorNode = SCNNode(geometry: floor)
        floorNode.position = SCNVector3(0, -0.32, 0)
        world.addChildNode(floorNode)

        // Brettrahmen
        frameNode.geometry = SCNBox(width: 9.3, height: 0.3, length: 9.3, chamferRadius: 0.07)
        frameNode.position = SCNVector3(0, -0.165, 0)
        world.addChildNode(frameNode)

        // 64 Felder
        for r in 0..<8 {
            var row: [SCNNode] = []
            for c in 0..<8 {
                let n = SCNNode(geometry: SCNBox(width: 1, height: 0.1, length: 1, chamferRadius: 0))
                n.name = "sq_\(r)_\(c)"
                n.position = SCNVector3(CGFloat(c) - 3.5, -0.05, CGFloat(r) - 3.5)
                world.addChildNode(n)
                row.append(n)
            }
            tiles.append(row)
        }
        applyTheme()

        // Physik-Boden fuer die Splitter
        let phys = SCNNode()
        phys.position = SCNVector3(0, -0.1, 0)
        phys.physicsBody = SCNPhysicsBody(type: .static,
                                          shape: SCNPhysicsShape(geometry: SCNBox(width: 40, height: 0.2, length: 40, chamferRadius: 0), options: nil))
        world.addChildNode(phys)

        buildCoordinateLabels()

        // Licht: warmes Hauptlicht mit weichen Schatten, kuehles Fuelllicht, Grundhelligkeit
        let ambient = SCNLight()
        ambient.type = .ambient
        ambient.intensity = 150
        ambient.color = NSColor(calibratedRed: 1.0, green: 0.95, blue: 0.88, alpha: 1)
        let ambNode = SCNNode(); ambNode.light = ambient
        scn.rootNode.addChildNode(ambNode)

        let key = SCNLight()
        key.type = .directional
        key.intensity = 800
        key.color = NSColor(calibratedRed: 1.0, green: 0.96, blue: 0.9, alpha: 1)
        key.castsShadow = true
        key.shadowMode = .deferred
        key.shadowSampleCount = 16
        key.shadowRadius = 3.5
        key.shadowColor = NSColor(white: 0, alpha: 0.55)
        key.orthographicScale = 7.5
        key.automaticallyAdjustsShadowProjection = true
        let keyNode = SCNNode(); keyNode.light = key
        keyNode.position = SCNVector3(4.5, 11, 6.5)
        keyNode.look(at: SCNVector3(0, 0, 0))
        scn.rootNode.addChildNode(keyNode)

        let fill = SCNLight()
        fill.type = .omni
        fill.intensity = 280
        fill.color = NSColor(calibratedRed: 0.75, green: 0.82, blue: 1.0, alpha: 1)
        let fillNode = SCNNode(); fillNode.light = fill
        fillNode.position = SCNVector3(-7, 6, -5)
        scn.rootNode.addChildNode(fillNode)

        // Kamera auf einer Umlaufbahn um die Brettmitte
        let cam = SCNCamera()
        cam.fieldOfView = 38
        cam.zNear = 0.1
        cam.zFar = 200
        cam.wantsHDR = true
        cam.wantsExposureAdaptation = false
        cam.bloomIntensity = 0.35
        cam.bloomThreshold = 1.0
        cam.exposureOffset = -0.25
        cam.bloomBlurRadius = 8
        cam.screenSpaceAmbientOcclusionIntensity = 0.6
        cameraNode.camera = cam
        scn.rootNode.addChildNode(lookTarget)
        lookTarget.position = SCNVector3(0, -0.3, 0.35)
        scn.rootNode.addChildNode(orbit)
        orbit.addChildNode(shaker)
        shaker.addChildNode(cameraNode)
        let look = SCNLookAtConstraint(target: lookTarget)
        look.isGimbalLockEnabled = true
        cameraNode.constraints = [look]
        pointOfView = cameraNode
        updateCamera(animated: false)
        adjustProjection()
        sync(to: ChessBoard())
    }

    private func buildCoordinateLabels() {
        let mat = SCNMaterial()
        mat.lightingModel = .constant
        mat.diffuse.contents = NSColor(calibratedRed: 0.96, green: 0.90, blue: 0.78, alpha: 0.9)
        func label(_ s: String, x: CGFloat, z: CGFloat) {
            let t = SCNText(string: s, extrusionDepth: 0)
            t.font = NSFont.systemFont(ofSize: 10, weight: .semibold)
            t.flatness = 0.1
            t.materials = [mat]
            let tn = SCNNode(geometry: t)
            let (mn, mx) = tn.boundingBox
            tn.pivot = SCNMatrix4MakeTranslation((mn.x + mx.x) / 2, (mn.y + mx.y) / 2, 0)
            tn.scale = SCNVector3(0.028, 0.028, 0.028)
            tn.eulerAngles = SCNVector3(-CGFloat.pi / 2, 0, 0)
            let holder = SCNNode()
            holder.position = SCNVector3(x, -0.004, z)
            holder.addChildNode(tn)
            labelRoot.addChildNode(holder)
            labelHolders.append(holder)
        }
        for c in 0..<8 {
            let f = String(Character(UnicodeScalar(97 + c)!))
            label(f, x: CGFloat(c) - 3.5, z: 4.32)
            label(f, x: CGFloat(c) - 3.5, z: -4.32)
        }
        for r in 0..<8 {
            label("\(8 - r)", x: -4.32, z: CGFloat(r) - 3.5)
            label("\(8 - r)", x: 4.32, z: CGFloat(r) - 3.5)
        }
    }

    /// Figurenstil gewechselt (klassisch <-> Hunde-Team): alle Figuren neu aufbauen
    func styleChanged() {
        if isAnimating { finishNow() }
        graveSignature = ""
        sync(to: lastBoard)
    }

    /// Farben aus dem gewaehlten Brett-Thema uebernehmen
    func applyTheme() {
        let th = BoardTheme.current
        for r in 0..<8 {
            for c in 0..<8 {
                let m = SCNMaterial()
                m.lightingModel = .physicallyBased
                m.diffuse.contents = (r + c) % 2 == 1 ? th.dark : th.light
                m.roughness.contents = NSNumber(value: 0.7)
                tiles[r][c].geometry?.materials = [m]
            }
        }
        let fm = SCNMaterial()
        fm.lightingModel = .physicallyBased
        fm.diffuse.contents = th.border
        fm.roughness.contents = NSNumber(value: 0.35)
        frameNode.geometry?.materials = [fm]
    }

    // MARK: Kamera

    private func updateCamera(animated: Bool) {
        SCNTransaction.begin()
        SCNTransaction.animationDuration = animated ? 1.0 : 0
        SCNTransaction.animationTimingFunction = CAMediaTimingFunction(name: .easeInEaseOut)
        orbit.eulerAngles = SCNVector3(0, azimuth, 0)
        cameraNode.position = SCNVector3(0, distance * sin(elevation), distance * cos(elevation))
        // Koordinaten immer lesbar: zur Seite des Betrachters drehen
        let quarter = (azimuth / (CGFloat.pi / 2)).rounded() * (CGFloat.pi / 2)
        for h in labelHolders { h.eulerAngles = SCNVector3(0, quarter, 0) }
        SCNTransaction.commit()
    }

    private func adjustProjection() {
        guard let cam = cameraNode.camera, bounds.height > 10 else { return }
        let aspect = bounds.width / bounds.height
        if aspect < 1.25 {
            cam.projectionDirection = .horizontal
            cam.fieldOfView = 59
        } else {
            cam.projectionDirection = .vertical
            cam.fieldOfView = 40
        }
    }

    override func setFrameSize(_ newSize: NSSize) {
        super.setFrameSize(newSize)
        adjustProjection()
    }

    /// Brett wenden: Blick von Schwarz (true) oder Weiss (false) – mit Kamerafahrt
    func setViewFromBlack(_ black: Bool, animated: Bool) {
        viewFromBlack = black
        let target: CGFloat = black ? CGFloat.pi : 0
        let twoPi = 2 * CGFloat.pi
        azimuth = ((azimuth - target) / twoPi).rounded() * twoPi + target
        updateCamera(animated: animated)
    }

    func resetCamera() {
        elevation = 0.80
        distance = 12.4
        setViewFromBlack(viewFromBlack, animated: true)
    }

    // MARK: Maus & Trackpad

    override var acceptsFirstResponder: Bool { true }
    override func acceptsFirstMouse(for event: NSEvent?) -> Bool { true }

    override func mouseDown(with event: NSEvent) {
        dragStart = convert(event.locationInWindow, from: nil)
        lastDrag = dragStart
        dragging = false
    }

    override func mouseDragged(with event: NSEvent) { orbitDrag(event) }
    override func rightMouseDragged(with event: NSEvent) { dragging = true; orbitDrag(event) }
    override func rightMouseDown(with event: NSEvent) {
        dragStart = convert(event.locationInWindow, from: nil)
        lastDrag = dragStart
    }

    private func orbitDrag(_ event: NSEvent) {
        let p = convert(event.locationInWindow, from: nil)
        if !dragging && hypot(p.x - dragStart.x, p.y - dragStart.y) > 5 { dragging = true }
        if dragging {
            azimuth -= (p.x - lastDrag.x) * 0.008
            elevation = min(1.45, max(0.30, elevation - (p.y - lastDrag.y) * 0.006))
            updateCamera(animated: false)
        }
        lastDrag = p
    }

    override func mouseUp(with event: NSEvent) {
        if !dragging {
            let p = convert(event.locationInWindow, from: nil)
            if let sq = square(at: p) { onCellClick?(sq.row, sq.col) }
        }
        dragging = false
    }

    override func scrollWheel(with event: NSEvent) {
        let factor: CGFloat = event.hasPreciseScrollingDeltas ? 0.03 : 0.6
        distance = min(24, max(6.5, distance - event.scrollingDeltaY * factor))
        updateCamera(animated: false)
    }

    override func magnify(with event: NSEvent) {
        distance = min(24, max(6.5, distance * (1 - event.magnification)))
        updateCamera(animated: false)
    }

    override func rotate(with event: NSEvent) {
        azimuth += CGFloat(event.rotation) * CGFloat.pi / 180
        updateCamera(animated: false)
    }

    private func square(at p: NSPoint) -> Position? {
        let hits = hitTest(p, options: [SCNHitTestOption.searchMode: SCNHitTestSearchMode.all.rawValue,
                                        SCNHitTestOption.ignoreHiddenNodes: true])
        for h in hits {
            var n: SCNNode? = h.node
            while let cur = n {
                if cur.name == "namensschild" { break }      // Namensschilder sind nicht anklickbar
                if let name = cur.name {
                    if name.hasPrefix("P_"), let pos = pieceNodes.first(where: { $0.value === cur })?.key { return pos }
                    if name.hasPrefix("sq_") {
                        let parts = name.split(separator: "_")
                        if parts.count == 3, let r = Int(parts[1]), let c = Int(parts[2]) { return Position(row: r, col: c) }
                    }
                }
                n = cur.parent
            }
        }
        return nil
    }

    // MARK: Stellung darstellen

    func squareCenter(_ p: Position) -> SCNVector3 {
        SCNVector3(CGFloat(p.col) - 3.5, 0, CGFloat(p.row) - 3.5)
    }

    /// Figuren an die Stellung anpassen (bestehende Knoten werden wiederverwendet)
    private func sync(to board: ChessBoard) {
        lastBoard = ChessBoard(copyFrom: board)
        for r in 0..<8 {
            for c in 0..<8 {
                let pos = Position(row: r, col: c)
                let want = board.piece(at: pos)
                if let node = pieceNodes[pos] {
                    if let w = want, node.name == Piece3DFactory.key(w) {
                        node.removeAllActions()
                        node.position = squareCenter(pos)
                        node.scale = SCNVector3(1, 1, 1)
                        node.eulerAngles = SCNVector3(0, 0, 0)
                        node.opacity = 1
                        continue
                    }
                    node.removeFromParentNode()
                    pieceNodes[pos] = nil
                }
                if let w = want {
                    let n = Piece3DFactory.makePiece(w)
                    n.position = squareCenter(pos)
                    piecesRoot.addChildNode(n)
                    pieceNodes[pos] = n
                }
            }
        }
        // Verwaiste Knoten (z.B. nach abgebrochener Animation) entfernen
        let alive = Set(pieceNodes.values.map { ObjectIdentifier($0) })
        for n in piecesRoot.childNodes where !alive.contains(ObjectIdentifier(n)) { n.removeFromParentNode() }
        rebuildGraveyard(board)
        rebuildNameTags()
    }

    /// Geschlagene Figuren liegen neben dem Brett (Weiss links, Schwarz rechts aus Sicht von Weiss)
    private func rebuildGraveyard(_ board: ChessBoard) {
        let start: [ChessPieceType: Int] = [.queen: 1, .rook: 2, .bishop: 2, .knight: 2, .pawn: 8]
        var lists: [PlayerColor: [ChessPieceType]] = [:]
        for color in [PlayerColor.white, .black] {
            var count: [ChessPieceType: Int] = [:]
            for r in 0..<8 { for c in 0..<8 { if let p = board.grid[r][c], p.color == color { count[p.type, default: 0] += 1 } } }
            var missing: [ChessPieceType] = []
            for t in [ChessPieceType.queen, .rook, .bishop, .knight, .pawn] {
                missing += Array(repeating: t, count: max(0, (start[t] ?? 0) - (count[t] ?? 0)))
            }
            lists[color] = missing
        }
        let sig = "\(lists[.white] ?? [])|\(lists[.black] ?? [])|\(Piece3DFactory.dogMode)"
        if sig == graveSignature { return }
        graveSignature = sig
        graveRoot.childNodes.forEach { $0.removeFromParentNode() }
        for color in [PlayerColor.white, .black] {
            let x0: CGFloat = color == .white ? -4.95 : 4.95
            let step: CGFloat = color == .white ? -0.55 : 0.55
            for (i, t) in (lists[color] ?? []).enumerated() {
                let n = Piece3DFactory.makePiece(ChessPiece(color: color, type: t))
                n.name = "grab"
                n.scale = SCNVector3(0.5, 0.5, 0.5)
                n.position = SCNVector3(x0 + step * CGFloat(i / 8), -0.32, 3.2 - CGFloat(i % 8) * 0.85)
                graveRoot.addChildNode(n)
            }
        }
    }

    private func rebuildNameTags() {
        for n in piecesRoot.childNodes {
            n.childNodes.filter { $0.name == "namensschild" }.forEach { $0.removeFromParentNode() }
        }
        for (pos, node) in pieceNodes {
            guard let p = lastBoard.piece(at: pos), let tag = nameTags[p.color.rawValue],
                  tag.type == p.type, !tag.name.isEmpty else { continue }
            let bg = p.color == .white ? NSColor.chessGreen : NSColor(calibratedRed: 0.55, green: 0.15, blue: 0.15, alpha: 1)
            let (img, w, h) = Board3DView.labelImage(String(tag.name.prefix(12)), bg: bg)
            let plane = SCNPlane(width: w * 0.0045, height: h * 0.0045)
            let m = SCNMaterial()
            m.lightingModel = .constant
            m.diffuse.contents = img
            m.isDoubleSided = true
            m.readsFromDepthBuffer = false
            plane.materials = [m]
            let tn = SCNNode(geometry: plane)
            tn.name = "namensschild"
            tn.position = SCNVector3(0, Piece3DFactory.height(p.type) + 0.28, 0)
            tn.renderingOrder = 50
            tn.constraints = [SCNBillboardConstraint()]
            node.addChildNode(tn)
        }
    }

    /// Wie ChessBoardView.refresh – plus Tipp-Pfeil, Gefahren-Ringe und Denkanstoss-Markierung
    func refresh(board: ChessBoard, selected: Position?, targets: [Position], last: ChessMove?, check: Position?,
                 hint: ChessMove?, danger: [Position], focus: Position?) {
        if isAnimating {
            pendingBoard = ChessBoard(copyFrom: board)
        } else {
            sync(to: board)
        }
        overlayRoot.childNodes.forEach { $0.removeFromParentNode() }

        func put(_ n: SCNNode, _ pos: Position, _ y: CGFloat) {
            var p = squareCenter(pos); p.y = y
            n.position = p
            overlayRoot.addChildNode(n)
        }
        if let lm = last {
            put(flatPlane(NSColor(calibratedRed: 1.0, green: 0.80, blue: 0.05, alpha: 0.55)), lm.from, 0.003)
            put(flatPlane(NSColor(calibratedRed: 1.0, green: 0.80, blue: 0.05, alpha: 0.65)), lm.to, 0.003)
        }
        if let kc = check {
            let n = flatPlane(NSColor(calibratedRed: 1, green: 0.1, blue: 0.05, alpha: 0.65))
            n.runAction(Board3DView.pulse)
            put(n, kc, 0.004)
            put(ring(NSColor(calibratedRed: 1, green: 0.2, blue: 0.1, alpha: 1), radius: 0.42, pipe: 0.03), kc, 0.02)
        }
        if let sel = selected {
            put(flatPlane(NSColor(calibratedRed: 0.25, green: 0.55, blue: 1, alpha: 0.5)), sel, 0.005)
        }
        for t in targets {
            if board.piece(at: t) != nil {
                put(ring(NSColor(calibratedRed: 1, green: 0.3, blue: 0.2, alpha: 1), radius: 0.41, pipe: 0.028), t, 0.02)
            } else {
                let d = SCNCylinder(radius: 0.13, height: 0.012)
                d.materials = [Board3DView.glowMaterial(NSColor(calibratedRed: 0.25, green: 0.85, blue: 0.35, alpha: 0.9))]
                put(SCNNode(geometry: d), t, 0.01)
            }
        }
        for d in danger {
            let n = ring(NSColor(calibratedRed: 1, green: 0.55, blue: 0.05, alpha: 1), radius: 0.44, pipe: 0.035)
            n.runAction(Board3DView.pulse)
            put(n, d, 0.025)
        }
        if let f = focus {
            let n = ring(NSColor(calibratedRed: 1, green: 0.95, blue: 0.3, alpha: 1), radius: 0.46, pipe: 0.03)
            n.runAction(Board3DView.pulse)
            put(n, f, 0.03)
        }
        if let h = hint {
            overlayRoot.addChildNode(arrow(from: h.from, to: h.to, color: NSColor(calibratedRed: 0.2, green: 0.9, blue: 0.35, alpha: 0.85)))
        }
    }

    private func flatPlane(_ color: NSColor) -> SCNNode {
        let g = SCNPlane(width: 0.98, height: 0.98)
        let m = SCNMaterial()
        m.lightingModel = .constant
        m.diffuse.contents = color
        m.isDoubleSided = true
        m.writesToDepthBuffer = false
        g.materials = [m]
        let n = SCNNode(geometry: g)
        n.eulerAngles = SCNVector3(-CGFloat.pi / 2, 0, 0)
        return n
    }

    private func ring(_ color: NSColor, radius: CGFloat, pipe: CGFloat) -> SCNNode {
        let g = SCNTorus(ringRadius: radius, pipeRadius: pipe)
        g.materials = [Board3DView.glowMaterial(color)]
        return SCNNode(geometry: g)
    }

    private static func glowMaterial(_ c: NSColor) -> SCNMaterial {
        let m = SCNMaterial()
        m.lightingModel = .constant
        m.diffuse.contents = c
        m.emission.contents = c
        return m
    }

    private static let pulse: SCNAction = .repeatForever(.sequence([.fadeOpacity(to: 0.35, duration: 0.55),
                                                                  .fadeOpacity(to: 1.0, duration: 0.55)]))

    /// Flacher Pfeil vom Start- zum Zielfeld (Coach-Empfehlung)
    private func arrow(from a: Position, to b: Position, color: NSColor) -> SCNNode {
        let pa = squareCenter(a), pb = squareCenter(b)
        let dx = pb.x - pa.x, dz = pb.z - pa.z
        let len = max(0.01, sqrt(dx * dx + dz * dz))
        let holder = SCNNode()
        holder.position = SCNVector3(pa.x, 0.07, pa.z)
        holder.eulerAngles = SCNVector3(0, atan2(-dx / len, -dz / len), 0)
        let mat = Board3DView.glowMaterial(color)
        mat.writesToDepthBuffer = false
        let shaftLen = max(0.1, len - 0.42)
        let shaftGeo = SCNBox(width: 0.15, height: 0.02, length: shaftLen, chamferRadius: 0.01)
        shaftGeo.materials = [mat]
        let shaft = SCNNode(geometry: shaftGeo)
        shaft.position = SCNVector3(0, 0, -shaftLen / 2)
        holder.addChildNode(shaft)
        let cone = SCNCone(topRadius: 0, bottomRadius: 0.24, height: 0.42)
        cone.materials = [mat]
        let head = SCNNode(geometry: cone)
        head.scale = SCNVector3(1, 1, 0.15)
        head.eulerAngles = SCNVector3(-CGFloat.pi / 2, 0, 0)
        head.position = SCNVector3(0, 0, -(len - 0.21))
        holder.addChildNode(head)
        holder.renderingOrder = 40
        holder.runAction(.repeatForever(.sequence([.fadeOpacity(to: 0.55, duration: 0.7), .fadeOpacity(to: 1.0, duration: 0.7)])))
        return holder
    }

    // MARK: Zug-Animation & Kampfszenen

    /// Spielt den Zug ab. Beim Schlagen (und `fights`) gibt es eine Kampfszene je nach Angreifer:
    /// Bauer/Koenig schubsen, Springer springt drauf, Laeufer schlaegt zu, Turm rammt, Dame zaubert.
    func animateMove(_ move: ChessMove, before: ChessBoard, after: ChessBoard, fights: Bool,
                     completion: @escaping () -> Void) {
        if isAnimating { finishNow() }
        sync(to: before)
        guard let mover = pieceNodes[move.from], let moverPiece = before.piece(at: move.from) else {
            sync(to: after)
            completion()
            return
        }
        animToken += 1
        let token = animToken
        isAnimating = true
        pendingBoard = ChessBoard(copyFrom: after)
        pendingCompletion = completion
        pendingPromotion = move.promotion != nil ? move.to : nil

        var victimPos: Position? = nil
        if move.isEnPassant { victimPos = Position(row: move.from.row, col: move.to.col) }
        else if move.capturedPiece != nil { victimPos = move.to }
        let victim = victimPos.flatMap { pieceNodes[$0] }
        let victimPiece = victimPos.flatMap { before.piece(at: $0) }
        pieceNodes[move.from] = nil
        if let vp = victimPos { pieceNodes[vp] = nil }

        if move.isCastling {
            let row = move.from.row
            let rf = Position(row: row, col: move.to.col == 6 ? 7 : 0)
            let rt = Position(row: row, col: move.to.col == 6 ? 5 : 3)
            if let rook = pieceNodes[rf] {
                pieceNodes[rf] = nil
                pieceNodes[rt] = rook
                rook.runAction(.sequence([.wait(duration: 0.12),
                                          Board3DView.arc(from: rook.position, to: squareCenter(rt), height: 0.75, duration: 0.5),
                                          Board3DView.squash(0.16)]))
            }
        }

        let duration: TimeInterval
        if let v = victim, let vp = victimPiece, let vpos = victimPos, fights {
            duration = playFight(attacker: mover, aType: moverPiece.type, victim: v, victimPiece: vp,
                                 from: move.from, to: move.to, victimSquare: vpos)
        } else {
            duration = playSimpleMove(mover: mover, type: moverPiece.type, from: move.from, to: move.to, victim: victim)
        }

        DispatchQueue.main.asyncAfter(deadline: .now() + duration) { [weak self] in
            guard let self = self, self.animToken == token else { return }
            victim?.removeFromParentNode()
            mover.removeAllActions()
            self.pieceNodes[move.to] = mover
            self.completeAnimation()
        }
    }

    /// Laufende Animation sofort beenden (z.B. bei "Neu" oder "Zurueck")
    func finishNow() {
        guard isAnimating else { return }
        animToken += 1
        shaker.removeAllActions()
        shaker.position = SCNVector3(0, 0, 0)
        fxRoot.childNodes.forEach { $0.removeFromParentNode() }
        completeAnimation()
    }

    private func completeAnimation() {
        isAnimating = false
        let b = pendingBoard ?? lastBoard
        pendingBoard = nil
        sync(to: b)
        if let pp = pendingPromotion, let n = pieceNodes[pp] {
            n.scale = SCNVector3(0.2, 0.2, 0.2)
            n.runAction(.scale(to: 1.0, duration: 0.35))
            var p = squareCenter(pp); p.y = 0.6
            burst(at: p, color: NSColor(calibratedRed: 1, green: 0.85, blue: 0.3, alpha: 1), count: 70, speed: 2.2)
            flash(at: p, color: NSColor(calibratedRed: 1, green: 0.9, blue: 0.5, alpha: 1), peak: 1500)
        }
        pendingPromotion = nil
        let c = pendingCompletion
        pendingCompletion = nil
        c?()
    }

    /// Timer fuer Effekte, der nach einem Abbruch nicht mehr feuert
    private func at(_ t: Double, _ block: @escaping () -> Void) {
        let token = animToken
        DispatchQueue.main.asyncAfter(deadline: .now() + t) { [weak self] in
            guard let self = self, self.animToken == token else { return }
            block()
        }
    }

    private func playSimpleMove(mover: SCNNode, type: ChessPieceType, from: Position, to: Position, victim: SCNNode?) -> TimeInterval {
        let a = squareCenter(from), b = squareCenter(to)
        let dist = hypot(b.x - a.x, b.z - a.z)
        let d = TimeInterval(min(0.75, 0.30 + 0.06 * Double(dist)))
        let h: CGFloat = type == .knight ? 0.95 : 0.16 + 0.05 * dist
        mover.runAction(.sequence([Board3DView.arc(from: a, to: b, height: h, duration: d), Board3DView.squash(0.16)]))
        if let v = victim {
            v.runAction(.sequence([.wait(duration: d * 0.75), .group([.fadeOut(duration: 0.2), .scale(to: 0.3, duration: 0.2)])]))
        }
        return d + 0.18
    }

    private func playFight(attacker: SCNNode, aType: ChessPieceType, victim: SCNNode, victimPiece: ChessPiece,
                           from: Position, to: Position, victimSquare: Position) -> TimeInterval {
        let a = squareCenter(from), target = squareCenter(to), v = squareCenter(victimSquare)
        var dx = v.x - a.x, dz = v.z - a.z
        let len = max(0.001, hypot(dx, dz))
        dx /= len; dz /= len
        let dir = SCNVector3(dx, 0, dz)
        let tipAxis = SCNVector3(dz, 0, -dx)          // Drehachse zum Kippen in Laufrichtung
        let vHeight = Piece3DFactory.height(victimPiece.type)
        let impact = SCNVector3(v.x, vHeight * 0.55, v.z)
        let approachDist: CGFloat = 0.62
        let approach = SCNVector3(v.x - dx * approachDist, 0, v.z - dz * approachDist)
        let approachDur = TimeInterval(min(0.55, 0.22 + 0.06 * Double(len)))

        switch aType {
        case .knight:
            // 🐴 Sprungangriff: Salto-Sprung, landet auf dem Opfer, das zerbricht
            let jump: TimeInterval = 0.6
            attacker.runAction(.sequence([
                .group([Board3DView.arc(from: a, to: target, height: 1.4, duration: jump),
                        .rotate(by: 2 * CGFloat.pi, around: SCNVector3(0, 1, 0), duration: jump)]),
                Board3DView.squash(0.22)
            ]))
            victim.runAction(.sequence([
                .wait(duration: jump * 0.55), Board3DView.tremble(jump * 0.4),
                .customAction(duration: 0.1) { node, t in
                    let u = min(1, t / 0.1)
                    node.scale = SCNVector3(1 + 0.4 * u, max(0.08, 1 - 0.92 * u), 1 + 0.4 * u)
                },
                .hide()
            ]))
            at(jump) { [weak self] in
                guard let self = self else { return }
                self.shatter(victimPiece, at: v, height: vHeight, dir: dir, power: 0.8)
                self.dustRing(at: v)
                self.woof(at: impact)
                self.flash(at: impact, color: NSColor(calibratedRed: 1, green: 0.8, blue: 0.5, alpha: 1), peak: 1800)
                self.shake(0.14)
            }
            return jump + 0.95

        case .rook:
            // 🏰 Rammbock: Anlauf, Aufprall, das Opfer fliegt im hohen Bogen vom Brett
            let stop = SCNVector3(v.x - dx * 0.5, 0, v.z - dz * 0.5)
            let charge = TimeInterval(min(0.6, 0.25 + 0.05 * Double(len)))
            attacker.runAction(.sequence([
                .rotate(by: -0.18, around: tipAxis, duration: 0.12),
                .group([Board3DView.charge(from: a, to: stop, duration: charge),
                        .rotate(by: 0.36, around: tipAxis, duration: charge)]),
                .rotate(by: -0.18, around: tipAxis, duration: 0.1),
                .wait(duration: 0.1),
                Board3DView.arc(from: stop, to: target, height: 0.12, duration: 0.25),
                Board3DView.squash(0.16)
            ]))
            let hitT = 0.12 + charge
            victim.runAction(.sequence([
                .wait(duration: hitT),
                .group([Board3DView.projectile(from: v, dir: dir, distance: 3.4, height: 2.1, duration: 0.95),
                        .rotate(by: 5 * CGFloat.pi, around: tipAxis, duration: 0.95),
                        .sequence([.wait(duration: 0.6), .fadeOut(duration: 0.35)])])
            ]))
            at(hitT) { [weak self] in
                guard let self = self else { return }
                self.burst(at: impact, color: NSColor(calibratedRed: 1, green: 0.6, blue: 0.15, alpha: 1), count: 90, speed: 3.6)
                self.woof(at: impact)
                self.flash(at: impact, color: NSColor(calibratedRed: 1, green: 0.7, blue: 0.4, alpha: 1), peak: 2200)
                self.shake(0.17)
            }
            return hitT + 1.0

        case .bishop:
            // ⚔️ Schwerthieb: Ausholen, diagonaler Hieb mit Lichtblitz, das Opfer zerfaellt
            attacker.runAction(.sequence([
                Board3DView.arc(from: a, to: approach, height: 0.2, duration: approachDur),
                .rotate(by: -0.4, around: tipAxis, duration: 0.18),
                .rotate(by: 0.85, around: tipAxis, duration: 0.09),
                .wait(duration: 0.25),
                .rotate(by: -0.45, around: tipAxis, duration: 0.15),
                Board3DView.arc(from: approach, to: target, height: 0.15, duration: 0.28),
                Board3DView.squash(0.16)
            ]))
            let hitT = approachDur + 0.27
            victim.runAction(.sequence([
                .wait(duration: hitT),
                Board3DView.tremble(0.12),
                .group([.rotate(by: 0.5, around: SCNVector3(dx, 0, dz), duration: 0.3),
                        .move(by: SCNVector3(-dz * 0.25, -0.35, dx * 0.25), duration: 0.35),
                        .fadeOut(duration: 0.35)])
            ]))
            at(hitT) { [weak self] in
                guard let self = self else { return }
                self.slash(at: impact, dir: dir)
                self.woof(at: impact)
                self.shatter(victimPiece, at: v, height: vHeight, dir: dir, power: 0.4)
                self.burst(at: impact, color: NSColor(calibratedRed: 0.6, green: 0.9, blue: 1, alpha: 1), count: 60, speed: 2.8)
                self.shake(0.1)
            }
            return hitT + 0.95

        case .queen:
            // 👑 Magie: Die Dame steigt auf und dreht sich, das Opfer schwebt, leuchtet und implodiert
            let rise: TimeInterval = 0.45
            let up = SCNVector3(approach.x, 0.45, approach.z)
            attacker.runAction(.sequence([
                Board3DView.arc(from: a, to: approach, height: 0.25, duration: approachDur),
                .group([.move(to: up, duration: rise), .rotate(by: 2 * CGFloat.pi, around: SCNVector3(0, 1, 0), duration: rise * 2)]),
                .wait(duration: rise * 0.6),
                Board3DView.arc(from: up, to: target, height: 0.2, duration: 0.35),
                Board3DView.squash(0.2)
            ]))
            let mats = Piece3DFactory.isolateMaterials(victim)
            let magicStart = approachDur + 0.1
            let implodeT = approachDur + rise + 0.55
            victim.runAction(.sequence([
                .wait(duration: magicStart),
                .group([.move(by: SCNVector3(0, 0.7, 0), duration: implodeT - magicStart),
                        .rotate(by: CGFloat.pi, around: SCNVector3(0, 1, 0), duration: implodeT - magicStart),
                        .customAction(duration: implodeT - magicStart) { _, t in
                            let u = min(1, t / CGFloat(implodeT - magicStart))
                            let glow = NSColor(calibratedRed: 0.8 * u, green: 0.45 * u, blue: 1.0 * u, alpha: 1)
                            for m in mats { m.emission.contents = glow }
                        }]),
                .scale(to: 0.01, duration: 0.16)
            ]))
            at(magicStart) { [weak self] in
                guard let self = self else { return }
                self.swirl(around: victim)
            }
            at(implodeT + 0.14) { [weak self] in
                guard let self = self else { return }
                let p = SCNVector3(v.x, 0.7 + vHeight * 0.5, v.z)
                self.burst(at: p, color: NSColor(calibratedRed: 1, green: 0.85, blue: 0.35, alpha: 1), count: 140, speed: 3.2, size: 0.06)
                self.burst(at: p, color: NSColor(calibratedRed: 0.75, green: 0.4, blue: 1, alpha: 1), count: 80, speed: 2.0, size: 0.05, gravity: false)
                self.flash(at: p, color: NSColor(calibratedRed: 0.9, green: 0.7, blue: 1, alpha: 1), peak: 2600)
                self.woof(at: p)
                self.shake(0.08)
            }
            return implodeT + 0.2 + 0.55

        case .pawn, .king:
            // 👊 Schubser: Anlauf, Ausholen, Stoss – das Opfer kippt um und versinkt
            let heavy = aType == .king
            attacker.runAction(.sequence([
                Board3DView.arc(from: a, to: approach, height: 0.18, duration: approachDur),
                .rotate(by: -0.3, around: tipAxis, duration: 0.14),
                .group([.rotate(by: 0.55, around: tipAxis, duration: 0.09),
                        .move(by: SCNVector3(dx * 0.22, 0, dz * 0.22), duration: 0.09)]),
                .wait(duration: 0.18),
                .rotate(by: -0.25, around: tipAxis, duration: 0.12),
                Board3DView.arc(from: SCNVector3(approach.x + dx * 0.22, 0, approach.z + dz * 0.22), to: target, height: 0.12, duration: 0.25),
                Board3DView.squash(0.16)
            ]))
            let hitT = approachDur + 0.23
            victim.runAction(.sequence([
                .wait(duration: hitT),
                .group([.rotate(by: 1.5, around: tipAxis, duration: 0.38),
                        .move(by: SCNVector3(dx * 0.45, 0, dz * 0.45), duration: 0.38)]),
                .group([.move(by: SCNVector3(0, -0.45, 0), duration: 0.35), .fadeOut(duration: 0.35)])
            ]))
            at(hitT) { [weak self] in
                guard let self = self else { return }
                self.burst(at: impact, color: NSColor(calibratedRed: 1, green: 0.85, blue: 0.3, alpha: 1), count: heavy ? 80 : 50, speed: 2.6)
                self.flash(at: impact, color: NSColor(calibratedRed: 1, green: 0.85, blue: 0.5, alpha: 1), peak: heavy ? 2000 : 1300)
                self.shake(heavy ? 0.13 : 0.07)
                self.woof(at: impact)
            }
            at(hitT + 0.38) { [weak self] in self?.dustRing(at: SCNVector3(v.x + dx * 0.5, 0, v.z + dz * 0.5)) }
            return hitT + 0.95
        }
    }

    // MARK: Bewegungs-Bausteine

    static func arc(from a: SCNVector3, to b: SCNVector3, height: CGFloat, duration: TimeInterval) -> SCNAction {
        SCNAction.customAction(duration: duration) { node, t in
            let u = min(1, t / CGFloat(duration))
            let e = u < 0.5 ? 2 * u * u : 1 - pow(-2 * u + 2, 2) / 2
            node.position = SCNVector3(a.x + (b.x - a.x) * e,
                                       a.y + (b.y - a.y) * e + sin(e * CGFloat.pi) * height,
                                       a.z + (b.z - a.z) * e)
        }
    }

    /// Beschleunigender Anlauf (fuer den Rammbock)
    static func charge(from a: SCNVector3, to b: SCNVector3, duration: TimeInterval) -> SCNAction {
        SCNAction.customAction(duration: duration) { node, t in
            let u = min(1, t / CGFloat(duration))
            let e = u * u * u
            node.position = SCNVector3(a.x + (b.x - a.x) * e, a.y + (b.y - a.y) * e, a.z + (b.z - a.z) * e)
        }
    }

    static func projectile(from a: SCNVector3, dir: SCNVector3, distance: CGFloat, height: CGFloat, duration: TimeInterval) -> SCNAction {
        SCNAction.customAction(duration: duration) { node, t in
            let u = min(1, t / CGFloat(duration))
            node.position = SCNVector3(a.x + dir.x * distance * u,
                                       a.y + height * (4 * u * (1 - u)) - 0.6 * u * u,
                                       a.z + dir.z * distance * u)
        }
    }

    static func squash(_ d: TimeInterval) -> SCNAction {
        SCNAction.customAction(duration: d) { node, t in
            let u = min(1, t / CGFloat(d))
            let s = sin(u * CGFloat.pi) * 0.14
            node.scale = SCNVector3(1 + s * 0.6, 1 - s, 1 + s * 0.6)
        }
    }

    static func tremble(_ d: TimeInterval) -> SCNAction {
        var base: SCNVector3? = nil
        return SCNAction.customAction(duration: d) { node, t in
            if base == nil { base = node.position }
            guard let b = base else { return }
            let k = 0.035 * (1 - min(1, t / CGFloat(d)))
            node.position = SCNVector3(b.x + sin(t * 95) * k, b.y, b.z + cos(t * 83) * k)
            if t >= CGFloat(d) - 0.001 { node.position = b }
        }
    }

    // MARK: Effekte

    private func shake(_ strength: CGFloat, duration: TimeInterval = 0.38) {
        shaker.removeAllActions()
        shaker.runAction(.sequence([
            .customAction(duration: duration) { node, t in
                let decay = max(0, 1 - t / CGFloat(duration))
                node.position = SCNVector3(sin(t * 91) * strength * decay, cos(t * 77) * strength * decay * 0.7, 0)
            },
            .move(to: SCNVector3(0, 0, 0), duration: 0.05)
        ]))
    }

    private func flash(at p: SCNVector3, color: NSColor, peak: CGFloat) {
        let l = SCNLight()
        l.type = .omni
        l.color = color
        l.intensity = 0
        l.attenuationStartDistance = 0.3
        l.attenuationEndDistance = 5
        let n = SCNNode()
        n.light = l
        n.position = p
        fxRoot.addChildNode(n)
        n.runAction(.sequence([
            .customAction(duration: 0.4) { node, t in
                let u = t / 0.4
                node.light?.intensity = peak * (u < 0.15 ? u / 0.15 : max(0, 1 - (u - 0.15) / 0.85))
            },
            .removeFromParentNode()
        ]))
    }

    private func burst(at p: SCNVector3, color: NSColor, count: Int, speed: CGFloat,
                       size: CGFloat = 0.05, gravity: Bool = true, life: CGFloat = 0.7) {
        let ps = SCNParticleSystem()
        ps.loops = false
        ps.emissionDuration = 0.06
        ps.birthRate = CGFloat(count) / 0.06
        ps.particleLifeSpan = life
        ps.particleLifeSpanVariation = life * 0.4
        ps.particleVelocity = speed
        ps.particleVelocityVariation = speed * 0.6
        ps.spreadingAngle = 180
        ps.emittingDirection = SCNVector3(0, 1, 0)
        ps.particleSize = size
        ps.particleSizeVariation = size * 0.5
        ps.particleColor = color
        ps.particleColorVariation = SCNVector4(0.04, 0.15, 0.2, 0)
        ps.particleImage = Board3DView.sparkImage
        ps.blendMode = .additive
        ps.isAffectedByGravity = gravity
        ps.isLightingEnabled = false
        let fade = CAKeyframeAnimation()
        fade.values = [1.0, 1.0, 0.0]
        fade.keyTimes = [0, 0.55, 1]
        ps.propertyControllers = [.opacity: SCNParticlePropertyController(animation: fade)]
        let n = SCNNode()
        n.position = p
        fxRoot.addChildNode(n)
        n.addParticleSystem(ps)
        n.runAction(.sequence([.wait(duration: Double(life) * 2 + 0.4), .removeFromParentNode()]))
    }

    /// Staubring am Boden (Landung / Umfallen)
    private func dustRing(at p: SCNVector3) {
        let ps = SCNParticleSystem()
        ps.loops = false
        ps.emissionDuration = 0.08
        ps.birthRate = 700
        ps.particleLifeSpan = 0.8
        ps.particleVelocity = 1.4
        ps.particleVelocityVariation = 0.5
        ps.spreadingAngle = 90
        ps.emittingDirection = SCNVector3(0, 1, 0)
        ps.emitterShape = SCNCylinder(radius: 0.3, height: 0.01)
        ps.birthLocation = .surface
        ps.birthDirection = .surfaceNormal
        ps.particleSize = 0.12
        ps.particleSizeVariation = 0.06
        ps.particleColor = NSColor(calibratedRed: 0.8, green: 0.72, blue: 0.6, alpha: 0.5)
        ps.particleImage = Board3DView.sparkImage
        ps.blendMode = .alpha
        ps.isLightingEnabled = false
        ps.dampingFactor = 2
        let fade = CAKeyframeAnimation()
        fade.values = [0.7, 0.4, 0.0]
        fade.keyTimes = [0, 0.4, 1]
        ps.propertyControllers = [.opacity: SCNParticlePropertyController(animation: fade)]
        let n = SCNNode()
        n.position = SCNVector3(p.x, 0.03, p.z)
        fxRoot.addChildNode(n)
        n.addParticleSystem(ps)
        n.runAction(.sequence([.wait(duration: 2.0), .removeFromParentNode()]))
    }

    /// Magischer Wirbel um eine Figur (Dame)
    private func swirl(around node: SCNNode) {
        let ps = SCNParticleSystem()
        ps.loops = false
        ps.emissionDuration = 0.55
        ps.birthRate = 260
        ps.particleLifeSpan = 0.6
        ps.particleVelocity = 0.4
        ps.emitterShape = SCNSphere(radius: 0.42)
        ps.birthLocation = .surface
        ps.particleSize = 0.05
        ps.particleSizeVariation = 0.03
        ps.particleColor = NSColor(calibratedRed: 0.8, green: 0.5, blue: 1, alpha: 1)
        ps.particleColorVariation = SCNVector4(0.15, 0.2, 0.2, 0)
        ps.particleImage = Board3DView.sparkImage
        ps.blendMode = .additive
        ps.isLightingEnabled = false
        ps.isLocal = true
        let holder = SCNNode()
        holder.position = SCNVector3(0, 0.45, 0)
        node.addChildNode(holder)
        holder.addParticleSystem(ps)
    }

    /// Comic-"WUFF!" beim Kampf im Hunde-Modus
    private func woof(at p: SCNVector3) {
        guard Piece3DFactory.dogMode else { return }
        let words = ["WUFF!", "WAU!", "KLAFF!"]
        let word = words[Int.random(in: 0..<words.count)]
        let img = renderBitmapImage(width: 360, height: 150) { r in
            let attrs: [NSAttributedString.Key: Any] = [
                .font: NSFont.systemFont(ofSize: 96, weight: .black),
                .foregroundColor: NSColor(calibratedRed: 1, green: 0.85, blue: 0.1, alpha: 1),
                .strokeColor: NSColor(calibratedRed: 0.8, green: 0.1, blue: 0.05, alpha: 1),
                .strokeWidth: -4.0
            ]
            let sz = (word as NSString).size(withAttributes: attrs)
            (word as NSString).draw(at: NSPoint(x: r.midX - sz.width / 2, y: r.midY - sz.height / 2), withAttributes: attrs)
        }
        let plane = SCNPlane(width: 1.2, height: 0.5)
        let m = SCNMaterial()
        m.lightingModel = .constant
        m.diffuse.contents = img
        m.isDoubleSided = true
        m.readsFromDepthBuffer = false
        plane.materials = [m]
        let n = SCNNode(geometry: plane)
        n.position = SCNVector3(p.x, p.y + 0.9, p.z)
        n.constraints = [SCNBillboardConstraint()]
        n.renderingOrder = 60
        n.scale = SCNVector3(0.2, 0.2, 0.2)
        fxRoot.addChildNode(n)
        n.runAction(.sequence([
            .scale(to: 1.0, duration: 0.14),
            .group([.move(by: SCNVector3(0, 0.45, 0), duration: 0.7), .sequence([.wait(duration: 0.4), .fadeOut(duration: 0.3)])]),
            .removeFromParentNode()
        ]))
    }

    /// Lichtschwert-Hieb (Laeufer)
    private func slash(at p: SCNVector3, dir: SCNVector3) {
        let g = SCNPlane(width: 1.4, height: 0.08)
        let m = SCNMaterial()
        m.lightingModel = .constant
        let c = NSColor(calibratedRed: 0.8, green: 0.97, blue: 1, alpha: 1)
        m.diffuse.contents = c
        m.emission.contents = c
        m.isDoubleSided = true
        m.blendMode = .add
        m.writesToDepthBuffer = false
        g.materials = [m]
        let blade = SCNNode(geometry: g)
        blade.eulerAngles = SCNVector3(0, 0, 0.75)
        blade.scale = SCNVector3(0.05, 1, 1)
        let holder = SCNNode()
        holder.position = p
        holder.eulerAngles = SCNVector3(0, atan2(dir.x, dir.z), 0)
        holder.addChildNode(blade)
        fxRoot.addChildNode(holder)
        blade.runAction(.sequence([
            .customAction(duration: 0.1) { node, t in node.scale = SCNVector3(max(0.05, t / 0.1), 1, 1) },
            .fadeOut(duration: 0.3)
        ]))
        holder.runAction(.sequence([.wait(duration: 0.5), .removeFromParentNode()]))
    }

    /// Das Opfer zerbricht in Splitter (echte Physik: fallen, springen, rollen aus)
    private func shatter(_ piece: ChessPiece, at p: SCNVector3, height: CGFloat, dir: SCNVector3, power: CGFloat) {
        let mat = Piece3DFactory.material(piece.color)
        for i in 0..<20 {
            let s = rnd(0.05, 0.11)
            let g = SCNBox(width: s, height: s * rnd(0.6, 1.5), length: s, chamferRadius: s * 0.15)
            g.materials = [mat]
            let n = SCNNode(geometry: g)
            let ox = rnd(-0.16, 0.16), oz = rnd(-0.16, 0.16)
            n.position = SCNVector3(p.x + ox, rnd(0.06, max(0.1, height)), p.z + oz)
            n.eulerAngles = SCNVector3(rnd(0, 3), rnd(0, 3), 0)
            let body = SCNPhysicsBody(type: .dynamic, shape: nil)
            body.mass = 0.05
            body.restitution = 0.35
            body.friction = 0.7
            n.physicsBody = body
            fxRoot.addChildNode(n)
            let vx = ox * 9 + dir.x * power * 2
            let vz = oz * 9 + dir.z * power * 2
            body.applyForce(SCNVector3(vx * 0.05, rnd(1.2, 2.8) * 0.05, vz * 0.05), asImpulse: true)
            body.applyTorque(SCNVector4(rnd(-1, 1), 1, rnd(-1, 1), 0.01), asImpulse: true)
            n.runAction(.sequence([.wait(duration: 1.4 + Double(i) * 0.02), .fadeOut(duration: 0.4), .removeFromParentNode()]))
        }
    }

    // MARK: Bilder (Umgebung, Hintergrund, Funken, Namensschild)

    static let environmentImage: NSImage = renderBitmapImage(width: 512, height: 256) { r in
        NSGradient(colors: [NSColor(calibratedRed: 0.10, green: 0.08, blue: 0.06, alpha: 1),
                            NSColor(calibratedRed: 0.45, green: 0.40, blue: 0.34, alpha: 1),
                            NSColor(calibratedRed: 0.92, green: 0.88, blue: 0.80, alpha: 1)])?.draw(in: r, angle: 90)
        NSColor(white: 1.0, alpha: 0.95).setFill()
        NSBezierPath(roundedRect: NSRect(x: r.width * 0.12, y: r.height * 0.70, width: r.width * 0.18, height: r.height * 0.20),
                     xRadius: 6, yRadius: 6).fill()
        NSColor(white: 1.0, alpha: 0.6).setFill()
        NSBezierPath(roundedRect: NSRect(x: r.width * 0.62, y: r.height * 0.74, width: r.width * 0.12, height: r.height * 0.14),
                     xRadius: 6, yRadius: 6).fill()
    }

    static let backgroundImage: NSImage = renderBitmapImage(width: 512, height: 512) { r in
        NSGradient(colors: [NSColor(calibratedRed: 0.30, green: 0.22, blue: 0.15, alpha: 1),
                            NSColor(calibratedRed: 0.07, green: 0.055, blue: 0.045, alpha: 1)])?
            .draw(in: NSBezierPath(rect: r), relativeCenterPosition: NSPoint(x: 0, y: 0.25))
    }

    static let sparkImage: NSImage = renderBitmapImage(width: 64, height: 64) { r in
        NSGradient(colors: [NSColor(white: 1, alpha: 1), NSColor(white: 1, alpha: 0.35), NSColor(white: 1, alpha: 0)])?
            .draw(in: NSBezierPath(ovalIn: r), relativeCenterPosition: NSPoint(x: 0, y: 0))
    }

    static func labelImage(_ text: String, bg: NSColor) -> (NSImage, CGFloat, CGFloat) {
        let font = NSFont.systemFont(ofSize: 44, weight: .bold)
        let attrs: [NSAttributedString.Key: Any] = [.font: font, .foregroundColor: NSColor.white]
        let sz = (text as NSString).size(withAttributes: attrs)
        let w = ceil(sz.width + 44), h = ceil(sz.height + 18)
        let img = renderBitmapImage(width: Int(w), height: Int(h)) { r in
            bg.setFill()
            NSBezierPath(roundedRect: r.insetBy(dx: 2, dy: 2), xRadius: h / 2 - 2, yRadius: h / 2 - 2).fill()
            NSColor(white: 1, alpha: 0.85).setStroke()
            let border = NSBezierPath(roundedRect: r.insetBy(dx: 3, dy: 3), xRadius: h / 2 - 3, yRadius: h / 2 - 3)
            border.lineWidth = 3
            border.stroke()
            (text as NSString).draw(at: NSPoint(x: 22, y: 9), withAttributes: attrs)
        }
        return (img, w, h)
    }
}

// MARK: - Board Drawing View

class ChessBoardView: NSView {
    var board = ChessBoard()
    var selectedPos: Position?
    var validTargets: [Position] = []
    var lastMove: ChessMove?
    var kingInCheck: Position?
    var onCellClick: ((Int, Int) -> Void)?
    var hiddenSquares: [Position] = []                                  // waehrend Animation ausgeblendet
    var nameTags: [Int: (type: ChessPieceType, name: String)] = [:]     // PlayerColor.rawValue → benannte Figur
    // v3: Brett gewendet (Schwarz unten), Tipp-Pfeil, Gefahren-Ringe, Denkanstoss-Markierung
    var viewFromBlack = false { didSet { needsDisplay = true } }
    var hintArrow: ChessMove?
    var dangerSquares: [Position] = []
    var focusSquare: Position?

    /// Anzeige-Zeile/-Spalte eines Brettfeldes (beruecksichtigt das Wenden)
    func displayRC(_ pos: Position) -> (Int, Int) {
        viewFromBlack ? (7 - pos.row, 7 - pos.col) : (pos.row, pos.col)
    }

    /// Liefert den Mittelpunkt eines Feldes in View-Koordinaten (fuer die Animation)
    func centerOfSquare(_ pos: Position) -> NSPoint {
        let sz = min(bounds.width, bounds.height)
        let cellSz = sz / CGFloat(ChessBoard.size)
        let ox = (bounds.width - sz) / 2
        let oy = (bounds.height - sz) / 2
        let (dr, dc) = displayRC(pos)
        return NSPoint(x: ox + (CGFloat(dc) + 0.5) * cellSz,
                       y: oy + (CGFloat(dr) + 0.5) * cellSz)
    }

    var cellSize: CGFloat {
        min(bounds.width, bounds.height) / CGFloat(ChessBoard.size)
    }

    /// Ungefaehre Hoehe des Paw-Namensbandes (fuer die Platzierung des Spielernamens)
    func bandHeightGuess(_ cellSz: CGFloat) -> CGFloat { max(7.0, cellSz * 0.15) + 4 }

    // Farben kommen aus dem gewaehlten Farbthema (NEU)
    private var darkColor: NSColor  { BoardTheme.current.dark }
    private var lightColor: NSColor { BoardTheme.current.light }

    override var isFlipped: Bool { true }

    override func draw(_ dirtyRect: NSRect) {
        super.draw(dirtyRect)
        let sz = min(bounds.width, bounds.height)
        guard sz > 0 else { return }
        let cellSz = sz / CGFloat(ChessBoard.size)
        let ox = (bounds.width - sz) / 2
        let oy = (bounds.height - sz) / 2

        // Board border
        BoardTheme.current.border.setFill()
        NSRect(x: ox - 3, y: oy - 3, width: sz + 6, height: sz + 6).fill()

        for r in 0..<ChessBoard.size {
            for c in 0..<ChessBoard.size {
                let pos = Position(row: r, col: c)
                let (dr, dc) = displayRC(pos)
                let x = ox + CGFloat(dc) * cellSz
                let y = oy + CGFloat(dr) * cellSz
                let rect = NSRect(x: x, y: y, width: cellSz, height: cellSz)
                let isDark = (r + c) % 2 == 1

                // Square color
                (isDark ? darkColor : lightColor).setFill()
                rect.fill()

                // Last move highlight
                if let lm = lastMove, (lm.from == pos || lm.to == pos) {
                    NSColor(calibratedRed: 0.85, green: 0.78, blue: 0.2, alpha: 0.4).setFill()
                    rect.fill()
                }

                // King in check highlight
                if let kc = kingInCheck, kc == pos {
                    NSColor(calibratedRed: 1.0, green: 0.0, blue: 0.0, alpha: 0.4).setFill()
                    rect.fill()
                }

                // Valid target highlight
                if validTargets.contains(pos) {
                    NSColor.systemGreen.withAlphaComponent(0.3).setFill()
                    rect.fill()
                }

                // Selected highlight
                if selectedPos == pos {
                    NSColor.systemBlue.withAlphaComponent(0.4).setFill()
                    rect.fill()
                }

                // Draw chess piece
                if let piece = board.piece(at: pos), !hiddenSquares.contains(pos) {
                    let isWhite = piece.color == .white
                    let paw = PieceStyle.current == .pawPatrol

                    // ── Immer die ECHTE Schachfigur-Form zeichnen (Turm sieht aus wie Turm!) ──
                    // Im Paw-Modus etwas kleiner und nach oben versetzt, damit unten Platz fuer das Namensband ist.
                    let symbol = chessPieceChar(piece.type, piece.color) as NSString
                    let isPawn = piece.type == .pawn
                    let fontSize: CGFloat = cellSz * (isPawn ? 0.76 : 1.02) * (paw ? 0.82 : 1.0)
                    let fillColor: NSColor  = isWhite ? .white : NSColor(white: 0.08, alpha: 1)
                    let strokeClr: NSColor  = isWhite ? NSColor(white: 0.25, alpha: 1) : NSColor(white: 0.0, alpha: 0.7)
                    let strokeW: CGFloat    = isWhite ? -1.2 : -1.0  // negative = stroke+fill
                    let shadow = NSShadow()
                    shadow.shadowColor  = NSColor.black.withAlphaComponent(isWhite ? 0.45 : 0.30)
                    shadow.shadowOffset = NSSize(width: 1, height: -1)
                    shadow.shadowBlurRadius = isWhite ? 3 : 2
                    let attrs: [NSAttributedString.Key: Any] = [
                        .font:            NSFont.systemFont(ofSize: fontSize),
                        .foregroundColor: fillColor,
                        .strokeColor:     strokeClr,
                        .strokeWidth:     strokeW,
                        .shadow:          shadow
                    ]
                    let tsz = symbol.size(withAttributes: attrs)
                    let glyphYOffset: CGFloat = paw ? cellSz * 0.10 : 0   // nach oben (flipped: +y = runter, also -shift optisch hoch)
                    if !(paw && piece.type == .pawn) {
                        // Pfoetchen-Bauern werden im Paw-Modus als reiner Pfoten-Chip gezeichnet
                        symbol.draw(at: NSPoint(x: rect.midX - tsz.width / 2,
                                                y: rect.midY - tsz.height / 2 - glyphYOffset),
                                    withAttributes: attrs)
                    }

                    if paw {
                        let teamColor: NSColor = isWhite ? NSColor(red: 0.85, green: 0.1, blue: 0.1, alpha: 1)
                                                         : NSColor(red: 0.15, green: 0.4, blue: 0.95, alpha: 1)
                        if piece.type == .pawn {
                            // 🐾 Die Pfoetchen-Bauern bleiben als Pfoten-Chip (Wunsch von Dr. Seb!)
                            let disc = rect.insetBy(dx: cellSz * 0.16, dy: cellSz * 0.16)
                            let discColor: NSColor = isWhite ? NSColor(white: 1.0, alpha: 0.95) : NSColor(white: 0.13, alpha: 0.95)
                            discColor.setFill()
                            let dp = NSBezierPath(ovalIn: disc); dp.fill()
                            teamColor.setStroke(); dp.lineWidth = max(1.5, cellSz * 0.04); dp.stroke()
                            let pawE = "🐾" as NSString
                            let pa: [NSAttributedString.Key: Any] = [.font: NSFont.systemFont(ofSize: cellSz * 0.40)]
                            let ps = pawE.size(withAttributes: pa)
                            pawE.draw(at: NSPoint(x: rect.midX - ps.width / 2, y: rect.midY - ps.height / 2), withAttributes: pa)
                        } else {
                            // 🐶 DER HUND IN FIGURFORM: Der Hundekopf sitzt OBEN AUF der
                            // Schachfigur - Turmkoerper + Hundekopf = Marshall als Turm!
                            let headSize: CGFloat = cellSz * 0.34
                            let headYOffset: CGFloat
                            switch piece.type {
                            case .rook:   headYOffset = -0.30   // ueber den Zinnen
                            case .knight: headYOffset = -0.26   // auf dem Pferdekopf
                            case .bishop: headYOffset = -0.32   // auf der Spitze
                            case .queen:  headYOffset = -0.33   // ueber der Krone
                            case .king:   headYOffset = -0.33
                            default:      headYOffset = -0.30
                            }
                            let headC = NSPoint(x: rect.midX, y: rect.midY + cellSz * headYOffset - glyphYOffset)
                            // Heller Halo hinter dem Kopf, damit er auf schwarzen Figuren sichtbar ist
                            let haloR = headSize * 0.55
                            let halo = NSRect(x: headC.x - haloR, y: headC.y - haloR, width: haloR * 2, height: haloR * 2)
                            NSColor(white: 1.0, alpha: 0.85).setFill()
                            let hp = NSBezierPath(ovalIn: halo); hp.fill()
                            teamColor.setStroke(); hp.lineWidth = max(1.0, cellSz * 0.025); hp.stroke()

                            // Original-Muetze/Helm in Charakterfarbe (Chase blau, Marshall rot, ...)
                            let capColor = pawPatrolColor(piece.type)
                            let capW = haloR * 1.6, capH = haloR * 0.85
                            let capRect = NSRect(x: headC.x - capW / 2, y: headC.y - haloR - capH * 0.35,
                                                 width: capW, height: capH)
                            capColor.setFill()
                            NSBezierPath(ovalIn: capRect).fill()
                            // Muetzenschirm
                            let brim = NSRect(x: headC.x - capW * 0.55, y: headC.y - haloR + capH * 0.12,
                                              width: capW * 1.1, height: max(1.5, capH * 0.18))
                            capColor.setFill()
                            NSBezierPath(roundedRect: brim, xRadius: 2, yRadius: 2).fill()

                            let dog = pawPatrolGlyph(piece.type) as NSString
                            let dAttrs: [NSAttributedString.Key: Any] = [.font: NSFont.systemFont(ofSize: headSize)]
                            let dsz = dog.size(withAttributes: dAttrs)
                            dog.draw(at: NSPoint(x: headC.x - dsz.width / 2, y: headC.y - dsz.height / 2), withAttributes: dAttrs)
                        }

                        // Sauberes Namensband unten: "Turm" + Hundename, garantiert INNERHALB der Zelle
                        let dogName = piece.type == .pawn ? "Pfoetchen" : pawPatrolName(piece.type)
                        let full = "\(piece.type.name) · \(dogName)"
                        var band = full
                        // Font so waehlen/kuerzen, dass es in die Zelle passt (kein Ueberlaufen mehr!)
                        var bandFont = NSFont.systemFont(ofSize: max(7.0, cellSz * 0.15), weight: .bold)
                        var bandAttrs: [NSAttributedString.Key: Any] = [.font: bandFont, .foregroundColor: NSColor.white]
                        let maxW = cellSz * 0.92
                        if (band as NSString).size(withAttributes: bandAttrs).width > maxW {
                            band = piece.type.name   // nur Schach-Name, wenn zu lang
                        }
                        if (band as NSString).size(withAttributes: bandAttrs).width > maxW {
                            bandFont = NSFont.systemFont(ofSize: max(6.0, cellSz * 0.12), weight: .bold)
                            bandAttrs[.font] = bandFont
                        }
                        let bandStr = band as NSString
                        let bsz = bandStr.size(withAttributes: bandAttrs)
                        // rect.maxY ist in geflipptem View der UNTERE Rand -> Band sitzt sauber unten
                        let bandH = bsz.height + 2
                        let bandRect = NSRect(x: rect.midX - min(bsz.width, maxW) / 2 - 3,
                                              y: rect.maxY - bandH - 1,
                                              width: min(bsz.width, maxW) + 6, height: bandH)
                        teamColor.withAlphaComponent(0.92).setFill()
                        NSBezierPath(roundedRect: bandRect, xRadius: 3, yRadius: 3).fill()
                        bandStr.draw(at: NSPoint(x: bandRect.midX - bsz.width / 2, y: bandRect.midY - bsz.height / 2),
                                     withAttributes: bandAttrs)
                    }

                    // Namens-Schildchen an der "getauften" Figur (Koenig oder Dame)
                    if let tag = nameTags[piece.color.rawValue], tag.type == piece.type, !tag.name.isEmpty {
                        let name = String(tag.name.prefix(10)) as NSString
                        let tagFont = NSFont.systemFont(ofSize: max(8, cellSz * 0.16), weight: .bold)
                        let tagAttrs: [NSAttributedString.Key: Any] = [
                            .font: tagFont,
                            .foregroundColor: NSColor.white
                        ]
                        let nsz = name.size(withAttributes: tagAttrs)
                        let padX: CGFloat = 4
                        // Im Paw-Modus sitzt unten das Namensband -> Spielername nach oben (flipped: minY = oben)
                        let tagY: CGFloat = paw ? rect.minY + 1 : rect.minY + 1
                        let tagRect = NSRect(x: rect.midX - nsz.width / 2 - padX,
                                             y: paw ? rect.maxY - bandHeightGuess(cellSz) - nsz.height - 3 : tagY,
                                             width: nsz.width + padX * 2,
                                             height: nsz.height + 2)
                        let tagBg = piece.color == .white ? NSColor.chessGreen : NSColor(red: 0.55, green: 0.15, blue: 0.15, alpha: 1)
                        tagBg.withAlphaComponent(0.92).setFill()
                        NSBezierPath(roundedRect: tagRect, xRadius: 4, yRadius: 4).fill()
                        name.draw(at: NSPoint(x: tagRect.midX - nsz.width / 2, y: tagRect.midY - nsz.height / 2),
                                  withAttributes: tagAttrs)
                    }
                }

                // Valid move indicator (dot on empty squares, ring on occupied)
                if validTargets.contains(pos) {
                    if board.piece(at: pos) == nil {
                        let dotSz: CGFloat = cellSz * 0.22
                        let dotRect = NSRect(x: rect.midX - dotSz / 2, y: rect.midY - dotSz / 2, width: dotSz, height: dotSz)
                        NSColor.systemGreen.withAlphaComponent(0.7).setFill()
                        NSBezierPath(ovalIn: dotRect).fill()
                    } else {
                        // Draw a ring around capturable pieces
                        let ringInset: CGFloat = cellSz * 0.05
                        let ringRect = rect.insetBy(dx: ringInset, dy: ringInset)
                        let ringPath = NSBezierPath(ovalIn: ringRect)
                        NSColor.systemRed.withAlphaComponent(0.5).setStroke()
                        ringPath.lineWidth = 3.0
                        ringPath.stroke()
                    }
                }

                // v3: Gefahren-Ring (orange) und Denkanstoss (gelb)
                if dangerSquares.contains(pos) {
                    let rp = NSBezierPath(ovalIn: rect.insetBy(dx: cellSz * 0.04, dy: cellSz * 0.04))
                    NSColor.systemOrange.withAlphaComponent(0.9).setStroke()
                    rp.lineWidth = max(2.5, cellSz * 0.06)
                    rp.stroke()
                }
                if focusSquare == pos {
                    let rp = NSBezierPath(ovalIn: rect.insetBy(dx: cellSz * 0.02, dy: cellSz * 0.02))
                    NSColor.systemYellow.withAlphaComponent(0.95).setStroke()
                    rp.lineWidth = max(3, cellSz * 0.07)
                    rp.stroke()
                }

                // Coordinate labels
                if dc == 0 {
                    let label = "\(8 - r)" as NSString
                    let lAttrs: [NSAttributedString.Key: Any] = [
                        .font: NSFont.systemFont(ofSize: cellSz * 0.15),
                        .foregroundColor: isDark ? lightColor : darkColor
                    ]
                    label.draw(at: NSPoint(x: x + 2, y: y + 2), withAttributes: lAttrs)
                }
                if dr == 7 {
                    let label = String(Character(UnicodeScalar(97 + c)!)) as NSString
                    let lAttrs: [NSAttributedString.Key: Any] = [
                        .font: NSFont.systemFont(ofSize: cellSz * 0.15),
                        .foregroundColor: isDark ? lightColor : darkColor
                    ]
                    let lsz = label.size(withAttributes: lAttrs)
                    label.draw(at: NSPoint(x: x + cellSz - lsz.width - 2, y: y + cellSz - lsz.height - 2), withAttributes: lAttrs)
                }
            }
        }

        // v3: Coach-Pfeil (Empfehlung) ueber allem
        if let h = hintArrow {
            let a = centerOfSquare(h.from), b = centerOfSquare(h.to)
            let dx = b.x - a.x, dy = b.y - a.y
            let len = max(1, sqrt(dx * dx + dy * dy))
            let ux = dx / len, uy = dy / len
            let headL = cellSz * 0.38, headW = cellSz * 0.30
            let tip = NSPoint(x: b.x - ux * cellSz * 0.12, y: b.y - uy * cellSz * 0.12)
            let baseP = NSPoint(x: tip.x - ux * headL, y: tip.y - uy * headL)
            let shaft = NSBezierPath()
            shaft.move(to: NSPoint(x: a.x + ux * cellSz * 0.2, y: a.y + uy * cellSz * 0.2))
            shaft.line(to: baseP)
            shaft.lineWidth = cellSz * 0.13
            shaft.lineCapStyle = .round
            let green = NSColor(calibratedRed: 0.15, green: 0.75, blue: 0.3, alpha: 0.8)
            green.setStroke()
            shaft.stroke()
            let head = NSBezierPath()
            head.move(to: tip)
            head.line(to: NSPoint(x: baseP.x - uy * headW, y: baseP.y + ux * headW))
            head.line(to: NSPoint(x: baseP.x + uy * headW, y: baseP.y - ux * headW))
            head.close()
            green.setFill()
            head.fill()
        }
    }

    override func mouseDown(with event: NSEvent) {
        let pt = convert(event.locationInWindow, from: nil)
        let sz = min(bounds.width, bounds.height)
        guard sz > 0 else { return }
        let cellSz = sz / CGFloat(ChessBoard.size)
        let ox = (bounds.width - sz) / 2
        let oy = (bounds.height - sz) / 2
        guard pt.x >= ox, pt.y >= oy else { return }
        let dc = Int((pt.x - ox) / cellSz)
        let dr = Int((pt.y - oy) / cellSz)
        if dr >= 0 && dr < ChessBoard.size && dc >= 0 && dc < ChessBoard.size {
            // v3: gewendetes Brett zurueckrechnen
            onCellClick?(viewFromBlack ? 7 - dr : dr, viewFromBlack ? 7 - dc : dc)
        }
    }

    func refresh(board: ChessBoard, selected: Position?, targets: [Position], last: ChessMove?, check: Position?) {
        self.board = board
        self.selectedPos = selected
        self.validTargets = targets
        self.lastMove = last
        self.kingInCheck = check
        needsDisplay = true
    }
}

// MARK: - Promotion Dialog

class PromotionDialog {
    static func ask(color: PlayerColor, in window: NSWindow) -> ChessPieceType {
        let alert = NSAlert()
        alert.messageText = "Bauernumwandlung"
        alert.informativeText = "In welche Figur soll der Bauer umgewandelt werden?"
        let paw = PieceStyle.current == .pawPatrol
        alert.addButton(withTitle: paw ? "Dame - Skye \u{1F681}" : "Dame (D)")
        alert.addButton(withTitle: paw ? "Turm - Marshall \u{1F692}" : "Turm (T)")
        alert.addButton(withTitle: paw ? "Laeufer - Rocky \u{267B}\u{FE0F}" : "Laeufer (L)")
        alert.addButton(withTitle: paw ? "Springer - Rubble \u{1F69C}" : "Springer (S)")
        let resp = alert.runModal()
        switch resp {
        case .alertFirstButtonReturn: return .queen
        case .alertSecondButtonReturn: return .rook
        case .alertThirdButtonReturn: return .bishop
        default: return .knight
        }
    }
}

// MARK: - v3: Spielstand-Schnappschuss fuer "Zug zuruecknehmen"

struct GameSnapshot {
    let board: ChessBoard
    let currentPlayer: PlayerColor
    let lastMove: ChessMove?
    let positionHistory: [String: Int]
    let gameMoveHistory: [String]
}

// MARK: - Main Window Controller

class SchachWindowController: NSObject, NSWindowDelegate {
    var window: NSWindow!
    var board = ChessBoard()
    var currentPlayer: PlayerColor = .white
    var gameMode: GameMode = .playerVsPlayer
    var aiEngine = ChessAIEngine(difficulty: 5)
    var selectedPos: Position?
    var validMoves: [ChessMove] = []
    var lastMove: ChessMove?
    var computerThinking = false
    var gameOver = false
    var gameSessionID: Int = 0
    var aiCancelled = false

    // Draw detection
    var positionHistory: [String: Int] = [:]

    // Tutorial
    var tutorialEngine = ChessTutorialEngine()
    var hintMove: ChessMove?

    // Analyse-Engine (NEU)
    var moveAnalyzer = ChessMoveAnalyzer()
    var analysisEnabled = false
    var gameMoveHistory: [String] = []

    // Spielernamen & Figuren-Taufe (NEU): Jeder Spieler kann Koenig ODER Dame nach sich benennen
    var whiteName = ""
    var blackName = ""
    var whiteTagType: ChessPieceType = .king
    var blackTagType: ChessPieceType = .king

    // 3D-Animation (NEU)
    var animationsEnabled: Bool = {
        let d = UserDefaults.standard
        return d.object(forKey: "animAktiv") == nil ? true : d.bool(forKey: "animAktiv")
    }()
    var animView: PieceAnimationView?
    var animToggle: NSButton?

    // v3: Echtes 3D-Brett, Wenden, Coach, Zuruecknehmen
    var board3D: Board3DView?
    var use3DBoard: Bool = {
        let d = UserDefaults.standard
        return d.object(forKey: "brett3D") == nil ? true : d.bool(forKey: "brett3D")
    }()
    var board3DToggle: NSButton?
    var dogs3D: Bool = UserDefaults.standard.bool(forKey: "hundeTeam3D")   // v3.1: eigenes Hunde-Team im 3D
    var flipButton: NSButton?
    var undoButton: NSButton?
    var rightBarButtons: [NSButton] = []
    var viewFromBlack = false
    var autoFlip: Bool = UserDefaults.standard.bool(forKey: "autoWenden")
    let hintCoach = ChessCoach()
    let feedbackCoach = ChessCoach()
    let coachQueue = DispatchQueue(label: "schach.coach", qos: .userInitiated)
    let analysisQueue = DispatchQueue(label: "schach.analyse", qos: .userInitiated)
    var hintStage = 0
    var pendingAdvice: CoachAdvice?
    var coachBusy = false
    var dangerSquares: [Position] = []
    var focusSquare: Position?
    var hintArrow: ChessMove?
    var undoStack: [GameSnapshot] = []
    var pendingAnalyses = 0
    var pendingFreePlayResult: (won: Bool, drawn: Bool)?
    var lastOwnFeedback: String?
    var explanationPanel: NSView?
    var explanationIcon: NSTextField?
    var lessonAgainButton: NSButton?
    var coachBubble: NSView?
    var coachBubbleLabel: NSTextField?
    var coachBubbleClose: NSButton?

    // Schach-Akademie (NEU)
    var academyProfile: PlayerProfile?
    var currentLesson: ChessLesson?
    var currentLevelShown = 1
    var lessonAttempts = 0
    var lessonSolved = false
    var lessonOwnMoves = 0
    var lessonRatingSum = 0
    var lessonRatingCount = 0
    var lessonNextButton: NSButton?

    /// Spielt die KI in diesem Modus Schwarz?
    var aiPlaysBlack: Bool {
        gameMode == .playerVsComputer || gameMode == .tutorial ||
        (gameMode == .academy && (currentLesson?.freePlayMoves ?? 0) > 0)
    }

    /// Anzeigename fuer eine Farbe (faellt auf Standard zurueck)
    func displayName(for color: PlayerColor) -> String {
        let n = color == .white ? whiteName : blackName
        return n.isEmpty ? color.displayName : n
    }

    // UI elements
    var boardView: ChessBoardView!
    var statusLabel: NSTextField!
    var whiteLabel: NSTextField!
    var blackLabel: NSTextField!
    var menuContainer: NSView!
    var explanationLabel: NSTextField!
    var hintButton: NSButton!

    // Analyse UI (NEU)
    var analysisPanel: NSView?
    var analysisLabel: NSTextField?
    var evalBarView: EvalBarView?
    var analysisToggle: NSButton?
    var analysisTitleLabel: NSTextField?

    func launch() {
        let w: CGFloat = 600
        let h: CGFloat = 760
        window = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: w, height: h),
            styleMask: [.titled, .closable, .miniaturizable, .resizable, .fullSizeContentView],
            backing: .buffered,
            defer: false
        )
        window.title = "Schach"
        window.center()
        window.isReleasedWhenClosed = false
        window.delegate = self
        window.backgroundColor = NSColor.windowBackgroundColor
        window.collectionBehavior = [.fullScreenPrimary]

        showMenu()
        window.makeKeyAndOrderFront(nil)
    }

    // MARK: - Menu Screen

    func showMenu() {
        aiCancelled = true
        computerThinking = false
        gameSessionID += 1
        gameOver = false
        currentLesson = nil
        animView?.cancel()
        board3D?.finishNow()
        whiteName = ""; blackName = ""
        window.contentMinSize = NSSize(width: 420, height: 560)

        guard let cv = window.contentView else { return }
        cv.subviews.forEach { $0.removeFromSuperview() }
        window.setContentSize(NSSize(width: 460, height: 820))
        window.backgroundColor = .menuBg
        window.title = "Schach"

        // Scroll container
        let scroll = NSScrollView(frame: cv.bounds)
        scroll.hasVerticalScroller = true   // v3: sichtbar, falls das Menue hoeher als das Fenster ist
        scroll.autoresizingMask = [.width, .height]
        scroll.drawsBackground = false
        cv.addSubview(scroll)

        let container = FlippedView()      // v3: Menue beginnt oben (vorher war es nach unten gescrollt)
        container.translatesAutoresizingMaskIntoConstraints = false
        scroll.documentView = container

        // ── Title ──
        let titleView = ChessGradientTitleView()
        titleView.translatesAutoresizingMaskIntoConstraints = false

        let subLabel = menuLabel("Klassisches Schachspiel", size: 14, color: NSColor(white: 0.55, alpha: 1))

        // ── Mini board preview ──
        let miniBoard = MiniChessBoardView()
        miniBoard.translatesAutoresizingMaskIntoConstraints = false

        // ── Card: Spieler vs Computer ──
        let cardComp = MenuCardView()
        cardComp.isAccented = true
        cardComp.translatesAutoresizingMaskIntoConstraints = false

        let iconComp = sfIcon("desktopcomputer", tint: NSColor(white: 0.25, alpha: 1))
        let titleComp = menuCardTitle("Spieler vs Computer")
        let subComp   = menuCardSub("Gegen die KI spielen")
        let textComp  = vstack([titleComp, subComp])
        let topComp   = hstack([iconComp, textComp], spacing: 14)
        topComp.alignment = .centerY

        let diffRow   = hstack([menuLabel("Spielstärke:", size: 13, weight: .medium, color: NSColor(white:0.2,alpha:1)),
                                menuLabel("", size: 13, weight: .semibold, color: .chessGreen)], spacing: 0)
        (diffRow.arrangedSubviews[1] as! NSTextField).tag = 201
        (diffRow.arrangedSubviews[1] as! NSTextField).setContentHuggingPriority(.required, for: .horizontal)

        let savedLevel = UserDefaults.standard.integer(forKey: "kiStufe")
        aiEngine.difficulty = savedLevel > 0 ? savedLevel : 5
        let slider = NSSlider(value: Double(aiEngine.difficulty), minValue: 1, maxValue: 10, target: self, action: #selector(diffChanged(_:)))
        slider.translatesAutoresizingMaskIntoConstraints = false
        slider.numberOfTickMarks = 10; slider.allowsTickMarkValuesOnly = true; slider.tag = 200
        updateDiffLabel(slider)

        let startBtn = makeAccentButton("▶  Spiel starten", action: #selector(startVsComputer))

        [topComp, diffRow, slider, startBtn].forEach { cardComp.addSubview($0) }
        NSLayoutConstraint.activate([
            topComp.topAnchor.constraint(equalTo: cardComp.topAnchor, constant: 16),
            topComp.leadingAnchor.constraint(equalTo: cardComp.leadingAnchor, constant: 18),
            topComp.trailingAnchor.constraint(equalTo: cardComp.trailingAnchor, constant: -18),
            iconComp.widthAnchor.constraint(equalToConstant: 28), iconComp.heightAnchor.constraint(equalToConstant: 28),
            diffRow.topAnchor.constraint(equalTo: topComp.bottomAnchor, constant: 14),
            diffRow.leadingAnchor.constraint(equalTo: cardComp.leadingAnchor, constant: 18),
            diffRow.trailingAnchor.constraint(equalTo: cardComp.trailingAnchor, constant: -18),
            slider.topAnchor.constraint(equalTo: diffRow.bottomAnchor, constant: 6),
            slider.leadingAnchor.constraint(equalTo: cardComp.leadingAnchor, constant: 18),
            slider.trailingAnchor.constraint(equalTo: cardComp.trailingAnchor, constant: -18),
            startBtn.topAnchor.constraint(equalTo: slider.bottomAnchor, constant: 14),
            startBtn.leadingAnchor.constraint(equalTo: cardComp.leadingAnchor, constant: 18),
            startBtn.trailingAnchor.constraint(equalTo: cardComp.trailingAnchor, constant: -18),
            startBtn.heightAnchor.constraint(equalToConstant: 48),
            startBtn.bottomAnchor.constraint(equalTo: cardComp.bottomAnchor, constant: -16)
        ])

        // ── Separator: oder ──
        let sep1 = makeLine(); let sep2 = makeLine()
        let orLbl = menuLabel("oder", size: 12, color: NSColor(white:0.6, alpha:1))
        let sepRow = hstack([sep1, orLbl, sep2], spacing: 10)
        sepRow.alignment = .centerY
        [sep1.heightAnchor.constraint(equalToConstant: 1),
         sep2.heightAnchor.constraint(equalToConstant: 1)].forEach { $0.isActive = true }

        // ── Card: Spieler vs Spieler ──
        let cardPvp = menuActionCard(
            icon: "person.2.fill", title: "Spieler vs Spieler",
            sub: "Zu zweit am gleichen Computer", action: #selector(startVsPlayer))

        // ── Separator: oder ──
        let sep3 = makeLine(); let sep4 = makeLine()
        let orLbl2 = menuLabel("oder", size: 12, color: NSColor(white:0.6, alpha:1))
        let sepRow2 = hstack([sep3, orLbl2, sep4], spacing: 10)
        sepRow2.alignment = .centerY
        [sep3.heightAnchor.constraint(equalToConstant: 1),
         sep4.heightAnchor.constraint(equalToConstant: 1)].forEach { $0.isActive = true }

        // ── Card: Schach-Akademie (NEU) ──
        let cardAcad = menuActionCard(
            icon: "graduationcap.fill", title: "Schach-Akademie 🎓",
            sub: "10 Stufen · Interaktive Aufgaben · Fortschritt pro Spieler", action: #selector(startAcademy))
        cardAcad.isAccented = true

        // ── Card: Lernmodus (freies Training) ──
        let cardTut = menuActionCard(
            icon: "book.fill", title: "Training mit Coach ♟",
            sub: "20 Bücher · 100+ Partien · 300+ Züge · KI-Analyse", action: #selector(startTutorial))

        // ── Piece legend ──
        let pieces = [("\u{2654}","König"),("\u{2655}","Dame"),("\u{2656}","Turm"),
                      ("\u{2657}","Läufer"),("\u{2658}","Springer"),("\u{2659}","Bauer")]
        let legendText = pieces.map { "\($0.0) \($0.1)" }.joined(separator: "   ")
        let legendLbl = menuLabel("Figuren:  " + legendText, size: 13, color: NSColor(white:0.45, alpha:1))
        legendLbl.alignment = .center

        // ── Assembly ──
        let outer = NSStackView(views: [titleView, subLabel, miniBoard,
                                        cardComp, sepRow, cardPvp, sepRow2, cardAcad, cardTut, legendLbl])
        outer.orientation = .vertical
        outer.alignment = .centerX
        outer.spacing = 12
        outer.translatesAutoresizingMaskIntoConstraints = false
        outer.edgeInsets = NSEdgeInsets(top: 36, left: 24, bottom: 18, right: 24)
        container.addSubview(outer)
        updateDiffLabel(slider)            // v3: erst jetzt ist das Label im Fenster auffindbar

        NSLayoutConstraint.activate([
            outer.topAnchor.constraint(equalTo: container.topAnchor),
            outer.bottomAnchor.constraint(equalTo: container.bottomAnchor),
            outer.leadingAnchor.constraint(equalTo: container.leadingAnchor),
            outer.trailingAnchor.constraint(equalTo: container.trailingAnchor),
            container.widthAnchor.constraint(equalTo: scroll.widthAnchor),
            miniBoard.widthAnchor.constraint(equalToConstant: 180),
            miniBoard.heightAnchor.constraint(equalToConstant: 180),
            cardComp.widthAnchor.constraint(equalTo: outer.widthAnchor, constant: -48),
            cardPvp.widthAnchor.constraint(equalTo: outer.widthAnchor, constant: -48),
            cardAcad.widthAnchor.constraint(equalTo: outer.widthAnchor, constant: -48),
            cardTut.widthAnchor.constraint(equalTo: outer.widthAnchor, constant: -48),
            sepRow.widthAnchor.constraint(equalTo: outer.widthAnchor, constant: -48),
            sepRow2.widthAnchor.constraint(equalTo: outer.widthAnchor, constant: -48)
        ])

        window.makeKeyAndOrderFront(nil)
    }

    @objc func diffChanged(_ sender: NSSlider) {
        aiEngine.difficulty = Int(sender.intValue)
        UserDefaults.standard.set(aiEngine.difficulty, forKey: "kiStufe")   // v3: Lernmodus ueberschreibt sie nicht mehr
        updateDiffLabel(sender)
    }

    private func updateDiffLabel(_ slider: NSSlider) {
        let val = Int(slider.doubleValue)
        let names = ["","Sehr leicht","Leicht","Leicht","Mittel","Mittel","Stark","Stark","Sehr stark","Sehr stark","Experte"]
        if let lbl = window.contentView?.viewWithTag(201) as? NSTextField {
            lbl.stringValue = val < names.count ? names[val] : "Experte"
        }
    }

    // ── Menu UI helpers ──

    private func menuLabel(_ text: String, size: CGFloat, weight: NSFont.Weight = .regular, color: NSColor) -> NSTextField {
        let l = NSTextField(labelWithString: text)
        l.font = NSFont.systemFont(ofSize: size, weight: weight)
        l.textColor = color; l.translatesAutoresizingMaskIntoConstraints = false; return l
    }
    private func menuCardTitle(_ s: String) -> NSTextField { menuLabel(s, size: 15, weight: .semibold, color: NSColor(white:0.1, alpha:1)) }
    private func menuCardSub(_ s: String) -> NSTextField   { menuLabel(s, size: 12, color: NSColor(white:0.5, alpha:1)) }
    private func vstack(_ views: [NSView]) -> NSStackView {
        let s = NSStackView(views: views); s.orientation = .vertical; s.alignment = .leading; s.spacing = 2
        s.translatesAutoresizingMaskIntoConstraints = false; return s
    }
    private func hstack(_ views: [NSView], spacing: CGFloat = 12) -> NSStackView {
        let s = NSStackView(views: views); s.orientation = .horizontal; s.spacing = spacing
        s.translatesAutoresizingMaskIntoConstraints = false; return s
    }
    private func sfIcon(_ name: String, tint: NSColor) -> NSImageView {
        let iv = NSImageView(image: NSImage(systemSymbolName: name, accessibilityDescription: nil)!)
        iv.contentTintColor = tint; iv.translatesAutoresizingMaskIntoConstraints = false; return iv
    }
    private func makeLine() -> NSView {
        let v = NSView(); v.wantsLayer = true
        v.layer?.backgroundColor = NSColor(white: 0.78, alpha: 1).cgColor
        v.translatesAutoresizingMaskIntoConstraints = false; return v
    }
    private func makeAccentButton(_ title: String, action: Selector) -> NSButton {
        let b = NSButton(title: title, target: self, action: action)
        b.bezelStyle = .rounded; b.isBordered = false; b.wantsLayer = true
        b.layer?.backgroundColor = NSColor.chessGreen.cgColor
        b.layer?.cornerRadius = 12
        b.font = NSFont.systemFont(ofSize: 16, weight: .semibold)
        b.contentTintColor = .white; b.translatesAutoresizingMaskIntoConstraints = false; return b
    }
    private func menuActionCard(icon: String, title: String, sub: String, action: Selector) -> MenuCardView {
        let card = MenuCardView(); card.translatesAutoresizingMaskIntoConstraints = false
        let ic = sfIcon(icon, tint: NSColor(white: 0.25, alpha: 1))
        let tl = menuCardTitle(title); let sl = menuCardSub(sub)
        let tx = vstack([tl, sl])
        let chevron = sfIcon("chevron.right", tint: NSColor(white: 0.65, alpha: 1))
        let row = hstack([ic, tx, NSView(), chevron], spacing: 14)
        row.alignment = .centerY
        let btn = NSButton(frame: .zero); btn.isBordered = false; btn.target = self; btn.action = action
        btn.translatesAutoresizingMaskIntoConstraints = false
        card.addSubview(row); card.addSubview(btn)
        NSLayoutConstraint.activate([
            ic.widthAnchor.constraint(equalToConstant: 26), ic.heightAnchor.constraint(equalToConstant: 26),
            chevron.widthAnchor.constraint(equalToConstant: 12),
            row.topAnchor.constraint(equalTo: card.topAnchor, constant: 16),
            row.bottomAnchor.constraint(equalTo: card.bottomAnchor, constant: -16),
            row.leadingAnchor.constraint(equalTo: card.leadingAnchor, constant: 18),
            row.trailingAnchor.constraint(equalTo: card.trailingAnchor, constant: -18),
            btn.topAnchor.constraint(equalTo: card.topAnchor),
            btn.bottomAnchor.constraint(equalTo: card.bottomAnchor),
            btn.leadingAnchor.constraint(equalTo: card.leadingAnchor),
            btn.trailingAnchor.constraint(equalTo: card.trailingAnchor)
        ])
        return card
    }

    @objc func startVsComputer() {
        gameMode = .playerVsComputer
        askPlayerNames(twoPlayers: false)
        startGame()
    }

    @objc func startVsPlayer() {
        gameMode = .playerVsPlayer
        askPlayerNames(twoPlayers: true)
        startGame()
    }

    @objc func startTutorial() {
        gameMode = .tutorial
        aiEngine.difficulty = 3
        startGame()
    }

    @objc func startAcademy() {
        showAcademyHome()
    }

    // MARK: - Namensabfrage (mit Figuren-Taufe: Koenig oder Dame?)

    /// Fragt Spielernamen ab. Jeder Spieler waehlt, ob sein Name am Koenig oder an der Dame steht.
    func askPlayerNames(twoPlayers: Bool) {
        let d = UserDefaults.standard
        let alert = NSAlert()
        alert.messageText = twoPlayers ? "Wer spielt gegeneinander?" : "Wie heisst du?"
        alert.informativeText = "Dein Name wird an deiner Wunschfigur angezeigt: Koenig oder Dame?"
        alert.addButton(withTitle: "Los geht's!")
        alert.addButton(withTitle: "Ohne Namen spielen")

        let rowH: CGFloat = 30, spacing: CGFloat = 10
        let height: CGFloat = twoPlayers ? rowH * 2 + spacing : rowH
        let acc = NSView(frame: NSRect(x: 0, y: 0, width: 340, height: height))

        func makeRow(y: CGFloat, label: String, prefill: String) -> (NSTextField, NSPopUpButton) {
            let lbl = NSTextField(labelWithString: label)
            lbl.frame = NSRect(x: 0, y: y + 4, width: 70, height: 20)
            lbl.font = NSFont.systemFont(ofSize: 12, weight: .semibold)
            acc.addSubview(lbl)
            let field = NSTextField(frame: NSRect(x: 74, y: y + 2, width: 150, height: 24))
            field.placeholderString = "Name eingeben"
            field.stringValue = prefill
            acc.addSubview(field)
            let popup = NSPopUpButton(frame: NSRect(x: 232, y: y, width: 104, height: 26))
            popup.addItems(withTitles: ["\u{2654} Koenig", "\u{2655} Dame"])
            acc.addSubview(popup)
            return (field, popup)
        }

        var whiteRow: (NSTextField, NSPopUpButton)
        var blackRow: (NSTextField, NSPopUpButton)? = nil
        if twoPlayers {
            whiteRow = makeRow(y: rowH + spacing, label: "Weiss:", prefill: d.string(forKey: "nameWeiss") ?? "")
            blackRow = makeRow(y: 0, label: "Schwarz:", prefill: d.string(forKey: "nameSchwarz") ?? "")
        } else {
            whiteRow = makeRow(y: 0, label: "Du:", prefill: d.string(forKey: "nameWeiss") ?? "")
        }
        alert.accessoryView = acc
        window.makeKeyAndOrderFront(nil)
        let resp = alert.runModal()

        if resp == .alertFirstButtonReturn {
            whiteName = whiteRow.0.stringValue.trimmingCharacters(in: .whitespacesAndNewlines)
            whiteTagType = whiteRow.1.indexOfSelectedItem == 1 ? .queen : .king
            if let bRow = blackRow {
                blackName = bRow.0.stringValue.trimmingCharacters(in: .whitespacesAndNewlines)
                blackTagType = bRow.1.indexOfSelectedItem == 1 ? .queen : .king
            } else {
                blackName = "Computer"
                blackTagType = .king
            }
            d.set(whiteName, forKey: "nameWeiss")
            if twoPlayers { d.set(blackName, forKey: "nameSchwarz") }
        } else {
            whiteName = ""; blackName = twoPlayers ? "" : "Computer"
            whiteTagType = .king; blackTagType = .king
        }
    }

    // MARK: - Game Screen

    func startGame() {
        aiCancelled = true; computerThinking = false; gameSessionID += 1
        animView?.cancel()
        board3D?.finishNow()
        applyPieceStyleFlags()
        if gameMode == .academy, let lesson = currentLesson {
            board = ChessBoard(fen: lesson.fen)
            aiEngine.difficulty = lesson.freePlayAI
            lessonSolved = false; lessonOwnMoves = 0
            lessonRatingSum = 0; lessonRatingCount = 0
        } else {
            board = ChessBoard()
        }
        currentPlayer = .white; selectedPos = nil
        validMoves = []; lastMove = nil; computerThinking = false
        gameOver = false; aiCancelled = false; hintMove = nil
        tutorialEngine.reset(); positionHistory = [:]; recordPosition()
        gameMoveHistory = []
        analysisQueue.async { [moveAnalyzer] in moveAnalyzer.reset() }
        undoStack = []; pendingAnalyses = 0; pendingFreePlayResult = nil; lastOwnFeedback = nil
        hintStage = 0; pendingAdvice = nil; dangerSquares = []; focusSquare = nil; hintArrow = nil; coachBusy = false
        viewFromBlack = false
        switch gameMode {
        case .tutorial:
            analysisEnabled = true
        case .academy:
            analysisEnabled = (currentLesson?.freePlayMoves ?? 0) > 0
        default:
            analysisEnabled = UserDefaults.standard.bool(forKey: "analyseAktiv")
        }

        guard let cv = window.contentView else { return }
        cv.subviews.forEach { $0.removeFromSuperview() }

        let isTutorial = (gameMode == .tutorial)
        let isAcademy = (gameMode == .academy)

        // v3: groesseres Fenster (3D-Brett + Coach-Panel), passend zum Bildschirm
        let comingFromMenu = window.frame.width < 700
        var startW: CGFloat = isTutorial ? 1000 : 840
        var startH: CGFloat = isTutorial ? 900 : 860
        if let vf = (window.screen ?? NSScreen.main)?.visibleFrame {
            startW = min(startW, vf.width - 30)
            startH = min(startH, vf.height - 40)
        }
        window.contentMinSize = NSSize(width: 760, height: 640)
        if comingFromMenu || window.frame.width < startW - 1 || window.frame.height < startH - 1 {
            window.setContentSize(NSSize(width: startW, height: startH))
            if comingFromMenu { window.center() }
        }
        window.backgroundColor = NSColor(red: 0.12, green: 0.10, blue: 0.08, alpha: 1)
        window.title = "Schach"
        let cw: CGFloat = cv.bounds.width, ch: CGFloat = cv.bounds.height

        // ── Dark background ──
        let bg = NSView(frame: cv.bounds)
        bg.wantsLayer = true
        bg.layer?.backgroundColor = NSColor(red: 0.12, green: 0.10, blue: 0.08, alpha: 1).cgColor
        bg.autoresizingMask = [.width, .height]
        cv.addSubview(bg)

        // ── Top bar (2 Zeilen: oben Status & Material, unten ALLE Schalter beschriftet) ──
        let barH: CGFloat = 92
        let bar = NSView(frame: NSRect(x: 0, y: ch - barH, width: cw, height: barH))
        bar.wantsLayer = true
        bar.layer?.backgroundColor = NSColor(red: 0.18, green: 0.14, blue: 0.10, alpha: 1).cgColor
        cv.addSubview(bar)
        topBar = bar

        // Zeile 1: Zurueck-Knopf | Status | Material (rechts)
        let backBtn = NSButton(frame: NSRect(x: 10, y: 52, width: 84, height: 32))
        backBtn.title = isAcademy ? "← Stufe" : "← Menü"
        backBtn.bezelStyle = .rounded
        backBtn.font = NSFont.systemFont(ofSize: 13); backBtn.wantsLayer = true
        backBtn.target = self
        backBtn.action = isAcademy ? #selector(backToLessonList) : #selector(backToMenu)
        bar.addSubview(backBtn)

        statusLabel = FitLabel(frame: NSRect(x: 104, y: 46, width: cw - 104 - 174, height: 40))
        statusLabel.isBezeled = false; statusLabel.isEditable = false; statusLabel.drawsBackground = false
        statusLabel.alignment = .center
        statusLabel.font = NSFont.systemFont(ofSize: 14, weight: .semibold)
        statusLabel.textColor = .white
        statusLabel.lineBreakMode = .byTruncatingTail
        bar.addSubview(statusLabel)

        whiteLabel = NSTextField(frame: NSRect(x: cw - 168, y: 70, width: 160, height: 16))
        whiteLabel.isBezeled = false; whiteLabel.isEditable = false; whiteLabel.drawsBackground = false
        whiteLabel.font = NSFont.monospacedDigitSystemFont(ofSize: 11, weight: .medium)
        whiteLabel.textColor = NSColor(white: 0.85, alpha: 1)
        bar.addSubview(whiteLabel)

        blackLabel = NSTextField(frame: NSRect(x: cw - 168, y: 52, width: 160, height: 16))
        blackLabel.isBezeled = false; blackLabel.isEditable = false; blackLabel.drawsBackground = false
        blackLabel.font = NSFont.monospacedDigitSystemFont(ofSize: 11, weight: .medium)
        blackLabel.textColor = NSColor(white: 0.75, alpha: 1)
        bar.addSubview(blackLabel)

        // Zeile 2: Alle Schalter - klar beschriftet und immer sichtbar
        func barToggle(x: CGFloat, w: CGFloat, title: String, active: Bool, activeColor: NSColor, action: Selector) -> NSButton {
            let b = NSButton(frame: NSRect(x: x, y: 8, width: w, height: 34))
            b.title = title; b.bezelStyle = .rounded
            b.wantsLayer = true; b.isBordered = false
            b.layer?.backgroundColor = active ? activeColor.cgColor : NSColor(white: 0.32, alpha: 1).cgColor
            b.layer?.cornerRadius = 9
            b.font = NSFont.systemFont(ofSize: 11, weight: .semibold)
            b.contentTintColor = .white
            b.target = self; b.action = action
            bar.addSubview(b)
            return b
        }
        var bx: CGFloat = 10
        func slot(_ w: CGFloat) -> CGFloat { let r = bx; bx += w + 6; return r }

        // 💬 Zugbewertung 1-15 (Kommentare/Lern-Analyse)
        analysisToggle = barToggle(x: slot(100), w: 100, title: analysisEnabled ? "💬 Zugwert ●" : "💬 Zugwert ○",
                                   active: analysisEnabled, activeColor: .chessGreen, action: #selector(toggleAnalysis))
        // 🎨 Brettfarben (6 Themen)
        themeButton = barToggle(x: slot(80), w: 80, title: "🎨 Farben", active: false,
                                activeColor: .chessGreen, action: #selector(cycleTheme))
        // 🐾 Paw-Patrol-Figuren (2D-Brett)
        pawStyleButton = barToggle(x: slot(84), w: 84, title: "", active: false,
                                   activeColor: NSColor(red: 0.85, green: 0.35, blue: 0.1, alpha: 1),
                                   action: #selector(togglePieceStyle))
        updateStyleButton()
        // 🧊 Echtes 3D-Brett (v3)
        board3DToggle = barToggle(x: slot(98), w: 98, title: use3DBoard ? "🧊 3D-Brett ●" : "🧊 3D-Brett ○",
                                  active: use3DBoard, activeColor: SchachWindowController.color3D, action: #selector(toggleBoard3D))
        // 💥 Kampfszenen / Animation
        animToggle = barToggle(x: slot(88), w: 88, title: animationsEnabled ? "💥 Kampf ●" : "💥 Kampf ○",
                               active: animationsEnabled, activeColor: .chessGold, action: #selector(toggleAnimation))
        // 🔄 Brett wenden (v3)
        flipButton = barToggle(x: slot(84), w: 84, title: "🔄 Wenden", active: false,
                               activeColor: .chessGreen, action: #selector(flipBoard))

        // Rechte Gruppe (wird in relayoutGame() rechtsbuendig angeordnet)
        undoButton = nil
        if isTutorial {
            undoButton = barToggle(x: 0, w: 84, title: "↶ Zurück", active: false,
                                   activeColor: .chessGreen, action: #selector(undoMove))
            hintButton = barToggle(x: 0, w: 92, title: "💡 Tipp", active: true,
                                   activeColor: .chessBrown, action: #selector(showHint))
            neuOrTippButton = hintButton
            rightBarButtons = [undoButton!, hintButton]
        } else if isAcademy {
            hintButton = barToggle(x: 0, w: 84, title: "💡 Tipp", active: true,
                                   activeColor: .chessBrown, action: #selector(showLessonHint))
            neuOrTippButton = hintButton
            rightBarButtons = [hintButton]
        } else {
            hintButton = barToggle(x: 0, w: 92, title: "💡 Tipp", active: true,
                                   activeColor: .chessBrown, action: #selector(showHint))
            let neuBtn = barToggle(x: 0, w: 70, title: "↻ Neu", active: false,
                                   activeColor: .chessGreen, action: #selector(resetGame))
            neuOrTippButton = neuBtn
            rightBarButtons = [hintButton, neuBtn]
        }

        // ── Lernmodus-/Akademie-Panel (Coach) ──
        explanationPanel = nil
        lessonAgainButton = nil
        lessonNextButton = nil
        if isTutorial || isAcademy {
            let expH: CGFloat = isAcademy ? 108 : 150
            let expPanel = NSView(frame: NSRect(x: 0, y: 0, width: cw, height: expH))
            expPanel.wantsLayer = true
            expPanel.layer?.backgroundColor = NSColor(red: 0.08, green: 0.22, blue: 0.38, alpha: 1).cgColor
            cv.addSubview(expPanel)
            explanationPanel = expPanel

            let icon = NSTextField(frame: NSRect(x: 14, y: expH - 26, width: 22, height: 22))
            icon.stringValue = isAcademy ? "🎓" : "🧑‍🏫"
            icon.font = NSFont.systemFont(ofSize: 18)
            icon.textColor = NSColor(red: 0.5, green: 0.85, blue: 1.0, alpha: 1)
            icon.isBezeled = false; icon.isEditable = false; icon.drawsBackground = false
            expPanel.addSubview(icon)
            explanationIcon = icon

            explanationLabel = NSTextField(frame: NSRect(x: 40, y: 8, width: cw - 60, height: expH - 14))
            explanationLabel.stringValue = ""
            explanationLabel.font = NSFont.systemFont(ofSize: 12.5)
            explanationLabel.textColor = .white
            explanationLabel.isBezeled = false; explanationLabel.isEditable = false; explanationLabel.drawsBackground = false
            explanationLabel.isSelectable = true
            explanationLabel.maximumNumberOfLines = 0
            explanationLabel.lineBreakMode = .byWordWrapping
            explanationLabel.cell?.wraps = true; explanationLabel.cell?.isScrollable = false
            expPanel.addSubview(explanationLabel)

            if isAcademy {
                // "Nochmal"-Button: Aufgabe zuruecksetzen
                let againBtn = NSButton(frame: NSRect(x: cw - 66, y: expH - 40, width: 56, height: 30))
                againBtn.title = "Nochmal"; againBtn.bezelStyle = .rounded
                againBtn.font = NSFont.systemFont(ofSize: 10, weight: .semibold)
                againBtn.wantsLayer = true; againBtn.isBordered = false
                againBtn.layer?.backgroundColor = NSColor(white: 0.35, alpha: 1).cgColor
                againBtn.layer?.cornerRadius = 7
                againBtn.contentTintColor = .white
                againBtn.target = self; againBtn.action = #selector(retryLesson)
                expPanel.addSubview(againBtn)
                lessonAgainButton = againBtn

                // "Weiter"-Button: naechste Aufgabe (erst nach Loesung aktiv)
                let nextBtn = NSButton(frame: NSRect(x: cw - 66, y: expH - 76, width: 56, height: 30))
                nextBtn.title = "Weiter →"; nextBtn.bezelStyle = .rounded
                nextBtn.font = NSFont.systemFont(ofSize: 10, weight: .semibold)
                nextBtn.wantsLayer = true; nextBtn.isBordered = false
                nextBtn.layer?.backgroundColor = NSColor.chessGreen.cgColor
                nextBtn.layer?.cornerRadius = 7
                nextBtn.contentTintColor = .white
                nextBtn.target = self; nextBtn.action = #selector(nextLesson)
                nextBtn.isHidden = true
                expPanel.addSubview(nextBtn)
                lessonNextButton = nextBtn
            }
        } else {
            explanationLabel = nil
            explanationIcon = nil
        }

        // Namens-Schildchen: Jeder Spieler hat seine Figur getauft (Koenig oder Dame)
        var tags: [Int: (type: ChessPieceType, name: String)] = [:]
        if gameMode == .playerVsPlayer || gameMode == .playerVsComputer {
            if !whiteName.isEmpty { tags[PlayerColor.white.rawValue] = (whiteTagType, whiteName) }
            if !blackName.isEmpty && blackName != "Computer" { tags[PlayerColor.black.rawValue] = (blackTagType, blackName) }
        }

        // ── 2D-Brett (klassisch, auch fuer Paw-Patrol-Figuren) ──
        boardView = ChessBoardView(frame: .zero)
        boardView.onCellClick = { [weak self] r, c in self?.handleClick(r, c) }
        boardView.hiddenSquares = []
        boardView.nameTags = tags
        boardView.viewFromBlack = false
        cv.addSubview(boardView)

        // ── v3: Echtes 3D-Brett (SceneKit) – wird wiederverwendet ──
        let b3 = board3D ?? Board3DView(boardFrame: NSRect(x: 0, y: 0, width: 600, height: 600))
        b3.onCellClick = { [weak self] r, c in self?.handleClick(r, c) }
        b3.nameTags = tags
        b3.applyTheme()
        b3.setViewFromBlack(false, animated: false)
        cv.addSubview(b3)
        board3D = b3
        boardView.isHidden = use3DBoard
        b3.isHidden = !use3DBoard
        b3.isPlaying = use3DBoard

        // ── 2D-Animations-Overlay ──
        let av = PieceAnimationView(frame: .zero)
        cv.addSubview(av)
        animView = av

        // ── Analyse Panel ──
        let analysisPanelH: CGFloat = 140
        let ap = NSView(frame: NSRect(x: 0, y: 0, width: cw, height: analysisPanelH))
        ap.wantsLayer = true
        ap.layer?.backgroundColor = NSColor(red: 0.10, green: 0.10, blue: 0.14, alpha: 1).cgColor
        ap.isHidden = !analysisEnabled
        cv.addSubview(ap)
        analysisPanel = ap

        let evBar = EvalBarView(frame: NSRect(x: 6, y: 6, width: 22, height: analysisPanelH - 12))
        evBar.evaluation = 0.0
        ap.addSubview(evBar)
        evalBarView = evBar

        let aTitleLbl = NSTextField(frame: NSRect(x: 36, y: analysisPanelH - 24, width: cw - 44, height: 18))
        aTitleLbl.stringValue = "Analyse"; aTitleLbl.isBezeled = false; aTitleLbl.isEditable = false; aTitleLbl.drawsBackground = false
        aTitleLbl.font = NSFont.systemFont(ofSize: 12, weight: .bold)
        aTitleLbl.textColor = NSColor.chessGold
        aTitleLbl.lineBreakMode = .byTruncatingTail
        ap.addSubview(aTitleLbl)
        analysisTitleLabel = aTitleLbl

        let aLbl = NSTextField(frame: NSRect(x: 36, y: 4, width: cw - 44, height: analysisPanelH - 28))
        aLbl.stringValue = analysisEnabled ? "Analyse aktiv - mache einen Zug..." : ""
        aLbl.font = NSFont.systemFont(ofSize: 12)
        aLbl.textColor = NSColor(white: 0.85, alpha: 1)
        aLbl.isBezeled = false; aLbl.isEditable = false; aLbl.drawsBackground = false
        aLbl.isSelectable = true
        aLbl.maximumNumberOfLines = 0; aLbl.lineBreakMode = .byWordWrapping
        aLbl.cell?.wraps = true; aLbl.cell?.isScrollable = false
        ap.addSubview(aLbl)
        analysisLabel = aLbl

        // ── v3: Coach-Sprechblase (Tipps im normalen Spiel) ──
        let bubble = NSView(frame: .zero)
        bubble.wantsLayer = true
        bubble.layer?.backgroundColor = NSColor(red: 0.08, green: 0.22, blue: 0.38, alpha: 0.95).cgColor
        bubble.layer?.cornerRadius = 12
        bubble.layer?.borderWidth = 1.5
        bubble.layer?.borderColor = NSColor(red: 0.5, green: 0.85, blue: 1.0, alpha: 0.6).cgColor
        bubble.isHidden = true
        let bl = NSTextField(frame: .zero)
        bl.isBezeled = false; bl.isEditable = false; bl.drawsBackground = false; bl.isSelectable = true
        bl.font = NSFont.systemFont(ofSize: 12.5)
        bl.textColor = .white
        bl.maximumNumberOfLines = 0; bl.lineBreakMode = .byWordWrapping
        bl.cell?.wraps = true; bl.cell?.isScrollable = false
        bubble.addSubview(bl)
        let close = NSButton(title: "✕", target: self, action: #selector(hideCoachBubble))
        close.isBordered = false
        close.contentTintColor = .white
        close.font = NSFont.systemFont(ofSize: 13, weight: .bold)
        bubble.addSubview(close)
        cv.addSubview(bubble)
        coachBubble = bubble
        coachBubbleLabel = bl
        coachBubbleClose = close

        relayoutGame()

        updateUI()
        if isTutorial {
            showExplanation(tutorialEngine.getOpeningTip())
            let stats = ChessKnowledgeBase.stats
            showAnalysis("Lernmodus mit Coach und Wissensdatenbank: \(stats.books) Schachbuecher, \(stats.games) beruehmte Partien, \(stats.concepts) strategische Konzepte. Jeder Zug bekommt einen Zugwert 1-15 mit Begruendung. Mache deinen ersten Zug!")
        }
    }

    private func gameBarLabel(_ text: String, x: CGFloat, barWidth: CGFloat) -> NSTextField {
        let l = NSTextField(frame: NSRect(x: x, y: 16, width: 100, height: 24))
        l.stringValue = text; l.isBezeled = false; l.isEditable = false; l.drawsBackground = false
        l.font = NSFont.monospacedDigitSystemFont(ofSize: 13, weight: .medium)
        l.textColor = NSColor(white: 0.8, alpha: 1); return l
    }

    // FIX #6: Stellungen werden mit der Farbe erfasst, die am Zug IST (nicht mit dem Zieher)
    func recordPosition(sideToMove: PlayerColor? = nil) {
        let stm = sideToMove ?? currentPlayer
        let hash = board.boardHash() + (stm == .white ? "w" : "b")
        positionHistory[hash, default: 0] += 1
    }

    func checkDraw(sideToMove: PlayerColor? = nil) -> Bool {
        if board.halfMoveClock >= 100 { return true }
        let stm = sideToMove ?? currentPlayer
        let hash = board.boardHash() + (stm == .white ? "w" : "b")
        if let count = positionHistory[hash], count >= 3 { return true }
        return false
    }

    func showExplanation(_ text: String) {
        explanationLabel?.stringValue = text
    }

    @objc func toggleAnalysis() {
        guard boardView != nil, boardView.superview != nil else { return }
        analysisEnabled = !analysisEnabled
        if gameMode == .playerVsComputer || gameMode == .playerVsPlayer {
            UserDefaults.standard.set(analysisEnabled, forKey: "analyseAktiv")
        }
        analysisPanel?.isHidden = !analysisEnabled
        analysisToggle?.title = analysisEnabled ? "💬 Zugwert ●" : "💬 Zugwert ○"
        analysisToggle?.layer?.backgroundColor = analysisEnabled
            ? NSColor.chessGreen.cgColor : NSColor(white: 0.3, alpha: 1).cgColor

        if analysisEnabled {
            showAnalysis("Kommentare aktiviert! Jeder Zug erhaelt:\n- Zugwert 1-15 mit Erklaerung (15 = perfekt), berechnet mit echter Vorausschau\n- Bei Fehlern: den besseren Zug UND warum deiner schlecht war\n- Eroeffnungserkennung (ECO) & Taktik-Erkennung (Gabel, Fesselung, Spiess, Abzugsschach)\n- Buchwissen aus 20 Schachbuechern")
        }
        relayoutGame()
    }

    var pawStyleButton: NSButton?
    var topBar: NSView?
    var themeButton: NSButton?
    var neuOrTippButton: NSButton?

    /// Figuren-Stil-Knopf: im 2D-Brett Paw-Patrol-Figuren 🐾, im 3D-Brett das eigene Hunde-Team 🐶
    @objc func togglePieceStyle() {
        if use3DBoard {
            toggleDogs3D()
            return
        }
        PieceStyle.current = (PieceStyle.current == .klassisch) ? .pawPatrol : .klassisch
        let paw = PieceStyle.current == .pawPatrol
        updateStyleButton()
        boardView?.needsDisplay = true
        statusLabel?.stringValue = paw
            ? "🐾 PAW PATROL! Chase=Koenig, Skye=Dame, Marshall=Turm, Rocky=Laeufer, Rubble=Springer"
            : "♛ Klassische Figuren"
    }

    /// v3.1: Eigenes 3D-Hunde-Team an/aus
    @objc func toggleDogs3D() {
        dogs3D = !dogs3D
        UserDefaults.standard.set(dogs3D, forKey: "hundeTeam3D")
        applyPieceStyleFlags()
        board3D?.styleChanged()
        updateStyleButton()
        updateUI()
        statusLabel?.stringValue = dogs3D
            ? "🐶 Hunde-Team: Bruno=König · Luna=Dame · Brocken=Turm · Wurzel=Läufer · Falko=Springer · Welpen=Bauern"
            : "♛ Klassische 3D-Figuren"
        if gameMode == .tutorial && dogs3D {
            showExplanation("🐶 Dein Hunde-Team:\n• Bruno, der Bernhardiner mit Krone = König\n• Luna, der Windhund mit Diadem = Dame\n• Brocken, die Bulldogge mit Burghut = Turm\n• Wurzel, der Dackel mit Bischofsmütze = Läufer\n• Falko, der Schäferhund mit Federbusch = Springer\n• die Welpen = Bauern\nDas goldene Schild am Halsband zeigt die Schachfigur. Klicke eine Figur an, um mehr zu erfahren!")
        }
    }

    /// Setzt die Stil-Schalter fuer 3D-Figuren und Anzeigenamen
    func applyPieceStyleFlags() {
        Piece3DFactory.active3D = use3DBoard
        Piece3DFactory.dogMode = use3DBoard && dogs3D
    }

    /// Beschriftung des Figuren-Stil-Knopfs passend zum Brett (2D: Paw, 3D: Hunde)
    func updateStyleButton() {
        let on: Bool
        if use3DBoard {
            on = dogs3D
            pawStyleButton?.title = on ? "🐶 Hunde ●" : "🐶 Hunde ○"
        } else {
            on = PieceStyle.current == .pawPatrol
            pawStyleButton?.title = on ? "🐾 Paw ●" : "🐾 Paw ○"
        }
        pawStyleButton?.layer?.backgroundColor = on
            ? (use3DBoard ? NSColor(red: 0.62, green: 0.40, blue: 0.20, alpha: 1).cgColor
                          : NSColor(red: 0.85, green: 0.35, blue: 0.1, alpha: 1).cgColor)
            : NSColor(white: 0.32, alpha: 1).cgColor
    }

    /// Schaltet zum naechsten Brett-Farbthema (6 Themen, wird gespeichert)
    @objc func cycleTheme() {
        BoardTheme.currentIndex = BoardTheme.currentIndex + 1
        boardView?.needsDisplay = true
        board3D?.applyTheme()
        statusLabel?.stringValue = "🎨 Farbthema: \(BoardTheme.current.name)"
    }

    /// 💥 Kampfszenen (3D) bzw. Flug-/Kampf-Animation (2D) an/aus
    @objc func toggleAnimation() {
        animationsEnabled = !animationsEnabled
        UserDefaults.standard.set(animationsEnabled, forKey: "animAktiv")
        animToggle?.title = animationsEnabled ? "💥 Kampf ●" : "💥 Kampf ○"
        animToggle?.layer?.backgroundColor = animationsEnabled
            ? NSColor.chessGold.cgColor : NSColor(white: 0.3, alpha: 1).cgColor
        if !animationsEnabled {
            animView?.cancel()
        }
        statusLabel?.stringValue = animationsEnabled
            ? "💥 Kampfszenen an: Springer springt, Turm rammt, Laeufer schlaegt, Dame zaubert!"
            : "Kampfszenen aus – Figuren ziehen ohne Kampf"
    }

    // MARK: - v3: 3D-Brett, Wenden, Kamera

    static let color3D = NSColor(red: 0.22, green: 0.42, blue: 0.75, alpha: 1)

    var is3DActive: Bool { use3DBoard && board3D != nil }

    /// Laeuft gerade eine Zug- oder Kampfanimation?
    var isBoardBusy: Bool { (animView?.isAnimating ?? false) || (board3D?.isAnimating ?? false) }

    @objc func toggleBoard3D() {
        use3DBoard = !use3DBoard
        UserDefaults.standard.set(use3DBoard, forKey: "brett3D")
        board3DToggle?.title = use3DBoard ? "🧊 3D-Brett ●" : "🧊 3D-Brett ○"
        board3DToggle?.layer?.backgroundColor = use3DBoard
            ? SchachWindowController.color3D.cgColor : NSColor(white: 0.32, alpha: 1).cgColor
        applyPieceStyleFlags()
        updateStyleButton()
        guard boardView != nil, boardView.superview != nil else { return }
        animView?.cancel()
        board3D?.finishNow()
        board3D?.styleChanged()
        boardView.isHidden = use3DBoard
        board3D?.isHidden = !use3DBoard
        board3D?.isPlaying = use3DBoard
        board3D?.setViewFromBlack(viewFromBlack, animated: false)
        updateUI()
        statusLabel?.stringValue = use3DBoard
            ? "🧊 Echtes 3D: Maus ziehen = drehen · Scrollen = zoomen · 🔄 = wenden · 🐶 = Hunde-Team"
            : "▦ Klassisches 2D-Brett"
    }

    /// 🔄 Brett wenden (Blick von Schwarz / Weiss)
    @objc func flipBoard() {
        guard boardView != nil, boardView.superview != nil else { return }
        setBoardView(fromBlack: !viewFromBlack, animated: true)
        statusLabel?.stringValue = viewFromBlack ? "🔄 Blick von Schwarz" : "🔄 Blick von Weiss"
    }

    func setBoardView(fromBlack: Bool, animated: Bool) {
        viewFromBlack = fromBlack
        boardView?.viewFromBlack = fromBlack
        board3D?.setViewFromBlack(fromBlack, animated: animated)
    }

    /// Im 2-Spieler-Modus automatisch zum Spieler am Zug drehen
    @objc func toggleAutoFlip() {
        autoFlip = !autoFlip
        UserDefaults.standard.set(autoFlip, forKey: "autoWenden")
        if autoFlip && gameMode == .playerVsPlayer && boardView?.superview != nil {
            setBoardView(fromBlack: currentPlayer == .black, animated: true)
        }
    }

    @objc func resetCamera() {
        board3D?.resetCamera()
    }

    @objc func hideCoachBubble() {
        coachBubble?.isHidden = true
    }

    /// Fuehrt `block` aus, sobald keine Animation mehr laeuft (und mindestens `minDelay` Sekunden vergangen sind)
    func runWhenBoardIdle(session: Int, minDelay: Double = 0, _ block: @escaping () -> Void) {
        let start = Date()
        func attempt() {
            guard gameSessionID == session else { return }
            if isBoardBusy || Date().timeIntervalSince(start) < minDelay {
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.05) { attempt() }
            } else {
                block()
            }
        }
        attempt()
    }

    // MARK: - v3: Zug zuruecknehmen

    @objc func undoMove() {
        guard boardView != nil, boardView.superview != nil, gameMode != .academy else { return }
        guard let snap = undoStack.popLast() else {
            statusLabel?.stringValue = "↶ Nichts zum Zuruecknehmen"
            return
        }
        aiCancelled = true; computerThinking = false; gameSessionID += 1   // laufende KI/Analyse verwerfen
        animView?.cancel()
        board3D?.finishNow()
        boardView.hiddenSquares = []
        board = ChessBoard(copyFrom: snap.board)
        currentPlayer = snap.currentPlayer
        lastMove = snap.lastMove
        positionHistory = snap.positionHistory
        gameMoveHistory = snap.gameMoveHistory
        gameOver = false; aiCancelled = false
        selectedPos = nil; validMoves = []; hintMove = nil
        pendingAnalyses = 0; pendingFreePlayResult = nil; lastOwnFeedback = nil
        resetCoachState()
        let hist = gameMoveHistory
        let b = ChessBoard(copyFrom: board)
        analysisQueue.async { [moveAnalyzer] in moveAnalyzer.rewind(to: hist, board: b) }
        if autoFlip && gameMode == .playerVsPlayer { setBoardView(fromBlack: currentPlayer == .black, animated: true) }
        updateUI()
        let msg = "↶ Zug zurückgenommen – probier es nochmal!"
        if gameMode == .tutorial {
            showExplanation(msg + " Tipp: Druecke 💡 fuer einen Denkanstoss.")
        } else {
            statusLabel?.stringValue = msg
        }
    }

    // MARK: - v3: Coach (Tipp in zwei Stufen)

    func resetCoachState() {
        hintStage = 0
        pendingAdvice = nil
        dangerSquares = []
        focusSquare = nil
        hintArrow = nil
        if gameMode != .academy { hintButton?.title = "💡 Tipp" }
        coachBubble?.isHidden = true
    }

    func showAnalysis(_ text: String) {
        analysisLabel?.stringValue = text
    }

    /// Text des Coaches anzeigen: im Lernmodus im Coach-Panel, sonst in der Sprechblase ueber dem Brett
    func presentCoachText(_ text: String, title: String) {
        if gameMode == .tutorial, let el = explanationLabel, el.superview != nil {
            showExplanation(text)
            return
        }
        coachBubbleLabel?.stringValue = title + "\n" + text
        coachBubble?.isHidden = false
        relayoutGame()
    }

    /// 💡 Tipp in jedem Modus. 1. Klick: Denkanstoss (Figur wird markiert, Loesung bleibt geheim).
    /// 2. Klick: Loesung mit Pfeil, Begruendung, erwarteter Antwort und Alternativen.
    /// Der Coach rechnet im Hintergrund mit voller Staerke – die Oberflaeche bleibt fluessig.
    @objc func showHint() {
        guard boardView != nil, boardView.superview != nil else { return }
        if gameMode == .academy { showLessonHint(); return }
        guard !gameOver && !computerThinking && !coachBusy else { return }
        if aiPlaysBlack && currentPlayer == .black { return }
        if isBoardBusy { return }
        let mover = currentPlayer

        if hintStage == 1, let adv = pendingAdvice {
            if let m = adv.move {
                hintMove = m
                hintArrow = m
                selectedPos = m.from
                validMoves = board.allLegalMoves(for: mover).filter { $0.from == m.from }
            }
            focusSquare = nil
            hintStage = 2
            hintButton?.title = "💡 Tipp"
            presentCoachText(adv.full, title: "💡 Empfehlung fuer \(displayName(for: mover))")
            updateUI()
            return
        }

        coachBusy = true
        hintButton?.title = "⏳ Coach …"
        let snapshot = ChessBoard(copyFrom: board)
        let session = gameSessionID
        let hist = gameMoveHistory
        let hash = board.boardHash()
        coachQueue.async { [weak self] in
            guard let self = self else { return }
            let adv = self.hintCoach.advise(board: snapshot, color: mover, history: hist)
            DispatchQueue.main.async {
                self.coachBusy = false
                guard self.gameSessionID == session, self.currentPlayer == mover,
                      self.board.boardHash() == hash, !self.gameOver else {
                    self.hintButton?.title = "💡 Tipp"
                    return
                }
                self.pendingAdvice = adv
                self.hintStage = 1
                self.focusSquare = adv.focus
                self.dangerSquares = adv.dangerSquares
                self.hintButton?.title = "💡 Lösung"
                self.presentCoachText(adv.nudge + "\n(Nochmal 💡 = Lösung mit Begründung)", title: "🤔 Denkanstoss")
                self.updateUI()
            }
        }
    }

    func updateUI() {
        guard boardView != nil else { return }
        let checkPos: Position?
        if board.isInCheck(currentPlayer) {
            checkPos = board.findKing(currentPlayer)
        } else {
            checkPos = nil
        }
        boardView.hintArrow = hintArrow
        boardView.dangerSquares = dangerSquares
        boardView.focusSquare = focusSquare
        boardView.refresh(board: board, selected: selectedPos, targets: validMoves.map { $0.to }, last: lastMove, check: checkPos)
        if use3DBoard, let b3 = board3D {
            b3.refresh(board: board, selected: selectedPos, targets: validMoves.map { $0.to }, last: lastMove,
                       check: checkPos, hint: hintArrow, danger: dangerSquares, focus: focusSquare)
        }

        let wMat = board.countMaterial(for: .white)
        let bMat = board.countMaterial(for: .black)
        let wDiff = max(0, (wMat - bMat) / 100)
        let bDiff = max(0, (bMat - wMat) / 100)
        let wName = whiteName.isEmpty ? "" : " \(String(whiteName.prefix(9)))"
        let bName = blackName.isEmpty ? "" : " \(String(blackName.prefix(9)))"
        whiteLabel?.stringValue = "\u{2654}\(wName) \(wMat / 100)" + (wDiff > 0 ? " +\(wDiff)" : "")
        blackLabel?.stringValue = "\u{265A}\(bName) \(bMat / 100)" + (bDiff > 0 ? " +\(bDiff)" : "")

        if gameOver { return }

        let humanTurn = displayName(for: currentPlayer)
        if board.isInCheck(currentPlayer) {
            if aiPlaysBlack {
                statusLabel?.stringValue = currentPlayer == .white
                    ? "Schach! \(whiteName.isEmpty ? "Du bist dran" : "\(humanTurn), du bist dran!")"
                    : "Schach! Computer denkt..."
            } else {
                statusLabel?.stringValue = "Schach! \(humanTurn) am Zug"
            }
        } else {
            if aiPlaysBlack {
                statusLabel?.stringValue = currentPlayer == .white
                    ? (whiteName.isEmpty ? "Du bist am Zug" : "\(humanTurn) ist am Zug")
                    : "Computer denkt nach..."
            } else {
                statusLabel?.stringValue = "\(humanTurn) ist am Zug"
            }
        }

        // Akademie: Bei Aufgaben steht der Titel in der Statusleiste
        if gameMode == .academy, let lesson = currentLesson, lesson.freePlayMoves == 0, !lessonSolved {
            statusLabel?.stringValue = lesson.title
        }
    }

    /// Menschlicher Zug: In der Akademie wird die Loesung geprueft, sonst normal gezogen
    func playerMove(_ move: ChessMove) {
        if gameMode == .academy, let lesson = currentLesson, lesson.freePlayMoves == 0 {
            attemptLessonMove(move)
        } else {
            doMove(move)
        }
    }

    func handleClick(_ row: Int, _ col: Int) {
        if gameOver || computerThinking { return }
        if isBoardBusy { return }                                          // Waehrend Animation kein Input
        if aiPlaysBlack && currentPlayer == .black { return }
        if gameMode == .academy && lessonSolved && (currentLesson?.freePlayMoves ?? 0) == 0 { return }

        let pos = Position(row: row, col: col)
        let allMoves = board.allLegalMoves(for: currentPlayer)

        // Tutorial: explain clicked piece
        if gameMode == .tutorial && selectedPos == nil {
            if let piece = board.piece(at: pos), piece.color == currentPlayer {
                showExplanation(tutorialEngine.getPieceExplanation(piece.type))
            }
        }

        if selectedPos != nil {
            // FIX #3: Simplified promotion handling
            let movesAtTarget = validMoves.filter { $0.to == pos }
            if !movesAtTarget.isEmpty {
                // Check if this is a promotion move
                if movesAtTarget.first?.promotion != nil {
                    let promoType = PromotionDialog.ask(color: currentPlayer, in: window)
                    if let promoMove = movesAtTarget.first(where: { $0.promotion == promoType }) {
                        playerMove(promoMove)
                    } else {
                        playerMove(movesAtTarget[0]) // fallback to queen
                    }
                } else {
                    playerMove(movesAtTarget[0])
                }
                return
            }
            // Click on own piece - reselect
            if let pc = board.piece(at: pos), pc.color == currentPlayer {
                let pMoves = allMoves.filter { $0.from == pos }
                if !pMoves.isEmpty {
                    selectedPos = pos
                    validMoves = pMoves
                    if gameMode == .tutorial {
                        showExplanation(tutorialEngine.getPieceExplanation(pc.type))
                    }
                    updateUI()
                    return
                }
            }
            selectedPos = nil
            validMoves = []
            updateUI()
        } else {
            if let pc = board.piece(at: pos), pc.color == currentPlayer {
                let pMoves = allMoves.filter { $0.from == pos }
                if !pMoves.isEmpty {
                    selectedPos = pos
                    validMoves = pMoves
                    updateUI()
                }
            }
        }
    }

    func doMove(_ move: ChessMove) {
        let boardBeforeMove = ChessBoard(copyFrom: board)
        let mover = currentPlayer
        let movingPiece = board.piece(at: move.from)
        let isHumanMove = !(aiPlaysBlack && mover == .black)

        // v3: Schnappschuss fuer "Zug zuruecknehmen" (vor jedem menschlichen Zug)
        if isHumanMove && gameMode != .academy {
            undoStack.append(GameSnapshot(board: boardBeforeMove, currentPlayer: mover, lastMove: lastMove,
                                          positionHistory: positionHistory, gameMoveHistory: gameMoveHistory))
            if undoStack.count > 300 { undoStack.removeFirst() }
        }

        board.executeMove(move)
        lastMove = move
        selectedPos = nil
        validMoves = []
        hintMove = nil
        resetCoachState()
        gameMoveHistory.append(moveToUci(move))   // fuer Eroeffnungsbuch der KI

        // ── Animation: 3D-Brett (mit Kampfszene) oder 2D-Flug ──
        if use3DBoard, let b3 = board3D {
            b3.animateMove(move, before: boardBeforeMove, after: board, fights: animationsEnabled) { }
        } else if animationsEnabled, let av = animView, let mp = movingPiece, boardView != nil {
            av.frame = boardView.frame
            let captured: (ChessPieceType, PlayerColor)? = move.capturedPiece.map { ($0, mover.opposite) }
            let fromPt = boardView.centerOfSquare(move.from)
            let toPt = boardView.centerOfSquare(move.to)
            av.animate(moving: (mp.type, mp.color), captured: captured,
                       from: fromPt, to: toPt, cell: boardView.cellSize) { [weak self] in
                guard let self = self else { return }
                self.boardView?.hiddenSquares = []
                self.boardView?.needsDisplay = true
            }
            boardView.hiddenSquares = [move.to]   // Zielfeld erst NACH Animationsstart verstecken
            boardView.needsDisplay = true
        }

        // ── v3: Zugwert-Analyse & Coach-Rueckmeldung laufen im Hintergrund (Animation bleibt fluessig) ──
        let wantAnalysis = analysisEnabled
        let wantCoach = gameMode == .tutorial
        let isLearning = (gameMode == .tutorial || gameMode == .academy)
        let countRating = gameMode == .academy && mover == .white && (currentLesson?.freePlayMoves ?? 0) > 0
        if countRating { lessonOwnMoves += 1 }
        if wantAnalysis || wantCoach {
            let before = boardBeforeMove
            let after = ChessBoard(copyFrom: board)
            let session = gameSessionID
            pendingAnalyses += 1
            analysisQueue.async { [weak self] in
                guard let self = self else { return }
                let analysis = wantAnalysis
                    ? self.moveAnalyzer.analyze(move: move, boardBefore: before, boardAfter: after,
                                                color: mover, isLearningMode: isLearning)
                    : nil
                var coachText: String? = nil
                var coachDanger: [Position] = []
                if wantCoach {
                    if isHumanMove {
                        let fb = self.feedbackCoach.feedbackAfterOwnMove(before: before, after: after, move: move, color: mover)
                        coachText = fb.text
                        coachDanger = fb.danger
                    } else {
                        let tr = self.feedbackCoach.threatReport(after: after, before: before, move: move, defender: mover.opposite)
                        coachText = tr.text
                        coachDanger = tr.danger
                    }
                }
                DispatchQueue.main.async {
                    self.pendingAnalyses = max(0, self.pendingAnalyses - 1)
                    guard self.gameSessionID == session else { return }
                    if let a = analysis {
                        self.evalBarView?.evaluation = Double(a.evalAfter) / 100.0
                        let pieceName = after.piece(at: move.to)?.type.displayName ?? "Figur"
                        let moveNotation = "\(pieceName) \(posToAlgebraic(move.from))-\(posToAlgebraic(move.to))"
                        self.analysisTitleLabel?.stringValue = "\(self.displayName(for: mover)): \(moveNotation) · Zugwert \(a.rating)/15 \(a.classification.rawValue)"
                        self.showAnalysis(a.summary)
                        if countRating {
                            self.lessonRatingSum += a.rating
                            self.lessonRatingCount += 1
                        }
                    }
                    if var t = coachText {
                        if isHumanMove {
                            if let a = analysis, a.rating <= 5 {
                                t += " ↶ Tipp: Mit „Zurück“ kannst du den Zug zurücknehmen und es besser machen."
                            }
                            self.lastOwnFeedback = t
                        } else if let own = self.lastOwnFeedback {
                            t = "DEIN ZUG: " + own + "\n\nGEGNER: " + t
                            self.lastOwnFeedback = nil
                        }
                        self.showExplanation(t)
                        // Gefahren nur markieren, solange die Stellung noch aktuell ist
                        if self.board.boardHash() == after.boardHash() && self.hintStage == 0 {
                            self.dangerSquares = coachDanger
                            self.updateUI()
                        }
                    }
                    if let r = self.pendingFreePlayResult, self.pendingAnalyses == 0 {
                        self.pendingFreePlayResult = nil
                        self.lessonFreePlayEnded(playerWon: r.won, drawn: r.drawn)
                    }
                }
            }
        }

        // FIX #6: Stellung mit der Farbe erfassen, die als NAECHSTES zieht (korrekte 3fach-Wiederholung)
        let nextPlayer = mover.opposite
        recordPosition(sideToMove: nextPlayer)

        // Check game result
        let result = board.checkGameResult(for: nextPlayer)

        switch result {
        case .checkmate(let winner):
            gameOver = true
            updateUI()
            let msg: String
            if gameMode == .academy {
                if (currentLesson?.freePlayMoves ?? 0) > 0 {
                    endFreePlayWhenReady(playerWon: winner == .white, drawn: false)
                } else {
                    statusLabel?.stringValue = winner == .white ? "SCHACHMATT! 🎉" : "Schachmatt."
                }
                return
            }
            if aiPlaysBlack {
                let winName = whiteName.isEmpty ? "Du hast" : "\(whiteName) hat"
                msg = winner == .white ? "Schachmatt! \(winName) gewonnen!" : "Schachmatt! Computer gewinnt!"
            } else {
                msg = "Schachmatt! \(displayName(for: winner)) gewinnt!"
            }
            statusLabel?.stringValue = msg
            if gameMode == .tutorial {
                showExplanation(winner == .white
                    ? "🏆 Schachmatt! Der Koenig kann dem Angriff nicht entkommen. Grossartig gespielt!"
                    : "Schachmatt – diesmal hat der Computer gewonnen. Mit ↶ Zurück kannst du die letzten Zuege zuruecknehmen und einen anderen Weg probieren!")
            }
            showGameOverAlert(msg)
            return

        case .stalemate:
            gameOver = true
            updateUI()
            if gameMode == .academy {
                if (currentLesson?.freePlayMoves ?? 0) > 0 {
                    endFreePlayWhenReady(playerWon: false, drawn: true)
                } else {
                    statusLabel?.stringValue = "Patt - Unentschieden!"
                    showExplanation("⚠️ PATT! Der Gegner hat keinen Zug mehr, steht aber nicht im Schach - nur Remis! Druecke 'Nochmal'.")
                }
                return
            }
            statusLabel?.stringValue = "Patt - Unentschieden!"
            if gameMode == .tutorial {
                showExplanation("Patt! Der Koenig steht nicht im Schach, hat aber keinen legalen Zug. Das Spiel endet unentschieden. Tipp: Wer vorn liegt, muss dem gegnerischen Koenig immer ein Feld lassen!")
            }
            showGameOverAlert("Patt - Unentschieden!")
            return

        case .draw:
            gameOver = true
            updateUI()
            if gameMode == .academy {
                if (currentLesson?.freePlayMoves ?? 0) > 0 {
                    endFreePlayWhenReady(playerWon: false, drawn: true)
                } else {
                    statusLabel?.stringValue = "Remis."
                }
                return
            }
            statusLabel?.stringValue = "Remis!"
            showGameOverAlert("Remis - Unentschieden!")
            return

        case .ongoing:
            break
        }

        // Check 3-fold repetition
        if checkDraw(sideToMove: nextPlayer) {
            gameOver = true
            updateUI()
            if gameMode == .academy {
                if (currentLesson?.freePlayMoves ?? 0) > 0 {
                    endFreePlayWhenReady(playerWon: false, drawn: true)
                } else {
                    statusLabel?.stringValue = "Remis (Stellungswiederholung)"
                }
                return
            }
            statusLabel?.stringValue = "Remis (Stellungswiederholung)"
            showGameOverAlert("Remis durch Stellungswiederholung!")
            return
        }

        currentPlayer = nextPlayer
        updateUI()

        // v3: Im 2-Spieler-Modus auf Wunsch zum Spieler am Zug drehen (nach der Animation)
        if autoFlip && gameMode == .playerVsPlayer {
            let target = currentPlayer == .black
            runWhenBoardIdle(session: gameSessionID, minDelay: 0.15) { [weak self] in
                self?.setBoardView(fromBlack: target, animated: true)
            }
        }

        // Akademie-Freispiel: Zuglimit erreicht?
        if gameMode == .academy, let lesson = currentLesson, lesson.freePlayMoves > 0,
           lessonOwnMoves >= lesson.freePlayMoves, currentPlayer == .black {
            endFreePlayWhenReady(playerWon: false, drawn: false)
            return
        }

        if aiPlaysBlack && currentPlayer == .black {
            computerThinking = true
            aiCancelled = false
            statusLabel?.stringValue = "Computer denkt nach..."

            let boardCopy = ChessBoard(copyFrom: board)
            let sessionID = gameSessionID
            let historyCopy = gameMoveHistory
            let aiDifficulty = aiEngine.difficulty

            // v3: Der Computer rechnet SOFORT (parallel zur Animation) und zieht erst, wenn
            // die Kampfszene des Spielerzugs fertig ist. Eigene Engine-Instanz pro Zug,
            // damit ein abgebrochener Denkvorgang nie mit dem naechsten kollidiert.
            DispatchQueue.global(qos: .userInitiated).async { [weak self] in
                guard let self = self else { return }
                guard !self.aiCancelled && self.gameSessionID == sessionID else { return }

                // FIX #14: Ab Stufe 4 spielt der Computer bekannte Eroeffnungstheorie
                var aiMove: ChessMove? = nil
                if aiDifficulty >= 4 && historyCopy.count <= 16 {
                    let bookOptions = ChessOpeningBook.nextBookMoves(afterMoves: historyCopy)
                    if !bookOptions.isEmpty {
                        let pick = bookOptions[Int.random(in: 0..<bookOptions.count)]
                        aiMove = boardCopy.allLegalMoves(for: .black).first { moveToUci($0) == pick.move }
                    }
                }
                if aiMove == nil {
                    aiMove = ChessAIEngine(difficulty: aiDifficulty).bestMove(board: boardCopy, color: .black)
                }

                DispatchQueue.main.async { [weak self] in
                    guard let self = self else { return }
                    self.runWhenBoardIdle(session: sessionID, minDelay: 0.3) { [weak self] in
                        guard let self = self, !self.aiCancelled else { return }
                        self.computerThinking = false
                        if let move = aiMove {
                            self.doMove(move)
                        } else {
                            self.gameOver = true
                            self.statusLabel?.stringValue = "Du hast gewonnen!"
                            self.showGameOverAlert("Du hast gewonnen!")
                        }
                    }
                }
            }
        }
    }

    /// Akademie-Freispiel beenden – wartet ggf. auf die letzte Zugbewertung (laeuft im Hintergrund)
    func endFreePlayWhenReady(playerWon: Bool, drawn: Bool) {
        gameOver = true
        if pendingAnalyses > 0 {
            pendingFreePlayResult = (won: playerWon, drawn: drawn)
            return
        }
        lessonFreePlayEnded(playerWon: playerWon, drawn: drawn)
    }

    // ═══════════════════════════════════════════════════════════════
    // MARK: - Schach-Akademie: Bildschirme & Aufgaben-Logik (NEU)
    // ═══════════════════════════════════════════════════════════════

    private func academyClearWindow(title: String) -> NSView {
        aiCancelled = true; computerThinking = false; gameSessionID += 1
        guard let cv = window.contentView else { return NSView() }
        cv.subviews.forEach { $0.removeFromSuperview() }
        board3D?.finishNow()
        window.contentMinSize = NSSize(width: 420, height: 560)
        window.setContentSize(NSSize(width: 460, height: 820))
        window.backgroundColor = .menuBg
        window.title = title
        return cv
    }

    private func academyScrollStack(in cv: NSView) -> NSStackView {
        let scroll = NSScrollView(frame: cv.bounds)
        scroll.hasVerticalScroller = true
        scroll.autoresizingMask = [.width, .height]
        scroll.drawsBackground = false
        cv.addSubview(scroll)
        let container = NSView()
        container.translatesAutoresizingMaskIntoConstraints = false
        scroll.documentView = container
        let stack = NSStackView()
        stack.orientation = .vertical
        stack.alignment = .centerX
        stack.spacing = 12
        stack.translatesAutoresizingMaskIntoConstraints = false
        stack.edgeInsets = NSEdgeInsets(top: 24, left: 24, bottom: 24, right: 24)
        container.addSubview(stack)
        NSLayoutConstraint.activate([
            stack.topAnchor.constraint(equalTo: container.topAnchor),
            stack.bottomAnchor.constraint(equalTo: container.bottomAnchor),
            stack.leadingAnchor.constraint(equalTo: container.leadingAnchor),
            stack.trailingAnchor.constraint(equalTo: container.trailingAnchor),
            container.widthAnchor.constraint(equalTo: scroll.widthAnchor)
        ])
        return stack
    }

    private func academyBackButton(_ title: String, action: Selector) -> NSButton {
        let b = NSButton(title: title, target: self, action: action)
        b.bezelStyle = .rounded
        b.font = NSFont.systemFont(ofSize: 12)
        b.translatesAutoresizingMaskIntoConstraints = false
        return b
    }

    // ── Startbildschirm: Wer lernt heute? (Profil waehlen oder anlegen) ──

    var academyNameField: NSTextField?
    var academyProfilePopup: NSPopUpButton?

    func showAcademyHome() {
        let cv = academyClearWindow(title: "Schach-Akademie")
        let stack = academyScrollStack(in: cv)

        let title = menuLabel("🎓 Schach-Akademie", size: 30, weight: .heavy, color: .chessBrown)
        let sub = menuLabel("10 Stufen - vom ersten Zug bis zur Meisterpruefung", size: 13, color: NSColor(white: 0.45, alpha: 1))
        stack.addArrangedSubview(title)
        stack.addArrangedSubview(sub)

        let card = MenuCardView()
        card.translatesAutoresizingMaskIntoConstraints = false
        stack.addArrangedSubview(card)

        let whoLbl = menuLabel("Wer lernt heute?", size: 16, weight: .semibold, color: NSColor(white: 0.15, alpha: 1))
        let popup = NSPopUpButton(frame: .zero)
        popup.translatesAutoresizingMaskIntoConstraints = false
        popup.addItem(withTitle: "✏️ Neuer Spieler")
        for p in PlayerProfileStore.shared.profiles {
            let prog = (1...10).map { ChessAcademy.progress(profile: p, level: $0) }
            let done = prog.reduce(0) { $0 + $1.done }
            popup.addItem(withTitle: "\(p.name)  ·  \(done)/\(ChessAcademy.lessons.count) Aufgaben · \(p.totalStars)⭐")
        }
        if popup.numberOfItems > 1 { popup.selectItem(at: 1) }
        popup.target = self; popup.action = #selector(academyProfilePicked)
        academyProfilePopup = popup

        let nameField = NSTextField(frame: .zero)
        nameField.translatesAutoresizingMaskIntoConstraints = false
        nameField.placeholderString = "Deinen Namen eingeben..."
        nameField.font = NSFont.systemFont(ofSize: 14)
        nameField.isHidden = popup.numberOfItems > 1
        academyNameField = nameField

        let startBtn = makeAccentButton("🚀 Los geht's!", action: #selector(academyStartPressed))

        let info = menuLabel("Dein Fortschritt wird automatisch unter deinem Namen gespeichert.\nJede Aufgabe kannst du beliebig oft wiederholen.", size: 11, color: NSColor(white: 0.5, alpha: 1))
        info.maximumNumberOfLines = 3
        info.alignment = .center

        [whoLbl, popup, nameField, startBtn].forEach { card.addSubview($0) }
        NSLayoutConstraint.activate([
            whoLbl.topAnchor.constraint(equalTo: card.topAnchor, constant: 18),
            whoLbl.leadingAnchor.constraint(equalTo: card.leadingAnchor, constant: 18),
            popup.topAnchor.constraint(equalTo: whoLbl.bottomAnchor, constant: 12),
            popup.leadingAnchor.constraint(equalTo: card.leadingAnchor, constant: 18),
            popup.trailingAnchor.constraint(equalTo: card.trailingAnchor, constant: -18),
            nameField.topAnchor.constraint(equalTo: popup.bottomAnchor, constant: 10),
            nameField.leadingAnchor.constraint(equalTo: card.leadingAnchor, constant: 18),
            nameField.trailingAnchor.constraint(equalTo: card.trailingAnchor, constant: -18),
            nameField.heightAnchor.constraint(equalToConstant: 26),
            startBtn.topAnchor.constraint(equalTo: nameField.bottomAnchor, constant: 16),
            startBtn.leadingAnchor.constraint(equalTo: card.leadingAnchor, constant: 18),
            startBtn.trailingAnchor.constraint(equalTo: card.trailingAnchor, constant: -18),
            startBtn.heightAnchor.constraint(equalToConstant: 46),
            startBtn.bottomAnchor.constraint(equalTo: card.bottomAnchor, constant: -18)
        ])

        stack.addArrangedSubview(info)
        let back = academyBackButton("← Hauptmenue", action: #selector(backToMenu))
        stack.addArrangedSubview(back)
        NSLayoutConstraint.activate([
            card.widthAnchor.constraint(equalTo: stack.widthAnchor, constant: -48)
        ])
        window.makeKeyAndOrderFront(nil)
    }

    @objc func academyProfilePicked() {
        guard let popup = academyProfilePopup else { return }
        academyNameField?.isHidden = popup.indexOfSelectedItem != 0
    }

    @objc func academyStartPressed() {
        guard let popup = academyProfilePopup else { return }
        let idx = popup.indexOfSelectedItem
        if idx == 0 {
            let name = (academyNameField?.stringValue ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
            guard !name.isEmpty else {
                academyNameField?.placeholderString = "Bitte zuerst einen Namen eingeben!"
                academyNameField?.isHidden = false
                return
            }
            academyProfile = PlayerProfileStore.shared.createOrGet(name: name)
        } else {
            let profile = PlayerProfileStore.shared.profiles[idx - 1]
            academyProfile = profile
        }
        whiteName = academyProfile?.name ?? ""
        blackName = "Computer"
        showAcademyLevels()
    }

    // ── Stufen-Uebersicht ──

    func showAcademyLevels() {
        guard let profile = academyProfile else { showAcademyHome(); return }
        let cv = academyClearWindow(title: "Akademie - Stufen")
        let stack = academyScrollStack(in: cv)

        let title = menuLabel("🎓 \(profile.name)s Akademie", size: 24, weight: .heavy, color: .chessBrown)
        stack.addArrangedSubview(title)
        let totalDone = ChessAcademy.lessons.filter { profile.lessonProgress[$0.id]?.completed == true }.count
        let sub = menuLabel("\(totalDone)/\(ChessAcademy.lessons.count) Aufgaben geloest · \(profile.totalStars) Sterne", size: 12, color: NSColor(white: 0.45, alpha: 1))
        stack.addArrangedSubview(sub)

        for level in 1...10 {
            let info = ChessAcademy.levelInfo[level - 1]
            let prog = ChessAcademy.progress(profile: profile, level: level)
            let unlocked = ChessAcademy.isLevelUnlocked(profile: profile, level: level)

            let card = MenuCardView()
            card.translatesAutoresizingMaskIntoConstraints = false
            card.isAccented = unlocked && prog.done < prog.total

            let status: String
            if !unlocked { status = "🔒 Noch gesperrt - loese erst Stufe \(level - 1)!" }
            else if prog.done >= prog.total { status = "✅ Geschafft! \(prog.stars)⭐ - jederzeit wiederholbar" }
            else { status = "\(prog.done)/\(prog.total) Aufgaben · \(prog.stars)⭐" }

            let tl = menuLabel(info.name, size: 14, weight: .semibold,
                               color: unlocked ? NSColor(white: 0.1, alpha: 1) : NSColor(white: 0.55, alpha: 1))
            let sl = menuLabel(info.subtitle, size: 11, color: NSColor(white: 0.5, alpha: 1))
            let st = menuLabel(status, size: 11, weight: .medium,
                               color: unlocked ? .chessGreen : NSColor(white: 0.55, alpha: 1))
            let tx = vstack([tl, sl, st])

            card.addSubview(tx)
            NSLayoutConstraint.activate([
                tx.topAnchor.constraint(equalTo: card.topAnchor, constant: 10),
                tx.bottomAnchor.constraint(equalTo: card.bottomAnchor, constant: -10),
                tx.leadingAnchor.constraint(equalTo: card.leadingAnchor, constant: 16),
                tx.trailingAnchor.constraint(equalTo: card.trailingAnchor, constant: -16)
            ])

            if unlocked {
                let btn = NSButton(frame: .zero)
                btn.isBordered = false; btn.title = ""
                btn.target = self; btn.action = #selector(academyLevelClicked(_:))
                btn.tag = level
                btn.translatesAutoresizingMaskIntoConstraints = false
                card.addSubview(btn)
                NSLayoutConstraint.activate([
                    btn.topAnchor.constraint(equalTo: card.topAnchor),
                    btn.bottomAnchor.constraint(equalTo: card.bottomAnchor),
                    btn.leadingAnchor.constraint(equalTo: card.leadingAnchor),
                    btn.trailingAnchor.constraint(equalTo: card.trailingAnchor)
                ])
            }
            stack.addArrangedSubview(card)
            card.widthAnchor.constraint(equalTo: stack.widthAnchor, constant: -48).isActive = true
        }

        let back = academyBackButton("← Spieler wechseln", action: #selector(backToAcademyHome))
        stack.addArrangedSubview(back)
        window.makeKeyAndOrderFront(nil)
    }

    @objc func backToAcademyHome() { showAcademyHome() }

    @objc func academyLevelClicked(_ sender: NSButton) {
        currentLevelShown = sender.tag
        showLessonList(level: sender.tag)
    }

    // ── Aufgaben-Liste einer Stufe ──

    func showLessonList(level: Int) {
        guard let profile = academyProfile else { showAcademyHome(); return }
        currentLevelShown = level
        let cv = academyClearWindow(title: "Akademie - Aufgaben")
        let stack = academyScrollStack(in: cv)

        let info = ChessAcademy.levelInfo[level - 1]
        let title = menuLabel(info.name, size: 22, weight: .heavy, color: .chessBrown)
        stack.addArrangedSubview(title)
        let sub = menuLabel(info.subtitle, size: 12, color: NSColor(white: 0.45, alpha: 1))
        stack.addArrangedSubview(sub)

        let lessons = ChessAcademy.lessons(forLevel: level)
        for (idx, lesson) in lessons.enumerated() {
            let prog = profile.lessonProgress[lesson.id]
            let card = MenuCardView()
            card.translatesAutoresizingMaskIntoConstraints = false
            card.isAccented = !(prog?.completed ?? false)

            let statusIcon = (prog?.completed ?? false) ? "✅" : "▶️"
            let starsText = (prog?.completed ?? false) ? " " + String(repeating: "⭐", count: max(1, prog?.stars ?? 1)) : ""
            let typeText = lesson.freePlayMoves > 0 ? " · Spielpraxis" : ""
            let tl = menuLabel("\(statusIcon) \(lesson.title)\(starsText)", size: 14, weight: .semibold, color: NSColor(white: 0.1, alpha: 1))
            let sl = menuLabel("Aufgabe \(idx + 1) von \(lessons.count)\(typeText)" + ((prog?.completed ?? false) ? " · zum Wiederholen klicken" : ""), size: 11, color: NSColor(white: 0.5, alpha: 1))
            let tx = vstack([tl, sl])
            card.addSubview(tx)
            NSLayoutConstraint.activate([
                tx.topAnchor.constraint(equalTo: card.topAnchor, constant: 10),
                tx.bottomAnchor.constraint(equalTo: card.bottomAnchor, constant: -10),
                tx.leadingAnchor.constraint(equalTo: card.leadingAnchor, constant: 16),
                tx.trailingAnchor.constraint(equalTo: card.trailingAnchor, constant: -16)
            ])

            let btn = NSButton(frame: .zero)
            btn.isBordered = false; btn.title = ""
            btn.target = self; btn.action = #selector(academyLessonClicked(_:))
            btn.tag = ChessAcademy.lessons.firstIndex(where: { $0.id == lesson.id }) ?? 0
            btn.translatesAutoresizingMaskIntoConstraints = false
            card.addSubview(btn)
            NSLayoutConstraint.activate([
                btn.topAnchor.constraint(equalTo: card.topAnchor),
                btn.bottomAnchor.constraint(equalTo: card.bottomAnchor),
                btn.leadingAnchor.constraint(equalTo: card.leadingAnchor),
                btn.trailingAnchor.constraint(equalTo: card.trailingAnchor)
            ])

            stack.addArrangedSubview(card)
            card.widthAnchor.constraint(equalTo: stack.widthAnchor, constant: -48).isActive = true
        }

        let back = academyBackButton("← Alle Stufen", action: #selector(backToLevels))
        stack.addArrangedSubview(back)
        window.makeKeyAndOrderFront(nil)
    }

    @objc func backToLevels() { showAcademyLevels() }

    @objc func academyLessonClicked(_ sender: NSButton) {
        guard sender.tag >= 0 && sender.tag < ChessAcademy.lessons.count else { return }
        startLesson(ChessAcademy.lessons[sender.tag])
    }

    @objc func backToLessonList() {
        showLessonList(level: currentLesson?.level ?? currentLevelShown)
    }

    // ── Eine Aufgabe spielen ──

    func startLesson(_ lesson: ChessLesson) {
        currentLesson = lesson
        lessonAttempts = 0
        gameMode = .academy
        window.setContentSize(NSSize(width: 660, height: 780))
        startGame()
        showLessonIntro()
    }

    func showLessonIntro() {
        guard let lesson = currentLesson else { return }
        showExplanation("📚 \(lesson.teach)\n➤ AUFGABE: \(lesson.prompt)")
        statusLabel?.stringValue = lesson.title
        if lesson.freePlayMoves > 0 {
            showAnalysis("Spielpraxis: Dein Coach bewertet jeden deiner Zuege von 1-15. Viel Erfolg, \(academyProfile?.name ?? "Schachfreund")!")
        }
    }

    /// Prueft den Zug des Schuelers gegen die Loesung(en) der Aufgabe
    func attemptLessonMove(_ move: ChessMove) {
        guard let lesson = currentLesson else { return }
        lessonAttempts += 1
        let uci = moveToUci(move)

        if lesson.solutions.contains(uci) {
            doMove(move)     // ausfuehren (mit 3D-Animation), KI antwortet nicht
            lessonSolved = true
            gameOver = true
            let stars = lessonAttempts <= 1 ? 3 : (lessonAttempts <= 3 ? 2 : 1)
            saveLessonResult(stars: stars)
            let starStr = String(repeating: "⭐", count: stars)
            showExplanation("✅ RICHTIG! \(starStr)\n\(lesson.successText)")
            statusLabel?.stringValue = "Geloest! \(starStr)"
            lessonNextButton?.isHidden = false
        } else {
            selectedPos = nil
            validMoves = []
            updateUI()
            statusLabel?.stringValue = lesson.title
            showExplanation("❌ Das war nicht die Loesung. \(lesson.failText)\n(Der Tipp-Knopf hilft dir!)")
        }
    }

    /// Ende einer Spielpraxis-Aufgabe (freies Spiel gegen die KI)
    func lessonFreePlayEnded(playerWon: Bool, drawn: Bool) {
        guard let lesson = currentLesson else { return }
        gameOver = true
        let avg = lessonRatingCount > 0 ? Double(lessonRatingSum) / Double(lessonRatingCount) : 0
        let avgStr = String(format: "%.1f", avg)
        let passAvg: Double = lesson.id == "L10-5" ? 9.0 : 8.0

        let success: Bool
        if lesson.winByMate {
            success = playerWon
        } else {
            success = playerWon || avg >= passAvg
        }

        if success {
            lessonSolved = true
            let stars: Int
            if playerWon { stars = 3 }
            else if avg >= passAvg + 2.5 { stars = 3 }
            else if avg >= passAvg + 1 { stars = 2 }
            else { stars = 1 }
            saveLessonResult(stars: stars)
            let starStr = String(repeating: "⭐", count: stars)
            showExplanation("✅ GESCHAFFT! \(starStr)\n\(lesson.successText)\nDein Zugdurchschnitt: \(avgStr)/15")
            statusLabel?.stringValue = "Bestanden! \(starStr)"
            lessonNextButton?.isHidden = false
        } else {
            showExplanation("❌ \(lesson.failText)\nDein Zugdurchschnitt: \(avgStr)/15" + (lesson.winByMate ? " - Ziel: Schachmatt!" : " - Ziel: \(String(format: "%.0f", passAvg))/15"))
            statusLabel?.stringValue = "Nochmal versuchen!"
        }
    }

    func saveLessonResult(stars: Int) {
        guard var profile = academyProfile, let lesson = currentLesson else { return }
        var p = profile.lessonProgress[lesson.id] ?? LessonProgress()
        p.attempts += max(1, lessonAttempts)
        p.stars = p.completed ? max(p.stars, stars) : stars
        p.completed = true
        profile.lessonProgress[lesson.id] = p
        profile.lastLevel = max(profile.lastLevel, lesson.level)
        academyProfile = profile
        PlayerProfileStore.shared.update(profile)
    }

    @objc func retryLesson() {
        guard currentLesson != nil else { return }
        animView?.cancel()
        startGame()
        showLessonIntro()
    }

    @objc func nextLesson() {
        guard let lesson = currentLesson, let profile = academyProfile else { return }
        let sameLevel = ChessAcademy.lessons(forLevel: lesson.level)
        // Naechste ungeloeste Aufgabe dieser Stufe, sonst naechste in der Reihe, sonst Stufenliste
        if let idx = sameLevel.firstIndex(where: { $0.id == lesson.id }) {
            let after = Array(sameLevel[(idx + 1)...]) + Array(sameLevel[..<idx])
            if let nextUnsolved = after.first(where: { profile.lessonProgress[$0.id]?.completed != true }) {
                startLesson(nextUnsolved)
                return
            }
            if idx + 1 < sameLevel.count {
                startLesson(sameLevel[idx + 1])
                return
            }
        }
        // Stufe fertig → zurueck zur Uebersicht (naechste Stufe evtl. freigeschaltet)
        showAcademyLevels()
    }

    @objc func showLessonHint() {
        guard let lesson = currentLesson else { return }
        showExplanation("💡 TIPP: \(lesson.hint)\n➤ AUFGABE: \(lesson.prompt)")
    }

    func showGameOverAlert(_ msg: String) {
        let sessionID = gameSessionID
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.6) { [weak self] in
            guard let self = self, self.gameSessionID == sessionID else { return }
            let alert = NSAlert()
            alert.messageText = "Spiel beendet"
            alert.informativeText = msg
            alert.addButton(withTitle: "Neues Spiel")
            alert.addButton(withTitle: "Hauptmenu")
            let resp = alert.runModal()
            guard self.gameSessionID == sessionID else { return }
            if resp == .alertFirstButtonReturn { self.startGame() }
            else { self.showMenu() }
        }
    }

    func relayoutGame() {
        guard let cv = window.contentView, boardView != nil, boardView.superview != nil else { return }
        let cw = cv.bounds.width, ch = cv.bounds.height
        let barH: CGFloat = 92
        let expH: CGFloat = (gameMode == .academy) ? 108 : ((gameMode == .tutorial) ? 150 : 0)
        let analysisVisible = analysisEnabled && !(analysisPanel?.isHidden ?? true)
        let analysisH: CGFloat = analysisVisible ? 140 : 0
        // FIX (v3): Coach-Panel und Analyse lagen frueher uebereinander bzw. unter dem Brett.
        // Jetzt: breit genug -> nebeneinander, sonst sauber gestapelt; das Brett beginnt darueber.
        let sideBySide = expH > 0 && analysisVisible && cw >= 900
        let bottomH: CGFloat = sideBySide ? max(expH, analysisH) : expH + analysisH
        // v3: Titelleiste liegt ueber dem Inhalt (fullSizeContentView) -> Kopfleiste darunter beginnen
        let titleH = max(0, ch - window.contentLayoutRect.height)

        // Kopfleiste in voller Breite, rechte Knopfgruppe rechtsbuendig
        if let bar = topBar {
            bar.frame = NSRect(x: 0, y: ch - barH - titleH, width: cw, height: barH + titleH)
            statusLabel?.frame = NSRect(x: 104, y: 46, width: max(80, cw - 104 - 174), height: 40)
            whiteLabel?.frame = NSRect(x: cw - 168, y: 70, width: 160, height: 16)
            blackLabel?.frame = NSRect(x: cw - 168, y: 52, width: 160, height: 16)
            var rx = cw - 10
            for b in rightBarButtons.reversed() {
                rx -= b.frame.width
                b.frame = NSRect(x: rx, y: 8, width: b.frame.width, height: 34)
                rx -= 6
            }
        }

        // Analyse- und Coach-Panel
        if sideBySide {
            let half = floor(cw * 0.55)
            explanationPanel?.frame = NSRect(x: 0, y: 0, width: half, height: bottomH)
            analysisPanel?.frame = NSRect(x: half, y: 0, width: cw - half, height: bottomH)
        } else {
            analysisPanel?.frame = NSRect(x: 0, y: 0, width: cw, height: 140)
            explanationPanel?.frame = NSRect(x: 0, y: analysisH, width: cw, height: expH)
        }
        if let ap = analysisPanel {
            let w = ap.frame.width, h = ap.frame.height
            evalBarView?.frame = NSRect(x: 6, y: 6, width: 22, height: h - 12)
            analysisTitleLabel?.frame = NSRect(x: 36, y: h - 24, width: w - 44, height: 18)
            analysisLabel?.frame = NSRect(x: 36, y: 4, width: w - 44, height: h - 28)
        }
        if let ep = explanationPanel {
            let w = ep.frame.width, h = ep.frame.height
            explanationIcon?.frame = NSRect(x: 12, y: h - 30, width: 26, height: 24)
            let textRight: CGFloat = gameMode == .academy ? 76 : 14
            explanationLabel?.frame = NSRect(x: 42, y: 6, width: max(100, w - 42 - textRight), height: h - 12)
            lessonAgainButton?.frame = NSRect(x: w - 66, y: h - 40, width: 56, height: 30)
            lessonNextButton?.frame = NSRect(x: w - 66, y: h - 76, width: 56, height: 30)
        }

        // Brettflaeche
        let areaH = max(10, ch - barH - titleH - bottomH)
        let boardSz = min(cw, areaH)
        boardView.frame = NSRect(x: (cw - boardSz) / 2, y: bottomH, width: boardSz, height: boardSz)
        boardView.needsDisplay = true
        board3D?.frame = NSRect(x: 0, y: bottomH, width: cw, height: areaH)

        // Animations-Overlay exakt ueber dem 2D-Brett halten
        animView?.frame = boardView.frame

        // Coach-Sprechblase unten ueber dem Brett
        if let bubble = coachBubble, let lbl = coachBubbleLabel {
            let bw = min(640, cw - 40)
            let textW = bw - 44
            lbl.preferredMaxLayoutWidth = textW
            let needed = lbl.cell?.cellSize(forBounds: NSRect(x: 0, y: 0, width: textW, height: 10_000)).height ?? 120
            let bh = min(max(70, needed + 20), max(90, areaH * 0.55))
            bubble.frame = NSRect(x: (cw - bw) / 2, y: bottomH + 14, width: bw, height: bh)
            lbl.frame = NSRect(x: 14, y: 10, width: textW, height: bh - 20)
            coachBubbleClose?.frame = NSRect(x: bw - 30, y: bh - 28, width: 24, height: 22)
        }
    }

    func windowDidResize(_ notification: Notification) { relayoutGame() }
    func windowDidEnterFullScreen(_ notification: Notification) { relayoutGame() }
    func windowDidExitFullScreen(_ notification: Notification) { relayoutGame() }

    @objc func backToMenu() { showMenu() }
    @objc func resetGame() { startGame() }
}

// MARK: - App Delegate

// MARK: - v3: Menueleiste (vorher gab es keine – nicht einmal ⌘Q)

extension SchachWindowController: NSMenuItemValidation {
    func validateMenuItem(_ menuItem: NSMenuItem) -> Bool {
        let inGame = boardView != nil && boardView.superview != nil
        switch menuItem.action {
        case #selector(toggleBoard3D): menuItem.state = use3DBoard ? .on : .off; return true
        case #selector(toggleAnimation): menuItem.state = animationsEnabled ? .on : .off; return true
        case #selector(toggleAutoFlip): menuItem.state = autoFlip ? .on : .off; return true
        case #selector(toggleDogs3D): menuItem.state = dogs3D ? .on : .off; return true
        case #selector(toggleAnalysis): menuItem.state = analysisEnabled ? .on : .off; return inGame
        case #selector(flipBoard): return inGame
        case #selector(resetCamera): return inGame && use3DBoard
        case #selector(undoMove): return inGame && gameMode != .academy && !undoStack.isEmpty
        case #selector(showHint): return inGame && !gameOver
        case #selector(resetGame): return inGame
        case #selector(backToMenu): return inGame
        default: return true
        }
    }
}

class AppDelegate: NSObject, NSApplicationDelegate {
    let controller = SchachWindowController()

    func applicationDidFinishLaunching(_ notification: Notification) {
        buildMainMenu()
        controller.launch()
        NSApp.setActivationPolicy(.regular)
        NSApp.activate(ignoringOtherApps: true)
    }

    private func buildMainMenu() {
        let main = NSMenu()
        func sub(_ title: String) -> NSMenu {
            let item = NSMenuItem()
            let m = NSMenu(title: title)
            item.submenu = m
            main.addItem(item)
            return m
        }
        func add(_ m: NSMenu, _ title: String, _ action: Selector?, _ key: String,
                 _ mods: NSEvent.ModifierFlags = [.command], target: AnyObject? = nil) {
            let it = NSMenuItem(title: title, action: action, keyEquivalent: key)
            it.keyEquivalentModifierMask = mods
            it.target = target
            m.addItem(it)
        }
        let c = controller
        let app = sub("Schach")
        add(app, "Über Schach", #selector(NSApplication.orderFrontStandardAboutPanel(_:)), "")
        app.addItem(.separator())
        add(app, "Schach ausblenden", #selector(NSApplication.hide(_:)), "h")
        app.addItem(.separator())
        add(app, "Schach beenden", #selector(NSApplication.terminate(_:)), "q")

        let edit = sub("Bearbeiten")
        add(edit, "Ausschneiden", #selector(NSText.cut(_:)), "x")
        add(edit, "Kopieren", #selector(NSText.copy(_:)), "c")
        add(edit, "Einsetzen", #selector(NSText.paste(_:)), "v")
        add(edit, "Alles auswählen", #selector(NSText.selectAll(_:)), "a")

        let game = sub("Spiel")
        add(game, "Neues Spiel", #selector(SchachWindowController.resetGame), "n", target: c)
        add(game, "Zug zurücknehmen", #selector(SchachWindowController.undoMove), "z", target: c)
        add(game, "Tipp vom Coach", #selector(SchachWindowController.showHint), "t", target: c)
        game.addItem(.separator())
        add(game, "Zugwert-Kommentare", #selector(SchachWindowController.toggleAnalysis), "k", [.command, .shift], target: c)
        game.addItem(.separator())
        add(game, "Hauptmenü", #selector(SchachWindowController.backToMenu), "m", [.command, .shift], target: c)

        let view = sub("Darstellung")
        add(view, "Brett wenden", #selector(SchachWindowController.flipBoard), "r", target: c)
        add(view, "Automatisch wenden (2 Spieler)", #selector(SchachWindowController.toggleAutoFlip), "", target: c)
        view.addItem(.separator())
        add(view, "Echtes 3D-Brett", #selector(SchachWindowController.toggleBoard3D), "3", target: c)
        add(view, "Kampfszenen", #selector(SchachWindowController.toggleAnimation), "k", target: c)
        add(view, "Hunde-Team (3D)", #selector(SchachWindowController.toggleDogs3D), "d", target: c)
        add(view, "Kamera zurücksetzen", #selector(SchachWindowController.resetCamera), "0", target: c)
        add(view, "Brettfarbe wechseln", #selector(SchachWindowController.cycleTheme), "b", target: c)
        view.addItem(.separator())
        add(view, "Vollbild", #selector(NSWindow.toggleFullScreen(_:)), "f", [.command, .control])

        let win = sub("Fenster")
        add(win, "Im Dock ablegen", #selector(NSWindow.performMiniaturize(_:)), "m")
        NSApp.windowsMenu = win

        NSApp.mainMenu = main
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
        return true
    }
}

// MARK: - Main

#if !TESTMODE
@main
final class SchachAppMain {
    static func main() {
        let delegate = AppDelegate()
        let app = NSApplication.shared
        app.delegate = delegate
        app.run()
    }
}
#endif
