# Autorennen – Plan (Claude Fable 5.1, 10.10.2026)

## 1. Ziel
Rennspiel für Kinder (5–10) auf dem M1 MacBook Air (8 GB). Start per Doppelklick aus
Desktop/Spiele. Vorbild: Test Drive (echte Autos zum Aussuchen, Landschaften, Fahrgefühl),
plus bewährte Arcade-Muster (Mario Kart / Outrun / NfS): leichte Steuerung, Checkpoints,
KI mit Gummiband, Split-Screen.

## 2. Anforderungen (aus Auftrag)
- Modi: (a) Solo gegen Computer, (b) 2 Spieler gleichzeitig (Split-Screen), Computer-Autos zuschaltbar
- Steuerung Tastatur: Spieler 1 = Pfeiltasten (vor / bremsen+rückwärts / links / rechts),
  Spieler 2 = W A S D. Zusatz: R = Auto zurück auf die Strecke, C = Kamera, Esc = Pause
- 3 Strecken: Wald, Wiese, Wüste. Rundenzeit ca. 2 Minuten
- Einstellbar: Rundenzahl, Modus, Schwierigkeit/Spielstärke der KI, Anzahl Gegner
- Autos: VW T-Roc Cabrio (blau), VW Multivan 6.1, VW Passat B8 (schwarz) + zeitgemäße
  Autos: Porsche 911, BMW M3/M4, Mercedes AMG GT, Audi RS6, Mini (Liste erweiterbar)
- Sauber in Abschnitten programmiert, später erweiterbar: Strecken, Autos, Schwierigkeiten,
  Rundenzahl, Spielstärke, weitere Modi

## 3. Recherche-Ergebnis (Kurzfassung, Quellen in VERLAUF.md)
- Test Drive (1987): Cockpit-Sicht, Küstenstraße, echte Sportwagen, Gegenverkehr/Polizei.
  Übertragbar: Autowahl, Landschaft, klare Ziele; nicht übertragbar: Schalten, Motorschaden.
- Arcade-KI: "Hase auf der Ideallinie" + Geschwindigkeitsprofil pro Streckenpunkt,
  Skill 0–100 → Tempo-Faktor (leicht ≈ 80 %, schwer ≈ 98 %), Gummiband (KI hinten schneller,
  vorne langsamer) – dezent, sonst wirkt es unfair. KI am Ende etwas nachlassen lassen.
- Rundenzähler: Reihenfolge-Checkpoints (Tore), Ziellinie zählt nur nach letztem Tor.
- Streckenlänge: Länge = Tempo × 120 s. Bei kindgerechten 15–20 m/s (54–72 km/h Mittel)
  → 1.800–2.400 m pro Runde, 10–16 Kurven + 2–3 Geraden.
  KRITIK: 2 Minuten ist 3× länger als eine Mario-Kart-Runde. Für einen 5-Jährigen lang.
  Lösung: Rundenzahl 1–10 einstellbar, Strecken bleiben bei ~2 min (Wunsch).
- Technik: Three.js r160 ist die letzte Version mit three.min.js (klassisches <script>).
  ES-Module laden per file:// NICHT (CORS) → klassische Script-Tags, kein Build nötig.
  Split-Screen = ein Renderer, zwei Kameras, setViewport/setScissor.
  Performance M1: InstancedMesh für Bäume/Kakteen, 1 Schattenlicht oder Blob-Schatten,
  Lambert-Material, Pixel-Ratio ggf. auf 1.5 begrenzen.
- Tastatur-Ghosting: Apple-Tastaturen nicht belegt → im Spiel testen (Pfeil↑+← und W+A
  gleichzeitig). Tasten konfigurierbar machen (config.js).
- Markennamen: rein privat unproblematisch; bei Weitergabe umbenennen (generische Namen
  liegen als Alternative in cars.js bereit).

## 4. Technik-Entscheidung (Vorschlag)
**Browser-Spiel mit Three.js (3D, Low-Poly, Chase-Cam), klassische Script-Dateien, kein Build.**
Warum nicht Swift/SceneKit wie Schach:
- Ich kann das Browser-Spiel hier im Container selbst starten, testen und Bildschirmfotos
  machen (headless Chromium) → viele Fehler finde ich ohne deinen Mac.
- Kein Kompilieren auf deinem Mac bei jeder Änderung; Erweiterung = Textdatei anpassen.
- Split-Screen, Menüs, HUD sind in HTML/JS einfacher als in SceneKit.
Nachteil: läuft in einem Browser-Tab (Vollbild per Taste F; Starter-App öffnet direkt).
Alternative bleibt Swift/SceneKit (nativer, passt zu den anderen Spielen, aber langsamer
zu entwickeln und ich kann nicht selbst testen).

## 5. Architektur (Ordner Spiele/Autorennen)
```
Autorennen.html            Einstiegsdatei (Doppelklick)
🚗 Autorennen starten.app  Starter (öffnet Autorennen.html im Browser, Vollbild)
vendor/three.min.js        Three.js r160 (lokal, offline)
src/config.js              Standardwerte: Rundenzahl, Schwierigkeit, Tasten, Kamera
src/input.js               Tastatur (event.code), Tastenbelegung je Spieler, Fokus-Reset
src/cars/carCatalog.js     DATEN: Autos (Name, Farbe, Karosserie-Typ, Maße, Fahrwerte)
src/cars/carBuilder.js     Low-Poly-Karosserien aus Grundformen (Cabrio, Van, Limousine,
                           Sportwagen, Kombi, SUV, Kleinwagen) + Räder, Lichter
src/physics/vehicle.js     Arcade-Fahrphysik: Gas/Bremse/Rückwärts, Lenkung abhängig vom
                           Tempo, seitlicher Grip, Untergrund (Straße/Gras/Sand), Kollision
                           mit Banden (abbremsen + zurückschieben), Auto-Auto-Stoß
src/track/trackCatalog.js  DATEN: Strecken (Kontrollpunkte, Breite, Thema, Startplätze)
src/track/trackBuilder.js  Catmull-Rom-Spline → Straße, Randstreifen, Banden, Start/Ziel,
                           Checkpoint-Tore, Ideallinie + Tempo-Profil für die KI
src/world/themes.js        Wald / Wiese / Wüste: Boden, Himmel, Nebel, Deko (InstancedMesh)
src/ai/driver.js           KI-Fahrer: Hase auf Ideallinie, Bremsen vor Kurven, Skill,
                           Gummiband, Ausweichen, Festfahr-Erkennung
src/race/raceManager.js    Countdown, Rundenzählung (Tore in Reihenfolge), Positionen,
                           Rundenzeiten, Zieleinlauf, Ergebnis
src/render/cameras.js      Chase-Cam (weich nachgeführt), Cockpit-Cam, Split-Screen
src/ui/menu.js             Hauptmenü: Modus, Strecke, Auto je Spieler, Runden, Gegner, Stärke
src/ui/hud.js              Tacho, Runde x/y, Position, Zeit, Minimap – je Spieler
src/audio/engine.js        Motor-/Kollisionsgeräusche synthetisch (Web Audio, keine Dateien)
src/main.js                Spielzustände (Menü → Countdown → Rennen → Ergebnis), Game-Loop
tests/                     Node-Tests: Physik deterministisch, Rundenzähler, Streckenlänge
PLAN.md / VERLAUF.md / ANLEITUNG.md
```
Erweitern = Eintrag in carCatalog.js / trackCatalog.js / config.js (Schwierigkeiten) ergänzen.
Alle Module hängen an einem Namensraum `window.Rennspiel` (keine ES-Module wegen file://).

## 6. Spielregeln & Fahrgefühl
- Start: Startaufstellung, Countdown 3-2-1-LOS. Rundenzahl 1–10 (Standard 3).
- Lenkung: bei hohem Tempo weniger Lenkeinschlag (stabil), bei langsam viel (wendig).
- Abseits der Straße: Gras/Sand bremst spürbar, aber Kind kommt immer zurück. Außen Banden.
- Kollision Auto-Auto: Abstoßen, kurzer Tempoverlust, kein Schaden/Game Over.
- Taste R: Auto auf letzten Checkpoint zurücksetzen (Festfahren unmöglich).
- Fahrwerte differenziert: Multivan schwer/stabil/langsam, Passat ausgewogen, T-Roc Cabrio
  wendig, Porsche/AMG schnell aber rutschiger. Unterschiede klein genug, dass Kind gewinnen kann.
- KI-Stärke: leicht / mittel / schwer / unfair (Tempo-Faktor + Gummiband-Stärke in config.js).
- Ergebnis: Platzierungen, Bestzeit je Runde, "Nochmal"-Knopf.

## 7. Strecken (je ~2.000 m, ~2 min)
1. Wiese: offen, schnell, sanfte Hügel, Teich, Kühe/Heuballen; Einsteiger-Strecke.
2. Wald: kurvig, Baumtunnel, Holzbrücke, enge Haarnadel; mittel.
3. Wüste: lange Geraden + Schikanen, Dünen, Felsen, Kakteen; schnell, rutschig am Rand.

## 8. Arbeitsabschnitte (jeweils: Agent programmiert → ich prüfe/teste → VERLAUF.md)
1. Grundgerüst: Dateien, three.min.js, Loop, Boden, Kamera, ein Testauto fährt per Tastatur
2. Autos: Katalog (8 Autos) + Builder + Auswahl mit drehender Vorschau
3. Strecke 1 (Wiese): Spline-Builder, Checkpoints, Rundenzähler; Längen-Test ≈ 2 min
4. Fahrphysik fein: Untergrund, Banden, Auto-Auto, R-Taste, Kamera weich
5. KI-Fahrer: Ideallinie, Bremspunkte, Skill-Stufen, Gummiband, Ausweichen
6. Modi + Menü + HUD: Solo/2 Spieler, Split-Screen, Runden, Gegner, Countdown, Ergebnis
7. Strecken 2+3 (Wald, Wüste) + Deko-Themen, Minimap
8. Sound, Vollbild, Starter-App, ANLEITUNG.md, Performance-Check, Abschlusstests
Agenten: Opus für Physik/KI/Streckenbauer, Sonnet für Menü/HUD/Katalog/Themen/Tests.
Ich plane, prüfe jeden Abschnitt (Code lesen, Node-Tests, Screenshot headless) und führe VERLAUF.md.

## 9. Risiken / offen
- Tastatur-Ghosting bei 2 Spielern (4–6 Tasten gleichzeitig) → früh auf deinem Mac testen
- 8 GB RAM: Browser + Spiel ok, aber keine anderen schweren Programme parallel
- Rundenzeit 2 min für 5-Jährigen evtl. lang → Rundenzahl 1–2 wählen
- Browser unbekannt (Safari/Chrome) → beide testen; Starter nutzt Standardbrowser

## 15.10. Online-Ruckeln (v23, Agent Sonnet) – Plan/Fortschritt
Sicherung: tests/sicherung_online_ruckeln_alt/ (server.js, simulation.js, PROTOKOLL.md, online.js, client.js, vorhersage.js, protokoll.js). Baseline-Kopie (ohne Fixes, mit Statistik) im Scratchpad.
1. [x] Server-Tick messen (tests/messung_server_tick.js): Schritt p50 0,6–1,2 ms, p99 ≤ 6, max ≤ 13 ms (nur 1. Tick 60–90 ms JIT) → (c) Rechenzeit nicht die Ursache
2. [x] Server-Statistik (--statistik s) eingebaut (verhaltensneutral)
3. [x] Harness tests/test_netz_jitter.js (Proxy + 2 Node-Clients + Rahmenschleife wie main.js + Ruckel-Metrik)
4. [x] Baseline messen je Profil; Hypothesen a/b/d/e einzeln
5. [x] Fixes (Backup erst), Tests vorher/nachher, VERLAUF-Eintrag
Zwischenstand (Befunde aus Harness, Baseline v22b, Wiese, 2 Clients + 5 KI):
- Eigenes Auto: Anzahl V.schritt je Physikschritt hängt an der Wanduhr (soll−n) statt 1:1 → 0/2-Schritt-Muster, Grafik-alpha geht von 1 aus → Ruckeln auch ohne Netz-Jitter (A1)
- Andere Autos: Pose zur Wanduhr-Zeit des Aufrufs statt Schrittzeit + fester Puffer 100 ms + kein Extrapolieren + Uhr = Max-Filter(2 s)+EMA 0,1 (springt) (A2)
- Server: jede leere Warteschlange = Extra-Schritt ohne Ack → Vorhersage-Basis springt vorwärts, Trim springt rückwärts (B)
Plan: A1 (Eingabe 1:1), A2 (Anzeige-Takt/PLL, adaptiver Puffer, Extrapolation, Kontinuitäts-Glättung), A3 (Abgleich weicher), B (Server Eingabe nach Index), E (Hintergrund-Hinweis + Eingabe-Pumpe). Schalter R.NetzOptionen für Vorher/Nachher je Hypothese.
Erledigt 15.10.: alle Punkte, siehe VERLAUF.md.
