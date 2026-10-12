// ============================================================
// W5-2 Mehrspieler: Vorhersage des eigenen Wagens + Interpolation der anderen Autos.
//
// R.NetzVorhersage (eigener Wagen):
//   - schritt(s, ctx): rechnet einen festen Schritt (1/60 s) mit dem LOKALEN vehicle.js, genau wie main.js
//     physikSchritt für ein Spielerauto auf dem Boden (Untergrund + Abseits-Mischung, Fahrhilfe, Turbo-/Boost-Faktoren
//     vom Server, Wetter-Umwelt, Bande, Pflanzen, Höhe). Merkt die Eingabe (Folge-Nr) bis der Server sie bestätigt.
//   - abgleich(ich): Server-Zustand (vollständig) übernehmen, alle unbestätigten Eingaben (Folge-Nr > ack) neu rechnen.
//     Abweichung zur bisherigen Anzeige → weich ausblenden (korr klingt in ~0,12 s ab), > 3 m → hart springen.
//   - Sonderzustände (Looping, Rampe/Flug, Anlauf-Bremse, Kleber) rechnet nur der Server: dann folgt der eigene
//     Wagen dem Server-Zustand (50 ms Verzug), Übergänge werden ebenfalls weich ausgeblendet.
//   Nicht vorhergesagt (der Server korrigiert): Hindernisse/Pylonen, Bälle/Dinos, Ölflecken, Schanzen-/Looping-Einfahrt.
//
// R.NetzPuffer (andere Autos): Zustände nach Server-Tick, pose(i, tick) interpoliert linear (Richtung über
//   winkelDiff), kein Interpolieren über einen Reset (Zähler) hinweg.
// ============================================================
(function () {
  const R = window.Rennspiel;

  class NetzVorhersage {
    /**
     * @param {object} opt { strecke, auto (Katalog), tempoKlasse, fahrhilfe, umwelt () => Umwelt|undefined }
     */
    constructor(opt) {
      this.strecke = opt.strecke;
      this.vp = new R.Vehicle(opt.auto.fahrwerte, { tempoKlasse: opt.tempoKlasse });
      this.fahrhilfe = opt.fahrhilfe;
      this.umwelt = opt.umwelt || (() => undefined);
      this.idx = -1;
      this.offen = [];             // [{ n, s, cd, ziel }] unbestätigte Eingaben
      this.fk = [1, 1];            // Turbo × Start-Boost (vom Server)
      this.gasSperre = false;
      this.sonder = false;         // Server rechnet gerade allein (Looping, Flug, …)
      this.korr = { x: 0, z: 0, y: 0, h: 0 };
      this.bremst = false;
      this.hart = false;           // im letzten Abgleich hart gesprungen (main: nicht interpolieren)
      this.stat = { abgleiche: 0, weich: 0, hart: 0, maxFehler: 0, summeFehler: 0, replays: 0 };
      this._liste = [{ vehicle: this.vp }];
      this._ersterAbgleich = true;
    }

    /** Ein vorhergesagter Schritt. s = { gas, bremse, lenkung } (bereits wie gesendet quantisiert). */
    schritt(n, s, ctx) {
      this.offen.push({ n, s: { gas: s.gas, bremse: s.bremse, lenkung: s.lenkung }, cd: !!ctx.countdown, ziel: !!ctx.imZiel });
      if (this.offen.length > 240) this.offen.shift();
      if (!this.sonder) this._rechnen(this.offen[this.offen.length - 1]);
    }

    /** Ein Schritt wie main.js physikSchritt (nur dieses Auto, auf dem Boden). */
    _rechnen(e) {
      const v = this.vp, st = this.strecke, dt = R.config.physik.schritt;
      let s = e.s;
      if (e.ziel) s = { gas: 0, bremse: 0.6, lenkung: 0 };
      if (e.cd || this.gasSperre) s = { gas: 0, bremse: s.bremse, lenkung: s.lenkung };
      const n = st.abfrage(v.x, v.z, this.idx);
      this.idx = n.index;
      v.untergrund = n.untergrund;
      if (v.untergrund === 'gras' || v.untergrund === 'sand') {
        const b2 = st.breiteBei ? st.breiteBei(n.s) / 2 : st.breite / 2;
        const ue = R.config.physik.abseitsUebergang || 1;
        v.untergrundMisch = Math.max(0, Math.min(1, (Math.abs(n.seitenabstand) - b2 - st.randBreite) / ue));
      } else v.untergrundMisch = undefined;
      let hilfe;
      const hs = R.config.fahrhilfen[this.fahrhilfe] || R.config.fahrhilfen.aus;
      if (hs.lenkhilfe > 0 || hs.bremshilfe > 0) {
        const p = st.spline.punktBei(n.s);
        hilfe = { lenkhilfe: hs.lenkhilfe, bremshilfe: hs.bremshilfe, tangente: { tx: p.tx, tz: p.tz }, seitenabstand: n.seitenabstand,
          zieltempo: st.tempoBei(n.s + Math.max(0, v.vLaengs) * 0.4) };
      }
      const dd = v.daten, fvm = this.fk[0], fbe = this.fk[1], turbo = fvm !== 1 || fbe !== 1, vm0 = dd.vMax, b0 = dd.beschleunigung;
      if (turbo) { dd.vMax = vm0 * fvm; dd.beschleunigung = b0 * fbe; }
      v.schritt(dt, s, hilfe, this.umwelt());
      if (turbo) { dd.vMax = vm0; dd.beschleunigung = b0; }
      this.bremst = v.letzteSteuerung.bremse > 0 && v.vLaengs > 0.5;
      R.Kollisionen.bande(v, st);
      if (R.Kollisionen.pflanzen) R.Kollisionen.pflanzen(this._liste, st, { dt, countdown: e.cd });
      v.y = st.hoeheAn(v.x, v.z, this.idx);
    }

    /**
     * Server-Zustand für den eigenen Wagen (ich = { v, idx, bi, bs, fk, gs, so, ack }).
     * @param {object} anzeige aktuelle Anzeige-Pose { x, z, y, heading } (für weiche Übergänge)
     */
    abgleich(ich, anzeige) {
      const st = this.stat, warSonder = this.sonder;
      st.abgleiche++;
      this.offen = this.offen.filter(e => e.n > ich.ack);
      this.fk = ich.fk || [1, 1];
      this.gasSperre = !!ich.gs;
      this.sonder = !!ich.so;
      this.hart = false;
      const v = this.vp;
      R.Netz.fahrzeugSchreiben(v, ich.v);
      this.idx = ich.idx;
      v._bandeIndex = ich.bi >= 0 ? ich.bi : undefined;
      v._buschSperre = ich.bs || 0;
      if (this.sonder) return;                 // Server rechnet allein – Anzeige folgt dem Puffer
      for (const e of this.offen) { this._rechnen(e); st.replays++; }
      if (!anzeige) return;
      // neue Basis vs. bisherige Anzeige
      const dx = anzeige.x - v.x, dz = anzeige.z - v.z, dy = anzeige.y - v.y, dh = R.Vehicle.winkelDiff(anzeige.heading, v.heading);
      const fehler = Math.hypot(dx, dz);
      if (this._ersterAbgleich) { this._ersterAbgleich = false; this.korr.x = this.korr.z = this.korr.y = this.korr.h = 0; this.hart = true; return; }
      const basisFehler = Math.hypot(dx - this.korr.x, dz - this.korr.z);   // reine Vorhersage-Abweichung (ohne alte Korrektur)
      if (!warSonder) { st.maxFehler = Math.max(st.maxFehler, basisFehler); st.summeFehler += basisFehler; }
      if (fehler > R.Netz.HART_KORREKTUR && !warSonder) {
        this.korr.x = this.korr.z = this.korr.y = this.korr.h = 0; this.hart = true; st.hart++;
      } else {
        this.korr.x = dx; this.korr.z = dz; this.korr.y = dy; this.korr.h = dh;
        if (basisFehler > 0.01) st.weich++;
      }
    }

    /** Übergang Server → eigene Anzeige weich machen (Sonderzustand beginnt): korr = alte Anzeige − neue Basis. */
    uebergang(anzeige, basis) {
      this.korr.x = anzeige.x - basis.x; this.korr.z = anzeige.z - basis.z; this.korr.y = anzeige.y - basis.y;
      this.korr.h = R.Vehicle.winkelDiff(anzeige.heading, basis.heading);
      if (Math.hypot(this.korr.x, this.korr.z) > 12) { this.korr.x = this.korr.z = this.korr.y = this.korr.h = 0; this.hart = true; }
    }

    /** Korrektur abklingen lassen (je Schritt). */
    abklingen(dt) {
      const k = Math.exp(-dt / 0.12), c = this.korr;
      c.x *= k; c.z *= k; c.y *= k; c.h *= k;
      if (Math.abs(c.x) + Math.abs(c.z) < 1e-4) { c.x = c.z = c.y = 0; }
      if (Math.abs(c.h) < 1e-5) c.h = 0;
    }

    /** Anzeige-Fahrzeug = Vorhersage + Korrektur. */
    anzeigen(fv) {
      const v = this.vp, c = this.korr;
      fv.x = v.x + c.x; fv.z = v.z + c.z; fv.y = v.y + c.y; fv.heading = v.heading + c.h;
      fv.vLaengs = v.vLaengs; fv.vQuer = v.vQuer; fv.lenkung = v.lenkung; fv.nicken = v.nicken; fv.neigung = v.neigung;
      fv.untergrund = v.untergrund; fv._anBande = v._anBande; fv.letzteSteuerung = v.letzteSteuerung;
      fv.imLooping = false;
    }
  }

  /** Puffer der Server-Zustände für die Interpolation. */
  class NetzPuffer {
    constructor() { this.liste = []; }
    rein(z) {
      const l = this.liste;
      if (l.length && z.k <= l[l.length - 1].k) return;
      l.push(z);
      while (l.length > 40) l.shift();     // 2 s
    }
    get neuester() { return this.liste[this.liste.length - 1] || null; }
    /** Zwei Zustände um tick + Anteil. */
    um(tick) {
      const l = this.liste;
      if (!l.length) return null;
      if (tick <= l[0].k) return { a: l[0], b: l[0], t: 0 };
      for (let i = l.length - 1; i >= 0; i--) {
        if (l[i].k <= tick) {
          const b = l[i + 1];
          if (!b) return { a: l[i], b: l[i], t: 0 };
          return { a: l[i], b, t: (tick - l[i].k) / (b.k - l[i].k) };
        }
      }
      return { a: l[0], b: l[0], t: 0 };
    }
    leeren() { this.liste = []; }
  }

  /**
   * Pose eines Autos aus zwei Zustandsreihen (a, b: Arrays aus der Zustand-Nachricht) interpolieren → in v schreiben.
   * Rückgabe: Looping-Daten [idx, winkel, qEin] (interpoliert) oder null.
   */
  function interpolieren(a, b, t, v) {
    if (!a || !b) return null;
    if (a[13] !== b[13]) { a = b; t = 0; }       // Reset dazwischen: nicht durch die Landschaft gleiten
    const L = (i) => a[i] + (b[i] - a[i]) * t;
    v.x = L(0); v.z = L(1); v.y = L(2);
    v.heading = a[3] + R.Vehicle.winkelDiff(b[3], a[3]) * t;
    v.vLaengs = L(4); v.lenkung = L(5); v.nicken = L(7); v.neigung = L(8);
    const la = a[14], lb = b[14];
    if (lb && la && la[0] === lb[0]) return [lb[0], la[1] + (lb[1] - la[1]) * t, lb[2]];
    return lb || null;
  }

  R.NetzVorhersage = NetzVorhersage;
  R.NetzPuffer = NetzPuffer;
  R.NetzPuffer.interpolieren = interpolieren;
})();
