// ============================================================
// Schach – Browser-Port der Mac-App (SchachSpiel.swift v3.1): Hauptmenü, alle Spielmodi, Akademie, Lernmodus/Coach, 2D-/3D-Brett.
// Port von SchachWindowController (Swift ~6314–8297) + Menüleiste. Logik: kern/ (Partie, Coach, KI im Web Worker),
// 3D: 3d/ (Schach3D), Zeichnen: schach-brett2d.js, Online-Add-on: schach-online.js. Übersetzungstabelle: PORTIERUNG.md.
// ============================================================
(function () {
  'use strict';
  const K = window.SchachKern, U = window.SchachUI, BRETT = window.BRETT || {};
  const E = K.Einstellungen;
  const app = document.getElementById('app');
  const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const h = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; };
  const TN = { 1: 'pawn', 2: 'knight', 3: 'bishop', 4: 'rook', 5: 'queen', 6: 'king' };
  const WHITE = 0, BLACK = 1;

  // ---------------------------------------------------------------- Zustand (Eigenschaften des SchachWindowController)
  const S = {
    ansicht: 'menue',                       // menue | akademie-start | akademie-stufen | akademie-liste | spiel | online | warten
    modus: null,                            // Modus der laufenden Spielansicht
    use3D: !!E.get('brett3D', true), anim: !!E.get('animAktiv', true), dogs: !!E.get('hundeTeam3D', false),
    autoFlip: !!E.get('autoWenden', false), theme: ((+E.get('farbThema', 0) || 0) % 6 + 6) % 6,
    vonSchwarz: false, online: false, els: null, dialog: null, dropdown: false,
    s3: null, b3dEl: null, b2d: null, an2d: null, kein3D: false,
    tagSq: { 0: null, 1: null }, zlKey: '',
    stufeGezeigt: 1,
  };
  const rechner = new K.WorkerRechner('kern/worker.js');
  const partie = new K.Partie({ rechner });
  partie.difficulty = (+E.get('kiStufe', 5)) > 0 ? +E.get('kiStufe', 5) : 5;
  K.Stil.setzeHunde(S.dogs);
  const A = window.SchachApp = { S, K, U, partie, esc, h };

  // ---------------------------------------------------------------- Symbole (SF Symbols → einfache SVG)
  const IKON = {
    computer: '<svg class="symbol" viewBox="0 0 28 28" fill="currentColor"><rect x="2" y="4" width="24" height="16" rx="2.5"/><rect x="9" y="22" width="10" height="2" rx="1"/><rect x="12.5" y="20" width="3" height="3"/></svg>',
    personen: '<svg class="symbol" viewBox="0 0 28 28" fill="currentColor"><circle cx="10" cy="9" r="4.5"/><path d="M1.5 23c0-5 3.6-8 8.5-8s8.5 3 8.5 8z"/><circle cx="20" cy="10" r="3.6" opacity=".75"/><path d="M19.5 15.2c4.2 0 7 2.4 7 6.8h-6.2c0-2.6-.8-4.8-2.4-6.2.5-.4 1-.6 1.6-.6z" opacity=".75"/></svg>',
    akademie: '<svg class="symbol" viewBox="0 0 28 28" fill="currentColor"><path d="M14 3 1 10l13 7 11-5.9V20h2v-9.9z"/><path d="M6 15.2V20c0 2 3.6 4 8 4s8-2 8-4v-4.8l-8 4.3z"/></svg>',
    buch: '<svg class="symbol" viewBox="0 0 28 28" fill="currentColor"><path d="M14 6C11.5 4.4 7.5 3.8 3 4v17c4.5-.2 8.5.4 11 2 2.5-1.6 6.5-2.2 11-2V4c-4.5-.2-8.5.4-11 2z"/></svg>',
    welt: '<svg class="symbol" viewBox="0 0 28 28" fill="none" stroke="currentColor" stroke-width="2"><circle cx="14" cy="14" r="11"/><ellipse cx="14" cy="14" rx="4.8" ry="11"/><path d="M3 14h22M5 8h18M5 20h18"/></svg>',
    pfeil: '<svg class="pfeil" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 1.5 8.5 6 4 10.5"/></svg>',
  };

  // ---------------------------------------------------------------- Dialog (NSAlert)
  function dialogZu() { if (S.dialog) { const d = S.dialog; S.dialog = null; d.el.remove(); } }
  /** d: { titel, text, tasten:[{text, std, aktion, bleibt, aus, bild}], inhalt: Element, senkrecht, taste(e), abbruch } */
  function dialog(d) {
    dialogZu();
    const el = h('div', 'alarm-hinten');
    el.innerHTML = `<div class="alarm" role="alertdialog" aria-modal="true"><div class="bild" aria-hidden="true">♞︎</div><div class="inhalt"><h2>${esc(d.titel)}</h2><p>${esc(d.text || '')}</p><div class="inh"></div><div class="tasten${d.senkrecht ? ' senkrecht' : ''}"></div></div></div>`;
    if (d.inhalt) el.querySelector('.inh').append(d.inhalt);
    const feld = el.querySelector('.tasten');
    (d.tasten || []).forEach((t, i) => {
      const b = h('button', 'taste' + (t.std ? ' std' : ''), (t.bild ? `<img alt="" src="${t.bild}">` : '') + `<span>${esc(t.text)}</span>`);
      b.dataset.i = i; if (t.aus) b.disabled = true; feld.append(b);
    });
    document.body.append(el); S.dialog = { el, d };
    el.addEventListener('click', (e) => {
      const b = e.target.closest('.taste');
      if (b) { const t = d.tasten[+b.dataset.i]; if (b.disabled) return; if (!t.bleibt) dialogZu(); if (t.aktion) t.aktion(el); }
      else if (e.target === el) { dialogZu(); if (d.abbruch) d.abbruch(); }
    });
    const first = el.querySelector('input') || el.querySelector('.taste.std');
    if (first) setTimeout(() => { try { first.focus({ preventScroll: true }); } catch (e) { /* weg */ } }, 0);
    return el;
  }
  A.dialog = dialog; A.dialogZu = dialogZu;

  // ---------------------------------------------------------------- Ansichtswechsel
  function ansicht(name, titel) {
    S.ansicht = name; document.body.className = 'ansicht-' + (name === 'spiel' ? 'spiel' : 'menue');
    const meta = document.querySelector('meta[name=theme-color]'); if (meta) meta.content = name === 'spiel' ? '#1f1a14' : '#faf7f2';
    document.title = titel || 'Schach'; window.scrollTo(0, 0);
  }
  A.ansicht = ansicht;

  /** Alles abbrechen, was zu einer laufenden Partie gehört (Swift: aiCancelled = true; gameSessionID += 1; animView.cancel; board3D.finishNow) */
  function spielAbbrechen() {
    partie.aiCancelled = true; partie.computerThinking = false; partie.gameSessionID += 1; partie.readyComputerMove = null;
    if (S.an2d) S.an2d.abbrechen(); if (S.s3) S.s3.beendeAnimation();
    clearTimeout(S.endeTimer); dialogZu(); S.dropdown = false;
  }
  A.spielAbbrechen = spielAbbrechen;
  const spielAktiv = () => !!(S.els && S.ansicht === 'spiel');

  // ================================================================ Hauptmenü (showMenu)
  function showMenu() {
    spielAbbrechen();
    if (S.online && A.onlineBeenden) A.onlineBeenden();
    S.online = false; S.modus = null; S.els = null;
    partie.gameOver = false; partie.currentLesson = null; partie.whiteName = ''; partie.blackName = '';
    const gespeichert = +E.get('kiStufe', 5); partie.difficulty = gespeichert > 0 ? gespeichert : 5;
    ansicht('menue', 'Schach');
    const stufe = partie.difficulty;
    app.innerHTML =
      `<div class="seite"><div class="spalte">` +
      `<div class="titel">Schach</div><div class="untertitel">Klassisches Schachspiel</div><canvas id="mini" width="180" height="180"></canvas>` +
      `<div class="karte hervor innen"><div class="kopf">${IKON.computer}<span class="texte" style="display:flex;flex-direction:column;gap:2px"><span class="karte-titel">Spieler vs Computer</span><span class="karte-sub">Gegen die KI spielen</span></span></div>` +
      `<div class="staerke-zeile"><span class="links">Spielstärke:</span><span class="rechts" id="stufe-name"></span></div>` +
      `<input type="range" id="regler" min="1" max="10" step="1" value="${stufe}" list="ticks" aria-label="Spielstärke"><datalist id="ticks">${[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => `<option value="${n}"></option>`).join('')}</datalist>` +
      `<button class="start" id="k-ki">▶&nbsp;&nbsp;Spiel starten</button></div>` +
      `<div class="trenner"><i></i><span>oder</span><i></i></div>` +
      `<button class="karte knopfkarte" id="k-pvp">${IKON.personen}<span class="texte"><span class="karte-titel">Spieler vs Spieler</span><span class="karte-sub">Zu zweit am gleichen Computer</span></span>${IKON.pfeil}</button>` +
      `<div class="trenner"><i></i><span>oder</span><i></i></div>` +
      `<button class="karte hervor knopfkarte" id="k-akad">${IKON.akademie}<span class="texte"><span class="karte-titel">Schach-Akademie 🎓</span><span class="karte-sub">10 Stufen · Interaktive Aufgaben · Fortschritt pro Spieler</span></span>${IKON.pfeil}</button>` +
      `<button class="karte knopfkarte" id="k-tut">${IKON.buch}<span class="texte"><span class="karte-titel">Training mit Coach ♟</span><span class="karte-sub">20 Bücher · 100+ Partien · 300+ Züge · KI-Analyse</span></span>${IKON.pfeil}</button>` +
      `<button class="karte knopfkarte" id="k-online">${IKON.welt}<span class="texte"><span class="karte-titel">Online spielen</span><span class="karte-sub">Mit Freunden, per Raumcode</span></span>${IKON.pfeil}</button>` +
      `<div class="figuren-legende">Figuren:&nbsp; ♔ König &nbsp; ♕ Dame &nbsp; ♖ Turm &nbsp; ♗ Läufer &nbsp; ♘ Springer &nbsp; ♙ Bauer</div>` +
      `<a class="klein-link" href="../">◀ Alle Spiele</a>` +
      `</div></div>`;
    new U.MiniBrett(document.getElementById('mini'), () => U.THEMEN[S.theme]).draw();
    const regler = document.getElementById('regler');
    const label = () => { partie.difficulty = Math.trunc(+regler.value); E.set('kiStufe', partie.difficulty); document.getElementById('stufe-name').textContent = K.Spielstaerke.name(partie.difficulty); };
    regler.oninput = label; label();
    document.getElementById('k-ki').onclick = startVsComputer;
    document.getElementById('k-pvp').onclick = startVsPlayer;
    document.getElementById('k-akad').onclick = showAcademyHome;
    document.getElementById('k-tut').onclick = startTutorial;
    document.getElementById('k-online').onclick = () => { if (A.onlineOeffnen) A.onlineOeffnen(); };
  }
  A.showMenu = showMenu;

  function startVsComputer() { namenDialog(false, () => { partie.gameMode = 'playerVsComputer'; spielStarten(); }); }
  function startVsPlayer() { namenDialog(true, () => { partie.gameMode = 'playerVsPlayer'; spielStarten(); }); }
  function startTutorial() { partie.gameMode = 'tutorial'; partie.difficulty = 3; partie.whiteName = ''; partie.blackName = ''; spielStarten(); }

  // ---------------------------------------------------------------- Namensabfrage mit Figuren-Taufe (askPlayerNames)
  function namenDialog(zwei, weiter) {
    const gem = partie.gemerkteNamen();
    const zeile = (id, label, vor) => `<div class="namenzeile"><label for="${id}-n">${label}</label><input id="${id}-n" maxlength="20" placeholder="Name eingeben" value="${esc(vor || '')}" autocomplete="off" autocapitalize="words"><select id="${id}-f" aria-label="Figur"><option value="koenig">♔ Koenig</option><option value="dame">♕ Dame</option></select></div>`;
    const inhalt = h('div', '', zwei ? zeile('w', 'Weiss:', gem.weiss) + zeile('s', 'Schwarz:', gem.schwarz) : zeile('w', 'Du:', gem.weiss));
    const lies = (id) => ({ name: inhalt.querySelector('#' + id + '-n').value.trim(), tag: inhalt.querySelector('#' + id + '-f').value });
    const ok = () => { partie.setzeNamen(zwei, { weiss: lies('w'), schwarz: zwei ? lies('s') : null }); weiter(); };
    dialog({
      titel: zwei ? 'Wer spielt gegeneinander?' : 'Wie heisst du?', text: 'Dein Name wird an deiner Wunschfigur angezeigt: Koenig oder Dame?', inhalt,
      tasten: [{ text: "Los geht's!", std: true, aktion: ok }, { text: 'Ohne Namen spielen', aktion: () => { partie.setzeNamen(zwei, null); weiter(); } }],
    });
    inhalt.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); dialogZu(); ok(); } });
  }

  // ================================================================ Spielansicht (startGame + relayoutGame)
  const FARBE_AN = { zug: 'var(--gruen)', farben: 'var(--gruen)', hunde: 'rgb(158,102,51)', d3: 'var(--blau3d)', kampf: 'var(--gold)' };
  function schalterHtml(modus) {
    const t = modus === 'tutorial', ak = modus === 'academy', on = modus === 'online';
    const kn = (id, cls, txt, extra) => `<button class="bt ${cls || ''}" id="${id}" ${extra || ''}>${txt}</button>`;
    let rechts;
    if (on) rechts = '<span id="on-knoepfe" style="display:contents"></span>';
    else if (t) rechts = kn('b-zurueck', 'b84', '↶ Zurück') + kn('b-tipp', 'braun b92', '💡 Tipp');
    else if (ak) rechts = kn('b-tipp', 'braun b84', '💡 Tipp');
    else rechts = kn('b-tipp', 'braun b92', '💡 Tipp') + kn('b-neu', 'b70', '↻ Neu');
    return (on ? '' : kn('b-zugwert', 'b100', '💬 Zugwert ○')) + kn('b-farben', 'b80', '🎨 Farben') + kn('b-hunde', 'b84', '🐶 Hunde ○') + kn('b-3d', 'b98', '🧊 3D-Brett ○') +
      kn('b-kampf', 'b88', '💥 Kampf ○') + kn('b-wenden', 'b84', '🔄 Wenden') + `<span class="rechts">${rechts}</span>`;
  }

  /** Baut das Spielfenster neu auf (Swift: startGame – ab „guard let cv“). Eigentlicher Spielstart danach: partie.start()/startLesson(). */
  function spielAufbauen(modus) {
    const akademie = modus === 'academy', tut = modus === 'tutorial', on = modus === 'online';
    S.modus = modus; S.online = on; S.zlKey = '';
    ansicht('spiel', 'Schach'); document.body.classList.toggle('akademie-spiel', akademie);
    app.innerHTML = '';
    const sp = h('div', 'spiel');
    sp.innerHTML =
      `<div class="leiste"><button class="macknopf zur" id="b-zur">${akademie ? '← Stufe' : '← Menü'}</button><button class="macknopf menuknopf" id="b-dd" title="Menü: alle Befehle und Tastenkürzel" aria-label="Menü">☰</button>` +
      `<div class="status" id="status"></div><div class="material"><span class="w" id="mat-w"></span><span class="b" id="mat-b"></span></div>` +
      `<div class="schalter">${schalterHtml(modus)}</div></div>` +
      `<div class="zugliste${akademie ? ' hidden' : ''}" id="zugliste"></div>` +
      `<div class="flaeche ${S.use3D ? 'm3d' : 'm2d'}" id="flaeche"><div id="b3d-platz"></div><div class="b2dwrap" id="b2dwrap"></div>` +
      `<div class="blase hidden" id="blase"><span id="blasetext"></span><button class="zu" id="blase-zu" aria-label="Schließen">✕</button></div></div>` +
      `<div class="unten" id="unten">` +
      ((tut || akademie) ? `<div class="erkl" id="erkl"><div class="ikon">${akademie ? '🎓' : '🧑‍🏫'}</div><div class="text" id="erkl-text"></div>` +
        (akademie ? `<div class="knoepfe"><button class="mini-bt" id="b-nochmal">Nochmal</button><button class="mini-bt gruen hidden" id="b-weiter">Weiter →</button></div>` : '') + `</div>` : '') +
      `<div class="analyse hidden" id="analyse"><canvas id="evalbar"></canvas><div class="k"><div class="atitel" id="atitel">Analyse</div><div class="atext" id="atext"></div></div></div></div>`;
    app.append(sp);
    // 3D-Brett: bleibt zwischen den Spielen bestehen (Swift: board3D wiederverwenden)
    if (!S.b3dEl) { S.b3dEl = h('div', 'b3d'); }
    sp.querySelector('#b3d-platz').replaceWith(S.b3dEl);
    const $ = (id) => sp.querySelector('#' + id);
    const els = S.els = { sp, status: $('status'), matW: $('mat-w'), matB: $('mat-b'), flaeche: $('flaeche'), b2dwrap: $('b2dwrap'), blase: $('blase'), blasetext: $('blasetext'),
      unten: $('unten'), erkl: $('erkl'), erklText: $('erkl-text'), analyse: $('analyse'), atitel: $('atitel'), atext: $('atext'), zugliste: $('zugliste'),
      weiter: $('b-weiter'), tipp: $('b-tipp'), zugwert: $('b-zugwert'), hunde: $('b-hunde'), d3: $('b-3d'), kampf: $('b-kampf'), farben: $('b-farben'), wenden: $('b-wenden') };
    // 2D-Brett + Animation
    S.b2d = new U.Brett2D(els.b2dwrap, { onKlick: feldKlick });
    S.b2d.hunde = S.dogs; S.b2d.thema = S.theme; S.b2d.vonSchwarz = false;
    S.an2d = new window.Animation2D(els.b2dwrap);
    S.evalbar = new U.EvalBar($('evalbar'));
    // 3D-Brett anlegen (falls an und möglich)
    if (S.use3D) ensure3D();
    if (S.use3D && !S.s3) { S.use3D = false; els.flaeche.className = 'flaeche m2d'; }
    S.tagSq = { 0: null, 1: null };
    // Schalter
    $('b-zur').onclick = () => { if (akademie) backToLessonList(); else if (on && A.onlineVerlassen) A.onlineVerlassen(); else showMenu(); };
    $('b-dd').onclick = (e) => { e.stopPropagation(); dropdownUmschalten(); };
    els.farben.onclick = cycleTheme; els.hunde.onclick = toggleDogs; els.d3.onclick = toggleBoard3D; els.kampf.onclick = toggleAnimation; els.wenden.onclick = flipBoard;
    if (els.zugwert) els.zugwert.onclick = toggleAnalysis;
    if (els.tipp) els.tipp.onclick = () => showHint();
    if ($('b-zurueck')) $('b-zurueck').onclick = undoMove;
    if ($('b-neu')) $('b-neu').onclick = resetGame;
    if ($('b-nochmal')) $('b-nochmal').onclick = () => { partie.retryLesson(); };
    if (els.weiter) els.weiter.onclick = nextLesson;
    $('blase-zu').onclick = () => partie.hideCoachBubble();
    if (window.ResizeObserver) { new ResizeObserver(layout).observe(els.flaeche); new ResizeObserver(() => fitStatus()).observe(els.status); }
    schalterZeichnen(); layout();
    if (S.s3) S.s3.groesseAnpassen();
    return els;
  }
  A.spielAufbauen = spielAufbauen;

  function layout() {
    const e = S.els; if (!e || !e.flaeche.isConnected) return;
    const cw = e.flaeche.clientWidth, ch = e.flaeche.clientHeight, sz = Math.max(10, Math.min(cw, ch));
    Object.assign(e.b2dwrap.style, { width: sz + 'px', height: sz + 'px', left: (cw - sz) / 2 + 'px', top: (ch - sz) / 2 + 'px' });
    const ana = !e.analyse.classList.contains('hidden');
    e.unten.classList.toggle('nebeneinander', !!e.erkl && ana && window.innerWidth >= 900);
    if (S.b2d) S.b2d.draw(); if (S.an2d) S.an2d.groesseAnpassen();
    fitStatus();
  }

  // ---------------------------------------------------------------- Statuszeile (FitLabel)
  let messCv = null;
  function fitStatus() {
    const el = S.els && S.els.status; if (!el) return;
    const avail = el.clientWidth - 8; if (avail < 20) return;
    messCv = messCv || document.createElement('canvas').getContext('2d');
    const breite = (sz) => { messCv.font = `600 ${sz}px ${U.UI_FONT}`; return messCv.measureText(el.textContent).width; };
    let size = 14; while (size > 11.5 && breite(size) > avail) size -= 0.5;
    const zwei = breite(size) > avail; if (zwei) size = 12;
    el.style.fontSize = size + 'px'; el.style.whiteSpace = zwei ? 'normal' : 'nowrap'; el.style.textOverflow = zwei ? 'clip' : 'ellipsis';
  }
  function statusSetzen(text) { const e = S.els; if (!e) return; e.status.textContent = text; fitStatus(); }
  A.statusSetzen = statusSetzen;

  function schalterZeichnen() {
    const e = S.els; if (!e) return;
    const an = (b, aktiv, farbe, text) => { if (!b) return; b.classList.toggle('an', !!aktiv); if (farbe) b.style.setProperty('--an', farbe); if (text) b.textContent = text; };
    an(e.zugwert, partie.analysisEnabled, FARBE_AN.zug, partie.analysisEnabled ? '💬 Zugwert ●' : '💬 Zugwert ○');
    an(e.d3, S.use3D, FARBE_AN.d3, S.use3D ? '🧊 3D-Brett ●' : '🧊 3D-Brett ○');
    an(e.kampf, S.anim, FARBE_AN.kampf, S.anim ? '💥 Kampf ●' : '💥 Kampf ○');
    an(e.hunde, S.dogs, S.use3D ? 'rgb(158,102,51)' : 'rgb(217,89,26)', S.dogs ? '🐶 Hunde ●' : '🐶 Hunde ○');
  }

  // ---------------------------------------------------------------- 3D-Brett
  function ensure3D() {
    if (S.s3) return S.s3;
    if (typeof window.THREE === 'undefined' || typeof window.Schach3D === 'undefined') { S.kein3D = true; return null; }
    try {
      S.s3 = new window.Schach3D(S.b3dEl, { hunde: S.dogs, kampf: S.anim, thema: S.theme, qualitaet: 'auto', ansichtVonSchwarz: S.vonSchwarz, onFeldKlick: (r, c) => feldKlick(r, c) });
      S.s3.autoWenden(false);
    } catch (err) { S.s3 = null; S.kein3D = true; if (window.console) console.warn('3D nicht verfügbar:', err && err.message); }
    return S.s3;
  }
  const gitter = (b) => b.grid.map((row) => row.map((p) => (p ? { color: p.color === WHITE ? 'white' : 'black', type: TN[p.type] } : null)));
  const zug3D = (z) => ({ from: { row: z.from.row, col: z.from.col }, to: { row: z.to.row, col: z.to.col }, capturedPiece: z.capturedPiece ? TN[z.capturedPiece] : null,
    isCastling: !!z.isCastling, isEnPassant: !!z.isEnPassant, promotion: z.promotion ? TN[z.promotion] : null });

  function tagsDefinieren() {   // Namens-Schildchen: nur in PvP/PvC (Online: Spielernamen, vom Online-Modul gesetzt)
    const t = {};
    if (S.modus === 'playerVsPlayer' || S.modus === 'playerVsComputer') {
      if (partie.whiteName) t[WHITE] = { type: partie.whiteTagType, name: partie.whiteName };
      if (partie.blackName && partie.blackName !== 'Computer') t[BLACK] = { type: partie.blackTagType, name: partie.blackName };
    } else if (S.modus === 'online' && A.onlineTags) Object.assign(t, A.onlineTags());
    return t;
  }
  function syncTags3D(board) {
    const s3 = S.s3; if (!s3 || !S.use3D || s3.animiert) return;
    const tags = S.b2d ? S.b2d.nameTags : {};
    for (const farbe of [WHITE, BLACK]) {
      const alt = S.tagSq[farbe]; let neu = null; const tag = tags[farbe];
      if (tag && tag.name) for (let r = 0; r < 8 && !neu; r++) for (let c = 0; c < 8; c++) { const p = board.grid[r][c]; if (p && p.color === farbe && p.type === tag.type) { neu = { row: r, col: c }; break; } }
      if (alt && (!neu || alt.row !== neu.row || alt.col !== neu.col)) s3.namensschild(alt, '');
      if (neu) s3.namensschild(neu, tag.name);
      S.tagSq[farbe] = neu;
    }
  }

  /** Swift: updateUI → boardView.refresh + board3D.refresh */
  function brettZeichnen(z) {
    const e = S.els; if (!e) return;
    S.b2d.setze({ board: z.brett, ausgewaehlt: z.ausgewaehlt, ziele: z.ziele, letzterZug: z.letzterZug, schach: z.schach, hinweisPfeil: z.hinweisPfeil, gefahr: z.gefahrFelder, fokus: z.fokusFeld, nameTags: S.b2d.nameTags });
    if (S.use3D && S.s3) {
      const s3 = S.s3, zl = [], sl = [];
      for (const t of z.ziele) (z.brett.piece(t) ? sl : zl).push(t);
      s3.setzeStellung(gitter(z.brett));
      const fk = (p) => (p ? { row: p.row, col: p.col } : undefined);
      s3.markiere(zl, sl, { ausgewaehlt: fk(z.ausgewaehlt), letzterZug: z.letzterZug ? { from: fk(z.letzterZug.from), to: fk(z.letzterZug.to) } : undefined,
        schach: fk(z.schach), gefahr: z.gefahrFelder, fokus: fk(z.fokusFeld), hinweis: z.hinweisPfeil ? { from: fk(z.hinweisPfeil.from), to: fk(z.hinweisPfeil.to) } : undefined });
      syncTags3D(z.brett);
    }
    e.matW.textContent = z.material.weiss; e.matB.textContent = z.material.schwarz;
    zugListeNeu();
  }
  A.brettZeichnen = brettZeichnen;

  const brettBeschaeftigt = () => !!((S.an2d && S.an2d.laeuft) || (S.s3 && S.use3D && S.s3.animiert));
  A.brettBeschaeftigt = brettBeschaeftigt;
  /** Swift: runWhenBoardIdle – führt fn aus, sobald keine Animation mehr läuft (und mindestens minDelay Sekunden vergangen sind) */
  function wennBrettFrei(session, minDelay, fn) {
    const start = Date.now();
    (function versuch() {
      if (partie.gameSessionID !== session) return;
      if (brettBeschaeftigt() || (Date.now() - start) / 1000 < minDelay) setTimeout(versuch, 50); else fn();
    })();
  }
  A.wennBrettFrei = wennBrettFrei;

  function zugAnimieren(d) {
    const z = d.zug; if (A.stumm) return;
    if (S.use3D && S.s3) {
      const p = S.s3.animiereZug(zug3D(z));
      if (p && p.then) p.then(() => { if (S.els && S.s3) syncTags3D(partie.board); });
    } else if (S.anim && S.an2d && S.els) {
      const p = d.vorher.piece(z.from); if (!p) return;
      const opfer = z.capturedPiece ? { typ: TN[z.capturedPiece], weiss: d.ziehender !== WHITE } : null;
      S.b2d.versteckt = [{ row: z.to.row, col: z.to.col }]; S.b2d.draw();
      S.an2d.animiere({ typ: TN[p.type], weiss: p.color === WHITE, schlag: opfer, von: S.b2d.mitte(z.from), nach: S.b2d.mitte(z.to), zelle: S.b2d.zellGroesse, hunde: S.dogs })
        .then(() => { if (S.b2d) { S.b2d.versteckt = []; S.b2d.draw(); } });
    }
  }

  // ---------------------------------------------------------------- Wenden, Kamera
  function setBoardView(vonSchwarz, animiert) {
    S.vonSchwarz = vonSchwarz;
    if (S.b2d) { S.b2d.vonSchwarz = vonSchwarz; S.b2d.draw(); }
    if (S.s3) S.s3.wenden(vonSchwarz, !!animiert && S.use3D);
  }
  A.setBoardView = setBoardView;
  function flipBoard() { if (!spielAktiv()) return; setBoardView(!S.vonSchwarz, true); statusSetzen(S.vonSchwarz ? '🔄 Blick von Schwarz' : '🔄 Blick von Weiss'); }
  function toggleAutoFlip() {
    S.autoFlip = !S.autoFlip; E.set('autoWenden', S.autoFlip);
    if (S.autoFlip && partie.gameMode === 'playerVsPlayer' && spielAktiv() && !S.online) setBoardView(partie.currentPlayer === BLACK, true);
  }
  function resetCamera() { if (S.s3) S.s3.kameraZuruecksetzen(); }

  // ---------------------------------------------------------------- Schalter-Aktionen
  function cycleTheme() {
    S.theme = (S.theme + 1) % 6; E.set('farbThema', S.theme);
    if (S.b2d) { S.b2d.thema = S.theme; S.b2d.draw(); } if (S.s3) S.s3.setzeThema(S.theme);
    statusSetzen('🎨 Farbthema: ' + U.THEMEN[S.theme].name);
  }
  function toggleDogs() {
    S.dogs = !S.dogs; E.set('hundeTeam3D', S.dogs); K.Stil.setzeHunde(S.dogs);
    if (S.s3) S.s3.hunde(S.dogs); if (S.b2d) { S.b2d.hunde = S.dogs; S.b2d.draw(); }
    schalterZeichnen(); if (partie.board && S.els) partie.updateUI();
    statusSetzen(S.dogs ? '🐶 Hunde-Team: Bruno=König · Luna=Dame · Brocken=Turm · Wurzel=Läufer · Falko=Springer · Welpen=Bauern' : (S.use3D ? '♛ Klassische 3D-Figuren' : '♛ Klassische Figuren'));
    if (partie.gameMode === 'tutorial' && S.dogs) partie.showExplanation('🐶 Dein Hunde-Team:\n• Bruno, der Bernhardiner mit Krone = König\n• Luna, der Windhund mit Diadem = Dame\n• Brocken, die Bulldogge mit Burghut = Turm\n• Wurzel, der Dackel mit Bischofsmütze = Läufer\n• Falko, der Schäferhund mit Federbusch = Springer\n• die Welpen = Bauern\nDas goldene Schild am Halsband zeigt die Schachfigur. Klicke eine Figur an, um mehr zu erfahren!');
  }
  function toggleAnimation() {
    S.anim = !S.anim; E.set('animAktiv', S.anim); if (S.s3) S.s3.kampf(S.anim);
    if (!S.anim && S.an2d) S.an2d.abbrechen();
    schalterZeichnen();
    statusSetzen(S.anim ? '💥 Kampfszenen an: Springer springt, Turm rammt, Laeufer schlaegt, Dame zaubert!' : 'Kampfszenen aus – Figuren ziehen ohne Kampf');
  }
  function toggleBoard3D() {
    if (!spielAktiv()) return;
    const neu = !S.use3D;
    if (neu && !ensure3D()) { statusSetzen('🧊 3D ist auf diesem Gerät nicht verfügbar – es bleibt beim 2D-Brett.'); return; }
    S.use3D = neu; E.set('brett3D', S.use3D);
    if (S.an2d) S.an2d.abbrechen(); if (S.s3) S.s3.beendeAnimation();
    if (S.b2d) { S.b2d.versteckt = []; }
    S.els.flaeche.className = 'flaeche ' + (S.use3D ? 'm3d' : 'm2d');
    if (S.s3) { S.s3.hunde(S.dogs); S.s3.kampf(S.anim); S.s3.groesseAnpassen(); S.s3.wenden(S.vonSchwarz, false); }
    S.tagSq = { 0: null, 1: null };
    schalterZeichnen(); layout(); partie.updateUI();
    statusSetzen(S.use3D ? '🧊 Echtes 3D: Maus ziehen = drehen · Scrollen = zoomen · 🔄 = wenden · 🐶 = Hunde-Team' : '▦ Klassisches 2D-Brett');
  }
  function toggleAnalysis() {
    if (!spielAktiv() || S.online) return;
    partie.setzeAnalyse(!partie.analysisEnabled);
    S.els.analyse.classList.toggle('hidden', !partie.analysisEnabled);
    if (partie.analysisEnabled) A.analyseText('Kommentare aktiviert! Jeder Zug erhaelt:\n- Zugwert 1-15 mit Erklaerung (15 = perfekt), berechnet mit echter Vorausschau\n- Bei Fehlern: den besseren Zug UND warum deiner schlecht war\n- Eroeffnungserkennung (ECO) & Taktik-Erkennung (Gabel, Fesselung, Spiess, Abzugsschach)\n- Buchwissen aus 20 Schachbuechern');
    schalterZeichnen(); layout(); if (S.evalbar) S.evalbar.draw();
  }
  A.analyseText = (t) => { if (S.els) S.els.atext.textContent = t; };

  function showHint() { if (!spielAktiv() || S.online) return; if (partie.gameMode !== 'academy' && brettBeschaeftigt()) return; return partie.showHint(); }
  function undoMove() {
    if (!spielAktiv() || S.online || partie.gameMode === 'academy') return;
    if (S.an2d) S.an2d.abbrechen(); if (S.s3) S.s3.beendeAnimation(); if (S.b2d) S.b2d.versteckt = [];
    partie.undoMove();
  }
  function resetGame() { if (!spielAktiv() || S.online) return; spielStarten(); }

  // ================================================================ Spielstart (startGame)
  function spielStarten() {
    spielAbbrechen();
    const modus = partie.gameMode;
    K.Stil.setzeHunde(S.dogs);
    spielAufbauen(modus);
    S.b2d.nameTags = tagsDefinieren();
    S.vonSchwarz = false;
    if (S.s3) { S.s3.wenden(false, false); }
    partie.neuesSpiel({ modus, analyse: modus === 'playerVsComputer' || modus === 'playerVsPlayer' ? !!E.get('analyseAktiv', false) : undefined });
    S.els.analyse.classList.toggle('hidden', !partie.analysisEnabled);
    if (partie.analysisEnabled && modus !== 'tutorial') A.analyseText('Analyse aktiv - mache einen Zug...');
    schalterZeichnen(); layout(); if (S.evalbar) { S.evalbar.set(0); }
  }
  A.spielStarten = spielStarten;

  // ---------------------------------------------------------------- Klicks (handleClick) und Umwandlungsdialog (PromotionDialog)
  function feldKlick(row, col) {
    if (!spielAktiv()) return;
    if (S.online) { if (A.onlineKlick) A.onlineKlick(row, col); return; }
    if (brettBeschaeftigt()) return;                                   // während der Animation kein Input
    dropdownZu();
    const r = partie.handleClick(row, col);
    if (r.typ === 'umwandlung') umwandlungFragen(r.zuege, (zug) => partie.playerMove(zug));
  }
  /** zuege = die vier Umwandlungszüge; wahl(zug) mit dem gewählten Zug */
  function umwandlungFragen(zuege, wahl) {
    const hunde = S.dogs, TYPEN = [[5, 'Dame', 'Dame (D)', 'Luna'], [4, 'Turm', 'Turm (T)', 'Brocken'], [3, 'Laeufer', 'Laeufer (L)', 'Wurzel'], [2, 'Springer', 'Springer (S)', 'Falko']];
    const nimm = (t) => { const z = zuege.find((m) => m.promotion === t) || zuege[0]; wahl(z); };
    dialog({
      titel: 'Bauernumwandlung', text: 'In welche Figur soll der Bauer umgewandelt werden?', senkrecht: true,
      tasten: TYPEN.map(([t, , txt, hund], i) => ({ text: hunde ? `${txt.replace(/ \(.\)/, '')} - ${hund}` : txt, std: i === 0, bild: hunde ? U.hundeIconUrl(t, 22) : null, aktion: () => nimm(t) })),
      taste: (e) => { const t = { d: 5, q: 5, t: 4, r: 4, l: 3, b: 3, s: 2, n: 2 }[e.key.toLowerCase()]; if (t) { dialogZu(); nimm(t); return true; } },
    });
  }
  A.umwandlungFragen = umwandlungFragen;

  // ---------------------------------------------------------------- Ereignisse der Partie → Oberfläche
  partie.on('brett', (z) => { if (S.els) brettZeichnen(z); });
  partie.on('status', (d) => { if (S.els && !(S.online && A.onlineStatusSperre && A.onlineStatusSperre())) statusSetzen(d.text); });
  partie.on('erklaerung', (d) => { if (S.els && S.els.erklText) S.els.erklText.textContent = d.text; });
  partie.on('analyseText', (d) => { if (S.els) S.els.atext.textContent = d.text; });
  partie.on('analyseTitel', (d) => { if (S.els) S.els.atitel.textContent = d.text; });
  partie.on('bewertung', (d) => { if (S.evalbar) S.evalbar.set(d.wert); });
  partie.on('coachBlase', (d) => { if (S.els) { S.els.blasetext.textContent = d.text; S.els.blase.classList.remove('hidden'); } });
  partie.on('coachBlaseAus', () => { if (S.els) S.els.blase.classList.add('hidden'); });
  partie.on('tippKnopf', (d) => { if (S.els && S.els.tipp) S.els.tipp.textContent = d.text; });
  partie.on('zug', (d) => { if (S.els) zugAnimieren(d); });
  partie.on('computerZugBereit', () => {
    const session = partie.gameSessionID;
    wennBrettFrei(session, 0.3, () => { if (!partie.aiCancelled) partie.computerZugAusfuehren(); });
  });
  partie.on('ansicht', (d) => {
    if (!S.els || S.online) return;
    if (!d.automatisch) { setBoardView(d.vonSchwarz, false); return; }
    if (S.autoFlip && partie.gameMode === 'playerVsPlayer') {
      const ziel = d.vonSchwarz, session = partie.gameSessionID;
      wennBrettFrei(session, 0.15, () => setBoardView(ziel, true));
    }
  });
  partie.on('spielende', (d) => {
    if (!S.els || S.online) return;
    const session = partie.gameSessionID;
    clearTimeout(S.endeTimer);
    S.endeTimer = setTimeout(() => {
      if (partie.gameSessionID !== session || !S.els) return;
      dialog({ titel: 'Spiel beendet', text: d.text, tasten: [{ text: 'Neues Spiel', std: true, aktion: spielStarten }, { text: 'Hauptmenu', aktion: showMenu }] });
    }, 600);
  });
  partie.on('lektionGeloest', () => { if (S.els && S.els.weiter) S.els.weiter.classList.remove('hidden'); });
  partie.on('lektionStart', () => { if (S.els && S.els.weiter) S.els.weiter.classList.add('hidden'); });
  partie.on('zugZurueck', () => { if (S.els) S.els.blase.classList.add('hidden'); });

  // ---------------------------------------------------------------- Zugliste (Zusatz zur Mac-App)
  function zugListeNeu() {
    const e = S.els; if (!e || !e.zugliste || partie.gameMode === 'academy') return;
    const hist = partie.gameMoveHistory, key = hist.join(',');
    if (key === S.zlKey) return; S.zlKey = key;
    if (!hist.length) { e.zugliste.innerHTML = '<span>Zugliste – noch kein Zug</span>'; return; }
    const b = new K.ChessBoard(); let farbe = WHITE, html = '';
    for (let i = 0; i < hist.length; i++) {
      const m = b.findMoveByUci(hist[i], farbe); if (!m) break;
      const san = K.CoachTools.san(m, b); b.executeMove(m);
      if (farbe === WHITE) html += `<b>${Math.floor(i / 2) + 1}.</b> `;
      html += (i === hist.length - 1 ? `<span class="neu">${esc(san)}</span>` : esc(san)) + ' '; farbe = 1 - farbe;
    }
    e.zugliste.innerHTML = html; e.zugliste.scrollLeft = e.zugliste.scrollWidth;
  }

  // ================================================================ Menü-Knopf (ersetzt die Mac-Menüleiste) + Tastenkürzel
  function menuePunkte() {
    const inGame = spielAktiv(), akad = partie.gameMode === 'academy', on = S.online;
    const P = [
      { g: 'Spiel' },
      { id: 'neu', t: 'Neues Spiel', k: 'N', ok: inGame && !on, f: resetGame },
      { id: 'zurueck', t: 'Zug zurücknehmen', k: 'Z', ok: inGame && !on && !akad && partie.kannZuruecknehmen(), f: undoMove },
      { id: 'tipp', t: 'Tipp vom Coach', k: 'T', ok: inGame && !on && !partie.gameOver, f: () => showHint() },
      { id: 'zugwert', t: 'Zugwert-Kommentare', k: 'Umschalt+K', haken: partie.analysisEnabled, ok: inGame && !on, f: toggleAnalysis },
      { s: 1 },
      { id: 'menue', t: 'Hauptmenü', k: 'M', ok: inGame, f: () => (akad ? backToLessonList() : (on && A.onlineVerlassen ? A.onlineVerlassen() : showMenu())) },
      { g: 'Darstellung' },
      { id: 'wenden', t: 'Brett wenden', k: 'R', ok: inGame, f: flipBoard },
      { id: 'auto', t: 'Automatisch wenden (2 Spieler)', k: 'A', haken: S.autoFlip, ok: true, f: toggleAutoFlip },
      { s: 1 },
      { id: 'd3', t: 'Echtes 3D-Brett', k: '3', haken: S.use3D, ok: inGame, f: toggleBoard3D },
      { id: 'kampf', t: 'Kampfszenen', k: 'K', haken: S.anim, ok: inGame, f: toggleAnimation },
      { id: 'hunde', t: 'Hunde-Team', k: 'D', haken: S.dogs, ok: inGame, f: toggleDogs },
      { id: 'kamera', t: 'Kamera zurücksetzen', k: '0', ok: inGame && S.use3D, f: resetCamera },
      { id: 'farbe', t: 'Brettfarbe wechseln', k: 'B', ok: inGame, f: cycleTheme },
      { s: 1 },
      { id: 'voll', t: 'Vollbild', k: 'F', haken: !!fsElement(), ok: vollbildMoeglich(), f: toggleFullScreen },
    ];
    return P.filter((p) => !(on && (p.id === 'neu' || p.id === 'zurueck' || p.id === 'tipp' || p.id === 'zugwert')));
  }
  function dropdownZu() { const d = document.getElementById('dropdown'); if (d) d.remove(); S.dropdown = false; }
  function dropdownUmschalten() {
    if (document.getElementById('dropdown')) return dropdownZu();
    const leiste = S.els && S.els.sp.querySelector('.leiste'); if (!leiste) return;
    const dd = h('div', 'dropdown'); dd.id = 'dropdown'; dd.setAttribute('role', 'menu');
    for (const p of menuePunkte()) {
      if (p.g) dd.append(h('div', 'gruppe', esc(p.g)));
      else if (p.s) dd.append(h('hr'));
      else { const b = h('button', '', `<span class="h">${p.haken ? '✓' : ''}</span><span class="t">${esc(p.t)}</span><span class="k">${esc(p.k)}</span>`); b.disabled = !p.ok; b.dataset.id = p.id; b.setAttribute('role', 'menuitem'); b.onclick = () => { dropdownZu(); if (p.ok) p.f(); }; dd.append(b); }
    }
    leiste.append(dd); S.dropdown = true;
  }
  document.addEventListener('click', (e) => { if (S.dropdown && !e.target.closest('#dropdown') && !e.target.closest('#b-dd')) dropdownZu(); });

  // ---------------------------------------------------------------- Vollbild
  const fsElement = () => document.fullscreenElement || document.webkitFullscreenElement || null;
  const vollbildMoeglich = () => !!(document.fullscreenEnabled || document.webkitFullscreenEnabled);
  function toggleFullScreen() {
    const d = document.documentElement;
    try { if (fsElement()) (document.exitFullscreen || document.webkitExitFullscreen).call(document); else (d.requestFullscreen || d.webkitRequestFullscreen).call(d); } catch (e) { /* nicht erlaubt */ }
  }
  const fsAenderung = () => { layout(); if (S.s3) S.s3.groesseAnpassen(); };
  document.addEventListener('fullscreenchange', fsAenderung); document.addEventListener('webkitfullscreenchange', fsAenderung);
  window.addEventListener('resize', () => { layout(); });

  // ---------------------------------------------------------------- Tastatur
  document.addEventListener('keydown', (e) => {
    if (e.target && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName) && e.target.type !== 'range') { if (e.key === 'Escape' && S.dialog) dialogZu(); return; }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (S.dialog) {
      if (S.dialog.d.taste && S.dialog.d.taste(e)) { e.preventDefault(); return; }
      if (e.key === 'Enter') { const b = S.dialog.el.querySelector('.taste.std:not([disabled])'); if (b) { e.preventDefault(); b.click(); } }
      else if (e.key === 'Escape') { const d = S.dialog.d; dialogZu(); if (d.abbruch) d.abbruch(); }
      return;
    }
    if (e.key === 'Escape') { if (S.dropdown) dropdownZu(); else if (S.els && !S.els.blase.classList.contains('hidden')) partie.hideCoachBubble(); return; }
    if (S.ansicht !== 'spiel') { if ((e.key === 'f' || e.key === 'F') && S.ansicht === 'menue') toggleFullScreen(); return; }
    const k = e.key, mk = k.toLowerCase();
    const aktion = (id) => { const p = menuePunkte().find((x) => x.id === id); if (p && p.ok) { p.f(); e.preventDefault(); } };
    if (k === 'K') return aktion('zugwert');
    switch (mk) {
      case 'n': return aktion('neu'); case 'z': case 'backspace': return aktion('zurueck'); case 't': return aktion('tipp');
      case 'm': return aktion('menue'); case 'r': return aktion('wenden'); case 'a': return aktion('auto'); case '3': return aktion('d3');
      case 'k': return aktion('kampf'); case 'd': return aktion('hunde'); case '0': return aktion('kamera'); case 'b': return aktion('farbe'); case 'f': return aktion('voll');
    }
  });

  // ================================================================ Schach-Akademie
  const store = () => K.PlayerProfileStore.shared;
  function akademieSeite(titel, fenster) { spielAbbrechen(); ansicht('akademie', fenster); S.els = null; S.online = false; const w = h('div', 'seite'); const sp = h('div', 'spalte akad'); w.append(sp); app.innerHTML = ''; app.append(w); return sp; }
  const ns = (txt, f) => { const b = h('button', 'ns-knopf', esc(txt)); b.onclick = f; return b; };

  function showAcademyHome() {
    const sp = akademieSeite('', 'Schach-Akademie');
    sp.append(h('div', 'akad-titel', '🎓 Schach-Akademie'), h('div', 'akad-sub', '10 Stufen - vom ersten Zug bis zur Meisterpruefung'));
    const karte = h('div', 'karte innen'); karte.style.gap = '12px'; karte.style.padding = '18px';
    const profile = store().profiles;
    const opts = ['<option value="neu">✏️ Neuer Spieler</option>'].concat(profile.map((p, i) => {
      const done = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].reduce((s, l) => s + K.ChessAcademy.progress(p, l).done, 0);
      return `<option value="${i}">${esc(p.name)}  ·  ${done}/${K.ChessAcademy.lessons.length} Aufgaben · ${K.profileTotalStars(p)}⭐</option>`;
    }));
    karte.innerHTML = `<div class="wer-lernt">Wer lernt heute?</div><select class="profil-wahl" id="profil">${opts.join('')}</select><input class="name-feld" id="profil-name" maxlength="20" placeholder="Deinen Namen eingeben..." autocomplete="off"><button class="start" id="akad-los" style="margin-top:6px;height:46px">🚀 Los geht's!</button>`;
    sp.append(karte, h('div', 'akad-info', 'Dein Fortschritt wird automatisch unter deinem Namen gespeichert.\nJede Aufgabe kannst du beliebig oft wiederholen.'), ns('← Hauptmenue', showMenu));
    const sel = karte.querySelector('#profil'), feld = karte.querySelector('#profil-name');
    if (profile.length) sel.value = '0';
    const zeigen = () => feld.classList.toggle('hidden', sel.value !== 'neu'); zeigen(); sel.onchange = zeigen;
    karte.querySelector('#akad-los').onclick = () => {
      let name;
      if (sel.value === 'neu') {
        name = feld.value.trim();
        if (!name) { feld.placeholder = 'Bitte zuerst einen Namen eingeben!'; feld.classList.remove('hidden'); feld.focus(); return; }
        partie.setzeProfil(name);
      } else { name = profile[+sel.value].name; partie.setzeProfil(name); }
      partie.whiteName = partie.academyProfile.name; partie.blackName = 'Computer';
      showAcademyLevels();
    };
    feld.addEventListener('keydown', (e) => { if (e.key === 'Enter') karte.querySelector('#akad-los').click(); });
  }

  function showAcademyLevels() {
    const profil = partie.academyProfile; if (!profil) return showAcademyHome();
    const sp = akademieSeite('', 'Akademie - Stufen');
    const gesamt = K.ChessAcademy.lessons, geloest = gesamt.filter((l) => profil.lessonProgress[l.id] && profil.lessonProgress[l.id].completed === true).length;
    sp.append(h('div', 'akad-titel klein', `🎓 ${esc(profil.name)}s Akademie`), h('div', 'akad-sub k', `${geloest}/${gesamt.length} Aufgaben geloest · ${K.profileTotalStars(profil)} Sterne`));
    for (let level = 1; level <= 10; level++) {
      const info = K.ChessAcademy.levelInfo[level - 1], prog = K.ChessAcademy.progress(profil, level), frei = K.ChessAcademy.isLevelUnlocked(profil, level);
      let status;
      if (!frei) status = `🔒 Noch gesperrt - loese erst Stufe ${level - 1}!`; else if (prog.done >= prog.total) status = `✅ Geschafft! ${prog.stars}⭐ - jederzeit wiederholbar`; else status = `${prog.done}/${prog.total} Aufgaben · ${prog.stars}⭐`;
      const k = h('button', 'stufe-karte' + (frei && prog.done < prog.total ? ' hervor' : '') + (frei ? '' : ' gesperrt'), `<span class="t">${esc(info.name)}</span><span class="s">${esc(info.subtitle)}</span><span class="st">${esc(status)}</span>`);
      k.dataset.stufe = level; if (frei) k.onclick = () => { S.stufeGezeigt = level; showLessonList(level); }; sp.append(k);
    }
    sp.append(ns('← Spieler wechseln', showAcademyHome));
  }

  function showLessonList(level) {
    const profil = partie.academyProfile; if (!profil) return showAcademyHome();
    S.stufeGezeigt = level;
    const sp = akademieSeite('', 'Akademie - Aufgaben'), info = K.ChessAcademy.levelInfo[level - 1];
    sp.append(h('div', 'akad-titel kl2', esc(info.name)), h('div', 'akad-sub k', esc(info.subtitle)));
    const lessons = K.ChessAcademy.lessonsForLevel(level);
    lessons.forEach((l, idx) => {
      const pr = profil.lessonProgress[l.id], fertig = !!(pr && pr.completed);
      const sterne = fertig ? ' ' + new Array(Math.max(1, pr.stars || 1) + 1).join('⭐') : '', typ = l.freePlayMoves > 0 ? ' · Spielpraxis' : '';
      const k = h('button', 'stufe-karte' + (fertig ? '' : ' hervor'), `<span class="t">${fertig ? '✅' : '▶️'} ${esc(l.title)}${sterne}</span><span class="s">Aufgabe ${idx + 1} von ${lessons.length}${typ}${fertig ? ' · zum Wiederholen klicken' : ''}</span>`);
      k.dataset.lektion = l.id; k.onclick = () => startLesson(l); sp.append(k);
    });
    sp.append(ns('← Alle Stufen', showAcademyLevels));
  }
  function backToLessonList() { showLessonList(partie.currentLesson ? partie.currentLesson.level : S.stufeGezeigt); }

  function startLesson(lesson) {
    spielAbbrechen();
    partie.gameMode = 'academy'; partie.currentLesson = lesson;
    K.Stil.setzeHunde(S.dogs);
    spielAufbauen('academy');
    S.b2d.nameTags = {}; S.vonSchwarz = false; if (S.s3) S.s3.wenden(false, false);
    partie.startLesson(lesson);
    S.els.analyse.classList.toggle('hidden', !partie.analysisEnabled);
    schalterZeichnen(); layout(); if (S.evalbar) S.evalbar.set(0);
  }
  function nextLesson() {
    const n = partie.naechsteLektion();
    if (n) startLesson(n); else showAcademyLevels();
  }

  // ================================================================ Start
  A.start = function () {
    const param = (new URLSearchParams(location.search).get('raum') || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4);
    if (A.onlineStart && A.onlineStart(param)) return;
    showMenu();
  };
  A.funktionen = { showMenu, startVsComputer, startVsPlayer, startTutorial, showAcademyHome, showAcademyLevels, showLessonList, startLesson, spielStarten, toggleBoard3D, toggleDogs, toggleAnimation, toggleAnalysis,
    flipBoard, cycleTheme, undoMove, showHint, resetGame, toggleAutoFlip, resetCamera, dropdownUmschalten, feldKlick, ensure3D, layout, zugListeNeu, namenDialog };
  window.__schach = A;
})();
