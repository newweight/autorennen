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
    { name: 'Emmy',        emoji: '🦄' },
    { name: 'Sara',        emoji: '🌸' },
    { name: 'Jonas',       emoji: '🦁' },
    { name: 'Kerle',       emoji: '🐯' },
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
    gegnerMax: 5,
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
