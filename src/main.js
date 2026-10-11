// ============================================================
// Hauptprogramm: Renderer, Szene, Spielschleife mit festem Physikschritt
// Abschnitt 3: Strecke "Wiese" mit Deko, Startaufstellung, Rennleitung
// (Countdown, Runden, Checkpoints). Gegner stehen noch still (KI folgt).
// Abschnitt 4: Bande + Auto-Auto-Kollisionen, Fahrhilfen, Kamerawackeln,
// Reset auf freie Stelle (R / T), Hinweis "R drücken" wenn ein Auto feststeckt.
// ============================================================
(function () {
  const R = window.Rennspiel;

  // --- Einstellungen: Standardwerte, Prüfen, Speichern (localStorage) ---
  function standardEinstellungen() {
    const c = R.config;
    return {
      modus: 'solo', streckeId: R.trackCatalog[0].id, autoIds: ['troc-cabrio', 'multivan'],
      fahrer: c.fahrerStandard.slice(),
      runden: c.rennen.rundenStandard, gegner: c.rennen.gegnerStandard,
      schwierigkeit: c.schwierigkeitStandard, fahrhilfe: [c.fahrhilfeStandard, c.fahrhilfeStandard],
    };
  }

  /** Beliebiges Objekt in gültige Einstellungen verwandeln (fehlende/ungültige Werte → Standard). */
  function einstellungenPruefen(roh) {
    const std = standardEinstellungen(), c = R.config, r = roh || {};
    const zahl = (v, lo, hi, d) => (Number.isFinite(+v) && v !== null && v !== '' ? Math.max(lo, Math.min(hi, Math.round(+v))) : d);
    const autoOk = (id, d) => (R.carCatalog.find(a => a.id === id) ? id : d);
    const ids = Array.isArray(r.autoIds) ? r.autoIds : [];
    const hilfe = Array.isArray(r.fahrhilfe) ? r.fahrhilfe : [];
    const fa = Array.isArray(r.fahrer) ? r.fahrer : [];
    const fahrerOk = (n, d) => (R.fahrerSuche(n) ? n : d);
    return {
      modus: r.modus === 'zwei' ? 'zwei' : 'solo',
      streckeId: R.trackCatalog.find(t => t.id === r.streckeId) ? r.streckeId : std.streckeId,
      autoIds: [autoOk(ids[0], std.autoIds[0]), autoOk(ids[1], std.autoIds[1])],
      fahrer: R.fahrerEindeutig([fahrerOk(fa[0], std.fahrer[0]), fahrerOk(fa[1], std.fahrer[1])]),
      runden: zahl(r.runden, c.rennen.rundenMin, c.rennen.rundenMax, std.runden),
      gegner: zahl(r.gegner, 0, c.rennen.gegnerMax, std.gegner),
      schwierigkeit: c.schwierigkeiten[r.schwierigkeit] ? r.schwierigkeit : std.schwierigkeit,
      fahrhilfe: [0, 1].map(i => (c.fahrhilfen[hilfe[i]] ? hilfe[i] : std.fahrhilfe[i])),
    };
  }

  function einstellungenLaden() {
    try {
      const text = window.localStorage.getItem(R.config.ui.speicherSchluessel);
      if (text) return einstellungenPruefen(JSON.parse(text));
    } catch (e) { /* kein localStorage oder kaputt: Standard */ }
    return standardEinstellungen();
  }

  class Spiel {
    constructor(canvas) {
      const g = R.config.grafik;
      this.canvas = canvas;
      this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
      // pixelRatio setzt qualitaetAnwenden() (Solo 1,5 / Split 1,0, adaptiv runter/hoch).
      // setSize(..., false): das Canvas behält seine CSS-Größe (100vw/100vh), nur der Zeichenpuffer ändert sich.
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, g.pixelRatioMax));
      this.renderer.setSize(window.innerWidth, window.innerHeight, false);
      this.renderer.shadowMap.enabled = g.schatten;
      this.renderer.info.autoReset = false;   // Split-Screen: Draw-Calls beider Hälften zählen (reset je Frame)
      this.qualitaet = { stufe: 0, unten: 0, oben: 0, fpsGlatt: 60, sicht: g.sichtweite, wechsel: 0 };
      // Leistungsmessung: Ringpuffer der letzten 60 Frames je Block (ms)
      this._mess = { n: 0, i: 0, physik: new Float64Array(60), audio: new Float64Array(60), hud: new Float64Array(60),
        grafik: new Float64Array(60), render: new Float64Array(60), gesamt: new Float64Array(60), dt: new Float64Array(60), schritte: new Float64Array(60) };
      this._hudZeit = -1e9;     // letzte HUD-Aktualisierung (ms, Zeitstempel des Frames)
      this._frameCb = (t) => this.frame(t);   // einmal anlegen: keine neue Closure je Frame

      this.szene = new THREE.Scene();
      this.szene.background = new THREE.Color(0x8fc8ff);
      this.szene.fog = new THREE.Fog(0x8fc8ff, g.sichtweite * 0.55, g.sichtweite);

      // Licht
      this.halbkugelLicht = new THREE.HemisphereLight(0xdfefff, 0x4a6b2a, 0.9);
      this.szene.add(this.halbkugelLicht);
      const sonne = new THREE.DirectionalLight(0xfff3d6, 1.1);
      sonne.position.set(120, 180, 60);
      this.szene.add(sonne);
      this.sonne = sonne;

      this.input = new R.Input();
      this.uhr = { letzte: performance.now(), rest: 0, fps: 0, frames: 0, fpsZeit: 0 };
      this.fahrzeuge = [];     // { vehicle, mesh }
      this.kameras = [];
      this.huds = [];
      this.laeuft = false;
      this.zustand = 'menue';  // 'menue' | 'rennen' | 'ergebnis'  (Pause = this.pausiert im Zustand 'rennen')
      this.pausiert = false;
      this.ergebnis = null;    // eingefrorene Ergebnisliste
      this.einstellungen = einstellungenLaden();
      this.fahrhilfeStufe = this.einstellungen.fahrhilfe[0];
      this.stoesse = [];       // Stöße des letzten Physikschritts (Sound später)
      this.menueKamera = new THREE.PerspectiveCamera(g.fov, window.innerWidth / window.innerHeight, 0.3, g.sichtweite + 200);
      this.menueS = 0;

      // Oberfläche
      this.ui = document.getElementById('ui');
      this.hudWurzel = document.getElementById('huds');
      this.debugEl = document.getElementById('debug');
      this.menue = new R.Menue(this, this.ui);
      this.ergebnisAnzeige = new R.ErgebnisAnzeige(this, this.ui);
      this.pauseAnzeige = new R.PauseAnzeige(this, this.ui);

      window.addEventListener('resize', () => this.groesse());
      this.input.beiTaste((code, e) => this.taste(code, e));
    }

    // ---------- Einstellungen ----------
    einstellungenSpeichern() {
      this.fahrhilfeStufe = this.einstellungen.fahrhilfe[0];
      try { window.localStorage.setItem(R.config.ui.speicherSchluessel, JSON.stringify(this.einstellungen)); } catch (e) { /* egal */ }
    }

    // ---------- Tastatur nach Zustand ----------
    taste(code, e) {
      const T = R.config.tasten;
      const wiederholt = !!(e && e.repeat);
      if (code === T.vollbild) { if (!wiederholt) this.vollbild(); return; }
      if (code === T.debug) { if (!wiederholt) this.debugEl.classList.toggle('an'); return; }
      if (code === T.ton) { if (!wiederholt && R.Audio) { R.Audio.schalten(); if (this.zustand === 'menue') this.menue.zeichnen(); } return; }
      if (this.zustand === 'menue') { this.menue.taste(code); return; }
      if (wiederholt) return;
      if (this.zustand === 'ergebnis') { this.ergebnisAnzeige.taste(code); return; }
      if (this.zustand !== 'rennen') return;
      if (this.pausiert) { this.pauseAnzeige.taste(code); return; }
      if (code === T.pause) this.pauseSetzen(true);
      else if (code === T.kamera) this.kameras.forEach(k => k.naechsterModus());
      else if (code === T.resetSpieler1) this.spielerZuruecksetzen(0);
      else if (code === T.resetSpieler2) this.spielerZuruecksetzen(1);
    }

    pauseSetzen(an) {
      if (this.zustand !== 'rennen') return;
      this.pausiert = !!an;
      if (an) this.pauseAnzeige.zeigen(); else this.pauseAnzeige.verstecken();
      this.uhr.rest = 0;
    }

    groesse() {
      const w = window.innerWidth, h = window.innerHeight, g = R.config.grafik;
      this.qualitaetAnwenden(false);
      this.renderer.setSize(w, h, false);
      const split = this.kameras.length === 2;
      this.kameras.forEach(k => k.groesseSetzen(split ? (w / 2) / h : w / h, split ? g.fovSplitScreen : g.fov));
      this.menueKamera.aspect = w / h; this.menueKamera.updateProjectionMatrix();
      this.ui.classList.toggle('split', split);
      this.huds.forEach(hd => hd.groesse(split ? w / 2 : w, h));
    }

    vollbild() {
      const el = document.documentElement;
      if (!document.fullscreenElement) (el.requestFullscreen || el.webkitRequestFullscreen).call(el);
      else (document.exitFullscreen || document.webkitExitFullscreen).call(document);
    }

    // ---------- Qualität (pixelRatio, Nebel) ----------
    /** Höchste pixelRatio-Stufe für den aktuellen Modus (Index in qualitaetsStufen). */
    _startStufe() {
      const g = R.config.grafik, st = g.qualitaetsStufen;
      const max = this.kameras.length === 2 ? g.pixelRatioSplit : g.pixelRatioMax;
      let i = st.findIndex(v => v <= max + 1e-6);
      return i < 0 ? st.length - 1 : i;
    }

    /**
     * pixelRatio und Nebel-Sichtweite aus Modus + adaptiver Stufe setzen.
     * groesseAuch: danach renderer.setSize aufrufen (Zeichenpuffer neu anlegen).
     */
    qualitaetAnwenden(groesseAuch) {
      const g = R.config.grafik, q = this.qualitaet, st = g.qualitaetsStufen;
      const i = Math.min(st.length - 1, this._startStufe() + q.stufe);
      const pr = Math.min(window.devicePixelRatio || 1, st[i]);
      if (Math.abs(this.renderer.getPixelRatio() - pr) > 1e-6) {
        this.renderer.setPixelRatio(pr);
        if (groesseAuch) this.renderer.setSize(window.innerWidth, window.innerHeight, false);
      }
      // Nebel: je Stufe −20 % Sichtweite; Kameras zeichnen nichts hinter dem Nebel
      const sicht = q.sicht * Math.pow(g.nebelJeStufe, q.stufe);
      if (this.szene.fog) { this.szene.fog.near = sicht * 0.55; this.szene.fog.far = sicht; }
      this.kameras.forEach(k => k.sichtweiteSetzen(sicht + 20));
    }

    /**
     * Adaptive Qualität: fps (geglättet) länger als adaptivSekunden unter fpsUnten → Stufe runter,
     * länger über fpsOben → Stufe hoch (Hysterese durch die Lücke 45…58 und die Wartezeit).
     */
    _qualitaetAnpassen(dt) {
      const g = R.config.grafik, q = this.qualitaet;
      if (!g.adaptiv || this.zustand !== 'rennen' || this.pausiert || !(dt > 0) || dt > 0.25) { q.unten = q.oben = 0; return; }
      q.fpsGlatt += (1 / dt - q.fpsGlatt) * Math.min(1, dt * 4);     // ≈ 0,25 s Glättung
      const maxStufe = Math.max(0, g.qualitaetsStufen.length - 1 - this._startStufe()) + 1;   // + eine reine Nebel-Stufe
      if (q.fpsGlatt < g.fpsUnten) { q.unten += dt; q.oben = 0; }
      else if (q.fpsGlatt > g.fpsOben) { q.oben += dt; q.unten = 0; }
      else { q.unten = q.oben = 0; }
      let neu = q.stufe;
      if (q.unten > g.adaptivSekunden && q.stufe < maxStufe) neu++;
      else if (q.oben > g.adaptivSekunden && q.stufe > 0) neu--;
      if (neu !== q.stufe) {
        q.stufe = neu; q.unten = q.oben = 0; q.wechsel++;
        this.qualitaetAnwenden(true);
      }
    }

    // ---------- Szene auf- und abbauen ----------
    /** Alles außer Licht entfernen und Speicher freigeben (Katalog-Caches der Autos bleiben). */
    szeneAbbauen() {
      this.huds.forEach(h => h.zerstoeren());
      this.huds = [];
      const autoMeshes = new Set(this.fahrzeuge.map(f => f.mesh));
      const freigeben = (m) => { if (m.map) m.map.dispose(); m.dispose(); };
      this.szene.children.slice().forEach((o) => {
        if (o.isLight) return;
        this.szene.remove(o);
        if (autoMeshes.has(o)) {
          // Auto-Geometrien/-Materialien liegen im Katalog-Cache; nur der Schatten-Quad gehört dem Auto
          o.traverse((c) => { if (c.name === 'schatten' && c.geometry) c.geometry.dispose(); });
          return;
        }
        o.traverse((c) => {
          if (c.geometry) c.geometry.dispose();
          if (c.isInstancedMesh) c.dispose();
          if (c.material) (Array.isArray(c.material) ? c.material : [c.material]).forEach(freigeben);
        });
      });
      this.fahrzeuge = []; this.kameras = [];
      this.rennen = null; this.strecke = null; this.ergebnis = null;
      this.stoesse = [];
      if (R.Audio) { R.Audio.motorAlleEntfernen(); R.Audio.bremsen(false); }
    }

    /** Nur die Strecke samt Deko und Himmel aufbauen (Menühintergrund und Rennen). */
    streckeSzeneBauen(trackId) {
      const daten = R.trackCatalog.find(t => t.id === trackId) || R.trackCatalog[0];
      const strecke = new R.Strecke(daten);
      this.strecke = strecke;
      // Strecke + Deko bewegen sich nie: Instanzen in Regionen teilen (Culling je Kamera), Matrizen einfrieren
      this.szene.add(R.themes.statischVorbereiten(strecke.bauen()));
      this.szene.add(R.themes.statischVorbereiten(R.themes.dekoBauen(daten.thema, strecke)));
      // Thema: Himmel, Nebel, Licht
      const thema = R.themes[daten.thema] || R.themes.wiese;
      const sicht = thema.sichtweite || R.config.grafik.sichtweite;
      this.szene.background = new THREE.Color(thema.himmel);
      this.szene.fog = new THREE.Fog(thema.nebel, sicht * 0.55, sicht);
      this.qualitaet.sicht = sicht;
      this.qualitaetAnwenden(true);
      if (this.halbkugelLicht && thema.lichtBoden !== undefined) this.halbkugelLicht.groundColor.setHex(thema.lichtBoden);
      if (this.halbkugelLicht && thema.lichtHimmel !== undefined) this.halbkugelLicht.color.setHex(thema.lichtHimmel);
      if (this.sonne && thema.sonnenFarbe !== undefined) this.sonne.color.setHex(thema.sonnenFarbe);
      if (this.sonne && thema.sonnenIntensitaet !== undefined) this.sonne.intensity = thema.sonnenIntensitaet;
      return strecke;
    }

    /** Menü-Hintergrund: leere Strecke, über die die Kamera langsam fliegt. */
    menueHintergrund(trackId) {
      if (this.zustand === 'menue' && this.strecke && this.strecke.id === trackId && !this.rennen) return;
      this.szeneAbbauen();
      this.zustand = 'menue';
      this.streckeSzeneBauen(trackId);
      this.menueS = 0;
    }

    /** Zurück ins Hauptmenü (aus Pause oder Ergebnis). */
    zumMenue() {
      this.pausiert = false;
      this.pauseAnzeige.verstecken(); this.ergebnisAnzeige.verstecken();
      this.zustand = 'menue';
      this.szeneAbbauen();
      this.ui.classList.remove('split');
      this.menue.zeigen(0);
    }

    /**
     * Neues Rennen starten. Ohne Argument: aktuelle Einstellungen (= "Nochmal").
     * Mit Argument: wird mit den bisherigen Einstellungen zusammengeführt und gespeichert.
     */
    rennenStarten(einst) {
      if (einst) this.einstellungen = einstellungenPruefen(Object.assign({}, this.einstellungen, einst));
      this.einstellungenSpeichern();
      const e = this.einstellungen;
      this.menue.verstecken(); this.ergebnisAnzeige.verstecken(); this.pauseAnzeige.verstecken();
      this.szeneAbbauen();
      const zwei = e.modus === 'zwei';
      this.pausiert = false;
      this.streckeAufbauen(e.streckeId, {
        spieler: zwei ? 2 : 1, autoIds: e.autoIds, fahrer: e.fahrer, gegner: e.gegner, runden: e.runden,
        schwierigkeit: e.schwierigkeit, fahrhilfe: e.fahrhilfe,
      });
      for (let i = 0; i < (zwei ? 2 : 1); i++) this.kameraHinzufuegen(this.fahrzeuge[i]);
      const split = zwei;
      this.huds = this.kameras.map((k, i) => new R.Hud(this.hudWurzel, {
        rennen: this.rennen, teilnehmer: this.rennen.teilnehmer[i], fahrzeug: this.fahrzeuge[i], nr: i, split,
      }));
      this.rennen.bei('fertig', () => this.rennenFertig());
      // Ton: Motoren je Auto, Ereignisse
      if (R.Audio) {
        const A = R.Audio; this._tonCd = -1;
        this.fahrzeuge.forEach((f, i) => A.motorAnlegen(i, { spieler: f.istSpieler }));
        this.rennen.bei('start', () => A.countdown(0));
        this.rennen.bei('runde', (t) => { if (t.istSpieler && t.runde < this.rennen.runden) A.runde(); });
        this.rennen.bei('ziel', (t) => { if (t.istSpieler) A.ziel(t.zielPlatz); });
      }
      this.zustand = 'rennen';
      this.uhr.rest = 0;
      this.qualitaet.stufe = 0; this.qualitaet.unten = this.qualitaet.oben = 0; this.qualitaet.fpsGlatt = 60;
      this._hudZeit = -1e9;
      this.groesse();
    }

    /** Alle Spieler im Ziel: Ergebnis einfrieren (KI-Platzierungen ändern sich danach nicht mehr). */
    rennenFertig() {
      const r = this.rennen;
      this.ergebnis = {
        runden: r.runden,
        zeilen: r.rangliste.map((t, i) => {
          const f = this.fahrzeuge[t.nr];
          return {
            platz: i + 1, nr: t.nr, name: t.name, istSpieler: t.istSpieler, spielerNr: f.spielerNr, auto: f.auto,
            zeit: t.imZiel ? t.zielZeit : null, beste: t.bestzeit, runden: t.runde,
          };
        }),
      };
      this.zustand = 'ergebnis';
      this.ergebnisAnzeige.zeigen(this.ergebnis);
    }

    /** Test-Hook: Spieler wird vom Computerfahrer gesteuert (Autopilot an/aus). */
    autopilot(spielerIndex, an) {
      const f = this.fahrzeuge.find(x => x.istSpieler && x.spielerNr === spielerIndex);
      if (!f || !this.strecke) return false;
      if (an === false) { f.autopilot = null; return true; }
      f.autopilot = new R.Driver(f.vehicle, this.strecke, {
        schwierigkeit: 'mittel', seed: 7000 + spielerIndex, name: 'Autopilot ' + (spielerIndex + 1),
      });
      return true;
    }

    /**
     * Strecke aus dem Katalog aufbauen: Grafik, Deko, Thema (Himmel/Nebel),
     * Fahrzeuge auf die Startplätze, Rennleitung.
     * optionen: { spieler (1|2), autoIds, gegner, runden, schwierigkeit, fahrhilfe[] }
     */
    streckeAufbauen(trackId, optionen) {
      const opt = Object.assign({
        gegner: 3, runden: R.config.rennen.rundenStandard, spieler: 1, autoIds: ['troc-cabrio', 'multivan'],
        fahrhilfe: [R.config.fahrhilfeStandard, R.config.fahrhilfeStandard],
      }, optionen);
      const strecke = this.streckeSzeneBauen(trackId);
      // Namen: Spieler = gewählte Fahrer, Computer = nicht gewählte Fahrer (Schumacher, Senna, ...)
      const spielerNamen = (opt.fahrer || R.config.fahrerStandard).slice(0, opt.spieler);
      const computerNamen = R.fahrerComputerNamen(spielerNamen, opt.gegner);

      // Fahrzeuge: Spieler zuerst (Startplatz 1, 2), danach die Computerautos.
      // Computer bekommen die Autos, die kein Spieler fährt.
      const katalog = R.carCatalog;
      const spielerIds = opt.autoIds.slice(0, opt.spieler);
      const plaetze = strecke.startpositionen(opt.spieler + opt.gegner);
      const frei = katalog.filter(a => !spielerIds.includes(a.id));
      const teilnehmer = plaetze.map((p, i) => {
        const istSpieler = i < opt.spieler;
        const auto = istSpieler
          ? (katalog.find(a => a.id === spielerIds[i]) || katalog[0])
          : (frei.length ? frei[(i - opt.spieler) % frei.length] : katalog[0]);
        const f = this.fahrzeugHinzufuegen(auto, p.x, p.z, p.heading);
        f.vehicle.y = strecke.hoeheAn(p.x, p.z);
        this._vorherAngleichen(f);
        f.istSpieler = istSpieler;
        f.spielerNr = istSpieler ? i : -1;   // Tastenbelegung: 0 = Pfeile, 1 = WASD
        f.fahrhilfe = (opt.fahrhilfe || [])[i] || R.config.fahrhilfeStandard;
        f.index = -1;                // Suchhilfe für naechster()
        f.stehZeit = 0;              // wie lange schon festgefahren (s)
        f.resetHinweis = false;
        f.falschHerum = false; f.falschZeit = 0;
        if (!istSpieler) f.driver = new R.Driver(f.vehicle, strecke, {
          schwierigkeit: opt.schwierigkeit || R.config.schwierigkeitStandard, seed: 1000 + i * 17, name: computerNamen[i - opt.spieler],
        });
        return { vehicle: f.vehicle, name: istSpieler ? spielerNamen[i] : computerNamen[i - opt.spieler], istSpieler };
      });
      this.fahrhilfeStufe = opt.fahrhilfe[0] || this.fahrhilfeStufe;
      this.rennen = new R.RaceManager(strecke, teilnehmer, { runden: opt.runden });
      return strecke;
    }

    /** Fahrzeug aus einem Katalog-Eintrag anlegen (Physik + 3D-Modell). */
    fahrzeugHinzufuegen(auto, x, z, heading) {
      const vehicle = new R.Vehicle(auto.fahrwerte);
      vehicle.setzen(x, z, heading);
      const mesh = R.carBuilder.bauen(auto);
      this.szene.add(mesh);
      const eintrag = { vehicle, mesh, auto, radwinkel: 0 };
      // Zustand vor dem letzten Physikschritt + interpolierte Darstellung (Mesh und Kamera nutzen sie).
      // Ohne Interpolation springt ein Auto bei 0 oder 2 Physikschritten pro Frame sichtbar ("Ruckeln").
      eintrag.vorher = { x: x, y: 0, z: z, heading, nicken: 0, neigung: 0 };
      const rz = { x: 0, z: -1 };
      eintrag.anzeige = { x: x, y: 0, z: z, heading, nicken: 0, neigung: 0,
        richtung() { rz.x = -Math.sin(this.heading); rz.z = -Math.cos(this.heading); return rz; } };
      this.fahrzeuge.push(eintrag);
      return eintrag;
    }

    kameraHinzufuegen(fahrzeug) {
      const k = new R.FahrzeugKamera(window.innerWidth / window.innerHeight);
      k.folge(fahrzeug.vehicle, fahrzeug.anzeige);
      k.sichtweiteSetzen(this.qualitaet.sicht * Math.pow(R.config.grafik.nebelJeStufe, this.qualitaet.stufe) + 20);
      this.kameras.push(k);
      return k;
    }

    start() {
      this.laeuft = true;
      this.uhr.letzte = performance.now();
      requestAnimationFrame(this._frameCb);
    }

    frame(jetzt) {
      if (!this.laeuft) return;
      const p = R.config.physik, m = this._mess, t0 = performance.now();
      let dt = (jetzt - this.uhr.letzte) / 1000;
      this.uhr.letzte = jetzt;
      if (dt > 0.25) dt = 0.25;              // Tab war im Hintergrund
      const aktiv = this.zustand !== 'menue' && !this.pausiert;
      if (aktiv) this.uhr.rest += dt; else this.uhr.rest = 0;
      let schritte = 0;
      while (this.uhr.rest >= p.schritt && schritte < p.maxSchritteProFrame) {
        this.physikSchritt(p.schritt);
        this.uhr.rest -= p.schritt;
        schritte++;
      }
      // Zu langsam (> maxSchritte·16,7 ms): Rest verwerfen statt nachzuholen → keine Spirale
      if (schritte === p.maxSchritteProFrame && this.uhr.rest >= p.schritt) this.uhr.rest = 0;
      this.input.frameEnde();
      const t1 = performance.now();

      // Grafik an Physik angleichen: zwischen vorletztem und letztem Physikzustand interpolieren
      const alpha = aktiv ? Math.min(1, this.uhr.rest / p.schritt) : 1;
      for (let i = 0; i < this.fahrzeuge.length; i++) {
        const f = this.fahrzeuge[i], v = f.vehicle, a = f.vorher, d = f.anzeige, mesh = f.mesh;
        d.x = a.x + (v.x - a.x) * alpha; d.y = a.y + (v.y - a.y) * alpha; d.z = a.z + (v.z - a.z) * alpha;
        d.heading = a.heading + R.Vehicle.winkelDiff(v.heading, a.heading) * alpha;
        d.nicken = a.nicken + (v.nicken - a.nicken) * alpha; d.neigung = a.neigung + (v.neigung - a.neigung) * alpha;
        mesh.position.set(d.x, d.y, d.z);
        // YXZ: erst Heading (Hochachse), dann Nicken (Querachse), dann Wanken (Längsachse) – alles lokal
        mesh.rotation.set(d.nicken, d.heading, d.neigung, 'YXZ');
        // Räder rollen und lenken, Bremslicht
        f.radwinkel -= v.vLaengs * dt / 0.34;   // Rolldrehung (Radradius ≈ 0,34 m)
        R.carBuilder.dreheRaeder(mesh, f.radwinkel);
        R.carBuilder.lenkeRaeder(mesh, -v.lenkung * 0.5);
        R.carBuilder.setzeBremslicht(mesh, !!f.bremst);
      }
      if (this.zustand === 'menue') this.menueKameraFlug(dt);
      else if (!this.pausiert) for (let i = 0; i < this.kameras.length; i++) this.kameras[i].update(dt);
      const t2 = performance.now();
      if (R.Audio) this.tonAktualisieren(dt);
      const t3 = performance.now();
      this.zeichnen();
      const t4 = performance.now();

      // FPS
      this.uhr.frames++; this.uhr.fpsZeit += dt;
      if (this.uhr.fpsZeit >= 1) { this.uhr.fps = this.uhr.frames; this.uhr.frames = 0; this.uhr.fpsZeit = 0; }
      // HUD + Minimap höchstens hudHz (Standard 20) mal je Sekunde
      if (jetzt - this._hudZeit >= 1000 / R.config.grafik.hudHz - 1) { this._hudZeit = jetzt; this.hudAktualisieren(); }
      const t5 = performance.now();
      this._qualitaetAnpassen(dt);

      // Messwerte in den Ringpuffer
      const k = m.i;
      m.physik[k] = t1 - t0; m.grafik[k] = t2 - t1; m.audio[k] = t3 - t2; m.render[k] = t4 - t3; m.hud[k] = t5 - t4;
      m.gesamt[k] = t5 - t0; m.dt[k] = dt; m.schritte[k] = schritte;
      m.i = (k + 1) % 60; if (m.n < 60) m.n++;
      requestAnimationFrame(this._frameCb);
    }

    /**
     * Mittelwerte der letzten 60 Frames (für Tests und das Overlay mit Taste H).
     * ms je Block: physik, audio, hud (inkl. Minimap), grafik (Autos/Kameras), render (nur CPU-Seite!).
     */
    leistung() {
      const m = this._mess, n = Math.max(1, m.n), mittel = (a) => { let x = 0; for (let i = 0; i < m.n; i++) x += a[i]; return x / n; };
      const r = this.renderer, info = r.info.render, st = R.config.grafik.qualitaetsStufen;
      const dt = mittel(m.dt);
      return {
        frames: m.n, fps: dt > 0 ? 1 / dt : 0,
        ms: { physik: mittel(m.physik), audio: mittel(m.audio), hud: mittel(m.hud), grafik: mittel(m.grafik),
          render: mittel(m.render), gesamt: mittel(m.gesamt) },
        jsMs: mittel(m.physik) + mittel(m.audio) + mittel(m.hud),
        schritteJeFrame: mittel(m.schritte),
        drawCalls: info.calls, dreiecke: info.triangles,
        pixelRatio: r.getPixelRatio(), aufloesung: this.canvas.width + '×' + this.canvas.height,
        qualitaet: { stufe: this.qualitaet.stufe, pixelRatioStufe: st[Math.min(st.length - 1, this._startStufe() + this.qualitaet.stufe)],
          sichtweite: this.szene.fog ? Math.round(this.szene.fog.far) : null, wechsel: this.qualitaet.wechsel, adaptiv: !!R.config.grafik.adaptiv },
      };
    }

    /** Menü-Hintergrund: Kamera fliegt langsam über der Strecke entlang. */
    menueKameraFlug(dt) {
      const st = this.strecke; if (!st) return;
      this.menueS = (this.menueS + dt * R.config.ui.menueKameraTempo) % st.spline.laenge;
      const sp = st.spline, p = sp.punktBei(this.menueS), q = sp.punktBei(this.menueS + 70);
      const seite = Math.sin(this.menueS / 90) * 16;     // schwenkt langsam über die Straße
      const x = p.x + p.nx * seite, z = p.z + p.nz * seite;
      this.menueKamera.position.set(x, st.hoeheAn(p.x, p.z) + 13 + Math.sin(this.menueS / 55) * 4, z);
      this.menueKamera.lookAt(q.x, st.hoeheAn(q.x, q.z) + 1.5, q.z);
    }

    /** Motorgeräusche, Countdown-Pieptöne, Bremsquietschen, Bande – jeden Frame. */
    tonAktualisieren(dt) {
      const A = R.Audio, r = this.rennen, d = this._tonD || (this._tonD = {});
      const stumm = this.zustand !== 'rennen' || this.pausiert;
      if (stumm !== this._tonStumm) { this._tonStumm = stumm; A.motorStumm(stumm); }
      if (!r || stumm) return;
      const z = r.countdownZahl;
      if (z !== this._tonCd) { this._tonCd = z; if (z > 0) A.countdown(z); }
      let bremst = false;
      const fz = this.fahrzeuge;   // Schleifen ohne Closures: läuft jeden Frame
      for (let i = 0; i < fz.length; i++) {
        const f = fz[i], v = f.vehicle; let ab = 0;
        if (!f.istSpieler) {
          // Abstand zum nächsten Spieler; KI > hoerweite (60 m) ist stumm, motorUpdate kehrt dann sofort zurück
          ab = 1e9;
          for (let j = 0; j < fz.length; j++) {
            const g = fz[j];
            if (g.istSpieler) { const dx = g.vehicle.x - v.x, dz = g.vehicle.z - v.z, a = Math.sqrt(dx * dx + dz * dz); if (a < ab) ab = a; }
          }
        } else {
          if (f.bremst && v.tempoKmh > 60) bremst = true;
          if (v._anBande && v.tempo > 2) A.bande(Math.min(1, v.tempo / 25));
        }
        d.tempo = v.tempo; d.vMax = v.daten.vMax; d.gas = v.letzteSteuerung ? v.letzteSteuerung.gas : 0;
        d.untergrund = v.untergrund; d.abstand = ab; d.dt = dt;
        A.motorUpdate(i, d);
      }
      A.bremsen(bremst);
    }

    /** Nur für Tests: Spielzeit ohne Zeichnen vorspulen (Sekunden). */
    schnellvorlauf(sekunden) {
      const dt = R.config.physik.schritt;
      for (let t = 0; t < sekunden; t += dt) this.physikSchritt(dt);
    }

    physikSchritt(dt) {
      const strecke = this.strecke, rennen = this.rennen;
      const countdown = !!rennen && !rennen.gasErlaubt;
      // Fortschritt der Spieler für das Gummiband der KI
      const tn = rennen ? rennen.teilnehmer : [];
      let spielerMax = null;
      for (let i = 0; i < tn.length; i++) if (tn[i].istSpieler && (spielerMax === null || tn[i].fortschritt > spielerMax)) spielerMax = tn[i].fortschritt;
      const umgebung = this._umgebung || (this._umgebung = {});   // wiederverwendet (KI liest nur)
      // Zustand vor diesem Schritt merken (für die Interpolation beim Zeichnen)
      for (let i = 0; i < this.fahrzeuge.length; i++) {
        const v = this.fahrzeuge[i].vehicle, a = this.fahrzeuge[i].vorher;
        if (!a) continue;
        a.x = v.x; a.y = v.y; a.z = v.z; a.heading = v.heading; a.nicken = v.nicken; a.neigung = v.neigung;
      }

      this.fahrzeuge.forEach((f, i) => {
        const v = f.vehicle;
        let s = { gas: 0, bremse: 0, lenkung: 0 };
        const fahrer = f.driver || f.autopilot;       // Computerfahrer (KI oder Autopilot)
        if (f.istSpieler && tn[i] && tn[i].imZiel) s = { gas: 0, bremse: 0.6, lenkung: 0 };   // im Ziel: ausrollen
        else if (f.istSpieler && f.spielerNr >= 0 && !f.autopilot) s = this.input.steuerung(f.spielerNr);
        else if (fahrer && rennen) {
          const t = tn[i];
          // andere = alle Teilnehmer (die KI überspringt ihr eigenes Fahrzeug selbst)
          umgebung.andere = tn; umgebung.spielerFortschrittMax = spielerMax;
          umgebung.eigenerFortschritt = t.fortschritt; umgebung.laeuft = rennen.gasErlaubt;
          s = fahrer.steuerung(dt, umgebung);
          if (fahrer.brauchtReset) { this.zuruecksetzen(i); fahrer.zurueckgesetzt(); return; }
        }
        if (countdown) s = { gas: 0, bremse: s.bremse, lenkung: s.lenkung };
        let hilfe;
        if (strecke) {
          const n = strecke.abfrage(v.x, v.z, f.index);
          f.index = n.index;
          v.untergrund = n.untergrund;
          f.nah = n;
          const hilfeStufe = R.config.fahrhilfen[f.fahrhilfe] || R.config.fahrhilfen.aus;
          if (f.istSpieler && !f.autopilot && (hilfeStufe.lenkhilfe > 0 || hilfeStufe.bremshilfe > 0)) {
            const p = strecke.spline.punktBei(n.s);
            hilfe = {
              lenkhilfe: hilfeStufe.lenkhilfe, bremshilfe: hilfeStufe.bremshilfe,
              tangente: { tx: p.tx, tz: p.tz }, seitenabstand: n.seitenabstand,
              // etwas vorausschauen (≈ 0,4 s), damit die Hilfe vor der Kurve greift
              zieltempo: strecke.tempoBei(n.s + Math.max(0, v.vLaengs) * 0.4),
            };
          }
        }
        v.schritt(dt, s, hilfe);
        f.bremst = v.letzteSteuerung.bremse > 0 && v.vLaengs > 0.5;
      });

      // Kollisionen nach allen Fahrzeug-Schritten
      if (strecke) this.fahrzeuge.forEach(f => R.Kollisionen.bande(f.vehicle, strecke));
      this.stoesse = R.Kollisionen.autoAuto(this.fahrzeuge, { countdown });
      if (R.Audio) this.stoesse.forEach((st) => {
        if (st.staerke >= 1.5 && (this.fahrzeuge[st.a].istSpieler || this.fahrzeuge[st.b].istSpieler)) R.Audio.kollision(st.staerke);
      });
      this.stoesse.forEach((st) => {
        if (st.staerke < 3) return;
        this.kameras.forEach((k) => {
          if (k.ziel === this.fahrzeuge[st.a].vehicle || k.ziel === this.fahrzeuge[st.b].vehicle) k.wackeln(st.staerke);
        });
      });

      this.fahrzeuge.forEach((f) => {
        const v = f.vehicle;
        if (strecke) v.y = strecke.hoeheAn(v.x, v.z);
        this._feststeckenPruefen(f, dt, countdown);
      });
      if (rennen) rennen.schritt(dt);
    }

    /**
     * Steckt ein Auto fest? (> 4 s fast Stillstand und abseits der Straße oder falsch herum)
     * Setzt f.resetHinweis – für Spieler als Hinweis im HUD, für die KI später Auto-Reset.
     */
    _feststeckenPruefen(f, dt, countdown) {
      const v = f.vehicle, n = f.nah, st = this.strecke;
      if (!st || !n || countdown) { f.stehZeit = 0; f.resetHinweis = false; f.falschHerum = false; f.falschZeit = 0; return; }
      const p = st.spline.punkte[n.index];
      const winkel = Math.abs(R.Vehicle.winkelDiff(R.headingAus(p.tx, p.tz), v.heading));
      const abseits = n.abstand > st.breite / 2 + st.randBreite;
      const falschHerum = winkel > Math.PI * 2 / 3;   // > 120°
      if (v.tempo < 1 && (abseits || falschHerum)) f.stehZeit += dt; else f.stehZeit = 0;
      f.resetHinweis = f.stehZeit > 4;
      // "Falsch herum!": > 120° zur Fahrtrichtung der Strecke, kurz entprellt (0,6 s)
      if (falschHerum) f.falschZeit += dt; else f.falschZeit = 0;
      f.falschHerum = f.falschZeit > 0.6;
    }

    /** Nach einem Sprung (Reset/Teleport): nicht zwischen alter und neuer Stelle interpolieren. */
    _vorherAngleichen(f) {
      const v = f.vehicle, a = f.vorher;
      if (!a) return;
      a.x = v.x; a.y = v.y; a.z = v.z; a.heading = v.heading; a.nicken = v.nicken; a.neigung = v.neigung;
    }

    /** Reset-Taste von Spieler nr (0 = R, 1 = T). */
    spielerZuruecksetzen(nr) {
      const i = this.fahrzeuge.findIndex(f => f.istSpieler && f.spielerNr === nr);
      if (i >= 0) this.zuruecksetzen(i);
    }

    /**
     * Fahrzeug i zurück auf die Strecke (letzter Checkpoint bzw. Startplatz).
     * Ist dort ein anderes Auto im Umkreis von 6 m, wird jeweils 8 m weiter
     * hinten auf der Strecke gesucht.
     */
    zuruecksetzen(i) {
      const f = this.fahrzeuge[i];
      if (!f || !this.rennen) return;
      const sp = this.strecke.spline;
      let pose = this.rennen.resetPose(i);
      const frei = (x, z) => this.fahrzeuge.every((g, j) => j === i || Math.hypot(g.vehicle.x - x, g.vehicle.z - z) >= 6);
      if (!frei(pose.x, pose.z)) {
        const n = sp.naechster(pose.x, pose.z);
        for (let k = 1; k <= 12; k++) {
          const p = sp.punktBei(n.s - 8 * k);
          const x = p.x + p.nx * n.seitenabstand, z = p.z + p.nz * n.seitenabstand;
          if (frei(x, z) || k === 12) { pose = { x, z, heading: R.headingAus(p.tx, p.tz) }; break; }
        }
        this.rennen.verfolgungSetzen(i, pose.x, pose.z);
      }
      f.vehicle.setzen(pose.x, pose.z, pose.heading);
      f.vehicle.y = this.strecke.hoeheAn(pose.x, pose.z);
      this._vorherAngleichen(f);
      f.index = -1;
      f.stehZeit = 0; f.resetHinweis = false; f.falschHerum = false; f.falschZeit = 0;
    }

    zeichnen() {
      const r = this.renderer, w = window.innerWidth, h = window.innerHeight;
      r.info.reset();
      // Weltmatrizen einmal je Frame (nicht je Ansicht); statische Teile haben matrixAutoUpdate = false
      this.szene.matrixWorldAutoUpdate = false;
      this.szene.updateMatrixWorld();
      const ks = this.zustand === 'menue' ? [] : this.kameras;
      if (ks.length < 2) {
        r.setScissorTest(false);
        r.setViewport(0, 0, w, h);
        r.render(this.szene, ks.length ? ks[0].kamera : this.menueKamera);
        return;
      }
      // Split-Screen: eine Szene, zwei Kameras, je eine Bildhälfte (links Spieler 1, rechts Spieler 2)
      const links = Math.floor(w / 2);
      r.setScissorTest(true);
      ks.forEach((k, i) => {
        const x = i === 0 ? 0 : links, breite = i === 0 ? links : w - links;
        r.setViewport(x, 0, breite, h);
        r.setScissor(x, 0, breite, h);
        r.render(this.szene, k.kamera);
      });
      r.setScissorTest(false);
    }

    hudAktualisieren() {
      this.huds.forEach(hd => hd.update());
      const el = this.debugEl;
      if (!el || !el.classList.contains('an')) return;
      // Leistungs-Overlay (Taste H): fps, ms je Block, Draw-Calls, Dreiecke, pixelRatio, Auflösung, Qualitätsstufe
      const L = this.leistung(), ms = L.ms, z = (x) => x.toFixed(2);
      let text = `${Math.round(L.fps)} fps | ${z(ms.gesamt)} ms/Frame: physik ${z(ms.physik)} · audio ${z(ms.audio)} · ` +
        `hud ${z(ms.hud)} · grafik ${z(ms.grafik)} · render ${z(ms.render)}` +
        `\nDraw-Calls ${L.drawCalls} | Dreiecke ${Math.round(L.dreiecke / 1000)}k | pixelRatio ${L.pixelRatio} | ${L.aufloesung}` +
        ` | Qualität ${L.qualitaet.stufe === 0 ? 'voll' : '−' + L.qualitaet.stufe}${L.qualitaet.adaptiv ? ' (adaptiv)' : ''}` +
        ` | Sicht ${L.qualitaet.sichtweite} m | Zustand: ${this.zustand}`;
      if (this.fahrzeuge[0]) {
        const v = this.fahrzeuge[0].vehicle;
        text += `\n${v.tempoKmh} km/h | Kamera: ${this.kameras[0] ? this.kameras[0].modus : '–'}` +
          ` | Fahrhilfe: ${(R.config.fahrhilfen[this.fahrzeuge[0].fahrhilfe] || {}).name}`;
        const r = this.rennen;
        if (r) {
          const t = r.teilnehmer[0];
          const runde = Math.min(r.runden, t.runde + 1);
          text += `\nRunde ${runde}/${r.runden} | Platz ${t.platz}/${r.teilnehmer.length}` +
            ` | Checkpoint ${t.naechsterCheckpoint}/${this.strecke.checkpoints.length}` +
            ` | Zeit ${R.zeitText(r.rundenzeit(t))}` + (t.bestzeit !== null ? ` | Beste ${R.zeitText(t.bestzeit)}` : '') +
            ` | ${v.untergrund} | ${r.zustand}`;
        }
      }
      if (el._text !== text) { el._text = text; el.textContent = text; }
    }
  }

  R.Spiel = Spiel;

  // --- Start ---
  window.addEventListener('DOMContentLoaded', () => {
    const spiel = new Spiel(document.getElementById('spiel'));
    R.spiel = spiel;   // für Tests/Debug erreichbar
    spiel.groesse();
    spiel.menue.zeigen(0);
    spiel.start();
  });
})();
