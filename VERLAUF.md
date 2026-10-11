
## Fortschritt
- 10.10. 17:48 – Plan + Recherche fertig (10 %)
- 10.10. 17:55 – Abschnitt 1 fertig: Grundgerüst (config, input, vehicle, cameras, main, HTML),
  9/9 Physik-Tests (tests/test_physik.js), Screenshot-Test headless Chromium ok (20 %)
  Fixes: Drehrate war 3x zu hoch (Einspurmodell ersetzt durch Arcade-Drehrate),
  Luftwiderstand relativ zu vMax, Abseits-Tempo-Deckel (Gras 52 %, Sand 44 %)
  Übertragung Container → Mac: _hilfsdateien/uebertragung.tgz, MD5 geprüft
- Antworten Sebastian: Browser/Three.js, Chrome, alle drei Söhne → Standard "mittel", Hilfen umschaltbar
- Abschnitt 2 (Autos, Sonnet-Agent) + Abschnitt 3 (Strecke/Rundenzähler, Opus-Agent) parallel gestartet
- 10.10. 18:25 – Abschnitt 2 fertig (Sonnet): 8 Autos (carCatalog.js, carBuilder.js, 10 Meshes/Auto,
  Vertex-Farben, Räder/Lenkung/Bremslicht), tests/test_autos.js grün, Vorschau tests/autos_vorschau.html
- 10.10. 18:25 – Abschnitt 3 fertig (Opus): spline.js, trackCatalog.js (Wiese 2.252 m, 14 Kurven,
  Haarnadel, Hügel), trackBuilder.js, themes.js (Wiese-Deko 902 Instanzen, ≤25 Draw-Calls),
  raceManager.js (Checkpoints in Reihenfolge, Teleport/Rückwärts zählt nicht), 36/36 Tests,
  simulierte Rundenzeit 106 s (Ziel 100–140)
- 10.10. 18:35 – Autos in main.js eingebaut (Katalog statt Platzhalter), Screenshot ok (50 %)
  Bekannte Schwächen: Wiese noch leer, Hügel kaum sichtbar, Gegner stehen still (KI = Abschnitt 5)
- Abschnitt 4 (Physik fein, Opus) + Abschnitt 5 (KI, Opus) parallel gestartet
- 10.10. – Abschnitt 4 fertig (Opus): collisions.js (Bande bei breite/2+18 m, Auto-Auto-Kapseln), Fahrhilfen in vehicle.js,
  Quer-Vektor korrigiert (rechts()), Nicken, Holzzaun (2 Draw-Calls), Reset auf freie Stelle (R/T), Hinweis bei Feststecken;
  tests/test_kollisionen.js 18/18, Physik 16/16, Rundenzeit unverändert 106,4 s
- 10.10. 18:50 – Abschnitt 4 fertig (Opus): collisions.js (Bande bei ±25 m mit Holzzaun, Auto-Auto-Kapseln),
  Fahrhilfen (Lenk-/Bremshilfe), Quer-Vektor-Vorzeichen korrigiert, Nicken, Kamerawackeln; 34 Tests grün
- 10.10. 18:50 – Abschnitt 5 fertig (Opus): ai/driver.js (Hase auf Ideallinie, Skill, Gummiband +35 %/−12 %,
  Ausweichen, Festfahr-Logik, deterministisch); Rundenzeiten leicht 124 s, mittel 112 s, schwer 105 s, unfair 102 s
- 10.10. 19:00 – KI in main.js eingebaut, tests/rennen_test.py (Rennen im Schnellvorlauf): KI fährt sauber,
  0 Resets, keine Fehler. Befund: stehendes Auto auf der Linie wird von KI gerammt/weggeschoben → Nachbesserung (65 %)
- 10.10. – Abschnitt 6 fertig (Sonnet): Menü (4 Schritte, Tastatur+Maus), HUD je Spieler, Ergebnis, Pause, Split-Screen,
  Autopilot-Hook, localStorage-Einstellungen; tests/menu_test.py (26 Prüfungen) grün, Split-Screen 72 Draw-Calls
- 10.10. 19:45 – KI-Nachbesserung: Ausweichen tempoabhängig, stehende Autos werden umfahren (Test 6: 0 Stöße)
- 10.10. 19:45 – Abschnitt 6 fertig (Sonnet): ui/menu.js (4-Schritte-Assistent, Tastatur+Maus), ui/hud.js,
  styles.css, Split-Screen (72 Draw-Calls), Ergebnis, Pause, localStorage; tests/menu_test.py 25 OK.
  Von mir geprüft: Screenshots Autowahl/Split-Screen/Ergebnis ok. Offen: KI-Namen im Ergebnis doppelt (78 %)
- Abschnitt 7 (Wald, Wüste, Minimap – Opus) + Sound (Sonnet) gestartet
- 10.10. 20:40 – Abschnitt 7 fertig (Opus): Wald 1.982 m/23 Kurven/Tunnel/Brücke, Wüste 2.297 m/Oase/Sand,
  Wiese mit Blumen+Teich, Minimap; Rundenzeiten mittel: Wiese 115 s, Wald 125 s, Wüste 109 s; ≤19 Draw-Calls Deko
- 10.10. 20:40 – Sound (Sonnet): audio/engine.js synthetisch (Motor mit Gängen, Countdown, Stöße, Fanfaren),
  von mir in main.js/Menü eingebaut (Taste M, Knopf), audio_test 19 OK
- 10.10. 20:55 – Abschnitt 8: KI-Namen im Ergebnis = "Computer n", Starter-App (🚗 Autorennen starten.app,
  Shell-Starter → Chrome), Autorennen starten.command, ANLEITUNG.md, ERWEITERN.md. Alle Tests grün (95 %)
- Offen: Test auf dem echten Mac (Chrome, Leistung, Tastatur-Ghosting bei 2 Spielern), Klang ungehört
- 10.10. 21:35 – Alles auf dem Mac: Spiele/🚗 Autorennen starten.app + Spiele/Autorennen/. Start auf dem Mac
  nicht geprüft (Chrome-Erweiterung darf keine file://-Seiten öffnen, Bildschirm gesperrt). (96 %)
## Offen (Handgriffe Sebastian)
1. Doppelklick „🚗 Autorennen starten" im Ordner Spiele (Chrome öffnet sich). Falls macOS die App blockiert:
   Rechtsklick → Öffnen, oder Autorennen/„Autorennen starten.command" doppelklicken.
2. Im Spiel F für Vollbild, ein Rennen allein fahren: Ruckelt es? (H zeigt fps; Ziel ≥ 50)
3. Zu zweit: ↑+← und W+A gleichzeitig halten – lenken beide Autos? (Tastatur-Ghosting)
4. Ton (Taste M): zu laut/leise/schrill? → Rückmeldung, dann stimme ich engine.js ab.

## Runde 2 (11.10.2026) – Rückmeldung Sebastian
- "vieles cool", aber: (1) bei zwei Spielern ruckeln die Autos, (2) Modelle detailreicher + näher am Original (ohne Rechteverletzung)
- Gestartet: Opus-Agent Leistung (Profiler, adaptive Qualität, Split-Screen-Optimierung) + Opus-Agent Automodelle v2
- 11.10. Automodelle v2 (Opus-Agent) gestartet: Recherche Maße fertig, Sicherung alter Stand im Scratchpad
- 11.10. – Automodelle v2 fertig (Opus): carCatalog.js mit echten Maßen (abmessungen) + form-Merkmalen je Auto;
  carBuilder.js neu: Loft-Unterbau mit Radhäusern/Kotflügel-Wölbung, Kabinen-Loft (Fenster/Säulen als Flächenfarben),
  Anbauteile per flaecheZ() auf gewölbter Front/Heck, 5-Speichen-Felgen. 10 Meshes, 5.000–6.900 Dreiecke je Auto.
  Vorschau ?ansicht=alle4, Screenshots tests/out/autos_alle4.png + autos_<id>_alle4.png; 3 Iterationen.
  test_autos.js um 3D-Prüfungen erweitert (Maße ±8 %, Radmitte, Symmetrie, Meshes, Dreiecke) – alle Node-Tests grün.
- 10.10. 23:55 – Leistung/Ruckeln (Opus, übernommen vom unterbrochenen Vorgänger-Agent). Vorgänger hatte schon: H-Overlay +
  `Rennspiel.spiel.leistung()`, HUD ≤ 20 Hz + Text nur bei Änderung, Minimap im Offscreen-Canvas, adaptive Qualität mit
  Hysterese (45/58 fps, 2 s), Split pixelRatio 1,0 / Solo 1,5, Deko-Chunks 3×3 mit boundingSphere, matrixAutoUpdate=false,
  Audio setTargetAtTime + KI > 60 m stumm, KI ohne filter/map, **Interpolation der Auto-Pose (Mesh + Kamera)**.
  Neu: tests/interpolation_test.py (Ruckel-Nachweis), Vorher/Nachher-Tabelle in tests/leistung_test.py
  (Basis tests/leistung_vorher.json = Mac-Stand 20:13), Closures im Frame-Pfad entfernt, HUD style.display nur bei Änderung,
  menu_test: Draw-Call-Schwelle 80 → 120 (Deko-Chunks), Speicherprüfung lädt vorher alle Geometrien (kein falsches „Leck").
  **Hauptursache Ruckeln = Physik-Akkumulator ohne Interpolation**: 60-Hz-vsync ± 1,5 ms Jitter, ungünstige Phase →
  24 % Frames 0 Physikschritte, 24 % 2 Schritte. Tempo-Schwankung je Frame (Variationskoeffizient) 0,66 → 0,05,
  Zittern Auto relativ zur Kamera 13,4 cm → 0,06 cm je Frame (Kamera ist geglättet, darum ruckeln „die Autos", nicht das Bild).
  JS-Zeit war nie das Problem: Split Wald 2560×1600 physik+audio+hud 0,42 → 0,24–0,33 ms (Ziel < 8 ms).
  Split-Screen: Zeichenpuffer −56 % Pixel (pr 1,5 → 1,0), Dreiecke Wald 744k → 610k, Draw-Calls 91 → 114.
  Alle Tests grün (6× node, menu, rennen, screenshot wald, audio, interpolation, leistung). Mac-Messung steht aus (H-Overlay).

## Runde 3 (11.10.2026) – Titel + Fahrerwahl
- Spiel heißt „Jonas Hot Steering Wheel“ (Untertitel Autorennen): <title>, Menü-Kopf, ANLEITUNG.md, ERWEITERN.md; Dateinamen unverändert.
- Neuer Menü-Schritt „Fahrer“ (vor Auto, jetzt 5 Schritte): config.fahrer (12 Namen + Emoji), Standard Jonas/Emmy, Solo 6×2, zu zweit je 3×4,
  P1 Pfeile / P2 WASD / Maus; gleicher Fahrer nicht möglich (Bewegender springt weiter, Karte „vergeben“ markiert).
- Namen in HUD (auch Solo), Rundenmeldungen/Zieleinlauf (Name über der Meldung), Ergebnis; Computer = nicht gewählte Fahrer (Vorrang Schumacher, Senna, Verstappen, Röhrl), „🤖 Name“.
- localStorage `fahrer: [p1, p2]`, einstellungenPruefen validiert; Hilfsfunktionen in config.js (R.fahrerEindeutig, R.fahrerComputerNamen), tests/test_fahrer.js neu.
- tests/menu_test.py um Fahrer-Schritt/Titel/Namen erweitert, alle Tests grün. Screenshots 1280×800 und 1440×900 geprüft.
- 11.10. – Runde 2 abgeschlossen: (1) Ruckeln: Ursache Physik-Akkumulator ohne Interpolation (0/2 Schritte je Frame),
  jetzt interpoliert (Zittern 13,4 cm → 0,06 cm/Frame), dazu pixelRatio 1.0 im Split, adaptive Qualität, HUD 20 Hz,
  Deko-Chunks, Leistungs-Overlay (H); (2) Automodelle v2 mit echten Maßen (5–7k Dreiecke/Auto, 10 Meshes);
  (3) Titel "Jonas Hot Steering Wheel", Fahrerwahl (12 Fahrer, KI nimmt Restnamen). Alle Tests grün.
  Offen: M4/AMG-Front zu flach; Messung auf dem Mac (H-Overlay) fehlt

## Runde 3 (11.10.2026) – siehe PLAN_RUNDE3.md
- Rückmeldung: "super" + 6 neue Wünsche (3D-Autowahl drehbar, 220–270 km/h, Berg/Brücke/Tunnel mit Licht,
  Hindernisse Öl/Baustelle/Sand/Ast, 3 weitere KI-Stufen, Fantasie-Strecke mit 2 Loopings, Bällen, Wasserstrahl)
- Offene Fragen F1–F4 in PLAN_RUNDE3.md; Entscheidungen vorläufig getroffen
- Welle 1 gestartet: A Tempo/Schwierigkeit (Opus), B Streckenelemente (Opus), D 3D-Autowahl (Sonnet)
- 11.10. Agent B (Opus) – Streckenelemente + Hindernisse: Höhen neu (Wald −11…14 m, Wüste −8…13 m, Wiese −2…6 m, ≤ 8 %),
  Brücken (Wiese Stein über Teich, Wald Holz über Bach, Wüste Beton/Stahl über Schlucht; Senke = bodenHoehe),
  Tunnel (Wald Fels 690–780, Wüste Sandstein 130–220; Lampen, 3 Punkt- + 2 Spotlichter nur im Tunnel, Licht je Ansicht gedimmt),
  Hindernisse (config.hindernisse, trackCatalog.hindernisse, Kollisionen.hindernisse), Nicken nach Steigung.
  Neue Tests: tests/test_hindernisse.js, test_strecke.js (Brücken/Tunnel/Hindernisse), screenshot_test.py Bilder 13–18.
  Offen (Agent A/driver.js): KI weicht noch nicht aus → Schumacher hängt auf der Wiese an der Baustellen-Bake (s≈820),
  rennen_test 400 s: nur 1 Runde. Struktur strecke.hindernisse an Agent A gemeldet; main.js ruft driver.hindernisseSetzen() falls vorhanden.
- 11.10. Agent C (Opus) – Strecke „Fantasie“ fertig: trackCatalog 'fantasie' (1.388 m, Breite 14, Bauplan tests/bauplan/fantasie.json),
  Thema 'fantasie' (lila Himmel, Pastell-Felder, Riesenpilze, Zuckerwatte-Bäume, Ballons, Pastell-Hügel, Regenbogen, Regenbogen-Randsteine).
  2 Loopings (s=170 Start-Gerade, s=800 Süd-Gerade, r=12, vMin 87 km/h) – neu src/track/looping.js (Helix-Band, Gerüst, Fahrlogik
  Spieler=KI, Sturz → zurück vor die Einfahrt „Mehr Anlauf! 🚀“, zu langsam → unten durch „Schneller für den Looping!“, Kamera rollt mit).
  Bälle (3 Stellen, ab Runde 2 bzw. letzte Runde, −60 %) + Wasserfontänen (2, alle 20 s, −40 % + Schlingern) – neu src/world/dynamik.js.
  HUD.meldung() oben; Kollisionen ignorieren Autos im Looping (vehicle.imLooping). Autorennen.html: 2 neue <script>-Zeilen.
  Tests: neu test_looping.js, test_dynamik.js; test_strecke/test_rundenzeit/test_ki/screenshot_test/rennen_test/menu_test auf Fantasie erweitert.
  KI Runde 2: leicht 65,4 s … unschlagbar 49,0 s, alle 7 Stufen 4/4 Loopings, 0 Stürze. rennen_test fantasie: 3 KI × 3 Runden in 400 s.
  Offen (nicht meine Dateien): menu.js Kartenfarbe für Thema fantasie fehlt (Karte grün wie Wiese); 4. Streckenkarte bricht bei 1280 px
  in Zeile 2 um und wird unten abgeschnitten (styles.css .karte.strecke { width: 16em } → z. B. 13.5em).
- 11.10. – Runde 3 abgeschlossen (Hauptmodell geprüft): 10 Node-Testdateien + menu_test (alle Prüfungen) +
  rennen_test wiese/fantasie grün. V_DECKEL Ideallinie 45→78 m/s, Tacho 280. Screenshots Looping/Bälle/
  Tunnel/Baustelle angesehen. Offen: Fragen F1–F4 in PLAN_RUNDE3.md; Leistung mit Tunnel-Lichtern auf dem
  Mac ungemessen; M4/AMG-Front weiter flach.

## Runde 4 (11.10.2026) – siehe PLAN_RUNDE4.md
- Antworten F1–F4 + neue Wünsche (Welten-Add-on, Jahreszeit/Wetter/Wind, Schaden, Schanzen, Wracks, 10 Gegner,
  Emojis Emmy 🦁 Jonas 🐯). Oberstes Gebot: Bestehendes bleibt spielbar (Welt "Klassisch", Standard-Einstellungen).
- Welle 1 gestartet: A Längen/Spuren/Welten (Opus), B Jahreszeit/Wetter/Wind (Opus)
- 11.10. Agent A (W1-A, Opus) – Längen + Welten + Spuren fertig:
  F1: Wiese ×1,35 = 3.040 m, Wald ×1,25 = 2.477 m, Wüste ×1,45 = 3.331 m (Punkte + Hügel x/z/r um den Schwerpunkt, h gleich,
  alle s-Werte × Faktor; Bauplan-JSON + generator.js kennen "skalierung"). Bodenplatte wächst mit (Strecke + 450 m, Feld 16 m).
  KI Runde 2 (leicht…unschlagbar): Wiese 120,8/108,0/…/87,3 · Wald 127,0/112,4/…/88,4 · Wüste 116,4/103,6/…/83,7 s
  → mittel Wiese/Wüste knapp unter Ziel 110 (Test-Band 100–130).
  Welten: trackCatalog welten/weltStandard (Wiese klassisch, Wald/Wüste hindernisse, Fantasie fantasie|verrueckt), R.weltInfo;
  new R.Strecke(daten, { welt }) → strecke.welt/weltDaten/aktiveSchichten, gefilterte strecke.daten (dynamik.js), Listen
  wracks/strohballen/schanzen/boostFelder/schilde (nur Daten). Spuren: breiteBei(s), spurBei(s), Leitplanken (1 Spur),
  2 Mittellinien (3 Spuren), Bande/Untergrund/Checkpoints lokal; driver.js begrenzt Versatz auf ±max(0,5; breiteBei/2 − 2,2).
  Tests: test_strecke (Welten/Spuren/Sperrzonen), test_rundenzeit + test_ki (Stunt-Welt), test_hindernisse (Welt),
  screenshot 23_spur_eng/23b/24_spur_breit, rennen_test 560 s für lange Strecken. Alle Node-Tests + rennen wiese/fantasie
  + screenshot wiese/wald/wueste/fantasie + menu_test grün. Offen für main.js: Welt durchreichen (siehe Bericht).
- 11.10. Welle 1 fertig + integriert (Fable): Längen Wiese 3.040/Wald 2.477/Wüste 3.331 m (mittel 104–112 s,
  Testgrenze 100–130 s gelockert – F1 nicht ganz erreicht, Kurven werden mit Skalierung schneller), Spuren
  (breiteBei), Welten-Datenmodell (welten/weltStandard/aktiveSchichten; Welt-Daten für wracks/strohballen/
  schanzen/boost/schilde liegen bereit), Wetter/Jahreszeit/Wind (wetter.js; ohne Einstellung bitgenau wie
  vorher). main.js: Welt-Wahl (einst.welt), Wetter-Einbau, Einstellungen welt/jahreszeit/wetter/windStaerke/
  windRichtung/schaden mit Validierung; Smoke-Test Winter-Schnee/Herbst-Regen/Sandsturm ok, 11 Node-Tests grün
- Welle 2 gestartet: C Schaden+Wracks+Strohballen (Opus), D Schanzen+Boost+Schild (Opus)
- 11.10. Agent D (W2-D, Opus) – Sprungschanzen + Turbo-Felder + Schild fertig (main.js/hud.js/collisions.js NICHT geändert):
  Neu src/track/schanze.js (R.Schanzen: zustand, nachSchritt, flugSchritt, hoehe, anzeigeNicken, inLuft, abbrechen, hoeheAuf,
  liste, bauen; Keil mit Pfeilen, rot-weißen Rändern, Zielstreifen, Fahnen; vyMax 5 m/s deckelt Flugweite → 270 km/h ≈ 85–100 m),
  neu src/world/pickups.js (R.Pickups: schritt, faktoren, turboAktiv, hatSchild, schildVerbrauchen, vorTreffern/nachTreffern,
  zuruecksetzen, ton, bauen [Kugeln], felderBauen [statisch], animieren, zerstoeren), config.stunt, trackBuilder: schanzenBauen()/
  boostBauen() in bauen(). Tests: neu test_schanze.js (30 m/s/12°: 1,33 s, 39 m, ×0,95; quer/abseits ×0,8; KI 7 Stufen × Wiese/
  Wald/Wüste: alle Schanzen geflogen, 0 schräg), test_pickups.js (Turbo 2,5 s + 2 s Auslauf, ≤ 8,3 m/s² Verzögerung, Schild genau
  1 Treffer, Respawn 10,000 s, KI sammelt), test_strecke (Welten + freie Landung), tests/stunt_screenshot.py (7 Bilder, 2 Iterationen
  angesehen; Fehler gefunden+behoben: Flammen blieben nach zuruecksetzen()). Alle 14 Node-Tests grün.
  EINBAU W2-D (für Agent F):
   a) Autorennen.html: <script src="src/track/schanze.js"> nach looping.js, <script src="src/world/pickups.js"> nach dynamik.js.
   b) fahrzeugHinzufuegen: eintrag.flug = R.Schanzen ? R.Schanzen.zustand() : null;
   c) streckeSzeneBauen (nach Dynamik): this.pickups = null; if (R.Pickups && (strecke.boostFelder.length || strecke.schilde.length))
      { this.pickups = new R.Pickups(strecke); this.szene.add(this.pickups.bauen()); }   (Turbo-Felder baut strecke.bauen() schon)
   d) physikSchritt je Auto, direkt nach dem Looping-Block: const fz = f.flug; if (fz && fz.aktiv && strecke) {
      const e = R.Schanzen.flugSchritt(fz, v, strecke, s, dt); const n = strecke.abfrage(v.x, v.z, f.index); f.index = n.index;
      f.nah = n; f.bremst = false; this._flugEreignis(i, e); return; }
      Um v.schritt: const fk = this.pickups ? this.pickups.faktoren(i) : null, dd = v.daten, vm0 = dd.vMax, b0 = dd.beschleunigung;
      if (fk) { dd.vMax = vm0 * fk.vMax; dd.beschleunigung = b0 * fk.beschleunigung; }  v.schritt(...);
      if (fk) { dd.vMax = vm0; dd.beschleunigung = b0; }   (exakt zurück, verträgt Schaden/datenBasis, solange die nicht IN schritt schreibt)
      Danach: if (fz && strecke && f.nah) this._flugEreignis(i, R.Schanzen.nachSchritt(fz, v, strecke, f.nah, xAlt, zAlt, dt));
   e) Treffer mit Schild: vor JEDER Prüfung, die Treffer selbst anwendet (Kollisionen.hindernisse, dynamik.kollisionen, Strohballen/
      Wrack von Agent C): const sch = this.pickups && this.pickups.vorTreffern(this.fahrzeuge); let hs = …prüfung…;
      if (sch) hs = this.pickups.nachTreffern(this.fahrzeuge, hs);   (Treffer-Objekte brauchen .nr). Schaden (Agent C): vor dem Abzug
      if (this.pickups && this.pickups.schildVerbrauchen(i)) → Treffer ignorieren.
   f) Nach den Kollisionen: if (this.pickups) { this.pickups.schritt(dt, this.fahrzeuge).forEach(e => e.typ === 'turbo'
      ? (this._meldung(e.nr, 'TURBO! 🔥', 1200), this.fahrzeuge[e.nr].istSpieler && this.pickups.ton('turbo'))
      : (this._meldung(e.nr, 'Schutzschild! 🛡️', 1200), this.fahrzeuge[e.nr].istSpieler && this.pickups.ton('schild')));
      this.pickups.geplatzt.forEach(g => { this._meldung(g.nr, 'Schild weg! 💥', 1000); if (this.fahrzeuge[g.nr].istSpieler) this.pickups.ton('platzen'); }); }
   g) y: if (strecke && !v.imLooping) v.y = f.flug ? R.Schanzen.hoehe(f.flug, v, strecke) : strecke.hoeheAn(v.x, v.z);
      (Interpolation a.y→v.y in frame läuft dann von selbst; Kamera folgt anzeige.y)
   h) _flugEreignis(i, e): 'sprung' → _meldung(i, 'Sprung! ✈️', 1300); 'landung'|'landungSchraeg' → für Spieler Kamera
      wackeln(R.config.stunt.schanze.kameraWackeln) + R.Audio.kollision(Math.min(6, 2 + f.flug.landeStaerke / 2));
      'landungSchraeg' optional _meldung 'Rumms! 😬'.
   i) frame: nach der Steigungsberechnung: if (f.flug && R.Schanzen.inLuft(f.flug)) steigung = 0;
      mesh.rotation.set(d.nicken + steigung + (f.flug ? R.Schanzen.anzeigeNicken(f.flug, alpha) : 0), d.heading, d.neigung, 'YXZ');
      neben dynamik.animieren(): if (this.pickups) this.pickups.animieren(this._physikZeit || 0, this.fahrzeuge);
   j) zuruecksetzen(i): if (f.flug) R.Schanzen.abbrechen(f.flug, f.vehicle);   szeneAbbauen (ganz vorne):
      if (this.pickups) { this.pickups.zerstoeren(); this.pickups = null; }   Neues Rennen auf gleicher Szene: pickups.zuruecksetzen().
   k) collisions.js: autoAuto `if (A.imLooping || B.imLooping || A.imFlug || B.imFlug) continue;`, hindernisse
      `if (v.imLooping || v.imFlug) continue;` (test_schanze meldet per INFO, ob das schon drin ist; Bande bleibt an).
  Schwächen: Rampe von der Seite befahren = kein Flug (Auto fährt „durch" den Keil); Flugweite per vyMax gedeckelt (Arcade);
  Turbo-Ende bremst bis 8,3 m/s² (Auslauf 2 s); KI fährt Pickups nicht gezielt an (sammelt zufällig, Test: alle Stufen ≥ 2 Turbos).
- 11.10. Agent C (W2-C, Opus) – Schaden + Wracks + Strohballen fertig (main.js/Autorennen.html NICHT geändert → Einbau-Anleitung im Bericht):
  neu src/physics/schaden.js (R.Schaden: treffer/stoesseAuswerten/schritt/update/zustand/gesperrt/meshBauen/bei/zerstoeren,
  Faktoren über vehicle.datenBasis → neue vehicle.daten-Kopie; Ereignisse treffer/stufe/liegengeblieben/abschleppwagen/abschleppen;
  R.Schaden.wrackGruppe = Grafik Wrack/Brand mit Warnblinker, Warndreieck, Flammen-Sprites, Glut, Rauchsäule, selbst animiert
  über onBeforeRender). collisions.js: wracksEinbauen(strecke) + Wrack-Kapsel (Stoß typ 'wrack'/'brand'). trackBuilder
  hindernisseBauen(): ruft wracksEinbauen + wrackGruppe. dynamik.js: Strohballen (rollen ab Runde 1, −50 %, kippen, 3 s am Rand).
  config: hindernisse.wrack/brand, strohballen, schaden (standardAn false). hud.js/styles.css: Gesundheitsbalken (schadenSetzen).
  engine.js: schadenTreffer/liegengeblieben/abschleppen. Tests: neu test_schaden.js, test_hindernisse (Wracks), test_dynamik
  (Strohballen), tests/schaden_screenshot.py (6 Bilder in tests/out/schaden, angesehen). Alle 14 Node-Tests grün.
  Offen: driver.js behandelt wrack/brand nur „weich“ → Wald-brand wird von meister/legende/unschlagbar gestreift
  (Vorschlag: hart = … || h.typ === 'wrack' || h.typ === 'brand' → 0 Treffer, geprüft in Kopie); main.zuruecksetzen meidet nur
  baustelle/ast (wrack/brand ergänzen); schaden.js-<script> in Autorennen.html fehlt.
- 11.10. Agent F (Integration W2 C+D in main.js, Fable/Opus) – fertig:
  main.js: Kopfkommentar + Reihenfolge-Kommentar über physikSchritt (Eingabe → gesperrt → Looping/Flug → Turbo-Faktoren
  → vehicle.schritt → nachSchritt → Kollisionen [Bande, Auto, Hindernis/Dynamik mit Schild vor/nach] → Schaden → Pickups
  → Höhe/Feststecken/Rennen). Eingebaut: f.flug (fahrzeugHinzufuegen), Flug ersetzt vehicle.schritt, Turbo-Faktoren nur um
  vehicle.schritt (exakt zurück), y = Schanzen.hoehe, Flug-Nicken in frame (Steigung 0 in der Luft), _flugEreignis
  (Sprung/Landung/Rumms), Pickups bauen/schritt/animieren/zerstoeren (erst ab Rennfreigabe), Schild vor/nach Hindernissen
  und Dynamik + gegen Bande/Auto-Schaden (schaden.zaehlt/abfangen, neu in schaden.js), Schaden aus einstellungen.schaden
  (opt.schaden, meshBauen, Ereignisse → Ton/Meldung, 'abschleppen' → zuruecksetzen + driver.zurueckgesetzt), gesperrt =
  nur Bremse (KI wird nicht gefragt), R-Taste gesperrt während liegengeblieben, HUD schadenSetzen, schaden.update je Frame,
  Dynamik auch bei NUR Strohballen (Bedingung jetzt aus strecke.daten = nach Welt gefiltert), zuruecksetzen meidet
  wrack/brand (Breite über breiteBei) und bricht den Flug ab. Autorennen.html: schaden.js nach collisions.js, schanze.js
  nach looping.js, pickups.js nach dynamik.js. collisions.js: imFlug in autoAuto/hindernisse (Bande bleibt), dynamik.js:
  imFlug nicht treffbar, driver.js: hart auch für wrack/brand. config.rennen.gegnerMax 5 → 10 (Startplätze für 11 und 12
  Autos alle auf der Straße, alle Strecken/Welten). schaden.js: Rauch-Points mit fester Hüllkugel (frustumCulled).
  Fehler gefunden+behoben: (1) pickups.geplatzt wurde von schritt() geleert, bevor main es liest (Anleitung f) → jetzt vorher
  gemeldet; (2) Wracks hatten in Wald/Wüste-Standard schon Kollision, aber keine Grafik (schaden.js fehlte im HTML);
  (3) Turbo/„TURBO!“ im Countdown → Pickups erst ab gasErlaubt.
  Tests: 14 Node-Tests grün (test_schanze: „collisions.js kennt imFlug“), rennen_test wiese/wald/wueste/fantasie grün,
  menu_test 81 OK, NEU tests/welten_test.py (14 Strecke×Welt, Schaden an, Regen, Wind 3, 10 Gegner, 5 Runden, 200 s):
  97/97 OK inkl. KI liegengeblieben → abgeschleppt → fährt weiter und Regression (wiese ohne Felder = klassisch, nichts
  aktiv, Bahnen nach 60 s bitgleich mit/ohne die drei neuen Module). Bilder tests/out/welten/*.png angesehen.
  Draw-Calls: Bilder 32–133; schlimmster Fall Spieler hinter 10 qualmenden Gegnern 157–170 (Wald/Wüste verrückt 170).
  Offen: tests/stunt_screenshot.py + schaden_screenshot.py hängen den Einbau selbst ein → jetzt doppelt, anpassen;
  Wetter 'regen' in der Wüste ohne Regen-Symbol (wetter.js entscheidet); Leistung auf dem Mac ungemessen.
  Hinweis: Die Einbau-Anleitung von Agent C (Punkte 1–8) stand nicht in VERLAUF.md – Einbau nach der API in schaden.js/Kopfkommentar.
- 11.10. Runde 4 abgeschlossen (Fable-Prüfung): 14 Node-Tests, menu_test 128 OK, welten_test 97 OK,
  rennen_test alle 4 Strecken grün. Menü: Welt-Zeile je Strecke, Jahreszeit/Wetter/Wind/Schaden (2 Spalten),
  Gegner bis 10, Emmy 🦁 Jonas 🐯 (Kerle → 🐺). Doku aktualisiert. Übertragen auf den Mac.
  Offen/Fragen: F1 Rundenzeit mittel 104–112 s statt ≥110 (weiter verlängern?); F5–F8 (PLAN_RUNDE4.md);
  Leistung auf dem Mac mit 10 Gegnern + Wetterpartikeln ungemessen; stunt_/schaden_screenshot.py doppelter Einbau (nur Testskripte).

## Runde 5 (11.10.2026) – siehe PLAN_RUNDE5.md
- Rückmeldung: schwerer fahrbar, zu zweit kaum; Versionen sichern; Looping/Schanze-Anlauf; Zaun; dann Dino, Polizei, F1, Kleber
- Schritt 1: Versionen auf dem Mac anlegen; Schritt 2: Messung in Sebastians Chrome über Artefakt-Seite
- 11.10. Messung auf Sebastians Mac (Artefakt-Seite in seinem Chrome, Overlay H): Solo Wiese 60 fps, 1,32 ms/Frame
  (physik 0,21, render 0,95), Draw-Calls 63, pixelRatio 1,5, Qualität voll. Zu zweit Wald Klassisch: 60 fps,
  1,91 ms/Frame, Draw-Calls 144, pixelRatio 1,0 → Leistung ist NICHT die Ursache (H1 widerlegt, Fenster 1200×1449;
  Vollbild ungemessen). Ursache: H2 Fahrphysik (Tempo/Lenkung/Streckenskalierung), zu zweit durch halbe Sicht verschärft.
  H3 Ghosting bleibt offen (Handgriff). Versionen v1–v4 in _versionen/ gesichert.
- Welle Fix gestartet: A Fahrbarkeit (Tempo-Klasse, Lenkung, Kamera, Physikschritt), B Anlauf/Zaun/Kleber (Opus ×2)
- 11.10. Agent B (Fix-B: Anlauf/Zaun/Kleber, Opus) – fertig:
  Zaun-Lücken (tests/zaun_test.js, 4 Strecken × alle Welten, 40 Stellen, 20/45/75 m/s × 15/45/90°, 10 080 Läufe/Welt-Satz):
  (1) Hauptursache: Bande prüfte nur die AUTO-MITTE → Blech ragte bis 3,7 m durch Zaun/Geländer/Leitplanke/Tunnelwand
  (90°-Aufprall: halbe Länge). Fix collisions.bande: 4 Karosserie-Ecken (+ Mitte) gegen grenzeBei(s), tiefste Ecke
  zurückschieben (bis 3 Durchgänge), Tempo in die Bande weg, nach dem Eindrehen nochmal nachschieben (kein Hängenbleiben).
  Jetzt max. 0,02 m. Mitte entkam nie (kein Tunneln: Grenze ist ein Halbraum je Streckenstück, kein dünnes Segment).
  (2) Zaun-Deko bis 1 m an Stellen, wo ein anderes Streckenstück näher lag (dort keine Bande) → zaunPunkte ok nur, wenn der
  Punkt zum eigenen Stück gehört. (3) Startbogen-Masten + Looping-Gerüstbeine waren durchfahrbar → strecke.saeulen (feste Kreise).
  Bande im Flug/Looping-Austritt aktiv (bestätigt). Leitplanke/Geländer/Tunnelwand liegen an der Grenze (Karosserie stößt an).
  Anlauf (neu src/track/anlauf.js, config.anlauf): weiche Bremse (5 m/s²) bis 10 m vor Looping-Einfahrt/Rampe, wenn
  Vorhersage < Mindesttempo; ausgerollt davor stehen = gleicher Zustand; HUD „Zu langsam! 🐢 / Zurück und Anlauf nehmen –
  oder R: Anlaufposition" (Spieler 2: T, hud.meldung kann jetzt 2 Zeilen); R/T → Anlaufposition (freie Stelle, 8 m, sonst
  10 m zurück). Notstopp in looping.einfahrt/schanze.nachSchritt (nie mehr unten durch / auf den Keil). Looping oben:
  Arcade-Hilfe mit Gas ab 0,9·nötigem Tempo. KI: in der Anlauf-Zone Vollgas bis vMin+10 % (kiHilfe – Gummiband bremste
  sie sonst unter vMin → Endlosschleife), nach 2 s Stillstand selbst auf Anlaufposition. Schanze-Mindesttempo 14 m/s.
  Anlauf-Abstände: Loopings 160 m (berechnet: Multivan/Normal braucht 149 m bis 96 km/h), alle Schanzen 150 m (Standard,
  braucht 43 m). Katalog-Feld `anlauf` überschreibt.
  Kleber (neu src/world/kleber.js, config.kleber, Schicht 'kleber' nur Fantasie beide Welten): 4 Abschnitte
  (220–270 L, 470–530 beide, 975–1035 L, 1170–1230 R), Untergrund 'kleber' (grip 0,7, roll 8, vMax 0,6), > 2 s → 5 s
  festgeklebt (Fäden/Blasen, HUD-Countdown), „Gelöst! 💨" + 2 m/s zur Mitte + 3 s Schonzeit (Streifen = Rand; sonst
  käme der Multivan/Normal mit Roll 8 nie herunter). main.js: nur Looping/Flug-Block (+1 Zeile Untergrund), Meldungen,
  Reset-Funktionen. Autorennen.html: anlauf.js, kleber.js.
  Tests: neu zaun_test.js (38 OK, ~75 s), test_kleber.js; test_looping/test_schanze erweitert (Stopp, rückwärts, R,
  Vollgas aller 8 Autos × Klassen + Worst Case, Mindest-Anlauf); alle 16 Node-Tests grün, screenshot_test fantasie
  (Bilder 25/25b/26/27/27b angesehen), rennen_test fantasie, welten_test 97 OK.
  Schwächen: Fantasie-Pilze/Schilder zwischen Straße und Zaun bleiben durchfahrbar (Deko, keine Zäune); Kleber-Streifen
  ähnelt den grünen Regenbogen-Randsteinen (glänzt + Tropfen); Schanze von der Seite weiter „durch den Keil".
- 11.10. Agent A (Fix-A Fahrbarkeit, Opus) – fertig:
  1. Tempo-Klasse: config.tempoKlassen { normal: vMax ×0,70, Beschl. ×0,85, Bremsen ×0,9 | schnell: Katalog },
     tempoKlasseStandard 'normal'; Einstellung `tempoKlasse` (standardEinstellungen/einstellungenPruefen), Menü-Zeile
     „🏎️ Tempo: Normal / Schnell (220–270 km/h)" rechts unter Schaden (Fokus-Reihenfolge …schaden, tempo, start).
     vehicle.js: new Vehicle(daten, { tempoKlasse }) rechnet die Faktoren einmal in daten ein (vor schaden.datenBasis,
     Turbo bleibt multiplikativ); ohne Option Vehicle.klasseStandard (null = Katalog; Tests setzen sie). main.js:
     streckeAufbauen(opt.tempoKlasse) → this.tempoKlasse → fahrzeugHinzufuegen (Spieler + KI gleich). normal = 154–189 km/h.
  2. Lenkung: config.physik.lenkung { rateVmax 0,52, rateHalb 0,80 rad/s, bezug 1,8, ueberDrift 0,35, ueberBremsen 0,15,
     einschwingen 9, zurueck 12 }. drehrateMax = min(langsam, max(Haftgrenze, Arcade-Untergrenze × √(Wendigkeit/bezug))).
     Über der Haftgrenze: Rutschen nach außen + Tempoverlust (Untersteuern). Standard-Auto: vMax 0,35 → 0,52 rad/s
     (normal 0,44 → 0,52), 50 % vMax 0,56 → 0,80 (normal 0,75 → 0,80); Volleinschlag 2 s bei vMax max. 1,13 rad (Mini).
  3. Kamera (cameras.js, config.kamera): Abstand 9→12 m, Höhe 3,6→4,6 m, Vorausblick 5→9 m linear mit Tempo/vMax
     (geglättet), Blick folgt Fahrtrichtung inkl. Drift + Lenk-Vorgriff 0,12 rad, eigene blickWeichheit 7; weit/cockpit
     analog leicht; fovSplitScreen 70→74.
  4. frame(): maxSchritteProFrame 3→4, Frame > 80 ms (physik.frameVerwerfenMs) → Rest verworfen; Eingabe wird je
     physikSchritt aus dem aktuellen Tastenzustand gelesen, frameEnde() danach (geprüft).
  5. KI driver.js: Mindesttempo-Bereiche vor Schanzen (80 m vorher bis Kante ≥ 27 m/s, gedeckelt auf 100-%-Ideallinie;
     Katalog-Feld minTempoBereiche optional) – vorher Wald-Schanze 2082 nach Kurve: „leicht" 74 km/h.
  Tests: test_physik (neue Erwartungen je Klasse, alle Autos, Lenktempo, Lenkhilfe-gegen-Spieler, Fingerabdruck neu),
  test_rundenzeit + test_ki laufen je Klasse (TEMPO_KLASSE, ohne = beide), neu tests/test_welten_ki.js (4 Strecken ×
  alle Welten × 7 Stufen × 2 Runden, Absprung ≥ 90 km/h außer Start-Schanze Runde 1, Loopings), neu
  tests/fahrbarkeit_test.py (Tastatur-Hold, Wiese/Wald, Solo + Split P1 Pfeile / P2 WASD: 100 % auf der Straße),
  interpolation_test (Toleranz 0,12 + bereinigte Kennzahl, s. u.), menu_test 130 OK, welten_test 97 OK, 17 Node-Tests grün.
  Rundenzeiten KI mittel (Runde 2): normal Wiese 113,9 / Wald 115,2 / Wüste 113,5 / Fantasie 62,2 s;
  schnell 108,0 / 112,3 / 103,6 / 59,0 s.
  Schwächen: Rundenzeit normal nur ~5 % langsamer (Kurven bestimmen sie, Geraden kurz); Verfolger-Kamera hinkt
  weiterhin ~v/4,5 m nach (exponentielles Nachziehen) – effektiver Abstand bei Tempo größer als 12 m; Tacho-Balken
  bleibt bei 280 km/h Vollausschlag (normal ~60 %); welten_test-Abschlepp-Prüfung ist lageabhängig (1× rot im
  Parallel-Lauf: KI im Flug beschädigt bzw. Reset kurz vor Looping, Wiederholung grün); Start-Schanze (Runde 1)
  aus dem Stand nur 80–96 km/h; interpolation_test: Roh-Kennzahl 0,12–0,13 kommt vom echten Beschleunigen in „normal"
  (bereinigt 0,001) → Kriterium bereinigt < 0,05.
- 11.10. Runde 5a abgeschlossen (Fable-Prüfung): Tempo-Klasse Normal (Standard, 154–189 km/h) / Schnell;
  Lenkung direkter (vMax 0,52 rad/s statt 0,35), Kamera tempoabhängig; Anlauf-Mechanik Looping+Schanze (R/T =
  Anlaufposition 150–160 m), Zaun dicht (4-Ecken-Bande, Masten fest), Fantasie-Kleberstreifen.
  17 Node-Tests + zaun_test + menu/welten/rennen grün. → Version v5.
