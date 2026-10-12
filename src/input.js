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

      const spielTasten = new Set();
      const t = R.config.tasten;
      t.spieler.forEach(s => ['gas', 'bremse', 'links', 'rechts'].forEach(k => spielTasten.add(s[k])));
      [t.resetSpieler1, t.resetSpieler2, t.item1, t.item2, t.kamera, t.pause, t.vollbild, ...t.bestaetigen]
        .forEach(k => spielTasten.add(k));
      this.spielTasten = spielTasten;

      window.addEventListener('keydown', (e) => {
        if (this.spielTasten.has(e.code)) e.preventDefault();
        if (!this.gedrueckt.has(e.code)) this.geradeGedrueckt.add(e.code);
        this.gedrueckt.add(e.code);
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
