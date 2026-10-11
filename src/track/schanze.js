// ============================================================
// Runde 4: Sprungschanzen (Welt „Stunt" und „Verrückt") – Fahrlogik + Grafik
//
// Katalog: schanzen: [{ s, winkel: 8 | 12, laenge: 10 }] → strecke.schanzen (nur wenn aktiveSchichten.schanzen).
// Geometrie: Keil über die ganze Fahrbahnbreite von s bis zur Absprungkante s + laenge, Oberseite gelb mit weißen
// Pfeilen, Seiten rot-weiß. Die Rampe liegt AUF der Straße: strecke.hoeheAn bleibt der Boden, die Rampe liefert
// Schanzen.hoeheAuf(strecke, s) = tan(winkel)·(s − s0) (0 außerhalb).
//
// Fahrlogik (Spieler und KI gleich, eigener Zustand je Fahrzeug f.flug = Schanzen.zustand()):
//   Rampe: Auto überquert s0 vorwärts auf der Fahrbahn → fährt hoch (y = Boden + Rampenhöhe, Bug hoch,
//          Hangabtrieb g·sin(winkel) bremst leicht). nachSchritt() nach vehicle.schritt prüft das.
//   Kante: vy = min(v·sin(winkel), vyMax), danach ballistisch: flugSchritt() ERSETZT vehicle.schritt
//          (g = 9,81, x/z weiter mit Tempo, Lenkung 20 %, kein Antrieb), vehicle.imFlug = true
//          (Auto-Auto- und Hindernis-Kollisionen aus – Einbau in collisions.js, siehe Bericht/VERLAUF).
//   Landung: y ≤ hoeheAn(x, z) → Tempo × 0,95 (sauber) bzw. × 0,8 (Heading ≠ Tangente > 25° oder abseits),
//          kurzer Nick-Impuls (Bug runter), Ereignis für Kamerawackeln/HUD.
//   Ereignisse: 'abflug' | 'sprung' (Flugzeit > 0,8 s → HUD „Sprung! ✈️") | 'landung' | 'landungSchraeg'.
// Der RaceManager-Fortschritt läuft normal weiter (x/z bewegen sich im Flug weiter).
// Pose: vehicle.y = Schanzen.hoehe(f.flug, vehicle, strecke) (Rampe/Flug/Boden), Nicken zusätzlich
// anzeigeNicken(f.flug, alpha); im Flug ersetzt es die Straßensteigung (inLuft()).
// Rechenteil ohne Three.js (Node-Tests: tests/test_schanze.js), nur bauen() braucht THREE.
// Werte: config.stunt.schanze.
// ============================================================
(function () {
  const R = window.Rennspiel;

  function C() { return (R.config.stunt && R.config.stunt.schanze) || {}; }
  function wert(x, std) { return x === undefined ? std : x; }
  function klemme(x, a, b) { return x < a ? a : (x > b ? b : x); }

  /** Schanzen der Strecke mit vorberechneten Werten (zwischengespeichert an der Strecke). */
  function liste(strecke) {
    const roh = strecke.schanzen || [];
    if (strecke._schanzenQuelle === roh && strecke._schanzenListe) return strecke._schanzenListe;
    const sp = strecke.spline;
    const l = roh.map((e, nr) => {
      const w = (e.winkel || 8) * Math.PI / 180, laenge = e.laenge || 10;
      return { nr, s: sp.wrapS(e.s), s1: sp.wrapS(e.s + laenge), grad: e.winkel || 8, winkel: w, laenge,
        tan: Math.tan(w), sin: Math.sin(w), hoehe: laenge * Math.tan(w) };
    });
    strecke._schanzenQuelle = roh; strecke._schanzenListe = l;
    return l;
  }

  /**
   * Höhe der Rampe über der Straße bei Bogenlänge s (m, 0 außerhalb). Die Rampe reicht über die ganze Fahrbahn.
   * @returns {number}
   */
  function hoeheAuf(strecke, s) {
    const l = liste(strecke), sp = strecke.spline;
    for (let i = 0; i < l.length; i++) {
      const a = sp.differenzS(s, l[i].s);
      if (a >= 0 && a <= l[i].laenge) return a * l[i].tan;
    }
    return 0;
  }

  /** Neuer Zustand je Fahrzeug (f.flug = Schanzen.zustand()). */
  function zustand() {
    return { aktiv: false, rampe: null, rampenH: 0, vy: 0, t: 0, y: 0, yVorher: 0, nicken: 0, nickenVorher: 0,
      startX: 0, startZ: 0, sprungGemeldet: false,
      fluege: 0, landungen: 0, schraeg: 0, abseits: 0, letzteFlugzeit: 0, letzteWeite: 0, landeStaerke: 0, maxFlugzeit: 0 };
  }

  /** Auto aus Rampe/Flug nehmen (Reset, Rennende). */
  function abbrechen(fz, vehicle) {
    if (!fz) return;
    fz.aktiv = false; fz.rampe = null; fz.rampenH = 0; fz.vy = 0; fz.t = 0;
    fz.nicken = 0; fz.nickenVorher = 0;
    if (vehicle) vehicle.imFlug = false;
  }

  /** Ist das Auto in der Luft? (dann ersetzt anzeigeNicken die Straßensteigung) */
  function inLuft(fz) { return !!(fz && fz.aktiv); }

  /** Höhe des Autos (Welt-y): im Flug aus dem Flugzustand, auf der Rampe Boden + Rampenhöhe, sonst Boden. */
  function hoehe(fz, vehicle, strecke) {
    if (fz && fz.aktiv) return fz.y;
    const b = strecke.hoeheAn(vehicle.x, vehicle.z);
    return fz && fz.rampe ? b + fz.rampenH : b;
  }

  /** Zusätzliches Nicken (rad, > 0 = Bug hoch) für die Darstellung, interpoliert (alpha 0..1). */
  function anzeigeNicken(fz, alpha) {
    if (!fz) return 0;
    const a = alpha === undefined ? 1 : alpha;
    return fz.nickenVorher + (fz.nicken - fz.nickenVorher) * a;
  }

  /**
   * Nach dem normalen vehicle.schritt: Rampe hochfahren / Absprung erkennen.
   * nah = strecke.abfrage(...) VOR dem Schritt (main.js: f.nah), xAlt/zAlt = Position vor dem Schritt.
   * @returns {'abflug'|null}
   */
  function nachSchritt(fz, vehicle, strecke, nah, xAlt, zAlt, dt) {
    if (!fz || fz.aktiv) return null;
    fz.nickenVorher = fz.nicken;
    const l = liste(strecke);
    let ziel = 0, ereignis = null;
    if (l.length && nah) {
      const sp = strecke.spline, pt = sp.punktBei(nah.s), dx = vehicle.x - xAlt, dz = vehicle.z - zAlt;
      const sAlt = nah.s, sNeu = nah.s + dx * pt.tx + dz * pt.tz, q = nah.seitenabstand + dx * pt.nx + dz * pt.nz;
      const halb = (strecke.breiteBei ? strecke.breiteBei(sNeu) : strecke.breite) / 2 + 0.3;
      let neu = null, a = 0;
      for (let i = 0; i < l.length; i++) {
        const S = l[i], aN = sp.differenzS(sNeu, S.s);
        if (fz.rampe === S) {
          if (aN > S.laenge) { ereignis = abflug(fz, vehicle, strecke, S); break; }
          if (aN >= -0.5 && Math.abs(q) <= halb + 0.5 && vehicle.vLaengs > 0) { neu = S; a = Math.max(0, aN); }
        } else if (!neu) {
          const aA = sp.differenzS(sAlt, S.s);
          if (aA <= 0.05 && aN >= 0 && aN <= S.laenge && Math.abs(q) <= halb && vehicle.vLaengs > 0) {
            const r = vehicle.richtung();
            if (r.x * pt.tx + r.z * pt.tz > 0.5) { neu = S; a = aN; }
          }
        }
      }
      if (ereignis) return ereignis;
      fz.rampe = neu; fz.rampenH = neu ? a * neu.tan : 0;
      if (neu) {
        ziel = neu.winkel;
        // Hangabtrieb auf der Rampe (bremst leicht)
        if (vehicle.vLaengs > 0) vehicle.vLaengs = Math.max(0, vehicle.vLaengs - wert(C().g, 9.81) * neu.sin * dt);
      }
    } else { fz.rampe = null; fz.rampenH = 0; }
    // Nicken weich zum Ziel (Rampenwinkel bzw. 0; klingt auch den Lande-Impuls ab)
    fz.nicken += (ziel - fz.nicken) * Math.min(1, (ziel ? 16 : 10) * dt);
    if (Math.abs(fz.nicken) < 1e-4) fz.nicken = 0;
    return ereignis;
  }

  /** Absprung an der Kante der Schanze S. */
  function abflug(fz, vehicle, strecke, S) {
    const c = C(), v = Math.max(0, vehicle.vLaengs);
    fz.vy = Math.min(v * S.sin, wert(c.vyMax, 5));
    fz.y = strecke.hoeheAn(vehicle.x, vehicle.z) + S.hoehe;
    fz.yVorher = fz.y; fz.t = 0; fz.aktiv = true; fz.rampe = null; fz.rampenH = 0;
    fz.startX = vehicle.x; fz.startZ = vehicle.z; fz.sprungGemeldet = false; fz.fluege++;
    vehicle.imFlug = true;
    return 'abflug';
  }

  /**
   * Ein Physikschritt im Flug – ERSETZT vehicle.schritt. steuerung = { gas, bremse, lenkung }:
   * nur die Lenkung wirkt (20 %). Liefert null, 'sprung', 'landung' oder 'landungSchraeg'.
   */
  function flugSchritt(fz, vehicle, strecke, steuerung, dt) {
    if (!fz || !fz.aktiv) return null;
    const c = C(), s = steuerung || {}, g = wert(c.g, 9.81);
    fz.t += dt; fz.yVorher = fz.y; fz.nickenVorher = fz.nicken;
    // Lenkung (gedrosselt): Lenkwert glätten wie vehicle.js, Drehrate × flugLenkung
    const zielL = klemme(s.lenkung || 0, -1, 1);
    vehicle.lenkung += (zielL - vehicle.lenkung) * Math.min(1, 6 * dt);
    if (vehicle.vLaengs > 0.2) vehicle.heading -= vehicle.lenkung * vehicle.drehrateMax() * wert(c.flugLenkung, 0.2) * dt;
    // Tempo: kein Antrieb, kleiner Luftwiderstand; Drift klingt langsam ab
    vehicle.vLaengs = Math.max(0, vehicle.vLaengs - wert(c.luft, 0.0006) * vehicle.vLaengs * vehicle.vLaengs * dt);
    vehicle.vQuer *= Math.exp(-1.5 * dt);
    const r = vehicle.richtung(), q = vehicle.rechts();
    vehicle.x += (r.x * vehicle.vLaengs + q.x * vehicle.vQuer) * dt;
    vehicle.z += (r.z * vehicle.vLaengs + q.z * vehicle.vQuer) * dt;
    // Ballistik
    fz.vy -= g * dt;
    fz.y += fz.vy * dt;
    // Bug folgt der Flugbahn (gedämpft)
    const zielN = klemme(Math.atan2(fz.vy, Math.max(8, vehicle.vLaengs)), -0.3, 0.3);
    fz.nicken += (zielN - fz.nicken) * Math.min(1, 5 * dt);
    vehicle.neigung *= Math.exp(-3 * dt);
    vehicle.letzteSteuerung = { gas: s.gas || 0, bremse: 0, lenkung: zielL };
    vehicle.untergrund = 'strasse';
    let ereignis = null;
    if (!fz.sprungGemeldet && fz.t >= wert(c.sprungMeldung, 0.8)) { fz.sprungGemeldet = true; ereignis = 'sprung'; }
    const boden = strecke.hoeheAn(vehicle.x, vehicle.z);
    if (fz.y <= boden) return landen(fz, vehicle, strecke, boden);
    return ereignis;
  }

  /** Landung: Tempoverlust je nach Lage, Nick-Impuls, Statistik. */
  function landen(fz, vehicle, strecke, boden) {
    const c = C(), sp = strecke.spline, n = strecke.abfrage(vehicle.x, vehicle.z);
    const p = sp.punktBei(n.s);
    const diff = Math.abs(R.Vehicle.winkelDiff(R.headingAus(p.tx, p.tz), vehicle.heading)) * 180 / Math.PI;
    const breite = strecke.breiteBei ? strecke.breiteBei(n.s) : strecke.breite;
    const aufStrasse = Math.abs(n.seitenabstand) <= breite / 2 + wert(c.abseitsZugabe, 0.5);
    const sauber = aufStrasse && diff <= wert(c.schraegGrad, 25);
    fz.tempoVorLandung = vehicle.vLaengs;
    vehicle.vLaengs *= sauber ? wert(c.landungSauber, 0.95) : wert(c.landungSchraeg, 0.8);
    vehicle.vQuer *= 0.5;
    fz.landeStaerke = Math.abs(fz.vy);
    fz.letzteFlugzeit = fz.t; fz.maxFlugzeit = Math.max(fz.maxFlugzeit, fz.t);
    fz.letzteWeite = Math.hypot(vehicle.x - fz.startX, vehicle.z - fz.startZ);
    fz.letzteLandung = { sauber, aufStrasse, winkel: diff, seitenabstand: n.seitenabstand, s: n.s };
    fz.landungen++; if (!sauber) fz.schraeg++; if (!aufStrasse) fz.abseits++;
    fz.aktiv = false; fz.y = boden; fz.vy = 0;
    fz.nicken = -wert(c.landeNicken, 0.07) * Math.min(1, 0.3 + fz.landeStaerke / 8);
    vehicle.imFlug = false;
    vehicle.untergrund = n.untergrund;
    return sauber ? 'landung' : 'landungSchraeg';
  }

  /**
   * Kompletter Fahrzeugschritt wie in main.js (für Node-Tests und Simulationen): im Flug flugSchritt,
   * sonst vehicle.schritt + nachSchritt; setzt vehicle.y. Liefert { ereignis, index, untergrund }.
   */
  function fahrzeugSchritt(fz, vehicle, strecke, steuerung, dt, index, umwelt) {
    if (fz.aktiv) {
      const e = flugSchritt(fz, vehicle, strecke, steuerung, dt);
      const n = strecke.abfrage(vehicle.x, vehicle.z, index);
      vehicle.y = hoehe(fz, vehicle, strecke);
      return { ereignis: e, index: n.index, untergrund: fz.aktiv ? 'luft' : n.untergrund };
    }
    const n = strecke.abfrage(vehicle.x, vehicle.z, index);
    vehicle.untergrund = n.untergrund;
    const xAlt = vehicle.x, zAlt = vehicle.z;
    vehicle.schritt(dt, steuerung, undefined, umwelt);
    const e = nachSchritt(fz, vehicle, strecke, n, xAlt, zAlt, dt);
    vehicle.y = hoehe(fz, vehicle, strecke);
    return { ereignis: e, index: n.index, untergrund: n.untergrund };
  }

  // ------------------------------------------------------------------ Grafik (THREE)

  /** Geometrie aus Vierecken { a, b, c, d (je [x,y,z]), farbe } und Dreiecken { a, b, c, farbe }. */
  function geometrie(vierecke, dreiecke) {
    const n = vierecke.length * 6 + dreiecke.length * 3;
    const pos = new Float32Array(n * 3), col = new Float32Array(n * 3), c = new THREE.Color();
    let o = 0;
    const ecke = (e) => { pos[o] = e[0]; pos[o + 1] = e[1]; pos[o + 2] = e[2]; col[o] = c.r; col[o + 1] = c.g; col[o + 2] = c.b; o += 3; };
    for (const v of vierecke) { c.set(v.farbe); [v.a, v.b, v.c, v.a, v.c, v.d].forEach(ecke); }
    for (const d of dreiecke) { c.set(d.farbe); [d.a, d.b, d.c].forEach(ecke); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.computeVertexNormals();
    return g;
  }

  /**
   * Alle Schanzen einer Strecke als Gruppe 'Schanzen' (1 Draw-Call). Keil über die Fahrbahnbreite:
   * Oberseite gelb mit weißen Pfeilen (zeigen zur Kante), Seiten rot-weiß gestreift, Kante dunkel mit gelbem Streifen.
   */
  function bauen(strecke, thema) {
    const gruppe = new THREE.Group();
    gruppe.name = 'Schanzen';
    const l = liste(strecke), sp = strecke.spline, vierecke = [], dreiecke = [];
    const GELB = 0xffc21a, GELB2 = 0xffad0a, WEISS = 0xffffff, ROT = 0xe0262b, DUNKEL = 0x3a3a40;
    l.forEach((S) => {
      const hb = (strecke.breiteBei ? strecke.breiteBei(S.s + S.laenge / 2) : strecke.breite) / 2 + 0.25;
      // Weltpunkt bei a (längs ab s0), q (quer, rechts +), Höhe über der Rampe (hoch) bzw. am Boden (boden = true)
      const P = (a, q, hoch, boden) => {
        const p = sp.punktBei(S.s + a), x = p.x + p.nx * q, z = p.z + p.nz * q;
        const y = strecke.hoeheAn(x, z) + (boden ? 0.0 : klemme(a, 0, S.laenge) * S.tan) + (hoch || 0);
        return [x, y, z];
      };
      const N = 10, da = S.laenge / N, LIFT = 0.04;
      for (let i = 0; i < N; i++) {
        const a0 = i * da, a1 = (i + 1) * da;
        // Oberseite (4 Streifen quer, damit sie der gewölbten Straße folgt); außen je ein rot-weißer Randstreifen
        const RB = 0.7;
        for (let k = 0; k < 4; k++) {
          const q0 = -hb + RB + 2 * (hb - RB) * k / 4, q1 = -hb + RB + 2 * (hb - RB) * (k + 1) / 4;
          vierecke.push({ a: P(a0, q0, LIFT), b: P(a0, q1, LIFT), c: P(a1, q1, LIFT), d: P(a1, q0, LIFT), farbe: i % 2 ? GELB : GELB2 });
        }
        [[-hb, -hb + RB], [hb - RB, hb]].forEach(([q0, q1]) => vierecke.push({ a: P(a0, q0, LIFT + 0.01), b: P(a0, q1, LIFT + 0.01),
          c: P(a1, q1, LIFT + 0.01), d: P(a1, q0, LIFT + 0.01), farbe: i % 2 ? ROT : WEISS }));
        // Seiten: rot-weiß gestreift (Dreieck/Trapez vom Boden bis zur Oberseite)
        [-hb, hb].forEach((q, j) => {
          const farbe = i % 2 ? ROT : WEISS;
          const a = P(a0, q, 0, true), b = P(a1, q, 0, true), c = P(a1, q, LIFT), d = P(a0, q, LIFT);
          vierecke.push(j ? { a, b, c, d, farbe } : { a: b, b: a, c: d, d: c, farbe });
        });
      }
      // Kante (senkrecht): dunkel, oben ein gelber Streifen
      const kL = S.laenge;
      for (let k = 0; k < 6; k++) {
        const q0 = -hb + 2 * hb * k / 6, q1 = -hb + 2 * hb * (k + 1) / 6;
        const b0 = P(kL, q0, 0, true), b1 = P(kL, q1, 0, true), t0 = P(kL, q0, LIFT), t1 = P(kL, q1, LIFT);
        const m0 = [t0[0], t0[1] - 0.25, t0[2]], m1 = [t1[0], t1[1] - 0.25, t1[2]];
        vierecke.push({ a: b0, b: b1, c: m1, d: m0, farbe: k % 2 ? DUNKEL : ROT });
        vierecke.push({ a: m0, b: m1, c: t1, d: t0, farbe: GELB });
      }
      // Zielflaggen-Streifen (schwarz-weiß) direkt vor der Kante
      const nK = Math.max(6, Math.round(hb * 2 / 0.7));
      for (let k = 0; k < nK; k++) for (let r = 0; r < 2; r++) {
        const q0 = -hb + 2 * hb * k / nK, q1 = -hb + 2 * hb * (k + 1) / nK, b0 = kL - 1.2 + r * 0.6, b1 = b0 + 0.6;
        vierecke.push({ a: P(b0, q0, LIFT + 0.02), b: P(b0, q1, LIFT + 0.02), c: P(b1, q1, LIFT + 0.02), d: P(b1, q0, LIFT + 0.02),
          farbe: (k + r) % 2 ? 0x111111 : WEISS });
      }
      // Fahnenmasten an den Ecken der Kante (orange Fahne, flattert nicht – reine Markierung)
      [-hb - 0.35, hb + 0.35].forEach((q) => {
        const f = P(kL, q, 0, true), top = f[1] + S.hoehe + 2.6, p = sp.punktBei(S.s + kL), d = 0.09;
        const ex = p.tx * d, ez = p.tz * d, nx = p.nx * d, nz = p.nz * d;
        const ecken = [[ex + nx, ez + nz], [ex - nx, ez - nz], [-ex - nx, -ez - nz], [-ex + nx, -ez + nz]];
        for (let k = 0; k < 4; k++) {
          const a = ecken[k], b = ecken[(k + 1) % 4];
          vierecke.push({ a: [f[0] + a[0], f[1], f[2] + a[1]], b: [f[0] + b[0], f[1], f[2] + b[1]], c: [f[0] + b[0], top, f[2] + b[1]],
            d: [f[0] + a[0], top, f[2] + a[1]], farbe: WEISS });
        }
        // Fahne zeigt nach hinten (zum anfahrenden Auto)
        dreiecke.push({ a: [f[0], top, f[2]], b: [f[0], top - 0.8, f[2]], c: [f[0] - p.tx * 1.3, top - 0.4, f[2] - p.tz * 1.3], farbe: 0xff6a00 });
      });
      // Weiße Pfeile (Winkel ">" in Fahrtrichtung) auf der Oberseite, 3 Reihen, je 2–3 Pfeile quer
      const pfeilQ = hb > 4 ? [-hb * 0.55, 0, hb * 0.55] : [0];
      const PA = 1.6, PW = Math.min(1.5, hb * 0.32), PD = 0.45, H = LIFT + 0.03;
      [1.2, 4.2].forEach((a0) => pfeilQ.forEach((qm) => {
        if (a0 + PA > S.laenge - 1.5) return;
        // linker Schenkel: von (a0, qm − PW) nach (a0 + PA, qm); rechter Schenkel gespiegelt
        [-1, 1].forEach((sg) => {
          const aussen0 = P(a0, qm + sg * PW, H), aussen1 = P(a0 + PD, qm + sg * PW, H);
          const spitze0 = P(a0 + PA, qm, H), spitze1 = P(a0 + PA + PD, qm, H);
          vierecke.push(sg < 0 ? { a: aussen0, b: spitze0, c: spitze1, d: aussen1, farbe: WEISS }
            : { a: aussen0, b: aussen1, c: spitze1, d: spitze0, farbe: WEISS });
        });
      }));
    });
    if (!vierecke.length) return gruppe;
    const m = new THREE.Mesh(geometrie(vierecke, dreiecke), new THREE.MeshLambertMaterial({
      vertexColors: true, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
    m.name = 'SchanzenKeile';
    gruppe.add(m);
    return gruppe;
  }

  R.Schanzen = { zustand, liste, hoeheAuf, hoehe, inLuft, anzeigeNicken, nachSchritt, flugSchritt, abbrechen, fahrzeugSchritt, bauen };
})();
