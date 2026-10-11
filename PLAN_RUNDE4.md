# Jonas Hot Steering Wheel – Plan Runde 4 (11.10.2026, Fable)

## Antworten Sebastian auf Runde 3
F1 Strecken verlängern → JA (Runde wieder ~2 min bei 220–270 km/h); Fantasie bleibt kurz
F2 Looping 12 m ok, aber NUR Fantasie
F3 Bälle Fantasie ab Runde 2
F4 Hindernisse nur Wald, Wüste, Fantasie (Wiese ohne)
Fahrer-Emojis: Emmy = 🦁 Löwe, Jonas = 🐯 Tiger

## Neue Wünsche (11.10.)
Sprungschanzen · Strohballen die reinrollen · liegengebliebene + brennende Autos als Hindernis · bis 10 Gegner ·
Wolken + Sonne (Wald, Wiese) · Jahreszeit wählbar mit Regen/Schnee/Hagel/Wind + Nebel je Jahreszeit ·
Wind 1–5 mit Anzeige der Seite und Wirkung auf Lenkung; Regen/Hagel/Schnee wirken auf Bremsen + Kurventempo ·
Straße mal 1-, mal 3-spurig · Auto-Gesundheit: Zaun/Auto-Treffer −5 %, je 20 % verloren etwas langsamer/schlechter,
bei 0 % liegengeblieben · Ideen aus Hot Wheels / Mario Kart als zusätzliche „Welten", nicht überall ·
OBERSTES GEBOT: nichts kaputtmachen, Bestehendes bleibt spielbar; alles dokumentieren (Compact-sicher)

## Grundentscheidung: „Welten" als Add-on pro Strecke (statt neuer Strecken)
Jede bestehende Strecke bekommt wählbare Welten (Menü: Strecke → Welt). Die Streckenform bleibt gleich,
die Welt schaltet Schichten zu. Bestehende Spielweise = Welt „Klassisch" (keine Hindernisse) bzw. für
Wald/Wüste „Hindernisse" (= Stand Runde 3). Nichts Altes wird entfernt, nur umbenannt/umgeschaltet.
  Welt 0 „Klassisch":   Strecke pur (Wiese-Standard)
  Welt 1 „Hindernisse": Öl, Sand, Baustelle, Ast + NEU liegengebliebene/brennende Autos, Strohballen rollen rein
                        (Wald/Wüste-Standard)
  Welt 2 „Stunt":       zusätzlich Sprungschanzen, Fahrbahn stellenweise 1- oder 3-spurig, Wind stärker
  Welt 3 „Verrückt":    zusätzlich Bälle/Wasserstrahl (wie Fantasie) + Boost-Felder (Hot-Wheels-Art) und
                        Schutzschild-Pickups (Mario-Kart-Art, einfach gehalten: Turbo 3 s / Schild 1 Treffer)
  Fantasie:             eigene Strecke, Loopings nur hier; Welten dort: „Fantasie" (Stand) und „Fantasie verrückt"
Jahreszeit/Wetter/Wind/Schaden sind unabhängig von der Welt wählbar (Einstellungen), Standard = wie bisher
(Sommer, klar, Wind 0, Schaden aus) → Altes Spielgefühl bleibt die Voreinstellung.

## Entscheidungen im Detail
- F1 Längen: Wiese ×1,35 (→ ~3.040 m), Wald ×1,25 (→ ~2.480 m), Wüste ×1,45 (→ ~3.330 m); alle s-Positionen
  (Checkpoints, Tunnel, Brücken, Hindernisse) skalieren mit. Ziel-Rundenzeit KI mittel 110–130 s.
- Spuren: Katalog `spuren: [{s0, s1, spuren: 1|3}]` → Breite(s) = Spur×3,8 m (1 = 5 m eng mit Leitplanke,
  3 = 15 m breit); Übergang 40 m. Nur in Welt ≥ Stunt aktiv (Klassisch bleibt konstante Breite).
- Sprungschanze: Rampe (8° / 12°), Auto fliegt ballistisch (y-Physik nur im Flug), landet auf Straße;
  bei Landung schräg: kleiner Tempoverlust; KI kennt Schanzen (Ideallinie: Gas).
- Jahreszeiten: Frühling (Blüten, mild, Nebel leicht), Sommer (Standard), Herbst (orange Bäume, Nebel, Regen
  häufig), Winter (Schnee auf Boden + Rand, Schnee auf Straße = Grip 0,6, Schneefall). Wetter je Jahreszeit:
  klar / Regen / Schnee (nur Winter) / Hagel (Herbst, Winter) oder „zufällig". Wolken + Sonne als Himmel-Deko.
  Wirkung: Regen Grip ×0,85 Bremsen ×0,8; Hagel Grip ×0,75 + Geräusch + Hüpfer-Partikel; Schnee Grip ×0,6.
- Wind: Stärke 0–5, Richtung fest je Rennen (zufällig oder gewählt), HUD-Pfeil + Zahl; Wirkung = seitliche
  Kraft (Lenkversatz) proportional Stärke × Tempo, Gegenwind −3 %/Stufe vMax, Rückenwind +.
- Schaden (Einstellung aus/an, Standard aus): 100 % → je Zaun-/Auto-/Hindernis-Treffer −5 % (Mindeststoß),
  je verlorene 20 %: vMax −4 %, Beschleunigung −6 %, Grip −3 %; < 40 % Rauch, < 20 % Qualm + Blinken;
  0 % = liegengeblieben: 5 s Stillstand mit Warnblinker, dann Abschleppwagen-Reset am Checkpoint mit 60 %.
  KI gleich behandelt. HUD: Gesundheitsbalken.
- Gegner max 10 (Startaufstellung 2 Spalten × 6 Reihen); Leistung: adaptive Qualität vorhanden.
- Neue Hindernistypen: 'wrack' (liegengebliebenes Auto aus dem Katalog, Warnblinker, feste Kollision),
  'brand' (Wrack + Feuer/Rauch-Partikel, Treffer = zusätzlich −10 % Schaden wenn an), Strohballen als
  rollende Objekte (Dynamik, wie Bälle, aber langsamer, Treffer −50 %, nur Wiese/Wald).
- Boost-Feld: Pfeile auf der Straße, +25 % Tempo für 2,5 s; Schild: Pickup-Kugel, blockt 1 Treffer (Ball/Wasser/
  Schaden). Nur Welt „Verrückt". Kein Werfen von Items (zu komplex, Kinder).

## Wellen (Agenten)
W1 parallel: A (Opus) Längen F1 + Spuren + Welten-Datenmodell (trackCatalog/trackBuilder/tests)
             B (Opus) Jahreszeit/Wetter/Wind/Wolken/Sonne (wetter.js, themes.js, vehicle.js Umwelt-Faktoren,
                      hud.js Windpfeil, config, tests)
W2 parallel: C (Opus) Schaden-System + Wrack/Brand/Strohballen (schaden.js, collisions.js, dynamik.js,
                      carBuilder nur Rauch-Anker, hud.js Balken – nach B)
             D (Opus) Sprungschanzen + Boost/Schild (schanze.js, pickups.js, trackBuilder-Hooks – nach A)
W3: E (Sonnet) Menü: Welt-Wahl je Strecke, Einstellungen Jahreszeit/Wetter/Wind/Schaden, Gegner bis 10,
             Emojis Emmy 🦁 / Jonas 🐯, ANLEITUNG/ERWEITERN; F (Fable) Integration main.js, Gesamttests,
             Screenshots, Übertragung
Regel für alle: bestehende Tests bleiben grün; neue Funktionen standardmäßig AUS bzw. „Klassisch";
jede Datei bekommt Kopfkommentar „Runde 4: …"; VERLAUF.md nach jedem Schritt.

## Offene Fragen (neu)
F5 Schaden standardmäßig aus (Kinder) – ok? F6 Wind-Richtung zufällig oder wählbar? (ich: zufällig +
Anzeige) F7 Boost/Schild als einzige „Mario-Kart"-Elemente ok, kein Werfen? F8 Jahreszeit auch für Wüste
(dort nur Hitze-Flimmern/Sandsturm statt Schnee)? (ich: Wüste: Sommer/Sandsturm statt Winter)
