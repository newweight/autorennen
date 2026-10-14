# Mehrspieler-Protokoll (W5, Version 4)

WebSocket unter **`/ws`** (gleiche Adresse wie das Spiel; `wss:` hinter HTTPS/Tailscale Funnel, `ws:` lokal).
Jede Nachricht ist **ein JSON-Objekt** mit dem Typ in `t`. Gemeinsame Konstanten/Helfer: `src/net/protokoll.js`
(`Rennspiel.Netz`, wird von Browser **und** Server geladen).

**Version 4 (14.10., v21)** ist zu Version 3 rein *additiv* (Polizei online + Schild-Masten):
- `einstellungen.polizei` (bool, Standard false; Lobby-Zeile „Polizei“). Der Server simuliert dann autoritativ `R.Polizei` (gleiche Logik wie offline; Stopp 4 s, Passat-Streifenwagen neben dem Auto). Die Streifenwagen sind zusätzliche Einträge hinter den Teilnehmern.
- `zustand.po`: Streifenwagen, je ein Eintrag im Format von `a` (14 Zahlen). `zustand.pz`: Ziel (Auto-Nr.) je Streifenwagen. `zustand.ps`: `[[Auto-Nr., Rest-s]]` angehaltener Autos (Rest auf 2 Stellen). `a` enthält weiterhin nur die Teilnehmer.
- `ich.ps`: genauer Stopp-Rest (s) des eigenen Autos, solange > 0. Die Vorhersage ersetzt dann die Eingabe durch Halten (Gas 0, bremsen) und zählt den Rest pro Schritt herunter.
- Fehlen `po`/`pz`/`ps` (Server ohne Polizei oder Version 3), verhält sich der Browser wie vorher. Ein Version-3-Browser ignoriert die neuen Felder.
- Schild-Masten: Server und Browser bauen sie gleich (`Kurvenschilder.einbauen(strecke, tempoKlasse)`) als dünne Säulen (r 0,12 m) in `strecke.saeulen`; keine neuen Nachrichten. Ein Version-3-Browser hätte sie nicht (Vorhersage-Abweichung nur am Mast).
`hallo.v` meldet 4.

**Version 3 (14.10., v19)** ist zu Version 2 rein *additiv*: drei neue Nachrichten für den **Internet-Schalter** (s. u. „Internet-Schalter“). Ein Version-2-Server
antwortet auf `schalterFrage` mit `fehler`; darum fragt der Browser nur, wenn `hallo.v ≥ 3` ist. Ein Version-2-Browser kennt die Nachrichten nicht und ignoriert `schalter`.
`hallo.v` meldet 3.

**Version 2 (13.10., v16)** ist zu Version 1 rein *additiv*: im Zustand-Teil `ich` kommt das optionale Feld **`sz`** dazu (s. u.). Es gibt keine
Versionsprüfung – ein Version-1-Browser ignoriert `sz` und verhält sich wie vorher (`so` bleibt unverändert), ein Version-2-Browser an einem
Version-1-Server (kein `sz`, aber `so: 1`) lässt den Server in Sonderzuständen allein rechnen (= v15). `hallo.v` meldet 2.

Grenzen (Server): Nachricht ≤ 4 KB (sonst Trennung) · > 400 Nachrichten/s werden ignoriert, > 2000/s → Trennung ·
höchstens 80 Verbindungen, 30 Räume, **6 Menschen je Raum**, 12 Autos (Menschen + Computer) ·
Herzschlag: WebSocket-Ping alle 5 s, wer bis zum nächsten Ping nicht antwortet, wird getrennt.
Kinder-Sicherheit: es gibt **keine** Freitext-Felder – Fahrer nur aus `config.fahrer`, Autos nur aus dem Katalog,
Raumcode nur aus `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` (ohne 0/O/1/I). Kein Chat. Der Server protokolliert nur
Raumcodes und Zahlen (keine Namen, Adressen, Eingaben).

## Raum-Zustände

```
lobby ──start (Host, alle bereit)──▶ laden ──alle „geladen“ (spät. 20 s)──▶ rennen ──alle Menschen im Ziel
  ▲                                                                          │      (spät. 60 s nach dem 1.)
  └──────────────── zurLobby (Host) ◀──────────── ergebnis ◀────────────────┘
Host trennt/verlässt → Raum zu (alle Gäste: raumZu). Gast trennt im Rennen → sein Auto fährt als Computer weiter.
```

## Browser → Server

| t | Felder | Wann / Wirkung |
|---|---|---|
| `hallo` | `v` | nach dem Verbinden; Antwort `hallo` |
| `ping` | `z` (beliebige Zahl, kommt zurück) | 1×/s; Antwort `pong` → Ping-Anzeige 🌐 im HUD |
| `raumErstellen` | `fahrer`, `auto`, `hilfe`, `einstellungen` | neuer Raum, Absender = Host (ist immer „bereit“) |
| `raumBeitreten` | `code` (Groß/klein egal), `fahrer`, `auto`, `hilfe` | Fehler `unbekannt` / `voll` / `laeuft`; vergebener Fahrer → nächster freie |
| `verlassen` | – | Raum verlassen (Host → Raum zu); Antwort `verlassen` |
| `wahl` | `fahrer?`, `auto?`, `hilfe?` | nur Lobby/Ergebnis; Fahrer muss frei sein (`fahrerVergeben`) |
| `bereit` | `an` (bool) | Gast bereit/nicht bereit |
| `einstellungen` | `einstellungen` (Teilmenge, s. u.) | nur Host; Server prüft jeden Wert (unbekannt → Standard) |
| `start` | – | nur Host, alle Gäste bereit (`nichtBereit`) → `start` an alle |
| `geladen` | – | Browser hat die Szene gebaut; wenn alle da sind, läuft das Rennen (Countdown) |
| `eingabe` | `n` (Folge-Nr, +1 je Schritt), `g` 0..100, `b` 0..100, `l` −100..100, `i:1` Item, `r:1` Reset | 60×/s im Rennen; ältere/doppelte `n` werden verworfen |
| `zurLobby` | – | nur Host, im Zustand `ergebnis` |
| `schalterFrage` | – | (v3) Status des Internet-Schalters; Antwort immer `schalter` |
| `schalterUmschalten` | `an` (bool; nur ein echtes `true` = AN, alles andere = AUS) | (v3) Internet für Freunde an/aus wünschen; nur mit Recht, höchstens 1× je 5 s; Antwort `schalter` |

`einstellungen`: `streckeId`, `welt`, `variante`, `runden`, `gegner` (Computer, 0 … 12 − Menschen), `schwierigkeit`,
`tempoKlasse`, `jahreszeit` (auch `zufall`), `wetter` (auch `zufall`), `windStaerke`, `tageszeit`, `hindernisMenge`,
`kollisionen` (**Stufe 2**, Menü-Schalter „👻 Geister / 💥 Rempeln“ in der Lobby, nur Host; nur ein echtes `true` schaltet Rempeln
an, alles andere – auch `"true"`, `1`, `null` – bleibt/wird `false` = Geister). `raumErstellen` darf den zuletzt gewählten Wert gleich mitschicken.
`schaden` ist online immer `false`.
`hindernisMenge` (12.10., Lobby-Zeile „🚧 Hindernisse“, nur Host): `"normal"` (Standard) | `"viele"` (≈ ×3, mind. 1 je 150 m) | `"sehrViele"` (≈ ×5, mind. 1 je 80 m). Der Server lässt nur
diese drei Strings durch (alles andere – auch Zahl, `null`, Objekt, Groß-/Kleinschreibung falsch – wird `"normal"`), gibt den Wert in `lobby`/`start` zurück und
baut damit seine Strecke; die Browser bauen aus `start.einstellungen` dieselbe Strecke: die zusätzlichen Öl-/Sand-/Baustellen-/Ast-/Wrack-/Strohballen-Einträge
werden **deterministisch** erzeugt (Seed aus Strecke + Variante + Menge, ohne `Math.random`, `trackBuilder.js` `zusatzErzeugen`) – es wird nichts übertragen.
Wirkt nur in Welten mit Hindernis-Schichten (in „Klassisch“ ignoriert). `raumErstellen` darf den zuletzt gewählten Wert mitschicken.

Eingaben sind ganze Zahlen (`Netz.eingabeKodieren`), damit Server und Vorhersage im Browser **genau** mit
denselben Werten rechnen (`wert / 100`). Der Server verarbeitet je Tick (1/60 s) eine Eingabe je Spieler aus einer
Warteschlange (> 20 gepuffert → die ältesten werden verworfen, Item/Reset-Flanken bleiben erhalten); kommt
300 ms nichts (Tab im Hintergrund), rollt das Auto ohne Gas.

## Server → Browser

| t | Felder |
|---|---|
| `hallo` | `v` (Protokoll-Version), `id` (zufällige Verbindungs-ID) |
| `pong` | `z` (zurück), `k` (aktueller Tick) |
| `raum` | `code`, `du` (eigene ID), `host` (bool) |
| `lobby` | `code`, `zustand`, `du`, `spieler: [{ id, nr, fahrer, auto, hilfe, bereit, istHost }]`, `einstellungen`, `max` (6), `hinweis?`, `oeffentlich?` (Funnel-Adresse für Link/QR, wenn das Startskript sie kennt) |
| `raumZu` | `grund` (`host`, `fehler`) – zurück ins Online-Menü mit Hinweis |
| `start` | `du` (eigene Auto-Nummer), `einstellungen` (konkret: Wetter/Jahreszeit/Wind aufgelöst), `wetterSeed`, `teilnehmer: [{ nr, name, autoId, mensch, hilfe }]`, `countdown` (s) |
| `zustand` | 20×/s, s. u. |
| `ereignis` | `k` (Tick), `art`: `start` · `runde` (`nr`, `runde`, `zeit`) · `ziel` (`nr`, `platz`, `zeit`) · `meldung` (`text`, nur an den Betroffenen: Item, Anlauf, Falsch-herum …) · `reset` (`nr`) · `weg` (`nr`, `text`: Spieler hat das Rennen verlassen, Computer fährt weiter) |
| `ergebnis` | `runden`, `zeilen: [{ platz, nr, name, mensch, weg, autoId, zeit (null = unterwegs), beste, runden }]` |
| `fehler` | `grund` (`json`, `unbekannt`, `keinRaum`, `voll`, `laeuft`, `nurHost`, `nichtBereit`, `fahrerVergeben`, `ungueltig`, `intern`), `text` (für Kinder lesbar) |
| `verlassen` | Bestätigung |
| `schalter` | (v3) ohne Recht **immer genau** `{ t:'schalter', recht:false }` (auch wenn die Funktion ganz aus ist – verrät nichts). Mit Recht: `{ recht:true, funnel:'an'\|'aus'\|'unbekannt', rest: Sekunden bis Auto-Aus \| null, wartet: bool, fehler?: 'zuSchnell'\|'schreiben' }` |

### `zustand`

```
{ t:'zustand', k: Tick, rz: 'countdown'|'laeuft'|'fertig', cd: Countdown-Rest s, zt: Rennzeit s,
  a: [ je Auto: [x, z, y, richtung, tempo, lenkung, flags, nicken, neigung, runde, platz, naechsterCheckpoint,
                 fortschritt m, resetZaehler, (looping: [index, winkel, qEin])?] ],
  pu?: { k: '1010' Turbo-Kugeln da, f: '11' Ölfässer da, o: [[x, z, richtung, alter, besitzer]] Ölflecken,
         v: [je Auto [turbo s, vFaktor, bFaktor] | 0] },
  ich?: { nr, v: [x, z, y, heading, vLaengs, vQuer, lenkung, drehImpuls, neigung, nicken, _querBeschl, _ueberBeschl],
          ack: letzte verarbeitete Folge-Nr, idx, bi, bs (Bande-/Busch-Index), fk: [vMax-Faktor, Beschl.-Faktor],
          gs: Gas-Sperre (Fehlstart), so: Sonderzustand (Looping/Flug/Rampe/Anlauf/Kleber; v15: keine Vorhersage – ab v16 nur noch,
          wenn der Browser den Zustand nicht selbst mitrechnet, s. `sz`),
          sz?: Zustand der Sonderfälle für die Vorhersage (v16, fehlt = alles in Ruhe), je Teil ein Zahlen-Array, fehlt der Teil = Ruhe:
               k Kleber [zeit, klebt, frei, anzeige] · a Anlauf [stelle (Index in Anlauf.stellen, −1 keine), bremst 0/1, stehZeit] ·
               f Flug/Rampe [aktiv 0/1, rampe (Index in Schanzen.liste, −1), rampenH, vy, t, y, nicken, index] ·
               l Looping [aktiv 0/1, fallen 0/1, Looping-Index, winkel, winkelVorher, v, qEin, fallZeit],
          rh/fh: Reset-Hinweis/Falsch-herum, rs, rzn, bz, zz, zp: Rundenstart/-zeiten/Bestzeit/Zielzeit/-platz } }
```
`flags`: 1 bremst · 2 Turbo · 4 Schild · 8 hat Item · 16 im Ziel · 32 fliegt · 64 Schild platzt · 128 Mensch.
`ich` bekommt jeder nur für sein eigenes Auto (vollständiger Fahrzeugzustand für den Neuabgleich).
Schaden ist online aus, darum steht er nicht im Zustand.

## Netzcode im Browser (src/net/)

- **Eigener Wagen** (`vorhersage.js`): jeder Schritt wird lokal mit `vehicle.js` vorausgerechnet (Untergrund,
  Fahrhilfe, Turbo-/Boost-Faktoren vom Server, Wetter, Bande, Pflanzen, Höhe). Kommt `ich`, wird der Server-Zustand
  übernommen und alle Eingaben mit `n > ack` neu gerechnet; die Abweichung zur Anzeige klingt weich ab (~0,12 s),
  > 3 m → harter Sprung. **Sonderzustände (v16)**: Kleber, Anlauf-Bremse, Schanze/Flug und Looping (samt Fall-Animation) rechnet die
  Vorhersage mit demselben deterministischen Code wie der Server mit (`world/kleber.js`, `track/anlauf.js`, `track/schanze.js`,
  `track/looping.js`, Reihenfolge wie `main.js physikSchritt`). Dafür übernimmt jeder Abgleich den Zustand aus `ich.sz` und rechnet die
  unbestätigten Eingaben damit neu (Looping-Winkel wird wie die Position weich angeglichen). Nur was die Vorhersage nicht kennt (abgeschaltete Art
  – `opt.sonderVorhersage` – oder ein alter Server ohne `sz`) rechnet weiter allein der Server (`sonder`): die Anzeige folgt dem Puffer (50 ms
  Verzug, weicher Übergang) wie in v15.
- **Andere Autos**: Interpolation 100 ms hinter der geschätzten Server-Zeit (`client.js` Uhr aus den Ticks),
  nie über einen Reset hinweg (`resetZaehler`).
- **Stufe 1 (Geister)**: Auto↔Auto-Kollisionen sind im Server aus (`Kollisionen.autoAuto` liefert nichts, solange
  `sim.kollisionen` false ist); fremde Autos werden halbtransparent (0,6) gezeichnet.
- **Stufe 2 (Rempeln)**: Raum-Einstellung `kollisionen: true` – im Menü: Lobby-Zeile „👻 Autos untereinander“ (Host: 👻 Geister /
  💥 Rempeln, Gäste sehen den Wert), Hinweis „Rempeln (gut bei Ping unter 100 ms)“. Der Server schiebt die Autos auseinander
  (Rempeln `sanft`), die anderen Autos werden deckend gezeichnet. Die Vorhersage (`NetzVorhersage`, nur bei `kollisionen`) prüft
  den eigenen Wagen nach der Bande auch gegen **Stellvertreter** der anderen Autos (eigene `R.Vehicle` je Gegner, Fahrwerte aus dem
  Katalog per `autoId` aus `start.teilnehmer`): beim Abgleich auf die Pose aus `zustand.a` desselben Ticks gesetzt (Folge-Nr = `ack`),
  dann je Folge-Nr um 1/60 s entlang ihrer Welt-Geschwindigkeit vorgerückt (nach einem Stoß mit dem veränderten Tempo), das Replay im
  Abgleich macht es für jede nachgerechnete Eingabe genauso. Die Stellvertreter gehören nur der Vorhersage – die Anzeige der anderen
  Autos kommt weiter aus dem `NetzPuffer`. Ohne `kollisionen` rechnet die Vorhersage exakt wie vorher. Grenzen: Die anderen fahren
  in der Vorhersage geradeaus (Lenken/Gasgeben in den letzten ~100 ms kennt sie nicht), mehr als 90 Schritte (1,5 s) Abstand zum
  letzten Zustand → keine Stöße mehr in der Vorhersage; die gezeichneten anderen Autos sind ~100 ms + Ping/2 „hinter" dem eigenen
  (vorhergesagten) Wagen, der Stoß sieht deshalb leicht versetzt aus. Sinnvoll bei Ping < 100 ms.

## Internet-Schalter (v3, 14.10.)

„🌐 Internet für Freunde“ (Tailscale Funnel) lässt sich im Spiel (🌐 Online, Startansicht) an/aus schalten – **nur von Geräten im eigenen Tailnet**.
Der Spielserver führt dafür **nie** einen Befehl aus. Er läuft nur mit `--steuerung <Ordner>` (ohne = Funktion aus, jede Anfrage → `recht:false`):

```
Browser ──schalterUmschalten──▶ Spielserver (Benutzer „autorennen“) ──schreibt──▶ <Ordner>/wunsch.json {"funnel":"an"|"aus","seit":<ms>}
                                                                                       │ (alle 5 s, streng geprüft)
Browser ◀──schalter (Status)── Spielserver ◀──liest── <Ordner>/status.json ◀── root-Helfer internet-schalter.sh ──▶ Tailscale-CLI
                                                    {"funnel":"an"|"aus","bis":<ms>|null,"zeit":<ms>}
```

**Recht** (einmal beim WebSocket-Upgrade entschieden, `schalterRecht()` in `server.js`): Quelladresse 127.0.0.1/::1 (= Tailscale-Proxy) **und** Header
`Tailscale-User-Login` genau einmal und unauffällig **und** kein `Tailscale-Funnel-Request` **und** (falls `X-Forwarded-For` da) nur Tailscale-Adressen
(100.64.0.0/10, fd7a:115c:a1e0::/48) **und** (falls `Origin` da, Browser senden ihn immer) Origin = `Host` / `X-Forwarded-Host` / `--oeffentlich`
(Schutz gegen fremde Webseiten, die im Browser eines Tailnet-Geräts eine Verbindung öffnen). Tagged Devices bekommen von Tailscale keinen Login-Header → kein Recht.
Die Identität wird weder gespeichert noch protokolliert.

**Wunsch-Datei** immer exakt `{"funnel":"an","seit":1760000000000}` (kein Leerzeichen, `seit` = Server-Zeit in ms); der Helfer nimmt nur diese Form.
**Status** gilt nur, wenn `zeit` höchstens 30 s alt ist (der Helfer schreibt alle ~5 s), sonst `funnel:'unbekannt'` (Helfer läuft nicht) → Browser zeigt keinen Knopf.
`wartet:true` = Wunsch ist raus, Helfer hat den Status noch nicht angepasst (bis 20 s). Rate-Limit: 1 Umschaltung je 5 s für alle Verbindungen zusammen
(`fehler:'zuSchnell'`); `fehler:'schreiben'` = Wunsch-Datei nicht beschreibbar.
Browser: Zeile erscheint nur bei `recht:true`; Einschalten verlangt einen zweiten Tipp (5 s, „Sicher? …“), Ausschalten sofort; Taste **I**.

---

# Brettspiele: WebSocket `/ws-brett` (4 gewinnt, Schach)

Eigener Pfad (`wss:` hinter HTTPS), eigenes Protokoll – das Autorennen-Protokoll `/ws` bleibt unverändert. Code: `server/brettspiele.js`,
Regeln: `spiele/gemeinsam/{vier,schach}-regeln.js` (UMD, im Browser und per `require`). JSON-Text, Nachricht ≤ 512 Byte, `t` = Typ.
Nur Zahlen/feste Wörter: kein Chat, kein Freitext (Name = Eintrag aus `NAMEN` in `spiele/gemeinsam/konstanten.js`). Plätze: `w` = Weiß bzw. Rot (beginnt), `b` = Schwarz bzw. Gelb; `z` = Zuschauer.

**Client → Server**

| `t` | Felder | Wirkung |
|---|---|---|
| `hallo` | – | → `hallo` `{ v, spiele }` |
| `ping` | `z` | → `pong` `{ z }` |
| `raumErstellen` | `spiel` (`vier`\|`schach`), `name` (Tier-Id), `farbe` (`w`\|`b`, sonst Zufall) | → `raum` + `stand` |
| `raumBeitreten` | `code`, `spiel`, `name`, `zuschauer` (bool) | → `raum` + `stand` an alle; Fehler `unbekannt` / `voll` / `anderesSpiel` |
| `wiederverbinden` | `code`, `token` | → `raum` `{ wieder:true }` + `stand`, sonst `wiederNein` |
| `zug` | Schach: `z` = `"e2e4"` / `"e7e8q"`; 4 gewinnt: `z` = Spalte 0–6 | prüft Platz, Reihenfolge, Legalität → `stand` an alle, sonst `fehler` (`nichtDran`, `unlegal`, `zuschauer`, `nichtAktiv`) |
| `aufgeben` | – | Gegner gewinnt (`ergebnis.art = 'aufgegeben'`) |
| `revanche` | `an` (bool, Standard true) | wollen beide → neue Partie, Farben getauscht (`raum` `{ neu:true }`, dann `stand`) |
| `verlassen` | – | Spieler: Raum wird geschlossen (andere bekommen `raumZu`); Zuschauer: nur er geht |

**Server → Client**: `raum` `{ code, rolle, token, spiel }` (Token für Wiederverbinden, nur Spielern), `stand`, `fehler` `{ grund, text }`, `raumZu` `{ grund }`, `wiederNein`, `verlassen`, `pong`.

`stand` (vollständig bei jeder Änderung): `{ spiel, code, du:{ rolle, name }, spieler:[Weiß/Rot, Schwarz/Gelb] (je `{ farbe, name, online }` oder `null`), zuschauer (Anzahl), zustand: 'warten'|'spiel'|'ende',
am: 'w'|'b', zuege: [...] (Schach: Text-Züge; 4 gewinnt: Spalten), ergebnis?: { art, sieger: 'w'|'b'|null, reihe? }, schach?: bool, revanche:{ w, b }, runde }`.
`ergebnis.art`: Schach `matt`, `patt`, `fuenfzig`, `wiederholung`, `material`, `aufgegeben`; 4 gewinnt `reihe` (mit `reihe` = Feld-Indizes zeile*7+spalte), `voll`, `aufgegeben`.

**Wiederverbinden**: Verliert ein Spieler die Verbindung, behält er seinen Platz (`online:false` im `stand`). Mit `wiederverbinden` + Token kommt er zurück (die Seite merkt sich `code`/`token` im `sessionStorage`, auch über „Neu laden“). Ein Raum ohne verbundene Leute wird nach 10 Minuten gelöscht, ein Raum ohne Nachricht nach 3 h.
**Limits**: 40 Räume, 60 Verbindungen, > 30 Nachrichten/s ignoriert, > 300/s getrennt, max. 8 Zuschauer, Nachrichten > 512 Byte trennen (Code 1009). Der Server schreibt keine Dateien, die Konsole nennt nur Raumcodes.
