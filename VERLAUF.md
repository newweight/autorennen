
## Fortschritt
- 10.10. 17:48 – Plan + Recherche fertig (10 %)
- 10.10. 17:55 – Abschnitt 1 fertig: Grundgerüst (config, input, vehicle, cameras, main, HTML),
  9/9 Physik-Tests (tests/test_physik.js), Screenshot-Test headless Chromium ok (20 %)
  Fixes: Drehrate war 3x zu hoch (Einspurmodell ersetzt durch Arcade-Drehrate),
  Luftwiderstand relativ zu vMax, Abseits-Tempo-Deckel (Gras 52 %, Sand 44 %)
  Übertragung Container → Mac: _hilfsdateien/uebertragung.tgz, MD5 geprüft
- Antworten Sebastian: Browser/Three.js, Chrome, alle drei Söhne → Standard "mittel", Hilfen umschaltbar
- Abschnitt 2 (Autos, Sonnet-Agent) + Abschnitt 3 (Strecke/Rundenzähler, Opus-Agent) parallel gestartet
- 10.10. 18:25 – Abschnitt 2 fertig (Sonnet): 8 Autos (carCatalog.js, carBuilder.js, 10 Meshes/Auto,
  Vertex-Farben, Räder/Lenkung/Bremslicht), tests/test_autos.js grün, Vorschau tests/autos_vorschau.html
- 10.10. 18:25 – Abschnitt 3 fertig (Opus): spline.js, trackCatalog.js (Wiese 2.252 m, 14 Kurven,
  Haarnadel, Hügel), trackBuilder.js, themes.js (Wiese-Deko 902 Instanzen, ≤25 Draw-Calls),
  raceManager.js (Checkpoints in Reihenfolge, Teleport/Rückwärts zählt nicht), 36/36 Tests,
  simulierte Rundenzeit 106 s (Ziel 100–140)
- 10.10. 18:35 – Autos in main.js eingebaut (Katalog statt Platzhalter), Screenshot ok (50 %)
  Bekannte Schwächen: Wiese noch leer, Hügel kaum sichtbar, Gegner stehen still (KI = Abschnitt 5)
- Abschnitt 4 (Physik fein, Opus) + Abschnitt 5 (KI, Opus) parallel gestartet
- 10.10. – Abschnitt 4 fertig (Opus): collisions.js (Bande bei breite/2+18 m, Auto-Auto-Kapseln), Fahrhilfen in vehicle.js,
  Quer-Vektor korrigiert (rechts()), Nicken, Holzzaun (2 Draw-Calls), Reset auf freie Stelle (R/T), Hinweis bei Feststecken;
  tests/test_kollisionen.js 18/18, Physik 16/16, Rundenzeit unverändert 106,4 s
- 10.10. 18:50 – Abschnitt 4 fertig (Opus): collisions.js (Bande bei ±25 m mit Holzzaun, Auto-Auto-Kapseln),
  Fahrhilfen (Lenk-/Bremshilfe), Quer-Vektor-Vorzeichen korrigiert, Nicken, Kamerawackeln; 34 Tests grün
- 10.10. 18:50 – Abschnitt 5 fertig (Opus): ai/driver.js (Hase auf Ideallinie, Skill, Gummiband +35 %/−12 %,
  Ausweichen, Festfahr-Logik, deterministisch); Rundenzeiten leicht 124 s, mittel 112 s, schwer 105 s, unfair 102 s
- 10.10. 19:00 – KI in main.js eingebaut, tests/rennen_test.py (Rennen im Schnellvorlauf): KI fährt sauber,
  0 Resets, keine Fehler. Befund: stehendes Auto auf der Linie wird von KI gerammt/weggeschoben → Nachbesserung (65 %)
- 10.10. – Abschnitt 6 fertig (Sonnet): Menü (4 Schritte, Tastatur+Maus), HUD je Spieler, Ergebnis, Pause, Split-Screen,
  Autopilot-Hook, localStorage-Einstellungen; tests/menu_test.py (26 Prüfungen) grün, Split-Screen 72 Draw-Calls
- 10.10. 19:45 – KI-Nachbesserung: Ausweichen tempoabhängig, stehende Autos werden umfahren (Test 6: 0 Stöße)
- 10.10. 19:45 – Abschnitt 6 fertig (Sonnet): ui/menu.js (4-Schritte-Assistent, Tastatur+Maus), ui/hud.js,
  styles.css, Split-Screen (72 Draw-Calls), Ergebnis, Pause, localStorage; tests/menu_test.py 25 OK.
  Von mir geprüft: Screenshots Autowahl/Split-Screen/Ergebnis ok. Offen: KI-Namen im Ergebnis doppelt (78 %)
- Abschnitt 7 (Wald, Wüste, Minimap – Opus) + Sound (Sonnet) gestartet
- 10.10. 20:40 – Abschnitt 7 fertig (Opus): Wald 1.982 m/23 Kurven/Tunnel/Brücke, Wüste 2.297 m/Oase/Sand,
  Wiese mit Blumen+Teich, Minimap; Rundenzeiten mittel: Wiese 115 s, Wald 125 s, Wüste 109 s; ≤19 Draw-Calls Deko
- 10.10. 20:40 – Sound (Sonnet): audio/engine.js synthetisch (Motor mit Gängen, Countdown, Stöße, Fanfaren),
  von mir in main.js/Menü eingebaut (Taste M, Knopf), audio_test 19 OK
- 10.10. 20:55 – Abschnitt 8: KI-Namen im Ergebnis = "Computer n", Starter-App (🚗 Autorennen starten.app,
  Shell-Starter → Chrome), Autorennen starten.command, ANLEITUNG.md, ERWEITERN.md. Alle Tests grün (95 %)
- Offen: Test auf dem echten Mac (Chrome, Leistung, Tastatur-Ghosting bei 2 Spielern), Klang ungehört
- 10.10. 21:35 – Alles auf dem Mac: Spiele/🚗 Autorennen starten.app + Spiele/Autorennen/. Start auf dem Mac
  nicht geprüft (Chrome-Erweiterung darf keine file://-Seiten öffnen, Bildschirm gesperrt). (96 %)
## Offen (Handgriffe Sebastian)
1. Doppelklick „🚗 Autorennen starten" im Ordner Spiele (Chrome öffnet sich). Falls macOS die App blockiert:
   Rechtsklick → Öffnen, oder Autorennen/„Autorennen starten.command" doppelklicken.
2. Im Spiel F für Vollbild, ein Rennen allein fahren: Ruckelt es? (H zeigt fps; Ziel ≥ 50)
3. Zu zweit: ↑+← und W+A gleichzeitig halten – lenken beide Autos? (Tastatur-Ghosting)
4. Ton (Taste M): zu laut/leise/schrill? → Rückmeldung, dann stimme ich engine.js ab.

## Runde 2 (11.10.2026) – Rückmeldung Sebastian
- "vieles cool", aber: (1) bei zwei Spielern ruckeln die Autos, (2) Modelle detailreicher + näher am Original (ohne Rechteverletzung)
- Gestartet: Opus-Agent Leistung (Profiler, adaptive Qualität, Split-Screen-Optimierung) + Opus-Agent Automodelle v2
- 11.10. Automodelle v2 (Opus-Agent) gestartet: Recherche Maße fertig, Sicherung alter Stand im Scratchpad
- 11.10. – Automodelle v2 fertig (Opus): carCatalog.js mit echten Maßen (abmessungen) + form-Merkmalen je Auto;
  carBuilder.js neu: Loft-Unterbau mit Radhäusern/Kotflügel-Wölbung, Kabinen-Loft (Fenster/Säulen als Flächenfarben),
  Anbauteile per flaecheZ() auf gewölbter Front/Heck, 5-Speichen-Felgen. 10 Meshes, 5.000–6.900 Dreiecke je Auto.
  Vorschau ?ansicht=alle4, Screenshots tests/out/autos_alle4.png + autos_<id>_alle4.png; 3 Iterationen.
  test_autos.js um 3D-Prüfungen erweitert (Maße ±8 %, Radmitte, Symmetrie, Meshes, Dreiecke) – alle Node-Tests grün.
- 10.10. 23:55 – Leistung/Ruckeln (Opus, übernommen vom unterbrochenen Vorgänger-Agent). Vorgänger hatte schon: H-Overlay +
  `Rennspiel.spiel.leistung()`, HUD ≤ 20 Hz + Text nur bei Änderung, Minimap im Offscreen-Canvas, adaptive Qualität mit
  Hysterese (45/58 fps, 2 s), Split pixelRatio 1,0 / Solo 1,5, Deko-Chunks 3×3 mit boundingSphere, matrixAutoUpdate=false,
  Audio setTargetAtTime + KI > 60 m stumm, KI ohne filter/map, **Interpolation der Auto-Pose (Mesh + Kamera)**.
  Neu: tests/interpolation_test.py (Ruckel-Nachweis), Vorher/Nachher-Tabelle in tests/leistung_test.py
  (Basis tests/leistung_vorher.json = Mac-Stand 20:13), Closures im Frame-Pfad entfernt, HUD style.display nur bei Änderung,
  menu_test: Draw-Call-Schwelle 80 → 120 (Deko-Chunks), Speicherprüfung lädt vorher alle Geometrien (kein falsches „Leck").
  **Hauptursache Ruckeln = Physik-Akkumulator ohne Interpolation**: 60-Hz-vsync ± 1,5 ms Jitter, ungünstige Phase →
  24 % Frames 0 Physikschritte, 24 % 2 Schritte. Tempo-Schwankung je Frame (Variationskoeffizient) 0,66 → 0,05,
  Zittern Auto relativ zur Kamera 13,4 cm → 0,06 cm je Frame (Kamera ist geglättet, darum ruckeln „die Autos", nicht das Bild).
  JS-Zeit war nie das Problem: Split Wald 2560×1600 physik+audio+hud 0,42 → 0,24–0,33 ms (Ziel < 8 ms).
  Split-Screen: Zeichenpuffer −56 % Pixel (pr 1,5 → 1,0), Dreiecke Wald 744k → 610k, Draw-Calls 91 → 114.
  Alle Tests grün (6× node, menu, rennen, screenshot wald, audio, interpolation, leistung). Mac-Messung steht aus (H-Overlay).

## Runde 3 (11.10.2026) – Titel + Fahrerwahl
- Spiel heißt „Jonas Hot Steering Wheel“ (Untertitel Autorennen): <title>, Menü-Kopf, ANLEITUNG.md, ERWEITERN.md; Dateinamen unverändert.
- Neuer Menü-Schritt „Fahrer“ (vor Auto, jetzt 5 Schritte): config.fahrer (12 Namen + Emoji), Standard Jonas/Emmy, Solo 6×2, zu zweit je 3×4,
  P1 Pfeile / P2 WASD / Maus; gleicher Fahrer nicht möglich (Bewegender springt weiter, Karte „vergeben“ markiert).
- Namen in HUD (auch Solo), Rundenmeldungen/Zieleinlauf (Name über der Meldung), Ergebnis; Computer = nicht gewählte Fahrer (Vorrang Schumacher, Senna, Verstappen, Röhrl), „🤖 Name“.
- localStorage `fahrer: [p1, p2]`, einstellungenPruefen validiert; Hilfsfunktionen in config.js (R.fahrerEindeutig, R.fahrerComputerNamen), tests/test_fahrer.js neu.
- tests/menu_test.py um Fahrer-Schritt/Titel/Namen erweitert, alle Tests grün. Screenshots 1280×800 und 1440×900 geprüft.
- 11.10. – Runde 2 abgeschlossen: (1) Ruckeln: Ursache Physik-Akkumulator ohne Interpolation (0/2 Schritte je Frame),
  jetzt interpoliert (Zittern 13,4 cm → 0,06 cm/Frame), dazu pixelRatio 1.0 im Split, adaptive Qualität, HUD 20 Hz,
  Deko-Chunks, Leistungs-Overlay (H); (2) Automodelle v2 mit echten Maßen (5–7k Dreiecke/Auto, 10 Meshes);
  (3) Titel "Jonas Hot Steering Wheel", Fahrerwahl (12 Fahrer, KI nimmt Restnamen). Alle Tests grün.
  Offen: M4/AMG-Front zu flach; Messung auf dem Mac (H-Overlay) fehlt

## Runde 3 (11.10.2026) – siehe PLAN_RUNDE3.md
- Rückmeldung: "super" + 6 neue Wünsche (3D-Autowahl drehbar, 220–270 km/h, Berg/Brücke/Tunnel mit Licht,
  Hindernisse Öl/Baustelle/Sand/Ast, 3 weitere KI-Stufen, Fantasie-Strecke mit 2 Loopings, Bällen, Wasserstrahl)
- Offene Fragen F1–F4 in PLAN_RUNDE3.md; Entscheidungen vorläufig getroffen
- Welle 1 gestartet: A Tempo/Schwierigkeit (Opus), B Streckenelemente (Opus), D 3D-Autowahl (Sonnet)
- 11.10. Agent B (Opus) – Streckenelemente + Hindernisse: Höhen neu (Wald −11…14 m, Wüste −8…13 m, Wiese −2…6 m, ≤ 8 %),
  Brücken (Wiese Stein über Teich, Wald Holz über Bach, Wüste Beton/Stahl über Schlucht; Senke = bodenHoehe),
  Tunnel (Wald Fels 690–780, Wüste Sandstein 130–220; Lampen, 3 Punkt- + 2 Spotlichter nur im Tunnel, Licht je Ansicht gedimmt),
  Hindernisse (config.hindernisse, trackCatalog.hindernisse, Kollisionen.hindernisse), Nicken nach Steigung.
  Neue Tests: tests/test_hindernisse.js, test_strecke.js (Brücken/Tunnel/Hindernisse), screenshot_test.py Bilder 13–18.
  Offen (Agent A/driver.js): KI weicht noch nicht aus → Schumacher hängt auf der Wiese an der Baustellen-Bake (s≈820),
  rennen_test 400 s: nur 1 Runde. Struktur strecke.hindernisse an Agent A gemeldet; main.js ruft driver.hindernisseSetzen() falls vorhanden.
- 11.10. Agent C (Opus) – Strecke „Fantasie“ fertig: trackCatalog 'fantasie' (1.388 m, Breite 14, Bauplan tests/bauplan/fantasie.json),
  Thema 'fantasie' (lila Himmel, Pastell-Felder, Riesenpilze, Zuckerwatte-Bäume, Ballons, Pastell-Hügel, Regenbogen, Regenbogen-Randsteine).
  2 Loopings (s=170 Start-Gerade, s=800 Süd-Gerade, r=12, vMin 87 km/h) – neu src/track/looping.js (Helix-Band, Gerüst, Fahrlogik
  Spieler=KI, Sturz → zurück vor die Einfahrt „Mehr Anlauf! 🚀“, zu langsam → unten durch „Schneller für den Looping!“, Kamera rollt mit).
  Bälle (3 Stellen, ab Runde 2 bzw. letzte Runde, −60 %) + Wasserfontänen (2, alle 20 s, −40 % + Schlingern) – neu src/world/dynamik.js.
  HUD.meldung() oben; Kollisionen ignorieren Autos im Looping (vehicle.imLooping). Autorennen.html: 2 neue <script>-Zeilen.
  Tests: neu test_looping.js, test_dynamik.js; test_strecke/test_rundenzeit/test_ki/screenshot_test/rennen_test/menu_test auf Fantasie erweitert.
  KI Runde 2: leicht 65,4 s … unschlagbar 49,0 s, alle 7 Stufen 4/4 Loopings, 0 Stürze. rennen_test fantasie: 3 KI × 3 Runden in 400 s.
  Offen (nicht meine Dateien): menu.js Kartenfarbe für Thema fantasie fehlt (Karte grün wie Wiese); 4. Streckenkarte bricht bei 1280 px
  in Zeile 2 um und wird unten abgeschnitten (styles.css .karte.strecke { width: 16em } → z. B. 13.5em).
- 11.10. – Runde 3 abgeschlossen (Hauptmodell geprüft): 10 Node-Testdateien + menu_test (alle Prüfungen) +
  rennen_test wiese/fantasie grün. V_DECKEL Ideallinie 45→78 m/s, Tacho 280. Screenshots Looping/Bälle/
  Tunnel/Baustelle angesehen. Offen: Fragen F1–F4 in PLAN_RUNDE3.md; Leistung mit Tunnel-Lichtern auf dem
  Mac ungemessen; M4/AMG-Front weiter flach.
