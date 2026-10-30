// ============================================================
// Strecke: Logik (Untergrund, Höhe, Startaufstellung, Checkpoints,
// Ideallinien-Tempo) und Grafik (bauen()).
// Nur bauen() braucht Three.js – alles andere läuft auch in Node-Tests.
//
// Heading-Konvention wie vehicle.js: heading 0 = Richtung -z,
// richtung() = { x: -sin h, z: -cos h }, Linkslenken erhöht heading.
//
// Runde 4: Welten + Spuren.
//   new R.Strecke(daten, { welt })   welt = Name aus daten.welten (sonst daten.weltStandard)
//   12.10. optionen.hindernisMenge: 'normal' (Standard, Katalog unverändert) | 'viele' (≈ ×3, mind. 1 je 150 m) | 'sehrViele' (≈ ×5, mind. 1 je 80 m): zusätzliche Öl-/Sand-/
//   Baustellen-/Ast-/Wrack-/Strohballen-Einträge, deterministisch (Seed je Strecke + Variante + Menge), nur in Welten mit diesen
//   Schichten; strecke.hindernisMenge, strecke.hindernisZusatz { hindernisse, wracks, strohballen, gewollt, weggelassen, slalom }.
//   strecke.welt (Name), strecke.weltDaten / strecke.aktiveSchichten ({ hindernisse, wracks, … : bool })
//   strecke.daten = Katalogeintrag, aber nur mit den Listen aktiver Schichten (dynamik.js liest baelle/
//   wasserstrahlen von hier); strecke.katalog = unveränderter Katalogeintrag.
//   strecke.hindernisse / loopings / wracks / strohballen / schanzen / boostFelder / schilde: leer, wenn aus.
//   Z1: optionen.zufall = { seed } → Lage der Hindernisse/Wracks/Strohballen/Dinos aus dem Rennseed (src/track/zufall.js), strecke.zufall = Zustand
//   (ohne die Option bleibt alles bitgleich wie im Katalog; spätere Neuverteilungen: R.Zufall.ereignis).
//   strecke.breiteBei(s): Fahrbahnbreite an s (Spuren: 1 Spur 5 m, 3 Spuren 15 m, Übergang 40 m);
//   Straße, Randsteine, Mittellinien, Bande (grenzeBei), Untergrund und Checkpoints nutzen sie.
//   Enge Stellen (1 Spur): Leitplanke direkt hinter dem Randstreifen (_leitplankenBauen).
//
// Runde 6 (W4-I, Alpen): Höhenmodell 'strasse' (Katalog hoehenModell) + Überführungen (Katalog ueberfuehrungen [{ s0, s1 }]).
//   hoeheBeiS(s, q)        Fahrbahnhöhe aus dem eigenen s (Spline-y, Querneigung 0; neben der Fahrbahn = Boden)
//   hoeheAn(x, z)          Boden (an einer Überführung das UNTERE Niveau); hoeheAn(x, z, index) = Fahrbahn des Abschnitts zum Index
//   abfrage/untergrundAn   mit Index-Kontinuität (±120 m lokal, global erst > Bande + 15 m) – oben bleibt oben
//   ueberfuehrungBei(s), ueberfuehrungNah(s, zugabe)  Brückenbereich oben bzw. oben ODER unten (Sperrzone für Deko/Münzen/Listen)
//   Boden = geglättete Straßenhöhe + Hügel + See-Mulde, an die Fahrbahnen angeglichen; feine Böschung (_boeschungBauen),
//   Brücke mit Pfeilern (_ueberfuehrungBauen). Höhenmodell 'gelaende' (alle anderen Strecken): Verhalten unverändert.
//
// Runde 6 (W4-J, Fantasie): niveaugleiche Kreuzungen (Katalog kreuzungen [{ s0, s1 }] = Bereich des ersten Abschnitts).
//   kreuzungen[i] = { sA, sB, x, z, winkel, dy, a: { s0, s1 }, b: { s0, s1 }, halb, … } (_kreuzungBerechnen, |Δy| < 1 m)
//   kreuzungNah(s, zugabe) / kreuzungBei(s, zugabe)  Sperrzone ±KREUZ_HALB m um sA bzw. sB (Deko, Münzen, Listen)
//   abfrage/untergrundAn   Index-Kontinuität wie an der Überführung; im Kreuzungsbereich zählt die querende Fahrbahn als
//                          Straße/Rand (_kreuzungUntergrund) – sonst wäre sie für Autos des anderen Abschnitts „Gras"
//   Grafik: Randsteine/Mittellinie an der Kreuzung ausgespart, Kreuzungsplatte (überdeckt beide Fahrbahnen, kein
//   Z-Fighting), Haltelinien, 4 Warnlicht-Masten (Andreaskreuz, rote Lampen) → kreuzungAnimieren(zeit, fahrzeuge).
//   Zaun: entfällt automatisch dort, wo die querende Strecke näher ist (zaunPunkte); die Bande gilt je Auto für SEINEN
//   Abschnitt (Index-Kontinuität), sperrt also die querende Fahrbahn nicht.
//   v14 Kreuzungs-Zaun: wer auf der Kreuzung abbiegt, stößt nach ~21 m (Bande 23 m, Karosserie-Ecke) an die Bande des
//   eigenen Abschnitts. Damit man sieht, wo es nicht weitergeht, steht der Zaun jetzt auch in den Zwickeln zwischen den
//   Fahrbahnen (_kreuzungZaunOk, Punktmarke kz): genau an der Bande, mit Pfosten an beiden Enden, ≥ 0,6 m Luft zum Randstein
//   der querenden Fahrbahn. In den 4 Straßenmündungen bleibt die Bande unsichtbar – dort fährt der andere Abschnitt
//   ungehindert durch (ein Zaun quer über die Mündung würde dessen Fahrbahn versperren).
//   v16 (13.10.) ABBIEGEN OHNE UNSICHTBARE WAND: Die Wand in den 4 Mündungen entfällt durch einen Abschnittswechsel
//   (_kreuzungWechsel / _naechsterWechsel, benutzt von abfrage, untergrundAn und collisions.bande): Steht ein Auto
//   ≥ KREUZ_WECHSEL (17 m) von der Kreuzungsmitte auf der Fahrbahn des ANDEREN Abschnitts (bis 40 m) und nicht mehr auf der
//   eigenen Fahrbahn, bekommt es dessen Index → dessen normale Bande/Untergrund, keine Wand quer über der Straße. Rein
//   geometrisch (x, z, Index; keine Zeit/Zufall) → Server, Browser-Vorhersage und Tests rechnen gleich; geradeaus (und überall
//   sonst) bleibt die Index-Kontinuität unverändert. Keine Abkürzung: kreuzungAbgebogen(x, z, n) (n = Zuordnung OHNE Wechsel)
//   meldet der Rennleitung das Abbiegen – raceManager._abbiegen friert Fortschritt/Checkpoints ein, Meldung „Falsch abgebogen“,
//   nach 4 s (oder > 60 m weg) Reset an den letzten Checkpoint (main.js _abbiegenPruefen). Zaun in den Zwickeln (v14) bleibt
//   unverändert: dort gilt weiter die Bande des eigenen Abschnitts. Test: tests/test_kreuzung_abbiegen.js.
//
// 14.10. (v18) GABELUNG (Wiese + Wüste, Katalog gabelungen [{ s0, s1, versatz, astBreite, anteil }], in allen Welten):
//   Die doppelspurige Straße teilt sich bei s0 (Y) in zwei getrennte, je ≈ 6 m breite Fahrbahnen (Ast −1 links, +1 rechts) mit Insel
//   dazwischen und führt bei s1 wieder zusammen. Beide Äste liegen auf Mittellinie ± c(s) (c wächst smoothstep von breite/4 auf `versatz`,
//   Astbreite 2·h(s) schrumpft von breite/2 auf astBreite; ganz am Anfang/Ende liegen die zwei Hälften Rand an Rand = die volle Straße).
//   Weil beide Äste derselben Mittellinie folgen, ist s (Fortschritt, Checkpoints, Runden, Platzierung) für beide Äste gleich und die Längen
//   unterscheiden sich nur um 2·∫c·κ ds (auf den gewählten fast geraden Stücken ≈ 0, strecke.gabelInfo() meldet sie).
//   gabelBei(s) → { g, u, t, c, h } | null · breiteBei(s) = 2h im Abschnitt · grenzeBei(s) = h + Rand + 0,4 (Leitplanke direkt am Ast).
//   SEITENABSTAND IM ABSCHNITT: abfrage()/untergrundAn()/Bande messen relativ zur Mitte des NÄCHSTEN Astes (Vorzeichen des rohen
//   Seitenabstands q wählt den Ast): n.seitenabstand = q − ast·c(s), n.abstand entsprechend, n.ast = ±1, n.q0 = roher Wert.
//   Dadurch gelten Untergrund (Straße/Rand/Gras), Bande, Fahrhilfe, „abseits“ und die KI-Fahrbahnbreite ohne Sonderfall; die Insel ist
//   Gras (zwischen den Rändern) mit Leitplanke an beiden Inselkanten → keine Abkürzung. Rohe Spline-Abfragen (spline.naechster) liefern
//   weiter den Abstand zur Mittellinie (raceManager: s/Checkpoints). Hilfsfunktionen: gabelAst(q, s), astPunkt(s, ast) (Punkt + Tangente auf
//   dem Ast, für Reset), gabelQ(sNeu, sAlt, q) (Querlage auf den anderen s übertragen), gabelKruemmung(s) (zusätzliche Kurvenkrümmung der Äste).
//   Grafik: Straßenband und Randsteine entfallen im Abschnitt (zwei Bänder + Randsteine + Inselrasen = Mesh „Gabelung“), Leitplanken,
//   Pfeilschild, Leitpfosten und Inseldeko (Wiese: Bäume, Büsche, Blumen · Wüste: Kakteen, Felsen, Gestrüpp) = Mesh „Gabeldeko“.
//   Sperrzone für Deko, Hindernis-Extras (hindernisMenge) und Münzen. Minimap: gabelMinimap(g, nachPx, mass, dpr) (hud.js ruft es auf).
//   Test: tests/test_gabelung.js.
// ============================================================
(function () {
  const R = window.Rennspiel;

  // Ideallinie (für die Computerfahrer in Abschnitt 5)
  const A_QUER_MAX = 7;     // m/s² erlaubte Querbeschleunigung
  const A_BREMS = 8;        // m/s² Bremsverzögerung vor Kurven
  const V_DECKEL = 78;      // m/s Höchsttempo der Ideallinie (Autos bis 270 km/h; Bremshilfe nutzt tempoBei)
  const KERB_KRUEMMUNG = 1 / 150;  // ab hier rot-weiße Randsteine
  // Brücken und Tunnel: Bande direkt hinter dem Randstreifen (Geländer / Tunnelwand)
  const ENG_ZUGABE = 0.4;   // m hinter dem Randstreifen
  const TRICHTER = 25;      // m Übergang von der normalen zur engen Bande (davor und danach)
  // Senke unter einer Brücke (lokal um die Brückenmitte: l längs, q quer)
  const SENKE_Q0 = 34, SENKE_Q1 = 58;    // volle Tiefe bis q0, flach bei q1
  const GROB_RAND = 6, GROB_ABSENKUNG = 1.5;  // grobes Bodengitter tiefer/weiter als die feine Senke
  // Runde 4: Spuren (Katalog spuren [{ s0, s1, spuren: 1 | 3 }])
  const SPUR_BREITE = { 1: 5, 3: 15 };   // m Fahrbahnbreite je Spurzahl
  const SPUR_UEBERGANG = 40;             // m weicher Übergang vor s0 und nach s1
  const BODEN_HALB = 800, BODEN_SICHT = 450;   // Bodenplatte mind. ±800 m, sonst Strecke + 450 m Rand
  // Alle Schichten einer Welt (Katalog welten[name] = { schicht: bool })
  const SCHICHTEN = ['hindernisse', 'wracks', 'strohballen', 'spuren', 'schanzen', 'baelle', 'wasserstrahlen', 'boost', 'schild', 'loopings', 'kleber', 'dinos'];
  // Katalogfeld je Schicht (Liste der Einträge)
  const SCHICHT_FELD = { hindernisse: 'hindernisse', wracks: 'wracks', strohballen: 'strohballen', spuren: 'spuren',
    schanzen: 'schanzen', baelle: 'baelle', wasserstrahlen: 'wasserstrahlen', boost: 'boostFelder', schild: 'schilde', loopings: 'loopings',
    kleber: 'kleber', dinos: 'dinos' };
  // Runde 6 (W4-I): Höhenmodell „strasse" (Alpen) – Fahrbahnhöhe = Spline-y (Katalog), Querneigung 0; der Boden wird an die
  // Straße angeglichen: bis flachQ (Fahrbahn + Rand + FLACH_ZUGABE) exakt Straßenhöhe, bis BLEND_R weich ins Gelände.
  // Gelände = geglättete Straßenhöhe (GLATT_SIGMA, Raster GRUND_ZELLE) + Hügel + See-Mulde. Überführungen: die obere Fahrbahn
  // zieht den Boden NICHT mit (Gewicht 0 im Brückenbereich, UEB_RAMPE m Übergang) → Boden darunter = untere Straße/Tal.
  const FLACH_ZUGABE = 2.5, BLEND_R = 28, UEB_RAMPE = 12, GLATT_SIGMA = 45, GRUND_ZELLE = 10;
  const KORRIDOR_SENKE = 3;      // grobes Bodengitter im Straßenkorridor so viel tiefer (die feine Böschung liegt darüber)
  const BOESCHUNG_TOL = 0.03, BOESCHUNG_STUFEN = 4;   // 14.10. (v20): Böschung wird geteilt, bis die Sehne höchstens 3 cm von der wahren Höhe abweicht
  const BOESCHUNG_BIS = BLEND_R + 26;   // feine Böschung quer bis hierhin (m ab Mitte)
  const UNTEN_HALB = 45;         // unterer Abschnitt an einer Überführung: ± so viel m um die Kreuzung gilt als „darunter"
  // Runde 6 (W4-J): niveaugleiche Kreuzung
  const KREUZ_HALB = 15;         // m: Kreuzungsbereich je Abschnitt (± um sA bzw. sB) – Sperrzone, Fahrbahn der anderen Strecke
  const KREUZ_DY_MAX = 1;        // m: höchstens so viel Höhenunterschied (sonst wäre es eine Überführung)
  const KREUZ_DEKO = 36;         // m Radius um die Kreuzungsmitte ohne Deko
  const KREUZ_WECHSEL = 17;      // m (v16): ab so weit von der Kreuzungsmitte AUF der Querstraße wechselt die Streckenzuordnung (Abschnittswechsel)
  const KREUZ_WECHSEL_MAX = 40;  // m: weiter draußen gilt wieder nur die normale Index-Kontinuität (Teleport-Rückfall > Bande + 15 m)
  const KREUZ_WARN = 60;         // m: Auto im anderen Abschnitt so nah vor der Kreuzung → Warnlicht blinkt schnell
  // 14.10. (v18): Gabelung (Standardwerte, der Katalog kann versatz/astBreite/anteil überschreiben)
  const GABEL_VERSATZ = 11;      // m: Mitte eines Astes ab der Mittellinie auf der Plateau-Strecke
  const GABEL_AST_BREITE = 6;    // m: Fahrbahnbreite eines Astes (1 Spur)
  const GABEL_ANTEIL = 0.36;     // Anteil der Gesamtlänge für die Teilung (und ebenso die Zusammenführung)
  const GABEL_SPERRE = 30;       // m: Katalog-Einträge/Hindernis-Extras/Münzen halten so viel Abstand zum Abschnitt

  /** Weicher Übergang 0 → 1 zwischen a und b. */
  function glatt(a, b, x) { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); }

  /** Heading (wie vehicle.js) aus einer Richtung in XZ. */
  function headingAus(tx, tz) { return Math.atan2(-tx, -tz); }

  /**
   * Welt-Auswahl: Name der Welt, die für diese Daten gilt (unbekannt/leer → weltStandard → erste Welt).
   * Ohne welten im Katalog (alte/Test-Daten): null = alles aktiv wie bisher.
   */
  function weltName(daten, wunsch) {
    const w = daten.welten;
    if (!w) return null;
    if (wunsch && w[wunsch]) return wunsch;
    if (daten.weltStandard && w[daten.weltStandard]) return daten.weltStandard;
    return Object.keys(w)[0] || null;
  }

  /** Aktive Schichten { hindernisse: bool, … } einer Welt (alle Schichten belegt, fehlend = false). */
  function weltSchichten(daten, name) {
    const erg = {};
    const w = name && daten.welten ? daten.welten[name] : null;
    SCHICHTEN.forEach((k) => { erg[k] = w ? !!w[k] : true; });   // ohne Welten: alles wie bisher
    if (!w) erg.spuren = !!(daten.spuren && daten.spuren.length);
    return erg;
  }

  // ---------- 12.10. Hindernis-Menge: zusätzliche Hindernisse, deterministisch (ohne Math.random) ----------
  /** Gültige Menge ('normal' | 'viele' | 'sehrViele'); unbekannt → Standard ('normal'). */
  function mengeGueltig(m) {
    const C = R.config.hindernisMenge || {};
    return typeof m === 'string' && C.stufen && Object.prototype.hasOwnProperty.call(C.stufen, m) ? m : (C.standard || 'normal');
  }
  /** Hat die gewählte Welt (Name oder leer = Standard) mindestens eine Hindernis-Schicht (Hindernisse, Wracks, Strohballen)? */
  function weltHatHindernisse(daten, wunsch) {
    const s = weltSchichten(daten, weltName(daten, wunsch));
    return !!(s.hindernisse || s.wracks || s.strohballen);
  }
  /** FNV-1a (32 Bit) über einen Text → Seed. */
  function textSeed(text) {
    let h = 0x811c9dc5;
    for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
    return h >>> 0;
  }
  /** mulberry32: reiner Ganzzahl-Zufall (auf Server und in jedem Browser gleich). */
  function zufallsFolge(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /**
   * Zusätzliche Hindernisse für 'viele' / 'sehrViele': je Art (Öl, Sand, Baustelle, Ast, Wrack, Strohballen) faktor − 1 neue
   * Einträge je Katalogeintrag. Position = Zufall mit festem Seed (Strecke + Variante + Menge), gleichmäßig über die Runde verteilt
   * (ein Abschnitt je Hindernis), nie in den Sperrzonen (Start/Ziel, Tunnel, Brücke, Überführung, Kreuzung, Looping, Schanze samt
   * Anlauf/Landung, Spur-Abschnitte, Boost/Schild/Bälle/Fontänen/Dinos/Kleber), nie in/dicht an engen Kurven, mit Mindestabstand
   * zu allem anderen (config.hindernisMenge) – so bleibt immer eine freie Spur. Rein: ändert nichts am Katalog.
   * @returns {{ hindernisse: object[], wracks: object[], strohballen: object[], gewollt: number, weggelassen: number }}
   */
  function zusatzErzeugen(st, daten, sicht, basis, menge, an) {
    const C = R.config.hindernisMenge, stufe = C.stufen[menge], sp = st.spline, L = sp.laenge;
    const erg = { hindernisse: [], wracks: [], strohballen: [], gewollt: 0, weggelassen: 0, slalom: 0 };
    const faktor = stufe.faktor || 1;
    if (!(faktor > 1)) return erg;
    const rng = zufallsFolge(textSeed([daten.id, daten.variante || '', menge].join('|')));
    const rund = (x) => Math.round(x * 100) / 100;
    const diff = (a, b) => sp.differenzS(a, b);

    // --- Was soll dazukommen? Ziel-Gesamtzahl = max(Katalog × Faktor, Streckenlänge / meterPro) (config.hindernisMenge);
    // Wracks (≈ 12 Draw-Calls je Stück) werden gedeckelt (wrackMax), den Rest füllen die billigen, instanzierten Arten
    // (Öl, Sand, Baustelle, Ast; Strohballen nur in Welten mit Strohballen) – Mischung ≈ Katalog + Grundgewicht je Art.
    const wunsch = [];
    const artZahl = {};
    if (an('hindernisse')) (sicht.hindernisse || []).forEach((h) => { if (['oel', 'sand', 'baustelle', 'ast'].includes(h.typ)) artZahl[h.typ] = (artZahl[h.typ] || 0) + 1; });
    const nWr = an('wracks') ? (sicht.wracks || []).length : 0;
    const nSt = an('strohballen') ? (sicht.strohballen || []).length : 0;
    const basisSumme = Object.keys(artZahl).reduce((x, k) => x + artZahl[k], 0) + nWr + nSt;
    const ziel = Math.max(Math.round(basisSumme * faktor), Math.ceil(L / (stufe.meterPro || 1e9)), stufe.minGesamt || 0);
    let rest = Math.max(0, ziel - basisSumme);
    const wr = Math.min(C.wrackMax == null ? 2 : C.wrackMax, nWr * (faktor - 1), rest);
    for (let k = 0; k < wr; k++) wunsch.push('wrack');
    const st2 = Math.min(nSt * (faktor - 1), rest - wr);
    for (let k = 0; k < st2; k++) wunsch.push('stroh');
    rest -= wr + st2;
    if (an('hindernisse') && rest > 0) {
      const arten = ['oel', 'sand', 'ast', 'baustelle'], gew = arten.map((t) => t === 'baustelle' ? 0.25 + (artZahl[t] || 0) * 0.25 : (artZahl[t] || 0) + 1);   // Baustellen sind lang (≈ 50 m) → nur wenige
      const summe = gew.reduce((x, y) => x + y, 0);
      for (let k = 0; k < rest; k++) {
        let r = rng() * summe, i = 0;
        while (i < arten.length - 1 && r >= gew[i]) { r -= gew[i]; i++; }
        wunsch.push(arten[i]);
      }
    }
    erg.gewollt = wunsch.length;
    if (!wunsch.length) return erg;
    for (let i = wunsch.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); const t = wunsch[i]; wunsch[i] = wunsch[j]; wunsch[j] = t; }

    // --- Ausdehnung je Art entlang s: [vor, nach] um s (m) und Klasse für den Mindestabstand
    const CH = R.config.hindernisse || {};
    const ausdehnung = {
      oel: [((CH.oel && CH.oel.laenge) || 9) / 2, ((CH.oel && CH.oel.laenge) || 9) / 2, 'fleck'],
      sand: [((CH.sand && CH.sand.laenge) || 14) / 2, ((CH.sand && CH.sand.laenge) || 14) / 2, 'fleck'],
      baustelle: [((CH.baustelle && CH.baustelle.vorlauf) || 9) + 12, ((CH.baustelle && CH.baustelle.laenge) || 30) + 1, 'sperr'],   // + Schild davor
      ast: [2, 2, 'sperr'],
      wrack: [((CH.wrack && CH.wrack.dreieckAbstand) || 9) + 3, 4, 'sperr'],
      stroh: [2, 2, 'stroh'],
    };
    const gapVon = (a, b) => (a === 'sperr' && b === 'sperr' ? C.abstandSperr : (a === 'stroh' || b === 'stroh') ? C.abstandStroh : C.abstandFleck);

    // --- Belegt: Liste { c (Mitte), h (halbe Länge), klasse } – feste Sperrzonen mit klasse null (Lücke 0)
    const belegt = [];
    const zone = (s0, s1, vor, nach, klasse, extra) => {
      const len = sp.wrapS(s1 - s0);
      belegt.push(Object.assign({ c: s0 + (len + nach - vor) / 2, h: (len + vor + nach) / 2, klasse: klasse || null }, extra));
    };
    const punkt = (s, vor, nach, klasse) => belegt.push({ c: s + (nach - vor) / 2, h: (vor + nach) / 2, klasse: klasse || null });
    // 13.10. (v16): Rand-Abstände der Sperrzonen aus config.hindernisMenge.zonen (vorher fest 30/90/16/12 …): Hindernisse dürfen
    // dichter an Kreuzung, Looping-Ausfahrt, Bälle, Fontänen, Boost, Kleber heran – mehr Platz für die Menge, Anlauf (90 m) bleibt frei.
    const ZR = Object.assign({ tunnel: 30, bruecke: 30, ueberf: 30, kreuzung: 30, loopingVor: 90, loopingNach: 30, spuren: 45, schanzeVor: 70,
      schanzeNach: 80, boost: 12, schild: 12, ball: 16, wasser: 12, dino: 25, kleber: 15, lava: 55 }, C.zonen || {});
    punkt(0, 0, C.startFrei);                        // Start: Anfahren
    punkt(0, C.zielFrei, 0);                         // vor der Ziellinie: Startaufstellung steht dahinter
    (st.tunnel || []).forEach((t) => zone(t.s0, t.s1, ZR.tunnel, ZR.tunnel));
    (st.bruecken || []).forEach((b) => zone(b.s0, b.s1, ZR.bruecke, ZR.bruecke));
    (st.ueberfuehrungen || []).forEach((u) => { zone(u.s0, u.s1, ZR.ueberf, ZR.ueberf); if (u.unten) zone(u.unten.s0, u.unten.s1, ZR.ueberf, ZR.ueberf); });
    (st.kreuzungen || []).forEach((k) => { zone(k.a.s0, k.a.s1, ZR.kreuzung, ZR.kreuzung); zone(k.b.s0, k.b.s1, ZR.kreuzung, ZR.kreuzung); });
    (st.loopings || []).forEach((l) => zone(l.s0, l.s1, ZR.loopingVor, ZR.loopingNach));   // davor: Anlauf (volle Fahrt nötig)
    (st.gabelungen || []).forEach((g) => zone(g.s0, g.s1, GABEL_SPERRE, GABEL_SPERRE));   // 14.10. (v18): Gabelung (zwei Äste + Insel) frei
    (st.spuren || []).forEach((e) => { if (e.breite < st.breite) zone(e.s0, e.s1, ZR.spuren, ZR.spuren); });   // nur enge Abschnitte; breite (3 Spuren) bleiben frei
    (sicht.schanzen || []).forEach((e) => zone(e.s, e.s + (e.laenge || 10), (e.anlauf || 0) + ZR.schanzeVor, ZR.schanzeNach));
    (sicht.boostFelder || []).forEach((e) => zone(e.s, e.s + (e.laenge || 12), ZR.boost, ZR.boost));
    (sicht.schilde || []).forEach((e) => punkt(e.s, ZR.schild, ZR.schild));
    (sicht.baelle || []).forEach((e) => punkt(e.s, ZR.ball, ZR.ball));
    (sicht.wasserstrahlen || []).forEach((e) => punkt(e.s, ZR.wasser, ZR.wasser));
    (sicht.dinos || []).forEach((e) => punkt(e.s, ZR.dino, ZR.dino));
    // Kleber: Klebestreifen liegen am Rand (seite −1/1; 0 = beide). Flecken (Öl, Sand) dürfen dort auf die ANDERE Fahrbahnhälfte
    // (kleberSeite → erzwungene Seite), alles andere und beidseitige Streifen bleiben gesperrt.
    (sicht.kleber || []).forEach((e) => zone(e.s0, e.s1, ZR.kleber, ZR.kleber, null, { kleberSeite: e.seite === 1 ? 1 : e.seite === -1 ? -1 : 0 }));
    // bestehende Hindernisse (Katalog) mit ihren Klassen
    basis.forEach((h) => {
      const klasse = h.typ === 'oel' || h.typ === 'sand' ? 'fleck' : 'sperr';
      const pad = h.typ === 'lava' || h.typ === 'krater' ? ZR.lava : 0;   // Lava/Krater: Platz zum Ausweichen, keine Slalom-Falle daneben
      punkt(h.s, Math.abs(diff(h.s0, h.s)) + (h.typ === 'baustelle' ? 12 : 0) + pad, Math.abs(diff(h.s1, h.s)) + pad, klasse);   // Baustelle: + Schild davor
    });
    (sicht.wracks || []).forEach((e) => punkt(e.s, ausdehnung.wrack[0], ausdehnung.wrack[1], 'sperr'));
    (sicht.strohballen || []).forEach((e) => punkt(e.s, 2, 2, 'stroh'));

    // --- Kurven: größte Krümmung entlang [a, b] und enge Kurve (Haarnadel) davor
    const kMax = (a, b) => {
      let k = 0;
      for (let s = a; s <= b + 1e-6; s += 4) k = Math.max(k, Math.abs(sp.punktBei(s).kruemmung || 0));
      return k;
    };
    const kHaar = 1 / C.haarnadelRadius;

    // passt() liefert false oder { seite }: seite ≠ 0 = Öl/Sand muss auf diese Fahrbahnhälfte (neben einem Klebestreifen am anderen Rand)
    const passt = (art, s) => {
      const [vor, nach, klasse] = ausdehnung[art];
      let seite = 0;
      for (const b of belegt) {
        const gap = b.klasse ? gapVon(klasse, b.klasse) : 0;
        if (b.kleberSeite !== undefined) {
          // Klebestreifen: nur die Zone selbst zählt (kein Mindestabstand), Flecken weichen auf die freie Hälfte aus
          if (Math.abs(diff(s + (nach - vor) / 2, b.c)) < (vor + nach) / 2 + b.h) {
            if (b.kleberSeite === 0 || (art !== 'oel' && art !== 'sand') || (seite !== 0 && seite !== -b.kleberSeite)) return false;
            seite = -b.kleberSeite;
          }
          continue;
        }
        if (Math.abs(diff(s + (nach - vor) / 2, b.c)) < (vor + nach) / 2 + b.h + gap) return false;
      }
      if (kMax(s - vor, s + nach) > (C.kurveMax[art] || 1 / 60)) return false;
      if (kMax(s + nach, s + nach + C.haarnadelVor) > kHaar) return false;
      return { seite };
    };

    // --- Platzieren: ein Abschnitt je Hindernis (gleichmäßig über die Runde), notfalls irgendwo
    const von = C.startFrei, bis = L - C.zielFrei, laenge = bis - von, n = wunsch.length;
    const wo = [];
    wunsch.forEach((art, i) => {
      const a = von + laenge * i / n, b = von + laenge * (i + 1) / n;
      let s = null, zwang = 0;
      for (let v = 0; v < C.maxVersuche + (C.maxVersucheGlobal || C.maxVersuche) && s === null; v++) {
        const kand = Math.round((v < C.maxVersuche ? a + rng() * (b - a) : von + rng() * laenge) * 2) / 2;   // auf 0,5 m
        const p = passt(art, kand);
        if (p) { s = kand; zwang = p.seite; }
      }
      if (s === null) { erg.weggelassen++; return; }
      const [vor, nach, klasse] = ausdehnung[art];
      punkt(s, vor, nach, klasse);
      const vz = rng() < 0.5 ? -1 : 1, q = zwang ? rund(zwang * (0.15 + rng() * 0.5)) : rund((rng() * 2 - 1) * 0.65);
      wo.push({ art, s, vz, q });
      // Slalom: ab und zu ein zweiter Ast/Ölfleck kurz dahinter auf der anderen Seite (zählt zusätzlich)
      if ((art === 'ast' || art === 'oel') && rng() < (C.slalomChance == null ? 0.3 : C.slalomChance)) {
        const s2 = Math.round((s + (C.slalomAbstand || 22)) * 2) / 2;
        const p2 = s2 < bis ? passt(art, s2) : false;
        if (p2) {
          punkt(s2, vor, nach, klasse); erg.slalom++;
          wo.push({ art, s: s2, vz: -vz, q: rund(p2.seite ? p2.seite * (0.15 + rng() * 0.5) : q > 0 ? -0.3 - rng() * 0.35 : 0.3 + rng() * 0.35) });
        }
      }
    });
    wo.sort((x, y) => x.s - y.s);

    // --- Einträge bauen (Seiten per Zufall; Wracks reihum aus den Autos der Strecke)
    const autos = (sicht.wracks || []).map(e => e.autoId);
    const haelfte = st.breite / 2;
    let nWrack = 0, nStroh = 0;
    wo.forEach(({ art, s, vz, q: quer }) => {
      if (art === 'oel' || art === 'sand') {
        erg.hindernisse.push({ typ: art, s: rund(s), seite: quer });
      } else if (art === 'baustelle' || art === 'ast') {
        erg.hindernisse.push({ typ: art, s: rund(s), seite: vz });
      } else if (art === 'wrack') {
        const qw = Math.min(4, haelfte - 2.2);
        erg.wracks.push({ s: rund(s), seitenabstand: rund(vz * qw), brennt: false, autoId: autos.length ? autos[nWrack % autos.length] : 'multivan' });
        nWrack++;
      } else {
        const vorlage = (sicht.strohballen || [])[nStroh % Math.max(1, (sicht.strohballen || []).length)] || {};
        erg.strohballen.push({ s: rund(s), von: vz, intervall: vorlage.intervall || 10, tempo: vorlage.tempo || 4 });
        nStroh++;
      }
    });
    return erg;
  }

  /**
   * Runde 6 (W2-E): Streckenvariante (z. B. 'xl') als skalierte Kopie der Katalogdaten.
   * Kontrollpunkte (x, z) und Hügel (x, z, r) wachsen um den Schwerpunkt mit `faktor`, y/Hügelhöhe bleiben (flachere Steigung).
   * ALLE s-Felder (s, s0, s1) aller Listen mitskaliert (Hindernisse, Tunnel, Brücken, Loopings, Bälle, Wasser, Kleber, Schanzen,
   * Boost, Schilde, Wracks, Strohballen, Spuren, Dinos, Tiere …). Absolut bleiben: Looping-Radius, Schanzenlänge, Anlauf,
   * checkpointAbstand (→ mehr Checkpoints). zielRundenzeit × zeitFaktor (Standard faktor). Unbekannte Variante → unveränderte Daten.
   * @returns {object} neue Daten (mit .variante = id), die Originale bleiben unberührt
   */
  function varianteAnwenden(daten, varianteId) {
    const v = varianteId && daten && daten.varianten && daten.varianten[varianteId];
    if (!v || !(v.faktor > 0)) return daten;
    const f = v.faktor, pk = daten.punkte;
    let cx = 0, cz = 0;
    pk.forEach((p) => { cx += p[0]; cz += p[2]; });
    cx /= pk.length; cz /= pk.length;
    const rund = (x) => Math.round(x * 100) / 100;
    const kopie = Object.assign({}, daten);
    // 14.10. (v22): optional `hoeheFaktor` (nur Höhenmodell 'strasse', z. B. Alpen XL): y der Kontrollpunkte wächst um den Startpunkt mit
    // diesem Faktor, damit eine lange Variante nicht flach wird. Ohne hoeheFaktor bleibt y unverändert (alle bisherigen Varianten bitgleich).
    const hf = (v.hoeheFaktor > 0 && daten.hoehenModell === 'strasse') ? v.hoeheFaktor : 1, h0 = pk[0][1];
    kopie.punkte = pk.map(p => [rund(cx + (p[0] - cx) * f), hf === 1 ? p[1] : rund(h0 + (p[1] - h0) * hf), rund(cz + (p[2] - cz) * f)]);
    kopie.huegel = (daten.huegel || []).map(h => Object.assign({}, h, { x: rund(cx + (h.x - cx) * f), z: rund(cz + (h.z - cz) * f), r: rund(h.r * f) }));
    Object.keys(daten).forEach((k) => {
      // W2-C1: auch einzelne Objekte mit s/s0/s1 (z. B. dino berg { s0, s1 }, flugsaurier { s0, s1, intervall }) mitskalieren
      const o = daten[k];
      if (k !== 'varianten' && o && typeof o === 'object' && !Array.isArray(o) && ['s', 's0', 's1'].some(sk => typeof o[sk] === 'number')) {
        const n = Object.assign({}, o);
        ['s', 's0', 's1'].forEach((sk) => { if (typeof n[sk] === 'number') n[sk] = rund(n[sk] * f); });
        kopie[k] = n;
        return;
      }
      if (k === 'punkte' || k === 'huegel' || k === 'varianten' || !Array.isArray(daten[k])) return;
      kopie[k] = daten[k].map((e) => {
        if (!e || typeof e !== 'object' || Array.isArray(e)) return e;
        const n = Object.assign({}, e);
        ['s', 's0', 's1'].forEach((sk) => { if (typeof n[sk] === 'number') n[sk] = rund(n[sk] * f); });
        return n;
      });
    });
    // Rundenzeit wächst langsamer als die Länge (Kurventempo ∝ √Radius, längere Geraden): zeitFaktor aus der KI-Messung, Standard = faktor
    if (daten.zielRundenzeit) kopie.zielRundenzeit = Math.round(daten.zielRundenzeit * (v.zeitFaktor || f));
    kopie.variante = varianteId;
    kopie.varianteFaktor = f;
    return kopie;
  }

  class Strecke {
    /**
     * @param {object} daten Eintrag aus Rennspiel.trackCatalog
     * @param {{welt?:string, variante?:string}} [optionen] welt = Name aus daten.welten (Standard: daten.weltStandard);
     *   variante = Name aus daten.varianten (z. B. 'xl'; leer = Normal) → skalierte Daten, strecke.katalog ist dann die skalierte Kopie
     */
    constructor(daten, optionen) {
      const opt = optionen || {};
      daten = varianteAnwenden(daten, opt.variante);
      this.variante = daten.variante || '';
      this.katalog = daten;
      this.welt = weltName(daten, opt.welt);
      this.weltDaten = weltSchichten(daten, this.welt);
      this.aktiveSchichten = Object.assign({}, this.weltDaten);
      const an = (k) => !!this.aktiveSchichten[k];
      // Datensicht nur mit aktiven Schichten (dynamik.js, themes.js und main.js lesen strecke.daten)
      const sicht = Object.assign({}, daten);
      SCHICHTEN.forEach((k) => { const f = SCHICHT_FELD[k]; if (f in daten || !an(k)) sicht[f] = an(k) ? (daten[f] || []) : []; });
      this.daten = sicht;
      this.id = daten.id;
      this.name = daten.name;
      this.thema = daten.thema;
      this.breite = daten.breite;
      this.randBreite = daten.randBreite;
      this.huegel = daten.huegel || [];
      this.abseitsUntergrund = daten.abseitsUntergrund || 'gras';   // 'gras' | 'sand'
      this.spline = new R.Spline(daten.punkte, { abstand: 2 });
      this.laenge = this.spline.laenge;
      // 14.10. (v18): Gabelungen [{ s0, s1, … }] (Katalog; gelten in allen Welten – sind Teil der Strecke, nicht einer Schicht)
      this.gabelungen = (daten.gabelungen || []).map((e, i) => this._gabelBerechnen(e, i)).filter(Boolean);
      // Spuren (nur wenn die Welt sie einschaltet): [{ s0, s1, spuren, breite }]
      this.spuren = (sicht.spuren || []).map(e => ({ s0: this.spline.wrapS(e.s0), s1: this.spline.wrapS(e.s1), spuren: e.spuren,
        breite: SPUR_BREITE[e.spuren] || this.breite }));
      this._spurEng = this.spuren.filter(e => e.breite < this.breite);
      // Höhe der Mittellinie exakt aus dem Gelände (die y-Werte im Katalog sind gerundet)
      // W4-I: Höhenmodell 'strasse' (Alpen): y bleibt aus dem Katalog (eigenes Höhenprofil, Überführung möglich)
      this.hoehenModell = daten.hoehenModell === 'strasse' ? 'strasse' : 'gelaende';
      this.sModell = this.hoehenModell === 'strasse';
      if (this.huegel.length && !this.sModell) this.spline.punkte.forEach((p) => { p.y = this.gelaendeHoehe(p.x, p.z); });
      this.see = daten.see || null;      // W4-I: { x, z, r, tiefe } Mulde für den Bergsee (nur Höhenmodell 'strasse')
      // Unsichtbare weiche Bande (physics/collisions.js) + sichtbarer Holzzaun genau dort
      this.zaunAbstand = daten.zaunAbstand || 18;   // m ab Straßenrand
      this.seitenabstandMax = this.breite / 2 + this.zaunAbstand;
      this.grenzeEng = this.breite / 2 + this.randBreite + ENG_ZUGABE;   // Geländer / Tunnelwand
      // Brücken und Tunnel (Bogenlänge s0..s1). Alt: bruecke { von, bis } → eine Holzbrücke.
      const br = daten.bruecken || (daten.bruecke ? [{ s0: daten.bruecke.von, s1: daten.bruecke.bis, art: 'holz' }] : []);
      this.bruecken = br.map(b => this._bereich(b, { holz: 'holz', stein: 'stein', stahl: 'stahl', stamm: 'stamm' }[b.art] || 'holz'));
      this.bruecken.forEach((b) => {
        b.tiefe = b.tiefe || 5;
        // Senke quer nur so weit, dass kein anderes Streckenstück abgesenkt wird
        let frei = Infinity;
        for (const p of this.spline.punkte) {
          if (Math.abs(this.spline.differenzS(p.s, b.mitte)) < b.halb + 60) continue;
          const dx = p.x - b.m.x, dz = p.z - b.m.z;
          if (Math.abs(dx * b.m.tx + dz * b.m.tz) > b.halb + GROB_RAND + 30) continue;   // weit vor/hinter der Brücke egal
          frei = Math.min(frei, Math.abs(dx * b.m.nx + dz * b.m.nz));
        }
        b.q1 = Math.max(24, Math.min(SENKE_Q1, frei - this.breite / 2 - this.randBreite - GROB_RAND - 12));
        b.q0 = Math.min(SENKE_Q0, b.q1 - 18);
      });
      this.bruecke = this.bruecken[0] || null;          // Kurzform (erste Brücke) für Deko/ältere Aufrufer
      this.tunnel = (daten.tunnel || []).map(t => this._bereich(t, t.art === 'sandstein' || t.art === 'hoehle' ? t.art : 'fels'));
      // W4-I: Überführungen (obere Fahrbahn = Brücke über die eigene Strecke): [{ s0, s1, art }] → Kreuzung (sOben, sUnten, dy)
      this.ueberfuehrungen = (daten.ueberfuehrungen || []).map(u => this._ueberfuehrungBerechnen(u));
      // W4-J: niveaugleiche Kreuzungen [{ s0, s1 }] → { sA, sB, winkel, dy, a, b, … }
      this.kreuzungen = (daten.kreuzungen || []).map(k => this._kreuzungBerechnen(k)).filter(Boolean);
      this._flachQ = this.breite / 2 + this.randBreite + FLACH_ZUGABE;
      this._engstellen = this.bruecken.concat(this.tunnel, this.ueberfuehrungen);
      this.hindernisse = this._hindernisseBerechnen(sicht.hindernisse || []);
      // 12.10. Hindernis-Menge ('viele' / 'sehrViele'): zusätzliche Einträge deterministisch erzeugen (Seed je Strecke + Menge).
      // 'normal' (Standard) und Welten ohne Hindernis-Schichten: nichts davon läuft – alles bitgleich wie bisher.
      this.hindernisMenge = mengeGueltig(opt.hindernisMenge);
      this.hindernisZusatz = { hindernisse: 0, wracks: 0, strohballen: 0, gewollt: 0, weggelassen: 0, slalom: 0 };
      if (this.hindernisMenge !== 'normal' && (an('hindernisse') || an('wracks') || an('strohballen'))) {
        this.loopings = this._loopingsBerechnen(sicht.loopings || []);   // für die Sperrzonen (unten genauso noch einmal)
        const z = zusatzErzeugen(this, daten, sicht, this.hindernisse, this.hindernisMenge, an);
        this.hindernisZusatz = { hindernisse: z.hindernisse.length, wracks: z.wracks.length, strohballen: z.strohballen.length,
          gewollt: z.gewollt, weggelassen: z.weggelassen, slalom: z.slalom };
        // sicht.* sind neue Listen (der Katalog bleibt unverändert)
        if (z.hindernisse.length) { sicht.hindernisse = (sicht.hindernisse || []).concat(z.hindernisse); this.hindernisse = this._hindernisseBerechnen(sicht.hindernisse); }
        if (z.wracks.length) sicht.wracks = (sicht.wracks || []).concat(z.wracks);
        if (z.strohballen.length) sicht.strohballen = (sicht.strohballen || []).concat(z.strohballen);
      }
      this._flecken = this.hindernisse.filter(h => h.untergrund);
      // Loopings (Fantasie): Datenstruktur hier, Fahrlogik + Grafik in track/looping.js
      this.loopings = this._loopingsBerechnen(sicht.loopings || []);
      // Runde 4: Listen für noch nicht gebaute Schichten (Agent C/D): Kopien mit s in [0, laenge)
      const kopie = (liste) => (liste || []).map(e => Object.assign({}, e, { s: this.spline.wrapS(e.s) }));
      this.wracks = kopie(sicht.wracks);            // [{ s, seitenabstand, brennt, autoId }]
      this.strohballen = kopie(sicht.strohballen);  // [{ s, von, intervall, tempo }]
      this.schanzen = kopie(sicht.schanzen);        // [{ s, winkel: 8 | 12, laenge }]
      this.boostFelder = kopie(sicht.boostFelder);  // [{ s, seitenabstand, laenge }]
      this.schilde = kopie(sicht.schilde);          // [{ s, seitenabstand }]
      this.dinos = kopie(sicht.dinos);              // Runde 5b: [{ s, von, intervall, tempo, art }] (world/dynamik.js)
      // Runde 5: Klebe-Seitenstreifen (Fantasie): [{ s0, s1, seite: -1 | 1 | 0 (beide) }] → Untergrund 'kleber' auf dem Rand
      this.kleber = (sicht.kleber || []).map(e => ({ s0: this.spline.wrapS(e.s0), s1: this.spline.wrapS(e.s1), seite: e.seite || 0 }));
      // Z1 (Zufall, src/track/zufall.js): Lage der Hindernisse/Wracks/Strohballen/Dinos aus dem Rennseed – NUR mit optionen.zufall = { seed }.
      // Ohne diese Option (Tests, „Zufällige Strecke: aus“, alte Clients) bleibt alles bitgleich wie im Katalog.
      // S1 (Spaß-Paket, src/spass/spassKern.js): feste Trampoline/Kanonen – NUR mit optionen.spass === true (sonst strecke.spass = null, alles bitgleich wie vorher);
      // VOR Z1, damit „Zufällige Strecke“ um sie herumlegt (festeZonen)
      this.spass = opt.spass === true && R.Spass ? R.Spass.plan(this, sicht, !!opt.zufall, opt) : null;   // S6: opt (zauber) wird durchgereicht
      this.zufall = null;
      this.zufallVersion = 0;
      if (opt.zufall && R.Zufall) R.Zufall.start(this, opt.zufall, sicht);
      this.checkpoints = this._checkpointsBerechnen(daten.checkpointAbstand || 120);
      this.idealLinie = this._idealLinieBerechnen();
      // Runde 5: feste Säulen für die Bande (collisions.js): Startbogen-Masten + Looping-Beine
      const pS = this.spline.punktBei(0), weite = this.breite / 2 + this.randBreite + 1.2;
      this.saeulen = [-1, 1].map(sg => ({ x: pS.x + pS.nx * weite * sg, z: pS.z + pS.nz * weite * sg, r: 0.35, art: 'startbogen' }));
      if (this.loopings.length && R.Looping && R.Looping.beine) this.saeulen = this.saeulen.concat(R.Looping.beine(this));
      // W4-J: Warnlicht-Masten an der Kreuzung sind feste Säulen (Bande)
      this.kreuzungen.forEach(k => k.masten.forEach(m => this.saeulen.push({ x: m.x, z: m.z, r: 0.22, art: 'warnlicht' })));
    }

    /** Runde 5: Klebestreifen an Bogenlänge s auf der Seite sg (−1 links, 1 rechts) oder null. */
    kleberBei(s, sg) {
      for (const k of this.kleber) if ((k.seite === 0 || k.seite === sg) && this._inBereich(k, s)) return k;
      return null;
    }

    // ---------------------------------------------------------- Abfragen

    /** Geländehöhe aus den Hügeln (gilt auf und neben der Strecke). */
    gelaendeHoehe(x, z) {
      let h = 0;
      for (const g of this.huegel) {
        const dx = x - g.x, dz = z - g.z;
        h += g.h * Math.exp(-(dx * dx + dz * dz) / (2 * g.r * g.r));
      }
      return h;
    }

    /**
     * Höhe der Straße (und des Bodens außerhalb von Senken) an (x, z). Autos fahren auf dieser Höhe.
     * W4-I (Höhenmodell 'strasse'): ohne startIndex = Boden (an einer Überführung das UNTERE Niveau);
     * mit startIndex (≥ 0, letzter Streckenindex des Fahrzeugs) = Fahrbahn des Abschnitts, der zum Index passt
     * (Index-Kontinuität) → hoeheBeiS(s, seitenabstand). Höhenmodell 'gelaende' (alle anderen Strecken): unverändert.
     */
    hoeheAn(x, z, startIndex) {
      if (this.sModell) {
        if (startIndex !== undefined && startIndex !== null && startIndex >= 0) {
          const n = this._naechsterKont(x, z, startIndex);
          return this.hoeheBeiS(n.s, n.seitenabstand);
        }
        return this._bodenS(x, z);
      }
      if (this.huegel.length) return this.gelaendeHoehe(x, z);
      return this.spline.hoeheBei(x, z, startIndex);
    }

    /**
     * W4-I: Fahrbahnhöhe aus dem eigenen s (Spline-y, Querneigung 0) – für alles, was seinen Streckenindex/s kennt
     * (Fahrzeuge, Münzen, Pickups …). Neben der Fahrbahn (|q| > flachQ, nicht auf einer Überführung) = Boden.
     * Höhenmodell 'gelaende': hoeheAn am Punkt (s, q) – exakt wie bisher.
     */
    hoeheBeiS(s, seitenabstand) {
      const p = this.spline.punktBei(s), q = seitenabstand || 0;
      if (!this.sModell) return this.hoeheAn(p.x + p.nx * q, p.z + p.nz * q);
      if (Math.abs(q) <= this._flachQ) return p.y;
      const boden = this._bodenS(p.x + p.nx * q, p.z + p.nz * q);
      // Überführung: auf der Brücke flach bis zum Geländer, danach weich (TRICHTER m) in den Boden – stetig
      for (const u of this.ueberfuehrungen) {
        const aussen = this._aussen(u, s);
        if (aussen < TRICHTER) return p.y + (boden - p.y) * glatt(0, TRICHTER, aussen);
      }
      return boden;
    }

    /**
     * 14.10. (v20, Bug „Auto im Grünen"): Gewicht 0…1, mit dem das Auto abseits der Fahrbahn auf das Gelände ausgerichtet wird.
     * 0 auf der Fahrbahn (dort bleibt alles wie bisher: flache Straße, Nicken nach der Steigung), 1 ab 1,5 m hinter dem Randstreifen,
     * dazwischen weich (smoothstep) → kein Sprung beim Rand → Gras. nah = Abfrage des Autos { s, seitenabstand } (f.nah).
     */
    abseitsGewicht(nah) {
      if (!nah) return 0;
      const rand = (this.breiteBei ? this.breiteBei(nah.s) : this.breite) / 2 + this.randBreite;
      return glatt(rand - 0.6, rand + 1.5, Math.abs(nah.seitenabstand));
    }

    /**
     * 14.10. (v20, Bug „Auto im Grünen"): Auto-Pose auf dem Gelände abseits der Fahrbahn. Bisher stand das Auto mit der Mitte auf
     * hoeheAn(x, z), ohne Querneigung: an einem Hang tauchte die Hangseite der Karosserie in den Boden (bis 0,7 m, Alpen).
     * Die Höhe wird an den vier Ecken der Karosserie (hl/hb = halbe Länge/Breite, Fahrtrichtung rx/rz) mit DERSELBEN Funktion
     * gelesen, die auch Physik/Server/Vorhersage benutzen (hoeheAn mit Streckenindex), und daraus Nicken, Querneigung und ein
     * Zuschlag bestimmt, damit keine Ecke unter dem Gelände liegt. Nur Anzeige: Physik und Netz-Abgleich bleiben bei v.y = hoeheAn.
     * @param {object} aus optionales Ausgabeobjekt { dy, nicken, neigung }
     * @returns {{dy:number, nicken:number, neigung:number}} dy = Anhebung der Anzeige-Höhe gegenüber hoeheAn(x, z) (m, kann < 0 sein),
     *          nicken (> 0 = Bug hoch) und neigung (> 0 = rechte Seite hoch) in rad, jeweils für Gewicht 1
     */
    gelaendePose(x, z, rx, rz, hl, hb, startIndex, aus) {
      const o = aus || {}, qx = -rz, qz = rx;
      const h = (a, b) => this.hoeheAn(x + rx * hl * a + qx * hb * b, z + rz * hl * a + qz * hb * b, startIndex);
      const vl = h(1, -1), vr = h(1, 1), hlk = h(-1, -1), hr = h(-1, 1);
      const mitte = (vl + vr + hlk + hr) / 4;
      const nick = Math.atan2((vl + vr) / 2 - (hlk + hr) / 2, 2 * hl), neig = Math.atan2((vr + hr) / 2 - (vl + hlk) / 2, 2 * hb);
      const tn = Math.tan(nick), tq = Math.tan(neig);
      // Ebene durch die Mitte; jede Ecke (und die Mitte), die unter dem Gelände läge, hebt das Auto an (verdrehtes Gelände, Wölbung)
      const h0 = this.hoeheAn(x, z, startIndex);
      let zu = Math.max(0, h0 - mitte);                    // Kuppe quer/längs unter dem Auto: die Mitte darf nicht einsinken
      for (const [a, b, g] of [[1, -1, vl], [1, 1, vr], [-1, -1, hlk], [-1, 1, hr]]) zu = Math.max(zu, g - (mitte + tn * hl * a + tq * hb * b));
      // v22: Alpen (Höhenmodell 'strasse', steile Hänge bis ~40 %): +6 cm statt +3 cm (Nick-/Rollwinkel nur linear genähert)
      o.dy = mitte + zu + (this.sModell ? 0.06 : 0.03) - h0;      // +3 cm: Netz-Sehne über den Dreiecken des Bodens (Böschung ≤ BOESCHUNG_TOL)
      o.nicken = nick; o.neigung = neig;
      return o;
    }

    /**
     * 16.10. (v28 W4b, „Rad verschmolzen"): Wie hoch liegt die SICHTBARE Oberfläche an (s, q) über hoeheAn? Die Meshes werden mit
     * festen Anhebungen gebaut (Asphalt +0,06 _strasseBauen, Randstein +0,07 _randBauen, Gabel-Insel-Rasen +0,03, Kreuzungsplatte
     * +0,075, Holz-/Stamm-Brücke +0,16, Werkstatt-Fläche +0,07 / Keil +0,06 in garage.js) – das Auto stand mit der Radunterkante auf
     * hoeheAn, also 6–16 cm IM Belag. Nur für die Anzeige-Pose (radBodenPose); Physik/Server unverändert.
     * q = roher Seitenabstand zur Mittellinie (in Gabelungen nicht auf den Ast bezogen); werkstatt optional (R.Werkstatt/-Gruppe mit belag()),
     * startIndex = Streckenindex des Autos (wie hoeheAn).
     * null = Gelände (Gras/Sand: Boden-Gitter bzw. Böschung, siehe radBodenPose).
     */
    belagHoehe(s, q, x, z, werkstatt, startIndex) {
      if (this.kreuzungen.length) {
        const kb = this.kreuzungBei(s, 25);
        if (kb) {
          const k = kb.k, r = Math.hypot(x - k.x, z - k.z);
          if (r >= 2.6 && r <= 3.6) return 0.1;                                                        // Zauberkreis (_kreuzungBauen)
          if (Math.abs(q) <= this.breite / 2 - 0.3) for (const sK of [k.sA, k.sB]) { const d = this.spline.differenzS(s, sK - k.halbL - 1.6); if (d >= 0 && d <= 0.6) return 0.1; }   // Haltelinien
          if (this._querAbstand(s, x, z) <= this.breite / 2 + this.randBreite) return 0.075;           // Kreuzungsplatte
        }
      }
      if (this.bruecken.length) {
        const br = this.brueckeBei(s);
        if (br && (br.art === 'holz' || br.art === 'stamm') && Math.abs(q) <= this.grenzeEng + (br.art === 'stamm' ? 0.25 : 0)) return 0.16;
      }
      let rel = q, w = null;
      if (this.gabelungen.length && (w = this.gabelBei(s))) rel = q - (q >= 0 ? 1 : -1) * w.c;
      const b2 = this.breiteBei(s) / 2, a = Math.abs(rel);
      if (a <= b2) return w ? 0.06 : this._fahrbahnZeichen(s, q);
      if (w && Math.abs(q) < w.c - w.h) return Math.abs(q) >= w.c - w.h - Math.min(this.randBreite, w.c - w.h) ? 0.07 : 0.03;   // Insel: Randstein, sonst Rasen
      if (a <= b2 + this.randBreite) return 0.07;
      if (werkstatt && werkstatt.belag) {
        const wb = werkstatt.belag(s, q, x, z);
        if (wb === null || wb === undefined) return null;
        // garage.js baut die Fläche auf hoeheAn(x, z) OHNE Streckenindex – im Höhenmodell 'strasse' (Alpen, Mega) kann das vom Boden mit Index abweichen
        return this.sModell && startIndex !== undefined && startIndex >= 0 ? wb + this.hoeheAn(x, z) - this.hoeheAn(x, z, startIndex) : wb;
      }
      return null;
    }

    /**
     * v28 W4b: Höhe des SICHTBAREN Boden-Gitters (_bodenBauen, PlaneGeometry ~10 m Felder) an (x, z) – liest die Eckhöhen aus dem Mesh
     * (gleiche Dreiecksteilung wie three.js), statt der wahren Geländehöhe: die Sehnen liegen auf Kuppen/Mulden bis ~6 cm daneben.
     * null = kein Boden-Gitter gebaut (Node/Server) oder außerhalb.
     */
    bodenNetzHoehe(x, z) {
      const b = this._bodenNetz;
      if (!b) return null;
      const u = (x - b.mx) / b.zx, v = (z - b.mz) / b.zz, ix = Math.floor(u), iy = Math.floor(v);
      if (ix < 0 || iy < 0 || ix >= b.nx || iy >= b.nz) return null;
      const fu = u - ix, fv = v - iy, n1 = b.nx + 1, y = b.y;
      const ha = y[(ix + n1 * iy) * 3 + 1], hb = y[(ix + n1 * (iy + 1)) * 3 + 1], hc = y[(ix + 1 + n1 * (iy + 1)) * 3 + 1], hd = y[(ix + 1 + n1 * iy) * 3 + 1];
      return fu + fv <= 1 ? ha + (hd - ha) * fu + (hb - ha) * fv : hc + (hb - hc) * (1 - fu) + (hd - hc) * (1 - fv);   // Dreiecke (a, b, d) und (b, c, d)
    }

    /**
     * v28 W4b: Höhe des SICHTBAREN Asphalt-Bandes (_strasseBauen: je Splinepunkt nur linker und rechter Rand) an (s, q) – auf breiten
     * Fahrbahnen über Kuppen liegt die Sehne bis ~2 cm neben hoeheAn + 0,06. null = kein Band / Gabel-Abschnitt.
     */
    strassenNetzHoehe(s, q) {
      const P = this._strassenNetz;
      if (!P) return null;
      const pk = this.spline.punkte, N = pk.length, ds = this.spline.ds;
      const i = Math.floor(s / ds) % N, j = (i + 1) % N, t = Math.max(0, Math.min(1, (s - pk[i].s) / ds));
      if (this.gabelungen.length && (this._gabelIdx(i) || this._gabelIdx(j))) return null;
      const quer = (k) => {
        const lx = P[k * 6], ly = P[k * 6 + 1], lz = P[k * 6 + 2], rx = P[k * 6 + 3], ry = P[k * 6 + 4], rz = P[k * 6 + 5];
        const b = Math.hypot(rx - lx, rz - lz) / 2 || 1;
        return ly + (ry - ly) * Math.max(0, Math.min(1, (q + b) / (2 * b)));
      };
      return quer(i) + (quer(j) - quer(i)) * t;
    }

    /** v28 W4b: liegt (x, z) im Rechteck eines feinen Senke-Gitters (_senkeBauen: Brückenmitte ± halb + 24 m längs, q1 + 24 m quer)? */
    _imSenkeNetz(x, z) {
      for (const b of this.bruecken) {
        const dx = x - b.m.x, dz = z - b.m.z;
        if (Math.abs(dx * b.m.tx + dz * b.m.tz) <= b.halb + 24 && Math.abs(dx * b.m.nx + dz * b.m.nz) <= b.q1 + 24) return true;
      }
      return false;
    }

    /** v28 W4b: Fahrbahn +0,06; darauf Start/Ziel-Schachbrett und Startplatz-Balken +0,1 (_startZielBauen), Mittellinie +0,08 (_mittellinieBauen). */
    _fahrbahnZeichen(s, q) {
      const sp = this.spline, L = sp.laenge, b = this.breite / 2;
      const sz = sp.differenzS(s, 0);
      if (sz > -60 && sz < 2) {
        if (sz >= -1.5 && sz <= 1.5 && Math.abs(q) <= b) return 0.1;
        const z = this._startBalken || (this._startBalken = this.startpositionen((R.config.rennen.gegnerMax || 5) + 1).map((st) => {
          const n = sp.naechster(st.x, st.z); return { s: sp.differenzS(n.s, 0) + 2.6, q: n.seitenabstand };
        }));
        for (let i = 0; i < z.length; i++) if (sz >= z[i].s && sz <= z[i].s + 0.4 && Math.abs(q - z[i].q) <= 1.3) return 0.1;
      }
      const t = ((s - 8) % 7 + 7) % 7;
      if (s >= 8 && s < L - 9 && t <= 3 && !(this.gabelungen.length && this.gabelNah(s, 2))) {
        const spur = this.spurBei ? this.spurBei(s) : null;
        if (!(spur && spur.spuren === 1)) {
          const m = spur && spur.spuren === 3 ? this.breiteBei(s) / 6 : 0;
          if (Math.abs(Math.abs(q) - m) <= 0.14) return 0.08;
        }
      }
      return 0.06;
    }

    /** v28 W4b: Räder eines Auto-Meshes (carBuilder: userData.raeder, Rad im Halter) → [{ x, y, z, r, w }] lokal (Radmitte, Radius, Breite). */
    radAufstand(mesh) {
      const raeder = mesh && mesh.userData && mesh.userData.raeder;
      if (!raeder || !raeder.length) return [];
      // v28b (W4c): Abschleppwagen (verkehr.js) führt Stellvertreter-Räder ohne geometry → überspringen (→ < 3 Räder → radBodenPose ok=false)
      return raeder.filter((rad) => rad && rad.geometry).map((rad) => {
        const g = rad.geometry; if (!g.boundingBox) g.computeBoundingBox();
        const h = rad.parent || rad;
        return { x: h.position.x, y: h.position.y, z: h.position.z, r: (g.boundingBox.max.y - g.boundingBox.min.y) / 2, w: g.boundingBox.max.x - g.boundingBox.min.x };
      });
    }

    /**
     * v28 W4b: Anzeige-Pose auf der SICHTBAREN Oberfläche. An den 4 Radaufstandspunkten (tiefster Punkt jedes Rades in der Pose) wird
     * hoeheAn (mit Streckenindex, dieselbe schnelle Abfrage wie Physik/Server) + belagHoehe gelesen → Nicken/Querneigung aus Vorder-/
     * Hinterachse bzw. linker/rechter Seite (auch auf der Fahrbahn: am Hang ist die sichtbare Straße quer geneigt) und Anhebung dy, mit der
     * das tiefste Rad aufsetzt (keins steckt im Belag). Zwei Durchgänge (1.: Aufstandspunkte nur nach Heading, 2.: mit Nicken/Neigung),
     * also 8 Höhenabfragen je Auto. y = bisherige Anzeige-Höhe; dynN/dynQ = Nicken/Wanken der Fahrdynamik (+ Flug-Nicken), werden addiert (YXZ).
     * Ergebnis { ok, dy, nicken, neigung } (nicken/neigung ohne dynN/dynQ). ok = false (nichts ändern), wenn das Auto > 0,6 m über dem
     * Boden ist. nah = Streckenabfrage des Autos (f.nah; fehlt sie, wird sie hier geholt). dy begrenzt −0,4…+0,25 m (−: nimmt die
     * Sicherheits-Anhebung von gelaendePose zurück, die an den Karosserie-Ecken statt an den Rädern misst). Nur Anzeige – Physik,
     * Server, Vorhersage unverändert.
     */
    radBodenPose(x, z, heading, y, dynN, dynQ, aufstand, startIndex, nah, werkstatt, aus) {
      const o = aus || {};
      o.ok = false; o.dy = 0; o.nicken = 0; o.neigung = 0;
      const n = aufstand ? aufstand.length : 0;
      if (n < 3) return o;
      if (!nah) nah = this.abfrage(x, z, startIndex);          // noch kein Physikschritt (Startaufstellung vor dem Countdown, Pause)
      const c = Math.cos(heading), sn = Math.sin(heading), p = this.spline.punktBei(nah.s);
      const h = o._h || (o._h = []), ux = o._x || (o._x = []), uy = o._y || (o._y = []), uz = o._z || (o._z = []);
      let zm = 0;
      for (let i = 0; i < n; i++) zm += aufstand[i].z / n;
      // Aufstandspunkt jedes Rades bei Nicken A / Wanken B (YXZ): tiefster Punkt der Radscheibe → Versatz (ux, uy, uz) zur Auto-Mitte
      const punkte = (A, B) => {
        const sA = Math.sin(A), cA = Math.cos(A), sB = Math.sin(B), cB = Math.cos(B), N = Math.hypot(cB * cA, sA) || 1;
        for (let i = 0; i < n; i++) {
          const r = aufstand[i], px = r.x, py = r.y - r.r * cB * cA / N, pz = r.z + r.r * sA / N;
          const x1 = px * cB - py * sB, y1 = px * sB + py * cB, y2 = y1 * cA - pz * sA, z2 = y1 * sA + pz * cA;
          ux[i] = x1 * c + z2 * sn; uz[i] = -x1 * sn + z2 * c; uy[i] = y2;
        }
      };
      const tx = p.tx, tz = p.tz, qx = p.nx, qz = p.nz;
      const hoehen = (kontur) => {
        for (let i = 0; i < n; i++) {
          const px = x + ux[i], pz = z + uz[i], dx = px - p.x, dz = pz - p.z;
          const si = this.spline.wrapS(nah.s + dx * tx + dz * tz), qi = dx * qx + dz * qz;
          const b = this.belagHoehe(si, qi, px, pz, werkstatt, startIndex);
          let basis;                                                   // Höhe, auf die sich der Belag bezieht (≈ hoeheAn)
          if (b !== null) {
            // Asphalt (+ Markierung): Höhe des Asphalt-Bandes (Sehne quer zwischen den Rändern) statt hoeheAn – nur Höhenmodell 'gelaende'
            // (im Modell 'strasse' ist die Fahrbahn quer flach; dort passte das Band in der Messung schlechter als hoeheAn mit Index)
            const sn = b >= 0.06 && b <= 0.1 && !this.sModell && Math.abs(qi) <= this.breiteBei(si) / 2 ? this.strassenNetzHoehe(si, qi) : null;
            basis = sn !== null ? sn - 0.06 : this.hoeheAn(px, pz, startIndex);
            h[i] = basis + b;
          } else {
            // Gelände: sichtbares Boden-Gitter; Höhenmodell 'strasse' (Alpen, Mega): darüber die feine Böschung ≈ hoeheAn ohne Index,
            // +6 cm wie gelaendePose (v22: die Sehnen der Böschung liegen am Hang bis ~10 cm daneben)
            let g = this.bodenNetzHoehe(px, pz);
            if (g !== null && this.bruecken.length && this._imSenkeNetz(px, pz)) g = Math.max(g, this.bodenHoehe(px, pz));   // feines Senke-Gitter an Brücken liegt über dem groben
            const hb = this.sModell || g === null ? this.hoeheAn(px, pz) : g;
            h[i] = this.sModell || g === null ? Math.max(g === null ? -Infinity : g, hb + (this.sModell ? 0.06 : 0)) : g;
            basis = hb;
          }
          if (!kontur) continue;
          // Reifenkontur: Stufen im Belag (Randstein, Startbalken, Werkstatt-Platte, Brücken-Bohlen …) unter der Lauffläche (± halbe Breite quer)
          // und vor/hinter dem Aufstandspunkt (Bogen des Reifens: in Abstand d liegt er r − √(r² − d²) höher) – nur Belag (Werkstatt: + Sehne)
          const r = aufstand[i], b0 = b === null ? 0 : b, wq = r.w * 0.4;
          for (let k = 0; k < 6; k++) {
            const dl = k < 4 ? [-0.12, -0.06, 0.06, 0.12][k] : 0, dq = k === 4 ? -wq : k === 5 ? wq : 0;
            const bn = this.belagHoehe(this.spline.wrapS(si + dl), qi + dq, px + tx * dl + qx * dq, pz + tz * dl + qz * dq, werkstatt, startIndex);
            if (bn === null || bn <= b0) continue;
            h[i] = Math.max(h[i], basis + bn - (dl ? r.r - Math.sqrt(r.r * r.r - dl * dl) : 0));
          }
        }
      };
      // Ebene durch die Aufstandshöhen: Nicken aus vorn/hinten, Neigung aus links/rechts (Mittelwerte; Höhe ≈ y + x·sin(q)cos(n) − z·sin(n))
      const kl = (v) => Math.max(-0.9, Math.min(0.9, v));
      const ebene = () => {
        let xl = 0, hl = 0, nl = 0, xr = 0, hr = 0, nr = 0, zv = 0, hv = 0, nv = 0, zh = 0, hh = 0, nh = 0;
        for (let i = 0; i < n; i++) {
          const r = aufstand[i];
          if (r.x < 0) { xl += r.x; hl += h[i]; nl++; } else { xr += r.x; hr += h[i]; nr++; }
          if (r.z < zm) { zv += r.z; hv += h[i]; nv++; } else { zh += r.z; hh += h[i]; nh++; }
        }
        if (!nl || !nr || !nv || !nh) return false;
        o.nicken = Math.asin(kl(-(hh / nh - hv / nv) / (zh / nh - zv / nv)));
        o.neigung = Math.asin(kl((hr / nr - hl / nl) / (xr / nr - xl / nl) / Math.cos(o.nicken)));
        return true;
      };
      punkte(dynN || 0, dynQ || 0); hoehen(false);
      if (!ebene()) return o;
      punkte(o.nicken + (dynN || 0), o.neigung + (dynQ || 0)); hoehen(true);
      if (!ebene()) return o;
      punkte(o.nicken + (dynN || 0), o.neigung + (dynQ || 0));
      let d = -Infinity;
      for (let i = 0; i < n; i++) d = Math.max(d, h[i] - (y + uy[i]));
      if (d < -0.6) return o;
      o.ok = true; o.dy = Math.min(0.25, Math.max(-0.4, d));
      return o;
    }

    /**
     * W4-I: naechster() mit Index-Kontinuität: lokales Suchfenster ±120 m (60 Abtastpunkte) um startIndex, global erst,
     * wenn das Auto weiter als Bande + 15 m von „seinem" Abschnitt entfernt ist (Teleport). An einer Überführung bleibt
     * ein Auto so auf seiner Ebene. Ohne Überführungen: wie spline.naechster (unverändert).
     */
    _naechsterKont(x, z, startIndex) {
      // W4-J: auch an niveaugleichen Kreuzungen (beide Abschnitte liegen auf gleicher Höhe übereinander)
      if ((this.ueberfuehrungen.length || this.kreuzungen.length) && startIndex !== undefined && startIndex !== null && startIndex >= 0) {
        return this.spline.naechster(x, z, startIndex, 60, this.seitenabstandMax + 15);
      }
      return this.spline.naechster(x, z, startIndex);
    }

    /** W4-I: Überführung an Bogenlänge s (obere Fahrbahn, ± zugabe) oder null. */
    ueberfuehrungBei(s, zugabe) {
      for (const u of this.ueberfuehrungen) if (this._inBereich(u, s, zugabe)) return u;
      return null;
    }

    /** W4-I: Liegt s an einer Überführung – oben (Brücke ± zugabe) ODER unten (± UNTEN_HALB + zugabe um die Kreuzung)? */
    ueberfuehrungNah(s, zugabe) {
      const z = zugabe || 0;
      for (const u of this.ueberfuehrungen) {
        if (this._inBereich(u, s, z)) return true;
        if (u.unten && this._inBereich(u.unten, s, z)) return true;
      }
      return false;
    }

    /** W4-I: Kreuzung einer Überführung bestimmen: Stelle im Brückenbereich, an der ein fremder Abschnitt am nächsten ist. */
    _ueberfuehrungBerechnen(e) {
      const b = this._bereich(e, e.art || 'beton'), sp = this.spline;
      let best = null;
      for (let s = b.s0; s <= b.s1; s += 1) {
        const p = sp.punktBei(s);
        const fremd = sp.abschnitte(p.x, p.z, 40).filter(a => Math.abs(sp.differenzS(a.s, s)) > 80);
        if (fremd.length && (!best || fremd[0].abstand < best.abstand)) best = { sOben: sp.wrapS(s), sUnten: fremd[0].s, abstand: fremd[0].abstand, x: p.x, z: p.z };
      }
      if (best) {
        const po = sp.punktBei(best.sOben), pu = sp.punktBei(best.sUnten);
        best.dy = po.y - pu.y;
        best.winkel = Math.acos(Math.min(1, Math.abs(po.tx * pu.tx + po.tz * pu.tz))) * 180 / Math.PI;   // 90 = rechtwinklig
        b.kreuzung = best;
        b.unten = { s0: sp.wrapS(best.sUnten - UNTEN_HALB), s1: sp.wrapS(best.sUnten + UNTEN_HALB) };   // _inBereich: Rundenübergang ok
      }
      return b;
    }

    /**
     * W4-J: Niveaugleiche Kreuzung bestimmen: im Bereich e.s0..e.s1 die Stelle, an der ein fremder Abschnitt (Δs > 80 m)
     * am nächsten ist, dann fein (0,25 m) nachgesucht. Liefert null, wenn dort kein anderer Abschnitt kreuzt.
     *   sA/sB   Kreuzungsstelle im ersten/zweiten Abschnitt, x/z Mitte, winkel (90 = rechtwinklig), dy = |yA − yB|
     *   a/b     Bereiche { s0, s1 } = sA/sB ± KREUZ_HALB (für _inBereich), halbW = Fahrbahn + Rand (halbe Breite)
     *   halbL   halbe Länge der Kreuzungsfläche längs jeder Fahrbahn (halbW / sin winkel)
     *   masten  4 Warnlicht-Masten [{ x, z, s, q, pass: 'a'|'b', blick }] (je Zufahrt rechts, Ausfahrt links)
     */
    _kreuzungBerechnen(e) {
      const sp = this.spline;
      let best = null;
      const suche = (s) => {
        const p = sp.punktBei(s);
        const fremd = sp.abschnitte(p.x, p.z, 40).filter(a => Math.abs(sp.differenzS(a.s, s)) > 80);
        if (fremd.length && (!best || fremd[0].abstand < best.abstand)) best = { sA: sp.wrapS(s), sB: fremd[0].s, abstand: fremd[0].abstand };
      };
      for (let s = e.s0; s <= e.s1; s += 1) suche(s);
      if (!best) return null;
      const grob = best.sA;
      for (let s = grob - 1.5; s <= grob + 1.5; s += 0.25) suche(s);
      const pa = sp.punktBei(best.sA), pb = sp.punktBei(best.sB);
      const winkel = Math.acos(Math.min(1, Math.abs(pa.tx * pb.tx + pa.tz * pb.tz))) * 180 / Math.PI;
      const sin = Math.max(0.35, Math.sin(winkel * Math.PI / 180));
      const halbW = this.breite / 2 + this.randBreite;
      const k = {
        s0: e.s0, s1: e.s1, sA: best.sA, sB: best.sB, abstand: best.abstand, winkel,
        x: (pa.x + pb.x) / 2, z: (pa.z + pb.z) / 2, dy: Math.abs(pa.y - pb.y),
        tA: { x: pa.tx, z: pa.tz }, tB: { x: pb.tx, z: pb.tz }, halbW, halbL: halbW / sin, sin,
        a: { s0: sp.wrapS(best.sA - KREUZ_HALB), s1: sp.wrapS(best.sA + KREUZ_HALB) },
        b: { s0: sp.wrapS(best.sB - KREUZ_HALB), s1: sp.wrapS(best.sB + KREUZ_HALB) },
        pa, pb,                       // v16: Streckenpunkte (Mitte, Tangente, Normale) beider Abschnitte an der Kreuzung (Abschnittswechsel)
        warnA: false, warnB: false,   // Warnlicht der Masten an Abschnitt A (Auto auf B nah) bzw. B (Auto auf A nah)
      };
      if (k.dy >= KREUZ_DY_MAX) return null;                  // keine niveaugleiche Kreuzung (das wäre eine Überführung)
      // Masten: je Abschnitt an der Zufahrt rechts (vor der Kreuzung) und an der Ausfahrt links (Spiegelbild)
      const M = halbW + 1.1, L = k.halbL + 2.2;
      k.masten = [];
      [['a', k.sA], ['b', k.sB]].forEach(([pass, sK]) => {
        [[-1, 1], [1, -1]].forEach(([vz, sg]) => {
          const s = sp.wrapS(sK + vz * L), p = sp.punktBei(s);
          // blick: Richtung, in die das Schild zeigt (der Zufahrt entgegen)
          k.masten.push({ pass, s, q: sg * M, x: p.x + p.nx * sg * M, z: p.z + p.nz * sg * M, blick: { x: -vz * p.tx, z: -vz * p.tz }, vz });
        });
      });
      return k;
    }

    /**
     * W4-J (v16): ABSCHNITTSWECHSEL beim Abbiegen. n = Ergebnis der Index-Kontinuität (_naechsterKont) – das Auto ist noch
     * „seinem" Abschnitt zugeordnet. Hat es die Kreuzung aber verlassen und steht eindeutig auf der Querstraße
     * (≥ KREUZ_WECHSEL m von der Kreuzungsmitte entfernt auf der Fahrbahn des anderen Abschnitts, nicht mehr auf der eigenen
     * Fahrbahn), gehört es jetzt zum anderen Abschnitt: dessen normale Bande/Untergrund gilt, die Bande des alten Abschnitts
     * (23 m quer über der Querstraße = unsichtbare Wand) entfällt. Rein geometrisch, ohne Zustand (x, z, Index) → Server,
     * Browser-Vorhersage und Zaun-Tests rechnen identisch. Geradeaus (nie ≥ KREUZ_WECHSEL m auf der Querstraße): unverändert.
     * @returns {{n:object, k:object, pass:string, passHeim:string, l:number}|null} n = Abfrage auf dem ANDEREN Abschnitt,
     *          pass = neuer Abschnitt ('a'|'b'), passHeim = bisheriger, l = Abstand längs der Querstraße von der Mitte (m)
     */
    _kreuzungWechsel(x, z, n) {
      const sp = this.spline;
      const R2 = (KREUZ_WECHSEL_MAX + this.breite) * (KREUZ_WECHSEL_MAX + this.breite);
      for (let i = 0; i < this.kreuzungen.length; i++) {
        const k = this.kreuzungen[i], gx = x - k.x, gz = z - k.z;
        if (gx * gx + gz * gz > R2) continue;
        const eigenA = Math.abs(sp.differenzS(n.s, k.sA)) <= KREUZ_HALB + 25, eigenB = Math.abs(sp.differenzS(n.s, k.sB)) <= KREUZ_HALB + 25;
        if (eigenA === eigenB) continue;                                  // weder noch (oder beides: nicht eindeutig)
        if (Math.abs(n.seitenabstand) <= k.halbW + 1.5) continue;         // noch auf der eigenen Fahrbahn (samt Rand)
        const po = eigenA ? k.pb : k.pa, sO = eigenA ? k.sB : k.sA;
        const dx = x - po.x, dz = z - po.z;
        const l = dx * po.tx + dz * po.tz, q = dx * po.nx + dz * po.nz;
        if (Math.abs(l) < KREUZ_WECHSEL || Math.abs(l) > KREUZ_WECHSEL_MAX || Math.abs(q) > k.halbW) continue;
        const n2 = sp.naechster(x, z, sp.indexBei(sO + l));
        return { n: n2, k, pass: eigenA ? 'b' : 'a', passHeim: eigenA ? 'a' : 'b', l };
      }
      return null;
    }

    /** W4-J (v16): naechsterKont() + Abschnittswechsel beim Abbiegen (_kreuzungWechsel) – für abfrage, untergrundAn und die Bande. */
    _naechsterWechsel(x, z, startIndex) {
      let n = this._naechsterKont(x, z, startIndex);
      if (this.kreuzungen.length) {
        const w = this._kreuzungWechsel(x, z, n);
        if (w) n = w.n;
      }
      return this.gabelungen.length ? this._gabelAnpassen(n) : n;   // 14.10. (v18): Seitenabstand relativ zum nächsten Ast
    }

    // ---------------------------------------------------------- Gabelung (14.10., v18)

    /** Katalogeintrag { s0, s1, versatz, astBreite, anteil } → Abschnitt (s0/s1 auf Abtastpunkte gerastet, damit das Straßenband exakt anschließt). */
    _gabelBerechnen(e, nr) {
      const ds = this.spline.ds, L0 = this.spline.laenge;
      const ia = Math.ceil(e.s0 / ds - 1e-9), ib = Math.floor(e.s1 / ds + 1e-9);
      const s0 = ia * ds, s1 = ib * ds;
      if (!(s1 - s0 > 80) || s0 <= 0 || s1 >= L0) return null;
      const L = s1 - s0, h0 = this.breite / 4;
      const C = Math.max(e.versatz || GABEL_VERSATZ, h0 + 4);
      return { nr, s0, s1, L, ia, ib, P: L * Math.min(0.45, e.anteil || GABEL_ANTEIL), c0: h0, h0, C, hMin: Math.min(h0, (e.astBreite || GABEL_AST_BREITE) / 2) };
    }

    /** Gabelung an Bogenlänge s: { g, u (m ab s0), t (0 = Y-Spitze … 1 = ganz getrennt), c (Mitte eines Astes ab der Mittellinie), h (halbe Astbreite) } oder null. */
    gabelBei(s) {
      const G = this.gabelungen;
      for (let i = 0; i < G.length; i++) {
        const g = G[i], u = s - g.s0;
        if (u < -1e-6 || u > g.L + 1e-6) continue;
        const x = u < g.P ? Math.max(0, u) / g.P : u > g.L - g.P ? (g.L - u) / g.P : 1, t = x * x * (3 - 2 * x);
        return { g, u, t, c: g.c0 + (g.C - g.c0) * t, h: g.h0 + (g.hMin - g.h0) * t };
      }
      return null;
    }

    /** Mitte eines Astes ab der Mittellinie an s (m, ≥ 0; 0 außerhalb der Gabelung) – schnelle Kurzform von gabelBei(s).c. */
    gabelC(s) { const w = this.gabelungen.length ? this.gabelBei(s) : null; return w ? w.c : 0; }

    /** Liegt s in (oder ± zugabe um) einer Gabelung? → Abschnitt oder null (Sperrzone für Deko, Münzen, Listen). */
    gabelNah(s, zugabe) {
      const z = zugabe || 0;
      for (const g of this.gabelungen) if (s >= g.s0 - z && s <= g.s1 + z) return g;
      return null;
    }

    /** Roher Seitenabstand q (Mittellinie) und Bogenlänge s → Ast −1 (links) | +1 (rechts) | 0 (keine Gabelung hier). */
    gabelAst(q, s) { return this.gabelungen.length && this.gabelBei(s) ? (q >= 0 ? 1 : -1) : 0; }

    /** n (spline.naechster-Ergebnis, wird verändert): Seitenabstand relativ zur Mitte des nächsten Astes (siehe Kopfkommentar). */
    _gabelAnpassen(n) {
      const w = this.gabelBei(n.s);
      if (!w) return n;
      const q = n.seitenabstand, ast = q >= 0 ? 1 : -1, rel = q - ast * w.c;
      n.abstand = Math.sqrt(Math.max(0, n.abstand * n.abstand - q * q) + rel * rel);
      n.seitenabstand = rel; n.q0 = q; n.ast = ast;
      return n;
    }

    /** Querlage q (roh, an Bogenlänge sAlt) auf Bogenlänge sNeu übertragen, ohne den Ast zu wechseln (Reset-Suche nach hinten). */
    gabelQ(sNeu, sAlt, q) {
      const a = this.gabelBei(sAlt);
      if (!a) return q;
      const ast = q >= 0 ? 1 : -1, b = this.gabelBei(sNeu);
      return ast * (b ? b.c : 0) + (q - ast * a.c);
    }

    /** Punkt + Tangente auf dem Ast (−1/+1) bei s (Mitte des Astes; ohne Gabelung hier = Mittellinie). */
    astPunkt(s, ast) {
      const sp = this.spline, w = this.gabelBei(s), c = w ? ast * w.c : 0;
      const p = sp.punktBei(s), x = p.x + p.nx * c, z = p.z + p.nz * c;
      const w2 = this.gabelBei(s + 1), w1 = this.gabelBei(s - 1), p2 = sp.punktBei(s + 1), p1 = sp.punktBei(s - 1);
      const c2 = w2 ? ast * w2.c : 0, c1 = w1 ? ast * w1.c : 0;
      let tx = (p2.x + p2.nx * c2) - (p1.x + p1.nx * c1), tz = (p2.z + p2.nz * c2) - (p1.z + p1.nz * c1);
      const l = Math.hypot(tx, tz) || 1; tx /= l; tz /= l;
      return { x, z, tx, tz, s: p.s, c };
    }

    /** |c''(s)| (1/m): zusätzliche Kurvenkrümmung der Äste durch das Auseinanderlaufen (KI-Tempoprofil). 0 außerhalb. */
    gabelKruemmung(s) {
      const w = this.gabelBei(s);
      if (!w) return 0;
      const g = w.g, x = w.u < g.P ? w.u / g.P : w.u > g.L - g.P ? (g.L - w.u) / g.P : 1;
      if (x >= 1) return 0;
      return Math.abs((g.C - g.c0) * (6 - 12 * x)) / (g.P * g.P);
    }

    /**
     * Längen der Äste (Mittellinie jedes Astes von s0 bis s1, m) und Querlage-Kennwerte – für Tests und Doku.
     * @returns {{nr, s0, s1, laenge, links, rechts, mitte, unterschied, rMin}[]}
     */
    gabelInfo() {
      return this.gabelungen.map((g) => {
        const len = { '-1': 0, '1': 0 }, ds = 1;
        let rMin = Infinity, vorher = { '-1': null, '1': null };
        for (let s = g.s0; s <= g.s1 + 1e-6; s += ds) {
          [-1, 1].forEach((a) => {
            const P = this.astPunkt(s, a);
            if (vorher[a]) len[a] += Math.hypot(P.x - vorher[a].x, P.z - vorher[a].z);
            vorher[a] = P;
          });
        }
        for (let s = g.s0 + 4; s <= g.s1 - 4; s += 4) {
          [-1, 1].forEach((a) => {
            const A = this.astPunkt(s - 4, a), B = this.astPunkt(s, a), Cc = this.astPunkt(s + 4, a);
            const a1 = Math.atan2(B.x - A.x, B.z - A.z), a2 = Math.atan2(Cc.x - B.x, Cc.z - B.z);
            let d = a2 - a1; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
            if (Math.abs(d) > 1e-6) rMin = Math.min(rMin, 4 / Math.abs(d));
          });
        }
        return { nr: g.nr, s0: g.s0, s1: g.s1, laenge: g.L, links: len['-1'], rechts: len['1'], mitte: g.L, unterschied: Math.abs(len['-1'] - len['1']), rMin };
      });
    }

    /**
     * W4-J (v16): Ist das Auto an (x, z) – mit seiner bisherigen Zuordnung n (Index-Kontinuität, OHNE Wechsel) – auf der
     * Querstraße einer Kreuzung abgebogen? → { k, pass (neuer Abschnitt), passHeim, l } oder null. Für die Rennleitung
     * (raceManager: „Falsch abgebogen", kein Fortschritt).
     */
    kreuzungAbgebogen(x, z, n) {
      if (!this.kreuzungen.length) return null;
      const w = this._kreuzungWechsel(x, z, n);
      return w ? { k: w.k, pass: w.pass, passHeim: w.passHeim, l: w.l } : null;
    }

    /** W4-J: Kreuzung, deren Bereich (sA bzw. sB ± KREUZ_HALB + zugabe) s berührt → { k, pass: 'a'|'b', d } oder null. */
    kreuzungBei(s, zugabe) {
      const z = zugabe || 0;
      for (const k of this.kreuzungen) {
        if (this._inBereich(k.a, s, z)) return { k, pass: 'a', d: this.spline.differenzS(s, k.sA) };
        if (this._inBereich(k.b, s, z)) return { k, pass: 'b', d: this.spline.differenzS(s, k.sB) };
      }
      return null;
    }

    /** W4-J: Liegt s an einer Kreuzung (einer der beiden Abschnitte, ± KREUZ_HALB + zugabe)? Sperrzone für Deko/Münzen/Listen. */
    kreuzungNah(s, zugabe) { return this.kreuzungen.length > 0 && this.kreuzungBei(s, zugabe) !== null; }

    /**
     * W4-J: Seitenabstand (Betrag, m) des Punkts (x, z) zur QUERENDEN Fahrbahn einer Kreuzung, wenn s (eigener Abschnitt)
     * im Kreuzungsbereich liegt – sonst Infinity. Die querende Fahrbahn ist an der Kreuzung gerade genug (Tangente reicht).
     */
    _querAbstand(s, x, z, zugabe) {
      if (!this.kreuzungen.length) return Infinity;
      const kb = this.kreuzungBei(s, zugabe === undefined ? 10 : zugabe);
      if (!kb) return Infinity;
      const k = kb.k, sO = kb.pass === 'a' ? k.sB : k.sA, p = this.spline.punktBei(sO);
      const dx = x - p.x, dz = z - p.z;
      if (Math.abs(dx * p.tx + dz * p.tz) > KREUZ_HALB + 25) return Infinity;
      return Math.abs(dx * p.nx + dz * p.nz);
    }

    /** W4-J: Untergrund u am Punkt (x, z) des eigenen Abschnitts (n) – auf der querenden Fahrbahn Straße bzw. Rand. */
    _kreuzungUntergrund(x, z, n, u) {
      if (u === 'strasse' || u === 'oel' || u === 'sandFleck') return u;
      const q = this._querAbstand(n.s, x, z);
      if (q === Infinity) return u;
      if (q <= this.breite / 2) return 'strasse';
      if (q <= this.breite / 2 + this.randBreite && u !== 'rand' && u !== 'kleber') return 'rand';
      return u;
    }

    /** W4-I: Gewicht (0..1), mit dem die Fahrbahn an s den Boden mitzieht – 0 auf Überführungen (Boden = Tal darunter). */
    _bodenGewicht(s) {
      let g = 1;
      const sp = this.spline;
      for (const u of this.ueberfuehrungen) {
        if (this._aussen(u, s) > 0) continue;
        const innen = Math.min(sp.differenzS(s, u.s0), sp.differenzS(u.s1, s));   // m vom nächsten Brückenende nach innen
        g = Math.min(g, 1 - glatt(0, UEB_RAMPE, innen));     // am Brückenende 1 (Boden = Fahrbahn), UEB_RAMPE m weiter innen 0
      }
      return g;
    }

    /**
     * W4-I: Boden im Höhenmodell 'strasse': Gelände (_grundHoehe) an die nahen Fahrbahnen angeglichen
     * (bis flachQ exakt, bis BLEND_R weich). Mehrere Abschnitte (Serpentinen) werden symmetrisch gemischt.
     */
    _bodenS(x, z) {
      const T = this._grundHoehe(x, z);
      const sp = this.spline, pk = sp.punkte, N = pk.length;
      const ab = sp.abschnitte(x, z, BLEND_R);
      let sw = 0, sy = 0, A = 0;
      for (let k = 0; k < ab.length; k++) {
        const e = ab[k];
        let a = 1 - glatt(this._flachQ, BLEND_R, e.abstand);
        if (a <= 0) continue;
        if (this.ueberfuehrungen.length) a *= this._bodenGewicht(e.s);
        if (a <= 0) continue;
        const p = pk[e.index], q = pk[(e.index + 1) % N], y = p.y + (q.y - p.y) * e.t;
        sw += a * a; sy += y * a * a; if (a > A) A = a;
      }
      return sw > 0 ? T + (sy / sw - T) * A : T;
    }

    /**
     * W4-I: Gelände (ohne Straßenkorridor): geglättete Straßenhöhe (Gauß σ = GLATT_SIGMA, Überführungen ausgenommen,
     * weit weg ein breiter Mittelwert), dazu Hügel (huegel) und die See-Mulde. Einmal als Raster (GRUND_ZELLE m) berechnet,
     * bilinear gelesen; Cache je Katalog-Daten.
     */
    _grundHoehe(x, z) {
      const g = this._grund || (this._grund = this._grundRaster());
      const fx = (x - g.x0) / g.zelle, fz = (z - g.z0) / g.zelle;
      const ix = Math.max(0, Math.min(g.nx - 2, Math.floor(fx))), iz = Math.max(0, Math.min(g.nz - 2, Math.floor(fz)));
      const u = Math.max(0, Math.min(1, fx - ix)), v = Math.max(0, Math.min(1, fz - iz));
      const w = g.werte, a = w[iz * g.nx + ix], b = w[iz * g.nx + ix + 1], c = w[(iz + 1) * g.nx + ix], d = w[(iz + 1) * g.nx + ix + 1];
      let h = (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
      if (this.huegel.length) h += this.gelaendeHoehe(x, z);
      const see = this.see;
      if (see) {
        const r = Math.hypot(x - see.x, z - see.z);
        if (r < see.r * 1.6) h -= (see.tiefe || 3) * (1 - glatt(see.r * 0.75, see.r * 1.6, r));
      }
      return h;
    }

    _grundRaster() {
      const cache = Strecke._grundCache || (Strecke._grundCache = new Map());
      const schl = this.katalog;
      if (cache.has(schl)) return cache.get(schl);
      const pk = this.spline.punkte, sig = GLATT_SIGMA, Z = GRUND_ZELLE;
      let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity, yMittel = 0;
      pk.forEach((p) => { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); z0 = Math.min(z0, p.z); z1 = Math.max(z1, p.z); yMittel += p.y; });
      yMittel /= pk.length;
      x0 -= BODEN_SICHT + 400; x1 += BODEN_SICHT + 400; z0 -= BODEN_SICHT + 400; z1 += BODEN_SICHT + 400;
      const nx = Math.ceil((x1 - x0) / Z) + 1, nz = Math.ceil((z1 - z0) / Z) + 1;
      // Stützpunkte alle ~6 m (Gewicht 0 auf Überführungen), in ein grobes Raster sortiert
      const stuetz = [];
      for (let i = 0; i < pk.length; i += 3) {
        const gw = this._bodenGewicht(pk[i].s);
        if (gw > 0.01) stuetz.push([pk[i].x, pk[i].z, pk[i].y, gw]);
      }
      const R3 = 3 * sig, ZR = 60, raster = new Map();
      stuetz.forEach((st) => { const k = Math.floor(st[0] / ZR) * 100003 + Math.floor(st[1] / ZR); (raster.get(k) || raster.set(k, []).get(k)).push(st); });
      // breiter Mittelwert (σ 250 m) für die Ferne: auf einem groben Raster (FZ = 50 m), bilinear gelesen
      const werte = new Float32Array(nx * nz), sig2 = 2 * sig * sig, SB = 250, sigB2 = 2 * SB * SB, FZ = 50;
      const fnx = Math.ceil((x1 - x0) / FZ) + 2, fnz = Math.ceil((z1 - z0) / FZ) + 2, fernW = new Float32Array(fnx * fnz);
      for (let j = 0; j < fnz; j++) for (let i = 0; i < fnx; i++) {
        const x = x0 + i * FZ, z = z0 + j * FZ;
        let bw = 0, by = 0;
        for (let k = 0; k < stuetz.length; k += 2) {
          const dx = stuetz[k][0] - x, dz = stuetz[k][1] - z, w = Math.exp(-(dx * dx + dz * dz) / sigB2) * stuetz[k][3];
          bw += w; by += w * stuetz[k][2];
        }
        fernW[j * fnx + i] = bw > 1e-6 ? by / bw : yMittel;
      }
      const fernBei = (x, z) => {
        const fx = (x - x0) / FZ, fz = (z - z0) / FZ, i = Math.min(fnx - 2, Math.floor(fx)), j = Math.min(fnz - 2, Math.floor(fz));
        const u = fx - i, v = fz - j, a = fernW[j * fnx + i], b = fernW[j * fnx + i + 1], c = fernW[(j + 1) * fnx + i], d = fernW[(j + 1) * fnx + i + 1];
        return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
      };
      for (let j = 0; j < nz; j++) {
        for (let i = 0; i < nx; i++) {
          const x = x0 + i * Z, z = z0 + j * Z;
          let sw = 0, sy = 0;
          const cx = Math.floor(x / ZR), cz = Math.floor(z / ZR), r = Math.ceil(R3 / ZR);
          for (let a = -r; a <= r; a++) for (let b = -r; b <= r; b++) {
            const l = raster.get((cx + a) * 100003 + (cz + b));
            if (!l) continue;
            for (let k = 0; k < l.length; k++) {
              const dx = l[k][0] - x, dz = l[k][1] - z, d2 = dx * dx + dz * dz;
              if (d2 > R3 * R3) continue;
              const w = Math.exp(-d2 / sig2) * l[k][3];
              sw += w; sy += w * l[k][2];
            }
          }
          const fern = fernBei(x, z), wf = 0.05;
          werte[j * nx + i] = (sy + fern * wf) / (sw + wf);
        }
      }
      const g = { x0, z0, nx, nz, zelle: Z, werte };
      cache.set(schl, g);
      return g;
    }

    /**
     * Höhe des sichtbaren Bodens: wie hoeheAn, aber unter Brücken abgesenkt (Bach, Teich, Schlucht).
     * Die Fahrbahn auf der Brücke bleibt auf hoeheAn – nur der Boden darunter fällt ab.
     */
    bodenHoehe(x, z) {
      return this.hoeheAn(x, z) - this.senkeTiefe(x, z);
    }

    /** Absenkung (m, ≥ 0) unter Brücken. grob = für das grobe Bodengitter (weiter + tiefer, siehe _bodenBauen). */
    senkeTiefe(x, z, grob) {
      let t = 0;
      for (const b of this.bruecken) {
        const dx = x - b.m.x, dz = z - b.m.z;
        const l = Math.abs(dx * b.m.tx + dz * b.m.tz), q = Math.abs(dx * b.m.nx + dz * b.m.nz);
        if (l > b.halb + 40 || q > b.q1 + 30) continue;
        const r = grob ? GROB_RAND : 0;
        // längs: flacher Grund in der Mitte, Böschung bis zu den Brückenenden (Schlucht steiler)
        const innen = b.art === 'stahl' ? 0.62 : 0.42;
        const fl = 1 - glatt(innen, 1, l / (b.halb + r));
        const fq = 1 - glatt(b.q0 + r, b.q1 + r, q);
        let d = b.tiefe * fl * fq;
        if (grob) d += GROB_ABSENKUNG * (1 - glatt(b.halb + r, b.halb + r + 10, l)) * (1 - glatt(b.q1 + r, b.q1 + r + 10, q));
        t = Math.max(t, d);
      }
      return t;
    }

    /** Bereich { s0, s1 } aus dem Katalog vervollständigen (Mitte, Rahmen für die Senke). */
    _bereich(e, art) {
      const s0 = e.s0, s1 = e.s1, mitte = (s0 + s1) / 2;
      return { s0, s1, von: s0, bis: s1, laenge: s1 - s0, halb: (s1 - s0) / 2, mitte, art, tiefe: e.tiefe,
        m: this.spline.punktBei(mitte) };
    }

    /** Liegt s im Bereich b (± zugabe)? Berücksichtigt den Rundenübergang. */
    _inBereich(b, s, zugabe) {
      const z = (zugabe || 0) + 1e-9, sp = this.spline;   // 1e-9: Rundungsfehler bei s + L (Rundenübergang)
      return sp.differenzS(s, b.s0) >= -z && sp.differenzS(s, b.s1) <= z;
    }

    /** Liegt Bogenlänge s in einem Tunnel? (zugabe in m verlängert ihn an beiden Enden) */
    imTunnel(s, zugabe) { return this.tunnelBei(s, zugabe) !== null; }

    /** Tunnel an Bogenlänge s oder null. */
    tunnelBei(s, zugabe) {
      for (const t of this.tunnel) if (this._inBereich(t, s, zugabe)) return t;
      return null;
    }

    /** Brücke an Bogenlänge s oder null. */
    brueckeBei(s, zugabe) {
      for (const b of this.bruecken) if (this._inBereich(b, s, zugabe)) return b;
      return null;
    }

    /**
     * Darf an (x, z) keine Deko stehen? (Tunnelhügel, Brückensenke) n = naechster(x, z), falls schon bekannt.
     */
    dekoSperre(x, z, n) {
      // 15.10. (v25): auf und neben einer Zuschauertribüne (world/tribuenen.js) steht keine Deko
      if (this.tribuenen && this.tribuenen.length && R.Tribuenen && R.Tribuenen.sperre(this, x, z)) return true;
      // 17.10. (v29, F3): Formel-1-Strecke – Boxengasse + Boxen (world/formel1.js) bleiben frei von Deko
      if (this.daten && this.daten.formel1 && R.Formel1 && R.Formel1.sperre(this, x, z, n)) return true;
      // 14.10. (v22, Alpen hügeliger): keine Pflanzen/Felsen an sehr steilen Hängen (Einschnitt zwischen zwei Serpentinen-Ästen, > 32 %):
      // dort stünde das Auto bei flacher Fahrt mit dem Dach im Busch (test_gelaende_hoehe B). Nur Höhenmodell 'strasse'.
      if (this.sModell) {
        const hx = (this.bodenHoehe(x + 1.5, z) - this.bodenHoehe(x - 1.5, z)) / 3, hz = (this.bodenHoehe(x, z + 1.5) - this.bodenHoehe(x, z - 1.5)) / 3;
        if (hx * hx + hz * hz > 0.32 * 0.32) return true;
      }
      // W4-J: Kreuzung – Kreis um die Kreuzungsmitte frei (Masten, freie Sicht auf den Querverkehr)
      for (const k of this.kreuzungen) if ((x - k.x) * (x - k.x) + (z - k.z) * (z - k.z) < KREUZ_DEKO * KREUZ_DEKO) return true;
      // W4-I: Überführung – unter und neben der Brücke (bis Geländer + 12 m) und am unteren Abschnitt darunter frei halten
      if (this.ueberfuehrungen.length) {
        for (const e of this.spline.abschnitte(x, z, this.grenzeEng + 12)) if (this.ueberfuehrungNah(e.s, 6)) return true;
      }
      // 14.10. (v18): Gabelung – beide Äste samt Rand + Insel frei (die Inseldeko baut _gabelBauen selbst)
      if (this.gabelungen.length) {
        const nn = n || this.spline.naechster(x, z), w = this.gabelBei(nn.s);
        if (w && Math.abs(nn.seitenabstand) < w.c + w.h + this.randBreite + 3.5) return true;
        if (!w && this.gabelNah(nn.s, 12) && Math.abs(nn.seitenabstand) < this.breite / 2 + this.randBreite + 6) return true;
      }
      if (this.tunnel.length) {
        const nn = n || this.spline.naechster(x, z);
        if (this.imTunnel(nn.s, 8) && Math.abs(nn.seitenabstand) < this.grenzeEng + 16) return true;
      }
      for (const b of this.bruecken) {
        const dx = x - b.m.x, dz = z - b.m.z;
        if (Math.abs(dx * b.m.tx + dz * b.m.tz) < b.halb + 5 && Math.abs(dx * b.m.nx + dz * b.m.nz) < b.q0 + 8) return true;
      }
      return false;
    }

    /**
     * Seitenabstand der Bande an Bogenlänge s: normal seitenabstandMax, auf Brücken und in Tunneln
     * direkt hinter dem Randstreifen (grenzeEng), mit weichem Trichter (TRICHTER m) davor und danach.
     */
    grenzeBei(s) {
      let g = this.seitenabstandMax;
      const sp = this.spline;
      for (const b of this._engstellen) {
        const aussen = this._aussen(b, s);
        if (aussen >= TRICHTER) continue;
        g = Math.min(g, this.grenzeEng + (this.seitenabstandMax - this.grenzeEng) * glatt(0, 1, aussen / TRICHTER));
      }
      // Enge Spur-Abschnitte: Leitplanke folgt dem Fahrbahnrand (inkl. Übergang), davor/danach Trichter
      for (const e of this._spurEng) {
        const aussen = this._aussen(e, s);
        if (aussen >= SPUR_UEBERGANG + TRICHTER) continue;
        const gRand = this.breiteBei(s) / 2 + this.randBreite + ENG_ZUGABE;
        const t = aussen <= SPUR_UEBERGANG ? 0 : glatt(0, 1, (aussen - SPUR_UEBERGANG) / TRICHTER);
        g = Math.min(g, gRand + (this.seitenabstandMax - gRand) * t);
      }
      // 14.10. (v18): Gabelung – im Abschnitt Leitplanke direkt am Ast (Seitenabstand relativ zur Astmitte, siehe _gabelAnpassen),
      // davor/danach Trichter von der normalen Bande auf den Straßenrand (die Bande an der Y-Spitze liegt bei Mittellinie ± (breite/2 + Rand + 0,4))
      for (const gb of this.gabelungen) {
        const aussen = this._aussen(gb, s);
        if (aussen >= TRICHTER) continue;
        const w = aussen === 0 ? this.gabelBei(s) : null;
        const gRand = (w ? w.h : this.breite / 2) + this.randBreite + ENG_ZUGABE;
        g = Math.min(g, w ? gRand : gRand + (this.seitenabstandMax - gRand) * glatt(0, 1, aussen / TRICHTER));
      }
      void sp;
      return g;
    }

    /** Abstand (m) von s zum Bereich { s0, s1 } entlang der Strecke, 0 = innerhalb (Rundenübergang beachtet). */
    _aussen(b, s) {
      const sp = this.spline, d0 = sp.differenzS(s, b.s0), d1 = sp.differenzS(s, b.s1);
      return d0 >= 0 && d1 <= 0 ? 0 : Math.min(Math.abs(d0), Math.abs(d1));
    }

    /**
     * Fahrbahnbreite (m) an Bogenlänge s. Ohne aktive Spuren konstant this.breite; in einem Spur-Abschnitt
     * die Spurbreite (1 Spur 5 m, 3 Spuren 15 m), davor und danach SPUR_UEBERGANG m weicher Übergang.
     */
    breiteBei(s) {
      if (this.gabelungen.length) { const w = this.gabelBei(s); if (w) return 2 * w.h; }   // 14.10. (v18): Astbreite
      const sp = this.spuren;
      if (!sp.length) return this.breite;
      for (let i = 0; i < sp.length; i++) {
        const e = sp[i], aussen = this._aussen(e, s);
        if (aussen >= SPUR_UEBERGANG) continue;
        return e.breite + (this.breite - e.breite) * glatt(0, SPUR_UEBERGANG, aussen);
      }
      return this.breite;
    }

    /** Spur-Abschnitt, in dessen Bereich (inkl. Übergang + zugabe) s liegt, oder null. */
    spurBei(s, zugabe) {
      for (const e of this.spuren) if (this._aussen(e, s) < SPUR_UEBERGANG + (zugabe || 0)) return e;
      return null;
    }

    /** Liegt Bogenlänge s auf einer Brücke? */
    _aufBruecke(s) {
      return this.brueckeBei(s) !== null || (this.ueberfuehrungen.length > 0 && this.ueberfuehrungBei(s) !== null);
    }

    /** Untergrund aus Seitenabstand (+ Bogenlänge s für Brücke und Hindernis-Flecken). */
    _untergrundAus(seitenabstand, s) {
      const a = Math.abs(seitenabstand);
      const b2 = (s !== undefined && (this.spuren.length || this.gabelungen.length)) ? this.breiteBei(s) / 2 : this.breite / 2;
      if (a <= b2) {
        // Öl- und Sandflecken (Ellipse um die Mitte des Flecks)
        if (s !== undefined) {
          for (let i = 0; i < this._flecken.length; i++) {
            const h = this._flecken[i], ds = this.spline.differenzS(s, h.s);
            if (Math.abs(ds) > h.halblaenge) continue;
            const u = ds / h.halblaenge, v = (seitenabstand - h.seitenabstand) / h.halbbreite;
            if (u * u + v * v <= 1) return h.untergrund;
          }
        }
        return 'strasse';
      }
      if (a <= b2 + this.randBreite) return (s !== undefined && this.kleber.length && this.kleberBei(s, seitenabstand > 0 ? 1 : -1)) ? 'kleber' : 'rand';
      // Holzsteg: bis zum Geländer fährt man auf Brettern (wie Randstreifen)
      if (s !== undefined && this._aufBruecke(s) && a <= this.seitenabstandMax) return 'rand';
      return this.abseitsUntergrund;
    }

    /** 'strasse' | 'rand' | 'gras' | 'sand'. startIndex (optional) beschleunigt die Suche. */
    untergrundAn(x, z, startIndex) {
      const n = this._naechsterWechsel(x, z, startIndex);   // v16: Abschnittswechsel beim Abbiegen
      const u = this._untergrundAus(n.seitenabstand, n.s);
      return this.kreuzungen.length ? this._kreuzungUntergrund(x, z, n, u) : u;   // W4-J: querende Fahrbahn
    }

    /**
     * Alles auf einmal: naechster()-Ergebnis + untergrund (für die Spielschleife).
     * W4-I: an Überführungen mit Index-Kontinuität (_naechsterKont) – ein Auto oben bekommt die oberen s-Werte.
     */
    abfrage(x, z, startIndex) {
      const n = this._naechsterWechsel(x, z, startIndex);   // v16: Abschnittswechsel beim Abbiegen
      n.untergrund = this._untergrundAus(n.seitenabstand, n.s);
      if (this.kreuzungen.length) n.untergrund = this._kreuzungUntergrund(x, z, n, n.untergrund);   // W4-J: querende Fahrbahn
      return n;
    }

    // ---------------------------------------------------------- Hindernisse

    /**
     * Katalog-Einträge { typ, s, seite, breite? } → Hindernisse für Physik, KI und Grafik.
     * Jedes Hindernis (auch die Datenstruktur für die KI):
     *   typ            'oel' | 'sand' | 'baustelle' | 'ast'
     *   s              Mitte entlang der Strecke (m)
     *   s0, s1, laenge Anfang/Ende entlang der Strecke (Baustelle: inkl. Pylonen-Schräge davor)
     *   seitenabstand  Mitte quer (m, rechts +), halbbreite (m): belegt seitenabstand ± halbbreite
     *   gefahr         0..1 (config.hindernisse[typ].gefahr)
     *   untergrund     nur Flecken: 'oel' / 'sandFleck' (siehe untergrundAn)
     * Zusätzlich für die Kollision: x, z, radius (Grobtest), pylonen [{x,z,weg,...}], segmente [{ax,az,bx,bz,art}].
     */
    _hindernisseBerechnen(liste) {
      const C = R.config.hindernisse || {}, sp = this.spline, b = this.breite / 2;
      const welt = (s, q) => { const p = sp.punktBei(s); return { x: p.x + p.nx * q, z: p.z + p.nz * q, s: sp.wrapS(s), q }; };
      return liste.map((e, nr) => {
        const c = C[e.typ] || {};
        const h = { nr, typ: e.typ, gefahr: c.gefahr !== undefined ? c.gefahr : 0.5 };
        const vz = (e.seite || 1) >= 0 ? 1 : -1;
        if (e.typ === 'oel' || e.typ === 'sand') {
          const hb = (e.breite || c.breite || 5) / 2, hl = (e.laenge || c.laenge || 8) / 2;
          const q = Math.max(-(b - 1), Math.min(b - 1, (e.seite || 0) * b));
          Object.assign(h, { s: sp.wrapS(e.s), laenge: hl * 2, halblaenge: hl, seitenabstand: q, halbbreite: hb,
            untergrund: c.untergrund || (e.typ === 'oel' ? 'oel' : 'sandFleck') });
          h.s0 = sp.wrapS(e.s - hl); h.s1 = sp.wrapS(e.s + hl);
          const m = welt(e.s, q); h.x = m.x; h.z = m.z; h.radius = Math.max(hl, hb);
        } else if (e.typ === 'baustelle') {
          // Gesperrt: Hälfte vz von q = vz·0,6 bis zur Fahrbahnkante, über laenge m ab s.
          // Davor eine Pylonen-Schräge (vorlauf m) von der Kante zur Sperrlinie, Bake am Beginn.
          const L = e.laenge || c.laenge || 30, vor = c.vorlauf || 9, innen = 0.6;
          Object.assign(h, { s: sp.wrapS(e.s - vor + (L + vor) / 2), s0: sp.wrapS(e.s - vor), s1: sp.wrapS(e.s + L),
            laenge: L + vor, seitenabstand: vz * (b + innen) / 2, halbbreite: (b - innen) / 2 + 0.3, seite: vz,
            sperrS: sp.wrapS(e.s) });
          const pyl = [], abst = c.pylonenAbstand || 3;
          const nSchraeg = Math.max(2, Math.round(vor / 2.2));
          for (let k = 0; k <= nSchraeg; k++) {
            const u = k / nSchraeg;
            pyl.push(welt(e.s - vor + vor * u, vz * (b - 0.4 + (innen - b + 0.4) * u)));
          }
          for (let d = abst; d <= L + 1e-6; d += abst) pyl.push(welt(e.s + d, vz * innen));
          pyl.push(welt(e.s + L, vz * (b * 0.5 + innen * 0.5)), welt(e.s + L, vz * (b - 0.4)));
          h.pylonen = pyl.map(p => Object.assign(p, { weg: false, wegZeit: 0, von: -1 }));
          // Rot-weiße Bake quer über die gesperrte Hälfte (fest, wirkt wie eine Bande)
          const a = welt(e.s + 0.8, vz * (innen + 0.2)), z = welt(e.s + 0.8, vz * (b - 0.1));
          h.segmente = [{ ax: a.x, az: a.z, bx: z.x, bz: z.z, art: 'bake' }];
          const m = welt(e.s + L / 2 - vor / 2, vz * b / 2); h.x = m.x; h.z = m.z; h.radius = (L + vor) / 2 + 3;
        } else if (e.typ === 'ast') {
          // Ast vom Fahrbahnrand (etwas darüber hinaus) bis knapp vor die Mitte, leicht schräg
          const aussen = welt(e.s - 0.8, vz * (b + 0.6)), innen = welt(e.s + 0.8, vz * 0.5);
          Object.assign(h, { s: sp.wrapS(e.s), s0: sp.wrapS(e.s - 1.5), s1: sp.wrapS(e.s + 1.5), laenge: 3,
            seitenabstand: vz * (b + 0.5) / 2, halbbreite: (b - 0.5) / 2 + 0.3, seite: vz });
          h.segmente = [{ ax: aussen.x, az: aussen.z, bx: innen.x, bz: innen.z, art: 'ast', dicke: c.dicke || 0.28 }];
          h.x = (aussen.x + innen.x) / 2; h.z = (aussen.z + innen.z) / 2; h.radius = b / 2 + 2;
        } else if (e.typ === 'lava' || e.typ === 'krater') {
          // Runde 6 (W2-C): Fläche im Straßen-Rahmen bei s: längs ±halblaenge, quer q0..q1 (flaeche, collisions.js).
          //   lava:   Zunge über die halbe Fahrbahn (Seite vz, von der Mitte bis über den Rand) – KI meidet hart (h.hart)
          //   krater: runde Mulde (radius) bei seitenabstand – entsteht dynamisch beim Vulkanausbruch (dynamik.js).
          //           W2-C1: mit s0/s1 → die KI weicht nach dem Einschlag weich aus (main.js ruft driver.hindernisseSetzen
          //           neu auf, sobald sich dynamik.hindernisVersion ändert). Reset ignoriert Krater (kein h.seite).
          const CD = (R.config.dino || {})[e.typ] || {}, p = sp.punktBei(e.s);
          if (e.typ === 'lava') {
            const hl = (e.laenge || CD.laenge || 12) / 2, q0 = vz * 0.15, q1 = vz * (b + (this.randBreite || 1) + 0.6);
            Object.assign(h, { s: sp.wrapS(e.s), s0: sp.wrapS(e.s - hl), s1: sp.wrapS(e.s + hl), laenge: hl * 2, halblaenge: hl,
              seitenabstand: vz * (b / 2 + 0.075), halbbreite: b / 2 - 0.075, seite: vz, hart: true,   // b = halbe Fahrbahnbreite
              gefahr: CD.gefahr !== undefined ? CD.gefahr : 1.0 });
            h.flaeche = { hl, q0: Math.min(q0, q1), q1: Math.max(q0, q1) };
          } else {
            const r = e.radius || CD.radius || 2.6, q = e.seitenabstand !== undefined ? e.seitenabstand : (e.seite || 0) * b;
            Object.assign(h, { s: sp.wrapS(e.s), s0: sp.wrapS(e.s - r), s1: sp.wrapS(e.s + r), laenge: 2 * r, halblaenge: r,
              seitenabstand: q, halbbreite: r, radius: r + 1,
              kraterRadius: r, gefahr: CD.gefahr !== undefined ? CD.gefahr : 0.8 });
            h.flaeche = { hl: r, q0: q - r, q1: q + r, rund: r };
          }
          h.px = p.x; h.pz = p.z; h.tx = p.tx; h.tz = p.tz; h.nx = p.nx; h.nz = p.nz;
          const m = welt(e.s, (h.flaeche.q0 + h.flaeche.q1) / 2); h.x = m.x; h.z = m.z;   // Grobtest-Mitte = Flächenmitte
          if (e.typ === 'lava') h.radius = Math.hypot(h.flaeche.hl, (h.flaeche.q1 - h.flaeche.q0) / 2) + 1;
        }
        return h;
      });
    }

    /**
     * Katalog-Einträge { s, radius, versatz? } → Loopings:
     *   s          Einfahrt (Bogenlänge, m) – dort hebt das Band von der Straße ab
     *   radius     Kreisradius (m), versatz: Ausfahrt bei s + versatz (Straße läuft unten weiter)
     *   seitenVersatz  Helix: seitliche Verschiebung über die ganze Runde (Breite × 0,6)
     *   bandHalb   halbe Breite des Fahrbahnbands
     *   vMin       Mindest-Einfahrtstempo sqrt(5·g·r), vObenMin = sqrt(g·r)
     *   s0, s1     grober Bereich, den der Kreis über der Straße belegt (Deko/Hindernisse frei halten)
     */
    _loopingsBerechnen(liste) {
      const C = (R.config.fantasie && R.config.fantasie.looping) || {}, g = 9.81, sp = this.spline;
      return liste.map((e, nr) => {
        const r = e.radius || 12, versatz = e.versatz || C.versatz || 10;
        return {
          nr, s: sp.wrapS(e.s), radius: r, versatz,
          seitenVersatz: this.breite * (C.seitenVersatzAnteil || 0.6),
          bandHalb: (C.bandBreite || 7.2) / 2,
          vMin: Math.sqrt((C.vMinFaktor || 5) * g * r), vObenMin: Math.sqrt(g * r),
          s0: sp.wrapS(e.s - r * 0.5), s1: sp.wrapS(e.s + versatz + r * 1.3),
        };
      });
    }

    /** Looping, dessen Bereich s (± zugabe) berührt, oder null. */
    loopingBei(s, zugabe) {
      for (const l of this.loopings) if (this._inBereich(l, s, zugabe)) return l;
      return null;
    }

    /** Umgefahrene Pylonen wieder aufstellen: alle oder nur die von Fahrzeug nr (Rundenende). */
    pylonenZurueck(nr) {
      let n = 0;
      for (const h of this.hindernisse) {
        if (!h.pylonen) continue;
        for (const p of h.pylonen) if (p.weg && (nr === undefined || p.von === nr)) { p.weg = false; p.von = -1; n++; }
      }
      if (n) this.pylonenGeaendert = true;
      return n;
    }

    /** Ziel-Tempo der Ideallinie an Bogenlänge s (m/s). */
    tempoBei(s) {
      const sp = this.spline, N = sp.anzahl;
      const f = sp.wrapS(s) / sp.ds, i = Math.floor(f) % N, w = f - Math.floor(f);
      return this.idealLinie[i] + (this.idealLinie[(i + 1) % N] - this.idealLinie[i]) * w;
    }

    /**
     * Startaufstellung: 2 Spalten gestaffelt hinter der Startlinie,
     * Pole-Position vorne rechts.
     * @returns {{x:number, z:number, heading:number}[]}
     */
    startpositionen(n) {
      const liste = [];
      for (let i = 0; i < n; i++) {
        const reihe = Math.floor(i / 2), links = i % 2 === 1;
        const hinter = 8 + reihe * 9 + (links ? 4.5 : 0);
        const p = this.spline.punktBei(-hinter);
        const q = links ? -3.5 : 3.5;
        liste.push({ x: p.x + p.nx * q, z: p.z + p.nz * q, heading: headingAus(p.tx, p.tz) });
      }
      return liste;
    }

    _checkpointsBerechnen(abstand) {
      const anzahl = Math.max(3, Math.round(this.laenge / abstand));
      const liste = [];
      for (let k = 0; k < anzahl; k++) {
        const s = k * this.laenge / anzahl;
        const p = this.spline.punktBei(s);
        // breite = lokale Fahrbahnbreite (Tore/Anzeigen an engen und breiten Stellen)
        liste.push({ nr: k, s, x: p.x, z: p.z, tx: p.tx, tz: p.tz, nx: p.nx, nz: p.nz, breite: this.breiteBei(s) });
      }
      return liste;   // Checkpoint 0 = Start/Ziel
    }

    /**
     * Ziel-Tempo je Abtastpunkt: v = sqrt(aQuer / |Krümmung|), gedeckelt,
     * dann rückwärts geglättet, damit vor Kurven rechtzeitig gebremst wird.
     */
    _idealLinieBerechnen() {
      const pk = this.spline.punkte, N = pk.length, ds = this.spline.ds;
      const v = new Array(N);
      for (let i = 0; i < N; i++) {
        // stärkste Krümmung in ±3 Punkten (Kurveneingang nicht unterschätzen)
        let k = 0;
        for (let j = -3; j <= 3; j++) k = Math.max(k, Math.abs(pk[(i + j + N) % N].kruemmung));
        v[i] = Math.min(V_DECKEL, Math.sqrt(A_QUER_MAX / Math.max(k, 1e-6)));
      }
      // zweimal rückwärts herum (Rundkurs: Kurve nach Start wirkt auf das Ende)
      for (let runde = 0; runde < 2; runde++) {
        for (let i = N - 1; i >= 0; i--) {
          const naechstes = v[(i + 1) % N];
          v[i] = Math.min(v[i], Math.sqrt(naechstes * naechstes + 2 * A_BREMS * ds));
        }
      }
      return v;
    }

    // ---------------------------------------------------------- Grafik

    /** Baut die Strecke als THREE.Group (Boden, Straße, Linien, Randsteine, Start/Ziel). */
    bauen() {
      const gruppe = new THREE.Group();
      gruppe.name = 'Strecke ' + this.name;
      const thema = (R.themes && R.themes[this.thema]) || {};
      gruppe.add(this._bodenBauen(thema.boden !== undefined ? thema.boden : 0x5f9e3a, thema.boden2));
      gruppe.add(this._strasseBauen(thema.asphalt || 0x3c3f45));
      gruppe.add(this._mittellinieBauen());
      gruppe.add(this._randBauen());
      if (this.gabelungen.length) this._gabelBauen(thema).forEach(m => gruppe.add(m));   // 14.10. (v18): Äste, Insel, Leitplanken, Schilder
      gruppe.add(this._startZielBauen());
      gruppe.add(this._startbogenBauen());
      gruppe.add(this._zaunBauen(thema.zaun || {}));
      if (this._spurEng.length) gruppe.add(this._leitplankenBauen());
      this.bruecken.forEach((b) => {
        gruppe.add(this._senkeBauen(b, thema));
        gruppe.add(this._brueckeBauen(b, thema));
      });
      if (this.tunnel.length) this._tunnelBauen(thema).forEach(m => gruppe.add(m));
      // W4-I: Höhenmodell 'strasse': feine Böschung entlang der Straße + Überführungen (Brücke über die eigene Strecke)
      if (this.sModell) gruppe.add(this._boeschungBauen(thema));
      this.ueberfuehrungen.forEach(u => gruppe.add(this._ueberfuehrungBauen(u, thema)));
      if (this.loopings.length && R.Looping && R.Looping.bauen) gruppe.add(R.Looping.bauen(this, thema));
      // W4-J: niveaugleiche Kreuzungen (Platte, Haltelinien, Warnlicht-Masten)
      this.kreuzungen.forEach(k => gruppe.add(this._kreuzungBauen(k, thema)));
      // Runde 4 (W2-D): Sprungschanzen und Turbo-Felder (nur wenn die Welt sie einschaltet)
      if (this.aktiveSchichten.schanzen && this.schanzen.length) gruppe.add(this.schanzenBauen(thema));
      if (this.aktiveSchichten.boost && this.boostFelder.length) gruppe.add(this.boostBauen());
      // Runde 5: Klebe-Seitenstreifen (Fantasie), Grafik in world/kleber.js
      if (this.kleber.length && R.Kleber && R.Kleber.bauen) gruppe.add(R.Kleber.bauen(this));
      // 14.10. (v20): Kurvenschilder (Warnzeichen + Tempo-Schild vor jeder nennenswerten Kurve), world/schilder.js: 1 Mesh, 1 Textur-Atlas
      if (R.Kurvenschilder && R.Kurvenschilder.bauen) { const ks = R.Kurvenschilder.bauen(this, this.tempoKlasse); if (ks) gruppe.add(ks); }
      return gruppe;
    }

    /**
     * Runde 4: Sprungschanzen (Keile auf der Fahrbahn, track/schanze.js). Die Rampe hebt den Spline NICHT –
     * hoeheAn bleibt der Boden; die Rampenhöhe liefert R.Schanzen.hoeheAuf(strecke, s).
     */
    schanzenBauen(thema) {
      if (!R.Schanzen || !R.Schanzen.bauen) return new THREE.Group();
      return R.Schanzen.bauen(this, thema);
    }

    /** Runde 4: Turbo-Felder (leuchtende Pfeile, world/pickups.js; animiert über Pickups.animieren). */
    boostBauen() {
      if (!R.Pickups || !R.Pickups.felderBauen) return new THREE.Group();
      return R.Pickups.felderBauen(this);
    }

    /** Lambert-Material, leicht zur Kamera gezogen gegen Flimmern (z-fighting). */
    _material(farbe, versatz) {
      return new THREE.MeshLambertMaterial({
        color: farbe === undefined ? 0xffffff : farbe,
        vertexColors: farbe === undefined,
        polygonOffset: versatz > 0, polygonOffsetFactor: -versatz, polygonOffsetUnits: -versatz,
      });
    }

    /** Punkt neben der Mittellinie (q > 0 = rechts) inkl. Höhe + Anhebung. */
    _seitPunkt(p, q, anheben) {
      const x = p.x + p.nx * q, z = p.z + p.nz * q;
      // W4-I: Höhenmodell 'strasse' – Fahrbahn aus dem eigenen s (auch auf der Überführung), sonst wie bisher
      if (this.sModell && p.s !== undefined) return [x, this.hoeheBeiS(p.s, q) + anheben, z];
      return [x, this.hoeheAn(x, z) + anheben, z];
    }

    /** Liste von Vierecken (je 4 Ecken + Farbe) → BufferGeometry (nicht indiziert). */
    _viereckeZuGeometrie(vierecke) {
      const pos = new Float32Array(vierecke.length * 18);
      const col = new Float32Array(vierecke.length * 18);
      const c = new THREE.Color();
      let o = 0;
      for (const v of vierecke) {
        c.set(v.farbe);
        // a b c d gegen den Uhrzeigersinn von oben gesehen: a-b-c, a-c-d
        for (const e of [v.a, v.b, v.c, v.a, v.c, v.d]) {
          pos[o] = e[0]; pos[o + 1] = e[1]; pos[o + 2] = e[2];
          col[o] = c.r; col[o + 1] = c.g; col[o + 2] = c.b;
          o += 3;
        }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      g.computeVertexNormals();
      return g;
    }

    /**
     * Viereck zwischen Querschnitt p (Anfang) und q (Ende), seitlich von qa bis qb.
     * Reihenfolge so, dass die Fläche nach oben zeigt.
     */
    _band(p, q, qa, qb, anheben, farbe) {
      return {
        a: this._seitPunkt(p, qa, anheben), b: this._seitPunkt(p, qb, anheben),
        c: this._seitPunkt(q, qb, anheben), d: this._seitPunkt(q, qa, anheben), farbe,
      };
    }

    /** Wie _band, aber mit eigener Querlage am Ende q (qa1/qb1) – für veränderliche Fahrbahnbreite. */
    _band2(p, q, qa0, qb0, qa1, qb1, anheben, farbe) {
      return {
        a: this._seitPunkt(p, qa0, anheben), b: this._seitPunkt(p, qb0, anheben),
        c: this._seitPunkt(q, qb1, anheben), d: this._seitPunkt(q, qa1, anheben), farbe,
      };
    }

    /** Boden: Grundfarbe, optional mit großen Flecken in Farbe 2 (Nadelboden, Sandwellen). */
    _bodenBauen(farbe, farbe2) {
      // Mittelpunkt der Strecke
      let mx = 0, mz = 0;
      const pk = this.spline.punkte;
      pk.forEach(p => { mx += p.x; mz += p.z; });
      mx /= pk.length; mz /= pk.length;
      // Rasterweite aus config (100 → 16 m Felder, 20.000 Dreiecke statt 51.200 bei 160).
      // Geprüft: bei 100 bleibt die Straße auf allen Strecken ≥ 2,5 cm über dem Boden, 80 sticht im Wald durch.
      const raster = (R.config.grafik && R.config.grafik.bodenRaster) || 160;
      // Runde 4: lange Strecken (Wüste ±685 m) – Platte mind. 1600 m, sonst Strecke + BODEN_SICHT je Seite,
      // Feldgröße bleibt gleich (1600 / raster). this.bodenPlatte = { mx, mz, hx, hz } für Deko.
      const g = this._bodenMasse();
      const nx = Math.max(raster, Math.round(raster * g.hx / BODEN_HALB)), nz = Math.max(raster, Math.round(raster * g.hz / BODEN_HALB));
      const geo = new THREE.PlaneGeometry(2 * g.hx, 2 * g.hz, nx, nz);
      geo.rotateX(-Math.PI / 2);
      const pos = geo.attributes.position;
      const farben = new Float32Array(pos.count * 3);
      const basis = new THREE.Color(farbe), zweite = new THREE.Color(farbe2 !== undefined ? farbe2 : farbe), c = new THREE.Color();
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i) + mx, z = pos.getZ(i) + mz;
        // Unter Brücken: grobes Gitter tiefer als die feine Senke (_senkeBauen), damit es nicht durchsticht
        // W4-I: Höhenmodell 'strasse': im Straßenkorridor tiefer als die feine Böschung (_boeschungBauen)
        pos.setXYZ(i, x, this.hoeheAn(x, z) - (this.bruecken.length ? this.senkeTiefe(x, z, true) : 0) - (this.sModell ? this._korridorSenke(x, z) : 0), z);
        this._bodenFarbe(x, z, basis, zweite, farbe2 !== undefined, c);
        farben[i * 3] = c.r; farben[i * 3 + 1] = c.g; farben[i * 3 + 2] = c.b;
      }
      geo.setAttribute('color', new THREE.BufferAttribute(farben, 3));
      geo.computeVertexNormals();
      this._bodenNetz = { y: pos.array, mx: mx - g.hx, mz: mz - g.hz, zx: 2 * g.hx / nx, zz: 2 * g.hz / nz, nx, nz };   // v28 W4b: bodenNetzHoehe
      const boden = new THREE.Mesh(geo, this._material(undefined, 0));
      boden.name = 'Boden';
      return boden;
    }

    /** W4-I: Absenkung des groben Bodengitters im Straßenkorridor (die feine Böschung liegt exakt darüber). */
    _korridorSenke(x, z) {
      let d = Infinity;
      for (const e of this.spline.abschnitte(x, z, BLEND_R + 22)) {
        if (this.ueberfuehrungen.length && this._bodenGewicht(e.s) < 0.5) continue;
        d = Math.min(d, e.abstand);
      }
      if (d === Infinity) return 0;
      const w = 1 - glatt(BLEND_R + 6, BLEND_R + 22, d);
      if (w <= 0) return 0;
      // 14.10. (v22, Alpen hügeliger): liegt in der Nähe (16 m = Gitterweite) höheres Gelände (Einschnitt, die Straße liegt bis ~10 m unter dem
      // geglätteten Gelände), steigt das grobe Gitter dort als Sehne über die wahre Bodenhöhe → Mesh bis 0,8 m über dem Auto. Darum
      // zusätzlich so viel tiefer, wie das Gelände ringsum höher ist (die feine Böschung deckt das ab, sie reicht bis BOESCHUNG_BIS).
      const hier = this.hoeheAn(x, z);
      let hoechst = hier;
      for (let k = 0; k < 8; k++) {
        const a = k * Math.PI / 4;
        hoechst = Math.max(hoechst, this.hoeheAn(x + 16 * Math.cos(a), z + 16 * Math.sin(a)));
      }
      return (KORRIDOR_SENKE + (hoechst - hier)) * w;
    }

    /**
     * W4-I: Feine Böschung (Höhenmodell 'strasse'): Querstreifen alle 4 m beidseits von der Fahrbahnkante bis BOESCHUNG_BIS,
     * Höhe exakt bodenHoehe (Straße flach, dann weich ins Gelände) – das grobe Gitter (16 m) würde sonst an steilen
     * Hängen durch die Fahrbahn stechen. Steile Stellen felsgrau. Auf Überführungen keine Böschung (dort ist die Brücke).
     */
    _boeschungBauen(thema) {
      const sp = this.spline, L = sp.laenge, b2 = this.breite / 2;
      const QS = [b2 - 0.5, b2 + this.randBreite, this._flachQ, this._flachQ + 3, this._flachQ + 7, this._flachQ + 11, this._flachQ + 15,
        BLEND_R, BLEND_R + 6, BLEND_R + 12, BLEND_R + 19, BOESCHUNG_BIS];
      const basis = new THREE.Color(thema.boden !== undefined ? thema.boden : 0x5f9e3a);
      const zweite = new THREE.Color(thema.boden2 !== undefined ? thema.boden2 : basis.getHex());
      const fels = new THREE.Color(thema.fels !== undefined ? thema.fels : 0x8a8478), c = new THREE.Color();
      const ST = 4, n = Math.ceil(L / ST), reihen = [];
      for (let k = 0; k <= n; k++) {
        const s = Math.min(L, k * ST), p = sp.punktBei(s), ub = this.ueberfuehrungen.length && this._bodenGewicht(s) < 0.5;
        const reihe = { ub, punkte: [] };
        [-1, 1].forEach((sg) => {
          const seite = QS.map((q) => {
            const x = p.x + p.nx * q * sg, z = p.z + p.nz * q * sg;
            return [x, this.bodenHoehe(x, z) - 0.02, z];
          });
          reihe.punkte.push(seite);
        });
        reihen.push(reihe);
      }
      const pos = [], col = [];
      const farbe = (a, b) => {
        // Steigung zwischen zwei Querpunkten → Fels
        const st = Math.abs(b[1] - a[1]) / Math.max(0.5, Math.hypot(b[0] - a[0], b[2] - a[2]));
        this._bodenFarbe(a[0], a[2], basis, zweite, thema.boden2 !== undefined, c);
        c.lerp(fels, Math.max(0, Math.min(1, (st - 0.55) / 0.5)));
        return [c.r, c.g, c.b];
      };
      // 14.10. (v20, Bug „Auto im Grünen"): adaptive Verfeinerung. Die Querreihen sind nur an den Stützstellen exakt; dazwischen liegt
      // die Sehne. Wo die wahre Bodenhöhe (bodenHoehe = hoeheAn) stark gekrümmt ist – vor allem dort, wo sich an einer Serpentine die
      // Streifen der Nachbar-Abschnitte überlagern (bis 10 m breite Dreiecke über steilem Hang) –, lag die Fläche bis 0,6 m ÜBER dem Auto
      // (Fahrzeughöhe = hoeheAn): das Auto stand im Hang. Jetzt wird ein Viereck geteilt, solange Mitte/Kantenmitten mehr als
      // BOESCHUNG_TOL von der wahren Höhe abweichen (höchstens 4 Stufen, nicht unter 1 m Kante).
      const hoch = (x, z) => this.bodenHoehe(x, z) - 0.02;
      const viereck = (a, b, c, d, f1, f2, tiefe) => {       // a,b: Reihe k (Stationen j, j+1) · d,c: Reihe k+1; a→b quer, a→d längs
        if (tiefe < BOESCHUNG_STUFEN) {
          const mx = (a[0] + b[0] + c[0] + d[0]) / 4, mz = (a[2] + b[2] + c[2] + d[2]) / 4;
          const kante = Math.max(Math.hypot(a[0] - b[0], a[2] - b[2]), Math.hypot(a[0] - d[0], a[2] - d[2]), Math.hypot(c[0] - b[0], c[2] - b[2]), Math.hypot(c[0] - d[0], c[2] - d[2]));
          if (kante > 1.2) {
            const m = [mx, 0, mz];
            m[1] = hoch(mx, mz);
            if (Math.abs(m[1] - (a[1] + b[1] + c[1] + d[1]) / 4) > BOESCHUNG_TOL) {      // Mitte weicht ab → in 4 Teile teilen
              const ab = [(a[0] + b[0]) / 2, 0, (a[2] + b[2]) / 2], bc = [(b[0] + c[0]) / 2, 0, (b[2] + c[2]) / 2];
              const cd = [(c[0] + d[0]) / 2, 0, (c[2] + d[2]) / 2], da = [(d[0] + a[0]) / 2, 0, (d[2] + a[2]) / 2];
              [ab, bc, cd, da].forEach((P) => { P[1] = hoch(P[0], P[2]); });
              viereck(a, ab, m, da, f1, f1, tiefe + 1); viereck(ab, b, bc, m, f1, f2, tiefe + 1);
              viereck(da, m, cd, d, f1, f2, tiefe + 1); viereck(m, bc, c, cd, f1, f2, tiefe + 1);
              return;
            }
          }
        }
        pos.push(...a, ...b, ...c, ...a, ...c, ...d);
        col.push(...f1, ...f1, ...f2, ...f1, ...f2, ...f2);
      };
      for (let k = 0; k < n; k++) {
        const A = reihen[k], B = reihen[k + 1];
        if (A.ub || B.ub) continue;
        for (let sgi = 0; sgi < 2; sgi++) {
          const pa = A.punkte[sgi], pb = B.punkte[sgi];
          for (let j = 0; j < QS.length - 1; j++) {
            const f1 = farbe(pa[j], pa[j + 1]), f2 = farbe(pb[j], pb[j + 1]);
            viereck(pa[j], pa[j + 1], pb[j + 1], pb[j], f1, f2, 0);
          }
        }
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
      geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(col), 3));
      geo.computeVertexNormals();
      const m = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }));
      m.name = 'Boeschung';
      return m;
    }

    /**
     * W4-I: Überführung u (obere Fahrbahn über die eigene Strecke): Betonplatte (Fahrbahn selbst = _strasseBauen),
     * Brüstung mit Stahl-Handlauf genau an der Bande (grenzeEng), Pfeiler bis zum Boden (Tal/untere Straße) – nie auf
     * der unteren Fahrbahn: die zwei Pfeiler neben der Kreuzung stehen hinter deren Randstreifen. Widerlager an den Enden.
     */
    _ueberfuehrungBauen(u) {
      const w = this.grenzeEng, v = [], sp = this.spline, s0 = u.s0, s1 = u.s1, bb = this.breite / 2;
      const DICKE = 1.3, schritte = Math.max(4, Math.round(u.laenge / 2));
      const sAt = (k) => s0 + (s1 - s0) * k / schritte;
      for (let k = 0; k < schritte; k++) {
        const a = sAt(k), e = sAt(k + 1), pa = sp.punktBei(a), pe = sp.punktBei(e);
        v.push(this._band(pa, pe, -w - 0.4, w + 0.4, -DICKE, 0x8b8780));                      // Unterseite
        [-1, 1].forEach((sg) => {
          const q = (w + 0.4) * sg;
          v.push(this._wandSQ(a, q, e, q, -DICKE, 0.95, 0xb3ada3));                             // Plattenrand + Brüstung außen
          v.push(this._wandSQ(a, w * sg, e, w * sg, 0, 0.95, 0xc4beb3));                        // Brüstung innen
          v.push(this._band(pa, pe, Math.min(w * sg, q), Math.max(w * sg, q), 0.95, 0xd2ccc0));  // Brüstung oben
          v.push(this._wandSQ(a, (w - 0.05) * sg, e, (w - 0.05) * sg, 1.1, 1.22, 0x3f6fae));     // Stahl-Handlauf (blau)
          v.push(this._wandSQ(a, (w - 0.05) * sg, e, (w - 0.05) * sg, -DICKE - 0.01, -DICKE + 0.25, 0x6f6b64));   // dunkle Kante unten
        });
        if (k % 3 === 0) [-1, 1].forEach((sg) => {                                                // Handlauf-Stützen
          const p = this._punktSQ(a, (w - 0.05) * sg, 0);
          this._kiste(v, p[0], p[2], pa.tx, pa.tz, 0.05, 0.05, p[1] + 0.95, p[1] + 1.22, 0x3f6fae);
        });
      }
      // Pfeiler: zwei neben der unteren Fahrbahn (hinter deren Randstreifen + 2,5 m), dann alle ~15 m bis zu den Enden
      const kr = u.kreuzung, stellen = [];
      if (kr) {
        const frei = (this.breite / 2 + this.randBreite + 2.5) / Math.max(0.35, Math.sin((kr.winkel || 90) * Math.PI / 180)) + 1.2;
        for (const sg of [-1, 1]) for (let d = frei; d < u.laenge; d += 15) {
          const s = kr.sOben + sg * d;
          if (this._aussen(u, s) > 0 || Math.abs(sp.differenzS(s, s0)) < 5 || Math.abs(sp.differenzS(s, s1)) < 5) continue;
          stellen.push(s);
        }
      }
      stellen.forEach((s) => {
        const p = sp.punktBei(s), yo = p.y - DICKE + 0.05;
        // Pfeiler nur, wenn darunter keine andere Fahrbahn (+ Rand) liegt
        const fremd = sp.abschnitte(p.x, p.z, 30).some(a => Math.abs(sp.differenzS(a.s, s)) > 60 && a.abstand < this.breite / 2 + this.randBreite + 1.5);
        if (fremd) return;
        const yu = Math.min(this.bodenHoehe(p.x, p.z), this.bodenHoehe(p.x + p.nx * bb * 0.6, p.z + p.nz * bb * 0.6), this.bodenHoehe(p.x - p.nx * bb * 0.6, p.z - p.nz * bb * 0.6)) - 1;
        if (yo - yu < 0.6) return;
        this._kiste(v, p.x, p.z, p.tx, p.tz, 0.75, bb - 1.6, yu, yo, 0xa29d94);                    // Pfeilerscheibe
        this._kiste(v, p.x, p.z, p.tx, p.tz, 1.1, bb + 0.4, yo - 0.7, yo, 0x948f86);              // Pfeilerkopf
      });
      // Widerlager an beiden Enden (Mauer quer bis in den Boden)
      [s0, s1].forEach((s) => {
        const p = sp.punktBei(s), y = p.y, yb = Math.min(this.bodenHoehe(p.x, p.z), y) - 1.5;
        this._kiste(v, p.x, p.z, p.tx, p.tz, 1.0, w + 0.8, yb, y - 0.3, 0x9a948b);
      });
      const mesh = new THREE.Mesh(this._viereckeZuGeometrie(v),
        new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }));
      mesh.name = 'Ueberfuehrung';
      return mesh;
    }

    /**
     * W4-J: Kreuzung k als Gruppe:
     *   Platte    Asphalt-Parallelogramm über der Schnittfläche beider Fahrbahnen inkl. Rand (|qA|, |qB| ≤ halbW), Raster 8×8 auf
     *             dem Gelände, stärker zur Kamera gezogen (polygonOffset 3) → kein Z-Fighting der zwei Fahrbahnbänder
     *   Zeichen   weiße Haltelinien an beiden Zufahrten, bunter „Zauberkreis" in der Mitte (Regenbogenfarben des Themas)
     *   Masten    4 Warnlicht-Masten (Fantasie-Stil: Zuckerstangen-Mast, Andreaskreuz rot-weiß, schwarzer Lampenträger,
     *             2 rote Leuchtkugeln + Lichthof) – Lampen getrennt nach Mastgruppe (a/b) und Seite (links/rechts),
     *             damit kreuzungAnimieren sie abwechselnd blinken lassen kann.
     */
    _kreuzungBauen(k, thema) {
      const g = new THREE.Group();
      g.name = 'Kreuzung';
      const W = k.halbW, D = W / k.sin + 0.6, N = 8;
      const tA = k.tA, tB = k.tB;
      // Punkt aus Längsanteilen entlang beider Fahrbahnen (a längs A, b längs B) – liegt im Parallelogramm, wenn |a|,|b| ≤ D
      const P = (a, b, hoch) => { const x = k.x + tA.x * a + tB.x * b, z = k.z + tA.z * a + tB.z * b; return [x, this.hoeheAn(x, z) + hoch, z]; };
      const platte = [];
      const asphalt = new THREE.Color(thema.asphalt || 0x3c3f45);
      for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
        const a0 = -D + 2 * D * i / N, a1 = -D + 2 * D * (i + 1) / N, b0 = -D + 2 * D * j / N, b1 = -D + 2 * D * (j + 1) / N;
        platte.push({ a: P(a0, b0, 0.075), b: P(a1, b0, 0.075), c: P(a1, b1, 0.075), d: P(a0, b1, 0.075), farbe: asphalt.getHex() });
      }
      // Umlaufsinn: Normalen nach oben (je nach Drehsinn der beiden Tangenten)
      const kreuzY = tA.x * tB.z - tA.z * tB.x;
      if (kreuzY > 0) platte.forEach((v) => { const h = v.b; v.b = v.d; v.d = h; });
      const pm = new THREE.Mesh(this._viereckeZuGeometrie(platte), this._material(undefined, 3));
      pm.name = 'Kreuzungsplatte';
      g.add(pm);
      // Haltelinien (je Zufahrt, 0,6 m breit, quer über die Fahrbahn) + Zauberkreis
      const zeichen = [], sp = this.spline;
      [k.sA, k.sB].forEach((sK) => {
        const s0 = sK - k.halbL - 1.6, p = sp.punktBei(s0), q = sp.punktBei(s0 + 0.6);
        zeichen.push(this._band(p, q, -this.breite / 2 + 0.3, this.breite / 2 - 0.3, 0.1, 0xf4f4f4));
      });
      const rb = thema.regenbogen || [0xff4f8b, 0xffd23a, 0x4cd97b, 0x45a8ff, 0xa66bff], NR = 24;
      for (let i = 0; i < NR; i++) {
        const w0 = i / NR * Math.PI * 2, w1 = (i + 1) / NR * Math.PI * 2;
        const ring = (r, w) => { const x = k.x + Math.cos(w) * r, z = k.z + Math.sin(w) * r; return [x, this.hoeheAn(x, z) + 0.1, z]; };
        const v = { a: ring(2.6, w0), b: ring(3.6, w0), c: ring(3.6, w1), d: ring(2.6, w1), farbe: rb[i % rb.length] };
        zeichen.push(v);
      }
      const zm = new THREE.Mesh(this._viereckeZuGeometrie(zeichen), new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide,
        polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }));
      zm.name = 'Kreuzungszeichen';
      g.add(zm);
      // Masten
      const teile = [], lampen = { a: [[], []], b: [[], []] };
      const HOCH = 3.3, STREIFEN = [0xffffff, 0xff5fa2];
      const box = (sx, sy, sz, x, y, z, drehY, drehZ, farbe) => {
        const geo = new THREE.BoxGeometry(sx, sy, sz);
        if (drehZ) geo.rotateZ(drehZ);
        geo.rotateY(drehY); geo.translate(x, y, z);
        teile.push({ geo, farbe });
      };
      k.masten.forEach((m) => {
        const y0 = this.hoeheAn(m.x, m.z), dreh = Math.atan2(m.blick.x, m.blick.z);   // lokale +z zeigt in Blickrichtung
        // Zuckerstangen-Mast (Ringe abwechselnd weiß/pink) + Sockel
        const nRing = 8;
        for (let r = 0; r < nRing; r++) {
          const geo = new THREE.CylinderGeometry(0.11, 0.11, HOCH / nRing, 8);
          geo.translate(m.x, y0 + (r + 0.5) * HOCH / nRing, m.z);
          teile.push({ geo, farbe: STREIFEN[r % 2] });
        }
        box(0.5, 0.18, 0.5, m.x, y0 + 0.09, m.z, dreh, 0, 0x8a7bb8);
        // Andreaskreuz (zwei gekreuzte Balken rot-weiß) oben, leicht vor dem Mast
        const fx = m.x + m.blick.x * 0.14, fz = m.z + m.blick.z * 0.14, yk = y0 + HOCH + 0.15;
        [Math.PI / 4, -Math.PI / 4].forEach((w) => {
          box(1.9, 0.3, 0.05, fx, yk, fz, dreh, w, 0xf6f6f6);
          box(1.6, 0.14, 0.09, fx, yk, fz, dreh, w, 0xd8262f);
        });
        // Stern als Spitze (Fantasie)
        const stern = new THREE.OctahedronGeometry(0.22, 0); stern.translate(m.x, yk + 0.85, m.z);
        teile.push({ geo: stern, farbe: 0xffd23a });
        // Lampenträger (schwarz) quer, 2 Lampen links/rechts mit Blende
        const yl = y0 + HOCH - 0.85, qx = Math.cos(dreh), qz = -Math.sin(dreh);       // quer zur Blickrichtung (lokale +x)
        box(1.35, 0.26, 0.12, m.x + m.blick.x * 0.12, yl, m.z + m.blick.z * 0.12, dreh, 0, 0x1d1d22);
        [-1, 1].forEach((sg, li) => {
          const lx = m.x + qx * 0.5 * sg + m.blick.x * 0.24, lz = m.z + qz * 0.5 * sg + m.blick.z * 0.24;
          box(0.42, 0.42, 0.1, lx - m.blick.x * 0.08, yl, lz - m.blick.z * 0.08, dreh, 0, 0x111114);   // Lampenschild
          box(0.44, 0.05, 0.2, lx, yl + 0.24, lz, dreh, 0, 0x111114);                                   // Blende
          lampen[m.pass][li].push({ x: lx, y: yl, z: lz });
        });
      });
      const mm = new THREE.Mesh(this._teileVereinen(teile), new THREE.MeshLambertMaterial({ vertexColors: true }));
      mm.name = 'Warnlicht-Masten';
      g.add(mm);
      // Leuchtkugeln (MeshBasic, leuchten ohne Licht) + Lichthof (additives Sprite) je Gruppe/Seite: 4 Materialien
      const halo = this._haloTextur();
      k._lampen = [];
      ['a', 'b'].forEach((pass) => [0, 1].forEach((li) => {
        const mat = new THREE.MeshBasicMaterial({ color: 0x3a0c0c });
        const liste = lampen[pass][li];
        const geos = liste.map((l) => { const geo = new THREE.SphereGeometry(0.17, 10, 8); geo.translate(l.x, l.y, l.z); return { geo, farbe: 0xffffff }; });
        const lm = new THREE.Mesh(this._teileVereinen(geos), mat);
        lm.name = 'Warnlampen';
        g.add(lm);
        const hmat = new THREE.SpriteMaterial({ map: halo, color: 0xff3020, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
        const hoefe = liste.map((l) => { const sp2 = new THREE.Sprite(hmat); sp2.position.set(l.x, l.y, l.z); sp2.scale.set(1.9, 1.9, 1); sp2.name = 'Warnlicht-Hof'; g.add(sp2); return sp2; });
        k._lampen.push({ pass, seite: li, mat, hmat, hoefe });
      }));
      this.kreuzungAnimieren(0, null);
      return g;
    }

    /** W4-J: weicher Lichthof (Canvas, einmal je Strecke). */
    _haloTextur() {
      if (this._halo) return this._halo;
      if (typeof document === 'undefined') return null;
      const c = document.createElement('canvas'); c.width = c.height = 64;
      const g = c.getContext('2d'), v = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      v.addColorStop(0, 'rgba(255,255,255,1)'); v.addColorStop(0.35, 'rgba(255,255,255,0.55)'); v.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = v; g.fillRect(0, 0, 64, 64);
      this._halo = new THREE.CanvasTexture(c);
      return this._halo;
    }

    /**
     * W4-J: Warnlicht-Zustand (rein, ohne Three.js): je Kreuzung warnA/warnB (true = an den Masten dieses Abschnitts
     * kommt Querverkehr: ein Auto im ANDEREN Abschnitt ist < KREUZ_WARN m vor der Kreuzung oder mitten drauf).
     * fahrzeuge: Liste mit .s, .nah.s (main.js) oder .vehicle + .index; ausgeschiedene/Polizei zählen mit (Auto ist Auto).
     */
    kreuzungWarnung(fahrzeuge) {
      const sp = this.spline;
      for (const k of this.kreuzungen) {
        k.warnA = false; k.warnB = false;
        for (const f of fahrzeuge || []) {
          if (!f || f.ausgeschieden) continue;
          const s = typeof f.s === 'number' ? f.s : (f.nah && typeof f.nah.s === 'number' ? f.nah.s : null);
          if (s === null) continue;
          const dA = sp.differenzS(k.sA, s), dB = sp.differenzS(k.sB, s);
          if (dA > -k.halbL - 2 && dA < KREUZ_WARN) k.warnB = true;    // Auto auf A → Masten an B warnen
          if (dB > -k.halbL - 2 && dB < KREUZ_WARN) k.warnA = true;    // Auto auf B → Masten an A warnen
        }
      }
    }

    /**
     * W4-J: Warnlicht blinken lassen (je Frame aus main.js): die zwei Lampen eines Masts abwechselnd; ruhig 1,2 Hz und
     * gedämpft, bei Querverkehr (kreuzungWarnung) 3 Hz, heller und mit großem Lichthof.
     */
    kreuzungAnimieren(zeit, fahrzeuge) {
      if (!this.kreuzungen.length) return;
      if (fahrzeuge) this.kreuzungWarnung(fahrzeuge);
      for (const k of this.kreuzungen) {
        for (const l of k._lampen || []) {
          const warn = l.pass === 'a' ? k.warnA : k.warnB, hz = warn ? 3 : 1.2;
          const an = (Math.floor(zeit * hz * 2) + l.seite) % 2 === 0;
          l.mat.color.setHex(an ? (warn ? 0xff3a22 : 0xd8261c) : 0x3a0c0c);
          l.hmat.opacity = an ? (warn ? 1 : 0.45) : 0;
          l.hmat.color.setHex(warn ? 0xff5030 : 0xff2a1a);
          for (const h of l.hoefe || []) h.visible = an;      // dunkler Hof wird gar nicht gezeichnet (Draw-Calls)
        }
        k.blinkAn = (Math.floor(zeit * 2.4) % 2) === 0;
      }
    }

    /** Mitte und halbe Kantenlängen der Bodenplatte (Mitte = Schwerpunkt der Mittellinie). */
    _bodenMasse() {
      if (this.bodenPlatte) return this.bodenPlatte;
      let mx = 0, mz = 0, ax = 0, az = 0;
      const pk = this.spline.punkte;
      pk.forEach(p => { mx += p.x; mz += p.z; });
      mx /= pk.length; mz /= pk.length;
      pk.forEach(p => { ax = Math.max(ax, Math.abs(p.x - mx)); az = Math.max(az, Math.abs(p.z - mz)); });
      this.bodenPlatte = { mx, mz, hx: Math.max(BODEN_HALB, Math.ceil(ax + BODEN_SICHT)), hz: Math.max(BODEN_HALB, Math.ceil(az + BODEN_SICHT)) };
      return this.bodenPlatte;
    }

    /** Bodenfarbe an (x, z): leichte Farbflecken, damit die Wiese nicht wie Plastik aussieht. */
    _bodenFarbe(x, z, basis, zweite, mitZweiter, c) {
      const f = 0.9 + 0.1 * Math.sin(x * 0.047 + Math.sin(z * 0.031) * 2) * Math.cos(z * 0.052 - x * 0.013)
        + 0.04 * Math.sin(x * 0.31 + z * 0.27);
      // Flecken: weiche Mischung zur zweiten Farbe
      const m = !mitZweiter ? 0 : Math.max(0, Math.min(1,
        0.5 + 0.9 * Math.sin(x * 0.021 + Math.cos(z * 0.017) * 2.2) * Math.sin(z * 0.025 - x * 0.008 + 1.3)));
      return c.copy(basis).lerp(zweite, m).multiplyScalar(f);
    }

    _strasseBauen(asphalt) {
      const pk = this.spline.punkte, N = pk.length;
      const pos = new Float32Array(N * 2 * 3), col = new Float32Array(N * 2 * 3);
      const c = new THREE.Color();
      for (let i = 0; i < N; i++) {
        const p = pk[i], b = this._breiteGeo(i, p.s) / 2;      // Runde 4: Breite je Stelle (Spuren)
        const l = this._seitPunkt(p, -b, 0.06), r = this._seitPunkt(p, b, 0.06);
        pos.set(l, i * 6); pos.set(r, i * 6 + 3);
        // Asphalt mit leichter Streifung (Flickstellen)
        const f = 1 + 0.05 * Math.sin(i * 0.9) * Math.sin(i * 0.23);
        c.setHex(asphalt).multiplyScalar(f);
        col.set([c.r, c.g, c.b, c.r, c.g, c.b], i * 6);
      }
      const index = [];
      for (let i = 0; i < N; i++) {
        if (this._gabelIdx(i)) continue;      // 14.10. (v18): im Gabel-Abschnitt zeichnet _gabelBauen die zwei Äste
        const j = (i + 1) % N;
        const l0 = i * 2, r0 = i * 2 + 1, l1 = j * 2, r1 = j * 2 + 1;
        index.push(l0, r0, r1, l0, r1, l1);
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
      geo.setIndex(index);
      geo.computeVertexNormals();
      this._strassenNetz = pos;   // v28 W4b: strassenNetzHoehe (Rand links/rechts je Splinepunkt)
      const m = new THREE.Mesh(geo, this._material(undefined, 1));
      m.name = 'Strasse';
      return m;
    }

    _mittellinieBauen() {
      const sp = this.spline, vierecke = [];
      const strich = 3, luecke = 4, w = 0.14;
      for (let s = 8; s + strich < this.laenge - 6; s += strich + luecke) {
        // Runde 4: 3 Spuren → zwei Linien bei ±Breite/6, 1 Spur → keine Mittellinie
        const spur = this.spurBei(s + strich / 2);
        if (spur && spur.spuren === 1) continue;
        if (this.gabelungen.length && this.gabelNah(s + strich / 2, strich / 2 + 0.5)) continue;   // 14.10. (v18): Äste haben keine Mittellinie
        // Strich in 1-m-Stücken, damit er Kurven folgt
        for (let t = 0; t < strich; t += 1) {
          const p = sp.punktBei(s + t), q = sp.punktBei(s + t + 1);
          // W4-J: auf der Kreuzungsfläche (querende Fahrbahn + Rand + 1,5 m) keine Mittellinie
          if (this.kreuzungen.length && Math.min(this._querAbstand(p.s, p.x, p.z), this._querAbstand(q.s, q.x, q.z)) < this.breite / 2 + this.randBreite + 1.5) continue;
          if (spur && spur.spuren === 3) {
            const a = this.breiteBei(s + t) / 6, e = this.breiteBei(s + t + 1) / 6;
            [-1, 1].forEach(vz => vierecke.push(this._band2(p, q, vz * a - w, vz * a + w, vz * e - w, vz * e + w, 0.08, 0xf0f0f0)));
          } else vierecke.push(this._band(p, q, -w, w, 0.08, 0xf0f0f0));
        }
      }
      const m = new THREE.Mesh(this._viereckeZuGeometrie(vierecke), this._material(undefined, 2));
      m.name = 'Mittellinie';
      return m;
    }

    _randBauen() {
      const pk = this.spline.punkte, N = pk.length, rb = this.randBreite;
      const vierecke = [];
      // Fantasie: Regenbogen-Randsteine (Thema regenbogen = Farbliste), in Kurven kräftig, auf Geraden heller
      const thema = (R.themes && R.themes[this.thema]) || {}, rb6 = thema.regenbogen;
      const hell = rb6 ? rb6.map(f => new THREE.Color(f).lerp(new THREE.Color(0xffffff), 0.45).getHex()) : null;
      for (let i = 0; i < N; i++) {
        const p = pk[i], q = pk[(i + 1) % N];
        if (this._gabelIdx(i)) continue;      // 14.10. (v18): Randsteine der Äste baut _gabelBauen
        // Kurve? (stärkste Krümmung in ±4 Punkten, damit die Steine nicht flackern)
        let k = 0;
        for (let j = -4; j <= 4; j++) k = Math.max(k, Math.abs(pk[(i + j + N) % N].kruemmung));
        const kurve = k > KERB_KRUEMMUNG;
        let farbe = kurve ? (i % 2 === 0 ? 0xd42a2a : 0xf4f4f4) : 0x8f9294;
        if (rb6) farbe = (kurve ? rb6 : hell)[i % rb6.length];
        const b = this._breiteGeo(i, p.s) / 2, bq = this._breiteGeo(i + 1, q.s) / 2;   // Runde 4: Breite je Stelle
        // W4-J: Randstein dort weglassen, wo die querende Fahrbahn (+ Rand) liegt – die Kreuzungsplatte deckt die Lücke
        const frei = (sg) => {
          if (!this.kreuzungen.length) return true;
          const m = b + rb / 2, x0 = p.x + p.nx * m * sg, z0 = p.z + p.nz * m * sg, x1 = q.x + q.nx * m * sg, z1 = q.z + q.nz * m * sg;
          return Math.min(this._querAbstand(p.s, x0, z0), this._querAbstand(q.s, x1, z1)) > b + rb + 0.3;
        };
        if (frei(-1)) vierecke.push(this._band2(p, q, -b - rb, -b, -bq - rb, -bq, 0.07, farbe));
        if (frei(1)) vierecke.push(this._band2(p, q, b, b + rb, bq, bq + rb, 0.07, farbe));
      }
      const m = new THREE.Mesh(this._viereckeZuGeometrie(vierecke), this._material(undefined, 1));
      m.name = 'Randsteine';
      return m;
    }

    _startZielBauen() {
      const sp = this.spline, b = this.breite / 2, vierecke = [];
      const feld = 1, reihen = 3, spalten = Math.round(this.breite / feld);
      for (let r = 0; r < reihen; r++) {
        const p = sp.punktBei(-reihen * feld / 2 + r * feld), q = sp.punktBei(-reihen * feld / 2 + (r + 1) * feld);
        for (let c = 0; c < spalten; c++) {
          const farbe = (r + c) % 2 === 0 ? 0x111111 : 0xf6f6f6;
          vierecke.push(this._band(p, q, -b + c * feld, -b + (c + 1) * feld, 0.1, farbe));
        }
      }
      // Startplätze: weiße Querbalken vor jeder Position
      const n = (R.config.rennen.gegnerMax || 5) + 1;
      this.startpositionen(n).forEach((st) => {
        const nah = sp.naechster(st.x, st.z);
        const s = nah.s, quer = nah.seitenabstand;
        const p = sp.punktBei(s + 2.6), q = sp.punktBei(s + 3.0);
        vierecke.push(this._band(p, q, quer - 1.3, quer + 1.3, 0.1, 0xf0f0f0));
      });
      const m = new THREE.Mesh(this._viereckeZuGeometrie(vierecke), this._material(undefined, 3));
      m.name = 'StartZiel';
      return m;
    }

    _startbogenBauen() {
      const g = new THREE.Group();
      g.name = 'Startbogen';
      const p = this.spline.punktBei(0);
      const weite = this.breite / 2 + this.randBreite + 1.2;
      const mastMat = new THREE.MeshLambertMaterial({ color: 0xdedede });
      const mastGeo = new THREE.BoxGeometry(0.5, 9, 0.5);     // v28 W7: 7 → 9 m, damit der höhere Balken (2,4 m) mit der Schrift Platz hat
      [-1, 1].forEach((seite) => {
        const x = p.x + p.nx * weite * seite, z = p.z + p.nz * weite * seite;
        const mast = new THREE.Mesh(mastGeo, mastMat);
        mast.position.set(x, this.hoeheAn(x, z) + 4.5, z);
        g.add(mast);
      });
      const bannerH = 2.4, bannerB = weite * 2 + 0.5;          // v28 W7: Balken 1,4 → 2,4 m hoch (Schrift „START · ZIEL" groß lesbar)
      const banner = new THREE.Mesh(new THREE.BoxGeometry(bannerB, bannerH, 0.3),
        new THREE.MeshLambertMaterial({ color: 0xe0352b }));
      banner.position.set(p.x, this.hoeheAn(p.x, p.z) + 7.4, p.z);
      banner.rotation.y = headingAus(p.tx, p.tz);
      g.add(banner);
      // STARTFEHLER: Lage des Banners für die Kamera (cameras.js _bogenAusweichen): Weit-/Verfolger-Ansicht flog sonst durch das Banner
      this.startbogen = { x: p.x, z: p.z, tx: p.tx, tz: p.tz, nx: p.nx, nz: p.nz, halb: weite, yUnten: banner.position.y - bannerH / 2, yOben: banner.position.y + bannerH / 2 };
      const schild = this._startZielSchild(bannerB, bannerH);
      if (schild) { schild.position.copy(banner.position); schild.rotation.y = banner.rotation.y; g.add(schild); }
      return g;
    }

    /**
     * v28 W7: Schrift auf dem Startbalken. EIN Mesh, EIN Material (MeshBasic, Canvas-Textur): zwei Vierecke (vorn + hinten) knapp
     * vor/hinter dem Balken. Vorderseite (blickt den Anfahrenden entgegen) „START · ZIEL", Rückseite „ZIEL"; weiß auf dunkel,
     * Schachbrett-Rand oben und unten. +1 Draw-Call je Strecke.
     */
    _startZielSchild(b, h) {
      if (typeof document === 'undefined') return null;      // Node-Tests ohne DOM: Balken bleibt rot ohne Schrift
      let tex;
      try {
        const cv = document.createElement('canvas');
        cv.width = 2048; cv.height = 1024;
        const c = cv.getContext('2d');
        if (!c) return null;
        const seite = (y0, text, schrift) => {
          const H = 512, rand = 56, feld = 28;
          c.fillStyle = '#14161c'; c.fillRect(0, y0, 2048, H);
          for (let r = 0; r < 2; r++) for (let i = 0; i < 2048 / feld; i++) {
            c.fillStyle = (i + r) % 2 ? '#f6f6f6' : '#111111';
            c.fillRect(i * feld, y0 + r * feld, feld, feld);
            c.fillRect(i * feld, y0 + H - (r + 1) * feld, feld, feld);
          }
          c.fillStyle = '#ffffff'; c.textAlign = 'center'; c.textBaseline = 'middle';
          c.font = '900 ' + schrift + 'px Arial, Helvetica, sans-serif';
          c.fillText(text, 1024, y0 + H / 2 + 8, 1900 - rand);
        };
        seite(0, 'START \u00b7 ZIEL', 300);      // obere Hälfte der Textur = Vorderseite
        seite(512, 'ZIEL', 330);                  // untere Hälfte = Rückseite
        tex = new THREE.CanvasTexture(cv);
        tex.anisotropy = 4;
        if (THREE.SRGBColorSpace !== undefined && 'colorSpace' in tex) tex.colorSpace = THREE.SRGBColorSpace;
        else if (THREE.sRGBEncoding !== undefined) tex.encoding = THREE.sRGBEncoding;
      } catch (e) { return null; }
      const x = b / 2, y = h / 2, z = 0.17;
      // Vorderseite: Normale +z (blickt gegen die Fahrtrichtung), Lesrichtung +x; Rückseite: Normale −z, x gespiegelt
      const pos = new Float32Array([
        -x, -y, z,  x, -y, z,  x, y, z,  -x, y, z,
         x, -y, -z, -x, -y, -z, -x, y, -z,  x, y, -z]);
      const uv = new Float32Array([
        0, 0.5,  1, 0.5,  1, 1,  0, 1,
        0, 0,    1, 0,    1, 0.5, 0, 0.5]);
      const nor = new Float32Array([0,0,1, 0,0,1, 0,0,1, 0,0,1, 0,0,-1, 0,0,-1, 0,0,-1, 0,0,-1]);
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
      geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
      geo.setIndex([0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7]);
      const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: tex }));
      m.name = 'StartZielSchild';
      return m;
    }
    /**
     * v14: Darf der Zaunpunkt an Bogenlänge s trotz „querende Fahrbahn näher“ stehen? n = nächste Stelle der Mittellinie
     * (Strecke gesamt) zum Zaunpunkt. Ja, wenn s nahe an einer Kreuzung liegt (± seitenabstandMax + 8 m), n zum QUERENDEN
     * Abschnitt gehört und der Punkt mehr als Fahrbahn + Rand + 0,9 m von dessen Mittellinie entfernt ist (Fahrbahn und
     * Randstein bleiben frei, 0,6 m Luft für die Pfosten). So entstehen Zaunstücke nur in den Zwickeln.
     */
    _kreuzungZaunOk(s, n) {
      const sp = this.spline, reichweite = this.seitenabstandMax + 8;
      for (const k of this.kreuzungen) {
        let sQuer = null;
        if (Math.abs(sp.differenzS(s, k.sA)) < reichweite) sQuer = k.sB;
        else if (Math.abs(sp.differenzS(s, k.sB)) < reichweite) sQuer = k.sA;
        if (sQuer === null) continue;
        if (Math.abs(sp.differenzS(n.s, sQuer)) < 60 && n.abstand > k.halbW + 0.6) return true;
      }
      return false;
    }

    /**
     * Zaunpunkte einer Seite (seite = +1 rechts, -1 links) bei seitenabstandMax.
     * Ein Punkt ist "gültig", wenn er wirklich zu seinem eigenen Streckenstück gehört:
     * Liegt ein anderes Streckenstück näher (Innenseite enger Kurven, nahe Geraden),
     * entfällt er – dort gibt es auch physikalisch keine Bande.
     * @returns {{x,y,z,ok:boolean}[]} je Abtastpunkt
     */
    zaunPunkte(seite) {
      const sp = this.spline, pk = sp.punkte;
      return pk.map((p) => {
        const g = this.grenzeBei(p.s), q = g * seite;     // vor Brücken/Tunneln trichterförmig enger
        const x = p.x + p.nx * q, z = p.z + p.nz * q;
        const n = sp.naechster(x, z);
        // Runde 5: nur, wenn der Punkt wirklich zu SEINEM Streckenstück gehört (dort hält die Bande genau hier);
        // vorher reichte „Abstand ≥ g − 1 m" → bis zu 1 m Zaun, hinter dem ein anderes Stück näher lag (keine Bande)
        let ok = n.abstand >= g - 0.05 && Math.abs(sp.differenzS(n.s, p.s)) < 6;
        if (ok && this.gabelungen.length && this.gabelNah(p.s, 1.5)) ok = false;   // 14.10. (v18): in der Gabelung hält die Ast-Bande (Leitplanken statt Zaun)
        if (ok && this.gabelungen.length) {   // 14.10. (v18): im Trichter vor/nach der Gabelung steigt die Bande steil – Zaun nur, wo sie 0,3 m dahinter noch hält
          const n2 = sp.naechster(p.x + p.nx * (g + 0.3) * seite, p.z + p.nz * (g + 0.3) * seite);
          if (!(Math.abs(n2.seitenabstand) > this.grenzeBei(n2.s))) ok = false;
        }
        // v14: an einer niveaugleichen Kreuzung steht der Zaun auch in den Zwickeln zwischen den Fahrbahnen (dort greift
        // die Bande des eigenen Abschnitts), nur nicht auf/an der querenden Fahrbahn – die bleibt frei
        let kz = false;
        if (!ok && this.kreuzungen.length && this._kreuzungZaunOk(p.s, n)) ok = kz = true;
        return { x, z, y: this.hoeheAn(x, z), ok, s: p.s, kz };
      });
    }

    /**
     * Zaun auf beiden Seiten: Pfosten alle 8 m (EIN InstancedMesh) und zwei
     * Querlatten als durchgehendes Band (EIN Mesh, beidseitig). = 2 Draw-Calls.
     * stil (aus dem Thema): { latten, pfosten (Farben), art: 'holz' | 'leitpfosten' }
     *   'leitpfosten' = weiße Pfosten mit schwarzem Kopf, ohne Latten (Wüste).
     * Auf der Brücke entfällt der Zaun – dort steht das Geländer.
     */
    _zaunBauen(stil) {
      const g = new THREE.Group();
      g.name = 'Zaun';
      const leit = stil.art === 'leitpfosten';
      const PFOSTEN_ALLE = Math.max(1, Math.round((leit ? 10 : 8) / this.spline.ds));
      const LATTEN = leit ? [] : [{ h: 0.45, d: 0.16 }, { h: 0.95, d: 0.16 }];   // Höhe Mitte, Dicke
      const pfosten = [], pos = [];
      [-1, 1].forEach((seite) => {
        const zp = this.zaunPunkte(seite), N = zp.length;
        // Auf Brücken steht das Geländer, im Tunnel die Wand, an engen Spur-Stellen die Leitplanke
        zp.forEach((a) => {
          if (this._engstellen.some(b => this._inBereich(b, a.s, 1.5))) a.ok = false;
          if (this._spurEng.some(e => this._aussen(e, a.s) < SPUR_UEBERGANG + 1.5)) a.ok = false;
          if (this.gabelungen.length && this.gabelNah(a.s, 1.5)) a.ok = false;    // 14.10. (v18): an der Gabelung stehen Leitplanken
        });
        for (let i = 0; i < N; i++) {
          const a = zp[i], b = zp[(i + 1) % N];
          if (a.ok && (i % PFOSTEN_ALLE === 0 || (a.kz && (!zp[(i + N - 1) % N].ok || !b.ok)))) pfosten.push(a);   // v14: Zwickelstücke an beiden Enden mit Pfosten
          if (!a.ok || !b.ok) continue;
          if (Math.hypot(b.x - a.x, b.z - a.z) > 8) continue;   // Sprung (Schleife) – auslassen
          for (const l of LATTEN) {
            const u0 = l.h - l.d / 2, u1 = l.h + l.d / 2;
            pos.push(a.x, a.y + u0, a.z, b.x, b.y + u0, b.z, b.x, b.y + u1, b.z,
                     a.x, a.y + u0, a.z, b.x, b.y + u1, b.z, a.x, a.y + u1, a.z);
          }
        }
      });
      // Latten
      const lattenGeo = new THREE.BufferGeometry();
      lattenGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
      lattenGeo.computeVertexNormals();
      if (pos.length) {
        const latten = new THREE.Mesh(lattenGeo, new THREE.MeshLambertMaterial({ color: stil.latten || 0x9a6a3c, side: THREE.DoubleSide }));
        latten.name = 'Zaunlatten';
        g.add(latten);
      }
      // Pfosten (Leitpfosten: 8 Höhen-Segmente, oberstes Stück schwarz mit oranger Reflektor-Linie)
      const pfGeo = leit ? new THREE.BoxGeometry(0.22, 1.1, 0.22, 1, 11, 1) : new THREE.BoxGeometry(0.18, 1.3, 0.18);
      pfGeo.translate(0, leit ? 0.5 : 0.55, 0);
      let pfMat;
      if (leit) {
        const pp = pfGeo.attributes.position, farben = new Float32Array(pp.count * 3), c = new THREE.Color();
        for (let i = 0; i < pp.count; i++) {
          const y = pp.getY(i);
          c.setHex(y > 0.84 ? 0x1c1c1c : y > 0.74 ? 0xff8a1f : stil.pfosten || 0xf2efe6);
          farben.set([c.r, c.g, c.b], i * 3);
        }
        pfGeo.setAttribute('color', new THREE.BufferAttribute(farben, 3));
        pfMat = new THREE.MeshLambertMaterial({ vertexColors: true });
      } else {
        pfMat = new THREE.MeshLambertMaterial({ color: stil.pfosten || 0x6e4a2a });
      }
      const pf = new THREE.InstancedMesh(pfGeo, pfMat, Math.max(1, pfosten.length));
      const m = new THREE.Matrix4();
      pfosten.forEach((p, i) => { m.makeTranslation(p.x, p.y, p.z); pf.setMatrixAt(i, m); });
      pf.count = pfosten.length;
      pf.instanceMatrix.needsUpdate = true;
      pf.name = 'Zaunpfosten';
      g.add(pf);
      this.zaunInfo = { pfosten: pfosten.length, lattenStuecke: pos.length / 36 };
      return g;
    }

    /**
     * Runde 4: Leitplanken an engen Spur-Abschnitten (1 Spur), beidseitig genau an der Bande (grenzeBei),
     * über Abschnitt + Übergang: verzinktes Band (0,45–0,8 m) + Pfosten alle 4 m. Ein Mesh (Vertex-Farben).
     */
    _leitplankenBauen() {
      const v = [], sp = this.spline;
      for (const e of this._spurEng) {
        const a = e.s0 - SPUR_UEBERGANG, laenge = sp.differenzS(e.s1, e.s0) + 2 * SPUR_UEBERGANG;
        const n = Math.max(4, Math.round(laenge / 2));
        [-1, 1].forEach((sg) => {
          for (let k = 0; k < n; k++) {
            const s0 = a + laenge * k / n, s1 = a + laenge * (k + 1) / n;
            const q0 = sg * (this.grenzeBei(s0) - 0.15), q1 = sg * (this.grenzeBei(s1) - 0.15);
            const p0 = this._punktSQ(s0, q0, 0), p1 = this._punktSQ(s1, q1, 0);
            const wand = (u0, u1, farbe) => ({ a: [p0[0], p0[1] + u0, p0[2]], b: [p1[0], p1[1] + u0, p1[2]],
              c: [p1[0], p1[1] + u1, p1[2]], d: [p0[0], p0[1] + u1, p0[2]], farbe });
            v.push(wand(0.45, 0.62, 0xc9ced3), wand(0.62, 0.8, 0xaeb4ba));
            if (k % 2 === 0) {
              const pp = sp.punktBei(s0);
              this._kiste(v, p0[0], p0[2], pp.tx, pp.tz, 0.06, 0.06, p0[1] - 0.2, p0[1] + 0.85, 0x6f757b);
            }
          }
        });
      }
      const mesh = new THREE.Mesh(this._viereckeZuGeometrie(v),
        new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }));
      mesh.name = 'Leitplanken';
      return mesh;
    }

    // ---------------------------------------------------------- Gabelung: Grafik (14.10., v18)

    /** Breite für die Grafik am Abtastpunkt i: an den Gabel-Grenzpunkten (ia, ib) die volle Straße (breiteBei liefert dort eine Astbreite). */
    _breiteGeo(i, s) {
      const N = this.spline.punkte.length;
      for (let k = 0; k < this.gabelungen.length; k++) { const g = this.gabelungen[k]; if (i % N === g.ia || i % N === g.ib) return this.breite; }
      return this.breiteBei(s);
    }

    /** Liegt das Straßenband-Segment i → i+1 im Gabel-Abschnitt? (ia ≤ i < ib) */
    _gabelIdx(i) {
      for (let k = 0; k < this.gabelungen.length; k++) { const g = this.gabelungen[k]; if (i >= g.ia && i < g.ib) return g; }
      return null;
    }

    /**
     * Gabelung bauen: Mesh „Gabelung“ (zwei Asphalt-Bänder, Randsteine, Inselrasen; Vertex-Farben) und Mesh „Gabeldeko“ (Leitplanken an
     * den Außen- und Inselkanten, Pfeilschild + Prallkissen an der Y-Spitze, Inseldeko themengerecht) = 2 Draw-Calls je Strecke.
     * Positionen/Zufall deterministisch (Seed aus Strecken-ID + Variante), also auf Server und Browser gleich.
     */
    _gabelBauen(thema) {
      const sp = this.spline, pk = sp.punkte, N = pk.length, rb = this.randBreite;
      const wueste = this.thema === 'wueste';
      const asphalt = thema.asphalt || 0x3c3f45, rasen = wueste ? 0xe9d3a0 : this.thema === 'dino' ? 0x4c8a2e : 0x78b94a;   // 15.10. (v25): Dino = Urwald-Grün
      const strasse = [], deko = [];
      const c = new THREE.Color();
      const gruppe = [];
      for (const g of this.gabelungen) {
        // ---- Bänder: je Abtastpunkt-Paar
        for (let i = g.ia; i < g.ib; i++) {
          const p = pk[i], q = pk[(i + 1) % N], w0 = this.gabelBei(p.s), w1 = this.gabelBei(q.s);
          let k = 0;
          for (let j = -4; j <= 4; j++) k = Math.max(k, Math.abs(pk[(i + j + N) % N].kruemmung));
          const kurve = k > KERB_KRUEMMUNG, kerb = kurve ? (i % 2 === 0 ? 0xd42a2a : 0xf4f4f4) : 0x8f9294;
          const f = 1 + 0.05 * Math.sin(i * 0.9) * Math.sin(i * 0.23);
          const asph = c.setHex(asphalt).multiplyScalar(f).getHex();
          const gap0 = w0.c - w0.h, gap1 = w1.c - w1.h;           // halber Abstand zwischen den Innenkanten
          const r0 = Math.min(rb, gap0), r1 = Math.min(rb, gap1);   // innerer Randstein: an der Y-Spitze schmal
          strasse.push(this._band2(p, q, -gap0, gap0, -gap1, gap1, 0.03, rasen));
          [-1, 1].forEach((sg) => {
            const a0 = sg * w0.c - w0.h, b0 = sg * w0.c + w0.h, a1 = sg * w1.c - w1.h, b1 = sg * w1.c + w1.h;
            strasse.push(this._band2(p, q, a0, b0, a1, b1, 0.06, asph));
            // äußerer Randstein
            if (sg > 0) strasse.push(this._band2(p, q, b0, b0 + rb, b1, b1 + rb, 0.07, kerb));
            else strasse.push(this._band2(p, q, a0 - rb, a0, a1 - rb, a1, 0.07, kerb));
            // innerer Randstein (zur Insel hin)
            if (r0 > 0.02 || r1 > 0.02) {
              if (sg > 0) strasse.push(this._band2(p, q, a0 - r0, a0, a1 - r1, a1, 0.07, kerb));
              else strasse.push(this._band2(p, q, b0, b0 + r0, b1, b1 + r1, 0.07, kerb));
            }
          });
        }
        // ---- Leitplanken: außen immer, innen ab dem Punkt, an dem die Bande der Inselkante hinter der Mittellinie liegt
        const RAIL = 0.25, SCHRITT = 2;
        const schiene = (sg, innen) => {
          const qAt = (s) => {
            const w = this.gabelBei(s);
            return innen ? sg * (w.c - w.h - rb - RAIL) : sg * (w.c + w.h + rb + RAIL);
          };
          const gueltig = (s) => !innen || Math.abs(qAt(s)) >= 0.45 && qAt(s) * sg > 0;
          let letzter = null, kn = 0;
          for (let s = g.s0; s <= g.s1 + 1e-6; s += SCHRITT, kn++) {
            const sa = Math.min(s, g.s1);
            if (!gueltig(sa)) { letzter = null; continue; }
            const q1 = qAt(sa), P1 = this._punktSQ(sa, q1, 0);
            if (letzter) {
              const P0 = letzter.P, wand = (u0, u1, farbe) => ({ a: [P0[0], P0[1] + u0, P0[2]], b: [P1[0], P1[1] + u0, P1[2]],
                c: [P1[0], P1[1] + u1, P1[2]], d: [P0[0], P0[1] + u1, P0[2]], farbe });
              deko.push(wand(0.45, 0.62, 0xc9ced3), wand(0.62, 0.8, 0xaeb4ba));
            }
            if (kn % 2 === 0 || !letzter) {
              const pp = sp.punktBei(sa);
              this._kiste(deko, P1[0], P1[2], pp.tx, pp.tz, 0.06, 0.06, P1[1] - 0.2, P1[1] + 0.85, 0x6f757b);
            }
            letzter = { P: P1 };
          }
        };
        [-1, 1].forEach((sg) => { schiene(sg, false); schiene(sg, true); });
        // ---- Y-Spitzen: Prallkissen (orange-weiß) an Teilung und Zusammenführung, Pfeilschild vor der Teilung auf der Insel
        const spitzeS = (richtung) => {     // erster/letzter s mit Inselhalbbreite ≥ 1,6 m
          if (richtung > 0) { for (let s = g.s0; s <= g.s1; s += 0.5) { const w = this.gabelBei(s); if (w.c - w.h >= 1.6) return s; } }
          else { for (let s = g.s1; s >= g.s0; s -= 0.5) { const w = this.gabelBei(s); if (w.c - w.h >= 1.6) return s; } }
          return null;
        };
        const sA = spitzeS(1), sB = spitzeS(-1);
        const kissen = (s0, richtung) => {
          for (let k = 0; k < 4; k++) {
            const s = s0 + richtung * (k + 0.5) * 0.9, pp = sp.punktBei(s), P = this._punktSQ(s, 0, 0);
            this._kiste(deko, P[0], P[2], pp.tx, pp.tz, 0.45, 0.5, P[1], P[1] + 0.8 - k * 0.0, k % 2 === 0 ? 0xf0861e : 0xf4f4f4);
          }
        };
        if (sA !== null) kissen(sA, 1);
        if (sB !== null) kissen(sB, -1);
        if (sA !== null) this._pfeilschild(deko, sA + 6);
        // 15.10. (v25): Ankündigung der Gabelung – Schilderbrücke ⬅ ➡ über der ganzen Straße 55 m vor der Teilung, Vorwarn-Tafeln an beiden
        // Straßenseiten 130 m davor (nur Grafik, keine Kollision; liegt vor dem Abschnitt, also im Deko-Sperrstreifen von 30 m + Zaunabstand)
        this._schilderbruecke(deko, g.s0 - 55);
        [-1, 1].forEach((sg) => this._vorwarnTafel(deko, g.s0 - 130, sg));
        // ---- Inseldeko
        this._inselDeko(deko, g, wueste);
        gruppe.push(g);
      }
      const meshS = new THREE.Mesh(this._viereckeZuGeometrie(strasse), this._material(undefined, 1));
      meshS.name = 'Gabelung';
      const meshD = new THREE.Mesh(this._viereckeZuGeometrie(deko), new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }));
      meshD.name = 'Gabeldeko';
      return [meshS, meshD];
    }

    /**
     * Pfeilschild (blau, weißer Rahmen, ⬅ und ➡ nebeneinander) auf der Insel bei s, Vorderseite zum Verkehr (gegen die Fahrtrichtung).
     * 15.10. (v25): größer als vorher (Tafel 2,6 × 1,6 m statt 1,24 × 0,9 m) und mit waagerechten Pfeilen ⬅ ➡, damit man es schon von weitem sieht.
     */
    _pfeilschild(v, s) {
      const pp = this.spline.punktBei(s), P = this._punktSQ(s, 0, 0);
      this._kiste(v, P[0], P[2], pp.tx, pp.tz, 0.06, 0.06, P[1] - 0.1, P[1] + 3.15, 0x8a8f95);          // Pfosten
      this._kiste(v, P[0], P[2], pp.tx, pp.tz, 0.035, 1.3, P[1] + 1.5, P[1] + 3.1, 0x1d4fb0);           // Tafel
      this._schildPfeile(v, P, pp, 1.3, 1.5, 3.1);
    }

    /**
     * Weißer Rahmen + zwei große waagerechte Pfeile (⬅ links, ➡ rechts) + Mittelstrich auf der Vorderseite einer blauen Tafel
     * (Mitte P, Halbbreite W, Höhen H0..H1 über P; Tafel selbst baut der Aufrufer mit _kiste, Halbdicke 0,035).
     */
    _schildPfeile(v, P, pp, W, H0, H1) {
      const tx = pp.tx, tz = pp.tz, nx = pp.nx, nz = pp.nz, d = 0.07, k = H1 - H0, f = 0.03 + 0.03 * k;
      const pkt = (u, w) => [P[0] + nx * u - tx * d, P[1] + w, P[2] + nz * u - tz * d];
      const quad = (u0, w0, u1, w1) => v.push({ a: pkt(u0, w0), b: pkt(u1, w0), c: pkt(u1, w1), d: pkt(u0, w1), farbe: 0xffffff });
      quad(-W + f * 0.5, H0 + f * 0.5, W - f * 0.5, H0 + 1.5 * f); quad(-W + f * 0.5, H1 - 1.5 * f, W - f * 0.5, H1 - f * 0.5);   // Rahmen unten/oben
      quad(-W + f * 0.5, H0 + f * 0.5, -W + 1.5 * f, H1 - f * 0.5); quad(W - 1.5 * f, H0 + f * 0.5, W - f * 0.5, H1 - f * 0.5);   // links/rechts
      quad(-f * 0.4, H0 + 1.5 * f, f * 0.4, H1 - 1.5 * f);                                                                      // Mittelstrich
      const wm = (H0 + H1) / 2, halb = W / 2, len = 0.8 * halb, hl = 0.36 * len, sh = 0.085 * k, hh = 0.27 * k;
      [-1, 1].forEach((sg) => {            // sg −1 = Pfeil nach links (u < 0), +1 = nach rechts
        const uc = sg * halb, tip = uc + sg * len / 2, tail = uc - sg * len / 2, base = tip - sg * hl;
        quad(Math.min(tail, base), wm - sh, Math.max(tail, base), wm + sh);                                                     // Schaft
        v.push({ a: pkt(base, wm + hh), b: pkt(base, wm - hh), c: pkt(tip, wm), d: pkt(tip, wm), farbe: 0xffffff });            // Spitze
      });
    }

    /** 15.10. (v25): Schilderbrücke ⬅ ➡ über der ganzen Straße bei s (zwei Pfosten außerhalb des Randsteins, Querträger, große blaue Tafel). */
    _schilderbruecke(v, s) {
      const pp = this.spline.punktBei(s), halb = this.breite / 2 + this.randBreite + 1.3;
      const L = this._punktSQ(s, -halb, 0), Rr = this._punktSQ(s, halb, 0), M = this._punktSQ(s, 0, 0);
      const yTraeger = Math.max(L[1], Rr[1], M[1]) + 6.6, W = halb - 0.9, H0 = 3.9, H1 = 6.5;
      [L, Rr].forEach((P) => this._kiste(v, P[0], P[2], pp.tx, pp.tz, 0.2, 0.2, P[1] - 0.4, yTraeger + 0.3, 0x8a8f95));          // Pfosten
      this._kiste(v, M[0], M[2], pp.tx, pp.tz, 0.16, halb + 0.2, yTraeger - 0.2, yTraeger + 0.3, 0x7a8086);                      // Querträger
      const hb = Math.max(M[1], L[1], Rr[1]);
      this._kiste(v, M[0], M[2], pp.tx, pp.tz, 0.035, W, hb + H0, hb + H1, 0x1d4fb0);                                           // Tafel
      this._schildPfeile(v, [M[0], hb, M[2]], pp, W, H0, H1);
    }

    /** 15.10. (v25): Vorwarn-Tafel am Straßenrand (Seite sg = −1 links / +1 rechts) bei s: kleine blaue Tafel ⬅ ➡ auf zwei Pfosten. */
    _vorwarnTafel(v, s, sg) {
      const pp = this.spline.punktBei(s), q = sg * (this.breite / 2 + this.randBreite + 1.8), P = this._punktSQ(s, q, 0);
      this._kiste(v, P[0], P[2], pp.tx, pp.tz, 0.06, 0.06, P[1] - 0.1, P[1] + 3.0, 0x8a8f95);
      this._kiste(v, P[0], P[2], pp.tx, pp.tz, 0.035, 1.5, P[1] + 1.4, P[1] + 3.0, 0x1d4fb0);
      this._schildPfeile(v, P, pp, 1.5, 1.4, 3.0);
    }

    /** Inseldeko: Wiese = Bäume, Büsche, Blumen, Steine · Wüste = Kakteen, Felsen, Gestrüpp, Sandhügel. Als Vierecke in v (Lambert, Vertex-Farben). */
    _inselDeko(v, g, wueste) {
      const sp = this.spline, rb = this.randBreite;
      const rnd = zufallsFolge(textSeed([this.id, this.variante || '', 'gabel', g.nr].join('|')));
      const boden = (x, z) => this.hoeheAn(x, z);
      // Kleine Bausteine als Vierecke: Prisma (n Ecken), Kegel, Kugel (grob). Mitte (x, y unten, z).
      const ring = (x, y, z, r, n, ph) => Array.from({ length: n }, (_, k) => [x + Math.cos(ph + 2 * Math.PI * k / n) * r, y, z + Math.sin(ph + 2 * Math.PI * k / n) * r]);
      const prisma = (x, y, z, r0, r1, h, n, farbe, ph) => {       // Zylinder/Kegelstumpf
        const a = ring(x, y, z, r0, n, ph || 0), b = ring(x, y + h, z, r1, n, ph || 0);
        for (let k = 0; k < n; k++) { const j = (k + 1) % n; v.push({ a: a[k], b: a[j], c: b[j], d: b[k], farbe }); }
        if (r1 > 0.01) { for (let k = 1; k < n - 1; k++) v.push({ a: b[0], b: b[k], c: b[k + 1], d: b[k + 1], farbe }); }
      };
      const kugel = (x, y, z, r, farbe, platt) => {                  // Ikosaeder-artige Kugel: 3 Ringe
        const hy = r * (platt || 1), r1 = r * 0.92;
        const n = 7, ph = rnd() * 6.28, a = ring(x, y, z, r1 * 0.72, n, ph), b = ring(x, y + hy * 0.7, z, r1, n, ph + 0.4), c2 = ring(x, y + hy * 1.4, z, r1 * 0.72, n, ph);
        const m = [x, y + hy * 2.0, z], u = [x, y - hy * 0.1, z];
        for (let k = 0; k < n; k++) {
          const j = (k + 1) % n;
          v.push({ a: a[k], b: a[j], c: b[j], d: b[k], farbe }, { a: b[k], b: b[j], c: c2[j], d: c2[k], farbe },
            { a: c2[k], b: c2[j], c: m, d: m, farbe }, { a: u, b: u, c: a[j], d: a[k], farbe });
        }
      };
      const mischen = (hex, f) => { const col = new THREE.Color(hex); col.multiplyScalar(f); return col.getHex(); };
      // Platz: Insel zwischen den inneren Leitplanken. s-Raster mit zufälligem Versatz, Abstand zu den Rändern der Insel.
      const stellen = (abst, rMax, f) => {
        let s = g.s0 + g.P * 0.55;
        const erg = [];
        const bis = g.s1 - g.P * 0.55;
        for (let durchlauf = 0; s < bis && durchlauf < 5000; durchlauf++) {     // v26b: harte Obergrenze (abst ≤ 0 / NaN → sonst Endlosschleife)
          const w = this.gabelBei(s), frei = (w.c - w.h) - rb - 0.25 - 0.45;     // halbe freie Inselbreite (bis zur Leitplanke)
          const r = rMax * (0.7 + 0.5 * rnd());
          if (frei > r + 0.5) {
            const lat = (rnd() * 2 - 1) * (frei - r - 0.3), p = sp.punktBei(s);
            erg.push({ x: p.x + p.nx * lat, z: p.z + p.nz * lat, r, f: f ? f(rnd) : 0 });
          }
          s += abst * (0.7 + 0.6 * rnd());
        }
        return erg;
      };
      if (this.thema === 'dino') {
        // 15.10. (v25) Dino-Insel: Palmen, Riesenfarne, Farnbüsche, Vulkanfelsen, ein paar Knochen
        stellen(12, 1.5).forEach((o) => {            // Palmen: schräger Stamm, 6 hängende Wedel
          const y = boden(o.x, o.z), h = 3.2 + rnd() * 1.6, neig = (rnd() - 0.5) * 0.5, ph = rnd() * 6.28;
          prisma(o.x, y - 0.1, o.z, 0.2, 0.13, h, 6, 0x7a5c38, ph);
          const kx = o.x + neig * h * 0.5, kz = o.z + (rnd() - 0.5) * 0.3, ky = y + h - 0.1;
          for (let k = 0; k < 6; k++) {
            const w = ph + k * Math.PI / 3, ex = kx + Math.cos(w) * 1.9, ez = kz + Math.sin(w) * 1.9, px = -Math.sin(w) * 0.32, pz = Math.cos(w) * 0.32;
            const wf = mischen(0x3f8f35, 0.8 + 0.35 * rnd());
            v.push({ a: [kx + px * 0.5, ky + 0.15, kz + pz * 0.5], b: [kx - px * 0.5, ky + 0.15, kz - pz * 0.5], c: [ex - px, ky - 0.85, ez - pz], d: [ex + px, ky - 0.85, ez + pz], farbe: wf });
          }
        });
        stellen(7, 1.0).forEach((o) => {             // Farnbüsche: 7 flache Wedel um einen Punkt
          const y = boden(o.x, o.z) + 0.05, ph = rnd() * 6.28, wf = mischen(0x3e7a2c, 0.85 + 0.3 * rnd());
          for (let k = 0; k < 7; k++) {
            const w = ph + k * 2 * Math.PI / 7, ex = o.x + Math.cos(w) * (0.9 + o.r * 0.6), ez = o.z + Math.sin(w) * (0.9 + o.r * 0.6), px = -Math.sin(w) * 0.16, pz = Math.cos(w) * 0.16;
            v.push({ a: [o.x + px, y + 0.35, o.z + pz], b: [o.x - px, y + 0.35, o.z - pz], c: [ex - px, y + 0.05, ez - pz], d: [ex + px, y + 0.05, ez + pz], farbe: wf });
          }
        });
        stellen(16, 0.9).forEach((o) => { kugel(o.x, boden(o.x, o.z) - 0.15, o.z, 0.6 + o.r * 0.7, mischen(0x4a4540, 0.8 + 0.4 * rnd()), 0.75); });   // Vulkanfelsen
        stellen(34, 0.5).forEach((o) => { prisma(o.x, boden(o.x, o.z) - 0.05, o.z, 0.08, 0.1, 0.9 + rnd() * 0.5, 5, 0xe9e2cc, rnd() * 3); });         // Knochen (aufrecht)
      } else if (!wueste) {
        stellen(11, 1.7).forEach((o) => {            // Bäume (Eichen/Birken gemischt)
          const y = boden(o.x, o.z), birke = rnd() < 0.3, h = (birke ? 3.0 : 2.3) + rnd() * 1.1;
          prisma(o.x, y - 0.1, o.z, 0.2, 0.15, h, 6, birke ? 0xd8d2c4 : 0x6b4a2b, rnd() * 3);
          kugel(o.x, y + h - 0.5, o.z, o.r * (birke ? 0.85 : 1.1), mischen(birke ? 0x8fc95a : 0x3f8f35, 0.85 + 0.3 * rnd()), 1.15);
          if (o.r > 1.4) kugel(o.x + 0.5, y + h - 0.1, o.z - 0.3, o.r * 0.6, mischen(0x4ea040, 0.9 + 0.2 * rnd()), 1.0);
        });
        stellen(6, 0.8).forEach((o) => { kugel(o.x, boden(o.x, o.z) - 0.05, o.z, o.r, mischen(0x2f7a2c, 0.85 + 0.3 * rnd()), 0.8); });   // Büsche
        const blume = [0xffd23a, 0xff5a8a, 0xffffff, 0xff8a2a, 0x9a6bff];
        stellen(4.5, 1.0).forEach((o) => {           // Blumeninseln: je 6 kleine Blüten
          const farbe = blume[Math.floor(rnd() * blume.length)];
          for (let k = 0; k < 6; k++) {
            const x = o.x + (rnd() - 0.5) * 1.6, z = o.z + (rnd() - 0.5) * 1.6, y = boden(x, z);
            prisma(x, y, z, 0.02, 0.02, 0.28, 3, 0x3f8f35, 0);
            kugel(x, y + 0.26, z, 0.1, farbe, 0.6);
          }
        });
        stellen(14, 0.7).forEach((o) => { kugel(o.x, boden(o.x, o.z) - 0.1, o.z, 0.5 + o.r * 0.5, 0x9a9a96, 0.7); });   // Steine
      } else {
        stellen(13, 1.0).forEach((o) => {            // Saguaro-Kakteen
          const y = boden(o.x, o.z), h = 3.0 + rnd() * 1.8, cg = mischen(0x3f8a45, 0.85 + 0.3 * rnd());
          prisma(o.x, y - 0.1, o.z, 0.3, 0.26, h, 7, cg, 0);
          kugel(o.x, y + h - 0.2, o.z, 0.27, cg, 0.9);
          const arme = 1 + Math.floor(rnd() * 2);
          for (let k = 0; k < arme; k++) {
            const sg = k === 0 ? 1 : -1, ah = 0.9 + rnd() * 0.7, yy = y + 1.0 + rnd() * (h - 2.3);
            prisma(o.x + sg * 0.62, yy + 0.35, o.z, 0.17, 0.15, ah, 6, cg, 0);
            prisma(o.x + sg * 0.3, yy, o.z, 0.15, 0.15, 0.4, 6, cg, 0);
          }
        });
        stellen(6, 0.5).forEach((o) => {             // Kugelkakteen mit Blüte
          const y = boden(o.x, o.z);
          kugel(o.x, y - 0.05, o.z, 0.4 + 0.2 * rnd(), mischen(0x4a9a52, 0.9 + 0.2 * rnd()), 0.9);
          kugel(o.x, y + 0.72, o.z, 0.1, 0xff6a9a, 0.6);
        });
        stellen(9, 1.3).forEach((o) => { kugel(o.x, boden(o.x, o.z) - 0.2, o.z, o.r, mischen(0xb08a55, 0.85 + 0.3 * rnd()), 0.65); });   // Felsen
        stellen(5, 0.8).forEach((o) => {             // trockenes Gestrüpp
          const y = boden(o.x, o.z);
          for (let k = 0; k < 4; k++) prisma(o.x + (rnd() - 0.5) * 0.7, y, o.z + (rnd() - 0.5) * 0.7, 0.04, 0.02, 0.5 + rnd() * 0.5, 4, 0x8a6a3a, rnd());
        });
        stellen(24, 2.2).forEach((o) => { kugel(o.x, boden(o.x, o.z) - 0.25, o.z, o.r, 0xe2c27a, 0.28); });   // flache Sandhügel
      }
    }

    /**
     * Minimap (hud.js ruft es nach dem Zeichnen der Straße auf): im Gabel-Abschnitt wird die Mittellinie ausgeschnitten und es werden zwei
     * Äste gezeichnet. Weil 2·11 m bei ~0,12 Pixel/m nur ≈ 3 Pixel wären, laufen die Äste in der Karte übertrieben auseinander (≈ ±4 Pixel).
     */
    gabelMinimap(g, nachPx, mass, dpr, breite) {
      const sp = this.spline;
      for (const gb of this.gabelungen) {
        const bahn = (versatzPx, sg) => {
          g.beginPath();
          for (let s = gb.s0 - 6; s <= gb.s1 + 6 + 1e-6; s += 3) {
            const w = this.gabelBei(Math.max(gb.s0, Math.min(gb.s1, s))), t = w ? w.t : 0, p = sp.punktBei(s);
            const dq = sg * (versatzPx * (0.35 + 0.65 * t)) / mass;
            const [x, y] = nachPx(p.x + p.nx * dq, p.z + p.nz * dq);
            if (s <= gb.s0 - 6 + 1e-6) g.moveTo(x, y); else g.lineTo(x, y);
          }
        };
        const bahnBreite = Math.max(2.6 * dpr, breite * 0.55);
        g.save();
        g.lineJoin = g.lineCap = 'butt';
        g.globalCompositeOperation = 'destination-out';          // Mittellinie samt hellem Rand ausschneiden
        bahn(0, 0); g.lineWidth = breite + 5 * dpr; g.stroke();
        g.globalCompositeOperation = 'source-over';
        const V = 4.6 * dpr;
        [-1, 1].forEach((sg) => { bahn(V, sg); g.strokeStyle = 'rgba(255,255,255,0.9)'; g.lineWidth = bahnBreite + 2.6 * dpr; g.stroke(); });
        [-1, 1].forEach((sg) => { bahn(V, sg); g.strokeStyle = '#3a3f4a'; g.lineWidth = bahnBreite; g.stroke(); });
        g.restore();
      }
    }

    // ---------------------------------------------------------- Brücken, Senken, Tunnel

    /** Weltpunkt bei Bogenlänge s, quer q, Höhe = Straße an dieser Stelle + dy. */
    _punktSQ(s, q, dy) {
      const p = this.spline.punktBei(s);
      return this._seitPunkt(p, q, dy || 0);
    }

    /** Senkrechte Fläche zwischen (s0,q0) und (s1,q1), Höhen relativ zur Straße (u0 unten, u1 oben). */
    _wandSQ(s0, q0, s1, q1, u0, u1, farbe) {
      const a = this._punktSQ(s0, q0, 0), c = this._punktSQ(s1, q1, 0);
      return { a: [a[0], a[1] + u0, a[2]], b: [c[0], c[1] + u0, c[2]], c: [c[0], c[1] + u1, c[2]], d: [a[0], a[1] + u1, a[2]], farbe };
    }

    /**
     * Quader (z. B. Brückenpfeiler) von yUnten bis yOben (absolut), Mitte (x, z),
     * halbe Kanten hl längs (tx, tz) und hq quer (nx, nz). Ohne Boden.
     */
    _kiste(v, x, z, tx, tz, hl, hq, yUnten, yOben, farbe) {
      const nx = -tz, nz = tx;
      const e = (sl, sq, y) => [x + tx * hl * sl + nx * hq * sq, y, z + tz * hl * sl + nz * hq * sq];
      const ecken = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
      for (let i = 0; i < 4; i++) {
        const [a1, b1] = ecken[i], [a2, b2] = ecken[(i + 1) % 4];
        v.push({ a: e(a1, b1, yUnten), b: e(a2, b2, yUnten), c: e(a2, b2, yOben), d: e(a1, b1, yOben), farbe });
      }
      v.push({ a: e(-1, -1, yOben), b: e(1, -1, yOben), c: e(1, 1, yOben), d: e(-1, 1, yOben), farbe });
    }

    /**
     * Feine Senke unter einer Brücke (2-m-Raster, Bodenhöhe exakt aus bodenHoehe): Böschung, Grund,
     * Schlucht-Schichten in der Wüste. Das grobe Bodengitter liegt hier tiefer (senkeTiefe grob).
     */
    _senkeBauen(b, thema) {
      const m = b.m, RAND = 6 + 18;              // GROB_RAND + eine Zelle des groben Gitters (16 m) + Zugabe
      const L = b.halb + RAND, Q = b.q1 + RAND, ST = 2;
      const nl = Math.ceil(2 * L / ST), nq = Math.ceil(2 * Q / ST);
      const pos = new Float32Array((nl + 1) * (nq + 1) * 3), col = new Float32Array(pos.length);
      const basis = new THREE.Color(thema.boden !== undefined ? thema.boden : 0x5f9e3a);
      const zweite = new THREE.Color(thema.boden2 !== undefined ? thema.boden2 : basis.getHex());
      const c = new THREE.Color(), erde = new THREE.Color(b.art === 'stahl' ? 0xa65a34 : b.art === 'stamm' ? 0x4d4128 : 0x6b5a3a);
      const schicht = new THREE.Color(0xc98a52), grund = new THREE.Color(b.art === 'stahl' ? 0x9c6a44 : b.art === 'stamm' ? 0x3f4a24 : 0x4f7a34);
      let o = 0;
      for (let i = 0; i <= nl; i++) {
        for (let j = 0; j <= nq; j++) {
          const l = -L + 2 * L * i / nl, q = -Q + 2 * Q * j / nq;
          const x = m.x + m.tx * l + m.nx * q, z = m.z + m.tz * l + m.nz * q;
          const t = this.senkeTiefe(x, z), y = this.hoeheAn(x, z) - t;
          pos[o] = x; pos[o + 1] = y; pos[o + 2] = z;
          this._bodenFarbe(x, z, basis, zweite, thema.boden2 !== undefined, c);
          const anteil = t / b.tiefe;                     // 0 oben … 1 Grund
          if (anteil > 0.02) {
            if (b.art === 'stahl') {
              // Schlucht: rote Felswände mit hellen Gesteinsschichten, sandiger Grund
              const lage = 0.5 + 0.5 * Math.sin(t * 2.3 + Math.sin(x * 0.05) * 0.8);
              c.lerp(erde, Math.min(1, anteil * 2.2)).lerp(schicht, lage * 0.45 * Math.min(1, anteil * 3));
              if (anteil > 0.93) c.lerp(grund, 0.6);
            } else {
              c.lerp(erde, Math.min(0.75, anteil * 1.6) * (anteil < 0.9 ? 1 : 0.4));
              if (anteil > 0.9) c.lerp(grund, 0.5);
            }
          }
          col[o] = c.r; col[o + 1] = c.g; col[o + 2] = c.b;
          o += 3;
        }
      }
      const index = [];
      for (let i = 0; i < nl; i++) for (let j = 0; j < nq; j++) {
        const a = i * (nq + 1) + j, bb = a + 1, cc = a + nq + 1, d = cc + 1;
        index.push(a, bb, d, a, d, cc);
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
      geo.setIndex(index);
      geo.computeVertexNormals();
      // Umlaufsinn prüfen: Normalen müssen nach oben zeigen
      if (geo.attributes.normal.getY(0) < 0) {
        for (let k = 0; k < index.length; k += 3) { const h = index[k + 1]; index[k + 1] = index[k + 2]; index[k + 2] = h; }
        geo.setIndex(index); geo.computeVertexNormals();
      }
      const mesh = new THREE.Mesh(geo, this._material(undefined, 0));
      mesh.name = 'Senke';
      return mesh;
    }

    /**
     * Brücke b (Daten: bruecken [{ s0, s1, art, tiefe }]) – alles in EINEM Mesh mit Vertex-Farben:
     *   holz:  Bretterbelag, Holzgeländer, Holzjoche bis zum Bach
     *   stein: Steinbrüstung, Bogen über Teich/Bach (Zwickelwände bis zum Bogen)
     *   stahl: Betonplatte auf Pfeilern über der Schlucht, rotes Stahlgeländer
     * Geländer genau an der Bande (grenzeEng). Wasser im Grund (nicht in der Wüste).
     */
    _brueckeBauen(b) {
      const w = this.grenzeEng, v = [], s0 = b.s0, s1 = b.s1, bb = this.breite / 2;
      const schritte = Math.max(4, Math.round(b.laenge));
      const sAt = (k) => s0 + (s1 - s0) * k / schritte;
      const unten = (s, q) => { const p = this._punktSQ(s, q, 0); return this.bodenHoehe(p[0], p[2]); };

      if (b.art === 'holz' || b.art === 'stamm') {
        // Bretter quer (abwechselnd hell/dunkel), über Straße und Rand bis zum Geländer.
        // Runde 5b 'stamm': quer liegende Baumstämme (~0,55 m, dunkle Fugen, Rinde), dicke Stamm-Geländer
        const stamm = b.art === 'stamm';
        const nDeck = stamm ? Math.max(8, Math.round(b.laenge / 0.55)) : schritte;
        const dAt = (k) => s0 + (s1 - s0) * k / nDeck;
        for (let k = 0; k < nDeck; k++) {
          const p = this.spline.punktBei(dAt(k)), q = this.spline.punktBei(dAt(k) + (s1 - s0) / nDeck * (stamm ? 0.8 : 0.92));
          const holzFarbe = stamm ? [0x7a5530, 0x6c4a2a, 0x845c34][k % 3] : (k % 2 ? 0x8a5a32 : 0x7a4d2a);
          v.push(this._band(p, q, -w, w, 0.16, holzFarbe));
          if (stamm) {
            // Rundung: schmale dunklere Kanten vorn/hinten am Stamm, Stirnseiten (Jahresringe) außen
            const pm = this.spline.punktBei(dAt(k) + (s1 - s0) / nDeck * 0.9);
            v.push(this._band(q, pm, -w, w, 0.1, 0x4a321c));
            [-1, 1].forEach((sg) => { v.push(this._wandSQ(dAt(k), (w + 0.25) * sg, dAt(k) + (s1 - s0) / nDeck * 0.8, (w + 0.25) * sg, -0.25, 0.16, 0xc8a070)); });
            v.push(this._band(p, q, -w - 0.25, -w, 0.16, holzFarbe), this._band(p, q, w, w + 0.25, 0.16, holzFarbe));
          } else {
            v.push(this._band(p, q, -bb - 0.25, -bb, 0.17, 0xe8dcc0), this._band(p, q, bb, bb + 0.25, 0.17, 0xe8dcc0));
          }
          v.push(this._band(p, q, -w, w, -0.55, 0x4a301a));                         // Unterseite
        }
        [-1, 1].forEach((sg) => {
          const quer = w * sg;
          for (let k = 0; k < schritte; k++) {
            const a = sAt(k), e = sAt(k + 1);
            v.push(this._wandSQ(a, quer, e, quer, -0.55, 0.16, 0x5a3a1e));            // Randbalken
            if (stamm) {
              // dicker Geländer-Stamm (Rinde) mit heller Oberkante, darunter ein zweiter, dünnerer
              v.push(this._wandSQ(a, quer, e, quer, 0.65, 1.15, 0x5b3d22));
              v.push(this._band(this.spline.punktBei(a), this.spline.punktBei(e), quer - 0.22, quer + 0.22, 1.15, 0x6e4c2c));
              v.push(this._wandSQ(a, quer, e, quer, 0.25, 0.45, 0x553820));
              continue;
            }
            v.push(this._wandSQ(a, quer, e, quer, 1.0, 1.18, 0x9a6a3c));              // Handlauf
            v.push(this._wandSQ(a, quer, e, quer, 0.5, 0.62, 0x9a6a3c));              // Mittellatte
            v.push(this._band(this.spline.punktBei(a), this.spline.punktBei(e), quer - 0.12, quer + 0.12, 1.18, 0xa87848));
          }
          // Geländerpfosten alle ~3 m
          const n = Math.max(2, Math.round(b.laenge / 3));
          for (let k = 0; k <= n; k++) {
            const s = s0 + b.laenge * k / n, p = this.spline.punktBei(s);
            const x = p.x + p.nx * quer, z = p.z + p.nz * quer, y = this.hoeheAn(x, z);
            if (b.art === 'stamm') this._kiste(v, x, z, p.tx, p.tz, 0.2, 0.2, y - 0.5, y + 1.45, 0x4e331b);
            else this._kiste(v, x, z, p.tx, p.tz, 0.12, 0.12, y - 0.5, y + 1.3, 0x5a3a1e);
          }
        });
        // Holzjoche: je zwei Stützen + Querbalken alle ~8 m bis in den Bach
        const nJ = Math.max(1, Math.round(b.laenge / 8));
        for (let k = 1; k < nJ; k++) {
          const s = s0 + b.laenge * k / nJ, p = this.spline.punktBei(s);
          let yQuer = Infinity;
          [-1, 1].forEach((sg) => {
            const q = (w - 0.6) * sg, x = p.x + p.nx * q, z = p.z + p.nz * q, y = this.hoeheAn(x, z);
            yQuer = Math.min(yQuer, y);
            this._kiste(v, x, z, p.tx, p.tz, 0.22, 0.22, this.bodenHoehe(x, z) - 0.5, y - 0.5, 0x4e331b);
          });
          const a = this._punktSQ(s, -w + 0.4, 0), e = this._punktSQ(s, w - 0.4, 0);
          this._kiste(v, (a[0] + e[0]) / 2, (a[2] + e[2]) / 2, p.nx, p.nz, w - 0.4, 0.18, yQuer - 1.3, yQuer - 0.9, 0x4e331b);
        }
      } else if (b.art === 'stein') {
        // Bogen: Unterkante wie ein flacher Halbkreis vom Grund an den Enden bis kurz unter die Fahrbahn
        const DICKE = 0.9;
        // Bogen: Unterkante = flacher Halbkreis, in der Mitte DICKE unter der Fahrbahn, an den Enden auf der Böschung
        const mitteTief = this.hoeheAn(b.m.x, b.m.z) - this.bodenHoehe(b.m.x, b.m.z);
        const bogen = (k) => {           // Tiefe der Bogenunterkante unter der Fahrbahn (m, > 0)
          const u = (k / schritte) * 2 - 1, s = sAt(k), p = this._punktSQ(s, 0, 0);
          const luft = p[1] - unten(s, 0) + 0.3;            // bis knapp in die Böschung
          const ub = u / 0.78;                               // Bogen spannt über den Grund, außen volle Mauer
          if (Math.abs(ub) >= 1) return Math.max(DICKE, luft);
          return Math.max(DICKE, Math.min(luft, DICKE + (mitteTief + 0.5 - DICKE) * (1 - Math.sqrt(1 - ub * ub))));
        };
        const wa = w + 0.55;
        for (let k = 0; k < schritte; k++) {
          const a = sAt(k), e = sAt(k + 1), ha = bogen(k), he = bogen(k + 1);
          const steinA = (k % 2) ? 0x9d978b : 0x8f897d;
          [-1, 1].forEach((sg) => {
            // Brüstung (innen + außen + Deckstein)
            v.push(this._wandSQ(a, w * sg, e, w * sg, 0, 0.95, steinA));
            v.push(this._band(this.spline.punktBei(a), this.spline.punktBei(e), Math.min(w * sg, wa * sg), Math.max(w * sg, wa * sg), 0.95, 0xb4ae9f));
            // Zwickelwand außen von der Brüstung bis zur Bogenunterkante
            const pa = this._punktSQ(a, wa * sg, 0), pe = this._punktSQ(e, wa * sg, 0);
            v.push({ a: [pa[0], pa[1] - ha, pa[2]], b: [pe[0], pe[1] - he, pe[2]], c: [pe[0], pe[1] + 0.95, pe[2]], d: [pa[0], pa[1] + 0.95, pa[2]], farbe: steinA });
            // Bogenstein-Band an der Unterkante (dunkler)
            v.push({ a: [pa[0], pa[1] - ha, pa[2]], b: [pe[0], pe[1] - he, pe[2]], c: [pe[0], pe[1] - he + 0.5, pe[2]], d: [pa[0], pa[1] - ha + 0.5, pa[2]], farbe: 0x7b756a });
          });
          // Bogenunterseite (Laibung)
          const pl = this._punktSQ(a, -wa, 0), pr = this._punktSQ(a, wa, 0), ql = this._punktSQ(e, -wa, 0), qr = this._punktSQ(e, wa, 0);
          v.push({ a: [pl[0], pl[1] - ha, pl[2]], b: [pr[0], pr[1] - ha, pr[2]], c: [qr[0], qr[1] - he, qr[2]], d: [ql[0], ql[1] - he, ql[2]], farbe: 0x77716a });
        }
      } else {
        // stahl: Betonplatte 1,4 m dick, Pfeiler bis in die Schlucht, rotes Geländer
        const DICKE = 1.4;
        for (let k = 0; k < schritte; k++) {
          const a = sAt(k), e = sAt(k + 1);
          v.push(this._band(this.spline.punktBei(a), this.spline.punktBei(e), -w - 0.3, w + 0.3, -DICKE, 0x8e8a84));   // Unterseite
          [-1, 1].forEach((sg) => {
            const q = (w + 0.3) * sg;
            v.push(this._wandSQ(a, q, e, q, -DICKE, 0.25, 0xa7a29a));                 // Plattenrand
            v.push(this._band(this.spline.punktBei(a), this.spline.punktBei(e), Math.min(w * sg, q), Math.max(w * sg, q), 0.25, 0xbab5ac));
            v.push(this._wandSQ(a, w * sg, e, w * sg, 0.0, 0.25, 0xa7a29a));          // Bordstein
            v.push(this._wandSQ(a, w * sg, e, w * sg, 0.95, 1.1, 0xc0392b));           // Handlauf
            v.push(this._wandSQ(a, w * sg, e, w * sg, 0.5, 0.58, 0xc0392b));           // Mittelholm
          });
        }
        [-1, 1].forEach((sg) => {
          const n = Math.max(2, Math.round(b.laenge / 2.5));
          for (let k = 0; k <= n; k++) {
            const s = s0 + b.laenge * k / n, p = this.spline.punktBei(s);
            const x = p.x + p.nx * w * sg, z = p.z + p.nz * w * sg, y = this.hoeheAn(x, z);
            this._kiste(v, x, z, p.tx, p.tz, 0.07, 0.07, y, y + 1.1, 0x9b2c20);
          }
        });
        // Pfeiler (je einer pro ~16 m, breit unter der Fahrbahn)
        const nP = Math.max(2, Math.round(b.laenge / 16));
        for (let k = 1; k < nP; k++) {
          const s = s0 + b.laenge * k / nP, p = this.spline.punktBei(s), y = this.hoeheAn(p.x, p.z);
          this._kiste(v, p.x, p.z, p.tx, p.tz, 0.9, bb - 1, this.bodenHoehe(p.x, p.z) - 1, y - DICKE + 0.05, 0x9a948b);
          this._kiste(v, p.x, p.z, p.tx, p.tz, 1.3, bb + 0.2, y - DICKE - 0.6, y - DICKE + 0.05, 0x8a847b);   // Pfeilerkopf
        }
      }
      // Widerlager an beiden Enden (Mauer quer unter der Fahrbahn bis zum Boden)
      [s0, s1].forEach((s) => {
        const p = this.spline.punktBei(s), y = this.hoeheAn(p.x, p.z);
        this._kiste(v, p.x, p.z, p.tx, p.tz, 0.8, w + 0.6, Math.min(y, this.bodenHoehe(p.x, p.z)) - 1.5, y - 0.35,
          b.art === 'holz' || b.art === 'stamm' ? 0x7d776b : b.art === 'stein' ? 0x8f897d : 0x9a948b);
      });
      // Wasser im Grund (Bach / Teich), folgt dem Gefälle der Senke
      if (b.art !== 'stahl') {
        const breiteL = b.halb * (b.art === 'stein' ? 0.42 : b.art === 'stamm' ? 0.55 : 0.3), Q = b.q0 + 10, ST = 3;
        const m = b.m, pend = (q) => Math.sin(q * 0.11) * 2.2;
        for (let q = -Q; q < Q; q += ST) {
          const ecke = (l, qq) => {
            const ll = l + pend(qq), x = m.x + m.tx * ll + m.nx * qq, z = m.z + m.tz * ll + m.nz * qq;
            return [x, this.bodenHoehe(x, z) + 0.35, z];
          };
          v.push({ a: ecke(-breiteL, q), b: ecke(breiteL, q), c: ecke(breiteL, q + ST), d: ecke(-breiteL, q + ST),
            farbe: b.art === 'stein' ? 0x4f95c0 : b.art === 'stamm' ? ((Math.round(q / ST) & 1) ? 0x3f6b5c : 0x386254) : 0x3f86b8 });   // Sumpf: trüb grün-blau
        }
      }
      const mesh = new THREE.Mesh(this._viereckeZuGeometrie(v),
        new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }));
      mesh.name = 'Bruecke';
      return mesh;
    }

    /**
     * Tunnel (Daten: tunnel [{ s0, s1, art: 'fels' | 'sandstein' }]): Röhre mit dunklen Innenwänden,
     * Fels-/Sandsteinhügel darüber, Steinportal an beiden Enden, Deckenlampen alle 12 m.
     * Liefert [Röhre (1 Mesh, Vertex-Farben), Lampen (1 Mesh, MeshBasic = leuchtet ohne Licht)].
     * this.tunnelLampen = [{ x, y, z, s }] für die Punktlichter (main.js).
     */
    _tunnelBauen() {
      const v = [], lampen = [], sp = this.spline;
      const W = this.grenzeEng + 0.35, WAND = 3.4, H = 6.6, M = 17, N = 13, ST = 2;
      this.tunnelLampen = [];
      for (const t of this.tunnel) {
        const sand = t.art === 'sandstein', hoehle = t.art === 'hoehle';
        // Runde 5b 'hoehle' (Dino-Höhle): braun-schwarzer Fels, bemooster Berg, grober Felsrahmen, Fackeln, Stalaktiten
        const fInnen = sand ? 0x3a322c : hoehle ? 0x2a231d : 0x2e2e30, fWand = sand ? 0x4a4038 : hoehle ? 0x3a3027 : 0x3c3b39;
        const fHuegel = sand ? [0xc68d58, 0xd8a56c, 0xb97f4c] : hoehle ? [0x4a5e2c, 0x5b5146, 0x46582a] : [0x4b6a33, 0x587a3a, 0x6f6e62];
        const fPortal = sand ? [0xb57d4c, 0xc68d58] : hoehle ? [0x4a4036, 0x3e352c] : [0x55603f, 0x646a58];
        const fRahmen = sand ? 0xe0b07a : hoehle ? 0x6a5e50 : 0xbdb8aa;
        // Querschnitte (Weltkoordinaten): innen 13 Punkte (Wand links unten → Bogen → Wand rechts unten), außen 13
        const quer = (s) => {
          const p = sp.punktBei(s), yc = this.hoeheAn(p.x, p.z);
          const wp = (q, y) => [p.x + p.nx * q, y, p.z + p.nz * q];
          const innen = [], aussen = [];
          innen.push(wp(-W, this.hoeheAn(p.x - p.nx * W, p.z - p.nz * W) - 0.4));
          for (let k = 0; k <= 10; k++) {
            const th = Math.PI - k * Math.PI / 10;
            innen.push(wp(W * Math.cos(th), yc + WAND + (H - WAND) * Math.sin(th)));
          }
          innen.push(wp(W, this.hoeheAn(p.x + p.nx * W, p.z + p.nz * W) - 0.4));
          for (let k = 0; k < N; k++) {
            const tt = -1 + 2 * k / (N - 1), q = tt * (W + M), x = p.x + p.nx * q, z = p.z + p.nz * q;
            const fuss = Math.min(yc - 1, this.bodenHoehe(x, z) - 0.8);
            const rauh = Math.sin(s * 0.37 + k * 1.7) * 0.7 + Math.sin(s * 0.11 - k * 0.9) * 0.6;
            const oben = yc + H + 3.2 + rauh * (1 - Math.abs(tt));
            // runder Hügel: oben flach gewölbt, seitlich weich bis zum Fuß
            const form = Math.cos(Math.min(1, Math.abs(tt)) * Math.PI / 2);
            aussen.push([x, fuss + (oben - fuss) * Math.pow(form, 0.7), z]);
          }
          return { innen, aussen, p, yc };
        };
        const n = Math.max(2, Math.round(t.laenge / ST));
        let alt = quer(t.s0);
        for (let i = 1; i <= n; i++) {
          const s = t.s0 + t.laenge * i / n, neu = quer(s);
          for (let k = 0; k < N - 1; k++) {
            // innen: Wände unten etwas heller, Gewölbe dunkel mit leichten Ringen
            const ring = (i % 3 === 0) ? 0.85 : 1;
            const c = new THREE.Color(k === 0 || k === N - 2 ? fWand : fInnen).multiplyScalar(ring).getHex();
            v.push({ a: alt.innen[k], b: neu.innen[k], c: neu.innen[k + 1], d: alt.innen[k + 1], farbe: c });
            const fh = fHuegel[(Math.floor(i / 2) * 7 + k * 3 + (Math.sin(i * 0.7 + k) > 0.3 ? 1 : 0)) % fHuegel.length];
            v.push({ a: alt.aussen[k], b: alt.aussen[k + 1], c: neu.aussen[k + 1], d: neu.aussen[k], farbe: fh });
          }
          // Gehweg zwischen Randstreifen und Wand (dunkler Beton)
          const b0 = this.breite / 2 + this.randBreite;
          const pa = sp.punktBei(s - t.laenge / n), pb = sp.punktBei(s);
          v.push(this._band(pa, pb, -W, -b0, 0.09, 0x3d3c3a), this._band(pa, pb, b0, W, 0.09, 0x3d3c3a));
          alt = neu;
        }
        // Portale an beiden Enden: Stirnfläche zwischen Röhre und Hügel + vorstehender Steinrahmen
        [[t.s0, -1], [t.s1, 1]].forEach(([s, rv]) => {
          const qs = quer(s), vor = quer(s + rv * 0.6);
          const weit = (pt, mitte, f) => [mitte[0] + (pt[0] - mitte[0]) * f, pt[1], mitte[2] + (pt[2] - mitte[2]) * f];
          for (let k = 0; k < N - 1; k++) {
            // Stirnseite des Hügels: Fels/Moos (Wald) bzw. Sandstein, nur der Rahmen ist heller Stein
            v.push({ a: qs.innen[k], b: qs.innen[k + 1], c: qs.aussen[k + 1], d: qs.aussen[k], farbe: fPortal[k % 2] });
            // Rahmen: innen-Kante 0,6 m vorgezogen, 1,1 m breit
            const ia = vor.innen[k], ib = vor.innen[k + 1];
            const mitte = [vor.p.x, 0, vor.p.z];
            const hoch = (pt, d) => { const r = weit(pt, mitte, (W + 1.6) / W); return [r[0], pt[1] + d, r[2]]; };
            const da = k === 0 ? 0 : 1.5 * Math.sin(Math.PI * (k) / (N - 1)), db = k + 1 === N - 1 ? 0 : 1.5 * Math.sin(Math.PI * (k + 1) / (N - 1));
            v.push({ a: ia, b: ib, c: hoch(ib, db), d: hoch(ia, da), farbe: fRahmen });
            v.push({ a: qs.innen[k], b: qs.innen[k + 1], c: ib, d: ia, farbe: fRahmen });      // Laibung des Rahmens
            v.push({ a: hoch(ia, da), b: hoch(ib, db), c: hoch(qs.innen[k + 1], db), d: hoch(qs.innen[k], da), farbe: fRahmen });
          }
        });
        // Deckenlampen alle 12 m (leuchtende Flächen) – Positionen für die Punktlichter merken
        // Höhle: statt Lampen Fackeln an der Wand (abwechselnd links/rechts, orange Flamme)
        for (let s = t.s0 + 6, nr = 0; s <= t.s1 - 3; s += 12, nr++) {
          const p = sp.punktBei(s), y = this.hoeheAn(p.x, p.z) + H - 0.18;
          if (hoehle) {
            const sg = nr % 2 ? 1 : -1, q = (W - 0.15) * sg, yb = this.hoeheAn(p.x, p.z) + 2.6;
            const f = (sl, hy, sq) => [p.x + p.tx * 0.22 * sl + p.nx * (q - sg * sq), yb + hy, p.z + p.tz * 0.22 * sl + p.nz * (q - sg * sq)];
            v.push({ a: f(-0.4, -0.9, 0), b: f(0.4, -0.9, 0), c: f(0.4, 0, 0.35), d: f(-0.4, 0, 0.35), farbe: 0x3a2614 });   // Halter
            lampen.push({ a: f(-1, 0, 0.35), b: f(1, 0, 0.35), c: f(0.3, 0.9, 0.4), d: f(-0.3, 0.9, 0.4), farbe: 0xffa040 });
            lampen.push({ a: f(-0.5, 0.05, 0.36), b: f(0.5, 0.05, 0.36), c: f(0.1, 0.55, 0.38), d: f(-0.1, 0.55, 0.38), farbe: 0xfff0a0 });
            this.tunnelLampen.push({ x: p.x + p.nx * q * 0.6, y: yb + 1.2, z: p.z + p.nz * q * 0.6, s });
            continue;
          }
          const e = (sl, sq) => [p.x + p.tx * 0.9 * sl + p.nx * 0.45 * sq, y, p.z + p.tz * 0.9 * sl + p.nz * 0.45 * sq];
          lampen.push({ a: e(-1, -1), b: e(1, -1), c: e(1, 1), d: e(-1, 1), farbe: 0xfff3c8 });
          this.tunnelLampen.push({ x: p.x, y: y - 0.3, z: p.z, s });
        }
        // Höhle: Stalaktiten von der Decke (über der Fahrbahn kurz, an den Seiten länger) + Stalagmiten hinter der Bande
        if (hoehle) {
          let zz = 1234567 + Math.round(t.s0);
          const rnd = () => { zz = (zz * 16807) % 2147483647; return zz / 2147483647; };
          const decke = (q) => { const c = Math.max(-1, Math.min(1, q / W)); return WAND + (H - WAND) * Math.sqrt(1 - c * c); };
          const kegel = (s, q, y0, laenge, r, nachUnten, farbe, farbeSpitze) => {
            const p = sp.punktBei(s), yc = this.hoeheAn(p.x, p.z), m = [p.x + p.nx * q, yc + y0, p.z + p.nz * q];
            const spitze = [m[0], m[1] + (nachUnten ? -laenge : laenge), m[2]];
            for (let k = 0; k < 5; k++) {
              const w0 = k / 5 * Math.PI * 2, w1 = (k + 1) / 5 * Math.PI * 2;
              const ra = [m[0] + (p.nx * Math.cos(w0) + p.tx * Math.sin(w0)) * r, m[1], m[2] + (p.nz * Math.cos(w0) + p.tz * Math.sin(w0)) * r];
              const rb = [m[0] + (p.nx * Math.cos(w1) + p.tx * Math.sin(w1)) * r, m[1], m[2] + (p.nz * Math.cos(w1) + p.tz * Math.sin(w1)) * r];
              v.push({ a: ra, b: rb, c: spitze, d: spitze, farbe: k % 2 ? farbe : farbeSpitze });
            }
          };
          for (let s = t.s0 + 3; s <= t.s1 - 2; s += 1.6 + rnd() * 1.6) {
            const sg = rnd() < 0.5 ? -1 : 1, aussen = rnd() < 0.7;
            const q = aussen ? sg * W * (0.7 + rnd() * 0.24) : sg * W * rnd() * 0.55;
            const y0 = decke(q) + 0.15, laenge = aussen ? Math.min(y0 - 3.6, 0.7 + rnd() * 1.4) : 0.3 + rnd() * 0.5;
            kegel(s + rnd(), q, y0, Math.max(0.25, laenge), 0.16 + rnd() * 0.22, true, 0x5a4c3e, 0x7a6a58);
            if (rnd() < 0.35) kegel(s + rnd(), sg * (this.grenzeEng + 0.2 + rnd() * 0.25), -0.3, 0.6 + rnd() * 1.1, 0.18 + rnd() * 0.15, false, 0x4e4236, 0x6e6052);
          }
        }
      }
      const roehre = new THREE.Mesh(this._viereckeZuGeometrie(v),
        new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }));
      roehre.name = 'Tunnel';
      const lampenMesh = new THREE.Mesh(this._viereckeZuGeometrie(lampen),
        new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide }));
      lampenMesh.name = 'Tunnellampen';
      return [roehre, lampenMesh];
    }

    // ---------------------------------------------------------- Hindernisse (Grafik)

    /** Geometrien (bereits verschoben) mit je einer Farbe zu einer nicht indizierten Geometrie vereinen. */
    _teileVereinen(teile) {
      const flach = teile.map(t => ({ g: t.geo.index ? t.geo.toNonIndexed() : t.geo, farbe: t.farbe }));
      const anzahl = flach.reduce((s, t) => s + t.g.attributes.position.count, 0);
      const pos = new Float32Array(anzahl * 3), col = new Float32Array(anzahl * 3), c = new THREE.Color();
      let o = 0;
      flach.forEach(({ g, farbe }) => {
        const n = g.attributes.position.count;
        pos.set(g.attributes.position.array, o * 3);
        c.set(farbe);
        for (let i = 0; i < n; i++) col.set([c.r, c.g, c.b], (o + i) * 3);
        o += n;
      });
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
      geo.computeVertexNormals();
      return geo;
    }

    /**
     * Hindernisse als Gruppe 'Strecke Hindernisse' (höchstens 4 Draw-Calls):
     * Flecken (Sand), Ölflecken (glänzend), feste Teile (Ast, Baken, Schilder), Pylonen (InstancedMesh).
     * Die Pylonen ändern sich (umgefahren → blinken → weg): hindernisseAnimieren(zeit).
     */
    hindernisseBauen() {
      // Runde 4: Wracks (Schicht „wracks“) als feste Hindernisse anhängen (einmalig, vor dem Bau der KI-Fahrer)
      if (R.Kollisionen && R.Kollisionen.wracksEinbauen) R.Kollisionen.wracksEinbauen(this);
      const g = new THREE.Group();
      g.name = 'Strecke Hindernisse';
      const sp = this.spline, sand = [], oel = [], teile = [];
      const fleck = (h, liste, farbeMitte, farbeRand, hoch) => {
        const N = 28, seed = h.nr * 7.3;
        const mitte = sp.punktBei(h.s);
        const m = [mitte.x + mitte.nx * h.seitenabstand, 0, mitte.z + mitte.nz * h.seitenabstand];
        m[1] = this.hoeheAn(m[0], m[2]) + hoch;
        let vorher = null, erster = null;
        for (let k = 0; k <= N; k++) {
          const w = (k % N) / N * Math.PI * 2;
          const r = 0.86 + 0.1 * Math.sin(w * 3 + seed) + 0.05 * Math.sin(w * 7 + seed * 2);
          const ds = Math.cos(w) * h.halblaenge * r, dq = Math.sin(w) * h.halbbreite * r;
          const p = sp.punktBei(h.s + ds), q = h.seitenabstand + dq;
          const x = p.x + p.nx * q, z = p.z + p.nz * q, pt = [x, this.hoeheAn(x, z) + hoch, z];
          if (vorher) liste.push({ m, a: vorher, b: pt, fm: farbeMitte, fr: farbeRand });
          vorher = pt; if (!erster) erster = pt;
        }
      };
      for (const h of this.hindernisse) {
        if (h.typ === 'sand') fleck(h, sand, 0xe8d29c, 0xbfa36c, 0.095);
        else if (h.typ === 'oel') fleck(h, oel, 0x07070b, 0x3b2d55, 0.095);
      }
      // Fächer-Dreiecke → Geometrie (Mitte hell/dunkel, Rand andere Farbe), Umlaufsinn nach oben
      const facher = (liste) => {
        const pos = [], col = [], c1 = new THREE.Color(), c2 = new THREE.Color();
        for (const d of liste) {
          c1.set(d.fm); c2.set(d.fr);
          const nyA = (d.a[2] - d.m[2]) * (d.b[0] - d.m[0]) - (d.a[0] - d.m[0]) * (d.b[2] - d.m[2]);
          const [a, b] = nyA > 0 ? [d.a, d.b] : [d.b, d.a];
          pos.push(...d.m, ...a, ...b);
          col.push(c1.r, c1.g, c1.b, c2.r, c2.g, c2.b, c2.r, c2.g, c2.b);
        }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
        geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(col), 3));
        geo.computeVertexNormals();
        return geo;
      };
      if (sand.length) {
        const m = new THREE.Mesh(facher(sand), this._material(undefined, 4));
        m.name = 'Sandflecken'; g.add(m);
      }
      if (oel.length) {
        const m = new THREE.Mesh(facher(oel), new THREE.MeshPhongMaterial({ vertexColors: true, shininess: 60,
          specular: 0xc8c8e8, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }));
        m.name = 'Oelflecken'; g.add(m);
      }
      // Runde 6 (W2-C): Lava-Zungen (2 Draw-Calls: Fläche + Blasen) – leuchtet ohne Licht, pulsiert/blubbert (hindernisseAnimieren)
      const lavas = this.hindernisse.filter(h => h.typ === 'lava');
      if (lavas.length) this._lavaBauen(g, lavas, facher);
      // Feste Teile: Ast (Stamm + Zweige), Baken (rot-weiß), Baustellen-Schild
      const zyl = (ax, ay, az, bx, by, bz, r, farbe) => {
        const l = Math.hypot(bx - ax, by - ay, bz - az);
        const geo = new THREE.CylinderGeometry(r * 0.75, r, l, 7, 1);
        const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(bx - ax, by - ay, bz - az).normalize());
        geo.applyQuaternion(q); geo.translate((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2);
        teile.push({ geo, farbe });
      };
      const kiste = (x, y, z, sx, sy, sz, drehung, farbe) => {
        const geo = new THREE.BoxGeometry(sx, sy, sz);
        geo.rotateY(drehung); geo.translate(x, y, z);
        teile.push({ geo, farbe });
      };
      const pylonen = [];
      for (const h of this.hindernisse) {
        if (h.typ === 'ast') {
          const sg = h.segmente[0], dk = sg.dicke;
          const ya = this.hoeheAn(sg.ax, sg.az) + dk * 0.8, yb = this.hoeheAn(sg.bx, sg.bz) + dk * 0.7;
          zyl(sg.ax, ya, sg.az, sg.bx, yb, sg.bz, dk * 1.15, 0x6b4426);
          // Zweige: drei Stück, schräg nach oben/zur Seite, mit Blattbüscheln
          const L = Math.hypot(sg.bx - sg.ax, sg.bz - sg.az), ux = (sg.bx - sg.ax) / L, uz = (sg.bz - sg.az) / L;
          [[0.3, 1, 1.6], [0.55, -1, 1.3], [0.8, 1, 1.1]].forEach(([f, s, len]) => {
            const x0 = sg.ax + ux * L * f, z0 = sg.az + uz * L * f, y0 = ya + (yb - ya) * f;
            const x1 = x0 + (ux * 0.6 - uz * s) * len, z1 = z0 + (uz * 0.6 + ux * s) * len, y1 = y0 + 0.5 * len;
            zyl(x0, y0, z0, x1, y1, z1, dk * 0.38, 0x7a5030);
            const blatt = new THREE.IcosahedronGeometry(0.7, 0); blatt.translate(x1, y1 + 0.15, z1);
            teile.push({ geo: blatt, farbe: this.thema === 'wueste' ? 0x8a8a4a : 0x3f7a2c });
          });
          // Rinde-Stummel am dicken Ende
          zyl(sg.ax - ux * 0.3, ya, sg.az - uz * 0.3, sg.ax, ya, sg.az, dk * 1.05, 0x58361d);
        } else if (h.typ === 'baustelle') {
          const sg = h.segmente[0];
          const L = Math.hypot(sg.bx - sg.ax, sg.bz - sg.az), ux = (sg.bx - sg.ax) / L, uz = (sg.bz - sg.az) / L;
          const dreh = Math.atan2(-uz, ux);
          // Bake: rot-weiß gestreifte Planke auf zwei Füßen (Streifen = einzelne Kisten)
          const nStreifen = Math.max(4, Math.round(L / 0.6));
          for (let k = 0; k < nStreifen; k++) {
            const f = (k + 0.5) / nStreifen, x = sg.ax + ux * L * f, z = sg.az + uz * L * f, y = this.hoeheAn(x, z);
            kiste(x, y + 0.85, z, L / nStreifen, 0.32, 0.08, dreh, k % 2 ? 0xf2f2f2 : 0xd62b22);
            kiste(x, y + 0.45, z, L / nStreifen, 0.16, 0.06, dreh, k % 2 ? 0xd62b22 : 0xf2f2f2);
          }
          [0.08, 0.92].forEach((f) => {
            const x = sg.ax + ux * L * f, z = sg.az + uz * L * f, y = this.hoeheAn(x, z);
            kiste(x, y + 0.5, z, 0.08, 1.0, 0.08, dreh, 0x333333);
            kiste(x, y + 0.04, z, 0.25, 0.08, 0.7, dreh, 0x222222);
            // Warnleuchte oben
            kiste(x, y + 1.12, z, 0.18, 0.16, 0.12, dreh, 0xffb400);
          });
          // Schild "Baustelle" am Fahrbahnrand vor der Schräge (rotes Dreieck, weiße Fläche, schwarzes Männchen)
          const ps = sp.punktBei(h.s0 - 12), qS = h.seite * (this.breite / 2 + this.randBreite + 1.2);
          const xs = ps.x + ps.nx * qS, zs = ps.z + ps.nz * qS, ys = this.hoeheAn(xs, zs);
          const blick = Math.atan2(-ps.tx, -ps.tz);     // Schild schaut den Autos entgegen
          kiste(xs, ys + 1.0, zs, 0.08, 2.0, 0.08, blick, 0x8a8a8a);
          const dreieck = (r, farbe, vor) => {
            const geo = new THREE.CircleGeometry(r, 3); geo.rotateZ(Math.PI / 2);
            geo.translate(0, 0, vor); geo.rotateY(blick); geo.translate(xs, ys + 2.2, zs);
            teile.push({ geo, farbe });
            const hinten = new THREE.CircleGeometry(r, 3); hinten.rotateZ(Math.PI / 2); hinten.rotateY(Math.PI);
            hinten.translate(0, 0, -0.02); hinten.rotateY(blick); hinten.translate(xs, ys + 2.2, zs);
            teile.push({ geo: hinten, farbe: 0x9a9a9a });
          };
          dreieck(0.75, 0xd62b22, 0.05); dreieck(0.55, 0xf4f4f4, 0.07);
          const mann = new THREE.BoxGeometry(0.12, 0.38, 0.02); mann.rotateZ(0.5); mann.translate(0, 0, 0.09);
          mann.rotateY(blick); mann.translate(xs, ys + 2.15, zs);
          teile.push({ geo: mann, farbe: 0x111111 });
          h.pylonen.forEach((p) => pylonen.push(p));
        }
      }
      if (teile.length) {
        const m = new THREE.Mesh(this._teileVereinen(teile), new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }));
        m.name = 'Hindernisteile'; g.add(m);
      }
      if (pylonen.length) {
        // Pylone: Fuß (schwarz), Kegel (orange) mit weißem Reflexstreifen – eine Geometrie mit Vertex-Farben
        const fuss = new THREE.BoxGeometry(0.5, 0.05, 0.5); fuss.translate(0, 0.025, 0);
        const unten = new THREE.CylinderGeometry(0.17, 0.24, 0.3, 10); unten.translate(0, 0.2, 0);
        const streifen = new THREE.CylinderGeometry(0.13, 0.17, 0.16, 10); streifen.translate(0, 0.43, 0);
        const oben = new THREE.CylinderGeometry(0.035, 0.13, 0.28, 10); oben.translate(0, 0.65, 0);
        const geo = this._teileVereinen([{ geo: fuss, farbe: 0x222222 }, { geo: unten, farbe: 0xff6a10 },
          { geo: streifen, farbe: 0xf6f6f6 }, { geo: oben, farbe: 0xff6a10 }]);
        const m = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true }), pylonen.length);
        m.name = 'Pylonen';
        m.frustumCulled = false;          // Instanzen ändern sich: keine feste Begrenzungskugel
        this._pylonMesh = m; this._pylonListe = pylonen;
        pylonen.forEach((p, i) => { p.i = i; p.y = this.hoeheAn(p.x, p.z) + 0.07; m.setColorAt(i, new THREE.Color(1, 1, 1)); });
        g.add(m);
        this.pylonenGeaendert = true;
        this.hindernisseAnimieren(0);
      }
      // Runde 4: liegengebliebene/brennende Autos (Grafik + Warnblinker/Feuer in physics/schaden.js)
      const wracke = this.hindernisse.filter(h => h.typ === 'wrack' || h.typ === 'brand');
      if (wracke.length && R.Schaden && R.Schaden.wrackGruppe) g.add(R.Schaden.wrackGruppe(this, wracke));
      return g;
    }

    /**
     * Runde 6 (W2-C): Lava-Zungen als ein Mesh (MeshBasic, Vertex-Farben: Mitte gelb → orange → rote Kante → dunkle Kruste)
     * und Blasen (InstancedMesh, 10 je Zunge). Form im Straßen-Rahmen: Superellipse über flaeche (längs ±hl, quer q0..q1),
     * zur Fahrbahnmitte hin schmaler (Zungenspitze), Rand leicht gewellt. Animation: _lavaAnimieren(zeit).
     */
    _lavaBauen(g, lavas, facher) {
      void facher;
      const sp = this.spline, pos = [], col = [], c = new THREE.Color();
      const RINGE = [[0, 0xffe27a, 0.13], [0.45, 0xffa22a, 0.13], [0.8, 0xf2541a, 0.13], [1, 0xb8300e, 0.13], [1.18, 0x3a2620, 0.17], [1.32, 0x2a2420, 0.05]];
      const N = 30;
      this._lavaBlasen = []; this._lavaFlammen = [];
      lavas.forEach((h, nr) => {
        const F = h.flaeche, qc = (F.q0 + F.q1) / 2, B = (F.q1 - F.q0) / 2, seed = nr * 3.7 + 1.1;
        const innenSeite = Math.sign(F.q0 + F.q1) || 1;          // Quelle außen (Rand), Spitze zur Mitte
        const punkt = (w, f) => {
          const cw = Math.cos(w), sw = Math.sin(w), p = 2.6;
          const r = 1 / Math.pow(Math.pow(Math.abs(cw), p) + Math.pow(Math.abs(sw), p), 1 / p);
          const wob = 1 + 0.07 * Math.sin(w * 3 + seed) + 0.04 * Math.sin(w * 7 + seed * 2);
          const q = qc + sw * B * r * f * wob;
          const t = Math.max(0, Math.min(1, (q - F.q0) / (F.q1 - F.q0)));      // 0 = innen (q0) … 1 = außen
          const breit = innenSeite > 0 ? 0.5 + 0.5 * t : 0.5 + 0.5 * (1 - t);
          const l = cw * F.hl * r * f * wob * breit;
          const pp = sp.punktBei(h.s + l), x = pp.x + pp.nx * q, z = pp.z + pp.nz * q;
          return [x, z];
        };
        for (let k = 0; k < N; k++) {
          const w0 = k / N * Math.PI * 2, w1 = (k + 1) / N * Math.PI * 2;
          for (let r = 0; r < RINGE.length - 1; r++) {
            const [fa, ca, ha] = RINGE[r], [fb, cb, hb] = RINGE[r + 1];
            const a0 = punkt(w0, fa), a1 = punkt(w1, fa), b0 = punkt(w0, fb), b1 = punkt(w1, fb);
            const y = (pt, hh) => [pt[0], this.hoeheAn(pt[0], pt[1]) + hh, pt[1]];
            const A0 = y(a0, ha), A1 = y(a1, ha), B0 = y(b0, hb), B1 = y(b1, hb);
            const farbe = (hex) => { c.setHex(hex); return [c.r, c.g, c.b]; };
            const ka = farbe(ca), kb = farbe(cb);
            if (r === 0) { pos.push(...A0, ...B1, ...B0); col.push(...ka, ...kb, ...kb); }
            else { pos.push(...A0, ...B1, ...B0, ...A0, ...A1, ...B1); col.push(...ka, ...kb, ...kb, ...ka, ...ka, ...kb); }
          }
        }
        // Blasen: feste Plätze in der Zunge (f ≤ 0,75), je eigener Takt
        for (let k = 0; k < 10; k++) {
          const w = (k * 2.39996 + seed) % (Math.PI * 2), f = 0.15 + 0.6 * ((k * 0.618 + nr * 0.3) % 1);
          const [x, z] = punkt(w, f);
          this._lavaBlasen.push({ x, z, y: this.hoeheAn(x, z) + 0.13, t0: (k * 0.37 + nr * 0.21) % 1, takt: 1.1 + (k % 4) * 0.35, r: 0.22 + (k % 3) * 0.09 });
        }
        // W2-C1: kleine Flammen (7 je Zunge) züngeln aus der Lava, eher am heißen Rand (f 0,3–0,9)
        for (let k = 0; k < 7; k++) {
          const w = (k * 0.897 * Math.PI + seed * 1.7) % (Math.PI * 2), f = 0.3 + 0.6 * ((k * 0.381 + nr * 0.17) % 1);
          const [x, z] = punkt(w, f);
          this._lavaFlammen.push({ x, z, y: this.hoeheAn(x, z) + 0.12, t0: k * 1.37 + nr, h: 1.1 + (k % 3) * 0.35 });
        }
      });
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
      geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(col), 3));
      geo.computeVertexNormals();
      const mat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -5, polygonOffsetUnits: -5 });
      const m = new THREE.Mesh(geo, mat);
      m.name = 'Lava'; g.add(m);
      this._lavaMat = mat;
      const blase = new THREE.SphereGeometry(1, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2);
      const bm = new THREE.InstancedMesh(blase, new THREE.MeshBasicMaterial({ color: 0xffc04a }), this._lavaBlasen.length);
      bm.name = 'LavaBlasen'; bm.frustumCulled = false;
      g.add(bm);
      this._lavaBlasenMesh = bm;
      // Flammen: Kegel mit Bauch (Lathe), leuchtend ohne Licht, Vertex-Farben unten rot-orange → Mitte orange → Spitze gelb (+1 Draw-Call)
      const profil = [[0.01, 0], [0.32, 0.12], [0.36, 0.3], [0.26, 0.55], [0.12, 0.8], [0.01, 1]].map(p => new THREE.Vector2(p[0], p[1]));
      const fl = new THREE.LatheGeometry(profil, 6);
      const fc = [], fp = fl.attributes.position;
      for (let i = 0; i < fp.count; i++) { const u = fp.getY(i); c.setRGB(1, 0.28 + 0.62 * u, 0.05 + 0.3 * u * u); fc.push(c.r, c.g, c.b); }
      fl.setAttribute('color', new THREE.BufferAttribute(new Float32Array(fc), 3));
      const fm = new THREE.InstancedMesh(fl, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.92,
        depthWrite: false, side: THREE.DoubleSide }), this._lavaFlammen.length);
      fm.name = 'LavaFlammen'; fm.frustumCulled = false;
      g.add(fm);
      this._lavaFlammenMesh = fm;
      this._lavaAnimieren(0);
    }

    /** Lava pulsiert (Farbe) und blubbert: Blasen wachsen, platzen, kurze Pause (je Blase eigener Takt). */
    _lavaAnimieren(zeit) {
      if (!this._lavaMat) return;
      const t = zeit || 0, f = 0.85 + 0.15 * (0.5 + 0.5 * Math.sin(t * 2.3) * Math.sin(t * 0.7 + 1));
      this._lavaMat.color.setRGB(1, f, f * 0.92);
      const m = this._lavaBlasenMesh, m4 = this._m4L || (this._m4L = new THREE.Matrix4());
      const v = this._vL || (this._vL = new THREE.Vector3()), q = this._qL || (this._qL = new THREE.Quaternion()), sk = this._skL || (this._skL = new THREE.Vector3());
      this._lavaBlasen.forEach((b, i) => {
        const u = ((t / b.takt + b.t0) % 1 + 1) % 1;
        const gr = u < 0.7 ? b.r * (0.3 + u / 0.7) : u < 0.8 ? b.r * 1.3 * (1 - (u - 0.7) * 8) : 0.001;
        v.set(b.x, b.y, b.z); sk.set(gr, gr * 0.8, gr);
        m4.compose(v, q, sk);
        m.setMatrixAt(i, m4);
      });
      m.instanceMatrix.needsUpdate = true;
      // W2-C1: Flammen flackern (Höhe/Breite unruhig, leicht schwankend)
      const fm = this._lavaFlammenMesh;
      if (fm) {
        const e = this._eL || (this._eL = new THREE.Euler());
        this._lavaFlammen.forEach((fl, i) => {
          const a = t * 9 + fl.t0, hoch = fl.h * (0.55 + 0.3 * Math.sin(a) + 0.15 * Math.sin(a * 2.7 + 1));
          e.set(0.18 * Math.sin(a * 0.8), 0, 0.18 * Math.cos(a * 0.6)); q.setFromEuler(e);
          v.set(fl.x, fl.y, fl.z); sk.set(0.8 + 0.25 * Math.sin(a * 1.9), Math.max(0.05, hoch), 0.8 + 0.25 * Math.cos(a * 1.6));
          m4.compose(v, q, sk); fm.setMatrixAt(i, m4);
        });
        fm.instanceMatrix.needsUpdate = true;
        q.identity();
      }
    }

    /**
     * Pylonen-Zustand anzeigen: stehen / umgefahren (blinkt blinkZeit s rot und kippt) / weg.
     * Nur Arbeit, wenn sich etwas geändert hat oder gerade eine blinkt.
     */
    hindernisseAnimieren(zeit) {
      if (this._lavaMat) this._lavaAnimieren(zeit);    // Runde 6 (W2-C)
      const m = this._pylonMesh;
      if (!m || (!this.pylonenGeaendert && !this._blinkt)) return;
      const C = (R.config.hindernisse && R.config.hindernisse.baustelle) || {}, blink = C.blinkZeit || 0.3;
      const mat = this._m4 || (this._m4 = new THREE.Matrix4()), q = this._q || (this._q = new THREE.Quaternion());
      const v = this._v3 || (this._v3 = new THREE.Vector3()), sk = this._sk || (this._sk = new THREE.Vector3());
      const achse = this._achse || (this._achse = new THREE.Vector3()), farbe = this._farbe || (this._farbe = new THREE.Color());
      let blinkt = false;
      for (const p of this._pylonListe) {
        v.set(p.x, p.y, p.z); q.identity(); sk.set(1, 1, 1); farbe.setRGB(1, 1, 1);
        if (p.weg) {
          const t = zeit - p.wegZeit;
          if (t >= 0 && t < blink) {
            blinkt = true;
            achse.set(p.kx || 1, 0, p.kz || 0).normalize();
            q.setFromAxisAngle(achse, Math.min(1.4, t / blink * 1.4));        // kippt um
            if (Math.floor(t / 0.06) % 2 === 0) farbe.setRGB(1.6, 0.1, 0.1); else farbe.setRGB(1.2, 1.2, 1.2);
          } else sk.set(0, 0, 0);
        }
        mat.compose(v, q, sk);
        m.setMatrixAt(p.i, mat);
        m.setColorAt(p.i, farbe);
      }
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
      this._blinkt = blinkt;
      this.pylonenGeaendert = false;
    }
  }

  Strecke.headingAus = headingAus;
  Strecke.varianteAnwenden = varianteAnwenden;   // (daten, varianteId) → skalierte Kopie
  Strecke.weltName = weltName;            // (daten, wunsch) → gültiger Weltname
  Strecke.hindernisMengeGueltig = mengeGueltig;       // 12.10. (menge) → 'normal' | 'viele' | 'sehrViele' (unbekannt → Standard)
  Strecke.weltHatHindernisse = weltHatHindernisse;    // 12.10. (daten, weltWunsch) → hat die Welt Hindernis-Schichten (Menge wirkt)?
  Strecke.weltSchichten = weltSchichten;  // (daten, name) → { schicht: bool }
  Strecke.SCHICHTEN = SCHICHTEN;
  Strecke.SPUR_BREITE = SPUR_BREITE;
  Strecke.SPUR_UEBERGANG = SPUR_UEBERGANG;
  R.Strecke = Strecke;
  R.headingAus = headingAus;
})();
