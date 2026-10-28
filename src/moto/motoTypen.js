// ============================================================
// Motorrad M3 – neue Fahrzeugtypen: Superbike, Roller, Chopper, Quad (nur Motorrad-Modus, window.MOTORRAD === true).
//
// Docking wie motoKatalog.js/motoKlang.js, keine Autorennen-Datei wird angefasst:
//  - Katalog: vier neue wählbare Einträge (sonderbau 'motorrad', Zusatzfeld `typ`), hinter den Crossmaschinen eingefügt.
//    Fahrwerte im Format von carCatalog.js; die Bereichsprüfung steht in tests/test_moto_m3.js (erweiterte Bereiche NUR dort).
//    Quad: kippt: false (keine Schräglage, kein Überschlag – dafür sorgt motoM3Start.js).
//  - KI-Gegner: nur Crossmaschinen (gegnerAutos filtert Einträge mit `typ` heraus), damit Roller & Co. das Feld nicht ausbremsen.
//  - Modell: R.sonderbauten.motorrad wird umhüllt – Einträge mit `typ` bauen hier (Bausteine aus R.Moto.modell.werkzeug), alle anderen laufen
//    unverändert über motoModell.js. Gleiche Gruppenstruktur (lage > purzel > inhalt) und userData wie die Crossmaschine → Schräglage,
//    Stunts, Cockpit, Unfall funktionieren ohne Änderung.
//  - Klang: Profile je Typ (Superbike Vierzylinder hoch, Chopper V2 tief, Roller Einzylinder surrend, Quad brummig).
// Technik wie motoModell.js: nur Lambert/Basic, keine Lichter, geteilte Geometrien (Vertex-Farben), je Motorrad ca. 20–25 Draw-Calls.
// ============================================================
window.Rennspiel = window.Rennspiel || {};

(function () {
  const R = window.Rennspiel;
  R.Moto = R.Moto || {};

  // ---------- Katalogdaten (rein, ohne THREE) ----------
  const TYPEN = {
    superbike: {
      id: 'superbike', name: 'Superbike', marke: 'Speed', modell: 'Superbike Rot', farbeName: 'Rot', generischerName: 'Superbike',
      bike: 0xd7261e, fahrer: 0x23262d, helm: 0xf4f4f4, nr: 99, kippt: true,
      fahrwerte: { vMax: 300 / 3.6, beschleunigung: 8.0, bremsen: 24, rueckwaertsMax: 3, wendigkeit: 2.3, grip: 0.88, masse: 210, laenge: 2.1, breite: 0.8 },
      abmessungen: { laenge: 3.2, breite: 0.8, hoehe: 1.55, radstand: 1.4, ueberhangVorn: 0.34, radRadius: 0.31, radBreite: 0.12, felgeZoll: 17 },
      beschreibung: 'Das Superbike ist tief und flitzt richtig schnell, aber es braucht eine ruhige Hand.',
    },
    roller: {
      id: 'roller', name: 'Roller', marke: 'City', modell: 'Roller Türkis', farbeName: 'Türkis', generischerName: 'Roller',
      bike: 0x1cb7a8, fahrer: 0xffc21a, helm: 0xf0409a, nr: 5, kippt: true,
      fahrwerte: { vMax: 120 / 3.6, beschleunigung: 4.4, bremsen: 18, rueckwaertsMax: 4, wendigkeit: 3.1, grip: 0.85, masse: 130, laenge: 1.8, breite: 0.7 },
      abmessungen: { laenge: 3.0, breite: 0.7, hoehe: 1.5, radstand: 1.12, ueberhangVorn: 0.3, radRadius: 0.22, radBreite: 0.11, felgeZoll: 12 },
      beschreibung: 'Der Roller ist gemütlich und wendig, mit Trittbrett und kleinen Rädern.',
    },
    chopper: {
      id: 'chopper', name: 'Chopper', marke: 'Easy', modell: 'Chopper Blau', farbeName: 'Blau', generischerName: 'Chopper',
      bike: 0x2b4fb0, fahrer: 0x5a3a22, helm: 0xf6c20a, nr: 66, kippt: true,
      fahrwerte: { vMax: 190 / 3.6, beschleunigung: 5.0, bremsen: 19, rueckwaertsMax: 3, wendigkeit: 2.35, grip: 0.8, masse: 260, laenge: 2.4, breite: 0.85 },
      abmessungen: { laenge: 3.9, breite: 0.85, hoehe: 1.7, radstand: 1.85, ueberhangVorn: 0.34, radRadius: 0.34, radBreite: 0.2, felgeZoll: 18 },
      beschreibung: 'Der Chopper ist lang und gemütlich, mit hohem Lenker und dickem Hinterrad.',
    },
    quad: {
      id: 'quad', name: 'Quad', marke: 'Trail', modell: 'Quad Grün', farbeName: 'Grün', generischerName: 'Quad',
      bike: 0x2fa84f, fahrer: 0xff6a10, helm: 0xf4f4f4, nr: 4, kippt: false,
      fahrwerte: { vMax: 150 / 3.6, beschleunigung: 6.0, bremsen: 21, rueckwaertsMax: 6, wendigkeit: 2.5, grip: 0.95, masse: 240, laenge: 1.9, breite: 1.15 },
      abmessungen: { laenge: 3.2, breite: 1.15, hoehe: 1.45, radstand: 1.2, ueberhangVorn: 0.3, radRadius: 0.3, radBreite: 0.2, felgeZoll: 10 },
      beschreibung: 'Das Quad hat vier dicke Räder und kippt nie um, es rutscht und wackelt nur.',
    },
  };
  const REIHE = ['superbike', 'roller', 'chopper', 'quad'];

  function typEintrag(t) {
    return {
      id: t.id, name: t.name, marke: t.marke, modell: t.modell, generischerName: t.generischerName,
      farbe: t.bike, farbe2: t.fahrer, farbeName: t.farbeName,
      karosserie: 'motorrad', sonderbau: 'motorrad', typ: t.id, kippt: t.kippt,
      abmessungen: Object.assign({}, t.abmessungen),
      optionen: { fahrer: t.fahrer, helm: t.helm, nummer: t.nr },
      fahrwerte: Object.assign({}, t.fahrwerte),
      beschreibung: t.beschreibung,
      waehlbar: true,
    };
  }
  /** Die vier neuen Katalogeinträge (frisch erzeugt). */
  function typKatalog() { return REIHE.map((id) => typEintrag(TYPEN[id])); }
  /** Kippt dieses Fahrzeug? (Quad: nie – keine Schräglage, kein Überschlag.) Akzeptiert Katalogeintrag oder id. */
  function kippt(a) {
    const id = typeof a === 'string' ? a : (a && (a.typ || a.id));
    return !(TYPEN[id] && TYPEN[id].kippt === false);
  }

  // ---------- Klang-Profile (je Typ; Zahlen = Klangannahmen wie in motoKlang.js) ----------
  function profileEintragen() {
    if (!R.MotorProfile || !R.MotorProfile.profile) return [];
    const P = R.MotorProfile.profile, basis = P.crossmaschine || P['mini-cooper'] || P.passat;
    if (!basis) return [];
    const gaenge = (n, r1, rn) => { const a = [], q = Math.pow(rn / r1, 1 / (n - 1)); for (let i = 0; i < n; i++) a.push(r1 * Math.pow(q, i)); return a; };
    const mach = (id, name, bauart, zyl, hubraum, ps, o) => Object.assign({}, basis, { id, name, bauart, zyl, hubraum, ps, knallen: 0 }, o);
    P.superbike = mach('superbike', 'Superbike 1000 Vierzylinder', 'Vierzylinder-Reihenmotor', 4, 1000, 200, {
      leerlauf: 1300, rpmMax: 14000, rpmVmax: 12200, startRpm: 5600, hoch: 9000, hochVoll: 13000, runter: 5200, gaenge: gaenge(6, 3.3, 0.9), schaltZeit: 0.04,
      wave: { slope: 0.55, odd: 0.9, bump: [3, 2, 1] }, halb: 0.2, formant: { hz: 1500, db: 5, q: 1.6 }, cut0: 1300, cut1: 4200, cutGas: 2000, sub: 0.05, ansaug: 0.7, saege: 0.8, pegel: 0.95 });
    P.chopper = mach('chopper', 'Chopper V2 tief', 'V2-Viertakter', 2, 1700, 70, {
      leerlauf: 800, rpmMax: 5600, rpmVmax: 4700, startRpm: 2600, hoch: 3600, hochVoll: 5200, runter: 2200, gaenge: gaenge(5, 3.2, 0.95), schaltZeit: 0.12,
      wave: { slope: 1.0, odd: 0.8, bump: [5, 3, 1] }, halb: 0.9, wobble: 18, formant: { hz: 420, db: 6, q: 1.2 }, cut0: 600, cut1: 1700, cutGas: 800, sub: 0.45, ansaug: 0.3, saege: 0.95, pegel: 1.1 });
    P.roller = mach('roller', 'Roller 125 surrend', 'Einzylinder mit Variomatik', 1, 125, 12, {
      leerlauf: 2200, rpmMax: 9000, rpmVmax: 8200, startRpm: 5000, hoch: 6500, hochVoll: 8600, runter: 4600, gaenge: gaenge(2, 2.1, 1.9), schaltZeit: 0.02,
      wave: { slope: 0.5, odd: 1.6, bump: [2, 3, 1.5] }, halb: 0.25, formant: { hz: 1250, db: 4, q: 1.8 }, cut0: 1500, cut1: 4800, cutGas: 2600, sub: 0.03, ansaug: 0.6, saege: 0.93, pegel: 0.8 });
    P.quad = mach('quad', 'Quad 650 brummig', 'Einzylinder-Viertakter, groß', 1, 650, 40, {
      leerlauf: 1100, rpmMax: 7000, rpmVmax: 6100, startRpm: 3400, hoch: 4600, hochVoll: 6500, runter: 3000, gaenge: gaenge(5, 3.0, 1.0), schaltZeit: 0.09,
      wave: { slope: 0.85, odd: 1.1, bump: [5, 3, 1.2] }, halb: 0.75, wobble: 14, formant: { hz: 520, db: 5, q: 1.3 }, cut0: 700, cut1: 1900, cutGas: 900, sub: 0.32, ansaug: 0.4, saege: 0.92, pegel: 1.05 });
    // Auspuffknall übernimmt motoM3Effekte.js (leise, eigene Logik) – das Knallen des Motorprofils bei den Crossmaschinen entfällt dafür
    ['', '-rot', '-blau', '-gruen', '-gelb', '-lila', '-tuerkis', '-pink'].forEach((f) => { if (P['crossmaschine' + f]) P['crossmaschine' + f] = Object.assign({}, P['crossmaschine' + f], { knallen: 0 }); });
    return REIHE.slice();
  }

  // ---------- Quad: kippt nie ----------
  // Die Schräglage-Logik (schraeglage.js) kennt keine Ausnahmen; darum werden ihre Ergebnisse für Fahrzeuge mit kippt:false jeden Schritt/jedes Bild entschärft:
  //  quadEntschaerfen (nach dem Physikschritt): ein ausgelöster Überschlag wird sofort abgebrochen (Abklingzeit bleibt, damit nicht jeder Schritt neu auslöst) und
  //    startet stattdessen ein kurzes Wackeln/Rutschen; Schräglage und -rate auf 0.
  //  quadAnwenden (nach der Anzeige-Pose, je Bild): lage.rotation.z = 0, Salto der Trick-Pose und Überschlag herausrechnen (Nicken für Wheelies bleibt, ±0,5 rad),
  //    Wackeln = kleine Gierbewegung + Hüpfer.
  const WACKEL = { dauer: 1.0, gier: 0.14, hoehe: 0.06 };
  const klemme = (x, a, b) => Math.max(a, Math.min(b, x));
  /** purzelKonf = schraeglage.PURZEL. mz = f.motoZ (Schräglage-Zustand), z3 = eigener Zustand { wackel }. Rückgabe true, wenn ein Überschlag abgebrochen wurde. */
  function quadEntschaerfen(mz, z3, purzelKonf) {
    if (!mz) return false;
    let abgebrochen = false;
    const p = mz.purzel;
    if (p && p.aktiv) { p.aktiv = false; p.t = 0; p.abkling = (purzelKonf && purzelKonf.abklingzeit) || 2; if (z3) z3.wackel = WACKEL.dauer; abgebrochen = true; }
    mz.lean = 0; mz.leanRate = 0;
    return abgebrochen;
  }
  /** Wackel-Pose zum Rest (s): { gier (rad), hoehe (m) }; 0 ohne Wackeln. */
  function quadPose(rest) {
    if (!(rest > 0)) return { gier: 0, hoehe: 0 };
    const a = klemme(rest / WACKEL.dauer, 0, 1);
    return { gier: Math.sin(rest * 26) * WACKEL.gier * a, hoehe: Math.abs(Math.sin(rest * 18)) * WACKEL.hoehe * a };
  }
  /** Pose eines Quad-Meshes nach der Anzeige-Pose bereinigen. e = { wackel (Rest s), salto (Trick-Pose), gier (Basis-Gier der Trick-Pose) }. */
  function quadAnwenden(mesh, e) {
    const u = mesh && mesh.userData;
    if (!u || !u.lage || !u.purzel) return false;
    const w = quadPose(e && e.wackel);
    u.lage.rotation.z = 0;
    u.lage.rotation.y = ((e && e.gier) || 0) + w.gier;
    u.purzel.rotation.x = klemme(u.purzel.rotation.x - ((e && e.salto) || 0), -0.5, 0.5);
    u.purzel.position.y += w.hoehe;
    return true;
  }

  R.Moto.typen = { TYPEN, REIHE, typEintrag, typKatalog, kippt, profileEintragen, WACKEL, quadEntschaerfen, quadPose, quadAnwenden };

  if (window.MOTORRAD !== true || !R.carCatalog) return;

  // ---------------- Katalog ----------------
  const kat = R.carCatalog;
  if (!kat.some((a) => a.typ)) {
    let i = 0; kat.forEach((a, k) => { if (a.sonderbau === 'motorrad') i = k + 1; });
    kat.splice.apply(kat, [i, 0].concat(typKatalog()));
  }
  const gegnerAlt = kat.gegnerAutos;                        // motoKatalog.js: gegnerMotorraeder(kat, …) – hier nur Crossmaschinen (ohne typ) als Pool
  if (R.Moto.katalog && R.Moto.katalog.gegnerMotorraeder) kat.gegnerAutos = (anzahl, opt) => R.Moto.katalog.gegnerMotorraeder(kat.filter((a) => !a.typ), anzahl, opt);
  else if (gegnerAlt) kat.gegnerAutos = gegnerAlt;
  profileEintragen();

  // ============================================================
  // Modell (braucht THREE + motoModell.js)
  // ============================================================
  const M = R.Moto.modell;
  if (typeof THREE === 'undefined' || !M || !M.verfuegbar || !M.werkzeug || !R.sonderbauten || !R.sonderbauten.motorrad) { R.Moto.typen.modell = { verfuegbar: false }; return; }
  const W = M.werkzeug, F = W.F, V = W.V;
  const memo = W.memo, lambert = W.lambert, vertexMat = W.vertexMat, basic = W.basic;
  const WEISS = 0xffffff, CHROM = 0xdfe3e8, DUNKEL = 0x16171b;

  // Je Typ: Maße (m) und Bauteile. pv/ph = Vorder-/Hinterachse (y, z), ach = Gabelrichtung (y, z), gabel = Gabellänge, grip = Griffe (x, y, z),
  // fahrer = Versatz des Fahrers (y, z), arm = Knochenlängen, lenkFaktor, kippt, tafeln = [{ x, y, z, ry, w, h }], licht/rueck = Position, schatten = [Breite, Länge]
  const T = {
    superbike: { radV: 0.31, radH: 0.32, bV: 0.12, bH: 0.17, pv: [0.31, -0.74], ph: [0.32, 0.66], ach: [0.70, 0.30], gabel: 0.80, grip: { x: 0.20, y: 1.0, z: -0.33 },
      fahrer: { y: -0.13, z: -0.04 }, arm: [0.27, 0.27], lenkFaktor: 0.5, licht: [0, 0.84, -0.88], rueck: [0, 0.93, 0.9], schatten: [0.55, 1.5],
      tafeln: [{ x: 0, y: 0.68, z: -0.9, ry: Math.PI, w: 0.17, h: 0.13 }, { x: 0.182, y: 0.62, z: 0.0, ry: Math.PI / 2, w: 0.2, h: 0.14 }, { x: -0.182, y: 0.62, z: 0.0, ry: -Math.PI / 2, w: 0.2, h: 0.14 }] },
    roller: { radV: 0.22, radH: 0.22, bV: 0.11, bH: 0.12, pv: [0.22, -0.62], ph: [0.22, 0.5], ach: [0.9, 0.25], gabel: 0.5, grip: { x: 0.30, y: 0.98, z: -0.40 },
      fahrer: { y: -0.2, z: 0.0 }, arm: [0.27, 0.27], lenkFaktor: 0.7, licht: [0, 1.0, -0.53], rueck: [0, 0.68, 0.87], schatten: [0.5, 1.3],
      tafeln: [{ x: 0, y: 0.52, z: -0.54, ry: Math.PI, w: 0.2, h: 0.17 }, { x: 0.215, y: 0.6, z: 0.4, ry: Math.PI / 2, w: 0.22, h: 0.16 }, { x: -0.215, y: 0.6, z: 0.4, ry: -Math.PI / 2, w: 0.22, h: 0.16 }] },
    chopper: { radV: 0.33, radH: 0.34, bV: 0.09, bH: 0.22, pv: [0.33, -1.18], ph: [0.34, 0.66], ach: [0.74, 0.58], gabel: 1.0, grip: { x: 0.33, y: 1.38, z: -0.46 },
      fahrer: { y: -0.08, z: 0.26 }, arm: [0.37, 0.37], lenkFaktor: 0.45, licht: [0, 0.92, -0.84], rueck: [0, 0.56, 1.02], schatten: [0.55, 1.95],
      tafeln: [{ x: 0.178, y: 0.98, z: -0.22, ry: Math.PI / 2, w: 0.2, h: 0.14 }, { x: -0.178, y: 0.98, z: -0.22, ry: -Math.PI / 2, w: 0.2, h: 0.14 }] },
    quad: { radV: 0.30, radH: 0.30, bV: 0.2, bH: 0.2, pv: [0.30, -0.62], ph: [0.30, 0.52], ach: [0.93, 0.37], gabel: 0.5, grip: { x: 0.32, y: 0.98, z: -0.40 }, spur: 0.46,
      fahrer: { y: -0.17, z: 0.02 }, arm: [0.27, 0.27], lenkFaktor: 0.9, licht: [0, 0.7, -0.81], rueck: [0, 0.72, 0.83], schatten: [0.85, 1.4], lenkPunkt: [0.62, -0.46],
      tafeln: [{ x: 0, y: 0.66, z: -0.83, ry: Math.PI, w: 0.22, h: 0.16 }] },
  };

  const norm = (t) => { const l = Math.hypot(t.ach[0], t.ach[1]); return V(0, t.ach[0] / l, t.ach[1] / l); };
  const pvV = (t) => V(0, t.pv[0], t.pv[1]);
  /** Punkt auf der Gabelachse (s m über der Vorderachse) plus Versatz. */
  const achT = (t, s, x, y, z) => { const n = norm(t), p = pvV(t); return V(p.x + n.x * s + (x || 0), p.y + n.y * s + (y || 0), p.z + n.z * s + (z || 0)); };
  const lenkPunkt = (t) => (t.lenkPunkt ? V(0, t.lenkPunkt[0], t.lenkPunkt[1]) : pvV(t));

  // ---------- feste Teile je Typ (S = Vertex-Farben, K = Lackfarbe) ----------
  function teileBauen(typ, S, K) {
    const tube = (a, b, r1, r2, seg, hex) => W.tube(S, a, b, r1, r2, seg || 6, hex), box = (...a) => W.box(S, ...a), ell = (...a) => W.ellipsoid(S, ...a);
    const kBox = (...a) => W.box(K, ...a), kEll = (...a) => W.ellipsoid(K, ...a);
    if (typ === 'superbike') {
      [-1, 1].forEach((s) => {
        tube(V(s * 0.1, 0.96, -0.5), V(s * 0.13, 0.46, 0.3), 0.026, 0.026, 5, F.alu);                      // Brückenrahmen
        tube(V(s * 0.1, 0.42, 0.32), V(s * 0.09, 0.32, 0.66), 0.026, 0.022, 5, F.alu);                      // Schwinge
        box(s * 0.25, 0.33, 0.15, 0.1, 0.02, 0.12, 0, 0, 0, F.alu);                                          // Raste
      });
      box(0, 0.46, -0.1, 0.3, 0.34, 0.5, 0, 0, 0, F.motor); box(0, 0.64, -0.2, 0.26, 0.2, 0.3, -0.25, 0, 0, F.grau);
      box(0, 0.845, 0.3, 0.24, 0.08, 0.55, 0, 0, 0, F.schwarz);                                              // Sitz
      tube(V(0.12, 0.34, -0.2), V(0.15, 0.46, 0.8), 0.05, 0.045, 8, F.grau); tube(V(0.15, 0.46, 0.8), V(0.15, 0.465, 0.86), 0.045, 0.03, 8, F.schwarz);
      box(0, 1.02, -0.47, 0.2, 0.012, 0.22, -0.75, 0, 0, 0x9ad7ff);                                          // Scheibe
      kEll(0, 0.83, -0.56, 0.15, 0.2, 0.34, WEISS, 9, 6); [-1, 1].forEach((s) => kBox(s * 0.16, 0.58, -0.16, 0.04, 0.36, 0.68, 0, 0, s * -0.1, WEISS));
      kEll(0, 0.97, -0.12, 0.16, 0.12, 0.3, WEISS, 8, 6); kEll(0, 0.92, 0.56, 0.12, 0.11, 0.34, WEISS, 8, 6, -0.18);
    } else if (typ === 'roller') {
      box(0, 0.27, -0.05, 0.46, 0.05, 0.74, 0, 0, 0, 0x4a4f58); [-1, 1].forEach((s) => box(s * 0.235, 0.29, -0.05, 0.03, 0.06, 0.74, 0, 0, 0, F.alu));   // Trittbrett mit Leiste
      box(0, 0.32, 0.42, 0.2, 0.24, 0.42, 0, 0, 0, F.motor); tube(V(0.13, 0.28, 0.3), V(0.16, 0.31, 0.74), 0.04, 0.035, 7, F.grau);
      box(0, 0.83, 0.36, 0.28, 0.09, 0.5, 0, 0, 0, F.schwarz); tube(V(0, 0.9, 0.62), V(0, 0.92, 0.82), 0.012, 0.012, 4, F.alu);
      box(0, 0.4, 0.55, 0.3, 0.02, 0.5, 0, 0, 0, F.grau);                                                    // Unterboden hinten
      kBox(0, 0.62, -0.47, 0.42, 0.62, 0.06, 0.25, 0, 0, WEISS); kBox(0, 0.4, -0.15, 0.2, 0.4, 0.3, 0, 0, 0, WEISS);                // Beinschild + Mitteltunnel
      kEll(0, 0.52, 0.36, 0.22, 0.3, 0.46, WEISS, 8, 6); kEll(0, 1.0, -0.45, 0.2, 0.1, 0.12, WEISS, 8, 5);
    } else if (typ === 'chopper') {
      [-1, 1].forEach((s) => {
        tube(V(s * 0.07, 0.99, -0.58), V(s * 0.09, 0.5, 0.18), 0.026, 0.026, 5, F.alu); tube(V(s * 0.09, 0.5, 0.18), V(s * 0.1, 0.34, 0.66), 0.024, 0.022, 5, F.alu);
        box(s * 0.25, 0.43, 0.45, 0.1, 0.02, 0.12, 0, 0, 0, F.alu);
        tube(V(s * 0.19, 0.5, -0.3), V(s * 0.21, 0.42, 0.9), 0.04, 0.045, 7, CHROM);                           // Auspuff-Rohre (Chrom)
      });
      tube(V(0, 0.99, -0.58), V(0, 1.12, -0.563), 0.03, 0.03, 6, F.alu); tube(V(0, 0.45, -0.4), V(0, 0.97, -0.58), 0.024, 0.024, 5, F.alu);
      box(0, 0.45, -0.05, 0.3, 0.25, 0.4, 0, 0, 0, F.motor);
      tube(V(0, 0.52, -0.05), V(0, 0.86, -0.3), 0.075, 0.07, 8, CHROM); tube(V(0, 0.52, -0.05), V(0, 0.86, 0.2), 0.075, 0.07, 8, CHROM);          // V2-Zylinder
      box(0, 0.8, 0.25, 0.26, 0.07, 0.4, 0, 0, 0, F.schwarz); tube(V(0, 0.8, 0.55), V(0, 1.15, 0.62), 0.014, 0.014, 4, CHROM);                   // Sitz + Rückenlehne
      kEll(0, 0.98, -0.22, 0.17, 0.14, 0.32, WEISS, 9, 6, 0.1);                                              // Tank (Tropfenform)
      const g = new THREE.CylinderGeometry(0.4, 0.4, 0.28, 12, 1, true, 0.3, 1.9); g.rotateZ(Math.PI / 2); g.translate(0, T.chopper.ph[0], T.chopper.ph[1]); K.add(g, null, WEISS);   // Hinterrad-Schutzblech
    } else if (typ === 'quad') {
      [-1, 1].forEach((s) => {
        tube(V(s * 0.2, 0.5, -0.55), V(s * 0.2, 0.5, 0.5), 0.03, 0.03, 5, F.alu);
        tube(V(s * 0.2, 0.5, -0.55), V(s * 0.46, 0.3, -0.62), 0.022, 0.022, 5, F.alu); tube(V(s * 0.2, 0.5, 0.5), V(s * 0.46, 0.3, 0.52), 0.022, 0.022, 5, F.alu);
        box(s * 0.4, 0.31, 0.0, 0.2, 0.03, 0.56, 0, 0, 0, F.schwarz);                                         // Trittbrett
      });
      tube(V(-0.46, 0.3, -0.62), V(0.46, 0.3, -0.62), 0.03, 0.03, 6, F.grau); tube(V(-0.46, 0.3, 0.52), V(0.46, 0.3, 0.52), 0.03, 0.03, 6, F.grau);
      box(0, 0.46, 0.0, 0.36, 0.3, 0.5, 0, 0, 0, F.motor); box(0, 0.745, 0.18, 0.28, 0.1, 0.52, 0, 0, 0, F.schwarz);
      tube(V(0.2, 0.5, 0.2), V(0.3, 0.64, 0.74), 0.04, 0.035, 7, F.grau); tube(V(-0.2, 0.92, 0.55), V(0.2, 0.92, 0.55), 0.012, 0.012, 4, F.alu);      // Auspuff, Gepäckträger
      kEll(0, 0.68, -0.42, 0.3, 0.17, 0.4, WEISS, 9, 6); kEll(0, 0.85, -0.12, 0.2, 0.1, 0.22, WEISS, 8, 6);
      [-1, 1].forEach((s) => { kBox(s * 0.46, 0.64, -0.62, 0.26, 0.04, 0.56, 0, 0, 0, WEISS); kBox(s * 0.46, 0.64, 0.52, 0.26, 0.04, 0.56, 0, 0, 0, WEISS); });
    }
  }

  /** Lenkgruppe je Typ, relativ zum Drehpunkt (Vorderachse bzw. Lenksäule): Gabel/Säule, Lenker, Griffe; K = Lack (Schutzblech). */
  function lenkBauen(typ, S, K) {
    const t = T[typ], lp = lenkPunkt(t), tube = (a, b, r1, r2, seg, hex) => W.tube(S, a, b, r1, r2, seg || 6, hex);
    const gr = t.grip;
    if (typ === 'quad') {
      tube(V(0, 0.62, -0.46), V(0, gr.y, -0.4), 0.025, 0.022, 6, F.schwarz); tube(V(-gr.x - 0.03, gr.y, gr.z), V(gr.x + 0.03, gr.y, gr.z), 0.014, 0.014, 5, F.alu);
      [-1, 1].forEach((s) => { tube(V(s * 0.27, gr.y, gr.z), V(s * (gr.x + 0.05), gr.y, gr.z), 0.02, 0.02, 6, F.schwarz); });
      W.box(S, 0, gr.y + 0.07, gr.z - 0.04, 0.24, 0.1, 0.1, 0, 0, 0, F.schwarz);                              // Armaturen
    } else {
      const sp = typ === 'chopper' ? 0.1 : 0.085;
      [-1, 1].forEach((s) => {
        tube(achT(t, 0.02, s * sp), achT(t, t.gabel * 0.5, s * sp), 0.018, 0.018, 6, typ === 'chopper' ? CHROM : F.gold);
        tube(achT(t, t.gabel * 0.46, s * sp), achT(t, t.gabel, s * sp), 0.026, 0.024, 6, typ === 'chopper' ? CHROM : F.alu);
        tube(achT(t, 0.02, s * sp), achT(t, 0.02, 0), 0.016, 0.016, 5, F.alu);
      });
      const top = achT(t, t.gabel);
      W.box(S, top.x, top.y, top.z, 0.24, 0.035, 0.07, Math.atan2(t.ach[1], t.ach[0]), 0, 0, F.schwarz);
      if (typ === 'superbike') [-1, 1].forEach((s) => { tube(achT(t, t.gabel * 0.93, s * sp), V(s * 0.12, gr.y, gr.z + 0.01), 0.013, 0.013, 5, F.alu); tube(V(s * 0.12, gr.y, gr.z), V(s * 0.25, gr.y, gr.z), 0.019, 0.019, 6, F.schwarz); });
      if (typ === 'roller') { tube(top, V(0, gr.y, gr.z - 0.02), 0.022, 0.022, 6, F.schwarz); tube(V(-0.34, gr.y, gr.z), V(0.34, gr.y, gr.z), 0.013, 0.013, 5, F.alu);
        [-1, 1].forEach((s) => tube(V(s * 0.26, gr.y, gr.z), V(s * 0.36, gr.y, gr.z), 0.02, 0.02, 6, F.schwarz)); }
      if (typ === 'chopper') [-1, 1].forEach((s) => { tube(achT(t, t.gabel, s * 0.1), V(s * 0.3, gr.y - 0.02, gr.z - 0.04), 0.014, 0.014, 5, CHROM); tube(V(s * 0.29, gr.y - 0.01, gr.z - 0.03), V(s * 0.42, gr.y, gr.z), 0.02, 0.02, 6, F.schwarz); });
      // Schutzblech vorn (Lackfarbe): Bogen über dem Vorderrad, relativ zur Achse
      if (typ === 'superbike' || typ === 'roller') { const g = new THREE.CylinderGeometry(t.radV + 0.05, t.radV + 0.05, t.bV + 0.03, 12, 1, true, 1.05, 1.5); g.rotateZ(Math.PI / 2); K.add(g, null, WEISS); }
    }
    void lp;
  }

  function teileGeo(typ) { return memo('t3teile' + typ, () => { const S = W.sammler(), K = W.sammler(); teileBauen(typ, S, K); return { teile: S.geo(), karo: K.geo() }; }); }
  function lenkGeo(typ) {
    return memo('t3lenk' + typ, () => {
      const t = T[typ], S = W.sammler(), K = W.sammler(); lenkBauen(typ, S, K); const lp = lenkPunkt(t);
      const a = S.geo(-lp.x, -lp.y, -lp.z), b = K.geo(-pvV(t).x, -pvV(t).y, -pvV(t).z);
      return { lenk: a, lack: b };
    });
  }
  /** Startnummern-Tafeln eines Typs in EINER Geometrie (UVs für die Zahl). */
  function tafelGeo(typ) {
    return memo('t3tafel' + typ, () => {
      const pos = [], nor = [], uv = [], idx = [];
      T[typ].tafeln.forEach((tf, gi) => {
        const g = new THREE.PlaneGeometry(tf.w, tf.h); g.rotateY(tf.ry); g.translate(tf.x, tf.y, tf.z);
        const p = g.attributes.position.array, n = g.attributes.normal.array, u = g.attributes.uv.array, ix = g.index.array;
        for (let i = 0; i < p.length; i++) { pos.push(p[i]); nor.push(n[i]); }
        for (let i = 0; i < u.length; i++) uv.push(u[i]);
        for (let i = 0; i < ix.length; i++) idx.push(ix[i] + gi * (p.length / 3));
        g.dispose();
      });
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx);
      return g;
    });
  }

  // ---------- Zusammenbau ----------
  function bauenTyp(autoDaten, opt) {
    const typ = autoDaten.typ, t = T[typ];
    const o = Object.assign({}, autoDaten.optionen || {}, opt || {});
    const zahl = (v, d) => (v !== undefined && v !== null && Number.isFinite(v) ? v >>> 0 : d);
    const lack = zahl(o.farbe, zahl(autoDaten.farbe, 0xff6a10)), jersey = zahl(o.fahrer, zahl(autoDaten.farbe2, 0x1d4ed8)), helm = zahl(o.helm, 0xf4f4f4);
    const hose = W.lum(jersey) < 110 ? jersey : F.stiefel, nummer = Number.isFinite(o.nummer) ? o.nummer : 1;
    const g = new THREE.Group(); g.name = autoDaten.id;
    const lage = new THREE.Group(); lage.name = 'lage'; g.add(lage);
    const purzel = new THREE.Group(); purzel.name = 'purzel'; purzel.position.y = M.PIVOT_Y; lage.add(purzel);
    const inhalt = new THREE.Group(); inhalt.name = 'inhalt'; inhalt.position.y = -M.PIVOT_Y; purzel.add(inhalt);
    const mesh = (geo, mat, eltern, name) => { const m = new THREE.Mesh(geo, mat); if (name) m.name = name; (eltern || inhalt).add(m); return m; };

    const tg = teileGeo(typ);
    mesh(tg.teile, vertexMat(false), inhalt, 'teile');
    mesh(tg.karo, lambert(lack, true), inhalt, 'karosserie');
    const fg = W.fahrerGeo(jersey, hose, helm);
    const fm = mesh(fg.geo, vertexMat(false), inhalt, 'fahrer'); fm.position.set(0, t.fahrer.y, t.fahrer.z);
    mesh(tafelGeo(typ), W.nummerMat(nummer), inhalt, 'nummerTafeln');

    // Räder (rollen um x): Hinterrad/-räder
    const rollend = [], ph = V(0, t.ph[0], t.ph[1]);
    const rad = (eltern, R_, breite, x, y, z) => {
      const h = new THREE.Group(); h.name = 'radhalter'; h.position.set(x, y, z); eltern.add(h);
      mesh(W.reifenGeo(R_, breite), lambert(F.gummi), h, 'rad'); mesh(W.felgeGeo(R_), lambert(F.felge, true), h, 'felge');
      return h;
    };
    const quad = typ === 'quad';
    if (quad) { rollend.push(rad(inhalt, t.radH, t.bH, -t.spur, ph.y, ph.z), rad(inhalt, t.radH, t.bH, t.spur, ph.y, ph.z)); }
    else rollend.push(rad(inhalt, t.radH, t.bH, 0, ph.y, ph.z));

    // Lenkgruppe: Gabel/Säule + Lenker (+ Vorderrad bei Zweirädern)
    const pv = pvV(t), lp = lenkPunkt(t), axis = quad ? V(0, 0.93, 0.37).normalize() : norm(t);
    const lenk = new THREE.Group(); lenk.name = 'lenkhalter'; lenk.position.copy(lp); inhalt.add(lenk);
    const lg = lenkGeo(typ);
    mesh(lg.lenk, vertexMat(false), lenk, 'lenkTeile');
    const halter = [];
    if (quad) {
      [-1, 1].forEach((s) => { const h = new THREE.Group(); h.name = 'lenkhalter'; h.position.set(s * t.spur, pv.y, pv.z); inhalt.add(h); halter.push(h); rollend.push(rad(h, t.radV, t.bV, 0, 0, 0)); });
    } else {
      const fv = new THREE.Group(); fv.name = 'fender'; fv.position.set(0, 0, 0); lenk.add(fv);
      mesh(lg.lack, lambert(lack, true), fv, 'kotfluegel');
      rollend.push(rad(lenk, t.radV, t.bV, 0, 0, 0));
    }

    // Licht
    const hlGeo = memo('t3licht' + typ, () => { const x = new THREE.BoxGeometry(0.11, 0.07, 0.04); x.translate(t.licht[0], t.licht[1], t.licht[2]); return x; });
    const scheinwerfer = mesh(hlGeo, basic(F.licht), inhalt, 'scheinwerfer');
    const blGeo = memo('t3rueck' + typ, () => { const x = new THREE.BoxGeometry(0.1, 0.045, 0.03); x.translate(t.rueck[0], t.rueck[1], t.rueck[2]); return x; });
    const bremslichtMat = new THREE.MeshBasicMaterial({ color: F.bremse });
    const bremslicht = mesh(blGeo, bremslichtMat, inhalt, 'bremslicht');

    // Arme (Zwei-Knochen-IK zu den Griffen, drehen mit der Lenkung)
    const sch = { y: W.SCHULTER_Y + t.fahrer.y, z: W.SCHULTER_Z + t.fahrer.z };
    const arme = [-1, 1].map((s) => ({
      s, ober: mesh(W.stabGeo(0.05, 0.043), lambert(jersey), inhalt, 'oberarm'), unter: mesh(W.stabGeo(0.042, 0.036), lambert(jersey), inhalt, 'unterarm'),
      hand: mesh(memo('hand', () => new THREE.SphereGeometry(0.052, 6, 5)), lambert(F.handschuh), inhalt, 'handschuh'),
      schulter: V(s * W.SCHULTER, sch.y, sch.z), griff: V(s * t.grip.x, t.grip.y, t.grip.z), pole: V(s * 0.8, 0.5, 0.3).normalize(),
    }));
    const _h = new THREE.Vector3(), _ell = new THREE.Vector3(), _qq = new THREE.Quaternion();
    let letzter = null;
    function lenken(winkel) {
      const w = Number.isFinite(winkel) ? winkel * t.lenkFaktor : 0;
      if (letzter !== null && Math.abs(w - letzter) < 1e-4) return;
      letzter = w;
      lenk.quaternion.setFromAxisAngle(axis, w); _qq.copy(lenk.quaternion);
      halter.forEach((h) => { h.rotation.y = w; });
      arme.forEach((a) => {
        _h.copy(a.griff).sub(lp).applyQuaternion(_qq).add(lp);
        W.gelenk(a.schulter, _h, t.arm[0], t.arm[1], a.pole, _ell);
        W.spanne(a.ober, a.schulter, _ell); W.spanne(a.unter, _ell, _h); a.hand.position.copy(_h);
      });
    }
    lenken(0);

    // Blob-Schatten
    const sg = new THREE.CircleGeometry(0.5, 14); sg.rotateX(-Math.PI / 2); sg.scale(t.schatten[0], 1, t.schatten[1]);
    const schatten = new THREE.Mesh(sg, W.schattenMat()); schatten.name = 'schatten'; schatten.position.y = 0.025; g.add(schatten);

    const proxy = { rotation: {} };
    Object.defineProperty(proxy.rotation, 'y', { set(w) { lenken(w); }, get() { return letzter === null ? 0 : letzter / t.lenkFaktor; } });
    g.userData = {
      autoId: autoDaten.id, karosserie: 'motorrad', lackFarbe: lack, raeder: rollend, vorderraeder: [], lenkObjekte: [proxy], bremslichter: [bremslicht], scheinwerfer: [scheinwerfer],
      bremslichtMaterial: bremslichtMat, blaulicht: [], dach: null,
      moto: true, lage, purzel, inhalt, lenkGruppe: lenk, typ, kippt: kippt(typ),
    };
    return g;
  }

  const orig = R.sonderbauten.motorrad;
  if (!orig.m3) {
    R.sonderbauten.motorrad = function (autoDaten, opt) { return autoDaten && autoDaten.typ && T[autoDaten.typ] ? bauenTyp(autoDaten, opt) : orig(autoDaten, opt); };
    R.sonderbauten.motorrad.m3 = true;
  }
  R.Moto.typen.modell = { verfuegbar: true, bauenTyp, T };
})();
