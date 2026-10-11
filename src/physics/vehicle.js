// ============================================================
// Arcade-Fahrphysik (2D auf der Bodenebene, y = Höhe kommt von der Strecke)
//
// Modell: Das Auto hat Position (x, z), Fahrtrichtung (heading, Radiant),
// eine Vorwärtsgeschwindigkeit (vLaengs) und eine Seitwärtsgeschwindigkeit
// (vQuer). Lenken dreht das Auto abhängig vom Tempo; der Grip baut die
// Seitwärtsgeschwindigkeit wieder ab (Driften bei wenig Grip).
// Keine Abhängigkeit von Three.js, damit Node-Tests möglich sind.
// ============================================================
(function () {
  const R = window.Rennspiel;

  /** Kürzeste Winkeldifferenz a - b in (-π, π]. */
  function winkelDiff(a, b) {
    let d = (a - b) % (2 * Math.PI);
    if (d > Math.PI) d -= 2 * Math.PI; else if (d <= -Math.PI) d += 2 * Math.PI;
    return d;
  }

  class Vehicle {
    /**
     * @param {object} daten Fahrwerte aus dem Auto-Katalog:
     *   vMax (m/s), beschleunigung (m/s²), bremsen (m/s²), rueckwaertsMax (m/s),
     *   wendigkeit (rad/s Drehrate bei langsamer Fahrt), grip (0..1), masse (kg), laenge, breite
     *   Schnell begrenzt config.physik.querGrip die Drehrate (siehe drehrateMax()).
     */
    constructor(daten) {
      // Standard = Mittelklasse (240 km/h), passt zum Passat im Katalog
      this.daten = Object.assign({
        vMax: 240 / 3.6, beschleunigung: 5.2, bremsen: 21, rueckwaertsMax: 8,
        wendigkeit: 1.9, grip: 0.9, masse: 1400, laenge: 4.4, breite: 1.8,
      }, daten);
      this.gripBonus = 1;        // Faktor auf die Haftung (KI "unschlagbar" setzt 1.05)
      this.x = 0; this.z = 0; this.y = 0;
      this.heading = 0;          // 0 = Richtung -z (nach "vorne" in Three.js)
      this.vLaengs = 0;          // m/s, negativ = rückwärts
      this.vQuer = 0;            // m/s seitlich (Drift)
      this.lenkung = 0;          // geglätteter Lenkwert -1..1
      this.untergrund = 'strasse';
      this.neigung = 0;          // optische Wankbewegung (rad, um die Längsachse)
      this.nicken = 0;           // optisches Nicken (rad, um die Querachse, > 0 = Bug hoch)
      this.letzteSteuerung = { gas: 0, bremse: 0, lenkung: 0 };
      this.streckeFortschritt = 0; // wird vom Rennmanager gesetzt
    }

    get tempo() { return Math.abs(this.vLaengs); }
    get tempoKmh() { return Math.round(this.vLaengs * 3.6); }

    /** Einheitsvektor der Fahrtrichtung in der XZ-Ebene. */
    richtung() { return { x: -Math.sin(this.heading), z: -Math.cos(this.heading) }; }

    /** Einheitsvektor nach RECHTS (in Fahrtrichtung gesehen). Heading 0: (+1, 0). */
    rechts() { return { x: Math.cos(this.heading), z: -Math.sin(this.heading) }; }

    /** Geschwindigkeit in Weltkoordinaten (für Kollisionen). */
    weltGeschwindigkeit() {
      const r = this.richtung(), q = this.rechts();
      return { x: r.x * this.vLaengs + q.x * this.vQuer, z: r.z * this.vLaengs + q.z * this.vQuer };
    }

    /** Geschwindigkeit aus Weltkoordinaten zurück in Längs-/Queranteil zerlegen. */
    weltGeschwindigkeitSetzen(vx, vz) {
      const r = this.richtung(), q = this.rechts();
      this.vLaengs = vx * r.x + vz * r.z;
      this.vQuer = vx * q.x + vz * q.z;
      const d = this.daten;
      this.vLaengs = Math.max(-d.rueckwaertsMax, Math.min(d.vMax, this.vLaengs));
    }

    /**
     * Fahrhilfen auf die Steuerbefehle anwenden (liefert neue Befehle).
     * hilfe = { lenkhilfe 0..1, bremshilfe 0..1, tangente {tx,tz}, seitenabstand (rechts +), zieltempo m/s }
     * - Lenkhilfe: zieht die Lenkung sanft Richtung Straßentangente + Straßenmitte.
     *   Lenkt der Spieler selbst, wirkt sie nur noch schwach (er soll überholen können).
     * - Bremshilfe: bremst leicht, wenn das Zieltempo der Ideallinie deutlich überschritten wird.
     */
    _fahrhilfe(s, hilfe) {
      if (!hilfe) return s;
      let { gas = 0, bremse = 0, lenkung = 0 } = s;
      const vorwaerts = this.vLaengs > 2;
      if (hilfe.lenkhilfe > 0 && hilfe.tangente && vorwaerts && hilfe.seitenabstand !== undefined) {
        const hTangente = Math.atan2(-hilfe.tangente.tx, -hilfe.tangente.tz);
        let fehlerTangente = winkelDiff(hTangente, this.heading);
        // Nur helfen, wenn das Auto grob in Fahrtrichtung steht (nicht beim Wenden)
        if (Math.abs(fehlerTangente) < Math.PI / 2) {
          // rechts der Mitte (seitenabstand > 0) → Ziel leicht nach links (heading größer).
          // Regler: Soll-Drehrate = k × (Winkelfehler + Winkel zur Mitte über Vorausblick v·T).
          // Gedämpft wie ein Feder-Dämpfer mit ζ ≈ √(k·T)/2 → T = 2/k ergibt ζ ≈ 0,7,
          // unabhängig vom Tempo (sonst schaukelt die Hilfe bei 250 km/h auf).
          const anteil = hilfe.lenkhilfe * (Math.abs(lenkung) > 0.1 ? 0.3 : 1);
          const k = 2.5 * anteil;
          const T = Math.max(1.0, 2.0 / Math.max(k, 1e-3));
          const vorausblick = Math.max(12, this.vLaengs * T);
          const zurMitte = Math.max(-0.3, Math.min(0.3, Math.atan(hilfe.seitenabstand / vorausblick)));
          const fehler = fehlerTangente + zurMitte;
          // Soll-Drehrate in Lenkwert umrechnen (über die mögliche Drehrate bei diesem Tempo)
          const rateMax = Math.max(0.2, this.drehrateMax());
          const hilfsLenkung = Math.max(-1, Math.min(1, -fehler * k / rateMax));   // heading größer = links = negativ
          lenkung = Math.max(-1, Math.min(1, lenkung + hilfsLenkung));
        }
      }
      if (hilfe.bremshilfe > 0 && vorwaerts && hilfe.zieltempo > 0) {
        const grenze = hilfe.zieltempo * 1.1 + 1.5;            // "deutlich" überschritten
        const zuViel = this.vLaengs - grenze;
        if (zuViel > 0) {
          // Runde 3: kräftiger als vorher (höhere Tempi, längere Bremswege)
          const staerke = Math.min(1, zuViel / 4) * hilfe.bremshilfe;
          gas *= 1 - Math.min(1, staerke * 1.5);               // erst Gas wegnehmen …
          bremse = Math.max(bremse, Math.min(1, staerke * 1.6)); // … dann bremsen (wenig bis 32 %, viel bis 80 %)
        }
      }
      return { gas, bremse, lenkung };
    }

    /**
     * Einen Physikschritt rechnen.
     * @param {number} dt Zeit in Sekunden (fest, z. B. 1/60)
     * @param {{gas:number,bremse:number,lenkung:number}} s Steuerbefehle (lenkung: links negativ)
     * @param {object} [hilfe] Fahrhilfe { lenkhilfe, bremshilfe, tangente:{tx,tz}, seitenabstand, zieltempo }
     */
    schritt(dt, s, hilfe) {
      const d = this.daten;
      const ug = R.config.physik.untergrund[this.untergrund] || R.config.physik.untergrund.strasse;
      const grip = Math.min(1, d.grip * ug.grip * this.gripBonus);
      s = s || {};
      // --- Lenkung: kleine Totzone NUR auf die Eingabe (Gamepad-Rauschen), sanft skaliert;
      //     die Fahrhilfe kommt danach, damit ihre feinen Korrekturen nicht verschluckt werden ---
      let roh = Math.max(-1, Math.min(1, s.lenkung || 0));
      const TOTZONE = 0.04;
      roh = Math.abs(roh) < TOTZONE ? 0 : Math.sign(roh) * (Math.abs(roh) - TOTZONE) / (1 - TOTZONE);
      s = this._fahrhilfe({ gas: s.gas || 0, bremse: s.bremse || 0, lenkung: roh }, hilfe);
      this.letzteSteuerung = s;   // für Bremslicht (Bremshilfe sichtbar machen)

      const zielLenkung = s.lenkung;
      const lenkTempo = zielLenkung === 0 ? 9 : 6;   // zurückstellen schneller
      this.lenkung += (zielLenkung - this.lenkung) * Math.min(1, lenkTempo * dt);
      if (zielLenkung === 0 && Math.abs(this.lenkung) < 0.002) this.lenkung = 0;

      // --- Längsbeschleunigung ---
      // Antrieb fällt zum Höchsttempo hin ab (kraftAbfall); der Luftwiderstand (∝ v²) ist so
      // gewählt, dass bei vMax noch endKraft × beschleunigung übrig bleibt → vMax wird sicher
      // erreicht und dort gedeckelt. Rollwiderstand hängt vom Untergrund ab.
      const P = R.config.physik;
      let a = 0;
      const gas = s.gas || 0, bremse = s.bremse || 0;
      const vRel = this.vLaengs / d.vMax;
      if (gas > 0 && this.vLaengs >= -0.5) {
        a += d.beschleunigung * gas * (1 - P.kraftAbfall * Math.max(0, vRel)) * (0.6 + 0.4 * ug.grip);
      }
      if (bremse > 0) {
        if (this.vLaengs > 0.5) a -= d.bremsen * bremse;                 // bremsen
        else if (gas === 0) a -= Math.min(6, d.beschleunigung) * 0.8 * bremse;   // rückwärts (nach Stillstand)
      }
      const luft = Math.max(0, (1 - P.kraftAbfall - P.endKraft) * d.beschleunigung - 0.6);
      let widerstand = 0.6 * ug.rollwiderstand + luft * vRel * vRel;
      // Reifen radieren in der Kurve (Untersteuern kostet Tempo)
      widerstand += P.kurvenWiderstand * Math.abs(this._querBeschl || 0);
      if (this.vLaengs > 0) a -= widerstand; else if (this.vLaengs < 0) a += Math.min(widerstand, 3);

      const vAlt = this.vLaengs;
      let vNeu = this.vLaengs + a * dt;
      // Stillstand sauber erreichen (kein Zittern um 0)
      if (gas === 0 && bremse === 0 && Math.abs(vNeu) < 0.3) vNeu = 0;
      if (this.vLaengs > 0 && vNeu < 0 && bremse > 0 && gas === 0) vNeu = 0;
      // Abseits ist das Höchsttempo deutlich niedriger (Gras ≤ 90 km/h, Sand ≤ 79 km/h).
      // Darüber wird kräftig, aber nicht schlagartig abgebremst.
      const vMaxHier = this.vMaxAuf(this.untergrund);
      if (vNeu > vMaxHier) vNeu = Math.max(vMaxHier, Math.min(vNeu, vAlt - P.abseitsBremsen * dt));
      vNeu = Math.max(-d.rueckwaertsMax, Math.min(d.vMax, vNeu));
      this.vLaengs = vNeu;

      // --- Drehung (Arcade): Drehrate in rad/s. Langsam begrenzt die Wendigkeit, schnell die
      //     Querhaftung (Drehrate ≤ aQuer / v) → bei hohem Tempo untersteuert das Auto. ---
      const tempoAnteil = Math.min(1, this.tempo / d.vMax);
      this._querBeschl = 0;
      if (this.tempo > 0.2) {
        const drehrateMax = this.drehrateMax();
        const richtungVz = this.vLaengs >= 0 ? 1 : -1;      // rückwärts lenkt spiegelverkehrt
        const drehrate = this.lenkung * drehrateMax * richtungVz;   // > 0 = Rechtskurve
        this.heading -= drehrate * dt;
        this._querBeschl = drehrate * this.vLaengs;
        // Fliehkraft: das Auto rutscht zur Kurvenaußenseite – proportional zur Querbeschleunigung,
        // die selbst begrenzt ist (kein Wegdrehen bei hohem Tempo).
        // vQuer > 0 = nach rechts. Rechtskurve (drehrate > 0) → nach links (vQuer sinkt).
        this.vQuer -= this._querBeschl * (1 - grip) * 0.4 * dt;
      }
      // Grip baut Drift ab
      const dampf = Math.exp(-(2.5 + 9 * grip) * dt);
      this.vQuer *= dampf;
      if (Math.abs(this.vQuer) < 0.02) this.vQuer = 0;

      // --- Position ---
      const r = this.richtung();
      const q = this.rechts();             // rechts vom Auto
      this.x += (r.x * this.vLaengs + q.x * this.vQuer) * dt;
      this.z += (r.z * this.vLaengs + q.z * this.vQuer) * dt;

      // --- nur Optik: Wanken in Kurven, Nicken beim Beschleunigen/Bremsen ---
      const zielNeigung = -this.lenkung * tempoAnteil * 0.06;
      this.neigung += (zielNeigung - this.neigung) * Math.min(1, 5 * dt);
      const laengsBeschl = (this.vLaengs - vAlt) / dt;     // tatsächliche Beschleunigung
      // > 0 = Bug hoch (Anfahren), < 0 = Bug runter (Bremsen); um die Querachse (rotation.x)
      const zielNicken = Math.max(-0.045, Math.min(0.03, laengsBeschl * 0.0035));
      this.nicken += (zielNicken - this.nicken) * Math.min(1, 6 * dt);
    }

    /** Haftung gesamt (Auto × Untergrund × Bonus), 0..1. */
    gripGesamt(untergrund) {
      const U = R.config.physik.untergrund;
      const ug = U[untergrund || this.untergrund] || U.strasse;
      return Math.min(1, this.daten.grip * ug.grip * this.gripBonus);
    }

    /**
     * Mögliche Querbeschleunigung (m/s²) bei Tempo v: querGrip × Haftung × (1 + v/abtriebTempo).
     * Auch für die KI-Tempoplanung (ai/driver.js) – dieselbe Formel, damit Plan und Physik passen.
     */
    querBeschleunigungMax(v, untergrund) {
      const P = R.config.physik;
      return P.querGrip * this.gripGesamt(untergrund) * (1 + Math.abs(v) / P.abtriebTempo);
    }

    /** Größte Drehrate (rad/s) bei Volleinschlag im aktuellen Zustand (bzw. Tempo v). */
    drehrateMax(v) {
      const t = Math.abs(v === undefined ? this.vLaengs : v);
      const grip = this.gripGesamt();
      const langsam = this.daten.wendigkeit * (0.55 + 0.45 * grip) * Math.min(1, t / 4);
      return Math.min(langsam, this.querBeschleunigungMax(t) / Math.max(t, 0.5));
    }

    /** Höchsttempo auf einem Untergrund (m/s). */
    vMaxAuf(untergrund) {
      const U = R.config.physik.untergrund;
      const ug = U[untergrund] || U.strasse;
      // Deckel per Feld; ohne Feld aus der Haftung (wie vor Runde 3): 0,25 + 0,75·grip²
      const vf = ug.vMaxFaktor !== undefined ? ug.vMaxFaktor : (0.25 + 0.75 * ug.grip * ug.grip);
      let v = this.daten.vMax * vf;
      if (ug.vMaxAbs) v = Math.min(v, ug.vMaxAbs);
      return v;
    }

    /** Auto an eine Stelle setzen (Start, Reset). */
    setzen(x, z, heading) {
      this.x = x; this.z = z; this.heading = heading;
      this.vLaengs = 0; this.vQuer = 0; this.lenkung = 0; this.neigung = 0; this.nicken = 0; this._querBeschl = 0;
    }
  }

  Vehicle.winkelDiff = winkelDiff;
  R.Vehicle = Vehicle;
})();
