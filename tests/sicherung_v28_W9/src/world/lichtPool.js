/**
 * Licht-Pool für Blaulicht (v26c, 15.10.) – window.Rennspiel.LichtPool
 *
 * Warum: three.js hängt den Shader-Schlüssel jedes beleuchteten Materials an die Zahl der SICHTBAREN Lichter je Typ. Wurde ein Blaulicht per
 * `light.visible` ein-/ausgeschaltet (Polizei/Krankenwagen nähert sich, Wagen erscheint/verschwindet), änderte sich die Lichtzahl und three.js
 * übersetzte ALLE beleuchteten Materialien neu (auf der Mac-GPU sekundenlang → „Seite reagiert nicht“).
 * Jetzt: feste Zahl PointLights, angelegt beim Rennstart (und mit vorgewärmt), IMMER visible = true. Ein- und Ausschalten nur über
 * `intensity` (0 ↔ Stärke), Farbe/Reichweite/Position sind nur Uniform-Werte (kein Neu-Übersetzen).
 *
 * Größe: 2 PointLights je Spieler-Kamera (ein Paar = linke/rechte Blaulicht-Lampe). Jede Kamera bekommt ihr Paar auf das nächste Blaulicht-Fahrzeug
 * (Streifenwagen oder Krankenwagen) innerhalb dessen `abstand`; ein Fahrzeug bekommt nie zwei Paare. Alle anderen Blaulicht-Fahrzeuge leuchten nur
 * über ihre emissiven Lampen (Material), wie schon bisher.
 *
 * Quellen: spiel.polizei.blaulichtQuellen(out) und spiel.verkehr.blaulichtQuellen(out) → { f, mesh, lokal:[[x,y,z],[x,y,z]], farben:[c0,c1], staerke, reichweite, abstand }.
 * Aufruf: spiel._blauPoolAnlegen(paare) (Rennstart, offline in streckeAufbauen, online in online.js) und je Frame spiel.lichtPool.aktualisieren().
 */
(function () {
  'use strict';
  const R = window.Rennspiel = window.Rennspiel || {};

  class LichtPool {
    /** @param {object} spiel Rennspiel.spiel  @param {number} paare Anzahl Paare (= Spieler-Kameras, 1 oder 2) */
    constructor(spiel, paare) {
      this.spiel = spiel;
      this.paare = Math.max(1, Math.min(2, paare | 0 || 1));
      this.lichter = [];
      this._q = [];
      this._benutzt = [];
      this._v = null;
    }

    /** Lichter anlegen (immer sichtbar, Intensität 0). Nur einmal je Rennen aufrufen. */
    anlegen() {
      if (typeof THREE === 'undefined' || this.lichter.length) return this;
      this._v = new THREE.Vector3();
      for (let i = 0; i < this.paare * 2; i++) {
        const l = new THREE.PointLight(0x2a5cff, 0, 14, 1.6);
        l.name = 'Blaulicht-Pool'; l.userData.poolLicht = true;
        l.visible = true; l.position.set(0, -500, 0);     // unbenutzt: weit unter der Welt, Intensität 0
        this.spiel.szene.add(l);
        this.lichter.push(l);
      }
      return this;
    }

    /** Je Frame (nach polizei/verkehr.animieren): Paare den nächsten Blaulicht-Fahrzeugen zuordnen. KEIN visible-Umschalten, nur intensity/Position/Farbe. */
    aktualisieren() {
      if (!this.lichter.length) return;
      const sp = this.spiel, q = this._q, benutzt = this._benutzt;
      q.length = 0; benutzt.length = 0;
      if (sp.polizei && sp.polizei.blaulichtQuellen) sp.polizei.blaulichtQuellen(q);
      if (sp.verkehr && sp.verkehr.blaulichtQuellen) sp.verkehr.blaulichtQuellen(q);
      const kams = sp.zustand === 'menue' || !sp.kameras ? [] : sp.kameras;
      for (let p = 0; p < this.paare; p++) {
        const L0 = this.lichter[p * 2], L1 = this.lichter[p * 2 + 1];
        const kam = kams.length ? kams[Math.min(p, kams.length - 1)] : null;
        let beste = -1, bestD = Infinity;
        if (kam && q.length) {
          const c = kam.kamera.position;
          for (let i = 0; i < q.length; i++) {
            if (benutzt.indexOf(i) >= 0) continue;
            const d = q[i].f.anzeige || q[i].f.vehicle;
            if (!d) continue;
            const dd = (c.x - d.x) ** 2 + (c.z - d.z) ** 2;
            if (dd <= q[i].abstand * q[i].abstand && dd < bestD) { bestD = dd; beste = i; }
          }
        }
        if (beste < 0) { L0.intensity = 0; L1.intensity = 0; continue; }
        benutzt.push(beste);
        const s = q[beste], m = s.mesh;
        m.updateWorldMatrix(true, false);     // Pose von diesem Frame (die Szenen-Matrizen werden erst beim Zeichnen gesammelt aktualisiert)
        for (let j = 0; j < 2; j++) {
          const l = j ? L1 : L0, o = s.lokal[j];
          m.localToWorld(this._v.set(o[0], o[1], o[2]));
          l.position.copy(this._v);
          l.color.setHex(s.farben[j]);
          l.distance = s.reichweite;
          l.intensity = s.staerke;
        }
      }
    }

    /** Aus der Szene nehmen. */
    zerstoeren() {
      this.lichter.forEach((l) => { if (l.parent) l.parent.remove(l); if (l.dispose) l.dispose(); });
      this.lichter = []; this._q.length = 0; this._benutzt.length = 0;
    }
  }

  R.LichtPool = LichtPool;
})();
