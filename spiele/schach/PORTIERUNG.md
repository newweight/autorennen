# Schach – Oberfläche der Swift-App im Browser (Port)

Vorlage: `spiele/vorlage_swift/SchachSpiel/SchachSpiel.swift` (+ `NEUERUNGEN_Version2/3.md`). Ziel: Aussehen, Texte, Abläufe zu ca. 95 % wie die Mac-App.
Logik: `kern/` (Partie, KI, Coach, Akademie – siehe `kern/API.md`), 3D-Brett: `3d/` (siehe `3d/API.md`). Dieses Dokument beschreibt nur die **Oberfläche**.

## Dateien

| Datei | Inhalt | Swift-Vorbild (Zeilen) |
|---|---|---|
| `index.html` | lädt Three.js, `3d/*`, `kern/kern-alles.js`, `gemeinsam/konstanten.js` + `netz.js`, QR, dann die vier Dateien unten | – |
| `schach-brett2d.js` | `SchachUI`: 6 Brett-Farbthemen, `EvalBar`, `MiniBrett`, `Brett2D` (Canvas), eigene Hundeköpfe | 3489–3806, 5942–6314 |
| `schach-app.js` | Hauptmenü, Namensdialog, Spielfenster, Schalterleiste, Statuszeile, Coach-Blase, Analysefeld, Umwandlungsdialog, Akademie, Training, Tastenkürzel, Menü-Knopf | 6314–8297 |
| `schach-app.css` | Farben/Abstände der Mac-App (CSS-Variablen oben), Handy-Regeln | – |
| `schach-online.js` | **Zusatz** (nicht in der Mac-App): Online-Spiel im selben Spielfenster | – (Protokoll: `server/PROTOKOLL.md`) |
| `_alt_standardregeln/` | Sicherung der früheren Oberfläche (Standardregeln-Version), weiter lauffähig unter `/spiele/schach/_alt_standardregeln/` | – |

Genau **eine** `WorkerRechner`-Instanz (`kern/worker.js`) und **eine** `Partie` für alle Modi – KI und Coach rechnen im Web Worker, die Oberfläche bleibt flüssig (ohne Worker, z. B. `file://`, rechnet der Kern auf dem Hauptthread).

## UI-Mapping (Swift → Browser)

| Swift | Browser |
|---|---|
| `showMainMenu` (Titel, Untertitel, `MiniChessBoardView`, Menükarten, Figuren-Legende) | `showMenu()` – gleiche Texte/Reihenfolge; Karten: Spieler vs Computer (mit Stärke-Regler 1–10 und „Spiel starten“), Spieler vs Spieler, Schach-Akademie 🎓, Training mit Coach ♟; **zusätzlich** „Online spielen“ |
| `askPlayerNames` (NSAlert mit Namensfeld + Figurenwahl König/Dame) | `namenDialog()` – HTML-Dialog im NSAlert-Stil, Namen werden gemerkt; „Ohne Namen spielen“ |
| `startGame` + `relayoutGame` | `spielAufbauen(modus)` + `layout()`: Kopfleiste, Schalter, Brettfläche, unteres Panel (Coach/Analyse) |
| `ChessBoardView` | `SchachUI.Brett2D`: Highlights in Swift-Reihenfolge (letzter Zug, Schach, Ziele, Auswahl), Punkte/Ringe, orange Warn-Ringe, gelber Fokus, Tipp-Pfeil, Namensschildchen, Koordinaten, Schatten |
| `EvalBarView` | `SchachUI.EvalBar` (−5 … +5, Zahl mit Vorzeichen) im Analysefeld |
| `PromotionDialog` | `umwandlungFragen()` – Dame/Turm/Läufer/Springer, Tasten D/T/L/S (auch Q/R/B/N); mit Hunden: „Dame - Luna“ usw. mit Hundebild |
| Statuszeile (FitLabel) | `fitStatus()` – schrumpft die Schrift (14 → 11,5 pt), bricht sonst um |
| Knöpfe 💬 Zugwert · 🎨 Farben · 🐶 Hunde · 🧊 3D-Brett · 💥 Kampf · 🔄 Wenden · 💡 Tipp · ↻ Neu · ↶ Zurück | `schalterHtml()` – gleiche Beschriftung mit ●/○, gleiche Farben (grün / braun / blau / gold) |
| Coach-Tipp (2 Stufen: Denkanstoß → Empfehlung mit Pfeil) | `showHint()` → `partie.showHint()`; Blase unten über dem Brett, ✕ schließt |
| Zugbewertung 1–15 (einschaltbar) | 💬 Zugwert → Analysefeld mit Bewertungsbalken, Text pro Zug (aus `kern/bewertung.js`) |
| Zug zurücknehmen | `partie.undoMove()` – im Training als Knopf „↶ Zurück“, sonst Menü ☰ / Taste **Z** |
| Schach-Akademie (Profil wählen/anlegen, 10 Stufen, Aufgabenliste, Sterne, Sperre bei < 70 %) | `showAcademyHome/Levels/LessonList/startLesson`; Fortschritt in `K.PlayerProfileStore` (localStorage) |
| Training mit Coach (Tutorial: Erklärung nach jedem Zug) | `startTutorial()` – Panel „🧑‍🏫“ unten |
| 3D-Brett (`board3D`), Hunde, Kampfszenen | `ensure3D()` / `toggleBoard3D()` … → `Schach3D` aus `3d/`; im 2D-Modus Hundeköpfe + `Animation2D` |
| Auto-Wenden bei „Spieler vs Spieler“ | `S.autoFlip` (Taste **A**), Brett dreht nach jedem Zug |
| Menüleiste (⌘N, ⌘Z, …) | ☰-Knopf oben links → Dropdown mit denselben Befehlen und Kürzeln |
| Fenster-Vollbild | Menüpunkt „Vollbild“ (Taste **F**) |

### Tastenkürzel (⌘ entfällt, Einzeltasten wie im Dropdown angezeigt)
`N` Neues Spiel · `Z`/Rücktaste Zug zurücknehmen · `T` Tipp · `Umschalt+K` Zugwert-Kommentare · `M` Hauptmenü · `R` Brett wenden · `A` Auto-Wenden · `3` 3D-Brett · `K` Kampfszenen · `D` Hunde-Team · `0` Kamera zurücksetzen · `B` Brettfarbe · `F` Vollbild · `Esc` Blase/Menü schließen.

## Online-Modus (Zusatz im Stil der App)

Menükarte „Online spielen“ → Lobby (Tiername, Seitenwahl Weiß/Schwarz/Zufall, Raum erstellen / Code eingeben / Zuschauen) → Warteraum (Code, QR, Link) → Spiel im **gleichen Spielfenster** wie lokal → Endedialog mit Revanche (Farben tauschen). Protokoll unverändert (`/ws-brett`, `server/brettspiele.js` – der Server prüft jeden Zug und kennt die Standardregeln, das ist für die Online-Partie maßgeblich). Raum-Link `?raum=ABCD`, Wiederverbinden nach Reload/Netzabbruch (Sitz im `sessionStorage`).
- Eigene Züge werden **nicht** lokal ausgeführt, sondern gesendet und beim `stand` des Servers angewendet (nie ein Zustand, den der Server nicht kennt).
- **Lokal wählbar** (nur für den eigenen Bildschirm): 3D/2D, Hunde, Kampfszenen, Farben, Wenden.
- **Aus (Fairness):** Coach/Tipp, Zugwert-Kommentare, Bewertungsbalken, Zurücknehmen, Zug-Hinweise. Die Knöpfe fehlen online; im ☰-Menü sind sie nicht vorhanden.
- Namen nur aus der Tierliste (kein Freitext – kindersicher), Namensschildchen am König beider Seiten.

## Bewusste Abweichungen (die „5 %“)

1. **Kein Paw Patrol** (geschützte Marke). Statt dessen das **eigene Hunde-Team**: Bruno (Bernhardiner, Krone) = König, Luna (Windhund, Diadem) = Dame, Brocken (Bulldogge, Burghut) = Turm, Wurzel (Dackel, Bischofsmütze) = Läufer, Falko (Schäferhund, Federbusch) = Springer, Welpen = Bauern. Im 2D-Brett selbst gezeichnete Köpfe (`SchachUI.hundeKopf`), im 3D-Brett die Modelle aus `3d/`. Ein Schalter 🐶 gilt für 2D **und** 3D (Swift: getrennte Logik).
2. **Menüleiste → ☰-Menü** mit Kürzeln ohne Modifikator (⌘ gibt es im Browser nicht frei); keine Fenstergrößen-Logik (Fenster = Browserfenster, responsiv).
3. **SF-Symbols → SVG**, `NSAlert` → HTML-Dialog (Klassen `.alarm`), Systemschrift statt SF (Fallback `-apple-system`, Inter/Helvetica).
4. **Zugliste** (kleiner Streifen unter der Kopfleiste, SAN) – gibt es in der Swift-App nicht, hilft Kindern beim Nachlesen.
5. **„↶ Zurück“**-Knopf nur im Training (wie Swift), sonst Menü/Taste.
6. **2D-Brett zentriert** (Swift: unten ausgerichtet); Brett füllt auf dem Handy die Breite.
7. **Namen** lokal als Freitext (Swift), online nur Tiernamen.
8. **Online-Zusatz** (siehe oben) mit abgeschalteten Hilfen.
9. Ohne WebGL oder Three.js fällt das Brett automatisch auf 2D zurück (mit Hinweis in der Statuszeile).

## Optik-Iterationen
Siehe `VERLAUF.md` („14.10. Agent Schach-Oberfläche Port“) und die Bilder in `tests/out/schach_port/`.

## Tests
`python3 tests/schach_port_ui_test.py` (Menü, Computer Stufe 1/5/10, Tipp, Zugwert, Zurücknehmen, Umwandlung, 3D/2D, Hunde, Kampf, Wenden, Auto-Wenden, Akademie, Training, Online mit 2 Browsern inkl. Revanche/Wiederverbinden, Handy-Größe, iPad) · `node tests/test_schach_kern.js` · `node tests/test_brett_regeln.js` · `node tests/test_brett_netz.js` · `python3 tests/schach3d_test.py` · `python3 tests/brett_ui_test.py` (ruft den Schach-Port-Test mit auf).
