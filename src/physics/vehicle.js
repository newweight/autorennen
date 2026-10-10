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
     */
    constructor(daten) {
      this.daten = Object.assign({
        vMax: 42, beschleunigung: 9, bremsen: 18, rueckwaertsMax: 8,
        wendigkeit: 1.9, grip: 0.9, masse: 1400, laenge: 4.4, breite: 1.8,
      }, daten);
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
          // rechts der Mitte (seitenabstand > 0) → Ziel leicht nach links (heading größer)
          const zurMitte = Math.max(-0.3, Math.min(0.3, hilfe.seitenabstand * 0.07));
          const fehler = fehlerTangente + zurMitte;
          const hilfsLenkung = Math.max(-1, Math.min(1, -fehler * 3));   // heading größer = links = negativ
          const anteil = hilfe.lenkhilfe * (Math.abs(lenkung) > 0.1 ? 0.3 : 1);
          lenkung = Math.max(-1, Math.min(1, lenkung + hilfsLenkung * anteil));
        }
      }
      if (hilfe.bremshilfe > 0 && vorwaerts && hilfe.zieltempo > 0) {
        const grenze = hilfe.zieltempo * 1.1 + 1.5;            // "deutlich" überschritten
        const zuViel = this.vLaengs - grenze;
        if (zuViel > 0) {
          const staerke = Math.min(1, zuViel / 6) * hilfe.bremshilfe;
          gas *= 1 - Math.min(1, staerke * 1.5);               // erst Gas wegnehmen …
          bremse = Math.max(bremse, staerke * 0.6);             // … dann leicht bremsen
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
      const grip = d.grip * ug.grip;
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
      let a = 0;
      const gas = s.gas || 0, bremse = s.bremse || 0;
      if (gas > 0 && this.vLaengs >= -0.5) {
        // Beschleunigung nimmt zum Höchsttempo hin ab
        const rest = Math.max(0, 1 - this.vLaengs / d.vMax);
        a += d.beschleunigung * gas * (0.45 + 0.55 * rest) * (0.6 + 0.4 * ug.grip);
      }
      if (bremse > 0) {
        if (this.vLaengs > 0.5) a -= d.bremsen * bremse;                 // bremsen
        else if (gas === 0) a -= d.beschleunigung * 0.6 * bremse;         // rückwärts (nach Stillstand)
      }
      // Rollwiderstand + Luftwiderstand (relativ zu vMax, damit jedes Auto sein vMax erreicht)
      const vRel = this.vLaengs / d.vMax;
      const widerstand = 0.6 * ug.rollwiderstand + d.beschleunigung * 0.3 * vRel * vRel;
      if (this.vLaengs > 0) a -= widerstand; else if (this.vLaengs < 0) a += widerstand;

      const vAlt = this.vLaengs;
      let vNeu = this.vLaengs + a * dt;
      // Stillstand sauber erreichen (kein Zittern um 0)
      if (gas === 0 && bremse === 0 && Math.abs(vNeu) < 0.3) vNeu = 0;
      if (this.vLaengs > 0 && vNeu < 0 && bremse > 0 && gas === 0) vNeu = 0;
      // Abseits der Straße ist das Höchsttempo deutlich niedriger (Gras ~52 %, Sand ~44 %)
      const vMaxHier = d.vMax * (0.25 + 0.75 * ug.grip * ug.grip);
      vNeu = Math.max(-d.rueckwaertsMax, Math.min(vMaxHier, vNeu));
      this.vLaengs = vNeu;

      // --- Drehung (Arcade): Drehrate in rad/s, bei hohem Tempo kleiner,
      //     bei sehr langsamer Fahrt gegen 0 (Auto dreht nicht im Stand) ---
      const tempoAnteil = Math.min(1, this.tempo / d.vMax);
      if (this.tempo > 0.2) {
        const drehrateMax = d.wendigkeit * (0.45 + 0.55 * (1 - tempoAnteil)) * Math.min(1, this.tempo / 4);
        const richtungVz = this.vLaengs >= 0 ? 1 : -1;      // rückwärts lenkt spiegelverkehrt
        // Bei wenig Grip dreht das Auto weniger, dafür rutscht es
        const wirksam = 0.55 + 0.45 * grip;
        const drehrate = this.lenkung * drehrateMax * richtungVz;   // > 0 = Rechtskurve
        this.heading -= drehrate * wirksam * dt;
        // Fliehkraft: das Auto rutscht zur Kurvenaußenseite.
        // vQuer > 0 = nach rechts. Rechtskurve (drehrate > 0) → nach links (vQuer sinkt),
        // Linkskurve → nach rechts.
        this.vQuer -= drehrate * this.vLaengs * (1 - grip) * 0.4 * dt;
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

    /** Auto an eine Stelle setzen (Start, Reset). */
    setzen(x, z, heading) {
      this.x = x; this.z = z; this.heading = heading;
      this.vLaengs = 0; this.vQuer = 0; this.lenkung = 0; this.neigung = 0; this.nicken = 0;
    }
  }

  Vehicle.winkelDiff = winkelDiff;
  R.Vehicle = Vehicle;
})();
