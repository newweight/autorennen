# Plan R2 – Online-Modi (Auto + Motorrad), 30.10.2026

Ziel: Kurz-Level, K.-o.-Rallye, Freie Fahrt online zu zweit (bis 6 Menschen), Geist und Dino-Aufgaben online. Server entscheidet alles (deterministisch), Lobby-Wahl. Ohne R2-Wahl = bitgleich zu heute.

## Ist-Zustand (kurz)
- Offline-Modi laufen über src/spass/spassModi.js (Spiel._s4Modus, Wrapper um P.rennenStarten → handler[art].start/schritt/flug/ereignis/bild/aufraeumen). Online wird rennenStarten nie aufgerufen → greift online nicht.
- spassKurz.js: Rechenteil Three-frei (LEVEL a01–a12/m01–m12, abschnitt, zeiten, sterne, muenzPlan, auswerten(lauf, ctx) → laeuft/geschafft/zeitUm/verpasst; ctx.zaehl muenzen/sprung/kanone/ring/bus/tricks). Start-Code ab ~Z. 241.
- spassKO.js: Wrapper um RaceManager._checkpointErreicht/_eliminationPruefen, wirkt nur bei rennen.elimination.ko; runden(n), wertungen(strecke), status(r). Ausscheiden: Ereignis raus → Spiel._ausgeschieden(t) (main.js ~681, parkt bei 100000/-100).
- spassFrei.js: plan(strecke) 12 Kisten deterministisch (Sperrzonen!), slalomPlan, slalomTor, muenzPlan, weiteOk; Aufgabenlogik Browser-Teil ab ~Z. 148.
- spassGeist.js / spassStart.js ~135: Aufnahme 10 Hz, nur offline solo, localStorage rennspiel.spass.geist.<spiel>, Schlüssel streckeId|autoId.
- Dino: spassWelten.js ~253 dino.neu/schritt rein (Ereignisse gold/sammeln/wettrennen/sieg/verloren/abbruch/weg), spassWeltenUI.js ~257 aufgabenSchritt nur offline.
- Online heute: raumErstellen → einstellungenPruefen (simulation.js 145–196, Whitelists) → start → rennenStarten (server.js ~351) → tickRaum (~749: eingabeTick, sim.schritt, abholen; zustand alle 3 Ticks) → fertig → ergebnisSenden. Client online.js Puppen-Rennleitung (rennenAufbauen ~787). Server-MODULE simulation.js 22–36, Moto 107 (spassKurz/Frei/KO noch nicht geladen). Vorlagen: server/motoSim.js, spassOnlineS8.js, spassTuningOnline.js.

## Lobby-Felder (Host, Nachricht einstellungen)
modus 'rennen'|'kurz'|'ko'|'frei' (Std rennen) · level nur ids aus R.SpassKurz.liste · freiZeit 3|5|10 (Std 5) · geist bool (Std false) · dino 'aus'|'dino'|'immer' (Std aus).
Unbekannt → Standard, nur echtes true. Schlüssel nur ins Objekt, wenn ≠ Standard (Muster eigen) → bitgleich. hallo.r2 = true vom Server; Client zeigt R2-Zeilen nur dann.
Überschreiben je Modus mit gemeinsamer Funktion R.SpassR2.einstellungen(e, art) (Server+Client):
- kurz: streckeId aus Level, gegner 0, Rennleitung runden 99, Polizei/Verkehr/Tiere/Zufall aus, spass an, Wetter klar, Tag, Wind 0.
- ko: gegner = max(3, gegner), runden = SpassKO.runden(Menschen+gegner), Polizei/Tiere/Verkehr aus.
- frei: gegner 0, Polizei/Verkehr/Zufall aus, spass an.

## Modi
- Kurz: Start nebeneinander bei abschnitt().s0, ±2,5 m, ab 3. Fahrzeug Reihe dahinter – R.SpassR2.plaetze(strecke,e,n) Server+Client. Server setzt Felder wie spassKurz.start. Wertung je Tick mit SpassKurz.auswerten; Münzen über Three-freie R.SpassR2.Muenzen, je Spieler eigene Münzwelt; sprung/kanone über Wrapper sim._flugEreignis/sim.spassEreignis; ring/bus/tricks aus sim.stunt.fz[i].stat. Fertig wenn alle Menschen Ergebnis oder Limit (≤120 s), wer geht = weg. Platz: Sterne absteigend, dann Zeit. Ereignis kurz → Client SpassKurz.eintragen.
- K.-o.: Server RaceManager mit elimination {zuschauerSekunden 6, ko true}, rennen._koWert = SpassKO.wertungen; bei('raus') → sim._ausgeschieden + Ereignis raus (sim.puffs = []). spassKO.js in MODULE hinter raceManager.js. Finale bei ≤2 Aktiven (Ereignis finale). Ergebnis zeilen[].w. Client: raus → ausgeschieden, Puff, Zuschauerkamera (r.elimination an Puppen-Rennleitung), eigener Ausfall: neutrale Eingabe, Vorhersage stoppen. HUD wie handler.ko.bild via SpassKO.status.
- Frei: Kisten SpassFrei.plan (gleich bei gleichem spass/zauber/eigen – Test). Server vergibt ❓: am Boden, < 3,4 m, |dy| < 4, frei. Erster Finder bekommt Aufgabe privat, Kiste „gefunden von X“, Scheitern → wieder frei, Erfolg → ✔. Teamzähler n/12. Aufgaben im Server als Three-freie R.SpassR2.FreiAufgabe (muenzPlan, slalomPlan, slalomTor, weiteOk; t.seitenabstand, f.flug.letzteWeite). Ende nach freiZeit oder alle 12 ✔. Ergebnis je Mensch geschafft/gefunden/Gold.
- Geist: nur Client, eigener bester Lauf, Lobby-Bool geist; Aufnahme mit Vorhersage-Pose, Rundenzeit vom Server (runde-Ereignis), ablegen bei Bestzeit.
- Dino: Server je Mensch D_i = dino.neu(strecke), D_i.seed = hash32(r2Seed, nr, 0xD10), dino.schritt mit K aus Fahrzeug (f.nah.s, vLaengs, vMax, schwierigkeit, bereit wie offline). Ereignisse nur an Besitzer: dinoGold {n,s0,q,a}, dinoSammeln {id}, dinoWett {weg,vD,s0,sMark}, dinoEnde {art}. Client: Extern-Modus in aufgabenSchritt (Flag), Gold +1 je dinoSammeln.

## Entscheidungen (von Claude nach Standard getroffen, Sebastian kann ändern)
1. Online-Sterne zählen wie offline (Fortschritt + Bestzeit), weil vom Server.
2. Gold online (Frei, Kurz, Dino) geht in die Garage-Kasse, nur über Server-Ereignisse.
3. Geist online eigener Schlüssel streckeId|autoId|online.
4. Dino-Gold privat je Spieler.
5. Freie Fahrt: nur Zeitlimit 3/5/10 min.
6. K.-o. online: mindestens 3 KI wie offline.
7. Lobby: Hinweiszeile statt Ausgrauen.

## Dateien
Neu: src/spass/spassR2Kern.js (R.SpassR2 rein: einstellungen, plaetze, Muenzen, FreiAufgabe, kurzStart), src/spass/spassOnlineR2.js (Browser: Lobby-Zeilen wie spassOnlineS8, Wrapper um online.js-Funktionen, HUD, Kisten, Münzen, Ergebnis, Geist, Dino-Extern), server/r2Sim.js (wie motoSim.js: einbauen, nachSchritt, ergebnis, startInfo), tests/test_r2_online.js, tests/r2_browser.py.
Haken: simulation.js (MODULE + Moto-Liste, einstellungenPruefen, plaetze ~277, RaceManager ~308, einbauen ~357, nachSchritt ~401, startInfo/ergebnis), server.js hallo.r2 (~438), online.js plaetze (~810, 1 Zeile), spassFrei.js Export (1 Zeile), spassWeltenUI.js dinoAktivFuer/laeuft + Extern-Zweig, beide HTML (2 Skripte hinter spassOnlineS8.js), PROTOKOLL.md Abschnitt R2. Wrapper greifen nur bei gesetztem modus/geist/dino.

## Pakete (Commit „R2 NN%: …“, Verlaufszeile, alte Node-Tests vor jedem nächsten Paket)
05 Kern-Gerüst, einstellungen, Wertelisten, plaetze · 10 einstellungenPruefen + MODULE + hallo.r2 (test_netz 128, test_moto_netz 55 unverändert) · 15 r2Sim-Gerüst + Haken · 20 Kurz Start/auswerten/Ereignis · 25 Kurz Münzen + Zähler · 30 Kurz fertig/Ergebnis/zuKI · 35 K.-o. Server · 40 K.-o. Ergebnis/Ausscheiden Mensch · 45 Frei Aufgabe + Kisten · 50 Frei Zeitlimit/Ergebnis/Gold · 55 Dino Server · 60 PROTOKOLL.md · 65 Client Lobby · 70 Client Kurz · 75 Client K.-o. · 80 Client Frei · 85 Client Geist · 90 Client Dino · 95 Gesamtläufe + Bitgleich-Gegenproben · 100 Doku, stand-r2, Code-Review + Bildprüfung durch Sonnet.

## Tests
test_r2_online.js (Server im Prozess, 2 ws-Clients, Zeitraffer, 300-s-Wächter): A Standard bitgleich/Whitelists · B Server=Client (plaetze, Frei-plan) · C Kurz (Autopilot, Sterne = auswerten, Münzen/Sprung/Kanone, Moto Ring/Bus/Tricks, Spieler geht, Zeit um) · D K.-o. (2 Menschen + 3 KI, Reihenfolge, Finale, w, Mensch raus, Auto+Moto) · E Frei (einmalige Vergabe, Scheitern, Aufgaben = Offline-Rechenteil, Zeitlimit) · F Dino (Seed, = direktes dino.schritt, nur Besitzer, aus = nichts) · G alter/neuer Client · H kaputte Nachrichten.
r2_browser.py (Server-Unterprozess, 2 Playwright-Seiten, tests/out/r2/): je Spiel und Modus Lobby, Start, HUD, Münzen, Ergebnis, Puff, Kisten ✔, Geist, Dino-Gold, keine JS-Fehler, Offline unverändert.
Bitgleich: test_physik-Fingerabdruck, test_netz 128, test_moto_netz 55, test_spass_s1–s8, test_zufall, Server-Objekte ohne R2.

## Risiken
Geparkte Ausgeschiedene im Client (Interpolation, Kamera, Minimap) · Motorrad-Zustand beim Ausscheiden (motoZ/Sturz) · Kurz-Start mitten auf der Strecke (fortschritt/cp) · Frei-Plan hängt an Sperrzonen · Dino K.bereit wie offline · alter Client im R2-Raum sieht normales Rennen (Hinweiszeile).
