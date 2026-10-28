// ============================================================
// Motorrad M3 – Auspuffknall und Funken (+ Spritzer für Schlamm/Wasser, teilen sich dieselben Partikel).
//
// Auspuffknall: Gas weg bei hoher Drehzahl → ein kurzer, leiser Knall (WebAudio über die Effekt-Bausteine von R.Audio). Auslöser rein in
//   knallPruefen(zustand, e): Gas vorher ≥ 0,6, jetzt ≤ 0,1, Drehzahl (Tempo/vMax) ≥ 0,55, Abstand zum letzten Knall ≥ 1,4 s → { anzahl 1–3, staerke }.
//   Pegel höchstens 0,09 (das Knallen der Motorprofile liegt bei 0,2) – leise genug.
// Funken: Funkenregen (a) beim Sturz-Rutschen über Asphalt (Überschlag-Landung + 0,8 s danach, Tempo > 3 m/s, Untergrund 'strasse'),
//   (b) beim Aufsetzen mit dem Unterboden = harte Landung nach einem Sprung (Fallgeschwindigkeit ≥ 3 m/s) auf Asphalt. Rein in rutschFunken/aufsetzFunken.
// Partikel: zwei THREE.Points-Objekte für die ganze Szene (Funken: additiv, Spritzer: normal), je höchstens 96/64 Stück → 2 Draw-Calls, keine Lichter,
//   deterministischer Zufall (kleiner LCG), Geometrie und Material einmal je Szene.
// Reine Funktionen (Node-Test): knallPruefen, knallZustand, rutschFunken, aufsetzFunken, partikelNeu, partikelSpawn, partikelSchritt.
// ============================================================
window.Rennspiel = window.Rennspiel || {};

(function () {
  const R = window.Rennspiel;
  R.Moto = R.Moto || {};

  const CFG = {
    knall: { gasVor: 0.6, gasNach: 0.1, rpmMin: 0.55, pause: 1.4, pegel: 0.09, max: 3 },
    funken: { rutschTempo: 3, rutschProSek: 70, aufsetzMin: 3, aufsetzMax: 24, leben: 0.55, schwerkraft: 9.81 },
    maxFunken: 96, maxSpritzer: 64,
  };
  const klemme = (x, a, b) => Math.max(a, Math.min(b, x));

  // ---------- Auspuffknall ----------
  function knallZustand() { return { gasAlt: 0, letzt: -99, zaehler: 0 }; }
  /** e = { gas (0..1), tempo (m/s), vMax (m/s), t (s) }. Rückgabe { anzahl, staerke } oder null. Zustand wird fortgeschrieben. */
  function knallPruefen(z, e) {
    const c = CFG.knall, gasAlt = z.gasAlt; z.gasAlt = e.gas;
    const rpm = e.vMax > 0 ? klemme(e.tempo / e.vMax, 0, 1.2) : 0;
    if (!(gasAlt >= c.gasVor && e.gas <= c.gasNach && rpm >= c.rpmMin && e.t - z.letzt >= c.pause)) return null;
    z.letzt = e.t; z.zaehler++;
    return { anzahl: 1 + (z.zaehler * 7) % c.max, staerke: klemme(0.4 + 0.6 * (rpm - c.rpmMin) / (1 - c.rpmMin), 0.4, 1) };     // anzahl: deterministische Folge 1–3
  }
  /** Knall abspielen (R.Audio._stoss/_ton, nur wenn der Ton läuft). */
  function knallSpielen(k) {
    const A = R.Audio;
    if (!k || !A || !A._bereit || !A._bereit() || !A._stoss || !A._ton) return false;
    let off = 0.02;
    for (let i = 0; i < k.anzahl; i++) {
      A._stoss(0.045, CFG.knall.pegel * k.staerke, 'lowpass', 1700, 260, 1.2, off);
      A._ton(130, 62, 0.06, 'sine', CFG.knall.pegel * 0.7 * k.staerke, off);
      off += 0.07 + 0.03 * ((i * 3) % 4);
    }
    return true;
  }

  // ---------- Funken ----------
  /**
   * Funken beim Sturz-Rutschen: e = { purzelAktiv, purzelT (s), purzelDauer, abkling (s Rest), abklingzeit, tempo, untergrund }.
   * Rückgabe Funken je Sekunde (0 = keine). Aktiv in der Landephase des Überschlags (ab 75 %) und 0,8 s danach (Abkling-Rest > abklingzeit − 0,8).
   */
  function rutschFunken(e) {
    const c = CFG.funken;
    if (e.untergrund !== 'strasse' || !(e.tempo > c.rutschTempo)) return 0;
    const landung = e.purzelAktiv && e.purzelT / (e.purzelDauer || 1.2) >= 0.75;
    const nach = !e.purzelAktiv && e.abkling > (e.abklingzeit || 2) - 0.8;
    return landung || nach ? c.rutschProSek * klemme(e.tempo / 15, 0.3, 1) : 0;
  }
  /** Funken beim Aufsetzen: e = { landungNeu (Bool), landeStaerke (m/s Fallgeschwindigkeit), untergrund }. Rückgabe Anzahl Funken (Stoß). */
  function aufsetzFunken(e) {
    const c = CFG.funken;
    if (!e.landungNeu || e.untergrund !== 'strasse' || !(e.landeStaerke >= c.aufsetzMin)) return 0;
    return Math.min(c.aufsetzMax, Math.round(6 + e.landeStaerke * 3));
  }

  // ---------- Partikel ----------
  let _lcg = 12345;
  const zufall = () => { _lcg = (Math.imul(_lcg, 1664525) + 1013904223) >>> 0; return _lcg / 4294967296; };
  /** Partikelpool (reine Daten): n Plätze, Platz frei, wenn t ≥ leben. */
  function partikelNeu(n) {
    return { n, x: new Float32Array(n), y: new Float32Array(n), z: new Float32Array(n), vx: new Float32Array(n), vy: new Float32Array(n), vz: new Float32Array(n),
      t: new Float32Array(n).fill(9), leben: new Float32Array(n).fill(0.01), r: new Float32Array(n), g: new Float32Array(n), b: new Float32Array(n), naechster: 0, aktiv: 0 };
  }
  /** Ein Partikel anlegen (Ringpuffer: überschreibt den ältesten Platz). Rückgabe der Platznummer. */
  function partikelSpawn(p, x, y, z, vx, vy, vz, leben, farbe) {
    const i = p.naechster; p.naechster = (i + 1) % p.n;
    p.x[i] = x; p.y[i] = y; p.z[i] = z; p.vx[i] = vx; p.vy[i] = vy; p.vz[i] = vz; p.t[i] = 0; p.leben[i] = leben;
    p.r[i] = ((farbe >> 16) & 255) / 255; p.g[i] = ((farbe >> 8) & 255) / 255; p.b[i] = (farbe & 255) / 255;
    return i;
  }
  /** Funkenschauer: n Funken ab (x,y,z), grob in Fahrtrichtung (rx, rz = Einheitsvektor, hinten raus), gelb-orange. */
  function funkenSpawn(p, n, x, y, z, rx, rz) {
    for (let k = 0; k < n; k++) {
      const a = (zufall() - 0.5) * 2.2, v = 2.5 + zufall() * 4.5, c = Math.cos(a), s = Math.sin(a);
      partikelSpawn(p, x + (zufall() - 0.5) * 0.4, y + 0.08, z + (zufall() - 0.5) * 0.4, (-rx * c + rz * s) * v, 1.5 + zufall() * 3, (-rz * c - rx * s) * v,
        CFG.funken.leben * (0.6 + zufall() * 0.6), zufall() < 0.5 ? 0xffd23a : 0xff8a1a);
    }
  }
  /** Spritzer (Schlamm braun / Wasser blau-weiß): n Tropfen seitlich und hoch. */
  function spritzSpawn(p, n, x, y, z, nx, nz, farben) {
    for (let k = 0; k < n; k++) {
      const sg = zufall() < 0.5 ? -1 : 1, v = 1.5 + zufall() * 3;
      partikelSpawn(p, x + (zufall() - 0.5) * 0.5, y + 0.15, z + (zufall() - 0.5) * 0.5, nx * sg * v + (zufall() - 0.5), 2 + zufall() * 2.5, nz * sg * v + (zufall() - 0.5), 0.5 + zufall() * 0.4, farben[k % farben.length]);
    }
  }
  /** Zeit voranbringen: Bewegung, Schwerkraft, am Boden (y ≤ 0,02 + boden) bleiben sie kurz liegen. fade = Farbe zum Ende hin abdunkeln (Funken, additiv). */
  function partikelSchritt(p, dt, fade) {
    let aktiv = 0;
    for (let i = 0; i < p.n; i++) {
      if (p.t[i] >= p.leben[i]) continue;
      p.t[i] += dt; aktiv++;
      p.vy[i] -= CFG.funken.schwerkraft * dt;
      p.x[i] += p.vx[i] * dt; p.y[i] += p.vy[i] * dt; p.z[i] += p.vz[i] * dt;
      if (p.y[i] < 0.02 && p.vy[i] < 0) { p.y[i] = 0.02; p.vy[i] *= -0.25; p.vx[i] *= 0.6; p.vz[i] *= 0.6; }
    }
    p.aktiv = aktiv;
    return aktiv;
  }

  // ---------- Grafik: zwei Points-Objekte ----------
  function punktTextur() {
    if (typeof document === 'undefined') return null;
    try {
      const cv = document.createElement('canvas'); cv.width = cv.height = 32; const g = cv.getContext('2d');
      const gr = g.createRadialGradient(16, 16, 1, 16, 16, 15); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.55, 'rgba(255,255,255,0.9)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.fillRect(0, 0, 32, 32);
      return new THREE.CanvasTexture(cv);
    } catch (e) { return null; }
  }
  /** Gruppe 'MotoFX' mit Funken- und Spritzer-Punkten; userData.fx = { funken, spritzer (Pools), aktualisieren(dt) }. */
  function gruppeBauen() {
    if (typeof THREE === 'undefined') return null;
    const g = new THREE.Group(); g.name = 'MotoFX';
    const tex = punktTextur();
    const system = (pool, groesse, additiv) => {
      const geo = new THREE.BufferGeometry(), pos = new Float32Array(pool.n * 3), farb = new Float32Array(pool.n * 3);
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('color', new THREE.BufferAttribute(farb, 3));
      const m = new THREE.PointsMaterial({ size: groesse, vertexColors: true, map: tex, transparent: true, depthWrite: false, sizeAttenuation: true, alphaTest: tex ? 0.02 : 0,
        blending: additiv ? THREE.AdditiveBlending : THREE.NormalBlending });
      const pts = new THREE.Points(geo, m); pts.frustumCulled = false; pts.visible = false; g.add(pts);
      return { pts, pos, farb, pool, additiv };
    };
    const a = system(partikelNeu(CFG.maxFunken), 0.32, true), b = system(partikelNeu(CFG.maxSpritzer), 0.34, false);
    const fuellen = (s) => {
      const p = s.pool; let any = false;
      for (let i = 0; i < p.n; i++) {
        const lebt = p.t[i] < p.leben[i], f = lebt ? (s.additiv ? 1 - p.t[i] / p.leben[i] : 1) : 0;
        s.pos[i * 3] = p.x[i]; s.pos[i * 3 + 1] = lebt ? p.y[i] : -1000; s.pos[i * 3 + 2] = p.z[i];
        s.farb[i * 3] = p.r[i] * f; s.farb[i * 3 + 1] = p.g[i] * f; s.farb[i * 3 + 2] = p.b[i] * f;
        if (lebt) any = true;
      }
      s.pts.visible = any;
      if (any) { s.pts.geometry.attributes.position.needsUpdate = true; s.pts.geometry.attributes.color.needsUpdate = true; }
    };
    g.userData.fx = { funken: a.pool, spritzer: b.pool, aktualisieren(dt) { partikelSchritt(a.pool, dt); partikelSchritt(b.pool, dt); if (a.pool.aktiv || a.pts.visible) fuellen(a); if (b.pool.aktiv || b.pts.visible) fuellen(b); } };
    return g;
  }
  /** Gruppe samt Geometrien/Materialien freigeben. */
  function gruppeFreigeben(g) {
    if (!g) return;
    if (g.parent) g.parent.remove(g);
    g.children.forEach((c) => { if (c.geometry) c.geometry.dispose(); if (c.material) { if (c.material.map) c.material.map.dispose(); c.material.dispose(); } });
  }

  R.Moto.m3fx = { CFG, knallZustand, knallPruefen, knallSpielen, rutschFunken, aufsetzFunken, partikelNeu, partikelSpawn, funkenSpawn, spritzSpawn, partikelSchritt, gruppeBauen, gruppeFreigeben };
})();
