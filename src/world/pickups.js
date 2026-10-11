// ============================================================
// Runde 4: Pickups (Welt „Verrückt" + „Fantasie verrückt"): Turbo-Felder und Schutzschild
//
// Katalog (trackCatalog.js, nur wenn aktiveSchichten.boost / .schild):
//   boostFelder: [{ s, seitenabstand, laenge: 12 }] → strecke.boostFelder
//   schilde:     [{ s, seitenabstand }]             → strecke.schilde
// Werte: config.stunt.boost / .schild.
//
// Turbo-Feld: leuchtende, laufend pulsierende Pfeile auf der Fahrbahn. Überfahren (Auto-Mitte im Feld
//   s..s+laenge, |q − seitenabstand| ≤ halbbreite + 0,9 m) → dauer s Turbo: vMax × 1,25, Beschleunigung × 1,5,
//   danach sinkt der vMax-Faktor in auslauf s gleichmäßig auf 1 (kein Tempo-Sprung durch den vMax-Deckel).
//   vehicle.js bleibt unverändert: main.js holt pickups.faktoren(i) = { vMax, beschleunigung } und multipliziert
//   vehicle.daten NUR für den Aufruf von vehicle.schritt (vorher merken, danach exakt zurückschreiben).
//   Flammen-Sprites am Heck während des Turbos.
// Schild: schwebende, rotierende blaue Kugel (Icosaeder, halbtransparent). Aufsammeln (Abstand ≤ radius, Auto ohne
//   Schild) → halbtransparente Hülle um das Auto, hält bis zum nächsten Treffer (Ball/Wasser/Strohballen/Hindernis/
//   Schaden): Treffer wird ignoriert, Hülle platzt. Die Kugel erscheint nach wiederDa s wieder.
//   Schnittstelle: hatSchild(i), schildVerbrauchen(i) → bool (true = Treffer abgefangen).
//   Für Systeme, die den Treffer selbst schon anwenden (dynamik.kollisionen, Kollisionen.hindernisse):
//   vorTreffern(liste) merkt Tempo/Drift der Autos mit Schild, nachTreffern(liste, treffer) verbraucht den Schild,
//   setzt Tempo/Drift zurück und liefert die Treffer ohne die abgefangenen.
// Spieler und KI gleich (die KI fährt nicht gezielt hin; Felder/Kugeln liegen nahe der Ideallinie).
// Ereignisse aus schritt(): [{ nr, typ: 'turbo' | 'schild' }], aus schildVerbrauchen: this.geplatzt [{ nr }].
// Rechenteil ohne Three.js (Node-Tests: tests/test_pickups.js), bauen()/animieren()/zerstoeren() brauchen THREE.
// ============================================================
(function () {
  const R = window.Rennspiel;

  function CB() { return (R.config.stunt && R.config.stunt.boost) || {}; }
  function CS() { return (R.config.stunt && R.config.stunt.schild) || {}; }
  function wert(x, std) { return x === undefined ? std : x; }
  const AUTO_HALB = 0.9;   // m halbe Autobreite (Feld-Treffer am Rand)

  /**
   * Turbo-Felder einer Strecke als Gruppe 'TurboFelder' (statisch; nur die Materialien werden animiert):
   * gelbe Grundfläche + 4 Pfeile je Feld (">" in Fahrtrichtung, additiv leuchtend). Pfeil k nutzt Material k →
   * Lauflicht. Die Materialien liegen danach an strecke._turboMat ({ pfeile: [4], grund }) für Pickups.animieren().
   * Aufruf: trackBuilder.boostBauen() (in bauen()).
   */
  function felderBauen(strecke) {
    const g = new THREE.Group();
    g.name = 'TurboFelder';
    const sp = strecke.spline, hbStd = wert(CB().halbbreite, 2), NP = 4;
    const pfeilMat = [];
    for (let k = 0; k < NP; k++) {
      pfeilMat.push(new THREE.MeshBasicMaterial({ color: 0xffa000, transparent: true, opacity: 0.8, depthWrite: false,
        blending: THREE.AdditiveBlending, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }));
    }
    const grundMat = new THREE.MeshBasicMaterial({ color: 0xffe14a, transparent: true, opacity: 0.32, depthWrite: false,
      side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    const P = (s, q, hoch) => { const p = sp.punktBei(s), x = p.x + p.nx * q, z = p.z + p.nz * q; return [x, strecke.hoeheAn(x, z) + hoch, z]; };
    const geoAus = (dreiecke) => {
      const pos = new Float32Array(dreiecke.length * 9);
      dreiecke.forEach((d, i) => d.forEach((e, j) => pos.set(e, i * 9 + j * 3)));
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      return geo;
    };
    const pfeile = [], grund = [];
    for (let k = 0; k < NP; k++) pfeile.push([]);
    (strecke.boostFelder || []).forEach((e) => {
      const hb = hbStd, L = e.laenge || 12, q0 = e.seitenabstand || 0, s0F = sp.wrapS(e.s);
      // Grundfläche (gelb, schwach) in 4 Stücken längs (folgt Kurve und Höhe)
      for (let i = 0; i < 4; i++) {
        const s0 = s0F + L * i / 4, s1 = s0F + L * (i + 1) / 4;
        const a = P(s0, q0 - hb, 0.05), b = P(s0, q0 + hb, 0.05), c = P(s1, q0 + hb, 0.05), d = P(s1, q0 - hb, 0.05);
        grund.push([a, b, c], [a, c, d]);
      }
      // Pfeile: Spitze vorne, Schenkel 0,9 m (längs) breit
      const lang = L / NP, D = 0.9;
      for (let k = 0; k < NP; k++) {
        const s0 = s0F + lang * k + 0.4, tip = s0 + lang - 0.8;
        [-1, 1].forEach((sg) => {
          const a = P(s0, q0 + sg * (hb - 0.2), 0.08), b = P(s0 + D, q0 + sg * (hb - 0.2), 0.08);
          const c = P(tip + D, q0, 0.08), d = P(tip, q0, 0.08);
          pfeile[k].push([a, b, c], [a, c, d]);
        });
      }
    });
    if (grund.length) {
      const gm = new THREE.Mesh(geoAus(grund), grundMat); gm.name = 'TurboFeldGrund'; g.add(gm);
      pfeile.forEach((liste, k) => { const m = new THREE.Mesh(geoAus(liste), pfeilMat[k]); m.name = 'TurboPfeile' + k; m.renderOrder = 2; g.add(m); });
    }
    strecke._turboMat = { pfeile: pfeilMat, grund: grundMat };
    return g;
  }

  class Pickups {
    /** @param {Strecke} strecke */
    constructor(strecke) {
      const sp = strecke.spline, b = CB(), c = CS();
      this.strecke = strecke;
      this.zeit = 0;
      this.felder = (strecke.boostFelder || []).map((e, nr) => ({
        nr, s: sp.wrapS(e.s), laenge: e.laenge || 12, q: e.seitenabstand || 0, halb: wert(b.halbbreite, 2) }));
      this.kugeln = (strecke.schilde || []).map((e, nr) => {
        const p = sp.punktBei(e.s), q = e.seitenabstand || 0, x = p.x + p.nx * q, z = p.z + p.nz * q;
        return { nr, s: sp.wrapS(e.s), q, x, z, y: strecke.hoeheAn(x, z) + wert(c.hoehe, 1.3), da: true, timer: 0, erschienen: 1 };
      });
      this.autos = [];          // je Fahrzeug-Index: Zustand (siehe _auto)
      this.geplatzt = [];       // [{ nr }] seit dem letzten schritt() (für Ton/HUD)
      this._schnapp = [];
    }

    /** Gibt es überhaupt Pickups auf dieser Strecke/Welt? */
    get aktiv() { return this.felder.length > 0 || this.kugeln.length > 0; }

    _auto(i) {
      let a = this.autos[i];
      if (!a) {
        a = this.autos[i] = { turbo: 0, vFaktor: 1, bFaktor: 1, schild: false, platzt: 0, index: -1, imFeld: -1,
          turbos: 0, schilde: 0, abgefangen: 0, fk: { vMax: 1, beschleunigung: 1 } };
      }
      return a;
    }

    /**
     * Ein Physikschritt (nach den Fahrzeug-Schritten): Timer, Überfahren der Felder, Aufsammeln der Kugeln.
     * @param {number} dt
     * @param {Array} fahrzeugListe Vehicles oder Einträge mit .vehicle (Index = Fahrzeugnummer)
     * @returns {{nr:number, typ:'turbo'|'schild'}[]}
     */
    schritt(dt, fahrzeugListe) {
      const b = CB(), c = CS(), sp = this.strecke.spline, erg = [];
      const dauer = wert(b.dauer, 2.5), vf = wert(b.vMaxFaktor, 1.25), bf = wert(b.beschleunigungFaktor, 1.5);
      const auslaufRate = (vf - 1) / Math.max(0.01, wert(b.auslauf, 2));
      this.zeit += dt;
      this.geplatzt.length = 0;
      for (const k of this.kugeln) {
        if (!k.da) { k.timer -= dt; if (k.timer <= 0) { k.da = true; k.timer = 0; k.erschienen = 0; } }
        else if (k.erschienen < 1) k.erschienen = Math.min(1, k.erschienen + dt * 3);
      }
      const liste = fahrzeugListe || [];
      for (let i = 0; i < liste.length; i++) {
        const f = liste[i], v = f && f.vehicle ? f.vehicle : f;
        if (!v) continue;
        const a = this._auto(i);
        // Turbo-Zeit und Auslauf
        if (a.turbo > 0) {
          a.turbo = Math.max(0, a.turbo - dt);
          if (a.turbo === 0) a.bFaktor = 1;
        } else if (a.vFaktor > 1) a.vFaktor = Math.max(1, a.vFaktor - auslaufRate * dt);
        if (a.platzt > 0) a.platzt = Math.max(0, a.platzt - dt);
        if (v.imLooping || v.imFlug) continue;     // über der Straße: nichts aufsammeln
        if (!this.felder.length && !this.kugeln.length) continue;
        const n = sp.naechster(v.x, v.z, a.index);
        a.index = n.index;
        // Turbo-Felder (einmal je Überfahrt; im Feld wird die Zeit aufgefrischt)
        let imFeld = -1;
        for (const F of this.felder) {
          const ds = sp.differenzS(n.s, F.s);
          if (ds >= 0 && ds <= F.laenge && Math.abs(n.seitenabstand - F.q) <= F.halb + AUTO_HALB) { imFeld = F.nr; break; }
        }
        if (imFeld >= 0) {
          if (a.imFeld !== imFeld) { erg.push({ nr: i, typ: 'turbo' }); a.turbos++; }
          a.turbo = dauer; a.vFaktor = vf; a.bFaktor = bf;
        }
        a.imFeld = imFeld;
        // Schild-Kugeln
        if (!a.schild) {
          const r = wert(c.radius, 2.6);
          for (const k of this.kugeln) {
            if (!k.da) continue;
            const dx = v.x - k.x, dz = v.z - k.z;
            if (dx * dx + dz * dz <= r * r) {
              k.da = false; k.timer = wert(c.wiederDa, 10);
              a.schild = true; a.schilde++;
              erg.push({ nr: i, typ: 'schild' });
              break;
            }
          }
        }
      }
      return erg;
    }

    /**
     * Faktoren für vehicle.daten während vehicle.schritt: { vMax, beschleunigung } (1 = normal).
     * Immer dasselbe Objekt je Auto (nicht speichern, sofort benutzen).
     */
    faktoren(i) {
      const a = this.autos[i];
      if (!a) return { vMax: 1, beschleunigung: 1 };
      a.fk.vMax = a.vFaktor; a.fk.beschleunigung = a.turbo > 0 ? a.bFaktor : 1;
      return a.fk;
    }

    /** Läuft gerade ein Turbo (inkl. Auslauf)? */
    turboAktiv(i) { const a = this.autos[i]; return !!a && (a.turbo > 0 || a.vFaktor > 1.001); }

    /** Hat Auto i einen Schild? */
    hatSchild(i) { const a = this.autos[i]; return !!a && a.schild; }

    /**
     * Treffer auf Auto i: hat es einen Schild, wird er verbraucht (Hülle platzt) und true geliefert → Treffer ignorieren.
     * @returns {boolean}
     */
    schildVerbrauchen(i) {
      const a = this.autos[i];
      if (!a || !a.schild) return false;
      a.schild = false; a.platzt = 0.4; a.abgefangen++;
      this.geplatzt.push({ nr: i });
      return true;
    }

    /** Vor Kollisionsprüfungen, die Treffer selbst anwenden: Tempo/Drift der Autos mit Schild merken. */
    vorTreffern(fahrzeugListe) {
      const s = this._schnapp; s.length = 0;
      (fahrzeugListe || []).forEach((f, i) => {
        const v = f && f.vehicle ? f.vehicle : f;
        if (v && this.hatSchild(i)) s.push({ i, v, vLaengs: v.vLaengs, vQuer: v.vQuer, heading: v.heading, huepfer: v.huepfer || 0 });
      });
      return s.length;
    }

    /**
     * Nach der Prüfung: Treffer [{ nr, … }] auf Autos mit Schild → Schild verbrauchen, Tempo/Drift/Richtung zurück.
     * Mehrere Treffer desselben Autos im selben Schritt fängt der eine Schild alle ab.
     * @returns {Array} die Treffer, die wirklich zählen
     */
    nachTreffern(fahrzeugListe, treffer) {
      if (!treffer || !treffer.length || !this._schnapp.length) return treffer || [];
      const geschuetzt = new Set();
      const bleiben = treffer.filter((t) => {
        if (geschuetzt.has(t.nr)) return false;
        const m = this._schnapp.find(x => x.i === t.nr);
        if (!m || !this.schildVerbrauchen(t.nr)) return true;
        const v = m.v;
        v.vLaengs = m.vLaengs; v.vQuer = m.vQuer; v.heading = m.heading; v.huepfer = m.huepfer;
        geschuetzt.add(t.nr);
        return false;
      });
      return bleiben;
    }

    /** Neues Rennen / Reset: alle Kugeln da, keine Turbos/Schilde. */
    zuruecksetzen() {
      this.kugeln.forEach((k) => { k.da = true; k.timer = 0; k.erschienen = 1; });
      // Zustand zurück, Grafik-Teile an den Autos behalten (animieren() blendet sie dann aus)
      this.autos.forEach((a) => { if (!a) return; a.turbo = 0; a.vFaktor = 1; a.bFaktor = 1; a.schild = false; a.platzt = 0; a.imFeld = -1; a.index = -1; });
      this.geplatzt.length = 0;
    }

    // ------------------------------------------------------------------ Ton (ohne engine.js zu ändern)

    /** Kurzer Effekt über R.Audio (falls bereit): 'turbo' | 'schild' | 'platzen'. */
    ton(art) {
      const A = R.Audio;
      if (!A || !A._bereit || !A._bereit() || !A._ton) return;
      if (art === 'turbo') {
        A._ton(180, 900, 0.45, 'sawtooth', 0.12, 0);
        A._ton(360, 1400, 0.35, 'triangle', 0.25, 0.05);
      } else if (art === 'schild') {
        A._ton(660, 660, 0.12, 'triangle', 0.35, 0);
        A._ton(990, 990, 0.12, 'triangle', 0.35, 0.09);
        A._ton(1320, 1320, 0.25, 'triangle', 0.3, 0.18);
      } else if (art === 'platzen') {
        A._ton(1400, 300, 0.25, 'square', 0.1, 0);
        if (A._stoss) A._stoss(0.12, 0.35, 'highpass', 1800, 4000, 0.7, 0);
      }
    }

    // ------------------------------------------------------------------ Grafik (THREE)

    /**
     * Schild-Kugeln (+ Turbo-Felder, falls die Strecke sie nicht schon über strecke.boostBauen() gebaut hat)
     * als Gruppe 'Pickups' (in die Szene, nicht statisch: animieren()).
     */
    bauen() {
      const g = new THREE.Group();
      g.name = 'Pickups';
      if (this.felder.length && !this.strecke._turboMat) g.add(felderBauen(this.strecke));
      // --- Schild-Kugeln: Icosaeder halbtransparent + heller Kern
      this._kugelMeshes = [];
      if (this.kugeln.length) {
        const geo = new THREE.IcosahedronGeometry(0.85, 1), kern = new THREE.IcosahedronGeometry(0.4, 0);
        const mat = new THREE.MeshLambertMaterial({ color: 0x3aa0ff, emissive: 0x1450c8, transparent: true, opacity: 0.6, flatShading: true });
        const kmat = new THREE.MeshBasicMaterial({ color: 0xbfe6ff });
        this.kugeln.forEach((k) => {
          const m = new THREE.Mesh(geo, mat); m.name = 'SchildKugel';
          const kk = new THREE.Mesh(kern, kmat); m.add(kk);
          m.position.set(k.x, k.y, k.z);
          g.add(m); this._kugelMeshes.push(m);
        });
      }
      this.gruppe = g;
      return g;
    }

    /** Leuchtende Flamme als Sprite-Textur (radialer Verlauf, einmal erzeugt). */
    _flammenTextur() {
      if (this._flTex) return this._flTex;
      const c = document.createElement('canvas'); c.width = c.height = 64;
      const x = c.getContext('2d'), gr = x.createRadialGradient(32, 32, 2, 32, 32, 30);
      gr.addColorStop(0, 'rgba(255,255,220,1)'); gr.addColorStop(0.3, 'rgba(255,200,40,0.95)');
      gr.addColorStop(0.65, 'rgba(255,90,0,0.55)'); gr.addColorStop(1, 'rgba(255,40,0,0)');
      x.fillStyle = gr; x.fillRect(0, 0, 64, 64);
      this._flTex = new THREE.CanvasTexture(c);
      return this._flTex;
    }

    /** Schild-Hülle + Flammen eines Autos (einmal je Auto, als Kinder des Auto-Meshes). */
    _autoTeile(i, f) {
      const a = this._auto(i);
      if (a.teile && a.teile.parent === f.mesh) return a.teile;
      const v = f.vehicle, L = (v.daten && v.daten.laenge) || 4.4, B = (v.daten && v.daten.breite) || 1.8;
      const t = new THREE.Group(); t.name = 'PickupAutoTeile';
      if (!this._huelleGeo) {
        this._huelleGeo = new THREE.SphereGeometry(1, 24, 16);
        this._huelleMat = new THREE.MeshLambertMaterial({ color: 0x5ab8ff, emissive: 0x1d5ad8, transparent: true, opacity: 0.3,
          depthWrite: false, side: THREE.DoubleSide });
        this._flMat = new THREE.SpriteMaterial({ map: this._flammenTextur(), color: 0xffffff, transparent: true,
          blending: THREE.AdditiveBlending, depthWrite: false });
      }
      const h = new THREE.Mesh(this._huelleGeo, this._huelleMat.clone());
      h.name = 'SchildHuelle'; h.userData.sx = B * 0.85; h.userData.sz = L * 0.62; h.scale.set(B * 0.85, 1.15, L * 0.62); h.position.y = 0.75; h.visible = false;
      h.renderOrder = 3;
      t.add(h);
      const fl = [];
      [-0.45, 0.45].forEach((x) => {
        const sp = new THREE.Sprite(this._flMat); sp.name = 'TurboFlamme'; sp.renderOrder = 4;
        sp.position.set(x * B / 1.8, 0.45, L / 2 + 0.35); sp.scale.set(0.9, 0.9, 1); sp.visible = false;
        t.add(sp); fl.push(sp);
      });
      f.mesh.add(t);
      a.teile = t; a.huelle = h; a.flammen = fl;
      return t;
    }

    /**
     * Darstellung je Frame: Pfeile pulsieren (Lauflicht), Kugeln schweben/drehen (weg = unsichtbar), Hülle + Flammen
     * an den Autos. fahrzeugListe = Einträge mit { vehicle, mesh } (main.js: this.fahrzeuge).
     */
    animieren(zeit, fahrzeugListe) {
      const t = zeit === undefined ? this.zeit : zeit;
      const tm = this.strecke._turboMat;
      if (tm) {
        tm.pfeile.forEach((m, k) => { m.opacity = 0.25 + 0.75 * (0.5 + 0.5 * Math.sin(t * 9 - k * 1.3)); });
        tm.grund.opacity = 0.26 + 0.12 * Math.sin(t * 4);
      }
      if (this._kugelMeshes) this.kugeln.forEach((k, i) => {
        const m = this._kugelMeshes[i];
        m.visible = k.da;
        if (!k.da) return;
        const e = k.erschienen < 1 ? k.erschienen : 1;
        m.position.y = k.y + 0.25 * Math.sin(t * 2.2 + k.nr * 1.7);
        m.rotation.set(t * 0.7, t * 1.6 + k.nr, 0);
        m.scale.setScalar(0.2 + 0.8 * e);
      });
      (fahrzeugListe || []).forEach((f, i) => {
        const a = this.autos[i];
        if (!a || !f || !f.mesh) return;
        if (!a.teile && !a.schild && !(a.turbo > 0) && !(a.platzt > 0)) return;
        this._autoTeile(i, f);
        // Schild-Hülle: sichtbar mit Schild, beim Platzen größer werden und verblassen
        const h = a.huelle;
        if (a.schild) {
          h.visible = true; h.material.opacity = 0.26 + 0.08 * Math.sin(t * 6 + i);
          const s = 1 + 0.03 * Math.sin(t * 5 + i); h.scale.set(h.userData.sx * s, 1.15 * s, h.userData.sz * s);
        } else if (a.platzt > 0) {
          const u = 1 - a.platzt / 0.4;
          h.visible = true; h.material.opacity = 0.45 * (1 - u);
          h.scale.set(h.userData.sx * (1 + u), 1.15 * (1 + u), h.userData.sz * (1 + u));
        } else h.visible = false;
        // Flammen: im Turbo voll, im Auslauf kleiner
        const an = a.turbo > 0 ? 1 : (a.vFaktor > 1.001 ? 0.45 : 0);
        a.flammen.forEach((sp, k) => {
          sp.visible = an > 0;
          if (!an) return;
          const fl = 0.75 + 0.25 * Math.sin(t * 37 + k * 2.1) + 0.15 * Math.sin(t * 23 + k);
          sp.scale.set(0.7 * fl * an + 0.2, (0.9 * fl + 0.15) * an + 0.2, 1);
        });
      });
    }

    /** Teile an den Auto-Meshes entfernen und Speicher freigeben (vor szeneAbbauen aufrufen). */
    zerstoeren() {
      this.autos.forEach((a) => {
        if (a && a.teile) {
          if (a.teile.parent) a.teile.parent.remove(a.teile);
          if (a.huelle) a.huelle.material.dispose();
          a.teile = null;
        }
      });
      if (this._huelleGeo) { this._huelleGeo.dispose(); this._huelleMat.dispose(); this._flMat.dispose(); this._huelleGeo = null; }
      if (this._flTex) { this._flTex.dispose(); this._flTex = null; }
      // Die Gruppe 'Pickups' (Felder, Kugeln) gibt szeneAbbauen frei (liegt in der Szene).
    }
  }

  Pickups.felderBauen = felderBauen;
  R.Pickups = Pickups;
})();
