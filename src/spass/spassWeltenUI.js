// ============================================================
// Spaß-Paket S5 – Oberfläche und Optik der neuen Welten (nur Browser; läuft nach spassTricksUI.js, alles Umhüllungen):
//   Teleport-Tore      Ringe (blau = Eingang A, orange = Ausgang B) + wirbelnde Portalscheiben aus strecke.spass.tore (je 1 Draw-Call über alle Tore); Ereignis 'teleport':
//                      Funkeln an beiden Toren, Meldung, Ton, Sticker.
//   Mond-Hüpfer        Landung nach einem Hüpfer (f.flug.huepfLandung): sanfte Landung mit Mondstaub statt Kamerawackeln.
//   Regenbogenspur     Schalter „🌈 Regenbogenspur“ (Standard aus): verblassendes Farbband hinter dem eigenen Fahrzeug (1 Draw-Call je Spieler, nur mit Schalter).
//   Dino-Begleiter     Schalter „🦖 Dino-Begleiter“ (Aus · Dino-Land · Überall; Standard Dino-Land): freundlicher Dino läuft neben der Strecke mit (Beine + Schwanz animiert,
//                      Kopf hoch + freundliches Brüllen bei Sprüngen/Trampolin/Kanone). Keine Kollision (nur Optik, steht neben der Fahrbahn).
//   Speicher           localStorage 'rennspiel.spass.welten.<spiel>' { spur, dino }.
// ============================================================
(function () {
  const R = window.Rennspiel;
  if (!R || !R.Spiel || !R.Spass || !R.themes || !R.themes.hilfe) return;
  const P = R.Spiel.prototype, H = R.themes.hilfe;
  const moto = () => window.MOTORRAD === true;
  const spielName = () => (moto() ? 'motorrad' : 'auto');
  const jetzt = () => performance.now() / 1000;
  const klemme = (x, a, b) => (x < a ? a : x > b ? b : x);

  // ------------------------------------------------------------------ Einstellungen
  const KEY = () => 'rennspiel.spass.welten.' + spielName();
  const STAND = { spur: false, dino: 'dino', geladen: false };
  function laden() {
    if (STAND.geladen) return STAND;
    STAND.geladen = true;
    try {
      const o = JSON.parse(window.localStorage.getItem(KEY()) || 'null');
      if (o) { STAND.spur = o.spur === true; if (['aus', 'dino', 'immer'].includes(o.dino)) STAND.dino = o.dino; }
    } catch (e) { /* kein localStorage */ }
    return STAND;
  }
  function sichern() { try { window.localStorage.setItem(KEY(), JSON.stringify({ spur: STAND.spur, dino: STAND.dino })); } catch (e) { /* egal */ } }
  const einst = () => laden();
  function sticker(name, d) {
    try { if (typeof R.Spass.sticker === 'function') return R.Spass.sticker(name, d); } catch (e) { /* egal */ }
    return R.SpassSticker ? R.SpassSticker.ereignis(spielName(), name, d) : [];
  }

  // ------------------------------------------------------------------ Töne
  const Ton = R.Audio && Object.getPrototypeOf(R.Audio);
  if (Ton && !Ton.teleport) {
    Ton.teleport = function () {
      if (!this._bereit()) return;
      this._ton(380, 1700, 0.32, 'sine', 0.13, 0);
      this._ton(1700, 3400, 0.22, 'triangle', 0.06, 0.1);
      this._ton(900, 450, 0.3, 'sine', 0.07, 0.22);
      this._stoss(0.25, 0.12, 'highpass', 2500, 6000, 1, 0.05);
    };
    // freundliches Brüllen: höher, weicher, kurz („wuaa“) – kein Gebrüll des Dino-Themas
    Ton.dinoFreund = function () {
      if (!this._bereit()) return;
      this._ton(300, 520, 0.18, 'triangle', 0.13, 0);
      this._ton(520, 230, 0.45, 'triangle', 0.13, 0.16);
      this._ton(150, 110, 0.6, 'sine', 0.1, 0.1);
    };
  }

  // ------------------------------------------------------------------ Teleport-Tore
  function swirlTextur() {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const g = c.getContext('2d'); g.fillStyle = '#000'; g.fillRect(0, 0, 128, 128);
    const gr = g.createRadialGradient(64, 64, 4, 64, 64, 64); gr.addColorStop(0, 'rgba(255,255,255,.95)'); gr.addColorStop(0.6, 'rgba(255,255,255,.35)'); gr.addColorStop(1, 'rgba(255,255,255,.12)');
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
    g.lineWidth = 7; g.lineCap = 'round';
    for (let k = 0; k < 4; k++) {
      g.strokeStyle = 'rgba(255,255,255,.85)'; g.beginPath();
      for (let t = 0; t <= 1; t += 0.03) { const a = k * 1.571 + t * 5, r = 6 + t * 56; const x = 64 + Math.cos(a) * r, y = 64 + Math.sin(a) * r; if (t === 0) g.moveTo(x, y); else g.lineTo(x, y); }
      g.stroke();
    }
    const t = new THREE.CanvasTexture(c); t.center.set(0.5, 0.5); return t;
  }
  function toreBauen(st) {
    const tore = st && st.spass && st.spass.tore; if (!tore || !tore.length) return null;
    const sp = st.spline, gruppe = new THREE.Group(); gruppe.name = 'SpassTore';
    const ringe = [], pos = [], col = [], uv = [], idx = [];
    const FA = new THREE.Color(0x2a8bff), FB = new THREE.Color(0xff8a1a);
    const tor = (s, farbe, halb) => {
      const p = sp.punktBei(s), y0 = st.hoeheAn(p.x, p.z), rx = halb + 0.6, ry = 3.6, th = Math.atan2(p.tx, p.tz);
      const g = new THREE.TorusGeometry(1, 0.075, 8, 40); g.scale(rx, ry, 1); g.computeVertexNormals();
      g.rotateY(th); g.translate(p.x, y0 + 3.0, p.z);
      ringe.push({ geo: g, farbe });
      const g2 = new THREE.TorusGeometry(1, 0.05, 6, 40); g2.scale(rx - 0.55, ry - 0.45, 1); g2.computeVertexNormals();
      g2.rotateY(th); g2.translate(p.x, y0 + 3.0, p.z);
      ringe.push({ geo: g2, farbe: 0xffffff });
      // Scheibe (Fächer): Mitte + 32 Randpunkte
      const b = pos.length / 3, N = 32, c = farbe === FA.getHex() ? FA : FB;
      pos.push(p.x, y0 + 3.0, p.z); col.push(c.r, c.g, c.b); uv.push(0.5, 0.5);
      for (let i = 0; i <= N; i++) {
        const a = i / N * Math.PI * 2, cx = Math.cos(a), cy = Math.sin(a), q = cx * (rx - 0.6);
        pos.push(p.x + p.nx * q, y0 + 3.0 + cy * (ry - 0.5), p.z + p.nz * q); col.push(c.r, c.g, c.b); uv.push(0.5 + cx * 0.5, 0.5 + cy * 0.5);
      }
      for (let i = 1; i <= N; i++) idx.push(b, b + i, b + i + 1);
    };
    tore.forEach((e) => { tor(e.sT, FA.getHex(), e.halb); tor(e.sB + 2, FB.getHex(), e.halb); });
    const rg = H.vereinen(ringe);
    const rm = new THREE.Mesh(rg, new THREE.MeshBasicMaterial({ vertexColors: true }));
    rm.name = 'ToreRinge'; rm.frustumCulled = false; gruppe.add(rm);
    const dg = new THREE.BufferGeometry();
    dg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); dg.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); dg.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); dg.setIndex(idx);
    const tex = swirlTextur();
    const dm = new THREE.Mesh(dg, new THREE.MeshBasicMaterial({ map: tex, vertexColors: true, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }));
    dm.name = 'TorScheiben'; dm.frustumCulled = false; dm.renderOrder = 4; gruppe.add(dm);
    gruppe.userData.tex = tex;
    return gruppe;
  }

  // ------------------------------------------------------------------ Regenbogenspur
  const BAND = [0xff3b5c, 0xff9a2e, 0xffe14a, 0x44d97c, 0x3aa0ff, 0x6a5cff, 0xb25cff];
  const SPUR_N = 56;
  function spurNeu(szene, breit) {
    const nb = BAND.length, vn = SPUR_N * nb * 2;
    const pos = new Float32Array(vn * 3), col = new Float32Array(vn * 4), idx = [];
    for (let i = 0; i < SPUR_N - 1; i++) for (let k = 0; k < nb; k++) { const a = i * nb * 2 + k * 2, b = (i + 1) * nb * 2 + k * 2; idx.push(a, a + 1, b, a + 1, b + 1, b); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 4)); g.setIndex(idx);
    g.setDrawRange(0, 0);
    const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false }));
    m.frustumCulled = false; m.name = 'Regenbogenspur'; m.renderOrder = 5; szene.add(m);
    const farben = BAND.map((h) => new THREE.Color(h));
    return { m, g, pos, col, farben, n: 0, x: new Float32Array(SPUR_N), y: new Float32Array(SPUR_N), z: new Float32Array(SPUR_N), hd: new Float32Array(SPUR_N), breit };
  }
  function spurSchritt(sp, f, S) {
    const v = f.vehicle, nb = BAND.length;
    const aktiv = sp.zustand === 'rennen' && sp.rennen && sp.rennen.gasErlaubt && !f.ausgeschieden;
    if (aktiv) {
      const rueck = moto() ? 0.9 : 1.9, bx = v.x - Math.sin(v.heading) * rueck, bz = v.z - Math.cos(v.heading) * rueck, by = v.y + (moto() ? 0.55 : 0.45);
      const dx = bx - S.x[0], dz = bz - S.z[0], dy = by - S.y[0];
      if (S.n && dx * dx + dz * dz + dy * dy > 625) S.n = 0;               // Teleport/Zurücksetzen: Spur neu beginnen
      if (!S.n || dx * dx + dz * dz > 0.6) {
        for (let i = Math.min(S.n, SPUR_N - 1); i > 0; i--) { S.x[i] = S.x[i - 1]; S.y[i] = S.y[i - 1]; S.z[i] = S.z[i - 1]; S.hd[i] = S.hd[i - 1]; }
        S.x[0] = bx; S.y[0] = by; S.z[0] = bz; S.hd[0] = v.heading; S.n = Math.min(S.n + 1, SPUR_N);
      } else { S.x[0] = bx; S.y[0] = by; S.z[0] = bz; S.hd[0] = v.heading; }
    } else if (S.n) S.n = Math.max(0, S.n - 2);                             // Spur verblasst nach dem Rennen
    // Verblassen: ohne Fahren schrumpft die Spur von hinten
    if (!aktiv || Math.abs(v.vLaengs || 0) < 2) { if (S.n > 2 && (S.schwund = (S.schwund || 0) + 1) % 2 === 0) S.n--; } else S.schwund = 0;
    const n = S.n;
    if (n < 2) { S.g.setDrawRange(0, 0); return; }
    for (let i = 0; i < n; i++) {
      const rx = Math.cos(S.hd[i]), rz = -Math.sin(S.hd[i]), alpha = Math.pow(1 - i / SPUR_N, 1.4) * 0.85, w = S.breit * (0.7 + 0.3 * (1 - i / SPUR_N));
      for (let k = 0; k < nb; k++) {
        const q0 = -w / 2 + w * k / nb, q1 = -w / 2 + w * (k + 1) / nb, c = S.farben[k];
        for (let e = 0; e < 2; e++) {
          const q = e ? q1 : q0, o = (i * nb * 2 + k * 2 + e);
          S.pos[o * 3] = S.x[i] + rx * q; S.pos[o * 3 + 1] = S.y[i]; S.pos[o * 3 + 2] = S.z[i] + rz * q;
          S.col[o * 4] = c.r; S.col[o * 4 + 1] = c.g; S.col[o * 4 + 2] = c.b; S.col[o * 4 + 3] = alpha;
        }
      }
    }
    S.g.setDrawRange(0, (n - 1) * nb * 6);
    S.g.attributes.position.needsUpdate = true; S.g.attributes.color.needsUpdate = true;
  }

  // ------------------------------------------------------------------ Dino-Begleiter
  function dinoGeometrien() {
    const E = H.ellipsoid, Z = H.zylinderZwischen, t = [], add = (g, f) => t.push({ geo: g, farbe: f });
    const haut = 0x6fcf55, bauch = 0xdff59a;
    add(E(2.3, 1.55, 1.45, 0, 3.1, 0, 12), haut);
    add(E(2.0, 1.0, 1.3, 0.25, 2.55, 0, 10), bauch);
    add(Z([1.5, 3.5, 0], [2.9, 4.9, 0], 0.95, 0.8, 8), haut);
    add(E(1.4, 1.15, 1.2, 3.4, 5.2, 0, 12), haut);                         // großer, freundlicher Kopf
    add(E(0.95, 0.5, 0.85, 4.35, 4.8, 0, 9), bauch);
    [-1, 1].forEach((sg) => {
      add(E(0.42, 0.46, 0.32, 3.7, 5.7, 0.78 * sg, 8), 0xffffff);          // große Augen
      add(E(0.2, 0.24, 0.16, 3.97, 5.72, 0.88 * sg, 6), 0x1a1a1a);
      add(E(0.24, 0.2, 0.1, 3.95, 5.0, 1.05 * sg, 5), 0xff9ab5);           // rosa Backen
      add(E(0.1, 0.1, 0.1, 4.8, 5.1, 0.3 * sg, 4), 0x2f6b2a);              // Nasenlöcher
    });
    add(E(0.5, 0.07, 0.6, 4.4, 4.62, 0, 6), 0xb4472d);                     // Lächeln
    for (let k = 0; k < 6; k++) {                                          // orange Rückenzacken
      const x = -1.7 + k * 0.62, y = k < 3 ? 4.5 - Math.abs(k - 1) * 0.06 : 4.4 - (k - 3) * 0.05;
      const c = new THREE.ConeGeometry(0.34, 0.85, 5); c.translate(x, y + 0.2, 0); add(c, 0xff9a2e);
    }
    const koerper = H.vereinen(t);
    const sch1 = H.vereinen([{ geo: Z([0, 0, 0], [-2.3, -0.25, 0], 1.0, 0.62, 8), farbe: haut }]);
    const sch2 = H.vereinen([{ geo: Z([0, 0, 0], [-2.5, -0.45, 0], 0.62, 0.06, 7), farbe: haut }, { geo: (() => { const c = new THREE.ConeGeometry(0.4, 0.9, 5); c.rotateZ(Math.PI / 2); c.translate(-2.7, -0.5, 0); return c; })(), farbe: 0xff9a2e }]);
    const bein = H.vereinen([{ geo: Z([0, 0, 0], [0, -2.5, 0], 0.62, 0.45, 7), farbe: haut }, { geo: E(0.85, 0.3, 0.65, 0.35, -2.6, 0, 7), farbe: 0xf2e6b0 }]);
    return { koerper, sch1, sch2, bein };
  }
  const HUEFTEN = [[1.3, 2.75, 0.95], [1.3, 2.75, -0.95], [-1.3, 2.75, 0.95], [-1.3, 2.75, -0.95]];

  function dinoBauen(sp) {
    const G = dinoGeometrien(), mat = H.vertexMaterial(false);
    const gruppe = new THREE.Group(); gruppe.name = 'DinoBegleiter';
    const koerper = new THREE.Mesh(G.koerper, mat); koerper.name = 'DinoKoerper';
    const sch1 = new THREE.Mesh(G.sch1, mat); sch1.position.set(-1.9, 3.2, 0);
    const sch2 = new THREE.Mesh(G.sch2, mat); sch2.position.set(-2.3, -0.25, 0); sch1.add(sch2);
    gruppe.add(koerper, sch1);
    const beine = new THREE.InstancedMesh(G.bein, mat, 4); beine.name = 'DinoBeine'; beine.frustumCulled = false;
    beine.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    gruppe.frustumCulled = false; koerper.frustumCulled = false; sch1.frustumCulled = false; sch2.frustumCulled = false;
    sp.szene.add(gruppe); sp.szene.add(beine);
    return { gruppe, koerper, sch1, sch2, beine, phase: 0, s: null, roar: 0, tmp: new THREE.Matrix4(), qa: new THREE.Quaternion(), va: new THREE.Vector3(), vs: new THREE.Vector3(1, 1, 1), z: new THREE.Vector3(0, 0, 1) };
  }
  function dinoAbbauen(sp) {
    const D = sp.dinoBegleiter; if (!D) return;
    [D.gruppe, D.beine].forEach((o) => { if (o.parent) o.parent.remove(o); });
    D.gruppe.traverse((c) => { if (c.geometry) c.geometry.dispose(); });
    D.beine.geometry.dispose(); D.beine.dispose();
    if (D.gruppe.children[0] && D.gruppe.children[0].material) D.gruppe.children[0].material.dispose();
    sp.dinoBegleiter = null;
  }
  const dinoAktivFuer = (strecke) => { const m = einst().dino; return m === 'immer' || (m === 'dino' && strecke && strecke.id === 'dino'); };
  function dinoSchritt(sp, D, dt) {
    const f = sp.fahrzeuge[0], v = f && f.vehicle, st = sp.strecke;
    const laeuft = !!(v && st && (sp.zustand === 'rennen' || sp.zustand === 'ergebnis'));
    if (!laeuft) { D.gruppe.visible = false; D.beine.visible = false; return; }
    const spl = st.spline, sNah = f.nah && f.nah.s !== undefined ? f.nah.s : spl.naechster(v.x, v.z).s;
    const vor = moto() ? 10 : 16, ziel = sNah + vor;
    if (D.s === null || Math.abs(spl.differenzS(D.s, ziel)) > 80) D.s = spl.wrapS(ziel);
    else D.s = spl.wrapS(D.s + spl.differenzS(D.s, ziel) * Math.min(1, dt * 4));
    const p = spl.punktBei(D.s), b2 = st.breite / 2, dist = b2 + Math.max(4, Math.min((st.zaunAbstand || 14) - 3, 6.5));
    const x = p.x + p.nx * dist, z = p.z + p.nz * dist, y = st.bodenHoehe(x, z);
    const verdeckt = st.imTunnel && st.imTunnel(D.s, 12);
    D.gruppe.visible = !verdeckt; D.beine.visible = !verdeckt;
    if (verdeckt) return;
    const tempo = Math.abs(v.vLaengs || 0), sk = moto() ? 0.8 : 1.0;
    D.phase += tempo * dt / 5.5 * Math.PI * 2 * (sp.pausiert ? 0 : 1);
    const ph = D.phase, idle = tempo < 1.5 ? jetzt() : 0;
    if (D.roar > 0) D.roar = Math.max(0, D.roar - dt);
    const r = D.roar > 0 ? Math.sin(Math.PI * (1 - D.roar / 0.9)) : 0;
    const huepf = tempo > 1.5 ? Math.abs(Math.cos(ph)) * 0.28 : Math.sin(idle * 2) * 0.05;
    D.gruppe.position.set(x, y + huepf * sk * 3, z);
    D.gruppe.rotation.set(0, -Math.atan2(p.tz, p.tx), Math.sin(ph * 2) * 0.03 * Math.min(1, tempo / 10) + r * 0.32);
    D.gruppe.scale.setScalar(sk * (1 + r * 0.06));
    D.sch1.rotation.y = Math.sin(ph * 0.5) * 0.4 + (tempo < 1.5 ? Math.sin(idle * 1.6) * 0.3 : 0);
    D.sch2.rotation.y = Math.sin(ph * 0.5 - 1.0) * 0.55;
    D.sch1.rotation.z = r * -0.2;
    D.gruppe.updateMatrix();
    const amp = tempo > 1.5 ? 0.85 : 0.05;
    for (let i = 0; i < 4; i++) {
      const diag = (i === 0 || i === 3) ? 0 : Math.PI;
      D.qa.setFromAxisAngle(D.z, Math.sin(ph + diag) * amp);
      D.va.set(HUEFTEN[i][0], HUEFTEN[i][1] + (Math.cos(ph + diag) > 0.6 ? 0 : 0), HUEFTEN[i][2]);
      D.tmp.compose(D.va, D.qa, D.vs);
      D.tmp.premultiply(D.gruppe.matrix);
      D.beine.setMatrixAt(i, D.tmp);
    }
    D.beine.instanceMatrix.needsUpdate = true;
  }
  function dinoBruellen(sp) {
    const D = sp.dinoBegleiter; if (!D || D.roar > 0.3 || !D.gruppe.visible) return;
    D.roar = 0.9;
    if (R.Audio && R.Audio.dinoFreund) { try { R.Audio.dinoFreund(); } catch (e) { /* Ton egal */ } }
    sticker('dino');
  }

  // ------------------------------------------------------------------ Szene
  function loesen(g) {
    if (!g) return;
    if (g.parent) g.parent.remove(g);
    g.traverse((c) => { if (c.geometry) c.geometry.dispose(); if (c.material) { const m = Array.isArray(c.material) ? c.material : [c.material]; m.forEach((x) => { if (x.map) x.map.dispose(); x.dispose(); }); } });
  }
  function szeneAufbauen(sp) {
    loesen(sp.spassTore); sp.spassTore = null;
    dinoAbbauen(sp);
    (sp.regenSpuren || []).forEach((S) => loesen(S.m)); sp.regenSpuren = null;
    if (!sp.strecke || !sp.szene) return;
    if (sp.strecke.spass && sp.strecke.spass.tore && sp.strecke.spass.tore.length) { sp.spassTore = toreBauen(sp.strecke); if (sp.spassTore) sp.szene.add(sp.spassTore); }
  }
  const streckeSzeneBauen = P.streckeSzeneBauen;
  P.streckeSzeneBauen = function () {
    const r = streckeSzeneBauen.apply(this, arguments);
    try { szeneAufbauen(this); } catch (e) { console.error('Welten UI (Szene):', e); }
    return r;
  };
  // Dino und Spur je nach aktuellem Schalter (auch mitten im Menü-/Rennwechsel) anlegen
  function begleiterAbgleichen(sp) {
    if (!sp.szene || !sp.strecke) return;
    const dinoSoll = dinoAktivFuer(sp.strecke) && sp.fahrzeuge && sp.fahrzeuge.length && sp.zustand !== 'menue';
    if (dinoSoll && !sp.dinoBegleiter) sp.dinoBegleiter = dinoBauen(sp);
    else if (!dinoSoll && sp.dinoBegleiter) dinoAbbauen(sp);
    const spurSoll = einst().spur && sp.fahrzeuge && sp.zustand !== 'menue';
    if (spurSoll && !sp.regenSpuren) {
      sp.regenSpuren = [];
      sp.fahrzeuge.forEach((f, i) => { if (f.istSpieler && i < 2) { const S = spurNeu(sp.szene, moto() ? 1.1 : 2.0); S.f = f; sp.regenSpuren.push(S); } });
    } else if (!spurSoll && sp.regenSpuren) { sp.regenSpuren.forEach((S) => loesen(S.m)); sp.regenSpuren = null; }
  }
  const rennenStarten = P.rennenStarten;
  P.rennenStarten = function () {
    const r = rennenStarten.apply(this, arguments);
    try { this._mondHuepfer = 0; dinoAbbauen(this); if (this.regenSpuren) { this.regenSpuren.forEach((S) => loesen(S.m)); this.regenSpuren = null; } begleiterAbgleichen(this); } catch (e) { console.error('Welten UI (Start):', e); }
    return r;
  };

  // ------------------------------------------------------------------ Ereignisse
  const spassEreignis = P.spassEreignis;
  P.spassEreignis = function (i, name) {
    const r = spassEreignis ? spassEreignis.apply(this, arguments) : undefined;
    try {
      const f = this.fahrzeuge[i];
      if (!f || !f.vehicle) return r;
      if (name === 'teleport' && f.flug && f.flug.tele) {
        const t = f.flug.tele, k = this.spassKonfetti, mensch = !!f.istSpieler;
        if (k) { k.burst(t.von.x, t.von.y + 2, t.von.z, 60); k.burst(t.nach.x, t.nach.y + 2, t.nach.z, 90); }
        if (mensch) {
          this._meldung(i, 'Teleport! 🌀', 1300); sticker('teleport');
          if (R.Audio && R.Audio.teleport) { try { R.Audio.teleport(); } catch (e) { /* Ton egal */ } }
          this.kameras.forEach((c) => { if (c.ziel === f.vehicle) c.wackeln(0.8); });
        }
      } else if (f.istSpieler && (name === 'trampolin' || name === 'kanoneBumm')) dinoBruellen(this);
    } catch (e) { console.error('Welten UI (Ereignis):', e); }
    return r;
  };
  const flugEreignis = P._flugEreignis;
  P._flugEreignis = function (i, e) {
    try {
      const f = this.fahrzeuge[i];
      if ((e === 'landung' || e === 'landungSchraeg') && f && f.flug && f.flug.huepfLandung) {
        f.flug.huepfLandung = false;
        if (f.vehicle) this.weltStaub && this.weltStaub(f.vehicle.x, f.vehicle.y, f.vehicle.z, 16);
        if (f.istSpieler) {
          this._mondHuepfer = (this._mondHuepfer || 0) + 1;
          sticker('huepfer', { n: this._mondHuepfer });
          if (R.Audio && R.Audio.kollision) { try { R.Audio.kollision(1); } catch (err) { /* Ton egal */ } }
        }
        return;                                                            // sanft: kein Kamerawackeln, keine „Rumms“-Meldung
      }
      if (e === 'sprung' && f && f.istSpieler) dinoBruellen(this);
    } catch (err) { console.error('Welten UI (Flug):', err); }
    return flugEreignis.apply(this, arguments);
  };

  // ------------------------------------------------------------------ Bild
  if (R.dach && typeof R.dach.frame === 'function') {
    const frame = R.dach.frame;
    R.dach.frame = function (spiel, dt) {
      const r = frame.apply(this, arguments);
      try {
        const d = spiel.pausiert ? 0 : Math.min(dt || 0.016, 0.05);
        if (spiel.spassTore) { const t = spiel.spassTore.userData.tex; if (t) t.rotation = jetzt() * 1.4; }
        if (!spiel._welteAbgleich || ++spiel._welteAbgleich % 20 === 0) begleiterAbgleichen(spiel);
        if (!spiel._welteAbgleich) spiel._welteAbgleich = 1;
        if (spiel.dinoBegleiter) dinoSchritt(spiel, spiel.dinoBegleiter, d);
        if (spiel.regenSpuren) spiel.regenSpuren.forEach((S) => { if (S.f && S.f.vehicle) spurSchritt(spiel, S.f, S); });
      } catch (e) { if (!R._weltenUIFehler) { R._weltenUIFehler = 1; console.error('Welten UI (Bild):', e); } }
      return r;
    };
  }

  // ------------------------------------------------------------------ Menü
  function stil() {
    if (typeof document === 'undefined' || document.getElementById('spass-welten-stil')) return;
    const s = document.createElement('style');
    s.id = 'spass-welten-stil';
    s.textContent = '.m-spass{gap:.25em .5em!important;font-size:.7em!important}.m-spass .gr{padding:.1em .3em!important;gap:.2em!important}';
    document.head.appendChild(s);
  }
  if (R.Menue) {
    const M = R.Menue.prototype, EIG = ['regenbogen', 'dino'];
    const zeilen = M.zeilen;
    M.zeilen = function () { const z = zeilen.apply(this, arguments), i = z.indexOf('start'); z.splice(i < 0 ? z.length : i, 0, ...EIG); return z; };
    const DINO = ['aus', 'dino', 'immer'];
    const zeilenWert = M.zeilenWert;
    M.zeilenWert = function (zeile, dx) {
      if (zeile === 'regenbogen') { if (dx) this.wertSetzen(zeile, dx > 0 ? 'an' : 'aus'); return; }
      if (zeile === 'dino') { if (dx) this.wertSetzen(zeile, DINO[klemme(DINO.indexOf(einst().dino) + (dx > 0 ? 1 : -1), 0, 2)]); return; }
      return zeilenWert.apply(this, arguments);
    };
    const wertSetzen = M.wertSetzen;
    M.wertSetzen = function (zeile, k) {
      if (zeile === 'regenbogen') { einst().spur = k === 'an'; sichern(); return; }
      if (zeile === 'dino') { if (DINO.includes(k)) { einst().dino = k; sichern(); } return; }
      return wertSetzen.apply(this, arguments);
    };
    const htmlStart = M.htmlStart;
    M.htmlStart = function () {
      let h = htmlStart.apply(this, arguments);
      try {
        stil();
        const z = this.zeilen(), gf = z[this.fokus], E = einst();
        const pille = (zeile, k, text, an) => `<span class="pille${an ? ' aktiv' : ''}" data-a="wert:${zeile}:${k}">${text}</span>`;
        const kopf = (zeile, label, titel) => `<span class="gr${gf === zeile ? ' fokus' : ''}" title="${titel}"><span class="z-label" data-a="fokus:${z.indexOf(zeile)}">${label}</span>`;
        const teil = kopf('regenbogen', '🌈 Regenbogenspur', 'Hinter deinem Fahrzeug bleibt ein verblassender Regenbogen – Aus: wie früher') +
          pille('regenbogen', 'aus', 'Aus', !E.spur) + pille('regenbogen', 'an', 'An', E.spur) + '</span>' +
          kopf('dino', '🦖 Dino-Begleiter', 'Ein freundlicher Dino rennt neben der Strecke mit – Dino-Land: nur auf der Dino-Strecke') +
          pille('dino', 'aus', 'Aus', E.dino === 'aus') + pille('dino', 'dino', 'Dino-Land', E.dino === 'dino') + pille('dino', 'immer', 'Überall', E.dino === 'immer') + '</span>';
        h = h.replace('<span class="knopf klein" data-a="album"', teil + '<span class="knopf klein" data-a="album"');
      } catch (err) { console.error('Welten UI (Menü):', err); }
      return h;
    };
  }

  R.SpassWeltenUI = { einst, dinoBruellen, spurNeu, toreBauen };
})();
