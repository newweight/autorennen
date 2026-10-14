// ============================================================
// Runde 6 (W3-G): Münzen auf der Strecke („R.Muenzen")
//
//   const m = new Rennspiel.Muenzen(strecke);   // Platzierung deterministisch aus der Strecke (kein Zufall)
//   szene.add(m.bauen());                      // eine InstancedMesh (1 Draw-Call) + Glanz-Instanzen
//   m.schritt(dt, fahrzeuge) → [{ nr, k }]     // Einsammeln (nach der Physik), nr = Fahrzeug-Index, k = Münze
//   m.animieren(zeit)                          // drehen, schweben, eingesammelte: kurz hochspringen + verschwinden
//   m.zuruecksetzen()                          // alle Münzen wieder da (neues Rennen baut ohnehin neu)
//   m.zerstoeren()
//
// Platzierung (config.garage.muenzen): Stellen gleichmäßig über die Strecke (Start/Ziel, Loopings und die Flugstrecke
// hinter Schanzen frei). Auf bis zu maxReihen geraden Stellen (|Krümmung| ≤ kurveAb über die ganze Reihe, gleichmäßig
// verteilt) liegt eine Reihe aus `reihe` Münzen im Abstand reiheAbstand m (Seite wechselt: Mitte, links, rechts …),
// alle anderen Stellen bekommen eine einzelne Münze (in Kurven leicht zur Innenseite). Die Stellenzahl wächst, bis
// zielAnzahl Münzen liegen (immer zwischen anzahlMin und anzahlMax).
//
// WICHTIG: Münzen haben KEINE Physik – kein Stoß, kein Bremsen, nur Einsammeln (welten_test-Regression: Bahnen
// mit/ohne dieses Modul bitgleich). Autos im Looping oder in der Luft sammeln nichts. Polizei sammelt nichts.
// Die KI sammelt nebenbei (Münze weg), gutgeschrieben wird nur Spielern (main.js).
// Rechenteil ohne Three.js (Node-Tests: tests/test_garage.js).
// ============================================================
(function () {
  const R = window.Rennspiel;

  function C() { return (R.config.garage && R.config.garage.muenzen) || {}; }
  function wert(x, std) { return x === undefined ? std : x; }

  /** Münz-Positionen [{ s, q, reihe }] für eine Strecke (rein, deterministisch). */
  function platzieren(strecke) {
    const c = C(), sp = strecke.spline, L = sp.laenge;
    const nMin = wert(c.anzahlMin, 20), nMax = wert(c.anzahlMax, 40), reihe = wert(c.reihe, 5), ra = wert(c.reiheAbstand, 6);
    const kAb = wert(c.kurveAb, 0.008), startFrei = wert(c.startFrei, 70), zielFrei = wert(c.zielFrei, 25), schFrei = wert(c.schanzeFrei, 110);
    const halb = (strecke.breite || 12) / 2;
    // gesperrte Bereiche [s0, s1] (in Fahrtrichtung, ohne Umbruch: s1 kann > L sein)
    const sperre = [];
    (strecke.loopings || []).forEach((l) => { const a = l.s0 - 15; let b = l.s1 + 15; if (b < a) b += L; sperre.push([a, b]); });
    (strecke.schanzen || []).forEach((s) => sperre.push([s.s - 20, s.s + (s.laenge || 10) + schFrei]));
    // W4-I: Überführung – weder auf der Brücke noch darunter (sonst sammelt das Auto unten die Münze oben ein)
    (strecke.ueberfuehrungen || []).forEach((u) => {
      const a = u.s0 - 15; let b = u.s1 + 15; if (b < a) b += L; sperre.push([a, b]);
      if (u.unten) { const c = u.unten.s0 - 15; let d = u.unten.s1 + 15; if (d < c) d += L; sperre.push([c, d]); }
    });
    // 14.10. (v18): Gabelung – keine Münzen in den zwei Ästen (und 15 m davor/danach)
    (strecke.gabelungen || []).forEach((g) => sperre.push([g.s0 - 15, g.s1 + 15]));
    // W4-J: niveaugleiche Kreuzung – nicht auf/vor der Kreuzung (beide Abschnitte, sonst sammelt der Querverkehr mit)
    (strecke.kreuzungen || []).forEach((k) => [k.a, k.b].forEach((b) => {
      const a = b.s0 - 20; let e = b.s1 + 20; if (e < a) e += L; sperre.push([a, e]);
    }));
    const frei = (s) => {
      if (s < startFrei || s > L - zielFrei) return false;
      for (const [a, b] of sperre) {
        if (s >= a && s <= b) return false;
        if (s + L >= a && s + L <= b) return false;
        if (s - L >= a && s - L <= b) return false;
      }
      return true;
    };
    const gerade = (s0, s1) => {
      for (let s = s0; s <= s1 + 0.01; s += 3) if (Math.abs(sp.punktBei(s).kruemmung || 0) > kAb) return false;
      return true;
    };
    const versatz = [0, -0.4, 0.4];      // Anteil der halben Breite (Seite wechselt je Reihe)
    const ziel = Math.max(nMin, Math.min(nMax, wert(c.zielAnzahl, 30))), maxReihen = wert(c.maxReihen, 4);
    const lang = (reihe - 1) * ra;
    const bauen = (anker) => {
      const nutz = L - startFrei - zielFrei;
      const orte = [];
      for (let k = 0; k < anker; k++) {
        const s = startFrei + (k + 0.5) * nutz / anker;
        if (!frei(s)) continue;
        orte.push({ s, gerade: frei(s + lang) && gerade(s, s + lang) });
      }
      // Reihen gleichmäßig über die geraden Stellen verteilen (höchstens maxReihen), alle anderen Stellen = einzeln
      const kand = orte.filter((o) => o.gerade), nR = Math.min(maxReihen, kand.length), wahl = new Set();
      for (let j = 0; j < nR; j++) wahl.add(kand[Math.floor((j + 0.5) * kand.length / nR)]);
      const liste = [];
      let reihen = 0;
      for (const o of orte) {
        if (wahl.has(o)) {
          const q = versatz[reihen % versatz.length] * halb;
          for (let j = 0; j < reihe; j++) liste.push({ s: o.s + j * ra, q, reihe: reihen });
          reihen++;
        } else {
          // einzeln: in Kurven leicht zur Innenseite (Vorzeichen aus der Krümmung), auf Geraden wechselnd links/rechts
          const kr = sp.punktBei(o.s).kruemmung || 0;
          const q = o.gerade || Math.abs(kr) < 1e-4 ? (liste.length % 2 ? 0.3 : -0.3) * halb : -Math.sign(kr) * 0.25 * halb;
          liste.push({ s: o.s, q, reihe: -1 });
        }
      }
      return liste;
    };
    let anker = 4, liste = bauen(anker);
    while (liste.length < ziel && anker < 120) { anker++; liste = bauen(anker); }
    if (liste.length > nMax) {
      // zu viele: Einzelmünzen von hinten weglassen (Reihen bleiben ganz)
      while (liste.length > nMax) {
        const i = liste.map((m) => m.reihe).lastIndexOf(-1);
        if (i < 0) break;
        liste.splice(i, 1);
      }
    }
    return liste.map((m) => ({ s: sp.wrapS(m.s), q: m.q, reihe: m.reihe }));
  }

  /**
   * 12.10.: Münzen dürfen nicht in Hindernissen liegen (Öl, Sand, Baustelle samt Sperrhälfte, Ast, Wrack, Lava …).
   * Liegt eine Münze (Radius 0,6 m) in einem Hindernis, wird sie auf eine freie Querlage derselben Stelle geschoben
   * (gespiegelt, ±½, ±¼ der halben Breite); gibt es keine, entfällt sie. Ohne Hindernis im Weg bleibt alles unverändert.
   */
  function hindernisFrei(strecke, liste) {
    const hs = (strecke.hindernisse || []).filter((h) => h.typ !== 'krater' && h.laenge && h.halbbreite !== undefined && h.seitenabstand !== undefined);
    if (!hs.length) return liste;
    const sp = strecke.spline, r = 0.6, halb = (strecke.breite || 12) / 2;
    const drin = (s, q) => hs.some((h) => Math.abs(sp.differenzS(s, h.s)) < h.laenge / 2 + r && Math.abs(q - h.seitenabstand) < h.halbbreite + r);
    const erg = [];
    for (const m of liste) {
      if (!drin(m.s, m.q)) { erg.push(m); continue; }
      const q = [-m.q, 0.5 * halb, -0.5 * halb, 0.25 * halb, -0.25 * halb].find((x) => !drin(m.s, x));
      if (q !== undefined) erg.push({ s: m.s, q, reihe: m.reihe });
    }
    return erg;
  }

  class Muenzen {
    /** @param {Strecke} strecke */
    constructor(strecke) {
      const c = C(), sp = strecke.spline, h = wert(c.hoehe, 0.95);
      this.strecke = strecke;
      this.radius = wert(c.radius, 1.9);
      this.liste = hindernisFrei(strecke, platzieren(strecke)).map((m, k) => {
        const p = sp.punktBei(m.s), x = p.x + p.nx * m.q, z = p.z + p.nz * m.q;
        // W4-I: Höhe aus dem eigenen s (Höhenmodell 'gelaende': identisch mit hoeheAn(x, z))
        const y = typeof strecke.hoeheBeiS === 'function' ? strecke.hoeheBeiS(m.s, m.q) + h : typeof strecke.hoeheAn === 'function' ? strecke.hoeheAn(x, z) + h : (p.y || 0) + h;
        return { k, s: m.s, q: m.q, x, y, z, reihe: m.reihe, da: true, weg: 0 };
      });
      this.gesammelt = [];       // je Fahrzeug-Index: Anzahl in diesem Rennen
      this.zeit = 0;
    }

    get anzahl() { return this.liste.length; }
    /** Noch liegende Münzen. */
    get uebrig() { let n = 0; for (const m of this.liste) if (m.da) n++; return n; }

    /**
     * Einsammeln (nach den Fahrzeug-Schritten). Ändert NICHTS an den Fahrzeugen.
     * @param {number} dt
     * @param {Array} fahrzeugListe Vehicles oder Einträge mit .vehicle (Index = Fahrzeugnummer); Einträge mit .polizei werden übersprungen
     * @returns {{nr:number, k:number}[]}
     */
    schritt(dt, fahrzeugListe) {
      this.zeit += dt;
      const erg = [], r2 = this.radius * this.radius, liste = fahrzeugListe || [];
      for (const m of this.liste) if (!m.da && m.weg < 1) m.weg = Math.min(1, m.weg + dt / 0.35);
      for (let i = 0; i < liste.length; i++) {
        const f = liste[i];
        if (!f || f.polizei) continue;
        const v = f.vehicle ? f.vehicle : f;
        if (!v || v.imLooping || v.imFlug || (f.looping && f.looping.aktiv) || (f.flug && f.flug.aktiv)) continue;
        for (const m of this.liste) {
          if (!m.da) continue;
          const dx = v.x - m.x, dz = v.z - m.z;
          if (dx * dx + dz * dz > r2) continue;
          if (Number.isFinite(v.y) && Math.abs(v.y + 0.5 - m.y) > 3) continue;   // Brücke/Tunnel darüber: nicht durch den Boden
          m.da = false; m.weg = 0;
          this.gesammelt[i] = (this.gesammelt[i] || 0) + 1;
          erg.push({ nr: i, k: m.k });
        }
      }
      return erg;
    }

    /** Anzahl der Münzen, die Fahrzeug i in diesem Rennen eingesammelt hat. */
    anzahlVon(i) { return this.gesammelt[i] || 0; }

    zuruecksetzen() {
      this.liste.forEach((m) => { m.da = true; m.weg = 0; });
      this.gesammelt = [];
    }

    // ------------------------------------------------------------------ Ton
    /** „Pling" über R.Audio (falls bereit). */
    ton() {
      const A = R.Audio;
      if (!A || !A._bereit || !A._bereit() || !A._ton) return;
      A._ton(988, 988, 0.07, 'square', 0.14, 0);
      A._ton(1319, 1319, 0.2, 'square', 0.14, 0.06);
    }

    // ------------------------------------------------------------------ Grafik (THREE)
    /** Gruppe 'Muenzen': goldene Scheiben (InstancedMesh, 1 Draw-Call). */
    bauen() {
      const g = new THREE.Group();
      g.name = 'Muenzen';
      const n = this.liste.length;
      if (!n) { this.gruppe = g; return g; }
      // Münze: flacher Zylinder (Achse = z nach Drehung), Rand etwas dunkler über Flächenfarben
      const geo = new THREE.CylinderGeometry(0.55, 0.55, 0.12, 20, 1);
      geo.rotateX(Math.PI / 2);
      const mat = new THREE.MeshLambertMaterial({ color: 0xffd84a, emissive: 0xb07a00 });
      const im = new THREE.InstancedMesh(geo, mat, n);
      im.name = 'MuenzenMesh';
      im.frustumCulled = false;            // Instanzen über die ganze Strecke verteilt
      this._mesh = im; this._geo = geo; this._mat = mat;
      this._m4 = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._p = new THREE.Vector3(); this._s = new THREE.Vector3(); this._y = new THREE.Vector3(0, 1, 0);
      g.add(im);
      this.gruppe = g;
      this.animieren(0);
      return g;
    }

    /** Drehen + Schweben; eingesammelte Münzen springen hoch und schrumpfen (weg 0→1), danach unsichtbar (Größe 0). */
    animieren(zeit) {
      const im = this._mesh;
      if (!im) return;
      const t = zeit === undefined ? this.zeit : zeit;
      for (const m of this.liste) {
        let sk = 1, hoch = 0.12 * Math.sin(t * 2.5 + m.k * 0.9), dreh = t * 3 + m.k * 0.6;
        if (!m.da) {
          if (m.weg >= 1) sk = 0;
          else { sk = 1 - m.weg; hoch += 1.6 * m.weg; dreh += m.weg * 12; }
        }
        this._q.setFromAxisAngle(this._y, dreh);
        this._p.set(m.x, m.y + hoch, m.z);
        this._s.set(sk, sk, sk);
        this._m4.compose(this._p, this._q, this._s);
        im.setMatrixAt(m.k, this._m4);
      }
      im.instanceMatrix.needsUpdate = true;
    }

    zerstoeren() {
      if (this._geo) { this._geo.dispose(); this._mat.dispose(); }
      if (this._mesh && this._mesh.dispose) this._mesh.dispose();
      this._mesh = null; this._geo = null; this._mat = null;
      // Die Gruppe selbst entfernt szeneAbbauen (liegt in der Szene).
    }
  }

  Muenzen.platzieren = platzieren;
  R.Muenzen = Muenzen;
})();
