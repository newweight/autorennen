// ============================================================
// Runde 4: Jahreszeit, Wetter, Wind, Wolken, Sonne
//
//   const w = new Rennspiel.Wetter(szene, { jahreszeit, wetter, wind: { staerke, richtung }, thema, seed, strecke });
//   w.jahreszeit / w.wetterArt / w.windStaerke / w.windRichtung   (aufgelöst, 'zufall' → fest aus dem Seed)
//   w.anwenden(thema, {halbkugel, sonne})  Himmel, Nebel, Licht, Sonnenstand, Boden-/Randfarben, Wolken + Sonne
//                                          → { sicht, nebelNah } (Sichtweite für main.qualitaet.sicht)
//   w.partikelBauen(kameraAnzahl)           Regen/Schnee/Hagel/Sand – je Kamera eine Partikelbox (eigener Layer)
//   w.update(dt, kameras)                   Partikel wandern mit, Wolken ziehen, Ton startet sobald möglich
//   w.umwelt()                              { gripFaktor, bremsFaktor, windX, windZ, windStaerke, windRichtung } → vehicle.schritt
//   w.windFuer(vehicle)                     { seitlich, laengs, staerke } relativ zum Auto (−1..1, Stufe/5) → HUD
//   w.zerstoeren()                          alles aus der Szene nehmen, Ton aus
//
// Runde 6 (W2-D): opt.tageszeit 'tag' (Standard, alles wie bisher) | 'daemmerung' | 'nacht' (config.tageszeit):
//   w.tz (Daten oder null), w.tageszeitEmoji, w.nacht; anwenden() setzt Sonne/Halbkugel/Himmel/Nebel der Tageszeit,
//   baut Himmelskuppel (+1 Draw-Call) und nachts Sterne (+1) + Mond (statt Sonne), Mittellinie/Randsteine/Ballons leuchten.
// Reine Helfer ohne Three.js (Node-Tests): Wetter.tageszeitDaten, Wetter.tageszeitName, Wetter.erlaubt, Wetter.aufloesen, Wetter.umweltAus,
// Wetter.windRelativ, Wetter.jahreszeitDaten.
// Standard (Sommer, klar, Wind 0): anwenden() ändert nichts Sichtbares außer ein paar Wolken + Sonne
// am Himmel (Wald/Wiese/Fantasie); umwelt() ist neutral (Faktoren 1, kein Wind).
//
// Draw-Calls: Wolken 1 (InstancedMesh), Sonne 1 (Scheibe + Halo in einer Geometrie, additiv),
// Partikel 1 je Kamera (Layer 10 + Kameranummer → jede Ansicht zeichnet nur ihre Box) ⇒ ≤ 4.
// Wolken und Sonne hängen an der jeweiligen Kamera (onBeforeRender) und werden auf deren Far-Plane
// skaliert – gleicher Bildwinkel, nie abgeschnitten, keine Parallaxe (wie ein Himmel).
// ============================================================
(function () {
  const R = window.Rennspiel;
  const LAYER_BASIS = 10;
  const BOX = { halb: 30, unten: 12, hoehe: 30 };     // Partikelbox 60 × 30 × 60 m um jede Kamera

  /** Deterministischer Zufall (mulberry32) – eigene Kopie, damit Node-Tests ohne themes.js laufen. */
  function zufall(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /** Zwei Hex-Farben mischen (t = 0 → a, 1 → b), ohne THREE. */
  function mischHex(a, b, t) {
    if (!t) return a;
    const ar = (a >> 16) & 255, ag = (a >> 8) & 255, ab = a & 255;
    const br = (b >> 16) & 255, bg = (b >> 8) & 255, bb = b & 255;
    const r = Math.round(ar + (br - ar) * t), g = Math.round(ag + (bg - ag) * t), bl = Math.round(ab + (bb - ab) * t);
    return (r << 16) | (g << 8) | bl;
  }
  /** Farbe mit optionaler Mischung [farbe, anteil] (null → unverändert). */
  function misch(hex, m) { return m ? mischHex(hex, m[0], m[1]) : hex; }

  const klemme = (x, lo, hi) => (x < lo ? lo : (x > hi ? hi : x));

  // ------------------------------------------------------------------ reine Helfer

  /** Jahreszeit-Daten für ein Thema (Wüste: Winter-Ausnahme eingemischt). */
  function jahreszeitDaten(themaName, jz) {
    const J = R.config.jahreszeiten;
    const basis = J[jz] || J[R.config.jahreszeitStandard] || J.sommer;
    const aus = themaName && basis[themaName];
    return aus ? Object.assign({}, basis, aus) : basis;
  }

  /** Erlaubte Wetter für Thema + Jahreszeit (Wüste: nie Schnee/Hagel/Nebel, stattdessen Sandsturm). */
  function erlaubt(themaName, jz) {
    const d = jahreszeitDaten(themaName, jz);
    const liste = (themaName === 'wueste' ? d.wetterWueste : d.wetter) || ['klar'];
    return liste.filter(w => R.config.wetter[w]);
  }

  /**
   * Runde 6 (W2-D): Tageszeit-Daten für ein Thema (Themen-Ausnahmen eingemischt, sonne/halbkugel je Feld).
   * 'tag' (Standard) und Ungültiges → null = Licht exakt wie bisher.
   */
  function tageszeitDaten(themaName, tz) {
    const T = R.config.tageszeit;
    if (!T || !tz || tz === 'tag' || !T[tz]) return null;
    const basis = T[tz], aus = themaName && basis[themaName];
    if (!aus) return basis;
    const d = Object.assign({}, basis, aus);
    ['sonne', 'halbkugel', 'laterne'].forEach((k) => { if (basis[k] && aus[k]) d[k] = Object.assign({}, basis[k], aus[k]); });
    return d;
  }
  /** Gültiger Tageszeit-Schlüssel ('tag' | 'daemmerung' | 'nacht'). */
  function tageszeitName(tz) {
    const T = R.config.tageszeit;
    return T && T[tz] ? tz : (R.config.tageszeitStandard || 'tag');
  }

  /**
   * Einstellungen auflösen: 'zufall' → fester Wert aus dem Seed, Ungültiges → Standard.
   * Es werden immer genau 4 Zufallszahlen gezogen (Jahreszeit, Wetter, Stärke, Richtung) → reproduzierbar.
   */
  function aufloesen(opt) {
    opt = opt || {};
    const C = R.config, W = C.wind;
    const rnd = zufall((opt.seed === undefined ? 4711 : opt.seed) ^ 0x5eed);
    const z1 = rnd(), z2 = rnd(), z3 = rnd(), z4 = rnd();
    const thema = typeof opt.thema === 'string' ? opt.thema : (opt.thema && opt.thema.schluessel) || 'wiese';
    const jzNamen = Object.keys(C.jahreszeiten);
    let jz = opt.jahreszeit || C.jahreszeitStandard;
    if (jz === 'zufall') jz = jzNamen[Math.floor(z1 * jzNamen.length)];
    if (!C.jahreszeiten[jz]) jz = C.jahreszeitStandard;
    const liste = erlaubt(thema, jz);
    let w = opt.wetter || C.wetterStandard;
    if (w === 'zufall') w = liste[Math.floor(z2 * liste.length)];
    if (!liste.includes(w)) w = 'klar';                 // z. B. Schnee in der Wüste, Hagel im Sommer
    const wind = opt.wind || {};
    let st = wind.staerke === undefined ? W.staerkeStandard : wind.staerke;
    if (st === 'zufall') st = 1 + Math.floor(z3 * W.staerkeMax);
    st = klemme(Math.round(+st || 0), 0, W.staerkeMax);
    if (C.wetter[w].windMin) st = Math.max(st, C.wetter[w].windMin);
    let ri = wind.richtung === undefined ? W.richtungStandard : wind.richtung;
    if (ri === 'zufall' || !isFinite(+ri)) ri = z4 * Math.PI * 2;
    return { thema, jahreszeit: jz, wetter: w, windStaerke: st, windRichtung: +ri };
  }

  /**
   * Umwelt-Objekt für vehicle.schritt. Wind: Richtung wie vehicle.heading (0 = weht nach −z),
   * Vektor in Stufen: windX = −sin(r)·Stufe, windZ = −cos(r)·Stufe. ziel (optional) wird wiederverwendet.
   */
  function umweltAus(a, ziel) {
    const w = R.config.wetter[a.wetter] || R.config.wetter.klar;
    const u = ziel || {};
    u.gripFaktor = w.gripFaktor; u.bremsFaktor = w.bremsFaktor;
    u.windStaerke = a.windStaerke; u.windRichtung = a.windRichtung;
    u.windX = a.windStaerke ? -Math.sin(a.windRichtung) * a.windStaerke : 0;
    u.windZ = a.windStaerke ? -Math.cos(a.windRichtung) * a.windStaerke : 0;
    return u;
  }

  /** Wind relativ zu einem Auto mit heading: seitlich (> 0 = nach rechts), laengs (> 0 = Rückenwind), je Stufe/max. */
  function windRelativ(u, heading, ziel) {
    const e = ziel || {};
    const max = R.config.wind.staerkeMax || 5;
    const rx = -Math.sin(heading), rz = -Math.cos(heading);    // vorne
    const qx = Math.cos(heading), qz = -Math.sin(heading);     // rechts
    e.seitlich = (u.windX * qx + u.windZ * qz) / max;
    e.laengs = (u.windX * rx + u.windZ * rz) / max;
    e.staerke = u.windStaerke;
    return e;
  }

  // ------------------------------------------------------------------ Three.js-Teil

  /** Runde, weiche Punkt-Textur (einmal erzeugt, kein Bild nötig). */
  let _punktTextur = null;
  function punktTextur() {
    if (_punktTextur) return _punktTextur;
    const c = document.createElement('canvas'); c.width = c.height = 32;
    const g = c.getContext('2d'), v = g.createRadialGradient(16, 16, 0, 16, 16, 16);
    v.addColorStop(0, 'rgba(255,255,255,1)'); v.addColorStop(0.45, 'rgba(255,255,255,0.9)'); v.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = v; g.fillRect(0, 0, 32, 32);
    _punktTextur = new THREE.CanvasTexture(c);
    return _punktTextur;
  }

  /** Vertex-Farben einer Geometrie in Richtung `farbe` mischen; nurGrau: nur ungesättigte Farben (Randsteine). */
  function vertexFarbenMischen(geo, farbe, anteil, nurGrau) {
    const col = geo && geo.attributes && geo.attributes.color;
    if (!col) return;
    const z = new THREE.Color(farbe), a = col.array;
    for (let i = 0; i < a.length; i += 3) {
      if (nurGrau && Math.max(a[i], a[i + 1], a[i + 2]) - Math.min(a[i], a[i + 1], a[i + 2]) > 0.08) continue;
      a[i] += (z.r - a[i]) * anteil; a[i + 1] += (z.g - a[i + 1]) * anteil; a[i + 2] += (z.b - a[i + 2]) * anteil;
    }
    col.needsUpdate = true;
  }

  class Wetter {
    /**
     * @param {THREE.Scene|null} szene  (null: nur rechnen, z. B. in Node-Tests)
     * @param {object} opt { jahreszeit, wetter, wind: { staerke, richtung|'zufall' }, thema, seed, strecke?, ton? }
     */
    constructor(szene, opt) {
      opt = opt || {};
      this.szene = szene;
      this.strecke = opt.strecke || null;
      const a = aufloesen(opt);
      this.thema = a.thema;
      this.jahreszeit = a.jahreszeit;
      this.wetterArt = a.wetter;
      this.windStaerke = a.windStaerke;
      this.windRichtung = a.windRichtung;
      this.daten = R.config.wetter[a.wetter];
      this.jz = jahreszeitDaten(a.thema, a.jahreszeit);
      this._umwelt = umweltAus(a, {});
      this._windErg = { seitlich: 0, laengs: 0, staerke: 0 };
      this.sicht = null;
      this.nebelNahAnteil = this.daten.nebelNah !== undefined ? this.daten.nebelNah : 0.55;
      this.tonErlaubt = opt.ton !== false;
      this._ton = false;
      this._systeme = [];        // Partikelboxen je Kamera
      this._wolken = null; this._sonne = null; this._himmel = null;
      this._zeit = 0;
      this._wolkenVersatz = { x: 0, z: 0 };
      this._seed = opt.seed === undefined ? 4711 : opt.seed;
      // Runde 6 (W2-D): Tageszeit (null = Tag = wie bisher)
      this.tageszeit = tageszeitName(opt.tageszeit);
      this.tz = tageszeitDaten(a.thema, this.tageszeit);
    }

    /** Für das Menü/HUD: Emoji des Wetters ('' bei klar). */
    get emoji() { return this.daten.emoji || ''; }
    /** Runde 6: Emoji der Tageszeit ('' bei Tag, 🌇 Dämmerung, 🌙 Nacht). */
    get tageszeitEmoji() { return (this.tz && this.tz.emoji) || ''; }
    /** Runde 6: Nacht? (echte Scheinwerfer, Laternen) */
    get nacht() { return this.tageszeit === 'nacht'; }

    // ---------- Physik ----------
    /** Umwelt für vehicle.schritt (immer dasselbe Objekt, keine Allokation). */
    umwelt() { return this._umwelt; }

    /** Wind relativ zum Auto (für HUD und Tests). Wiederverwendetes Objekt. */
    windFuer(vehicle) { return windRelativ(this._umwelt, vehicle.heading, this._windErg); }

    // ---------- Aussehen ----------
    /**
     * Himmel, Nebel, Licht, Sonnenstand, Boden-/Randfarben setzen und Wolken + Sonne bauen.
     * @param {object|string} thema Theme-Objekt (R.themes[x]) oder Name
     * @param {{halbkugel?:THREE.HemisphereLight, sonne?:THREE.DirectionalLight}} [licht] sonst in der Szene gesucht
     * @returns {{sicht:number, nebelNah:number}}
     */
    anwenden(thema, licht) {
      const sz = this.szene;
      if (typeof thema === 'string') thema = R.themes[thema];
      thema = thema || R.themes[this.thema] || R.themes.wiese;
      const jz = this.jz, w = this.daten;
      licht = licht || {};
      if (sz && (!licht.halbkugel || !licht.sonne)) {
        sz.children.forEach((o) => {
          if (o.userData && o.userData.tunnelLicht) return;
          if (o.isHemisphereLight && !licht.halbkugel) licht.halbkugel = o;
          if (o.isDirectionalLight && !licht.sonne) licht.sonne = o;
        });
      }
      // Himmel + Nebel (Runde 6: Tageszeit T ersetzt Themenfarben; Wetter-Mischfarben werden mit T.wetterHell abgedunkelt)
      const T = this.tz, dm = this._dunkelMisch.bind(this);
      const himmel = T ? misch(misch(T.himmel[2], dm(jz.himmelMisch)), dm(w.himmelMisch)) : misch(misch(thema.himmel, jz.himmelMisch), w.himmelMisch);
      const nebel = T ? misch(misch(T.nebel, dm(jz.nebelMisch)), dm(w.nebelFarbe)) : misch(misch(thema.nebel, jz.nebelMisch), w.nebelFarbe);
      let sicht = (thema.sichtweite || R.config.grafik.sichtweite) * (jz.sichtweiteFaktor || 1) * (w.sichtweiteFaktor || 1);
      if (T) sicht *= T.sichtweiteFaktor || 1;
      this.sicht = sicht;
      if (sz) {
        sz.background = new THREE.Color(himmel);
        if (sz.fog) { sz.fog.color.setHex(nebel); sz.fog.near = sicht * this.nebelNahAnteil; sz.fog.far = sicht; }
        else sz.fog = new THREE.Fog(nebel, sicht * this.nebelNahAnteil, sicht);
      }
      // Licht: Farbe/Helligkeit, Sonnenstand (Höhe je Jahreszeit, Richtung bleibt)
      const faktor = (jz.lichtFaktor || 1) * (w.lichtFaktor || 1);
      const so = licht.sonne, hk = licht.halbkugel;
      if (so) {
        if (jz.lichtFarbe !== null && jz.lichtFarbe !== undefined) so.color.setHex(jz.lichtFarbe);
        so.intensity *= faktor;
        if (!so.userData.basisPos) so.userData.basisPos = so.position.clone();
        const b = so.userData.basisPos;
        if (jz.sonnenHoehe !== null && jz.sonnenHoehe !== undefined) {
          const flach = Math.hypot(b.x, b.z), lang = b.length(), h = jz.sonnenHoehe * Math.PI / 180;
          so.position.set(b.x / flach * Math.cos(h) * lang, Math.sin(h) * lang, b.z / flach * Math.cos(h) * lang);
        } else so.position.copy(b);
      }
      if (hk) {
        hk.intensity *= faktor;
        if (jz.bodenMisch) hk.groundColor.setHex(misch(hk.groundColor.getHex(), jz.bodenMisch));
      }
      // Runde 6: Tageszeit – Sonne tief/orange (Dämmerung) bzw. schwaches Mondlicht (Nacht), Halbkugel absolut × faktor
      if (T && so) {
        so.color.setHex(T.sonne.farbe);
        so.intensity = T.sonne.intensitaet * faktor;
        const b = so.userData.basisPos, flach = Math.hypot(b.x, b.z), lang = b.length(), h = T.sonne.hoehe * Math.PI / 180;
        so.position.set(b.x / flach * Math.cos(h) * lang, Math.sin(h) * lang, b.z / flach * Math.cos(h) * lang);
      }
      if (T && hk) {
        hk.color.setHex(T.halbkugel.himmel);
        hk.groundColor.setHex(misch(T.halbkugel.boden, dm(jz.bodenMisch)));
        hk.intensity = T.halbkugel.intensitaet * faktor;
      }
      this._sonnenRichtung = so ? so.position.clone().normalize() : new THREE.Vector3(0.5, 0.75, 0.3).normalize();
      // Boden, Senke (Brücken), Randsteine einfärben (je Mesh nur einmal)
      if (sz && (jz.bodenMisch || jz.randSchnee)) {
        sz.traverse((o) => {
          if (!o.isMesh || o.userData.jzGefaerbt) return;
          if (jz.bodenMisch && (o.name === 'Boden' || o.name === 'Senke')) {
            vertexFarbenMischen(o.geometry, jz.bodenMisch[0], jz.bodenMisch[1], false); o.userData.jzGefaerbt = true;
          } else if (jz.randSchnee && o.name === 'Randsteine') {
            vertexFarbenMischen(o.geometry, 0xf4f7fa, 0.85, true); o.userData.jzGefaerbt = true;
          }
        });
      }
      if (sz && T) this._tageszeitLeuchten(sz, T);
      if (sz) this._himmelBauen(thema);
      return { sicht, nebelNah: this.nebelNahAnteil };
    }

    /** Runde 6: Mischfarbe [farbe, anteil] mit der Tageszeit-Helligkeit abdunkeln (Regen-Grau nachts dunkel). */
    _dunkelMisch(m) {
      const T = this.tz;
      return T && m ? [mischHex(m[0], 0x000000, 1 - (T.wetterHell === undefined ? 1 : T.wetterHell)), m[1]] : m;
    }

    /**
     * Runde 6 (Nacht): Mittellinie leuchtet, Randsteine etwas heller (Strecke bleibt lesbar), Fantasie-Ballons
     * leuchten in ihren Farben (MeshBasic statt Phong, ohne Nebel). Je Material nur einmal.
     */
    _tageszeitLeuchten(sz, T) {
      const ersatz = new Map();
      sz.traverse((o) => {
        if (!o.isMesh || !o.material || o.userData.tzLeuchtet) return;
        const m = o.material;
        if (T.markierung && o.name === 'Mittellinie' && m.emissive) { m.emissive.setHex(T.markierung); o.userData.tzLeuchtet = true; }
        else if (T.randstein && o.name === 'Randsteine' && m.emissive) { m.emissive.setHex(T.randstein); o.userData.tzLeuchtet = true; }
        else if (T.ballonsLeuchten && o.name === 'Ballons' && m.isMeshPhongMaterial) {
          if (!ersatz.has(m)) ersatz.set(m, new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false }));
          o.material = ersatz.get(m); o.userData.tzLeuchtet = true;
        }
      });
      ersatz.forEach((neu, alt) => alt.dispose());
    }

    /** Wolken (InstancedMesh aus Kugeln) + Sonne (Scheibe mit Halo, additiv). */
    _himmelBauen(thema) {
      this._himmelAbbauen();
      const w = this.daten, decke = !!w.wolkenDecke, wueste = this.thema === 'wueste';
      const rnd = zufall((this._seed * 31 + 7) >>> 0);
      const gruppe = new THREE.Group();
      gruppe.name = 'Wetter Himmel';
      // ---- Wolken: 8–20 (Wüste wenige), bei Wolkendecke 20 große graue; Nebel/Sandsturm: keine (Dunst) ----
      const keine = this.wetterArt === 'nebel' || this.wetterArt === 'sandsturm';
      const anzahl = keine ? 0 : decke ? 20 : (wueste ? 4 : 8 + Math.floor(rnd() * 6));
      const kugeln = [];        // { cx, cz, h, ox, oy, oz, sx, sy, sz, wolke }
      this._wolkenDaten = [];
      for (let i = 0; i < anzahl; i++) {
        const winkel = rnd() * Math.PI * 2, dist = 110 + rnd() * 210;
        const cx = Math.cos(winkel) * dist, cz = Math.sin(winkel) * dist;
        const h = (decke ? 75 : 65) + rnd() * 45;
        const groesse = (decke ? 1.6 : 1) * (0.8 + rnd() * 0.6);
        this._wolkenDaten.push({ cx, cz, h });
        const n = 4 + Math.floor(rnd() * 4);
        for (let k = 0; k < n; k++) {
          const r = (7 + rnd() * 7) * groesse;
          kugeln.push({ wolke: i, ox: (k - n / 2) * 8 * groesse + (rnd() - 0.5) * 6, oy: (rnd() - 0.3) * 4 * groesse,
            oz: (rnd() - 0.5) * 12 * groesse, sx: r * 1.3, sy: r * 0.6, sz: r });
        }
      }
      // Regenwolken: grau, zur Nebelfarbe hin gemischt (sie stehen hinter dem Nebel, sonst wirken sie wie Felsen)
      const nebelHex = this.szene.fog ? this.szene.fog.color.getHex() : 0xb0b8c0;
      let farbe = decke ? mischHex(0xa4abb4, nebelHex, 0.45) : 0xffffff;
      let eigen = decke ? mischHex(0x50565e, nebelHex, 0.35) : 0x9a9fa6;
      const T = this.tz;     // Runde 6: Dämmerung rosa, Nacht dunkel; Regenwolken mit der Tageszeit abgedunkelt
      if (T && T.wolken && !decke) { farbe = T.wolken[0]; eigen = T.wolken[1]; }
      else if (T && decke) { const d = 1 - (T.wetterHell || 1); farbe = mischHex(farbe, 0x000000, d); eigen = mischHex(eigen, 0x000000, d); }
      const mat = new THREE.MeshLambertMaterial({ color: farbe, emissive: eigen, fog: false });
      const geo = new THREE.IcosahedronGeometry(1, 1);
      const wolken = new THREE.InstancedMesh(geo, mat, Math.max(1, kugeln.length));
      wolken.count = kugeln.length;
      wolken.visible = kugeln.length > 0;
      wolken.name = 'Wolken';
      wolken.frustumCulled = false;
      wolken.matrixAutoUpdate = false;
      wolken.userData.kugeln = kugeln;
      this._wolkenWelt = new THREE.Matrix4();
      wolken.onBeforeRender = (r, s, kamera) => this._amHimmel(wolken, kamera, 360, null);
      gruppe.add(wolken);
      this._wolken = wolken;
      this._wolkenMatrizen(0);
      // ---- Sonne: helle Scheibe + weicher Halo, nur ohne Wolkendecke ----
      // Runde 6: Nacht = Mond (kleiner, kühl), Dämmerung = große orange Sonne; Tag unverändert
      const mond = !!(T && T.mond), abend = !!(T && T.sonnenScheibe);
      if (!decke) {
        const seg = 40, rS = mond ? 6 : (abend ? 11 : 9), rH = mond ? 34 : (abend ? 60 : 46), pos = [0, 0, 0], idx = [];
        const col = mond ? [0.96, 0.97, 1] : (abend ? T.sonnenScheibe.slice() : [1, 1, 0.94]);
        const innen = mond ? [0.86, 0.9, 0.98] : (abend ? T.sonnenScheibe.slice() : [1, 0.97, 0.86]);
        const rand = mond ? [0.2, 0.25, 0.36] : (abend ? [0.62, 0.3, 0.14] : [0.55, 0.47, 0.3]);
        for (let i = 0; i < seg; i++) {
          const a = i / seg * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
          pos.push(c * rS, s * rS, 0); col.push(...innen);             // 1 + 3i: Scheibenrand
          pos.push(c * rS * 1.04, s * rS * 1.04, 0); col.push(...rand); // 2 + 3i: Halo innen
          pos.push(c * rH, s * rH, 0); col.push(0, 0, 0);                // 3 + 3i: Halo außen (schwarz = nichts bei additiv)
        }
        for (let i = 0; i < seg; i++) {
          const j = (i + 1) % seg, a = 1 + 3 * i, b = 1 + 3 * j;
          idx.push(0, a, b);                                   // Scheibe
          idx.push(a, a + 1, b + 1, a, b + 1, b);              // Kante
          idx.push(a + 1, a + 2, b + 2, a + 1, b + 2, b + 1);  // Halo
        }
        const sg = new THREE.BufferGeometry();
        sg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
        sg.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
        sg.setIndex(idx);
        const sonne = new THREE.Mesh(sg, new THREE.MeshBasicMaterial({ vertexColors: true, blending: THREE.AdditiveBlending,
          transparent: true, depthWrite: false, fog: false, side: THREE.DoubleSide }));
        sonne.name = 'Sonne';
        sonne.frustumCulled = false;
        sonne.matrixAutoUpdate = false;
        sonne.renderOrder = -1;
        // Sichtbare Höhe höchstens 24° (sonst nie im Bild); Richtung = Lichtrichtung
        const d = this._sonnenRichtung.clone(), flach = Math.hypot(d.x, d.z) || 1;
        const hoehe = Math.min(Math.asin(klemme(d.y, -1, 1)), 24 * Math.PI / 180);
        this._sonnenDir = new THREE.Vector3(d.x / flach * Math.cos(hoehe), Math.sin(hoehe), d.z / flach * Math.cos(hoehe));
        sonne.onBeforeRender = (r, s, kamera) => this._amHimmel(sonne, kamera, 300, this._sonnenDir);
        sonne.name = mond ? 'Mond' : 'Sonne';
        gruppe.add(sonne);
        this._sonne = sonne;
      }
      if (T) this._tageszeitHimmel(gruppe, T, decke);
      this._hv ={ p: new THREE.Vector3(), s: new THREE.Vector3(), q: new THREE.Quaternion() };
      this._himmel = gruppe;
      this.szene.add(gruppe);
    }

    /**
     * Runde 6: Himmelskuppel mit Farbverlauf (oben → Mitte → Horizont → Nebel, 1 Draw-Call, ganz zuerst gezeichnet)
     * und nachts Sterne (Points, 1 Draw-Call, nicht bei Wolkendecke). Beide hängen wie Wolken an der Kamera.
     */
    _tageszeitHimmel(gruppe, T, decke) {
      const w = this.daten, jz = this.jz, dm = this._dunkelMisch.bind(this);
      const f = (hex) => misch(misch(hex, dm(jz.himmelMisch)), dm(w.himmelMisch));
      const oben = new THREE.Color(f(T.himmel[0])), mitte = new THREE.Color(f(T.himmel[1])), horiz = new THREE.Color(f(T.himmel[2]));
      const nebel = new THREE.Color(this.szene.fog ? this.szene.fog.color.getHex() : T.nebel);
      const geo = new THREE.SphereGeometry(1, 32, 16), p = geo.attributes.position, col = new Float32Array(p.count * 3), c = new THREE.Color();
      for (let i = 0; i < p.count; i++) {
        const y = p.getY(i);
        if (y <= 0) c.copy(nebel);
        else if (y < 0.1) c.copy(nebel).lerp(horiz, y / 0.1);
        else if (y < 0.35) c.copy(horiz).lerp(mitte, (y - 0.1) / 0.25);
        else c.copy(mitte).lerp(oben, Math.min(1, (y - 0.35) / 0.5));
        col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
      }
      geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
      const kuppel = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false,
        depthWrite: false, depthTest: false }));
      kuppel.name = 'Himmelskuppel';
      kuppel.frustumCulled = false; kuppel.matrixAutoUpdate = false; kuppel.renderOrder = -10;
      kuppel.onBeforeRender = (r, s, kamera) => this._amHimmel(kuppel, kamera, 300, null, 0.95);
      gruppe.add(kuppel);
      this._kuppel = kuppel;
      if (!T.sterne || decke) return;
      const rnd = zufall((this._seed * 53 + 11) >>> 0), n = T.sterne;
      const pos = new Float32Array(n * 3), sc = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        const a = rnd() * Math.PI * 2, y = 0.06 + Math.pow(rnd(), 0.8) * 0.94, r = Math.sqrt(1 - y * y);
        pos[i * 3] = Math.cos(a) * r; pos[i * 3 + 1] = y; pos[i * 3 + 2] = Math.sin(a) * r;
        const h = 0.45 + rnd() * 0.55, blau = rnd() < 0.3 ? 1 : 0.9;
        sc[i * 3] = h * (blau < 1 ? 1 : 0.85); sc[i * 3 + 1] = h * 0.93; sc[i * 3 + 2] = h;
      }
      const sg = new THREE.BufferGeometry();
      sg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      sg.setAttribute('color', new THREE.BufferAttribute(sc, 3));
      const sterne = new THREE.Points(sg, new THREE.PointsMaterial({ size: 2.4, sizeAttenuation: false, vertexColors: true,
        map: punktTextur(), transparent: true, alphaTest: 0.05, depthWrite: false, fog: false }));
      sterne.name = 'Sterne';
      sterne.frustumCulled = false; sterne.matrixAutoUpdate = false; sterne.renderOrder = -9;
      sterne.onBeforeRender = (r, s, kamera) => this._amHimmel(sterne, kamera, 300, null, 0.93);
      gruppe.add(sterne);
    }

    /**
     * Objekt an die gerade zeichnende Kamera hängen und auf deren Far-Plane skalieren (onBeforeRender).
     * richtung gesetzt: Billboard in dieser Richtung (Sonne); sonst kamerazentriert ohne Drehung (Wolken).
     */
    _amHimmel(obj, kamera, reichweite, richtung, radius) {
      const h = this._hv, k = Math.min(1, Math.max(0.05, (kamera.far - 15) / reichweite));
      if (richtung) {
        h.p.copy(richtung).multiplyScalar(reichweite * 0.97 * k).add(kamera.position);
        h.s.set(k, k, k);
        obj.matrixWorld.compose(h.p, kamera.quaternion, h.s);
      } else if (radius) {      // Runde 6: Einheitskugel (Kuppel, Sterne) auf radius × reichweite skalieren
        const r = reichweite * radius * k;
        h.q.identity(); h.s.set(r, r, r);
        obj.matrixWorld.compose(kamera.position, h.q, h.s);
      } else {
        h.q.identity(); h.s.set(k, k, k);
        obj.matrixWorld.compose(kamera.position, h.q, h.s);
      }
    }

    /** Wolken-Instanzen aus Versatz (Windzug) neu setzen: Kreis um die Kamera (r ≤ 340 m), am Rand klein. */
    _wolkenMatrizen() {
      const m = this._wolken; if (!m) return;
      const kugeln = m.userData.kugeln, e = m.instanceMatrix.array, W = 680, H = 340;
      const vx = this._wolkenVersatz.x, vz = this._wolkenVersatz.z;
      for (let i = 0; i < kugeln.length; i++) {
        const k = kugeln[i], wd = this._wolkenDaten[k.wolke];
        let x = wd.cx + vx + H; x -= Math.floor(x / W) * W; x -= H;
        let z = wd.cz + vz + H; z -= Math.floor(z / W) * W; z -= H;
        const r = Math.hypot(x, z), f = r > 300 ? Math.max(0, (340 - r) / 40) : 1;   // am Rand ausblenden
        const o = i * 16;
        e[o] = k.sx * f; e[o + 1] = 0; e[o + 2] = 0; e[o + 3] = 0;
        e[o + 4] = 0; e[o + 5] = k.sy * f; e[o + 6] = 0; e[o + 7] = 0;
        e[o + 8] = 0; e[o + 9] = 0; e[o + 10] = k.sz * f; e[o + 11] = 0;
        e[o + 12] = x + k.ox; e[o + 13] = wd.h + k.oy; e[o + 14] = z + k.oz; e[o + 15] = 1;
      }
      m.instanceMatrix.needsUpdate = true;
    }

    _himmelAbbauen() {
      if (!this._himmel) return;
      if (this._himmel.parent) this._himmel.parent.remove(this._himmel);
      this._himmel.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); if (o.isInstancedMesh) o.dispose(); });
      this._himmel = null; this._wolken = null; this._sonne = null;
    }

    // ---------- Partikel ----------
    /**
     * Niederschlag bauen: je Kamera eine Box 60 × 30 × 60 m auf Layer 10 + i (nur diese Kamera zeichnet sie).
     * Regen = Striche (LineSegments), Schnee = Flocken, Hagel = Körner (hüpfen am Boden), Sand = waagerecht.
     */
    partikelBauen(kameraAnzahl) {
      this._partikelAbbauen();
      const p = this.daten.partikel;
      if (!p || !this.szene) return;
      const anzahlKameras = Math.max(1, kameraAnzahl || 1);
      // Split-Screen: je Box etwas weniger Partikel (gesamt höchstens 1,6 × eine Box)
      const n = anzahlKameras > 1 ? Math.round(p.anzahl * 0.8) : p.anzahl;
      for (let c = 0; c < anzahlKameras; c++) {
        const rnd = zufall((this._seed * 97 + c * 13 + 1) >>> 0);
        const zustand = new Float32Array(n * 3), vy = new Float32Array(n), phase = new Float32Array(n), huepfer = new Uint8Array(n);
        for (let i = 0; i < n; i++) {
          zustand[i * 3] = (rnd() - 0.5) * 2 * BOX.halb;
          zustand[i * 3 + 1] = -BOX.unten + rnd() * BOX.hoehe;
          zustand[i * 3 + 2] = (rnd() - 0.5) * 2 * BOX.halb;
          vy[i] = -p.tempo * (0.8 + rnd() * 0.4);
          phase[i] = rnd() * Math.PI * 2;
        }
        let obj;
        const geo = new THREE.BufferGeometry();
        // Runde 6: Dämmerung/Nacht – Niederschlag Richtung Nebelfarbe (nachts dunkler, im Scheinwerfer trotzdem sichtbar)
        const T = this.tz, pf = T && T.partikelMisch && this.szene.fog ? mischHex(p.farbe, this.szene.fog.color.getHex(), T.partikelMisch) : p.farbe;
        if (p.art === 'striche') {
          geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 6), 3));
          obj = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: pf, transparent: true, opacity: 0.62, depthWrite: false }));
        } else {
          geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
          obj = new THREE.Points(geo, new THREE.PointsMaterial({ color: pf, size: p.groesse, map: punktTextur(),
            transparent: true, depthWrite: false, alphaTest: 0.05, sizeAttenuation: true, opacity: p.art === 'sand' ? 0.75 : 0.95 }));
        }
        geo.attributes.position.setUsage(THREE.DynamicDrawUsage);
        obj.name = 'Wetter Partikel ' + c;
        obj.frustumCulled = false;
        obj.layers.set(LAYER_BASIS + c);
        obj.renderOrder = 2;
        // Startpositionen: relativ zur ersten Kamera-Position (wird im ersten update gesetzt)
        this._systeme.push({ obj, n, zustand, vy, phase, huepfer, start: true, index: -1, cx: 0, cy: 0, cz: 0 });
        this.szene.add(obj);
      }
    }

    _partikelAbbauen() {
      this._systeme.forEach((s) => {
        if (s.obj.parent) s.obj.parent.remove(s.obj);
        s.obj.geometry.dispose(); s.obj.material.dispose();
      });
      this._systeme = [];
    }

    /**
     * Pro Frame: Partikel bewegen + um die Kamera wickeln (O(n), keine Allokation), Wolken ziehen,
     * Ton starten sobald der AudioContext läuft. kameras: FahrzeugKamera[] oder THREE.Camera[].
     */
    update(dt, kameras) {
      if (!(dt > 0)) dt = 0;
      dt = Math.min(dt, 0.1);
      this._zeit += dt;
      const u = this._umwelt;
      // Wolken ziehen mit dem Wind (Stufe → 2 m/s), ohne Wind ganz langsam
      if (this._wolken) {
        const st = this.windStaerke, vx = st ? u.windX * 2 : 0.8, vz = st ? u.windZ * 2 : 0.3;
        this._wolkenVersatz.x += vx * dt; this._wolkenVersatz.z += vz * dt;
        this._wolkenMatrizen();
      }
      if (kameras && this._systeme.length) {
        const nk = Math.min(kameras.length, this._systeme.length);
        for (let i = 0; i < nk; i++) {
          const k = kameras[i] && (kameras[i].kamera || kameras[i]);
          if (!k || !k.position) continue;
          k.layers.enable(LAYER_BASIS + i);
          this._systemUpdate(this._systeme[i], k, dt);
        }
      }
      this._tonPruefen();
    }

    _systemUpdate(sy, kamera, dt) {
      const p = this.daten.partikel, u = this._umwelt;
      const cx = kamera.position.x, cy = kamera.position.y, cz = kamera.position.z;
      // Unter der Decke (Tunnel) kein Niederschlag; Bodenhöhe unter der Kamera für den Hagel
      let boden = cy - 3;
      const st = this.strecke;
      if (st && st.abfrage) {
        const n = st.abfrage(cx, cz, sy.index);
        sy.index = n.index;
        sy.obj.visible = !(st.imTunnel && st.imTunnel(n.s, 4));
        if (st.hoeheAn) boden = st.hoeheAn(cx, cz);
      }
      if (sy.start) {      // Box zum ersten Mal an die Kamera setzen
        for (let i = 0; i < sy.n; i++) { sy.zustand[i * 3] += cx; sy.zustand[i * 3 + 1] += cy; sy.zustand[i * 3 + 2] += cz; }
        sy.start = false;
      }
      const z = sy.zustand, a = sy.obj.geometry.attributes.position.array, n = sy.n;
      const H = BOX.halb, B = 2 * H, unten = cy - BOX.unten, hoch = BOX.hoehe;
      // Seitwärts-Drift durch Wind (Stufe → m/s); Sand fliegt waagerecht mit dem Wind
      const sand = p.art === 'sand';
      const wx = sand ? (u.windX || -0.6) * (p.tempo / Math.max(1, this.windStaerke || 1)) : u.windX * 1.3;
      const wz = sand ? (u.windZ || -0.8) * (p.tempo / Math.max(1, this.windStaerke || 1)) : u.windZ * 1.3;
      const t = this._zeit;
      for (let i = 0; i < n; i++) {
        const o = i * 3;
        let x = z[o], y = z[o + 1], zz = z[o + 2];
        if (p.art === 'flocken') {
          const ph = sy.phase[i];
          x += (wx * 0.6 + Math.sin(t * 1.3 + ph) * 0.7) * dt;
          zz += (wz * 0.6 + Math.cos(t * 1.1 + ph * 1.7) * 0.7) * dt;
          y += sy.vy[i] * dt;
        } else if (p.art === 'koerner') {
          x += wx * dt; zz += wz * dt;
          if (sy.huepfer[i]) sy.vy[i] -= 9.81 * dt;
          y += sy.vy[i] * dt;
          if (y < boden + 0.05 && sy.vy[i] < 0) {
            if (!sy.huepfer[i]) { sy.huepfer[i] = 1; sy.vy[i] = -sy.vy[i] * 0.22; y = boden + 0.05; }   // leicht hüpfen
            else { sy.huepfer[i] = 0; sy.vy[i] = -p.tempo * (0.8 + 0.4 * ((sy.phase[i] * 7.3) % 1)); y += hoch * (0.6 + 0.4 * ((sy.phase[i] * 3.1) % 1)); }
          }
        } else if (sand) {
          const ph = sy.phase[i];
          x += wx * (0.7 + 0.3 * Math.sin(ph)) * dt; zz += wz * (0.7 + 0.3 * Math.sin(ph)) * dt;
          y += Math.sin(t * 2 + ph) * 0.8 * dt - 0.3 * dt;
        } else {   // Regen
          x += wx * dt; zz += wz * dt; y += sy.vy[i] * dt;
        }
        // Um die Kamera wickeln (Box wandert mit, Partikel bleiben in der Welt stehen)
        let d = x - cx + H; if (d < 0 || d >= B) { d -= Math.floor(d / B) * B; x = cx - H + d; }
        d = zz - cz + H; if (d < 0 || d >= B) { d -= Math.floor(d / B) * B; zz = cz - H + d; }
        d = y - unten; if (d < 0 || d >= hoch) { d -= Math.floor(d / hoch) * hoch; y = unten + d; if (sy.huepfer[i]) { sy.huepfer[i] = 0; sy.vy[i] = -p.tempo; } }
        z[o] = x; z[o + 1] = y; z[o + 2] = zz;
        if (p.art === 'striche') {
          const l = 0.032;          // Strichlänge = Weg in 32 ms
          const o2 = i * 6;
          a[o2] = x; a[o2 + 1] = y; a[o2 + 2] = zz;
          a[o2 + 3] = x - wx * l; a[o2 + 4] = y - sy.vy[i] * l; a[o2 + 5] = zz - wz * l;
        } else { a[o] = x; a[o + 1] = y; a[o + 2] = zz; }
      }
      sy.obj.geometry.attributes.position.needsUpdate = true;
    }

    // ---------- Ton ----------
    _tonPruefen() {
      if (this._ton || !this.tonErlaubt) return;
      const A = R.Audio;
      if (!A || typeof A.wetter !== 'function' || !A._bereit || !A._bereit()) return;
      this._ton = true;
      const g = this.daten.geraeusch;
      if (g && g !== 'wind') A.wetter(g, true, 1);
      const windTon = Math.max(this.windStaerke / R.config.wind.staerkeMax, g === 'wind' ? 0.8 : 0);
      if (windTon > 0) A.wetter('wind', true, windTon);
    }

    tonAus() {
      if (this._ton && R.Audio && R.Audio.wetterAlleAus) R.Audio.wetterAlleAus();
      this._ton = false;
    }

    /** Alles aus der Szene nehmen, Speicher freigeben, Ton aus. */
    zerstoeren() {
      this._partikelAbbauen();
      this._himmelAbbauen();
      this.tonAus();
      this.tonErlaubt = false;
    }
  }

  Wetter.erlaubt = erlaubt;
  Wetter.aufloesen = aufloesen;
  Wetter.umweltAus = umweltAus;
  Wetter.windRelativ = windRelativ;
  Wetter.jahreszeitDaten = jahreszeitDaten;
  Wetter.mischHex = mischHex;
  Wetter.tageszeitDaten = tageszeitDaten;     // Runde 6
  Wetter.tageszeitName = tageszeitName;
  Wetter.LAYER_BASIS = LAYER_BASIS;
  R.Wetter = Wetter;
})();
