// ============================================================
// Jonas Hot Steering Wheel – zentrale Einstellungen
// Alles, was man später leicht ändern will, steht hier.
// Der Namensraum window.Rennspiel bündelt alle Module (keine ES-Module,
// weil die Datei per Doppelklick über file:// geöffnet wird).
// ============================================================
window.Rennspiel = window.Rennspiel || {};

Rennspiel.config = {
  version: '0.1',
  titel: 'Jonas Hot Steering Wheel',
  untertitel: 'Autorennen',

  // --- Fahrer (Namen im Menü, HUD und Ergebnis) ---
  // Neuen Fahrer einfach unten anhängen: { name, emoji }. Emoji = Avatar auf der Karte (keine Fotos/Logos).
  fahrer: [
    { name: 'Emmy',        emoji: '🦁' },
    { name: 'Sara',        emoji: '🌸' },
    { name: 'Jonas',       emoji: '🐯' },
    { name: 'Kerle',       emoji: '🐺' },
    { name: 'Opa',         emoji: '👴' },
    { name: 'Oma',         emoji: '👵' },
    { name: 'Elki',        emoji: '🐘' },
    { name: 'Basti',       emoji: '🐻' },
    { name: 'Schumacher',  emoji: '🏆' },
    { name: 'Senna',       emoji: '🏁' },
    { name: 'Verstappen',  emoji: '🚀' },
    { name: 'Röhrl',       emoji: '⛰️' },
  ],
  fahrerStandard: ['Jonas', 'Emmy'],                         // Spieler 1, Spieler 2
  // Computer-Gegner heißen zuerst so (falls nicht von einem Spieler gewählt), danach die übrigen Fahrer
  fahrerComputerVorrang: ['Schumacher', 'Senna', 'Verstappen', 'Röhrl'],

  // --- Rennen ---
  rennen: {
    rundenStandard: 3,      // Standardwert im Menü
    rundenMin: 1,
    rundenMax: 10,
    gegnerStandard: 3,      // Computer-Autos im Solo-Modus
    gegnerMax: 10,          // Runde 4: bis 10 Gegner (Startaufstellung 2 Spalten, Reihen je 9 m)
    countdownSekunden: 3,
  },

  // --- Schwierigkeit der Computerfahrer ---
  // Reihenfolge im Menü = Reihenfolge hier (und Feld `rang`, 1 = am leichtesten).
  // tempoFaktor:     Anteil des möglichen Ideallinien-Tempos (1.0 = perfekt)
  // gummiband:       0 = aus, 1 = stark (KI hinten schneller, vorne langsamer)
  // gummibandHinten: optional – nur Aufholen (überschreibt gummiband für "KI liegt hinten")
  // fehler:          Lenk-/Tempofehler-Anteil (0 = fehlerfrei)
  // gripBonus:       optional – Faktor auf die Haftung des KI-Autos (nur "unschlagbar")
  // bremsSpaeter:    optional – Faktor auf die geplante Bremsverzögerung (später bremsen)
  // innenSchneiden:  optional – Meter Versatz zur Kurveninnenseite (Kurven schneiden)
  // Zeiten (Runde 2, fliegend, Standard-Auto) stehen im Bericht / test_rundenzeit.js.
  schwierigkeiten: {
    leicht:      { rang: 1, name: 'Leicht',      tempoFaktor: 0.68, gummiband: 0.6,  fehler: 0.25 },
    mittel:      { rang: 2, name: 'Mittel',      tempoFaktor: 0.78, gummiband: 0.5,  fehler: 0.15 },
    schwer:      { rang: 3, name: 'Schwer',      tempoFaktor: 0.85, gummiband: 0.3,  fehler: 0.08 },
    profi:       { rang: 4, name: 'Profi',       tempoFaktor: 0.90, gummiband: 0.2,  fehler: 0.04 },
    meister:     { rang: 5, name: 'Meister',     tempoFaktor: 0.94, gummiband: 0.15, fehler: 0.02 },
    legende:     { rang: 6, name: 'Legende',     tempoFaktor: 0.97, gummiband: 0.1,  fehler: 0.01 },
    unschlagbar: { rang: 7, name: 'Unschlagbar', tempoFaktor: 1.0,  gummiband: 0,    fehler: 0,
                   gummibandHinten: 0.05, gripBonus: 1.05, bremsSpaeter: 1.1, innenSchneiden: 1.5 },
  },
  schwierigkeitStandard: 'mittel',

  // --- Runde 5: Tempo-Klasse (Einstellung tempoKlasse, Spieler und KI gleich) ---
  // Faktoren auf die Katalog-Fahrwerte (vehicle.js rechnet sie beim Anlegen in vehicle.daten ein).
  // normal: 220–270 km/h × 0,7 ≈ 155–190 km/h, etwas sanfter beschleunigen/bremsen; schnell: Katalog.
  tempoKlassen: {
    normal:  { name: 'Normal',  vMax: 0.70, beschleunigung: 0.85, bremsen: 0.9 },
    schnell: { name: 'Schnell', vMax: 1.0,  beschleunigung: 1.0,  bremsen: 1.0 },
  },
  tempoKlasseStandard: 'normal',

  // --- Fahrhilfen (für jüngere Kinder umschaltbar) ---
  // lenkhilfe: zieht zur Straßenmitte/Tangente; bremshilfe: bremst vor zu schnellen Kurven.
  // Ab Runde 3 ist die Lenkhilfe tempounabhängig gedämpft (Vorausblick wächst mit dem Tempo).
  fahrhilfen: {
    aus:    { name: 'Aus',    lenkhilfe: 0.0, bremshilfe: 0.0 },
    wenig:  { name: 'Wenig',  lenkhilfe: 0.3, bremshilfe: 0.2 },
    viel:   { name: 'Viel',   lenkhilfe: 0.7, bremshilfe: 0.5 },
  },
  fahrhilfeStandard: 'wenig',

  // --- Tastenbelegung (event.code, unabhängig vom Tastaturlayout) ---
  tasten: {
    spieler: [
      { gas: 'ArrowUp', bremse: 'ArrowDown', links: 'ArrowLeft', rechts: 'ArrowRight' },
      { gas: 'KeyW',    bremse: 'KeyS',      links: 'KeyA',      rechts: 'KeyD' },
    ],
    zweiLinks: 1,              // v31 (H3): Zweispieler am selben Rechner – Spieler-Index der LINKEN Bildhälfte (1 = WASD links, Pfeile rechts wie auf der Tastatur; 0 = alte Lage)
    resetSpieler1: 'KeyR',     // Auto 1 zurück auf die Strecke
    resetSpieler2: 'KeyT',     // Auto 2 zurück auf die Strecke
    kamera: 'KeyC',            // Kamera wechseln (Verfolger / Cockpit / weit)
    pause: 'Escape',
    vollbild: 'KeyF',
    debug: 'KeyH',             // Debug-Text ein/aus
    ton: 'KeyM',               // Ton an/aus
    bestaetigen: ['Enter', 'Space'],
    // Runde 6 (W3-H, Ölfalle): Item einsetzen (im Rennen; Space ist im Menü „bestätigen", im Rennen frei)
    item1: 'Space',            // Spieler 1
    item2: 'KeyE',             // Spieler 2
  },

  // --- Grafik ---
  grafik: {
    pixelRatioMax: 1.5,        // Solo: Retina-Mac: 2 wäre schärfer, 1.5 spart Leistung
    pixelRatioSplit: 1.0,      // zwei Ansichten: doppelte Geometrie-Arbeit → Pixel sparen
    schatten: false,           // echte Schatten kosten viel; Blob-Schatten unter Autos
    sichtweite: 420,           // Nebel-Ende in Metern
    fov: 62,
    fovSplitScreen: 74,        // Runde 5: 70 → 74 (halbe Breite: Kurven früher sichtbar)
    // Adaptive Qualität: fps über `sekunden` unter fpsUnten → eine Stufe runter
    // (pixelRatio nächster Wert, Nebel-Sichtweite −20 %); über fpsOben → wieder hoch.
    vorwaermen: true,          // 14.10. (v21): beim Rennstart einmal ALLES zeichnen (1 Pixel, ohne Sichtkegel) → Shader/Geometrie/Texturen sind vor dem Countdown auf der GPU (kein Ruckeln später)
    adaptiv: true,
    qualitaetsStufen: [1.5, 1.25, 1.0, 0.8],   // pixelRatio-Stufen (nie über devicePixelRatio)
    fpsUnten: 45,
    fpsOben: 58,
    adaptivSekunden: 2,
    nebelJeStufe: 0.8,         // Sichtweite × 0,8 je Stufe unter der Startstufe
    hudHz: 20,                 // HUD-Texte und Minimap höchstens so oft je Sekunde
    bodenRaster: 100,          // Bodengitter (Felder je Seite, 1600 m); 160 war vorher – 80 sticht im Wald durch die Straße
    dekoZellen: 3,             // große Deko-InstancedMeshes in bis zu 3×3 Stücke teilen (Frustum-Culling je Stück)
  },

  // --- Physik (Einheiten: Meter, Sekunden) ---
  // Runde 3: Höchsttempo 220–270 km/h. Kurvenfahrt ist jetzt durch die Querhaftung begrenzt:
  // maximale Drehrate = querBeschleunigung / Tempo (→ bei hohem Tempo untersteuert das Auto
  // sauber, statt wegzudrehen). Langsam begrenzt weiter fahrwerte.wendigkeit.
  physik: {
    schritt: 1 / 60,           // fester Physikschritt
    maxSchritteProFrame: 4,    // Runde 5: 3 → 4 (bis 15 fps ohne Zeitlupe); Schutz gegen Spirale
    frameVerwerfenMs: 80,      // Runde 5: Frame länger als 80 ms → Rest verwerfen (kein Nachholen = kein Eingabe-Lag)
    querGrip: 16,              // m/s² Querbeschleunigung bei grip 1,0 (Arcade, ~1,6 g)
    abtriebTempo: 110,         // m/s – Querhaftung × (1 + v/abtriebTempo) ("Abtrieb", sonst bei 250 km/h unfahrbar)
    kurvenWiderstand: 0.04,    // Anteil der Querbeschleunigung, der als Bremswirkung (Reifen radieren) wirkt
    kraftAbfall: 0.3,          // Antriebskraft × (1 − kraftAbfall · v/vMax)
    endKraft: 0.2,             // Netto-Beschleunigung bei vMax als Anteil von `beschleunigung` (vMax wird sicher erreicht)
    abseitsBremsen: 22,        // m/s² – so schnell sinkt das Tempo auf den Abseits-Deckel (statt Sprung)
    abseitsUebergang: 1,       // Runde 6: m – über diese Breite hinter dem Randstreifen mischen Rand und Gras/Sand
    // 15.10. (v23) Rückwärts (Bremse/↓ ohne Gas, nach Stillstand): beschleunigung = Mindest-Rückwärtsbeschleunigung m/s² (vorher je Auto 0,8 × min(6, Antrieb) = 3,5–4,8;
    // auf Gras/Sand blieb davon wenig übrig → aus Busch/Gras kaum herauszukommen); gasBremst = Gas während der Rückwärtsfahrt bremst mit höchstens so vielen m/s²
    // (0/fehlt = wie früher: Auto rollt weiter). Grenze für die Rückwärtsfahrt bleibt fahrwerte.rueckwaertsMax.
    rueckwaerts: { beschleunigung: 5.5, gasBremst: 14 },
    abseitsAnfahren: 8,        // Runde 6: m/s – darunter wirkt abseits der Rollwiderstand anteilig (Anfahren aus Gras/Sand bleibt möglich)
    // Runde 5 – Lenkgefühl (vehicle.js drehrateMax/schritt):
    // Drehrate (rad/s) nie unter rateVmax bei vMax bzw. rateHalb bei 50 % vMax (linear im Tempo-Anteil), für ein Auto
    // mit Langsam-Drehrate `bezug` (Passat ≈ 1,8); andere Autos × √(Langsam-Drehrate / bezug).
    // Standard-Auto: vMax ≈ 0,52 rad/s (vorher 0,35–0,44), 50 % ≈ 0,80 rad/s (vorher 0,56–0,75).
    // Über der Haftgrenze: ueberDrift × Überschuss als Rutschen nach außen, ueberBremsen × Überschuss als Bremsung.
    // einschwingen/zurueck: Lenk-Glättung je s (vorher 6/9).
    lenkung: { rateVmax: 0.52, rateHalb: 0.80, bezug: 1.8, ueberDrift: 0.35, ueberBremsen: 0.15, einschwingen: 9, zurueck: 12,
      // v32 (N2, „im Grünen lenkt es kaum"): nur abseits (Untergrund mit vMaxAbs = Gras/Sand), Asphalt/Rand/Öl unverändert.
      // mindest: Drehrate ≥ mindest × Drehrate auf Asphalt (gleiches Auto, gleiches Tempo, gleicher Schaden) – vorher 60 % bei 10 m/s (Standard-Auto),
      //   mit Schaden 55 %; drehMindest: während einer Schleuder-/Rempel-Drehung ≥ drehMindest × Asphalt (vorher Gras × 0,3 = 24 %);
      // hilfeMax: die Lenkhilfe darf einer Lenkung des Spielers höchstens diesen Anteil wegnehmen (vorher bis 88–100 %).
      abseits: { mindest: 0.78, drehMindest: 0.6, hilfeMax: 0.1 } },
    // grip/rollwiderstand: Haftung und Widerstand; vMaxFaktor: Deckel relativ zu vMax
    // (fehlt er: 0,25 + 0,75·grip²); vMaxAbs: zusätzlicher Deckel in m/s
    untergrund: {
      strasse: { grip: 1.0,  rollwiderstand: 1.0 },
      rand:    { grip: 0.85, rollwiderstand: 1.6, vMaxFaktor: 0.8 },        // Randstreifen / Schotter
      // Runde 6 (W1-A2): abseits deutlich langsamer – Gras ≤ 60 km/h, Sand ≤ 50 km/h, Rollwiderstand ×1,5
      // (vorher gras 3,0 / 25 m/s = 90 km/h, sand 3,8 / 22 m/s = 79 km/h). Übergang Rand→Gras weich über
      // physik.abseitsUebergang m (vehicle.untergrundMisch, main.js), Randstreifen bleibt mild.
      gras:    { grip: 0.6,  rollwiderstand: 4.5, vMaxFaktor: 0.5,  vMaxAbs: 60 / 3.6 },   // max 60 km/h
      sand:    { grip: 0.5,  rollwiderstand: 5.5, vMaxFaktor: 0.45, vMaxAbs: 50 / 3.6 },   // max 50 km/h
      // Hindernisse auf der Fahrbahn (Runde 3, von trackBuilder/collisions zu setzen):
      oel:     { grip: 0.25, rollwiderstand: 1.0, vMaxFaktor: 1.0 },        // rutschig (schlingern), kein Tempodeckel
      // v15: Sand auf der Straße bremst deutlich (vorher 6,0 / 0,75): Rollwiderstand ↑, Deckel 50 % von vMax (Normal-Klasse ≈ 84 km/h)
      sandFleck: { grip: 0.55, rollwiderstand: 8.0, vMaxFaktor: 0.5, anfahrenRampe: true },   // anfahrenRampe: unter abseitsAnfahren m/s anteiliger Rollwiderstand (kein Steckenbleiben)
    },
    // v15 – Einfahrt in Öl/Sand-Fleck (vehicle._untergrundEinfahrt, einmal je Wechsel des Untergrunds; deterministisch, kein Zufall)
    schleudern: {
      oel: {
        impuls: 2.0,           // rad/s Drehimpuls bei vRef (klingt mit `abklingen` ab → Drehung ≈ impuls/abklingen rad, bei 100 km/h ≈ 35°)
        vMin: 6,               // m/s (≈ 22 km/h) – darunter keine Drehung („bei Schritttempo kaum")
        vRef: 100 / 3.6,       // m/s – Bezugstempo für `impuls`; Faktor linear von vMin (0) bis vRef (1)
        faktorMax: 1.2,        // Deckel des Tempo-Faktors (kein Überschlag, kein Kreiseln bei 250 km/h)
        abklingen: 3.2,        // 1/s – Drehung klingt exponentiell ab
        weltErhalt: 0.35,      // Anteil der Welt-Bewegung, der bei der Drehung erhalten bleibt (1 = wie Rempler: rutscht voll quer; kleiner = Auto folgt der Nase)
        lenkung: 0.8,          // Anteil der Lenkung, der während der Drehung wirkt (Gegenlenken fängt ab)
        hilfeDaempfung: 0.5,   // Fahrhilfe `viel` (lenkhilfe ≥ hilfeVoll) halbiert den Impuls
        hilfeVoll: 0.7,        // lenkhilfe-Wert, ab dem die volle Dämpfung gilt (config.fahrhilfen.viel)
        lenkSchwelle: 0.15,    // Lenkausschlag, ab dem die Lenkrichtung die Drehrichtung bestimmt
        querSchwelle: 0.3,     // m/s – sonst bestimmt die Querbewegung die Richtung
        hashX: 3, hashZ: 5,    // sonst Positions-Hash floor(x·hashX + z·hashZ) & 1 (deterministisch)
      },
      sand: {
        tempoFaktor: 0.8,      // einmalig −20 % Tempo beim Einfahren in einen Sandfleck
        vMin: 3,               // m/s – im Schritttempo kein Abzug
      },
    },
  },

  // --- Hindernisse auf der Fahrbahn (Runde 3; Platzierung je Strecke in trackCatalog.js) ---
  // laenge/breite in m. gefahr 0..1 = wie dringend die KI ausweicht.
  // untergrund = Schlüssel in physik.untergrund (Werte für Grip/Rollwiderstand stehen dort).
  hindernisse: {
    oel:       { name: 'Ölfleck', untergrund: 'oel', laenge: 9, breite: 5, gefahr: 0.8 },
    sand:      { name: 'Sand', untergrund: 'sandFleck', laenge: 14, breite: 7, gefahr: 0.6 },
    baustelle: { name: 'Baustelle', laenge: 30, vorlauf: 9, pylonenAbstand: 3, pylonRadius: 0.35,
                 pylonTempo: 0.88,       // Tempo × 0,88 beim Umfahren einer Pylone
                 blinkZeit: 0.3,         // s rot blinken, dann weg bis zur nächsten Runde des Verursachers
                 gefahr: 1.0 },
    ast:       { name: 'Ast', dicke: 0.28, tempoFaktor: 0.6, huepfer: 2.2, sperrZeit: 0.8, gefahr: 0.6, stammAnteil: 0.7, randTempoFaktor: 0.8 },   // v29: stammAnteil = fester Teil ab Stammende, Rest überfahrbar
    // Runde 4 (Welt „Hindernisse“, Katalog wracks [{ s, seitenabstand, brennt, autoId }]):
    // liegengebliebenes Auto = feste Kapsel (wie die Bake), schräg um `schraeg` rad (Bug zum Rand),
    // Warnblinker im blinkTakt (s an / s aus), Warndreieck dreieckAbstand m davor.
    wrack:     { name: 'Liegengebliebenes Auto', schraeg: 0.28, blinkTakt: 0.5, dreieckAbstand: 9, gefahr: 1.0 },
    // brennendes Wrack: wie wrack + Flammen/Rauch; Treffer kostet bei Schaden „an“ −10 % (config.schaden.brandVerlust)
    brand:     { name: 'Brennendes Auto', schraeg: 0.28, blinkTakt: 0.5, dreieckAbstand: 12, gefahr: 1.0,
                 flammen: 3, rauchTeilchen: 70, rauchHoehe: 11 },
  },
  // Z1: Zufällige Strecke (Einstellung zufall, Standard AN): Münzen und Hindernisse liegen in jedem Rennen (Rennseed) und in jeder Runde (Neuverteilung,
  // sobald das führende Fahrzeug eine neue Runde beginnt) anders (track/zufall.js). Fenster um jedes Fahrzeug: rueck m hinter, vor m vor dem Fahrzeug –
  // Objekte darin werden NICHT verschoben (kein Aufpoppen), sondern bei einer späteren Gelegenheit (Nachzügler-Ereignis, höchstens alle nachholSekunden s).
  zufall: {
    standardAn: true,
    rueck: 60, vor: 300, durchgaenge: 12, nachholSekunden: 1,
  },
  // 12.10. Hindernis-Menge (Einstellung hindernisMenge): 'normal' = Katalog unverändert (bitgleich wie bisher),
  // 'viele' / 'sehrViele' = Gesamtzahl max(Katalog × faktor, Streckenlänge / meterPro); Wracks gedeckelt (wrackMax), Rest billige Arten,
  // deterministisch erzeugt (trackBuilder.js, fester Seed je Strecke + Menge + Variante). Nur Welten mit Hindernis-Schichten.
  hindernisMenge: {
    standard: 'normal',
    stufen: {
      normal:    { name: 'Normal',    emoji: '🚧', faktor: 1, beschreibung: 'So viele wie immer.' },
      viele:     { name: 'Viele',     emoji: '🚧🚧', faktor: 3, meterPro: 150, minGesamt: 12, beschreibung: 'Dreimal so viele.' },
      sehrViele: { name: 'Sehr viele', emoji: '🚧🚧🚧', faktor: 5, meterPro: 80, minGesamt: 26, beschreibung: 'Fünfmal so viele – Slalom!' },
    },
    startFrei: 120,        // m ab der Startlinie ohne zusätzliche Hindernisse (Startaufstellung + Anfahren)
    zielFrei: 70,          // m vor der Ziellinie ohne zusätzliche Hindernisse (Startaufstellung steht dahinter)
    // 13.10. (v16) Rand-Abstände der Sperrzonen (m, zusätzlich zur Zone selbst) – vorher fest 30/90/16/12/45 …; kleiner = mehr Hindernisse
    // auf Fantasie/Dino. Der Looping-Anlauf (loopingVor 90 m) und Schanzen-Anlauf/Landung bleiben frei.
    zonen: { tunnel: 12, bruecke: 12, ueberf: 20, kreuzung: 12, loopingVor: 90, loopingNach: 14, spuren: 45, schanzeVor: 70, schanzeNach: 50,
      boost: 8, schild: 8, ball: 11, wasser: 8, dino: 14, kleber: 5, lava: 28 },
    abstandSperr: 24,      // m Lücke (Rand zu Rand) zu/zwischen Sperr-Hindernissen (Baustelle, Ast, Wrack) – Zeit zum Ausweichen
    abstandFleck: 10,      // m Lücke zwischen Flecken (Öl, Sand) und allem anderen
    abstandStroh: 24,      // m Lücke bei Strohballen-Bahnen (rollen quer über die ganze Straße)
    wrackMax: 2,           // höchstens so viele zusätzliche Wracks (je ≈ 12 Draw-Calls im Bild)
    slalomChance: 0.3,     // Chance, dass hinter einem Ast/Ölfleck kurz danach ein zweiter auf der anderen Seite folgt
    slalomAbstand: 30,     // m dazwischen (Mitte zu Mitte)
    freiSpur: 4.5,         // m: mindestens so breit bleibt quer immer eine freie Spur (Auto 1,9 m + Luft)
    kurveMax: { baustelle: 1 / 150, ast: 1 / 45, wrack: 1 / 150, oel: 1 / 40, sand: 1 / 40, stroh: 1 / 60 },   // größte Krümmung (1/Radius) dort
    haarnadelVor: 45,      // m vor einer engen Kurve (Radius < haarnadelRadius) keine zusätzlichen Hindernisse
    haarnadelRadius: 32,
    maxVersuche: 40,       // Zufallsversuche je Hindernis im eigenen Abschnitt …
    maxVersucheGlobal: 120, // … dann so viele über die ganze Strecke (13.10.: vorher 40); danach wird es weggelassen
  },
  // Runde 4: Strohballen (Dynamik, Katalog strohballen [{ s, von, intervall, tempo }], nur Welt mit strohballen)
  strohballen: {
    radius: 0.75,              // m (Rundballen 1,5 m Durchmesser)
    breite: 1.25,              // m (Länge der Rolle, liegt längs zur Straße)
    tempo: 5,                  // m/s Standard-Rolltempo quer
    tempoFaktor: 0.5,          // Treffer: Tempo −50 %
    kippZeit: 0.45,            // s kippt der getroffene Ballen um und rutscht zum Rand
    liegenZeit: 3,             // s bleibt er am Rand liegen, dann weg
    ueberstand: 8,             // m: Start/Ende so weit neben der Fahrbahnkante
  },
  // Runde 5b: laufende Dinos (Dynamik, Katalog dinos [{ s, von, intervall, tempo, art }], nur Welt mit dinos)
  dinos: {
    tempo: 4,                  // m/s Standard-Lauftempo quer
    tempoFaktor: 0.4,          // Kontakt: Tempo −60 %
    huepfer: 2.6,              // Hüpfer (vehicle.huepfer, m/s nach oben – nur Optik, wie Ast)
    ueberstand: 12,            // m: Start/Ende so weit neben der Fahrbahnkante (Dino ist lang)
  },
  // Runde 6 (W2-C): Dino-Ausbau – Verhalten der laufenden Dinos, Lava, Krater, Vulkanausbruch, Meteoriten, Flugsaurier
  // (Logik: world/dynamik.js, Lava/Krater-Kontakt: physics/collisions.js hindernisse(), Platzierung: trackCatalog.js dino)
  dino: {
    umkehrChance: 0.3,         // W2-C2: 30 % der Dinos bleiben mitten auf der Straße stehen und kehren um …
    stehenChance: 0.5,         // … von den übrigen bleibt die Hälfte einmal stehen (auf der Fahrbahn oder knapp daneben) …
    stehenMin: 1, stehenMax: 3,  // … für 1–3 s (Kopf gesenkt)
    bruellenMin: 15, bruellenMax: 30,   // W2-C2: jede Dino-Stelle brüllt alle 15–30 s (Ton + Kamerawackler, Kopf hoch)
    bruellenDauer: 1.2,        // s Kopf oben beim Brüllen
    bruellenRadius: 30,        // m: Kamerawackeln nur so nah am Spieler
    bruellenWackeln: 2.5,
    // Lava-Zunge (Hindernis-Typ 'lava'): Kontakt = stopp s festgehalten + Rauch, danach frei s Schonzeit zum Wegfahren
    lava: { laenge: 12, stopp: 1, frei: 2.5, gefahr: 1.0 },
    // Krater (Hindernis-Typ 'krater', entsteht beim Vulkanausbruch): Tempo × tempoFaktor, bleibt dauer s
    krater: { radius: 2.6, tempoFaktor: 0.5, dauer: 20, gefahr: 0.8 },
    // Vulkanausbruch: alle intervallMin–intervallMax s (Seed), grollen s Vorwarnung, dann bomben Lavabomben
    vulkan: { intervallMin: 80, intervallMax: 110, grollen: 3, bomben: 5, bombenAbstand: 0.35, flugZeit: 2.6,
      vorausMin: 50, vorausMax: 200,   // m vor dem führenden Spieler (beim Einschlag; W2-C1: + Fahrweg während des Flugs)
      querMax: 9,                      // m: Landepunkt quer (Fahrbahn ± Rand)
      bombenAbstandS: 30,              // W2-C1: m längs zwischen den Einschlägen eines Ausbruchs (KI/Kind kann ausweichen)
      wackelRadius: 60, wackeln: 5, himmelRot: 0xb0401c, himmelAnteil: 0.7 },
    // Meteoriten (Katalog meteoriten [{ s, von }]): je Runde beim ersten Passieren (Fortschritt des führenden Spielers)
    meteor: { vorlauf: 85, warnZeit: 2, abstand: 15, brockenMin: 3, brockenMax: 5, brockenTempo: 7, kraterDauer: 25,
      wackelRadius: 60, wackeln: 4 },
    // Flugsaurier (Katalog flugsaurier { s0, s1, intervall }): fliegt von vorn an, taucht bis tief m über das Auto
    flugsaurier: { intervall: 40, hoehe: 25, tief: 2.5, tempo: 24, start: 60, breite: 34, duck: 0.6,
      groesse: 1.8 },   // W3-H: Modell ×1,8, Anflug ab 60 m voraus (vorher 170), Schrei beim Auftauchen (doppelt laut in der Nähe), Kamera-Duck 0,6 m (vorher 0,45)
  },
  // Runde 6 (W2-C): Wildtiere im Wald (Katalog tiere [{ art: 'reh'|'baer', s, von, intervall, tempo }], Schicht „dinos")
  tiere: {
    reh: { tempo: 6, tempoFaktor: 0.6, huepfer: 2.0, radius: 0.9, sprungHoehe: 0.6, sprungWeite: 3.2,   // W2-C2: Sprung 0,6 m (Reh kleiner)
      schauenChance: 0.5, schauenMin: 0.8, schauenMax: 1.6 },
    baer: { tempo: 3, tempoFaktor: 0.4, huepfer: 2.4, radius: 1.3 },
    ueberstand: 9,             // m: Start/Ende so weit neben der Fahrbahnkante
    grasendeRehe: 3,           // Deko-Rehe (grasen hinter dem Zaun), auch in Welt Klassisch
  },

  // --- Runde 4: Schaden (Einstellung, Standard aus → keinerlei Wirkung). Logik: src/physics/schaden.js ---
  // Treffer kostet trefferVerlust (5 %) – nur ab Mindest-Stoßstärke (m/s) je Art, höchstens einmal je abklingZeit s
  // und Fahrzeug (Schleifen an der Bande zählt nicht dauernd). Je volle stufeJe (20 %) Verlust: Stufe +1 →
  // vMax × (1 − vMaxJeStufe·Stufe), beschleunigung × (1 − beschleunigungJeStufe·Stufe), grip × (1 − gripJeStufe·Stufe).
  // Unter rauchUnter Rauch aus der Motorhaube, unter qualmUnter dunkler Qualm + Warnblinker,
  // 0 % = liegengeblieben: liegenZeit s Stillstand, dann Abschleppen zum letzten Checkpoint mit resetProzent.
  schaden: {
    standardAn: false,
    trefferVerlust: 5,         // Prozentpunkte je Treffer
    brandVerlust: 10,          // Prozentpunkte bei Treffer eines brennenden Wracks
    // Runde 6 (W1-A4/A5): auto 2 → 1 m/s; neu pflanze (Baum/Fels zwischen Straße und Zaun)
    mindest: { bande: 3, auto: 1, hindernis: 0, ast: 0, brand: 0, ball: 0, wasser: 0, stroh: 0, pflanze: 0, nass: 0 },
    // Runde 6: eigene Verluste je Art (fehlt eine Art: trefferVerlust); drehung = Zuschlag, wenn ein Rempler das
    // Auto in Drehung versetzt (kommt im selben Treffer dazu → −8 %)
    verluste: { bande: 3, pflanze: 3, nass: 10, ast: 10 },   // v29: ast = überfahrener Astrand   // 15.10. (v24): nass = offenes Cabrio-Dach bei Regen/Schnee/Hagel (config.dachRegen)
    drehungVerlust: 3,
    abklingZeit: 0.7,
    stufeJe: 20,
    vMaxJeStufe: 0.04, beschleunigungJeStufe: 0.06, gripJeStufe: 0.03,
    rauchUnter: 40, qualmUnter: 20,
    // 14.10. (v18): Liegenzeit = Abschleppwagen-Ablauf (siehe `abschlepp`): kommt (anfahrt), lädt auf (aufladen), fährt weg (Rest).
    liegenZeit: 5.5,
    // Sichtbarer Abschleppwagen (src/world/abschleppwagen.js, nur Optik – die Zeiten bestimmt schaden.js): nach dem Liegenbleiben fährt er
    // anfahrt s lang aus anfahrtWeg m Entfernung heran und hält neben dem Auto, lädt es aufladen s lang per Kran auf die Ladefläche, fährt
    // mit ihm los (Rest der liegenZeit, abfahrtWeg m) – beim Ende der Liegezeit wird das Auto am Reset-Punkt repariert. hupeBei = Sekunden nach
    // dem Liegenbleiben, zu denen das Ereignis 'abschleppwagen' (Meldung „Abschleppwagen kommt!“ + Hupe) kommt.
    abschlepp: { an: true, anfahrt: 2.5, aufladen: 1.5, hupeBei: 0.6, anfahrtWeg: 38, abfahrtWeg: 34, seitlich: 3.6, ladeHoehe: 1.15, kranHoehe: 3.9 },
    // Runde 7 (Abschlepp-Reparatur): Nach dem Abschleppen steht das Auto am Checkpoint und wird REPARIERT: Anzeige springt
    // von 0 % in 10er-Schritten, je 10 % genau reparaturJe10 Sekunden (Sprünge statt stetig: für Kinder klar zählbar „1 Sekunde = 10 %“).
    // Spieler: ab losfahrenAb (30 %) beendet Gas die Reparatur sofort, das Auto behält den erreichten Wert; darunter ist Gas
    // gesperrt (Hinweis im HUD). Wer wartet, bekommt bis 100 % (Reparatur endet dann von selbst).
    // Computer-Autos warten bis kiLosfahrenAb (60 %) und fahren dann los (Balance wie bisher: früher 60 % nach 5 s).
    // reparaturJe10 = 0 → Reparatur AUS: altes Verhalten (sofort resetProzent). Gilt nur fürs Abschleppen nach Liegenbleiben.
    // 14.10. (v18): 10 % = 3 s (Wunsch des Vaters; vorher 1 s) → Losfahren ab 30 % nach 9 s, 100 % nach 30 s.
    // KI-Grenze 60 → 40 %: Mit 3 s je 10 % stünde ein Computer-Auto 18 s (60 %) + 5,5 s Abschleppen = 23,5 s; ein Mensch, der sofort ab 30 % losfährt,
    // steht nur 5,5 + 9 = 14,5 s. 40 % → 12 s + 5,5 = 17,5 s (≈ 1,2 × Mensch-Minimum statt 1,6×). Gleiches Verhältnis wie früher (11 s KI / 8 s Mensch).
    reparaturJe10: 3, losfahrenAb: 30, kiLosfahrenAb: 40,
    reparaturTon: true,        // leises Pling je 10 % (nur Spieler)
    resetProzent: 60,          // nur noch Fallback/Doku: wirkt NUR bei reparaturJe10 = 0 (Reparatur aus)
    blinkTakt: 0.5,
    rauchTeilchen: 36,
  },

  // --- 14.10. (v18): Werkstatt (Boxenplatz neben der Fahrbahn, src/world/garage.js; NUR bei Schaden „an“, sonst gibt es sie nicht) ---
  // (Der Abschnitt heißt `werkstatt`, weil `config.garage` schon die Auto-Garage mit Münzen ist.)
  // Wer auf der Parkfläche steht (Tempo < steheTempo m/s), bekommt prozentProSekunde % je Sekunde bis 100 %; einmal je Runde
  // (nach dem ersten Heilen gilt die Werkstatt in dieser Runde für dieses Auto als benutzt). Platz: gerade Stelle (Krümmung < maxKruemmung 1/m
  // über das ganze Fenster) ab sucheAb m nach Start/Ziel, Fläche laenge × breite neben dem Randstreifen, Gebäude dahinter.
  // KI (Computer-Autos, Autopilot): fährt hin, wenn ihr Wert < kiUnter % ist, steht bis kiBis % (höchstens kiMaxWarten s).
  werkstatt: {
    prozentProSekunde: 15,
    steheTempo: 1.0,           // m/s – darunter gilt ein Auto als stehend
    laenge: 35, breite: 6.4,   // m – Parkfläche (längs × quer); 15.10. (v25) von 13 auf 35 m („Zone deutlich länger“, Wunsch des Vaters), 4 Boxen
    zweiteAb: 6000,           // m – Strecken länger als das (Megastrecke ≈ 8 km) bekommen eine zweite Werkstatt gegenüber der ersten (Heil-Regel „1× je Runde“ gilt für beide zusammen)
    boxLaenge: 9,              // m – Richtwert je Box (Anzahl Boxen = Länge / boxLaenge, mindestens 2)
    zufahrt: 18, ausfahrt: 10, // m – weicher Asphalt-Keil vor/hinter der Fläche (Straßenrand → Fläche), Untergrund ohne Gras-Bremsen
    randAbstand: 1.4,          // m Gras zwischen Randstreifen und Parkfläche
    gebaeudeTiefe: 5.5, gebaeudeBreite: 31, gebaeudeHoehe: 4.4,   // Halle so lang wie die Fläche (höchstens laenge − 2)
    nurMitSchaden: true,       // true (Standard, wie bisher): Werkstatt gibt es nur bei Einstellung „Schaden an“; false: steht auch bei „Schaden aus“ (Kulisse, ohne Wirkung)
    sucheAb: 85, maxKruemmung: 0.0022, hindernisAbstand: 8, sperrAbstand: 40,
    kiUnter: 40, kiBis: 100, kiMaxWarten: 9, kiVorlauf: 90, kiTempo: 22, kiBremse: 6,
    melden: 60,                // m vor der Einfahrt: HUD-Hinweis „Werkstatt voraus“ (nur Spieler mit Schaden)
  },

  // --- 14.10. (v20): Kurvenschilder (src/world/schilder.js) – Straßenschilder vor jeder nennenswerten Kurve ---
  // Kurve = zusammenhängende Strecke mit Radius < radiusMax (gleiche Richtung); „nennenswert“ = Winkel ≥ minWinkel und Ideallinien-Tempo
  // (strecke.tempoBei) < nennenswertAnteil × Höchsttempo der Tempo-Klasse (refKmh × tempoKlassen[k].vMax). Schild 60–120 m vor dem Kurvenbeginn
  // (Abstand ≈ abstandSek × Anfahrtstempo), rechts neben der Fahrbahn. Tempo = tempoBei an der engsten Stelle, auf 10 km/h gerundet, höchstens
  // das Höchsttempo der Klasse. Folgen Kurven näher als gruppeAbstand aufeinander, steht EIN Schild (Doppelkurve bzw. engstes Tempo).
  // Haarnadel (Winkel ≥ haarnadelWinkel): zusätzlich Leitpfeil-Tafeln an der Kurvenaußenseite. massstab vergrößert die Schilder (gut lesbar).
  kurvenschilder: {
    an: true,
    massstab: 3.0,             // 1 = Originalgröße (Dreieck 0,9 m Seite, Tempo-Scheibe 0,6 m); 2 = doppelt so groß
    radiusMax: 200,            // m – Kurvenbeginn/-ende: |Krümmung| > 1/radiusMax
    minWinkel: 25,             // ° Richtungsänderung, ab der eine Kurve ein Schild bekommt
    refKmh: 260, nennenswertAnteil: 0.75,
    abstandMin: 60, abstandMax: 120, abstandSek: 2.4, abstandSuche: 5,   // m vor Kurvenbeginn; Suche in 5-m-Schritten nach einem freien Platz
    abstandNot: 30, sperreNot: 12,   // Notlösung, wenn im Wunschbereich kein freier Platz ist: ab 30 m vor der Kurve, nur 12 m Sperrabstand
    gruppeMax: 280, abstandKette: 30,   // längere Kurvenfolgen werden in Stücke von höchstens gruppeMax m geteilt (je Stück ein Schild, ab abstandKette m davor)
    gruppeAbstand: 75,         // m zwischen Kurvenende und nächstem Kurvenbeginn, darunter ein gemeinsames Schild
    mindestAbstandSchilder: 40,// m (in s) zwischen zwei Schild-Masten
    lage: 'rand',              // 'rand' = knapp neben dem Randstreifen (abstandRand m; nie weiter weg als die Bande) | 'bande' = außerhalb der Bande
    abstandRand: 3.2,          // m neben dem Randstreifen (lage 'rand')
    abstandBande: 1.2,         // m hinter der Bande (lage 'bande')
    startFreiVor: 70, startFreiNach: 30,   // m vor/nach Start/Ziel ohne Schilder
    sperre: 30,                // m Abstand zu Brücke, Tunnel, Überführung, Kreuzung, Gabelung, Looping, Schanze
    haarnadelWinkel: 130, haarnadelKmh: 80, leitpfeilAbstand: 24,
    mastKollision: true,       // 14.10. (v21): der dünne Mast ist ein festes Hindernis (strecke.saeulen, auch im Server); nur der Mast, nicht das Schild
    mastRadius: 0.12,          // m
  },

  // --- 15.10. (v25): Zuschauertribünen (src/world/tribuenen.js) auf Wiese, Wüste, Fantasie (+ deren Abschnitte der Megastrecke) ---
  // „Baue noch Zuschauertribünen bei Wüste, Wiese, Fantasie, ungefähr 5 je Strecke, auch in Kurven, dort wo Zuschauertribünen sind auch mit Akustik.“
  // Je Strecke ~anzahl (5; lange Strecken bis anzahlMax): 1 am Start/Ziel, mindestens kurvenMin an Kurven-Außenseiten, Rest auf Geraden.
  // Lage hinter der Bande (abstandBande m), nie in Sperrzonen. an: false schaltet Tribünen UND Publikum-Akustik ab.
  tribuenen: {
    an: true,
    themen: ['wiese', 'wueste', 'fantasie', 'wald', 'dino', 'alpen'],     // Strecken-Themen mit Tribünen (Megastrecke: diese Abschnitte)
    nurStart: ['wald', 'dino', 'alpen'],         // v28 W9: diese Themen bekommen NUR die Start/Ziel-Tribüne (Megastrecke: deren Abschnitte keine; die Tribüne am Mega-Start steht im Start-Abschnitt)
    startMaxHang: 4.5,                           // m: größter Höhenunterschied der Standfläche für diese Start-Tribünen (Alpen-Hang)
    anzahl: 5, refLaenge: 3300, anzahlMin: 5, anzahlMax: 8, megaMin: 2,   // Anzahl = anzahl × Länge / refLaenge (mindestens anzahlMin, höchstens anzahlMax)
    kurvenAnteil: 0.4, kurvenMin: 2, kurveWinkelMin: 35,                 // Kurventribünen: Anteil, Mindestzahl, Mindest-Kurvenwinkel (°)
    laenge: [30, 40], reihen: [5, 8],            // m / Sitzreihen
    reiheTiefe: 0.9, reiheHoehe: 0.5, vorne: 1.6, hinten: 1.4,
    abstandBande: 3.0,                           // m hinter der Bande (Sicherheitsabstand)
    abstandMin: 130, abstandWelt: 70,            // m Mindestabstand zweier Tribünen (entlang s / Luftlinie)
    maxHang: 2.2,                                // m größter Höhenunterschied der Standfläche
    sperre: 14, sperreHindernis: 6,              // m Abstand zu Tunnel/Brücke/Überführung/Kreuzung/Gabelung/Looping/Schanze bzw. Hindernissen
    dekoAbstand: 4,                              // m: Pflanzen/Felsen/Deko halten diesen Abstand zur Tribüne
    kollision: true, kollisionRadius: 1.9,       // feste Säulen entlang der Vorderkante (strecke.saeulen, auch im Server)
    zuschauer: { an: true, dichte: 0.85 },       // Anteil besetzter Plätze
    fahnen: true, text: 'JONAS HOT STEERING WHEEL',
    jubelAbklingen: 1.6,                         // s: Zuschauer-Jubel klingt ab (Optik)
    // Akustik (WebAudio-Synthese, src/audio/publikum.js): Rauschen/Murmeln, Klatschen, „Ohhh“-Formant; Lautstärke nach Abstand, links/rechts
    akustik: {
      an: true, stimmen: 3,                      // gleichzeitig hörbare Tribünen (nächste zuerst)
      hoerweite: 170, nah: 30,                   // m: ab hoerweite stumm, bis nah voll
      pegel: 0.55,                               // Gesamtlautstärke des Publikums
      grund: 0.5,                                // Grundrauschen (Anteil von pegel) bei voller Nähe
      jubelNah: 65, jubelPause: 5, jubelMinTempo: 9,   // Vorbeifahrt: Jubel ab so nah (m), Pause je Tribüne (s), ab Tempo (m/s)
      ueberholen: true, ziel: true,              // Extra-Jubel bei Überholmanövern (Platz verbessert) und Zieleinlauf/Runde
      takt: 0.1,                                 // s: Aktualisierungs-Takt (CPU)
    },
  },

  // --- Runde 6 (W1-A3/A4/A5): Kollisionen Auto↔Auto, Rempeln, Pflanzen (Logik: src/physics/collisions.js) ---
  // Autos = gedrehte Rechtecke (laenge × breite), Trennung per SAT in `teilschritte` Durchgängen, danach `mindestAbstand` m Luft.
  // rempeln 'sanft' (Standard) = nur Abstoßung wie bisher; 'echt' = je nach Treffer Drehung / Abdrängen / Nebeneinander-Schieben.
  kollision: {
    teilschritte: 2,
    mindestAbstand: 0.1,       // m Luft nach der Auflösung
    restitution: 0.3, reibung: 0.3,
    loopingAbstand: 0.1,       // m Luft zwischen zwei Autos im selben Looping (Bogenlänge)
    loopingMinTempo: 1.0,      // v31: das hintere Auto wird im Looping nie unter 1,0 × nötiges Tempo (sqrt(g·r·(3+2·cos w))) gebremst
    hoeheTrennung: 2,          // Runde 6 (W4-I): ab |Δy| ≥ 2 m keine Auto-Auto-Kollision (übereinander an einer Überführung)
    rempeln: {
      standard: 'sanft',
      flachGrad: 15,           // < 15° zwischen den Autos: nebeneinander schieben, keine Drehung
      schraegGrad: 45,         // 15–45° von hinten: Opfer wird abgedrängt (Querimpuls)
      querMin: 3, querMax: 6,  // m/s Querimpuls beim Abdrängen (× Massenverhältnis)
      drehMax: 4.7,            // rad/s – klingt in ~1 s ab (exp, drehAbklingen) → höchstens ≈ 90°
      drehMin: 1.0,            // rad/s – darunter keine Drehung
      drehFaktor: 1.6,         // Arcade-Verstärkung des Drehimpulses (Hebelarm × Stoß / Trägheitsmoment × drehFaktor)
      drehAbklingen: 3,        // 1/s
      drehLenkung: 0.3,        // Lenkung wirkt während der Drehung nur zu 30 %
      sperrZeit: 0.6,          // s – je Auto höchstens ein Rempel-Effekt
      mindestTempo: 1,         // m/s Annäherung, ab der ein Rempler wirkt
      kiAbRang: 4,             // KI ab Stufe profi darf gezielt rempeln
      kiAbstand: 6, kiVersatz: 1.5, kiPause: 10, kiLenkung: 0.35, kiDauer: 0.35,
    },
  },
  // Pflanzen/Felsen zwischen Straße und Zaun (Kreis-Kollider aus den Deko-Instanzen, nur Physik):
  // fest → wie eine Säule (Stoß, −3 % bei Schaden an), weich → Tempo × weichTempo (kein Schaden).
  pflanzen: {
    fest: ['Baeume', 'Tannen', 'Laubbaeume', 'Baumstuempfe', 'Felsen', 'Kakteen', 'Palmen', 'Riesenpilze', 'Zuckerbaeume'],
    weich: ['Buesche', 'Farne', 'Gestruepp', 'Riesenfarne', 'Kugelkakteen', 'Pilze', 'Heuballen'],
    zugabe: 2,                 // m: gesammelt wird bis grenzeBei(s) + zugabe
    fussHoehe: 0.9,            // m über dem Boden: nur dieser Teil der Geometrie zählt (Stamm statt Krone)
    rMin: 0.25, rMaxFest: 3, rMaxWeich: 2.5,
    weichTempo: 0.7, weichSperre: 0.8,
  },

  // --- Fantasie-Strecke (Runde 3): Looping, Bälle, Wasserstrahl ---
  // Platzierung je Strecke in trackCatalog.js (loopings / baelle / wasserstrahlen), Logik in
  // src/track/looping.js und src/world/dynamik.js.
  fantasie: {
    looping: {
      versatz: 10,             // m: Ausfahrt liegt so weit hinter der Einfahrt (am Boden läuft die Straße weiter)
      seitenVersatzAnteil: 0.6, // Helix: seitlicher Versatz über die Runde = Fahrbahnbreite × 0,6
      bandBreite: 7.2,         // m Fahrbahnband im Looping (ohne Randsteine)
      vMinFaktor: 5,           // Mindest-Einfahrtstempo vMin = sqrt(vMinFaktor · g · r) (5 → oben genau sqrt(g·r))
      gasAnteil: 0.5,          // Gas im Looping: × Beschleunigung des Autos (gedrosselt)
      bremsVerz: 6,            // m/s² Bremse im Looping
      reibung: 0.5,            // m/s² Roll-/Reifenreibung im Looping
      luft: 0.002,             // × v² (m/s²) Luftwiderstand im Looping
      fallDauer: 0.9,          // s: Auto "fällt" sanft zurück zur Einfahrt
      zurueck: 6,              // m vor der Einfahrt wird ein gefallenes Auto abgesetzt
      kameraNachlauf: 0.5,     // rad: Verfolger-Kamera so weit hinter dem Auto auf dem Kreis
      fangRand: 1.0,           // v31 (H1): Einstiegsfang – Auto-Mitte höchstens bandHalb − 1,0 m von der Bandmitte (Auto-Halbbreite)
      fangWinkel: 0.22,        // rad (≈ 12,6°, Höhe ≈ 0,3 m): bis hierhin wird das Fenster stetig enger, danach liegt das Auto im Band
      fangVor: 60,             // v31: m vor der Einfahrt, auf denen das Auto schon auf der Geraden in die Einstiegsspur geschoben wird
      fangZeit: 1.3,           // s: bei hohem Tempo beginnt der Fang entsprechend früher (Strecke = max(fangVor, Tempo · fangZeit))
      fangRate: 9,             // v31 H1d: m/rad, mit denen der Abstand zur Bandmitte im Looping schmilzt (≙ ≤ 0,5 m je Schritt bis 40 m/s; mind. 60°)
      fangMaxWinkel: 1.4,      // rad (80°): länger darf das Gleiten nicht dauern, sonst harter Fang (Fenster ab fangWinkel)
      fangWeg: 5,              // m/s (geglättet): fährt ein Computerauto schneller als das vom Band weg (echtes Ausweichen), schiebt fuehren() nicht
      fangSchritt: 0.4,        // m: höchstens so viel Querversatz je Physikschritt beim Einfangen
      kameraVoraus: 0.3,       // rad: Blickpunkt so weit vor dem Auto (Blick fast tangential → Boden kopfüber sichtbar)
    },
    baelle: {
      tempoFaktor: 0.4,        // Treffer: Tempo −60 %
      flugZeit: 1.2,           // s fliegt ein getroffener Ball weg, dann verschwindet er
      ueberstand: 12,          // m: Bälle starten/enden so weit neben der Fahrbahnkante
      warnAbstand: 100,        // m: Warnschild "Bälle!" so weit vor der Ballstelle
    },
    wasser: {
      tempoFaktor: 0.6,        // Treffer: Tempo −40 %
      schlingern: 6,           // m/s Quer-Impuls (vQuer) bei einem Treffer
      radius: 2.2,             // m Trefferradius um die Düse
      hoehe: 8,                // m Höhe der Fontäne
    },
  },

  // --- Runde 4: Jahreszeiten (Farben, Licht, erlaubtes Wetter; Logik in src/world/wetter.js) ---
  // Standard = sommer → Spiel sieht aus wie vor Runde 4 (alle Mischanteile 0, Faktoren 1).
  // *Misch: [Farbe, Anteil 0..1] – die Themenfarbe wird so weit zur Farbe hin gemischt.
  // laub: Farben der Laubbaum-Kronen (zufällig gemischt), null = Themenfarben behalten.
  // bluete: zusätzlich Blütenbäume (Anteil bluetenAnteil). tanneMisch/buschMisch: Tannen/Büsche/Farne.
  // randSchnee: graue Randsteine werden weiß (Schneeränder). sonnenHoehe: Grad über dem Horizont
  // (null = Licht wie bisher), lichtFarbe: Sonnenfarbe (null = Thema), lichtFaktor: × Helligkeit.
  // wetter: erlaubte Wetter (Menü 'zufall' wählt daraus); wetterWueste: dasselbe für das Thema Wüste.
  jahreszeitStandard: 'sommer',
  jahreszeiten: {
    fruehling: { name: 'Frühling', emoji: '🌷',
      laub: [0x7cc04a, 0x8fd35a, 0x6fb341, 0x9bdc6a], bluete: [0xffb7d5, 0xffc9e3, 0xfff0f6, 0xff9fc6], bluetenAnteil: 0.3,
      tanneMisch: null, buschMisch: [0x8fd35a, 0.35], bodenMisch: [0x7fc24a, 0.25],
      himmelMisch: [0xb8e0ff, 0.3], nebelMisch: [0xdcefff, 0.35], sichtweiteFaktor: 0.9,
      sonnenHoehe: 40, lichtFarbe: 0xfff8e8, lichtFaktor: 1.0,
      wetter: ['klar', 'regen'], wetterWueste: ['klar', 'regen'] },
    sommer: { name: 'Sommer', emoji: '☀️',
      laub: null, bluete: null, bluetenAnteil: 0, tanneMisch: null, buschMisch: null, bodenMisch: null,
      himmelMisch: null, nebelMisch: null, sichtweiteFaktor: 1, sonnenHoehe: null, lichtFarbe: null, lichtFaktor: 1,
      wetter: ['klar', 'regen'], wetterWueste: ['klar', 'sandsturm'] },
    herbst: { name: 'Herbst', emoji: '🍂',
      laub: [0xe8742a, 0xf0ad35, 0xd8452a, 0xf6d457, 0xc9622a, 0x8fae42], bluete: null, bluetenAnteil: 0,
      tanneMisch: null, buschMisch: [0xb8762e, 0.5], bodenMisch: [0x9a8a3a, 0.3],
      himmelMisch: [0xc8cfd6, 0.35], nebelMisch: [0xd4d2c8, 0.55], sichtweiteFaktor: 0.75,
      sonnenHoehe: 30, lichtFarbe: 0xffdcae, lichtFaktor: 0.92,
      wetter: ['klar', 'regen', 'hagel', 'nebel'], wetterWueste: ['klar', 'regen', 'sandsturm'] },
    winter: { name: 'Winter', emoji: '⛄',
      laub: [0xeef2f6, 0xdfe6ec, 0xc9d2da, 0x8f7f70], bluete: null, bluetenAnteil: 0,
      tanneMisch: [0xf4f8fb, 0.55], buschMisch: [0xf2f6fa, 0.6], bodenMisch: [0xf3f6fa, 0.82], randSchnee: true,
      himmelMisch: [0xdde6ee, 0.45], nebelMisch: [0xe8eef4, 0.6], sichtweiteFaktor: 0.8,
      sonnenHoehe: 18, lichtFarbe: 0xdfe9ff, lichtFaktor: 0.85,
      // Wüste: kein Schnee – statt Winter Sandsturm-Zeit (Farben bleiben Wüste, nur Licht flacher)
      wueste: { laub: null, tanneMisch: null, buschMisch: null, bodenMisch: null, randSchnee: false,
                himmelMisch: [0xf2dcae, 0.2], nebelMisch: null, sichtweiteFaktor: 1 },
      wetter: ['klar', 'schnee', 'hagel'], wetterWueste: ['klar', 'sandsturm'] },
  },

  // --- Runde 4: Wetter (Wirkung auf Fahrphysik über vehicle.schritt(dt, s, hilfe, umwelt)) ---
  // gripFaktor: × Haftung (auch Kurventempo/KI-Planung), bremsFaktor: × Bremsverzögerung,
  // sichtweiteFaktor: × Nebel-Sichtweite, nebelNah: Nebel-Beginn als Anteil der Sichtweite (Standard 0,55),
  // nebelFarbe/himmelMisch: [Farbe, Anteil], lichtFaktor: × Sonne/Himmel, wolkenDecke: graue Wolken, Sonne weg.
  // partikel: { art: 'striche'|'flocken'|'koerner'|'sand'|null, anzahl, tempo m/s, groesse m, farbe }
  // geraeusch: Name für R.Audio.wetter(…) (null = still).
  wetterStandard: 'klar',
  wetter: {
    klar:      { name: 'Klar',      emoji: '',   gripFaktor: 1,    bremsFaktor: 1,   sichtweiteFaktor: 1,
                 lichtFaktor: 1, wolkenDecke: false, partikel: null, geraeusch: null },
    regen:     { name: 'Regen',     emoji: '🌧️', gripFaktor: 0.85, bremsFaktor: 0.8, sichtweiteFaktor: 0.7,
                 himmelMisch: [0x8e99a4, 0.65], nebelFarbe: [0x9aa3ab, 0.7], lichtFaktor: 0.7, wolkenDecke: true,
                 partikel: { art: 'striche', anzahl: 2500, tempo: 19, groesse: 0.55, farbe: 0xd2deea }, geraeusch: 'regen' },
    schnee:    { name: 'Schnee',    emoji: '❄️', gripFaktor: 0.6,  bremsFaktor: 0.6, sichtweiteFaktor: 0.6,
                 himmelMisch: [0xc4ccd4, 0.6], nebelFarbe: [0xdde3ea, 0.75], lichtFaktor: 0.8, wolkenDecke: true,
                 partikel: { art: 'flocken', anzahl: 1500, tempo: 1.6, groesse: 0.22, farbe: 0xffffff }, geraeusch: 'schnee' },
    hagel:     { name: 'Hagel',     emoji: '🌨️', gripFaktor: 0.75, bremsFaktor: 0.7, sichtweiteFaktor: 0.75,
                 himmelMisch: [0x7d8792, 0.6], nebelFarbe: [0x9aa1a8, 0.6], lichtFaktor: 0.7, wolkenDecke: true,
                 partikel: { art: 'koerner', anzahl: 1200, tempo: 15, groesse: 0.13, farbe: 0xf2f6ff }, geraeusch: 'hagel' },
    nebel:     { name: 'Nebel',     emoji: '🌫️', gripFaktor: 1,    bremsFaktor: 1,   sichtweiteFaktor: 0.38, nebelNah: 0.12,
                 himmelMisch: [0xd0d4d6, 0.75], nebelFarbe: [0xd0d4d6, 0.85], lichtFaktor: 0.82, wolkenDecke: true,
                 partikel: null, geraeusch: null },
    sandsturm: { name: 'Sandsturm', emoji: '🌪️', gripFaktor: 0.9,  bremsFaktor: 0.9, sichtweiteFaktor: 0.3, nebelNah: 0.05,
                 himmelMisch: [0xd9a05a, 0.75], nebelFarbe: [0xd39a55, 0.9], lichtFaktor: 0.8, wolkenDecke: true,
                 partikel: { art: 'sand', anzahl: 3200, tempo: 22, groesse: 0.2, farbe: 0xe6b878 }, geraeusch: 'wind',
                 windMin: 3 },       // Sandsturm ohne Wind wäre seltsam: mindestens Stufe 3
  },
  // Wind: Stärke 0–5 (Standard 0 = aus), Richtung fest je Rennen ('zufall' = aus dem Seed).
  // seitK: seitliche Beschleunigung = seitK · Stufe · Tempo (m/s²), gierK: Drehrate = gierK · Stufe · Tempo (rad/s)
  //   → Stufe 5 bei 200 km/h ohne Gegenlenken ≈ 3–4 m Versatz in 3 s, Stufe 1 ≈ 0,7 m (kaum).
  // vMaxJeStufe: Gegenwind −3 %, Rückenwind +3 % Höchsttempo je Stufe (Projektion auf die Fahrtrichtung).
  wind: { staerkeStandard: 0, staerkeMax: 5, richtungStandard: 'zufall', seitK: 0.019, gierK: 0.000036, vMaxJeStufe: 0.03 },

  // --- 15.10. (v24): Cabrio-Dach bei Niederschlag (src/cars/dachregel.js, Verdrahtung in main.js physikSchritt; Anleitung: ANLEITUNG.md „Cabrio und Regen“) ---
  // Gilt für jedes Auto mit Verdeck (Katalog form.dach = T-Roc Cabrio) bei Regen, Schnee und Hagel (wie die Scheibenwischer; Nebel/Sandsturm zählen nicht).
  // Offenes Dach bei Niederschlag: alle strafeAlle s −strafeProzent % Gesundheit (Schaden an: Schadensystem, Art 'nass'; Schaden aus/online: eigener
  // Wert dachL.gesund mit denselben Stufen-Faktoren auf Tempo und Beschleunigung, nie unter mindestGesund %). Dach schließen/öffnen = dauer s Stillstand
  // (Gas gesperrt, das Auto steht), nur im Stand (< stand m/s). KI-Cabrios (Gegner mit Dach offen) halten bei Niederschlag an einer geeigneten Stelle an.
  dachRegen: { an: true, dauer: 3, strafeAlle: 60, strafeProzent: 10, stand: 0.5, mindestGesund: 10,
    kiBremsPlan: 6,          // m/s²: geplante Verzögerung der KI beim Anhalten (Nässe → vorsichtig, weit unter der Bremsleistung)
    kiVorlauf: 70,           // m: Reserve hinter dem Bremsweg bis zum frühesten Haltepunkt (Zeit, um an den Fahrbahnrand zu fahren)
    kiSchritt: 15,           // m: Suchschritt für den Haltepunkt
    kiMaxSuche: 900,         // m: weiter voraus wird kein Haltepunkt gesucht (dann weiterfahren und später erneut)
    kiHaltZeit: 12 },        // s: höchstens so lange bremsen, dann zählt „fast steht“ (< 2 m/s) schon als Haltepunkt (nie ewig im Stau)

  // --- Runde 6 (W2-D): Tageszeit 'tag' (Standard = Licht wie bisher, bitgleich) | 'daemmerung' | 'nacht' ---
  // Nur Optik (world/wetter.js anwenden, main.js Scheinwerfer/Laternen). Farben je Thema überschreibbar (Schlüssel = Themenname).
  // himmel: [oben, Mitte, Horizont] (Himmelskuppel, 1 Draw-Call), nebel: Nebel-/Hintergrundfarbe, sichtweiteFaktor: × Sichtweite,
  // sonne: { farbe, intensitaet, hoehe (Grad) } (Nacht: schwaches Mondlicht), halbkugel: { himmel, boden, intensitaet } (absolut,
  // × Jahreszeit-/Wetter-Lichtfaktor), wolken: [Farbe, Eigenleuchten], wetterHell: Wetter-Mischfarben (Regen-Grau …) × Helligkeit,
  // partikelMisch: Niederschlag Richtung Nebelfarbe, sterne/mond: Nacht-Himmel, autoLicht: Scheinwerfer/Rücklichter leuchten,
  // echteScheinwerfer: SpotLights an den Spielerautos (dieselben wie im Tunnel), laternen: Straßenlaternen (Thema laternen: true),
  // markierung/randstein: Eigenleuchten der Mittellinie/Randsteine, ballonsLeuchten: Fantasie-Ballons leuchten.
  tageszeitStandard: 'tag',
  tageszeit: {
    tag: { name: 'Tag', emoji: '' },
    daemmerung: { name: 'Dämmerung', emoji: '🌇',
      himmel: [0x4b3f8f, 0xc76d8c, 0xff9a52], nebel: 0xe8946a, sichtweiteFaktor: 0.92,
      sonne: { farbe: 0xff8a3c, intensitaet: 0.7, hoehe: 11 },
      halbkugel: { himmel: 0xffb890, boden: 0x5a4048, intensitaet: 0.8 },
      wolken: [0xffa9bf, 0x8c4a6a], wetterHell: 0.62, partikelMisch: 0.3,
      autoLicht: true, sonnenScheibe: [1, 0.72, 0.42],
      wueste: { himmel: [0x3a2152, 0x9c3048, 0xd8402a], nebel: 0xc4583e, sonne: { farbe: 0xff5a2a, intensitaet: 0.7, hoehe: 5 },
        halbkugel: { himmel: 0xff9a78, boden: 0x6a3428, intensitaet: 0.78 }, wolken: [0xff8a7a, 0x8a2a2a] },
      fantasie: { himmel: [0x5a3aa8, 0xe07ab8, 0xffb070], nebel: 0xf0a0b8 } },
    nacht: { name: 'Nacht', emoji: '🌙',
      himmel: [0x03061a, 0x0a1430, 0x1a2c50], nebel: 0x121c34, sichtweiteFaktor: 0.85,
      sonne: { farbe: 0x9fb8ff, intensitaet: 0.16, hoehe: 35 },
      halbkugel: { himmel: 0x5c78c0, boden: 0x10161e, intensitaet: 0.25 },
      wolken: [0x2a3248, 0x10141e], wetterHell: 0.18, partikelMisch: 0.45,
      sterne: 700, mond: true, autoLicht: true, echteScheinwerfer: true, laternen: true,
      markierung: 0x9a9a8c, randstein: 0x2c2c2c, ballonsLeuchten: true,
      laterne: { abstand: 60, hoehe: 7, ausleger: 2.4, farbe: 0xffd08a, licht: 70, reichweite: 28, abfall: 1.5, punktlichter: 3 },
      wueste: { himmel: [0x020a20, 0x0b1c3c, 0x24406c], nebel: 0x1a2a48, halbkugel: { himmel: 0x6c90d8, boden: 0x2a2a38, intensitaet: 0.3 } },
      fantasie: { himmel: [0x0c0420, 0x241044, 0x3e1c60], nebel: 0x2a1642, halbkugel: { himmel: 0x9a74e0, boden: 0x2a1838, intensitaet: 0.3 },
        wolken: [0x3a2a58, 0x1c1030] } },
  },

  // --- Runde 4: Stunt (Sprungschanzen, Welt „Stunt"/„Verrückt") + Pickups (Turbo-Felder, Schild, Welt „Verrückt") ---
  // Logik: src/track/schanze.js (R.Schanzen) und src/world/pickups.js (R.Pickups); Platzierung in trackCatalog.js.
  stunt: {
    schanze: {
      g: 9.81,                 // m/s² Schwerkraft im Flug
      vyMax: 5,                // m/s: Absprung-Steiggeschwindigkeit höchstens (v·sin(winkel) gedeckelt) → bei 270 km/h ≈ 100 m Flug
      flugLenkung: 0.2,        // Lenkung im Flug: 20 % der normalen Drehrate
      luft: 0.0006,            // × v² (m/s²) Luftwiderstand im Flug (klein)
      landungSauber: 0.95,     // Tempo × 0,95 bei sauberer Landung
      landungSchraeg: 0.8,     // Tempo × 0,8 bei schräger Landung (Heading ≠ Tangente > schraegGrad) oder abseits
      schraegGrad: 25,
      abseitsZugabe: 0.5,      // m neben der Fahrbahnkante zählt noch als „auf der Straße"
      sprungMeldung: 0.8,      // s Flugzeit, ab der das HUD „Sprung! ✈️" zeigt
      landeNicken: 0.07,       // rad Nick-Impuls (Bug runter) bei der Landung, klingt in ~0,3 s ab
      kameraWackeln: 2.5,      // Stärke des Kamerawackelns bei der Landung (klein)
    },
    boost: {
      dauer: 2.5,              // s Turbo nach dem Überfahren eines Turbo-Feldes
      vMaxFaktor: 1.25,        // Höchsttempo × 1,25
      beschleunigungFaktor: 1.5,
      auslauf: 2,              // s: danach sinkt der vMax-Faktor gleichmäßig auf 1 (kein Tempo-Sprung)
      halbbreite: 2,           // m: Feld = seitenabstand ± 2 m (Auto-Mitte darf zusätzlich 0,9 m daneben sein)
    },
    schild: {
      radius: 2.6,             // m Aufsammel-Abstand (Auto-Mitte ↔ Kugel)
      wiederDa: 10,            // s bis die Kugel wieder erscheint
      hoehe: 1.3,              // m schwebt über der Straße
      zweiteHeilung: 10,       // 14.10. (v22): Prozentpunkte Gesundheit, wenn man mit vorhandenem Schild eine weitere Kugel nimmt (Schild bleibt)
    },
    // Runde 6 (W3-H): Ölfalle. Ölfässer (Pickup) stehen 35 m hinter jeder Schild-Kugel auf der Gegenseite (nur wo es Schilde gibt:
    // Welt Verrückt/Alles). Aufsammeln → 1 Item; Taste legt 8 m hinter dem Auto einen Ölfleck (Untergrund 'oel': grip 0,25, schlingern).
    oelfalle: {
      radius: 2.6,             // m Aufsammel-Abstand
      wiederDa: 10,            // s bis das Fass wieder da ist
      versatz: 35,             // m hinter der Schild-Kugel (entlang der Strecke)
      abstand: 8,              // m hinter dem Auto wird der Fleck gelegt
      dauer: 20,               // s sichtbar/wirksam
      halbLaenge: 3.2, halbBreite: 2.6,   // m Ellipse des Flecks (längs/quer zur Fahrtrichtung beim Legen)
      immun: 1,                // s: das legende Auto selbst ist immun
      max: 6,                  // höchstens so viele Flecken gleichzeitig (der älteste verschwindet)
      kiChance: 0.3,           // KI: Wahrscheinlichkeit je Gelegenheit (Spieler tritt in den Bereich hinter ihr)
      kiAbstand: 15,           // m: Spieler höchstens so weit hinter der KI
      kiNachlauf: 2,           // s: so lange nach dem Aufsammeln wartet die KI mindestens
    },
  },

  // --- Runde 5 (M6): Anlauf-Hilfe vor Loopings und Schanzen (Logik: src/track/anlauf.js) ---
  // Zu langsam → sanfte Bremse bis Stopp-Linie `stopp` m vor der Einfahrt, HUD-Hinweis; R/T = Anlaufposition
  // `abstand` m vor der Einfahrt (oder mehr, falls das langsamste Auto mehr braucht: Mindesttempo × (1 + reserve)).
  anlauf: {
    abstand: 150,              // m Anlaufposition vor Looping-Einfahrt / Rampenanfang (Katalog-Feld `anlauf` überschreibt)
    reserve: 0.1,              // aus dem Stand mit Vollgas muss Mindesttempo + 10 % erreicht werden
    stopp: 10,                 // m: hier steht ein zu langsames Auto spätestens
    bremsVerz: 5,              // m/s² weiche Anlauf-Bremse
    bremsMax: 30,              // m/s² Notbremse, falls die Entscheidung spät fällt
    marge: 0.02,               // Vorhersage < Mindesttempo × (1 + marge) → Bremse
    schanzeMin: 14,            // m/s (50 km/h) Mindesttempo auf eine Sprungschanze
    frei: 8,                   // m Abstand zu anderen Autos an der Anlaufposition (sonst 10 m weiter zurück)
    kiWarten: 2,               // s: KI steht so lange an der Linie → setzt sich selbst auf die Anlaufposition
    loopingHilfe: 0.9,         // Looping oben: ab Tempo ≥ 0,9 · nötiges Tempo schiebt die Arcade-Hilfe (mit Gas) nach
    resetMaxZurueck: 150,      // 13.10.: Reset (Abschleppen, R/T, KI festgefahren) im Anlaufbereich → Anlaufposition, höchstens so viele m hinter dem Checkpoint
    resetSchwungA: 3,          // m/s²: fehlt dadurch Anlaufweg, bekommt das Auto Start-Schwung v = sqrt(2·a·fehlenderWeg) (höchstens Mindesttempo)
  },
  // --- Runde 5: Fantasie-Klebestreifen (Katalog kleber [{ s0, s1, seite }], Logik + Optik: src/world/kleber.js) ---
  // Untergrund 'kleber' auf dem Randstreifen; > sekunden am Stück darauf → dauer s festgeklebt (Steuerung aus,
  // Tempo 0), danach Rückstoß zur Fahrbahnmitte und frei s Schonzeit (Streifen wirkt dann wie ein normaler Rand).
  kleber: {
    sekunden: 2,
    dauer: 5,
    rueckstoss: 2,             // m/s Richtung Fahrbahnmitte beim Lösen
    frei: 3,                   // s Schonzeit nach dem Lösen
    untergrund: { grip: 0.7, rollwiderstand: 8, vMaxFaktor: 0.6 },
    farbe: 0x3ddc5a,
  },
  // --- Runde 5b: Polizei (Einstellung `polizei`, Standard aus; Logik + Optik: src/world/polizei.js) ---
  // Streifenwagen (nicht im Rennen) verfolgt den nächsten Spieler vor ihm (KI nur, wenn kein Spieler in kiRadius m);
  // ≥ naheZeit s mit Karosserie-Abstand ≤ naheAbstand m neben/hinter dem Ziel → Ziel stoppDauer s angehalten
  // (Steuerung = Bremse; der Streifenwagen steht parallel NEBEN ihm, v20), danach schonfrist s in Ruhe gelassen; je Auto höchstens 1 Anhaltung pro Runde. Schild platzt statt Stopp.
  polizei: {
    standardAn: false,
    autoId: 'polizei',           // Katalog-Eintrag (Ersatz: Passat in Weiß + eigener Blaulichtbalken)
    schwierigkeit: 'meister',    // eigener R.Driver (ohne Gummiband)
    anzahl: 1, anzahlViele: 2, vieleAb: 6,   // 2 Streifenwagen ab 6 Gegnern
    startHinter: 60,             // m hinter dem letzten Startplatz
    naheAbstand: 6,              // m Karosserie-Abstand (Kapsel zu Kapsel)
    naheZeit: 1.5,               // s am Stück nah dran
    vorZiel: 1,                  // m: Streifenwagen-Mitte darf höchstens so weit vor der Front des Ziels sein („neben/hinter")
    stoppDauer: 4,               // s angehalten (v15: vorher 10 s – Wunsch Sebastian)
    freikaufKosten: 10,          // 14.10. (v22): Münzen, um beim Stopp durch Doppeltipp Rückwärts (↓ / S / Touch ▼) sofort weiterzufahren
    freikaufFenster: 0.5,        // s: größter Abstand der zwei Tipps
    schonfrist: 30,              // s danach lässt er dieses Auto in Ruhe
    kiRadius: 300,               // m: kein Spieler so nah → auch KI-Autos anhalten
    zielWahl: 1,                 // s: so oft wird das Ziel neu gewählt
    folgeAbstand: 8,             // m Mitten-Abstand, ab dem er sich dem Tempo des Ziels anpasst (nicht rammen)
    nebenLuecke: 0.8,            // m Karosserie-Abstand seitlich neben dem angehaltenen Auto (v20: parallel daneben, vorher 3,8 m Mitte)
    versatzVor: 0.4,             // m: Streifenwagen-Mitte leicht vor der Ziel-Mitte
    einparkRate: 5,              // 1/s: weiches Einparken auf die Parkpose (Zeitkonstante 0,2 s)
    blinkHz: 4,                  // Blaulicht blau/rot
    lichtAbstand: 40,            // m: PointLights nur so nah an einer Spieler-Kamera
    lichtStaerke: 30, lichtReichweite: 14,
    sireneHoerweite: 120,        // m: Lautstärke linear bis 0
  },

  // --- 15.10. (v25): Verkehr auf der Strecke (Einstellungen `geisterfahrer` aus/an und `verkehr` aus/wenig/viel, beide Standard AUS – damit alles
  //     wie bisher bleibt; Logik + Optik: src/world/verkehr.js). Die Wagen sind – wie die Streifenwagen – Einträge hinter den Teilnehmern in
  //     spiel.fahrzeuge (f.polizei = true: kein Rennen, keine Pickups, kein Schaden für sie selbst) mit f.verkehr = { art, ... }.
  //     Geisterfahrer: je Runde (= Runde des Führenden) 3 Wagen (Auto aus dem Katalog in Fremdfarbe), die ENTGEGEN der Fahrtrichtung die Strecke
  //     entlangfahren (Spline-Folgen, weicher Spurwechsel, kein Ausweichen), mit Licht + Hupe/Lichthupe; Warnung im HUD ab warnAbstand m.
  //     Krankenwagen (Multivan-Basis): in Fahrtrichtung, zügig, Blaulicht; Kontakt kostet schadenFaktor × den normalen Auto-Schaden.
  //     Abschleppwagen: in Fahrtrichtung, langsam – bewegliches Hindernis. Fahrstrecken: nur freie Abschnitte (keine Loopings, Schanzen,
  //     Tunnel, Brücken, Überführungen, Kreuzungen, Spur-Engstellen, Start/Ziel); Gabelung: Ast wird gewählt.
  verkehr: {
    geisterfahrerStandardAn: false,
    verkehrStandard: 'aus',
    stufen: {
      aus:   { name: 'Aus',   krankenwagen: 0, abschleppwagen: 0 },
      wenig: { name: 'Wenig', krankenwagen: 1, abschleppwagen: 1 },
      viel:  { name: 'Viel',  krankenwagen: 2, abschleppwagen: 2 },
    },
    geister: { anzahl: 3, tempo: 21, tempoSchwankung: 3, warnAbstand: 150, spurWechselAb: 70, spurWechselBis: 170, wechselLaenge: 45,
      routeMax: 700, routeMin: 260, hupeAbstand: 110,
      // v28 (W3): selten – je Runde zufällig 0/1/2 Geisterfahrer (Seed-fest; Wahrscheinlichkeiten 0,2/0,4/0,4 = Erwartung 1,2), zwei nur mit >= 400 m Strecke dazwischen;
      // keine HUD-Vorwarnung und kein Minimap-Blinken (warnung: true bringt beides zurück; Lichthupe/Hupe des Geisterfahrers bleiben)
      verteilung: [0.2, 0.4, 0.4], mindestAbstand: 400, warnung: false },
    krankenwagen: { tempo: 34, schadenFaktor: 3, autoId: 'krankenwagen', spurQ: 0.28,
      // v29 (F7): Krankenwagen überholt den langsamen Abschleppwagen (Nachbarspur ≥ frei m frei, weicher Querversatz über zeit s, zurück ab zurueckAb m vor dem Lkw; Spawn nicht < spawnHinter m hinter einem Lkw)
      ueberholen: { an: true, ab: 120, frei: 40, zeit: 2, zurueckAb: 25, randZugabe: 1.2, abstandQuer: 0.8, spawnHinter: 60 } },
    abschleppwagen: { tempo: 9.5, spurQ: 0.3, hoerweite: 110 },
    // gemeinsam
    sperrVor: 45, sperrNach: 45,          // m Sicherheitsrand um Sperrzonen (Tunnel, Brücken, Überführungen, Kreuzungen, Spur-Engstellen)
    loopingVor: 140, loopingNach: 70,     // Anlauf vor Looping/Schanze + Auslauf
    schanzeVor: 140, schanzeNach: 40,
    startFrei: 220, zielFrei: 120,        // m nach Start/Ziel nichts spawnen (Startaufstellung)
    freiAbstand: 130,                     // m: so nah darf beim Erscheinen kein Teilnehmer / keine Kamera sein (kein Auftauchen vor der Nase)
    spawnVorAnderen: 260,                 // m: Krankenwagen/Abschleppwagen erscheinen so weit vor dem Führenden (und mind. freiAbstand von allen)
    wiederkehr: [4, 12],                  // s Pause bis zum nächsten Auftritt (Krankenwagen/Abschleppwagen)
    lichtAbstand: 45,                     // m: Lichtkegel/Blaulicht-Schein nur so nah an einer Spieler-Kamera
    blinkHz: 3,
  },

  // --- 16.10. (v28 W10): Tiere queren die Straße (src/world/tiere.js). Einstellung `tiere` An/Aus (Standard AN, abschaltbar). Kühe (Wiese), Rehe (Wald),
  //     Bären + Steinböcke (Alpen), Dinos (Dino), Kamele (Wüste), Einhörner (Fantasie), Mega je Abschnitt. Etwa alle 60–90 s ein Auftritt, gerade oder schräg
  //     (20–70°), nie in Sperrzonen, nie < 40 m vor einem Auto. Kontakt: Tempo × 0,7, kein Schaden. Nicht die alten Dino-Wildtiere (config.tiere). Werte:
  //     siehe STANDARD in tiere.js (hier nur Überschreibungen), z. B. tierverkehr: { abstand: [60, 90], tempoFaktor: 0.7 }
  tierverkehr: { standardAn: true },

  // --- Runde 6 (W3-G): Münzen auf der Strecke + Garage (Logik: src/world/muenzen.js, src/ui/garage.js) ---
  // Münzen: anzahlMin–anzahlMax je Strecke, auf Geraden Reihen à `reihe` Stück (Abstand reiheAbstand m), in Kurven
  // (|Krümmung| > kurveAb 1/m) einzeln. Einsammeln = Abstand Auto-Mitte ↔ Münze ≤ radius m; KEIN Stoß, keine Physik.
  // Preisgeld nach dem Rennen je Spieler: Platz 1–3 = preisgeld[0..2], sonst preisgeldSonst.
  // Garage je Fahrer (localStorage speicherSchluessel): Lackfarben (4 je Auto, farbPreis je Farbe, einmal kaufen,
  // danach frei wechselbar; Original immer). R1: die alten Upgrades (Motor/Reifen/Bremsen Stufe 0–3) sind entfernt und
  // wurden in Goldstücke erstattet (src/ui/garage.js); Leistung kommt nur noch aus dem Tuning (config.spass.tuning); Reparatur (nur wenn Schaden an): nächstes Rennen mit 100 %.
  // Schaden-Rest: Endprozent je Fahrer+Auto, nächstes Rennen startet damit (mindestens restMin).
  garage: {
    speicherSchluessel: 'rennspiel.garage.v1',
    muenzen: { anzahlMin: 20, anzahlMax: 40, zielAnzahl: 30, maxReihen: 4, reihe: 5, reiheAbstand: 6, kurveAb: 0.008, radius: 1.9, hoehe: 0.95,
      startFrei: 70, zielFrei: 25, schanzeFrei: 110 },
    preisgeld: [30, 20, 15], preisgeldSonst: 5,
    farbPreis: 20,
    reparaturPreis: 10,
    restMin: 30,
    // 4 Lackfarben je Auto (Polizei nicht in der Garage); Namen für die Anzeige in farbNamen
    farben: {
      'troc-cabrio': [0xe3202b, 0xffc400, 0x14a64a, 0xff5fb8],
      multivan: [0xff7a1a, 0x1fb5b0, 0xd8262f, 0x1f5fd6],
      passat: [0xf2f2f2, 0x1f5fd6, 0xc8202a, 0xc4cad3],
      'porsche-911': [0xffc400, 0x1f7bff, 0x3ddc5a, 0x2b2e35],
      'bmw-m4': [0x1f7bff, 0xe3202b, 0xff7a1a, 0xf2f2f2],
      'amg-gt': [0xe3202b, 0xffc400, 0x3ddc5a, 0x8a3ffc],
      'audi-rs6': [0x1f7bff, 0xe3202b, 0x2e9e4a, 0x2b2e35],
      'mini-cooper': [0xe3202b, 0x1f7bff, 0xffc400, 0xff5fb8],
      formel: [0xe3202b, 0x14a64a, 0xff7a1a, 0xff5fb8],
      _standard: [0xe3202b, 0x1f7bff, 0xffc400, 0x14a64a],
    },
    farbNamen: { e3202b: 'Rot', ffc400: 'Gelb', '14a64a': 'Grün', ff5fb8: 'Pink', ff7a1a: 'Orange', '1fb5b0': 'Türkis',
      d8262f: 'Rot', '1f5fd6': 'Blau', f2f2f2: 'Weiß', c8202a: 'Rot', c4cad3: 'Silber', '1f7bff': 'Blau', '3ddc5a': 'Grün',
      '2b2e35': 'Schwarz', '8a3ffc': 'Lila', '2e9e4a': 'Grün' },
  },

  // --- Kamera ---
  kamera: {
    modi: ['verfolger', 'cockpit', 'weit'],
    // Runde 5: tempoabhängig (linear mit tempoAnteil = Tempo / vMax): abstand → abstandSchnell,
    // hoehe → hoeheSchnell, vorausblick → vorausblickSchnell. Der Blickpunkt folgt der Fahrtrichtung
    // (Geschwindigkeitsvektor inkl. Drift) und greift mit lenkVorgriff (rad × Lenkwert × tempoAnteil) in die Kurve vor.
    verfolger: { abstand: 9.0, abstandSchnell: 12.0, hoehe: 3.6, hoeheSchnell: 4.6, vorausblick: 5.0, vorausblickSchnell: 9.0,
                 weichheit: 4.5, blickWeichheit: 7.0, lenkVorgriff: 0.12 },
    weit:      { abstand: 16.0, abstandSchnell: 18.0, hoehe: 7.0, hoeheSchnell: 7.8, vorausblick: 6.0, vorausblickSchnell: 10.0,
                 weichheit: 3.5, blickWeichheit: 6.0, lenkVorgriff: 0.10 },
    cockpit:   { hoehe: 1.15, vor: 0.4, blickWeite: 30, blickWeiteSchnell: 45, lenkVorgriff: 0.08 },
  },

  // --- 14.10. (v21): Motorsound je Auto (src/audio/motorProfile.js, src/audio/engine.js) ---
  // Jedes Auto klingt nach seinem Motor (Zylinderzahl, Diesel/Benziner, Turbo, Gänge). Die Daten stehen mit Quellen in motorProfile.js.
  sound: {
    motor: {
      lautstaerke: 1,       // Motor-Gesamtlautstärke relativ (0.5 = halb so laut; die Master-Lautstärke/Aus im Menü bleibt)
      maxKi: 2,             // so viele Computer-Motoren gleichzeitig hörbar (spart CPU; Spieler sind immer hörbar)
      hoerweite: 60,        // m: weiter entfernte Computer-Autos sind stumm
      knallen: true,        // dezentes Knallen/Blubbern beim Gas-Wegnehmen (911, AMG, M4, RS6)
      turbo: true,          // leises Turbo-Pfeifen und Ablassen
    },
  },
  // --- 14.10. (v21): Cockpit-Anzeigen, Rückspiegel, Scheibenwischer (src/ui/cockpit.js, src/ui/rueckspiegel.js, src/render/wischer.js) ---
  // ALLE Positionen und Größen sind einfache Zahlen in PROZENT der Ansicht (Einzelspieler = ganzer Bildschirm, Zweispieler = jede Hälfte):
  //   x = Mitte von links (0) bis rechts (100) · y = Mitte von oben (0) bis unten (100) · b = Breite (% der Ansichtsbreite)
  //   h = Höhe (% der Ansichtshöhe); fehlt h, ist das Element quadratisch (Höhe = Breite in Pixeln).
  // Einfach die Zahl ändern und die Seite neu laden. Erklärung: ANLEITUNG.md, Abschnitt „Cockpit, Rückspiegel, Wischer“.
  cockpit: {
    an: true,                                   // false = alte Anzeige (Tacho rechts unten) bei allen Autos
    modi: ['cockpit', 'verfolger', 'weit'],     // in welchen Kamera-Ansichten die Instrumente zu sehen sind
    zeichenrate: 30,                            // höchstens so oft pro Sekunde neu zeichnen (Hz)
    zweispielerFaktor: 1.25,                    // Zweispieler: Instrumente (Größe + Abstände vom unteren Mittelpunkt) mal diesen Faktor (Hälfte ist schmal)
    // welches Auto welche Instrumente hat ('vw' | 'porsche' | 'standard' = alte Anzeige); nicht genannte Autos: 'standard'
    stile: { 'passat': 'vw', 'polizei': 'vw', 'multivan': 'vw', 'troc-cabrio': 'vw', 'porsche-911': 'porsche', 'formel': 'porsche' },
    // VW „Digital Cockpit Pro“ (10,25 Zoll; Passat Variant, Multivan T7, T-Roc Cabrio): links Drehzahl, rechts km/h, Mitte Platz/Runde
    vw: {
      tafel:    { x: 50,   y: 90.5, b: 35, h: 20, farbe: '#05080d' },     // dunkle Anzeigefläche hinter den Instrumenten
      drehzahl: { x: 38.2, y: 90.5, b: 11.4 },
      tacho:    { x: 61.8, y: 90.5, b: 11.4 },
      mitte:    { x: 50,   y: 90.5, b: 9.5, h: 14 },
    },
    // Porsche 911 (992), „Classic“-Anzeige: Drehzahlmesser + Tacho in der Mitte, außen je zwei kleine
    porsche: {
      zweispielerFaktor: 0.74,                // (optional) eigener Zweispieler-Faktor für diesen Stil (v29: Tafel jetzt 58 % breit → 0,74 ergibt wie vorher ≈ 43 % je Hälfte, sonst Überdeckung der Minimap)
      // 17.10. (v29, F8): sechs Instrumente, symmetrisch um die Mitte: innen Drehzahlmesser (links) + Tacho 0–300 km/h (rechts), je mit Nadel;
      // außen wie bisher Gang · Runde | Platz · Öl. Auch das Formel-Renner-Cockpit nutzt diese Anzeige (Skala 0–13, rot ab 11,5).
      tafel:   { x: 50,   y: 90,   b: 58, h: 21, farbe: '#030303' },
      drehzahl: { x: 43.1, y: 89.5, b: 13.4 },
      tacho:    { x: 56.9, y: 89.5, b: 13.4 },
      linksAussen:  { x: 24.6, y: 91, b: 6.6 },     // Gang
      linksInnen:   { x: 32.1, y: 91, b: 7.4 },     // Runde
      rechtsInnen:  { x: 67.9, y: 91, b: 7.4 },     // Platz
      rechtsAussen: { x: 75.4, y: 91, b: 6.6 },     // Öl-Temperatur
    },
    // Rückspiegel: zweite Kamera nach hinten, wird in ein kleines Bild gerendert (jedes 2. Bild), links/rechts vertauscht wie ein echter Spiegel
    spiegel: {
      an: true,
      modi: ['cockpit', 'verfolger', 'weit'],
      x: 50, y: 5.2, b: 25, h: 8.5,            // Position/Größe (siehe oben). 15.10. (v23): GANZ OBEN in der Mitte wie ein echter Innenspiegel (y = Mitte des Spiegels; 5,2 % bei 8,5 % Höhe = Oberkante ≈ 1 % vom Bildrand; vorher y 71,5 über dem Armaturenbrett). Zweispieler skaliert um den Ankerpunkt oben Mitte. Die Positions-Anzeige („3. von 4“) rückt neben den Spiegel (schmales Fenster: unter den Spiegel), siehe cockpit.js
      aufloesung: 288,                         // Breite des Spiegelbilds in Pixeln (Höhe folgt dem Seitenverhältnis): klein = schnell
      takt: 2,                                 // Spiegelbild nur bei jedem N-ten Bild neu rendern
      blickWinkel: 80,                         // waagerechter Blickwinkel (Grad)
      hoehe: 1.3,                              // Kamerahöhe über dem Auto (m)
      sicht: 220,                              // Sichtweite nach hinten (m)
      deko: true,                              // Bäume/Büsche/Zäune im Spiegel (schöner; false = ca. halbe Spiegel-Kosten). Bei langsamem Spiel schaltet die adaptive Qualität selbst ab: Stufe 1 ohne Deko, 2 halber Takt, 3 kein Spiegel
      zweispieler: 'an',                       // Zweispieler: 'aus' (kein Spiegel) | 'an' (je Hälfte; v31 H2: halbe Auflösung, eigener Takt, versetzt, ohne Deko, kürzere Sicht – siehe zwei*)
      zweiAufloesung: 0.5,                     // v31: Zweispieler-Spiegelbild = Solo-Auflösung × dieser Faktor
      zweiTakt: 4,                             // v31: Zweispieler: Spiegelbild nur bei jedem N-ten Bild (die zweite Hälfte um N/2 versetzt → höchstens ein Spiegel pro Bild)
      zweiDeko: false,                         // v31: Zweispieler: keine Bäume/Zäune im Spiegel (halbiert die Spiegel-Kosten)
      zweiSicht: 140,                          // v31: Zweispieler: Sichtweite nach hinten (m)
    },
    // Scheibenwischer + Tropfen/Flocken bei Regen, Schnee, Hagel (nur bei Niederschlag, sonst kostenlos)
    wischer: {
      an: true,
      modi: ['cockpit'],                       // nur in der Fahrersicht (Kamera-Taste); ['cockpit', 'verfolger', 'weit'] = in allen Ansichten
      unten: 35, hoehe: 34,                    // Wischerfeld: Unterkante (% der Ansichtshöhe vom unteren Rand = Fuß der Windschutzscheibe) und Höhe
      armX: [31, 69], armLaenge: 36,           // Drehpunkte der Arme (x in %) und Länge (% der Ansichtsbreite)
      armWinkel: 128,                          // Schwenkbereich (Grad)
      takt: { regen: 1.5, schnee: 2.4, hagel: 1.1 },   // Sekunden je Wisch-Hin-und-Zurück (Windstärke macht es bis zu 30 % schneller)
      tropfen: { regen: 150, schnee: 90, hagel: 70 },  // höchstens so viele Tropfen/Flocken gleichzeitig
      rate: { regen: 70, schnee: 35, hagel: 40 },      // neue Tropfen/Flocken pro Sekunde
      aufloesung: 0.6,                         // Zeichenauflösung des Felds (1 = Bildschirm-Pixel; kleiner = schneller)
    },
  },

  // --- Runde 6 (W3-F): Pokal-Serie (D1) und „Letzter fliegt raus" (D7), src/race/pokal.js ---
  pokal: {
    groessen: [3, 4, 5], groesseStandard: 3,          // Rennen je Pokal
    // feste Strecken-Reihenfolge je Pokal-Größe (Welt/Tageszeit/Wetter kommen aus den Einstellungen)
    reihenfolge: { 3: ['wiese', 'wald', 'fantasie'], 4: ['wiese', 'wald', 'wueste', 'fantasie'], 5: ['wiese', 'wald', 'wueste', 'fantasie', 'dino'] },
    punkte: [10, 8, 6, 5, 4, 3, 2], punkteRest: 1,   // 1.=10 … 7.=2, ab 8. Platz 1 Punkt
    maxStaerke: 'legende',                            // KI-Stärke steigt je Rennen um eine Stufe, höchstens bis hier
    speicherSchluessel: 'rennspiel.pokale.v1',        // Pokal-Gewinne je Fahrer
    konfetti: 90,                                     // Konfetti-Schnipsel bei der Siegerehrung
    elimination: {
      minGegner: 3,             // mindestens 3 Computer-Gegner (Rundenzahl = Teilnehmer − 1)
      zuschauerSekunden: 6,     // alle Spieler raus: noch so lange zuschauen, dann Ergebnis (null = bis zum Ende)
      puffDauer: 0.9,           // s „Puff"-Wolke beim Ausscheiden
    },
  },

  // --- Oberfläche (Menü, HUD) ---
  ui: {
    speicherSchluessel: 'rennspiel.einstellungen.v1',   // localStorage
    tachoMaxKmh: 280,           // Vollausschlag des Tacho-Balkens
    spielerFarben: ['#2f8bff', '#ff8a1f'],   // Spieler 1 blau, Spieler 2 orange
    menueKameraTempo: 22,       // m/s Kameraflug über die Strecke im Hintergrund
    ergebnisSperreMs: 800,      // Eingaben im Ergebnis-Bild erst nach dieser Zeit
  },
};

// ------------------------------------------------------------
// Fahrer-Hilfsfunktionen (rein, ohne DOM – auch in Node testbar)
// ------------------------------------------------------------
/** Eintrag { name, emoji } zu einem Fahrernamen (unbekannt → null). */
Rennspiel.fahrerSuche = function (name) {
  return Rennspiel.config.fahrer.find((f) => f.name === name) || null;
};
/** Avatar-Emoji eines Fahrers; Computer-Namen ohne Eintrag bekommen 🤖. */
Rennspiel.fahrerEmoji = function (name) {
  const f = Rennspiel.fahrerSuche(name);
  return f ? f.emoji : '🤖';
};
/** Zwei Spieler dürfen nicht denselben Fahrer haben: der zweite springt auf den nächsten freien. */
Rennspiel.fahrerEindeutig = function (wahl) {
  const liste = Rennspiel.config.fahrer, n = liste.length, w = wahl.slice();
  if (w[0] === w[1]) {
    let i = liste.findIndex((f) => f.name === w[1]);
    i = (i + 1) % n;
    w[1] = liste[i].name;
  }
  return w;
};
/** Namen für `anzahl` Computer-Gegner: nur Fahrer, die kein Spieler gewählt hat; Vorrang zuerst. */
Rennspiel.fahrerComputerNamen = function (spielerNamen, anzahl) {
  const c = Rennspiel.config, frei = (n) => !spielerNamen.includes(n);
  const alle = c.fahrer.map((f) => f.name);
  const reihe = c.fahrerComputerVorrang.filter((n) => alle.includes(n) && frei(n))
    .concat(alle.filter((n) => frei(n) && !c.fahrerComputerVorrang.includes(n)));
  const namen = [];
  for (let i = 0; i < anzahl; i++) namen.push(i < reihe.length ? reihe[i] : 'Computer ' + (i - reihe.length + 1));
  return namen;
};
