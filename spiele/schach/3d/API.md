# Schach3D – API

3D-Brett (Three.js r160, global `THREE` aus `/vendor/three.min.js`) mit Staunton-Figuren, Hunde-Team, frei drehbarer Kamera und Kampfszenen.
Portierung des SceneKit-`Board3DView` aus der Mac-App (siehe `PORTIERUNG.md`). Bestehende Dateien in `spiele/schach/` bleiben unberührt.

## Einbinden

```html
<script src="/vendor/three.min.js"></script>
<script src="/spiele/schach/3d/aktionen.js"></script>   <!-- Aktions-Bibliothek (Ersatz für SCNAction) -->
<script src="/spiele/schach/3d/figuren3d.js"></script>  <!-- Piece3DFactory: Staunton + Hunde-Team -->
<script src="/spiele/schach/3d/schach3d.js"></script>   <!-- Klasse Schach3D: Szene, Kamera, Eingabe, Stellung -->
<script src="/spiele/schach/3d/kampf3d.js"></script>    <!-- Zug-Animation, Kampfszenen, Effekte -->
<script src="/spiele/schach/3d/animation2d.js"></script><!-- optional: 2D-Zuganimation (Canvas-Overlay) -->
```
Die Reihenfolge ist wichtig. Aus `spiele/schach/` relativ: `3d/…`. Der Server liefert `/vendor/` und `/spiele/` aus (`server/server.js`, `ERLAUBT`).

## Koordinaten / Stellung

* `{row, col}`: `row 0` = Reihe 8 (Schwarz oben/hinten), `row 7` = Reihe 1 (Weiß), `col 0` = Linie a – genau wie `ChessBoard.grid` im Swift-Code.
* Stellung = 8×8-Array (`grid[row][col]`), Eintrag `null` oder `{color:'white'|'black', type:'king'|'queen'|'rook'|'bishop'|'knight'|'pawn'}`.
* Weitere Felder an den Figuren (z. B. `moved`) werden ignoriert.

## Klasse `Schach3D`

```js
const s3 = new Schach3D(containerElement, optionen);
```
Der Container braucht eine feste Größe (z. B. `height: 70vh`); das Canvas füllt ihn (`ResizeObserver` passt automatisch an).

| Option | Standard | Bedeutung |
|---|---|---|
| `hunde` | `false` | Hunde-Team statt Staunton-Figuren |
| `kampf` | `true` | Kampfszenen beim Schlagen (sonst einfacher Zug, Opfer blendet aus) |
| `autoWenden` | `false` | nach jedem Zug zur Seite des Gegners wenden |
| `thema` | `0` | Brett-Farbthema 0 Klassik Grün, 1 Holz, 2 Ozean, 3 Candy, 4 Nacht, 5 Turnier Braun (oder Objekt `{hell,dunkel,rand}` RGB 0..1) |
| `qualitaet` | `'auto'` | `'auto'` (adaptiv), `'hoch'`, `'mittel'`, `'niedrig'` |
| `ansichtVonSchwarz` | `false` | Start mit Blick von Schwarz |
| `koordinaten`, `tisch` | `true` | Brettbeschriftung a–h/1–8; Holztisch |
| `onFeldKlick` | – | Callback `(row, col)` |
| `manuell` | `false` | Testmodus: keine eigene Zeitschleife, Fortschritt nur über `schritt()`/`vorspulen()` |

### Methoden

| Methode | Beschreibung |
|---|---|
| `setzeStellung(grid)` | Stellung zeigen (Figuren werden wiederverwendet, geschlagene liegen neben dem Brett). `null` = leeres Brett. Während einer Zug-Animation wird sie vorgemerkt und danach angewendet. |
| `animiereZug(zug)` → `Promise` | `zug = {from:{row,col}, to:{row,col}, capturedPiece?, isCastling?, isEnPassant?, promotion?}`. Spielt Hüpfen bzw. (bei Schlag und `kampf(true)`) die Kampfszene des Angreifers; erfüllt sich, wenn alles fertig ist. Rochade: Turm läuft mit; en passant: Opfer steht neben dem Ziel; `promotion` (`'queen'` …): neue Figur wächst mit Lichtblitz. Danach zeigt das Brett die Stellung nach dem Zug (aus der letzten `setzeStellung` abgeleitet); rufe danach `setzeStellung(neueStellung)` zur Sicherheit auf – es ist idempotent. Ein neuer Zug beendet einen laufenden sofort. |
| `markiere(ziele, schlaege, extras?)` | `ziele`: Array `{row,col}` → grüne Punkte; `schlaege` → rote Ringe. `extras` (optional): `ausgewaehlt:{row,col}` (blaue Fläche), `letzterZug:{from,to}` (gelb), `schach:{row,col}` (rot pulsierend + Ring), `gefahr:[…]` (orange Ringe), `fokus:{row,col}`, `hinweis:{from,to}` (grüner Pfeil). Jeder Aufruf ersetzt alle Markierungen; `markiere([],[])` löscht. |
| `wenden(schwarz?, animiert?)` → `Promise` | Kamerafahrt (1 s) zur Sicht von Schwarz/Weiß; ohne Argument umschalten. |
| `autoWenden(bool)` | siehe Option |
| `hunde(bool)` | Figurenstil umschalten (baut alle Figuren neu) |
| `kampf(bool)` | Kampfszenen an/aus |
| `namensschild(pos, text)` | Namensschild über der Figur auf `pos` (max. 12 Zeichen, Weiß grün, Schwarz rot); `''` entfernt. Es zieht mit der Figur mit (`animiereZug`), verschwindet bei Schlag. |
| `onFeldKlick(cb)` | `cb(row, col)`: Klick/Tipp auf eine Figur (Raycast, wie `square(at:)`) oder auf ein Feld. Ziehen zählt erst ab 5 px als Drehen. |
| `setzeThema(i)` | Brett-Farben |
| `kameraZuruecksetzen()` → `Promise` | Neigung/Abstand zurück (Swift `resetCamera`) |
| `kameraSetzen(az, el, dist)` | Kamera ohne Fahrt setzen (el 0,30…1,45; dist 6,5…24) |
| `groesseAnpassen()` | Größe neu lesen (passiert auch automatisch) |
| `qualitaet(name)` | feste Qualitätsstufe (schaltet die Automatik ab) |
| `statistik()` | `{drawCalls, dreiecke, geometrien, texturen, stufe, pixelRatio}` |
| `beendeAnimation()` | laufende Animation sofort abschließen |
| `zerstoeren()` | Listener entfernen, GPU-Speicher freigeben, Canvas entfernen |
| `schritt(dt)`, `vorspulen(sek)` | nur Testmodus: Simulation vorantreiben und zeichnen |

Eigenschaften: `ansichtVonSchwarz`, `animiert` (nur lesen).

### Bedienung (wie die Mac-App)

* Maus/Touch ziehen: drehen (links/rechts) und neigen (oben/unten, 0,30…1,45 rad).
* Mausrad, Trackpad-Pinch, Zwei-Finger-Pinch: Zoom (6,5…24); Zwei-Finger-Drehen: Brett drehen.
* Ein Klick/Tipp ohne Ziehen ruft `onFeldKlick` auf.

### Kampfszenen (Angreifer → Szene)

| Angreifer | Szene |
|---|---|
| Springer | Salto-Sprung (Bogen 1,4, volle Drehung), landet auf dem Opfer, das gestaucht wird und in 20 Splitter zerbricht; Staubring |
| Turm | Neigen, Rammbock-Anlauf (kubisch beschleunigt), Opfer fliegt im hohen Bogen (5π Drehung) vom Brett, Funken |
| Läufer | Anlauf, Ausholen, diagonaler Lichtschwert-Hieb, Opfer zerfällt in Splitter und sinkt |
| Dame | steigt auf und dreht sich, Opfer schwebt violett leuchtend mit Magie-Wirbel, implodiert (Funken + Blitz) |
| Bauer, König | Anlauf, Ausholen, Stoß: Opfer kippt um und versinkt; Staubring (König stärker) |

Dazu Funken, Lichtblitz (festes Punktlicht-Pool, keine Shader-Neuübersetzung), Kamerawackeln und im Hunde-Modus ein Comic-„WUFF!/WAU!/KLAFF!“.

## Modul `Animation2D` (animation2d.js)

2D-Zuganimation für ein DOM-/Canvas-Brett (Port von `PieceAnimationView`).
```js
const a = new Animation2D(brettContainer);              // transparentes Canvas über dem Container
await a.animiere({ typ:'knight', weiss:true, schlag:{typ:'pawn', weiss:false} /* oder null */,
                   von:{x,y}, nach:{x,y}, zelle:60, hunde:false });   // x/y in CSS-Pixeln im Container
a.abbrechen(); a.zerstoeren(); a.groesseAnpassen();
```
Der Aufrufer blendet während der Animation die Figur auf Start- und Zielfeld aus. `hunde:true` = Show-Modus (länger, Comic-Explosion, Knochen/Pfoten, „WUFF!“, Banner „💥 Bruno schnappt sich Luna!“).

## Leistung

* Figuren = Klone einer Vorlage (Geometrie/Material geteilt); alle Teile gleichen Materials sind zu einer Geometrie verschmolzen; Felder = 1 `InstancedMesh`.
* Startstellung klassisch: ~76 Draw-Calls, ~73 k Dreiecke; Hunde-Team ~236 Draw-Calls, ~153 k Dreiecke (Hauptbild, ohne Schatten-Durchgang).
* Rendern nur bei Änderung (kein Dauerlauf im Ruhezustand); Schatten-Karte 2048/1024/512, Pixel-Ratio 2/1,5/1, Teilchen 100 %/70 %/40 % je Qualitätsstufe. `qualitaet:'auto'` startet auf iPad/Handy mit „mittel“, sonst „hoch“, und senkt/hebt die Stufe nach Messung der Bildrate während Animationen (< 38 fps → eine Stufe tiefer; lange > 57 fps → höher).
