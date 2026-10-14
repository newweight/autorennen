# SchachSpiel Version 3.1 – Neuerungen (25.09.2026)

## 🆕 v3.1

- **🐶 Eigenes 3D-Hunde-Team** (frei erfunden): Bruno der Bernhardiner mit Krone = König, Luna der
  Windhund mit Diadem = Dame, Brocken die Bulldogge mit Burghut = Turm, Wurzel der Dackel mit
  Bischofsmütze = Läufer, Falko der Schäferhund mit Federbusch = Springer, Welpen = Bauern.
  Sockel in Elfenbein/Ebenholz, Halsband in Teamfarbe (Gold/Silber) mit Plakette, die die
  Schachfigur zeigt. Die Hundegesichter schauen **immer zum Betrachter** – auch beim Drehen des
  Bretts. Beim Schlagen gibt es ein Comic-„WUFF!“. Knopf „🐶 Hunde“ (im 3D-Brett; im 2D-Brett
  bleibt dort „🐾 Paw“), Menü „Darstellung → Hunde-Team (3D)“ (⌘D). Im Lernmodus stellt der Coach
  das Team vor, und Texte nennen die Hundenamen („Brocken (Turm)“)
- **Zugwert genauer**: 3 statt 2 Halbzüge Vorausschau und Eröffnungsprinzipien. 1.f3 bekommt jetzt
  höchstens 8/15 mit Begründung („Der f-Bauer schützt deinen König …“), Randbauern höchstens 10,
  frühe Dame/Turm/König 8–9. Als „besser“ nennt die Bewertung dann einen prinzipiellen Zug
- **Statuszeile schneidet nichts mehr ab**: Schrift passt sich an, notfalls zwei Zeilen
- 134 Smoke-Tests (11 neue), alle bestanden

## v3.0

Basis: v2.9 vom 20.07.2026 (neueste gefundene Version; Sicherung in `Sicherung_v2.9/`).

## 🧊 Echtes 3D-Brett (SceneKit)

- Gedrechselte Staunton-Figuren (Elfenbein/Ebenholz) mit Zinnen, Krone, Kreuz, Läufer-Kerbe und
  Pferdekopf im Dreiviertelprofil. Weiche Schatten, Spiegelung auf dem Holztisch, HDR-Licht
- **Kamera frei drehbar**: Maus ziehen (oder Rechtsklick ziehen) = drehen/neigen, Scrollen/Pinch = Zoom,
  Trackpad-Drehgeste = drehen, ⌘0 = Kamera zurücksetzen
- **🔄 Wenden** (⌘R): Kamerafahrt auf die Seite von Schwarz und zurück – funktioniert auch im 2D-Brett.
  Menü „Darstellung → Automatisch wenden (2 Spieler)“ dreht nach jedem Zug zum Spieler am Zug
- Anklicken der Figuren direkt im 3D-Raum, Zielfelder als grüne Punkte, Schlagfelder als rote Ringe
- Geschlagene Figuren liegen neben dem Brett
- Namensschilder schweben über der getauften Figur
- **🧊 3D-Brett ●/○** schaltet zwischen 3D und klassischem 2D-Brett um (⌘3). Paw-Patrol-Figuren gibt es
  nur im 2D-Brett

## 💥 Neue Kampfszenen (je nach angreifender Figur)

| Angreifer | Szene |
|---|---|
| Springer | Salto-Sprung, landet auf dem Opfer, das in Splitter zerbricht (echte Physik) + Staubring |
| Turm | Anlauf als Rammbock, das Opfer fliegt im hohen Bogen vom Brett |
| Läufer | Ausholen, Lichtschwert-Hieb, das Opfer zerfällt |
| Dame | Steigt auf und dreht sich, das Opfer schwebt, leuchtet violett und implodiert |
| Bauer / König | Anlauf, Ausholen, Stoß – das Opfer kippt um und versinkt |

Dazu Funken, Lichtblitz und Kamerawackeln. **💥 Kampf ●/○** schaltet die Szenen ab (⌘K).
Der Computer rechnet während der Szene weiter und zieht erst, wenn sie fertig ist.

## 🧑‍🏫 Lernmodus komplett überarbeitet

- **Tipp in zwei Stufen**: 1× 💡 = Denkanstoß (Figur gelb markiert, Lösung bleibt geheim),
  2× 💡 = Lösung mit grünem Pfeil, Begründung, erwarteter Antwort des Gegners, Alternativen,
  Fallen-Warnung und Stellungsbewertung
- **Fehler behoben:** Der Tipp nutzte bisher die KI-Stufe 4, die zu 18 % absichtlich den zweit- oder
  drittbesten Zug spielt – der „beste Zug“ war also manchmal gar nicht der beste. Der Coach rechnet jetzt
  mit eigener, fehlerfreier Engine im Hintergrund (Oberfläche bleibt flüssig)
- **Tauschrechnung (SEE)**: Der Coach weiß, ob eine Figur gedeckt ist. „Guter Tausch“ nur noch, wenn man
  nach dem Zurückschlagen wirklich vorn liegt; sonst Warnung „Die Dame war gedeckt …“
- **Warnungen nach jedem Zug**: hängende Figuren (orange Ringe), Mattdrohungen, f-Bauer-Schwäche
- **Nach dem Computerzug**: „Der Gegner spielte Sc6. Er droht …“ – zusammen mit der Rückmeldung zum
  eigenen Zug
- **↶ Zurück** (⌘Z): Züge zurücknehmen (im Lernmodus als Knopf, sonst über das Menü)
- In der Eröffnung empfiehlt der Coach die Hauptvariante aus dem Buch und nur prinzipielle Züge
  (vorher u. a. 1.b4 oder 1.a4)
- **Layout-Fehler behoben**: Das Brett verdeckte das Erklärungsfeld zum größten Teil. Jetzt stehen
  Coach und Analyse nebeneinander (bzw. gestapelt bei schmalem Fenster)

## 💬 Zugwert 1–15 genauer

- Echte Vorausschau mit Ruhesuche statt 1 Halbzug: Ein gedeckter Tausch gilt nicht mehr als Fehler,
  ein Zug in eine Gabel schon
- Bei Fehlern: besserer Zug in deutscher Notation (z. B. „Dd7“) **und** der Grund
  („Problem: Deine Dame auf d5 kann geschlagen werden“)
- Verpasstes oder zugelassenes Matt wird erkannt
- „Brillant !!“ nur noch bei echten Bestzügen (vorher bei jedem normalen Abtausch)
- Analyse läuft im Hintergrund – Animationen ruckeln nicht mehr

## ♟ Engine

- Bewertung: Randbauern bekommen weniger Vorrück-Bonus, Zentrum und Entwicklung zählen mehr,
  Königsschutz (f/g/h-Bauern) wird berücksichtigt
- Computer denkt parallel zur Animation, eigene Engine-Instanz pro Zug (kein Konflikt beim Neustart)

## 🖥 Oberfläche

- **Menüleiste** (vorher gab es keine – nicht einmal ⌘Q): Spiel (Neu ⌘N, Zurück ⌘Z, Tipp ⌘T,
  Kommentare ⇧⌘K, Hauptmenü ⇧⌘M), Darstellung (Wenden ⌘R, 3D ⌘3, Kampf ⌘K, Kamera ⌘0,
  Brettfarbe ⌘B, Vollbild), Bearbeiten (Kopieren/Einsetzen in Namensfeldern)
- Kopfleiste lag teilweise unter der Titelleiste – behoben
- Hauptmenü startet oben (war nach unten gescrollt), Spielstärke-Anzeige war leer – behoben
- Computer-Spielstärke wird gespeichert und nicht mehr vom Lernmodus überschrieben
- Grammatik in Taktik-Texten („die Dame“, „den Turm“)

## ✅ Qualitätssicherung

- 123 Smoke-Tests (101 bisherige + 22 neue: Tauschrechnung, hängende Figuren, Notation, Coach findet
  Matt in 1, Coach verrät im Denkanstoß nicht die Lösung, Brett wenden, 3D-Figuren, 3D-Kampfszene
  start- und abbrechbar) – alle bestanden
- Live auf dem Mac getestet: 3D, Wenden, Kampfszenen Bauer/Dame/Springer, Coach, Zurück, 2D-Umschaltung

## ▶️ Bauen

Doppelklick auf `_bauen.command` (schreibt alles nach `_bau.log`, kein Enter nötig) oder wie bisher
`SchachSpiel-Testen-und-Bauen.command`.
