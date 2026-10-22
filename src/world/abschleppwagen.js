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
// v32 (N1, 22.10.): „Auto fährt durch den Abschleppwagen“ – bis v31 war der Lkw NUR Optik (kein Körper in der Physik). Jetzt
//   a.kollidieren(dt, { pickups })   je Physikschritt (main.js, nach Kollisionen.autoAuto): kinematischer Körper (8,0 × 2,55 m, unbeweglich,
//                    Pose = dieselbe Spur wie die Optik, ohne Three.js) stößt Spieler, KI und Verkehr weich weg (autoAuto 'sanft', 1 Auto-Treffer
//                    −5 % mit Abklingzeit, Schild fängt ab); der Lkw selbst bleibt unbeschädigt und auf seiner Spur. Kein Körper beim Verkleinern
//                    (schwund) und für liegengebliebene Autos (eigenes Wrack). Wer beim Erscheinen schon tief im Lkw steckt (> durchTief 1,2 m), wird
//                    ohne Stoß sanft herausgeschoben (≤ durchSchub 0,12 m je Schritt; kein Festklemmen/Wegschleudern); Stoß-Tempo so gedeckelt, dass ein angeschobenes Auto ≤ stossTempo (6 m/s) bekommt (Anfahrt startet optisch mit ~30 m/s).
//                    v32 N1c: gestoßen werden alle Fahrzeuge (auch Polizei/Verkehr, die nach dem Schaden-System angelegt werden; die nehmen keinen Schaden).
//                    config.schaden.abschlepp.kollision = false → alt (nur Optik).
// v32 (N1b): Ab dem Aufladen (Phase 1) und beim Wegfahren ist das Wrack am alten Liegeplatz kollisionsfrei (f._abschleppFrei, a.frei,
//   a.paarNur → Kollisionen.autoAuto-Paarfilter in main.js); auf der Ladefläche deckt es der Lkw-Körper ab. Kein unsichtbares Hindernis mehr.
// ============================================================
(function () {
  const R = window.Rennspiel;

  function cfg() { return (R.config && R.config.schaden && R.config.schaden.abschlepp) || {}; }
  function wert(x, std) { return x === undefined ? std : x; }
  function glatt(t) { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); }
  const ORANGE = 0xffa21a, ORANGE_AUS = 0x5a3200;
  // v32 N1: Körper des Lkw (Maße wie Verkehrs-Abschleppwagen; Modell reicht lokal von z −4,35 … +3,5 → Mitte 0,425 m vor dem Ursprung)
  const KOERPER = { laenge: 8.0, breite: 2.55, masse: 1e7, vMax: 200, rueckwaertsMax: 200, beschleunigung: 1, bremsen: 1, wendigkeit: 1, grip: 1 };
  const MITTE_VOR = 0.425;

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
      this.frei = false;
      this.paarNur = (a, b) => !(a && a._abschleppFrei) && !(b && b._abschleppFrei);     // v32 N1b: Paarfilter für Kollisionen.autoAuto
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
    /** v32 N1: Fahrspur des Lkw (Liegeplatz, Querabstand, Start/Weg) – ohne Three.js, gemeinsam für Optik und Kollision. */
    _spur(i, e) {
      const f = this.fahrzeuge[i], v = f.vehicle, st = this.strecke, C = cfg();
      const n = st.abfrage(v.x, v.z, f.index);
      const q = n.seitenabstand, seitlich = wert(C.seitlich, 3.6);
      e.s = n.s; e.qLkw = q >= 0 ? q - seitlich : q + seitlich;
      e.sStart = n.s - wert(C.anfahrtWeg, 38); e.weg = wert(C.abfahrtWeg, 34);
      e.spurOk = true; e.warte = 0; e.aufgegeben = false;
    }

    /**
     * v32 N1d: Wegfahren (Phase 2) ohne Bulldozer – steht/fährt ein Fahrzeug ≤ wegSicht (12 m) vor dem Lkw in seiner Spur, hält der Lkw
     * Abstand (≥ wegLuecke 2 m), indem die Liege-Uhr des Wracks (schaden.z[i].liegen) angehalten wird: Optik, Körper und Reset bleiben
     * dadurch gleich (alles hängt an liegeVergangen). Gesamtdauer höchstens wegMax (10 s), dann verkleinert er sich wie bisher.
     * Läuft VOR schaden.schritt (main.js: kollidieren nach autoAuto, Schaden in Schritt 9) – deshalb +dt vorgehalten.
     */
    _wegHalten(i, e, zs, ab, dt, C, nAlle) {
      const sc = this.schaden, z = sc.z[i], st = this.strecke, fz = this.fahrzeuge;
      if (!z || ab.phase !== 2 || e.aufgegeben || ab.schwund > 0) return;
      const t = zs.liegeVergangen, gesamt = zs.liegeGesamt, aZeit = wert(C.anfahrt, 2.5) + wert(C.aufladen, 1.5);
      const rest = Math.max(0.05, gesamt - aZeit), sicht = wert(C.wegSicht, 12), luecke = wert(C.wegLuecke, 2), VORN = 4.35;
      const sJetzt = this._sBei(e, ab), L = st.spline.laenge;
      let sGrenze = Infinity;
      const pj = this._pose(e, sJetzt);
      for (let j = 0; j < nAlle; j++) {
        if (j === i) continue;
        const g = fz[j];
        if (!g || !g.vehicle || g.ausgeschieden) continue;
        const v = g.vehicle;
        if (Math.abs(v.x - pj.x) > 60 || Math.abs(v.z - pj.z) > 60) continue;
        const n = st.abfrage(v.x, v.z, g.index >= 0 ? g.index : undefined);
        let d = n.s - sJetzt; if (d > L / 2) d -= L; if (d < -L / 2) d += L;
        const hl = (v.daten.laenge || 4.4) / 2, hb = (v.daten.breite || 1.8) / 2;
        const lueckeJetzt = d - hl - VORN;                                         // Lkw-Front bis Heck des Fahrzeugs
        if (lueckeJetzt > sicht || lueckeJetzt < -1.5) continue;
        if (Math.abs(n.seitenabstand - e.qLkw) > 1.275 + hb + 0.4) continue;      // nicht in seiner Spur
        sGrenze = Math.min(sGrenze, sJetzt + d - hl - VORN - luecke);
      }
      if (!(sGrenze < Infinity)) return;
      const weg = Math.max(0.01, e.weg), uGrenze = Math.sqrt(Math.max(0, Math.min(1, (sGrenze - e.s) / weg)));
      const tGrenze = aZeit + uGrenze * rest;
      const tZiel = Math.max(t, Math.min(t + dt, tGrenze));                         // nie zurück, höchstens normal weiter
      if (tZiel >= t + dt - 1e-9) return;
      e.warte = (e.warte || 0) + (t + dt - tZiel);
      if (gesamt + e.warte > wert(C.wegMax, 10)) {                                 // zu lange gewartet → verkleinern wie bisher
        e.aufgegeben = true;
        z.liegen = Math.min(z.liegen, 0.35 + dt);
        return;
      }
      z.liegen = gesamt - tZiel + dt;                                               // schaden.schritt zieht gleich dt ab → liegeVergangen = tZiel
    }

    /** v32 N1: Bogenlänge des Lkw zur Phase ab (gleiche Formel für Optik und Kollision). */
    _sBei(e, ab) {
      if (ab.phase === 0) return e.sStart + (e.s - e.sStart) * (1 - (1 - ab.u) * (1 - ab.u));     // bremst sanft ab
      if (ab.phase === 1) return e.s;
      return e.s + e.weg * ab.u * ab.u;                                                           // fährt an
    }

    _start(i, e) {
      const f = this.fahrzeuge[i], v = f.vehicle, mesh = f.mesh, st = this.strecke, sp = st.spline;
      if (!e.spurOk) this._spur(i, e);            // v32 N1: die Physik (kollidieren) hat die Spur meist schon gesetzt – dieselbe verwenden
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
      e.aktiv = false; e.spurOk = false;
    }

    /** v32 N1b: Wracks ab Phase 1 (Aufladen/Wegfahren) für autoAuto ausblenden – Flag am Eintrag, a.frei = mindestens eins. */
    _freiSetzen(C) {
      const sc = this.schaden, fz = this.fahrzeuge;
      let frei = false;
      const an = !!(sc && sc.an && C.an !== false && C.kollision !== false);
      for (let i = 0; i < fz.length; i++) {
        const f = fz[i];
        if (!f) continue;
        let x = false;
        if (an && sc.z[i]) { const zs = sc.zustand(i); x = zs.liegengeblieben && ablauf(zs.liegeVergangen, zs.liegeGesamt, C).phase >= 1; }
        if (x) { f._abschleppFrei = true; frei = true; } else if (f._abschleppFrei) f._abschleppFrei = false;
      }
      this.frei = frei;
    }

    /**
     * v32 N1: Kollision mit dem Abschleppwagen (je Physikschritt, nach Kollisionen.autoAuto). Der Lkw ist kinematisch (fährt seine Spur,
     * wird nie verschoben, nimmt keinen Schaden); getroffene Autos werden über autoAuto (sanft) weggeschoben, an der Bande nachgeprüft
     * und bekommen einen normalen Auto-Treffer (Abklingzeit in schaden.js – kein Dauerabzug beim Schleifen).
     * @param {number} dt
     * @param {{pickups?:object, countdown?:boolean}} [opt]
     * @returns {{nr:number, i:number, staerke:number}[]} Stöße (nr = getroffenes Auto, i = liegengebliebenes Auto des Lkw)
     */
    kollidieren(dt, opt) {
      const o = opt || {}, C = cfg(), K = R.Kollisionen, sc = this.schaden, out = [];
      this._freiSetzen(C);
      if (o.countdown || !sc || !sc.an || C.an === false || C.kollision === false || !K || !K.autoAuto || !R.Vehicle) return out;
      // v32 N1c: Wracks nur aus dem Schaden-System (sc.z), gestoßen werden ALLE Fahrzeuge – auch Polizei/Verkehr, die main.js erst nach dem Schaden anlegt
      const fz = this.fahrzeuge, n = Math.min(fz.length, sc.z.length), nAlle = fz.length, st = this.strecke;
      const durchTief = wert(C.durchTief, 1.2);
      this._tick = (this._tick || 0) + 1;
      const alt = this._alt || (this._alt = []);
      let aktiv = false;
      for (let i = 0; i < n; i++) {
        const f = fz[i];
        if (!f || !f.vehicle) continue;
        const zs = sc.zustand(i);
        if (!zs.liegengeblieben) { const e0 = this.eintraege[i]; if (e0) { if (!e0.aktiv) e0.spurOk = false; e0.koerperAn = false; e0.durch = null; } continue; }
        const e = this._holen(i);
        if (!e.spurOk) this._spur(i, e);
        const ab = ablauf(zs.liegeVergangen, zs.liegeGesamt, C);
        if (C.wegHalten !== false) this._wegHalten(i, e, zs, ab, dt, C, nAlle);   // v32 N1d: nicht über Autos vor sich hinweg schieben
        if (ab.schwund > 0) { e.koerperAn = false; continue; }                 // verkleinert sich gerade → kein Körper mehr
        const s = this._sBei(e, ab), p = this._pose(e, s);
        const b = e.koerper || (e.koerper = new R.Vehicle(KOERPER));
        b.daten.laenge = KOERPER.laenge; b.daten.breite = KOERPER.breite; b.daten.masse = KOERPER.masse;
        const bx = p.x - Math.sin(p.heading) * MITTE_VOR, bz = p.z - Math.cos(p.heading) * MITTE_VOR;
        // Stoß-Tempo gedeckelt: die Anfahrt beginnt optisch mit ~30 m/s – ein angeschobenes Auto soll weggeschoben, nicht weggeschleudert werden.
        // v32 N1c: Deckel = stossTempo (6 m/s) / (1 + Restitution) → das gestoßene Auto bekommt höchstens ~6 m/s (vorher 7,8)
        const kc = (R.config && R.config.kollision) || {}, resti = kc.restitution !== undefined ? kc.restitution : 0.3;
        const tempo = e.koerperAn && dt > 0 ? Math.min(wert(C.stossTempo, 6) / (1 + resti), Math.max(0, (s - e.sAlt) / dt)) : 0;
        const vor = e.koerperAn ? { x: b.x, z: b.z, h: b.heading } : null;
        e.sAlt = s; e.koerperAn = true; aktiv = true;
        const by = isFinite(p.y) ? p.y : (f.vehicle.y || 0);
        const setze = () => { b.x = bx; b.z = bz; b.y = by; b.heading = p.heading; b.vLaengs = tempo; b.vQuer = 0; b.drehImpuls = 0; b.imLooping = false; b.imFlug = false; b._anBande = false; };
        setze();
        const durch = e.durch || (e.durch = {});
        for (let j = 0; j < nAlle; j++) {
          if (j === i) continue;
          const g = fz[j];
          if (!g || !g.vehicle || g.ausgeschieden) continue;
          const zj = j < n ? sc.zustand(j) : null;
          if (zj && zj.liegengeblieben) continue;                                 // Wracks (auch das eigene) bleiben, wo sie liegen
          const v = g.vehicle;
          if (Math.hypot(v.x - bx, v.z - bz) > 4.9 + Math.hypot(v.daten.laenge || 4.4, v.daten.breite || 1.8) / 2) { durch[j] = false; continue; }
          setze();
          const tief = K.eindringung ? K.eindringung(v, b) : null;
          // tief drin (Lkw erscheint im Auto, > durchTief): kein Wegschleudern/Festklemmen – sanft herausschieben (≤ durchSchub m je Schritt, kein Stoß)
          if (tief && (durch[j] || tief.tief > durchTief)) {
            durch[j] = true;
            const sch = Math.min(tief.tief + 0.05, wert(C.durchSchub, 0.12));
            v.x -= tief.nx * sch; v.z -= tief.nz * sch;
            if (st && K.bande) K.bande(v, st);
            continue;
          }
          durch[j] = false;
          b._kollAlt = vor;
          const a = alt[j];
          v._kollAlt = a && a.t === this._tick - 1 ? { x: a.x, z: a.z, h: a.h } : null;
          const xA = v.x, zA = v.z;
          const res = K.autoAuto([g, b], { dt, rempeln: 'sanft' });
          setze();                                                                // Lkw bleibt auf seiner Spur, Tempo unverändert
          if (st && (v.x !== xA || v.z !== zA) && K.bande) K.bande(v, st);
          if (!res.length) continue;
          const stark = res[0].staerke;
          out.push({ nr: j, i, staerke: stark });
          const pk = o.pickups;
          if (j < n) {                                                            // Verkehr/Polizei ohne Schaden-Eintrag: nur Stoß
            if (pk && pk.hatSchild && pk.hatSchild(j) && sc.zaehlt(j, 'auto', stark) && pk.schildVerbrauchen(j)) sc.abfangen(j);
            sc.treffer(j, 'auto', stark);
          }
          if (R.Audio && R.Audio.kollision && g.istSpieler && stark >= 1.5) { try { R.Audio.kollision(Math.min(6, stark)); } catch (err) { /* egal */ } }
        }
        b._kollAlt = { x: bx, z: bz, h: p.heading };
      }
      if (aktiv) for (let j = 0; j < nAlle; j++) {
        const v = fz[j] && fz[j].vehicle;
        if (!v) continue;
        const a = alt[j] || (alt[j] = {});
        a.x = v.x; a.z = v.z; a.h = v.heading; a.t = this._tick;
      }
      this.stoesse = out;
      return out;
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
      const s = this._sBei(e, ab);                                                                   // v32 N1: gleiche Formel wie die Kollision
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
        if (this.fahrzeuge[i]) this.fahrzeuge[i]._abschleppFrei = false;
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
