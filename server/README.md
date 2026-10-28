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

### Radwelt für Freunde (R6 / v34)
- Derselbe Schalter öffnet auch den Radwelt-Mehrspieler (`/ws-rad`) für Freunde ohne Tailscale – **nur solange er an ist** (Server liest `status.json`; aus/fehlt/alt → `403`,
  beim Ausschalten werden Internet-Verbindungen getrennt). In der Radwelt-Lobby: „🌐 Freunde ohne Tailscale einladen“ (Link `…:10000/rad/Radwelt.html?raum=CODE` + QR).
- R6-2: Freunde brauchen den Link mit Einladungs-Schlüssel (`&k=…`), der Code allein reicht aus dem Internet nicht. Schalten nur von der Mac-mini-Seite (bzw. Autorennen-Menü),
  nicht aus der eigenen Radwelt (localhost:10100). Der Autostart-Server hört nur auf 127.0.0.1 (`--host 127.0.0.1`), also nur über Tailscale, nicht im LAN.
- Die Radwelt-Seite für Freunde ist eine eigene Kopie unter `<Spielordner>/rad` (legt `installieren.command` per `rad-kopieren.sh` an; Server-Option `--rad <Ordner>`).
- Prüfen am Mac mini: `curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:8444/rad/Radwelt.html` → `200`;
  `curl -s -o /dev/null -w "%{http_code}\n" -H "Tailscale-Funnel-Request: ?1" -H "X-Forwarded-For: 203.0.113.7" http://127.0.0.1:8444/api/rad/status` → `403`.

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

## Motorrad online (M4, 28.10.2026)

Das Motorrad-Spiel (`Motorrad.html`) spielt online über **denselben** Server wie das Autorennen (gleicher Port, gleicher `/ws`), aber in **eigenen Räumen** (Autos und Motorräder fahren nie zusammen) und **nur mit Schalter**.
Ohne Schalter ist der Server bitgleich wie vorher (Autorennen-Clients und -Räume unverändert, alter Client ↔ neuer Server geprüft). Nachrichten und Felder: `server/PROTOKOLL.md`, Abschnitt „Motorrad online (M4)“.

**Einschalten** (eine der drei Möglichkeiten):
- `node server/server.js --port 8444 … --motorrad` (z. B. als zusätzliches `<string>--motorrad</string>` im LaunchDaemon `de.newweight.autorennen`) · oder `MOTORRAD_ONLINE=1`
- oder ohne Neustart: leere Datei `<Spielordner>/motorrad.an` (auf dem Mini `/Users/autorennen/spiel/motorrad.an`; wirkt nach höchstens 2 s). Achtung: `installieren.command` ersetzt den Spielordner komplett → die Datei danach neu anlegen (oder das Argument im Daemon verwenden).
- Prüfen: `curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:8444/Motorrad.html` → `200` (Schalter an) bzw. `404` (aus). Das Terminal zeigt beim Start „Motorrad online: an“.
- Ausschalten: Datei löschen bzw. Argument entfernen. Laufende Rennen laufen zu Ende; neue Motorrad-Räume werden mit „nicht eingeschaltet“ abgelehnt.

**Wie Spieler hinkommen**
1. *Wie beim Autorennen:* `https://<Mini>.ts.net:10000/Motorrad.html` (der Spielserver liefert die Seite selbst aus, `src/moto/*` liegen schon unter `/src/`). Keine Einstellung nötig; der Einladungslink in der Lobby führt dorthin.
2. *Aus dem Spieleportal (Port 10002, `www/motorrad`):* Die Motorrad-Seite im Portal verbindet sich von selbst mit dem Spielserver am **selben Rechner auf Port 10000** (gleiches Protokoll wie die Seite, `https` → `wss`).
   Soll der Spielserver woanders liegen: in `Motorrad.html` vor den Skripten `window.MOTORRAD_SERVER = 'host.tailnet.ts.net:10000';` (oder `'wss://…'`) setzen – die Adresse kommt nie aus der Adresszeile (ein Link darf Kinder nicht auf einen fremden Server schicken).
   Im Menü: Modus-Schritt → Karte „🌐 Online“ (Taste **O**) → Raum erstellen / beitreten; „Dieser Server kann noch kein Motorrad online 😕“ heißt: Schalter aus oder alter Server.
3. Abschalten nur für die Seite: `window.MOTORRAD_ONLINE = false;` (dann wie M3: nur offline, keine Online-Karte).

**Stuntpunkte → Portal-Bestenliste (BESTEN_SPIELE)** – Code des Portals liegt nicht in diesem Repo. Der Browser meldet nach jedem Online-Rennen seine eigenen Stuntpunkte (der Server rechnet sie, der Spielserver spricht nie mit dem Portal):
`POST <MOTORRAD_PORTAL>/api/bestenliste` · Body `{"spiel":"motorrad","modus":"stunt-online"|"stuntrennen-online","name":"Jonas","punkte":1250}` (ganze Zahl, größer = besser, wie Snake/Tetris/Air-Hockey).
Im Portal-Server (`portal_server.py`) fehlt dafür **nur ein Eintrag** in `BESTEN_SPIELE`: `"motorrad": {"stunt-online", "stuntrennen-online"}` (Abfrage `GET /api/bestenliste?spiel=motorrad&modus=stunt-online` liefert dann die Top 10).
`MOTORRAD_PORTAL` leer = gleiche Adresse wie die Seite (richtig, wenn die Motorrad-Seite aus dem Portal kommt). Kommt die Seite vom Spielserver (Weg 1), liegt das Portal auf einer anderen Herkunft → dann `window.MOTORRAD_PORTAL = 'https://<Mini>.ts.net:10002'` setzen **und** das Portal muss CORS erlauben
(`Access-Control-Allow-Origin` + Antwort auf `OPTIONS`); einfacher: Weg 2 (Seite aus dem Portal). Ist das Portal noch nicht ergänzt (4xx) oder nicht erreichbar, schadet das nichts: Rennen und Ergebnis laufen normal, die Meldung wird bei 5xx/Netzfehler bis zu 20-mal im Browser vorgemerkt und später nachgeholt, bei 4xx verworfen.
Alternativ ruft `window.MOTORRAD_BESTENLISTE(eintrag)` das Portal auf eine andere Art (z. B. `postMessage`).

**Update auf dem Mini (ohne Installer, Node-Binary/`rad/` bleiben)** – vom Rechner mit dem Repo-Klon, nach `git pull` auf Zweig `motorrad`:
```
cd ~/Documents/Autorennen-Projekt/autorennen-git
rsync -a --exclude .git --exclude tests --exclude .claude --exclude 'server/bin' --exclude rad ./ MINI:/tmp/spiel-m4/
ssh MINI 'sudo rsync -a /tmp/spiel-m4/ /Users/autorennen/spiel/ && sudo touch /Users/autorennen/spiel/motorrad.an && sudo chown -R autorennen:staff /Users/autorennen/spiel && sudo launchctl kickstart -k system/de.newweight.autorennen'
```
(`MINI` = `100.104.29.100` bzw. der Tailnet-Name.) Tests: `node tests/test_moto_netz.js`, `python3 tests/moto_netz_browser.py`.

## Server-Statistik (v23, bei Ruckeln im Online-Rennen)
`node server/server.js --statistik 10` (oder Umgebungsvariable `STATISTIK=10`; im LaunchDaemon als zusätzliches Argument) schreibt alle 10 Sekunden je laufendem Rennraum eine Zeile
`STAT {…}` ins Protokoll (nur Zahlen, keine Namen): `tick` = Dauer eines Schleifendurchgangs in ms (p50/p99/max; Soll ≪ 16,7), `zustandAbstand` = Abstand der Zustands-Sendungen
(Soll 50 ms), `schleifenLag` = Abstand der Schleifenaufrufe (Soll ≈ 4 ms), je Mensch `leer` (Ticks ohne rechtzeitige Eingabe = Netz-Zittern des Spielers), `verworfen` (überholte Eingaben), `q` (Warteschlange).
Große `tick`/`schleifenLag`-Werte = Server überlastet; große `leer`-Zahlen = Zittern auf dem Weg Browser → Server (Tailscale, WLAN).
