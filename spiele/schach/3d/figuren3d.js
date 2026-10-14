/* Piece3DFactory (SchachSpiel.swift ~4196–4820) nach Three.js:
 *  - gedrechselte Staunton-Figuren (LatheGeometry + Zinnen, Krone, Kreuz, Läufer-Kerbe, Pferdekopf)
 *  - Hunde-Team (Bruno/Luna/Brocken/Wurzel/Falko/Welpen), frei erfunden, Gesichter drehen sich zum Betrachter
 * Leistung: Geometrie + Material werden je Figurentyp/Farbe EINMAL gebaut (Vorlage), jede Figur ist ein Klon,
 * der sich Geometrie/Material teilt. Alle gleichmaterialigen Anbauteile sind zu einer Geometrie verschmolzen
 * (Hundeköpfe: Vertexfarben, 3 Meshes: matt / glänzend / Metall). */
(function (g) {
  'use strict';
  const THREE = g.THREE;
  const PI = Math.PI;
  const TYPEN = ['pawn', 'knight', 'bishop', 'rook', 'queen', 'king'];
  const opt = { segmente: 40, kugel: 1 };   // Detailstufe (setzeDetail)

  const C = (r, gg, b) => new THREE.Color().setRGB(r, gg, b, THREE.SRGBColorSpace);
  const P = (x, y) => new THREE.Vector2(x, y);

  // ------------------------------------------------------------------ Materialien (Elfenbein / Ebenholz)
  const matCache = {};
  function material(farbe) {
    if (matCache[farbe]) return matCache[farbe];
    const w = farbe === 'white';
    matCache[farbe] = new THREE.MeshStandardMaterial({
      color: w ? C(0.90, 0.83, 0.70) : C(0.11, 0.085, 0.075), roughness: w ? 0.42 : 0.24, metalness: 0, envMapIntensity: w ? 1.0 : 1.9,
    });
    return matCache[farbe];
  }
  function stdMat(opts) { return new THREE.MeshStandardMaterial(opts); }

  // ------------------------------------------------------------------ Maße
  const formScale = 1.12;
  const rawHeight = { pawn: 0.62, rook: 0.77, knight: 0.90, bishop: 0.88, queen: 0.98, king: 1.10 };
  const dogProp = {  // baseR, neck, head, hat
    pawn: [0.28, 0.30, 1.10, 0.00], knight: [0.31, 0.40, 1.35, 0.20], bishop: [0.30, 0.42, 1.30, 0.26],
    rook: [0.33, 0.38, 1.40, 0.16], queen: [0.32, 0.48, 1.35, 0.10], king: [0.33, 0.52, 1.50, 0.20],
  };
  const dogNames = { king: 'Bruno', queen: 'Luna', rook: 'Brocken', bishop: 'Wurzel', knight: 'Falko', pawn: 'Welpe' };
  const dogBreeds = { king: 'Bernhardiner', queen: 'Windhund', rook: 'Bulldogge', bishop: 'Dackel', knight: 'Schäferhund', pawn: 'Welpe' };
  function dogHeight(t) { const p = dogProp[t]; return p[1] + 0.30 * p[2] + p[3]; }
  function hoehe(t, hunde) { return hunde ? dogHeight(t) : formScale * rawHeight[t]; }

  // ------------------------------------------------------------------ Drehprofile
  function arc(cy, rx, ry, von, bis, steps) {
    const a = [];
    for (let i = 0; i <= steps; i++) {
      const w = (von + (bis - von) * i / steps) * PI / 180;
      a.push(P(Math.max(0, rx * Math.cos(w)), cy + ry * Math.sin(w)));
    }
    return a;
  }
  const pts = l => l.map(p => P(p[0], p[1]));
  function base(r) {
    return [P(0, 0), P(r, 0), P(r, 0.05), P(r - 0.025, 0.075), P(r - 0.03, 0.09), P(r - 0.07, 0.11), P(r - 0.10, 0.125)];
  }
  function profile(t) {
    switch (t) {
      case 'pawn': return base(0.30).concat(pts([[0.19, 0.14], [0.13, 0.26], [0.105, 0.34], [0.16, 0.36], [0.16, 0.385], [0.10, 0.40]]), arc(0.50, 0.115, 0.115, -60, 90, 12));
      case 'rook': return base(0.33).concat(pts([[0.22, 0.15], [0.19, 0.30], [0.18, 0.46], [0.21, 0.49], [0.25, 0.52], [0.25, 0.66], [0.19, 0.66], [0.19, 0.60], [0.0, 0.60]]));
      case 'knight': return base(0.32).concat(pts([[0.22, 0.15], [0.21, 0.19], [0.0, 0.20]]));
      case 'bishop': return base(0.31).concat(pts([[0.19, 0.15], [0.125, 0.40], [0.175, 0.43], [0.175, 0.455], [0.105, 0.475]]), arc(0.62, 0.13, 0.17, -62, 90, 14));
      case 'queen': return base(0.34).concat(pts([[0.21, 0.15], [0.135, 0.48], [0.20, 0.52], [0.20, 0.545], [0.13, 0.575], [0.12, 0.66], [0.20, 0.81], [0.17, 0.82], [0.10, 0.84], [0.0, 0.86]]));
      default: return base(0.345).concat(pts([[0.21, 0.15], [0.14, 0.56], [0.215, 0.60], [0.215, 0.625], [0.145, 0.65], [0.13, 0.74], [0.20, 0.88], [0.0, 0.90]]));
    }
  }
  /** Lathe: Swift lathe(profile) – Normalen aus dem Profil, kein Doppel-Eckenglätten an den Rändern nötig */
  function lathe(profil, seg) {
    const geo = new THREE.LatheGeometry(profil, seg || opt.segmente);
    return geo;
  }

  // ------------------------------------------------------------------ Verschmelzen (gleiche Material-Gruppe -> 1 Geometrie)
  const _n = new THREE.Matrix3();
  function verschmelze(teile) {
    let nv = 0, ni = 0, farben = false;
    for (const t of teile) { nv += t.geo.attributes.position.count; ni += t.geo.index ? t.geo.index.count : t.geo.attributes.position.count; if (t.farbe) farben = true; }
    const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), col = farben ? new Float32Array(nv * 3) : null;
    const idx = new Uint32Array(ni);
    let vo = 0, io = 0;
    const v = new THREE.Vector3();
    for (const t of teile) {
      const gp = t.geo.attributes.position, gn = t.geo.attributes.normal, m = t.matrix || new THREE.Matrix4();
      _n.getNormalMatrix(m);
      const det = m.determinant();
      for (let i = 0; i < gp.count; i++) {
        v.fromBufferAttribute(gp, i).applyMatrix4(m); pos[(vo + i) * 3] = v.x; pos[(vo + i) * 3 + 1] = v.y; pos[(vo + i) * 3 + 2] = v.z;
        v.fromBufferAttribute(gn, i).applyMatrix3(_n).normalize(); nor[(vo + i) * 3] = v.x; nor[(vo + i) * 3 + 1] = v.y; nor[(vo + i) * 3 + 2] = v.z;
        if (col) { const c = t.farbe || new THREE.Color(1, 1, 1); col[(vo + i) * 3] = c.r; col[(vo + i) * 3 + 1] = c.g; col[(vo + i) * 3 + 2] = c.b; }
      }
      if (t.geo.index) {
        const gi = t.geo.index;
        for (let i = 0; i < gi.count; i += 3) {
          if (det >= 0) { idx[io++] = gi.getX(i) + vo; idx[io++] = gi.getX(i + 1) + vo; idx[io++] = gi.getX(i + 2) + vo; }
          else { idx[io++] = gi.getX(i) + vo; idx[io++] = gi.getX(i + 2) + vo; idx[io++] = gi.getX(i + 1) + vo; }
        }
      } else {
        for (let i = 0; i < gp.count; i += 3) { idx[io++] = i + vo; idx[io++] = i + vo + (det >= 0 ? 1 : 2); idx[io++] = i + vo + (det >= 0 ? 2 : 1); }
      }
      vo += gp.count;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    if (col) geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.setIndex(new THREE.BufferAttribute(idx, 1));
    geo.computeBoundingSphere(); geo.computeBoundingBox();
    return geo;
  }
  const _e = new THREE.Euler(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3();
  /** Matrix aus Position / Euler (SceneKit-Reihenfolge = three 'XYZ') / Skalierung */
  function mat(pos, rot, scl) {
    _e.set(rot ? rot[0] : 0, rot ? rot[1] : 0, rot ? rot[2] : 0, 'XYZ');
    _q.setFromEuler(_e);
    _p.set(pos ? pos[0] : 0, pos ? pos[1] : 0, pos ? pos[2] : 0);
    if (scl === undefined || scl === null) _s.set(1, 1, 1); else if (typeof scl === 'number') _s.set(scl, scl, scl); else _s.set(scl[0], scl[1], scl[2]);
    return new THREE.Matrix4().compose(_p, _q, _s);
  }
  const mul = (a, b) => new THREE.Matrix4().multiplyMatrices(a, b);

  // gemeinsame Einheitsgeometrien
  const einheit = {};
  function kugelGeo(seg) {
    const k = 'k' + seg;
    return einheit[k] || (einheit[k] = new THREE.SphereGeometry(1, seg, Math.max(6, Math.round(seg * 0.7))));
  }
  function boxGeo(w, h, l) { return new THREE.BoxGeometry(w, h, l); }
  function torusGeo(R, r, rad, tub) { const t = new THREE.TorusGeometry(R, r, rad || 6, tub || 20); t.rotateX(PI / 2); return t; }
  function kegelGeo(rt, rb, h, seg) { return new THREE.CylinderGeometry(rt, rb, h, seg || 12); }

  // ------------------------------------------------------------------ klassische Figuren
  const pferdeKopfGeo = (function () {
    let cache = null;
    return function () {
      if (cache) return cache;
      const s = new THREE.Shape();
      s.moveTo(-0.20, 0.16);
      s.lineTo(0.17, 0.16);
      s.bezierCurveTo(0.17, 0.28, 0.08, 0.34, 0.07, 0.42);
      s.bezierCurveTo(0.14, 0.47, 0.24, 0.47, 0.28, 0.52);
      s.bezierCurveTo(0.33, 0.55, 0.33, 0.61, 0.28, 0.63);
      s.bezierCurveTo(0.22, 0.68, 0.12, 0.74, 0.07, 0.80);
      s.lineTo(0.05, 0.90);
      s.lineTo(-0.03, 0.82);
      s.bezierCurveTo(-0.14, 0.78, -0.22, 0.68, -0.22, 0.55);
      s.bezierCurveTo(-0.22, 0.40, -0.26, 0.26, -0.20, 0.16);
      const geo = new THREE.ExtrudeGeometry(s, { depth: 0.16, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.02, bevelSegments: 2, curveSegments: 14 });
      geo.translate(0, 0, -0.08);
      cache = geo; return geo;
    };
  })();

  function baueKlassisch(farbe, typ) {
    const weiss = farbe === 'white';
    const haupt = [], detail = [];
    haupt.push({ geo: lathe(profile(typ)) });
    let detailFarbe = null;
    switch (typ) {
      case 'rook':
        for (let k = 0; k < 6; k++) {
          const a = k * PI / 3 + PI / 6;
          haupt.push({ geo: boxGeo(0.12, 0.11, 0.07), matrix: mat([0.215 * Math.cos(a), 0.715, 0.215 * Math.sin(a)], [0, -(a + PI / 2), 0]) });
        }
        break;
      case 'knight': {
        const rotY = weiss ? 0.87 : PI + 0.87;
        const mh = mat(null, [0, rotY, 0]);
        haupt.push({ geo: pferdeKopfGeo(), matrix: mh });
        haupt.push({ geo: boxGeo(0.05, 0.30, 0.06), matrix: mul(mh, mat([-0.19, 0.56, 0], [0, 0, 0.25])) });
        detailFarbe = weiss ? C(0.12, 0.12, 0.12) : C(0.75, 0.75, 0.75);
        for (const z of [0.1, -0.1]) detail.push({ geo: kugelGeo(8), matrix: mul(mh, mat([0.14, 0.70, z * 0.96], null, 0.022)) });
        break;
      }
      case 'bishop':
        haupt.push({ geo: kugelGeo(14), matrix: mat([0, 0.83, 0], null, 0.045) });
        detailFarbe = weiss ? C(0.35, 0.30, 0.25) : C(0.42, 0.36, 0.30);
        detail.push({ geo: boxGeo(0.02, 0.16, 0.29), matrix: mul(mat(null, [0, weiss ? -PI / 2 : PI / 2, 0]), mat([0.02, 0.68, 0], [0, 0, 0.55])) });
        break;
      case 'queen':
        for (let k = 0; k < 9; k++) {
          const a = k * 2 * PI / 9;
          haupt.push({ geo: kugelGeo(10), matrix: mat([0.182 * Math.cos(a), 0.835, 0.182 * Math.sin(a)], null, 0.036) });
        }
        haupt.push({ geo: kugelGeo(14), matrix: mat([0, 0.92, 0], null, 0.062) });
        break;
      case 'king':
        haupt.push({ geo: boxGeo(0.055, 0.21, 0.055), matrix: mat([0, 0.99, 0]) });
        haupt.push({ geo: boxGeo(0.17, 0.055, 0.055), matrix: mat([0, 1.02, 0]) });
        break;
      default: break;
    }
    const outer = new THREE.Group();
    const root = new THREE.Group();
    root.scale.setScalar(formScale);
    outer.add(root);
    const m1 = new THREE.Mesh(verschmelze(haupt), material(farbe));
    m1.castShadow = m1.receiveShadow = true;
    root.add(m1);
    if (detail.length) {
      const m2 = new THREE.Mesh(verschmelze(detail), stdMat({ color: detailFarbe, roughness: 0.5, metalness: 0 }));
      m2.castShadow = false; m2.receiveShadow = true;
      root.add(m2);
    }
    return outer;
  }

  // ------------------------------------------------------------------ Hunde-Team
  const dogSockelCache = {};
  function dogSockel(typ) {
    if (dogSockelCache[typ]) return dogSockelCache[typ];
    const p = dogProp[typ];
    const prof = base(p[0]).concat([P(p[0] - 0.11, 0.15), P(0.13, p[1] * 0.6), P(0.115, p[1] - 0.04), P(0.10, p[1] + 0.02), P(0.0, p[1] + 0.02)]);
    return (dogSockelCache[typ] = lathe(prof));
  }
  const badgeCache = {};
  const GLYPHEN = { king: '♚', queen: '♛', rook: '♜', bishop: '♝', knight: '♞', pawn: '♟' };
  function badgeTextur(typ, farbe) {
    const k = typ + farbe;
    if (badgeCache[k]) return badgeCache[k];
    const cv = document.createElement('canvas'); cv.width = cv.height = 128;
    const c = cv.getContext('2d');
    c.fillStyle = 'rgb(237,199,89)'; c.beginPath(); c.arc(64, 64, 64, 0, 7); c.fill();
    c.strokeStyle = 'rgb(140,102,26)'; c.lineWidth = 6; c.beginPath(); c.arc(64, 64, 58, 0, 7); c.stroke();
    c.font = "84px 'Apple Symbols','Segoe UI Symbol','DejaVu Sans','Noto Sans Symbols 2',serif";
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.lineWidth = 4; c.strokeStyle = farbe === 'white' ? 'rgb(64,64,64)' : '#000';
    c.fillStyle = farbe === 'white' ? '#fff' : 'rgb(26,26,26)';
    c.strokeText(GLYPHEN[typ], 64, 70); c.fillText(GLYPHEN[typ], 64, 70);
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
    return (badgeCache[k] = tex);
  }

  // Hundekopf (Blickrichtung +z, Kopfradius ~0.15). Teile je Gruppe: matt / glaenzend / metall
  const kopfCache = {};
  function hundeKopfGeos(t) {
    if (kopfCache[t]) return kopfCache[t];
    const G = { matt: [], gloss: [], metall: [] };
    const seg = opt.kugel;
    const schwarz = C(0.06, 0.05, 0.05), weiss = C(0.97, 0.96, 0.93), rosa = C(0.93, 0.45, 0.52);
    const gold = C(0.95, 0.75, 0.22);
    // Grundwerte je Rasse
    let furMain = C(0.4, 0.26, 0.15), furMuzzle = C(1, 1, 1), earColor = C(0.4, 0.26, 0.15);
    let skull = [1, 0.95, 0.95], muzPos = [0, -0.045, 0.125], muzScl = [1.0, 0.75, 1.15];
    switch (t) {
      case 'king': furMain = C(0.62, 0.32, 0.14); furMuzzle = C(0.97, 0.95, 0.90); earColor = C(0.48, 0.24, 0.10); skull = [1.08, 0.98, 1.0]; muzScl = [1.25, 0.85, 1.05]; break;
      case 'queen': furMain = C(0.80, 0.78, 0.76); furMuzzle = C(0.86, 0.84, 0.82); earColor = C(0.55, 0.53, 0.52); skull = [0.85, 0.9, 1.05]; muzPos = [0, -0.04, 0.16]; muzScl = [0.7, 0.62, 1.9]; break;
      case 'rook': furMain = C(0.82, 0.63, 0.42); furMuzzle = C(0.95, 0.91, 0.84); earColor = C(0.62, 0.44, 0.28); skull = [1.2, 0.9, 0.95]; muzPos = [0, -0.06, 0.115]; muzScl = [1.55, 0.95, 0.75]; break;
      case 'bishop': furMain = C(0.47, 0.21, 0.08); furMuzzle = C(0.42, 0.19, 0.08); earColor = C(0.33, 0.14, 0.05); skull = [0.92, 0.9, 1.0]; muzPos = [0, -0.04, 0.155]; muzScl = [0.85, 0.72, 1.75]; break;
      case 'knight': furMain = C(0.76, 0.52, 0.28); furMuzzle = C(0.20, 0.14, 0.10); earColor = C(0.18, 0.12, 0.08); skull = [0.95, 0.95, 1.0]; muzPos = [0, -0.04, 0.145]; muzScl = [0.9, 0.7, 1.5]; break;
      default: furMain = C(0.94, 0.86, 0.70); furMuzzle = C(0.98, 0.95, 0.88); earColor = C(0.60, 0.40, 0.24); skull = [1.05, 1.0, 1.0]; muzScl = [0.95, 0.7, 0.95]; break;
    }
    const blob = (grp, r, farbe, pos, scl, rot, s) => {
      const sg = s || (r < 0.03 ? Math.max(6, seg - 6) : seg);
      G[grp].push({ geo: kugelGeo(sg), farbe, matrix: mat(pos, rot, [r * scl[0], r * scl[1], r * scl[2]]) });
    };
    blob('matt', 0.15, furMain, [0, 0, 0], skull);
    blob('matt', 0.085, furMuzzle, muzPos, muzScl);
    const noseZ = muzPos[2] + 0.085 * muzScl[2] * 0.92;
    blob('gloss', 0.03, schwarz, [0, muzPos[1] + 0.03, noseZ], [1.2, 0.85, 0.9]);
    for (const sx of [-1, 1]) {
      const ex = sx * 0.058 * skull[0];
      blob('matt', 0.03, weiss, [ex, 0.035, 0.118], [1, 1, 0.6]);
      blob('gloss', 0.019, schwarz, [ex, 0.035, 0.134], [1, 1, 0.6]);
      blob('gloss', 0.006, weiss, [ex - sx * 0.006, 0.044, 0.146], [1, 1, 1], null, 6);
    }
    for (const sx of [-1, 1]) {
      switch (t) {
        case 'king': case 'pawn':
          blob('matt', 0.085, earColor, [sx * 0.145 * skull[0], -0.03, -0.01], [0.38, t === 'king' ? 1.15 : 0.95, 0.75], [0, 0, sx * 0.28]); break;
        case 'bishop': blob('matt', 0.085, earColor, [sx * 0.13, -0.07, 0.0], [0.35, 1.55, 0.7], [0, 0, sx * 0.12]); break;
        case 'knight':
          G.matt.push({ geo: kegelGeo(0.006, 0.052, 0.15), farbe: earColor, matrix: mat([sx * 0.075, 0.17, -0.02], [-0.1, 0, -sx * 0.3]) });
          G.matt.push({ geo: kegelGeo(0.004, 0.03, 0.1), farbe: rosa, matrix: mat([sx * 0.075, 0.16, -0.004], [-0.1, 0, -sx * 0.3]) });
          break;
        case 'rook': blob('matt', 0.05, earColor, [sx * 0.13, 0.105, -0.03], [1, 0.6, 0.5], [0, 0, sx * 0.6]); break;
        case 'queen': blob('matt', 0.05, earColor, [sx * 0.085, 0.07, -0.1], [0.45, 0.7, 1.25], [0.6, 0, 0]); break;
        default: break;
      }
    }
    // Rasse-Details
    if (t === 'king') {
      G.matt.push({ geo: boxGeo(0.045, 0.12, 0.02), farbe: weiss, matrix: mat([0, 0.07, 0.138], [-0.35, 0, 0]) });
      const patch = C(0.28, 0.13, 0.05);
      for (const sx of [-1, 1]) blob('matt', 0.045, patch, [sx * 0.063, 0.036, 0.108], [1.1, 0.9, 0.35]);
    } else if (t === 'rook') {
      for (const sx of [-1, 1]) {
        blob('matt', 0.05, furMuzzle, [sx * 0.07, -0.085, 0.12], [1, 0.9, 0.8]);
        G.matt.push({ geo: kegelGeo(0.001, 0.009, 0.025, 6), farbe: weiss, matrix: mat([sx * 0.03, -0.075, 0.175]) });
      }
    } else if (t === 'knight') {
      blob('matt', 0.13, C(0.16, 0.11, 0.08), [0, 0.06, -0.04], [0.95, 0.6, 0.9]);
    } else if (t === 'pawn') {
      blob('matt', 0.045, earColor, [0.062, 0.04, 0.108], [1.0, 0.95, 0.35]);
      blob('matt', 0.025, rosa, [0, -0.1, 0.15], [0.9, 0.35, 1.2], [0.3, 0, 0]);
    }
    // Accessoires (zeigen die Schachrolle)
    const ring = (ri, ra, h, s) => lathe([P(ri, -h / 2), P(ra, -h / 2), P(ra, h / 2), P(ri, h / 2), P(ri, -h / 2)], s || 20);
    if (t === 'king') {   // Krone
      const mc = mat([0, 0.165, -0.01]);
      G.metall.push({ geo: ring(0.075, 0.09, 0.05), matrix: mc, farbe: gold });
      for (let k = 0; k < 5; k++) {
        const a = k * 2 * PI / 5;
        G.metall.push({ geo: kegelGeo(0, 0.022, 0.06, 8), matrix: mul(mc, mat([0.082 * Math.cos(a), 0.05, 0.082 * Math.sin(a)])), farbe: gold });
      }
      G.gloss.push({ geo: kugelGeo(8), farbe: C(0.85, 0.1, 0.15), matrix: mul(mc, mat([0, 0, 0.09], null, [0.018, 0.018, 0.0108])) });
    } else if (t === 'queen') {  // Diadem
      G.metall.push({ geo: torusGeo(0.11, 0.009, 5, 28), farbe: gold, matrix: mat([0, 0.1, -0.01], [-0.35, 0, 0]) });
      G.gloss.push({ geo: kugelGeo(8), farbe: C(0.15, 0.35, 0.95), matrix: mat([0, 0.135, 0.1], null, [0.022, 0.0264, 0.0132]) });
    } else if (t === 'rook') {   // Burghut
      const stone = C(0.62, 0.60, 0.56), mh = mat([0, 0.17, -0.01]);
      G.matt.push({ geo: new THREE.CylinderGeometry(0.1, 0.1, 0.08, 20), farbe: stone, matrix: mh });
      for (let k = 0; k < 4; k++) {
        const a = k * PI / 2 + PI / 4;
        G.matt.push({ geo: boxGeo(0.05, 0.045, 0.04), farbe: stone, matrix: mul(mh, mat([0.075 * Math.cos(a), 0.06, 0.075 * Math.sin(a)], [0, -(a + PI / 2), 0])) });
      }
    } else if (t === 'bishop') {  // Bischofsmütze
      const mm = mat([0, 0.2, -0.015], null, [1, 1, 0.7]);
      G.matt.push({ geo: kegelGeo(0.02, 0.085, 0.2, 16), farbe: C(0.45, 0.18, 0.62), matrix: mm });
      G.metall.push({ geo: torusGeo(0.082, 0.01, 5, 20), farbe: gold, matrix: mul(mm, mat([0, -0.085, 0])) });
      G.metall.push({ geo: kugelGeo(8), farbe: gold, matrix: mul(mm, mat([0, 0.105, 0], null, 0.02)) });
    } else if (t === 'knight') {  // Federbusch
      const plume = C(0.85, 0.12, 0.12);
      [0.02, -0.04, -0.1].forEach((z, i) => blob('matt', 0.05, plume, [0, 0.2 - i * 0.02, z], [0.45, 1.3, 0.6], [-0.5 - i * 0.25, 0, 0]));
    }
    const out = {};
    for (const k of ['matt', 'gloss', 'metall']) out[k] = G[k].length ? verschmelze(G[k].map(x => ({ geo: x.geo, matrix: x.matrix, farbe: x.farbe || new THREE.Color(1, 1, 1) }))) : null;
    return (kopfCache[t] = out);
  }
  let hundeMats = null;
  function hundeMaterialien() {
    return hundeMats || (hundeMats = {
      matt: stdMat({ vertexColors: true, roughness: 0.78, metalness: 0 }),
      gloss: stdMat({ vertexColors: true, roughness: 0.25, metalness: 0 }),
      metall: stdMat({ vertexColors: true, roughness: 0.25, metalness: 0.9 }),
    });
  }
  const halsMat = {};
  function halsbandMat(farbe) {
    return halsMat[farbe] || (halsMat[farbe] = stdMat({ color: farbe === 'white' ? C(0.95, 0.75, 0.25) : C(0.78, 0.80, 0.85), roughness: 0.25, metalness: 0.9 }));
  }

  function baueHund(farbe, typ) {
    const p = dogProp[typ];
    const outer = new THREE.Group();
    const sockel = new THREE.Mesh(dogSockel(typ), material(farbe));
    sockel.castShadow = sockel.receiveShadow = true;
    outer.add(sockel);
    const hb = halsbandMat(farbe);
    const collar = new THREE.Mesh(torusGeo(0.118, 0.022, 8, 28), hb);
    collar.position.set(0, p[1] - 0.01, 0); collar.castShadow = true;
    outer.add(collar);
    // Plakette (Billboard um Y)
    const holder = new THREE.Group();
    holder.position.set(0, p[1] - 0.06, 0);
    holder.userData.billboard = true;
    const zyl = new THREE.Mesh(new THREE.CylinderGeometry(0.062, 0.062, 0.014, 20), hb);
    zyl.rotation.x = PI / 2; zyl.position.z = 0.14;
    const scheibe = new THREE.Mesh(new THREE.CircleGeometry(0.058, 24),
      new THREE.MeshStandardMaterial({ map: badgeTextur(typ, farbe), roughness: 0.35, metalness: 0.3 }));
    scheibe.position.z = 0.1475;
    holder.add(zyl, scheibe);
    outer.add(holder);
    // Kopf (Billboard um Y)
    const kopf = new THREE.Group();
    kopf.name = 'hundekopf';
    kopf.userData.billboard = true;
    kopf.scale.setScalar(p[2]);
    kopf.position.set(0, p[1] + 0.13 * p[2], 0);
    const geos = hundeKopfGeos(typ), mats = hundeMaterialien();
    for (const k of ['matt', 'gloss', 'metall']) {
      if (!geos[k]) continue;
      const m = new THREE.Mesh(geos[k], mats[k]);
      m.castShadow = true; m.receiveShadow = k === 'matt';
      kopf.add(m);
    }
    outer.add(kopf);
    return outer;
  }

  // ------------------------------------------------------------------ öffentliche API
  const vorlagen = {};
  function erzeuge(farbe, typ, hunde) {
    const key = (hunde ? 'd' : 'k') + farbe + typ;
    if (!vorlagen[key]) vorlagen[key] = hunde ? baueHund(farbe, typ) : baueKlassisch(farbe, typ);
    const n = vorlagen[key].clone(true);
    n.userData = { farbe, typ, hunde: !!hunde, key, hoehe: hoehe(typ, hunde) };
    n.name = 'P_' + key;
    return n;
  }

  const _wp = new THREE.Vector3(), _qa = new THREE.Quaternion(), _qb = new THREE.Quaternion(), _ax = new THREE.Vector3(0, 1, 0);
  /** Hundeköpfe/Plaketten drehen sich (nur um Y) zum Betrachter – wie SCNBillboardConstraint(freeAxes: .Y) */
  function billboards(wurzel, kamPos) {
    wurzel.traverse(o => {
      if (!o.userData.billboard || !o.parent) return;
      o.parent.getWorldPosition(_wp);
      const yaw = Math.atan2(kamPos.x - _wp.x, kamPos.z - _wp.z);
      o.parent.getWorldQuaternion(_qa).invert();
      _qb.setFromAxisAngle(_ax, yaw);
      o.quaternion.copy(_qa.multiply(_qb));
    });
  }

  function setzeDetail(stufe) {   // 0 niedrig, 1 normal, 2 hoch – nur vor dem ersten erzeuge() wirksam
    opt.segmente = [24, 36, 48][stufe]; opt.kugel = [8, 12, 16][stufe];
  }

  g.Figuren3D = {
    TYPEN, material, hoehe, formScale, rawHeight, profile, erzeuge, billboards, setzeDetail,
    hundeName: t => dogNames[t], hundeRasse: t => dogBreeds[t], hundeHoehe: dogHeight,
    verschmelze, mat, mul, C, lathe,
  };
})(typeof window !== 'undefined' ? window : globalThis);
