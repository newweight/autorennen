// ============================================================
// Schach – Oberfläche (Adapter für gemeinsam/rahmen.js). Regeln: gemeinsam/schach-regeln.js · Computer: ki-worker.js (Web Worker)
// Bedienung: Figur antippen → grüne Punkte zeigen die erlaubten Felder → Zielfeld antippen. Tastatur: Pfeile bewegen den Rahmen,
// Enter/Leertaste wählt, Esc zurück, Z = Rückgängig (offline). Figuren: Unicode-Zeichen (gefüllte Formen, Farbe per CSS).
// ============================================================
(function () {
  const BRETT = window.BRETT, K = BRETT.K, T = K.TEXTE, TS = T.schach, S = BRETT.Schach;
  const adapter = { seiten: [{ id: 'w', text: '⚪ Weiß (fängt an)' }, { id: 'b', text: '⚫ Schwarz' }, { id: 'z', text: '🎲 Zufall' }] };
  // gefüllte Zeichen für beide Farben; ︎ erzwingt Text- statt Emoji-Darstellung (Safari/iOS)
  const GLYPH = { 1: '♟︎', 2: '♞︎', 3: '♝︎', 4: '♜︎', 5: '♛︎', 6: '♚︎' };
  const FIG_NAME = { 1: 'Bauer', 2: 'Springer', 3: 'Läufer', 4: 'Turm', 5: 'Dame', 6: 'König' };

  let ctx, host, elBrett, elWrap, felder = [], p, cfg, flip = false, gewaehlt = -1, ziele = [], cursor = 12, ich = 'w';
  let worker = null, workerGeht = true, kiId = 0, denkt = false, wartetServer = false, stand = null, endeTimer = null, endeGemeldet = false, letzterZug = null, namen = { w: TS.weiss, b: TS.schwarz };

  adapter.bauen = function (h, c) {
    ctx = c; host = h;
    host.innerHTML = '<div class="s-wrap"><div class="s-brett"></div></div>';
    elWrap = host.querySelector('.s-wrap'); elBrett = host.querySelector('.s-brett');
    elBrett.addEventListener('click', (e) => { const f = e.target.closest('.s-feld'); if (f) { cursor = +f.dataset.sq; feldKlick(+f.dataset.sq); } });
    gitterBauen();
  };
  function gitterBauen() {
    elBrett.innerHTML = ''; felder = [];
    for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) {
      const sq = flip ? i * 8 + (7 - j) : (7 - i) * 8 + j;
      const d = document.createElement('div');
      d.className = 's-feld ' + ((((sq >> 3) + (sq & 7)) & 1) ? 'hell' : 'dunkel');
      d.dataset.sq = sq; d.setAttribute('role', 'button');
      if (j === 0) d.insertAdjacentHTML('beforeend', `<span class="koord r">${(sq >> 3) + 1}</span>`);
      if (i === 7) d.insertAdjacentHTML('beforeend', `<span class="koord l">${'abcdefgh'[sq & 7]}</span>`);
      elBrett.append(d); felder[sq] = d;
    }
  }

  const meineFarbe = () => cfg.modus === 'lokal' ? p.am : (ich === 'w' ? 1 : ich === 'b' ? -1 : 0);
  function darfZiehen() {
    if (!p || p.status().ende || denkt || wartetServer) return false;
    if (cfg.modus === 'lokal') return true;
    return meineFarbe() === p.am;
  }

  function zeichnen(anim) {
    const b = p.s.b, st = p.status();
    const alt = anim ? felder.map(f => { const e = f.querySelector('.s-fig'); return e ? e.getBoundingClientRect() : null; }) : null;
    for (let sq = 0; sq < 64; sq++) {
      const f = felder[sq];
      f.querySelectorAll('.s-fig').forEach(n => n.remove());
      const v = b[sq];
      if (v) { const e = document.createElement('span'); e.className = 's-fig ' + (v > 0 ? 'w' : 'b'); e.textContent = GLYPH[Math.abs(v)]; e.title = FIG_NAME[Math.abs(v)]; f.append(e); }
      f.classList.toggle('gewaehlt', sq === gewaehlt);
      f.classList.toggle('letzter', !!letzterZug && (sq === S.von(letzterZug) || sq === S.nach(letzterZug)));
      const z = ziele.find(x => x.nach === sq);
      f.classList.toggle('ziel', !!z); f.classList.toggle('schlag', !!z && z.schlag);
      f.classList.toggle('schach', st.schach && b[sq] === p.am * S.K);
      f.classList.toggle('cursor', sq === cursor && cursorSichtbar);
    }
    if (anim && letzterZug) {
      const paare = [[S.von(letzterZug), S.nach(letzterZug)]];
      if (S.flag(letzterZug) === 2) { const v = S.von(letzterZug), n = S.nach(letzterZug); paare.push(n > v ? [v + 3, v + 1] : [v - 4, v - 1]); }
      for (const [v, n] of paare) {
        const neu = felder[n].querySelector('.s-fig'); if (!neu) continue;
        const a = felder[v].getBoundingClientRect(), z = felder[n].getBoundingClientRect();
        neu.style.transition = 'none'; neu.style.transform = `translate(${a.left - z.left}px, ${a.top - z.top}px)`; neu.style.zIndex = 3;
        requestAnimationFrame(() => requestAnimationFrame(() => { neu.style.transition = ''; neu.style.transform = ''; setTimeout(() => { neu.style.zIndex = ''; }, 260); }));
      }
    }
  }
  let cursorSichtbar = false;

  function feldKlick(sq) {
    if (!darfZiehen()) { return; }
    const v = p.s.b[sq];
    const z = ziele.find(x => x.nach === sq);
    if (gewaehlt >= 0 && z) { return ziehenVersuch(gewaehlt, z); }
    if (v && v * p.am > 0 && (cfg.modus === 'lokal' || meineFarbe() === p.am)) {
      gewaehlt = sq; ziele = p.ziele(sq); zeichnen();
      if (!ziele.length) ctx.status('Diese Figur kann gerade nicht ziehen.', 'warn');
      else statusZeigen();
    } else { gewaehlt = -1; ziele = []; zeichnen(); statusZeigen(); }
  }

  function ziehenVersuch(von, z) {
    if (z.umw.length) { umwandlungFragen(von, z); return; }
    ausfuehren(von, z.nach, 0);
  }
  function umwandlungFragen(von, z) {
    const farbe = p.am === 1 ? 'w' : 'b';
    const d = document.createElement('div');
    d.className = 's-umw';
    d.innerHTML = `<div class="t">${T.umwandeln}</div><div class="reihe">` +
      [5, 4, 3, 2].map(u => `<button data-u="${u}" title="${FIG_NAME[u]}"><span class="s-fig ${farbe}">${GLYPH[u]}</span></button>`).join('') + '</div>';
    d.addEventListener('click', (e) => { e.stopPropagation(); const b = e.target.closest('[data-u]'); if (b) { d.remove(); ausfuehren(von, z.nach, +b.dataset.u); } });
    elWrap.style.position = 'relative'; elBrett.append(d);
    d.__tasten = true;
  }
  function umwandlungOffen() { return !!elBrett.querySelector('.s-umw'); }

  function ausfuehren(von, nach, umw) {
    gewaehlt = -1; ziele = [];
    const m = p.finden(von, nach, umw);
    if (m === null) { zeichnen(); return; }
    if (cfg.modus === 'online') { wartetServer = true; ctx.senden({ t: 'zug', z: S.zuText(m) }); zeichnen(); statusZeigen(); return; }
    p.ziehen(m); letzterZug = m;
    zeichnen(true); nachZug();
  }

  function nachZug() {
    ctx.aktionen();
    const st = p.status();
    statusZeigen();
    if (st.ende) { enden(); return; }
    if (cfg.modus === 'computer' && meineFarbe() !== p.am) kiDran();
  }

  // ---------- Computer
  function workerHolen() {
    if (worker || !workerGeht) return worker;
    try {
      worker = new Worker('ki-worker.js');
      worker.onerror = () => { workerGeht = false; try { worker.terminate(); } catch (e) { /* */ } worker = null; if (denkt) { denkt = false; kiDran(); } };
      worker.onmessage = (e) => { if (e.data.id === kiId) kiFertig(e.data.zug); };
    } catch (e) { workerGeht = false; worker = null; }
    return worker;
  }
  function kiDran() {
    denkt = true; const mein = ++kiId; statusZeigen();
    const t0 = Date.now(), liste = p.textListe();
    const w = workerHolen();
    if (w) w.postMessage({ id: mein, zuege: liste, stufe: cfg.stufe });
    else setTimeout(() => {                                    // Rückfall ohne Worker (z. B. file://): im Hauptthread rechnen
      const r = BRETT.SchachKI && BRETT.SchachKI.waehle(p, cfg.stufe); if (mein === kiId) kiFertig(r ? r.text : null);
    }, 50);
    kiDran.start = t0;
  }
  function kiFertig(text) {
    // kurze Mindestdenkzeit, damit Züge nicht „aus dem Nichts“ springen
    const rest = Math.max(0, 500 - (Date.now() - (kiDran.start || 0))); const mein = kiId;
    setTimeout(() => {
      if (mein !== kiId || !denkt) return;
      denkt = false;
      const m = text ? p.ausText(text) : null;
      if (m === null || !p.ziehen(m)) { statusZeigen(); return; }
      letzterZug = m; zeichnen(true); nachZug();
    }, rest);
  }

  // ---------- Ende / Status
  function enden() {
    const st = p.status();
    let emoji = '🤝', text = '';
    const sw = st.sieger === 1 ? 'w' : st.sieger === -1 ? 'b' : null;
    const ichGewinnt = cfg.modus !== 'lokal' && sw && meineFarbe() === st.sieger;
    if (st.ende === 'matt') {
      if (cfg.modus === 'lokal') { emoji = '🎉'; text = T.matt + ' ' + (sw === 'w' ? TS.weiss : TS.schwarz) + ' hat gewonnen!'; }
      else if (cfg.modus === 'computer') { emoji = ichGewinnt ? '🎉' : '🤖'; text = T.matt + (ichGewinnt ? ' Du hast gewonnen!' : ' Der Computer hat gewonnen.'); }
      else if (ich === 'z') { emoji = '🏁'; text = T.matt + ' ' + namen[sw] + ' hat gewonnen.'; }
      else { emoji = ichGewinnt ? '🎉' : '😅'; text = T.matt + (ichGewinnt ? ' Du hast gewonnen!' : ' ' + namen[sw] + ' hat gewonnen.'); }
    } else text = { patt: T.patt, fuenfzig: T.fuenfzig, wiederholung: T.wiederholung, material: T.material }[st.ende] || T.unentschieden;
    clearTimeout(endeTimer);
    endeTimer = setTimeout(() => ctx.ende({ emoji, text }), 900);
  }
  function statusZeigen() {
    if (!p) return;
    const st = p.status(), am = p.am === 1 ? 'w' : 'b';
    let text, art = '';
    if (st.ende) { text = st.ende === 'matt' ? T.matt : { patt: 'Patt!', fuenfzig: 'Unentschieden', wiederholung: 'Unentschieden', material: 'Unentschieden' }[st.ende]; art = 'warn'; }
    else if (cfg.modus === 'computer') { text = denkt ? T.computerDenkt : (st.schach ? T.istSchach + ' ' : '') + T.du; art = denkt ? '' : 'gut'; if (st.schach && !denkt) art = 'warn'; }
    else if (cfg.modus === 'online') {
      if (ich === 'z') text = (st.schach ? T.istSchach + ' ' : '') + namen[am] + ' ' + T.amZug;
      else if (meineFarbe() === p.am) { text = (st.schach ? T.istSchach + ' ' : '') + T.du; art = st.schach ? 'warn' : 'gut'; }
      else text = namen[am] + ' ' + T.amZug;
    } else { text = (st.schach ? T.istSchach + ' ' : '') + (am === 'w' ? '⚪ ' + TS.weiss : '⚫ ' + TS.schwarz) + ' ' + T.amZug; art = st.schach ? 'warn' : ''; }
    ctx.status(text, art);
    if (cfg.modus !== 'online') {
      const wer = (f) => cfg.modus === 'computer' ? (meineFarbe() === (f === 'w' ? 1 : -1) ? 'Du' : 'Computer') : (f === 'w' ? TS.weiss : TS.schwarz);
      ctx.spieler([{ text: '⚪ ' + wer('w'), aktiv: !st.ende && am === 'w' }, { text: '⚫ ' + wer('b'), aktiv: !st.ende && am === 'b' }]);
    }
  }

  // ---------- Schnittstelle
  adapter.neu = function (c) {
    adapter.stop();
    cfg = c; p = new S.Partie(); gewaehlt = -1; ziele = []; letzterZug = null; wartetServer = false; stand = null; endeGemeldet = false; cursor = 12; cursorSichtbar = false;
    ich = c.modus === 'online' ? (c.ich || 'z') : (c.modus === 'computer' ? c.ich : 'w');
    namen = { w: TS.weiss, b: TS.schwarz };
    flip = (c.modus === 'online' || c.modus === 'computer') && ich === 'b';
    gitterBauen(); zeichnen(); statusZeigen(); ctx.aktionen();
    if (c.modus === 'computer' && meineFarbe() !== p.am) kiDran();
  };
  adapter.stop = function () { kiId++; denkt = false; clearTimeout(endeTimer); if (elBrett) { const u = elBrett.querySelector('.s-umw'); if (u) u.remove(); } };
  adapter.drehen = function () { flip = !flip; gitterBauen(); zeichnen(); };
  adapter.kannRueck = function () {
    if (!p || cfg.modus === 'online' || !p.zuege.length) return false;
    if (cfg.modus === 'computer') return p.zuege.length >= (meineFarbe() === 1 ? 1 : 2) && !denkt;
    return true;
  };
  adapter.rueckgaengig = function () {
    if (!adapter.kannRueck()) return false;
    kiId++; denkt = false; clearTimeout(endeTimer);
    if (cfg.modus === 'computer') { do { p.rueckgaengig(); } while (p.zuege.length && meineFarbe() !== p.am); }
    else p.rueckgaengig();
    letzterZug = p.zuege.length ? p.zuege[p.zuege.length - 1] : null; gewaehlt = -1; ziele = [];
    zeichnen(); statusZeigen(); ctx.aktionen();
    if (cfg.modus === 'computer' && meineFarbe() !== p.am) kiDran();
    return true;
  };

  adapter.stand = function (s) {
    stand = s; ich = s.du.rolle;
    namen = { w: s.spieler[0] ? s.spieler[0].name : TS.weiss, b: s.spieler[1] ? s.spieler[1].name : TS.schwarz };
    const neuFlip = ich === 'b';
    if (neuFlip !== flip) { flip = neuFlip; gitterBauen(); }
    wartetServer = false;
    const alt = p.textListe(), neu = s.zuege;
    const gleich = alt.length <= neu.length && alt.every((x, i) => x === neu[i]);
    let animieren = false;
    if (!gleich) { p = new S.Partie(); for (const t of neu) { const m = p.ausText(t); if (!m || !p.ziehen(m)) break; } letzterZug = p.zuege.length ? p.zuege[p.zuege.length - 1] : null; endeGemeldet = false; }
    else if (neu.length > alt.length) { for (const t of neu.slice(alt.length)) { const m = p.ausText(t); if (m && p.ziehen(m)) letzterZug = m; } animieren = true; }
    gewaehlt = -1; ziele = [];
    zeichnen(animieren);
    ctx.spieler([{ text: '⚪ ' + namen.w, aktiv: s.zustand === 'spiel' && s.am === 'w', weg: s.spieler[0] && !s.spieler[0].online },
      { text: '⚫ ' + namen.b, aktiv: s.zustand === 'spiel' && s.am === 'b', weg: s.spieler[1] && !s.spieler[1].online }]);
    ctx.aktionen();
    if (s.ergebnis && s.ergebnis.art === 'aufgegeben') {
      ctx.status(ich !== 'z' && s.ergebnis.sieger === ich ? 'Der andere hat aufgegeben. 🎉' : 'Aufgegeben.', 'warn');
      if (!endeGemeldet) {
        endeGemeldet = true; clearTimeout(endeTimer);
        const gewonnen = ich !== 'z' && s.ergebnis.sieger === ich;
        endeTimer = setTimeout(() => ctx.ende({ emoji: gewonnen ? '🎉' : '🏳️', text: ich === 'z' ? namen[s.ergebnis.sieger] + ' gewinnt (Aufgabe).' : gewonnen ? 'Du hast gewonnen – der andere hat aufgegeben!' : 'Du hast aufgegeben.' }), 500);
      }
      return;
    }
    statusZeigen();
    if (p.status().ende && !endeGemeldet) { endeGemeldet = true; enden(); }
    if (!p.status().ende) endeGemeldet = false;
  };
  adapter.serverFehler = function (m) { wartetServer = false; gewaehlt = -1; ziele = []; zeichnen(); ctx.status(m.text || 'Das geht nicht.', 'schlecht'); };

  adapter.taste = function (e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (umwandlungOffen()) { const u = { q: 5, d: 5, r: 4, t: 4, b: 3, l: 3, n: 2, s: 2 }[e.key.toLowerCase()]; if (u) { const b = elBrett.querySelector(`[data-u="${u}"]`); if (b) b.click(); e.preventDefault(); } return; }
    const dr = { ArrowUp: [1, 0], ArrowDown: [-1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] }[e.key];
    if (dr) {
      const f = flip ? -1 : 1; let r = (cursor >> 3) + dr[0] * f, l = (cursor & 7) + dr[1] * f;
      r = Math.max(0, Math.min(7, r)); l = Math.max(0, Math.min(7, l)); cursor = r * 8 + l; cursorSichtbar = true; zeichnen(); e.preventDefault();
    } else if (e.key === 'Enter' || e.key === ' ') { cursorSichtbar = true; feldKlick(cursor); zeichnen(); e.preventDefault(); }
    else if ((e.key === 'z' || e.key === 'Z' || e.key === 'Backspace') && cfg.modus !== 'online') adapter.rueckgaengig();
  };

  /** Nur für Tests (tests/brett_ui_test.py): Stellung aus FEN setzen (lokal, ohne Computer). */
  adapter.testFen = function (fen) { adapter.stop(); p = new S.Partie(fen); gewaehlt = -1; ziele = []; letzterZug = null; zeichnen(); statusZeigen(); ctx.aktionen(); };
  adapter.testInfo = function () { return { worker: !!worker, workerGeht, denkt, fen: S.zuFen(p.s), zuege: p.textListe(), flip }; };

  BRETT.__schach = adapter;
  window.addEventListener('DOMContentLoaded', () => BRETT.Rahmen.start({ id: 'schach', adapter }));
})();
