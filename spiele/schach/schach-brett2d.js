// ============================================================
// Schach-Oberfläche, Teil 1: Zeichnen (Port der Swift-Klassen EvalBarView, BoardTheme, MiniChessBoardView, ChessBoardView).
// Swift-Zeilen ~3489–3806 und ~5942–6280. Alles Canvas, keine Bibliothek. Übersetzung: PORTIERUNG.md (Abschnitt „UI-Mapping“).
// Das Hunde-Team ersetzt die Paw-Patrol-Figuren des 2D-Bretts: Die Hundeköpfe sind hier selbst gezeichnet (schriftunabhängig).
// Global: window.SchachUI = { THEMEN, FARBEN, EvalBar, MiniBrett, Brett2D, hundeKopf, hundeIconUrl, HUNDE }
// ============================================================
(function () {
  'use strict';
  const K = window.SchachKern;

  // ---------- Farben (NSColor-Werte aus dem Swift-Code, 0…1 → rgb) ----------
  const c255 = (v) => Math.round(v * 255);
  const rgb = (r, g, b, a) => a === undefined ? `rgb(${c255(r)},${c255(g)},${c255(b)})` : `rgba(${c255(r)},${c255(g)},${c255(b)},${a})`;
  const FARBEN = {
    chessBrown: rgb(0.36, 0.22, 0.09), chessGold: rgb(0.72, 0.52, 0.08), chessGreen: rgb(0.16, 0.42, 0.25),
    menuBg: rgb(0.98, 0.97, 0.95), cardBorder: rgb(0.86, 0.84, 0.80), cardHighlight: rgb(0.22, 0.52, 0.30),
    color3D: rgb(0.22, 0.42, 0.75),
    // Systemfarben (macOS, hell)
    systemGreen: [52, 199, 89], systemBlue: [0, 122, 255], systemRed: [255, 59, 48], systemOrange: [255, 149, 0], systemYellow: [255, 204, 0],
  };
  const sys = (n, a) => `rgba(${FARBEN[n][0]},${FARBEN[n][1]},${FARBEN[n][2]},${a})`;

  // ---------- BoardTheme: 6 Brettfarben ----------
  const T = (name, l, d, b) => ({ name, hell: rgb(l[0], l[1], l[2]), dunkel: rgb(d[0], d[1], d[2]), rand: rgb(b[0], b[1], b[2]) });
  const THEMEN = [
    T('Klassik Gruen', [0.93, 0.93, 0.82], [0.46, 0.59, 0.34], [0.28, 0.40, 0.22]),
    T('Holz', [0.94, 0.85, 0.71], [0.63, 0.43, 0.27], [0.38, 0.24, 0.13]),
    T('Ozean', [0.87, 0.92, 0.96], [0.32, 0.50, 0.70], [0.16, 0.28, 0.42]),
    T('Candy', [0.99, 0.93, 0.96], [0.85, 0.51, 0.68], [0.55, 0.25, 0.42]),
    T('Nacht', [0.62, 0.64, 0.68], [0.28, 0.30, 0.36], [0.12, 0.13, 0.16]),
    T('Turnier Braun', [0.94, 0.89, 0.79], [0.71, 0.53, 0.39], [0.42, 0.29, 0.19]),
  ];

  const UI_FONT = '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", "Segoe UI", system-ui, Roboto, sans-serif';
  const SYMBOL_FONT = '"Apple Symbols","Segoe UI Symbol","DejaVu Sans","Noto Sans Symbols 2",sans-serif';
  // chessPieceChar: immer die gefüllten Symbole; Farbe kommt aus dem Zeichnen (︎ = Text- statt Emoji-Darstellung)
  const GLYPH = { 6: '♚', 5: '♛', 4: '♜', 3: '♝', 2: '♞', 1: '♟' };
  const glyph = (t) => GLYPH[t] + '︎';

  function dpr(canvas, w, h) {
    const d = Math.min(3, window.devicePixelRatio || 1);
    const pw = Math.max(1, Math.round(w * d)), ph = Math.max(1, Math.round(h * d));
    if (canvas.width !== pw || canvas.height !== ph) { canvas.width = pw; canvas.height = ph; }
    const g = canvas.getContext('2d'); g.setTransform(d, 0, 0, d, 0, 0); g.clearRect(0, 0, w, h);
    return g;
  }
  function rundRect(g, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
  }

  // ============================================================
  // Hunde-Team (eigene Figuren, gezeichnet). typ = PieceType 1…6 (Bauer…König)
  // ============================================================
  const HUNDE = {
    6: { name: 'Bruno', rasse: 'Bernhardiner', hut: '#e8b922' }, 5: { name: 'Luna', rasse: 'Windhund', hut: '#2e59f2' },
    4: { name: 'Brocken', rasse: 'Bulldogge', hut: '#9d9a8f' }, 3: { name: 'Wurzel', rasse: 'Dackel', hut: '#7330a1' },
    2: { name: 'Falko', rasse: 'Schaeferhund', hut: '#d91f1f' }, 1: { name: 'Welpe', rasse: 'Welpe', hut: '#d9b88c' },
  };
  /** Zeichnet einen Hundekopf mit Zubehör. (cx, cy) = Mitte des Kopfes, s = Kopfbreite in px. */
  function hundeKopf(g, typ, cx, cy, s) {
    const u = s / 100;
    g.save(); g.translate(cx, cy); g.scale(u, u);
    const lw = 2.2, kontur = 'rgba(60,40,25,0.65)';
    const ell = (x, y, rx, ry, fill, rot, strich) => { g.beginPath(); g.ellipse(x, y, rx, ry, rot || 0, 0, Math.PI * 2); g.fillStyle = fill; g.fill(); if (strich !== false) { g.lineWidth = lw; g.strokeStyle = kontur; g.stroke(); } };
    const poly = (pts, fill, strich) => { g.beginPath(); pts.forEach((p, i) => i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])); g.closePath(); g.fillStyle = fill; g.fill(); if (strich !== false) { g.lineWidth = lw; g.strokeStyle = kontur; g.stroke(); } };
    const P = {
      6: { gesicht: '#f0e4cd', ohr: '#7a3f22', schnauze: '#faf0e1', sy: 15, srx: 23, sry: 17 },
      5: { gesicht: '#bcbccd', ohr: '#9a9aaf', schnauze: '#d3d3e0', sy: 19, srx: 16, sry: 23 },
      4: { gesicht: '#d7af7d', ohr: '#aa825a', schnauze: '#e3be8c', sy: 16, srx: 28, sry: 16 },
      3: { gesicht: '#7d4828', ohr: '#64371e', schnauze: '#96593a', sy: 20, srx: 17, sry: 21 },
      2: { gesicht: '#cd8c41', ohr: '#be7d37', schnauze: '#e6b96e', sy: 18, srx: 17, sry: 21 },
      1: { gesicht: '#f0d7aa', ohr: '#c8a069', schnauze: '#fbebc8', sy: 14, srx: 20, sry: 15 },
    }[typ] || null;
    if (!P) { g.restore(); return; }
    // Ohren (hinter dem Kopf)
    if (typ === 6) { ell(-39, -4, 14, 30, P.ohr, 0.15); ell(39, -4, 14, 30, P.ohr, -0.15); }
    else if (typ === 5) { poly([[-34, -22], [-18, -44], [-8, -26]], P.ohr); poly([[34, -22], [18, -44], [8, -26]], P.ohr); }
    else if (typ === 4) { ell(-33, -28, 13, 11, P.ohr, 0.4); ell(33, -28, 13, 11, P.ohr, -0.4); }
    else if (typ === 3) { ell(-41, 10, 13, 35, P.ohr, 0.08); ell(41, 10, 13, 35, P.ohr, -0.08); }
    else if (typ === 2) { poly([[-36, -14], [-26, -58], [-8, -30]], P.ohr); poly([[36, -14], [26, -58], [8, -30]], P.ohr); poly([[-30, -24], [-26, -48], [-16, -30]], '#5a3a22', false); poly([[30, -24], [26, -48], [16, -30]], '#5a3a22', false); }
    else ell(-38, -12, 13, 23, P.ohr, 0.2), ell(38, -12, 13, 23, P.ohr, -0.2);
    // Kopf
    ell(0, 0, 41, 37, P.gesicht);
    if (typ === 6) { ell(-17, -6, 11, 11, '#a35a2d', 0, false); ell(17, -6, 11, 11, '#a35a2d', 0, false); ell(0, -18, 7, 20, '#fffaf0', 0, false); }
    if (typ === 2) { ell(0, -14, 26, 13, '#4b3322', 0, false); }
    if (typ === 4) { ell(-22, 10, 10, 6, 'rgba(120,80,45,0.35)', 0.5, false); ell(22, 10, 10, 6, 'rgba(120,80,45,0.35)', -0.5, false); }
    // Schnauze, Nase
    ell(0, P.sy, P.srx, P.sry, P.schnauze);
    const nasenY = P.sy - P.sry + 5;
    ell(0, nasenY, typ === 4 ? 11 : 9, 6.5, '#1d1d1f', 0, false); ell(-2.5, nasenY - 2, 3, 1.8, 'rgba(255,255,255,0.55)', 0, false);
    // Mund
    g.strokeStyle = '#3a2a22'; g.lineWidth = 2.2; g.lineCap = 'round';
    g.beginPath(); g.moveTo(0, nasenY + 5); g.lineTo(0, nasenY + 11); g.stroke();
    g.beginPath(); g.arc(-6, nasenY + 11, 6, 0, Math.PI * 0.8); g.stroke(); g.beginPath(); g.arc(6, nasenY + 11, 6, Math.PI * 0.2, Math.PI); g.stroke();
    if (typ === 4) { poly([[-15, nasenY + 14], [-10, nasenY + 14], [-12.5, nasenY + 21]], '#fffdf5', false); poly([[15, nasenY + 14], [10, nasenY + 14], [12.5, nasenY + 21]], '#fffdf5', false); }
    if (typ === 1 || typ === 5) ell(0, nasenY + 19, 6, 8, '#f08aa0', 0, false);
    // Augen
    const ay = typ === 1 ? -3 : -9, ar = typ === 1 ? 6.8 : 5.4, ax = typ === 5 ? 14 : 16;
    [-1, 1].forEach((sgn) => { ell(sgn * ax, ay, ar + 1.6, ar + 1.6, '#fffdf8', 0, false); ell(sgn * ax + sgn * 0.5, ay + 0.5, ar, ar, '#2a1d17', 0, false); ell(sgn * ax - 1.6, ay - 2, 2, 2, '#fff', 0, false); });
    if (typ === 4) { g.strokeStyle = '#3a2a22'; g.lineWidth = 2.6; [-1, 1].forEach((sgn) => { g.beginPath(); g.moveTo(sgn * ax - sgn * 8, ay - 9); g.lineTo(sgn * ax + sgn * 7, ay - 5); g.stroke(); }); }
    // Zubehör wie bei den 3D-Hunden: Krone, Diadem, Burghut, Bischofsmütze, Federbusch
    const hut = HUNDE[typ].hut;
    if (typ === 6) {
      poly([[-24, -30], [-24, -52], [-12, -41], [0, -57], [12, -41], [24, -52], [24, -30]], hut);
      ell(0, -57, 3.4, 3.4, '#d6283a', 0, false); ell(-24, -52, 2.8, 2.8, '#2e59f2', 0, false); ell(24, -52, 2.8, 2.8, '#2e59f2', 0, false);
    } else if (typ === 5) {
      g.beginPath(); g.arc(0, -4, 40, Math.PI * 1.18, Math.PI * 1.82); g.strokeStyle = '#c9ced9'; g.lineWidth = 4.5; g.stroke();
      poly([[0, -52], [6, -45], [0, -38], [-6, -45]], hut);
    } else if (typ === 4) {
      poly([[-27, -28], [-23, -52], [-17, -52], [-17, -46], [-9, -46], [-9, -52], [-1, -52], [-1, -46], [7, -46], [7, -52], [15, -52], [15, -46], [21, -46], [21, -52], [27, -52], [27, -28]].map((p) => [p[0] * 0.95, p[1]]), hut);
    } else if (typ === 3) {
      poly([[-22, -30], [-18, -58], [0, -78], [18, -58], [22, -30]], hut);
      g.strokeStyle = '#f2d56b'; g.lineWidth = 3.4; g.beginPath(); g.moveTo(0, -72); g.lineTo(0, -40); g.moveTo(-9, -57); g.lineTo(9, -57); g.stroke();
    } else if (typ === 2) {
      poly([[-30, -26], [-20, -44], [20, -44], [30, -26]], hut);
      g.beginPath(); g.moveTo(10, -44); g.bezierCurveTo(26, -76, 52, -60, 46, -34); g.lineWidth = 6; g.strokeStyle = '#fffdf5'; g.stroke();
    }
    g.restore();
  }
  function hundeIconUrl(typ, px) {
    const cv = document.createElement('canvas'), d = Math.min(2, window.devicePixelRatio || 1);
    cv.width = Math.round(px * d); cv.height = Math.round(px * d);
    const g = cv.getContext('2d'); g.scale(d, d);
    hundeKopf(g, typ, px / 2, px * 0.58, px * 0.62);
    return cv.toDataURL('image/png');
  }

  // ============================================================
  // EvalBarView: Bewertungsbalken (22 px breit), −5…+5 Bauern
  // ============================================================
  class EvalBar {
    constructor(canvas) { this.cv = canvas; this.wert = 0; }
    set(v) { this.wert = v; this.draw(); }
    draw() {
      const W = this.cv.clientWidth, H = this.cv.clientHeight; if (!W || !H) return;
      const g = dpr(this.cv, W, H), ev = this.wert;
      g.fillStyle = rgb(0.15, 0.15, 0.15); g.fillRect(0, 0, W, H);
      const ratio = (Math.max(-5, Math.min(5, ev)) + 5) / 10;
      const weissH = H * ratio;                                   // Weiß von unten
      g.fillStyle = '#fff'; g.fillRect(0, H - weissH, W, weissH);
      g.fillStyle = rgb(0.12, 0.12, 0.12); g.fillRect(0, 0, W, H - weissH);   // Schwarz von oben
      g.strokeStyle = 'rgba(128,128,128,0.5)'; g.lineWidth = 0.5; g.beginPath(); g.moveTo(0, H / 2); g.lineTo(W, H / 2); g.stroke();
      const text = K.fmtFix(ev, 1, true);
      g.font = `700 10px ui-monospace, "SF Mono", Menlo, "DejaVu Sans Mono", monospace`; g.textBaseline = 'top'; g.textAlign = 'left';
      const tw = g.measureText(text).width, th = 12;
      // y wie in AppKit (von unten gerechnet), dann ins Canvas umgerechnet
      const yUp = ev >= 0 ? weissH - th - 2 : weissH + 2;
      const y = Math.max(2, Math.min(H - th - 2, yUp));
      g.fillStyle = ev >= 0 ? '#000' : '#fff'; g.fillText(text, (W - tw) / 2, H - y - th);
    }
  }

  // ============================================================
  // MiniChessBoardView: Vorschau im Hauptmenü (Startstellung, alle Figuren schwarz wie im Original)
  // ============================================================
  class MiniBrett {
    constructor(canvas, themaFn) { this.cv = canvas; this.thema = themaFn; }
    draw() {
      const W = this.cv.clientWidth || 180, H = this.cv.clientHeight || 180;
      const g = dpr(this.cv, W, H), sz = Math.min(W, H), cell = sz / 8, ox = (W - sz) / 2, oy = (H - sz) / 2, th = this.thema();
      g.fillStyle = 'rgba(92,56,23,0.8)'; rundRect(g, ox - 3, oy - 3, sz + 6, sz + 6, 6); g.fill();
      const b = new K.ChessBoard();
      for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
        const x = ox + c * cell, y = oy + r * cell;
        g.fillStyle = (r + c) % 2 === 1 ? th.dunkel : th.hell; g.fillRect(x, y, cell, cell);
        const p = b.grid[r][c];
        if (p) { g.font = `${cell * 0.68}px ${SYMBOL_FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#000'; g.fillText(glyph(p.type), x + cell / 2, y + cell / 2 + cell * 0.04); }
      }
    }
  }

  // ============================================================
  // ChessBoardView (2D-Brett)
  // ============================================================
  class Brett2D {
    constructor(host, opt) {
      opt = opt || {};
      this.host = host; this.onKlick = opt.onKlick || null;
      this.cv = document.createElement('canvas'); this.cv.className = 'brett2d-canvas'; this.cv.setAttribute('aria-label', 'Schachbrett (2D)');
      host.appendChild(this.cv);
      this.board = new K.ChessBoard(); this.ausgewaehlt = null; this.ziele = []; this.letzterZug = null; this.schach = null;
      this.versteckt = []; this.nameTags = {}; this.vonSchwarz = false; this.hinweisPfeil = null; this.gefahr = []; this.fokus = null;
      this.hunde = false; this.thema = 0;
      this.cv.addEventListener('pointerdown', (e) => this._klick(e));
      this.cv.addEventListener('contextmenu', (e) => e.preventDefault());
      if (window.ResizeObserver) { this._ro = new ResizeObserver(() => this.draw()); this._ro.observe(host); }
    }
    zerstoeren() { if (this._ro) this._ro.disconnect(); this.cv.remove(); }
    get zellGroesse() { return Math.min(this.cv.clientWidth, this.cv.clientHeight) / 8; }
    displayRC(p) { return this.vonSchwarz ? [7 - p.row, 7 - p.col] : [p.row, p.col]; }
    mitte(p) {   // centerOfSquare
      const W = this.cv.clientWidth, H = this.cv.clientHeight, sz = Math.min(W, H), cell = sz / 8, ox = (W - sz) / 2, oy = (H - sz) / 2;
      const [dr, dc] = this.displayRC(p);
      return { x: ox + (dc + 0.5) * cell, y: oy + (dr + 0.5) * cell };
    }
    _klick(e) {
      const r = this.cv.getBoundingClientRect(), W = r.width, H = r.height, sz = Math.min(W, H), cell = sz / 8;
      const x = e.clientX - r.left - (W - sz) / 2, y = e.clientY - r.top - (H - sz) / 2;
      if (x < 0 || y < 0) return;
      const dc = Math.floor(x / cell), dr = Math.floor(y / cell);
      if (dr >= 0 && dr < 8 && dc >= 0 && dc < 8 && this.onKlick) { e.preventDefault(); this.onKlick(this.vonSchwarz ? 7 - dr : dr, this.vonSchwarz ? 7 - dc : dc); }
    }
    setze(z) { Object.assign(this, z); this.draw(); }
    _in(liste, p) { return liste.some((q) => q.row === p.row && q.col === p.col); }
    draw() {
      const W = this.cv.clientWidth, H = this.cv.clientHeight; if (!W || !H) return;
      const g = dpr(this.cv, W, H), sz = Math.min(W, H), cell = sz / 8, ox = (W - sz) / 2, oy = (H - sz) / 2, th = THEMEN[this.thema % THEMEN.length];
      g.fillStyle = th.rand; g.fillRect(ox - 3, oy - 3, sz + 6, sz + 6);
      for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
        const pos = { row: r, col: c }, [dr, dc] = this.displayRC(pos), x = ox + dc * cell, y = oy + dr * cell, dark = (r + c) % 2 === 1;
        g.fillStyle = dark ? th.dunkel : th.hell; g.fillRect(x, y, cell, cell);
        const lm = this.letzterZug;
        if (lm && ((lm.from.row === r && lm.from.col === c) || (lm.to.row === r && lm.to.col === c))) { g.fillStyle = rgb(0.85, 0.78, 0.2, 0.4); g.fillRect(x, y, cell, cell); }
        if (this.schach && this.schach.row === r && this.schach.col === c) { g.fillStyle = 'rgba(255,0,0,0.4)'; g.fillRect(x, y, cell, cell); }
        const istZiel = this._in(this.ziele, pos);
        if (istZiel) { g.fillStyle = sys('systemGreen', 0.3); g.fillRect(x, y, cell, cell); }
        if (this.ausgewaehlt && this.ausgewaehlt.row === r && this.ausgewaehlt.col === c) { g.fillStyle = sys('systemBlue', 0.4); g.fillRect(x, y, cell, cell); }

        const piece = this.board.piece(pos);
        if (piece && !this._in(this.versteckt, pos)) this._figur(g, piece, x, y, cell);
        if (piece && !this._in(this.versteckt, pos)) this._namensschild(g, piece, x, y, cell);

        if (istZiel) {
          if (!piece) {
            const d = cell * 0.22; g.fillStyle = sys('systemGreen', 0.7); g.beginPath(); g.arc(x + cell / 2, y + cell / 2, d / 2, 0, Math.PI * 2); g.fill();
          } else {
            g.strokeStyle = sys('systemRed', 0.5); g.lineWidth = 3; g.beginPath(); g.ellipse(x + cell / 2, y + cell / 2, cell / 2 - cell * 0.05, cell / 2 - cell * 0.05, 0, 0, Math.PI * 2); g.stroke();
          }
        }
        if (this._in(this.gefahr, pos)) {   // v3: Gefahren-Ring (orange)
          g.strokeStyle = sys('systemOrange', 0.9); g.lineWidth = Math.max(2.5, cell * 0.06); g.beginPath(); g.ellipse(x + cell / 2, y + cell / 2, cell / 2 - cell * 0.04, cell / 2 - cell * 0.04, 0, 0, Math.PI * 2); g.stroke();
        }
        if (this.fokus && this.fokus.row === r && this.fokus.col === c) {   // Denkanstoss (gelb)
          g.strokeStyle = sys('systemYellow', 0.95); g.lineWidth = Math.max(3, cell * 0.07); g.beginPath(); g.ellipse(x + cell / 2, y + cell / 2, cell / 2 - cell * 0.02, cell / 2 - cell * 0.02, 0, 0, Math.PI * 2); g.stroke();
        }
        // Koordinaten
        g.font = `${cell * 0.15}px ${UI_FONT}`; g.fillStyle = dark ? th.hell : th.dunkel;
        if (dc === 0) { g.textAlign = 'left'; g.textBaseline = 'top'; g.fillText(String(8 - r), x + 2, y + 2); }
        if (dr === 7) { g.textAlign = 'right'; g.textBaseline = 'bottom'; g.fillText(String.fromCharCode(97 + c), x + cell - 2, y + cell - 2); }
      }
      if (this.hinweisPfeil) this._pfeil(g, cell);
    }

    _figur(g, piece, x, y, cell) {
      const weiss = piece.color === 0, paw = this.hunde, midX = x + cell / 2, midY = y + cell / 2, bauer = piece.type === 1;
      const fs = cell * (bauer ? 0.76 : 1.02) * (paw ? 0.82 : 1.0), versatz = paw ? cell * 0.10 : 0;
      if (!(paw && bauer)) {
        g.save();
        g.font = `${fs}px ${SYMBOL_FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.shadowColor = `rgba(0,0,0,${weiss ? 0.45 : 0.30})`; g.shadowBlur = weiss ? 3 : 2; g.shadowOffsetX = 1; g.shadowOffsetY = 1;
        g.fillStyle = weiss ? '#fff' : rgb(0.08, 0.08, 0.08);
        const gy = midY - versatz + fs * 0.06;
        g.fillText(glyph(piece.type), midX, gy);
        g.shadowColor = 'transparent';
        g.strokeStyle = weiss ? rgb(0.25, 0.25, 0.25) : 'rgba(0,0,0,0.7)'; g.lineWidth = Math.max(1, fs * 0.012 * (weiss ? 1.2 : 1.0)); g.strokeText(glyph(piece.type), midX, gy);
        g.restore();
      }
      if (!paw) return;
      const teamFarbe = weiss ? 'rgb(217,26,26)' : 'rgb(38,102,242)';
      if (bauer) {   // Welpen-Chip (statt Pfoten-Chip)
        const d = cell * 0.16;
        g.fillStyle = weiss ? 'rgba(255,255,255,0.95)' : 'rgba(33,33,33,0.95)'; g.beginPath(); g.ellipse(midX, midY, cell / 2 - d, cell / 2 - d, 0, 0, Math.PI * 2); g.fill();
        g.strokeStyle = teamFarbe; g.lineWidth = Math.max(1.5, cell * 0.04); g.stroke();
        hundeKopf(g, 1, midX, midY + cell * 0.03, cell * 0.42);
      } else {
        const kopf = cell * 0.34;
        const off = { 4: -0.30, 2: -0.26, 3: -0.32, 5: -0.33, 6: -0.33 }[piece.type] || -0.30;
        const halo = kopf * 0.55, hx = midX, hy = Math.max(midY + cell * off - versatz, y + halo + 2);
        g.fillStyle = 'rgba(255,255,255,0.85)'; g.beginPath(); g.arc(hx, hy, halo, 0, Math.PI * 2); g.fill();
        g.strokeStyle = teamFarbe; g.lineWidth = Math.max(1, cell * 0.025); g.stroke();
        hundeKopf(g, piece.type, hx, hy + kopf * 0.02, kopf * 1.08);
      }
      // Namensband unten: „Turm · Brocken“, garantiert innerhalb der Zelle
      const hundeName = HUNDE[piece.type].name, tn = K.Piece.name(piece.type);
      let band = `${tn} · ${hundeName}`, bandFs = Math.max(7, cell * 0.15);
      const maxW = cell * 0.92;
      g.font = `700 ${bandFs}px ${UI_FONT}`;
      if (g.measureText(band).width > maxW) band = tn;
      if (g.measureText(band).width > maxW) { bandFs = Math.max(6, cell * 0.12); g.font = `700 ${bandFs}px ${UI_FONT}`; }
      const bw = Math.min(g.measureText(band).width, maxW), bh = bandFs * 1.2 + 2;
      const rx = midX - bw / 2 - 3, ry = y + cell - bh - 1;
      g.fillStyle = teamFarbe.replace('rgb(', 'rgba(').replace(')', ',0.92)'); rundRect(g, rx, ry, bw + 6, bh, 3); g.fill();
      g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(band, midX, ry + bh / 2 + 0.5);
    }

    _namensschild(g, piece, x, y, cell) {   // Namens-Schildchen an der „getauften“ Figur (König oder Dame)
      const tag = this.nameTags[piece.color];
      if (!tag || tag.type !== piece.type || !tag.name) return;
      const name = String(tag.name).slice(0, 10), fs = Math.max(8, cell * 0.16);
      g.font = `700 ${fs}px ${UI_FONT}`;
      const tw = g.measureText(name).width, padX = 4, th = fs * 1.2 + 2;
      const bandH = Math.max(7, cell * 0.15) + 4;
      const ty = this.hunde ? y + cell - bandH - th - 3 - 4 : y + 1;
      const tx = x + cell / 2 - tw / 2 - padX;
      g.fillStyle = piece.color === 0 ? FARBEN.chessGreen.replace('rgb(', 'rgba(').replace(')', ',0.92)') : 'rgba(140,38,38,0.92)';
      rundRect(g, tx, ty, tw + padX * 2, th, 4); g.fill();
      g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(name, x + cell / 2, ty + th / 2 + 0.5);
    }

    _pfeil(g, cell) {   // Coach-Pfeil (Empfehlung)
      const h = this.hinweisPfeil, a = this.mitte(h.from), b = this.mitte(h.to);
      const dx = b.x - a.x, dy = b.y - a.y, len = Math.max(1, Math.hypot(dx, dy)), ux = dx / len, uy = dy / len;
      const headL = cell * 0.38, headW = cell * 0.30;
      const tip = { x: b.x - ux * cell * 0.12, y: b.y - uy * cell * 0.12 }, base = { x: tip.x - ux * headL, y: tip.y - uy * headL };
      const gruen = 'rgba(38,191,77,0.8)';
      g.strokeStyle = gruen; g.lineWidth = cell * 0.13; g.lineCap = 'round'; g.beginPath(); g.moveTo(a.x + ux * cell * 0.2, a.y + uy * cell * 0.2); g.lineTo(base.x, base.y); g.stroke();
      g.fillStyle = gruen; g.beginPath(); g.moveTo(tip.x, tip.y); g.lineTo(base.x - uy * headW, base.y + ux * headW); g.lineTo(base.x + uy * headW, base.y - ux * headW); g.closePath(); g.fill();
    }
  }

  window.SchachUI = { THEMEN, FARBEN, EvalBar, MiniBrett, Brett2D, hundeKopf, hundeIconUrl, HUNDE, rgb, rundRect, UI_FONT, SYMBOL_FONT, glyph, dpr };
})();
