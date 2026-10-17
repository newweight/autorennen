// ============================================================
// W5-2 Mehrspieler: Vorhersage des eigenen Wagens + Interpolation der anderen Autos.
//
// R.NetzVorhersage (eigener Wagen):
//   - schritt(s, ctx): rechnet einen festen Schritt (1/60 s) mit dem LOKALEN vehicle.js, genau wie main.js
//     physikSchritt für ein Spielerauto auf dem Boden (Untergrund + Abseits-Mischung, Fahrhilfe, Turbo-/Boost-Faktoren
//     vom Server, Wetter-Umwelt, Bande, Pflanzen, Höhe). Merkt die Eingabe (Folge-Nr) bis der Server sie bestätigt.
//   - abgleich(ich): Server-Zustand (vollständig) übernehmen, alle unbestätigten Eingaben (Folge-Nr > ack) neu rechnen.
//     Abweichung zur bisherigen Anzeige → weich ausblenden (korr klingt in ~0,12 s ab), > 3 m → hart springen.
//   - v16 (13.10.) Sonderzustände (Kleber, Anlauf-Bremse, Schanze/Flug, Looping inkl. Fall-Animation) rechnet die Vorhersage MIT:
//     denselben deterministischen Code wie der Server (world/kleber.js, track/anlauf.js, track/schanze.js, track/looping.js) in derselben
//     Reihenfolge wie main.js physikSchritt (Eingabe → Kleber sperrt → Looping/Flug ersetzen vehicle.schritt → sonst Fahrschritt mit
//     Untergrund 'kleber', dann Anlauf-Bremse, Kleber, Schanze, Looping-Einfahrt → Bande/Pflanzen → Höhe inkl. Rampe). Den nötigen Zustand
//     liefert der Server in ich.sz (server/simulation.js _sonderZustand, ungerundet, damit Schwellen im selben Tick auslösen wie dort;
//     server/PROTOKOLL.md); abgleich() übernimmt ihn (_sonderLaden) und rechnet die unbestätigten Eingaben damit nach. Der Looping-Winkel
//     (Anzeige auf dem Kreis) wird wie die Position weich angeglichen (korr.w). online.js zeigt Looping/Flug des eigenen Wagens aus
//     V.lp / V.fz. Schalter opt.sonderVorhersage: false = v15 (alles allein im Server, nur für den Test) | true/fehlt = SONDER_STANDARD |
//     { kleber, anlauf, flug, looping } je Art (nur Test/Messung). Fehlt eine Strecken-Eigenschaft (z. B. keine Schanzen) oder das Skript,
//     bleibt die Art aus. Was die Vorhersage nicht mitrechnet (abgeschaltete Art, alter Server ohne sz), rechnet weiter allein der Server:
//     sonder = true, die Anzeige folgt dem Server-Zustand (50 ms Verzug), Übergänge werden weich ausgeblendet (wie v15).
//   Nicht vorhergesagt (der Server korrigiert): Hindernisse/Pylonen, Bälle/Dinos, Ölflecken, Reset-Taste (Server setzt um).
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
  // v16: welche Sonderzustände die Vorhersage selbst mitrechnet (Messung: tests/test_netz.js Block M, Ergebnis in VERLAUF.md)
  const SONDER_STANDARD = { kleber: true, anlauf: true, flug: true, looping: true };
  const NULL_S = { gas: 0, bremse: 0, lenkung: 0 };
  const TRENN_MAX = 8;         // v28c: m – größter Anzeige-Versatz von trennen() (Rempeln bei 200 ms Ping braucht bis ~5 m), darüber nichts tun

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
      this.polizeiRest = 0;        // v4: Rest der Polizei-Anhaltung (s), vom Server in ich.ps
      // v24 (15.10.): Cabrio-Dach (cars/dachregel.js): Klappzeit/Ziel für die Gas-Sperre beim Schließen – Start per Eingabe-Bit d (Geste im Stand),
      // Zustand vom Server in ich.dz; null = Auto ohne Verdeck
      this.dz = R.DachRegel && opt.auto ? R.DachRegel.neu(opt.auto) : null;
      this.sonder = false;         // Server rechnet gerade allein (Looping, Flug, …)
      this.korr = { x: 0, z: 0, y: 0, h: 0, w: 0 };   // w = Looping-Winkel (rad), nur mit Looping-Vorhersage
      this.tauKorr = 0.25;          // v23: Abklingzeit der Korrektur nach einem Abgleich (s); v22b: 0,12
    this.trenn = { x: 0, z: 0 };  // v28c: Anzeige-Versatz „nicht in angezeigte Autos hinein“ (trennen), NICHT Teil der Vorhersage
    this.tauTrenn = 0.15;         // v28c: Abklingzeit dieses Versatzes nach dem Kontakt (s)
      // v16: Sonderzustände lokal mitrechnen (opt.sonderVorhersage: false = v15 | true = Standard | { kleber, anlauf, flug, looping })
      const sv = opt.sonderVorhersage === false ? {} : (opt.sonderVorhersage && typeof opt.sonderVorhersage === 'object' ? opt.sonderVorhersage : SONDER_STANDARD);
      const st0 = opt.strecke || {};
      this.kz = sv.kleber && R.Kleber && st0.kleber && st0.kleber.length ? R.Kleber.zustand() : null;
      this.az = sv.anlauf && R.Anlauf && ((st0.loopings && st0.loopings.length) || (st0.schanzen && st0.schanzen.length)) ? R.Anlauf.zustand() : null;
      this.fz = sv.flug && R.Schanzen && st0.schanzen && st0.schanzen.length ? R.Schanzen.zustand() : null;
      this.lp = sv.looping && R.Looping && st0.loopings && st0.loopings.length ? R.Looping.zustand() : null;
      this.svAn = !!(this.kz || this.az || this.fz || this.lp);
      if (this.az) R.Anlauf.stellen(opt.strecke);           // Anlauf-Stellen einmal vorab berechnen (Mindest-Anlauf, ein paar ms) – nicht erst mitten im Rennen
      this._korrW = 0;
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
      this.offen.push({ n, s: { gas: s.gas, bremse: s.bremse, lenkung: s.lenkung }, cd: !!ctx.countdown, ziel: !!ctx.imZiel, d: !!ctx.dach });
      if (this.offen.length > 240) this.offen.shift();
      if (!this.sonder) this._rechnen(this.offen[this.offen.length - 1], true);
    }

    /** Ein Schritt wie main.js physikSchritt (nur dieses Auto). live = neuer Schritt (nicht Replay). */
    _rechnen(e, live) {
      const v = this.vp, st = this.strecke, dt = R.config.physik.schritt;
      const kz = this.kz, az = this.az, fz = this.fz, lp = this.lp;
      let s = e.s;
      // v24 (15.10.): Cabrio-Dach wie main.js _dachVorab: Klappzeit herunterzählen, dann die Geste (nur im Stand) → beim Klappen steht das Auto
      const dz = this.dz;
      if (dz) {
        if (dz.rest > 0) { dz.rest -= dt; if (dz.rest <= 1e-9) dz.rest = 0; }
        if (e.d) R.DachRegel.geste(dz, v.vLaengs);
      }
      // v4 (14.10.): von der Polizei angehalten → wie main.js polizei.haltSteuerung (Vorrang vor allem anderen): nur Bremse bis zum Stillstand
      if (this.polizeiRest > 0) s = { gas: 0, bremse: v.vLaengs > 0.3 ? 1 : 0, lenkung: 0 };
      else if (e.ziel) s = { gas: 0, bremse: v.vLaengs > 0.3 ? 0.6 : 0, lenkung: 0 };   // v23: wie main.js (nur bremsen, solange es vorwärts rollt)
      if (dz && dz.rest > 0) s = R.DachRegel.halt(v);                  // v24: Dach klappt → Gas gesperrt, bremsen bis Stand (wie main.js)
      if (e.cd || this.gasSperre) s = { gas: 0, bremse: s.bremse, lenkung: s.lenkung };
      if (kz && R.Kleber.gesperrt(kz)) s = NULL_S;                      // festgeklebt: Eingabe ignorieren (wie main.js)
      if (lp && (lp.aktiv || lp.fallen)) {
        // Looping (oder Zurückfallen): track/looping.js ersetzt vehicle.schritt
        const erg = R.Looping.schritt(lp, v, st, s, dt);
        const n = st.abfrage(v.x, v.z, this.idx);
        this.idx = n.index; v.untergrund = 'strasse'; this.bremst = false;
        this._loopingErgebnis(erg);
      } else if (fz && fz.aktiv) {
        // Flug (Schanze): track/schanze.js ersetzt vehicle.schritt
        R.Schanzen.flugSchritt(fz, v, st, s, dt);
        const n = st.abfrage(v.x, v.z, this.idx);
        this.idx = n.index; this.bremst = false;
      } else this._fahren(s, dt);
      R.Kollisionen.bande(v, st);
      if (this.kollisionen && this._ref) this._autoAuto(e, live);
      if (R.Kollisionen.pflanzen) R.Kollisionen.pflanzen(this._liste, st, { dt, countdown: e.cd });
      if (!v.imLooping) v.y = fz ? R.Schanzen.hoehe(fz, v, st, this.idx) : st.hoeheAn(v.x, v.z, this.idx);
      // Polizei-Anhaltung zählt wie im Server (world/polizei.js schritt) nach jedem Schritt um dt herunter
      if (this.polizeiRest > 0) { this.polizeiRest -= dt; if (this.polizeiRest <= 1e-9) this.polizeiRest = 0; }
    }

    /** Looping-Ergebnis: nach dem Herunterfallen verliert das Auto den Streckenindex (wie main.js _loopingEreignis). */
    _loopingErgebnis(erg) { if (erg === 'gefallen') this.idx = -1; }

    /** Normaler Fahrschritt auf dem Boden (vehicle.schritt) mit Untergrund, Fahrhilfe, Faktoren; danach Anlauf/Kleber/Schanze/Looping-Einfahrt. */
    _fahren(s, dt) {
      const v = this.vp, st = this.strecke, kz = this.kz, az = this.az, fz = this.fz, lp = this.lp;
      const n = st.abfrage(v.x, v.z, this.idx);
      this.idx = n.index;
      v.untergrund = kz ? R.Kleber.untergrund(kz, n.untergrund) : n.untergrund;     // Schonzeit nach dem Lösen: Streifen wie Rand
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
      const xAlt = v.x, zAlt = v.z;
      const dd = v.daten, fvm = this.fk[0], fbe = this.fk[1], turbo = fvm !== 1 || fbe !== 1, vm0 = dd.vMax, b0 = dd.beschleunigung;
      if (turbo) { dd.vMax = vm0 * fvm; dd.beschleunigung = b0 * fbe; }
      v.schritt(dt, s, hilfe, this.umwelt());
      if (turbo) { dd.vMax = vm0; dd.beschleunigung = b0; }
      this.bremst = v.letzteSteuerung.bremse > 0 && v.vLaengs > 0.5;
      // Reihenfolge wie main.js: Anlauf-Bremse, Kleber, Anlauf-Bremslicht, Schanze (Rampe/Absprung), Looping-Einfahrt
      if (az) R.Anlauf.nachSchritt(az, v, st, n, xAlt, zAlt, s, dt);
      if (kz) R.Kleber.nachSchritt(kz, v, st, n, dt);
      if (az && az.bremst && v.vLaengs > 0.5) this.bremst = true;
      if (fz) R.Schanzen.nachSchritt(fz, v, st, n, xAlt, zAlt, dt);
      if (lp) {
        const pt = st.spline.punktBei(n.s), dx = v.x - xAlt, dz = v.z - zAlt;
        this._loopingErgebnis(R.Looping.einfahrt(lp, v, st, n.s, n.s + dx * pt.tx + dz * pt.tz, n.seitenabstand + dx * pt.nx + dz * pt.nz));
      }
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
     * v16: Zustände der Sonderfälle aus ich.sz übernehmen (fehlt ein Teil = Ruhe/Standard). Liefert true, wenn jetzt etwas aktiv ist,
     * das die Vorhersage NICHT selbst rechnet (Server rechnet allein, Anzeige folgt ihm wie in v15): ein abgeschalteter Sonderzustand,
     * oder ein alter Server ohne `sz`. Ohne eingeschaltete Sonderzustände exakt v15 (= ich.so).
     */
    _sonderLaden(ich) {
      if (!this.svAn) return !!ich.so;
      const sz = ich.sz, st = this.strecke;
      let fremd = !!ich.so && !sz;
      const kz = this.kz, az = this.az, fz = this.fz, lp = this.lp;
      if (kz) {
        const k = sz && sz.k;
        kz.zeit = k ? k[0] : 0; kz.klebt = k ? k[1] : 0; kz.frei = k ? k[2] : 0; kz.anzeige = k ? k[3] : 0;
      } else if (sz && sz.k && sz.k[1] > 0) fremd = true;
      if (az) {
        const a = sz && sz.a, l = R.Anlauf.stellen(st);
        az.stelle = a && a[0] >= 0 ? l[a[0]] || null : null; az.bremst = !!(a && a[1]); az.stehZeit = a ? a[2] : 0;
      } else if (sz && sz.a && (sz.a[1] || sz.a[0] >= 0)) fremd = true;
      if (fz) {
        const f = sz && sz.f;
        if (f) {
          fz.aktiv = !!f[0]; fz.rampe = f[1] >= 0 ? R.Schanzen.liste(st)[f[1]] || null : null;
          fz.rampenH = f[2]; fz.vy = f[3]; fz.t = f[4]; fz.y = fz.yVorher = f[5]; fz.nicken = fz.nickenVorher = f[6]; fz.index = f[7] < 0 ? undefined : f[7];
        } else { fz.aktiv = false; fz.rampe = null; fz.rampenH = 0; fz.vy = 0; fz.t = 0; fz.nicken = fz.nickenVorher = 0; }
      } else if (sz && sz.f && (sz.f[0] || sz.f[1] >= 0)) fremd = true;
      if (lp) {
        const l = sz && sz.l;
        if (l) {
          lp.aktiv = !!l[0]; lp.fallen = !!l[1]; lp.looping = st.loopings[l[2]] || null; lp.winkel = l[3]; lp.winkelVorher = l[4];
          lp.v = l[5]; lp.qEin = l[6]; lp.fallZeit = l[7];
          if (!lp.looping) fremd = true;
          else if (lp.fallen) {                                         // Fall-Animation: Startpose der Animation = Looping-Pose beim Absturz (winkel bleibt stehen)
            const w = Math.max(0, Math.min(2 * Math.PI, lp.winkel));
            lp.fallVon = R.Looping.bahn(st, lp.looping, w, R.Looping.autoQ(lp.looping, lp, w));
          }
        } else { lp.aktiv = false; lp.fallen = false; lp.looping = null; lp.winkel = lp.winkelVorher = 0; }
      } else if (sz && sz.l) fremd = true;
      return fremd;
    }

    /**
     * Server-Zustand für den eigenen Wagen (ich = { v, idx, bi, bs, fk, gs, so, sz?, ack }).
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
      this.polizeiRest = ich.ps > 0 ? ich.ps : 0;
      if (this.dz && ich.dz) { const d = ich.dz, z = this.dz; z.ziel = d[0] ? 1 : 0; z.rest = d[1] > 0 ? d[1] : 0; z.nass = !!d[2]; z.uhr = d[3]; z.gesund = d[4]; }   // v24
      // Looping-Anzeigewinkel vor dem Abgleich merken (für den weichen Übergang)
      const lpAlt = this.lp && this.lp.aktiv && !warSonder ? { L: this.lp.looping, w: this.lp.winkel + this.korr.w } : null;
      this.sonder = this._sonderLaden(ich);
      this.hart = false;
      const v = this.vp;
      R.Netz.fahrzeugSchreiben(v, ich.v);
      if (this.svAn) { v.imFlug = !!(this.fz && this.fz.aktiv); v.imLooping = !!(this.lp && (this.lp.aktiv || this.lp.fallen)); }
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
      // Looping: Anzeigewinkel weich angleichen (wie die Position); anderer Looping/neu eingefahren → kein Übergang
      this.korr.w = 0;
      if (lpAlt && this.lp.aktiv && this.lp.looping === lpAlt.L) {
        const dw = lpAlt.w - this.lp.winkel;
        if (Math.abs(dw) * lpAlt.L.radius < R.Netz.HART_KORREKTUR) this.korr.w = dw;
      }
      if (!anzeige) return;
      // neue Basis vs. bisherige Anzeige
      const dx = anzeige.x - v.x, dz = anzeige.z - v.z, dy = anzeige.y - v.y, dh = R.Vehicle.winkelDiff(anzeige.heading, v.heading);
      const fehler = Math.hypot(dx, dz);
      if (this._ersterAbgleich) { this._ersterAbgleich = false; this.korr.x = this.korr.z = this.korr.y = this.korr.h = this.korr.w = 0; this.trenn.x = this.trenn.z = 0; this.hart = true; return; }
      const basisFehler = Math.hypot(dx - this.korr.x, dz - this.korr.z);   // reine Vorhersage-Abweichung (ohne alte Korrektur)
      if (!warSonder) { st.maxFehler = Math.max(st.maxFehler, basisFehler); st.summeFehler += basisFehler; }
      if (fehler > R.Netz.HART_KORREKTUR && !warSonder) {
        this.korr.x = this.korr.z = this.korr.y = this.korr.h = this.korr.w = 0; this.trenn.x = this.trenn.z = 0; this.hart = true; st.hart++;
      } else {
        this.korr.x = dx; this.korr.z = dz; this.korr.y = dy; this.korr.h = dh;
        if (basisFehler > 0.01) st.weich++;
      }
    }

    /** Übergang Server → eigene Anzeige weich machen (Sonderzustand beginnt): korr = alte Anzeige − neue Basis. */
    uebergang(anzeige, basis) {
      this.korr.x = anzeige.x - basis.x; this.korr.z = anzeige.z - basis.z; this.korr.y = anzeige.y - basis.y;
      this.korr.h = R.Vehicle.winkelDiff(anzeige.heading, basis.heading);
      if (Math.hypot(this.korr.x, this.korr.z) > 12) { this.korr.x = this.korr.z = this.korr.y = this.korr.h = this.korr.w = 0; this.hart = true; }
      this.korr.w = 0;
      this.trenn.x = this.trenn.z = 0;         // v28c: die alte Anzeige (inkl. Trenn-Versatz) steckt jetzt in korr
    }

    /**
     * v28c (nur Anzeige): Das eigene Auto wird VORHERGESAGT (Zeit „jetzt + Ping + Warteschlange“), die anderen Autos werden ~0,1 s + Ping
     * HINTER dem Server gezeigt (NetzAnzeige). Schiebt man ein Auto an (Rempeln), stößt die Vorhersage korrekt gegen den Stellvertreter
     * (= wo das andere Auto jetzt ist), auf dem Bildschirm steht das andere Auto aber noch an seiner alten Stelle → das eigene Auto steckt
     * optisch 1–2 m darin (Messung tests/rempeln_netz_messung.js, auch bei 0 ms Ping). Hier wird nur die ANZEIGE fv des eigenen Wagens aus den
     * angezeigten anderen Autos herausgeschoben (kleinste Durchdringung der Rechtecke, kein Impuls, Vorhersage/Server unberührt); der Versatz
     * klingt nach dem Kontakt in tauTrenn ab. Aufruf je Physikschritt NACH anzeigen(fv) und nachdem die anderen Autos ihre Pose haben.
     * @param {object} fv angezeigtes eigenes Fahrzeug (wird verändert)  @param {Array} andere angezeigte Fahrzeuge (nur lesen)
     */
    trennen(fv, andere, dt) {
      const t = this.trenn, K = R.Kollisionen;
      const k = Math.exp(-dt / this.tauTrenn);
      t.x *= k; t.z *= k;
      if (Math.abs(t.x) + Math.abs(t.z) < 1e-4) t.x = t.z = 0;
      const alt = this._trennAlt || (this._trennAlt = new Map());
      if (!K || !K.eindringung || fv.imLooping || fv.imFlug) { t.x = t.z = 0; alt.clear(); return; }
      fv.x += t.x; fv.z += t.z;
      const ich0 = alt.get(fv);
      for (let durch = 0; durch < 2; durch++) {
        let bewegt = false;
        for (const o of andere) {
          if (!o || o === fv || o.imLooping || o.imFlug || Math.abs((o.y || 0) - (fv.y || 0)) >= 2) continue;
          if (Math.abs(o.x - fv.x) > 9 || Math.abs(o.z - fv.z) > 9) continue;
          const e = K.eindringung(fv, o, ich0, alt.get(o));
          if (!e) continue;
          fv.x -= e.nx * e.tief; fv.z -= e.nz * e.tief; t.x -= e.nx * e.tief; t.z -= e.nz * e.tief; bewegt = true;
        }
        if (!bewegt) break;
      }
      if (Math.hypot(t.x, t.z) > TRENN_MAX) { fv.x -= t.x; fv.z -= t.z; t.x = t.z = 0; }   // Teleport/Reset o. Ä.: lieber nichts tun
      // Posen für das nächste Bild merken (Aufprallrichtung)
      const merk = (v) => { let p = alt.get(v); if (!p) alt.set(v, p = {}); p.x = v.x; p.z = v.z; p.h = v.heading; };
      merk(fv);
      for (const o of andere) if (o) merk(o);
    }

    /** Korrektur abklingen lassen (je Schritt). */
    abklingen(dt) {
      const O = R.NetzOptionen || {};
      const k = Math.exp(-dt / (O.abgleich === false ? 0.12 : this.tauKorr)), c = this.korr;
      c.x *= k; c.z *= k; c.y *= k; c.h *= k; c.w *= k;
      if (Math.abs(c.x) + Math.abs(c.z) < 1e-4) { c.x = c.z = c.y = 0; }
      if (Math.abs(c.h) < 1e-5) c.h = 0;
      if (Math.abs(c.w) < 1e-5) c.w = 0;
    }

    /** Anzeige-Fahrzeug = Vorhersage + Korrektur. */
    anzeigen(fv) {
      const v = this.vp, c = this.korr;
      fv.x = v.x + c.x; fv.z = v.z + c.z; fv.y = v.y + c.y; fv.heading = v.heading + c.h;
      fv.vLaengs = v.vLaengs; fv.vQuer = v.vQuer; fv.lenkung = v.lenkung; fv.nicken = v.nicken; fv.neigung = v.neigung;
      fv.untergrund = v.untergrund; fv._anBande = v._anBande; fv.letzteSteuerung = v.letzteSteuerung;
      fv.imLooping = !!v.imLooping; fv.imFlug = !!v.imFlug;
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
    /**
     * v23: wie um(), aber hinter dem neuesten Zustand wird mit den letzten zwei Zuständen WEITERGEFAHREN (Extrapolation, t > 1) – höchstens
     * maxExtra Ticks (Standard 15 = 0,25 s), danach bleibt das Auto stehen (t am Limit). Liefert extra: true, solange extrapoliert wird.
     */
    umE(tick, maxExtra) {
      const l = this.liste, n = l.length;
      if (n >= 2 && tick > l[n - 1].k) {
        const a = l[n - 2], b = l[n - 1], d = b.k - a.k, lim = maxExtra === undefined ? 15 : maxExtra;
        if (d > 0 && d <= 6) return { a, b, t: Math.min(tick - a.k, d + lim) / d, extra: true };
      }
      return this.um(tick);
    }
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

  /**
   * v23: Eingabe-Takt. Wie viele Eingabe-Schritte (Senden + Vorhersage) gehören zu DIESEM Physikschritt?
   * v22b: nach der Wanduhr (soll − n) → 0, 1 oder 2 Schritte je Physikschritt. Die Grafik (main.js frame) nimmt aber genau 1 Schritt je Physikschritt an
   * und interpoliert vorher → jetzt mit alpha → bei 0/2 sprang der eigene Wagen um bis zu einen Schritt (≈ 0,5–1 m bei 30–60 m/s). Jetzt: normal genau 1;
   * mehr nur, wenn Zeit verworfen wurde (langes Bild, Hintergrund) und der Rückstand zur Wanduhr > 3 Schritte ist – dann bis auf 2 aufholen,
   * damit der Server (Echtzeit) nicht ohne Eingabe dasteht.
   */
  class NetzEingabeTakt {
    constructor() { this.t0 = null; }
    reset() { this.t0 = null; }
    /** jetzt in s (performance.now()/1000), S = Schrittdauer, n = bisher gesendete Schritte. */
    anzahl(jetzt, S, n) {
      if (this.t0 === null) this.t0 = jetzt - S;
      let soll = Math.floor((jetzt - this.t0) / S);
      if (soll - n > 120) { this.t0 = jetzt - (n + 1) * S; soll = n + 1; }       // > 2 s: Tab war im Hintergrund
      const rueck = soll - n, O = R.NetzOptionen || {};
      if (O.eins === false) return Math.max(0, Math.min(40, rueck));
      if (rueck > 3) return Math.min(40, rueck - 2);
      if (-rueck > 6) return 0;                                                    // weit voraus (sollte nicht vorkommen): kurz warten
      return 1;
    }
  }

  /**
   * v23: Anzeige der ANDEREN Autos (Menschen, Computer, Streifenwagen) aus dem Zustands-Puffer.
   * v22b: Pose zur Wanduhr-Zeit des Aufrufs (100 ms hinter der Server-Uhr), kein Extrapolieren. Probleme: (1) die Grafik interpoliert je Physikschritt
   * vorher → jetzt mit alpha, nimmt also gleichmäßig verteilte Schritte an – die Wanduhr-Proben liegen aber bei 0/2-Schritt-Bildern ungleichmäßig
   * (zwei Schritte im selben Bild = dieselbe Pose, dann Sprung); (2) bei Zittern/Bursts ist der Puffer leer → Auto bleibt stehen, dann Sprung;
   * (3) die Server-Uhr springt (Fenster-Maximum).
   * Jetzt: schritt(restNach) liefert den Anzeige-Tick: er läuft pro Physikschritt um genau 1 Tick und wird nur sanft (Geschwindigkeit ±4 %/−8 %)
   * zur Server-Uhr minus Verzug (verb.verzug(), adaptiv) nachgeführt; sein Ziel ist die Server-Uhr zum Ende DIESES Schritts (jetzt − Rest im Akkumulator).
   * pose(i, v) interpoliert, hinter dem neuesten Zustand begrenzt extrapoliert, und übernimmt Sprünge (Extrapolations-Fehler, Stoß, Uhr) als weich
   * abklingenden Versatz (τ 0,25 s), damit die gezeigte Bahn keinen Knick bekommt.
   */
  class NetzAnzeige {
    constructor(verb, puffer) { this.verb = verb; this.puffer = puffer; this.neu(); }
    neu() {
      this.tick = null; this._um = null; this.d = null; this.g = [];
      this.stat = { schritte: 0, extra: 0, leer: 0, snaps: 0, maxVerzug: 0, absorbiert: 0 };
    }
    /** Pro Physikschritt aufrufen (vor pose). restNach = Akkumulator-Rest NACH diesem Schritt (s). Rückgabe: Anzeige-Tick (Bruchzahl) oder null. */
    schritt(restNach) {
      const O = R.NetzOptionen || {}, S = R.config.physik.schritt, jetzt = this.verb.serverTick();
      this._um = null;
      if (jetzt === null) { this.tick = null; return null; }
      const dz = this.verb.verzug() / S;
      // Verzug (Ticks): wachsen schnell (bis 4 Ticks je Schritt-Sekunde), schrumpfen langsam (1 Tick/s) – Pufferschutz zuerst
      if (this.d === null || O.adaptiv === false) this.d = dz;
      else if (dz > this.d) this.d = Math.min(dz, this.d + 4 * S); else this.d = Math.max(dz, this.d - 1 * S);
      const st = this.stat;
      st.schritte++;
      if (this.d * S > st.maxVerzug) st.maxVerzug = this.d * S;
      if (O.pll === false) this.tick = jetzt - this.d;                                   // v22b: Wanduhr
      else {
        const ziel = jetzt - Math.max(0, restNach || 0) / S - this.d;
        if (this.tick === null || Math.abs(ziel - this.tick) > 21) {                    // erster Wert / > 0,35 s daneben: springen
          if (this.tick !== null) st.snaps++;
          this.tick = ziel; this.g.length = 0;
        } else this.tick += 1 + Math.max(-0.08, Math.min(0.04, (ziel - this.tick) * 0.02));
      }
      const neuest = this.puffer.neuester;
      if (neuest && this.tick > neuest.k) { st.leer++; if (O.extra !== false) st.extra++; }
      this._um = O.extra === false ? this.puffer.um(this.tick) : this.puffer.umE(this.tick);
      return this.tick;
    }
    /** Die beiden Zustände (+Anteil) des aktuellen Anzeige-Ticks, wie NetzPuffer.um(); null ohne Daten. */
    um() { return this._um; }
    /** Pose von Auto i (Index in zustand.a) in v schreiben. Rückgabe: Looping-Daten wie NetzPuffer.interpolieren oder null. false = keine Daten für dieses Auto. */
    pose(i, v, listeA) {
      const um = this._um;
      if (!um) return false;
      const a0 = (listeA ? um.a[listeA] : um.a.a)[i], a1 = (listeA ? um.b[listeA] : um.b.a)[i];
      if (!a0 || !a1) return false;
      const lp = R.NetzPuffer.interpolieren(a0, a1, um.t, v);
      const O = R.NetzOptionen || {};
      if (O.glatt !== false) this._glatten((listeA ? listeA : 'a') + i, v);
      return lp || null;
    }
    _glatten(id, v) {
      const S = R.config.physik.schritt;
      let g = this.g[id];
      if (!g) { g = this.g[id] = { n: 0, sx: 0, sz: 0, sy: 0, sh: 0, dx: 0, dz: 0, dh: 0, ox: 0, oz: 0, oy: 0, oh: 0 }; }
      const k = Math.exp(-S / 0.25);
      if (g.n >= 2) {
        const jx = v.x - (g.sx + g.dx), jz = v.z - (g.sz + g.dz), jump = Math.hypot(jx, jz);
        const jh = R.Vehicle.winkelDiff(v.heading, g.sh + g.dh);
        if (jump > 4 || Math.abs(jh) > 2) { g.ox = g.oz = g.oy = g.oh = 0; }            // Reset/Teleport/Looping-Wechsel: nicht verschmieren
        else {
          if (jump > 0.08) { g.ox -= jx; g.oz -= jz; this.stat.absorbiert++; }
          if (Math.abs(jh) > 0.05) g.oh -= jh;
        }
      }
      if (g.n >= 1) { g.dx = v.x - g.sx; g.dz = v.z - g.sz; g.dh = R.Vehicle.winkelDiff(v.heading, g.sh); }
      g.sx = v.x; g.sz = v.z; g.sy = v.y; g.sh = v.heading; g.n++;
      g.ox *= k; g.oz *= k; g.oh *= k;
      v.x += g.ox; v.z += g.oz; v.heading += g.oh;
    }
  }

  R.NetzVorhersage = NetzVorhersage;
  R.NetzEingabeTakt = NetzEingabeTakt;
  R.NetzAnzeige = NetzAnzeige;
  R.NetzPuffer = NetzPuffer;
  R.NetzPuffer.interpolieren = interpolieren;
})();
