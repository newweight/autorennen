// ============================================================
// Auto-Vorschau für die Autowahl im Menü: echte 3D-Modelle aus dem carBuilder.
//
// Ein zusätzlicher kleiner WebGLRenderer (eigenes Canvas, transparent) wird für ALLES benutzt:
//   1. Kachelbilder (256×160, Front-Dreiviertel-Ansicht): einmal je Auto erzeugt und als dataURL
//      gecacht (bleibt über Menü-Wechsel erhalten).
//   2. „Bühnen": ein großes, langsam rotierendes Auto je Spieler. Der Renderer zeichnet die Bühne
//      und kopiert das Bild per drawImage in das 2D-Canvas der Bühne im Menü-DOM
//      (so genügt ein einziger WebGL-Kontext für beliebig viele Bühnen).
//
// Bedienung der Bühne: Maus-Ziehen dreht frei, drehen(index, ±1) dreht weich um 90°.
// Die Bühne rendert nur, solange sie gebunden ist (eigener requestAnimationFrame-Loop,
// stoppen() beendet ihn). Autos-Gruppen werden nach Gebrauch aus der Szene genommen;
// Geometrien liegen im carBuilder-Cache und werden NICHT disposed.
//
// Debug: Rennspiel.AutoVorschau.winkel(index), .debug.{frames, laeuft, kachelMs}
// ============================================================
(function () {
  const R = window.Rennspiel;

  const KACHEL = { w: 256, h: 160 };
  const GRAD_PRO_SEKUNDE = 25;        // Eigendrehung
  const AZIMUT_KACHEL = 35;           // Front-Dreiviertel
  const NEIGUNG = 15 * Math.PI / 180; // Kamera-Neigung
  const FOV = 26;
  const rad = (g) => g * Math.PI / 180;

  const S = {
    renderer: null, szene: null, kamera: null, platte: null, fehler: false,
    kacheln: {},                       // autoId -> dataURL
    buehnen: [],                       // { canvas, ctx, auto, gruppe, winkel, ziel, zieht, einblenden }
    groesse: { w: 0, h: 0 },
    rafId: 0, laeuft: false, letzteZeit: 0,
  };
  const debug = { frames: 0, laeuft: false, kachelMs: 0, kachelAnzahl: 0 };

  // ---------- Renderer / Szene (lazy) ----------
  function init() {
    if (S.renderer || S.fehler) return !S.fehler;
    try {
      const canvas = document.createElement('canvas');
      const r = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
      r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
      r.setClearColor(0x000000, 0);
      S.renderer = r;
      const szene = new THREE.Scene();
      // Studio-Licht: Hemisphere + 2 Directional (Hauptlicht warm von vorne-links-oben, Aufheller kühl von hinten-rechts)
      szene.add(new THREE.HemisphereLight(0xf2f6ff, 0x7c86a8, 0.95));
      const haupt = new THREE.DirectionalLight(0xfff1dc, 1.05);
      haupt.position.set(-6, 9, 8);
      szene.add(haupt);
      const fuell = new THREE.DirectionalLight(0xb8d0ff, 0.45);
      fuell.position.set(7, 4, -6);
      szene.add(fuell);
      // Bodenplatte der Bühne (flache Scheibe + heller Rand); die Blob-Schatten bringt der carBuilder mit
      const platte = new THREE.Group();
      const scheibe = new THREE.Mesh(new THREE.CylinderGeometry(2.7, 2.8, 0.06, 48),
        new THREE.MeshLambertMaterial({ color: 0x3a4a86 }));
      scheibe.position.y = -0.04;
      const ring = new THREE.Mesh(new THREE.TorusGeometry(2.72, 0.035, 8, 64),
        new THREE.MeshBasicMaterial({ color: 0xffd23a }));
      ring.rotation.x = Math.PI / 2; ring.position.y = -0.005;
      platte.add(scheibe, ring);
      platte.visible = false;
      szene.add(platte);
      S.szene = szene; S.platte = platte;
      S.kamera = new THREE.PerspectiveCamera(FOV, KACHEL.w / KACHEL.h, 0.1, 100);
      r.domElement.addEventListener('webglcontextlost', (e) => { e.preventDefault(); S.fehler = true; stoppen(); });
      return true;
    } catch (e) {
      S.fehler = true;
      return false;
    }
  }

  function groesseSetzen(w, h) {
    if (S.groesse.w === w && S.groesse.h === h) return;
    S.renderer.setSize(w, h, false);
    S.groesse = { w, h };
    S.kamera.aspect = w / h;
    S.kamera.updateProjectionMatrix();
  }

  function abmessung(auto) {
    const a = auto.abmessungen || auto.fahrwerte || {};
    return { L: a.laenge || 4.5, B: a.breite || 1.85 };
  }

  /** Kamera so setzen, dass das Auto bei Azimut `az` (Grad, 0 = von vorne) gut im Bild steht. */
  function kameraSetzen(auto, az, drehbar) {
    const { L, B } = abmessung(auto), k = S.kamera;
    const t = Math.tan(rad(FOV / 2));
    let halbBreite;
    if (drehbar) halbBreite = Math.sqrt((L / 2) ** 2 + (B / 2) ** 2) * 1.22;     // Kreis: passt in jedem Winkel
    else halbBreite = (Math.abs(Math.sin(rad(az))) * L * 0.5 + Math.abs(Math.cos(rad(az))) * B * 0.55 + 0.3) * 0.98;
    const dist = halbBreite / (t * k.aspect);
    k.position.set(0, 0.55 + Math.sin(NEIGUNG) * dist, Math.cos(NEIGUNG) * dist);
    k.lookAt(0, drehbar ? 0.42 : 0.62, 0);
  }

  function gruppeNehmen(auto, farbe) {
    // W3-G: farbe (hex) = Garage-Lack (null/undefined = Original)
    const g = R.carBuilder.bauen(auto, farbe !== undefined && farbe !== null ? { farbe } : undefined);
    g.rotation.order = 'YXZ';
    return g;
  }
  function gruppeEntfernen(g) {
    if (!g) return;
    if (g.parent) g.parent.remove(g);
    const m = g.userData && g.userData.bremslichtMaterial;
    if (m) m.dispose();          // einziges Material, das je Auto neu angelegt wird; Geometrien bleiben im Cache
  }

  // ---------- Kachelbilder ----------
  /** dataURL des Kachelbilds (256×160, transparent) oder null, wenn WebGL nicht verfügbar. W3-G: farbe = Garage-Lack. */
  function kachel(auto, farbe) {
    const schl = farbe !== undefined && farbe !== null && farbe !== auto.farbe ? auto.id + ':' + farbe : auto.id;
    if (S.kacheln[schl]) return S.kacheln[schl];
    if (!init()) return null;
    const t0 = performance.now();
    const alt = S.groesse;
    groesseSetzen(KACHEL.w, KACHEL.h);
    S.platte.visible = false;
    const g = gruppeNehmen(auto, schl === auto.id ? undefined : farbe);
    g.rotation.y = Math.PI - rad(AZIMUT_KACHEL);
    S.szene.add(g);
    kameraSetzen(auto, AZIMUT_KACHEL, false);
    S.renderer.render(S.szene, S.kamera);
    let url = null;
    try { url = S.renderer.domElement.toDataURL('image/png'); } catch (e) { /* egal */ }
    gruppeEntfernen(g);
    if (alt.w) groesseSetzen(alt.w, alt.h);
    if (url) S.kacheln[schl] = url;
    debug.kachelMs += performance.now() - t0; debug.kachelAnzahl++;
    return url;
  }

  /** Alle Kachelbilder erzeugen (einmalig; danach nur noch Cache). */
  function alleKacheln() {
    R.carCatalog.waehlbare().forEach((a) => kachel(a));   // Polizei hat keine Menükachel
    return S.kacheln;
  }

  // ---------- Bühnen ----------
  function buehneGet(i) {
    if (!S.buehnen[i]) S.buehnen[i] = { canvas: null, ctx: null, auto: null, gruppe: null, winkel: AZIMUT_KACHEL, ziel: 0, zieht: false, einblenden: 1 };
    return S.buehnen[i];
  }

  /**
   * Bühne `index` an ein (neues) Canvas im Menü binden und das Auto `auto` zeigen.
   * Ist es dasselbe Auto wie zuvor, bleibt Drehwinkel & Modell erhalten; sonst blendet das neue Auto ein.
   * w,h = Renderauflösung in CSS-Pixeln (Seitenverhältnis fest).
   * W3-G: farbe (hex | null) = Lack für die Garage-Vorschau; nur die Farbe neu → sofortiger Wechsel, Winkel bleibt.
   */
  function binden(index, canvas, auto, w, h, farbe) {
    const lack = farbe !== undefined && farbe !== null ? farbe : null;
    if (!init()) return false;
    groesseSetzen(w, h);
    const b = buehneGet(index);
    if (b.canvas !== canvas) {
      b.canvas = canvas;
      b.ctx = canvas.getContext('2d');
      canvas.width = S.renderer.domElement.width; canvas.height = S.renderer.domElement.height;
      zeigerBinden(b, canvas);
    }
    if (!b.auto || b.auto.id !== auto.id) {
      gruppeEntfernen(b.gruppe);
      b.auto = auto;
      b.lack = lack;
      b.gruppe = gruppeNehmen(auto, lack);
      b.gruppe.visible = false;
      S.szene.add(b.gruppe);
      b.einblenden = 0;
    } else if ((b.lack === undefined ? null : b.lack) !== lack) {
      gruppeEntfernen(b.gruppe);          // nur Lack neu (Garage): ohne Einblenden, gleicher Drehwinkel
      b.lack = lack;
      b.gruppe = gruppeNehmen(auto, lack);
      b.gruppe.visible = false;
      S.szene.add(b.gruppe);
    }
    starten();
    if (b.gruppe && b.einblenden >= 1) zeichneBuehne(b, 0);   // sofort ein Bild (kein Flackern nach Menü-Neuaufbau)
    return true;
  }

  function zeigerBinden(b, canvas) {
    let letzteX = 0;
    canvas.addEventListener('pointerdown', (e) => {
      b.zieht = true; letzteX = e.clientX;
      try { canvas.setPointerCapture(e.pointerId); } catch (x) { /* egal */ }
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!b.zieht) return;
      b.winkel -= (e.clientX - letzteX) * 0.6;     // nach rechts ziehen = Auto dreht sich nach rechts
      letzteX = e.clientX;
    });
    const aus = () => { b.zieht = false; };
    canvas.addEventListener('pointerup', aus);
    canvas.addEventListener('pointercancel', aus);
    canvas.addEventListener('lostpointercapture', aus);
  }

  /** Bühne weich um richtung × 90° drehen (+1 = nach rechts). */
  function drehen(index, richtung) {
    const b = S.buehnen[index];
    if (b) b.ziel -= 90 * richtung;   // Winkel = Kamera-Azimut: kleiner = Front dreht nach rechts
  }
  function winkel(index) { const b = S.buehnen[index]; return b ? b.winkel : null; }
  function autoId(index) { const b = S.buehnen[index]; return b && b.auto ? b.auto.id : null; }
  /** W3-G: Lack der Bühne (hex) – Katalogfarbe, wenn kein Garage-Lack. */
  function lack(index) { const b = S.buehnen[index]; return b && b.gruppe ? b.gruppe.userData.lackFarbe : null; }

  /** Nur die ersten n Bühnen bleiben aktiv (z. B. Wechsel Zwei → Solo). */
  function behalten(n) {
    for (let i = S.buehnen.length - 1; i >= n; i--) {
      gruppeEntfernen(S.buehnen[i].gruppe);
      S.buehnen.pop();
    }
  }

  function starten() {
    if (S.laeuft) return;
    S.laeuft = true; debug.laeuft = true; S.letzteZeit = 0;
    S.rafId = requestAnimationFrame(schleife);
  }
  function stoppen() {
    S.laeuft = false; debug.laeuft = false;
    if (S.rafId) cancelAnimationFrame(S.rafId);
    S.rafId = 0;
    S.buehnen.forEach((b) => { gruppeEntfernen(b.gruppe); b.gruppe = null; b.auto = null; b.canvas = null; b.ctx = null; });
    S.buehnen.length = 0;
    if (S.platte) S.platte.visible = false;
  }

  function schleife(t) {
    if (!S.laeuft) return;
    S.rafId = requestAnimationFrame(schleife);
    const dt = S.letzteZeit ? Math.min(0.1, (t - S.letzteZeit) / 1000) : 0;
    S.letzteZeit = t;
    debug.frames++;
    S.buehnen.forEach((b) => zeichneBuehne(b, dt));
  }

  function zeichneBuehne(b, dt) {
    if (!b.gruppe || !b.canvas || !b.canvas.isConnected) return;
    S.platte.visible = true;
    S.buehnen.forEach((x) => { if (x.gruppe) x.gruppe.visible = false; });
    // Winkel fortschreiben
    if (!b.zieht) b.winkel += GRAD_PRO_SEKUNDE * dt;
    if (Math.abs(b.ziel) > 0.05) {
      const schritt = b.ziel * (1 - Math.exp(-7 * dt));
      b.winkel += schritt; b.ziel -= schritt;
    } else b.ziel = 0;
    b.einblenden = Math.min(1, b.einblenden + dt / 0.35);
    const e = 1 - Math.pow(1 - b.einblenden, 3);
    b.gruppe.visible = true;
    b.gruppe.rotation.y = Math.PI - rad(b.winkel);
    b.gruppe.scale.setScalar(0.7 + 0.3 * e);
    kameraSetzen(b.auto, 0, true);
    const ab = abmessung(b.auto);
    S.platte.scale.setScalar(Math.sqrt((ab.L / 2) ** 2 + (ab.B / 2) ** 2) / 2.7);
    S.renderer.render(S.szene, S.kamera);
    const c = b.canvas, ctx = b.ctx;
    if (c.width !== S.renderer.domElement.width) { c.width = S.renderer.domElement.width; c.height = S.renderer.domElement.height; }
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.globalAlpha = e;
    ctx.drawImage(S.renderer.domElement, 0, 0);
    ctx.globalAlpha = 1;
    b.gruppe.visible = false;
  }

  /** S2 (additiv): Modell der Bühne `index` neu bauen (z. B. nach Tuning-Teilen); Lack und Drehwinkel bleiben. */
  function neuBauen(index) {
    const b = S.buehnen[index];
    if (!b || !b.auto || !b.gruppe) return false;
    gruppeEntfernen(b.gruppe);
    b.gruppe = gruppeNehmen(b.auto, b.lack);
    b.gruppe.visible = false;
    S.szene.add(b.gruppe);
    if (b.einblenden >= 1) zeichneBuehne(b, 0);
    return true;
  }

  R.AutoVorschau = { neuBauen, kachel, alleKacheln, binden, behalten, drehen, winkel, autoId, lack, stoppen, debug,
    get verfuegbar() { return init(); }, get laeuft() { return S.laeuft; } };
})();
