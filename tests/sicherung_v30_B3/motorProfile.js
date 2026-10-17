// ============================================================
// Motor-Profile: Klangdaten je Auto für src/audio/engine.js (14.10. (v21), Agent Motorsounds).
//
// Wunsch des Vaters: „Die Sounds auch zu den Autos, z. B. 6-Zylinder hört sich anders an als der 150-PS-Diesel im Bus.“
// Der Klang wird synthetisch erzeugt (WebAudio, keine Audiodateien, keine Lizenzfragen). Grundregel:
//     Zündfrequenz [Hz] = Drehzahl [U/min] / 60 × Zylinderzahl / 2        (Viertakter: jeder Zylinder zündet alle 2 Umdrehungen)
// z. B. 4 Zyl. bei 2000 U/min = 66,7 Hz · Boxer-6 bei 6000 U/min = 300 Hz · V8 bei 4000 U/min = 267 Hz.
//
// API (R.MotorProfile):
//   fuer(autoOderId)            → Profil (Auto-Objekt mit .id oder id-String; unbekannt → Passat-Profil)
//   rpmGang(profil, gang, tempo, vMax) → Drehzahl [U/min] im Gang `gang` (0-basiert) bei Tempo `tempo` (m/s) – reine Funktion
//   zuendFrequenz(profil, rpm)  → Hz laut Formel oben
//   alle()                      → Liste aller Profile (für Tests)
// R.config.sound (optional, src/config.js) überschreibt: motor.lautstaerke, motor.maxKi, motor.knallen (true/false), motor.turbo (true/false).
//
// 17.10. (v29, F6) Drehzahlgrenzen = Cockpit-Skalen (src/ui/cockpit.js, MOTOREN): Diesel Skala 0–6000, rot ab 4500, Begrenzer 4800 (Passat, Multivan,
//   Polizei, Krankenwagen); Benziner Skala 0–8000; Porsche rot ab 7000, Begrenzer 7500; Formel Skala 0–13000, rot ab 11500, Begrenzer 12000.
//   rpmMax ≤ Skala (tests/test_drehzahl.js). Die Tonhöhe folgt der Drehzahl (Zündfrequenz-Formel): Formel klingt jetzt etwas tiefer als mit 18 000.
// DATEN JE AUTO – gegoogelt am 14.10.2026; „Annahme“ = nicht aus einer Quelle belegt, sondern passend gewählt.
//   Die Spiel-Höchstgeschwindigkeiten (carCatalog.js) sind höher als bei den echten Autos; deshalb wird die Übersetzung so gelegt,
//   dass der höchste Gang bei vMax die Drehzahl `rpmVmax` ergibt (Annahme), die tieferen Gänge folgen der Spreizung.
//
//  passat      VW Passat Variant B8 Facelift 2.0 TDI 200 PS (Wunsch Sebastian 14.10.: „Passat 200 PS TDI“): 4 Zyl. Reihe, Diesel, 1968 cm³,
//              200 PS (147 kW) bei ca. 3600–4000/min, 400 Nm bei 1750–3500/min, 7-Gang-DSG, 4MOTION.
//              Quellen: Nachfolger B9 2.0 TDI 4MOTION DSG 142 kW, 400 Nm bei 1750/min, 7 Gänge (autohled.cz:
//              https://www.autohled.cz/de/a/volkswagen/passat-variant/variant-2-0-tdi-4motion-dsg-3957312); 200-PS-Wert des B8 laut Sebastian.
//              Annahmen: Leerlauf 800, Abregeln ~4800, Schaltpunkt Volllast 4100, etwas mehr Turbo und weniger Nageln als der 150-PS-Bus.
//              (Vorher 150-PS-Profil – Sicherung tests/sicherung_motorsound_alt/ bzw. Git 48f75bd.)
//  polizei     = Passat-Basis (gleicher Motor, `waehlbar: false`) → Profil passat.
//  multivan    VW Multivan: 2.0 TDI 150 PS (Katalog: „T6.1 Multivan Edition“ – der Auftrag nannte T7; beide haben denselben 4-Zyl.-Diesel):
//              T7: 1968 cm³, 150 PS bei 3000–3750/min, 360 Nm bei 1600–2750/min, 7-Gang-DSG, Vmax 190 km/h.
//              Quellen: https://www.auto-data.net/de/volkswagen-multivan-t7-2.0-tdi-150hp-dsg-45470  ·  ADAC T7 Multivan 2.0 TDI DSG
//              https://www.adac.de/rund-ums-fahrzeug/autokatalog/marken-modelle/vw-nutzfahrzeuge/transporter/t7/340884/
//              Annahmen: Leerlauf 800, Abregeln ~4500, Schaltpunkt 3800; Klang etwas dumpfer/rauer als der Passat (Kastenaufbau, mehr Nageln).
//  porsche-911 Porsche 911 Carrera (992.2): 6 Zyl. Boxer, 3,0 l Biturbo, 388 hp (394 PS) bei 6500/min, 331 lb-ft (449 Nm) bei 2000–5000/min,
//              Drehzahlgrenze 7500/min, 8-Gang-PDK mit den Übersetzungen 4,89 / 3,17 / 2,15 / 1,56 / 1,18 / 0,94 / 0,76 / 0,61.
//              Quelle (Porsche Newsroom, technische Daten 992.2 Carrera):
//              https://newsroom.porsche.com/dam/jcr%3A86fc9a9b-ece1-4cca-9930-39a78e89baf3/992.2%20911%20Carrera%20and%20Carrera%20Cabriolet%20Technical%20Specifications.pdf
//              Annahmen: Leerlauf 800, Schalten spät (7000), „sägender“ Boxer-Klang (viele Obertöne, leichte Unruhe), dezentes Knallen im Schub.
//  troc-cabrio VW T-Roc Cabriolet 1.5 TSI: 4 Zyl. Reihe, Benzin, 1498 cm³, 150 PS (110 kW) bei 5000/min, 250 Nm bei 1500/min, 7-Gang-DSG, 203 km/h.
//              Quelle: ADAC Autokatalog T-Roc Cabriolet 1.5 TSI OPF ACT R-Line DSG
//              https://www.adac.de/rund-ums-fahrzeug/autokatalog/marken-modelle/vw/t-roc/1generation-facelift/340494/
//              Annahmen: Leerlauf 750, Abregeln ~6500 (wie Cockpit), Schalten 5600; heller, gleichmäßiger als der Diesel; leises Turbo-Pfeifen.
//  bmw-m4      BMW M4 Competition (G82): 6 Zyl. Reihe, Benzin-Biturbo, 2993 cm³, 510 PS bei 6250/min, 650 Nm bei 2750–5500/min, 8-Gang-M-Steptronic.
//              Quelle: https://www.auto-data.net/en/bmw-m4-g82-lci-facelift-2024-competition-3.0-510hp-m-steptronic-51080
//              Annahme: Drehzahlgrenze ~7200 (auf der Seite nicht angegeben), „samtiger“ Reihen-6, Knallen leicht.
//  amg-gt      Mercedes-AMG GT (63 S): V8, 3982 cm³, Biturbo, 639 PS, 9-Stufen-Automatik.
//              Quelle: https://www.autozeitung.de/mercedes-amg-gt-63-s-4-matic-test-195612.html
//              Annahmen: Drehzahlgrenze ~7000, Leerlauf 700, dunkles V8-Blubbern (Kreuzkurbelwelle: ungleichmäßig), deutliches Knallen.
//  audi-rs6    Audi RS6 Avant (C8): V8, 4,0 l TFSI Biturbo, 600 PS, 8-Gang-Tiptronic (Treffer: audi-mediacenter.com / angurten.de /
//              ADAC – Seiten nicht im Detail abgerufen, 600 PS und 4,0-l-V8 gelten als bekannt).
//              Annahmen: Drehzahlgrenze ~6800, Klang tief und satt, weniger Knallen als der AMG.
//  mini-cooper MINI Cooper (F56): 3 Zyl. Reihe, 1,5 l Turbo, 100 kW (≈ 136 PS), 220 Nm bei 1500/min.
//              Quelle: https://www.autohled.cz/de/a/mini/mini-3-dverove/cooper-7751898  (Getriebe dort 6-Gang-Schaltung gelistet;
//              Automatik = Steptronic-DKG laut ADAC) – Annahme hier: 7 Gänge (Doppelkupplung), Leerlauf 800, Abregeln ~6500.
//              3-Zylinder: Zündfrequenz = Drehzahl/60 × 1,5, „knurrend“, deutliche halbe Ordnung.
//  formel      Formel-Renner (Monoposto): Annahme V10-Sauger, 3,0 l, 17.10. (v29, F6; Wunsch Vater „Rennauto bis 12000“) Begrenzer 12 000/min
//              (vorher 18 000; Anzeige-Skala 0–13 000, rot ab 11 500, passend zu src/ui/cockpit.js), 8-Gang-Getriebe, Leerlauf 3500 –
//              „hoch kreischend“. Gegenvariante (heutige F1: 1,6-l-V6-Turbo-Hybrid, 15 000/min lt. Sport1:
//              https://www.sport1.de/motorsport/formel1/2017/10/formel-1-fia-legt-motoren-eckdaten-fuer-2021-fest ) klingt tiefer.
//
// Klang-Parameter (alle Annahmen, nach Gehör/Messung eingestellt – tests/test_sound.py misst Grundfrequenz und Unterschiede):
//   wave   {slope, odd, bump:[h, breite, gain]}  Obertonreihe des Zündimpulses (1/h^slope, ungerade Teiltöne ×odd, Buckel bei Teilton h)
//   halb   Pegel der „halben Ordnung“ (Zündfrequenz/2 – Viertakt-Brummen, bei 3-Zyl./V8 ungleichmäßig)
//   beat   zweiter Oszillator verstimmt um beat × f → Schwebung („sägend/rau“); wobble = Tonhöhen-Zittern in Cent
//   klopf  Nageln: Rauschen, im Takt der Zündfrequenz zerhackt (Diesel); klopfHz = Mittenfrequenz, klopfDuty = Pulsbreite
//   formant {hz, db, q}  feste Resonanz des Auspuffs (peaking-Filter), cut0/cut1/cutGas = Tiefpass-Grenzfrequenz (Hz)
//   turbo  Pfeifen (0 = kein Turbo), knallen  Knallen/Blubbern bei Gas weg (0 = nie), pegel = Lautstärke relativ
// 17.10. (v30, G2 – Vater: „mehrstimmig und weniger schrill, nicht nur ein Ton“): je Motor jetzt vier Tonstimmen statt zwei: Zündfrequenz als Säge (wave) +
//   weiches Rechteck um `det` (6 Cent) verstimmt + Oktave darunter als Dreieck (`halb`) + Sub-Sinus 40–90 Hz (`sub`, Diesel/V8 stärker, läuft mit der Drehzahl);
//   Tiefpass `lp` = [Leerlauf, Vollgas] in Hz (läuft mit Drehzahl+Gas mit, zwei Biquads, Resonanz `res`), Ansaugrauschen `ansaug` bei Last, Turbo-Pfeifen tiefer.
//   Gegner-Autos (KI): nur Säge + Oktave (2 Tonoszillatoren). Drehzahl-/Gangmodell unverändert; `pegel` gleicht auf den RMS von v29 (±1 dB) an.
// Schaltlogik: hoch/hochVoll = Drehzahl für das Hochschalten bei leichtem/vollem Gas, runter = Runterschalten, schaltZeit = Zugkraft-
//   Unterbrechung (s), startRpm = Drehzahl beim Anfahren mit Vollgas (schleifende Kupplung).
// ============================================================
(function () {
  const R = window.Rennspiel = window.Rennspiel || {};

  /** Geometrisch gestufte Übersetzungen: n Gänge, 1. Gang r1, letzter Gang rn. */
  function stufen(n, r1, rn) {
    const a = [], q = Math.pow(rn / r1, 1 / (n - 1));
    for (let i = 0; i < n; i++) a.push(r1 * Math.pow(q, i));
    return a;
  }

  const P = {};

  P.passat = {
    id: 'passat', name: 'VW Passat Variant 2.0 TDI 200 PS', bauart: 'Reihen-4 Diesel', zyl: 4, hubraum: 1968, ps: 200,
    leerlauf: 800, rpmMax: 4800, rpmVmax: 3900, startRpm: 2000, hoch: 2300, hochVoll: 4100, runter: 1300,
    gaenge: stufen(7, 3.9, 0.62), schaltZeit: 0.16, steigK: 12, fallK: 9,
    wave: { slope: 1.15, odd: 1, bump: [4, 2.5, 1.0] }, halb: 0.534, beat: 0.004, wobble: 7,
    klopf: 2.1, klopfHz: 1700, klopfQ: 0.9, klopfDuty: 0.12,
    formant: { hz: 380, db: 4, q: 1.0 }, cut0: 520, cut1: 900, cutGas: 500,
    saege: 0.89, turbo: 0.32, knallen: 0, pegel: 0.897, kurve: [0.84, 0.871, 1.007, 0.849],
    lp: [298, 1530], res: 1.5, sub: 0.500, ansaug: 0.5, det: 0.0035,
  };
  P.polizei = Object.assign({}, P.passat, { id: 'polizei', name: 'Streifenwagen (Passat-Basis)' });

  P.multivan = {
    id: 'multivan', name: 'VW Multivan 2.0 TDI', bauart: 'Reihen-4 Diesel', zyl: 4, hubraum: 1968, ps: 150,
    leerlauf: 800, rpmMax: 4800, rpmVmax: 3500, startRpm: 2100, hoch: 2100, hochVoll: 3800, runter: 1250,
    gaenge: stufen(7, 3.9, 0.62), schaltZeit: 0.2, steigK: 10, fallK: 8,
    wave: { slope: 1.0, odd: 1, bump: [3, 2.0, 1.2] }, halb: 0.55, beat: 0.005, wobble: 9,
    klopf: 3.9, klopfHz: 1500, klopfQ: 0.8, klopfDuty: 0.15,
    formant: { hz: 300, db: 5, q: 1.1 }, cut0: 440, cut1: 750, cutGas: 450,
    turbo: 0.3, knallen: 0, pegel: 0.826, kurve: [0.789, 0.837, 0.967, 0.857],
    lp: [330, 1700], res: 1.5, sub: 0.8, ansaug: 0.5, det: 0.0035,
  };
  // 15.10. (v25): Verkehr – Krankenwagen (Multivan-Basis) und Abschleppwagen (Diesel-Lkw: tiefer Leerlauf, niedrige Drehzahl)
  P.krankenwagen = Object.assign({}, P.multivan, { id: 'krankenwagen', name: 'Krankenwagen (Multivan-Basis)' });
  P.abschleppwagen = Object.assign({}, P.multivan, { id: 'abschleppwagen', name: 'Abschleppwagen (Diesel-Lkw)', leerlauf: 650, rpmMax: 3200, rpmVmax: 2600, startRpm: 1500,
    hoch: 1800, hochVoll: 2800, runter: 1000, pegel: 1.05, kurve: [0.629, 0.738, 0.813, 0.734], klopf: 4.7 });

  P['porsche-911'] = {
    id: 'porsche-911', name: 'Porsche 911 Carrera 3.0 Boxer', bauart: 'Boxer-6 Biturbo', zyl: 6, hubraum: 2981, ps: 394,
    leerlauf: 800, rpmMax: 7500, rpmVmax: 6900, startRpm: 3500, hoch: 4200, hochVoll: 7000, runter: 2200,
    gaenge: [4.89, 3.17, 2.15, 1.56, 1.18, 0.94, 0.76, 0.61], schaltZeit: 0.09, steigK: 20, fallK: 14,
    wave: { slope: 0.72, odd: 1, bump: [9, 4, 1.4] }, halb: 0.454, beat: 0.012, wobble: 11,
    klopf: 0.06, klopfHz: 2600, klopfQ: 0.7, klopfDuty: 0.2,
    formant: { hz: 950, db: 6, q: 2.0 }, cut0: 900, cut1: 2600, cutGas: 1200,
    saege: 0.89, turbo: 0.35, knallen: 0.5, pegel: 1.226, kurve: [1.07, 1.04, 1.071, 0.999],
    lp: [357, 2040], res: 1.7, sub: 0.357, ansaug: 0.6, det: 0.0035,
  };

  P['troc-cabrio'] = {
    id: 'troc-cabrio', name: 'VW T-Roc Cabrio 1.5 TSI', bauart: 'Reihen-4 Benziner Turbo', zyl: 4, hubraum: 1498, ps: 150,
    leerlauf: 750, rpmMax: 6500, rpmVmax: 5000, startRpm: 2600, hoch: 3000, hochVoll: 5600, runter: 1500,
    gaenge: stufen(7, 3.7, 0.6), schaltZeit: 0.11, steigK: 16, fallK: 11,
    wave: { slope: 0.9, odd: 1, bump: [6, 3, 0.9] }, halb: 0.30, beat: 0.002, wobble: 3,
    klopf: 0.07, klopfHz: 3000, klopfQ: 0.8, klopfDuty: 0.2,
    formant: { hz: 1200, db: 4, q: 1.2 }, cut0: 800, cut1: 2000, cutGas: 900,
    turbo: 0.5, knallen: 0, pegel: 0.943, kurve: [1.002, 1.309, 0.903, 1.082],
    lp: [400, 2200], res: 1.5, sub: 0.25, ansaug: 0.5, det: 0.0035,
  };

  P['bmw-m4'] = {
    id: 'bmw-m4', name: 'BMW M4 Competition', bauart: 'Reihen-6 Biturbo', zyl: 6, hubraum: 2993, ps: 510,
    leerlauf: 750, rpmMax: 7200, rpmVmax: 6300, startRpm: 3300, hoch: 3800, hochVoll: 6800, runter: 1900,
    gaenge: stufen(8, 4.7, 0.72), schaltZeit: 0.1, steigK: 18, fallK: 12,
    wave: { slope: 0.85, odd: 1.1, bump: [3, 2.5, 1.0] }, halb: 0.28, beat: 0.003, wobble: 3,
    klopf: 0.05, klopfHz: 2400, klopfQ: 0.7, klopfDuty: 0.2,
    formant: { hz: 600, db: 5, q: 1.4 }, cut0: 800, cut1: 2300, cutGas: 1000,
    turbo: 0.4, knallen: 0.35, pegel: 1.023, kurve: [0.941, 0.889, 1.021, 1.024],
    lp: [400, 2200], res: 1.6, sub: 0.30, ansaug: 0.6, det: 0.0035,
  };

  P['amg-gt'] = {
    id: 'amg-gt', name: 'Mercedes-AMG GT V8', bauart: 'V8 Biturbo', zyl: 8, hubraum: 3982, ps: 639,
    leerlauf: 700, rpmMax: 7000, rpmVmax: 6000, startRpm: 3000, hoch: 3600, hochVoll: 6500, runter: 1800,
    gaenge: stufen(9, 4.4, 0.6), schaltZeit: 0.1, steigK: 16, fallK: 14,
    wave: { slope: 0.95, odd: 1, bump: [2, 2.0, 1.4] }, halb: 0.55, beat: 0.02, wobble: 14,
    klopf: 0.03, klopfHz: 1800, klopfQ: 0.7, klopfDuty: 0.25,
    formant: { hz: 250, db: 7, q: 1.0 }, cut0: 650, cut1: 1600, cutGas: 900,
    turbo: 0.2, knallen: 1.0, pegel: 0.744, kurve: [1.072, 0.997, 0.973, 1.122],
    lp: [380, 2000], res: 1.5, sub: 0.60, ansaug: 0.5, det: 0.0045,
  };

  P['audi-rs6'] = {
    id: 'audi-rs6', name: 'Audi RS6 Avant V8', bauart: 'V8 Biturbo', zyl: 8, hubraum: 3996, ps: 600,
    leerlauf: 700, rpmMax: 6800, rpmVmax: 5600, startRpm: 2800, hoch: 3400, hochVoll: 6000, runter: 1700,
    gaenge: stufen(8, 4.7, 0.7), schaltZeit: 0.14, steigK: 14, fallK: 13,
    wave: { slope: 1.0, odd: 1, bump: [2, 1.8, 1.3] }, halb: 0.42, beat: 0.012, wobble: 8,
    klopf: 0.04, klopfHz: 1600, klopfQ: 0.7, klopfDuty: 0.25,
    formant: { hz: 220, db: 6, q: 1.0 }, cut0: 560, cut1: 1300, cutGas: 800,
    turbo: 0.25, knallen: 0.4, pegel: 0.796, kurve: [1.017, 0.95, 1.044, 1.075],
    lp: [370, 1900], res: 1.5, sub: 0.60, ansaug: 0.5, det: 0.0040,
  };

  P['mini-cooper'] = {
    id: 'mini-cooper', name: 'MINI Cooper 1.5 Dreizylinder', bauart: 'Reihen-3 Turbo', zyl: 3, hubraum: 1499, ps: 136,
    leerlauf: 800, rpmMax: 6500, rpmVmax: 5200, startRpm: 2400, hoch: 3000, hochVoll: 5800, runter: 1500,
    gaenge: stufen(7, 3.8, 0.62), schaltZeit: 0.1, steigK: 16, fallK: 11,
    wave: { slope: 0.9, odd: 1.2, bump: [5, 3, 1.0] }, halb: 0.55, beat: 0.015, wobble: 16,
    klopf: 0.12, klopfHz: 2200, klopfQ: 0.8, klopfDuty: 0.2,
    formant: { hz: 700, db: 4, q: 1.2 }, cut0: 750, cut1: 1900, cutGas: 800,
    turbo: 0.45, knallen: 0, pegel: 1.145, kurve: [0.787, 1.026, 1.026, 0.913],
    lp: [400, 2200], res: 1.5, sub: 0.15, ansaug: 0.5, det: 0.0035,
  };

  P.formel = {
    id: 'formel', name: 'Formel-Renner', bauart: 'V10 Hochdreher (Annahme)', zyl: 10, hubraum: 3000, ps: 900,
    leerlauf: 3500, rpmMax: 12000, rpmVmax: 10600, startRpm: 6500, hoch: 7500, hochVoll: 11200, runter: 5500,
    gaenge: stufen(8, 3.6, 0.8), schaltZeit: 0.05, steigK: 24, fallK: 22,
    wave: { slope: 0.55, odd: 1, bump: [3, 3.0, 0.6] }, halb: 0.293, beat: 0.004, wobble: 2,
    klopf: 0, klopfHz: 3000, klopfQ: 0.7, klopfDuty: 0.3,
    formant: { hz: 1800, db: 3, q: 1.0 }, cut0: 4000, cut1: 7000, cutGas: 2500,
    saege: 0.89, turbo: 0, knallen: 0, pegel: 1.778, kurve: [1.029, 1.078, 1.042, 0.97],
    lp: [1530, 2975], res: 1.3, sub: 0.178, ansaug: 0.4, det: 0.0035,
  };

  const STANDARD = P.passat;

  R.MotorProfile = {
    profile: P,
    standard: STANDARD,
    alle() { return Object.keys(P).map((k) => P[k]); },
    /** Profil zu Auto-Objekt (mit .id) oder id-String; unbekannt → Passat-Profil. */
    fuer(auto) {
      const id = auto && typeof auto === 'object' ? auto.id : auto;
      return (id && P[id]) || STANDARD;
    },
    /** Drehzahl [U/min] im Gang g (0-basiert) bei Tempo `tempo` (m/s). Der letzte Gang ergibt bei vMax genau rpmVmax. */
    rpmGang(p, g, tempo, vMax) {
      const n = p.gaenge.length;
      const r = tempo > 0 ? Math.min(1.25, tempo / (vMax > 1 ? vMax : 40)) : 0;
      return p.rpmVmax * r * p.gaenge[g] / p.gaenge[n - 1];
    },
    /** Zündfrequenz in Hz (Viertakt): Drehzahl/60 × Zylinder/2. */
    zuendFrequenz(p, rpm) { return rpm / 60 * p.zyl / 2; },
  };
})();
