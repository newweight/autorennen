// ============================================================
// 4 gewinnt – Oberfläche (Adapter für gemeinsam/rahmen.js). Regeln: gemeinsam/vier-regeln.js, Computer: gemeinsam/vier-ki.js.
// Bedienung: Tippen/Klicken auf eine Spalte · Tasten 1–7 · ←/→ + Enter/Leertaste/↓ · Z = Rückgängig (offline)
// Spieler 1 = Rot ('w', beginnt), Spieler 2 = Gelb ('b').
// ============================================================
(function () {
  const BRETT = window.BRETT, K = BRETT.K, T = K.TEXTE, TV = T.vier, V = BRETT.Vier;
  const SP = V.SP, ZE = V.ZE;
  const spieler = (n) => n === 1 ? 'rot' : 'gelb';

  const adapter = {
    seiten: [{ id: 'w', text: '🔴 Rot (fängt an)' }, { id: 'b', text: '🟡 Gelb' }, { id: 'z', text: '🎲 Zufall' }],
  };
  let ctx, host, elSteine, elGeist, elSpalten, st, cfg, namen = { w: 'Rot', b: 'Gelb' };
  let cursor = 3, animiert = 0, ki = null, laufId = 0, endeTimer = null, wartetServer = false, stand = null, ich = 0;

  adapter.bauen = function (h, c) {
    ctx = c; host = h;
    host.innerHTML = `<div class="v-wrap"><div class="v-brett">` +
      `<div class="v-geist"></div><div class="v-feld"><div class="v-steine"></div><div class="v-gitter">${'<i></i>'.repeat(SP * ZE)}</div></div>` +
      `<div class="v-spalten">${'<div></div>'.repeat(SP)}</div></div><div class="v-fuss"></div></div>`;
    elSteine = host.querySelector('.v-steine'); elGeist = host.querySelector('.v-geist'); elSpalten = host.querySelector('.v-spalten');
    elSpalten.querySelectorAll('div').forEach((d, i) => {
      d.addEventListener('click', () => { cursor = i; waehlen(i); });
      d.addEventListener('mouseenter', () => { cursor = i; geistZeigen(); });
      d.addEventListener('touchstart', () => { cursor = i; geistZeigen(); }, { passive: true });
    });
  };

  function steinEl(s, z, spielerNr, fall) {
    const d = document.createElement('div');
    d.className = 'v-stein ' + spieler(spielerNr) + (fall ? '' : ' still');
    d.style.left = (s * 100 / SP) + '%'; d.style.top = ((ZE - 1 - z) * 100 / ZE) + '%'; d.style.width = (100 / SP) + '%'; d.style.height = (100 / ZE) + '%';
    if (fall) d.style.setProperty('--fall', String(ZE - z + 0.3));
    d.dataset.i = z * SP + s;
    return d;
  }
  function komplettZeichnen() {
    elSteine.innerHTML = ''; elSteine.classList.remove('gewonnen');
    for (let z = 0; z < ZE; z++) for (let s = 0; s < SP; s++) { const v = st.b[z * SP + s]; if (v) elSteine.append(steinEl(s, z, v, false)); }
    gewinnMarkieren();
  }
  function gewinnMarkieren() {
    if (st.ende && st.ende.reihe) elSteine.classList.add('gewonnen');
    if (st.ende && st.ende.reihe) st.ende.reihe.forEach(i => { const e = elSteine.querySelector(`[data-i="${i}"]`); if (e) e.classList.add('gewinn'); });
  }
  function geistZeigen() {
    elGeist.innerHTML = '';
    const darf = mensch();
    elSpalten.classList.toggle('aus', !darf);
    elSpalten.querySelectorAll('div').forEach((d, i) => d.classList.toggle('cursor', darf && i === cursor));
    if (!darf || st.ende) return;
    const g = steinEl(cursor, ZE - 1, st.am, false);
    g.style.top = '0'; g.style.height = '100%'; elGeist.append(g);
  }

  /** Darf der Mensch an diesem Gerät gerade einen Stein werfen? */
  function mensch() {
    if (!st || st.ende || animiert > 0 || wartetServer) return false;
    if (cfg.modus === 'lokal') return true;
    return st.am === ich;                       // computer + online (ich = 0 bei Zuschauern → nie)
  }

  adapter.neu = function (c) {
    adapter.stop();
    cfg = c; st = V.neu(); cursor = 3; wartetServer = false; stand = null; animiert = 0;
    ich = c.modus === 'online' ? (c.ich === 'w' ? 1 : c.ich === 'b' ? 2 : 0) : c.modus === 'computer' ? (c.ich === 'w' ? 1 : 2) : 0;
    namen = { w: TV.rot, b: TV.gelb };
    komplettZeichnen(); statusZeigen(); geistZeigen(); ctx.aktionen();
    if (c.modus === 'computer' && st.am !== ich) kiDran();
  };

  adapter.stop = function () { laufId++; clearTimeout(endeTimer); animiert = 0; };

  function werfen(s, nachAnim) {
    const r = V.ziehen(st, s);
    if (!r) return false;
    const e = steinEl(s, r.zeile, 3 - st.am, true);          // st.am ist schon gewechselt
    elSteine.append(e);
    animiert++;
    const fertig = () => { if (e.__f) return; e.__f = 1; e.classList.add('still'); animiert = Math.max(0, animiert - 1); nachAnim && nachAnim(); };
    e.addEventListener('animationend', fertig);
    setTimeout(fertig, 160 + 80 * (ZE - r.zeile) + 450);       // Sicherheitsnetz (z. B. Tab im Hintergrund)
    return true;
  }

  function waehlen(s) {
    if (!mensch() || !V.erlaubt(st, s)) { if (st && !st.ende && V && !V.erlaubt(st, s) && mensch()) ctx.status('Diese Spalte ist voll!', 'warn'); return; }
    if (cfg.modus === 'online') { wartetServer = true; ctx.senden({ t: 'zug', z: s }); geistZeigen(); return; }
    werfen(s, nachZug);
    statusZeigen(); geistZeigen(); ctx.aktionen();
  }

  function nachZug() {
    if (st.ende) { enden(); return; }
    statusZeigen(); geistZeigen(); ctx.aktionen();
    if (cfg.modus === 'computer' && st.am !== ich) kiDran();
  }

  function kiDran() {
    const mein = ++laufId;
    statusZeigen();
    setTimeout(() => {
      if (mein !== laufId || !st || st.ende) return;
      const s = BRETT.VierKI.waehle(st, cfg.stufe);
      if (s < 0) return;
      werfen(s, () => { if (mein === laufId) nachZug(); });
      geistZeigen(); ctx.aktionen();
    }, 450);
  }

  function enden() {
    gewinnMarkieren();
    statusZeigen(); geistZeigen(); ctx.aktionen();
    const e = st.ende;
    let emoji, text;
    if (!e.sieger) { emoji = '🤝'; text = T.voll; }
    else if (cfg.modus === 'lokal') { emoji = '🎉'; text = (e.sieger === 1 ? TV.rot : TV.gelb) + ' hat gewonnen!'; }
    else if (cfg.modus === 'computer') { emoji = e.sieger === ich ? '🎉' : '🤖'; text = e.sieger === ich ? 'Du hast gewonnen!' : 'Der Computer hat gewonnen.'; }
    else if (ich) { emoji = e.sieger === ich ? '🎉' : '😅'; text = e.sieger === ich ? 'Du hast gewonnen!' : (namen[e.sieger === 1 ? 'w' : 'b']) + ' hat gewonnen.'; }
    else { emoji = '🏁'; text = namen[e.sieger === 1 ? 'w' : 'b'] + ' hat gewonnen.'; }
    clearTimeout(endeTimer);
    endeTimer = setTimeout(() => ctx.ende({ emoji, text }), 1100);
  }

  function statusZeigen() {
    const am = st.am;
    if (st.ende) {
      const s = st.ende.sieger;
      ctx.status(s ? (cfg.modus === 'lokal' || !ich ? (s === 1 ? TV.rot : TV.gelb) + ' gewinnt!' : s === ich ? 'Du hast gewonnen! 🎉' : 'Leider verloren.') : T.voll, s && s === ich ? 'gut' : '');
    } else if (cfg.modus === 'computer') ctx.status(am === ich ? T.du : T.computerDenkt, am === ich ? 'gut' : '');
    else if (cfg.modus === 'online') {
      if (!ich) ctx.status((am === 1 ? namen.w : namen.b) + ' ' + T.amZug);
      else ctx.status(am === ich ? T.du : (am === 1 ? namen.w : namen.b) + ' ' + T.amZug, am === ich ? 'gut' : '');
    } else ctx.status((am === 1 ? '🔴 ' + TV.rot : '🟡 ' + TV.gelb) + ' ' + T.amZug, '');
    if (cfg.modus === 'computer') ctx.spieler([{ klasse: 'rot', text: '🔴 ' + (ich === 1 ? 'Du' : 'Computer'), aktiv: !st.ende && am === 1 }, { klasse: 'gelb', text: '🟡 ' + (ich === 2 ? 'Du' : 'Computer'), aktiv: !st.ende && am === 2 }]);
    else if (cfg.modus === 'lokal') ctx.spieler([{ text: '🔴 ' + TV.rot, aktiv: !st.ende && am === 1 }, { text: '🟡 ' + TV.gelb, aktiv: !st.ende && am === 2 }]);
  }

  // ---------- online
  adapter.stand = function (s) {
    stand = s; ich = s.du.rolle === 'w' ? 1 : s.du.rolle === 'b' ? 2 : 0;
    namen = { w: s.spieler[0] ? s.spieler[0].name : TV.rot, b: s.spieler[1] ? s.spieler[1].name : TV.gelb };
    wartetServer = false;
    const neu = s.zuege;
    const gleichAlt = st.zug.length <= neu.length && st.zug.every((x, i) => x === neu[i]);
    if (!gleichAlt) { clearTimeout(endeTimer); st = V.neu(); animiert = 0; for (const c of neu) V.ziehen(st, c); komplettZeichnen(); }
    else {
      const offen = neu.slice(st.zug.length);
      let i = 0;
      const weiter = () => { if (i >= offen.length) { nachOnline(); return; } const c = offen[i++]; werfen(c, weiter); };
      if (offen.length) weiter(); else nachOnline();
    }
    ctx.spieler([{ klasse: 'rot', text: '🔴 ' + namen.w, aktiv: s.zustand === 'spiel' && s.am === 'w', weg: s.spieler[0] && !s.spieler[0].online },
      { klasse: 'gelb', text: '🟡 ' + namen.b, aktiv: s.zustand === 'spiel' && s.am === 'b', weg: s.spieler[1] && !s.spieler[1].online }]);
  };
  function nachOnline() {
    if (st.ende && !adapter._endeGemeldet) { adapter._endeGemeldet = true; enden(); }
    if (!st.ende) adapter._endeGemeldet = false;
    if (stand && stand.ergebnis && stand.ergebnis.art === 'aufgegeben' && !st.ende) {
      adapter._endeGemeldet = true;
      const sieger = stand.ergebnis.sieger === 'w' ? 1 : 2;
      ctx.status(ich ? (sieger === ich ? 'Der andere hat aufgegeben. 🎉' : 'Du hast aufgegeben.') : 'Aufgegeben.');
      clearTimeout(endeTimer);
      endeTimer = setTimeout(() => ctx.ende({ emoji: sieger === ich ? '🎉' : '🏳️', text: ich ? (sieger === ich ? 'Du hast gewonnen – der andere hat aufgegeben!' : 'Du hast aufgegeben.') : namen[stand.ergebnis.sieger] + ' gewinnt (Aufgabe).' }), 600);      geistZeigen(); ctx.aktionen();
      return;
    }
    statusZeigen(); geistZeigen(); ctx.aktionen();
  }
  adapter.serverFehler = function (m) { wartetServer = false; ctx.status(m.text || 'Das geht nicht.', 'schlecht'); geistZeigen(); };
  const alteNeu = adapter.neu;
  adapter.neu = function (c) { adapter._endeGemeldet = false; return alteNeu(c); };

  // ---------- offline
  adapter.kannRueck = function () {
    if (!st || cfg.modus === 'online' || !st.zug.length || animiert > 0) return false;
    if (cfg.modus === 'computer') return st.zug.some((_, i) => (i % 2 === 0) === (ich === 1)) && (st.am === ich || !!st.ende);
    return true;
  };
  adapter.rueckgaengig = function () {
    if (!adapter.kannRueck()) return false;
    laufId++; clearTimeout(endeTimer);
    if (cfg.modus === 'computer') { do { V.zurueck(st); } while (st.zug.length && st.am !== ich); }
    else V.zurueck(st);
    komplettZeichnen(); statusZeigen(); geistZeigen(); ctx.aktionen();
    if (cfg.modus === 'computer' && st.am !== ich) kiDran();
    return true;
  };

  adapter.taste = function (e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (/^[1-7]$/.test(e.key)) { cursor = +e.key - 1; geistZeigen(); waehlen(cursor); e.preventDefault(); }
    else if (e.key === 'ArrowLeft') { cursor = (cursor + SP - 1) % SP; geistZeigen(); e.preventDefault(); }
    else if (e.key === 'ArrowRight') { cursor = (cursor + 1) % SP; geistZeigen(); e.preventDefault(); }
    else if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') { waehlen(cursor); e.preventDefault(); }
    else if (e.key === 'z' || e.key === 'Z' || e.key === 'Backspace') { if (cfg.modus !== 'online') { adapter.rueckgaengig(); } }
  };

  BRETT.__vier = adapter;
  window.addEventListener('DOMContentLoaded', () => BRETT.Rahmen.start({ id: 'vier', adapter }));
})();
