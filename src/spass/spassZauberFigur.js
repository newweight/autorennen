// ============================================================
// Spaß-Paket S6 – Haustier und Kostüm (nur Browser, nur Optik; alles in der Garage wählbar, je Fahrer gespeichert)
//   🐶 Haustier   Hund, Katze, Hase, Papagei, Dino-Baby. Motorrad: sitzt im Beiwagen (Option „Beiwagen“, sonst auf dem Heck);
//                 Auto: sitzt im Dachkorb. Hüpft fröhlich bei jedem Sprung (+ kleiner Ton), Ohren/Schwanz wippen.
//   🎭 Kostüm     Ritter, Astronaut, Pirat, Superheld (Cape, keine fremde Marke), Dino. Motorrad: Helm/Oberkörper/Ärmel/Handschuhe des Fahrers;
//                 Auto: Fahrer-Büste am Fenster + Ärmel/Hände im Cockpit (nur in der Cockpit-Ansicht). Freischalten: Sticker oder Goldstücke.
//   Garage        zwei Zeilen (+ Beiwagen-Schalter) im Werkstatt-Bildschirm; die 3D-Vorschau zeigt Tier und Kostüm sofort.
// Ohne Wahl: kein Objekt, keine Kosten (alles per R.SpassZauberFigur.an() abschaltbar = wie vorher). Geometrien/Materialien werden geteilt (Cache).
// Speicher: localStorage 'rennspiel.spass.zauber.figur' { fahrer: { pet, kost, beiwagen, gekauft[] } }.
// ============================================================
(function () {
  const R = window.Rennspiel;
  if (!R || !R.Spiel || !R.themes || !R.themes.hilfe || typeof THREE === 'undefined') return;
  if (R.SpassZauberFigur) return;
  const H = R.themes.hilfe;
  const moto = () => window.MOTORRAD === true;
  const spielName = () => (moto() ? 'motorrad' : 'auto');
  const SCHL = 'rennspiel.spass.zauber.figur';
  const jetzt = () => performance.now() / 1000;

  const HAUSTIERE = [
    { id: 'hund', emoji: '🐶', name: 'Hund' }, { id: 'katze', emoji: '🐱', name: 'Katze' }, { id: 'hase', emoji: '🐰', name: 'Hase' },
    { id: 'papagei', emoji: '🦜', name: 'Papagei' }, { id: 'dino', emoji: '🦖', name: 'Dino-Baby' },
  ];
  // sticker: schaltet das Kostüm frei, sobald der Sticker da ist; preis: sonst für Goldstücke kaufen (0 = gratis)
  const KOSTUEME = [
    { id: 'ritter', emoji: '🛡️', name: 'Ritter', preis: 0 },
    { id: 'astronaut', emoji: '🧑‍🚀', name: 'Astronaut', preis: 30, sticker: 'magnet' },
    { id: 'pirat', emoji: '🏴‍☠️', name: 'Pirat', preis: 30, sticker: 'gleiter' },
    { id: 'superheld', emoji: '🦸', name: 'Superheld', preis: 40, sticker: 'halfpipe' },
    { id: 'dino', emoji: '🦕', name: 'Dino-Kostüm', preis: 40, sticker: 'riese' },
  ];

  // ------------------------------------------------------------------ Speicher
  const ram = { an: true, fahrer: {} };
  function laden() {
    let o = null;
    try { o = JSON.parse(localStorage.getItem(SCHL) || 'null'); } catch (e) { o = null; }
    if (!o || typeof o !== 'object') o = JSON.parse(JSON.stringify(ram));
    if (!o.fahrer || typeof o.fahrer !== 'object') o.fahrer = {};
    return o;
  }
  function sichern(o) {
    ram.fahrer = JSON.parse(JSON.stringify(o.fahrer)); ram.an = o.an !== false;
    try { localStorage.setItem(SCHL, JSON.stringify(o)); } catch (e) { /* egal */ }
  }
  function eintrag(o, name) {
    const e = o.fahrer[name] || (o.fahrer[name] = {});
    if (!HAUSTIERE.some((x) => x.id === e.pet)) e.pet = null;
    if (!KOSTUEME.some((x) => x.id === e.kost)) e.kost = null;
    e.beiwagen = e.beiwagen !== false;
    e.gekauft = Array.isArray(e.gekauft) ? e.gekauft.filter((g) => KOSTUEME.some((x) => x.id === g)) : [];
    return e;
  }
  const wahl = (name) => { const e = eintrag(laden(), name || ''); return { pet: e.pet, kost: e.kost, beiwagen: e.beiwagen, gekauft: e.gekauft.slice() }; };
  function setzen(name, feld, wert) {
    const o = laden(), e = eintrag(o, name); e[feld] = wert; sichern(o); return wahl(name);
  }
  const an = () => laden().an !== false;
  function anSetzen(b) { const o = laden(); o.an = !!b; sichern(o); }
  function stickerHat(id) { try { return !!(R.SpassSticker && R.SpassSticker.hat(spielName(), id)); } catch (e) { return false; } }
  /** → { frei, grund: 'gratis'|'sticker'|'gekauft'|'preis', preis } */
  function kostuemStatus(name, id) {
    const k = KOSTUEME.find((x) => x.id === id); if (!k) return { frei: false, grund: 'unbekannt', preis: 0 };
    if (!k.preis) return { frei: true, grund: 'gratis', preis: 0 };
    if (k.sticker && stickerHat(k.sticker)) return { frei: true, grund: 'sticker', preis: 0 };
    if (eintrag(laden(), name).gekauft.includes(id)) return { frei: true, grund: 'gekauft', preis: 0 };
    return { frei: false, grund: 'preis', preis: k.preis };
  }
  /** Kostüm anziehen: nur wenn frei (oder gekauft). → { ok, grund? } */
  function kostuemWaehlen(name, id) {
    if (id === null) { setzen(name, 'kost', null); return { ok: true }; }
    const s = kostuemStatus(name, id);
    if (!s.frei) {
      if (!R.Garage || !R.Garage.abbuchen) return { ok: false, grund: 'geld' };
      const r = R.Garage.abbuchen(name, s.preis);
      if (!r.ok) return { ok: false, grund: 'geld', preis: s.preis };
      const o = laden(), e = eintrag(o, name); e.gekauft.push(id); sichern(o);
    }
    setzen(name, 'kost', id);
    return { ok: true };
  }

  // ------------------------------------------------------------------ Geometrie-Hilfen (Cache)
  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _e = new THREE.Euler(), _p = new THREE.Vector3();
  function bx(t, cx, cy, cz, sx, sy, sz, farbe, rx, ry, rz) {
    const g = new THREE.BoxGeometry(sx, sy, sz); _q.setFromEuler(_e.set(rx || 0, ry || 0, rz || 0)); _m.compose(_p.set(cx, cy, cz), _q, _s.set(1, 1, 1)); g.applyMatrix4(_m); t.push({ geo: g, farbe });
  }
  function el(t, cx, cy, cz, rx, ry, rz, farbe, rotX, rotY, rotZ) {
    const g = new THREE.SphereGeometry(1, 9, 7); _q.setFromEuler(_e.set(rotX || 0, rotY || 0, rotZ || 0)); _m.compose(_p.set(cx, cy, cz), _q, _s.set(rx, ry, rz)); g.applyMatrix4(_m); t.push({ geo: g, farbe });
  }
  function kegel(t, cx, cy, cz, r, h, farbe, rotX, rotY, rotZ, seg) {
    const g = new THREE.ConeGeometry(r, h, seg || 5); _q.setFromEuler(_e.set(rotX || 0, rotY || 0, rotZ || 0)); _m.compose(_p.set(cx, cy, cz), _q, _s.set(1, 1, 1)); g.applyMatrix4(_m); t.push({ geo: g, farbe });
  }
  function zyl(t, cx, cy, cz, r0, r1, h, farbe, rotX, rotY, rotZ, seg) {
    const g = new THREE.CylinderGeometry(r0, r1, h, seg || 8); _q.setFromEuler(_e.set(rotX || 0, rotY || 0, rotZ || 0)); _m.compose(_p.set(cx, cy, cz), _q, _s.set(1, 1, 1)); g.applyMatrix4(_m); t.push({ geo: g, farbe });
  }
  const matCache = {}, geoCache = {};
  const lambertVC = () => matCache.vc || (matCache.vc = new THREE.MeshLambertMaterial({ vertexColors: true }));
  const lambertVCzwei = () => matCache.vc2 || (matCache.vc2 = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }));
  function geo(key, bau) { return geoCache[key] || (geoCache[key] = H.vereinen(bau())); }
  function meshAus(key, bau, zweiseitig) { const m = new THREE.Mesh(geo(key, bau), zweiseitig ? lambertVCzwei() : lambertVC()); m.frustumCulled = false; m.name = 'z_' + key; return m; }

  // ------------------------------------------------------------------ Haustiere (Ursprung = Sitzfläche Mitte, vorn = −z, Höhe ≈ 0,55)
  function tierTeile(art) {
    const t = [], aug = 0x16171b;
    if (art === 'hund') {
      const fell = 0xb9773a, hell = 0xe9cfa3, dunkel = 0x6e4320;
      bx(t, 0, 0.2, 0.04, 0.28, 0.24, 0.40, fell); bx(t, 0, 0.14, -0.2, 0.2, 0.2, 0.08, hell);
      bx(t, 0, 0.5, -0.2, 0.24, 0.22, 0.24, fell); bx(t, 0, 0.45, -0.37, 0.12, 0.1, 0.12, hell); bx(t, 0, 0.5, -0.43, 0.05, 0.04, 0.03, aug);
      bx(t, -0.14, 0.46, -0.16, 0.06, 0.2, 0.1, dunkel, 0, 0, 0.2); bx(t, 0.14, 0.46, -0.16, 0.06, 0.2, 0.1, dunkel, 0, 0, -0.2);
      bx(t, -0.06, 0.55, -0.31, 0.04, 0.04, 0.02, aug); bx(t, 0.06, 0.55, -0.31, 0.04, 0.04, 0.02, aug);
      bx(t, 0, 0.3, 0.26, 0.06, 0.06, 0.26, fell, -0.9, 0, 0);
      bx(t, -0.08, 0.04, -0.14, 0.08, 0.1, 0.1, hell); bx(t, 0.08, 0.04, -0.14, 0.08, 0.1, 0.1, hell);
    } else if (art === 'katze') {
      const fell = 0x8d96a3, hell = 0xf1f1ee, streif = 0x5d6672;
      bx(t, 0, 0.2, 0.04, 0.24, 0.24, 0.38, fell); bx(t, 0, 0.19, -0.18, 0.14, 0.2, 0.06, hell);
      bx(t, 0, 0.47, -0.17, 0.24, 0.2, 0.22, fell); bx(t, 0, 0.42, -0.29, 0.07, 0.05, 0.05, 0xf08a96);
      kegel(t, -0.09, 0.64, -0.17, 0.06, 0.14, fell, 0, 0, 0.15, 4); kegel(t, 0.09, 0.64, -0.17, 0.06, 0.14, fell, 0, 0, -0.15, 4);
      bx(t, -0.06, 0.5, -0.285, 0.04, 0.05, 0.02, 0x3fb54a); bx(t, 0.06, 0.5, -0.285, 0.04, 0.05, 0.02, 0x3fb54a);
      bx(t, 0, 0.4, 0.26, 0.05, 0.05, 0.3, fell, -0.5, 0, 0); bx(t, 0, 0.58, 0.4, 0.05, 0.05, 0.26, streif, -1.6, 0, 0);
      bx(t, -0.1, 0.16, 0.05, 0.02, 0.2, 0.3, streif); bx(t, 0.1, 0.16, 0.05, 0.02, 0.2, 0.3, streif);
    } else if (art === 'hase') {
      const fell = 0xf4f1ec, rosa = 0xf2a6b4;
      el(t, 0, 0.2, 0.05, 0.17, 0.18, 0.22, fell); el(t, 0, 0.42, -0.14, 0.14, 0.13, 0.14, fell);
      bx(t, -0.06, 0.72, -0.12, 0.06, 0.34, 0.03, fell, 0, 0, 0.1); bx(t, 0.06, 0.72, -0.12, 0.06, 0.34, 0.03, fell, 0, 0, -0.1);
      bx(t, -0.06, 0.72, -0.105, 0.03, 0.26, 0.02, rosa, 0, 0, 0.1); bx(t, 0.06, 0.72, -0.105, 0.03, 0.26, 0.02, rosa, 0, 0, -0.1);
      bx(t, -0.05, 0.45, -0.26, 0.035, 0.04, 0.02, aug); bx(t, 0.05, 0.45, -0.26, 0.035, 0.04, 0.02, aug); bx(t, 0, 0.4, -0.27, 0.04, 0.03, 0.02, rosa);
      el(t, 0, 0.2, 0.3, 0.07, 0.07, 0.07, fell);
      bx(t, -0.07, 0.04, -0.14, 0.06, 0.06, 0.16, fell); bx(t, 0.07, 0.04, -0.14, 0.06, 0.06, 0.16, fell);
    } else if (art === 'papagei') {
      const gruen = 0x38b24a, rot = 0xe0262b, gelb = 0xffc21a, blau = 0x2a6bd1;
      bx(t, 0, 0.04, 0, 0.5, 0.05, 0.1, 0x8a5a2b);                                                    // Stange
      el(t, 0, 0.28, 0, 0.13, 0.24, 0.12, gruen); el(t, 0, 0.55, -0.04, 0.11, 0.11, 0.11, rot);
      bx(t, 0, 0.52, -0.16, 0.05, 0.07, 0.08, gelb, 0.5, 0, 0); bx(t, -0.06, 0.58, -0.13, 0.035, 0.035, 0.02, 0xffffff); bx(t, 0.06, 0.58, -0.13, 0.035, 0.035, 0.02, 0xffffff);
      bx(t, -0.06, 0.58, -0.14, 0.02, 0.02, 0.02, aug); bx(t, 0.06, 0.58, -0.14, 0.02, 0.02, 0.02, aug);
      bx(t, 0, 0.1, 0.2, 0.07, 0.04, 0.4, blau, -0.6, 0, 0); bx(t, 0, 0.12, 0.22, 0.04, 0.03, 0.34, rot, -0.5, 0, 0);
      bx(t, -0.13, 0.3, 0.02, 0.04, 0.22, 0.14, 0x2e9a40); bx(t, 0.13, 0.3, 0.02, 0.04, 0.22, 0.14, 0x2e9a40);
    } else {                                                                                            // dino
      const gruen = 0x58c26a, hell = 0xcdeeb0, stachel = 0xf2994a;
      bx(t, 0, 0.2, 0.05, 0.3, 0.28, 0.42, gruen); bx(t, 0, 0.16, -0.16, 0.2, 0.2, 0.08, hell);
      bx(t, 0, 0.5, -0.2, 0.3, 0.26, 0.3, gruen); bx(t, 0, 0.42, -0.4, 0.2, 0.14, 0.14, gruen);
      bx(t, -0.1, 0.6, -0.3, 0.07, 0.07, 0.03, 0xffffff); bx(t, 0.1, 0.6, -0.3, 0.07, 0.07, 0.03, 0xffffff); bx(t, -0.1, 0.6, -0.32, 0.035, 0.04, 0.02, aug); bx(t, 0.1, 0.6, -0.32, 0.035, 0.04, 0.02, aug);
      bx(t, -0.05, 0.44, -0.48, 0.03, 0.03, 0.02, aug); bx(t, 0.05, 0.44, -0.48, 0.03, 0.03, 0.02, aug);
      for (let i = 0; i < 4; i++) kegel(t, 0, 0.4 + i * 0.0 + (i === 0 ? 0.28 : 0.2 - i * 0.02), 0.16 - i * 0.17 + 0.3 * (i === 0 ? 0 : 0), 0.055, 0.14, stachel, 0, 0, 0, 4);
      bx(t, 0, 0.14, 0.4, 0.14, 0.14, 0.3, gruen, -0.4, 0, 0); bx(t, 0, 0.1, 0.62, 0.08, 0.08, 0.2, gruen, -0.5, 0, 0);
      bx(t, -0.17, 0.26, -0.1, 0.06, 0.06, 0.16, gruen, 0.5, 0, 0); bx(t, 0.17, 0.26, -0.1, 0.06, 0.06, 0.16, gruen, 0.5, 0, 0);
    }
    return t;
  }
  const tierMesh = (art) => meshAus('tier_' + art, () => tierTeile(art));

  // ------------------------------------------------------------------ Beiwagen / Dachkorb
  function beiwagenGruppe(lack) {
    const g = new THREE.Group(); g.name = 'zBeiwagen';
    const teile = [], farbe = lack === undefined ? 0xd9541e : lack;
    bx(teile, 0.95, 0.42, 0.28, 0.62, 0.1, 1.2, farbe);                                                   // Boden
    bx(teile, 0.95 + 0.3, 0.6, 0.28, 0.06, 0.34, 1.12, farbe); bx(teile, 0.95 - 0.3, 0.6, 0.28, 0.06, 0.34, 1.12, farbe);
    bx(teile, 0.95, 0.6, 0.86, 0.62, 0.34, 0.06, farbe); bx(teile, 0.95, 0.5, -0.1, 0.5, 0.12, 0.5, farbe, 0.25, 0, 0);
    kegel(teile, 0.95, 0.5, -0.56, 0.3, 0.5, farbe, -Math.PI / 2, 0, 0, 6);                              // Spitze
    bx(teile, 0.95, 0.58, 0.28, 0.46, 0.04, 0.8, 0x2b2d33);                                                // Polster
    bx(teile, 0.5, 0.5, 0.0, 0.9, 0.04, 0.04, 0x55585f, 0, 0, 0.1); bx(teile, 0.5, 0.45, 0.6, 0.9, 0.04, 0.04, 0x55585f, 0, 0, 0.1);   // Streben
    const kor = new THREE.Mesh(H.vereinen(teile), lambertVC()); kor.frustumCulled = false; g.add(kor);
    const rad = new THREE.Group(); rad.position.set(1.4, 0.28, 0.45); g.add(rad);
    const rg = geo('beiwagenrad', () => { const t = []; zyl(t, 0, 0, 0, 0.28, 0.28, 0.12, 0x111214, 0, 0, Math.PI / 2, 12); zyl(t, 0, 0, 0, 0.16, 0.16, 0.14, 0xc5cad1, 0, 0, Math.PI / 2, 10); return t; });
    const rm = new THREE.Mesh(rg, lambertVC()); rm.frustumCulled = false; rad.add(rm);
    g.userData.rad = rad; g.userData.sitz = new THREE.Vector3(0.95, 0.6, 0.3);
    return g;
  }
  function korbGruppe(box) {
    const g = new THREE.Group(); g.name = 'zKorb';
    const t = [], b = 0xc88a42, w = 0.34;
    bx(t, 0, 0.04, 0, w * 2, 0.04, w * 1.6, b);
    [-1, 1].forEach((s) => { bx(t, s * w, 0.14, 0, 0.04, 0.2, w * 1.6, b); bx(t, 0, 0.14, s * w * 0.8, w * 2, 0.2, 0.04, b); });
    [-1, 1].forEach((s) => [-1, 1].forEach((u) => bx(t, s * w, 0.1, u * w * 0.8, 0.05, 0.28, 0.05, 0x8a5a2b)));
    [-1, 1].forEach((s) => bx(t, s * w * 0.6, -0.04, 0, 0.05, 0.05, w * 1.8, 0x55585f));            // Halter
    const m = new THREE.Mesh(H.vereinen(t), lambertVC()); m.frustumCulled = false; g.add(m);
    g.userData.sitz = new THREE.Vector3(0, 0.06, 0);
    if (box) g.position.set(0, box.max.y + 0.02, box.min.z + (box.max.z - box.min.z) * 0.52);
    return g;
  }

  // ------------------------------------------------------------------ Kostüme
  const FARBE = {
    ritter: { rumpf: 0x9aa3ad, arm: 0x9aa3ad, hand: 0x6b727a }, astronaut: { rumpf: 0xf2f2f2, arm: 0xf2f2f2, hand: 0x2a6bd1 }, pirat: { rumpf: 0x8c2323, arm: 0x8c2323, hand: 0x222222 },
    superheld: { rumpf: 0x1d4ed8, arm: 0x1d4ed8, hand: 0xe0262b }, dino: { rumpf: 0x4caf50, arm: 0x4caf50, hand: 0x2e7d32 },
  };
  /** Kopfschmuck um den Kopfmittelpunkt (0,0,0), vorn = −z, Kopfradius ≈ 0,15. */
  function kopfTeile(id) {
    const t = [];
    if (id === 'ritter') {
      el(t, 0, 0.01, 0.0, 0.19, 0.2, 0.2, 0xb8bfc9); bx(t, 0, 0.0, -0.17, 0.26, 0.07, 0.06, 0x2b2d33); bx(t, 0, -0.1, -0.15, 0.22, 0.08, 0.1, 0xb8bfc9);
      bx(t, 0, 0.26, 0.0, 0.04, 0.12, 0.3, 0xe0262b); kegel(t, 0, 0.3, 0.0, 0.05, 0.1, 0xe0262b, 0, 0, 0, 4);
    } else if (id === 'astronaut') {
      el(t, 0, 0.0, 0.0, 0.23, 0.23, 0.23, 0xf2f2f2); el(t, 0, 0.0, -0.08, 0.17, 0.15, 0.16, 0xe8b02a); bx(t, 0, -0.2, 0.0, 0.3, 0.07, 0.3, 0xdadada);
      zyl(t, 0.18, 0.1, 0.0, 0.015, 0.015, 0.14, 0xdadada); el(t, 0.18, 0.18, 0.0, 0.025, 0.025, 0.025, 0xe0262b);
    } else if (id === 'pirat') {
      bx(t, 0, 0.14, 0.0, 0.42, 0.06, 0.3, 0x16171b, 0, 0, 0); bx(t, 0, 0.2, 0.0, 0.3, 0.1, 0.24, 0x16171b); bx(t, 0, 0.27, -0.02, 0.18, 0.06, 0.2, 0x16171b);
      bx(t, 0, 0.18, -0.13, 0.06, 0.06, 0.02, 0xf4f1ec); bx(t, 0, 0.1, -0.15, 0.3, 0.05, 0.05, 0xe0262b);
      bx(t, 0.06, 0.02, -0.15, 0.07, 0.07, 0.02, 0x16171b); bx(t, 0, 0.05, -0.15, 0.2, 0.012, 0.012, 0x16171b, 0, 0, 0.3);
      bx(t, 0.0, 0.0, 0.14, 0.3, 0.12, 0.04, 0xe0262b);
    } else if (id === 'superheld') {
      bx(t, 0, 0.02, -0.14, 0.3, 0.08, 0.04, 0xe0262b); bx(t, -0.09, 0.0, -0.155, 0.07, 0.04, 0.02, 0xffffff); bx(t, 0.09, 0.0, -0.155, 0.07, 0.04, 0.02, 0xffffff);
      el(t, 0, 0.04, 0.02, 0.17, 0.17, 0.17, 0xe0262b, 0, 0, 0);
      bx(t, 0, 0.18, 0.0, 0.05, 0.08, 0.2, 0xffc21a);
    } else {                                                                                            // dino
      el(t, 0, 0.03, 0.02, 0.19, 0.19, 0.2, 0x4caf50); bx(t, 0, -0.02, -0.17, 0.2, 0.1, 0.12, 0x4caf50);
      bx(t, -0.1, 0.17, -0.1, 0.07, 0.07, 0.02, 0xffffff); bx(t, 0.1, 0.17, -0.1, 0.07, 0.07, 0.02, 0xffffff); bx(t, -0.1, 0.17, -0.115, 0.035, 0.04, 0.02, 0x16171b); bx(t, 0.1, 0.17, -0.115, 0.035, 0.04, 0.02, 0x16171b);
      for (let i = 0; i < 4; i++) kegel(t, 0, 0.2 - i * 0.03, 0.08 + i * 0.07, 0.05, 0.12, 0xf2994a, 0, 0, 0, 4);
      bx(t, 0, -0.06, -0.24, 0.16, 0.03, 0.03, 0xffffff);
    }
    return t;
  }
  /** Umhang des Superhelden (Dreiecks-Streifen), hängt am Nacken, wippt mit dem Tempo. */
  function capeMesh() {
    const m = new THREE.Mesh(geo('cape', () => { const t = []; const g = new THREE.PlaneGeometry(0.46, 0.7, 1, 3); g.translate(0, -0.35, 0); t.push({ geo: g, farbe: 0xe0262b }); return t; }), lambertVCzwei());
    m.frustumCulled = false; m.name = 'z_cape'; return m;
  }
  const kopfMesh = (id) => meshAus('kopf_' + id, () => kopfTeile(id));
  /** Auto-Fahrer-Büste (Kopf ist separat): Rumpf als Quader + Schultern. Ursprung = Kopfmitte. */
  const bustMesh = (id) => meshAus('bust_' + id, () => { const t = [], c = FARBE[id].rumpf; bx(t, 0, -0.34, 0.03, 0.42, 0.42, 0.24, c); el(t, 0, -0.14, 0.03, 0.26, 0.07, 0.14, c); bx(t, 0, -0.1, 0.03, 0.09, 0.07, 0.09, 0xd9a07a); el(t, 0, 0.0, 0.0, 0.12, 0.13, 0.12, 0xe4b08a); bx(t, -0.045, 0.01, -0.115, 0.03, 0.035, 0.02, 0x16171b); bx(t, 0.045, 0.01, -0.115, 0.03, 0.035, 0.02, 0x16171b); return t; });
  /** Cockpit-Ärmel (Auto): zwei Arme vom unteren Bildrand zum Lenkrad, Ursprung = Kamera. */
  const aermelMesh = (id) => meshAus('aermel_' + id, () => {
    const t = [], F = FARBE[id];
    [-1, 1].forEach((s) => {
      const a = new THREE.Vector3(s * 0.34, -0.55, 0.28), b = new THREE.Vector3(s * 0.2, -0.38, -0.5), d = b.clone().sub(a), l = d.length();
      const g = new THREE.CylinderGeometry(0.06, 0.05, l, 6); g.translate(0, l / 2, 0); g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().normalize())); g.translate(a.x, a.y, a.z); t.push({ geo: g, farbe: F.arm });
      el(t, b.x, b.y, b.z, 0.07, 0.06, 0.07, F.hand);
    });
    return t;
  });
  // Moto-Oberkörper (Überzug auf dem Fahrer-Trikot)
  const motoRumpf = (id) => meshAus('motorumpf_' + id, () => {
    const t = [], c = FARBE[id].rumpf, A = new THREE.Vector3(0, 1.07, 0.19), B = new THREE.Vector3(0, 1.46, -0.05), d = B.clone().sub(A), l = d.length();
    const g = new THREE.CylinderGeometry(0.137, 0.115, 1, 8); g.translate(0, 0.5, 0); _q.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().normalize()); _m.compose(A, _q, _s.set(1.3, l, 0.9)); g.applyMatrix4(_m); t.push({ geo: g, farbe: c });
    el(t, 0, 1.45, -0.04, 0.23, 0.08, 0.12, c);
    if (id === 'superheld') bx(t, 0, 1.3, -0.13, 0.16, 0.14, 0.02, 0xffc21a, -0.4, 0, 0);
    if (id === 'astronaut') bx(t, 0, 1.3, 0.14, 0.26, 0.3, 0.12, 0xdadada, -0.35, 0, 0);
    if (id === 'ritter') bx(t, 0, 1.22, -0.1, 0.2, 0.2, 0.03, 0xc9a43a, -0.45, 0, 0);
    if (id === 'pirat') { bx(t, 0, 1.32, -0.12, 0.26, 0.05, 0.02, 0xc9a43a, -0.45, 0, 0); }
    return t;
  });
  const matMoto = {};
  function motoFarbMat(c) { return matMoto[c] || (matMoto[c] = new THREE.MeshLambertMaterial({ color: c })); }

  // ------------------------------------------------------------------ Anbau am Fahrzeug
  function ausruesten(mesh, w, opt) {
    // opt: { lack }; w = { pet, kost, beiwagen }
    const u = mesh.userData, sig = [w.pet || '-', w.kost || '-', w.beiwagen ? 'b' : 'n'].join('|');
    if (u.zFig && u.zFig.sig === sig) return u.zFig;
    abbauen(mesh);
    if (!w.pet && !w.kost) { u.zFig = { sig, teile: [] }; return u.zFig; }
    const F = { sig, teile: [], pet: null, petBasis: 0, cape: null, wagenrad: null, bust: null, aermel: null, hop: 0, hopT: 1, fall: 0 };
    const eltern = u.moto && u.inhalt ? u.inhalt : mesh;
    const add = (o) => { eltern.add(o); F.teile.push(o); return o; };
    if (u.moto) {
      if (w.pet) {
        if (w.beiwagen) {
          const bw = add(beiwagenGruppe(opt && opt.lack)); F.wagenrad = bw.userData.rad;
          const tm = add(tierMesh(w.pet).clone()); tm.position.copy(bw.userData.sitz); tm.scale.setScalar(0.85); F.pet = tm; F.petBasis = tm.position.y;
        } else {
          const tm = add(tierMesh(w.pet).clone()); tm.position.set(0, 1.18, 0.78); tm.scale.setScalar(0.55); F.pet = tm; F.petBasis = tm.position.y;
        }
      }
      if (w.kost) {
        const k = w.kost, c = FARBE[k];
        const kopf = add(kopfMesh(k).clone()); kopf.position.set(0, 1.64, -0.13);
        add(motoRumpf(k).clone());
        if (k === 'superheld') { const cp = add(capeMesh()); cp.position.set(0, 1.5, 0.08); cp.rotation.x = 0.35; F.cape = cp; }
        // Ärmel und Handschuhe: eigene Materialien (die Trikot-Materialien werden geteilt – nie verändern)
        eltern.children.forEach((ch) => {
          if (ch.name === 'oberarm' || ch.name === 'unterarm') { (F.alt = F.alt || []).push([ch, ch.material]); ch.material = motoFarbMat(c.arm); }
          else if (ch.name === 'handschuh') { (F.alt = F.alt || []).push([ch, ch.material]); ch.material = motoFarbMat(c.hand); }
        });
      }
    } else {
      const box = u.zBox || new THREE.Box3(new THREE.Vector3(-0.9, 0, -2.2), new THREE.Vector3(0.9, 1.4, 2.2));
      if (w.pet) {
        const kb = add(korbGruppe(box)); kb.scale.setScalar(1.4); const tm = new THREE.Group(); const tmesh = tierMesh(w.pet).clone(); tm.add(tmesh); tm.scale.setScalar(1.25); tm.position.copy(kb.position).add(kb.userData.sitz.clone().multiplyScalar(1.4)); add(tm);   // S8: Tier und Korb größer (vorher 0,8 / 1,0)
        F.pet = tm; F.petBasis = tm.position.y;
      }
      if (w.kost) {
        const k = w.kost, hoehe = box.max.y, breit = box.max.x - box.min.x, z0 = box.min.z + (box.max.z - box.min.z) * 0.5;
        const bust = new THREE.Group(); bust.position.set(-breit * 0.19, hoehe * 0.8, z0 - 0.15); bust.scale.setScalar(0.95);
        bust.add(bustMesh(k).clone()); const kopf = kopfMesh(k).clone(); bust.add(kopf);
        if (k === 'superheld') { const cp = capeMesh(); cp.position.set(0, -0.12, 0.12); cp.rotation.x = 0.2; bust.add(cp); F.cape = cp; }
        add(bust); F.bust = bust;
        const ae = aermelMesh(k).clone(); ae.position.set(0, hoehe * 0.96, z0 + 0.0); ae.visible = false; add(ae); F.aermel = ae;
        ae.position.set(0, 1.15, -0.4);   // Kamera-Ursprung (config.kamera.cockpit.hoehe/vor)
      }
    }
    u.zFig = F;
    return F;
  }
  function abbauen(mesh) {
    const F = mesh.userData.zFig;
    if (!F) return;
    (F.teile || []).forEach((o) => { if (o.parent) o.parent.remove(o); });
    (F.alt || []).forEach(([m, mat]) => { m.material = mat; });
    mesh.userData.zFig = null;
  }

  // ------------------------------------------------------------------ Töne
  const Ton = R.Audio && Object.getPrototypeOf(R.Audio);
  if (Ton && !Ton.zTier) {
    Ton.zTier = function (art) {
      if (!this._bereit()) return;
      if (art === 'hund') { this._ton(420, 260, 0.1, 'sawtooth', 0.06, 0); this._ton(430, 250, 0.1, 'sawtooth', 0.05, 0.14); }
      else if (art === 'katze') { this._ton(620, 880, 0.14, 'sine', 0.07, 0); this._ton(880, 520, 0.28, 'sine', 0.06, 0.12); }
      else if (art === 'hase') { this._ton(900, 1300, 0.05, 'triangle', 0.05, 0); this._ton(1000, 1400, 0.05, 'triangle', 0.04, 0.08); }
      else if (art === 'papagei') { this._ton(1700, 2500, 0.1, 'triangle', 0.06, 0); this._ton(2400, 1800, 0.12, 'triangle', 0.05, 0.1); this._ton(1800, 2600, 0.08, 'triangle', 0.04, 0.24); }
      else { this._ton(220, 130, 0.22, 'sawtooth', 0.08, 0); this._ton(440, 300, 0.12, 'triangle', 0.04, 0.05); }
    };
  }

  // ------------------------------------------------------------------ je Bild
  let _letzterTon = -9;
  function hopp(F) { if (F) { F.hopT = 0; } }
  function bild(spiel, dt) {
    if (!an() || !spiel.fahrzeuge || spiel.zustand === 'menue' || !spiel.rennen) return;
    const dtt = Math.min(dt || 0.016, 0.05), T = spiel.rennen.teilnehmer || [];
    for (let i = 0; i < spiel.fahrzeuge.length; i++) {
      const f = spiel.fahrzeuge[i];
      if (!f || !f.mesh || !f.istSpieler) continue;
      const name = T[i] && T[i].name; if (!name) continue;
      const w = wahl(name);
      const F = ausruesten(f.mesh, w, { lack: f.mesh.userData.lackFarbe });
      if (!F.teile.length) continue;
      if (!f._zFigSticker) {
        f._zFigSticker = true;
        try { if (w.pet && R.SpassZauberUI) R.SpassZauberUI.sticker('haustier'); if (w.kost && R.SpassZauberUI) R.SpassZauberUI.sticker('kostuem'); } catch (e) { /* egal */ }
      }
      // Sprung: Flug beginnt → Tier hüpft
      const flug = !!(f.flug && f.flug.aktiv) || !!(f.vehicle && f.vehicle.imFlug);
      if (flug && !f._zFlugWar) { hopp(F); if (w.pet && spiel.rennen && !spiel.pausiert && R.Audio && R.Audio.zTier && jetzt() - _letzterTon > 0.8) { _letzterTon = jetzt(); try { R.Audio.zTier(w.pet); } catch (e) { /* Ton egal */ } } }
      f._zFlugWar = flug;
      if (F.pet) {
        F.hopT = Math.min(1, F.hopT + dtt / 0.7);
        const h = F.hopT < 1 ? Math.sin(Math.PI * F.hopT) * 0.32 : 0, wippen = Math.sin(jetzt() * 6 + i) * 0.015;
        F.pet.position.y = F.petBasis + h + wippen + (flug ? 0.05 : 0);
        F.pet.rotation.x = F.hopT < 1 ? -Math.sin(Math.PI * F.hopT) * 0.25 : 0;
        F.pet.rotation.z = Math.sin(jetzt() * 3 + i) * 0.04;
      }
      if (F.wagenrad) F.wagenrad.rotation.x = f.radwinkel || 0;
      if (F.cape && f.vehicle) F.cape.rotation.x = 0.25 + Math.min(1, Math.abs(f.vehicle.vLaengs || 0) / 40) * 0.55 + Math.sin(jetzt() * 14) * 0.05 * Math.min(1, Math.abs(f.vehicle.vLaengs || 0) / 30);
      if (F.aermel) {
        const k = spiel.kameras && spiel.kameras.find((c) => c.ziel === f.vehicle), cp = !!(k && k.modus === 'cockpit');
        F.aermel.visible = cp; if (F.bust) F.bust.visible = !cp;
      }
    }
  }
  if (R.dach && typeof R.dach.frame === 'function' && !R.dach._figur6) {
    R.dach._figur6 = true;
    const frame = R.dach.frame;
    R.dach.frame = function (spiel, dt) {
      const r = frame.apply(this, arguments);
      try { bild(spiel, dt); } catch (e) { if (!R._figurFehler) { R._figurFehler = 1; console.error('Zauber Figur (Bild):', e); } }
      return r;
    };
  }

  // ------------------------------------------------------------------ Garage: Vorschau-Hook + Zeilen
  let _vorschauFahrer = null;
  if (R.carBuilder && R.carBuilder.bauen && !R.carBuilder._zFigur) {
    R.carBuilder._zFigur = true;
    const bauen = R.carBuilder.bauen;
    R.carBuilder.bauen = function () {
      const g = bauen.apply(this, arguments);
      try { if (_vorschauFahrer && an() && g && g.userData) ausruesten(g, wahl(_vorschauFahrer), { lack: g.userData.lackFarbe }); } catch (e) { console.error('Zauber Figur (Vorschau):', e); }
      return g;
    };
  }
  function stilEinfuegen() {
    if (typeof document === 'undefined' || document.getElementById('spass-figur-stil')) return;
    const s = document.createElement('style'); s.id = 'spass-figur-stil';
    s.textContent = '.garage .z-fig{margin-top:.35em;padding:.3em .5em;border-radius:.6em;background:rgba(255,255,255,.07)}.garage .z-fig .g-zeile{margin:.15em 0}' +
      '.garage .z-chips{display:flex;flex-wrap:wrap;gap:.25em}.garage .z-chips .pille{font-size:.78em;padding:.15em .5em;cursor:pointer;white-space:nowrap}' +
      '.garage .z-chips .pille.zu{opacity:.6}.garage .z-chips small{opacity:.85;margin-left:.2em}';
    document.head.appendChild(s);
  }
  if (R.Garage && R.Garage.Bildschirm) {
    const B = R.Garage.Bildschirm.prototype;
    const htmlWerkstatt = B.htmlWerkstatt;
    B.htmlWerkstatt = function () {
      let h = htmlWerkstatt.apply(this, arguments);
      if (!an() || !R.SpassZauber || !R.SpassZauber.an()) return h;
      try {
        stilEinfuegen();
        const w = wahl(this.fahrer), konto = R.Garage.konto(this.fahrer);
        const pets = `<span class="pille${!w.pet ? ' aktiv' : ''}" data-g="zpet:aus">Keins</span>` + HAUSTIERE.map((p) => `<span class="pille${w.pet === p.id ? ' aktiv' : ''}" data-g="zpet:${p.id}" title="${p.name}">${p.emoji} ${p.name}</span>`).join('');
        const kost = `<span class="pille${!w.kost ? ' aktiv' : ''}" data-g="zkost:aus">Keins</span>` + KOSTUEME.map((k) => {
          const s = kostuemStatus(this.fahrer, k.id), a = w.kost === k.id;
          const unter = s.frei ? '' : `<small>🪙 ${k.preis}${konto < k.preis ? ' (zu wenig)' : ''}</small>`;
          const tit = s.frei ? k.name : `${k.name}: ${k.preis} Goldstücke – oder den Sticker „${(R.SpassSticker && R.SpassSticker.katalog(spielName()).find((x) => x.id === k.sticker) || {}).name || ''}“ holen`;
          return `<span class="pille${a ? ' aktiv' : ''}${s.frei ? '' : ' zu'}" data-g="zkost:${k.id}" title="${tit}">${s.frei ? '' : '🔒 '}${k.emoji} ${k.name}${unter}</span>`;
        }).join('');
        const bw = moto() ? `<div class="g-zeile"><div class="g-label">🛺 Beiwagen</div><div class="g-wert z-chips"><span class="pille${w.beiwagen ? ' aktiv' : ''}" data-g="zbeiwagen:an">An</span><span class="pille${!w.beiwagen ? ' aktiv' : ''}" data-g="zbeiwagen:aus">Aus</span><span class="g-text klein">Aus = Tier sitzt hinten</span></div></div>` : '';
        const block = `<div class="z-fig"><div class="g-zeile"><div class="g-label">🐶 Haustier</div><div class="g-wert z-chips">${pets}</div></div>${bw}` +
          `<div class="g-zeile"><div class="g-label">🎭 Kostüm</div><div class="g-wert z-chips">${kost}</div></div></div>`;
        const l = h.indexOf('🎨 Lack'), i = l >= 0 ? h.indexOf('<div class="g-zeile', l + 8) : -1;     // direkt unter dem Lack, damit es im kleinen Fenster sichtbar bleibt
        const j = i >= 0 ? i : h.lastIndexOf('<div class="g-nachricht');
        h = j >= 0 ? h.slice(0, j) + block + h.slice(j) : h + block;
      } catch (e) { console.error('Zauber Figur (Garage):', e); }
      return h;
    };
    const aktion = B.aktion;
    B.aktion = function (a) {
      const [art, p1] = a.split(':');
      if (art === 'zpet' || art === 'zkost' || art === 'zbeiwagen') {
        this.nachricht = ''; this.nachrichtArt = '';
        let neuerSticker = null;
        if (art === 'zpet') { setzen(this.fahrer, 'pet', p1 === 'aus' ? null : p1); }
        else if (art === 'zbeiwagen') setzen(this.fahrer, 'beiwagen', p1 === 'an');
        else {
          const r = kostuemWaehlen(this.fahrer, p1 === 'aus' ? null : p1);
          if (!r.ok) { this.nachricht = `Zu wenig Goldstücke – du brauchst 🪙 ${r.preis}. Fahr ein Rennen und sammle!`; this.nachrichtArt = 'schlecht'; }
          else if (p1 !== 'aus') { const k = KOSTUEME.find((x) => x.id === p1); this.nachricht = `${k.emoji} ${k.name} an – viel Spaß!`; this.nachrichtArt = 'gut'; }
        }
        void neuerSticker;
        try { this.ton && this.ton('klick'); } catch (e) { /* egal */ }
        this.zeichnen();
        try { _vorschauFahrer = this.fahrer; if (R.AutoVorschau && R.AutoVorschau.neuBauen) R.AutoVorschau.neuBauen(0); } finally { /* Hook bleibt, solange die Garage offen ist */ }
        return;
      }
      return aktion.apply(this, arguments);
    };
    const buehneBinden = B.buehneBinden;
    B.buehneBinden = function () {
      _vorschauFahrer = this.fahrer;
      return buehneBinden.apply(this, arguments);
    };
    const schliessen = B.schliessen;
    if (schliessen) B.schliessen = function () { _vorschauFahrer = null; return schliessen.apply(this, arguments); };
    const zeichnen = B.zeichnen;
    B.zeichnen = function () { if (!this.sichtbar) _vorschauFahrer = null; return zeichnen.apply(this, arguments); };
  }

  /** Von spassZauberUI.js bei Spaß-Ereignissen aufgerufen: Tier hüpft bei Sprüngen. */
  function ereignis(spiel, i, name) {
    if (!['trampolin', 'kanoneBumm', 'gleitStart', 'gleitLand', 'pipeLuft', 'kanoneLand', 'teleport'].includes(name)) return;
    const f = spiel.fahrzeuge[i], F = f && f.mesh && f.mesh.userData.zFig;
    if (F && F.pet) hopp(F);
  }

  R.SpassZauberFigur = { HAUSTIERE, KOSTUEME, an, anSetzen, wahl, setzen, kostuemStatus, kostuemWaehlen, ausruesten, abbauen, ereignis, bild, tierMesh, kopfMesh };
})();
