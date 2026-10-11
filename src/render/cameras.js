// ============================================================
// Kameras: Verfolger (Chase-Cam), Cockpit, weit
// Jede Kamera folgt einem Fahrzeug weich nach.
// ============================================================
(function () {
  const R = window.Rennspiel;

  class FahrzeugKamera {
    constructor(aspect) {
      const g = R.config.grafik;
      this.kamera = new THREE.PerspectiveCamera(g.fov, aspect, 0.3, g.sichtweite + 200);
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

      if (m === 'cockpit') {
        this.kamera.position.set(f.x + r.x * k.cockpit.vor, f.y + k.cockpit.hoehe, f.z + r.z * k.cockpit.vor);
        this.kamera.lookAt(f.x + r.x * 30, f.y + k.cockpit.hoehe - 0.5, f.z + r.z * 30);
        this.kamera.rotation.z = f.neigung * 0.5;
        this._wackelnAnwenden(dt);
        return;
      }

      const e = m === 'weit' ? k.weit : k.verfolger;
      // Bei Rückwärtsfahrt bleibt die Kamera hinten (nicht umschwenken)
      const zielPos = this._zielPos.set(f.x - r.x * e.abstand, f.y + e.hoehe, f.z - r.z * e.abstand);
      const zielBlick = this._zielBlick.set(f.x + r.x * e.vorausblick, f.y + 0.8, f.z + r.z * e.vorausblick);
      if (this._erstesMal) { this.pos.copy(zielPos); this.blick.copy(zielBlick); this._erstesMal = false; }
      const t = 1 - Math.exp(-e.weichheit * dt);
      this.pos.lerp(zielPos, t);
      this.blick.lerp(zielBlick, Math.min(1, t * 1.6));
      this.kamera.position.copy(this.pos);
      this.kamera.lookAt(this.blick);
      this._wackelnAnwenden(dt);
    }
  }

  R.FahrzeugKamera = FahrzeugKamera;
})();
