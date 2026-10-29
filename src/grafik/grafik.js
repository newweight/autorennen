// ============================================================
// Grafik G1 – Licht + Material (Autorennen UND Motorrad). Schalter „Grafik: Normal / Schön / Ultra“ im Menü, gespeichert je Spiel
// (localStorage 'rennspiel.grafik.v1' bzw. 'motorrad.grafik.v1'; Standard Normal).
//
//   NORMAL  = heutiger Stand BITGLEICH: dieses Skript ändert dann NICHTS an Renderer, Szene, Materialien, Lichtern (nur der Menü-Knopf kommt dazu).
//   SCHÖN   = glänzender Lack mit Himmels-Spiegelung (MeshStandardMaterial + Umgebungskarte per PMREMGenerator aus einem einfachen Himmelsverlauf),
//             Chrom (Felgen, Auspuff, Rahmen) und Glas (Scheiben, Scheibe am Motorrad) per Vertex-Klasse, weiche Schatten (PCFSoft, nur Fahrzeuge
//             werfen, nur Boden/Straße/Brücke empfangen), ACES-Tone-Mapping, sRGB-Ausgabe.
//   ULTRA   = wie Schön, dazu Klarlack (MeshPhysicalMaterial), größere Schattenkarte, Glühen (additive Sprites) für Scheinwerfer und Feuerring.
//             (UnrealBloomPass geht nicht: three r160 liefert die Beispiel-Dateien nur als ES-Module, vendor/ hat nur three.min.js → eigener Glow.)
//
// Technik: nur Umhüllungen zur Laufzeit (Spiel._vorwaermen, Spiel.zeichnen, Menue.zeichnen). Originale Materialien/Geometrien werden gemerkt und beim
// Zurückschalten auf Normal wiederhergestellt. Fahrzeug-Geometrien tragen Vertex-Farben; die Klasse (Lack/Chrom/Glas/matt) wird aus der exakten
// Vertex-Farbe abgeleitet und als Attribut 'g1Pbr' (Metall, Rauheit) an eine geteilte Kopie der Geometrie gehängt (Puffer bleiben gemeinsam).
// ============================================================
(function () {
  const R = window.Rennspiel;
  if (!R || !R.Spiel || !R.Menue || typeof THREE === 'undefined') return;
  const MOTO = window.MOTORRAD === true;
  const SCHLUESSEL = MOTO ? 'motorrad.grafik.v1' : 'rennspiel.grafik.v1';
  const STUFEN = ['normal', 'schoen', 'ultra'];
  const NAMEN = { normal: 'Normal', schoen: 'Schön', ultra: 'Ultra' };

  function laden() {
    try { const s = window.localStorage.getItem(SCHLUESSEL); if (STUFEN.includes(s)) return s; } catch (e) { /* kein localStorage */ }
    return 'normal';
  }
  function speichern(s) { try { window.localStorage.setItem(SCHLUESSEL, s); } catch (e) { /* egal */ } }

  const G = R.Grafik = { stufe: laden(), STUFEN, NAMEN, schluessel: SCHLUESSEL };

  // ---------- Vertex-Klassen: [Metall, Rauheit] ----------
  const hexRgb = (h) => { const c = new THREE.Color(h); return [c.r, c.g, c.b]; };
  const KLASSEN = [];       // { rgb, m, r }
  const klasse = (hexe, m, r) => hexe.forEach((h) => KLASSEN.push({ rgb: hexRgb(h), m, r }));
  klasse([0xd3d8de, 0xc9ced6, 0xc5cad1, 0xb9bfc8], 0.95, 0.14);                 // Chrom/Alu (Auto-Chrom, Felgen, Motorrad-Rahmen/Auspuff)
  klasse([0x80868d], 0.8, 0.35);                                                // Bremse
  klasse([0xd9a626], 0.9, 0.28);                                                // Gold (Gabel)
  klasse([0x4b5058], 0.7, 0.4);                                                 // Motorblock
  klasse([0x18222c, 0x2c3c4c, 0x3b4d62, 0x2b78e0], 0.5, 0.06);                 // Glas (Scheiben, Verkleidungsscheibe)
  klasse([0x26292e, 0x131518, 0x0d0e10, 0x17181a, 0x1b1b1c, 0x25272b, 0x2c2e33, 0xcdb48a, 0x1e1f23, 0x41454c, 0x15171a,
    0x16171b, 0x111214, 0x23262d, 0x16181c, 0x6a707a], 0.0, 0.88);               // matt: Kunststoff, Reifen, Innenraum, Verdeck, Stiefel …
  const GLEICH = 0.0025;
  // Standardklasse je Mesh-Name, wenn die Farbe keine bekannte ist
  const STANDARD = { rad: [0.92, 0.2], teile: [0.3, 0.55], lenkTeile: [0.3, 0.55], fahrer: [0.0, 0.85] };
  const LACK = { schoen: [0.08, 0.4], ultra: [0.1, 0.32] };

  function geoMitPbr(geo, name, stufe) {
    const cache = geoMitPbr.cache || (geoMitPbr.cache = new WeakMap());
    const schluessel = name + stufe;
    let e = cache.get(geo); if (!e) { e = {}; cache.set(geo, e); }
    if (e[schluessel]) return e[schluessel];
    const col = geo.attributes.color; if (!col) return null;
    const n = col.count, a = new Float32Array(n * 2), neuFarbe = new Float32Array(n * 3), std = STANDARD[name] || LACK[stufe];
    let lack = false, letzte = -1, lm = std[0], lr = std[1];
    for (let i = 0; i < n; i++) {
      const r = col.getX(i), g = col.getY(i), b = col.getZ(i), k = (Math.round(r * 255) << 16) | (Math.round(g * 255) << 8) | Math.round(b * 255);
      if (k !== letzte) {
        letzte = k; lm = std[0]; lr = std[1]; lack = !STANDARD[name];
        for (let j = 0; j < KLASSEN.length; j++) { const c = KLASSEN[j].rgb; if (Math.abs(c[0] - r) < GLEICH && Math.abs(c[1] - g) < GLEICH && Math.abs(c[2] - b) < GLEICH) { lm = KLASSEN[j].m; lr = KLASSEN[j].r; lack = false; break; } }
      }
      a[i * 2] = lm; a[i * 2 + 1] = lr;
      const f = lack ? 0.62 : 1;           // Lack etwas abdunkeln (ACES hellt/sättigt auf), Chrom/Glas/Kunststoff unverändert
      neuFarbe[i * 3] = r * f; neuFarbe[i * 3 + 1] = g * f; neuFarbe[i * 3 + 2] = b * f;
    }
    const g2 = new THREE.BufferGeometry();       // teilt alle Attribut-Puffer mit dem Original (kein Speicher-Mehrverbrauch außer g1Pbr)
    Object.keys(geo.attributes).forEach((k) => g2.setAttribute(k, geo.attributes[k]));
    if (geo.index) g2.setIndex(geo.index);
    g2.groups = geo.groups.map((x) => Object.assign({}, x));
    if (geo.boundingSphere) g2.boundingSphere = geo.boundingSphere.clone();
    if (geo.boundingBox) g2.boundingBox = geo.boundingBox.clone();
    g2.setAttribute('color', new THREE.BufferAttribute(neuFarbe, 3));
    g2.setAttribute('g1Pbr', new THREE.BufferAttribute(a, 2));
    g2.userData.g1Original = geo;
    e[schluessel] = g2;
    return g2;
  }

  function pbrEinhaengen(mat) {
    mat.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec2 g1Pbr;\nvarying vec2 vG1Pbr;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvG1Pbr = g1Pbr;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec2 vG1Pbr;')
        .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = roughness * vG1Pbr.y;')
        .replace('#include <metalnessmap_fragment>', 'float metalnessFactor = metalness * vG1Pbr.x;');
    };
    mat.customProgramCacheKey = () => 'g1pbr';
  }

  // ---------- Umgebungskarte aus einfachem Himmelsverlauf ----------
  function umgebung(sp, sonnenRichtung) {
    const st = sp._g1;
    if (st.env) { st.env.dispose(); st.env = null; }
    const hz = sp.szene.background && sp.szene.background.isColor ? sp.szene.background.clone() : new THREE.Color(0x8fc8ff);
    const zen = hz.clone().multiply(new THREE.Color(0.72, 0.82, 1.0));
    const boden = hz.clone().multiplyScalar(0.28).lerp(new THREE.Color(0x3f5a2a), 0.3);
    const geo = new THREE.SphereGeometry(50, 32, 16), pos = geo.attributes.position, farben = new Float32Array(pos.count * 3), c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i) / 50;
      if (y >= 0) c.copy(hz).lerp(zen, Math.pow(y, 0.6)); else c.copy(hz).multiplyScalar(0.8).lerp(boden, Math.min(1, -y * 3));
      farben[i * 3] = c.r; farben[i * 3 + 1] = c.g; farben[i * 3 + 2] = c.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(farben, 3));
    const szene = new THREE.Scene();
    szene.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide })));
    const sonne = new THREE.Mesh(new THREE.SphereGeometry(4, 12, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xfff3d6).multiplyScalar(14) }));
    sonne.position.copy(sonnenRichtung).multiplyScalar(44);
    szene.add(sonne);
    const pm = new THREE.PMREMGenerator(sp.renderer);
    const rt = pm.fromScene(szene, 0.03);
    pm.dispose();
    geo.dispose(); sonne.geometry.dispose();
    st.env = rt;
    return rt.texture;
  }

  // ---------- Glühen (nur Ultra) ----------
  let glowTex = null;
  function glowTextur(ring) {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const x = c.getContext('2d'), g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
    if (ring) { g.addColorStop(0, 'rgba(255,120,20,0)'); g.addColorStop(0.55, 'rgba(255,120,20,0)'); g.addColorStop(0.74, 'rgba(255,120,20,0.34)'); g.addColorStop(0.86, 'rgba(255,90,10,0.12)'); g.addColorStop(1, 'rgba(255,90,10,0)'); }
    else { g.addColorStop(0, 'rgba(255,248,215,1)'); g.addColorStop(0.18, 'rgba(255,240,190,0.55)'); g.addColorStop(0.5, 'rgba(255,230,160,0.15)'); g.addColorStop(1, 'rgba(255,220,140,0)'); }
    x.fillStyle = g; x.fillRect(0, 0, 128, 128);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  }
  function glowSprite(ring, groesse) {
    const tex = ring ? (glowTextur.ring || (glowTextur.ring = glowTextur(true))) : (glowTex || (glowTex = glowTextur(false)));
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false, toneMapped: false }));
    s.scale.set(groesse, groesse, 1); s.renderOrder = 5; s.name = 'g1Glow';
    return s;
  }

  // ---------- Szene durchgehen ----------
  const EMPFAENGER = { Boden: 1, Strasse: 1, Mittellinie: 1, Randsteine: 1, Bruecke: 1, Senke: 1, StartZiel: 1 };
  const FAHRZEUG_TEILE = { karosserie: 1, rad: 1, dach: 1, ueberrollbuegel: 1, teile: 1, lenkTeile: 1, fahrer: 1, felge: 1, kotfluegel: 1 };

  function matVeredeln(st, orig, name, stufe) {
    const k = orig; let m = st.mats.get(k); if (m) return m;
    const schoen = stufe === 'schoen', ei = schoen ? 0.45 : 0.55;
    const gemeinsam = { envMap: st.envTex, envMapIntensity: orig.vertexColors ? ei : name === 'rad' ? 0.15 : name === 'felge' ? ei * 1.5 : ei * 0.5, side: orig.side };
    if (orig.vertexColors) {
      Object.assign(gemeinsam, { vertexColors: true, roughness: 1, metalness: 1 });
    } else {
      const c = name === 'felge' ? [0.92, 0.2] : name === 'rad' ? [0, 0.9] : LACK[stufe];
      Object.assign(gemeinsam, { color: orig.color.clone().multiplyScalar(0.8), roughness: c[1], metalness: c[0] });
    }
    if (schoen) m = new THREE.MeshStandardMaterial(gemeinsam);
    else m = new THREE.MeshPhysicalMaterial(Object.assign(gemeinsam, { clearcoat: 0.7, clearcoatRoughness: 0.05 }));
    if (orig.vertexColors) pbrEinhaengen(m);
    st.mats.set(k, m); st.erzeugt.set(m, orig);
    return m;
  }

  function sweep(sp, stufe) {
    const st = sp._g1;
    sp.szene.traverse((o) => {
      if (!o.isMesh || st.orig.has(o)) return;
      const n = o.name;
      if (FAHRZEUG_TEILE[n] && o.material && o.material.isMeshLambertMaterial && !Array.isArray(o.material)) {
        const eintrag = { mat: o.material, geo: o.geometry, cast: o.castShadow, recv: o.receiveShadow };
        st.orig.set(o, eintrag);
        if (o.material.vertexColors) { const g2 = geoMitPbr(o.geometry, n, stufe); if (!g2) return; o.geometry = g2; }
        o.material = matVeredeln(st, eintrag.mat, n, stufe);
        o.castShadow = true;
      } else if (n === 'schatten' && o.visible) {                 // Blob-Schatten ist mit echten Schatten doppelt gemoppelt
        st.orig.set(o, { vis: true }); o.visible = false;
      } else if (EMPFAENGER[n] && o.material && o.material.isMeshLambertMaterial) {
        st.orig.set(o, { recv: o.receiveShadow }); o.receiveShadow = true;
      }
    });
    // Himmel/Wetter (Wolken, Regen, Feuerwerk) bleiben wie sie sind: der Hintergrund wird nicht tone-gemappt, die Wolken sollen nicht zum Himmel „verblassen“
    sp.szene.traverse((o) => {
      let wetter = o.isPoints; for (let a = o; a && !wetter; a = a.parent) wetter = /^Wetter/.test(a.name);
      if (!wetter || !o.material) return;
      const ms = Array.isArray(o.material) ? o.material : [o.material];
      ms.forEach((m) => { if (m && m.toneMapped && !st.tm.has(m)) { st.tm.add(m); m.toneMapped = false; m.needsUpdate = true; } });
    });
    if (stufe === 'ultra') glowAnlegen(sp);
  }

  function glowAnlegen(sp) {
    const st = sp._g1;
    sp.szene.traverse((o) => {
      if (st.glowFuer.has(o)) return;
      const sw = o.userData && o.userData.scheinwerfer;        // Autos/Motorräder: Liste der Scheinwerfer-Meshes
      if (sw && sw.length && !o.isMesh) {
        st.glowFuer.add(o);
        sw.forEach((m) => {
          if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
          const mitte = m.geometry.boundingBox.getCenter(new THREE.Vector3());
          const s = glowSprite(false, MOTO ? 0.9 : 1.5); s.position.copy(mitte); s.position.z -= 0.15; s.visible = false;
          s.userData.fahrzeug = o; m.parent.add(s); st.glows.push(s);
        });
      } else if (o.isMesh && o.geometry && o.geometry.type === 'TorusGeometry' && o.material && o.material.isMeshBasicMaterial && o.material.color.getHex() === 0xff5a10) {
        st.glowFuer.add(o);
        o.parent.traverse((m) => { const ms = Array.isArray(m.material) ? m.material : [m.material]; ms.forEach((x) => { if (x && x.isMeshBasicMaterial && x.toneMapped && !st.tm.has(x)) { st.tm.add(x); x.toneMapped = false; x.needsUpdate = true; } }); });   // Feuerfarben nicht ausbleichen
        const r = o.geometry.parameters.radius, s = glowSprite(true, (r + 0.25) * 2 * 1.7); s.userData.ring = true; o.parent.add(s); st.glows.push(s);
      }
    });
  }

  function zurueck(sp) {
    const st = sp._g1; if (!st) return;
    if (G.haken) { try { G.haken.aus(sp); } catch (e) { /* G2 nur Optik */ } }      // G2 (umgebung.js) zuerst abbauen
    sp.szene.traverse((o) => {
      if (!o.isMesh) return;
      const e = st.orig.get(o);
      if (e) {
        if (e.mat) { o.material = e.mat; o.geometry = e.geo; o.castShadow = e.cast; o.receiveShadow = e.recv; }
        else if (e.vis !== undefined) o.visible = e.vis;
        else if (e.recv !== undefined) o.receiveShadow = e.recv;
      } else {                     // Kopien (mesh.clone) übernahmen unser Material/Geometrie: zurück auf das Original
        const om = st.erzeugt.get(o.material); if (om) o.material = om;
        const og = o.geometry && o.geometry.userData && o.geometry.userData.g1Original; if (og) o.geometry = og;
      }
    });
    st.glows.forEach((s) => { if (s.parent) s.parent.remove(s); s.material.dispose(); });
    st.mats.forEach((m) => m.dispose());
    if (st.env) { st.env.dispose(); st.env = null; }
    st.tm.forEach((m) => { m.toneMapped = true; m.needsUpdate = true; }); st.tm = new Set();
    st.orig = new Map(); st.mats = new Map(); st.erzeugt = new Map(); st.glows = []; st.glowFuer = new WeakSet(); st.envTex = null;
    if (st.merk) {
      const r = sp.renderer, m = st.merk;
      r.toneMapping = m.tm; r.toneMappingExposure = m.exp; r.shadowMap.enabled = m.sm; r.shadowMap.type = m.smt; r.outputColorSpace = m.cs;
      const s = sp.sonne; s.castShadow = m.cast; s.position.copy(m.pos);
      if (s.target.parent === sp.szene) sp.szene.remove(s.target);
      s.target.position.set(0, 0, 0); s.target.updateMatrixWorld(true);
      if (s.shadow.map) { s.shadow.map.dispose(); s.shadow.map = null; }
      st.merk = null;
    }
    st.aktiv = false;
  }

  function anwenden(sp) {
    if (!sp || !sp.renderer || !sp.szene || !sp.sonne) return;
    const stufe = G.stufe;
    if (!sp._g1) {
      if (stufe === 'normal') return;               // NORMAL: nichts anfassen
      sp._g1 = { tm: new Set(), aktiv: false, orig: new Map(), mats: new Map(), erzeugt: new Map(), glows: [], glowFuer: new WeakSet(), env: null, envTex: null, merk: null, zaehler: 0 };
    }
    const st = sp._g1;
    if (st.aktiv) zurueck(sp);
    if (stufe === 'normal') return;
    const r = sp.renderer, s = sp.sonne;
    st.merk = { tm: r.toneMapping, exp: r.toneMappingExposure, sm: r.shadowMap.enabled, smt: r.shadowMap.type, cs: r.outputColorSpace, cast: s.castShadow, pos: s.position.clone() };
    const ultra = stufe === 'ultra';
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    // ACES drückt die Mitteltöne und Schatten: Welt etwas heller (Tag 1,2), nachts nach Himmelshelligkeit bis 2,4 (sonst schwarze Straße)
    const bg = sp.szene.background && sp.szene.background.isColor ? sp.szene.background : null;
    const lum = bg ? 0.2126 * bg.r + 0.7152 * bg.g + 0.0722 * bg.b : 0.55;
    r.toneMappingExposure = 1.2 + 1.2 * Math.max(0, Math.min(1, (0.5 - lum) / 0.5));
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    st.richtung = s.position.clone().normalize();
    s.castShadow = true;
    const ausdehnung = ultra ? 38 : 34, karte = ultra ? 2048 : 1024;
    s.shadow.mapSize.set(karte, karte);
    const k = s.shadow.camera; k.left = -ausdehnung; k.right = ausdehnung; k.top = ausdehnung; k.bottom = -ausdehnung; k.near = 10; k.far = 520;
    k.updateProjectionMatrix();
    s.shadow.bias = -0.0004; s.shadow.normalBias = 0.06; s.shadow.radius = ultra ? 3 : 2;
    if (s.shadow.map) { s.shadow.map.dispose(); s.shadow.map = null; }
    sp.szene.add(s.target);
    st.envTex = umgebung(sp, st.richtung);
    st.aktiv = true;
    sweep(sp, stufe);
    sonneNachfuehren(sp, true);
    if (G.haken) { try { G.haken.an(sp, stufe); } catch (e) { try { console.warn('Grafik G2:', e); } catch (e2) { /* egal */ } } }   // G2: Himmel, Gras, Bäume, Asphalt, Staub
  }

  const _t = new THREE.Vector3();
  function sonneNachfuehren(sp, hart) {
    const st = sp._g1, s = sp.sonne;
    const f = sp.fahrzeuge && sp.fahrzeuge[0] && sp.fahrzeuge[0].mesh;
    if (f) { f.getWorldPosition(_t); if (sp.fahrzeuge[1] && sp.kameras && sp.kameras.length === 2) { const g = sp.fahrzeuge[1].mesh; if (g) { const p = new THREE.Vector3(); g.getWorldPosition(p); _t.add(p).multiplyScalar(0.5); } } }
    else _t.set(0, 0, 0);
    _t.x = Math.round(_t.x); _t.y = 0; _t.z = Math.round(_t.z);
    s.target.position.copy(_t);
    s.position.copy(_t).addScaledVector(st.richtung, 260);
    s.target.updateMatrixWorld(true);
  }

  // ---------- Haken ----------
  const zeichnen = R.Spiel.prototype.zeichnen;
  R.Spiel.prototype.zeichnen = function () {
    const st = this._g1;
    if (st && st.aktiv) {
      sonneNachfuehren(this, false);
      if (G.haken && G.haken.bild) { try { G.haken.bild(this); } catch (e) { if (!st.g2Fehler) { st.g2Fehler = 1; try { console.warn('Grafik G2 Bild:', e); } catch (e2) { /* egal */ } } } }
      if (++st.zaehler % 45 === 0) sweep(this, G.stufe);                      // neu entstandene Fahrzeuge (Verkehr, Polizei …) nachziehen
      const glows = st.glows;
      for (let i = 0; i < glows.length; i++) { const s = glows[i]; if (!s.userData.ring) { const f = s.userData.fahrzeug; s.visible = !!(f && f.visible && f.userData.lichtAn); } }
    }
    return zeichnen.apply(this, arguments);
  };

  const vorwaermen = R.Spiel.prototype._vorwaermen;
  R.Spiel.prototype._vorwaermen = function () {
    try { anwenden(this); } catch (e) { try { console.warn('Grafik G1:', e); } catch (e2) { /* egal */ } }
    return vorwaermen.apply(this, arguments);
  };

  G.setzen = function (stufe) {
    if (!STUFEN.includes(stufe)) return G.stufe;
    G.stufe = stufe; speichern(stufe);
    const sp = R.spiel;
    if (sp) { try { anwenden(sp); } catch (e) { try { console.warn('Grafik G1:', e); } catch (e2) { /* egal */ } } }
    return stufe;
  };
  G.weiter = function () { return G.setzen(STUFEN[(STUFEN.indexOf(G.stufe) + 1) % STUFEN.length]); };

  // ---------- Menü: kleiner Knopf neben „Ton“ ----------
  const M = R.Menue.prototype, mZeichnen = M.zeichnen;
  const knopfText = () => '✨ Grafik: ' + NAMEN[G.stufe];
  // FIX2: zusätzlich großer gelber Knopf in der Fußleiste (in JEDEM Menü-Schritt sichtbar) und Knopf in der Pause (Esc).
  const TITEL = 'Normal = wie bisher · Schön = Lack-Spiegelung, weiche Schatten · Ultra = zusätzlich Klarlack und Glühen (braucht eine schnelle Grafikkarte)';
  function stil() {
    if (document.getElementById('g1-stil')) return;
    const s = document.createElement('style'); s.id = 'g1-stil';
    s.textContent = '.knopf.g1-gross{flex:0 0 auto;white-space:nowrap;background:var(--gelb,#ffd23a);color:#1a2550;border:.15em solid #fff;font-size:1em;padding:.35em 1em;box-shadow:0 .15em .5em rgba(0,0,0,.5);pointer-events:auto;cursor:pointer}' +
      '.knopf.g1-gross:hover{background:#fff}' +
      '.m-fuss{flex-wrap:wrap}.m-fuss .m-hinweis{flex:1 1 auto}' +
      '@media (max-width:900px),(max-height:520px){.knopf.g1-gross{font-size:.85em;padding:.3em .8em}}';
    document.head.appendChild(s);
  }
  function knopfBauen(klasse) {
    const d = document.createElement('div');
    d.className = klasse; d.setAttribute('data-g1', '1'); d.textContent = knopfText(); d.title = TITEL;
    return d;
  }
  function klickBinden(wurzel) {
    if (wurzel._g1Klick) return;
    wurzel._g1Klick = true;
    wurzel.addEventListener('click', (ev) => {
      const t = ev.target.closest && ev.target.closest('[data-g1]');
      if (!t) return;
      ev.stopPropagation();
      G.weiter();
      document.querySelectorAll('[data-g1]').forEach((e) => { e.textContent = knopfText(); });
    }, true);
  }
  M.zeichnen = function () {
    const erg = mZeichnen.apply(this, arguments);
    try {
      stil();
      const akt = this.wurzel.querySelector('.m-aktionen');
      if (akt && !akt.querySelector('[data-g1]')) akt.appendChild(knopfBauen('knopf klein ton'));
      const fuss = this.wurzel.querySelector('.m-fuss');
      if (fuss && !fuss.querySelector('[data-g1]')) {
        const nav = fuss.querySelector('.m-nav');
        fuss.insertBefore(knopfBauen('knopf g1-gross'), nav ? nav.nextSibling : fuss.firstChild);
      }
      klickBinden(this.wurzel);
    } catch (e) { /* nur Optik */ }
    return erg;
  };
  if (R.PauseAnzeige) {
    const P = R.PauseAnzeige.prototype, pZeichnen = P.zeichnen;
    P.zeichnen = function () {
      const erg = pZeichnen.apply(this, arguments);
      try {
        stil();
        const karte = this.wurzel.querySelector('.pause-karte');
        if (karte && !karte.querySelector('[data-g1]')) karte.appendChild(knopfBauen('knopf blau'));
        klickBinden(this.wurzel);
      } catch (e) { /* nur Optik */ }
      return erg;
    };
  }
})();
