/* Schach3D – Board3DView (SchachSpiel.swift ~4822–5940) nach Three.js. Kern: Szene, Kamera, Eingabe, Stellung, Markierungen.
 * Kampfszenen/Effekte: kampf3d.js (erweitert Schach3D.prototype). API: siehe API.md */
(function (g) {
  'use strict';
  const THREE = g.THREE, A = g.Schach3DAktionen, F = g.Figuren3D;
  const PI = Math.PI;
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const C = F.C;
  const TYPEN_START = { queen: 1, rook: 2, bishop: 2, knight: 2, pawn: 8 };

  const THEMEN = [   // BoardTheme.themes
    { name: 'Klassik Grün', hell: [0.93, 0.93, 0.82], dunkel: [0.46, 0.59, 0.34], rand: [0.28, 0.40, 0.22] },
    { name: 'Holz', hell: [0.94, 0.85, 0.71], dunkel: [0.63, 0.43, 0.27], rand: [0.38, 0.24, 0.13] },
    { name: 'Ozean', hell: [0.87, 0.92, 0.96], dunkel: [0.32, 0.50, 0.70], rand: [0.16, 0.28, 0.42] },
    { name: 'Candy', hell: [0.99, 0.93, 0.96], dunkel: [0.85, 0.51, 0.68], rand: [0.55, 0.25, 0.42] },
    { name: 'Nacht', hell: [0.62, 0.64, 0.68], dunkel: [0.28, 0.30, 0.36], rand: [0.12, 0.13, 0.16] },
    { name: 'Turnier Braun', hell: [0.94, 0.89, 0.79], dunkel: [0.71, 0.53, 0.39], rand: [0.42, 0.29, 0.19] },
  ];
  const STUFEN = [   // adaptive Qualität: 0 hoch · 1 mittel · 2 niedrig
    { name: 'hoch', dpr: 2, schatten: 2048, partikel: 1.0 },
    { name: 'mittel', dpr: 1.5, schatten: 1024, partikel: 0.7 },
    { name: 'niedrig', dpr: 1, schatten: 1024, partikel: 0.4 },
  ];

  const pos = (r, c) => ({ row: r, col: c });
  const sqKey = (r, c) => r * 8 + c;

  class Schach3D {
    constructor(container, optionen) {
      const o = this.opt = Object.assign({ hunde: false, kampf: true, autoWenden: false, thema: 0, qualitaet: 'auto', manuell: false,
        koordinaten: true, tisch: true, onFeldKlick: null, ansichtVonSchwarz: false }, optionen || {});
      this.container = container;
      this._hunde = !!o.hunde; this._kampf = o.kampf !== false; this._auto = !!o.autoWenden;
      this._onKlick = o.onFeldKlick;
      this.gitter = null;                      // aktuelle Stellung (8x8)
      this.pieces = new Map();                 // sqKey -> Group
      this._tags = new Map();                  // sqKey -> Text
      this._animiert = false; this._token = 0; this._pendingGrid = null; this._pendingPromo = null; this._abschluss = null;
      this._graveSig = ''; this._fx = []; this._pulse = [];
      this._kam = { az: o.ansichtVonSchwarz ? PI : 0, el: 0.80, dist: 12.4 }; this._schwarz = !!o.ansichtVonSchwarz; this._tween = null;
      this._shake = null; this._dirty = true; this._zerstoert = false;
      this.akt = new A.Laeufer();
      this._stufe = o.qualitaet === 'auto' ? (this._istMobil() ? 1 : 0) : Math.max(0, STUFEN.findIndex(s => s.name === o.qualitaet));
      this._adaptiv = o.qualitaet === 'auto'; this._ft = { n: 0, sum: 0, gut: 0 };
      this._baueRenderer(); this._baueSzene(); this._baueEingabe();
      F.setzeDetail(this._stufe === 0 ? 2 : this._stufe === 1 ? 1 : 0);
      this.setzeStellung(null);
      this.groesseAnpassen();
      this._letzt = performance.now();
      if (!o.manuell) this._raf = requestAnimationFrame(t => this._schleife(t));
    }

    _istMobil() { return /iPad|iPhone|Android/.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && /Mac/.test(navigator.platform)); }

    // ------------------------------------------------------------------ Renderer & Szene
    _baueRenderer() {
      const r = this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
      r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFSoftShadowMap;
      r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 0.95;
      r.setPixelRatio(Math.min(g.devicePixelRatio || 1, STUFEN[this._stufe].dpr));
      const cv = this.canvas = r.domElement;
      cv.style.cssText = 'display:block;width:100%;height:100%;touch-action:none;outline:none;user-select:none;-webkit-user-select:none';
      cv.tabIndex = 0;
      this.container.appendChild(cv);
    }

    _baueSzene() {
      const sc = this.scene = new THREE.Scene();
      sc.background = this._hintergrund();
      sc.fog = new THREE.FogExp2(C(0.075, 0.058, 0.046), 0.022);
      sc.environment = this._umgebung();
      this.welt = new THREE.Group(); sc.add(this.welt);
      this.piecesRoot = new THREE.Group(); this.overlayRoot = new THREE.Group(); this.graveRoot = new THREE.Group();
      this.labelRoot = new THREE.Group(); this.fxRoot = new THREE.Group();
      this.welt.add(this.piecesRoot, this.overlayRoot, this.graveRoot, this.labelRoot, this.fxRoot);

      // Tisch (dunkles Holz, leicht glänzend)
      if (this.opt.tisch) {
        const tex = this._holzTextur();
        tex.anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());
        const tisch = new THREE.Mesh(new THREE.CircleGeometry(60, 48),
          new THREE.MeshStandardMaterial({ map: tex, roughness: 0.5, metalness: 0 }));
        tisch.rotation.x = -PI / 2; tisch.position.y = -0.32; tisch.receiveShadow = true;
        this.welt.add(tisch); this.tischMesh = tisch;
      }
      // Rahmen
      const s = new THREE.Shape(); const h = 9.16 / 2;
      s.moveTo(-h, -h); s.lineTo(h, -h); s.lineTo(h, h); s.lineTo(-h, h); s.closePath();
      const rg = new THREE.ExtrudeGeometry(s, { depth: 0.16, bevelEnabled: true, bevelThickness: 0.07, bevelSize: 0.07, bevelSegments: 3 });
      rg.translate(0, 0, -0.08); rg.rotateX(-PI / 2);
      this.rahmenMat = new THREE.MeshStandardMaterial({ roughness: 0.35, metalness: 0 });
      this.rahmen = new THREE.Mesh(rg, this.rahmenMat); this.rahmen.position.y = -0.165; this.rahmen.receiveShadow = true; this.rahmen.castShadow = false;
      this.welt.add(this.rahmen);
      // 64 Felder als InstancedMesh (1 Draw-Call)
      this.fliesenMat = new THREE.MeshStandardMaterial({ roughness: 0.7, metalness: 0 });
      this.fliesen = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 0.1, 1), this.fliesenMat, 64);
      const m = new THREE.Matrix4();
      for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) { m.makeTranslation(c - 3.5, -0.05, r - 3.5); this.fliesen.setMatrixAt(sqKey(r, c), m); }
      this.fliesen.receiveShadow = true; this.fliesen.frustumCulled = false;
      this.welt.add(this.fliesen);
      this.setzeThema(this.opt.thema);
      if (this.opt.koordinaten) this._koordinaten();

      // Licht: warmes Hauptlicht mit weichen Schatten, kühles Fülllicht, Grundhelligkeit
      this.ambient = new THREE.AmbientLight(C(1, 0.95, 0.88), 0.35); sc.add(this.ambient);
      const key = this.key = new THREE.DirectionalLight(C(1, 0.96, 0.9), 2.6);
      key.position.set(4.5, 11, 6.5); key.target.position.set(0, 0, 0);
      key.castShadow = true;
      const sh = key.shadow; sh.camera.left = -6.6; sh.camera.right = 6.6; sh.camera.top = 6.6; sh.camera.bottom = -6.6;
      sh.camera.near = 2; sh.camera.far = 30; sh.bias = -0.0004; sh.normalBias = 0.02; sh.radius = 3;
      sh.mapSize.set(STUFEN[this._stufe].schatten, STUFEN[this._stufe].schatten);
      sc.add(key, key.target);
      const fill = new THREE.DirectionalLight(C(0.75, 0.82, 1), 0.75); fill.position.set(-7, 6, -5); sc.add(fill);
      // Blitz-Lichter (feste Anzahl, damit sich die Shader nie neu übersetzen)
      this.blitze = [];
      for (let i = 0; i < 3; i++) { const l = new THREE.PointLight(0xffffff, 0, 7, 2); l.userData.frei = true; l.visible = true; sc.add(l); this.blitze.push(l); }

      // Kamera: Umlaufbahn um die Brettmitte
      this.kamera = new THREE.PerspectiveCamera(40, 1, 0.1, 200);
      this.ziel = V(0, -0.3, 0.35);
      this._kameraAktualisieren();
    }

    _hintergrund() {
      const cv = document.createElement('canvas'); cv.width = cv.height = 256;
      const c = cv.getContext('2d');
      const gr = c.createRadialGradient(128, 90, 0, 128, 90, 220);
      gr.addColorStop(0, 'rgb(77,56,38)'); gr.addColorStop(1, 'rgb(18,14,11)');
      c.fillStyle = gr; c.fillRect(0, 0, 256, 256);
      const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
    }

    /** Umgebungslicht für die PBR-Materialien: Verlauf + zwei Softboxen (wie environmentImage) */
    _umgebung() {
      const cv = document.createElement('canvas'); cv.width = 512; cv.height = 256;
      const c = cv.getContext('2d');
      const gr = c.createLinearGradient(0, 0, 0, 256);
      gr.addColorStop(0, 'rgb(235,224,204)'); gr.addColorStop(0.5, 'rgb(115,102,87)'); gr.addColorStop(1, 'rgb(26,20,15)');
      c.fillStyle = gr; c.fillRect(0, 0, 512, 256);
      c.fillStyle = 'rgba(255,255,255,0.95)'; c.fillRect(512 * 0.12, 256 * 0.10, 512 * 0.18, 256 * 0.20);
      c.fillStyle = 'rgba(255,255,255,0.6)'; c.fillRect(512 * 0.62, 256 * 0.12, 512 * 0.12, 256 * 0.14);
      const t = new THREE.CanvasTexture(cv); t.mapping = THREE.EquirectangularReflectionMapping; t.colorSpace = THREE.SRGBColorSpace;
      const pm = new THREE.PMREMGenerator(this.renderer);
      const env = pm.fromEquirectangular(t).texture;
      pm.dispose(); t.dispose();
      return env;
    }

    _holzTextur() {
      // dunkles Holz mit breiten Bohlen, weicher Maserung und Ästen (prozedural, nahtlos kachelbar)
      const W = 512, cv = document.createElement('canvas'); cv.width = cv.height = W;
      const c = cv.getContext('2d');
      let s = 4711; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
      const planken = 4, pb = W / planken;
      for (let p = 0; p < planken; p++) {
        const k = 0.85 + rnd() * 0.3;
        c.fillStyle = 'rgb(' + Math.round(52 * k) + ',' + Math.round(35 * k) + ',' + Math.round(22 * k) + ')';
        c.fillRect(p * pb, 0, pb, W);
        for (let i = 0; i < 46; i++) {      // lange, leicht gewellte Fasern
          const x0 = p * pb + rnd() * pb, ph = rnd() * 6, am = 1 + rnd() * 3, wl = 90 + rnd() * 200;
          c.strokeStyle = rnd() < 0.55 ? 'rgba(20,10,4,' + (0.05 + rnd() * 0.10) + ')' : 'rgba(130,88,52,' + (0.03 + rnd() * 0.06) + ')';
          c.lineWidth = 0.6 + rnd() * 2.2; c.beginPath();
          for (let y = 0; y <= W; y += 16) { const x = x0 + Math.sin(y / wl * 6.28 + ph) * am; y === 0 ? c.moveTo(x, y) : c.lineTo(x, y); }
          c.stroke();
        }
        const ast = rnd() * W, ax = p * pb + pb * (0.25 + rnd() * 0.5);   // ein Ast je Bohle
        for (let r = 3; r < 22; r += 3) { c.strokeStyle = 'rgba(15,7,3,' + (0.16 - r * 0.005) + ')'; c.lineWidth = 1.5; c.beginPath(); c.ellipse(ax, ast, r * 0.55, r * 1.5, 0, 0, 7); c.stroke(); }
        c.fillStyle = 'rgba(0,0,0,0.5)'; c.fillRect(p * pb, 0, 2, W);          // Fuge
      }
      const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(6, 6);
      return t;
    }

    _koordinaten() {
      const mats = {};
      const mach = ch => {
        if (mats[ch]) return mats[ch];
        const cv = document.createElement('canvas'); cv.width = cv.height = 64;
        const c = cv.getContext('2d'); c.font = "bold 44px 'Helvetica Neue',Arial,sans-serif"; c.textAlign = 'center'; c.textBaseline = 'middle';
        c.fillStyle = 'rgba(245,230,199,0.9)'; c.fillText(ch, 32, 34);
        const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
        return (mats[ch] = new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false, fog: false, polygonOffset: true, polygonOffsetFactor: -2 }));
      };
      const geo = new THREE.PlaneGeometry(0.36, 0.36);
      this.labelHalter = [];
      const label = (ch, x, z) => {
        const m = new THREE.Mesh(geo, mach(ch)); m.rotation.x = -PI / 2;
        const h = new THREE.Group(); h.position.set(x, -0.004 + 0.002, z); h.add(m); this.labelRoot.add(h); this.labelHalter.push(h);
      };
      for (let c = 0; c < 8; c++) { const f = String.fromCharCode(97 + c); label(f, c - 3.5, 4.32); label(f, c - 3.5, -4.32); }
      for (let r = 0; r < 8; r++) { label(String(8 - r), -4.32, r - 3.5); label(String(8 - r), 4.32, r - 3.5); }
    }

    /** Brett-Thema (Index 0..5 oder Objekt {hell,dunkel,rand} mit RGB 0..1) */
    setzeThema(t) {
      const th = typeof t === 'object' && t ? t : THEMEN[((t | 0) % THEMEN.length + THEMEN.length) % THEMEN.length];
      for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
        const f = (r + c) % 2 === 1 ? th.dunkel : th.hell;
        this.fliesen.setColorAt(sqKey(r, c), new THREE.Color().setRGB(f[0], f[1], f[2], THREE.SRGBColorSpace));
      }
      this.fliesen.instanceColor.needsUpdate = true;
      this.rahmenMat.color.setRGB(th.rand[0], th.rand[1], th.rand[2], THREE.SRGBColorSpace);
      this._dirty = true;
    }
    static get THEMEN() { return THEMEN; }

    // ------------------------------------------------------------------ Kamera
    _kameraAktualisieren() {
      const k = this._kam, cam = this.kamera;
      const sx = Math.sin(k.az), cz = Math.cos(k.az);
      const r = k.dist * Math.cos(k.el);
      let ox = 0, oy = 0;
      if (this._shake) { ox = this._shake.x; oy = this._shake.y; }
      cam.position.set(r * sx + ox * cz, k.dist * Math.sin(k.el) + oy, r * cz - ox * sx);
      this.ziel.set(0.35 * sx, -0.3, 0.35 * cz);
      cam.lookAt(this.ziel);
      const quart = Math.round(k.az / (PI / 2)) * (PI / 2);
      if (this.labelHalter) for (const h of this.labelHalter) h.rotation.y = quart;
      this._dirty = true;
    }

    _projektion() {
      const w = this.breite, h = this.hoehe;
      const asp = w / Math.max(1, h);
      this.kamera.aspect = asp;
      this.kamera.fov = asp < 1.25 ? 2 * Math.atan(Math.tan(59 * PI / 360) / asp) * 180 / PI : 40;
      this.kamera.updateProjectionMatrix();
    }

    groesseAnpassen() {
      const w = Math.max(10, this.container.clientWidth), h = Math.max(10, this.container.clientHeight);
      this.breite = w; this.hoehe = h;
      this.renderer.setSize(w, h, false);
      this._projektion(); this._dirty = true;
    }

    /** Brett wenden: Blick von Schwarz (true) oder Weiß (false) – mit Kamerafahrt (1 s, Ease-in-out).
     *  Ohne Argument: umschalten. Gibt ein Promise zurück (fertig, wenn die Kamera steht). */
    wenden(schwarz, animiert) {
      if (schwarz === undefined || schwarz === null) schwarz = !this._schwarz;
      this._schwarz = !!schwarz;
      const ziel = this._schwarz ? PI : 0, zw = 2 * PI;
      const neu = Math.round((this._kam.az - ziel) / zw) * zw + ziel;   // nächstliegende Entsprechung (kürzester Weg)
      return this._fahre({ az: neu }, animiert !== false ? 1.0 : 0);
    }

    /** Kamera direkt setzen (Azimut/Neigung in rad, Abstand 6.5..24) – ohne Fahrt */
    kameraSetzen(az, el, dist) {
      const k = this._kam; if (az !== undefined) k.az = az; if (el !== undefined) k.el = Math.min(1.45, Math.max(0.30, el)); if (dist !== undefined) k.dist = Math.min(24, Math.max(6.5, dist));
      this._tween = null; this._kameraAktualisieren(); return this;
    }

    /** Kamera in Ausgangsstellung (Neigung/Abstand) – Swift resetCamera */
    kameraZuruecksetzen() { return this._fahre({ el: 0.80, dist: 12.4 }, 1.0); }

    _fahre(ziel, dauer) {
      const k = this._kam;
      const von = { az: k.az, el: k.el, dist: k.dist };
      const nach = Object.assign({}, von, ziel);
      if (this._tween) { const alt = this._tween; this._tween = null; alt.res(); }
      if (!dauer) { Object.assign(k, nach); this._kameraAktualisieren(); return Promise.resolve(); }
      return new Promise(res => { this._tween = { t: 0, d: dauer, von, nach, res }; this._dirty = true; });
    }

    autoWenden(an) { this._auto = an !== false; return this; }
    hunde(an) {
      const neu = an !== false; if (neu === this._hunde) return this;
      this._hunde = neu;
      if (this._animiert) this._beendeSofort();
      this._graveSig = ''; this._sync(this.gitter); return this;
    }
    kampf(an) { this._kampf = an !== false; return this; }
    onFeldKlick(cb) { this._onKlick = cb; return this; }
    get ansichtVonSchwarz() { return this._schwarz; }
    get animiert() { return this._animiert; }

    // ------------------------------------------------------------------ Eingabe (Maus / Touch / Rad / Pinch)
    _baueEingabe() {
      const cv = this.canvas, ptr = this._ptr = new Map();
      let start = null, gezogen = false, vor = null;
      const pos2 = e => { const r = cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
      this._h = {
        down: e => {
          try { cv.setPointerCapture(e.pointerId); } catch (x) { /* synthetische Zeiger */ }
          ptr.set(e.pointerId, pos2(e));
          if (ptr.size === 1) { start = pos2(e); gezogen = false; vor = start; this._tween = null; }
          else { gezogen = true; this._pinch = null; }
          e.preventDefault();
        },
        move: e => {
          if (!ptr.has(e.pointerId)) return;
          const p = pos2(e); ptr.set(e.pointerId, p);
          const k = this._kam;
          if (ptr.size === 1) {
            if (!gezogen && Math.hypot(p.x - start.x, p.y - start.y) > 5) gezogen = true;
            if (gezogen) {
              k.az -= (p.x - vor.x) * 0.008;
              k.el = Math.min(1.45, Math.max(0.30, k.el + (p.y - vor.y) * 0.006));
              this._kameraAktualisieren();
            }
            vor = p;
          } else if (ptr.size === 2) {
            const [a, b] = [...ptr.values()];
            const d = Math.hypot(a.x - b.x, a.y - b.y), w = Math.atan2(b.y - a.y, b.x - a.x);
            if (this._pinch) {
              k.dist = Math.min(24, Math.max(6.5, k.dist * this._pinch.d / Math.max(1, d)));
              let dw = w - this._pinch.w; if (dw > PI) dw -= 2 * PI; if (dw < -PI) dw += 2 * PI;
              k.az -= dw;
              this._kameraAktualisieren();
            }
            this._pinch = { d, w };
          }
          e.preventDefault();
        },
        up: e => {
          if (!ptr.has(e.pointerId)) return;
          const p = pos2(e);
          const war1 = ptr.size === 1;
          ptr.delete(e.pointerId); this._pinch = null;
          if (war1 && !gezogen && e.type === 'pointerup') {
            const sq = this._feldBei(p.x, p.y);
            if (sq && this._onKlick) this._onKlick(sq.row, sq.col);
          }
          if (ptr.size === 1) { vor = [...ptr.values()][0]; gezogen = true; }
        },
        wheel: e => {
          const k = this._kam;
          if (e.ctrlKey) k.dist *= 1 + e.deltaY * 0.01;          // Trackpad-Pinch
          else k.dist += e.deltaY * (e.deltaMode === 1 ? 0.2 : 0.006);
          k.dist = Math.min(24, Math.max(6.5, k.dist));
          this._kameraAktualisieren(); e.preventDefault();
        },
        ctx: e => e.preventDefault(),
        dbl: () => {},
      };
      cv.addEventListener('pointerdown', this._h.down);
      cv.addEventListener('pointermove', this._h.move);
      cv.addEventListener('pointerup', this._h.up);
      cv.addEventListener('pointercancel', this._h.up);
      cv.addEventListener('wheel', this._h.wheel, { passive: false });
      cv.addEventListener('contextmenu', this._h.ctx);
      if (typeof ResizeObserver !== 'undefined') { this._ro = new ResizeObserver(() => this.groesseAnpassen()); this._ro.observe(this.container); }
      else { this._rz = () => this.groesseAnpassen(); g.addEventListener('resize', this._rz); }
      this._ray = new THREE.Raycaster(); this._ebene = new THREE.Plane(V(0, 1, 0), 0);
    }

    /** Feld unter einem Bildschirmpunkt: erst Figuren (Raycast), dann Brettebene – wie square(at:) */
    _feldBei(x, y) {
      const ndc = new THREE.Vector2(x / this.breite * 2 - 1, -(y / this.hoehe) * 2 + 1);
      this._ray.setFromCamera(ndc, this.kamera);
      this.kamera.updateMatrixWorld();
      const hits = this._ray.intersectObjects(this.piecesRoot.children, true);
      for (const h of hits) {
        let n = h.object; if (n.userData.keinTreffer) continue;
        while (n && n.parent !== this.piecesRoot) n = n.parent;
        if (n && n.userData.sq) return pos(n.userData.sq[0], n.userData.sq[1]);
      }
      const p = V(); 
      if (this._ray.ray.intersectPlane(this._ebene, p)) {
        if (Math.abs(p.x) < 4 && Math.abs(p.z) < 4) return pos(Math.min(7, Math.floor(p.z + 4)), Math.min(7, Math.floor(p.x + 4)));
      }
      return null;
    }
    /** Bildschirmposition (px relativ zum Container) eines Feldes – für Tests */
    feldBildschirm(row, col, hoehe) {
      const v = V(col - 3.5, hoehe || 0, row - 3.5).project(this.kamera);
      return { x: (v.x + 1) / 2 * this.breite, y: (1 - v.y) / 2 * this.hoehe };
    }

    // ------------------------------------------------------------------ Stellung
    squareCenter(r, c) { return V(c - 3.5, 0, r - 3.5); }

    _neuePiece(farbe, typ) { return F.erzeuge(farbe, typ, this._hunde); }

    /** Figuren an die Stellung anpassen (bestehende Knoten werden wiederverwendet) */
    _sync(gitter) {
      this.gitter = gitter ? gitter.map(z => z.slice()) : null;
      for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
        const k = sqKey(r, c), want = gitter ? gitter[r][c] : null;
        const node = this.pieces.get(k);
        if (node) {
          if (want && node.userData.key === (this._hunde ? 'd' : 'k') + want.color + want.type) {
            this.akt.stopp(node);
            node.position.set(c - 3.5, 0, r - 3.5); node.scale.set(1, 1, 1); node.quaternion.identity(); node.visible = true;
            if (node.userData._eigeneMat) this._materialZurueck(node);
            node.userData.sq = [r, c];
            continue;
          }
          this.piecesRoot.remove(node); this.pieces.delete(k);
        }
        if (want) {
          const n = this._neuePiece(want.color, want.type);
          n.position.set(c - 3.5, 0, r - 3.5); n.userData.sq = [r, c];
          this.piecesRoot.add(n); this.pieces.set(k, n);
        }
      }
      for (const n of [...this.piecesRoot.children]) if (![...this.pieces.values()].includes(n)) this.piecesRoot.remove(n);
      this._graveyard(gitter);
      this._namensschilder();
      if (this._hunde) F.billboards(this.piecesRoot, this.kamera.position);
      this._dirty = true;
    }

    _materialZurueck(node) {   // Leucht-/Ausblend-Effekte rückgängig machen (eigene Material-Kopien weiterverwenden)
      A.setzeDeckkraft(node, 1);
      for (const m of node.userData._eigeneMat) if (m.emissive) m.emissive.setRGB(0, 0, 0);
    }

    /** Geschlagene Figuren liegen neben dem Brett (Weiß links, Schwarz rechts aus Sicht von Weiß) */
    _graveyard(gitter) {
      const listen = { white: [], black: [] };
      if (gitter) for (const farbe of ['white', 'black']) {
        const cnt = {};
        for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) { const p = gitter[r][c]; if (p && p.color === farbe) cnt[p.type] = (cnt[p.type] || 0) + 1; }
        for (const t of ['queen', 'rook', 'bishop', 'knight', 'pawn']) for (let i = 0; i < Math.max(0, TYPEN_START[t] - (cnt[t] || 0)); i++) listen[farbe].push(t);
      }
      const sig = listen.white.join() + '|' + listen.black.join() + '|' + this._hunde;
      if (sig === this._graveSig) return;
      this._graveSig = sig;
      this.graveRoot.clear();
      for (const farbe of ['white', 'black']) {
        const x0 = farbe === 'white' ? -4.95 : 4.95, step = farbe === 'white' ? -0.55 : 0.55;
        listen[farbe].forEach((t, i) => {
          const n = this._neuePiece(farbe, t);
          n.name = 'grab'; n.scale.setScalar(0.5);
          n.position.set(x0 + step * Math.floor(i / 8), -0.32, 3.2 - (i % 8) * 0.85);
          this.graveRoot.add(n);
        });
      }
    }

    /** gitter: 8x8 {color,type}|null, Zeile 0 = Reihe 8 (Schwarz oben). null = leeres Brett. */
    setzeStellung(gitter) {
      if (this._animiert) { this._pendingGrid = gitter; return this; }
      this._sync(gitter); return this;
    }

    // Namensschilder über getauften Figuren
    namensschild(p, text) {
      const k = sqKey(p.row, p.col);
      if (text) this._tags.set(k, String(text).slice(0, 12)); else this._tags.delete(k);
      if (!this._animiert) this._namensschilder();
      return this;
    }
    _namensschilder() {
      for (const n of this.pieces.values()) for (const ch of [...n.children]) if (ch.name === 'namensschild') { n.remove(ch); ch.material.map.dispose(); ch.material.dispose(); }
      for (const [k, text] of [...this._tags]) {
        const n = this.pieces.get(k);
        if (!n) { this._tags.delete(k); continue; }
        const weiss = n.userData.farbe === 'white';
        const cv = document.createElement('canvas'), c = cv.getContext('2d');
        const font = "bold 44px 'Helvetica Neue',Arial,sans-serif"; c.font = font;
        const w = Math.ceil(c.measureText(text).width + 44), h = 62;
        cv.width = w; cv.height = h;
        c.fillStyle = weiss ? 'rgb(41,107,64)' : 'rgb(140,38,38)';
        c.beginPath(); c.roundRect ? c.roundRect(2, 2, w - 4, h - 4, h / 2 - 2) : c.rect(2, 2, w - 4, h - 4); c.fill();
        c.strokeStyle = 'rgba(255,255,255,0.85)'; c.lineWidth = 3; c.beginPath();
        c.roundRect ? c.roundRect(3, 3, w - 6, h - 6, h / 2 - 3) : c.rect(3, 3, w - 6, h - 6); c.stroke();
        c.font = font; c.fillStyle = '#fff'; c.textBaseline = 'middle'; c.fillText(text, 22, h / 2 + 2);
        const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
        const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, depthWrite: false, fog: false }));
        sp.name = 'namensschild'; sp.scale.set(w * 0.0045, h * 0.0045, 1); sp.renderOrder = 50;
        sp.position.y = n.userData.hoehe + 0.28; sp.raycast = () => {}; sp.userData.keinTreffer = true; sp.userData._keinKlon = true;
        n.add(sp);
      }
      this._dirty = true;
    }

    // ------------------------------------------------------------------ Markierungen
    _geo(k, f) { this._geoC = this._geoC || {}; return this._geoC[k] || (this._geoC[k] = f()); }
    _glow(hex, a) {
      this._glowC = this._glowC || {};
      const k = hex + a;
      return this._glowC[k] || (this._glowC[k] = new THREE.MeshBasicMaterial({ color: hex, transparent: a < 1, opacity: a, fog: false, depthWrite: false }));
    }
    _flach(rgb, a) {
      this._flachC = this._flachC || {};
      const k = rgb.join() + a;
      return this._flachC[k] || (this._flachC[k] = new THREE.MeshBasicMaterial({ color: new THREE.Color().setRGB(rgb[0], rgb[1], rgb[2], THREE.SRGBColorSpace), transparent: true, opacity: a, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, side: THREE.DoubleSide }));
    }
    _pulsMat(rgb) {   // Material mit pulsierender Deckkraft (fadeOpacity 0.35 <-> 1.0, je 0.55 s)
      this._pulsC = this._pulsC || {};
      const k = rgb.join(); this._pulsAktiv = true;
      if (!this._pulsC[k]) {
        const m = new THREE.MeshBasicMaterial({ color: new THREE.Color().setRGB(rgb[0], rgb[1], rgb[2], THREE.SRGBColorSpace), transparent: true, depthWrite: false, fog: false, polygonOffset: true, polygonOffsetFactor: -2, side: THREE.DoubleSide });
        this._pulsC[k] = m; this._pulse.push(m);
      }
      return this._pulsC[k];
    }

    /** Zielfelder (grüne Punkte), Schlagfelder (rote Ringe), dazu optional extras:
     *  { ausgewaehlt, letzterZug:{from,to}, schach, gefahr:[...], fokus, hinweis:{from,to} } */
    markiere(ziele, schlaege, extras) {
      const ex = extras || {};
      this.overlayRoot.clear(); this._pulsAktiv = false;
      const flach = (rgb, a, p, y) => {
        const m = new THREE.Mesh(this._geo('flach', () => new THREE.PlaneGeometry(0.98, 0.98)), this._flach(rgb, a));
        m.rotation.x = -PI / 2; m.position.set(p.col - 3.5, y, p.row - 3.5); this.overlayRoot.add(m); return m;
      };
      const ring = (mat, rad, pipe, p, y) => {
        const m = new THREE.Mesh(this._geo('ring' + rad + pipe, () => { const t = new THREE.TorusGeometry(rad, pipe, 8, 40); t.rotateX(PI / 2); return t; }), mat);
        m.position.set(p.col - 3.5, y, p.row - 3.5); this.overlayRoot.add(m); return m;
      };
      if (ex.letzterZug) { flach([1, 0.8, 0.05], 0.55, ex.letzterZug.from, 0.003); flach([1, 0.8, 0.05], 0.65, ex.letzterZug.to, 0.003); }
      if (ex.schach) { flach([1, 0.1, 0.05], 1, ex.schach, 0.004).material = this._pulsMat([1, 0.1, 0.05]); ring(this._glow(0xff3319, 1), 0.42, 0.03, ex.schach, 0.02); }
      if (ex.ausgewaehlt) flach([0.25, 0.55, 1], 0.5, ex.ausgewaehlt, 0.005);
      for (const t of (ziele || [])) {
        const d = new THREE.Mesh(this._geo('punkt', () => new THREE.CylinderGeometry(0.13, 0.13, 0.012, 20)), this._glow(0x40d959, 0.9));
        d.position.set(t.col - 3.5, 0.01, t.row - 3.5); this.overlayRoot.add(d);
      }
      for (const t of (schlaege || [])) ring(this._glow(0xff4d33, 1), 0.41, 0.028, t, 0.02);
      for (const d of (ex.gefahr || [])) ring(this._pulsMat([1, 0.55, 0.05]), 0.44, 0.035, d, 0.025);
      if (ex.fokus) ring(this._pulsMat([1, 0.95, 0.3]), 0.46, 0.03, ex.fokus, 0.03);
      if (ex.hinweis) this._pfeil(ex.hinweis.from, ex.hinweis.to);
      this._dirty = true; return this;
    }

    _pfeil(a, b) {   // flacher Pfeil vom Start- zum Zielfeld (Coach-Empfehlung)
      const dx = b.col - a.col, dz = b.row - a.row, len = Math.max(0.01, Math.hypot(dx, dz));
      const h = new THREE.Group(); h.position.set(a.col - 3.5, 0.07, a.row - 3.5);
      h.rotation.y = Math.atan2(-dx / len, -dz / len);
      const mat = this._pulsMat([0.2, 0.9, 0.35]);
      const sl = Math.max(0.1, len - 0.42);
      const schaft = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.02, sl), mat); schaft.position.z = -sl / 2;
      const kopf = new THREE.Mesh(new THREE.ConeGeometry(0.24, 0.42, 3), mat);
      kopf.rotation.set(-PI / 2, 0, 0); kopf.scale.set(1, 1, 0.15); kopf.position.z = -(len - 0.21);
      h.add(schaft, kopf); h.renderOrder = 40; this.overlayRoot.add(h);
    }

    // ------------------------------------------------------------------ Qualität
    qualitaet(name) {
      const i = typeof name === 'number' ? name : STUFEN.findIndex(s => s.name === name);
      if (i < 0) return STUFEN[this._stufe].name;
      this._adaptiv = false; this._setzeStufe(i); return STUFEN[this._stufe].name;
    }
    _setzeStufe(i) {
      this._stufe = Math.max(0, Math.min(STUFEN.length - 1, i));
      const s = STUFEN[this._stufe];
      this.renderer.setPixelRatio(Math.min(g.devicePixelRatio || 1, s.dpr));
      this.renderer.setSize(this.breite, this.hoehe, false);
      const sh = this.key.shadow, size = this._stufe === 2 ? 512 : s.schatten;
      if (sh.mapSize.x !== size) { sh.mapSize.set(size, size); if (sh.map) { sh.map.dispose(); sh.map = null; } }
      this._dirty = true;
    }
    get partikelFaktor() { return STUFEN[this._stufe].partikel; }
    statistik() {
      const i = this.renderer.info;
      return { drawCalls: i.render.calls, dreiecke: i.render.triangles, geometrien: i.memory.geometries, texturen: i.memory.textures, stufe: STUFEN[this._stufe].name, pixelRatio: this.renderer.getPixelRatio() };
    }

    // ------------------------------------------------------------------ Schleife
    _schleife(t) {
      if (this._zerstoert) return;
      this._raf = requestAnimationFrame(tt => this._schleife(tt));
      const dt = Math.min(0.1, Math.max(0, (t - this._letzt) / 1000));
      this._letzt = t;
      this.schritt(dt, true);
    }

    /** Simulationsschritt + Zeichnen. Im Testmodus (`manuell:true`) wird nur auf Aufruf gestellt. */
    schritt(dt, ausSchleife) {
      let aktiv = false;
      this.akt.schritt(dt);
      aktiv = this.akt.beschaeftigt();
      if (this._tween) {
        const tw = this._tween; tw.t += dt; aktiv = true;
        const u = Math.min(1, tw.t / tw.d), e = A.ease(u), k = this._kam;
        k.az = tw.von.az + (tw.nach.az - tw.von.az) * e; k.el = tw.von.el + (tw.nach.el - tw.von.el) * e; k.dist = tw.von.dist + (tw.nach.dist - tw.von.dist) * e;
        this._kameraAktualisieren();
        if (u >= 1) { this._tween = null; tw.res(); }
      }
      if (this._shake) {
        const s = this._shake; s.t += dt; aktiv = true;
        const decay = Math.max(0, 1 - s.t / s.dauer);
        if (decay <= 0) { this._shake = null; } else { s.x = Math.sin(s.t * 91) * s.st * decay; s.y = Math.cos(s.t * 77) * s.st * decay * 0.7; }
        this._kameraAktualisieren();
      }
      if (this._fx.length) { aktiv = true; this._fxSchritt(dt); }
      if (this._pulsAktiv && this.overlayRoot.children.length) {   // pulsierende Markierungen (Deckkraft 0.35 <-> 1.0)
        const ph = (performance.now() / 1000) % 1.1, o = ph < 0.55 ? 1 - 0.65 * (ph / 0.55) : 0.35 + 0.65 * ((ph - 0.55) / 0.55);
        for (const m of this._pulse) m.opacity = o;
        aktiv = true;
      }
      if (this._hunde && (aktiv || this._dirty)) F.billboards(this.piecesRoot, this.kamera.position);
      if (!this._ohneRender && (aktiv || this._dirty)) {
        this.renderer.render(this.scene, this.kamera);
        this._dirty = false;
        if (ausSchleife && this._adaptiv && aktiv) this._messe(dt);
      }
    }

    /** Testhilfe/Zeitraffer: Simulation um `sek` Sekunden vorspulen (nur das letzte Bild wird gezeichnet) */
    vorspulen(sek, dt) {
      dt = dt || 1 / 30; const n = Math.max(1, Math.round(sek / dt));
      this._ohneRender = true;
      try { for (let i = 0; i < n; i++) this.schritt(dt); } finally { this._ohneRender = false; }
      this._dirty = true; this.schritt(0.0001);
    }

    _messe(dt) {   // adaptive Qualität: nur während Animationen messen
      const f = this._ft; f.n++; f.sum += dt;
      if (f.n >= 45) {
        const fps = f.n / Math.max(1e-6, f.sum); f.n = 0; f.sum = 0;
        if (fps < 38 && this._stufe < STUFEN.length - 1) { this._setzeStufe(this._stufe + 1); f.gut = 0; }
        else if (fps > 57) { if (++f.gut >= 6 && this._stufe > 0) { this._setzeStufe(this._stufe - 1); f.gut = 0; } }
        else f.gut = 0;
      }
    }

    zerstoeren() {
      this._zerstoert = true; cancelAnimationFrame(this._raf);
      const cv = this.canvas, h = this._h;
      cv.removeEventListener('pointerdown', h.down); cv.removeEventListener('pointermove', h.move); cv.removeEventListener('pointerup', h.up);
      cv.removeEventListener('pointercancel', h.up); cv.removeEventListener('wheel', h.wheel); cv.removeEventListener('contextmenu', h.ctx);
      if (this._ro) this._ro.disconnect(); if (this._rz) g.removeEventListener('resize', this._rz);
      this.scene.traverse(o => { if (o.geometry) o.geometry.dispose(); });
      this.renderer.dispose();
      if (cv.parentNode) cv.parentNode.removeChild(cv);
    }
  }

  g.Schach3D = Schach3D;
})(typeof window !== 'undefined' ? window : globalThis);
