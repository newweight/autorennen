# Jonas Hot Steering Wheel erweitern (für Entwickler)

(Untertitel „Autorennen“; Dateinamen und Ordner heißen weiterhin Autorennen.)

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
src/track/trackBuilder.js Straße, Randsteine, Zaun, Checkpoints, Ideallinie, Brücken, Tunnel, Hindernisse
src/track/looping.js     Looping (Fantasie); src/world/dynamik.js: Bälle + Wasserstrahlen
src/world/themes.js      Wiese / Wald / Wüste / Fantasie: Farben, Nebel, Deko (InstancedMesh)
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

## Neuer Fahrer
In `src/config.js` unter `fahrer` einen Eintrag `{ name, emoji }` anhängen (Emoji als Avatar, keine Fotos/Logos). Das Menü-Raster passt sich an
(Solo 6 Spalten, zu zweit je Spieler 3 Spalten – ab 13+ Fahrern wird es eng). `fahrerStandard` = Vorauswahl Spieler 1/2,
`fahrerComputerVorrang` = Namen, die Computer-Gegner zuerst bekommen.

## Neue Strecke
In `src/track/trackCatalog.js` einen Eintrag kopieren: `punkte` = geschlossene Liste [x, y, z] in Fahrtrichtung, Start bei Index 0 auf einer Geraden.
Regeln (werden von `node tests/test_strecke.js` geprüft): Radius ≥ 25 m, Abstand nicht benachbarter Teile ≥ 40 m, Steigung ≤ 8 %; Länge 1.900–2.400 m (Fantasie ist mit ~1.400 m bewusst kürzer).
`thema`: wiese | wald | wueste | fantasie (neues Thema in themes.js anlegen), `abseitsUntergrund`: gras | sand,
`schwierigkeit`: leicht | mittel | schnell | spass (Pille auf der Menükarte; Fantasie-Karte ist lila, siehe styles.css `.t-fantasie`).
Optionale Felder (Position immer als Bogenlänge `s` in m; nicht auf Start/Ziel, nicht in Tunnel/Brücke ± 20 m):
- `bruecken`: `[{ s0, s1, art: 'holz'|'stein'|'stahl', tiefe }]` – Boden darunter wird um `tiefe` abgesenkt.
- `tunnel`: `[{ s0, s1, art: 'fels'|'sandstein' }]` – Röhre mit Lampen, Scheinwerfer nur im Tunnel.
- `hindernisse`: `[{ typ: 'oel'|'sand'|'baustelle'|'ast', s, seite (-1..1), breite? }]` – Werte je Typ in `config.hindernisse`.
- `loopings`: `[{ s, radius }]` (Fantasie, Radius 12 m; Mindesttempo/Versatz in `config.fantasie.looping`).
- `baelle`: `[{ s, von (-1 links/1 rechts), abRunde ('letzte' oder Zahl), intervall, tempo, radius, farbe }]`.
- `wasserstrahlen`: `[{ s, seitenabstand, intervall, dauer, vorwarnung }]` (Zeiten in s).
Das Menü zeigt für Strecken mit `loopings`/`baelle`/`wasserstrahlen` automatisch einen Hinweis („2 Loopings, Bälle, Wasserstrahl“).
`node tests/test_rundenzeit.js` zeigt die simulierte Rundenzeit. `tests/bauplan/` enthält einen Generator-Ansatz.

## Autos: Maße und Form
Zusätzlich zu `fahrwerte` (vMax 220–270 km/h, notiert als `km/h / 3.6`) hat jedes Auto:
- `abmessungen`: `{ laenge, breite, hoehe, radstand, ueberhangVorn, radRadius, radBreite, felgeZoll … }` in m – echte Maße, nur Optik (Physik nutzt `fahrwerte.laenge/breite`).
- `form`: Silhouette für den carBuilder (Höhen als Anteil von `hoehe`, Längen als Anteil von `laenge`, 0 = Front), dazu `licht`, `grill`, `rueck`, `endrohre`, `spoiler` usw.
Die 3D-Autowahl (src/ui/autoVorschau) rendert diese Modelle; neue Autos erscheinen automatisch.

## Schwierigkeit / Fahrhilfe / Runden
`src/config.js`: `schwierigkeiten` – 7 Stufen, je `{ rang, name, tempoFaktor, gummiband, fehler }` (optional bei „unschlagbar“: `gummibandHinten`, `gripBonus`, `bremsSpaeter`, `innenSchneiden`).
`rang` (1…7) bestimmt die Reihenfolge der Pillen im Menü; die Pille mit dem Schlüssel `unschlagbar` wird rot mit 💀 gezeigt.
`fahrhilfen` (lenkhilfe, bremshilfe), `rennen` (Rundenbereich, Gegner).
`physik.untergrund`: je Untergrund `grip`, `rollwiderstand`, `vMaxFaktor` (Höchsttempo × Faktor, z. B. Gras 0,5), optional `vMaxAbs` (m/s-Deckel); `oel` und `sandFleck` gehören zu den Hindernissen.

## Übertragung vom Entwicklungs-Container auf den Mac
Paket `_hilfsdateien/uebertragung_<Zeit>.tgz` (immer neuer Name), auf dem Mac entpacken mit `tar xzf … --overwrite`, MD5 vergleichen.
