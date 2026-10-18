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
// Runde 5b: Thema 'dino' (Urwald am Vulkan): Urwaldbäume ('Laubbaeume'), Palmen, Riesenfarne, Farne, Vulkangestein,
// Knochen + Skelette, 9 Deko-Dinos (themes.dinoTeile/dinoGeo, auch für die laufenden Dinos in dynamik.js),
// Vulkan mit Rauch als Horizont-Kulisse (je Kamera in der Sichtweite gezeichnet) und ein glühender Lavasee.
// Jahreszeiten wie Wald.
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
      laternen: true,            // Runde 6: Straßenlaternen bei Nacht
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
      laternen: true,            // Runde 6: Straßenlaternen bei Nacht
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
    // Runde 5b: Urwald am Vulkan (Dino-Strecke). Jahreszeiten wie Wald (Urwaldbäume = 'Laubbaeume', Farne = 'Farne').
    dino: {
      name: 'Dino',
      boden: 0x4c7a2a,           // sattes Urwald-Grün
      boden2: 0x5e6a2c,          // moosig-erdige Flecken
      himmel: 0xc3cfae,          // dunstig, leicht gelblich (Vulkan-Dunst)
      nebel: 0xc8c9a6,
      sichtweite: 380,
      lichtHimmel: 0xf4f0d8,
      lichtBoden: 0x34461e,
      sonnenFarbe: 0xffecc4,
      sonnenIntensitaet: 1.0,
      asphalt: 0x3f3c38,
      zaun: { latten: 0x6b4a2a, pfosten: 0x47301a },   // Holzzaun aus Ästen
      seed: 53,
      deko: { bandAbstand: 3.2, fernBaeume: 420, palmen: 260, riesenfarne: 150, farne: 340, felsen: 110,
        knochen: 60, skelette: 7, dinos: { langhals: 3, dreihorn: 3, zweibeiner: 3 } },
      vulkan: { richtung: 0.12, abstand: 1300, hoehe: 610, radius: 860 },   // W2-C1: größer (vorher 470/700). Kulisse: richtung 0 = Startrichtung (rad, + = rechts)
    },
    // Runde 6 (W4-I): Alpen – Almwiesen, Nadelwald, Kühe, Almhütten, Gipfelkreuz am Pass, Bergsee im Tal,
    // Felsen; am Horizont ein Kranz aus Schneegipfeln (große Low-Poly-Kegel, Kulisse wie der Vulkan). Jahreszeiten wie Wald.
    alpen: {
      name: 'Alpen',
      boden: 0x67a546,           // sattes Almgrün
      boden2: 0x93b956,          // hellere Almflecken
      himmel: 0x8ec9f5,          // klares Bergblau
      nebel: 0xb9d9f0,           // blauer Dunst
      sichtweite: 560,
      lichtHimmel: 0xeaf5ff,
      lichtBoden: 0x4d7a32,
      sonnenFarbe: 0xfff6e2,
      sonnenIntensitaet: 1.18,
      laternen: true,            // Straßenlaternen bei Nacht
      asphalt: 0x45474b,
      fels: 0x8d8981,            // steile Böschung (trackBuilder._boeschungBauen)
      zaun: { latten: 0x8a6a44, pfosten: 0x5a4028 },   // Holzzaun (Weidezaun)
      seed: 61,
      deko: { bandAbstand: 5, fernBaeume: 520, waeldchen: 14, buesche: 160, kuehe: 9, huetten: 4, blumen: 600, felsen: 150 },
      berge: { anzahl: 22, seed: 4242 },   // Schneegipfel-Kranz am Horizont
      bergFarben: { unten: [0x6f7a62, 0x7d8670], mitte: [0x8a8680, 0x7a766f], oben: [0xf3f6f8, 0xe2e8ee] },   // Bergmassiv über dem Tunnel
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

  // ------------------------------------------------------------------ Formel 1 (v29 F3)
  /**
   * Formel-1-Strecke (Katalog formel1, Thema wiese): weite, freie Fläche statt Wiesen-Idylle – nur Wäldchen und Baumreihen
   * weit hinter Bande und Tribünen (ab zaunAbstand + 14 m), Büsche am Horizont, keine Kühe/Heuballen/Blumen/Teich.
   * Nichts davon liegt zwischen Straße und Bande (keine Pflanzen-Kollider). Rein deterministisch (Seed je Strecke).
   */
  function formel1Deko(gruppe, thema, strecke, rnd) {
    const b2 = strecke.breite / 2, frei = b2 + (strecke.zaunAbstand || 12) + 14;
    const mitte = streckenMitte(strecke);
    const stammGeo = new THREE.CylinderGeometry(0.25, 0.35, 1, 6); stammGeo.translate(0, 0.5, 0);
    const kroneRundGeo = new THREE.IcosahedronGeometry(1, 0);
    const kroneKegelGeo = new THREE.ConeGeometry(1, 1, 7); kroneKegelGeo.translate(0, 0.5, 0);
    const stammMat = new THREE.MeshLambertMaterial({ color: 0x6b4a2b });
    const laubMat = new THREE.MeshLambertMaterial({ color: 0x3f7f2a, flatShading: true });
    const tanneMat = new THREE.MeshLambertMaterial({ color: 0x2d5e33, flatShading: true });
    const baeume = [], zentren = [];
    for (let i = 0; i < 10; i++) { const st = stelleSuchen(strecke, rnd, frei + 10, 260, frei + 10, 40); if (st) zentren.push(st); }
    for (let i = 0; i < 170; i++) {
      let st = null;
      if (zentren.length) {
        const w = zentren[Math.floor(rnd() * zentren.length)];
        for (let v = 0; v < 8 && !st; v++) {
          const x = w.x + (rnd() - 0.5) * 70, z = w.z + (rnd() - 0.5) * 70;
          if (istFrei(strecke, x, z, frei)) st = { x, z, y: strecke.bodenHoehe(x, z), winkel: rnd() * Math.PI * 2 };
        }
      }
      if (!st) continue;
      st.tanne = rnd() < 0.3; st.groesse = 0.8 + rnd() * 0.6; baeume.push(st);
    }
    for (let i = 0; i < 220; i++) {
      const st = stelleSuchen(strecke, rnd, 170, 440, 140, 10, 1);
      if (!st || !aufBoden(mitte, st.x, st.z)) continue;
      st.tanne = rnd() < 0.4; st.groesse = 1.0 + rnd() * 0.7; baeume.push(st);
    }
    const laub = baeume.filter(b => !b.tanne), tannen = baeume.filter(b => b.tanne);
    instanzMesh(gruppe, 'Baeume', stammGeo, stammMat, baeume, (b, d) => {
      const g = b.groesse; d.position.set(b.x, b.y - 0.1, b.z); d.rotation.set(0, b.winkel, 0); d.scale.set(g, (b.tanne ? 1.6 : 2.6) * g, g);
    });
    instanzMesh(gruppe, 'Baeume', kroneRundGeo, laubMat, laub, (b, d, f) => {
      const g = b.groesse; d.position.set(b.x, b.y + 2.6 * g + 1.6 * g, b.z); d.rotation.set(rnd() * 0.5, b.winkel, rnd() * 0.5);
      d.scale.set(2.6 * g, 2.3 * g, 2.6 * g); f.setHSL(0.26 + rnd() * 0.06, 0.5, 0.75 + rnd() * 0.25);
    });
    instanzMesh(gruppe, 'Baeume', kroneKegelGeo, tanneMat, tannen, (b, d, f) => {
      const g = b.groesse; d.position.set(b.x, b.y + 1.2 * g, b.z); d.rotation.set(0, b.winkel, 0);
      d.scale.set(2.2 * g, 7 * g, 2.2 * g); f.setHSL(0.33, 0.3, 0.8 + rnd() * 0.2);
    });
    const buesche = [];
    for (let i = 0; i < 60; i++) { const st = stelleSuchen(strecke, rnd, frei, 200, frei); if (st) buesche.push(st); }
    instanzMesh(gruppe, 'Buesche', new THREE.IcosahedronGeometry(1, 0), new THREE.MeshLambertMaterial({ color: 0x4d8f30, flatShading: true }), buesche, (b, d, f) => {
      const g = 0.8 + rnd() * 1.0; d.position.set(b.x, b.y + 0.35 * g, b.z); d.rotation.set(0, b.winkel, 0);
      d.scale.set(1.4 * g, 0.9 * g, 1.2 * g); f.setHSL(0.25 + rnd() * 0.08, 0.55, 0.7 + rnd() * 0.3);
    });
    return { baeume: baeume.length, buesche: buesche.length, heuballen: 0, kuehe: 0, blumen: 0, teich: false };
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

  // ------------------------------------------------------------------ Dino (Runde 5b)

  /** Ellipsoid (Low-Poly-Kugel) mit Halbachsen rx/ry/rz an (x, y, z). */
  function ellipsoid(rx, ry, rz, x, y, z, seg) {
    const g = new THREE.SphereGeometry(1, seg || 10, Math.max(5, Math.round((seg || 10) * 0.7)));
    g.scale(rx, ry, rz); g.translate(x, y, z);
    return g;
  }

  /** Zylinder/Kegelstumpf von Punkt a nach b (Radius r0 bei a, r1 bei b). */
  function zylinderZwischen(a, b, r0, r1, seg) {
    const va = new THREE.Vector3(a[0], a[1], a[2]), vb = new THREE.Vector3(b[0], b[1], b[2]);
    const d = vb.clone().sub(va), len = d.length();
    const g = new THREE.CylinderGeometry(r1, r0, len, seg || 7);
    g.translate(0, len / 2, 0);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()));
    g.translate(a[0], a[1], a[2]);
    return g;
  }

  /**
   * Low-Poly-Dinos (generische Formen aus Kugeln/Zylindern/Kegeln, keine Film- oder Markenfiguren).
   * Blickrichtung +x, Ursprung am Boden unter der Körpermitte.
   * @param {'dreihorn'|'langhals'|'zweibeiner'} art
   * @returns {{koerper:THREE.BufferGeometry, bein:THREE.BufferGeometry, huefte:number[][], beinLaenge:number, laenge:number, breite:number}}
   *   bein: ein Bein, Ursprung an der Hüfte, hängt nach −y (für die Lauf-Animation drehbar um z).
   */
  function dinoTeile(art) {
    const t = [], add = (geo, farbe) => t.push({ geo, farbe });
    let huefte, beinL, beinR, beinFarbe, laenge, breite;
    if (art === 'langhals') {
      const haut = 0x7f9c62, bauch = 0xc9c79a;
      add(ellipsoid(3.0, 1.9, 1.7, 0, 4.1, 0, 12), haut);
      add(ellipsoid(2.6, 1.3, 1.45, 0, 3.5, 0, 10), bauch);
      // Hals in drei Stücken nach vorn oben, dann Kopf
      const hals = [[2.2, 4.6, 0], [3.6, 6.6, 0], [4.6, 8.6, 0], [5.2, 10.2, 0]];
      for (let k = 0; k < 3; k++) add(zylinderZwischen(hals[k], hals[k + 1], 0.85 - k * 0.15, 0.7 - k * 0.15, 8), haut);
      add(ellipsoid(0.9, 0.5, 0.48, 5.75, 10.35, 0, 8), haut);
      [-1, 1].forEach(sg => add(ellipsoid(0.1, 0.1, 0.1, 6.15, 10.55, 0.36 * sg, 5), 0x1a1a1a));
      // Schwanz nach hinten unten, spitz
      add(zylinderZwischen([-2.6, 4.2, 0], [-5.4, 3.4, 0], 0.95, 0.5, 8), haut);
      add(zylinderZwischen([-5.4, 3.4, 0], [-8.6, 2.2, 0], 0.5, 0.06, 7), haut);
      // Rückenflecken
      [[-1.2, 5.85], [0.3, 6.0], [1.6, 5.6]].forEach(([x, y]) => add(ellipsoid(0.55, 0.12, 0.6, x, y, 0, 6), 0x5f7a46));
      huefte = [[1.9, 3.1, 1.0], [1.9, 3.1, -1.0], [-1.9, 3.1, 1.0], [-1.9, 3.1, -1.0]];
      beinL = 3.1; beinR = 0.55; beinFarbe = 0x6f8c55; laenge = 15; breite = 3.4;
    } else if (art === 'zweibeiner') {
      const haut = 0xb07a3a;
      const rumpf = ellipsoid(1.05, 0.55, 0.45, 0, 0, 0, 9); rumpf.rotateZ(0.3); rumpf.translate(0, 1.55, 0); add(rumpf, haut);
      add(ellipsoid(0.55, 0.36, 0.32, 1.25, 2.35, 0, 8), haut);
      add(ellipsoid(0.32, 0.12, 0.26, 1.55, 2.2, 0, 6), 0xd9c08a);
      [-1, 1].forEach(sg => add(ellipsoid(0.07, 0.07, 0.07, 1.55, 2.48, 0.24 * sg, 4), 0x1a1a1a));
      add(zylinderZwischen([-0.8, 1.35, 0], [-2.6, 1.1, 0], 0.32, 0.04, 6), haut);
      [-1, 1].forEach(sg => add(zylinderZwischen([0.75, 1.75, 0.3 * sg], [1.15, 1.35, 0.35 * sg], 0.08, 0.06, 5), haut));
      [[-0.3, 1.75], [0.4, 1.95]].forEach(([x, y]) => add(ellipsoid(0.28, 0.08, 0.3, x, y, 0, 5), 0x7a4f22));   // Streifen
      huefte = [[0, 1.3, 0.3], [0, 1.3, -0.3]];
      beinL = 1.3; beinR = 0.17; beinFarbe = 0x9a6a30; laenge = 4.5; breite = 1.2;
    } else {
      // dreihorn
      const haut = 0x7f8f4c, bauch = 0xbab27a;
      add(ellipsoid(2.3, 1.25, 1.2, 0, 1.95, 0, 12), haut);
      add(ellipsoid(2.0, 0.9, 1.0, 0, 1.55, 0, 10), bauch);
      add(ellipsoid(0.95, 0.75, 0.72, 2.55, 1.8, 0, 9), haut);
      const schnabel = new THREE.ConeGeometry(0.36, 0.75, 7); schnabel.rotateZ(-Math.PI / 2); schnabel.translate(3.55, 1.55, 0); add(schnabel, 0x5d5a44);
      const schild = new THREE.CylinderGeometry(1.3, 1.3, 0.2, 14); schild.rotateZ(Math.PI / 2 - 0.5); schild.translate(1.95, 2.55, 0); add(schild, 0xd9822b);
      const rand = new THREE.TorusGeometry(1.3, 0.12, 5, 14); rand.rotateY(Math.PI / 2); rand.rotateZ(-0.5); rand.translate(1.95, 2.55, 0); add(rand, 0x9a4e1a);
      [-1, 1].forEach((sg) => {
        const horn = new THREE.ConeGeometry(0.17, 1.35, 6); horn.rotateZ(-1.1); horn.translate(3.05, 2.45, 0.34 * sg); add(horn, 0xf2ead2);
        add(ellipsoid(0.1, 0.1, 0.1, 3.0, 2.1, 0.55 * sg, 5), 0x1a1a1a);
      });
      const nase = new THREE.ConeGeometry(0.14, 0.6, 6); nase.rotateZ(-0.55); nase.translate(3.4, 2.2, 0); add(nase, 0xf2ead2);
      add(zylinderZwischen([-1.9, 2.0, 0], [-4.6, 1.3, 0], 0.65, 0.05, 7), haut);
      [[-0.8, 3.1], [0.4, 3.18]].forEach(([x, y]) => add(ellipsoid(0.5, 0.12, 0.55, x, y, 0, 6), 0x66753c));
      huefte = [[1.35, 1.45, 0.78], [1.35, 1.45, -0.78], [-1.35, 1.45, 0.78], [-1.35, 1.45, -0.78]];
      beinL = 1.45; beinR = 0.34; beinFarbe = 0x6d7c40; laenge = 8.2; breite = 2.6;
    }
    const bein = vereinen([{ geo: zylinderZwischen([0, 0, 0], [0, -beinL + beinR * 0.4, 0], beinR, beinR * 0.85, 7), farbe: beinFarbe },
      { geo: ellipsoid(beinR * 1.25, beinR * 0.5, beinR * 1.1, beinR * 0.35, -beinL + beinR * 0.45, 0, 7), farbe: beinFarbe }]);
    return { koerper: vereinen(t), bein, huefte, beinLaenge: beinL, laenge, breite };
  }

  /** Ganzer Dino als EINE Geometrie (Beine in Ruhestellung) – für die Deko-Dinos. */
  function dinoGeo(art) {
    const d = dinoTeile(art);
    // vereinen() färbt einheitlich – darum Vertex-Farben der Teile direkt zusammenkopieren
    const geos = [d.koerper].concat(d.huefte.map(h => { const b = d.bein.clone(); b.translate(h[0], h[1], h[2]); return b; }));
    const n = geos.reduce((s, g) => s + g.attributes.position.count, 0);
    const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), col = new Float32Array(n * 3);
    let o = 0;
    geos.forEach((g) => {
      pos.set(g.attributes.position.array, o * 3); nor.set(g.attributes.normal.array, o * 3); col.set(g.attributes.color.array, o * 3);
      o += g.attributes.position.count;
    });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geos.forEach(g => g.dispose()); d.bein.dispose();
    return geo;
  }

  /** Riesenfarn: 9 lange, gebogene Wedel aus der Mitte (Ursprung am Boden, ~3 m hoch). */
  function riesenfarnGeo() {
    const teile = [];
    for (let i = 0; i < 9; i++) {
      const w = i / 9 * Math.PI * 2, steil = 0.55 + (i % 3) * 0.18;
      // Wedel aus zwei flachen Kegeln: steil nach oben, dann überhängend
      const a = new THREE.ConeGeometry(0.45, 2.2, 4); a.scale(1, 1, 0.22); a.translate(0, 1.1, 0); a.rotateZ(-steil);
      const ax = Math.sin(steil) * 2.2, ay = Math.cos(steil) * 2.2;
      const b = new THREE.ConeGeometry(0.38, 1.9, 4); b.scale(1, 1, 0.22); b.translate(0, 0.95, 0); b.rotateZ(-steil - 0.9); b.translate(ax * 0.92, ay * 0.92, 0);
      a.rotateY(w); b.rotateY(w);
      teile.push({ geo: a, farbe: i % 2 ? 0x3e7f2e : 0x4a8e34 }, { geo: b, farbe: i % 2 ? 0x4f9a3a : 0x5aa540 });
    }
    const mitte = new THREE.ConeGeometry(0.35, 0.8, 6); mitte.translate(0, 0.4, 0); teile.push({ geo: mitte, farbe: 0x5a4a2a });
    return vereinen(teile);
  }

  /** Knochen (~1 m): Schaft + je zwei Knubbel an den Enden, liegt flach (Achse x). */
  function knochenGeo() {
    const schaft = zylinderZwischen([-0.45, 0.12, 0], [0.45, 0.12, 0], 0.08, 0.08, 6);
    const teile = [{ geo: schaft, farbe: 0xeee6cf }];
    [-0.5, 0.5].forEach(x => [-0.07, 0.07].forEach(z => teile.push({ geo: ellipsoid(0.12, 0.11, 0.11, x, 0.12, z, 6), farbe: 0xf4ecd6 })));
    return vereinen(teile);
  }

  /** Dino-Skelett (~7 m, halb im Boden): Wirbelsäule, Rippenbögen, Schädel mit Hörnchen, Schwanzwirbel. */
  function skelettGeo() {
    const teile = [], hell = 0xf1e9d2, dunkel = 0xd8cdb0;
    const ruecken = [[-3.4, 0.4], [-2.2, 0.9], [-0.8, 1.35], [0.6, 1.5], [1.9, 1.3], [2.9, 1.0]];
    for (let k = 0; k < ruecken.length - 1; k++) teile.push({ geo: zylinderZwischen([ruecken[k][0], ruecken[k][1], 0], [ruecken[k + 1][0], ruecken[k + 1][1], 0], 0.13, 0.13, 6), farbe: hell });
    ruecken.forEach(([x, y]) => teile.push({ geo: ellipsoid(0.2, 0.18, 0.18, x, y, 0, 6), farbe: dunkel }));
    for (let i = 0; i < 6; i++) {
      const x = -1.4 + i * 0.55, y = 1.4 - Math.abs(x - 0.2) * 0.12;
      const r = new THREE.TorusGeometry(1.05 - Math.abs(i - 2.5) * 0.08, 0.07, 4, 10, Math.PI);
      r.rotateZ(Math.PI); r.rotateY(Math.PI / 2); r.scale(1, 1.15, 1); r.translate(x, y, 0);
      teile.push({ geo: r, farbe: hell });
    }
    teile.push({ geo: ellipsoid(0.75, 0.48, 0.45, 3.7, 0.75, 0, 8), farbe: hell });          // Schädel
    teile.push({ geo: ellipsoid(0.13, 0.13, 0.1, 3.95, 0.92, 0.36, 5), farbe: 0x2a2620 });
    teile.push({ geo: ellipsoid(0.13, 0.13, 0.1, 3.95, 0.92, -0.36, 5), farbe: 0x2a2620 });
    const zahn = new THREE.ConeGeometry(0.1, 0.4, 5); zahn.rotateZ(Math.PI); zahn.translate(4.15, 0.42, 0.18); teile.push({ geo: zahn, farbe: hell });
    const zahn2 = new THREE.ConeGeometry(0.1, 0.4, 5); zahn2.rotateZ(Math.PI); zahn2.translate(4.15, 0.42, -0.18); teile.push({ geo: zahn2, farbe: hell });
    teile.push({ geo: zylinderZwischen([-3.4, 0.4, 0], [-5.6, 0.05, 0.3], 0.1, 0.04, 5), farbe: hell });
    return vereinen(teile);
  }

  /** Vulkan (Einheitsmaße: Fuß-Radius 1, Höhe 1): unregelmäßiger Kegel mit Krater, Lava-Rinnen (Vertex-Farben). */
  function vulkanGeo(dunst, dunstAnteil) {
    const N = 40, M = 14, pos = [], col = [], c = new THREE.Color(), d = new THREE.Color(dunst);
    const profil = (u) => 0.09 + 0.91 * Math.pow(1 - u, 1.55);           // Radius über der Höhe (u 0..1)
    const punkt = (j, k) => {
      const w = j / N * Math.PI * 2, u = k / M;
      const rau = 1 + 0.07 * Math.sin(w * 3 + 1.3) + 0.045 * Math.sin(w * 7 + 0.4) + 0.03 * Math.sin(w * 13);
      return [Math.cos(w) * profil(u) * rau, u, Math.sin(w) * profil(u) * rau];
    };
    const farbe = (j, k) => {
      const u = k / M;
      c.setHex(u < 0.3 ? 0x5e5246 : u < 0.75 ? 0x4a4038 : 0x3a322d);
      // Lava-Rinnen: schmale Streifen von oben bis ca. halbe Höhe, unten verglimmend
      const rinne = (j % 10 === 3 || j % 10 === 4) || (j % 17 === 9);
      if (rinne && u > 0.35) c.lerp(new THREE.Color(u > 0.85 ? 0xffb347 : 0xff6a12), Math.min(1, (u - 0.35) * 2.2));
      if (k === M) c.setHex(0xffa040);                                    // glühender Kraterrand
      return c.lerp(d, rinne && u > 0.35 ? dunstAnteil * 0.35 : dunstAnteil).toArray();
    };
    for (let k = 0; k < M; k++) {
      for (let j = 0; j < N; j++) {
        const a = punkt(j, k), b = punkt(j + 1, k), e = punkt(j + 1, k + 1), f = punkt(j, k + 1);
        const fa = farbe(j, k), fe = farbe(j, k + 1);
        pos.push(...a, ...e, ...b, ...a, ...f, ...e);
        col.push(...fa, ...fe, ...fa, ...fa, ...fe, ...fe);
      }
    }
    // Krater: Trichter nach innen-unten, Boden glüht
    for (let j = 0; j < N; j++) {
      const a = punkt(j, M), b = punkt(j + 1, M), mitte = [0, 0.93, 0];
      pos.push(...a, ...b, ...mitte);
      const fr = new THREE.Color(0xff7a1a).lerp(d, dunstAnteil * 0.2).toArray(), fm = new THREE.Color(0xffd070).toArray();
      col.push(...fr, ...fr, ...fm);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
    geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(col), 3));
    geo.computeVertexNormals();
    return geo;
  }

  let rauchTex = null;
  /** Weicher runder Fleck (Rauchwolke). */
  function rauchTextur() {
    if (rauchTex || typeof document === 'undefined') return rauchTex;
    const cv = document.createElement('canvas'); cv.width = cv.height = 64;
    const g = cv.getContext('2d'), grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, 'rgba(255,255,255,1)'); grad.addColorStop(0.5, 'rgba(255,255,255,0.65)'); grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad; g.fillRect(0, 0, 64, 64);
    rauchTex = new THREE.CanvasTexture(cv);
    return rauchTex;
  }
  const uhr = () => (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000;

  /**
   * Vulkan am Horizont: steht „virtuell" weit draußen (abstand m in Startrichtung + richtung), wird aber je Kamera
   * innerhalb der Sichtweite gezeichnet (gleicher Blickwinkel, kleiner skaliert) – darum immer sichtbar, ohne Nebel.
   * Rauchsäule: Points (wie Brand-Rauch, aber groß), Position = Funktion der Uhr.
   */
  function vulkanBauen(gruppe, thema, strecke) {
    const V = thema.vulkan, mitte = streckenMitte(strecke), st = strecke.spline.punktBei(0);
    const w = Math.atan2(st.tx, st.tz) + (V.richtung || 0);
    const vx = mitte.x + Math.sin(w) * V.abstand, vz = mitte.z + Math.cos(w) * V.abstand, vy = -8;
    const v3 = new THREE.Vector3(), sk = new THREE.Vector3(), q0 = new THREE.Quaternion(), kam = new THREE.Vector3();
    /** Weltmatrix je Kamera: Vulkan auf (kamera → Vulkan) in Entfernung D gezogen, Größe × D/Abstand. */
    const setzen = (obj, camera, groesse) => {
      kam.setFromMatrixPosition(camera.matrixWorld);
      const dx = vx - kam.x, dy = vy - kam.y, dz = vz - kam.z, d = Math.hypot(dx, dz);
      const D = Math.min(d, camera.far * 0.82), s = D / d;
      v3.set(kam.x + dx * s, kam.y + dy * s, kam.z + dz * s);
      sk.set(groesse[0] * s, groesse[1] * s, groesse[2] * s);
      obj.matrixWorld.compose(v3, q0, sk);
      return s;
    };
    // Hintergrund: ohne Tiefentest und als Erstes gezeichnet → alles andere (auch ferne Bäume/Boden im Dunst) liegt davor
    const berg = new THREE.Mesh(vulkanGeo(thema.nebel, 0.38), new THREE.MeshBasicMaterial({ vertexColors: true, fog: false, depthTest: false, depthWrite: false }));
    berg.name = 'Vulkan'; berg.frustumCulled = false; berg.renderOrder = -10;
    const masse = [V.radius, V.hoehe, V.radius];
    berg.onBeforeRender = function (r, sz, camera) {
      setzen(this, camera, masse);
      const g = themes.vulkanGlut || 0;     // Runde 6 (W2-C): beim Ausbruch rötlich glühen
      this.material.color.setRGB(1 + g * 0.35, 1 - g * 0.2, 1 - g * 0.3);
    };
    gruppe.add(berg);
    // Rauch: 70 Teilchen steigen aus dem Krater, werden breiter, heller und treiben zur Seite
    const n = 70, rnd = zufall(907), tl = [];
    for (let k = 0; k < n; k++) tl.push({ t0: rnd(), w: rnd() * Math.PI * 2, r: 0.02 + rnd() * 0.05, tempo: 0.03 + rnd() * 0.025 });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    const mat = new THREE.PointsMaterial({ size: 1, sizeAttenuation: true, map: rauchTextur(), vertexColors: true, transparent: true,
      opacity: 0.75, depthWrite: false, fog: false });
    const rauch = new THREE.Points(geo, mat);
    rauch.name = 'Vulkanrauch'; rauch.frustumCulled = false;
    const dunst = new THREE.Color(thema.nebel), c = new THREE.Color(), glutFarbe = new THREE.Color(0xff6a1a);
    rauch.onBeforeRender = function (r, sz, camera) {
      // lokale Einheiten: Vulkan-Höhe = 1 (Größe hoehe in allen Achsen → runde Wolken)
      const s = setzen(this, camera, [V.hoehe, V.hoehe, V.hoehe]), t = uhr();
      const p = this.geometry.attributes.position.array, cc = this.geometry.attributes.color.array;
      // Runde 6 (W2-C): Ausbruch (themes.vulkanGlut 0..1, dynamik.js) → Rauch dichter, dunkler, breiter, unten glühend
      const glut = themes.vulkanGlut || 0, tempo = 1 + glut * 1.6;
      for (let k = 0; k < n; k++) {
        const e = tl[k], u = (t * e.tempo * tempo + e.t0) % 1, rr = (e.r + u * 0.35) * (1 + glut * 0.6);
        p[k * 3] = Math.cos(e.w) * rr + u * u * 0.7;
        p[k * 3 + 1] = 0.97 + u * 1.15;
        p[k * 3 + 2] = Math.sin(e.w) * rr * 0.6 + u * 0.12;
        c.setRGB(0.22 + u * 0.4, 0.2 + u * 0.4, 0.19 + u * 0.42).lerp(dunst, 0.25 + u * 0.3);
        if (glut > 0) { c.multiplyScalar(1 - glut * 0.45); if (u < 0.25) c.lerp(glutFarbe, glut * (1 - u * 4) * 0.8); }
        cc[k * 3] = c.r; cc[k * 3 + 1] = c.g; cc[k * 3 + 2] = c.b;
      }
      this.geometry.attributes.position.needsUpdate = true; this.geometry.attributes.color.needsUpdate = true;
      this.material.size = V.hoehe * 0.32 * s * (1 + glut * 0.7);
      this.material.opacity = 0.75 + glut * 0.2;
    };
    gruppe.add(rauch);
    return { x: vx, z: vz };
  }

  /** Lavasee: unregelmäßige glühende Fläche mit dunkler Kruste (1 Mesh, MeshBasic, pulsiert). */
  function lavaseeBauen(gruppe, strecke, rnd, radius, sperre) {
    const zaun = hinterZaun(strecke);
    let beste = null;
    for (let v = 0; v < 160; v++) {
      const st = stelleSuchen(strecke, rnd, zaun + radius + 4, zaun + radius + 30, zaun + radius + 3, 10, 1);
      if (!st) continue;
      if (sperre && sperre(st.x, st.z, radius + 6)) continue;   // Runde 6: nicht im Berg-Massiv
      let hMin = Infinity, hMax = -Infinity;
      for (let k = 0; k <= 12; k++) {
        const w = k / 12 * Math.PI * 2, rr = k === 12 ? 0 : radius;
        const h = strecke.bodenHoehe(st.x + Math.cos(w) * rr, st.z + Math.sin(w) * rr);
        hMin = Math.min(hMin, h); hMax = Math.max(hMax, h);
      }
      // flach + nah an einer Geraden (gut sichtbar beim Vorbeifahren)
      const guete = (hMax - hMin) + Math.abs(strecke.spline.punktBei(st.s).kruemmung) * 300;
      if (!beste || guete < beste.guete) beste = Object.assign(st, { guete, hMin, hMax });
    }
    if (!beste) return null;
    const N = 36, pos = [], col = [], c = new THREE.Color();
    const rand = [];
    for (let i = 0; i < N; i++) {
      const w = i / N * Math.PI * 2;
      rand.push(radius * (0.84 + 0.12 * Math.sin(w * 3 + 0.7) + 0.06 * Math.sin(w * 5 + 2.1)));
    }
    const pt = (i, f, dy) => { const w = (i % N) / N * Math.PI * 2, r = rand[i % N] * f;
      const x = beste.x + Math.cos(w) * r, z = beste.z + Math.sin(w) * r; return [x, Math.max(strecke.bodenHoehe(x, z), beste.hMin) + dy, z]; };
    const y0 = beste.hMax + 0.25;
    const innen = (i, f) => { const p = pt(i, f, 0); p[1] = y0; return p; };
    for (let i = 0; i < N; i++) {
      // glühende Fläche: Mitte gelb, außen orange
      const m = [beste.x, y0, beste.z], a = innen(i, 0.55), b = innen(i + 1, 0.55), e = innen(i, 1), f = innen(i + 1, 1);
      const gelb = c.setHex(0xffd060).toArray(), orange = c.setHex(0xff7a18).toArray(), rot = c.setHex(0xe8480c).toArray();
      pos.push(...m, ...b, ...a); col.push(...gelb, ...orange, ...orange);
      pos.push(...a, ...b, ...f, ...a, ...f, ...e); col.push(...orange, ...orange, ...rot, ...orange, ...rot, ...rot);
      // Kruste: Ring von der Lava bis auf den Boden außen (dunkel, leicht erhaben)
      const ka = innen(i, 1), kb = innen(i + 1, 1), aa = pt(i, 1.3, 0.05), ab = pt(i + 1, 1.3, 0.05);
      ka[1] += 0.12; kb[1] += 0.12;
      const k1 = c.setHex(0x3a2a22).toArray(), k2 = c.setHex(0x2a2420).toArray();
      pos.push(...ka, ...kb, ...ab, ...ka, ...ab, ...aa); col.push(...k1, ...k1, ...k2, ...k1, ...k2, ...k2);
    }
    // Lava-Inseln (dunkle Schollen) auf der Fläche
    for (let k = 0; k < 7; k++) {
      const w = rnd() * Math.PI * 2, r = radius * (0.2 + rnd() * 0.5), sx = beste.x + Math.cos(w) * r, sz = beste.z + Math.sin(w) * r, g = 0.8 + rnd() * 1.4;
      for (let j = 0; j < 6; j++) {
        const a1 = j / 6 * Math.PI * 2, a2 = (j + 1) / 6 * Math.PI * 2;
        pos.push(sx, y0 + 0.06, sz, sx + Math.cos(a2) * g, y0 + 0.04, sz + Math.sin(a2) * g, sx + Math.cos(a1) * g, y0 + 0.04, sz + Math.sin(a1) * g);
        const k1 = c.setHex(0x4a2e20).toArray(); col.push(...k1, ...k1, ...k1);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
    geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(col), 3));
    const mat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide });
    const m = new THREE.Mesh(geo, mat);
    m.name = 'Lavasee';
    m.userData = { x: beste.x, z: beste.z, s: beste.s, radius };
    m.onBeforeRender = function () { const t = uhr(); const f = 0.86 + 0.14 * (0.5 + 0.5 * Math.sin(t * 1.7) * Math.sin(t * 0.63 + 1)); this.material.color.setRGB(1, f, f * 0.95); };
    gruppe.add(m);
    return beste;
  }

  // ------------------------------------------------------------------ Runde 6 (W2-C, C4): Berg-Massiv (Dino)

  /**
   * Berg-Massiv über den Dino-Tunneln (Katalog berg { s0, s1 }): Querschnitte alle 4 m entlang der Strecke,
   * Höhe über dem Boden = hoehe · Glocke(|q| / Q) · Hülle(s) (+ Felsrauheit). Q je Seite: bis 95 m, in Kurven innen
   * höchstens 0,8 · Radius und nie über ein anderes Streckenteil. In den Tunneln überspannt der Berg die Röhre
   * (mind. 4 m über dem Gewölbe), dazwischen bleibt eine Schlucht (Felswand ab Bande + 2 m). An jedem Portal eine
   * Stirnwand mit Loch in Tunnelform (der Steinrahmen der Röhre steht 0,6 m davor). 1 Mesh, Vertex-Farben.
   * @returns {{mesh: THREE.Mesh, drin: (x:number, z:number, rand?:number) => boolean}|null}
   */
  function bergmassivBauen(gruppe, strecke, berg, farben) {
    const sp = strecke.spline, tunnel = strecke.tunnel || [];
    if (!berg || !tunnel.length) return null;
    const HOCH = 46, W = strecke.grenzeEng + 0.35, WAND = 3.4, HT = 6.6, K = 16;
    const imTunnel = (s) => tunnel.some(t => s >= t.s0 - 1e-6 && s <= t.s1 + 1e-6);
    const huelle = (s) => {
      const a = Math.min(1, (s - berg.s0) / 45), b = Math.min(1, (berg.s1 - s) / 30);
      const h = Math.max(0, Math.min(a, b));
      return h * h * (3 - 2 * h);
    };
    // Reichweite Q(s, Seite): Kurve innen begrenzen, nie über andere Streckenteile
    const reichweite = (s, sg) => {
      const p = sp.punktBei(s), pv = sp.punktBei(s + 6), ph = sp.punktBei(s - 6);
      const kx = pv.tx - ph.tx, kz = pv.tz - ph.tz, k = Math.hypot(kx, kz) / 12;
      let Q = 95;
      if (k > 1e-4 && Math.sign(kx * p.nx + kz * p.nz) === sg) Q = Math.min(Q, 0.8 / k);
      for (let q = 12; q <= Q; q += 4) {
        const x = p.x + p.nx * q * sg, z = p.z + p.nz * q * sg, n = sp.naechster(x, z);
        const fremd = Math.abs(sp.differenzS(n.s, s)) > 60;
        if (fremd && Math.abs(n.seitenabstand) < 30) { Q = Math.max(16, q - 22); break; }
      }
      return Q;
    };
    // Querschnitte (s, tun) – an den Portalen doppelt (Schlucht-Form | Tunnel-Form)
    const liste = [];
    for (let s = berg.s0; s <= berg.s1 + 1e-6; s += 4) liste.push({ s, tun: imTunnel(s) });
    tunnel.forEach((t) => {
      if (t.s0 > berg.s0 && t.s0 < berg.s1) liste.push({ s: t.s0 - 0.05, tun: false, portal: -1, t }, { s: t.s0, tun: true });
      if (t.s1 > berg.s0 && t.s1 < berg.s1) liste.push({ s: t.s1, tun: true }, { s: t.s1 + 0.05, tun: false, portal: 1, t });
    });
    liste.sort((a, b) => a.s - b.s || (a.tun === b.tun ? 0 : 0));
    const qi = strecke.grenzeEng + 2;
    const glocke = (u) => { const v = Math.max(0, 1 - u * u); return v * Math.sqrt(v); };
    const rau = (s, q) => 2.4 * Math.sin(s * 0.071 + q * 0.13) + 1.6 * Math.sin(s * 0.19 - q * 0.21) + 1.0 * Math.sin(q * 0.5 + s * 0.05);
    const pos = [], col = [], c = new THREE.Color();
    const farbeH = (h, s, q) => {
      // unten Vulkangestein, oben Moos/Urwald, dazwischen Felsbänder
      const n = 0.5 + 0.5 * Math.sin(s * 0.11 + q * 0.17);
      if (farben) {   // W4-I (Alpen): unten Almgrün, Mitte Fels, oben Schnee
        if (h > 30 + n * 8) c.setHex(farben.oben[n > 0.5 ? 0 : 1]);
        else if (h > 9 + n * 5) c.setHex(farben.mitte[n > 0.55 ? 0 : 1]);
        else c.setHex(farben.unten[n > 0.45 ? 0 : 1]);
        return [c.r, c.g, c.b];
      }
      if (h > 26 + n * 8) c.setHex(n > 0.5 ? 0x4c6a2c : 0x587a34);
      else if (h > 12 + n * 6) c.setHex(n > 0.6 ? 0x5e5246 : 0x4f463c);
      else c.setHex(n > 0.4 ? 0x3e352d : 0x4a4038);
      return [c.r, c.g, c.b];
    };
    // Punkt des Querschnitts: q (mit Vorzeichen), Q = Reichweite dieser Seite, offen = Schlucht (Wand ab qi)
    const punkt = (e, q, Q) => {
      const p = e.p, x = p.x + p.nx * q, z = p.z + p.nz * q, boden = strecke.bodenHoehe(x, z) - 0.6;
      const u = Math.abs(q) / Q;
      let h = HOCH * glocke(u) * e.H + rau(e.s, q) * glocke(u) * e.H;
      if (!e.tun) { const w = Math.max(0, Math.min(1, (Math.abs(q) - e.qi) / 13)); h *= w * w * (3 - 2 * w); }
      let y = boden + Math.max(0, h);
      if (e.tun && Math.abs(q) < W + 18) y = Math.max(y, e.yc + HT + 4 + (W + 18 - Math.abs(q)) * 0.15);
      return { x, y, z, h: y - boden };
    };
    liste.forEach((e) => {
      e.p = sp.punktBei(e.s); e.yc = strecke.hoeheBeiS ? strecke.hoeheBeiS(e.s, 0) : strecke.hoeheAn(e.p.x, e.p.z); e.H = huelle(e.s);
      e.QL = reichweite(e.s, -1); e.QR = reichweite(e.s, 1);
      // Schlucht/Vorfeld: Felswand erst 1,5 m hinter der Bande (Trichter vor den Portalen); Tunnel: fest
      e.qi = e.tun ? qi : Math.max(qi, (strecke.grenzeBei ? strecke.grenzeBei(e.s) : 0) + 1.5);
      e.links = []; e.rechts = []; e.oben = [];
      for (let k = 0; k <= K; k++) {
        const f = k / K;
        e.links.push(punkt(e, -(e.QL - (e.QL - e.qi) * f), e.QL));     // außen → innen
        e.rechts.push(punkt(e, e.qi + (e.QR - e.qi) * f, e.QR));          // innen → außen
      }
      if (e.tun) for (let k = 0; k <= 8; k++) { const q = -qi + 2 * qi * k / 8; e.oben.push(punkt(e, q, q < 0 ? e.QL : e.QR)); }
    });
    const vier = (a, b, d, f) => {   // Viereck a-b-d-f (Reihenfolge egal: DoubleSide)
      pos.push(a.x, a.y, a.z, b.x, b.y, b.z, d.x, d.y, d.z, a.x, a.y, a.z, d.x, d.y, d.z, f.x, f.y, f.z);
      [a, b, d, a, d, f].forEach(pt => col.push(...farbeH(pt.h, pt.x, pt.z)));
    };
    for (let i = 0; i + 1 < liste.length; i++) {
      const A = liste[i], B = liste[i + 1];
      if (B.s - A.s > 8) continue;
      if (A.H < 0.01 && B.H < 0.01) continue;
      for (let k = 0; k < K; k++) { vier(A.links[k], A.links[k + 1], B.links[k + 1], B.links[k]); vier(A.rechts[k], A.rechts[k + 1], B.rechts[k + 1], B.rechts[k]); }
      if (A.tun && B.tun) for (let k = 0; k < 8; k++) vier(A.oben[k], A.oben[k + 1], B.oben[k + 1], B.oben[k]);
    }
    // Stirnwände an den Portalen: oben = Berg-Profil über der Röhre (q −qi..qi), unten = Boden + Tunnelbogen (Loch)
    liste.filter(e => e.portal).forEach((e) => {
      const tunE = liste.find(x => x.tun && Math.abs(x.s - e.s) < 0.2) || e;
      const p = e.p, yc = e.yc, boden = (q) => strecke.bodenHoehe(p.x + p.nx * q, p.z + p.nz * q) - 0.6;
      const unten = [];
      const wp = (q, y) => ({ x: p.x + p.nx * q, y, z: p.z + p.nz * q, h: 0 });
      unten.push(wp(-qi, boden(-qi)), wp(-W, boden(-W)));
      for (let k = 0; k <= 10; k++) { const th = Math.PI - k * Math.PI / 10; unten.push(wp(W * Math.cos(th), yc + WAND + (HT - WAND) * Math.sin(th))); }
      unten.push(wp(W, boden(W)), wp(qi, boden(qi)));
      // oberes Profil auf dieselbe Punktzahl bringen (gleichmäßig in q)
      const oben = unten.map((u, k) => {
        const f = k / (unten.length - 1), q = -qi + 2 * qi * f;
        const o = { p, s: e.s, tun: true, yc, H: tunE.H, qi };
        const pt = punkt(o, q, q < 0 ? tunE.QL : tunE.QR);
        return pt;
      });
      for (let k = 0; k + 1 < unten.length; k++) vier(unten[k], unten[k + 1], oben[k + 1], oben[k]);
    });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
    geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(col), 3));
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, side: THREE.DoubleSide }));
    mesh.name = 'Bergmassiv';
    gruppe.add(mesh);
    // Grundfläche (für Deko-Sperre): nächster Querschnitt + Reichweite der Seite
    const drin = (x, z, rand) => {
      const n = sp.naechster(x, z);
      if (n.s < berg.s0 - 5 || n.s > berg.s1 + 5) return false;
      const e = liste.reduce((b, x2) => (Math.abs(x2.s - n.s) < Math.abs(b.s - n.s) ? x2 : b), liste[0]);
      if (e.H < 0.05) return false;
      return Math.abs(n.seitenabstand) < (n.seitenabstand < 0 ? e.QL : e.QR) * 0.92 + (rand || 0);
    };
    return { mesh, drin };
  }

  function dinoDeko(gruppe, thema, strecke, rnd) {
    const sp = strecke.spline, L = sp.laenge, D = thema.deko;
    const grenze = dekoGrenze(strecke), zaun = hinterZaun(strecke), mitte = streckenMitte(strecke);
    // Sumpf unter der Brücke freihalten (wie Bach im Wald)
    const br = strecke.bruecke || null, bachMitte = br ? sp.punktBei((br.von + br.bis) / 2) : null;
    const amSumpf = (x, z) => {
      if (!bachMitte) return false;
      const dx = x - bachMitte.x, dz = z - bachMitte.z;
      return Math.abs(dx * bachMitte.tx + dz * bachMitte.tz) < 16 && Math.abs(dx * bachMitte.nx + dz * bachMitte.nz) < strecke.seitenabstandMax + 60;
    };
    // Runde 6 (W2-C): Berg-Massiv über den Tunneln zuerst – keine Deko darin (auch kein Lavasee)
    const massiv = bergmassivBauen(gruppe, strecke, (strecke.katalog || strecke.daten || {}).berg);
    const amBerg = (x, z, extra) => !!massiv && massiv.drin(x, z, extra || 0);
    // Lavasee zuerst (andere Deko hält Abstand)
    const lava = lavaseeBauen(gruppe, strecke, rnd, 17, amBerg);
    const amLava = (x, z, extra) => lava && Math.hypot(x - lava.x, z - lava.z) < 17 * 1.35 + (extra || 0);
    // Lichtungen: um Deko-Dinos, Skelette und zwischen Straße und Lavasee keine Bäume (sonst sieht man sie nicht)
    const lichtungen = [];
    if (lava) {
      const n = sp.naechster(lava.x, lava.z), p = sp.punktBei(n.s), sg = n.seitenabstand > 0 ? 1 : -1;
      for (let d = Math.abs(n.seitenabstand) - 30; d > 6; d -= 12) lichtungen.push({ x: p.x + p.nx * d * sg, z: p.z + p.nz * d * sg, r: 22 });
    }
    const inLichtung = (x, z) => lichtungen.some(l => (x - l.x) * (x - l.x) + (z - l.z) * (z - l.z) < l.r * l.r);
    const frei = (x, z, extra) => !amSumpf(x, z) && !amLava(x, z, extra) && !amBerg(x, z, (extra || 0) + 4);
    const freiBaum = (x, z, extra) => frei(x, z, extra) && !inLichtung(x, z);

    // ---------- Deko-Dinos (stehen hinter dem Zaun, schauen grob zur Straße) – vor den Bäumen: Lichtung ----------
    const dinoZahl = {}, alle = [], dinoListen = {};
    ['langhals', 'dreihorn', 'zweibeiner'].forEach((art) => {
      const liste = [], weit = art === 'langhals' ? 14 : art === 'dreihorn' ? 7 : 4;
      for (let i = 0; i < (D.dinos[art] || 0) * 30 && liste.length < (D.dinos[art] || 0); i++) {
        const st = stelleSuchen(strecke, rnd, zaun + weit, zaun + weit + 22, zaun + weit, 10, 1.3);
        if (!st || !frei(st.x, st.z, weit) || alle.some(o => Math.hypot(o.x - st.x, o.z - st.z) < 150)) continue;
        // Blick: zur Straße (±60°) – Kinder sollen sie von vorn/seitlich sehen
        const p = sp.punktBei(st.s), zurStrasse = Math.atan2(-(p.nz * -st.seite), (p.nx * -st.seite));
        st.drehung = zurStrasse + (rnd() - 0.5) * 2.1;
        liste.push(st); alle.push(st);
        // Lichtung um den Dino und bis zur Straße
        const r = art === 'langhals' ? 16 : 11;
        for (let d = st.d; d > zaun - 4; d -= r * 0.9) lichtungen.push({ x: p.x + p.nx * d * st.seite, z: p.z + p.nz * d * st.seite, r });
      }
      dinoZahl[art] = liste.length; dinoListen[art] = liste;
    });
    const skelette = [];
    for (let i = 0; i < D.skelette * 6 && skelette.length < D.skelette; i++) {
      const st = stelleSuchen(strecke, rnd, zaun + 4, zaun + 16, zaun + 4, 10, 1.2);
      if (!st || !frei(st.x, st.z, 6) || inLichtung(st.x, st.z) || skelette.some(o => Math.hypot(o.x - st.x, o.z - st.z) < 120)) continue;
      skelette.push(st);
      lichtungen.push({ x: st.x, z: st.z, r: 9 });
    }

    // ---------- Urwald: Band aus Urwaldbäumen + Palmen hinter dem Zaun, dazu Wald in der Ferne ----------
    const baeume = [], palmen = [];
    for (let s = 0; s < L; s += D.bandAbstand) {
      const p = sp.punktBei(s + rnd() * 2);
      [-1, 1].forEach((seite) => {
        const anzahl = 1 + (rnd() < 0.45 ? 1 : 0);
        for (let k = 0; k < anzahl; k++) {
          const d = zaun + 1 + Math.pow(rnd(), 1.3) * 45;
          const x = p.x + p.nx * d * seite, z = p.z + p.nz * d * seite;
          if (!istFrei(strecke, x, z, zaun + 0.5) || !freiBaum(x, z, 4)) continue;
          const e = { x, z, y: strecke.bodenHoehe(x, z), winkel: rnd() * Math.PI * 2, groesse: 1.0 + rnd() * 0.8 };
          (rnd() < 0.3 ? palmen : baeume).push(e);
        }
      });
    }
    for (let i = 0; i < D.fernBaeume; i++) {
      const st = stelleSuchen(strecke, rnd, 50, 280, zaun + 25, 8, 1);
      if (!st || !aufBoden(mitte, st.x, st.z) || !freiBaum(st.x, st.z, 6)) continue;
      st.groesse = 1.3 + rnd() * 0.9; baeume.push(st);
    }
    instanzMesh(gruppe, 'Laubbaeume', laubbaumGeo(), vertexMaterial(true), baeume, (b, d, f) => {
      d.position.set(b.x, b.y - 0.2, b.z);
      d.rotation.set(0, b.winkel, 0);
      d.scale.set(b.groesse * 1.25, b.groesse * (1.4 + rnd() * 0.6), b.groesse * 1.25);   // hohe Urwaldriesen
      f.setHSL(0.25 + rnd() * 0.08, 0.55, 0.6 + rnd() * 0.35);
    });
    for (let i = 0; i < D.palmen; i++) {
      const st = stelleSuchen(strecke, rnd, zaun + 0.5, 160, zaun + 0.5, 10, 1.5);
      if (st && freiBaum(st.x, st.z, 3)) { st.groesse = 1.0 + rnd() * 0.6; palmen.push(st); }
    }
    instanzMesh(gruppe, 'Palmen', palmeGeo(), vertexMaterial(true), palmen, (b, d) => {
      d.position.set(b.x, b.y - 0.1, b.z);
      d.rotation.set(0, b.winkel, 0);
      d.scale.setScalar((b.groesse || 1) * (1.0 + rnd() * 0.3));
    });

    // ---------- Riesenfarne (hinter dem Zaun, auch dicht am Zaun) ----------
    const riesen = [];
    for (let i = 0; i < D.riesenfarne; i++) {
      const st = stelleSuchen(strecke, rnd, zaun + 0.5, zaun + 40, zaun + 0.5, 10, 1.6);
      if (st && frei(st.x, st.z, 2)) riesen.push(st);
    }
    instanzMesh(gruppe, 'Riesenfarne', riesenfarnGeo(), vertexMaterial(true), riesen, (b, d, f) => {
      d.position.set(b.x, b.y - 0.1, b.z);
      d.rotation.set(0, b.winkel, 0);
      d.scale.setScalar(1.0 + rnd() * 1.4);
      f.setHSL(0.28, 0.35, 0.75 + rnd() * 0.25);
    });

    // ---------- Farne / Büsche (niedrig, auch vor dem Zaun) ----------
    const farne = [];
    for (let i = 0; i < D.farne; i++) {
      const st = stelleSuchen(strecke, rnd, grenze + 0.5, zaun + 30, grenze, 10, 1.3);
      if (st && frei(st.x, st.z, 1)) farne.push(st);
    }
    instanzMesh(gruppe, 'Farne', new THREE.IcosahedronGeometry(1, 0),
      new THREE.MeshLambertMaterial({ color: 0x3f7f2a, flatShading: true }), farne, (b, d, f) => {
        const g = 0.6 + rnd() * 0.8;
        d.position.set(b.x, b.y + 0.15 * g, b.z);
        d.rotation.set(0, b.winkel, 0);
        d.scale.set(1.6 * g, 0.65 * g, 1.4 * g);
        f.setHSL(0.25 + rnd() * 0.07, 0.55, 0.6 + rnd() * 0.3);
      });

    // ---------- Felsen (dunkles Vulkangestein, hinter dem Zaun; ein paar glimmen um den Lavasee) ----------
    const felsen = [];
    for (let i = 0; i < D.felsen; i++) {
      const st = stelleSuchen(strecke, rnd, zaun + 1, zaun + 70, zaun + 1.5, 10, 1.5);
      if (st && frei(st.x, st.z, 2)) felsen.push(st);
    }
    if (lava) for (let k = 0; k < 10; k++) {
      const w = k / 10 * Math.PI * 2 + rnd() * 0.3, r = 17 * 1.32 + rnd() * 3;
      const x = lava.x + Math.cos(w) * r, z = lava.z + Math.sin(w) * r;
      if (istFrei(strecke, x, z, zaun + 1)) felsen.push({ x, z, y: strecke.bodenHoehe(x, z), winkel: rnd() * 6.28, lava: true });
    }
    instanzMesh(gruppe, 'Felsen', new THREE.DodecahedronGeometry(1, 0),
      new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true }), felsen, (b, d, f) => {
        const g = b.lava ? 0.9 + rnd() * 1.2 : 0.7 + rnd() * 1.9;
        d.position.set(b.x, b.y + 0.2 * g, b.z);
        d.rotation.set(rnd() * 0.6, b.winkel, rnd() * 0.6);
        d.scale.set(1.3 * g, 0.8 * g, 1.1 * g);
        if (b.lava) f.setRGB(0.42, 0.3, 0.26); else f.setHSL(0.08 + rnd() * 0.05, 0.1 + rnd() * 0.1, 0.32 + rnd() * 0.16);
      });

    // ---------- Knochen (verstreut) und Skelette (halb im Boden) ----------
    const knochen = [];
    for (let i = 0; i < D.knochen; i++) {
      const st = stelleSuchen(strecke, rnd, grenze + 1, zaun + 25, grenze + 1, 10, 1.2);
      if (st && frei(st.x, st.z, 1)) knochen.push(st);
    }
    instanzMesh(gruppe, 'Knochen', knochenGeo(), vertexMaterial(false), knochen, (b, d) => {
      d.position.set(b.x, b.y - 0.04, b.z);
      d.rotation.set(0, b.winkel, (rnd() - 0.5) * 0.3);
      d.scale.setScalar(0.8 + rnd() * 1.0);
    });
    instanzMesh(gruppe, 'Skelette', skelettGeo(), vertexMaterial(true), skelette, (b, d) => {
      d.position.set(b.x, b.y - 0.35, b.z);
      d.rotation.set((rnd() - 0.5) * 0.1, b.winkel, (rnd() - 0.5) * 0.12);
      d.scale.setScalar(1.0 + rnd() * 0.4);
    });

    // ---------- Deko-Dinos (Plätze oben gewählt) ----------
    ['langhals', 'dreihorn', 'zweibeiner'].forEach((art) => {
      instanzMesh(gruppe, 'Dinos', dinoGeo(art), vertexMaterial(true), dinoListen[art], (b, d) => {
        d.position.set(b.x, b.y - 0.1, b.z);
        d.rotation.set(0, b.drehung, 0);
        d.scale.setScalar(art === 'zweibeiner' ? 1.1 + rnd() * 0.3 : 0.9 + rnd() * 0.25);
      });
    });

    // ---------- Vulkan mit Rauch am Horizont ----------
    const vulkan = vulkanBauen(gruppe, thema, strecke);
    return { bergmassiv: !!massiv, baeume: baeume.length, palmen: palmen.length, riesenfarne: riesen.length, farne: farne.length, felsen: felsen.length,
      knochen: knochen.length, skelette: skelette.length, dinos: dinoZahl, vulkan: !!vulkan, lavasee: lava ? { x: lava.x, z: lava.z, s: lava.s } : null };
  }

  // ------------------------------------------------------------------ Runde 4: Jahreszeiten

  /**
   * Farbvarianten einer Jahreszeit für ein Thema (aus config.jahreszeiten; Wüste: Winter-Ausnahme).
   * null = nichts ändern (Sommer, oder Thema ohne Bäume wie Wüste/Fantasie bei den Bäumen).
   * @returns {{laub:number[]|null, bluete:number[]|null, bluetenAnteil:number, tanneMisch, buschMisch, bodenMisch, randSchnee}|null}
   */
  // ------------------------------------------------------------------ Alpen (Runde 6, W4-I)

  /** Almhütte: Steinsockel, Holzwände, flaches Satteldach (dunkel), Kamin, kleine Fenster. Ursprung = Mitte unten. */
  function huetteGeo() {
    const teile = [];
    const box = (sx, sy, sz, x, y, z, farbe, rz) => { const g = new THREE.BoxGeometry(sx, sy, sz); if (rz) g.rotateZ(rz); g.translate(x, y, z); teile.push({ geo: g, farbe }); };
    box(6.4, 0.9, 5.2, 0, 0.35, 0, 0x8d8a83);                 // Steinsockel (reicht in den Hang)
    box(6.0, 2.6, 4.8, 0, 2.1, 0, 0x8a5a32);                  // Holzwände
    box(6.1, 0.22, 4.9, 0, 1.35, 0, 0x6e4626);                // Balkenlage
    const w = 0.42;                                           // Dachneigung (rad)
    box(3.6, 0.22, 5.6, -1.62, 4.05, 0, 0x4b3a30, w);           // Dach links
    box(3.6, 0.22, 5.6, 1.62, 4.05, 0, 0x4b3a30, -w);           // Dach rechts
    // Giebel (Dreiecke vorn/hinten) als flache Prismen
    [-2.4, 2.4].forEach((z) => {
      const g = new THREE.CylinderGeometry(0.01, 3.15, 1.35, 3, 1); g.rotateY(Math.PI / 6); g.scale(1, 1, 0.07); g.translate(0, 4.08, z);
      teile.push({ geo: g, farbe: 0x7a4e2a });
    });
    box(0.55, 1.6, 0.55, 1.6, 4.6, 1.2, 0x7c7770);              // Kamin
    [[-1.7, 2.3, 2.41], [1.7, 2.3, 2.41], [-1.7, 2.3, -2.41], [1.7, 2.3, -2.41]].forEach(([x, y, z]) => box(0.9, 0.8, 0.05, x, y, z, 0x2f3b48));   // Fenster
    [[-1.7, 2.3, 2.46], [1.7, 2.3, 2.46]].forEach(([x, y, z]) => box(1.05, 0.12, 0.06, x, y - 0.46, z, 0xd04a3a));   // Blumenkasten rot
    box(1.0, 1.9, 0.06, 0, 1.75, 2.42, 0x5a3820);              // Tür
    return vereinen(teile);
  }

  /** Gipfelkreuz auf einem Felshaufen. Ursprung = Fuß. */
  function gipfelkreuzGeo() {
    const teile = [];
    const fels = [[0, 0.5, 0, 2.2], [1.4, 0.3, 0.6, 1.3], [-1.2, 0.3, -0.7, 1.4], [0.3, 1.2, -0.4, 1.2]];
    fels.forEach(([x, y, z, r], i) => { const g = new THREE.DodecahedronGeometry(r, 0); g.scale(1, 0.7, 1); g.translate(x, y, z); teile.push({ geo: g, farbe: i % 2 ? 0x8a867e : 0x9a968d }); });
    const balken = new THREE.BoxGeometry(0.32, 6.2, 0.32); balken.translate(0, 4.6, 0); teile.push({ geo: balken, farbe: 0x6b4428 });
    const quer = new THREE.BoxGeometry(2.8, 0.3, 0.3); quer.translate(0, 6.3, 0); teile.push({ geo: quer, farbe: 0x6b4428 });
    const dach = new THREE.BoxGeometry(0.6, 0.12, 0.6); dach.translate(0, 7.74, 0); teile.push({ geo: dach, farbe: 0xc9a44a });   // goldene Kappe
    return vereinen(teile);
  }

  /**
   * Schneegipfel-Kranz am Horizont: anzahl Low-Poly-Kegel (6–8 Seiten) rundum, unten Fels im Dunst, oben Schnee.
   * Kulisse wie der Vulkan: ohne Tiefentest als Erstes gezeichnet, je Kamera um die Kamera in Sichtweite gestellt.
   */
  function bergKranzBauen(gruppe, thema) {
    const B = thema.berge || {}, n = B.anzahl || 20, rnd = zufall(B.seed || 1);
    const pos = [], col = [], c = new THREE.Color(), dunst = new THREE.Color(thema.nebel), schnee = new THREE.Color(0xf6f9fc);
    for (let k = 0; k < n; k++) {
      const w = (k + rnd() * 0.6) / n * Math.PI * 2, r = 0.92 + rnd() * 0.08;
      const hoch = 0.13 + rnd() * 0.16, breit = 0.12 + rnd() * 0.1, seiten = 6 + Math.floor(rnd() * 3);
      const mx = Math.cos(w) * r, mz = Math.sin(w) * r, spitze = [mx + (rnd() - 0.5) * breit * 0.3, hoch, mz + (rnd() - 0.5) * breit * 0.3];
      const fern = 0.35 + 0.25 * (1 - r) / 0.08;           // weiter hinten = mehr Dunst
      const ring = [];
      for (let j = 0; j < seiten; j++) {
        const a = j / seiten * Math.PI * 2 + rnd() * 0.3, rr = breit * (0.75 + rnd() * 0.5);
        ring.push([mx + Math.cos(a) * rr, -0.04, mz + Math.sin(a) * rr]);
      }
      // Schneegrenze: Mittelring bei 55–65 % der Höhe
      const u = 0.55 + rnd() * 0.1;
      const mitte = ring.map(p => [p[0] + (spitze[0] - p[0]) * u, -0.04 + (hoch + 0.04) * u, p[2] + (spitze[2] - p[2]) * u]);
      for (let j = 0; j < seiten; j++) {
        const a = ring[j], b = ring[(j + 1) % seiten], am = mitte[j], bm = mitte[(j + 1) % seiten];
        const hell = 0.85 + 0.3 * ((j % 3) / 2);
        c.setHex(rnd() < 0.5 ? 0x6d7480 : 0x7c838e).multiplyScalar(hell).lerp(dunst, fern);
        const f = c.toArray();
        pos.push(...a, ...b, ...bm, ...a, ...bm, ...am); for (let t = 0; t < 6; t++) col.push(...f);
        c.copy(schnee).multiplyScalar(0.88 + 0.12 * hell).lerp(dunst, fern * 0.6);
        const g = c.toArray();
        pos.push(...am, ...bm, ...spitze); for (let t = 0; t < 3; t++) col.push(...g);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
    geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(col), 3));
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, fog: false, depthTest: false, depthWrite: false, side: THREE.DoubleSide }));
    m.name = 'Bergkranz'; m.frustumCulled = false; m.renderOrder = -10; m.matrixAutoUpdate = false;
    const v3 = new THREE.Vector3(), q0 = new THREE.Quaternion(), sk = new THREE.Vector3(), kam = new THREE.Vector3();
    m.onBeforeRender = function (r, sz, camera) {
      kam.setFromMatrixPosition(camera.matrixWorld);
      const D = camera.far * 0.8;
      v3.set(kam.x, kam.y - D * 0.03, kam.z); sk.set(D, D, D);
      this.matrixWorld.compose(v3, q0, sk);
    };
    gruppe.add(m);
    return n;
  }

  function alpenDeko(gruppe, thema, strecke, rnd) {
    const sp = strecke.spline, L = sp.laenge, D = thema.deko;
    const b2 = strecke.breite / 2, grenze = dekoGrenze(strecke), zaun = hinterZaun(strecke), mitte = streckenMitte(strecke);
    const dummy = new THREE.Object3D();
    // Berg-Massiv über dem Tunnel (Fels + Schnee), Schneegipfel am Horizont
    const massiv = bergmassivBauen(gruppe, strecke, (strecke.katalog || strecke.daten || {}).berg, thema.bergFarben);
    const amBerg = (x, z, extra) => !!massiv && massiv.drin(x, z, extra || 0);
    const berge = bergKranzBauen(gruppe, thema);
    // Bergsee (Mulde aus dem Katalog): Wasserspiegel knapp unter dem niedrigsten Uferpunkt
    const see = strecke.see;
    let seeInfo = null;
    if (see) {
      let hMin = Infinity;
      for (let k = 0; k < 24; k++) { const w = k / 24 * Math.PI * 2; hMin = Math.min(hMin, strecke.bodenHoehe(see.x + Math.cos(w) * see.r * 1.02, see.z + Math.sin(w) * see.r * 1.02)); }
      const wasser = wasserFlaeche(see.x, hMin - 0.25, see.z, see.r * 1.05, rnd, 0x3f8fc6);
      wasser.name = 'Bergsee';
      gruppe.add(wasser);
      seeInfo = { x: see.x, z: see.z, r: see.r * 1.15, y: hMin - 0.25 };
    }
    const amSee = (x, z, extra) => seeInfo && Math.hypot(x - seeInfo.x, z - seeInfo.z) < seeInfo.r + (extra || 0);
    // Steinbrücke im Tal: Bach unter der Brücke freihalten
    const br = strecke.bruecke || null, bachMitte = br ? sp.punktBei((br.von + br.bis) / 2) : null;
    const amBach = (x, z) => {
      if (!bachMitte) return false;
      const dx = x - bachMitte.x, dz = z - bachMitte.z;
      return Math.abs(dx * bachMitte.tx + dz * bachMitte.tz) < 12 && Math.abs(dx * bachMitte.nx + dz * bachMitte.nz) < strecke.seitenabstandMax + 70;
    };
    const frei = (x, z, extra) => !amBerg(x, z, (extra || 0) + 3) && !amSee(x, z, extra) && !amBach(x, z);
    // Gipfelkreuz am Pass (höchster Punkt), auf der Außenseite hinter dem Zaun
    let pass = sp.punkte[0];
    sp.punkte.forEach((p) => { if (p.y > pass.y) pass = p; });
    let kreuz = null;
    for (const sg of [1, -1]) {
      for (const d of [zaun + 8, zaun + 14, zaun + 22]) {
        const x = pass.x + pass.nx * d * sg, z = pass.z + pass.nz * d * sg;
        if (!kreuz && istFrei(strecke, x, z, zaun + 6) && frei(x, z, 4)) kreuz = { x, z, y: strecke.bodenHoehe(x, z), winkel: Math.atan2(pass.tx, pass.tz) };
      }
    }
    if (kreuz) instanzMesh(gruppe, 'Gipfelkreuz', gipfelkreuzGeo(), vertexMaterial(true), [kreuz], (b, d) => {
      d.position.set(b.x, b.y - 0.3, b.z); d.rotation.set(0, b.winkel, 0); d.scale.setScalar(1.2);
    });
    const istKreuz = (x, z, r) => kreuz && Math.hypot(x - kreuz.x, z - kreuz.z) < r;

    // ---------- Almhütten (vor den Bäumen: Lichtung) ----------
    const huetten = [];
    for (let i = 0; i < D.huetten * 40 && huetten.length < D.huetten; i++) {
      const st = stelleSuchen(strecke, rnd, zaun + 10, zaun + 60, zaun + 10, 10, 1.2);
      if (!st || !frei(st.x, st.z, 10) || istKreuz(st.x, st.z, 30) || huetten.some(o => Math.hypot(o.x - st.x, o.z - st.z) < 180)) continue;
      // Blick (Giebel/Tür) zur Straße
      const p = sp.punktBei(st.s);
      st.drehung = Math.atan2(-p.nx * -st.seite, -p.nz * -st.seite);
      st.y = Math.min(strecke.bodenHoehe(st.x, st.z), strecke.bodenHoehe(st.x + 3, st.z + 3), strecke.bodenHoehe(st.x - 3, st.z - 3));
      huetten.push(st);
    }
    instanzMesh(gruppe, 'Huetten', huetteGeo(), vertexMaterial(true), huetten, (b, d) => {
      d.position.set(b.x, b.y - 0.1, b.z); d.rotation.set(0, b.drehung, 0); d.scale.setScalar(1.05);
    });
    const lichtung = (x, z, r) => huetten.some(h => Math.hypot(x - h.x, z - h.z) < r) || istKreuz(x, z, 14);

    // ---------- Nadelwald: Wäldchen an den Hängen + lockeres Band hinter dem Zaun + Wald in der Ferne ----------
    const tannen = [];
    const neu = (x, z, groesse) => { if (frei(x, z, 2) && !lichtung(x, z, 16)) tannen.push({ x, z, y: strecke.bodenHoehe(x, z), winkel: rnd() * Math.PI * 2, groesse }); };
    for (let s = 0; s < L; s += D.bandAbstand) {
      const dicht = 0.5 + 0.5 * Math.sin(s * 0.011 + 1.3);          // abschnittsweise Wald / Wiese
      if (rnd() > dicht * 0.9) continue;
      const p = sp.punktBei(s + rnd() * 2);
      [-1, 1].forEach((seite) => {
        const d = zaun + 1 + Math.pow(rnd(), 1.4) * 40;
        const x = p.x + p.nx * d * seite, z = p.z + p.nz * d * seite;
        if (istFrei(strecke, x, z, zaun)) neu(x, z, 0.8 + rnd() * 0.7);
      });
    }
    for (let i = 0; i < D.waeldchen; i++) {
      const st = stelleSuchen(strecke, rnd, 50, 220, zaun + 25, 30, 1);
      if (!st || !frei(st.x, st.z, 30)) continue;
      for (let k = 0; k < 28; k++) {
        const x = st.x + (rnd() - 0.5) * 70, z = st.z + (rnd() - 0.5) * 70;
        if (istFrei(strecke, x, z, zaun + 1)) neu(x, z, 0.9 + rnd() * 0.8);
      }
    }
    for (let i = 0; i < D.fernBaeume; i++) {
      const st = stelleSuchen(strecke, rnd, 60, 320, zaun + 30, 8, 1);
      if (st && aufBoden(mitte, st.x, st.z, 40)) neu(st.x, st.z, 1.1 + rnd() * 0.8);
    }
    instanzMesh(gruppe, 'Tannen', tanneGeo(), vertexMaterial(true), tannen, (b, d, f) => {
      d.position.set(b.x, b.y - 0.15, b.z);
      d.rotation.set(0, b.winkel, 0);
      d.scale.set(b.groesse, b.groesse * (1.1 + rnd() * 0.5), b.groesse);
      f.setHSL(0.33, 0.25, 0.7 + rnd() * 0.3);
    });

    // ---------- Büsche (Latschen) und Felsen ----------
    const buesche = [];
    for (let i = 0; i < D.buesche; i++) {
      const st = stelleSuchen(strecke, rnd, grenze + 1, zaun + 30, grenze + 0.5, 10, 1.3);
      if (st && frei(st.x, st.z, 1) && !lichtung(st.x, st.z, 6)) buesche.push(st);
    }
    instanzMesh(gruppe, 'Buesche', new THREE.IcosahedronGeometry(1, 0),
      new THREE.MeshLambertMaterial({ color: 0x3f7a35, flatShading: true }), buesche, (b, d, f) => {
        const g = 0.6 + rnd() * 0.8;
        d.position.set(b.x, b.y + 0.25 * g, b.z); d.rotation.set(0, b.winkel, 0); d.scale.set(1.5 * g, 0.75 * g, 1.3 * g);
        f.setHSL(0.27 + rnd() * 0.06, 0.45, 0.6 + rnd() * 0.3);
      });
    const felsen = [];
    for (let i = 0; i < D.felsen; i++) {
      const st = stelleSuchen(strecke, rnd, zaun + 1, zaun + 90, zaun + 1.5, 10, 1.3);
      if (st && frei(st.x, st.z, 2) && !lichtung(st.x, st.z, 8)) felsen.push(st);
    }
    // Ufersteine am Bergsee (halb im Wasser)
    if (seeInfo) for (let k = 0; k < 14; k++) {
      const w = k / 14 * Math.PI * 2 + rnd() * 0.3, r = see.r * (0.95 + rnd() * 0.2), x = seeInfo.x + Math.cos(w) * r, z = seeInfo.z + Math.sin(w) * r;
      if (istFrei(strecke, x, z, zaun)) felsen.push({ x, z, y: Math.max(strecke.bodenHoehe(x, z), seeInfo.y - 0.2), winkel: rnd() * 6.28 });
    }
    instanzMesh(gruppe, 'Felsen', new THREE.DodecahedronGeometry(1, 0),
      new THREE.MeshLambertMaterial({ color: 0x9a968e, flatShading: true }), felsen, (b, d, f) => {
        const g = 0.6 + rnd() * 1.9;
        d.position.set(b.x, b.y + 0.15 * g, b.z); d.rotation.set(rnd() * 0.6, b.winkel, rnd() * 0.6); d.scale.set(1.3 * g, 0.8 * g, 1.1 * g);
        f.setHSL(0.1 + rnd() * 0.1, 0.05 + rnd() * 0.06, 0.7 + rnd() * 0.25);
      });

    // ---------- Kühe (braun-weiß, Glocke) auf den Almwiesen ----------
    const kastenGeo = new THREE.BoxGeometry(1, 1, 1);
    const teile = {
      braun: [[0, 1.15, 0, 0.9, 0.8, 1.8], [0, 1.45, -1.15, 0.5, 0.5, 0.6], [-0.3, 0.38, -0.65, 0.18, 0.75, 0.18], [0.3, 0.38, -0.65, 0.18, 0.75, 0.18],
        [-0.3, 0.38, 0.65, 0.18, 0.75, 0.18], [0.3, 0.38, 0.65, 0.18, 0.75, 0.18]],
      weiss: [[0.46, 1.2, 0.3, 0.02, 0.45, 0.7], [-0.46, 1.1, -0.2, 0.02, 0.4, 0.6], [0, 1.35, -1.47, 0.42, 0.28, 0.08], [0, 0.82, 0.1, 0.6, 0.06, 0.9]],
      glocke: [[0, 0.98, -1.05, 0.22, 0.26, 0.2]],
    };
    const listen = { braun: [], weiss: [], glocke: [] }, kuh = new THREE.Object3D();
    let kuehe = 0;
    for (let i = 0; i < D.kuehe * 20 && kuehe < D.kuehe; i++) {
      const st = stelleSuchen(strecke, rnd, zaun + 4, zaun + 45, zaun + 4, 10, 1.2);
      if (!st || !frei(st.x, st.z, 3) || lichtung(st.x, st.z, 6)) continue;
      kuh.position.set(st.x, st.y, st.z); kuh.rotation.set(0, st.winkel, 0); kuh.updateMatrixWorld(true);
      Object.keys(teile).forEach((k) => teile[k].forEach((t) => {
        dummy.position.set(t[0], t[1], t[2]); dummy.rotation.set(0, 0, 0); dummy.scale.set(t[3], t[4], t[5]); dummy.updateMatrix();
        listen[k].push(new THREE.Matrix4().multiplyMatrices(kuh.matrixWorld, dummy.matrix));
      }));
      kuehe++;
    }
    [['braun', 0x8a5a32], ['weiss', 0xf2efe8], ['glocke', 0xd8b04a]].forEach(([k, f]) => {
      instanzMesh(gruppe, 'Kuehe', kastenGeo, new THREE.MeshLambertMaterial({ color: f }), listen[k], (mat, d) => mat.decompose(d.position, d.quaternion, d.scale));
    });

    // ---------- Almblumen (Enzian blau, Edelweiß weiß, Alpenrosen pink, gelb) ----------
    const blumen = [];
    for (let i = 0; i < D.blumen / 6; i++) {
      const st = stelleSuchen(strecke, rnd, b2 + 9, 80, b2 + 8, 10, 1.3);
      if (!st || !frei(st.x, st.z, 2)) continue;
      const farbe = Math.floor(rnd() * 4);
      for (let k = 0; k < 6; k++) {
        const x = st.x + (rnd() - 0.5) * 9, z = st.z + (rnd() - 0.5) * 9;
        if (istFrei(strecke, x, z, b2 + 6.5) && frei(x, z, 1)) blumen.push({ x, z, y: strecke.bodenHoehe(x, z), winkel: rnd() * 6.28, farbe });
      }
    }
    const FARBEN = [0x4f7dff, 0xf4f4ee, 0xff6fb5, 0xffd84a];      // Enzian, Edelweiß, Alpenrose, Arnika
    const blumenGeo = new THREE.CircleGeometry(0.8, 6); blumenGeo.rotateX(-Math.PI / 2);
    instanzMesh(gruppe, 'Blumen', blumenGeo, new THREE.MeshLambertMaterial({
      color: 0xffffff, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }), blumen, (b, d, f) => {
      const g = 0.45 + rnd() * 0.5;                               // kleine Tupfen (große Scheiben wirkten wie Pfützen/Schnee)
      d.position.set(b.x, b.y + 0.06, b.z); d.rotation.set(0, b.winkel, 0); d.scale.set(g * (1 + rnd() * 0.6), 1, g);
      f.setHex(FARBEN[b.farbe]);
    });
    return { tannen: tannen.length, huetten: huetten.length, kuehe, felsen: felsen.length, buesche: buesche.length, blumen: blumen.length,
      gipfelkreuz: !!kreuz, see: !!seeInfo, berge, massiv: !!massiv };
  }

  function jahreszeitFarben(themaName, jahreszeit) {
    const J = R.config.jahreszeiten;
    if (!J || !jahreszeit || !J[jahreszeit]) return null;
    let d = J[jahreszeit];
    if (d[themaName]) d = Object.assign({}, d, d[themaName]);
    const baeume = themaName === 'wiese' || themaName === 'wald' || themaName === 'dino' || themaName === 'alpen';    // Wüste/Fantasie: eigene Pflanzen bleiben
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
    const bauer = (strecke.daten && strecke.daten.formel1) ? formel1Deko : { wiese: wieseDeko, wald: waldDeko, wueste: wuesteDeko, fantasie: fantasieDeko, dino: dinoDeko, alpen: alpenDeko }[themaName] || wieseDeko;
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

  // ------------------------------------------------------------------ Runde 6 (W2-D): Straßenlaternen (Nacht)

  /** Weicher, warmer Lichtfleck (Canvas, einmal erzeugt). */
  let _lichtfleckTextur = null;
  function lichtfleckTextur() {
    if (_lichtfleckTextur) return _lichtfleckTextur;
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d'), v = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    v.addColorStop(0, 'rgba(255,255,255,1)'); v.addColorStop(0.5, 'rgba(255,255,255,0.45)'); v.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = v; g.fillRect(0, 0, 64, 64);
    _lichtfleckTextur = new THREE.CanvasTexture(c);
    return _lichtfleckTextur;
  }

  /**
   * Straßenlaternen für Themen mit laternen: true (Wiese, Wald, später Alpen): alle `abstand` m abwechselnd links/rechts,
   * 2,2 m hinter dem Randstein, Ausleger über den Rand. Nicht in Tunneln, auf Brücken, nahe Säulen (Startbogen, Looping)
   * oder dicht an anderen Streckenteilen. 3 InstancedMeshes = 3 Draw-Calls: Mast+Ausleger, Lampenkopf (leuchtet, ohne
   * Nebel), Lichtfleck auf der Straße (additiv). Echtes Licht (PointLights an den nächsten Laternen) setzt main.js.
   * @returns {{gruppe: THREE.Group, lampen: {x,y,z}[], masten: {x,z,r,art}[]}}
   */
  function laternenBauen(strecke, thema, opt) {
    opt = opt || {};
    const abstand = opt.abstand || 60, hoehe = opt.hoehe || 7, aus = opt.ausleger || 2.4, farbe = opt.farbe || 0xffd08a;
    const sp = strecke.spline, L = sp.laenge, saeulen = strecke.saeulen || [];
    const stellen = [];
    let seite = 1;
    for (let s = 30; s < L - 15; s += abstand, seite = -seite) {
      if (strecke.imTunnel && strecke.imTunnel(s, 20)) continue;
      if (strecke.brueckeBei && strecke.brueckeBei(s, 12)) continue;
      if (strecke.ueberfuehrungNah && strecke.ueberfuehrungNah(s, 12)) continue;      // W4-I: nicht auf/unter der Überführung
      if (strecke.kreuzungNah && strecke.kreuzungNah(s, 25)) continue;                // W4-J: nicht an der Kreuzung (Warnlicht-Masten)
      const b = (strecke.breiteBei ? strecke.breiteBei(s) : strecke.breite) / 2 + (strecke.randBreite || 0.6);
      const d = b + 2.2;
      if (strecke.grenzeBei && strecke.grenzeBei(s) < d + 1) continue;          // Zaun zu nah (Trichter)
      const p = sp.punktBei(s), x = p.x + p.nx * d * seite, z = p.z + p.nz * d * seite;
      const n = sp.naechster(x, z);
      if (Math.abs(n.seitenabstand) < d - 0.3) continue;                        // anderes Streckenteil näher
      if (saeulen.some(q => (q.x - x) * (q.x - x) + (q.z - z) * (q.z - z) < 36)) continue;
      const y = strecke.bodenHoehe ? strecke.bodenHoehe(x, z) : strecke.hoeheAn(x, z);
      const dx = -p.nx * seite, dz = -p.nz * seite;                              // Richtung zur Straße
      const kx = x + dx * aus, kz = z + dz * aus;
      stellen.push({ x, y, z, dx, dz, kx, kz, ky: y + hoehe - 0.25, sy: strecke.hoeheAn(kx, kz) });
    }
    const gruppe = new THREE.Group();
    gruppe.name = 'Laternen';
    // Mast + Ausleger (lokal: Mast bei 0, Ausleger nach +x)
    const mast = new THREE.CylinderGeometry(0.09, 0.14, hoehe, 6); mast.translate(0, hoehe / 2, 0);
    const arm = new THREE.BoxGeometry(aus + 0.1, 0.1, 0.1); arm.translate(aus / 2, hoehe - 0.05, 0);
    const fuss = new THREE.CylinderGeometry(0.22, 0.26, 0.5, 6); fuss.translate(0, 0.25, 0);
    const mastGeo = vereinen([{ geo: mast, farbe: 0x4f555c }, { geo: arm, farbe: 0x4f555c }, { geo: fuss, farbe: 0x3a3e44 }]);
    const winkel = (e) => Math.atan2(-e.dz, e.dx);
    instanzMesh(gruppe, 'Laternenmasten', mastGeo, vertexMaterial(true), stellen, (e, d) => {
      d.position.set(e.x, e.y - 0.05, e.z); d.rotation.set(0, winkel(e), 0);
    });
    const kopf = new THREE.BoxGeometry(0.85, 0.16, 0.42); kopf.translate(aus - 0.15, hoehe - 0.18, 0);
    instanzMesh(gruppe, 'Laternenkoepfe', kopf, new THREE.MeshBasicMaterial({ color: farbe, fog: false }), stellen, (e, d) => {
      d.position.set(e.x, e.y - 0.05, e.z); d.rotation.set(0, winkel(e), 0);
    });
    const fleck = new THREE.CircleGeometry(1, 20); fleck.rotateX(-Math.PI / 2);
    const fleckMat = new THREE.MeshBasicMaterial({ color: farbe, map: lichtfleckTextur(), transparent: true, opacity: 0.45,
      blending: THREE.AdditiveBlending, depthWrite: false, fog: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
    const fl = instanzMesh(gruppe, 'Laternenlicht', fleck, fleckMat, stellen, (e, d) => {
      d.position.set(e.kx + e.dx * 1.5, e.sy + 0.12, e.kz + e.dz * 1.5); d.scale.set(8, 1, 8);
    });
    fl.renderOrder = 1;
    gruppe.children.forEach((m) => { m.instanceMatrix.needsUpdate = true; m.computeBoundingSphere(); });
    return {
      gruppe,
      lampen: stellen.map(e => ({ x: e.kx, y: e.ky - 0.3, z: e.kz })),
      masten: stellen.map(e => ({ x: e.x, z: e.z, r: 0.2, art: 'laterne' })),
    };
  }

  themes.laternenBauen = laternenBauen;
  themes.dekoBauen = dekoBauen;
  themes.jahreszeitFarben = jahreszeitFarben;
  themes.instanzenAufteilen = instanzenAufteilen;
  themes.statischVorbereiten = statischVorbereiten;
  themes.zufall = zufall;
  themes.dinoTeile = dinoTeile;     // Runde 5b: laufende Dinos (world/dynamik.js)
  themes.dinoGeo = dinoGeo;
  R.themes = themes;
})();
