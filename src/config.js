// ============================================================
// Autorennen – zentrale Einstellungen
// Alles, was man später leicht ändern will, steht hier.
// Der Namensraum window.Rennspiel bündelt alle Module (keine ES-Module,
// weil die Datei per Doppelklick über file:// geöffnet wird).
// ============================================================
window.Rennspiel = window.Rennspiel || {};

Rennspiel.config = {
  version: '0.1',

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
    pixelRatioMax: 1.5,        // Retina-Mac: 2 wäre schärfer, 1.5 spart Leistung
    schatten: false,           // echte Schatten kosten viel; Blob-Schatten unter Autos
    sichtweite: 420,           // Nebel-Ende in Metern
    fov: 62,
    fovSplitScreen: 70,
  },

  // --- Physik (Einheiten: Meter, Sekunden) ---
  physik: {
    schritt: 1 / 60,           // fester Physikschritt
    maxSchritteProFrame: 5,    // Schutz gegen Zeitsprung nach Tab-Wechsel
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
