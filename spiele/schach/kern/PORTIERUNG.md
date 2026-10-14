# Portierung Swift -> JS (Schach-Kern)

Quelle: `spiele/vorlage_swift/SchachSpiel/SchachSpiel.swift` (Zeilen ~1-3490) + Spiellogik aus `SchachWindowController`.
Ziel: UMD-Module in `spiele/schach/kern/`, Namespace `window.SchachKern` bzw. `require('./index.js')`.

## Zuordnung Swift -> JS

| Swift | JS (Datei) |
|---|---|
| PieceColor/PieceType/Piece/Position/Move/GameResult/GameMode, Notation | `K.Color`, `K.PieceType`, `K.Piece`, `K.makeMove`, `K.Notation`, `K.posToAlgebraic` ... (modelle.js) |
| ChessBoard (Regeln, FEN, Hash, Ergebnis) | `K.ChessBoard` (brett.js) |
| PlayerProfile/LessonProgress/PlayerProfileStore | profile.js (localStorage statt Datei) |
| ChessAcademy (10 Stufen, 47 Aufgaben) | akademie.js + daten_akademie.js |
| ChessOpeningBook (87 Eintraege) | eroeffnungsbuch.js + daten_buch.js |
| ChessKnowledgeBase (49 Begriffe, 33 Partien) | wissen.js + daten_wissen.js |
| ChessAIEngine, Spielstaerke | ki.js |
| ChessTutorialEngine | tutorial.js |
| ChessTacticsDetector, ChessPositionalAnalyzer, Artikel-Helfer | analyse.js, modelle.js |
| CoachTools, ChessCoach | coach.js |
| MoveClassification, ChessMoveRater (1-15), ChessMoveAnalyzer, GameSnapshot | bewertung.js |
| Spiellogik des SchachWindowController | partie.js (`K.Partie`, Ereignisse statt UI) |
| Hintergrundthreads (DispatchQueue) | jobs.js (`LokalerRechner`, `WorkerRechner`) + worker.js |
| UserDefaults | `K.Einstellungen` (localStorage, try/catch) |

Die Datenlisten wurden per `_werkzeug/swift_daten_konverter.py` maschinell aus dem Swift-Quelltext erzeugt (Texte woertlich).
`_werkzeug/buendeln.js` erzeugt `kern-alles.js` (eine Datei fuer den Browser).

## Abweichungen

1. Rochade: Turm muss eigene Farbe haben (Swift prueft das nicht; sonst Regelfehler moeglich).
2. FEN-Parser: Rochadefeld sowie Halbzug-/Zugzaehler werden beachtet; ohne Rochadefeld wie Swift.
3. Swift-Dictionary/Set-Reihenfolge ist undefiniert; JS nutzt aufsteigende bzw. Einfuegereihenfolge. Gleichwertige Zuege koennen daher anders gewaehlt werden.
4. `stats` ist in JS die Funktion `stats()`.
5. `String(format:)` wird durch `K.fmtFix` nachgebildet (C-Rundung, exakte Haelften auf gerade).
6. Paw Patrol nicht uebernommen; stattdessen Hunde-Team (Bruno/Koenig, Luna/Dame, Brocken/Turm, Wurzel/Laeufer, Falko/Springer, Welpe/Bauer) ueber `K.Stil.hunde`. Der 2D-Stil "Paw" entfaellt.
7. Nicht portiert (Oberflaeche): BoardTheme, ChessBoardView, PieceAnimationView, SceneKit/3D, PromotionDialog, EvalBarView, Menue/Layout, Auto-Flip-/Kamera-/Animationszustand.
8. Figuren sind unveraenderlich; `ChessBoard.copyFrom` kopiert nur die Zeilen (flach).
9. Zufall ueber `K.Zufall` (seedbar), Swift nutzt den Systemzufall.
10. Tote Stelle in Swift: `detectSkewer` bricht immer nach der ersten Figur ab und loest nie aus. 1:1 uebernommen; `K.ChessTacticsDetector.spiessKorrigiert = true` aktiviert die Korrektur.
11. Swift-Tests zu Themes, Brett-Views und Paw wurden durch Hunde-Team-Tests ersetzt.

## Tests

`node tests/test_schach_kern.js` -> 192 Pruefungen, 0 Fehler. Enthalten: Perft (Startstellung 20/400/8902/197281; Kiwipete 48/2039/97862; Stellungen 3-5: 14/191/2812/43238, 6/264/9467, 44/1486/62379), Matt/Patt/Sonderregeln, KI, Bewertung 1-15, Akademie, Profile, Wiederholung, Buch/Wissen, Taktik, Notation, Hunde-Team, Coach, Analyzer, Partie-Ablaeufe, Worker-Jobs, Gleichheit der optimierten Zugerzeugung mit der Swift-Referenzmethode (3161 Zufallsstellungen).

## Leistung (Node, 10 Stellungen je Stufe, Last durch andere Agenten)

| Stufe | Knotenbudget | 10 Stellungen | je Stellung |
|---|---|---|---|
| 1 | 50 000 | 0,16 s | 16 ms |
| 2 | 50 000 | 0,24 s | 25 ms |
| 3 | 50 000 | 1,12 s | 112 ms |
| 4 | 100 000 | 1,94 s | 194 ms |
| 5 | 200 000 | 4,17 s | 417 ms |
| 6 | 400 000 | 8,86 s | 886 ms |
| 7 | 600 000 | 12,36 s | 1,24 s |
| 8 | 900 000 | 20,76 s | 2,08 s |
| 9 | 1 200 000 | 26,15 s | 2,62 s |
| 10 | 2 000 000 | 48,37 s | 4,84 s |

Etwa 0,4 Mio. Knoten/s. Stufe 8-10 immer im Web-Worker rechnen. Swift-Vergleichswerte sind hier nicht messbar.
