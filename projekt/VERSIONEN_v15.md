# v15_2026-10-12_reparatur_oel_hindernisse
Basis v14 (unverändert daneben). Neu (Wünsche Sebastian):
- Polizei hält 4 s an (vorher 10 s).
- Abschleppen (nur mit Schaden an): danach Reparatur ab 0 %, je Sekunde +10 %; ab 30 % mit Gas losfahren, sonst bis 100 %.
  Computer-Autos fahren bei 60 % los. Abschaltbar: config.schaden.reparaturJe10 = 0.
- Öl: beim Hineinfahren leichtes Schleudern (100 km/h ≈ 36°, Gegenlenken fängt ab). Sand-Fleck bremst deutlich (100 → ~70 km/h).
- Menü „🚧 Hindernisse: Normal / Viele / Sehr viele“ (Taste O; ab Welt Hindernisse), auch online in der Lobby.
  Wiese 7/21/41, Wald 8/25/40, Wüste 6/24/48, Fantasie 2/9/13, Dino 8/25/35, Alpen 8/24/39.
Tests: alle Node-Tests grün, welten_ki (inkl. sehr viele) 268 OK, menu 0 FEHL, online 32/32, touch 76, welten 0 FEHL.
