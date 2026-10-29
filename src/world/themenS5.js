// ============================================================
// S5 „Neue Welten“ – Themen Mond, Ozean, Regenbogen (Add-on nach themes.js/megastrecke.js geladen).
// Hängt nur an: R.themes[…] (Farben/Nebel/Licht), R.themes.zusatzBauer[…] (Deko als InstancedMesh, wenige Draw-Calls),
// R.config.jahreszeiten[…][thema] (neutral, nur klares Wetter) und einen Wrapper um Wetter._himmelBauen (Wolken/Sonne je Welt aus).
// Alte Themen bleiben bitgleich. Läuft im Server mit (nur Zahlen/Geometrie, keine Zeichenflächen).
// ============================================================
(function () {
  const R = window.Rennspiel;
  if (!R || !R.themes || !R.themes.hilfe || !R.config) return;
  const T = R.themes, H = T.hilfe;

  // ------------------------------------------------------------------ Themen
  T.mond = {
    name: 'Mond', boden: 0x8d8d94, boden2: 0x6c6c75, himmel: 0x02030a, nebel: 0x04050c, sichtweite: 900,
    lichtHimmel: 0x8f98b8, lichtBoden: 0x4c4c58, sonnenFarbe: 0xffffff, sonnenIntensitaet: 1.45,
    laternen: true, asphalt: 0x4a4b54, zaun: { latten: 0xd6dae4, pfosten: 0x80828c },
    seed: 61, deko: { felsen: 170, ringe: 34, berge: 22, raketen: 3 },
  };
  T.ozean = {
    name: 'Ozean', boden: 0x4f8f86, boden2: 0x7fae8e, himmel: 0x0a6a94, nebel: 0x0d7aa0, sichtweite: 300,
    lichtHimmel: 0xa8eaff, lichtBoden: 0x1b6270, sonnenFarbe: 0xc4f4ff, sonnenIntensitaet: 0.85,
    laternen: true, asphalt: 0x2e3945, zaun: { latten: 0xa8e4f0, pfosten: 0x3e7284 },
    seed: 67, deko: { korallen: 170, tang: 230, muscheln: 70, felsen: 80 },
  };
  T.regenbogen = {
    name: 'Regenbogenland', boden: 0xffffff, boden2: 0xeef2ff, himmel: 0x78c0ff, nebel: 0xcfe8ff, sichtweite: 560,
    lichtHimmel: 0xffffff, lichtBoden: 0xf0f4ff, sonnenFarbe: 0xfff6e0, sonnenIntensitaet: 1.5,
    laternen: true, asphalt: 0x6b6f86, zaun: { latten: 0xffffff, pfosten: 0xffb4de },
    regenbogen: [0xff4d6d, 0xff9f43, 0xffe14a, 0x4cd97b, 0x4da6ff, 0xa66bff],
    seed: 71, deko: { puffs: 150, boegen: 7, sterne: 60 },
  };

  // ------------------------------------------------------------------ Jahreszeiten: neutral, nur klares Wetter
  ['fruehling', 'sommer', 'herbst', 'winter'].forEach((jz) => {
    const d = R.config.jahreszeiten && R.config.jahreszeiten[jz]; if (!d) return;
    const neutral = { laub: null, bluete: null, bluetenAnteil: 0, tanneMisch: null, buschMisch: null, bodenMisch: null, randSchnee: false,
      himmelMisch: null, nebelMisch: null, sichtweiteFaktor: 1, sonnenHoehe: null, lichtFarbe: null, lichtFaktor: 1, wetter: ['klar'], wetterWueste: ['klar'] };
    ['mond', 'ozean', 'regenbogen'].forEach((t) => { d[t] = Object.assign({}, neutral); });
  });

  // ------------------------------------------------------------------ Geometrien
  const felsGeo = (farbe) => {
    const g = new THREE.IcosahedronGeometry(1, 0); g.scale(1, 0.62, 0.85);
    return H.vereinen([{ geo: g, farbe }]);
  };
  function raketeGeo() {
    const teile = [];
    const koerper = new THREE.CylinderGeometry(1.6, 2.0, 14, 10); koerper.translate(0, 8, 0);
    const spitze = new THREE.ConeGeometry(1.6, 5, 10); spitze.translate(0, 17.5, 0);
    teile.push({ geo: koerper, farbe: 0xf2f4f8 }, { geo: spitze, farbe: 0xe8453c });
    const band = new THREE.CylinderGeometry(1.72, 1.72, 1.6, 10); band.translate(0, 11, 0);
    teile.push({ geo: band, farbe: 0xe8453c });
    const fenster = new THREE.SphereGeometry(0.7, 8, 6); fenster.translate(0, 12.8, 1.5);
    teile.push({ geo: fenster, farbe: 0x58b6ff });
    for (let i = 0; i < 3; i++) {
      const f = new THREE.BoxGeometry(0.3, 4, 3); f.translate(0, 2, 2.6);
      f.rotateY(i * Math.PI * 2 / 3);
      teile.push({ geo: f, farbe: 0xe8453c });
    }
    return H.vereinen(teile);
  }
  function korallenGeo() {
    const teile = [], c = [0xffffff, 0xf4f4f4];
    for (let i = 0; i < 5; i++) {
      const a = i / 5 * Math.PI * 2, h = 1.6 + (i % 3) * 0.7;
      const z = H.zylinderZwischen([0, 0, 0], [Math.cos(a) * 0.6, h, Math.sin(a) * 0.6], 0.28, 0.12, 5);
      teile.push({ geo: z, farbe: c[i % 2] });
      const k = new THREE.SphereGeometry(0.2, 5, 4); k.translate(Math.cos(a) * 0.6, h, Math.sin(a) * 0.6);
      teile.push({ geo: k, farbe: 0xffffff });
    }
    return H.vereinen(teile);
  }
  function tangGeo() {
    const teile = [];
    for (let i = 0; i < 3; i++) {
      const g = new THREE.ConeGeometry(0.16, 4.2, 4); g.translate(0, 2.1, 0);
      g.rotateZ((i - 1) * 0.16); g.translate((i - 1) * 0.3, 0, 0);
      teile.push({ geo: g, farbe: 0xffffff });
    }
    return H.vereinen(teile);
  }
  function muschelGeo() {
    const g = new THREE.SphereGeometry(1, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2); g.scale(1, 0.55, 0.8);
    return H.vereinen([{ geo: g, farbe: 0xffffff }]);
  }
  function wolkenPuffGeo() {
    const teile = [], pos = [[0, 0, 0, 1], [1.1, -0.15, 0.2, 0.8], [-1.05, -0.1, -0.1, 0.85], [0.3, 0.35, -0.7, 0.7], [-0.2, 0.2, 0.8, 0.65]];
    pos.forEach((p) => { const g = new THREE.SphereGeometry(p[3], 9, 7); g.translate(p[0], p[1], p[2]); teile.push({ geo: g, farbe: 0xffffff }); });
    return H.vereinen(teile);
  }
  function bogenGeo(radius, dicke, farben) {
    const teile = farben.map((f, i) => ({ geo: new THREE.TorusGeometry(radius - i * dicke, dicke / 2, 5, 48, Math.PI), farbe: f }));
    return H.vereinen(teile);
  }
  function sternGeo() {
    const g = new THREE.OctahedronGeometry(1, 0); g.scale(1, 1.4, 0.4);
    return H.vereinen([{ geo: g, farbe: 0xffffff }]);
  }

  // ------------------------------------------------------------------ Deko-Bauer (gleiche Zufallsfolge → gleiche Welt)
  const matL = () => new THREE.MeshLambertMaterial({ color: 0xffffff });

  T.zusatzBauer.mond = function (gruppe, thema, strecke, rnd) {
    const zaun = H.hinterZaun(strecke), mitte = H.streckenMitte(strecke);
    const felsen = [];
    for (let i = 0; i < thema.deko.felsen; i++) {
      const st = H.stelleSuchen(strecke, rnd, zaun + 1.5, 190, zaun + 1.5, 20, 1.7);
      if (st) { st.g = 0.8 + rnd() * rnd() * 5.5; st.grau = 0.55 + rnd() * 0.45; felsen.push(st); }
    }
    H.instanzMesh(gruppe, 'MondFelsen', felsGeo(0xffffff), matL(), felsen, (b, d, f) => {
      d.position.set(b.x, b.y + b.g * 0.2, b.z); d.rotation.set(rnd() * 0.5, b.winkel, rnd() * 0.5); d.scale.setScalar(b.g);
      f.setRGB(b.grau * 0.72, b.grau * 0.72, b.grau * 0.76);
    });
    // Kraterränder: flache Ringe im Gelände (nur Deko, hinter dem Zaun)
    const ringe = [];
    for (let i = 0; i < thema.deko.ringe; i++) {
      const st = H.stelleSuchen(strecke, rnd, zaun + 12, 200, zaun + 12, 20, 1.2);
      if (st && H.aufBoden(mitte, st.x, st.z, 40)) { st.r = 7 + rnd() * 20; ringe.push(st); }
    }
    const ringG = new THREE.TorusGeometry(1, 0.13, 5, 18); ringG.rotateX(Math.PI / 2);
    H.instanzMesh(gruppe, 'MondKrater', ringG, new THREE.MeshLambertMaterial({ color: 0x9a9aa4 }), ringe, (b, d) => {
      d.position.set(b.x, b.y + 0.2, b.z); d.scale.set(b.r, b.r * 0.5, b.r * (0.8 + rnd() * 0.3)); d.rotation.set(0, b.winkel, 0);
    });
    // ferne Berge
    const berge = [];
    for (let i = 0; i < thema.deko.berge; i++) {
      const st = H.stelleSuchen(strecke, rnd, 260, 640, 220, 10, 1);
      if (st && H.aufBoden(mitte, st.x, st.z, 30)) { st.h = 40 + rnd() * 90; berge.push(st); }
    }
    const bergG = new THREE.ConeGeometry(1, 1, 7); bergG.translate(0, 0.5, 0);
    H.instanzMesh(gruppe, 'MondBerge', bergG, new THREE.MeshLambertMaterial({ color: 0x7a7a84, flatShading: true }), berge, (b, d) => {
      d.position.set(b.x, b.y - 2, b.z); d.scale.set(b.h * 1.6, b.h, b.h * 1.3); d.rotation.set(0, b.winkel, 0);
    });
    // Raketen-Deko nah hinter dem Zaun (feste Abstände entlang der Strecke)
    const rak = [];
    for (let i = 0; i < thema.deko.raketen; i++) {
      const sp = strecke.spline, s = sp.laenge * (0.12 + i * 0.3), p = sp.punktBei(s), seite = i % 2 ? -1 : 1, d = zaun + 9 + rnd() * 6;
      const x = p.x + p.nx * d * seite, z = p.z + p.nz * d * seite;
      if (H.istFrei(strecke, x, z, zaun + 4)) rak.push({ x, z, y: strecke.bodenHoehe(x, z), winkel: rnd() * 6.28, g: 0.9 + rnd() * 0.5 });
    }
    H.instanzMesh(gruppe, 'MondRaketen', raketeGeo(), H.vertexMaterial(false), rak, (b, dd) => {
      dd.position.set(b.x, b.y - 0.3, b.z); dd.rotation.set(0, b.winkel, 0); dd.scale.setScalar(b.g);
    });
    return { felsen: felsen.length, ringe: ringe.length, berge: berge.length, raketen: rak.length };
  };

  T.zusatzBauer.ozean = function (gruppe, thema, strecke, rnd) {
    const zaun = H.hinterZaun(strecke), mitte = H.streckenMitte(strecke);
    const FARBEN = [0xff6f91, 0xffa94d, 0xb06bff, 0xff5d73, 0x4fd6c4, 0xffd24a];
    const kor = [];
    for (let i = 0; i < thema.deko.korallen; i++) {
      const st = H.stelleSuchen(strecke, rnd, zaun + 1, 120, zaun + 1, 20, 1.5);
      if (st) { st.g = 0.8 + rnd() * 2.2; kor.push(st); }
    }
    H.instanzMesh(gruppe, 'Korallen', korallenGeo(), H.vertexMaterial(false), kor, (b, d, f) => {
      d.position.set(b.x, b.y - 0.1, b.z); d.rotation.set(0, b.winkel, 0); d.scale.setScalar(b.g);
      f.setHex(FARBEN[Math.floor(rnd() * FARBEN.length)]);
    });
    const tang = [];
    for (let i = 0; i < thema.deko.tang; i++) {
      const st = H.stelleSuchen(strecke, rnd, zaun + 0.8, 140, zaun + 0.8, 20, 1.4);
      if (st) { st.g = 0.8 + rnd() * 2.2; tang.push(st); }
    }
    H.instanzMesh(gruppe, 'Seetang', tangGeo(), new THREE.MeshLambertMaterial({ color: 0xffffff, side: THREE.DoubleSide }), tang, (b, d, f) => {
      d.position.set(b.x, b.y - 0.1, b.z); d.rotation.set(0, b.winkel, 0); d.scale.set(1, b.g, 1);
      f.setHSL(0.3 + rnd() * 0.08, 0.6, 0.28 + rnd() * 0.15);
    });
    const mu = [];
    for (let i = 0; i < thema.deko.muscheln; i++) {
      const st = H.stelleSuchen(strecke, rnd, zaun + 1, 90, zaun + 1, 20, 1.2);
      if (st) { st.g = 0.6 + rnd() * 1.5; mu.push(st); }
    }
    H.instanzMesh(gruppe, 'Muscheln', muschelGeo(), matL(), mu, (b, d, f) => {
      d.position.set(b.x, b.y, b.z); d.rotation.set(0, b.winkel, 0); d.scale.setScalar(b.g);
      f.setHex([0xffe0cc, 0xffc9de, 0xf4f0e0][Math.floor(rnd() * 3)]);
    });
    const fe = [];
    for (let i = 0; i < thema.deko.felsen; i++) {
      const st = H.stelleSuchen(strecke, rnd, zaun + 2, 220, zaun + 2, 20, 1.5);
      if (st && H.aufBoden(mitte, st.x, st.z, 30)) { st.g = 1.5 + rnd() * rnd() * 9; fe.push(st); }
    }
    H.instanzMesh(gruppe, 'OzeanFelsen', felsGeo(0xffffff), matL(), fe, (b, d, f) => {
      d.position.set(b.x, b.y + b.g * 0.2, b.z); d.rotation.set(0, b.winkel, 0); d.scale.setScalar(b.g);
      f.setRGB(0.25 + rnd() * 0.15, 0.4 + rnd() * 0.15, 0.45 + rnd() * 0.15);
    });
    return { korallen: kor.length, tang: tang.length, muscheln: mu.length, felsen: fe.length };
  };

  T.zusatzBauer.regenbogen = function (gruppe, thema, strecke, rnd) {
    const zaun = H.hinterZaun(strecke), mitte = H.streckenMitte(strecke);
    const puffs = [];
    for (let i = 0; i < thema.deko.puffs; i++) {
      const st = H.stelleSuchen(strecke, rnd, zaun + 2, 230, zaun + 2, 20, 1.4);
      if (st) { st.g = 3 + rnd() * 9; puffs.push(st); }
    }
    H.instanzMesh(gruppe, 'Wolkenpuffs', wolkenPuffGeo(), new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0x8f98b4 }), puffs, (b, d, f) => {
      d.position.set(b.x, b.y + b.g * 0.3, b.z); d.rotation.set(0, b.winkel, 0); d.scale.set(b.g * 1.4, b.g * 0.8, b.g);
      f.setHSL(0.6 + rnd() * 0.3, 0.55 * rnd(), 0.93 + rnd() * 0.07);
    });
    const boegen = [];
    for (let i = 0; i < thema.deko.boegen; i++) {
      const st = H.stelleSuchen(strecke, rnd, zaun + 60, 300, zaun + 50, 20, 1);
      if (st && H.aufBoden(mitte, st.x, st.z, 60)) { st.r = 40 + rnd() * 50; boegen.push(st); }
    }
    H.instanzMesh(gruppe, 'Regenboegen', bogenGeo(1, 0.07, thema.regenbogen), new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.85 }), boegen, (b, d) => {
      d.position.set(b.x, b.y - 4, b.z); d.rotation.set(0, b.winkel, 0); d.scale.setScalar(b.r);
    });
    const sterne = [];
    for (let i = 0; i < thema.deko.sterne; i++) {
      const st = H.stelleSuchen(strecke, rnd, zaun + 4, 200, zaun + 4, 20, 1.3);
      if (st) { st.hoch = 4 + rnd() * 26; st.g = 0.8 + rnd() * 1.6; sterne.push(st); }
    }
    H.instanzMesh(gruppe, 'Sterne', sternGeo(), new THREE.MeshBasicMaterial({ color: 0xffffff }), sterne, (b, d, f) => {
      d.position.set(b.x, b.y + b.hoch, b.z); d.rotation.set(0, b.winkel, rnd() * 0.6); d.scale.setScalar(b.g);
      f.setHex([0xffe14a, 0xff9ad5, 0x9cf0ff, 0xffffff][Math.floor(rnd() * 4)]);
    });
    return { puffs: puffs.length, boegen: boegen.length, sterne: sterne.length };
  };

  // ------------------------------------------------------------------ Himmel: Mond ohne Wolken, Ozean ohne Wolken und Sonne
  const W = R.Wetter;
  if (W && W.prototype._himmelBauen && !W.prototype._himmelBauen.istS5) {
    const orig = W.prototype._himmelBauen;
    W.prototype._himmelBauen = function (thema) {
      const erg = orig.apply(this, arguments);
      const t = this.thema;
      if (t === 'mond' || t === 'ozean') {
        if (this._wolken) this._wolken.visible = false;
        if (t === 'ozean' && this._sonne) this._sonne.visible = false;
      }
      return erg;
    };
    W.prototype._himmelBauen.istS5 = true;
  }
})();
