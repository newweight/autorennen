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
//   W5 Stufe 2 (Rempeln, nur wenn opt.kollisionen): nach der Bande wird der eigene Wagen auch gegen die ANDEREN Autos
//   geprüft (R.Kollisionen.autoAuto). Die anderen sind Stellvertreter (eigene R.Vehicle je Gegner): Pose/Tempo aus dem
//   Server-Zustand des letzten Abgleichs (zustand.a), linear Schritt für Schritt hochgerechnet (Tempo × Richtung, nach
//   einem Stoß mit dem veränderten Tempo). v13: Kurven – je Gegner wird aus dem vorigen und dem aktuellen Server-Zustand eine
//   Gierrate (rad/s = winkelDiff der Richtung / Tick-Abstand) bestimmt (abgleich merkt sich dafür selbst den letzten Zustand
//   (a, k), online.js gibt nur zusätzlich z.k mit); jeder Schritt dreht den Stellvertreter erst um gier × dt und rückt ihn dann
//   entlang der NEUEN Richtung vor (Kreisbogen). Gierrate nur bei gültigem Paar (gleicher resetZaehler, beide nicht im
//   Looping/Flug, Abstand 1..15 Ticks), sonst 0 (= v12 geradeaus); begrenzt auf ±3,5 rad/s; sie bleibt auch nach einem Stoß
//   (der Dreh-Impuls des Stoßes wird in der Vorhersage nicht nachgebildet). opt.gierrate:false = v12 (nur für den Test). Bei jedem Abgleich werden sie neu auf die Server-Pose gesetzt und das Replay
//   rückt sie für jede nachgerechnete Folge-Nr genauso vor wie später die laufende Vorhersage. Sie gehören nur der
//   Vorhersage: ein Stoß verändert sie, fließt aber nie in die Anzeige der anderen Autos zurück (die kommt weiter aus
//   dem NetzPuffer). Ohne opt.kollisionen: Verhalten wie v11.
//
// R.NetzPuffer (andere Autos): Zustände nach Server-Tick, pose(i, tick) interpoliert linear (Richtung über
//   winkelDiff), kein Interpolieren über einen Reset (Zähler) hinweg.
// ============================================================
(function () {
  const R = window.Rennspiel;

  const GIER_MAX = 3.5;        // rad/s, obere Grenze der geschätzten Gierrate (Autos drehen real höchstens ~2–3 rad/s)
  const GIER_TICKS_MAX = 15;   // Abstand der beiden Zustände höchstens 15 Ticks (0,25 s), sonst keine Gierrate

  class NetzVorhersage {
    /**
     * @param {object} opt { strecke, auto (Katalog), tempoKlasse, fahrhilfe, umwelt () => Umwelt|undefined,
     *   kollisionen? (Stufe 2: Rempeln an), andere? [{ nr (Index in zustand.a), auto (Katalog) }], rempeln? ('sanft' | 'echt') }
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
      // Stufe 2: Stellvertreter der anderen Autos (nur bei kollisionen; sonst bleibt alles wie in v11)
      this.kollisionen = !!opt.kollisionen && Array.isArray(opt.andere) && opt.andere.length > 0;
      this.rempeln = opt.rempeln === 'echt' ? 'echt' : 'sanft';
      this.stellvertreter = this.kollisionen
        ? opt.andere.map(o => ({ nr: o.nr, v: new R.Vehicle(o.auto.fahrwerte, { tempoKlasse: opt.tempoKlasse }) }))
        : [];
      // v13: Stellvertreter folgen Kurven (Gierrate aus zwei aufeinanderfolgenden Server-Zuständen); opt.gierrate === false = v12 (nur Test)
      this.gierrate = opt.gierrate !== false;
      this._vorher = null;         // { a, k } des vorigen Abgleichs (für die Gierrate)
      this._ref = null;            // { a: zustand.a, ack } des letzten Abgleichs (Basis der Hochrechnung)
      this._kandidaten = [];
      this.stat.stoesse = 0;       // Stöße in der laufenden Vorhersage (nicht im Replay)
      this.stat.mitGier = 0;       // Abgleiche, bei denen mindestens ein Stellvertreter eine Gierrate bekam
    }

    /** Ein vorhergesagter Schritt. s = { gas, bremse, lenkung } (bereits wie gesendet quantisiert). */
    schritt(n, s, ctx) {
      this.offen.push({ n, s: { gas: s.gas, bremse: s.bremse, lenkung: s.lenkung }, cd: !!ctx.countdown, ziel: !!ctx.imZiel });
      if (this.offen.length > 240) this.offen.shift();
      if (!this.sonder) this._rechnen(this.offen[this.offen.length - 1], true);
    }

    /** Ein Schritt wie main.js physikSchritt (nur dieses Auto, auf dem Boden). live = neuer Schritt (nicht Replay). */
    _rechnen(e, live) {
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
      if (this.kollisionen && this._ref) this._autoAuto(e, live);
      if (R.Kollisionen.pflanzen) R.Kollisionen.pflanzen(this._liste, st, { dt, countdown: e.cd });
      v.y = st.hoeheAn(v.x, v.z, this.idx);
    }

    /**
     * Stufe 2: eigener Wagen gegen die Stellvertreter der anderen Autos (wie main.js physikSchritt, Schritt 8, aber nur
     * Paare mit dem eigenen Wagen). Die Stellvertreter starten beim Abgleich auf der Server-Pose (Tick des Zustands,
     * Folge-Nr = ack) und rücken dann mit jedem Schritt (Folge-Nr n) um dt entlang ihrer Welt-Geschwindigkeit vor:
     * geradeaus mit dem damaligen Tempo, nach einem Stoß mit dem veränderten Tempo (sonst würde der eigene Wagen nach dem
     * Aufprall noch Schritte lang gegen ein „unbewegtes" Auto stoßen). Beim nächsten Abgleich werden sie neu gesetzt.
     */
    _autoAuto(e, live) {
      const v = this.vp, K = R.Kollisionen, dt = R.config.physik.schritt, ref = this._ref;
      if (e.n - ref.ack > 90) return;                   // Basis älter als 1,5 s: nicht mehr hochrechnen
      const liste = this._kandidaten;
      liste.length = 0;
      liste.push(v);
      // fehlende Schritte (Sonderzustand dazwischen) ohne Stoß nachholen, dann den aktuellen Schritt
      for (const p of this.stellvertreter) {
        const w = p.v;
        if (!ref.a[p.nr]) continue;
        for (; p.n < e.n; p.n++) {
          const alt = w._kollAlt || (w._kollAlt = {});
          alt.x = w.x; alt.z = w.z; alt.h = w.heading;
          if (p.gier) w.heading += p.gier * dt;           // Kreisbogen: erst drehen, dann entlang der neuen Richtung
          const vw = w.weltGeschwindigkeit();
          w.x += vw.x * dt; w.z += vw.z * dt;
        }
        if (Math.hypot(w.x - v.x, w.z - v.z) <= 15) liste.push(w);      // weiter weg: kein Kandidat
      }
      const x0 = v.x, z0 = v.z;
      const stoesse = K.autoAuto(liste, { countdown: e.cd, rempeln: this.rempeln, dt });
      if (stoesse.length) {
        if (live) this.stat.stoesse++;
        if (v.x !== x0 || v.z !== z0) K.bande(v, this.strecke);       // wer bewegt wurde, prüft die Bande nochmal (wie main.js)
      }
    }

    /**
     * v13: Gierrate (rad/s) je Gegner aus dem vorigen und dem aktuellen Server-Zustand (Richtungsdifferenz / Tick-Abstand).
     * Nur bei gültigen Paaren (gleicher resetZaehler, beide nicht im Looping/Flug, 0 < Abstand ≤ 15 Ticks = 0,25 s), sonst 0
     * (= v12: geradeaus). Begrenzt auf ±GIER_MAX, damit ein Ausreißer (Stoß, Spin) nicht weit wegdreht.
     */
    _gierSetzen(a, k) {
      const vor = this._vorher, dt = R.config.physik.schritt;
      const dk = vor && k !== undefined ? k - vor.k : 0;
      let any = false;
      for (const p of this.stellvertreter) {
        p.gier = 0;
        if (!this.gierrate || !(dk > 0 && dk <= GIER_TICKS_MAX)) continue;
        const z1 = a[p.nr], z0 = vor.a[p.nr];
        if (!z1 || !z0 || z1[13] !== z0[13] || z1[14] || z0[14] || (z1[6] & 32) || (z0[6] & 32)) continue;
        const g = R.Vehicle.winkelDiff(z1[3], z0[3]) / (dk * dt);
        p.gier = Math.max(-GIER_MAX, Math.min(GIER_MAX, g));
        any = true;
      }
      if (any) this.stat.mitGier++;
      this._vorher = { a, k };
    }

    /** Stellvertreter auf die Server-Pose setzen (zustand.a beim Abgleich, ack = Folge-Nr dieses Ticks). */
    _stellvertreterSetzen(a, ack) {
      for (const p of this.stellvertreter) {
        const z = a[p.nr], w = p.v;
        if (!z) continue;
        w.x = z[0]; w.z = z[1]; w.y = z[2]; w.heading = z[3]; w.vLaengs = z[4]; w.vQuer = 0; w.lenkung = z[5];
        w.imFlug = !!(z[6] & 32); w.imLooping = !!z[14]; w._anBande = false;
        w._kollAlt = { x: w.x, z: w.z, h: w.heading };
        p.n = ack;
      }
    }

    /**
     * Server-Zustand für den eigenen Wagen (ich = { v, idx, bi, bs, fk, gs, so, ack }).
     * @param {object} anzeige aktuelle Anzeige-Pose { x, z, y, heading } (für weiche Übergänge)
     * @param {Array} [andere] zustand.a desselben Server-Ticks (Stellvertreter der anderen Autos, nur bei kollisionen)
     * @param {number} [k] Server-Tick dieses Zustands (zustand.k): damit merkt sich die Vorhersage den vorigen Zustand (für die Gierrate)
     */
    abgleich(ich, anzeige, andere, k) {
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
      if (this.kollisionen && andere) {
        this._ref = { a: andere, ack: ich.ack };
        this._gierSetzen(andere, k);
        this._stellvertreterSetzen(andere, ich.ack);
        v._kollAlt = { x: v.x, z: v.z, h: v.heading };   // Sweep ab der Server-Pose (nicht ab einer Pose aus der Zukunft)
      }
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
