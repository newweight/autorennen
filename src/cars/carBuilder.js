// ============================================================
// Auto-Bauer: erzeugt Low-Poly-Karosserien aus Grundformen.
//
// Aufruf:  const auto = Rennspiel.carBuilder.bauen(autoDatenAusKatalog);
//   -> THREE.Group, Ursprung = Bodenmitte, Fahrtrichtung = -z (Front bei -z).
//
// userData am Ergebnis:
//   raeder[4]         alle Räder (vorne links, vorne rechts, hinten links, hinten rechts);
//                     rad.rotation.x = Rolldrehung
//   vorderraeder[2]   die zwei vorderen Räder
//   lenkObjekte[2]    Halter der vorderen Räder – um y drehen = Lenkeinschlag
//   bremslichter[2]   Rücklicht-Meshes (eigenes Material je Auto, siehe setzeBremslicht)
//   scheinwerfer[2]   Scheinwerfer-Meshes
//   autoId, karosserie
//
// Aufbau (≈ 10 Meshes pro Auto): Karosserie = EIN Mesh aus allen Teilen mit
// Vertex-Farben (Lack, Glas, Kunststoff, Sitze ...), dazu Scheinwerfer, Rücklichter,
// 4 Räder, Blob-Schatten. Geometrien und Materialien werden pro Typ/Farbe
// gecacht und von allen Autos gleicher Bauart gemeinsam genutzt.
// Keine Markenlogos: nur Form und Farbe.
// ============================================================
(function () {
  const R = window.Rennspiel;

  // --- Farben der Anbauteile ---
  const GLAS = 0x1a2a3a;
  const KUNSTSTOFF = 0x2b2f36;     // Stoßfänger, Grill, Zierleisten
  const REIFEN = 0x1c1c1c;
  const FELGE = 0xe3e6ea;
  const SPEICHE = 0x555c66;
  const SITZ = 0xf1e2b8;           // helle Ledersitze (im Cabrio sichtbar)
  const LICHT_AUS = 0xa31414;      // Rücklicht normal
  const LICHT_AN = 0xff3b30;       // Rücklicht beim Bremsen

  // --- Caches (gemeinsame Instanzen) ---
  const cache = { karosserie: {}, rad: {}, licht: {}, material: {}, schatten: null };

  function material(farbe) {
    return new THREE.MeshLambertMaterial({ color: farbe });
  }

  /** Gemeinsames Material mit Vertex-Farben für alle Karosserien. */
  function karosserieMaterial() {
    if (!cache.material.karosserie) {
      cache.material.karosserie = new THREE.MeshLambertMaterial({ vertexColors: true });
    }
    return cache.material.karosserie;
  }

  // ------------------------------------------------------------
  // Geometrie-Werkzeuge: Teile sammeln und zu EINER Geometrie mit Vertex-Farben verschmelzen
  // ------------------------------------------------------------
  function verschmelzen(teile) {
    let n = 0;
    const gs = teile.map((t) => {
      const g = t.geo.index ? t.geo.toNonIndexed() : t.geo;
      n += g.attributes.position.count;
      return g;
    });
    const pos = new Float32Array(n * 3);
    const nor = new Float32Array(n * 3);
    const col = new Float32Array(n * 3);
    let o = 0;
    gs.forEach((g, i) => {
      const c = new THREE.Color(teile[i].farbe);
      const p = g.attributes.position.array, nn = g.attributes.normal.array;
      pos.set(p, o * 3);
      nor.set(nn, o * 3);
      for (let k = 0; k < g.attributes.position.count; k++) {
        col[(o + k) * 3] = c.r; col[(o + k) * 3 + 1] = c.g; col[(o + k) * 3 + 2] = c.b;
      }
      o += g.attributes.position.count;
      g.dispose();
      if (teile[i].geo !== g) teile[i].geo.dispose();
    });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.computeBoundingSphere();
    return geo;
  }

  /**
   * Baukasten für eine Karosserie. Alle Maße in Metern, Auto-Koordinaten:
   * x = rechts, y = oben, z = nach hinten (Front bei -z).
   * t = Längsanteil 0 (Front) … 1 (Heck), damit Formen mit der Wagenlänge skalieren.
   */
  function Baukasten(L, B) {
    this.L = L; this.B = B;
    this.teile = [];
  }
  Baukasten.prototype = {
    /** Längsposition aus Anteil t (0 = Front, 1 = Heck). */
    z(t) { return -this.L / 2 + t * this.L; },

    /** Quader mit Mitte (cx,cy,cz), Maße w (x), h (y), d (z); optional um x gekippt. */
    box(cx, cy, cz, w, h, d, farbe, kippX) {
      const g = new THREE.BoxGeometry(w, h, d);
      if (kippX) g.rotateX(kippX);
      g.translate(cx, cy, cz);
      this.teile.push({ geo: g, farbe });
    },

    /**
     * Seitenprofil (Polygon aus [t, y]) über die Breite extrudiert.
     * @param {number} xm Mitte in x (für seitliche Streben)
     */
    prof(punkte, breite, farbe, xm) {
      const s = new THREE.Shape(punkte.map(([t, y]) => new THREE.Vector2(this.z(t), y)));
      const g = new THREE.ExtrudeGeometry(s, { depth: breite, bevelEnabled: false, steps: 1 });
      g.translate(0, 0, -breite / 2);
      g.rotateY(-Math.PI / 2);          // Profil-x -> Auto-z, Extrusion -> Auto-x
      if (xm) g.translate(xm, 0, 0);
      this.teile.push({ geo: g, farbe });
    },

    /** Liegender Zylinder (Achse in z), z. B. runde Lufteinlässe. */
    zylinderZ(cx, cy, cz, radius, tiefe, farbe) {
      const g = new THREE.CylinderGeometry(radius, radius, tiefe, 12);
      g.rotateX(Math.PI / 2);
      g.translate(cx, cy, cz);
      this.teile.push({ geo: g, farbe });
    },
  };

  // ------------------------------------------------------------
  // Karosserie-Typen. Jede Funktion bekommt den Baukasten k und die Daten
  // d { farbe, farbe2, Bk (Karosseriebreite), variante } und liefert Zusatzangaben
  // { rad: {r, w, vorn, hinten}, licht: {...} } zurück.
  // ------------------------------------------------------------

  /** Zierteile, die fast jedes Auto hat: Stoßfänger, Spiegel. */
  function stossfaenger(k, d, yMitte, hoehe) {
    const Bk = d.Bk;
    k.box(0, yMitte, k.z(0) + 0.04, Bk + 0.02, hoehe, 0.2, KUNSTSTOFF);
    k.box(0, yMitte, k.z(1) - 0.04, Bk + 0.02, hoehe, 0.2, KUNSTSTOFF);
  }
  function spiegel(k, d, y, t, farbe) {
    const x = d.Bk / 2 * 0.9 + 0.06;
    k.box(-x, y, k.z(t), 0.18, 0.11, 0.13, farbe);
    k.box(x, y, k.z(t), 0.18, 0.11, 0.13, farbe);
  }
  /** Dunkle Türschnittfugen (nur Form, kein Logo). */
  function tuerfuge(k, d, t, yUnten, yOben) {
    const x = d.Bk / 2 + 0.005;
    const h = yOben - yUnten, y = (yUnten + yOben) / 2;
    k.box(-x, y, k.z(t), 0.025, h, 0.03, KUNSTSTOFF);
    k.box(x, y, k.z(t), 0.025, h, 0.03, KUNSTSTOFF);
  }

  const typen = {};

  // --- Limousine: klassische 3-Box (Motorraum, Kabine, Kofferraum) ---
  typen.limousine = function (k, d) {
    const Bk = d.Bk;
    k.prof([[0, 0.26], [0, 0.58], [0.025, 0.70], [0.30, 0.80], [0.74, 0.82], [0.975, 0.80], [1, 0.68], [1, 0.26]], Bk, d.farbe);
    stossfaenger(k, d, 0.36, 0.22);
    k.box(0, 0.56, k.z(0) + 0.01, Bk * 0.46, 0.10, 0.06, KUNSTSTOFF);       // Kühlergrill
    // Kabine (Glas), Dach und B-Säule
    k.prof([[0.30, 0.78], [0.415, 1.36], [0.64, 1.36], [0.745, 0.78]], Bk * 0.90, GLAS);
    k.box(0, 1.385, k.z(0.5275), Bk * 0.94, 0.08, 0.225 * k.L + 0.1, d.farbe);
    k.box(0, 1.08, k.z(0.53), Bk * 0.90 + 0.02, 0.58, 0.09, d.farbe);
    spiegel(k, d, 0.98, 0.33, d.farbe);
    tuerfuge(k, d, 0.40, 0.34, 0.80);
    tuerfuge(k, d, 0.66, 0.34, 0.80);
    return { rad: { r: 0.34, w: 0.26, vorn: 0.215, hinten: 0.78 }, licht: { y: 0.62, yHeck: 0.70 } };
  };

  // --- Kombi: Limousine mit langem Dach bis zum Heck ---
  typen.kombi = function (k, d) {
    const Bk = d.Bk;
    k.prof([[0, 0.26], [0, 0.60], [0.025, 0.74], [0.30, 0.84], [0.97, 0.86], [1, 0.78], [1, 0.26]], Bk, d.farbe);
    stossfaenger(k, d, 0.36, 0.22);
    k.box(0, 0.58, k.z(0) + 0.01, Bk * 0.60, 0.12, 0.06, KUNSTSTOFF);       // breiter Grill
    k.prof([[0.30, 0.82], [0.42, 1.42], [0.90, 1.42], [0.985, 0.84]], Bk * 0.90, GLAS);
    k.box(0, 1.435, k.z(0.66), Bk * 0.94, 0.08, 0.50 * k.L, d.farbe);
    k.box(0, 1.12, k.z(0.50), Bk * 0.90 + 0.02, 0.62, 0.09, d.farbe);        // B-Säule
    k.box(0, 1.12, k.z(0.76), Bk * 0.90 + 0.02, 0.62, 0.11, d.farbe);        // C-Säule
    // Dachreling
    k.box(-Bk * 0.40, 1.50, k.z(0.66), 0.06, 0.06, 0.46 * k.L, KUNSTSTOFF);
    k.box(Bk * 0.40, 1.50, k.z(0.66), 0.06, 0.06, 0.46 * k.L, KUNSTSTOFF);
    spiegel(k, d, 1.0, 0.33, d.farbe);
    tuerfuge(k, d, 0.40, 0.34, 0.84);
    tuerfuge(k, d, 0.62, 0.34, 0.84);
    return { rad: { r: 0.36, w: 0.28, vorn: 0.215, hinten: 0.79 }, licht: { y: 0.64, yHeck: 0.80 } };
  };

  // --- Coupé: flach, lange Türen, Dachlinie ohne B-Säule, Entenbürzel ---
  typen.coupe = function (k, d) {
    const Bk = d.Bk;
    k.prof([[0, 0.26], [0, 0.58], [0.025, 0.68], [0.30, 0.76], [0.72, 0.80], [0.975, 0.80], [1, 0.70], [1, 0.26]], Bk, d.farbe);
    stossfaenger(k, d, 0.36, 0.22);
    // Doppelniere-artiger Grill (nur Form)
    k.box(-Bk * 0.12, 0.56, k.z(0) + 0.01, Bk * 0.20, 0.13, 0.06, KUNSTSTOFF);
    k.box(Bk * 0.12, 0.56, k.z(0) + 0.01, Bk * 0.20, 0.13, 0.06, KUNSTSTOFF);
    // Kabine: niedrig, durchgehende Seitenscheibe
    k.prof([[0.34, 0.76], [0.45, 1.22], [0.66, 1.22], [0.80, 0.80]], Bk * 0.90, GLAS);
    k.box(0, 1.245, k.z(0.555), Bk * 0.94, 0.07, 0.21 * k.L + 0.04, d.farbe);
    // Entenbürzel hinten
    k.box(0, 0.86, k.z(0.945), Bk * 0.88, 0.06, 0.22, d.farbe, -0.15);
    tuerfuge(k, d, 0.36, 0.34, 0.78);
    tuerfuge(k, d, 0.68, 0.34, 0.80);
    // Kotflügelverbreiterungen
    [0.215, 0.79].forEach((t) => {
      k.box(-Bk / 2 - 0.02, 0.60, k.z(t), 0.08, 0.14, 1.0, d.farbe);
      k.box(Bk / 2 + 0.02, 0.60, k.z(t), 0.08, 0.14, 1.0, d.farbe);
    });
    spiegel(k, d, 0.84, 0.37, d.farbe);
    return { rad: { r: 0.34, w: 0.28, vorn: 0.215, hinten: 0.785 }, licht: { y: 0.60, yHeck: 0.70 } };
  };

  // --- Sportwagen: flach, lang, abfallendes Heck, kleiner Heckspoiler ---
  typen.sportwagen = function (k, d) {
    const Bk = d.Bk;
    if (d.variante === 'langehaube') {
      // Lange Schnauze, Kabine weit hinten, kurzes Heck
      k.prof([[0, 0.24], [0, 0.46], [0.04, 0.58], [0.40, 0.70], [0.62, 0.76], [0.82, 0.80], [0.97, 0.78], [1, 0.66], [1, 0.24]], Bk, d.farbe);
      k.box(0, 0.54, k.z(0) + 0.01, Bk * 0.62, 0.10, 0.06, KUNSTSTOFF);    // breiter Mund
      k.box(0, 0.745, k.z(0.22), Bk * 0.26, 0.03, 0.9, KUNSTSTOFF);          // Haubenschlitz
      k.prof([[0.46, 0.68], [0.57, 1.06], [0.69, 1.07], [0.82, 0.80]], Bk * 0.90, GLAS);
      k.prof([[0.57, 1.08], [0.69, 1.09], [0.84, 0.80], [0.815, 0.74], [0.69, 1.03], [0.565, 1.02]], Bk * 0.94, d.farbe);
      k.box(0, 0.86, k.z(0.955), Bk * 0.74, 0.05, 0.22, d.farbe, -0.12);     // kleiner Spoiler
    } else {
      // Heckmotor-Silhouette: kurze Haube, Kabine in der Mitte, Fließheck
      k.prof([[0, 0.24], [0, 0.46], [0.04, 0.56], [0.30, 0.67], [0.50, 0.74], [0.72, 0.78], [0.97, 0.72], [1, 0.60], [1, 0.24]], Bk, d.farbe);
      k.box(0, 0.50, k.z(0) + 0.01, Bk * 0.40, 0.08, 0.06, KUNSTSTOFF);
      k.prof([[0.30, 0.66], [0.43, 1.07], [0.60, 1.09], [0.80, 0.80]], Bk * 0.90, GLAS);
      k.prof([[0.43, 1.10], [0.60, 1.12], [0.83, 0.80], [0.80, 0.74], [0.60, 1.06], [0.43, 1.04]], Bk * 0.94, d.farbe);
      k.box(0, 0.83, k.z(0.94), Bk * 0.72, 0.05, 0.30, d.farbe, -0.14);      // Entenbürzel-Spoiler
    }
    stossfaenger(k, d, 0.33, 0.18);
    // Kotflügelverbreiterungen (breite Hüften)
    [0.215, 0.79].forEach((t) => {
      k.box(-Bk / 2 - 0.02, 0.58, k.z(t), 0.08, 0.14, 1.0, d.farbe);
      k.box(Bk / 2 + 0.02, 0.58, k.z(t), 0.08, 0.14, 1.0, d.farbe);
    });
    spiegel(k, d, d.variante === 'langehaube' ? 0.80 : 0.74, d.variante === 'langehaube' ? 0.50 : 0.35, d.farbe);
    tuerfuge(k, d, d.variante === 'langehaube' ? 0.52 : 0.42, 0.34, 0.74);
    const rund = d.variante !== 'langehaube';
    return { rad: { r: 0.34, w: 0.30, vorn: 0.20, hinten: 0.79 }, licht: { y: 0.52, yHeck: 0.62, rund } };
  };

  // --- Kleinwagen: kurz, rund, hohes Dach in Kontrastfarbe ---
  typen.kleinwagen = function (k, d) {
    const Bk = d.Bk;
    const dach = d.farbe2 !== undefined ? d.farbe2 : d.farbe;
    k.prof([[0, 0.28], [0, 0.66], [0.05, 0.80], [0.25, 0.86], [0.92, 0.86], [1, 0.76], [1, 0.28]], Bk, d.farbe);
    stossfaenger(k, d, 0.38, 0.20);
    k.box(0, 0.58, k.z(0) + 0.01, Bk * 0.42, 0.12, 0.06, KUNSTSTOFF);
    // Zwei weiße Rennstreifen auf der Haube
    k.box(-0.12, 0.875, k.z(0.15), 0.12, 0.02, 0.65, dach);
    k.box(0.12, 0.875, k.z(0.15), 0.12, 0.02, 0.65, dach);
    // Kabine: kurz und hoch, großes Fenster
    k.prof([[0.27, 0.84], [0.36, 1.40], [0.80, 1.40], [0.88, 0.88]], Bk * 0.90, GLAS);
    k.box(0, 1.44, k.z(0.585), Bk * 0.97, 0.10, 0.50 * k.L, dach);           // Kontrastdach
    k.box(0, 1.10, k.z(0.58), Bk * 0.90 + 0.02, 0.58, 0.09, d.farbe);        // Säule
    spiegel(k, d, 0.98, 0.30, dach);
    tuerfuge(k, d, 0.30, 0.36, 0.86);
    tuerfuge(k, d, 0.62, 0.36, 0.86);
    return { rad: { r: 0.31, w: 0.24, vorn: 0.17, hinten: 0.83 }, licht: { y: 0.70, yHeck: 0.68, rund: true, rundR: 0.17, heckHoch: true } };
  };

  // --- Van: hoher Kasten, große Fenster, flache Schnauze, zweifarbig ---
  typen.van = function (k, d) {
    const Bk = d.Bk;
    const oben = d.farbe2 !== undefined ? d.farbe2 : d.farbe;
    k.prof([[0, 0.30], [0, 0.88], [0.04, 1.00], [0.15, 1.06], [0.97, 1.06], [1, 0.98], [1, 0.30]], Bk, d.farbe);
    stossfaenger(k, d, 0.40, 0.24);
    k.box(0, 0.72, k.z(0) + 0.01, Bk * 0.60, 0.16, 0.06, KUNSTSTOFF);        // Grill
    // Große Fensterfläche
    k.prof([[0.15, 1.04], [0.27, 1.80], [0.975, 1.80], [0.995, 1.06]], Bk * 0.92, GLAS);
    // Weißer Oberbau: Dach, Säulen und Fensterrahmen
    k.box(0, 1.85, k.z(0.62), Bk * 0.98, 0.12, 0.74 * k.L, oben);
    [0.43, 0.60, 0.79].forEach((t) => k.box(0, 1.42, k.z(t), Bk * 0.92 + 0.02, 0.76, 0.12, oben));
    k.box(0, 1.10, k.z(0.60), Bk + 0.005, 0.08, 0.84 * k.L, oben);          // weißer Gürtelstreifen
    spiegel(k, d, 1.18, 0.20, d.farbe);
    tuerfuge(k, d, 0.37, 0.36, 1.06);   // Schiebetür
    tuerfuge(k, d, 0.69, 0.36, 1.06);
    return { rad: { r: 0.37, w: 0.28, vorn: 0.20, hinten: 0.81 }, licht: { y: 0.90, yHeck: 0.92 } };
  };

  // --- SUV: hoch, kantig, dunkle Kunststoff-Verkleidung ---
  typen.suv = function (k, d) {
    const Bk = d.Bk;
    k.prof([[0, 0.30], [0, 0.78], [0.03, 0.92], [0.28, 1.00], [0.96, 1.02], [1, 0.92], [1, 0.30]], Bk, d.farbe);
    stossfaenger(k, d, 0.40, 0.26);
    k.box(0, 0.66, k.z(0) + 0.01, Bk * 0.56, 0.14, 0.06, KUNSTSTOFF);
    k.prof([[0.28, 0.98], [0.38, 1.56], [0.88, 1.56], [0.97, 1.04]], Bk * 0.90, GLAS);
    k.box(0, 1.585, k.z(0.64), Bk * 0.94, 0.08, 0.50 * k.L + 0.1, d.farbe);
    k.box(0, 1.28, k.z(0.52), Bk * 0.90 + 0.02, 0.60, 0.10, d.farbe);
    k.box(-Bk * 0.40, 1.66, k.z(0.64), 0.06, 0.06, 0.46 * k.L, KUNSTSTOFF);
    k.box(Bk * 0.40, 1.66, k.z(0.64), 0.06, 0.06, 0.46 * k.L, KUNSTSTOFF);
    // Schwellerverkleidung + Radkästen
    k.box(-Bk / 2 - 0.01, 0.40, k.z(0.5), 0.05, 0.14, 0.42 * k.L, KUNSTSTOFF);
    k.box(Bk / 2 + 0.01, 0.40, k.z(0.5), 0.05, 0.14, 0.42 * k.L, KUNSTSTOFF);
    spiegel(k, d, 1.08, 0.32, d.farbe);
    tuerfuge(k, d, 0.40, 0.40, 1.00);
    tuerfuge(k, d, 0.66, 0.40, 1.00);
    return { rad: { r: 0.38, w: 0.28, vorn: 0.215, hinten: 0.79 }, licht: { y: 0.80, yHeck: 0.82 } };
  };

  // --- Cabrio (SUV-Cabrio): offen ohne Dach, Windschutzscheibe, Sitze sichtbar, Heck hoch ---
  typen.cabrio = function (k, d) {
    const Bk = d.Bk;
    // Motorhaube (vorne) und hohes Heck mit Verdeckkasten
    k.prof([[0, 0.30], [0, 0.78], [0.03, 0.92], [0.30, 1.00], [0.30, 0.30]], Bk, d.farbe);
    k.prof([[0.77, 0.30], [0.77, 1.04], [0.97, 1.06], [1, 0.94], [1, 0.30]], Bk, d.farbe);
    stossfaenger(k, d, 0.40, 0.24);
    k.box(0, 0.66, k.z(0) + 0.01, Bk * 0.56, 0.12, 0.06, KUNSTSTOFF);
    // Cockpit: Boden + Seitenwände
    k.box(0, 0.52, k.z(0.535), Bk, 0.44, 0.47 * k.L, d.farbe);
    [-1, 1].forEach((s) => k.box(s * (Bk / 2 - 0.06), 0.82, k.z(0.535), 0.12, 0.44, 0.47 * k.L, d.farbe));
    // Armaturenbrett
    k.box(0, 0.95, k.z(0.32), Bk * 0.84, 0.24, 0.22, KUNSTSTOFF);
    // Vordersitze (Sitzfläche + Lehne), Rückbank
    [-1, 1].forEach((s) => {
      k.box(s * 0.40, 0.78, k.z(0.50), 0.50, 0.14, 0.50, SITZ);
      k.box(s * 0.40, 1.08, k.z(0.58), 0.50, 0.55, 0.12, SITZ);
    });
    k.box(0, 0.78, k.z(0.69), Bk * 0.72, 0.14, 0.40, SITZ);
    k.box(0, 1.06, k.z(0.755), Bk * 0.72, 0.50, 0.10, SITZ);
    // Windschutzscheibe: schräge Glasscheibe mit Rahmen und Streben
    const scheibe = [[0.30, 1.00], [0.385, 1.46], [0.41, 1.46], [0.325, 1.00]];
    k.prof(scheibe, Bk * 0.86, GLAS);
    [-1, 1].forEach((s) => k.prof(scheibe, 0.09, d.farbe, s * Bk * 0.45));
    k.box(0, 1.465, k.z(0.398), Bk * 0.92, 0.08, 0.10, d.farbe, 0);
    // Verdeck-Abdeckung (zusammengeklapptes Dach) hinter den Rücksitzen
    k.box(0, 1.10, k.z(0.88), Bk * 0.94, 0.12, 0.30 * k.L * 0.7, KUNSTSTOFF);
    spiegel(k, d, 1.12, 0.31, d.farbe);
    return { rad: { r: 0.37, w: 0.28, vorn: 0.215, hinten: 0.80 }, licht: { y: 0.80, yHeck: 0.84 } };
  };

  // ------------------------------------------------------------
  // Rad, Licht, Schatten
  // ------------------------------------------------------------

  /** Rad als EIN Mesh (Reifen + Felge + Speichen); Achse = x, rotation.x = Rollen. */
  function radGeometrie(r, w) {
    const key = r + '_' + w;
    if (cache.rad[key]) return cache.rad[key];
    const teile = [];
    const reifen = new THREE.CylinderGeometry(r, r, w, 14);
    reifen.rotateZ(Math.PI / 2);
    teile.push({ geo: reifen, farbe: REIFEN });
    const felge = new THREE.CylinderGeometry(r * 0.62, r * 0.62, w + 0.03, 14);
    felge.rotateZ(Math.PI / 2);
    teile.push({ geo: felge, farbe: FELGE });
    // drei Speichen als Balken, damit man das Rollen sieht
    for (let i = 0; i < 3; i++) {
      const sp = new THREE.BoxGeometry(w + 0.06, r * 0.16, r * 1.1);
      sp.rotateX((i * Math.PI) / 3);
      teile.push({ geo: sp, farbe: SPEICHE });
    }
    cache.rad[key] = verschmelzen(teile);
    return cache.rad[key];
  }

  function lichtGeometrie(form, w, h, tiefe) {
    const key = form + '_' + w + '_' + h + '_' + tiefe;
    if (!cache.licht[key]) {
      if (form === 'rund') {
        const g = new THREE.CylinderGeometry(w / 2, w / 2, tiefe, 12);
        g.rotateX(Math.PI / 2);
        cache.licht[key] = g;
      } else {
        cache.licht[key] = new THREE.BoxGeometry(w, h, tiefe);
      }
    }
    return cache.licht[key];
  }

  function scheinwerferMaterial() {
    if (!cache.material.scheinwerfer) {
      cache.material.scheinwerfer = new THREE.MeshBasicMaterial({ color: 0xfff6c8 });
    }
    return cache.material.scheinwerfer;
  }

  function schattenMesh(L, B) {
    if (!cache.schatten) {
      // weicher, ovaler Verlauf (einmal als Textur erzeugt)
      let map = null;
      try {
        const c = document.createElement('canvas');
        c.width = 128; c.height = 256;
        const g = c.getContext('2d');
        g.translate(64, 128); g.scale(1, 2);
        const grad = g.createRadialGradient(0, 0, 0, 0, 0, 64);
        grad.addColorStop(0, 'rgba(0,0,0,0.85)');
        grad.addColorStop(0.6, 'rgba(0,0,0,0.6)');
        grad.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = grad;
        g.fillRect(-64, -64, 128, 128);
        map = new THREE.CanvasTexture(c);
      } catch (e) { map = null; }
      cache.schatten = new THREE.MeshBasicMaterial(map
        ? { map, transparent: true, opacity: 0.55, depthWrite: false }
        : { color: 0x000000, transparent: true, opacity: 0.3, depthWrite: false });
    }
    const m = new THREE.Mesh(new THREE.PlaneGeometry(B + 0.9, L + 1.0), cache.schatten);
    m.rotation.x = -Math.PI / 2;
    m.position.y = 0.02;
    m.name = 'schatten';
    return m;
  }

  // ------------------------------------------------------------
  // Hauptfunktion
  // ------------------------------------------------------------

  /**
   * Baut ein Auto aus einem Katalog-Eintrag (Rennspiel.carCatalog[i]).
   * @returns {THREE.Group} Ursprung = Bodenmitte, Front bei -z
   */
  function bauen(autoDaten) {
    const f = autoDaten.fahrwerte || {};
    const L = f.laenge || 4.4, B = f.breite || 1.8;
    const typ = typen[autoDaten.karosserie] ? autoDaten.karosserie : 'limousine';
    const farbe = autoDaten.farbe !== undefined ? autoDaten.farbe : 0x2255cc;
    const key = [typ, autoDaten.variante || '', farbe, autoDaten.farbe2 === undefined ? '' : autoDaten.farbe2, L, B].join('|');

    // Karosserie-Geometrie (gecacht)
    let eintrag = cache.karosserie[key];
    if (!eintrag) {
      const k = new Baukasten(L, B);
      const d = { farbe, farbe2: autoDaten.farbe2, Bk: B * 0.96, variante: autoDaten.variante };
      const extra = typen[typ](k, d);
      eintrag = { geo: verschmelzen(k.teile), extra, Bk: d.Bk };
      cache.karosserie[key] = eintrag;
    }
    const { extra } = eintrag;
    const Bk = eintrag.Bk;

    const g = new THREE.Group();
    g.name = autoDaten.id || typ;

    const koerper = new THREE.Mesh(eintrag.geo, karosserieMaterial());
    koerper.name = 'karosserie';
    g.add(koerper);

    // --- Scheinwerfer ---
    const li = extra.licht;
    const scheinwerfer = [];
    const swForm = li.rund ? 'rund' : 'eckig';
    const swB = li.rund ? (li.rundR ? li.rundR * 2 : 0.26) : 0.36;
    const swGeo = lichtGeometrie(swForm, swB, 0.14, 0.12);
    [-1, 1].forEach((s) => {
      const m = new THREE.Mesh(swGeo, scheinwerferMaterial());
      m.position.set(s * Bk * (li.rund ? 0.33 : 0.34), li.y, -L / 2 + 0.03);
      m.name = 'scheinwerfer';
      g.add(m); scheinwerfer.push(m);
    });

    // --- Rücklichter (eigenes Material je Auto, damit sie einzeln heller werden können) ---
    const bremslichtMat = new THREE.MeshBasicMaterial({ color: LICHT_AUS });
    const rlGeo = li.heckHoch ? lichtGeometrie('eckig', 0.14, 0.30, 0.1) : lichtGeometrie('eckig', 0.38, 0.13, 0.1);
    const bremslichter = [];
    [-1, 1].forEach((s) => {
      const m = new THREE.Mesh(rlGeo, bremslichtMat);
      m.position.set(s * Bk * 0.37, li.yHeck, L / 2 - 0.03);
      m.name = 'bremslicht';
      g.add(m); bremslichter.push(m);
    });

    // --- Räder ---
    const rd = extra.rad;
    const radGeo = radGeometrie(rd.r, rd.w);
    const radMat = karosserieMaterial();
    const raeder = [], vorderraeder = [], lenkObjekte = [];
    const xRad = B / 2 - rd.w / 2;
    [[-1, rd.vorn, true], [1, rd.vorn, true], [-1, rd.hinten, false], [1, rd.hinten, false]].forEach(([s, t, vorn]) => {
      const halter = new THREE.Group();
      halter.position.set(s * xRad, rd.r, -L / 2 + t * L);
      halter.name = vorn ? 'lenkhalter' : 'radhalter';
      const rad = new THREE.Mesh(radGeo, radMat);
      rad.name = 'rad';
      halter.add(rad);
      g.add(halter);
      raeder.push(rad);
      if (vorn) { vorderraeder.push(rad); lenkObjekte.push(halter); }
    });

    g.add(schattenMesh(L, B));

    g.userData = {
      autoId: autoDaten.id, karosserie: typ,
      raeder, vorderraeder, lenkObjekte, bremslichter, scheinwerfer,
      bremslichtMaterial: bremslichtMat,
    };
    return g;
  }

  /** Bremslichter an/aus (heller beim Bremsen). */
  function setzeBremslicht(auto, an) {
    const m = auto.userData.bremslichtMaterial;
    if (m) m.color.setHex(an ? LICHT_AN : LICHT_AUS);
  }

  /** Vorderräder einschlagen (Winkel in Radiant, positiv = nach links). */
  function lenkeRaeder(auto, winkel) {
    auto.userData.lenkObjekte.forEach((h) => { h.rotation.y = winkel; });
  }

  /** Alle Räder um den Rollwinkel drehen (aus gefahrener Strecke / Radradius). */
  function dreheRaeder(auto, winkel) {
    auto.userData.raeder.forEach((r) => { r.rotation.x = winkel; });
  }

  /** Cache leeren (nur falls Katalog zur Laufzeit geändert wird). */
  function cacheLeeren() {
    Object.values(cache.karosserie).forEach((e) => e.geo.dispose());
    Object.values(cache.rad).forEach((geo) => geo.dispose());
    cache.karosserie = {}; cache.rad = {};
  }

  /** Einfaches Platzhalter-Auto (Kasten + Kabine + 4 Räder). */
  function platzhalterAuto(farbe = 0x2255cc) {
    const g = new THREE.Group();
    const karosserie = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.55, 4.3), material(farbe));
    karosserie.position.y = 0.55;
    g.add(karosserie);
    const kabine = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.5, 2.0), material(0x222222));
    kabine.position.set(0, 1.05, -0.2);
    g.add(kabine);
    const radGeo = new THREE.CylinderGeometry(0.34, 0.34, 0.25, 12);
    radGeo.rotateZ(Math.PI / 2);
    const radMat = material(0x111111);
    [[-0.85, 1.4], [0.85, 1.4], [-0.85, -1.4], [0.85, -1.4]].forEach(([x, z]) => {
      const rad = new THREE.Mesh(radGeo, radMat);
      rad.position.set(x, 0.34, z);
      g.add(rad);
    });
    // Blob-Schatten
    const schatten = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 4.8),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35 }));
    schatten.rotation.x = -Math.PI / 2; schatten.position.y = 0.02;
    g.add(schatten);
    return g;
  }

  R.carBuilder = { bauen, platzhalterAuto, setzeBremslicht, lenkeRaeder, dreheRaeder, cacheLeeren };
})();
