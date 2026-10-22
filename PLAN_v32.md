# PLAN v32 (22.10.2026) – Rückmeldung 19.10. (N1–N4) + v31b
Basis: v31b (v31 + Zoom-Sperre input.js). Sicherung vorher: tests/sicherung_v32_<agent>/.
- [x] N1 Auto fährt durch Abschleppwagen – offline + online reproduzieren, Kollision herstellen (Agent A, Opus)
- [x] N2 Lenkung im Gras nach Crash/Öl wirkt kaum – Mindest-Lenkwirkung sichern (Agent B, Opus)
- [x] N3 Garage sichtbarer (Knopf oben im Menü, 1280×800 im Bild) (Agent C, Sonnet)
- [x] N4 Entscheidung (Fable, nach Sebastians Aussagen „nochmal starten → Schaden weg“, „Auto hatte bei Start nicht 100 %“): JEDES Rennen startet mit 100 % Gesundheit; Garage-Upgrades bleiben dauerhaft (Agent C)
- [ ] Prüfplan v32: P0 Grundlinie, P1 Gegenlesen je Fix (anderer Agent), P2 Durchlauf-Matrix kurz, P3 Fix/Nachprüfen, P4 Sichern Mac+GitHub, Mini-Installer
Stand 22.10.: N1 (+ N1b Wrack), N2, N3, N4 gebaut. Prüfplan läuft:
- [x] P1 Gegenlesen aller Fixes (Opus, frisch, nur Node)
- [x] P2 alle Tests einzeln ohne Last: Node test_*.js + menu_test, garage_test, garage_knopf_test, rennen_test, oel_test, fahrbarkeit_test
- [x] P3 Fixes Funde + Nachprüfen  - [ ] P4 Sichern v32 Mac+GitHub, Mini
