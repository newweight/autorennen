# Übergabe Motorrad + Grafik (Stand 27.10.2026)

## Reihenfolge (Sebastian, 27.10.)
0. **ZUERST, WICHTIG (Sebastian 27.10.): Schräglage rechts/links deutlich smoother.** Heute src/moto/schraeglage.js: Ziel = atan(v·Gierrate/g), Gierrate aus Heading-Änderung je Bild, exponentiell geglättet τ = 0,12 s, Deckel 45°. Verdacht: Gierrate je Bild springt (Lenk-Zittern, Bildraten-Schwankung) und τ zu klein → ruckartig. Vorschlag: Gierrate selbst glätten (z. B. τ 0,15 s), Ziel-Lage per kritisch gedämpfter Feder (Masse-Feder, ~0,35–0,5 s Einlenken) statt nur Exponential, Lage-Änderungsrate begrenzen (z. B. ≤ 90°/s), bildratenunabhängig (dt-genau). Cockpit-Kamera (cockpitMoto.js rollAnteil 0,5) folgt derselben geglätteten Lage, eher noch weicher. Werte in Konfig. Beleg: Messung über Testfahrten (Ruck = max. Winkelbeschleunigung vorher/nachher, Slalom und Kurven, 30 und 60 fps) + Video/Bildfolge; Sebastian testet selbst.
1. **M3** Motorrad: Superbike, Roller, Chopper, Quad (kippt nie) · Stunt-Park ohne Gegner · Steilwand, Schlamm, Wasser, Kistenstapel · Garage: Helm-/Kombi-Farben, Startnummer · Auspuffknall, Funken
2. **M4** Motorrad online über den vorhandenen Autorennen-Server (Mini, Port 10000; Server = Client deterministisch): Motorrad-Katalog im Server, Stunt-/Unfall-/Schräglage-Zustände ins Protokoll, Verbindung Portal (10002) ↔ Spielserver ohne Autorennen zu ändern; Stuntpunkte in Portal-Bestenliste (BESTEN_SPIELE) · Schätzung 3–4 h
3. **G1** Grafik Licht + Material (für Autorennen UND Motorrad): glänzender Lack mit Himmels-Spiegelung (Standard/Physical-Material + Umgebungskarte), Chrom/Glas, weiche Schatten, Tone-Mapping (ACES), Bloom für Scheinwerfer/Feuerring · zuerst Probe Wiese
4. **G2** Umgebung: Himmel mit Wolken/Sonnenstand, Gras/Blumen am Rand (Instancing), bessere Bäume, Asphalt-Struktur, Staub
5. **G4** Effekte: Bewegungsunschärfe, Regentropfen, Funken, Feuer/Explosionen
(G3 = gekaufte/CC0-Modelle: vorerst nicht beauftragt)
**Grafik-Pflicht:** Menü-Schalter „Grafik: Normal / Schön / Ultra“; Normal = heutiger Stand bitgleich (iPhone, Mini). Ultra für Studio/M2.

## Wo was liegt
- Code: GitHub newweight/autorennen, Zweig `motorrad` (Basis v34 = 8833b9f). Sicherungszweige stand-m1, stand-m2, stand-m2c, stand-m2c2, stand-m2c3 (= aktuell freigegeben). Tags lassen sich aus der Cloud nicht pushen → Sicherungszweige.
- Regel bisher: NUR neue Dateien (src/moto/*, Motorrad.html, tests/*moto*); `git diff --name-status 8833b9f | grep -v '^A'` muss leer sein. Für M4 und G1–G4 sind Änderungen an gemeinsamen Dateien nötig → nur mit Schalter, Standard = bitgleich altes Verhalten, Autorennen-Tests (test_physik Fingerabdruck, test_netz, test_ki, test_autos) grün.
- Mac (Studio, iCloud): ~/Desktop/Spiele/Motorrad-Projekt (PLAN.md, PLAN_MOTORRAD.md, VERLAUF.md, VERLAUF_MOTORRAD.md, Versionen/m1…m2c3, Starter „🏍 Motorrad NEUESTE starten.command“)
- Spieleportal: ~/Desktop/Spiele/Spieleportal/www/motorrad (= m2c3), Karte in www/index.html. portal_server.py: request_queue_size 128 (Fix 24.10.).
- Mini-Installation (vom M2 aus): `cd ~/Desktop/Spiele/Spieleportal && bash _inst_ip.command` (Kopie des Installers mit Tailscale-IP 100.104.29.100, weil der M2 Tailscale-Namen nicht auflöst). Vorher prüfen, dass iCloud die neuen Dateien auf dem M2 hat.
- M2: /etc/hosts-Eintrag 100.104.29.100 mac-mini-von-sebastian.tail39c1c2.ts.net (Notlösung). Ursache: zwei Tailscale-Installationen (App + Homebrew) – später aufräumen, dann Eintrag entfernen.
- Desktop-Verbindung der Sitzung hing am Studio (macstudio-von-sebastian).

## Stand Motorrad (freigegeben m2c3)
Crossmaschine, Schräglage, KI, Zweispieler · Stunts (Schanzen, Salto/Drehung, Feuerring, Bus-Sprung, Wheelie/Stoppie, Combo, Stuntrennen) · Unfall-Status (Motorrad %/Fahrer %, Werkstatt + Krankenstation je Strecke, Vor-Ort 1,5 s/10 %, Station 0,5 s/10 %, ab 30 % weiterfahren, Modus aus/sanft/echt) · Cockpit als Startansicht (Taste C), zwei Spiegel links/rechts · Fehler-Overlay (src/moto/fehlerAnzeige.js).
Tests: test_moto 119, stunts 62, unfall 39, cockpit 25, autos 333, physik 60, schanze 76 – alle grün.
Offen (optisch, klein): Qualm auf dunklem Asphalt streifig, Spiegel im Zweispieler knapp am Rand, Alpen-Ring-Flammen tief, Garage teils Auto-Texte, Sturzschwelle ungetestet mit echten Kindern.

## Arbeitsweise
Sonnet-Agenten bauen (1 Agent je Stufe, sparsam), Hauptmodell plant/prüft (Regel, Tests), Sonnet wertet Bilder aus; Prozent-Meldungen; jede Stufe als Sicherungszweig + Versionsordner auf dem Mac + Portal; Befehle für Sebastian einzeln.
