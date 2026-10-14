# Schach-Kern – API für die Oberfläche

Browser-Schachlogik, übersetzt aus der Mac-App (`spiele/vorlage_swift/SchachSpiel/SchachSpiel.swift`).
Reines Vanilla-JS, **keine CDNs, kein DOM** in den Modulen (Web-Worker-tauglich). Texte wörtlich aus Swift
(ASCII-Schreibweise wie im Original: „Koenig“, „Laeufer“, „schlaegt“ …; Emojis und „–“ bleiben).

Dateien: `spiele/schach/kern/` · Tests: `node tests/test_schach_kern.js` (192 Prüfungen) · Mapping Swift→JS: `PORTIERUNG.md`.

---

## 1. Einbinden

### Browser (Reihenfolge einhalten)

```html
<script src="kern/modelle.js"></script>
<script src="kern/brett.js"></script>
<script src="kern/profile.js"></script>
<script src="kern/daten_akademie.js"></script>
<script src="kern/daten_buch.js"></script>
<script src="kern/daten_wissen.js"></script>
<script src="kern/akademie.js"></script>
<script src="kern/eroeffnungsbuch.js"></script>
<script src="kern/wissen.js"></script>
<script src="kern/ki.js"></script>
<script src="kern/tutorial.js"></script>
<script src="kern/analyse.js"></script>
<script src="kern/coach.js"></script>
<script src="kern/bewertung.js"></script>
<script src="kern/jobs.js"></script>
<script src="kern/partie.js"></script>
```

oder **eine Datei**: `<script src="kern/kern-alles.js"></script>` (erzeugt mit `node spiele/schach/kern/_werkzeug/buendeln.js`;
nach jeder Änderung an einem Modul neu bündeln).

Alles hängt danach an `window.SchachKern` (hier `K` genannt): `const K = window.SchachKern;`

### Node

```js
const K = require('./spiele/schach/kern');   // alle Module am selben Objekt
```

---

## 2. Datenformate

| Ding | Format |
|---|---|
| Feld | `{row, col}` wie Swift: `row 0` = Reihe 8 (oben, Schwarz), `row 7` = Reihe 1; `col 0` = a-Linie |
| Farbe | `K.Color.white = 0`, `K.Color.black = 1`; `K.Color.opposite(c)`, `K.Color.displayName(c)` („Weiss“/„Schwarz“) |
| Figurentyp | `K.PieceType = {pawn:1, knight:2, bishop:3, rook:4, queen:5, king:6}` |
| Figur | `{color, type, hasMoved}` (unveränderlich behandeln, nie mutieren) |
| Zug | `{from:{row,col}, to:{row,col}, capturedPiece:type\|null, promotion:type\|null, isCastling:bool, isEnPassant:bool}` – Gleichheit nur über `from/to/promotion`: `K.moveEq(a,b)` |
| Zugtext (UCI) | `'e2e4'`, `'e7e8q'` (Umwandlung q/r/b/n), Rochade als Königszug `'e1g1'` |
| Spielergebnis | `{kind:'ongoing'\|'checkmate'\|'stalemate'\|'draw', winner:color\|null}` |
| Modus | `'playerVsComputer'`, `'playerVsPlayer'`, `'tutorial'`, `'academy'` (`K.GameMode`) |

### Notation-Helfer

```js
K.posToAlgebraic({row:4,col:4})   // 'e4'
K.algebraicToPos('e4')            // {row:4,col:4}  (null bei Unsinn)
K.moveToUci(zug)                  // 'e2e4' / 'e7e8q'
K.moveToAlgebraic(zug)            // 'e2e4' (ohne Umwandlungsbuchstabe)
K.uciToMoveParts('e7e8n')         // {from, to, promotion:2}  (ohne Regelprüfung)
K.Notation.colLetter(4)           // 'e'
K.CoachTools.san(zug, brett)      // deutsche Kurznotation: 'Sf3', 'exd5', 'Lxc4+', '0-0', 'e8=D#'
K.CoachTools.describe(zug, brett) // 'Springer g1 → f3 (Sf3)'
K.makeMove(from, to, {capturedPiece, promotion, isCastling, isEnPassant})
```

### Figurentexte (`K.Piece`)

`K.Piece.name(t)` („Turm“), `displayName(t)` (mit Hunde-Modus: „Brocken (Turm)“), `value(t)` (100/320/330/500/900/20000),
`symbol(t)` (B S L T D K), `derName/denName/vomName/deinNom/deinAkk/pronoun(t)` („der Turm“, „die Dame“, „vom Springer“ …),
`unicode(t)` (♟♞♝♜♛♚, gefüllte Symbole – Farbe per CSS). `K.cap1('der Turm')` → „Der Turm“.

### Hunde-Team (statt Paw Patrol)

`K.Stil.setzeHunde(true|false)` schaltet **alle** Anzeigenamen/Texte (Coach, Tutorial, Zugwert) um:
„Bruno (Koenig)“, „Luna (Dame)“, „Brocken (Turm)“, „Wurzel (Laeufer)“, „Falko (Springer)“, „Welpe (Bauer)“.
`K.Stil.dogName(t)`, `K.Stil.dogBreed(t)` (Bernhardiner, Windhund, Bulldogge, Dackel, Schaeferhund, Welpe),
`K.HundeTeam.glyph(t)` (Emoji für das 2D-Brett), `K.Stil.hunde` (aktueller Zustand).

---

## 3. Brett (`K.ChessBoard`)

```js
const b = new K.ChessBoard();                 // Startstellung
const c = K.ChessBoard.copyFrom(b);           // unabhängige Kopie (billig)
const f = K.ChessBoard.fromFEN('7k/4P3/8/8/8/8/8/7K w');   // FEN (siehe unten)
b.grid[row][col]                              // Figur oder null
b.piece({row,col})                            // Figur oder null (auch außerhalb → null)
b.allLegalMoves(color)                        // alle legalen Züge ([] bei Matt/Patt)
b.legalMovesFrom({row,col})                   // legale Züge dieser Figur (Zielfelder markieren)
b.findMoveByUci('e7e8n', color)               // Zugobjekt oder null ('e7e8' = Dame)
b.hasLegalMoves(color); b.isInCheck(color); b.isSquareAttacked(pos, byColor); b.findKing(color)
b.executeMove(zug)                            // führt aus (Rochade, en passant, Umwandlung); prüft NICHT die Legalität
b.checkGameResult(nextPlayer)                 // Ergebnis für den, der als Nächstes ziehen müsste
b.isInsufficientMaterial(); b.countMaterial(color)   // Material ohne König, Centibauern
b.boardHash()                                 // Stellungs-Schlüssel (mit Rochaderechten + en passant)
b.halfMoveClock; b.fullMoveNumber; b.enPassantTarget
b.toFEN(sideToMove)                           // volle FEN-Ausgabe
b.toObject() / K.ChessBoard.fromObject(o)     // klonbar (Worker, Speichern)
```

**FEN** (`fromFEN`): 8 Reihen mit `/`, Reihe 8 zuerst; optional ` w`/` b`, ein Rochadefeld (`KQkq`, `-`), ein
en-passant-Feld (`d6`), Halbzug-/Zugzähler. Ohne Rochadefeld gelten – wie in Swift – alle Figuren als ungezogen
(Rochade möglich, wenn König/Turm auf Grundfeldern stehen). `b.sideToMoveFromFen` merkt ` w`/` b`.

**Remis durch dreifache Wiederholung** erkennt `Partie` (Abschnitt 8); für eigene Schleifen:
`hash = b.boardHash() + (amZug === 0 ? 'w' : 'b')` zählen, bei 3 → Remis.

---

## 4. Computergegner (`K.ChessAIEngine`)

```js
const ki = new K.ChessAIEngine(5);            // Stufe 1…10 (wird begrenzt)
const zug = ki.bestMove(brett, K.Color.black);   // Zug oder null – BLOCKIERT (siehe Zeiten unten)
ki.difficulty = 7;
ki.evaluate(brett, farbe)                     // Bewertung in Centibauern aus Sicht von `farbe`
ki.rankMoves(brett, farbe, maxTiefe, knotenBudget, fenster)   // {ranked:[{move,score}], depth}
// Computerzug wie in der Mac-App (Buchzug ab Stufe 4 bei <= 16 Halbzügen, sonst Suche):
K.ChessAIEngine.computerMove(brett, farbe, stufe, verlaufUci)
```

* Stufe 1–4: absichtlich Fehler (72 / 54 / 36 / 18 % zweit-/drittbester Zug), ab 5 nie. Knotenbudget je Stufe:
  1–3: 50 000 · 4: 100 000 · 5: 200 000 · 6: 400 000 · 7: 600 000 · 8: 900 000 · 9: 1 200 000 · 10: 2 000 000.
* Namen der Stufen: `K.Spielstaerke.name(stufe)` → „Sehr leicht“ … „Experte“.
* Zufall austauschbar/seedbar: `K.Zufall.samen(123)`, `K.Zufall.zuruecksetzen()`.
* **Rechenzeit:** immer im **Web-Worker** laufen lassen (Abschnitt 9), nie im UI-Thread (Stufe 10 braucht in Node 2–7 s je Zug).

---

## 5. Coach (`K.ChessCoach`) und Zugwert (`K.ChessMoveRater`, `K.ChessMoveAnalyzer`)

```js
const coach = new K.ChessCoach();
const rat = coach.advise(brett, farbe, verlaufUci, budget=130000);
// → { move, nudge, full, focus:{row,col}|null, dangerSquares:[{row,col}] }
//   nudge = 'Stufe 1: Denkanstoss' (mit '🤔 DENKANSTOSS: '), full = Lösung mit Begründung ('💡 EMPFEHLUNG: …'),
//   focus = Feld zum Markieren (Stufe 1), dangerSquares = orange Ringe, move = Pfeil (Stufe 2)
coach.feedbackAfterOwnMove(davor, danach, zug, farbe)   // {text, danger:[Feld]}   (Lernmodus, nach dem eigenen Zug)
coach.threatReport(danach, davor, zug, verteidiger)      // {text, danger:[Feld]}   (Lernmodus, nach dem Gegnerzug)

const wert = new K.ChessMoveRater().rate(zug, davor, danach, farbe, verlaufUci?);
// → { value: 1…15, text, scoreForMover, bestMove }

const an = new K.ChessMoveAnalyzer();                    // zustandsbehaftet: je Partie eine Instanz, reset() bei neuem Spiel
const r = an.analyze(zug, davor, danach, farbe, istLernmodus);
// → { evalBefore, evalAfter, classification:'brilliant'|'good'|'book'|'neutral'|'inaccuracy'|'mistake'|'blunder',
//     classificationSymbol:'!!' …, classificationName:'Brillanter Zug' …, opening, tactics[], positionalNotes[],
//     bookComment, gameReference, summary (fertiger Text), rating (1–15), ratingText, bestMove }
an.rewind(verlauf, brett)                                // nach „Zug zurück“
```

Hilfen: `K.CoachTools` – `exchangeResult(zug, brett)` (Abtausch-Rechnung SEE, Centibauern), `hangingPieces(farbe, brett)`
(hängende Figuren `[{pos,type,loss,attacker}]` → orange Ringe), `mateInOneMoves(farbe, brett)`, `pawns(cp)` („1,5“).
Taktik/Stellung: `K.ChessTacticsDetector.detectAll(brett, zug, farbe)` → `[Text]`, `K.ChessPositionalAnalyzer.analyze(brett, farbe)` → `[Text]`.
Eröffnungsbuch: `K.ChessOpeningBook.findOpening(verlaufUci)` → `{eco,name,moves,explanation,bookSource}|null`,
`nextBookMoves(verlaufUci)` → `[{move, openingName}]`. Wissen: `K.ChessKnowledgeBase.findConcept('taktik')`, `findFamousGame(eco)`, `stats()`.

---

## 6. Akademie (`K.ChessAcademy`) und Profile (`K.PlayerProfileStore`)

```js
K.ChessAcademy.levelInfo        // 10 × {name:'Stufe 1 · Kinderstufe', subtitle}
K.ChessAcademy.lessons          // 47 Aufgaben {id:'L3-2', level, title, teach, fen, prompt, solutions:['e1d1',…], hint,
                                //              successText, failText, freePlayMoves, freePlayAI, winByMate}
K.ChessAcademy.lessonsForLevel(3); K.ChessAcademy.lessonById('L4-1')
K.ChessAcademy.progress(profil, stufe)       // {done, total, stars}
K.ChessAcademy.isLevelUnlocked(profil, stufe)   // Stufe 1 immer; sonst >= 70 % der Vorstufe gelöst

const store = K.PlayerProfileStore.shared;   // localStorage-Schlüssel 'schach.spielerprofile.v1', Fallback: Arbeitsspeicher
store.createOrGet('Mia')   // → Profil-KOPIE {name, createdAt, lessonProgress:{'L1-1':{completed,attempts,stars}}, lastLevel, gamesPlayed}
store.update(profil); store.profile('mia'); store.removeProfile('Mia'); store.names(); store.profiles
K.profileTotalStars(profil)
```

Profile sind – wie Swift-Structs – **Kopien**: ändern, dann `store.update(profil)`.
`new K.PlayerProfileStore({storage: null})` = nur Arbeitsspeicher (Tests / blockierter Speicher).
Bei blockiertem `localStorage` wirft nichts; `store.persistFailed === true` zeigt, dass nichts gespeichert wurde.

---

## 7. Einstellungen

`K.Einstellungen.get(key, default)` / `.set(key, wert)` (localStorage `schach.kern.<key>`, try/catch, Fallback Arbeitsspeicher).
Schlüssel wie in der Mac-App: `kiStufe`, `analyseAktiv`, `nameWeiss`, `nameSchwarz`, `autoWenden`, `hundeTeam3D`, …
(`Partie` nutzt `analyseAktiv`, `nameWeiss`, `nameSchwarz`; alles andere ist Sache der Oberfläche.)

---

## 8. Partie – die komplette Spiellogik ohne Oberfläche (`K.Partie`)

Entspricht dem Nicht-UI-Teil von `SchachWindowController`: Modi, Klicks/Auswahl, Zugablauf, Matt/Patt/Remis/Wiederholung,
Zug-zurück-Schnappschüsse, Tipp in zwei Stufen, Zugwert, Computerzug (mit Eröffnungsbuch), Akademie-Aufgaben und Freispiel,
Namen. Die Oberfläche zeichnet und hört auf **Ereignisse**.

```js
const rechner = new K.WorkerRechner('kern/worker.js');    // oder new K.LokalerRechner() (Node/Tests)
const partie = new K.Partie({ rechner });                 // autoComputer:false → Computerzug erst nach computerZugAusfuehren()
partie.on('brett', z => zeichne(z));                      // z = partie.zustand()
partie.on('status', d => statusZeile.textContent = d.text);
partie.neuesSpiel({ modus: 'playerVsComputer', stufe: 5, weissName: 'Seb', analyse: true });
```

### Starten

| Aufruf | Wirkung |
|---|---|
| `partie.setzeNamen(zweiSpieler, {weiss:{name,tag:'koenig'\|'dame'}, schwarz:{…}} \| null)` | wie die Namensabfrage (null = „Ohne Namen“; 1 Spieler → Schwarz = „Computer“); merkt die Namen |
| `partie.neuesSpiel({modus, stufe, weissName, schwarzName, analyse, lektion})` | `startGame()`; Lernmodus: Stufe 3, Analyse an, Eröffnungs-Tipp |
| `partie.start()` | neues Spiel mit den aktuellen Einstellungen (Knopf „Nochmal“) |
| `partie.setzeAnalyse(bool)` | Schalter „💬 Zugwert“ |
| `partie.difficulty = n` | KI-Stufe ändern (Regler) |

### Eingaben

| Aufruf | Wirkung |
|---|---|
| `partie.handleClick(row, col)` | Auswahl/Abwahl/Zug. Rückgabe `{typ:'auswahl', von, ziele}` · `{typ:'abwahl'}` · `{typ:'ignoriert'}` · `{typ:'zug', zug}` · `{typ:'umwandlung', zuege:[4 Züge]}` |
| `partie.playerMove(zug)` | Zug ausführen (Umwandlung: den gewählten der 4 Züge übergeben; in Akademie-Aufgaben wird er gegen die Lösung geprüft) |
| `partie.playerMoveUci('e2e4')` | dasselbe per Text (Tests, Zugeingabe) |
| `partie.computerZugAusfuehren()` | den **bereits berechneten** Computerzug spielen – nach der Zuganimation aufrufen |
| `partie.undoMove()` / `partie.kannZuruecknehmen()` | Knopf „↶ Zurück“ (nicht in der Akademie) |
| `partie.showHint()` | 💡: 1. Aufruf Denkanstoss, 2. Aufruf Lösung mit Pfeil; gibt ein Promise zurück |
| `partie.hideCoachBubble()` | Sprechblase schließen |

### Ereignisse (`partie.on(name, fn)`, `partie.off(name, fn)`)

| Name | Daten | Bedeutung |
|---|---|---|
| `brett` | `partie.zustand()` | neu zeichnen: `{brett, ausgewaehlt, ziele:[Feld], letzterZug, schach:Feld\|null, hinweisPfeil:Zug\|null, gefahrFelder:[Feld], fokusFeld, amZug, spielVorbei, material:{weiss,schwarz}, status, tippKnopf}` |
| `status` | `{text}` | Statuszeile („Anna ist am Zug“, „Schach! …“, „Computer denkt nach...“) |
| `zug` | `{zug, ziehender, vorher, nachher, mensch}` | ein Zug wurde ausgeführt → Animation/Kampfszene (`vorher`/`nachher` = Bretter) |
| `computerDenkt` | – | Computer rechnet |
| `computerZugBereit` | `{zug}` | Zug berechnet; Animation des Spielerzugs abwarten, dann `computerZugAusfuehren()` |
| `erklaerung` | `{text}` | Text fürs Coach-/Erklärungsfeld (Lernmodus, Akademie) |
| `analyseText` / `analyseTitel` | `{text}` | Zugwert-Feld (Zusammenfassung / Titel „Seb: Springer g1-f3 · Zugwert 12/15 !“) |
| `zugwert` | `{zug, ziehender, analyse}` | volles Analyse-Objekt (rating, classification, bestMove …) |
| `bewertung` | `{wert}` | Bewertungsbalken, in Bauern aus Sicht von Weiss (−50…+50) |
| `coachBlase` / `coachBlaseAus` | `{text, titel, inhalt}` | Sprechblase über dem Brett (außerhalb des Lernmodus) |
| `tippKnopf` | `{text}` | Beschriftung: „💡 Tipp“ → „⏳ Coach …“ → „💡 Lösung“ |
| `spielende` | `{art:'matt'\|'patt'\|'remis'\|'wiederholung'\|'gewonnen', text, gewinner}` | Meldung (nicht in der Akademie) |
| `ansicht` | `{vonSchwarz, automatisch?}` | Brett drehen: bei Spielstart `vonSchwarz:false`; im 2-Spieler-Modus nach jedem Zug mit `automatisch:true` (nur drehen, wenn „Automatisch wenden“ an) |
| `zugZurueck` | – | nach `undoMove()` |
| `lektionStart` / `lektionGeloest` / `lektionFehlgeschlagen` | `{lektion, sterne?, versuche?, durchschnitt?}` | Akademie |

### Akademie über `Partie`

```js
partie.setzeProfil('Mia');                    // createOrGet im Profilspeicher
partie.startLesson(K.ChessAcademy.lessonById('L4-1'));   // lädt die FEN, zeigt Lehrtext/Aufgabe (Ereignisse 'erklaerung', 'status')
partie.playerMove(zug);                       // prüft die Lösung; Ergebnis: partie.letzterVersuch = {richtig, sterne}
partie.showLessonHint();   partie.retryLesson();   partie.naechsteLektion()   // Lektion oder null (= Stufenübersicht)
```
Sterne: 3 Sterne beim 1. Versuch, 2 bei Versuch 2–3, sonst 1. Spielpraxis (L8-5, L9-5, L10-5): KI spielt Schwarz, Zugwerte werden
gemittelt, Bestehen ab Ø 8/15 (L10-5: 9/15) oder Gewinn; L9-5 nur mit Matt. Gespeichert wird beim Lösen automatisch.

### Warten (Tests, Skripte)

`await partie.warteAufFertig()` – bis keine Hintergrundrechnung mehr läuft. Mit `autoComputer:true` zieht der Computer sofort
(`computerVerzoegerung` in ms optional).

---

## 9. Rechner: Worker oder lokal

Alle schweren Aufgaben laufen über einen „Rechner“ mit `ausfuehren(job, args) → Promise`:

* `new K.WorkerRechner('kern/worker.js')` – Web-Worker (lädt die Module selbst per `importScripts`; fällt bei Fehlern, z. B. `file://`,
  auf lokales Rechnen zurück – dann ruckelt die Oberfläche, aber das Spiel läuft).
* `new K.LokalerRechner()` – im selben Thread (Node, Tests).

Aufträge (alle Argumente klonbar; Bretter als `brett.toObject()`): `computerZug {brett,farbe,stufe,verlauf}` → `{zug}`,
`coachRat {brett,farbe,verlauf,budget?}` → CoachAdvice, `analyse {…}`, `analyseReset`, `analyseRewind`, `bewerteZug {zug,davor,danach,farbe,verlauf}` → MoveRating.
`Partie` benutzt sie selbst; direkt braucht man sie nur ohne `Partie`:

```js
const {zug} = await rechner.ausfuehren('computerZug', {brett: b.toObject(), farbe: 1, stufe: 5, verlauf: ['e2e4']});
```
Der Worker hält eigenen Coach-/Analyse-Zustand (eine Instanz je Worker) – pro Spielfenster **einen** Rechner verwenden.

---

## 10. Nicht im Kern (Sache der Oberfläche)

Brettfarbthemen, Figuren-Zeichnung, 2D-/3D-Animationen und Kampfszenen, Brett wenden/Kamera, Dialoge (Namen, Umwandlung),
Fenster-Layout, Menüleiste, Töne. Die Mac-App-Texte dafür (z. B. „🧊 3D-Brett“) stehen nicht im Kern.
Der Lernmodus-Eröffnungstext erwähnt „🧊 3D-Brett“ und „🔄“ wörtlich wie im Original (`tutorial.getOpeningTip()`).

## 11. Zeiten (Node 22, 1 Kern, Last durch andere Agenten) – siehe `PORTIERUNG.md`, Abschnitt „Leistung“
