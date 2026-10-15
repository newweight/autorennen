// ============================================================
// Runde 5b: Polizei (Einstellung `polizei`, Standard aus; config.polizei)
//
// 1 Streifenwagen (2 ab 6 Gegnern) startet 60 m hinter dem Feld und fährt mit eigenem R.Driver (Stufe 'meister',
// ohne Gummiband). Er nimmt NICHT am Rennen teil: eigener Eintrag in spiel.fahrzeuge (hinter allen Teilnehmern,
// f.polizei = true), nicht in RaceManager/Platzierung/Ergebnis. Kollisionen Auto↔Polizei normal (autoAuto),
// Schaden bekommt er keinen (Schaden kennt nur die Teilnehmer-Indizes).
//
// Ablauf (PolizeiLogik, ohne Three.js – Node-Test tests/test_polizei.js):
//   Ziel = nächster Spieler vor ihm (Bogenlänge); ist kein Spieler in kiRadius (300 m) voraus, nimmt er die nächste KI
//   (damit es fair wirkt). Nicht wählbar: im Ziel, angehalten, in der Schonfrist, in dieser Runde schon angehalten.
//   Ist er ≥ naheZeit (1,5 s) am Stück mit Karosserie-Abstand ≤ naheAbstand (6 m, Kapsel zu Kapsel) neben/hinter dem
//   Ziel, wird es angehalten: stoppDauer (4 s, bis v14: 10 s) gesperrt (Steuerung = Bremse), der Streifenwagen stellt sich daneben.
//   14.10. (v20) „Immer NEBEN dem Auto“: Parkpose = parallel (gleiche Fahrtrichtung), seitlicher Karosserie-Abstand nebenLuecke (0,8 m),
//   versatzVor (0,4 m) leicht vor der Ziel-Mitte. Seite (parkSeiteWaehlen): die mit mehr Platz auf der Fahrbahn (also meist zur
//   Fahrbahnmitte), nicht über den Fahrbahnrand/Bande hinaus, nicht in ein anderes Auto; bei Gleichstand die Seite, auf der er schon fährt.
//   Fahren: parkSteuerung (Tempo des Ziels angleichen, seitlich einschwenken); ist er nah genug (einparken: ≤ 5 m längs, ≤ 3 m quer),
//   gleitet er in ~0,5 s weich auf die Parkpose (Position, Richtung, Geschwindigkeit des Ziels) – kein Teleport. Freigabe: normales Weiterfahren.
//   Danach „Weiterfahren!", schonfrist (30 s) für dieses Auto, neues Ziel. Hat das Ziel einen Schild, platzt nur der
//   Schild (kein Stopp). Je Auto höchstens 1 Anhaltung pro Runde. Im Looping/Flug/liegengeblieben/festgeklebt: kein Stopp.
//
// Schnittstelle für main.js (Klasse Polizei):
//   new R.Polizei(spiel)           einsetzen(strecke, teilnehmerAnzahl, gegner) → legt die Streifenwagen an
//   gesperrt(i) / haltSteuerung(v) angehaltenes Auto: nur Bremse
//   steuerung(i, dt, rennen)       Steuerung eines Streifenwagens (Jagd mit R.Driver bzw. Parken neben dem Ziel)
//   andereFuer(tn)                 Teilnehmer + Streifenwagen (KI weicht auch der Polizei aus)
//   schritt(dt, laeuft)            Logik je Physikschritt (Meldungen, Ton, Schild)
//   animieren(zeit)                Blaulicht 4 Hz blau/rot (emissive Lampen); das Licht dazu kommt aus dem festen Licht-Pool (v26c, blaulichtQuellen)
//   ton(stumm)                     Sirene (Lautstärke nach Abstand zum nächsten Spieler)
//   anzeige(i) / minimapPunkte()   für das HUD
//   vorkompilieren(renderer, szene, kamera)  v26c: leer (Lichtzahl bleibt konstant, Main._vorwaermen übersetzt alles)
//   zerstoeren()                   Lichter, eigene Geometrien/Materialien, Sirene
// ============================================================
(function () {
  const R = window.Rennspiel;

  const STANDARD = {
    anzahl: 1, anzahlViele: 2, vieleAb: 6, startHinter: 60, naheAbstand: 6, naheZeit: 1.5, vorZiel: 1, stoppDauer: 4, freikaufKosten: 10, freikaufFenster: 0.5,
    schonfrist: 30, kiRadius: 300, zielWahl: 1, folgeAbstand: 8, nebenLuecke: 0.8, versatzVor: 0.4, einparkRate: 5, blinkHz: 4, lichtAbstand: 40,
    lichtStaerke: 30, lichtReichweite: 14, sireneHoerweite: 120, schwierigkeit: 'meister', autoId: 'polizei',
  };
  function cfg() { return Object.assign({}, STANDARD, (R.config && R.config.polizei) || {}); }
  const klemme = (x, a, b) => (x < a ? a : x > b ? b : x);
  function winkelNorm(w) { if (w !== w) return w; if (!(Math.abs(w) < 1e3)) w = Number.isFinite(w) ? w % (2 * Math.PI) : 0; while (w > Math.PI) w -= 2 * Math.PI; while (w < -Math.PI) w += 2 * Math.PI; return w; }   // v26b: Obergrenze gegen Infinity/riesige Werte

  /** Kürzester Abstand zweier Strecken p1–q1 und p2–q2 (2D, x/z). */
  function segAbstand(ax, az, bx, bz, cx, cz, dx, dz) {
    const ux = bx - ax, uz = bz - az, vx = dx - cx, vz = dz - cz, wx = ax - cx, wz = az - cz;
    const a = ux * ux + uz * uz, b = ux * vx + uz * vz, c = vx * vx + vz * vz, d = ux * wx + uz * wz, e = vx * wx + vz * wz;
    const N = a * c - b * b;
    let s, t;
    if (a < 1e-9 && c < 1e-9) { s = 0; t = 0; }
    else if (a < 1e-9) { s = 0; t = klemme(e / c, 0, 1); }
    else if (c < 1e-9) { t = 0; s = klemme(-d / a, 0, 1); }
    else {
      s = N > 1e-9 ? klemme((b * e - c * d) / N, 0, 1) : 0;
      t = (b * s + e) / c;
      if (t < 0) { t = 0; s = klemme(-d / a, 0, 1); } else if (t > 1) { t = 1; s = klemme((b - d) / a, 0, 1); }
    }
    const px = ax + ux * s - (cx + vx * t), pz = az + uz * s - (cz + vz * t);
    return Math.sqrt(px * px + pz * pz);
  }

  /**
   * Karosserie-Abstand zweier Autos { x, z, heading, laenge, breite } als Kapseln (Mittel-Strecke ± (L/2 − B/2), Radius B/2).
   * 0 = berühren sich.
   */
  function kapselAbstand(a, b) {
    const ha = Math.max(0, (a.laenge || 4.5) / 2 - (a.breite || 1.8) / 2), hb = Math.max(0, (b.laenge || 4.5) / 2 - (b.breite || 1.8) / 2);
    const ax = -Math.sin(a.heading), az = -Math.cos(a.heading), bx = -Math.sin(b.heading), bz = -Math.cos(b.heading);
    const d = segAbstand(a.x - ax * ha, a.z - az * ha, a.x + ax * ha, a.z + az * ha, b.x - bx * hb, b.z - bz * hb, b.x + bx * hb, b.z + bz * hb);
    return Math.max(0, d - (a.breite || 1.8) / 2 - (b.breite || 1.8) / 2);
  }

  /** Bogenlängen-Abstand von s0 nach s1 vorwärts (−10 … L − 10): leicht dahinter zählt noch als „vor ihm". */
  function vorAbstand(s0, s1, L) {
    if (!(L > 0)) return s1 - s0;
    let d = (s1 - s0 + 10) % L; if (d < 0) d += L;
    return d - 10;
  }

  // ------------------------------------------------------------
  // Logik (rein, ohne Three.js)
  // ------------------------------------------------------------
  class PolizeiLogik {
    constructor(opt) {
      this.c = Object.assign(cfg(), opt || {});
      this.zeit = 0;
      this.autos = [];       // je Auto-Index: { stopp (s Rest), stoppK, schonBis, runde (der letzten Anhaltung), anzahl }
      this.streifen = [];    // je Streifenwagen: { ziel, phase 'jagd'|'halt', nahe (s), wahlRest, anhaltungen }
    }

    _a(i) { return this.autos[i] || (this.autos[i] = { stopp: 0, stoppK: -1, schonBis: -Infinity, runde: -1, anzahl: 0 }); }
    _s(k) { return this.streifen[k] || (this.streifen[k] = { ziel: -1, phase: 'jagd', nahe: 0, wahlRest: 0, anhaltungen: 0 }); }

    /** Auto i ist gerade angehalten. */
    gesperrt(i) { const a = this.autos[i]; return !!a && a.stopp > 0; }
    /** Restzeit der Anhaltung (s). */
    rest(i) { const a = this.autos[i]; return a ? Math.max(0, a.stopp) : 0; }
    zielVon(k) { const s = this.streifen[k]; return s ? s.ziel : -1; }

    /**
     * 14.10. (v22) Freikaufen: beendet die Anhaltung von Auto i beim nächsten schritt() (Ereignis 'weiter' mit gekauft: true,
     * Schonfrist wie bei normalem Ende). Das Bezahlen macht der Aufrufer (main.js). → true, wenn Auto i angehalten war.
     */
    freikaufen(i) {
      const a = this.autos[i];
      if (!a || !(a.stopp > 0)) return false;
      a.stopp = 1e-12; a.gekauft = true;
      return true;
    }

    /** Darf Auto i (Daten z) Ziel von Streifenwagen k sein? */
    waehlbar(i, z, k) {
      if (!z || z.imZiel) return false;
      const a = this._a(i);
      if (a.stopp > 0) return false;
      if (this.zeit < a.schonBis) return false;
      if (a.runde >= 0 && a.runde === z.runde) return false;     // max. 1 Anhaltung je Runde
      return true;
    }

    /**
     * Ziel für Streifenwagen k: nächster Spieler vor ihm; kein Spieler in kiRadius voraus → nächste KI in kiRadius;
     * sonst trotzdem der nächste Spieler (bzw. KI). Autos, die ein anderer Streifenwagen jagt, nur als letzte Wahl.
     */
    waehlen(k, autos, p, L) {
      const c = this.c;
      let besterSp = -1, dSp = Infinity, besterKi = -1, dKi = Infinity, ersatz = -1, dErsatz = Infinity;
      for (let i = 0; i < autos.length; i++) {
        const z = autos[i];
        if (!this.waehlbar(i, z, k)) continue;
        const d = vorAbstand(p.s, z.s, L);
        let belegt = false;
        for (let j = 0; j < this.streifen.length; j++) if (j !== k && this.streifen[j] && this.streifen[j].ziel === i) belegt = true;
        if (belegt) { if (d < dErsatz) { dErsatz = d; ersatz = i; } continue; }
        if (z.istSpieler) { if (d < dSp) { dSp = d; besterSp = i; } }
        else if (d < dKi) { dKi = d; besterKi = i; }
      }
      if (besterSp >= 0 && dSp <= c.kiRadius) return besterSp;
      if (besterKi >= 0 && dKi <= c.kiRadius) return besterKi;
      if (besterSp >= 0) return besterSp;
      if (besterKi >= 0) return besterKi;
      return ersatz;
    }

    /** Ist Streifenwagen p nah genug neben/hinter dem Ziel z? */
    nah(p, z) {
      const c = this.c;
      if (kapselAbstand(p, z) > c.naheAbstand) return false;
      const rx = -Math.sin(z.heading), rz = -Math.cos(z.heading);
      const vor = (p.x - z.x) * rx + (p.z - z.z) * rz;              // > 0: Streifenwagen-Mitte vor der Ziel-Mitte
      return vor <= (z.laenge || 4.5) / 2 + c.vorZiel;
    }

    /**
     * Ein Physikschritt.
     * @param {number} dt
     * @param {Array} autos   je Teilnehmer: { x, z, heading, laenge, breite, s, runde, istSpieler, imZiel, frei, schild }
     * @param {Array} streifen je Streifenwagen: { x, z, heading, laenge, breite, s }
     * @param {number} L Streckenlänge
     * @returns {{art:'ziel'|'anhalten'|'weiter'|'schild', nr:number, k:number}[]}
     */
    schritt(dt, autos, streifen, L) {
      const c = this.c, ev = [];
      this.zeit += dt;
      // 1) laufende Anhaltungen
      for (let i = 0; i < this.autos.length; i++) {
        const a = this.autos[i];
        if (!a || !(a.stopp > 0)) continue;
        a.stopp -= dt;
        if (a.stopp <= 1e-9) {
          a.stopp = 0;
          a.schonBis = this.zeit + c.schonfrist;
          const s = this._s(a.stoppK);
          s.phase = 'jagd'; s.ziel = -1; s.nahe = 0; s.wahlRest = 0;
          ev.push({ art: 'weiter', nr: i, k: a.stoppK, gekauft: !!a.gekauft });
          a.gekauft = false;
        }
      }
      // 2) je Streifenwagen: Ziel wählen, Nähe messen, anhalten
      for (let k = 0; k < streifen.length; k++) {
        const st = this._s(k), p = streifen[k];
        if (st.phase === 'halt') continue;
        st.wahlRest -= dt;
        if (st.ziel >= 0 && !this.waehlbar(st.ziel, autos[st.ziel], k)) { st.ziel = -1; st.nahe = 0; }
        if (st.wahlRest <= 0 || st.ziel < 0) {
          const neu = this.waehlen(k, autos, p, L);
          if (neu !== st.ziel) { st.nahe = 0; if (neu >= 0) ev.push({ art: 'ziel', nr: neu, k }); }
          st.ziel = neu; st.wahlRest = c.zielWahl;
        }
        if (st.ziel < 0) continue;
        const z = autos[st.ziel];
        if (this.nah(p, z)) st.nahe += dt; else st.nahe = 0;
        if (st.nahe >= c.naheZeit - 1e-9 && z.frei !== false) {
          st.nahe = 0;
          if (z.schild) { ev.push({ art: 'schild', nr: st.ziel, k }); continue; }
          const a = this._a(st.ziel);
          a.stopp = c.stoppDauer; a.stoppK = k; a.runde = z.runde; a.anzahl++;
          st.phase = 'halt'; st.anhaltungen++;
          ev.push({ art: 'anhalten', nr: st.ziel, k });
        }
      }
      return ev;
    }
  }

  // ------------------------------------------------------------
  // Fahren (rein): neben dem angehaltenen Auto parken
  // ------------------------------------------------------------
  /** Seitlicher Mitten-Abstand Streifenwagen–Ziel: halbe Breiten + Lücke zwischen den Karosserien. */
  function parkAbstand(z, pBreite, c) { return (z.breite || 1.8) / 2 + (c ? c.nebenLuecke : 0.8) + (pBreite || 1.83) / 2; }

  /** Parkpose neben dem Ziel z (parallel): seite +1 = rechts, −1 = links vom Ziel; D = Mitten-Abstand quer, vor = m vor der Ziel-Mitte. */
  function parkPose(z, seite, D, vor) {
    const fx = -Math.sin(z.heading), fz = -Math.cos(z.heading), qx = Math.cos(z.heading), qz = -Math.sin(z.heading);
    return { x: z.x + qx * seite * D + fx * vor, z: z.z + qz * seite * D + fz * vor, heading: z.heading };
  }

  /** Lage von Punkt (x, z) im Rahmen des Ziels: längs (vor = +) und quer (rechts = +). */
  function imZielRahmen(z, x, zz) {
    const fx = -Math.sin(z.heading), fz = -Math.cos(z.heading), qx = Math.cos(z.heading), qz = -Math.sin(z.heading);
    return { laengs: (x - z.x) * fx + (zz - z.z) * fz, quer: (x - z.x) * qx + (zz - z.z) * qz };
  }

  /**
   * Steuerung zur Parkpose neben dem Ziel. v = Vehicle des Streifenwagens, z = Vehicle (oder { x, z, heading }) des Ziels,
   * seite = +1 rechts / −1 links vom Ziel, D = Mitten-Abstand quer, vor = Versatz nach vorn. Er gleicht das Tempo des Ziels an
   * (auch beim Abbremsen), schwenkt erst kurz vorher seitlich ein und bleibt dann mit dem Ziel stehen.
   */
  function parkSteuerung(v, z, seite, D, vor) {
    vor = vor === undefined ? 0.4 : vor;
    const p = parkPose(z, seite, D, vor), r = imZielRahmen(z, p.x, p.z), a = imZielRahmen(z, v.x, v.z);
    const eA = r.laengs - a.laengs, eL = r.quer - a.quer;                   // + = Streifenwagen muss nach vorn / nach rechts
    const vT = z.vLaengs || 0;
    const halt = { gas: 0, bremse: v.vLaengs > 0.3 ? 1 : 0, lenkung: 0 };
    // Tempo: Tempo des Ziels + Aufholen (weit hinten) bzw. darunter (zu weit vorn)
    let vSoll = eA > 0 ? vT + Math.min(18, eA * 1.4) : Math.max(0, vT + eA * 1.0);
    if (Math.abs(vT) < 0.5 && eA > 0) vSoll = Math.min(vSoll, 0.5 + eA * 1.2);       // Ziel steht: sanft heranrollen
    if (eA < -3 && Math.abs(vT) < 0.5) return halt;                                    // weit vor dem Parkpunkt, Ziel steht: stehen bleiben
    // Richtung: auf der Ziel-Spur heranfahren, erst die letzten Meter seitlich einschwenken
    const wicht = eA > 0 ? klemme((16 - eA) / 10, 0.15, 1) : 1;
    const wunsch = z.heading - klemme(eL * 0.3, -0.5, 0.5) * wicht;
    const diff = winkelNorm(wunsch - v.heading);
    const lenkung = klemme(-diff * 2.5, -1, 1);                                        // links negativ, heading wächst nach links
    const e = vSoll - v.vLaengs;
    if (e > 0) return { gas: klemme(e / 2, 0.15, 1), bremse: 0, lenkung };
    return { gas: 0, bremse: e < -1 && v.vLaengs > 0.3 ? klemme(-e / 4, 0.2, 1) : 0, lenkung };
  }

  /**
   * Weiches Einparken: ist der Streifenwagen v nah an der Parkpose (≤ 5 m längs, ≤ 3 m quer, Richtung ≤ 35° daneben), gleiten Position,
   * Richtung und Geschwindigkeit mit Zeitkonstante 1/rate (s) auf Parkpose und Tempo des Ziels. Rückgabe: Restfehler { laengs, quer, winkel }
   * oder null (noch zu weit weg → nur fahren). Mit z.weltGeschwindigkeit() (Vehicle) folgt er dem Tempo des Ziels.
   */
  function einparken(v, z, seite, D, vor, dt, rate) {
    const p = parkPose(z, seite, D, vor), r = imZielRahmen(z, p.x, p.z), a = imZielRahmen(z, v.x, v.z);
    const eA = r.laengs - a.laengs, eL = r.quer - a.quer, dw = winkelNorm(z.heading - v.heading);
    if (Math.abs(eA) > 5 || Math.abs(eL) > 3 || Math.abs(dw) > 0.6) return null;
    const b = 1 - Math.exp(-(rate || 5) * dt);
    v.x += (p.x - v.x) * b; v.z += (p.z - v.z) * b;
    v.heading += dw * b;
    const w = z.weltGeschwindigkeit ? z.weltGeschwindigkeit() : { x: 0, z: 0 };
    const u = v.weltGeschwindigkeit ? v.weltGeschwindigkeit() : { x: 0, z: 0 };
    if (v.weltGeschwindigkeitSetzen) v.weltGeschwindigkeitSetzen(u.x + (w.x - u.x) * b, u.z + (w.z - u.z) * b);
    return { laengs: eA * (1 - b), quer: eL * (1 - b), winkel: dw * (1 - b) };
  }

  /**
   * Seite für den Streifenwagen neben dem Ziel wählen: +1 rechts / −1 links vom Ziel. Gewertet wird der Platz auf der Fahrbahn
   * (Fahrbahnhälfte − Abstand der äußersten Karosserie-Ecke von der Mitte, an allen 4 Ecken), ein Auto in der Parklücke zählt −4 (knapp daneben −1),
   * die bisherige Seite +1,5 (kein Hin-und-her, kein Queren durch den Verkehr). strecke braucht abfrage(x, z) oder spline.naechster und breiteBei(s) / breite.
   * @param z      Ziel { x, z, heading, laenge, breite }
   * @param p      Streifenwagen { laenge, breite }
   * @param andere weitere Autos [{ x, z, heading, laenge, breite }] (ohne Ziel und Streifenwagen)
   * @returns {{seite:number, platz:number, platzAndere:number}} platz = Rand-Reserve der gewählten Seite (m, < 0 = ragt über den Rand)
   */
  function parkSeiteWaehlen(strecke, z, p, andere, bisher, c) {
    const pL = p.laenge || 4.88, pB = p.breite || 1.83, D = parkAbstand(z, pB, c), vor = c ? c.versatzVor : 0.4;
    const platzFuer = (pose) => {
      let min = Infinity;
      const fx = -Math.sin(pose.heading), fz = -Math.cos(pose.heading), qx = Math.cos(pose.heading), qz = -Math.sin(pose.heading);
      for (const la of [-pL / 2, pL / 2]) for (const qa of [-pB / 2, pB / 2]) {
        const x = pose.x + fx * la + qx * qa, zz = pose.z + fz * la + qz * qa;
        let n = null;
        if (strecke && strecke.abfrage) n = strecke.abfrage(x, zz); else if (strecke && strecke.spline) n = strecke.spline.naechster(x, zz);
        if (!n) continue;
        const halb = (strecke.breiteBei ? strecke.breiteBei(n.s) : strecke.breite || 12) / 2;
        min = Math.min(min, halb - Math.abs(n.seitenabstand));
      }
      return min === Infinity ? 99 : min;
    };
    let best = null;
    for (const seite of [1, -1]) {
      const pose = parkPose(z, seite, D, vor), platz = platzFuer(pose);
      let pen = 0;
      const o = { x: pose.x, z: pose.z, heading: pose.heading, laenge: pL, breite: pB };
      for (const g of andere || []) { const d = kapselAbstand(o, g); if (d < 0.3) pen -= 4; else if (d < 0.8) pen -= 1; }
      const wert = Math.min(platz, 3) + pen + (seite === bisher && platz >= 0 ? 1.5 : 0);   // Bonus nur, wenn die Seite auf die Fahrbahn passt
      if (!best || wert > best.wert) best = { seite, platz, platzAndere: pen, wert };
    }
    return best;
  }

  // ------------------------------------------------------------
  // Glue für main.js (Fahrzeuge, Optik, Ton, HUD)
  // ------------------------------------------------------------
  class Polizei {
    constructor(spiel) {
      this.spiel = spiel;
      this.c = cfg();
      this.logik = new PolizeiLogik(this.c);
      this.idx = [];              // Fahrzeug-Indizes der Streifenwagen
      this.n = 0;                 // Anzahl Teilnehmer (Indizes 0..n-1)
      this.seite = [];            // Park-Seite je Streifenwagen
      this.blauLokal = [];        // v26c: je Streifenwagen [[x,y,z],[x,y,z]] Lage der zwei Blaulicht-Quellen am Auto (das Licht selbst kommt aus dem festen Licht-Pool, src/world/lichtPool.js)
      this._farben = [0x2a5cff, 0xff2a2a];
      this.lampen = [];           // je Streifenwagen [meshL, meshR]
      this._eigen = [];           // eigene Geometrien/Materialien (dispose)
      this._andere = [];
      this._autos = []; this._streifen = [];
      this.statistik = { anhaltungen: [], schild: 0, freigaben: 0 };
      this._phase = -1;
    }

    /** Anzahl Streifenwagen für so viele Gegner. */
    static anzahl(gegner) { const c = cfg(); return gegner >= c.vieleAb ? c.anzahlViele : c.anzahl; }

    /** Katalog-Eintrag 'polizei' oder Ersatz: Passat in Weiß (eigener Blaulichtbalken). */
    static autoDaten() {
      const kat = R.carCatalog || [], c = cfg();
      const p = kat.find(a => a.id === c.autoId);
      if (p) return p;
      const basis = kat.find(a => a.id === 'passat') || kat[0];
      return Object.assign({}, basis, { id: 'polizei-ersatz', name: 'Polizei', farbe: 0xf3f4f6, farbeName: 'Weiß', ersatz: true });
    }

    /** Streifenwagen anlegen: startHinter m hinter dem letzten Startplatz (2 Wagen: versetzt links/rechts). */
    einsetzen(strecke, teilnehmerAnzahl, gegner) {
      const sp = this.spiel, c = this.c, n = Polizei.anzahl(gegner), auto = Polizei.autoDaten();
      this.n = teilnehmerAnzahl;
      const letzter = Math.max(0, teilnehmerAnzahl - 1);
      const hinter = 8 + Math.floor(letzter / 2) * 9 + (letzter % 2 ? 4.5 : 0);
      for (let k = 0; k < n; k++) {
        const p = strecke.spline.punktBei(-(hinter + c.startHinter + k * 10));
        const q = n > 1 ? (k ? -2.5 : 2.5) : 0;
        const f = sp.fahrzeugHinzufuegen(auto, p.x + p.nx * q, p.z + p.nz * q, R.headingAus(p.tx, p.tz));
        f.vehicle.y = strecke.hoeheAn(f.vehicle.x, f.vehicle.z);
        if (sp._vorherAngleichen) sp._vorherAngleichen(f);
        f.polizei = true; f.istSpieler = false; f.spielerNr = -1;
        f.fahrhilfe = 'aus'; f.index = -1; f.stehZeit = 0; f.resetHinweis = false; f.falschHerum = false; f.falschZeit = 0;
        f.polizeiFahrer = new R.Driver(f.vehicle, strecke, { schwierigkeit: c.schwierigkeit, seed: 9100 + k * 31, name: 'Polizei' });
        if (f.polizeiFahrer.hindernisseSetzen) f.polizeiFahrer.hindernisseSetzen(strecke.hindernisse);
        f.polizeiFahrer.gummiband = 0; f.polizeiFahrer.gummibandHinten = 0;
        f.polizeiBasis = f.polizeiFahrer.versatzBasis;
        this.idx.push(sp.fahrzeuge.indexOf(f));
        this.seite.push(1);
        this._optikVorbereiten(f, k);
      }
      this.rennListe = sp.fahrzeuge.slice(0, this.n);      // Teilnehmer ohne Polizei (Pickups)
      return this.idx.slice();
    }

    /** Teilnehmer + Streifenwagen als „andere" für die KI (die KI liest nur .vehicle). */
    andereFuer(tn) {
      const a = this._andere; a.length = 0;
      for (let i = 0; i < tn.length; i++) a.push(tn[i]);
      const fz = this.spiel.fahrzeuge;
      for (let k = 0; k < this.idx.length; k++) { const f = fz[this.idx[k]]; if (f) a.push(f._polizeiAndere || (f._polizeiAndere = { vehicle: f.vehicle, istSpieler: false, polizei: true })); }
      return a;
    }

    gesperrt(i) { return i < this.n && this.logik.gesperrt(i); }

    /** Angehaltenes Auto: bremsen bis zum Stillstand, dann stehen (Bremse im Stand würde rückwärts fahren). */
    haltSteuerung(v) { return { gas: 0, bremse: v.vLaengs > 0.3 ? 1 : 0, lenkung: 0 }; }

    /** Steuerung des Streifenwagens an Fahrzeug-Index i. */
    steuerung(i, dt, rennen) {
      const fz = this.spiel.fahrzeuge, f = fz[i], k = this.idx.indexOf(i), v = f.vehicle, d = f.polizeiFahrer, c = this.c;
      const st = this.logik._s(k), ziel = st.ziel >= 0 ? fz[st.ziel] : null;
      if (st.phase === 'halt' && ziel) return parkSteuerung(v, ziel.vehicle, this.seite[k], this._parkD(ziel, f), c.versatzVor);
      // Jagd: ist das Ziel ≤ 60 m voraus, langsam auf seine Spur einschwenken (fährt dann hinter ihm her)
      const L = this.spiel.strecke.spline.laenge;
      let dS = Infinity;
      if (ziel && f.nah && ziel.nah) {
        dS = vorAbstand(f.nah.s, ziel.nah.s, L);
        const q = dS < 60 ? klemme(ziel.nah.seitenabstand, -3, 3) : f.polizeiBasis;
        d.versatzBasis += (q - d.versatzBasis) * Math.min(1, dt * 2);
      } else d.versatzBasis += (f.polizeiBasis - d.versatzBasis) * Math.min(1, dt * 2);
      const u = this._u || (this._u = {});
      u.andere = this.andereFuer(rennen ? rennen.teilnehmer : []); u.spielerFortschrittMax = null; u.eigenerFortschritt = 0;
      u.laeuft = rennen ? rennen.gasErlaubt : true;
      let s = d.steuerung(dt, u);
      if (d.brauchtReset) { this._zuruecksetzen(i); return { gas: 0, bremse: 0, lenkung: 0 }; }
      // dicht hinter dem Ziel: Tempo angleichen statt rammen
      if (ziel && dS > -2 && dS < c.folgeAbstand && !this.logik.gesperrt(st.ziel)) {
        const zv = ziel.vehicle.vLaengs;
        if (v.vLaengs > zv + 0.5) s = { gas: 0, bremse: klemme((v.vLaengs - zv) / 6, 0.1, 1), lenkung: s.lenkung };
      }
      return s;
    }

    /** Seitlicher Mitten-Abstand Streifenwagen f ↔ Ziel (Fahrzeug-Eintrag). */
    _parkD(ziel, f) { return parkAbstand({ breite: ziel.vehicle.daten.breite || 1.8 }, f.vehicle.daten.breite || 1.83, this.c); }

    /** Streifenwagen festgefahren: 10 m zurück auf die Straßenmitte (freie Stelle). */
    _zuruecksetzen(i) {
      const sp = this.spiel, f = sp.fahrzeuge[i], st = sp.strecke, spl = st.spline;
      const n = spl.naechster(f.vehicle.x, f.vehicle.z, f.index >= 0 ? f.index : undefined);   // W4-I: eigene Ebene
      let pose = null;
      for (let k = 1; k <= 12 && !pose; k++) {
        const p = spl.punktBei(n.s - 10 * k), x = p.x, z = p.z;
        if (sp.fahrzeuge.every((g, j) => j === i || Math.hypot(g.vehicle.x - x, g.vehicle.z - z) >= 6) || k === 12) pose = { x, z, heading: R.headingAus(p.tx, p.tz), s: p.s };
      }
      if (f.looping && (f.looping.aktiv || f.looping.fallen)) { f.looping.aktiv = false; f.looping.fallen = false; f.vehicle.imLooping = false; }
      if (f.flug && R.Schanzen) R.Schanzen.abbrechen(f.flug, f.vehicle);
      if (f.kleber && R.Kleber) { R.Kleber.abbrechen(f.kleber); R.Kleber.optik(f, false); }
      if (f.anlauf && R.Anlauf) f.anlauf = R.Anlauf.zustand();
      f.vehicle.setzen(pose.x, pose.z, pose.heading);
      const idx = spl.indexBei(pose.s);                 // W4-I: Index-Kontinuität (Überführung)
      f.vehicle.y = st.hoeheAn(pose.x, pose.z, idx);
      if (sp._vorherAngleichen) sp._vorherAngleichen(f);
      f.index = idx; f.stehZeit = 0;
      f.netReset = (f.netReset || 0) + 1;      // v21: online springen die Clients dann statt zu interpolieren
      f.polizeiFahrer.zurueckgesetzt(idx);
    }

    /** Daten eines Fahrzeugs für die Logik (wiederverwendetes Objekt). */
    _daten(f, ziel, i) {
      const v = f.vehicle, o = ziel || {};
      o.x = v.x; o.z = v.z; o.heading = v.heading; o.laenge = v.daten.laenge || 4.5; o.breite = v.daten.breite || 1.8;
      o.s = f.nah ? f.nah.s : this.spiel.strecke.spline.naechster(v.x, v.z, f.index >= 0 ? f.index : undefined).s;
      return o;
    }

    /** Logik je Physikschritt (nach den Kollisionen). laeuft = Rennen freigegeben (Countdown: nichts). */
    schritt(dt, laeuft) {
      if (!laeuft) return [];
      const sp = this.spiel, fz = sp.fahrzeuge, r = sp.rennen, tn = r ? r.teilnehmer : [];
      const pk = sp.pickups, sch = sp.schaden && sp.schaden.an ? sp.schaden : null;
      const autos = this._autos; autos.length = this.n;
      for (let i = 0; i < this.n; i++) {
        const f = fz[i], t = tn[i], o = this._daten(f, autos[i], i);
        autos[i] = o;
        o.runde = t ? t.runde : 0; o.istSpieler = !!f.istSpieler; o.imZiel = !!(t && t.imZiel);
        o.frei = !(f.vehicle.imLooping || f.vehicle.imFlug || (f.looping && (f.looping.aktiv || f.looping.fallen)) || (f.flug && f.flug.aktiv) ||
          (sch && sch.gesperrt(i)) || (f.kleber && R.Kleber && R.Kleber.gesperrt(f.kleber)));
        o.schild = !!(pk && pk.hatSchild(i));
      }
      const streifen = this._streifen; streifen.length = this.idx.length;
      for (let k = 0; k < this.idx.length; k++) streifen[k] = this._daten(fz[this.idx[k]], streifen[k]);
      const ev = this.logik.schritt(dt, autos, streifen, sp.strecke.spline.laenge);
      for (let e = 0; e < ev.length; e++) this._ereignis(ev[e], autos, streifen);
      this._einparken(dt);
      return ev;
    }

    /** Streifenwagen im Halt: nah an der Parkpose → weich auf Parkpose und Tempo des Ziels gleiten (kein Teleport). */
    _einparken(dt) {
      const fz = this.spiel.fahrzeuge;
      for (let k = 0; k < this.idx.length; k++) {
        const st = this.logik.streifen[k];
        if (!st || st.phase !== 'halt' || st.ziel < 0) continue;
        const f = fz[this.idx[k]], z = fz[st.ziel];
        if (!f || !z) continue;
        if (einparken(f.vehicle, z.vehicle, this.seite[k], this._parkD(z, f), this.c.versatzVor, dt, this.c.einparkRate)) {
          f.stehZeit = 0; st.fern = 0;
        } else {
          // Parkpose liegt (noch) weit weg: nach 1 s Seite neu bewerten (bisherige Seite zählt mehr) – z. B. wenn Verkehr dazwischen steht
          st.fern = (st.fern || 0) + dt;
          if (st.fern > 1) {
            st.fern = 0;
            const rz = imZielRahmen(z.vehicle, f.vehicle.x, f.vehicle.z), bisher = rz.quer >= 0 ? 1 : -1, andere = [];
            this._autos.forEach((a, i) => { if (i !== st.ziel && a) andere.push(a); });
            this._streifen.forEach((a, j) => { if (j !== k && a) andere.push(a); });
            const zd = this._autos[st.ziel], pd = this._streifen[k];
            if (zd && pd) this.seite[k] = parkSeiteWaehlen(this.spiel.strecke, zd, pd, andere, bisher, this.c).seite;
          }
        }
      }
    }

    _ereignis(e, autos, streifen) {
      const sp = this.spiel, f = sp.fahrzeuge[e.nr], A = R.Audio;
      if (e.art === 'anhalten') {
        const z = autos[e.nr], p = streifen[e.k];
        const rx = -Math.sin(z.heading), rz = -Math.cos(z.heading);
        const bisher = ((p.x - z.x) * -rz + (p.z - z.z) * rx) >= 0 ? 1 : -1;
        const andere = [];
        for (let i = 0; i < this.n; i++) if (i !== e.nr && autos[i]) andere.push(autos[i]);
        for (let k = 0; k < streifen.length; k++) if (k !== e.k) andere.push(streifen[k]);
        // Seite mit Platz (Fahrbahn, keine anderen Autos), sonst die bisherige – siehe parkSeiteWaehlen
        this.seite[e.k] = parkSeiteWaehlen(sp.strecke, z, p, andere, bisher, this.c).seite;
        this.statistik.anhaltungen.push({ nr: e.nr, zeit: this.logik.zeit, spieler: !!f.istSpieler, runde: z.runde });
        if (f.istSpieler && A && A.polizeiStopp) A.polizeiStopp();
        // Text: HUD-Anzeige „🚨 Polizei! Anhalten… N s" (hud.polizeiSetzen), keine zusätzliche Meldung
      } else if (e.art === 'weiter') {
        this.statistik.freigaben++;
        if (!e.gekauft) sp._meldung(e.nr, 'Weiterfahren! 🚗💨', 1800);     // v22: freigekauft → Meldung „💰 −10 – weiter!“ kommt vom Freikaufen
        const pf = sp.fahrzeuge[this.idx[e.k]];
        if (pf && pf.polizeiFahrer) pf.polizeiFahrer.zurueckgesetzt();
        if (f.driver && f.driver.zurueckgesetzt) f.driver.zurueckgesetzt();
      } else if (e.art === 'schild') {
        this.statistik.schild++;
        if (sp.pickups) sp.pickups.schildVerbrauchen(e.nr);     // „Schild weg! 💥" meldet main.js (pickups.geplatzt)
      }
    }

    /** 14.10. (v22): Anhaltung von Teilnehmer i beenden (Bezahlung macht der Aufrufer). → true/false */
    freikaufen(i) { return this.logik.freikaufen(i); }

    /** HUD: { art: 'stopp', rest, kosten } | { art: 'verfolgt' } | null für Teilnehmer i. */
    anzeige(i) {
      if (i >= this.n) return null;
      if (this.logik.gesperrt(i)) return { art: 'stopp', rest: Math.ceil(this.logik.rest(i) - 1e-6), kosten: this.c.freikaufKosten };
      const fz = this.spiel.fahrzeuge, f = fz[i];
      for (let k = 0; k < this.idx.length; k++) {
        if (this.logik.zielVon(k) !== i) continue;
        const p = fz[this.idx[k]];
        if (p && f && Math.hypot(p.vehicle.x - f.vehicle.x, p.vehicle.z - f.vehicle.z) < 80) return { art: 'verfolgt' };
      }
      return null;
    }

    /** Minimap: Positionen der Streifenwagen + Blink-Phase. */
    minimapPunkte() {
      const fz = this.spiel.fahrzeuge, l = this._mm || (this._mm = []);
      l.length = 0;
      for (let k = 0; k < this.idx.length; k++) { const f = fz[this.idx[k]]; if (f) l.push(f.vehicle); }
      l.blink = this._phase === 1;
      return l;
    }

    // ---------- Optik (nur mit THREE) ----------
    _optikVorbereiten(f, k) {
      if (typeof THREE === 'undefined' || !f.mesh) return;
      const mesh = f.mesh, ud = mesh.userData || {};
      let lampen = Array.isArray(ud.blaulicht) && ud.blaulicht.length >= 2 ? ud.blaulicht.slice(0, 2) : null;
      if (lampen) {
        // Katalog-Material kann geteilt sein (Vorschau, zweiter Wagen) → eigene Kopie je Wagen
        lampen.forEach((m) => { if (m.material && !m.userData.polizeiKopie) { m.material = m.material.clone(); m.userData.polizeiKopie = true; this._eigen.push(m.material); } });
      } else lampen = this._ersatzOptik(f);
      this.lampen[k] = lampen;
      const h = this._dachHoehe(f);
      // v26c: KEINE eigenen PointLights je Streifenwagen mehr (Lichtzahl in der Szene muss nach dem Rennstart konstant bleiben, sonst übersetzt
      // three.js alle beleuchteten Shader neu). Nur die Lage merken; das Blaulicht-Licht kommt aus dem festen Licht-Pool (LichtPool).
      this.blauLokal[k] = [[-0.5, h + 0.35, 0], [0.5, h + 0.35, 0]];
    }

    _dachHoehe(f) {
      const a = f.auto && f.auto.abmessungen;
      return a && a.hoehe ? a.hoehe : 1.45;
    }

    /** Ersatz ohne Katalog-Blaulicht: Lichtbalken (Sockel + 2 Lampen) + blau-silberne Seitenstreifen. */
    _ersatzOptik(f) {
      const mesh = f.mesh, a = (f.auto && f.auto.abmessungen) || {}, H = a.hoehe || 1.45, B = a.breite || 1.83, Lg = a.laenge || 4.7;
      const box = (w, h, d, farbe, basic) => {
        const g = new THREE.BoxGeometry(w, h, d), m = basic ? new THREE.MeshBasicMaterial({ color: farbe }) : new THREE.MeshLambertMaterial({ color: farbe });
        this._eigen.push(g, m);
        return new THREE.Mesh(g, m);
      };
      const balken = new THREE.Group(); balken.name = 'Blaulichtbalken';
      const sockel = box(1.15, 0.08, 0.3, 0x30343a); sockel.position.y = 0.04; balken.add(sockel);
      const l = box(0.5, 0.14, 0.26, 0x2a5cff, true), r = box(0.5, 0.14, 0.26, 0xff2a2a, true);
      l.position.set(-0.29, 0.13, 0); r.position.set(0.29, 0.13, 0);
      balken.add(l, r);
      balken.position.set(0, H - 0.02, Lg * 0.04);
      mesh.add(balken);
      [-1, 1].forEach((s) => {
        const blau = box(0.02, 0.13, Lg * 0.62, 0x1d4fd8); blau.position.set(s * (B / 2 + 0.012), H * 0.47, Lg * 0.02); mesh.add(blau);
        const silber = box(0.02, 0.05, Lg * 0.62, 0xc9ced6); silber.position.set(s * (B / 2 + 0.012), H * 0.47 + 0.1, Lg * 0.02); mesh.add(silber);
        this._ersatzTeile = (this._ersatzTeile || []).concat([blau, silber]);
      });
      this._ersatzTeile = (this._ersatzTeile || []).concat([balken]);
      return [l, r];
    }

    /** Blaulicht blinken (blau/rot wechselnd, blinkHz): Lampen-Material (emissive). v26c: das PointLight kommt aus dem Licht-Pool (blaulichtQuellen). */
    animieren(zeit) {
      if (typeof THREE === 'undefined') return;
      const phase = Math.floor(zeit * this.c.blinkHz * 2) % 2;
      const fz = this.spiel.fahrzeuge;
      const BLAU = 0x2a5cff, ROT = 0xff2a2a;
      const fl = phase ? ROT : BLAU, fr = phase ? BLAU : ROT;
      this._farben[0] = fl; this._farben[1] = fr;
      for (let k = 0; k < this.idx.length; k++) {
        const f = fz[this.idx[k]], la = this.lampen[k];
        if (!f) continue;
        if (la && phase !== this._phase) {
          if (la[0].material && la[0].material.color) la[0].material.color.setHex(fl);
          if (la[1].material && la[1].material.color) la[1].material.color.setHex(fr);
          if (la[0].material && la[0].material.emissive) la[0].material.emissive.setHex(fl);
          if (la[1].material && la[1].material.emissive) la[1].material.emissive.setHex(fr);
        }
      }
      this._phase = phase;
    }

    /**
     * v26c: Blaulicht-Quellen für den Licht-Pool (src/world/lichtPool.js): je Streifenwagen Mesh, Lage der zwei Lichter am Auto, aktuelle Farben, Stärke, Reichweite, Abstand.
     * @param {Array} out wird nur gefüllt (nicht geleert)
     */
    blaulichtQuellen(out) {
      for (let k = 0; k < this.idx.length; k++) {
        const f = this.spiel.fahrzeuge[this.idx[k]];
        if (!f || !f.mesh || !this.blauLokal[k]) continue;
        out.push({ f, mesh: f.mesh, lokal: this.blauLokal[k], farben: this._farben, staerke: this.c.lichtStaerke, reichweite: this.c.lichtReichweite, abstand: this.c.lichtAbstand });
      }
    }

    /** v26c: Es gibt nichts mehr vorzukompilieren (die Lichtzahl ändert sich im Rennen nicht; Main._vorwaermen übersetzt alles mit der endgültigen Lichtlage). Bleibt als leere Hülle. */
    vorkompilieren() { }

    /** Sirene: an, solange das Rennen läuft; Lautstärke nach Abstand zum nächsten Spielerauto. */
    ton(stumm) {
      const A = R.Audio;
      if (!A || !A.sirene) return;
      const sp = this.spiel, r = sp.rennen;
      if (stumm || !r || !r.gasErlaubt) { A.sirene(false); return; }
      const fz = sp.fahrzeuge;
      let laut = 0;
      for (let k = 0; k < this.idx.length; k++) {
        const p = fz[this.idx[k]];
        if (!p) continue;
        for (let i = 0; i < this.n; i++) {
          const f = fz[i];
          if (!f.istSpieler) continue;
          const d = Math.hypot(p.vehicle.x - f.vehicle.x, p.vehicle.z - f.vehicle.z);
          const l = Math.pow(klemme(1 - d / this.c.sireneHoerweite, 0, 1), 1.5);
          if (l > laut) laut = l;
        }
      }
      A.sirene(laut > 0.01, laut);
    }

    zerstoeren() {
      if (R.Audio && R.Audio.sirene) R.Audio.sirene(false);
      (this._ersatzTeile || []).forEach(m => { if (m.parent) m.parent.remove(m); });
      this._eigen.forEach(x => { if (x && x.dispose) x.dispose(); });
      this.blauLokal = []; this.lampen = []; this._eigen = []; this._ersatzTeile = [];
    }
  }

  Polizei.Logik = PolizeiLogik;
  Polizei.kapselAbstand = kapselAbstand;
  Polizei.vorAbstand = vorAbstand;
  Polizei.parkSteuerung = parkSteuerung;
  Polizei.parkAbstand = parkAbstand;
  Polizei.parkPose = parkPose;
  Polizei.einparken = einparken;
  Polizei.parkSeiteWaehlen = parkSeiteWaehlen;
  R.Polizei = Polizei;
})();
