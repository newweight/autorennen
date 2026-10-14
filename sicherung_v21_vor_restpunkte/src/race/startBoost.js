// ============================================================
// Start-Boost (Runde 6, D3): Gas im richtigen Moment beim Countdown-„LOS".
// Reine Logik ohne Three.js/DOM (Node-Test tests/test_startboost.js). Zeit trel = Sekunden relativ zu „LOS"
// (negativ im Countdown, danach Rennzeit seit dem Start).
//
// Regeln je Auto (Spieler 1 und 2 gleich):
// - Gas-Druck beginnt im Fenster [−0,25 s, +0,15 s] um „LOS"  → Boost: 1,5 s Turbo (vMax und Beschleunigung × 1,2).
// - Gas schon früher gedrückt und bei „LOS" noch gehalten    → „Zu früh!": 1 s Startverzögerung (Gas gesperrt).
//   (Wer zu früh drückt, aber wieder loslässt und im Fenster neu drückt, bekommt den Boost.)
// - Gas später als +0,15 s                                    → normaler Start.
// - Computerautos (ki = { fehler }): zufällig, Wahrscheinlichkeit sinkt mit dem Fehler-Anteil der Stufe
//   (leicht ≈ 15 %, mittel ≈ 47 %, unschlagbar 95 %); eigener Zufallsgenerator (verändert die KI-Fahrweise nicht).
// Die Faktoren wirken wie der Pickup-Turbo NUR um vehicle.schritt herum (main.js multipliziert beide nacheinander).
// ============================================================
(function () {
  const R = window.Rennspiel;

  const STANDARD = {
    fensterVor: 0.25,      // s vor LOS
    fensterNach: 0.15,     // s nach LOS
    dauer: 1.5,            // s Boost
    faktor: 1.2,           // vMax und Beschleunigung
    verzoegerung: 1.0,     // s Gas gesperrt bei „Zu früh"
    kiBasis: 0.95, kiFehlerGewicht: 3.2,   // KI-Chance = 0,95 − 3,2 × fehler (mind. 0,05)
  };

  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  class StartBoost {
    /** @param {number} anzahl Fahrzeuge  @param {object} [opt] überschreibt STANDARD (und R.config.startBoost)  */
    constructor(anzahl, opt) {
      this.cfg = Object.assign({}, STANDARD, R.config && R.config.startBoost, opt);
      this.autos = [];
      this._seed = (opt && opt.seed) || 90210;
      for (let i = 0; i < anzahl; i++) this._neu(i);
    }
    _neu(i) {
      return (this.autos[i] = { start: null, ergebnis: null, boostRest: 0, sperreRest: 0, rnd: mulberry32(this._seed + i * 7919), boosts: 0 });
    }
    _auto(i) { return this.autos[i] || this._neu(i); }

    /** Chance (0..1) eines Computerautos mit Fehler-Anteil `fehler` auf den Startboost. */
    kiChance(fehler) {
      const c = this.cfg;
      return Math.max(0.05, Math.min(0.95, c.kiBasis - c.kiFehlerGewicht * (fehler || 0)));
    }

    /** Ist für dieses Auto noch offen, ob es Boost/Verzögerung/normal gibt? */
    offen(i) { return this._auto(i).ergebnis === null; }
    /** Alle bekannten Autos entschieden? (dann braucht main.js eingabe() nicht mehr aufzurufen) */
    alleEntschieden() { return this.autos.every(a => a.ergebnis !== null); }
    ergebnis(i) { return this._auto(i).ergebnis; }

    /**
     * Gas-Eingabe eines Autos bewerten (jeden Physikschritt aufrufen, solange offen(i)).
     * @param {number} i      Fahrzeug-Nr
     * @param {boolean|number} gas  Gas gedrückt (> 0,5)?
     * @param {number} trel   Sekunden relativ zu LOS (< 0 Countdown, ≥ 0 seit Start)
     * @param {{fehler:number}} [ki]  Computerauto: Gas wird ignoriert, bei LOS gewürfelt
     * @returns {'boost'|'zufrueh'|null} Ereignis (nur im Moment der Entscheidung, sonst null)
     */
    eingabe(i, gas, trel, ki) {
      const a = this._auto(i), c = this.cfg;
      if (a.ergebnis !== null) return null;
      if (ki) {
        if (trel < 0) return null;
        if (a.rnd() < this.kiChance(ki.fehler)) return this._boost(a);
        a.ergebnis = 'normal';
        return null;
      }
      const an = typeof gas === 'number' ? gas > 0.5 : !!gas;
      if (an) { if (a.start === null) a.start = trel; } else a.start = null;
      if (trel < 0) {
        return null;                                         // Entscheidung fällt frühestens bei LOS
      }
      // ab LOS
      if (an && a.start !== null) {
        if (a.start >= -c.fensterVor - 1e-9 && a.start <= c.fensterNach + 1e-9) return this._boost(a);
        if (a.start < -c.fensterVor) { a.ergebnis = 'zufrueh'; a.sperreRest = c.verzoegerung; return 'zufrueh'; }
      }
      if (trel > c.fensterNach) { a.ergebnis = 'normal'; }   // zu spät oder nie gedrückt: normaler Start
      return null;
    }
    _boost(a) { a.ergebnis = 'boost'; a.boostRest = this.cfg.dauer; a.boosts++; return 'boost'; }

    /** Zeit weiterlaufen lassen (jeden Physikschritt, nach LOS). */
    schritt(dt) {
      for (let i = 0; i < this.autos.length; i++) {
        const a = this.autos[i];
        if (!a) continue;
        if (a.boostRest > 0) a.boostRest = Math.max(0, a.boostRest - dt);
        if (a.sperreRest > 0) a.sperreRest = Math.max(0, a.sperreRest - dt);
      }
    }
    /** Gas gesperrt („Zu früh!")? */
    gasSperre(i) { const a = this.autos[i]; return !!a && a.sperreRest > 0; }
    boostAktiv(i) { const a = this.autos[i]; return !!a && a.boostRest > 0; }
    /** Faktoren für vehicle.schritt (wie pickups.faktoren; Objekt wird wiederverwendet). */
    faktoren(i) {
      const a = this.autos[i], f = this._fk || (this._fk = { vMax: 1, beschleunigung: 1 });
      const an = !!a && a.boostRest > 0;
      f.vMax = an ? this.cfg.faktor : 1; f.beschleunigung = an ? this.cfg.faktor : 1;
      return f;
    }

    /** Kurzer Effekt über R.Audio (falls bereit): 'boost' | 'zufrueh'. */
    ton(art) {
      const A = R.Audio;
      if (!A || !A._bereit || !A._bereit() || !A._ton) return;
      if (art === 'boost') {
        A._ton(300, 1200, 0.5, 'sawtooth', 0.12, 0);
        A._ton(600, 1800, 0.4, 'triangle', 0.25, 0.05);
        A._ton(1200, 1200, 0.2, 'square', 0.05, 0.3);
      } else if (art === 'zufrueh') {
        A._ton(300, 120, 0.5, 'triangle', 0.4, 0);
      }
    }
  }

  StartBoost.STANDARD = STANDARD;
  R.StartBoost = StartBoost;
})();
