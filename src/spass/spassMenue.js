// ============================================================
// Spaß-Paket S4 – Teil A: Menü-Platz (läuft ganz am Ende; nur Umhüllung von R.Menue.zeichnen, keine Spiellogik).
//   Im Schritt „Los!“ ist der Inhalt (m-inhalt) scrollbar, die Fußleiste (Zurück / Hinweis) bleibt fest unten, der Start-Knopf (Zeile Start/Ton/Steuerung/Grafik) steht fest über der Fußleiste und die Zeile mit dem Tastatur-Fokus wird automatisch in den Sichtbereich gescrollt. Scrollstand bleibt beim Neuzeichnen erhalten.
//   Gilt für 1100×650, 1280×800 und Handy quer (844×390); hochkant zeigt das Spiel „Bitte Handy quer halten“.
// Teil B (Modus-Karten Kurz-Level / Freie Fahrt / K.-o.-Rallye) hängt weiter unten in dieser Datei an.
// ============================================================
(function () {
  const R = window.Rennspiel;
  if (!R || !R.Menue || typeof document === 'undefined') return;
  const M = R.Menue.prototype;

  function stil() {
    if (document.getElementById('spass-menue-stil')) return;
    const s = document.createElement('style'); s.id = 'spass-menue-stil';
    s.textContent =
      '.m-inhalt.m-scroll{overflow-y:auto;overflow-x:hidden;justify-content:flex-start;scrollbar-width:thin;-webkit-overflow-scrolling:touch;overscroll-behavior:contain}' +
      '.m-inhalt.m-scroll>:first-child{margin-top:auto}.m-inhalt.m-scroll>.m-start,.m-inhalt.m-scroll>.garage-reihe{margin-bottom:auto;flex:0 0 auto}' +
      '.m-aktionen.m-fest{flex:0 0 auto;padding:.3em .8em;margin:.2em 0;border-radius:1em;background:rgba(14,24,58,.88);align-self:center}' +
      '.m-inhalt.m-scroll h1{flex:0 0 auto}.m-inhalt{position:relative}' +
      '.m-mehr{position:absolute;left:50%;bottom:.2em;transform:translateX(-50%);z-index:5;padding:.1em .8em;border-radius:1em;background:var(--gelb,#ffd23a);color:#1a2550;font-size:.75em;font-weight:900;cursor:pointer;box-shadow:0 .1em .4em rgba(0,0,0,.5)}' +
      '.m-aktionen.m-fest{flex-wrap:nowrap;gap:.5em}.m-aktionen.m-fest .start-knopf{font-size:1.15em;padding:.25em .8em;min-width:0;flex:1 1 auto;white-space:nowrap}' +
      '.m-aktionen.m-fest .knopf.klein{font-size:.78em;padding:.25em .6em;white-space:nowrap}.m-aktionen.m-fest .knopf kbd{display:none}' +
      '@media (max-height:720px){.m-inhalt.m-scroll h1{font-size:1.3em;margin-bottom:.2em}.m-inhalt.m-scroll .m-start{font-size:.86em}' +
      '.m-inhalt.m-scroll .karte.gross{padding:.35em .5em}.m-inhalt.m-scroll .karte.gross .emoji{font-size:2.2em}.m-inhalt.m-scroll .karte.gross .karten-sub{font-size:.8em}.m-inhalt.m-scroll .reihe{gap:.9em}}';
    document.head.appendChild(s);
  }

  /** Gelber Knopf „▼ weitere Schalter“, solange unten noch etwas verborgen ist. */
  function mehrHinweis(inh) {
    const mehr = document.createElement('div'); mehr.className = 'm-mehr'; mehr.textContent = '▼ mehr'; mehr.style.display = 'none';
    mehr.addEventListener('click', (ev) => { ev.stopPropagation(); inh.scrollTo({ top: inh.scrollHeight, behavior: 'smooth' }); });
    inh.appendChild(mehr);
    const hinweis = () => { mehr.style.display = inh.scrollHeight > inh.clientHeight + 6 && inh.scrollTop + inh.clientHeight < inh.scrollHeight - 6 ? '' : 'none'; };
    inh.addEventListener('scroll', hinweis, { passive: true }); setTimeout(hinweis, 0); setTimeout(hinweis, 400);
  }

  const zeichnen = M.zeichnen;
  M.zeichnen = function () {
    const vorher = this.wurzel && this.wurzel.querySelector('.m-inhalt');
    const top = vorher ? vorher.scrollTop : 0, war = !!(vorher && vorher.classList.contains('m-scroll'));
    const r = zeichnen.apply(this, arguments);
    try {
      if (!this.sichtbar) return r;
      stil();
      const inh = this.wurzel.querySelector('.m-inhalt');
      if (!inh) return r;
      const imStart = !!inh.querySelector('.m-start');
      inh.classList.toggle('m-scroll', imStart);
      if (imStart) {
        const ak = inh.querySelector('.m-aktionen');      // Start-Knopf/Ton/Steuerung/Grafik: fest zwischen Inhalt und Fußleiste (scrollt nie weg)
        if (ak) { ak.classList.add('m-fest'); inh.parentNode.insertBefore(ak, inh.nextSibling); }
        if (war) inh.scrollTop = top;
        const f = inh.querySelector('.fokus');
        mehrHinweis(inh);
        if (f) {                                        // Fokus-Zeile sichtbar halten (sticky Start-Knopf unten freilassen)
          const a = inh.getBoundingClientRect(), b = f.getBoundingClientRect(), frei = 6;
          if (b.top < a.top + 4) inh.scrollTop -= (a.top + 4 - b.top);
          else if (b.bottom > a.bottom - frei) inh.scrollTop += (b.bottom - (a.bottom - frei));
        }
      }
    } catch (err) { console.error('Spaß S4 (Menü):', err); }
    return r;
  };

  // ============================================================
  // Teil B: Modus-Karten „⭐ Kurz-Level“, „🗺️ Freie Fahrt“, „🏁 K.-o.-Rallye“ im Schritt „Modus“
  //   e.spassModus ('' | 'kurz' | 'frei' | 'ko') – nur im Arbeitsspeicher (nicht in den gespeicherten Einstellungen). Ein Klick/Enter auf eine normale Karte löscht ihn.
  //   Tasten: ←→ wie bisher über die vier Karten (+ Online); ↓ springt in die Spaß-Reihe (Kurz-Level), dort ←→ im Kreis, ↑ zurück zu „Allein“.
  //   Kurz-Level: Enter/Klick öffnet die Level-Übersicht (Fahrer/Fahrzeug wie zuletzt gewählt, „ändern“ führt zu Schritt 3).
  //   Freie Fahrt/K.-o.: weiter wie gewohnt (Strecke, Fahrer, Fahrzeug, Los!); im Schritt „Los!“ erklärt ein Hinweis, was gilt. Kurz-Level und Freie Fahrt nur allein.
  // ============================================================
  const INFO = {
    kurz: { emoji: '⭐', name: 'Kurz-Level', sub: '12 kurze Aufgaben mit 1–3 Sternen' },
    frei: { emoji: '🗺️', name: 'Freie Fahrt', sub: 'Ohne Gegner: finde die ❓-Kisten' },
    ko: { emoji: '🏁', name: 'K.-o.-Rallye', sub: 'An jeder Wertung fliegt der Letzte raus' },
  };
  const ARTEN = ['kurz', 'frei', 'ko'];
  function stilB() {
    if (document.getElementById('spass-menue-stil-b')) return;
    const s = document.createElement('style'); s.id = 'spass-menue-stil-b';
    s.textContent =
      '.s4-reihe{display:flex;gap:.8em;justify-content:center;flex-wrap:wrap;margin-top:.7em;width:100%}' +
      '.karte.s4-karte{display:flex;align-items:center;gap:.6em;text-align:left;padding:.4em .9em;min-width:12em;max-width:15.5em;flex:1 1 11em}' +
      '.karte.s4-karte .emoji{font-size:2.1em;line-height:1}.karte.s4-karte .karten-sub{font-size:.78em;margin-top:.15em}' +
      '.karte.s4-karte.gewaehlt{border-color:var(--gelb);background:rgba(40,60,130,.85)}' +
      '.m-modushinweis{margin:.1em auto .4em;padding:.25em .9em;border-radius:1em;background:rgba(255,210,58,.22);border:.1em solid var(--gelb);font-size:.85em;text-align:center;max-width:46em}';
    document.head.appendChild(s);
  }
  const modusSetzen = (menue, art) => {
    const e = menue.e;
    e.spassModus = art; menue.onlineGewaehlt = false;
    if (art === 'kurz' || art === 'frei') e.modus = 'solo';          // allein
    e.spielart = 'rennen';
  };

  const htmlModus = M.htmlModus;
  M.htmlModus = function () {
    let h = htmlModus.apply(this, arguments);
    try {
      stilB();
      const art = this.e.spassModus || '';
      if (art && !this.onlineGewaehlt) h = h.split(' gewaehlt').join('');
      const kk = ARTEN.map((k) => `<div class="karte s4-karte${art === k && !this.onlineGewaehlt ? ' gewaehlt' : ''}" data-a="spassmodus:${k}" title="${INFO[k].sub}">` +
        `<div class="emoji">${INFO[k].emoji}</div><div><div class="karten-name">${INFO[k].name}</div><div class="karten-sub">${INFO[k].sub}</div></div></div>`).join('');
      h += `<div class="s4-reihe">${kk}</div>`;
    } catch (err) { console.error('Spaß S4 (Modus-Karten):', err); }
    return h;
  };

  const modusKarte = M.modusKarte;
  M.modusKarte = function (k) {
    if (this.e && ARTEN.indexOf(k) < 0) this.e.spassModus = '';       // normale Karte (inkl. online) → Spaß-Modus aus
    return modusKarte.apply(this, arguments);
  };

  const aktion = M.aktion;
  M.aktion = function (a) {
    if (typeof a === 'string' && a.startsWith('spassmodus:')) {
      const art = a.split(':')[1];
      if (R.Audio) R.Audio.menueKlick();
      modusSetzen(this, art);
      if (art === 'kurz') { this.zeichnen(); if (R.SpassModi.kurzUebersicht) R.SpassModi.kurzUebersicht(this.spiel); return; }
      this.einstellungenFix();
      this.schritt = 1; this.fokus = 0; this.zeichnen();
      return;
    }
    return aktion.apply(this, arguments);
  };

  const weiter = M.weiter;
  M.weiter = function () {
    const art = this.e.spassModus;
    if (this.schritt === 0 && art === 'kurz' && !this.onlineGewaehlt) { if (R.SpassModi.kurzUebersicht) R.SpassModi.kurzUebersicht(this.spiel); return; }
    return weiter.apply(this, arguments);
  };

  const starten = M.starten;
  M.starten = function () {
    const art = this.e.spassModus;
    if (art === 'kurz') { if (R.SpassModi.kurzUebersicht) R.SpassModi.kurzUebersicht(this.spiel); return; }
    this.spiel._s4Modus = art ? { art } : null;                       // Spaß-Modus (oder keiner: normales Rennen)
    return starten.apply(this, arguments);
  };

  const taste = M.taste;
  M.taste = function (code) {
    try {
      if (this.schritt === 0 && !R.SpassModi.offen()) {
        const T = R.config.tasten, sp = T.spieler, art = this.e.spassModus || '';
        const links = code === sp[0].links || code === sp[1].links, rechts = code === sp[0].rechts || code === sp[1].rechts;
        const runter = code === sp[0].bremse || code === sp[1].bremse, hoch = code === sp[0].gas || code === sp[1].gas;
        if (art && (links || rechts)) {                              // innerhalb der Spaß-Reihe im Kreis
          modusSetzen(this, ARTEN[(ARTEN.indexOf(art) + (rechts ? 1 : ARTEN.length - 1)) % ARTEN.length]); this.aenderung(); return true;
        }
        if (art && hoch) { this.modusKarte('solo'); this.aenderung(); return true; }      // ↑ zurück zu den normalen Karten
        if (!art && runter) { modusSetzen(this, 'kurz'); this.aenderung(); return true; } // ↓ in die Spaß-Reihe
      }
    } catch (err) { console.error('Spaß S4 (Modus-Tasten):', err); }
    return taste.apply(this, arguments);
  };

  // Hinweis im Schritt „Los!“ und Scroll-Kante für den Modus-Schritt
  const htmlStart = M.htmlStart;
  M.htmlStart = function () {
    let h = htmlStart.apply(this, arguments);
    try {
      const art = this.e.spassModus;
      if (art === 'frei' || art === 'ko') {
        stilB();
        const t = art === 'frei' ? '🗺️ <b>Freie Fahrt:</b> keine Gegner, kein Rennende – fahr herum und finde die 12 ❓-Kisten. (Gegner und Runden gelten hier nicht.)'
          : '🏁 <b>K.-o.-Rallye:</b> bei jeder Wertung fliegt der Letzte raus, bis zwei übrig sind – die Runden ergeben sich aus den Gegnern (mindestens 3). Computer-Gegner und Stärke stellst du hier ein.';
        h = h.replace('<div class="m-spalten"', `<div class="m-modushinweis">${t}</div><div class="m-spalten"`);
      }
    } catch (err) { console.error('Spaß S4 (Los-Hinweis):', err); }
    return h;
  };
  // Modus-Schritt: auch hier scrollbar (viele Karten bei 1100×650), gewählte Karte sichtbar halten
  const zeichnen2 = M.zeichnen;
  M.zeichnen = function () {
    const r = zeichnen2.apply(this, arguments);
    try {
      if (!this.sichtbar) return r;
      const inh = this.wurzel.querySelector('.m-inhalt');
      if (inh && inh.querySelector('.garage-reihe')) {
        inh.classList.add('m-scroll'); mehrHinweis(inh);
        const g = inh.querySelector('.karte.gewaehlt:last-of-type, .karte.gewaehlt');
        if (g) { const a = inh.getBoundingClientRect(), b = g.getBoundingClientRect(); if (b.bottom > a.bottom) inh.scrollTop += b.bottom - a.bottom + 6; else if (b.top < a.top) inh.scrollTop -= a.top - b.top + 6; }
      }
    } catch (err) { /* nur Optik */ }
    return r;
  };
})();
