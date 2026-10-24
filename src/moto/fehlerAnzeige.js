// ============================================================
// Fehler-Anzeige (Motorrad, 24.10.2026): zeigt Fehler sichtbar als Text über dem Spiel an, damit man auf dem
// iPhone/Tablet ohne Entwickler-Konsole sieht, warum das Bild schwarz bleibt.
// Wird in Motorrad.html als ALLERERSTES Skript geladen (vor three.js), damit auch Ladefehler späterer Skripte
// (404, Syntaxfehler) erfasst werden. Erfasst:
//   - window 'error' (Skriptfehler) und Ladefehler von <script>/<link> (Capture-Phase)
//   - 'unhandledrejection' (Promise-Fehler)
//   - WebGL 'webglcontextlost' auf dem Spiel-Canvas
//   - Startwächter: steht nach 10 s weder Menü noch Spiel, kommt ein Hinweis mit Geräte-Infos
// Nur Anzeige, ändert nichts am Spiel. Schließen per Tippen auf „✕“.
// ============================================================
(function () {
  if (window.__motoFehlerAnzeige) return;
  window.__motoFehlerAnzeige = true;
  const zeilen = [];
  let box = null, liste = null;

  function boxBauen() {
    if (box || !document.body) return;
    box = document.createElement('div');
    box.id = 'moto-fehler';
    box.style.cssText = 'position:fixed;left:8px;right:8px;top:8px;max-height:60vh;overflow:auto;z-index:2147483647;' +
      'background:rgba(20,0,0,.92);color:#fff;font:13px/1.4 -apple-system,system-ui,sans-serif;padding:10px 12px;' +
      'border:2px solid #ff5a5a;border-radius:10px;white-space:pre-wrap;word-break:break-word;-webkit-user-select:text;user-select:text';
    const kopf = document.createElement('div');
    kopf.style.cssText = 'display:flex;justify-content:space-between;align-items:center;font-weight:700;margin-bottom:6px';
    kopf.innerHTML = '<span>⚠️ Fehler im Motorrad-Spiel (Foto davon hilft beim Beheben)</span>';
    const zu = document.createElement('span');
    zu.textContent = '✕'; zu.style.cssText = 'cursor:pointer;padding:4px 10px;font-size:18px';
    zu.addEventListener('click', () => { box.style.display = 'none'; });
    kopf.appendChild(zu);
    liste = document.createElement('div');
    box.appendChild(kopf); box.appendChild(liste);
    document.body.appendChild(box);
  }

  function zeigen(text) {
    const t = String(text).slice(0, 600);
    if (zeilen.indexOf(t) >= 0 || zeilen.length > 25) return;     // keine Wiederholungen, keine Flut
    zeilen.push(t);
    const rein = () => {
      boxBauen();
      if (!liste) return;
      box.style.display = 'block';
      const z = document.createElement('div');
      z.style.cssText = 'border-top:1px solid rgba(255,255,255,.2);padding:4px 0';
      z.textContent = t;
      liste.appendChild(z);
    };
    if (document.body) rein(); else document.addEventListener('DOMContentLoaded', rein);
  }
  window.motoFehlerZeigen = zeigen;

  function kurzPfad(u) { try { return new URL(u, location.href).pathname; } catch (e) { return String(u); } }

  // Skriptfehler + Ladefehler (Capture: Ladefehler von <script>/<link>/<img> blubbern nicht)
  window.addEventListener('error', function (e) {
    const el = e && e.target;
    if (el && el !== window && (el.tagName === 'SCRIPT' || el.tagName === 'LINK' || el.tagName === 'IMG')) {
      zeigen('Datei nicht geladen: ' + kurzPfad(el.src || el.href));
      return;
    }
    const ort = e.filename ? ' (' + kurzPfad(e.filename) + ':' + (e.lineno || '?') + ':' + (e.colno || '?') + ')' : '';
    const stapel = e.error && e.error.stack ? '\n' + String(e.error.stack).split('\n').slice(0, 4).join('\n') : '';
    zeigen('Fehler: ' + (e.message || e.error || 'unbekannt') + ort + stapel);
  }, true);

  window.addEventListener('unhandledrejection', function (e) {
    const g = e && e.reason;
    zeigen('Promise-Fehler: ' + (g && (g.message || g.name) ? (g.name || '') + ' ' + (g.message || '') : String(g)) +
      (g && g.stack ? '\n' + String(g.stack).split('\n').slice(0, 3).join('\n') : ''));
  });

  // WebGL-Verlust auf dem Spiel-Canvas
  function canvasBeobachten() {
    const c = document.getElementById('spiel');
    if (!c || c.__motoFehlerHorcht) return;
    c.__motoFehlerHorcht = true;
    c.addEventListener('webglcontextlost', () => zeigen('WebGL-Grafik verloren (zu wenig Grafikspeicher?). Seite neu laden.'));
    c.addEventListener('webglcontextrestored', () => zeigen('WebGL-Grafik wiederhergestellt.'));
  }
  document.addEventListener('DOMContentLoaded', canvasBeobachten);

  // Startwächter: nach 10 s muss das Spiel (R.spiel) oder das Menü existieren
  window.addEventListener('load', function () {
    canvasBeobachten();
    setTimeout(function () {
      const R = window.Rennspiel;
      const laeuft = R && R.spiel;
      const menue = document.getElementById('menue') || document.querySelector('.m-kopf');
      if (laeuft || menue) return;
      let webgl = 'nein';
      try {
        const t = document.createElement('canvas');
        webgl = t.getContext('webgl2') ? 'WebGL2' : (t.getContext('webgl') ? 'nur WebGL1' : 'nein');
      } catch (err) { webgl = 'Fehler: ' + err.message; }
      const fehlt = [];
      if (!window.THREE) fehlt.push('three.js');
      if (!R) fehlt.push('Rennspiel'); else {
        ['config', 'carCatalog', 'carBuilder', 'Spiel'].forEach((k) => { if (!R[k]) fehlt.push(k); });
      }
      zeigen('Spiel ist nach 10 s nicht gestartet.\nWebGL: ' + webgl + ' · fehlt: ' + (fehlt.join(', ') || 'nichts') +
        '\nBildschirm: ' + innerWidth + '×' + innerHeight + ' @' + (window.devicePixelRatio || 1) + '\nGerät: ' + navigator.userAgent);
    }, 10000);
  });
})();
