# Jonas Hot Steering Wheel – Plan Runde 3 (11.10.2026)

## Wünsche (Sebastian, 11.10.)
1. Autowahl: Autos wie im Spiel (echte 3D-Modelle), drehbar
2. Alle Autos 220–270 km/h Höchsttempo (61–75 m/s)
3. Strecken: bergauf/bergab, Brücken, Tunnel mit Licht
4. Hindernisse: Ölfleck, kleine Baustelle (halbe Fahrbahn), Sand auf der Straße, Ast
5. Gegner: 3 weitere Schwierigkeitsstufen, höchste nahezu unschlagbar
6. Neue Strecke „Fantasie": kürzer, 2 Loopings, Bälle rollen auf die Fahrbahn (deutlich langsamer bei
   Kontakt, erst gegen Ende / plötzlich), plötzlicher Wasserstrahl

## Entscheidungen (ohne Rückfrage getroffen – bitte widersprechen, wenn falsch)
- Tempo 220–270: Multivan 220, T-Roc 230, Passat 240, Mini 235, RS6 255, M4 260, AMG 265, Porsche 270.
  Folge: Runden werden kürzer (~75–90 s statt 2 min). Strecken bleiben gleich lang (ich verlängere nicht
  ungefragt). Lenkung bei hohem Tempo wird stabiler, Bremsen stärker, Rand/Gras bremsen härter.
- Schwierigkeiten neu: leicht, mittel, schwer, profi, meister, legende, unschlagbar (7 Stufen).
  „unschlagbar": Ideallinie 100 %, kein Gummiband nach vorne, +Bonus-Grip 5 %.
- Hindernisse datengetrieben in trackCatalog (je Strecke 3–5): Ölfleck (Grip 0,25, Auto schlingert),
  Baustelle (Pylonen + Bake, Fahrbahn halb gesperrt, Kollision = Stoß), Sand (Grip 0,55, langsam),
  Ast (Stoß + Tempo −40 %). KI weicht Hindernissen aus (kennt Positionen).
- Tunnel: dunkle Röhre mit Lampen; Scheinwerfer der Spieler-Autos als echte Lichter nur im Tunnel.
  Brücken: Fahrbahn über Senke/Wasser mit Geländer. Wald bekommt Tunnel+Brücke, Wüste Felstunnel,
  Wiese Holzbrücke; Höhenprofil kräftiger (bis ±14 m, Steigung bis 8 %).
- Looping: eigener Streckenmodus (Auto hängt am Kreis, Radius 12 m, nötiges Eintrittstempo ≈ 90 km/h;
  zu langsam → rutscht zurück und bekommt „Mehr Anlauf!"). Bälle: rollen ab Runde ≥ 2 bzw. letzte Runde
  quer über die Straße, Treffer = Tempo −60 %. Wasserstrahl: Fontäne aus dem Boden alle ~20 s, 2 s lang,
  Treffer = Tempo −40 % + Schlingern. Fantasie-Thema: bunte Felder, Himmel lila, Strecke ~1.400 m.
- Autowahl: echtes 3D-Modell je Karte (eigener kleiner Renderer / Render-to-Texture), gewählte Karte
  groß und per Pfeil-links/rechts bzw. Maus-Ziehen drehbar; Autos drehen langsam von selbst.

## Offene Fragen an Sebastian (Antworten in VERLAUF.md eintragen)
F1 Sollen die Strecken länger werden, damit eine Runde trotz 250 km/h wieder ~2 min dauert?
F2 Looping-Größe/Anzahl für Fantasie ok (2 Stück, 12 m Radius)? Sollen andere Strecken auch einen bekommen?
F3 Bälle nur in der letzten Runde oder ab Runde 2?
F4 Hindernisse auch auf Wiese (Einsteiger-Strecke) oder nur Wald/Wüste/Fantasie?

## Arbeitswellen
Welle 1 (parallel): A Tempo+Schwierigkeit (Opus) · B Streckenelemente+Hindernisse (Opus) · D 3D-Autowahl (Sonnet)
Welle 2: C Fantasie-Strecke mit Loopings/Bällen/Wasser (Opus)
Danach: Gesamttest, Screenshots, Übertragung, ANLEITUNG/ERWEITERN aktualisieren
