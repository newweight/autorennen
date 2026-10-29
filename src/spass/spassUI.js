// ============================================================
// Spaß-Paket S1 – Oberfläche (läuft ganz am Ende; alles Umhüllungen):
//   Menü (R.Menue)           Zeile „🎪 Spaß-Elemente An/Aus · 👻 Geist An/Aus · 📒 Sticker-Album“ (Fokus-Zeilen 'spass' und 'geist', hinten angehängt),
//                            Zeile „Hupe“ in der Steuerungs-Tafel, Album-Seite (gesammelt bunt, fehlend grau mit „?“)
//   Garage (R.Garage.Bildschirm)   im ersten Schritt (Fahrer) das Feld „🎤 Stimmen“: Hupe/Jubel aufnehmen (höchstens 2 s), anhören, löschen. Tasten U (Hupe) und I (Jubel) aufnehmen
// ============================================================
(function () {
  const R = window.Rennspiel;
  if (!R || !R.SpassStimme || !R.SpassSticker) return;
  const St = R.SpassStimme, SK = R.SpassSticker;
  const spielName = () => (window.MOTORRAD === true ? 'motorrad' : 'auto');

  function stil() {
    if (typeof document === 'undefined' || document.getElementById('spass-ui-stil')) return;
    const s = document.createElement('style');
    s.id = 'spass-ui-stil';
    s.textContent =
      '.m-spass{display:flex;flex-wrap:wrap;gap:.3em 1.1em;justify-content:center;align-items:center;margin:.2em 0 .1em;font-size:.82em}' +
      '.m-spass .gr{display:flex;align-items:center;gap:.3em;padding:.1em .5em;border-radius:1em}.m-spass .gr.fokus{background:rgba(255,255,255,.18);outline:.1em solid var(--gelb);outline-offset:.05em}' +
      '.m-spass .pille{cursor:pointer}' +
      '.spass-album{position:fixed;inset:0;z-index:250;display:none;flex-direction:column;align-items:center;justify-content:center;background:rgba(10,20,50,.86);color:#fff;font-weight:800;padding:2vh 3vw;box-sizing:border-box;font-size:clamp(16px,2.4vh,26px)}' +
      '.spass-album h1{margin:0 0 .15em;font-size:1.9em;color:var(--gelb,#ffd23a);text-shadow:0 .08em .2em rgba(0,0,0,.6)}.spass-album .zahl{margin-bottom:.5em;opacity:.9}' +
      '.spass-album .raster{display:grid;grid-template-columns:repeat(auto-fill,minmax(7.4em,1fr));gap:.55em;width:min(96vw,60em);max-height:68vh;overflow:auto;padding:.3em}' +
      '.spass-album .st{background:linear-gradient(#fff6c8,#ffd23a);color:#2a2f6b;border-radius:.9em;padding:.4em .3em;text-align:center;border:.12em solid #fff;box-shadow:0 .15em .4em rgba(0,0,0,.4);line-height:1.1}' +
      '.spass-album .st b{display:block;font-size:2.3em;line-height:1.15}.spass-album .st small{display:block;font-size:.62em;font-weight:700;opacity:.85;margin-top:.15em}' +
      '.spass-album .st.fehlt{background:#6a7090;color:#cfd3e6;border-color:#9aa0bd;box-shadow:none}.spass-album .st.fehlt b{filter:grayscale(1);opacity:.5}' +
      '.spass-album .zu{margin-top:.7em}' +
      '.g-stimmen{margin-top:.8em;padding:.5em .9em;border-radius:1em;background:rgba(255,255,255,.14);text-align:center;max-width:46em}' +
      '.g-stimmen h3{margin:.05em 0 .3em;font-size:1.05em}.g-stimmen .zl{display:flex;align-items:center;justify-content:center;flex-wrap:wrap;gap:.35em;margin:.25em 0}' +
      '.g-stimmen .zl>span.n{min-width:6.2em;text-align:right}.g-stimmen .knopf{font-size:.85em;padding:.25em .7em;cursor:pointer}.g-stimmen .knopf.rot{background:#d6381f}' +
      '.g-stimmen .info{font-size:.8em;opacity:.95;min-height:1.3em;margin-top:.2em}.g-stimmen .info.fehler{color:#ffd0c0}';
    document.head.appendChild(s);
  }

  // ---------- Album ----------
  let albumEl = null;
  function albumZeigen() {
    stil();
    const sp = spielName(), kat = SK.katalog(sp), got = SK.stand(sp).got;
    if (!albumEl) {
      albumEl = document.createElement('div'); albumEl.className = 'spass-album';
      albumEl.addEventListener('click', () => albumZu());
      document.body.appendChild(albumEl);
    }
    const n = kat.filter((k) => got[k.id]).length;
    albumEl.innerHTML = `<h1>📒 Sticker-Album</h1><div class="zahl">${n} von ${kat.length} Stickern gesammelt</div><div class="raster">` +
      kat.map((k) => got[k.id]
        ? `<div class="st"><b>${k.emoji}</b>${k.name}<small>${k.text}</small></div>`
        : `<div class="st fehlt"><b>?</b>Noch nicht<small>${k.text}</small></div>`).join('') +
      `</div><div class="knopf blau zu">Zurück <kbd>Esc</kbd></div>`;
    albumEl.style.display = 'flex';
  }
  function albumZu() { if (albumEl) albumEl.style.display = 'none'; const m = R.spiel && R.spiel.menue; if (m && m.zeichnen) m.zeichnen(); }
  const albumOffen = () => !!albumEl && albumEl.style.display !== 'none';

  // ---------- Menü ----------
  if (R.Menue) {
    const M = R.Menue.prototype;
    const zeilen = M.zeilen;
    M.zeilen = function () { const z = zeilen.apply(this, arguments), i = z.indexOf('start'); z.splice(i < 0 ? z.length : i, 0, 'spass', 'geist'); return z; };
    const zeilenWert = M.zeilenWert;
    M.zeilenWert = function (zeile, dx) {
      if (zeile === 'spass' || zeile === 'geist') { if (dx) this.wertSetzen(zeile, dx > 0 ? 'an' : 'aus'); return; }
      return zeilenWert.apply(this, arguments);
    };
    const wertSetzen = M.wertSetzen;
    M.wertSetzen = function (zeile, k) {
      if (zeile === 'spass' || zeile === 'geist') { this.e[zeile] = k === 'an'; return; }
      return wertSetzen.apply(this, arguments);
    };
    const htmlStart = M.htmlStart;
    M.htmlStart = function () {
      let h = htmlStart.apply(this, arguments);
      try {
        stil();
        const e = this.e, z = this.zeilen(), gf = z[this.fokus];
        const pille = (zeile, k, text, an) => `<span class="pille${an ? ' aktiv' : ''}" data-a="wert:${zeile}:${k}">${text}</span>`;
        const gr = (zeile, label, titel) => `<span class="gr${gf === zeile ? ' fokus' : ''}" title="${titel}"><span class="z-label" data-a="fokus:${z.indexOf(zeile)}">${label}</span>` +
          pille(zeile, 'aus', 'Aus', e[zeile] === false) + pille(zeile, 'an', 'An', e[zeile] !== false) + '</span>';
        const n = SK.anzahl(spielName()), m = SK.katalog(spielName()).length;
        const zeile = `<div class="m-spass">` +
          gr('spass', '🎪 Spaß-Elemente', 'Trampolin und Kanone auf der Strecke (bunt, kindgerecht) – Aus: Strecke wie früher') +
          gr('geist', '👻 Geist', 'Dein bester Lauf fährt als durchsichtiges Geisterauto mit (nur allein, offline)') +
          `<span class="knopf klein" data-a="album" title="Gesammelte Sticker ansehen">📒 Sticker-Album ${n}/${m}</span></div>`;
        h = h.replace('<div class="m-aktionen">', zeile + '<div class="m-aktionen">');
        const hupeZeile = `<div class="t-zeile"><b>Hupe &amp; Jubel</b><span>${this.zwei ? '① ' : ''}<kbd>-</kbd>${this.zwei ? ' ② <kbd>Q</kbd>' : ' oder <kbd>Q</kbd>'} hupen · Aufnehmen: Garage 🎤 · Handy: 📯</span></div>`;
        h = h.replace('<div class="t-zeile"><b>Alle</b>', hupeZeile + '<div class="t-zeile"><b>Alle</b>');
      } catch (err) { console.error('Spaß (Menü):', err); }
      return h;
    };
    const aktion = M.aktion;
    M.aktion = function (a) {
      if (a === 'album') { if (R.Audio) R.Audio.menueKlick(); albumZeigen(); return; }
      return aktion.apply(this, arguments);
    };
    const taste = M.taste;
    M.taste = function (code) {
      if (albumOffen()) { if (code === 'Escape' || code === 'Enter' || code === 'Space') albumZu(); return true; }
      return taste.apply(this, arguments);
    };
  }

  // ---------- Garage: Stimmen ----------
  if (R.Garage && R.Garage.Bildschirm) {
    const B = R.Garage.Bildschirm.prototype;
    const NAMEN = { hupe: '📯 Hupe', jubel: '🎉 Jubel' };
    function feldHtml(g) {
      const zeile = (art) => {
        const nimmt = g.spassLaeuft === art, hat = St.hat(art);
        return `<div class="zl"><span class="n">${NAMEN[art]}${hat ? ' ✅' : ''}</span>` +
          (nimmt ? `<span class="knopf rot" data-g="spass:stopp">⏹ Stopp (${(g.spassSek || 0).toFixed(1)} s)</span>`
            : `<span class="knopf gruen" data-g="spass:auf:${art}">🎤 Aufnehmen</span>`) +
          `<span class="knopf blau" data-g="spass:hoer:${art}">▶ Anhören${hat ? '' : ' (Standard)'}</span>` +
          (hat ? `<span class="knopf" data-g="spass:weg:${art}">🗑 Löschen</span>` : '') + '</div>';
      };
      return `<div class="g-stimmen"><h3>🎤 Deine Stimme – Hupe und Jubel selbst sprechen</h3>${zeile('hupe')}${zeile('jubel')}` +
        `<div class="info${g.spassFehler ? ' fehler' : ''}">${g.spassInfo || 'Höchstens 2 Sekunden. Tasten: <kbd>U</kbd> Hupe aufnehmen, <kbd>I</kbd> Jubel aufnehmen. Gilt für dieses Spiel.'}</div></div>`;
    }
    const zeichnen = B.zeichnen;
    B.zeichnen = function () {
      const r = zeichnen.apply(this, arguments);
      try {
        if (this.sichtbar && this.phase === 'fahrer') {
          stil();
          const inh = this.wurzel.querySelector('.m-inhalt');
          if (inh) inh.insertAdjacentHTML('beforeend', feldHtml(this));
        }
      } catch (e) { console.error('Spaß (Garage):', e); }
      return r;
    };
    function aufnehmen(g, art) {
      if (g.spassLaeuft) return;
      g.spassLaeuft = art; g.spassSek = 0; g.spassFehler = false; g.spassInfo = 'Sprich jetzt! 🎤 …';
      g.zeichnen();
      St.aufnehmen(art, { beiLaeuft: (s) => { g.spassSek = s; if (g.sichtbar && g.phase === 'fahrer') { const k = g.wurzel.querySelector('[data-g="spass:stopp"]'); if (k) k.textContent = `⏹ Stopp (${s.toFixed(1)} s)`; } } })
        .then((res) => {
          g.spassLaeuft = null;
          if (res.ok) { g.spassInfo = 'Gespeichert! Drück „Anhören“ – im Rennen kommt dein Ton. 🎉'; g.spassFehler = false; try { R.SpassStart.toastStil(); if (R.Spass.sticker) R.Spass.sticker('stimme'); } catch (e) { /* egal */ } }
          else { g.spassInfo = res.fehler; g.spassFehler = true; }
          if (g.sichtbar) g.zeichnen();
        });
    }
    const aktion = B.aktion;
    B.aktion = function (a) {
      if (typeof a === 'string' && a.startsWith('spass:')) {
        const [, was, art] = a.split(':');
        if (was === 'auf') aufnehmen(this, art);
        else if (was === 'stopp') St.stoppen();
        else if (was === 'hoer') { this.spassFehler = false; this.spassInfo = ''; St.vorhoeren(art); }
        else if (was === 'weg') { St.loeschen(art); this.spassInfo = 'Gelöscht – es gilt wieder der Standardklang.'; this.spassFehler = false; this.zeichnen(); }
        return;
      }
      return aktion.apply(this, arguments);
    };
    const taste = B.taste;
    B.taste = function (code) {
      if (this.phase === 'fahrer') {
        if (code === 'KeyU') { aufnehmen(this, 'hupe'); return true; }
        if (code === 'KeyI') { aufnehmen(this, 'jubel'); return true; }
      }
      return taste.apply(this, arguments);
    };
    const oeffnen = B.oeffnen;
    B.oeffnen = function () { this.spassInfo = ''; this.spassFehler = false; St.laden().then(() => { if (this.sichtbar && this.phase === 'fahrer') this.zeichnen(); }); return oeffnen.apply(this, arguments); };
  }

  R.SpassUI = { albumZeigen, albumZu, albumOffen };
})();
