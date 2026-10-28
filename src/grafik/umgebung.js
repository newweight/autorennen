// ============================================================
// Grafik G2 – Umgebung (Autorennen UND Motorrad). NUR bei „Schön“ / „Ultra“ aktiv; Normal = bitgleich (dieses Skript tut dann nichts).
//   Himmel   : Shader-Kuppel (1 Draw-Call, nur dort gezeichnet, wo noch Himmel ist): Farbverlauf, Sonnenscheibe + Glühen in Lichtrichtung,
//              Wolken (fbm; Ultra: mehr Lagen + Zirren), respektiert Tag/Dämmerung/Nacht (Farben aus der alten Kuppel), Wetter
//              (Regen/Schnee/Hagel = geschlossene graue Decke, Nebel/Sandsturm = Dunst ohne Wolken). Die alten Wolken-Kugeln/Sonnenscheibe/Kuppel werden
//              nur ausgeblendet (Rückschalten blendet sie wieder ein). Sterne bleiben.
//   Gras     : Büschel (7/5 Dreiecke) + Blumen neben der Strecke (InstancedMesh, Gras in Stücken je ~150 m wegen Sichtkegel-Auswahl, Blumen 1 Mesh),
//              Wind-Wiegen im Vertex-Shader, nie auf Fahrbahn/Randstein/hinter Sperrzonen (spline.naechster + dekoSperre), Dichte begrenzt.
//   Bäume    : nur Optik: Geometrie der vorhandenen InstancedMeshes (Tannen, Laubbaeume, Baeume) wird gegen reichere Formen getauscht
//              (Stamm + mehrere Kronen-Lagen/Blätterballen mit Vertex-Farbverlauf). Instanz-Matrizen/-Farben = Positionen bleiben, Kollision unberührt.
//   Asphalt  : prozedurale Canvas-Textur (Körnung, Steinchen, Flecken), per UV aus Weltkoordinaten (Straße hat keine UVs → geteilte Geometrie-Kopie
//              mit uv-Attribut); Ultra: zusätzlich Bump-Map + MeshStandardMaterial (bei Nässe glatter).
//   Staub    : wenige Partikel (Points, 1 Draw-Call) hinter Fahrzeugen auf Gras/Sand/Randstreifen.
// Zufall: eigener Generator (Math.random wird NIE angefasst → Simulation/Server unberührt). Wird von grafik.js (G1) über G.haken gerufen.
// ============================================================
(function () {
  const R = window.Rennspiel, G = R && R.Grafik;
  if (!G || typeof THREE === 'undefined') return;
  const MOTO = window.MOTORRAD === true;

  const PARAM = {
    schoen: { gras: 7000, blumen: 500, klingen: 6, tannSeg: 8, tannLagen: 5, laubBlobs: 5, staub: 70, oktaven: 4, zirren: false, bump: false },
    ultra: { gras: 22000, blumen: 1800, klingen: 8, tannSeg: 11, tannLagen: 7, laubBlobs: 7, staub: 200, oktaven: 6, zirren: true, bump: true },
  };

  function zufall(seed) {
    let a = seed >>> 0;
    return function () { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  const klemme = (v, a, b) => Math.max(a, Math.min(b, v));
  const hash3 = (x, y, z) => { const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453; return s - Math.floor(s); };

  // ---------- Geometrie-Helfer ----------
  /** Teile (Geometrie + Farbe oder Farbfunktion) zu EINER nicht-indizierten Geometrie mit Vertex-Farben vereinen. */
  function vereinen(teile) {
    let n = 0; const gs = teile.map((t) => { const g = t.geo.index ? t.geo.toNonIndexed() : t.geo; n += g.attributes.position.count; return g; });
    const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), col = new Float32Array(n * 3), c = new THREE.Color();
    let o = 0;
    gs.forEach((g, k) => {
      g.computeVertexNormals();
      const p = g.attributes.position, nn = g.attributes.normal, f = teile[k].farbe;
      for (let i = 0; i < p.count; i++) {
        pos.set([p.getX(i), p.getY(i), p.getZ(i)], (o + i) * 3); nor.set([nn.getX(i), nn.getY(i), nn.getZ(i)], (o + i) * 3);
        if (typeof f === 'function') f(p.getX(i), p.getY(i), p.getZ(i), nn.getY(i), c); else c.set(f);
        col.set([c.r, c.g, c.b], (o + i) * 3);
      }
      o += p.count; teile[k].geo.dispose(); if (g !== teile[k].geo) g.dispose();
    });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.computeBoundingSphere(); geo.computeBoundingBox();
    return geo;
  }
  /** Ballen (Ikosaeder Detail 1) mit leichter radialer Unruhe an der Oberfläche. */
  function blob(r, x, y, z, sy, unruhe, detail) {
    const g = new THREE.IcosahedronGeometry(r, detail === undefined ? 1 : detail), p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const f = 1 + unruhe * (hash3(Math.round(p.getX(i) * 40), Math.round(p.getY(i) * 40), Math.round(p.getZ(i) * 40) + x * 7) - 0.5) * 2;
      p.setXYZ(i, p.getX(i) * f, p.getY(i) * f * (sy || 1), p.getZ(i) * f);
    }
    g.translate(x, y, z);
    return g;
  }
  const mix = (a, b, t) => a + (b - a) * t;
  const farbeLerp = (c, h1, h2, t) => { const a = new THREE.Color(h1), b = new THREE.Color(h2); return c.copy(a).lerp(b, klemme(t, 0, 1)); };

  function tanneReich(P) {
    const rnd = zufall(1103), teile = [], n = P.tannLagen, seg = P.tannSeg;
    const stamm = new THREE.CylinderGeometry(0.17, 0.36, 2.2, 7); stamm.translate(0, 1.1, 0);
    teile.push({ geo: stamm, farbe: (x, y, z, ny, c) => farbeLerp(c, 0x35241a, 0x5a3c22, y / 2.2) });
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1), y0 = 1.25 + t * 4.25, h = 2.7 - t * 1.0, r = 2.3 * (1 - t * 0.84);
      const g = new THREE.ConeGeometry(r, h, seg, 1, false), p = g.attributes.position;
      for (let k = 0; k < p.count; k++) if (p.getY(k) < 0) { const f = 0.86 + 0.28 * hash3(Math.round(p.getX(k) * 30), i, Math.round(p.getZ(k) * 30)); p.setXYZ(k, p.getX(k) * f, p.getY(k) - 0.12 * r * 0.3, p.getZ(k) * f); }
      g.translate(0, y0 + h / 2, 0);
      teile.push({ geo: g, farbe: (x, y, z, ny, c) => { farbeLerp(c, 0x1d4424, 0x3f7c45, t * 0.8 + (y - y0) / h * 0.25); if (y < y0 + h * 0.05) c.multiplyScalar(0.72); return c; } });
    }
    return vereinen(teile);
  }
  function laubbaumReich(P) {
    const teile = [], B = [[0, 4.5, 0, 2.2, 0.85], [1.3, 5.3, 0.5, 1.5, 0.9], [-1.3, 4.9, -0.6, 1.5, 0.9], [0.2, 6.1, -0.4, 1.35, 0.9], [0.4, 4.1, 1.4, 1.35, 0.85], [-0.7, 4.3, -1.3, 1.3, 0.85], [1.2, 4.6, -1.2, 1.2, 0.9]];
    const stamm = new THREE.CylinderGeometry(0.2, 0.42, 3.6, 7); stamm.translate(0, 1.8, 0);
    teile.push({ geo: stamm, farbe: (x, y, z, ny, c) => farbeLerp(c, 0x3e2a18, 0x6b4a2b, y / 3.6) });
    [[0.9, 0.5, 0.9, 0.7], [-0.9, -0.5, 0.8, 0.65]].forEach(([dx, dz, l, r]) => {      // zwei Äste in die Krone
      const a = new THREE.CylinderGeometry(0.08, 0.16, l * 2, 5); a.translate(0, l, 0); a.rotateZ(-dx * 0.55); a.rotateY(Math.atan2(dz, dx)); a.translate(0, 3.0, 0);
      teile.push({ geo: a, farbe: 0x5b3e24 });
    });
    for (let i = 0; i < P.laubBlobs; i++) {
      const b = B[i], g = blob(b[3], b[0], b[1], b[2], b[4], 0.13, 1), ton = 0.85 + 0.3 * hash3(i, 3, 9);
      teile.push({ geo: g, farbe: (x, y, z, ny, c) => { farbeLerp(c, 0x2a5f20, 0x5fa23c, (y - (b[1] - b[3])) / (b[3] * 1.9) * 0.8 + ny * 0.15); return c.multiplyScalar(ton); } });
    }
    return vereinen(teile);
  }
  /** Kronen der einfachen „Baeume“ (Einheitsgröße wie das Original, der Instanz-Maßstab bleibt). */
  function laubkroneReich(P) {
    const B = [[0, 0, 0, 0.8], [0.5, 0.28, 0.15, 0.55], [-0.5, 0.1, -0.25, 0.55], [0.1, 0.45, -0.3, 0.46], [0.15, -0.1, 0.5, 0.5], [-0.2, 0.2, 0.55, 0.42], [0.45, 0.0, -0.5, 0.42]], teile = [];
    for (let i = 0; i < P.laubBlobs; i++) {
      const b = B[i], ton = 0.88 + 0.22 * hash3(i, 5, 2);
      teile.push({ geo: blob(b[3], b[0], b[1], b[2], 0.9, 0.12, 1), farbe: (x, y, z, ny, c) => { const v = (0.78 + 0.34 * klemme((y + 0.8) / 1.6, 0, 1) + ny * 0.06) * ton; return c.setRGB(v, v, v); } });
    }
    return vereinen(teile);
  }
  function tannkroneReich(P) {
    const teile = [], n = P.tannLagen, seg = P.tannSeg;
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1), y0 = t * 0.5, h = 0.5, r = 1 - t * 0.78;
      const g = new THREE.ConeGeometry(r, h, seg, 1, false), p = g.attributes.position;
      for (let k = 0; k < p.count; k++) if (p.getY(k) < 0) { const f = 0.88 + 0.24 * hash3(Math.round(p.getX(k) * 30), i, Math.round(p.getZ(k) * 30)); p.setXYZ(k, p.getX(k) * f, p.getY(k), p.getZ(k) * f); }
      g.translate(0, y0 + h / 2, 0);
      teile.push({ geo: g, farbe: (x, y, z, ny, c) => { const v = 0.74 + 0.36 * t + (y - y0) / h * 0.08; return c.setRGB(v, v, v); } });
    }
    return vereinen(teile);
  }
  function grasbueschel(klingen) {
    const rnd = zufall(77), pos = [], col = [], nor = [];
    for (let k = 0; k < klingen; k++) {
      const w = (k / klingen) * Math.PI * 2 + rnd() * 0.6, rad = 0.05 + rnd() * 0.07, hoehe = 0.22 + rnd() * 0.3, lean = 0.04 + rnd() * 0.12, bw = 0.03 + rnd() * 0.022;
      const cx = Math.cos(w) * rad, cz = Math.sin(w) * rad, tx = Math.cos(w + 1.57) * bw, tz = Math.sin(w + 1.57) * bw;
      pos.push(cx - tx, 0, cz - tz, cx + tx, 0, cz + tz, cx + Math.cos(w) * lean, hoehe, cz + Math.sin(w) * lean);
      const ton = 0.85 + 0.3 * rnd();
      col.push(0.78 * ton, 0.78 * ton, 0.78 * ton, 0.78 * ton, 0.78 * ton, 0.78 * ton, 1.3 * ton, 1.3 * ton, 1.3 * ton);
      nor.push(0, 1, 0, 0, 1, 0, 0, 1, 0);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    return g;
  }
  function blumeGeo() {
    const stiel = [-0.012, 0, 0, 0.012, 0, 0, 0, 0.34, 0.03], kopf = new THREE.CircleGeometry(0.075, 6); kopf.rotateX(-Math.PI / 2 + 0.5); kopf.translate(0, 0.35, 0.035);
    const kp = kopf.attributes.position, pos = stiel.slice(), col = [0.35, 0.55, 0.2, 0.35, 0.55, 0.2, 0.45, 0.7, 0.25], nor = [0, 1, 0, 0, 1, 0, 0, 1, 0];
    const idx = kopf.index; for (let i = 0; i < idx.count; i++) { const v = idx.getX(i); pos.push(kp.getX(v), kp.getY(v), kp.getZ(v)); col.push(1, 1, 1); nor.push(0, 1, 0); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    kopf.dispose(); return g;
  }

  // ---------- Asphalt-Textur ----------
  function asphaltTextur(renderer) {
    const N = 256, c = document.createElement('canvas'); c.width = c.height = N; const x = c.getContext('2d'), rnd = zufall(31337);
    const bild = x.createImageData(N, N), d = bild.data;
    for (let i = 0; i < N * N; i++) { const v = 218 + Math.floor(rnd() * 34 - 8 + (rnd() < 0.04 ? -34 : 0)); d[i * 4] = v; d[i * 4 + 1] = v; d[i * 4 + 2] = v + 1; d[i * 4 + 3] = 255; }
    x.putImageData(bild, 0, 0);
    const kachel = (fn) => { for (let ox = -N; ox <= N; ox += N) for (let oy = -N; oy <= N; oy += N) fn(ox, oy); };
    for (let k = 0; k < 14; k++) {          // weiche Flecken (Teerflicken, Abrieb)
      const px = rnd() * N, py = rnd() * N, r = 26 + rnd() * 46, dunkel = rnd() < 0.6, a = 0.07 + rnd() * 0.07;
      kachel((ox, oy) => { const g = x.createRadialGradient(px + ox, py + oy, 0, px + ox, py + oy, r); g.addColorStop(0, dunkel ? `rgba(60,60,64,${a})` : `rgba(255,255,255,${a * 0.8})`); g.addColorStop(1, 'rgba(128,128,128,0)'); x.fillStyle = g; x.fillRect(px + ox - r, py + oy - r, 2 * r, 2 * r); });
    }
    for (let k = 0; k < 520; k++) {          // Splitt: kleine helle/dunkle Steinchen
      const px = rnd() * N, py = rnd() * N, r = 0.6 + rnd() * 1.2, hell = rnd() < 0.5, a = 0.25 + rnd() * 0.35;
      kachel((ox, oy) => { x.fillStyle = hell ? `rgba(255,255,255,${a})` : `rgba(40,40,44,${a})`; x.beginPath(); x.arc(px + ox, py + oy, r, 0, 6.2832); x.fill(); });
    }
    const map = new THREE.CanvasTexture(c); map.wrapS = map.wrapT = THREE.RepeatWrapping; map.colorSpace = THREE.SRGBColorSpace;
    map.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy ? renderer.capabilities.getMaxAnisotropy() : 1);
    const bump = new THREE.CanvasTexture(c); bump.wrapS = bump.wrapT = THREE.RepeatWrapping; bump.anisotropy = map.anisotropy;
    return { map, bump };
  }

  // ---------- Himmel-Shader ----------
  const SKY_VS = `varying vec3 vDir;
void main(){ vDir = position; vec4 p = projectionMatrix * vec4(mat3(viewMatrix) * position * 10.0, 1.0); gl_Position = p.xyww; gl_Position.z = p.w * 0.99999; }`;
  const SKY_FS = `uniform vec3 uTop, uMid, uHor, uSunCol, uSunDir, uLit, uShade;
uniform float uCover, uDeck, uTime, uSunSize, uNight, uCirrus, uSeed;
varying vec3 vDir;
float hash(vec2 p){ p = fract(p * vec2(123.34, 456.21) + uSeed); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float noise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y); }
float fbm(vec2 p){ float a = 0.5, s = 0.0; for (int i = 0; i < OKT; i++) { s += a * noise(p); p = p * 2.03 + 17.1; a *= 0.5; } return s; }
void main(){
  vec3 d = normalize(vDir); float h = d.y;
  vec3 col = mix(uHor, uMid, smoothstep(0.0, 0.3, h)); col = mix(col, uTop, smoothstep(0.22, 0.9, h));
  float sd = max(dot(d, uSunDir), 0.0);
  col += uSunCol * (pow(sd, 6.0) * 0.16 + pow(sd, 40.0) * 0.28) * (1.0 - 0.6 * uNight);
  float disk = smoothstep(cos(uSunSize), cos(uSunSize * 0.82), dot(d, uSunDir));
  float hz = smoothstep(0.015, 0.2, h);
  if (h > 0.0 && (uCover > 0.001 || uDeck > 0.001)) {
    vec2 p = d.xz / (h + 0.13) * 0.85 + vec2(uTime * 0.012, uTime * 0.005);
    float n = fbm(p), n2 = fbm(p + uSunDir.xz * 0.14 / (uSunDir.y + 0.25) * 0.5);
    float dens = smoothstep(1.0 - uCover, 1.0 - uCover + 0.3, n);
    dens = mix(dens, 0.9 + 0.1 * n, uDeck);
    float licht = clamp(0.62 + (n - n2) * 3.2, 0.0, 1.0);
    vec3 cc = mix(uShade, uLit, licht); cc = mix(cc, uLit, (1.0 - dens) * 0.5 * (1.0 - uDeck));
    float v = mix(1.0, 1.0 - 0.35 * smoothstep(0.55, 1.0, dens), 1.0 - uDeck * 0.5);
    cc *= v;
    float sil = pow(sd, 3.0) * (1.0 - uDeck) * (1.0 - uNight) * smoothstep(0.35, 0.9, dens) * 0.35;  // helle Wolkenränder zur Sonne
    col = mix(col, cc + uSunCol * sil, dens * hz * (1.0 - disk * 0.6));
    #if CIRRUS
    if (uDeck < 0.5) { vec2 q = d.xz / (h + 0.3) * vec2(0.5, 2.2) + vec2(uTime * 0.006, 3.1); float c2 = smoothstep(0.55, 0.9, fbm(q * 2.2)) * smoothstep(0.08, 0.4, h) * 0.5 * (1.0 - uNight * 0.7); col = mix(col, mix(uLit, uSunCol, 0.15 * (1.0 - uNight)), c2); }
    #endif
  }
  col += uSunCol * disk * 4.0 * (h > -0.02 ? 1.0 : 0.0) * (uDeck < 0.5 ? 1.0 : 0.0) * (1.0 - smoothstep(0.55, 0.9, uCover) * 0.0);
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

  // ---------- Zustand ----------
  const LOESCHEN = { Wolken: 1, Sonne: 1, Mond: 1, Himmelskuppel: 1 };
  let _bild = null;
  const farbe3 = (hex) => new THREE.Color(hex);

  function himmelBauen(sp, P, st) {
    const sz = sp.szene, w = sp.wetter;
    const bg = sz.background && sz.background.isColor ? sz.background.clone() : new THREE.Color(0x8fc8ff);
    const nebel = sz.fog ? sz.fog.color.clone() : bg.clone();
    const daten = (w && w.daten) || {}, T = w && w.tz && w.tz.himmel ? w.tz : null;
    const keine = !!(w && (w.wetterArt === 'nebel' || w.wetterArt === 'sandsturm'));
    const deck = !!daten.wolkenDecke;
    let top, mid, hor = nebel.clone(), lit, shade, sonneCol = new THREE.Color(1, 0.94, 0.78), nacht = 0, sunSize = 0.045;
    // Farben: Dämmerung/Nacht aus der alten Himmelskuppel (schon mit Wetter gemischt), Tag aus Hintergrund/Nebel
    let alt = null; if (w && w._himmel) w._himmel.children.forEach((o) => { if (o.name === 'Himmelskuppel') alt = o; });
    if (alt && T) {
      const col = alt.geometry.attributes.color, p = alt.geometry.attributes.position, nimm = (yz) => { let b = 0, bd = 9; for (let i = 0; i < p.count; i++) { const dd = Math.abs(p.getY(i) - yz); if (dd < bd) { bd = dd; b = i; } } return new THREE.Color(col.getX(b), col.getY(b), col.getZ(b)); };
      hor = nimm(0.03); mid = nimm(0.3); top = nimm(0.93);
      lit = farbe3(T.wolken ? T.wolken[0] : 0xffffff); shade = farbe3(T.wolken ? T.wolken[1] : 0x808080).lerp(lit, 0.18);
      if (T.sonnenScheibe) { sonneCol = new THREE.Color().setRGB(T.sonnenScheibe[0], T.sonnenScheibe[1], T.sonnenScheibe[2]); sunSize = 0.075; }
      if (T.mond) { sonneCol = new THREE.Color(0.8, 0.86, 1.0); nacht = 1; sunSize = 0.032; }
      if (deck) { const d = 1 - (T.wetterHell === undefined ? 1 : T.wetterHell); lit = lit.clone().lerp(new THREE.Color(0x777777), 0.5).multiplyScalar(1 - d); shade = lit.clone().multiplyScalar(0.6); }
    } else {
      const graue = deck ? 0.78 : 0;
      top = bg.clone().multiply(new THREE.Color(mix(0.5, 0.9, graue), mix(0.68, 0.9, graue), mix(1.0, 0.95, graue)));
      mid = bg.clone().multiply(new THREE.Color(mix(0.78, 0.96, graue), mix(0.9, 0.96, graue), mix(1.04, 1.0, graue)));
      lit = deck ? nebel.clone().lerp(new THREE.Color(0x9aa0a8), 0.55) : new THREE.Color(1, 1, 1);
      shade = deck ? lit.clone().multiplyScalar(0.58) : new THREE.Color(0.58, 0.64, 0.76);
    }
    if (keine) { top = mid = hor; }      // Dunst: alles in Nebelfarbe
    // Sonnenrichtung wie das Licht; Höhe höchstens 26° (sonst nie im Bild)
    const L = (w && w._sonnenRichtung) ? w._sonnenRichtung.clone() : (st.richtung || new THREE.Vector3(0.5, 0.75, 0.3)).clone();
    L.normalize(); const fl = Math.hypot(L.x, L.z) || 1, el = Math.min(Math.asin(klemme(L.y, -1, 1)), 26 * Math.PI / 180);
    const sunDir = new THREE.Vector3(L.x / fl * Math.cos(el), Math.sin(el), L.z / fl * Math.cos(el));
    const cover = keine ? 0 : deck ? 1 : (sp.strecke && sp.strecke.daten && sp.strecke.daten.thema === 'wueste' ? 0.2 : 0.5);
    const mat = new THREE.ShaderMaterial({
      vertexShader: SKY_VS, fragmentShader: SKY_FS, depthWrite: false, depthTest: true, side: THREE.BackSide, fog: false, toneMapped: true,
      defines: { OKT: P.oktaven, CIRRUS: P.zirren ? 1 : 0 },
      uniforms: {
        uTop: { value: top }, uMid: { value: mid }, uHor: { value: hor }, uSunCol: { value: keine || deck ? new THREE.Color(0, 0, 0) : sonneCol }, uSunDir: { value: sunDir },
        uLit: { value: lit }, uShade: { value: shade }, uCover: { value: cover }, uDeck: { value: deck && !keine ? 1 : 0 }, uTime: { value: 0 },
        uSunSize: { value: sunSize }, uNight: { value: nacht }, uCirrus: { value: P.zirren ? 1 : 0 }, uSeed: { value: ((sp._wetterSeed || 1) % 997) / 997 },
      },
    });
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 40, 20), mat);
    mesh.name = 'G2Himmel'; mesh.frustumCulled = false; mesh.renderOrder = 100;
    sz.add(mesh); st.himmel = mesh;
    // alte Himmelsteile ausblenden (Sterne bleiben)
    if (w && w._himmel) w._himmel.children.forEach((o) => { if (LOESCHEN[o.name] && o.visible) { o.visible = false; st.versteckt.push(o); } });
  }

  function baeumeTauschen(sp, P, st) {
    const cache = st.baumGeo || (st.baumGeo = {});
    const hole = (art) => cache[art] || (cache[art] = ({ tanne: tanneReich, laub: laubbaumReich, laubkrone: laubkroneReich, tannkrone: tannkroneReich })[art](P));
    sp.szene.traverse((o) => {
      if (!o.isInstancedMesh || o.userData.g2Baum || !o.geometry) return;
      const g = o.geometry, n = o.name; let art = null;
      if (n === 'Tannen' && g.attributes.color) art = 'tanne';
      else if (n === 'Laubbaeume' && g.attributes.color) art = 'laub';
      else if (n === 'Baeume' && g.type === 'IcosahedronGeometry') art = 'laubkrone';
      else if (n === 'Baeume' && g.type === 'ConeGeometry') art = 'tannkrone';
      if (!art) return;
      const neu = hole(art), e = { geo: g, mat: o.material };
      if (art === 'laub' && g.userData.jzNeutral) { if (!neu.userData.neutral) { const a = neu.attributes.color.array; for (let i = 0; i < a.length; i += 3) if (a[i + 1] > a[i] * 1.05 && a[i + 1] > a[i + 2]) { const h = Math.min(1, 0.82 + 0.18 * a[i + 1] / Math.max(a[i + 1], 0.3)); a[i] = a[i + 1] = a[i + 2] = h; } neu.userData.neutral = true; } }
      if (art === 'laubkrone' || art === 'tannkrone') {
        const m = st.baumMat.get(o.material) || (() => { const x = new THREE.MeshLambertMaterial({ color: o.material.color.clone(), flatShading: !!o.material.flatShading, vertexColors: true }); st.baumMat.set(o.material, x); return x; })();
        o.material = m;
      }
      o.geometry = neu; o.userData.g2Baum = e; st.baeume.push(o);
    });
  }

  function strasseTauschen(sp, P, st) {
    if (!st.tex) st.tex = asphaltTextur(sp.renderer);
    const nass = !!(sp.wetter && sp.wetter.daten && sp.wetter.daten.partikel && /striche|koerner/.test(sp.wetter.daten.partikel.art));
    sp.szene.traverse((o) => {
      if (!o.isMesh || o.name !== 'Strasse' || o.userData.g2Strasse || !o.material || Array.isArray(o.material) || !o.geometry.attributes.position) return;
      const g = o.geometry, p = g.attributes.position;
      let geo = st.strGeo.get(g);
      if (!geo) {
        geo = new THREE.BufferGeometry(); Object.keys(g.attributes).forEach((k) => geo.setAttribute(k, g.attributes[k])); if (g.index) geo.setIndex(g.index);
        geo.groups = g.groups.map((x) => Object.assign({}, x));
        o.updateMatrixWorld(true); const M = o.matrixWorld, v = new THREE.Vector3(), uv = new Float32Array(p.count * 2), s = 1 / 3.2;
        for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i).applyMatrix4(M); uv[i * 2] = v.x * s; uv[i * 2 + 1] = v.z * s; }
        geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
        if (g.boundingSphere) geo.boundingSphere = g.boundingSphere.clone(); if (g.boundingBox) geo.boundingBox = g.boundingBox.clone();
        st.strGeo.set(g, geo);
      }
      let m = st.strMat.get(o.material);
      if (!m) {
        const om = o.material, gem = { color: om.color.clone(), vertexColors: om.vertexColors, map: st.tex.map, side: om.side, polygonOffset: om.polygonOffset, polygonOffsetFactor: om.polygonOffsetFactor, polygonOffsetUnits: om.polygonOffsetUnits, flatShading: om.flatShading };
        if (P.bump) m = new THREE.MeshStandardMaterial(Object.assign(gem, { bumpMap: st.tex.bump, bumpScale: 1.4, roughness: nass ? 0.42 : 0.93, metalness: 0, envMap: sp._g1 && sp._g1.envTex || null, envMapIntensity: nass ? 0.5 : 0.12 }));
        else m = new THREE.MeshLambertMaterial(gem);
        st.strMat.set(om, m);
      }
      o.userData.g2Strasse = { geo: g, mat: o.material, recv: o.receiveShadow };
      o.geometry = geo; o.material = m; o.receiveShadow = true; st.strassen.push(o);
    });
  }

  function grasBauen(sp, P, st) {
    const strecke = sp.strecke; if (!strecke || !strecke.spline || !strecke.bodenHoehe) return;
    const thema = strecke.daten && strecke.daten.thema ? strecke.daten.thema : 'wiese';
    const f1 = !!(strecke.daten && strecke.daten.formel1), wueste = thema === 'wueste';
    const sp1 = strecke.spline, L = sp1.laenge, rnd = zufall(((strecke.id ? strecke.id.length * 97 : 5) + L * 13 + 4711) >>> 0);
    // Grundfarbe aus dem Boden (Jahreszeit/Thema wirken automatisch)
    const grund = new THREE.Color(0x5f9e3a);
    sp.szene.traverse((o) => { if (o.isMesh && o.name === 'Boden' && o.geometry.attributes.color) { const a = o.geometry.attributes.color, n = a.count, k = Math.max(1, Math.floor(n / 60)); let r = 0, g = 0, b = 0, c = 0; for (let i = 0; i < n; i += k) { r += a.getX(i); g += a.getY(i); b += a.getZ(i); c++; } grund.setRGB(r / c, g / c, b / c); } });
    const tuft = wueste ? new THREE.Color(0xb59a5a) : grund.clone().lerp(new THREE.Color(0x9ad24e), 0.45);
    const dichte = (wueste ? 0.45 : f1 ? 0.8 : 1) * (strecke.daten && strecke.daten.zaunLos ? 1 : 1);
    const anzahl = Math.floor(Math.min(P.gras * dichte, L * (P === PARAM.ultra ? 14 : 5) * dichte));
    const b2 = (s) => (strecke.breiteBei ? strecke.breiteBei(s) : strecke.breite) / 2, rb = strecke.randBreite || 1;
    const start = f1 ? (strecke.seitenabstandMax || b2(0) + 3) + 0.4 : null;
    const platz = (s, sg, dMin, dMax, hoch) => {
      const p = sp1.punktBei(s), bb = b2(s), d = (start === null ? bb + rb + dMin : start + dMin) + Math.pow(rnd(), hoch || 1.5) * dMax;
      const x = p.x + p.nx * d * sg, z = p.z + p.nz * d * sg, n = sp1.naechster(x, z);
      if (Math.abs(n.seitenabstand) < b2(n.s) + rb + 0.6) return null;
      if (strecke.dekoSperre && strecke.dekoSperre(x, z, n)) return null;
      return { x, z, y: strecke.bodenHoehe(x, z) };
    };
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
    st.windT = st.windT || { value: 0 };
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uT = st.windT;
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uT;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>
        vec4 g2w = instanceMatrix * vec4(position, 1.0);
        float g2k = position.y * position.y * 2.2;
        transformed.x += sin(uT * 1.8 + g2w.x * 0.55 + g2w.z * 0.35) * 0.07 * g2k;
        transformed.z += cos(uT * 1.5 + g2w.x * 0.3 + g2w.z * 0.6) * 0.05 * g2k;`);
    };
    mat.customProgramCacheKey = () => 'g2gras';
    st.grasMat = mat;
    const geo = grasbueschel(P.klingen); st.grasGeo = geo;
    // in Stücke je ~150 m Strecke (Sichtkegel-Auswahl)
    const stuecke = Math.max(1, Math.round(L / 150)), listen = Array.from({ length: stuecke }, () => []);
    for (let i = 0; i < anzahl; i++) {
      const s = rnd() * L, e = platz(s, rnd() < 0.5 ? -1 : 1, 0.4, 10, 1.9); if (!e) continue;
      e.sc = 0.9 + rnd() * 0.9; e.w = rnd() * 6.283; e.t = 0.9 + rnd() * 0.25; e.h = rnd();
      listen[Math.min(stuecke - 1, Math.floor(s / L * stuecke))].push(e);
    }
    const d = new THREE.Object3D(), c = new THREE.Color(); let gesamt = 0;
    listen.forEach((l) => {
      if (!l.length) return;
      const m = new THREE.InstancedMesh(geo, mat, l.length);
      l.forEach((e, i) => {
        d.position.set(e.x, e.y - 0.02, e.z); d.rotation.set(0, e.w, 0); d.scale.set(e.sc, e.sc * (0.8 + e.h * 0.5), e.sc); d.updateMatrix(); m.setMatrixAt(i, d.matrix);
        c.copy(tuft).multiplyScalar(e.t); if (!wueste) c.offsetHSL((e.h - 0.5) * 0.04, 0, (e.h - 0.5) * 0.06); m.setColorAt(i, c);
      });
      m.count = l.length; m.name = 'G2Gras'; m.matrixAutoUpdate = false; m.updateMatrix(); m.computeBoundingSphere(); m.instanceMatrix.needsUpdate = true;
      sp.szene.add(m); st.objekte.push(m); gesamt += l.length;
    });
    st.zaehl.gras = gesamt;
    // Blumen in Nestern
    if (!wueste && !f1 && thema !== 'dino') {
      const FARBEN = [0xffe14a, 0xffffff, 0xff7fbf, 0xb68cff, 0xff5a4a, 0xffb347], ziel = Math.floor(P.blumen * (thema === 'wald' ? 0.35 : 1)), liste = [];
      let versuche = 0;
      while (liste.length < ziel && versuche++ < ziel * 3) {
        const s = rnd() * L, sg = rnd() < 0.5 ? -1 : 1, mitte = platz(s, sg, 2.2, 11, 1.2); if (!mitte) continue;
        const fb = Math.floor(rnd() * 6), k = 6 + Math.floor(rnd() * 12);
        for (let j = 0; j < k && liste.length < ziel; j++) {
          const x = mitte.x + (rnd() - 0.5) * 5, z = mitte.z + (rnd() - 0.5) * 5, n = sp1.naechster(x, z);
          if (Math.abs(n.seitenabstand) < b2(n.s) + rb + 0.8 || (strecke.dekoSperre && strecke.dekoSperre(x, z, n))) continue;
          liste.push({ x, z, y: strecke.bodenHoehe(x, z), w: rnd() * 6.28, sc: 0.8 + rnd() * 0.7, f: rnd() < 0.75 ? FARBEN[fb] : FARBEN[Math.floor(rnd() * 6)] });
        }
      }
      if (liste.length) {
        const gm = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }); st.blumenMat = gm;
        const bg = blumeGeo(); st.blumenGeo = bg;
        const m = new THREE.InstancedMesh(bg, gm, liste.length);
        liste.forEach((e, i) => { d.position.set(e.x, e.y - 0.01, e.z); d.rotation.set(0, e.w, 0); d.scale.set(e.sc, e.sc, e.sc); d.updateMatrix(); m.setMatrixAt(i, d.matrix); m.setColorAt(i, c.setHex(e.f)); });
        m.count = liste.length; m.name = 'G2Blumen'; m.matrixAutoUpdate = false; m.updateMatrix(); m.frustumCulled = false;
        sp.szene.add(m); st.objekte.push(m); st.zaehl.blumen = liste.length;
      }
    }
  }

  // ---------- Staub ----------
  const STAUB_VS = `attribute float aSize; attribute float aAlpha; attribute vec3 aCol; uniform float uH; varying float vA; varying vec3 vC;
void main(){ vA = aAlpha; vC = aCol; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv; gl_PointSize = clamp(aSize * projectionMatrix[1][1] * uH * 0.5 / max(0.5, gl_Position.w), 1.0, 220.0); }`;
  const STAUB_FS = `varying float vA; varying vec3 vC;
void main(){ vec2 q = gl_PointCoord - 0.5; float r = length(q); float a = smoothstep(0.5, 0.05, r) * vA; if (a < 0.004) discard; gl_FragColor = vec4(vC, a);
  #include <colorspace_fragment>
}`;
  function staubBauen(sp, P, st) {
    const n = P.staub, geo = new THREE.BufferGeometry();
    st.staub = { n, pos: new Float32Array(n * 3), vel: new Float32Array(n * 3), life: new Float32Array(n), max: new Float32Array(n).fill(1), size: new Float32Array(n), alpha: new Float32Array(n), base: new Float32Array(n), col: new Float32Array(n * 3), s0: new Float32Array(n), kopf: 0, acc: new Map(), rnd: zufall(9090) };
    geo.setAttribute('position', new THREE.BufferAttribute(st.staub.pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aSize', new THREE.BufferAttribute(st.staub.size, 1).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aAlpha', new THREE.BufferAttribute(st.staub.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aCol', new THREE.BufferAttribute(st.staub.col, 3).setUsage(THREE.DynamicDrawUsage));
    const mat = new THREE.ShaderMaterial({ vertexShader: STAUB_VS, fragmentShader: STAUB_FS, transparent: true, depthWrite: false, toneMapped: false, fog: false, uniforms: { uH: { value: 540 } } });
    const pts = new THREE.Points(geo, mat); pts.name = 'G2Staub'; pts.frustumCulled = false; pts.renderOrder = 3;
    for (let i = 0; i < n; i++) pos0(st.staub, i);
    sp.szene.add(pts); st.staubObj = pts;
  }
  function pos0(S, i) { S.pos[i * 3 + 1] = -9999; S.alpha[i] = 0; S.life[i] = 0; }
  const UG_STAUB = { gras: [0.42, 0.36, 0.22, 1.0], sand: [0.78, 0.66, 0.42, 1.25], rand: [0.5, 0.45, 0.36, 0.55], sandFleck: [0.78, 0.66, 0.42, 0.9] };
  function staubSchritt(sp, st, dt) {
    const S = st.staub; if (!S) return;
    const geo = st.staubObj.geometry, rnd = S.rnd, ultra = G.stufe === 'ultra';
    // Partikel altern
    for (let i = 0; i < S.n; i++) {
      if (S.life[i] <= 0) continue;
      S.life[i] -= dt; const t = 1 - S.life[i] / S.max[i];
      if (S.life[i] <= 0) { pos0(S, i); continue; }
      const dr = Math.exp(-1.6 * dt);
      S.vel[i * 3] *= dr; S.vel[i * 3 + 1] = S.vel[i * 3 + 1] * dr + 0.2 * dt; S.vel[i * 3 + 2] *= dr;
      S.pos[i * 3] += S.vel[i * 3] * dt; S.pos[i * 3 + 1] += S.vel[i * 3 + 1] * dt; S.pos[i * 3 + 2] += S.vel[i * 3 + 2] * dt;
      S.size[i] = S.s0[i] * (0.45 + 1.9 * Math.sqrt(t));
      S.alpha[i] = S.base[i] * Math.min(1, t * 9) * Math.pow(1 - t, 1.4);
    }
    // Neue Partikel hinter Fahrzeugen auf Gras/Sand/Rand
    (sp.fahrzeuge || []).forEach((f, k) => {
      const v = f && f.vehicle, ug = v && UG_STAUB[v.untergrund]; if (!ug || !f.mesh || f.mesh.visible === false) return;
      const tempo = Math.abs(v.vLaengs || 0); if (tempo < 4) { return; }
      let acc = (S.acc.get(k) || 0) + dt * (ultra ? 46 : 24) * klemme(tempo / 24, 0.2, 1.3) * ug[3];
      const dx = -Math.sin(v.heading), dz = -Math.cos(v.heading), qx = dz, qz = -dx;
      while (acc >= 1) {
        acc -= 1; const i = S.kopf; S.kopf = (S.kopf + 1) % S.n;
        const seite = (rnd() < 0.5 ? -1 : 1) * (0.5 + rnd() * 0.45), hinten = MOTO ? 0.9 : 1.6 + rnd() * 0.5;
        S.pos[i * 3] = f.mesh.position.x - dx * hinten + qx * seite; S.pos[i * 3 + 1] = f.mesh.position.y + 0.15; S.pos[i * 3 + 2] = f.mesh.position.z - dz * hinten + qz * seite;
        const sp0 = tempo * 0.1;
        S.vel[i * 3] = -dx * sp0 + qx * seite * 1.1 + (rnd() - 0.5) * 0.8; S.vel[i * 3 + 1] = 0.5 + rnd() * 0.9; S.vel[i * 3 + 2] = -dz * sp0 + qz * seite * 1.1 + (rnd() - 0.5) * 0.8;
        S.max[i] = S.life[i] = 0.9 + rnd() * 0.8; S.s0[i] = (0.7 + rnd() * 0.5) * (MOTO ? 0.7 : 1); S.base[i] = (0.2 + 0.18 * rnd()) * Math.min(1, ug[3] + 0.2);
        const sh = 0.9 + 0.2 * rnd(); S.col[i * 3] = ug[0] * sh; S.col[i * 3 + 1] = ug[1] * sh; S.col[i * 3 + 2] = ug[2] * sh;
        S.size[i] = S.s0[i] * 0.45; S.alpha[i] = 0;
      }
      S.acc.set(k, acc);
    });
    geo.attributes.position.needsUpdate = true; geo.attributes.aSize.needsUpdate = true; geo.attributes.aAlpha.needsUpdate = true; geo.attributes.aCol.needsUpdate = true;
  }

  // ---------- Anwenden / Zurück ----------
  function an(sp, stufe) {
    const P = PARAM[stufe]; if (!P) return;
    const st = sp._g2 = { stufe, versteckt: [], baeume: [], strassen: [], objekte: [], baumMat: new Map(), strGeo: new Map(), strMat: new Map(), zaehl: {}, t0: 0 };
    const sicher = (name, f) => { try { f(); } catch (e) { try { console.warn('Grafik G2 ' + name + ':', e); } catch (e2) { /* egal */ } } };
    sicher('Himmel', () => himmelBauen(sp, P, st));
    sicher('Bäume', () => baeumeTauschen(sp, P, st));
    sicher('Asphalt', () => strasseTauschen(sp, P, st));
    sicher('Gras', () => grasBauen(sp, P, st));
    sicher('Staub', () => staubBauen(sp, P, st));
    st.aktiv = true;
  }

  function aus(sp) {
    const st = sp._g2; if (!st || !st.aktiv) return;
    if (st.himmel) { if (st.himmel.parent) st.himmel.parent.remove(st.himmel); st.himmel.geometry.dispose(); st.himmel.material.dispose(); }
    st.versteckt.forEach((o) => { o.visible = true; });
    st.baeume.forEach((o) => { const e = o.userData.g2Baum; if (e) { o.geometry = e.geo; o.material = e.mat; delete o.userData.g2Baum; } });
    Object.keys(st.baumGeo || {}).forEach((k) => st.baumGeo[k].dispose()); st.baumMat.forEach((m) => m.dispose());
    st.strassen.forEach((o) => { const e = o.userData.g2Strasse; if (e) { o.geometry = e.geo; o.material = e.mat; o.receiveShadow = e.recv; delete o.userData.g2Strasse; } });
    st.strMat.forEach((m) => m.dispose()); if (st.tex) { st.tex.map.dispose(); st.tex.bump.dispose(); }
    st.objekte.forEach((o) => { if (o.parent) o.parent.remove(o); o.dispose && o.dispose(); });
    [st.grasGeo, st.grasMat, st.blumenGeo, st.blumenMat].forEach((x) => x && x.dispose());
    if (st.staubObj) { if (st.staubObj.parent) st.staubObj.parent.remove(st.staubObj); st.staubObj.geometry.dispose(); st.staubObj.material.dispose(); }
    sp._g2 = null;
  }

  function bild(sp) {
    const st = sp._g2; if (!st || !st.aktiv) return;
    const jetzt = performance.now() / 1000, dt = klemme(st.t0 ? jetzt - st.t0 : 0.016, 0, 0.05); st.t0 = jetzt;
    if (st.himmel) st.himmel.material.uniforms.uTime.value = jetzt;
    if (st.windT) st.windT.value = jetzt;
    if (st.staub) {
      const el = sp.renderer && sp.renderer.domElement; if (el) st.staubObj.material.uniforms.uH.value = el.height * (sp.kameras && sp.kameras.length === 2 ? 0.5 : 1);
      staubSchritt(sp, st, dt);
    }
  }

  G.haken = { an, aus, bild };
  G.Umgebung = { PARAM, zaehler: (sp) => (sp && sp._g2 ? sp._g2.zaehl : null) };
})();
