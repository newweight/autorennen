# Plan: Gesamtprüfung v27 (15.10.2026) – Ziel: Spiel stabil, immer spielbar. Nix verschlimmbessern.

Grundregeln
- Kein Fund ist ein Fehler, bevor er reproduziert ist (Skript/Stacktrace/Screenshot). Vermutungen bleiben Vermutungen.
- Jede Korrektur: minimal, Sicherung vorher, Test vorher/nachher, von zweitem Agenten gegengelesen, von mir (Hauptmodell) selbst nachvollzogen.
- Keine neuen Funktionen in dieser Runde. Nur Stabilität.
- Maschine hat 2 Kerne: schwere Läufe nacheinander, Leseprüfungen parallel dazu.

Phase 0 – Grundlinie (Sonnet)
- Alle 57 Node-Tests + alle Python/Playwright-Tests EINZELN, nacheinander, ohne Parallellast laufen lassen.
- Ergebnis-Tabelle: grün / rot / flaky (2× wiederholen). Rot ≠ Fehler im Spiel, erst Phase 3 entscheidet.

Phase 1 – Code-Leseprüfung, 3 Blickwinkel parallel (nur lesen, nichts ändern)
- A Server/Online/Sicherheit (Opus): server.js, brettspiele.js, simulation.js, net/*, autostart/*.
- B Spiellogik/Physik/KI (Opus): physics/*, ai/driver.js, world/* (polizei, verkehr, dach, pickups, garage, tribuenen, schilder, megastrecke), race/*.
- C Oberfläche/Rendering/Leistung (Sonnet): main.js, ui/*, render/*, audio/*, cars/*, lichtPool, Vorwärmen, Speicher über Neustarts.
- Jeder Fund: Datei:Zeile, Szenario, Schwere, Reproduktionsidee. Lieber 5 echte als 30 vermutete.

Phase 2 – Echte Durchläufe (Sonnet, nach Phase 0, damit keine Parallellast)
- Playwright: komplette Rennen (Countdown → Ziel → Ergebnis → Menü → nächstes Rennen) über Matrix:
  Strecke (7) × Variante (normal/XL) × Tageszeit (Tag/Dämmerung/Nacht) × Wetter (Sonne/Regen/Schnee) × Modus (Einzel/Zweispieler/Online 2 Browser)
  × Optionen (Polizei, Schaden, Hindernisse viel, Verkehr viel, Geisterfahrer, T-Roc offen). Nicht alle Kombinationen – orthogonale Auswahl (~60 Läufe) + 10 Zufallskombinationen.
- Je Lauf: Watchdog (Hänger), JS-Fehler = 0, Rennen endet, Bildzeit-Statistik, Speicher (programs/geometries/textures) vorher/nachher, 5 Rennen hintereinander ohne Leck.
- Online zusätzlich: Gast tritt bei/verlässt mittendrin, Host verlässt, Wiederverbinden, 5 Spieler, Jitter-Profil.
- Brettspiele: je 1 komplette Partie 4 gewinnt + Schach (lokal, Computer, online 2 Browser).
- Server: 30-min-Dauerlauf mit wechselnden Räumen, Speicher am Ende.

Phase 3 – Streitgespräch + Entscheidung
- Skeptiker (Opus): nimmt JEDEN Fund aus Phase 0–2 und versucht ihn zu widerlegen oder mit Minimal-Skript zu bestätigen. Ergebnis: BESTÄTIGT / WIDERLEGT / UNKLAR.
- Ich (Hauptmodell) lasse jeden BESTÄTIGTEN Fund selbst nochmal laufen (Skript/Test), bevor er auf die Fix-Liste kommt. UNKLAR → nicht fixen, dokumentieren.

Phase 4 – Korrekturen (ein Agent je Fund, Sonnet; Opus bei Physik/Netz)
- Minimal, Sicherung tests/sicherung_v27_<fund>/, neuer Regressionstest, alle betroffenen Tests vorher/nachher.
- Zweiter Agent liest den Diff gegen (Opus): „verschlimmbessert?“ → nur dann übernehmen.

Phase 5 – Abschluss
- Phase 0 + Phase 2 (Kurzmatrix) komplett wiederholen auf dem korrigierten Stand.
- Endbericht (was gefunden, was bestätigt, was behoben, was offen), v27 sichern (Mac + GitHub), Installer-Befehl.

Status: [x] P0  [x] P1A  [x] P1B  [x] P1C  [x] P2  [x] P3  [x] P4  [x] P5
