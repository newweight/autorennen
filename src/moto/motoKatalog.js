// ============================================================
// Motorrad-Katalog (Stufe M1): Crossmaschinen statt Autos – NUR im Motorrad-Modus (window.MOTORRAD === true).
//
// Docking per Laufzeit-Umbau, keine bestehende Datei wird angefasst:
//  - R.carCatalog (Array, von allen Modulen über R.carCatalog gelesen) bekommt die Motorräder VORNE eingefügt;
//    alle Autos bleiben im Array (Streifenwagen/Krankenwagen/Verkehr suchen sie per id), werden aber auf waehlbar:false gesetzt.
//    → waehlbare() (Menü, Vorschau, Garage, main.js, KI) liefert nur noch Motorräder.
//  - gegnerAutos() wird ersetzt: KI-Gegner fahren Crossmaschinen in verschiedenen Farben (abgeleitete Einträge, optionen.farbe/fahrer/helm).
//  - nurRennautos() liefert immer false (Formel-Modus gibt es für Motorräder nicht).
//  - Einträge tragen sonderbau:'motorrad' → carBuilder.bauen() ruft R.sonderbauten.motorrad (src/moto/motoModell.js).
//  - Eigene Speicher-Schlüssel (Einstellungen, Garage, Pokale), damit Autorennen.html (gleiche Herkunft) nicht überschrieben wird.
// Fahrwerte im selben Format wie src/cars/carCatalog.js: wendiger und leichter als Autos, Tempo wie ein Mittelklasse-Auto (240 km/h).
// Reine Funktionen (motorradKatalog, gegnerMotorraeder) hängen nur von R.carCatalog-Daten ab und sind in Node testbar.
// ============================================================
window.Rennspiel = window.Rennspiel || {};

(function () {
  const R = window.Rennspiel;

  /** Fahrwerte der Crossmaschine (Fahrer eingerechnet): Tempo ≈ Mittelklasse-Auto, aber leicht, spritzig, sehr wendig. */
  const FAHRWERTE = {
    vMax: 240 / 3.6, beschleunigung: 6.8, bremsen: 22, rueckwaertsMax: 4,
    wendigkeit: 2.5, grip: 0.9, masse: 190, laenge: 2.1, breite: 0.85,
  };
  /** Echte Maße nur für die Optik/Vorschau (Physik nutzt fahrwerte.laenge/breite). */
  const ABMESSUNGEN = { laenge: 2.15, breite: 0.85, hoehe: 1.6, radstand: 1.48, ueberhangVorn: 0.36, radRadius: 0.34, radBreite: 0.1, felgeZoll: 19 };

  /**
   * Farbvarianten: bike = Lack der Maschine, fahrer = Kombi, helm = Helm, nr = Startnummer.
   * Die ersten vier sind im Menü wählbar, alle acht gibt es als KI-Gegner (Farben ohne Doppel, solange die Palette reicht).
   */
  const VARIANTEN = [
    { id: 'crossmaschine',        name: 'Crossmaschine Orange',  farbeName: 'Orange',  bike: 0xff6a10, fahrer: 0x1d4ed8, helm: 0xf4f4f4, nr: 1,  waehlbar: true },
    { id: 'crossmaschine-rot',    name: 'Crossmaschine Rot',     farbeName: 'Rot',     bike: 0xd7261e, fahrer: 0x23262d, helm: 0xf4f4f4, nr: 7,  waehlbar: true },
    { id: 'crossmaschine-blau',   name: 'Crossmaschine Blau',    farbeName: 'Blau',    bike: 0x1e5bd8, fahrer: 0xffc21a, helm: 0x23262d, nr: 21, waehlbar: true },
    { id: 'crossmaschine-gruen',  name: 'Crossmaschine Grün',    farbeName: 'Grün',    bike: 0x1fa84f, fahrer: 0xf4f4f4, helm: 0x1fa84f, nr: 33, waehlbar: true },
    { id: 'crossmaschine-gelb',   name: 'Crossmaschine Gelb',    farbeName: 'Gelb',    bike: 0xf6c20a, fahrer: 0x2a2d35, helm: 0xf6c20a, nr: 12, waehlbar: false },
    { id: 'crossmaschine-lila',   name: 'Crossmaschine Lila',    farbeName: 'Lila',    bike: 0x7a3cc8, fahrer: 0xf4f4f4, helm: 0x7a3cc8, nr: 44, waehlbar: false },
    { id: 'crossmaschine-tuerkis',name: 'Crossmaschine Türkis',  farbeName: 'Türkis',  bike: 0x00b3b8, fahrer: 0xd7261e, helm: 0xf4f4f4, nr: 58, waehlbar: false },
    { id: 'crossmaschine-pink',   name: 'Crossmaschine Pink',    farbeName: 'Pink',    bike: 0xf0409a, fahrer: 0x23262d, helm: 0xf0409a, nr: 69, waehlbar: false },
  ];

  function eintrag(v) {
    return {
      id: v.id,
      name: v.name,
      marke: 'Cross', modell: 'Crossmaschine ' + v.farbeName,
      generischerName: 'Crossmaschine',
      farbe: v.bike, farbe2: v.fahrer, farbeName: v.farbeName,
      karosserie: 'motorrad', sonderbau: 'motorrad',
      abmessungen: Object.assign({}, ABMESSUNGEN),
      optionen: { fahrer: v.fahrer, helm: v.helm, nummer: v.nr },
      fahrwerte: Object.assign({}, FAHRWERTE),
      beschreibung: 'Die Crossmaschine ist leicht und wendig und springt über jede Kurve.',
      waehlbar: v.waehlbar,
    };
  }

  /** Alle Motorrad-Katalogeinträge (frisch erzeugt; die ersten vier wählbar, der Rest nur als KI-Gegner). */
  function motorradKatalog() { return VARIANTEN.map(eintrag); }

  // ---- kleine deterministische Zufallsfunktionen (wie carCatalog.js) ----
  function hashText(t) { let h = 2166136261 >>> 0; for (let i = 0; i < t.length; i++) { h ^= t.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return h >>> 0; }
  function zufall(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

  /**
   * KI-Gegner: `anzahl` abgeleitete Einträge (id 'crossmaschine…' der Farbvariante, Katalogeintrag selbst unverändert),
   * deterministisch je opt.seed, nie die Variante eines Spielers (opt.spielerIds), Varianten ohne Doppel, solange die Palette reicht.
   * Rückgabe: Array von Einträgen { …Variante, optionen: { fahrer, helm, nummer, farbe } } – optionen.farbe = Lack (wie bei Auto-Gegnern).
   */
  function gegnerMotorraeder(katalog, anzahl, opt) {
    opt = opt || {};
    const rnd = zufall(hashText('moto|' + String(opt.seed === undefined ? 'rennen' : opt.seed)));
    const spielerIds = opt.spielerIds || [];
    let pool = katalog.filter((a) => a.sonderbau === 'motorrad' && !spielerIds.includes(a.id));
    if (!pool.length) pool = katalog.filter((a) => a.sonderbau === 'motorrad');
    const reihe = pool.slice();
    for (let i = reihe.length - 1; i > 0; i--) { const k = Math.floor(rnd() * (i + 1)); const t = reihe[i]; reihe[i] = reihe[k]; reihe[k] = t; }
    const liste = [];
    for (let j = 0; j < anzahl; j++) {
      const basis = reihe[j % reihe.length];
      liste.push(Object.assign({}, basis, { optionen: Object.assign({}, basis.optionen || {}, { farbe: basis.farbe }) }));
    }
    return liste;
  }

  R.Moto = R.Moto || {};
  R.Moto.katalog = { FAHRWERTE, ABMESSUNGEN, VARIANTEN, motorradKatalog, gegnerMotorraeder };

  if (window.MOTORRAD !== true || !R.carCatalog) return;

  // ---------------- Umbau des Auto-Katalogs zur Laufzeit ----------------
  const kat = R.carCatalog;
  if (!kat.some((a) => a.sonderbau === 'motorrad')) {
    kat.forEach((a) => { a.waehlbar = false; });                 // Autos bleiben für Polizei/Verkehr im Array, aber nicht wählbar
    kat.unshift.apply(kat, motorradKatalog());                    // Motorräder vorn (waehlbare()[0] = Fallback)
  }
  kat.gegnerAutos = (anzahl, opt) => gegnerMotorraeder(kat, anzahl, opt);
  kat.nurRennautos = () => false;
  kat.formelFeld = (opt) => ({ spieler: (opt && opt.spieler) || [], gegner: [] });

  // eigene Speicherstände (Einstellungen/Garage/Pokale) – getrennt von Autorennen.html
  if (R.config) {
    if (R.config.titel) R.config.titel = 'Motorrad-Rennen';
    [R.config.ui, R.config.garage, R.config.pokal].forEach((c) => {
      if (c && typeof c.speicherSchluessel === 'string' && !/\.motorrad$/.test(c.speicherSchluessel)) c.speicherSchluessel += '.motorrad';
    });
  }
})();
