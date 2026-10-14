# Portierung SceneKit (Swift) → Three.js (JS)

Quelle: `spiele/vorlage_swift/SchachSpiel/SchachSpiel.swift`. Ziel: Browser-Version der 3D-Teile mit möglichst gleichem Aussehen und Ablauf („Code zu 95 % übernehmen“). Der Rest der 5 %: siehe unten „Bewusst anders“.

## Dateien

| Swift (Zeilen) | JS-Datei | Inhalt |
|---|---|---|
| `PieceAnimationView` (3807–4194) | `animation2d.js` | 2D-Zug-Animation als Canvas-Overlay (`Animation2D`) |
| `Piece3DFactory` (4196–4445) | `figuren3d.js` | Staunton-Figuren: `lathe`, `profile`, Zinnen, Krone, Kreuz, Läufer-Kerbe, Pferdekopf |
| Hunde-Team (4447–4820) | `figuren3d.js` | Bruno, Luna, Brocken, Wurzel, Falko, Welpen, Sockel, Halsband, Plakette, Billboard-Köpfe |
| `Board3DView` Aufbau/Kamera/Eingabe/Stellung (4822–5365) | `schach3d.js` | Klasse `Schach3D` |
| `Board3DView` Zug/Kampf/Effekte (5365–5900) | `kampf3d.js` | `animiereZug`, 6 Kampfszenen, Funken, Blitz, Wackeln, „WUFF!“, Splitter |
| `SCNAction` | `aktionen.js` | `Schach3DAktionen` (sequence/group/wait/rotate/move/custom/fade/scale/hide/remove) + Läufer mit Zeitgeber (`at`) |

## Mapping der Konzepte

| SceneKit | Three.js |
|---|---|
| `SCNNode`/`SCNScene` | `THREE.Group`/`THREE.Scene` |
| `SCNGeometry` Lathe (eigener Code) | `THREE.LatheGeometry` mit denselben Profilen (x = Radius, y = Höhe), 24/36/48 Segmente je Qualität |
| `SCNBox/Sphere/Cone/Torus/Tube/Cylinder` | `BoxGeometry/SphereGeometry/CylinderGeometry/TorusGeometry` (Torus um 90° gekippt, weil SCNTorus um die Y-Achse liegt); `Tube` = Lathe-Ring |
| `SCNShape` (Pferdekopf aus `NSBezierPath`) | `ExtrudeGeometry` aus `THREE.Shape` mit denselben 7 Bézier-Kurven |
| `eulerAngles` (z, y, x) | `Euler 'XYZ'` (gleiche Reihenfolge, gleiche Vorzeichen) |
| `physicallyBased` (diffuse/roughness/metalness) | `MeshStandardMaterial` (Werte 1:1; Farben im sRGB-Raum angegeben) |
| `lightingEnvironment` (Bild) | `PMREMGenerator` aus einem Equirect-Canvas (Verlauf + zwei Softboxen) als `scene.environment` |
| `SCNLight` ambient/directional/omni | `AmbientLight`/`DirectionalLight` (Schatten)/`DirectionalLight` Fülllicht |
| weiche Schatten (`.deferred`, Radius 3,5) | `PCFSoftShadowMap`, Schatten-Karte 2048 (adaptiv 1024/512), Bias/NormalBias |
| `SCNBillboardConstraint(freeAxes: .Y)` | `Figuren3D.billboards()` pro Bild: Y-Drehung zur Kamera, Elternrotation herausgerechnet (funktioniert auch während Salto/Kippen) |
| `SCNBillboardConstraint()` (Namensschild, WUFF) | `THREE.Sprite` |
| `SCNAction.customAction` + Timing | `A.eigen(dauer, fn(node,t))`; `arc/charge/projectile/squash/tremble` 1:1 als `A.bogen/anlauf/wurf/stauchen/zittern` |
| `rotate(by:around:)` | `A.drehen(winkel, achse, dauer)` (Achse im Elternraum, additiv zum Startwert) |
| `DispatchQueue.asyncAfter` + `animToken` | `Laeufer.nach(t, fn)` in Simulationszeit; `_token` verwirft veraltete Blöcke |
| `SCNParticleSystem` (Funken, Staubring, Wirbel) | `THREE.Points` mit Vertexfarben, additiv (Ausblenden über Farbe), CPU-Update, Anzahl nach Qualitätsstufe |
| `SCNPhysicsBody` (Splitter) | eigene Mini-Physik: Schwerkraft −14, Boden y = 0, Restitution 0,35, Reibung, Drehgeschwindigkeit; 20 Boxen mit geteilter Geometrie |
| Omni-Blitzlicht (`flash`) | Pool aus 3 festen `PointLight`s (Intensität 0 im Ruhezustand → keine Shader-Neuübersetzung) |
| Kamerawackeln (`shaker`-Node) | Versatz der Kameraposition (sin 91/cos 77, Abklingen), 0,38 s |
| `SCNView.hitTest` | `Raycaster` gegen die Figuren, sonst Schnitt mit der Brettebene → Feld (`square(at:)`) |
| `mouseDown/Dragged/Up`, `scrollWheel`, `magnify`, `rotate` | Pointer Events (Maus, Stift, Touch), `wheel` (inkl. Ctrl+Wheel = Trackpad-Pinch), Zwei-Finger-Pinch + -Drehung |
| `SCNTransaction`-Kamerafahrt (1 s, easeInEaseOut) | Tween in der Zeitschleife (`wenden`, `kameraZuruecksetzen`) |
| `SCNText` (Koordinaten) | Canvas-Texturen auf flachen Planes, drehen sich in Viertelschritten zum Betrachter |
| Brett-Thema (`BoardTheme`) | `setzeThema(0..5)` (gleiche 6 Farbsätze) |

Übernommen 1:1 (Zahlenwerte, Reihenfolgen): alle Figurenprofile und Maße (`rawHeight`, `formScale 1,12`, `dogProportions`), Hunde-Köpfe je Rasse (Schädel/Schnauze/Nase/Augen/Ohren/Details/Accessoires), Kameradaten (Elevation 0,80, Abstand 12,4, FOV 40° bzw. horizontal 59° bei Hochformat, Neigung 0,30–1,45, Zoom 6,5–24, Drehfaktor 0,008/0,006), Brett- und Rahmenmaße, Lichtpositionen, Markierungen (Punkte r 0,13, Ringe 0,41/0,44/0,46, Pfeil), Friedhof-Anordnung, Namensschild-Größe/-Farben, alle Kampfszenen mit Zeiten und Höhen, einfacher Zug (`0,30 + 0,06·Distanz`, Springer 0,95 hoch), Rochade (Turm 0,12 s versetzt), Umwandlung (Skalierung 0,2→1 in 0,35 s + 70 Funken + Blitz).

## Bewusst anders / vereinfacht (die „5 %“)

1. **Kein „Paw Patrol“** (geschützte Marke): weder Figuren, Namen noch Banner. Das eigene Hunde-Team (Bruno, Luna, Brocken, Wurzel, Falko, Welpen) ist übernommen; der 2D-„Show-Modus“ verwendet deren Namen („Bruno schnappt sich Luna!“) statt der Fremdnamen.
2. **Tisch-Spiegelung** (`SCNFloor.reflectivity`) fehlt: stattdessen glänzendes Holz mit Umgebungs-Reflexion und Nebel zum Horizont (Three.js bringt keinen Planar-Spiegel im Kern mit; ein Extra-Render würde auf iPad die Bildrate halbieren).
3. **Bloom und Ambient-Occlusion** der SceneKit-Kamera (`bloomIntensity 0,35`, SSAO 0,6) entfallen (Post-Processing nicht im Kern-Build). Ersatz: weiche Schatten, ACES-Tonemapping, kräftigere Blitz-Lichter, additive Funken/Klinge mit Zusatz-Glanzebene.
4. **Abgerundete Kanten** (`chamferRadius`) bei Zinnen, König-Kreuz, Rahmen: nur beim Rahmen (Bevel), sonst scharfkantige Boxen (bei dieser Größe nicht sichtbar).
5. **Pferdekopf:** Extrusion mit Bevel 0,02 (Gesamttiefe 0,20 wie `extrusionDepth`), Augen an der Oberfläche; Mähne als Box.
6. **Kamera-Ziel** (`lookTarget` bei z 0,35) dreht mit der Kamera mit, damit die Ansicht von Schwarz symmetrisch gerahmt ist (Swift hielt es in Weltkoordinaten).
7. **Hundeköpfe aus Vertexfarben:** alle Teile eines Kopfes zu 3 Meshes verschmolzen (matt/glänzend/Metall) – Segmentzahl 8–16 statt 28 (Dreiecke begrenzt). Augen-Glanzpunkte als kleine Kugeln wie im Original.
8. **Brett-Zustand:** `Schach3D` kennt keine Regeln. Statt `refresh(board:selected:targets:last:check:hint:danger:focus:)` gibt es `setzeStellung` + `markiere(ziele, schlaege, extras)`; Zugdaten als `{from,to,capturedPiece,isCastling,isEnPassant,promotion}` (wie `ChessMove`). Der Zug wird mechanisch aus der letzten Stellung abgeleitet; `animateMove(before:after:)` entfällt.
9. **Namensschilder** hängen an einem Feld (nicht an `[Farbe: (Typ, Name)]`) und ziehen mit; die Zuordnung Name↔Figur macht der Aufrufer.
10. **Zeitschleife:** `requestAnimationFrame` mit Simulationszeit (dt ≤ 0,1 s). Rendern nur bei Änderung. Dadurch läuft die Animation bei Rucklern langsamer statt zu springen.
11. **Adaptive Qualität** (neu): Schatten-Karte, Pixel-Ratio, Teilchenzahl, Figurendetail nach Gerät und gemessener Bildrate.
12. **Teilchen-Größen** ohne Varianz je Teilchen (ein Material je Burst); Staubring mit 70 statt 56 Teilchen, ohne `birthLocation`-Emitterform (Startpunkte auf einer Scheibe, Richtung nach außen).
13. **Physik der Splitter:** keine Kollision untereinander und kein Herabfallen vom Brett (Boden = Ebene y 0 wie im Original, das einen 40×40-Boden hat).
14. **Schriften:** Schachsymbole der Plaketten und der 2D-Animation kommen aus Systemschriften (Apple Symbols / Segoe UI Symbol / DejaVu Sans). Fehlt eine solche Schrift, erscheinen leere Kästchen statt Symbolen.
15. Kein `rotate`-Gesten-Support für Trackpad-Rotation (Safari-`gesturechange`): Zwei-Finger-Drehen per Touch ist umgesetzt.

## Test

* `python3 tests/schach3d_test.py` – 43 Prüfungen (Klick/Raycast, Drehen, Zoom, Pinch, Wenden, alle Kampfszenen klassisch/Hunde, Rochade, Umwandlung, en passant, Abbruch, Namensschild, Qualität, Phone, 2D).
* `python3 tests/schach3d_shots.py [alle|klassisch|hunde|kampf|wenden]` und `tests/schach3d_nah.py` – Screenshots nach `tests/out/schach3d/`.
* Testmodus: `new Schach3D(el, {manuell:true})` und `schritt(dt)`/`vorspulen(sek)` (kein Echtzeit-Takt).
