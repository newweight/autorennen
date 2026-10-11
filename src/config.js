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
  // tempoFaktor: Anteil des möglichen Tempos (1.0 = perfekt)
  // gummiband:   0 = aus, 1 = stark (KI hinten schneller, vorne langsamer)
  // fehler:      Lenk-/Bremsfehler-Anteil (0 = fehlerfrei)
  schwierigkeiten: {
    leicht: { name: 'Leicht', tempoFaktor: 0.78, gummiband: 0.6, fehler: 0.25 },
    mittel: { name: 'Mittel', tempoFaktor: 0.88, gummiband: 0.4, fehler: 0.12 },
    schwer: { name: 'Schwer', tempoFaktor: 0.96, gummiband: 0.2, fehler: 0.04 },
    unfair: { name: 'Unfair', tempoFaktor: 1.0, gummiband: 0.0, fehler: 0.0 },
  },
  schwierigkeitStandard: 'mittel',

  // --- Fahrhilfen (für jüngere Kinder umschaltbar) ---
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
  physik: {
    schritt: 1 / 60,           // fester Physikschritt
    maxSchritteProFrame: 3,    // Schutz gegen Zeitsprung/Spirale bei langsamen Frames (> 50 ms)
    untergrund: {
      strasse: { grip: 1.0,  rollwiderstand: 1.0 },
      rand:    { grip: 0.85, rollwiderstand: 1.6 },   // Randstreifen / Schotter
      gras:    { grip: 0.6,  rollwiderstand: 3.0 },
      sand:    { grip: 0.5,  rollwiderstand: 3.8 },
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
    tachoMaxKmh: 180,           // Vollausschlag des Tacho-Balkens
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
