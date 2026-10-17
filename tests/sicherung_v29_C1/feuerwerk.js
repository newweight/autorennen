// v28 W8: Feuerwerk an Start/Ziel, wenn ein SPIELER (Mensch) als Erster ins Ziel kommt.
//
// Reine Client-Optik (kein Protokoll, keine Physik): hängt am 'ziel'-Ereignis des RaceManagers (offline wie online – online meldet
// online.js das Server-Ergebnis über denselben Weg). Auslöser: t.istSpieler && t.zielPlatz === 1. Zweispieler: der Mensch, der zuerst ankommt;
// gewinnt ein Computerfahrer, gibt es kein Feuerwerk.
//
// Aufbau: EIN Points-Objekt (additiv, Pool fester Größe, kein Licht, kein Nebel) = 1 Draw-Call, nur solange sichtbar (sonst 0).
// Raketen (6–10, Standard 8) steigen am Straßenrand der Zielgeraden auf und platzen 55–170 m hinter der Ziellinie in 9–40 m Höhe (Blickwinkel 3–9°
// über dem Horizont, damit sie beim Ausrollen in Verfolger-, Cockpit- und Ergebnis-Ansicht im Bild sind) und lassen farbige Funken regnen. Die ganze Show dauert ~6 s plus Ausklingen (~2 s).
// Ton per WebAudio-Synthese über die vorhandenen Helfer von R.Audio (_stoss/_ton → Effekt-Bus → Master-Lautstärke), leise.
// Lebenslauf: R.Feuerwerk.verbinden(spiel) beim Rennaufbau (main.js rennenStarten, online.js) → spiel.feuerwerk; spiel.feuerwerk.update(dt) je Frame;
// zerstoeren() in szeneAbbauen (Geometrie, Material, Textur). Material schon vor dem Countdown vorhanden → Teil von _vorwaermen
// (Objekt ist unsichtbar, _vorwaermen macht es kurz sichtbar und übersetzt/lädt es). Schalter: config.feuerwerk.an = false.
(function () {
  'use strict';
  const R = (typeof window !== 'undefined' ? window.Rennspiel : (global.Rennspiel = global.Rennspiel || {}));
  const THREE = (typeof window !== 'undefined' ? window.THREE : global.THREE);
  if (!R || !THREE) return;

  const STANDARD = {
    an: true,
    raketen: 8,          // 6–10
    dauer: 6,            // s, über die die Starts verteilt sind
    funken: 80,          // je Rakete
    maxPunkte: 1100,     // Pool
    flug: [1.0, 1.35],   // s Steigzeit
    winkel: [3, 9],      // Grad über dem Horizont (von der Ziellinie aus gesehen): so bleiben die Knalle auch beim Ausrollen im Bild (Verfolger/Cockpit)
    nachVorn: [55, 170], // m hinter der Ziellinie (Bogenlänge)
    hoeheMax: 42,
    quer: 13,            // m seitlich um die Straßenmitte
    lautstaerke: 0.8,    // 0..1 (Effekt-Bus + Master gelten zusätzlich)
  };
  const FARBEN = [[1, 0.25, 0.2], [1, 0.8, 0.2], [0.3, 0.9, 1], [1, 0.4, 0.8], [0.4, 1, 0.45], [1, 1, 1], [0.7, 0.5, 1], [1, 0.55, 0.15]];
  const SCHWERKRAFT = 7;

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

  class Feuerwerk {
    constructor(spiel) {
      this.spiel = spiel; this.c = cfg();
      const N = this.N = this.c.maxPunkte;
      this.pos = new Float32Array(N * 3); this.farbe = new Float32Array(N * 3);
      this.vel = new Float32Array(N * 3); this.leben = new Float32Array(N); this.dauer = new Float32Array(N); this.basis = new Float32Array(N * 3);
      this.frei = 0;
      const geo = new THREE.BufferGeometry();
      const pa = new THREE.BufferAttribute(this.pos, 3), ca = new THREE.BufferAttribute(this.farbe, 3);
      if (pa.setUsage) { pa.setUsage(THREE.DynamicDrawUsage); ca.setUsage(THREE.DynamicDrawUsage); }
      geo.setAttribute('position', pa); geo.setAttribute('color', ca);
      this.tex = punktTextur();
      const mat = new THREE.PointsMaterial({ size: 2.2, map: this.tex || null, vertexColors: true, transparent: true, depthWrite: false,
        blending: THREE.AdditiveBlending, sizeAttenuation: true, fog: false });
      this.punkte = new THREE.Points(geo, mat);
      this.punkte.name = 'Feuerwerk'; this.punkte.frustumCulled = false; this.punkte.visible = false;
      this.punkte.renderOrder = 20;
      this.alleAus();
      this.aktiv = false; this.t = 0; this.raketen = []; this.gestartet = 0; this.knallZaehler = 0;
      if (spiel && spiel.szene) spiel.szene.add(this.punkte);
      this.zerstoert = false;
    }

    alleAus() { this.pos.fill(0); this.farbe.fill(0); this.leben.fill(0); this._hochladen(); }
    _hochladen() { const g = this.punkte.geometry; g.attributes.position.needsUpdate = true; g.attributes.color.needsUpdate = true; }

    /** Show starten (nur einmal je Rennen). t = Teilnehmer (nur für den Seed). */
    start(t) {
      if (this.zerstoert || !this.c.an || this.aktiv || this.gestartet) return false;
      const st = this.spiel && this.spiel.strecke; if (!st || !st.spline) return false;
      this.gestartet = 1; this.aktiv = true; this.t = 0;
      this.rnd = rng(((st.laenge | 0) * 2654435761) ^ ((t && t.nr) || 0));
      const n = Math.max(6, Math.min(10, this.c.raketen | 0)), r = this.rnd, C = this.c;
      this.raketen = [];
      const sp = st.spline, weite = (st.breite || 12) / 2 + (st.randBreite || 1.5) + 2.5;
      for (let i = 0; i < n; i++) {
        const sB = C.nachVorn[0] + (C.nachVorn[1] - C.nachVorn[0]) * ((i + r() * 0.8) / n);   // Bogenlänge des Knalls: nach hinten gestaffelt
        const quer = (r() * 2 - 1) * C.quer, ang = (C.winkel[0] + r() * (C.winkel[1] - C.winkel[0])) * Math.PI / 180, hoch = Math.min(C.hoeheMax, 6 + sB * Math.tan(ang));
        const seite = i % 2 ? 1 : -1, sS = sB - 6 - r() * 10;
        const pB = sp.punktBei(sp.wrapS(sB)), pS = sp.punktBei(sp.wrapS(sS));
        const bx = pB.x + pB.nx * quer, bz = pB.z + pB.nz * quer, by = (st.hoeheAn ? st.hoeheAn(bx, bz) : pB.y || 0) + hoch;
        const sx = pS.x + pS.nx * weite * seite, sz = pS.z + pS.nz * weite * seite, sy = (st.hoeheAn ? st.hoeheAn(sx, sz) : pS.y || 0);
        this.raketen.push({
          zeit: 0.15 + (C.dauer - 0.15) * (i / Math.max(1, n - 1)) * (0.92 + r() * 0.16),   // Start-Zeitpunkt
          flug: C.flug[0] + r() * (C.flug[1] - C.flug[0]),
          von: [sx, sy, sz], nach: [bx, by, bz], farbe: FARBEN[(i * 3 + ((r() * FARBEN.length) | 0)) % FARBEN.length],
          phase: 0, tr: 0, bogen: (r() * 2 - 1) * 4,
        });
      }
      this.punkte.visible = true;
      return true;
    }

    _neu(x, y, z, vx, vy, vz, f, l) {
      const N = this.N;
      for (let k = 0; k < N; k++) {
        const i = (this.frei + k) % N;
        if (this.leben[i] > 0) continue;
        this.frei = (i + 1) % N;
        this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
        this.vel[i * 3] = vx; this.vel[i * 3 + 1] = vy; this.vel[i * 3 + 2] = vz;
        this.basis[i * 3] = f[0]; this.basis[i * 3 + 1] = f[1]; this.basis[i * 3 + 2] = f[2];
        this.leben[i] = this.dauer[i] = l;
        return i;
      }
      return -1;
    }

    _ton(art) {
      const A = R.Audio, l = this.c.lautstaerke;
      if (!A || !A._bereit || !A._bereit() || !A._effekte) return;
      try {
        if (art === 'zisch') A._stoss(0.9, 0.05 * l, 'bandpass', 700, 3200, 2, 0);
        else {
          const k = (this.knallZaehler++ % 3);
          A._stoss(0.35, 0.09 * l, 'lowpass', 1100, 140, 1, 0);
          A._ton(95 - k * 8, 45, 0.22, 'sine', 0.07 * l, 0);
          for (let j = 0; j < 4; j++) A._stoss(0.05, 0.03 * l, 'highpass', 4200 + 400 * j, 4200 + 400 * j, 1, 0.1 + 0.07 * j + 0.03 * k);   // Knistern
        }
      } catch (e) { /* nur Ton */ }
    }

    _platzen(r) {
      const n = this.c.funken, C = this.rnd;
      const farben = [r.farbe, FARBEN[(FARBEN.indexOf(r.farbe) + 2) % FARBEN.length]];
      for (let k = 0; k < n; k++) {
        // gleichmäßig auf der Kugel
        const u = C() * 2 - 1, ph = C() * Math.PI * 2, w = Math.sqrt(1 - u * u), v = 8 + C() * 7;
        this._neu(r.nach[0], r.nach[1], r.nach[2], w * Math.cos(ph) * v, u * v, w * Math.sin(ph) * v, farben[k % (C() < 0.8 ? 1 : 2)], 1.5 + C() * 1.0);
      }
      this._ton('knall');
    }

    /** dt in s (Frame-Zeit; 0 = Pause). */
    update(dt) {
      if (this.zerstoert || !this.aktiv || !(dt > 0)) return;
      dt = Math.min(dt, 0.1);
      this.t += dt;
      const C = this.rnd;
      for (const r of this.raketen) {
        if (r.phase === 0 && this.t >= r.zeit) { r.phase = 1; r.t0 = this.t; this._ton('zisch'); }
        if (r.phase === 1) {
          const q = Math.min(1, (this.t - r.t0) / r.flug), e = 1 - (1 - q) * (1 - q);
          const x = r.von[0] + (r.nach[0] - r.von[0]) * e + r.bogen * Math.sin(q * Math.PI);
          const y = r.von[1] + (r.nach[1] - r.von[1]) * e, z = r.von[2] + (r.nach[2] - r.von[2]) * e;
          r.tr += dt;
          while (r.tr > 0.025) { r.tr -= 0.025; this._neu(x, y, z, (C() - 0.5) * 2, -2 - C() * 2, (C() - 0.5) * 2, [1, 0.7, 0.3], 0.5 + C() * 0.3); }
          if (q >= 1) { r.phase = 2; this._platzen(r); }
        }
      }
      const N = this.N, drag = Math.pow(0.35, dt);   // Luftwiderstand: ~65 % Tempoverlust je Sekunde
      let lebend = 0;
      for (let i = 0; i < N; i++) {
        const L = this.leben[i];
        if (L <= 0) { continue; }
        const nl = L - dt;
        if (nl <= 0) { this.leben[i] = 0; this.farbe[i * 3] = this.farbe[i * 3 + 1] = this.farbe[i * 3 + 2] = 0; continue; }
        this.leben[i] = nl; lebend++;
        const j = i * 3;
        this.vel[j] *= drag; this.vel[j + 1] = this.vel[j + 1] * drag - SCHWERKRAFT * dt; this.vel[j + 2] *= drag;
        this.pos[j] += this.vel[j] * dt; this.pos[j + 1] += this.vel[j + 1] * dt; this.pos[j + 2] += this.vel[j + 2] * dt;
        const a = nl / this.dauer[i], h = a * a * (0.75 + 0.25 * Math.sin(this.t * 40 + i));   // abklingen + Funkeln
        this.farbe[j] = this.basis[j] * h; this.farbe[j + 1] = this.basis[j + 1] * h; this.farbe[j + 2] = this.basis[j + 2] * h;
      }
      this._hochladen();
      if (this.t > this.c.dauer + 0.5 && lebend === 0 && this.raketen.every(r => r.phase === 2)) this.beenden();
    }

    beenden() { this.aktiv = false; this.punkte.visible = false; this.alleAus(); }

    /** Sichtbar, solange die Show läuft (Tests). */
    get laeuft() { return this.aktiv; }
    /** Anzahl lebender Funken (Tests). */
    lebende() { let n = 0; for (let i = 0; i < this.N; i++) if (this.leben[i] > 0) n++; return n; }

    zerstoeren() {
      if (this.zerstoert) return;
      this.zerstoert = true; this.aktiv = false;
      if (this.punkte.parent) this.punkte.parent.remove(this.punkte);
      this.punkte.geometry.dispose();
      if (this.punkte.material.map) this.punkte.material.map.dispose();
      this.punkte.material.dispose();
      this.tex = null;
    }
  }

  R.Feuerwerk = {
    Klasse: Feuerwerk,
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
