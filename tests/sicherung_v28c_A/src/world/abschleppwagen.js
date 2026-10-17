// ============================================================
// 14.10. (v18) Abschleppwagen – NUR Optik (Schaden „an“). Die Zeiten kommen aus schaden.js (zustand(i).liegeVergangen / liegeGesamt),
// die Maße aus config.schaden.abschlepp. Nach dem Liegenbleiben (0 % Gesundheit):
//   0 … anfahrt s        gelber Abschleppwagen (orange Rundumleuchte blinkt) fährt von hinten heran und hält neben dem Auto
//   … + aufladen s       Kran hebt das Auto an und setzt es seitlich auf die Ladefläche
//   … bis liegenZeit     Abschleppwagen fährt mit dem Auto davon, in den letzten 0,35 s verkleinern sich beide (Überblendung)
//   liegenZeit           schaden.js meldet 'abschleppen' → main.js setzt das Auto am Reset-Punkt zurück (Reparatur), dieses Modul gibt das
//                        Auto-Mesh wieder frei (sichtbar, Größe 1).
// Das Physik-Auto bleibt die ganze Zeit eingefroren am Liegeplatz (Kamera schaut zu); nur das Mesh wandert.
//
//   const a = new Rennspiel.Abschleppwagen(strecke, fahrzeuge, schaden, szene);   // szene: THREE.Scene oder Group; Fahrzeuge = main.js this.fahrzeuge
//   a.update(dt)       je Frame NACH dem Setzen der Auto-Meshes (main.js, vor dem Zeichnen); dt nur für die Räder
//   a.zerstoeren()
// Brauchbar ohne eigene Uhr: alles ist eine Funktion von zustand(i).liegeVergangen (deterministisch, pausiert mit dem Spiel).
// Hilfsfunktion (rein, Node-Tests): Abschleppwagen.ablauf(t, gesamt, cfg) → { phase 0|1|2, u (0..1 in der Phase), schwund (0..1) }.
// ============================================================
(function () {
  const R = window.Rennspiel;

  function cfg() { return (R.config && R.config.schaden && R.config.schaden.abschlepp) || {}; }
  function wert(x, std) { return x === undefined ? std : x; }
  function glatt(t) { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); }
  const ORANGE = 0xffa21a, ORANGE_AUS = 0x5a3200;

  /** Phase zur Zeit t (s seit dem Liegenbleiben): 0 = anfahren, 1 = aufladen, 2 = wegfahren; u = Fortschritt in der Phase; schwund = Verkleinern am Ende. */
  function ablauf(t, gesamt, c) {
    c = c || cfg();
    const a = wert(c.anfahrt, 2.5), l = wert(c.aufladen, 1.5);
    if (t < a) return { phase: 0, u: Math.max(0, t / a), schwund: 0 };
    if (t < a + l) return { phase: 1, u: (t - a) / l, schwund: 0 };
    const rest = Math.max(0.05, gesamt - a - l);
    return { phase: 2, u: Math.min(1, (t - a - l) / rest), schwund: Math.max(0, Math.min(1, (t - (gesamt - 0.35)) / 0.35)) };
  }

  class Abschleppwagen {
    constructor(strecke, fahrzeuge, schaden, szene) {
      this.strecke = strecke; this.fahrzeuge = fahrzeuge; this.schaden = schaden; this.szene = szene || null;
      this.eintraege = [];            // je Fahrzeug: null | { lkw, ... , aktiv }
      this._hat = typeof THREE !== 'undefined';
    }

    /** Lkw-Modell (Front bei −z, Ursprung = Mitte der Ladefläche am Boden). */
    _lkwBauen() {
      const g = new THREE.Group(); g.name = 'Abschleppwagen';
      const C = cfg(), lade = wert(C.ladeHoehe, 1.15), kran = wert(C.kranHoehe, 3.9);
      const mat = (c) => new THREE.MeshLambertMaterial({ color: c });
      const box = (w, h, d, farbe, x, y, z, eltern) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), typeof farbe === 'number' ? mat(farbe) : farbe); m.position.set(x, y, z); (eltern || g).add(m); return m; };
      box(2.3, 0.35, 8.1, 0x30343a, 0, 0.78, -0.35);                       // Fahrgestell
      box(2.55, 0.18, 5.7, 0x464c54, 0, lade - 0.09, 0.55);                // Ladefläche
      box(0.1, 0.22, 5.7, 0xf2c200, 1.22, lade + 0.11, 0.55);              // gelbe Seitenleisten
      box(0.1, 0.22, 5.7, 0xf2c200, -1.22, lade + 0.11, 0.55);
      box(2.55, 0.12, 0.3, 0xf2c200, 0, lade + 0.06, 3.5);                 // Heckkante gelb
      // Fahrerhaus
      box(2.3, 1.9, 1.9, 0xf0b020, 0, 1.88, -3.3);
      box(2.34, 0.1, 1.94, 0xe09a10, 0, 2.88, -3.3);                       // Dach
      box(2.0, 0.75, 0.06, 0x20324a, 0, 2.25, -4.27);                      // Frontscheibe
      box(0.06, 0.7, 1.4, 0x20324a, 1.16, 2.25, -3.2);                     // Seitenfenster
      box(0.06, 0.7, 1.4, 0x20324a, -1.16, 2.25, -3.2);
      box(2.3, 0.5, 0.3, 0x30343a, 0, 1.15, -4.35);                        // Stoßstange
      box(0.4, 0.2, 0.06, 0xfff4c0, 0.8, 1.55, -4.29); box(0.4, 0.2, 0.06, 0xfff4c0, -0.8, 1.55, -4.29);   // Scheinwerfer
      // Räder (Zylinder um die x-Achse)
      const raeder = [];
      const radGeo = new THREE.CylinderGeometry(0.58, 0.58, 0.38, 14); radGeo.rotateZ(Math.PI / 2);
      const radMat = mat(0x1b1b1d);
      for (const z of [-3.3, 1.3, 2.6]) for (const x of [-1.2, 1.2]) {
        const r = new THREE.Mesh(radGeo, radMat); r.position.set(x, 0.58, z); g.add(r); raeder.push(r);
      }
      // Rundumleuchten (zwei) – blinken abwechselnd
      const blink = new THREE.MeshBasicMaterial({ color: ORANGE }), blink2 = new THREE.MeshBasicMaterial({ color: ORANGE_AUS });
      const leuchte = (x, m) => { const l = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.2, 0.26, 10), m); l.position.set(x, 3.08, -3.3); g.add(l); };
      leuchte(-0.6, blink); leuchte(0.6, blink2);
      // Kran: Mast hinter dem Fahrerhaus, Ausleger (Länge/Richtung je Frame), Seil
      const mastH = kran - lade;
      box(0.38, mastH, 0.38, 0xd9a010, 0, lade + mastH / 2, -2.0);
      const auslegerGeo = new THREE.BoxGeometry(0.24, 0.24, 1); auslegerGeo.translate(0, 0, 0.5);        // reicht von z 0 … 1 (Skalierung = Länge)
      const ausleger = new THREE.Mesh(auslegerGeo, mat(0xd9a010)); ausleger.position.set(0, kran, -2.0); g.add(ausleger);
      const seilGeo = new THREE.BoxGeometry(0.06, 1, 0.06); seilGeo.translate(0, -0.5, 0);               // reicht von y 0 … −1
      const seil = new THREE.Mesh(seilGeo, mat(0x222222)); seil.visible = false; g.add(seil);
      const haken = box(0.3, 0.2, 0.3, 0x333333, 0, kran, -2.0); haken.visible = false;
      g.userData = { blink, blink2, ausleger, seil, haken, kran, lade, raeder };
      g.visible = false;
      return g;
    }

    _holen(i) {
      let e = this.eintraege[i];
      if (!e) e = this.eintraege[i] = { lkw: null, aktiv: false };
      return e;
    }

    /** Ablauf für Fahrzeug i starten: Liegeplatz, Fahrspur des Lkw (Bogenlänge, Querabstand), Ausgangslage des Meshes merken. */
    _start(i, e) {
      const f = this.fahrzeuge[i], v = f.vehicle, mesh = f.mesh, st = this.strecke, sp = st.spline, C = cfg();
      const n = st.abfrage(v.x, v.z, f.index);
      const q = n.seitenabstand, seitlich = wert(C.seitlich, 3.6);
      e.s = n.s; e.qLkw = q >= 0 ? q - seitlich : q + seitlich;
      e.sStart = n.s - wert(C.anfahrtWeg, 38); e.weg = wert(C.abfahrtWeg, 34);
      // v28 W4b: Höhe aus der Anzeige (Räder auf dem sichtbaren Belag, main.js radBodenPose) – sonst sackt das Wrack beim Anheben 6 cm ab
      e.auto = { x: v.x, y: isFinite(mesh.position.y) ? mesh.position.y : v.y, z: v.z, heading: v.heading, rx: mesh.rotation.x, rz: mesh.rotation.z, sx: mesh.scale.x, sy: mesh.scale.y, sz: mesh.scale.z };
      e.dist = 0;
      if (!e.lkw) { e.lkw = this._lkwBauen(); if (this.szene && this.szene.add) this.szene.add(e.lkw); }
      e.aktiv = true;
      void sp;
    }

    /** Lkw-Pose zur Bogenlänge s: { x, y, z, heading } (Querabstand qLkw). */
    _pose(e, s) {
      const st = this.strecke, p = st.spline.punktBei(s);
      const x = p.x + p.nx * e.qLkw, z = p.z + p.nz * e.qLkw;
      return { x, y: st.hoeheAn(x, z), z, heading: Math.atan2(-p.tx, -p.tz) };
    }

    _freigeben(i, e) {
      const f = this.fahrzeuge[i];
      if (f && f.mesh && e.auto) {
        f.mesh.visible = true; f.mesh.scale.set(e.auto.sx, e.auto.sy, e.auto.sz);
      }
      if (e.lkw) e.lkw.visible = false;
      e.aktiv = false;
    }

    update(dt) {
      if (!this._hat || !this.schaden || !this.schaden.an) return;
      const C = cfg();
      if (C.an === false) return;
      const n = Math.min(this.fahrzeuge.length, this.schaden.z.length);
      for (let i = 0; i < n; i++) {
        const f = this.fahrzeuge[i];
        if (!f || !f.mesh) continue;
        const zs = this.schaden.zustand(i), e = this.eintraege[i];
        if (!zs.liegengeblieben) { if (e && e.aktiv) this._freigeben(i, e); continue; }
        const ee = this._holen(i);
        if (!ee.aktiv) this._start(i, ee);
        this._zeichnen(i, ee, zs.liegeVergangen, zs.liegeGesamt, dt);
      }
    }

    _zeichnen(i, e, t, gesamt, dt) {
      const f = this.fahrzeuge[i], mesh = f.mesh, lkw = e.lkw, U = lkw.userData, C = cfg();
      const ab = ablauf(t, gesamt, C), lade = wert(C.ladeHoehe, 1.15), kran = U.kran;
      // --- Lkw-Position ---
      let s;
      if (ab.phase === 0) s = e.sStart + (e.s - e.sStart) * (1 - (1 - ab.u) * (1 - ab.u));        // bremst sanft ab
      else if (ab.phase === 1) s = e.s;
      else s = e.s + e.weg * ab.u * ab.u;                                                            // fährt an
      const p = this._pose(e, s);
      lkw.visible = true;
      lkw.position.set(p.x, p.y, p.z); lkw.rotation.set(0, p.heading, 0);
      const sc = 1 - glatt(ab.schwund);
      lkw.scale.set(Math.max(0.001, sc), Math.max(0.001, sc), Math.max(0.001, sc));
      // Räder drehen sich mit der gefahrenen Strecke
      const gefahren = (ab.phase === 0 ? s - e.sStart : ab.phase === 2 ? e.weg * ab.u * ab.u : 0);
      for (const r of U.raeder) r.rotation.x = -(gefahren + (ab.phase === 2 ? (e.s - e.sStart) : 0)) / 0.58;
      // Rundumleuchte: abwechselnd
      const an = Math.floor(t / 0.25) % 2 === 0;
      U.blink.color.setHex(an ? ORANGE : ORANGE_AUS); U.blink2.color.setHex(an ? ORANGE_AUS : ORANGE);
      // --- Auto-Mesh ---
      const a = e.auto;
      const ec = ab.phase === 0 ? 0 : ab.phase === 1 ? glatt(ab.u) : 1;                             // Fortschritt Auto → Ladefläche
      // Ladeposition: Mitte der Ladefläche (lokal z +0.55 vom Ursprung des Lkw)
      // Mitte der Ladefläche: lokal +z (Heck) = Welt (sin h, cos h), 0,55 m hinter dem Ursprung des Lkw
      const lx = p.x + Math.sin(p.heading) * 0.55, lz = p.z + Math.cos(p.heading) * 0.55;
      const hoch = Math.sin(Math.PI * ec) * 1.9;
      const dH = R.Vehicle.winkelDiff(p.heading, a.heading);
      mesh.visible = true;
      mesh.position.set(a.x + (lx - a.x) * ec, a.y + (p.y + lade - a.y) * ec + hoch, a.z + (lz - a.z) * ec);
      mesh.rotation.set(a.rx * (1 - ec), a.heading + dH * ec, a.rz * (1 - ec), 'YXZ');
      if (ab.phase === 2) mesh.position.set(lx, p.y + lade * sc, lz);                                // fest auf der Ladefläche mitfahren
      mesh.scale.set(a.sx * sc, a.sy * sc, a.sz * sc);
      // --- Kran: Ausleger zeigt (in Lkw-Koordinaten) auf das Auto; Seil hängt vom Ausleger-Ende zum Dach ---
      const wx = mesh.position.x - p.x, wz = mesh.position.z - p.z;
      const lokX = wx * Math.cos(p.heading) - wz * Math.sin(p.heading), lokZ = wx * Math.sin(p.heading) + wz * Math.cos(p.heading);
      const dx = lokX - 0, dz = lokZ + 2.0;                                                           // vom Mast (0, −2,0) aus
      const laenge = Math.max(0.8, Math.hypot(dx, dz));
      if (ab.phase === 1) {
        U.ausleger.rotation.y = Math.atan2(dx, dz); U.ausleger.scale.set(1, 1, laenge);
        U.seil.visible = true; U.haken.visible = true;
        U.seil.position.set(lokX, kran, lokZ);
        const dach = mesh.position.y - p.y + 1.45;                                                    // Dachhöhe über Lkw-Boden
        U.seil.scale.set(1, Math.max(0.1, kran - dach), 1);
        U.haken.position.set(lokX, dach + 0.1, lokZ);
      } else {
        U.ausleger.rotation.y = 0; U.ausleger.scale.set(1, 1, 2.6);                                   // Ausleger liegt über der Ladefläche
        U.seil.visible = false; U.haken.visible = false;
      }
      void dt;
    }

    zerstoeren() {
      for (let i = 0; i < this.eintraege.length; i++) {
        const e = this.eintraege[i];
        if (!e) continue;
        if (e.aktiv) this._freigeben(i, e);
        if (e.lkw) {
          if (e.lkw.parent) e.lkw.parent.remove(e.lkw);
          e.lkw.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
        }
      }
      this.eintraege = [];
    }
  }
  Abschleppwagen.ablauf = ablauf;
  R.Abschleppwagen = Abschleppwagen;
})();
