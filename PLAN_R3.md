# Plan R3 – Auto-Tricks online + KI-Tricks (30.10.2026)

## Ist
- Motorrad-Tricks online: server/motoSim.js hängt Trick-Taste je Teilnehmer ein ('Trick'+i, sim.input.istGedrueckt), server.js eingabe.k → trickAnwenden → sim.trickSetzen; spassTricks.js im MOTO_NACH (simulation.js ~101), schrittSpiel (~290) = Browser-Logik; motoSim.zustand mo[i][13] Code 1/2/3, [14] Fortschritt; Client motoOnline.js eingabe/zustand, spassTricksUI.js (~211–234) umhüllt MO.zustand, spassTricksFahrer.js (~182) Pose.
- Auto-Tricks nur offline: schrittSpiel mit istMoto=false, nur f.istSpieler (~300), Taste ShiftRight/ShiftLeft; Fassrolle/Schraube nur Anzeige (autoPose), Physik nur autoLandeFehler (~373: vLaengs *= 0.88, Schaden nur mit Schaden-Modus). spassTricks.js NICHT im Auto-Server-Kontext.
- KI: Auto (src/ai/driver.js) keine Tricks. Motorrad: stuntStart.js ~97 z.kiPlan = St.kiPlan(saat, i, flugNr) (stunts.js ~202, Chance 0,6, Drehung/Salto, ohne Schwierigkeit). f.driver.schwierigkeit leicht…unschlagbar (config.js ~54).

## Design
- KI-Plan rein & deterministisch: kiPlanNeu(saat, nr, flugNr, schwierigkeit, art) in spassTricks.js, Saat 'r3|'+streckenId+'|'+variante+'|'+nr+'|'+flugNr, hash/zufall vorhanden, kein Math.random. Einmal je Flug beim Abflug.
- Tabelle R.config.spass.tricks.ki – Chance je Flug: leicht .10, mittel .25, schwer .40, profi .55, meister .65, legende .75, unschlagbar .85.
  Auto Schraube-Anteil: 0 / .2 / .35 / .5 / .55 / .6 / .6 (Rest Fassrolle).
  Motorrad Superman/Backflip/Handstand: leicht 100/0/0, mittel 70/30/0, schwer 40/40/20, profi 20/40/40, darüber 10/40/50. Alte Drehung/Salto-Chance → 0,6·(1−chance); neuer Plan ersetzt z.kiPlan (=null).
- Sicherheit: KI startet nur wenn Restflugzeit ≥ Trickdauer + Reserve + 0,3 s (kein Fehltrick), nicht im Looping/Kanone/Polizei/ausgeschieden. Eingabe wie Mensch (taste + dir bei flugT ≥ startT, startT 0,25 + 0,2·r).
- Menü-Schalter „🤖 KI-Tricks“ (Standard an), aus = alter Stand bitgleich.
- Online (nach R2): Raum-Schalter tricks (Standard aus = bitgleich); Auto-Räume zustand.at[i] = [code 0|4 Fassrolle|5 Schraube, fortschritt 0..1, richtung ±1]; Ereignis {art:'trick', nr, st, name, p, m, g}; eingabe.k auch im Auto-Raum; spassTricks.js in MODULE (Auto), Umhüllung kehrt bei tricksRaum !== true sofort zurück; Motorrad-Räume: KI-Tricks über mo[13..14]. Vorhersage Phase 1 ohne Tricks (Server-Korrektur), messen; Phase 2 nur falls sichtbar. Lobby-Zeile „🤸 Tricks“ in spassOnlineS8.js. PROTOKOLL.md Abschnitt R3. ANLEITUNG.md „Auto-Tricks nur offline“ korrigieren.

## Pakete
A 05–15 kiPlanNeu + Tabelle + Test A (Determinismus, Häufigkeit über 10 000 Flüge, monoton)
B 15–30 KI in schrittSpiel offline (Auto + Motorrad), Menü-Schalter; Schalter aus bitgleich, KI ohne Fehltrick
C 30–45 Server (MODULE, tricks, Taste, at, Ereignis) – ERST NACH R2
D 45–60 Client online (online.js, spassTricksUI.js, Lobby)
E 60–75 Motorrad-KI-Tricks online
F 75–85 Vorhersage-Messung
G 85–95 Doku
H 95–100 Gesamtlauf, stand-r3

## Tests
tests/test_r3_tricks.js: A Plan, B Auto-Raum bitgleich zweimal, C Moto-Raum Server=Browser, D Raum ohne tricks bitgleich, E Client-Stub, F Fehltrick −12 %, G alter Client. Alle bestehenden 0 FEHL (test_physik-Fingerabdruck, test_netz 128, test_moto_netz 55, test_spass_s3 41). Browser r3_tricks_browser.py + Bilder (Sonnet prüft).

## Entscheidung R3-LOCKER (31.10.2026, Sebastian): Sicherheitsregel für KI-Tricks gelockert
- Vorher: KI wagt einen Trick nur bei Restflug >= Dauer + Reserve + 0,3 s (nie ein Fehltrick). Folge: Motorrad-KI machte auf normalen Strecken (Flüge ~0,8-1,3 s Rest) praktisch nie Superman/Handstand (0 Tricks in 600 s x 4 Strecken bei mittel/schwer).
- Jetzt: `ki.zusatz = -0,4` (gemessen: -0,3 erlaubt 190 von 275 Versuchen ohne Fehltrick, -0,4 erlaubt 231 mit 7 % Fehltrick, -0,5 22 % = zu viel).
- Drei Fälle je Flug (Restflug `rest` beim Trickstart): `rest >= Dauer + Reserve` sauber; `rest >= min + Reserve` hastig (kürzer, aber sauber, wie bisher "abgekürzt"); darunter bis zur Grenze `Dauer + Reserve + zusatz` = Fehltrick der KI (`plan(..., ki)`, `ki.fehlMin` 0,25 s).
- Fehltrick (nur KI, Auto und Motorrad gleich): Trick läuft zu hastig, keine Punkte, nicht als Trick gezählt (`stat.verpatzt`), bei der Landung kurzes Wackeln (`z3.wackel`, Pose rolle) und EIN Abbremsen um `ki.kiTempo` (0,92). Kein Schaden, kein Sturz, kein Hängen (Tempo wird nicht wiederholt gesenkt, `landeFehler` löscht sich).
- Server = Client: gleiche Funktion `schrittSpiel` (spassTricks.js), deterministisch (Plan aus Hash, Rest aus Physik). Online sehen Clients das Abbremsen über die Server-Position; die Wackel-Animation ist nur Anzeige (offline Motorrad/Auto; online nicht übertragen).
- Tests: Fehltrick-Quote <= 15 %, kein Sturz/Hänger, deterministisch (test_r3_tricks A/B/E); Messskript tests/r3_locker_messung.js.

