# Übergabe 12.10.2026 – Jonas Hot Steering Wheel (Runde 6, Stand ~90 %)

## Wo liegt was
- Arbeitskopie in der Cloud-Sitzung: `/home/claude/Autorennen` (Sicherungen: `/home/claude/Autorennen-Sicherung/w4j_*, w5_vorher, w5a_nachher, w5t_*`)
- Mac Studio (iCloud, synchronisiert auf mini/Air): `~/Desktop/Spiele/Autorennen-Versionen/`
  - `v10_2026-10-12_alpen_kreuzung/`  – Alpen mit Überführung, Fantasie-Kreuzung (Fantasie ist jetzt eine Acht)
  - `v11_2026-10-12_online_touch/`     – + Online-Mehrspieler (Server, Lobby, QR, Geister-Modus) + Touch-Steuerung + Node mitgeliefert
  - `_pakete/` (tgz; v11 als `…_spiel.tgz` + Node in 2 Teilen `node_macos_arm64_v11.gz.teil00/01`)
  - `VERSIONEN_v10.md`, `VERSIONEN_v11.md`, Starter `🚗 Autorennen NEUESTE starten.command`
- Doku im Spielordner: `PLAN_RUNDE6.md` (Feinplan W5), `VERLAUF.md` (alle Agenten-Einträge bis „W5 Stufe 1 abgeschlossen"), `ANLEITUNG.md`, `ERWEITERN.md`, `server/README.md`, `server/PROTOKOLL.md`

## Was fertig ist (Runde 6)
W1–W4 komplett (v7–v10). W5 Stufe 1 (v11): `server/server.js` (Node + ws, Port 8443, autoritative Physik mit KI), `src/net/*` (client, vorhersage, qr, online), Menü-Karte „🌐 Online", `src/ui/touch.js`. Tests: test_netz 44/44, online_test 23/23, touch_test 76/76, menu_test 175, alle 24 Node-Tests grün.

## Vorab-Test Internet (bestanden)
- Tailscale-CLI auf dem mini nur unter `/Applications/Tailscale.app/Contents/MacOS/Tailscale`
- Port 443 ist durch NWES (`tailscale serve`) belegt → Funnel immer mit `--https=8443 8443`
- Öffentlich: `https://mac-mini-von-sebastian.tail39c1c2.ts.net:8443/` (Meldung „Available on the internet" kam)
- `node` ist auf dem mini NICHT installiert → `server/bin/node-macos-arm64` (v24 LTS, codesign: Node.js Foundation, geprüft, sha256 e4b5a3af…)

## OFFENES PROBLEM (hier weitermachen!)
`Mehrspieler im Internet starten.command` auf dem mini: Funnel startet, aber **der Server lief nicht** – Browser zeigt
`localhost:8443 → ERR_CONNECTION_REFUSED`, und die Zeile „🌐 Öffentliche Adresse" erschien nicht.
Vermutungen (in dieser Reihenfolge prüfen, im Ordner `v11_2026-10-12_online_touch`):
1. Server direkt starten und Fehler sehen:
   `cd ~/Desktop/Spiele/Autorennen-Versionen/v11_2026-10-12_online_touch && ./server/bin/node-macos-arm64 server/server.js --port 8443`
2. `server/node_modules/ws` fehlt/ist iCloud-Platzhalter (`ls server/node_modules/ws/`; ggf. im Finder anklicken zum Laden)
3. Gatekeeper blockt die Node-Datei (Meldung „kann nicht geöffnet werden") → `xattr -d com.apple.quarantine server/bin/node-macos-arm64`, oder `brew install node`
4. Das Skript wartet nur 10 s (curl-Schleife) – iCloud-Platzhalter beim ersten Start langsam → zweiter Start probieren
Danach: Online → Raum erstellen; Handy (WLAN aus) QR scannen; prüfen: Verbindung (🌐 Ping im HUD), Ruckeln, Touch-Gefühl, wss über Funnel.

## Danach (W5-4 / Stufe 2, noch offen)
- Echter Handy-Test über Mobilfunk; iOS-Safari (Neigung, Vollbild, Wake Lock) nur emuliert getestet
- Stufe 2: Rempeln online (Raum-Schalter `kollisionen: true` schon im Server, fehlt: andere Autos in der Vorhersage + Menü-Schalter), sinnvoll bei Ping < 100 ms
- Online nicht vorhergesagt: Looping/Rampen/Anlauf/Kleber (eigener Wagen folgt Server mit ~50 ms)
- Kleinigkeiten: Fantasie evtl. als Variante „klassisch (ohne Kreuzung)"; Minimap-Kreuz unter eigenem Auto; welten_test Abschlepp-Prüfung Wald flaky
- Nach erfolgreichem Handy-Test: VERLAUF.md ergänzen, v12 nur falls Code geändert wurde

## Arbeitsweise (Sebastians Vorgaben)
Deutsch; Fortschritt in % nach jedem Schritt; Opus/Sonnet-Agenten für Teilaufgaben, Fable prüft; jede Welle als eigene spielbare Version in `Autorennen-Versionen/vN_…` (neue Ordner, da iCloud-Platzhalter nicht überschreibbar sind; tgz immer mit neuem Namen); nie Bestehendes kaputtmachen; alles in VERLAUF.md mitschreiben; Handgriffe einzeln mit genauem Befehl.
