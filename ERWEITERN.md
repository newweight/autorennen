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
src/physics/collisions.js Bande (Zaun), Auto-Auto-Stöße als gedrehte Rechtecke (OBB/SAT), Rempeln, Looping-Abstand, Pflanzen-Kollider
src/cars/carCatalog.js   DATEN der Autos             <- neues Auto hier eintragen
src/cars/carBuilder.js   Low-Poly-Karosserien je Typ (cabrio, van, limousine, sportwagen, coupe, kombi, kleinwagen, suv)
src/track/spline.js      Catmull-Rom-Spline, Abtastung, nächster Punkt
src/track/trackCatalog.js DATEN der Strecken         <- neue Strecke hier eintragen
src/track/trackBuilder.js Straße, Randsteine, Zaun, Checkpoints, Ideallinie, Brücken, Tunnel, Hindernisse
src/track/looping.js     Looping (Fantasie); src/world/dynamik.js: Bälle, Wasserstrahlen, Strohballen
src/track/schanze.js     Runde 4: Sprungschanzen (R.Schanzen, Flugphysik)
src/world/pickups.js     Runde 4: Turbo-Felder + Schutzschild (R.Pickups)
src/world/wetter.js      Runde 4: Jahreszeit/Wetter/Wind (R.Wetter: erlaubt, aufloesen, umwelt, Partikel, Wolken); Runde 6: Tageszeit (Licht, Himmelskuppel, Sterne, Mond)
src/race/startBoost.js   Runde 6: Start-Boost (R.StartBoost, reine Logik)
src/race/sterne.js       Runde 6: Sterne-Wertung (R.Sterne, localStorage)
src/race/pokal.js        Runde 6: Pokal-Serie, Punkte, Siegerehrung, „Letzter fliegt raus“-Anzeige (R.Pokal, R.PokalAnzeige, R.Puff)
src/world/muenzen.js     Runde 6: Münzen auf der Strecke (R.Muenzen)
src/ui/garage.js         Runde 6: Garage – Konto, Lack, Upgrades, Reparatur (R.Garage, R.Garage.Bildschirm)
src/physics/schaden.js   Runde 4: Schaden/Gesundheit, Wracks-Grafik, Abschleppwagen (R.Schaden)
src/world/themes.js      Wiese / Wald / Wüste / Fantasie: Farben, Nebel, Deko (InstancedMesh)
src/ai/driver.js         Computerfahrer (Ideallinie, Skill, Gummiband, Ausweichen)
src/race/raceManager.js  Countdown, Checkpoints, Runden, Platzierung
src/render/cameras.js    Verfolger-/Cockpit-/Weitkamera, Split-Screen in main.js
src/ui/menu.js, hud.js, styles.css   Menü, HUD, Minimap, Ergebnis, Pause
src/main.js              Spielzustände, Schleife, Szenenaufbau
src/ui/touch.js          W5-3: Touch-Steuerung Handy/Tablet (R.Touch), siehe „W5-3: Touch“ unten
src/net/protokoll.js     W5: gemeinsame Netz-Konstanten/Helfer (R.Netz) für Browser UND Server (Raumcode, Eingabe-Kodierung, Fahrzeugfelder)
src/net/client.js        W5: WebSocket-Verbindung /ws, Ping, Server-Uhr (R.NetzVerbindung)
src/net/vorhersage.js    W5: Vorhersage eigener Wagen + Neuabgleich (R.NetzVorhersage), Interpolationspuffer (R.NetzPuffer)
src/net/qr.js            W5: eigener QR-Encoder (Byte-Modus, ECC M, SVG) ohne Abhängigkeit (R.QR)
src/net/online.js        W5: Online-Bildschirme (Start/Code/Lobby/Ergebnis) + Online-Rennen im Zustand 'online' (R.Online)
server/                  W5: Mehrspieler-Server (Node ≥ 18, nur `ws`): server.js, simulation.js, PROTOKOLL.md, README.md, bin/node-macos-arm64
tests/                   node tests/test_*.js | zaun_test.js | python3 tests/*_test.py (Liste siehe „Testdateien“ unten)
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
- `kreuzungen` (Runde 6, W4-J, Fantasie): `[{ s0, s1 }]` – niveaugleiche Kreuzung mit sich selbst; s0..s1 = Bereich des ERSTEN Abschnitts, in dem sie liegt (siehe unten „Kreuzung“).
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

## Runde 6: Kollisionen, Tageszeit, Varianten, Start-Boost, Sterne
**Kollisionen** (`collisions.js`, `config.kollision`, `config.pflanzen`, `config.schaden`; alles Add-on, Standard `rempeln: 'sanft'`):
- `autoAuto`: Autos = gedrehte Rechtecke (laenge × breite), SAT-Trennung in `teilschritte` (2) Durchgängen, danach `mindestAbstand` (0,1 m) Luft; Sweep über `vehicle._kollAlt` gegen Durchschießen bei hohem Tempo; Auto an der Bande zählt beim Trennen 10× so schwer (main.js prüft danach die Bande für verschobene Autos). `obbAbstand()` dient den Tests.
- `rempeln` (Einstellung `'echt'`): Drehimpuls (`vehicle.drehImpuls`), Abdrängen (Querimpuls `querMin..querMax` bei 15–45° von hinten), Nebeneinander-Schieben (< `flachGrad`); Masse und Tempo entscheiden; KI ab `kiAbRang` (profi) rempelt gezielt (`driver.rempler`). Meldung „Dreher! 🌀“.
- `loopingAbstand(fahrzeugListe, strecke)`: hält zwei Autos im selben Looping `laenge + loopingAbstand` Bogenlänge auseinander (looping.js unverändert).
- Schaden: `schaden.mindest.auto` 1 m/s, `schaden.verluste` (bande 3, pflanze 3), `drehungVerlust` 3.
- **Pflanzen-Kollider**: `pflanzenSammeln(strecke, deko)` (main.js `streckeSzeneBauen`, vor `statischVorbereiten`) macht Kreis-Kollider aus den Deko-Instanzen bis `grenzeBei(s) + zugabe`; Radius = Fuß der Geometrie (≤ `fussHoehe`). Welche Deko-Gruppen fest (wie Säule) oder weich (Tempo × `weichTempo`) sind, steht in `config.pflanzen.fest/weich` – neue Deko-Gruppe dort eintragen. `pflanzen()` wendet sie an.
- Abseits: `physik.untergrund.gras/sand` mit `vMaxAbs` (60/50 km/h), Übergang Rand→Gras/Sand weich über `physik.abseitsUebergang` m (`vehicle.untergrundMisch`), `abseitsAnfahren` (m/s) damit man aus dem Sand wieder loskommt.

**Tageszeit** (`config.tageszeit`, `tageszeitStandard: 'tag'`): `tag` hat keine Werte (Licht bitgleich wie vorher), `daemmerung`/`nacht` mit Themen-Ausnahmen (`wueste`, `fantasie`). `wetter.js` nimmt `opt.tageszeit` (→ `w.tz`, `tageszeitEmoji`, `nacht`) und setzt Sonne/Mond, Halbkugellicht, Himmelskuppel mit Verlauf, Sterne, Wolken. Straßenlaternen: Themenflag `laternen: true` (Wiese, Wald) + `themes.js laternenBauen()`. `main.js`: nachts Spot-Lichter an den Spielerautos und Punktlichter (Tunnellampen bzw. nächste Laternen), `carBuilder.setzeLicht(auto, an)` für Scheinwerfer/Rücklichter. Neue Farbvariante = Eintrag in `config.tageszeit` (+ Menü-Pille in `menu.js`).

**Streckenvarianten**: Katalogfeld `varianten: { xl: { name, faktor, zeitFaktor, beschreibung } }` (Wüste 1,6, Fantasie 2). `R.Strecke.varianteAnwenden(daten, id)` liefert eine skalierte KOPIE (Kontrollpunkte x/z und Hügel um den Schwerpunkt × Faktor, y bleibt; alle Listenfelder `s/s0/s1` × Faktor; absolut bleiben Looping-Radius, Schanzenlänge, Anlauf, `checkpointAbstand`). `new R.Strecke(daten, { welt, variante })`; `strecke.variante`, `strecke.katalog` = skalierte Kopie. `zielRundenzeit` wird mit `zeitFaktor` (nicht `faktor`) skaliert, weil die Rundenzeit nicht linear mit der Länge wächst. Eine Variante für eine weitere Strecke = nur der `varianten`-Eintrag. Menü: Zeile `m-variante`, Taste V, Streckenwechsel setzt zurück.

**Welt „Alles“**: `trackCatalog.js` hängt je Strecke `welten.alles` (alle Schichten `true`, inkl. loopings/kleber/dinos) als letzte Welt an; `R.weltInfo.alles`. Die Polizei bleibt eigener Schalter.

**Start-Boost** (`src/race/startBoost.js`, `config`-unabhängige `STANDARD`-Werte im Modul): Gasdruck-Beginn im Fenster −0,25…+0,15 s um LOS → 1,5 s lang vMax/Beschleunigung × 1,2; zu früh und bei LOS gehalten → 1 s Gas gesperrt. KI würfelt (Chance 0,95 − 3,2 × `fehler`). Hook in `main.js physikSchritt` vor der Countdown-Sperre; Faktoren wirken nach den Pickup-Faktoren.
**Sterne** (`src/race/sterne.js`): `bewerten(platz, imZiel, beste, zielzeit)` → 0–3; Zielzeit = `zielRundenzeit` der (ggf. skalierten) Strecke, bei Tempo „schnell“ × 0,9. Summe je Fahrername in `localStorage` `rennspiel.sterne.v1` (try/catch, Rückfall im Speicher); `rennenFertig` liefert `zeile.sterne/sterneGesamt`.

**Reifen** (`carBuilder.js radGeometrie(r, w, zoll, felgeFarbe, slick)`): Flanke + Lauffläche mit Rillen und Querblöcken, 3D-Felge, Bremsscheibe; roter Sattel fest in der Karosserie (`bremssattel()`); Cache je Radgröße+slick; Limit ≤ 600 Dreiecke je Rad (Slick ≤ 400), geprüft in `test_autos.js`.

**Neue Einstellungsfelder** (`spiel.einstellungen`, Standard/Prüfung in `main.js einstellungenPruefen`): `rempeln` ('sanft'|'echt'), `tageszeit` ('tag'|'daemmerung'|'nacht'), `variante` ('' = Normal | Name aus `varianten`), dazu `tempoKlasse`, `polizei` (Runde 5). Menü: Pillen „🌀 Rempeln“ (rechts), „🌗 Tageszeit“ (links unten), Zeile „📏 Variante“.
**Neue Katalogfelder**: `varianten`, `welten.alles`; Dino-/Wald-Ausbau (W2-C, laut VERLAUF noch in Arbeit, Details im Code prüfen): `tiere: [{ art: 'reh'|'baer', s, von, intervall, tempo }]` (Wald, Schicht `dinos`, `config.tiere`), Dino-Strecke zusätzlich `meteoriten`, `flugsaurier`, `vulkan` (`config.dino`).

## Runde 6 (W3): Pokal, Münzen, Garage, Ölfalle
- **`src/race/pokal.js`**: `R.Pokal` (rein, Node-testbar): `strecken(groesse)`, `punkte(platz)`, `staerke(start, nr)`, `gewinne(name)`/`gutschreiben(name)`, `new Serie({groesse, startStaerke, basis})` mit `rennenEinstellungen()`, `ergebnisEintragen(zeilen)`, `tabelle()`. Dazu `R.PokalAnzeige` (DOM: Zwischenstand, Siegerehrung, Rückfrage) und `R.Puff` (Three.js). Werte in `config.pokal` (Größen, Reihenfolge je Größe, Punkte, `maxStaerke`, `elimination`). Einstellungen `spielart` ('rennen'|'pokal'|'elimination') und `pokalGroesse`; Pokal-Rennen laufen über `rennenStarten(ein, { temporaer: true })` (nicht gespeichert). „Letzter fliegt raus“ steckt im RaceManager (Option `elimination`); `ergebnis.zeilen[i].raus` = Runde des Ausscheidens.
- **`src/world/muenzen.js`**: `R.Muenzen(strecke)` – `bauen()` (eine InstancedMesh), `schritt(dt, fahrzeuge)` → Einsammel-Ereignisse, `animieren(zeit)`, `anzahlVon(nr)`. Platzierung deterministisch aus der Strecke (`config.garage.muenzen`). Keine Physik. Rechenteil ohne Three.js.
- **`src/ui/garage.js`**: `R.Garage` (Konto, `gutschreiben`, `farbeKaufen`, `upgradeKaufen`, `reparieren`, `restSetzen`, `faktoren`, `preisgeld`) und `R.Garage.Bildschirm` (Fahrer → Auto → Werkstatt). Werte in `config.garage` (Preise, Farben je Auto, `upgradeJeStufe`, `restMin`). Einstellung `upgradesZaehlen` (Schalter). Nur Spieler bekommen Garage-Werte.
- **Ölfalle** (`src/world/pickups.js`, `config.stunt.oelfalle`): Ölfässer 35 m hinter jeder Schild-Kugel (nur wo es Schilde gibt), Item 🛢️, Tasten `config.tasten.item1/item2` (Space/E), Fleck = Untergrund `'oel'`, KI sammelt und legt selbst. Flugsaurier-Größe: `config.dino.flugsaurier`.
- **Ergebnistafel** (`menu.js ErgebnisAnzeige`): `ergebnis.zeilen[i]` hat `preisgeld`, `muenzenRennen`, `muenzenGesamt` (nur Spieler; KI: Spalte „–“).
- **Cockpit-Kamera** (`cameras.js`): `kamera.rotation.order = 'YXZ'`, sonst rollt der Horizont bei Fahrtrichtung ±90° (Gimbal-Lock); getestet in `tests/cockpit_test.py`.

**Speicherformate** (`localStorage`, alle Zugriffe in try/catch, Rückfall im Arbeitsspeicher):
- `rennspiel.pokale.v1`: Pokal-Gewinne je Fahrername (nur menschliche Sieger).
- `rennspiel.garage.v1`: `{ "<Fahrer>": { muenzen, autos: { "<autoId>": { farbe (null = Original), farben: [gekaufte], motor, reifen, bremsen (0–3), rest (0–100) } } } }`.
- `rennspiel.sterne.v1`: `{ "<Fahrername>": Summe der Sterne }`.

## Runde 6 (W4-J): niveaugleiche Kreuzung (Fantasie)
Die Fantasie-Strecke ist seit W4-J eine **Acht** (Bauplan `tests/bauplan/fantasie.json`: `G260 K40/90 G130 K45/90 G? K30/-270 G? K35/90 G85`,
1.420 m): die Ost-Gerade nach Looping 2 kreuzt den Ausgang der 270°-Schleife auf gleicher Höhe (sA ≈ 898, sB ≈ 1100, ≈ 89°).
- **Katalog** `kreuzungen: [{ s0, s1 }]`. `trackBuilder._kreuzungBerechnen` sucht im Bereich die Stelle, an der ein fremder Abschnitt (Δs > 80 m)
  am nächsten ist → `strecke.kreuzungen[i] = { sA, sB, x, z, winkel, dy, a: { s0, s1 }, b: { s0, s1 }, halbW, halbL, masten, warnA, warnB }`;
  `|Δy| ≥ 1 m` → keine Kreuzung (das wäre eine Überführung, `ueberfuehrungen`). Varianten (XL) skalieren s0/s1 mit, die Stelle wird neu gesucht.
- **Sperrzone**: `strecke.kreuzungNah(s, zugabe)` (sA bzw. sB ± 15 m + zugabe), `kreuzungBei(s, zugabe)` → `{ k, pass: 'a'|'b', d }`.
  Deko: `dekoSperre` (Kreis 36 m um die Mitte), Münzen (± 35 m je Abschnitt), Laternen, Reset-Suche (main.js) und die Katalog-Listen
  (`test_strecke`: Sperrzone „Kreuzung“) halten Abstand.
- **Index-Kontinuität** wie an der Überführung: `strecke._naechsterKont` (lokal ± 60 Punkte, global erst > Bande + 15 m) gilt auch bei Kreuzungen –
  benutzt von `abfrage/untergrundAn`, `RaceManager` (Checkpoints, `verfolgungSetzen`), `driver.js` (eigene Position) und `collisions.bande`
  (die Bande gilt für den EIGENEN Abschnitt, sperrt also die querende Fahrbahn nicht). Ohne Kreuzung bleibt alles bitgleich.
- **Untergrund**: auf der querenden Fahrbahn liefert `abfrage` 'strasse'/'rand' (`_kreuzungUntergrund`), sonst wäre sie für Autos des anderen
  Abschnitts „Gras“.
- **Grafik** (`_kreuzungBauen`): Randsteine und Mittellinie sind auf der Kreuzungsfläche ausgespart (`_querAbstand`), eine Kreuzungsplatte
  (Parallelogramm |qA|, |qB| ≤ Fahrbahn + Rand, polygonOffset 3) überdeckt beide Fahrbahnbänder (kein Z-Fighting), weiße Haltelinien,
  bunter Zauberkreis. Der Zaun entfällt dort automatisch (`zaunPunkte`: anderer Abschnitt näher).
- **Warnlicht**: 4 Masten (`k.masten`, je Zufahrt rechts, je Ausfahrt links; feste Säulen in `strecke.saeulen`): Zuckerstangen-Mast,
  Andreaskreuz, 2 rote Leuchtkugeln + Lichthof. `strecke.kreuzungWarnung(fahrzeuge)` setzt `warnA/warnB` (Auto im anderen Abschnitt
  < 60 m vor der Kreuzung oder darauf), `strecke.kreuzungAnimieren(zeit, fahrzeuge)` (main.js je Frame) blinkt abwechselnd: ruhig 1,2 Hz
  gedämpft, bei Querverkehr 3 Hz hell. Spieler bekommen „🚦 Achtung Kreuzung!“ (einmal je Zufahrt, nur bei Querverkehr). Minimap: rotes Andreaskreuz.
- **KI** (`driver._querverkehr`): Autos der querenden Zufahrt (bis 120 m davor, über `o.s` der Rennleitung) sind Querverkehr, nicht „Auto vor
  mir“. Überlappen die Belegungszeiten der Kreuzungsfläche (± 0,5 s), gibt der später Einfahrende nach (bremst auf Ankunft nach der Ausfahrt
  des anderen); Gleichstand: Abschnitt A hat Vorfahrt. Wer schon an/auf der Kreuzung ist oder nicht mehr anhalten kann, fährt durch; nach
  5 s Warten fährt die KI trotzdem (kein Hängen); Warten zählt nicht als Festfahren. Stehende Autos auf der Kreuzung = normales Hindernis.
- Neue Kreuzung woanders: Strecke als Acht (Gesamtdrehung 0°, `G?` schließt die Lage) im Bauplan, `kreuzungen` eintragen, Listen ≥ 35 m
  weg; `node tests/test_strecke.js <id>` prüft Winkel 70–110°, |Δy| < 1 m, 40-m-Ausnahme nur an der Kreuzung, Index-Kontinuität, Masten.

## W5: Mehrspieler online (Server, Netzcode, Zustand 'online')
**Start**: `Mehrspieler starten.command` / `Mehrspieler im Internet starten.command` (+ Tailscale Funnel) → `server/server.js --port 8443
--oeffentlich <https-Adresse>`. Node aus dem PATH (≥ 18), sonst `server/bin/node-macos-arm64` (Node 24 LTS). Handgriffe: `server/README.md`,
Nachrichten: **`server/PROTOKOLL.md`**.
- **server/server.js**: HTTP nur für `Autorennen.html`, `src/`, `vendor/` (kein Listing, kein `..`/`\`/Dotfiles, nur GET/HEAD, MIME-Liste),
  WebSocket nur unter `/ws` (`maxPayload` 4 KB, Nachrichtenbremse, Herzschlag 5 s). Räume (`raeume` Map, Code `Netz.CODE_ZEICHEN` ohne 0/O/1/I,
  max. 6 Menschen, 30 Räume), Zustände `lobby → laden → rennen → ergebnis`. Spielschleife: ein `setInterval(4 ms)` für alle Räume mit
  Zeitakkumulator, fester Schritt 1/60 s (höchstens 6 Schritte nachholen), je Tick pro Spieler eine Eingabe aus der Warteschlange
  (`ack` = letzte verarbeitete Folge-Nr), Zustand alle 3 Ticks (20 Hz; gemeinsamer Teil einmal serialisiert + `ich` je Empfänger).
  `starten({ port, host, leise, tempo, ladenMaxMs, oeffentlich })` ist für Tests exportiert (`tempo` = Zeitraffer nur für Tests).
- **server/simulation.js**: lädt die Spiel-Dateien wie `tests/lade.js` in einen vm-Kontext (dazu `three.min.js` für die Deko-Kollider und ein
  `document`-Stub für Canvas-Texturen; kein WebGL) – **inkl. `src/main.js`**: Der Server rechnet mit `Spiel.prototype.physikSchritt` auf einem
  kopflosen Spiel-Objekt (keine Meshes/Kameras/Ton) – also exakt dieselben Regeln wie lokal: vehicle, collisions (Bande, Pflanzen,
  Hindernisse, Wracks, Laternen nachts), Loopings, Schanzen, Anlauf, Kleber, Dynamik (Bälle/Dinos/Stroh), Pickups (Turbo/Schild/Ölfalle),
  Start-Boost, raceManager, driver.js (KI). Online aus: Schaden, Polizei, Münzen, Garage-Upgrades. `hud.meldung` wird zu `ereignis`-Meldungen.
  Wetter/Wind-Zufall wird im Server mit Seed aufgelöst und konkret an alle geschickt. Gast weg → `zuKI(nr)` (neuer `R.Driver`);
  keine Menschen mehr → Rennende; 60 s nach dem ersten Menschen im Ziel → Ergebnis.
- **Geister / Stufe 2**: `laden()` hüllt `Kollisionen.autoAuto` und `loopingAbstand` ein – solange die laufende Simulation `kollisionen: false`
  hat, liefern sie nichts. **Stufe 2 einschalten**: Raum-Einstellung `kollisionen: true` (Host schickt `{t:'einstellungen', einstellungen:
  {kollisionen:true}}`; `einstellungenPruefen` lässt nur `true` durch). Der Browser zeichnet dann die anderen Autos deckend und die Lobby zeigt
  „💥 Rempeln an“. **Menü (W5 Stufe 2)**: Lobby-Zeile `kollisionen` in `online.js zeilen()/werte()/wertSetzen()` (Host: 👻 Geister / 💥 Rempeln,
  Wert wird in `spiel.einstellungen.kollisionen` gemerkt – `main.js` `standardEinstellungen/einstellungenPruefen`, Standard false – und bei
  `raumErstellen` mitgeschickt). **Vorhersage**: `NetzVorhersage` (Optionen `kollisionen`, `andere: [{ nr, auto }]`, `rempeln`) hält je Gegner ein
  Stellvertreter-`R.Vehicle`, `abgleich(ich, anzeige, zustand.a)` setzt sie auf die Server-Pose, `_autoAuto` rückt sie je Folge-Nr vor und ruft
  `Kollisionen.autoAuto`; ohne `kollisionen` ist alles wie vorher. Grenzen: Gegner fahren in der Vorhersage geradeaus; Anzeige der anderen
  ~100 ms + Ping/2 hinter dem eigenen Wagen; sinnvoll ab Ping < 100 ms.
- **Browser** (`src/net/online.js`): `menu.js` hat eine 5. Modus-Karte `online` (`onlineGewaehlt`, `htmlOnlineKarte`, `onlineOeffnen`; von
  `file://` ausgegraut via `R.Online.verfuegbar()`). `R.Online.Bildschirm` zeigt Start/Code-Eingabe (fängt Buchstaben vor den Spieltasten ab)/
  Lobby (Code, Link + QR aus `einladungsBasis`: bei localhost/Heimnetz-IP die `oeffentlich`-Adresse des Servers)/Ergebnis. `?raum=ABCD` öffnet
  beim Laden direkt die Code-Eingabe. Beim `start` baut `rennenAufbauen` die Szene mit den **bestehenden** main.js-Teilen
  (`streckeSzeneBauen`, `fahrzeugHinzufuegen`, `kameraHinzufuegen`, `R.Hud`), eine Puppen-Rennleitung (`R.RaceManager`, Werte vom Server)
  und setzt **`spiel.zustand = 'online'`**, `spiel.online = Bildschirm`.
- **main.js-Haken** (alle fragen `zustand === 'online'`, der lokale Weg bleibt bitgleich): `taste` → `online.rennTaste` (Esc = „Verlassen?“,
  keine Pause), Item-Taste → `online.item()`, `zuruecksetzen` → `online.reset()` (Server setzt zurück), `physikSchritt` → `online.physikSchritt(dt)`
  (statt Rennleitung: Eingabe aus `input.steuerung(0)`+`(1)` – Tastatur und Touch – quantisieren, 60 Hz mit Folge-Nr senden, eigenen Wagen
  vorhersagen, andere 100 ms hinter der Server-Zeit interpolieren, Bälle/Dinos/Pylonen nur als Optik nachrechnen), Ton/adaptive Qualität
  auch im Zustand 'online'.
- **Vorhersage** (`vorhersage.js`): Schritt = Spielerauto-Teil von `physikSchritt` (Untergrund + Abseits-Mischung, Fahrhilfe, Turbo-/Boost-
  Faktoren `ich.fk`, Wetter-Umwelt, Bande, Pflanzen, Höhe). Neuabgleich: Server-Zustand (`Netz.FAHRZEUG_FELDER`) übernehmen, Eingaben mit
  `n > ack` neu rechnen, Abweichung weich ausblenden (τ 0,12 s), > 3 m hart. Sonderzustände (`ich.so`: Looping, Flug/Rampe, Anlauf-Bremse,
  Kleber) rechnet nur der Server. Wer an `vehicle.js`/`collisions.bande`/`pflanzen` etwas ändert, muss `test_netz.js` A laufen lassen (Vorhersage
  = Server auf allen Strecken).
- **Neue Nachricht**: in `server.js nachricht()` (Raum-Nachrichten zusätzlich in `RAUM_NACHRICHTEN`), Browser `verbindung()` → `v.bei('typ', …)`,
  in `PROTOKOLL.md` eintragen; Werte immer auf erlaubte Listen prüfen (keine Freitexte!).
- **Tests**: `node tests/test_netz.js` (Vorhersage = Server auf 6 Strecken, Geister/Stufe 2, Teil K: Rempeln mit Stellvertretern gegen ohne, HTTP-Sperren, kaputte Nachrichten, Raum/Lobby/
  Start/Eingaben/ack/Checkpoints/Runde/Ergebnis mit 2 Clients im Zeitraffer, Gast/Host trennt, max. 6, Ping, öffentliche Adresse) und
  `python3 tests/online_test.py` (Server als Unterprozess, 2 Browser: Lobby + QR (OpenCV liest ihn), Link `?raum=`, Code-Eingabe, Geister,
  20 s fahren, Positionen beider Sichten < 3 m, Runde, Ergebnis, Host geht). Bilder: `tests/out/online/`.

## W5-3: Touch-Steuerung (src/ui/touch.js)
Reines Add-on, Script-Tag direkt nach `src/input.js`; auf Geräten ohne Touch (`'ontouchstart' in window || navigator.maxTouchPoints > 0`, `?touch=0/1` überschreibt) endet die Datei sofort (`R.Touch = { aktiv: false }`, kein DOM) – Desktop bleibt bitgleich.
- **Eingabe**: `Input.prototype.steuerung` wird eingehüllt: Spieler 0 = Maximum aus Tastatur und `R.Touch.werte()` (gas/bremse 0|1, lenkung −1..1; Lenkung = der betragsmäßig größere Wert). `input.js` selbst ist unverändert; `client`/`online.js` lesen weiter `input.steuerung(0)+(1)`.
- **Einzeltasten** (Item/Reset/Kamera/Pause): echte `KeyboardEvent`s mit den `event.code`s aus `R.config.tasten` (`R.Touch.tasteSenden(code)`), also derselbe Weg wie die Tastatur – lokal (`main.taste`) und online (`online.rennTaste`). Online zeigt die Pause-Taste 🚪 (öffnet „Rennen verlassen?“).
- **Zeiger**: `pointerdown` auf `#touch [data-t]`, `pointerId → Taste` (Map `zeiger`), `pointermove` schaltet beim Wischen auf eine andere Halte-Taste, `pointerup/cancel/blur/visibilitychange` lassen los. Halte-Tasten: links, rechts, gas, bremse; Tipp-Tasten: item, reset, kamera, pause, neigen (Click-Weg, weil iOS `requestPermission` aus einer Berührung verlangt).
- **Neigung**: `deviceorientation` → `T.neigungZuLenkung(beta, gamma, winkel)` (Totzone 3°, Anschlag ±28°, Vorzeichen je nach `screen.orientation.angle`); an/aus nur über die 📱-Taste.
- **Sichtbarkeit**: `setInterval(100 ms)` prüft `R.spiel.zustand` (`rennen` ohne Pause / `online` mit `online.phase === 'rennen'` und ohne Dialog) → `html.t-rennen`. Layout und HUD-Verschiebung (Karte rechts, Tacho links über den Daumen) stehen im `STIL`-String der Datei (nicht in styles.css); Größen über `--tb` (Tastengröße, `clamp(64px, 24vh, 124px)`), `--rand`, `--hf` (HUD-Schriftgröße für den Abstand zur Pause-Taste). Safe-Area per `env(safe-area-inset-*)`.
- **Menü**: `html.touch-an`-Regeln (kleinere Schrift, scrollbarer Inhalt, größere `.m-nav`-Tasten, Hinweiszeile weg); `MutationObserver` hängt im letzten Schritt „🏁 Los!“ in die Leiste; Capture-Click: 2. Tippen auf `.karte.gewaehlt` (strecke/fahrer/auto, nur allein) → `menue.weiter()`. Raumcode: vorhandene Bildschirm-Tasten (`.on-tasten`), per CSS größer.
- **Qualität**: `Spiel.prototype._startStufe` wird eingehüllt (+1 Stufe → pixelRatio ≤ 1,25; adaptiv wie gehabt). Hochformat: `#t-quer` (CSS `@media (orientation: portrait)`). Vollbild `#t-voll` nur mit `requestFullscreen`/`webkitRequestFullscreen`. Bildschirm bleibt per Wake Lock an (wenn vorhanden).
- **Test**: `python3 tests/touch_test.py` (76 Prüfungen, Bilder `tests/out/touch/`). Multi-Touch im Test über CDP `Input.dispatchTouchEvent` (bei `touchEnd` sind die genannten Punkte die losgelassenen).

## Testdateien (`tests/`)
Node (`node tests/<datei>`): `lade.js` lädt die Script-Dateien ohne Three.js für die Tests · `test_autos.js` Auto-Katalog, Werte, Rad-Dreiecke, Multivan bronze · `test_dynamik.js` Bälle + Wasserstrahl · `test_fahrer.js` Fahrerliste/Computer-Namen · `test_hindernisse.js` Öl, Sand, Ast, Baustelle · `test_ki.js` KI-Fahrer (Mathe, beide Tempo-Klassen) · `test_kleber.js` Kleberstreifen · `test_garage.js` Münzen + Garage (Konto, Preise, Upgrades) · `test_pokal.js` Pokal-Punkte, Stärke, Serie, Elimination · `test_kollisionen.js` Bande, Auto-Auto (OBB, kein Verschmelzen), Rempeln, Looping-Abstand · `test_looping.js` Looping · `test_physik.js` Fahrphysik inkl. Gras/Sand-Deckel · `test_pickups.js` Turbo + Schild · `test_polizei.js` Polizei-Logik · `test_rundenzeit.js` KI-Rundenzeiten aller Strecken, auch XL · `test_schaden.js` Schaden-System · `test_schanze.js` Schanzen · `test_startboost.js` Start-Boost + Sterne · `test_strecke.js` Strecken, Welten, Varianten, Regeln (W4-J: Kreuzung) · `test_welten_ki.js` KI in allen Strecken × Welten × 7 Stufen (auch Rempeln, XL; W4-J: Kreuzungs-Begegnungen, Auto parkt auf der Kreuzung, 7 Stufen × 3 Runden) · `test_wetter.js` Jahreszeit/Wetter/Wind/Tageszeit · `test_netz.js` W5 Mehrspieler-Server + Netzcode · `zaun_test.js` Zaun dicht, Pflanzen-Kollider.
Python/Playwright (`python3 tests/<datei>`): `audio_test.py` Ton · `autos_screenshot.py` Auto-Vorschaubilder · `fahrbarkeit_test.py` Fahrbarkeit mit echter Tastatur · `interpolation_test.py` Ruckeln des Auto-Meshes · `leistung_test.py` fps/Draw-Calls · `cockpit_test.py` Cockpit-Kamera ohne Roll in 8 Richtungen + Bilder · `garage_test.py` Garage im Browser · `menu_test.py` Menü und Modi (inkl. Ergebnis-Spalte Preisgeld) · `oel_test.py` Ölfalle + Flugsaurier · `online_test.py` W5 Online mit 2 Browsern · `pokal_test.py` Pokal im Browser · `polizei_test.py` Polizei im Browser · `rempeln_test.py` Rempeln „echt“ im Rennen · `rennen_test.py` ganzes Rennen im Schnellvorlauf · `schaden_screenshot.py` Wracks/Brand/Schaden-Bilder · `screenshot_test.py <strecke>` Strecke starten + Bild (Fantasie: 50–56 Kreuzung) · `touch_test.py` W5-3 Touch-Steuerung (iPhone/iPad quer, Desktop) · `startboost_test.py` Start-Boost im echten Spiel · `stunt_screenshot.py` Schanzen/Turbo/Schild-Bilder · `tageszeit_screenshot.py` Tag/Dämmerung/Nacht (Referenz `tageszeit_tag_referenz.json`) · `welten_test.py` alle Strecken × Welten mit Schaden/Regen/Wind · `wetter_screenshot.py` Wetter-Bilder · `xl_screenshot.py` XL-Varianten. Hilfsdaten: `tests/bauplan/`, `tests/out/` (Ausgaben), `leistung_vorher.json`, `autos_vorschau.html`.

## Versionen
Nach jeder Welle wird der Stand gesichert UND spielbar abgelegt: `Spiele/Autorennen-Versionen/vN_…/` (jeder Ordner mit eigener `Autorennen.html`). Neue Versionen immer in neue Ordner (iCloud-Platzhalter lassen sich vom Container aus nicht überschreiben). Zwischenstände während der Arbeit: `versionen_r6/` und `Autorennen-Sicherung/`.

## Übertragung vom Entwicklungs-Container auf den Mac
Paket `_hilfsdateien/uebertragung_<Zeit>.tgz` (immer neuer Name), auf dem Mac entpacken mit `tar xzf … --overwrite`, MD5 vergleichen.
