// ============================================================
// Rückspiegel (14.10. v21): echtes Rückbild. Eine zweite Kamera am Auto schaut nach hinten und rendert in ein kleines RenderTarget
// (config.cockpit.spiegel.aufloesung, nur jedes `takt`-te Bild); das Ergebnis wird links/rechts gespiegelt als Textur-Fläche in einen
// kleinen Ausschnitt (Viewport/Scissor) des Hauptbilds gezeichnet. Den Rahmen malt cockpit.js als DOM-Element.
//
//   Rennspiel.rueckspiegel.zeichnen(spiel, i, vx, vw, vh)   nach dem Rendern der Ansicht i (Viewport x = vx, Breite vw, Höhe vh in CSS-Pixeln)
//   Rennspiel.rueckspiegel.sichtbar(spiel, i)               true, wenn Ansicht i gerade einen Spiegel zeigt (Config, Kamera-Modus, Zweispieler-Regel)
//   Rennspiel.rueckspiegel.rechteck(vw, vh, split)          { x, y, b, h } in Pixeln relativ zur Ansicht (links oben), gleiche Formel wie das HUD
//
// Spar-Maßnahmen: kleines Bild, nur jedes 2. Bild neu, Schatten-Karte wird nicht neu berechnet, eigenes Auto ausgeblendet, Wetter-Partikel
// (eigene Layer) fehlen im Spiegel, Sichtweite begrenzt. Zweispieler: config.cockpit.spiegel.zweispieler ('aus' = kein Spiegel).
// ============================================================
(function () {
  const R = window.Rennspiel;
  const S = {};
  R.rueckspiegel = S;

  /** Rechteck eines Config-Elements {x, y, b, h?} in Pixeln (Mitte x/y in %, Breite %, Höhe % oder quadratisch); faktor skaliert b/h. */
  S.rechteckAus = function (e, vw, vh, faktor) {
    const f = faktor || 1;
    // Faktor ≠ 1 (Zweispieler): alles vergrößert um den Ankerpunkt unten Mitte (50 %, 100 %) – Abstände bleiben im Verhältnis
    const b = e.b / 100 * vw * f, h = e.h !== undefined ? e.h / 100 * vh * f : b;
    const cx = 50 + (e.x - 50) * f, cy = 100 - (100 - e.y) * f;
    return { x: cx / 100 * vw - b / 2, y: cy / 100 * vh - h / 2, b, h };
  };

  /**
   * Rechteck des Rückspiegels. 15.10. (v23): oben Mitte wie ein echter Innenspiegel – Zweispieler vergrößert um den Ankerpunkt OBEN Mitte
   * (die Instrumente unten skalieren um unten Mitte, siehe rechteckAus), sonst würde der Spiegel nach oben aus dem Bild wachsen.
   */
  S.rechteck = function (vw, vh, split) {
    const c = R.config.cockpit, e = c.spiegel, f = split ? c.zweispielerFaktor : 1;
    const b = e.b / 100 * vw * f, h = e.h !== undefined ? e.h / 100 * vh * f : b;
    const cx = 50 + (e.x - 50) * f, cy = e.y * f;
    return { x: cx / 100 * vw - b / 2, y: cy / 100 * vh - h / 2, b, h };
  };

  S.sichtbar = function (spiel, i) {
    const c = R.config.cockpit, sp = c.spiegel;
    if (!c.an || !sp.an || !spiel || spiel.zustand === 'menue' || !spiel.kameras || !spiel.kameras[i]) return false;
    if (spiel.kameras.length > 1 && sp.zweispieler !== 'an') return false;
    if (typeof document !== 'undefined' && document.documentElement.classList.contains('t-rennen')) return false;   // Handy/Touch: kein Spiegel
    if (spiel.qualitaet && spiel.qualitaet.stufe >= 3) return false;          // Notbremse: Spiel läuft zu langsam → Spiegel aus
    return sp.modi.indexOf(spiel.kameras[i].modus) >= 0;
  };

  /** v31 (H2): Zweispieler-Werte (halbe Auflösung, Takt, Deko, Sicht) – Solo bleibt unverändert. */
  function zweiWert(cfg, name, solo) { return cfg[name] !== undefined ? cfg[name] : solo; }

  let rts = [null, null], rtB = [0, 0], rtH = [0, 0], kam = null, flaeche = null, flaecheSzene = null, flaecheKam = null, zaehler = [0, 0], geladen = [false, false], versetzt = false, _vp = null, _sc = null;

  function vorbereiten(i, b, h, split) {
    const sp = R.config.cockpit.spiegel;
    const af = i >= 0 && split ? zweiWert(sp, 'zweiAufloesung', 0.5) : 1, auf = sp.aufloesung * af;
    const pb = Math.max(48, Math.round(auf)), ph = Math.max(12, Math.round(auf * h / b));
    if (!rts[i] || rtB[i] !== pb || rtH[i] !== ph) {   // v31: Größe je Ansicht (zwei Hälften können sich um 1 Pixel unterscheiden → kein gegenseitiges Neuanlegen)
      if (rts[i]) rts[i].dispose();
      rts[i] = new THREE.WebGLRenderTarget(pb, ph, { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: true, stencilBuffer: false });
      rtB[i] = pb; rtH[i] = ph; geladen[i] = false;
    }
    if (!_vp) { _vp = new THREE.Vector4(); _sc = new THREE.Vector4(); }
    if (!kam) kam = new THREE.PerspectiveCamera(30, 4, 0.4, 200);
    if (!flaeche) {
      // Anzeigefläche: füllt den Spiegel-Viewport, Textur links/rechts vertauscht (scale.x = −1, beide Seiten sichtbar)
      flaecheSzene = new THREE.Scene();
      flaecheKam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 2);
      const m = new THREE.MeshBasicMaterial({ map: rts[i].texture, side: THREE.DoubleSide, toneMapped: false, depthTest: false, depthWrite: false });
      flaeche = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), m);
      flaeche.scale.x = -1; flaeche.frustumCulled = false;
      flaecheSzene.add(flaeche);
    }
  }

  S.zeichnen = function (spiel, i, vx, vw, vh) {
    if (!S.sichtbar(spiel, i)) return;
    const r = spiel.renderer, k = spiel.kameras[i], cfg = R.config.cockpit.spiegel;
    const split = spiel.kameras.length > 1;
    const rc = S.rechteck(vw, vh, split);
    if (rc.b < 8 || rc.h < 4) return;
    vorbereiten(i, rc.b, rc.h, split);
    const rt = rts[i];

    // Takt: Spiegelbild nur bei jedem N-ten Bild neu (Zweispieler ×1,5)
    // adaptive Qualität des Spiels (main.js: qualitaet.stufe 0 = voll, steigt bei zu wenig fps): ab 1 keine Deko im Spiegel, ab 2 halber Takt, ab 3 kein Spiegel
    const stufe = spiel.qualitaet ? spiel.qualitaet.stufe : 0, deko = (split ? zweiWert(cfg, 'zweiDeko', false) : cfg.deko) && stufe < 1;
    const takt = Math.max(1, Math.round((split ? zweiWert(cfg, 'zweiTakt', 4) : cfg.takt) * (stufe >= 2 ? 2 : 1)));   // v31: zweite Hälfte um halben Takt versetzt (siehe unten) → meist nur ein Spiegel pro Bild
    if (++zaehler[i] >= takt || !geladen[i]) {
      zaehler[i] = (split && i === 1 && !versetzt) ? Math.floor(takt / 2) : 0; geladen[i] = true;
      if (split && i === 1) versetzt = true;
      const q = k.quelle || k.ziel;
      if (q) {
        const fz = spiel.fahrzeuge.find((f) => f.anzeige === q);
        const hd = q.heading !== undefined ? q.heading : 0;
        // Kamera am Auto, Blick nach hinten (Fahrtrichtung + 180°)
        kam.position.set(q.x, q.y + cfg.hoehe, q.z);
        kam.rotation.order = 'YXZ';
        kam.rotation.set(-0.03, hd + Math.PI, 0);
        kam.far = Math.min(split ? zweiWert(cfg, 'zweiSicht', cfg.sicht) : cfg.sicht, k.kamera.far);
        const ha = (cfg.blickWinkel || 80) * Math.PI / 180;                       // waagerechter → senkrechter Winkel
        kam.aspect = rc.b / rc.h;
        kam.fov = 2 * Math.atan(Math.tan(ha / 2) / kam.aspect) * 180 / Math.PI;
        kam.updateProjectionMatrix();
        kam.updateMatrixWorld(true);
        const alt = r.getRenderTarget(), sz = spiel.szene, schatten = r.shadowMap.autoUpdate;
        const scissor = r.getScissorTest(), vp = r.getViewport(_vp), sc = r.getScissor(_sc);
        const sichtbarAlt = fz ? fz.mesh.visible : true;
        let dekoAlt = null;
        try {   // try/finally: wirft render (Kontextverlust, Shader-Fehler), wird der Zustand trotzdem zurückgesetzt
          if (fz) fz.mesh.visible = false;                                           // eigenes Auto nicht im Spiegel
          // Deko (Bäume, Büsche, Zäune: bei Wald ~350 000 Dreiecke) im kleinen Spiegel weglassen – spart rund die Hälfte der Spiegel-Kosten
          if (!deko) { dekoAlt = sz.children.filter((c) => c.visible && c.name && c.name.indexOf('Deko') === 0); dekoAlt.forEach((c) => { c.visible = false; }); }
          r.shadowMap.autoUpdate = false;                                            // Schatten-Karte nicht noch einmal berechnen
          r.setScissorTest(false);
          r.setRenderTarget(rt);
          r.render(sz, kam);
        } finally {
          r.setRenderTarget(alt);
          if (dekoAlt) dekoAlt.forEach((c) => { c.visible = true; });
          r.shadowMap.autoUpdate = schatten;
          if (fz) fz.mesh.visible = sichtbarAlt;
          r.setViewport(vp); r.setScissor(sc); r.setScissorTest(scissor);
        }
      }
    }

    // Textur in den Spiegel-Ausschnitt des Hauptbilds legen (WebGL-Ursprung unten links)
    const H = window.innerHeight;
    const x = Math.round(vx + rc.x), y = Math.round(H - (rc.y + rc.h)), b = Math.round(rc.b), h = Math.round(rc.h);
    const scissor = r.getScissorTest(), ac = r.autoClear;
    r.setScissorTest(true);
    r.setViewport(x, y, b, h); r.setScissor(x, y, b, h);
    flaeche.material.map = rt.texture;
    r.autoClear = true;
    r.render(flaecheSzene, flaecheKam);
    r.autoClear = ac;
    r.setScissorTest(scissor);
  };

  /**
   * v26c: Spiegel-Shader vorwärmen. Das Spiegelbild wird in ein RenderTarget gezeichnet; dafür baut three.js eigene Shader-Varianten (anderer Farbraum-Schlüssel
   * als beim Zeichnen aufs Canvas). Ohne Vorwärmen entstehen sie erst im Rennen, wenn z. B. eine Brücke zum ersten Mal im Spiegel auftaucht (Ruckler/Hänger).
   * Aufruf aus Main._vorwaermen (alles sichtbar), nur compile, kein Zeichnen.
   */
  S.vorwaermen = function (spiel) {
    if (typeof THREE === 'undefined' || !spiel || !spiel.kameras) return;
    const r = spiel.renderer, w = window.innerWidth, h = window.innerHeight, split = spiel.kameras.length > 1;
    for (let i = 0; i < spiel.kameras.length; i++) {
      if (!S.sichtbar(spiel, i)) continue;
      const vw = split ? (i === 0 ? Math.floor(w / 2) : w - Math.floor(w / 2)) : w, rc = S.rechteck(vw, h, split);
      if (rc.b < 8 || rc.h < 4) continue;
      vorbereiten(i, rc.b, rc.h, split);
      const alt = r.getRenderTarget();
      try { r.setRenderTarget(rts[i]); r.compile(spiel.szene, kam); } finally { r.setRenderTarget(alt); }
    }
  };

  S.zuruecksetzen = function () { zaehler = [0, 0]; geladen = [false, false]; versetzt = false; };

  /** v31 (H2): beim Zurück ins Menü Spiegel-Bilder freigeben (RenderTargets sind GPU-Speicher); beim nächsten Rennen werden sie neu angelegt. */
  S.entsorgen = function () {
    rts.forEach((t, j) => { if (t) { t.dispose(); rts[j] = null; } });
    rtB = [0, 0]; rtH = [0, 0]; S.zuruecksetzen();
  };
})();
