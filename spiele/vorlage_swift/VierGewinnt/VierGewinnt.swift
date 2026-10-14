import Cocoa

// MARK: - Models

enum Chip: Int {
    case none = 0, red = 1, yellow = 2
    var opposite: Chip { self == .red ? .yellow : .red }
}

struct Board {
    static let rows = 6
    static let cols = 7

    var grid: [[Chip]] = Array(repeating: Array(repeating: .none, count: cols), count: rows)

    mutating func drop(col: Int, chip: Chip) -> Int? {
        for row in stride(from: Board.rows - 1, through: 0, by: -1) {
            if grid[row][col] == .none { grid[row][col] = chip; return row }
        }
        return nil
    }

    func isColumnFull(_ col: Int) -> Bool { grid[0][col] != .none }
    func isFull() -> Bool { (0..<Board.cols).allSatisfy { isColumnFull($0) } }

    func checkWin(row: Int, col: Int) -> Bool {
        let chip = grid[row][col]
        guard chip != .none else { return false }
        for (dr, dc) in [(0,1),(1,0),(1,1),(1,-1)] {
            var count = 1
            for sign in [1, -1] {
                var r = row + dr * sign, c = col + dc * sign
                while r >= 0 && r < Board.rows && c >= 0 && c < Board.cols && grid[r][c] == chip {
                    count += 1; r += dr * sign; c += dc * sign
                }
            }
            if count >= 4 { return true }
        }
        return false
    }

    func score(for chip: Chip) -> Int {
        var s = 0
        for r in 0..<Board.rows { for c in 0..<Board.cols { for (dr,dc) in [(0,1),(1,0),(1,1),(1,-1)] {
            var my = 0, empty = 0
            for i in 0..<4 {
                let nr = r+dr*i, nc = c+dc*i
                guard nr>=0&&nr<Board.rows&&nc>=0&&nc<Board.cols else { my = -1; break }
                let cell = grid[nr][nc]
                if cell == chip { my += 1 } else if cell == .none { empty += 1 } else { my = -1; break }
            }
            if my < 0 { continue }
            if my==3&&empty==1 { s+=100 } else if my==2&&empty==2 { s+=10 } else if my==1&&empty==3 { s+=1 }
        }}}
        return s
    }
}

// MARK: - AI

struct AI {
    var depth = 5

    func bestMove(board: Board, chip: Chip) -> Int {
        var best = -1, bestScore = Int.min
        for col in 0..<Board.cols {
            guard !board.isColumnFull(col) else { continue }
            var tmp = board
            if let row = tmp.drop(col: col, chip: chip) {
                if tmp.checkWin(row: row, col: col) { return col }
                let s = minimax(board: tmp, depth: depth-1, alpha: Int.min+1, beta: Int.max, maximizing: false, chip: chip)
                if s > bestScore { bestScore = s; best = col }
            }
        }
        return best < 0 ? (0..<Board.cols).first { !board.isColumnFull($0) } ?? 0 : best
    }

    private func minimax(board: Board, depth: Int, alpha: Int, beta: Int, maximizing: Bool, chip: Chip) -> Int {
        if board.isFull() { return 0 }
        if depth == 0 { return board.score(for: chip) - board.score(for: chip.opposite) }
        var a = alpha, b = beta
        if maximizing {
            var val = Int.min+1
            for col in 0..<Board.cols {
                guard !board.isColumnFull(col) else { continue }
                var tmp = board
                if let row = tmp.drop(col: col, chip: chip) {
                    if tmp.checkWin(row: row, col: col) { return 1_000_000 }
                    val = max(val, minimax(board: tmp, depth: depth-1, alpha: a, beta: b, maximizing: false, chip: chip))
                    a = max(a, val); if a >= b { break }
                }
            }
            return val
        } else {
            var val = Int.max
            let opp = chip.opposite
            for col in 0..<Board.cols {
                guard !board.isColumnFull(col) else { continue }
                var tmp = board
                if let row = tmp.drop(col: col, chip: opp) {
                    if tmp.checkWin(row: row, col: col) { return -1_000_000 }
                    val = min(val, minimax(board: tmp, depth: depth-1, alpha: a, beta: b, maximizing: true, chip: chip))
                    b = min(b, val); if a >= b { break }
                }
            }
            return val
        }
    }
}

// MARK: - Colors

extension NSColor {
    static let chipRed    = NSColor(red: 0.90, green: 0.15, blue: 0.10, alpha: 1)
    static let chipYellow = NSColor(red: 1.00, green: 0.80, blue: 0.00, alpha: 1)
    static let boardBlue  = NSColor(red: 0.55, green: 0.70, blue: 0.92, alpha: 1)
    static let accentOrange = NSColor(red: 0.85, green: 0.38, blue: 0.10, alpha: 1)
}

// MARK: - Gradient Title

class GradientTitleView: NSView {
    var text = "4 Gewinnt"
    private let gradient = NSGradient(colors: [
        NSColor(red: 0.85, green: 0.15, blue: 0.10, alpha: 1),
        NSColor(red: 0.75, green: 0.40, blue: 0.05, alpha: 1)
    ], atLocations: [0.0, 1.0], colorSpace: .deviceRGB)!

    override var intrinsicContentSize: NSSize { NSSize(width: 320, height: 62) }

    override func draw(_ dirtyRect: NSRect) {
        guard let ctx = NSGraphicsContext.current?.cgContext else { return }
        let font = NSFont.systemFont(ofSize: 48, weight: .heavy)
        let attrs: [NSAttributedString.Key: Any] = [.font: font]
        let str = text as NSString
        let size = str.size(withAttributes: attrs)
        let origin = NSPoint(x: (bounds.width - size.width) / 2, y: (bounds.height - size.height) / 2)

        // Draw text as clip mask, then fill with gradient
        ctx.saveGState()
        ctx.setTextDrawingMode(.clip)
        str.draw(at: origin, withAttributes: attrs)
        gradient.draw(in: bounds, angle: 90)
        ctx.restoreGState()
    }
}

// MARK: - Mini Board Preview

class MiniBoardView: NSView {
    let previewBoard: Board = {
        var b = Board()
        _ = b.drop(col: 1, chip: .red);    _ = b.drop(col: 2, chip: .yellow)
        _ = b.drop(col: 1, chip: .red);    _ = b.drop(col: 2, chip: .yellow)
        _ = b.drop(col: 3, chip: .red);    _ = b.drop(col: 4, chip: .yellow)
        _ = b.drop(col: 2, chip: .red);    _ = b.drop(col: 3, chip: .yellow)
        return b
    }()

    override var intrinsicContentSize: NSSize { NSSize(width: 280, height: 120) }

    override func draw(_ dirtyRect: NSRect) {
        let cols = Board.cols, rows = Board.rows
        let cellW = bounds.width / CGFloat(cols)
        let cellH = bounds.height / CGFloat(rows)
        let r = min(cellW, cellH) / 2 - 3

        // Board background
        NSColor.boardBlue.withAlphaComponent(0.85).setFill()
        NSBezierPath(roundedRect: bounds, xRadius: 14, yRadius: 14).fill()

        for row in 0..<rows {
            for col in 0..<cols {
                let cx = CGFloat(col) * cellW + cellW / 2
                let cy = CGFloat(rows - 1 - row) * cellH + cellH / 2
                let rect = NSRect(x: cx - r, y: cy - r, width: r*2, height: r*2)
                let chip = previewBoard.grid[row][col]
                switch chip {
                case .red:    NSColor.chipRed.setFill()
                case .yellow: NSColor.chipYellow.setFill()
                case .none:   NSColor(white: 0.6, alpha: 0.5).setFill()
                }
                NSBezierPath(ovalIn: rect).fill()
                if chip != .none {
                    NSColor.white.withAlphaComponent(0.22).setFill()
                    NSBezierPath(ovalIn: NSRect(x: cx - r*0.45, y: cy + r*0.1, width: r*0.7, height: r*0.45)).fill()
                }
            }
        }
    }
}

// MARK: - Card View

class CardView: NSView {
    var isHighlighted = false {
        didSet { updateBorder() }
    }

    override init(frame: NSRect) {
        super.init(frame: frame)
        wantsLayer = true
        layer?.backgroundColor = NSColor.white.cgColor
        layer?.cornerRadius = 14
        layer?.borderWidth = 1.5
        layer?.borderColor = NSColor(white: 0.88, alpha: 1).cgColor
        layer?.shadowColor = NSColor.black.cgColor
        layer?.shadowOpacity = 0.06
        layer?.shadowOffset = CGSize(width: 0, height: -2)
        layer?.shadowRadius = 8
    }
    required init?(coder: NSCoder) { fatalError() }

    func updateBorder() {
        layer?.borderColor = isHighlighted
            ? NSColor.accentOrange.cgColor
            : NSColor(white: 0.88, alpha: 1).cgColor
        layer?.borderWidth = isHighlighted ? 2 : 1.5
    }
}

// MARK: - Window Controller

class VierGewinntController: NSObject, NSWindowDelegate {
    var window: NSWindow!
    var board = Board()
    var currentPlayer: Chip = .red
    var vsAI = false
    var gameOver = false
    var ai = AI()
    var sessionID = 0
    var aiDepth = 5

    // Game UI
    var boardView: BoardView!
    var statusLabel: NSTextField!

    func launch() { buildWindow(); showMenu() }

    func buildWindow() {
        window = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 440, height: 700),
            styleMask: [.titled, .closable, .miniaturizable, .resizable],   // v2.1: frei vergroesserbar
            backing: .buffered, defer: false)
        window.center()
        window.isReleasedWhenClosed = false
        window.collectionBehavior = [.fullScreenPrimary]                  // v2.1: Vollbild (gruene Taste / ⌃⌘F)
        window.contentMinSize = NSSize(width: 380, height: 420)
        window.delegate = self
        window.title = "4 Gewinnt"
        window.backgroundColor = NSColor(white: 0.97, alpha: 1)
    }

    // MARK: - Menu

    func showMenu() {
        guard let content = window.contentView else { return }
        content.subviews.forEach { $0.removeFromSuperview() }
        inGame = false
        if !isFullScreen { window.setContentSize(NSSize(width: 440, height: 700)) }
        window.backgroundColor = NSColor(white: 0.97, alpha: 1)
        window.title = "4 Gewinnt"

        let scroll = NSScrollView(frame: content.bounds)
        scroll.hasVerticalScroller = false
        scroll.autoresizingMask = [.width, .height]
        scroll.drawsBackground = false
        content.addSubview(scroll)

        let container = NSView()
        container.translatesAutoresizingMaskIntoConstraints = false

        // --- Title ---
        let titleView = GradientTitleView()
        titleView.translatesAutoresizingMaskIntoConstraints = false

        // --- Mini board ---
        let miniBoard = MiniBoardView()
        miniBoard.translatesAutoresizingMaskIntoConstraints = false

        // --- Separator label ---
        let sepLine1 = makeSeparator()
        let orLabel = NSTextField(labelWithString: "oder")
        orLabel.font = NSFont.systemFont(ofSize: 12)
        orLabel.textColor = NSColor(white: 0.6, alpha: 1)
        orLabel.translatesAutoresizingMaskIntoConstraints = false
        let sepLine2 = makeSeparator()

        // --- Card 1: Spieler vs Spieler ---
        let card1 = CardView()
        card1.translatesAutoresizingMaskIntoConstraints = false
        let icon1 = NSImageView(image: NSImage(systemSymbolName: "person.2.fill", accessibilityDescription: nil)!)
        icon1.contentTintColor = NSColor(white: 0.3, alpha: 1)
        icon1.translatesAutoresizingMaskIntoConstraints = false
        let title1 = makeCardTitle("Spieler vs Spieler")
        let sub1   = makeCardSub("Zu zweit am gleichen Computer")
        let chevron = NSImageView(image: NSImage(systemSymbolName: "chevron.right", accessibilityDescription: nil)!)
        chevron.contentTintColor = NSColor(white: 0.65, alpha: 1)
        chevron.translatesAutoresizingMaskIntoConstraints = false
        let textStack1 = NSStackView(views: [title1, sub1])
        textStack1.orientation = .vertical
        textStack1.alignment = .leading
        textStack1.spacing = 2
        textStack1.translatesAutoresizingMaskIntoConstraints = false
        let btn1Click = NSButton(frame: .zero)
        btn1Click.isBordered = false
        btn1Click.target = self
        btn1Click.action = #selector(startTwoPlayer)
        btn1Click.translatesAutoresizingMaskIntoConstraints = false
        card1.addSubview(icon1); card1.addSubview(textStack1); card1.addSubview(chevron); card1.addSubview(btn1Click)
        NSLayoutConstraint.activate([
            icon1.leadingAnchor.constraint(equalTo: card1.leadingAnchor, constant: 18),
            icon1.centerYAnchor.constraint(equalTo: card1.centerYAnchor),
            icon1.widthAnchor.constraint(equalToConstant: 28),
            icon1.heightAnchor.constraint(equalToConstant: 28),
            textStack1.leadingAnchor.constraint(equalTo: icon1.trailingAnchor, constant: 14),
            textStack1.centerYAnchor.constraint(equalTo: card1.centerYAnchor),
            chevron.trailingAnchor.constraint(equalTo: card1.trailingAnchor, constant: -16),
            chevron.centerYAnchor.constraint(equalTo: card1.centerYAnchor),
            chevron.widthAnchor.constraint(equalToConstant: 12),
            btn1Click.topAnchor.constraint(equalTo: card1.topAnchor),
            btn1Click.bottomAnchor.constraint(equalTo: card1.bottomAnchor),
            btn1Click.leadingAnchor.constraint(equalTo: card1.leadingAnchor),
            btn1Click.trailingAnchor.constraint(equalTo: card1.trailingAnchor),
            card1.heightAnchor.constraint(equalToConstant: 72)
        ])

        // --- Card 2: Spieler vs Computer ---
        let card2 = CardView()
        card2.isHighlighted = true
        card2.translatesAutoresizingMaskIntoConstraints = false
        let icon2 = NSImageView(image: NSImage(systemSymbolName: "desktopcomputer", accessibilityDescription: nil)!)
        icon2.contentTintColor = NSColor(white: 0.3, alpha: 1)
        icon2.translatesAutoresizingMaskIntoConstraints = false
        let title2 = makeCardTitle("Spieler vs Computer")
        let sub2   = makeCardSub("Gegen die KI spielen")
        let textStack2 = NSStackView(views: [title2, sub2])
        textStack2.orientation = .vertical
        textStack2.alignment = .leading
        textStack2.spacing = 2
        textStack2.translatesAutoresizingMaskIntoConstraints = false

        // Difficulty row
        let diffLabel = NSTextField(labelWithString: "Spielstärke:")
        diffLabel.font = NSFont.systemFont(ofSize: 13, weight: .medium)
        diffLabel.textColor = NSColor(white: 0.2, alpha: 1)
        diffLabel.translatesAutoresizingMaskIntoConstraints = false
        let levelLabel = NSTextField(labelWithString: "Mittel")
        levelLabel.font = NSFont.systemFont(ofSize: 13, weight: .semibold)
        levelLabel.textColor = .accentOrange
        levelLabel.translatesAutoresizingMaskIntoConstraints = false
        levelLabel.setContentHuggingPriority(.required, for: .horizontal)
        let slider = NSSlider(value: 5, minValue: 1, maxValue: 10, target: self, action: #selector(sliderChanged(_:)))
        slider.translatesAutoresizingMaskIntoConstraints = false
        slider.isContinuous = true
        slider.numberOfTickMarks = 10
        slider.allowsTickMarkValuesOnly = true
        slider.controlSize = .regular
        objc_setAssociatedObject(slider, &AssocKeys.levelLabel, levelLabel, .OBJC_ASSOCIATION_RETAIN)

        let diffRow = NSStackView(views: [diffLabel, levelLabel])
        diffRow.orientation = .horizontal
        diffRow.translatesAutoresizingMaskIntoConstraints = false

        // Start button
        let startBtn = NSButton(title: "▶  Spiel starten", target: self, action: #selector(startVsAI))
        startBtn.bezelStyle = .rounded
        startBtn.font = NSFont.systemFont(ofSize: 16, weight: .semibold)
        startBtn.wantsLayer = true
        startBtn.layer?.backgroundColor = NSColor.accentOrange.cgColor
        startBtn.layer?.cornerRadius = 12
        startBtn.contentTintColor = .white
        startBtn.isBordered = false
        startBtn.translatesAutoresizingMaskIntoConstraints = false
        objc_setAssociatedObject(slider, &AssocKeys.sliderRef, slider, .OBJC_ASSOCIATION_RETAIN)

        let topRow = NSStackView(views: [icon2, textStack2])
        topRow.orientation = .horizontal
        topRow.spacing = 14
        topRow.alignment = .centerY
        topRow.translatesAutoresizingMaskIntoConstraints = false

        card2.addSubview(topRow); card2.addSubview(diffRow); card2.addSubview(slider); card2.addSubview(startBtn)
        NSLayoutConstraint.activate([
            topRow.topAnchor.constraint(equalTo: card2.topAnchor, constant: 16),
            topRow.leadingAnchor.constraint(equalTo: card2.leadingAnchor, constant: 18),
            topRow.trailingAnchor.constraint(equalTo: card2.trailingAnchor, constant: -18),
            icon2.widthAnchor.constraint(equalToConstant: 28),
            icon2.heightAnchor.constraint(equalToConstant: 28),
            diffRow.topAnchor.constraint(equalTo: topRow.bottomAnchor, constant: 14),
            diffRow.leadingAnchor.constraint(equalTo: card2.leadingAnchor, constant: 18),
            diffRow.trailingAnchor.constraint(equalTo: card2.trailingAnchor, constant: -18),
            slider.topAnchor.constraint(equalTo: diffRow.bottomAnchor, constant: 6),
            slider.leadingAnchor.constraint(equalTo: card2.leadingAnchor, constant: 18),
            slider.trailingAnchor.constraint(equalTo: card2.trailingAnchor, constant: -18),
            startBtn.topAnchor.constraint(equalTo: slider.bottomAnchor, constant: 14),
            startBtn.leadingAnchor.constraint(equalTo: card2.leadingAnchor, constant: 18),
            startBtn.trailingAnchor.constraint(equalTo: card2.trailingAnchor, constant: -18),
            startBtn.heightAnchor.constraint(equalToConstant: 48),
            startBtn.bottomAnchor.constraint(equalTo: card2.bottomAnchor, constant: -16)
        ])

        // Assemble container
        let mainStack = NSStackView(views: [titleView, miniBoard, card1])
        mainStack.orientation = .vertical
        mainStack.alignment = .centerX
        mainStack.spacing = 18
        mainStack.translatesAutoresizingMaskIntoConstraints = false

        let sepStack = NSStackView(views: [sepLine1, orLabel, sepLine2])
        sepStack.orientation = .horizontal
        sepStack.spacing = 10
        sepStack.alignment = .centerY
        sepStack.translatesAutoresizingMaskIntoConstraints = false

        let outerStack = NSStackView(views: [mainStack, sepStack, card2])
        outerStack.orientation = .vertical
        outerStack.alignment = .centerX
        outerStack.spacing = 18
        outerStack.translatesAutoresizingMaskIntoConstraints = false
        outerStack.edgeInsets = NSEdgeInsets(top: 30, left: 24, bottom: 30, right: 24)

        container.addSubview(outerStack)
        scroll.documentView = container

        NSLayoutConstraint.activate([
            outerStack.topAnchor.constraint(equalTo: container.topAnchor),
            outerStack.bottomAnchor.constraint(equalTo: container.bottomAnchor),
            outerStack.leadingAnchor.constraint(equalTo: container.leadingAnchor),
            outerStack.trailingAnchor.constraint(equalTo: container.trailingAnchor),
            container.widthAnchor.constraint(equalTo: scroll.widthAnchor),
            card1.widthAnchor.constraint(equalTo: card2.widthAnchor),
            card2.widthAnchor.constraint(lessThanOrEqualTo: outerStack.widthAnchor, constant: -48),
            card2.widthAnchor.constraint(lessThanOrEqualToConstant: 460),
            miniBoard.widthAnchor.constraint(equalToConstant: 280),
            miniBoard.heightAnchor.constraint(equalToConstant: 120),
            sepLine1.heightAnchor.constraint(equalToConstant: 1),
            sepLine2.heightAnchor.constraint(equalToConstant: 1),
            sepLine1.widthAnchor.constraint(equalTo: sepLine2.widthAnchor),
            sepStack.widthAnchor.constraint(equalTo: card2.widthAnchor)
        ])
        // Karten so breit wie moeglich (bis 460 pt) – bei Vollbild bleiben sie mittig und handlich
        let wide = card2.widthAnchor.constraint(equalTo: outerStack.widthAnchor, constant: -48)
        wide.priority = .defaultHigh
        wide.isActive = true

        aiDepth = 5
        window.makeKeyAndOrderFront(nil)
    }

    @objc func sliderChanged(_ sender: NSSlider) {
        let val = Int(sender.doubleValue)
        aiDepth = max(2, min(9, val))
        let label = objc_getAssociatedObject(sender, &AssocKeys.levelLabel) as? NSTextField
        let names = ["","Sehr leicht","Leicht","Leicht","Mittel","Mittel","Stark","Stark","Sehr stark","Sehr stark","Experte"]
        label?.stringValue = val < names.count ? names[val] : "Experte"
    }

    // MARK: - Game

    @objc func startTwoPlayer() { vsAI = false; startGame() }
    @objc func startVsAI()      { vsAI = true;  startGame() }

    func startGame() {
        sessionID += 1
        board = Board()
        currentPlayer = .red
        gameOver = false
        ai.depth = aiDepth

        guard let content = window.contentView else { return }
        content.subviews.forEach { $0.removeFromSuperview() }
        // v2.1: Spielfenster merkt sich seine Groesse; im Vollbild bleibt alles, wie es ist
        if !isFullScreen && !inGame {
            let d = UserDefaults.standard
            let w = d.double(forKey: "spielBreite"), h = d.double(forKey: "spielHoehe")
            window.setContentSize(NSSize(width: w > 0 ? w : 560, height: h > 0 ? h : 640))
        }
        inGame = true
        window.backgroundColor = NSColor(red: 0.07, green: 0.07, blue: 0.15, alpha: 1)

        let bg = NSView(frame: content.bounds)
        bg.wantsLayer = true
        bg.layer?.backgroundColor = NSColor(red: 0.07, green: 0.07, blue: 0.15, alpha: 1).cgColor
        bg.autoresizingMask = [.width, .height]
        content.addSubview(bg)

        let modeStr = vsAI ? "Spieler vs. KI (Stärke \(aiDepth))" : "Spieler vs. Spieler"
        let modeLabel = NSTextField(labelWithString: modeStr)
        modeLabel.font = NSFont.systemFont(ofSize: 11)
        modeLabel.textColor = NSColor.white.withAlphaComponent(0.4)
        modeLabel.alignment = .center
        modeLabel.translatesAutoresizingMaskIntoConstraints = false
        content.addSubview(modeLabel)

        statusLabel = NSTextField(labelWithString: "")
        statusLabel.font = NSFont.systemFont(ofSize: 17, weight: .semibold)
        statusLabel.textColor = .white
        statusLabel.alignment = .center
        statusLabel.translatesAutoresizingMaskIntoConstraints = false
        content.addSubview(statusLabel)

        boardView = BoardView()
        boardView.board = board
        boardView.translatesAutoresizingMaskIntoConstraints = false
        boardView.onColumnClicked = { [weak self] col in self?.humanPlayed(col: col) }
        content.addSubview(boardView)

        let menuBtn = makeSmallBtn("Menü", action: #selector(backToMenu))
        let newBtn  = makeSmallBtn("Neu",  action: #selector(resetGame))
        let fullBtn = makeSmallBtn(isFullScreen ? "Vollbild beenden" : "⛶ Vollbild", action: #selector(toggleFullScreen))
        fullScreenButton = fullBtn
        let btnStack = NSStackView(views: [menuBtn, newBtn, fullBtn])
        btnStack.spacing = 12
        btnStack.translatesAutoresizingMaskIntoConstraints = false
        content.addSubview(btnStack)

        // v2.1: Das Brett fuellt den ganzen freien Platz und skaliert stufenlos mit
        NSLayoutConstraint.activate([
            modeLabel.topAnchor.constraint(equalTo: content.topAnchor, constant: 14),
            modeLabel.centerXAnchor.constraint(equalTo: content.centerXAnchor),
            statusLabel.topAnchor.constraint(equalTo: modeLabel.bottomAnchor, constant: 6),
            statusLabel.centerXAnchor.constraint(equalTo: content.centerXAnchor),
            boardView.topAnchor.constraint(equalTo: statusLabel.bottomAnchor, constant: 10),
            boardView.leadingAnchor.constraint(equalTo: content.leadingAnchor, constant: 12),
            boardView.trailingAnchor.constraint(equalTo: content.trailingAnchor, constant: -12),
            btnStack.topAnchor.constraint(equalTo: boardView.bottomAnchor, constant: 10),
            btnStack.centerXAnchor.constraint(equalTo: content.centerXAnchor),
            btnStack.bottomAnchor.constraint(equalTo: content.bottomAnchor, constant: -14)
        ])
        boardView.setContentHuggingPriority(.defaultLow, for: .vertical)
        boardView.setContentCompressionResistancePriority(.defaultLow, for: .vertical)
        scaleFonts()

        updateStatus()
        window.makeKeyAndOrderFront(nil)
    }

    func humanPlayed(col: Int) {
        guard !gameOver, !board.isColumnFull(col) else { return }
        if vsAI && currentPlayer == .yellow { return }
        drop(col: col, chip: currentPlayer)
    }

    func drop(col: Int, chip: Chip) {
        guard let row = board.drop(col: col, chip: chip) else { return }
        boardView.board = board; boardView.needsDisplay = true

        if board.checkWin(row: row, col: col) {
            gameOver = true
            let name = chip == .red ? "🔴 Rot" : "🟡 Gelb"
            statusLabel.stringValue = "\(name) gewinnt! 🎉"
            statusLabel.textColor = chip == .red ? .chipRed : .chipYellow
            showGameOver("\(name) gewinnt!"); return
        }
        if board.isFull() {
            gameOver = true; statusLabel.stringValue = "Unentschieden!"
            statusLabel.textColor = .white; showGameOver("Unentschieden!"); return
        }
        currentPlayer = currentPlayer.opposite
        updateStatus()

        if vsAI && currentPlayer == .yellow {
            let sid = sessionID
            DispatchQueue.global(qos: .userInitiated).async { [weak self] in
                guard let self = self else { return }
                let move = self.ai.bestMove(board: self.board, chip: .yellow)
                DispatchQueue.main.async {
                    guard self.sessionID == sid, !self.gameOver else { return }
                    self.drop(col: move, chip: .yellow)
                }
            }
        }
    }

    func updateStatus() {
        let isRed = currentPlayer == .red
        statusLabel.stringValue = isRed ? "🔴 Rot ist dran" : "🟡 Gelb ist dran"
        statusLabel.textColor   = isRed ? .chipRed : .chipYellow
    }

    func showGameOver(_ msg: String) {
        let sid = sessionID
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.7) { [weak self] in
            guard let self = self, self.sessionID == sid else { return }
            let alert = NSAlert()
            alert.messageText = "Spiel beendet"
            alert.informativeText = msg
            alert.addButton(withTitle: "Neues Spiel")
            alert.addButton(withTitle: "Hauptmenü")
            let r = alert.runModal()
            guard self.sessionID == sid else { return }
            if r == .alertFirstButtonReturn { self.startGame() } else { self.showMenu() }
        }
    }

    @objc func backToMenu() { showMenu() }
    @objc func resetGame()  { startGame() }

    // MARK: - v2.1: Groesse & Vollbild

    var inGame = false
    weak var fullScreenButton: NSButton?
    var modeLabelRef: NSTextField? { window.contentView?.subviews.compactMap { $0 as? NSTextField }.first { $0 !== statusLabel } }

    var isFullScreen: Bool { window?.styleMask.contains(.fullScreen) ?? false }

    @objc func toggleFullScreen() { window.toggleFullScreen(nil) }

    /// Schrift waechst mit dem Fenster (im Vollbild gut lesbar)
    func scaleFonts() {
        guard inGame, let content = window.contentView else { return }
        let base = min(content.bounds.width, content.bounds.height)
        statusLabel?.font = NSFont.systemFont(ofSize: max(17, min(34, base / 30)), weight: .semibold)
        modeLabelRef?.font = NSFont.systemFont(ofSize: max(11, min(18, base / 50)))
    }

    func windowDidResize(_ notification: Notification) {
        scaleFonts()
        boardView?.needsDisplay = true
        // Groesse des Spielfensters merken (nicht im Vollbild)
        if inGame && !isFullScreen, let c = window.contentView {
            UserDefaults.standard.set(Double(c.bounds.width), forKey: "spielBreite")
            UserDefaults.standard.set(Double(c.bounds.height), forKey: "spielHoehe")
        }
    }

    func windowDidEnterFullScreen(_ notification: Notification) {
        fullScreenButton?.title = "Vollbild beenden"
        scaleFonts()
    }

    func windowDidExitFullScreen(_ notification: Notification) {
        fullScreenButton?.title = "⛶ Vollbild"
        scaleFonts()
    }

    // MARK: - Helpers

    func makeCardTitle(_ s: String) -> NSTextField {
        let l = NSTextField(labelWithString: s)
        l.font = NSFont.systemFont(ofSize: 15, weight: .semibold)
        l.textColor = NSColor(white: 0.1, alpha: 1); return l
    }
    func makeCardSub(_ s: String) -> NSTextField {
        let l = NSTextField(labelWithString: s)
        l.font = NSFont.systemFont(ofSize: 12)
        l.textColor = NSColor(white: 0.5, alpha: 1); return l
    }
    func makeSeparator() -> NSView {
        let v = NSView()
        v.wantsLayer = true
        v.layer?.backgroundColor = NSColor(white: 0.78, alpha: 1).cgColor
        v.translatesAutoresizingMaskIntoConstraints = false
        return v
    }
    func makeSmallBtn(_ title: String, action: Selector) -> NSButton {
        let b = NSButton(title: title, target: self, action: action)
        b.bezelStyle = .rounded; b.font = NSFont.systemFont(ofSize: 13); return b
    }
}

// MARK: - Associated Object Keys
private enum AssocKeys {
    // v2.1: feste Speicheradressen (vorher String-Variablen -> Adresse nicht garantiert stabil)
    static var levelLabel: UInt8 = 0
    static var sliderRef: UInt8 = 0
}

// MARK: - Board View

class BoardView: NSView {
    var board: Board = Board()
    var hoverCol: Int = -1
    var onColumnClicked: ((Int) -> Void)?

    // v2.1: Feldgroesse passt sich stufenlos an die Fenstergroesse an
    private let padding: CGFloat  = 10
    private var labelH: CGFloat { max(22, cellSize * 0.36) }

    private var cellSize: CGFloat {
        let w = (bounds.width - padding * 2 - 12) / CGFloat(Board.cols)
        let h = (bounds.height - padding * 2 - 12 - 22) / (CGFloat(Board.rows) + 0.36)
        return max(20, floor(min(w, h)))
    }
    /// Linke untere Ecke des Bretts (zentriert)
    private var origin: NSPoint {
        let bw = CGFloat(Board.cols) * cellSize, bh = CGFloat(Board.rows) * cellSize
        let totalH = bh + labelH
        return NSPoint(x: floor((bounds.width - bw) / 2), y: floor((bounds.height - totalH) / 2))
    }

    override var intrinsicContentSize: NSSize {
        NSSize(width: NSView.noIntrinsicMetric, height: NSView.noIntrinsicMetric)
    }

    override func setFrameSize(_ newSize: NSSize) {
        super.setFrameSize(newSize)
        needsDisplay = true
    }

    override func draw(_ dirtyRect: NSRect) {
        let cellSize = self.cellSize
        let bw = CGFloat(Board.cols) * cellSize, bh = CGFloat(Board.rows) * cellSize
        let ox = origin.x, oy = origin.y
        let inset = max(4, cellSize * 0.11)

        // Board
        NSColor(red:0.05,green:0.18,blue:0.55,alpha:1).setFill()
        NSBezierPath(roundedRect: NSRect(x:ox-6,y:oy-6,width:bw+12,height:bh+12), xRadius:14, yRadius:14).fill()
        NSColor(red:0.08,green:0.28,blue:0.72,alpha:1).setFill()
        NSBezierPath(roundedRect: NSRect(x:ox,y:oy,width:bw,height:bh), xRadius:12, yRadius:12).fill()

        // Hover
        if hoverCol >= 0 {
            let hx = ox + CGFloat(hoverCol) * cellSize
            NSColor.white.withAlphaComponent(0.09).setFill()
            NSBezierPath(roundedRect: NSRect(x:hx+6,y:oy,width:cellSize-12,height:bh), xRadius:8, yRadius:8).fill()
        }

        // Chips
        for row in 0..<Board.rows { for col in 0..<Board.cols {
            let cx = ox + CGFloat(col)*cellSize + cellSize/2
            let cy = oy + CGFloat(Board.rows-1-row)*cellSize + cellSize/2
            let r  = cellSize/2 - inset
            let rect = NSRect(x:cx-r, y:cy-r, width:r*2, height:r*2)
            let chip = board.grid[row][col]
            NSColor.black.withAlphaComponent(0.25).setFill()
            NSBezierPath(ovalIn: rect.offsetBy(dx:1, dy:-2)).fill()
            switch chip {
            case .red:    NSColor.chipRed.setFill()
            case .yellow: NSColor.chipYellow.setFill()
            case .none:   NSColor(red:0.06,green:0.06,blue:0.14,alpha:1).setFill()
            }
            NSBezierPath(ovalIn: rect).fill()
            if chip != .none {
                NSColor.white.withAlphaComponent(0.28).setFill()
                NSBezierPath(ovalIn: NSRect(x:cx-r*0.48,y:cy+r*0.12,width:r*0.75,height:r*0.5)).fill()
            }
        }}

        // Column numbers + arrows
        let numAttrs: [NSAttributedString.Key:Any] = [
            .font: NSFont.monospacedDigitSystemFont(ofSize: max(11, cellSize * 0.18), weight:.light),
            .foregroundColor: NSColor.white.withAlphaComponent(0.45)
        ]
        for col in 0..<Board.cols {
            let label = "\(col+1)"
            let lsz = (label as NSString).size(withAttributes: numAttrs)
            let lx = ox + CGFloat(col)*cellSize + (cellSize-lsz.width)/2
            (label as NSString).draw(at: NSPoint(x:lx, y:oy+bh+6), withAttributes: numAttrs)
        }
    }

    /// Spalte unter dem Mauszeiger (-1 = keine)
    private func column(at loc: NSPoint) -> Int {
        let x = loc.x - origin.x
        guard x >= 0 else { return -1 }
        let col = Int(x / cellSize)
        return col < Board.cols ? col : -1
    }

    override func mouseMoved(with e: NSEvent) {
        let loc = convert(e.locationInWindow, from: nil)
        let newH = column(at: loc)
        if newH != hoverCol { hoverCol = newH; needsDisplay = true }
    }
    override func mouseExited(with e: NSEvent) { hoverCol = -1; needsDisplay = true }
    override func mouseDown(with e: NSEvent) {
        let loc = convert(e.locationInWindow, from: nil)
        let col = column(at: loc)
        if col >= 0 { onColumnClicked?(col) }
    }
    override func updateTrackingAreas() {
        super.updateTrackingAreas()
        trackingAreas.forEach { removeTrackingArea($0) }
        addTrackingArea(NSTrackingArea(rect: bounds,
            options: [.mouseMoved,.mouseEnteredAndExited,.activeInActiveApp], owner: self, userInfo: nil))
    }
}

// MARK: - App Delegate

class AppDelegate: NSObject, NSApplicationDelegate {
    let controller = VierGewinntController()
    func applicationDidFinishLaunching(_ n: Notification) {
        buildMainMenu()
        controller.launch()
        NSApp.setActivationPolicy(.regular)
        NSApp.activate(ignoringOtherApps: true)
    }
    func applicationShouldTerminateAfterLastWindowClosed(_ s: NSApplication) -> Bool { true }

    /// v2.1: Menueleiste (vorher gab es keine – nicht einmal ⌘Q)
    private func buildMainMenu() {
        let main = NSMenu()
        func sub(_ title: String) -> NSMenu {
            let item = NSMenuItem(); let m = NSMenu(title: title)
            item.submenu = m; main.addItem(item); return m
        }
        func add(_ m: NSMenu, _ title: String, _ action: Selector, _ key: String,
                 _ mods: NSEvent.ModifierFlags = [.command], target: AnyObject? = nil) {
            let it = NSMenuItem(title: title, action: action, keyEquivalent: key)
            it.keyEquivalentModifierMask = mods
            it.target = target
            m.addItem(it)
        }
        let c = controller
        let app = sub("4 Gewinnt")
        add(app, "Über 4 Gewinnt", #selector(NSApplication.orderFrontStandardAboutPanel(_:)), "")
        app.addItem(.separator())
        add(app, "4 Gewinnt ausblenden", #selector(NSApplication.hide(_:)), "h")
        add(app, "4 Gewinnt beenden", #selector(NSApplication.terminate(_:)), "q")
        let game = sub("Spiel")
        add(game, "Neues Spiel", #selector(VierGewinntController.resetGame), "n", target: c)
        add(game, "Hauptmenü", #selector(VierGewinntController.backToMenu), "m", [.command, .shift], target: c)
        let view = sub("Darstellung")
        add(view, "Vollbild", #selector(VierGewinntController.toggleFullScreen), "f", [.command, .control], target: c)
        let win = sub("Fenster")
        add(win, "Im Dock ablegen", #selector(NSWindow.performMiniaturize(_:)), "m")
        add(win, "Zoomen", #selector(NSWindow.performZoom(_:)), "")
        NSApp.windowsMenu = win
        NSApp.mainMenu = main
    }
}

// MARK: - Main

let delegate = AppDelegate()
let app = NSApplication.shared
app.delegate = delegate
app.run()
