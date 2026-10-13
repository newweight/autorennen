# PLAN – Autorennen-Projekt (Arbeitsordner ab 12.10.2026)

Arbeitsordner: `~/Documents/Autorennen-Projekt/` (Kopie von `~/Desktop/Spiele/Autorennen` + `Autorennen-Versionen`).
Ab jetzt wird hier gearbeitet; Desktop/Spiele bleibt als Altstand unangetastet.

## Schritte
1. [x] Ordner anlegen, alles kopieren (iCloud-Platzhalter vorher per Finder „Laden und behalten“ geladen)
2. [x] Server-Code im Linux-Testsystem geprüft (HTTP 200)
3. [x] Server läuft auf dem mini (Ursache: iCloud-Platzhalter + zu kurze Wartezeit)
4. [x] Mehrspieler im Internet (Funnel 8443) aus dem neuen Ordner starten
5. [x] Handy-Test über Mobilfunk (QR, Ping, Touch)
6. [x] Stufe 2: Rempeln online (Vorhersage für andere Autos + Menü-Schalter) → v12

## Arbeitsweise
Deutsch, Fortschritt in %, Sonnet-Agenten für Teilaufgaben (Planung/Prüfung beim Hauptmodell),
jede Änderung als neue Version `Autorennen-Versionen/vN_…`, nie Bestehendes kaputtmachen, alles in VERLAUF.md.

## v13 (12.10., „weiter“)
7. [x] Gegner-Vorhersage in Kurven (Gierrate aus zwei Server-Zuständen statt geradeaus) – Sonnet-Agent A
8. [x] Minimap: Andreaskreuz nicht mehr vom eigenen Autopunkt verdeckt – Sonnet-Agent B
9. [x] welten_test Abschlepp-Prüfung Wald stabil machen (nur Test, lageunabhängig) – Sonnet-Agent B
10. [x] Prüfung, v13 ablegen
Zurückgestellt (Rückfrage am Ende): Fantasie „klassisch (ohne Kreuzung)“; unsichtbare Bande 23 m hinter der Kreuzung.

## v14 (12.10.)
11. [x] Sichtbarer Zaun dort, wo man beim Abbiegen an der Fantasie-Kreuzung an die unsichtbare Bande stößt – Sonnet-Agent
12. [x] Prüfung, v14 ablegen
Entschieden: Fantasie bleibt immer mit Kreuzung (keine Variante „klassisch“).

## v15 (12.10., Wünsche Sebastian)
13. [x] Polizei: Anhalten 10 s → 4 s
14. [x] Abschleppwagen: danach Reparatur 10 %/s ab 0 %, ab 30 % mit Gas losfahren (Reparatur stoppt), sonst bis 100 % – Sonnet A
15. [x] Öl: Einfahrt → leichtes Schleudern (Drehimpuls); Sand-Fleck bremst deutlich – Sonnet C (parallel zu A)
16. [x] Auswahl Hindernisse: normal / viele / sehr viele – Sonnet B (nach A/C, berührt Menü)
17. [x] Prüfung, v15 ablegen
Befund vorher: Polizei stoppDauer 10 s; Abschleppen = 5 s liegen, dann Reset mit 60 %; Öl grip 0,25 (nur rutschig);
Sand-Fleck grip 0,55 / Rollwiderstand 6 / vMax ×0,75; Hindernis-Menge fest je Strecke/Welt.

## v16 (13.10., „fixe alles“)
18. [ ] Fantasie: KI nach Reset vor dem Looping kommt nicht hoch → Reset-Punkt/Anlauf fixen – Sonnet A
19. [ ] „Sehr viele“ Hindernisse: Fantasie/Dino näher an Wunschmenge – Sonnet A
20. [ ] Kreuzung: keine unsichtbare Wand in den Einmündungen; Abbiegen → „Falsch abgebogen“ + Reset (keine Abkürzung) – Sonnet B (nach A)
21. [ ] Online-Vorhersage für Kleber/Anlauf/Rampe/Looping, nur wenn Test Verbesserung zeigt – Sonnet C (parallel zu A)
22. [ ] Prüfung, v16 ablegen, GitHub main (Tag v16 durch Sebastian)
Nicht angefasst (braucht Praxistest/Entscheidung): KI-Reparatur bis 60 %, iPhone-Funktionen, Spielgefühl Öl/Sand/Rempeln.

## Wunschliste für später (13.10., Sebastian nach dem Spielen: „super Spiel!“)
23. [ ] Rückspiegel oben rechts (Bild nach hinten)
24. [ ] Cockpit-Ansicht „aus dem Auto rausgucken“ mit Tacho UND Drehzahlmesser (Zeiger), Tacho zeigt Geschwindigkeit
        (prüfen: tests/cockpit_test.py – es gibt schon eine Cockpit-Kamera, darauf aufbauen)
25. [ ] Scheibenwischer im Cockpit bei Regen, Schnee, Hagel
26. [ ] Verkehrsschilder am Streckenrand vor Kurven: Kurvenrichtung/-art + empfohlene Geschwindigkeit
Weiter offen: 20. Kreuzung ohne unsichtbare Wand – in v16 HALBFERTIG enthalten (Agent abgebrochen, ungeprüft) → erst prüfen/fertigmachen.
