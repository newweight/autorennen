# Mehrspieler-Protokoll (W5, Version 2)

WebSocket unter **`/ws`** (gleiche Adresse wie das Spiel; `wss:` hinter HTTPS/Tailscale Funnel, `ws:` lokal).
Jede Nachricht ist **ein JSON-Objekt** mit dem Typ in `t`. Gemeinsame Konstanten/Helfer: `src/net/protokoll.js`
(`Rennspiel.Netz`, wird von Browser **und** Server geladen).

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
