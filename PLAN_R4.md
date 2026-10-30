# Plan R4 – Halfpipe im Autorennen + Loopings als Magnet-Röhre (30.10.2026)

## Ist
- Halfpipe (Motorrad): spassZauber.js plan() ~Z.91 nur stuntpark + zauber → zauber.pipe {s0:800,s1:872,qF:6,r:6,rampe:14}; pipeEinbauen ~182 (hart: z = s−1034, x 150..250); nachSchritt ~301 pipeStart (vMin 4); pipeSchritt ~385 Pendel (−g/re·sin phi + Pumpen, reibung 0,3/s) über Umhüllung Schanzen.flugSchritt ~437; pipeVerlassen → Flug. Läuft in Server+Vorhersage. Optik spassZauberUI.js 158–184/375 generisch.
- Kein Stunt-Bereich im Autorennen. Stunt-Park = src/moto/motoM3Welt.js parkEintrag(); motoM3Start.js 45–70 schiebt ihn nur während rennenStarten in R.trackCatalog. Modus-Karten spassMenue.js 82–112 (INFO/ARTEN), Handler M.registriere in spassModi.js.
- Loopings nur fantasie (trackCatalog.js ~451, 2×, r=12), _loopingsBerechnen ~1494, track/looping.js (vMin = sqrt(5gr) ≈ 24 m/s). Nutzer: main.js 1487–1561, anlauf.js, driver.js ~838, collisions.loopingAbstand, Looping.beine, vorhersage.js, spassWelten.js ~266, stuntWelt.js.
- Magnet-Röhre: plan() 0–2 Röhren (150 m, rampe 36), nachSchritt z.mag, magnetTheta(s), magnetHalten (FIX1). opt.zauber: main.js ~348 → online.js 238/794 → simulation.js 188/224.

## Design
A Auto-Stunt-Arena: neues src/spass/spassArena.js (nur Autorennen): Eintrag autoarena (Stadion-Geometrie als Kopie von parkPunkte, src/moto unberührt), motoFelder: [] + stuntBereich: true, 2 Schanzen (8°/12°), Umhüller rennenStarten wie Park, gegner 0, runden 99, Polizei/Tiere/Zufall aus. Menü-Karte „🎪 Stunt-Arena“ (spassMenue.js INFO/ARTEN + M.registriere('arena')). Nur offline.
B Halfpipe verallgemeinert: plan() Bedingung stuntpark || daten.stuntBereich; Auto-Werte C().pipeAuto {s0:700,s1:950,r:7,rampe:22,qF:6}; pipeEinbauen mit e.geo {zOff,xMin,xMax} (Vorgabe = alte Zahlen); e.vCap (Auto ~26 m/s) in pipeStart, undefined = Motorrad bitgleich. Pumpe/Reibung messen und abstimmen.
C Looping→Magnet-Röhre: opt.loopingMagnet (nur mit spass+zauber), in R.Spass.plan: je Looping eine Röhre (laenge 90, rampe 24) in der Mitte, Überlappung → bleibt Looping; umgewandelte aus st.loopings entfernen, Zonen in erg.zonen (prüfen, dass sperrZonen sie liefert). Menü-Pillen „🌀 Loopings: Klassisch | Magnet-Röhre“ neben Fahr-Zauber, Speicher rennspiel.spass.zauber.loopMag, Standard aus, ausgegraut ohne Zauber. main.js ~348: sOpt.loopingMagnet. Streckentext „2 Loopings“ anpassen.
D Online loopMag (wie zauber, alle 4 Stellen gleichzeitig: online.js 238/794, simulation.js 188/224, spassOnlineS8.js Lobby, PROTOKOLL.md) – ERST NACH R2.
E Arena online: nicht in R4.

## Pakete
P1 0–15 Vorprüfung + Referenz (test_physik, test_looping*, test_spass_s6)
P2 15–35 Halfpipe verallgemeinern (Moto bitgleich, Pipe-Hash s6 gleich)
P3 35–55 Arena (Katalog danach wieder ohne autoarena, Auto fährt Pipe, Messung Pendel/Flughöhe)
P4 55–75 Looping→Magnet (Fantasie mit Option 0 Loopings/2 Röhren, ohne exakt wie vorher)
P5 75–85 Online loopMag – NACH R2
P6 85–95 Browser + Bilder (Sonnet prüft)
P7 95–100 Gesamtlauf, stand-r4

## Tests
tests/test_r4.js (Muster test_spass_s6): Arena-Plan, Auto in Pipe deterministisch, vCap, Server=Vorhersage, Looping-Magnet, Schalter aus deep-gleich. tests/r4_browser.py, Bilder tests/bilder_r4/. Bitgleich: test_physik, test_looping*, test_spass_s5–s8, test_garage, test_netz 128, test_moto_netz 55.
