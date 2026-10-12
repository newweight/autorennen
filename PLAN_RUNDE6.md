# Jonas Hot Steering Wheel – Plan Runde 6 (11.10.2026, Fable) – ENTWURF ZUR DISKUSSION

## Todo-Liste Sebastian (wörtlich erfasst, 11.10.)
T1  Reifen müssen besser aussehen
T2  Abseits der Fahrbahn stärker bremsen (Unterschied Straße/draußen zu klein)
T3  Autos dürfen nicht ineinander verschmelzen (z. B. Looping: übereinander geht nicht)
T4  Kollisionen: Health-Punkte ab (wenn Schaden an); realistischer: mal nebeneinander, mal von der Bahn gestoßen, mal Drehung
T5  Abseits gegen Zaun/Pflanzen: langsamer + kleiner Schaden
T6  Recherche: coole Features aus Rennspielen (Hot Wheels, Mario Kart …): gegeneinander/nacheinander, Rennserie mit
    steigender Schwierigkeit, Autos in verschiedenen Farben, Punkte sammeln → Auto schneller machen / reparieren
T7  Berge, Hügel, Täler; Strecken, die sich überkreuzen (wie Carrera-Bahn), nicht jede
T8  Zwei Strecken duplizieren, 3× so lang (wenig Aufwand)
T9  Nacht und Dämmerung als Auswahl bei 1–2 Strecken (Licht gibt es im Tunnel schon)
T10 Eine Auswahl, in der alle Hindernisarten zusammenkommen
T11 Dino: doppelt so viele laufende Dinos, die auch umkehren oder stehenbleiben
T12 Dino: Vulkan-Lava teils auf dem Asphalt – vorbeifahren, sonst kurz stehen + Schaden; Vulkan bricht aus
T13 Dino: 2 Tunnel, Tunnel im Berg
T14 Dino: Meteorit schlägt 2× neben der Fahrbahn ein, Steinbrocken rollen auf die Fahrbahn (ausweichen)
T15 Dino: Flugdino fliegt auf einer Geraden auf das Auto zu und zieht wieder hoch (fast berührt)
T16 Mehrspieler über Tailscale: eingeladene Spieler ohne eigene Tailscale-Installation
T17 Ideen: Hindernisse, Schwierigkeiten, Strecken nach Vorbild Mario Kart / Hot Wheels

(Recherche + Vorschläge folgen unten, nach Diskussion wird daraus der Arbeitsplan.)

## Recherche-Ergebnis (Kurz; Quellen in VERLAUF.md)
Mario Kart: Grand Prix (4 Rennen, Punkte je Platz, Sterne), Zeitfahren mit Ghost, Items (ohne Werfen umsetzbar:
Boost, Schild, Öl-/Bananenfalle hinter sich legen), Münzen → Teile freischalten, Auto-Gas/Smart Steering als Hilfen.
Hot Wheels Unleashed: Karriere-Karte mit Zonen + Boss-Rennen, Drift-Nitro (Driften füllt Boost, Sprünge/Rammen
verbrauchen), Elimination, Checkpoint-Zeitrennen, Lackierungen/Sticker, Upgrade-Stufen.
CTR/Sonic/Rocket League: Start-Boost (Gas im richtigen Moment), Sprung-Boost, Team-Boost, Credits → Kosmetik, Season gegen KI.
Mehrspieler: Tailscale Funnel = öffentlicher HTTPS-Link auf einen Port des Macs (443/8443/10000), Gäste brauchen
nichts; Node-Server (ws) liefert Spiel + Räume mit 4-stelligem Code; autoritativer Server 30 Hz, eigenes Auto
vorhergesagt, andere interpoliert; Kollisionen online am robustesten als „Geister" (durchfahren); Fallback
Cloudflare Quick Tunnel (ohne Konto). Zu prüfen: WebSocket über Funnel, Latenz aus dem Mobilfunk, Funnel mit der
installierten Tailscale-Variante auf dem M1.

## Vorschläge (Fable) – je Punkt: Umsetzung · Aufwand (K/M/G) · Risiko
### A. Fahrgefühl & Kollisionen (T1–T5) – „zuerst, weil es jedes Rennen betrifft"
A1 Reifen (T1): Reifen mit Profilrillen und Flanke, Felgen 3D (Speichen aus einem Kranz, Bremsscheibe/Sattel),
   Rad leicht nach außen stehend; Formel-Slicks eigene Form · K
A2 Abseits (T2): Gras-Deckel 90 → 60 km/h, Sand 50 km/h, Rollwiderstand ×1,5, Übergang über 1 m weich;
   Randstreifen bleibt mild (sonst frustriert es Kinder) · K
A3 Keine Verschmelzung (T3): Kollisionsauflösung mit Durchdringungs-Korrektur in 2 Teilschritten + Abstoßung,
   Autos als gedrehte Rechtecke (OBB) statt Kapseln; Looping: Einfahrt nur, wenn der Looping-Abschnitt (±8 m
   Bogen) frei ist, sonst 0,5 s warten – oder (einfacher) zwei Autos im Looping = seitlich versetzte Spuren · M
A4 Realistischere Stöße (T4): Drehimpuls (Auto dreht bei seitlichem/versetztem Treffer bis 90°), Abschuss von
   der Bahn bei Treffer schräg von hinten, Nebeneinander-Schieben bei flachem Winkel; Masse/Tempo entscheiden;
   Schaden: −5 % ab 1 m/s Differenz (bisher 2 m/s), Drehung = zusätzlich −3 %; KI darf rammen (Stufe profi+) · M
A5 Zaun/Pflanzen (T5): Zaun-Treffer −3 % + Tempo ×0,8; Pflanzen/Deko vor dem Zaun bekommen Kollision (Bäume
   fest −3 %, Büsche bremsen nur) · K–M
### B. Strecken (T7–T10)
B1 Neue Strecke „Alpen" (T7): Serpentinen, Pass, Tal, Tunnel, Brücke – und EINE Kreuzung als Überführung
   (Brücke über die eigene Strecke, wie Carrera-Bahn). Technik: Straßenhöhe aus dem eigenen s statt aus x/z,
   Kreuzung = Brückenabschnitt mit Pfeilern · G (Kreuzung ist der Knackpunkt)
B2 Lange Varianten (T8): Vorschlag statt echter Verdreifachung (Kurven würden 3× so weit = langweilig):
   Variante „XL" = Strecke ×1,6 skaliert (Länge ×1,6, ca. 3 min/Runde) für Wiese und Wüste, als Welt-unabhängige
   Streckenvariante wählbar · K.  Alternative (echt 3×): Strecke als Kette aus 3 gespiegelten Kopien – · G, rate ab.
B3 Tageszeit (T9): „Tag / Dämmerung / Nacht" als Einstellung (alle Strecken, Standard Tag): Dämmerung = tiefe
   orange Sonne, lange Schatten-Optik, Himmelverlauf; Nacht = dunkel, Mond+Sterne, Scheinwerfer der Spieler als
   echte Lichter (wie Tunnel), KI mit leuchtenden Lampen ohne Licht, Straßenlaternen auf Wiese/Wald, Leuchtmarkierungen · M
B4 Welt „Alles" (T10): alle Schichten zugleich (Hindernisse+Wracks+Strohballen+Spuren+Schanzen+Bälle+Wasser+Boost+
   Schild, Polizei an) – nur Menüeintrag + Datenvereinigung · K
### C. Dino-Ausbau (T11–T15) – eine eigene Welle
C1 Dinos ×2, mit Verhalten: laufen, bleiben 1–3 s stehen, kehren um, brüllen (Ton) · K
C2 Lava auf Asphalt (T12): Lava-Zungen über halbe Fahrbahn (leuchtend, blubbernd): Kontakt = 1 s Stopp + −10 %
   Schaden (wenn an) + Rauch; vorbeifahren auf der freien Hälfte · M
C3 Vulkanausbruch (T12): Ereignis alle ~90 s: Grollen, Himmel rot, Aschewolke, 4–6 Lavabomben schlagen neben/auf
   die Fahrbahn (Krater bleiben 20 s als Hindernis) · M
C4 Zwei Tunnel im Berg (T13): Dino-Strecke neu führen – Berg mit zwei Tunneln (einer lang mit Kurve) · M
C5 Meteoriten (T14): 2 Stellen; Ankündigung (Schatten + Pfeifen), Einschlag neben der Straße, 3–5 Felsbrocken
   rollen quer über die Fahrbahn (bestehende Felsbrocken-Mechanik) · K–M
C6 Flugdino (T15): auf der langen Geraden: Flugsaurier kommt von vorn, taucht bis 2 m über das Auto, zieht hoch,
   Schrei; nie Kontakt · K–M
### D. Spielmodi & Fortschritt (T6, T17)
D1 Rennserie „Pokal" (Cup): 3–5 Rennen auf wechselnden Strecken, Punkte je Platz, KI-Stufe steigt je Rennen,
   Pokal-Bildschirm (Gold/Silber/Bronze), Serie speicherbar · M
D2 Münzen + Garage: Münzen auf der Strecke und Preisgeld; Garage-Bildschirm mit großen Symbolen: Lackfarbe je
   Auto (4 Farben), Reparatur (bei Schaden an), 3 Upgrade-Stufen (Motor/Reifen/Bremsen je +4 %); pro Fahrer
   gespeichert (localStorage) · M
D3 Start-Boost (Gas im richtigen Moment beim „LOS") + Sterne-Wertung (1–3 ⭐ je Rennen nach Platz/Zeit) · K
D4 Drift-Boost (Driften füllt Nitro, Loslassen = Schub) – für die Großen; Schalter · M
D5 Ölfalle legen (Item aus Pickup, Taste: Öl hinter sich) · K
D6 Zeitfahren gegen den eigenen Geist (beste Runde als halbtransparentes Auto) · M
D7 Modus „Letzter fliegt raus" (Elimination: jede Runde scheidet der Letzte aus) · K–M
### E. Mehrspieler über Internet (T16) – größter Brocken, eigener Abschnitt
E1 Architektur: Node-Server auf dem Mac (`Mehrspieler starten.command`): liefert das Spiel + WebSocket; die
   Physik-Module laufen unverändert in Node (werden schon für die Tests so genutzt!) → Server rechnet das Rennen
   autoritativ, Browser zeigen an; eigener Wagen vorhergesagt, andere interpoliert; KI-Gegner auf dem Server.
E2 Einladung: Host-Bildschirm mit Raumcode + Link (QR-Code), Gäste öffnen Link, wählen Fahrer/Auto; Host startet.
   Öffentlicher Zugang: `tailscale funnel` (vorhanden) → https://…ts.net; Fallback Cloudflare Quick Tunnel.
E3 Kinder-Sicherheit: kein Chat, keine Namen (nur Fahrerliste), Raumcode läuft ab, max. 6, Host beendet, nur der
   Spielordner wird ausgeliefert, Tunnel nur während des Spielens.
E4 Online-Kollisionen: Start als „Geister" (durchfahren), Stufe 2 mit Kollisionen, wenn Latenz < 100 ms.
   Aufwand gesamt · G (3 Wellen: Server+Lobby, Netcode+Prediction, Tunnel+Tests mit echtem Handy).
   Vorab-Test (K): Funnel + WebSocket auf dem M1 prüfen, bevor gebaut wird.

## Vorgeschlagene Reihenfolge
W1 A1–A5 (Fahrgefühl/Kollisionen) + B4 (Welt Alles) + D3 (Start-Boost/Sterne)      → Version v7
W2 C1–C6 (Dino) + B3 (Tag/Dämmerung/Nacht) + B2 (XL-Varianten)                       → v8
W3 D1 Pokal + D2 Garage/Münzen (+ D5 Ölfalle, D7 Elimination)                        → v9
W4 B1 Alpen mit Kreuzung                                                              → v10 ✓ (12.10.)
W5 E Mehrspieler (nach Vorab-Test)                                                    → v11

## Fragen zur Diskussion
Q1 T8: XL ×1,6 (Vorschlag) oder echte 3-fach-Kette (viel Aufwand, Kurven anders)? Welche 2 Strecken?
Q2 Nacht/Dämmerung auf allen Strecken wählbar (einfacher) oder nur 1–2?
Q3 Online-Kollisionen zunächst als Geister ok?  Max. 6 Spieler?  Sollen Gäste auch gegen KI fahren?
Q4 Garage: nur Kosmetik + kleine Boni (+4 %) oder spürbare Upgrades (Risiko: Balance zu zweit)?
Q5 Kollisionen mit Drehung auch für den 5-Jährigen (oder nur ab Stärke „schwer")? Vorschlag: Schalter „Rempeln: sanft/echt".
Q6 Alpen-Strecke neu (Vorschlag) statt Kreuzung in bestehende Strecke einzubauen – ok?
Q7 Reihenfolge ok? Mehrspieler zuletzt, weil größter Umbau und Vorab-Test nötig?

## Beschlüsse (Sebastian, 11.10. abends)
- Multivan in Bronze. XL-Varianten: Wüste ×1,6, Fantasie ×2. Nacht/Dämmerung auf allen Strecken (Modul, Aufwand
  unabhängig von Streckenzahl); Wald zusätzlich Rehe + Bären, die über die Straße laufen.
- Online: Geister-Kollisionen zuerst, max. 6 Spieler, Gäste auch gegen KI. Garage: Farben + kleine Upgrades (+4 %),
  Schalter „Upgrades zählen an/aus". Einstellung „Rempeln: sanft / echt (mit Drehen)", Standard sanft.
- Alpen neu mit Überführung; Fantasie bekommt eine Kreuzung auf gleicher Höhe (Warnlicht).
- Reihenfolge W1 → W5 wie vorgeschlagen; nach jeder Welle Version sichern UND spielbar ablegen
  (Spiele/Autorennen-Versionen/vN_…/, jeder Ordner mit eigener Autorennen.html).
- Server: Mac mini M4 16 GB (immer an, Tailscale vorhanden; NWES nutzt dort `tailscale serve` → HTTPS/MagicDNS aktiv,
  Funnel-Voraussetzung erfüllt). Gäste per Link ohne Tailscale; Handy/Tablet mit Touch-Steuerung in W5.
- iCloud: Desktop/Spiele ist zwischen Air und Studio synchron; bestehende Dateien sind vom Container aus nicht
  überschreibbar (Cloud-Platzhalter) → neue Versionen immer in neue Ordner; Spiele/Autorennen bleibt v6-Stand,
  bis Sebastian den Ordner lokal lädt oder wir den Starter auf die neueste Version zeigen lassen.
## Zeitplan (Arbeitszeit): W1 ~3 h · W2 ~4–5 h · W3 ~3 h · W4 ~4 h · W5 ~8–10 h (2–3 Sitzungen)

## W5 Mehrspieler – Feinplan (12.10.)
W5-1 (Opus) Server: `server/server.js` (Node, nur `ws` als Abhängigkeit, lokal in server/node_modules mitgeliefert), liefert
      den Spielordner per HTTP + WebSocket `/ws`; Räume mit 4-stelligem Code (Buchstaben ohne 0/O/1/I), max. 6, Host startet.
      Rennen autoritativ im Server: dieselben Module (config, vehicle, collisions, spline, trackCatalog, trackBuilder-Höhen,
      raceManager, driver) über tests/lade.js-ähnlichen Lader ohne DOM/Three. Tick 60 Hz, Zustand 20 Hz an alle (Position,
      Richtung, Tempo, Runde, Rang, Schaden), Eingaben 60 Hz vom Browser (gas/bremse/lenkung/item als Bitmaske + Folge-Nr).
W5-2 (Opus) Browser: neuer Modus „🌐 Online" im Menü (Host: Raum erstellen → Code + Link + QR; Gast: Code eingeben oder Link),
      `src/net/client.js` (WebSocket, Vorhersage eigener Wagen, Interpolation andere, Geister-Modus Stufe 1), Rennen-Start/Ende
      vom Server; alles Bestehende (lokal, Split-Screen) unverändert = Standard.
W5-3 (Sonnet) Touch: `src/ui/touch.js` – Bildschirm-Tasten (Gas/Bremse rechts, Lenk-Hälften links, Item), nur bei Touch-Geräten
      sichtbar, Querformat-Hinweis, Mobil-Qualität (pixelRatio 1, weniger Deko).
W5-4 Tunnel + Handgriffe: `Mehrspieler starten.command` (startet Server auf Port 8443 + `tailscale funnel 8443`), Doku,
      Test mit echtem Handy über Mobilfunk; Fallback `cloudflared tunnel --url http://localhost:8443`.
Vorab-Test K (Sebastian auf dem Mac mini, 5 Minuten): siehe Handgriffe in VERLAUF/Chat – prüft Funnel + WebSocket, bevor W5-4 gebaut wird.
