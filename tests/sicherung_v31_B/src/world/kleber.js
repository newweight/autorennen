// ============================================================
// Runde 5: Klebe-Seitenstreifen (nur Fantasie-Welten) – Logik, Streifen-Grafik und Kleber-Optik am Auto
//
// Katalog: kleber [{ s0, s1, seite: -1 | 1 | 0 (beide) }] → strecke.kleber (Schicht 'kleber', trackBuilder).
// Untergrund: Auf dem Randstreifen (randBreite) eines Abschnitts liefert strecke.abfrage() 'kleber'
//   (config.kleber.untergrund: grip 0,7, rollwiderstand 8 → bremst deutlich; wird hier in physik.untergrund
//   eingetragen, damit vehicle.js ihn kennt).
// Kleben: Steht/fährt ein Auto länger als config.kleber.sekunden (2 s) am Stück darauf → „klebt" dauer (5 s):
//   Steuerung aus (main.js nullt die Eingabe), Tempo 0. Danach „gelöst": kurzer Rückstoß Richtung Fahrbahnmitte
//   (rueckstoss m/s) und frei s Schonzeit, in der der Streifen wie ein normaler Rand wirkt (sonst käme ein
//   schwaches Auto mit Rollwiderstand 8 nicht mehr herunter → klebte endlos).
// Optik: grüne, glänzende Streifen auf dem Rand (bauen) + am festgeklebten Auto grüne Fäden (gestreckte
//   Zylinder) und Blasen (kleine Kugeln), pulsierend (optik). KI wird gleich behandelt.
// Rechenteil ohne Three.js (Node-Test tests/test_kleber.js); bauen()/optik() brauchen THREE.
// ============================================================
(function () {
  const R = window.Rennspiel;

  function C() { return R.config.kleber || {}; }
  function wert(x, std) { return x === undefined ? std : x; }

  // Untergrund für vehicle.js registrieren (config.js: nur der Block `kleber`)
  if (R.config && R.config.physik && R.config.physik.untergrund && !R.config.physik.untergrund.kleber) {
    R.config.physik.untergrund.kleber = Object.assign({ grip: 0.7, rollwiderstand: 8, vMaxFaktor: 0.6 }, C().untergrund || {});
  }

  /** Neuer Zustand je Fahrzeug (f.kleber = Kleber.zustand()). */
  function zustand() {
    return { zeit: 0, klebt: 0, frei: 0, anzeige: 0, klebungen: 0 };
  }

  /** Ist das Auto gerade festgeklebt? (main.js: Eingabe ignorieren) */
  function gesperrt(kz) { return !!(kz && kz.klebt > 0); }

  /** Untergrund für vehicle.schritt: in der Schonzeit nach dem Lösen wirkt der Streifen wie ein Rand. */
  function untergrund(kz, ug) { return ug === 'kleber' && kz && kz.frei > 0 ? 'rand' : ug; }

  /**
   * Nach vehicle.schritt. nah = strecke.abfrage(...) VOR dem Schritt (mit .untergrund, .seitenabstand, .index, .t).
   * Liefert null oder { typ: 'klebt' | 'tick' | 'geloest', rest (ganze Sekunden) }.
   */
  function nachSchritt(kz, vehicle, strecke, nah, dt) {
    if (!kz) return null;
    const c = C();
    if (kz.klebt > 0) {
      kz.klebt -= dt;
      vehicle.vLaengs = 0; vehicle.vQuer = 0; vehicle.lenkung = 0;
      if (kz.klebt <= 0) {
        kz.klebt = 0; kz.zeit = 0; kz.frei = wert(c.frei, 3);
        // Rückstoß Richtung Fahrbahnmitte
        if (strecke && nah) {
          const n = strecke.spline.naechster(vehicle.x, vehicle.z, nah.index);
          const p = strecke.spline.punktBei(n.s), vz = n.seitenabstand > 0 ? -1 : 1, st = wert(c.rueckstoss, 2);
          vehicle.weltGeschwindigkeitSetzen(p.nx * vz * st, p.nz * vz * st);
        }
        return { typ: 'geloest', rest: 0 };
      }
      const rest = Math.max(1, Math.ceil(kz.klebt - 1e-6));
      if (rest !== kz.anzeige) { kz.anzeige = rest; return { typ: 'tick', rest }; }
      return null;
    }
    if (kz.frei > 0) kz.frei = Math.max(0, kz.frei - dt);
    const drauf = nah && nah.untergrund === 'kleber' && !vehicle.imLooping && !vehicle.imFlug;
    if (!drauf || kz.frei > 0) { kz.zeit = 0; return null; }
    kz.zeit += dt;
    if (kz.zeit > wert(c.sekunden, 2)) {
      kz.klebt = wert(c.dauer, 5); kz.anzeige = Math.ceil(kz.klebt); kz.zeit = 0; kz.klebungen++;
      vehicle.vLaengs = 0; vehicle.vQuer = 0; vehicle.lenkung = 0;
      return { typ: 'klebt', rest: kz.anzeige };
    }
    return null;
  }

  /** Zustand zurücksetzen (Reset/Teleport). */
  function abbrechen(kz) { if (kz) { kz.zeit = 0; kz.klebt = 0; kz.frei = 0; kz.anzeige = 0; } }

  // ------------------------------------------------------------------ Grafik (THREE)

  /**
   * Klebestreifen einer Strecke als Gruppe 'Kleber' (2 Draw-Calls): glänzende grüne Bänder auf dem Randstreifen
   * (leicht über den Randsteinen) + Kleber-Tropfen (InstancedMesh, flache Halbkugeln).
   */
  function bauen(strecke) {
    const g = new THREE.Group();
    g.name = 'Kleber';
    const farbe = wert(C().farbe, 0x3ddc5a), sp = strecke.spline, v = [], tropfen = [];
    let zufall = 12345;
    const rnd = () => { zufall = (zufall * 16807) % 2147483647; return zufall / 2147483647; };
    strecke.kleber.forEach((k) => {
      const laenge = sp.differenzS(k.s1, k.s0), n = Math.max(2, Math.round(laenge / 2));
      const seiten = k.seite === 0 ? [-1, 1] : [k.seite];
      seiten.forEach((sg) => {
        for (let i = 0; i < n; i++) {
          const s0 = k.s0 + laenge * i / n, s1 = k.s0 + laenge * (i + 1) / n;
          const b0 = strecke.breiteBei(s0) / 2, b1 = strecke.breiteBei(s1) / 2, rb = strecke.randBreite;
          // Rand des Streifens leicht gewellt (wie zerlaufen)
          const w0 = Math.sin(s0 * 0.9) * 0.08, w1 = Math.sin(s1 * 0.9) * 0.08;
          const a = strecke._punktSQ(s0, sg * (b0 + 0.02), 0.1), b = strecke._punktSQ(s0, sg * (b0 + rb + w0), 0.1);
          const c = strecke._punktSQ(s1, sg * (b1 + rb + w1), 0.1), d = strecke._punktSQ(s1, sg * (b1 + 0.02), 0.1);
          const hell = i % 2 ? farbe : new THREE.Color(farbe).lerp(new THREE.Color(0xb6ffc4), 0.25).getHex();
          v.push(sg > 0 ? { a, b, c, d, farbe: hell } : { a: d, b: c, c: b, d: a, farbe: hell });
          // Tropfen/Blasen auf dem Streifen
          if (rnd() < 0.7) {
            const sm = s0 + rnd() * (s1 - s0), q = sg * (b0 + 0.25 + rnd() * (rb - 0.5));
            const p = strecke._punktSQ(sm, q, 0.1);
            tropfen.push({ x: p[0], y: p[1], z: p[2], r: 0.12 + rnd() * 0.22 });
          }
        }
      });
    });
    const band = new THREE.Mesh(strecke._viereckeZuGeometrie(v), new THREE.MeshPhongMaterial({
      vertexColors: true, shininess: 110, specular: 0xeaffea, emissive: 0x0b3d16,
      polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }));
    band.name = 'KleberStreifen';
    g.add(band);
    if (tropfen.length) {
      const geo = new THREE.SphereGeometry(1, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2);
      const m = new THREE.InstancedMesh(geo, new THREE.MeshPhongMaterial({ color: 0x7dff96, shininess: 140, specular: 0xffffff,
        emissive: 0x0f4a1c }), tropfen.length);
      const d = new THREE.Object3D();
      tropfen.forEach((t, i) => { d.position.set(t.x, t.y, t.z); d.scale.set(t.r, t.r * 0.45, t.r); d.updateMatrix(); m.setMatrixAt(i, d.matrix); });
      m.instanceMatrix.needsUpdate = true;
      m.name = 'KleberTropfen';
      g.add(m);
    }
    return g;
  }

  let _mat = null;
  function material() {
    if (!_mat) _mat = new THREE.MeshPhongMaterial({ color: 0x46e86a, shininess: 120, specular: 0xffffff, emissive: 0x0d4a1b,
      transparent: true, opacity: 0.85 });
    return _mat;
  }

  /**
   * Kleber-Optik am Auto (f = Fahrzeug-Eintrag mit .mesh, .vehicle): an = true zeigt grüne Fäden + Blasen
   * (beim ersten Mal gebaut, Kind von f.mesh), an = false blendet sie aus. Pulsiert über onBeforeRender.
   */
  function optik(f, an) {
    if (!f || !f.mesh || typeof THREE === 'undefined') return;
    let g = f._kleberOptik;
    if (!g) {
      if (!an) return;
      g = new THREE.Group(); g.name = 'KleberOptik';
      const d = f.vehicle.daten, hl = d.laenge / 2, hb = d.breite / 2, mat = material();
      const faden = new THREE.CylinderGeometry(0.035, 0.06, 1, 6), kugel = new THREE.SphereGeometry(1, 10, 8);
      const teile = [];
      // Fäden: von der Karosserie-Unterkante (y 0,45) schräg nach außen zum Boden
      for (let k = 0; k < 10; k++) {
        const seite = k % 2 ? 1 : -1, la = -hl * 0.8 + (k >> 1) * (hl * 1.6 / 4);
        const oben = new THREE.Vector3(seite * hb * 0.9, 0.5, la), unten = new THREE.Vector3(seite * (hb + 0.35 + (k % 3) * 0.12), 0.02, la + ((k % 3) - 1) * 0.25);
        const m = new THREE.Mesh(faden, mat), mitte = oben.clone().add(unten).multiplyScalar(0.5), dir = unten.clone().sub(oben);
        m.position.copy(mitte); m.scale.set(1, dir.length(), 1);
        m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
        m.userData.phase = k * 0.7; m.userData.basis = m.scale.clone();
        g.add(m); teile.push(m);
      }
      // Blasen: an Rädern, Schwellern und Boden
      for (let k = 0; k < 12; k++) {
        const m = new THREE.Mesh(kugel, mat), seite = k % 2 ? 1 : -1;
        const r = 0.1 + (k % 4) * 0.05;
        m.position.set(seite * (hb + 0.1 + (k % 3) * 0.1), 0.08 + (k % 5) * 0.12, -hl + (k / 11) * 2 * hl);
        m.scale.setScalar(r);
        m.userData.phase = k * 1.3; m.userData.basis = m.scale.clone();
        g.add(m); teile.push(m);
      }
      // Pulsieren (Zeit aus performance.now, nur solange sichtbar)
      const takt = teile[0];
      takt.onBeforeRender = () => {
        const t = (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000;
        teile.forEach((m) => {
          const p = 1 + 0.18 * Math.sin(t * 5 + m.userData.phase), b = m.userData.basis;
          if (m.geometry === faden) m.scale.set(b.x * (1.4 - 0.4 * p), b.y * (0.92 + 0.08 * p), b.z * (1.4 - 0.4 * p));
          else m.scale.set(b.x * p, b.y * p, b.z * p);
        });
      };
      f.mesh.add(g);
      f._kleberOptik = g;
    }
    g.visible = !!an;
  }

  R.Kleber = { zustand, gesperrt, untergrund, nachSchritt, abbrechen, bauen, optik };
})();
