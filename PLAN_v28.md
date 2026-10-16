# Plan v28 (16.10.2026) – Wünsche nach dem Spielen von v27. Basis v27. Nix verschlimmbessern: Sicherung je Datei, Tests vorher/nachher, Gegenlesen vor Übernahme.

W1 Menü: Geisterfahrer / Abschleppwagen / Polizei / Krankenwagen je einzeln An/Aus (statt „Verkehr aus/wenig/viel“ für Kranken+Abschlepp zusammen). Alte Einstellung bleibt lesbar (Migration: wenig/viel → beide an). Offline + Online-Lobby + Server.
W2 Bug: Krankenwagen verschwindet mitten im Überholvorgang (verkehr.js _verschwinden: Kamera-Abstand 25/30 m zu knapp, „steckt“-Zähler löst beim Überholen aus?). Reproduzieren, dann: nie verschwinden, solange ein Teilnehmer ≤ 120 m hinter/neben ihm ist; Steck-Erkennung nicht bei langsamem Verkehr auslösen.
W3 Geisterfahrer: selten – höchstens 2 je Runde (zufällig 0–2), keine HUD-Vorwarnung, keine Minimap-Blinkerei. Config-Schalter für Warnung (Standard aus).
W4 Reifen sehen manchmal seltsam aus (Nachbarauto beim Start/Losfahren, nahe Garage/Werkstatt verzerrt): Ursache finden (Verdacht: gelaendePose Querneigung/Nicken aus 4 Ecken auf Werkstatt-Keil/Startaufstellung → Rad-Skalierung/Scherung? oder Radrotation mit falschem dt beim Start, oder abseitsGewicht-Blend). Reproduzieren per Screenshot (Startaufstellung, Werkstatt-Zufahrt), fixen.
W5 Mehrspieler: Autos fuhren durch andere Autos. Prüfen: (a) Standard der Lobby-Option „Autos untereinander“ steht auf „Geister“ → Standard auf „Rempeln“ (bei Ping ≤ 100 ms) setzen und Text klarer; (b) im Rempeln-Modus online wirklich Kollisionen (Test mit 2 Clients: Auto vor Auto → kein Durchfahren); (c) Verkehrswagen ↔ Teilnehmer online.
W6 Strohballen: vordere Begrenzung fehlt (Ballen rollen von vorn ohne sichtbare Begrenzung/Zaun bzw. Kollider vorn fehlt?). Erst reproduzieren (Screenshot Strohballen-Stelle, welche Strecke/Welt), Ursache klären: fehlt der Zaun/Begrenzung optisch oder physikalisch (Auto fährt vorn durch)?

Ablauf: A) Agent Menü+Verkehr (W1,W2,W3) · B) Agent Optik (W4,W6) · C) Agent Online-Kollision (W5) → Gegenlesen (Opus) → Tests → sichern v28 (Mac + GitHub) → Installer-Befehl.
Status: [ ] W1 [ ] W2 [ ] W3 [ ] W4 [ ] W5 [ ] W6 [x] Gegenlesen [x] gesichert v28a

Nachträge (16.10. nachmittags, Sebastian):
W7 Start/Ziel-Schild: Aufschrift „START · ZIEL“ (bisher nur Karo?), bei jeder Strecke.
W8 Feuerwerk an Start/Ziel, wenn der Spieler als Erster ins Ziel kommt (offline + online, auch Zweispieler je Sieger).
W9 Tribüne an Start/Ziel auf JEDER Strecke (bisher nur Wiese/Wüste/Fantasie), Wald/Dino/Alpen/Mega ergänzen.
W10 Tiere queren die Straße, je nach Strecke: Wiese Kühe, Wald Rehe, Alpen Bären, Dino Dinos (Wüste/Fantasie: Kamel/Einhorn?) – gelegentlich, auch schräg (nicht nur quer), Kollision = kleiner Rempler/Bremsen, kindgerecht, deterministisch (online Server).
Reihenfolge: erst A/B/C abschließen + Gegenlesen + sichern v28a, dann W7–W10 als v28b.
Status: [x] W1 [x] W2 [x] W3 [x] W4 (Räder versanken 5–9 cm in sichtbaren Flächen → radBodenPose) [x] W5 [x] W6 [x] Gegenlesen [x] gesichert v28a · [ ] W7 [ ] W8 [ ] W9 [ ] W10
