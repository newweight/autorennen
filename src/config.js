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
    resetSpieler1: 'KeyR',     // Auto 1 zurück auf die Strecke
    resetSpieler2: 'KeyT',     // Auto 2 zurück auf die Strecke
    kamera: 'KeyC',            // Kamera wechseln (Verfolger / Cockpit / weit)
    pause: 'Escape',
    vollbild: 'KeyF',
    debug: 'KeyH',             // Debug-Text ein/aus
    ton: 'KeyM',               // Ton an/aus
    bestaetigen: ['Enter', 'Space'],
  },

  // --- Grafik ---
  grafik: {
    pixelRatioMax: 1.5,        // Solo: Retina-Mac: 2 wäre schärfer, 1.5 spart Leistung
    pixelRatioSplit: 1.0,      // zwei Ansichten: doppelte Geometrie-Arbeit → Pixel sparen
    schatten: false,           // echte Schatten kosten viel; Blob-Schatten unter Autos
    sichtweite: 420,           // Nebel-Ende in Metern
    fov: 62,
    fovSplitScreen: 70,
    // Adaptive Qualität: fps über `sekunden` unter fpsUnten → eine Stufe runter
    // (pixelRatio nächster Wert, Nebel-Sichtweite −20 %); über fpsOben → wieder hoch.
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
    maxSchritteProFrame: 3,    // Schutz gegen Zeitsprung/Spirale bei langsamen Frames (> 50 ms)
    querGrip: 16,              // m/s² Querbeschleunigung bei grip 1,0 (Arcade, ~1,6 g)
    abtriebTempo: 110,         // m/s – Querhaftung × (1 + v/abtriebTempo) ("Abtrieb", sonst bei 250 km/h unfahrbar)
    kurvenWiderstand: 0.04,    // Anteil der Querbeschleunigung, der als Bremswirkung (Reifen radieren) wirkt
    kraftAbfall: 0.3,          // Antriebskraft × (1 − kraftAbfall · v/vMax)
    endKraft: 0.2,             // Netto-Beschleunigung bei vMax als Anteil von `beschleunigung` (vMax wird sicher erreicht)
    abseitsBremsen: 22,        // m/s² – so schnell sinkt das Tempo auf den Abseits-Deckel (statt Sprung)
    // grip/rollwiderstand: Haftung und Widerstand; vMaxFaktor: Deckel relativ zu vMax
    // (fehlt er: 0,25 + 0,75·grip²); vMaxAbs: zusätzlicher Deckel in m/s
    untergrund: {
      strasse: { grip: 1.0,  rollwiderstand: 1.0 },
      rand:    { grip: 0.85, rollwiderstand: 1.6, vMaxFaktor: 0.8 },        // Randstreifen / Schotter
      gras:    { grip: 0.6,  rollwiderstand: 3.0, vMaxFaktor: 0.5,  vMaxAbs: 25 },   // max 90 km/h
      sand:    { grip: 0.5,  rollwiderstand: 3.8, vMaxFaktor: 0.45, vMaxAbs: 22 },   // max 79 km/h
      // Hindernisse auf der Fahrbahn (Runde 3, von trackBuilder/collisions zu setzen):
      oel:     { grip: 0.25, rollwiderstand: 1.0, vMaxFaktor: 1.0 },        // rutschig (schlingern), kein Tempodeckel
      sandFleck: { grip: 0.55, rollwiderstand: 6.0, vMaxFaktor: 0.75 },   // Sand auf der Straße (bremst spürbar)
    },
  },

  // --- Hindernisse auf der Fahrbahn (Runde 3; Platzierung je Strecke in trackCatalog.js) ---
  // laenge/breite in m. gefahr 0..1 = wie dringend die KI ausweicht.
  // untergrund = Schlüssel in physik.untergrund (Werte für Grip/Rollwiderstand stehen dort).
  hindernisse: {
    oel:       { name: 'Ölfleck', untergrund: 'oel', laenge: 9, breite: 5, gefahr: 0.7 },
    sand:      { name: 'Sand', untergrund: 'sandFleck', laenge: 14, breite: 7, gefahr: 0.4 },
    baustelle: { name: 'Baustelle', laenge: 30, vorlauf: 9, pylonenAbstand: 3, pylonRadius: 0.35,
                 pylonTempo: 0.88,       // Tempo × 0,88 beim Umfahren einer Pylone
                 blinkZeit: 0.3,         // s rot blinken, dann weg bis zur nächsten Runde des Verursachers
                 gefahr: 1.0 },
    ast:       { name: 'Ast', dicke: 0.28, tempoFaktor: 0.6, huepfer: 2.2, sperrZeit: 0.8, gefahr: 0.6 },
    // Runde 4 (Welt „Hindernisse“, Katalog wracks [{ s, seitenabstand, brennt, autoId }]):
    // liegengebliebenes Auto = feste Kapsel (wie die Bake), schräg um `schraeg` rad (Bug zum Rand),
    // Warnblinker im blinkTakt (s an / s aus), Warndreieck dreieckAbstand m davor.
    wrack:     { name: 'Liegengebliebenes Auto', schraeg: 0.28, blinkTakt: 0.5, dreieckAbstand: 9, gefahr: 1.0 },
    // brennendes Wrack: wie wrack + Flammen/Rauch; Treffer kostet bei Schaden „an“ −10 % (config.schaden.brandVerlust)
    brand:     { name: 'Brennendes Auto', schraeg: 0.28, blinkTakt: 0.5, dreieckAbstand: 12, gefahr: 1.0,
                 flammen: 3, rauchTeilchen: 70, rauchHoehe: 11 },
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
    mindest: { bande: 3, auto: 2, hindernis: 0, brand: 0, ball: 0, wasser: 0, stroh: 0 },
    abklingZeit: 0.7,
    stufeJe: 20,
    vMaxJeStufe: 0.04, beschleunigungJeStufe: 0.06, gripJeStufe: 0.03,
    rauchUnter: 40, qualmUnter: 20,
    liegenZeit: 5, resetProzent: 60,
    blinkTakt: 0.5,
    rauchTeilchen: 36,
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
    },
  },

  // --- Kamera ---
  kamera: {
    modi: ['verfolger', 'cockpit', 'weit'],
    verfolger: { abstand: 9.0, hoehe: 3.6, vorausblick: 5.0, weichheit: 4.5 },
    weit:      { abstand: 16.0, hoehe: 7.0, vorausblick: 6.0, weichheit: 3.5 },
    cockpit:   { hoehe: 1.15, vor: 0.4 },
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
