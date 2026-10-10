
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
