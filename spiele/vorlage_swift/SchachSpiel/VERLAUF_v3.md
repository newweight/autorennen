# Verlauf SchachSpiel v3 (Claude, 25.09.2026)

## Auftrag
Echtes 3D, Brett drehbar, Lernmodus (Empfehlungen) + Kampfszenen ueberarbeiten, Lernmodus insgesamt verbessern.

## Befund v2.9 (Code-Pruefung)
- Tipp nutzt KI Stufe 4 -> 18 % absichtlich zweit-/drittbester Zug als "bester Zug" empfohlen
- Tipp laeuft synchron im Main-Thread (UI friert bis zu Sekunden)
- Erklaerungen ignorieren Deckung (kein Abtausch-Rechnen)
- moveCount im Tutor zaehlt Tipp-Klicks statt Zuege
- Lernmodus-Layout: Erklaerungspanel liegt unter dem Brett (bottomH = max statt Summe)
- Zugwert: nur 1 Halbzug ohne Ruhesuche; Analyse synchron -> Animation ruckelt
- Kein App-Menue (kein Cmd-Q), Brett nicht drehbar
- Rochade prueft Turmfarbe nicht (nur FEN-Sonderfall)

## Schritte
- [x] Code gelesen (5363 Zeilen)
- [x] Build-Weg geprueft: .command per Doppelklick im Finder; macOS 26.7, Swift 6.3.1 (CommandLineTools) vorhanden
- [ ] Code v3 schreiben (Coach/SEE, 3D SceneKit, Kampfszenen, Lernmodus-UI, Menue, Brett-Wenden)
- [x] Versionssuche (Spotlight, _suche.log): 2 Kopien gefunden
  - Desktop/Spiele/SchachSpiel/SchachSpiel.swift – 20.07.2026, 5363 Zeilen, v2.9  <- NEUESTE, Basis fuer v3
  - Desktop/Unklar/?/nochordnen/BrowserOS/SchachSpiel/SchachSpiel.swift – 03.03.2026, 1624 Zeilen (alt)
  - SchachSpiel_Dokumentiert_2026-03-03.zip (alt, liegt nur in iCloud)
  - App-Binary in Spiele enthaelt nur Texte aus der v2.9-Quelle -> keine neuere Quelle verloren
- [x] Engine: rankMoves() (alle Zuege exakt bewertet, ohne Anfaenger-Wackler, Knotenbudget)
- [x] Zugwert 1-15: echte Suche + Ruhesuche, Matt-Faelle, Begruendung ("Problem: Dame haengt")
- [x] Analyse-Klassifizierung aus Zugwert (kein falsches "Brillant" mehr bei normalem Tausch)
- [x] CoachTools (SEE-Abtausch, haengende Figuren, Matt-Drohung, deutsche Notation Sf3/0-0)
- [x] ChessCoach: Denkanstoss -> Loesung, Begruendung, erwartete Antwort, Alternativen, Fallen-Warnung
- [ ] 3D-Brett (SceneKit) + Kampfszenen
- [x] Sicherung v2.9 (Quelle + App) in Sicherung_v2.9/
- [x] v3-Code geschrieben & auf den Mac kopiert (7.6k Zeilen): 3D-Brett, Kampfszenen, Coach-UI, Zurueck, Menue, Wenden
- [ ] Bauen mit _bauen.command (Log: _bau.log) – Fehler beheben
- [x] Bau 1: Hauptcode fehlerfrei, App gebaut; Testdatei Namenskonflikt behoben
- [x] Hinweis: Dateiuebertragung Container->Mac nur mit NEUEM Staging-Pfad zuverlaessig (md5 pruefen!)
- [x] Bau 2 (22:20): Typpruefung OK, 123/123 Smoke-Tests bestanden (inkl. 25 neue v3-Tests), App gebaut + signiert
- [ ] App starten, 3D/Kampf/Coach/Wenden per Bildschirmfoto pruefen
- [x] Live-Test 1: 3D, Zug, Kampf, Coach-Denkanstoss+Loesung, Lernmodus-Layout funktionieren
- [x] Fixes Runde 2: Kopfleiste unter Titelleiste, Belichtung, Kamera flacher, Figuren 12% groesser,
      Springer im Dreiviertelprofil, Grab naeher, Menue-Scroll+Spielstaerke-Label, Coach: Hauptvariante statt
      Randbauern (Buch nach Haeufigkeit, nur prinzipielle Zuege in der Eroeffnung), Coach schneller (130k Knoten),
      Bewertung: Randbauern weniger Bonus, Zentrum/Entwicklung staerker
- [x] Live-Test 2: Wenden (3D+2D), Kampfszenen Bauer/Dame/Springer, Zugwert-Begruendung ("Dame auf d5 kann geschlagen werden"), Zurueck, Coach schnell (~2 s, empfiehlt Sf3)
- [x] Fixes Runde 3: Namensschild blockierte Klicks, Grab naeher, Letzter-Zug-Farbe, Grammatik (die Dame/den Turm), Koenigsschutz in der Bewertung (f3 nicht mehr "sehr stark"), f-Bauer-Warnung
- [ ] Nutzer-Wunsch Paw Patrol in 3D: abgelehnt (geschuetzte Figuren), eigenes Hunde-Team angeboten – Antwort offen
- [x] Fixes Runde 4: Hauptmenue kompakter + Scrollbalken; NEUERUNGEN_Version3.md geschrieben; finaler Bau folgt
- [x] Finaler Bau 22:34: 123/123 Tests, keine Warnungen, App gebaut. Menue geprueft. Paw-Einstellung wieder auf AN (war beim Testen versehentlich umgeschaltet)
- [x] Hilfsdateien (_probe, _suche) nach _hilfsdateien/ verschoben
## Offen
- Paw Patrol in 3D: abgelehnt; Angebot eigenes 3D-Hunde-Team wartet auf Antwort
- Bekannt: Zugwert-Engine rechnet nur 2 Halbzuege tief -> positionelle Feinheiten (z.B. f3) werden milde bewertet; Coach warnt aber explizit

## Runde 2 (Auftrag: "MACH BEIDES")
- [ ] Zugwert genauer: Suche 3 Halbzuege + Eroeffnungsprinzipien (f3/Randbauern/fruehe Dame max. 9-10 Punkte)
- [ ] Statuszeile: Schrift passt sich an, 2 Zeilen statt Abschneiden
- [ ] Eigenes 3D-Hunde-Team (selbst erfunden): Bruno (Bernhardiner, Koenig), Luna (Windhund, Dame),
      Brocken (Bulldogge, Turm), Wurzel (Dackel, Laeufer), Falko (Schaeferhund, Springer), Welpen (Bauern)
- [x] Code v3.1 geschrieben: Hunde-Team (Koepfe, Accessoires, Halsband+Plakette, WUFF!), Knopf 🐶 im 3D / 🐾 im 2D,
      Menue Darstellung > Hunde-Team (⌘D), FitLabel-Statuszeile, Zugwert 3 Halbzuege + Eroeffnungsprinzipien, 9 neue Tests
- [ ] Bau v3.1
- [x] Bau v3.1: 134/134 Tests (1.f3 jetzt <= 8 mit Begruendung), Hunde-Team sichtbar, Statuszeile 2-zeilig. Koepfe danach 35-50 % groesser
- [x] Wunsch: Hundegesichter schauen immer zum Betrachter (Billboard um Hochachse, auch Plakette)
- [x] Test: Gesichter folgen der Kamera (auch beim Wenden). Version 3.1 in Info.plist + NEUERUNGEN; letzter Bau folgt
- [x] Finaler Bau v3.1 (22:50): 134/134 Tests, App-Version 3.1
## Offen
- nichts Zwingendes. Bekannt: Hunde-Modus nur im 3D-Brett, Paw-Figuren nur im 2D-Brett
- [x] Startknopf: Desktop/Spiele/'♟ Schach starten' (Verknuepfung auf SchachSpiel.app, zeigt immer auf die aktuelle Version) – per Doppelklick getestet
- [x] Alte Version (Desktop/Unklar/?/nochordnen/BrowserOS/SchachSpiel, 03.03.2026, 1624 Zeilen + App) auf Wunsch geloescht; restlicher BrowserOS-Ordner unveraendert

## 25.09.2026 – 4 Gewinnt: Startknopf + Aufräumen
- Startknopf: Spiele/🔴 4 Gewinnt starten.app → VierGewinnt/VierGewinnt.app (Symlink)
- Gelöscht: VierGewinnt/Sicherung_v2.0 (v2.0), Spiele/VierGewinnt.app (Doppel), Programme/Apps-Installer/VierGewinnt.app (v1.0, März) + toter Alias „VierGewinnt“
- _bauen.command baut nur noch in VierGewinnt/VierGewinnt.app
- Einzige Version jetzt: v2.1 (Binary md5 173f624f…)

## 25.09.2026 – Alte Versionen Schach/Dame/Mastermind entfernt (in den Papierkorb, wiederherstellbar)
- Schach: Sicherung_v2.9, SchachSpiel_Dokumentiert_2026-03-03.zip, DOKUMENTATION_SchachSpiel.md (v1, März)
- Dame: DameSpiel_alt_2026-09-25.swift, lose Datei DameSpiel (Bau-Zwischenprodukt), Kopie Unklar/?/nochordnen/BrowserOS/DameSpiel (März)
- Mastermind: mastermind_alt/icon_alt, __pycache__; 21 Kopien in Downloads, 20 in Desktop/PerplexityAusgabe, 20 in KI-Ausgaben/PerplexityAusgabe, Desktop/Mastermind/Mastermind_8.zip (alle März–Juni)
- NICHT gelöscht: Desktop/Mastermind/Mastermind-Neu (eigene Browser-Version, 19.07.) und mastermind-App-Quelltext – Rückfrage offen
- Fehlgeschlagen: Desktop/Mastermind/Mastermind.zip (mv: No such file, iCloud)
- Protokoll: _hilfsdateien/_papierkorb7.log
- 21:43: Desktop/Mastermind wurde (nicht von mir) nach Spiele/Mastermind/Mastermind verschoben – darin Mastermind-Neu (Web, Juli), mastermind-App-Quelltext (Electron, März), Mastermind.zip (März). Nicht angefasst, Rückfrage offen.
