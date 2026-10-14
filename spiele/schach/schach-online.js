// ============================================================
// Schach – Online-Modus (Add-on, nicht in der Mac-App): Karte „Online spielen“ im Hauptmenü, Raumcode/Link/QR, Zuschauen,
// Revanche (Farben tauschen), Wiederverbinden. Protokoll unverändert: /ws-brett (server/brettspiele.js), der Server prüft jeden Zug.
// Anzeige läuft über dasselbe Spielfenster wie lokal (3D/2D, Hunde, Kampf, Wenden sind lokal wählbar).
// Fairness: Coach/Tipp, Zugwert-Kommentare und Zurücknehmen sind online ausgeschaltet.
// ============================================================
(function () {
  'use strict';
  const A = window.SchachApp, S = A.S, K = A.K, G = window.BRETT.K, partie = A.partie, esc = A.esc, h = A.h, BRETT = window.BRETT;
  const app = document.getElementById('app');
  const WHITE = 0, BLACK = 1;
  const O = { v: null, verb: 'zu', stand: null, runde: -1, ich: 'z', wartet: false, code: '', endeGezeigt: false, seite: 'z',
    name: G.NAMEN[Math.floor(Math.random() * G.NAMEN.length)].id };
  try { const n = localStorage.getItem('schach-name'); if (n && G.NAMEN.some((x) => x.id === n)) O.name = n; } catch (e) { /* privat */ }
  const kurz = (n) => String(n || '').replace(/^[^A-Za-zÄÖÜäöü0-9]+/, '').trim();       // „🦊 Fuchs“ → „Fuchs“
  A.onlineStatusSperre = () => S.online;                                              // Partie-Statustexte (lokal) online ausblenden
  const senden = (o) => { if (O.v) O.v.senden(o); };

  // ---------------------------------------------------------------- Lobby
  function hinweisSetzen(t, fehler) { const n = document.getElementById('hinweis'); if (n) { n.textContent = t || ''; n.classList.toggle('fehler', !!fehler); } }
  function onlineOeffnen(code, hinweis) {
    A.spielAbbrechen(); S.online = false; S.els = null; A.ansicht('online', 'Schach – Online');
    const tiere = G.NAMEN.map((n) => `<button class="pille${O.name === n.id ? ' an' : ''}" data-name="${n.id}">${n.emoji} ${n.text}</button>`).join('');
    const seiten = [['w', '⚪ Weiß (fängt an)'], ['b', '⚫ Schwarz'], ['z', '🎲 Zufall']].map(([id, t]) => `<button class="pille${O.seite === id ? ' an' : ''}" data-seite="${id}">${t}</button>`).join('');
    app.innerHTML =
      `<div class="seite"><div class="spalte">` +
      `<div class="zeile-oben"><button class="ns-knopf" data-a="menue">◀ Hauptmenü</button></div>` +
      `<div class="titel" style="font-size:36px;height:46px;line-height:46px">Online spielen</div>` +
      `<div class="karte innen"><h3>Wer bist du?</h3><p class="hilfe">Nur Tiernamen – so bleibt alles kindersicher.</p><div class="pillen" id="namen">${tiere}</div></div>` +
      `<div class="karte hervor innen"><h3>Neuen Raum aufmachen</h3><p class="hilfe">Ich spiele …</p><div class="pillen" id="seiten">${seiten}</div><button class="start" data-a="erstellen">▶&nbsp;&nbsp;Raum erstellen</button></div>` +
      `<div class="karte innen"><h3>Einem Raum beitreten</h3><p class="hilfe">Den 4-stelligen Code eintippen.</p><input class="codefeld" id="codefeld" maxlength="4" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="ABCD" value="${code ? esc(code) : ''}">` +
      `<div class="reihe" style="margin-top:8px"><button class="start" data-a="beitreten" style="margin:0">Beitreten</button><button class="start grau" data-a="zuschauen" style="margin:0">👀&nbsp;Zuschauen</button></div></div>` +
      `<div class="hinweis${hinweis ? ' fehler' : ''}" id="hinweis">${hinweis ? esc(hinweis) : ''}</div>` +
      `<div class="akad-info">Online sind Coach, Tipps und Zugwert aus (fair für beide). 3D/2D, Hunde und Kampfszenen wählst du für dich allein.</div></div></div>`;
    const f = document.getElementById('codefeld');
    f.addEventListener('input', () => { f.value = f.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4); });
    f.addEventListener('keydown', (e) => { if (e.key === 'Enter') beitreten(false); });
    app.querySelector('.seite').addEventListener('click', lobbyKlick);
  }
  function lobbyKlick(e) {
    const name = e.target.closest('[data-name]');
    if (name) { O.name = name.dataset.name; try { localStorage.setItem('schach-name', O.name); } catch (x) { /* privat */ } app.querySelectorAll('[data-name]').forEach((b) => b.classList.toggle('an', b === name)); return; }
    const seite = e.target.closest('[data-seite]');
    if (seite) { O.seite = seite.dataset.seite; app.querySelectorAll('[data-seite]').forEach((b) => b.classList.toggle('an', b === seite)); return; }
    const a = e.target.closest('[data-a]'); if (!a) return;
    switch (a.dataset.a) {
      case 'menue': return A.showMenu();
      case 'erstellen': hinweisSetzen('Raum wird gemacht …'); verbinden().senden({ t: 'raumErstellen', spiel: 'schach', name: O.name, farbe: O.seite === 'z' ? undefined : O.seite }); return;
      case 'beitreten': return beitreten(false);
      case 'zuschauen': return beitreten(true);
      case 'kopieren': {
        const t = (document.getElementById('linktext') || {}).textContent || '';
        try { navigator.clipboard.writeText(t).then(() => hinweisSetzen('Link kopiert!'), () => hinweisSetzen('Kopieren geht hier nicht – bitte den Link markieren.')); } catch (x) { hinweisSetzen('Kopieren geht hier nicht – bitte den Link markieren.'); }
        return;
      }
    }
  }
  function beitreten(zuschauer) {
    const code = ((document.getElementById('codefeld') || {}).value || '').trim();
    if (code.length !== G.CODE_LAENGE) return hinweisSetzen('Der Code hat ' + G.CODE_LAENGE + ' Zeichen.', true);
    hinweisSetzen('Suche den Raum …');
    verbinden().senden({ t: 'raumBeitreten', code, spiel: 'schach', name: O.name, zuschauer: !!zuschauer });
  }

  function verbinden() {
    if (O.v) return O.v;
    O.v = new BRETT.Verbindung('schach', {
      status(s) { O.verb = s; infoZeile(); },
      raum(m) { O.code = m.code; },
      stand: standEmpfangen,
      fehler(m) {
        O.wartet = false;
        if (S.ansicht === 'spiel' && S.online) { A.statusSetzen(m.text || 'Das geht nicht.'); partie.selectedPos = null; partie.validMoves = []; partie.updateUI(); setTimeout(() => S.online && S.ansicht === 'spiel' && statusZeile(), 1800); }
        else hinweisSetzen(m.text || 'Fehler', true);
      },
      raumZu() { onlineAus(true); onlineOeffnen('', 'Der Raum wurde geschlossen.'); },
      wiederNein() { onlineAus(true); if (S.ansicht !== 'menue') A.showMenu(); },
    });
    return O.v;
  }
  function onlineAus(vergessen) {
    if (O.v) { if (vergessen) { try { O.v.senden({ t: 'verlassen' }); } catch (e) { /* weg */ } } O.v.schliessen(vergessen); O.v = null; }
    O.stand = null; O.runde = -1; O.ich = 'z'; O.wartet = false; O.endeGezeigt = false; S.online = false;
  }
  A.onlineBeenden = () => onlineAus(true);

  const einladungsLink = (code) => location.origin + location.pathname + '?raum=' + code;
  const spielerHtml = (st) => st.spieler.filter(Boolean).map((s) => `<span class="${s.online ? '' : 'weg'}">${esc(s.name)}</span>`).join('');
  function wartenZeigen(st) {
    if (S.ansicht === 'warten' && O.code === st.code) { const n = document.getElementById('mit'); if (n) n.innerHTML = spielerHtml(st); return; }
    A.spielAbbrechen(); S.els = null; A.ansicht('warten', 'Schach – Online'); O.code = st.code;
    const link = einladungsLink(st.code);
    let qr = '';
    try { qr = window.Rennspiel && window.Rennspiel.QR ? window.Rennspiel.QR.svg(link, { modul: 4, rand: 2 }) : ''; } catch (e) { qr = ''; }
    app.innerHTML =
      `<div class="seite"><div class="spalte">` +
      `<div class="zeile-oben"><button class="ns-knopf" data-a="abbrechen">✖ Abbrechen</button></div>` +
      `<div class="karte-titel" style="font-size:15px">Raumcode</div><div class="codegross" id="codegross">${esc(st.code)}</div>` +
      `<div class="karte-sub">Gib den Code ein – oder scanne den QR-Code:</div>` +
      (qr ? `<div class="qr">${qr}</div>` : '') +
      `<div class="linktext" id="linktext">${esc(link)}</div><button class="ns-knopf" data-a="kopieren">📋 Link kopieren</button>` +
      `<div class="mitspieler" id="mit">${spielerHtml(st)}</div>` +
      `<div class="hinweis" id="hinweis">Warte auf einen Mitspieler<span class="punkte"></span></div></div></div>`;
    app.querySelector('.seite').addEventListener('click', (e) => {
      const a = e.target.closest('[data-a]'); if (!a) return;
      if (a.dataset.a === 'abbrechen') A.showMenu(); else lobbyKlick(e);
    });
  }

  // ---------------------------------------------------------------- Spielfenster
  const farbeIch = () => (O.ich === 'w' ? WHITE : O.ich === 'b' ? BLACK : -1);
  A.onlineTags = () => {
    const s = O.stand, t = {}; if (!s) return t;
    if (s.spieler[0]) t[WHITE] = { type: 6, name: kurz(s.spieler[0].name) };
    if (s.spieler[1]) t[BLACK] = { type: 6, name: kurz(s.spieler[1].name) };
    return t;
  };

  function standEmpfangen(s) {
    O.stand = s;
    if (s.zustand === 'warten') { wartenZeigen(s); return; }
    O.ich = s.du.rolle;
    const neuAufbau = S.ansicht !== 'spiel' || !S.online || O.runde !== s.runde;
    if (neuAufbau) {                                                 // neue Runde (auch Revanche) → frisch aufbauen
      A.spielAbbrechen(); O.runde = s.runde; O.endeGezeigt = false; O.wartet = false;
      partie.gameMode = 'playerVsPlayer'; partie.whiteName = kurz(s.spieler[0] && s.spieler[0].name); partie.blackName = kurz(s.spieler[1] && s.spieler[1].name);
      K.Stil.setzeHunde(S.dogs);
      const els = A.spielAufbauen('online');
      infoZeileBauen(els);
      S.b2d.nameTags = A.onlineTags();
      partie.neuesSpiel({ modus: 'playerVsPlayer', analyse: false });
      els.analyse.classList.add('hidden'); A.funktionen.layout();
      A.setBoardView(O.ich === 'b', false);
    } else { partie.whiteName = kurz(s.spieler[0] && s.spieler[0].name); partie.blackName = kurz(s.spieler[1] && s.spieler[1].name); }
    // neue Züge einspielen (mit Animation); bei Abweichung alles stumm neu einspielen
    const hist = partie.gameMoveHistory, neu = s.zuege;
    const praefix = hist.length <= neu.length && hist.every((x, i) => x === neu[i]);
    if (!praefix) { partie.start(); A.setBoardView(O.ich === 'b', false); }
    const ab = praefix ? hist.length : 0, stumm = neuAufbau || !praefix || neu.length - ab > 1;
    A.stumm = stumm;
    for (const uci of neu.slice(ab)) {
      const mover = partie.currentPlayer, m = partie.board.findMoveByUci(uci, mover);
      if (!m) break;
      partie.doMove(m); partie.currentPlayer = 1 - mover;
    }
    A.stumm = false;
    partie.gameOver = s.zustand === 'ende';
    O.wartet = false;
    partie.selectedPos = null; partie.validMoves = [];
    partie.updateUI();
    infoZeile(); statusZeile(); onlineKnoepfe();
    if (s.zustand === 'ende') {
      if (!O.endeGezeigt) { O.endeGezeigt = true; endeDialogSpaeter(); }
      else if (S.dialog && S.dialog.d.online) endeDialog();
    }
  }

  function infoZeileBauen(els) {
    const z = h('div', 'onlineinfo'); z.id = 'onlineinfo'; els.sp.querySelector('.leiste').after(z);
  }
  function infoZeile() {
    const z = document.getElementById('onlineinfo'), s = O.stand; if (!z || !s) return;
    const sp = s.spieler.map((p, i) => { const f = i === 0 ? '⚪' : '⚫'; if (!p) return `<span>${f} …</span>`; const ich = O.ich === (i === 0 ? 'w' : 'b'); return `<span class="${p.online ? '' : 'weg'}">${f} ${ich ? '<b>' + esc(p.name) + ' (du)</b>' : esc(p.name)}</span>`; });
    const banner = O.verb !== 'verbunden' ? G.TEXTE.getrennt : (s.zustand === 'spiel' && s.spieler.some((p) => p && !p.online) ? G.TEXTE.gegnerWeg : '');
    z.innerHTML = `<span>Online – Raum ${esc(s.code)}</span> &nbsp;·&nbsp; ` + sp.join(' &nbsp;·&nbsp; ') + (s.zuschauer ? ` &nbsp;·&nbsp; 👀 ${s.zuschauer}` : '') + (O.ich === 'z' ? ' &nbsp;·&nbsp; du schaust zu' : '') +
      (banner ? `<span class="banner">${esc(banner)}</span>` : '');
  }
  function nameVon(f) { const s = O.stand; const p = s && s.spieler[f === 'w' ? 0 : 1]; return p ? p.name : (f === 'w' ? 'Weiss' : 'Schwarz'); }
  function statusZeile() {
    const s = O.stand; if (!s || !S.els) return;
    const schach = !!partie.board.isInCheck(partie.currentPlayer) && s.zustand === 'spiel';
    let t;
    if (s.zustand === 'ende') {
      const e = s.ergebnis || {};
      if (e.art === 'aufgegeben') t = (O.ich !== 'z' && e.sieger === O.ich) ? 'Der andere hat aufgegeben. 🎉' : 'Aufgegeben.';
      else if (e.art === 'matt') t = O.ich !== 'z' ? (e.sieger === O.ich ? 'Schachmatt! Du hast gewonnen!' : 'Schachmatt! ' + nameVon(e.sieger) + ' gewinnt!') : 'Schachmatt! ' + nameVon(e.sieger) + ' gewinnt!';
      else if (e.art === 'patt') t = 'Patt - Unentschieden!';
      else t = e.art === 'wiederholung' ? 'Remis (Stellungswiederholung)' : 'Remis!';
    } else if (O.ich === 'z') t = (schach ? 'Schach! ' : '') + nameVon(s.am) + ' ist am Zug';
    else if (s.am === O.ich) t = schach ? 'Schach! Du bist dran' : 'Du bist am Zug';
    else t = (schach ? 'Schach! ' : '') + nameVon(s.am) + ' ist am Zug';
    A.statusSetzen(t);
  }
  function onlineKnoepfe() {
    const box = document.getElementById('on-knoepfe'), s = O.stand; if (!box || !s) return;
    const ende = s.zustand === 'ende', meins = ende && O.ich !== 'z' && s.revanche[O.ich];
    box.innerHTML = O.ich === 'z' ? '' : `<button class="bt b92" id="b-on">${ende ? (meins ? 'Warte …' : '↻ Revanche') : '🏳 Aufgeben'}</button>`;
    const b = document.getElementById('b-on');
    if (b) { b.disabled = !!meins; b.onclick = () => (ende ? senden({ t: 'revanche' }) : A.dialog({ titel: 'Wirklich aufgeben?', text: 'Dann gewinnt der andere.', tasten: [{ text: 'Abbrechen', std: true }, { text: 'Aufgeben', aktion: () => senden({ t: 'aufgeben' }) }] })); }
  }

  // ---------------------------------------------------------------- Zug senden
  A.onlineKlick = function (row, col) {
    const s = O.stand;
    if (!s || s.zustand !== 'spiel' || O.ich === 'z' || O.wartet) return;
    if (A.brettBeschaeftigt()) return;
    const mein = farbeIch(); if (partie.currentPlayer !== mein) return;
    const pos = { row, col }, b = partie.board;
    if (partie.selectedPos) {
      const ziel = partie.validMoves.filter((m) => m.to.row === row && m.to.col === col);
      if (ziel.length) { if (ziel[0].promotion) A.umwandlungFragen(ziel, (m) => zugSenden(m)); else zugSenden(ziel[0]); return; }
    }
    const p = b.piece(pos);
    if (p && p.color === mein) {
      const zuege = b.allLegalMoves(mein).filter((m) => m.from.row === row && m.from.col === col);
      if (zuege.length) { partie.selectedPos = pos; partie.validMoves = zuege; } else { partie.selectedPos = null; partie.validMoves = []; }
    } else { partie.selectedPos = null; partie.validMoves = []; }
    partie.updateUI();
  };
  function zugSenden(m) {
    O.wartet = true; partie.selectedPos = null; partie.validMoves = [];
    senden({ t: 'zug', z: K.moveToUci(m) }); partie.updateUI();
  }

  // ---------------------------------------------------------------- Ende / Verlassen
  function endeDialogSpaeter() { const r = O.runde; setTimeout(() => { if (S.online && O.runde === r && O.stand && O.stand.zustand === 'ende') endeDialog(); }, 900); }
  function endeDialog() {
    const s = O.stand; if (!s || s.zustand !== 'ende') return;
    const e = s.ergebnis || {};
    let text;
    if (e.art === 'matt') text = 'Schachmatt! ' + nameVon(e.sieger) + ' gewinnt!';
    else if (e.art === 'aufgegeben') text = nameVon(e.sieger) + ' gewinnt!\n(Aufgegeben)';
    else if (e.art === 'patt') text = 'Patt - Unentschieden!';
    else text = e.art === 'wiederholung' ? 'Remis durch Stellungswiederholung!' : 'Remis - Unentschieden!';
    if (O.ich !== 'z' && e.sieger) text += '\n' + (e.sieger === O.ich ? 'Du hast gewonnen! 🎉' : 'Leider verloren.');
    const tasten = [];
    if (O.ich !== 'z') {
      const ich = O.ich, ander = ich === 'w' ? 'b' : 'w', meins = s.revanche[ich];
      if (s.revanche[ander] && !meins) text += '\nDer andere möchte eine Revanche!';
      tasten.push({ text: meins ? G.TEXTE.revancheWarte : 'Revanche', std: true, aus: meins, bleibt: true, aktion: () => senden({ t: 'revanche' }) });
    }
    tasten.push({ text: 'Hauptmenu', aktion: A.showMenu });
    A.dialog({ titel: 'Spiel beendet', text, tasten, online: true });
    if (S.dialog) S.dialog.d.online = true;
  }
  A.onlineVerlassen = function () {
    const s = O.stand;
    if (s && O.ich !== 'z' && s.zustand === 'spiel') return A.dialog({ titel: 'Spiel verlassen?', text: 'Dann ist die Partie für beide vorbei.', tasten: [{ text: 'Weiterspielen', std: true }, { text: 'Verlassen', aktion: A.showMenu }] });
    A.showMenu();
  };

  // ---------------------------------------------------------------- Einstieg (Link ?raum=ABCD, Wiederverbinden nach Reload)
  A.onlineStart = function (param) {
    if (BRETT.sitzLesen && BRETT.sitzLesen('schach')) {
      A.ansicht('menue', 'Schach');
      app.innerHTML = `<div class="seite"><div class="spalte"><div class="titel">Schach</div><div class="hinweis" id="hinweis">Verbinde wieder<span class="punkte"></span></div><button class="ns-knopf" id="x-abbruch">✖ Abbrechen</button></div></div>`;
      document.getElementById('x-abbruch').onclick = () => A.showMenu();
      verbinden();
      setTimeout(() => { if (S.ansicht === 'menue' && !O.stand && O.v) A.showMenu(); }, 8000);
      return true;
    }
    if (param) { onlineOeffnen(param); return true; }
    return false;
  };
  A.onlineOeffnen = onlineOeffnen;
  A.online = O;
})();
