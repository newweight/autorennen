// ============================================================
// Strecke: Logik (Untergrund, Höhe, Startaufstellung, Checkpoints,
// Ideallinien-Tempo) und Grafik (bauen()).
// Nur bauen() braucht Three.js – alles andere läuft auch in Node-Tests.
//
// Heading-Konvention wie vehicle.js: heading 0 = Richtung -z,
// richtung() = { x: -sin h, z: -cos h }, Linkslenken erhöht heading.
// ============================================================
(function () {
  const R = window.Rennspiel;

  // Ideallinie (für die Computerfahrer in Abschnitt 5)
  const A_QUER_MAX = 7;     // m/s² erlaubte Querbeschleunigung
  const A_BREMS = 8;        // m/s² Bremsverzögerung vor Kurven
  const V_DECKEL = 45;      // m/s Höchsttempo der Ideallinie
  const KERB_KRUEMMUNG = 1 / 150;  // ab hier rot-weiße Randsteine

  /** Heading (wie vehicle.js) aus einer Richtung in XZ. */
  function headingAus(tx, tz) { return Math.atan2(-tx, -tz); }

  class Strecke {
    /** @param {object} daten Eintrag aus Rennspiel.trackCatalog */
    constructor(daten) {
      this.daten = daten;
      this.id = daten.id;
      this.name = daten.name;
      this.thema = daten.thema;
      this.breite = daten.breite;
      this.randBreite = daten.randBreite;
      this.huegel = daten.huegel || [];
      this.abseitsUntergrund = daten.abseitsUntergrund || 'gras';   // 'gras' | 'sand'
      this.bruecke = daten.bruecke || null;                          // { von, bis } Bogenlänge
      this.spline = new R.Spline(daten.punkte, { abstand: 2 });
      this.laenge = this.spline.laenge;
      // Unsichtbare weiche Bande (physics/collisions.js) + sichtbarer Holzzaun genau dort
      this.zaunAbstand = daten.zaunAbstand || 18;   // m ab Straßenrand
      this.seitenabstandMax = this.breite / 2 + this.zaunAbstand;
      this.checkpoints = this._checkpointsBerechnen(daten.checkpointAbstand || 120);
      this.idealLinie = this._idealLinieBerechnen();
    }

    // ---------------------------------------------------------- Abfragen

    /** Geländehöhe aus den Hügeln (gilt auf und neben der Strecke). */
    gelaendeHoehe(x, z) {
      let h = 0;
      for (const g of this.huegel) {
        const dx = x - g.x, dz = z - g.z;
        h += g.h * Math.exp(-(dx * dx + dz * dz) / (2 * g.r * g.r));
      }
      return h;
    }

    /** Höhe des Bodens / der Straße an (x, z). */
    hoeheAn(x, z, startIndex) {
      if (this.huegel.length) return this.gelaendeHoehe(x, z);
      return this.spline.hoeheBei(x, z, startIndex);
    }

    /** Liegt Bogenlänge s auf der Brücke (Holzsteg)? */
    _aufBruecke(s) {
      const b = this.bruecke;
      return !!b && s >= b.von && s <= b.bis;
    }

    /** Untergrund aus Seitenabstand (+ Bogenlänge s für die Brücke). */
    _untergrundAus(seitenabstand, s) {
      const a = Math.abs(seitenabstand);
      if (a <= this.breite / 2) return 'strasse';
      if (a <= this.breite / 2 + this.randBreite) return 'rand';
      // Holzsteg: bis zum Geländer fährt man auf Brettern (wie Randstreifen)
      if (s !== undefined && this._aufBruecke(s) && a <= this.seitenabstandMax) return 'rand';
      return this.abseitsUntergrund;
    }

    /** 'strasse' | 'rand' | 'gras' | 'sand'. startIndex (optional) beschleunigt die Suche. */
    untergrundAn(x, z, startIndex) {
      const n = this.spline.naechster(x, z, startIndex);
      return this._untergrundAus(n.seitenabstand, n.s);
    }

    /** Alles auf einmal: naechster()-Ergebnis + untergrund (für die Spielschleife). */
    abfrage(x, z, startIndex) {
      const n = this.spline.naechster(x, z, startIndex);
      n.untergrund = this._untergrundAus(n.seitenabstand, n.s);
      return n;
    }

    /** Ziel-Tempo der Ideallinie an Bogenlänge s (m/s). */
    tempoBei(s) {
      const sp = this.spline, N = sp.anzahl;
      const f = sp.wrapS(s) / sp.ds, i = Math.floor(f) % N, w = f - Math.floor(f);
      return this.idealLinie[i] + (this.idealLinie[(i + 1) % N] - this.idealLinie[i]) * w;
    }

    /**
     * Startaufstellung: 2 Spalten gestaffelt hinter der Startlinie,
     * Pole-Position vorne rechts.
     * @returns {{x:number, z:number, heading:number}[]}
     */
    startpositionen(n) {
      const liste = [];
      for (let i = 0; i < n; i++) {
        const reihe = Math.floor(i / 2), links = i % 2 === 1;
        const hinter = 8 + reihe * 9 + (links ? 4.5 : 0);
        const p = this.spline.punktBei(-hinter);
        const q = links ? -3.5 : 3.5;
        liste.push({ x: p.x + p.nx * q, z: p.z + p.nz * q, heading: headingAus(p.tx, p.tz) });
      }
      return liste;
    }

    _checkpointsBerechnen(abstand) {
      const anzahl = Math.max(3, Math.round(this.laenge / abstand));
      const liste = [];
      for (let k = 0; k < anzahl; k++) {
        const s = k * this.laenge / anzahl;
        const p = this.spline.punktBei(s);
        liste.push({ nr: k, s, x: p.x, z: p.z, tx: p.tx, tz: p.tz, nx: p.nx, nz: p.nz });
      }
      return liste;   // Checkpoint 0 = Start/Ziel
    }

    /**
     * Ziel-Tempo je Abtastpunkt: v = sqrt(aQuer / |Krümmung|), gedeckelt,
     * dann rückwärts geglättet, damit vor Kurven rechtzeitig gebremst wird.
     */
    _idealLinieBerechnen() {
      const pk = this.spline.punkte, N = pk.length, ds = this.spline.ds;
      const v = new Array(N);
      for (let i = 0; i < N; i++) {
        // stärkste Krümmung in ±3 Punkten (Kurveneingang nicht unterschätzen)
        let k = 0;
        for (let j = -3; j <= 3; j++) k = Math.max(k, Math.abs(pk[(i + j + N) % N].kruemmung));
        v[i] = Math.min(V_DECKEL, Math.sqrt(A_QUER_MAX / Math.max(k, 1e-6)));
      }
      // zweimal rückwärts herum (Rundkurs: Kurve nach Start wirkt auf das Ende)
      for (let runde = 0; runde < 2; runde++) {
        for (let i = N - 1; i >= 0; i--) {
          const naechstes = v[(i + 1) % N];
          v[i] = Math.min(v[i], Math.sqrt(naechstes * naechstes + 2 * A_BREMS * ds));
        }
      }
      return v;
    }

    // ---------------------------------------------------------- Grafik

    /** Baut die Strecke als THREE.Group (Boden, Straße, Linien, Randsteine, Start/Ziel). */
    bauen() {
      const gruppe = new THREE.Group();
      gruppe.name = 'Strecke ' + this.name;
      const thema = (R.themes && R.themes[this.thema]) || {};
      gruppe.add(this._bodenBauen(thema.boden !== undefined ? thema.boden : 0x5f9e3a, thema.boden2));
      gruppe.add(this._strasseBauen(thema.asphalt || 0x3c3f45));
      gruppe.add(this._mittellinieBauen());
      gruppe.add(this._randBauen());
      gruppe.add(this._startZielBauen());
      gruppe.add(this._startbogenBauen());
      gruppe.add(this._zaunBauen(thema.zaun || {}));
      if (this.bruecke) gruppe.add(this._brueckeBauen());
      return gruppe;
    }

    /** Lambert-Material, leicht zur Kamera gezogen gegen Flimmern (z-fighting). */
    _material(farbe, versatz) {
      return new THREE.MeshLambertMaterial({
        color: farbe === undefined ? 0xffffff : farbe,
        vertexColors: farbe === undefined,
        polygonOffset: versatz > 0, polygonOffsetFactor: -versatz, polygonOffsetUnits: -versatz,
      });
    }

    /** Punkt neben der Mittellinie (q > 0 = rechts) inkl. Höhe + Anhebung. */
    _seitPunkt(p, q, anheben) {
      const x = p.x + p.nx * q, z = p.z + p.nz * q;
      return [x, this.hoeheAn(x, z) + anheben, z];
    }

    /** Liste von Vierecken (je 4 Ecken + Farbe) → BufferGeometry (nicht indiziert). */
    _viereckeZuGeometrie(vierecke) {
      const pos = new Float32Array(vierecke.length * 18);
      const col = new Float32Array(vierecke.length * 18);
      const c = new THREE.Color();
      let o = 0;
      for (const v of vierecke) {
        c.set(v.farbe);
        // a b c d gegen den Uhrzeigersinn von oben gesehen: a-b-c, a-c-d
        for (const e of [v.a, v.b, v.c, v.a, v.c, v.d]) {
          pos[o] = e[0]; pos[o + 1] = e[1]; pos[o + 2] = e[2];
          col[o] = c.r; col[o + 1] = c.g; col[o + 2] = c.b;
          o += 3;
        }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      g.computeVertexNormals();
      return g;
    }

    /**
     * Viereck zwischen Querschnitt p (Anfang) und q (Ende), seitlich von qa bis qb.
     * Reihenfolge so, dass die Fläche nach oben zeigt.
     */
    _band(p, q, qa, qb, anheben, farbe) {
      return {
        a: this._seitPunkt(p, qa, anheben), b: this._seitPunkt(p, qb, anheben),
        c: this._seitPunkt(q, qb, anheben), d: this._seitPunkt(q, qa, anheben), farbe,
      };
    }

    /** Boden: Grundfarbe, optional mit großen Flecken in Farbe 2 (Nadelboden, Sandwellen). */
    _bodenBauen(farbe, farbe2) {
      // Mittelpunkt der Strecke
      let mx = 0, mz = 0;
      const pk = this.spline.punkte;
      pk.forEach(p => { mx += p.x; mz += p.z; });
      mx /= pk.length; mz /= pk.length;
      const geo = new THREE.PlaneGeometry(1600, 1600, 160, 160);
      geo.rotateX(-Math.PI / 2);
      const pos = geo.attributes.position;
      const farben = new Float32Array(pos.count * 3);
      const basis = new THREE.Color(farbe), zweite = new THREE.Color(farbe2 !== undefined ? farbe2 : farbe), c = new THREE.Color();
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i) + mx, z = pos.getZ(i) + mz;
        pos.setXYZ(i, x, this.hoeheAn(x, z), z);
        // leichte Farbflecken, damit die Wiese nicht wie Plastik aussieht
        const f = 0.9 + 0.1 * Math.sin(x * 0.047 + Math.sin(z * 0.031) * 2) * Math.cos(z * 0.052 - x * 0.013)
          + 0.04 * Math.sin(x * 0.31 + z * 0.27);
        // Flecken: weiche Mischung zur zweiten Farbe
        const m = farbe2 === undefined ? 0 : Math.max(0, Math.min(1,
          0.5 + 0.9 * Math.sin(x * 0.021 + Math.cos(z * 0.017) * 2.2) * Math.sin(z * 0.025 - x * 0.008 + 1.3)));
        c.copy(basis).lerp(zweite, m).multiplyScalar(f);
        farben[i * 3] = c.r; farben[i * 3 + 1] = c.g; farben[i * 3 + 2] = c.b;
      }
      geo.setAttribute('color', new THREE.BufferAttribute(farben, 3));
      geo.computeVertexNormals();
      const boden = new THREE.Mesh(geo, this._material(undefined, 0));
      boden.name = 'Boden';
      return boden;
    }

    _strasseBauen(asphalt) {
      const pk = this.spline.punkte, N = pk.length, b = this.breite / 2;
      const pos = new Float32Array(N * 2 * 3), col = new Float32Array(N * 2 * 3);
      const c = new THREE.Color();
      for (let i = 0; i < N; i++) {
        const p = pk[i];
        const l = this._seitPunkt(p, -b, 0.06), r = this._seitPunkt(p, b, 0.06);
        pos.set(l, i * 6); pos.set(r, i * 6 + 3);
        // Asphalt mit leichter Streifung (Flickstellen)
        const f = 1 + 0.05 * Math.sin(i * 0.9) * Math.sin(i * 0.23);
        c.setHex(asphalt).multiplyScalar(f);
        col.set([c.r, c.g, c.b, c.r, c.g, c.b], i * 6);
      }
      const index = [];
      for (let i = 0; i < N; i++) {
        const j = (i + 1) % N;
        const l0 = i * 2, r0 = i * 2 + 1, l1 = j * 2, r1 = j * 2 + 1;
        index.push(l0, r0, r1, l0, r1, l1);
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
      geo.setIndex(index);
      geo.computeVertexNormals();
      const m = new THREE.Mesh(geo, this._material(undefined, 1));
      m.name = 'Strasse';
      return m;
    }

    _mittellinieBauen() {
      const sp = this.spline, vierecke = [];
      const strich = 3, luecke = 4, w = 0.14;
      for (let s = 8; s + strich < this.laenge - 6; s += strich + luecke) {
        // Strich in 1-m-Stücken, damit er Kurven folgt
        for (let t = 0; t < strich; t += 1) {
          const p = sp.punktBei(s + t), q = sp.punktBei(s + t + 1);
          vierecke.push(this._band(p, q, -w, w, 0.08, 0xf0f0f0));
        }
      }
      const m = new THREE.Mesh(this._viereckeZuGeometrie(vierecke), this._material(undefined, 2));
      m.name = 'Mittellinie';
      return m;
    }

    _randBauen() {
      const pk = this.spline.punkte, N = pk.length, b = this.breite / 2, rb = this.randBreite;
      const vierecke = [];
      for (let i = 0; i < N; i++) {
        const p = pk[i], q = pk[(i + 1) % N];
        // Kurve? (stärkste Krümmung in ±4 Punkten, damit die Steine nicht flackern)
        let k = 0;
        for (let j = -4; j <= 4; j++) k = Math.max(k, Math.abs(pk[(i + j + N) % N].kruemmung));
        const kurve = k > KERB_KRUEMMUNG;
        const farbe = kurve ? (i % 2 === 0 ? 0xd42a2a : 0xf4f4f4) : 0x8f9294;
        vierecke.push(this._band(p, q, -b - rb, -b, 0.07, farbe));
        vierecke.push(this._band(p, q, b, b + rb, 0.07, farbe));
      }
      const m = new THREE.Mesh(this._viereckeZuGeometrie(vierecke), this._material(undefined, 1));
      m.name = 'Randsteine';
      return m;
    }

    _startZielBauen() {
      const sp = this.spline, b = this.breite / 2, vierecke = [];
      const feld = 1, reihen = 3, spalten = Math.round(this.breite / feld);
      for (let r = 0; r < reihen; r++) {
        const p = sp.punktBei(-reihen * feld / 2 + r * feld), q = sp.punktBei(-reihen * feld / 2 + (r + 1) * feld);
        for (let c = 0; c < spalten; c++) {
          const farbe = (r + c) % 2 === 0 ? 0x111111 : 0xf6f6f6;
          vierecke.push(this._band(p, q, -b + c * feld, -b + (c + 1) * feld, 0.1, farbe));
        }
      }
      // Startplätze: weiße Querbalken vor jeder Position
      const n = (R.config.rennen.gegnerMax || 5) + 1;
      this.startpositionen(n).forEach((st) => {
        const nah = sp.naechster(st.x, st.z);
        const s = nah.s, quer = nah.seitenabstand;
        const p = sp.punktBei(s + 2.6), q = sp.punktBei(s + 3.0);
        vierecke.push(this._band(p, q, quer - 1.3, quer + 1.3, 0.1, 0xf0f0f0));
      });
      const m = new THREE.Mesh(this._viereckeZuGeometrie(vierecke), this._material(undefined, 3));
      m.name = 'StartZiel';
      return m;
    }

    _startbogenBauen() {
      const g = new THREE.Group();
      g.name = 'Startbogen';
      const p = this.spline.punktBei(0);
      const weite = this.breite / 2 + this.randBreite + 1.2;
      const mastMat = new THREE.MeshLambertMaterial({ color: 0xdedede });
      const mastGeo = new THREE.BoxGeometry(0.5, 7, 0.5);
      [-1, 1].forEach((seite) => {
        const x = p.x + p.nx * weite * seite, z = p.z + p.nz * weite * seite;
        const mast = new THREE.Mesh(mastGeo, mastMat);
        mast.position.set(x, this.hoeheAn(x, z) + 3.5, z);
        g.add(mast);
      });
      const banner = new THREE.Mesh(new THREE.BoxGeometry(weite * 2 + 0.5, 1.4, 0.3),
        new THREE.MeshLambertMaterial({ color: 0xe0352b }));
      banner.position.set(p.x, this.hoeheAn(p.x, p.z) + 6.6, p.z);
      banner.rotation.y = headingAus(p.tx, p.tz);
      g.add(banner);
      return g;
    }
    /**
     * Zaunpunkte einer Seite (seite = +1 rechts, -1 links) bei seitenabstandMax.
     * Ein Punkt ist "gültig", wenn er wirklich zu seinem eigenen Streckenstück gehört:
     * Liegt ein anderes Streckenstück näher (Innenseite enger Kurven, nahe Geraden),
     * entfällt er – dort gibt es auch physikalisch keine Bande.
     * @returns {{x,y,z,ok:boolean}[]} je Abtastpunkt
     */
    zaunPunkte(seite) {
      const sp = this.spline, pk = sp.punkte, q = this.seitenabstandMax * seite;
      return pk.map((p) => {
        const x = p.x + p.nx * q, z = p.z + p.nz * q;
        const n = sp.naechster(x, z);
        const ok = n.abstand >= this.seitenabstandMax - 1.0;
        return { x, z, y: this.hoeheAn(x, z), ok, s: p.s };
      });
    }

    /**
     * Zaun auf beiden Seiten: Pfosten alle 8 m (EIN InstancedMesh) und zwei
     * Querlatten als durchgehendes Band (EIN Mesh, beidseitig). = 2 Draw-Calls.
     * stil (aus dem Thema): { latten, pfosten (Farben), art: 'holz' | 'leitpfosten' }
     *   'leitpfosten' = weiße Pfosten mit schwarzem Kopf, ohne Latten (Wüste).
     * Auf der Brücke entfällt der Zaun – dort steht das Geländer.
     */
    _zaunBauen(stil) {
      const g = new THREE.Group();
      g.name = 'Zaun';
      const leit = stil.art === 'leitpfosten';
      const PFOSTEN_ALLE = Math.max(1, Math.round((leit ? 10 : 8) / this.spline.ds));
      const LATTEN = leit ? [] : [{ h: 0.45, d: 0.16 }, { h: 0.95, d: 0.16 }];   // Höhe Mitte, Dicke
      const pfosten = [], pos = [];
      const br = this.bruecke;
      [-1, 1].forEach((seite) => {
        const zp = this.zaunPunkte(seite), N = zp.length;
        if (br) zp.forEach((a) => { if (a.s >= br.von - 2 && a.s <= br.bis + 2) a.ok = false; });
        for (let i = 0; i < N; i++) {
          const a = zp[i], b = zp[(i + 1) % N];
          if (i % PFOSTEN_ALLE === 0 && a.ok) pfosten.push(a);
          if (!a.ok || !b.ok) continue;
          if (Math.hypot(b.x - a.x, b.z - a.z) > 8) continue;   // Sprung (Schleife) – auslassen
          for (const l of LATTEN) {
            const u0 = l.h - l.d / 2, u1 = l.h + l.d / 2;
            pos.push(a.x, a.y + u0, a.z, b.x, b.y + u0, b.z, b.x, b.y + u1, b.z,
                     a.x, a.y + u0, a.z, b.x, b.y + u1, b.z, a.x, a.y + u1, a.z);
          }
        }
      });
      // Latten
      const lattenGeo = new THREE.BufferGeometry();
      lattenGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
      lattenGeo.computeVertexNormals();
      if (pos.length) {
        const latten = new THREE.Mesh(lattenGeo, new THREE.MeshLambertMaterial({ color: stil.latten || 0x9a6a3c, side: THREE.DoubleSide }));
        latten.name = 'Zaunlatten';
        g.add(latten);
      }
      // Pfosten (Leitpfosten: 8 Höhen-Segmente, oberstes Stück schwarz mit oranger Reflektor-Linie)
      const pfGeo = leit ? new THREE.BoxGeometry(0.22, 1.1, 0.22, 1, 11, 1) : new THREE.BoxGeometry(0.18, 1.3, 0.18);
      pfGeo.translate(0, leit ? 0.5 : 0.55, 0);
      let pfMat;
      if (leit) {
        const pp = pfGeo.attributes.position, farben = new Float32Array(pp.count * 3), c = new THREE.Color();
        for (let i = 0; i < pp.count; i++) {
          const y = pp.getY(i);
          c.setHex(y > 0.84 ? 0x1c1c1c : y > 0.74 ? 0xff8a1f : stil.pfosten || 0xf2efe6);
          farben.set([c.r, c.g, c.b], i * 3);
        }
        pfGeo.setAttribute('color', new THREE.BufferAttribute(farben, 3));
        pfMat = new THREE.MeshLambertMaterial({ vertexColors: true });
      } else {
        pfMat = new THREE.MeshLambertMaterial({ color: stil.pfosten || 0x6e4a2a });
      }
      const pf = new THREE.InstancedMesh(pfGeo, pfMat, Math.max(1, pfosten.length));
      const m = new THREE.Matrix4();
      pfosten.forEach((p, i) => { m.makeTranslation(p.x, p.y, p.z); pf.setMatrixAt(i, m); });
      pf.count = pfosten.length;
      pf.instanceMatrix.needsUpdate = true;
      pf.name = 'Zaunpfosten';
      g.add(pf);
      this.zaunInfo = { pfosten: pfosten.length, lattenStuecke: pos.length / 36 };
      return g;
    }

    /**
     * Holzbrücke über den Bach in der Senke (Daten: bruecke { von, bis }):
     * Bretterbelag bis zum Geländer, Geländer genau an der Bande, Bach quer darunter.
     * Alles in EINEM Mesh mit Vertex-Farben (1 Draw-Call).
     */
    _brueckeBauen() {
      const sp = this.spline, br = this.bruecke, w = this.seitenabstandMax, v = [];
      const BRETT = 1.0, HOCH = 0.16;
      // Bretter quer (abwechselnd hell/dunkel), über Straße und Rand hinweg
      let k = 0;
      for (let s = br.von; s < br.bis - 1e-6; s += BRETT, k++) {
        const p = sp.punktBei(s), q = sp.punktBei(Math.min(br.bis, s + BRETT * 0.92));
        v.push(this._band(p, q, -w, w, HOCH, k % 2 ? 0x8a5a32 : 0x7a4d2a));
      }
      // Fahrspur-Markierung auf den Brettern (helle Streifen am Straßenrand)
      const b = this.breite / 2;
      for (let s = br.von; s < br.bis - 1e-6; s += 1) {
        const p = sp.punktBei(s), q = sp.punktBei(s + 1);
        v.push(this._band(p, q, -b - 0.25, -b, HOCH + 0.01, 0xe8dcc0));
        v.push(this._band(p, q, b, b + 0.25, HOCH + 0.01, 0xe8dcc0));
      }
      // Senkrechte Fläche zwischen zwei Seitpunkten (u0..u1 Höhe über Boden)
      const wand = (p, q, quer, u0, u1, farbe) => {
        const a = this._seitPunkt(p, quer, 0), c = this._seitPunkt(q, quer, 0);
        return { a: [a[0], a[1] + u0, a[2]], b: [c[0], c[1] + u0, c[2]], c: [c[0], c[1] + u1, c[2]], d: [a[0], a[1] + u1, a[2]], farbe };
      };
      [-1, 1].forEach((seite) => {
        const quer = w * seite;
        for (let s = br.von; s < br.bis - 1e-6; s += 1) {
          const p = sp.punktBei(s), q = sp.punktBei(Math.min(br.bis, s + 1));
          v.push(wand(p, q, quer, -0.5, HOCH, 0x5a3a1e));                 // Randbalken
          v.push(wand(p, q, quer, 1.0, 1.18, 0x9a6a3c));                  // Handlauf
          v.push(wand(p, q, quer, 0.5, 0.62, 0x9a6a3c));                  // Mittellatte
          v.push(this._band(p, q, quer - 0.12, quer + 0.12, 1.18, 0xa87848)); // Handlauf oben
        }
        // Pfosten alle 3 m (je zwei gekreuzte Flächen)
        for (let s = br.von; s <= br.bis + 1e-6; s += (br.bis - br.von) / Math.round((br.bis - br.von) / 3)) {
          const p = sp.punktBei(s - 0.12), q = sp.punktBei(s + 0.12);
          v.push(wand(p, q, quer - 0.12, 0, 1.3, 0x5a3a1e), wand(p, q, quer + 0.12, 0, 1.3, 0x5a3a1e));
          const m = sp.punktBei(s);
          const a = this._seitPunkt(m, quer - 0.12, 0), c = this._seitPunkt(m, quer + 0.12, 0);
          v.push({ a: [a[0], a[1], a[2]], b: [c[0], c[1], c[2]], c: [c[0], c[1] + 1.3, c[2]], d: [a[0], a[1] + 1.3, a[2]], farbe: 0x5a3a1e });
        }
      });
      // Bach: quer zur Straße unter der Brückenmitte, beidseits bis 60 m hinaus
      const mitteS = (br.von + br.bis) / 2, halb = Math.min(5, (br.bis - br.von) / 2 - 3);
      const pend = (d) => Math.sin(d * 0.12) * 2.5;    // Bach schlängelt sich leicht
      [-1, 1].forEach((seite) => {
        for (let d = w; d < w + 60; d += 3) {
          const ecke = (ds, dd) => this._seitPunkt(sp.punktBei(mitteS + ds + pend(dd)), dd * seite, 0.12);
          // beidseitiges Material: Umlaufsinn egal
          v.push({ a: ecke(-halb, d), b: ecke(halb, d), c: ecke(halb, d + 3), d: ecke(-halb, d + 3), farbe: 0x3f86b8 });
        }
      });
      const m = new THREE.Mesh(this._viereckeZuGeometrie(v),
        new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }));
      m.name = 'Bruecke';
      return m;
    }
  }

  Strecke.headingAus = headingAus;
  R.Strecke = Strecke;
  R.headingAus = headingAus;
})();
