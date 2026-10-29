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
      '.m-inhalt.m-scroll>.m-start{margin:auto 0;flex:0 0 auto}' +
      '.m-aktionen.m-fest{flex:0 0 auto;padding:.3em .8em;margin:.2em 0;border-radius:1em;background:rgba(14,24,58,.88);align-self:center}' +
      '.m-inhalt.m-scroll h1{flex:0 0 auto}' +
      '.m-aktionen.m-fest{flex-wrap:nowrap;gap:.5em}.m-aktionen.m-fest .start-knopf{font-size:1.15em;padding:.25em .8em;min-width:0;flex:1 1 auto;white-space:nowrap}' +
      '.m-aktionen.m-fest .knopf.klein{font-size:.78em;padding:.25em .6em;white-space:nowrap}.m-aktionen.m-fest .knopf kbd{display:none}' +
      '@media (max-height:720px){.m-inhalt.m-scroll h1{font-size:1.3em;margin-bottom:.2em}.m-inhalt.m-scroll .m-start{font-size:.86em}}';
    document.head.appendChild(s);
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
        const f = inh.querySelector('.fokus, .start-knopf.fokus');
        if (f) {                                        // Fokus-Zeile sichtbar halten (sticky Start-Knopf unten freilassen)
          const a = inh.getBoundingClientRect(), b = f.getBoundingClientRect(), frei = 6;
          if (b.top < a.top + 4) inh.scrollTop -= (a.top + 4 - b.top);
          else if (b.bottom > a.bottom - frei) inh.scrollTop += (b.bottom - (a.bottom - frei));
        }
      }
    } catch (err) { console.error('Spaß S4 (Menü):', err); }
    return r;
  };
})();
