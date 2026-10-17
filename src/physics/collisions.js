// ============================================================
// Kollisionen (2D auf der Bodenebene, ohne Three.js → Node-Tests)
//
// 1) bande():   unsichtbare, weiche Bande bei |seitenabstand| > strecke.grenzeBei(s) (sonst seitenabstandMax).
//               Runde 5: geprüft wird die KAROSSERIE (4 Ecken), nicht nur die Mitte – kein Blech mehr durch
//               Zaun, Geländer, Leitplanke oder Tunnelwand (die Deko steht genau an der Grenze). Dazu feste
//               Säulen (strecke.saeulen: Startbogen-Masten, Looping-Beine).
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
// Runde 6 (W1): autoAuto() rechnet mit gedrehten Rechtecken (OBB, laenge × breite) und SAT statt Kapseln, in
//          config.kollision.teilschritte (2) Durchgängen, mit Mindestabstand 0,1 m und Sweep (Position vor dem Schritt,
//          vehicle._kollAlt) gegen Durchschießen bei 75 m/s; optional Rempeln 'echt' (Drehen/Abdrängen/Schieben).
//          loopingAbstand(): zwei Autos im selben Looping halten Abstand (Bogenlänge). pflanzenSammeln()/pflanzen():
//          Bäume, Felsen, Büsche zwischen Straße und Zaun als Kreis-Kollider (nur Physik, Draw-Calls unverändert).
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
   * Bande (Runde 5: Karosserie statt Mittelpunkt). Aufruf nach vehicle.schritt().
   * Geprüft werden die 4 Ecken der Karosserie (laenge × breite): keine Ecke darf weiter als grenzeBei(s) von der
   * Mitte ihres Streckenstücks sein (Zaun-Deko, Geländer, Tunnelwand und Leitplanke stehen genau dort). Die
   * tiefste Ecke wird zurückgeschoben (bis zu 3 Durchgänge), das Tempo in die Bande weggenommen, der Rest
   * gedämpft, das Auto leicht zur Straße gedreht. Kein Game Over, kein Durchfallen.
   * Runde 5: zusätzlich feste Säulen (strecke.saeulen: Startbogen-Masten, Looping-Beine) als Kreise.
   * @param {Vehicle} vehicle
   * @param {Strecke} strecke (braucht spline + seitenabstandMax, optional grenzeBei/saeulen)
   * @param {object} [nah] Ergebnis von spline.naechster()/strecke.abfrage() für die aktuelle Position
   *                       (spart eine Suche); sonst wird gesucht.
   * @returns {number} Aufprall-Stärke in m/s (0 = keine Berührung)
   */
  function bande(vehicle, strecke, nah) {
    if (vehicle.imLooping) { vehicle._anBande = false; return 0; }   // im Looping: keine Bande
    const sp = strecke.spline;
    const maxStd = strecke.seitenabstandMax !== undefined ? strecke.seitenabstandMax : strecke.breite / 2 + 40;
    const grenze = (s) => (strecke.grenzeBei ? strecke.grenzeBei(s) : maxStd);
    // W4-J: an einer niveaugleichen Kreuzung mit Index-Kontinuität – die Bande gilt für den EIGENEN Abschnitt
    // 14.10. (v18): auch an einer Gabelung (Seitenabstand relativ zum nächsten Ast, strecke._gabelAnpassen)
    const kont = ((strecke.kreuzungen && strecke.kreuzungen.length) || (strecke.gabelungen && strecke.gabelungen.length)) && strecke._naechsterKont;
    // v16: + Abschnittswechsel beim Abbiegen (strecke._naechsterWechsel): auf der Querstraße gilt deren Bande, keine Wand quer über der Straße
    const kontF = strecke._naechsterWechsel || strecke._naechsterKont;
    const such = kont ? (x, z, i) => kontF.call(strecke, x, z, i) : (x, z, i) => sp.naechster(x, z, i);
    const n = nah || such(vehicle.x, vehicle.z, vehicle._bandeIndex);
    vehicle._bandeIndex = n.index;
    const pk = sp.punkte, d = vehicle.daten;
    const hl = (d.laenge || 4.4) / 2, hb = (d.breite || 1.8) / 2;
    let staerke = 0, beruehrt = false, tx = 0, tz = 0, ax = 0, az = 0;
    /** Tiefste Ecke (oder Mitte) über der Grenze zurückschieben, Tempo in die Bande weg; true = es gab etwas. */
    const schieben = () => {
      const r = vehicle.richtung(), q = vehicle.rechts();
      let tief = 0, best = null;
      for (let k = 0; k < 5; k++) {
        const la = k === 4 ? 0 : (k < 2 ? hl : -hl), qa = k === 4 ? 0 : (k % 2 ? hb : -hb);
        const x = vehicle.x + r.x * la + q.x * qa, z = vehicle.z + r.z * la + q.z * qa;
        const e = such(x, z, vehicle._bandeIndex);
        const ue = Math.abs(e.seitenabstand) - grenze(e.s);
        if (ue > tief) { tief = ue; best = e; }
      }
      if (!best) return false;
      // Normale an der Projektionsstelle (interpoliert), nach außen gerichtet
      const a = pk[best.index], b = pk[(best.index + 1) % pk.length];
      let nx = a.nx + (b.nx - a.nx) * best.t, nz = a.nz + (b.nz - a.nz) * best.t;
      const l = Math.hypot(nx, nz) || 1; nx /= l; nz /= l;
      const vz = best.seitenabstand > 0 ? 1 : -1;
      ax = nx * vz; az = nz * vz;
      tx = a.tx + (b.tx - a.tx) * best.t; tz = a.tz + (b.tz - a.tz) * best.t;
      // 1) zurück hinter die Grenze schieben (+1 cm, damit es nicht flackert)
      vehicle.x -= ax * (tief + 0.01); vehicle.z -= az * (tief + 0.01);
      // 2) Tempo: Anteil gegen die Bande weg
      const v = vehicle.weltGeschwindigkeit();
      const vn = v.x * ax + v.z * az;                  // > 0 = fährt in die Bande
      if (vn > 0) { vehicle.weltGeschwindigkeitSetzen(v.x - ax * vn, v.z - az * vn); staerke = Math.max(staerke, vn); }
      return true;
    };
    for (let runde = 0; runde < 3 && schieben(); runde++) beruehrt = true;
    if (beruehrt) {
      // Rest längs der Bande dämpfen (erster Kontakt kräftiger, Schleifen schwach)
      const neu = !vehicle._anBande;
      const faktor = neu && staerke > 0.5 ? BANDE_PARALLEL : BANDE_SCHLEIFEN;
      const v = vehicle.weltGeschwindigkeit();
      vehicle.weltGeschwindigkeitSetzen(v.x * faktor, v.z * faktor);
      // 3) Heading leicht Richtung Straße drehen: Ziel = Tangente, etwas nach innen geneigt
      const r = vehicle.richtung();
      if (tx * r.x + tz * r.z < 0) { tx = -tx; tz = -tz; }
      const zx = tx - ax * 0.35, zz = tz - az * 0.35;
      const hZiel = Math.atan2(-zx, -zz);
      const diff = R.Vehicle.winkelDiff(hZiel, vehicle.heading);
      const vw = vehicle.weltGeschwindigkeit();      // Geschwindigkeit nicht mitdrehen
      vehicle.heading += Math.max(-0.04, Math.min(0.04, diff * 0.08));
      vehicle.weltGeschwindigkeitSetzen(vw.x, vw.z);
      // Drehen schiebt evtl. eine Ecke wieder hinaus → nochmal zurückschieben (Auto „rollt" an der Bande ab)
      for (let runde = 0; runde < 2 && schieben(); runde++);
    }
    vehicle._anBande = beruehrt;
    // Säulen (Startbogen, Looping-Beine)
    const sa = strecke.saeulen;
    if (sa && sa.length) staerke = Math.max(staerke, saeulen(vehicle, sa));
    return staerke;
  }

  /** Feste Säulen { x, z, r }: Auto-Kapsel herausschieben, Tempo in die Säule weg. Liefert die Stoßstärke. */
  function saeulen(vehicle, liste) {
    let staerke = 0;
    const gr = vehicle.daten.laenge / 2 + 1.5;
    for (let i = 0; i < liste.length; i++) {
      const s = liste[i], gx = vehicle.x - s.x, gz = vehicle.z - s.z;
      if (gx * gx + gz * gz > (gr + s.r) * (gr + s.r)) continue;
      const ka = kapsel(vehicle);
      for (const c of ka.kreise) {
        const dx = c.x - s.x, dz = c.z - s.z, dd = Math.hypot(dx, dz), g = ka.rad + s.r;
        if (dd >= g) continue;
        let nx, nz;
        if (dd > 1e-6) { nx = dx / dd; nz = dz / dd; } else { const r = vehicle.richtung(); nx = -r.x; nz = -r.z; }
        vehicle.x += nx * (g - dd + 0.01); vehicle.z += nz * (g - dd + 0.01);
        const vw = vehicle.weltGeschwindigkeit(), vn = vw.x * nx + vw.z * nz;
        if (vn < 0) {
          vehicle.weltGeschwindigkeitSetzen((vw.x - nx * vn) * BANDE_PARALLEL, (vw.z - nz * vn) * BANDE_PARALLEL);
          staerke = Math.max(staerke, -vn);
        }
      }
    }
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

  // ------------------------------------------------------------------ Runde 6: Auto↔Auto als gedrehte Rechtecke

  function KC() { return (R.config && R.config.kollision) || {}; }

  /** Rechteck (OBB) eines Autos; mit pose = { x, z, h } an einer anderen Stelle (Sweep: Position vor dem Schritt). */
  function box(v, pose) {
    const h = pose ? pose.h : v.heading, d = v.daten;
    return {
      x: pose ? pose.x : v.x, z: pose ? pose.z : v.z,
      rx: -Math.sin(h), rz: -Math.cos(h), qx: Math.cos(h), qz: -Math.sin(h),
      hl: (d.laenge || 4.4) / 2, hb: (d.breite || 1.8) / 2,
    };
  }
  /** Halbe Ausdehnung des Rechtecks längs der Achse (ax, az). */
  function radiusAuf(b, ax, az) { return b.hl * Math.abs(b.rx * ax + b.rz * az) + b.hb * Math.abs(b.qx * ax + b.qz * az); }
  /** Überlappung zweier Rechtecke längs einer Achse (> 0 = überlappen, < 0 = Luft) und Mittelpunkt-Abstand d (A→B). */
  function ueberlappung(a, b, ax, az) {
    const d = (b.x - a.x) * ax + (b.z - a.z) * az;
    return { ov: radiusAuf(a, ax, az) + radiusAuf(b, ax, az) - Math.abs(d), d };
  }
  function achsen(a, b) { return [[a.rx, a.rz], [a.qx, a.qz], [b.rx, b.rz], [b.qx, b.qz]]; }

  /**
   * Abstand zweier Autos als Rechtecke (SAT): > 0 = Luft (größte Trennung über die 4 Achsen, untere Schranke des
   * echten Abstands), < 0 = Durchdringung (kleinste Überlappung). Für Tests (rempeln_test, test_kollisionen).
   */
  function obbAbstand(A, B) {
    const a = box(A), b = box(B);
    let minOv = Infinity;
    for (const [ax, az] of achsen(a, b)) minOv = Math.min(minOv, ueberlappung(a, b, ax, az).ov);
    return -minOv;
  }

  /**
   * v28c (nur Anzeige, vorhersage.js NetzVorhersage.trennen): Durchdringung zweier Rechtecke OHNE Impuls/Trennung (nichts wird verändert).
   * altA/altB = Posen { x, z, h } des vorigen Bildes: waren sie da noch getrennt, gilt wie in kontakt() die Achse, die zuletzt überlappt hat
   * (Aufprallrichtung – sonst würde ein tief steckendes Auto zur Seite statt zurück geschoben). Liefert null (keine Überlappung) oder
   * { nx, nz (A→B), tief (m) }: A um −n·tief verschieben trennt die beiden gerade.
   */
  function eindringung(A, B, altA, altB) {
    const sa = A._kollAlt, sb = B._kollAlt;
    A._kollAlt = altA || null; B._kollAlt = altB || null;
    try {
      const k = kontakt(A, B, 0);
      return k && k.tief > 0 ? { nx: k.nx, nz: k.nz, tief: k.tief } : null;
    } finally { A._kollAlt = sa; B._kollAlt = sb; }
  }

  /** Eckpunkte eines Rechtecks. */
  function ecken(b) {
    const l = [];
    for (const [s, t] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) l.push({ x: b.x + b.rx * b.hl * s + b.qx * b.hb * t, z: b.z + b.rz * b.hl * s + b.qz * b.hb * t });
    return l;
  }
  function innen(b, p, tol) {
    const dx = p.x - b.x, dz = p.z - b.z;
    return Math.abs(dx * b.rx + dz * b.rz) <= b.hl + tol && Math.abs(dx * b.qx + dz * b.qz) <= b.hb + tol;
  }
  /** Ungefährer Berührpunkt: Mittel der Ecken, die im anderen Rechteck liegen (sonst Mitte zwischen den Autos). */
  function beruehrpunkt(a, b) {
    let sx = 0, sz = 0, n = 0;
    for (const p of ecken(a)) if (innen(b, p, 0.12)) { sx += p.x; sz += p.z; n++; }
    for (const p of ecken(b)) if (innen(a, p, 0.12)) { sx += p.x; sz += p.z; n++; }
    return n ? { x: sx / n, z: sz / n } : { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 };
  }

  /**
   * Kontakt zweier Autos (SAT). Sweep: waren beide vor dem Schritt (vehicle._kollAlt) noch getrennt, gilt die
   * Achse, die als letzte überlappt hat (= tatsächliche Aufprallrichtung) – so wird auch bei 75 m/s frontal
   * nicht seitlich „durchgedrückt". Liefert null (Luft ≥ luft) oder { nx, nz (A→B), tief (m bis Berührung) }.
   */
  function kontakt(A, B, luft) {
    const a = box(A), b = box(B), ax = achsen(a, b);
    let minOv = Infinity, minI = 0;
    const ov1 = [];
    for (let k = 0; k < 4; k++) {
      const u = ueberlappung(a, b, ax[k][0], ax[k][1]);
      ov1.push(u);
      if (u.ov < minOv) { minOv = u.ov; minI = k; }
    }
    if (minOv <= -luft) return null;
    let wahl = minI, vz = ov1[minI].d >= 0 ? 1 : -1;
    const altA = A._kollAlt, altB = B._kollAlt;
    if (altA && altB && minOv > 0 &&
        Math.hypot(A.x - altA.x, A.z - altA.z) < 10 && Math.hypot(B.x - altB.x, B.z - altB.z) < 10) {
      const a0 = box(A, altA), b0 = box(B, altB);
      let bestT = -1;
      for (let k = 0; k < 4; k++) {
        const u0 = ueberlappung(a0, b0, ax[k][0], ax[k][1]);
        if (u0.ov >= 0) continue;                       // auf dieser Achse schon vorher überlappt
        const t = -u0.ov / Math.max(1e-9, ov1[k].ov - u0.ov);
        if (t > bestT) { bestT = t; wahl = k; vz = u0.d >= 0 ? 1 : -1; }
      }
    }
    const nx = ax[wahl][0] * vz, nz = ax[wahl][1] * vz;
    // nötige Verschiebung längs n, bis die Rechtecke sich gerade berühren (auch wenn die Mitten schon „vorbei" sind)
    const d = (b.x - a.x) * nx + (b.z - a.z) * nz;
    const tief = radiusAuf(a, nx, nz) + radiusAuf(b, nx, nz) - d;
    return { nx, nz, tief, a, b };
  }

  /**
   * Auto-Auto-Kollisionen für alle Paare (Runde 6: gedrehte Rechtecke, SAT, 2 Teilschritte, Mindestabstand,
   * Sweep gegen Durchschießen; optional Rempeln „echt").
   * Trennung nach „effektiver Masse" (schneller = schwerer zu verschieben, ein Auto an der Bande gilt als 10× so
   * schwer → das andere weicht aus), Stoß längs der Normalen (Restitution 0,3), Reibung quer dazu.
   * rempeln 'echt' (optionen.rempeln): je Treffer genau ein Effekt für das getroffene Auto (Opfer = das, auf das
   * sich das andere schneller zubewegt), höchstens einmal je sperrZeit:
   *   Winkel < 15°, seitlich     → nur schieben (nebeneinander), keine Drehung
   *   Winkel < 15°, Auffahrer    → Drehung nur, wenn versetzt (Hebelarm; mittig: nur Stoß)
   *   von hinten, 15–45°         → Opfer wird abgedrängt (Querimpuls 3–6 m/s × Massenverhältnis)
   *   sonst (seitlich/versetzt)  → Drehimpuls aus Hebelarm × Stoß / Trägheitsmoment (vehicle.drehImpuls, ≤ drehMax)
   * @param {Array} fahrzeugListe Vehicles oder Einträge mit .vehicle
   * @param {{countdown?:boolean, rempeln?:'sanft'|'echt', dt?:number}} [optionen] countdown = true → nichts tun
   * @returns {{a:number, b:number, staerke:number, art?:string, dreht?:boolean[]}[]} Stöße (Indizes, Stärke in m/s)
   */
  function autoAuto(fahrzeugListe, optionen) {
    const stoesse = [];
    const opt = optionen || {};
    const autos = fahrzeugListe.map(f => (f && f.vehicle) ? f.vehicle : f);
    const n = autos.length;
    if (opt.countdown) { for (let i = 0; i < n; i++) autos[i]._kollAlt = null; return stoesse; }
    const C = KC(), RP = C.rempeln || {};
    const echt = opt.rempeln === 'echt';
    const dt = opt.dt || 1 / 60;
    const luft = C.mindestAbstand !== undefined ? C.mindestAbstand : 0.1;
    const RESTI = C.restitution !== undefined ? C.restitution : RESTITUTION;
    const REIB = C.reibung !== undefined ? C.reibung : REIBUNG;
    if (echt) for (let i = 0; i < n; i++) if (autos[i]._rempelSperre > 0) autos[i]._rempelSperre -= dt;
    const gemeldet = new Map();          // Paar → Stoß (je Paar höchstens einer)
    const durchgaenge = Math.max(1, C.teilschritte || 2);
    for (let durch = 0; durch < durchgaenge; durch++) {
      for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
          const A = autos[i], B = autos[j];
          // 15.10. (v25): optionaler Paarfilter (Online-Geistermodus: nur Paare mit Verkehrswagen stoßen) – ohne opt.paarNur wie bisher
          if (opt.paarNur && !opt.paarNur(fahrzeugListe[i], fahrzeugListe[j])) continue;
          if (A.verkehrWagen && B.verkehrWagen) continue;      // 15.10. (v25): Verkehrswagen (Geisterfahrer/Krankenwagen/Abschleppwagen) stoßen nicht untereinander
          // Auto im Looping (track/looping.js) oder im Flug über eine Schanze (track/schanze.js): keine Auto-Auto-Stöße
          if (A.imLooping || B.imLooping || A.imFlug || B.imFlug) continue;
          // W4-I: übereinander (Überführung, |Δy| ≥ hoeheTrennung, Standard 2 m) → keine Berührung
          if (Math.abs((A.y || 0) - (B.y || 0)) >= (C.hoeheTrennung !== undefined ? C.hoeheTrennung : 2)) continue;
          const dxg = B.x - A.x, dzg = B.z - A.z;
          const weit = Math.hypot(A.daten.laenge, A.daten.breite) / 2 + Math.hypot(B.daten.laenge, B.daten.breite) / 2 + luft + 0.05;
          if (dxg * dxg + dzg * dzg > weit * weit) continue;
          const k = kontakt(A, B, luft);
          if (!k) continue;
          const nx = k.nx, nz = k.nz;
          // "Effektive Masse": schneller = schwerer zu verschieben (langsames Auto weicht aus); an der Bande ×10
          const mA = A.daten.masse * (1 + 0.04 * A.tempo) * (A._anBande ? 10 : 1);
          const mB = B.daten.masse * (1 + 0.04 * B.tempo) * (B._anBande ? 10 : 1);
          const invA = 1 / mA, invB = 1 / mB, invSumme = invA + invB;
          // 1) Trennung nach Masse auf Mindestabstand (luft)
          const tief = k.tief + luft;
          A.x -= nx * tief * invA / invSumme; A.z -= nz * tief * invA / invSumme;
          B.x += nx * tief * invB / invSumme; B.z += nz * tief * invB / invSumme;
          // (auch in der Luft-Zone < luft: nähern sie sich, gibt es den Stoß – sonst „gleiten" langsame Autos nur)
          // 2) Impuls längs der Normalen (Stoß-Massen ohne Bande-Zuschlag)
          const sA = 1 / (A.daten.masse * (1 + 0.04 * A.tempo)), sB = 1 / (B.daten.masse * (1 + 0.04 * B.tempo)), sSum = sA + sB;
          const va = A.weltGeschwindigkeit(), vb = B.weltGeschwindigkeit();
          const rvx = vb.x - va.x, rvz = vb.z - va.z;
          const vRelN = rvx * nx + rvz * nz;            // < 0 = nähern sich
          if (vRelN >= 0) continue;
          const jN = -(1 + RESTI) * vRelN / sSum;
          // 3) Reibung quer (Tangente)
          const tx = -nz, tz = nx;
          const vRelT = rvx * tx + rvz * tz;
          let jT = -vRelT / sSum;
          jT = Math.max(-REIB * jN, Math.min(REIB * jN, jT));
          const ix = nx * jN + tx * jT, iz = nz * jN + tz * jT;
          const agA = (va.x * nx + va.z * nz) >= -(vb.x * nx + vb.z * nz);   // Rempler = wer schneller auf den anderen zufährt
          A.weltGeschwindigkeitSetzen(va.x - ix * sA, va.z - iz * sA);
          B.weltGeschwindigkeitSetzen(vb.x + ix * sB, vb.z + iz * sB);
          const schluessel = i * 4096 + j;
          let st = gemeldet.get(schluessel);
          if (!st) { st = { a: i, b: j, staerke: 0 }; gemeldet.set(schluessel, st); stoesse.push(st); }
          st.staerke = Math.max(st.staerke, -vRelN);
          // 4) Rempeln „echt"
          if (echt && -vRelN >= (RP.mindestTempo || 1)) rempeln(A, B, agA, nx, nz, -vRelN, jN, k, st, RP);
        }
      }
    }
    for (let i = 0; i < n; i++) {
      const v = autos[i];
      const alt = v._kollAlt || (v._kollAlt = {});
      alt.x = v.x; alt.z = v.z; alt.h = v.heading;
    }
    return stoesse;
  }

  /** Runde 6: Rempel-Effekt (nur 'echt') für das getroffene Auto. n zeigt von A nach B, ann = Annäherung (m/s). */
  function rempeln(A, B, agA, nx, nz, ann, jN, k, st, RP) {
    // Opfer = das Auto, auf das sich das andere schneller zubewegt (agA: A ist der Rempler)
    const G = agA ? A : B, V = agA ? B : A;
    const sx = agA ? nx : -nx, sz = agA ? nz : -nz;     // Normale vom Rempler zum Opfer
    if (V._rempelSperre > 0) return;
    const delta = Math.abs(R.Vehicle.winkelDiff(G.heading, V.heading));   // 0 = gleiche Richtung
    const rv = V.richtung();
    const hinten = (G.x - V.x) * rv.x + (G.z - V.z) * rv.z < 0 && delta < Math.PI / 2;
    const flach = (RP.flachGrad || 15) * Math.PI / 180, schraeg = (RP.schraegGrad || 45) * Math.PI / 180;
    const mG = G.daten.masse, mV = V.daten.masse;
    const sperre = RP.sperrZeit || 0.6;
    // längs = Stoß trifft Heck/Bug (Normale längs zum Opfer) → versetzter Auffahrer kann drehen (Hebelarm unten)
    const laengs = Math.abs(sx * rv.x + sz * rv.z) > 0.7;
    if (hinten && delta < flach && !laengs) {
      st.art = 'schieben';                       // nebeneinander: nur der normale Stoß, keine Drehung
      return;
    }
    if (hinten && delta >= flach && delta <= schraeg) {
      // abdrängen: Querimpuls auf das Opfer, Richtung = Seite, auf die n zeigt (vom Rempler weg)
      const q = V.rechts();
      let seite = Math.sign(sx * q.x + sz * q.z);
      if (!seite) { const gr = G.richtung(); seite = Math.sign(gr.x * q.x + gr.z * q.z) || 1; }
      const mv = Math.max(0.5, Math.min(1.5, 2 * mG / (mG + mV)));
      const qMin = RP.querMin || 3, qMax = RP.querMax || 6;
      const dv = Math.max(qMin * 0.5, Math.min(qMax * 1.25, Math.max(qMin, Math.min(qMax, qMin + 0.15 * ann)) * mv));
      V.vQuer += seite * dv;
      V._rempelSperre = sperre;
      st.art = 'abdraengen';
      return;
    }
    // drehen: Drehimpuls aus Hebelarm × Stoß (beide Autos, Gegenmoment für den Rempler)
    const c = beruehrpunkt(k.a, k.b);
    const dreh = (W, jx, jz) => {
      const rxw = c.x - W.x, rzw = c.z - W.z;
      const tau = rzw * jx - rxw * jz;            // y-Komponente von r × J (heading wächst mit +ω)
      const d = W.daten, I = d.masse * ((d.laenge || 4.4) ** 2 + (d.breite || 1.8) ** 2) / 12;
      return tau / I * (RP.drehFaktor || 1);
    };
    const max = RP.drehMax || 4.7, min = RP.drehMin || 1.2;
    const wV = dreh(V, sx * jN, sz * jN), wG = dreh(G, -sx * jN, -sz * jN);
    const dreht = [false, false];
    if (Math.abs(wV) >= min) {
      V.drehImpuls = Math.max(-max, Math.min(max, (V.drehImpuls || 0) + wV));
      V._rempelSperre = sperre;
      dreht[agA ? 1 : 0] = true;
    }
    if (Math.abs(wG) >= min && !(G._rempelSperre > 0)) {
      G.drehImpuls = Math.max(-max, Math.min(max, (G.drehImpuls || 0) + wG));
      G._rempelSperre = sperre;
      dreht[agA ? 0 : 1] = true;
    }
    if (dreht[0] || dreht[1]) { st.art = 'drehen'; st.dreht = dreht; }
    else st.art = 'stoss';
  }

  /**
   * Runde 6: zwei Autos im selben Looping dürfen nicht ineinander fahren (Bahn-Bogenlänge = Winkel × Radius).
   * Das hintere Auto wird auf Abstand (Länge + loopingAbstand) zurückgesetzt und höchstens so schnell wie das vordere;
   * liegt der Platz noch vor der Einfahrt, fährt es eben erst einen Moment später ein (Auto zurück auf die Straße,
   * Tempo ≥ vMin, damit die Einfahrt klappt). Ändert nur die Zustände f.looping (track/looping.js bleibt unverändert).
   * @param {Array} fahrzeugListe Einträge { vehicle, looping }
   * @param {Strecke} strecke
   * @returns {number} Anzahl Korrekturen
   */
  function loopingAbstand(fahrzeugListe, strecke) {
    if (!strecke || !strecke.loopings || !strecke.loopings.length) return 0;
    const drin = [];
    for (let i = 0; i < fahrzeugListe.length; i++) {
      const f = fahrzeugListe[i];
      if (f && f.looping && f.looping.aktiv && f.looping.looping) drin.push(f);
    }
    if (drin.length < 2) return 0;
    const luft = KC().loopingAbstand !== undefined ? KC().loopingAbstand : 0.1;
    let n = 0;
    // nach Winkel absteigend: vorderes zuerst, jedes folgende hält Abstand zum davor
    drin.sort((x, y) => y.looping.winkel - x.looping.winkel);
    for (let a = 0; a < drin.length; a++) {
      for (let b = a + 1; b < drin.length; b++) {
        const F = drin[a], H = drin[b], lv = F.looping, lh = H.looping;
        if (!lh.aktiv || !lv.aktiv || lh.looping !== lv.looping) continue;
        const L = lv.looping, r = L.radius;
        const mind = (F.vehicle.daten.laenge + H.vehicle.daten.laenge) / 2 + luft;
        const luecke = (lv.winkel - lh.winkel) * r;
        if (luecke >= mind - 1e-9) continue;
        n++;
        const wNeu = lv.winkel - mind / r;
        if (wNeu >= 0) {
          lh.winkel = wNeu; lh.winkelVorher = Math.min(lh.winkelVorher, wNeu);
          lh.v = Math.min(lh.v, Math.max(lv.v, 0.6));
        } else {
          // noch kein Platz im Looping: zurück vor die Einfahrt (Bogenlänge −wNeu·r davor), gleich wieder einfahren
          const v = H.vehicle, sp = strecke.spline;
          const p = sp.punktBei(L.s + wNeu * r - 0.05), q = lh.qEin || 0;
          v.x = p.x + p.nx * q; v.z = p.z + p.nz * q; v.heading = R.headingAus(p.tx, p.tz);
          v.vLaengs = Math.max(L.vMin * 1.02, Math.min(lh.v, Math.max(lv.v, L.vMin * 1.02))); v.vQuer = 0;
          v.y = strecke.hoeheAn(v.x, v.z);
          lh.aktiv = false; lh.winkel = 0; lh.winkelVorher = 0; lh.looping = null; v.imLooping = false;
          v._kollAlt = null;
        }
      }
    }
    return n;
  }

  // ------------------------------------------------------------------ Runde 6: Pflanzen/Felsen als Kollider

  /**
   * Kreis-Kollider aus der Deko (themes.dekoBauen-Gruppe) sammeln: nur Instanzen zwischen Straße und Zaun
   * (|seitenabstand| < grenzeBei(s) + zugabe). Radius = größter waagrechter Abstand der Geometrie-Punkte im
   * unteren fussHoehe-m-Bereich (Stamm statt Krone; Kronen hoch oben zählen nicht). Gleiche Stelle mehrerer
   * Meshes (Stamm + Krone) → ein Kollider. Ergebnis: strecke.pflanzenKollider = [{ x, z, r, art 'fest'|'weich',
   * name }] + Raster (strecke._pflanzenRaster). Ohne THREE: liest nur instanceMatrix.array und
   * geometry.attributes.position.array. Draw-Calls unverändert (nur Physik).
   * @returns {number} Anzahl Kollider
   */
  function pflanzenSammeln(strecke, gruppe) {
    const P = (R.config && R.config.pflanzen) || {};
    const fest = new Set(P.fest || []), weich = new Set(P.weich || []);
    const liste = [];
    strecke.pflanzenKollider = liste;
    strecke._pflanzenRaster = null;
    if (!gruppe || !strecke || !strecke.spline) return 0;
    const meshes = [];
    const besuche = (o) => {
      if (o.isInstancedMesh && (fest.has(o.name) || weich.has(o.name))) meshes.push(o);
      (o.children || []).forEach(besuche);
    };
    besuche(gruppe);
    const sp = strecke.spline, zugabe = P.zugabe !== undefined ? P.zugabe : 2, fuss = P.fussHoehe || 0.9;
    const boden = (x, z) => (strecke.bodenHoehe ? strecke.bodenHoehe(x, z) : (strecke.hoeheAn ? strecke.hoeheAn(x, z) : 0));
    const grenze = (s) => (strecke.grenzeBei ? strecke.grenzeBei(s) : strecke.seitenabstandMax);
    const nachStelle = new Map();
    // Vorfilter (schnell): grobes Raster der Streckenpunkte – Instanzen weit weg von jedem Punkt gar nicht erst suchen
    const gMax = (strecke.seitenabstandMax || 30) + zugabe + 6, Z = 25, pr = new Map();
    sp.punkte.forEach((p) => { const key = Math.floor(p.x / Z) * 100003 + Math.floor(p.z / Z); (pr.get(key) || pr.set(key, []).get(key)).push(p); });
    const nahGenug = (x, z) => {
      const cx = Math.floor(x / Z), cz = Math.floor(z / Z), r = Math.ceil(gMax / Z);
      for (let a = -r; a <= r; a++) for (let b = -r; b <= r; b++) {
        const l = pr.get((cx + a) * 100003 + (cz + b));
        if (l) for (let k = 0; k < l.length; k++) if (Math.abs(l[k].x - x) < gMax && Math.abs(l[k].z - z) < gMax) return true;
      }
      return false;
    };
    meshes.forEach((m) => {
      const art = fest.has(m.name) ? 'fest' : 'weich';
      const pos = m.geometry && m.geometry.attributes && m.geometry.attributes.position;
      const mat = m.instanceMatrix && m.instanceMatrix.array;
      if (!pos || !mat) return;
      const pa = pos.array, pn = pos.count !== undefined ? pos.count : pa.length / 3;
      const anz = m.count !== undefined ? m.count : mat.length / 16;
      let box3 = null;            // Geometrie-Box (lokal) für den Körper der weichen Kollider
      if (art === 'weich' && pn > 0) {
        let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, z0 = Infinity, z1 = -Infinity;
        for (let k = 0; k < pn; k++) {
          const px = pa[k * 3], py = pa[k * 3 + 1], pz = pa[k * 3 + 2];
          if (px < x0) x0 = px; if (px > x1) x1 = px; if (py < y0) y0 = py; if (py > y1) y1 = py; if (pz < z0) z0 = pz; if (pz > z1) z1 = pz;
        }
        box3 = { cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, cz: (z0 + z1) / 2, ex: (x1 - x0) / 2, ey: (y1 - y0) / 2, ez: (z1 - z0) / 2 };
      }
      for (let i = 0; i < anz; i++) {
        const e = mat, o = i * 16;
        const x = e[o + 12], z = e[o + 14];
        if (!nahGenug(x, z)) continue;
        const nah = sp.naechster(x, z);
        if (Math.abs(nah.seitenabstand) > grenze(nah.s) + zugabe + 3) continue;   // grob (Radius kommt noch)
        const yb = boden(x, z);
        let r = 0;
        for (let k = 0; k < pn; k++) {
          const px = pa[k * 3], py = pa[k * 3 + 1], pz = pa[k * 3 + 2];
          const wy = e[o + 1] * px + e[o + 5] * py + e[o + 9] * pz + e[o + 13];
          if (wy - yb > fuss) continue;
          const wx = e[o + 0] * px + e[o + 4] * py + e[o + 8] * pz;
          const wz = e[o + 2] * px + e[o + 6] * py + e[o + 10] * pz;
          r = Math.max(r, Math.hypot(wx, wz));
        }
        if (r < (P.rMin || 0.25)) continue;
        r = Math.min(r, art === 'fest' ? (P.rMaxFest || 3) : (P.rMaxWeich || 2.5));
        if (Math.abs(nah.seitenabstand) - r > grenze(nah.s) + zugabe) continue;
        // 14.10. (v20, Bug „Auto im Grünen"): weicher Kollider = Körper (Ellipsoid ≈ 0,85 der Geometrie-Box) mit Mittelhöhe cy (über dem Boden),
        // Halbhöhe ay und waagrechtem Halbmesser ah (die längere Achse); pflanzen() lässt das Auto nicht tiefer hinein, als der Körper dort noch Autohöhe hat
        let kern = null;
        if (art === 'weich' && box3) {
          const L = (a, b, c) => Math.hypot(e[o + a], e[o + b], e[o + c]);
          const cy = e[o + 1] * box3.cx + e[o + 5] * box3.cy + e[o + 9] * box3.cz + e[o + 13] - yb;
          kern = { x: e[o] * box3.cx + e[o + 4] * box3.cy + e[o + 8] * box3.cz + e[o + 12], z: e[o + 2] * box3.cx + e[o + 6] * box3.cy + e[o + 10] * box3.cz + e[o + 14], yb, cy, ay: L(4, 5, 6) * box3.ey * 0.85, ah: Math.max(L(0, 1, 2) * box3.ex, L(8, 9, 10) * box3.ez) * 0.85 };
          if (kern.ah > r / 0.45) kern = null;          // dünner Stamm unter weitem Schirm (Riesenfarn): Dach, kein Körper – wie ein Baum
        }
        const sch = Math.round(x * 5) + ',' + Math.round(z * 5);
        const alt = nachStelle.get(sch);
        if (alt) {
          alt.r = Math.max(alt.r, r); if (art === 'fest') alt.art = 'fest';
          if (kern && (!alt.kern || kern.ah > alt.kern.ah)) alt.kern = kern;
          continue;
        }
        const kol = { x, z, r, art, name: m.name, s: nah.s, seitenabstand: nah.seitenabstand, kern };
        nachStelle.set(sch, kol);
        liste.push(kol);
      }
    });
    // Raster (10 m) für die Suche je Schritt
    const raster = new Map();
    liste.forEach((k, idx) => {
      const x0 = Math.floor((k.x - k.r) / 10), x1 = Math.floor((k.x + k.r) / 10);
      const z0 = Math.floor((k.z - k.r) / 10), z1 = Math.floor((k.z + k.r) / 10);
      for (let gx = x0; gx <= x1; gx++) for (let gz = z0; gz <= z1; gz++) {
        const key = gx * 100003 + gz;
        (raster.get(key) || raster.set(key, []).get(key)).push(idx);
      }
    });
    strecke._pflanzenRaster = raster;
    return liste.length;
  }

  /** 14.10. (v20): waagrechter Halbmesser des Busch-Körpers auf Höhe h über dem Boden (0, wenn der Körper dort schon zu Ende ist). */
  function kernRadius(k, h) {
    const kn = k.kern;
    if (!kn || kn.ay <= 0) return 0;
    const dy = (h - kn.cy) / kn.ay;
    return Math.abs(dy) >= 1 ? 0 : kn.ah * Math.sqrt(1 - dy * dy) + 0.1;     // +10 cm Sicherheit (Boden-/Dreieckshöhe)
  }

  /**
   * Pflanzen-Kollisionen (Runde 6, strecke.pflanzenKollider): fest (Baum, Stamm, Fels, Kaktus, Riesenpilz) = wie
   * eine Säule (Rechteck-Ecken + Mitte herausschieben, Tempo in den Stamm weg, Rest × 0,8) → Stoß typ 'baum';
   * weich (Busch, Farn, Gestrüpp) = durchfahren, Tempo × weichTempo, je Auto höchstens einmal je weichSperre s → 'busch'.
   * Nicht im Looping/Flug/Countdown.
   * @returns {{nr:number, typ:string, staerke:number}[]}
   */
  function pflanzen(fahrzeugListe, strecke, optionen) {
    const stoesse = [], liste = strecke && strecke.pflanzenKollider, raster = strecke && strecke._pflanzenRaster;
    const opt = optionen || {};
    if (!liste || !liste.length || !raster || opt.countdown) return stoesse;
    const P = (R.config && R.config.pflanzen) || {};
    const dt = opt.dt || 1 / 60;
    for (let i = 0; i < fahrzeugListe.length; i++) {
      const f = fahrzeugListe[i], v = (f && f.vehicle) ? f.vehicle : f;
      if (v._buschSperre > 0) v._buschSperre -= dt;
      if (v.imLooping || v.imFlug) continue;
      const gx = Math.floor(v.x / 10), gz = Math.floor(v.z / 10);
      let kand = null;
      for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
        const l = raster.get((gx + a) * 100003 + (gz + b));
        if (l) kand = kand ? kand.concat(l) : l.slice();
      }
      if (!kand) continue;
      const bx = box(v);
      const reich = Math.hypot(bx.hl, bx.hb);
      let staerke = 0, getroffen = false, busch = false;
      for (const idx of new Set(kand)) {
        const k = liste[idx];
        const dx = v.x - k.x, dz = v.z - k.z;
        if (dx * dx + dz * dz > (reich + k.r) * (reich + k.r)) continue;
        // nächster Punkt des Rechtecks zum Kreismittelpunkt
        const lx = (k.x - v.x) * bx.rx + (k.z - v.z) * bx.rz, lq = (k.x - v.x) * bx.qx + (k.z - v.z) * bx.qz;
        const cx = Math.max(-bx.hl, Math.min(bx.hl, lx)), cq = Math.max(-bx.hb, Math.min(bx.hb, lq));
        const px = v.x + bx.rx * cx + bx.qx * cq, pz = v.z + bx.rz * cx + bx.qz * cq;
        let ex = px - k.x, ez = pz - k.z, d = Math.hypot(ex, ez);
        const drinnen = Math.abs(lx) <= bx.hl && Math.abs(lq) <= bx.hb;
        if (!drinnen && d >= k.r) continue;
        if (k.art === 'weich') {
          busch = true;
          // 14.10. (v20, Bug „Auto im Grünen"): durchfahren ja – aber nicht so tief, dass das Auto im Busch verschwindet: die Mitte
          // des Autos bleibt außerhalb des Kerns (Querschnitt des Körpers auf dachRef-Höhe, ≈ niedrigstes Dach). Tempo-Anteil nach innen weg.
          // Dach-Höhe relativ zum Fuß des Busches (Hang: steht das Auto tiefer als der Busch, ragt das Dach weniger heraus) – an der Stelle,
          // an die das Auto geschoben wird (Fixpunkt-Iteration, weil sich die Höhe beim Schieben ändert)
          const dach = P.dachRef !== undefined ? P.dachRef : 0.95;
          const kx = k.kern ? k.kern.x : k.x, kz = k.kern ? k.kern.z : k.z;       // Mitte des Körpers (Geometrie-Box)
          const mx = v.x - kx, mz = v.z - kz, md = Math.hypot(mx, mz);
          const nx = md > 1e-6 ? mx / md : bx.rx, nz = md > 1e-6 ? mz / md : bx.rz;     // genau in der Mitte: nach hinten hinaus
          const tief = (px, pz) => (strecke.hoeheAn && k.kern ? Math.min(0, strecke.hoeheAn(px, pz) - k.kern.yb) : 0);
          let kr = kernRadius(k, dach + tief(v.x, v.z));
          for (let it = 0; it < 6 && kr > 0; it++) { const k2 = kernRadius(k, dach + tief(kx + nx * kr, kz + nz * kr)); if (k2 <= kr + 0.01) break; kr = k2; }
          if (kr > 0 && md < kr) {
            v.x = kx + nx * (kr + 0.02); v.z = kz + nz * (kr + 0.02);
            bx.x = v.x; bx.z = v.z;
            const vw = v.weltGeschwindigkeit(), vn = vw.x * nx + vw.z * nz;
            if (vn < 0) v.weltGeschwindigkeitSetzen(vw.x - nx * vn, vw.z - nz * vn);
          }
          continue;
        }
        // fest: Auto herausschieben (Normale vom Stamm zum Auto)
        let nx, nz, tief;
        if (drinnen || d < 1e-6) {
          // Mitte des Stamms im Auto: kürzester Weg hinaus über die nähere Seite
          const ueL = bx.hl - Math.abs(lx), ueQ = bx.hb - Math.abs(lq);
          if (ueL < ueQ) { const s = lx > 0 ? -1 : 1; nx = bx.rx * s; nz = bx.rz * s; tief = ueL + k.r; }
          else { const s = lq > 0 ? -1 : 1; nx = bx.qx * s; nz = bx.qz * s; tief = ueQ + k.r; }
        } else { nx = ex / d; nz = ez / d; tief = k.r - d; }
        v.x += nx * (tief + 0.01); v.z += nz * (tief + 0.01);
        bx.x = v.x; bx.z = v.z;
        const vw = v.weltGeschwindigkeit(), vn = vw.x * nx + vw.z * nz;
        if (vn < 0) {
          v.weltGeschwindigkeitSetzen((vw.x - nx * vn) * BANDE_PARALLEL, (vw.z - nz * vn) * BANDE_PARALLEL);
          staerke = Math.max(staerke, -vn);
        }
        getroffen = true;
      }
      if (getroffen && staerke > 0.5) stoesse.push({ nr: i, typ: 'baum', staerke });
      if (busch && !(v._buschSperre > 0)) {
        v._buschSperre = P.weichSperre || 0.8;
        if (v.tempo > 1) {
          const staerkeB = v.tempo * 0.3;
          v.vLaengs *= P.weichTempo !== undefined ? P.weichTempo : 0.7;
          stoesse.push({ nr: i, typ: 'busch', staerke: staerkeB });
        }
      }
    }
    return stoesse;
  }
  /**
   * Runde 6 (W2-C): Flächen-Hindernisse (h.flaeche, trackBuilder): Kapsel-Kreise im Straßen-Rahmen bei h.s.
   *   lava:   Kontakt → Auto steht config.dino.lava.stopp s (vehicle._lavaStopp), danach frei s Schonzeit und erst nach
   *           dem Verlassen der Zunge wieder scharf (vehicle._lavaIn);
   *           Stoß typ 'brand' + lava: true (Schaden −10 % wie ein brennendes Wrack, Meldung „Heiß!"), staerke = Tempo.
   *   krater: Kontakt → Tempo × config.dino.krater.tempoFaktor (−50 %), einmal je Krater und Auto, Stoß typ 'krater'
   *           (Schaden −5 % über 'hindernis'). Krater mit h.weg sind verschwunden.
   */
  function flaecheTreffer(v, i, h, k, stoesse) {
    if (h.weg) return;
    const gx = v.x - h.x, gz = v.z - h.z, gr = h.radius + v.daten.laenge;
    if (gx * gx + gz * gz > gr * gr) return;
    const F = h.flaeche, ka = kapsel(v);
    let drin = false;
    for (const c of ka.kreise) {
      if (F.rund) {
        const dx = c.x - h.x, dz = c.z - h.z, rr = F.rund + ka.rad * 0.4;
        if (dx * dx + dz * dz < rr * rr) { drin = true; break; }
        continue;
      }
      const dx = c.x - h.px, dz = c.z - h.pz, l = dx * h.tx + dz * h.tz, q = dx * h.nx + dz * h.nz;
      const m = ka.rad * 0.4;   // Rad muss ein Stück hinein
      if (Math.abs(l) < F.hl + m && q > F.q0 - m && q < F.q1 + m) { drin = true; break; }
    }
    if (h.typ === 'lava' && !drin && v._lavaIn === h) v._lavaIn = null;   // Zunge verlassen → wieder scharf
    if (!drin) return;
    const CD = (R.config && R.config.dino) || {};
    if (h.typ === 'lava') {
      // erst wieder, wenn das Auto die Zunge verlassen hat (Wegfahren nach dem Stopp kostet nichts)
      if (v._lavaStopp > 0 || v._lavaFrei > 0 || v._lavaIn === h) return;
      v._lavaIn = h;
      const CL = CD.lava || {};
      const staerke = Math.max(2, v.tempo);
      v._lavaStopp = CL.stopp !== undefined ? CL.stopp : 1;
      v.vLaengs = 0; v.vQuer = 0;
      stoesse.push({ nr: i, typ: 'brand', lava: true, staerke, hindernis: k, x: v.x, z: v.z });
      return;
    }
    // Krater
    if (!h.getroffen) h.getroffen = new Set();
    if (h.getroffen.has(i)) return;
    h.getroffen.add(i);
    const CK = CD.krater || {};
    const staerke = Math.max(2, v.tempo * 0.5);
    v.vLaengs *= (CK.tempoFaktor !== undefined ? CK.tempoFaktor : 0.5);
    v.vQuer *= 0.6;
    v.huepfer = 1.6;
    stoesse.push({ nr: i, typ: 'krater', staerke, hindernis: k });
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
    const CL = ((R.config && R.config.dino) || {}).lava || {};
    const dt = opt.dt || 1 / 60, zeit = opt.zeit || 0;
    for (let i = 0; i < fahrzeugListe.length; i++) {
      const f = fahrzeugListe[i], v = (f && f.vehicle) ? f.vehicle : f;
      if (v._astSperre > 0) v._astSperre -= dt;
      if (v._astRandSperre > 0) v._astRandSperre -= dt;
      // Runde 6 (W2-C): Lava hält das Auto stopp s fest (wie Kleber), danach frei s Schonzeit zum Wegfahren
      if (v._lavaFrei > 0) v._lavaFrei -= dt;
      if (v._lavaStopp > 0) {
        v._lavaStopp -= dt; v.vLaengs = 0; v.vQuer = 0;
        if (v._lavaStopp <= 0) v._lavaFrei = (CL.frei !== undefined ? CL.frei : 2.5);
      }
      if (v.imLooping || v.imFlug) continue;           // im Looping / im Flug über der Straße
      for (let k = 0; k < liste.length; k++) {
        const h = liste[k];
        if (h.flaeche) { flaecheTreffer(v, i, h, k, stoesse); continue; }   // Runde 6: Lava / Krater
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
                // v29 F2b: Stamm (innere 70 % der Länge ab Stammende a, dort ist der Ast dick) = fest; dünnes Ende (äußere 30 % bis zur Spitze b,
                // dort stehen nur Zweige) = überfahrbar: Hüpfer, Tempo −20 %, 1 Stoß je Überfahrt (Sperre), kein Herausschieben; Schaden 10 % (schaden.js, art 'ast')
                const sx = sg.bx - sg.ax, sz = sg.bz - sg.az, tq = Math.max(0, Math.min(1, ((c.x - sg.ax) * sx + (c.z - sg.az) * sz) / ((sx * sx + sz * sz) || 1)));
                if (tq > (CA.stammAnteil !== undefined ? CA.stammAnteil : 0.7)) {
                  if (!(v._astRandSperre > 0)) {
                    v.vLaengs *= (CA.randTempoFaktor !== undefined ? CA.randTempoFaktor : 0.8);
                    v.huepfer = CA.huepfer !== undefined ? CA.huepfer : 2.2;
                    stoesse.push({ nr: i, typ: 'ast', rand: true, staerke: v.tempo * 0.2, hindernis: k });
                  }
                  v._astRandSperre = CA.sperrZeit || 0.8;
                  continue;
                }
              }
              if (sg.art === 'ast' && !(v._astSperre > 0)) {
                // Erstkontakt: Tempo −40 %, Hüpfer, Stoß (wie bisher). v29 F2: danach bleibt der Ast fest (Schieben wie Bake, unten),
                // vorher fuhr das Auto nach dem Stoß mitten durch den sichtbaren Stamm.
                const staerke = v.tempo * 0.4;
                v.vLaengs *= (CA.tempoFaktor !== undefined ? CA.tempoFaktor : 0.6);
                v.vQuer *= 0.7;
                v.huepfer = CA.huepfer !== undefined ? CA.huepfer : 2.2;
                v._astSperre = CA.sperrZeit || 0.8;
                stoesse.push({ nr: i, typ: 'ast', staerke, hindernis: k });
              } else if (sg.art === 'ast') v._astSperre = CA.sperrZeit || 0.8;   // dranstehen/-schieben = kein neuer Stoß (Sperre läuft erst nach dem Lösen ab)
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
                if (sg.art === 'ast' && R.headingAus) {
                  // v29 F2: Streifstoß – die Nase dreht am Stamm entlang (zur Astspitze hin, dort ist die Spur frei), sonst klemmt ein Auto,
                  // das frontal mit Vollgas am Ast steht (Tempo 0 → keine Lenkwirkung), und die KI muss zurückgesetzt werden
                  const al = Math.hypot(sg.bx - sg.ax, sg.bz - sg.az) || 1, tx = (sg.bx - sg.ax) / al, tz = (sg.bz - sg.az) / al, r = v.richtung();
                  const sgn = (r.x * tx + r.z * tz) < -0.35 ? -1 : 1;                      // fährt fast gegen die Spitze zurück → andere Richtung
                  let d = R.headingAus(tx * sgn, tz * sgn) - v.heading;
                  d = Math.atan2(Math.sin(d), Math.cos(d));
                  const max = (CA.streifDreh !== undefined ? CA.streifDreh : 2.5) * (dt || 1 / 60);
                  v.heading += Math.max(-max, Math.min(max, d));
                }
                if (-vn > 0.5 && sg.art !== 'ast') stoesse.push({ nr: i, typ: sg.art === 'bake' ? 'bake' : sg.art, staerke: -vn, hindernis: k });   // Ast: Stoß nur beim Erstkontakt
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

  R.Kollisionen = { bande, autoAuto, kapsel, hindernisse, wracksEinbauen,
    obbAbstand, eindringung, loopingAbstand, pflanzenSammeln, pflanzen };   // Runde 6; v28c: eindringung (nur Anzeige)
})();
