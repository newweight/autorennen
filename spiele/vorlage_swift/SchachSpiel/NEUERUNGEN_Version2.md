# SchachSpiel Version 2.0 – Neuerungen (19.07.2026)

## 🎓 Schach-Akademie: Super-intelligenter Lernmodus mit 10 Stufen

Neuer Menüpunkt **„Schach-Akademie"** – aufgebaut nach dem Vorbild der bewährten
**Stappenmethode** (Brunia/van Wijgerden, das Standardwerk des Schulschachs) und
moderner Lern-Apps wie **ChessKid** und den chess.com-Lektionen:

- **10 Stufen**: Kinderstufe (Figuren kennenlernen) → Schlagen & Werte → Schach! →
  Matt in 1 → Spezialregeln → Taktik I → Taktik II → Eröffnung → Endspiel & Strategie →
  Meisterstufe (berühmte Kombinationen + Meisterprüfung gegen KI Stufe 7)
- **47 interaktive Aufgaben** mit Erklärung (Lernstoff), Aufgabe, Tipp-Knopf,
  Erfolgs-/Fehlertexten und 1–3 Sternen (je nach Versuchen)
- **Spielerprofile mit Namenseingabe**: Das Programm weiß, wie weit jeder Spieler ist.
  Fortschritt wird pro Name dauerhaft gespeichert
  (`~/Library/Application Support/SchachSpiel/spielerprofile.json`)
- **Stufen schalten sich frei** (ab 70 % der Vorstufe), jede Aufgabe ist **jederzeit
  wiederholbar** („zum Wiederholen klicken")
- **Spielpraxis-Aufgaben**: freies Spiel gegen die KI, der Coach bewertet jeden Zug –
  z. B. „Spiele 10 gute Eröffnungszüge (Ø ≥ 8/15)" oder „Matt mit der Dame in 15 Zügen"

## 💬 Zugkommentare mit Wert 1–15 (einschaltbar in jedem Modus)

- Neuer Knopf **„Kommentar ●/○"** – auch bei Spieler vs. Spieler und gegen den Computer
- Jeder Zug erhält einen **Zugwert von 1 (grober Fehler) bis 15 (perfekt)** mit deutscher
  Erklärung – berechnet durch Vergleich mit dem besten Zug (flache Engine-Suche),
  wie es auch chess.com beim „Game Review" macht (dort: Brilliant → Blunder)
- Bei schwächeren Zügen wird der **bessere Zug als Lerntipp** genannt
- Dazu weiterhin: Eröffnungserkennung (ECO), Taktik-Erkennung, Buchwissen aus 20 Büchern

## 🎬 3D-Animation (an/aus)

- Neuer Knopf **„3D ●/○"**: Figuren **heben ab und fliegen in einem Bogen** über das
  Brett (mit Bodenschatten, der mitwandert)
- Beim Schlagen gibt es einen **Kampf**: Das Opfer zittert, Funken und Sterne sprühen,
  die geschlagene Figur schrumpft und kippt weg, der Sieger stampft auf
- Einstellung wird gespeichert

## 👑 Namen für beide Spieler + Figuren-Taufe

- Vor jedem Spiel (auch 2-Spieler!) wird **der Name abgefragt**
- Jeder Spieler wählt, ob sein Name am **König oder an der Dame** steht –
  die Figur trägt dann ein farbiges Namensschild auf dem Brett
- Statuszeile und Materialanzeige zeigen die Namen („Sebastian ist am Zug")

## 🐞 Behobene Fehler

**Von den Smoke-Tests gefundene Engine-Bugs (v2.2 → v2.3):**

- **Teleport-Rochade**: Bei Stellungen aus FEN (Akademie-Aufgaben) wurde die Rochade
  für Könige generiert, die gar nicht auf e1/e8 standen – ein König auf g1 konnte
  nach c1 „teleportieren". Jetzt nur noch vom echten Startfeld aus.
- **Unsymmetrische Bewertung**: Der Zentrumsbonus für Springer/Läufer bevorzugte
  Schwarz (Startstellung wurde nicht mit 0 bewertet). Jetzt exakt symmetrisch.

1. **Abzugsschach-Erkennung war komplett defekt** (verglich eine Figur mit sich selbst,
   Meldung konnte nie erscheinen) → neu geschrieben, erkennt jetzt auch **Doppelschach**
2. **Dreifache Stellungswiederholung**: Stellungen wurden mit der falschen
   Am-Zug-Farbe gespeichert → Remis-Erkennung jetzt regelkonform
3. **Überlappende Bedienelemente** in der Kopfleiste (Material-Anzeige lag unter dem
   Analyse-Knopf) → Layout neu geordnet
4. Analyse-Einstellung bleibt jetzt pro Modus erhalten (wird gespeichert)
5. Toter Code und Compiler-Warnungen entfernt

## ✅ Qualitätssicherung

- **Alle 47 Aufgaben extern verifiziert** (unabhängige Schachbibliothek python-chess):
  Stellungen legal, Lösungen legal, alle „Matt in 1"-Aufgaben sind wirklich Matt,
  „Matt in 2" ist zwangsläufig, Gabeln/Fesselung/Spieß/En-passant/Rochade korrekt.
  Dabei 2 Stellungsfehler gefunden und behoben (L5-5, L9-5: Dame gab schon Schach).
- **Über 80 Smoke-Tests** (`SchachTests.swift`) in 16 Gruppen: Zuggenerierung
  (Perft 20/400/8902), Schäfermatt, Patt, totes Remis, Rochade, en passant,
  Umwandlung, KI-Züge legal, KI findet Matt in 1, Zugwert-Skala 1–15,
  Eröffnungsbuch, Taktik-Erkennung (inkl. Doppelschach-Fix), positionelle Analyse,
  Notation/FEN, Akademie-Stufenaufbau, Profil-Speicherung, Stellungswiederholung –
  **plus Optik-Tests**: Farbthemen, Brett-Geometrie, Animations-Zustand,
  Namensschilder, Fenster-Skalierung, Paw-Patrol-Figuren.

## 🎨 6 Brettfarben zum Umschalten (NEU)

- Neuer **🎨-Knopf** in der Spielleiste: Klassik Grün → Holz → Ozean (blau) →
  Candy (rosa) → Nacht (dunkel) → Turnier Braun – Auswahl wird gespeichert

## 🐾 Paw-Patrol-Modus (NEU, umschaltbar)

- Neuer **🐾-Knopf**: Die Figuren werden zum Hunde-Team!
  **Chase** 🐕‍🦺 = König · **Skye** 🚁 = Dame (fliegt überall hin) ·
  **Marshall** 🚒 = Turm · **Rocky** ♻️ = Läufer · **Rubble** 🚜 = Springer ·
  **Pfötchen** 🐾 = Bauern
- Team-Erkennung über rote (Weiß) bzw. blaue (Schwarz) Chip-Ringe
- Funktioniert überall: im normalen Spiel, in der Akademie und in der 3D-Animation
- **Große Paw-Patrol-Kampfshow** beim Schlagen: Comic-Explosion (Zackenstern),
  herausfliegende Knochen 🦴, Pfoten 🐾 und Sterne, das Opfer zittert und schrumpft,
  der Held hüpft im Sieger-Tanz, dazu „WUFF!"-Comic-Schrift und ein Banner wie
  „💥 Chase schnappt sich Marshall!" – plus Pfotenspuren 🐾 auf dem Flugweg.
  Der Kampf dauert im Paw-Modus extra lang (0,9 s), damit man alles sieht!

## 🆕 Update v2.9 – Die KI ist jetzt DEUTLICH stärker

Live-Test hatte gezeigt: Der Computer spielte Züge, die seine eigene Analyse mit
4/15 bewertete. Drei Ursachen gefunden und behoben:

- **Iterative Vertiefung (FIX #12)**: Vorher lief EINE tiefe Suche, deren
  Rechenbudget mittendrin ausging – spät geprüfte Züge bekamen Schrott-Bewertungen
  und wurden trotzdem gewählt. Jetzt rechnet die KI Tiefe 2, 3, 4, … und nur
  KOMPLETT durchgerechnete Tiefen zählen (wie es echte Engines machen).
- **Ruhe-Suche (FIX #13)**: Die KI bewertete Stellungen mitten im Schlagabtausch
  und „übersah", dass ihre Figur zurückgeschlagen wird (Horizont-Effekt).
  Jetzt werden Schlagfolgen zu Ende gerechnet – keine verschenkten Damen mehr.
- **Eröffnungsbuch für die KI (FIX #14)**: Ab Stufe 4 spielt der Computer echte
  Eröffnungstheorie aus dem eingebauten Buch (300+ Züge) statt zu rechnen.
- Anfängerstufen (1–4) spielen weiterhin absichtlich mal den zweit-/drittbesten
  Zug – aber nie mehr Unsinn.
- Außerdem (v2.6–2.8): Paw-Patrol-Figuren behalten die **echte Schachform**
  (Turm = Turm!), Hund nur als kleines Abzeichen + Namensband im Feld; die
  **Kampf-Animation wird nicht mehr vom Gegenzug des Computers abgebrochen**.

## 🆕 Update v2.5

- **Kopfleiste komplett neu (2 Zeilen)**: Alle Schalter sind jetzt klar beschriftet
  und IMMER sichtbar – „💬 Zugwert", „🎨 Farben", „🐾 Paw Patrol", „🎬 3D",
  „💡 Tipp", „↻ Neu". Nichts wird mehr abgeschnitten, auch beim Verkleinern
  (Mindestbreite gesetzt, Leiste wächst/schrumpft mit).
- **💡 Tipp jetzt in JEDEM Modus**: auch gegen den Computer und bei 2 Spielern –
  der beste Zug wird grün markiert und erklärt.
- **Paw Patrol sind jetzt richtige HUNDE**: Chase 🐕‍🦺 (Polizeihund), Skye 🐩,
  Marshall 🐕, Rocky 🦮, Rubble 🐶 – jeweils mit kleinem Fahrzeug-Abzeichen
  (🚓 🚁 🚒 ♻️ 🚜) in der Chip-Ecke.
- **Beschriftung über jeder Figur** im Paw-Modus: „Marshall · Turm",
  „Rubble · Springer", „Pfoetchen · Bauer" – so lernt man Hundenamen UND
  Schachbegriffe gleichzeitig. Spielernamen-Schilder rutschen dabei unter die Figur.

## 📐 Fenstergröße

- Das Fenster ist **frei vergrößer-/verkleinerbar** – Brett, Figuren, Namensschilder
  und Animationen skalieren automatisch mit (auch Vollbild)

## ▶️ Testen & Bauen

Doppelklick auf **`SchachSpiel-Testen-und-Bauen.command`**:
führt erst alle Smoke-Tests aus und baut danach die App neu.
(Falls macOS meckert: Rechtsklick → Öffnen. Falls „swiftc nicht gefunden":
einmal `xcode-select --install` ausführen.)
