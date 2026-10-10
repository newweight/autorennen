// ============================================================
// Auto-Katalog: datengetriebene Liste aller wählbaren Autos.
// Jedes Auto hat Fahrwerte (für Vehicle), eine Karosserie-Form (für den
// carBuilder) und kindgerechte Texte. Neue Autos = nur hier einen Eintrag ergänzen.
//
// Felder je Auto:
//   id, name (Anzeige), marke, modell, generischerName (ohne Markenname),
//   farbe (Hauptfarbe, hex), farbe2 (optional: zweite Farbe, z. B. Dach/Oberteil),
//   farbeName, karosserie (siehe KAROSSERIEN), variante (optional, Feinform),
//   fahrwerte { vMax m/s, beschleunigung m/s², bremsen m/s², rueckwaertsMax m/s,
//               wendigkeit rad/s, grip 0..1, masse kg, laenge m, breite m },
//   beschreibung (ein kindgerechter Satz)
//
// Balance: Der Porsche ist am schnellsten, aber rutschiger; der Multivan ist
// langsam, aber sehr stabil. Kein Auto ist hoffnungslos – wer sauber fährt,
// gewinnt mit jedem (Computergegner werden über tempoFaktor/Gummiband angepasst).
// ============================================================
window.Rennspiel = window.Rennspiel || {};

(function () {
  const R = window.Rennspiel;

  /** Erlaubte Karosserie-Typen (Reihenfolge nur zur Anzeige). */
  const KAROSSERIEN = ['cabrio', 'van', 'limousine', 'sportwagen', 'coupe', 'kombi', 'kleinwagen', 'suv'];

  const katalog = [
    {
      id: 'troc-cabrio',
      name: 'VW T-Roc Cabrio',
      marke: 'Volkswagen', modell: 'T-Roc Cabrio',
      farbe: 0x1f7bff, farbeName: 'Blau',
      karosserie: 'cabrio',
      fahrwerte: {
        vMax: 42, beschleunigung: 8.5, bremsen: 18, rueckwaertsMax: 8,
        wendigkeit: 2.0, grip: 0.88, masse: 1400, laenge: 4.27, breite: 1.83,
      },
      beschreibung: 'Ohne Dach fährt es sich am schönsten – und er ist ein Allrounder.',
      generischerName: 'Blaues Cabrio',
    },
    {
      id: 'multivan',
      name: 'VW Multivan 6.1',
      marke: 'Volkswagen', modell: 'Multivan 6.1',
      farbe: 0xaab4c0, farbe2: 0xf4f6f8, farbeName: 'Silber-Weiß',
      karosserie: 'van',
      fahrwerte: {
        vMax: 34, beschleunigung: 6.5, bremsen: 15.5, rueckwaertsMax: 7,
        wendigkeit: 1.6, grip: 0.95, masse: 2200, laenge: 4.97, breite: 1.94,
      },
      beschreibung: 'Groß, schwer und kaum aus der Spur zu bringen – der Bus für die ganze Familie.',
      generischerName: 'Silberner Familienbus',
    },
    {
      id: 'passat',
      name: 'VW Passat B8',
      marke: 'Volkswagen', modell: 'Passat B8 Limousine',
      farbe: 0x2b2e35, farbeName: 'Schwarz',
      karosserie: 'limousine',
      fahrwerte: {
        vMax: 41, beschleunigung: 8, bremsen: 19, rueckwaertsMax: 8,
        wendigkeit: 1.9, grip: 0.9, masse: 1550, laenge: 4.78, breite: 1.83,
      },
      beschreibung: 'Der ruhige Alleskönner: nicht der Schnellste, aber immer sicher unterwegs.',
      generischerName: 'Schwarze Limousine',
    },
    {
      id: 'porsche-911',
      name: 'Porsche 911',
      marke: 'Porsche', modell: '911',
      farbe: 0xe3202b, farbeName: 'Rot',
      karosserie: 'sportwagen', variante: 'heckmotor',
      fahrwerte: {
        vMax: 48, beschleunigung: 10.7, bremsen: 22, rueckwaertsMax: 9,
        wendigkeit: 2.1, grip: 0.78, masse: 1450, laenge: 4.55, breite: 1.85,
      },
      beschreibung: 'Das schnellste Auto von allen – aber in den Kurven rutscht es gern mal.',
      generischerName: 'Roter Sportwagen',
    },
    {
      id: 'bmw-m4',
      name: 'BMW M4',
      marke: 'BMW', modell: 'M4 Coupé',
      farbe: 0xffc400, farbeName: 'Gelb',
      karosserie: 'coupe',
      fahrwerte: {
        vMax: 46, beschleunigung: 10.4, bremsen: 21, rueckwaertsMax: 9,
        wendigkeit: 2.2, grip: 0.85, masse: 1650, laenge: 4.79, breite: 1.88,
      },
      beschreibung: 'Das gelbe Coupé ist flink und kräftig – ein Renner mit zwei Türen.',
      generischerName: 'Gelbes Coupé',
    },
    {
      id: 'amg-gt',
      name: 'Mercedes-AMG GT',
      marke: 'Mercedes-AMG', modell: 'GT',
      farbe: 0xc4cad3, farbeName: 'Silber',
      karosserie: 'sportwagen', variante: 'langehaube',
      fahrwerte: {
        vMax: 45, beschleunigung: 10, bremsen: 20, rueckwaertsMax: 9,
        wendigkeit: 2.0, grip: 0.83, masse: 1600, laenge: 4.55, breite: 1.94,
      },
      beschreibung: 'Mit der langen Schnauze sieht er aus wie ein Pfeil – und fühlt sich auch so an.',
      generischerName: 'Silberner Rennpfeil',
    },
    {
      id: 'audi-rs6',
      name: 'Audi RS6 Avant',
      marke: 'Audi', modell: 'RS6 Avant',
      farbe: 0x6c7683, farbeName: 'Grau',
      karosserie: 'kombi',
      fahrwerte: {
        vMax: 44, beschleunigung: 9.5, bremsen: 20, rueckwaertsMax: 8,
        wendigkeit: 1.8, grip: 0.92, masse: 2000, laenge: 4.99, breite: 1.95,
      },
      beschreibung: 'Ein Kombi mit Rennmotor: viel Platz und trotzdem richtig flott.',
      generischerName: 'Grauer Rennkombi',
    },
    {
      id: 'mini-cooper',
      name: 'Mini Cooper',
      marke: 'Mini', modell: 'Cooper',
      farbe: 0x14a64a, farbe2: 0xffffff, farbeName: 'Grün mit weißem Dach',
      karosserie: 'kleinwagen',
      fahrwerte: {
        vMax: 38, beschleunigung: 8, bremsen: 17, rueckwaertsMax: 7,
        wendigkeit: 2.3, grip: 0.9, masse: 1100, laenge: 3.86, breite: 1.73,
      },
      beschreibung: 'Klein und superwendig – durch enge Kurven flitzt er wie ein Floh.',
      generischerName: 'Grüner Flitzer mit weißem Dach',
    },
  ];

  /** Auto per id holen (oder undefined). */
  function finde(id) {
    return katalog.find((a) => a.id === id);
  }

  R.carCatalog = katalog;
  R.carCatalog.KAROSSERIEN = KAROSSERIEN;
  R.carCatalog.finde = finde;
})();
