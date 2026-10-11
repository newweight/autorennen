// ============================================================
// Kollisionen (2D auf der Bodenebene, ohne Three.js → Node-Tests)
//
// 1) bande():   unsichtbare, weiche Bande bei |seitenabstand| > strecke.seitenabstandMax.
//               Das Auto wird zurückgeschoben, verliert Tempo, dreht leicht zur Straße.
//               Kein Game Over, kein Durchfallen.
// 2) autoAuto(): Auto gegen Auto. Jedes Auto = Kapsel aus 2 Kreisen (vorne/hinten).
//               Trennung nach Masse, Stoß längs der Verbindungslinie (Restitution 0,3),
//               Reibung quer dazu. Leichtere/langsamere Autos weichen stärker aus.
// 3) hindernisse(): Pylonen, Baken und Äste auf der Fahrbahn (strecke.hindernisse) → Stöße-Liste.
//               Öl- und Sandflecken wirken nicht hier, sondern über den Untergrund (strecke.untergrundAn).
// Autos im Looping (vehicle.imLooping, track/looping.js) sind von allen drei Prüfungen ausgenommen.
// Runde 4: Autos im Flug (vehicle.imFlug, track/schanze.js) sind von autoAuto() und hindernisse() ausgenommen,
//          die Bande wirkt auch im Flug (sonst flöge ein Auto über den Streckenrand hinaus).
// Auf Brücken und in Tunneln liegt die Bande direkt hinter dem Randstreifen (strecke.grenzeBei(s)).
// Runde 4: grenzeBei(s) kennt auch enge Spur-Abschnitte (1 Spur = 5 m): dort Leitplanke direkt am Rand.
// Runde 4: wracksEinbauen(strecke) hängt liegengebliebene ('wrack') und brennende ('brand') Autos aus
//          strecke.wracks als Hindernisse an strecke.hindernisse an (feste Kapsel wie die Bake, KI-Daten wie
//          die Baustelle). hindernisse() meldet Stöße dagegen mit typ 'wrack' / 'brand'.
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
    if (vehicle.imLooping) { vehicle._anBande = false; return 0; }   // im Looping: keine Bande
    const sp = strecke.spline;
    let max = strecke.seitenabstandMax !== undefined ? strecke.seitenabstandMax : strecke.breite / 2 + 40;
    const n = nah || sp.naechster(vehicle.x, vehicle.z, vehicle._bandeIndex);
    vehicle._bandeIndex = n.index;
    // Brücken/Tunnel: Bande direkt am Geländer bzw. an der Tunnelwand (strecke.grenzeBei)
    if (strecke.grenzeBei) max = strecke.grenzeBei(n.s);
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
        // Auto im Looping (track/looping.js) oder im Flug über eine Schanze (track/schanze.js): keine Auto-Auto-Stöße
        if (A.imLooping || B.imLooping || A.imFlug || B.imFlug) continue;
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

  /** Nächster Punkt auf der Strecke a→b zu (x, z): { x, z, d (Abstand) }. */
  function segmentPunkt(ax, az, bx, bz, x, z) {
    const sx = bx - ax, sz = bz - az, l2 = sx * sx + sz * sz || 1;
    const t = Math.max(0, Math.min(1, ((x - ax) * sx + (z - az) * sz) / l2));
    const px = ax + sx * t, pz = az + sz * t;
    return { x: px, z: pz, d: Math.hypot(x - px, z - pz) };
  }

  /**
   * Hindernisse auf der Fahrbahn (strecke.hindernisse, siehe trackBuilder._hindernisseBerechnen).
   * Öl/Sand wirken über den Untergrund (strecke.untergrundAn) – hier nur die festen Dinge:
   *   baustelle: Pylonen (Kreis) – umfahren = kleiner Stoß, Tempo × pylonTempo, Pylone fällt um
   *              (p.weg, blinkt in der Grafik, kommt nach der nächsten Runde des Verursachers zurück);
   *              Bake (Strecke) = wie eine Bande: zurückschieben, Tempo in die Bake weg.
   *   ast:       Kontakt = Tempo × tempoFaktor (−40 %) + Hüpfer (vehicle.huepfer = Startgeschwindigkeit
   *              nach oben in m/s, main.js macht daraus eine kleine Sprungbewegung); danach sperrZeit s Ruhe.
   * @param {Array} fahrzeugListe Vehicles oder Einträge mit .vehicle
   * @param {Strecke} strecke
   * @param {{dt?:number, zeit?:number, countdown?:boolean}} [optionen]
   * @returns {{nr:number, typ:string, staerke:number, hindernis:number}[]} Stöße (für Ton/Kamerawackeln)
   */
  function hindernisse(fahrzeugListe, strecke, optionen) {
    const stoesse = [], liste = strecke && strecke.hindernisse;
    const opt = optionen || {};
    if (!liste || !liste.length || opt.countdown) return stoesse;
    const C = (R.config && R.config.hindernisse) || {};
    const CB = C.baustelle || {}, CA = C.ast || {};
    const dt = opt.dt || 1 / 60, zeit = opt.zeit || 0;
    for (let i = 0; i < fahrzeugListe.length; i++) {
      const f = fahrzeugListe[i], v = (f && f.vehicle) ? f.vehicle : f;
      if (v._astSperre > 0) v._astSperre -= dt;
      if (v.imLooping || v.imFlug) continue;           // im Looping / im Flug über der Straße
      for (let k = 0; k < liste.length; k++) {
        const h = liste[k];
        if (!h.segmente && !h.pylonen) continue;
        const gx = v.x - h.x, gz = v.z - h.z, gr = h.radius + v.daten.laenge;
        if (gx * gx + gz * gz > gr * gr) continue;
        const ka = kapsel(v);
        // Pylonen
        if (h.pylonen) {
          const pr = CB.pylonRadius || 0.35;
          for (const p of h.pylonen) {
            if (p.weg) continue;
            for (const c of ka.kreise) {
              const dx = p.x - c.x, dz = p.z - c.z;
              if (dx * dx + dz * dz > (ka.rad + pr) * (ka.rad + pr)) continue;
              p.weg = true; p.wegZeit = zeit; p.von = i;
              const vw = v.weltGeschwindigkeit(), l = Math.hypot(vw.x, vw.z) || 1;
              p.kx = -vw.z / l; p.kz = vw.x / l;               // Kippachse quer zur Fahrtrichtung
              const staerke = v.tempo * 0.3;
              v.vLaengs *= (CB.pylonTempo !== undefined ? CB.pylonTempo : 0.88);
              strecke.pylonenGeaendert = true;
              stoesse.push({ nr: i, typ: 'pylone', staerke, hindernis: k });
              break;
            }
          }
        }
        // Bake (fest) und Ast
        if (h.segmente) {
          for (const sg of h.segmente) {
            const dicke = sg.dicke || (sg.art === 'ast' ? 0.28 : 0.15);   // Wrack: halbe Autobreite (Kapsel)
            for (const c of ka.kreise) {
              const n = segmentPunkt(sg.ax, sg.az, sg.bx, sg.bz, c.x, c.z);
              const grenze = ka.rad + dicke;
              if (n.d >= grenze) continue;
              if (sg.art === 'ast') {
                if (v._astSperre > 0) break;
                const staerke = v.tempo * 0.4;
                v.vLaengs *= (CA.tempoFaktor !== undefined ? CA.tempoFaktor : 0.6);
                v.vQuer *= 0.7;
                v.huepfer = CA.huepfer !== undefined ? CA.huepfer : 2.2;
                v._astSperre = CA.sperrZeit || 0.8;
                stoesse.push({ nr: i, typ: 'ast', staerke, hindernis: k });
                break;
              }
              // Bake: wie eine Bande – aus der Bake schieben, Tempo in die Bake wegnehmen, Rest dämpfen
              let nx, nz;
              if (n.d > 1e-6) { nx = (c.x - n.x) / n.d; nz = (c.z - n.z) / n.d; }
              else { const r = v.richtung(); nx = -r.x; nz = -r.z; }
              const tief = grenze - n.d + 0.01;
              v.x += nx * tief; v.z += nz * tief;
              const vw = v.weltGeschwindigkeit();
              const vn = vw.x * nx + vw.z * nz;                 // < 0 = fährt in die Bake
              if (vn < 0) {
                const px = vw.x - nx * vn, pz = vw.z - nz * vn;
                v.weltGeschwindigkeitSetzen(px * BANDE_PARALLEL, pz * BANDE_PARALLEL);
                if (-vn > 0.5) stoesse.push({ nr: i, typ: sg.art === 'bake' ? 'bake' : sg.art, staerke: -vn, hindernis: k });
              }
              break;
            }
          }
        }
      }
    }
    return stoesse;
  }

  /**
   * Runde 4: Wracks (strecke.wracks, nur Welten mit Schicht „wracks“) als feste Hindernisse an
   * strecke.hindernisse anhängen. Einmal je Strecke (Merker strecke._wracksEingebaut), ohne Three.js.
   * Ein Wrack steht bei { s, seitenabstand } leicht schräg (Bug zum Fahrbahnrand, config.hindernisse[typ].schraeg)
   * und ist eine Kapsel: Segment längs der Autoachse, dicke = halbe Autobreite (Maße aus carCatalog[autoId]).
   * Felder wie die Baustelle (für KI/Reset): typ 'wrack'|'brand', s, s0, s1, laenge, seitenabstand, halbbreite,
   * seite, gefahr (1.0); dazu x, z, radius, segmente, heading, autoId, laengeAuto, breiteAuto, dreieckS.
   * @returns {number} Anzahl neu angehängter Wracks
   */
  function wracksEinbauen(strecke) {
    if (!strecke || strecke._wracksEingebaut) return 0;
    strecke._wracksEingebaut = true;
    const liste = strecke.wracks || [];
    if (!liste.length || (strecke.aktiveSchichten && strecke.aktiveSchichten.wracks === false)) return 0;
    if (!strecke.hindernisse) strecke.hindernisse = [];
    const C = (R.config && R.config.hindernisse) || {}, sp = strecke.spline;
    const katalog = R.carCatalog || [];
    let n = 0;
    liste.forEach((e) => {
      const typ = e.brennt ? 'brand' : 'wrack', c = C[typ] || C.wrack || {};
      const auto = katalog.find(a => a.id === e.autoId) || null;
      const fw = (auto && auto.fahrwerte) || {};
      const L = fw.laenge || 4.6, B = fw.breite || 1.85;
      const q = e.seitenabstand || 0, seite = q >= 0 ? 1 : -1;
      const s = sp.wrapS(e.s), p = sp.punktBei(s);
      const x = p.x + p.nx * q, z = p.z + p.nz * q;
      const schraeg = c.schraeg !== undefined ? c.schraeg : 0.28;
      // Bug zeigt schräg zum eigenen Fahrbahnrand (rechts: heading kleiner = nach rechts gedreht)
      const heading = Math.atan2(-p.tx, -p.tz) - seite * schraeg;
      const rx = -Math.sin(heading), rz = -Math.cos(heading);
      const halb = Math.max(0, L / 2 - B / 2);
      const laengs = (L / 2) * Math.cos(schraeg) + (B / 2) * Math.sin(schraeg);   // Ausdehnung längs der Strecke
      const quer = (L / 2) * Math.sin(schraeg) + (B / 2) * Math.cos(schraeg);     // Ausdehnung quer
      const h = {
        nr: strecke.hindernisse.length, typ, gefahr: c.gefahr !== undefined ? c.gefahr : 1.0,
        s, s0: sp.wrapS(s - laengs - 1), s1: sp.wrapS(s + laengs + 1), laenge: 2 * laengs + 2,
        seitenabstand: q, halbbreite: quer + 0.3, seite,
        x, z, radius: L / 2 + 1, heading, autoId: auto ? auto.id : e.autoId, laengeAuto: L, breiteAuto: B,
        dreieckS: sp.wrapS(s - (c.dreieckAbstand || 9)),
        segmente: [{ ax: x + rx * halb, az: z + rz * halb, bx: x - rx * halb, bz: z - rz * halb, art: typ, dicke: B / 2 }],
      };
      strecke.hindernisse.push(h);
      n++;
    });
    return n;
  }

  R.Kollisionen = { bande, autoAuto, kapsel, hindernisse, wracksEinbauen };
})();
