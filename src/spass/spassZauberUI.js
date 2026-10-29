// ============================================================
// Spaß-Paket S6 – Fahr-Zauber, OPTIK und Bedienung (nur Browser; läuft ganz am Ende, alles Umhüllungen – nichts Bestehendes wird ersetzt):
//   Szene          Magnet-Röhre (Ringe + durchscheinende Hülle + Schild), Schlucht (dunkler Schlund mit Leuchtkante, Absprung-/Landefeld, Schild), Schienen (gelb-schwarz),
//                  Wände (Ziegel), Halfpipe-Rundungen (Stunt-Park), Zauberkristalle (Riese ⬆ gold · Mini ⬇ türkis · Magnet ◡ rot) – 1 Gruppe `ZauberElemente`, je Art 1–2 Draw-Calls
//   Pose           R.dach.frame (nach S3/S5): Fahrzeug an Röhrenwand/Decke (Rollwinkel θ(s) aus spassZauber.js), in der Halfpipe-Rundung, an der Wand; Riese/Mini skaliert weich;
//                  Flügel (Auto) bzw. Gleitschirm (Motorrad) klappen beim Absprung aus; Funken beim Grinden/Wallride (1 Draw-Call für alle Funken)
//   Kamera         Spiel._loopingKamera umhüllt: in der Röhre/Halfpipe/an der Wand dreht „oben“ weich mit dem Fahrzeug (wie im Looping), Cockpit im Fahrzeug
//   Ereignisse     Spiel.spassEreignis umhüllt: Meldungen, Töne, Konfetti, Kamerawackeln (Riese), Sticker je Neuerung
//   Menü           Pille „✨ Fahr-Zauber An/Aus“ bei den Spaß-Schaltern (Standard an; nur mit „Spaß-Elemente“), Speicher in R.SpassZauber.an()
// ============================================================
(function () {
  const R = window.Rennspiel;
  if (!R || !R.Spiel || !R.SpassZauber || !R.themes || !R.themes.hilfe || typeof THREE === 'undefined') return;
  const SZ = R.SpassZauber, P = R.Spiel.prototype, H = R.themes.hilfe;
  if (R.SpassZauberUI) return;
  const moto = () => window.MOTORRAD === true;
  const spielName = () => (moto() ? 'motorrad' : 'auto');
  const klemme = (x, a, b) => (x < a ? a : x > b ? b : x);
  const jetzt = () => performance.now() / 1000;
  function sticker(name, d) {
    try { if (typeof R.Spass.sticker === 'function') return R.Spass.sticker(name, d); } catch (e) { /* egal */ }
    return R.SpassSticker ? R.SpassSticker.ereignis(spielName(), name, d) : [];
  }

  // ------------------------------------------------------------------ Töne
  const Ton = R.Audio && Object.getPrototypeOf(R.Audio);
  if (Ton && !Ton.zMagnet) {
    Ton.zMagnet = function () { if (!this._bereit()) return; this._ton(140, 520, 0.5, 'sawtooth', 0.07, 0); this._ton(280, 1040, 0.45, 'sine', 0.06, 0.05); this._stoss(0.4, 0.08, 'bandpass', 600, 2400, 1.5, 0.05); };
    Ton.zGleit = function () { if (!this._bereit()) return; this._stoss(0.7, 0.16, 'bandpass', 500, 2600, 0.8, 0); this._ton(330, 660, 0.35, 'triangle', 0.07, 0.05); };
    Ton.zGrind = function () { if (!this._bereit()) return; this._stoss(0.35, 0.2, 'highpass', 2500, 6500, 0.9, 0); this._ton(1800, 900, 0.2, 'sawtooth', 0.04, 0); };
    Ton.zRiese = function () { if (!this._bereit()) return; this._ton(90, 40, 0.7, 'sine', 0.25, 0); this._ton(60, 30, 0.9, 'triangle', 0.18, 0.1); this._stoss(0.5, 0.2, 'lowpass', 400, 80, 1, 0); };
    Ton.zMini = function () { if (!this._bereit()) return; this._ton(500, 1800, 0.18, 'sine', 0.12, 0); this._ton(900, 2400, 0.14, 'triangle', 0.08, 0.08); };
    Ton.zLand = function () { if (!this._bereit()) return; this._ton(400, 700, 0.25, 'triangle', 0.1, 0); this._ton(600, 1000, 0.2, 'sine', 0.07, 0.12); };
    Ton.zPipe = function () { if (!this._bereit()) return; this._ton(220, 880, 0.35, 'triangle', 0.1, 0); this._stoss(0.25, 0.1, 'bandpass', 900, 3000, 1, 0.05); };
  }

  // ------------------------------------------------------------------ Hilfen für Geometrie
  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(1, 1, 1), _e = new THREE.Euler();
  function boxG(cx, cy, cz, sx, sy, sz, ry, farbe, teile) {
    const g = new THREE.BoxGeometry(sx, sy, sz);
    _q.setFromEuler(_e.set(0, ry || 0, 0)); _m.compose(new THREE.Vector3(cx, cy, cz), _q, _s); g.applyMatrix4(_m);
    teile.push({ geo: g, farbe });
  }
  const kopfwinkel = (p) => Math.atan2(p.tx, p.tz);        // BoxGeometry-Länge z entlang der Tangente
  function loesen(g) {
    if (!g) return;
    if (g.parent) g.parent.remove(g);
    g.traverse((c) => { if (c.geometry) c.geometry.dispose(); if (c.material) { const m = Array.isArray(c.material) ? c.material : [c.material]; m.forEach((x) => { if (x.map) x.map.dispose(); x.dispose(); }); } });
  }
  function schildTextur(text, farbe, rand, breite) {
    const c = document.createElement('canvas'); c.width = 512; c.height = 128; const g = c.getContext('2d');
    g.fillStyle = farbe; g.fillRect(0, 0, 512, 128); g.strokeStyle = rand; g.lineWidth = 10; g.strokeRect(8, 8, 496, 112);
    g.fillStyle = '#fff'; g.font = 'bold ' + (breite || 62) + 'px Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, 256, 68);
    return new THREE.CanvasTexture(c);
  }
  function magnetSymbol(g) {            // rotes U-Magnet mit weißen Spitzen auf dem Schild
    g.strokeStyle = '#e0262b'; g.lineWidth = 16; g.lineCap = 'butt'; g.beginPath(); g.arc(64, 74, 30, Math.PI, 0, false); g.moveTo(34, 74); g.lineTo(34, 100); g.moveTo(94, 74); g.lineTo(94, 100); g.stroke();
    g.strokeStyle = '#fff'; g.beginPath(); g.moveTo(34, 96); g.lineTo(34, 108); g.moveTo(94, 96); g.lineTo(94, 108); g.stroke();
  }

  // ------------------------------------------------------------------ Szene
  function szeneBauen(st) {
    const z = st && st.spass && st.spass.zauber; if (!z) return null;
    const sp = st.spline, gruppe = new THREE.Group(); gruppe.name = 'ZauberElemente';
    const grund = (p) => st.hoeheAn(p.x, p.z);
    const mesh = (geo, mat, name, ro) => { const m = new THREE.Mesh(geo, mat); m.name = name; m.frustumCulled = false; if (ro) m.renderOrder = ro; gruppe.add(m); return m; };
    // ---- Magnet-Röhren
    if (z.magnet.length) {
      const ringe = [], pos = [], col = [], idx = [];
      z.magnet.forEach((e) => {
        const Rr = e.halb + 1.2, N = Math.round(e.laenge / 6);
        for (let i = 0; i <= N; i++) {
          const s = e.s0 + e.laenge * i / N, p = sp.punktBei(s), y0 = grund(p), th = kopfwinkel(p);
          const g = new THREE.TorusGeometry(Rr, i === 0 || i === N ? 0.2 : 0.11, 6, 30); g.rotateY(th); g.translate(p.x, y0 + Rr, p.z);
          ringe.push({ geo: g, farbe: i === 0 || i === N ? 0xe0262b : (i % 2 ? 0x8fa6c4 : 0x3a6ac8) });
        }
        // durchscheinende Hülle: Bänder entlang der Röhre
        const NS = Math.round(e.laenge / 5), NA = 28, b0 = pos.length / 3;
        for (let i = 0; i <= NS; i++) {
          const p = sp.punktBei(e.s0 + e.laenge * i / NS), y0 = grund(p), band = i % 2 ? [0.35, 0.55, 0.95] : [0.55, 0.35, 0.9];
          for (let k = 0; k < NA; k++) {
            const a = k / NA * Math.PI * 2, rx = Math.sin(a) * Rr, ry = Rr - Math.cos(a) * Rr;
            pos.push(p.x + p.nx * rx, y0 + ry, p.z + p.nz * rx); col.push(band[0], band[1], band[2]);
          }
        }
        for (let i = 0; i < NS; i++) for (let k = 0; k < NA; k++) { const a = b0 + i * NA + k, b = b0 + i * NA + (k + 1) % NA, c = b0 + (i + 1) * NA + k, d = b0 + (i + 1) * NA + (k + 1) % NA; idx.push(a, b, c, b, d, c); }
        // Schild über dem Eingang
        const p0 = sp.punktBei(e.s0 - 3), y0 = grund(p0);
        const cv = document.createElement('canvas'); cv.width = 512; cv.height = 128; const g = cv.getContext('2d');
        g.fillStyle = '#1d3f8f'; g.fillRect(0, 0, 512, 128); g.strokeStyle = '#fff'; g.lineWidth = 10; g.strokeRect(8, 8, 496, 112);
        magnetSymbol(g); g.fillStyle = '#fff'; g.font = 'bold 52px Arial, sans-serif'; g.textAlign = 'left'; g.textBaseline = 'middle'; g.fillText('MAGNET-RÖHRE', 140, 68);
        const m = new THREE.Mesh(new THREE.PlaneGeometry(9, 2.25), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(cv), side: THREE.DoubleSide }));
        m.position.set(p0.x, y0 + 2 * Rr + 2.6, p0.z); m.rotation.y = kopfwinkel(p0) + Math.PI; m.name = 'MagnetSchild'; gruppe.add(m);
      });
      mesh(H.vereinen(ringe), new THREE.MeshLambertMaterial({ vertexColors: true }), 'MagnetRinge');
      const sg = new THREE.BufferGeometry();
      sg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); sg.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); sg.setIndex(idx); sg.computeVertexNormals();
      mesh(sg, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.14, side: THREE.DoubleSide, depthWrite: false, fog: false }), 'MagnetHuelle', 3);
    }
    // ---- Schluchten
    if (z.schluchten.length) {
      const V = [], T = [], teile = [];
      const flaeche = (s0, s1, q0, q1, h, farbe) => { const P0 = sp.punktBei(s0), P1 = sp.punktBei(s1), y0 = grund(P0), y1 = grund(P1); const p = (P, y, q) => [P.x + P.nx * q, y + h, P.z + P.nz * q]; V.push({ a: p(P0, y0, q0), b: p(P0, y0, q1), c: p(P1, y1, q1), d: p(P1, y1, q0), farbe }); };
      z.schluchten.forEach((e) => {
        const hb = e.halb + 0.6, S = R.config.spass.zauber.schlucht;
        // Schlund: Streifen in dunklen Violett/Schwarz-Tönen, zur Mitte hin schwärzer
        const NS = 11;
        for (let i = 0; i < NS; i++) { const t0 = i / NS, t1 = (i + 1) / NS, m = 1 - Math.abs(t0 + t1 - 1); const c = new THREE.Color().setRGB(0.05 + 0.1 * (1 - m), 0.03 + 0.04 * (1 - m), 0.1 + 0.12 * (1 - m)); flaeche(e.sT + (e.sL - e.sT) * t0, e.sT + (e.sL - e.sT) * t1, -hb, hb, 0.11, c.getHex()); }
        // Leuchtkanten (Warnstreifen) an Anfang und Ende
        for (let k = 0; k < 8; k++) { const q0 = -hb + 2 * hb * k / 8, q1 = -hb + 2 * hb * (k + 1) / 8, f = k % 2 ? 0x111111 : 0xffd23a; flaeche(e.sT - 0.2, e.sT + 1.1, q0, q1, 0.16, f); flaeche(e.sL - 1.1, e.sL + 0.2, q0, q1, 0.16, f); }
        // Absprung-Pfeile (orange) und Landefeld (grün)
        for (let k = 0; k < S.pad / 3 - 1; k++) { const a = e.sT - S.pad + k * 3 + 0.6; flaeche(a, a + 1.5, -hb * 0.7, hb * 0.7, 0.08, k % 2 ? 0xff8a1a : 0xffffff); const b = e.sL + 1.2 + k * 3; flaeche(b, b + 1.5, -hb * 0.7, hb * 0.7, 0.08, k % 2 ? 0x32c46a : 0xffffff); }
        // Felsbrocken an den Seiten
        for (let k = 0; k < 8; k++) {
          const s = e.sT + (e.sL - e.sT) * (k + 0.5) / 8, p = sp.punktBei(s), y0 = grund(p);
          [-1, 1].forEach((sg, j) => boxG(p.x + p.nx * sg * (hb + 1.1 + (k % 3) * 0.5), y0 + 0.7, p.z + p.nz * sg * (hb + 1.1 + (k % 3) * 0.5), 1.4 + (k % 2) * 0.6, 1.4 + ((k + j) % 3) * 0.5, 1.6, kopfwinkel(p) + k, (k + j) % 2 ? 0x6b6258 : 0x827565, teile));
        }
        // Schild
        const p0 = sp.punktBei(e.sT - S.pad - 6), y0 = grund(p0);
        [-1, 1].forEach((sg) => boxG(p0.x + p0.nx * sg * (hb + 1.4), y0 + 2.4, p0.z + p0.nz * sg * (hb + 1.4), 0.3, 4.8, 0.3, 0, 0x55565e, teile));
        const sm = new THREE.Mesh(new THREE.PlaneGeometry(9, 2.25), new THREE.MeshBasicMaterial({ map: schildTextur(moto() ? 'SCHLUCHT – GLEITSCHIRM!' : 'SCHLUCHT – FLÜGEL!', '#5b2a8f', '#fff', 40), side: THREE.DoubleSide }));
        sm.position.set(p0.x, y0 + 5.2, p0.z); sm.rotation.y = kopfwinkel(p0) + Math.PI; sm.name = 'SchluchtSchild'; gruppe.add(sm);
      });
      const geo = (function () {
        const n = V.length * 6, pos = new Float32Array(n * 3), col = new Float32Array(n * 3), c = new THREE.Color(); let o = 0;
        const ecke = (p) => { pos[o] = p[0]; pos[o + 1] = p[1]; pos[o + 2] = p[2]; col[o] = c.r; col[o + 1] = c.g; col[o + 2] = c.b; o += 3; };
        V.forEach((v) => { c.set(v.farbe); [v.a, v.b, v.c, v.a, v.c, v.d].forEach(ecke); });
        const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.computeVertexNormals(); return g;
      })();
      mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4, fog: false }), 'Schlund', 2);
      mesh(H.vereinen(teile), new THREE.MeshLambertMaterial({ vertexColors: true }), 'SchluchtFelsen');
    }
    // ---- Schienen und Wände
    if (z.schienen.length) {
      const teile = [];
      z.schienen.forEach((e) => {
        if (e.art === 'schiene') {
          const N = Math.round(e.laenge / 3);
          for (let i = 0; i < N; i++) {
            const s0 = e.s0 + e.laenge * i / N, s1 = e.s0 + e.laenge * (i + 1) / N, p = sp.punktBei((s0 + s1) / 2), y0 = grund(p);
            boxG(p.x + p.nx * e.q, y0 + e.hoehe - 0.06, p.z + p.nz * e.q, 0.5, 0.12, e.laenge / N + 0.04, kopfwinkel(p), i % 2 ? 0x1a1a1a : 0xffc21a, teile);
            if (i % 2 === 0) boxG(p.x + p.nx * e.q, y0 + e.hoehe / 2 - 0.06, p.z + p.nz * e.q, 0.16, e.hoehe - 0.12, 0.16, 0, 0x55565e, teile);
          }
          const pA = sp.punktBei(e.s0 - 1.2), yA = grund(pA);
          boxG(pA.x + pA.nx * e.q, yA + 0.35, pA.z + pA.nz * e.q, 1.2, 0.7, 0.3, kopfwinkel(pA), 0xff8a1a, teile);
        } else {
          const N = Math.round(e.laenge / 3);
          for (let i = 0; i < N; i++) {
            const s0 = e.s0 + e.laenge * i / N, s1 = e.s0 + e.laenge * (i + 1) / N, p = sp.punktBei((s0 + s1) / 2), y0 = grund(p);
            boxG(p.x + p.nx * (e.q + e.side * 0.2), y0 + e.hoehe * 0.95, p.z + p.nz * (e.q + e.side * 0.2), 0.4, e.hoehe * 1.9, e.laenge / N + 0.04, kopfwinkel(p), i % 2 ? 0xb4472d : 0xc9623f, teile);
          }
          const pm = sp.punktBei(e.s0 + e.laenge / 2), ym = grund(pm);
          boxG(pm.x + pm.nx * (e.q + e.side * 0.2), ym + e.hoehe * 1.9 + 0.12, pm.z + pm.nz * (e.q + e.side * 0.2), 0.7, 0.24, e.laenge, kopfwinkel(pm), 0xffc21a, teile);
        }
      });
      mesh(H.vereinen(teile), new THREE.MeshLambertMaterial({ vertexColors: true }), 'Schienen');
    }
    // ---- Halfpipe
    if (z.pipe) {
      const e = z.pipe, pos = [], col = [], idx = [], NS = Math.round((e.s1 - e.s0) / 2), NK = 12, c1 = new THREE.Color(0x9aa0a8), c2 = new THREE.Color(0x868c95), cG = new THREE.Color(0xffc21a);
      [-1, 1].forEach((sg) => {
        const b0 = pos.length / 3;
        for (let i = 0; i <= NS; i++) {
          const s = e.s0 + (e.s1 - e.s0) * i / NS, p = sp.punktBei(s), y0 = grund(p) - SZ.pipeProfil(e, s, 0), re = e.r * SZ.pipeW(e, s - e.s0);
          const c = i % 2 ? c1 : c2;
          for (let k = 0; k <= NK; k++) {
            const a = k / NK * Math.PI / 2, q = sg * (e.qF + re * Math.sin(a)), y = re * (1 - Math.cos(a));
            pos.push(p.x + p.nx * q, y0 + y + 0.04, p.z + p.nz * q); col.push(c.r, c.g, c.b);
          }
          // Kante (Coping) 1,6 m breit
          [0, 1.6].forEach((dq) => { pos.push(p.x + p.nx * sg * (e.qF + re + dq), y0 + re + 0.05, p.z + p.nz * sg * (e.qF + re + dq)); col.push(cG.r, cG.g, cG.b); });
        }
        const W = NK + 3;
        for (let i = 0; i < NS; i++) for (let k = 0; k < NK + 2; k++) { const a = b0 + i * W + k, b = a + 1, c = a + W, d = c + 1; if (k === NK) continue; idx.push(a, b, c, b, d, c); }
        for (let i = 0; i < NS; i++) { const a = b0 + i * W + NK, b = a + 2 > b0 + i * W + NK + 2 ? a + 1 : a + 1, c = a + W, d = c + 1; idx.push(a, b, c, b, d, c); }
      });
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.setIndex(idx); g.computeVertexNormals();
      mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }), 'HalfpipeBanken');
      const p0 = sp.punktBei(e.s0 - 6), y0 = grund(p0);
      const sm = new THREE.Mesh(new THREE.PlaneGeometry(9, 2.25), new THREE.MeshBasicMaterial({ map: schildTextur('HALFPIPE', '#ff6a10', '#fff', 66), side: THREE.DoubleSide }));
      sm.position.set(p0.x, y0 + 5.4, p0.z); sm.rotation.y = kopfwinkel(p0) + Math.PI; sm.name = 'HalfpipeSchild'; gruppe.add(sm);
    }
    // ---- Zauberkristalle
    gruppe.userData.extras = [];
    z.extras.forEach((e) => {
      const farbe = e.art === 'riese' ? 0xffc21a : e.art === 'mini' ? 0x2ed3c6 : 0xe0262b;
      const g = new THREE.Group(); g.position.set(e.x, e.y + 1.7, e.z); g.name = 'Zauberkristall_' + e.art;
      const kr = new THREE.Mesh(new THREE.OctahedronGeometry(0.85, 0), new THREE.MeshBasicMaterial({ color: farbe, transparent: true, opacity: 0.88, fog: false }));
      kr.scale.set(0.8, 1.25, 0.8);
      const gl = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTextur(), color: farbe, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
      gl.scale.set(4.2, 4.2, 1);
      g.add(kr, gl);
      const sym = symbolGeo(e.art); if (sym) { sym.position.y = 0; g.add(sym); }
      gruppe.add(g); gruppe.userData.extras.push({ g, kr, e });
    });
    return gruppe;
  }
  let _glow = null;
  function glowTextur() {
    if (_glow) return _glow;
    const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 2, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,255,.9)'); gr.addColorStop(0.4, 'rgba(255,255,255,.3)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64); return (_glow = new THREE.CanvasTexture(c));
  }
  function symbolGeo(art) {
    const t = [], W = 0xffffff;
    if (art === 'riese' || art === 'mini') {
      const c = new THREE.ConeGeometry(0.34, 0.42, 4); const sgn = art === 'riese' ? 1 : -1;
      c.translate(0, sgn * 0.12, 0); if (sgn < 0) c.rotateX(Math.PI); t.push({ geo: c, farbe: W });
      const s = new THREE.BoxGeometry(0.16, 0.34, 0.16); s.translate(0, -sgn * 0.2, 0); t.push({ geo: s, farbe: W });
    } else {
      const tor = new THREE.TorusGeometry(0.28, 0.09, 6, 14, Math.PI); tor.translate(0, 0.02, 0); t.push({ geo: tor, farbe: W });
      [-1, 1].forEach((sg) => { const b = new THREE.BoxGeometry(0.18, 0.3, 0.18); b.translate(sg * 0.28, -0.14, 0); t.push({ geo: b, farbe: W }); });
    }
    const m = new THREE.Mesh(H.vereinen(t), new THREE.MeshBasicMaterial({ vertexColors: true, fog: false })); m.frustumCulled = false; m.position.z = 0.62; m.scale.setScalar(1.4);
    const gr = new THREE.Group(); gr.add(m); const m2 = m.clone(); m2.position.z = -0.62; m2.rotation.y = Math.PI; gr.add(m2); return gr;
  }

  function szeneAufbauen(sp) {
    loesen(sp.zauberGruppe); sp.zauberGruppe = null;
    if (sp.zFunken) { loesen(sp.zFunken.punkte); sp.zFunken = null; }
    if (!sp.strecke || !sp.szene) return;
    const z = sp.strecke.spass && sp.strecke.spass.zauber;
    if (z) { sp.zauberGruppe = szeneBauen(sp.strecke); if (sp.zauberGruppe) sp.szene.add(sp.zauberGruppe); }
  }
  const streckeSzeneBauen = P.streckeSzeneBauen;
  P.streckeSzeneBauen = function () {
    const r = streckeSzeneBauen.apply(this, arguments);
    try { szeneAufbauen(this); } catch (e) { console.error('Zauber UI (Szene):', e); }
    return r;
  };

  // ------------------------------------------------------------------ Funken (1 Draw-Call)
  function funkenNeu(szene) {
    const N = 200, pos = new Float32Array(N * 3), col = new Float32Array(N * 3), g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const m = new THREE.Points(g, new THREE.PointsMaterial({ size: 0.28, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, sizeAttenuation: true }));
    m.frustumCulled = false; m.name = 'ZauberFunken'; szene.add(m);
    return { punkte: m, g, pos, col, N, vx: new Float32Array(N), vy: new Float32Array(N), vz: new Float32Array(N), le: new Float32Array(N), i: 0 };
  }
  function funkenSenden(F, x, y, z, n, vx, vy, vz, warm) {
    for (let k = 0; k < n; k++) {
      const i = F.i; F.i = (F.i + 1) % F.N;
      F.pos[i * 3] = x; F.pos[i * 3 + 1] = y; F.pos[i * 3 + 2] = z;
      const r = () => Math.random() - 0.5;
      F.vx[i] = vx + r() * 5; F.vy[i] = vy + Math.random() * 4; F.vz[i] = vz + r() * 5; F.le[i] = 0.35 + Math.random() * 0.3;
      F.col[i * 3] = 1; F.col[i * 3 + 1] = warm ? 0.55 + Math.random() * 0.4 : 0.9; F.col[i * 3 + 2] = warm ? 0.15 : 0.5 + Math.random() * 0.5;
    }
  }
  function funkenUpdate(F, dt) {
    for (let i = 0; i < F.N; i++) {
      if (F.le[i] <= 0) { F.pos[i * 3 + 1] = -9999; continue; }
      F.le[i] -= dt; F.vy[i] -= 14 * dt;
      F.pos[i * 3] += F.vx[i] * dt; F.pos[i * 3 + 1] += F.vy[i] * dt; F.pos[i * 3 + 2] += F.vz[i] * dt;
    }
    F.g.attributes.position.needsUpdate = true; F.g.attributes.color.needsUpdate = true;
  }

  // ------------------------------------------------------------------ Flügel (Auto) / Gleitschirm (Motorrad)
  function fluegelBauen(mesh) {
    const gr = new THREE.Group(); gr.name = 'zFluegel'; gr.visible = false;
    const box = mesh.userData.zBox, hoehe = box ? box.max.y : 1.4, breit = box ? (box.max.x - box.min.x) : 1.9, lang = box ? (box.max.z - box.min.z) : 4.4;
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
    if (moto()) {
      const teile = [], N = 14, span = 7.5, chord = 2.4, hh = 4.6, farben = [0xe0262b, 0xffffff, 0x2a8bff, 0xffffff];
      const pos = [], col = [], idx = [], c = new THREE.Color();
      for (let i = 0; i <= N; i++) {
        const u = i / N * 2 - 1, x = u * span / 2, y = hh - 1.1 * u * u * 1.0;
        [0, 1].forEach((k) => { pos.push(x, y + k * 0.14, (k ? 0.5 : -0.5) * chord * (1 - 0.25 * u * u)); c.set(farben[i % farben.length]); col.push(c.r, c.g, c.b); });
      }
      for (let i = 0; i < N; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.setIndex(idx); g.computeVertexNormals();
      const kappe = new THREE.Mesh(g, mat); kappe.frustumCulled = false; gr.add(kappe);
      [-1, 0, 1].forEach((u) => { [-1, 1].forEach((v) => {
        const x = u * span / 2 * 0.9, y = hh - 1.1 * u * u * 0.81, p = new THREE.Vector3(x, y, v * chord * 0.2), q0 = new THREE.Vector3(0, 1.05, -0.1), d = p.clone().sub(q0), l = d.length();
        const cyl = new THREE.CylinderGeometry(0.012, 0.012, l, 3); cyl.translate(0, l / 2, 0); cyl.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize())); cyl.translate(q0.x, q0.y, q0.z);
        teile.push({ geo: cyl, farbe: 0xeeeeee });
      }); });
      const lines = new THREE.Mesh(H.vereinen(teile), new THREE.MeshBasicMaterial({ vertexColors: true })); lines.frustumCulled = false; gr.add(lines);
    } else {
      const teile = [];
      [-1, 1].forEach((sg) => {
        const w = new THREE.BoxGeometry(2.4, 0.07, 1.0); w.translate(sg * (breit / 2 + 1.2), hoehe * 0.75, lang * 0.02); w.rotateZ(0); teile.push({ geo: w, farbe: 0xffc21a });
        const st = new THREE.BoxGeometry(2.4, 0.08, 0.25); st.translate(sg * (breit / 2 + 1.2), hoehe * 0.75 + 0.03, lang * 0.02 - 0.28); teile.push({ geo: st, farbe: 0xe0262b });
        const tip = new THREE.BoxGeometry(0.1, 0.35, 1.0); tip.translate(sg * (breit / 2 + 2.4), hoehe * 0.75 + 0.15, lang * 0.02); teile.push({ geo: tip, farbe: 0xffffff });
      });
      const fin = new THREE.BoxGeometry(0.08, 0.5, 0.7); fin.translate(0, hoehe + 0.2, -lang * 0.42); teile.push({ geo: fin, farbe: 0xe0262b });
      const mm = new THREE.Mesh(H.vereinen(teile), new THREE.MeshLambertMaterial({ vertexColors: true })); mm.frustumCulled = false; gr.add(mm);
    }
    mesh.add(gr);
    return gr;
  }

  // ------------------------------------------------------------------ Pose (je Bild)
  const _f = new THREE.Vector3(), _u = new THREE.Vector3(), _x = new THREE.Vector3(), _u2 = new THREE.Vector3(), _n = new THREE.Vector3(), _pos = new THREE.Vector3(), _ym = new THREE.Vector3(0, 1, 0), _flat = new THREE.Vector3();
  function basis(f, u, quat) { _x.crossVectors(u, f).normalize(); _u2.crossVectors(f, _x).normalize(); _m.makeBasis(_x, _u2, f); quat.setFromRotationMatrix(_m); }
  const Z = { pose: new Map() };

  /** Magnet: Pose an der Röhrenwand (liefert { pos, u, f } in Z.pose je Fahrzeug) – Position und Orientierung nach Rollwinkel θ(s). */
  function poseMagnet(spiel, f, e, d) {
    const st = spiel.strecke, sp = st.spline, n = sp.naechster(d.x, d.z, f.index >= 0 ? f.index : undefined), th = SZ.magnetTheta(e, sp, n.s), Rr = e.halb + 1.2, p = sp.punktBei(n.s);
    const w = SZ.glatt(th / 0.5), y0 = st.hoeheAn(p.x, p.z), q = n.seitenabstand, phi = th + q / Rr;
    const sl = (st.hoeheAn(p.x + p.tx * 2, p.z + p.tz * 2) - y0) / 2;
    _f.set(p.tx, sl, p.tz).normalize();
    const cx = p.x + p.nx * Rr * Math.sin(phi), cy = y0 + Rr * (1 - Math.cos(phi)), cz = p.z + p.nz * Rr * Math.sin(phi);
    _pos.set(p.x + p.nx * q + (cx - (p.x + p.nx * q)) * w, y0 + (cy - y0) * w, p.z + p.nz * q + (cz - (p.z + p.nz * q)) * w);
    _u.set(-Math.sin(phi) * p.nx, Math.cos(phi), -Math.sin(phi) * p.nz); _u.lerp(_ym, 1 - w).normalize();
    return { pos: _pos, u: _u, f: _f, theta: th, art: 'magnet' };
  }

  function bild(spiel, dt) {
    const F = spiel.fahrzeuge, st = spiel.strecke;
    if (!F || !st) return;
    const z = st.spass && st.spass.zauber;
    // Kristalle drehen/schweben, ausgeblendet bis zur Erneuerung
    const G = spiel.zauberGruppe;
    if (G && G.userData.extras) {
      const t = jetzt(), ex = spiel._zExtra, zeit = spiel._physikZeit || 0;
      G.userData.extras.forEach((o, i) => { const sichtbar = !ex || !ex[i] || zeit >= ex[i].bis; o.g.visible = sichtbar; if (sichtbar) { o.kr.rotation.y = t * 1.6 + i; o.g.position.y = o.e.y + 1.7 + Math.sin(t * 2 + i) * 0.22; } });
    }
    if (!spiel.zFunken && spiel.szene && z && (z.schienen.length || z.pipe)) spiel.zFunken = funkenNeu(spiel.szene);
    const dtt = Math.min(dt || 0.016, 0.05);
    let funkenAn = false;
    for (let i = 0; i < F.length; i++) {
      const f = F[i], mesh = f && f.mesh, fz = f && f.flug, zz = fz && fz.z;
      if (!mesh) continue;
      // Größe (Riese/Mini), weich
      const ziel = zz ? zz.groesse : 1, sk = f._zSk === undefined ? 1 : f._zSk;
      if (ziel !== sk || sk !== 1) {
        const n = sk + (ziel - sk) * (1 - Math.exp(-dtt / 0.15));
        f._zSk = Math.abs(n - ziel) < 0.003 ? ziel : n; mesh.scale.setScalar(f._zSk);
      }
      // Flügel / Gleitschirm
      const fl = mesh.userData.zFluegel || (fz && fz.gleit ? (mesh.userData.zFluegel = fluegelBauen(mesh)) : null);
      if (fl) {
        const an = !!(fz && fz.gleit), a0 = fl.userData.auf || 0, a = klemme(a0 + (an ? 1 : -1) * dtt / 0.3, 0, 1);
        fl.userData.auf = a; fl.visible = a > 0.01;
        if (fl.visible) { fl.scale.set(moto() ? a : a, a, a); fl.rotation.z = (fz.gleit ? -(f.vehicle.lenkung || 0) * 0.25 : 0); }
      }
      // Halfpipe / Wand: Neigung; Röhre: Pose
      let pose = null;
      const d = f.anzeige;
      if (zz && zz.mag && f.vehicle) pose = poseMagnet(spiel, f, zz.mag, d);
      else if (fz && fz.pipe) {
        const P_ = fz.pipe, phi = P_.phi; const p = st.spline.punktBei(P_.s);
        _f.set(p.tx, 0, p.tz).normalize(); _u.set(-P_.side * Math.sin(phi) * p.nx, Math.cos(phi), -P_.side * Math.sin(phi) * p.nz).normalize();
        _pos.set(d.x, d.y, d.z); pose = { pos: _pos, u: _u, f: _f, art: 'pipe', phi };
      } else if (fz && fz.schiene && fz.schiene.art === 'wand') {
        const S_ = fz.schiene, p = st.spline.punktBei(S_.s), al = 1.4 * SZ.glatt(S_.weg / 3);
        _f.set(p.tx, 0, p.tz).normalize(); _u.set(-S_.side * Math.sin(al) * p.nx, Math.cos(al), -S_.side * Math.sin(al) * p.nz).normalize();
        _pos.set(d.x, d.y, d.z); pose = { pos: _pos, u: _u, f: _f, art: 'wand', al };
      }
      const sch = mesh.getObjectByName ? mesh.getObjectByName('schatten') : null;
      if (pose) {
        mesh.position.copy(pose.pos); basis(pose.f, pose.u, _q); mesh.quaternion.copy(_q);
        f._zPose = { u: pose.u.clone(), f: pose.f.clone(), pos: pose.pos.clone(), art: pose.art };
        if (sch && sch.visible) { sch.visible = false; mesh.userData._zSchatten = true; }
      } else {
        if (f._zPose) f._zPose = null;
        if (sch && mesh.userData._zSchatten) { sch.visible = true; mesh.userData._zSchatten = false; }
      }
      // Funken
      if (spiel.zFunken && fz && fz.schiene && f.vehicle) {
        const v = f.vehicle; funkenAn = true;
        const r = fz.schiene.art === 'wand';
        funkenSenden(spiel.zFunken, d.x, d.y + (r ? 0.1 : 0.05), d.z, r ? 1 : 3, -Math.sin(v.heading) * v.vLaengs * 0.3, 2, -Math.cos(v.heading) * v.vLaengs * 0.3, !r);
      }
      // Riese: Erde wackelt (Kamera der Spieler in der Nähe)
      if (zz && zz.riese > 0 && f.vehicle && !spiel.pausiert) {
        f._zWackel = (f._zWackel || 0) - dtt;
        if (f._zWackel <= 0) {
          f._zWackel = 0.45;
          spiel.kameras.forEach((k) => { const o = k.ziel; if (!o) return; const dx = o.x - f.vehicle.x, dz = o.z - f.vehicle.z; if (dx * dx + dz * dz < 40 * 40) k.wackeln(o === f.vehicle ? 3 : 4.5 * Math.max(0, 1 - Math.hypot(dx, dz) / 40)); });
          if (f.istSpieler && R.Audio && R.Audio.kollision) { try { R.Audio.kollision(1); } catch (e) { /* Ton egal */ } }
        }
      }
    }
    if (spiel.zFunken) funkenUpdate(spiel.zFunken, spiel.pausiert ? 0 : dtt);
    void funkenAn;
  }
  if (R.dach && typeof R.dach.frame === 'function' && !R.dach._zauber6) {
    R.dach._zauber6 = true;
    const frame = R.dach.frame;
    R.dach.frame = function (spiel, dt) {
      const r = frame.apply(this, arguments);
      try { bild(spiel, dt); } catch (e) { if (!R._zauberUIFehler) { R._zauberUIFehler = 1; console.error('Zauber UI (Bild):', e); } }
      return r;
    };
  }

  // ------------------------------------------------------------------ Kamera
  const _cU = new THREE.Vector3();
  const lk = P._loopingKamera;
  P._loopingKamera = function (k, dt, alpha) {
    lk.apply(this, arguments);
    try {
      const f = this._fahrzeugVon ? this._fahrzeugVon(k.ziel) : null, pz = f && f._zPose;
      const kam = k.kamera;
      if (!pz || pz.art === 'wand' && false || !this.strecke) { if (k._zKam) k._zKam.an = false; return; }
      const K = k._zKam || (k._zKam = { an: false, pos: new THREE.Vector3(), blick: new THREE.Vector3(), oben: new THREE.Vector3() });
      const cfg = R.config.kamera, e = k.modus === 'weit' ? cfg.weit : cfg.verfolger;
      const stark = pz.art === 'magnet' ? 1 : pz.art === 'pipe' ? 0.45 : 0.55;
      _cU.copy(_ym).lerp(pz.u, stark).normalize();
      let zPos, zBlick;
      if (k.modus === 'cockpit') { zPos = pz.pos.clone().addScaledVector(pz.u, 1.15).addScaledVector(pz.f, 0.4); zBlick = zPos.clone().addScaledVector(pz.f, 30).addScaledVector(pz.u, -0.5); }
      else { zPos = pz.pos.clone().addScaledVector(pz.f, -e.abstand * 0.95).addScaledVector(_cU, e.hoehe * 1.05); zBlick = pz.pos.clone().addScaledVector(pz.f, e.vorausblick * 0.5).addScaledVector(_cU, 0.9); }
      if (!K.an) { K.pos.copy(kam.position); K.blick.copy(k.blick); K.oben.copy(kam.up); K.an = true; }
      const t = 1 - Math.exp(-9 * dt);
      K.pos.lerp(zPos, t); K.blick.lerp(zBlick, Math.min(1, t * 1.6)); K.oben.lerp(_cU, t).normalize();
      kam.position.copy(K.pos); kam.up.copy(K.oben); kam.lookAt(K.blick);
      k.blick.copy(K.blick); k.pos.copy(K.pos);
    } catch (err) { if (!R._zauberKamFehler) { R._zauberKamFehler = 1; console.error('Zauber UI (Kamera):', err); } }
  };

  // ------------------------------------------------------------------ Ereignisse
  const spassEreignis = P.spassEreignis;
  P.spassEreignis = function (i, name) {
    const r = spassEreignis ? spassEreignis.apply(this, arguments) : undefined;
    try {
      const f = this.fahrzeuge[i];
      if (!f || !f.vehicle) return r;
      const mensch = !!f.istSpieler, v = f.vehicle, k = this.spassKonfetti, fz = f.flug, zz = fz && fz.z, A = R.Audio;
      const meld = (t, ms) => { if (mensch) this._meldung(i, t, ms || 1400); };
      const ton = (n) => { if (mensch && A && A[n]) { try { A[n](); } catch (e) { /* Ton egal */ } } };
      switch (name) {
        case 'magnet': meld('Magnet! 🧲 Kopfüber!', 1600); ton('zMagnet'); if (mensch) sticker('magnet'); break;
        case 'gleitStart': meld(moto() ? 'Gleitschirm! 🪂' : 'Flügel aus! 🪂', 1300); ton('zGleit'); if (mensch) this.kameras.forEach((c) => { if (c.ziel === v) c.wackeln(0.6); }); break;
        case 'gleitLand': meld('Sicher gelandet! 🪂', 1300); ton('zLand'); if (k) k.burst(v.x, v.y + 2, v.z, 40); if (mensch) sticker('gleiten'); break;
        case 'gleitDaneben': meld('Fast! Nochmal versuchen 😊', 1800); break;
        case 'grind': meld('Grind! 🛹', 900); ton('zGrind'); break;
        case 'grindEnde': if (zz && zz.letzter) { meld(`Grind ${zz.letzter.m} m · ${zz.letzter.punkte} Punkte! 🛹`, 1800); if (mensch) sticker('grind', { m: zz.letzter.m }); } break;
        case 'wand': meld('Wallride! 🧱', 900); ton('zGrind'); break;
        case 'wandEnde': if (zz && zz.letzter) { meld(`Wand ${zz.letzter.m} m · ${zz.letzter.punkte} Punkte! 🧱`, 1800); if (mensch) sticker('wand', { m: zz.letzter.m }); } break;
        case 'pipeStart': meld('Halfpipe! 🛝', 1000); ton('zPipe'); break;
        case 'pipeLuft': meld('Luft! Zeig einen Trick! 🛝', 1500); ton('zPipe'); if (mensch && zz) sticker('halfpipe', { hoch: zz.pipeMax || 0 }); break;
        case 'riese': meld('Riese! 🏔️ (8 Sekunden)', 2000); ton('zRiese'); if (k) k.burst(v.x, v.y + 2, v.z, 70); if (mensch) { sticker('riese'); this.kameras.forEach((c) => { if (c.ziel === v) c.wackeln(4); }); } break;
        case 'mini': meld('Mini! 🐜 Flitzer!', 2000); ton('zMini'); if (k) k.burst(v.x, v.y + 1, v.z, 40); if (mensch) sticker('mini'); break;
        case 'magnetExtra': meld('Magnet-Reifen! 🧲 (10 Sekunden)', 2000); ton('zMagnet'); if (k) k.burst(v.x, v.y + 1.5, v.z, 40); break;
        case 'riesenEnde': meld('Wieder normal 🙂', 1000); break;
        default: break;
      }
      if (R.SpassZauberFigur && R.SpassZauberFigur.ereignis) R.SpassZauberFigur.ereignis(this, i, name);
    } catch (e) { console.error('Zauber UI (Ereignis):', e); }
    return r;
  };

  // ------------------------------------------------------------------ Auto-Maße (für Flügel/Haustier) merken
  if (R.carBuilder && R.carBuilder.bauen && !R.carBuilder._zBox) {
    R.carBuilder._zBox = true;
    const bauen = R.carBuilder.bauen;
    R.carBuilder.bauen = function () {
      const g = bauen.apply(this, arguments);
      try { if (g && g.userData && !g.userData.zBox) { g.updateMatrixWorld(true); g.userData.zBox = new THREE.Box3().setFromObject(g); } } catch (e) { /* ohne Maße */ }
      return g;
    };
  }

  // ------------------------------------------------------------------ Menü
  function stil() {
    if (typeof document === 'undefined' || document.getElementById('spass-zauber-stil')) return;
    const s = document.createElement('style'); s.id = 'spass-zauber-stil';
    s.textContent = '.m-spass{gap:.25em .5em!important;font-size:.7em!important}.m-spass .gr{padding:.1em .3em!important;gap:.2em!important}';
    document.head.appendChild(s);
  }
  if (R.Menue) {
    const M = R.Menue.prototype;
    const zeilen = M.zeilen;
    M.zeilen = function () { const z = zeilen.apply(this, arguments), i = z.indexOf('start'); z.splice(i < 0 ? z.length : i, 0, 'zauber'); return z; };
    const zeilenWert = M.zeilenWert;
    M.zeilenWert = function (zeile, dx) { if (zeile === 'zauber') { if (dx) this.wertSetzen('zauber', dx > 0 ? 'an' : 'aus'); return; } return zeilenWert.apply(this, arguments); };
    const wertSetzen = M.wertSetzen;
    M.wertSetzen = function (zeile, k) { if (zeile === 'zauber') { SZ.anSetzen(k === 'an'); this.e.zauber = k === 'an'; return; } return wertSetzen.apply(this, arguments); };
    const htmlStart = M.htmlStart;
    M.htmlStart = function () {
      let h = htmlStart.apply(this, arguments);
      try {
        stil();
        const z = this.zeilen(), gf = z[this.fokus], an = SZ.an();
        this.e.zauber = an;
        const pille = (k, text, a) => `<span class="pille${a ? ' aktiv' : ''}" data-a="wert:zauber:${k}">${text}</span>`;
        const gr = `<span class="gr${gf === 'zauber' ? ' fokus' : ''}" title="Magnet-Röhren, Schluchten mit Flügeln/Gleitschirm, Geländer und Wände, Halfpipe, Riesen-/Mini-Kristalle auf passenden Strecken – Aus: wie früher (braucht „Spaß-Elemente“)">` +
          `<span class="z-label" data-a="fokus:${z.indexOf('zauber')}">✨ Fahr-Zauber</span>${pille('aus', 'Aus', !an)}${pille('an', 'An', an)}</span>`;
        h = h.replace('<span class="knopf klein" data-a="album"', gr + '<span class="knopf klein" data-a="album"');
      } catch (err) { console.error('Zauber UI (Menü):', err); }
      return h;
    };
  }

  R.SpassZauberUI = { szeneBauen, bild, poseMagnet, fluegelBauen, funkenNeu, symbolGeo, sticker, loesen, Z };
})();
