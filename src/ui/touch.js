// ============================================================
// W5-3: Touch-Steuerung für Handy/Tablet (reines Add-on, Desktop bleibt bitgleich)
//
// - Erkennung: 'ontouchstart' in window || navigator.maxTouchPoints > 0  (URL ?touch=1 erzwingt, ?touch=0 sperrt)
//   v31 H4: Das reicht NICHT mehr für „Touch-UI an“ (Touch-Laptops!): Modus 'touch' nur bei (pointer: coarse) und ohne Tastendruck, siehe T.modus unten.
//   Ohne Touch tut diese Datei NICHTS (kein DOM, keine Haken): R.Touch = { aktiv: false }.
// - Bildschirm-Tasten im Rennen (lokal und online): links ◀ ▶ (Lenken), rechts ▲ Gas / ▼ Bremse+Rückwärts, unten Mitte
//   Item / Reset / Kamera, oben Pause (online: 🚪 = „Rennen verlassen?“) und 📱 Neigen (Neigungssteuerung, optional).
//   Pointer Events mit pointerId-Verwaltung: mehrere Finger gleichzeitig (Gas + Lenken), ein Finger kann von ◀ nach ▶ wischen.
// - Einbindung ohne Änderung an input.js/main.js: Input.prototype.steuerung(0) wird eingehüllt (Maximum aus Tastatur und Touch),
//   Einzeltasten werden als echte KeyboardEvents (event.code aus R.config.tasten) gesendet – dadurch laufen Pause, Kamera,
//   Reset, Item lokal UND online (online.rennTaste) über denselben Weg wie die Tastatur.
// - Menü: Karten antippen = wählen, zweites Tippen auf die gewählte Karte = weiter (nur allein); unten eine größere
//   Zurück/Weiter-Leiste (die vorhandene .m-nav, per CSS vergrößert); Vollbild-Taste ⛶ (nicht auf iPhone: dort gibt es keine API).
// - Mobil-Qualität: Spiel.prototype._startStufe wird um eine Stufe niedriger (pixelRatio 1,25 statt 1,5; adaptiv wie gehabt).
// - Hochformat: Overlay „Bitte Handy quer halten“. Viewport/Safe-Area per CSS (Meta-Tag steht in Autorennen.html).
// ============================================================
(function () {
  const R = window.Rennspiel;

  function erkennen() {
    let p = null;
    try { p = new URLSearchParams(location.search).get('touch'); } catch (e) { /* egal */ }
    if (p === '0') return false;
    if (p === '1') return true;
    return ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
  }

  const AKTIV = erkennen();     // Touch-Hardware da (Handy, Tablet, Touch-Laptop)? Nur dann wird das Modul überhaupt aufgebaut
  const T = R.Touch = { aktiv: AKTIV, modus: 'tastatur' };
  if (!AKTIV) return;

  // v31 H4: Welche EINGABE gilt? 'touch' = Bildschirm-Tasten + Handy-Layout, 'tastatur' = normales Desktop-HUD.
  // Ein Touch-Laptop (Windows, Chrome) meldet maxTouchPoints > 0, hat aber Tastatur/Touchpad (pointer: fine) → startet mit Tastatur.
  // Handy/Tablet (pointer: coarse) startet mit Touch. Erster echter Tastendruck (Pfeile/WASD) → Tastatur (gemerkt),
  // Berührung der Knopfzone im Rennen oder Knopf „🎮 Touch-Steuerung“ im Pausemenü/in den Einstellungen → Touch (gemerkt).
  // ?touch=1 erzwingt Touch (ohne Merken). Gemerkt wird in localStorage 'rennspiel.eingabe' ('tastatur' | 'touch').
  const SCHLUESSEL = 'rennspiel.eingabe';
  function gemerkt() { try { const v = window.localStorage.getItem(SCHLUESSEL); return v === 'touch' || v === 'tastatur' ? v : null; } catch (e) { return null; } }
  function merken(v) { try { window.localStorage.setItem(SCHLUESSEL, v); } catch (e) { /* egal */ } }
  function grobZeiger() { try { return !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches); } catch (e) { return false; } }
  (function () {
    let p = null;
    try { p = new URLSearchParams(location.search).get('touch'); } catch (e) { /* egal */ }
    T.modus = p === '1' ? 'touch' : (gemerkt() || (grobZeiger() ? 'touch' : 'tastatur'));
  })();
  T.an = () => T.modus === 'touch';

  const klemme = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  // ---------------------------------------------------------------- Zustand der Bildschirm-Tasten
  const halten = { links: false, rechts: false, gas: false, bremse: false };
  T.neigen = false;        // Neigungssteuerung an?
  T.neigung = 0;           // aktueller Lenkwert aus der Neigung (−1..1)
  T.zeigt = false;         // Bildschirm-Tasten sichtbar?

  /** Touch-Steuerwerte (wie input.steuerung): gas/bremse 0|1, lenkung −1..1. */
  T.werte = function () {
    let l = (halten.rechts ? 1 : 0) - (halten.links ? 1 : 0);
    if (T.neigen && Math.abs(T.neigung) > Math.abs(l)) l = T.neigung;
    return { gas: halten.gas ? 1 : 0, bremse: halten.bremse ? 1 : 0, lenkung: l };
  };

  /** Neigung (deviceorientation-Winkel in Grad) → Lenkwert. Die Lage „oben“ im Geräte-Koordinatensystem ist (−cosβ·sinγ, sinβ, cosβ·cosγ);
   *  im Querformat ist die Geräte-y-Achse die Bildschirm-Waagerechte: Drehen wie ein Lenkrad (rechts herum) = positive y-Komponente bei
   *  Bildschirmwinkel 90°, negative bei 270°. Voller Einschlag bei ±28°, Totzone 3°. */
  T.neigungZuLenkung = function (beta, gamma, winkel) {
    const uy = Math.sin(beta * Math.PI / 180);   // gamma geht (bei ZXY-Eulerwinkeln) nur in x und z ein
    const grad = Math.asin(klemme(uy, -1, 1)) * 180 / Math.PI * (winkel === 270 || winkel === -90 ? -1 : 1);
    if (Math.abs(grad) < 3) return 0;
    return klemme((grad - Math.sign(grad) * 3) / 25, -1, 1);
  };

  // Alles loslassen (Tasten ausgeblendet, Fenster verliert Fokus, pointercancel …)
  function allesLoslassen() {
    zeiger.clear();
    halten.links = halten.rechts = halten.gas = halten.bremse = false;
    T.neigung = T.neigen ? T.neigung : 0;
    farbenAktualisieren();
  }

  // ---------------------------------------------------------------- Tasten senden
  function tasteSenden(code) {
    const opt = { code, key: code, bubbles: true, cancelable: true };
    window.dispatchEvent(new KeyboardEvent('keydown', opt));
    setTimeout(() => window.dispatchEvent(new KeyboardEvent('keyup', opt)), 60);
    try { if (navigator.vibrate) navigator.vibrate(8); } catch (e) { /* egal */ }
  }
  T.tasteSenden = tasteSenden;

  // ---------------------------------------------------------------- Oberfläche
  const STIL = `
html.touch-an, html.touch-an body { overscroll-behavior: none; -webkit-touch-callout: none; -webkit-tap-highlight-color: transparent;
  -webkit-user-select: none; user-select: none; touch-action: manipulation; }
html.touch-an { --tb: clamp(64px, 24vh, 124px); --rand: max(10px, 2.4vh); --hf: max(11px, min(2.5vw, 2.78vh)); }
html.touch-an #spiel { position: fixed; inset: 0; width: 100%; height: 100%; touch-action: none; }
html.touch-an #ui { position: fixed; }
html.touch-an #huds { top: env(safe-area-inset-top); right: env(safe-area-inset-right); bottom: env(safe-area-inset-bottom); left: env(safe-area-inset-left); }

/* ---- Bildschirm-Tasten ---- */
#touch { position: fixed; top: env(safe-area-inset-top); right: env(safe-area-inset-right); bottom: env(safe-area-inset-bottom); left: env(safe-area-inset-left); z-index: 30; display: none; pointer-events: none; touch-action: none; }
html.t-rennen #touch { display: block; }
#touch .t-knopf { position: absolute; pointer-events: auto; touch-action: none; box-sizing: border-box; display: flex; align-items: center; justify-content: center;
  border-radius: 22px; border: 3px solid rgba(255,255,255,.6); background: rgba(255,255,255,.2); color: #fff; font: 900 calc(var(--tb) * .46)/1 Arial, sans-serif;
  text-shadow: 0 2px 4px rgba(0,0,0,.6); backdrop-filter: blur(2px); -webkit-backdrop-filter: blur(2px); cursor: pointer; }
#touch .t-knopf.an { background: rgba(255,255,255,.55); border-color: #fff; transform: scale(.96); }
#touch .t-knopf.gas { background: rgba(47,207,90,.34); border-color: rgba(190,255,205,.85); }
#touch .t-knopf.gas.an { background: rgba(47,207,90,.75); }
#touch .t-knopf.bremse { background: rgba(255,80,60,.30); border-color: rgba(255,200,190,.85); }
#touch .t-knopf.bremse.an { background: rgba(255,80,60,.72); }
#touch .t-knopf.klein { font-size: calc(var(--tb) * .34); border-radius: 18px; background: rgba(20,30,70,.45); }
#touch .t-knopf.klein.an { background: rgba(255,255,255,.55); }
#touch .t-knopf.item.hat { background: rgba(255,210,58,.6); border-color: #fff; animation: tItem .7s ease-in-out infinite alternate; }
#touch .t-knopf.item:not(.hat) { opacity: .5; }
#touch .t-knopf.neigen.ein { background: rgba(47,139,255,.7); border-color: #fff; }
@keyframes tItem { to { transform: scale(1.1); } }
#touch .t-links { left: var(--rand); bottom: var(--rand); width: var(--tb); height: var(--tb); }
#touch .t-rechts { left: calc(var(--rand) * 2 + var(--tb)); bottom: var(--rand); width: var(--tb); height: var(--tb); }
#touch .t-gas { right: var(--rand); bottom: var(--rand); width: calc(var(--tb) * 1.15); height: calc(var(--tb) * 1.15); font-size: calc(var(--tb) * .56); }
#touch .t-bremse { right: calc(var(--rand) * 2 + var(--tb) * 1.15); bottom: var(--rand); width: var(--tb); height: var(--tb); }
#touch .t-item { left: 50%; bottom: var(--rand); width: calc(var(--tb) * .8); height: calc(var(--tb) * .8); min-width: 64px; min-height: 64px;
  margin-left: calc(var(--tb) * -.4 - var(--tb) * .9); }
#touch .t-reset { left: 50%; bottom: var(--rand); width: calc(var(--tb) * .8); height: calc(var(--tb) * .8); min-width: 64px; min-height: 64px; margin-left: calc(var(--tb) * -.4); }
#touch .t-kamera { left: 50%; bottom: var(--rand); width: calc(var(--tb) * .8); height: calc(var(--tb) * .8); min-width: 64px; min-height: 64px; margin-left: calc(var(--tb) * .5); }
#touch .t-pause { top: var(--rand); left: 50%; width: 64px; height: 64px; margin-left: calc(var(--hf) * 2.6 + 14px); }
#touch .t-neigen { top: calc(var(--rand) + 70px); left: 50%; width: 64px; height: 64px; margin-left: calc(var(--hf) * 2.6 + 14px); font-size: 28px; }
html.t-neigt #touch .t-links, html.t-neigt #touch .t-rechts { opacity: .35; }

/* ---- HUD auf dem Handy: Karte/Tacho/Item weg von den Daumen ---- */
html.t-rennen .hud-minimap { left: auto !important; right: .6em !important; top: 8.4em; bottom: auto !important; width: 92px !important; height: 92px !important; }
html.t-rennen .hud-tacho { right: auto !important; left: .8em !important; bottom: calc(var(--tb) + var(--rand) * 2 + 4px) !important; }
html.t-rennen .hud-tacho .kmh b { font-size: 2.6em !important; }
html.t-rennen .hud-item { display: none !important; }
html.t-rennen .hud-hinweis { top: auto !important; bottom: 30% !important; }

/* ---- Menü auf dem Handy ---- */
html.touch-an .menue { font-size: clamp(11px, 3.1vh, 20px); padding: calc(env(safe-area-inset-top) + .8vh) calc(env(safe-area-inset-right) + 2vw) calc(env(safe-area-inset-bottom) + 1vh) calc(env(safe-area-inset-left) + 2vw); }
html.touch-an .menue .m-kopf { padding-right: 52px; gap: .3em .8em; }
html.touch-an .menue .m-titel { font-size: 1.6em; }
html.touch-an .menue .m-untertitel { display: none; }
html.touch-an .menue .m-inhalt { overflow-y: auto; overflow-x: hidden; justify-content: flex-start; touch-action: pan-y; -webkit-overflow-scrolling: touch; }
html.touch-an .menue .m-inhalt h1 { font-size: 1.4em; margin: .35em 0 .35em; }
html.touch-an .menue .m-hinweis { display: none; }
html.touch-an .menue .karte.gross { padding: .4em .5em; }
html.touch-an .menue .karte.gross .emoji { font-size: 2.3em; }
html.touch-an .menue .reihe { gap: .8em; }
html.touch-an .menue .garage-reihe { margin-top: .6em; }
html.touch-an .menue .m-fuss { justify-content: center; padding-top: .3em; }
html.touch-an .menue .m-nav { min-width: 0; width: 100%; justify-content: space-between; gap: 1em; }
html.touch-an .menue .m-nav .knopf { min-width: 9.5em; min-height: 48px; box-sizing: border-box; display: flex; align-items: center; justify-content: center; font-size: 1.25em; }
html.touch-an .menue .m-nav span:empty { flex: 0 0 1px; }
html.touch-an .karte, html.touch-an .pille, html.touch-an .rund, html.touch-an .knopf, html.touch-an .start-knopf { touch-action: manipulation; }
html.touch-an .pille { padding-top: .35em; padding-bottom: .35em; }
html.touch-an .rund { min-width: 2em; min-height: 2em; }
html.touch-an .online .on-tasten { grid-template-columns: repeat(11, 3.4em); gap: .35em; }
html.touch-an .online .on-tasten span { padding: .55em 0; font-size: 1em; }
html.touch-an .ergebnis, html.touch-an .pause { touch-action: pan-y; }

/* ---- Vollbild-Taste ---- */
#t-voll { position: fixed; top: max(6px, env(safe-area-inset-top)); right: max(6px, env(safe-area-inset-right)); z-index: 31; width: 46px; height: 46px; border-radius: 14px;
  display: none; align-items: center; justify-content: center; font-size: 26px; color: #fff; background: rgba(20,30,70,.65); border: 2px solid rgba(255,255,255,.7); cursor: pointer; }
html.touch-an:not(.t-rennen) #t-voll.geht { display: flex; }

/* ---- Hochformat: bitte drehen ---- */
#t-quer { position: fixed; inset: 0; z-index: 100; display: none; flex-direction: column; align-items: center; justify-content: center; gap: 16px;
  background: rgba(8,14,40,.97); color: #fff; font: 900 26px/1.25 Arial, sans-serif; text-align: center; padding: 24px; pointer-events: auto; touch-action: none; }
#t-quer .t-dreh { font-size: 90px; animation: tDreh 2.4s ease-in-out infinite; }
#t-quer small { font-size: 15px; font-weight: 700; opacity: .8; }
@keyframes tDreh { 0%, 15% { transform: rotate(0); } 55%, 100% { transform: rotate(-90deg); } }
@media (orientation: portrait) { html.touch-an #t-quer { display: flex; } }
`;

  let wurzel = null, knoepfe = {}, vollEl = null, wake = null;
  const zeiger = new Map();    // pointerId → Schlüssel des gehaltenen Knopfs

  const HALTEN = ['links', 'rechts', 'gas', 'bremse'];

  function aufbauen() {
    const st = document.createElement('style');
    st.textContent = STIL;
    document.head.appendChild(st);
    document.documentElement.classList.toggle('touch-an', T.modus === 'touch');

    wurzel = document.createElement('div');
    wurzel.id = 'touch';
    wurzel.innerHTML =
      '<div class="t-knopf t-links" data-t="links">◀</div><div class="t-knopf t-rechts" data-t="rechts">▶</div>' +
      '<div class="t-knopf gas t-gas" data-t="gas">▲</div><div class="t-knopf bremse t-bremse" data-t="bremse">▼</div>' +
      '<div class="t-knopf klein item t-item" data-t="item">⭐</div><div class="t-knopf klein t-reset" data-t="reset">↺</div>' +
      '<div class="t-knopf klein t-kamera" data-t="kamera">📷</div><div class="t-knopf klein t-pause" data-t="pause">⏸</div>' +
      '<div class="t-knopf klein neigen t-neigen" data-t="neigen" title="Neigungssteuerung">📱</div>';
    document.body.appendChild(wurzel);
    wurzel.querySelectorAll('[data-t]').forEach((e) => { knoepfe[e.dataset.t] = e; });

    const q = document.createElement('div');
    q.id = 't-quer';
    q.innerHTML = '<div class="t-dreh">📱</div><div>Bitte Handy quer halten 🔄</div><small>Das Rennen läuft im Querformat</small>';
    document.body.appendChild(q);

    // Vollbild: nur, wo es die Schnittstelle gibt (iPhone: nicht möglich → Taste bleibt weg)
    const de = document.documentElement;
    if (de.requestFullscreen || de.webkitRequestFullscreen) {
      vollEl = document.createElement('div');
      vollEl.id = 't-voll'; vollEl.className = 'geht'; vollEl.textContent = '⛶'; vollEl.title = 'Vollbild';
      document.body.appendChild(vollEl);
      vollEl.addEventListener('click', vollbildUmschalten);
    }

    // --- Zeiger ---
    wurzel.addEventListener('pointerdown', (e) => {
      const k = e.target.closest('[data-t]');
      if (!k) return;
      e.preventDefault();
      const art = k.dataset.t;
      if (HALTEN.indexOf(art) >= 0) {
        zeiger.set(e.pointerId, art);
        try { k.setPointerCapture(e.pointerId); } catch (err) { /* egal */ }
        halteNeu();
      } else if (art === 'neigen') {
        // iOS verlangt die Erlaubnis aus einer Berührung heraus: eigener Click-Weg (unten)
      } else {
        k.classList.add('an'); setTimeout(() => k.classList.remove('an'), 140);
        tippen(art);
      }
    });
    wurzel.addEventListener('click', (e) => {
      const k = e.target.closest('[data-t="neigen"]');
      if (k) neigenUmschalten();
    });
    window.addEventListener('pointermove', (e) => {
      if (!zeiger.has(e.pointerId)) return;
      // Finger wischt auf einen anderen Halte-Knopf (z. B. ◀ → ▶): umschalten; im Leeren: weiter am alten Knopf
      const alt = zeiger.get(e.pointerId);
      for (let i = 0; i < HALTEN.length; i++) {
        const r = knoepfe[HALTEN[i]].getBoundingClientRect();
        if (e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom) {
          if (HALTEN[i] !== alt) { zeiger.set(e.pointerId, HALTEN[i]); halteNeu(); }
          return;
        }
      }
    });
    const ende = (e) => { if (zeiger.delete(e.pointerId)) halteNeu(); };
    window.addEventListener('pointerup', ende);
    window.addEventListener('pointercancel', ende);
    window.addEventListener('blur', allesLoslassen);
    document.addEventListener('visibilitychange', () => { if (document.hidden) allesLoslassen(); });
    wurzel.addEventListener('contextmenu', (e) => e.preventDefault());
    // Kein Zoomen/Scrollen im Rennen (iOS: Pinch-Gesten)
    document.addEventListener('gesturestart', (e) => e.preventDefault());
    document.addEventListener('touchmove', (e) => { if (T.zeigt) e.preventDefault(); }, { passive: false });

    // Menü: zweites Tippen auf die gewählte Karte = weiter (nur allein; zu zweit wählen zwei Spieler nacheinander)
    document.addEventListener('click', (e) => {
      const s = R.spiel;
      if (!s || !s.menue || !s.menue.sichtbar || s.zustand !== 'menue') return;
      const k = e.target.closest && e.target.closest('.karte.gewaehlt[data-a]');
      if (!k || s.menue.zwei) return;
      const art = (k.dataset.a || '').split(':')[0];
      if (art !== 'strecke' && art !== 'fahrer' && art !== 'auto') return;
      e.stopPropagation(); e.preventDefault();
      s.menue.weiter();
    }, true);
  }

  function halteNeu() {
    const aktiv = { links: false, rechts: false, gas: false, bremse: false };
    zeiger.forEach((art) => { aktiv[art] = true; });
    HALTEN.forEach((k) => { halten[k] = aktiv[k]; });
    farbenAktualisieren();
  }
  function farbenAktualisieren() {
    HALTEN.forEach((k) => { if (knoepfe[k]) knoepfe[k].classList.toggle('an', halten[k]); });
  }

  function tippen(art) {
    const C = R.config.tasten;
    const code = { item: C.item1, reset: C.resetSpieler1, kamera: C.kamera, pause: C.pause }[art];
    if (code) tasteSenden(code);
  }

  function vollbildUmschalten() {
    const de = document.documentElement;
    try {
      if (!(document.fullscreenElement || document.webkitFullscreenElement)) (de.requestFullscreen || de.webkitRequestFullscreen).call(de);
      else (document.exitFullscreen || document.webkitExitFullscreen).call(document);
    } catch (e) { /* egal */ }
  }

  // ---------------------------------------------------------------- Neigungssteuerung
  function neigungsLeser(e) {
    if (e.beta === null || e.beta === undefined) return;
    const w = (screen.orientation && typeof screen.orientation.angle === 'number') ? screen.orientation.angle : (window.orientation || 90);
    T.neigung = T.neigungZuLenkung(e.beta, e.gamma || 0, w === 270 || w === -90 ? 270 : 90);
  }
  async function neigenUmschalten() {
    if (T.neigen) {
      T.neigen = false; T.neigung = 0;
      window.removeEventListener('deviceorientation', neigungsLeser);
    } else {
      try {
        if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
          const r = await DeviceOrientationEvent.requestPermission();
          if (r !== 'granted') return;
        }
      } catch (e) { return; }
      T.neigen = true;
      window.addEventListener('deviceorientation', neigungsLeser);
    }
    document.documentElement.classList.toggle('t-neigt', T.neigen);
    if (knoepfe.neigen) knoepfe.neigen.classList.toggle('ein', T.neigen);
  }
  T.neigenUmschalten = neigenUmschalten;

  // ---------------------------------------------------------------- Zustand beobachten (10 Hz)
  function sichtbar(el) { return !!el && el.style.display !== 'none'; }

  function umgebung() {
    const s = R.spiel;
    if (!s) return { rennen: false, online: false };
    const on = s.zustand === 'online' && s.online && s.online.phase === 'rennen' && !s.online.dialog;
    const lokal = s.zustand === 'rennen' && !s.pausiert && !(s.pokalAnzeige && s.pokalAnzeige.offen && s.pokalAnzeige.offen()) && s.huds && s.huds.length > 0;
    return { rennen: !!(on || lokal), online: s.zustand === 'online', s };
  }

  let letzteOnline = null;
  let menueGebunden = false;
  /** Letzter Menü-Schritt: in der Leiste unten zusätzlich „🏁 Los!“ (sonst müsste man bis zum Start-Knopf scrollen). */
  function menueBinden() {
    const menue = document.getElementById('menue');
    if (!menue) return;
    menueGebunden = true;
    new MutationObserver(() => {
      const nav = menue.querySelector('.m-nav');
      if (T.modus !== 'touch' || !nav || nav.querySelector('[data-a="start"]') || !menue.querySelector('.start-knopf')) return;   // v31: im Tastatur-Modus keine Extra-Taste
      const k = document.createElement('div');
      k.className = 'knopf klein gruen'; k.dataset.a = 'start'; k.dataset.tLos = '1'; k.textContent = '🏁 Los!';
      nav.appendChild(k);
    }).observe(menue, { childList: true });
  }

  let imRennen = false;   // läuft gerade ein Rennen (unabhängig davon, ob die Tasten gezeigt werden)?

  /** v31: einmaliger Hinweis (3 s) bei Touch-Hardware ohne Touch-UI (z. B. iPad mit Tastatur/Maus): so kommt man zu den Knöpfen. */
  let hinweisGezeigt = false;
  function tippHinweis() {
    if (hinweisGezeigt) return;
    hinweisGezeigt = true;
    const h = document.createElement('div');
    h.id = 't-tipp'; h.textContent = '👆 Tippen unten = Touch-Steuerung';
    h.style.cssText = 'position:fixed;left:50%;bottom:24%;transform:translateX(-50%);z-index:29;pointer-events:none;white-space:nowrap;font:900 2em/1.2 Arial,sans-serif;color:#fff;' +
      'padding:.25em .8em;border-radius:2em;background:linear-gradient(90deg,#ff5fa2,#a66bff);box-shadow:0 4px 14px rgba(0,0,0,.4);';
    document.body.appendChild(h);
    setTimeout(() => { h.remove(); }, 3000);
  }

  /** Eingabeart wechseln ('touch' | 'tastatur'); merken = in localStorage ablegen. */
  function modusSetzen(m, merk) {
    if (m !== 'touch' && m !== 'tastatur') return;
    if (merk !== false) merken(m);
    if (m === T.modus) return;
    T.modus = m;
    document.documentElement.classList.toggle('touch-an', m === 'touch');
    if (m !== 'touch') { allesLoslassen(); document.querySelectorAll('[data-t-los]').forEach((k) => k.remove()); }
    beobachten();
    knopfBeschriften();
  }
  T.modusSetzen = modusSetzen;

  function beobachten() {
    if (!menueGebunden) menueBinden();
    if (!beobachtet.pause || !beobachtet.menue) eingabeKnoepfe();
    const u = umgebung(), de = document.documentElement;
    const warRennen = imRennen;
    imRennen = !!u.rennen;
    if (imRennen && !warRennen && T.modus !== 'touch') tippHinweis();
    const sicht = u.rennen && T.modus === 'touch';
    if (sicht !== T.zeigt) {
      T.zeigt = sicht;
      de.classList.toggle('t-rennen', T.zeigt);
      if (!T.zeigt) allesLoslassen();
      wachhalten(T.zeigt);
    }
    if (!sicht) return;
    if (letzteOnline !== u.online) {
      letzteOnline = u.online;
      knoepfe.pause.textContent = u.online ? '🚪' : '⏸';
      knoepfe.pause.title = u.online ? 'Rennen verlassen' : 'Pause';
    }
    // Item-Taste: 🛢️ gelb, solange das Auto ein Item hält (sonst ⭐ blass)
    let hat = false;
    try {
      const s = u.s, i = s.fahrzeuge.findIndex((f) => f.istSpieler && f.spielerNr === 0);
      hat = !u.online && !!(s.pickups && i >= 0 && s.pickups.itemVon(i));
    } catch (e) { hat = false; }
    knoepfe.item.classList.toggle('hat', hat);
    const sym = hat ? '🛢️' : '⭐';
    if (knoepfe.item.textContent !== sym) knoepfe.item.textContent = sym;
    // Tastenhinweise im HUD an Touch anpassen
    document.querySelectorAll('.hud-hinweis').forEach((h) => {
      if (/Festgefahren\? [RT] drücken/.test(h.textContent)) h.textContent = 'Festgefahren? Tippe ↺';
    });
    // Online: Server kennt Items; Taste bleibt sichtbar, Wirkung entscheidet der Server
  }

  async function wachhalten(an) {
    try {
      if (an && navigator.wakeLock && !wake) wake = await navigator.wakeLock.request('screen');
      else if (!an && wake) { const w = wake; wake = null; await w.release(); }
    } catch (e) { wake = null; }
  }

  // ---------------------------------------------------------------- Haken in bestehende Teile (nur auf Touch-Geräten)
  // 1) Eingabe: Maximum aus Tastatur und Touch (nur Spieler 0)
  if (R.Input && R.Input.prototype && !R.Input.prototype._touchEingehuellt) {
    const orig = R.Input.prototype.steuerung;
    R.Input.prototype.steuerung = function (spielerIndex) {
      const s = orig.call(this, spielerIndex);
      if (spielerIndex !== 0) return s;
      const t = T.werte();
      return {
        gas: Math.max(s.gas, t.gas),
        bremse: Math.max(s.bremse, t.bremse),
        lenkung: Math.abs(t.lenkung) > Math.abs(s.lenkung) ? t.lenkung : s.lenkung,
      };
    };
    R.Input.prototype._touchEingehuellt = true;
  }

  // 3) v31 H4: Eingabeart erkennen und umschalten
  const TASTEN = /^(Arrow(Up|Down|Left|Right)|Key[WASD])$/;
  window.addEventListener('keydown', (e) => {
    // Nur echte Tasten (die Bildschirm-Tasten senden selbst KeyboardEvents, isTrusted = false)
    if (e.isTrusted && TASTEN.test(e.code) && T.modus !== 'tastatur') modusSetzen('tastatur');
  }, true);
  window.addEventListener('pointerdown', (e) => {
    // Erste Berührung der Knopfzone (untere Bildhälfte) im Rennen blendet die Tasten wieder ein
    if (e.isTrusted && e.pointerType === 'touch' && T.modus !== 'touch' && imRennen && e.clientY > innerHeight * 0.5) modusSetzen('touch');
  }, true);

  // Knopf „🎮 Touch-Steuerung an/aus“ im Pausemenü (#pause) und in den Einstellungen (Menü-Schritt 5, neben „Ton“)
  function knopfText() { return '🎮 Touch-Steuerung: ' + (T.modus === 'touch' ? 'an' : 'aus'); }
  function knopfBeschriften() { document.querySelectorAll('[data-eingabe]').forEach((k) => { k.textContent = knopfText(); }); }
  function knoepfeEinfuegen() {
    const pause = document.querySelector('#pause .pause-karte');
    if (pause && !pause.querySelector('[data-eingabe]')) {
      const k = document.createElement('div');
      k.className = 'knopf blau'; k.dataset.eingabe = '1'; k.textContent = knopfText();
      pause.appendChild(k);
    }
    const akt = document.querySelector('#menue .m-aktionen');
    if (akt && !akt.querySelector('[data-eingabe]')) {
      const k = document.createElement('div');
      k.className = 'knopf klein ton'; k.dataset.eingabe = '1'; k.textContent = knopfText();
      akt.appendChild(k);
    }
  }
  const beobachtet = {};
  function eingabeKnoepfe() {   // läuft im 10-Hz-Takt, bis #pause und #menue (von main.js später angelegt) beobachtet werden
    ['pause', 'menue'].forEach((id) => {
      const w = document.getElementById(id);
      if (w && !beobachtet[id]) { beobachtet[id] = true; new MutationObserver(knoepfeEinfuegen).observe(w, { childList: true, subtree: true }); knoepfeEinfuegen(); }
    });
  }
  document.addEventListener('click', (e) => {
    const k = e.target.closest && e.target.closest('[data-eingabe]');
    if (!k) return;
    e.stopPropagation(); e.preventDefault();
    modusSetzen(T.modus === 'touch' ? 'tastatur' : 'touch');
  }, true);

  function start() {
    aufbauen();
    // 2) Qualität: eine Stufe niedriger (pixelRatio 1,25 statt 1,5; die adaptive Regelung läuft wie gehabt darunter weiter)
    if (R.Spiel && R.Spiel.prototype && !R.Spiel.prototype._touchStufe) {
      const orig = R.Spiel.prototype._startStufe;
      R.Spiel.prototype._startStufe = function () {
        const st = R.config.grafik.qualitaetsStufen, i = orig.call(this);
        if (T.modus !== 'touch') return i;   // Tastatur-Modus (Touch-Laptop): Desktop-Qualität
        return Math.min(st.length - 1, i + 1);
      };
      R.Spiel.prototype._touchStufe = true;
    }
    setInterval(beobachten, 100);
  }
  // Vor main.js' eigenem DOMContentLoaded-Handler laufen (Script-Reihenfolge), damit der Haken vor dem ersten Rendern sitzt
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
