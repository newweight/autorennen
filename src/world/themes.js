// ============================================================
// Themen (Farben, Himmel, Nebel, Licht) und Deko neben der Strecke.
// Deko wird mit InstancedMesh gebaut (wenige Draw-Calls) und mit
// einem eigenen, festen Zufallsgenerator verteilt: gleiche Strecke =
// gleiche Bäume bei jedem Start.
//
// Mehrteilige Objekte (Tanne = Stamm + Kegel, Kaktus = Stamm + Arme, Pilz …)
// werden vorher zu EINER Geometrie mit Vertex-Farben vereint → 1 Draw-Call
// je Objektart. Regel: jede Deko-Instanz steht ≥ breite/2 + 6 m von der
// Straßenmitte (aller Streckenteile) entfernt; Bäume, Felsen und große
// Kakteen sogar hinter dem Zaun (sonst führe man durch sie hindurch).
//
// Runde 4: dekoBauen(thema, strecke, jahreszeit) färbt Bäume/Büsche je Jahreszeit
// (jahreszeitFarben/jahreszeitFaerben, eigener Zufall – Platzierung bleibt gleich).
// ============================================================
(function () {
  const R = window.Rennspiel;

  /** Kleiner deterministischer Zufallsgenerator (mulberry32). */
  function zufall(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /** Zahl aus einem Text (für den Seed je Strecke). */
  function textSeed(text) {
    let h = 2166136261;
    for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }

  const themes = {
    wiese: {
      name: 'Wiese',
      boden: 0x5f9e3a,
      himmel: 0x8fc8ff,
      nebel: 0x8fc8ff,
      sichtweite: 420,
      lichtHimmel: 0xdfefff,
      lichtBoden: 0x4a6b2a,      // Bodenfarbe des Halbkugel-Lichts
      sonnenFarbe: 0xfff3d6,
      sonnenIntensitaet: 1.1,
      seed: 7,
      deko: { baeume: 380, fernBaeume: 320, buesche: 200, heuballen: 16, kuehe: 3, blumen: 300 },
    },
    wald: {
      name: 'Wald',
      boden: 0x37622a,
      boden2: 0x4d4a26,          // Nadel-/Laubboden-Flecken
      himmel: 0xaac3c8,          // leicht dunstig
      nebel: 0xa3bcc0,
      sichtweite: 300,           // Nebel näher: man sieht nicht weit in den Wald
      lichtHimmel: 0xd8e8e0,
      lichtBoden: 0x2c3f1e,
      sonnenFarbe: 0xffe9c0,
      sonnenIntensitaet: 0.95,
      asphalt: 0x37393c,
      zaun: { latten: 0x5e3f22, pfosten: 0x3e2a17 },   // dunkler Holzzaun
      seed: 13,
      deko: { bandAbstand: 2.6, fernBaeume: 700, felsen: 140, stuempfe: 90, pilzGruppen: 45, farne: 380 },
    },
    wueste: {
      name: 'Wüste',
      boden: 0xd9b36a,
      boden2: 0xe6c588,          // hellere Sandflächen
      himmel: 0x9ccff2,          // helles Blau
      nebel: 0xf0d8a8,           // warmer Dunst am Horizont
      sichtweite: 560,
      lichtHimmel: 0xfff4e0,
      lichtBoden: 0xb8935a,
      sonnenFarbe: 0xfff0d0,
      sonnenIntensitaet: 1.25,
      asphalt: 0x4f4b47,
      zaun: { art: 'leitpfosten', pfosten: 0xf2efe6 },
      seed: 29,
      deko: { saguaros: 230, kugelkakteen: 160, felsen: 190, tafelberge: 12, gestruepp: 220, palmen: 9 },
    },
    fantasie: {
      name: 'Fantasie',
      boden: 0x9fe0a0,           // Pastell-Mint
      boden2: 0xf6bfe0,          // rosa Felder
      himmel: 0xc9a2f2,          // lila Himmel
      nebel: 0xe6c6f6,           // rosa-lila Dunst
      sichtweite: 520,
      lichtHimmel: 0xfff0ff,
      lichtBoden: 0xb08ad0,
      sonnenFarbe: 0xfff2fa,
      sonnenIntensitaet: 1.1,
      asphalt: 0x5d5470,         // lila-grauer Asphalt
      zaun: { latten: 0xff9ad5, pfosten: 0xffffff },
      regenbogen: [0xff4d6d, 0xff9f43, 0xffe14a, 0x4cd97b, 0x4da6ff, 0xa66bff],   // Randsteine + Looping
      loopingBand: 0x6a5a8e,
      seed: 41,
      deko: { pilze: 70, ballons: 70, zuckerbaeume: 200, fernBaeume: 220, huegel: 36, blumen: 300 },
    },
  };

  // ------------------------------------------------------------------ Helfer

  /**
   * Mehrere Geometrien (bereits verschoben/gedreht) zu EINER nicht indizierten
   * Geometrie mit Vertex-Farben vereinen.
   * @param {{geo: THREE.BufferGeometry, farbe: number}[]} teile
   */
  function vereinen(teile) {
    const flach = teile.map(t => ({ g: t.geo.index ? t.geo.toNonIndexed() : t.geo, farbe: t.farbe }));
    const anzahl = flach.reduce((s, t) => s + t.g.attributes.position.count, 0);
    const pos = new Float32Array(anzahl * 3), nor = new Float32Array(anzahl * 3), col = new Float32Array(anzahl * 3);
    const c = new THREE.Color();
    let o = 0;
    flach.forEach(({ g, farbe }) => {
      if (!g.attributes.normal) g.computeVertexNormals();
      const n = g.attributes.position.count;
      pos.set(g.attributes.position.array, o * 3);
      nor.set(g.attributes.normal.array, o * 3);
      c.set(farbe);
      for (let i = 0; i < n; i++) { col[(o + i) * 3] = c.r; col[(o + i) * 3 + 1] = c.g; col[(o + i) * 3 + 2] = c.b; }
      o += n;
    });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    teile.forEach(t => t.geo.dispose());
    return geo;
  }

  /** Lambert-Material mit Vertex-Farben (für vereinte Geometrien). */
  function vertexMaterial(flach) {
    return new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: !!flach });
  }

  /**
   * InstancedMesh aus einer Liste bauen. setzen(eintrag, dummy, farbe) stellt
   * Position/Drehung/Größe am dummy ein und darf die Instanzfarbe ändern (Standard weiß).
   */
  function instanzMesh(gruppe, name, geo, mat, liste, setzen) {
    const m = new THREE.InstancedMesh(geo, mat, Math.max(1, liste.length));
    const d = new THREE.Object3D(), farbe = new THREE.Color();
    liste.forEach((e, i) => {
      d.position.set(0, 0, 0); d.rotation.set(0, 0, 0); d.scale.set(1, 1, 1);
      farbe.setRGB(1, 1, 1);
      setzen(e, d, farbe);
      d.updateMatrix();
      m.setMatrixAt(i, d.matrix);
      m.setColorAt(i, farbe);
    });
    m.count = liste.length;
    m.name = name;
    gruppe.add(m);
    return m;
  }

  /** Freier Mindestabstand zur Mittellinie (aller Streckenteile) für Deko. */
  function dekoGrenze(strecke) { return strecke.breite / 2 + 6; }

  /** Abstand hinter dem Zaun (Bande) – dort stehen große Hindernisse. */
  function hinterZaun(strecke) { return strecke.seitenabstandMax + 1.5; }

  /** Liegt (x, z) frei genug? (|Seitenabstand| zu ALLEN Streckenteilen ≥ frei) */
  function istFrei(strecke, x, z, frei) {
    const n = strecke.spline.naechster(x, z);
    if (Math.abs(n.seitenabstand) < frei) return false;
    // Tunnelhügel und Brückensenke frei halten (sonst stechen Bäume durch Hügel/Brücke)
    return !(strecke.dekoSperre && strecke.dekoSperre(x, z, n));
  }

  /**
   * Freie Stelle neben der Strecke suchen: zufälliges s, Seite, Abstand d.
   * @param {number} frei Mindestabstand zu allen Streckenteilen (Mitte)
   * @param {number} [hochzahl] > 1: dichter an der Strecke häufiger
   * @returns {{x,z,y,winkel,s,seite,d}|null}
   */
  function stelleSuchen(strecke, rnd, abstandMin, abstandMax, frei, versuche, hochzahl) {
    const sp = strecke.spline;
    for (let v = 0; v < (versuche || 20); v++) {
      const s = rnd() * sp.laenge;
      const p = sp.punktBei(s);
      const seite = rnd() < 0.5 ? -1 : 1;
      const d = abstandMin + (abstandMax - abstandMin) * Math.pow(rnd(), hochzahl || 1.6);
      const x = p.x + p.nx * d * seite, z = p.z + p.nz * d * seite;
      if (!istFrei(strecke, x, z, frei)) continue;
      return { x, z, y: strecke.bodenHoehe(x, z), winkel: rnd() * Math.PI * 2, s, seite, d };
    }
    return null;
  }

  /** Mittelpunkt der Strecke (= Mitte der Bodenplatte, siehe trackBuilder._bodenBauen). */
  function streckenMitte(strecke) {
    let mx = 0, mz = 0;
    const pk = strecke.spline.punkte;
    pk.forEach(p => { mx += p.x; mz += p.z; });
    return { x: mx / pk.length, z: mz / pk.length };
  }

  /** Liegt (x, z) noch auf der Bodenplatte (1600 m, etwas Rand)? */
  function aufBoden(mitte, x, z, rand) {
    const h = 800 - (rand || 20);
    return Math.abs(x - mitte.x) < h && Math.abs(z - mitte.z) < h;
  }

  /** Wasserfläche (Teich/Oase) als unregelmäßige Scheibe auf Höhe y. */
  function wasserFlaeche(x, y, z, radius, rnd, farbe) {
    const n = 28, pos = [0, 0, 0];
    for (let i = 0; i <= n; i++) {
      const w = (i % n) / n * Math.PI * 2;
      const r = radius * (0.82 + 0.18 * Math.sin(w * 3 + rnd() * 0.3) + 0.06 * rnd());
      pos.push(Math.cos(w) * r, 0, Math.sin(w) * r);
    }
    const index = [];
    for (let i = 1; i <= n; i++) index.push(0, i + 1, i);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
    geo.setIndex(index);
    geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({
      color: farbe, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
    m.position.set(x, y, z);
    m.name = 'Wasser';
    return m;
  }

  /**
   * Ruhige Stelle für Wasser suchen: geringer Höhenunterschied im Radius,
   * Abstand zur Strecke zwischen dMin und dMax (vom Rand der Wasserfläche).
   */
  function wasserStelle(strecke, rnd, radius, dMin, dMax, versuche) {
    let beste = null;
    for (let v = 0; v < (versuche || 60); v++) {
      const st = stelleSuchen(strecke, rnd, dMin + radius, dMax + radius, dekoGrenze(strecke) + radius + 2, 10, 1);
      if (!st) continue;
      let hMin = Infinity, hMax = -Infinity;
      for (let k = 0; k < 12; k++) {
        const w = k / 12 * Math.PI * 2;
        const h = strecke.bodenHoehe(st.x + Math.cos(w) * radius, st.z + Math.sin(w) * radius);
        hMin = Math.min(hMin, h); hMax = Math.max(hMax, h);
      }
      const h0 = strecke.bodenHoehe(st.x, st.z);
      hMin = Math.min(hMin, h0); hMax = Math.max(hMax, h0);
      const guete = hMax - hMin;
      if (!beste || guete < beste.guete) beste = Object.assign(st, { guete, hMin, hMax });
    }
    return beste;
  }

  // ------------------------------------------------------------------ Geometrien

  function tanneGeo() {
    const stamm = new THREE.CylinderGeometry(0.22, 0.32, 1.6, 6); stamm.translate(0, 0.8, 0);
    const k1 = new THREE.ConeGeometry(2.1, 3.6, 7); k1.translate(0, 2.9, 0);
    const k2 = new THREE.ConeGeometry(1.6, 3.0, 7); k2.translate(0, 4.6, 0);
    const k3 = new THREE.ConeGeometry(1.05, 2.4, 7); k3.translate(0, 6.2, 0);
    return vereinen([{ geo: stamm, farbe: 0x5a3c22 }, { geo: k1, farbe: 0x2c5a2e }, { geo: k2, farbe: 0x31633a }, { geo: k3, farbe: 0x376b3c }]);
  }

  function laubbaumGeo() {
    const stamm = new THREE.CylinderGeometry(0.25, 0.38, 3.2, 6); stamm.translate(0, 1.6, 0);
    const k1 = new THREE.IcosahedronGeometry(2.4, 0); k1.scale(1, 0.85, 1); k1.translate(0, 4.4, 0);
    const k2 = new THREE.IcosahedronGeometry(1.6, 0); k2.translate(0.9, 5.6, 0.4);
    const k3 = new THREE.IcosahedronGeometry(1.4, 0); k3.translate(-1.0, 5.0, -0.6);
    return vereinen([{ geo: stamm, farbe: 0x6b4a2b }, { geo: k1, farbe: 0x3f7f2a }, { geo: k2, farbe: 0x4a8a30 }, { geo: k3, farbe: 0x387226 }]);
  }

  /**
   * Tunnelbaum: Ursprung am Stammfuß, Stamm neigt sich nach +x (zur Straße),
   * die große Krone hängt in ~9–11 m Höhe über die Fahrbahn.
   */
  function tunnelbaumGeo(reichweite) {
    // Stamm: leicht zur Straße geneigt, ~9 m hoch
    const neig = 0.22, laenge = 9.5;
    const stamm = new THREE.CylinderGeometry(0.26, 0.42, laenge, 6);
    stamm.translate(0, laenge / 2, 0); stamm.rotateZ(-neig);
    const kopfX = Math.sin(neig) * laenge, kopfY = Math.cos(neig) * laenge;
    // Ast schräg nach innen, darauf mehrere Laubballen bis über die Fahrbahnmitte
    const ast = new THREE.CylinderGeometry(0.14, 0.22, reichweite * 0.75, 5);
    ast.translate(0, reichweite * 0.375, 0); ast.rotateZ(-1.25); ast.translate(kopfX, kopfY - 0.6, 0);
    const teile = [{ geo: stamm, farbe: 0x4e3520 }, { geo: ast, farbe: 0x4e3520 }];
    const ballen = [[0.05, 0.4, 3.6, 0x3a7c34], [0.28, 1.4, 3.8, 0x4a9040], [0.52, 1.9, 3.6, 0x418838],
      [0.76, 1.6, 3.3, 0x4f9a44], [0.98, 1.0, 3.0, 0x3a7a32]];
    ballen.forEach(([anteil, hoch, r, farbe], i) => {
      const k = new THREE.IcosahedronGeometry(r, 0);
      k.scale(1, 0.72, 1.15);
      k.translate(kopfX + anteil * reichweite, kopfY + hoch, (i % 2 ? 1 : -1) * 0.9);
      teile.push({ geo: k, farbe });
    });
    return vereinen(teile);
  }

  function pilzGeo() {
    const stiel = new THREE.CylinderGeometry(0.12, 0.16, 0.5, 7); stiel.translate(0, 0.25, 0);
    const hut = new THREE.SphereGeometry(0.42, 9, 5, 0, Math.PI * 2, 0, Math.PI / 2); hut.scale(1, 0.75, 1); hut.translate(0, 0.46, 0);
    const teile = [{ geo: stiel, farbe: 0xf2eee2 }, { geo: hut, farbe: 0xd7262b }];
    // weiße Punkte auf dem Hut
    [[0, 0.78, 0], [0.24, 0.67, 0.1], [-0.2, 0.66, 0.16], [0.05, 0.64, -0.27], [-0.18, 0.68, -0.14]].forEach(([x, y, z]) => {
      const p = new THREE.IcosahedronGeometry(0.06, 0); p.translate(x, y, z);
      teile.push({ geo: p, farbe: 0xffffff });
    });
    return vereinen(teile);
  }

  function stumpfGeo() {
    const s = new THREE.CylinderGeometry(0.45, 0.6, 0.55, 8); s.translate(0, 0.27, 0);
    const oben = new THREE.CylinderGeometry(0.43, 0.43, 0.02, 8); oben.translate(0, 0.56, 0);
    const w1 = new THREE.BoxGeometry(0.9, 0.18, 0.22); w1.translate(0.35, 0.08, 0);   // Wurzeln
    const w2 = new THREE.BoxGeometry(0.22, 0.16, 0.8); w2.translate(-0.1, 0.07, 0.32);
    return vereinen([{ geo: s, farbe: 0x5e4029 }, { geo: oben, farbe: 0xc9a46c }, { geo: w1, farbe: 0x4f3622 }, { geo: w2, farbe: 0x4f3622 }]);
  }

  function saguaroGeo() {
    const z = (r, h) => new THREE.CylinderGeometry(r, r * 1.05, h, 8);
    const stamm = z(0.42, 6); stamm.translate(0, 3, 0);
    const kopf = new THREE.SphereGeometry(0.42, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2); kopf.translate(0, 6, 0);
    const a1 = z(0.28, 1.1); a1.rotateZ(Math.PI / 2); a1.translate(0.8, 2.6, 0);
    const a1h = z(0.28, 2.0); a1h.translate(1.32, 3.55, 0);
    const a1k = new THREE.SphereGeometry(0.28, 7, 3, 0, Math.PI * 2, 0, Math.PI / 2); a1k.translate(1.32, 4.55, 0);
    const a2 = z(0.26, 0.9); a2.rotateZ(Math.PI / 2); a2.translate(-0.7, 3.4, 0);
    const a2h = z(0.26, 1.5); a2h.translate(-1.12, 4.1, 0);
    const a2k = new THREE.SphereGeometry(0.26, 7, 3, 0, Math.PI * 2, 0, Math.PI / 2); a2k.translate(-1.12, 4.85, 0);
    const g = 0x4f8a3c;
    return vereinen([stamm, kopf, a1, a1h, a1k, a2, a2h, a2k].map((geo, i) => ({ geo, farbe: i % 3 === 1 ? 0x5a9846 : g })));
  }

  function kugelkaktusGeo() {
    const k = new THREE.IcosahedronGeometry(0.5, 1); k.scale(1, 0.85, 1); k.translate(0, 0.38, 0);
    const bluete = new THREE.IcosahedronGeometry(0.13, 0); bluete.translate(0, 0.82, 0);
    const k2 = new THREE.IcosahedronGeometry(0.3, 1); k2.translate(0.55, 0.22, 0.2);
    return vereinen([{ geo: k, farbe: 0x5f9a48 }, { geo: k2, farbe: 0x548c40 }, { geo: bluete, farbe: 0xff5fa2 }]);
  }

  function palmeGeo() {
    const teile = [];
    // gebogener Stamm aus 6 Stücken (neigt sich nach +x)
    let x = 0, y = 0, w = 0;
    for (let i = 0; i < 6; i++) {
      const l = 1.4, r = 0.32 - i * 0.025;
      const st = new THREE.CylinderGeometry(r * 0.92, r, l, 6);
      st.translate(0, l / 2, 0); st.rotateZ(-w); st.translate(x, y, 0);
      teile.push({ geo: st, farbe: i % 2 ? 0x8a6a42 : 0x7a5c38 });
      x += Math.sin(w) * l; y += Math.cos(w) * l; w += 0.07;
    }
    // Wedel: lange flache Kegel, rundherum hängend
    for (let i = 0; i < 7; i++) {
      const wedel = new THREE.ConeGeometry(0.55, 4.2, 4);
      wedel.scale(1, 1, 0.25);
      wedel.translate(0, 2.1, 0);
      wedel.rotateZ(-Math.PI / 2 - 0.35);        // fast waagerecht, Spitze leicht nach unten
      wedel.rotateY(i / 7 * Math.PI * 2);
      wedel.translate(x, y, 0);
      teile.push({ geo: wedel, farbe: i % 2 ? 0x3f8f3a : 0x4fa044 });
    }
    const nuss = new THREE.IcosahedronGeometry(0.35, 0); nuss.translate(x, y - 0.2, 0);
    teile.push({ geo: nuss, farbe: 0x6b4a22 });
    return vereinen(teile);
  }

  function tafelbergGeo() {
    const fuss = new THREE.CylinderGeometry(1.0, 1.25, 0.55, 7); fuss.translate(0, 0.27, 0);
    const mitte = new THREE.CylinderGeometry(0.9, 1.0, 0.35, 7); mitte.translate(0, 0.72, 0);
    const kappe = new THREE.CylinderGeometry(0.92, 0.9, 0.08, 7); kappe.translate(0, 0.93, 0);
    return vereinen([{ geo: fuss, farbe: 0xb5643a }, { geo: mitte, farbe: 0xc2734a }, { geo: kappe, farbe: 0xa45532 }]);
  }

  // ------------------------------------------------------------------ Wiese

  function wieseDeko(gruppe, thema, strecke, rnd) {
    const dummy = new THREE.Object3D();
    const b2 = strecke.breite / 2;
    const mitte = streckenMitte(strecke);

    // ---------- Bäume: Laubbäume (Kugelkrone) und Tannen (Kegelkrone) ----------
    const stammGeo = new THREE.CylinderGeometry(0.25, 0.35, 1, 6); stammGeo.translate(0, 0.5, 0);
    const kroneRundGeo = new THREE.IcosahedronGeometry(1, 0);
    const kroneKegelGeo = new THREE.ConeGeometry(1, 1, 7); kroneKegelGeo.translate(0, 0.5, 0);
    const stammMat = new THREE.MeshLambertMaterial({ color: 0x6b4a2b });
    const laubMat = new THREE.MeshLambertMaterial({ color: 0x3f7f2a, flatShading: true });
    const tanneMat = new THREE.MeshLambertMaterial({ color: 0x2d5e33, flatShading: true });

    const baeume = [];
    // Ein paar Wäldchen (Gruppen) plus Einzelbäume
    const waldZentren = [];
    for (let i = 0; i < 9; i++) {
      const st = stelleSuchen(strecke, rnd, 45, 230, b2 + 6 + 25, 40);
      if (st) waldZentren.push(st);
    }
    for (let i = 0; i < thema.deko.baeume; i++) {
      let st = null;
      if (i % 3 !== 0 && waldZentren.length) {
        // im Wäldchen
        const w = waldZentren[Math.floor(rnd() * waldZentren.length)];
        for (let v = 0; v < 8 && !st; v++) {
          const x = w.x + (rnd() - 0.5) * 60, z = w.z + (rnd() - 0.5) * 60;
          if (istFrei(strecke, x, z, b2 + 6 + 3)) st = { x, z, y: strecke.bodenHoehe(x, z), winkel: rnd() * Math.PI * 2 };
        }
      } else {
        st = stelleSuchen(strecke, rnd, 14, 250, b2 + 6 + 3);
      }
      if (!st) continue;
      st.tanne = rnd() < 0.35;
      st.groesse = 0.75 + rnd() * 0.6;
      baeume.push(st);
    }
    // Ferne Baumreihen und Wäldchen am Horizont (hinter 150 m, größer)
    for (let i = 0; i < thema.deko.fernBaeume; i++) {
      const st = stelleSuchen(strecke, rnd, 150, 420, 120, 10, 1);
      if (!st || !aufBoden(mitte, st.x, st.z)) continue;
      st.tanne = rnd() < 0.45;
      st.groesse = 1.0 + rnd() * 0.7;
      baeume.push(st);
    }
    const laub = baeume.filter(b => !b.tanne), tannen = baeume.filter(b => b.tanne);
    instanzMesh(gruppe, 'Baeume', stammGeo, stammMat, baeume, (b, d) => {
      const g = b.groesse;
      d.position.set(b.x, b.y - 0.1, b.z);
      d.rotation.set(0, b.winkel, 0);
      d.scale.set(g, (b.tanne ? 1.6 : 2.6) * g, g);
    });
    instanzMesh(gruppe, 'Baeume', kroneRundGeo, laubMat, laub, (b, d, f) => {
      const g = b.groesse;
      d.position.set(b.x, b.y + 2.6 * g + 1.6 * g, b.z);
      d.rotation.set(rnd() * 0.5, b.winkel, rnd() * 0.5);
      d.scale.set(2.6 * g, 2.3 * g, 2.6 * g);
      f.setHSL(0.26 + rnd() * 0.06, 0.5, 0.75 + rnd() * 0.25);
    });
    instanzMesh(gruppe, 'Baeume', kroneKegelGeo, tanneMat, tannen, (b, d, f) => {
      const g = b.groesse;
      d.position.set(b.x, b.y + 1.2 * g, b.z);
      d.rotation.set(0, b.winkel, 0);
      d.scale.set(2.2 * g, 7 * g, 2.2 * g);
      f.setHSL(0.33, 0.3, 0.8 + rnd() * 0.2);
    });

    // ---------- Büsche ----------
    const buesche = [];
    for (let i = 0; i < thema.deko.buesche; i++) {
      const st = stelleSuchen(strecke, rnd, 12, 180, b2 + 6 + 1.5);
      if (st) buesche.push(st);
    }
    instanzMesh(gruppe, 'Buesche', new THREE.IcosahedronGeometry(1, 0),
      new THREE.MeshLambertMaterial({ color: 0x4d8f30, flatShading: true }), buesche, (b, d, f) => {
        const g = 0.8 + rnd() * 1.0;
        d.position.set(b.x, b.y + 0.35 * g, b.z);
        d.rotation.set(0, b.winkel, 0);
        d.scale.set(1.4 * g, 0.9 * g, 1.2 * g);
        f.setHSL(0.25 + rnd() * 0.08, 0.55, 0.7 + rnd() * 0.3);
      });

    // ---------- Heuballen (liegende Rundballen, oft zu zweit/dritt) ----------
    const heuGeo = new THREE.CylinderGeometry(0.75, 0.75, 1.2, 12); heuGeo.rotateZ(Math.PI / 2);
    const ballen = [];
    for (let i = 0; i < thema.deko.heuballen / 2; i++) {
      const st = stelleSuchen(strecke, rnd, 16, 90, b2 + 6 + 4);
      if (!st) continue;
      const anzahl = 1 + Math.floor(rnd() * 3);
      for (let k = 0; k < anzahl && ballen.length < thema.deko.heuballen; k++) {
        const x = st.x + Math.cos(st.winkel) * k * 1.4, z = st.z - Math.sin(st.winkel) * k * 1.4;
        ballen.push({ x, z, y: strecke.bodenHoehe(x, z), winkel: st.winkel });
      }
    }
    instanzMesh(gruppe, 'Heuballen', heuGeo, new THREE.MeshLambertMaterial({ color: 0xd9b24a }), ballen, (b, d) => {
      d.position.set(b.x, b.y + 0.72, b.z);
      d.rotation.set(0, b.winkel, 0);
    });

    // ---------- Kühe: aus Kästen, schwarz-weiß (2 InstancedMeshes) ----------
    const kastenGeo = new THREE.BoxGeometry(1, 1, 1);
    const weiss = [], schwarz = [];   // Teile: [x, y, z, sx, sy, sz] relativ zur Kuh (Blick nach -z)
    const kuhTeile = {
      weiss: [[0, 1.15, 0, 0.9, 0.8, 1.8], [0, 1.45, -1.15, 0.5, 0.5, 0.6]],
      schwarz: [[-0.3, 0.38, -0.65, 0.18, 0.75, 0.18], [0.3, 0.38, -0.65, 0.18, 0.75, 0.18],
        [-0.3, 0.38, 0.65, 0.18, 0.75, 0.18], [0.3, 0.38, 0.65, 0.18, 0.75, 0.18],
        [0.46, 1.25, 0.2, 0.02, 0.45, 0.6], [-0.46, 1.15, -0.3, 0.02, 0.4, 0.5],
        [0, 1.56, 0.3, 0.6, 0.02, 0.5], [0, 1.35, -1.47, 0.42, 0.25, 0.08],
        [-0.2, 1.75, -1.1, 0.1, 0.12, 0.1], [0.2, 1.75, -1.1, 0.1, 0.12, 0.1]],
    };
    const kuhGruppe = new THREE.Object3D();
    for (let i = 0; i < thema.deko.kuehe; i++) {
      const st = stelleSuchen(strecke, rnd, 20, 60, b2 + 6 + 3, 40);
      if (!st) continue;
      kuhGruppe.position.set(st.x, st.y, st.z);
      kuhGruppe.rotation.set(0, st.winkel, 0);
      kuhGruppe.updateMatrixWorld(true);
      for (const [liste, ziel] of [[kuhTeile.weiss, weiss], [kuhTeile.schwarz, schwarz]]) {
        for (const t of liste) {
          dummy.position.set(t[0], t[1], t[2]);
          dummy.rotation.set(0, 0, 0);
          dummy.scale.set(t[3], t[4], t[5]);
          dummy.updateMatrix();
          ziel.push(new THREE.Matrix4().multiplyMatrices(kuhGruppe.matrixWorld, dummy.matrix));
        }
      }
    }
    [[weiss, 0xf5f5f0], [schwarz, 0x1d1d1d]].forEach(([liste, f]) => {
      instanzMesh(gruppe, 'Kuehe', kastenGeo, new THREE.MeshLambertMaterial({ color: f }), liste, (mat, d) => {
        mat.decompose(d.position, d.quaternion, d.scale);
      });
    });

    // ---------- Teich (in einer flachen Mulde, mit Schilf aus Büschen) ----------
    const teich = wasserStelle(strecke, rnd, 13, 20, 70, 80);
    if (teich) {
      gruppe.add(wasserFlaeche(teich.x, teich.hMin + 0.25, teich.z, 13, rnd, 0x4a8fc4));
      teich.radius = 13;
    }

    // ---------- Blumenwiesen: Gruppen bunter, flacher Scheiben ----------
    const blumen = [];
    for (let i = 0; i < thema.deko.blumen / 6; i++) {
      const st = stelleSuchen(strecke, rnd, b2 + 9, 90, b2 + 8, 10, 1.3);
      if (!st) continue;
      const farbe = Math.floor(rnd() * 6);
      for (let k = 0; k < 6; k++) {
        const x = st.x + (rnd() - 0.5) * 9, z = st.z + (rnd() - 0.5) * 9;
        if (!istFrei(strecke, x, z, b2 + 6.5)) continue;
        if (teich && Math.hypot(x - teich.x, z - teich.z) < teich.radius + 2) continue;
        blumen.push({ x, z, y: strecke.bodenHoehe(x, z), winkel: rnd() * 6.28, farbe: rnd() < 0.7 ? farbe : Math.floor(rnd() * 6) });
      }
    }
    const FARBEN = [0xffe14a, 0xffffff, 0xff7fbf, 0xb68cff, 0xff5a4a, 0xffb347];
    const blumenGeo = new THREE.CircleGeometry(1, 7); blumenGeo.rotateX(-Math.PI / 2);
    instanzMesh(gruppe, 'Blumen', blumenGeo, new THREE.MeshLambertMaterial({
      color: 0xffffff, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }), blumen, (b, d, f) => {
      const g = 1.0 + rnd() * 1.6;
      d.position.set(b.x, b.y + 0.06, b.z);
      d.rotation.set(0, b.winkel, 0);
      d.scale.set(g * (1 + rnd() * 0.8), 1, g);
      f.setHex(FARBEN[b.farbe]);
    });
    return { baeume: baeume.length, buesche: buesche.length, heuballen: ballen.length, kuehe: weiss.length / 2, blumen: blumen.length, teich: !!teich };
  }

  // ------------------------------------------------------------------ Wald

  function waldDeko(gruppe, thema, strecke, rnd) {
    const sp = strecke.spline, L = sp.laenge;
    const b2 = strecke.breite / 2, zaun = hinterZaun(strecke), grenze = dekoGrenze(strecke);
    const mitte = streckenMitte(strecke);
    const tunnel = strecke.daten.baumtunnel || null;
    const br = strecke.bruecke || null;
    const imTunnel = (s) => tunnel && s >= tunnel.von - 6 && s <= tunnel.bis + 6;
    // Bachbett unter der Brücke freihalten (Bach läuft quer, ~±8 m um die Brückenmitte)
    const bachMitte = br ? sp.punktBei((br.von + br.bis) / 2) : null;
    const amBach = (x, z) => {
      if (!bachMitte) return false;
      const dx = x - bachMitte.x, dz = z - bachMitte.z;
      const laengs = Math.abs(dx * bachMitte.tx + dz * bachMitte.tz);
      const quer = Math.abs(dx * bachMitte.nx + dz * bachMitte.nz);
      return laengs < 9 && quer < strecke.seitenabstandMax + 64;
    };

    // ---------- Bäume: dichtes Band beidseits hinter dem Zaun + Wald in der Ferne ----------
    const baeume = [];
    const neu = (x, z, groesse, tanne) => {
      if (amBach(x, z)) return;
      baeume.push({ x, z, y: strecke.bodenHoehe(x, z), winkel: rnd() * Math.PI * 2, groesse, tanne });
    };
    for (let s = 0; s < L; s += thema.deko.bandAbstand) {
      if (imTunnel(s)) continue;
      const p = sp.punktBei(s + rnd() * 2);
      [-1, 1].forEach((seite) => {
        const anzahl = 1 + (rnd() < 0.55 ? 1 : 0);
        for (let k = 0; k < anzahl; k++) {
          const d = zaun + 0.5 + Math.pow(rnd(), 1.4) * 42;
          const x = p.x + p.nx * d * seite, z = p.z + p.nz * d * seite;
          if (!istFrei(strecke, x, z, zaun)) continue;
          neu(x, z, 0.8 + rnd() * 0.6, rnd() < 0.68);
        }
      });
    }
    for (let i = 0; i < thema.deko.fernBaeume; i++) {
      const st = stelleSuchen(strecke, rnd, 45, 260, zaun + 20, 8, 1);
      if (!st || !aufBoden(mitte, st.x, st.z)) continue;
      neu(st.x, st.z, 1.0 + rnd() * 0.7, rnd() < 0.75);
    }
    const tannen = baeume.filter(b => b.tanne), laub = baeume.filter(b => !b.tanne);
    instanzMesh(gruppe, 'Tannen', tanneGeo(), vertexMaterial(true), tannen, (b, d, f) => {
      d.position.set(b.x, b.y - 0.15, b.z);
      d.rotation.set(0, b.winkel, 0);
      d.scale.set(b.groesse, b.groesse * (1.05 + rnd() * 0.5), b.groesse);
      f.setHSL(0.3, 0.25, 0.72 + rnd() * 0.28);
    });
    instanzMesh(gruppe, 'Laubbaeume', laubbaumGeo(), vertexMaterial(true), laub, (b, d, f) => {
      d.position.set(b.x, b.y - 0.15, b.z);
      d.rotation.set(0, b.winkel, 0);
      d.scale.setScalar(b.groesse * 1.1);
      f.setHSL(0.22 + rnd() * 0.08, 0.35, 0.7 + rnd() * 0.3);
    });

    // ---------- Baumtunnel: Bäume direkt hinter dem Zaun, Kronen über der Fahrbahn ----------
    const tunnelBaeume = [];
    if (tunnel) {
      let k = 0;
      for (let s = tunnel.von; s <= tunnel.bis; s += 5, k++) {
        [-1, 1].forEach((seite) => {
          const ps = s + (seite > 0 ? 0 : 2.5) + (rnd() - 0.5);
          const p = sp.punktBei(ps);
          const d = zaun + 0.3 + rnd() * 1.2;
          const x = p.x + p.nx * d * seite, z = p.z + p.nz * d * seite;
          if (!istFrei(strecke, x, z, zaun)) return;
          // lokale +x-Achse zeigt zur Straßenmitte
          const rx = -p.nx * seite, rz = -p.nz * seite;
          tunnelBaeume.push({ x, z, y: strecke.bodenHoehe(x, z), drehung: Math.atan2(-rz, rx), d });
        });
      }
    }
    if (tunnelBaeume.length) {
      instanzMesh(gruppe, 'Baumtunnel', tunnelbaumGeo(strecke.seitenabstandMax + 2), vertexMaterial(true), tunnelBaeume, (b, d, f) => {
        d.position.set(b.x, b.y - 0.2, b.z);
        d.rotation.set(0, b.drehung + (rnd() - 0.5) * 0.25, 0);
        const g = 0.92 + rnd() * 0.16;
        d.scale.set(g, g, g);
        f.setHSL(0.3, 0.3, 0.78 + rnd() * 0.2);
      });
    }

    // ---------- Farne / Büsche (niedrig, auch vor dem Zaun) ----------
    const farne = [];
    for (let i = 0; i < thema.deko.farne; i++) {
      const st = stelleSuchen(strecke, rnd, grenze + 0.5, zaun + 30, grenze, 10, 1.3);
      if (st && !amBach(st.x, st.z)) farne.push(st);
    }
    instanzMesh(gruppe, 'Farne', new THREE.IcosahedronGeometry(1, 0),
      new THREE.MeshLambertMaterial({ color: 0x3e7a2c, flatShading: true }), farne, (b, d, f) => {
        const g = 0.6 + rnd() * 0.7;
        d.position.set(b.x, b.y + 0.15 * g, b.z);
        d.rotation.set(0, b.winkel, 0);
        d.scale.set(1.5 * g, 0.6 * g, 1.3 * g);
        f.setHSL(0.24 + rnd() * 0.08, 0.5, 0.65 + rnd() * 0.3);
      });

    // ---------- Felsen (bemoost grau, hinter dem Zaun) ----------
    const felsen = [];
    for (let i = 0; i < thema.deko.felsen; i++) {
      const st = stelleSuchen(strecke, rnd, zaun + 1, zaun + 60, zaun + 1.5, 10, 1.5);
      if (st && !amBach(st.x, st.z)) felsen.push(st);
    }
    // ein paar Felsen säumen den Bach
    if (bachMitte) {
      [-1, 1].forEach((seite) => {
        for (let k = 0; k < 6; k++) {
          const d = strecke.seitenabstandMax + 4 + k * 8 + rnd() * 4;
          const q = (rnd() < 0.5 ? -1 : 1) * (6 + rnd() * 2);
          const x = bachMitte.x + bachMitte.nx * d * seite + bachMitte.tx * q, z = bachMitte.z + bachMitte.nz * d * seite + bachMitte.tz * q;
          if (istFrei(strecke, x, z, zaun)) felsen.push({ x, z, y: strecke.bodenHoehe(x, z), winkel: rnd() * 6.28, klein: true });
        }
      });
    }
    instanzMesh(gruppe, 'Felsen', new THREE.DodecahedronGeometry(1, 0),
      new THREE.MeshLambertMaterial({ color: 0x8a8d86, flatShading: true }), felsen, (b, d, f) => {
        const g = (b.klein ? 0.5 : 0.7) + rnd() * (b.klein ? 0.6 : 1.6);
        d.position.set(b.x, b.y + 0.2 * g, b.z);
        d.rotation.set(rnd() * 0.6, b.winkel, rnd() * 0.6);
        d.scale.set(1.3 * g, 0.75 * g, 1.1 * g);
        f.setHSL(0.18 + rnd() * 0.12, 0.12 + rnd() * 0.1, 0.62 + rnd() * 0.25);
      });

    // ---------- Baumstümpfe ----------
    const stuempfe = [];
    for (let i = 0; i < thema.deko.stuempfe; i++) {
      const st = stelleSuchen(strecke, rnd, grenze + 0.5, zaun + 25, grenze + 0.5, 10, 1.2);
      if (st && !amBach(st.x, st.z)) stuempfe.push(st);
    }
    instanzMesh(gruppe, 'Baumstuempfe', stumpfGeo(), vertexMaterial(true), stuempfe, (b, d) => {
      d.position.set(b.x, b.y - 0.05, b.z);
      d.rotation.set(0, b.winkel, 0);
      d.scale.setScalar(0.8 + rnd() * 0.6);
    });

    // ---------- Fliegenpilze (kleine Gruppen) ----------
    const pilze = [];
    for (let i = 0; i < thema.deko.pilzGruppen; i++) {
      const st = stelleSuchen(strecke, rnd, grenze + 1, zaun + 12, grenze + 1.5, 10, 1.2);
      if (!st || amBach(st.x, st.z)) continue;
      const n = 2 + Math.floor(rnd() * 4);
      for (let k = 0; k < n; k++) {
        const x = st.x + (rnd() - 0.5) * 2.4, z = st.z + (rnd() - 0.5) * 2.4;
        if (istFrei(strecke, x, z, grenze)) pilze.push({ x, z, y: strecke.bodenHoehe(x, z), winkel: rnd() * 6.28 });
      }
    }
    instanzMesh(gruppe, 'Pilze', pilzGeo(), vertexMaterial(false), pilze, (b, d) => {
      const g = 0.7 + rnd() * 0.7;
      d.position.set(b.x, b.y - 0.02, b.z);
      d.rotation.set((rnd() - 0.5) * 0.25, b.winkel, (rnd() - 0.5) * 0.25);
      d.scale.setScalar(g);
    });
    return { baeume: baeume.length, tunnel: tunnelBaeume.length, farne: farne.length, felsen: felsen.length, stuempfe: stuempfe.length, pilze: pilze.length };
  }

  // ------------------------------------------------------------------ Wüste

  function wuesteDeko(gruppe, thema, strecke, rnd) {
    const grenze = dekoGrenze(strecke), zaun = hinterZaun(strecke);
    const mitte = streckenMitte(strecke);

    // ---------- Oase: Wasser, Palmen, grüne Büsche (an einer flachen Stelle) ----------
    const oase = wasserStelle(strecke, rnd, 14, 30, 70, 120);
    const amWasser = (x, z, extra) => oase && Math.hypot(x - oase.x, z - oase.z) < 14 + (extra || 0);
    const palmen = [], gruen = [];
    if (oase) {
      gruppe.add(wasserFlaeche(oase.x, oase.hMin + 0.3, oase.z, 14, rnd, 0x3fa3c8));
      for (let i = 0; i < thema.deko.palmen; i++) {
        const w = i / thema.deko.palmen * Math.PI * 2 + rnd() * 0.4, r = 16 + rnd() * 5;
        const x = oase.x + Math.cos(w) * r, z = oase.z + Math.sin(w) * r;
        if (!istFrei(strecke, x, z, zaun)) continue;
        palmen.push({ x, z, y: strecke.bodenHoehe(x, z), winkel: rnd() * 6.28 });
      }
      for (let i = 0; i < 34; i++) {
        const w = rnd() * Math.PI * 2, r = 14.5 + rnd() * 9;
        const x = oase.x + Math.cos(w) * r, z = oase.z + Math.sin(w) * r;
        if (istFrei(strecke, x, z, grenze + 1)) gruen.push({ x, z, y: strecke.bodenHoehe(x, z), winkel: rnd() * 6.28, oase: true });
      }
    }
    instanzMesh(gruppe, 'Palmen', palmeGeo(), vertexMaterial(true), palmen, (b, d) => {
      d.position.set(b.x, b.y - 0.1, b.z);
      d.rotation.set(0, b.winkel, 0);
      d.scale.setScalar(0.9 + rnd() * 0.35);
    });

    // ---------- Gestrüpp (trocken) + Oasen-Grün: ein InstancedMesh ----------
    for (let i = 0; i < thema.deko.gestruepp; i++) {
      const st = stelleSuchen(strecke, rnd, grenze + 0.5, 140, grenze + 0.5, 10, 1.5);
      if (st && !amWasser(st.x, st.z, 1)) gruen.push(st);
    }
    instanzMesh(gruppe, 'Gestruepp', new THREE.IcosahedronGeometry(1, 0),
      new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true }), gruen, (b, d, f) => {
        const g = b.oase ? 0.9 + rnd() * 0.9 : 0.4 + rnd() * 0.6;
        d.position.set(b.x, b.y + 0.25 * g, b.z);
        d.rotation.set(0, b.winkel, 0);
        d.scale.set(1.3 * g, 0.75 * g, 1.2 * g);
        if (b.oase) f.setHSL(0.27 + rnd() * 0.06, 0.55, 0.38 + rnd() * 0.1);
        else f.setHSL(0.11 + rnd() * 0.06, 0.35, 0.42 + rnd() * 0.12);
      });

    // ---------- Saguaro-Kakteen (hinter dem Zaun) ----------
    const saguaros = [];
    for (let i = 0; i < thema.deko.saguaros; i++) {
      const st = stelleSuchen(strecke, rnd, zaun, 220, zaun, 10, 1.6);
      if (st && !amWasser(st.x, st.z, 10) && aufBoden(mitte, st.x, st.z)) saguaros.push(st);
    }
    instanzMesh(gruppe, 'Kakteen', saguaroGeo(), vertexMaterial(true), saguaros, (b, d, f) => {
      const g = 0.7 + rnd() * 0.6;
      d.position.set(b.x, b.y - 0.2, b.z);
      d.rotation.set(0, b.winkel, 0);
      d.scale.set(g, g * (0.8 + rnd() * 0.5), g);
      f.setHSL(0.3, 0.2, 0.8 + rnd() * 0.2);
    });

    // ---------- Kugelkakteen (klein, auch vor dem Zaun) ----------
    const kugeln = [];
    for (let i = 0; i < thema.deko.kugelkakteen; i++) {
      const st = stelleSuchen(strecke, rnd, grenze + 0.5, zaun + 40, grenze + 0.5, 10, 1.3);
      if (st && !amWasser(st.x, st.z, 2)) kugeln.push(st);
    }
    instanzMesh(gruppe, 'Kugelkakteen', kugelkaktusGeo(), vertexMaterial(true), kugeln, (b, d) => {
      d.position.set(b.x, b.y - 0.05, b.z);
      d.rotation.set(0, b.winkel, 0);
      d.scale.setScalar(0.8 + rnd() * 0.8);
    });

    // ---------- Felsen (rotbraun) ----------
    const felsen = [];
    for (let i = 0; i < thema.deko.felsen; i++) {
      const st = stelleSuchen(strecke, rnd, zaun + 1, 260, zaun + 2, 10, 1.7);
      if (st && !amWasser(st.x, st.z, 6) && aufBoden(mitte, st.x, st.z)) felsen.push(st);
    }
    instanzMesh(gruppe, 'Felsen', new THREE.DodecahedronGeometry(1, 0),
      new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true }), felsen, (b, d, f) => {
        const gross = rnd() < 0.18;
        const g = gross ? 3 + rnd() * 4 : 0.6 + rnd() * 1.8;
        d.position.set(b.x, b.y + 0.15 * g, b.z);
        d.rotation.set(rnd() * 0.5, b.winkel, rnd() * 0.5);
        d.scale.set(1.3 * g, (gross ? 0.9 : 0.7) * g, 1.1 * g);
        f.setHSL(0.04 + rnd() * 0.04, 0.45 + rnd() * 0.15, 0.42 + rnd() * 0.12);
      });

    // ---------- Tafelberge in der Ferne ----------
    const berge = [];
    for (let i = 0; i < thema.deko.tafelberge * 4 && berge.length < thema.deko.tafelberge; i++) {
      const st = stelleSuchen(strecke, rnd, 260, 520, 220, 6, 1);
      if (!st || !aufBoden(mitte, st.x, st.z, 70)) continue;
      if (berge.some(b => Math.hypot(b.x - st.x, b.z - st.z) < 120)) continue;
      berge.push(st);
    }
    instanzMesh(gruppe, 'Tafelberge', tafelbergGeo(), vertexMaterial(true), berge, (b, d) => {
      const breit = 30 + rnd() * 40;
      d.position.set(b.x, b.y - 2, b.z);
      d.rotation.set(0, b.winkel, 0);
      d.scale.set(breit, 26 + rnd() * 30, breit * (0.6 + rnd() * 0.6));
    });
    return { oase: !!oase, palmen: palmen.length, gestruepp: gruen.length, saguaros: saguaros.length, kugelkakteen: kugeln.length, felsen: felsen.length, tafelberge: berge.length };
  }


  // ------------------------------------------------------------------ Fantasie

  /** Riesenpilz (Ursprung am Stielfuß, ~0,8 m hoch – wird groß skaliert): Hut in einer Farbe, weiße Punkte. */
  function riesenpilzGeo(hutFarbe) {
    const stiel = new THREE.CylinderGeometry(0.11, 0.17, 0.52, 9); stiel.translate(0, 0.26, 0);
    const ring = new THREE.CylinderGeometry(0.15, 0.13, 0.05, 9); ring.translate(0, 0.38, 0);
    const hut = new THREE.SphereGeometry(0.46, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2); hut.scale(1, 0.7, 1); hut.translate(0, 0.48, 0);
    const unten = new THREE.CircleGeometry(0.46, 12); unten.rotateX(Math.PI / 2); unten.translate(0, 0.48, 0);
    const teile = [{ geo: stiel, farbe: 0xfff6ea }, { geo: ring, farbe: 0xffe6f2 }, { geo: hut, farbe: hutFarbe }, { geo: unten, farbe: 0xf3e2d0 }];
    [[0, 0.81, 0], [0.26, 0.7, 0.1], [-0.22, 0.7, 0.17], [0.06, 0.68, -0.29], [-0.2, 0.72, -0.15], [0.17, 0.62, 0.3], [-0.33, 0.58, 0.02]].forEach(([x, y, z]) => {
      const p = new THREE.IcosahedronGeometry(0.065, 0); p.translate(x, y, z);
      teile.push({ geo: p, farbe: 0xffffff });
    });
    return vereinen(teile);
  }

  /** Zuckerwatte-Baum: weißer Stiel, drei weiche Bälle (Farbe per Instanz). */
  function zuckerbaumGeo() {
    const stiel = new THREE.CylinderGeometry(0.16, 0.24, 3.0, 7); stiel.translate(0, 1.5, 0);
    const k1 = new THREE.IcosahedronGeometry(1.9, 1); k1.translate(0, 4.2, 0);
    const k2 = new THREE.IcosahedronGeometry(1.3, 1); k2.translate(1.1, 5.0, 0.3);
    const k3 = new THREE.IcosahedronGeometry(1.2, 1); k3.translate(-1.0, 4.9, -0.4);
    return vereinen([{ geo: stiel, farbe: 0xd8c8b8 }, { geo: k1, farbe: 0xffffff }, { geo: k2, farbe: 0xf4f4f4 }, { geo: k3, farbe: 0xfafafa }]);
  }

  /** Großer Regenbogen (Halbkreis aus 6 Bändern) als EIN Mesh, Ursprung = Bogenmitte am Boden, Bogen in der xy-Ebene. */
  function regenbogenGeo(radius, dicke, farben) {
    const teile = farben.map((f, i) => {
      const g = new THREE.TorusGeometry(radius - i * dicke, dicke / 2, 6, 64, Math.PI);
      return { geo: g, farbe: f };
    });
    return vereinen(teile);
  }

  function fantasieDeko(gruppe, thema, strecke, rnd) {
    const b2 = strecke.breite / 2, grenze = dekoGrenze(strecke), zaun = hinterZaun(strecke);
    const mitte = streckenMitte(strecke), sp = strecke.spline;
    const PASTELL = [0xff9ad5, 0xb79cff, 0x8fd3ff, 0xffd27a, 0x9cf0c0, 0xffb0a0, 0xfff38a];
    const farbeAus = (f, liste) => f.setHex(liste[Math.floor(rnd() * liste.length)]);

    // ---------- Riesenpilze (hinter dem Zaun, 4 Hutfarben je ein InstancedMesh) ----------
    const HUTE = [0xff4f8b, 0xa66bff, 0x45a8ff, 0xff9f43];
    const pilze = HUTE.map(() => []);
    for (let i = 0; i < thema.deko.pilze; i++) {
      const g = 6 + rnd() * 7;                   // Skalierung → 5–10 m hoch, Hut-Radius 2,8–6 m
      const st = stelleSuchen(strecke, rnd, zaun + g * 0.5, 160, zaun + g * 0.5, 20, 1.4);
      if (!st) continue;
      st.groesse = g;
      pilze[i % HUTE.length].push(st);
    }
    HUTE.forEach((farbe, k) => {
      instanzMesh(gruppe, 'Riesenpilze', riesenpilzGeo(farbe), vertexMaterial(false), pilze[k], (b, d, f) => {
        d.position.set(b.x, b.y - 0.05, b.z);
        d.rotation.set((rnd() - 0.5) * 0.12, b.winkel, (rnd() - 0.5) * 0.12);
        d.scale.setScalar(b.groesse);
        f.setHSL(0, 0, 0.9 + rnd() * 0.1);
      });
    });

    // ---------- Zuckerwatte-Bäume (nah hinter dem Zaun und in der Ferne) ----------
    const baeume = [];
    for (let i = 0; i < thema.deko.zuckerbaeume; i++) {
      const st = stelleSuchen(strecke, rnd, zaun + 2, 150, zaun + 2, 20, 1.6);
      if (st) { st.groesse = 0.8 + rnd() * 0.6; baeume.push(st); }
    }
    for (let i = 0; i < thema.deko.fernBaeume; i++) {
      const st = stelleSuchen(strecke, rnd, 150, 420, 120, 10, 1);
      if (st && aufBoden(mitte, st.x, st.z)) { st.groesse = 1.2 + rnd() * 0.8; baeume.push(st); }
    }
    instanzMesh(gruppe, 'Zuckerbaeume', zuckerbaumGeo(), vertexMaterial(false), baeume, (b, d, f) => {
      d.position.set(b.x, b.y - 0.1, b.z);
      d.rotation.set(0, b.winkel, 0);
      d.scale.setScalar(b.groesse);
      farbeAus(f, PASTELL);
    });

    // ---------- Pastell-Hügel in der Ferne (flache Halbkugeln) ----------
    const huegel = [];
    for (let i = 0; i < thema.deko.huegel; i++) {
      const st = stelleSuchen(strecke, rnd, 160, 520, 140, 10, 1);
      if (st && aufBoden(mitte, st.x, st.z, 40)) huegel.push(st);
    }
    const huegelGeo = new THREE.SphereGeometry(1, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2);
    instanzMesh(gruppe, 'PastellHuegel', huegelGeo, new THREE.MeshLambertMaterial({ color: 0xffffff }), huegel, (b, d, f) => {
      const r = 25 + rnd() * 45;
      d.position.set(b.x, b.y - 2, b.z);
      d.rotation.set(0, b.winkel, 0);
      d.scale.set(r, r * (0.3 + rnd() * 0.25), r * (0.7 + rnd() * 0.5));
      farbeAus(f, [0xffc4e4, 0xd8c4ff, 0xbfe9ff, 0xffe2b8, 0xc8f5d8]);
    });

    // ---------- Schwebende Kugeln und Ballons (mit Schnur) ----------
    const ballons = [];
    for (let i = 0; i < thema.deko.ballons; i++) {
      const st = stelleSuchen(strecke, rnd, grenze + 4, 260, grenze + 4, 20, 1.3);
      if (!st) continue;
      st.r = 1.0 + rnd() * 2.2;
      st.hoch = 10 + rnd() * 28;
      st.schnur = rnd() < 0.65;                 // ein Drittel schwebt frei ("Zauberkugeln")
      ballons.push(st);
    }
    const kugelGeo = new THREE.SphereGeometry(1, 16, 12);
    kugelGeo.scale(1, 1.12, 1);
    instanzMesh(gruppe, 'Ballons', kugelGeo, new THREE.MeshPhongMaterial({ color: 0xffffff, shininess: 70, specular: 0x666666 }), ballons, (b, d, f) => {
      d.position.set(b.x, b.y + b.hoch, b.z);
      d.scale.setScalar(b.r);
      farbeAus(f, [0xff4f8b, 0xffe14a, 0x45a8ff, 0x4cd97b, 0xa66bff, 0xff9f43, 0xffffff]);
    });
    const schnurGeo = new THREE.CylinderGeometry(0.03, 0.03, 1, 4); schnurGeo.translate(0, -0.5, 0);
    instanzMesh(gruppe, 'Ballons', schnurGeo, new THREE.MeshLambertMaterial({ color: 0xf2f2f2 }), ballons.filter(b => b.schnur), (b, d) => {
      d.position.set(b.x, b.y + b.hoch - b.r * 1.1, b.z);
      d.scale.set(1, 3 + b.r * 2, 1);
    });

    // ---------- Riesenblumen (bunte Scheiben auf den Wiesen) ----------
    const blumen = [];
    for (let i = 0; i < thema.deko.blumen / 6; i++) {
      const st = stelleSuchen(strecke, rnd, b2 + 9, 110, b2 + 8, 10, 1.3);
      if (!st) continue;
      for (let k = 0; k < 6; k++) {
        const x = st.x + (rnd() - 0.5) * 10, z = st.z + (rnd() - 0.5) * 10;
        if (istFrei(strecke, x, z, b2 + 6.5)) blumen.push({ x, z, y: strecke.bodenHoehe(x, z), winkel: rnd() * 6.28 });
      }
    }
    const blumenGeo = new THREE.CircleGeometry(1, 6); blumenGeo.rotateX(-Math.PI / 2);
    instanzMesh(gruppe, 'Blumen', blumenGeo, new THREE.MeshLambertMaterial({
      color: 0xffffff, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }), blumen, (b, d, f) => {
      const g = 1.2 + rnd() * 1.8;
      d.position.set(b.x, b.y + 0.06, b.z);
      d.rotation.set(0, b.winkel, 0);
      d.scale.set(g, 1, g);
      farbeAus(f, [0xff5fa2, 0xffffff, 0xffe14a, 0xb68cff, 0x6fd0ff, 0xff9f43]);
    });

    // ---------- Großer Regenbogen hinter der Start-Geraden (Blickrichtung beim Start) ----------
    const start = sp.punktBei(0), rx = mitte.x, rz = mitte.z;
    // Lage: in Startrichtung hinter der Strecke, quer zur Startrichtung ausgerichtet
    let fern = 0;
    sp.punkte.forEach((p) => { fern = Math.max(fern, (p.x - mitte.x) * start.tx + (p.z - mitte.z) * start.tz); });
    const bx = rx + start.tx * (fern + 150), bz = rz + start.tz * (fern + 150);
    const bogen = new THREE.Mesh(regenbogenGeo(130, 4.5, thema.regenbogen), new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.8 }));
    bogen.position.set(bx, strecke.gelaendeHoehe(bx, bz) - 6, bz);
    bogen.rotation.y = Math.atan2(-start.tx, -start.tz);
    bogen.name = 'Regenbogen';
    gruppe.add(bogen);
    return { pilze: pilze.reduce((s, l) => s + l.length, 0), zuckerbaeume: baeume.length, huegel: huegel.length, ballons: ballons.length, blumen: blumen.length, regenbogen: 1 };
  }

  // ------------------------------------------------------------------ Runde 4: Jahreszeiten

  /**
   * Farbvarianten einer Jahreszeit für ein Thema (aus config.jahreszeiten; Wüste: Winter-Ausnahme).
   * null = nichts ändern (Sommer, oder Thema ohne Bäume wie Wüste/Fantasie bei den Bäumen).
   * @returns {{laub:number[]|null, bluete:number[]|null, bluetenAnteil:number, tanneMisch, buschMisch, bodenMisch, randSchnee}|null}
   */
  function jahreszeitFarben(themaName, jahreszeit) {
    const J = R.config.jahreszeiten;
    if (!J || !jahreszeit || !J[jahreszeit]) return null;
    let d = J[jahreszeit];
    if (d[themaName]) d = Object.assign({}, d, d[themaName]);
    const baeume = themaName === 'wiese' || themaName === 'wald';    // Wüste/Fantasie: eigene Pflanzen bleiben
    const f = {
      laub: baeume ? d.laub : null, bluete: baeume ? d.bluete : null, bluetenAnteil: d.bluetenAnteil || 0,
      tanneMisch: baeume ? d.tanneMisch : null, buschMisch: baeume ? d.buschMisch : null,
      bodenMisch: d.bodenMisch || null, randSchnee: !!d.randSchnee,
    };
    return (f.laub || f.tanneMisch || f.buschMisch || f.bodenMisch || f.randSchnee) ? f : null;
  }

  /**
   * Deko nachträglich jahreszeitlich färben (Bäume, Tannen, Büsche/Farne). Eigener Zufall →
   * die Platzierung (Haupt-Zufall) bleibt exakt gleich. Erkennung über Mesh-Namen/Materialfarbe.
   */
  function jahreszeitFaerben(gruppe, f, seed) {
    const rnd = zufall(seed ^ 0x9e3779b9);
    const c = new THREE.Color(), weiss = new THREE.Color(0xffffff);
    const istGruen = (a, i) => a[i + 1] > a[i] * 1.05 && a[i + 1] > a[i + 2];
    const kronenNeutral = (geo) => {      // grüne Vertex-Farben (Kronen) → hellgrau, Stamm bleibt
      const col = geo.attributes.color; if (!col || geo.userData.jzNeutral) return;
      const a = col.array;
      for (let i = 0; i < a.length; i += 3) if (istGruen(a, i)) { const h = 0.82 + 0.18 * a[i + 1] / Math.max(a[i + 1], 0.3); a[i] = a[i + 1] = a[i + 2] = Math.min(1, h); }
      col.needsUpdate = true; geo.userData.jzNeutral = true;
    };
    const gruenMischen = (geo, ziel, anteil) => {
      const col = geo.attributes.color; if (!col || geo.userData.jzGemischt) return;
      const a = col.array, z = new THREE.Color(ziel);
      for (let i = 0; i < a.length; i += 3) if (istGruen(a, i)) { a[i] += (z.r - a[i]) * anteil; a[i + 1] += (z.g - a[i + 1]) * anteil; a[i + 2] += (z.b - a[i + 2]) * anteil; }
      col.needsUpdate = true; geo.userData.jzGemischt = true;
    };
    gruppe.children.forEach((m) => {
      if (!m.isInstancedMesh) return;
      const mat = m.material, hex = mat.color ? mat.color.getHex() : 0xffffff;
      let art = null;
      if (m.name === 'Laubbaeume' || m.name === 'Baumtunnel' || (m.name === 'Baeume' && hex === 0x3f7f2a)) art = 'laub';
      else if (m.name === 'Tannen' || (m.name === 'Baeume' && hex === 0x2d5e33)) art = 'tanne';
      else if (m.name === 'Buesche' || m.name === 'Farne') art = 'busch';
      if (art === 'laub' && f.laub) {
        if (mat.vertexColors) kronenNeutral(m.geometry); else mat.color.setHex(0xffffff);
        for (let i = 0; i < m.count; i++) {
          const liste = f.bluete && rnd() < f.bluetenAnteil ? f.bluete : f.laub;
          c.setHex(liste[Math.floor(rnd() * liste.length)]).multiplyScalar(0.92 + rnd() * 0.08);
          m.setColorAt(i, c);
        }
        if (m.instanceColor) m.instanceColor.needsUpdate = true;
      } else if (art === 'tanne' && f.tanneMisch) {
        if (mat.vertexColors) gruenMischen(m.geometry, f.tanneMisch[0], f.tanneMisch[1]);
        else mat.color.lerp(c.setHex(f.tanneMisch[0]), f.tanneMisch[1]);
        // Instanz-Tönung (grünlich) zur Hälfte Richtung Weiß, sonst bleibt der Schnee grün
        for (let i = 0; i < m.count; i++) { m.getColorAt(i, c); c.lerp(weiss, 0.5); m.setColorAt(i, c); }
        if (m.instanceColor) m.instanceColor.needsUpdate = true;
      } else if (art === 'busch' && f.buschMisch) {
        mat.color.lerp(c.setHex(f.buschMisch[0]), f.buschMisch[1]);
        if (f.randSchnee) {   // Winter (Schnee): Instanzfarben aufhellen
          for (let i = 0; i < m.count; i++) { m.getColorAt(i, c); c.lerp(weiss, 0.6); m.setColorAt(i, c); }
          if (m.instanceColor) m.instanceColor.needsUpdate = true;
        }
      }
    });
  }

  /**
   * Baut alle Deko-Objekte eines Themas als THREE.Group.
   * Runde 4: jahreszeit (optional, Standard/sommer = unverändert) färbt Bäume/Büsche um.
   */
  function dekoBauen(themaName, strecke, jahreszeit) {
    const thema = themes[themaName] || themes.wiese;
    const rnd = zufall(textSeed(strecke.id || 'strecke') ^ thema.seed);
    const gruppe = new THREE.Group();
    gruppe.name = 'Deko ' + themaName;
    const bauer = { wiese: wieseDeko, wald: waldDeko, wueste: wuesteDeko, fantasie: fantasieDeko }[themaName] || wieseDeko;
    const anzahl = bauer(gruppe, thema, strecke, rnd);
    // Instanzen bewegen sich nicht: Begrenzungskugeln einmal berechnen
    gruppe.children.forEach((m) => {
      if (m.isInstancedMesh) {
        m.instanceMatrix.needsUpdate = true;
        if (m.instanceColor) m.instanceColor.needsUpdate = true;
        m.computeBoundingSphere();
      }
    });
    gruppe.userData.anzahl = anzahl;
    const jzFarben = jahreszeitFarben(themaName, jahreszeit);
    if (jzFarben) jahreszeitFaerben(gruppe, jzFarben, textSeed(strecke.id || 'strecke') ^ thema.seed);
    gruppe.userData.jahreszeit = jahreszeit || null;
    return gruppe;
  }

  /**
   * Großes InstancedMesh in Stücke nach Regionen teilen (Raster zellen×zellen über die
   * Instanz-Positionen). Jedes Stück bekommt seine eigene Begrenzungskugel, damit das
   * Frustum-Culling je Stück greift – bei zwei Kameras zeichnet jede nur, was sie sieht.
   * Geometrie und Material werden geteilt. Die Stücke ersetzen das Original im selben
   * Elternobjekt und tragen denselben Namen (userData.stueck = Nummer).
   */
  function instanzenAufteilen(m, zellen) {
    const g = m.geometry, n = m.count;
    const triJe = (g.index ? g.index.count : g.attributes.position.count) / 3;
    if (!m.parent || n < 40 || triJe * n < 8000 || zellen < 2) return [m];
    const m4 = new THREE.Matrix4(), xs = new Float32Array(n), zs = new Float32Array(n);
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (let i = 0; i < n; i++) {
      m.getMatrixAt(i, m4);
      xs[i] = m4.elements[12]; zs[i] = m4.elements[14];
      x0 = Math.min(x0, xs[i]); x1 = Math.max(x1, xs[i]); z0 = Math.min(z0, zs[i]); z1 = Math.max(z1, zs[i]);
    }
    const zelle = (v, lo, hi) => Math.min(zellen - 1, Math.floor((v - lo) / Math.max(1e-6, hi - lo) * zellen));
    const listen = [];
    for (let i = 0; i < n; i++) {
      const k = zelle(xs[i], x0, x1) + zellen * zelle(zs[i], z0, z1);
      (listen[k] || (listen[k] = [])).push(i);
    }
    const eltern = m.parent, stuecke = [], farbe = new THREE.Color();
    listen.forEach((liste) => {
      if (!liste || !liste.length) return;
      const s = new THREE.InstancedMesh(g, m.material, liste.length);
      liste.forEach((i, j) => {
        m.getMatrixAt(i, m4); s.setMatrixAt(j, m4);
        if (m.instanceColor) { m.getColorAt(i, farbe); s.setColorAt(j, farbe); }
      });
      s.name = m.name;
      s.userData = Object.assign({}, m.userData, { stueck: stuecke.length });
      s.renderOrder = m.renderOrder;
      s.frustumCulled = true;
      s.position.copy(m.position); s.quaternion.copy(m.quaternion); s.scale.copy(m.scale);
      s.instanceMatrix.needsUpdate = true;
      if (s.instanceColor) s.instanceColor.needsUpdate = true;
      s.computeBoundingSphere();
      eltern.add(s);
      stuecke.push(s);
    });
    eltern.remove(m);   // Original wurde nie gezeichnet → keine GPU-Daten; der Rest räumt der GC weg
    return stuecke;
  }

  /**
   * Statische Gruppe (Strecke, Deko) für das Zeichnen vorbereiten:
   * große InstancedMeshes in Regionen teilen und Matrizen einfrieren
   * (matrixAutoUpdate = false – sie bewegen sich nie).
   */
  function statischVorbereiten(gruppe, zellen) {
    if (zellen === undefined) zellen = (R.config.grafik && R.config.grafik.dekoZellen) || 1;
    const gross = [];
    gruppe.traverse((o) => { if (o.isInstancedMesh) gross.push(o); });
    gross.forEach((m) => instanzenAufteilen(m, zellen));
    gruppe.traverse((o) => { o.updateMatrix(); o.matrixAutoUpdate = false; });
    gruppe.updateMatrixWorld(true);
    return gruppe;
  }

  themes.dekoBauen = dekoBauen;
  themes.jahreszeitFarben = jahreszeitFarben;
  themes.instanzenAufteilen = instanzenAufteilen;
  themes.statischVorbereiten = statischVorbereiten;
  themes.zufall = zufall;
  R.themes = themes;
})();
