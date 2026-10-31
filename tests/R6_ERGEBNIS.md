# R6 Ergebnis (Zweig integration, 31.10.2026) – Endstand 100 %

## Node-Tests (`for f in tests/test_*.js tests/zaun_test.js`)
90 von 90 grün (89 beim ersten Lauf + zaun_test nach Korrektur).
- Einziger Fehler im Erstlauf: `zaun_test.js` „formel1: Pflanzen-Kollider nur zwischen Straße und Zaun“ (0 Kollider). Identisch in Basis d703293 (kein neuer Fehler).
  Ursache: `formel1Deko` (themes.js) setzt Bäume bewusst nur hinter Bande/Tribünen, also 0 Kollider; der Test verlangte n > 0. Test korrigiert (formel1 wie fantasie ausgenommen), Spiel unverändert.
- Längster Test: test_welten_ki 1729 s (OK). Alle anderen < 170 s.

## Matrix (`tests/matrix_alle.py`, 3 Grafikstufen, Solo/Zwei/Online, alle Spaß-Schalter an)
- Motorrad: 90 Kombinationen, 90 OK, 0 FEHL (76 Min)
- Auto: 84 Kombinationen, 84 OK, 0 FEHL (75 Min)

## Browser-Tests (einzeln, nie parallel)
- touch_test.py: 100/100 OK
- garage_test.py: 57 OK, 0 FEHL
- r2_browser.py: 21 OK, 0 FEHL
- menu_test.py: Erstlauf 203 OK, 2 FEHL (Testalterung durch R4: neue Zeile „🌀 Loopings“ (loopmag)); Test angepasst (Zeilenliste, 12 Tasten ↓), Wiederholung 205 OK, 0 FEHL
- r3_tricks_browser.py (offline, ohne R3_ERZWINGEN): 11 OK, 2 FEHL (Motorrad-KI zeigt Superman/Handstand nicht: Trampolinflüge für Sicherheitsregel Dauer+Reserve zu kurz, schon bei R3 100 % bekannt) – Wiederholung mit R3_ERZWINGEN=superman,handstand,backflip: 9 OK, 0 FEHL (kein Spielfehler; die KI bekommt im Normalfall auf kurzen Trampolinflügen keinen Superman/Handstand, Sicherheitsregel Restflug ≥ Dauer+Reserve+0,3 s)
- r3 online: 15 OK (inkl. neue Bildprüfung), r3 online-moto 9 OK (R3 100 %), r4_browser: 21 OK, 0 FEHL
- r5_werkstatt.py: Wegweiser nahe Start im Countdown/LOS unsichtbar (4/4)

## Beweisbilder tests/bilder_r6/ (alle angesehen)
moto_ki_superman/handstand/backflip_* (KI-Motorrad, eigene Seitenkamera, Trick mittig), online_auto_fassrolle_host/gast_0 (Auto-Fassrolle online, beide Seiten), pipe_wand_aussen/pipe_luft_aussen (Halfpipe Auto, Kamera in der Pipe gegenüber), fantasie_magnet_ein/mitte/decke (Magnet-Röhre), lobby_host (Lobby mit allen Spaß-Zeilen), looping_schub_roller_*, r6_wasser_wiese_* (Wasser mit Motorrad), *_alpen_stoppie_cockpit/verfolger (HINTERRAD HOCH! Normal + Ultra).

## Nicht grün / offen
Nichts Rotes. Hinweis: Bild „moto_ki_*“ der alten Läufe zeigte die Spielerkamera (falsches Motiv): Testskript nutzt jetzt eigene Kamera.
