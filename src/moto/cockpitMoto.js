// ============================================================
// Motorrad-Cockpit (M2d): Fahrersicht mit Lenker + zwei Rückspiegel. Läuft NACH src/main.js, nur mit window.MOTORRAD === true.
// Alles sind Umhüllungen zur Laufzeit; src/ui/cockpit.js, src/ui/rueckspiegel.js und src/render/cameras.js bleiben unverändert
// (Autorennen.html lädt diese Datei nicht).
//
// Kamera (Taste „Kamera“, Ansicht „cockpit“): Die Cockpit-Kamera sitzt schon auf Helmhöhe (config.kamera.cockpit, motoKatalog.js).
//   FahrzeugKamera.prototype.update   umhüllt: in der Cockpit-Ansicht kippt die Kamera mit der Schräglage des Motorrads, gedämpft (rollAnteil 50 %).
// Lenker (nur Cockpit-Ansicht, nicht auf dem Handy mit Touch-Tasten – dort liegen unten die Knöpfe, wie beim Auto):
//   R.cockpit.fuerHud                 umhüllt: je HUD ein Zusatz-Objekt, das ein Bild (Canvas) unten in der Mitte zeichnet:
//                                     Vorderrad-Kotflügel mit Startnummer, Gabel, Lenker mit Griffen und Handschuhen, Bremshebel,
//                                     rundes Anzeige-Instrument mittig (km/h, Gang, Drehzahl-Segmente). Der Lenker dreht sich leicht mit.
//   Das Auto-Cockpit (Instrumente von VW/Porsche, Tafel) gibt es für Motorräder nie (config.cockpit.stile kennt keine Motorräder);
//   der Scheibenwischer gehört zur Windschutzscheibe und ist im Motorradmodus aus (config.cockpit.wischer.modi = []).
// Rückspiegel: ZWEI statt einem (links / rechts), rund-oval wie am Lenker. Links zeigt hinten-links, rechts hinten-rechts.
//   R.rueckspiegel.zeichnen/sichtbar/vorwaermen/entsorgen/zuruecksetzen   umhüllt
//   Kosten wie der eine Spiegel des Autorennens: halbe Auflösung je Spiegel, doppelter Takt je Spiegel, die beiden werden abwechselnd
//   neu gezeichnet (in jedem Bild höchstens einer; Zweispieler mit den Sparwerten zweiAufloesung/zweiTakt/zweiDeko/zweiSicht des Autorennens).
//   Cockpit-Ansicht: die Spiegel sitzen an den Lenkerenden. Verfolger/Weit: sie teilen sich den Platz des einen Spiegels oben Mitte
//   (gezeigt wird genau dort, wo das Autorennen einen Spiegel zeigt: config.cockpit.spiegel.modi).
// Reine Funktionen (Node-testbar): rechtecke, spiegelRichtung, spiegelPosition, taktPlan, faellig, rollWinkel, leanFuerKamera.
// ============================================================
window.Rennspiel = window.Rennspiel || {};

(function () {
  const R = window.Rennspiel;
  if (window.MOTORRAD !== true) return;
  R.Moto = R.Moto || {};

  R.config.motoCockpit = {
    aus: false,                       // true = Autorennen-Spiegel (ein Spiegel oben Mitte), kein Lenker (nur für Vergleichsmessungen)
    rollAnteil: 0.5,                  // die Kamera kippt so viel der Schräglage des Motorrads mit (0,5 = halb so stark)
    rollWeichheit: 9,                 // 1/s: zusätzliche Glättung der Kamera-Kippung
    kameraVor: 0.42,                  // m vor der Motorradmitte: so sitzt die Cockpit-Kamera VOR dem Helmschirm (0,40 m) – sonst schneidet der Schirm in Schräglage als dunkles Band durchs Bild
    lenker: {
      seitenverh: 3.4,                // Breite : Höhe des Lenker-Bildes
      breite: 0.62,                   // höchstens so viel der Ansichtsbreite
      maxHoehe: 0.29,                 // höchstens so viel der Ansichtshöhe
      lenkWinkel: 0.07,               // rad: so weit dreht sich der Lenker bei vollem Einschlag
      spiegelX: 0.115,                // Spiegel-Mitte: Abstand vom Lenker-Bildrand (Anteil Bildbreite)
      spiegelOben: 0.08,              // Spiegel-Mitte liegt so viel (Anteil Bildhöhe) ÜBER der Oberkante des Lenker-Bildes
      spiegelB: 0.205, spiegelH: 0.44, // Spiegelgröße (Anteil Lenker-Bildbreite / -höhe) – oval
    },
    spiegel: {
      winkel: 26,                     // Grad: so weit schaut jeder Spiegel von „genau hinten“ nach außen
      blickWinkel: 58,                // waagerechter Blickwinkel (Grad)
      seitlich: 0.42, vor: 0.35,      // Lage der Spiegel-Kamera am Motorrad (m): seitlich der Mitte, vor der Mitte
      aufloesungFaktor: 0.5,          // Breite des Spiegelbilds = config.cockpit.spiegel.aufloesung × diesen Faktor (halbe Auflösung je Spiegel)
      lueckeOben: 6,                  // Verfolger/Weit: Lücke zwischen den beiden Spiegeln (px)
    },
  };
  const CFG = () => R.config.motoCockpit;

  const TAU = Math.PI * 2, klemme = (x, lo, hi) => Math.max(lo, Math.min(hi, x));

  // ---------- reine Funktionen ----------
  /**
   * Rechtecke (px, relativ zur Ansicht, links oben) der beiden Spiegel und des Lenker-Bildes. hind = Liste {x,y,b,h} von Flächen, die frei bleiben (Minimap).
   * cockpit = true: Spiegel an den Lenkerenden; sonst teilen sie sich das Rechteck `basis` (= Platz des einen Spiegels des Autorennens).
   * Rückgabe { lenker: {x,y,b,h} | null, spiegel: [links, rechts] }.
   */
  function rechtecke(vw, vh, cockpit, basis, hind) {
    const C = CFG();
    if (!cockpit) {
      const luecke = Math.min(C.spiegel.lueckeOben, basis.b * 0.04), b = (basis.b - luecke) / 2;
      return { lenker: null, spiegel: [{ x: basis.x, y: basis.y, b, h: basis.h }, { x: basis.x + b + luecke, y: basis.y, b, h: basis.h }] };
    }
    const L = C.lenker;
    let H = Math.min(vh * L.maxHoehe, vw * L.breite / L.seitenverh), W = H * L.seitenverh, x0 = (vw - W) / 2;
    // Hindernisse (Minimap links unten): der Lenker wird schmaler, notfalls nach rechts neben das Hindernis geschoben – nie darüber
    if (hind && hind.length) {
      const rand = 6, rechts = vw - 4, bandOben = vh - H * 1.35;
      let links = 0;
      for (let k = 0; k < hind.length; k++) { const o = hind[k]; if (o.y + o.h > bandOben && o.x + o.b / 2 < vw / 2) links = Math.max(links, o.x + o.b + rand); }
      if (x0 < links) {
        const Wc = 2 * (vw / 2 - links);
        if (Wc >= 0.7 * W) { W = Wc; x0 = (vw - W) / 2; }
        else { W = Math.min(W, rechts - links); x0 = links + (rechts - links - W) / 2; }
        H = W / L.seitenverh;
      }
    }
    const y0 = vh - H, bm = L.spiegelB * W, hm = L.spiegelH * H, cy = y0 - L.spiegelOben * H;
    return {
      lenker: { x: x0, y: y0, b: W, h: H },
      spiegel: [{ x: x0 + L.spiegelX * W - bm / 2, y: cy - hm / 2, b: bm, h: hm }, { x: x0 + (1 - L.spiegelX) * W - bm / 2, y: cy - hm / 2, b: bm, h: hm }],
    };
  }

  /**
   * Blickrichtung eines Spiegels. seite −1 = links, +1 = rechts. heading wächst nach links (Linkskurve).
   * „Genau hinten“ = heading + π; links dreht den Blick nach links hinten (heading + π − winkel), rechts nach rechts hinten (heading + π + winkel):
   * yaw = heading + π + seite · winkel.
   * Rückgabe { yaw (Kamera-Drehung um y), dx, dz (Blickrichtung in der Welt), hinten (dx, dz), links (dx, dz) }.
   */
  function spiegelRichtung(heading, seite, winkelGrad) {
    const w = (winkelGrad === undefined ? CFG().spiegel.winkel : winkelGrad) * Math.PI / 180;
    const yaw = heading + Math.PI + seite * w;
    return { yaw, dx: -Math.sin(yaw), dz: -Math.cos(yaw),
      hinten: { dx: Math.sin(heading), dz: Math.cos(heading) }, links: { dx: -Math.cos(heading), dz: Math.sin(heading) } };
  }
  /** Lage der Spiegel-Kamera: seitlich versetzt zur eigenen Seite, ein Stück vor der Mitte. */
  function spiegelPosition(x, z, heading, seite, seitlich, vor) {
    const s = seitlich === undefined ? CFG().spiegel.seitlich : seitlich, v = vor === undefined ? CFG().spiegel.vor : vor;
    const lx = -Math.cos(heading), lz = Math.sin(heading), fx = -Math.sin(heading), fz = -Math.cos(heading);   // links, vorwärts
    return { x: x - seite * s * lx + fx * v, z: z - seite * s * lz + fz * v };
  }
  // seite −1 → +links: x + (−seite)·s·links; seite +1 → rechts

  /** Takt-Plan: n Spiegel teilen sich den Takt T (Bilder zwischen zwei Aufnahmen desselben Spiegels); Versatz je Spiegel gleichmäßig verteilt. */
  function taktPlan(n, T) { const o = []; for (let k = 0; k < n; k++) o.push(Math.floor(k * T / n)); return o; }
  /** Ist der Spiegel mit Versatz `off` in diesem Bild (Zähler) dran? */
  function faellig(zaehler, T, off) { return (zaehler % T) === off; }
  /** Kippung der Kamera aus der Schräglage (rad; positiv = nach links). */
  function rollWinkel(lean, anteil) { return (Number.isFinite(lean) ? lean : 0) * (anteil === undefined ? CFG().rollAnteil : anteil); }
  /** Schräglage für die Kamera: beim Purzelbaum (Sturz) fällt der Anteil mit der Lage des Motorrads auf 0 (die Kamera überschlägt sich nicht). */
  function leanFuerKamera(z, purzelPose, purzelDauer) {
    if (!z || !Number.isFinite(z.lean)) return 0;
    let a = 1;
    if (z.purzel && z.purzel.aktiv && purzelPose) a = purzelPose(z.purzel.t / purzelDauer).lean;
    return z.lean * a;
  }

  /**
   * Größe (Pixel) des Spiegelbilds für ein Spiegel-Rechteck rc: halbe Auflösung des einen Autorennen-Spiegels (config.cockpit.spiegel.aufloesung × aufloesungFaktor),
   * zu zweit nochmal × zweiAufloesung; nie größer als der Ausschnitt auf dem Bildschirm (kein Hochskalieren, kein Verschwenden).
   */
  function rtGroesse(rc, split) {
    const sp = R.config.cockpit.spiegel, mc = CFG().spiegel;
    const af = split ? (sp.zweiAufloesung !== undefined ? sp.zweiAufloesung : 0.5) : 1, auf = sp.aufloesung * mc.aufloesungFaktor * af;
    const b = Math.max(40, Math.round(Math.min(auf, rc.b * 1.1)));
    return { b, h: Math.max(16, Math.round(b * rc.h / rc.b)) };
  }

  /**
   * Takt der Spiegel: Takt des Autorennens × Zahl der Spiegel je Ansicht (2) → insgesamt gleich viele Aufnahmen je Bild wie dort.
   * Autorennen solo: 1 Spiegel alle `takt` Bilder; zu zweit: 2 Spiegel (je Bildhälfte einer) alle `zweiTakt` Bilder. Motorrad: 2 bzw. 4 Spiegel, je alle 2 × so viel Bilder.
   * stufe = adaptive Qualität des Spiels (ab 2 halber Takt). Rückgabe { T, n, plan (Versatz je Spiegel), proBild (Aufnahmen je Bild im Mittel) }.
   */
  function taktFuer(split, stufe, ansichten) {
    const sp = R.config.cockpit.spiegel, basis = split ? (sp.zweiTakt !== undefined ? sp.zweiTakt : 4) : sp.takt;
    const T = Math.max(2, Math.round(basis * 2 * (stufe >= 2 ? 2 : 1))), n = 2 * (ansichten || 1);
    return { T, n, plan: taktPlan(n, T), proBild: n / T };
  }

  const rein = { taktFuer, rechtecke, spiegelRichtung, spiegelPosition, taktPlan, faellig, rollWinkel, leanFuerKamera, rtGroesse };
  R.Moto.cockpit = Object.assign(R.Moto.cockpit || {}, rein);

  // ============================================================ ab hier Browser (DOM + three.js)
  if (typeof document === 'undefined' || typeof THREE === 'undefined') return;
  if (!R.rueckspiegel || !R.cockpit || !R.FahrzeugKamera || !R.Spiel) return;

  if (R.config.kamera && R.config.kamera.cockpit) R.config.kamera.cockpit.vor = CFG().kameraVor;
  // Scheibenwischer = Windschutzscheibe: gibt es am Motorrad nicht
  if (R.config.cockpit && R.config.cockpit.wischer) R.config.cockpit.wischer.modi = [];

  // ---------- Kamera: Kippung mit der Schräglage ----------
  const kUpdate = R.FahrzeugKamera.prototype.update;
  R.FahrzeugKamera.prototype.update = function (dt) {
    const erst = this._erstesMal;
    const r = kUpdate.apply(this, arguments);
    try {
      if (this.modus === 'cockpit' && !CFG().aus && this.ziel) {
        const sp = R.spiel, f = sp && sp._fahrzeugVon ? sp._fahrzeugVon(this.ziel) : null, z = f && f.motoZ;
        const SL = R.Moto.schraeglage;
        const ziel = rollWinkel(leanFuerKamera(z, SL && SL.purzelPose, SL && SL.PURZEL ? SL.PURZEL.dauer : 1.2));
        // Die Schräglage dreht das Motorrad um den Boden: der Helm wandert nach innen und etwas nach unten. Die Kamera sitzt im Helm und geht mit
        // (voll, wie das Motorrad), sonst säße sie neben dem Fahrer und sähe ihn von innen.
        const lean = leanFuerKamera(z, SL && SL.purzelPose, SL && SL.PURZEL ? SL.PURZEL.dauer : 1.2), hh = R.config.kamera.cockpit.hoehe, hd = f && f.vehicle ? (this.quelle || this.ziel).heading : 0;
        if (hh > 0 && Math.abs(lean) > 1e-4 && hd !== undefined) {
          const seit = hh * Math.sin(lean);
          this.kamera.position.x += -Math.cos(hd) * seit; this.kamera.position.z += Math.sin(hd) * seit; this.kamera.position.y -= hh * (1 - Math.cos(lean));
        }
        if (erst || this._motoRoll === undefined) this._motoRoll = ziel;
        else this._motoRoll += (ziel - this._motoRoll) * (1 - Math.exp(-CFG().rollWeichheit * Math.max(0, dt || 0)));
        this.kamera.rotation.z += this._motoRoll;
      } else this._motoRoll = undefined;
    } catch (e) { console.error('Motorrad-Cockpit (Kamera):', e); }
    return r;
  };

  // Beim Sturz-Purzelbaum überschlägt sich das Motorrad um den Fahrer-Helm; die Cockpit-Kamera sitzt im Helm und sähe es von innen durchs Bild fliegen.
  // Allein am Bildschirm (Solo) blenden wir das eigene Motorrad für diese gut eine Sekunde aus (zu zweit sieht der Mitspieler es, dort bleibt es sichtbar).
  const spielZeichnen = R.Spiel.prototype.zeichnen;
  R.Spiel.prototype.zeichnen = function () {
    let f = null;
    try {
      const k = this.kameras && this.kameras.length === 1 ? this.kameras[0] : null;
      if (k && !CFG().aus && k.modus === 'cockpit' && this.zustand !== 'menue' && k.ziel) {
        const g = this._fahrzeugVon(k.ziel);
        if (g && g.mesh && g.mesh.visible && g.motoZ && g.motoZ.purzel && g.motoZ.purzel.aktiv) { f = g; f.mesh.visible = false; }
      }
    } catch (e) { f = null; }
    try { return spielZeichnen.apply(this, arguments); } finally { if (f) f.mesh.visible = true; }
  };

  // ---------- Rückspiegel: zwei Spiegel ----------
  const S = R.rueckspiegel, sichtOrig = S.sichtbar, zeichnenOrig = S.zeichnen, vorwaermenOrig = S.vorwaermen, entsorgenOrig = S.entsorgen, zuruecksetzenOrig = S.zuruecksetzen;
  const rts = [[null, null], [null, null]], rtB = [[0, 0], [0, 0]], rtH = [[0, 0], [0, 0]], geladen = [[false, false], [false, false]], zaehler = [0, 0];
  const kams = [null, null];
  let flaeche = null, flaecheSzene = null, flaecheKam = null, _vp = null, _sc = null;

  /** Die Spiegel-Anzeige (Cockpit-Ansicht): das Autorennen-Rahmenelement + Platz-Chip bleiben dafür aus (siehe unten). */
  S.sichtbar = function (spiel, i) {
    const ok = sichtOrig.call(S, spiel, i);
    if (CFG().aus || !ok) return ok;
    return spiel.kameras[i].modus === 'cockpit' ? false : ok;       // Cockpit: eigene Rahmen an den Lenkerenden, der Platz-Chip bleibt oben Mitte
  };

  /** Flächen, die der Lenker frei lassen muss (Minimap der Ansicht i, relativ zur Ansicht). Einmal gemessen, dann gemerkt (kein Layout-Lesen je Bild). */
  let hindCache = {};
  function hindernisse(spiel, i, vw, vh) {
    const key = i + '|' + vw + 'x' + vh;
    if (hindCache[key]) return hindCache[key];
    const h = spiel.huds && spiel.huds[i], liste = [];
    if (h && h.minimap && h.minimap.canvas && h.el) {
      const hr = h.el.getBoundingClientRect(), cr = h.minimap.canvas.getBoundingClientRect();
      if (cr.width > 0 && cr.height > 0) liste.push({ x: cr.left - hr.left, y: cr.top - hr.top, b: cr.width, h: cr.height });
    }
    if (liste.length) hindCache[key] = liste;
    return liste;
  }

  function vorbereiten(i, m, rc, split) {
    const g = rtGroesse(rc, split), pb = g.b, ph = g.h;
    if (!rts[i][m] || rtB[i][m] !== pb || rtH[i][m] !== ph) {
      if (rts[i][m]) rts[i][m].dispose();
      rts[i][m] = new THREE.WebGLRenderTarget(pb, ph, { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: true, stencilBuffer: false });
      rtB[i][m] = pb; rtH[i][m] = ph; geladen[i][m] = false;
    }
    if (!_vp) { _vp = new THREE.Vector4(); _sc = new THREE.Vector4(); }
    if (!kams[m]) kams[m] = new THREE.PerspectiveCamera(30, 1.5, 0.4, 200);
    if (!flaeche) {
      // Anzeige-Fläche: Ellipse (Kreis, im Spiegel-Ausschnitt gestreckt), Textur links/rechts vertauscht wie ein echter Spiegel
      flaecheSzene = new THREE.Scene();
      flaecheKam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 2);
      const mat = new THREE.MeshBasicMaterial({ map: rts[i][m].texture, side: THREE.DoubleSide, toneMapped: false, depthTest: false, depthWrite: false });
      flaeche = new THREE.Mesh(new THREE.CircleGeometry(1, 48), mat);
      flaeche.scale.x = -1; flaeche.frustumCulled = false;
      flaecheSzene.add(flaeche);
    }
  }

  function ansichtRechtecke(spiel, i, vw, vh) {
    const split = spiel.kameras.length > 1, cockpit = spiel.kameras[i].modus === 'cockpit';
    return rechtecke(vw, vh, cockpit, S.rechteck(vw, vh, split), cockpit ? hindernisse(spiel, i, vw, vh) : null);
  }

  S.zeichnen = function (spiel, i, vx, vw, vh) {
    if (CFG().aus) return zeichnenOrig.apply(S, arguments);
    if (!sichtOrig.call(S, spiel, i)) return;
    const r = spiel.renderer, k = spiel.kameras[i], cfg = R.config.cockpit.spiegel, mc = CFG().spiegel;
    const split = spiel.kameras.length > 1, rects = ansichtRechtecke(spiel, i, vw, vh).spiegel;
    if (rects[0].b < 12 || rects[0].h < 6) return;
    const stufe = spiel.qualitaet ? spiel.qualitaet.stufe : 0;
    const deko = (split ? (cfg.zweiDeko !== undefined ? cfg.zweiDeko : false) : cfg.deko) && stufe < 1;
    const tk = taktFuer(split, stufe, spiel.kameras.length), T = tk.T, plan = tk.plan;
    zaehler[i]++;
    const q = k.quelle || k.ziel;
    for (let m = 0; m < 2; m++) {
      const rc = rects[m];
      vorbereiten(i, m, rc, split);
      const slot = (split ? i : 0) * 2 + m;
      if (!(faellig(zaehler[i], T, plan[slot]) || !geladen[i][m]) || !q) continue;
      geladen[i][m] = true;
      const seite = m === 0 ? -1 : 1, fz = spiel.fahrzeuge.find((f) => f.anzeige === q), hd = q.heading !== undefined ? q.heading : 0;
      const dir = spiegelRichtung(hd, seite), pos = spiegelPosition(q.x, q.z, hd, seite), kam = kams[m];
      kam.position.set(pos.x, q.y + (mc.hoehe !== undefined ? mc.hoehe : cfg.hoehe), pos.z);
      kam.rotation.order = 'YXZ';
      kam.rotation.set(-0.03, dir.yaw, 0);
      kam.far = Math.min(split ? (cfg.zweiSicht !== undefined ? cfg.zweiSicht : cfg.sicht) : cfg.sicht, k.kamera.far);
      kam.aspect = rc.b / rc.h;
      kam.fov = 2 * Math.atan(Math.tan(mc.blickWinkel * Math.PI / 360) / kam.aspect) * 180 / Math.PI;
      kam.updateProjectionMatrix(); kam.updateMatrixWorld(true);
      const alt = r.getRenderTarget(), sz = spiel.szene, schatten = r.shadowMap.autoUpdate;
      const scissor = r.getScissorTest(), vp = r.getViewport(_vp), sc = r.getScissor(_sc);
      const sichtbarAlt = fz ? fz.mesh.visible : true;
      let dekoAlt = null;
      try {
        if (fz) fz.mesh.visible = false;                                             // eigenes Motorrad nicht im Spiegel
        if (!deko) { dekoAlt = sz.children.filter((c) => c.visible && c.name && c.name.indexOf('Deko') === 0); dekoAlt.forEach((c) => { c.visible = false; }); }
        r.shadowMap.autoUpdate = false;
        r.setScissorTest(false);
        r.setRenderTarget(rts[i][m]);
        r.render(sz, kam);
      } finally {
        r.setRenderTarget(alt);
        if (dekoAlt) dekoAlt.forEach((c) => { c.visible = true; });
        r.shadowMap.autoUpdate = schatten;
        if (fz) fz.mesh.visible = sichtbarAlt;
        r.setViewport(vp); r.setScissor(sc); r.setScissorTest(scissor);
      }
    }
    // beide Bilder in ihre Ausschnitte legen (WebGL-Ursprung unten links); ohne Löschen, damit außerhalb der Ellipse das Bild bleibt
    const H = window.innerHeight, scissor = r.getScissorTest(), ac = r.autoClear;
    r.setScissorTest(true); r.autoClear = false;
    for (let m = 0; m < 2; m++) {
      const rc = rects[m];
      if (!rts[i][m]) continue;
      const x = Math.round(vx + rc.x), y = Math.round(H - (rc.y + rc.h)), b = Math.round(rc.b), h = Math.round(rc.h);
      r.setViewport(x, y, b, h); r.setScissor(x, y, b, h);
      flaeche.material.map = rts[i][m].texture;
      r.render(flaecheSzene, flaecheKam);
    }
    r.autoClear = ac; r.setScissorTest(scissor);
  };

  /** Shader-Variante für Bilder in RenderTargets vorwärmen (wie im Autorennen), auch wenn die Ansicht zuerst nicht „cockpit“ ist. */
  S.vorwaermen = function (spiel) {
    if (CFG().aus) return vorwaermenOrig.apply(S, arguments);
    if (!spiel || !spiel.kameras) return;
    const r = spiel.renderer, w = window.innerWidth, h = window.innerHeight, split = spiel.kameras.length > 1;
    for (let i = 0; i < spiel.kameras.length; i++) {
      if (!sichtOrig.call(S, spiel, i)) continue;
      const vw = split ? (i === 0 ? Math.floor(w / 2) : w - Math.floor(w / 2)) : w, rc = S.rechteck(vw, h, split);
      if (rc.b < 8 || rc.h < 4) continue;
      const rs = rechtecke(vw, h, false, rc).spiegel;
      vorbereiten(i, 0, rs[0], split);
      const alt = r.getRenderTarget();
      try { r.setRenderTarget(rts[i][0]); r.compile(spiel.szene, kams[0]); } finally { r.setRenderTarget(alt); }
    }
  };
  S.zuruecksetzen = function () { zuruecksetzenOrig.apply(S, arguments); hindCache = {}; zaehler[0] = zaehler[1] = 0; for (let i = 0; i < 2; i++) geladen[i][0] = geladen[i][1] = false; };
  S.entsorgen = function () {
    entsorgenOrig.apply(S, arguments);
    for (let i = 0; i < 2; i++) for (let m = 0; m < 2; m++) { if (rts[i][m]) { rts[i][m].dispose(); rts[i][m] = null; } rtB[i][m] = rtH[i][m] = 0; }
    S.zuruecksetzen();
  };

  // ---------- Lenker + Rahmen im HUD ----------
  const SCHRIFT = '"Helvetica Neue", Arial, system-ui, sans-serif';
  const LW = 1000;                                       // Zeichenfläche des Lenker-Bildes (logisch): LW × LW / seitenverh
  function mische(c, ziel, t) {
    const n = typeof c === 'string' ? parseInt(c.slice(1), 16) : c, z = ziel;
    const ch = (s) => Math.round(((n >> s) & 255) * (1 - t) + z * t);
    return 'rgb(' + ch(16) + ',' + ch(8) + ',' + ch(0) + ')';
  }
  const heller = (c, t) => mische(c, 255, t), dunkler = (c, t) => mische(c, 0, t);

  /** Das ganze Lenker-Bild. p = { steer, kmh, anteil (0..1 Drehzahl), gang, bike, fahrer, helm, nr }. */
  function lenkerZeichnen(g, cw, ch, LH, p) {
    g.setTransform(cw / LW, 0, 0, ch / LH, 0, 0);
    g.clearRect(0, 0, LW, LH);
    const cx = LW / 2;
    g.lineCap = 'round'; g.lineJoin = 'round';
    // --- Teile, die sich mit dem Lenker drehen ---
    g.save(); g.translate(cx, LH); g.rotate(p.steer * CFG().lenker.lenkWinkel); g.translate(-cx, -LH);
    // Vorderrad-Kotflügel (Kuppel, vorn über dem Rad) mit Glanzkante
    let gr = g.createLinearGradient(0, 205, 0, LH);
    gr.addColorStop(0, heller(p.bike, 0.3)); gr.addColorStop(0.5, heller(p.bike, 0)); gr.addColorStop(1, dunkler(p.bike, 0.4));
    g.fillStyle = gr; g.beginPath(); g.ellipse(cx, 338, 160, 130, 0, 0, TAU); g.fill();
    g.strokeStyle = dunkler(p.bike, 0.55); g.lineWidth = 5; g.beginPath(); g.ellipse(cx, 338, 160, 130, 0, Math.PI * 1.02, Math.PI * 1.98); g.stroke();
    g.strokeStyle = 'rgba(255,255,255,.55)'; g.lineWidth = 6; g.beginPath(); g.ellipse(cx, 338, 148, 118, 0, Math.PI * 1.14, Math.PI * 1.86); g.stroke();
    // Startnummer-Tafel
    g.fillStyle = '#f6f6f6'; g.strokeStyle = dunkler(p.bike, 0.25); g.lineWidth = 6;
    g.beginPath(); g.roundRect ? g.roundRect(cx - 40, 224, 80, 66, 16) : g.rect(cx - 40, 224, 80, 66); g.fill(); g.stroke();
    g.fillStyle = '#15171c'; g.font = '800 46px ' + SCHRIFT; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(String(p.nr), cx, 259);
    // Gabelrohre (golden)
    for (const sx of [-1, 1]) {
      const x = cx + sx * 66;
      const gg = g.createLinearGradient(x - 12, 0, x + 12, 0);
      gg.addColorStop(0, '#6b500c'); gg.addColorStop(0.3, '#f2d36b'); gg.addColorStop(0.6, '#c99b22'); gg.addColorStop(1, '#5d440a');
      g.fillStyle = gg; g.fillRect(x - 12, 170, 24, LH - 160);
      g.fillStyle = '#23262c'; g.fillRect(x - 14, 232, 28, 14);                           // Gabelschutz
    }
    // Halterung des Instruments
    g.fillStyle = '#22262d'; g.fillRect(cx - 34, 168, 68, 40);
    // Lenkerrohr (Mitte höher, Enden zum Fahrer hin tiefer)
    const stange = () => { g.beginPath(); g.moveTo(66, 236); g.quadraticCurveTo(cx, 96, LW - 66, 236); };
    g.strokeStyle = '#15181d'; g.lineWidth = 26; stange(); g.stroke();
    g.strokeStyle = 'rgba(255,255,255,.28)'; g.lineWidth = 6; g.save(); g.translate(0, -7); stange(); g.stroke(); g.restore();
    g.fillStyle = '#2b3037'; g.fillRect(160, 192, 40, 30); g.fillRect(LW - 200, 192, 40, 30);   // Klemmen
    // linke und rechte Seite gleich (rechts gespiegelt)
    for (const seite of [-1, 1]) {
      g.save(); if (seite > 0) { g.translate(LW, 0); g.scale(-1, 1); }
      // Spiegel-Stiel von der Klemme nach oben (endet im Spiegel-Rahmen)
      g.strokeStyle = '#16181c'; g.lineWidth = 10; g.beginPath(); g.moveTo(178, 200); g.lineTo(CFG().lenker.spiegelX * LW, 48); g.stroke();
      // Hebel (Kupplung / Bremse): vorn am Griff, nach innen gebogen, Kugelende
      g.strokeStyle = '#d4d8df'; g.lineWidth = 9; g.beginPath(); g.moveTo(112, 212); g.bezierCurveTo(140, 184, 184, 168, 244, 166); g.stroke();
      g.fillStyle = '#eef1f5'; g.beginPath(); g.arc(246, 166, 8, 0, TAU); g.fill();
      // Griff (schwarzes Gummi mit Rillen)
      g.strokeStyle = '#121316'; g.lineWidth = 56; g.beginPath(); g.moveTo(108, 220); g.lineTo(30, 262); g.stroke();
      g.strokeStyle = 'rgba(255,255,255,.12)'; g.lineWidth = 4;
      for (let t = 0.12; t < 0.95; t += 0.13) { const x = 108 - 78 * t, y = 220 + 42 * t; g.beginPath(); g.moveTo(x - 6, y - 24); g.lineTo(x + 6, y + 24); g.stroke(); }
      // Arm/Ärmel (zum unteren Rand hin) und Handschuh
      g.strokeStyle = dunkler(p.fahrer, 0.2); g.lineWidth = 78; g.beginPath(); g.moveTo(58, 248); g.lineTo(-24, 316); g.stroke();
      g.strokeStyle = heller(p.helm, 0); g.lineWidth = 12; g.beginPath(); g.moveTo(34, 236); g.lineTo(-14, 272); g.stroke();       // Bündchen
      const hg = g.createRadialGradient(70, 230, 6, 74, 244, 76);
      hg.addColorStop(0, heller(p.fahrer, 0.28)); hg.addColorStop(1, dunkler(p.fahrer, 0.28));
      g.fillStyle = hg; g.strokeStyle = dunkler(p.fahrer, 0.5); g.lineWidth = 4;
      g.beginPath(); g.ellipse(74, 240, 66, 44, 0.42, 0, TAU); g.fill(); g.stroke();
      g.strokeStyle = dunkler(p.fahrer, 0.45); g.lineWidth = 3;
      for (let f = -1; f <= 1; f++) { g.beginPath(); g.moveTo(40 + f * 14 + 10, 216 + f * 12); g.lineTo(76 + f * 14, 246 + f * 12 + 6); g.stroke(); }   // Finger
      g.fillStyle = heller(p.fahrer, 0.12); g.strokeStyle = dunkler(p.fahrer, 0.5); g.lineWidth = 3;
      g.beginPath(); g.ellipse(116, 214, 26, 15, -0.5, 0, TAU); g.fill(); g.stroke();                                                 // Daumen
      g.restore();
    }
    g.restore();
    // --- Anzeige-Instrument (steht fest) ---
    const px = cx, py = 100, pr = 92;
    g.save(); g.shadowColor = 'rgba(0,0,0,.6)'; g.shadowBlur = 16; g.shadowOffsetY = 5; g.fillStyle = '#1b1f26'; g.beginPath(); g.arc(px, py, pr, 0, TAU); g.fill(); g.restore();
    gr = g.createLinearGradient(px - pr, py - pr, px + pr, py + pr); gr.addColorStop(0, '#d6dbe2'); gr.addColorStop(0.5, '#6b727d'); gr.addColorStop(1, '#2c3037');
    g.fillStyle = gr; g.beginPath(); g.arc(px, py, pr, 0, TAU); g.fill();
    gr = g.createRadialGradient(px, py - 14, 8, px, py, pr - 8); gr.addColorStop(0, '#1b2634'); gr.addColorStop(1, '#05080c');
    g.fillStyle = gr; g.beginPath(); g.arc(px, py, pr - 9, 0, TAU); g.fill();
    // Drehzahl-Segmente (270°, von links unten über oben nach rechts unten)
    const N = 22, A0 = Math.PI * 0.75, SW = Math.PI * 1.5, an = Math.max(1, Math.round(p.anteil * N));
    g.lineWidth = 11; g.lineCap = 'butt';
    for (let s = 0; s < N; s++) {
      const a0 = A0 + SW * s / N + 0.012, a1 = A0 + SW * (s + 0.8) / N, f = s / N;
      g.strokeStyle = s < an ? (f < 0.6 ? '#35e08a' : f < 0.82 ? '#ffc233' : '#ff4a3a') : 'rgba(255,255,255,.12)';
      g.beginPath(); g.arc(px, py, pr - 22, a0, a1); g.stroke();
    }
    g.lineCap = 'round';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = '#ffffff'; g.font = '800 ' + (p.kmh > 99 ? 48 : 56) + 'px ' + SCHRIFT; g.fillText(String(p.kmh), px, py + 2);
    g.fillStyle = '#7fc4ff'; g.font = '700 15px ' + SCHRIFT; g.fillText('km/h', px, py + 36);
    g.fillStyle = '#ffb347'; g.font = '800 16px ' + SCHRIFT; g.fillText(p.gang, px, py - 40);
    g.strokeStyle = 'rgba(255,255,255,.14)'; g.lineWidth = 3; g.beginPath(); g.arc(px, py, pr - 12, Math.PI * 1.1, Math.PI * 1.55); g.stroke();   // Glanz
  }

  const styl = (e, k) => Object.assign(e.style, k);
  function stilEinbauen() {
    if (document.getElementById('moto-cockpit-stil')) return;
    const s = document.createElement('style'); s.id = 'moto-cockpit-stil';
    s.textContent =
      '.hud-spiegel{visibility:hidden !important}\n' +                       // der eine Rahmen des Autorennens: im Motorradmodus malen wir zwei
      '.cp-moto-spiegel{position:absolute;box-sizing:border-box;border-radius:50%;pointer-events:none;border:5px solid #17191d;' +
        'box-shadow:0 0 0 2px rgba(255,255,255,.24),0 3px 8px rgba(0,0,0,.55),inset 0 0 9px rgba(0,0,0,.55);' +
        'background:linear-gradient(120deg,rgba(255,255,255,.16) 0%,rgba(255,255,255,0) 32%)}\n' +
      '.cp-moto-lenker{position:absolute;pointer-events:none;display:none}\n';
    document.head.appendChild(s);
  }

  class MotoCockpit {
    constructor(anz, hud) {
      this.anz = anz; this.hud = hud; this.aktiv = false; this.spAn = false; this.rpm = 0; this.zeit = 0; this.schluessel = ''; this.letzteZeichnung = 0;
      this.dpr = Math.min(2, window.devicePixelRatio || 1);
      this.canvas = document.createElement('canvas'); this.canvas.className = 'cp-moto-lenker'; this.g = this.canvas.getContext('2d');
      anz.wurzel.appendChild(this.canvas);
      this.rahmen = [0, 1].map((m) => { const d = document.createElement('div'); d.className = 'cp-moto-spiegel ' + (m ? 'rechts' : 'links'); d.style.display = 'none'; anz.wurzel.appendChild(d); return d; });
      this.alterTacho = hud.el.querySelector('.hud-tacho'); this.tachoWeg = null; this.hinweisHoch = false;
      this.layoutKey = '';
    }

    update() {
      const hud = this.hud, spiel = R.spiel, kam = spiel && spiel.kameras && spiel.kameras[hud.nr];
      if (!kam || CFG().aus) { this._aus(); return; }
      const touch = document.documentElement.classList.contains('t-rennen');
      const cockpit = kam.modus === 'cockpit' && R.config.cockpit.an && !touch;
      const sp = !!sichtOrig.call(S, spiel, hud.nr);
      const vw = this.anz.vw || hud.el.clientWidth, vh = this.anz.vh || hud.el.clientHeight;
      const split = spiel.kameras.length > 1;
      // Spiegel-Rahmen
      if (sp) {
        const key = vw + 'x' + vh + (cockpit ? 'c' : 'v') + (split ? 's' : '');
        if (key !== this.layoutKey || !this.spAn) {
          this.layoutKey = key;
          const rs = rechtecke(vw, vh, cockpit, S.rechteck(vw, vh, split), cockpit ? hindernisse(spiel, hud.nr, vw, vh) : null);
          rs.spiegel.forEach((rc, m) => {
            const rand = Math.max(2, Math.min(5, Math.round(rc.h * 0.06)));
            styl(this.rahmen[m], { left: (rc.x - 3) + 'px', top: (rc.y - 3) + 'px', width: (rc.b + 6) + 'px', height: (rc.h + 6) + 'px', borderWidth: rand + 'px', display: 'block' });
          });
          this.rects = rs;
        }
      } else if (this.spAn) this.rahmen.forEach((d) => { d.style.display = 'none'; });
      this.spAn = sp;
      // Lenker + Instrument
      if (cockpit !== this.aktiv) {
        this.aktiv = cockpit; this.canvas.style.display = cockpit ? 'block' : 'none'; this.schluessel = '';
        if (this.alterTacho) this.alterTacho.style.display = cockpit ? 'none' : '';
        if (!cockpit && hud.eHinweis) hud.eHinweis.style.bottom = '';
      }
      if (!cockpit) return;
      const rs = this.rects && this.layoutKey === (vw + 'x' + vh + 'c' + (split ? 's' : '')) ? this.rects : rechtecke(vw, vh, true, S.rechteck(vw, vh, split), hindernisse(spiel, hud.nr, vw, vh));
      const lb = rs.lenker;
      if (!lb) return;
      // Hinweis („Festgefahren? R drücken“) mittig über die Oberkante der Spiegel setzen, sonst läge der breite Text auf ihnen
      if (hud.eHinweis) { const unten = Math.round(vh - Math.min(rs.spiegel[0].y, rs.spiegel[1].y) + 10) + 'px'; if (hud.eHinweis.style.bottom !== unten) hud.eHinweis.style.bottom = unten; }
      const LH = LW / CFG().lenker.seitenverh;
      const cw = Math.max(40, Math.min(Math.round(lb.b * this.dpr), 1000)), ch = Math.max(12, Math.round(cw / CFG().lenker.seitenverh));
      if (this.canvas.width !== cw || this.canvas.height !== ch) { this.canvas.width = cw; this.canvas.height = ch; this.schluessel = ''; }
      styl(this.canvas, { left: lb.x + 'px', top: lb.y + 'px', width: lb.b + 'px', height: lb.h + 'px' });

      const jetzt = performance.now(), dt = Math.min(0.1, (jetzt - (this.zeit || jetzt)) / 1000); this.zeit = jetzt;
      if (jetzt - this.letzteZeichnung < 1000 / (R.config.cockpit.zeichenrate || 30) - 1) return;
      this.letzteZeichnung = jetzt;
      const v = hud.f.vehicle, auto = hud.f.auto, gt = R.cockpit.getriebe(auto, v.vLaengs, v.daten && v.daten.vMax);
      this.rpm += (gt.rpm - this.rpm) * (1 - Math.exp(-14 * Math.max(dt, 0.016)));
      const anteil = klemme((this.rpm - gt.leerlauf) / Math.max(1, gt.begr - gt.leerlauf), 0, 1);
      const kmh = Math.abs(Math.round(v.vLaengs * 3.6)), steer = Math.round(klemme(v.lenkung || 0, -1, 1) * 20) / 20;
      const gang = Math.abs(v.vLaengs) < 0.3 ? 'N' : (gt.gang < 0 ? 'R' : 'GANG ' + gt.gang);
      const key = kmh + '|' + Math.round(anteil * 22) + '|' + gang + '|' + steer + '|' + cw;
      if (key === this.schluessel) return;
      this.schluessel = key;
      const o = (auto && auto.optionen) || {};
      lenkerZeichnen(this.g, cw, ch, LH, { steer, kmh, anteil, gang, bike: auto ? auto.farbe : 0xff6a10, fahrer: auto && auto.farbe2 !== undefined ? auto.farbe2 : 0x1d4ed8,
        helm: o.helm !== undefined ? o.helm : 0xf4f4f4, nr: o.nummer !== undefined ? o.nummer : 1 });
    }

    _aus() {
      if (this.aktiv) { this.aktiv = false; this.canvas.style.display = 'none'; if (this.alterTacho) this.alterTacho.style.display = ''; if (this.hud.eHinweis) this.hud.eHinweis.style.bottom = ''; }
      if (this.spAn) { this.spAn = false; this.rahmen.forEach((d) => { d.style.display = 'none'; }); }
    }
  }
  const fuerHud = R.cockpit.fuerHud;
  R.cockpit.fuerHud = function (hud, wurzel) {
    const anz = fuerHud.apply(this, arguments);
    try {
      stilEinbauen();
      const mc = new MotoCockpit(anz, hud);
      const upd = anz.update.bind(anz), grs = anz.groesse.bind(anz);
      anz.update = function () { upd(); try { mc.update(); } catch (e) { console.error('Motorrad-Cockpit:', e); } };
      anz.groesse = function (vw, vh) { grs(vw, vh); mc.layoutKey = ''; hindCache = {}; };
      anz.moto = mc;
    } catch (e) { console.error('Motorrad-Cockpit (HUD):', e); }
    return anz;
  };

  R.Moto.cockpit.lenkerZeichnen = lenkerZeichnen;
  R.Moto.cockpit.kameras = () => kams;                         // die beiden Spiegel-Kameras (Tests: Blickrichtung)
  R.Moto.cockpit.zustandSpiegel = () => ({ rt: rts.map((a) => a.map((t) => !!t)), groesse: rtB.map((a, i) => a.map((b, m) => [b, rtH[i][m]])) });
  R.Moto.cockpit.installiert = ['FahrzeugKamera.update', 'Spiel.zeichnen', 'rueckspiegel.sichtbar/zeichnen/vorwaermen/zuruecksetzen/entsorgen', 'cockpit.fuerHud'];
})();
