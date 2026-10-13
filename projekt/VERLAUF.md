# VERLAUF – Autorennen-Projekt (Dokumente)

Ältere Einträge: `Autorennen/VERLAUF.md` und `Autorennen-Versionen/UEBERGABE_2026-10-12.md`.

- 12.10. 09:55 Ordner `~/Documents/Autorennen-Projekt` angelegt, `Autorennen` (9,3 MB) kopiert.
- 12.10. 09:56 Befund: In `~/Desktop/Spiele/Autorennen-Versionen` waren 1.293 von 1.336 Dateien iCloud-Platzhalter
  (Lesen → „Resource deadlock avoided“), auch Übergabe und `🚗 Autorennen NEUESTE starten.command`.
  Desktop liegt auf dem mini in iCloud Drive („iCloud Drive › Schreibtisch“).
- 12.10. 09:58 Finder → Rechtsklick `Autorennen-Versionen` → „Laden und behalten“. Nach ~90 s alle 1.505 Dateien lesbar.
- 12.10. 10:00 `Autorennen-Versionen` neu kopiert, `diff -rq` gegen Quelle: identisch (1.607 Dateien gesamt).
  `🚗 Autorennen NEUESTE starten.command` noch Platzhalter → nicht kopiert.
- 12.10. 10:01 v11-Server mit Node 22 im Linux-Testsystem gestartet: läuft, `GET /` → HTTP 200.
  → Wahrscheinlichste Ursache des offenen Problems: Spiel-/Serverdateien waren beim Start noch iCloud-Platzhalter.
- 12.10. 10:04 Terminal auf dem mini angesehen: Der Server aus dem Funnel-Start (Desktop-Ordner) **läuft inzwischen**
  („Mehrspieler-Server läuft (Port 8443)“, Öffentliche Adresse https://mac-mini-von-sebastian.tail39c1c2.ts.net:8443/).
  Ursache bestätigt: Dateien waren iCloud-Platzhalter, der Server brauchte zum Laden länger als die 10-s-Warteschleife
  im Starter → Browser öffnete zu früh → ERR_CONNECTION_REFUSED. Der manuelle Zweitstart meldete daher „Port 8443 belegt“.
- 12.10. 10:04 `_diagnose/Server-Diagnose.command` per Doppelklick lief nicht (kein Log) – nicht mehr nötig.
- 12.10. 10:05 Dokumente liegt auf dem mini ebenfalls in iCloud → „Laden und behalten“ für `Autorennen-Projekt` gesetzt.
  `🚗 Autorennen NEUESTE starten.command` ergänzt (neu geschrieben: öffnet v11 aus dem Dokumente-Ordner). Offen: Handy-Test, dann Stufe 2 (Rempeln online).
  Verbesserung vorgemerkt (v12): Warteschleife im Internet-Starter von 10 s auf 60 s mit Hinweis „lädt noch …“.
- 12.10. 10:20 Alten Server (Desktop-Ordner) per Fenster-Schließen beendet (Server + Funnel). Neu gestartet per Doppelklick:
  `Documents/Autorennen-Projekt/.../v11_2026-10-12_online_touch/Mehrspieler im Internet starten.command` → Server läuft
  sofort (Port 8443), Funnel aktiv, öffentliche Adresse https://mac-mini-von-sebastian.tail39c1c2.ts.net:8443/.
  „Laden und behalten“ für Autorennen-Projekt bestätigt (kein Wolkensymbol). Nächster Schritt: Handy-Test.
- Hinweis: Pfade mit Leerzeichen im Terminal immer in Anführungszeichen.
- 12.10. Handy-Test über Mobilfunk bestanden (Sebastian: „klappt, war super“). W5 Stufe 1 damit abgeschlossen.
  Offen: Stufe 2 Rempeln online + Starter-Wartezeit 60 s → v12.
- 12.10. Start v12 (Sebastian: Ping über Mobilfunk ~90 ms → Rempeln online sinnvoll). v11 bleibt unverändert.
  Code (ohne node-Binary/tests/out/.app/versionen_r6) als `_transfer/v11_code.tgz` in die Cloud-Arbeitsumgebung geholt,
  Sicherung dort `sicherung/v11_original`. Befund: Server kann Rempeln schon (`einstellungen.kollisionen`, simulation.js);
  fehlt: Menü-Schalter in der Online-Lobby + Vorhersage berücksichtigt andere Autos nicht.
  Plan: Sonnet-Agent A = Rempeln online (vorhersage.js, online.js, Tests, Doku); Sonnet-Agent B = Starter-Wartezeit 60 s.
- 12.10. Agent B (Sonnet) fertig: beide Mehrspieler-Starter warten bis 60 s („⏳ Server lädt noch …“), erkennen Server-Absturz
  (Funnel wird abgeschaltet), Browser erst nach Antwort. Linux-Stub-Test: Start nach 15 s ok, Absturz erkannt.
- 12.10. Agent A (Sonnet) fertig: Lobby-Schalter 👻 Geister / 💥 Rempeln (Host, gemerkt im localStorage), Vorhersage mit
  Stellvertretern der anderen Autos (nur bei Rempeln; ohne bitgleich zu v11). Tests: test_netz 44→52 grün, online_test 23→29,
  menu 175, touch 76, übrige Node-Tests grün. Schwächen: Gegner in der Vorhersage geradeaus; andere Autos ~100 ms + Ping/2
  hinter dem eigenen gezeichnet (Stoß optisch leicht versetzt). Nächster Schritt: Prüfung durch Hauptmodell.
- 12.10. Prüfung Hauptmodell: Diff gelesen (nur vorhersage.js, online.js, main.js, Starter, Tests, Doku), Rempel-Modus
  Server/Client beide 'sanft'. Selbst ausgeführt: 22 Node-Tests + zaun_test grün, test_welten_ki grün, online_test 29/29,
  Lobby-Bilder Host/Gast angesehen (Schalter „🚗💥 Autos untereinander“ unter „Deine Wahl“).
- 12.10. v12 abgelegt: `Autorennen-Versionen/v12_2026-10-12_rempeln_online` (v11 kopiert + Code per tar --overwrite,
  diff gegen v11 = genau die 12 erwarteten Dateien). VERSIONEN_v12.md, NEUESTE-Starter zeigt auf v12.
  Offen: echter Rempel-Test mit 2 Menschen über Internet; Gegner in der Vorhersage nur geradeaus hochgerechnet.
- 12.10. Start v13 (Sebastian: „ja top weiter“): Kurven-Vorhersage Gegner, Minimap-Kreuz, welten_test stabil. Sicherung v12_fertig in der Cloud.
- 12.10. v13 fertig. Agent A (Sonnet): Gierrate für Stellvertreter (vorhersage.js _gierSetzen, online.js übergibt z.k),
  Kurventest seitlich max 0,21→0,07 m, hinten 0,06→0,01 m; test_netz 59/59. Agent B (Sonnet): Minimap-Kreuz als Sprite über den
  Autopunkten (hud.js), welten_test Abschlepp-Prüfung lageunabhängig (Ursachen: Hindernisse hinter Reset-Punkt, Auto 3 schon
  liegengeblieben, Reset an gleicher Stelle) – 4 Läufe grün. Hinweis Agent B: Fantasie-KI schafft nach Reset bei 118 m den Looping
  bei 170 m aus dem Stand nicht immer (Driver setzt nochmal zurück) – nicht angefasst.
  Prüfung Hauptmodell: Diffs gelesen, Minimap-Bild angesehen, test_netz 59/59 + online_test 29/29 selbst gelaufen.
  Abgelegt als Autorennen-Versionen/v13_2026-10-12_kurven_minimap, NEUESTE-Starter → v13.
- 12.10. Sebastian: „Zaun ja; nee immer mit Kreuzung“ → v14 = sichtbarer Zaun an der Kreuzung; keine Fantasie-Variante ohne Kreuzung.
- 12.10. v14 fertig (Sonnet-Agent, geprüft): Zaun in den Kreuzungs-Zwickeln an der Bande (trackBuilder _kreuzungZaunOk), Physik
  unverändert, Stoß beim Abbiegen bei ~21,5 m. Bild k4_schraeg angesehen. Rest: Mündungen ohne Zaun (sonst Fahrbahn versperrt).
  Abgelegt als v14_2026-10-12_kreuzungszaun, NEUESTE → v14.
- 12.10. Neue Wünsche Sebastian: Polizei-Pause 4 s; Abschleppwagen-Reparatur je 10 % = 1 s, ab 30 % losfahren möglich (oder warten
  bis 40/50/…/100 %); Auswahl „viele“ / „sehr viele“ Hindernisse; Öl → leicht schleudern; Sand → abbremsen. → v15.
- 12.10. v15 Zwischenstand: Polizei stoppDauer 10→4 s (selbst, test_polizei angepasst, grün). Agent A (Sonnet) Abschlepp-Reparatur:
  0 % → je 1 s +10 % (Sprünge), Mensch ab 30 % mit Gas los, KI ab 60 %, sonst bis 100 %; HUD „🔧 Reparatur“, leises Pling;
  test_schaden 42→70, welten_test 188 OK (Abschlepp-Prüfung angepasst), menu 175. Agent C (Sonnet) Öl/Sand: Öl-Einfahrt →
  Drehimpuls (100 km/h ≈ 36°, Deckel 43°, deterministisch, Gegenlenken fängt ab), Sand vMax ×0,5, Rollw. 8, −20 % bei Einfahrt;
  KI-Festfahr-Erkennung ergänzt (driver.js); test_hindernisse 84→101, alle Node-Tests grün. Weiter: Agent B Hindernis-Menge.
- 12.10. Agent B (Sonnet) Hindernis-Menge: Einstellung hindernisMenge normal/viele/sehrViele (Menü Taste O, Lobby, Server-Prüfung),
  deterministisch; nach Prüfung durch Hauptmodell nachgebessert (zu wenig): jetzt ≈ ×3/×5 bzw. mind. 1 je 150/80 m, max +2 Wracks,
  Slalom-Paare, immer ≥ 4,5 m Spur frei; Draw-Calls Wiese max 77→87. Münzen nie mehr in Hindernissen.
- 12.10. Prüfung Hauptmodell v15: alle Node-Tests (ohne welten_ki) selbst grün, online_test 31/32 → Wiederholung 32/32 (Flake unter
  Last), menu_test 0 FEHL, Bilder Reparatur-HUD und Wiese „sehr viele“ angesehen. Abgelegt als v15_…_reparatur_oel_hindernisse,
  NEUESTE → v15. Offen: Fantasie/Dino bleiben wegen Sperrzonen unter Wunschmenge; Öl-Schleudern nur im Test gemessen, nicht gefahren.
