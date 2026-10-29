// ============================================================
// S5 „Neue Welten“ – Grafik der drei Welten (nur Browser; Rechenteil/Physik steckt in spass/spassWelten.js):
//   🌙 Mond        Sterne (Punkte), Erde am Himmel (Kugel mit Canvas-Textur, Ultra mit Schein), Mondstaub (Punktwolke, Hüpfer-Landung + Fahrtstaub)
//   🐋 Ozean       Glastunnel (durchsichtig + Rippen), Fische/Wale/Rochen (je 1 InstancedMesh, Bewegung auf der CPU), Lichtstrahlen, Blasen
//   🌈 Regenbogen  Fahrbahn aus 7 Farbbändern (1 Mesh über der Straße)
// Alles in EINER Gruppe spiel.welt3D (je Strecke neu gebaut, bei Grafik-Wechsel nachgezogen); Normal sparsam, Schön/Ultra mehr.
// Eigener Zufall (Seed aus der Strecken-ID), Math.random bleibt unberührt.
// ============================================================
(function () {
  const R = window.Rennspiel;
  if (!R || !R.Spiel || !R.themes || !R.themes.hilfe) return;
  const P = R.Spiel.prototype, H = R.themes.hilfe;
  const stufe = () => (R.Grafik && R.Grafik.stufe) || 'normal';
  const je = (a, b, c) => (stufe() === 'ultra' ? c : stufe() === 'schoen' ? b : a);
  const jetzt = () => performance.now() / 1000;

  function loesen(g) {
    if (!g) return;
    if (g.parent) g.parent.remove(g);
    g.traverse((c) => {
      if (c.geometry) c.geometry.dispose();
      if (c.material) { const m = Array.isArray(c.material) ? c.material : [c.material]; m.forEach((x) => { if (x.map) x.map.dispose(); x.dispose(); }); }
    });
  }

  /** Weicher runder Punkt (statt Quadrat) für Staub und Blasen. */
  function kreisTextur(ring) {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 2, 32, 32, 31);
    if (ring) { gr.addColorStop(0, 'rgba(255,255,255,0.12)'); gr.addColorStop(0.72, 'rgba(255,255,255,0.35)'); gr.addColorStop(0.85, 'rgba(255,255,255,0.95)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); }
    else { gr.addColorStop(0, 'rgba(255,255,255,0.9)'); gr.addColorStop(0.5, 'rgba(255,255,255,0.4)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); }
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(c);
  }

  // ------------------------------------------------------------------ Mond
  function erdeTextur(rnd, groesse) {
    const c = document.createElement('canvas'); c.width = groesse * 2; c.height = groesse;
    const g = c.getContext('2d'), W = c.width, Hh = c.height;
    g.fillStyle = '#1f5fc4'; g.fillRect(0, 0, W, Hh);
    for (let i = 0; i < 26; i++) {           // Kontinente: Gruppen grüner/brauner Flecken
      const x = rnd() * W, y = Hh * (0.15 + rnd() * 0.7), n = 5 + Math.floor(rnd() * 7);
      for (let k = 0; k < n; k++) {
        g.fillStyle = rnd() < 0.7 ? '#4f9a46' : '#b59a5a';
        g.beginPath(); g.ellipse(x + (rnd() - 0.5) * W * 0.07, y + (rnd() - 0.5) * Hh * 0.12, W * (0.012 + rnd() * 0.03), Hh * (0.02 + rnd() * 0.05), rnd() * 3, 0, 6.3); g.fill();
      }
    }
    g.fillStyle = '#f2f6fa'; g.fillRect(0, 0, W, Hh * 0.08); g.fillRect(0, Hh * 0.93, W, Hh * 0.07);   // Polkappen
    g.globalAlpha = 0.55;
    for (let i = 0; i < 40; i++) {           // Wolken
      g.fillStyle = '#ffffff'; g.beginPath(); g.ellipse(rnd() * W, rnd() * Hh, W * (0.02 + rnd() * 0.07), Hh * (0.012 + rnd() * 0.025), (rnd() - 0.5) * 0.5, 0, 6.3); g.fill();
    }
    g.globalAlpha = 1;
    const t = new THREE.CanvasTexture(c); return t;
  }
  function scheinTextur() {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const g = c.getContext('2d'), gr = g.createRadialGradient(64, 64, 30, 64, 64, 64);
    gr.addColorStop(0, 'rgba(120,180,255,0.55)'); gr.addColorStop(0.5, 'rgba(90,150,255,0.18)'); gr.addColorStop(1, 'rgba(60,120,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
    return new THREE.CanvasTexture(c);
  }

  function mondBauen(w, st, rnd) {
    const kuppel = new THREE.Group(); kuppel.name = 'MondKuppel';
    // Sterne
    const n = je(500, 900, 1600), pos = new Float32Array(n * 3), col = new Float32Array(n * 3), c = new THREE.Color();
    for (let i = 0; i < n; i++) {
      const u = rnd() * 2 - 0.15, ph = rnd() * 6.2832, r = Math.sqrt(Math.max(0, 1 - u * u));
      pos[3 * i] = Math.cos(ph) * r * 700; pos[3 * i + 1] = u * 700; pos[3 * i + 2] = Math.sin(ph) * r * 700;
      c.setHSL(rnd() < 0.5 ? 0.6 : 0.12, 0.35 * rnd(), 0.62 + rnd() * 0.38); col[3 * i] = c.r; col[3 * i + 1] = c.g; col[3 * i + 2] = c.b;
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(pos, 3)); sg.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const sterne = new THREE.Points(sg, new THREE.PointsMaterial({ size: 2, sizeAttenuation: false, vertexColors: true, fog: false, depthWrite: false }));
    sterne.frustumCulled = false; sterne.renderOrder = -3; sterne.name = 'MondSterne';
    kuppel.add(sterne);
    // Erde
    const dir = new THREE.Vector3(0.55, 0.36, -0.75).normalize();
    const erde = new THREE.Mesh(new THREE.SphereGeometry(60, je(20, 28, 40), je(14, 20, 28)),
      new THREE.MeshBasicMaterial({ map: erdeTextur(rnd, je(128, 256, 512)), fog: false, depthWrite: false }));
    erde.position.copy(dir).multiplyScalar(620); erde.rotation.set(0.35, 1.2, 0.4); erde.renderOrder = -2; erde.name = 'MondErde';
    erde.frustumCulled = false;
    kuppel.add(erde);
    if (stufe() === 'ultra') {
      const sch = new THREE.Sprite(new THREE.SpriteMaterial({ map: scheinTextur(), blending: THREE.AdditiveBlending, fog: false, depthWrite: false, transparent: true }));
      sch.scale.set(210, 210, 1); sch.position.copy(erde.position); sch.renderOrder = -2.5; sch.name = 'MondErdeSchein';
      kuppel.add(sch);
    }
    w.add(kuppel);
    st.kuppel = kuppel;
    // Mondstaub (graue Punktwolke, flache Schwerkraft: schwebt lange)
    const N = je(90, 220, 420), pp = new Float32Array(N * 3), v = new Float32Array(N * 3), le = new Float32Array(N);
    const dg = new THREE.BufferGeometry(); dg.setAttribute('position', new THREE.BufferAttribute(pp, 3));
    for (let i = 0; i < N; i++) pp[3 * i + 1] = -1000;
    const staub = new THREE.Points(dg, new THREE.PointsMaterial({ size: 1.6, color: 0xc4c4cf, map: kreisTextur(false), transparent: true, opacity: 0.4, depthWrite: false, sizeAttenuation: true }));
    staub.frustumCulled = false; staub.name = 'Mondstaub'; staub.visible = false;
    w.add(staub);
    let nxt = 0, lebend = 0;
    const staubStoss = (x, y, z, k, tempo) => {
      for (let j = 0; j < k; j++) {
        const i = nxt; nxt = (nxt + 1) % N; const a = Math.random() * 6.2832, u = Math.random();
        pp[3 * i] = x + Math.cos(a) * u * 1.4; pp[3 * i + 1] = y + 0.2; pp[3 * i + 2] = z + Math.sin(a) * u * 1.4;
        v[3 * i] = Math.cos(a) * (1 + u * 5) * (tempo || 1); v[3 * i + 1] = 0.6 + Math.random() * 2.4; v[3 * i + 2] = Math.sin(a) * (1 + u * 5) * (tempo || 1);
        if (le[i] <= 0) lebend++; le[i] = 2.2 + Math.random() * 1.8;
      }
      staub.visible = true;
    };
    st.staub = staubStoss;
    st.update.push((dt, sp) => {
      const f0 = sp.fahrzeuge && sp.fahrzeuge[0], vh = f0 && f0.vehicle;
      if (vh) {
        kuppel.position.set(vh.x, vh.y, vh.z);
        // Fahrtstaub: bei Tempo am Boden ein paar Teilchen hinter dem Fahrzeug (nur eigenes Fahrzeug)
        const tempo = Math.abs(vh.vLaengs || 0);
        if (!vh.imFlug && tempo > 10 && sp.zustand === 'rennen') {
          st.rest = (st.rest || 0) + dt * Math.min(30, tempo * 0.6);
          while (st.rest >= 1) { st.rest -= 1; staubStoss(vh.x - Math.sin(vh.heading) * 2.2, vh.y, vh.z - Math.cos(vh.heading) * 2.2, 1, 0.5); }
        }
      }
      if (!lebend) return;
      for (let i = 0; i < N; i++) {
        if (le[i] <= 0) continue;
        le[i] -= dt;
        if (le[i] <= 0) { pp[3 * i + 1] = -1000; lebend--; continue; }
        v[3 * i + 1] -= 1.2 * dt; v[3 * i] *= 0.985; v[3 * i + 2] *= 0.985;
        pp[3 * i] += v[3 * i] * dt; pp[3 * i + 1] += v[3 * i + 1] * dt; pp[3 * i + 2] += v[3 * i + 2] * dt;
      }
      dg.attributes.position.needsUpdate = true;
      if (!lebend) staub.visible = false;
    });
  }

  // ------------------------------------------------------------------ Ozean
  const dummy = new THREE.Object3D();
  const kegelX = (r, l, x) => { const g = new THREE.ConeGeometry(r, l, 4); g.rotateZ(Math.PI / 2); g.translate(x, 0, 0); return g; };   // Spitze zeigt nach −x
  function fischGeo() {
    const k = new THREE.SphereGeometry(1, 8, 6); k.scale(0.55, 0.24, 0.17);
    const flosse = new THREE.ConeGeometry(0.2, 0.3, 3); flosse.translate(0.05, 0.3, 0);
    return H.vereinen([{ geo: k, farbe: 0xffffff }, { geo: kegelX(0.22, 0.5, -0.78), farbe: 0xffffff }, { geo: flosse, farbe: 0xdddddd }]);
  }
  function walGeo() {
    const k = new THREE.SphereGeometry(1, 14, 10); k.scale(7.5, 2.7, 2.9);
    const bauch = new THREE.SphereGeometry(1, 12, 8); bauch.scale(7.2, 1.6, 2.5); bauch.translate(0.4, -1.0, 0);
    const stiel = new THREE.SphereGeometry(1, 10, 8); stiel.scale(3.6, 1.2, 1.1); stiel.translate(-8, 0.3, 0);
    const flu = new THREE.BoxGeometry(2.2, 0.3, 7); flu.translate(-11.7, 0.5, 0);
    const fl1 = new THREE.BoxGeometry(2.4, 0.25, 1.1); fl1.rotateX(0.5); fl1.translate(2, -1.7, 2.7);
    const fl2 = new THREE.BoxGeometry(2.4, 0.25, 1.1); fl2.rotateX(-0.5); fl2.translate(2, -1.7, -2.7);
    return H.vereinen([{ geo: k, farbe: 0x44729e }, { geo: bauch, farbe: 0xd7e7f2 }, { geo: stiel, farbe: 0x44729e }, { geo: flu, farbe: 0x3a6590 }, { geo: fl1, farbe: 0x3a6590 }, { geo: fl2, farbe: 0x3a6590 }]);
  }
  function rochenGeo() {
    const k = new THREE.SphereGeometry(1, 10, 6); k.scale(1.5, 0.16, 1.2);
    const fluegel = new THREE.BoxGeometry(2.4, 0.1, 3.4); fluegel.translate(0.1, 0, 0);
    const schwanz = new THREE.CylinderGeometry(0.06, 0.12, 3.6, 4); schwanz.rotateZ(Math.PI / 2); schwanz.translate(-3.2, 0, 0);
    const auge = new THREE.SphereGeometry(0.16, 5, 4); auge.translate(1.1, 0.14, 0.4);
    const auge2 = auge.clone(); auge2.translate(0, 0, -0.8);
    return H.vereinen([{ geo: k, farbe: 0x8097b0 }, { geo: fluegel, farbe: 0x7b92ad }, { geo: schwanz, farbe: 0x66798f }, { geo: auge, farbe: 0x1d2530 }, { geo: auge2, farbe: 0x1d2530 }]);
  }

  /** Tiere: Liste { kx,ky,kz, r, w, ph, ox,oy,oz, g, art } je Art ein InstancedMesh; Bewegung auf Kreisbahnen (CPU, billig). */
  function tiereBauen(w, st, strecke, rnd) {
    const sp = strecke.spline, L = sp.laenge;
    const anz = { fisch: je(30, 64, 120), wal: je(2, 3, 4), rochen: je(4, 6, 9) };
    const arten = [
      { art: 'fisch', geo: fischGeo(), n: anz.fisch, g: [1.5, 3.0], hoch: [2, 12], r: [10, 30], w: [0.25, 0.5], farben: [0xffa94d, 0xff6f91, 0xffe14a, 0x6fd0ff, 0xb06bff, 0x7ee0b4] },
      { art: 'wal', geo: walGeo(), n: anz.wal, g: [0.9, 1.2], hoch: [16, 30], r: [60, 110], w: [0.05, 0.08], farben: [0xffffff, 0xe8f0ff] },
      { art: 'rochen', geo: rochenGeo(), n: anz.rochen, g: [1.4, 2.2], hoch: [4, 12], r: [22, 50], w: [0.1, 0.2], farben: [0xffffff, 0xd8e4f0] },
    ];
    const liste = [];
    arten.forEach((a) => {
      const m = new THREE.InstancedMesh(a.geo, H.vertexMaterial(false), Math.max(1, a.n));
      m.frustumCulled = false; m.name = 'Ozean_' + a.art;
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      const eintraege = [];
      const schwarm = a.art === 'fisch' ? 8 : 1;
      for (let i = 0; i < a.n; i += schwarm) {
        const s = rnd() * L, p = sp.punktBei(s), seite = rnd() < 0.5 ? -1 : 1, d = (a.art === 'fisch' ? 18 + rnd() * 50 : 30 + rnd() * 90);
        const kx = p.x + p.nx * d * seite, kz = p.z + p.nz * d * seite, gy = strecke.bodenHoehe(kx, kz);
        const base = { kx, kz, ky: gy + a.hoch[0] + rnd() * (a.hoch[1] - a.hoch[0]), r: a.r[0] + rnd() * (a.r[1] - a.r[0]), w: (a.w[0] + rnd() * (a.w[1] - a.w[0])) * (rnd() < 0.5 ? -1 : 1), ph: rnd() * 6.2832 };
        const c = new THREE.Color(a.farben[Math.floor(rnd() * a.farben.length)]);
        for (let k = 0; k < schwarm && i + k < a.n; k++) {
          eintraege.push(Object.assign({}, base, { ox: (rnd() - 0.5) * 7, oy: (rnd() - 0.5) * 3.5, oz: (rnd() - 0.5) * 7, g: a.g[0] + rnd() * (a.g[1] - a.g[0]), ph2: rnd() * 6.2832, c: c }));
        }
      }
      eintraege.forEach((e, i) => m.setColorAt(i, e.c));
      m.count = eintraege.length;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
      w.add(m);
      liste.push({ m, e: eintraege, art: a.art });
    });
    st.update.push((dt, sp2) => {
      const t = jetzt();
      for (const l of liste) {
        const e = l.e;
        for (let i = 0; i < e.length; i++) {
          const q = e[i], a = q.ph + q.w * t, c = Math.cos(a), s = Math.sin(a);
          const x = q.kx + c * q.r + q.ox, z = q.kz + s * q.r + q.oz;
          const y = q.ky + q.oy + (l.art === 'wal' ? Math.sin(t * 0.35 + q.ph) * 3 : Math.sin(t * 0.8 + q.ph2) * 0.8);
          const vx = -s * q.r * q.w, vz = c * q.r * q.w, hd = Math.atan2(vz, vx);
          dummy.position.set(x, y, z);
          dummy.rotation.order = 'YZX';
          const schlag = Math.sin(t * (l.art === 'fisch' ? 9 : l.art === 'wal' ? 1.1 : 2.4) + q.ph2);
          if (l.art === 'fisch') dummy.rotation.set(0, -hd + schlag * 0.18, schlag * 0.05);
          else if (l.art === 'wal') dummy.rotation.set(0, -hd, schlag * 0.07);
          else dummy.rotation.set(schlag * 0.22, -hd, 0);
          dummy.scale.setScalar(q.g);
          dummy.updateMatrix();
          l.m.setMatrixAt(i, dummy.matrix);
        }
        l.m.instanceMatrix.needsUpdate = true;
      }
    });
  }

  /** Glastunnel über den Abschnitten katalog.glasTunnel: Halbrohr (durchsichtig) + Rippen. */
  function glasBauen(w, strecke) {
    const abs = strecke.katalog && strecke.katalog.glasTunnel; if (!abs || !abs.length) return;
    const sp = strecke.spline, RAD = 11.5, NW = 14, DS = 6;
    const pos = [], idx = [], rpos = [], ridx = [], rcol = [];
    const ring = (s, r, h0) => {
      const p = sp.punktBei(s), y0 = strecke.hoeheAn(p.x, p.z) + (h0 || 0);
      const out = [];
      for (let k = 0; k <= NW; k++) { const t = Math.PI * k / NW; out.push([p.x + p.nx * Math.cos(t) * r, y0 + Math.sin(t) * r, p.z + p.nz * Math.cos(t) * r]); }
      return out;
    };
    abs.forEach((e) => {
      const n = Math.max(2, Math.round((e.s1 - e.s0) / DS)), basis = pos.length / 3;
      for (let i = 0; i <= n; i++) { ring(e.s0 + (e.s1 - e.s0) * i / n, RAD).forEach((q) => pos.push(q[0], q[1], q[2])); }
      for (let i = 0; i < n; i++) for (let k = 0; k < NW; k++) {
        const a = basis + i * (NW + 1) + k, b = a + 1, c = a + NW + 1, d = c + 1;
        idx.push(a, b, c, b, d, c);
      }
      // Rippen alle 18 m: schmaler Bogen (außen etwas größer), plus Endringe dicker
      const rippen = Math.max(2, Math.round((e.s1 - e.s0) / 18));
      for (let i = 0; i <= rippen; i++) {
        const s = e.s0 + (e.s1 - e.s0) * i / rippen, dick = (i === 0 || i === rippen) ? 1.1 : 0.45;
        const innen = ring(s, RAD - 0.05), aussen = ring(s, RAD + dick * 0.35), p = sp.punktBei(s), tx = p.tx * dick, tz = p.tz * dick;
        const b0 = rpos.length / 3;
        for (let k = 0; k <= NW; k++) {
          const a = innen[k], o = aussen[k];
          rpos.push(a[0] - tx / 2, a[1], a[2] - tz / 2, a[0] + tx / 2, a[1], a[2] + tz / 2, o[0] - tx / 2, o[1], o[2] - tz / 2, o[0] + tx / 2, o[1], o[2] + tz / 2);
          for (let j = 0; j < 4; j++) rcol.push(0.78, 0.9, 0.95);
        }
        for (let k = 0; k < NW; k++) {
          const a = b0 + k * 4, b = a + 4;
          // vier Flächen des Balkens (innen, außen, vorn, hinten)
          [[0, 1], [2, 3], [0, 2], [1, 3]].forEach(([p0, q0]) => ridx.push(a + p0, a + q0, b + p0, a + q0, b + q0, b + p0));
        }
      }
    });
    const gg = new THREE.BufferGeometry();
    gg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); gg.setIndex(idx); gg.computeVertexNormals();
    const glas = new THREE.Mesh(gg, new THREE.MeshPhongMaterial({ color: 0x9fe8ff, transparent: true, opacity: 0.3, side: THREE.DoubleSide, depthWrite: false, shininess: 90, specular: 0xffffff }));
    glas.name = 'Glastunnel'; glas.renderOrder = 3; glas.frustumCulled = false; w.add(glas);
    const rg = new THREE.BufferGeometry();
    rg.setAttribute('position', new THREE.Float32BufferAttribute(rpos, 3)); rg.setAttribute('color', new THREE.Float32BufferAttribute(rcol, 3)); rg.setIndex(ridx); rg.computeVertexNormals();
    const rippe = new THREE.Mesh(rg, new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide, emissive: 0x2a5a66 }));
    rippe.name = 'GlastunnelRippen'; rippe.frustumCulled = false; w.add(rippe);
  }

  function strahlenBauen(w, strecke, rnd) {
    const sp = strecke.spline, n = je(6, 10, 16), pos = [], col = [], idx = [];
    for (let i = 0; i < n; i++) {
      const s = sp.laenge * (i + rnd() * 0.8) / n, p = sp.punktBei(s), y0 = strecke.hoeheAn(p.x, p.z), seite = rnd() < 0.5 ? -1 : 1, d = 6 + rnd() * 26;
      const cx = p.x + p.nx * d * seite, cz = p.z + p.nz * d * seite, br = 5 + rnd() * 5, hoch = 60;
      const sx = 0.35 + rnd() * 0.25, sz = (rnd() - 0.5) * 0.4, b = pos.length / 3;
      const w0 = [Math.cos(rnd() * 3.14), Math.sin(rnd() * 3.14)];
      const tx = w0[0], tz = w0[1];
      // Strahl: Fläche, oben breit und hell, unten schmal und dunkel (additiv → verläuft ins Nichts)
      pos.push(cx - tx * br, y0 + hoch, cz - tz * br, cx + tx * br, y0 + hoch, cz + tz * br, cx + tx * br * 0.4 + sx * hoch * 0.4, y0, cz + tz * br * 0.4 + sz * hoch * 0.4, cx - tx * br * 0.4 + sx * hoch * 0.4, y0, cz - tz * br * 0.4 + sz * hoch * 0.4);
      col.push(0.2, 0.4, 0.38, 0.2, 0.4, 0.38, 0, 0, 0, 0, 0, 0);
      idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.setIndex(idx);
    const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false }));
    m.name = 'Lichtstrahlen'; m.frustumCulled = false; m.renderOrder = 2; w.add(m);
    return m;
  }

  function blasenBauen(w, st, rnd) {
    const N = je(40, 100, 220), pp = new Float32Array(N * 3), tempo = new Float32Array(N);
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pp, 3));
    for (let i = 0; i < N; i++) { pp[3 * i + 1] = -1000; tempo[i] = 0.8 + rnd() * 1.6; }
    const m = new THREE.Points(g, new THREE.PointsMaterial({ size: 0.7, color: 0xe4fbff, map: kreisTextur(true), transparent: true, opacity: 0.85, depthWrite: false }));
    m.frustumCulled = false; m.name = 'Blasen'; w.add(m);
    let erst = true;
    st.update.push((dt, sp) => {
      const f0 = sp.fahrzeuge && sp.fahrzeuge[0], v = f0 && f0.vehicle; if (!v) return;
      for (let i = 0; i < N; i++) {
        let y = pp[3 * i + 1] + tempo[i] * dt, dx = pp[3 * i] - v.x, dz = pp[3 * i + 2] - v.z;
        if (erst || y > v.y + 18 || dx * dx + dz * dz > 2500) {
          pp[3 * i] = v.x + (Math.random() - 0.5) * 70; pp[3 * i + 2] = v.z + (Math.random() - 0.5) * 70; y = v.y - 2 + Math.random() * (erst ? 18 : 3);
        }
        pp[3 * i + 1] = y; pp[3 * i] += Math.sin(y * 1.3 + i) * 0.02;
      }
      erst = false;
      g.attributes.position.needsUpdate = true;
    });
  }

  // ------------------------------------------------------------------ Regenbogen-Fahrbahn
  const BAENDER = [0xff3b5c, 0xff9a2e, 0xffe14a, 0x44d97c, 0x3aa0ff, 0x6a5cff, 0xb25cff];
  function regenbogenFahrbahn(w, strecke) {
    const sp = strecke.spline, ds = 3, n = Math.ceil(sp.laenge / ds), b2 = strecke.breite / 2, nb = BAENDER.length;
    const pos = [], col = [], idx = [], c = new THREE.Color();
    for (let i = 0; i < n; i++) {
      const p = sp.punktBei(i * ds), basis = pos.length / 3;
      for (let k = 0; k < nb; k++) {
        c.setHex(BAENDER[k]);
        const q0 = -b2 + (2 * b2) * k / nb, q1 = -b2 + (2 * b2) * (k + 1) / nb;
        [q0, q1].forEach((q) => { const x = p.x + p.nx * q, z = p.z + p.nz * q; pos.push(x, strecke.hoeheAn(x, z) + 0.07, z); col.push(c.r, c.g, c.b); });
      }
    }
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      for (let k = 0; k < nb; k++) {
        const a = i * nb * 2 + k * 2, b = j * nb * 2 + k * 2;
        idx.push(a, a + 1, b, a + 1, b + 1, b);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.setIndex(idx);
    const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1, side: THREE.DoubleSide }));
    m.name = 'RegenbogenFahrbahn'; m.frustumCulled = false; w.add(m);
  }

  // ------------------------------------------------------------------ Aufbau je Strecke
  function weltBauen(sp) {
    loesen(sp.welt3D); sp.welt3D = null;
    const strecke = sp.strecke, kat = strecke && strecke.katalog;
    if (!strecke || !sp.szene || !kat) return;
    const thema = strecke.daten && strecke.daten.thema;
    if (thema !== 'mond' && thema !== 'ozean' && !kat.regenbogenFahrbahn) return;
    const w = new THREE.Group(); w.name = 'Welten3D';
    const st = { update: [], thema };
    const rnd = H.zufall(H.textSeed('welten3d' + strecke.id));
    try {
      if (thema === 'mond') mondBauen(w, st, rnd);
      if (thema === 'ozean') { glasBauen(w, strecke); strahlenBauen(w, strecke, rnd); tiereBauen(w, st, strecke, rnd); blasenBauen(w, st, rnd); }
      if (kat.regenbogenFahrbahn) regenbogenFahrbahn(w, strecke);
    } catch (e) { console.error('Welten (Szene):', e); }
    sp.szene.add(w);
    w.userData.st = st;
    sp.welt3D = w;
    sp.welt3DStufe = stufe();
  }

  const streckeSzeneBauen = P.streckeSzeneBauen;
  P.streckeSzeneBauen = function () {
    const r = streckeSzeneBauen.apply(this, arguments);
    try { weltBauen(this); } catch (e) { console.error('Welten:', e); }
    return r;
  };

  // Grafik-Stufe gewechselt → Welt mit anderer Dichte neu bauen
  if (R.Grafik && R.Grafik.setzen && !R.Grafik.setzen.istWelten) {
    const setzen = R.Grafik.setzen;
    R.Grafik.setzen = function () {
      const r = setzen.apply(this, arguments);
      const sp = R.spiel;
      try { if (sp && sp.welt3D && sp.welt3DStufe !== stufe()) weltBauen(sp); } catch (e) { console.error('Welten (Stufe):', e); }
      return r;
    };
    R.Grafik.setzen.istWelten = true;
  }

  // Mondstaub-Stoß von außen (Hüpfer-Landung): spiel.weltStaub(x, y, z, anzahl)
  P.weltStaub = function (x, y, z, n) {
    const st = this.welt3D && this.welt3D.userData.st;
    if (st && st.staub) st.staub(x, y, z, n || 20, 1);
  };

  // Bild: Bewegung der Tiere, Blasen, Staub, Himmelskuppel
  if (R.dach && typeof R.dach.frame === 'function') {
    const frame = R.dach.frame;
    R.dach.frame = function (spiel, dt) {
      const r = frame.apply(this, arguments);
      try {
        const st = spiel.welt3D && spiel.welt3D.userData.st;
        if (st) { const d = spiel.pausiert ? 0 : Math.min(dt || 0.016, 0.05); for (let i = 0; i < st.update.length; i++) st.update[i](d, spiel); }
      } catch (e) { if (!R._weltenFehler) { R._weltenFehler = 1; console.error('Welten (Bild):', e); } }
      return r;
    };
  }

  R.Welten3D = { weltBauen };
})();
