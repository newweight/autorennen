/* Aktionen-Bibliothek: Ersatz für SCNAction (SceneKit) in Three.js.
 * Jede Aktion ist einmalig verwendbar (sie merkt sich Startwerte). Aufbau wie im Swift-Code:
 *   A.seq(A.warte(0.1), A.gruppe(A.eigen(...), A.drehen(...)), ...)
 * Läufer: eine Instanz pro Szene, wird mit schritt(dt) in der Zeitschleife getrieben (kein setTimeout).
 * Enthält außerdem die Hilfen für Deckkraft/eigene Materialien. */
(function (g) {
  'use strict';
  const THREE = g.THREE;

  class Aktion {
    constructor(dauer) { this.dauer = dauer; this._gestartet = false; this._fertig = false; }
    start(/* node */) {}
    anwenden(/* node, t */) {}
    _tick(node, t) {
      if (!this._gestartet) { this._gestartet = true; this.start(node); }
      this.anwenden(node, Math.min(t, this.dauer));
    }
  }

  class Warte extends Aktion { constructor(d) { super(d); } }

  class Eigen extends Aktion {
    constructor(d, fn) { super(d); this.fn = fn; }
    anwenden(node, t) { this.fn(node, t); }
  }

  class Sequenz extends Aktion {
    constructor(liste) { super(liste.reduce((s, a) => s + a.dauer, 0)); this.liste = liste; }
    anwenden(node, t) {
      let off = 0;
      for (const a of this.liste) {
        const ende = off + a.dauer;
        if (t >= ende) { if (!a._fertig) { a._tick(node, a.dauer); a._fertig = true; } off = ende; continue; }
        a._tick(node, t - off);
        return;
      }
    }
  }

  class Gruppe extends Aktion {
    constructor(liste) { super(liste.reduce((m, a) => Math.max(m, a.dauer), 0)); this.liste = liste; }
    anwenden(node, t) {
      for (const a of this.liste) {
        if (a._fertig) continue;
        if (t >= a.dauer) { a._tick(node, a.dauer); a._fertig = true; } else a._tick(node, t);
      }
    }
  }

  class DrehenUm extends Aktion {          // rotate(by:around:) – Achse im Elternraum, additiv zum Startwert
    constructor(winkel, achse, d) { super(d); this.winkel = winkel; this.achse = new THREE.Vector3(achse.x, achse.y, achse.z).normalize(); }
    start(node) { this.q0 = node.quaternion.clone(); }
    anwenden(node, t) {
      const u = this.dauer > 0 ? t / this.dauer : 1;
      const q = new THREE.Quaternion().setFromAxisAngle(this.achse, this.winkel * u);
      node.quaternion.copy(q.multiply(this.q0));
    }
  }

  class BewegenUm extends Aktion {
    constructor(v, d) { super(d); this.v = v; }
    start(node) { this.p0 = node.position.clone(); }
    anwenden(node, t) {
      const u = this.dauer > 0 ? t / this.dauer : 1;
      node.position.set(this.p0.x + this.v.x * u, this.p0.y + this.v.y * u, this.p0.z + this.v.z * u);
    }
  }

  class BewegenNach extends Aktion {
    constructor(v, d) { super(d); this.v = v; }
    start(node) { this.p0 = node.position.clone(); }
    anwenden(node, t) {
      const u = this.dauer > 0 ? t / this.dauer : 1;
      node.position.set(this.p0.x + (this.v.x - this.p0.x) * u, this.p0.y + (this.v.y - this.p0.y) * u, this.p0.z + (this.v.z - this.p0.z) * u);
    }
  }

  class SkalierenNach extends Aktion {
    constructor(s, d) { super(d); this.s = s; }
    start(node) { this.s0 = node.scale.clone(); }
    anwenden(node, t) {
      const u = this.dauer > 0 ? t / this.dauer : 1;
      node.scale.set(this.s0.x + (this.s - this.s0.x) * u, this.s0.y + (this.s - this.s0.y) * u, this.s0.z + (this.s - this.s0.z) * u);
    }
  }

  class Deckkraft extends Aktion {
    constructor(ziel, d) { super(d); this.ziel = ziel; }
    start(node) { this.o0 = node.userData._deckkraft === undefined ? 1 : node.userData._deckkraft; }
    anwenden(node, t) {
      const u = this.dauer > 0 ? t / this.dauer : 1;
      setzeDeckkraft(node, this.o0 + (this.ziel - this.o0) * u);
    }
  }

  class Einmal extends Aktion { constructor(fn) { super(0); this.fn = fn; } anwenden(node) { this.fn(node); } }

  // ---------------------------------------------------------------- Deckkraft / eigene Materialien
  /** Klont die (geteilten) Materialien eines Knotens einmalig, damit Leucht-/Ausblend-Effekte nicht alle Figuren färben. */
  function eigeneMaterialien(node) {
    if (node.userData._eigeneMat) return node.userData._eigeneMat;
    const liste = [];
    node.traverse(o => {
      if (o.material && !o.userData._keinKlon) {
        if (Array.isArray(o.material)) o.material = o.material.map(m => m.clone());
        else o.material = o.material.clone();
        (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => liste.push(m));
      }
    });
    node.userData._eigeneMat = liste;
    return liste;
  }

  function setzeDeckkraft(node, o) {
    const mats = eigeneMaterialien(node);
    node.userData._deckkraft = o;
    for (const m of mats) {
      if (m.userData && m.userData.basisDeckkraft === undefined) m.userData.basisDeckkraft = m.opacity;
      const basis = (m.userData && m.userData.basisDeckkraft !== undefined) ? m.userData.basisDeckkraft : 1;
      m.transparent = o < 0.999 || basis < 1;
      m.opacity = basis * o;
    }
    node.traverse(ob => { if (ob.isMesh && ob.userData._schatten !== false) ob.castShadow = o > 0.5; });
  }

  // ---------------------------------------------------------------- Läufer
  class Laeufer {
    constructor() { this.laufend = []; this.zeit = 0; this.zeitgeber = []; }
    /** Aktion auf einem Knoten starten (mehrere gleichzeitig möglich). */
    run(node, aktion) { this.laufend.push({ node, aktion, t: 0 }); return aktion; }
    /** Block nach t Sekunden (Simulationszeit) – wie `at(_:)` im Swift-Code. */
    nach(t, fn) { this.zeitgeber.push({ zeit: this.zeit + t, fn }); }
    schritt(dt) {
      this.zeit += dt;
      for (let i = 0; i < this.laufend.length; i++) {
        const l = this.laufend[i];
        if (l.fertig) continue;
        l.t += dt;
        l.aktion._tick(l.node, l.t);
        if (l.t >= l.aktion.dauer) { l.aktion._fertig = true; l.fertig = true; }
      }
      if (this.laufend.some(l => l.fertig)) this.laufend = this.laufend.filter(l => !l.fertig);
      if (this.zeitgeber.length) {
        const faellig = this.zeitgeber.filter(z => z.zeit <= this.zeit).sort((a, b) => a.zeit - b.zeit);
        if (faellig.length) {
          this.zeitgeber = this.zeitgeber.filter(z => z.zeit > this.zeit);
          for (const z of faellig) z.fn();
        }
      }
    }
    stopp(node) { this.laufend = this.laufend.filter(l => l.node !== node); }
    alleStoppen() { this.laufend = []; this.zeitgeber = []; }
    beschaeftigt() { return this.laufend.length > 0 || this.zeitgeber.length > 0; }
  }

  // ---------------------------------------------------------------- Bausteine (static-Funktionen aus Board3DView)
  const ease = u => (u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2);
  const A = {
    Laeufer, ease, setzeDeckkraft, eigeneMaterialien,
    warte: d => new Warte(d),
    eigen: (d, fn) => new Eigen(d, fn),
    seq: (...l) => new Sequenz(l.flat()),
    gruppe: (...l) => new Gruppe(l.flat()),
    drehen: (w, achse, d) => new DrehenUm(w, achse, d),
    bewegenUm: (v, d) => new BewegenUm(v, d),
    bewegenNach: (v, d) => new BewegenNach(v, d),
    skalieren: (s, d) => new SkalierenNach(s, d),
    ausblenden: d => new Deckkraft(0, d),
    deckkraft: (o, d) => new Deckkraft(o, d),
    verstecken: () => new Einmal(n => { n.visible = false; }),
    entfernen: () => new Einmal(n => { if (n.parent) n.parent.remove(n); }),
    einmal: fn => new Einmal(fn),

    /** Bogen von a nach b mit Ease-in-out und Hubhöhe (SceneKit: Board3DView.arc) */
    bogen(a, b, hoehe, d) {
      return new Eigen(d, (node, t) => {
        const u = Math.min(1, t / d), e = ease(u);
        node.position.set(a.x + (b.x - a.x) * e, a.y + (b.y - a.y) * e + Math.sin(e * Math.PI) * hoehe, a.z + (b.z - a.z) * e);
      });
    },
    /** Beschleunigender Anlauf (Rammbock) */
    anlauf(a, b, d) {
      return new Eigen(d, (node, t) => {
        const u = Math.min(1, t / d), e = u * u * u;
        node.position.set(a.x + (b.x - a.x) * e, a.y + (b.y - a.y) * e, a.z + (b.z - a.z) * e);
      });
    },
    wurf(a, dir, distanz, hoehe, d) {
      return new Eigen(d, (node, t) => {
        const u = Math.min(1, t / d);
        node.position.set(a.x + dir.x * distanz * u, a.y + hoehe * (4 * u * (1 - u)) - 0.6 * u * u, a.z + dir.z * distanz * u);
      });
    },
    stauchen(d) {
      return new Eigen(d, (node, t) => {
        const u = Math.min(1, t / d), s = Math.sin(u * Math.PI) * 0.14;
        node.scale.set(1 + s * 0.6, 1 - s, 1 + s * 0.6);
      });
    },
    zittern(d) {
      let basis = null;
      return new Eigen(d, (node, t) => {
        if (!basis) basis = node.position.clone();
        const k = 0.035 * (1 - Math.min(1, t / d));
        node.position.set(basis.x + Math.sin(t * 95) * k, basis.y, basis.z + Math.cos(t * 83) * k);
        if (t >= d - 0.001) node.position.copy(basis);
      });
    },
  };
  g.Schach3DAktionen = A;
})(typeof window !== 'undefined' ? window : globalThis);
