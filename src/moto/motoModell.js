// ============================================================
// Motorrad-Modell (Stufe M1): Low-Poly-Crossmaschine mit Fahrer – wird über den vorhandenen Sonderbau-Haken des carBuilders
// eingehängt (carBuilder.bauen: `auto.sonderbau` → R.sonderbauten[name](autoDaten, opt)); carBuilder.js selbst bleibt unverändert.
//
//   R.sonderbauten.motorrad(autoDaten, opt) → THREE.Group    opt.farbe = Lack (Garage), autoDaten.optionen { farbe, fahrer, helm, nummer }
//
// Aufbau (Ursprung = Boden zwischen den Rädern, Front bei −z, rechts = +x – wie die Autos):
//   äußere Gruppe (main.js setzt Position/Rotation)
//     └ lage      Schräglage (rotation.z, Drehpunkt = Boden; src/moto/schraeglage.js)
//        └ purzel Sturz-Überschlag (rotation.x um die Fahrzeugmitte; Hüpfer über position.y)
//           └ inhalt  (y = −Drehpunkt, gleicht purzel.position.y im Normalzustand aus)
//              Rahmen/Motor/Tank/Sitz/Auspuff, Fahrer (fest), Hinterrad, Lenkgruppe (Gabel, Vorderrad, Lenker; lenkt um die Gabelachse),
//              Arme (Zwei-Knochen-IK zu den Lenkergriffen, folgen dem Lenken), Scheinwerfer, Rücklicht, Startnummern
//     + Blob-Schatten (bleibt am Boden, Mesh 'schatten' – main.js gibt dessen Geometrie beim Abbau frei)
// userData wie bei den Autos: autoId, karosserie, lackFarbe, raeder [Hinterrad, Vorderrad] (Rollen um x), vorderraeder [], lenkObjekte
//   (Stellvertreter: carBuilder.lenkeRaeder setzt rotation.y = −Lenkung·0,5 → Lenkgruppe), bremslichter/bremslichtMaterial, scheinwerfer,
//   blaulicht [], dach null; zusätzlich moto:true, lage, purzel, inhalt.
// Technik: nur Lambert/Basic-Material, keine Lichter. Geometrien sind farbunabhängig und gemeinsam genutzt (Vertex-Farben), Materialien
// werden je Farbe zwischengespeichert → wenig Speicher, ca. 22 Draw-Calls je Motorrad. Fahrer-Bauteile (Helm, Kombi, Stiefel) aus
// /radwelt/src/rad/fahrer.js abgeleitet (sammler, tube, box, Zwei-Knochen-IK „gelenk“); feste Sitzpose, keine Pedal-IK.
// ============================================================
window.Rennspiel = window.Rennspiel || {};

(function () {
  const R = window.Rennspiel;
  R.Moto = R.Moto || {};
  if (typeof THREE === 'undefined') { R.Moto.modell = { verfuegbar: false }; return; }

  // ---------- Maße (m) ----------
  const RAD_V = 0.34, RAD_H = 0.33;                              // Außenradius Vorder-/Hinterrad
  const PV = new THREE.Vector3(0, RAD_V, -0.78);                // Vorderachse = Drehpunkt der Lenkgruppe
  const PH = new THREE.Vector3(0, RAD_H, 0.70);                 // Hinterachse
  const AX = new THREE.Vector3(0, 0.68, 0.33).normalize();      // Lenkachse (Gabel), 27° Nachlauf: oben weiter hinten
  const RAKE = Math.atan2(0.33, 0.68);
  const PIVOT_Y = 0.70;                                         // Drehpunkt des Überschlags (Höhe der Fahrzeugmitte)
  const SCHULTER = 0.19, SCHULTER_Y = 1.45, SCHULTER_Z = -0.05;
  const GRIFF = { x: 0.35, y: 1.165, z: -0.34 };                // Lenkergriff (Ruhelage), Hände greifen hier
  const LENK_FAKTOR = 0.6;                                      // sichtbarer Lenkeinschlag = carBuilder-Winkel × 0,6 (max. ≈ 17°)

  const F = { alu: 0xb9bfc8, schwarz: 0x16171b, motor: 0x4b5058, gold: 0xd9a626, weiss: 0xf3f3f1, gummi: 0x111214, felge: 0xc5cad1,
    stiefel: 0x23262d, handschuh: 0x16181c, glas: 0x2b78e0, feder: 0xe6b422, bremse: 0x5a0000, licht: 0xfff6c8, grau: 0x6a707a };

  const lum = (hex) => ((hex >> 16) & 255) * 0.299 + ((hex >> 8) & 255) * 0.587 + (hex & 255) * 0.114;
  const farbWerte = (hex) => { const c = new THREE.Color(hex); return [c.r, c.g, c.b]; };

  // ---------- Geometrie-Werkzeuge (aus radwelt/fahrer.js: sammler, tube, box) ----------
  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(), _uy = new THREE.Vector3(0, 1, 0), _dd = new THREE.Vector3();
  /** Sammelt Geometrien (mit Matrix und Vertex-Farbe) zu einer nicht-indexierten Geometrie (Position, Normale, Farbe). */
  function sammler() {
    const P = [], N = [], C = [];
    return {
      add(g, m, hex) {
        const ng = g.index ? g.toNonIndexed() : g;
        if (m) ng.applyMatrix4(m);
        const p = ng.attributes.position.array, n = ng.attributes.normal.array, c = farbWerte(hex === undefined ? 0xffffff : hex);
        for (let i = 0; i < p.length; i++) { P.push(p[i]); N.push(n[i]); }
        for (let i = 0; i < p.length / 3; i++) C.push(c[0], c[1], c[2]);
        if (ng !== g) ng.dispose();
        g.dispose();
      },
      geo(dx, dy, dz) {
        const r = new THREE.BufferGeometry();
        r.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
        r.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
        r.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
        if (dx || dy || dz) r.translate(dx || 0, dy || 0, dz || 0);
        return r;
      },
    };
  }
  /** Rohr/Kegelstumpf von a nach b (Radius r1 bei a, r2 bei b). */
  function tube(S, a, b, r1, r2, seg, hex, offen) {
    const g = new THREE.CylinderGeometry(r2, r1, 1, seg || 6, 1, !!offen); g.translate(0, 0.5, 0);
    _dd.subVectors(b, a); const l = _dd.length() || 1e-4; _dd.divideScalar(l);
    _q.setFromUnitVectors(_uy, _dd); _s.set(1, l, 1); _m.compose(a, _q, _s); S.add(g, _m, hex);
  }
  function box(S, cx, cy, cz, sx, sy, sz, rx, ry, rz, hex) {
    _q.setFromEuler(_e.set(rx || 0, ry || 0, rz || 0)); _s.set(1, 1, 1); _m.compose(new THREE.Vector3(cx, cy, cz), _q, _s);
    S.add(new THREE.BoxGeometry(sx, sy, sz), _m, hex);
  }
  function ellipsoid(S, cx, cy, cz, rx, ry, rz, hex, ws, hs, rotX) {
    _q.setFromEuler(_e.set(rotX || 0, 0, 0)); _s.set(rx, ry, rz); _m.compose(new THREE.Vector3(cx, cy, cz), _q, _s);
    S.add(new THREE.SphereGeometry(1, ws || 8, hs || 6), _m, hex);
  }
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  /** Punkt auf der Lenkachse (s Meter über der Vorderachse) plus Versatz. */
  const achse = (s, x, y, z) => V(PV.x + AX.x * s + (x || 0), PV.y + AX.y * s + (y || 0), PV.z + AX.z * s + (z || 0));

  /** Zwei-Knochen-IK (aus radwelt/fahrer.js): Gelenkposition zwischen h und f, Knochenlängen l1/l2, pole = Beuge-Richtung. */
  const _r = new THREE.Vector3(), _p = new THREE.Vector3();
  function gelenk(h, f, l1, l2, pole, aus) {
    _r.subVectors(f, h); let d = _r.length();
    const dmax = (l1 + l2) * 0.999; if (d > dmax) { _r.multiplyScalar(dmax / d); d = dmax; }
    if (d < 1e-4) d = 1e-4;
    _r.divideScalar(d);
    const a = (l1 * l1 - l2 * l2 + d * d) / (2 * d), hh = Math.sqrt(Math.max(0, l1 * l1 - a * a));
    _p.copy(pole); _p.addScaledVector(_r, -_p.dot(_r)).normalize();
    aus.copy(h).addScaledVector(_r, a).addScaledVector(_p, hh);
    return aus;
  }

  // ---------- Zwischenspeicher: Materialien je Farbe, Geometrien einmalig ----------
  const cache = { mat: {}, geo: {}, tex: {} };
  function lambert(hex, doppelt) {
    const k = 'L' + hex + (doppelt ? 'd' : '');
    return cache.mat[k] || (cache.mat[k] = new THREE.MeshLambertMaterial({ color: hex, side: doppelt ? THREE.DoubleSide : THREE.FrontSide }));
  }
  function vertexMat(doppelt) {
    const k = 'V' + (doppelt ? 'd' : '');
    return cache.mat[k] || (cache.mat[k] = new THREE.MeshLambertMaterial({ vertexColors: true, side: doppelt ? THREE.DoubleSide : THREE.FrontSide }));
  }
  function basic(hex) { const k = 'B' + hex; return cache.mat[k] || (cache.mat[k] = new THREE.MeshBasicMaterial({ color: hex })); }
  function schattenMat() {
    return cache.mat.schatten || (cache.mat.schatten = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.3, depthWrite: false }));
  }
  const memo = (k, fn) => cache.geo[k] || (cache.geo[k] = fn());

  /** Startnummern-Material: weiße Tafel mit schwarzer Zahl (Canvas-Textur; ohne Canvas/DOM, z. B. Node-Test, einfach weiß). */
  function nummerMat(n) {
    const k = 'N' + n;
    if (cache.mat[k]) return cache.mat[k];
    let map = null;
    try {
      if (typeof document !== 'undefined') {
        const cv = document.createElement('canvas'); cv.width = 64; cv.height = 64;
        const c = cv.getContext('2d');
        c.fillStyle = '#f4f4f0'; c.fillRect(0, 0, 64, 64);
        c.fillStyle = '#16171b'; c.font = 'bold 44px Arial, Helvetica, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
        c.fillText(String(n), 32, 36);
        c.strokeStyle = '#16171b'; c.lineWidth = 4; c.strokeRect(2, 2, 60, 60);
        map = new THREE.CanvasTexture(cv);
        if (THREE.SRGBColorSpace) map.colorSpace = THREE.SRGBColorSpace;
      }
    } catch (e) { map = null; }
    return (cache.mat[k] = map ? new THREE.MeshLambertMaterial({ map }) : new THREE.MeshLambertMaterial({ color: F.weiss }));
  }

  // ---------- Teile ----------
  /** Rad (Reifen mit Stollen + Felge/Speichen/Nabe), Achse = x, um den Ursprung. */
  function reifenGeo(R_, breite) {
    return memo('reifen' + R_ + breite, () => {
      const S = sammler(), rm = R_ - 0.085, tr = 0.065 * breite / 0.13;
      const t = new THREE.TorusGeometry(rm, tr, 6, 18); t.rotateY(Math.PI / 2); S.add(t, null, F.gummi);
      for (let i = 0; i < 20; i++) {                                  // Stollen: zwei Reihen, gegeneinander versetzt
        const a = (i / 20) * Math.PI * 2;
        box(S, 0.03 * breite / 0.13, (R_ - 0.012) * Math.cos(a), (R_ - 0.012) * Math.sin(a), 0.07 * breite / 0.13, 0.045, 0.05, a, 0, 0, F.gummi);
        const b = a + Math.PI / 20;
        box(S, -0.03 * breite / 0.13, (R_ - 0.012) * Math.cos(b), (R_ - 0.012) * Math.sin(b), 0.07 * breite / 0.13, 0.045, 0.05, b, 0, 0, F.gummi);
      }
      return S.geo();
    });
  }
  function felgeGeo(R_) {
    return memo('felge' + R_, () => {
      const S = sammler(), ri = R_ - 0.135;
      const rim = new THREE.CylinderGeometry(ri, ri, 0.075, 16, 1, true); rim.rotateZ(Math.PI / 2); S.add(rim, null, F.felge);
      for (let i = 0; i < 4; i++) box(S, 0, 0, 0, 0.012, ri * 2, 0.014, (i / 4) * Math.PI, 0, 0, F.alu);     // 8 Speichen
      const nabe = new THREE.CylinderGeometry(0.045, 0.045, 0.14, 8); nabe.rotateZ(Math.PI / 2); S.add(nabe, null, F.motor);
      box(S, 0.0, ri - 0.02, 0, 0.085, 0.03, 0.05, 0, 0, 0, F.gold);        // Markierung am Felgenbett (zeigt das Rollen)
      return S.geo();
    });
  }

  /** Hauptrahmen, Motor, Sitz, Auspuff, Federbein, Fußrasten (farbunabhängig, Vertex-Farben). */
  function teileGeo() {
    return memo('teile', () => {
      const S = sammler();
      [-1, 1].forEach((s) => {
        tube(S, V(s * 0.06, 0.98, -0.44), V(s * 0.075, 0.55, 0.36), 0.024, 0.024, 5, F.alu);                // Hauptrohr
        tube(S, V(s * 0.06, 0.90, -0.45), V(s * 0.075, 0.34, -0.30), 0.02, 0.02, 5, F.alu);                 // Unterzug vorn
        tube(S, V(s * 0.075, 0.34, -0.30), V(s * 0.075, 0.34, 0.34), 0.02, 0.02, 5, F.alu);                 // Unterzug längs
        tube(S, V(s * 0.075, 0.55, 0.34), V(s * 0.065, 0.92, 0.66), 0.02, 0.02, 5, F.alu);                  // Heckrahmen
        tube(S, V(s * 0.09, 0.45, 0.34), V(s * 0.09, RAD_H, PH.z), 0.026, 0.022, 5, F.alu);                 // Schwinge
        box(S, s * 0.25, 0.40, 0.16, 0.11, 0.02, 0.09, 0, 0, 0, F.alu);                                      // Fußraste
        tube(S, V(s * 0.2, 0.40, 0.16), V(s * 0.075, 0.42, 0.16), 0.012, 0.012, 4, F.alu);
      });
      tube(S, V(0, 0.52, -0.38), V(0, 0.98, -0.44), 0.022, 0.022, 5, F.alu);                                // Lenkkopf
      box(S, 0, 0.50, -0.02, 0.28, 0.34, 0.40, 0, 0, 0, F.motor);                                            // Motorblock
      tube(S, V(0, 0.62, -0.06), V(0, 0.84, -0.20), 0.095, 0.085, 8, F.motor);                              // Zylinder (nach vorn geneigt)
      box(S, 0, 0.86, -0.21, 0.17, 0.05, 0.17, 0.5, 0, 0, F.grau);                                          // Zylinderkopf
      box(S, 0, 0.30, -0.01, 0.2, 0.02, 0.42, 0, 0, 0, F.grau);                                              // Motorschutz
      tube(S, V(0, 0.84, 0.30), V(0, 0.50, 0.52), 0.032, 0.032, 6, F.feder);                                // Federbein
      box(S, 0, 0.935, 0.30, 0.25, 0.10, 0.62, 0, 0, 0, F.schwarz);                                          // Sitzbank
      box(S, 0, 0.965, -0.06, 0.19, 0.08, 0.22, 0, 0, 0, F.schwarz);
      // Auspuff rechts: Krümmer → Topf
      const aus = [V(0.06, 0.82, -0.18), V(0.15, 0.66, -0.22), V(0.18, 0.60, 0.0), V(0.18, 0.76, 0.30)];
      for (let i = 0; i < aus.length - 1; i++) tube(S, aus[i], aus[i + 1], 0.02, 0.02, 5, F.alu);
      tube(S, V(0.18, 0.76, 0.28), V(0.15, 0.90, 0.80), 0.05, 0.045, 8, F.grau);                            // Schalldämpfer
      tube(S, V(0.15, 0.90, 0.80), V(0.15, 0.905, 0.84), 0.045, 0.03, 8, F.schwarz);                         // Endkappe
      tube(S, V(0.0, 0.55, 0.40), V(0, 0.45, PH.z), 0.012, 0.012, 4, F.schwarz);                             // Kette (vereinfacht)
      return S.geo();
    });
  }
  /** Teile in Lackfarbe: Tank, Kühlerspoiler, Heckfender. */
  function karoGeo() {
    return memo('karo', () => {
      const S = sammler();
      ellipsoid(S, 0, 1.0, -0.20, 0.15, 0.13, 0.27, 0xffffff, 8, 6);                                         // Tank
      [-1, 1].forEach((s) => {
        box(S, s * 0.17, 0.88, -0.22, 0.07, 0.24, 0.36, 0, 0, s * -0.12, 0xffffff);                          // Kühlerspoiler
        box(S, s * 0.15, 0.92, 0.40, 0.025, 0.2, 0.34, 0, 0, 0, 0xffffff);                                    // Seitenteil unter den Nummerntafeln
      });
      box(S, 0, 0.92, 0.80, 0.19, 0.03, 0.46, -0.30, 0, 0, 0xffffff);                                        // Heckfender (hinten hoch)
      return S.geo();
    });
  }
  /** Lenkgruppe, relativ zur Vorderachse: Gabel, Lenkkopfplatte, Lenker + Griffe, Handschützer. */
  function lenkTeileGeo() {
    return memo('lenkTeile', () => {
      const S = sammler();
      [-1, 1].forEach((s) => {
        tube(S, achse(0.02, s * 0.085), achse(0.38, s * 0.085), 0.018, 0.018, 6, F.gold);                    // Standrohr (Gold)
        tube(S, achse(0.36, s * 0.085), achse(0.74, s * 0.085), 0.026, 0.024, 6, F.alu);                     // Tauchrohr
        tube(S, achse(0.9, 0), V(s * 0.40, 1.172, -0.33), 0.012, 0.012, 5, F.alu);                            // Lenkerhälfte
        tube(S, V(s * 0.30, 1.168, -0.345), V(s * 0.43, 1.174, -0.325), 0.019, 0.019, 6, F.schwarz);         // Griff
        box(S, s * 0.405, 1.19, -0.40, 0.02, 0.10, 0.15, 0, 0, 0, F.schwarz);                                // Handschutz (Platzhalter, Lackfarbe separat)
        tube(S, achse(0.02, s * 0.085), achse(0.02, 0), 0.016, 0.016, 5, F.alu);                              // Achsaufnahme
      });
      box(S, achse(0.72).x, achse(0.72).y, achse(0.72).z, 0.24, 0.035, 0.07, RAKE, 0, 0, F.schwarz);        // untere Gabelbrücke / Lenkkopfplatte
      tube(S, achse(0.60), achse(0.92), 0.02, 0.018, 6, F.schwarz);                                          // Lenkschaft
      const mid = achse(0.9); tube(S, V(-0.2, mid.y, mid.z + 0.01), V(0.2, mid.y, mid.z + 0.01), 0.012, 0.012, 5, F.alu);   // Querstrebe
      return S.geo(-PV.x, -PV.y, -PV.z);
    });
  }
  /** Vorderer Kotflügel (Lackfarbe, offener Kreisbogen über dem Rad). */
  function fenderGeo() {
    return memo('fender', () => {
      // Bogen von etwas hinter dem Radscheitel bis weit nach vorn (Winkel gemessen von +z in der y-z-Ebene)
      const S = sammler(), g2 = new THREE.CylinderGeometry(0.40, 0.40, 0.13, 12, 1, true, 1.05, 1.55); g2.rotateZ(Math.PI / 2);
      S.add(g2, null, 0xffffff);
      return S.geo();      // relativ zur Achse
    });
  }
  /** Weiße Startnummerntafeln: vorn (Lenkgruppe, relativ zur Achse) und die beiden Seiten. */
  function tafelVorneGeo() {
    return memo('tafelV', () => {
      const g = new THREE.PlaneGeometry(0.26, 0.20); g.rotateY(Math.PI); g.rotateX(RAKE);
      const c = achse(0.72, 0, 0, -0.09);
      g.translate(c.x - PV.x, c.y - PV.y, c.z - PV.z);
      return g;
    });
  }
  /** Beide Seitentafeln in EINER Geometrie (mit UVs für die Zahl), gemeinsam genutzt. */
  function tafelSeitenGeo() {
    const k = 'tafelSeiten';
    if (!cache.geo[k]) {
      const geos = [1, -1].map((s) => { const g = new THREE.PlaneGeometry(0.30, 0.20); g.rotateY(s * Math.PI / 2); g.translate(s * 0.1635, 0.95, 0.43); return g; });
      const pos = [], nor = [], uv = [], idx = [];
      geos.forEach((g, gi) => {
        const p = g.attributes.position.array, n = g.attributes.normal.array, u = g.attributes.uv.array, ix = g.index.array;
        for (let i = 0; i < p.length; i++) { pos.push(p[i]); nor.push(n[i]); }
        for (let i = 0; i < u.length; i++) uv.push(u[i]);
        for (let i = 0; i < ix.length; i++) idx.push(ix[i] + gi * (p.length / 3));
      });
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx);
      cache.geo[k] = g;
      geos.forEach((x) => x.dispose());
    }
    return cache.geo[k];
  }

  /** Fahrer (feste Sitzpose), Geometrie je Farbkombination zwischengespeichert. Rückgabe: { geo, knie } */
  function fahrerGeo(jersey, hose, helm) {
    return memo('fahrer' + jersey + '_' + hose + '_' + helm, () => {
      const S = sammler();
      // Becken + Rumpf (nach vorn geneigt, Angriffshaltung)
      box(S, 0, 1.03, 0.20, 0.30, 0.15, 0.24, 0, 0, 0, hose);
      const A = V(0, 1.07, 0.19), B = V(0, 1.46, -0.05), g = new THREE.CylinderGeometry(0.13, 0.108, 1, 8, 1, false); g.translate(0, 0.5, 0);
      _dd.subVectors(B, A); const l = _dd.length(); _dd.divideScalar(l); _q.setFromUnitVectors(_uy, _dd); _s.set(1.3, l, 0.88); _m.compose(A, _q, _s); S.add(g, _m, jersey);
      ellipsoid(S, 0, 1.45, -0.04, 0.22, 0.075, 0.115, jersey, 8, 5);                                         // Schultern
      box(S, 0, 1.27, 0.11, 0.2, 0.13, 0.05, -0.35, 0, 0, F.schwarz);                                          // Rückenprotektor-Andeutung
      tube(S, V(0, 1.47, -0.07), V(0, 1.56, -0.11), 0.05, 0.045, 6, F.schwarz);                                // Nacken
      // Kopf mit Crosshelm
      const HC = V(0, 1.64, -0.13);
      ellipsoid(S, HC.x, HC.y + 0.015, HC.z + 0.01, 0.135, 0.135, 0.165, helm, 9, 7);                          // Schale
      box(S, 0, HC.y - 0.075, HC.z - 0.15, 0.15, 0.09, 0.10, 0.15, 0, 0, helm);                                // Kinnbügel
      box(S, 0, HC.y - 0.07, HC.z - 0.205, 0.06, 0.05, 0.03, 0, 0, 0, F.schwarz);                              // Mundstück
      box(S, 0, HC.y + 0.085, HC.z - 0.19, 0.17, 0.014, 0.15, -0.28, 0, 0, helm);                              // Schirm
      ellipsoid(S, HC.x, HC.y + 0.0, HC.z - 0.02, 0.141, 0.05, 0.168, F.schwarz, 9, 4);                        // Brillenband
      box(S, 0, HC.y + 0.0, HC.z - 0.148, 0.185, 0.085, 0.03, 0, 0, 0, F.weiss);                               // Brillenrahmen
      box(S, 0, HC.y + 0.0, HC.z - 0.166, 0.155, 0.06, 0.02, 0, 0, 0, F.glas);                                 // Brillenglas
      // Beine: Zwei-Knochen-IK einmalig (Hüfte → Knöchel auf der Fußraste)
      const knie = [];
      [-1, 1].forEach((s) => {
        const hu = V(s * 0.11, 1.0, 0.20), kn = new THREE.Vector3(), fu = V(s * 0.245, 0.52, 0.19);
        gelenk(hu, fu, 0.43, 0.43, V(s * 0.25, 0.3, -1), kn);
        knie.push(kn.clone());
        tube(S, hu, kn, 0.078, 0.064, 7, hose);                                                                // Oberschenkel
        tube(S, kn, fu, 0.066, 0.056, 7, F.stiefel);                                                            // Schienbein im Stiefel
        ellipsoid(S, kn.x, kn.y, kn.z, 0.07, 0.07, 0.06, F.stiefel, 6, 4);                                      // Knieschutz
        box(S, fu.x, 0.455, fu.z - 0.07, 0.10, 0.12, 0.30, 0, 0, 0, F.stiefel);                                 // Stiefel
        box(S, fu.x, 0.40, fu.z - 0.16, 0.10, 0.04, 0.12, 0, 0, 0, F.schwarz);                                  // Stiefelspitze
      });
      return { geo: S.geo(), knie };
    });
  }

  // ---------- Stäbe (Arme): Einheitszylinder entlang +y, per Skalierung zwischen zwei Punkten aufgespannt ----------
  function stabGeo(r1, r2) {
    return memo('stab' + r1 + '_' + r2, () => { const g = new THREE.CylinderGeometry(r2, r1, 1, 7, 1, false); g.translate(0, 0.5, 0); return g; });
  }
  const _d = new THREE.Vector3();
  function spanne(x, a, b) {
    _d.subVectors(b, a); const l = _d.length() || 1e-4; _d.divideScalar(l);
    x.position.copy(a); x.quaternion.setFromUnitVectors(_uy, _d); x.scale.set(1, l, 1);
  }

  /** Statistik (Tests): Meshes (= Draw-Calls) und Dreiecke einer Gruppe. */
  function statistik(g) {
    let meshes = 0, dreiecke = 0, lichter = 0;
    g.traverse((o) => {
      if (o.isLight) lichter++;
      if (o.isMesh) { meshes++; const geo = o.geometry; dreiecke += (geo.index ? geo.index.count : geo.attributes.position.count) / 3; }
    });
    return { meshes, dreiecke, lichter };
  }

  // ---------- Zusammenbau ----------
  function bauen(autoDaten, opt) {
    const o = Object.assign({}, (autoDaten && autoDaten.optionen) || {}, opt || {});
    const zahl = (v, d) => (v !== undefined && v !== null && Number.isFinite(v) ? v >>> 0 : d);
    const lack = zahl(o.farbe, zahl(autoDaten && autoDaten.farbe, 0xff6a10));
    const jersey = zahl(o.fahrer, zahl(autoDaten && autoDaten.farbe2, 0x1d4ed8));
    const helm = zahl(o.helm, 0xf4f4f4);
    const hose = lum(jersey) < 110 ? jersey : F.stiefel;
    const nummer = Number.isFinite(o.nummer) ? o.nummer : 1;

    const g = new THREE.Group();
    g.name = (autoDaten && autoDaten.id) || 'crossmaschine';
    const lage = new THREE.Group(); lage.name = 'lage'; g.add(lage);
    const purzel = new THREE.Group(); purzel.name = 'purzel'; purzel.position.y = PIVOT_Y; lage.add(purzel);
    const inhalt = new THREE.Group(); inhalt.name = 'inhalt'; inhalt.position.y = -PIVOT_Y; purzel.add(inhalt);
    const mesh = (geo, mat, eltern, name) => { const m = new THREE.Mesh(geo, mat); if (name) m.name = name; (eltern || inhalt).add(m); return m; };

    // feste Karosserie
    mesh(teileGeo(), vertexMat(false), inhalt, 'teile');
    mesh(karoGeo(), lambert(lack, true), inhalt, 'karosserie');
    const fg = fahrerGeo(jersey, hose, helm);
    mesh(fg.geo, vertexMat(false), inhalt, 'fahrer');
    mesh(tafelSeitenGeo(), nummerMat(nummer), inhalt, 'nummerSeite');

    // Hinterrad
    const radH = new THREE.Group(); radH.name = 'radhalter'; radH.position.copy(PH); inhalt.add(radH);
    mesh(reifenGeo(RAD_H, 0.15), lambert(F.gummi), radH, 'rad');
    mesh(felgeGeo(RAD_H), lambert(F.felge, true), radH, 'felge');

    // Lenkgruppe (Drehpunkt = Vorderachse, Achse = Gabel)
    const lenk = new THREE.Group(); lenk.name = 'lenkhalter'; lenk.position.copy(PV); inhalt.add(lenk);
    mesh(lenkTeileGeo(), vertexMat(false), lenk, 'lenkTeile');
    mesh(fenderGeo(), lambert(lack, true), lenk, 'kotfluegel');
    mesh(tafelVorneGeo(), nummerMat(nummer), lenk, 'nummerVorn');
    const radV = new THREE.Group(); radV.name = 'radhalter'; lenk.add(radV);
    mesh(reifenGeo(RAD_V, 0.13), lambert(F.gummi), radV, 'rad');
    mesh(felgeGeo(RAD_V), lambert(F.felge, true), radV, 'felge');

    // Licht: Scheinwerfer (fest an der Tafel) und Rücklicht – Geometrie liegt im Modellraum (carBuilder.lichtStellen liest die Bounding-Box)
    const hl = achse(0.72, 0, 0, -0.09), up = V(AX.x, AX.y, AX.z).multiplyScalar(0.125);
    const hlGeo = memo('scheinwerfer', () => { const x = new THREE.BoxGeometry(0.11, 0.065, 0.04); x.rotateX(RAKE); x.translate(hl.x + up.x, hl.y + up.y, hl.z + up.z - 0.012); return x; });
    const scheinwerfer = mesh(hlGeo, basic(F.licht), inhalt, 'scheinwerfer');
    const blGeo = memo('bremslicht', () => { const x = new THREE.BoxGeometry(0.10, 0.045, 0.03); x.rotateX(-0.3); x.translate(0, 0.935, 1.02); return x; });
    const bremslichtMat = new THREE.MeshBasicMaterial({ color: F.bremse });
    const bremslicht = mesh(blGeo, bremslichtMat, inhalt, 'bremslicht');

    // Arme: Oberarm + Unterarm je Seite (Trikotfarbe), Handschuh; IK folgt der Lenkung
    const arme = [-1, 1].map((s) => ({
      s, ober: mesh(stabGeo(0.05, 0.043), lambert(jersey), inhalt, 'oberarm'), unter: mesh(stabGeo(0.042, 0.036), lambert(jersey), inhalt, 'unterarm'),
      hand: mesh(memo('hand', () => new THREE.SphereGeometry(0.052, 6, 5)), lambert(F.handschuh), inhalt, 'handschuh'),
      schulter: V(s * SCHULTER, SCHULTER_Y, SCHULTER_Z), griff: V(s * GRIFF.x, GRIFF.y, GRIFF.z), pole: V(s * 0.8, 0.4, 0.35).normalize(),
    }));
    const _h = new THREE.Vector3(), _ell = new THREE.Vector3(), _qq = new THREE.Quaternion();
    let letzterWinkel = null;
    function lenken(winkel) {
      const w = Number.isFinite(winkel) ? winkel * LENK_FAKTOR : 0;
      if (letzterWinkel !== null && Math.abs(w - letzterWinkel) < 1e-4) return;
      letzterWinkel = w;
      lenk.quaternion.setFromAxisAngle(AX, w);                         // positiv = links (Draufsicht gegen den Uhrzeigersinn)
      _qq.copy(lenk.quaternion);
      arme.forEach((a) => {
        _h.copy(a.griff).sub(PV).applyQuaternion(_qq).add(PV);        // Griff mitgedreht
        gelenk(a.schulter, _h, 0.27, 0.27, a.pole, _ell);
        spanne(a.ober, a.schulter, _ell); spanne(a.unter, _ell, _h); a.hand.position.copy(_h);
      });
    }
    lenken(0);

    // Blob-Schatten (eigene Geometrie: main.js gibt Meshes namens 'schatten' beim Abbau frei)
    const sg = new THREE.CircleGeometry(0.5, 14); sg.rotateX(-Math.PI / 2); sg.scale(0.62, 1, 1.55);
    const schatten = new THREE.Mesh(sg, schattenMat()); schatten.name = 'schatten'; schatten.position.y = 0.025; g.add(schatten);

    // Stellvertreter für carBuilder.lenkeRaeder (setzt h.rotation.y = Winkel): rotation.y wird zur Lenkung
    const lenkProxy = { rotation: {} };
    Object.defineProperty(lenkProxy.rotation, 'y', { set(w) { lenken(w); }, get() { return letzterWinkel === null ? 0 : letzterWinkel / LENK_FAKTOR; } });

    g.userData = {
      autoId: autoDaten && autoDaten.id, karosserie: 'motorrad', lackFarbe: lack,
      raeder: [radH, radV], vorderraeder: [], lenkObjekte: [lenkProxy], bremslichter: [bremslicht], scheinwerfer: [scheinwerfer],
      bremslichtMaterial: bremslichtMat, blaulicht: [], dach: null,
      moto: true, lage, purzel, inhalt, lenkGruppe: lenk,
    };
    return g;
  }

  R.sonderbauten = R.sonderbauten || {};
  R.sonderbauten.motorrad = function (autoDaten, opt) { return bauen(autoDaten, opt); };

  R.Moto.modell = { verfuegbar: true, bauen, statistik, PIVOT_Y, PV, PH, AX, RAKE, GRIFF, LENK_FAKTOR, RAD_V, RAD_H, werkzeug: { sammler, tube, box, ellipsoid, V, gelenk, spanne, stabGeo, memo, lambert, vertexMat, basic, schattenMat, nummerMat, fahrerGeo, reifenGeo, felgeGeo, F, lum, SCHULTER, SCHULTER_Y, SCHULTER_Z } };   // M3: Bausteine für motoTypen.js (nur zusätzlich, nichts geändert)
})();
