// ============================================================
// Tastatur-Eingabe
// - benutzt event.code (physische Taste, egal ob QWERTZ/QWERTY)
// - verhindert Scrollen der Seite durch Pfeiltasten/Leertaste
// - setzt alles zurück, wenn das Fenster den Fokus verliert
// ============================================================
(function () {
  const R = window.Rennspiel;

  class Input {
    constructor() {
      this.gedrueckt = new Set();      // aktuell gehaltene Tasten (event.code)
      this.geradeGedrueckt = new Set(); // in diesem Frame neu gedrückt
      this._listener = [];
      this._dachFlanken = [];          // 14.10. (v20): neu entstandene Dach-Gesten { nr, art: 'gb' | 'lr' } – bis dach.js sie abholt

      const spielTasten = new Set();
      const t = R.config.tasten;
      t.spieler.forEach(s => ['gas', 'bremse', 'links', 'rechts'].forEach(k => spielTasten.add(s[k])));
      [t.resetSpieler1, t.resetSpieler2, t.item1, t.item2, t.kamera, t.pause, t.vollbild, ...t.bestaetigen]
        .forEach(k => spielTasten.add(k));
      this.spielTasten = spielTasten;

      window.addEventListener('keydown', (e) => {
        if (this.spielTasten.has(e.code)) e.preventDefault();
        const neu = !this.gedrueckt.has(e.code);
        if (neu) this.geradeGedrueckt.add(e.code);
        this.gedrueckt.add(e.code);
        if (neu) this._dachMerken();
        this._listener.forEach(fn => fn(e.code, e));
      });
      window.addEventListener('keyup', (e) => {
        this.gedrueckt.delete(e.code);
      });
      window.addEventListener('blur', () => this.gedrueckt.clear());
    }

    /** Wird einmal pro Frame nach der Verarbeitung aufgerufen. */
    frameEnde() { this.geradeGedrueckt.clear(); }

    istGedrueckt(code) { return this.gedrueckt.has(code); }
    wurdeGedrueckt(code) { return this.geradeGedrueckt.has(code); }

    /** Callback für Einzeltasten (Menü, Kamera, Pause). */
    beiTaste(fn) { this._listener.push(fn); }

    /** Merkt sich beim Drücken einer Taste, ob dadurch ein Tastenpaar (Gas+Bremse oder Links+Rechts) vollständig wurde (auch bei sehr niedrigen Bildraten). */
    _dachMerken() {
      const T = R.config.tasten.spieler;
      for (let nr = 0; nr < T.length; nr++) {
        const t = T[nr];
        if (this.gedrueckt.has(t.gas) && this.gedrueckt.has(t.bremse)) this._dachFlanken.push({ nr, art: 'gb' });
        if (this.gedrueckt.has(t.links) && this.gedrueckt.has(t.rechts)) this._dachFlanken.push({ nr, art: 'lr' });
      }
      if (this._dachFlanken.length > 8) this._dachFlanken.splice(0, this._dachFlanken.length - 8);
    }

    /** Holt (und löscht) eine neu entstandene Dach-Geste für Spieler nr; 'lr' (←+→ / A+D) nur, wenn zuZweit. */
    dachFlanke(nr, zuZweit) {
      let gefunden = false;
      this._dachFlanken = this._dachFlanken.filter((f) => {
        if (f.nr === nr && (f.art === 'gb' || zuZweit)) { gefunden = true; return false; }
        return f.nr !== nr;
      });
      return gefunden;
    }

    /** Verwirft alle gemerkten Gesten (außerhalb eines Rennens). */
    dachFlankenLeeren() { this._dachFlanken.length = 0; }

    /**
     * Dach-Geste (14.10. v20, src/cars/dach.js): zwei Gegentasten gleichzeitig gehalten.
     * Spieler 0 (Pfeile): ↑ + ↓ (Touch: ▲ + ▼, denn steuerung(0) enthält die Touch-Tasten); zu zweit zusätzlich ← + →.
     * Spieler 1 (WASD, nur zu zweit): W + S oder A + D.
     */
    dachGeste(spielerIndex, zuZweit) {   // Zustand „gerade gehalten“ (für Touch und als Absicherung)
      const t = R.config.tasten.spieler[spielerIndex];
      if (!t) return false;
      if (spielerIndex === 0) {
        const s = this.steuerung(0);
        if (s.gas > 0 && s.bremse > 0) return true;
      } else if (this.gedrueckt.has(t.gas) && this.gedrueckt.has(t.bremse)) return true;
      return !!zuZweit && this.gedrueckt.has(t.links) && this.gedrueckt.has(t.rechts);
    }

    /**
     * Steuerbefehle für Spieler n (0 oder 1).
     * Rückgabe: { gas: 0..1, bremse: 0..1, lenkung: -1..1 (links negativ) }
     */
    steuerung(spielerIndex) {
      const t = R.config.tasten.spieler[spielerIndex];
      if (!t) return { gas: 0, bremse: 0, lenkung: 0 };
      const gas = this.gedrueckt.has(t.gas) ? 1 : 0;
      const bremse = this.gedrueckt.has(t.bremse) ? 1 : 0;
      let lenkung = 0;
      if (this.gedrueckt.has(t.links)) lenkung -= 1;
      if (this.gedrueckt.has(t.rechts)) lenkung += 1;
      return { gas, bremse, lenkung };
    }
  }

  R.Input = Input;
})();
