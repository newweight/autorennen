# Autorennen erweitern (für Entwickler)

Alles ist Textdatei, kein Build nötig. Nach dem Ändern: Seite im Browser neu laden (Cmd+R).

## Aufbau
```
Autorennen.html          lädt vendor/three.min.js (Three.js r160) + alle src/-Dateien in Reihenfolge
src/config.js            Einstellungen: Runden, Schwierigkeiten, Fahrhilfen, Tasten, Grafik, Physik, Kamera, UI
src/audio/engine.js      synthetischer Ton (Web Audio), kein Datei-Zugriff nötig
src/input.js             Tastatur (event.code)
src/physics/vehicle.js   Arcade-Fahrphysik (ohne Three.js, testbar in Node)
src/physics/collisions.js Bande (Zaun), Auto-Auto-Stöße
src/cars/carCatalog.js   DATEN der Autos             <- neues Auto hier eintragen
src/cars/carBuilder.js   Low-Poly-Karosserien je Typ (cabrio, van, limousine, sportwagen, coupe, kombi, kleinwagen, suv)
src/track/spline.js      Catmull-Rom-Spline, Abtastung, nächster Punkt
src/track/trackCatalog.js DATEN der Strecken         <- neue Strecke hier eintragen
src/track/trackBuilder.js Straße, Randsteine, Zaun, Checkpoints, Ideallinie
src/world/themes.js      Wiese / Wald / Wüste: Farben, Nebel, Deko (InstancedMesh)
src/ai/driver.js         Computerfahrer (Ideallinie, Skill, Gummiband, Ausweichen)
src/race/raceManager.js  Countdown, Checkpoints, Runden, Platzierung
src/render/cameras.js    Verfolger-/Cockpit-/Weitkamera, Split-Screen in main.js
src/ui/menu.js, hud.js, styles.css   Menü, HUD, Minimap, Ergebnis, Pause
src/main.js              Spielzustände, Schleife, Szenenaufbau
tests/                   node tests/test_*.js (Physik, Autos, Strecke, KI, Kollisionen, Rundenzeit)
                         python3 tests/menu_test.py | screenshot_test.py <strecke> | rennen_test.py | audio_test.py
```

## Neues Auto
In `src/cars/carCatalog.js` einen Eintrag kopieren und anpassen: `id`, `name`, `farbe`, `karosserie` (einer der Typen oben),
`fahrwerte` (vMax m/s, beschleunigung, bremsen, wendigkeit, grip, masse, laenge, breite). `node tests/test_autos.js` prüft die Werte.
Vorschau: `tests/autos_vorschau.html?auto=<id>` im Browser öffnen.

## Neue Strecke
In `src/track/trackCatalog.js` einen Eintrag kopieren: `punkte` = geschlossene Liste [x, y, z] in Fahrtrichtung, Start bei Index 0 auf einer Geraden.
Regeln (werden von `node tests/test_strecke.js` geprüft): Länge 1.900–2.400 m, Radius ≥ 25 m, Abstand nicht benachbarter Teile ≥ 40 m, Steigung < 6 %.
`thema`: wiese | wald | wueste (neues Thema in themes.js anlegen), `abseitsUntergrund`: gras | sand.
`node tests/test_rundenzeit.js` zeigt die simulierte Rundenzeit (Ziel ~2 min). `tests/bauplan/` enthält einen Generator-Ansatz.

## Schwierigkeit / Fahrhilfe / Runden
`src/config.js`: `schwierigkeiten` (tempoFaktor, gummiband, fehler), `fahrhilfen` (lenkhilfe, bremshilfe), `rennen` (Rundenbereich, Gegner), `physik.untergrund`.

## Übertragung vom Entwicklungs-Container auf den Mac
Paket `_hilfsdateien/uebertragung_<Zeit>.tgz` (immer neuer Name), auf dem Mac entpacken mit `tar xzf … --overwrite`, MD5 vergleichen.
