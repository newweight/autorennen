# Mehrspieler-Protokoll (W5, Version 4)

WebSocket unter **`/ws`** (gleiche Adresse wie das Spiel; `wss:` hinter HTTPS/Tailscale Funnel, `ws:` lokal).
Jede Nachricht ist **ein JSON-Objekt** mit dem Typ in `t`. Gemeinsame Konstanten/Helfer: `src/net/protokoll.js`
(`Rennspiel.Netz`, wird von Browser **und** Server geladen).

**Nachtrag 15.10. (v23) – Online-Ruckeln (Protokoll-Version bleibt 4, Nachrichten und Felder UNVERÄNDERT, nur Verhalten):**
- **Eingabe nach Index (Server):** Der Server rechnet jedes Auto jeden Tick genau einen Schritt. `ack` in `ich` heißt jetzt „dieser Zustand enthält alle Eingaben bis `ack`“ –
  auch wenn die Eingabe `ack` nicht rechtzeitig da war: dann hat der Server mit der letzten Eingabe weitergerechnet und `ack` trotzdem um 1 erhöht; kommt die Eingabe
  später, ist sie überholt und wird verworfen (Item/Reset/Freikaufen-Bits bleiben erhalten). v22b ließ `ack` bei leerem Tick stehen → die Vorhersage im Browser (Zustand + Replay
  ab `ack`) sprang je leerem Tick um einen Schritt vorwärts, das spätere Kürzen der Warteschlange sprang zurück. Die Tiefe der vorab bereitliegenden Eingaben (Ziel 2 … 8)
  passt sich an das Zittern an (≥ 2 leere Ticks in 0,5 s → +1, 10 s ruhig → −1). Ältere Browser sind kompatibel (sie senden dieselben Nachrichten und rechnen ab `ack` nach).
- **Browser:** je Physikschritt genau ein `eingabe`-Schritt (nur zum Aufholen nach verworfener Zeit mehr), die Anzeige der anderen Autos läuft in gleichmäßigem Anzeige-Tick mit
  adaptivem Verzug (≥ 100 ms) und begrenzter Extrapolation; verdecktes Fenster: neutrale Eingaben aus einem Worker-Takt (`src/net/online.js` `_hintergrundTakt`).
- **Server-Statistik:** `node server/server.js --statistik 10` (oder `STATISTIK=10`) schreibt alle 10 s je Rennraum eine Zeile `STAT {…}` (Tick-Dauer, Abstand der Zustände, Schleifen-Verspätung,
  je Mensch leere Ticks/verworfene Eingaben/Warteschlange) – nur Zahlen. `--eingabe-alt` schaltet für Vergleichsmessungen die v22b-Warteschlange ein.

**Nachtrag 14.10. (v22) – Polizei freikaufen (additiv, Protokoll-Version bleibt 4):**
- `geladen` darf `k` mitschicken: Münzen-Guthaben des Fahrers (Garage-Konto) als ganze Zahl; der Server klemmt auf 0 … 99999, alles andere (fehlt, negativ, Text, Kommazahl) zählt als 0.
- `eingabe` darf `f: 1` mitschicken (Flanke wie `i`/`r`, nur die Zahl 1 gilt): „Polizei freikaufen“ (Doppeltipp Rückwärts am Gerät des Spielers). Der Server prüft **autoritativ**: nur wenn der Spieler gerade von der Polizei angehalten ist und das Rennen läuft, und das gemeldete Guthaben ≥ `config.polizei.freikaufKosten` (10) reicht; dann zieht er 10 vom Guthaben ab und beendet den Stopp im nächsten Tick (ohne „Weiterfahren!“-Meldung).
- `eingabe` darf `d: 1` mitschicken (Flanke, nur die Zahl 1 gilt; v24, additiv, `Netz.VERSION` bleibt 4): „Dach auf/zu“ (↑+↓ im Stand). Der Server prüft autoritativ (`R.DachRegel`, `src/cars/dachregel.js`): nur offenes/zu T-Roc Cabrio, im Stand (< 0,5 m/s), nicht während des Klappens. Klappen dauert `config.dachRegen.dauer` (3 s), solange sind Gas/Lenkung gesperrt. Bei Nässe + offenem Dach −10 % alle 60 s (Schadensystem bzw. eigener Wert).
- `zustand.dz = [[Nr, ziel, rest], …]` (ziel 0 offen / 1 zu, rest = Klapp-Restzeit in s) für alle Cabrios; `ich.dz = [ziel, rest, nass, uhr, gesund]` fürs eigene Auto; `ich.fk` enthält die Nässe-Faktoren (Vorhersage = Server, kein Ruckeln durch die Gassperre). Alte Clients ignorieren die Felder.
- Antworten nur an den Betroffenen: `ereignis {art:'freikauf', kosten, konto}` (der Browser bucht `kosten` vom lokalen Garage-Konto ab) und `ereignis {art:'meldung', text:'💰 −10 – weiter!'}`; bei zu wenig Guthaben `meldung 'Zu wenig Münzen (10 nötig)'` (Stopp läuft weiter, nichts abgezogen).
- Ein älterer Server ignoriert `k`/`f`, ein älterer Browser kennt `freikauf` nicht (unbekannte `ereignis`-Arten werden ignoriert).
- Zweite Schild-Kugel (`pickups`-Ereignis `schildPlus`): Der Server rechnet sie wie offline (Schild bleibt, Kugel weg, Meldung „🛡️ Schild bleibt“); Gesundheit +10 % gibt es nur, wo Schaden an ist – online ist Schaden aus.

**Nachtrag 15.10. (v25) – Verkehr: Geisterfahrer, Krankenwagen, Abschleppwagen (additiv, Protokoll-Version bleibt 4):**
- `einstellungen.geisterfahrer` (bool, Standard false; nur ein echtes `true` zählt) sowie (v28, additiv) `einstellungen.krankenwagen` und `einstellungen.abschleppwagen` (je bool, Standard false; nur ein echtes `true` zählt; an = genau 1 Wagen); Lobby-Zeilen „Geisterfahrer“, „Krankenwagen“, „Abschleppwagen“. Das alte `einstellungen.verkehr` (`'aus'` | `'wenig'` | `'viel'`) wird weiter akzeptiert: fehlen `krankenwagen`/`abschleppwagen`, schaltet `wenig`/`viel` beide an (Migration; Unbekanntes → aus); explizite Felder gewinnen. Der Server meldet `verkehr` nur noch abgeleitet (`'wenig'`, wenn einer an ist, sonst `'aus'`). Alte Clients ohne die Felder → aus.
- (v29, additiv) `einstellungen.nurRennautos` (bool, Standard false; nur ein echtes `true` zählt) und Strecke `formel1`: an = alle KI-Gegner fahren den Formel-Renner, je eine eigene Team-Farbe (`teilnehmer[].optionen.farbe`, Server wählt deterministisch nach Seed); Menschen behalten ihr gewähltes Auto. Lobby-Zeile/Pille „Nur Rennautos“. Alte Clients ohne Feld → aus.
- Der Server simuliert autoritativ `R.Verkehr` (`src/world/verkehr.js`, dieselbe Logik wie offline): Wagen = Einträge HINTER Teilnehmern und Polizei in `sim.fahrzeuge` (Reihenfolge: 3 Geister-Routen, dann Krankenwagen (0/1), dann Abschleppwagen (0/1)). v28: von den 3 Geisterfahrer-Einträgen sind je Runde nur 0–2 aktiv (Seed + Runde, nie zwei näher als 400 m), `zustand.vk` bleibt unverändert (geparkte Einträge = Flag 0). Sie zählen nicht im Rennen/Ergebnis.
- `zustand.vk`: je Verkehrswagen ein Eintrag im Format von `a` (14 Zahlen: x, z, y, richtung, tempo, lenkung, flags, nicken, neigung, 0, 0, 0, 0, resetZähler). `flags`: 1 bremst · **2 aktiv** (ohne Bit 2 ist der Wagen „geparkt“: unsichtbar, kein Ton) · 4 Lichthupe. Fehlt `vk` (Server ohne Verkehr), verhält sich der Browser wie vorher; ein Browser ohne Verkehr ignoriert das Feld. Der Browser rechnet nichts: gleiche Routen/Wagen werden mit `Verkehr.einsetzen` (nur Anzeige, `nurAnzeige`) angelegt, die Posen kommen über `NetzAnzeige.pose(k, v, 'vk')`; beim Auftauchen (Flag 2 neu oder anderer resetZähler) wird nicht aus dem Nichts interpoliert.
- Kollisionen: Im Geister-Modus (Stufe 1, `kollisionen` aus) bleiben Auto↔Auto-Stöße zwischen Teilnehmern aus; nur Stöße **Teilnehmer ↔ Verkehrswagen** wirken (`Kollisionen.autoAuto(…, { paarNur })`). Verkehrswagen stoßen nie untereinander. Schaden ist online aus (der Krankenwagen-Faktor 3 wirkt nur offline mit Schaden).

**Nachtrag 16.10. (v28 W10) – Tiere queren die Straße (additiv, Protokoll-Version bleibt 4):**
- `einstellungen.tiere` (bool; nur ein echtes `true` schaltet sie am Server ein – ein alter Browser sendet das Feld nicht und bekommt keine unsichtbaren Tiere; der neue Browser sendet es in `raumErstellen`/`einstellungen`, Standard `true`, Lobby-Schalter „🐄 Tiere“ in der Zeile Verkehr). `startInfo.einstellungen.tiere` meldet es zurück.
- Der Server simuliert autoritativ `R.Tiere` (`src/world/tiere.js`, dieselbe Logik wie offline): Erscheinen (ca. alle 60–90 s Rennzeit, nur auf freien Abschnitten, nie < 40 m an einem Auto), Pfad (gerade oder schräg 20–70°), Stehenbleiben, Kontakt (Tempo des Autos × 0,7, kleiner Hüpfer, KEIN Schaden; das Tier erschrickt und flüchtet) und die Meldung `ereignis {art:'meldung', text:'🐄'}` (Tier-Icon) an den Betroffenen. Der Zufall kommt aus dem Raum-Seed.
- `zustand.ti`: je **Tier-Platz** ein Eintrag im Format von `a` (14 Zahlen: x, z, y, richtung, tempo, beinphase, flags, hüpfhöhe, größe 0…1, 0, 0, 0, 0, resetZähler). `flags`: **2 aktiv** (ohne Bit 2 ist der Platz leer; leere Plätze sind die Zahl `0`, am Ende abgeschnitten) · 4 steht · 8 erschrocken (rennt weg). Die Plätze sind je Tierart in festen Blöcken angelegt (Reihenfolge Kuh, Reh, Bär, Steinbock, Dino, Kamel, Einhorn; nur die Arten der Strecke; Megastrecke: alle Arten ihrer Abschnitte), Client und Server legen sie mit `Tiere.einsetzen(strecke, …)` gleich an – die Tierart ergibt sich aus dem Platz. Der Browser rechnet nichts (`nurAnzeige`): Posen über `NetzAnzeige.pose(k, platz, 'ti')` (gleiche Glättung/Interpolation wie `vk`), beim Auftauchen (Flag 2 neu oder anderer resetZähler) wird nicht aus dem Nichts interpoliert. Fehlt `ti` (Server ohne Tiere), zeigt der Browser keine; ein Browser ohne Tiere ignoriert das Feld.

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
denselben Werten rechnen (`wert / 100`). Der Server verarbeitet je Tick (1/60 s) die fällige Eingabe je Spieler (nach Folge-Nr, siehe Nachtrag v23; > 45 gepuffert → neu
ausrichten, Item/Reset-Flanken bleiben erhalten); kommt 300 ms nichts (Tab im Hintergrund), rollt das Auto ohne Gas.

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

# Zufällige Strecke (Z1, 28.10.2026) – additiv, Protokoll-Version bleibt 4

Münzen und Hindernisse (Öl, Sand, Baustelle, Ast, Lava, Wracks, Strohballen-/Dino-/Tier-Stellen) liegen in jedem Rennen anders und werden in jeder Runde neu verteilt – Autorennen UND Motorrad.
Online entscheidet der **Server**, wann; Server und Browser rechnen aus denselben ganzen Zahlen **bitgleich** dieselbe Lage (`src/track/zufall.js`: nur Ganzzahl-Hash + mulberry32, kein `Math.random`, keine Zeit).

**Browser → Server (neu):** `raumErstellen.einstellungen.zufall` und `einstellungen.zufall` (bool, Standard im neuen Browser `true`, Lobby-Zeile „🎲 Zufällige Strecke“). Nur ein echtes `true` schaltet ein –
ein alter Browser sendet das Feld nicht, bekommt die feste Strecke und nie ein `zufall`-Ereignis (alter Client ↔ neuer Server geht weiter; neuer Client ↔ alter Server: Feld wird ignoriert, feste Strecke).

**Server → Browser (neu):**
- `lobby.einstellungen.zufall` / `start.einstellungen.zufall` (bool); `start.zufallSeed` (Ganzzahl, 32 Bit; fehlt = feste Strecke): Rennseed = `hash32(Raum-Seed, 0x5a31, 1, 7)`. Der Browser baut `new R.Strecke(daten, { …, zufall: { seed } })` → Lage für Runde 1.
- `ereignis {art:'zufall', k, runde, n, v}` (an alle, `an:null`): `runde` (1-basiert, die Runde des Führenden), `n` (0 = Rundenwechsel des Führenden; ≥ 1 = Nachzügler, höchstens 1× je Sekunde, nur wenn wartende Objekte inzwischen frei sind),
  `v` = Bogenlänge **aller** Fahrzeuge auf der Strecke (Teilnehmer, Streifenwagen, Verkehr) in **ganzen Metern**. Der Browser ruft `R.Zufall.ereignis(strecke, { runde, n, v })` (über `R.ZufallSpiel.anwenden`: danach KI-Hindernisliste,
  Dynamik-Stellen, Hindernis-Grafik). Seed der Runde = `hash32(rennSeed, runde, n, …)`.
- Fenster: Objekte von 60 m hinter bis 300 m vor irgendeinem Fahrzeug werden NICHT verschoben (kein Aufpoppen, nichts in Autos); sie behalten ihre Lage bis zu einem Nachzügler-Ereignis. Neue Lagen liegen nie in einem Fenster.
- Reihenfolge: Ereignisse sind geordnet (WebSocket); ein verpasstes Ereignis würde den Client von der Server-Lage abweichen lassen (die Ereignisse tragen deshalb `runde`/`n`; der Client rechnet stets aus dem eigenen Stand).
- Motorrad-Räume: gleiche Nachricht; Werkstatt und Krankenstation (`start.stationen`) sind feste Sperrzonen (`R.Zufall.externAus`), Stunt-Elemente (Feuerring, Busse, Zonen) ebenso.

Tests: `node tests/test_zufall.js` (Engine, Server ↔ Client bitgleich nach jedem Rundenwechsel, Auto und Motorrad, alter Client), `python3 tests/zufall_browser.py` (je Spiel 2 Runden im Browser).

# Motorrad online (M4, 28.10.2026) – additiv, Protokoll-Version bleibt 4

Motorrad-Räume laufen auf **demselben Spielserver und demselben `/ws`** wie die Autorennen-Räume – aber hinter einem Schalter und in **eigenen, getrennten Räumen**.
Ohne Schalter (Standard) verhält sich der Server bitgleich wie vorher; ein alter Autorennen-Client merkt von M4 nichts (er schickt nie `moto`/`k` und bekommt nie `mo`/`mu`).

**Schalter** (Server): `node server/server.js --motorrad` · Umgebungsvariable `MOTORRAD_ONLINE=1` · oder die leere Datei `<Spielordner>/motorrad.an` (wirkt ohne Neustart, höchstens 2 s Verzögerung;
Spielordner = Elternordner von `server/`). Aus: `hallo` ohne `moto`, `raumErstellen {moto:true}` → `fehler {grund:'keinMotorrad'}` (ohne Zeitsperre, ohne Raumwechsel), `/Motorrad.html` → 404.

**Browser → Server (neu)**
- `raumErstellen {moto:true, einstellungen:{…, unfall:'aus'|'sanft'|'echt', stuntrennen:bool}}` · `raumBeitreten {code, moto:true}` – ohne `moto:true` (alte Clients, Autorennen) entsteht/gilt ein Autoraum.
  Beitritt mit der falschen Art → `fehler {grund:'falscheArt'}` (kein Fehlversuch-Zähler, Raum bleibt unberührt). Der Client fragt vorher `hallo.moto` ab (alter Server schweigt dazu → „kann noch kein Motorrad online“).
- `einstellungen {…, unfall, stuntrennen}` (nur Host, Lobby/Ergebnis): `unfall` nur aus der Liste (sonst `sanft`), `stuntrennen` nur ein echtes `true` zählt.
- `wahl {auto}` / `raumErstellen.auto`: nur Fahrzeuge des **Motorrad-Katalogs** (Crossmaschinen in 8 Farben + Superbike, Roller, Chopper, Quad); Auto-IDs → `fehler {grund:'ungueltig'}`.
- `eingabe {…, k:1}`: Trick-Taste (Salto/Drehung/Wheelie-Taste) gehalten oder seit der letzten Nachricht angetippt. Wie `r`/`i`: Flanken überleben das Verwerfen überholter Eingaben.

**Server → Browser (neu, nur Motorrad-Räume)**
- `hallo {…, moto:true}` nur bei eingeschaltetem Schalter. `lobby.einstellungen` enthält `moto:true`, `unfall`, `stuntrennen`; Polizei/Geisterfahrer/Krankenwagen/Abschleppwagen/Verkehr/„Nur Rennautos“ sind erzwungen aus.
- `start.stationen = {w, k}`: Bogenlänge (m, 2 Stellen) von Werkstatt und Krankenstation (Gegenprobe: der Browser baut sie selbst und muss auf dieselben Plätze kommen).
- `zustand.mo[i]` (alle Teilnehmer, gleiche Reihenfolge wie `a`): `[0 sturzAnzahl, 1 stuntPunkte, 2 comboMult, 3 comboRestSek, 4 motorrad%, 5 fahrer%, 6 flags, 7 gier, 8 salto, 9 hoehe, 10 nick, 11 meter, 12 szene|0, 13 trickCode, 14 trickFortschritt]`
  - `flags`: 1 Purzelbaum läuft · 2 an einer Station (Halt) · 4 Station: steht · 8 Szene vor Ort · 16 Wheelie · 32 Stoppie · 64 Trick läuft · 128 in der Luft · 256 Halt an der Krankenstation (sonst Werkstatt)
  - `gier/salto/hoehe/nick`: Pose des Stunts (rad, rad, m, rad) – Schräglage rechnet der Client selbst (aus der Gierrate, wie offline)
  - S3 (nur mit Modul spassTricks.js): `[13]` Trick-Code 0 keiner · 1 Superman · 2 Handstand · 3 Backflip, `[14]` Fortschritt 0..1 (Flag 64 gilt auch für diese Tricks). Auslösung im Flug: Trick-Taste (Eingabe-Bit k) + Richtung aus der übertragenen Steuerung (↓ Backflip, ↑ Superman, ←/→ Handstand, Fenster 0,25 s); Punkte kommen als normales `stunt`-Ereignis (Name „Superman!“ …). Der Server rechnet deterministisch; alte Clients ignorieren die zwei Zusatzwerte. Zeitlupe/Kamera-Schwenk sind rein lokal.
  - `szene`: `[art 0 Abschleppwagen/1 Krankenwagen, phase 0 wartet/1 läuft, t, sB, qB, qH, dir, pflege, frei 0/1, tFrei]` (Szene vor Ort; `0` = keine)
- `ich.mu = [motorrad%, fahrer%, haltebremse 0/1]` des eigenen Fahrers, **ungerundet** (die Vorhersage rechnet Höchsttempo/Beschleunigung und Haltebremse wie der Server); fehlt im Modus „Unfälle aus“.
- `ereignis` (an alle, `an:null`): `{art:'stunt', nr, st, name, p, m, g, x}` (Art, Name, Punkte, Combo-Faktor, Gesamt, Meter/Anzahl) · `{art:'sturz', nr, n}` (Purzelbaum Nr. n; das Quad stürzt nie) ·
  `{art:'unfall', nr, folge:'schreck'|'schaden'|'leicht'|'schwer', szene:'abschlepp'|'kranken'|null, z, gs}` (Folge nach einem Sturz, Motorrad-/Fahrer-% danach).
  Texte für den Betroffenen („Huch! Alles heil“, „Der Krankenwagen kommt!“ …) kommen wie bei Autos als `ereignis {art:'meldung'}` an ihn.
- `ergebnis.zeilen[].stunt` = Stuntpunkte, `ergebnis.stuntrennen` (bool): beim Stuntrennen zählt der Browser Platz- + Stuntpunkte zusammen (`stuntrennenWertung`).

**Simulation** (`server/motoSim.js`, `server/simulation.js` `opt.moto`): zweiter vm-Kontext mit denselben Modulen wie `Motorrad.html` (Katalog, M3-Typen, Strecken-Anpassungen, Schräglage/Sturz, Stunts, Unfälle); der Autorennen-Kontext bleibt unberührt.
Zufall: keine `Math.random` – Folge nach Sturz und KI-Tricks deterministisch (Saat aus Strecke + Fahrer-Nr.). Das Quad wird nach jedem Schritt entschärft (kein Überschlag, kein Sturz-Ereignis).
Quad-Wackeln, Auspuffknall und Funken rechnet der Server nicht: der Browser leitet sie bei fremden Fahrern aus den Zustandsdaten ab (S8, `R.Moto.m3start.onlineEffekte`, nur Anzeige). Schlamm/Wasser/Kisten gibt es ab S8 auch auf normalen Motorrad-Strecken (siehe unten), die Steilwand nur im Stunt-Park.
Tests: `node tests/test_moto_netz.js` (Server + Clients über WebSocket, Determinismus Server ↔ Vorhersage, Räume getrennt, alter Client), `python3 tests/moto_netz_browser.py` (zwei echte Browser).

**Stuntpunkte → Portal-Bestenliste:** Der Client meldet nach dem Rennen seine eigenen Stuntpunkte an das Portal (`POST {MOTORRAD_PORTAL}/api/bestenliste`, Body `{spiel:'motorrad', modus:'stunt-online'|'stuntrennen-online', name, punkte}`),
siehe `server/README.md`, Abschnitt „Motorrad online (M4)“. Der Spielserver selbst spricht nie mit dem Portal.

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

# Radwelt: WebSocket `/ws-rad` („👥 Zusammen fahren“, R4-F, 23.10.)

Datei: `server/radRaum.js` (eingebunden in `server.js` mit 1 require + 1 Upgrade-Zeile; `/ws` und `/ws-brett` unverändert). Client: `src/rad/mehrspieler.js`.
Jeder fährt in seiner **lokalen** Radwelt (Physik, Rolle, Speichern lokal); der Server vermittelt nur Räume, Start, Rangliste und Ergebnis. Protokoll-Version 1.

**Origin**: erlaubt `http://localhost:10100`, `http://127.0.0.1:10100`, `http://[::1]:10100`, gleiche Herkunft (Host / X-Forwarded-Host / `--oeffentlich`), https-Seiten im selben Tailnet (`*.<tailnet>.ts.net` wie der Host), Zusatzliste `RADWELT_ORIGINS` (Komma); ohne Origin (kein Browser) erlaubt; sonst `403`.
**Limits**: 80 Verbindungen, 8 je Adresse (X-Forwarded-For), 30 Räume, 5 je Adresse, 8 Fahrer je Raum (Menschen vor Bots), Nachricht ≤ 6 KB (sonst Code 1009), > 25/s ignoriert, > 250/s getrennt, 5 falsche Codes je 10 s, Erstellen/Start höchstens alle 2 s.

Zustände: `lobby` → `laden` (alle bauen die Strecke) → `countdown` (5 s) → `fahrt` → `ergebnis` (→ `lobby` per `zurLobby`).

Browser → Server: `erstellen {name, optik, einst}` · `beitreten {code, name, optik}` · `wieder {code, id, token}` · `verlassen` · `einstellungen {einst}` (Gastgeber) ·
`optik {name, optik}` · `bots {liste:[{name, optik}]}` (Gastgeber, Lobby) · `bereit {an}` · `start` (Gastgeber, alle bereit) · `geladen {L, zielM}` ·
`z {d, s, r, v, w, wkg, q, k, fertig?, bots?:[…gleiche Felder je Bot]}` (5×/s; d = Gesamtweg m, v m/s, q Spur m, k Kadenz; `fertig` = Fahrt lokal beendet) ·
`beenden` (Gastgeber: Ergebnis sofort) · `zurLobby` (Gastgeber) · `ping {z}`.
`einst = { strecke: alpen|wiese|wald|mega|bauen, bau?: {km, anstiege, hm, maxSteig, art: rund|ab, thema, seed}, runden 1–20, wind, windRichtung (zufall → beim Start ausgewürfelt), realismus 50|75|100, windschatten }`.
`optik = { g: m|w, haar, typ, rahmen, akzent, marke, trikot, helm, ul }` (Indizes der Farblisten, der Browser prüft noch einmal).

Server → Browser: `hallo {v, pfad, max}` · `raum {code, id, token, host, wieder?, zustand?, einst?, zielM?, zeit?, du?}` · `wiederNein` ·
`lobby {code, zustand, du, hostId, einst, fahrer:[{id, name, optik, bereit, host, online, bot}], max, lauf}` · `laden {einst, lauf}` · `countdown {ms, zielM}` · `los {zielM}` ·
`stand {zeit, zielM, zustand, fahrer:[{id, platz, d, s, r, v, w, wkg, q, k, tz, ziel, zz, on, raus, dq, bot, gs, gm}]}` (5×/s, Rangliste, gs/gm = Abstand zum Ersten in s/m) ·
`ergebnis {grund: alleImZiel|zeit|gastgeber, zeit, zielM, liste:[{platz, id, name, bot, zeit, gs, gm, d, avgW, status: ziel|raus|dq|unterwegs}], lauf}` ·
`warnung {grund: watt|tempo|sprung|zurueck|wkg|zahl|strecke, id, dq, anzahl}` · `fehler {grund, text}` · `raumZu {grund}` · `pong`.

**Regeln**: Rennuhr = Server-Uhr ab `los`. Zielstrecke = `zielM` des Gastgebers (Runden × Rundenlänge bzw. A→B-Länge). Ziel, wenn `d ≥ zielM` (Zielzeit zwischen zwei Meldungen interpoliert).
Plausibilität je Meldung: ≤ 2500 W, ≤ 100 km/h, W/kg ≤ 35, kein Sprung (`d ≤ d_alt + 27,8 m/s · (Δt + 0,5 s) + 3 m`, `d ≤ 27,8 m/s · (Rennzeit + 1,5 s) + 5 m`), nicht rückwärts (> 2 m) –
sonst verworfen + `warnung`; ab 15 Verstößen disqualifiziert. Ergebnis, wenn niemand mehr fährt (im Ziel / raus / DQ) oder 5 min nach dem Ersten. Reconnect mit `wieder` innerhalb 60 s;
danach (oder 60 s ohne Zustandsmeldung) „raus“. Gastgeber weg → nächster Mensch wird Gastgeber (seine Bots fallen weg). Raum ohne verbundene Menschen schließt nach 10 min.
Nur für Tests: Umgebungsvariable `RADWELT_RAUM_TEMPO` (Zeitraffer der Rennuhr + Sprung-Toleranz).

**R4-F2 (Protokoll 2)**: `erstellen`/`beitreten` brauchen `v: 2` (sonst `fehler grund:'version'`) und `app` (Radwelt-Stand). `geladen {L, zielM, fp, app, sim}`; beim Countdown vergleicht der Server
jeden Mitfahrer mit dem Gastgeber (app, Fingerabdruck `fp`, Zielstrecke ±0,5 m) → Abweichler bekommen `abweichung {grund: version|strecke, text}` und fahren nicht mit (`raus`, `grund:'abweichung'`);
`countdown` trägt `{zielM, L, fp, app}` (der Browser prüft selbst noch einmal). Neu: `rauswerfen {id}` und `sperren {an}` (Gastgeber); `lobby.gesperrt`, `lobby.fahrer[].app/sim/abw`.
`z` darf `sim` und `rtt` (ms) tragen; die Zielzeit wird um rtt/2 korrigiert; `fertig` mit `d ≥ zielM − 2 m` zählt als Ziel. `stand`/`ergebnis`: `sim`, `ergebnis.liste[].grund`
(abweichung|rausgeworfen|getrennt|stale|aufgegeben|verlassen|gastgeber). „raus“ wegen `stale`/`getrennt` wird zurückgenommen, sobald wieder Daten kommen (bis zum Rennende).
Limits: Code-Raten je Adresse/Tailnet-Identität (ab 5 Fehlversuchen 1, 2, 4 … s, max. 300 s, verfällt nach 10 min), höchstens 3 Räume je Adresse (lokal ohne Proxy-Header ausgenommen),
X-Forwarded-For/Tailscale-Identität nur von 127.0.0.1/::1 (sonst Socket-Adresse), leerer Raum schließt nach 2 min. „Gleiche Herkunft“ nur für bekannte Hosts (localhost, IP-Adressen, *.ts.net,
`--oeffentlich`) – gegen DNS-Rebinding. Alle Timer/Handler in radRaum.js fangen Fehler ab (ein Fehler beendet nie den Prozess).

**R6 „Internet für Freunde“ (23.10.)**: Verbindungen aus dem offenen Internet (Header `Tailscale-Funnel-Request`, Header fremder Proxys `cf-*`/`X-Real-IP`/`Forwarded`,
öffentliche Adresse in `X-Forwarded-For` vom lokalen Proxy oder öffentliche Socket-Adresse) nimmt `/ws-rad` **nur an, solange der Internet-Schalter an ist**
(`status.json` des root-Helfers: `funnel:"an"`, höchstens 30 s alt; ohne `--steuerung` nie) – sonst `403`. Geht der Schalter aus, bekommen bestehende Internet-Verbindungen
`fehler {grund:'internetAus'}` und werden mit Code 4003 getrennt (Prüfung alle 2 s; ihr Platz bleibt wie bei einem Netzabbruch reserviert). Internet-Gäste dürfen `beitreten`,
aber nicht `erstellen` (`fehler {grund:'nurTailnet'}`). Schlüssel für Limits/Code-Raten: der **letzte** `X-Forwarded-For`-Eintrag (den setzt der lokale Proxy; vom Gast
mitgeschickte stehen davor), bei Funnel nie die Tailnet-Identität.
Neu Browser → Server: `schalterFrage` · `schalterUmschalten {an}` – wie beim Autorennen (`/ws`): dieselbe Rechte-Prüfung (`schalterBewertung`, hier ohne eigene Origin-Prüfung, weil
`/ws-rad` den Origin schon geprüft hat – so geht es auch aus der eigenen Radwelt `http://localhost:10100`), dieselbe Wunsch-Datei, dasselbe Rate-Limit (1 Wunsch / 5 s für beide Pfade).
Antwort `schalter {recht, funnel, wartet, rest, haengt?, helfer?, fehler?, einladung, radDa, radApp}`; `einladung` = `--oeffentlich` + `rad/Radwelt.html` (Browser hängt `?raum=CODE` an),
`radDa` = Radwelt-Kopie liegt im Spielordner, `radApp` = deren `MP_APP`. Internet-Gäste bekommen immer nur `{recht:false}`.

# Radwelt-Kopie `/rad/…` (R6)

Der Server liefert unter `/rad/` eine **eigene Kopie** der Radwelt aus (`<Spielordner>/rad`, CLI `--rad <Ordner>`): nur `rad/Radwelt.html`, `rad/src/…`, `rad/vendor/…`
(`/rad/` und `/rad` → `Radwelt.html`, Abfrage bleibt). Gleiche Regeln wie für die Spieldateien (kein `..`, keine `.`/`_`-Dateien, nur bekannte Endungen), zusätzlich wird der echte
Pfad geprüft (kein Link aus `rad/` heraus). Die Kopie legt `server/autostart/rad-kopieren.sh` an (von `installieren.command` aufgerufen). Autorennen-Dateien (`/src/…`) bleiben unberührt –
Radwelt und Autorennen überschreiben sich ihre gemeinsamen Dateien so nie. Die Speicher-API `/api/rad/…` bleibt nur direkt über 127.0.0.1 erreichbar (über Funnel/Tailnet-Proxy `403`).

**R6-2 (Gegenlesen)**: Internet-Gäste brauchen beim `beitreten` zusätzlich `k` = Einladungs-Token des Raums (128 Bit, base64url, 22 Zeichen); ohne/falsch → `fehler {grund:'unbekannt'}`
(zählt als Fehlversuch). Den Token holt der Gastgeber (nicht aus dem Internet): `einladung {neu?}` → `einladung {code, k}`; `neu:true` erzeugt einen neuen (alter ungültig).
Internet aus → alle Tokens erlöschen, Gastgeber bekommt `einladung {code, k:null, grund:'internetAus'}`. Schlüssel für IPv6-Internet-Adressen = ihr /64. Gemeinsames Limit für
alle Internet-Gäste: 30 Fehlversuche je Minute → 60 s kein Beitritt aus dem Internet. Höchstens 40 Internet-Verbindungen (`503`). Schalter über `/ws-rad`: Recht nur mit der
strengen Prüfung wie `/ws` (Origin = Host/X-Forwarded-Host/`--oeffentlich`); Tailnet-Verbindungen von anderen erlaubten Seiten (eigene Radwelt `localhost:10100`, andere
Tailnet-Geräte) bekommen `schalter {recht:false, grund:'seite', funnel, rest, miniSeite}` – geschaltet wird dann auf der Mac-mini-Seite (`/rad/Radwelt.html?schalter=1`).
Autostart: Server mit `--host 127.0.0.1` (nur über `tailscale serve`/Funnel erreichbar, nicht mehr im LAN).


## S1 Spaß-Paket (additiv, abwärtskompatibel)
- Raum-Einstellung `spass` (true = Trampolin/Kanone auf der Strecke; fehlt/false = Strecke wie früher). Server baut `strecke.spass` aus Strecke + Seed deterministisch (src/spass/spassKern.js), Client ebenso.
- `ich.sz.f[8]` = 1, wenn der aktuelle Flug ein Trampolin-Sprung ist; `ich.sz.sp` = 1, solange das Fahrzeug in der Kanone steckt (Server rechnet allein, Vorhersage folgt ihm). Alte Clients ignorieren beides.

## S2 Tuning mit Goldstücken (additiv, abwärtskompatibel)
- Raum-Einstellung `tuning` (nur ein echtes `true` schaltet ein; Standard AUS = fair, alle fahren mit den Katalogwerten). Nur der Host setzt sie (`einstellungen`).
- Spieler senden ihre Stufen als Liste `tuning: [Motor, Reifen, Bremsen]` (ganze Zahlen 0..5) in `raumErstellen`, `raumBeitreten` und `wahl`; der Server klemmt sie (ungültig → kein Tuning) und meldet sie in `lobby.spieler[].tuning` nur bei eingeschaltetem Raum-Schalter.
- Wirkung (src/spass/spassTuning.js, Server und Browser rechnen gleich): Motor +1,6 % Tempo und Anzug je Stufe, Reifen +1,6 % Grip, Bremsen/Federung +2 % Bremskraft (Stufe 5: +8 / +8 / +10 %). Die Faktoren werden einmal in `vehicle.daten` eingerechnet.
- Computer-Gegner bekommen gleichwertiges Tuning: Mittel der Menschen je Art × Anteil der Schwierigkeit (leicht 0,4 · mittel 0,6 · schwer 0,8 · ab profi 1), gerundet; hat kein Mensch Tuning, haben auch sie keins.
- `start.teilnehmer[i].tuning` = `[m, r, b]` (fehlt = ohne Tuning, auch für alte Clients); `start.einstellungen.tuning` zeigt den Raum-Schalter. Der Browser wendet es auf `f.vehicle`, `f.schatten` und die Vorhersage an und hängt ab Stufe 3 die Tuning-Teile an das Modell.

## S8 Reste (additiv, abwärtskompatibel)
- **KI-Motorräder gemischt**: `gegnerAutos(…, {schwierigkeit})` zieht (nur Motorrad) aus Crossmaschine, Superbike, Roller, Chopper, Quad nach Gewicht je Schwierigkeit (leicht: viele Roller/Quad, profi: Superbikes), ohne Zurücklegen, aus dem Seed `strecke|Anzahl|Spieler` → Server und Browser gleich. Quad kippt nie. `config.motoGegnerGemischt = false` = nur Cross (alter Stand).
- **Schlamm/Wasser/Kisten** (src/moto/motoS8Welt.js): Plan `strecke.spass.s8 = {felder:[{art,s0,laenge,q0,q1}], kisten:[{s,q}]}` aus Strecke + Seed (Sperrzonen wie Z1/S1, nicht im Stunt-Park/auf eigenen Strecken), Wirkung im Server (`physikSchritt`-Umhüllung, nur bei `spass`). Neues Ereignis `{art:'kiste', nr, k}` (Kiste k von Fahrer nr getroffen; alte Clients ignorieren es).
- **Lobby**: Host-Schalter `spass`, `zauber` (S6) in `einstellungen`; neue Nachricht `{t:'strecke', i, n, d}` (nur Host, Lobby/Ergebnis): Streckencode (R.Editor.code) in n ≤ 6 Teilen à ≤ 3200 Zeichen; der Server setzt zusammen, prüft mit `R.Editor.ausCode/pruefen` (Fehler `streckeFalsch`) und trägt die Strecke ein (id `eigen-<Hash der Punkte>`, höchstens 16 gleichzeitig). `einstellungen.eigen` = Code (fehlt = normale Streckenwahl; `eigen:''` löscht). Gäste bekommen den Code in `lobby/start.einstellungen.eigen` und bauen dieselbe Strecke.
- **Teleport**: der Browser interpoliert nicht über Ortssprünge > 50 m zwischen zwei Zuständen (Teleport-Tore) – kein Gleiten mehr.

### R1 (30.10.): alte Garage-Upgrades entfernt
Die früheren Garage-Upgrades (Motor/Reifen/Bremsen Stufe 0–3, Einstellung `upgradesZaehlen`) gab es im Online-Protokoll nie (online fuhren alle mit Katalogwerten, nur Tuning s. o.). Seit R1 existieren sie auch offline nicht mehr (Erstattung in Goldstücke beim Laden des Spielstands, `src/ui/garage.js`). Nachrichten oder Einstellungen mit Feldern wie `upgradesZaehlen`, `motor`, `reifen` oder `bremsen` werden vom Server wie alle unbekannten Felder ignoriert; nichts im Server oder in der Vorhersage rechnet damit.
