// ============================================================
// Spaß-Paket S1 – Grafik: Trampolin (bunte Matte mit Rand und Luftballons), Kanone (gestreifte Röhre mit Mündungsring, Einfahrt-Streifen) und Konfetti.
//   R.SpassWelt.bauen(strecke)   → THREE.Group (je 1 Mesh, alles statisch; leer ohne strecke.spass)
//   R.SpassWelt.konfetti(szene)  → { burst(x, y, z, n), update(dt) } (1 Draw-Call, höchstens 240 Teilchen)
// Die Lage kommt aus strecke.spass.liste (spassKern.js); die Physik kennt nur die Linien, die Optik passt dazu (Röhre um die Mittellinie, Mündung bei sMund).
// ============================================================
(function () {
  const R = window.Rennspiel;
  if (!R) return;
  const C = () => R.config.spass;

  function geometrie(vierecke, dreiecke) {
    const n = vierecke.length * 6 + dreiecke.length * 3;
    const pos = new Float32Array(n * 3), col = new Float32Array(n * 3), c = new THREE.Color();
    let o = 0;
    const ecke = (e) => { pos[o] = e[0]; pos[o + 1] = e[1]; pos[o + 2] = e[2]; col[o] = c.r; col[o + 1] = c.g; col[o + 2] = c.b; o += 3; };
    for (const v of vierecke) { c.set(v.farbe); [v.a, v.b, v.c, v.a, v.c, v.d].forEach(ecke); }
    for (const d of dreiecke) { c.set(d.farbe); [d.a, d.b, d.c].forEach(ecke); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.computeVertexNormals();
    return g;
  }

  /** Kleine Kugel (einmal unterteiltes Oktaeder: 32 Dreiecke) an Mitte m, Radius r. */
  function kugel(dreiecke, m, r, farbe) {
    const v = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
    const mitte = (a, b) => { const x = a[0] + b[0], y = a[1] + b[1], z = a[2] + b[2], l = Math.hypot(x, y, z); return [x / l, y / l, z / l]; };
    const tri = [[0, 2, 4], [2, 1, 4], [1, 3, 4], [3, 0, 4], [2, 0, 5], [1, 2, 5], [3, 1, 5], [0, 3, 5]];
    const P = (p) => [m[0] + p[0] * r, m[1] + p[1] * r, m[2] + p[2] * r];
    tri.forEach(([i, j, k]) => {
      const a = v[i], b = v[j], c = v[k], ab = mitte(a, b), bc = mitte(b, c), ca = mitte(c, a);
      [[a, ab, ca], [ab, b, bc], [ca, bc, c], [ab, bc, ca]].forEach(([p, q, s]) => dreiecke.push({ a: P(p), b: P(q), c: P(s), farbe }));
    });
  }

  const BUNT = [0xff3b6b, 0xffc21a, 0x2ed3c6, 0x7ed321, 0x7a5cff, 0xff8a1a];

  function trampolin(st, e, V, D) {
    const sp = st.spline, hb = e.halb, L = e.laenge;
    const P = (a, q, h) => { const p = sp.punktBei(e.s0 + a), x = p.x + p.nx * q, z = p.z + p.nz * q; return [x, st.hoeheAn(x, z) + h, z]; };
    const NA = 8, NQ = 6, TOP = 0.5, RAND = 0.55;
    // Matte (Schachbrett rosa/türkis/gelb), leicht nach innen gewölbt wirkt durch die Farben; Rand rot-weiß
    for (let i = 0; i < NA; i++) for (let k = 0; k < NQ; k++) {
      const a0 = RAND + (L - 2 * RAND) * i / NA, a1 = RAND + (L - 2 * RAND) * (i + 1) / NA;
      const q0 = -hb + RAND + (2 * hb - 2 * RAND) * k / NQ, q1 = -hb + RAND + (2 * hb - 2 * RAND) * (k + 1) / NQ;
      V.push({ a: P(a0, q0, TOP), b: P(a0, q1, TOP), c: P(a1, q1, TOP), d: P(a1, q0, TOP), farbe: BUNT[(i + k) % 2 ? 0 : 2] });
    }
    // Stern in der Mitte (gelbes Kreuz aus zwei Streifen)
    V.push({ a: P(L / 2 - 0.35, -hb * 0.6, TOP + 0.02), b: P(L / 2 - 0.35, hb * 0.6, TOP + 0.02), c: P(L / 2 + 0.35, hb * 0.6, TOP + 0.02), d: P(L / 2 + 0.35, -hb * 0.6, TOP + 0.02), farbe: 0xffe14a });
    V.push({ a: P(L * 0.2, -0.35, TOP + 0.02), b: P(L * 0.2, 0.35, TOP + 0.02), c: P(L * 0.8, 0.35, TOP + 0.02), d: P(L * 0.8, -0.35, TOP + 0.02), farbe: 0xffe14a });
    // Rand (Rahmen) und Seitenwände
    const rand = (a0, a1, q0, q1, farbe) => V.push({ a: P(a0, q0, TOP + 0.08), b: P(a0, q1, TOP + 0.08), c: P(a1, q1, TOP + 0.08), d: P(a1, q0, TOP + 0.08), farbe });
    for (let i = 0; i < 8; i++) {
      const a0 = L * i / 8, a1 = L * (i + 1) / 8, f = i % 2 ? 0xe0262b : 0xffffff;
      rand(a0, a1, -hb, -hb + RAND, f); rand(a0, a1, hb - RAND, hb, f);
    }
    for (let k = 0; k < 6; k++) {
      const q0 = -hb + 2 * hb * k / 6, q1 = -hb + 2 * hb * (k + 1) / 6, f = k % 2 ? 0xe0262b : 0xffffff;
      rand(0, RAND, q0, q1, f); rand(L - RAND, L, q0, q1, f);
    }
    const wand = (a0, a1, q0, q1, innen) => {
      const b0 = P(a0, q0, 0), b1 = P(a1, q1, 0), t0 = P(a0, q0, TOP + 0.08), t1 = P(a1, q1, TOP + 0.08);
      V.push(innen ? { a: b1, b: b0, c: t0, d: t1, farbe: 0x2a3fb5 } : { a: b0, b: b1, c: t1, d: t0, farbe: 0x2a3fb5 });
    };
    wand(0, L, -hb, -hb); wand(0, L, hb, hb); wand(0, 0, -hb, hb); wand(L, L, -hb, hb);
    // Luftballons an den vier Ecken (Stange + Kugel)
    [[0.2, -hb - 0.3], [0.2, hb + 0.3], [L - 0.2, -hb - 0.3], [L - 0.2, hb + 0.3]].forEach(([a, q], i) => {
      const f = P(a, q, 0), top = P(a, q, 3.2), d = 0.06;
      const ecken = [[d, d], [d, -d], [-d, -d], [-d, d]];
      for (let k = 0; k < 4; k++) {
        const u = ecken[k], w = ecken[(k + 1) % 4];
        V.push({ a: [f[0] + u[0], f[1], f[2] + u[1]], b: [f[0] + w[0], f[1], f[2] + w[1]], c: [top[0] + w[0], top[1], top[2] + w[1]], d: [top[0] + u[0], top[1], top[2] + u[1]], farbe: 0xffffff });
      }
      kugel(D, [top[0], top[1] + 0.55, top[2]], 0.6, BUNT[(i * 2 + e.nr) % BUNT.length]);
    });
  }

  function kanone(st, e, V, D) {
    const sp = st.spline, L = e.laenge, r = 3.35;
    const P = (a, q, h) => { const p = sp.punktBei(e.s0 + a), x = p.x + p.nx * q, z = p.z + p.nz * q; return [x, st.hoeheAn(x, z) + h, z]; };
    const NA = 9, NW = 14;
    // Röhre: Halbkreis-Bogen (Winkel 0..π) um die Mittellinie, Streifen rot/gelb als Schachbrett
    const bogen = (a, w, rr) => { const t = Math.PI * w / NW; return P(a, Math.cos(t) * rr, Math.sin(t) * rr); };
    for (let i = 0; i < NA; i++) for (let k = 0; k < NW; k++) {
      const a0 = L * i / NA, a1 = L * (i + 1) / NA, f = (i + k) % 2 ? 0xe0262b : 0xffc21a;
      V.push({ a: bogen(a0, k, r), b: bogen(a0, k + 1, r), c: bogen(a1, k + 1, r), d: bogen(a1, k, r), farbe: f });
    }
    // Mündungsring (dunkel, dicker) vorn und Einfahrt-Ring (blau) hinten
    const ring = (a0, a1, rr, f) => { for (let k = 0; k < NW; k++) V.push({ a: bogen(a0, k, rr), b: bogen(a0, k + 1, rr), c: bogen(a1, k + 1, rr), d: bogen(a1, k, rr), farbe: k % 2 && f === 0x2b2f3a ? 0x555b6b : f }); };
    ring(L - 1.0, L, r + 0.4, 0x2b2f3a); ring(0, 0.8, r + 0.35, 0x2a6bff);
    // Stirnflächen der Ringe (Ränder) – sonst sieht man in den Ring hinein
    [[L - 1.0, r + 0.4, 0x2b2f3a], [L, r + 0.4, 0x2b2f3a], [0, r + 0.35, 0x2a6bff], [0.8, r + 0.35, 0x2a6bff]].forEach(([a, rr, f], j) => {
      for (let k = 0; k < NW; k++) V.push({ a: bogen(a, k, rr), b: bogen(a, k + 1, rr), c: bogen(a, k + 1, r - 0.05), d: bogen(a, k, r - 0.05), farbe: f });
      void j;
    });
    // Beine (Standfüße) an beiden Seiten
    [-1, 1].forEach((sg) => [1.5, L - 2].forEach((a) => {
      V.push({ a: P(a, sg * (r + 0.1), 0), b: P(a + 1.2, sg * (r + 0.1), 0), c: P(a + 1.2, sg * (r + 0.1), 1.2), d: P(a, sg * (r + 0.1), 1.2), farbe: 0x2b2f3a });
    }));
    // Stern oben auf der Röhre (gelb) und Fähnchen
    kugel(D, P(L * 0.5, 0, r + 0.7), 0.6, 0xff3b6b);
    kugel(D, P(L * 0.5 + 1.1, 0, r + 0.5), 0.4, 0xffe14a);
    // Einfahrt: bunte Querstreifen auf der Fahrbahn (zeigen: hier hinein!), Breite wie die Auslösezone
    const hb = e.halb + 0.8;
    for (let i = 0; i < 7; i++) {
      const a0 = -14 + i * 2, a1 = a0 + 1.4, f = i % 2 ? 0xff8a1a : 0xffffff;
      V.push({ a: P(a0, -hb, 0.05), b: P(a0, hb, 0.05), c: P(a1, hb, 0.05), d: P(a1, -hb, 0.05), farbe: f });
    }
  }

  /** Alle Elemente der Strecke in einer Gruppe (zwei Meshes: Flächen, Kugeln – beide mit Vertex-Farben). */
  function bauen(st) {
    const g = new THREE.Group();
    g.name = 'SpassElemente';
    const sa = st && st.spass;
    if (!sa || !sa.liste.length) return g;
    const V = [], D = [];
    sa.liste.forEach((e) => (e.art === 'kanone' ? kanone(st, e, V, D) : trampolin(st, e, V, D)));
    const m = new THREE.Mesh(geometrie(V, D), new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
    m.name = 'SpassFlaechen';
    g.add(m);
    g.traverse((o) => { o.updateMatrix(); o.matrixAutoUpdate = false; });
    return g;
  }

  /** Konfetti: Punktwolke mit Schwerkraft; burst() startet n Teilchen (bunt), update(dt) bewegt sie, ohne lebende Teilchen unsichtbar. */
  function konfetti(szene) {
    const N = 240, pos = new Float32Array(N * 3), col = new Float32Array(N * 3), vel = new Float32Array(N * 3), leben = new Float32Array(N);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const pts = new THREE.Points(g, new THREE.PointsMaterial({ size: 0.45, vertexColors: true, depthWrite: false, sizeAttenuation: true }));
    pts.frustumCulled = false; pts.visible = false; pts.name = 'SpassKonfetti';
    if (szene) szene.add(pts);
    let nxt = 0, lebend = 0;
    const c = new THREE.Color();
    return {
      punkte: pts,
      burst(x, y, z, n) {
        for (let k = 0; k < (n || 80); k++) {
          const i = nxt; nxt = (nxt + 1) % N;
          const w = Math.random() * Math.PI * 2, u = Math.random(), h = 3 + Math.random() * 9;
          pos[3 * i] = x; pos[3 * i + 1] = y; pos[3 * i + 2] = z;
          vel[3 * i] = Math.cos(w) * u * 7; vel[3 * i + 1] = h; vel[3 * i + 2] = Math.sin(w) * u * 7;
          c.set(BUNT[(Math.random() * BUNT.length) | 0]); col[3 * i] = c.r; col[3 * i + 1] = c.g; col[3 * i + 2] = c.b;
          if (leben[i] <= 0) lebend++;
          leben[i] = 2.2 + Math.random() * 1.2;
        }
        pts.visible = true;
        g.attributes.position.needsUpdate = true; g.attributes.color.needsUpdate = true;
      },
      update(dt) {
        if (!lebend) return;
        for (let i = 0; i < N; i++) {
          if (leben[i] <= 0) continue;
          leben[i] -= dt;
          if (leben[i] <= 0) { pos[3 * i + 1] = -1000; lebend--; continue; }
          vel[3 * i + 1] -= 9 * dt; vel[3 * i] *= 0.99; vel[3 * i + 2] *= 0.99;
          pos[3 * i] += vel[3 * i] * dt; pos[3 * i + 1] += vel[3 * i + 1] * dt; pos[3 * i + 2] += vel[3 * i + 2] * dt;
        }
        g.attributes.position.needsUpdate = true;
        if (!lebend) pts.visible = false;
      },
      lebend: () => lebend,
    };
  }

  R.SpassWelt = { bauen, konfetti, geometrie };
  void C;
})();
