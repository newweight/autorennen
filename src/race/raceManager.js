// ============================================================
// Rennleitung: Countdown, Checkpoints, Runden, Zeiten, Platzierung.
// Keine Abhängigkeit von Three.js (Node-Tests).
//
// Regeln:
// - Checkpoints müssen der Reihe nach passiert werden; Checkpoint 0 ist
//   Start/Ziel. Die Startaufstellung steht HINTER der Linie: das erste
//   Überfahren der Linie startet nur die Runde 1.
// - Eine Runde zählt nur, wenn nach dem letzten Checkpoint die Ziellinie
//   vorwärts überfahren wird. Rückwärts-Überfahren zählt nie.
// - Sprünge (Teleport, Reset) passieren keinen Checkpoint.
// - Das Rennen ist 'fertig', wenn alle Spieler im Ziel sind
//   (Computerautos dürfen weiterfahren). Ohne Spieler: wenn alle im Ziel sind.
// - Runde 6 (W3-F, D7) Option elimination („Letzter fliegt raus"): Sobald alle noch fahrenden Autos bis auf eines
//   Runde k geschafft haben, scheidet dieses eine aus (t.ausgeschieden, Ereignis 'raus'); k = Zahl der Ausgeschiedenen + 1.
//   Das letzte verbleibende Auto gewinnt (imZiel, Ereignis 'ziel'), dann 'fertig'. Sind alle Spieler raus, ist nach
//   elimination.zuschauerSekunden Schluss. Platzierung: Sieger, noch Fahrende, dann Ausgeschiedene (später raus = besser).
// ============================================================
(function () {
  const R = window.Rennspiel;

  const MAX_SCHRITT_WEG = 20;   // m pro Physikschritt – mehr ist ein Sprung
  const MAX_SCHRITT_S = 30;     // m Bogenlänge pro Schritt für die s-Prüfung

  class RaceManager {
    /**
     * @param {Strecke} strecke
     * @param {{vehicle:object, name:string, istSpieler:boolean}[]} teilnehmer
     * @param {{runden?:number, countdown?:number, elimination?:boolean|{zuschauerSekunden?:number|null}}} [optionen]
     */
    constructor(strecke, teilnehmer, optionen) {
      const opt = Object.assign({
        runden: R.config.rennen.rundenStandard,
        countdown: R.config.rennen.countdownSekunden,
      }, optionen);
      this.strecke = strecke;
      this.spline = strecke.spline;
      this.runden = opt.runden;
      this.countdownDauer = opt.countdown;
      this.countdown = opt.countdown;      // Restzeit in s
      this.zustand = this.countdown > 0 ? 'countdown' : 'laeuft';
      this.zeit = 0;                       // Rennzeit seit Start (s)
      this.bestzeit = null;                // schnellste Runde aller Teilnehmer
      this._callbacks = { runde: [], ziel: [], start: [], fertig: [], raus: [] };
      this.zieleinlaeufe = 0;
      // Runde 6 (W3-F): „Letzter fliegt raus" (null = normales Rennen, Verhalten unverändert)
      this.elimination = opt.elimination ? Object.assign({ zuschauerSekunden: null }, opt.elimination === true ? {} : opt.elimination) : null;
      this.ausgeschiedene = [];            // in Ausscheid-Reihenfolge
      this._zuschauZeit = 0;

      this.teilnehmer = teilnehmer.map((t, i) => {
        const v = t.vehicle;
        const n = this.spline.naechster(v.x, v.z);
        return {
          nr: i,
          vehicle: v,
          name: t.name || ('Auto ' + (i + 1)),
          istSpieler: !!t.istSpieler,
          runde: 0,                // fertige Runden
          gestartet: false,        // Startlinie schon einmal überfahren?
          naechsterCheckpoint: 0,  // erwarteter Checkpoint
          letzterCheckpoint: -1,   // zuletzt passierter (für Reset)
          index: n.index,          // Abtastindex (lokale Suche)
          s: n.s,
          seitenabstand: n.seitenabstand,
          fortschritt: 0,
          rundenStart: 0,
          rundenzeiten: [],
          bestzeit: null,
          imZiel: false,
          zielZeit: null,
          ausgeschieden: false,    // Runde 6 (W3-F): „Letzter fliegt raus"
          platz: i + 1,
          startPose: { x: v.x, z: v.z, heading: v.heading },
          _x: v.x, _z: v.z, _s: n.s,
        };
      });
      this._fortschrittBerechnen();
      this._platzierung();
    }

    /** Ereignis abonnieren: 'runde' (t, zeit), 'ziel' (t), 'start' (), 'fertig' (). */
    bei(name, fn) { (this._callbacks[name] = this._callbacks[name] || []).push(fn); }
    _melden(name, ...args) { (this._callbacks[name] || []).forEach(fn => fn(...args)); }

    /** Darf gefahren werden? (main.js sperrt sonst das Gas) */
    get gasErlaubt() { return this.zustand !== 'countdown'; }

    /** Anzeige-Zahl des Countdowns (3, 2, 1) oder 0. */
    get countdownZahl() { return this.zustand === 'countdown' ? Math.ceil(this.countdown) : 0; }

    schritt(dt) {
      if (this.zustand === 'countdown') {
        this.countdown -= dt;
        if (this.countdown <= 0) {
          this.countdown = 0;
          this.zustand = 'laeuft';
          this.zeit = 0;
          this._melden('start');
        }
        // Positionen trotzdem mitführen (falls jemand rollt)
        this.teilnehmer.forEach(t => this._verfolgen(t, false));
        return;
      }
      this.zeit += dt;
      this.teilnehmer.forEach(t => { if (!t.ausgeschieden) this._verfolgen(t, true); });
      this._fortschrittBerechnen();
      if (this.elimination && this.zustand === 'laeuft') this._eliminationPruefen(dt);
      this._platzierung();

      if (this.elimination) {
        if (this.zustand === 'laeuft' && this._elimFertig) { this.zustand = 'fertig'; this._melden('fertig'); }
      } else if (this.zustand === 'laeuft') {
        const spieler = this.teilnehmer.filter(t => t.istSpieler);
        const gruppe = spieler.length ? spieler : this.teilnehmer;
        if (gruppe.every(t => t.imZiel)) {
          this.zustand = 'fertig';
          this._melden('fertig');
        }
      }
    }

    /** Position eines Teilnehmers auf der Strecke nachführen und Checkpoints prüfen. */
    _verfolgen(t, zaehlen) {
      const v = t.vehicle, sp = this.spline;
      const n = sp.naechster(v.x, v.z, t.index);
      const weg = Math.hypot(v.x - t._x, v.z - t._z);
      const dsSchritt = sp.differenzS(n.s, t._s);
      t.index = n.index; t.s = n.s; t.seitenabstand = n.seitenabstand;

      if (zaehlen && !t.imZiel && weg < MAX_SCHRITT_WEG) {
        // Mehrere Checkpoints in einem Schritt sind unmöglich (Abstand ≥ 100 m)
        const cp = this.strecke.checkpoints[t.naechsterCheckpoint];
        if (this._passiert(cp, t._x, t._z, v.x, v.z, t._s, n.s, dsSchritt, n.seitenabstand)) {
          this._checkpointErreicht(t, cp);
        }
      }
      t._x = v.x; t._z = v.z; t._s = n.s;
    }

    /**
     * Checkpoint passiert?
     * a) Linie vorwärts gekreuzt (Vorzeichenwechsel der Projektion auf die Tangente)
     *    und der Kreuzungspunkt liegt innerhalb Straße + 2 Randbreiten, oder
     * b) Bogenlänge s springt vorwärts über cp.s (kleiner Schritt) und das Auto
     *    ist nicht weiter als seitenabstandMax von der Mitte (z. B. Kurve über Gras).
     */
    _passiert(cp, x0, z0, x1, z1, s0, s1, dsSchritt, seitenabstand) {
      const d0 = (x0 - cp.x) * cp.tx + (z0 - cp.z) * cp.tz;
      const d1 = (x1 - cp.x) * cp.tx + (z1 - cp.z) * cp.tz;
      if (d0 < 0 && d1 >= 0) {
        const w = -d0 / (d1 - d0);
        const qx = x0 + (x1 - x0) * w, qz = z0 + (z1 - z0) * w;
        const quer = (qx - cp.x) * cp.nx + (qz - cp.z) * cp.nz;
        if (Math.abs(quer) <= this.strecke.breite / 2 + 2 * this.strecke.randBreite) return true;
      }
      if (dsSchritt > 0 && dsSchritt < MAX_SCHRITT_S && Math.abs(seitenabstand) <= this.strecke.seitenabstandMax) {
        const vorher = this.spline.differenzS(s0, cp.s), jetzt = this.spline.differenzS(s1, cp.s);
        if (vorher < 0 && jetzt >= 0) return true;
      }
      return false;
    }

    _checkpointErreicht(t, cp) {
      const anzahl = this.strecke.checkpoints.length;
      t.letzterCheckpoint = cp.nr;
      if (cp.nr === 0) {
        if (!t.gestartet) {
          // erstes Überfahren der Startlinie: Runde 1 beginnt (Zeit läuft seit dem Start)
          t.gestartet = true;
        } else {
          // Runde geschafft
          const rundenzeit = this.zeit - t.rundenStart;
          t.rundenStart = this.zeit;
          t.runde++;
          t.rundenzeiten.push(rundenzeit);
          if (t.bestzeit === null || rundenzeit < t.bestzeit) t.bestzeit = rundenzeit;
          if (this.bestzeit === null || rundenzeit < this.bestzeit) this.bestzeit = rundenzeit;
          this._melden('runde', t, rundenzeit);
          if (t.runde >= this.runden && !this.elimination) {   // Elimination: Sieger = letztes Auto (_eliminationPruefen)
            t.imZiel = true;
            t.zielZeit = this.zeit;
            this.zieleinlaeufe++;
            t.zielPlatz = this.zieleinlaeufe;
            this._melden('ziel', t);
          }
        }
      }
      t.naechsterCheckpoint = (cp.nr + 1) % anzahl;
    }

    /**
     * Fortschritt = runde * laenge + s, aber begrenzt auf den Abschnitt zwischen
     * letztem und nächstem Checkpoint (Abkürzen bringt keinen Platz).
     */
    _fortschrittBerechnen() {
      const L = this.spline.laenge, cps = this.strecke.checkpoints;
      this.teilnehmer.forEach((t) => {
        if (t.ausgeschieden) return;           // Runde 6: eingefroren
        if (t.imZiel) { t.fortschritt = this.runden * L; return; }
        if (!t.gestartet) {
          // vor der Startlinie: negativer Abstand zur Linie
          t.fortschritt = Math.min(0, this.spline.differenzS(t.s, 0));
        } else {
          const von = t.letzterCheckpoint >= 0 ? cps[t.letzterCheckpoint].s : 0;
          const bisCp = cps[t.naechsterCheckpoint];
          const bis = bisCp.nr === 0 ? L : bisCp.s;
          let s = t.s;
          if (s < von - L / 2) s += L;           // schon über die Linie gerollt
          s = Math.max(von, Math.min(bis, s));
          t.fortschritt = t.runde * L + s;
        }
        t.vehicle.streckeFortschritt = t.fortschritt;
      });
    }

    _platzierung() {
      const sortiert = this.teilnehmer.slice().sort((a, b) => {
        // Runde 6 (W3-F): Ausgeschiedene hinten, wer später rausflog, steht weiter vorn (normales Rennen: nie gesetzt)
        if (a.ausgeschieden !== b.ausgeschieden) return a.ausgeschieden ? 1 : -1;
        if (a.ausgeschieden) return b.ausscheidNr - a.ausscheidNr;
        if (a.imZiel && b.imZiel) return a.zielZeit - b.zielZeit || a.zielPlatz - b.zielPlatz;
        if (a.imZiel !== b.imZiel) return a.imZiel ? -1 : 1;
        return b.fortschritt - a.fortschritt;
      });
      sortiert.forEach((t, i) => { t.platz = i + 1; });
      this.rangliste = sortiert;
    }

    /**
     * Runde 6 (W3-F): „Letzter fliegt raus". Haben alle Fahrenden bis auf höchstens eines Runde k geschafft
     * (k = Ausgeschiedene + 1) – oder ist der Führende schon in Runde k + 1 fertig –, scheidet das Hinterste aus;
     * auch mehrere hintereinander, falls Überrundete zurückliegen.
     */
    _eliminationPruefen(dt) {
      let aktive = this.teilnehmer.filter(t => !t.ausgeschieden);
      while (aktive.length > 1) {
        const k = this.ausgeschiedene.length + 1;
        const nochNicht = aktive.filter(t => t.runde < k);
        // warten, bis höchstens eines fehlt – außer der Führende ist schon eine Runde weiter (kein Hängenbleiben)
        if (nochNicht.length > 1 && !aktive.some(t => t.runde >= k + 1)) break;
        const kandidaten = nochNicht.length ? nochNicht : aktive;
        const raus = kandidaten.slice().sort((a, b) => a.fortschritt - b.fortschritt)[0];
        raus.ausgeschieden = true;
        raus.ausscheidRunde = k;
        raus.ausscheidZeit = this.zeit;
        raus.ausscheidNr = this.ausgeschiedene.length + 1;
        this.ausgeschiedene.push(raus);
        aktive = aktive.filter(t => t !== raus);
        this._melden('raus', raus);
      }
      if (aktive.length === 1 && !aktive[0].imZiel) {
        const s = aktive[0];
        s.imZiel = true; s.zielZeit = this.zeit; this.zieleinlaeufe++; s.zielPlatz = 1;
        this._melden('ziel', s);
        this._elimFertig = true;
      }
      // alle Spieler raus: noch kurz zuschauen, dann Ergebnis (Reihenfolge der Fahrenden = aktuelle Plätze)
      const spieler = this.teilnehmer.filter(t => t.istSpieler);
      const zs = this.elimination.zuschauerSekunden;
      if (!this._elimFertig && spieler.length && spieler.every(t => t.ausgeschieden) && typeof zs === 'number') {
        this._zuschauZeit += dt;
        if (this._zuschauZeit >= zs) this._elimFertig = true;
      }
    }

    /** Aktuelle Rundenzeit eines Teilnehmers (s). */
    rundenzeit(t) { return this.zustand === 'countdown' ? 0 : this.zeit - t.rundenStart; }

    /**
     * Pose zum Zurücksetzen: auf der Straßenmitte am zuletzt passierten
     * Checkpoint, in Fahrtrichtung. Vor dem Start: Startplatz.
     * Setzt auch die interne Verfolgung um (kein falsches Checkpoint-Zählen).
     * @returns {{x:number, z:number, heading:number}}
     */
    resetPose(t) {
      if (typeof t === 'number') t = this.teilnehmer[t];
      let pose;
      if (t.letzterCheckpoint < 0) {
        pose = Object.assign({}, t.startPose);
      } else {
        const cp = this.strecke.checkpoints[t.letzterCheckpoint];
        pose = { x: cp.x, z: cp.z, heading: R.headingAus(cp.tx, cp.tz) };
      }
      this.verfolgungSetzen(t, pose.x, pose.z);
      return pose;
    }

    /**
     * Interne Verfolgung auf eine neue Position umsetzen (nach Reset/Versatz),
     * damit der Sprung keinen Checkpoint auslöst.
     */
    verfolgungSetzen(t, x, z) {
      if (typeof t === 'number') t = this.teilnehmer[t];
      const n = this.spline.naechster(x, z);
      t.index = n.index; t.s = n.s; t._s = n.s; t._x = x; t._z = z; t.seitenabstand = n.seitenabstand;
    }
  }

  R.RaceManager = RaceManager;
})();
