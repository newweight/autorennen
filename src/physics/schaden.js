// ============================================================
// Runde 4: Schaden-System („Auto-Gesundheit“) + Grafik der Wracks (liegengebliebene/brennende Autos)
//
//   const schaden = new Rennspiel.Schaden(fahrzeuge, { an: true|false });   // fahrzeuge: Vehicles oder { vehicle, mesh }
//   schaden.treffer(i, art, staerke[, zuschlag])   art: 'bande'|'auto'|'hindernis'|'brand'|'ball'|'wasser'|'stroh'|'pflanze'
//        Runde 6: Verlust je Art aus config.schaden.verluste (bande/pflanze 3 %), sonst trefferVerlust; auto ab 1 m/s.
//        → verlorene Prozentpunkte (0 = nichts passiert). −5 % je Treffer ab Mindeststärke (config.schaden.mindest),
//          brand −10 %; je Fahrzeug höchstens ein Treffer je abklingZeit (0,7 s, kein Dauerabzug beim Schleifen).
//   Bequem: schaden.stoesseAuswerten({ bande:[staerke je Fahrzeug], auto, hindernis, dynamik }) (Listen aus collisions/dynamik)
//   schaden.schritt(dt)    Logik-Uhr (Abklingzeit, Liegenbleiben) – im Physikschritt aufrufen
//   schaden.update(dt)     Optik (Rauch, Warnblinker) – je Frame NACH carBuilder.setzeBremslicht
//   schaden.zustand(i)     → { prozent, stufe, liegengeblieben, rauch: 0..1, qualm: bool }
//   schaden.gesperrt(i)    true, solange das Auto liegengeblieben ist (main.js: gas/lenkung ignorieren)
//   schaden.meshBauen(i, mesh?)  Rauch an das Auto-Mesh hängen (Motorhaube vorne, z ≈ −laenge/2·0,6)
//   schaden.bei(fn)        Ereignisse fn({ art, i, stufe, prozent }):
//                            'treffer' (Ton), 'stufe' (neue Stufe), 'liegengeblieben' (Meldung + Ton),
//                            'abschleppwagen' (Hälfte der Wartezeit: zweite Meldung + Hupe),
//                            'abschleppen' (main.js: zuruecksetzen(i) – das Auto hat dann resetProzent)
//   schaden.zerstoeren()   Rauch entfernen, Fahrwerte zurück auf die Basis
// Stufen: je volle 20 % Verlust +1 → vMax × (1 − 0,04·Stufe), Beschleunigung × (1 − 0,06·Stufe), Grip × (1 − 0,03·Stufe).
// vehicle.js bleibt unverändert: vehicle.datenBasis = Kopie der Original-Fahrwerte, vehicle.daten wird als neue
// Objekt-Kopie mit den Faktoren gesetzt. an = false → keine Wirkung, keine Kopie, keine Effekte (Tests!).
//
//   Rennspiel.Schaden.wrackGruppe(strecke, hindernisse) → THREE.Group (von trackBuilder.hindernisseBauen genutzt):
//   Katalog-Auto schräg am Rand, Warnblinker (Rück- + Scheinwerfer orange im 0,5-s-Takt), Warndreieck davor;
//   'brand': verkohlte Karosserie, 3 flackernde Flammen (additive Sprites), Glut am Boden, Rauchsäule (Points).
//   Animiert sich selbst über onBeforeRender (Uhr performance.now) – die Gruppe darf statisch vorbereitet sein.
// Logikteil ohne Three.js (Node-Tests: tests/test_schaden.js).
// ============================================================
(function () {
  const R = window.Rennspiel;

  function cfg() { return (R.config && R.config.schaden) || {}; }
  function wert(x, std) { return x === undefined ? std : x; }
  const ORANGE = 0xffa21a, ORANGE_AUS = 0x5a3200;

  /** Faktoren der Schadensstufe (rein, auch für Tests). */
  function faktoren(stufe) {
    const C = cfg();
    return {
      vMax: 1 - wert(C.vMaxJeStufe, 0.04) * stufe,
      beschleunigung: 1 - wert(C.beschleunigungJeStufe, 0.06) * stufe,
      grip: 1 - wert(C.gripJeStufe, 0.03) * stufe,
    };
  }

  // ---------------------------------------------------------- Texturen (einmal, gecacht)
  const tex = {};
  /** Weicher runder Fleck (Rauch-Teilchen). */
  function rauchTextur() {
    if (tex.rauch !== undefined) return tex.rauch;
    tex.rauch = null;
    if (typeof document === 'undefined' || typeof THREE === 'undefined') return null;
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d');
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, 'rgba(255,255,255,1)'); grad.addColorStop(0.45, 'rgba(255,255,255,0.7)'); grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad; g.fillRect(0, 0, 64, 64);
    tex.rauch = new THREE.CanvasTexture(c);
    return tex.rauch;
  }
  /** Flamme: Tropfenform, innen gelb-weiß, außen orange-rot, nach oben spitz (für additive Sprites). */
  function flammenTextur() {
    if (tex.flamme !== undefined) return tex.flamme;
    tex.flamme = null;
    if (typeof document === 'undefined' || typeof THREE === 'undefined') return null;
    const c = document.createElement('canvas'); c.width = 64; c.height = 128;
    const g = c.getContext('2d');
    const tropfen = (breite, farbe) => {
      g.beginPath();
      g.moveTo(32, 4);
      g.bezierCurveTo(32 + breite * 0.35, 40, 32 + breite, 70, 32 + breite * 0.8, 100);
      g.bezierCurveTo(32 + breite * 0.6, 124, 32 - breite * 0.6, 124, 32 - breite * 0.8, 100);
      g.bezierCurveTo(32 - breite, 70, 32 - breite * 0.35, 40, 32, 4);
      g.fillStyle = farbe; g.fill();
    };
    g.filter = 'blur(3px)';
    tropfen(30, 'rgba(255,60,0,0.75)');
    tropfen(22, 'rgba(255,140,10,0.9)');
    tropfen(13, 'rgba(255,220,80,1)');
    tropfen(6, 'rgba(255,255,220,1)');
    tex.flamme = new THREE.CanvasTexture(c);
    return tex.flamme;
  }
  /** Runder Glutfleck (Boden unter dem Feuer). */
  function glutTextur() {
    if (tex.glut !== undefined) return tex.glut;
    tex.glut = null;
    if (typeof document === 'undefined' || typeof THREE === 'undefined') return null;
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d');
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, 'rgba(255,150,40,0.9)'); grad.addColorStop(0.5, 'rgba(255,80,0,0.35)'); grad.addColorStop(1, 'rgba(255,40,0,0)');
    g.fillStyle = grad; g.fillRect(0, 0, 64, 64);
    tex.glut = new THREE.CanvasTexture(c);
    return tex.glut;
  }

  /** Kleiner deterministischer Zufall (für feste Teilchen-Startwerte). */
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
  function jetzt() { return (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000; }

  // ============================================================ Schaden
  class Schaden {
    /**
     * @param {Array} fahrzeuge Vehicles oder Einträge { vehicle, mesh } (main.js: this.fahrzeuge)
     * @param {{an?:boolean}} [opt] an = Schaden-Einstellung (Standard config.schaden.standardAn = aus)
     */
    constructor(fahrzeuge, opt) {
      const o = opt || {};
      this.an = o.an !== undefined ? !!o.an : !!cfg().standardAn;
      this.fahrzeuge = fahrzeuge || [];
      this.z = this.fahrzeuge.map(() => ({ punkte: 100, stufe: 0, abkling: 0, liegen: 0, liegengeblieben: false }));
      this._hoerer = [];
      this._effekte = [];
      this._uhr = 0;
      if (this.an) this.fahrzeuge.forEach((f, i) => this._basisMerken(i));
    }

    _v(i) { const f = this.fahrzeuge[i]; return f && f.vehicle ? f.vehicle : f; }

    /** Original-Fahrwerte einmal ablegen (vehicle.datenBasis). */
    _basisMerken(i) {
      const v = this._v(i);
      if (v && v.daten && !v.datenBasis) v.datenBasis = Object.assign({}, v.daten);
    }

    /** Ereignis-Hörer: fn({ art, i, stufe, prozent }). */
    bei(fn) { if (typeof fn === 'function') this._hoerer.push(fn); }
    _melden(art, i) {
      const z = this.z[i], e = { art, i, stufe: z.stufe, prozent: z.punkte };
      for (const fn of this._hoerer) { try { fn(e); } catch (err) { if (typeof console !== 'undefined') console.error(err); } }
    }

    /** Stufe aus Prozent: je volle stufeJe (20) Prozentpunkte Verlust +1. */
    static stufeAus(punkte) {
      const je = wert(cfg().stufeJe, 20);
      return Math.floor((100 - punkte) / je + 1e-9);
    }

    /** vehicle.daten = Kopie mit den Faktoren der aktuellen Stufe (Basis = vehicle.datenBasis). */
    _anwenden(i) {
      const v = this._v(i);
      if (!v || !v.daten) return;
      this._basisMerken(i);
      const b = v.datenBasis, f = faktoren(this.z[i].stufe);
      v.daten = Object.assign({}, v.daten, { vMax: b.vMax * f.vMax, beschleunigung: b.beschleunigung * f.beschleunigung, grip: b.grip * f.grip });
    }

    /** Prozent setzen (0..100) und Stufe/Faktoren nachziehen; meldet 'stufe' bei Wechsel. */
    _punkteSetzen(i, punkte) {
      const z = this.z[i];
      z.punkte = Math.max(0, Math.min(100, Math.round(punkte)));
      const stufe = Schaden.stufeAus(z.punkte);
      if (stufe !== z.stufe) { z.stufe = stufe; this._anwenden(i); this._melden('stufe', i); }
    }

    /**
     * Treffer für Fahrzeug i. art: bande|auto|hindernis|brand|ball|wasser|stroh, staerke in m/s.
     * @returns {number} verlorene Prozentpunkte (0 = kein Abzug: aus, Abklingzeit, zu schwach, liegengeblieben)
     */
    treffer(i, art, staerke, zuschlag) {
      if (!this.zaehlt(i, art, staerke)) return 0;
      const z = this.z[i], C = cfg();
      // Runde 6: eigene Verluste je Art (config.schaden.verluste: bande/pflanze −3 %), zuschlag = z. B. Drehung +3
      const vj = (C.verluste || {})[art];
      const verlust = (art === 'brand' ? wert(C.brandVerlust, 10) : wert(vj, wert(C.trefferVerlust, 5))) + (zuschlag || 0);
      const vorher = z.punkte;
      z.abkling = wert(C.abklingZeit, 0.7);
      this._punkteSetzen(i, vorher - verlust);
      this._melden('treffer', i);
      if (z.punkte <= 0) this._liegenbleiben(i);
      return vorher - z.punkte;
    }

    /**
     * Würde ein Treffer (art, staerke) für Fahrzeug i jetzt Prozent kosten? (gleiche Bedingungen wie treffer(),
     * ohne etwas zu ändern – main.js fragt das vor dem Schutzschild ab.)
     */
    zaehlt(i, art, staerke) {
      if (!this.an) return false;
      const z = this.z[i];
      if (!z || z.liegengeblieben || z.abkling > 0 || z.punkte <= 0) return false;
      const min = (cfg().mindest || {})[art];
      return (staerke || 0) >= wert(min, 0);
    }

    /** Treffer abgefangen (Schutzschild): Fahrzeug i ist für eine Abklingzeit geschützt, kein Abzug. */
    abfangen(i) {
      const z = this.z[i];
      if (z) z.abkling = Math.max(z.abkling, wert(cfg().abklingZeit, 0.7));
    }

    _liegenbleiben(i) {
      const z = this.z[i], v = this._v(i);
      z.liegengeblieben = true;
      z.liegen = wert(cfg().liegenZeit, 5);
      if (v) { v.vLaengs = 0; v.vQuer = 0; }
      this._melden('liegengeblieben', i);
    }

    /**
     * Alle Stöße eines Physikschritts auf einmal auswerten.
     * @param {{bande?:number[], auto?:Array, hindernis?:Array, dynamik?:Array}} st
     *   bande: Aufprallstärke je Fahrzeug (Rückgabe von Kollisionen.bande), auto: autoAuto()-Stöße {a,b,staerke},
     *   hindernis: Kollisionen.hindernisse()-Stöße {nr,typ,staerke} (typ 'brand' → −10 %), dynamik: {nr,typ,staerke},
     *   Runde 6: pflanzen: Kollisionen.pflanzen()-Stöße (typ 'baum' → −3 %, 'busch' → nichts), auto[].dreht → +3 %
     */
    stoesseAuswerten(st) {
      if (!this.an || !st) return;
      (st.bande || []).forEach((s, i) => { if (s > 0) this.treffer(i, 'bande', s); });
      // Runde 6: Rempler mit Drehung (s.dreht[0] = a, [1] = b) kostet zusätzlich drehungVerlust (3 %) im selben Treffer
      const dz = wert(cfg().drehungVerlust, 3);
      (st.auto || []).forEach((s) => {
        this.treffer(s.a, 'auto', s.staerke, s.dreht && s.dreht[0] ? dz : 0);
        this.treffer(s.b, 'auto', s.staerke, s.dreht && s.dreht[1] ? dz : 0);
      });
      (st.pflanzen || []).forEach((s) => { if (s.typ === 'baum') this.treffer(s.nr, 'pflanze', s.staerke); });   // Busch: kein Schaden
      (st.hindernis || []).forEach((s) => this.treffer(s.nr, s.typ === 'brand' ? 'brand' : 'hindernis', s.staerke));
      (st.dynamik || []).forEach((s) => this.treffer(s.nr, s.typ === 'wasser' ? 'wasser' : s.typ === 'ball' ? 'ball' : 'stroh', s.staerke));
    }

    /** Logik-Uhr (Physikschritt): Abklingzeit, Liegenbleiben → Abschleppen mit resetProzent. */
    schritt(dt) {
      if (!this.an) return;
      this._uhr += dt;
      for (let i = 0; i < this.z.length; i++) {
        const z = this.z[i];
        if (z.abkling > 0) z.abkling = Math.max(0, z.abkling - dt);
        if (z.liegengeblieben) {
          const v = this._v(i);
          if (v) { v.vLaengs = 0; v.vQuer = 0; }          // eingefroren (auch gegen Schieben)
          const halb = wert(cfg().liegenZeit, 5) / 2, vorher = z.liegen;
          z.liegen -= dt;
          if (vorher > halb && z.liegen <= halb) this._melden('abschleppwagen', i);
          if (z.liegen <= 1e-9) {
            z.liegen = 0; z.liegengeblieben = false; z.abkling = wert(cfg().abklingZeit, 0.7);
            this._punkteSetzen(i, wert(cfg().resetProzent, 60));
            this._melden('abschleppen', i);
          }
        }
      }
    }

    /** true = Fahrzeug i ist liegengeblieben (Steuerung ignorieren, nicht bewegen). */
    gesperrt(i) { const z = this.z[i]; return !!(this.an && z && z.liegengeblieben); }

    /** Zustand für HUD/Tests: { prozent, stufe, liegengeblieben, rest (s bis Abschleppen), rauch 0..1, qualm }. */
    zustand(i) {
      const z = this.z[i] || { punkte: 100, stufe: 0, liegengeblieben: false, liegen: 0 };
      const C = cfg(), rauchUnter = wert(C.rauchUnter, 40), qualmUnter = wert(C.qualmUnter, 20);
      const p = this.an ? z.punkte : 100;
      return {
        prozent: p, stufe: this.an ? z.stufe : 0, liegengeblieben: this.an && z.liegengeblieben, rest: z.liegen,
        rauch: p < rauchUnter ? Math.min(1, (rauchUnter - p) / rauchUnter + 0.25) : 0,
        qualm: p < qualmUnter, warnblinker: this.an && (p < qualmUnter || z.liegengeblieben),
      };
    }

    // ---------------------------------------------------------- Optik (braucht THREE)

    /**
     * Rauch-Teilchen an das Auto-Mesh hängen (lokal: Motorhaube vorne, Front bei −z).
     * Ohne mesh-Argument: this.fahrzeuge[i].mesh. an = false oder ohne THREE: nichts.
     */
    meshBauen(i, mesh) {
      if (!this.an || typeof THREE === 'undefined') return null;
      const f = this.fahrzeuge[i], m = mesh || (f && f.mesh);
      if (!m || this._effekte[i]) return this._effekte[i] || null;
      const v = this._v(i), L = (v && v.daten && v.daten.laenge) || 4.4;
      const n = wert(cfg().rauchTeilchen, 36), rnd = zufall(31 + i * 7);
      const pos = new Float32Array(n * 3), farb = new Float32Array(n * 3);
      const teilchen = [];
      for (let k = 0; k < n; k++) teilchen.push({ t0: rnd(), wx: (rnd() - 0.5) * 0.6, wz: (rnd() - 0.5) * 0.5, auf: 0.8 + rnd() * 0.6 });
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geo.setAttribute('color', new THREE.BufferAttribute(farb, 3));
      const mat = new THREE.PointsMaterial({ size: 1.3, sizeAttenuation: true, map: rauchTextur(), vertexColors: true,
        transparent: true, opacity: 0.6, depthWrite: false });
      const pts = new THREE.Points(geo, mat);
      pts.name = 'schadenRauch'; pts.frustumCulled = false; pts.visible = false;
      // Motorhaube: Front bei −z, etwa 60 % der halben Länge nach vorne, knapp über Haubenhöhe
      const anker = { x: 0, y: 1.0, z: -L / 2 * 0.6 };
      // Feste Hüllkugel (lokal, deckt die ganze Rauchfahne ab) → außerhalb des Bildes kein Draw-Call (Integration Runde 4)
      geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, anker.y + 2.5, anker.z + 4), 9);
      pts.frustumCulled = true;
      m.add(pts);
      // Scheinwerfer bekommen ein eigenes Material (das Original ist für alle Autos geteilt), damit sie blinken können
      const ud = m.userData || {};
      const swMat = (ud.scheinwerfer && ud.scheinwerfer.length) ? ud.scheinwerfer[0].material : null;
      const eigenSw = swMat ? swMat.clone() : null;
      if (eigenSw) ud.scheinwerfer.forEach((s) => { s.material = eigenSw; });
      this._effekte[i] = { pts, geo, mat, teilchen, anker, mesh: m, swMat, eigenSw, swFarbe: eigenSw ? eigenSw.color.getHex() : 0, blinkAn: false };
      return this._effekte[i];
    }

    /** Optik je Frame: Rauch (Menge/Farbe nach Prozent), Warnblinker (Rück- + Scheinwerfer orange). */
    update(dt) {
      if (!this.an) return;
      this._optikZeit = (this._optikZeit || 0) + (dt || 0);
      const t = this._optikZeit, takt = wert(cfg().blinkTakt, 0.5);
      for (let i = 0; i < this._effekte.length; i++) {
        const e = this._effekte[i];
        if (!e) continue;
        const zs = this.zustand(i), v = this._v(i);
        // --- Rauch ---
        const staerke = zs.liegengeblieben ? 1 : zs.rauch;
        e.pts.visible = staerke > 0;
        if (staerke > 0) {
          const n = e.teilchen.length, aktiv = Math.max(4, Math.round(n * staerke));
          const pos = e.geo.attributes.position.array, col = e.geo.attributes.color.array;
          const tempo = v ? Math.max(0, v.vLaengs) : 0, zurueck = 1.2 + tempo * 0.12;
          // hell (Rauch) → dunkel (Qualm); liegengeblieben: fast schwarz
          // (Vertex-Farben sind linear: 0,03 ≈ dunkles Grau auf dem Bildschirm)
          const grau = zs.liegengeblieben ? 0.025 : zs.qualm ? 0.06 : 0.5;
          for (let k = 0; k < n; k++) {
            const p = e.teilchen[k];
            const u = ((t * 0.9 * p.auf + p.t0) % 1);
            if (k >= aktiv) { pos[k * 3 + 1] = -50; continue; }
            pos[k * 3] = e.anker.x + p.wx * (1 + u * 3);
            pos[k * 3 + 1] = e.anker.y + u * (1.6 + 1.6 * staerke) * p.auf;
            pos[k * 3 + 2] = e.anker.z + p.wz + u * zurueck * 2.2;     // nach hinten weg (+z = Heck)
            const c = grau + u * (zs.qualm || zs.liegengeblieben ? 0.12 : 0.3);
            col[k * 3] = col[k * 3 + 1] = col[k * 3 + 2] = Math.min(1, c);
          }
          e.geo.attributes.position.needsUpdate = true;
          e.geo.attributes.color.needsUpdate = true;
          e.mat.size = 0.9 + staerke * 1.4 + (zs.qualm ? 0.6 : 0);
          e.mat.opacity = 0.45 + 0.35 * staerke;
        }
        // --- Warnblinker (überschreibt das Bremslicht von main.js, daher NACH setzeBremslicht aufrufen) ---
        const ud = e.mesh.userData || {};
        if (zs.warnblinker) {
          const an = Math.floor(t / takt) % 2 === 0;
          if (ud.bremslichtMaterial) ud.bremslichtMaterial.color.setHex(an ? ORANGE : ORANGE_AUS);
          if (e.eigenSw) e.eigenSw.color.setHex(an ? ORANGE : ORANGE_AUS);
          e.blinkAn = true;
        } else if (e.blinkAn) {
          if (e.eigenSw) e.eigenSw.color.setHex(e.swFarbe);
          e.blinkAn = false;            // Bremslicht setzt main.js im nächsten Frame wieder selbst
        }
      }
    }

    /** Rauch entfernen, Scheinwerfer-Material zurück, Fahrwerte auf die Basis. */
    zerstoeren() {
      this._effekte.forEach((e) => {
        if (!e) return;
        if (e.pts.parent) e.pts.parent.remove(e.pts);
        e.geo.dispose(); e.mat.dispose();
        const ud = e.mesh.userData || {};
        if (e.eigenSw && e.swMat && ud.scheinwerfer) { ud.scheinwerfer.forEach((s) => { s.material = e.swMat; }); e.eigenSw.dispose(); }
      });
      this._effekte = [];
      this.fahrzeuge.forEach((f, i) => {
        const v = this._v(i);
        if (v && v.datenBasis) { v.daten = Object.assign({}, v.datenBasis); delete v.datenBasis; }
      });
      this._hoerer = [];
    }
  }
  Schaden.faktoren = faktoren;

  // ============================================================ Wracks (Grafik)

  /**
   * Gruppe 'Wracks' für die Hindernisse typ 'wrack'/'brand' (aus Kollisionen.wracksEinbauen).
   * @param {Strecke} strecke
   * @param {Array} liste Hindernisse (nur wrack/brand)
   */
  Schaden.wrackGruppe = function (strecke, liste) {
    const g = new THREE.Group();
    g.name = 'Wracks';
    if (!liste || !liste.length) return g;
    const C = (R.config.hindernisse) || {}, sp = strecke.spline;
    const blinkMat = new THREE.MeshBasicMaterial({ color: ORANGE });
    let blinkTakt = (C.wrack && C.wrack.blinkTakt) || 0.5;
    // Warnblinker: Farbe aus der Uhr (zustandslos → in jeder Ansicht gleich)
    const blinken = function () { blinkMat.color.setHex(Math.floor(jetzt() / blinkTakt) % 2 === 0 ? ORANGE : ORANGE_AUS); };
    let verkohlt = null;
    const teile = [];        // Warndreiecke (eine Geometrie mit Vertex-Farben)
    const flammenListe = [], rauchListe = [];
    liste.forEach((h, nr) => {
      const auto = (R.carCatalog || []).find(a => a.id === h.autoId) || (R.carCatalog || [])[0];
      const y = strecke.hoeheAn(h.x, h.z);
      let m;
      try { m = R.carBuilder && auto ? R.carBuilder.bauen(auto) : null; } catch (e) { m = null; }
      if (!m && R.carBuilder) m = R.carBuilder.platzhalterAuto(0x888888);
      if (m) {
        m.name = 'Wrack ' + (h.autoId || '');
        m.position.set(h.x, y, h.z);
        m.rotation.set(0, h.heading, h.typ === 'brand' ? 0.025 : -0.03 * h.seite, 'YXZ');   // leicht schief (Reifen platt)
        const ud = m.userData || {};
        // Warnblinker: Rück- und Scheinwerfer auf das gemeinsame Blink-Material
        (ud.bremslichter || []).concat(ud.scheinwerfer || []).forEach((l) => { l.material = blinkMat; l.onBeforeRender = blinken; });
        if (h.typ === 'brand') {
          if (!verkohlt) verkohlt = new THREE.MeshLambertMaterial({ vertexColors: true, color: 0x3a3330 });
          m.traverse((o) => { if (o.isMesh && (o.name === 'karosserie' || o.name === 'rad')) o.material = verkohlt; });
        }
        g.add(m);
      }
      // Warndreieck auf der Fahrbahn vor dem Wrack (gleiche Seite), schaut den Autos entgegen
      const pd = sp.punktBei(h.dreieckS), qd = h.seitenabstand * 0.8;
      const xd = pd.x + pd.nx * qd, zd = pd.z + pd.nz * qd, yd = strecke.hoeheAn(xd, zd);
      const blick = Math.atan2(-pd.tx, -pd.tz);
      const dreieck = (r, farbe, vor, hinten) => {
        const geo = new THREE.CircleGeometry(r, 3); geo.rotateZ(Math.PI / 2);
        if (hinten) geo.rotateY(Math.PI);
        geo.rotateX(-0.2);                                   // leicht nach hinten geneigt (Aufsteller)
        geo.translate(0, 0, vor); geo.rotateY(blick); geo.translate(xd, yd + 0.42, zd);
        teile.push({ geo, farbe });
      };
      dreieck(0.5, 0xe0201a, 0.0, false); dreieck(0.3, 0x3a3a3a, 0.012, false); dreieck(0.5, 0xb01a14, -0.012, true);
      const fuss = new THREE.BoxGeometry(0.7, 0.04, 0.3); fuss.rotateY(blick); fuss.translate(xd, yd + 0.02, zd);
      teile.push({ geo: fuss, farbe: 0x222222 });
      // Feuer + Rauch
      if (h.typ === 'brand') {
        const cB = C.brand || {}, rnd = zufall(101 + nr * 13);
        const rx = -Math.sin(h.heading), rz = -Math.cos(h.heading), L = h.laengeAuto || 4.5;
        const nF = Math.max(2, Math.min(3, cB.flammen || 3));
        for (let k = 0; k < nF; k++) {
          // Flammen über Motorhaube, Mitte und Heck verteilt (vorne am größten)
          const f = [0.3, -0.05, -0.32][k], groesse = [3.4, 2.7, 2.1][k];
          const sm = new THREE.SpriteMaterial({ map: flammenTextur(), color: k === 0 ? 0xffd27a : 0xffb060,
            blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
          const spr = new THREE.Sprite(sm);
          spr.center.set(0.5, 0.05);
          spr.frustumCulled = false; spr.name = 'Flamme';
          spr.userData.basis = { x: h.x + rx * L * f, y: y + 1.0, z: h.z + rz * L * f, b: groesse * 0.65, h: groesse, phase: rnd() * 10 };
          spr.position.set(spr.userData.basis.x, spr.userData.basis.y, spr.userData.basis.z);
          spr.scale.set(groesse * 0.65, groesse, 1);
          g.add(spr);
          flammenListe.push(spr);
        }
        // Glut am Boden (additiver Fleck, flackert mit)
        const glut = new THREE.Mesh(new THREE.PlaneGeometry(6, 6), new THREE.MeshBasicMaterial({ map: glutTextur(), color: 0xff8030,
          blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
        glut.rotation.x = -Math.PI / 2; glut.position.set(h.x, y + 0.06, h.z); glut.name = 'Glut';
        g.add(glut);
        glut.onBeforeRender = function () {
          const t = jetzt();
          this.material.opacity = 0.65 + 0.25 * Math.sin(t * 13) * Math.sin(t * 7.3);
        };
        // Rauchsäule: Points mit festen Startwerten, Position = Funktion der Uhr (zustandslos)
        const n = cB.rauchTeilchen || 70, hoch = cB.rauchHoehe || 11;
        const pos = new Float32Array(n * 3), col = new Float32Array(n * 3), tl = [];
        for (let k = 0; k < n; k++) tl.push({ t0: rnd(), w: rnd() * Math.PI * 2, r: 0.3 + rnd() * 0.8, tempo: 0.18 + rnd() * 0.12 });
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
        const pts = new THREE.Points(geo, new THREE.PointsMaterial({ size: 3.4, sizeAttenuation: true, map: rauchTextur(),
          vertexColors: true, transparent: true, opacity: 0.6, depthWrite: false }));
        pts.frustumCulled = false; pts.name = 'Wrackrauch';
        pts.userData = { tl, x: h.x, y: y + 1.8, z: h.z, hoch };
        g.add(pts);
        rauchListe.push(pts);
      }
    });
    if (teile.length) {
      const geo = strecke._teileVereinen ? strecke._teileVereinen(teile) : teile[0].geo;
      const m = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }));
      m.name = 'Warndreiecke'; g.add(m);
    }
    // Flammen: Größe pulsiert/flackert (matrixWorld direkt setzen – Gruppe ist statisch vorbereitet)
    const v3 = new THREE.Vector3(), sk = new THREE.Vector3(), q0 = new THREE.Quaternion();
    flammenListe.forEach((spr) => {
      spr.onBeforeRender = function () {
        const b = this.userData.basis, t = jetzt() + b.phase;
        const f = 1 + 0.18 * Math.sin(t * 11) + 0.1 * Math.sin(t * 23.7) + 0.06 * Math.sin(t * 41);
        const fb = 1 + 0.12 * Math.sin(t * 9.1 + 1.3);
        v3.set(b.x + 0.08 * Math.sin(t * 5.3), b.y, b.z + 0.08 * Math.cos(t * 4.1));
        sk.set(b.b * fb, b.h * f, 1);
        this.matrixWorld.compose(v3, q0, sk);
        this.material.opacity = 0.85 + 0.15 * Math.sin(t * 17);
      };
    });
    // Rauch: steigt auf, wird breiter und heller, Wind treibt leicht zur Seite
    rauchListe.forEach((pts) => {
      pts.onBeforeRender = function () {
        const u0 = this.userData, t = jetzt();
        const pos = this.geometry.attributes.position.array, col = this.geometry.attributes.color.array;
        for (let k = 0; k < u0.tl.length; k++) {
          const p = u0.tl[k], u = (t * p.tempo + p.t0) % 1;
          const r = p.r * (0.4 + u * 2.6);
          pos[k * 3] = u0.x + Math.cos(p.w + u * 2) * r + u * u * 2.5;
          pos[k * 3 + 1] = u0.y + u * u0.hoch;
          pos[k * 3 + 2] = u0.z + Math.sin(p.w + u * 2) * r + u * u * 1.2;
          const c = 0.16 + u * 0.38;
          col[k * 3] = c; col[k * 3 + 1] = c; col[k * 3 + 2] = c * 1.02;
        }
        this.geometry.attributes.position.needsUpdate = true;
        this.geometry.attributes.color.needsUpdate = true;
      };
      pts.onBeforeRender.call(pts);
    });
    return g;
  };

  R.Schaden = Schaden;
})();
