// ============================================================
// Spaß-Paket S2 – Tuning mit Goldstücken (Autorennen UND Motorrad). Reine Logik + Teile-Optik, läuft in Browser UND Server (kein DOM nötig).
//   R.SpassTuning.stufen(fahrer, fahrzeugId)         { motor, reifen, bremsen } je 0..5 (gespeichert je Fahrer und Fahrzeug)
//   R.SpassTuning.preis(stufeJetzt)                  Preis der nächsten Stufe (null = voll); steigend, die erste Stufe nach einem Rennen
//   R.SpassTuning.kaufen(fahrer, id, art)            eine Stufe kaufen (bucht Goldstücke der Garage ab) → { ok, grund, kosten, konto, stufe }
//   R.SpassTuning.rueckgaengig(fahrer, id, art)      letzte Stufe einer Art zurück, Goldstücke zurück → { ok, rueck, konto }
//   R.SpassTuning.zuruecksetzen(fahrer, id)          alles zurück, alle Goldstücke zurück
//   R.SpassTuning.faktoren(stufen)                   { vMax, beschleunigung, grip, bremsen } oder null (alles 0)
//   R.SpassTuning.anwenden(vehicle, stufen)          rechnet die Faktoren EINMAL in vehicle.daten ein (vor der Schaden-Kopie); ohne Stufen: nichts (bitgleich alt)
//   R.SpassTuning.kiStufen(menschen, schwierigkeit)  gleichwertiges Tuning der Computer-Gegner (Mittel der Menschen × Faktor der Schwierigkeit)
//   R.SpassTuning.fuerTeilnehmer(spiel, f, i, istSpieler, opt, namen, auto)   Haken in main.js streckeAufbauen (offline)
//   R.SpassTuning.teileAnbauen(mesh, auto, stufen)   Spoiler / breite Reifen / Auspuff (Motorrad: Goldgabel) ab Stufe 3, ein Mesh je Fahrzeug
//   R.SpassTuning.an() / anSetzen(bool)              Menü-Schalter „Tuning: an/aus“ (Standard an; eigener Speicher)
// Wirkung (klein und fair, config.spass.tuning): Motor je Stufe +1,6 % Tempo UND Beschleunigung (Stufe 5: +8 %), Reifen +1,6 % Grip (+8 %),
// Bremsen bzw. Federung +2 % Bremsverzögerung (+10 %). Die alten Garage-Upgrades (Stufen 0–3) gibt es seit R1 nicht mehr (in Goldstücke erstattet) – Tuning ist der einzige Weg.
// Aus (Schalter, online: Raum erlaubt es nicht) oder alle Stufen 0 → es wird nichts verändert: bitgleich der alte Stand.
// ============================================================
(function () {
  const R = window.Rennspiel;
  if (!R) return;
  R.config = R.config || {};
  R.config.spass = R.config.spass || {};
  if (!R.config.spass.tuning) {
    R.config.spass.tuning = {
      max: 5,
      // Preise der Stufen 1..5 (je Art): nach einem Rennen (≈ 15–30 Goldstücke) ist die erste Stufe da, voll getunt = 3 × 250
      preise: [10, 25, 45, 70, 100],
      // Wirkung je Stufe (Faktor − 1)
      jeStufe: { vMax: 0.016, beschleunigung: 0.016, grip: 0.016, bremsen: 0.02 },
      // Computer-Gegner: Anteil des Menschen-Tunings je Schwierigkeit (Mittel über die Menschen, gerundet)
      kiAnteil: { leicht: 0.4, mittel: 0.6, schwer: 0.8, profi: 1, meister: 1, legende: 1, unschlagbar: 1 },
      teileAb: 3,                       // Teile am Fahrzeug sichtbar ab dieser Stufe
      standardAn: true,
    };
  }
  const C = () => R.config.spass.tuning;
  const ARTEN = ['motor', 'reifen', 'bremsen'];
  const ganz = (n, lo, hi, d) => (Number.isFinite(n) ? Math.max(lo, Math.min(hi, Math.floor(n))) : d);

  // ---------- Speicher ----------
  let _ram = {}, _ramAn = null;
  const speicher = () => { try { return (typeof window !== 'undefined' && window.localStorage) || null; } catch (e) { return null; } };
  const schluessel = () => ((R.config.garage && R.config.garage.speicherSchluessel) || 'rennspiel.garage.v1') + '.tuning';
  function laden() {
    const s = speicher();
    let o = null;
    if (s) { try { o = JSON.parse(s.getItem(schluessel()) || 'null'); } catch (e) { o = null; } } else o = JSON.parse(JSON.stringify(_ram));
    return o && typeof o === 'object' && !Array.isArray(o) ? o : {};
  }
  function speichern(o) {
    _ram = JSON.parse(JSON.stringify(o));
    const s = speicher();
    if (s) { try { s.setItem(schluessel(), JSON.stringify(o)); } catch (e) { /* egal */ } }
  }
  const leer = () => ({ motor: 0, reifen: 0, bremsen: 0 });
  function eintrag(o, name, id) {
    const f = o[name] && typeof o[name] === 'object' ? o[name] : (o[name] = {});
    const a = f[id] && typeof f[id] === 'object' ? f[id] : (f[id] = {});
    ARTEN.forEach((k) => { a[k] = ganz(a[k], 0, C().max, 0); });
    return a;
  }
  const stufen = (name, id) => { if (!name || !id) return leer(); const o = laden(); return JSON.parse(JSON.stringify(eintrag(o, name, id))); };
  const summe = (s) => (s ? ARTEN.reduce((n, k) => n + (s[k] || 0), 0) : 0);

  // ---------- Preise, Kaufen, Rückgabe ----------
  const preis = (stufeJetzt) => { const p = C().preise; return stufeJetzt >= 0 && stufeJetzt < p.length && stufeJetzt < C().max ? p[stufeJetzt] : null; };
  /** Goldstücke, die in den Stufen 1..n einer Art stecken. */
  const investiert = (n) => C().preise.slice(0, Math.max(0, n)).reduce((s, p) => s + p, 0);

  function kaufen(name, id, art) {
    if (!ARTEN.includes(art) || !name || !id) return { ok: false, grund: 'art', kosten: 0, konto: R.Garage ? R.Garage.konto(name) : 0 };
    const o = laden(), a = eintrag(o, name, id), p = preis(a[art]), konto = R.Garage ? R.Garage.konto(name) : 0;
    if (p === null) return { ok: false, grund: 'max', kosten: 0, konto, stufe: a[art] };
    if (!R.Garage) return { ok: false, grund: 'geld', kosten: p, konto: 0, stufe: a[art] };
    const b = R.Garage.abbuchen(name, p);
    if (!b.ok) return { ok: false, grund: 'geld', kosten: p, konto: b.konto, stufe: a[art] };
    a[art] += 1; speichern(o);
    return { ok: true, kosten: p, konto: b.konto, stufe: a[art], gesamt: summe(a), voll: ARTEN.every((k) => a[k] >= C().max) };
  }
  function rueckgaengig(name, id, art) {
    if (!ARTEN.includes(art) || !name || !id) return { ok: false, rueck: 0, konto: R.Garage ? R.Garage.konto(name) : 0 };
    const o = laden(), a = eintrag(o, name, id);
    if (a[art] <= 0) return { ok: false, grund: 'leer', rueck: 0, konto: R.Garage ? R.Garage.konto(name) : 0 };
    const rueck = C().preise[a[art] - 1];
    a[art] -= 1; speichern(o);
    return { ok: true, rueck, konto: R.Garage ? R.Garage.gutschreiben(name, rueck) : 0, stufe: a[art] };
  }
  function zuruecksetzen(name, id) {
    if (!name || !id) return { ok: false, rueck: 0, konto: 0 };
    const o = laden(), a = eintrag(o, name, id);
    const rueck = ARTEN.reduce((s, k) => s + investiert(a[k]), 0);
    if (!rueck) return { ok: false, grund: 'leer', rueck: 0, konto: R.Garage ? R.Garage.konto(name) : 0 };
    ARTEN.forEach((k) => { a[k] = 0; }); speichern(o);
    return { ok: true, rueck, konto: R.Garage ? R.Garage.gutschreiben(name, rueck) : 0 };
  }

  // ---------- Wirkung ----------
  /** Faktoren aus den Stufen (null = nichts zu tun). Ganzzahl-Stufen × feste Werte → Server und Browser rechnen gleich. */
  function faktoren(s) {
    if (!s || summe(s) <= 0) return null;
    const j = C().jeStufe, m = ganz(s.motor, 0, C().max, 0), r = ganz(s.reifen, 0, C().max, 0), b = ganz(s.bremsen, 0, C().max, 0);
    return { vMax: 1 + j.vMax * m, beschleunigung: 1 + j.beschleunigung * m, grip: 1 + j.grip * r, bremsen: 1 + j.bremsen * b };
  }
  /** Tuning in die Fahrwerte des Fahrzeugs einrechnen (einmal, direkt nach dem Anlegen, vor der Schaden-Kopie datenBasis). */
  function anwenden(vehicle, s) {
    const f = faktoren(s);
    if (!f || !vehicle || !vehicle.daten || vehicle.tuning) return false;
    const d = vehicle.daten;
    if (f.vMax !== 1) d.vMax *= f.vMax;
    if (f.beschleunigung !== 1) d.beschleunigung *= f.beschleunigung;
    if (f.grip !== 1) d.grip *= f.grip;
    if (f.bremsen !== 1) d.bremsen *= f.bremsen;
    vehicle.tuning = { motor: s.motor | 0, reifen: s.reifen | 0, bremsen: s.bremsen | 0 };
    return true;
  }
  /** Gleichwertiges Tuning für Computer-Gegner: Mittel der Menschen je Art × Anteil der Schwierigkeit, gerundet. Keine Menschen-Stufen → null. */
  function kiStufen(menschen, schwierigkeit) {
    const l = (menschen || []).filter((s) => s && summe(s) > 0);
    if (!l.length) return null;
    const anteil = (C().kiAnteil || {})[schwierigkeit];
    const a = anteil === undefined ? 0.6 : anteil, erg = leer();
    ARTEN.forEach((k) => { erg[k] = ganz(Math.round((menschen.reduce((s, x) => s + ((x && x[k]) || 0), 0) / menschen.length) * a), 0, C().max, 0); });
    return summe(erg) > 0 ? erg : null;
  }

  /** Stufen aus einer Nachricht (Liste [motor, reifen, bremsen] oder Objekt), jede Stufe auf ganze Zahlen 0..max geklemmt; ungültig → null. */
  function saeubern(roh) {
    if (!roh || typeof roh !== 'object') return null;
    const l = Array.isArray(roh) ? roh : ARTEN.map((k) => roh[k]);
    const erg = {};
    ARTEN.forEach((k, i) => { erg[k] = ganz(+l[i], 0, C().max, 0); });
    return erg;
  }
  const alsListe = (s) => (s ? ARTEN.map((k) => s[k] | 0) : null);

  // ---------- Schalter ----------
  const schalterKey = () => schluessel() + '.schalter';
  function an() {
    const s = speicher();
    if (s) { try { const v = s.getItem(schalterKey()); if (v === 'aus') return false; if (v === 'an') return true; } catch (e) { /* egal */ } }
    else if (_ramAn !== null) return _ramAn;
    return C().standardAn !== false;
  }
  function anSetzen(v) {
    _ramAn = !!v;
    const s = speicher();
    if (s) { try { s.setItem(schalterKey(), v ? 'an' : 'aus'); } catch (e) { /* egal */ } }
  }

  // ---------- Haken im Rennstart (offline, main.js streckeAufbauen) ----------
  function fuerTeilnehmer(spiel, f, i, istSpieler, opt, namen, auto) {
    try {
      if (!f || !f.vehicle || opt.tuning === false || !an()) return;
      let plan = opt._tuningPlan;
      if (!plan) {
        const menschen = [];
        for (let k = 0; k < (opt.spieler || 0); k++) menschen.push(stufen(namen[k], (opt.autoIds && opt.autoIds[k]) || null));
        plan = opt._tuningPlan = { menschen, ki: kiStufen(menschen, opt.schwierigkeit || (R.config && R.config.schwierigkeitStandard)) };
      }
      const s = istSpieler ? stufen(namen[i], auto && auto.id) : plan.ki;
      if (!s || !anwenden(f.vehicle, s)) return;
      f.tuning = s;
      if (f.mesh && typeof THREE !== 'undefined') teileAnbauen(f.mesh, auto, s);
    } catch (e) { if (typeof console !== 'undefined') console.error('Spaß (Tuning):', e); }
  }

  // ---------- Optik: Tuning-Teile (ein Mesh je Fahrzeug, Vertex-Farben) ----------
  const FARBE = { chrom: 0xc9ced6, dunkel: 0x16181d, gold: 0xffc21a, rot: 0xe0262b, flamme: 0xff8a1a };
  let _mat = null;
  function material() { return _mat || (_mat = new THREE.MeshLambertMaterial({ vertexColors: true })); }
  /** Kleine Bausteine (Box/Zylinder) zu EINER Geometrie zusammenfügen. teile: [{ geo, m: Matrix4, farbe }] */
  function verschmelzen(teile) {
    let n = 0;
    const gs = teile.map((t) => { const g = t.geo.index ? t.geo.toNonIndexed() : t.geo; n += g.attributes.position.count; return g; });
    const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), col = new Float32Array(n * 3), c = new THREE.Color(), nm = new THREE.Matrix3(), v = new THREE.Vector3();
    let o = 0;
    gs.forEach((g, k) => {
      const t = teile[k]; c.set(t.farbe); nm.getNormalMatrix(t.m);
      const p = g.attributes.position, q = g.attributes.normal;
      for (let j = 0; j < p.count; j++) {
        v.fromBufferAttribute(p, j).applyMatrix4(t.m); pos[o * 3] = v.x; pos[o * 3 + 1] = v.y; pos[o * 3 + 2] = v.z;
        v.fromBufferAttribute(q, j).applyMatrix3(nm).normalize(); nor[o * 3] = v.x; nor[o * 3 + 1] = v.y; nor[o * 3 + 2] = v.z;
        col[o * 3] = c.r; col[o * 3 + 1] = c.g; col[o * 3 + 2] = c.b; o++;
      }
      if (g !== t.geo) g.dispose();
      t.geo.dispose();
    });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    return geo;
  }
  const mat4 = (x, y, z, rx, ry, rz) => { const m = new THREE.Matrix4(); m.makeRotationFromEuler(new THREE.Euler(rx || 0, ry || 0, rz || 0)); m.setPosition(x, y, z); return m; };
  const kasten = (b, h, t, m, farbe) => ({ geo: new THREE.BoxGeometry(b, h, t), m, farbe });
  const rohr = (r, l, m, farbe) => ({ geo: new THREE.CylinderGeometry(r, r, l, 10), m, farbe });
  /** Farbiger Ring (Torus, Achse = x) – als Felgenring auf der Außenseite breiter Reifen (S3: schwarz auf schwarz war kaum zu sehen). */
  const ring = (r, dicke, m, farbe) => { const g = new THREE.TorusGeometry(r, dicke, 6, 28); g.rotateY(Math.PI / 2); return { geo: g, m, farbe }; };
  const reifenFarbe = (st) => (st >= C().max ? FARBE.gold : 0xff7a1a);   // leuchtendes Orange, Stufe 5 Gold
  const sichtbar = (s) => ({ motor: s.motor >= C().teileAb, reifen: s.reifen >= C().teileAb, bremsen: s.bremsen >= C().teileAb });

  /**
   * S3: Heck-Anker für den Spoiler aus der echten Karosserie: höchste Fläche im Streifen z0 ± 0,12 m (Kofferraumdeckel bei Limousine/Coupé,
   * Heckklappen-Kante bei Kombi/Van/Kleinwagen, Motorhaube bei Fließheck) und halbe Breite dort. inv = Matrix Welt → Fahrzeug.
   */
  function heckProfil(mesh, inv, z0) {
    let y = -Infinity, x = 0;
    const v = new THREE.Vector3(), mm = new THREE.Matrix4();
    mesh.traverse((o) => {
      if (!o.isMesh || o.name === 'schatten' || o.name === 'tuningTeile' || !o.geometry || !o.geometry.attributes.position) return;
      mm.multiplyMatrices(inv, o.matrixWorld);
      const p = o.geometry.attributes.position;
      for (let i = 0; i < p.count; i++) {
        v.fromBufferAttribute(p, i).applyMatrix4(mm);
        if (v.z < z0 - 0.12 || v.z > z0 + 0.12 || v.y < 0.55) continue;
        if (v.y > y) y = v.y;
        if (Math.abs(v.x) > x) x = Math.abs(v.x);
      }
    });
    return Number.isFinite(y) ? { y, halb: x } : null;
  }

  /**
   * Teile an die Fahrzeug-Gruppe hängen (Name „tuningTeile“, vorher vorhandene werden ersetzt). Rückgabe: das Mesh oder null (nichts sichtbar).
   * Maße aus dem Rohbau (Box3 ohne Schatten-Blob, Radgruppen aus userData.raeder); Motorrad (userData.moto): Auspuff, breiter Hinterreifen, Goldgabel.
   */
  function teileAnbauen(mesh, auto, s) {
    if (!mesh || typeof THREE === 'undefined' || !s) return null;
    const alt = mesh.getObjectByName('tuningTeile');
    if (alt) { mesh.remove(alt); if (alt.geometry) alt.geometry.dispose(); }
    const sb = sichtbar(s);
    if (!sb.motor && !sb.reifen && !sb.bremsen) return null;
    mesh.updateMatrixWorld(true);
    // Maße im Fahrzeug-Raum (Ursprung = Bodenmitte, Front −z): Box der Karosserie ohne Schatten und ohne frühere Teile
    const box = new THREE.Box3(), tmp = new THREE.Box3(), inv = new THREE.Matrix4().copy(mesh.matrixWorld).invert();
    mesh.traverse((o) => {
      if (!o.isMesh || o.name === 'schatten' || o.name === 'tuningTeile' || !o.geometry) return;
      if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
      tmp.copy(o.geometry.boundingBox).applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld)); box.union(tmp);
    });
    if (box.isEmpty()) return null;
    const moto = !!(mesh.userData && mesh.userData.moto), gold = (st) => (st >= C().max ? FARBE.gold : FARBE.chrom);
    const teile = [], zMin = box.min.z, zMax = box.max.z, xMin = box.min.x, xMax = box.max.x, yMax = box.max.y;
    const breite = xMax - xMin, tiefe = zMax - zMin;
    const raeder = (mesh.userData && mesh.userData.raeder) || [];
    const radInfo = (g) => { const b = new THREE.Box3().setFromObject(g); const c = b.getCenter(new THREE.Vector3()); mesh.worldToLocal(c); return { x: c.x, y: c.y, z: c.z, r: Math.max(0.15, (b.max.y - b.min.y) / 2), br: b.max.x - b.min.x }; };
    if (moto) {
      const hint = raeder[0] ? radInfo(raeder[0]) : { x: 0, y: 0.35, z: zMax - 0.5, r: 0.35, br: 0.15 };
      const vorn = raeder[1] ? radInfo(raeder[1]) : { x: 0, y: 0.35, z: zMin + 0.5, r: 0.35, br: 0.15 };
      if (sb.motor) {   // Auspuff rechts, chrom (Stufe 5 gold), mit Flammenspitze
        teile.push(rohr(0.055, 0.8, mat4(0.2, hint.y + 0.02, hint.z - 0.12, Math.PI / 2, 0, 0), gold(s.motor)));
        teile.push(rohr(0.075, 0.12, mat4(0.2, hint.y + 0.02, hint.z + 0.3, Math.PI / 2, 0, 0), s.motor >= C().max ? FARBE.flamme : FARBE.dunkel));
      }
      if (sb.reifen) {  // breiter Hinterreifen: dicke dunkle Walze seitlich auf dem Reifen + farbige Ringe auf beiden Seiten
        const lb = Math.max(0.1, hint.br * 0.55);
        teile.push(rohr(hint.r * 0.98, lb, mat4(hint.x, hint.y, hint.z, 0, 0, Math.PI / 2), FARBE.dunkel));
        [-1, 1].forEach((sg) => {
          teile.push(ring(hint.r * 0.80, 0.022, mat4(hint.x + sg * (lb / 2 + 0.004), hint.y, hint.z), reifenFarbe(s.reifen)));
          teile.push(ring(hint.r * 0.93, 0.012, mat4(hint.x + sg * (lb / 2 + 0.004), hint.y, hint.z), FARBE.chrom));
        });
      }
      if (sb.bremsen) { // Goldgabel: zwei Standrohre am Vorderrad
        [-1, 1].forEach((sg) => teile.push(rohr(0.03, 0.5, mat4(vorn.x + sg * 0.08, vorn.y + 0.28, vorn.z - 0.08, -0.32, 0, 0), s.bremsen >= C().max ? FARBE.gold : 0xd9a600)));
      }
    } else {
      if (sb.motor) {   // zwei Endrohre hinten
        [-1, 1].forEach((sg) => {
          teile.push(rohr(0.06, 0.34, mat4(sg * breite * 0.26, 0.27, zMax + 0.06, Math.PI / 2, 0, 0), gold(s.motor)));
          teile.push(rohr(0.036, 0.36, mat4(sg * breite * 0.26, 0.27, zMax + 0.07, Math.PI / 2, 0, 0), FARBE.dunkel));
        });
      }
      if (sb.reifen) {  // breitere Reifen: dunkle Walze neben jedem Rad (außen) + farbiger Felgenring auf der Außenseite (rot, Stufe 5 gold)
        raeder.forEach((g) => {
          const r = radInfo(g); if (!(r.r < 1.2)) return;
          const aussen = r.x >= 0 ? 1 : -1, xa = r.x + aussen * (r.br / 2 + 0.07);
          teile.push(rohr(r.r * 0.97, 0.12, mat4(r.x + aussen * (r.br / 2 + 0.01), r.y, r.z, 0, 0, Math.PI / 2), FARBE.dunkel));
          teile.push(ring(r.r * 0.80, 0.03, mat4(xa + aussen * 0.004, r.y, r.z), reifenFarbe(s.reifen)));
          teile.push(ring(r.r * 0.93, 0.014, mat4(xa + aussen * 0.004, r.y, r.z), FARBE.chrom));
        });
      }
      if (sb.bremsen) { // Heckspoiler: sitzt auf der Karosserie am Heck (Lage je Modell aus dem Heckprofil), Flügel auf zwei Stützen, rot (Stufe 5: gold)
        const fl = s.bremsen >= C().max ? FARBE.gold : FARBE.rot, z0 = zMax - 0.17, hp = heckProfil(mesh, inv, z0) || { y: yMax * 0.72, halb: breite * 0.4 };
        const yf = hp.y, breiteF = Math.max(0.7, Math.min(hp.halb * 2 * 0.92, breite * 0.8)), yw = yf + 0.10;
        teile.push(kasten(breiteF, 0.045, 0.30, mat4(0, yw, z0 + 0.01, -0.12), fl));                        // Flügel (hinten leicht hoch)
        [-1, 1].forEach((sg) => teile.push(kasten(0.05, 0.14, 0.08, mat4(sg * breiteF * 0.34, yf + 0.04, z0 - 0.03), fl)));
        if (s.bremsen >= 4) [-1, 1].forEach((sg) => teile.push(kasten(0.03, 0.12, 0.32, mat4(sg * (breiteF / 2 + 0.01), yw + 0.03, z0 + 0.01), fl)));
      }
    }
    if (!teile.length) return null;
    const m = new THREE.Mesh(verschmelzen(teile), material());
    m.name = 'tuningTeile'; m.frustumCulled = false;
    mesh.add(m);
    return m;
  }

  R.SpassTuning = { ARTEN, laden, speichern, stufen, summe, preis, investiert, kaufen, rueckgaengig, zuruecksetzen, faktoren, anwenden, kiStufen, saeubern, alsListe, an, anSetzen, fuerTeilnehmer, teileAnbauen, sichtbar,
    _ramLeeren() { _ram = {}; _ramAn = null; } };
})();
