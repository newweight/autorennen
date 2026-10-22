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
      this._bremsTipps = [[], []];     // 14.10. (v22): Zeitpunkte (s) der letzten Rückwärts-/Bremstipps je Spieler (Doppeltipp = Polizei freikaufen)
      this._bremsPrev = [false, false];
      this._bremsDoppel = [-Infinity, -Infinity];
      this._dachFlanken = [];          // 14.10. (v20): neu entstandene Dach-Gesten { nr, art: 'gb' | 'lr' } – bis dach.js sie abholt

      const spielTasten = new Set();
      const t = R.config.tasten;
      t.spieler.forEach(s => ['gas', 'bremse', 'links', 'rechts'].forEach(k => spielTasten.add(s[k])));
      [t.resetSpieler1, t.resetSpieler2, t.item1, t.item2, t.kamera, t.pause, t.vollbild, ...t.bestaetigen]
        .forEach(k => spielTasten.add(k));
      this.spielTasten = spielTasten;

      window.addEventListener('keydown', (e) => {
        if (this.spielTasten.has(e.code)) e.preventDefault();
        // v31b (Sebastian): Browser-Zoom per Tastatur (⌘/Strg + Plus/Minus/0) im Spiel unterbinden – versehentlich gedrückt sah alles „riesig“ aus
        if ((e.metaKey || e.ctrlKey) && (e.key === '+' || e.key === '-' || e.key === '=' || e.key === '0' || e.code === 'NumpadAdd' || e.code === 'NumpadSubtract')) e.preventDefault();
        const neu = !this.gedrueckt.has(e.code);
        if (neu) this.geradeGedrueckt.add(e.code);
        this.gedrueckt.add(e.code);
        if (neu) { this._dachMerken(); this._bremsMerken(e.code); }
        this._listener.forEach(fn => fn(e.code, e));
      });
      window.addEventListener('keyup', (e) => {
        this.gedrueckt.delete(e.code);
      });
      window.addEventListener('blur', () => this.gedrueckt.clear());
      // v31b: Trackpad-Pinch-Zoom (kommt als wheel mit ctrlKey) ebenfalls aus
      window.addEventListener('wheel', (e) => { if (e.ctrlKey) e.preventDefault(); }, { passive: false });
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

    // ---------- 14.10. (v22) Doppeltipp Rückwärts (Spieler 1 ↓, Spieler 2 S, Touch ▼ = Spieler 1) ----------
    _jetzt() { return (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000; }
    _bremsMerken(code) {
      const T = R.config.tasten.spieler;
      for (let nr = 0; nr < T.length && nr < 2; nr++) if (T[nr].bremse === code) this._bremsTipp(nr, this._jetzt(), this.gedrueckt.has(T[nr].gas));
    }
    /** Ein neuer Tipp auf Rückwärts/Bremse. Mit gehaltenem Gas (Dach-Geste ↑+↓) zählt er nicht und löscht die Reihe. */
    _bremsTipp(nr, zeit, gasGehalten) {
      const l = this._bremsTipps[nr], fenster = (R.config.polizei && R.config.polizei.freikaufFenster) || 0.5;
      if (gasGehalten) { l.length = 0; return; }
      if (l.length && zeit - l[l.length - 1] <= fenster) { this._bremsDoppel[nr] = zeit; l.length = 0; }
      else { l.length = 0; l.push(zeit); }
    }
    /**
     * Wurde Rückwärts für Spieler nr gerade zweimal kurz hintereinander getippt (≤ 0,5 s)? Einmal pro Doppeltipp true (danach false),
     * höchstens 1 s nach dem zweiten Tipp (bei niedriger Bildrate wird erst im nächsten Bild abgefragt). Wird auch für Touch-▼ (steuerung(0) enthält die Touch-Tasten) pro Aufruf auf eine neue Flanke geprüft.
     * Jeden Schritt aufrufen (auch wenn nichts anliegt), sonst bleibt ein alter Tipp liegen.
     */
    rueckwaertsDoppel(nr) {
      if (nr !== 0 && nr !== 1) return false;
      const T = R.config.tasten.spieler[nr], jetzt = this._jetzt();
      if (T) {
        const s = this.steuerung(nr), an = s.bremse > 0;
        if (an && !this._bremsPrev[nr] && !this.gedrueckt.has(T.bremse)) this._bremsTipp(nr, jetzt, s.gas > 0);    // Touch ▼ (Tastatur kommt über keydown)
        this._bremsPrev[nr] = an;
      }
      if (jetzt - this._bremsDoppel[nr] <= 1.0) { this._bremsDoppel[nr] = -Infinity; return true; }
      return false;
    }
    /** Gemerkte Tipps verwerfen (Rennstart / Pause). */
    bremsTippsLeeren() { this._bremsTipps = [[], []]; this._bremsDoppel = [-Infinity, -Infinity]; }

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
