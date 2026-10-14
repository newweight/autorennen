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

  S.rechteck = function (vw, vh, split) {
    const c = R.config.cockpit;
    return S.rechteckAus(c.spiegel, vw, vh, split ? c.zweispielerFaktor : 1);
  };

  S.sichtbar = function (spiel, i) {
    const c = R.config.cockpit, sp = c.spiegel;
    if (!c.an || !sp.an || !spiel || spiel.zustand === 'menue' || !spiel.kameras || !spiel.kameras[i]) return false;
    if (spiel.kameras.length > 1 && sp.zweispieler !== 'an') return false;
    if (typeof document !== 'undefined' && document.documentElement.classList.contains('t-rennen')) return false;   // Handy/Touch: kein Spiegel
    if (spiel.qualitaet && spiel.qualitaet.stufe >= 3) return false;          // Notbremse: Spiel läuft zu langsam → Spiegel aus
    return sp.modi.indexOf(spiel.kameras[i].modus) >= 0;
  };

  let rts = [null, null], rtB = 0, rtH = 0, kam = null, flaeche = null, flaecheSzene = null, flaecheKam = null, zaehler = [0, 0], geladen = [false, false], _vp = null, _sc = null;

  function vorbereiten(i, b, h) {
    const sp = R.config.cockpit.spiegel;
    const pb = Math.max(64, Math.round(sp.aufloesung)), ph = Math.max(16, Math.round(sp.aufloesung * h / b));
    if (!rts[i] || rtB !== pb || rtH !== ph) {
      rts.forEach((t, j) => { if (t) { t.dispose(); rts[j] = null; } });   // Größe geändert: alle neu (je Ansicht ein Bild)
      rts[i] = new THREE.WebGLRenderTarget(pb, ph, { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: true, stencilBuffer: false });
      rtB = pb; rtH = ph; geladen = [false, false];
    }
    if (!rts[i]) { rts[i] = new THREE.WebGLRenderTarget(pb, ph, { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: true, stencilBuffer: false }); geladen[i] = false; }
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
    vorbereiten(i, rc.b, rc.h);
    const rt = rts[i];

    // Takt: Spiegelbild nur bei jedem N-ten Bild neu (Zweispieler ×1,5)
    // adaptive Qualität des Spiels (main.js: qualitaet.stufe 0 = voll, steigt bei zu wenig fps): ab 1 keine Deko im Spiegel, ab 2 halber Takt, ab 3 kein Spiegel
    const stufe = spiel.qualitaet ? spiel.qualitaet.stufe : 0, deko = cfg.deko && stufe < 1;
    const takt = Math.max(1, Math.round(cfg.takt * (split ? 1.5 : 1) * (stufe >= 2 ? 2 : 1)));
    if (++zaehler[i] >= takt || !geladen[i]) {
      zaehler[i] = 0; geladen[i] = true;
      const q = k.quelle || k.ziel;
      if (q) {
        const fz = spiel.fahrzeuge.find((f) => f.anzeige === q);
        const hd = q.heading !== undefined ? q.heading : 0;
        // Kamera am Auto, Blick nach hinten (Fahrtrichtung + 180°)
        kam.position.set(q.x, q.y + cfg.hoehe, q.z);
        kam.rotation.order = 'YXZ';
        kam.rotation.set(-0.03, hd + Math.PI, 0);
        kam.far = Math.min(cfg.sicht, k.kamera.far);
        const ha = (cfg.blickWinkel || 80) * Math.PI / 180;                       // waagerechter → senkrechter Winkel
        kam.aspect = rc.b / rc.h;
        kam.fov = 2 * Math.atan(Math.tan(ha / 2) / kam.aspect) * 180 / Math.PI;
        kam.updateProjectionMatrix();
        kam.updateMatrixWorld(true);
        const alt = r.getRenderTarget(), sz = spiel.szene, schatten = r.shadowMap.autoUpdate;
        const scissor = r.getScissorTest(), vp = r.getViewport(_vp), sc = r.getScissor(_sc);
        const sichtbarAlt = fz ? fz.mesh.visible : true;
        if (fz) fz.mesh.visible = false;                                           // eigenes Auto nicht im Spiegel
        // Deko (Bäume, Büsche, Zäune: bei Wald ~350 000 Dreiecke) im kleinen Spiegel weglassen – spart rund die Hälfte der Spiegel-Kosten
        let dekoAlt = null;
        if (!deko) { dekoAlt = sz.children.filter((c) => c.visible && c.name && c.name.indexOf('Deko') === 0); dekoAlt.forEach((c) => { c.visible = false; }); }
        r.shadowMap.autoUpdate = false;                                            // Schatten-Karte nicht noch einmal berechnen
        r.setScissorTest(false);
        r.setRenderTarget(rt);
        r.render(sz, kam);
        r.setRenderTarget(alt);
        if (dekoAlt) dekoAlt.forEach((c) => { c.visible = true; });
        r.shadowMap.autoUpdate = schatten;
        if (fz) fz.mesh.visible = sichtbarAlt;
        r.setViewport(vp); r.setScissor(sc); r.setScissorTest(scissor);
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

  S.zuruecksetzen = function () { zaehler = [0, 0]; geladen = [false, false]; };
})();
