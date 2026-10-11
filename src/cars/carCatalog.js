// ============================================================
// Auto-Katalog: datengetriebene Liste aller wählbaren Autos.
// Jedes Auto hat Fahrwerte (für Vehicle), eine Karosserie-Form (für den
// carBuilder) und kindgerechte Texte. Neue Autos = nur hier einen Eintrag ergänzen.
//
// Felder je Auto:
//   id, name (Anzeige), marke, modell, generischerName (ohne Markenname),
//   farbe (Hauptfarbe, hex), farbe2 (optional: zweite Farbe, z. B. Dach/Oberteil),
//   farbeName, karosserie (siehe KAROSSERIEN), variante (optional, Feinform),
//   fahrwerte { vMax m/s (Runde 3: 220–270 km/h, als km/h / 3.6 notiert), beschleunigung m/s², bremsen m/s², rueckwaertsMax m/s,
//               wendigkeit rad/s, grip 0..1, masse kg, laenge m, breite m },
//   beschreibung (ein kindgerechter Satz)
//   waehlbar (optional): false = nicht im Spielermenü und NICHT als Computer-Gegner verteilen
//                        (z. B. der Streifenwagen, den nur das Spiel selbst einsetzt). Fehlt das Feld = wählbar.
//   abmessungen { laenge, breite, hoehe, radstand, ueberhangVorn (m), radRadius (+radRadiusHinten),
//                 radBreite (+radBreiteHinten), felgeZoll (+felgeZollHinten) } – echte Maße, nur für die Optik
//                 (die Physik nutzt weiter fahrwerte.laenge/breite)
//   form { … } – Silhouetten-Merkmale für den carBuilder (siehe TYP_STANDARD in carBuilder.js):
//                 Höhen als Anteil von hoehe, Längspositionen als Anteil von laenge (0 = Front, 1 = Heck),
//                 x-Lagen als Anteil der halben Breite, Detailgrößen (b, h) in Metern
//
// Balance: Der Formel-Renner ist das schnellste Auto (280 km/h, extreme Haftung), der Porsche der
// schnellste Straßenwagen, aber rutschiger; der Multivan ist langsam, aber sehr stabil. Kein Auto ist hoffnungslos – wer sauber fährt,
// gewinnt mit jedem (Computergegner werden über tempoFaktor/Gummiband angepasst).
// ============================================================
window.Rennspiel = window.Rennspiel || {};

(function () {
  const R = window.Rennspiel;

  /** Erlaubte Karosserie-Typen (Reihenfolge nur zur Anzeige). */
  const KAROSSERIEN = ['cabrio', 'van', 'limousine', 'sportwagen', 'coupe', 'kombi', 'kleinwagen', 'suv', 'formel'];

  const katalog = [
    {
      id: 'troc-cabrio',
      name: 'VW T-Roc Cabrio',
      marke: 'Volkswagen', modell: 'T-Roc Cabrio',
      farbe: 0x1f7bff, farbeName: 'Blau',
      karosserie: 'cabrio',
      // Quelle Maße: auto-data.net (T-Roc I Cabriolet): 4268 × 1811 × 1522 mm, Radstand 2630; Reifen 215/55 R17
      abmessungen: { laenge: 4.268, breite: 1.811, hoehe: 1.522, radstand: 2.630, ueberhangVorn: 0.87,
        radRadius: 0.334, radBreite: 0.215, felgeZoll: 17 },
      // Merkmale: SUV-Höhe, sehr hohe Gürtellinie, offen mit Verdeckpaket, LED-Leiste vorne, schwarze Radlauf-Verkleidung
      form: {
        sill: 0.165, nase: 0.56, haubeH: 0.655, guertel: 0.67, deck: 0.66, heckH: 0.645,
        scheibeUnten: 0.335, dachVorn: 0.445, dachHoehe: 0.93, verdeck: [0.80, 0.93],
        frontNeigung: 0.12, heckNeigung: 0.12, eckVorn: 0.30, eckHinten: 0.24, kotfluegel: 0.07, wolbung: 0.03,
        tueren: 2, verkleidung: true, spiegelFarbe: 'lack', felgeFarbe: 0xb9bec6,
        licht: { form: 'schmal', x: 0.70, y: 0.525, b: 0.32, h: 0.09 }, tfl: 'leiste', grill: 'leiste', nebel: true,
        rueck: { form: 'eckig', y: 0.585, h: 0.085, x0: 0.50, x1: 0.95 }, endrohre: { n: 0 },
        kennzeichenY: 0.275, kennzeichenHY: 0.47,
      },
      fahrwerte: {
        vMax: 230 / 3.6, beschleunigung: 4.8, bremsen: 20, rueckwaertsMax: 8,
        wendigkeit: 2.0, grip: 0.85, masse: 1400, laenge: 4.27, breite: 1.83,
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
      // Quelle Maße: ADAC Autokatalog T6.1 Multivan: 4904 × 1904 × 1970 mm, Radstand 3000; Reifen 215/60 R17 C
      abmessungen: { laenge: 4.904, breite: 1.904, hoehe: 1.970, radstand: 3.000, ueberhangVorn: 0.99,
        radRadius: 0.345, radBreite: 0.215, felgeZoll: 17 },
      // Merkmale: Kasten, kurze steile Schnauze, riesige Frontscheibe, Fensterreihe, Schiebetür-Schiene, zweifarbig
      form: {
        sill: 0.155, nase: 0.50, haubeH: 0.585, guertel: 0.585, deck: 0.58, heckH: 0.60,
        scheibeUnten: 0.175, dachVorn: 0.31, dachHinten: 0.975, heckscheibeEnde: 0.996, heckTyp: 'steil',
        frontNeigung: 0.12, heckNeigung: 0.04, eckVorn: 0.30, eckHinten: 0.14, tumble: 0.07, wolbung: 0.03,
        kotfluegel: 0.06, zweifarbig: true, schiebetuer: 0.595, tueren: 2,
        fenster: [[0.18, 0.335], [0.36, 0.58], [0.605, 0.83], [0.85, 0.965]], tuerFugen: [0.295, 0.348, 0.595],
        licht: { form: 'eckig', x: 0.66, y: 0.47, b: 0.42, h: 0.17 }, tfl: 'linie', grill: 'van', nebel: true,
        rueck: { form: 'hoch', y: 0.47, h: 0.34, x0: 0.80, x1: 0.93 }, endrohre: { n: 0 }, spoiler: 'dach',
        kennzeichenY: 0.30, kennzeichenHY: 0.50,
      },
      fahrwerte: {
        vMax: 220 / 3.6, beschleunigung: 4.4, bremsen: 18, rueckwaertsMax: 7,
        wendigkeit: 1.6, grip: 0.84, masse: 2200, laenge: 4.97, breite: 1.94,
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
      // Quelle Maße: vehiclesizes.com / VW (Passat B8 Limousine): 4767 × 1832 × 1456 mm, Radstand 2791; Reifen 235/45 R18
      abmessungen: { laenge: 4.767, breite: 1.832, hoehe: 1.456, radstand: 2.791, ueberhangVorn: 0.93,
        radRadius: 0.334, radBreite: 0.235, felgeZoll: 18 },
      // Merkmale: lange flache Limousine mit Stufenheck, Tornado-Linie, breite Front mit waagrechten Chromleisten
      form: {
        sill: 0.135, nase: 0.50, haubeH: 0.59, guertel: 0.635, deck: 0.68, heckH: 0.675,
        scheibeUnten: 0.315, dachVorn: 0.465, dachHinten: 0.655, heckscheibeEnde: 0.83, heckTyp: 'stufe',
        frontNeigung: 0.12, heckNeigung: 0.10, eckVorn: 0.26, eckHinten: 0.26, tumble: 0.17, tornado: true,
        fensterleiste: 'chrom', fenster: [[0.325, 0.535], [0.556, 0.765]], felgeFarbe: 0xcfd3d8,
        licht: { form: 'schmal', x: 0.72, y: 0.48, b: 0.40, h: 0.10 }, tfl: 'linie', grill: 'quer', einlass: 'flach', nebel: true,
        rueck: { form: 'eckig', y: 0.61, h: 0.12, x0: 0.46, x1: 0.95 }, endrohre: { n: 2, form: 'trapez', x: 0.62 },
        kennzeichenY: 0.275, kennzeichenHY: 0.55,
      },
      fahrwerte: {
        vMax: 240 / 3.6, beschleunigung: 5.3, bremsen: 21, rueckwaertsMax: 8,
        wendigkeit: 1.9, grip: 0.87, masse: 1550, laenge: 4.78, breite: 1.83,
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
      // Quelle Maße: Wikipedia Porsche 911 (992): 4519 × 1852 × 1300 mm, Radstand 2450; Räder 20 Zoll vorn / 21 Zoll hinten
      abmessungen: { laenge: 4.519, breite: 1.852, hoehe: 1.300, radstand: 2.450, ueberhangVorn: 1.00,
        radRadius: 0.340, radRadiusHinten: 0.358, radBreite: 0.245, radBreiteHinten: 0.305, felgeZoll: 20, felgeZollHinten: 21 },
      // Merkmale: runde Scheinwerfer auf hohen Kotflügeln, flache Haube, Fließheck, breite Hüften, rote Lichtleiste, Heckspoiler
      form: {
        sill: 0.125, nase: 0.45, haubeH: 0.54, guertel: 0.62, deck: 0.71, heckH: 0.63,
        scheibeUnten: 0.315, dachVorn: 0.445, dachHinten: 0.54, heckscheibeEnde: 0.77, heckTyp: 'fliess',
        frontNeigung: 0.10, heckNeigung: 0.06, eckVorn: 0.50, eckHinten: 0.34, huefteV: 0.02, huefteH: 0.075,
        kotfluegel: 0.09, schulterX: 0.82, tumble: 0.22, tueren: 2,
        fenster: [[0.325, 0.53], [0.545, 0.665]], felgeFarbe: 0x3a3d42,
        licht: { form: 'rund', x: 0.66, y: 0.54, b: 0.21 }, tfl: 'ring', grill: 'keiner', einlass: '911',
        rueck: { form: 'leiste', y: 0.555, h: 0.045, x0: 0.0, x1: 0.93 }, motorgitter: true, spoiler: 'aktiv',
        endrohre: { n: 2, form: 'oval', x: 0.60 }, kennzeichenY: 0.28, kennzeichenHY: 0.39,
      },
      fahrwerte: {
        vMax: 270 / 3.6, beschleunigung: 7.4, bremsen: 25, rueckwaertsMax: 9,
        wendigkeit: 2.1, grip: 0.88, masse: 1450, laenge: 4.55, breite: 1.85,
      },
      beschreibung: 'Das schnellste Auto von allen – aber in den Kurven rutscht es gern mal.',
      generischerName: 'Roter Sportwagen',
    },
    {
      id: 'bmw-m4',
      name: 'BMW M4',
      marke: 'BMW', modell: 'M4 Coupé',
      farbe: 0xffc400, farbe2: 0x2a2c30, farbeName: 'Gelb',
      karosserie: 'coupe',
      // Quelle Maße: vehiclesizes.com / BMW Presse (M4 Coupé G82): 4794 × 1887 × 1393 mm, Radstand 2857; 275/35 R19 / 285/30 R20
      abmessungen: { laenge: 4.794, breite: 1.887, hoehe: 1.393, radstand: 2.857, ueberhangVorn: 0.84,
        radRadius: 0.338, radRadiusHinten: 0.340, radBreite: 0.275, radBreiteHinten: 0.285, felgeZoll: 19, felgeZollHinten: 20 },
      // Merkmale: Coupé mit langer Haube, hoher zweiteiliger dunkler Grill (generisch), breite Kotflügel, dunkles Dach, 4 Endrohre
      form: {
        sill: 0.12, nase: 0.47, haubeH: 0.585, guertel: 0.625, deck: 0.665, heckH: 0.66,
        scheibeUnten: 0.355, dachVorn: 0.485, dachHinten: 0.665, heckscheibeEnde: 0.855, heckTyp: 'stufe',
        frontNeigung: 0.10, heckNeigung: 0.08, eckVorn: 0.26, eckHinten: 0.28, huefteV: 0.035, huefteH: 0.045,
        kotfluegel: 0.03, tumble: 0.17, haubenBuckel: 0.035, kontrastdach: true, tueren: 2,
        fenster: [[0.365, 0.645], [0.657, 0.775]], felgeFarbe: 0x2e3136,
        licht: { form: 'schmal', x: 0.72, y: 0.47, b: 0.38, h: 0.085 }, tfl: 'L', grill: 'doppelt', einlass: 'gross',
        seitenKieme: true, rueck: { form: 'L', y: 0.60, h: 0.07, x0: 0.52, x1: 0.95 },
        endrohre: { n: 4, form: 'rund', x: 0.58 }, diffusor: true, spoiler: 'lippe',
        kennzeichenY: 0.24, kennzeichenHY: 0.43,
      },
      fahrwerte: {
        vMax: 260 / 3.6, beschleunigung: 7.1, bremsen: 24, rueckwaertsMax: 9,
        wendigkeit: 2.2, grip: 0.89, masse: 1650, laenge: 4.79, breite: 1.88,
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
      // Quelle Maße: carexpert.com.au / vehiclesizes.com (AMG GT C190): 4546 × 1939 × 1288 mm, Radstand 2630; 255/35 R19 / 295/30 R20
      abmessungen: { laenge: 4.546, breite: 1.939, hoehe: 1.288, radstand: 2.630, ueberhangVorn: 0.90,
        radRadius: 0.331, radRadiusHinten: 0.343, radBreite: 0.255, radBreiteHinten: 0.295, felgeZoll: 19, felgeZollHinten: 20 },
      // Merkmale: sehr lange Haube, Kabine weit hinten, breiter Grill mit senkrechten Streben, kurzes Fließheck
      form: {
        sill: 0.115, nase: 0.46, haubeH: 0.625, guertel: 0.645, deck: 0.69, heckH: 0.68,
        scheibeUnten: 0.455, dachVorn: 0.565, dachHinten: 0.655, heckscheibeEnde: 0.90, heckTyp: 'fliess',
        frontNeigung: 0.14, heckNeigung: 0.05, eckVorn: 0.36, eckHinten: 0.30, huefteV: 0.03, huefteH: 0.05,
        kotfluegel: 0.05, schulterX: 0.88, tumble: 0.22, tueren: 2, fensterleiste: 'chrom',
        fenster: [[0.47, 0.715]], felgeFarbe: 0x34373c,
        licht: { form: 'schmal', x: 0.72, y: 0.50, b: 0.42, h: 0.075 }, tfl: 'linie', grill: 'senkrecht', einlass: 'gross',
        seitenKieme: true, rueck: { form: 'schmal', y: 0.60, h: 0.06, x0: 0.48, x1: 0.95 },
        endrohre: { n: 4, form: 'trapez', x: 0.60 }, diffusor: true, spoiler: 'lippe',
        kennzeichenY: 0.235, kennzeichenHY: 0.45,
      },
      fahrwerte: {
        vMax: 265 / 3.6, beschleunigung: 7.3, bremsen: 24, rueckwaertsMax: 9,
        wendigkeit: 2.0, grip: 0.9, masse: 1600, laenge: 4.55, breite: 1.94,
      },
      beschreibung: 'Mit der langen Schnauze sieht er aus wie ein Pfeil – und fühlt sich auch so an.',
      generischerName: 'Silberner Rennpfeil',
    },
    {
      id: 'audi-rs6',
      name: 'Audi RS6 Avant',
      marke: 'Audi', modell: 'RS6 Avant',
      farbe: 0x7f858b, farbeName: 'Grau',
      karosserie: 'kombi',
      // Quelle Maße: carexpert.com.au (RS 6 Avant C8): 4995 × 1951 × 1460 mm, Radstand 2929; Reifen 275/35 R21
      abmessungen: { laenge: 4.995, breite: 1.951, hoehe: 1.460, radstand: 2.929, ueberhangVorn: 0.93,
        radRadius: 0.363, radBreite: 0.275, felgeZoll: 21 },
      // Merkmale: langer Kombi, kastige breite Radhäuser, großer dunkler Wabengrill, Dachreling, ovale Endrohre, Dachspoiler
      form: {
        sill: 0.12, nase: 0.49, haubeH: 0.60, guertel: 0.67, deck: 0.70, heckH: 0.70, dachHoehe: 0.97,
        scheibeUnten: 0.305, dachVorn: 0.44, dachHinten: 0.905, heckscheibeEnde: 0.985, heckTyp: 'steil', dachAbfall: 0.06,
        frontNeigung: 0.14, heckNeigung: 0.20, eckVorn: 0.28, eckHinten: 0.20, huefteV: 0.05, huefteH: 0.05,
        kotfluegel: 0.04, tumble: 0.16, dachreling: true, fensterleiste: 'schwarz',
        fenster: [[0.315, 0.515], [0.537, 0.745], [0.765, 0.905]], felgeFarbe: 0x2b2e33,
        licht: { form: 'schmal', x: 0.73, y: 0.49, b: 0.42, h: 0.09 }, tfl: 'linie', grill: 'waben', einlass: 'gross',
        rueck: { form: 'kombi', y: 0.65, h: 0.075, x0: 0.42, x1: 0.95 }, endrohre: { n: 2, form: 'oval', x: 0.62, r: 0.06 },
        diffusor: true, spoiler: 'dach', kennzeichenY: 0.245, kennzeichenHY: 0.425,
      },
      fahrwerte: {
        vMax: 255 / 3.6, beschleunigung: 6.8, bremsen: 23, rueckwaertsMax: 8,
        wendigkeit: 1.8, grip: 0.9, masse: 2000, laenge: 4.99, breite: 1.95,
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
      // Quelle Maße: carexpert.com.au (Mini Cooper 3-Türer F56): 3821 × 1727 × 1414 mm, Radstand 2495; Reifen 195/55 R16
      abmessungen: { laenge: 3.821, breite: 1.727, hoehe: 1.414, radstand: 2.495, ueberhangVorn: 0.72,
        radRadius: 0.310, radBreite: 0.195, felgeZoll: 16 },
      // Merkmale: große runde Scheinwerfer, aufrechte Front, weißes „schwebendes" Dach mit schwarzen Säulen, kurze Überhänge, steiles Heck
      form: {
        sill: 0.135, nase: 0.50, haubeH: 0.62, guertel: 0.64, deck: 0.66, heckH: 0.67,
        scheibeUnten: 0.29, dachVorn: 0.41, dachHinten: 0.93, heckscheibeEnde: 0.99, heckTyp: 'steil',
        frontNeigung: 0.08, heckNeigung: 0.08, eckVorn: 0.30, eckHinten: 0.26, tumble: 0.13, wolbung: 0.035,
        verkleidung: true, kontrastdach: true, schwarzeSaeulen: true, spiegelFarbe: 'dach', streifen: true,
        tueren: 2, fensterleiste: 'chrom', griffFarbe: 'chrom', fenster: [[0.30, 0.64], [0.655, 0.92]],
        licht: { form: 'rund', x: 0.64, y: 0.53, b: 0.25 }, tfl: 'ring', grill: 'sechseck', nebel: true,
        rueck: { form: 'senkrecht', y: 0.57, h: 0.2, x0: 0.62, x1: 0.86 }, endrohre: { n: 2, form: 'rund', x: 0.07, mitte: true },
        kennzeichenY: 0.28, kennzeichenHY: 0.45,
      },
      fahrwerte: {
        vMax: 235 / 3.6, beschleunigung: 5.0, bremsen: 20, rueckwaertsMax: 7,
        wendigkeit: 2.3, grip: 0.9, masse: 1100, laenge: 3.86, breite: 1.73,
      },
      beschreibung: 'Klein und superwendig – durch enge Kurven flitzt er wie ein Floh.',
      generischerName: 'Grüner Flitzer mit weißem Dach',
    },
    {
      id: 'formel',
      name: 'Formel-Renner',
      marke: 'Rennwagen', modell: 'Formel-Monoposto',
      farbe: 0x16337e, farbe2: 0xf4f6f8, farbeName: 'Dunkelblau-Weiß',
      karosserie: 'formel',
      // Generischer Monoposto (keine Teamfarben, keine Sponsoren): Maße angelehnt an aktuelle Formel-Autos
      // (ca. 5,5 × 2,0 × 0,95 m, Radstand 3,6 m); Räder vorn kleiner als hinten, breite Slicks ohne Radhäuser.
      abmessungen: { laenge: 5.5, breite: 2.0, hoehe: 0.95, radstand: 3.6, ueberhangVorn: 1.0,
        radRadius: 0.33, radRadiusHinten: 0.36, radBreite: 0.30, radBreiteHinten: 0.40, felgeZoll: 18 },
      // Merkmale für den Baukasten (siehe baueFormel in carBuilder.js): Startnummer 1 (generisch), gelber Helm
      form: { nummer: 1, helm: 0xffcc1a, felgeFarbe: 0x2a2d33 },
      fahrwerte: {
        vMax: 280 / 3.6, beschleunigung: 12, bremsen: 26, rueckwaertsMax: 8,
        wendigkeit: 2.3, grip: 0.97, masse: 800, laenge: 5.5, breite: 2.0,
      },
      beschreibung: 'Ein echter Rennwagen mit Flügeln: superschnell und klebt in den Kurven wie Kaugummi!',
      generischerName: 'Blau-weißer Formel-Renner',
    },
    {
      id: 'polizei',
      name: 'Streifenwagen',
      marke: 'Einsatzwagen', modell: 'Streifenwagen Kombi',
      farbe: 0xf3f4f1, farbe2: 0x1d4fb0, farbeName: 'Weiß mit blauen Streifen',
      karosserie: 'kombi',
      waehlbar: false,                 // nicht im Spielermenü, kein Computer-Gegner – setzt nur das Spiel ein
      // Generischer Kombi (kein echtes Behördendesign, kein Wappen, kein Schriftzug); Maße wie ein Mittelklasse-Kombi
      abmessungen: { laenge: 4.85, breite: 1.85, hoehe: 1.48, radstand: 2.84, ueberhangVorn: 0.90,
        radRadius: 0.334, radBreite: 0.225, felgeZoll: 17 },
      // Merkmale: weiß, blau-silberne Seitenstreifen, Blaulichtbalken auf dem Dach (userData.blaulicht)
      form: {
        sill: 0.13, nase: 0.49, haubeH: 0.60, guertel: 0.665, deck: 0.70, heckH: 0.70,
        scheibeUnten: 0.31, dachVorn: 0.45, dachHinten: 0.90, heckscheibeEnde: 0.985, heckTyp: 'steil', dachAbfall: 0.04,
        frontNeigung: 0.13, heckNeigung: 0.18, eckVorn: 0.28, eckHinten: 0.22, kotfluegel: 0.05, tumble: 0.15,
        dachreling: false, fensterleiste: 'schwarz', felgeFarbe: 0xc2c7cd, spiegelFarbe: 'schwarz',
        flankenStreifen: { 2: 'farbe2', 3: 0x98a2ae }, blaulicht: true,
        licht: { form: 'schmal', x: 0.72, y: 0.49, b: 0.40, h: 0.10 }, tfl: 'linie', grill: 'quer', einlass: 'flach',
        rueck: { form: 'kombi', y: 0.65, h: 0.08, x0: 0.42, x1: 0.95 }, endrohre: { n: 0 }, spoiler: 'dach',
        kennzeichenY: 0.26, kennzeichenHY: 0.43,
      },
      fahrwerte: {
        vMax: 62, beschleunigung: 9.5, bremsen: 22, rueckwaertsMax: 8,
        wendigkeit: 2.0, grip: 0.9, masse: 1700, laenge: 4.85, breite: 1.85,
      },
      beschreibung: 'Mit Blaulicht auf dem Dach passt der Streifenwagen auf, dass alle fair fahren.',
      generischerName: 'Streifenwagen',
    },
  ];

  /** Auto per id holen (oder undefined). */
  function finde(id) {
    return katalog.find((a) => a.id === id);
  }

  /** Nur die für Spieler (und Computer-Gegner) wählbaren Autos (waehlbar !== false). */
  function waehlbare() {
    return katalog.filter((a) => a.waehlbar !== false);
  }

  R.carCatalog = katalog;
  R.carCatalog.KAROSSERIEN = KAROSSERIEN;
  R.carCatalog.finde = finde;
  R.carCatalog.waehlbare = waehlbare;
})();
