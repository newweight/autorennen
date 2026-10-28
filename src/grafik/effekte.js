// ============================================================
// Grafik G4 – Effekte (Autorennen UND Motorrad). NUR bei „Schön“ / „Ultra“ aktiv; Normal = bitgleich (nichts wird angelegt, nur zwei
// durchreichende Umhüllungen).
//   Partikel : EIN geteiltes System aus zwei THREE.Points (additiv: Funken/Flammen/Glühen, normal: Rauch/Spritzer), eigener Punkt-Shader
//              (weiche Scheibe, Größe in Weltmetern), feste Obergrenzen (Schön 360/260, Ultra 700/480) → 2 Draw-Calls. Eigener Zufall
//              (Math.random wird nie angefasst).
//   Tempo    : Rand-Streifen + Vignette als vorgezeichnete Canvas-Ebene über dem Spiel (nur CSS-Deckkraft je Bild, kein Nachbearbeiten);
//              Ultra stark, Schön leicht, Cockpit zurückhaltend, nie unter 55 % Tempo.
//   Regen    : Tropfen-Ebene (2D, 20 Hz, kleine Auflösung) bei Regen: Kamera-Linse (Verfolger), Helmvisier (Motorrad-Cockpit; Tropfen
//              laufen mit dem Fahrtwind zur Seite). Auto-Cockpit hat schon den Scheibenwischer (wischer.js) → dort nichts Zusätzliches.
//              Dazu Spritzer-Fahnen hinter Fahrzeugen auf nasser Straße.
//   Funken   : Anprall an Bande / Auto / feste Hindernisse (Umhüllung von physikSchritt liest this._bandeSt, stoesse, hindernisStoesse),
//              Schleifen an der Bande; die Motorrad-Funken (M3, motoM3Effekte.js) bekommen größere, hellere Punkte plus Glut-Hof.
//   Feuer    : Feuerring (Motorrad): aufsteigende Flammen + Rauch + bunte Glitzerfunken; brennende Wracks ('brand') und Krater: Flammen/Glut
//              mit Rauch; Treffer auf 'brand'/'krater' und schwere Unfälle: bunter Puff (Feuerwerk-artig, mit weichem Rauch, kein Gewalt-Eindruck).
// Wird von grafik.js (G1) über G.haken gerufen (hängt sich hinter G2).
// ============================================================
(function () {
  const R = window.Rennspiel, G = R && R.Grafik;
  if (!G || !G.haken || typeof THREE === 'undefined') return;
  const MOTO = window.MOTORRAD === true;

  const PARAM = {
    schoen: { add: 360, norm: 260, funken: 1, flamme: 0.6, blur: 0.55, tropfen: 26, tropfenCockpit: 55, spritz: 0.6 },
    ultra: { add: 700, norm: 480, funken: 1.7, flamme: 1, blur: 0.95, tropfen: 40, tropfenCockpit: 90, spritz: 1 },
  };
  const klemme = (v, a, b) => Math.max(a, Math.min(b, v));
  function zufall(seed) {
    let a = seed >>> 0;
    return function () { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  const rnd = zufall(4242);
  const zw = (a, b) => a + (b - a) * rnd();

  // ---------- Partikelsystem ----------
  const FELDER = ['x', 'y', 'z', 'vx', 'vy', 'vz', 'alt', 'max', 's0', 's1', 'r0', 'g0', 'b0', 'r1', 'g1', 'b1', 'a0', 'grav', 'drag'];
  function systemBauen(n, additiv) {
    const S = { n, kopf: 0, aktiv: 0, additiv };
    FELDER.forEach((f) => { S[f] = new Float32Array(n); });
    S.alt.fill(9); S.max.fill(1);
    const geo = new THREE.BufferGeometry();
    S.pos = new Float32Array(n * 3); S.size = new Float32Array(n); S.alpha = new Float32Array(n); S.col = new Float32Array(n * 3);
    geo.setAttribute('position', new THREE.BufferAttribute(S.pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aSize', new THREE.BufferAttribute(S.size, 1).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aAlpha', new THREE.BufferAttribute(S.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aCol', new THREE.BufferAttribute(S.col, 3).setUsage(THREE.DynamicDrawUsage));
    const mat = new THREE.ShaderMaterial({
      uniforms: { uH: { value: 540 }, uKern: { value: additiv ? 1 : 0 } },
      vertexShader: 'attribute float aSize; attribute float aAlpha; attribute vec3 aCol; uniform float uH; varying float vA; varying vec3 vC;\n' +
        'void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv; vA = aAlpha; vC = aCol;\n' +
        ' gl_PointSize = clamp(aSize * projectionMatrix[1][1] * uH * 0.5 / max(0.1, -mv.z), 0.0, 220.0); if (aAlpha <= 0.002) gl_PointSize = 0.0; }',
      fragmentShader: 'varying float vA; varying vec3 vC; uniform float uKern;\n' +
        'void main(){ vec2 d = gl_PointCoord - 0.5; float r = length(d) * 2.0; if (r > 1.0) discard;\n' +
        ' float f = uKern > 0.5 ? exp(-r * r * 3.2) : smoothstep(1.0, 0.15, r);\n' +
        ' vec3 c = uKern > 0.5 ? vC + vec3(0.3, 0.24, 0.12) * exp(-r * r * 14.0) : vC;\n' +
        ' gl_FragColor = vec4(c, vA * f);\n#include <colorspace_fragment>\n}',
      transparent: true, depthWrite: false, fog: false, blending: additiv ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    S.obj = new THREE.Points(geo, mat);
    S.obj.frustumCulled = false; S.obj.renderOrder = additiv ? 7 : 6; S.obj.name = additiv ? 'g4Add' : 'g4Norm';
    return S;
  }
  /** Ein Partikel anlegen (Ringpuffer). o = { s0, s1, c0:[r,g,b], c1, a, grav, drag } */
  function emit(S, x, y, z, vx, vy, vz, leben, s0, s1, c0, c1, a, grav, drag) {
    const i = S.kopf; S.kopf = (S.kopf + 1) % S.n;
    S.x[i] = x; S.y[i] = y; S.z[i] = z; S.vx[i] = vx; S.vy[i] = vy; S.vz[i] = vz; S.alt[i] = 0; S.max[i] = leben; S.s0[i] = s0; S.s1[i] = s1;
    S.r0[i] = c0[0]; S.g0[i] = c0[1]; S.b0[i] = c0[2]; S.r1[i] = c1[0]; S.g1[i] = c1[1]; S.b1[i] = c1[2]; S.a0[i] = a; S.grav[i] = grav; S.drag[i] = drag;
  }
  function schritt(S, dt) {
    let n = 0;
    for (let i = 0; i < S.n; i++) {
      if (S.alt[i] >= S.max[i]) { if (S.alpha[i] !== 0) { S.alpha[i] = 0; S.size[i] = 0; } continue; }
      S.alt[i] += dt; const t = S.alt[i] / S.max[i];
      if (t >= 1) { S.alpha[i] = 0; S.size[i] = 0; continue; }
      n++;
      const dr = Math.exp(-S.drag[i] * dt);
      S.vx[i] *= dr; S.vz[i] *= dr; S.vy[i] = S.vy[i] * dr - S.grav[i] * dt;
      S.x[i] += S.vx[i] * dt; S.y[i] += S.vy[i] * dt; S.z[i] += S.vz[i] * dt;
      if (S.y[i] < 0.03 && S.vy[i] < 0 && S.grav[i] > 1) { S.y[i] = 0.03; S.vy[i] *= -0.3; S.vx[i] *= 0.7; S.vz[i] *= 0.7; }
      const k = Math.sqrt(t);
      S.pos[i * 3] = S.x[i]; S.pos[i * 3 + 1] = S.y[i]; S.pos[i * 3 + 2] = S.z[i];
      S.size[i] = S.s0[i] + (S.s1[i] - S.s0[i]) * k;
      S.alpha[i] = S.a0[i] * Math.min(1, t * 9) * Math.pow(1 - t, 1.3);
      S.col[i * 3] = S.r0[i] + (S.r1[i] - S.r0[i]) * t; S.col[i * 3 + 1] = S.g0[i] + (S.g1[i] - S.g0[i]) * t; S.col[i * 3 + 2] = S.b0[i] + (S.b1[i] - S.b0[i]) * t;
    }
    S.aktiv = n;
    if (n === 0 && S.leer) return;
    S.leer = n === 0;
    const g = S.obj.geometry.attributes;
    g.position.needsUpdate = g.aSize.needsUpdate = g.aAlpha.needsUpdate = g.aCol.needsUpdate = true;
    S.obj.visible = n > 0;
  }

  // ---------- Effekt-Bausteine ----------
  const FUNKE0 = [1, 0.95, 0.6], FUNKE1 = [1, 0.35, 0.04], HOF = [1, 0.55, 0.15];
  const FLAMME0 = [1, 0.8, 0.2], FLAMME1 = [0.95, 0.15, 0.03], RAUCH0 = [0.62, 0.6, 0.64], RAUCH1 = [0.8, 0.8, 0.84];
  const BUNT = [[1, 0.35, 0.6], [1, 0.85, 0.2], [0.3, 0.9, 1], [0.5, 1, 0.4], [0.8, 0.5, 1]];
  const bunt = () => BUNT[Math.floor(rnd() * BUNT.length) % BUNT.length];

  function funken(st, x, y, z, rx, rz, n, tempo) {
    st.zahl.funken++;
    const S = st.add, f = st.P.funken; n = Math.round(n * f);
    for (let k = 0; k < n; k++) {
      const a = (rnd() - 0.5) * 2.6, c = Math.cos(a), s = Math.sin(a), v = zw(2.5, 4 + klemme(tempo, 0, 30) * 0.28);
      emit(S, x + zw(-0.25, 0.25), y + zw(0, 0.3), z + zw(-0.25, 0.25), (-rx * c + rz * s) * v, zw(0.8, 3.6), (-rz * c - rx * s) * v, zw(0.3, 0.75), 0.26, 0.08, FUNKE0, FUNKE1, 1, 9.8, 0.4);
      if (k % 3 === 0) emit(S, x, y + 0.15, z, (-rx * c + rz * s) * v * 0.3, 0.4, (-rz * c - rx * s) * v * 0.3, 0.22, 0.85, 0.3, HOF, FUNKE1, 0.7, 0, 2);
    }
    emit(S, x, y + 0.2, z, 0, 0.2, 0, 0.16, 0.9, 1.5, [1, 0.85, 0.5], HOF, 0.5, 0, 0);
  }
  function puff(st, x, y, z, gross) {
    st.zahl.puff++;
    const S = st.add, N = st.norm, f = st.P.funken, m = gross || 1;
    const n = Math.round(30 * f * m);
    for (let k = 0; k < n; k++) {   // bunte Konfetti-Funken (normale Mischung: bleiben auch vor hellem Himmel farbig)
      const th = rnd() * 6.2832, ph = Math.acos(zw(-0.2, 1)), v = zw(2.5, 6.5) * m, c = bunt();
      emit(N, x, y + 0.5, z, Math.sin(ph) * Math.cos(th) * v, Math.cos(ph) * v + 1.5, Math.sin(ph) * Math.sin(th) * v, zw(0.8, 1.4), 0.5, 0.2, c, c, 0.95, 4.5, 1.6);
      if (k % 2 === 0) emit(S, x, y + 0.5, z, Math.sin(ph) * Math.cos(th) * v, Math.cos(ph) * v + 1.5, Math.sin(ph) * Math.sin(th) * v, zw(0.5, 0.9), 0.3, 0.06, [c[0] * 0.8, c[1] * 0.8, c[2] * 0.8], c, 0.8, 4.5, 1.6);
    }
    emit(S, x, y + 0.7, z, 0, 0.3, 0, 0.25, 2.2 * m, 4.2 * m, [1, 0.8, 0.45], [1, 0.45, 0.25], 0.4, 0, 0);
    const r = Math.round(10 * Math.min(1.5, f) * m);
    for (let k = 0; k < r; k++) {
      const th = rnd() * 6.2832, v = zw(0.5, 2);
      emit(N, x + Math.cos(th) * 0.4, y + 0.5, z + Math.sin(th) * 0.4, Math.cos(th) * v, zw(1, 2.4), Math.sin(th) * v, zw(1.6, 2.4), 1.0 * m, 3.8 * m, [0.72, 0.7, 0.78], [0.86, 0.86, 0.9], 0.5, -0.15, 1.2);
    }
  }
  function flamme(st, x, y, z, breite, hoch) {
    const S = st.add;
    emit(S, x + zw(-breite, breite), y, z + zw(-breite, breite), zw(-0.3, 0.3), zw(1.6, 3.2) * hoch, zw(-0.3, 0.3), zw(0.5, 0.9), zw(0.7, 1.1), 0.2, FLAMME0, FLAMME1, 0.7, -0.5, 0.8);
  }
  function rauch(st, x, y, z, dunkel) {
    emit(st.norm, x + zw(-0.3, 0.3), y, z + zw(-0.3, 0.3), zw(-0.4, 0.4), zw(1, 1.8), zw(-0.4, 0.4), zw(1.5, 2.3), 0.6, 2.6, dunkel ? [0.38, 0.37, 0.42] : RAUCH0, RAUCH1, 0.32, -0.2, 1);
  }
  function spritzer(st, x, y, z, rx, rz, tempo) {
    const q = st.P.spritz, N = st.norm, qx = rz, qz = -rx;
    for (let k = 0; k < 2; k++) {
      const seite = (k ? 1 : -1) * 0.75, v = tempo * 0.12;
      emit(N, x - rx * 1.5 + qx * seite, y + 0.3, z - rz * 1.5 + qz * seite, -rx * v + qx * seite * 1.6 + zw(-0.4, 0.4), zw(0.7, 1.7), -rz * v + qz * seite * 1.6 + zw(-0.4, 0.4), zw(0.55, 1.0),
        0.3, zw(0.9, 1.4), [0.82, 0.88, 0.95], [0.92, 0.95, 0.98], 0.2 * q + 0.08, 1.2, 1.5);
    }
  }

  // ---------- Overlay (Tempo-Streifen + Tropfen) ----------
  function ebene(id, z) {
    const c = document.createElement('canvas'); c.id = id; c.setAttribute('data-g4', '1');
    Object.assign(c.style, { position: 'fixed', left: '0', top: '0', width: '100%', height: '100%', pointerEvents: 'none', zIndex: String(z), opacity: '0', display: 'none' });
    return c;
  }
  function streifenZeichnen(c) {
    c.width = 640; c.height = 360;
    const g = c.getContext('2d'), w = c.width, h = c.height, cx = w / 2, cy = h / 2, rz = zufall(77);
    const vg = g.createRadialGradient(cx, cy, h * 0.28, cx, cy, Math.hypot(cx, cy));
    vg.addColorStop(0, 'rgba(8,10,16,0)'); vg.addColorStop(0.55, 'rgba(8,10,16,0.16)'); vg.addColorStop(1, 'rgba(8,10,16,0.62)');
    g.fillStyle = vg; g.fillRect(0, 0, w, h);
    g.lineCap = 'round';
    for (let i = 0; i < 90; i++) {
      const a = rz() * 6.2832, r0 = Math.hypot(cx, cy) * (0.5 + rz() * 0.3), r1 = r0 + Math.hypot(cx, cy) * (0.15 + rz() * 0.3), dx = Math.cos(a) * (w / h), dy = Math.sin(a);
      const x0 = cx + dx * r0 * 0.82, y0 = cy + dy * r0 * 0.82, x1 = cx + dx * r1 * 0.82, y1 = cy + dy * r1 * 0.82;
      const gr = g.createLinearGradient(x0, y0, x1, y1); gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(1, 'rgba(255,255,255,' + (0.18 + rz() * 0.3).toFixed(2) + ')');
      g.strokeStyle = gr; g.lineWidth = 1.1 + rz() * 2.4; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
    }
  }
  let tropfenBild = null;
  function tropfenSprite() {
    if (tropfenBild) return tropfenBild;
    const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
    const rd = g.createRadialGradient(32, 32, 6, 32, 32, 30);
    rd.addColorStop(0, 'rgba(180,200,225,0.10)'); rd.addColorStop(0.7, 'rgba(70,85,105,0.22)'); rd.addColorStop(0.92, 'rgba(20,28,40,0.55)'); rd.addColorStop(1, 'rgba(20,28,40,0)');
    g.fillStyle = rd; g.beginPath(); g.arc(32, 32, 31, 0, 6.2832); g.fill();
    const hl = g.createRadialGradient(24, 22, 0, 24, 22, 11); hl.addColorStop(0, 'rgba(255,255,255,0.95)'); hl.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = hl; g.beginPath(); g.arc(24, 22, 11, 0, 6.2832); g.fill();
    const sh = g.createRadialGradient(40, 44, 0, 40, 44, 9); sh.addColorStop(0, 'rgba(210,225,245,0.45)'); sh.addColorStop(1, 'rgba(210,225,245,0)');
    g.fillStyle = sh; g.beginPath(); g.arc(40, 44, 9, 0, 6.2832); g.fill();
    return (tropfenBild = c);
  }

  function ueberlagerungAn(sp, st) {
    const el = sp.renderer && sp.renderer.domElement, par = el && el.parentNode; if (!par) return;
    st.streifen = ebene('g4-streifen', 2); streifenZeichnen(st.streifen);
    st.tropf = ebene('g4-tropfen', 3); st.tropf.width = 480; st.tropf.height = 270;
    par.insertBefore(st.streifen, el.nextSibling); par.insertBefore(st.tropf, st.streifen.nextSibling);
    st.tr = []; st.trT = 0; st.winkelT = 0;
  }
  function tropfenSchritt(sp, st, dt, cockpit, tempo, regen) {
    const c = st.tropf, g = c.getContext('2d'), W = c.width, H = c.height, P = st.P;
    const max = cockpit ? P.tropfenCockpit : P.tropfen, lauf = cockpit && MOTO;
    // neue Tropfen
    st.trAcc = (st.trAcc || 0) + dt * (cockpit ? 16 : 9) * (0.4 + tempo);
    while (st.trAcc >= 1 && st.tr.length < max) {
      st.trAcc -= 1;
      st.tr.push({ x: rnd() * W, y: lauf ? H * (0.1 + rnd() * 0.7) : rnd() * H * 0.9, r: (cockpit ? 3 + rnd() * 6 : 3 + rnd() * 7) * (rnd() < 0.15 ? 1.8 : 1), t: 0, leb: 5 + rnd() * 6, v: 0 });
    }
    if (st.trAcc > 1) st.trAcc = 0;
    g.clearRect(0, 0, W, H);
    const spr = tropfenSprite();
    for (let i = st.tr.length - 1; i >= 0; i--) {
      const d = st.tr[i]; d.t += dt;
      if (d.t > d.leb) { st.tr.splice(i, 1); continue; }
      if (lauf) { const m = (d.x - W / 2) / (W / 2); d.x += m * (6 + tempo * 70) * dt; d.y -= tempo * 8 * dt; }
      else if (d.r > 6.5) { d.v = Math.min(40, d.v + 14 * dt); d.y += d.v * dt * (0.4 + 0.6 * (d.r - 6) / 5); }
      if (d.y > H + 20 || d.x < -20 || d.x > W + 20) { st.tr.splice(i, 1); continue; }
      const a = Math.min(1, d.t * 3, (d.leb - d.t) * 0.7);
      g.globalAlpha = a; const r = d.r * (1 - 0.15 * d.t / d.leb);
      g.drawImage(spr, d.x - r, d.y - r, r * 2, r * 2);
      if (d.v > 6) { g.globalAlpha = a * 0.25; g.fillStyle = 'rgba(200,215,235,0.5)'; g.fillRect(d.x - 0.7, d.y - d.v * 0.9, 1.4, d.v * 0.9); }
    }
    g.globalAlpha = 1;
  }

  // ---------- Quellen: Feuerringe, Wracks, Krater ----------
  function quellenSuchen(sp, st) {
    const ringe = [];
    sp.szene.traverse((o) => {
      if (o.isMesh && o.geometry && o.geometry.type === 'TorusGeometry' && o.geometry.parameters && o.geometry.parameters.tube === 0.25 && o.material && o.material.isMeshBasicMaterial) ringe.push(o);
    });
    st.ringe = ringe;
    const h = sp.strecke && sp.strecke.hindernisse;
    st.brand = h ? h.filter((x) => x.typ === 'brand' && !x.lava && !x.weg) : [];
  }
  const _v = new THREE.Vector3(), _w = new THREE.Vector3();
  function quellenSchritt(sp, st, dt, cam) {
    const P = st.P, kam = cam.position;
    st.acc = st.acc || new Map();
    const rate = (key, proSek) => { const a = (st.acc.get(key) || 0) + dt * proSek; const n = Math.floor(a); st.acc.set(key, a - n); return Math.min(n, 6); };
    // Feuerringe
    let nah = 0;
    for (let i = 0; i < st.ringe.length && nah < 8; i++) {
      const o = st.ringe[i]; if (!o.parent) continue;
      o.getWorldPosition(_v); if (_v.distanceToSquared(kam) > 110 * 110) continue;
      nah++; const rc = o.geometry.parameters.radius;
      for (let k = rate(o, 40 * P.flamme), n = 0; n < k; n++) {
        const a = rnd() * 6.2832; _v.set(Math.cos(a) * rc, Math.sin(a) * rc, 0); o.localToWorld(_v); _w.set(Math.cos(a) * (rc + 1), Math.sin(a) * (rc + 1), 0); o.localToWorld(_w); _w.sub(_v);
        emit(st.add, _v.x, _v.y, _v.z, _w.x * zw(0.2, 0.7), _w.y * zw(0.2, 0.7) + zw(1, 2.2), _w.z * zw(0.2, 0.7), zw(0.55, 1), zw(0.75, 1.2), 0.15, FLAMME0, FLAMME1, 0.75, -0.6, 0.7);
      }
      if (rate(o.uuid + 'r', 3.5 * P.flamme) > 0) { const a = rnd() * 6.2832; _v.set(Math.cos(a) * rc, Math.sin(a) * rc, 0); o.localToWorld(_v); rauch(st, _v.x, _v.y + 0.3, _v.z, false); }
      if (rate(o.uuid + 'b', 4 * P.flamme) > 0) { const a = rnd() * 6.2832, c = bunt(); _v.set(Math.cos(a) * rc, Math.sin(a) * rc, 0); o.localToWorld(_v); emit(st.add, _v.x, _v.y, _v.z, zw(-1.2, 1.2), zw(0.5, 2.4), zw(-1.2, 1.2), zw(0.9, 1.5), 0.3, 0.08, [c[0] * 0.5 + 0.5, c[1] * 0.5 + 0.5, c[2] * 0.5 + 0.5], c, 0.9, 3.5, 0.6); }
    }
    // brennende Wracks
    const st0 = sp.strecke;
    for (let i = 0; i < st.brand.length; i++) {
      const h = st.brand[i]; if (h.weg) continue;
      const dx = h.x - kam.x, dz = h.z - kam.z; if (dx * dx + dz * dz > 90 * 90) continue;
      const y = st0.hoeheAn ? st0.hoeheAn(h.x, h.z) : 0, hx = Math.sin(h.heading || 0) * -1, hz = Math.cos(h.heading || 0) * -1;
      for (let k = rate(h, 16 * P.flamme), n = 0; n < k; n++) { const t = zw(-0.8, 0.8); flamme(st, h.x + hx * t * 1.3, y + 0.5, h.z + hz * t * 1.3, 0.35, 1); }
      if (rate(h.nr + 'r', 3 * P.flamme) > 0) rauch(st, h.x, y + 1.2, h.z, true);
    }
    // Krater (Vulkan/Dino): Glut und Funken
    const kr = sp.dynamik && sp.dynamik.krater;
    if (kr) for (let i = 0; i < kr.length; i++) {
      const k = kr[i], dx = k.x - kam.x, dz = k.z - kam.z; if (dx * dx + dz * dz > 80 * 80) continue;
      if (rate(k, 9 * P.flamme) > 0) { const a = rnd() * 6.2832, r = k.r * rnd() * 0.8; flamme(st, k.x + Math.cos(a) * r, (k.y || 0) + 0.2, k.z + Math.sin(a) * r, 0.1, 0.6); }
      if (rate(k.s + 'r' + k.q, 2) > 0) rauch(st, k.x, (k.y || 0) + 0.6, k.z, false);
    }
  }

  // ---------- Ereignisse je Physik-Schritt ----------
  function ereignisse(sp, st, dt) {
    const fz = sp.fahrzeuge || []; if (!fz.length) return;
    st.cd = st.cd || new Map(); st.zeit = (st.zeit || 0) + dt;
    const frei = (key, pause) => { const t = st.cd.get(key); if (t !== undefined && st.zeit - t < pause) return false; st.cd.set(key, st.zeit); return true; };
    const pos = (f) => { const v = f.vehicle; return [v.x, f.mesh ? f.mesh.position.y : 0, v.z, -Math.sin(v.heading), -Math.cos(v.heading)]; };
    const bs = sp._bandeSt;
    for (let i = 0; i < fz.length; i++) {
      const f = fz[i]; if (!f || !f.vehicle || f.ausgeschieden || !f.mesh) continue;
      const v = f.vehicle, tempo = Math.abs(v.vLaengs || v.tempo || 0), p = pos(f);
      const sBande = bs && bs[i] > 0 ? bs[i] : 0;
      if (sBande > 1 && frei('b' + i, 0.12)) { funken(st, p[0] + p[3] * 0.4, p[1] + 0.2, p[2] + p[4] * 0.4, p[3], p[4], 4 + sBande * 1.8, tempo); if (sBande > 14 && frei('p' + i, 1.5)) puff(st, p[0], p[1], p[2], 0.7); }
      else if (v._anBande && tempo > 6 && frei('s' + i, 0.05)) funken(st, p[0], p[1] + 0.1, p[2], p[3], p[4], 2, tempo);
      const mz = f.motoZ && f.motoZ.purzel;
      if (mz) { const neu = !!mz.aktiv; if (neu && !f._g4Purzel && frei('u' + i, 2)) puff(st, p[0], p[1], p[2], 0.8); f._g4Purzel = neu; }
    }
    const as = sp.stoesse || [];
    for (let k = 0; k < as.length; k++) {
      const s = as[k], a = fz[s.a], b = fz[s.b]; if (!a || !b || !a.mesh || !b.mesh || !(s.staerke > 1.2) || !frei('a' + s.a + '_' + s.b, 0.25)) continue;
      const pa = pos(a), pb = pos(b);
      funken(st, (pa[0] + pb[0]) / 2, (pa[1] + pb[1]) / 2 + 0.2, (pa[2] + pb[2]) / 2, (pa[3] - pb[3]) * 0.5, (pa[4] - pb[4]) * 0.5, 3 + s.staerke * 1.5, 14);
      if (s.staerke > 12 && frei('q' + s.a, 1.5)) puff(st, (pa[0] + pb[0]) / 2, (pa[1] + pb[1]) / 2, (pa[2] + pb[2]) / 2, 0.7);
    }
    const hs = sp.hindernisStoesse || [];
    for (let k = 0; k < hs.length; k++) {
      const s = hs[k], f = fz[s.nr]; if (!f || !f.mesh) continue;
      const p = pos(f);
      if (s.typ === 'brand' || s.typ === 'krater') { if (frei('h' + s.nr + s.typ, 1.2)) puff(st, p[0], p[1], p[2], 0.8); }
      else if ((s.typ === 'wrack' || s.typ === 'bake' || s.typ === 'baustelle') && s.staerke > 2 && frei('w' + s.nr, 0.3)) funken(st, p[0] + p[3] * 1.2, p[1] + 0.2, p[2] + p[4] * 1.2, p[3], p[4], 3 + s.staerke, 15);
    }
  }

  // ---------- Motorrad-Funken (M3) hübscher ----------
  function motoFunkenAn(sp, st) {
    const g = sp.motoFxGruppe, pts = g && g.children && g.children[0]; if (!pts || !pts.isPoints || !pts.userData) return;
    const m = pts.material;
    st.moto = { pts, m, size: m.size, toneMapped: m.toneMapped };
    m.size = 0.5; m.toneMapped = false; m.needsUpdate = true;
    const hof = new THREE.Points(pts.geometry, new THREE.PointsMaterial({ size: 1.5, vertexColors: true, map: m.map, transparent: true, depthWrite: false, opacity: 0.32, blending: THREE.AdditiveBlending, toneMapped: false, alphaTest: 0.01 }));
    hof.frustumCulled = false; hof.renderOrder = 7; hof.name = 'g4Hof'; g.add(hof); st.moto.hof = hof;
  }
  function motoFunkenAus(st) {
    const mo = st.moto; if (!mo) return;
    mo.m.size = mo.size; mo.m.toneMapped = mo.toneMapped; mo.m.needsUpdate = true;
    if (mo.hof) { if (mo.hof.parent) mo.hof.parent.remove(mo.hof); mo.hof.material.dispose(); }
    st.moto = null;
  }

  // ---------- Anwenden / Zurück / Bild ----------
  function effAn(sp, stufe) {
    const P = PARAM[stufe]; if (!P) return;
    const st = sp._g4 = { stufe, P, aktiv: false, add: systemBauen(P.add, true), norm: systemBauen(P.norm, false), zeit: 0, t0: 0, frame: 0, zahl: { funken: 0, puff: 0 } };
    sp.szene.add(st.norm.obj); sp.szene.add(st.add.obj);
    try { ueberlagerungAn(sp, st); } catch (e) { try { console.warn('Grafik G4 Overlay:', e); } catch (e2) { /* egal */ } }
    try { quellenSuchen(sp, st); } catch (e) { st.ringe = []; st.brand = []; }
    try { motoFunkenAn(sp, st); } catch (e) { /* nur Optik */ }
    st.aktiv = true;
  }
  function effAus(sp) {
    const st = sp._g4; if (!st) return;
    st.aktiv = false;
    [st.add, st.norm].forEach((S) => { if (S.obj.parent) S.obj.parent.remove(S.obj); S.obj.geometry.dispose(); S.obj.material.dispose(); });
    [st.streifen, st.tropf].forEach((c) => { if (c && c.parentNode) c.parentNode.removeChild(c); });
    motoFunkenAus(st);
    sp._g4 = null;
  }
  function effBild(sp) {
    const st = sp._g4; if (!st || !st.aktiv) return;
    const jetzt = performance.now() / 1000, dt = klemme(st.t0 ? jetzt - st.t0 : 0.016, 0, 0.05); st.t0 = jetzt; st.frame++;
    const ks = sp.kameras || [], kam = ks[0], el = sp.renderer && sp.renderer.domElement;
    if (!kam || !el || sp.zustand === 'menue') return;
    const cam = kam.kamera, zwei = ks.length === 2, pause = sp.pausiert;
    const uH = el.height; st.add.obj.material.uniforms.uH.value = uH; st.norm.obj.material.uniforms.uH.value = uH;
    if (st.frame % 120 === 0) { try { quellenSuchen(sp, st); } catch (e) { /* egal */ } }
    const regen = !!(sp.wetter && sp.wetter.wetterArt === 'regen'), cockpit = kam.modus === 'cockpit';
    if (!pause) {
      try { quellenSchritt(sp, st, dt, cam); } catch (e) { if (!st.fehler) { st.fehler = 1; try { console.warn('Grafik G4 Quellen:', e); } catch (e2) { /* egal */ } } }
      if (regen) {   // Spritzer hinter Fahrzeugen auf nasser Straße
        const fz = sp.fahrzeuge || [];
        st.acc = st.acc || new Map();
        for (let i = 0; i < fz.length; i++) {
          const f = fz[i], v = f && f.vehicle; if (!v || !f.mesh || f.mesh.visible === false || f.ausgeschieden) continue;
          const tempo = Math.abs(v.vLaengs || 0); if (tempo < 8 || (v.untergrund && v.untergrund !== 'strasse')) continue;
          const dx = f.mesh.position.x - cam.position.x, dz = f.mesh.position.z - cam.position.z; if (dx * dx + dz * dz > 70 * 70) continue;
          const a = (st.acc.get('sp' + i) || 0) + dt * (14 + tempo * 0.9) * st.P.spritz, n = Math.floor(a); st.acc.set('sp' + i, a - n);
          for (let k = 0; k < Math.min(n, 4); k++) spritzer(st, f.mesh.position.x, f.mesh.position.y, f.mesh.position.z, -Math.sin(v.heading), -Math.cos(v.heading), tempo);
        }
      }
      schritt(st.add, dt); schritt(st.norm, dt);
    }
    // Tempo-Streifen
    const tA = klemme(kam._tempoAnteil || 0, 0, 1), blur = zwei || pause ? 0 : st.P.blur * klemme((tA - 0.55) / 0.4, 0, 1) * (cockpit ? 0.5 : 1);
    if (st.streifen) {
      const an = blur > 0.01;
      st.streifen.style.display = an ? 'block' : 'none'; st.streifen.style.opacity = an ? blur.toFixed(3) : '0';
      if (an) { st.winkelT += dt; if (st.winkelT > 0.07) { st.winkelT = 0; st.streifen.style.transform = 'rotate(' + ((Math.floor(rnd() * 5) - 2) * 0.9).toFixed(1) + 'deg) scale(' + (1.04 + rnd() * 0.04).toFixed(3) + ')'; } }
    }
    // Tropfen
    if (st.tropf) {
      const zeigen = regen && !zwei && !(cockpit && !MOTO);
      if (zeigen) {
        st.tropf.style.display = 'block'; st.tropf.style.opacity = '1';
        st.trT += dt;
        if (st.trT >= 0.05) { const d = st.trT; st.trT = 0; if (!pause) tropfenSchritt(sp, st, d, cockpit, tA, regen); }
      } else if (st.tropf.style.display !== 'none') { st.tropf.style.display = 'none'; st.tr.length = 0; }
    }
    // Hof der Motorrad-Funken folgt der Sichtbarkeit der M3-Punkte
    if (st.moto && st.moto.hof) st.moto.hof.visible = st.moto.pts.visible;
  }

  // ---------- Haken (hinter G2) ----------
  const alt = G.haken;
  G.haken = {
    an(sp, stufe) { alt.an(sp, stufe); try { effAn(sp, stufe); } catch (e) { try { console.warn('Grafik G4:', e); } catch (e2) { /* egal */ } } },
    aus(sp) { try { effAus(sp); } catch (e) { /* egal */ } alt.aus(sp); },
    bild(sp) { alt.bild(sp); effBild(sp); },
  };

  const P0 = R.Spiel && R.Spiel.prototype;
  if (P0 && P0.physikSchritt) {
    const ps = P0.physikSchritt;
    P0.physikSchritt = function () {
      const r = ps.apply(this, arguments), st = this._g4;
      if (st && st.aktiv) { try { ereignisse(this, st, arguments[0] || 0); } catch (e) { if (!st.fehler2) { st.fehler2 = 1; try { console.warn('Grafik G4 Ereignisse:', e); } catch (e2) { /* egal */ } } } }
      return r;
    };
  }

  G.Effekte = {
    PARAM,
    zaehler: (sp) => (sp && sp._g4 ? { add: sp._g4.add.aktiv, norm: sp._g4.norm.aktiv, tropfen: sp._g4.tr ? sp._g4.tr.length : 0, ringe: sp._g4.ringe ? sp._g4.ringe.length : 0, funken: sp._g4.zahl.funken, puff: sp._g4.zahl.puff, brand: sp._g4.brand ? sp._g4.brand.length : 0 } : null),
    /** Prüfhilfen (nur Schön/Ultra): Effekt an Fahrzeug nr auslösen. */
    ausloesen: (sp, art, nr, staerke) => {
      const st = sp && sp._g4; if (!st) return false;
      const f = sp.fahrzeuge[nr || 0], v = f.vehicle, x = v.x, y = f.mesh.position.y, z = v.z, rx = -Math.sin(v.heading), rz = -Math.cos(v.heading);
      if (art === 'funken') funken(st, x + rx * 1.6, y + 0.2, z + rz * 1.6, rx, rz, staerke || 20, 24);
      else if (art === 'puff') puff(st, x + rx * 2, y, z + rz * 2, staerke || 1);
      return true;
    },
  };
})();
