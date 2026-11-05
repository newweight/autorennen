# Plan: Ein gemeinsamer Code für Autorennen, Motorrad und Radwelt (Entwurf 05.11.2026)

Auftrag Sebastian: „Verbesserungen an einer Stelle machen, alle drei greifen drauf zu“ – erst anschauen, planen, prüfen, diskutieren, dann Plan + Skript für alle Zukunft. Noch NICHTS gebaut.

## 1. Bestandsaufnahme (gelesen, geprüft)
- **Autorennen + Motorrad** liegen schon in EINEM Repo (`newweight/autorennen`) und teilen `src/` (Motorrad-Zusätze `src/moto/`, Spaß `src/spass/`, Grafik `src/grafik/`). Muster „ein Kern, zwei Spiele, Schalter `window.MOTORRAD`“ läuft seit Wochen.
- **Radwelt** (`newweight/radwelt`) = Kopie Autorennen v31 (21.10.) + eigener Ordner `src/rad/` (28 Dateien) + `Radwelt.html` (`window.RADWELT`).
  - Gemeinsame Dateien: 78 gleich, 26 verschieden. **Davon hat die Radwelt nur 5 selbst geändert** (server.js, trackBuilder.js, input.js, main.js 1 Zeile, tribuenen.js) – alles kleine, abschaltbare Zusätze. Der Rest = Autorennen ist weitergewachsen.
  - Probe-Zusammenführung (3-Wege, Basis v31) ist **sauber** bis auf 1 Kleinigkeit (Tafeltext) und server.js (A ist Obermenge, enthält die Radwelt-Server-Teile Zeile für Zeile).
  - Alle Schnittstellen, die `src/rad/` benutzt, gibt es im heutigen Autorennen unverändert.
  - **Der Mac-mini-Server ist schon heute der Autorennen-Server** und bedient die Radwelt-Mehrspieler (`/ws-rad`, `radRaum.js`/`radApi.js` in beiden Repos identisch). Die Radwelt-Dateien kommen per Installer aus einem zweiten Ordner dazu.
- Die drei Programme sind verschieden: Auto/Motorrad = Kinderspiel (Rennen, Spaß, Stunts, KI, online); Radwelt = Training für Erwachsene (Rolle KICKR, Watt, Workouts, GPX, echte Namen, keine Fantasie). **Gemeinsam ist der „Unterbau“**: Szene/Host `R.Spiel`, Strecke, Landschaft, Wetter, Tageszeit, Tribünen, Server-Grundgerüst, ab jetzt Grafik.

## 2. Varianten
**A – Ein Repo für alle drei („Monorepo“, Empfehlung)**: Radwelt (`src/rad/`, `Radwelt.html`, Rad-Tests, Rad-Doku) zieht ins Autorennen-Repo, genau wie das Motorrad. Ein `src/`, ein Server, eine Grafik.
- + Verbesserungen wirken sofort überall; kein Abgleich, kein Auseinanderlaufen; Mini-Installer wird einfacher (eine Quelle statt zwei); Muster ist erprobt (Motorrad).
- − Ein Fehler im Kern trifft alle drei → braucht feste Prüfregel (siehe 4); Repo wächst; Radwelt-Arbeit und Kinderspiel-Arbeit laufen im selben Zweig.
**B – Eigenes Kern-Repo + Abgleich-Skript**: gemeinsame Dateien in `newweight/spielkern`, jedes Spiel holt sie per Skript.
- + saubere Trennung, jedes Spiel entscheidet, wann es den neuen Kern nimmt.
- − zwei Richtungen (wer im Spiel den Kern ändert, muss zurückspielen), drei Repos statt zwei, genau das Auseinanderlaufen von heute passiert leicht wieder.
**C – Nur Grafik teilen (Abgleich-Skript für `src/grafik/`)**: kleinster Schritt.
- + fast kein Risiko.
- − löst nur die Grafik; Wetter, Strecke, Server-Fixes laufen weiter auseinander (heute schon 26 Dateien).

## 3. Empfehlung: A, in kleinen sicheren Schritten
1. Sicherungen (erledigt: `stand-vor-grafik-2026-11-05` in beiden Repos).
2. Radwelt-Teile ins Autorennen-Repo übernehmen (Zweig `kern-gemeinsam`): `src/rad/`, `Radwelt.html`, `Radwelt starten.command`, Rad-Tests, `docs/`, `prof*`, Rad-Doku (`PLAN_RADWELT.md`, Radwelt-`VERLAUF.md` → `VERLAUF_RADWELT.md`). Die 5 Radwelt-Änderungen an Kern-Dateien einpflegen (main.js-Zeile, trackBuilder-Optionen, tribuenen-Tafeln aus config).
3. Schutz: In der Radwelt bleiben Spaß/Zufall/Moto/Tuning aus (`Radwelt.html` lädt sie nicht; zusätzlich Einstellung `spass/zufall = false` im Host, Test).
4. Radwelt-Tests laufen grün auf dem gemeinsamen Kern (Node + Browser), Autorennen/Motorrad-Tests unverändert grün.
5. Grafik in die Radwelt einhängen (Plan PLAN_RADWELT_GRAFIK.md): `src/rad/radGrafik.js` (Schatten folgen Avatar, Avatar wirft Schatten, Tempo-Streifen aus, Knopf/Taste G, eigener Speicher), Leistung am Mini messen.
6. Mini-Installer: Radwelt-Dateien aus demselben Repo (statt `~/Documents/Radwelt-Projekt`).
7. Repo `newweight/radwelt` bleibt als Archiv (nicht löschen), README-Hinweis „weiter im Autorennen-Repo“.

## 4. Regeln + Skript für alle Zukunft
- **Kern-Datei** = jede Datei, die mehr als ein Spiel lädt (Liste wird automatisch aus den drei HTML-Dateien erzeugt).
- **Wer eine Kern-Datei ändert, muss alle drei prüfen**: Skript `werkzeuge/alle_pruefen.sh`
  - erkennt geänderte Dateien (git diff), ordnet sie Spielen zu (welche HTML lädt sie),
  - startet die passenden Tests: schnell (Node-Tests je Spiel + Start-Rauchtest je HTML im Browser) oder voll (`--voll`: Matrix Auto/Motorrad + Radwelt-Browsertests),
  - schreibt Ergebnis in `tests/ALLE_ERGEBNIS.md`, rot = nicht einspielen.
- **Spiel-Besonderheiten nur über Schalter** (`window.MOTORRAD`, `window.RADWELT`, Katalog-/config-Optionen), nie Kern-Code kopieren. Test `test_kern_haken.js` prüft, dass die Radwelt-/Motorrad-Haken vorhanden sind.
- **Mehrspieler-Version**: Ändert sich Strecken-/Physiklogik im Kern, `MP_APP` der Radwelt und Protokoll-Version mit anheben (Skript warnt).
- ERWEITERN.md bekommt den Abschnitt „Kern und Spiele“.

## 5. Offene Punkte / Risiken
- Radwelt-Arbeit (Erwachsene, Training) und Kinderspiel im selben Repo – Zweige je Arbeit (z. B. `rad-…`, `moto-…`), `motorrad` bleibt Hauptzweig (später in `main` umbenennen?).
- Der volle Prüflauf aller drei dauert auf 2 Kernen Stunden → Standard „schnell“, „voll“ vor dem Einspielen auf den Mini.
- Radwelt-Server-Teil: GPX-API (`radApi` braucht `src/rad/gpx.js`) läuft dann auch auf dem Mini.
- `radRaum.js` hat noch die alte kurze Herzschlag-Frist (15–30 s) → nach dem Umzug angleichen.
