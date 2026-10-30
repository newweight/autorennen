// ============================================================
// Kameras: Verfolger (Chase-Cam), Cockpit, weit
// Jede Kamera folgt einem Fahrzeug weich nach.
// Runde 5: tempoabhängig (Abstand/Höhe/Vorausblick wachsen mit Tempo / vMax), Blickpunkt folgt der
// Fahrtrichtung (inkl. Drift) und greift mit dem Lenkwinkel leicht in die Kurve vor → Kurven früher sichtbar.
// ============================================================
(function () {
  const R = window.Rennspiel;

  class FahrzeugKamera {
    constructor(aspect) {
      const g = R.config.grafik;
      this.kamera = new THREE.PerspectiveCamera(g.fov, aspect, 0.3, g.sichtweite + 200);
      // Polierrunde W3: Euler-Reihenfolge YXZ (erst Gieren, dann Nicken, zuletzt Rollen) – sonst rollt der Horizont im
      // Cockpit bei Fahrtrichtung ±90° (Gimbal-Lock der Standard-Reihenfolge XYZ, wenn rotation.z nach lookAt gesetzt wird)
      this.kamera.rotation.order = 'YXZ';
      this.modusIndex = 0;
      this.ziel = null;                       // Vehicle (für Vergleiche, z. B. Wackeln nach Stößen)
      this.quelle = null;                     // geglättete Darstellung (x, y, z, neigung, richtung()) – sonst = ziel
      this.pos = new THREE.Vector3();
      this.blick = new THREE.Vector3();
      this._zielPos = new THREE.Vector3();    // wiederverwendet: keine Allokation pro Frame
      this._zielBlick = new THREE.Vector3();
      this._erstesMal = true;
      this._wackelZeit = 0;                   // Kamerawackeln nach Stößen
      this._wackelStaerke = 0;
      this._tempoAnteil = 0;                  // geglättet (kein Kamerasprung bei Stößen)
      this._blickVersatz = 0;                 // geglätteter Blickwinkel-Versatz (rad, > 0 = nach links)
    }

    /** Runde 5: geglätteten Tempo-Anteil (0..1) und Blick-Versatz (Drift + Lenk-Vorgriff) nachführen. */
    _fahrZustand(dt, e) {
      const v = this.ziel;
      let tA = 0, versatz = 0;
      if (v && v.daten && v.daten.vMax > 0) {
        tA = Math.max(0, Math.min(1, Math.abs(v.vLaengs || 0) / v.daten.vMax));
        if ((v.vLaengs || 0) > 2) {
          // Drift: Blick in Bewegungsrichtung (vQuer > 0 = nach rechts = heading kleiner)
          const drift = Math.atan((v.vQuer || 0) / Math.max(5, v.vLaengs));
          // Lenk-Vorgriff: lenkung > 0 = rechts → Blick nach rechts (heading kleiner); wächst mit dem Tempo
          versatz = -drift - (e.lenkVorgriff || 0) * (v.lenkung || 0) * (0.4 + 0.6 * tA);
          versatz = Math.max(-0.3, Math.min(0.3, versatz));
        }
      }
      const w = 1 - Math.exp(-3 * dt);
      this._tempoAnteil += (tA - this._tempoAnteil) * w;
      this._blickVersatz += (versatz - this._blickVersatz) * (1 - Math.exp(-(e.blickWeichheit || 6) * dt));
      if (this._erstesMal) { this._tempoAnteil = tA; this._blickVersatz = versatz; }
      return this._tempoAnteil;
    }

    /** Kurzes Wackeln (0,2 s) nach einem Stoß; staerke in m/s Aufprall-Tempo. */
    wackeln(staerke) {
      const amp = Math.min(0.22, 0.025 * staerke);
      if (amp <= this._wackelStaerke * (this._wackelZeit / 0.2)) return;  // stärkeres läuft schon
      this._wackelStaerke = amp;
      this._wackelZeit = 0.2;
    }

    /** Wackel-Versatz auf die fertige Kameraposition legen (nur Optik). */
    _wackelnAnwenden(dt) {
      if (this._wackelZeit <= 0) return;
      this._wackelZeit = Math.max(0, this._wackelZeit - dt);
      const a = this._wackelStaerke * (this._wackelZeit / 0.2);
      this.kamera.position.x += (Math.random() - 0.5) * 2 * a;
      this.kamera.position.y += (Math.random() - 0.5) * 2 * a;
      this.kamera.position.z += (Math.random() - 0.5) * 2 * a;
    }

    /** Bildformat und Sichtfeld setzen (z. B. halbe Breite im Split-Screen). */
    groesseSetzen(aspect, fov) {
      this.kamera.aspect = aspect;
      if (fov) this.kamera.fov = fov;
      this.kamera.updateProjectionMatrix();
    }

    get modus() { return R.config.kamera.modi[this.modusIndex]; }
    naechsterModus() { this.modusIndex = (this.modusIndex + 1) % R.config.kamera.modi.length; this._erstesMal = true; }

    /** fahrzeug: Vehicle; quelle (optional): interpolierte Darstellung desselben Autos. */
    folge(fahrzeug, quelle) { this.ziel = fahrzeug; this.quelle = quelle || fahrzeug; this._erstesMal = true; }

    /** Sichtweite (Far-Plane) an den Nebel anpassen: hinter dem Nebel wird nichts gezeichnet. */
    sichtweiteSetzen(far) {
      if (Math.abs(this.kamera.far - far) < 0.5) return;
      this.kamera.far = far;
      this.kamera.updateProjectionMatrix();
    }

    update(dt) {
      const f = this.quelle || this.ziel; if (!f) return;
      const k = R.config.kamera;
      const r = f.richtung();
      const m = this.modus;

      const lin = (a, b, t) => (b === undefined ? a : a + (b - a) * t);
      if (m === 'cockpit') {
        const c = k.cockpit, tA = this._fahrZustand(dt, c);
        this._erstesMal = false;
        // Blickrichtung leicht in die Kurve (Lenk-Vorgriff/Drift), Blick weiter voraus bei hohem Tempo
        const h = (f.heading !== undefined ? f.heading : Math.atan2(-r.x, -r.z)) + this._blickVersatz;
        const bw = lin(c.blickWeite || 30, c.blickWeiteSchnell, tA);
        this.kamera.position.set(f.x + r.x * c.vor, f.y + c.hoehe, f.z + r.z * c.vor);
        this.kamera.lookAt(f.x - Math.sin(h) * bw, f.y + c.hoehe - 0.5, f.z - Math.cos(h) * bw);
        // lookAt baut die Drehung mit up = (0,1,0) (Horizont waagerecht); danach nur die gewollte Wankneigung als Roll
        // um die Blickachse (YXZ: z = reiner Roll, unabhängig von der Fahrtrichtung)
        // FIX3 (nur Motorrad): im Flug schief hängende Kamera vermeiden – Roll weich auf 25 % (0,15 s ein, 0,5 s zurück)
        let rollF = 1;
        if (window.MOTORRAD === true) {
          const sp = R.spiel, fz = sp && sp.fahrzeuge && sp.fahrzeuge.find((x) => x.vehicle === this.ziel), fl = fz && fz.flug, luft = !!(fl && (fl.aktiv || fl.gleit));
          this._luftW = (this._luftW === undefined ? 0 : this._luftW) + ((luft ? 1 : 0) - (this._luftW || 0)) * (1 - Math.exp(-(luft ? 7 : 2) * dt));
          rollF = 1 - 0.75 * this._luftW;
        }
        this.kamera.rotation.z = f.neigung * 0.5 * rollF;
        this._wackelnAnwenden(dt);
        return;
      }

      const e = m === 'weit' ? k.weit : k.verfolger;
      const tA = this._fahrZustand(dt, e);
      const abstand = lin(e.abstand, e.abstandSchnell, tA), hoehe = lin(e.hoehe, e.hoeheSchnell, tA);
      const voraus = lin(e.vorausblick, e.vorausblickSchnell, tA);
      // Blickpunkt in Fahrtrichtung + Vorgriff (gedreht um _blickVersatz)
      const h = (f.heading !== undefined ? f.heading : Math.atan2(-r.x, -r.z)) + this._blickVersatz;
      const bx = -Math.sin(h), bz = -Math.cos(h);
      // Bei Rückwärtsfahrt bleibt die Kamera hinten (nicht umschwenken)
      const zielPos = this._zielPos.set(f.x - r.x * abstand, f.y + hoehe, f.z - r.z * abstand);
      const zielBlick = this._zielBlick.set(f.x + bx * voraus, f.y + 0.8, f.z + bz * voraus);
      if (this._erstesMal) { this.pos.copy(zielPos); this.blick.copy(zielBlick); this._erstesMal = false; }
      const t = 1 - Math.exp(-e.weichheit * dt);
      this.pos.lerp(zielPos, t);
      // Blick folgt schneller als die Position (Kurve früher im Bild)
      this.blick.lerp(zielBlick, 1 - Math.exp(-(e.blickWeichheit || e.weichheit * 1.6) * dt));
      this.kamera.position.copy(this.pos);
      this.kamera.lookAt(this.blick);
      this._wackelnAnwenden(dt);
    }
  }

  R.FahrzeugKamera = FahrzeugKamera;
})();
