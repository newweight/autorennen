// ============================================================
// 4 Gewinnt – Browser-Port der Swift-App (VierGewinnt.swift v2.1). Übersetzungstabelle: PORTIERUNG.md.
// Regeln: ../gemeinsam/vier-regeln.js (auch vom Server benutzt) · KI: ../gemeinsam/vier-ki.js (1:1 aus Swift) · Online: ../gemeinsam/netz.js.
// Zusatz zur Swift-App (Add-on): dritte Karte „Online spielen“ (Raumcode/QR/Revanche über /ws-brett, der Server prüft jeden Zug).
// ============================================================
(function () {
  'use strict';
  const BRETT = window.BRETT, K = BRETT.K, V = BRETT.Vier, KI = BRETT.VierKI;
  const ROWS = V.ZE, COLS = V.SP;
  const app = document.getElementById('app');
  const esc = (t) => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const lesen = (k, d) => { try { const v = sessionStorage.getItem(k); return v === null ? d : v; } catch (e) { return d; } };

  // ---- Farben (NSColor-Werte aus dem Swift-Code)
  const FARBE = {
    chipRed: 'rgb(230,38,26)', chipYellow: 'rgb(255,204,0)', boardBlue: 'rgb(140,179,235)',
    brettRand: 'rgb(13,46,140)', brettFlaeche: 'rgb(20,71,184)', loch: 'rgb(15,15,36)',
  };

  // ---------------------------------------------------------------- Zustand (VierGewinntController)
  const S = {
    ansicht: 'menue',        // 'menue' | 'online' | 'warten' | 'spiel'
    st: V.neu(),             // board + currentPlayer (st.am) + Gewinn (st.ende)
    vsAI: false, gameOver: false, sessionID: 0, aiDepth: 5, hover: -1,
    online: false,           // Add-on: Spiel läuft über den Server
    worker: null, anfrage: 0, denkt: false,
    dialog: null,
  };
  const O = { v: null, verb: 'zu', stand: null, runde: -1, ich: 0, wartet: false, name: lesen('vier-name', K.NAMEN[Math.floor(Math.random() * K.NAMEN.length)].id),
    seite: 'z', endeGezeigt: false, revancheOffen: false, code: '' };
  try { const n = localStorage.getItem('vier-name'); if (n && K.NAMEN.some(x => x.id === n)) O.name = n; } catch (e) { /* privat */ }

  // ---------------------------------------------------------------- Zeichnen: BoardView.draw / MiniBoardView.draw
  function dpr(canvas, w, h) {
    const d = window.devicePixelRatio || 1;
    if (canvas.width !== Math.round(w * d) || canvas.height !== Math.round(h * d)) { canvas.width = Math.round(w * d); canvas.height = Math.round(h * d); }
    const g = canvas.getContext('2d'); g.setTransform(d, 0, 0, d, 0, 0); g.clearRect(0, 0, w, h);
    return g;
  }
  /** Rechteck mit y NACH OBEN (AppKit-Koordinaten, Ursprung unten links) → abgerundeter Pfad im Canvas (y nach unten). */
  function rundRect(g, H, x, yUp, w, h, r) {
    const y = H - yUp - h; r = Math.min(r, w / 2, h / 2);
    g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
  }
  function oval(g, H, x, yUp, w, h) {
    g.beginPath(); g.ellipse(x + w / 2, H - yUp - h / 2, Math.max(0, w / 2), Math.max(0, h / 2), 0, 0, Math.PI * 2);
  }

  // Feldgröße: stufenlos an die Fenstergröße angepasst (BoardView.cellSize / origin / labelH)
  const PADDING = 10;
  function geometrie(W, H) {
    const w = (W - PADDING * 2 - 12) / COLS;
    const h = (H - PADDING * 2 - 12 - 22) / (ROWS + 0.36);
    const cell = Math.max(20, Math.floor(Math.min(w, h)));
    const labelH = Math.max(22, cell * 0.36);
    const bw = COLS * cell, bh = ROWS * cell, totalH = bh + labelH;
    return { cell, labelH, bw, bh, ox: Math.floor((W - bw) / 2), oy: Math.floor((H - totalH) / 2), inset: Math.max(4, cell * 0.11) };
  }

  function brettZeichnen() {
    const canvas = document.getElementById('brett'); if (!canvas) return;
    const W = canvas.clientWidth, H = canvas.clientHeight; if (!W || !H) return;
    const g = dpr(canvas, W, H), G = geometrie(W, H), { cell, bw, bh, ox, oy, inset } = G;
    // Brett
    g.fillStyle = FARBE.brettRand; rundRect(g, H, ox - 6, oy - 6, bw + 12, bh + 12, 14); g.fill();
    g.fillStyle = FARBE.brettFlaeche; rundRect(g, H, ox, oy, bw, bh, 12); g.fill();
    // Hover
    if (S.hover >= 0) { g.fillStyle = 'rgba(255,255,255,0.09)'; rundRect(g, H, ox + S.hover * cell + 6, oy, cell - 12, bh, 8); g.fill(); }
    // Steine
    for (let row = 0; row < ROWS; row++) for (let col = 0; col < COLS; col++) {
      const cx = ox + col * cell + cell / 2, cy = oy + (ROWS - 1 - row) * cell + cell / 2, r = cell / 2 - inset;
      const chip = S.st.b[(ROWS - 1 - row) * COLS + col];            // vier-regeln: Zeile 0 unten
      g.fillStyle = 'rgba(0,0,0,0.25)'; oval(g, H, cx - r + 1, cy - r - 2, r * 2, r * 2); g.fill();
      g.fillStyle = chip === 1 ? FARBE.chipRed : chip === 2 ? FARBE.chipYellow : FARBE.loch; oval(g, H, cx - r, cy - r, r * 2, r * 2); g.fill();
      if (chip) { g.fillStyle = 'rgba(255,255,255,0.28)'; oval(g, H, cx - r * 0.48, cy + r * 0.12, r * 0.75, r * 0.5); g.fill(); }
    }
    // Spaltennummern (über dem Brett)
    const fs = Math.max(11, cell * 0.18);
    g.font = `300 ${fs}px -apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, sans-serif`; g.fontVariantNumeric = 'tabular-nums';
    g.fillStyle = 'rgba(255,255,255,0.45)'; g.textAlign = 'center'; g.textBaseline = 'alphabetic';
    for (let col = 0; col < COLS; col++) g.fillText(String(col + 1), ox + col * cell + cell / 2, H - (oy + bh + 6) - fs * 0.21);
  }

  function miniZeichnen() {
    const canvas = document.getElementById('mini'); if (!canvas) return;
    const W = 280, H = 120, g = dpr(canvas, W, H);
    // previewBoard (Swift: Reihe 0 oben, Steine fallen nach unten)
    const grid = Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
    const wurf = (c, chip) => { for (let r = ROWS - 1; r >= 0; r--) if (!grid[r][c]) { grid[r][c] = chip; return; } };
    wurf(1, 1); wurf(2, 2); wurf(1, 1); wurf(2, 2); wurf(3, 1); wurf(4, 2); wurf(2, 1); wurf(3, 2);
    const cellW = W / COLS, cellH = H / ROWS, r = Math.min(cellW, cellH) / 2 - 3;
    g.fillStyle = 'rgba(140,179,235,0.85)'; rundRect(g, H, 0, 0, W, H, 14); g.fill();
    for (let row = 0; row < ROWS; row++) for (let col = 0; col < COLS; col++) {
      const cx = col * cellW + cellW / 2, cy = (ROWS - 1 - row) * cellH + cellH / 2, chip = grid[row][col];
      g.fillStyle = chip === 1 ? FARBE.chipRed : chip === 2 ? FARBE.chipYellow : 'rgba(153,153,153,0.5)';
      oval(g, H, cx - r, cy - r, r * 2, r * 2); g.fill();
      if (chip) { g.fillStyle = 'rgba(255,255,255,0.22)'; oval(g, H, cx - r * 0.45, cy + r * 0.1, r * 0.7, r * 0.45); g.fill(); }
    }
  }

  // ---------------------------------------------------------------- Symbole (SF Symbols → einfache SVG)
  const IKON = {
    personen: '<svg class="symbol" viewBox="0 0 28 28" fill="currentColor"><circle cx="10" cy="9" r="4.5"/><path d="M1.5 23c0-5 3.6-8 8.5-8s8.5 3 8.5 8z"/><circle cx="20" cy="10" r="3.6" opacity=".75"/><path d="M19.5 15.2c4.2 0 7 2.4 7 6.8h-6.2c0-2.6-.8-4.8-2.4-6.2.5-.4 1-.6 1.6-.6z" opacity=".75"/></svg>',
    computer: '<svg class="symbol" viewBox="0 0 28 28" fill="currentColor"><rect x="2" y="4" width="24" height="16" rx="2.5"/><rect x="9" y="22" width="10" height="2" rx="1"/><rect x="12.5" y="20" width="3" height="3"/></svg>',
    welt: '<svg class="symbol" viewBox="0 0 28 28" fill="none" stroke="currentColor" stroke-width="2"><circle cx="14" cy="14" r="11"/><ellipse cx="14" cy="14" rx="4.8" ry="11"/><path d="M3 14h22M5 8h18M5 20h18"/></svg>',
    pfeil: '<svg class="pfeil" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 1.5 8.5 6 4 10.5"/></svg>',
  };

  // ---------------------------------------------------------------- Ansichtswechsel
  function ansicht(name) {
    S.ansicht = name;
    document.body.className = 'ansicht-' + (name === 'spiel' ? 'spiel' : 'menue');
    const meta = document.querySelector('meta[name=theme-color]'); if (meta) meta.content = name === 'spiel' ? '#121226' : '#f7f7f7';
    document.title = '4 Gewinnt';
    window.scrollTo(0, 0);
  }
  function arbeitStoppen() {                       // laufende Berechnung verwerfen (Swift: sessionID += 1 → Antwort wird ignoriert)
    S.sessionID++; S.denkt = false; S.anfrage++;
    if (S.worker) { try { S.worker.terminate(); } catch (e) { /* weg */ } S.worker = null; }
    dialogZu(); clearTimeout(S.endeTimer);
  }

  // ---------------------------------------------------------------- Hauptmenü (showMenu)
  function showMenu() {
    arbeitStoppen();
    if (S.online || O.v) onlineAus(true);
    S.online = false; S.gameOver = false;
    ansicht('menue');
    S.aiDepth = 5;
    app.innerHTML =
      `<div class="seite"><div class="spalte">` +
      `<div class="block"><div class="titel">4 Gewinnt</div><canvas id="mini" width="280" height="120"></canvas>` +
      `<button class="karte knopfkarte" id="k-zweit">${IKON.personen}<span class="texte"><span class="karte-titel">Spieler vs Spieler</span><span class="karte-sub">Zu zweit am gleichen Computer</span></span>${IKON.pfeil}</button></div>` +
      `<div class="trenner"><i></i><span>oder</span><i></i></div>` +
      `<div class="karte hervor innen"><div class="kopf">${IKON.computer}<span class="texte" style="display:flex;flex-direction:column;gap:2px"><span class="karte-titel">Spieler vs Computer</span><span class="karte-sub">Gegen die KI spielen</span></span></div>` +
      `<div class="staerke-zeile"><span class="links">Spielstärke:</span><span class="rechts" id="stufe-name">Mittel</span></div>` +
      `<input type="range" id="regler" min="1" max="10" step="1" value="5" list="ticks" aria-label="Spielstärke"><datalist id="ticks">${[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => `<option value="${n}"></option>`).join('')}</datalist>` +
      `<button class="start" id="k-ki">▶&nbsp;&nbsp;Spiel starten</button></div>` +
      `<div class="trenner"><i></i><span>oder</span><i></i></div>` +
      `<button class="karte knopfkarte" id="k-online">${IKON.welt}<span class="texte"><span class="karte-titel">Online spielen</span><span class="karte-sub">Mit Freunden, per Raumcode</span></span>${IKON.pfeil}</button>` +
      `<a class="klein-link" href="../">◀ Alle Spiele</a>` +
      `</div></div>`;
    miniZeichnen();
    document.getElementById('k-zweit').onclick = () => { S.vsAI = false; startGame(); };
    document.getElementById('k-ki').onclick = () => { S.vsAI = true; startGame(); };
    document.getElementById('k-online').onclick = () => onlineOeffnen();
    const regler = document.getElementById('regler');
    regler.oninput = () => sliderChanged(regler);
    sliderChanged(regler);
  }
  function sliderChanged(el) {
    const val = Math.trunc(+el.value);
    S.aiDepth = KI.stufeZuTiefe(val);
    document.getElementById('stufe-name').textContent = KI.stufenName(val);
  }

  // ---------------------------------------------------------------- Spiel (startGame)
  function spielAufbau() {
    ansicht('spiel');
    const modeStr = S.online ? 'Online' : S.vsAI ? `Spieler vs. KI (Stärke ${S.aiDepth})` : 'Spieler vs. Spieler';
    app.innerHTML =
      `<div class="spiel"><div class="modus" id="modus">${esc(modeStr)}</div><div class="spieler-zeile hidden" id="spieler"></div><div class="banner hidden" id="banner"></div>` +
      `<div class="status" id="status"></div>` +
      `<div class="brettbox"><canvas id="brett" aria-label="4 Gewinnt Brett"></canvas></div>` +
      `<div class="knoepfe"><button class="ns-knopf" id="b-menue">Menü</button><button class="ns-knopf" id="b-neu">${S.online ? 'Aufgeben' : 'Neu'}</button>` +
      `<button class="ns-knopf${vollbildMoeglich() ? '' : ' hidden'}" id="b-voll">${istVollbild() ? 'Vollbild beenden' : '⛶ Vollbild'}</button></div></div>`;
    document.getElementById('b-menue').onclick = menueKnopf;
    document.getElementById('b-neu').onclick = neuKnopf;
    document.getElementById('b-voll').onclick = toggleFullScreen;
    const c = document.getElementById('brett');
    c.addEventListener('pointermove', (e) => { if (e.pointerType === 'mouse') hoverSetzen(spalteBei(e)); });
    c.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') hoverSetzen(-1); });
    c.addEventListener('pointerdown', (e) => { const col = spalteBei(e); if (col >= 0) humanPlayed(col); });
    if (window.ResizeObserver) new ResizeObserver(() => { scaleFonts(); brettZeichnen(); }).observe(c.parentElement);
    scaleFonts();
  }

  function startGame() {                              // Swift: startGame()
    arbeitStoppen();
    S.online = false;
    S.st = V.neu(); S.gameOver = false; S.hover = -1;
    spielAufbau();
    updateStatus(); brettZeichnen();
  }

  function spalteBei(e) {                             // BoardView.column(at:) – gilt für die ganze Höhe
    const c = document.getElementById('brett'), r = c.getBoundingClientRect();
    const G = geometrie(c.clientWidth, c.clientHeight);
    const x = e.clientX - r.left - G.ox;
    if (x < 0) return -1;
    const col = Math.floor(x / G.cell);
    return col < COLS ? col : -1;
  }
  function hoverSetzen(c) { if (c !== S.hover) { S.hover = c; brettZeichnen(); } }

  function setStatus(text, farbe) { const el = document.getElementById('status'); if (!el) return; el.textContent = text; el.style.color = farbe || '#fff'; }
  function updateStatus() {
    const isRed = S.st.am === 1;
    setStatus(isRed ? '🔴 Rot ist dran' : '🟡 Gelb ist dran', isRed ? FARBE.chipRed : FARBE.chipYellow);
  }

  function humanPlayed(col) {                         // Swift: humanPlayed(col:)
    if (S.ansicht !== 'spiel' || S.gameOver) return;
    if (S.online) return onlineZug(col);
    if (S.st.h[col] >= ROWS) return;
    if (S.vsAI && S.st.am === 2) return;
    drop(col);
  }

  function drop(col) {                                // Swift: drop(col:chip:)
    const chip = S.st.am;
    if (!V.ziehen(S.st, col)) return;
    brettZeichnen();
    const e = S.st.ende;
    if (e && e.sieger) {
      S.gameOver = true;
      const name = chip === 1 ? '🔴 Rot' : '🟡 Gelb';
      setStatus(`${name} gewinnt! 🎉`, chip === 1 ? FARBE.chipRed : FARBE.chipYellow);
      showGameOver(`${name} gewinnt!`); return;
    }
    if (e) { S.gameOver = true; setStatus('Unentschieden!', '#fff'); showGameOver('Unentschieden!'); return; }
    updateStatus();
    if (S.vsAI && S.st.am === 2) kiStart();
  }

  // ---- KI im Hintergrund (DispatchQueue.global(qos: .userInitiated))
  function kiStart() {
    const sid = S.sessionID, nr = ++S.anfrage, grid = KI.ausZustand(S.st), tiefe = S.aiDepth;
    S.denkt = true;
    const fertig = (spalte) => {
      if (nr !== S.anfrage) return;
      S.denkt = false;
      if (S.sessionID !== sid || S.gameOver) return;
      drop(spalte);
    };
    const direkt = () => setTimeout(() => { if (nr === S.anfrage) fertig(KI.bestMove(grid, 2, tiefe)); }, 20);
    let w = S.worker;
    if (!w) { try { w = S.worker = new Worker('ki-worker.js'); } catch (e) { w = null; } }
    if (!w) return direkt();
    w.onmessage = (ev) => { if (ev.data.id === nr) fertig(ev.data.spalte); };
    w.onerror = () => { try { w.terminate(); } catch (e) { /* weg */ } if (S.worker === w) S.worker = null; direkt(); };
    w.postMessage({ id: nr, grid, chip: 2, tiefe });
  }

  // ---- Spielende (showGameOver) – NSAlert nach 0,7 s
  function showGameOver(msg) {
    const sid = S.sessionID;
    clearTimeout(S.endeTimer);
    S.endeTimer = setTimeout(() => {
      if (S.sessionID !== sid) return;
      if (S.online) return onlineEndeDialog(msg);
      dialogZeigen({ titel: 'Spiel beendet', text: msg, tasten: [{ text: 'Neues Spiel', std: true, aktion: startGame }, { text: 'Hauptmenü', aktion: showMenu }] });
    }, 700);
  }

  function menueKnopf() {
    if (S.online && O.stand && O.ich && O.stand.zustand === 'spiel') {
      return dialogZeigen({ titel: 'Spiel verlassen?', text: 'Dann ist die Partie für beide vorbei.', tasten: [{ text: 'Weiterspielen', std: true }, { text: 'Verlassen', aktion: showMenu }] });
    }
    showMenu();
  }
  function neuKnopf() {
    if (!S.online) return startGame();
    if (O.stand && O.ich && O.stand.zustand === 'spiel')
      return dialogZeigen({ titel: 'Wirklich aufgeben?', text: 'Dann gewinnt der andere.', tasten: [{ text: 'Abbrechen', std: true }, { text: 'Aufgeben', aktion: () => senden({ t: 'aufgeben' }) }] });
    if (O.stand && O.ich && O.stand.zustand === 'ende') { if (!O.stand.revanche[O.ich === 1 ? 'w' : 'b']) senden({ t: 'revanche' }); }
  }

  // ---------------------------------------------------------------- Größe & Vollbild (v2.1)
  const fsElement = () => document.fullscreenElement || document.webkitFullscreenElement || null;
  function istVollbild() { return !!fsElement(); }
  function vollbildMoeglich() { return !!(document.fullscreenEnabled || document.webkitFullscreenEnabled); }
  function toggleFullScreen() {
    const d = document.documentElement;
    try {
      if (istVollbild()) (document.exitFullscreen || document.webkitExitFullscreen).call(document);
      else (d.requestFullscreen || d.webkitRequestFullscreen).call(d);
    } catch (e) { /* nicht erlaubt */ }
  }
  function scaleFonts() {                              // Schrift wächst mit dem Fenster (im Vollbild gut lesbar)
    if (S.ansicht !== 'spiel') return;
    const base = Math.min(window.innerWidth, window.innerHeight);
    const st = document.getElementById('status'), mo = document.getElementById('modus');
    if (st) st.style.fontSize = Math.max(17, Math.min(34, base / 30)) + 'px';
    if (mo) mo.style.fontSize = Math.max(11, Math.min(18, base / 50)) + 'px';
  }
  function fsGeaendert() {
    const b = document.getElementById('b-voll'); if (b) b.textContent = istVollbild() ? 'Vollbild beenden' : '⛶ Vollbild';
    scaleFonts(); brettZeichnen();
  }
  document.addEventListener('fullscreenchange', fsGeaendert);
  document.addEventListener('webkitfullscreenchange', fsGeaendert);
  window.addEventListener('resize', () => { scaleFonts(); brettZeichnen(); });

  // ---------------------------------------------------------------- Dialog (NSAlert)
  function dialogZeigen(d) {
    dialogZu();
    const el = document.createElement('div'); el.className = 'alarm-hinten';
    el.innerHTML = `<div class="alarm" role="alertdialog" aria-modal="true"><div class="bild" aria-hidden="true"><i style="left:8px;top:8px;background:${FARBE.chipRed}"></i><i style="left:28px;top:8px;background:${FARBE.chipYellow}"></i><i style="left:8px;top:28px;background:${FARBE.chipYellow}"></i><i style="left:28px;top:28px;background:${FARBE.chipRed}"></i></div>` +
      `<div class="inhalt"><h2>${esc(d.titel)}</h2><p>${esc(d.text)}</p><div class="tasten">` +
      d.tasten.map((t, i) => `<button class="taste${t.std ? ' std' : ''}" data-i="${i}"${t.aus ? ' disabled' : ''}>${esc(t.text)}</button>`).join('') + `</div></div></div>`;
    document.body.append(el); S.dialog = { el, d };
    el.addEventListener('click', (e) => {
      const b = e.target.closest('.taste');
      if (b) { const t = d.tasten[+b.dataset.i]; if (b.disabled) return; if (!d.bleibt || !t.bleibt) dialogZu(); if (t.aktion) t.aktion(); }
      else if (e.target === el) dialogZu();                // Zusatz: Klick daneben = Dialog schließen, Brett ansehen
    });
    const std = el.querySelector('.taste.std'); if (std) std.focus({ preventScroll: true });
  }
  function dialogZu() { if (S.dialog) { S.dialog.el.remove(); S.dialog = null; } }

  // ---------------------------------------------------------------- Tastatur (Menüleiste der Mac-App → Browser-Kürzel)
  document.addEventListener('keydown', (e) => {
    if (e.target && /INPUT|TEXTAREA/.test(e.target.tagName) && e.target.type !== 'range') return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (S.dialog) {
      if (e.key === 'Enter') { const b = S.dialog.el.querySelector('.taste.std:not([disabled])'); if (b) { e.preventDefault(); b.click(); } }
      else if (e.key === 'Escape') dialogZu();
      return;
    }
    if (S.ansicht === 'menue' && e.key === 'f') return toggleFullScreen();
    if (S.ansicht !== 'spiel') return;
    const k = e.key;
    if (/^[1-7]$/.test(k)) { hoverSetzen(+k - 1); humanPlayed(+k - 1); e.preventDefault(); }
    else if (k === 'ArrowLeft') { hoverSetzen(S.hover <= 0 ? COLS - 1 : S.hover - 1); e.preventDefault(); }
    else if (k === 'ArrowRight') { hoverSetzen(S.hover < 0 || S.hover >= COLS - 1 ? 0 : S.hover + 1); e.preventDefault(); }
    else if ((k === 'Enter' || k === ' ' || k === 'ArrowDown') && S.hover >= 0) { humanPlayed(S.hover); e.preventDefault(); }
    else if (k === 'n' || k === 'N') { if (!S.online) startGame(); }          // ⌘N „Neues Spiel“
    else if (k === 'm' || k === 'M' || k === 'Escape') menueKnopf();           // ⇧⌘M „Hauptmenü“
    else if (k === 'f' || k === 'F') toggleFullScreen();                       // ⌃⌘F „Vollbild“
  });

  // ================================================================ Online (Add-on: dritte Karte im Hauptmenü)
  const senden = (o) => { if (O.v) O.v.senden(o); };
  const NAMEN_OHNE = (n) => String(n || '').trim();

  function onlineOeffnen(code, hinweis) {
    arbeitStoppen(); S.online = false;
    ansicht('online');
    const tiere = K.NAMEN.map(n => `<button class="pille${O.name === n.id ? ' an' : ''}" data-name="${n.id}">${n.emoji} ${n.text}</button>`).join('');
    const seiten = [['w', '🔴 Rot (fängt an)'], ['b', '🟡 Gelb'], ['z', '🎲 Zufall']].map(([id, t]) => `<button class="pille${O.seite === id ? ' an' : ''}" data-seite="${id}">${t}</button>`).join('');
    app.innerHTML =
      `<div class="seite"><div class="spalte">` +
      `<div class="zeile-oben"><button class="hell-knopf" data-a="menue">◀ Hauptmenü</button></div>` +
      `<div class="titel klein">Online spielen</div>` +
      `<div class="karte innen"><h3>Wer bist du?</h3><p class="hilfe">Nur Tiernamen – so bleibt alles kindersicher.</p><div class="pillen" id="namen">${tiere}</div></div>` +
      `<div class="karte hervor innen"><h3>Neuen Raum aufmachen</h3><p class="hilfe">Ich spiele …</p><div class="pillen" id="seiten">${seiten}</div><button class="start" data-a="erstellen">▶&nbsp;&nbsp;Raum erstellen</button></div>` +
      `<div class="karte innen"><h3>Einem Raum beitreten</h3><p class="hilfe">Den 4-stelligen Code eintippen.</p><input class="codefeld" id="codefeld" maxlength="4" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="ABCD" value="${code ? esc(code) : ''}">` +
      `<div class="reihe" style="margin-top:8px"><button class="start" data-a="beitreten" style="margin:0">Beitreten</button><button class="start grau" data-a="zuschauen" style="margin:0">👀&nbsp;Zuschauen</button></div></div>` +
      `<div class="hinweis${hinweis ? ' fehler' : ''}" id="hinweis">${hinweis ? esc(hinweis) : ''}</div></div></div>`;
    const f = document.getElementById('codefeld');
    f.addEventListener('input', () => { f.value = f.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4); });
    f.addEventListener('keydown', (e) => { if (e.key === 'Enter') onlineBeitreten(false); });
    app.querySelector('.seite').addEventListener('click', onlineKlick);
  }
  function hinweisSetzen(t, fehler) { const n = document.getElementById('hinweis'); if (n) { n.textContent = t || ''; n.classList.toggle('fehler', !!fehler); } }
  function onlineKlick(e) {
    const name = e.target.closest('[data-name]');
    if (name) { O.name = name.dataset.name; try { localStorage.setItem('vier-name', O.name); } catch (x) { /* privat */ } app.querySelectorAll('[data-name]').forEach(b => b.classList.toggle('an', b === name)); return; }
    const seite = e.target.closest('[data-seite]');
    if (seite) { O.seite = seite.dataset.seite; app.querySelectorAll('[data-seite]').forEach(b => b.classList.toggle('an', b === seite)); return; }
    const a = e.target.closest('[data-a]'); if (!a) return;
    switch (a.dataset.a) {
      case 'menue': return showMenu();
      case 'erstellen': hinweisSetzen('Raum wird gemacht …'); verbinden().senden({ t: 'raumErstellen', spiel: 'vier', name: O.name, farbe: O.seite === 'z' ? undefined : O.seite }); return;
      case 'beitreten': return onlineBeitreten(false);
      case 'zuschauen': return onlineBeitreten(true);
      case 'kopieren': {
        const t = (document.getElementById('linktext') || {}).textContent || '';
        try { navigator.clipboard.writeText(t).then(() => hinweisSetzen('Link kopiert!'), () => hinweisSetzen('Kopieren geht hier nicht – bitte den Link markieren.')); } catch (x) { hinweisSetzen('Kopieren geht hier nicht – bitte den Link markieren.'); }
        return;
      }
    }
  }
  function onlineBeitreten(zuschauer) {
    const code = ((document.getElementById('codefeld') || {}).value || '').trim();
    if (code.length !== K.CODE_LAENGE) return hinweisSetzen('Der Code hat ' + K.CODE_LAENGE + ' Zeichen.', true);
    hinweisSetzen('Suche den Raum …');
    verbinden().senden({ t: 'raumBeitreten', code, spiel: 'vier', name: O.name, zuschauer: !!zuschauer });
  }

  function verbinden() {
    if (O.v) return O.v;
    O.v = new BRETT.Verbindung('vier', {
      status(s) { O.verb = s; bannerZeigen(); },
      raum(m) { O.code = m.code; },
      stand: standEmpfangen,
      fehler(m) { O.wartet = false; if (S.ansicht === 'spiel') { const el = document.getElementById('status'); if (el) { el.textContent = m.text || 'Das geht nicht.'; el.style.color = '#fff'; setTimeout(() => S.ansicht === 'spiel' && S.online && onlineStatus(), 1800); } } else hinweisSetzen(m.text || 'Fehler', true); },
      raumZu() { onlineAus(true); onlineOeffnen('', 'Der Raum wurde geschlossen.'); },
      wiederNein() { onlineAus(true); if (S.ansicht !== 'menue') showMenu(); },
    });
    return O.v;
  }
  function onlineAus(vergessen) {
    if (O.v) { if (vergessen) { try { O.v.senden({ t: 'verlassen' }); } catch (e) { /* weg */ } } O.v.schliessen(vergessen); O.v = null; }
    O.stand = null; O.runde = -1; O.ich = 0; O.wartet = false; O.endeGezeigt = false; S.online = false;
  }

  function einladungsLink(code) { return location.origin + location.pathname + '?raum=' + code; }
  const spielerHtml = (st) => st.spieler.filter(Boolean).map(s => `<span class="${s.online ? '' : 'weg'}">${esc(s.name)}</span>`).join('');
  function wartenZeigen(st) {
    if (S.ansicht === 'warten' && O.code === st.code) { const n = document.getElementById('mit'); if (n) n.innerHTML = spielerHtml(st); return; }
    arbeitStoppen(); ansicht('warten'); O.code = st.code;
    const link = einladungsLink(st.code);
    let qr = '';
    try { qr = window.Rennspiel && window.Rennspiel.QR ? window.Rennspiel.QR.svg(link, { modul: 4, rand: 2 }) : ''; } catch (e) { qr = ''; }
    app.innerHTML =
      `<div class="seite"><div class="spalte">` +
      `<div class="zeile-oben"><button class="hell-knopf" data-a="abbrechen">✖ Abbrechen</button></div>` +
      `<div class="karte-titel" style="font-size:15px">Raumcode</div><div class="codegross" id="codegross">${esc(st.code)}</div>` +
      `<div class="karte-sub">Gib den Code ein – oder scanne den QR-Code:</div>` +
      (qr ? `<div class="qr">${qr}</div>` : '') +
      `<div class="linktext" id="linktext">${esc(link)}</div><button class="hell-knopf" data-a="kopieren">📋 Link kopieren</button>` +
      `<div class="mitspieler" id="mit">${spielerHtml(st)}</div>` +
      `<div class="hinweis" id="hinweis">Warte auf einen Mitspieler<span class="punkte"></span></div></div></div>`;
    app.querySelector('.seite').addEventListener('click', (e) => {
      const a = e.target.closest('[data-a]'); if (!a) return;
      if (a.dataset.a === 'abbrechen') showMenu(); else onlineKlick(e);
    });
  }

  function standEmpfangen(s) {
    O.stand = s;
    if (s.zustand === 'warten') { wartenZeigen(s); return; }
    S.online = true;
    O.ich = s.du.rolle === 'w' ? 1 : s.du.rolle === 'b' ? 2 : 0;
    if (S.ansicht !== 'spiel' || O.runde !== s.runde) {              // neue Runde (auch Revanche) → frisch aufbauen
      arbeitStoppen(); O.runde = s.runde; O.endeGezeigt = false; S.gameOver = false; S.hover = -1;
      spielAufbau();
    }
    O.wartet = false;
    S.st = V.ausZuegen(s.zuege) || V.neu();
    S.gameOver = s.zustand === 'ende';
    brettZeichnen(); onlineStatus(); bannerZeigen(); onlineKnoepfe();
    if (s.zustand === 'ende') {
      if (!O.endeGezeigt) { O.endeGezeigt = true; showGameOver(''); }
      else if (S.dialog && S.dialog.d.online) onlineEndeDialog();
    }
  }
  function nameVon(farbe) { return farbe === 'w' ? '🔴 Rot' : '🟡 Gelb'; }
  function onlineStatus() {
    const s = O.stand; if (!s || !document.getElementById('status')) return;
    document.getElementById('modus').textContent = 'Online – Raum ' + s.code;
    const z = document.getElementById('spieler'); z.classList.remove('hidden');
    const sp = s.spieler.map((p, i) => { const f = i === 0 ? '🔴' : '🟡'; if (!p) return `<span>${f} …</span>`; const ich = O.ich === i + 1; return `<span class="${p.online ? '' : 'weg'}">${f} ${ich ? '<b>' + esc(p.name) + ' (du)</b>' : esc(p.name)}</span>`; });
    z.innerHTML = sp.join(' &nbsp;·&nbsp; ') + (s.zuschauer ? ` &nbsp;·&nbsp; 👀 ${s.zuschauer}` : '') + (O.ich ? '' : ' &nbsp;·&nbsp; du schaust zu');
    if (s.zustand === 'ende') {
      const e = s.ergebnis || {};
      if (e.sieger) setStatus(`${nameVon(e.sieger)} gewinnt! 🎉`, e.sieger === 'w' ? FARBE.chipRed : FARBE.chipYellow);
      else setStatus('Unentschieden!', '#fff');
    } else updateStatus();
    const nb = document.getElementById('b-neu'); if (nb) nb.textContent = s.zustand === 'ende' && O.ich ? 'Revanche' : 'Aufgeben';
  }
  function onlineKnoepfe() {
    const nb = document.getElementById('b-neu'), s = O.stand; if (!nb || !s) return;
    nb.classList.toggle('hidden', !O.ich);
    nb.disabled = s.zustand === 'ende' && !!s.revanche[O.ich === 1 ? 'w' : 'b'];
  }
  function bannerZeigen() {
    const el = document.getElementById('banner'); if (!el) return;
    const s = O.stand;
    const t = !S.online ? '' : O.verb !== 'verbunden' ? K.TEXTE.getrennt : (s && s.zustand === 'spiel' && s.spieler.some(p => p && !p.online) ? K.TEXTE.gegnerWeg : '');
    el.textContent = t; el.classList.toggle('hidden', !t);
  }
  function onlineZug(col) {
    const s = O.stand;
    if (!s || s.zustand !== 'spiel' || !O.ich || S.st.am !== O.ich || O.wartet || S.st.h[col] >= ROWS) return;
    O.wartet = true; senden({ t: 'zug', z: col });
  }
  function onlineEndeDialog() {
    const s = O.stand; if (!s || s.zustand !== 'ende') return;
    const e = s.ergebnis || {};
    let text = e.sieger ? `${nameVon(e.sieger)} gewinnt!` : 'Unentschieden!';
    if (e.art === 'aufgegeben') text += '\n(Aufgegeben)';
    if (O.ich && e.sieger) text += '\n' + ((e.sieger === 'w' ? 1 : 2) === O.ich ? 'Du hast gewonnen! 🎉' : 'Leider verloren.');
    const tasten = [];
    if (O.ich) {
      const ich = O.ich === 1 ? 'w' : 'b', ander = ich === 'w' ? 'b' : 'w', meins = s.revanche[ich];
      if (s.revanche[ander] && !meins) text += '\nDer andere möchte eine Revanche!';
      tasten.push({ text: meins ? K.TEXTE.revancheWarte : 'Revanche', std: true, aus: meins, bleibt: true, aktion: () => senden({ t: 'revanche' }) });
    }
    tasten.push({ text: 'Hauptmenü', aktion: showMenu });
    dialogZeigen({ titel: 'Spiel beendet', text, tasten, online: true, bleibt: true });
  }

  // ---------------------------------------------------------------- Start
  const raumParam = (new URLSearchParams(location.search).get('raum') || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4);
  if (BRETT.sitzLesen('vier')) {                         // Seite neu geladen / Netz weg: Platz zurückholen
    ansicht('menue');
    app.innerHTML = `<div class="seite"><div class="spalte"><div class="titel klein">4 Gewinnt</div><div class="hinweis">Verbinde wieder<span class="punkte"></span></div><button class="hell-knopf" id="x-abbruch">✖ Abbrechen</button></div></div>`;
    document.getElementById('x-abbruch').onclick = showMenu;
    verbinden();
    setTimeout(() => { if (S.ansicht === 'menue' && !O.stand && O.v) showMenu(); }, 8000);
  } else if (raumParam) onlineOeffnen(raumParam);
  else showMenu();

  window.__vier = { S, O, geometrie: () => { const c = document.getElementById('brett'); return c ? Object.assign(geometrie(c.clientWidth, c.clientHeight), { W: c.clientWidth, H: c.clientHeight }) : null; }, showMenu, startGame };
})();
