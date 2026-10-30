// ============================================================
// Spaß-Paket S2 – Oberfläche für das Tuning (läuft ganz am Ende; alles Umhüllungen, nichts Bestehendes wird ersetzt):
//   Menü (R.Menue)            im Spaß-Streifen die Pille „🔧 Tuning An/Aus“ (Fokus-Zeile 'tuning', Standard an; Wert im eigenen Speicher R.SpassTuning.an())
//   Garage (R.Garage.Bildschirm)  in der Werkstatt eine Zeile „🔧 Tuning“ → eigener Schritt (phase 'tuning'): Motor, Reifen, Bremsen (Motorrad: Federung)
//                             je 0–5 Stufen mit Goldstücken kaufen, Stufe zurückgeben (↩), alles zurücksetzen. Bühne zeigt die Tuning-Teile ab Stufe 3.
//                             Tasten: ↑↓ Zeile · → / Enter kaufen · ← Stufe zurück · Esc zurück zur Werkstatt
//   R.carBuilder.bauen        umhüllt: nur solange die Garage-Bühne das Tuning-Auto neu baut (R.SpassTuning._vorschau), hängt es die Teile an
// ============================================================
(function () {
  const R = window.Rennspiel;
  if (!R || !R.SpassTuning) return;
  const T = R.SpassTuning;
  const moto = () => window.MOTORRAD === true;
  const spielName = () => (moto() ? 'motorrad' : 'auto');
  const ART = () => ({
    motor: { emoji: '🚀', name: 'Motor', wirkt: (n) => `+${+(n * R.config.spass.tuning.jeStufe.vMax * 100).toFixed(1)} % Tempo und Anzug`, kurz: 'schneller' },
    reifen: { emoji: '🛞', name: 'Reifen', wirkt: (n) => `+${+(n * R.config.spass.tuning.jeStufe.grip * 100).toFixed(1)} % Grip`, kurz: 'haftet besser' },
    bremsen: { emoji: '🛑', name: moto() ? 'Federung' : 'Bremsen', wirkt: (n) => `+${+(n * R.config.spass.tuning.jeStufe.bremsen * 100).toFixed(1)} % Bremskraft`, kurz: 'bremst stärker' },
  });
  const TEIL = () => ({ motor: moto() ? 'Auspuff' : 'Auspuff-Endrohre', reifen: moto() ? 'breiter Hinterreifen' : 'breite Reifen', bremsen: moto() ? 'Gold-Gabel' : 'Heck-Spoiler' });

  function stil() {
    if (typeof document === 'undefined' || document.getElementById('spass-tuning-stil')) return;
    const s = document.createElement('style');
    s.id = 'spass-tuning-stil';
    s.textContent =
      '.g-tuningpanel h3{margin:.1em 0 .35em;font-size:1.05em}.g-tuningpanel .g-balken i{width:1.15em}.g-tuningpanel .g-balken i.voll.gold{background:#ffc21a}' +
      '.g-tuningpanel .g-zeile .knopf.klein,.g-tuningpanel .g-knopf{cursor:pointer}.g-tuningpanel .g-ruck{margin-left:.3em;padding:.12em .5em;border-radius:.7em;background:rgba(255,255,255,.18);cursor:pointer;font-size:.85em}' +
      '.g-tuningpanel .g-ruck.aus{opacity:.3;cursor:default}.g-tuningknopf{margin-top:.4em;text-align:center}' +
      '.g-tuningpanel .g-zeile.reset .g-wert{gap:.5em}';
    document.head.appendChild(s);
  }

  // ---------- Menü ----------
  if (R.Menue) {
    const M = R.Menue.prototype;
    const zeilen = M.zeilen;
    M.zeilen = function () { const z = zeilen.apply(this, arguments), i = z.indexOf('start'); z.splice(i < 0 ? z.length : i, 0, 'tuning'); return z; };
    const zeilenWert = M.zeilenWert;
    M.zeilenWert = function (zeile, dx) {
      if (zeile === 'tuning') { if (dx) this.wertSetzen('tuning', dx > 0 ? 'an' : 'aus'); return; }
      return zeilenWert.apply(this, arguments);
    };
    const wertSetzen = M.wertSetzen;
    M.wertSetzen = function (zeile, k) {
      if (zeile === 'tuning') { T.anSetzen(k === 'an'); this.e.tuning = k === 'an'; return; }
      return wertSetzen.apply(this, arguments);
    };
    const htmlStart = M.htmlStart;
    M.htmlStart = function () {
      let h = htmlStart.apply(this, arguments);
      try {
        stil();
        const e = this.e, z = this.zeilen(), gf = z[this.fokus], an = T.an();
        e.tuning = an;
        const pille = (k, text, aktiv) => `<span class="pille${aktiv ? ' aktiv' : ''}" data-a="wert:tuning:${k}">${text}</span>`;
        const gr = `<span class="gr${gf === 'tuning' ? ' fokus' : ''}" title="Dein Tuning aus der Garage zählt im Rennen, die Computer-Gegner bekommen passend dazu etwas Tuning – Aus: alles wie früher">` +
          `<span class="z-label" data-a="fokus:${z.indexOf('tuning')}">🔧 Tuning</span>${pille('aus', 'Aus', !an)}${pille('an', 'An', an)}</span>`;
        h = h.replace('<span class="knopf klein" data-a="album"', gr + '<span class="knopf klein" data-a="album"');
      } catch (err) { console.error('Spaß (Tuning-Menü):', err); }
      return h;
    };
  }

  // ---------- Tuning-Teile an die Garage-Bühne ----------
  if (R.carBuilder && R.carBuilder.bauen && !R.carBuilder._spassTuning) {
    R.carBuilder._spassTuning = true;
    const bauen = R.carBuilder.bauen;
    R.carBuilder.bauen = function (autoDaten) {
      const g = bauen.apply(this, arguments), v = T._vorschau;
      if (v && autoDaten && v.id === autoDaten.id && g) { try { T.teileAnbauen(g, autoDaten, v.stufen); } catch (e) { console.error('Spaß (Tuning-Teile):', e); } }
      return g;
    };
  }

  // ---------- Garage ----------
  if (R.Garage && R.Garage.Bildschirm) {
    const B = R.Garage.Bildschirm.prototype;
    const ARTEN = T.ARTEN;
    const prozentGesamt = (s) => ARTEN.reduce((n, k) => n + s[k], 0);

    function panel(g) {
      const A = ART(), tt = TEIL(), s = T.stufen(g.fahrer, g.autoId), konto = R.Garage.konto(g.fahrer), max = R.config.spass.tuning.max;
      const zeilen = ARTEN.map((k, j) => {
        const st = s[k], p = T.preis(st), a = A[k];
        const balken = Array.from({ length: max }, (_, n) => `<i class="${n < st ? 'voll' : ''}${n < st && st >= max ? ' gold' : ''}"></i>`).join('');
        const sicht = st >= R.config.spass.tuning.teileAb ? ` · ✨ ${tt[k]}` : '';
        return `<div class="g-zeile${g.tuningZeile === j ? ' fokus' : ''}"><div class="g-label">${a.emoji} ${a.name}</div><div class="g-wert">` +
          `<div class="g-balken">${balken}</div><span class="g-text">${st ? a.wirkt(st) : 'Stufe 0'}${sicht}</span>` +
          `<div class="g-knopf${p === null ? ' aus' : konto < p ? ' teuer' : ''}" data-g="tuning:kauf:${k}">${p === null ? '⭐ voll' : `⬆ Stufe ${st + 1} <small>🪙 ${p}</small>`}</div>` +
          `<span class="g-ruck${st ? '' : ' aus'}" data-g="tuning:rueck:${k}" title="Stufe zurückgeben – du bekommst die Goldstücke zurück">↩${st ? ` 🪙 +${R.config.spass.tuning.preise[st - 1]}` : ''}</span></div></div>`;
      }).join('');
      const rueck = ARTEN.reduce((n, k) => n + T.investiert(s[k]), 0);
      const reset = `<div class="g-zeile reset${g.tuningZeile === 3 ? ' fokus' : ''}"><div class="g-label">🔁 Alles</div><div class="g-wert">` +
        `<div class="g-knopf${rueck ? '' : ' aus'}" data-g="tuning:reset">${rueck ? `Zurücksetzen <small>🪙 +${rueck}</small>` : 'nichts getunt'}</div>` +
        `<span class="g-text klein">Bis Stufe 5; ab Stufe ${R.config.spass.tuning.teileAb} siehst du Teile am Fahrzeug</span></div></div>`;
      // R1: reines Tuning – die alten Garage-Upgrades gibt es nicht mehr; „Gesamt“ = Summe aus den Tuning-Stufen
      let gesamtHtml = '';
      try {
        const tj = R.config.spass.tuning.jeStufe, proz = (je, n) => Math.round(je * 100 * n * 10) / 10;
        const zeile = (k, je) => `<div class="g-text">${A[k].emoji} ${A[k].name}: Tuning <b>+${proz(je, s[k])} %</b></div>`;
        gesamtHtml = `<div class="g-zeile gesamt"><div class="g-label">➕ Gesamt</div><div class="g-wert" style="flex-direction:column;align-items:flex-start;gap:.1em">` +
          zeile('motor', tj.vMax) + zeile('reifen', tj.grip) + zeile('bremsen', tj.bremsen) + `</div></div>`;
      } catch (err) { gesamtHtml = ''; }
      const msg = g.nachricht ? `<div class="g-nachricht ${g.nachrichtArt}">${g.nachricht}</div>` : '<div class="g-nachricht leer">&nbsp;</div>';
      return `<div class="g-tuningpanel"><h3>🔧 Tuning mit Goldstücken <span class="g-text">· 🪙 ${konto}</span></h3>${zeilen}${reset}${gesamtHtml}${msg}</div>`;
    }

    // Bühne nur neu bauen, wenn sich die Tuning-Teile ändern
    function buehneTuning(g) {
      const s = T.stufen(g.fahrer, g.autoId), sb = T.sichtbar(s), schl = g.autoId + ':' + [sb.motor ? s.motor : 0, sb.reifen ? s.reifen : 0, sb.bremsen ? s.bremsen : 0].join('');   // neu bauen, wenn Teile dazukommen oder sich (Stufe 4/5) ändern
      if (g._tuningBuehne === schl) return;
      g._tuningBuehne = schl;
      if (R.AutoVorschau && R.AutoVorschau.neuBauen) {
        T._vorschau = { id: g.autoId, stufen: s };
        try { R.AutoVorschau.neuBauen(0); } finally { T._vorschau = null; }
      }
    }

    const zeichnen = B.zeichnen;
    B.zeichnen = function () {
      if (this.phase === 'tuning') {
        this.phase = 'werkstatt';
        let r;
        try { r = zeichnen.apply(this, arguments); } finally { this.phase = 'tuning'; }
        try {
          stil();
          const rechts = this.wurzel.querySelector('.g-rechts');
          if (rechts) rechts.innerHTML = panel(this);
          const hint = this.wurzel.querySelector('.m-hinweis');
          if (hint) hint.innerHTML = '<kbd>↑</kbd><kbd>↓</kbd> Zeile · <kbd>→</kbd>/<kbd>Enter</kbd> kaufen · <kbd>←</kbd> Stufe zurück · <kbd>,</kbd><kbd>.</kbd> drehen · <kbd>Esc</kbd> zurück';
          const fuss = this.wurzel.querySelector('.m-nav .knopf.blau'); if (fuss) { fuss.setAttribute('data-g', 'zurueck'); fuss.textContent = '◀ Werkstatt'; }
          buehneTuning(this);
          if (R.Moto && R.Moto.m3garage && R.Moto.m3garage.texteErsetzen && moto()) R.Moto.m3garage.texteErsetzen(this.wurzel);
        } catch (e) { console.error('Spaß (Tuning-Garage):', e); }
        return r;
      }
      this._tuningBuehne = null;
      const r = zeichnen.apply(this, arguments);
      try {
        if (this.sichtbar && this.phase === 'werkstatt') {
          stil();
          const s = T.stufen(this.fahrer, this.autoId), n = prozentGesamt(s), links = this.wurzel.querySelector('.g-links');
          if (links) links.insertAdjacentHTML('beforeend', `<div class="g-tuningknopf"><div class="knopf klein gelb${this.zeile === 1 ? ' fokus' : ''}" data-g="tuning:oeffnen">🔧 Tuning öffnen${n ? ` (${n}/${ARTEN.length * R.config.spass.tuning.max})` : ''}</div></div>`);
        }
      } catch (e) { console.error('Spaß (Tuning-Zeile):', e); }
      return r;
    };

    function kaufen(g, art) {
      const A = ART(), r = T.kaufen(g.fahrer, g.autoId, art);
      if (r.ok) {
        g.melden(`${A[art].emoji} ${A[art].name} Stufe ${r.stufe}! Dein ${moto() ? 'Motorrad' : 'Auto'} ${A[art].kurz}.${r.stufe === R.config.spass.tuning.teileAb ? ' Schau: neues Teil! ✨' : ''}`, 'gut'); g.ton('kauf');
        try { R.SpassStart.toastStil(); R.Spass.sticker('tuning', { voll: r.voll }); } catch (e) { /* egal */ }
      } else if (r.grund === 'max') { g.melden(`${A[art].name} ist schon ganz oben ⭐`, ''); g.ton('klick'); }
      else { g.melden(`Zu wenig Goldstücke – du brauchst 🪙 ${r.kosten}. Fahr ein Rennen und sammle!`, 'schlecht'); g.ton('klick'); }
    }
    function rueck(g, art) {
      const A = ART(), r = T.rueckgaengig(g.fahrer, g.autoId, art);
      if (r.ok) { g.melden(`${A[art].name} eine Stufe zurück – 🪙 ${r.rueck} Goldstücke zurück!`, 'gut'); g.ton('klick'); }
      else { g.melden('Da ist nichts zum Zurückgeben.', ''); g.ton('klick'); }
    }
    function reset(g) {
      const r = T.zuruecksetzen(g.fahrer, g.autoId);
      if (r.ok) { g.melden(`Alles zurückgesetzt – 🪙 ${r.rueck} Goldstücke zurück!`, 'gut'); g.ton('klick'); }
      else { g.melden('Es ist noch nichts getunt.', ''); g.ton('klick'); }
    }

    const aktion = B.aktion;
    B.aktion = function (a) {
      if (typeof a === 'string' && a.startsWith('tuning:')) {
        const [, was, art] = a.split(':');
        if (was === 'oeffnen') { this.phase = 'tuning'; this.tuningZeile = 0; this.nachricht = ''; this.vorschau = undefined; this.ton('klick'); }
        else {
          if (this.phase !== 'tuning') return;
          this.nachricht = '';
          if (was === 'kauf') { this.tuningZeile = ARTEN.indexOf(art); kaufen(this, art); }
          else if (was === 'rueck') { this.tuningZeile = ARTEN.indexOf(art); rueck(this, art); }
          else if (was === 'reset') { this.tuningZeile = 3; reset(this); }
        }
        this.zeichnen();
        return;
      }
      if (this.phase === 'tuning' && (a === 'zurueck' || a === 'weiter')) { this.zurueck(); return; }
      return aktion.apply(this, arguments);
    };
    const zurueck = B.zurueck;
    B.zurueck = function () {
      if (this.phase === 'tuning') { this.phase = 'werkstatt'; this.nachricht = ''; this.zeile = 0; this._tuningBuehne = null; this.zeichnen(); return; }
      return zurueck.apply(this, arguments);
    };
    const taste = B.taste;
    B.taste = function (code) {
      if (this.phase === 'tuning') {
        const Tk = R.config.tasten, P1 = Tk.spieler[0], P2 = Tk.spieler[1], DREH = { Comma: -1, Period: 1, KeyQ: -1, KeyE: 1 };
        if (code === Tk.pause) { this.zurueck(); return true; }
        if (DREH[code] !== undefined && R.AutoVorschau) { R.AutoVorschau.drehen(0, DREH[code]); return true; }
        const art = this.tuningZeile < 3 ? ARTEN[this.tuningZeile || 0] : null;
        if (Tk.bestaetigen.includes(code)) { this.nachricht = ''; if (art) kaufen(this, art); else reset(this); this.zeichnen(); return true; }
        let dx = 0, dy = 0;
        if (code === P1.links || code === P2.links) dx = -1; else if (code === P1.rechts || code === P2.rechts) dx = 1;
        else if (code === P1.gas || code === P2.gas) dy = -1; else if (code === P1.bremse || code === P2.bremse) dy = 1; else return true;
        this.nachricht = '';
        if (dy) this.tuningZeile = ((this.tuningZeile || 0) + dy + 4) % 4;
        else if (art) { if (dx > 0) kaufen(this, art); else rueck(this, art); }
        else if (dx < 0) { /* Reset-Zeile: nur Enter */ }
        this.zeichnen();
        return true;
      }
      return taste.apply(this, arguments);
    };
  }

  R.SpassTuningUI = { panel: null, ART, TEIL };
})();
