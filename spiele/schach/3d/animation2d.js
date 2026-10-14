/* PieceAnimationView (SchachSpiel.swift ~3807–4194) als Canvas-Overlay: Figur hebt ab, gleitet im Bogen übers Brett,
 * beim Schlagen folgt die Kampfphase (Funken, Opfer schrumpft/verblasst, Sieger stampft auf).
 * "Show-Modus" (hunde:true) = längere, größere Kampfshow mit Comic-Explosion, Knochen-/Pfoten-Funken, "WUFF!" und Banner
 * mit den Namen des Hunde-Teams (eigene Figuren Bruno/Luna/…, keine Fremdmarke).
 * Benutzung:
 *   const a = new Animation2D(containerElement);           // legt ein transparentes Canvas über den Container
 *   await a.animiere({ typ:'knight', weiss:true, schlag:{typ:'pawn', weiss:false}|null,
 *                      von:{x,y}, nach:{x,y}, zelle: 60, hunde:false });   // Koordinaten in CSS-Pixeln im Container
 * Hinweis: Der Aufrufer versteckt währenddessen die Figur auf dem Start- und Zielfeld (wie in der Swift-App). */
(function (g) {
  'use strict';
  const GLYPHEN = { king: '♚', queen: '♛', rook: '♜', bishop: '♝', knight: '♞', pawn: '♟' };
  const SCHRIFT = "'Apple Symbols','Segoe UI Symbol','DejaVu Sans','Noto Sans Symbols 2',sans-serif";
  const EMOJI = "'Apple Color Emoji','Segoe UI Emoji','Noto Color Emoji',sans-serif";
  const HUNDENAMEN = { king: 'Bruno', queen: 'Luna', rook: 'Brocken', bishop: 'Wurzel', knight: 'Falko', pawn: 'Welpe' };
  // Mützen-/Kronenfarbe je Rolle (Hunde-Team, eigene Farben)
  const HUTFARBE = { king: '#e8b922', queen: '#2e59f2', rook: '#9d9a8f', bishop: '#7330a1', knight: '#d91f1f', pawn: '#d9b88c' };

  class Animation2D {
    constructor(container, optionen) {
      this.container = container;
      this.opt = Object.assign({ zIndex: 5 }, optionen || {});
      const cv = this.canvas = document.createElement('canvas');
      cv.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none;z-index:' + this.opt.zIndex;
      if (getComputedStyle(container).position === 'static') container.style.position = 'relative';
      container.appendChild(cv);
      this.ctx = cv.getContext('2d');
      this.laeuft = false; this._fertig = null; this._raf = 0;
      this.groesseAnpassen();
      this._ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => this.groesseAnpassen()) : null;
      if (this._ro) this._ro.observe(container);
    }

    groesseAnpassen() {
      const dpr = Math.min(2, g.devicePixelRatio || 1);
      this.b = this.container.clientWidth; this.h = this.container.clientHeight;
      this.canvas.width = Math.max(1, Math.round(this.b * dpr)); this.canvas.height = Math.max(1, Math.round(this.h * dpr));
      this.dpr = dpr;
    }

    /** Start einer Animation → Promise (fertig, wenn Gleiten + ggf. Kampf vorbei sind). */
    animiere(p) {
      if (this.laeuft) this.abbrechen();       // sauber abschliessen, damit kein Feld versteckt bleibt
      return new Promise(res => {
        this.p = Object.assign({ hunde: false, schlag: null, zelle: 60 }, p);
        const show = !!this.p.hunde;
        this.dauer = show ? 0.55 : 0.45;
        this.kampfDauer = show ? 0.9 : 0.38;
        this.phase = 0; this.laeuft = true; this._fertig = res;
        this.funken = [];
        for (let i = 0; i < 10; i++) this.funken.push({ winkel: i * (Math.PI * 2 / 10) + (i % 3) * 0.2, tempo: 0.6 + ((i * 37) % 50) / 100 });
        this.t0 = performance.now() / 1000; this._eingefroren = null;
        this._raf = requestAnimationFrame(() => this._tick());
        this._zeichne(0);
      });
    }

    abbrechen() {
      cancelAnimationFrame(this._raf);
      this.laeuft = false; this._leere();
      const r = this._fertig; this._fertig = null; if (r) r();
    }

    /** Test: Zustand nach `sek` Sekunden (seit Start) zeichnen und anhalten */
    einfrieren(sek) {
      cancelAnimationFrame(this._raf); this._eingefroren = sek;
      this._stand(sek);
    }

    _stand(sek) {
      let e = sek;
      if (e >= this.dauer && this.p.schlag) { this.phase = 1; e = sek - this.dauer; } else this.phase = 0;
      this._zeichne(e);
    }

    _tick() {
      if (!this.laeuft) return;
      let el = performance.now() / 1000 - this.t0;
      if (this.phase === 0 && el >= this.dauer) {
        if (this.p.schlag) { this.phase = 1; this.t0 = performance.now() / 1000; el = 0; } else { this._ende(); return; }
      } else if (this.phase === 1 && el >= this.kampfDauer) { this._ende(); return; }
      this._zeichne(el);
      this._raf = requestAnimationFrame(() => this._tick());
    }

    _ende() {
      this.laeuft = false; this._leere();
      const r = this._fertig; this._fertig = null; if (r) r();
    }
    _leere() { this.ctx.setTransform(1, 0, 0, 1, 0, 0); this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height); }

    // ------------------------------------------------------------------ Zeichnen
    _zeichne(el) {
      const c = this.ctx, p = this.p;
      c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      c.clearRect(0, 0, this.b, this.h);
      const cell = p.zelle, von = p.von, nach = p.nach, show = !!p.hunde;
      const schlag = p.schlag;
      if (this.phase === 0) {
        // Gleitphase: Figur "hebt ab" (wächst + Schatten) und fliegt in leichtem Bogen
        const t = Math.min(1, el / this.dauer);
        const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
        const x = von.x + (nach.x - von.x) * e;
        let y = von.y + (nach.y - von.y) * e;
        const s = Math.sin(e * Math.PI);
        y -= s * cell * 0.35;
        const scale = 1 + s * 0.4;
        // Bodenschatten (bleibt am Boden, wird kleiner je höher die Figur)
        const sw = cell * 0.55 * (1 - s * 0.35), gy = von.y + (nach.y - von.y) * e;
        c.fillStyle = 'rgba(0,0,0,0.30)'; c.beginPath(); c.ellipse(x, gy + cell * 0.32 + cell * 0.07, sw / 2, cell * 0.07, 0, 0, 7); c.fill();
        if (show) {   // Pfotenspur auf dem Flugweg
          for (let i = 1; i <= 5; i++) {
            const f = i / 6;
            if (f < e) {
              const a = Math.max(0, 0.8 - (e - f) * 1.6);
              if (a > 0.04) {
                c.save(); c.globalAlpha = a; c.font = Math.round(cell * 0.26) + 'px ' + EMOJI; c.textAlign = 'center'; c.textBaseline = 'middle';
                c.fillText('🐾', von.x + (nach.x - von.x) * f, von.y + (nach.y - von.y) * f + cell * 0.28); c.restore();
              }
            }
          }
        }
        // Das Opfer wartet zitternd am Zielfeld
        if (schlag) {
          const tr = Math.sin(el * 40) * 1.5 * t * (show ? 2 : 1);
          this._figur(schlag.typ, schlag.weiss, nach.x + tr, nach.y, cell * 0.9, 1);
        }
        this._figur(p.typ, p.weiss, x, y, cell * 0.95 * scale, 1);
      } else {
        const t = Math.min(1, el / this.kampfDauer);
        if (show) { this._kampfShow(t, el); return; }
        // Klassisch: Funken sprühen, das Opfer schrumpft und verblasst
        const shake = Math.sin(el * 55) * cell * 0.06 * (1 - t);
        const rise = Math.sin(t * Math.PI) * cell * 0.10;
        if (schlag) {
          const cs = Math.max(0.05, 1 - t * 1.1), ca = Math.max(0, 1 - t * 1.3);
          if (ca > 0.02) this._figur(schlag.typ, schlag.weiss, nach.x + shake, nach.y + t * cell * 0.25, cell * 0.9 * cs, ca);
        }
        for (const sp of this.funken) {
          const dist = t * cell * 0.9 * sp.tempo;
          const sx = nach.x + Math.cos(sp.winkel) * dist, sy = nach.y + Math.sin(sp.winkel) * dist * 0.8;
          const a = (1 - t) * 0.9, ss = cell * 0.10 * (1 - t * 0.5);
          c.fillStyle = sp.tempo > 0.9 ? 'rgba(255,204,0,' + a + ')' : 'rgba(255,149,0,' + a + ')';
          c.beginPath();
          c.moveTo(sx, sy - ss); c.lineTo(sx + ss * 0.3, sy - ss * 0.3); c.lineTo(sx + ss, sy); c.lineTo(sx + ss * 0.3, sy + ss * 0.3);
          c.lineTo(sx, sy + ss); c.lineTo(sx - ss * 0.3, sy + ss * 0.3); c.lineTo(sx - ss, sy); c.lineTo(sx - ss * 0.3, sy - ss * 0.3);
          c.closePath(); c.fill();
        }
        // Der Sieger stampft auf
        this._figur(p.typ, p.weiss, nach.x + shake, nach.y - rise, cell * 0.95 * (1 + (1 - t) * 0.25), 1);
      }
    }

    /** Figur in echter Schachform (Turm = Turm). Show-Modus: Hundekopf mit Rollen-Kopfbedeckung oben auf der Figur. */
    _figur(typ, weiss, x, y, size, alpha) {
      const c = this.ctx, show = !!this.p.hunde;
      const team = weiss ? 'rgba(217,26,26,' + alpha + ')' : 'rgba(38,102,242,' + alpha + ')';
      if (show && typ === 'pawn') {   // Pfötchen-Chip
        const r = size * 0.42;
        c.fillStyle = weiss ? 'rgba(255,255,255,' + 0.95 * alpha + ')' : 'rgba(33,33,33,' + 0.95 * alpha + ')';
        c.beginPath(); c.arc(x, y, r, 0, 7); c.fill();
        c.strokeStyle = team; c.lineWidth = Math.max(1.5, size * 0.04); c.stroke();
        c.save(); c.globalAlpha = alpha; c.font = Math.round(size * 0.45) + 'px ' + EMOJI; c.textAlign = 'center'; c.textBaseline = 'middle';
        c.fillText('🐾', x, y); c.restore();
        return;
      }
      c.save();
      c.font = Math.round(size) + 'px ' + SCHRIFT; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.shadowColor = 'rgba(0,0,0,' + 0.5 * alpha + ')'; c.shadowOffsetX = 2; c.shadowOffsetY = 3; c.shadowBlur = 6;
      c.lineWidth = Math.max(1, size * 0.03); c.lineJoin = 'round';
      c.strokeStyle = weiss ? 'rgba(64,64,64,' + alpha + ')' : 'rgba(0,0,0,' + 0.7 * alpha + ')';
      c.fillStyle = weiss ? 'rgba(255,255,255,' + alpha + ')' : 'rgba(20,20,20,' + alpha + ')';
      c.strokeText(GLYPHEN[typ], x, y); c.fillText(GLYPHEN[typ], x, y);
      c.restore();
      if (show) {
        const hs = size * 0.34, hx = x, hy = y - size * 0.32, hr = hs * 0.55;
        c.fillStyle = 'rgba(255,255,255,' + 0.85 * alpha + ')'; c.beginPath(); c.arc(hx, hy, hr, 0, 7); c.fill();
        c.strokeStyle = team; c.lineWidth = Math.max(1, size * 0.02); c.stroke();
        c.save(); c.globalAlpha = alpha; c.fillStyle = HUTFARBE[typ];
        c.beginPath(); c.ellipse(hx, hy - hr - hr * 0.85 * 0.35 + hr * 0.425, hr * 0.8, hr * 0.425, 0, 0, 7); c.fill();
        c.font = Math.round(hs) + 'px ' + EMOJI; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('🐶', hx, hy);
        c.restore();
      }
    }

    // ------------------------------------------------------------------ Kampfshow (Hunde-Modus)
    _kampfShow(t, el) {
      const c = this.ctx, p = this.p, cell = p.zelle, to = p.nach, schlag = p.schlag;
      if (!schlag) return;
      // 1) Comic-Explosion hinter dem Kampf
      const pulse = Math.sin(t * Math.PI), burstR = cell * 0.95 * (0.65 + 0.35 * pulse), spikes = 12;
      c.beginPath();
      for (let i = 0; i < spikes * 2; i++) {
        const ang = i * (Math.PI / spikes), r = i % 2 === 0 ? burstR : burstR * 0.55;
        const px = to.x + Math.cos(ang) * r, py = to.y + Math.sin(ang) * r;
        if (i === 0) c.moveTo(px, py); else c.lineTo(px, py);
      }
      c.closePath();
      let ba = 0.85; if (t > 0.75) ba = Math.max(0, 0.85 - (t - 0.75) * 3.4);
      c.fillStyle = 'rgba(255,204,0,' + ba * 0.75 + ')'; c.fill();
      c.strokeStyle = 'rgba(255,149,0,' + ba + ')'; c.lineWidth = 2.5; c.stroke();
      // 2) Knochen- und Pfoten-Funken
      const set = ['🦴', '🐾', '⭐', '💥'];
      this.funken.forEach((sp, i) => {
        const dist = t * cell * 1.25 * sp.tempo, sx = to.x + Math.cos(sp.winkel) * dist, sy = to.y + Math.sin(sp.winkel) * dist * 0.85;
        const a = Math.max(0, (1 - t) * 1.1);
        if (a <= 0.03) return;
        c.save(); c.globalAlpha = Math.min(1, a); c.font = Math.round(cell * 0.30 * (1 - t * 0.4)) + 'px ' + EMOJI; c.textAlign = 'center'; c.textBaseline = 'middle';
        c.fillText(set[i % set.length], sx, sy); c.restore();
      });
      // 3) Das Opfer zittert erst heftig, schrumpft dann weg
      const shake = Math.sin(el * 50) * cell * 0.09 * (1 - t);
      if (t < 0.55) this._figur(schlag.typ, schlag.weiss, to.x + cell * 0.22 + shake, to.y + cell * 0.05, cell, 1);
      else {
        const f = (t - 0.55) / 0.45, cs = Math.max(0.05, 1 - f * 1.05), ca = Math.max(0, 1 - f * 1.2);
        if (ca > 0.02) this._figur(schlag.typ, schlag.weiss, to.x + cell * 0.25, to.y + f * cell * 0.35, cell * cs, ca);
      }
      // 4) Der Held: extra groß und mit Sieger-Hüpfern
      const hop = Math.abs(Math.sin(t * Math.PI * 3)) * cell * 0.18;
      this._figur(p.typ, p.weiss, to.x - cell * 0.18 + shake * 0.5, to.y - hop, cell * 1.25, 1);
      // 5) "WUFF!"-Comic-Schrift
      if (t > 0.1 && t < 0.6) {
        c.save(); c.font = "900 " + Math.round(cell * 0.34) + "px 'Arial Black','Helvetica Neue',Arial,sans-serif"; c.textBaseline = 'top';
        c.lineJoin = 'round'; c.lineWidth = cell * 0.05; c.strokeStyle = '#ff3b30'; c.fillStyle = '#ffd60a';
        c.strokeText('WUFF!', to.x - cell * 0.95, to.y - cell * 0.85); c.fillText('WUFF!', to.x - cell * 0.95, to.y - cell * 0.85); c.restore();
      }
      // 6) Namens-Banner
      this._banner('💥 ' + HUNDENAMEN[p.typ] + ' schnappt sich ' + HUNDENAMEN[schlag.typ] + '!', to.y - cell * 1.2, Math.min(1, t * 2.5));
    }

    _banner(text, nearY, alpha) {
      const c = this.ctx, cell = this.p.zelle, to = this.p.nach;
      c.save(); c.font = 'bold ' + Math.round(Math.max(11, cell * 0.24)) + "px -apple-system,'Segoe UI',Helvetica,Arial,sans-serif";
      const w = c.measureText(text).width, fs = Math.max(11, cell * 0.24);
      let x = to.x - w / 2; x = Math.max(4, Math.min(this.b - w - 4, x));
      let y = Math.max(4, Math.min(this.h - fs - 4, nearY));
      const pad = 7;
      c.fillStyle = 'rgba(217,64,26,' + 0.85 * alpha + ')';
      const rx = x - pad, ry = y - 3, rw = w + pad * 2, rh = fs + 6, r = 8;
      c.beginPath(); c.moveTo(rx + r, ry); c.arcTo(rx + rw, ry, rx + rw, ry + rh, r); c.arcTo(rx + rw, ry + rh, rx, ry + rh, r); c.arcTo(rx, ry + rh, rx, ry, r); c.arcTo(rx, ry, rx + rw, ry, r); c.closePath(); c.fill();
      c.fillStyle = 'rgba(255,255,255,' + alpha + ')'; c.textBaseline = 'top'; c.fillText(text, x, y);
      c.restore();
    }

    zerstoeren() {
      this.abbrechen(); if (this._ro) this._ro.disconnect();
      if (this.canvas.parentNode) this.canvas.parentNode.removeChild(this.canvas);
    }
  }
  g.Animation2D = Animation2D;
})(typeof window !== 'undefined' ? window : globalThis);
