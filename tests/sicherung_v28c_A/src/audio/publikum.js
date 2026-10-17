// ============================================================
// 15.10. (v25) Publikum-Akustik der Zuschauertribünen (src/world/tribuenen.js) – reine WebAudio-Synthese, keine Dateien.
//   „… dort wo Zuschauertribünen sind auch mit Akustik.“ (Wunsch des Vaters)
//
//   Aufbau: ein kleiner Pool (config.tribuenen.akustik.stimmen = 3) von „Publikum-Stimmen“ wird den NÄCHSTEN hörbaren Tribünen zugeteilt.
//   Jede Stimme: gefiltertes Rauschen (Grundrauschen, langsam an-/abschwellend) + Murmeln (Rauschen, ~4,7 Hz Silben-Modulation) +
//   Jubel-Rauschen + „Ohhh/Aahh“-Formant (zwei leicht verstimmte Sägezähne durch 3 Formant-Filter, Tonhöhe gleitet) + einzelne Klatsch-Impulse
//   (kurze Rauschstöße). Lautstärke nach Abstand des NÄCHSTEN Autos zur Tribüne (Zweispieler: je Tribüne das nächste Spieler-Auto), links/rechts
//   per StereoPanner relativ zur Fahrtrichtung dieses Autos, Höhen dämpfen mit der Entfernung (Tiefpass).
//   Jubel: Vorbeifahrt (Tempo-abhängig), Überholmanöver (Platz verbessert), Runde/Zieleinlauf (extra). Der Jubel steuert auch die Zuschauer-
//   Animation (R.Tribuenen.jubeln) – auch bei „Ton aus“. Master-Lautstärke/Ton aus gelten über R.Audio (Bus _effekte → Master).
//   CPU: Logik im Takt `takt` (0,1 s); nicht zugeteilte Stimmen sind vom Ausgang getrennt (WebAudio rechnet sie nicht).
//
//   R.Publikum.start(strecke) / stop() / aktualisieren(spiel, dt, stumm) / schritt(dt, autos, stumm, opt) / ereignis(art, wert) / info()
//   autos = [{ x, z, heading, tempo, vMax, spieler, platz }]  (schritt() ist die Testschnittstelle ohne Spiel-Objekt)
// ============================================================
(function () {
  const R = window.Rennspiel = window.Rennspiel || {};

  const cfg = () => (R.config && R.config.tribuenen && R.config.tribuenen.akustik) || {};
  const num = (v, d) => (typeof v === 'number' && isFinite(v) ? v : d);
  const klemme = (x, lo, hi) => (x < lo ? lo : (x > hi ? hi : x));

  const P = {
    _st: null, _liste: [], _stimmen: [], _t: 0, _akku: 0,
    _letzterSpieler: [], _letzterAlle: [], _drin: new Map(), _platz: new Map(), _hoerbar: [],
    _jubelFlag: 0,
  };

  // ------------------------------------------------------------------ Stimmen-Pool
  /** Eine Publikum-Stimme bauen (alle Nodes laufen dauerhaft; Pegel 0 = still; ohne Zuteilung vom Ausgang getrennt). */
  P._stimmeBauen = function () {
    const A = R.Audio, c = A._ctx;
    const n = (x) => A._n(x), g = (v) => A._gain(v);
    const quelle = (puffer) => { const q = n(c.createBufferSource()); q.buffer = puffer; q.loop = true; q.start(0, Math.random() * 1.5); return q; };
    const filter = (typ, f, qq) => { const b = n(c.createBiquadFilter()); b.type = typ; b.frequency.value = f; b.Q.value = qq; return b; };
    const lfo = (hz, tiefe) => { const o = n(c.createOscillator()); o.frequency.value = hz; const gg = g(tiefe); o.connect(gg); o.start(0); return { o, g: gg }; };

    const mix = g(1), tief = filter('lowpass', 5000, 0.5), bus = g(0);
    mix.connect(tief); tief.connect(bus);
    const pan = c.createStereoPanner ? n(c.createStereoPanner()) : null;
    if (pan) bus.connect(pan);
    const ausgang = pan || bus;

    // 1) Grundrauschen: breites Rauschen, 0,35 Hz an-/abschwellend
    const s1 = quelle(A._rausch), b1 = filter('bandpass', 760, 0.7), l1 = filter('lowpass', 2300, 0.5), gG = g(0.55), mod1 = g(0.75);
    s1.connect(b1); b1.connect(l1); l1.connect(gG); gG.connect(mod1); mod1.connect(mix);
    const lf1 = lfo(0.35, 0.25); lf1.g.connect(mod1.gain);
    // 2) Murmeln: schmaleres Rauschen, Silben-Takt ~4,7 Hz (Stimmengewirr)
    const s2 = quelle(A._rausch), b2 = filter('bandpass', 1250, 2.2), gM = g(0.5), mod2 = g(0.5);
    s2.connect(b2); b2.connect(gM); gM.connect(mod2); mod2.connect(mix);
    const lf2 = lfo(4.7, 0.5); lf2.g.connect(mod2.gain);
    // 3) Jubel-Rauschen: hell und breit
    const s3 = quelle(A._rausch), b3 = filter('bandpass', 1500, 0.55), l3 = filter('lowpass', 5200, 0.6), gJ = g(0);
    s3.connect(b3); b3.connect(l3); l3.connect(gJ); gJ.connect(mix);
    // 4) „Ohhh/Aahh“: zwei verstimmte Sägezähne durch drei Formanten, Vibrato 5 Hz
    const o1 = n(c.createOscillator()), o2 = n(c.createOscillator()), osz = g(0.5);
    o1.type = 'sawtooth'; o2.type = 'sawtooth'; o1.frequency.value = 190; o2.frequency.value = 190; o2.detune.value = 22;
    o1.connect(osz); o2.connect(osz); o1.start(0); o2.start(0);
    const vib = lfo(5.2, 3.5); vib.g.connect(o1.frequency); vib.g.connect(o2.frequency);
    const gO = g(0);
    [[640, 6, 1], [1090, 8, 0.55], [2500, 10, 0.18]].forEach(([f, q, v]) => { const fl = filter('bandpass', f, q), gf = g(v * 2.2); osz.connect(fl); fl.connect(gf); gf.connect(gO); });
    gO.connect(mix);

    return {
      nr: -1, mix, tief, bus, pan, ausgang, gG, gM, gJ, gO, o1, o2, verbunden: false, laut: 0, panWert: 0, tiefHz: 5000,
      jubel: 0, jubelEnde: 0, jubelStart: 0, leerSeit: 0, klatschCd: 0,
    };
  };

  P._verbinden = function (v, an) {
    const A = R.Audio;
    if (an && !v.verbunden) { try { v.ausgang.connect(A._effekte); v.verbunden = true; } catch (e) { /* egal */ } }
    else if (!an && v.verbunden) { try { v.ausgang.disconnect(); } catch (e) { /* egal */ } v.verbunden = false; }
  };

  /** Klatschen: kurzer Rauschstoß (Bandpass) in der Stimme, bei Zeit t0 (Audio-Zeit). */
  P._klatsch = function (v, t0, pegel) {
    const A = R.Audio, c = A._ctx;
    const s = A._n(c.createBufferSource()), f = A._n(c.createBiquadFilter()), gg = A._n(c.createGain());
    const dauer = 0.03 + Math.random() * 0.04;
    s.buffer = A._rausch; f.type = 'bandpass'; f.frequency.value = 1700 + Math.random() * 2200; f.Q.value = 1.6;
    gg.gain.setValueAtTime(0.0001, t0); gg.gain.linearRampToValueAtTime(pegel, t0 + 0.004); gg.gain.exponentialRampToValueAtTime(0.0001, t0 + dauer);
    s.connect(f); f.connect(gg); gg.connect(v.mix);
    s.start(t0, Math.random() * 1.5, dauer + 0.03);
    A._aufraeumen(s, [s, f, gg]);
  };

  /** Jubel an einer Stimme auslösen (stärke 0…1, dauer s): Pegel-Hüllkurve, „Ohhh“-Gleiten, Klatsch-Salve. */
  P._jubeln = function (v, staerke, dauer) {
    const A = R.Audio, t = A._jetzt();
    v.jubel = Math.max(v.jubel, staerke);
    v.jubelEnde = Math.max(v.jubelEnde, this._t + dauer);
    v.jubelStart = this._t;
    // „Ohhh/Aahh“: Tonhöhe steigt kurz (Ausruf) und fällt dann ab
    if (staerke >= 0.45) {
      const f0 = 175 + Math.random() * 30;
      [v.o1, v.o2].forEach((o) => {
        try {
          o.frequency.cancelScheduledValues(t);
          o.frequency.setValueAtTime(f0, t);
          o.frequency.linearRampToValueAtTime(f0 * 1.28, t + 0.32);
          o.frequency.linearRampToValueAtTime(f0 * 0.86, t + Math.max(0.8, dauer));
        } catch (e) { /* egal */ }
      });
    }
    // Klatsch-Salve (über die ganze Dauer, anfangs dichter)
    const nK = Math.round(6 + 16 * staerke);
    for (let k = 0; k < nK; k++) {
      const off = 0.15 + Math.pow(Math.random(), 1.6) * Math.max(0.6, dauer * 0.85);
      this._klatsch(v, t + off, (0.12 + 0.22 * Math.random()) * (0.4 + 0.6 * staerke));
    }
  };

  // ------------------------------------------------------------------ Zustand
  P.start = function (strecke) {
    this._st = strecke || null;
    this._liste = (strecke && strecke.tribuenen) || [];
    this._t = 0; this._akku = 0;
    this._letzterSpieler = this._liste.map(() => -1e9); this._letzterAlle = this._liste.map(() => -1e9);
    this._drin = new Map(); this._platz = new Map(); this._hoerbar = [];
    this._stimmen.forEach((v) => { v.nr = -1; v.jubel = 0; v.jubelEnde = 0; });
  };

  /** Szene abgebaut / Menü: alle Stimmen still und vom Ausgang getrennt. */
  P.stop = function () {
    const A = R.Audio;
    this._stimmen.forEach((v) => {
      v.nr = -1; v.jubel = 0; v.jubelEnde = 0; v.laut = 0;
      try { if (A._ctx) v.bus.gain.setTargetAtTime(0, A._jetzt(), 0.05); } catch (e) { /* egal */ }
      this._verbinden(v, false);
    });
    this._st = null; this._liste = []; this._hoerbar = [];
  };

  /** Nächster Punkt der Sitzfläche (Mittellinie der Tribüne) zu (x, z): { d, px, pz }. */
  function naechsterPunkt(t, x, z) {
    const hl = t.laenge / 2, vm = t.tiefe * 0.45;
    const mx = t.x + t.ox * vm, mz = t.z + t.oz * vm;
    let u = (x - mx) * t.tx + (z - mz) * t.tz; u = klemme(u, -hl, hl);
    const px = mx + t.tx * u, pz = mz + t.tz * u;
    return { d: Math.hypot(x - px, z - pz), px, pz };
  }
  P.naechsterPunkt = naechsterPunkt;

  /** Lautstärke-Faktor 0…1 nach Abstand (voll bis nah, 0 ab hoerweite). */
  P.abstandsFaktor = function (d) {
    const C = cfg(), nah = num(C.nah, 30), hoer = num(C.hoerweite, 170);
    if (d <= nah) return 1; if (d >= hoer) return 0;
    return Math.pow((hoer - d) / (hoer - nah), 1.6);
  };

  /** Extra-Jubel von außen: 'ziel' (alle Tribünen in Hörweite des Spielers), 'runde' (Start/Ziel-Tribüne). */
  P.ereignis = function (art, wert) {
    const C = cfg(); if (C.an === false || !this._liste.length || !this._sp || C.ziel === false) return;
    const hoer = num(C.hoerweite, 170);
    this._liste.forEach((t, i) => {
      const d = naechsterPunkt(t, this._sp.x, this._sp.z).d;
      if (art === 'ziel') { if (d < hoer) this._starkJubeln(i, 1, 5.5); }
      else if (art === 'runde') { if (t.typ === 'start' && d < hoer) this._starkJubeln(i, 0.65, 3.2); }
    });
    void wert;
  };

  /** Jubel an Tribüne i (Optik immer, Ton wenn Stimme zugeteilt/hörbar). */
  P._starkJubeln = function (i, staerke, dauer) {
    if (R.Tribuenen && this._st) R.Tribuenen.jubeln(this._st, i, staerke);
    const v = this._stimmen.find((s) => s.nr === i);
    if (v && R.Audio && R.Audio._bereit()) this._jubeln(v, staerke, dauer);
    else {
      // noch nicht zugeteilt: merken, damit die Stimme beim Zuteilen sofort mitjubelt
      this._offen = this._offen || {}; this._offen[i] = { staerke, dauer, bis: this._t + 0.6 };
    }
  };

  /** Spiel-Adapter: autos aus spiel.rennen.teilnehmer / spiel.fahrzeuge. stumm = Pause/Menü/Ergebnis. */
  P.aktualisieren = function (spiel, dt, stumm) {
    if (!spiel || !spiel.strecke) return;
    if (spiel.strecke !== this._st) this.start(spiel.strecke);
    if (!this._liste.length) return;
    const rn = spiel.rennen, autos = this._autos || (this._autos = []);
    autos.length = 0;
    const quellen = rn && rn.teilnehmer ? rn.teilnehmer : null;
    const fz = spiel.fahrzeuge || [];
    for (let i = 0; i < fz.length; i++) {
      const f = fz[i], v = f.vehicle; if (!v || f.ausgeschieden || f.polizei || f.verkehr) continue;
      const t = quellen && quellen[i];
      autos.push({ x: v.x, z: v.z, heading: v.heading, tempo: v.tempo || 0, vMax: (v.daten && v.daten.vMax) || 40, spieler: !!f.istSpieler, platz: t ? t.platz : undefined, nr: i });
    }
    this.schritt(dt, autos, !!stumm, { laeuft: !rn || rn.zustand === 'laeuft' });
  };

  // ------------------------------------------------------------------ Takt
  /** Kern: Abstände, Zuteilung, Pegel, Jubel-Auslöser. opt.laeuft = false (Countdown/Ergebnis): keine Überhol-/Vorbeifahrt-Auslöser. */
  P.schritt = function (dt, autos, stumm, opt) {
    const C = cfg();
    if (C.an === false || !this._liste.length) return;
    const A = R.Audio;
    this._t += dt; this._akku += dt;
    if (stumm) {
      if (this._hoerbar.length || this._stimmen.some((v) => v.verbunden)) this._stillMachen();
      return;
    }
    const takt = num(C.takt, 0.1);
    if (this._akku < takt) return;
    const dtS = this._akku; this._akku = 0;
    const laeuft = !opt || opt.laeuft !== false;
    const liste = this._liste, hoer = num(C.hoerweite, 170), pause = num(C.jubelPause, 5), nahJ = num(C.jubelNah, 65), minT = num(C.jubelMinTempo, 9);
    // Bezugsauto je Tribüne: nächstes SPIELER-Auto (gibt es keinen Spieler: nächstes Auto)
    const hatSpieler = autos.some((a) => a.spieler);
    const sp0 = autos.find((q) => q.spieler) || autos[0];
    if (sp0) this._sp = { x: sp0.x, z: sp0.z };
    const hoerbar = this._hoerbar; hoerbar.length = 0;
    for (let i = 0; i < liste.length; i++) {
      const t = liste[i];
      let best = null, bd = Infinity, bp = null;
      for (let j = 0; j < autos.length; j++) {
        const a = autos[j]; if (hatSpieler && !a.spieler) continue;
        const p = naechsterPunkt(t, a.x, a.z);
        if (p.d < bd) { bd = p.d; best = a; bp = p; }
      }
      if (!best) continue;
      hoerbar.push({ i, d: bd, a: best, p: bp });
      // --- Jubel-Auslöser: Vorbeifahrt (jedes Auto; Spieler voll, KI leiser und seltener)
      if (laeuft) {
        for (let j = 0; j < autos.length; j++) {
          const a = autos[j], p = a === best ? bp : naechsterPunkt(t, a.x, a.z), key = i * 64 + (a.nr !== undefined ? a.nr : j);
          const drin = this._drin.get(key) === true;
          if (p.d < nahJ && a.tempo >= minT) {
            if (!drin) {
              this._drin.set(key, true);
              const st = klemme(0.4 + 0.6 * a.tempo / Math.max(20, a.vMax), 0.4, 1);
              if (a.spieler) {
                if (this._t - this._letzterSpieler[i] >= pause) { this._letzterSpieler[i] = this._t; this._letzterAlle[i] = this._t; this._starkJubeln(i, st, 2 + 2.2 * st); }
              } else if (hatSpieler && bd < hoer * 0.8 && this._t - this._letzterAlle[i] >= pause * 2) {
                this._letzterAlle[i] = this._t; this._starkJubeln(i, st * 0.55, 1.6 + st);
              }
            }
          } else if (drin && p.d > nahJ + 12) this._drin.set(key, false);
        }
      }
    }
    // --- Überholmanöver: Platz eines Spielers verbessert sich in Hörweite einer Tribüne (nächste Tribüne jubelt extra)
    for (let j = 0; j < autos.length; j++) {
      const a = autos[j]; if (!a.spieler || a.platz === undefined) continue;
      const key = a.nr !== undefined ? a.nr : j, alt = this._platz.get(key);
      this._platz.set(key, a.platz);
      if (!laeuft || C.ueberholen === false || alt === undefined || a.platz >= alt || a.tempo <= 5) continue;
      let bi = -1, bdd = Infinity;
      for (let i = 0; i < liste.length; i++) { const d = naechsterPunkt(liste[i], a.x, a.z).d; if (d < bdd) { bdd = d; bi = i; } }
      if (bi >= 0 && bdd < hoer * 0.65) this._starkJubeln(bi, 0.85, 3);
    }
    // --- Zuteilung: die k nächsten Tribünen in Hörweite
    const k = Math.max(1, Math.min(6, Math.round(num(C.stimmen, 3))));
    hoerbar.sort((x, y) => x.d - y.d);
    const ok = !!A && A._bereit && A._bereit() && A._effekte && A._rausch;
    if (!ok) { return; }
    const waehl = hoerbar.filter((h) => h.d < hoer).slice(0, k);
    // vorhandene Stimmen den gewählten Tribünen zuordnen
    const belegt = new Set();
    waehl.forEach((h) => { const v = this._stimmen.find((s) => s.nr === h.i); if (v) { h.v = v; belegt.add(v); } });
    waehl.forEach((h) => {
      if (h.v) return;
      let v = this._stimmen.find((s) => !belegt.has(s) && s.nr < 0);
      if (!v && this._stimmen.length < k) { v = this._stimmeBauen(); this._stimmen.push(v); }
      if (!v) v = this._stimmen.find((s) => !belegt.has(s));
      if (!v) return;
      v.nr = h.i; v.jubel = 0; v.jubelEnde = 0; v.leerSeit = 0; h.v = v; belegt.add(v);
      this._verbinden(v, true);
      const off = this._offen && this._offen[h.i];
      if (off && off.bis > this._t) { this._jubeln(v, off.staerke, off.dauer); delete this._offen[h.i]; }
    });
    const tt = A._jetzt();
    const pegel = num(C.pegel, 0.55);
    // nicht gewählte Stimmen ausblenden
    this._stimmen.forEach((v) => {
      if (belegt.has(v)) return;
      v.laut = 0; v.nr = -1;
      try { v.bus.gain.setTargetAtTime(0, tt, 0.15); } catch (e) { /* egal */ }
      v.leerSeit += dtS; if (v.leerSeit > 1.2) this._verbinden(v, false);
    });
    // gewählte Stimmen: Pegel, Pan, Tiefpass, Jubel-Hüllkurve, gelegentliches Klatschen
    waehl.forEach((h) => {
      const v = h.v; if (!v) return;
      const laut = this.abstandsFaktor(h.d);
      v.laut = laut;
      try {
        v.bus.gain.setTargetAtTime(laut * pegel, tt, 0.12);
        // links/rechts relativ zur Fahrtrichtung des Bezugsautos: rechts = (−fz, fx) mit f = (−sin h, −cos h)
        const fx = -Math.sin(h.a.heading), fz = -Math.cos(h.a.heading);
        const dx = h.p.px - h.a.x, dz = h.p.pz - h.a.z, dl = Math.hypot(dx, dz) || 1;
        const rechts = (dx * -fz + dz * fx) / dl;
        const nahe = klemme(h.d / 40, 0, 1);                        // sehr nah: weniger extremes Panning
        v.panWert = klemme(rechts * (0.55 + 0.4 * nahe), -0.9, 0.9);
        if (v.pan) v.pan.pan.setTargetAtTime(v.panWert, tt, 0.1);
        v.tiefHz = 1400 + 4600 * Math.pow(laut, 0.6);
        v.tief.frequency.setTargetAtTime(v.tiefHz, tt, 0.15);
        // Jubel-Pegel: Anstieg schnell, Abklingen langsam
        const aktiv = this._t < v.jubelEnde;
        const ziel = aktiv ? v.jubel : 0;
        v.gJ.gain.setTargetAtTime(ziel * 0.95, tt, aktiv ? 0.18 : 0.7);
        v.gO.gain.setTargetAtTime(ziel * 0.42, tt, aktiv ? 0.12 : 0.55);
        v.gG.gain.setTargetAtTime(0.55 + 0.4 * ziel, tt, 0.3);
        if (!aktiv && v.jubel > 0 && this._t > v.jubelEnde + 2.5) v.jubel = 0;
        // vereinzeltes Klatschen im Hintergrund
        v.klatschCd -= dtS;
        if (v.klatschCd <= 0 && laut > 0.12) { v.klatschCd = 0.35 + Math.random() * 1.2; this._klatsch(v, tt + Math.random() * 0.05, 0.05 + 0.08 * Math.random()); }
      } catch (e) { /* egal */ }
    });
  };

  P._stillMachen = function () {
    const A = R.Audio; if (!A || !A._ctx) { this._hoerbar.length = 0; return; }
    const tt = A._jetzt();
    this._stimmen.forEach((v) => {
      try { v.bus.gain.setTargetAtTime(0, tt, 0.05); } catch (e) { /* egal */ }
      v.laut = 0; v.nr = -1; v.jubel = 0; v.jubelEnde = 0;
      this._verbinden(v, false);
    });
    this._hoerbar.length = 0;
  };

  /** Diagnose für Tests. */
  P.info = function () {
    return this._stimmen.map((v) => ({ nr: v.nr, laut: v.laut, pan: v.panWert, tiefHz: v.tiefHz, jubel: v.jubel, verbunden: v.verbunden }));
  };

  R.Publikum = P;
})();
