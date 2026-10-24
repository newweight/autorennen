// ============================================================
// Motorrad-Unfälle (Stufe M2c) – Welt: Werkstatt, Krankenstation, Wegweiser, Helfer-Fahrzeuge, Qualm. Nur Aufbau und Animation (THREE),
// die Regeln stehen in unfall.js, die Verdrahtung in unfallStart.js. Läuft nur mit window.MOTORRAD === true; keine v34-Datei wird geändert.
//
//   stationenBauen(strecke, szene)   Werkstatt (Halle der Autorennen-Werkstatt, world/garage.js) + Krankenstation im selben Stil (grün/weiß, rotes Kreuz),
//                                    dazu je zwei Wegweiser vor der Zufahrt → { gruppe, werkstatt, kranken, stub }.
//                                    stub hat die Schnittstelle der Autorennen-Werkstatt (untergrund/belag/animieren/zerstoeren …), damit main.js die Fläche
//                                    als Asphalt fährt und die Halle ausblendet; die Heilung selbst macht unfallStart.js (zustand() meldet immer 'aus').
//   helferBauen(art)                 Krankenwagen (Modell aus dem Autorennen) bzw. Abschleppwagen (R.Abschleppwagen._lkwBauen) → { mesh, art, laenge }
//   helferPose(h, strecke, s, q, bl) Pose setzen (s = Bogenlänge der Mitte, q = Querabstand), Blaulicht/Rundumleuchte blinken
//   figurBauen(art)                  kleiner Helfer (Sanitäter / Mechaniker) neben dem Motorrad
//   qualmBauen() / qualmZeigen(q, t, staerke)   zwölf dunkle Rauchwolken in EINEM Mesh am Motor (Zustand unter 75 %, ab < 50 % deutlich stärker)
//   figurAnimieren(fig, t)           Mechaniker schraubt / Sanitäter beugt sich
//   freigeben(obj)                   Geometrien/Materialien aufräumen
// ============================================================
window.Rennspiel = window.Rennspiel || {};

(function () {
  const R = window.Rennspiel;
  R.Moto = R.Moto || {};

  // ---------- Tafeln ----------
  function canvasTafel(zeichne, b, h, dach) {
    if (typeof document === 'undefined') return null;
    const c = document.createElement('canvas');
    c.width = 512; c.height = dach ? 128 : 192;
    const x = c.getContext('2d');
    if (!x) return null;
    zeichne(x, c.width, c.height);
    const tex = new THREE.CanvasTexture(c);
    if (THREE.sRGBEncoding !== undefined && tex.encoding !== undefined) tex.encoding = THREE.sRGBEncoding;
    return tex;
  }
  /** Schraubenschlüssel (gezeichnet, keine Emoji-Schrift nötig). */
  function schluessel(x, cx, cy, groesse, hintergrund) {
    x.save(); x.translate(cx, cy); x.rotate(-0.8); x.fillStyle = '#ffe14a';
    x.fillRect(-8 * groesse, -42 * groesse, 16 * groesse, 84 * groesse); x.beginPath(); x.arc(0, -46 * groesse, 24 * groesse, 0, Math.PI * 2); x.fill();
    x.fillStyle = hintergrund; x.fillRect(-9 * groesse, -76 * groesse, 18 * groesse, 26 * groesse);
    x.beginPath(); x.arc(0, 46 * groesse, 20 * groesse, 0, Math.PI * 2); x.fillStyle = '#ffe14a'; x.fill(); x.restore();
  }
  /** Rotes Kreuz auf weißem Kreis. */
  function kreuz(x, cx, cy, r) {
    x.fillStyle = '#fff'; x.beginPath(); x.arc(cx, cy, r, 0, Math.PI * 2); x.fill();
    x.fillStyle = '#e0342c'; x.fillRect(cx - r * 0.2, cy - r * 0.62, r * 0.4, r * 1.24); x.fillRect(cx - r * 0.62, cy - r * 0.2, r * 1.24, r * 0.4);
  }
  const ART = {
    werkstatt: { farbe: '#1f6fd1', name: 'WERKSTATT', unter: 'Motorrad reparieren', symbol: (x, cx, cy, g, bg) => schluessel(x, cx, cy, g, bg) },
    kranken: { farbe: '#1f9d55', name: 'KRANKENSTATION', unter: 'Fahrer verarzten', symbol: (x, cx, cy, g) => kreuz(x, cx, cy, 50 * g) },
  };
  /** Tafel-Fabrik im Stil der Autorennen-Werkstatt (gleiche Maße und userData wie Werkstatt._tafel). dach = große Hallentafel. */
  function tafelFabrik(art) {
    const K = ART[art];
    return function (dach) {
      const mal = (benutzt) => canvasTafel((x, w, h) => {
        x.fillStyle = K.farbe; x.fillRect(0, 0, w, h);
        x.strokeStyle = '#fff'; x.lineWidth = 8; x.strokeRect(6, 6, w - 12, h - 12);
        K.symbol(x, 70, h / 2, 1, K.farbe);
        x.fillStyle = '#fff'; x.textAlign = 'center'; x.textBaseline = 'middle';
        if (dach) { x.font = 'bold ' + (art === 'kranken' ? 58 : 76) + 'px sans-serif'; x.fillText(K.name, 318, 66, 370); }
        else {
          x.font = 'bold ' + (art === 'kranken' ? 46 : 60) + 'px sans-serif'; x.fillText(K.name, 318, 62, 370);
          x.font = 'bold 34px sans-serif'; x.fillStyle = '#ffe14a'; x.fillText(K.unter, 318, 114, 370);
          x.fillStyle = '#fff'; x.font = 'bold 28px sans-serif'; x.fillText('einfach reinfahren', 318, 156, 370);
        }
      }, 0, 0, dach);
      const frei = mal(false);
      if (!frei) return null;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(dach ? 8 : 2.6, dach ? 2 : 0.975), new THREE.MeshBasicMaterial({ map: frei, side: THREE.DoubleSide }));
      m.name = dach ? 'StationDach' : 'StationSchild';
      if (!dach) { m.userData.texFrei = frei; m.userData.texBenutzt = frei; m.userData.benutzt = false; }
      return m;
    };
  }

  /** Wegweiser an der Strecke: zwei Pfosten + Tafel „WERKSTATT 150 m“, schaut dem Verkehr entgegen (wie das Schild der Werkstatt). */
  function wegweiser(strecke, w, art, abstand, hoehe) {
    const P = w.platz, K = ART[art], g = new THREE.Group();
    const s = P.s - P.laenge / 2 - P.zufahrt - abstand, qE = P.qE !== undefined ? P.qE : P.qA - 0.4;
    const p = w.welt(s, qE + 1.8);
    g.position.set(p.x, strecke.hoeheAn(p.x, p.z), p.z);
    g.rotation.y = Math.atan2(-p.tx, -p.tz);
    const mat = new THREE.MeshLambertMaterial({ color: 0x666b73 });
    const b = 6.4, hh = 2.4;        // groß: von weitem lesbar
    [-b / 2 + 0.2, b / 2 - 0.2].forEach((dx) => { const post = new THREE.Mesh(new THREE.BoxGeometry(0.14, hoehe, 0.14), mat); post.position.set(dx, hoehe / 2, 0); g.add(post); });
    const tex = canvasTafel((x, cw, ch) => {
      x.fillStyle = K.farbe; x.fillRect(0, 0, cw, ch);
      x.strokeStyle = '#fff'; x.lineWidth = 8; x.strokeRect(6, 6, cw - 12, ch - 12);
      K.symbol(x, 70, ch / 2 - 6, 1, K.farbe);
      x.fillStyle = '#fff'; x.textAlign = 'center'; x.textBaseline = 'middle';
      x.font = 'bold ' + (art === 'kranken' ? 50 : 66) + 'px sans-serif'; x.fillText(K.name, 318, 60, 370);
      x.font = 'bold 56px sans-serif'; x.fillStyle = '#ffe14a'; x.fillText(abstand + ' m  ➜', 318, 128, 370);
    }, b, hh, false);
    if (tex) {
      const brett = new THREE.Mesh(new THREE.PlaneGeometry(b, hh), new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide }));
      brett.position.set(0, hoehe + hh / 2 - 0.2, 0.1); g.add(brett);
    }
    return g;
  }

  /** Rotes Kreuz als zwei dünne Quader (kein Licht, keine Textur). groesse = Kantenlänge, dick = Armbreite; Fläche zeigt nach +x (lokal), wird vom Aufrufer gedreht. */
  function kreuzBauen(groesse, dick, rot) {
    const g = new THREE.Group(), mt = new THREE.MeshLambertMaterial({ color: rot === undefined ? 0xe0201a : rot });
    const a = new THREE.Mesh(new THREE.BoxGeometry(0.1, groesse, dick), mt), b = new THREE.Mesh(new THREE.BoxGeometry(0.1, dick, groesse), mt);
    g.add(a); g.add(b);
    return g;
  }
  /** Krankenstation klar erkennbar machen: weiße Wände und Dach, Tore als Glas, große rote Kreuze an der Front (auf den Wandpfeilern) und weiße Kreuz-Tafeln auf dem Dach
   *  neben dem Dachschild „KRANKENSTATION“. Alles Quader: ein paar Draw-Calls, keine Lichter. */
  function krankenFassade(w, gr) {
    const P = w.platz, segs = w._halleSeg || [], halb = w._halleHalb || [2.75, 3.875], hGeb = (R.config.werkstatt && R.config.werkstatt.gebaeudeHoehe) || 4.4;
    const zurStrasse = -P.seite, xFront = zurStrasse * (halb[0] + 0.06);
    gr.traverse((o) => {
      const m = o.material;
      if (!m || !m.color || m.map) return;
      const hex = m.color.getHex();
      if (hex === 0xd8dde4) { m.color.setHex(0xffffff); if (m.emissive) m.emissive.setHex(0x5c5f62); }          // Wände: weiß (leicht selbstleuchtend, damit der Schatten sie nicht grau macht)
      else if (hex === 0xa8382c) m.color.setHex(0xeef2f5);     // Dach: weiß (Kreuze heben sich ab)
      else if (hex === 0x3b414a) m.color.setHex(0x8fd0ee);     // Tor: helles Glas
      else if (hex === 0x59616c) m.color.setHex(0xcfe9f6);
      else if (hex === 0x2f6fd0) m.color.setHex(0xe0342c);     // Band über dem Tor: rot
    });
    for (let k = 0; k < segs.length; k++) {
      const sg = segs[k];
      // Dachtafeln (weiß, mit rotem Kreuz) vorn auf dem Dach: nur auf dem ersten und letzten Segment, damit das Dachschild frei bleibt
      if (k === 0 || k === segs.length - 1) {
        const tafel = new THREE.Group(), grund = new THREE.Mesh(new THREE.BoxGeometry(0.2, 4.6, 4.6), new THREE.MeshLambertMaterial({ color: 0xffffff }));
        tafel.add(grund);
        const kr = kreuzBauen(3.7, 1.15); kr.position.x = 0.14; tafel.add(kr);
        tafel.position.set(xFront, hGeb + 0.35 + 2.3, 0); tafel.name = 'KrankenKreuzDach';
        sg.add(tafel);
        if (zurStrasse < 0) kr.position.x = -0.14;
      }
      // große rote Kreuze an der Front auf dem Wandpfeiler zwischen zwei Toren (am Segmentrand)
      if (k < segs.length - 1) {
        const a = segs[k], b = segs[k + 1];
        const m = new THREE.Group(); m.name = 'KrankenKreuzFront';
        const kr = kreuzBauen(2.9, 0.95); m.add(kr);
        m.position.set((a.position.x + b.position.x) / 2, (a.position.y + b.position.y) / 2 + 2.05, (a.position.z + b.position.z) / 2);
        m.rotation.y = a.rotation.y;
        const dir = new THREE.Vector3(xFront, 0, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), a.rotation.y);
        m.position.add(dir);
        gr.add(m);
      }
    }
  }

  /** Autorennen-Werkstatt bauen, dann Tafeln tauschen / Halle umfärben. */
  function stationBauen(strecke, szene, w, art) {
    w._tafel = tafelFabrik(art);
    const gr = w.bauen();
    if (!gr) return null;
    if (art === 'kranken') krankenFassade(w, gr);
    if (w.platz.raeumen && w.freiraeumen) w.freiraeumen(szene);
    gr.name = art === 'kranken' ? 'Krankenstation' : 'Werkstatt';
    return gr;
  }

  /** Beide Stationen bauen. Rückgabe { gruppe, werkstatt, kranken, stub } oder null (keine zwei Plätze). */
  function stationenBauen(strecke, szene) {
    const U = R.Moto.unfall;
    if (typeof THREE === 'undefined' || !U) return null;
    const b = U.stationenBilden(strecke);
    if (!b || !b.werkstatt || !b.kranken) return null;
    const g = new THREE.Group();
    g.name = 'MotoStationen';
    const gw = stationBauen(strecke, szene, b.werkstatt, 'werkstatt'), gk = stationBauen(strecke, szene, b.kranken, 'kranken');
    if (gw) g.add(gw);
    if (gk) g.add(gk);
    [[b.werkstatt, 'werkstatt'], [b.kranken, 'kranken']].forEach(([w, art]) => {
      g.add(wegweiser(strecke, w, art, 160, 4.2));
      g.add(wegweiser(strecke, w, art, 70, 4.2));
    });
    const teile = [b.werkstatt, b.kranken];
    const stub = {
      vorhanden: true, strecke, teile,
      get platz() { return teile[0].platz; },
      get plaetze() { return teile.map((t) => t.platz); },
      bei() { /* keine Ereignisse: die Pflege macht unfallStart.js */ },
      belag(s, q, x, z) { for (const t of teile) { const r = t.belag(s, q, x, z); if (r !== null) return r; } return null; },
      untergrund(v, n) { for (const t of teile) { const u = t.untergrund(v, n); if (u) return u; } return null; },
      bauen() { return null; },
      freiraeumen() { return 0; },
      schritt() { /* nichts: kein Schaden-System im Motorradmodus */ },
      zustand() { return { status: 'aus', vorhanden: true, heilt: false }; },
      kiSteuerung() { return null; },
      // kameras bewusst NICHT weitergeben: die Halle des Autorennens blendet sich bei naher Kamera aus (sonst „Geisterhaus“); im Motorradmodus bleiben beide Gebäude immer deckend
      animieren(t, fahrzeuge) { teile.forEach((x) => x.animieren(t, fahrzeuge, null)); },
      zerstoeren() {
        teile.forEach((x) => x.zerstoeren());
        g.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) { if (o.material.map) o.material.map.dispose(); o.material.dispose(); } });
        if (g.parent) g.parent.remove(g);
      },
    };
    return { gruppe: g, werkstatt: b.werkstatt, kranken: b.kranken, stub };
  }

  // ---------- Helfer-Fahrzeuge ----------
  /** art 'krankenwagen' | 'abschlepp'. Rückgabe { mesh, art, laenge, blink } – mesh hat den Ursprung am Boden, Front bei −z (wie die Autos). */
  function helferBauen(art) {
    if (typeof THREE === 'undefined') return null;
    if (art === 'abschlepp') {
      const A = R.Abschleppwagen;
      if (!A || !A.prototype._lkwBauen) return null;
      const m = A.prototype._lkwBauen.call({});
      m.visible = true;
      return { mesh: m, art, laenge: 8.2, blink: 0 };
    }
    const kat = (R.carCatalog || []).find((a) => a.id === 'krankenwagen');
    if (!kat || !R.carBuilder) return null;
    const m = R.carBuilder.bauen(kat);
    m.visible = true;
    return { mesh: m, art, laenge: 4.9, blink: 0 };
  }
  /** Pose + Blinken. s = Bogenlänge der Fahrzeugmitte, q = Querabstand von der Strecken-Mitte (m), zeit = Spielzeit. */
  function helferPose(h, strecke, s, q, zeit) {
    if (!h || !h.mesh) return;
    const U = R.Moto.unfall, p = U.fahrPose(strecke, s, q);
    h.mesh.position.set(p.x, p.y, p.z);
    h.mesh.rotation.y = p.heading;
    const phase = Math.floor(zeit * 4) % 2;
    if (phase !== h.blink) {
      h.blink = phase;
      if (h.art === 'abschlepp') {
        const u = h.mesh.userData || {};
        if (u.blink && u.blink2) { u.blink.color.setHex(phase ? 0xffa21a : 0x5a3200); u.blink2.color.setHex(phase ? 0x5a3200 : 0xffa21a); }
      } else if (R.carBuilder && R.carBuilder.setzeBlaulicht) R.carBuilder.setzeBlaulicht(h.mesh, phase ? 1 : 2);
    }
  }

  /** Kleiner Helfer, Low-Poly, ohne eigenes Licht: Sanitäter (weiß, rote Hose/Mütze, rotes Kreuz auf dem Rücken, Verbandskoffer) bzw. Mechaniker (orange Overall, gelber Helm,
   *  Schraubenschlüssel). Körper, Beine, Arme, Kopf, Kopfbedeckung, Werkzeug: 9 Meshes. Front bei −z. userData.arm = [links, rechts] zum Winken/Schrauben. */
  function figurBauen(art) {
    const g = new THREE.Group(), mat = (c) => new THREE.MeshLambertMaterial({ color: c });
    const mech = art === 'mechaniker', rock = mech ? 0xf08a00 : 0xfafaf6, hose = mech ? 0x2c3e66 : 0xd33a32, haut = 0xf2c9a0;
    const add = (geo, c, x, y, z, nm) => { const m = new THREE.Mesh(geo, mat(c)); m.position.set(x, y, z); if (nm) m.name = nm; g.add(m); return m; };
    add(new THREE.BoxGeometry(0.58, 0.82, 0.34), rock, 0, 1.18, 0, 'koerper');
    add(new THREE.BoxGeometry(0.22, 0.78, 0.26), hose, -0.15, 0.39, 0, 'bein');
    add(new THREE.BoxGeometry(0.22, 0.78, 0.26), hose, 0.15, 0.39, 0, 'bein2');
    const armL = add(new THREE.BoxGeometry(0.17, 0.66, 0.17), rock, -0.4, 1.2, -0.02, 'armL'), armR = add(new THREE.BoxGeometry(0.17, 0.66, 0.17), rock, 0.4, 1.2, -0.02, 'armR');
    add(new THREE.SphereGeometry(0.21, 9, 7), haut, 0, 1.78, 0, 'kopf');
    add(new THREE.SphereGeometry(0.235, 9, 5, 0, Math.PI * 2, 0, Math.PI / 2), mech ? 0xffd23a : 0xd33a32, 0, 1.83, 0, 'hut');
    if (mech) { const sw = add(new THREE.BoxGeometry(0.07, 0.07, 0.5), 0xcfd3d8, 0.42, 0.9, -0.38, 'werkzeug'); g.userData.werkzeug = sw; }
    else {
      add(new THREE.BoxGeometry(0.3, 0.24, 0.12), 0xe8f0ec, 0.46, 0.7, -0.05, 'koffer');
      add(new THREE.BoxGeometry(0.34, 0.1, 0.02), 0xe0201a, 0.46, 0.7, -0.12, 'kofferKreuz');
      add(new THREE.BoxGeometry(0.34, 0.1, 0.02), 0xe0201a, 0, 1.3, 0.18, 'rueckenKreuzQ');
      add(new THREE.BoxGeometry(0.1, 0.34, 0.02), 0xe0201a, 0, 1.3, 0.18, 'rueckenKreuzL');
    }
    g.userData.art = art; g.userData.arm = [armL, armR];
    return g;
  }
  /** Figur je Bild bewegen: Mechaniker schraubt (Arm nickt), Sanitäter beugt sich (Oberkörper nickt leicht, Arm winkt). t = Zeit in s. */
  function figurAnimieren(fig, t) {
    if (!fig || !fig.userData.arm) return;
    const mech = fig.userData.art === 'mechaniker', a = fig.userData.arm;
    a[1].rotation.x = -0.9 + Math.sin(t * (mech ? 9 : 4)) * (mech ? 0.5 : 0.3);
    a[0].rotation.x = mech ? -0.5 + Math.sin(t * 9 + 1.7) * 0.25 : -0.4;
    fig.position.y = fig.userData.basisY !== undefined ? fig.userData.basisY + Math.abs(Math.sin(t * 5)) * 0.03 : fig.position.y;
  }

  // ---------- Qualm ----------
  // EIN Mesh (1 Draw-Call, egal wie viele Wolken): QUALM_N Oktaeder-Wolken in einer dynamischen Geometrie, Scheitel-Farben (oben heller), eine gemeinsame Deckkraft.
  // Die Wolken blenden über ihre Größe ein und aus (sie schrumpfen am Ende), nicht über die Deckkraft.
  const QUALM_N = 12;
  let qualmBasis = null;
  function qualmBauen() {
    if (typeof THREE === 'undefined') return null;
    if (!qualmBasis) qualmBasis = new THREE.OctahedronGeometry(1, 0).attributes.position.array.slice();       // 8 Flächen, 24 Eckpunkte, nicht indiziert
    const nv = qualmBasis.length / 3, geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(QUALM_N * nv * 3), 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(QUALM_N * nv * 3), 3).setUsage(THREE.DynamicDrawUsage));
    const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.8, depthWrite: false }));
    mesh.frustumCulled = false; mesh.name = 'QualmWolken';
    const g = new THREE.Group(); g.name = 'Qualm'; g.add(mesh); g.userData.mesh = mesh; g.visible = false;
    return g;
  }
  /** staerke 0..1 (0 = aus): wie kaputt das Motorrad ist (ab 75 % sacht, ab < 50 % stark). Position lokal zum Motorrad (Motor etwa mittig, Front bei −z). */
  function qualmZeigen(q, t, staerke) {
    if (!q) return;
    const an = staerke > 0.02;
    q.visible = an;
    if (!an) return;
    const mesh = q.userData.mesh, pos = mesh.geometry.attributes.position, col = mesh.geometry.attributes.color, nv = qualmBasis.length / 3;
    const anzahl = Math.max(4, Math.round(QUALM_N * (0.4 + 0.6 * staerke)));          // mehr Schaden = mehr Wolken (nicht benutzte schrumpfen auf 0)
    const dunkel = 0.24 - 0.22 * Math.min(1, staerke);                                 // Scheitelfarbe (linear, wird heller dargestellt): 0,24 (mittelgrau) … 0,02 (fast schwarz)
    mesh.material.opacity = 0.62 + 0.3 * staerke;
    for (let i = 0; i < QUALM_N; i++) {
      const ph = (t * (0.75 + 0.55 * staerke) + i / QUALM_N + (i % 3) * 0.07) % 1, aktiv = i < anzahl;
      const env = aktiv ? Math.sin(Math.PI * Math.min(1, ph * 1.08)) : 0;
      const sk = (0.2 + ph * (0.45 + 0.55 * staerke)) * env;
      const cx = 0.42 + ph * 0.55 + (((i * 37) % 7) - 3) * 0.04 + Math.sin(t * 2 + i) * 0.06 * ph, cy = 0.75 + ph * (1.3 + 0.7 * staerke), cz = -0.35 + ph * (0.55 + 0.25 * staerke) + (((i * 53) % 5) - 2) * 0.05;   // quillt seitlich am Motor (rechts) heraus: der Fahrer bleibt von hinten sichtbar
      for (let v = 0; v < nv; v++) {
        const o = (i * nv + v) * 3, bx = qualmBasis[v * 3], by = qualmBasis[v * 3 + 1], bz = qualmBasis[v * 3 + 2];
        pos.array[o] = cx + bx * sk; pos.array[o + 1] = cy + by * sk * 0.85; pos.array[o + 2] = cz + bz * sk;
        const gr = Math.max(0.05, dunkel + by * 0.1);                                  // Oberseite etwas heller
        col.array[o] = gr; col.array[o + 1] = gr; col.array[o + 2] = gr * 1.03;
      }
    }
    pos.needsUpdate = true; col.needsUpdate = true;
  }

  function freigeben(obj) {
    if (!obj) return;
    obj.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) { if (o.material.map) o.material.map.dispose(); o.material.dispose(); } });
    if (obj.parent) obj.parent.remove(obj);
  }

  R.Moto.unfallWelt = { stationenBauen, helferBauen, helferPose, figurBauen, figurAnimieren, kreuzBauen, qualmBauen, qualmZeigen, freigeben, wegweiser, tafelFabrik, ART };
})();
