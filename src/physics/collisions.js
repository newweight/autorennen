// ============================================================
// Kollisionen (2D auf der Bodenebene, ohne Three.js → Node-Tests)
//
// 1) bande():   unsichtbare, weiche Bande bei |seitenabstand| > strecke.seitenabstandMax.
//               Das Auto wird zurückgeschoben, verliert Tempo, dreht leicht zur Straße.
//               Kein Game Over, kein Durchfallen.
// 2) autoAuto(): Auto gegen Auto. Jedes Auto = Kapsel aus 2 Kreisen (vorne/hinten).
//               Trennung nach Masse, Stoß längs der Verbindungslinie (Restitution 0,3),
//               Reibung quer dazu. Leichtere/langsamere Autos weichen stärker aus.
//
// Vorzeichen wie überall: seitenabstand > 0 = rechts der Mitte, Normale (nx, nz) nach rechts.
// ============================================================
(function () {
  const R = window.Rennspiel;

  const RESTITUTION = 0.3;      // 0 = klebt, 1 = Flummi
  const REIBUNG = 0.3;          // Reibung quer zur Stoßrichtung (Coulomb-Faktor)
  const BANDE_PARALLEL = 0.8;   // Tempo längs der Bande beim Aufprall
  const BANDE_SCHLEIFEN = 0.996; // pro Schritt, solange das Auto an der Bande schleift

  /**
   * Weiche Bande. Aufruf nach vehicle.schritt().
   * @param {Vehicle} vehicle
   * @param {Strecke} strecke (braucht spline + seitenabstandMax)
   * @param {object} [nah] Ergebnis von spline.naechster()/strecke.abfrage() für die
   *                       aktuelle Position (spart eine Suche); sonst wird gesucht.
   * @returns {number} Aufprall-Stärke in m/s (0 = keine Berührung)
   */
  function bande(vehicle, strecke, nah) {
    const sp = strecke.spline;
    const max = strecke.seitenabstandMax !== undefined ? strecke.seitenabstandMax : strecke.breite / 2 + 40;
    const n = nah || sp.naechster(vehicle.x, vehicle.z, vehicle._bandeIndex);
    vehicle._bandeIndex = n.index;
    const abstand = Math.abs(n.seitenabstand);
    if (abstand <= max) { vehicle._anBande = false; return 0; }

    // Normale an der Projektionsstelle (interpoliert), nach außen gerichtet
    const pk = sp.punkte, a = pk[n.index], b = pk[(n.index + 1) % pk.length];
    let nx = a.nx + (b.nx - a.nx) * n.t, nz = a.nz + (b.nz - a.nz) * n.t;
    const l = Math.hypot(nx, nz) || 1; nx /= l; nz /= l;
    const vz = n.seitenabstand > 0 ? 1 : -1;
    const ax = nx * vz, az = nz * vz;                 // "außen"

    // 1) zurück auf die Grenze schieben
    const tief = abstand - max;
    vehicle.x -= ax * tief; vehicle.z -= az * tief;

    // 2) Tempo: Anteil gegen die Bande weg, Anteil längs der Bande gedämpft
    const v = vehicle.weltGeschwindigkeit();
    const vn = v.x * ax + v.z * az;                    // > 0 = fährt in die Bande
    let px = v.x, pz = v.z, staerke = 0;
    if (vn > 0) { px -= ax * vn; pz -= az * vn; staerke = vn; }
    const neu = !vehicle._anBande;
    const faktor = neu && staerke > 0.5 ? BANDE_PARALLEL : BANDE_SCHLEIFEN;
    vehicle.weltGeschwindigkeitSetzen(px * faktor, pz * faktor);
    vehicle._anBande = true;

    // 3) Heading leicht Richtung Straße drehen: Ziel = Tangente (die Richtung, in die
    //    das Auto ohnehin grob schaut), etwas nach innen geneigt
    let tx = a.tx + (b.tx - a.tx) * n.t, tz = a.tz + (b.tz - a.tz) * n.t;
    const r = vehicle.richtung();
    if (tx * r.x + tz * r.z < 0) { tx = -tx; tz = -tz; }
    const zx = tx - ax * 0.35, zz = tz - az * 0.35;    // leicht nach innen
    const hZiel = Math.atan2(-zx, -zz);
    const diff = R.Vehicle.winkelDiff(hZiel, vehicle.heading);
    // Geschwindigkeit nicht mitdrehen: Welt-Tempo merken, Heading drehen, neu zerlegen
    const vw = vehicle.weltGeschwindigkeit();
    vehicle.heading += Math.max(-0.04, Math.min(0.04, diff * 0.08));
    vehicle.weltGeschwindigkeitSetzen(vw.x, vw.z);
    return staerke;
  }

  /** Kreise (2 pro Auto) einer Kapsel: Mittelpunkte vorne/hinten + Radius. */
  function kapsel(v) {
    const d = v.daten, rad = d.breite / 2;
    const halb = Math.max(0, d.laenge / 2 - rad);
    const r = v.richtung();
    return {
      rad,
      kreise: [
        { x: v.x + r.x * halb, z: v.z + r.z * halb },
        { x: v.x - r.x * halb, z: v.z - r.z * halb },
      ],
    };
  }

  /**
   * Auto-Auto-Kollisionen für alle Paare.
   * @param {Array} fahrzeugListe Vehicles oder Einträge mit .vehicle
   * @param {{countdown?:boolean}} [optionen] countdown = true → nichts tun (Autos stehen dicht)
   * @returns {{a:number, b:number, staerke:number}[]} Stöße (Indizes in der Liste, Stärke in m/s)
   */
  function autoAuto(fahrzeugListe, optionen) {
    const stoesse = [];
    if (optionen && optionen.countdown) return stoesse;
    const autos = fahrzeugListe.map(f => (f && f.vehicle) ? f.vehicle : f);
    const n = autos.length;
    const kapseln = autos.map(kapsel);
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const A = autos[i], B = autos[j], ka = kapseln[i], kb = kapseln[j];
        const grenze = ka.rad + kb.rad;
        // Grobtest: Mittelpunkte weiter auseinander als halbe Längen + Radien
        const dxg = B.x - A.x, dzg = B.z - A.z;
        const weit = A.daten.laenge / 2 + B.daten.laenge / 2 + 0.5;
        if (dxg * dxg + dzg * dzg > weit * weit) continue;
        // tiefstes Kreispaar suchen
        let best = null;
        for (const ca of ka.kreise) {
          for (const cb of kb.kreise) {
            const dx = cb.x - ca.x, dz = cb.z - ca.z, d = Math.hypot(dx, dz);
            if (d < grenze && (!best || grenze - d > best.tief)) best = { dx, dz, d, tief: grenze - d };
          }
        }
        if (!best) continue;
        // Normale von A nach B
        let nx, nz;
        if (best.d > 1e-6) { nx = best.dx / best.d; nz = best.dz / best.d; }
        else { const l = Math.hypot(dxg, dzg) || 1; nx = dxg / l || 1; nz = dzg / l; }

        // "Effektive Masse": schneller = schwerer zu verschieben (langsames Auto weicht aus)
        const mA = A.daten.masse * (1 + 0.04 * A.tempo);
        const mB = B.daten.masse * (1 + 0.04 * B.tempo);
        const invA = 1 / mA, invB = 1 / mB, invSumme = invA + invB;

        // 1) Trennung nach Masse (leichter wird weiter geschoben), kleiner Zuschlag gegen Kleben
        const tief = best.tief + 0.01;
        A.x -= nx * tief * invA / invSumme; A.z -= nz * tief * invA / invSumme;
        B.x += nx * tief * invB / invSumme; B.z += nz * tief * invB / invSumme;

        // 2) Impuls längs der Normalen
        const va = A.weltGeschwindigkeit(), vb = B.weltGeschwindigkeit();
        const rvx = vb.x - va.x, rvz = vb.z - va.z;
        const vRelN = rvx * nx + rvz * nz;            // < 0 = nähern sich
        if (vRelN < 0) {
          const jN = -(1 + RESTITUTION) * vRelN / invSumme;
          // 3) Reibung quer (Tangente)
          const tx = -nz, tz = nx;
          const vRelT = rvx * tx + rvz * tz;
          let jT = -vRelT / invSumme;
          jT = Math.max(-REIBUNG * jN, Math.min(REIBUNG * jN, jT));
          const ix = nx * jN + tx * jT, iz = nz * jN + tz * jT;
          A.weltGeschwindigkeitSetzen(va.x - ix * invA, va.z - iz * invA);
          B.weltGeschwindigkeitSetzen(vb.x + ix * invB, vb.z + iz * invB);
          stoesse.push({ a: i, b: j, staerke: -vRelN });
        }
      }
    }
    return stoesse;
  }

  R.Kollisionen = { bande, autoAuto, kapsel };
})();
