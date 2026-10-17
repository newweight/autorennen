// v28 W8 / v29 F5: Feuerwerk an Start/Ziel, wenn ein SPIELER (Mensch) als Erster ins Ziel kommt.
//
// Reine Client-Optik (kein Protokoll, keine Physik): hängt am 'ziel'-Ereignis des RaceManagers (offline wie online – online meldet
// online.js das Server-Ergebnis über denselben Weg). Auslöser: t.istSpieler && t.zielPlatz === 1. Zweispieler: der Mensch, der zuerst ankommt;
// gewinnt ein Computerfahrer, gibt es kein Feuerwerk.
//
// v29 F5 „länger und imposanter“: Show ~12 s (Starts über 9 s verteilt, Nachfallen bis ~12,5 s), 18 Raketen (16–20): jede Rakete platzt als
// Chrysanthemum (große Kugel, 75 % Hauptfarbe/25 % Zweitfarbe) + nach 0,45 s Doppel-Explosion (innere Kugel in dritter Farbe) + Glitzer-Nachfallen
// (langsam sinkende, funkelnde Fünkchen); die letzten 4 Raketen als Finale dicht hintereinander. Dazu Bodenfontänen links/rechts der Ziellinie
// (und ein zweites Paar 70 m dahinter) und Konfetti-Regen vor der Kamera. Die Knalle liegen relativ zum fahrenden Auto 45–140 m voraus
// (so bleiben sie auch beim langen Ausrollen im Bild). Die Ergebnistafel kommt erst nach config.feuerwerk.tafelNach (6 s) – siehe main.js/online.js.
//
// Aufbau: ZWEI Points-Objekte mit fester Größe (additiv, kein Licht, kein Nebel, gleiche Textur, gleiches Shader-Programm – nur die Punktgröße
// (Uniform) unterscheidet sich): „groß“ (Raketen-Kugeln) und „fein“ (Spuren, Glitzer, Fontänen, Konfetti) = 2 Draw-Calls, nur solange sichtbar.
// Ton per WebAudio-Synthese über die vorhandenen Helfer von R.Audio (_stoss/_ton → Effekt-Bus → Master-Lautstärke); 3 Knall-Varianten.
// Lebenslauf: R.Feuerwerk.verbinden(spiel) beim Rennaufbau (main.js rennenStarten, online.js) → spiel.feuerwerk; spiel.feuerwerk.update(dt) je Frame;
// zerstoeren() in szeneAbbauen (Geometrie, Material, Textur). Beide Objekte liegen von Rennbeginn an unsichtbar in der Szene → _vorwaermen
// (main.js) übersetzt sie mit (Programm und Puffer schon vor dem Countdown, keine neuen Lichter, keine neuen Materialien danach).
// Schalter/Zahlen: config.feuerwerk.* (siehe STANDARD), config.feuerwerk.an = false schaltet alles ab.
(function () {
  'use strict';
  const R = (typeof window !== 'undefined' ? window.Rennspiel : (global.Rennspiel = global.Rennspiel || {}));
  const THREE = (typeof window !== 'undefined' ? window.THREE : global.THREE);
  if (!R || !THREE) return;

  const STANDARD = {
    an: true,
    raketen: 18,         // 16–20 (Klemme 6–24)
    dauer: 9,            // s, über die die Raketenstarts verteilt sind (Show insgesamt ~12 s inkl. Nachfallen)
    tafelNach: 6,        // s bis die Ergebnistafel erscheint (main.js/online.js; Kamera bleibt beim ausrollenden Auto)
    funken: 190,         // je Hauptkugel
    funkenInnen: 80,     // je innerer Kugel (Doppel-Explosion)
    glitzer: 60,         // je Rakete: funkelndes Nachfallen
    maxPunkte: 3000,     // Pool groß (Raketen-Kugeln)
    maxFein: 2800,       // Pool fein (Spuren, Glitzer, Fontänen, Konfetti)
    punktGross: 3.0,     // Punktgröße groß / fein (Weltmeter bei Entfernung 1, mit Entfernung kleiner)
    punktFein: 0.9,
    flug: [1.0, 1.35],   // s Steigzeit
    winkel: [4, 11],     // Grad: Höhe der Knalle über dem Horizont, gesehen vom Auto
    nachVorn: [45, 140], // m vor dem Auto (Bogenlänge) – bei Start der Rakete gemessen
    hoeheMin: 20, hoeheMax: 52,
    quer: 40,            // m seitlich um die Straßenmitte
    kugelTempo: [19, 30],// m/s Hauptkugel (Radius ≈ Tempo / 1,05 = 18–29 m)
    fontaenen: true, fontaeneDauer: 7, fontaeneRate: 110,   // Funken/s je Fontäne
    konfetti: 105,        // Stück/s vor der Kamera (0 = aus)
    lautstaerke: 0.8,    // 0..1 (Effekt-Bus + Master gelten zusätzlich)
  };
  const FARBEN = [[1, 0.25, 0.2], [1, 0.8, 0.2], [0.3, 0.9, 1], [1, 0.4, 0.8], [0.4, 1, 0.45], [1, 1, 1], [0.7, 0.5, 1], [1, 0.55, 0.15]];
  const KONFETTI = [[1, 0.2, 0.25], [1, 0.85, 0.2], [0.25, 0.8, 1], [1, 0.35, 0.85], [0.35, 1, 0.4], [1, 1, 1], [0.75, 0.45, 1], [1, 0.55, 0.1]];
  const SCHWERKRAFT = 7;
  // Teilchenarten
  const FUNKE = 0, KONF = 1, GLITZ = 2, FONT = 3, SPUR = 4;

  function cfg() { return Object.assign({}, STANDARD, (R.config && R.config.feuerwerk) || {}); }
  function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

  /** Weicher runder Punkt (Textur 64×64, Alpha-Verlauf). */
  function punktTextur() {
    if (typeof document === 'undefined') return null;
    try {
      const cv = document.createElement('canvas'); cv.width = cv.height = 64;
      const c = cv.getContext('2d'); if (!c) return null;
      const g = c.createRadialGradient(32, 32, 0, 32, 32, 32);
      g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.3, 'rgba(255,255,255,0.95)'); g.addColorStop(0.55, 'rgba(255,255,255,0.3)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = g; c.fillRect(0, 0, 64, 64);
      return new THREE.CanvasTexture(cv);
    } catch (e) { return null; }
  }

  /** Teilchen-Pool fester Größe = EIN Points-Objekt. */
  class Pool {
    constructor(N, groesse, tex, name) {
      this.N = N;
      this.pos = new Float32Array(N * 3); this.farbe = new Float32Array(N * 3);
      this.vel = new Float32Array(N * 3); this.basis = new Float32Array(N * 3);
      this.leben = new Float32Array(N); this.dauer = new Float32Array(N); this.art = new Uint8Array(N);
      this.frei = 0; this.hoch = 0; this.lebend = 0;
      const geo = new THREE.BufferGeometry();
      const pa = new THREE.BufferAttribute(this.pos, 3), ca = new THREE.BufferAttribute(this.farbe, 3);
      if (pa.setUsage) { pa.setUsage(THREE.DynamicDrawUsage); ca.setUsage(THREE.DynamicDrawUsage); }
      geo.setAttribute('position', pa); geo.setAttribute('color', ca);
      const mat = new THREE.PointsMaterial({ size: groesse, map: tex || null, vertexColors: true, transparent: true, depthWrite: false,
        blending: THREE.AdditiveBlending, sizeAttenuation: true, fog: false });
      this.punkte = new THREE.Points(geo, mat);
      this.punkte.name = name; this.punkte.frustumCulled = false; this.punkte.visible = false; this.punkte.renderOrder = 20;
    }
    hochladen() { const g = this.punkte.geometry; g.attributes.position.needsUpdate = true; g.attributes.color.needsUpdate = true; }
    aus() { this.pos.fill(0); this.farbe.fill(0); this.leben.fill(0); this.hoch = 0; this.lebend = 0; this.hochladen(); }
    neu(art, x, y, z, vx, vy, vz, f, l) {
      const N = this.N;
      for (let k = 0; k < N; k++) {
        const i = (this.frei + k) % N;
        if (this.leben[i] > 0) continue;
        this.frei = (i + 1) % N; if (i + 1 > this.hoch) this.hoch = i + 1;
        const j = i * 3;
        this.pos[j] = x; this.pos[j + 1] = y; this.pos[j + 2] = z;
        this.vel[j] = vx; this.vel[j + 1] = vy; this.vel[j + 2] = vz;
        this.basis[j] = f[0]; this.basis[j + 1] = f[1]; this.basis[j + 2] = f[2];
        this.leben[i] = this.dauer[i] = l; this.art[i] = art;
        return i;
      }
      return -1;
    }
    /** Alle Teilchen um dt weiter; t = Showzeit (Funkeln). */
    schritt(dt, t, kams) {
      const nk = kams ? kams.length : 0;
      const drag = Math.pow(0.35, dt), dragLeicht = Math.pow(0.55, dt), dragFont = Math.pow(0.8, dt);
      const n = this.hoch; let lebend = 0, hoch = 0;
      const pos = this.pos, vel = this.vel, farbe = this.farbe, basis = this.basis, leben = this.leben, dauer = this.dauer, art = this.art;
      for (let i = 0; i < n; i++) {
        const L = leben[i];
        if (L <= 0) continue;
        const j = i * 3, nl = L - dt;
        if (nl <= 0) { leben[i] = 0; farbe[j] = farbe[j + 1] = farbe[j + 2] = 0; continue; }
        leben[i] = nl; lebend++; hoch = i + 1;
        const a = nl / dauer[i], k = art[i];
        let h;
        if (k === KONF) {
          // Konfetti: konstantes Sinken, seitliches Flattern, Aufblitzen beim Drehen, weiches Ein-/Ausblenden
          vel[j] += Math.sin(t * 3.1 + i * 1.7) * 1.6 * dt; vel[j + 2] += Math.cos(t * 2.7 + i * 2.3) * 1.6 * dt;
          pos[j] += vel[j] * dt; pos[j + 1] += vel[j + 1] * dt; pos[j + 2] += vel[j + 2] * dt;
          const e = Math.min(1, (dauer[i] - nl) / 0.3, nl / 0.6);
          h = e * (0.6 + 0.4 * Math.sin(t * 9 + i * 3.7));
        } else {
          let d = drag, g = SCHWERKRAFT;
          if (k === GLITZ) { d = dragLeicht; g = 3.2; } else if (k === FONT) { d = dragFont; g = 9; } else if (k === SPUR) { d = drag; g = 4; }
          vel[j] *= d; vel[j + 1] = vel[j + 1] * d - g * dt; vel[j + 2] *= d;
          pos[j] += vel[j] * dt; pos[j + 1] += vel[j + 1] * dt; pos[j + 2] += vel[j + 2] * dt;
          if (k === GLITZ) h = Math.min(1, a * 2.2) * (Math.sin(t * 47 + i * 7.3) > -0.15 ? 1 : 0.08);
          else if (k === FONT) h = Math.min(1, a * 1.8);
          else h = a * a * (0.75 + 0.25 * Math.sin(t * 40 + i));
        }
        if (nk) {   // zu nah an der Kamera → ausblenden (sonst riesige, verschwommene Punkte vor der Linse): ab 9 m voll, unter 3 m weg
          let dm = 1e9;
          for (let q = 0; q < nk; q++) { const c = kams[q], dx = pos[j] - c.x, dy = pos[j + 1] - c.y, dz = pos[j + 2] - c.z, dd = dx * dx + dy * dy + dz * dz; if (dd < dm) dm = dd; }
          if (dm < 81) { const u = Math.max(0, (Math.sqrt(dm) - 3) / 6); h *= u * u * (3 - 2 * u); }
        }
        farbe[j] = basis[j] * h; farbe[j + 1] = basis[j + 1] * h; farbe[j + 2] = basis[j + 2] * h;
      }
      this.hoch = hoch; this.lebend = lebend;
      if (lebend > 0 || n > 0) this.hochladen();
      return lebend;
    }
    zerstoeren() {
      if (this.punkte.parent) this.punkte.parent.remove(this.punkte);
      this.punkte.geometry.dispose(); this.punkte.material.dispose();
    }
  }

  class Feuerwerk {
    constructor(spiel) {
      this.spiel = spiel; this.c = cfg();
      this.tex = punktTextur();
      this.gross = new Pool(this.c.maxPunkte, this.c.punktGross, this.tex, 'Feuerwerk');
      this.fein = new Pool(this.c.maxFein, this.c.punktFein, this.tex, 'FeuerwerkFein');
      this.punkte = this.gross.punkte;     // (Tests/Altcode) das große Points-Objekt; beide Objekte: this.objekte
      this.objekte = [this.gross.punkte, this.fein.punkte];
      this.alleAus();
      this.aktiv = false; this.t = 0; this.raketen = []; this.fontaenen = []; this.gestartet = 0; this.knallZaehler = 0; this.geplatzt = 0; this.spitze = 0;
      this.konfettiRest = 0;
      if (spiel && spiel.szene) this.objekte.forEach(o => spiel.szene.add(o));
      this.zerstoert = false;
    }

    alleAus() { this.gross.aus(); this.fein.aus(); }
    _sichtbar(an) { this.objekte.forEach(o => { o.visible = an; }); }

    /** Show starten (nur einmal je Rennen). t = Teilnehmer (nur für den Seed). */
    start(t) {
      if (this.zerstoert || !this.c.an || this.aktiv || this.gestartet) return false;
      const st = this.spiel && this.spiel.strecke; if (!st || !st.spline) return false;
      this.gestartet = 1; this.aktiv = true; this.t = 0; this.geplatzt = 0; this.spitze = 0; this.konfettiRest = 0;
      this.rnd = rng(((st.laenge | 0) * 2654435761) ^ ((t && t.nr) || 0));
      const n = Math.max(6, Math.min(24, this.c.raketen | 0)), r = this.rnd, C = this.c;
      this.raketen = [];
      const finale = Math.min(4, n >> 2);
      for (let i = 0; i < n; i++) {
        const k = i - (n - finale);
        const zeit = k >= 0 ? C.dauer - 1.2 + k * 0.3                                    // Finale: dicht hintereinander
          : 0.3 + (C.dauer - 1.9) * (i / Math.max(1, n - finale - 1)) * (0.94 + r() * 0.1);
        const f0 = (i * 3 + ((r() * FARBEN.length) | 0)) % FARBEN.length;
        this.raketen.push({
          zeit, flug: C.flug[0] + r() * (C.flug[1] - C.flug[0]), u: ((i * 7) % n + r() * 0.8) / n, seite: i % 2 ? 1 : -1,
          farbe: FARBEN[f0], farbe2: FARBEN[(f0 + 2 + ((r() * 3) | 0)) % FARBEN.length], farbe3: FARBEN[(f0 + 4 + ((r() * 3) | 0)) % FARBEN.length],
          phase: 0, tr: 0, bogen: (r() * 2 - 1) * 4, von: null, nach: null, t0: 0, tZwei: 0,
          quer: (r() * 2 - 1) * C.quer, ang: (C.winkel[0] + r() * (C.winkel[1] - C.winkel[0])) * Math.PI / 180, vorher: 0,
        });
      }
      // Bodenfontänen links/rechts der Ziellinie (s = 0) und ein zweites Paar 70 m dahinter
      this.fontaenen = [];
      if (C.fontaenen) {
        const sp = st.spline, weite = (st.breite || 12) / 2 + (st.randBreite || 1.5) + 2.5;
        [[0, 0], [70, 0.35]].forEach(([ds, t0]) => {
          const p = sp.punktBei(sp.wrapS(ds));
          [-1, 1].forEach((seite) => {
            const x = p.x + p.nx * weite * seite, z = p.z + p.nz * weite * seite, y = (st.hoeheAn ? st.hoeheAn(x, z) : p.y || 0) + 0.3;
            this.fontaenen.push({ x, y, z, t0, rest: 0, nx: -p.nx * seite, nz: -p.nz * seite, ton: false });
          });
        });
      }
      this._sichtbar(true);
      return true;
    }

    // ---------------------------------------------------------- Ton
    _ton(art) {
      const A = R.Audio, l = this.c.lautstaerke;
      if (!A || !A._bereit || !A._bereit() || !A._effekte) return;
      try {
        if (art === 'zisch') A._stoss(0.9, 0.05 * l, 'bandpass', 700, 3200, 2, 0);
        else if (art === 'fontaene') A._stoss(2.6, 0.035 * l, 'bandpass', 2600, 1500, 1.4, 0);
        else {
          const k = (this.knallZaehler++ % 3);
          if (k === 0) {            // dumpfer Bums
            A._stoss(0.4, 0.11 * l, 'lowpass', 1100, 130, 1, 0);
            A._ton(92, 42, 0.26, 'sine', 0.09 * l, 0);
          } else if (k === 1) {     // heller Kracher
            A._stoss(0.16, 0.09 * l, 'highpass', 1900, 900, 0.8, 0);
            A._stoss(0.45, 0.08 * l, 'lowpass', 1500, 170, 1, 0.01);
            A._ton(125, 52, 0.2, 'sine', 0.07 * l, 0);
          } else {                  // Doppelschlag
            A._stoss(0.3, 0.08 * l, 'lowpass', 1200, 150, 1, 0);
            A._stoss(0.38, 0.10 * l, 'lowpass', 1000, 120, 1, 0.13);
            A._ton(80, 38, 0.3, 'sine', 0.08 * l, 0.13);
          }
          for (let j = 0; j < 5; j++) A._stoss(0.05, 0.03 * l, 'highpass', 4200 + 400 * j, 4200 + 400 * j, 1, 0.12 + 0.07 * j + 0.03 * k);   // Knistern
        }
      } catch (e) { /* nur Ton */ }
    }

    // ---------------------------------------------------------- Raketen
    /** Zielpunkt der Rakete beim Start: relativ zum Auto der ersten Kamera (Bogenlänge voraus), sonst zur Ziellinie. */
    _ziel(r) {
      const S = this.spiel, st = S.strecke, sp = st.spline, C = this.c, rnd = this.rnd;
      let sRef = 0;
      try {
        const k = S.kameras && S.kameras[0], fz = k && S.fahrzeuge && S.fahrzeuge.find(f => f.vehicle === k.ziel);
        if (fz && fz.nah && isFinite(fz.nah.s)) sRef = fz.nah.s;
      } catch (e) { sRef = 0; }
      const dB = C.nachVorn[0] + (C.nachVorn[1] - C.nachVorn[0]) * r.u, sB = sRef + dB;
      const hoch = Math.max(C.hoeheMin, Math.min(C.hoeheMax, 10 + dB * Math.tan(r.ang) * 1.3));
      const sS = sB - 6 - rnd() * 10, weite = (st.breite || 12) / 2 + (st.randBreite || 1.5) + 2.5;
      const pB = sp.punktBei(sp.wrapS(sB)), pS = sp.punktBei(sp.wrapS(sS));
      const bx = pB.x + pB.nx * r.quer, bz = pB.z + pB.nz * r.quer, by = (st.hoeheAn ? st.hoeheAn(bx, bz) : pB.y || 0) + hoch;
      const sx = pS.x + pS.nx * weite * r.seite, sz = pS.z + pS.nz * weite * r.seite, sy = (st.hoeheAn ? st.hoeheAn(sx, sz) : pS.y || 0);
      r.von = [sx, sy, sz]; r.nach = [bx, by, bz];
    }

    /** Hauptkugel (Chrysanthemum): Kugel, 75 % Hauptfarbe / 25 % Zweitfarbe. */
    _platzen(r) {
      const C = this.rnd, cf = this.c, G = this.gross;
      const [v0, v1] = cf.kugelTempo, n = cf.funken;
      for (let k = 0; k < n; k++) {
        const u = C() * 2 - 1, ph = C() * Math.PI * 2, w = Math.sqrt(1 - u * u), v = v0 + C() * (v1 - v0);
        G.neu(FUNKE, r.nach[0], r.nach[1], r.nach[2], w * Math.cos(ph) * v, u * v, w * Math.sin(ph) * v, C() < 0.75 ? r.farbe : r.farbe2, 1.9 + C() * 1.1);
      }
      this.geplatzt++;
      r.tZwei = this.t + 0.45;
      this._ton('knall');
    }

    /** Doppel-Explosion: innere Kugel in dritter Farbe + weißes Zentrum, dazu Glitzer-Nachfallen. */
    _zweit(r) {
      const C = this.rnd, cf = this.c, G = this.gross, F = this.fein;
      for (let k = 0; k < cf.funkenInnen; k++) {
        const u = C() * 2 - 1, ph = C() * Math.PI * 2, w = Math.sqrt(1 - u * u), v = 8 + C() * 6;
        G.neu(FUNKE, r.nach[0], r.nach[1], r.nach[2], w * Math.cos(ph) * v, u * v, w * Math.sin(ph) * v, k % 5 === 0 ? FARBEN[5] : r.farbe3, 1.4 + C() * 0.7);
      }
      for (let k = 0; k < cf.glitzer; k++) {
        const u = C() * 2 - 1, ph = C() * Math.PI * 2, w = Math.sqrt(1 - u * u), v = 4 + C() * 14;
        F.neu(GLITZ, r.nach[0], r.nach[1], r.nach[2], w * Math.cos(ph) * v, u * v, w * Math.sin(ph) * v, C() < 0.7 ? [1, 0.85, 0.45] : [1, 1, 1], 1.6 + C() * 1.2);
      }
      this._ton('knall');
    }

    _fontaene(f, dt) {
      const C = this.rnd, F = this.fein, cfg = this.c;
      f.rest += cfg.fontaeneRate * dt;
      while (f.rest >= 1) {
        f.rest -= 1;
        const ph = C() * Math.PI * 2, rr = C() * 2.4, c = C();
        const farbe = c < 0.5 ? [1, 0.78, 0.4] : c < 0.8 ? [1, 1, 1] : c < 0.92 ? [1, 0.5, 0.2] : [0.5, 0.85, 1];
        F.neu(FONT, f.x, f.y, f.z, Math.cos(ph) * rr + f.nx * 1.5, 12 + C() * 6, Math.sin(ph) * rr + f.nz * 1.5, farbe, 1.3 + C() * 0.5);
      }
    }

    /** Konfetti-Regen im Blickfeld jeder Kamera (vor, über und neben dem Auto). */
    _konfetti(dt) {
      const S = this.spiel, ks = S && S.kameras, F = this.fein, C = this.rnd, cfg = this.c;
      if (!ks || !ks.length || !(cfg.konfetti > 0)) return;
      this.konfettiRest += cfg.konfetti * dt;
      const V = this._v || (this._v = new THREE.Vector3());
      while (this.konfettiRest >= 1) {
        this.konfettiRest -= 1;
        const kam = ks[(C() * ks.length) | 0].kamera; if (!kam) continue;
        kam.getWorldDirection(V);
        let fx = V.x, fz = V.z; const l = Math.hypot(fx, fz) || 1; fx /= l; fz /= l;
        const d = 12 + C() * 28, seit = (C() * 2 - 1) * d * 0.75, h = 2 + C() * 15;
        const x = kam.position.x + fx * d - fz * seit, z = kam.position.z + fz * d + fx * seit, y = kam.position.y + h;
        const fall = 2.2 + C() * 1.8;
        F.neu(KONF, x, y, z, (C() - 0.5) * 1.2, -fall, (C() - 0.5) * 1.2, KONFETTI[(C() * KONFETTI.length) | 0], Math.min(4.2, (h + 2.5) / fall));
      }
    }

    /** dt in s (Frame-Zeit; 0 = Pause). */
    update(dt) {
      if (this.zerstoert || !this.aktiv || !(dt > 0)) return;
      dt = Math.min(dt, 0.1);
      this.t += dt;
      const C = this.rnd, F = this.fein;
      for (const r of this.raketen) {
        if (r.phase === 0 && this.t >= r.zeit) { this._ziel(r); r.phase = 1; r.t0 = this.t; this._ton('zisch'); }
        if (r.phase === 1) {
          const q = Math.min(1, (this.t - r.t0) / r.flug), e = 1 - (1 - q) * (1 - q);
          const x = r.von[0] + (r.nach[0] - r.von[0]) * e + r.bogen * Math.sin(q * Math.PI);
          const y = r.von[1] + (r.nach[1] - r.von[1]) * e, z = r.von[2] + (r.nach[2] - r.von[2]) * e;
          r.tr += dt;
          while (r.tr > 0.025) { r.tr -= 0.025; F.neu(SPUR, x, y, z, (C() - 0.5) * 2, -2 - C() * 2, (C() - 0.5) * 2, [1, 0.7, 0.3], 0.5 + C() * 0.3); }
          if (q >= 1) { r.phase = 2; this._platzen(r); }
        } else if (r.phase === 2 && this.t >= r.tZwei) { r.phase = 3; this._zweit(r); }
      }
      if (this.c.fontaenen) for (const f of this.fontaenen) {
        const u = this.t - f.t0;
        if (u >= 0 && u < this.c.fontaeneDauer) { if (!f.ton) { f.ton = true; this._ton('fontaene'); } this._fontaene(f, dt); }
      }
      if (this.t < this.c.dauer - 0.2) this._konfetti(dt);
      const kams = this._kams || (this._kams = []); kams.length = 0;
      const ks = this.spiel && this.spiel.kameras;
      if (ks) for (let i = 0; i < ks.length; i++) { const kp = ks[i] && ks[i].kamera && ks[i].kamera.position; if (kp) kams.push(kp); }
      const lebend = this.gross.schritt(dt, this.t, kams) + F.schritt(dt, this.t, kams);
      if (lebend > this.spitze) this.spitze = lebend;
      if (this.t > this.c.dauer + 0.5 && lebend === 0 && this.raketen.every(r => r.phase === 3)) this.beenden();
    }

    beenden() { this.aktiv = false; this._sichtbar(false); this.alleAus(); }

    /** Sichtbar, solange die Show läuft (Tests). */
    get laeuft() { return this.aktiv; }
    /** Anzahl lebender Funken (Tests). */
    lebende() { let n = 0; for (const P of [this.gross, this.fein]) for (let i = 0; i < P.N; i++) if (P.leben[i] > 0) n++; return n; }

    zerstoeren() {
      if (this.zerstoert) return;
      this.zerstoert = true; this.aktiv = false;
      this.gross.zerstoeren(); this.fein.zerstoeren();
      if (this.tex) this.tex.dispose();
      this.tex = null;
    }
  }

  R.Feuerwerk = {
    Klasse: Feuerwerk,
    /** Sekunden bis die Ergebnistafel erscheinen soll (0 = sofort): läuft ein Feuerwerk, bis tafelNach (von dessen Start an gerechnet). */
    tafelWartezeit(spiel) {
      const f = spiel && spiel.feuerwerk;
      if (!f || f.zerstoert || !f.aktiv) return 0;
      return Math.max(0, (f.c.tafelNach || 0) - f.t);
    },
    /**
     * Beim Rennaufbau aufrufen (nach spiel.rennen/spiel.szene): legt spiel.feuerwerk an und hängt es ans 'ziel'-Ereignis.
     * Ein Mensch (t.istSpieler) auf Platz 1 löst es aus – offline, Zweispieler und online (Server-Ergebnis).
     */
    verbinden(spiel) {
      if (!spiel || !spiel.rennen || !spiel.szene) return null;
      if (!cfg().an) return null;
      if (spiel.feuerwerk) spiel.feuerwerk.zerstoeren();
      const f = spiel.feuerwerk = new Feuerwerk(spiel);
      spiel.rennen.bei('ziel', (t) => { if (t && t.istSpieler && t.zielPlatz === 1 && spiel.feuerwerk === f) f.start(t); });
      return f;
    },
  };
})();
