// ============================================================
// Ton: alles synthetisch mit Web Audio (keine Dateien, läuft über file://).
//
// Rennspiel.Audio ist ein Singleton:
//   start()                       AudioContext anlegen/fortsetzen (nach erster Nutzer-Eingabe)
//   an / setzeAn(b) / schalten()  Ton ein/aus (localStorage 'rennspiel.ton')
//   setzeLautstaerke(0..1)
//   motorAnlegen(id, {spieler}) / motorUpdate(id, {tempo, vMax, gas, untergrund, abstand, dt})
//   motorEntfernen(id) / motorAlleEntfernen() / motorStumm(bool)
//   countdown(n) kollision(staerke) bande() runde() ziel(platz) menueKlick() bremsen(an)
//   schadenTreffer(stufe) liegengeblieben() abschleppen()   (Runde 4, Schaden-System)
//   wetter('regen'|'hagel'|'schnee'|'wind', an, staerke 0..1) / wetterAlleAus()   (Runde 4, Dauer-Geräusche)
//   statistik()                   Zähler (aktive Nodes usw.) für Tests
//
// Aufbau: Motor-Stimmen (Sägezahn + Rechteck → Tiefpass) liegen in einem festen
// Pool von höchstens 5 Slots (2 Spieler + 3 KI). Oszillatoren laufen dauerhaft und
// werden nur umgestimmt – pro Frame entstehen keine neuen Nodes. Kurze Effekte
// erzeugen Nodes, die sich nach dem Ende selbst abbauen.
// Fehlt der AudioContext oder ist er "suspended", tut jede Methode einfach nichts.
// ============================================================
(function () {
  const R = window.Rennspiel = window.Rennspiel || {};

  const K = {
    speicher: 'rennspiel.ton',
    lautstaerke: 0.7,
    maxKi: 3,              // so viele KI-Motoren gleichzeitig hörbar
    maxStimmen: 5,         // 2 Spieler + 3 KI
    hoerweite: 60,         // m: weiter entfernte KI-Autos sind stumm (Slot frei, kein Update)
    tauschPuffer: 5,       // m: ein näheres KI-Auto verdrängt erst ab so viel Vorsprung
    fMin: 62, fMax: 380,   // Hz Grundton (Leerlauf ≈ 87 Hz)
    leerlauf: 0.08,        // Drehzahl (0..1) im Stand
  };
  // Gänge: Geschwindigkeitsanteil (an vMax), in dem der Gang gefahren wird
  const GANG_VON = [0.0, 0.22, 0.45, 0.70];
  const GANG_BIS = [0.25, 0.50, 0.75, 1.01];
  const GANG_RPM_MIN = [K.leerlauf, 0.40, 0.40, 0.40];   // Drehzahl direkt nach dem Schalten

  const klemme = (x, lo, hi) => (x < lo ? lo : (x > hi ? hi : x));

  class Ton {
    constructor() {
      this._ctx = null;
      this._keinAudio = false;
      this._an = true;
      try { if (window.localStorage.getItem(K.speicher) === '0') this._an = false; } catch (e) { /* egal */ }
      this.lautstaerke = K.lautstaerke;
      this._master = null; this._motorBus = null; this._effekte = null; this._komp = null;
      this._rausch = null; this._quietsch = null; this._quietscht = 0;
      this._stimmen = new Map();      // id → Stimme (logisch)
      this._slots = [];               // Pool mit echten Nodes
      this._kiAktiv = 0;
      this._spielerStimmen = 0;
      this._stummMotor = false;
      this._zaehler = 0;
      this._letzteKollision = -1; this._letzteBande = -1;
      this._erzeugt = 0; this._aktiv = 0;
      this._suspendTimer = null;
      this._horcher = null;
      this._wetterTon = {};           // Runde 4: art → { quellen, gain }
    }

    // ---------- Zustand ----------
    get an() { return this._an; }
    set an(b) { this.setzeAn(b); }

    /** Läuft der AudioContext und ist der Ton an? */
    _bereit() { return !!this._ctx && this._ctx.state === 'running' && this._an; }

    /** Zähler für Tests. aktiv = lebende Nodes (Dauer-Nodes + laufende Effekte). */
    statistik() {
      const m = this._master;
      return {
        zustand: this._ctx ? this._ctx.state : (this._keinAudio ? 'keiner' : 'nicht gestartet'),
        an: this._an, lautstaerke: this.lautstaerke,
        gain: m ? m.gain.value : null, zielGain: this._an ? this.lautstaerke : 0,
        erzeugt: this._erzeugt, aktiv: this._aktiv,
        stimmen: this._stimmen.size, slots: this._slots.length,
        slotsBelegt: this._slots.filter(s => s.besitzer).length, kiAktiv: this._kiAktiv,
      };
    }

    /** Diagnose einer Motor-Stimme (nur für Tests/Debug, allokiert). */
    motorInfo(id) {
      const v = this._stimmen.get(id);
      if (!v) return null;
      return { gang: v.gang + 1, rpm: v.rpm, rpmZiel: v.rpmZiel, grundton: v.grundton, hatSlot: !!v.slot, abstand: v.abstand, spieler: v.spieler };
    }

    // ---------- Start ----------
    /** Nach einer Nutzer-Eingabe aufrufen (mehrfach harmlos). Gibt true zurück, wenn der Ton läuft. */
    start() {
      if (!this._ctx && !this._keinAudio) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) { this._keinAudio = true; return false; }
        try {
          let c;
          try { c = new AC({ latencyHint: 'interactive' }); } catch (e) { c = new AC(); }
          this._ctx = c;
          this._aufbauen();
        } catch (e) { this._ctx = null; this._keinAudio = true; return false; }
      }
      this._fortsetzen();
      if (this._ctx && this._ctx.state === 'running') this._horcherEntfernen();
      return this._bereit();
    }

    _fortsetzen() {
      const c = this._ctx;
      if (!c || !this._an || c.state === 'running') return;
      try { const p = c.resume(); if (p && p.catch) p.catch(() => {}); } catch (e) { /* egal */ }
    }

    /** Erste Eingabe abwarten (Autoplay-Regel) – wird beim Laden automatisch eingerichtet. */
    _horcherSetzen() {
      if (this._horcher || typeof window.addEventListener !== 'function') return;
      this._horcher = () => { this.start(); };
      ['keydown', 'pointerdown', 'mousedown', 'touchstart', 'click'].forEach(n => window.addEventListener(n, this._horcher, true));
    }
    _horcherEntfernen() {
      if (!this._horcher) return;
      ['keydown', 'pointerdown', 'mousedown', 'touchstart', 'click'].forEach(n => window.removeEventListener(n, this._horcher, true));
      this._horcher = null;
    }

    _n(node) { this._erzeugt++; this._aktiv++; return node; }

    _gain(wert) { const g = this._n(this._ctx.createGain()); g.gain.value = wert; return g; }

    _aufbauen() {
      const c = this._ctx;
      this._master = this._gain(0);
      const k = this._komp = this._n(c.createDynamicsCompressor());
      k.threshold.value = -14; k.knee.value = 18; k.ratio.value = 6; k.attack.value = 0.003; k.release.value = 0.2;
      this._master.connect(k); k.connect(c.destination);
      this._motorBus = this._gain(this._stummMotor ? 0 : 0.5); this._motorBus.connect(this._master);
      this._effekte = this._gain(0.7); this._effekte.connect(this._master);

      // 2 s weißes Rauschen, von allen Rausch-Quellen geteilt
      const len = Math.floor(c.sampleRate * 2);
      const puffer = c.createBuffer(1, len, c.sampleRate);
      const d = puffer.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this._rausch = puffer;

      // Dauer-Quietschen (Bremsen): schmalbandiges Rauschen, Gain 0 bis bremsen(true)
      const q = this._n(c.createBufferSource()); q.buffer = puffer; q.loop = true;
      const f = this._n(c.createBiquadFilter()); f.type = 'bandpass'; f.frequency.value = 2300; f.Q.value = 12;
      const g = this._gain(0);
      q.connect(f); f.connect(g); g.connect(this._effekte);
      q.start(0, Math.random());
      this._quietsch = g;

      this._masterSetzen(0.15);
    }

    _masterSetzen(tau) {
      const c = this._ctx; if (!c || !this._master) return;
      const ziel = this._an ? this.lautstaerke : 0;
      try { this._master.gain.setTargetAtTime(ziel, c.currentTime, tau === undefined ? 0.06 : tau); } catch (e) { /* egal */ }
    }

    // ---------- Schalter ----------
    setzeLautstaerke(v) {
      v = +v; if (!isFinite(v)) return;
      this.lautstaerke = klemme(v, 0, 1);
      this._masterSetzen(0.05);
    }

    setzeAn(b) {
      b = !!b;
      this._an = b;
      try { window.localStorage.setItem(K.speicher, b ? '1' : '0'); } catch (e) { /* egal */ }
      const c = this._ctx;
      if (this._suspendTimer) { clearTimeout(this._suspendTimer); this._suspendTimer = null; }
      if (!c) return;
      if (b) { this._fortsetzen(); this._masterSetzen(0.08); }
      else {
        this._masterSetzen(0.04);
        this._quietscht = 0;
        // nach dem Ausblenden den Context anhalten (spart CPU)
        this._suspendTimer = setTimeout(() => {
          this._suspendTimer = null;
          if (!this._an && c.state === 'running') { try { const p = c.suspend(); if (p && p.catch) p.catch(() => {}); } catch (e) { /* egal */ } }
        }, 400);
      }
    }

    /** Ton umschalten; gibt den neuen Zustand zurück. */
    schalten() { this.setzeAn(!this._an); return this._an; }

    /** Alle Motoren stumm (Pause, Menü, Ergebnis). */
    motorStumm(b) {
      this._stummMotor = !!b;
      if (this._motorBus && this._ctx) {
        try { this._motorBus.gain.setTargetAtTime(b ? 0 : 0.5, this._ctx.currentTime, 0.05); } catch (e) { /* egal */ }
      }
    }

    // ---------- Motor ----------
    /**
     * Motor-Stimme anmelden. opt.spieler = true: immer hörbar (volle Lautstärke).
     * Sonst KI: nur in Hörweite, leiser, höchstens 3 gleichzeitig.
     */
    motorAnlegen(id, opt) {
      let v = this._stimmen.get(id);
      const spieler = !!(opt && opt.spieler);
      if (!v) {
        v = {
          id, spieler, gang: 0, rpm: K.leerlauf, rpmZiel: K.leerlauf, grundton: K.fMin + K.leerlauf * (K.fMax - K.fMin),
          dip: 0, abstand: 0, slot: null, zeit: 0, neu: true, ug: '',
          lf: 0, lc: 0, ll: -1, lr: -1,     // zuletzt geplante Werte (Frequenz, Filter, Lautstärke, Rauschen)
          stimmung: 1 + ((this._zaehler++ % 5) - 2) * 0.015,
        };
        this._stimmen.set(id, v);
      } else if (v.spieler !== spieler) {
        if (v.slot) this._slotLoesen(v);
        v.spieler = spieler;
      }
      this._spielerZaehlen();
      return id;
    }

    _spielerZaehlen() {
      let n = 0;
      this._stimmen.forEach(v => { if (v.spieler) n++; });
      this._spielerStimmen = n;
    }

    motorEntfernen(id) {
      const v = this._stimmen.get(id);
      if (!v) return;
      if (v.slot) this._slotLoesen(v);
      this._stimmen.delete(id);
      this._spielerZaehlen();
    }

    motorAlleEntfernen() {
      this._stimmen.forEach(v => { if (v.slot) this._slotLoesen(v); });
      this._stimmen.clear();
      this._spielerStimmen = 0;
    }

    /** Ein Slot = fertige Motor-Signalkette (9 Nodes), die dauerhaft läuft. */
    _slotBauen() {
      const c = this._ctx;
      const k = {
        out: this._gain(0), filter: this._n(c.createBiquadFilter()),
        oscS: this._n(c.createOscillator()), oscQ: this._n(c.createOscillator()),
        gS: this._gain(0.5), gQ: this._gain(0.32),
        rausch: this._n(c.createBufferSource()), rFilter: this._n(c.createBiquadFilter()), rGain: this._gain(0),
      };
      k.filter.type = 'lowpass'; k.filter.frequency.value = 400; k.filter.Q.value = 1.2;
      k.oscS.type = 'sawtooth'; k.oscS.detune.value = -6; k.oscS.frequency.value = 90;
      k.oscQ.type = 'square'; k.oscQ.detune.value = 9; k.oscQ.frequency.value = 45;
      k.oscS.connect(k.gS); k.oscQ.connect(k.gQ); k.gS.connect(k.filter); k.gQ.connect(k.filter);
      k.filter.connect(k.out); k.out.connect(this._motorBus);
      k.rausch.buffer = this._rausch; k.rausch.loop = true;
      k.rFilter.type = 'bandpass'; k.rFilter.Q.value = 0.8; k.rFilter.frequency.value = 700;
      k.rausch.connect(k.rFilter); k.rFilter.connect(k.rGain); k.rGain.connect(k.out);
      k.oscS.start(); k.oscQ.start(); k.rausch.start(0, Math.random() * 1.5);
      return { k, besitzer: null };
    }

    _weitesterKi() {
      let w = null;
      for (let i = 0; i < this._slots.length; i++) {
        const b = this._slots[i].besitzer;
        if (b && !b.spieler && (!w || b.abstand > w.besitzer.abstand)) w = this._slots[i];
      }
      return w;
    }

    _slotNehmen(v) {
      let slot = null;
      if (!v.spieler && this._kiAktiv >= K.maxKi) {
        const w = this._weitesterKi();
        if (!w || w.besitzer.abstand <= v.abstand + K.tauschPuffer) return false;
        this._slotLoesen(w.besitzer); slot = w;
      } else {
        for (let i = 0; i < this._slots.length; i++) if (!this._slots[i].besitzer) { slot = this._slots[i]; break; }
        if (!slot && this._slots.length < K.maxStimmen) { slot = this._slotBauen(); this._slots.push(slot); }
        if (!slot && v.spieler) {            // alles belegt: Spieler verdrängt das weiteste KI-Auto
          const w = this._weitesterKi();
          if (w) { this._slotLoesen(w.besitzer); slot = w; }
        }
        if (!slot) return false;
      }
      slot.besitzer = v; v.slot = slot; v.neu = true; v.dip = 0; v.ug = '';
      if (!v.spieler) this._kiAktiv++;
      return true;
    }

    _slotLoesen(v) {
      const s = v.slot; if (!s) return;
      if (!v.spieler) this._kiAktiv--;
      s.besitzer = null; v.slot = null;
      if (this._ctx) {
        const t = this._ctx.currentTime;
        try { s.k.out.gain.setTargetAtTime(0, t, 0.03); s.k.rGain.gain.setTargetAtTime(0, t, 0.03); } catch (e) { /* egal */ }
      }
    }

    /**
     * Pro Frame aufrufen. d = { tempo (m/s), vMax (m/s), gas 0..1, untergrund, abstand (m, nur KI), dt (s, optional) }
     * Das Objekt d darf wiederverwendet werden.
     */
    motorUpdate(id, d) {
      const v = this._stimmen.get(id);
      if (!v || !d || !this._bereit()) return;
      v.abstand = v.spieler ? 0 : (d.abstand > 0 ? d.abstand : 0);
      if (!v.spieler && v.abstand >= K.hoerweite) { if (v.slot) this._slotLoesen(v); return; }
      if (!v.slot && !this._slotNehmen(v)) return;
      const k = v.slot.k, c = this._ctx, t = c.currentTime;

      let dt = d.dt > 0 ? d.dt : t - v.zeit;
      v.zeit = t;
      dt = klemme(dt, 0.001, 0.1);

      // --- Gang und Drehzahl ---
      const vMax = d.vMax > 1 ? d.vMax : 40;
      const tempo = d.tempo > 0 ? d.tempo : 0;
      const r = Math.min(1, tempo / vMax);
      const gas = klemme(+d.gas || 0, 0, 1);
      let g = v.gang;
      while (g < 3 && r > GANG_BIS[g]) g++;
      while (g > 0 && r < GANG_VON[g] - 0.04) g--;
      if (g !== v.gang) { if (g > v.gang) v.dip = 0.14; v.gang = g; }   // beim Hochschalten kurz Gas weg
      let x = klemme((r - GANG_VON[g]) / (GANG_BIS[g] - GANG_VON[g]), 0, 1);
      if (g === 0) x = Math.max(x, gas * 0.4 * Math.max(0, 1 - r * 10));   // im Stand hochdrehen
      const lo = GANG_RPM_MIN[g];
      v.rpmZiel = Math.min(1, lo + (1 - lo) * x + 0.07 * gas);
      v.rpm += (v.rpmZiel - v.rpm) * Math.min(1, dt * 10);
      const rpm = v.rpm;
      let dipF = 1;
      if (v.dip > 0) { v.dip -= dt; dipF = 0.55; }

      // --- Pegel (KI: nach Entfernung leiser und dumpfer) ---
      let pegel = 1, dumpf = 1;
      if (v.spieler) { if (this._spielerStimmen > 1) pegel = 0.75; }
      else { const nah = 1 - v.abstand / K.hoerweite; pegel = nah * nah * 0.6; dumpf = 0.5 + 0.5 * nah; }

      const f = (K.fMin + rpm * (K.fMax - K.fMin)) * v.stimmung;
      v.grundton = f;
      const cutoff = (280 + rpm * 850 + gas * 350) * dumpf;
      const laut = (0.14 + 0.45 * gas * (0.4 + 0.6 * rpm) + 0.12 * rpm) * dipF * pegel;

      // --- Rauschen auf Gras/Sand ---
      const ug = d.untergrund;
      let rausch = 0;
      if (ug === 'gras') rausch = 0.10; else if (ug === 'sand') rausch = 0.13; else if (ug === 'rand') rausch = 0.03;
      rausch *= Math.min(1, tempo / 12) * pegel;

      // Nur neu planen, wenn sich ein Wert merklich ändert (> 0,5 % bzw. kleiner Absolutwert):
      // spart AudioParam-Ereignisse – im Leerlauf/bei Vollgas fast keine Aufrufe je Frame.
      const anders = (a, b, abs) => Math.abs(a - b) > Math.max(abs, Math.abs(b) * 0.005);
      if (v.neu) {
        // frisch zugeteilt: Frequenzen sofort setzen (Pegel blendet weich ein)
        k.oscS.frequency.cancelScheduledValues(t); k.oscS.frequency.setValueAtTime(f, t);
        k.oscQ.frequency.cancelScheduledValues(t); k.oscQ.frequency.setValueAtTime(f * 0.5, t);
        k.filter.frequency.cancelScheduledValues(t); k.filter.frequency.setValueAtTime(cutoff, t);
        v.lf = f; v.lc = cutoff; v.ll = -1; v.lr = -1;
        v.neu = false;
      } else {
        if (anders(f, v.lf, 0.3)) { v.lf = f; k.oscS.frequency.setTargetAtTime(f, t, 0.03); k.oscQ.frequency.setTargetAtTime(f * 0.5, t, 0.03); }
        if (anders(cutoff, v.lc, 2)) { v.lc = cutoff; k.filter.frequency.setTargetAtTime(cutoff, t, 0.04); }
      }
      if (anders(laut, v.ll, 0.002)) { v.ll = laut; k.out.gain.setTargetAtTime(laut, t, 0.04); }
      if (anders(rausch, v.lr, 0.002)) { v.lr = rausch; k.rGain.gain.setTargetAtTime(rausch, t, 0.08); }
      if (ug !== v.ug) {
        v.ug = ug;
        k.rFilter.frequency.setTargetAtTime(ug === 'sand' ? 1100 : 650, t, 0.05);
      }
    }

    // ---------- Bausteine für Effekte ----------
    /** Nodes nach dem Ende der Quelle abbauen und aus dem Zähler nehmen. */
    _aufraeumen(quelle, nodes) {
      quelle.onended = () => {
        for (let i = 0; i < nodes.length; i++) { try { nodes[i].disconnect(); } catch (e) { /* egal */ } }
        this._aktiv -= nodes.length;
      };
    }

    /** Ein Ton: Frequenz f0 → f1, Hüllkurve schnell hoch, dann ausklingend. */
    _ton(f0, f1, dauer, typ, pegel, versatz) {
      const c = this._ctx, t = c.currentTime + (versatz || 0);
      const o = this._n(c.createOscillator()), g = this._n(c.createGain());
      o.type = typ;
      o.frequency.setValueAtTime(f0, t);
      if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dauer);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(pegel, t + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dauer);
      o.connect(g); g.connect(this._effekte);
      o.start(t); o.stop(t + dauer + 0.03);
      this._aufraeumen(o, [o, g]);
    }

    /** Rauschstoß durch einen Filter, dessen Frequenz von f0 nach f1 läuft. */
    _stoss(dauer, pegel, filterTyp, f0, f1, q, versatz) {
      const c = this._ctx, t = c.currentTime + (versatz || 0);
      const s = this._n(c.createBufferSource()), fl = this._n(c.createBiquadFilter()), g = this._n(c.createGain());
      s.buffer = this._rausch;
      fl.type = filterTyp; fl.Q.value = q;
      fl.frequency.setValueAtTime(f0, t);
      if (f1 !== f0) fl.frequency.exponentialRampToValueAtTime(f1, t + dauer);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(pegel, t + 0.006);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dauer);
      s.connect(fl); fl.connect(g); g.connect(this._effekte);
      s.start(t, Math.random() * 1.5, dauer + 0.03);
      this._aufraeumen(s, [s, fl, g]);
    }

    // ---------- Effekte ----------
    /** n = 3, 2, 1: tiefer Piep; n = 0 ("LOS"): hoher, längerer Ton. */
    countdown(n) {
      if (!this._bereit()) return;
      if (n > 0) {
        this._ton(220, 220, 0.3, 'triangle', 0.45, 0);
        this._ton(110, 110, 0.3, 'sine', 0.3, 0);
      } else {
        this._ton(880, 880, 0.7, 'square', 0.16, 0);
        this._ton(1320, 1320, 0.7, 'triangle', 0.25, 0);
      }
    }

    /** Auto-Auto-Stoß, staerke in m/s. */
    kollision(staerke) {
      if (!this._bereit()) return;
      const t = this._ctx.currentTime;
      if (t - this._letzteKollision < 0.1) return;
      this._letzteKollision = t;
      const s = klemme((+staerke || 0) / 10, 0.12, 1);
      this._stoss(0.06 + 0.18 * s, 0.6 * s, 'lowpass', 2200, 250, 0.7, 0);
      this._ton(150, 45, 0.12 + 0.14 * s, 'sine', 0.9 * s, 0);
    }

    /** Kratzen an der Bande; staerke 0..1 optional. Wiederholt aufrufbar (begrenzt sich selbst). */
    bande(staerke) {
      if (!this._bereit()) return;
      const t = this._ctx.currentTime;
      if (t - this._letzteBande < 0.18) return;
      this._letzteBande = t;
      const s = klemme(staerke === undefined ? 0.6 : +staerke, 0.15, 1);
      this._stoss(0.22, 0.28 * s, 'bandpass', 1400, 2600, 1.5, 0);
      this._ton(220, 150, 0.15, 'sawtooth', 0.05 * s, 0);
    }

    runde() {
      if (!this._bereit()) return;
      this._ton(523.25, 523.25, 0.16, 'triangle', 0.4, 0);
      this._ton(783.99, 783.99, 0.3, 'triangle', 0.4, 0.13);
      this._ton(783.99, 783.99, 0.3, 'square', 0.06, 0.13);
    }

    /** Fanfare nach dem Zieleinlauf; Platz 1 = fröhlicher 4-Ton-Jingle. */
    ziel(platz) {
      if (!this._bereit()) return;
      let noten, versatz, dauer;
      if (platz === 1) { noten = [523.25, 659.25, 783.99, 1046.5]; versatz = [0, 0.14, 0.28, 0.42]; dauer = [0.18, 0.18, 0.18, 0.8]; }
      else if (platz === 2 || platz === 3) { noten = [392, 493.88, 587.33]; versatz = [0, 0.16, 0.32]; dauer = [0.2, 0.2, 0.55]; }
      else { noten = [349.23, 440]; versatz = [0, 0.2]; dauer = [0.22, 0.5]; }
      for (let i = 0; i < noten.length; i++) {
        this._ton(noten[i], noten[i], dauer[i], 'triangle', 0.4, versatz[i]);
        this._ton(noten[i] * 2, noten[i] * 2, dauer[i], 'square', 0.05, versatz[i]);
      }
    }

    /** Runde 4: Blech-Knirschen bei einem Schaden-Treffer; je höher die Stufe, desto tiefer und rauer. */
    schadenTreffer(stufe) {
      if (!this._bereit()) return;
      const st = klemme(+stufe || 0, 0, 5);
      this._stoss(0.16, 0.35, 'bandpass', 3200 - st * 350, 900, 4, 0);
      this._ton(420 - st * 45, 160 - st * 15, 0.14, 'square', 0.07 + st * 0.012, 0.01);
    }

    /** Runde 4: Auto liegengeblieben – Motor stottert ab (drei Puffer) + trauriges „Wah-wah“. */
    liegengeblieben() {
      if (!this._bereit()) return;
      for (let k = 0; k < 3; k++) this._stoss(0.09, 0.32 - k * 0.07, 'lowpass', 600, 180, 1, k * 0.16);
      this._ton(330, 250, 0.4, 'sawtooth', 0.09, 0.55);
      this._ton(250, 120, 0.8, 'sawtooth', 0.09, 0.95);
    }

    /** Runde 4: Abschleppwagen kommt – zweimal Hupe (zwei Töne) + kurzes Motorbrummen. */
    abschleppen() {
      if (!this._bereit()) return;
      [0, 0.32].forEach((t) => {
        this._ton(392, 392, 0.22, 'square', 0.08, t);
        this._ton(494, 494, 0.22, 'square', 0.06, t);
      });
      this._ton(70, 95, 0.9, 'sawtooth', 0.12, 0.7);
    }

    menueKlick() {
      if (!this._bereit()) return;
      this._ton(660, 990, 0.07, 'triangle', 0.3, 0);
    }

    /** Leises Quietschen bei starkem Bremsen; an = true/false, staerke 0..1 optional. */
    bremsen(an, staerke) {
      if (!this._bereit() || !this._quietsch) return;
      const ziel = an ? 0.03 * klemme(staerke === undefined ? 1 : +staerke, 0, 1) : 0;
      if (ziel === this._quietscht) return;
      this._quietscht = ziel;
      this._quietsch.gain.setTargetAtTime(ziel, this._ctx.currentTime, 0.05);
    }
  }

  // ---------- Runde 4: Wetter-Geräusche (Dauer-Schleifen, nur Zusatz – Motor unverändert) ----------
  /** Prassel-Puffer für Hagel: 2 s mit zufälligen kurzen Klicks (abklingendes Rauschen). */
  Ton.prototype._prasselPuffer = function () {
    if (this._prassel) return this._prassel;
    const c = this._ctx, len = Math.floor(c.sampleRate * 2), p = c.createBuffer(1, len, c.sampleRate), d = p.getChannelData(0);
    const klicks = 70, dauer = Math.floor(c.sampleRate * 0.012);
    for (let k = 0; k < klicks; k++) {
      const start = Math.floor(Math.random() * (len - dauer)), laut = 0.4 + Math.random() * 0.6;
      for (let i = 0; i < dauer; i++) d[start + i] += (Math.random() * 2 - 1) * laut * Math.exp(-i / (dauer * 0.18));
    }
    this._prassel = p;
    return p;
  };

  /**
   * Wetter-Geräusch an/aus. regen: helles, breites Rauschen; schnee: sehr leises, dumpfes Rauschen;
   * hagel: Prasseln (Klick-Schleife, Bandpass); wind: tiefes Rauschen, langsam moduliert (LFO auf Filter + Lautstärke).
   * staerke 0..1 skaliert die Lautstärke. Mehrfach-Aufrufe ändern nur die Lautstärke.
   */
  Ton.prototype.wetter = function (art, an, staerke) {
    if (!this._ctx || !this._effekte) return;
    const c = this._ctx, t = c.currentTime, s = klemme(staerke === undefined ? 1 : +staerke, 0, 1);
    const PEGEL = { regen: 0.16, schnee: 0.05, hagel: 0.22, wind: 0.2 };
    let w = this._wetterTon[art];
    if (!an) {
      if (!w) return;
      try { w.gain.gain.setTargetAtTime(0, t, 0.25); } catch (e) { /* egal */ }
      w.quellen.forEach(q => { try { q.stop(t + 1.2); } catch (e) { /* egal */ } });
      delete this._wetterTon[art];
      return;
    }
    if (!PEGEL[art]) return;
    if (!w) {
      const quelle = this._n(c.createBufferSource());
      quelle.buffer = art === 'hagel' ? this._prasselPuffer() : this._rausch;
      quelle.loop = true;
      const f = this._n(c.createBiquadFilter()), g = this._gain(0);
      const quellen = [quelle], nodes = [quelle, f, g];
      if (art === 'regen') { f.type = 'bandpass'; f.frequency.value = 2800; f.Q.value = 0.4; }
      else if (art === 'schnee') { f.type = 'lowpass'; f.frequency.value = 700; f.Q.value = 0.5; }
      else if (art === 'hagel') { f.type = 'bandpass'; f.frequency.value = 3200; f.Q.value = 1.2; }
      else { f.type = 'lowpass'; f.frequency.value = 380; f.Q.value = 2.5; }
      quelle.connect(f); f.connect(g);
      if (art === 'wind') {        // Böen: LFO 0,13 Hz auf Filterfrequenz und Lautstärke
        const lfo = this._n(c.createOscillator()), tief = this._gain(160), laut = this._gain(0.35), mod = this._gain(1);
        lfo.frequency.value = 0.13; lfo.connect(tief); tief.connect(f.frequency);
        g.connect(mod); mod.connect(this._effekte);
        lfo.connect(laut); laut.connect(mod.gain);
        lfo.start(t); quellen.push(lfo); nodes.push(lfo, tief, laut, mod);
      } else g.connect(this._effekte);
      quelle.start(t, Math.random() * 1.5);
      quelle.onended = () => { this._aktiv -= nodes.length; nodes.forEach(n => { try { n.disconnect(); } catch (e) { /* egal */ } }); };
      w = this._wetterTon[art] = { quellen, gain: g };
    }
    try { w.gain.gain.setTargetAtTime(PEGEL[art] * s, t, 0.6); } catch (e) { /* egal */ }
  };

  /** Alle Wetter-Geräusche ausblenden (Szene abbauen, Menü). */
  Ton.prototype.wetterAlleAus = function () {
    Object.keys(this._wetterTon || {}).forEach(art => this.wetter(art, false));
  };

  R.AudioKlasse = Ton;
  R.Audio = new Ton();
  R.Audio._horcherSetzen();
})();
