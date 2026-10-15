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
//   Schichten: hindernisse, wracks, strohballen, spuren, schanzen, baelle, wasserstrahlen, boost, schild (+ loopings, kleber).
//   Runde 5: kleber [{ s0, s1, seite: -1 | 1 | 0 }]  Klebe-Seitenstreifen auf dem Rand (nur Fantasie, world/kleber.js);
//            loopings/schanzen optional `anlauf` (m) = Anlaufposition (Override, sonst config.anlauf / berechnet).
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
// Runde 5b (Dino-Strecke): Schicht „dinos" (ab Welt Hindernisse; nur Strecken mit Liste dinos)
//   dinos:       [{ s, von: -1 | 1, intervall, tempo, art: 'dreihorn' | 'langhals' }]  laufende Dinos (world/dynamik.js)
//   strohOptik:  'fels' → Strohballen rollen als Felsbrocken (gleiche Mechanik)
//   bruecken art 'stamm' (Baumstamm-Brücke über Sumpf), tunnel art 'hoehle' (Höhle mit Stalaktiten, Fackeln)
// Runde 6 (W4-I, Alpen): hoehenModell: 'strasse' → y der Kontrollpunkte ist die Fahrbahnhöhe (nicht aus den Hügeln);
//   ueberfuehrungen: [{ s0, s1, art: 'beton' }]  obere Fahrbahn = Brücke über die eigene Strecke (Kreuzung wird gesucht, Δy ≥ 7 m)
//   see: { x, z, r, tiefe }  Mulde für den Bergsee. Listen-Einträge nicht auf/unter der Überführung (test_strecke prüft das).
// Runde 6 (W4-J, Fantasie): kreuzungen: [{ s0, s1 }]  niveaugleiche Kreuzung mit sich selbst (Bahnübergang mit Warnlicht);
//   s0..s1 = Bereich des ersten Abschnitts, die Stelle (sA/sB, Winkel 70–110°, |Δy| < 1 m) sucht trackBuilder.
//   Listen-Einträge nicht an der Kreuzung (kreuzungNah, test_strecke prüft das).
// 14.10. (v18) Gabelung (nur Wiese + Wüste, in ALLEN Welten): gabelungen: [{ s0, s1, versatz?, astBreite?, anteil? }]
//   Die doppelspurige Straße teilt sich bei s0 (Y) in zwei getrennte, je 1-spurige Fahrbahnen (astBreite ≈ 6 m) links und rechts
//   (Mittellinie der Äste = Strecken-Mittellinie ± c(s), c wächst von breite/4 auf `versatz` m) mit Insel dazwischen und führt bei s1
//   wieder zusammen. anteil = Länge der Teilung/Zusammenführung als Anteil der Gesamtlänge (Standard 0,36). Nur s0/s1 skalieren in
//   Varianten (XL), Versatz/Breiten bleiben. Beide Äste folgen derselben Mittellinie → fast gleich lang (Längen: strecke.gabelInfo()).
//   Listen-Einträge (spuren, hindernisse, wracks, … ) liegen nicht in [s0 − 30, s1 + 30] (tests/test_gabelung.js prüft das):
//   Wiese: Baustelle 1107 → 985 (die enge Stelle 1210–1330 entfällt, dort liegt jetzt die Gabelung);
//   Wüste: Baustelle 1102 → 945 (die enge Piste 1210–1400 entfällt). Details: trackBuilder.js (Kopfkommentar „Gabelung“).
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
    alles:       { name: 'Alles',       emoji: '🎪', beschreibung: 'Jede Hindernisart zugleich.' },
    fantasie:    { name: 'Fantasie',    emoji: '🌈', beschreibung: 'Loopings, Bälle und Wasserfontänen.' },
  };
  // Bausteine: jede Welt baut auf der vorigen auf (Klassisch → Hindernisse → Stunt → Verrückt)
  const AUS = { hindernisse: false, wracks: false, strohballen: false, spuren: false, schanzen: false,
    baelle: false, wasserstrahlen: false, boost: false, schild: false, loopings: false, kleber: false, dinos: false };
  const W_KLASSISCH = Object.assign({}, AUS);
  const W_HINDERNISSE = Object.assign({}, W_KLASSISCH, { hindernisse: true, wracks: true, strohballen: true, dinos: true });
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
      // 14.10. (v22): XL für alle Strecken – R.Strecke.varianteAnwenden skaliert Punkte/Hügel/alle s-Felder (auch die Gabelung)
      varianten: { xl: { name: 'XL', faktor: 1.6, zeitFaktor: 1.34, beschreibung: 'Die Wiese in Übergröße: 1,6-mal so lang, lange Geraden und weite Kurven.' } },
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
        { typ: 'baustelle', s: 305, seite: 1 },        // 14.10.: war 1107 (dort liegt jetzt die Gabelung)
        { typ: 'ast', s: 1755, seite: -1 },
      ],
      // 14.10. Gabelung auf der langen Geraden nach der Baustelle (s 1050–1390, ≈ 340 m, fast gerade, Längenunterschied der Äste ≈ 0)
      gabelungen: [{ s0: 1050, s1: 1390, versatz: 10.5, astBreite: 6 }],
      // Runde 4 – Welten-Schichten (s in m)
      spuren: [
        { s0: 1840, s1: 1950, spuren: 1 },     // enge Stelle nach der Gabelung (14.10.: war 1210–1330, dort teilt sich jetzt die Straße)
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
        { s: 1690, seitenabstand: 3, intervall: 20, dauer: 2, vorwarnung: 1 },
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
      // 14.10. (v22): XL für alle Strecken
      varianten: { xl: { name: 'XL', faktor: 1.6, zeitFaktor: 1.29, beschreibung: 'Der Wald in Übergröße: 1,6-mal so lang, noch mehr Kurven zwischen den Bäumen.' } },
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
      // Runde 6 (W2-C): Rehe + Bären laufen über die Straße (Schicht „dinos“ = Tiere, ab Welt Hindernisse; world/dynamik.js).
      // Reh flink in Sprüngen (bleibt kurz stehen und schaut, Geweih bei jedem 2.), Bär trottet. Klassisch: nur grasende Rehe.
      tiere: [
        { art: 'reh', s: 230, von: 1, intervall: 9, tempo: 6 },
        { art: 'baer', s: 1135, von: -1, intervall: 14, tempo: 3 },
        { art: 'reh', s: 1790, von: -1, intervall: 10, tempo: 6 },
        { art: 'baer', s: 660, von: 1, intervall: 15, tempo: 3 },
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
        { typ: 'baustelle', s: 945, seite: 1 },        // 14.10.: war 1102 (dort liegt jetzt die Gabelung)
      ],
      // 14.10. Gabelung auf der langen Geraden (s 1030–1430, ≈ 400 m, gerade, Längenunterschied der Äste ≈ 0)
      gabelungen: [{ s0: 1030, s1: 1430, versatz: 11.5, astBreite: 6.4 }],
      // Runde 4 – Welten-Schichten (s in m)
      spuren: [
        { s0: 2275, s1: 2355, spuren: 1 },     // enge Piste auf der Geraden vor der Brücke (14.10.: war 1210–1400, dort teilt sich jetzt die Piste)
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
        { s: 1910, seitenabstand: -3.5, laenge: 12 },   // 14.10.: war 1000 (Gabelung/Baustelle)
        { s: 3185, seitenabstand: 0, laenge: 12 },
      ],
      schilde: [
        { s: 1700, seitenabstand: 2 },
        { s: 2460, seitenabstand: -2 },   // 14.10.: war 2380 (enge Piste 2265–2345)
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
      // Runde 6 (W2-E): Streckenvariante XL – R.Strecke.varianteAnwenden skaliert Punkte/Hügel/alle s-Felder
      varianten: { xl: { name: 'XL', faktor: 1.6, zeitFaktor: 1.37, beschreibung: 'Die Wüsten-Piste in Übergröße: 1,6-mal so lang, rund 3 Minuten pro Runde.' } },
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
      beschreibung: 'Zauberland mit Riesenpilzen und Ballons: zwei Loopings (Vollgas!), eine Kreuzung mit Warnlicht, ' +
        'bunte Bälle und Wasserfontänen.',
      schwierigkeit: 'spass',
      breite: 14,
      randBreite: 1.5,
      zaunAbstand: 16,
      abseitsUntergrund: 'gras',
      checkpointAbstand: 120,
      zielRundenzeit: 70,
      // Runde 6 (W2-E): Streckenvariante XL (doppelt so lang; Looping-Radius bleibt, Anlauf wird länger)
      varianten: { xl: { name: 'XL', faktor: 2, zeitFaktor: 1.45, beschreibung: 'Das Zauberland doppelt so lang: lange Geraden, gleiche Loopings.' } },
      // Runde 4: eigene Welten – „Fantasie" (Stand Runde 3) und „Verrückt" (+ Turbo, Schild, Strohballen)
      weltStandard: 'fantasie',
      welten: {
        fantasie: Object.assign({}, AUS, { loopings: true, hindernisse: true, baelle: true, wasserstrahlen: true, kleber: true }),
        verrueckt: Object.assign({}, AUS, { loopings: true, hindernisse: true, baelle: true, wasserstrahlen: true,
          boost: true, schild: true, strohballen: true, kleber: true }),
      },
      spuren: [],
      wracks: [],
      schanzen: [],
      // Runde 5: Klebe-Seitenstreifen (world/kleber.js) auf dem Randstreifen: seite −1 links, 1 rechts, 0 beide.
      // Nicht in den Anlauf-Zonen der Loopings (10–170, 640–800), mind. 30 m weg von den Bällen, nicht an der Kreuzung.
      // W4-J: Listen an die neue Streckenführung (Acht mit Schleife) angepasst – alle Elemente ≥ 35 m von der Kreuzung.
      kleber: [
        { s0: 220, s1: 255, seite: -1 },     // vor der Rechtskurve, Außenseite
        { s0: 385, s1: 440, seite: 0 },      // obere Gerade, beidseits
        { s0: 980, s1: 1040, seite: 1 },     // Schleife (Linkskurve), Außenseite
        { s0: 1180, s1: 1240, seite: 1 },    // Gerade vor dem Ast
      ],
      strohballen: [
        { s: 295, von: 1, intervall: 10, tempo: 4 },
        { s: 1325, von: -1, intervall: 12, tempo: 4 },
      ],
      boostFelder: [
        { s: 680, seitenabstand: 0, laenge: 12 },      // Turbo vor dem zweiten Looping
        { s: 1140, seitenabstand: -2, laenge: 12 },    // Turbo nach der Kreuzung (Schleifen-Ausgang)
      ],
      schilde: [
        { s: 390, seitenabstand: 0 },
        { s: 1205, seitenabstand: -2 },
      ],
      bruecken: [],
      tunnel: [],
      hindernisse: [
        { typ: 'oel', s: 560, seite: 0.3 },
        { typ: 'ast', s: 1260, seite: -1 },
      ],
      // Loopings (track/looping.js): s = Einfahrt auf einer Geraden mit ≥ 120 m Anlauf, Radius 12 m
      // → Mindest-Einfahrtstempo sqrt(5·g·r) ≈ 24 m/s ≈ 87 km/h
      loopings: [
        { s: 170, radius: 12 },      // Start-Gerade (Anlauf ab s ≈ 1340 der Vorrunde bzw. ab Start)
        { s: 800, radius: 12 },      // lange Gerade nach Süden (Gerade ab s ≈ 524; W4-J: danach die Kreuzung bei s ≈ 898)
      ],
      // Dynamische Objekte (world/dynamik.js): die KI kennt sie nicht – Überraschung für alle.
      // baelle: von = Seite, aus der sie rollen (-1 links, 1 rechts); abRunde: 'letzte' oder Rundennummer
      // (Bezug: führender Spieler); intervall s; tempo m/s quer; radius m
      baelle: [
        { s: 340, von: -1, abRunde: 2, intervall: 8, tempo: 9, radius: 2.2, farbe: 0xff4fa3 },
        { s: 660, von: 1, abRunde: 'letzte', intervall: 8, tempo: 9, radius: 2.2, farbe: 0x4fc3ff },
        { s: 1300, von: -1, abRunde: 'letzte', intervall: 8, tempo: 9, radius: 2.2, farbe: 0xffd23a },
      ],
      // wasserstrahlen: Düse bei s, seitenabstand (m, rechts +); alle intervall s: vorwarnung s Blubbern, dauer s Strahl
      wasserstrahlen: [
        { s: 600, seitenabstand: -3, intervall: 20, dauer: 2, vorwarnung: 1 },
        { s: 1175, seitenabstand: 3, intervall: 20, dauer: 2, vorwarnung: 1 },
      ],
      // Runde 6 (W4-J): niveaugleiche Kreuzung („Bahnübergang"): s0..s1 = Bereich des ERSTEN Abschnitts, in dem sie liegt.
      // trackBuilder sucht die Stelle (sA erster, sB zweiter Abschnitt, Winkel, |Δy| < 1 m). Ost-Gerade nach Looping 2 (sA ≈ 898)
      // kreuzt den Ausgang der 270°-Schleife (sB ≈ 1100), fast rechtwinklig. Warnlicht-Masten an allen 4 Zufahrten.
      kreuzungen: [{ s0: 870, s1: 930 }],
      // Bauplan (tests/bauplan/fantasie.json), W4-J: Acht mit 270°-Schleife (Gesamtdrehung 0°), Länge 1.420 m (vorher 1.388 m):
      // G260 K40/90 G130 K45/90 G?(405) K30/-270 G?(210) K35/90 G85
      // (vorher: G260 K40/90 G60 K32/-60 K32/60 G120 K45/90 G? K28/90 G70 K45/-50 K45/50 G? K35/90 G60)
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
        [15.1, 0.02, -291.3], [22.6, 0.02, -296], [31.1, 0.03, -299], [40, 0.04, -300], [72.5, 0.12, -300], [105, 0.26, -300],
        [137.5, 0.39, -300], [170, 0.42, -300], [178.8, 0.42, -299.1], [187.2, 0.44, -296.6], [195, 0.48, -292.4], [201.8, 0.55, -286.8],
        [207.4, 0.65, -280], [211.6, 0.8, -272.2], [214.1, 1.01, -263.8], [215, 1.29, -255], [215, 2.76, -221.2], [215, 4.05, -187.5],
        [215, 4.08, -153.7], [215, 2.82, -120], [215, 1.28, -86.2], [215, 0.11, -52.5], [215, -0.91, -18.7], [215, -1.68, 15],
        [215, -1.55, 48.8], [215, -0.51, 82.5], [215, 0.76, 116.3], [215, 1.91, 150], [216.5, 2.12, 159.3], [220.7, 2.14, 167.6],
        [227.4, 1.98, 174.3], [235.7, 1.69, 178.5], [245, 1.35, 180], [254.3, 1.03, 178.5], [262.6, 0.78, 174.3], [269.3, 0.6, 167.6],
        [273.5, 0.47, 159.3], [275, 0.4, 150], [273.5, 0.36, 140.7], [269.3, 0.35, 132.4], [262.6, 0.36, 125.7], [254.3, 0.4, 121.5],
        [245, 0.49, 120], [210, 0.97, 120], [175, 1.48, 120], [140, 1.7, 120], [105, 1.41, 120], [70, 0.81, 120],
        [35, 0.33, 120], [25.9, 0.24, 118.8], [17.5, 0.17, 115.3], [10.3, 0.12, 109.7], [4.7, 0.09, 102.5], [1.2, 0.09, 94.1],
        [0, 0.1, 85], [0, 0.18, 56.7], [0, 0.38, 28.3],
      ],
    },
    {
      id: 'dino',
      name: 'Dino',
      thema: 'dino',
      // 14.10. (v22): XL für alle Strecken
      varianten: { xl: { name: 'XL', faktor: 1.6, zeitFaktor: 1.34, beschreibung: 'Das Dino-Land in Übergröße: 1,6-mal so lang, mehr Platz für Dinos und Vulkan.' } },
      beschreibung: 'Urwald am Vulkan: Palmen, Riesenfarne und Dinos! Durch die Dino-Höhle, über die ' +
        'Baumstamm-Brücke am Sumpf, Schikane und Haarnadel – und manchmal läuft ein Dino über die Straße.',
      schwierigkeit: 'mittel',
      breite: 13,
      randBreite: 1.5,
      zaunAbstand: 12,          // dichter Urwald dahinter
      abseitsUntergrund: 'gras',
      checkpointAbstand: 110,
      zielRundenzeit: 125,
      // Runde 5b: Welten wie Wald/Wüste; „dinos" (laufende Dinos) ab Welt Hindernisse, Klassisch nur Deko-Dinos.
      // Strohballen-Mechanik mit Felsoptik („Felsbrocken rollen", dynamik.js liest strohOptik).
      weltStandard: 'hindernisse',
      welten: vierWelten(),
      strohOptik: 'fels',
      bruecken: [{ s0: 1579, s1: 1644, art: 'stamm', tiefe: 4 }],   // Baumstamm-Brücke über den Sumpf
      // Runde 6 (W2-C, C4): Berg-Massiv mit zwei Tunneln auf der Geraden vor dem Ziel: Tunnel 1 kurz (60 m), Schlucht,
      // Tunnel 2 lang (140 m) mit der 90°-Kurve darin. Grundriss/Höhen unverändert (Steigung ≤ 8 %), nur Tunnel neu verteilt;
      // berg = Massiv-Kulisse (themes.js bergmassivBauen).
      tunnel: [{ s0: 2345, s1: 2405, art: 'hoehle' }, { s0: 2490, s1: 2630, art: 'hoehle' }],
      berg: { s0: 2318, s1: 2655 },
      hindernisse: [
        { typ: 'sand', s: 359, seite: -0.3 },
        { typ: 'baustelle', s: 1389, seite: 1 },
        { typ: 'ast', s: 1779, seite: -1 },
        { typ: 'oel', s: 2014, seite: 0.3 },
        // Runde 6 (W2-C, C2): Lava-Zungen über die halbe Fahrbahn (seite = belegte Hälfte); Kontakt = 1 s Stopp, KI meidet
        { typ: 'lava', s: 180, seite: -1 },
        { typ: 'lava', s: 960, seite: 1 },
      ],
      spuren: [
        { s0: 1089, s1: 1199, spuren: 1 },      // enger Urwaldweg am Ende der langen Geraden
        { s0: 2104, s1: 2189, spuren: 3 },     // breit nach dem Kurvengeschlängel
      ],
      wracks: [
        { s: 539, seitenabstand: -4, brennt: false, autoId: 'passat' },
        { s: 2259, seitenabstand: 3.5, brennt: true, autoId: 'multivan' },
      ],
      strohballen: [                           // Optik: Felsbrocken (strohOptik)
        { s: 639, von: 1, intervall: 10, tempo: 4 },
        { s: 1699, von: -1, intervall: 12, tempo: 4 },
      ],
      // Laufende Dinos (world/dynamik.js): alle intervall s läuft ein Dino (art: 'dreihorn' | 'langhals') mit tempo m/s
      // von der Seite von quer über die Straße. Kontakt: Tempo −60 % + Hüpfer, der Dino läuft unbeeindruckt weiter.
      dinos: [
        { s: 1899, von: -1, intervall: 14, tempo: 4, art: 'dreihorn' },
        { s: 2284, von: 1, intervall: 16, tempo: 4, art: 'langhals' },
        // Runde 6 (W2-C, C1): doppelt so viele Stellen; Verhalten (stehen, Kopf senken, umkehren, brüllen): config.dino
        { s: 590, von: 1, intervall: 15, tempo: 4, art: 'dreihorn' },
        { s: 1735, von: -1, intervall: 17, tempo: 4, art: 'langhals' },
      ],
      // Runde 6 (W2-C, C5): Meteoriten – je Runde beim ersten Passieren: Schatten + Pfeifen, Einschlag 15 m neben der
      // Fahrbahn (Seite von), dann rollen 3–5 Felsbrocken quer über die Straße (Felsbrocken-Mechanik, KI kennt sie nicht)
      meteoriten: [
        { s: 300, von: 1 },
        { s: 2150, von: -1 },
      ],
      // Runde 6 (W2-C, C6): Flugsaurier auf der langen Geraden (s0–s1): kommt von vorn, taucht über das vorderste Spieler-Auto
      flugsaurier: { s0: 660, s1: 1240, intervall: 40 },
      // Runde 6 (W2-C, C3): Vulkanausbruch alle 80–110 s (Werte: config.dino.vulkan); Lavabomben → Krater (20 s)
      vulkan: { ausbruch: true },
      schanzen: [
        { s: 65, winkel: 8, laenge: 10 },
        { s: 839, winkel: 12, laenge: 10 },     // lange Gerade
      ],
      boostFelder: [
        { s: 1019, seitenabstand: 0, laenge: 12 },
        { s: 1529, seitenabstand: 2, laenge: 12 },
      ],
      schilde: [
        { s: 1479, seitenabstand: 0 },
        { s: 2440, seitenabstand: -2 },        // Runde 6: in der Schlucht zwischen den Tunneln
      ],
      baelle: [
        { s: 739, von: -1, abRunde: 2, intervall: 8, tempo: 9, radius: 2.2, farbe: 0xff4fa3 },
        { s: 2660, von: 1, abRunde: 'letzte', intervall: 8, tempo: 9, radius: 2.2, farbe: 0xffd23a },
      ],
      wasserstrahlen: [
        { s: 1949, seitenabstand: -2, intervall: 20, dauer: 2, vorwarnung: 1 },
      ],
      // Bauplan (tests/bauplan/dino.json, Runde 5b; danach ×1,225 um den Schwerpunkt → 2.752 m):
      // G200 K34/90 G70 K28/-45 K28/90 K28/-45 (Schikane) G60 K45/35 K45/-35 G?(502, lange Gerade) K25/180 (Haarnadel)
      // G120 K34/-90 G70 (Brücke) K32/70 K32/-70 G50 K34/90 G40 K34/-60 K34/120 K34/-60 G30 K34/-50 K34/50 G30
      // K36/-45 K36/45 G210 (Höhle) K36/90 G?(89) G1
      huegel: [
        { x: 97.9, z: -205.9, r: 153.1, h: 14 },
        { x: 832.9, z: -144.6, r: 165.4, h: -12 },    // Sumpf-Senke (Brücke)
        { x: 97.9, z: 259.6, r: 116.4, h: 10 },    // Höhlenberg
        { x: 489.9, z: -71.1, r: 140.9, h: 7 },
        { x: 489.9, z: 271.9, r: 110.3, h: -6 },
        { x: 1175.9, z: -426.4, r: 171.5, h: 8 },
      ],
      punkte: [
        [-85.8, 2.73, 14.6], [-85.8, 3.57, -26.2], [-85.8, 4.57, -67], [-85.8, 5.58, -107.9], [-85.8, 6.36, -148.7], [-85.8, 6.78, -189.5],
        [-85.8, 6.73, -230.4], [-84.4, 6.71, -241.2], [-80.2, 6.81, -251.2], [-73.6, 7.03, -259.8], [-65, 7.35, -266.4], [-54.9, 7.78, -270.6],
        [-44.2, 8.29, -272], [-1.3, 10.34, -272], [41.6, 11.94, -272], [50.5, 12.13, -273.2], [58.7, 12.2, -276.6], [65.8, 12.12, -282.1],
        [74.5, 11.99, -288.4], [84.7, 11.95, -291.7], [95.5, 12, -291.7], [105.7, 12.14, -288.4], [114.3, 12.36, -282.1], [121.5, 12.51, -276.6],
        [129.7, 12.53, -273.2], [138.6, 12.42, -272], [175.4, 11.43, -272], [212.1, 10.01, -272], [223.2, 9.57, -270.9], [233.9, 9.2, -267.5],
        [243.7, 8.91, -262.1], [253.5, 8.61, -256.6], [264.2, 8.22, -253.2], [275.3, 7.77, -252.1], [316.3, 6.2, -252.1], [357.3, 5, -252.1],
        [398.3, 4.13, -252.1], [439.3, 3.42, -252.1], [480.4, 2.65, -252.1], [521.4, 1.64, -252.1], [562.4, 0.28, -252.1], [603.4, -1.41, -252.1],
        [644.4, -3.33, -252.1], [685.4, -5.27, -252.1], [726.4, -6.99, -252.1], [767.4, -8.26, -252.1], [808.4, -8.89, -252.1], [849.4, -8.77, -252.1],
        [890.4, -7.9, -252.1], [902.1, -7.62, -249.8], [912, -7.54, -243.1], [918.7, -7.68, -233.2], [921, -8.01, -221.5], [918.7, -8.5, -209.7],
        [912, -9.05, -199.8], [902.1, -9.58, -193.2], [890.4, -10, -190.8], [853.6, -10.74, -190.8], [816.9, -10.81, -190.8], [780.1, -10.16, -190.8],
        [743.4, -8.87, -190.8], [732.6, -8.4, -189.4], [722.6, -7.94, -185.3], [713.9, -7.51, -178.6], [707.3, -7.16, -170], [703.1, -6.89, -160],
        [701.7, -6.76, -149.2], [701.7, -6.3, -106.3], [701.7, -5.49, -63.4], [699.9, -5.12, -51.6], [694.6, -4.57, -41], [686.4, -3.9, -32.3],
        [675.9, -3.16, -26.6], [665.5, -2.45, -20.9], [657.2, -1.84, -12.2], [652, -1.42, -1.6], [650.1, -1.21, 10.2], [650.1, -1.02, 40.9],
        [650.1, -0.97, 71.5], [648.7, -0.95, 82.3], [644.6, -0.88, 92.3], [637.9, -0.8, 100.9], [629.3, -0.72, 107.6], [619.3, -0.63, 111.7],
        [608.5, -0.52, 113.1], [584, -0.23, 113.1], [559.5, 0, 113.1], [548.7, 0.03, 114.6], [538.7, -0.08, 118.7], [530, -0.34, 125.3],
        [523.4, -0.74, 134], [516.8, -1.15, 142.6], [508.2, -1.46, 149.2], [498.1, -1.65, 153.4], [487.4, -1.68, 154.8], [476.6, -1.54, 153.4],
        [466.5, -1.24, 149.2], [457.9, -0.82, 142.6], [451.3, -0.31, 134], [444.7, 0.2, 125.3], [436, 0.61, 118.7], [426, 0.89, 114.6],
        [415.2, 1.05, 113.1], [378.5, 1.37, 113.1], [366.5, 1.42, 114.9], [355.6, 1.39, 120], [346.6, 1.28, 128], [337.5, 1.24, 136],
        [326.6, 1.35, 141.1], [314.7, 1.59, 142.9], [277.9, 2.58, 142.9], [266.5, 2.92, 144.4], [255.9, 3.27, 148.8], [246.7, 3.63, 155.8],
        [237.6, 4.04, 162.8], [226.9, 4.52, 167.2], [215.5, 5.02, 168.7], [172.7, 6.69, 168.7], [129.8, 7.83, 168.7], [86.9, 8.06, 168.7],
        [44, 7.29, 168.7], [1.2, 5.8, 168.7], [-41.7, 4.05, 168.7], [-53.1, 3.59, 167.2], [-63.8, 3.14, 162.8], [-72.9, 2.75, 155.8],
        [-79.9, 2.45, 146.7], [-84.3, 2.24, 136], [-85.8, 2.13, 124.6], [-85.8, 2.05, 88.4], [-85.8, 2.24, 52.1], [-85.8, 2.71, 15.9],
      ],
    },
    {
      id: 'alpen',
      name: 'Alpen',
      thema: 'alpen',
      // 14.10. (v22): XL für alle Strecken; hoeheFaktor 1,25: die Berge wachsen mit (sonst wäre die lange Strecke flach)
      varianten: { xl: { name: 'XL', faktor: 1.6, hoeheFaktor: 1.25, zeitFaktor: 1.32, beschreibung: 'Die Alpen in Übergröße: 1,6-mal so lang, höhere Pässe und lange Kehren.' } },
      beschreibung: 'Hoch in die Berge: Serpentinen mit Haarnadeln hinauf zum Pass, durch den Felstunnel, ' +
        'in Kehren hinab und über die Brücke über die eigene Strecke – unten im Tal glitzert der Bergsee.',
      schwierigkeit: 'mittel',
      breite: 12,
      randBreite: 1.5,
      zaunAbstand: 10,
      abseitsUntergrund: 'gras',
      checkpointAbstand: 110,
      zielRundenzeit: 125,
      // Runde 6 (W4-I): Höhenmodell „strasse": Fahrbahnhöhe = y der Kontrollpunkte (eigenes Höhenprofil, Querneigung 0),
      // der Boden wird an die Straße angeglichen (trackBuilder.js). Nur so kann die Strecke über sich selbst führen.
      hoehenModell: 'strasse',
      weltStandard: 'hindernisse',
      welten: vierWelten(),
      // Berge am Rand der Bodenplatte (Gelände, weit weg von der Strecke) + Mulde für den Bergsee im Tal
      huegel: [
        { x: 220, z: -1060, r: 170, h: 80 },
        { x: -420, z: -380, r: 160, h: 70 },
        { x: 720, z: -330, r: 170, h: 75 },
        { x: 120, z: 480, r: 150, h: 45 },
        { x: -300, z: 250, r: 140, h: 50 },
      ],
      see: { x: 120, z: 5, r: 40, tiefe: 4 },
      // Steinbrücke über den Abfluss des Sees (Tal), Felstunnel auf der Passgeraden (Berg-Massiv: themes.js bergmassivBauen)
      bruecken: [{ s0: 2672, s1: 2722, art: 'stein', tiefe: 5 }],
      tunnel: [{ s0: 1370, s1: 1470, art: 'fels' }],
      berg: { s0: 1325, s1: 1500 },
      // Überführung: die Abfahrt (oben, s ≈ 2123, y ≈ 19) kreuzt die Auffahrt (unten, s ≈ 346, y ≈ 10) rechtwinklig auf einer
      // Betonbrücke mit Pfeilern (Δy ≈ 9 m). Im Brückenbereich zieht die obere Fahrbahn den Boden nicht mit (Tal darunter).
      ueberfuehrungen: [{ s0: 2068, s1: 2178, art: 'beton' }],
      hindernisse: [
        { typ: 'sand', s: 470, seite: -0.3 },
        { typ: 'baustelle', s: 790, seite: 1 },
        { typ: 'ast', s: 1600, seite: -1 },
        { typ: 'oel', s: 1950, seite: 0.3 },
      ],
      spuren: [
        { s0: 580, s1: 630, spuren: 1 },       // enger Bergweg vor der ersten Haarnadel
        { s0: 2350, s1: 2400, spuren: 3 },     // breit auf der Talfahrt
      ],
      wracks: [
        { s: 520, seitenabstand: -3.5, brennt: false, autoId: 'passat' },
        { s: 1530, seitenabstand: 3.5, brennt: true, autoId: 'multivan' },
      ],
      strohballen: [
        { s: 1645, von: 1, intervall: 10, tempo: 4 },
        { s: 2220, von: -1, intervall: 12, tempo: 4 },
      ],
      // Schanzen nur auf Geraden ohne Überführung darunter/darüber: Start-Gerade und Talfahrt-Gerade (genug Anlauf für ≥ 90 km/h)
      schanzen: [
        { s: 65, winkel: 8, laenge: 10 },
        { s: 2450, winkel: 12, laenge: 10 },
      ],
      boostFelder: [
        { s: 1300, seitenabstand: 2, laenge: 12 },
        { s: 2290, seitenabstand: 0, laenge: 12 },
      ],
      schilde: [
        { s: 430, seitenabstand: 0 },
        { s: 2000, seitenabstand: -2 },
      ],
      baelle: [
        { s: 1230, von: -1, abRunde: 2, intervall: 8, tempo: 9, radius: 2.2, farbe: 0xff4fa3 },
        { s: 2600, von: 1, abRunde: 'letzte', intervall: 8, tempo: 9, radius: 2.2, farbe: 0x4fc3ff },
      ],
      wasserstrahlen: [
        { s: 2560, seitenabstand: -2, intervall: 20, dauer: 2, vorwarnung: 1 },
      ],
      // Bauplan (tests/bauplan/alpen.json, Höhenmarken Y): Acht – G150 K100/45 G180 (Kreuzung unten) K50/-45 G40 K40/90
      // G125 K28/-180 G125 K28/180 G125 (Serpentinen) K40/-90 G40 K40/-90 G235 (Pass + Tunnel) K40/-90 G100 K30/90 G60
      // K28/-180 G60 K30/90 (Kehre) G60 K60/-45 G200 (Brücke = Kreuzung oben) K80/45 G?(189) K80/90 G?(84, Steinbrücke) K80/90 G50
      punkte: [
        [0, -5, 0], [0, -5, -30], [0, -5, -60], [0, -5, -90], [0, -5, -120], [0, -3.93, -150],
        [0.4, -3.24, -158.7], [1.5, -2.36, -167.4], [3.4, -1.32, -175.9], [6, -0.13, -184.2], [9.4, 1.11, -192.3], [13.4, 2.36, -200],
        [18.1, 3.61, -207.4], [23.4, 4.89, -214.3], [29.3, 6.18, -220.7], [50.1, 10.72, -241.5], [70.8, 15.47, -262.3], [91.6, 20.16, -283],
        [112.4, 23.9, -303.8], [127.1, 25.52, -318.5], [141.8, 26.48, -333.3], [156.6, 27.22, -348], [161.7, 27.49, -354], [165.8, 27.81, -360.6],
        [168.8, 28.14, -367.9], [170.6, 28.52, -375.5], [171.2, 28.96, -383.3], [171.2, 30.33, -403.3], [171.2, 31.84, -423.3], [172.2, 32.45, -432.2],
        [175.2, 32.91, -440.7], [179.9, 33.23, -448.3], [186.3, 33.4, -454.6], [193.9, 33.41, -459.4], [202.3, 33.38, -462.3], [211.2, 33.14, -463.3],
        [236.2, 32.45, -463.3], [261.2, 31.53, -463.3], [286.2, 31.13, -463.3], [311.2, 31.63, -463.3], [336.2, 33.62, -463.3], [344.9, 34.6, -464.7],
        [352.7, 35.83, -468.7], [358.9, 37.06, -474.9], [362.8, 38.5, -482.7], [364.2, 39.81, -491.3], [362.8, 41.13, -500], [358.9, 42.6, -507.8],
        [352.7, 43.86, -514], [344.9, 45.21, -518], [336.2, 46.34, -519.3], [311.2, 49.16, -519.3], [286.2, 50.9, -519.3], [261.2, 51.61, -519.3],
        [236.2, 51.75, -519.3], [211.2, 51.46, -519.3], [202.6, 51.46, -520.7], [194.8, 51.51, -524.7], [188.6, 51.52, -530.9], [184.6, 51.75, -538.7],
        [183.2, 52.05, -547.3], [184.6, 52.57, -556], [188.6, 53.23, -563.8], [194.8, 54.12, -570], [202.6, 55.09, -574], [211.2, 56.3, -575.3],
        [236.2, 60.02, -575.3], [261.2, 64.17, -575.3], [286.2, 67.86, -575.3], [311.2, 70.89, -575.3], [336.2, 72.43, -575.3], [345.1, 72.54, -576.3],
        [353.6, 72.57, -579.3], [361.2, 72.29, -584.1], [367.5, 72.01, -590.4], [372.3, 71.44, -598], [375.2, 71.03, -606.4], [376.2, 70.59, -615.3],
        [376.2, 69.45, -635.3], [376.2, 68.86, -655.3], [375.2, 68.89, -664.2], [372.3, 69.19, -672.7], [367.5, 69.69, -680.3], [361.2, 70.36, -686.6],
        [353.6, 71.2, -691.4], [345.1, 71.98, -694.3], [336.2, 72.86, -695.3], [306.2, 74.91, -695.3], [276.2, 75.33, -695.3], [247, 74.46, -695.3],
        [217.9, 72.99, -695.3], [188.7, 71.5, -695.3], [159.5, 70.03, -695.3], [130.4, 68.62, -695.3], [101.2, 67.53, -695.3], [92.3, 67.35, -694.3],
        [83.9, 67.18, -691.4], [76.3, 67.17, -686.6], [69.9, 67.14, -680.3], [65.2, 67.28, -672.7], [62.2, 67.33, -664.2], [61.2, 67.52, -655.3],
        [61.2, 67.55, -630.3], [61.2, 66.59, -605.3], [61.2, 64.25, -580.3], [61.2, 60.64, -555.3], [60.2, 59.39, -547.6], [57.2, 58.1, -540.3],
        [52.4, 56.82, -534.1], [46.2, 55.56, -529.4], [39, 54.55, -526.4], [31.2, 53.4, -525.3], [1.2, 50.22, -525.3], [-28.8, 49.55, -525.3],
        [-37.4, 49.91, -524], [-45.2, 50.28, -520], [-51.4, 50.96, -513.8], [-55.4, 51.52, -506], [-56.8, 52.1, -497.3], [-55.4, 52.95, -488.7],
        [-51.4, 53.53, -480.9], [-45.2, 54.28, -474.7], [-37.4, 54.71, -470.7], [-28.8, 55.02, -469.3], [1.2, 55.01, -469.3], [31.2, 52.69, -469.3],
        [39, 51.82, -468.3], [46.2, 50.87, -465.3], [52.4, 49.93, -460.6], [57.2, 48.99, -454.3], [60.2, 48.09, -447.1], [61.2, 47.24, -439.3],
        [61.2, 44.51, -409.3], [61.2, 42.23, -379.3], [61.7, 41.64, -371.5], [63.3, 41.03, -363.8], [65.8, 40.42, -356.4], [69.3, 39.79, -349.3],
        [73.6, 39.23, -342.8], [78.8, 38.6, -336.9], [97.4, 36.6, -318.3], [116, 34.73, -299.7], [136.8, 32.53, -278.9], [157.7, 30.31, -258],
        [178.5, 28.15, -237.2], [199.4, 26.02, -216.3], [220.2, 23.88, -195.5], [226.2, 23.1, -188.8], [231.4, 22.27, -181.5], [235.7, 21.32, -173.6],
        [239.2, 20.28, -165.4], [241.6, 19.14, -156.7], [243.1, 17.96, -147.9], [243.6, 16.7, -138.9], [243.6, 13.03, -111.9], [243.6, 9.73, -84.9],
        [243.6, 6.7, -58], [243.6, 3.77, -31], [243.6, 0.85, -4], [243.6, -2.07, 23], [243.6, -4.15, 50], [243.1, -4.57, 59],
        [241.6, -4.86, 67.8], [239.2, -4.98, 76.4], [235.7, -5, 84.7], [231.4, -5, 92.6], [226.2, -5, 99.9], [220.2, -5, 106.6],
        [213.5, -5, 112.5], [206.2, -5, 117.7], [198.4, -5, 122.1], [190.1, -5, 125.5], [181.4, -5, 128], [172.6, -5, 129.5],
        [163.6, -5, 130], [135.8, -5, 130], [107.9, -5, 130], [80, -5, 130], [71, -5, 129.5], [62.2, -5, 128],
        [53.6, -5, 125.5], [45.3, -5, 122.1], [37.4, -5, 117.7], [30.1, -5, 112.5], [23.4, -5, 106.6], [17.5, -5, 99.9],
        [12.3, -5, 92.6], [7.9, -5, 84.7], [4.5, -5, 76.4], [2, -5, 67.8], [0.5, -5, 59], [0, -5, 50],
        [0, -5, 25],
      ],
    },
  ];

  // Runde 6 (B4): Welt „Alles" je Strecke = alle Schichten zugleich (Polizei bleibt ein eigener Schalter im Menü).
  // Fantasie: Loopings/Kleber bleiben ohnehin an. Wird als letzte Welt angehängt (Pillen-Reihenfolge im Menü).
  R.trackCatalog.forEach((t) => {
    if (!t.welten) return;
    t.welten.alles = Object.keys(AUS).reduce((o, k) => { o[k] = true; return o; }, {});
  });
})();
