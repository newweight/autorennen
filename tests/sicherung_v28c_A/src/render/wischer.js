// ============================================================
// Scheibenwischer-Overlay (14.10. v21): bei Regen, Schnee und Hagel liegen Tropfen/Flocken auf der „Scheibe“ (2D-Canvas über dem
// Spiel, unterer Teil der Ansicht), zwei schwarze Wischerarme wischen im Takt darüber und räumen sie ab.
//
//   const w = Rennspiel.wischer.fuerHud(hud, wurzelElement)   → Objekt mit  update(art, wind, sichtbar)  groesse(vw, vh)  zerstoeren()
//   Rennspiel.wischer.art(wetter)                             → 'regen' | 'schnee' | 'hagel' | null   (rein, Node-testbar)
//   Rennspiel.wischer.winkel(phase, cfg)                      → Armwinkel in Grad (rein)
//
// Ohne Niederschlag (oder an = false) ist das Canvas versteckt und es wird NICHTS gezeichnet. Gezeichnet wird mit max. 30 Hz in
// geringer Auflösung (config.cockpit.wischer.aufloesung). Alle Zahlen: config.cockpit.wischer (Prozent der Ansicht).
// ============================================================
(function () {
  const R = window.Rennspiel;
  const W = {};
  R.wischer = W;

  const DEG = Math.PI / 180;

  /** Niederschlagsart des Wetter-Objekts (R.Wetter.wetterArt) oder null. */
  W.art = function (wetter) {
    const a = wetter && wetter.wetterArt;
    return a === 'regen' || a === 'schnee' || a === 'hagel' ? a : null;
  };

  /** Armwinkel (Grad, 180 = Ruhelage flach nach links, kleiner = weiter hochgeschwenkt) für Phase 0..1 (hin und zurück, weich). */
  W.winkel = function (phase, cfg) {
    const p = phase - Math.floor(phase);
    const t = p < 0.5 ? p * 2 : (1 - p) * 2;                 // 0 → 1 → 0
    const weich = t * t * (3 - 2 * t);                       // smoothstep: Anschläge ohne Ruck
    return 180 - cfg.armWinkel * weich;
  };

  class Wischer {
    constructor(hud, wurzel) {
      this.hud = hud;
      this.canvas = document.createElement('canvas');
      this.canvas.className = 'hud-wischer';
      Object.assign(this.canvas.style, { position: 'absolute', left: '0', bottom: '0', width: '100%', pointerEvents: 'none', display: 'none' });
      wurzel.insertBefore(this.canvas, wurzel.firstChild);   // unter den übrigen HUD-Teilen
      this.g = this.canvas.getContext('2d');
      this.vw = 0; this.vh = 0; this.cw = 0; this.ch = 0;
      this.tropfen = [];          // { x, y, r, a } in Canvas-Pixeln
      this.phase = 0; this.winkelAlt = 180;
      this.letzte = 0; this.sichtbar = false; this.art = null;
      this.zufall = 12345;
    }

    _z() { this.zufall = (this.zufall * 1664525 + 1013904223) >>> 0; return this.zufall / 4294967296; }

    groesse(vw, vh) {
      this.vw = vw; this.vh = vh;
      const c = R.config.cockpit.wischer, s = Math.max(0.2, Math.min(1, c.aufloesung || 0.6));
      this.cw = Math.max(40, Math.round(vw * s)); this.ch = Math.max(20, Math.round(vh * c.hoehe / 100 * s));
      this.canvas.width = this.cw; this.canvas.height = this.ch;
      this.canvas.style.height = (vh * c.hoehe / 100) + 'px';
      this.canvas.style.bottom = (vh * (c.unten || 0) / 100) + 'px';
      this.tropfen.length = 0;
    }

    /** Pro HUD-Update. art: 'regen' | 'schnee' | 'hagel' | null; wind 0..5; an: Kamera-Modus erlaubt. */
    update(art, wind, an) {
      const c = R.config.cockpit.wischer;
      const aktiv = !!(c.an && an && art && this.cw > 0);
      if (!aktiv) {
        if (this.sichtbar) { this.sichtbar = false; this.canvas.style.display = 'none'; this.tropfen.length = 0; this.g.clearRect(0, 0, this.cw, this.ch); }
        this.letzte = 0;
        return;
      }
      const jetzt = performance.now();
      if (!this.sichtbar) { this.sichtbar = true; this.canvas.style.display = 'block'; this.letzte = jetzt; }
      if (art !== this.art) { this.art = art; this.tropfen.length = 0; }
      const rate = R.config.cockpit.zeichenrate || 30;
      if (jetzt - this.letzte < 1000 / rate - 1) return;
      const dt = Math.min(0.1, (jetzt - this.letzte) / 1000);
      this.letzte = jetzt;
      this._schritt(dt, art, wind || 0, c);
      this._zeichnen(art, c);
    }

    _schritt(dt, art, wind, c) {
      const takt = (c.takt[art] || 1.5) * (1 - 0.06 * Math.min(5, wind));      // stärkerer Wind = schneller
      this.phase += dt / takt;
      const w = W.winkel(this.phase, c), w0 = this.winkelAlt;
      this.winkelAlt = w;
      const max = c.tropfen[art] || 100;
      // neue Tropfen/Flocken
      let neu = (c.rate[art] || 50) * (1 + 0.12 * wind) * dt + (this._rest || 0);
      const n = Math.floor(neu); this._rest = neu - n;
      const s = this.cw / 640;                       // Größen skalieren mit der Breite
      for (let i = 0; i < n && this.tropfen.length < max; i++) {
        const r = (art === 'schnee' ? 3.2 + this._z() * 5.5 : art === 'hagel' ? 2.4 + this._z() * 2.6 : 1.3 + this._z() * 3.0) * Math.max(0.7, s);
        this.tropfen.push({ x: this._z() * this.cw, y: this._z() * this.ch, r, a: 0, rin: this._z() });
      }
      // Wischer: Sektor zwischen altem und neuem Winkel räumt ab
      const lo = Math.min(w, w0) - 1.5, hi = Math.max(w, w0) + 1.5;
      const L = this._armLaenge(c);
      const py = this.ch;
      for (let k = 0; k < c.armX.length; k++) {
        const px = this.cw * c.armX[k] / 100;
        for (let i = this.tropfen.length - 1; i >= 0; i--) {
          const t = this.tropfen[i], dx = t.x - px, dy = py - t.y;
          const d = Math.sqrt(dx * dx + dy * dy);
          if (d > L + t.r) continue;
          const winkel = Math.atan2(dy, dx) / DEG;                 // 0 = rechts, 90 = oben, 180 = links
          if (winkel >= lo && winkel <= hi) { this.tropfen[i] = this.tropfen[this.tropfen.length - 1]; this.tropfen.pop(); }
        }
      }
      for (let i = 0; i < this.tropfen.length; i++) { const t = this.tropfen[i]; if (t.a < 1) t.a = Math.min(1, t.a + dt * 5); }
    }

    _armLaenge(c) { return Math.min(this.cw * c.armLaenge / 100, this.ch * 0.96); }

    _zeichnen(art, c) {
      const g = this.g, cw = this.cw, ch = this.ch;
      g.clearRect(0, 0, cw, ch);
      // Tropfen / Flocken
      const T = this.tropfen;
      for (let i = 0; i < T.length; i++) {
        const t = T[i];
        g.globalAlpha = t.a;
        if (art === 'regen') {
          g.fillStyle = 'rgba(175,205,245,0.22)'; g.beginPath(); g.arc(t.x, t.y, t.r, 0, 6.2832); g.fill();
          g.strokeStyle = 'rgba(255,255,255,0.42)'; g.lineWidth = 1; g.stroke();
          g.fillStyle = 'rgba(255,255,255,0.85)'; g.beginPath(); g.arc(t.x - t.r * 0.35, t.y - t.r * 0.35, Math.max(0.6, t.r * 0.28), 0, 6.2832); g.fill();
        } else if (art === 'schnee') {
          g.fillStyle = 'rgba(250,252,255,0.88)'; g.beginPath(); g.arc(t.x, t.y, t.r, 0, 6.2832); g.fill();
          g.strokeStyle = 'rgba(200,220,245,0.9)'; g.lineWidth = 1; g.stroke();
        } else {
          g.fillStyle = 'rgba(225,240,255,0.80)'; g.beginPath(); g.arc(t.x, t.y, t.r, 0, 6.2832); g.fill();
          g.strokeStyle = 'rgba(140,175,215,0.95)'; g.lineWidth = 1.2; g.stroke();
          g.fillStyle = '#fff'; g.beginPath(); g.arc(t.x - t.r * 0.3, t.y - t.r * 0.3, Math.max(0.7, t.r * 0.3), 0, 6.2832); g.fill();
        }
      }
      g.globalAlpha = 1;
      // Arme
      const L = this._armLaenge(c), w = this.winkelAlt * DEG, breit = Math.max(2.5, cw * 0.0075);
      g.lineCap = 'round';
      for (let k = 0; k < c.armX.length; k++) {
        const px = cw * c.armX[k] / 100, py = ch + breit * 0.2;
        const ex = px + Math.cos(w) * L, ey = py - Math.sin(w) * L;
        g.strokeStyle = '#0b0b0d'; g.lineWidth = breit; g.beginPath(); g.moveTo(px, py); g.lineTo(ex, ey); g.stroke();   // Arm
        // Wischerblatt (etwas dicker, im äußeren Teil) + Glanzkante
        const bx = px + Math.cos(w) * L * 0.28, by = py - Math.sin(w) * L * 0.28;
        g.strokeStyle = '#1a1a1e'; g.lineWidth = breit * 1.7; g.beginPath(); g.moveTo(bx, by); g.lineTo(ex, ey); g.stroke();
        g.strokeStyle = 'rgba(255,255,255,0.3)'; g.lineWidth = Math.max(1, breit * 0.25); g.beginPath(); g.moveTo(bx, by); g.lineTo(ex, ey); g.stroke();
        g.fillStyle = '#16161a'; g.beginPath(); g.arc(px, py, breit * 1.3, 0, 6.2832); g.fill();                              // Drehpunkt
      }
    }

    zerstoeren() { if (this.canvas.parentNode) this.canvas.parentNode.removeChild(this.canvas); }
  }

  W.fuerHud = function (hud, wurzel) { return new Wischer(hud, wurzel); };
})();
