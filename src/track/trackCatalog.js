// ============================================================
// Streckenkatalog
// Jede Strecke: geschlossene Runde aus Kontrollpunkten [x, y, z] in
// Fahrtrichtung, Punkt 0 = Start/Ziel (auf einer Geraden).
// Die Punkte wurden aus Bausteinen erzeugt (G = Gerade in m, K = Kreisbogen
// Radius/Winkel in Grad, + = rechts, G? = Länge für den Rundenschluss gelöst)
// und die Höhe y aus den Hügeln berechnet:
//   y = Summe h * exp(-Abstand² / (2 r²))
// Die Hügel beschreiben zugleich das Gelände neben der Strecke.
// Wald/Wüste erzeugt mit tests/bauplan/generator.js (G? = zwei Geraden, die die Runde schließen).
// Runde 3: Hügel kräftiger (Wald/Wüste bis ±14 m, Wiese ±6 m, Steigung ≤ 8 %), y neu aus den Hügeln.
// Streckenelemente je Strecke (Bogenlänge s in m, siehe trackBuilder.js):
//   bruecken:    [{ s0, s1, art: 'holz' | 'stein' | 'stahl', tiefe }]  Boden darunter abgesenkt (Bach/Teich/Schlucht)
//   tunnel:      [{ s0, s1, art: 'fels' | 'sandstein' }]                Röhre mit Lampen, Scheinwerfer an
//   hindernisse: [{ typ: 'oel' | 'sand' | 'baustelle' | 'ast', s, seite (-1..1), breite? }]  Werte: config.hindernisse
//   loopings:    [{ s, radius }]                                        Fantasie: Looping (track/looping.js)
//   baelle:      [{ s, von, abRunde, intervall, tempo, radius, farbe }] Fantasie: rollende Bälle (world/dynamik.js)
//   wasserstrahlen: [{ s, seitenabstand, intervall, dauer, vorwarnung }] Fantasie: Fontänen (world/dynamik.js)
// Bitte nicht auf Start/Ziel, nicht in Tunnel/Brücke (± 20 m) und nicht direkt vor eine Haarnadel legen –
// tests/test_strecke.js prüft das.
//
// Runde 4 (11.10.2026):
// - F1 Längen: Wiese ×1,35 (3.040 m), Wald ×1,25 (2.477 m), Wüste ×1,45 (3.331 m). Kontrollpunkte und Hügel
//   (x, z, r) um den Schwerpunkt skaliert, Höhen h unverändert (Steigung ≤ 8 % bleibt), alle s-Werte × Faktor.
//   Fantasie unverändert.
// - Welten (Add-on je Strecke, Menü Strecke → Welt): welten { name: { schicht: bool } }, weltStandard.
//   Schichten: hindernisse, wracks, strohballen, spuren, schanzen, baelle, wasserstrahlen, boost, schild (+ loopings).
//   new R.Strecke(daten, { welt }) filtert (trackBuilder.js). Namen/Texte fürs Menü: R.weltInfo.
// - Neue Listen (Bogenlänge s in m; Grafik/Physik folgt in Welle 2):
//   spuren:      [{ s0, s1, spuren: 1 | 3 }]       1 Spur = 5 m mit Leitplanke, 3 Spuren = 15 m; 40 m Übergang
//   wracks:      [{ s, seitenabstand, brennt, autoId }]   liegengebliebenes (brennendes) Auto (autoId aus carCatalog)
//   strohballen: [{ s, von: -1 | 1, intervall, tempo }]   rollen quer über die Straße (von = Seite, s, m/s)
//   schanzen:    [{ s, winkel: 8 | 12, laenge: 10 }]      nur auf Geraden mit ≥ 60 m freier Landung
//   boostFelder: [{ s, seitenabstand, laenge: 12 }]       +25 % Tempo für 2,5 s (Welt „Verrückt")
//   schilde:     [{ s, seitenabstand }]                   Schutzschild-Pickup (Welt „Verrückt")
//   Nicht in Tunnel/Brücke/Looping/Haarnadel/Spur-Abschnitt (1 Spur), nicht auf Hindernissen –
//   tests/test_strecke.js prüft alle Listen.
// ============================================================
(function () {
  const R = window.Rennspiel;

  // ---------- Welten ----------
  // Anzeige fürs Menü (menu.js): Name, Emoji, Kurzbeschreibung
  R.weltInfo = {
    klassisch:   { name: 'Klassisch',   emoji: '🏁', beschreibung: 'Nur die Strecke – ohne Hindernisse.' },
    hindernisse: { name: 'Hindernisse', emoji: '🚧', beschreibung: 'Öl, Sand, Baustelle, Äste, liegengebliebene Autos und Strohballen.' },
    stunt:       { name: 'Stunt',       emoji: '🛫', beschreibung: 'Dazu Sprungschanzen und enge (1 Spur) oder breite (3 Spuren) Stellen.' },
    verrueckt:   { name: 'Verrückt',    emoji: '🤪', beschreibung: 'Dazu Bälle, Wasserfontänen, Turbo-Felder und Schutzschilde.' },
    fantasie:    { name: 'Fantasie',    emoji: '🌈', beschreibung: 'Loopings, Bälle und Wasserfontänen.' },
  };
  // Bausteine: jede Welt baut auf der vorigen auf (Klassisch → Hindernisse → Stunt → Verrückt)
  const AUS = { hindernisse: false, wracks: false, strohballen: false, spuren: false, schanzen: false,
    baelle: false, wasserstrahlen: false, boost: false, schild: false, loopings: false };
  const W_KLASSISCH = Object.assign({}, AUS);
  const W_HINDERNISSE = Object.assign({}, W_KLASSISCH, { hindernisse: true, wracks: true, strohballen: true });
  const W_STUNT = Object.assign({}, W_HINDERNISSE, { spuren: true, schanzen: true });
  const W_VERRUECKT = Object.assign({}, W_STUNT, { baelle: true, wasserstrahlen: true, boost: true, schild: true });
  /** Die vier Standard-Welten (Kopien), optional mit Änderungen für alle Welten (z. B. { strohballen: false }). */
  function vierWelten(aenderung) {
    const a = aenderung || {};
    const mit = (w) => Object.assign({}, w, Object.keys(a).reduce((o, k) => { if (w[k]) o[k] = a[k]; return o; }, {}));
    return { klassisch: mit(W_KLASSISCH), hindernisse: mit(W_HINDERNISSE), stunt: mit(W_STUNT), verrueckt: mit(W_VERRUECKT) };
  }

  R.trackCatalog = [
    {
      id: 'wiese',
      name: 'Wiese',
      thema: 'wiese',
      beschreibung: 'Grüne Hügel, Kühe und Heuballen: lange Start-Gerade, schnelle S-Kurve, ' +
        'eine enge Haarnadel und die Steinbrücke über den Teich.',
      schwierigkeit: 'leicht',
      breite: 14,               // Straßenbreite (m)
      randBreite: 1.5,          // Randstreifen je Seite (m)
      checkpointAbstand: 120,   // ungefährer Abstand der Checkpoints (m)
      zielRundenzeit: 120,      // Richtwert für eine gute Runde (s)
      abseitsUntergrund: 'gras', // Untergrund neben Straße und Randstreifen
      // Runde 4: Standard „Klassisch" (F4: Wiese ohne Hindernisse); Hindernisse nur in den anderen Welten
      weltStandard: 'klassisch',
      welten: vierWelten(),
      // Streckenelemente (Bogenlänge s in m): Brücke über eine Senke mit Teich/Bach
      bruecken: [{ s0: 2626, s1: 2693, art: 'stein', tiefe: 5 }],
      tunnel: [],
      // Hindernisse: typ (config.hindernisse), s = Mitte (Baustelle: Beginn der Sperrung),
      // seite = Anteil der halben Breite (-1 links … +1 rechts, Baustelle: gesperrte Hälfte)
      hindernisse: [
        { typ: 'sand', s: 648, seite: -0.35 },
        { typ: 'baustelle', s: 1107, seite: 1 },
        { typ: 'ast', s: 1755, seite: -1 },
      ],
      // Runde 4 – Welten-Schichten (s in m)
      spuren: [
        { s0: 1210, s1: 1330, spuren: 1 },     // enge Stelle auf der langen Geraden nach der Baustelle
        { s0: 2250, s1: 2420, spuren: 3 },     // breite Kurve vor der Brücke
      ],
      wracks: [
        { s: 705, seitenabstand: 4, brennt: false, autoId: 'multivan' },
        { s: 2030, seitenabstand: -4, brennt: true, autoId: 'bmw-m4' },
      ],
      strohballen: [
        { s: 900, von: 1, intervall: 10, tempo: 4 },
        { s: 2500, von: -1, intervall: 12, tempo: 4 },
      ],
      schanzen: [
        { s: 75, winkel: 8, laenge: 10 },
        { s: 2730, winkel: 12, laenge: 10 },
      ],
      boostFelder: [
        { s: 1660, seitenabstand: 3, laenge: 12 },
        { s: 2565, seitenabstand: 0, laenge: 12 },
      ],
      schilde: [
        { s: 780, seitenabstand: 2 },
        { s: 2140, seitenabstand: -2 },
      ],
      baelle: [
        { s: 1440, von: -1, abRunde: 2, intervall: 8, tempo: 9, radius: 2.2, farbe: 0xff4fa3 },
        { s: 2160, von: 1, abRunde: 'letzte', intervall: 8, tempo: 9, radius: 2.2, farbe: 0x4fc3ff },
      ],
      wasserstrahlen: [
        { s: 1900, seitenabstand: 3, intervall: 20, dauer: 2, vorwarnung: 1 },
      ],
      // Bauplan (Runde 3, vor ×1,35 um den Schwerpunkt):
      // G143 K38/90 G66 K35/-90 G55 K35/90 G121 K44/45 G33 K110/-40 K110/40 G? K50/-45 G44 K30/180
      // G132 K50/-60 G28 K44/60 G77 K44/-80 G61 K33/160 G61 K44/-80 G? K42/rest G77
      huegel: [
        { x: 357.5, z: -43.3, r: 148.5, h: 7 },
        { x: 47, z: 348.2, r: 121.5, h: -6.5 },
        { x: 708.5, z: -286.3, r: 162, h: 6.5 },
        { x: 465.5, z: 334.7, r: 108, h: 4.5 },
      ],
      punkte: [
        [-128.5, -0.02, 10.7], [-128.5, 0.02, -37.5], [-128.5, 0.03, -85.8], [-128.5, 0.03, -134], [-128.5, 0.02, -182.3], [-126.8, 0.02, -195.8],
        [-121.5, 0.02, -208.2], [-113.3, 0.02, -219], [-102.6, 0.03, -227.3], [-90, 0.03, -232.5], [-76.5, 0.04, -234.3], [-32, 0.1, -234.3],
        [12.6, 0.21, -234.3], [24.9, 0.25, -235.9], [36.3, 0.28, -240.6], [46.2, 0.3, -248.2], [53.7, 0.31, -258.1], [58.5, 0.29, -269.5],
        [60.1, 0.26, -281.8], [60.1, 0.17, -318.9], [60.1, 0.1, -356.1], [61.7, 0.09, -368.4], [66.4, 0.08, -379.8], [74, 0.08, -389.7],
        [83.8, 0.08, -397.2], [95.3, 0.08, -402], [107.6, 0.09, -403.6], [148.5, 0.15, -403.6], [189.3, 0.22, -403.6], [230.2, 0.32, -403.6],
        [271, 0.44, -403.6], [286.3, 0.51, -401.6], [300.7, 0.61, -395.6], [312.9, 0.74, -386.2], [344.4, 1.25, -354.7], [355.5, 1.46, -344.7],
        [367.3, 1.68, -336], [380, 1.9, -328.4], [393.5, 2.12, -322.2], [407.4, 2.34, -317.3], [421.9, 2.55, -313.8], [436.5, 2.75, -311.8],
        [451.2, 2.97, -309.8], [465.6, 3.22, -306.3], [479.5, 3.49, -301.4], [493, 3.78, -295.1], [505.7, 4.07, -287.5], [517.6, 4.36, -278.7],
        [528.5, 4.62, -268.9], [563.6, 5.31, -233.9], [598.6, 5.55, -198.8], [633.6, 5.28, -163.8], [668.5, 4.59, -128.9], [703.5, 3.65, -93.9],
        [738.5, 2.64, -58.9], [773.6, 1.75, -24], [783.7, 1.56, -15.6], [795.2, 1.4, -9.4], [807.7, 1.27, -5.6], [820.8, 1.18, -4.4],
        [850.5, 1, -4.4], [880.2, 0.83, -4.4], [890.5, 0.76, -3], [900.2, 0.68, 1], [908.6, 0.59, 7.3], [914.9, 0.51, 15.7],
        [918.8, 0.45, 25.3], [920.3, 0.39, 35.7], [918.8, 0.35, 46.1], [914.9, 0.32, 55.8], [908.6, 0.3, 64], [900.2, 0.29, 70.5],
        [890.5, 0.3, 74.4], [880.2, 0.32, 75.8], [835.7, 0.42, 75.8], [791.1, 0.54, 75.8], [746.6, 0.69, 75.8], [702, 0.9, 75.8],
        [688.1, 0.97, 77.3], [674.7, 1.03, 81.6], [662.7, 1.06, 88.6], [652.3, 1.08, 97.9], [644.1, 1.08, 109.3], [625.5, 1.11, 141.4],
        [616, 1.19, 153.7], [603.7, 1.35, 163.1], [589.4, 1.56, 169.1], [574, 1.8, 171.1], [522.1, 2.64, 171.1], [470.1, 3.31, 171.1],
        [456.4, 3.43, 172.7], [443.5, 3.5, 177.4], [431.9, 3.54, 185], [422.4, 3.55, 195], [415.5, 3.56, 207], [411.6, 3.59, 220.2],
        [404.5, 3.79, 260.3], [397.5, 3.88, 300.6], [394.1, 3.82, 311.4], [388.1, 3.67, 321], [380, 3.43, 328.8], [370.2, 3.14, 334.2],
        [359.2, 2.8, 337], [347.9, 2.45, 337], [337, 2.12, 334.2], [327.1, 1.82, 328.8], [319, 1.6, 321], [313.1, 1.45, 311.4],
        [309.7, 1.39, 300.6], [302.5, 1.4, 260.3], [295.5, 1.61, 220.2], [291.6, 1.71, 207], [284.7, 1.76, 195], [275.1, 1.75, 185],
        [263.7, 1.68, 177.4], [250.7, 1.52, 172.7], [237.1, 1.27, 171.1], [185.5, 0.14, 171.1], [133.9, -0.93, 171.1], [82.5, -1.71, 171.1],
        [30.9, -2.01, 171.1], [-20.5, -1.83, 171.1], [-72.1, -1.35, 171.1], [-86.7, -1.17, 169.2], [-100.3, -0.96, 163.5], [-112, -0.76, 154.6],
        [-120.9, -0.58, 142.9], [-126.6, -0.44, 129.3], [-128.5, -0.34, 114.7], [-128.5, -0.12, 62.7],
      ],
    },
    {
      id: 'wald',
      name: 'Wald',
      thema: 'wald',
      beschreibung: 'Dunkler Tannenwald: viele S-Kurven, ein Felstunnel und ein Baumtunnel, ' +
        'steil rauf und runter und über die Holzbrücke am Bach.',
      schwierigkeit: 'mittel',
      breite: 12,
      randBreite: 1.5,
      zaunAbstand: 10,          // Zaun näher an der Straße (dichter Wald dahinter)
      abseitsUntergrund: 'gras',
      checkpointAbstand: 110,
      zielRundenzeit: 125,
      weltStandard: 'hindernisse',
      welten: vierWelten(),
      // Deko-Hinweise für themes.js / trackBuilder.js (Bogenlänge s in m)
      baumtunnel: { von: 1000, bis: 1088 },
      bruecken: [{ s0: 1844, s1: 1894, art: 'holz', tiefe: 5 }],   // Holzbrücke über den Bach
      tunnel: [{ s0: 862, s1: 975, art: 'fels' }],                  // Felstunnel mit Steinportal
      hindernisse: [
        { typ: 'oel', s: 800, seite: 0.3 },
        { typ: 'ast', s: 1312, seite: 1 },
        { typ: 'baustelle', s: 2238, seite: -1 },
        { typ: 'sand', s: 375, seite: -0.3 },
      ],
      // Runde 4 – Welten-Schichten (s in m)
      spuren: [
        { s0: 455, s1: 585, spuren: 1 },       // enger Waldweg durch die S-Kurven
        { s0: 1960, s1: 2120, spuren: 3 },     // breit nach der Holzbrücke
      ],
      wracks: [
        { s: 1520, seitenabstand: -3.5, brennt: false, autoId: 'passat' },
        { s: 2350, seitenabstand: 3.5, brennt: true, autoId: 'multivan' },
      ],
      strohballen: [
        { s: 700, von: -1, intervall: 10, tempo: 4 },
        { s: 1630, von: 1, intervall: 12, tempo: 4 },
      ],
      schanzen: [
        { s: 65, winkel: 8, laenge: 10 },
        { s: 2082, winkel: 12, laenge: 10 },
      ],
      boostFelder: [
        { s: 1010, seitenabstand: 0, laenge: 12 },
        { s: 2398, seitenabstand: 2, laenge: 12 },
      ],
      schilde: [
        { s: 1450, seitenabstand: 0 },
        { s: 2300, seitenabstand: -2 },
      ],
      baelle: [
        { s: 1360, von: 1, abRunde: 2, intervall: 8, tempo: 9, radius: 2.2, farbe: 0xff4fa3 },
        { s: 1720, von: -1, abRunde: 'letzte', intervall: 8, tempo: 9, radius: 2.2, farbe: 0xffd23a },
      ],
      wasserstrahlen: [
        { s: 1580, seitenabstand: -2, intervall: 20, dauer: 2, vorwarnung: 1 },
      ],
      // Bauplan (Runde 3, vor ×1,25 um den Schwerpunkt; tests/bauplan/wald.json):
      // G120 K32/90 G30 K34/-60 K34/60 G40 K40/45 K32/-70 K32/70 G40 K36/-55 K36/110 K36/-55 G30
      // K42/-40 K42/40 G? K30/45 G60 K28/180 G30 K30/-90 K34/60 K34/-60 G50 K38/-60 K38/120 K38/-60 G20
      // K32/90 G90 K30/-180 G90 K32/90 G? K35/rest G70
      huegel: [
        { x: 131.6, z: -253.4, r: 156.3, h: 14 },
        { x: 356.6, z: 234.1, r: 150, h: -13 },
        { x: 631.6, z: 71.6, r: 150, h: 7 },
      ],
      punkte: [
        [-68.4, 1.65, -3.4], [-68.4, 2.41, -40.9], [-68.4, 3.27, -78.4], [-68.4, 4.18, -115.9], [-68.4, 5.02, -153.4], [-67, 5.29, -163.8],
        [-63, 5.65, -173.4], [-56.6, 6.1, -181.7], [-48.4, 6.6, -188.1], [-38.8, 7.15, -192.1], [-28.4, 7.69, -193.4], [9.1, 9.55, -193.4],
        [20.1, 10.1, -194.9], [30.4, 10.67, -199.2], [39.1, 11.2, -205.9], [45.9, 11.67, -214.7], [52.6, 12.08, -223.4], [61.5, 12.51, -230.2],
        [71.7, 12.9, -234.4], [82.7, 13.23, -235.9], [107.7, 13.73, -235.9], [132.7, 13.88, -235.9], [142.5, 13.84, -234.9], [151.9, 13.72, -232.2],
        [160.5, 13.53, -227.6], [168.1, 13.29, -221.3], [177.9, 12.92, -214.1], [189.4, 12.51, -210.2], [201.6, 12.11, -209.9], [213.2, 11.75, -213.3],
        [225, 11.32, -216.7], [237.1, 10.77, -216.4], [248.6, 10.15, -212.6], [258.5, 9.52, -205.3], [276.1, 8.24, -187.7], [293.9, 6.92, -170.1],
        [302.2, 6.36, -163.3], [312.1, 5.81, -158.9], [322.7, 5.32, -156.9], [333.5, 4.92, -157.6], [345.7, 4.47, -157.9], [357.7, 4.01, -155.1],
        [368.5, 3.57, -149.1], [377.1, 3.18, -140.3], [383.1, 2.85, -129.7], [386, 2.57, -117.7], [385.6, 2.31, -105.3], [385, 2.07, -94.6],
        [387, 1.79, -84.1], [391.4, 1.5, -74.2], [398.1, 1.26, -65.7], [424.6, 0.77, -39.2], [434.1, 0.74, -31.7], [445.2, 0.85, -26.6],
        [457.1, 1.09, -24.1], [469.1, 1.37, -21.6], [480.1, 1.61, -16.4], [489.7, 1.81, -8.8], [520.2, 2.53, 21.7], [550.7, 3.36, 52.2],
        [581.2, 4.07, 82.7], [611.9, 4.48, 113.3], [642.4, 4.46, 143.8], [648.4, 4.35, 151.6], [652.1, 4.16, 160.6], [653.4, 3.9, 170.3],
        [653.4, 2.78, 207.8], [653.4, 1.71, 245.3], [651.2, 1.36, 257.3], [645.1, 0.97, 267.8], [635.9, 0.57, 275.6], [624.4, 0.15, 279.8],
        [612.2, -0.26, 279.8], [600.9, -0.6, 275.6], [591.5, -0.85, 267.8], [585.5, -0.91, 257.3], [583.4, -0.73, 245.3], [583.4, 0.32, 207.8],
        [581.5, 0.6, 196.2], [576.1, 0.67, 185.8], [567.9, 0.51, 177.4], [557.4, 0.08, 172.2], [545.9, -0.56, 170.3], [534.9, -1.21, 168.8],
        [524.6, -1.74, 164.6], [515.7, -2.08, 157.8], [509, -2.19, 149.1], [502.2, -2.29, 140.3], [493.5, -2.6, 133.6], [483.2, -3.09, 129.3],
        [472.2, -3.74, 127.8], [441, -5.62, 127.8], [409.7, -7.17, 127.8], [397.5, -7.73, 129.4], [386, -8.36, 134.2], [376.1, -9.02, 141.7],
        [368.6, -9.68, 151.6], [361, -10.26, 161.4], [351.2, -10.7, 168.9], [339.7, -10.94, 173.7], [327.5, -10.96, 175.3], [315.1, -10.77, 173.7],
        [303.7, -10.4, 168.9], [293.9, -9.89, 161.4], [286.4, -9.29, 151.6], [278.7, -8.63, 141.7], [269, -8, 134.2], [257.5, -7.4, 129.4],
        [245.2, -6.89, 127.8], [220.2, -5.93, 127.8], [209.9, -5.46, 126.4], [200.2, -4.91, 122.4], [191.9, -4.34, 116.1], [185.5, -3.76, 107.8],
        [181.5, -3.23, 98.2], [180.2, -2.74, 87.8], [180.2, -0.98, 50.3], [180.2, 1.01, 12.8], [180.2, 3.17, -24.7], [178.4, 3.89, -36.3],
        [173, 4.62, -46.7], [164.7, 5.27, -55.1], [154.2, 5.73, -60.3], [142.7, 5.96, -62.2], [131.1, 5.93, -60.3], [120.6, 5.67, -55.1],
        [112.4, 5.21, -46.7], [107, 4.64, -36.3], [105.2, 4.02, -24.7], [105.2, 2.18, 12.8], [105.2, 0.6, 50.3], [105.2, -0.69, 87.8],
        [103.9, -0.97, 98.2], [99.9, -1.15, 107.8], [93.5, -1.21, 116.1], [85.2, -1.16, 122.4], [75.5, -1.04, 126.4], [65.2, -0.87, 127.8],
        [35.2, -0.42, 127.8], [5.4, -0.14, 127.8], [-24.6, 0.03, 127.8], [-36, 0.09, 126.3], [-46.5, 0.14, 121.9], [-55.5, 0.21, 114.9],
        [-62.5, 0.28, 105.9], [-66.9, 0.36, 95.4], [-68.4, 0.46, 84.1], [-68.4, 0.95, 40.3],
      ],
    },
    {
      id: 'wueste',
      name: 'Wüste',
      thema: 'wueste',
      beschreibung: 'Breite Piste durch Sand und Dünen: Tunnel unter der großen Düne, Brücke über ' +
        'die Schlucht, flotte Schikanen. Vorsicht, im Sand rutscht es!',
      schwierigkeit: 'schnell',
      breite: 15,
      randBreite: 1.5,
      abseitsUntergrund: 'sand',
      weltStandard: 'hindernisse',
      welten: vierWelten({ strohballen: false }),   // Strohballen nur Wiese/Wald (Plan Runde 4)
      bruecken: [{ s0: 2501, s1: 2574, art: 'stahl', tiefe: 12 }],  // Brücke über eine Schlucht
      tunnel: [{ s0: 188, s1: 319, art: 'sandstein' }],             // Sandstein-Tunnel unter der großen Düne
      hindernisse: [
        { typ: 'sand', s: 609, seite: 0.3 },
        { typ: 'sand', s: 1812, seite: -0.4 },
        { typ: 'oel', s: 2175, seite: 0.2 },
        { typ: 'baustelle', s: 1102, seite: 1 },
      ],
      // Runde 4 – Welten-Schichten (s in m)
      spuren: [
        { s0: 1210, s1: 1400, spuren: 1 },     // enge Piste auf der langen Geraden nach der Baustelle
        { s0: 3000, s1: 3150, spuren: 3 },     // Schikane vor dem Ziel mit drei Spuren
      ],
      wracks: [
        { s: 760, seitenabstand: -5, brennt: true, autoId: 'porsche-911' },
        { s: 2720, seitenabstand: 5, brennt: false, autoId: 'multivan' },
      ],
      strohballen: [],
      schanzen: [
        { s: 345, winkel: 8, laenge: 10 },
        { s: 2012, winkel: 12, laenge: 10 },
        { s: 2810, winkel: 12, laenge: 10 },
      ],
      boostFelder: [
        { s: 1000, seitenabstand: -3.5, laenge: 12 },
        { s: 3185, seitenabstand: 0, laenge: 12 },
      ],
      schilde: [
        { s: 1700, seitenabstand: 2 },
        { s: 2380, seitenabstand: -2 },
      ],
      baelle: [
        { s: 1600, von: -1, abRunde: 2, intervall: 8, tempo: 9, radius: 2.2, farbe: 0xff4fa3 },
        { s: 2930, von: 1, abRunde: 'letzte', intervall: 8, tempo: 9, radius: 2.2, farbe: 0x4fc3ff },
      ],
      wasserstrahlen: [
        { s: 900, seitenabstand: -3, intervall: 20, dauer: 2, vorwarnung: 1 },
      ],
      checkpointAbstand: 130,
      zielRundenzeit: 125,
      // Bauplan (Runde 3, vor ×1,45 um den Schwerpunkt; tests/bauplan/wueste.json):
      // G340 K110/180 G330 K30/-55 K30/110 K30/-55 G30 K50/-90 G60 K45/90 G? K50/90 G70 K40/-60 K40/60
      // G? K50/90 G140 K30/55 K30/-110 K30/55 G120
      // Dünen: die ersten Hügel formen die Piste sanft, die übrigen liegen weit draußen (nur Landschaft)
      huegel: [
        { x: 88.7, z: -341.3, r: 159.5, h: 20 },
        { x: 88.7, z: 398.2, r: 87, h: 5 },
        { x: 349.7, z: 412.7, r: 130.5, h: -12 },
        { x: -317.3, z: -297.8, r: 116, h: 9 },
        { x: 567.2, z: -225.3, r: 130.5, h: 10 },
        { x: 248.2, z: -819.8, r: 130.5, h: 8 },
        { x: -244.8, z: 427.2, r: 116, h: 7 },
        { x: 654.2, z: 470.7, r: 130.5, h: 9 },
        { x: 426.5, z: 1023.2, r: 94.3, h: 9.5 },
        { x: -507.3, z: 795.5, r: 94.3, h: 12.5 },
        { x: 910.8, z: 715.8, r: 74, h: 13.5 },
        { x: 806.4, z: -647.2, r: 84.1, h: 10.5 },
        { x: 805, z: -373.2, r: 84.1, h: 14 },
        { x: 564.3, z: -771.9, r: 88.5, h: 14 },
        { x: 16.2, z: -951.7, r: 84.1, h: 14.5 },
        { x: 496.1, z: -986.5, r: 76.9, h: 8 },
        { x: -816.1, z: 127.1, r: 91.4, h: 12.5 },
        { x: -447.8, z: 56, r: 87, h: 14.5 },
        { x: 1163.1, z: 2.4, r: 76.9, h: 13.5 },
        { x: 509.2, z: 753.5, r: 74, h: 11.5 },
      ],
      punkte: [
        [-70.8, 1.41, -7.8], [-70.8, 2.59, -57.1], [-70.8, 4.34, -106.4], [-70.8, 6.61, -155.7], [-70.8, 9.1, -205], [-70.8, 11.33, -254.3],
        [-70.8, 12.74, -303.6], [-70.8, 12.94, -352.9], [-70.8, 11.91, -402.2], [-70.8, 9.95, -451.5], [-70.8, 7.58, -500.8], [-70.2, 6.91, -515.1],
        [-68.2, 6.32, -529.2], [-65, 5.78, -543.2], [-60.7, 5.3, -556.9], [-55, 4.9, -569.9], [-48.2, 4.56, -582.5], [-40.4, 4.26, -594.6],
        [-31.4, 4.04, -605.7], [-21.5, 3.87, -616], [-10.8, 3.75, -625.5], [0.8, 3.69, -633.9], [13.1, 3.69, -641.3], [26, 3.74, -647.4],
        [39.4, 3.85, -652.4], [53.2, 4, -656.2], [67.2, 4.19, -658.8], [81.6, 4.41, -660.1], [95.8, 4.65, -660.1], [110.1, 4.89, -658.8],
        [124.2, 5.11, -656.2], [138, 5.31, -652.4], [151.3, 5.48, -647.4], [164.2, 5.61, -641.3], [176.6, 5.69, -633.9], [188.2, 5.74, -625.5],
        [198.9, 5.78, -616], [208.7, 5.81, -605.7], [217.7, 5.85, -594.6], [225.6, 5.93, -582.5], [232.4, 6.05, -569.9], [238, 6.24, -556.9],
        [242.4, 6.51, -543.2], [245.6, 6.86, -529.2], [247.6, 7.29, -515.1], [248.2, 7.82, -500.8], [248.2, 9.76, -452.9], [248.2, 11.44, -405.1],
        [248.2, 12.39, -357.2], [248.2, 12.3, -309.4], [248.2, 11.19, -261.5], [248.2, 9.31, -213.7], [248.2, 7.08, -165.8], [248.2, 4.91, -118],
        [248.2, 3.1, -70.1], [248.2, 1.76, -22.3], [250.4, 1.44, -8.6], [256.7, 1.17, 3.7], [266.7, 0.95, 13.4], [276.6, 0.75, 23],
        [283.1, 0.55, 35.3], [285.3, 0.36, 48.9], [283.1, 0.18, 62.7], [276.6, 0.03, 75], [266.7, -0.07, 84.6], [256.7, -0.17, 94.3],
        [250.4, -0.32, 106.6], [248.2, -0.51, 120.3], [248.2, -1.32, 163.8], [249.6, -1.67, 178], [253.7, -2.07, 191.5], [260.4, -2.54, 204.1],
        [269.4, -3.05, 215.1], [280.4, -3.56, 224.1], [293, -4.03, 230.8], [306.5, -4.38, 234.8], [320.7, -4.59, 236.3], [364.2, -4.61, 236.3],
        [407.7, -4.05, 236.3], [420.4, -3.83, 237.6], [432.6, -3.67, 241.2], [443.9, -3.56, 247.3], [453.8, -3.5, 255.4], [461.9, -3.49, 265.3],
        [468, -3.54, 276.6], [471.6, -3.66, 288.8], [472.9, -3.86, 301.5], [472.9, -4.5, 339.5], [472.9, -4.75, 377.7], [472.9, -4.55, 415.6],
        [472.9, -3.91, 453.8], [471.5, -3.71, 468], [467.4, -3.72, 481.5], [460.8, -3.9, 494.1], [451.8, -4.24, 505.1], [440.7, -4.68, 514.1],
        [428.1, -5.2, 520.8], [414.6, -5.76, 524.8], [400.4, -6.34, 526.3], [349.7, -7.65, 526.3], [298.9, -7.32, 526.3], [286.9, -6.97, 527.6],
        [275.3, -6.47, 531.4], [264.9, -5.89, 537.3], [255.9, -5.26, 545.4], [248.8, -4.66, 555.3], [241.5, -4.09, 565.1], [232.5, -3.55, 573.3],
        [222.1, -3.09, 579.2], [210.5, -2.68, 583], [198.4, -2.34, 584.3], [149.3, -1.14, 584.3], [100.1, -0.27, 584.3], [50.8, 0.2, 584.3],
        [1.7, 0.46, 584.3], [-12.5, 0.54, 582.8], [-26, 0.66, 578.8], [-38.6, 0.83, 572.1], [-49.6, 1.03, 563.1], [-58.6, 1.28, 552.1],
        [-65.3, 1.55, 539.5], [-69.4, 1.83, 526], [-70.8, 2.09, 511.8], [-70.8, 2.83, 461], [-70.8, 3.1, 410.3], [-70.8, 2.7, 359.5],
        [-70.8, 1.85, 308.8], [-68.6, 1.6, 295.1], [-62.3, 1.35, 282.8], [-52.3, 1.16, 273.1], [-42.4, 0.99, 263.5], [-35.9, 0.81, 251.2],
        [-33.7, 0.64, 237.4], [-35.9, 0.51, 223.8], [-42.4, 0.43, 211.5], [-52.3, 0.39, 201.9], [-62.3, 0.36, 192.2], [-68.6, 0.31, 179.9],
        [-70.8, 0.27, 166.2], [-70.8, 0.25, 122.7], [-70.8, 0.41, 79.2], [-70.8, 0.77, 35.7],
      ],
    },
    {
      id: 'fantasie',
      name: 'Fantasie',
      thema: 'fantasie',
      beschreibung: 'Zauberland mit Riesenpilzen und Ballons: zwei Loopings (Vollgas!), ' +
        'bunte Bälle rollen über die Straße und Wasserfontänen spritzen aus dem Boden.',
      schwierigkeit: 'spass',
      breite: 14,
      randBreite: 1.5,
      zaunAbstand: 16,
      abseitsUntergrund: 'gras',
      checkpointAbstand: 120,
      zielRundenzeit: 70,
      // Runde 4: eigene Welten – „Fantasie" (Stand Runde 3) und „Verrückt" (+ Turbo, Schild, Strohballen)
      weltStandard: 'fantasie',
      welten: {
        fantasie: Object.assign({}, AUS, { loopings: true, hindernisse: true, baelle: true, wasserstrahlen: true }),
        verrueckt: Object.assign({}, AUS, { loopings: true, hindernisse: true, baelle: true, wasserstrahlen: true,
          boost: true, schild: true, strohballen: true }),
      },
      spuren: [],
      wracks: [],
      schanzen: [],
      strohballen: [
        { s: 295, von: 1, intervall: 10, tempo: 4 },
        { s: 1295, von: -1, intervall: 12, tempo: 4 },
      ],
      boostFelder: [
        { s: 680, seitenabstand: 0, laenge: 12 },      // Turbo vor dem zweiten Looping
        { s: 1030, seitenabstand: 2, laenge: 12 },
      ],
      schilde: [
        { s: 400, seitenabstand: 0 },
        { s: 1100, seitenabstand: -2 },
      ],
      bruecken: [],
      tunnel: [],
      hindernisse: [
        { typ: 'oel', s: 520, seite: 0.3 },
        { typ: 'ast', s: 1220, seite: -1 },
      ],
      // Loopings (track/looping.js): s = Einfahrt auf einer Geraden mit ≥ 120 m Anlauf, Radius 12 m
      // → Mindest-Einfahrtstempo sqrt(5·g·r) ≈ 24 m/s ≈ 87 km/h
      loopings: [
        { s: 170, radius: 12 },      // Start-Gerade (Anlauf ab s ≈ 1340 der Vorrunde bzw. ab Start)
        { s: 800, radius: 12 },      // lange Gerade nach Süden (Anlauf ab s ≈ 650)
      ],
      // Dynamische Objekte (world/dynamik.js): die KI kennt sie nicht – Überraschung für alle.
      // baelle: von = Seite, aus der sie rollen (-1 links, 1 rechts); abRunde: 'letzte' oder Rundennummer
      // (Bezug: führender Spieler); intervall s; tempo m/s quer; radius m
      baelle: [
        { s: 350, von: -1, abRunde: 2, intervall: 8, tempo: 9, radius: 2.2, farbe: 0xff4fa3 },
        { s: 620, von: 1, abRunde: 'letzte', intervall: 8, tempo: 9, radius: 2.2, farbe: 0x4fc3ff },
        { s: 1130, von: -1, abRunde: 'letzte', intervall: 8, tempo: 9, radius: 2.2, farbe: 0xffd23a },
      ],
      // wasserstrahlen: Düse bei s, seitenabstand (m, rechts +); alle intervall s: vorwarnung s Blubbern, dauer s Strahl
      wasserstrahlen: [
        { s: 470, seitenabstand: -3, intervall: 20, dauer: 2, vorwarnung: 1 },
        { s: 940, seitenabstand: 3, intervall: 20, dauer: 2, vorwarnung: 1 },
      ],
      // Bauplan (tests/bauplan/fantasie.json):
      // G260 K40/90 G60 K32/-60 K32/60 G120 K45/90 G? K28/90 G70 K45/-50 K45/50 G? K35/90 G60
      huegel: [
        { x: 160, z: -170, r: 55, h: 7 },
        { x: 170, z: 30, r: 45, h: -3 },
        { x: -110, z: -40, r: 55, h: 6 },
        { x: 460, z: -110, r: 70, h: 8 },
        { x: 150, z: 200, r: 60, h: 5 },
      ],
      punkte: [
        [0, 0.62, 0], [0, 0.81, -32.5], [0, 0.75, -65], [0, 0.51, -97.5], [0, 0.29, -130], [0, 0.17, -162.5],
        [0, 0.11, -195], [0, 0.06, -227.5], [0, 0.03, -260], [1, 0.02, -268.9], [4, 0.02, -277.4], [8.7, 0.02, -284.9],
        [15.1, 0.02, -291.3], [22.6, 0.02, -296], [31.1, 0.03, -299], [40, 0.04, -300], [70, 0.11, -300], [100, 0.24, -300],
        [108.3, 0.26, -301.1], [116, 0.26, -304.3], [122.6, 0.22, -309.4], [127.7, 0.17, -316], [132.8, 0.13, -322.6], [139.4, 0.11, -327.7],
        [147.1, 0.09, -330.9], [155.4, 0.09, -332], [185.4, 0.08, -332], [215.4, 0.06, -332], [245.4, 0.03, -332], [275.4, 0.01, -332],
        [284.2, 0.01, -331.1], [292.6, 0.01, -328.6], [300.4, 0.01, -324.4], [307.2, 0.01, -318.8], [312.8, 0.02, -312], [317, 0.03, -304.2],
        [319.6, 0.04, -295.8], [320.4, 0.06, -287], [320.4, 0.16, -254.8], [320.4, 0.36, -222.6], [320.4, 0.66, -190.4], [320.4, 0.96, -158.3],
        [320.4, 1.14, -126.1], [320.4, 1.1, -93.9], [320.4, 0.88, -61.7], [320.4, 0.56, -29.5], [320.4, 0.29, 2.7], [320.4, 0.12, 34.9],
        [319.1, 0.09, 43.5], [315.1, 0.06, 51.3], [308.9, 0.03, 57.5], [301.1, 0.01, 61.5], [292.4, -0.01, 62.9], [257.4, -0.27, 62.9],
        [222.4, -0.99, 62.9], [212.7, -1.22, 63.9], [203.4, -1.33, 67.1], [195, -1.27, 72.1], [188, -1, 78.9], [180.9, -0.64, 85.7],
        [172.5, -0.31, 90.8], [163.2, -0.06, 93.9], [153.5, 0.09, 95], [123.9, 0.36, 95], [94.2, 0.45, 95], [64.6, 0.33, 95],
        [35, 0.17, 95], [25.9, 0.13, 93.8], [17.5, 0.1, 90.3], [10.3, 0.09, 84.7], [4.7, 0.1, 77.5], [1.2, 0.13, 69.1],
        [0, 0.17, 60], [0, 0.36, 30],
      ],
    },
  ];
})();
