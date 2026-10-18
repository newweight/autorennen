// ============================================================
// Ton: alles synthetisch mit Web Audio (keine Dateien, läuft über file://).
//
// Rennspiel.Audio ist ein Singleton:
//   start()                       AudioContext anlegen/fortsetzen (nach erster Nutzer-Eingabe)
//   an / setzeAn(b) / schalten()  Ton ein/aus (localStorage 'rennspiel.ton')
//   setzeLautstaerke(0..1)
//   motorAnlegen(id, {spieler, auto}) / motorUpdate(id, {tempo, vMax, gas, untergrund, abstand, dt, drehzahl})
//        auto = Auto-Objekt (mit .id) oder id-String → Klangprofil aus src/audio/motorProfile.js (Zylinder, Drehzahlbereich, Gänge,
//        Diesel-Nageln, Boxer-Sägen, Turbo, Knallen …); ohne auto → Passat-Profil. Zündfrequenz = Drehzahl/60 × Zylinder/2.
//   offlineStarten(OfflineAudioContext)   Test: Motor in einen OfflineAudioContext rendern (Zeit setzt der Test über _zeitTest)
//   motorEntfernen(id) / motorAlleEntfernen() / motorStumm(bool)
//   countdown(n) kollision(staerke) bande() runde() ziel(platz) menueKlick() bremsen(an)
//   schadenTreffer(stufe) liegengeblieben() abschleppen()   (Runde 4, Schaden-System)
//   wetter('regen'|'hagel'|'schnee'|'wind', an, staerke 0..1) / wetterAlleAus()   (Runde 4, Dauer-Geräusche)
//   sirene(an, laut 0..1) / polizeiStopp()   (Runde 5b, Polizei: Dauer-Sirene „Tatü-tata" + Signal beim Anhalten)
//   dinoBruellen(laut, art) grollen(dauer) pfeifen(dauer, laut) einschlag(laut) flugsaurierSchrei(laut) baerBrummen(laut)  (Runde 6, W2-C)  rehRuf(laut) (W2-C2)
//   statistik()                   Zähler (aktive Nodes usw.) für Tests
//
// Aufbau: Motor-Stimmen (Zündimpuls-Oszillatoren, halbe Ordnung, Nagel-Rauschen, Turbo → Formant + Tiefpass) liegen in einem festen
// Pool von höchstens 4 Slots (2 Spieler + 2 KI, config.sound.motor.maxKi). Oszillatoren laufen dauerhaft und
// werden nur umgestimmt – pro Frame entstehen keine neuen Nodes. Kurze Effekte
// erzeugen Nodes, die sich nach dem Ende selbst abbauen.
// Fehlt der AudioContext oder ist er "suspended", tut jede Methode einfach nichts.
// ============================================================
(function () {
  const R = window.Rennspiel = window.Rennspiel || {};

  const K = {
    speicher: 'rennspiel.ton',
    lautstaerke: 0.7,
    maxKi: 2,              // so viele KI-Motoren gleichzeitig hörbar (14.10.: 3 → 2, jeder Motor hat jetzt mehr Nodes; config.sound.motor.maxKi)
    maxStimmen: 4,         // 2 Spieler + 2 KI
    hoerweite: 60,         // m: weiter entfernte KI-Autos sind stumm (Slot frei, kein Update); config.sound.motor.hoerweite
    tauschPuffer: 5,       // m: ein näheres KI-Auto verdrängt erst ab so viel Vorsprung
  };
  const klemme = (x, lo, hi) => (x < lo ? lo : (x > hi ? hi : x));
  /** Notprofil, falls motorProfile.js fehlt. */
  const NOTPROFIL = {
    id: 'standard', zyl: 4, leerlauf: 800, rpmMax: 4600, rpmVmax: 3700, startRpm: 2000, hoch: 2200, hochVoll: 3900, runter: 1300,
    gaenge: [3.9, 2.9, 2.1, 1.5, 1.1, 0.8, 0.62], schaltZeit: 0.16, steigK: 9, fallK: 6,
    wave: { slope: 1.15, odd: 1, bump: [4, 2.5, 1.0] }, halb: 0.4, beat: 0.004, wobble: 7, klopf: 0.5, klopfHz: 1700, klopfQ: 0.9, klopfDuty: 0.12,
    formant: { hz: 380, db: 4, q: 1 }, cut0: 520, cut1: 900, cutGas: 500, turbo: 0, knallen: 0, pegel: 1,
    lp: [350, 1800], res: 1.5, sub: 0.5, ansaug: 0.4, det: 0.0035,
  };
  /** Drehzahl im Gang g (0-basiert); ohne Closure/Allokation (läuft je Frame und Auto). */
  function rpmGang(p, g, tempo, vMax) {
    const n = p.gaenge.length;
    return p.rpmVmax * Math.min(1.25, tempo / vMax) * p.gaenge[g] / p.gaenge[n - 1];
  }
  /** Ist der neue Wert merklich anders (> abs bzw. 0,5 %)? */
  function anders(a, b, abs) { return Math.abs(a - b) > Math.max(abs, Math.abs(b) * 0.005); }

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
      this._zeitTest = null; this._offline = false; this._wellen = null;
    }

    // ---------- Zustand ----------
    get an() { return this._an; }
    set an(b) { this.setzeAn(b); }

    /** Läuft der AudioContext und ist der Ton an? */
    _bereit() { return !!this._ctx && (this._ctx.state === 'running' || this._offline) && this._an; }

    /** Aktuelle Audiozeit (Test: _zeitTest überschreibt, damit ein OfflineAudioContext Frame für Frame „gespielt“ werden kann). */
    _jetzt() { return this._zeitTest !== null && this._zeitTest !== undefined ? this._zeitTest : this._ctx.currentTime; }

    /** Test: statt Echtzeit-AudioContext einen OfflineAudioContext benutzen (Motor-Rendering ohne Lautsprecher). */
    offlineStarten(ctx) {
      this._ctx = ctx; this._offline = true; this._zeitTest = 0;
      this._aufbauen();
      return true;
    }

    /** Hörweite der KI-Motoren (m). */
    _hoerweite() {
      const s = R.config && R.config.sound && R.config.sound.motor;
      return s && s.hoerweite > 0 ? s.hoerweite : K.hoerweite;
    }

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
      return { gang: v.gang + 1, rpm: v.rpm, rpmZiel: v.rpmZiel, grundton: v.grundton, hatSlot: !!v.slot, abstand: v.abstand, spieler: v.spieler,
        profil: v.profil.id, zylinder: v.profil.zyl, gaenge: v.profil.gaenge.length, boost: v.boost };
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
      const profil = this._profilFuer(opt && opt.auto);
      if (!v) {
        v = {
          id, spieler, gang: 0, profil, rpm: profil.leerlauf, rpmZiel: profil.leerlauf, grundton: profil.leerlauf / 60 * profil.zyl / 2,
          dip: 0, blip: 0, sperre: 0, gasG: 0, schubG: 0, volllast: 0, boost: 0, letztesKnallen: -9,
          abstand: 0, slot: null, zeit: 0, neu: true, ug: '',
          la: -1, ls: 0, lsg: -1, lf: 0, lc: 0, ll: -1, lr: -1, lk: -1, lt: -1, ltf: 0,     // zuletzt geplante Werte (Frequenz, Filter, Lautstärke, Rauschen, Nageln, Turbo)
          stimmung: 1,
        };
        this._stimmen.set(id, v);
      } else {
        if (v.profil !== profil) { v.profil = profil; v.gang = 0; v.rpm = v.rpmZiel = profil.leerlauf; }
        if (v.spieler !== spieler) {
          if (v.slot) this._slotLoesen(v);
          v.spieler = spieler;
        }
      }
      // Spieler exakt gestimmt (Zündfrequenz = Formel); KI leicht gegeneinander verstimmt, damit mehrere gleiche Autos nicht verschmelzen
      v.stimmung = spieler ? 1 : 1 + ((this._zaehler++ % 5) - 2) * 0.012;
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

    // ---------- Motor (14.10. (v21): Klang je Auto, siehe src/audio/motorProfile.js) ----------
    /** Profil zu einem Auto holen (Fallback ohne motorProfile.js: schlichtes Diesel-4-Zylinder-Profil). */
    _profilFuer(auto) {
      if (R.MotorProfile) return R.MotorProfile.fuer(auto);
      return NOTPROFIL;
    }

    /** PeriodicWave (Zündimpuls-Obertöne) je Profil, einmal je AudioContext. */
    _welle(p) {
      const c = this._ctx;
      this._wellen = this._wellen || {};
      let w = this._wellen[p.id];
      if (w) return w;
      const N = 48, re = new Float32Array(N + 1), im = new Float32Array(N + 1), s = p.wave;
      for (let h = 1; h <= N; h++) {
        let a = Math.pow(h, -s.slope) * ((h & 1) ? 1 : 1 / Math.max(0.2, s.odd));
        if (s.bump) a *= 1 + s.bump[2] * Math.exp(-Math.pow((h - s.bump[0]) / s.bump[1], 2));
        im[h] = a;
      }
      w = { ton: c.createPeriodicWave(re, im), puls: null, eck: null, drei: null };
      // v30 (G2): zweite Stimme = weiches Rechteck (nur ungerade Teiltöne, 1/h^1,3), Oktave darunter = Dreieck (ungerade, 1/h²) → Sägezahn + Rechteck + Dreieck gemischt
      const er = new Float32Array(N + 1), ei = new Float32Array(N + 1), dr = new Float32Array(N + 1), di = new Float32Array(N + 1);
      for (let h = 1; h <= N; h += 2) { ei[h] = Math.pow(h, -1.3); di[h] = Math.pow(h, -2) * (((h - 1) / 2) % 2 ? -1 : 1); }
      w.eck = c.createPeriodicWave(er, ei); w.drei = c.createPeriodicWave(dr, di);
      // Nagel-Puls: schmaler Rechteckpuls (Breite klopfDuty), Cosinus-Reihe
      const pr = new Float32Array(N + 1), pi = new Float32Array(N + 1), dty = Math.max(0.03, Math.min(0.5, p.klopfDuty || 0.15));
      for (let h = 1; h <= N; h++) pr[h] = Math.sin(Math.PI * h * dty) / (Math.PI * h);
      w.puls = c.createPeriodicWave(pr, pi);
      this._wellen[p.id] = w;
      return w;
    }

    /** Zweig der Slot-Kette ein-/ausschalten (nicht angeschlossene Nodes rechnet der Browser nicht → spart CPU). */
    _zweig(k, name, von, nach, an) {
      if (k.zw[name] === an) return;
      k.zw[name] = an;
      try { if (an) von.connect(nach); else von.disconnect(nach); } catch (e) { /* egal */ }
    }

    /** Ein Slot = fertige Motor-Signalkette, die dauerhaft läuft (nur Umstimmen, keine neuen Nodes im Betrieb). */
    _slotBauen() {
      const c = this._ctx;
      const k = {
        out: this._gain(0), filter: this._n(c.createBiquadFilter()), formant: this._n(c.createBiquadFilter()),
        oscA: this._n(c.createOscillator()), oscB: this._n(c.createOscillator()), oscH: this._n(c.createOscillator()),
        gA: this._gain(0.5), gB: this._gain(0.2), gH: this._gain(0.2),
        filter2: this._n(c.createBiquadFilter()),                                          // v30: zweiter Tiefpass (24 dB/Okt. zusammen)
        oscS: this._n(c.createOscillator()), gS: this._gain(0),                            // v30: Sub/Rumpel 40–90 Hz
        ans: this._n(c.createBufferSource()), ansF: this._n(c.createBiquadFilter()), ansG: this._gain(0),   // v30: Ansaugrauschen bei Last
        nz: this._n(c.createBufferSource()), nzBP: this._n(c.createBiquadFilter()), nzAM: this._gain(0),
        oscK: this._n(c.createOscillator()), kTiefe: this._gain(0),
        turb: this._n(c.createOscillator()), turbG: this._gain(0),
        rausch: this._n(c.createBufferSource()), rFilter: this._n(c.createBiquadFilter()), rGain: this._gain(0),
      };
      k.filter.type = 'lowpass'; k.filter.frequency.value = 400; k.filter.Q.value = 0.9;
      k.formant.type = 'peaking'; k.formant.frequency.value = 600; k.formant.Q.value = 1; k.formant.gain.value = 0;
      k.oscA.frequency.value = 60; k.oscB.frequency.value = 60; k.oscH.frequency.value = 30; k.oscS.type = 'sine'; k.oscS.frequency.value = 45;
      k.filter2.type = 'lowpass'; k.filter2.frequency.value = 400; k.filter2.Q.value = 0.55;
      k.oscA.connect(k.gA); k.oscB.connect(k.gB); k.oscH.connect(k.gH);
      k.gA.connect(k.formant); k.gB.connect(k.formant); k.gH.connect(k.formant); k.oscS.connect(k.gS); k.gS.connect(k.formant);
      k.formant.connect(k.filter); k.filter.connect(k.filter2); k.filter2.connect(k.out); k.out.connect(this._motorBus);
      k.ans.buffer = this._rausch; k.ans.loop = true; k.ansF.type = 'lowpass'; k.ansF.frequency.value = 700; k.ansF.Q.value = 0.5;
      k.ans.connect(k.ansF); k.ansF.connect(k.ansG); k.ansG.connect(k.out);
      // Nageln/Ticken: Rauschen, vom Puls (Zündfrequenz) zerhackt
      k.nz.buffer = this._rausch; k.nz.loop = true;
      k.nzBP.type = 'bandpass'; k.nzBP.frequency.value = 1700; k.nzBP.Q.value = 0.9;
      k.nzLP = this._n(c.createBiquadFilter()); k.nzLP.type = 'lowpass'; k.nzLP.frequency.value = 3000; k.nzLP.Q.value = 0.6;     // v30: Nageln ohne Zischen > 4 kHz
      k.nz.connect(k.nzBP); k.nzBP.connect(k.nzLP); k.nzLP.connect(k.nzAM); k.nzAM.connect(k.out);
      k.oscK.frequency.value = 60; k.oscK.connect(k.kTiefe); k.kTiefe.connect(k.nzAM.gain);
      // Turbo-Pfeifen
      k.turb.type = 'sine'; k.turb.frequency.value = 3000; k.turb.connect(k.turbG); k.turbG.connect(k.out);
      // Rauschen auf Gras/Sand
      k.rausch.buffer = this._rausch; k.rausch.loop = true;
      k.rFilter.type = 'bandpass'; k.rFilter.Q.value = 0.8; k.rFilter.frequency.value = 700;
      k.rausch.connect(k.rFilter); k.rFilter.connect(k.rGain); k.rGain.connect(k.out);
      const z = Math.random() * 1.5;
      k.oscA.start(); k.oscB.start(); k.oscH.start(); k.oscK.start(); k.turb.start(); k.oscS.start();
      k.nz.start(0, z); k.rausch.start(0, z + 0.4); k.ans.start(0, z + 0.8);
      k.zw = { nz: true, turb: true, gB: true, gH: true, gS: true, ans: true, rausch: true, bus: true };    // alle Zweige beim Bauen angeschlossen
      k.rZaehl = 0; k.zeitFrei = 0;
      return { k, besitzer: null, profil: null };
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
      if (!v.spieler && this._kiAktiv >= this._maxKi()) {
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
      slot.k.zeitFrei++;                                  // laufende Abbau-Timer des Slots ungültig machen
      this._zweig(slot.k, 'bus', slot.k.out, this._motorBus, true);
      if (!v.spieler) this._kiAktiv++;
      return true;
    }

    /** Höchstzahl hörbarer KI-Motoren (config.sound.motor.maxKi, Standard K.maxKi). */
    _maxKi() {
      const s = R.config && R.config.sound && R.config.sound.motor;
      return s && s.maxKi >= 0 ? s.maxKi : K.maxKi;
    }

    _slotLoesen(v) {
      const s = v.slot; if (!s) return;
      if (!v.spieler) this._kiAktiv--;
      s.besitzer = null; v.slot = null;
      if (this._ctx) {
        const t = this._jetzt();
        try { s.k.out.gain.setTargetAtTime(0, t, 0.03); s.k.rGain.gain.setTargetAtTime(0, t, 0.03); } catch (e) { /* egal */ }
        // freier Slot: nach dem Ausblenden vom Bus trennen, damit er keine CPU braucht
        if (typeof setTimeout === 'function' && !this._offline) {
          const k = s.k, nr = ++k.zeitFrei;
          setTimeout(() => { if (!s.besitzer && k.zeitFrei === nr) this._zweig(k, 'bus', k.out, this._motorBus, false); }, 400);
        }
      }
    }

    /**
     * Pro Frame aufrufen. d = { tempo (m/s), vMax (m/s), gas 0..1, untergrund, abstand (m, nur KI), dt (s, optional),
     *                           drehzahl (U/min, optional: überschreibt die berechnete Drehzahl, z. B. für Tests) }
     * Das Objekt d darf wiederverwendet werden.
     */
    motorUpdate(id, d) {
      const v = this._stimmen.get(id);
      if (!v || !d || !this._bereit()) return;
      v.abstand = v.spieler ? 0 : (d.abstand > 0 ? d.abstand : 0);
      if (!v.spieler && v.abstand >= this._hoerweite()) { if (v.slot) this._slotLoesen(v); return; }
      if (!v.slot && !this._slotNehmen(v)) return;
      const k = v.slot.k, c = this._ctx, t = this._jetzt();
      const p = v.profil, sl = v.slot;

      let dt = d.dt > 0 ? d.dt : t - v.zeit;
      v.zeit = t;
      dt = klemme(dt, 0.001, 0.1);

      // --- Profil im Slot einstellen (nur bei Wechsel des Profils) ---
      // v30 (G2): Spieler = volle Stimmen (Säge + Rechteck + Oktave darunter als Dreieck + Sub + Ansaugrauschen); KI = vereinfacht
      // (nur Säge + Oktave darunter = 2 Tonoszillatoren, kein Sub/Ansaugen/Rechteck) – spart Stimmen auf schwachen Geräten.
      const modus = v.spieler ? 1 : 0;
      if (sl.profil !== p || sl.modus !== modus) {
        sl.profil = p; sl.modus = modus;
        const w = this._welle(p);
        k.oscA.setPeriodicWave(w.ton); k.oscB.setPeriodicWave(w.eck); k.oscH.setPeriodicWave(w.drei); k.oscK.setPeriodicWave(w.puls);
        k.gA.gain.value = 0.5 * (p.saege || 1); k.gB.gain.value = 0.30; k.gH.gain.value = 0.5 * p.halb;
        k.gS.gain.value = 0;
        k.filter.Q.value = p.res || 1.5;
        this._zweig(k, 'gB', k.gB, k.formant, modus === 1 && (p.det || p.beat) > 0);
        this._zweig(k, 'gH', k.gH, k.formant, p.halb >= 0.05);
        this._zweig(k, 'gS', k.gS, k.formant, modus === 1 && p.sub > 0);
        this._zweig(k, 'ans', k.ansG, k.out, modus === 1 && p.ansaug > 0);
        this._zweig(k, 'nz', k.nzAM, k.out, p.klopf >= 0.1);
        k.zw.turbCfg = null;
        k.nzBP.frequency.value = p.klopfHz; k.nzBP.Q.value = p.klopfQ;
        k.formant.frequency.value = p.formant.hz; k.formant.Q.value = p.formant.q; k.formant.gain.value = p.formant.db;
        k.out.gain.cancelScheduledValues(t); k.out.gain.setValueAtTime(0, t);
        v.neu = true;
      }

      // --- Gas, Schub, Gang und Drehzahl ---
      const vMax = d.vMax > 1 ? d.vMax : 40;
      const tempo = d.tempo > 0 ? d.tempo : 0;
      const gas = klemme(+d.gas || 0, 0, 1);
      v.gasG += (gas - v.gasG) * Math.min(1, dt * 5);
      const n = p.gaenge.length;
      let g = v.gang;
      v.sperre -= dt;
      if (tempo < 0.8 && gas < 0.3) g = 0;
      else if (v.sperre <= 0) {
        const hoch = p.hoch + (p.hochVoll - p.hoch) * v.gasG;
        if (g < n - 1 && rpmGang(p, g, tempo, vMax) > hoch) g++;
        else if (g > 0 && rpmGang(p, g, tempo, vMax) < p.runter) g--;
      }
      if (g !== v.gang) {
        v.sperre = p.schaltZeit + 0.35;
        if (g > v.gang) v.dip = p.schaltZeit; else v.blip = 0.1;     // Hochschalten: kurz Zugkraft weg · Runterschalten: Zwischengas
        v.gang = g;
      }
      const rpmG = rpmGang(p, g, tempo, vMax);
      let ziel = rpmG;
      if (g === 0 || rpmG < p.startRpm) {      // Anfahren: Kupplung schleift, Drehzahl folgt dem Gas
        const schl = p.leerlauf + (p.startRpm - p.leerlauf) * gas * (g === 0 ? 1 : 0.4);
        if (schl > ziel) ziel = schl;
      }
      if (ziel < p.leerlauf) ziel = p.leerlauf;
      if (v.blip > 0) { v.blip -= dt; ziel += (p.rpmMax - ziel) * 0.12; }
      if (ziel > p.rpmMax * 0.995) ziel = p.rpmMax * 0.995;
      v.rpmZiel = ziel;
      if (d.drehzahl > 0) { v.rpm = ziel = v.rpmZiel = d.drehzahl; }
      else v.rpm += (ziel - v.rpm) * Math.min(1, dt * (ziel > v.rpm ? p.steigK : p.fallK));
      const rpm = v.rpm;
      const rpmN = klemme((rpm - p.leerlauf) / (p.rpmMax - p.leerlauf), 0, 1);
      let dipF = 1;
      if (v.dip > 0) { v.dip -= dt; dipF = 0.5; }
      const schub = gas < 0.1 && tempo > 3 ? 1 : 0;          // Gas weg, Auto rollt: Motor bremst, leiser und dumpfer
      v.schubG += (schub - v.schubG) * Math.min(1, dt * 8);

      // --- Gas-Weg-Ereignisse: Knallen (911, AMG, …) und Turbo-Ablassen ---
      if (gas > 0.6) v.volllast += dt;
      else if (gas < 0.12) {
        if (v.volllast > 0.5 && rpmN > 0.4 && tempo > 8 && v.spieler) this._gasWeg(p, v, rpmN, t);
        v.volllast = 0;
      }

      // --- Pegel (KI: nach Entfernung leiser und dumpfer) ---
      const sound = R.config && R.config.sound && R.config.sound.motor;
      let pegel = (sound && sound.lautstaerke > 0 ? sound.lautstaerke : 1) * p.pegel, dumpf = 1;
      if (v.spieler) { if (this._spielerStimmen > 1) pegel *= 0.75; }
      else { const nah = 1 - v.abstand / this._hoerweite(); pegel *= nah * nah * 0.5; dumpf = 0.5 + 0.5 * nah; }

      // --- Klangwerte ---
      // Zündfrequenz; dazu leichtes Tonhöhen-Zittern (wobble in Cent, zwei langsame Schwingungen) – im JS gerechnet, nicht als
      // Audio-Rate-Modulation (die macht jeden Oszillator mehrfach teurer)
      let rpmT = rpm;      // v30b: weicher Pitch-Kompressor oberhalb 60 % Drehzahl (nur Ton; Drehzahl selbst unverändert)
      if (p.tonK > 0) { const r0 = p.leerlauf + 0.6 * (p.rpmMax - p.leerlauf); if (rpm > r0) rpmT = r0 + (rpm - r0) * p.tonK; }
      v.grundton = rpmT / 60 * p.zyl / 2 * v.stimmung;
      const f = v.grundton * (1 + p.wobble * 0.000578 * (0.6 * Math.sin(6.2832 * 4.3 * t + v.stimmung * 40) + 0.4 * Math.sin(6.2832 * 9.1 * t)));
      const last = 0.35 + 0.65 * v.gasG;
      // v30: Tiefpass läuft mit Drehzahl und Gas mit (Leerlauf lp[0] → Vollgas lp[1]); zwei Biquads hintereinander
      const lp = p.lp || NOTPROFIL.lp;
      const cutoff = (lp[0] + (lp[1] - lp[0]) * (0.7 * rpmN + 0.3 * v.gasG)) * dumpf * (1 - 0.3 * v.schubG);
      const det = p.det || p.beat;
      // Sub/Rumpel: Oktave(n) unter dem Grundton, immer ein ganzzahliges Vielfaches von f/2 (bleibt harmonisch), gefaltet in 40–80 Hz;
      // Fenster = 0 an den Oktavgrenzen → der Sprung beim Falten ist lautlos. Ab f/2 ≥ 80 Hz gibt es keinen Sub (dort trägt die Oktave darunter).
      let subHz = v.ls > 0 ? v.ls : 60, subW = 0;
      if (modus === 1 && p.sub > 0 && f * 0.5 < 80) {
        let x = f * 0.5; while (x < 40) x *= 2;
        subHz = x; subW = Math.min(1, 2.5 * Math.sin(Math.PI * Math.log2(x / 40)));
      }
      const subG = 0.5 * (p.sub || 0) * subW;
      const ansG = v.spieler ? (p.ansaug || 0) * 0.05 * v.gasG * (0.3 + 0.7 * rpmN) * pegel : 0;
      // v30: Pegelkurve je Motor (Faktoren bei rpmN 0 / 0,18 / 0,44 / 0,87, dazwischen linear) gleicht den neuen Klang auf den RMS von v29 an (±1 dB)
      let leerK = 1;
      const kv = p.kurve;
      if (kv) {
        if (rpmN <= 0.18) leerK = kv[0] + (kv[1] - kv[0]) * (rpmN / 0.18);
        else if (rpmN <= 0.44) leerK = kv[1] + (kv[2] - kv[1]) * ((rpmN - 0.18) / 0.26);
        else if (rpmN <= 0.87) leerK = kv[2] + (kv[3] - kv[2]) * ((rpmN - 0.44) / 0.43);
        else leerK = kv[3];
      }
      const laut = (0.10 + 0.40 * last * (0.4 + 0.6 * rpmN) + 0.10 * rpmN) * dipF * pegel * leerK * (1 - 0.5 * v.schubG);
      const klopf = p.klopf * (0.25 + 0.75 * last) * (1 - 0.6 * v.schubG) * (v.spieler ? 1 : 0.7) * laut * 1.4;
      // Turbo: Ladedruck baut sich mit Verzögerung auf
      let turboG = 0, turboF = 3000;
      const turboAn = !(sound && sound.turbo === false);
      this._zweig(k, 'turb', k.turbG, k.out, p.turbo > 0 && turboAn);
      if (p.turbo > 0 && turboAn) {
        const bz = klemme(v.gasG * (rpmN * 1.4 - 0.15), 0, 1);
        v.boost += (bz - v.boost) * Math.min(1, dt * (bz > v.boost ? 2.2 : 5));
        turboG = p.turbo * 0.032 * v.boost * pegel * (v.spieler ? 1 : 0.5);
        turboF = 1500 + 1500 * v.boost + 900 * rpmN;      // v30: Pfeifen tiefer (vorher 2300–6700 Hz) und leiser → weniger schrill
      }

      // --- Rauschen auf Gras/Sand ---
      const ug = d.untergrund;
      let rausch = 0;
      if (ug === 'gras') rausch = 0.10; else if (ug === 'sand') rausch = 0.13; else if (ug === 'rand') rausch = 0.03;
      rausch *= Math.min(1, tempo / 12) * Math.min(1, pegel);
      if (rausch > 0.0005) { k.rZaehl = 0; this._zweig(k, 'rausch', k.rGain, k.out, true); }
      else if (k.zw.rausch && (k.rZaehl += dt) > 1) this._zweig(k, 'rausch', k.rGain, k.out, false);

      // Nur neu planen, wenn sich ein Wert merklich ändert (> 0,5 % bzw. kleiner Absolutwert):
      // spart AudioParam-Ereignisse – im Leerlauf/bei Vollgas fast keine Aufrufe je Frame.
      if (v.neu) {
        // frisch zugeteilt: Frequenzen sofort setzen (Pegel blendet weich ein)
        const fb = f * (1 + det);
        k.oscA.frequency.cancelScheduledValues(t); k.oscA.frequency.setValueAtTime(f, t);
        k.oscB.frequency.cancelScheduledValues(t); k.oscB.frequency.setValueAtTime(fb, t);
        k.oscH.frequency.cancelScheduledValues(t); k.oscH.frequency.setValueAtTime(f * 0.5, t);
        k.oscK.frequency.cancelScheduledValues(t); k.oscK.frequency.setValueAtTime(f, t);
        k.filter.frequency.cancelScheduledValues(t); k.filter.frequency.setValueAtTime(cutoff, t);
        k.filter2.frequency.cancelScheduledValues(t); k.filter2.frequency.setValueAtTime(cutoff, t);
        k.oscS.frequency.cancelScheduledValues(t); k.oscS.frequency.setValueAtTime(subHz, t); v.ls = subHz;
        k.turb.frequency.cancelScheduledValues(t); k.turb.frequency.setValueAtTime(turboF, t);
        v.lf = f; v.lc = cutoff; v.ll = -1; v.la = -1; v.lsg = -1; v.lr = -1; v.lk = -1; v.lt = -1; v.ltf = turboF;
        v.neu = false;
      } else {
        if (anders(f, v.lf, 0.3)) {
          v.lf = f;
          k.oscA.frequency.setTargetAtTime(f, t, 0.03); k.oscB.frequency.setTargetAtTime(f * (1 + det), t, 0.03);
          k.oscH.frequency.setTargetAtTime(f * 0.5, t, 0.03); k.oscK.frequency.setTargetAtTime(f, t, 0.03);
        }
        if (anders(cutoff, v.lc, 2)) { v.lc = cutoff; k.filter.frequency.setTargetAtTime(cutoff, t, 0.04); k.filter2.frequency.setTargetAtTime(cutoff, t, 0.04); }
        if (subW > 0 && anders(subHz, v.ls, 0.3)) { v.ls = subHz; k.oscS.frequency.setTargetAtTime(subHz, t, 0.02); }
        if (turboG > 0 && anders(turboF, v.ltf, 20)) { v.ltf = turboF; k.turb.frequency.setTargetAtTime(turboF, t, 0.05); }
      }
      if (anders(laut, v.ll, 0.002)) { v.ll = laut; k.out.gain.setTargetAtTime(laut, t, 0.04); }
      if (anders(klopf, v.lk, 0.002)) { v.lk = klopf; k.kTiefe.gain.setTargetAtTime(klopf, t, 0.03); }
      if (anders(subG, v.lsg, 0.001)) { v.lsg = subG; k.gS.gain.setTargetAtTime(subG, t, 0.03); }
      if (anders(ansG, v.la, 0.0004)) { v.la = ansG; k.ansG.gain.setTargetAtTime(ansG, t, 0.08); }
      if (anders(turboG, v.lt, 0.0005)) { v.lt = turboG; k.turbG.gain.setTargetAtTime(turboG, t, 0.06); }
      if (anders(rausch, v.lr, 0.002)) { v.lr = rausch; k.rGain.gain.setTargetAtTime(rausch, t, 0.08); }
      if (ug !== v.ug) {
        v.ug = ug;
        k.rFilter.frequency.setTargetAtTime(ug === 'sand' ? 1100 : 650, t, 0.05);
      }
    }

    /** Gas weg nach Volllast: dezentes Knallen/Blubbern (profilabhängig) und Ablassen des Turbos („Pssht“). */
    _gasWeg(p, v, rpmN, t) {
      const sound = R.config && R.config.sound && R.config.sound.motor;
      if (t - (v.letztesKnallen || -9) < 1.2) return;
      v.letztesKnallen = t;
      if (p.knallen > 0 && !(sound && sound.knallen === false)) {
        const anz = 2 + (Math.random() < 0.5 ? 1 : 0);
        let off = 0.05;
        for (let i = 0; i < anz; i++) {
          this._stoss(0.06, 0.20 * p.knallen * (0.6 + 0.4 * rpmN), 'lowpass', 1500, 280, 1.2, off);
          this._ton(110, 58, 0.08, 'sine', 0.16 * p.knallen, off);
          off += 0.07 + Math.random() * 0.09;
        }
      }
      if (p.turbo > 0.3 && v.boost > 0.5 && !(sound && sound.turbo === false)) {
        this._stoss(0.28, 0.06 * p.turbo, 'bandpass', 3800, 1900, 1.0, 0.04);
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
      const c = this._ctx, t = this._jetzt() + (versatz || 0);
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
      const c = this._ctx, t = this._jetzt() + (versatz || 0);
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

    /** Runde 7: leises Pling je 10 % Reparatur (steigende Tonhöhe); ab der Losfahr-Schwelle heller (zwei Töne). */
    reparaturTon(prozent, ab) {
      if (!this._bereit()) return;
      const f = 440 * Math.pow(2, klemme(+prozent || 0, 0, 100) / 100);   // 440 → 880 Hz
      this._ton(f, f, 0.12, 'triangle', 0.12, 0);
      if (prozent >= ab) this._ton(f * 1.5, f * 1.5, 0.16, 'triangle', 0.08, 0.06);
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

  // ---------- Runde 5b: Polizei-Sirene (Dauer-Schleife, nur Zusatz) ----------
  /**
   * Sirene an/aus. Zwei Töne im Wechsel (≈ 466/622 Hz, je 0,6 s – „Tatü-tata"): Dreieck + leises Rechteck, die Frequenz
   * steuert ein Rechteck-LFO (0,83 Hz). laut 0..1 = Lautstärke (Abstand); Mehrfach-Aufrufe ändern nur die Lautstärke.
   */
  Ton.prototype.sirene = function (an, laut) {
    if (!this._ctx || !this._effekte) { this._sireneAn = false; return; }
    const c = this._ctx, t = c.currentTime, s = klemme(laut === undefined ? 1 : +laut, 0, 1);
    let w = this._sirene;
    if (!an || !(s > 0)) {
      if (!w) return;
      try { w.gain.gain.setTargetAtTime(0, t, 0.08); } catch (e) { /* egal */ }
      w.quellen.forEach(q => { try { q.stop(t + 0.6); } catch (e) { /* egal */ } });
      this._sirene = null;
      return;
    }
    if (!w) {
      const o1 = this._n(c.createOscillator()), o2 = this._n(c.createOscillator()), lfo = this._n(c.createOscillator());
      const hub = this._gain(78), g2 = this._gain(0.25), g = this._gain(0);
      o1.type = 'triangle'; o2.type = 'square';
      o1.frequency.value = 544; o2.frequency.value = 544;
      lfo.type = 'square'; lfo.frequency.value = 0.83;
      lfo.connect(hub); hub.connect(o1.frequency); hub.connect(o2.frequency);
      o1.connect(g); o2.connect(g2); g2.connect(g); g.connect(this._effekte);
      const quellen = [o1, o2, lfo], nodes = [o1, o2, lfo, hub, g2, g];
      quellen.forEach(q => q.start(t));
      o1.onended = () => { this._aktiv -= nodes.length; nodes.forEach(n => { try { n.disconnect(); } catch (e) { /* egal */ } }); };
      w = this._sirene = { quellen, gain: g };
    }
    if (w._laut === undefined || Math.abs(w._laut - s) > 0.02) {
      w._laut = s;
      try { w.gain.gain.setTargetAtTime(0.13 * s, t, 0.15); } catch (e) { /* egal */ }
    }
  };

  /** Runde 5b: Signal beim Anhalten (kurzes „Wuup-wuup" + Hupe). */
  Ton.prototype.polizeiStopp = function () {
    if (!this._bereit()) return;
    this._ton(500, 1100, 0.32, 'sawtooth', 0.08, 0);
    this._ton(500, 1100, 0.32, 'sawtooth', 0.08, 0.36);
    this._ton(370, 370, 0.25, 'square', 0.07, 0.8);
  };

  // ---------- Runde 6 (W2-C): Dino-Welt + Wald – laut 0..1 (Abstand zum Spieler, main.js) ----------
  const laut01 = (l) => klemme(l === undefined ? 1 : +l, 0, 1);
  /** Dino brüllt: tiefes, raues Grollen mit Rauschen (Langhals noch tiefer). */
  Ton.prototype.dinoBruellen = function (laut, art) {
    if (!this._bereit()) return;
    const l = laut01(laut), f = art === 'langhals' ? 0.7 : 1;
    this._ton(150 * f, 62 * f, 1.15, 'sawtooth', 0.16 * l, 0);
    this._ton(105 * f, 55 * f, 1.0, 'square', 0.07 * l, 0.05);
    this._stoss(1.05, 0.38 * l, 'lowpass', 900, 160, 2, 0);
  };
  /** Vulkan grollt (dauer s): tiefes Rumpeln mit Wellen. */
  Ton.prototype.grollen = function (dauer) {
    if (!this._bereit()) return;
    const d = Math.max(0.5, +dauer || 3);
    this._stoss(d, 0.55, 'lowpass', 180, 70, 1, 0);
    this._ton(48, 32, d, 'sine', 0.5, 0);
    for (let k = 0; k < 3; k++) this._stoss(0.6, 0.35, 'lowpass', 260, 90, 1.5, k * d / 3);
  };
  /** Pfeifen (fallende Bombe/Meteor): hoch → tief über dauer s. */
  Ton.prototype.pfeifen = function (dauer, laut) {
    if (!this._bereit()) return;
    const d = Math.max(0.3, +dauer || 2), l = laut01(laut);
    this._ton(1900, 420, d, 'sine', 0.11 * l, 0);
    this._ton(1950, 450, d, 'triangle', 0.04 * l, 0);
  };
  /** Einschlag: dumpfer Knall mit Nachrollen. */
  Ton.prototype.einschlag = function (laut) {
    if (!this._bereit()) return;
    const l = laut01(laut);
    this._stoss(1.0, 0.8 * l, 'lowpass', 1600, 70, 0.8, 0);
    this._ton(95, 28, 0.8, 'sine', 0.9 * l, 0);
  };
  /** Flugsaurier-Schrei: kreischend hoch, dann abfallend. */
  Ton.prototype.flugsaurierSchrei = function (laut) {
    if (!this._bereit()) return;
    const l = laut01(laut);
    this._ton(1200, 2300, 0.16, 'sawtooth', 0.08 * l, 0);
    this._ton(2200, 850, 0.5, 'sawtooth', 0.08 * l, 0.15);
    this._stoss(0.5, 0.18 * l, 'bandpass', 2600, 1600, 3, 0.1);
  };
  /** Bär brummt (nach einem Zusammenstoß). */
  Ton.prototype.baerBrummen = function (laut) {
    if (!this._bereit()) return;
    const l = laut01(laut);
    this._ton(118, 78, 0.65, 'sawtooth', 0.14 * l, 0);
    this._ton(90, 70, 0.6, 'square', 0.05 * l, 0.03);
  };

  /** W2-C2: Reh ruft (kurzes, helles „Fiep" – bleibt stehen oder wird gestreift). */
  Ton.prototype.rehRuf = function (laut) {
    if (!this._bereit()) return;
    const l = laut01(laut);
    this._ton(900, 1500, 0.09, 'triangle', 0.09 * l, 0);
    this._ton(1400, 700, 0.22, 'sine', 0.08 * l, 0.1);
  };

  R.AudioKlasse = Ton;
  R.Audio = new Ton();
  R.Audio._horcherSetzen();
})();
