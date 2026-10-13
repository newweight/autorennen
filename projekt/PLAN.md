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
