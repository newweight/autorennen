# Plan: Gemeinsamer Kern für Autorennen, Motorrad und Radwelt – Fassung 2 (05.11.2026)

Auftrag Sebastian: Verbesserungen an EINER Stelle, alle drei greifen darauf zu – aber: „die 3 Programme sind schon unterschiedlich“.
Ablauf bisher: anschauen (2 Repos verglichen, Probe-Zusammenführung) → Entwurf 1 → Gegenprüfung durch eigenen Agenten → diese Fassung 2. Noch NICHTS gebaut. Sicherungen: `stand-vor-grafik-2026-11-05` (Radwelt), `stand-vor-grafik-gemeinsam-2026-11-05` (Autorennen).

## 1. Befund in einem Satz je Punkt
- Autorennen + Motorrad teilen schon ein Repo und `src/` (Schalter `window.MOTORRAD`) – erprobt.
- Radwelt = Kopie Autorennen v31 + `src/rad/` (28 Dateien). Von den gemeinsamen Dateien hat die Radwelt nur 5 selbst geändert, alles abschaltbar. Probe-Zusammenführung mit heute: sauber.
- Der Mac-mini-Server ist schon der Autorennen-Server und bedient die Radwelt-Mehrspieler mit.
- Physik (`radPhysik.js`), Kamera, Rolle/FTMS, Workouts, GPX, Fahrtenspeicher, Mehrspieler-Protokoll hat die Radwelt schon EIGEN.
- Gegenprüfung fand 3 echte Gefahren: (a) neue Kinder-Funktionen sind im Kern „Standard an“ und rutschen in die Radwelt, sobald ihre Datei geladen wird; (b) Radwelt nutzt interne Felder des Kinder-Menüs/der Menü-Kamera; (c) Strecken-/Spline-Änderungen für Stunts können gespeicherte Fahrten, Geister, Bestzeiten und den Mehrspieler-Abgleich (`MP_APP`, Strecken-Fingerabdruck) still verändern.

## 2. Entscheidung (Vorschlag): Variante D – ein Repo, zwei Schichten
**Ein Repo** (`newweight/autorennen`, Radwelt zieht dazu wie das Motorrad). Darin zwei Schichten:

| Schicht | Inhalt | Regel |
|---|---|---|
| **Gemeinsamer Kern** – Verbesserungen wirken auf alle drei | Grafik (`src/grafik/`), Landschaft/Themen, Wetter, Tageszeit, Tribünen/Deko, Szenen-Grundgerüst, Server-Gerüst (Räume, Herzschlag, Sicherheit) | Änderung → Pflicht-Prüfung aller drei (Skript) |
| **Strecke (gemeinsam, geschützt)** | Spline, Streckenbau, Höhen | darf nur ERWEITERT werden (neue Option, Standard = alter Weg); Golden-Test „Radwelt-Strecken bitgleich“ |
| **Pro Spiel, bewusst getrennt** | Auto/Motorrad: Fahrphysik, Stunts, Spaß, KI, Garage, Menü, Online-Protokoll · Radwelt: Radphysik, Rolle, Workouts, GPX, Fahrten/Geister, Rad-Mehrspieler, eigene Kamera/HUD | wird nicht geteilt; kein Spiel greift in die Dateien des anderen |

Verworfen: B (eigenes Kern-Repo + Abgleich in zwei Richtungen – zu fehleranfällig, genau das Auseinanderlaufen von heute), C (nur Grafik – löst Wetter/Server/Landschaft nicht).

## 3. Schutzregeln (aus der Gegenprüfung)
1. **Opt-in statt Opt-out**: Kinder-Funktionen im Kern hängen an einem Schalter `kinderspiel` (Auto/Motorrad setzen ihn, Radwelt nie). Neue Funktion = in der Radwelt automatisch AUS. Test prüft: in der Radwelt sind nach dem Streckenbau alle Kinder-Schalter aus.
2. **Kern-Vertrag**: kleine Datei `src/kern/szene.js` mit den Funktionen, die die Radwelt vom Szenen-Host braucht (Strecke bauen/abbauen, Wetter, Tageszeit, Tribünen, Kamera übergeben, zeichnen). Die Radwelt ruft NUR diese; Menü/Menü-Kamera des Kinderspiels darf sich frei ändern.
3. **Dateilisten aus einer Quelle**: `spiele.json` (je Spiel die Modul-Liste); ein Skript erzeugt daraus die `<script>`-Zeilen der drei HTML-Dateien → keine Datei wird mehr vergessen, keine falsche Reihenfolge.
4. **Golden-Tests**: Fingerabdruck der Radwelt-Strecken (Alpen, Wiese, Wald, Mega, Baukasten-Beispiel), Radphysik-Fingerabdruck, Auto-/Motorrad-Fingerabdrücke wie bisher. Rot = nicht einspielen.
5. **Mehrspieler-Version**: Ändert sich der Strecken-Fingerabdruck, muss `MP_APP` mit angehoben werden – Test erzwingt das (nicht nur Warnung).
6. **Stabiler Radwelt-Stand**: Tag `radwelt-stabil-<datum>` nach jedem grünen Vollauf; der Mini-Installer nimmt für die Radwelt immer den letzten stabilen Stand. Zurück geht jederzeit.

## 4. Skript für alle Zukunft: `werkzeuge/alle_pruefen.sh`
- liest `spiele.json`, erkennt per git, welche Dateien geändert sind und welche Spiele sie laden,
- **Pflicht** (Ziel: wenige Minuten, wird gemessen): Node-Tests der betroffenen Spiele, alle Golden-Tests, Start-Rauchtest je HTML (Seite lädt, 10 s fahren, keine Fehler),
- **Voll** (`--voll`, vor dem Einspielen auf den Mini, gern nachts): Matrix Auto/Motorrad, Radwelt-Browsertests,
- schreibt `tests/ALLE_ERGEBNIS.md` (Datum, Stand, je Spiel grün/rot), setzt bei Voll-Grün den Tag `radwelt-stabil-…`,
- Regel in ERWEITERN.md: „Kern geändert → `alle_pruefen.sh` grün, sonst nicht einspielen.“ Das Skript prüft – nicht Sebastian.

## 5. Reihenfolge (jede Stufe mit Sicherung, Prüfplan, Bildprüfung)
1. **K1 Schutz zuerst** (im Autorennen, Radwelt noch getrennt): Schalter `kinderspiel` (Opt-in), `spiele.json` + HTML-Erzeugung, Golden-Tests, `alle_pruefen.sh` (Pflicht-Stufe), Zeit messen.
2. **K2 Kern-Vertrag** `src/kern/szene.js`; Radwelt-Zugriffe auf Host-Interna darauf umstellen (zuerst in der Radwelt-Kopie testen).
3. **K3 Umzug**: Radwelt ins Autorennen-Repo (Zweig `kern-gemeinsam`), 5 Radwelt-Zusätze einpflegen, alle Tests beider Seiten grün, Radwelt-Strecken bitgleich.
4. **K4 Grafik für die Radwelt** (PLAN_RADWELT_GRAFIK.md): `radGrafik.js`, Leistung am Mini messen.
5. **K5 Mini-Installer**: zwei Knöpfe „Kinderspiele“ / „Radwelt (stabil)“, Datenordner der Radwelt bleibt `~/Documents/Radwelt-Projekt` (gespeicherte Fahrten unberührt).
6. **K6** Rad-Mehrspieler-Herzschlag angleichen (heute 15–30 s), Repo `newweight/radwelt` als Archiv lassen.

## 6. Offen / weiß ich noch nicht
- Wie lange die Pflicht-Prüfung wirklich dauert (wird in K1 gemessen; Ziel < 10 min).
- Ob die Radwelt auf dem Mini mit „Schön“ flüssig läuft (K4).
- Zweignamen: `motorrad` bleibt Hauptzweig; Arbeit in `kinder-…` bzw. `rad-…`. Später evtl. in `main` umbenennen.
