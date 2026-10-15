# Mehrspieler-Server (Mac mini)

Der Server liefert das komplette Spiel per HTTP aus **und** rechnet die Online-Rennen (WebSocket `/ws`).
Gäste brauchen nur einen Browser (auch Handy/Tablet) – kein Tailscale, keine Installation.

## Starten

| Doppelklick | Was passiert |
|---|---|
| **`Mehrspieler starten.command`** | Server auf Port **8444**, öffnet `http://localhost:8444`. Zeigt den Funnel-Befehl und die öffentliche Adresse an (Funnel startet **nicht** automatisch → nur Heimnetz/dieser Mac). |
| **`Mehrspieler im Internet starten.command`** | wie oben **plus** Tailscale Funnel (`funnel --https=10000 http://127.0.0.1:8444`). Beim Beenden wird der Funnel wieder ausgeschaltet. |

Öffentliche Adresse: **https://mac-mini-von-sebastian.tail39c1c2.ts.net:10000/**
(die Skripte lesen den Namen aus `tailscale status`; Port 443 (NWES) und 8443 (anderes Projekt, seit 14.10.) sind auf dem Mac mini belegt → Tailscale-Port immer **10000**, Server intern **8444**).

Im Spiel: Menü → **🌐 Online** → *Raum erstellen* → Code, Link und QR-Code an die Gäste geben.
Link/QR zeigen automatisch die öffentliche Adresse, auch wenn du selbst über `localhost` spielst.

**Geister oder Rempeln:** In der Lobby stellt der Host in der Zeile „👻 Autos untereinander“ ein, ob die Autos durcheinander durchfahren
(👻 Geister, Standard) oder sich anstoßen (💥 Rempeln, Raum-Einstellung `kollisionen`). Rempeln rechnet der Server (Auto↔Auto, Rempeln „sanft“);
die Browser sagen den eigenen Wagen samt Stößen voraus (siehe `PROTOKOLL.md`), das fühlt sich nur bei Ping unter ca. 100 ms gut an
(Anzeige 🌐 im HUD). Der Server übernimmt nur ein echtes `true`.

Node.js: Ist `node` (ab Version 18) installiert, wird es genommen, sonst die mitgelieferte Datei
`server/bin/node-macos-arm64` (offizielles Node.js **v24.21.0 LTS** für Apple Silicon, signiert von
„Developer ID Application: Node.js Foundation (HX7739G8FX)“, SHA-256
`e4b5a3af0e05c75de2eae013904145f40fe7fc2a6e6f17510128bf45cca4e79b`, Lizenz: `server/bin/NODE-LICENSE.txt`).
Prüfen auf dem Mac: `codesign -dv --verbose=2 server/bin/node-macos-arm64` und
`shasum -a 256 server/bin/node-macos-arm64` (Vergleich mit https://nodejs.org/dist/v24.21.0/ → nur die Binärdatei
aus `node-v24.21.0-darwin-arm64.tar.gz`). Einzige Bibliothek: `ws` (liegt in `server/node_modules`, MIT).

## Von Hand (Terminal)

```bash
cd ~/Desktop/Spiele/Autorennen            # bzw. der Ordner der Version
./server/bin/node-macos-arm64 server/server.js --port 8444 --oeffentlich https://mac-mini-von-sebastian.tail39c1c2.ts.net:10000/
# zweites Terminal-Fenster:
/Applications/Tailscale.app/Contents/MacOS/Tailscale funnel --https=10000 http://127.0.0.1:8444
```
Optionen: `--port` (Standard 8444), `--host` (Standard 0.0.0.0), `--oeffentlich <https-Adresse>` (für Link/QR), `--steuerung <Ordner>` (Internet-Schalter, Standard aus).

## 🌐 Internet-Schalter im Spiel (v19)

Im Spiel (Menü 🌐 Online) erscheint für **jedes Gerät im eigenen Tailscale-Netz** die Zeile „🌐 Internet für Freunde: AN (noch 3:42 h) / AUS“ mit Knopf
(Taste **I**). AN = Tailscale Funnel für Freunde ohne Tailscale, geht nach 4 Stunden von selbst aus. Wer nicht über das Tailnet kommt (Freunde über Funnel,
Heimnetz/WLAN, `localhost`) sieht die Zeile nicht und kann nichts schalten.

**Sicherheitsdesign** (Details und Nachrichten: `PROTOKOLL.md`, Kopf von `server.js` und `autostart/internet-schalter.sh`):
- Der Spielserver (Benutzer „autorennen“, kein Admin) führt **nie** Befehle aus. Mit `--steuerung /Users/Shared/autorennen-steuerung` schreibt er nur
  `wunsch.json` und liest `status.json`. Ohne die Option ist alles aus (lokale Starts/Tests unverändert).
- Ein kleiner **root-Helfer** (`autostart/internet-schalter.sh`, LaunchDaemon `de.newweight.autorennen.schalter`, alle 5 s, installiert nach
  `/Library/PrivilegedHelperTools/de.newweight.autorennen.schalter`) liest die Wunsch-Datei streng (Eigentümer autorennen, ≤ 200 Byte, feste Form, nur `an`/`aus`,
  Zeit ±120 s, jeden Wunsch nur einmal, nie in Befehle eingesetzt), ruft Tailscale mit festen Argumenten auf, merkt sich das Auto-Aus (4 h) in
  `/var/db/autorennen-schalter` (root) und schreibt `status.json`. Der Ordner gehört root (755): autorennen darf nur den Inhalt von `wunsch.json` ändern – so kann
  er root keinen Link unterschieben.
- **Doppelklick-Dateien** „🌐 Internet-Zugang AN/AUS.command“ rufen denselben Helfer (`sudo … an|aus`) → gleiches Auto-Aus, kein Widerspruch. Ohne installierten Helfer (alte Installation) fallen sie auf das bisherige Verhalten zurück.

**Annahmen, die du auf dem Mac einmal prüfen solltest** (ich konnte hier kein Tailscale testen):
1. *Header:* Tailscale Serve setzt über das Tailnet `Tailscale-User-Login` (+ `-Name`) und entfernt gleichnamige Header des Clients; über Funnel kommen keine
   Identitäts-Header. Quelle: Tailscale-Dokumentation „Serve“ (Abschnitt Identity headers). `Tailscale-Funnel-Request: ?1` und `X-Forwarded-For` (Tailnet-IP bei Serve) sind
   nur aus der Praxis/Dokumentation Dritter bekannt – der Code fordert sie nicht, sondern lehnt nur ab, wenn sie „Funnel/öffentlich“ zeigen. Fehlen die Header
   auf dem Mac mini wider Erwarten, **erscheint der Schalter einfach nicht** (sicherer Ausfall). Prüfen: Spiel über die Tailnet-Adresse öffnen → 🌐 Online → Zeile da?
   Dann dieselbe Adresse über Handy-Mobilfunk **ohne** Tailscale (nur bei Funnel AN): Zeile darf nicht da sein.
2. *Origin:* Der Browser-Origin muss zu `Host`, `X-Forwarded-Host` oder `--oeffentlich` passen (der Installer setzt `--oeffentlich` auf die Tailnet-Adresse). Sonst kein Recht.
3. *root + Tailscale-CLI:* Die CLI der GUI-App (`/Applications/Tailscale.app/Contents/MacOS/Tailscale`) spricht mit dem lokalen Dienst; als root sollte das gehen.
   Der Installer prüft es (`sudo Tailscale status`). Geht es nicht: Fallback = Helfer als **LaunchAgent des Admin-Benutzers** (statt LaunchDaemon, gleiche Datei,
   `~/Library/LaunchAgents/…plist`, Steuerungs-Ordner dann dem Admin gehören lassen) – bei Bedarf an Claude melden.
4. Der Server hört weiter auf 0.0.0.0 (Heimnetz-Spiel). Lokale Prozesse auf dem Mac (nicht aus dem WLAN!) könnten Tailnet-Header fälschen – sie könnten
   dadurch nur den Funnel für ≤ 4 h an/aus wünschen, mehr nicht.

Notfall von Hand: `sudo /Library/PrivilegedHelperTools/de.newweight.autorennen.schalter aus` · Protokoll: `/var/log/autorennen-schalter.log` ·
Zustand: `cat /Users/Shared/autorennen-steuerung/status.json` · `…/Tailscale funnel status`.
Tests: `bash tests/test_schalter.sh` (Helfer gegen Stub-Tailscale, bösartige Dateien), `node tests/test_netz.js` (Block J), `python3 tests/schalter_ui_test.py` (Browser, Tailscale-Attrappe `tests/tailscale_proxy_stub.js`).

## Beenden

`Ctrl+C` im Terminal-Fenster oder das Fenster schließen. Funnel von Hand abschalten:
`/Applications/Tailscale.app/Contents/MacOS/Tailscale funnel --https=10000 off` ·
Kontrolle: `/Applications/Tailscale.app/Contents/MacOS/Tailscale funnel status`.
**Tunnel nur während des Spielens offen lassen.**

## Fallback ohne Tailscale: Cloudflare Quick Tunnel

```bash
brew install cloudflared                          # einmalig
cloudflared tunnel --url http://localhost:8444     # zeigt https://<zufall>.trycloudflare.com
```
Server dann mit `--oeffentlich https://<zufall>.trycloudflare.com/` starten (sonst zeigt die Lobby den
localhost-Link – Gäste können aber auch einfach die trycloudflare-Adresse öffnen und den Code eingeben).

## Sicherheit / Kinder

- Ausgeliefert werden nur `Autorennen.html`, `src/`, `vendor/` und `spiele/` (Brettspiele, eigener WebSocket `/ws-brett`, Code in `server/brettspiele.js`) – nicht `server/`, `tests/`, Dokumente,
  versteckte Dateien; kein Verzeichnis-Listing, `..` und `\` werden abgewiesen, nur GET/HEAD.
- Kein Chat, keine Freitexteingabe außer dem Raumcode; Namen nur aus der Fahrerliste; max. 6 Spieler je Raum.
- Raum verschwindet, sobald der Host geht (Gäste landen mit Hinweis im Online-Menü). Codes sind 4 Zeichen
  ohne 0/O/1/I (≈ 1 Mio. Möglichkeiten), höchstens 30 Räume gleichzeitig.
- Das Protokoll im Terminal enthält nur Uhrzeit, Raumcodes und Zahlen – keine Namen, IP-Adressen oder Eingaben.

## Probleme

- „Port 8444 ist schon belegt“ → läuft der Server schon in einem anderen Fenster? `lsof -nP -iTCP:8444 -sTCP:LISTEN`
- Gäste sehen „Keine Verbindung zum Server“ → Funnel läuft? (`funnel status`), Adresse mit `:10000`?
- Ruckeln beim Gast → Ping-Anzeige 🌐 im HUD oben links; über Mobilfunk sind 40–120 ms normal. Bei hohem Ping lieber 👻 Geister statt 💥 Rempeln.

Technik: `server/PROTOKOLL.md` (Nachrichten), `ERWEITERN.md` (Abschnitt Mehrspieler), Tests:
`node tests/test_netz.js`, `python3 tests/online_test.py`.

## Server-Statistik (v23, bei Ruckeln im Online-Rennen)
`node server/server.js --statistik 10` (oder Umgebungsvariable `STATISTIK=10`; im LaunchDaemon als zusätzliches Argument) schreibt alle 10 Sekunden je laufendem Rennraum eine Zeile
`STAT {…}` ins Protokoll (nur Zahlen, keine Namen): `tick` = Dauer eines Schleifendurchgangs in ms (p50/p99/max; Soll ≪ 16,7), `zustandAbstand` = Abstand der Zustands-Sendungen
(Soll 50 ms), `schleifenLag` = Abstand der Schleifenaufrufe (Soll ≈ 4 ms), je Mensch `leer` (Ticks ohne rechtzeitige Eingabe = Netz-Zittern des Spielers), `verworfen` (überholte Eingaben), `q` (Warteschlange).
Große `tick`/`schleifenLag`-Werte = Server überlastet; große `leer`-Zahlen = Zittern auf dem Weg Browser → Server (Tailscale, WLAN).
