// ============================================================
// Spaß-Paket S4 – „📸 Fotomodus“ (Autorennen UND Motorrad): Taste P (oder der Knopf 📸 oben rechts) pausiert das Spiel (offline) und gibt eine freie Kamera frei:
//   Maus ziehen / ein Finger = um das Fahrzeug drehen · Mausrad / Zwei-Finger-Zoom (oder ↑ ↓) = näher/weiter · ← → = drehen.
//   Dazu Rahmen (Polaroid, Sterne, Rennflagge), Sticker (Emoji, verschiebbar; auch die gesammelten Album-Sticker) und ein Text unten. „📷 Foto speichern“ legt ein PNG
//   in die Downloads (auf dem Handy: Teilen-Fenster, wenn der Browser es kann). P oder Esc beenden den Modus, das Spiel geht genau dort weiter.
//   Online: dieselbe freie Kamera, aber OHNE Pause (das Rennen läuft weiter). Zwei Spieler am selben Bildschirm: nur allein.
// Rechenteil (Node-testbar): kameraPose(ziel, a, p, d) → Position; begrenzen(); rahmenTeile(art, w, h) → Rechtecke; dateiName(spiel, datum).
// Das PNG entsteht direkt nach dem Zeichnen (drawImage vom WebGL-Canvas im selben Bild) – die HTML-Anzeige (Tacho, Karte) ist nie im Foto.
// ============================================================
(function () {
  const R = window.Rennspiel;
  if (!R || !R.config) return;

  R.config.spass = R.config.spass || {};
  R.config.spass.foto = Object.assign({ taste: 'KeyP', distStart: 8, distMin: 2.5, distMax: 45, pitchMin: -0.05, pitchMax: 1.45, zielHoehe: 0.9 }, R.config.spass.foto || {});
  const C = () => R.config.spass.foto;

  // ---------------------------------------------------------------- Rechenteil
  const klemme = (x, a, b) => (x < a ? a : x > b ? b : x);
  /** Kamera-Ort um ziel { x, y, z }: Winkel a (Drehung um die Hochachse; a = Fahrzeug-Heading → hinter dem Fahrzeug), Neigung p, Abstand d. */
  function kameraPose(ziel, a, p, d) {
    const cp = Math.cos(p);
    return { x: ziel.x + d * cp * Math.sin(a), y: ziel.y + C().zielHoehe + d * Math.sin(p), z: ziel.z + d * cp * Math.cos(a), lx: ziel.x, ly: ziel.y + C().zielHoehe, lz: ziel.z };
  }
  function begrenzen(st) { st.pitch = klemme(st.pitch, C().pitchMin, C().pitchMax); st.dist = klemme(st.dist, C().distMin, C().distMax); return st; }
  /** Rahmen als Rechtecke [{ x, y, w, h, f: 'weiss' | 'gold' | 'schwarz' | 'weissKaro' }] für Breite w, Höhe h (für das PNG; die Vorschau nutzt dasselbe in CSS). */
  function rahmenTeile(art, w, h) {
    if (art === 'polaroid') { const r = Math.round(w * 0.03), u = Math.round(h * 0.14); return [{ x: 0, y: 0, w, h: r, f: 'weiss' }, { x: 0, y: h - u, w, h: u, f: 'weiss' }, { x: 0, y: 0, w: r, h, f: 'weiss' }, { x: w - r, y: 0, w: r, h, f: 'weiss' }]; }
    if (art === 'sterne') { const r = Math.round(Math.min(w, h) * 0.035); return [{ x: 0, y: 0, w, h: r, f: 'gold' }, { x: 0, y: h - r, w, h: r, f: 'gold' }, { x: 0, y: 0, w: r, h, f: 'gold' }, { x: w - r, y: 0, w: r, h, f: 'gold' }]; }
    if (art === 'flagge') { const r = Math.round(h * 0.06); return [{ x: 0, y: 0, w, h: r, f: 'karo' }, { x: 0, y: h - r, w, h: r, f: 'karo' }]; }
    return [];
  }
  function dateiName(sp, d) {
    const z = (n) => String(n).padStart(2, '0');
    return 'foto-' + (sp === 'motorrad' ? 'motorrad' : 'autorennen') + '-' + d.getFullYear() + z(d.getMonth() + 1) + z(d.getDate()) + '-' + z(d.getHours()) + z(d.getMinutes()) + z(d.getSeconds()) + '.png';
  }
  R.SpassFoto = { kameraPose, begrenzen, rahmenTeile, dateiName };

  // ================================================================ Browser
  const M = R.SpassModi;
  if (!M || typeof document === 'undefined' || !R.Spiel) return;
  const P = R.Spiel.prototype;
  const spielName = M.spielName;
  const STANDARD = ['😎', '🔥', '⭐', '🏆', '💥', '🎉', '🚀', '❤️', '🌈', '🏁', '🦄', '👍'];
  const RAHMEN = [['keiner', '⬜ Kein Rahmen'], ['polaroid', '🖼️ Polaroid'], ['sterne', '⭐ Sterne'], ['flagge', '🏁 Rennflagge']];

  let foto = null;           // laufender Fotomodus
  let knopf = null;

  function stil() {
    if (document.getElementById('s4-foto-stil')) return;
    const s = document.createElement('style'); s.id = 's4-foto-stil';
    s.textContent =
      'html.s4-foto #huds,html.s4-foto #touch,html.s4-foto #s4-hud,html.s4-foto .spass-touch,html.s4-foto .moto-touch,html.s4-foto #debug{display:none!important}' +
      '#s4-foto-knopf{position:fixed;right:12px;top:15vh;z-index:110;width:44px;height:44px;border-radius:50%;background:rgba(255,255,255,.82);border:3px solid #ff8a1f;font-size:24px;line-height:38px;text-align:center;cursor:pointer;display:none;user-select:none;box-shadow:0 2px 8px rgba(0,0,0,.45);touch-action:manipulation}' +
      '#s4-foto-knopf:hover{background:#fff}' +
      '.s4-foto{position:fixed;inset:0;z-index:240;pointer-events:auto;touch-action:none;font:800 clamp(13px,2.1vh,22px)/1.2 Arial,sans-serif;color:#fff;user-select:none;cursor:grab}' +
      '.s4-foto:active{cursor:grabbing}.s4-foto .s4-rahmen{position:absolute;inset:0;pointer-events:none}' +
      '.s4-foto .s4-rahmen.polaroid{border:solid #fff;border-width:3vw 3vw 14vh 3vw;box-shadow:inset 0 0 0 1px rgba(0,0,0,.15)}' +
      '.s4-foto .s4-rahmen.sterne{border:3.5vmin solid #ffcf3a;box-shadow:inset 0 0 0 .6vmin #fff,inset 0 0 2vmin rgba(0,0,0,.4)}' +
      '.s4-foto .s4-rahmen.flagge::before,.s4-foto .s4-rahmen.flagge::after{content:"";position:absolute;left:0;right:0;height:6vh;background:repeating-conic-gradient(#000 0 25%,#fff 0 50%) 0 0/6vh 6vh}' +
      '.s4-foto .s4-rahmen.flagge::before{top:0}.s4-foto .s4-rahmen.flagge::after{bottom:0}' +
      '.s4-foto .s4-st{position:absolute;transform:translate(-50%,-50%);line-height:1;cursor:move;filter:drop-shadow(0 2px 3px rgba(0,0,0,.5));touch-action:none}' +
      '.s4-foto .s4-txt{position:absolute;left:50%;bottom:9vh;transform:translateX(-50%);white-space:nowrap;font-weight:900;font-size:6vh;color:#fff;-webkit-text-stroke:.6vh #1a2550;paint-order:stroke fill;text-shadow:0 .5vh 1vh rgba(0,0,0,.5);pointer-events:none}' +
      '.s4-foto .s4-leiste{position:absolute;left:0;right:0;bottom:0;display:flex;flex-wrap:wrap;gap:.35em;justify-content:center;align-items:center;padding:.4em .5em;background:rgba(14,24,58,.82);cursor:default}' +
      '.s4-foto .s4-leiste .grp{display:flex;gap:.25em;align-items:center;flex-wrap:wrap;justify-content:center}.s4-foto .b{padding:.2em .6em;border-radius:1em;background:rgba(255,255,255,.18);cursor:pointer;white-space:nowrap}' +
      '.s4-foto .b.an{background:#ffd23a;color:#1a2550}.s4-foto .b.gruen{background:#2fae4e}.s4-foto .b.rot{background:#d6381f}.s4-foto .b.em{font-size:1.5em;padding:.05em .3em;line-height:1.2}' +
      '.s4-foto input{font:inherit;padding:.2em .6em;border-radius:1em;border:0;width:11em;max-width:30vw}' +
      '.s4-foto .s4-oben{position:absolute;left:50%;top:1.2vh;transform:translateX(-50%);padding:.2em .9em;border-radius:1em;background:rgba(14,24,58,.72);pointer-events:none;text-align:center}' +
      '.s4-foto .s4-oben small{display:block;font-size:.72em;font-weight:700;opacity:.9}' +
      '.s4-foto.knips{animation:s4-knips .25s}@keyframes s4-knips{0%{background:#fff}100%{background:transparent}}' +
      '@media (max-height:520px){.s4-foto .s4-leiste{font-size:.8em}.s4-foto .s4-oben small{display:none}}';
    document.head.appendChild(s);
  }

  // ---------- Knopf 📸 ----------
  function knopfAnlegen(spiel) {
    if (knopf) return;
    stil();
    knopf = document.createElement('div'); knopf.id = 's4-foto-knopf'; knopf.textContent = '📸'; knopf.title = 'Fotomodus (Taste P)';
    knopf.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); aufschalten(R.spiel || spiel); });
    document.body.appendChild(knopf);
  }
  function knopfZeigen(spiel) {
    if (!knopf) return;
    const geht = !foto && (spiel.zustand === 'rennen' || spiel.zustand === 'online') && !spiel.pausiert && !M.offen() && spiel.kameras && spiel.kameras.length === 1;
    const an = geht ? 'block' : 'none';
    if (knopf.style.display !== an) knopf.style.display = an;
  }

  // ---------- Modus ein/aus ----------
  function aufschalten(spiel) {
    if (foto) return false;
    if (!spiel || !(spiel.zustand === 'rennen' || spiel.zustand === 'online') || !spiel.fahrzeuge || !spiel.kameras || !spiel.kameras.length) return false;
    if (spiel.pausiert && spiel.zustand === 'rennen') return false;                 // im Pausenmenü nicht
    if (spiel.kameras.length > 1) { try { spiel._meldung(0, '📸 Fotomodus gibt es nur allein', 1800); } catch (e) { /* egal */ } return false; }
    if (M.offen()) return false;
    stil();
    const f = spiel.fahrzeuge.find((x) => x.istSpieler) || spiel.fahrzeuge[0], v = f.anzeige || f.vehicle, k = spiel.kameras[0];
    const st = { spiel, f, a: (f.vehicle.heading || 0) + 0.55, pitch: 0.28, dist: C().distStart * (spielName() === 'motorrad' ? 0.8 : 1), rahmen: 'keiner', sticker: [], text: '', aufnahme: false, offline: spiel.zustand === 'rennen', camAlt: null, pointer: {}, pinch: 0, nr: 0 };
    begrenzen(st);
    // Cockpit-Ansicht → Verfolger (sonst fehlt das eigene Fahrzeug im Bild)
    try {
      const idx = R.config.kamera.modi.indexOf('verfolger');
      if (idx >= 0 && k.modusIndex !== idx) { st.camAlt = k.modusIndex; k.modusIndex = idx; k._erstesMal = true; k.update(0.001); }
    } catch (e) { /* Kamera darf nie ausfallen */ }
    if (st.offline) { spiel.pausiert = true; }
    document.documentElement.classList.add('s4-foto');
    st.el = oberflaeche(st);
    foto = st; void v;
    return true;
  }
  function abschalten() {
    const st = foto;
    if (!st) return;
    foto = null;
    document.documentElement.classList.remove('s4-foto');
    if (st.el) st.el.remove();
    const spiel = st.spiel, k = spiel.kameras && spiel.kameras[0];
    try { if (k && st.camAlt !== null) { k.modusIndex = st.camAlt; k._erstesMal = true; } } catch (e) { /* egal */ }
    if (st.offline && spiel.zustand === 'rennen') { spiel.pausiert = false; spiel.uhr.rest = 0; }
    if (spiel.input && spiel.input.gedrueckt) spiel.input.gedrueckt.clear();
  }

  // ---------- Oberfläche ----------
  function oberflaeche(st) {
    const el = document.createElement('div'); el.className = 's4-foto';
    const album = (R.SpassSticker && R.SpassSticker.katalog) ? R.SpassSticker.katalog(spielName()).filter((k) => R.SpassSticker.hat(spielName(), k.id)).map((k) => k.emoji) : [];
    const emojis = STANDARD.concat(album.filter((e) => STANDARD.indexOf(e) < 0)).slice(0, 22);
    el.innerHTML =
      '<div class="s4-rahmen keiner"></div><div class="s4-txt"></div><div class="s4-sticker"></div>' +
      '<div class="s4-oben">📸 Fotomodus<small>Ziehen = drehen · Mausrad = zoomen · <b>P</b> oder <b>Esc</b> = zurück</small></div>' +
      '<div class="s4-leiste">' +
      '<span class="grp" data-g="rahmen">' + RAHMEN.map(([k, t]) => `<span class="b${k === 'keiner' ? ' an' : ''}" data-a="rahmen:${k}">${t}</span>`).join('') + '</span>' +
      '<span class="grp" data-g="sticker">' + emojis.map((e) => `<span class="b em" data-a="sticker:${e}">${e}</span>`).join('') + '<span class="b" data-a="stickerWeg" title="Letzten Sticker entfernen">⌫</span></span>' +
      '<span class="grp"><input type="text" maxlength="28" placeholder="Text …" data-a="text"></span>' +
      '<span class="grp"><span class="b gruen" data-a="knips">📷 Foto speichern</span><span class="b rot" data-a="zu">✖ Zurück</span></span></div>';
    document.body.appendChild(el);
    // Bedienung
    const rahmenEl = el.querySelector('.s4-rahmen'), txt = el.querySelector('.s4-txt'), stickerEl = el.querySelector('.s4-sticker');
    el.addEventListener('click', (e) => {
      const t = e.target.closest('[data-a]'); if (!t) return;
      const [a, p] = t.dataset.a.split(':');
      if (a === 'rahmen') { st.rahmen = p; rahmenEl.className = 's4-rahmen ' + p; el.querySelectorAll('[data-g="rahmen"] .b').forEach((b) => b.classList.toggle('an', b === t)); }
      else if (a === 'sticker') stickerAdd(st, stickerEl, t.textContent, 0.5, 0.45);
      else if (a === 'stickerWeg') { const l = st.sticker.pop(); if (l && l.el) l.el.remove(); }
      else if (a === 'knips') aufnehmen(st);
      else if (a === 'zu') abschalten();
    });
    el.querySelector('input').addEventListener('input', (e) => { st.text = e.target.value; txt.textContent = st.text; });
    // Kamera: Zeiger (Maus/Finger) und Rad
    const ptr = st.pointer;
    el.addEventListener('pointerdown', (e) => {
      if (e.target.closest('.s4-leiste') || e.target.closest('.s4-st')) return;
      ptr[e.pointerId] = { x: e.clientX, y: e.clientY };
      try { el.setPointerCapture(e.pointerId); } catch (er) { /* egal */ }
      st.pinch = 0;
    });
    el.addEventListener('pointermove', (e) => {
      const p = ptr[e.pointerId]; if (!p) return;
      const ids = Object.keys(ptr);
      if (ids.length >= 2) {
        const a = ptr[ids[0]], b = ptr[ids[1]];
        if (+ids[0] === e.pointerId) { a.x = e.clientX; a.y = e.clientY; } else { b.x = e.clientX; b.y = e.clientY; }
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (st.pinch > 0) st.dist *= st.pinch / Math.max(20, d);
        st.pinch = d; begrenzen(st);
        return;
      }
      st.a -= (e.clientX - p.x) * 0.008; st.pitch += (e.clientY - p.y) * 0.006;
      p.x = e.clientX; p.y = e.clientY; begrenzen(st);
    });
    const hoch = (e) => { delete ptr[e.pointerId]; st.pinch = 0; };
    el.addEventListener('pointerup', hoch); el.addEventListener('pointercancel', hoch);
    el.addEventListener('wheel', (e) => { e.preventDefault(); st.dist *= Math.exp(e.deltaY * 0.001); begrenzen(st); }, { passive: false });
    return el;
  }
  function stickerAdd(st, host, emoji, x, y) {
    if (st.sticker.length >= 30) return;
    const d = document.createElement('div'); d.className = 's4-st'; d.textContent = emoji;
    const s = { e: emoji, x, y, groesse: 0.11, el: d };      // Größe als Anteil der Bildhöhe
    const setze = () => { d.style.left = s.x * 100 + '%'; d.style.top = s.y * 100 + '%'; d.style.fontSize = s.groesse * 100 + 'vh'; };
    setze();
    let zieh = null;
    d.addEventListener('pointerdown', (e) => { e.stopPropagation(); zieh = e.pointerId; try { d.setPointerCapture(e.pointerId); } catch (er) { /* egal */ } });
    d.addEventListener('pointermove', (e) => { if (zieh !== e.pointerId) return; s.x = klemme(e.clientX / window.innerWidth, 0.02, 0.98); s.y = klemme(e.clientY / window.innerHeight, 0.02, 0.98); setze(); });
    d.addEventListener('pointerup', () => { zieh = null; });
    d.addEventListener('wheel', (e) => { e.preventDefault(); e.stopPropagation(); s.groesse = klemme(s.groesse * Math.exp(-e.deltaY * 0.0015), 0.04, 0.5); setze(); }, { passive: false });
    d.addEventListener('dblclick', () => { const i = st.sticker.indexOf(s); if (i >= 0) st.sticker.splice(i, 1); d.remove(); });
    host.appendChild(d); st.sticker.push(s);
  }

  // ---------- Aufnehmen ----------
  function aufnehmen(st) { st.aufnahme = true; }
  function zusammensetzen(st, quelle) {
    const out = document.createElement('canvas'); out.width = quelle.width; out.height = quelle.height;
    const g = out.getContext('2d'), w = out.width, h = out.height;
    g.drawImage(quelle, 0, 0, w, h);
    for (const t of rahmenTeile(st.rahmen, w, h)) {
      if (t.f === 'karo') {
        const q = Math.max(4, t.h);
        for (let x = 0, i = 0; x < w; x += q, i++) for (let y = t.y, j = 0; y < t.y + t.h; y += q, j++) { g.fillStyle = (i + j) % 2 ? '#fff' : '#000'; g.fillRect(x, y, Math.min(q, w - x), Math.min(q, t.y + t.h - y)); }
      } else { g.fillStyle = t.f === 'gold' ? '#ffcf3a' : '#ffffff'; g.fillRect(t.x, t.y, t.w, t.h); }
    }
    for (const s of st.sticker) {
      g.font = Math.round(s.groesse * h) + 'px Arial, "Apple Color Emoji", "Segoe UI Emoji", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.shadowColor = 'rgba(0,0,0,.5)'; g.shadowBlur = h * 0.006; g.fillText(s.e, s.x * w, s.y * h + h * 0.01);
    }
    g.shadowBlur = 0;
    if (st.text) {
      const fs = Math.round(h * 0.06);
      g.font = '900 ' + fs + 'px Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'alphabetic';
      g.lineJoin = 'round'; g.lineWidth = Math.round(h * 0.012); g.strokeStyle = '#1a2550'; g.fillStyle = '#fff';
      const y = h * (1 - 0.09) - (st.rahmen === 'polaroid' ? 0 : 0);
      g.strokeText(st.text, w / 2, y); g.fillText(st.text, w / 2, y);
    }
    return out;
  }
  function speichern(st, out) {
    out.toBlob((blob) => {
      if (!blob) return;
      const name = dateiName(spielName(), new Date());
      const info = { name, bytes: blob.size, w: out.width, h: out.height, zeit: Date.now() };
      window.__s4Foto = info;
      let geteilt = false;
      try {
        const file = typeof File === 'function' ? new File([blob], name, { type: 'image/png' }) : null;
        const grob = window.matchMedia && window.matchMedia('(pointer:coarse)').matches;
        if (file && grob && navigator.canShare && navigator.canShare({ files: [file] }) && navigator.share) {
          navigator.share({ files: [file], title: 'Mein Foto' }).catch(() => {}); geteilt = true;
        }
      } catch (e) { /* weiter mit Download */ }
      if (!geteilt) {
        const url = URL.createObjectURL(blob), a = document.createElement('a');
        a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 4000);
      }
      info.geteilt = geteilt;
      if (st.el) { st.el.classList.remove('knips'); void st.el.offsetWidth; st.el.classList.add('knips'); const o = st.el.querySelector('.s4-oben'); if (o) o.innerHTML = '📸 Foto gespeichert!<small>' + name + '</small>'; }
      if (R.Spass && R.Spass.sticker) R.Spass.sticker('foto');
    }, 'image/png');
  }

  // ---------- Verdrahtung ----------
  const zeichnen = P.zeichnen;
  P.zeichnen = function () {
    if (!knopf && this.zustand !== 'menue') { try { knopfAnlegen(this); } catch (e) { /* egal */ } }
    try { knopfZeigen(this); } catch (e) { /* egal */ }
    const st = foto;
    if (st && (this.zustand === 'rennen' || this.zustand === 'online')) {
      try {
        const k = this.kameras[0].kamera, f = st.f, v = f.anzeige || f.vehicle;
        const p = kameraPose({ x: v.x, y: v.y, z: v.z }, st.a, st.pitch, st.dist);
        // nicht unter den Boden
        let y = p.y; try { if (this.strecke) y = Math.max(y, this.strecke.hoeheAn(p.x, p.z) + 0.4); } catch (e) { /* egal */ }
        k.position.set(p.x, y, p.z); k.up.set(0, 1, 0); k.lookAt(p.lx, p.ly, p.lz);
      } catch (e) { /* Kamera darf nie ausfallen */ }
    }
    const r = zeichnen.apply(this, arguments);
    if (st && st.aufnahme) {
      st.aufnahme = false;
      try { speichern(st, zusammensetzen(st, this.renderer.domElement)); } catch (e) { console.error('Fotomodus (Aufnahme):', e); }
    }
    return r;
  };

  const taste = P.taste;
  P.taste = function (code, e) {
    if (code === C().taste && !(e && e.repeat)) {
      if (foto) { abschalten(); return; }
      if ((this.zustand === 'rennen' && !this.pausiert) || this.zustand === 'online') { aufschalten(this); return; }
    }
    return taste.apply(this, arguments);
  };

  // Tasten im Fotomodus: nur wir (Capture, vor dem Spiel)
  window.addEventListener('keydown', (e) => {
    if (!foto) return;
    const tippt = e.target && e.target.tagName === 'INPUT';
    if (e.code === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); abschalten(); return; }
    if (e.code === C().taste && !tippt) { e.preventDefault(); e.stopImmediatePropagation(); abschalten(); return; }
    if (!tippt) {
      const st = foto;
      if (e.code === 'ArrowLeft') st.a += 0.08; else if (e.code === 'ArrowRight') st.a -= 0.08;
      else if (e.code === 'ArrowUp') st.dist *= 0.92; else if (e.code === 'ArrowDown') st.dist *= 1.08;
      else if (e.code === 'KeyW') st.pitch += 0.05; else if (e.code === 'KeyS') st.pitch -= 0.05;
      begrenzen(st);
      e.preventDefault();
    }
    e.stopImmediatePropagation();                      // Gas, Lenkung … gelten im Fotomodus nicht
  }, true);

  R.SpassFoto.an = () => !!foto;
  R.SpassFoto.aufschalten = (spiel) => aufschalten(spiel || R.spiel);
  R.SpassFoto.abschalten = abschalten;
  R.SpassFoto.zustand = () => foto;
})();
