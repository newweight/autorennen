# Mehrspieler-Server (Mac mini)

Der Server liefert das komplette Spiel per HTTP aus **und** rechnet die Online-Rennen (WebSocket `/ws`).
Gäste brauchen nur einen Browser (auch Handy/Tablet) – kein Tailscale, keine Installation.

## Starten

| Doppelklick | Was passiert |
|---|---|
| **`Mehrspieler starten.command`** | Server auf Port **8443**, öffnet `http://localhost:8443`. Zeigt den Funnel-Befehl und die öffentliche Adresse an (Funnel startet **nicht** automatisch → nur Heimnetz/dieser Mac). |
| **`Mehrspieler im Internet starten.command`** | wie oben **plus** Tailscale Funnel (`funnel --https=8443 8443`). Beim Beenden wird der Funnel wieder ausgeschaltet. |

Öffentliche Adresse: **https://mac-mini-von-sebastian.tail39c1c2.ts.net:8443/**
(die Skripte lesen den Namen aus `tailscale status`; Port 443 ist auf dem Mac mini schon belegt → immer **8443**).

Im Spiel: Menü → **🌐 Online** → *Raum erstellen* → Code, Link und QR-Code an die Gäste geben.
Link/QR zeigen automatisch die öffentliche Adresse, auch wenn du selbst über `localhost` spielst.

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
./server/bin/node-macos-arm64 server/server.js --port 8443 --oeffentlich https://mac-mini-von-sebastian.tail39c1c2.ts.net:8443/
# zweites Terminal-Fenster:
/Applications/Tailscale.app/Contents/MacOS/Tailscale funnel --https=8443 8443
```
Optionen: `--port` (Standard 8443), `--host` (Standard 0.0.0.0), `--oeffentlich <https-Adresse>` (für Link/QR).

## Beenden

`Ctrl+C` im Terminal-Fenster oder das Fenster schließen. Funnel von Hand abschalten:
`/Applications/Tailscale.app/Contents/MacOS/Tailscale funnel --https=8443 off` ·
Kontrolle: `/Applications/Tailscale.app/Contents/MacOS/Tailscale funnel status`.
**Tunnel nur während des Spielens offen lassen.**

## Fallback ohne Tailscale: Cloudflare Quick Tunnel

```bash
brew install cloudflared                          # einmalig
cloudflared tunnel --url http://localhost:8443     # zeigt https://<zufall>.trycloudflare.com
```
Server dann mit `--oeffentlich https://<zufall>.trycloudflare.com/` starten (sonst zeigt die Lobby den
localhost-Link – Gäste können aber auch einfach die trycloudflare-Adresse öffnen und den Code eingeben).

## Sicherheit / Kinder

- Ausgeliefert werden nur `Autorennen.html`, `src/` und `vendor/` – nicht `server/`, `tests/`, Dokumente,
  versteckte Dateien; kein Verzeichnis-Listing, `..` und `\` werden abgewiesen, nur GET/HEAD.
- Kein Chat, keine Freitexteingabe außer dem Raumcode; Namen nur aus der Fahrerliste; max. 6 Spieler je Raum.
- Raum verschwindet, sobald der Host geht (Gäste landen mit Hinweis im Online-Menü). Codes sind 4 Zeichen
  ohne 0/O/1/I (≈ 1 Mio. Möglichkeiten), höchstens 30 Räume gleichzeitig.
- Das Protokoll im Terminal enthält nur Uhrzeit, Raumcodes und Zahlen – keine Namen, IP-Adressen oder Eingaben.

## Probleme

- „Port 8443 ist schon belegt“ → läuft der Server schon in einem anderen Fenster? `lsof -nP -iTCP:8443 -sTCP:LISTEN`
- Gäste sehen „Keine Verbindung zum Server“ → Funnel läuft? (`funnel status`), Adresse mit `:8443`?
- Ruckeln beim Gast → Ping-Anzeige 🌐 im HUD oben links; über Mobilfunk sind 40–120 ms normal.

Technik: `server/PROTOKOLL.md` (Nachrichten), `ERWEITERN.md` (Abschnitt Mehrspieler), Tests:
`node tests/test_netz.js`, `python3 tests/online_test.py`.
