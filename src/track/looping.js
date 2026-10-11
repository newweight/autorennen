// ============================================================
// Looping (Fantasie-Strecke): Fahrlogik + Grafik
//
// Katalog: loopings: [{ s, radius: 12 }] → trackBuilder._loopingsBerechnen() (Datenstruktur).
// Geometrie: vertikaler Kreis, tangential an der Straße bei s. Damit Ein- und Ausfahrt nicht
// ineinander liegen, ist der Kreis eine flache Helix: über die Runde wandert das Band seitlich um
// seitenVersatz (Breite × 0,6, links → rechts) und längs um versatz (≈ 10 m). Am Boden läuft die
// normale Straße weiter – wer zu langsam ist, fährt einfach unten durch.
//
// Bahn (Winkel w: 0 = Einfahrt unten, π = oben, 2π = Ausfahrt), längs a, Höhe h, quer q:
//   a(w) = r·sin w + versatz·w/2π,  h(w) = r·(1 − cos w),  q(w) = seitenVersatz·(w/2π − ½)
//
// Fahrlogik (Spieler und KI gleich, eigener Zustand je Fahrzeug f.looping):
//   Einfahrt: s wird vorwärts überquert, Auto auf der Fahrbahn, Tempo ≥ vMin = sqrt(5·g·r)
//   dv/dt = −g·sin w + Gas·(gedrosselt) − Bremse − Reibung − Luft·v²,  dw/dt = v / r
//   Fällt, wenn der Andruck v²/r + g·cos w in der oberen Hälfte < 0 wird (oben: v < sqrt(g·r))
//   oder das Auto stehen bleibt → sanft zurück vor die Einfahrt, Tempo 0 ("Mehr Anlauf!").
//   Nach 360°: Ausfahrt auf die Straße bei s + versatz mit der Restgeschwindigkeit.
// Während des Loopings stehen vehicle.x/z auf der "Bodenspur" s + versatz·w/2π (monoton →
// RaceManager-Fortschritt und Checkpoints laufen normal weiter); die sichtbare Pose (Position +
// Quaternion, Dach zum Kreismittelpunkt) liefert anzeigePose(). vehicle.imLooping = true schaltet
// Bande, Auto-Auto- und Hindernis-Kollisionen für dieses Auto aus.
// Rechenteil ohne Three.js (Node-Tests), nur bauen()/anzeigePose()/kameraPose() brauchen THREE.
// ============================================================
(function () {
  const R = window.Rennspiel;
  const G = 9.81, ZWEI_PI = Math.PI * 2;

  function C() { return (R.config.fantasie && R.config.fantasie.looping) || {}; }
  function wert(x, std) { return x === undefined ? std : x; }
  function glatt(a, b, x) { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); }

  /** Seitenabstand der Bandmitte bei Winkel w (rechts +). */
  function bandQ(L, w) { return L.seitenVersatz * (w / ZWEI_PI - 0.5); }

  /** Seitenabstand des Autos: in den ersten 60° weich von der Einfahrtsposition auf die Bandmitte. */
  function autoQ(L, lp, w) {
    const m = glatt(0, Math.PI / 3, w);
    return lp.qEin * (1 - m) + bandQ(L, w) * m;
  }

  /**
   * Punkt auf der Looping-Bahn bei Winkel w und Seitenabstand q (relativ zur Straßenmitte).
   * @returns {{x,y,z, fx,fy,fz, ux,uy,uz, a, h}} Position, Vorwärts- und Oben-Vektor (Welt, normiert)
   */
  function bahn(strecke, L, w, q, aus) {
    const r = L.radius, ver = L.versatz / ZWEI_PI, sw = Math.sin(w), cw = Math.cos(w);
    const a = r * sw + ver * w, h = r * (1 - cw);
    const p = strecke.spline.punktBei(L.s + a);
    const x = p.x + p.nx * q, z = p.z + p.nz * q;
    const y = strecke.hoeheAn(x, z) + h;
    // Ableitung nach w: längs (Tangente), quer (Normale), hoch
    const dl = r * cw + ver, dq = L.seitenVersatz / ZWEI_PI, dh = r * sw;
    let fx = p.tx * dl + p.nx * dq, fz = p.tz * dl + p.nz * dq, fy = dh;
    const fl = Math.hypot(fx, fy, fz) || 1; fx /= fl; fy /= fl; fz /= fl;
    // oben = Richtung Kreismittelpunkt (−sin w · Tangente + cos w · hoch), senkrecht zu vorwärts
    let ux = -sw * p.tx, uz = -sw * p.tz, uy = cw;
    const d = ux * fx + uy * fy + uz * fz; ux -= d * fx; uy -= d * fy; uz -= d * fz;
    const ul = Math.hypot(ux, uy, uz) || 1; ux /= ul; uy /= ul; uz /= ul;
    const o = aus || {};
    o.x = x; o.y = y; o.z = z; o.fx = fx; o.fy = fy; o.fz = fz; o.ux = ux; o.uy = uy; o.uz = uz; o.a = a; o.h = h;
    return o;
  }

  /** Neuer (inaktiver) Looping-Zustand für ein Fahrzeug: f.looping = Looping.zustand(). */
  function zustand() {
    return { aktiv: false, winkel: 0, winkelVorher: 0, v: 0, looping: null, qEin: 0,
      fallen: false, fallZeit: 0, fallVon: null, geschafft: 0, gefallen: 0, zuLangsam: 0 };
  }

  /** vehicle.x/z/heading auf die Bodenspur des Loopings setzen (für Rennleitung, Minimap, KI). */
  function aufBodenspur(lp, vehicle, strecke) {
    const L = lp.looping, w = Math.min(ZWEI_PI, lp.winkel), q = autoQ(L, lp, w);
    const p = strecke.spline.punktBei(L.s + L.versatz * w / ZWEI_PI);
    vehicle.x = p.x + p.nx * q; vehicle.z = p.z + p.nz * q;
    vehicle.heading = R.headingAus(p.tx, p.tz);
    vehicle.vLaengs = Math.max(0, lp.v); vehicle.vQuer = 0;
    vehicle.y = strecke.hoeheAn(vehicle.x, vehicle.z);
  }

  /**
   * Einfahrt prüfen – nach dem normalen Fahrzeugschritt. sAlt/sNeu = Bogenlänge vor/nach dem Schritt,
   * seitenabstand = aktueller Seitenabstand. Liefert 'start' (Looping übernimmt), 'zuLangsam'
   * (fährt unten durch) oder null.
   */
  function einfahrt(lp, vehicle, strecke, sAlt, sNeu, seitenabstand) {
    if (!strecke.loopings || !strecke.loopings.length || lp.aktiv || lp.fallen) return null;
    const sp = strecke.spline;
    for (let i = 0; i < strecke.loopings.length; i++) {
      const L = strecke.loopings[i];
      const a = sp.differenzS(sAlt, L.s), b = sp.differenzS(sNeu, L.s);
      if (!(a < 0 && b >= 0 && b - a < 10)) continue;
      if (Math.abs(seitenabstand) > strecke.breite / 2) return null;          // nicht auf der Fahrbahn
      const p = sp.punktBei(L.s), r = vehicle.richtung();
      if (r.x * p.tx + r.z * p.tz < 0.7 || vehicle.vLaengs <= 0) return null; // nicht vorwärts
      if (vehicle.vLaengs < L.vMin) {
        // Runde 5: nicht mehr unten durchfahren – Notstopp kurz vor der Einfahrt (normalerweise hat die
        // Anlauf-Bremse (track/anlauf.js) das Auto schon 10 m davor sanft angehalten)
        lp.zuLangsam++;
        const pz = sp.punktBei(L.s - 1), qz = Math.max(-strecke.breite / 2 + 1, Math.min(strecke.breite / 2 - 1, seitenabstand));
        vehicle.x = pz.x + pz.nx * qz; vehicle.z = pz.z + pz.nz * qz; vehicle.vLaengs = 0; vehicle.vQuer = 0;
        return 'zuLangsam';
      }
      lp.aktiv = true; lp.looping = L;
      lp.winkel = Math.min(0.2, b / L.radius); lp.winkelVorher = lp.winkel;
      lp.v = vehicle.vLaengs;
      lp.qEin = Math.max(-strecke.breite / 2 + 1, Math.min(strecke.breite / 2 - 1, seitenabstand));
      vehicle.imLooping = true;
      aufBodenspur(lp, vehicle, strecke);
      return 'start';
    }
    return null;
  }

  /**
   * Einen Physikschritt im Looping (ersetzt vehicle.schritt). steuerung = { gas, bremse } (Lenkung egal).
   * Liefert null (läuft), 'geschafft' (Ausfahrt), 'gefallen' (zurück zur Einfahrt) oder 'gelandet'
   * (Fall-Animation vorbei, Auto wieder normal fahrbar).
   */
  function schritt(lp, vehicle, strecke, steuerung, dt) {
    const c = C();
    if (lp.fallen) {
      lp.fallZeit += dt; vehicle.vLaengs = 0; vehicle.vQuer = 0;
      if (lp.fallZeit >= wert(c.fallDauer, 0.9)) { lp.fallen = false; vehicle.imLooping = false; return 'gelandet'; }
      return null;
    }
    if (!lp.aktiv) return null;
    const L = lp.looping, r = L.radius, s = steuerung || {};
    lp.winkelVorher = lp.winkel;
    const a = -G * Math.sin(lp.winkel)
      + (s.gas || 0) * vehicle.daten.beschleunigung * wert(c.gasAnteil, 0.5)
      - (s.bremse || 0) * wert(c.bremsVerz, 6)
      - wert(c.reibung, 0.5) - wert(c.luft, 0.002) * lp.v * lp.v;
    lp.v = Math.min(vehicle.daten.vMax, lp.v + a * dt);
    lp.winkel += Math.max(0, lp.v) / r * dt;
    // Runde 5: Arcade-Hilfe in der oberen Hälfte – nötiges Tempo vNoetig = sqrt(−g·r·cos w) (oben sqrt(g·r)).
    // Mit Gas und v ≥ loopingHilfe (0,9) · vNoetig schiebt sie auf vNoetig nach → wer mit Mindesttempo und
    // Gas einfährt, kommt immer durch (Reibung/Luft kosten sonst ein paar Prozent).
    const oben = lp.winkel > Math.PI / 2 && lp.winkel < 1.5 * Math.PI;
    if (oben && (s.gas || 0) > 0) {
      const vNoetig = Math.sqrt(Math.max(0, -G * r * Math.cos(lp.winkel)));
      const tol = wert(R.config.anlauf && R.config.anlauf.loopingHilfe, 0.9);
      if (lp.v < vNoetig && lp.v >= tol * vNoetig) { lp.v = vNoetig; lp.geschoben = (lp.geschoben || 0) + 1; }
    }
    const andruck = lp.v * lp.v / r + G * Math.cos(lp.winkel);
    if (lp.v <= 0.5 || (andruck < -1e-9 && oben)) {
      fallen(lp, vehicle, strecke);
      return 'gefallen';
    }
    if (lp.winkel >= ZWEI_PI) {
      // Ausfahrt: auf die Straße bei s + versatz, Restgeschwindigkeit nach vorne
      lp.winkel = ZWEI_PI;
      aufBodenspur(lp, vehicle, strecke);
      vehicle.lenkung = 0; vehicle.nicken = 0; vehicle.neigung = 0;
      lp.aktiv = false; vehicle.imLooping = false; lp.geschafft++;
      return 'geschafft';
    }
    aufBodenspur(lp, vehicle, strecke);
    return null;
  }

  /** Auto fällt: Pose merken (für die Animation), Auto vor die Einfahrt setzen, Tempo 0. */
  function fallen(lp, vehicle, strecke) {
    const L = lp.looping, w = Math.max(0, Math.min(ZWEI_PI, lp.winkel));
    lp.fallVon = bahn(strecke, L, w, autoQ(L, lp, w));
    const p = strecke.spline.punktBei(L.s - wert(C().zurueck, 6)), q = lp.qEin;
    vehicle.x = p.x + p.nx * q; vehicle.z = p.z + p.nz * q;
    vehicle.heading = R.headingAus(p.tx, p.tz);
    vehicle.vLaengs = 0; vehicle.vQuer = 0; vehicle.lenkung = 0; vehicle.nicken = 0; vehicle.neigung = 0;
    vehicle.y = strecke.hoeheAn(vehicle.x, vehicle.z);
    lp.aktiv = false; lp.fallen = true; lp.fallZeit = 0; lp.v = 0; lp.gefallen++;
    vehicle.imLooping = true;      // während der Fall-Animation keine Kollisionen
  }

  /**
   * Runde 5: Standorte der Gerüst-Beine (je Looping 3 Portale × 2 Beine) als feste Säulen { x, z, r } für
   * collisions.bande (gleiche Rechnung wie bauen(), ohne THREE).
   */
  function beine(strecke) {
    const l = [], aussen = strecke.breite / 2 + strecke.randBreite + 1.4, tiefe = 0.8;
    (strecke.loopings || []).forEach((L) => {
      [Math.PI / 2, Math.PI, 1.5 * Math.PI].forEach((w) => {
        const m = bahn(strecke, L, w, bandQ(L, w));
        const p = strecke.spline.punktBei(L.s + m.a);
        const aVers = -(m.ux * p.tx + m.uz * p.tz) * tiefe;
        const pt = strecke.spline.punktBei(L.s + m.a + aVers);
        [-aussen, aussen].forEach((q) => l.push({ x: pt.x + pt.nx * q, z: pt.z + pt.nz * q, r: 0.5, art: 'loopingBein' }));
      });
    });
    return l;
  }

  /** Fortschritt entlang der Strecke während des Loopings (m, monoton): s + (w/2π)·versatz. */
  function fortschrittS(lp) {
    if (!lp.aktiv) return null;
    return lp.looping.s + lp.looping.versatz * lp.winkel / ZWEI_PI;
  }

  // ------------------------------------------------------------------ Darstellung (THREE)

  let _m4 = null, _vx = null, _vy = null, _vz = null;
  function hilfsObjekte() {
    if (!_m4) { _m4 = new THREE.Matrix4(); _vx = new THREE.Vector3(); _vy = new THREE.Vector3(); _vz = new THREE.Vector3(); }
  }
  /** Quaternion aus Vorwärts- und Oben-Vektor (Auto: vorne = −z, oben = +y, rechts = +x). */
  function quatAus(fx, fy, fz, ux, uy, uz, quat) {
    hilfsObjekte();
    _vy.set(ux, uy, uz); _vz.set(-fx, -fy, -fz);
    _vx.crossVectors(_vy, _vz).normalize();
    _vy.crossVectors(_vz, _vx).normalize();
    _m4.makeBasis(_vx, _vy, _vz);
    return quat.setFromRotationMatrix(_m4);
  }

  /**
   * Sichtbare Pose eines Autos im Looping oder beim Zurückfallen (alpha = Interpolation zwischen den
   * Physikschritten). Schreibt in aus = { pos: Vector3, quat: Quaternion, vor: Vector3, oben: Vector3 }.
   * @returns {boolean} false = nicht im Looping (normale Pose verwenden)
   */
  function anzeigePose(strecke, lp, alpha, aus) {
    if (!lp || (!lp.aktiv && !lp.fallen)) return false;
    const L = lp.looping;
    if (lp.aktiv) {
      const w = lp.winkelVorher + (lp.winkel - lp.winkelVorher) * alpha;
      const b = bahn(strecke, L, w, autoQ(L, lp, w), lp._b || (lp._b = {}));
      aus.pos.set(b.x, b.y, b.z); aus.vor.set(b.fx, b.fy, b.fz); aus.oben.set(b.ux, b.uy, b.uz);
      quatAus(b.fx, b.fy, b.fz, b.ux, b.uy, b.uz, aus.quat);
      return true;
    }
    // Fallen: von der Absturzstelle (leicht nach außen wegkippend) sanft auf die Straße vor der Einfahrt
    const t = glatt(0, 1, lp.fallZeit / wert(C().fallDauer, 0.9));
    const von = lp.fallVon, p = strecke.spline.punktBei(L.s - wert(C().zurueck, 6));
    const zx = p.x + p.nx * lp.qEin, zz = p.z + p.nz * lp.qEin, zy = strecke.hoeheAn(zx, zz);
    const bogen = Math.sin(t * Math.PI) * 2.5;              // kleiner Bogen nach oben
    aus.pos.set(von.x + (zx - von.x) * t, von.y + (zy - von.y) * t + bogen, von.z + (zz - von.z) * t);
    const qa = lp._qa || (lp._qa = new THREE.Quaternion()), qb = lp._qb || (lp._qb = new THREE.Quaternion());
    quatAus(von.fx, von.fy, von.fz, von.ux, von.uy, von.uz, qa);
    quatAus(p.tx, 0, p.tz, 0, 1, 0, qb);
    aus.quat.copy(qa).slerp(qb, t);
    aus.vor.set(0, 0, -1).applyQuaternion(aus.quat); aus.oben.set(0, 1, 0).applyQuaternion(aus.quat);
    return true;
  }

  /**
   * Verfolger-Kamera im Looping: Punkt auf dem Kreis kameraNachlauf rad hinter dem Auto, nach innen
   * angehoben; Blick auf das Auto; "oben" = Auto-oben. Schreibt in aus = { pos, blick, oben } (Vector3).
   */
  function kameraPose(strecke, lp, alpha, abstandHoch, aus) {
    if (!lp || !lp.aktiv) return false;
    const L = lp.looping, w = lp.winkelVorher + (lp.winkel - lp.winkelVorher) * alpha;
    const nach = wert(C().kameraNachlauf, 0.55), wk = Math.max(0, w - nach);
    const k = bahn(strecke, L, wk, autoQ(L, lp, wk), lp._k || (lp._k = {}));
    const zurueck = (nach - (w - wk)) * L.radius;          // vor der Einfahrt: auf der Straße weiter hinten
    const hoch = abstandHoch || 3;
    aus.pos.set(k.x - k.fx * zurueck + k.ux * hoch, k.y - k.fy * zurueck + k.uy * hoch, k.z - k.fz * zurueck + k.uz * hoch);
    const wv = w + wert(C().kameraVoraus, 0.45), wvC = Math.min(ZWEI_PI, wv), weiter = (wv - wvC) * L.radius;
    const b = bahn(strecke, L, wvC, autoQ(L, lp, wvC), lp._kb || (lp._kb = {}));    // hinter der Ausfahrt: geradeaus weiter
    aus.blick.set(b.x + b.ux * 0.8 + b.fx * weiter, b.y + b.uy * 0.8 + b.fy * weiter, b.z + b.uz * 0.8 + b.fz * weiter);
    const a = bahn(strecke, L, w, 0, lp._ka || (lp._ka = {}));
    aus.oben.set(a.ux, a.uy, a.uz);
    return true;
  }

  /** Geometrie aus Vierecken { a, b, c, d (je [x,y,z]), farbe } (nicht indiziert, Vertex-Farben). */
  function vierecksGeo(vierecke) {
    const pos = new Float32Array(vierecke.length * 18), col = new Float32Array(vierecke.length * 18), c = new THREE.Color();
    let o = 0;
    for (const v of vierecke) {
      c.set(v.farbe);
      for (const e of [v.a, v.b, v.c, v.a, v.c, v.d]) {
        pos[o] = e[0]; pos[o + 1] = e[1]; pos[o + 2] = e[2];
        col[o] = c.r; col[o + 1] = c.g; col[o + 2] = c.b; o += 3;
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.computeVertexNormals();
    return g;
  }

  /** Geometrien mit je einer Farbe zu EINER Geometrie mit Vertex-Farben vereinen. */
  function vereinen(teile) {
    const flach = teile.map(t => ({ g: t.geo.index ? t.geo.toNonIndexed() : t.geo, farbe: t.farbe }));
    const n = flach.reduce((s, t) => s + t.g.attributes.position.count, 0);
    const pos = new Float32Array(n * 3), col = new Float32Array(n * 3), c = new THREE.Color();
    let o = 0;
    flach.forEach(({ g, farbe }) => {
      const k = g.attributes.position.count;
      pos.set(g.attributes.position.array, o * 3);
      c.set(farbe);
      for (let i = 0; i < k; i++) col.set([c.r, c.g, c.b], (o + i) * 3);
      o += k;
    });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.computeVertexNormals();
    return geo;
  }

  /**
   * Alle Loopings einer Strecke als Gruppe (2 Draw-Calls: Band + Gerüst).
   * Band: Fahrbahn (lila Asphalt, Mittelstreifen), Regenbogen-Randsteine, weiße Bordwände.
   * Gerüst: drei Portale (bei 90°, 180°, 270°) mit Beinen neben der Straße und Querträger am Band.
   */
  function bauen(strecke, thema) {
    const gruppe = new THREE.Group();
    gruppe.name = 'Loopings';
    const regen = (thema && thema.regenbogen) || [0xff4d4d, 0xff9a3d, 0xffe14a, 0x5fd35f, 0x4da6ff, 0xa66bff];
    const asphalt = (thema && thema.loopingBand) || 0x6a5a8e;
    const vierecke = [], teile = [], N = 160;
    const RAND = 0.7, WAND = 0.7, LIFT = 0.1;
    strecke.loopings.forEach((L) => {
      const hb = L.bandHalb;
      // Querschnitt bei w: Punkte bei q (relativ zur Bandmitte) + Anhebung entlang "oben"
      const pkt = (w, dq, hoch) => {
        const b = bahn(strecke, L, w, bandQ(L, w) + dq);
        return [b.x + b.ux * hoch, b.y + b.uy * hoch, b.z + b.uz * hoch];
      };
      for (let i = 0; i < N; i++) {
        const w0 = i / N * ZWEI_PI, w1 = (i + 1) / N * ZWEI_PI;
        const quad = (dqa, dqb, ha, hb2, farbe) => vierecke.push({ a: pkt(w0, dqa, ha), b: pkt(w0, dqb, hb2), c: pkt(w1, dqb, hb2), d: pkt(w1, dqa, ha), farbe });
        const streifen = Math.floor(i / 2) % 2 === 0;
        quad(-hb, -0.12, LIFT, LIFT, asphalt);
        quad(-0.12, 0.12, LIFT, LIFT, streifen ? 0xffffff : asphalt);
        quad(0.12, hb, LIFT, LIFT, asphalt);
        const rf = regen[Math.floor(i / 2) % regen.length];
        quad(-hb - RAND, -hb, LIFT + 0.02, LIFT + 0.02, rf);
        quad(hb, hb + RAND, LIFT + 0.02, LIFT + 0.02, rf);
        // Bordwände (außen an den Randsteinen), oben mit Regenbogen-Kante
        const wf = i % 4 < 2 ? 0xffffff : 0xffc3e6;
        vierecke.push({ a: pkt(w0, -hb - RAND, LIFT), b: pkt(w1, -hb - RAND, LIFT), c: pkt(w1, -hb - RAND, LIFT + WAND), d: pkt(w0, -hb - RAND, LIFT + WAND), farbe: wf });
        vierecke.push({ a: pkt(w0, hb + RAND, LIFT), b: pkt(w0, hb + RAND, LIFT + WAND), c: pkt(w1, hb + RAND, LIFT + WAND), d: pkt(w1, hb + RAND, LIFT), farbe: wf });
      }
      // Gerüst: Portale bei 90°, 180°, 270° (Beine neben der Straße, Querträger hinter/über dem Band)
      const aussen = strecke.breite / 2 + strecke.randBreite + 1.4;
      [Math.PI / 2, Math.PI, 1.5 * Math.PI].forEach((w) => {
        const m = bahn(strecke, L, w, bandQ(L, w));
        // "hinter dem Band" = gegen oben (vom Kreismittelpunkt weg)
        const tiefe = 0.8;
        const p = strecke.spline.punktBei(L.s + m.a);
        const hy = m.h + LIFT - tiefe * m.uy;
        // Längsverschiebung des Trägers nach außen (bei 90°/270° steht das Band senkrecht)
        const aVers = -(m.ux * p.tx + m.uz * p.tz) * tiefe;
        const pt = strecke.spline.punktBei(L.s + m.a + aVers);
        const beine = [-aussen, aussen].map((q) => {
          const x = pt.x + pt.nx * q, z = pt.z + pt.nz * q, y0 = strecke.hoeheAn(x, z);
          return { x, z, y0, y1: y0 + hy };
        });
        beine.forEach((bn) => {
          const geo = new THREE.CylinderGeometry(0.28, 0.38, bn.y1 - bn.y0 + 0.4, 10);
          geo.translate(bn.x, (bn.y0 + bn.y1 + 0.4) / 2, bn.z);
          teile.push({ geo, farbe: 0xfdfdfd });
          // rosa Ringe am Bein (Zuckerstange)
          for (let y = bn.y0 + 1.5; y < bn.y1 - 0.5; y += 3) {
            const ring = new THREE.CylinderGeometry(0.4, 0.4, 0.6, 10); ring.translate(bn.x, y, bn.z);
            teile.push({ geo: ring, farbe: 0xff6fb5 });
          }
          const fuss = new THREE.CylinderGeometry(0.7, 0.8, 0.3, 10); fuss.translate(bn.x, bn.y0 + 0.15, bn.z);
          teile.push({ geo: fuss, farbe: 0xb9a6e0 });
        });
        // Querträger von Bein zu Bein
        const [l, r] = beine, len = Math.hypot(r.x - l.x, r.z - l.z);
        const tr = new THREE.BoxGeometry(len + 0.8, 0.6, 0.6);
        tr.rotateY(Math.atan2(-(r.z - l.z), r.x - l.x));
        tr.translate((l.x + r.x) / 2, (l.y1 + r.y1) / 2 + 0.2, (l.z + r.z) / 2);
        teile.push({ geo: tr, farbe: 0xff6fb5 });
      });
      // Schild "LOOPING" bleibt weg – das Band ist von weitem gut zu sehen.
    });
    const band = new THREE.Mesh(vierecksGeo(vierecke), new THREE.MeshLambertMaterial({
      vertexColors: true, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
    band.name = 'LoopingBand';
    gruppe.add(band);
    if (teile.length) {
      const g = new THREE.Mesh(vereinen(teile), new THREE.MeshLambertMaterial({ vertexColors: true }));
      g.name = 'LoopingGeruest';
      gruppe.add(g);
    }
    return gruppe;
  }

  /**
   * Kompletter Fahrzeugschritt wie in main.js, aber ohne Fahrhilfe (für Node-Tests und Simulationen):
   * im Looping Looping.schritt, sonst vehicle.schritt + (optional Anlauf-Bremse, anlauf = Anlauf.zustand()) + Einfahrt prüfen.
   * @returns {{ereignis:string|null, index:number, untergrund:string}}
   */
  function fahrzeugSchritt(lp, vehicle, strecke, steuerung, dt, index, anlauf) {
    if (lp.aktiv || lp.fallen) {
      const e = schritt(lp, vehicle, strecke, steuerung, dt);
      const n = strecke.abfrage(vehicle.x, vehicle.z, index);
      vehicle.untergrund = 'strasse';
      return { ereignis: e, index: n.index, untergrund: 'strasse' };
    }
    const n = strecke.abfrage(vehicle.x, vehicle.z, index);
    vehicle.untergrund = n.untergrund;
    const xAlt = vehicle.x, zAlt = vehicle.z;
    vehicle.schritt(dt, steuerung);
    vehicle.y = strecke.hoeheAn(vehicle.x, vehicle.z);
    let e = null;
    // Runde 5: Anlauf-Bremse (track/anlauf.js) vor der Einfahrt-Prüfung, wie in main.js
    if (anlauf && R.Anlauf) e = R.Anlauf.nachSchritt(anlauf, vehicle, strecke, n, xAlt, zAlt, steuerung, dt);
    if (strecke.loopings && strecke.loopings.length) {
      const pt = strecke.spline.punktBei(n.s), dx = vehicle.x - xAlt, dz = vehicle.z - zAlt;
      e = einfahrt(lp, vehicle, strecke, n.s, n.s + dx * pt.tx + dz * pt.tz, n.seitenabstand + dx * pt.nx + dz * pt.nz) || e;
    }
    return { ereignis: e, index: n.index, untergrund: n.untergrund };
  }

  R.Looping = { zustand, einfahrt, schritt, fahrzeugSchritt, bahn, bandQ, autoQ, fortschrittS, anzeigePose, kameraPose, bauen, beine, G };
})();
