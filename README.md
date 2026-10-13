# 🔥 Jonas Hot Steering Wheel – Autorennen

Browser-Rennspiel (Three.js, ohne Build-Schritt) mit Einzelspieler, Split-Screen und Online-Mehrspieler
(Node-Server + Tailscale Funnel).

## Starten
- **Allein / zu zweit:** `Autorennen starten.command` doppelklicken (öffnet `Autorennen.html` in Chrome).
- **Mehrspieler im Heimnetz:** `Mehrspieler starten.command`
- **Mehrspieler übers Internet:** `Mehrspieler im Internet starten.command` (Tailscale, Port 8443)

Der Server braucht Node.js ≥ 18. Die mitgelieferte Node-Datei `server/bin/node-macos-arm64` (122 MB) ist
**nicht** im Repository (GitHub-Grenze 100 MB). Nach einem frischen Klonen entweder `brew install node`
oder die Datei aus dem Spielordner auf dem Mac nach `server/bin/` kopieren.

## Versionen
Jede spielbare Version ist ein eigener Stand mit Markierung (`v1` … `v15`), z. B. zurück zu v11:
`git checkout v11`. Übersicht: `projekt/VERSIONEN_v*.md`, Verlauf: `VERLAUF.md`, `projekt/VERLAUF.md`.

## Tests
`for f in tests/test_*.js; do node "$f"; done` und die Python-/Playwright-Tests in `tests/*.py`.
