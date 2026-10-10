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
// - Lenkung: P-Regler auf den Winkel zum Zielpunkt, begrenzt und leicht geglättet.
// - Zieltempo: Ideallinie (strecke.idealLinie) × tempoFaktor, Minimum über das
//   nächste Bremsfenster. Gas darunter, Bremse deutlich darüber, dazwischen rollen.
// - Gummiband (Abstand zum besten Spieler), langsame Tempo-Schwankung,
//   gelegentliche kleine Lenkfehler – alles aus config.schwierigkeiten.
// - Ausweichen vor Autos voraus, Festfahren erkennen (rückwärts frei fahren,
//   nach 3 Fehlversuchen brauchtReset), Falsch-herum-Erkennung.
// - Deterministisch: eigener Zufallsgenerator (mulberry32) aus dem Seed.
// Keine Abhängigkeit von Three.js (Node-Tests).
// ============================================================
(function () {
  const R = window.Rennspiel;

  // --- Fahrverhalten ---
  const LENK_P = 3.2;              // Lenkwert je Radiant Winkelfehler
  const LENK_GLAETTUNG = 14;       // 1/s – leichte Glättung vor der Fahrzeug-Glättung
  const A_BREMS_PLAN = 7;          // m/s² angenommene Verzögerung für das Bremsfenster
  const ROLLEN_BAND = 1.5;         // m/s über dem Zieltempo: nur rollen, nicht bremsen
  const VERSATZ_MAX = 3;           // m seitlicher Grundversatz (± aus dem Seed)
  const SPUR_GRENZE_RAND = 2.2;    // m Abstand der Auto-Mitte zum Straßenrand (mindestens)

  // --- Gummiband ---
  const GUMMI_TOTZONE = 60;        // m – darunter kein Effekt
  const GUMMI_RAMPE = 150;         // m – weiche Rampe bis zum vollen Effekt
  // Vorne liegend: bis −12 % × gummiband. Hinten liegend stärker (bis +35 % × gummiband),
  // sonst kann 'leicht' (tempoFaktor 0,78) einem flotten Kind nie folgen (Test 3).
  const GUMMI_MAX_VORNE = 0.12;
  const GUMMI_MAX_HINTEN = 0.35;

  // --- Fehler ---
  const SCHWANKUNG_PERIODE = 90;   // s
  const SCHWANKUNG_AMPLITUDE = 0.03; // × fehler
  const SCHLENKER_DAUER = 0.4;     // s

  // --- Ausweichen ---
  // Prüffenster voraus: max(12 m, 1,5 s × Tempo). Ein Auto gilt als Hindernis, wenn es
  // höchstens ±3 m neben der eigenen Linie steht. Der Versatz wird über die Strecke
  // VOR dem Hindernis sanft eingeblendet und erst ein gutes Stück dahinter zurückgenommen.
  const AUSWEICH_MIN = 12;         // m
  const AUSWEICH_ZEIT = 1.5;       // s × Tempo
  const AUSWEICH_SEITE = 3;        // m um die eigene Linie
  const AUSWEICH_GAS_WEG = 6;      // m – direkt dahinter in der Spur: Gas weg
  const AUSWEICH_ABSTAND = 3.6;    // m seitlicher Abstand beim Vorbeifahren (fahrendes Auto)
  const AUSWEICH_ABSTAND_LANGSAM = 4.0; // m bei stehenden/sehr langsamen Autos
  const LANGSAM_TEMPO = 5;         // m/s – darunter gilt ein Auto als "steht"
  const LANGSAM_FENSTER_MIN = 30; // m – stehende Autos früher sehen (in langsamen Kurven)
  const LANGSAM_FENSTER_ZEIT = 2;  // s × Tempo
  const LANGSAM_FAKTOR = 0.6;      // Zieltempo höchstens 60 %, bis vorbei (nicht anhalten)
  const KRIECH_TEMPO = 2.5;        // m/s, wenn ein stehendes Auto direkt vor der Nase ist
  const RAMPE_MIN = 18;            // m Einblend-Strecke (mindestens)
  const RAMPE_ZEIT = 1.1;          // s × Tempo Einblend-Strecke

  // --- Nach einem Stoß ---
  const STOSS_EINBRUCH = 8;        // m/s Tempoverlust …
  const STOSS_FENSTER = 0.2;       // … innerhalb dieser Zeit
  const STOSS_HALTEN = 0.5;        // s Versatz zur freien Seite halten
  const STOSS_VERSATZ = 2.5;       // m

  // --- Festfahren / falsch herum ---
  const FEST_TEMPO = 1;            // m/s
  const FEST_ZEIT = 2.5;           // s
  const RUECK_ZEIT = 1.2;          // s
  const FEST_VERSUCHE = 3;
  const FALSCH_WINKEL = 110 * Math.PI / 180;

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
    while (w > Math.PI) w -= 2 * Math.PI;
    while (w < -Math.PI) w += 2 * Math.PI;
    return w;
  }

  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
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
      this.fehler = st.fehler;

      this.zufall = mulberry32(seedZahl(opt.seed));
      this.versatzBasis = (this.zufall() * 2 - 1) * VERSATZ_MAX;
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

      this.festZeit = 0;            // so lange schon (fast) Stillstand
      this.rueckRest = 0;           // laufendes Rückwärtsmanöver (s)
      this.rueckLenkung = 0;
      this.fehlversuche = 0;
      this.freiZeit = 0;            // so lange schon wieder flott unterwegs
      this.brauchtReset = false;

      this.zieltempo = 0;           // zur Anzeige/Fehlersuche
      this.falschHerum = false;
    }

    _schlenkerAbstand() { return 10 + this.zufall() * 15; }

    /** Nach einem Reset durch main.js aufrufen: Zustände zurücksetzen. */
    zurueckgesetzt() {
      this.index = -1;
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
      const n = sp.naechster(v.x, v.z, this.index);
      this.index = n.index;

      // Vor dem Start: stehen bleiben (Bremse würde im Stand rückwärts fahren)
      if (u.laeuft === false) {
        this.lenkung = 0;
        return { gas: 0, bremse: 0, lenkung: 0 };
      }
      this.zeit += dt;
      const tempo = v.vLaengs;
      const p = sp.punktBei(n.s);

      // ---------- Festfahren: rückwärts frei fahren ----------
      if (this.rueckRest > 0) {
        this.rueckRest -= dt;
        if (this.rueckRest <= 0) this.festZeit = 0;
        return { gas: 0, bremse: 1, lenkung: this.rueckLenkung };
      }
      if (Math.abs(tempo) < FEST_TEMPO) {
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
          const zurMitte = -n.seitenabstand;   // >0: Mitte liegt links
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
      const grenze = strecke.breite / 2 - SPUR_GRENZE_RAND;
      const fenster = Math.max(AUSWEICH_MIN, AUSWEICH_ZEIT * Math.max(0, tempo));
      const fensterLangsam = Math.max(LANGSAM_FENSTER_MIN, LANGSAM_FENSTER_ZEIT * Math.max(0, tempo), fenster);
      const andere = u.andere || [];
      let gasWeg = false, bremsNoetig = 0, langsamVoraus = false, kriechen = false;
      const gesehen = new Set();
      let naechsterAndererQ = null, naechsterAbstand = Infinity;
      this.hindernisse = [];
      for (const o of andere) {
        const ov = o.vehicle;
        if (!ov || ov === v) continue;
        const dx = ov.x - v.x, dz = ov.z - v.z, abst = Math.hypot(dx, dz);
        if (abst > fensterLangsam + 15) continue;
        const on = sp.naechster(ov.x, ov.z, this.index);
        if (abst < naechsterAbstand) { naechsterAbstand = abst; naechsterAndererQ = on.seitenabstand; }
        const voraus = sp.differenzS(on.s, n.s);
        const vo = ov.vLaengs || 0;
        const langsam = Math.abs(vo) < LANGSAM_TEMPO;
        if (voraus > (langsam ? fensterLangsam : fenster)) continue;
        // schon neben/knapp hinter mir: nur weiter beachten, wenn ich ihm gerade ausweiche
        if (voraus <= 0 && (voraus < -6 || !this.seitenMerk.has(ov))) continue;
        // fahrende Autos weiter vorn nur, wenn ich schneller bin (sonst kein Grund)
        if (!langsam && voraus > AUSWEICH_MIN && tempo - vo < 1) continue;
        const linie = this._grundVersatz(on.s);
        const inMeinerSpur = Math.abs(on.seitenabstand - n.seitenabstand) < 2.2;
        const blockiert = Math.abs(on.seitenabstand - linie) < AUSWEICH_SEITE ||
          (voraus < AUSWEICH_MIN && inMeinerSpur);
        if (!blockiert) continue;

        // Seite wählen (pro Hindernis gemerkt, kein Hin-und-her): bevorzugt die Seite,
        // auf der ich schon bin – wenn dort genug Platz ist, sonst die andere.
        const abstand = langsam ? AUSWEICH_ABSTAND_LANGSAM : AUSWEICH_ABSTAND;
        const platz = seite => (seite > 0 ? grenze - on.seitenabstand : on.seitenabstand + grenze);
        let seite = this.seitenMerk.get(ov) || 0;
        if (!seite) {
          seite = n.seitenabstand >= on.seitenabstand ? 1 : -1;
          if (platz(seite) < 2.4) seite = -seite;
        }
        this.seitenMerk.set(ov, seite);
        gesehen.add(ov);
        const ziel = clamp(on.seitenabstand + seite * abstand, -grenze, grenze);
        this.hindernisse.push({ d: voraus, ziel, langsam });
        if (langsam && voraus > -6) langsamVoraus = true;

        // Kein Rammen: direkt vor mir in der Spur → stehendes Auto: nur noch kriechen
        // (lenkt dabei vorbei, kein Stau), fahrendes Auto: Gas weg / bremsen
        if (voraus > 0 && voraus < AUSWEICH_GAS_WEG && inMeinerSpur) {
          if (langsam) kriechen = true;
          else {
            gasWeg = true;
            if (tempo > vo + 1.5) bremsNoetig = Math.max(bremsNoetig, clamp((tempo - vo) / 6, 0.2, 1));
          }
        }
      }
      for (const ov of this.seitenMerk.keys()) if (!gesehen.has(ov)) this.seitenMerk.delete(ov);

      // ---------- Stoß erkannt? (Tempo bricht plötzlich ein) ----------
      this.tempoVerlauf.push([this.zeit, tempo]);
      while (this.tempoVerlauf.length > 2 && this.zeit - this.tempoVerlauf[1][0] >= STOSS_FENSTER) this.tempoVerlauf.shift();
      const frueher = this.tempoVerlauf[0];
      if (this.stossRest <= 0 && this.zeit - frueher[0] >= STOSS_FENSTER - 1e-9 && frueher[1] - tempo > STOSS_EINBRUCH) {
        // weg vom nächsten Auto, sonst Richtung Mitte
        let seite = naechsterAndererQ !== null ? Math.sign(n.seitenabstand - naechsterAndererQ) : -Math.sign(n.seitenabstand);
        if (!seite) seite = 1;
        this.stossZiel = clamp(n.seitenabstand + seite * STOSS_VERSATZ, -grenze, grenze);
        this.stossRest = STOSS_HALTEN;
      }
      if (this.stossRest > 0) this.stossRest -= dt;

      // ---------- Zielpunkt und Lenkung ----------
      const vorausblick = clamp(0.6 * Math.max(0, tempo) + 6, 8, 40);
      const sZiel = n.s + vorausblick;
      // Versatz bei voller und halber Vorausschau – der stärker ausweichende gewinnt,
      // damit die Sehne zum Zielpunkt nicht am Hindernis vorbeischneidet
      const vA = this._spurVersatz(n.s, vorausblick, tempo, grenze);
      const vB = this._spurVersatz(n.s, vorausblick / 2, tempo, grenze);
      const q = vB.w > vA.w ? vB.q : vA.q;
      const z = sp.punktBei(sZiel);
      const zx = z.x + z.nx * q, zz = z.z + z.nz * q;
      const hZiel = R.headingAus(zx - v.x, zz - v.z);
      const diff = winkelNorm(hZiel - v.heading);
      let lenkZiel = clamp(-diff * LENK_P, -1, 1);    // heading größer = links = negativ

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
      this.lenkung += (lenkZiel - this.lenkung) * Math.min(1, LENK_GLAETTUNG * dt);

      // ---------- Zieltempo ----------
      let faktor = this.tempoFaktor * this._gummiFaktor(u);
      if (this.fehler > 0) {
        faktor *= 1 + SCHWANKUNG_AMPLITUDE * this.fehler *
          Math.sin(2 * Math.PI * this.zeit / SCHWANKUNG_PERIODE + this.schwankungPhase);
      }
      let soll = this._zieltempo(n.s + Math.max(0, tempo) * 0.15, Math.max(0, tempo), faktor);
      if (langsamVoraus) soll *= LANGSAM_FAKTOR;   // vorsichtig vorbei, aber weiterfahren
      if (kriechen) soll = Math.min(soll, KRIECH_TEMPO);
      this.zieltempo = soll;

      let gas = 0, bremse = 0;
      const e = soll - tempo;
      if (e > 0) gas = clamp(e / 0.8, 0.15, 1);
      else if (e < -ROLLEN_BAND && tempo > 0.5) bremse = clamp((-e - ROLLEN_BAND) / 3 + 0.25, 0, 1);
      if (gasWeg) gas = 0;
      if (bremsNoetig > 0 && tempo > 0.5) bremse = Math.max(bremse, bremsNoetig);
      if (bremse > 0) gas = 0;
      return { gas, bremse, lenkung: this.lenkung };
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
      const nachlauf = 8 + clamp(0.6 * Math.max(0, tempo) + 6, 8, 40);
      let q = basis, wBest = 0;
      for (const h of this.hindernisse) {
        let w;
        if (d < h.d - 4) w = glatt(1 - (h.d - 4 - d) / rampe);
        else if (d <= h.d + nachlauf) w = 1;
        else w = glatt(1 - (d - h.d - nachlauf) / rampe);
        const qh = basis + (h.ziel - basis) * w;
        // stärkste Abweichung gewinnt
        if (w > 0 && (wBest === 0 || Math.abs(qh - basis) > Math.abs(q - basis))) { q = qh; }
        if (w > wBest) wBest = w;
      }
      return { q: clamp(q, -grenze, grenze), w: wBest };
    }

    /** Gummiband-Faktor aus dem Abstand zum besten Spieler. */
    _gummiFaktor(u) {
      if (!this.gummiband || u.spielerFortschrittMax === undefined || u.spielerFortschrittMax === null) return 1;
      const eigen = u.eigenerFortschritt !== undefined ? u.eigenerFortschritt : this.vehicle.streckeFortschritt;
      const d = eigen - u.spielerFortschrittMax;    // > 0: KI liegt vorne
      const anteil = clamp((Math.abs(d) - GUMMI_TOTZONE) / GUMMI_RAMPE, 0, 1);
      const w = anteil * anteil * (3 - 2 * anteil);  // weich (smoothstep)
      return 1 + (d < 0 ? GUMMI_MAX_HINTEN : -GUMMI_MAX_VORNE) * this.gummiband * w;
    }

    /**
     * Zieltempo: Minimum über das Bremsfenster von sqrt(vIdeal(s+d)² + 2·a·d),
     * vIdeal bereits mit dem Faktor skaliert.
     */
    _zieltempo(s, tempo, faktor) {
      const strecke = this.strecke;
      const fenster = tempo * tempo / (2 * A_BREMS_PLAN) + 10;
      let soll = Infinity;
      for (let d = 0; d <= fenster; d += 2) {
        const vi = strecke.tempoBei(s + d) * faktor;
        const kandidat = Math.sqrt(vi * vi + 2 * A_BREMS_PLAN * d);
        if (kandidat < soll) soll = kandidat;
      }
      return soll;
    }
  }

  Driver.mulberry32 = mulberry32;
  R.Driver = Driver;
})();
