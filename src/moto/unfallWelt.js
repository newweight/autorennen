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
//   qualmBauen() / qualmZeigen(q, t, staerke)   sechs weiche Rauchkugeln am Motor (Zustand unter 75 %)
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

  /** Autorennen-Werkstatt bauen, dann Tafeln tauschen / Halle umfärben. */
  function stationBauen(strecke, szene, w, art) {
    w._tafel = tafelFabrik(art);
    const gr = w.bauen();
    if (!gr) return null;
    if (art === 'kranken') {
      gr.traverse((o) => {
        const m = o.material;
        if (!m || !m.color || m.map) return;
        const hex = m.color.getHex();
        if (hex === 0xa8382c) m.color.setHex(0x2fa86a);          // Dach: grün
        else if (hex === 0x2f6fd0) m.color.setHex(0xe0342c);     // Band über dem Tor: rot
      });
    }
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
      animieren(t, fahrzeuge, kameras) { teile.forEach((x) => x.animieren(t, fahrzeuge, kameras)); },
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

  /** Kleiner Helfer: Sanitäter (weiß/rot) bzw. Mechaniker (orange) – Körper, Kopf, Mütze/Helm, Koffer. 4 Meshes. */
  function figurBauen(art) {
    const g = new THREE.Group(), mat = (c) => new THREE.MeshLambertMaterial({ color: c });
    const rock = art === 'mechaniker' ? 0xf08a00 : 0xf4f4f0;
    const k = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.85, 0.3), mat(rock)); k.position.y = 0.95; g.add(k);
    const hose = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.55, 0.26), mat(art === 'mechaniker' ? 0x2c3e66 : 0xd33a32)); hose.position.y = 0.3; g.add(hose);
    const kopf = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), mat(0xf2c9a0)); kopf.position.y = 1.58; g.add(kopf);
    const hut = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), mat(art === 'mechaniker' ? 0xffd23a : 0xd33a32)); hut.position.y = 1.62; g.add(hut);
    const koffer = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.26, 0.14), mat(art === 'mechaniker' ? 0x30343a : 0xe8f0ec)); koffer.position.set(0.42, 0.55, 0); g.add(koffer);
    g.userData.art = art;
    return g;
  }

  // ---------- Qualm ----------
  const QUALM_N = 6;
  let qualmGeo = null;
  function qualmBauen() {
    if (typeof THREE === 'undefined') return null;
    if (!qualmGeo) qualmGeo = new THREE.SphereGeometry(0.2, 7, 5);
    const g = new THREE.Group(); g.name = 'Qualm';
    for (let i = 0; i < QUALM_N; i++) {
      const m = new THREE.Mesh(qualmGeo, new THREE.MeshBasicMaterial({ color: 0x777777, transparent: true, opacity: 0, depthWrite: false }));
      m.visible = false; g.add(m);
    }
    return g;
  }
  /** staerke 0..1 (0 = aus): wie kaputt das Motorrad ist. Position lokal zum Motorrad (Motor etwa mittig, Front bei −z). */
  function qualmZeigen(q, t, staerke) {
    if (!q) return;
    const an = staerke > 0.02;
    q.visible = an;
    if (!an) return;
    const grau = Math.round(0x99 - 0x70 * Math.min(1, staerke));          // mehr Schaden = dunklerer Rauch
    for (let i = 0; i < q.children.length; i++) {
      const m = q.children[i], ph = (t * (0.7 + 0.5 * staerke) + i / QUALM_N) % 1;
      m.visible = true;
      m.position.set(((i * 37) % 7 - 3) * 0.02, 0.95 + ph * 1.5, -0.2 + ph * 1.1);
      const sk = 0.6 + ph * (1.2 + staerke);
      m.scale.set(sk, sk, sk);
      m.material.opacity = (0.35 + 0.3 * staerke) * Math.sin(Math.PI * Math.min(1, ph * 1.15));
      m.material.color.setRGB(grau / 255, grau / 255, grau / 255);
    }
  }

  function freigeben(obj) {
    if (!obj) return;
    obj.traverse((o) => { if (o.geometry && o.geometry !== qualmGeo) o.geometry.dispose(); if (o.material) { if (o.material.map) o.material.map.dispose(); o.material.dispose(); } });
    if (obj.parent) obj.parent.remove(obj);
  }

  R.Moto.unfallWelt = { stationenBauen, helferBauen, helferPose, figurBauen, qualmBauen, qualmZeigen, freigeben, wegweiser, tafelFabrik, ART };
})();
