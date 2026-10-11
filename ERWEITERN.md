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
src/track/looping.js     Looping (Fantasie); src/world/dynamik.js: Bälle, Wasserstrahlen, Strohballen
src/track/schanze.js     Runde 4: Sprungschanzen (R.Schanzen, Flugphysik)
src/world/pickups.js     Runde 4: Turbo-Felder + Schutzschild (R.Pickups)
src/world/wetter.js      Runde 4: Jahreszeit/Wetter/Wind (R.Wetter: erlaubt, aufloesen, umwelt, Partikel, Wolken)
src/physics/schaden.js   Runde 4: Schaden/Gesundheit, Wracks-Grafik, Abschleppwagen (R.Schaden)
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
`waehlbar: false` (optional) = Auto erscheint weder im Spielermenü noch als Computer-Gegner (z. B. `polizei`); Menü, `main.js` (Gegnerverteilung, `autoOk`) und `autoVorschau.js` nutzen `R.carCatalog.waehlbare()`. Fehlt das Feld, ist das Auto wählbar.

## Neuer Fahrer
In `src/config.js` unter `fahrer` einen Eintrag `{ name, emoji }` anhängen (Emoji als Avatar, keine Fotos/Logos). Das Menü-Raster passt sich an
(Solo 6 Spalten, zu zweit je Spieler 3 Spalten – ab 13+ Fahrern wird es eng). `fahrerStandard` = Vorauswahl Spieler 1/2,
`fahrerComputerVorrang` = Namen, die Computer-Gegner zuerst bekommen. Emojis dürfen sich nicht doppeln (Emmy 🦁, Jonas 🐯, Kerle 🐺).

## Neue Strecke
In `src/track/trackCatalog.js` einen Eintrag kopieren: `punkte` = geschlossene Liste [x, y, z] in Fahrtrichtung, Start bei Index 0 auf einer Geraden.
Regeln (werden von `node tests/test_strecke.js` geprüft): Radius ≥ 25 m, Abstand nicht benachbarter Teile ≥ 40 m, Steigung ≤ 8 %; Länge seit Runde 4 ca. 2.400–3.400 m (Fantasie bleibt mit ~1.400 m kurz).
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

## Runde 4: Welten, Wetter, Schaden
**Welten-Datenmodell** (trackCatalog.js): jede Strecke hat `welten: { name: { schicht: bool } }` und `weltStandard: 'name'`.
Schichten: `hindernisse, wracks, strohballen, spuren, schanzen, baelle, wasserstrahlen, boost, schild, loopings`. Die Hilfsfunktion
`vierWelten({ ... })` erzeugt Klassisch → Hindernisse → Stunt → Verrückt (jede baut auf der vorigen auf; Änderungen wie `{ strohballen: false }` für alle). `R.weltInfo` = Name/Emoji/Text fürs Menü.
`new R.Strecke(daten, { welt })` filtert die Listen nach den aktiven Schichten (`strecke.welt`, `strecke.weltDaten`, `strecke.daten`); ungültige/leere Welt → `weltStandard`. Fehlt `welten`, ist alles aktiv wie früher.
`aktiveSchichten`: `R.Strecke.weltSchichten(daten, name)` liefert `{ schicht: bool }` (alle Schichten belegt). Die Menü-Pillen kommen aus `Object.keys(daten.welten)`.

**Neue Katalogfelder** (s = Bogenlänge in m; Regeln in `tests/test_strecke.js`):
- `spuren: [{ s0, s1, spuren: 1|3 }]` – 1 Spur = 5 m mit Leitplanke, 3 Spuren = 15 m, Übergang 40 m (Schicht `spuren`).
- `schanzen: [{ s, winkel: 8|12, laenge }]` – nur auf Geraden mit ≥ 60 m freier Landung (Schicht `schanzen`).
- `boostFelder: [{ s, seitenabstand, laenge }]` und `schilde: [{ s, seitenabstand }]` – Turbo +25 % für 2,5 s / Schild blockt 1 Treffer (Schichten `boost`, `schild`; Werte `config.stunt`).
- `wracks: [{ s, seitenabstand, brennt, autoId }]` – liegengebliebenes/brennendes Auto (Schicht `wracks`; `config.hindernisse.wrack/brand`).
- `strohballen: [{ s, von: -1|1, intervall, tempo }]` – rollende Ballen (Schicht `strohballen`; `config.strohballen`).

**Module:** `wetter.js` (R.Wetter; erlaubtes Wetter je Jahreszeit+Thema: `config.jahreszeiten[jz].wetter` / `.wetterWueste`, Wirkung `config.wetter[...]`, Wind `config.wind`),
`schaden.js` (R.Schaden; `config.schaden`), `schanze.js` (R.Schanzen; `config.stunt.schanze`), `pickups.js` (R.Pickups; `config.stunt.boost/schild`).

**Einstellungsfelder** (`spiel.einstellungen`, gespeichert und in `main.js einstellungenPruefen` geprüft): `welt` ('' = Standard der Strecke), `jahreszeit` ('fruehling'|'sommer'|'herbst'|'winter'|'zufall'),
`wetter` ('klar'|'regen'|'schnee'|'hagel'|'nebel'|'sandsturm'|'zufall'), `windStaerke` (0–5 oder 'zufall'), `windRichtung` ('zufall' oder Winkel), `schaden` (bool), `gegner` (0–`config.rennen.gegnerMax` = 10).
Das Menü (`menu.js`) hält die Kombination gültig: Streckenwechsel setzt `welt` auf '', Jahreszeitwechsel setzt `wetter` auf 'klar'; die Wetter-Pillen kommen aus `R.Wetter.erlaubt(thema, jahreszeit)`
(Wüste: Winter-Pille heißt „Sandsturm-Zeit“). Neue Welt = Eintrag in `welten` + `R.weltInfo`; neues Wetter = Eintrag in `config.wetter` und in die `wetter`-Listen der Jahreszeiten.

## Runde 5: neue Module
- `src/world/polizei.js` (`R.Polizei`, Logik ohne THREE + Glue): Streifenwagen jagt Spieler, Anhalten 10 s; Einstellung `polizei` (bool, Standard aus), `config.polizei`. Das Auto kommt aus dem Katalog (`id: 'polizei'`, `waehlbar: false`) und steht in `spiel.fahrzeuge` hinter allen Teilnehmern (nicht in RaceManager/Ergebnis).
- `src/track/anlauf.js`: Anlauf-Hilfe vor Loopings/Schanzen (Mindesttempo, weiche Bremse, Taste R/T = Anlaufposition; `config.anlauf`).
- `src/world/kleber.js`: Kleberstreifen (Fantasie); Katalogfeld `kleber: [{ s0, s1, seite: -1|1|0 }]`, Schicht `kleber`, `config.kleber`.
- Katalogfeld `dinos: [{ s, von: -1|1, intervall, tempo, art: 'dreihorn'|'langhals' }]` (Schicht `dinos`, ab Welt Hindernisse; Logik in `dynamik.js`, `config.dinos`). Strecke Dino: Bauplan `tests/bauplan/dino.json`, Deko in `themes.js` (`dinoDeko`).
- Tempo-Klasse: Einstellung `tempoKlasse` ('normal' Standard | 'schnell'), wirkt in `Vehicle` auf vMax/Beschleunigung/Bremse.

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
