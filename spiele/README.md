# Weitere Spiele: 4 gewinnt und Schach

Neu gebaut nach Standardregeln (die Original-Swift-Apps waren nicht lesbar), kindgerecht für 5–10 Jahre.
Vanilla JS, keine Bibliotheken, keine CDNs – läuft offline im Tailnet. Auslieferung durch denselben Node-Server wie das Autorennen.

## Aufrufen

| Was | Adresse |
|---|---|
| Startseite | `/spiele/` (aus dem Autorennen-Hauptmenü: Knopf „🎲 Weitere Spiele“ unter dem Titel) |
| 4 gewinnt | `/spiele/vier-gewinnt/` |
| Schach | `/spiele/schach/` |
| Raum-Link (Einladung) | `/spiele/schach/?raum=ABCD` bzw. `/spiele/vier-gewinnt/?raum=ABCD` |

Auf dem Mac mini (LaunchDaemon, intern Port 8444, außen Tailscale): `https://<name>.ts.net:10000/spiele/`.
Ein Neustart des Servers ist nach dem Einspielen der Dateien nötig (neue Server-Datei `server/brettspiele.js`, kleiner Hook in `server/server.js`).
Von `file://` (Doppelklick) gehen „zu zweit“ und „gegen Computer“ (4 gewinnt immer; Schach mit Rückfall ohne Web Worker), Online braucht den Server.

## Modi

- **Zu zweit** am selben Gerät (4 gewinnt: wie die Swift-App, ohne Rückgängig; Schach: Rückgängig + Brett drehen).
- **Gegen Computer**, 3 Stufen (😊 leicht, 🙂 mittel, 😎 schwer), Seite wählbar (Rot/Gelb bzw. Weiß/Schwarz/Zufall).
  - 4 gewinnt: **Swift-Port** (Regler 1–10 → Tiefe 2–9, Minimax mit Alpha-Beta 1:1 wie `VierGewinnt.swift`, kein Zufall). Details: `vier-gewinnt/PORTIERUNG.md`.
  - Schach: Alpha-Beta mit Zugsortierung, Ruhesuche, Material + Feldtabellen; Tiefe 1 mit Wackeln (+ 20 % Zufallszug) / 3 / bis 6 in ≈ 2,5 s. Das neue Schach (Swift-Port) nutzt stattdessen die portierte Swift-KI (Stufen 1–10) im **Web Worker** (`schach/kern/worker.js`); die Alpha-Beta-KI oben gehört zur Sicherung `_alt_standardregeln/`.
- **Online** mit Raumcode (siehe unten).

## Bedienung

- 4 gewinnt (Aussehen/Verhalten wie die Mac-App): Spalte antippen/klicken · Tasten **1–7** · **←/→** + **Enter/Leertaste/↓** · **N** neues Spiel · **M**/**Esc** Hauptmenü · **F** Vollbild (Knopf „⛶ Vollbild“). Alte Fassung mit Fall-Animation: `vier-gewinnt/_alt_standardregeln/`.
- Schach: Figur antippen → grüne Punkte (Schlagfelder als Ring) zeigen die erlaubten Felder → Zielfeld antippen. Letzter Zug gelb, König im Schach rot. Bauer am Ende: Auswahl Dame/Turm/Läufer/Springer (Tasten Q/R/B/N). Tastatur: Pfeile bewegen den gelben Rahmen, Enter/Leertaste wählt, **Z** Rückgängig.
- Regeln Schach: Rochade, en passant, Umwandlung, Schach/Matt/Patt, 50-Züge (automatisch bei 100 Halbzügen), dreifache Wiederholung (automatisch), unzureichendes Material (K–K, K+L–K, K+S–K, Läufer gleicher Feldfarbe). Schachuhr: nicht eingebaut (blieb „aus“).

## Online

1. Eine Person wählt ein Tier (Name – **kein Freitext**, Kinder-Sicherheit wie beim Autorennen), Seite, „Raum erstellen“ → großer **4-stelliger Code** (ohne 0/O/1/I), Link und **QR-Code** (`src/net/qr.js` wiederverwendet).
2. Die andere Person öffnet den Link oder tippt den Code → „Beitreten“. Wer nur schauen will: „👀 Zuschauen“ (max. 8, dürfen nicht ziehen).
3. Brett dreht sich für Schwarz. Der Server prüft Zugfolge und Legalität mit denselben Regeldateien (`gemeinsam/*.js`, UMD).
4. Ende: Tafel mit **Revanche** (beide tippen → neue Partie, Farben getauscht). „Aufgeben“ mit Rückfrage.
5. **Wiederverbinden**: Netz weg → Banner „Verbindung weg“, die Seite versucht es selbst weiter; Platz bleibt reserviert (Token im `sessionStorage`), auch nach „Seite neu laden“. Ein Raum ohne verbundene Leute verschwindet nach **10 Minuten** (`RAUM_MINUTEN`), unabhängig davon nach 3 h ohne Zug.
6. Limits: max. 40 Räume, 60 Verbindungen, Nachrichten ≤ 512 Byte, > 30/s ignoriert, > 300/s getrennt. Konsole zeigt nur Raumcodes. Der Server schreibt **keine Dateien**.

## Dateien

```
spiele/
  index.html                    Startseite (4 gewinnt · Schach · Autorennen)
  gemeinsam/
    konstanten.js               ALLE Farben (FARBEN) und Texte (TEXTE), Namensliste, Limits – hier an die Original-Apps angleichen
    stil.css                    gemeinsamer Stil (CSS-Variablen --c-… kommen aus FARBEN)
    rahmen.js                   Menü, Computer-Stufe, Online-Lobby, Spielfenster, Ende-Tafel (für beide Spiele)
    netz.js                     WebSocket-Client mit Wiederverbinden
    vier-regeln.js · vier-ki.js        4 gewinnt: Regeln, Computer   (UMD, auch im Server per require)
    schach-regeln.js · schach-ki.js    Schach: Regeln (Perft-geprüft), Computer
  vier-gewinnt/  index.html · vier-app.js/.css · ki-worker.js · PORTIERUNG.md   Swift-Port (Menü, Brett-Canvas, Online)
  schach/        index.html · schach-app.js/.css · schach-brett2d.js · schach-online.js · kern/ (Logik, Worker) · 3d/ (3D-Brett) · PORTIERUNG.md   Swift-Port (siehe dort)
                 _alt_standardregeln/   Sicherung der früheren Schach-Oberfläche
server/brettspiele.js           Räume, Zugprüfung, Revanche, Wiederverbinden, Aufräumen (/ws-brett)
```

## An die Original-Apps angleichen

- Farben: `gemeinsam/konstanten.js` → `FARBEN` (4 gewinnt: `vierRot`, `vierGelb`, `vierBrett`; Schach: `schachHell`, `schachDunkel`, …).
- Texte: dort `TEXTE` (Titel, Untertitel, Regeln, Meldungen).
- Schach (Swift-Port): Farben der 6 Brett-Themen in `schach/schach-brett2d.js` (`THEMEN`), Oberflächenfarben als CSS-Variablen oben in `schach/schach-app.css`, Texte direkt in `schach-app.js` (wie in der Swift-App). Die Schach-Teile in `gemeinsam/` (`schach-regeln.js`, `schach-ki.js`) nutzt nur noch der Server (Zugprüfung online) und die Sicherung `_alt_standardregeln/`.
- Computerstärke 4 gewinnt: Regler im Menü (Tiefe = Reglerwert 2…9, wie Swift); Schach: `maxTiefe`/`zeitMs` in `schach-ki.js`.

## Tests

```
node tests/test_brett_regeln.js      Perft Schach (Start 1–4 = 20/400/8902/197281, Kiwipete 1–3 = 48/2039/97862, + 3 weitere), Matt/Patt/Remis-Regeln, Rochade/e.p./Umwandlung, KI, 4-gewinnt-Gewinner
python3 tests/schach_port_ui_test.py  Schach-Oberfläche (Swift-Port): Menü, Computer, Akademie, Training, 3D/2D, Hunde, Kampf, Online mit 2 Browsern, Handy → tests/out/schach_port/
node tests/test_brett_netz.js        Server: HTTP, /ws-brett (Räume, illegale Züge, Matt/Gewinn, Revanche, Wiederverbinden, Zuschauer, Aufräumen, Limits)
python3 tests/brett_ui_test.py       Playwright: beide Spiele lokal/Computer/online (2 Browser), Handy-Größe → tests/out/brett/
```

## Schach: Swift-Port (Oberfläche)

Schach sieht und verhält sich wie die Mac-App des Vaters (Menü, Computer Stufe 1–10, Spieler vs Spieler, Schach-Akademie, Training mit Coach, 3D-Brett, Hunde-Team, Kampfszenen, Zugbewertung 1–15). Details, Mapping und Abweichungen: `schach/PORTIERUNG.md`.
- **Online** ist ein zusätzlicher Menüpunkt („Online spielen“). Protokoll und Server unverändert; der Server prüft Züge nach Standardregeln. **Coach, Tipp und Zugwert sind online aus** (Fairness), 3D/2D, Hunde und Kampf sind lokal wählbar.
- „Paw Patrol“ ist bewusst nicht dabei – es gibt das eigene Hunde-Team (Bruno, Luna, Brocken, Wurzel, Falko, Welpen).
- Tastenkürzel: siehe ☰-Menü im Spiel (N, Z, T, Umschalt+K, M, R, A, 3, K, D, 0, B, F).
- Die frühere Oberfläche liegt als Sicherung unter `schach/_alt_standardregeln/` (weiter erreichbar unter `/spiele/schach/_alt_standardregeln/`).
