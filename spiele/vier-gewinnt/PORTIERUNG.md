# Portierung: 4 Gewinnt (Swift-App v2.1) → Browser

Vorlage: `spiele/vorlage_swift/VierGewinnt/VierGewinnt.swift` (832 Zeilen, komplett gelesen) + `NEUERUNGEN_v2.1.md`.
Stand: 14.10.2026. Alte Fassung (Standardregeln): `_alt_standardregeln/`.

Dateien: `index.html` · `vier-app.css` · `vier-app.js` (Oberfläche + Online) · `ki-worker.js` (Computerzug im Hintergrund)
· `../gemeinsam/vier-ki.js` (KI 1:1 aus Swift) · `../gemeinsam/vier-regeln.js` (Regeln, vom Server mitbenutzt, unverändert).

## Mapping Swift → JS

| Swift (Zeile) | JS | Bemerkung |
|---|---|---|
| `enum Chip` none/red/yellow, `opposite` (5–8) | Zahlen 0/1/2; `gegner()` in `vier-ki.js`; Rot = Spieler 1 (`st.am`) | Rot beginnt immer |
| `struct Board` rows/cols 6×7, `grid[row][col]`, Reihe 0 = oben (10–14) | KI: `Int8Array(42)`, Index `reihe*7+spalte`, Reihe 0 oben (wie Swift). UI/Server: `vier-regeln.js`-Zustand (Zeile 0 unten); `KI.ausZustand()` wandelt um | Zwei Darstellungen, eine Umrechnung |
| `Board.drop` (16–21) | `drop()` in `vier-ki.js` / `V.ziehen()` in `vier-regeln.js` | gleiche Fallrichtung |
| `isColumnFull`, `isFull` (23–24) | `isColumnFull`, `isFull` | |
| `Board.checkWin` (26–40) | `checkWin` (KI) / `V.gewinnReihe` (Regeln) | 4 Richtungen, ≥ 4 |
| `Board.score(for:)` (42–56) | `score()` | Fenster 3+1 leer = 100, 2+2 = 10, 1+3 = 1; Fenster mit Gegnerstein zählt nicht; alle 69 Fenster vorab berechnet (gleiches Ergebnis, schneller) |
| `AI.bestMove` (64–76) | `bestMove(grid, chip, tiefe)` | Sofortgewinn von links, Wurzel mit vollem Fenster, `>` (bei Gleichstand gewinnt die linkeste Spalte), Rückfall: erste freie Spalte |
| `AI.minimax` (78–108) | `minimax()` | Spalten 0…6, Alpha-Beta wie Swift, Gewinn ±1 000 000 (ohne Tiefenabzug), voll = 0, Blatt = `score(chip) − score(gegner)`. **Kein Zufall, keine Mittelspalten-Sortierung** (die Swift-KI hat beides nicht) |
| `Slider` 1…10, `aiDepth = max(2, min(9, val))`, Namen-Tabelle (451–457) | `<input type=range>` 1–10, `KI.stufeZuTiefe`, `KI.stufenName` | Sehr leicht / Leicht ×2 / Mittel ×2 / Stark ×2 / Sehr stark ×2 / Experte; Start = 5 „Mittel“, nach jedem Menü wieder 5 |
| `DispatchQueue.global … async` + `sessionID` (563–572) | `ki-worker.js` (Web Worker), Rückfall ohne Worker (`file://`): `setTimeout`; `S.sessionID` verwirft verspätete Züge | |
| `NSColor` chipRed/chipYellow/boardBlue/accentOrange (113–118) | `FARBE` in `vier-app.js`, CSS-Variablen `--rot` … | (0,90/0,15/0,10) → rgb(230,38,26) usw. |
| `GradientTitleView` „4 Gewinnt“ 48 pt heavy, Verlauf Rot → Braunorange (122–146) | `.titel` (CSS `background-clip:text`, Verlauf von unten nach oben) | |
| `MiniBoardView` 280×120 mit Vorschau-Zügen (150–191) | `miniZeichnen()` (Canvas, gleiche Zugfolge, Radius `min(cellW,cellH)/2−3`, Glanzpunkt) | |
| `CardView` (195–220) | `.karte` (weiß, Radius 14, Rand 1,5 grau, aktive Karte orange 2 pt, Schatten) | |
| `showMenu()` (256–449): Karte 1 „Spieler vs Spieler / Zu zweit am gleichen Computer“, „oder“, Karte 2 „Spieler vs Computer / Gegen die KI spielen“, „Spielstärke:“, Stufenname orange, Regler, „▶  Spiel starten“ | `showMenu()` | Texte, Reihenfolge, Abstände (18), Kartenhöhe 72, Startknopf 48/Radius 12, Karten max. 460 breit |
| `startGame()` (464–537): dunkles Fenster (0,07/0,07/0,15), Modus-Zeile, Status, Brett, Knöpfe „Menü“ „Neu“ „⛶ Vollbild“ | `startGame()` / `spielAufbau()` | „Spieler vs. KI (Stärke N)“ / „Spieler vs. Spieler“ |
| `humanPlayed`, `drop(col:chip:)` (539–574) | `humanPlayed`, `drop` | Gewinn: Status „🔴 Rot gewinnt! 🎉“ in Spielerfarbe; voll: „Unentschieden!“ (weiß) |
| `updateStatus` (576–580) | `updateStatus` | „🔴 Rot ist dran“ / „🟡 Gelb ist dran“ |
| `showGameOver` (582–595) NSAlert nach 0,7 s: „Spiel beendet“, Text, „Neues Spiel“ / „Hauptmenü“ | `showGameOver` + `dialogZeigen` (Stil macOS-Alert) | Enter = Neues Spiel |
| `backToMenu`, `resetGame` (597–598) | `showMenu`, `startGame` | |
| v2.1 Größe/Vollbild: `scaleFonts` (611–616), `toggleFullScreen`, Titel „Vollbild beenden“ (608–636) | `scaleFonts`, `toggleFullScreen` (Fullscreen-API), `fsGeaendert` | Status `max(17, min(34, base/30))`, Modus `max(11, min(18, base/50))`, `base = min(Breite, Höhe)` |
| `BoardView` v2.1 (672–780): `cellSize`, `origin`, `labelH`, Brettfarben (0,05/0,18/0,55) + (0,08/0,28/0,72), Hover-Spalte (weiß 9 %), Steine mit Schatten (+1/−2) und Glanz (28 %), Spaltennummern **über** dem Brett | `geometrie()`, `brettZeichnen()` (Canvas, Zeichencode Zeile für Zeile übersetzt; AppKit-y-Achse nach oben wird in `rundRect`/`oval` umgerechnet) | Spaltenwahl wie `column(at:)` (nur x zählt, ganze Höhe) |
| `mouseMoved` / `mouseExited` / `mouseDown` (763–773) | `pointermove` (nur Maus) / `pointerleave` / `pointerdown` (auch Finger) | |
| Fenstertitel „4 Gewinnt“, Mindestgröße 380×420 | `<title>4 Gewinnt</title>`, Layout bleibt ab 380×420 nutzbar | |
| `buildMainMenu` (795–824): ⌘N Neues Spiel, ⇧⌘M Hauptmenü, ⌃⌘F Vollbild | Tasten **N**, **M**, **F** im Spiel (Browser belegt ⌘N/⌘M/⌘F selbst) | |

## Zusatz (Add-on, ändert nichts an den Swift-Teilen)

- **Online** als dritte Karte „Online spielen / Mit Freunden, per Raumcode“ im Menü: Tiername (keine Freitexte), Raum erstellen (Seite Rot/Gelb/Zufall), beitreten per 4-stelligem Code oder Link `?raum=ABCD`, QR-Code, Zuschauen, Revanche (Farbtausch), Aufgeben, Wiederverbinden nach Netzabbruch/Neuladen. Server `server/brettspiele.js` unverändert, prüft jeden Zug. Spielfenster = dasselbe wie offline; „Neu“ heißt online „Aufgeben“ bzw. nach dem Ende „Revanche“.
- Tasten 1–7 werfen in die Spalte (die Zahlen stehen ja über dem Brett), ←/→ + Enter/Leertaste/↓ bewegen und werfen.
- „◀ Alle Spiele“ (klein, unter den Karten) zurück zur Spiele-Startseite.
- Dialog lässt sich mit Esc / Klick daneben schließen (Swift-NSAlert ist modal) – so kann man das Endbrett ansehen.

## Weggelassen oder bewusst anders (die 5 %)

- Menüleiste (Über …, Ausblenden, Beenden ⌘Q, Fenster-Menü, Zoomen, Im Dock ablegen) – Mac-Fenster; im Browser gibt es dafür den Browser selbst.
- Gemerkte Fenstergröße (`UserDefaults spielBreite/spielHoehe`) – das Browserfenster bestimmt die Größe; Menü-Fenstergröße 440×700 entfällt (Seite füllt das Fenster, Inhalt bleibt mittig und höchstens 460 breit).
- SF-Symbols (`person.2.fill`, `desktopcomputer`, `chevron.right`) → eigene einfache SVG-Symbole; Systemschrift → `-apple-system`/Systemschrift des Geräts.
- Keine Fall-Animation, keine Siegreihen-Markierung: die Swift-App hat beides nicht (Steine erscheinen sofort). Die alte Fassung hatte sie, siehe `_alt_standardregeln/`.
- Kein Rückgängig, keine Wahl der Seite beim Computerspiel: Swift hat beides nicht (Mensch = Rot, beginnt; KI = Gelb).
- Behobener Swift-Schönheitsfehler: Ein rechnender Computer, dessen Zug nach „Menü“ eintrifft, wird verworfen (`sessionID` wird auch beim Menü erhöht).
- Computerzug wird bei Tiefe 9 im Browser etwas langsamer als kompiliert (leeres Brett ≈ 4 s statt < 1 s); Worker hält die Seite bedienbar.
