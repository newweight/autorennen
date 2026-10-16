// ============================================================
// KI-Fahrer (Abschnitt 5): "Hase auf der Ideallinie"
//
// Der Fahrer liefert nur die Steuerung { gas, bremse, lenkung } für
// vehicle.schritt(dt, steuerung) – Physik und Kollisionen macht main.js.
//
// Prinzip:
// - Zielpunkt auf der Mittellinie voraus (Vorausblick wächst mit dem Tempo),
//   seitlich um einen festen Versatz pro Fahrer verschoben (−3…+3 m aus dem Seed),
//   damit nicht alle hintereinander fahren. In Kurven wird ein Versatz zur
//   Innenseite verringert (sonst Randstein/Gras).
// - Lenkung (Runde 3): "Pure Pursuit" – aus dem Winkel zum Zielpunkt eine Soll-Drehrate
//   (2·v·sin α / L), geteilt durch die mögliche Drehrate des Autos (vehicle.drehrateMax).
//   Dadurch gleich stabil bei 30 und 270 km/h (kein Aufschaukeln), kein Kurvenschneiden.
// - Zieltempo: eigenes Tempoprofil je Auto (Driver.tempoProfil – gleiche Querhaftungs-Formel
//   wie vehicle.js) × tempoFaktor, Minimum über das nächste Bremsfenster.
//   Gas darunter, Bremse deutlich darüber, dazwischen rollen.
//   (strecke.idealLinie aus trackBuilder ist auf 45 m/s gedeckelt und wird hier nicht mehr genutzt.)
// - Stufe "unschlagbar": gripBonus (Haftung des KI-Autos), bremsSpaeter (Bremsplan),
//   innenSchneiden (Versatz zur Kurveninnenseite) – alles aus config.schwierigkeiten.
// - Gummiband (Abstand zum besten Spieler), langsame Tempo-Schwankung,
//   gelegentliche kleine Lenkfehler – alles aus config.schwierigkeiten.
// - Ausweichen vor Autos voraus, Festfahren erkennen (rückwärts frei fahren,
//   nach 3 Fehlversuchen brauchtReset), Falsch-herum-Erkennung.
// - Deterministisch: eigener Zufallsgenerator (mulberry32) aus dem Seed.
// Keine Abhängigkeit von Three.js (Node-Tests).
// Runde 4: Fahrbahnbreite je Stelle (strecke.breiteBei, Spuren 1/3) – der seitliche Versatz wird
// am Auto und am Zielpunkt auf ±max(0,5; breiteBei/2 − SPUR_GRENZE_RAND) begrenzt (enge Stellen: Mitte).
// Runde 5: Mindesttempo-Bereiche (this.minTempoBereiche): vor jeder Sprungschanze (strecke.schanzen) ab
// SCHANZE_VORLAUF m bis zur Kante mindestens SCHANZE_TEMPO – gedeckelt auf das 100-%-Ideallinientempo an der Stelle
// (nie schneller als die Kurve erlaubt). Katalog-Feld minTempoBereiche [{ s0, s1, v }] wird zusätzlich übernommen.
// Grund: in Tempo-Klasse „normal" und auf „leicht" sprang die KI sonst mit ~75 km/h (Hüpfer) – Ziel ≥ 90 km/h.
// Runde 6 (W4-J): niveaugleiche Kreuzung (strecke.kreuzungen, Fantasie) – Querverkehr (_querverkehr): Autos auf dem
// querenden Abschnitt sind KEINE Autos „vor mir in der Spur", sondern kreuzen. Aus beiden Ankunftszeiten (Einfahrt/Ausfahrt
// der Kreuzungsfläche) wird ein Konflikt erkannt; wer später einfährt, lässt den anderen vorbei (bremst so, dass er erst
// nach dessen Ausfahrt ankommt). Bei Gleichstand hat Abschnitt A (erste Durchfahrt) Vorfahrt. Wer schon an/auf der
// Kreuzung ist oder nicht mehr anhalten kann, fährt durch (kein Hängenbleiben, kein Rückwärts-Manöver beim Warten);
// nach QUER_GEDULD s Warten fährt die KI trotzdem. Stehende Autos AUF der Kreuzung bleiben normale Hindernisse (ausweichen).
// 14.10. (v18) Gabelung (strecke.gabelungen, Wiese/Wüste): Die KI wählt vor der Teilung EINEN Ast (this.ast −1 links / +1 rechts) und bleibt
// bis zur Zusammenführung darauf. Wahl deterministisch ohne Zufallszahlen: Paritätsbit aus dem Seed (astBasis) + Rundennummer
// (streckeFortschritt / Länge) → jedes Auto wechselt den Ast von Runde zu Runde, die Autos verteilen sich auf beide Äste. Wer (Reset, Start)
// mitten im Abschnitt steht, bleibt auf dem Ast, auf dem er steht. Zum Testen/Erzwingen: driver.astWunsch = −1 | +1.
// Rechnung: die KI arbeitet weiter im Seitenabstand zur Mittellinie; _ao(s) = ast·c(s) ist der Versatz der Astmitte, alle Querlagen (eigene,
// fremde Autos, Ausweichziele) werden relativ zur Astmitte gerechnet (qMe, oq), der Zielpunkt bekommt _ao(sZiel) wieder dazu.
// Tempo: tempoProfil addiert die Zusatzkrümmung der auseinanderlaufenden Äste (strecke.gabelKruemmung).
// ============================================================
(function () {
  const R = window.Rennspiel;

  // --- Fahrverhalten ---
  const LENK_GLAETTUNG = 14;       // 1/s – leichte Glättung vor der Fahrzeug-Glättung
  const BLICK_ZEIT = 0.7;         // s × Tempo Vorausblick der Lenkung …
  const BLICK_MIN = 9, BLICK_MAX = 60;  // … in diesen Grenzen (m)
  const LENK_VORHALT = 0.2;        // s – Pose so weit voraus schätzen (Lenkverzug)
  const BREMS_ANTEIL = 0.6;        // geplante Verzögerung = 60 % der Bremsleistung des Autos
  const QUER_SICHERHEIT = 0.9;     // Kurventempo mit 90 % der Querhaftung planen (Reserve zum Korrigieren)
  const ROLLEN_BAND = 1.5;         // m/s über dem Zieltempo: nur rollen, nicht bremsen
  const VERSATZ_MAX = 3;           // m seitlicher Grundversatz (± aus dem Seed)
  const SPUR_GRENZE_RAND = 2.2;    // m Abstand der Auto-Mitte zum Straßenrand (mindestens)
  const ASTWAHL_VORAUS = 140, ASTWAHL_NACH = 40;   // 14.10. (v18): Gabelung – so weit vor der Teilung wird der Ast gewählt, so weit nach der Zusammenführung gilt er noch
  const SCHANZE_VORLAUF = 80;      // m vor der Rampe beginnt der Mindesttempo-Bereich (Runde 5)
  const SCHANZE_TEMPO = 27;        // m/s (≈ 97 km/h) Mindest-Zieltempo bis zur Kante (Reserve über 90 km/h)

  // --- Gummiband ---
  const GUMMI_TOTZONE = 60;        // m – darunter kein Effekt
  const GUMMI_RAMPE = 120;         // m – weiche Rampe bis zum vollen Effekt
  // Vorne liegend: bis −50 % × gummiband (leicht −30 %), hinten liegend bis +60 % × gummiband (leicht +36 %).
  // Runde 3: stärker als vorher, weil bei 220–270 km/h Abstände auf Geraden viel schneller wachsen.
  const GUMMI_MAX_VORNE = 0.5;
  const GUMMI_MAX_HINTEN = 0.6;

  // --- Fehler ---
  const SCHWANKUNG_PERIODE = 90;   // s
  const SCHWANKUNG_AMPLITUDE = 0.03; // × fehler
  const SCHLENKER_DAUER = 0.4;     // s

  // --- Ausweichen ---
  // Prüffenster voraus: max(12 m, 2 s × Tempo). Ein Auto gilt als Hindernis, wenn es
  // höchstens ±3 m neben der eigenen Linie steht. Der Versatz wird über die Strecke
  // VOR dem Hindernis sanft eingeblendet und erst ein gutes Stück dahinter zurückgenommen.
  const AUSWEICH_MIN = 12;         // m
  const AUSWEICH_ZEIT = 2.0;       // s × Tempo (bei 250 km/h ≈ 140 m)
  const AUSWEICH_SEITE = 3;        // m um die eigene Linie
  const AUSWEICH_GAS_WEG = 6;      // m – direkt dahinter in der Spur: Gas weg
  const AUSWEICH_ABSTAND = 3.6;    // m seitlicher Abstand beim Vorbeifahren (fahrendes Auto)
  const AUSWEICH_ABSTAND_LANGSAM = 4.0; // m bei stehenden/sehr langsamen Autos
  const LANGSAM_TEMPO = 5;         // m/s – darunter gilt ein Auto als "steht"
  const LANGSAM_FENSTER_MIN = 30; // m – stehende Autos früher sehen (in langsamen Kurven)
  const LANGSAM_FENSTER_ZEIT = 2.5; // s × Tempo
  const LANGSAM_FAKTOR = 0.6;      // Zieltempo höchstens 60 %, bis vorbei (nicht anhalten)
  const KRIECH_TEMPO = 2.5;
  // v27 F5: Gegenverkehr (Geisterfahrer) – früh (ab ~80 m) auf die abgewandte Seite, Tempo leicht runter
  const GEGEN_FENSTER = 80;        // m (Mindestfenster)
  const GEGEN_ZEIT = 4;            // s × Annäherungstempo – bei hoher Annäherung noch früher
  const GEGEN_MIN_TEMPO = 8;       // m/s entgegen der Streckenrichtung (nur wer vorwärts in seiner Nase-Richtung fährt)
  const GEGEN_VOR = 50;            // m – Ausweichversatz schon so weit vor dem Treffpunkt voll
  const GEGEN_FAKTOR = 0.85;       // Zieltempo-Faktor, solange Gegenverkehr voraus ist
  const NEBEN = 4.5;               // m Längsabstand: darunter fährt das andere Auto neben mir        // m/s, wenn ein stehendes Auto direkt vor der Nase ist
  const RAMPE_MIN = 18;            // m Einblend-Strecke (mindestens)
  const RAMPE_ZEIT = 1.1;          // s × Tempo Einblend-Strecke

  // --- Streckenhindernisse (strecke.hindernisse, von trackBuilder) ---
  // Baustelle/Ast: HART meiden – ab max(40 m, 2,5 s × Tempo) vorher auf die freie Hälfte,
  // erst 15 m nach dem Ende zurück. Öl/Sand: weich umfahren, wenn seitlich Platz ist, sonst −15 % Tempo.
  const HART_MIN = 40, HART_ZEIT = 2.5;    // m bzw. s × Tempo Vorlauf
  const HART_NACH = 15;                     // m nach dem Ende
  const HART_GRENZE = 1.8;                  // m – Auto-Mitte mindestens so weit in der freien Hälfte
  const HART_TEMPO = 0.92;                  // Zieltempo im Bereich (enge Durchfahrt)
  const WEICH_MIN = 30, WEICH_ZEIT = 2.0;
  const WEICH_ABSTAND = 1.6;                // m Abstand Auto-Mitte zum Fleckrand
  const WEICH_TEMPO = 0.85;                 // −15 %, wenn nicht vorbei

  // --- Nach einem Stoß ---
  const STOSS_EINBRUCH = 8;        // m/s Tempoverlust …
  const STOSS_FENSTER = 0.2;       // … innerhalb dieser Zeit
  const STOSS_HALTEN = 0.5;        // s Versatz zur freien Seite halten
  const STOSS_VERSATZ = 2.5;       // m

  // --- Festfahren / falsch herum ---
  const FEST_TEMPO = 1;            // m/s
  const FEST_KRIECHEN = 2.5;       // v15: m/s – falsch herum UND so langsam zählt auch als festgefahren (Kriechen an der Bande/im Sand, z. B. nach Abdrängen)
  const FEST_ZEIT = 2.5;           // s
  const RUECK_ZEIT = 1.2;          // s
  const FEST_VERSUCHE = 3;
  const FALSCH_WINKEL = 110 * Math.PI / 180;

  // --- Runde 6 (W4-J): Querverkehr an niveaugleichen Kreuzungen ---
  const QUER_AUTO = 3.2;           // m: Kreuzungsfläche (halbL) + halbe Autolänge + Luft = „belegt"
  const QUER_MARGE = 0.5;          // s Sicherheitsabstand zwischen den Belegungszeiten
  const QUER_VORAUS_ANDERE = 120;  // m: Autos so weit vor der Kreuzung (anderer Abschnitt) werden beachtet
  const QUER_GEDULD = 5;           // s langsames Warten (< 3 m/s) → dann trotzdem fahren (für QUER_MUTIG s)
  const QUER_MUTIG = 2.5;
  const QUER_NOTBREMS = 1.5;       // Bremsweg-Rechnung mit stärkerer Bremse (aBrems × 1,5) – kann ich noch anhalten?

  /** Kleiner deterministischer Zufallsgenerator (mulberry32) → Werte 0..1. */
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /** Seed aus Zahl oder Text (FNV-1a). */
  function seedZahl(seed) {
    if (typeof seed === 'number' && isFinite(seed)) return (seed * 2654435761) >>> 0;
    const text = String(seed === undefined ? 'ki' : seed);
    let h = 2166136261;
    for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }

  /** Winkel auf -π..π bringen. */
  function winkelNorm(w) {
    if (w !== w) return w;                               // NaN bleibt NaN (wie bisher)
    if (!(Math.abs(w) < 1e3)) w = Number.isFinite(w) ? w % (2 * Math.PI) : 0;   // v26b: Infinity/riesig → sonst Endlosschleife (w -= 2π ändert nichts mehr)
    while (w > Math.PI) w -= 2 * Math.PI;
    while (w < -Math.PI) w += 2 * Math.PI;
    return w;
  }

  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  /** Vorausblick der Lenkung (m) bei Tempo v. */
  const blick = (v) => clamp(BLICK_ZEIT * Math.max(0, v) + 8, BLICK_MIN, BLICK_MAX);
  /** Weicher Übergang 0..1 (smoothstep). */
  const glatt = (x) => { const t = clamp(x, 0, 1); return t * t * (3 - 2 * t); };

  class Driver {
    /**
     * @param {Vehicle} vehicle
     * @param {Strecke} strecke
     * @param {{schwierigkeit?:string, seed?:number|string, name?:string}} [optionen]
     */
    constructor(vehicle, strecke, optionen) {
      const opt = Object.assign({ schwierigkeit: R.config.schwierigkeitStandard, seed: 1, name: 'Computer' }, optionen);
      this.vehicle = vehicle;
      this.strecke = strecke;
      this.spline = strecke.spline;
      this.name = opt.name;
      this.schwierigkeit = opt.schwierigkeit;
      const st = R.config.schwierigkeiten[opt.schwierigkeit] || R.config.schwierigkeiten.mittel;
      this.tempoFaktor = st.tempoFaktor;
      this.gummiband = st.gummiband;
      this.gummibandHinten = st.gummibandHinten !== undefined ? st.gummibandHinten : st.gummiband;
      this.fehler = st.fehler;
      this.bremsSpaeter = st.bremsSpaeter || 1;
      this.innenSchneiden = st.innenSchneiden || 0;
      // Runde 6 (W1-A4): gezieltes Rempeln (nur Einstellung rempeln 'echt', ab Stufe profi)
      this.rang = st.rang || 0;
      this.rammPause = 0; this.rammRest = 0; this.rammWert = 0; this.rempler = 0;
      // Haftungs-Bonus wirkt in der Physik (vehicle.schritt) – nur für dieses KI-Auto
      vehicle.gripBonus = st.gripBonus || 1;
      // geplante Bremsverzögerung (m/s²) aus der Bremsleistung des Autos
      this.aBrems = BREMS_ANTEIL * (vehicle.daten.bremsen || 20) * this.bremsSpaeter;
      this.profil = Driver.tempoProfil(strecke, vehicle, { aBrems: this.aBrems, innen: this.innenSchneiden });

      this.zufall = mulberry32(seedZahl(opt.seed));
      // Wer innen schneidet, fährt sonst auf der Ideallinie (nur kleiner Seed-Versatz)
      this.versatzBasis = (this.zufall() * 2 - 1) * VERSATZ_MAX * (this.innenSchneiden ? 0.3 : 1);
      this.astBasis = Math.floor((this.versatzBasis + VERSATZ_MAX) * 997) & 1;   // 14.10. (v18): Paritätsbit für die Astwahl (ohne neue Zufallszahl)
      this.ast = 0; this.astSchluessel = null; this.astWunsch = 0;
      this.schwankungPhase = this.zufall() * 2 * Math.PI;

      this.index = -1;              // Suchhilfe für spline.naechster()
      this.zeit = 0;                // Fahrzeit seit Start (s)
      this.lenkung = 0;             // geglättete Lenkung
      this.hindernisse = [];        // [{ d (m voraus), ziel (Seitenabstand), langsam }]
      this.seitenMerk = new Map();  // Hindernis-Vehicle → gewählte Seite (−1 links / +1 rechts)
      this.tempoVerlauf = [];       // [[zeit, vLaengs]] der letzten ~0,25 s
      this.stossRest = 0;           // s, in denen nach einem Stoß ausgewichen wird
      this.stossZiel = 0;           // Seitenabstand während der Stoß-Reaktion
      this.schlenkerRest = 0;       // laufender Lenkfehler (s)
      this.schlenkerWert = 0;
      this.naechsterSchlenker = this._schlenkerAbstand();

      this.querWarten = false;      // W4-J: lässt gerade Querverkehr an einer Kreuzung vorbei
      this.querWarteZeit = 0; this.querMutigRest = 0; this.querGewartet = 0;
      this.festZeit = 0;            // so lange schon (fast) Stillstand
      this.rueckRest = 0;           // laufendes Rückwärtsmanöver (s)
      this.rueckLenkung = 0;
      this.fehlversuche = 0;
      this.freiZeit = 0;            // so lange schon wieder flott unterwegs
      this.brauchtReset = false;

      this.zieltempo = 0;           // zur Anzeige/Fehlersuche
      this.falschHerum = false;
      this.streckenHindernisse = [];
      this.hindernisseSetzen(strecke.hindernisse);
      // Runde 5: Mindesttempo vor Schanzen (+ optional aus dem Katalog)
      this.minTempoBereiche = (strecke.schanzen || []).map((e) => ({ s0: e.s - SCHANZE_VORLAUF, s1: e.s + (e.laenge || 10), v: SCHANZE_TEMPO }))
        .concat(((strecke.daten && strecke.daten.minTempoBereiche) || []).map((b) => ({ s0: b.s0, s1: b.s1, v: b.v })));
    }

    /** Runde 5: Mindest-Zieltempo an Bogenlänge s (0 = keins). */
    _minTempo(s) {
      let v = 0;
      const sp = this.spline;
      for (const b of this.minTempoBereiche) {
        const d = sp.wrapS(s - b.s0);
        if (d <= b.s1 - b.s0 && b.v > v) v = b.v;
      }
      return v;
    }

    /**
     * Hindernisse der Strecke übernehmen (main.js ruft das nach dem Rennaufbau auf).
     * Erwartet { typ:'oel'|'sand'|'baustelle'|'ast', s0, s1, seitenabstand, halbbreite, seite? }.
     */
    hindernisseSetzen(liste) {
      this.streckenHindernisse = (liste || []).filter((h) => h && h.s0 !== undefined && h.s1 !== undefined);
    }

    /**
     * Streckenhindernisse voraus in this.hindernisse eintragen (gleiche Rampen wie beim Ausweichen
     * vor Autos). Liefert den Tempofaktor (1 oder kleiner).
     */
    _streckenHindernisse(n, tempo, grenze) {
      const sp = this.spline, st = this.strecke;
      let faktor = 1;
      for (const h of this.streckenHindernisse) {
        // Runde 4: Wracks (liegengeblieben/brennend) sind feste Hindernisse → ausweichen wie bei der Baustelle
        const hart = h.typ === 'baustelle' || h.typ === 'ast' || h.typ === 'wrack' || h.typ === 'brand' || !!h.hart;   // Runde 6: Lava (h.hart)
        const d0 = sp.differenzS(h.s0, n.s), d1 = sp.differenzS(h.s1, n.s);
        const b = (st.breiteBei ? st.breiteBei(h.s) : st.breite) / 2;
        const vorlauf = hart ? Math.max(HART_MIN, HART_ZEIT * tempo) : Math.max(WEICH_MIN, WEICH_ZEIT * tempo);
        const nach = hart ? HART_NACH : 6;
        if (d0 > vorlauf || d1 < -nach) continue;
        if (hart) {
          const seite = h.seite || Math.sign(h.seitenabstand) || 1;
          const ziel = -seite * Math.min(grenze, Math.max(HART_GRENZE + 0.6, b * 0.5));
          this.hindernisse.push({ d: d0, dEnde: d1, nach, ziel, hart: true, seite, vor: 10 });
          if (d0 < vorlauf * 0.6) faktor = Math.min(faktor, HART_TEMPO);
        } else {
          // Seite mit mehr Platz; passt das Auto dort nicht hin → langsam drüber
          const links = h.seitenabstand - h.halbbreite - WEICH_ABSTAND;
          const rechts = h.seitenabstand + h.halbbreite + WEICH_ABSTAND;
          const ok = (q) => q >= -grenze && q <= grenze;
          let ziel = null;
          if (ok(links) && ok(rechts)) ziel = Math.abs(links - n.seitenabstand) < Math.abs(rechts - n.seitenabstand) ? links : rechts;
          else if (ok(links)) ziel = links;
          else if (ok(rechts)) ziel = rechts;
          if (ziel !== null) this.hindernisse.push({ d: d0, dEnde: d1, nach, ziel, weich: true, vor: 4 });
          else if (d0 < vorlauf * 0.7) faktor = Math.min(faktor, WEICH_TEMPO);
        }
      }
      return faktor;
    }

    _schlenkerAbstand() { return 10 + this.zufall() * 15; }

    /** Nach einem Reset durch main.js aufrufen: Zustände zurücksetzen. index (W4-I, optional) = Streckenindex nach dem Reset. */
    zurueckgesetzt(index) {
      this.index = index !== undefined && index !== null && index >= 0 ? index : -1;
      this.brauchtReset = false;
      this.festZeit = 0; this.rueckRest = 0; this.fehlversuche = 0; this.freiZeit = 0;
      this.lenkung = 0; this.schlenkerRest = 0;
      this.hindernisse = []; this.seitenMerk.clear(); this.tempoVerlauf = []; this.stossRest = 0;
    }

    /**
     * Steuerbefehle für diesen Physikschritt.
     * @param {number} dt
     * @param {{andere?:{vehicle:object,fortschritt:number}[], spielerFortschrittMax?:number|null,
     *          eigenerFortschritt?:number, laeuft?:boolean}} [umfeld]
     * @returns {{gas:number, bremse:number, lenkung:number}}
     */
    steuerung(dt, umfeld) {
      const u = umfeld || {};
      const v = this.vehicle, sp = this.spline, strecke = this.strecke;
      // W4-J: an einer niveaugleichen Kreuzung mit Index-Kontinuität (eigener Abschnitt bleibt)
      const kreuz = !!(strecke.kreuzungen && strecke.kreuzungen.length && strecke._naechsterKont);
      const n = kreuz ? strecke._naechsterKont(v.x, v.z, this.index) : sp.naechster(v.x, v.z, this.index);
      this.index = n.index;

      // Vor dem Start: stehen bleiben (Bremse würde im Stand rückwärts fahren)
      if (u.laeuft === false) {
        this.lenkung = 0;
        return { gas: 0, bremse: 0, lenkung: 0 };
      }
      this.zeit += dt;
      const tempo = v.vLaengs;
      const p = sp.punktBei(n.s);
      // 14.10. (v18): Gabelung – Ast wählen; qMe = eigene Querlage relativ zur Astmitte (ohne Gabelung = n.seitenabstand)
      if (strecke.gabelungen && strecke.gabelungen.length) this._astWaehlen(n); else if (this.ast) this.ast = 0;
      const qMe = this.ast ? n.seitenabstand - this._ao(n.s) : n.seitenabstand;
      // W4-J: Querverkehr an Kreuzungen (vor dem Festfahr-Check: Warten ist kein Festfahren)
      const quer = kreuz ? this._querverkehr(n, tempo, u.andere || [], dt) : null;
      if (quer && quer.wartet) this.festZeit = 0;

      // ---------- Festfahren: rückwärts frei fahren ----------
      if (this.rueckRest > 0) {
        this.rueckRest -= dt;
        if (this.rueckRest <= 0) this.festZeit = 0;
        return { gas: 0, bremse: 1, lenkung: this.rueckLenkung };
      }
      if (Math.abs(tempo) < FEST_TEMPO || (this.falschHerum && Math.abs(tempo) < FEST_KRIECHEN)) {
        this.festZeit += dt;
        this.freiZeit = 0;
      } else {
        this.festZeit = 0;
        if (tempo > 5) {
          this.freiZeit += dt;
          if (this.freiZeit > 3) this.fehlversuche = 0;   // wieder frei → Zähler zurück
        }
      }
      if (this.festZeit > FEST_ZEIT) {
        this.fehlversuche++;
        this.festZeit = 0;
        if (this.fehlversuche >= FEST_VERSUCHE) {
          this.brauchtReset = true;
        } else {
          // Gegenlenken: rückwärts lenkt spiegelverkehrt → Nase dreht zur Strecke
          const hZiel = R.headingAus(p.tx, p.tz);
          const diff = winkelNorm(hZiel - v.heading);
          const zurMitte = -qMe;   // >0: Mitte liegt links
          const richtung = Math.abs(diff) > 0.15 ? diff : zurMitte * 0.1;
          this.rueckLenkung = richtung > 0 ? 1 : -1;
          this.rueckRest = RUECK_ZEIT;
          return { gas: 0, bremse: 1, lenkung: this.rueckLenkung };
        }
      }

      // ---------- Falsch herum? ----------
      const hTangente = R.headingAus(p.tx, p.tz);
      const winkelZurTangente = winkelNorm(hTangente - v.heading);
      this.falschHerum = Math.abs(winkelZurTangente) > FALSCH_WINKEL;
      if (this.falschHerum) {
        this.zieltempo = 6;
        const lenk = winkelZurTangente > 0 ? -1 : 1;
        this.lenkung += (lenk - this.lenkung) * Math.min(1, LENK_GLAETTUNG * dt);
        const gas = tempo < 6 ? 0.6 : 0, bremse = tempo > 9 ? 0.6 : 0;
        return { gas, bremse, lenkung: this.lenkung };
      }

      // ---------- Ausweichen ----------
      const grenze = this._grenzeBei(n.s);
      const fenster = Math.max(AUSWEICH_MIN, AUSWEICH_ZEIT * Math.max(0, tempo));
      const fensterLangsam = Math.max(LANGSAM_FENSTER_MIN, LANGSAM_FENSTER_ZEIT * Math.max(0, tempo), fenster);
      const andere = u.andere || [];
      let gasWeg = false, bremsNoetig = 0, langsamVoraus = false, kriechen = false, gegenVoraus = false;
      const gesehen = new Set();
      let naechsterAndererQ = null, naechsterAbstand = Infinity;
      this.hindernisse = [];
      for (const o of andere) {
        const ov = o.vehicle;
        if (!ov || ov === v) continue;
        if (quer && quer.quer.has(ov)) continue;     // W4-J: Querverkehr (kreuzt, fährt nicht vor mir) – eigene Regel oben
        const dx = ov.x - v.x, dz = ov.z - v.z, abst = Math.hypot(dx, dz);
        let fernGegen = false;
        if (abst > fensterLangsam + 15) { if (abst > Math.max(GEGEN_FENSTER, GEGEN_ZEIT * (Math.max(0, tempo) + (ov.vLaengs || 0))) + 15 || !(ov.vLaengs > 0)) continue; fernGegen = true; }
        const on = sp.naechster(ov.x, ov.z, this.index);
        // v27 F5: Gegenverkehr = Geschwindigkeit entgegen der Streckenrichtung (Skalarprodukt mit der Tangente < 0), fährt vorwärts in seiner Nase-Richtung
        let gegen = false, vGegen = 0;
        if (ov.vLaengs > 0) {
          const wgo = ov.weltGeschwindigkeit(), tp = sp.punktBei(on.s), dotG = wgo.x * tp.tx + wgo.z * tp.tz;
          if (dotG < -GEGEN_MIN_TEMPO) { gegen = true; vGegen = dotG; }
        }
        if (fernGegen && !gegen) continue;
        if (this._andereEbene(ov, on)) continue;     // W4-I: Auto auf der anderen Ebene (Überführung) – kein Gegner hier
        const oq = this.ast ? on.seitenabstand - this._ao(on.s) : on.seitenabstand;   // 14.10. (v18): relativ zur Astmitte
        if (abst < naechsterAbstand) { naechsterAbstand = abst; naechsterAndererQ = oq; }
        const voraus = sp.differenzS(on.s, n.s);
        const vo = gegen ? vGegen : (ov.vLaengs || 0);
        // Direkt neben mir (Längsabstand < NEBEN): nie als "stehendes" Auto behandeln – sonst
        // kriechen zwei sich berührende Autos gemeinsam (das eine bremst, das andere wird mitgezogen)
        const neben = Math.abs(voraus) < NEBEN;
        const langsam = Math.abs(vo) < LANGSAM_TEMPO && !neben;
        if (voraus > (langsam ? fensterLangsam : (gegen ? Math.max(fenster, GEGEN_FENSTER, GEGEN_ZEIT * (Math.max(0, tempo) - vGegen)) : fenster))) continue;
        // schon neben/knapp hinter mir: nur weiter beachten, wenn ich ihm gerade ausweiche
        // oder es direkt neben mir fährt (dann auseinander, sonst verhaken sich die Autos)
        if (voraus <= 0 && (voraus < -6 || (!this.seitenMerk.has(ov) && !neben))) continue;
        // fahrende Autos weiter vorn nur, wenn ich schneller bin (sonst kein Grund)
        if (!langsam && voraus > AUSWEICH_MIN && tempo - vo < 1) continue;
        const linie = this._grundVersatz(on.s);
        const inMeinerSpur = Math.abs(oq - qMe) < 2.2;
        const blockiert = gegen || Math.abs(oq - linie) < AUSWEICH_SEITE ||   // v27 F5: Gegenverkehr wechselt die Spur – immer ausweichen, bis vorbei
          (voraus < AUSWEICH_MIN && inMeinerSpur) || (neben && inMeinerSpur);
        if (!blockiert) continue;

        // Seite wählen (pro Hindernis gemerkt, kein Hin-und-her): bevorzugt die Seite,
        // auf der ich schon bin – wenn dort genug Platz ist, sonst die andere.
        const abstand = langsam ? AUSWEICH_ABSTAND_LANGSAM : AUSWEICH_ABSTAND;
        const platz = seite => (seite > 0 ? grenze - oq : oq + grenze);
        let seite = this.seitenMerk.get(ov) || 0;
        // Direkt daneben: immer auf der Seite bleiben, auf der ich bin (nicht "durch" das Auto)
        if (neben) seite = qMe >= oq ? 1 : -1;
        if (!seite) {
          seite = qMe >= oq ? 1 : -1;
          if (platz(seite) < 2.4) seite = -seite;
        }
        this.seitenMerk.set(ov, seite);
        gesehen.add(ov);
        // v27 F5: Gegenverkehr wechselt selbst die Spur – deshalb ganz an den Rand der abgewandten Seite, nicht relativ zu seiner aktuellen Lage
        const ziel = gegen ? seite * grenze : clamp(oq + seite * abstand, -grenze, grenze);
        // Gegenverkehr: Treffpunkt statt Position des anderen Autos (beide fahren aufeinander zu) – so setzt das Ausweichen früh genug ein
        this.hindernisse.push({ d: gegen && voraus > 0 ? voraus * Math.max(tempo, 5) / (Math.max(tempo, 5) - vGegen) : voraus, ziel, langsam, vor: gegen ? GEGEN_VOR : undefined });
        if (langsam && voraus > -6) langsamVoraus = true;
        if (gegen && voraus > 0) gegenVoraus = true;

        // Kein Rammen: direkt vor mir in der Spur → stehendes Auto: nur noch kriechen
        // (lenkt dabei vorbei, kein Stau), fahrendes Auto: Gas weg / bremsen
        if (voraus > 0 && voraus < AUSWEICH_GAS_WEG && inMeinerSpur && !neben) {
          if (langsam) kriechen = true;
          else {
            gasWeg = true;
            if (tempo > vo + 1.5) bremsNoetig = Math.max(bremsNoetig, clamp((tempo - vo) / 6, 0.2, 1));
          }
        }
      }
      for (const ov of this.seitenMerk.keys()) if (!gesehen.has(ov)) this.seitenMerk.delete(ov);
      const hindernisFaktor = this._streckenHindernisse(n, Math.max(0, tempo), grenze);

      // ---------- Stoß erkannt? (Tempo bricht plötzlich ein) ----------
      this.tempoVerlauf.push([this.zeit, tempo]);
      while (this.tempoVerlauf.length > 2 && this.zeit - this.tempoVerlauf[1][0] >= STOSS_FENSTER) this.tempoVerlauf.shift();
      const frueher = this.tempoVerlauf[0];
      if (this.stossRest <= 0 && this.zeit - frueher[0] >= STOSS_FENSTER - 1e-9 && frueher[1] - tempo > STOSS_EINBRUCH) {
        // weg vom nächsten Auto, sonst Richtung Mitte
        let seite = naechsterAndererQ !== null ? Math.sign(qMe - naechsterAndererQ) : -Math.sign(qMe);
        if (!seite) seite = 1;
        this.stossZiel = clamp(qMe + seite * STOSS_VERSATZ, -grenze, grenze);
        this.stossRest = STOSS_HALTEN;
      }
      if (this.stossRest > 0) this.stossRest -= dt;

      // ---------- Zielpunkt und Lenkung ----------
      const vorausblick = blick(tempo);
      const sZiel = n.s + vorausblick;
      // Versatz bei voller und halber Vorausschau – der stärker ausweichende gewinnt,
      // damit die Sehne zum Zielpunkt nicht am Hindernis vorbeischneidet
      const vA = this._spurVersatz(n.s, vorausblick, tempo, grenze);
      const vB = this._spurVersatz(n.s, vorausblick / 2, tempo, grenze);
      const q = (vB.w > vA.w ? vB.q : vA.q) + (this.ast ? this._ao(sZiel) : 0);   // 14.10. (v18): + Versatz der Astmitte am Zielpunkt
      const z = sp.punktBei(sZiel);
      const zx = z.x + z.nx * q, zz = z.z + z.nz * q;
      // Lenkverzug ausgleichen: Pose LENK_VORHALT s voraus schätzen (Lenkung wirkt geglättet,
      // sonst überschwingt die KI bei hohem Tempo)
      const vLenk = Math.max(3, Math.abs(tempo));
      const rateMax = Math.max(0.05, v.drehrateMax(vLenk));
      const wg = v.weltGeschwindigkeit();
      const px = v.x + wg.x * LENK_VORHALT, pz = v.z + wg.z * LENK_VORHALT;
      const ph = v.heading - v.lenkung * rateMax * LENK_VORHALT * (tempo >= 0 ? 1 : -1);
      const hZiel = R.headingAus(zx - px, zz - pz);
      const diff = winkelNorm(hZiel - ph);
      // Pure Pursuit: Kreisbogen durch Auto und Zielpunkt → Soll-Drehrate 2·v·sin α / L
      const L = Math.max(4, Math.hypot(zx - px, zz - pz));
      const rateSoll = 2 * vLenk * Math.sin(clamp(diff, -1.4, 1.4)) / L;
      let lenkZiel = clamp(-rateSoll / rateMax, -1, 1);    // heading größer = links = negativ

      // gelegentlicher kleiner Schlenker
      if (this.fehler > 0) {
        this.naechsterSchlenker -= dt;
        if (this.naechsterSchlenker <= 0) {
          this.schlenkerRest = SCHLENKER_DAUER;
          this.schlenkerWert = (this.zufall() < 0.5 ? -1 : 1) * this.fehler * (0.8 + 0.6 * this.zufall());
          this.naechsterSchlenker = this._schlenkerAbstand();
        }
        if (this.schlenkerRest > 0) {
          this.schlenkerRest -= dt;
          lenkZiel = clamp(lenkZiel + this.schlenkerWert, -1, 1);
        }
      }
      // ---------- Runde 6: gezielt rempeln (rempeln 'echt', ab Stufe profi, höchstens 1× je kiPause s) ----------
      // Gegner ≤ kiAbstand m voraus und seitlich < kiVersatz m versetzt → kurzer leichter Lenkimpuls zu ihm hin.
      if (this.rammPause > 0) this.rammPause -= dt;
      if (this.rammRest > 0) {
        this.rammRest -= dt;
        lenkZiel = clamp(lenkZiel + this.rammWert, -1, 1);
      } else if (u.rempeln === 'echt' && this.rammPause <= 0 && tempo > 8) {
        const RP = (R.config.kollision && R.config.kollision.rempeln) || {};
        if (this.rang >= (RP.kiAbRang || 4)) {
          for (const o of andere) {
            const ov = o.vehicle;
            if (!ov || ov === v || ov.imLooping || ov.imFlug || (quer && quer.quer.has(ov))) continue;   // W4-J: Querverkehr nicht rammen
            if (Math.hypot(ov.x - v.x, ov.z - v.z) > (RP.kiAbstand || 6) + 3) continue;
            const on = sp.naechster(ov.x, ov.z, this.index);
            if (this._andereEbene(ov, on)) continue;   // W4-I
            const voraus = sp.differenzS(on.s, n.s), dq = on.seitenabstand - n.seitenabstand;
            if (voraus <= 0 || voraus > (RP.kiAbstand || 6) || Math.abs(dq) >= (RP.kiVersatz || 1.5) || Math.abs(dq) < 0.2) continue;
            this.rammWert = Math.sign(dq) * (RP.kiLenkung || 0.35);   // rechts (+) = Lenkung positiv
            this.rammRest = RP.kiDauer || 0.35;
            this.rammPause = RP.kiPause || 10;
            this.rempler++;
            lenkZiel = clamp(lenkZiel + this.rammWert, -1, 1);
            break;
          }
        }
      }
      this.lenkung += (lenkZiel - this.lenkung) * Math.min(1, LENK_GLAETTUNG * dt);

      // ---------- Zieltempo ----------
      let faktor = this.tempoFaktor * this._gummiFaktor(u);
      if (this.fehler > 0) {
        faktor *= 1 + SCHWANKUNG_AMPLITUDE * this.fehler *
          Math.sin(2 * Math.PI * this.zeit / SCHWANKUNG_PERIODE + this.schwankungPhase);
      }
      let soll = this._zieltempo(n.s + Math.max(0, tempo) * 0.1, Math.max(0, tempo), faktor);
      // Runde 5: Mindesttempo vor Schanzen (nie über dem 100-%-Ideallinientempo hier)
      if (this.minTempoBereiche.length) {
        const mt = this._minTempo(n.s);
        if (mt > soll) soll = Math.max(soll, Math.min(mt, this.profil.tempoBei(n.s + Math.max(0, tempo) * 0.1)));
      }
      soll *= hindernisFaktor;
      if (quer && quer.soll < soll) soll = quer.soll;   // W4-J: Querverkehr vorbeilassen
      if (gegenVoraus) soll *= GEGEN_FAKTOR;
      if (langsamVoraus) soll *= LANGSAM_FAKTOR;   // vorsichtig vorbei, aber weiterfahren
      if (kriechen) soll = Math.min(soll, KRIECH_TEMPO);
      this.zieltempo = soll;

      let gas = 0, bremse = 0;
      const e = soll - tempo;
      if (e > 0) gas = clamp(e / 0.8, 0.15, 1);
      else if (e < -ROLLEN_BAND && tempo > 0.5) bremse = clamp((-e - ROLLEN_BAND) / 2 + 0.35, 0, 1);
      if (gasWeg) gas = 0;
      if (bremsNoetig > 0 && tempo > 0.5) bremse = Math.max(bremse, bremsNoetig);
      if (bremse > 0) gas = 0;
      return { gas, bremse, lenkung: this.lenkung };
    }

    /**
     * W4-J: Querverkehr an niveaugleichen Kreuzungen. n = eigene Abfrage, andere = Teilnehmer ({ vehicle, s? }).
     * Liefert { soll (m/s, Infinity = frei), quer: Set der kreuzenden Autos (fahren, also nicht „vor mir"), wartet }.
     * Konflikt: Belegungszeiten der Kreuzungsfläche (± QUER_MARGE) überlappen; später Einfahrender gibt nach.
     */
    _querverkehr(n, tempo, andere, dt) {
      const st = this.strecke, sp = this.spline, v = this.vehicle;
      const erg = this._querErg || (this._querErg = { soll: Infinity, quer: new Set(), wartet: false });
      erg.soll = Infinity; erg.quer.clear(); erg.wartet = false;
      if (this.querMutigRest > 0) this.querMutigRest -= dt;
      const aNot = this.aBrems * QUER_NOTBREMS;
      for (const k of st.kreuzungen) {
        const dA = sp.differenzS(k.sA, n.s), dB = sp.differenzS(k.sB, n.s);
        const meinA = Math.abs(dA) <= Math.abs(dB), dMe = meinA ? dA : dB, sO = meinA ? k.sB : k.sA;
        const B = k.halbL + QUER_AUTO;
        const vorMe = Math.max(70, tempo * tempo / (2 * aNot) + B + 30);
        if (dMe < -B || dMe > vorMe) continue;
        const vMe = Math.max(1, tempo);
        const inMe = (dMe - B) / vMe, outMe = (dMe + B) / vMe;
        // schon an/auf der Kreuzung oder Anhalten unmöglich → durchfahren (die anderen müssen warten)
        const fest = dMe - B <= 0.5 || tempo * tempo / (2 * aNot) > dMe - B - 0.5;
        for (const o of andere) {
          const ov = o && o.vehicle;
          if (!ov || ov === v || o.ausgeschieden || ov.imLooping) continue;
          const so = typeof o.s === 'number' ? o.s : sp.naechster(ov.x, ov.z).s;
          const dO = sp.differenzS(sO, so);
          if (dO < -B || dO > QUER_VORAUS_ANDERE) continue;          // nicht (mehr) auf der Zufahrt des anderen Abschnitts
          const vo = Math.max(0, ov.vLaengs || 0);
          if (vo < 0.8) continue;                                     // steht: vor der Kreuzung egal, auf ihr = normales Hindernis
          erg.quer.add(ov);
          if (fest || this.querMutigRest > 0) continue;
          const inO = (dO - B) / vo, outO = (dO + B) / vo;
          if (!(inMe < outO + QUER_MARGE && inO < outMe + QUER_MARGE)) continue;   // kein Konflikt
          if (inMe < inO - 0.05 || (Math.abs(inMe - inO) <= 0.05 && meinA)) continue;   // ich bin zuerst dran
          // nachgeben: erst nach der Ausfahrt des anderen (+ Marge) an der Haltelinie ankommen
          const ziel = Math.max(0, (dMe - B - 1.5) / (Math.max(0, outO) + QUER_MARGE));
          if (ziel < erg.soll) erg.soll = ziel;
          erg.wartet = true;
        }
      }
      if (erg.wartet) {
        this.querGewartet += dt;
        if (tempo < 3) this.querWarteZeit += dt;
        if (this.querWarteZeit > QUER_GEDULD) { this.querMutigRest = QUER_MUTIG; this.querWarteZeit = 0; erg.soll = Infinity; erg.wartet = false; }
      } else if (tempo > 6) this.querWarteZeit = 0;
      this.querWarten = erg.wartet;
      return erg;
    }

    /** 14.10. (v18): Versatz der Astmitte ab der Mittellinie an Bogenlänge s (ast·c(s); 0 ohne gewählten Ast). */
    _ao(s) { return this.ast ? this.ast * this.strecke.gabelC(s) : 0; }

    /**
     * 14.10. (v18): Ast für die Gabelung voraus wählen (≤ ASTWAHL_VORAUS m vor der Teilung) bzw. beibehalten (im Abschnitt und kurz danach).
     * Wahl je (Gabelung, Runde): Parität astBasis + Runde + Gabelungsnummer (deterministisch); mitten im Abschnitt: wo das Auto steht.
     * this.astWunsch (−1 | +1) überschreibt die Wahl. Außerhalb: this.ast = 0.
     */
    _astWaehlen(n) {
      const st = this.strecke, sp = this.spline;
      let aktiv = null;
      for (const g of st.gabelungen) {
        const d0 = sp.differenzS(g.s0, n.s);              // > 0: Teilung liegt voraus
        if (d0 <= ASTWAHL_VORAUS && d0 >= -g.L - ASTWAHL_NACH) { aktiv = g; break; }
      }
      if (!aktiv) { this.ast = 0; this.astSchluessel = null; return; }
      const L = sp.laenge, lap = Math.max(0, Math.floor(((this.vehicle.streckeFortschritt || 0) + 1e-6) / L));
      const schluessel = aktiv.nr + ':' + lap;
      if (this.astSchluessel === schluessel && this.ast) return;
      const innen = sp.differenzS(n.s, aktiv.s0) > 4 && sp.differenzS(n.s, aktiv.s0) < aktiv.L - 4;
      let a;
      if (this.astWunsch) a = this.astWunsch < 0 ? -1 : 1;
      else if (innen && Math.abs(n.seitenabstand) > 1) a = n.seitenabstand < 0 ? -1 : 1;     // schon im Abschnitt: auf dem Ast bleiben
      else a = ((this.astBasis + lap + aktiv.nr) & 1) ? 1 : -1;
      this.ast = a; this.astSchluessel = schluessel;
    }

    /** Grundversatz an Stelle s (Seed-Versatz, innen in Kurven verringert). */
    _grundVersatz(s) {
      const sp = this.spline;
      let k = 0;
      for (const d of [-6, 0, 6, 12]) {
        const kk = sp.punktBei(s + d).kruemmung;
        if (Math.abs(kk) > Math.abs(k)) k = kk;
      }
      let q = this.versatzBasis;
      // Kruemmung > 0 = Rechtskurve, Versatz > 0 = rechts → innen
      if (q * k > 0) q /= 1 + Math.abs(k) * 70;
      // "unschlagbar": Kurven innen schneiden (voll ab Radius 120 m, weich eingeblendet)
      if (this.innenSchneiden) q += Math.sign(k) * this.innenSchneiden * glatt(Math.abs(k) * 120 - 0.3);
      return q;
    }

    /**
     * Spurversatz d Meter vor dem Auto (sAuto = eigene Bogenlänge), auf die Straße begrenzt.
     * Hindernisse blenden ihren Ziel-Seitenabstand ein: Rampe vor dem Hindernis,
     * voll ab 4 m davor bis (8 m + Vorausblick) dahinter, dann wieder aus.
     * @returns {{q:number, w:number}} w = Gewicht des Ausweichens (0..1)
     */
    _spurVersatz(sAuto, d, tempo, grenze) {
      const basis = this._grundVersatz(sAuto + d);
      if (this.stossRest > 0) return { q: this.stossZiel, w: 1 };
      const rampe = Math.max(RAMPE_MIN, RAMPE_ZEIT * Math.max(0, tempo));
      const nachlauf = 8 + blick(tempo);
      let q = basis, wBest = 0;
      const harte = [];
      for (const h of this.hindernisse) {
        // voll von (Anfang − vor) bis (Ende + nach); Autos: vor 4 m, nach 8 m + Vorausblick
        const anfang = h.d - (h.vor !== undefined ? h.vor : 4);
        const ende = (h.dEnde !== undefined ? h.dEnde : h.d) + (h.nach !== undefined ? h.nach : nachlauf);
        let w;
        if (d < anfang) w = glatt(1 - (anfang - d) / rampe);
        else if (d <= ende) w = 1;
        else w = glatt(1 - (d - ende) / rampe);
        if (h.hart && w > 0) harte.push({ h, w });
        const qh = basis + (h.ziel - basis) * w;
        // stärkste Abweichung gewinnt
        if (w > 0 && (wBest === 0 || Math.abs(qh - basis) > Math.abs(q - basis))) { q = qh; }
        if (w > wBest) wBest = w;
      }
      // Baustelle/Ast: nie in die gesperrte Hälfte – auch nicht, um einem Auto auszuweichen
      for (const { h, w } of harte) {
        const grenzeHart = -h.seite * HART_GRENZE;
        const qGrenze = basis + (grenzeHart - basis) * w;
        if (h.seite > 0 && q > Math.max(qGrenze, grenzeHart)) q = Math.max(qGrenze, grenzeHart);
        if (h.seite < 0 && q < Math.min(qGrenze, grenzeHart)) q = Math.min(qGrenze, grenzeHart);
      }
      // Runde 4: am Zielpunkt gilt dessen Fahrbahnbreite (enge Spur voraus → rechtzeitig zur Mitte)
      const g = Math.min(grenze, this._grenzeBei(sAuto + d));
      return { q: clamp(q, -g, g), w: wBest };
    }

    /**
     * W4-I: Liegt das andere Auto ov auf einer anderen Ebene (Überführung)? on = seine Projektion auf MEINEN Abschnitt.
     * Nur Strecken mit Überführungen; sonst immer false (Verhalten unverändert).
     */
    _andereEbene(ov, on) {
      const st = this.strecke;
      if (!st || !st.ueberfuehrungen || !st.ueberfuehrungen.length || typeof ov.y !== 'number') return false;
      return Math.abs(ov.y - st.hoeheBeiS(on.s, on.seitenabstand)) > 3;
    }

    /** Erlaubter seitlicher Versatz (Auto-Mitte) an Bogenlänge s: ±max(0,5; Breite/2 − SPUR_GRENZE_RAND). */
    _grenzeBei(s) {
      const st = this.strecke, b = st.breiteBei ? st.breiteBei(s) : st.breite;
      return Math.max(0.5, b / 2 - SPUR_GRENZE_RAND);
    }

    /** Gummiband-Faktor aus dem Abstand zum besten Spieler. */
    _gummiFaktor(u) {
      if ((!this.gummiband && !this.gummibandHinten) || u.spielerFortschrittMax === undefined || u.spielerFortschrittMax === null) return 1;
      const eigen = u.eigenerFortschritt !== undefined ? u.eigenerFortschritt : this.vehicle.streckeFortschritt;
      const d = eigen - u.spielerFortschrittMax;    // > 0: KI liegt vorne
      const anteil = clamp((Math.abs(d) - GUMMI_TOTZONE) / GUMMI_RAMPE, 0, 1);
      const w = anteil * anteil * (3 - 2 * anteil);  // weich (smoothstep)
      return 1 + (d < 0 ? GUMMI_MAX_HINTEN * this.gummibandHinten : -GUMMI_MAX_VORNE * this.gummiband) * w;
    }

    /**
     * Zieltempo: Minimum über das Bremsfenster von sqrt(vIdeal(s+d)² + 2·a·d),
     * vIdeal bereits mit dem Faktor skaliert.
     */
    _zieltempo(s, tempo, faktor) {
      const a = this.aBrems;
      const fenster = tempo * tempo / (2 * a) + 10;
      let soll = Infinity;
      for (let d = 0; d <= fenster; d += 2) {
        const vi = this.profil.tempoBei(s + d) * faktor;
        const kandidat = Math.sqrt(vi * vi + 2 * a * d);
        if (kandidat < soll) soll = kandidat;
      }
      return soll;
    }
  }

  /**
   * Tempoprofil (m/s je Spline-Punkt) für ein Auto auf einer Strecke – die "Ideallinie" der KI.
   * Kurventempo aus der gleichen Querhaftungs-Formel wie vehicle.js:
   *   v²·k = QUER_SICHERHEIT · querGrip · Haftung · (1 + v/abtriebTempo)  (Haftung inkl. gripBonus)
   * gedeckelt auf vMax, dann rückwärts mit opt.aBrems geglättet (rechtzeitig bremsen).
   * opt.innen: Meter Innen-Schneiden → Krümmung der gefahrenen Linie k/(1 − innen·k).
   * Ergebnis wird an der Strecke zwischengespeichert. Liefert { werte, tempoBei(s) }.
   * Auch für Tests ("perfekte Fahrt") und für die Bremshilfe nutzbar.
   */
  Driver.tempoProfil = function (strecke, vehicle, opt) {
    const o = Object.assign({ aBrems: BREMS_ANTEIL * (vehicle.daten.bremsen || 20), innen: 0, sicherheit: QUER_SICHERHEIT }, opt);
    const P = R.config.physik;
    const A = o.sicherheit * P.querGrip * vehicle.gripGesamt('strasse');
    const schluessel = [vehicle.daten.vMax, A, o.aBrems, o.innen].map((x) => x.toFixed(4)).join('|');
    const cache = strecke._kiProfile || (strecke._kiProfile = {});
    if (cache[schluessel]) return cache[schluessel];
    const sp = strecke.spline, pk = sp.punkte, N = pk.length, ds = sp.ds, T = P.abtriebTempo;
    const v = new Array(N);
    for (let i = 0; i < N; i++) {
      // stärkste Krümmung in ±3 Punkten (Kurveneingang nicht unterschätzen)
      let k = 0;
      for (let j = -3; j <= 3; j++) k = Math.max(k, Math.abs(pk[(i + j + N) % N].kruemmung));
      if (strecke.gabelungen && strecke.gabelungen.length) k += strecke.gabelKruemmung(pk[i].s);   // 14.10. (v18): Äste laufen auseinander/zusammen
      if (o.innen) k = k / Math.max(0.5, 1 - o.innen * k);
      // k·v² − (A/T)·v − A = 0 → positive Lösung
      const vk = k < 1e-6 ? Infinity : (A / T + Math.sqrt((A / T) * (A / T) + 4 * k * A)) / (2 * k);
      v[i] = Math.min(vehicle.daten.vMax, vk);
    }
    for (let runde = 0; runde < 2; runde++) {
      for (let i = N - 1; i >= 0; i--) {
        const naechstes = v[(i + 1) % N];
        v[i] = Math.min(v[i], Math.sqrt(naechstes * naechstes + 2 * o.aBrems * ds));
      }
    }
    const profil = {
      werte: v,
      tempoBei(s) {
        const f = sp.wrapS(s) / ds, i = Math.floor(f) % N, w = f - Math.floor(f);
        return v[i] + (v[(i + 1) % N] - v[i]) * w;
      },
    };
    cache[schluessel] = profil;
    return profil;
  };

  Driver.mulberry32 = mulberry32;
  R.Driver = Driver;
})();
