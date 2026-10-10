// ============================================================
// Geschlossener Catmull-Rom-Spline (centripetal, alpha = 0.5)
// Reine Mathematik ohne Three.js, damit Node-Tests möglich sind.
//
// Der Spline wird einmal fein ausgewertet und dann in festen Abständen
// (ca. 2 m) neu abgetastet. Alle Abfragen arbeiten auf diesen Punkten:
//   punkte[i] = { x, y, z, s, tx, tz, nx, nz, kruemmung }
//   s          = Bogenlänge ab Punkt 0 (Start/Ziel)
//   tx, tz     = Tangente in XZ (normiert, Fahrtrichtung)
//   nx, nz     = Normale nach RECHTS (in Fahrtrichtung gesehen)
//   kruemmung  = 1/Radius, positiv = Rechtskurve, negativ = Linkskurve
//
// Koordinaten wie im Spiel: Blick entlang -z, rechts = +x.
// ============================================================
(function () {
  const R = window.Rennspiel;

  const ZELLE = 25;          // Kantenlänge des Suchrasters (m)
  const LOKAL_FENSTER = 30;  // lokale Suche: ± so viele Abtastpunkte (~60 m)

  /** Centripetaler Catmull-Rom zwischen p1 und p2 (Barry-Goldman-Form). */
  function catmullRom(p0, p1, p2, p3, u) {
    const knoten = (a, b) => {
      const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
      return Math.max(1e-4, Math.pow(dx * dx + dy * dy + dz * dz, 0.25)); // |d|^0.5
    };
    const t0 = 0, t1 = t0 + knoten(p0, p1), t2 = t1 + knoten(p1, p2), t3 = t2 + knoten(p2, p3);
    const t = t1 + (t2 - t1) * u;
    const erg = [0, 0, 0];
    for (let k = 0; k < 3; k++) {
      const a1 = ((t1 - t) * p0[k] + (t - t0) * p1[k]) / (t1 - t0);
      const a2 = ((t2 - t) * p1[k] + (t - t1) * p2[k]) / (t2 - t1);
      const a3 = ((t3 - t) * p2[k] + (t - t2) * p3[k]) / (t3 - t2);
      const b1 = ((t2 - t) * a1 + (t - t0) * a2) / (t2 - t0);
      const b2 = ((t3 - t) * a2 + (t - t1) * a3) / (t3 - t1);
      erg[k] = ((t2 - t) * b1 + (t - t1) * b2) / (t2 - t1);
    }
    return erg;
  }

  class Spline {
    /**
     * @param {number[][]} kontrollpunkte [[x,y,z], …] geschlossene Runde in Fahrtrichtung
     * @param {object} [optionen] { abstand: 2 } Abtastabstand in Metern
     */
    constructor(kontrollpunkte, optionen) {
      const opt = Object.assign({ abstand: 2 }, optionen);
      const P = kontrollpunkte;
      const n = P.length;
      if (n < 4) throw new Error('Spline braucht mindestens 4 Kontrollpunkte');

      // --- 1) Fein auswerten (ca. alle 0.25 m) und Bogenlänge aufsummieren ---
      const fein = [];      // [x, y, z, s]
      let s = 0, vorher = null;
      for (let i = 0; i < n; i++) {
        const p0 = P[(i - 1 + n) % n], p1 = P[i], p2 = P[(i + 1) % n], p3 = P[(i + 2) % n];
        const sehne = Math.hypot(p2[0] - p1[0], p2[2] - p1[2]);
        const schritte = Math.max(8, Math.ceil(sehne / 0.25));
        for (let j = 0; j < schritte; j++) {
          const q = catmullRom(p0, p1, p2, p3, j / schritte);
          if (vorher) s += Math.hypot(q[0] - vorher[0], q[1] - vorher[1], q[2] - vorher[2]);
          fein.push([q[0], q[1], q[2], s]);
          vorher = q;
        }
      }
      // Schluss zurück zum Anfang
      const erster = fein[0];
      s += Math.hypot(erster[0] - vorher[0], erster[1] - vorher[1], erster[2] - vorher[2]);
      fein.push([erster[0], erster[1], erster[2], s]);
      this.laenge = s;

      // --- 2) In festen Abständen neu abtasten ---
      const anzahl = Math.max(8, Math.round(s / opt.abstand));
      this.ds = s / anzahl;
      this.punkte = new Array(anzahl);
      let f = 0;
      for (let i = 0; i < anzahl; i++) {
        const si = i * this.ds;
        while (f < fein.length - 2 && fein[f + 1][3] < si) f++;
        const a = fein[f], b = fein[f + 1];
        const w = b[3] > a[3] ? (si - a[3]) / (b[3] - a[3]) : 0;
        this.punkte[i] = {
          x: a[0] + (b[0] - a[0]) * w, y: a[1] + (b[1] - a[1]) * w, z: a[2] + (b[2] - a[2]) * w,
          s: si, tx: 0, tz: -1, nx: 1, nz: 0, kruemmung: 0,
        };
      }

      // --- 3) Tangenten, Normalen (rechts), Krümmung ---
      const N = anzahl, pk = this.punkte;
      for (let i = 0; i < N; i++) {
        const a = pk[(i - 1 + N) % N], b = pk[(i + 1) % N];
        let tx = b.x - a.x, tz = b.z - a.z;
        const l = Math.hypot(tx, tz) || 1;
        tx /= l; tz /= l;
        pk[i].tx = tx; pk[i].tz = tz;
        pk[i].nx = -tz; pk[i].nz = tx;           // rechts von der Fahrtrichtung
      }
      // Krümmung über ±2 Punkte (glättet das Abtastrauschen), Vorzeichen: rechts positiv
      for (let i = 0; i < N; i++) {
        const a = pk[(i - 2 + N) % N], b = pk[(i + 2) % N], p = pk[i];
        const dtx = b.tx - a.tx, dtz = b.tz - a.tz;
        p.kruemmung = (dtx * p.nx + dtz * p.nz) / (4 * this.ds);
      }

      // --- 4) Suchraster (Spatial-Hash) für naechster() ---
      this._raster = new Map();
      this._rasterMin = { x: Infinity, z: Infinity, x2: -Infinity, z2: -Infinity };
      for (let i = 0; i < N; i++) {
        const k = this._schluessel(Math.floor(pk[i].x / ZELLE), Math.floor(pk[i].z / ZELLE));
        if (!this._raster.has(k)) this._raster.set(k, []);
        this._raster.get(k).push(i);
        const m = this._rasterMin;
        m.x = Math.min(m.x, pk[i].x); m.z = Math.min(m.z, pk[i].z);
        m.x2 = Math.max(m.x2, pk[i].x); m.z2 = Math.max(m.z2, pk[i].z);
      }
    }

    get anzahl() { return this.punkte.length; }

    _schluessel(ix, iz) { return ix * 100003 + iz; }

    /** s in den Bereich [0, laenge) bringen. */
    wrapS(s) { const L = this.laenge; return ((s % L) + L) % L; }

    /** Kürzeste vorzeichenbehaftete Differenz a - b entlang der Runde (-L/2 .. L/2]. */
    differenzS(a, b) {
      const L = this.laenge;
      let d = (a - b) % L;
      if (d > L / 2) d -= L; else if (d <= -L / 2) d += L;
      return d;
    }

    /** Index des nächstgelegenen Abtastpunkts – global über das Suchraster. */
    _naechsterIndexGlobal(x, z) {
      const pk = this.punkte;
      const cx = Math.floor(x / ZELLE), cz = Math.floor(z / ZELLE);
      let best = -1, bestD2 = Infinity;
      // Ringe um die Zelle absuchen, bis kein näherer Punkt mehr möglich ist
      const m = this._rasterMin;
      const maxRing = Math.ceil(Math.max(
        Math.abs(x - m.x), Math.abs(x - m.x2), Math.abs(z - m.z), Math.abs(z - m.z2)) / ZELLE) + 1;
      for (let ring = 0; ring <= maxRing; ring++) {
        for (let ix = cx - ring; ix <= cx + ring; ix++) {
          for (let iz = cz - ring; iz <= cz + ring; iz++) {
            if (Math.max(Math.abs(ix - cx), Math.abs(iz - cz)) !== ring) continue; // nur der Rand
            const liste = this._raster.get(this._schluessel(ix, iz));
            if (!liste) continue;
            for (const i of liste) {
              const dx = pk[i].x - x, dz = pk[i].z - z, d2 = dx * dx + dz * dz;
              if (d2 < bestD2) { bestD2 = d2; best = i; }
            }
          }
        }
        // Alles innerhalb von ring*ZELLE ist sicher durchsucht
        if (best >= 0 && Math.sqrt(bestD2) <= ring * ZELLE) break;
      }
      return best;
    }

    /** Lokale Suche ± LOKAL_FENSTER um startIndex. */
    _naechsterIndexLokal(x, z, startIndex) {
      const pk = this.punkte, N = pk.length;
      let best = startIndex, bestD2 = Infinity;
      for (let k = -LOKAL_FENSTER; k <= LOKAL_FENSTER; k++) {
        const i = ((startIndex + k) % N + N) % N;
        const dx = pk[i].x - x, dz = pk[i].z - z, d2 = dx * dx + dz * dz;
        if (d2 < bestD2) { bestD2 = d2; best = i; }
      }
      return { index: best, abstand: Math.sqrt(bestD2) };
    }

    /**
     * Nächste Stelle auf der Mittellinie.
     * @param {number} x
     * @param {number} z
     * @param {number} [startIndex] letzter bekannter Index → schnelle lokale Suche
     * @returns {{index:number, s:number, seitenabstand:number, t:number, abstand:number, x:number, z:number}}
     *   index = Abtastpunkt vor der Projektion, t = Anteil 0..1 bis zum nächsten Punkt,
     *   seitenabstand = signiert (rechts positiv), abstand = |seitenabstand|
     */
    naechster(x, z, startIndex) {
      let i;
      if (startIndex !== undefined && startIndex !== null && startIndex >= 0) {
        const lokal = this._naechsterIndexLokal(x, z, startIndex | 0);
        i = lokal.index;
        // Weit weg (Abkürzung, Reset, Teleport)? Dann global gegenprüfen.
        if (lokal.abstand > 20) {
          const g = this._naechsterIndexGlobal(x, z);
          const pg = this.punkte[g];
          if (Math.hypot(pg.x - x, pg.z - z) < lokal.abstand - 1) i = g;
        }
      } else {
        i = this._naechsterIndexGlobal(x, z);
      }
      return this._projektion(x, z, i);
    }

    /** Projektion auf die Segmente vor und nach Punkt i, das bessere gewinnt. */
    _projektion(x, z, i) {
      const pk = this.punkte, N = pk.length;
      let best = null;
      for (const a of [(i - 1 + N) % N, i]) {
        const p = pk[a], q = pk[(a + 1) % N];
        const sx = q.x - p.x, sz = q.z - p.z;
        const l2 = sx * sx + sz * sz || 1;
        let t = ((x - p.x) * sx + (z - p.z) * sz) / l2;
        t = Math.max(0, Math.min(1, t));
        const px = p.x + sx * t, pz = p.z + sz * t;
        const d2 = (x - px) * (x - px) + (z - pz) * (z - pz);
        if (!best || d2 < best.d2) best = { a, t, px, pz, d2 };
      }
      const p = pk[best.a], q = pk[(best.a + 1) % N];
      // Normale zwischen beiden Punkten interpolieren
      const nx = p.nx + (q.nx - p.nx) * best.t, nz = p.nz + (q.nz - p.nz) * best.t;
      const seiten = (x - best.px) * nx + (z - best.pz) * nz;
      return {
        index: best.a,
        t: best.t,
        s: this.wrapS(p.s + this.ds * best.t),
        seitenabstand: seiten,
        abstand: Math.sqrt(best.d2),
        x: best.px, z: best.pz,
      };
    }

    /** Interpolierter Punkt bei Bogenlänge s (s wird umgebrochen). */
    punktBei(s) {
      const pk = this.punkte, N = pk.length;
      const sw = this.wrapS(s);
      const f = sw / this.ds;
      const i = Math.floor(f) % N, w = f - Math.floor(f);
      const a = pk[i], b = pk[(i + 1) % N];
      let tx = a.tx + (b.tx - a.tx) * w, tz = a.tz + (b.tz - a.tz) * w;
      const l = Math.hypot(tx, tz) || 1; tx /= l; tz /= l;
      return {
        x: a.x + (b.x - a.x) * w, y: a.y + (b.y - a.y) * w, z: a.z + (b.z - a.z) * w,
        s: sw, tx, tz, nx: -tz, nz: tx,
        kruemmung: a.kruemmung + (b.kruemmung - a.kruemmung) * w,
        index: i,
      };
    }

    /** Höhe der Mittellinie an der nächstgelegenen Stelle. */
    hoeheBei(x, z, startIndex) {
      const n = this.naechster(x, z, startIndex);
      const a = this.punkte[n.index], b = this.punkte[(n.index + 1) % this.punkte.length];
      return a.y + (b.y - a.y) * n.t;
    }
  }

  R.Spline = Spline;
})();
