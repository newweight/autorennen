# Jonas Hot Steering Wheel – Plan Runde 5 (11.10.2026, Fable)

## Rückmeldung Sebastian
- Allein: Fahrverhalten deutlich schwieriger als vorher; zu zweit "klappt fast nicht mehr" → WICHTIGSTES ZIEL: flüssig + gut fahrbar
- Immer alte Zwischenstände speichern, auf die wir zurückkönnen
- Looping/Schanze zu langsam: zurückfahren + Anlauf oder Tastendruck → Position mit Abstand; muss schnell genug
  durchkommen; nicht mehr durch den Zaun
- Danach: Dino-Strecke; Polizei auf allen Strecken (hält an, nach 10 s weiter); Formel-1-Auto;
  Fantasie: Klebe-Seitenstreifen (bremst, zu lange drauf = 5 s kleben, Optik Kleber, dann lösen)

## Hypothesen "schwieriger / zu zweit kaum spielbar" (zu prüfen auf dem Mac)
H1 Leistung: Runde 4 lädt mehr (Autos 6k Dreiecke, Wetter-Objekte auch bei "klar", Wracks mit Partikeln in
   Standardwelt Wald/Wüste, größerer Boden, bis 10 Gegner). Bei < 30 fps greift maxSchritteProFrame=3 →
   Spielzeit läuft langsamer + Eingabe verzögert → "schwer". Zu zweit doppelte Last.
H2 Fahrphysik Runde 3/4: 220–270 km/h + griplimitierte Drehrate (0,35 rad/s bei vMax) + skalierte Strecken
   → objektiv schwerer, besonders für Kinder (Kurven kommen schneller, Lenkung wirkt träge).
H3 Tastatur-Ghosting zu zweit (nie bestätigt).
Messung: Spiel als private Artefakt-Seite veröffentlichen, in Sebastians Chrome öffnen, Rennspiel.spiel.leistung()
auslesen (Solo / zu zweit, Klassisch / Hindernisse, Wald).

## Maßnahmen (unabhängig vom Messergebnis sinnvoll)
M1 Versionen: _versionen/vN_… .tgz + WIEDERHERSTELLEN.md (v1 Grundspiel, v2 Modelle/Fahrer, v3 Welten-Vorstufe, v4 Welten)
M2 Grafik-Stufe wählbar (Niedrig/Mittel/Hoch, Standard automatisch): Niedrig = pixelRatio 1.0/0.75, KI-Autos
   als Low-Poly-LOD (alter Builder) ab 40 m, keine Wolken/Partikel, Deko-Dichte 50 %, Sicht kürzer
M3 Wetter-Objekt nur anlegen, wenn Jahreszeit/Wetter/Wind nicht Standard; Standardwelt aller Strecken =
   Klassisch (Hindernisse bleiben wählbar) → Grundlast wie Runde 2
M4 Tempo-Klasse wählbar: "Normal" (vMax ×0,7 ≈ 150–190 km/h, Lenkung wie Runde 2) / "Schnell" (220–270).
   Standard Normal. Lenkgefühl: Drehrate bei hohem Tempo wieder direkter (Mitte zwischen Runde 2 und 3)
M5 Physik-Schritt entkoppeln: bei niedriger fps bis 5 Schritte, nie Spielzeit verlangsamen unter 20 fps
   (dann Qualität runter statt Zeitlupe); Eingabe immer im selben Frame verarbeiten
M6 Looping/Schanze: Mindesttempo-Check mit Anlauf-Hilfe: zu langsam → Auto stoppt sanft vor der Rampe,
   Meldung "Zurück und Anlauf nehmen – oder Taste R: Anlaufposition"; R setzt 150 m vor die Rampe (mit Abstand
   zu anderen Autos); Looping/Schanze mit Mindesttempo + Gas → kommt immer durch (Toleranz +)
M7 Zaun: kein Durchfahren – Bande als harte Kapsel mit Rückstoß auch bei 75 m/s (Substeps/Sweep), Zaun-Deko
   = Bande-Position (kein Zaun ohne Bande)

## Danach (Runde 5b)
Dino-Strecke (Urwald, Vulkan, Dinos als Deko + 1–2 laufende Dinos als Hindernis), Polizei (Welt-Schicht oder
Schalter: Streifenwagen verfolgt, bei Kontakt 2 s → 10 s Stopp mit Blaulicht, dann weiter), Formel-1-Auto
(generischer Monoposto, keine Teamfarben/Logos), Fantasie-Klebestreifen.
