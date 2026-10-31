# R6 Ergebnis (Zweig integration, 31.10.2026) – Zwischenstand 50 %

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
- menu_test.py: 203 OK, 2 FEHL (Testalterung durch R4: neue Zeile „🌀 Loopings“ (loopmag) in der Fokus-Reihenfolge; Test angepasst: Zeilenliste + 1 Taste ↓ mehr) – Wiederholung folgt
- r3_tricks_browser.py (offline, ohne R3_ERZWINGEN): 11 OK, 2 FEHL (Motorrad-KI zeigt Superman/Handstand nicht: Trampolinflüge für Sicherheitsregel Dauer+Reserve zu kurz, schon bei R3 100 % bekannt) – Wiederholung mit R3_ERZWINGEN folgt
- r3 online / online-moto, r4_browser: laufen noch
