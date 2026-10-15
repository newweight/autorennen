// ============================================================
// Hauptprogramm: Renderer, Szene, Spielschleife mit festem Physikschritt
// Abschnitt 3: Strecke "Wiese" mit Deko, Startaufstellung, Rennleitung
// (Countdown, Runden, Checkpoints). Gegner stehen noch still (KI folgt).
// Abschnitt 4: Bande + Auto-Auto-Kollisionen, Fahrhilfen, Kamerawackeln,
// Reset auf freie Stelle (R / T), Hinweis "R drücken" wenn ein Auto feststeckt.
// Runde 4: Sprungschanzen (f.flug, track/schanze.js), Turbo-Felder + Schutzschild (this.pickups, world/pickups.js),
// Schaden-System (this.schaden, physics/schaden.js; Einstellung schaden, Standard aus), Wracks/Strohballen.
// Alles nur aktiv, wenn Welt/Einstellung es einschaltet – Klassisch + Standard-Einstellungen = Verhalten wie Runde 3.
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
      // Runde 4: Welt je Strecke ('' = Standard der Strecke), Jahreszeit/Wetter/Wind, Schaden (Standard = wie bisher)
      welt: '', variante: '', jahreszeit: 'sommer', wetter: 'klar', windStaerke: 0, windRichtung: 'zufall', schaden: false,
      // Runde 5: Tempo-Klasse 'normal' (≈ 155–190 km/h) | 'schnell' (Katalog 220–270 km/h), Spieler und KI gleich
      tempoKlasse: c.tempoKlasseStandard || 'normal',
      // Runde 5b: Polizei (Streifenwagen hält an, world/polizei.js), Standard aus
      polizei: !!(c.polizei && c.polizei.standardAn),
      // 15.10. (v25): Verkehr – Geisterfahrer (3 je Runde, fahren entgegen) und Krankenwagen/Abschleppwagen (world/verkehr.js), Standard aus
      geisterfahrer: !!(c.verkehr && c.verkehr.geisterfahrerStandardAn),
      verkehr: (c.verkehr && c.verkehr.stufen && c.verkehr.stufen[c.verkehr.verkehrStandard]) ? c.verkehr.verkehrStandard : 'aus',
      // Runde 6 (W1-A4): Rempeln 'sanft' (nur Abstoßung, wie bisher) | 'echt' (Drehen, Abdrängen), Standard sanft
      rempeln: (c.kollision && c.kollision.rempeln && c.kollision.rempeln.standard) === 'echt' ? 'echt' : 'sanft',
      // Runde 6 (W2-D): Tageszeit 'tag' (Standard, Licht wie bisher) | 'daemmerung' | 'nacht'
      tageszeit: c.tageszeit && c.tageszeit[c.tageszeitStandard] ? c.tageszeitStandard : 'tag',
      // W5 Stufe 2: Online-Raum mit Rempeln (Auto↔Auto) statt Geister – nur die zuletzt gewählte Host-Einstellung, Standard Geister
      kollisionen: false,
      // 12.10. Hindernis-Menge: 'normal' (Standard = wie bisher) | 'viele' (≈ ×3, mind. 1 je 150 m) | 'sehrViele' (≈ ×5, mind. 1 je 80 m); wirkt nur in Welten mit Hindernissen
      hindernisMenge: (c.hindernisMenge && c.hindernisMenge.standard) || 'normal',
      // Runde 6 (W3-F): Spielart 'rennen' (Einzelrennen, wie bisher) | 'pokal' (D1) | 'elimination' (D7); Pokal-Größe 3/4/5
      spielart: 'rennen', pokalGroesse: (c.pokal && c.pokal.groesseStandard) || 3,
      // Runde 6 (W3-G): Garage-Upgrades im Rennen anwenden (aus = Faktoren 1, Lackfarben bleiben)
      upgradesZaehlen: true,
    };
  }

  /** Beliebiges Objekt in gültige Einstellungen verwandeln (fehlende/ungültige Werte → Standard). */
  function einstellungenPruefen(roh) {
    const std = standardEinstellungen(), c = R.config, r = roh || {};
    const zahl = (v, lo, hi, d) => (Number.isFinite(+v) && v !== null && v !== '' ? Math.max(lo, Math.min(hi, Math.round(+v))) : d);
    const autoOk = (id, d) => (R.carCatalog.waehlbare().find(a => a.id === id) ? id : d);
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
      welt: typeof r.welt === 'string' ? r.welt : '',          // gültig für die Strecke? → streckeSzeneBauen prüft
      variante: typeof r.variante === 'string' ? r.variante : '',   // Runde 6: Streckenvariante ('' = Normal, z. B. 'xl')
      jahreszeit: (c.jahreszeiten && c.jahreszeiten[r.jahreszeit]) || r.jahreszeit === 'zufall' ? r.jahreszeit : 'sommer',
      wetter: (c.wetter && c.wetter[r.wetter]) || r.wetter === 'zufall' ? r.wetter : 'klar',
      windStaerke: r.windStaerke === 'zufall' ? 'zufall' : zahl(r.windStaerke, 0, 5, 0),
      windRichtung: Number.isFinite(+r.windRichtung) && r.windRichtung !== '' && r.windRichtung !== null ? +r.windRichtung : 'zufall',
      schaden: r.schaden === true,
      tempoKlasse: c.tempoKlassen && c.tempoKlassen[r.tempoKlasse] ? r.tempoKlasse : std.tempoKlasse,
      polizei: typeof r.polizei === 'boolean' ? r.polizei : std.polizei,
      geisterfahrer: typeof r.geisterfahrer === 'boolean' ? r.geisterfahrer : std.geisterfahrer,
      verkehr: c.verkehr && c.verkehr.stufen && c.verkehr.stufen[r.verkehr] ? r.verkehr : std.verkehr,
      rempeln: r.rempeln === 'echt' || r.rempeln === 'sanft' ? r.rempeln : std.rempeln,
      tageszeit: c.tageszeit && c.tageszeit[r.tageszeit] ? r.tageszeit : std.tageszeit,
      kollisionen: r.kollisionen === true,                // W5 Stufe 2 (nur online genutzt)
      hindernisMenge: c.hindernisMenge && c.hindernisMenge.stufen && typeof r.hindernisMenge === 'string' && Object.prototype.hasOwnProperty.call(c.hindernisMenge.stufen, r.hindernisMenge)
        ? r.hindernisMenge : std.hindernisMenge,          // 12.10.
      spielart: r.spielart === 'pokal' || r.spielart === 'elimination' ? r.spielart : 'rennen',     // W3-F
      pokalGroesse: ((c.pokal && c.pokal.groessen) || [3, 4, 5]).includes(+r.pokalGroesse) ? +r.pokalGroesse : std.pokalGroesse,
      upgradesZaehlen: r.upgradesZaehlen !== false,      // W3-G
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
      this.zustand = 'menue';  // 'menue' | 'rennen' | 'ergebnis' | 'pokal' (W3-F: Zwischenstand/Siegerehrung) | 'online' (W5)  (Pause = this.pausiert im Zustand 'rennen')
      this.online = null;      // W5: laufendes Online-Rennen (R.Online.Bildschirm) – nur im Zustand 'online'
      this.pokal = null;       // Runde 6 (W3-F): laufende Pokal-Serie (R.Pokal.Serie) oder null
      this.puffs = [];         // Runde 6 (W3-F): „Puff"-Wolken ausgeschiedener Autos
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
      this.pokalAnzeige = R.PokalAnzeige ? new R.PokalAnzeige(this, this.ui) : null;   // Runde 6 (W3-F)

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
      if (this.zustand === 'online') { if (this.online) this.online.rennTaste(code, wiederholt); return; }   // W5: Online-Rennen (src/net/online.js)
      if (wiederholt) return;
      if (this.pokalAnzeige && this.pokalAnzeige.offen()) { this.pokalAnzeige.taste(code); return; }   // W3-F: Rückfrage/Zwischenstand
      if (this.zustand === 'ergebnis') { this.ergebnisAnzeige.taste(code); return; }
      if (this.zustand !== 'rennen') return;
      if (this.pausiert) { this.pauseAnzeige.taste(code); return; }
      if (code === T.pause) this.pauseSetzen(true);
      else if (code === T.kamera) this.kameras.forEach(k => k.naechsterModus());
      else if (code === T.resetSpieler1) this.spielerZuruecksetzen(0);
      else if (code === T.resetSpieler2) this.spielerZuruecksetzen(1);
      else if (code === T.item1) this.itemEinsetzen(0);      // Runde 6 (W3-H): Item (Ölfalle) einsetzen
      else if (code === T.item2) this.itemEinsetzen(1);
    }

    /** Runde 6 (W3-H): Item des Spielers nr einsetzen (Öl 8 m hinter das Auto legen). */
    itemEinsetzen(nr) {
      if (this.zustand === 'online') { if (this.online) this.online.item(); return; }   // W5: online setzt der Server das Item ein
      const i = this.fahrzeuge.findIndex(f => f.istSpieler && f.spielerNr === nr);
      if (i < 0 || !this.pickups || !this.rennen || !this.rennen.gasErlaubt) return;
      if (this.pickups.oelLegen(i)) { this._meldung(i, 'Öl gelegt! 🛢️', 1000); this.pickups.ton('oelLegen'); }
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
      if (this.szene.fog) { this.szene.fog.near = sicht * (this.wetter && this.wetter.nebelNahAnteil ? this.wetter.nebelNahAnteil : 0.55); this.szene.fog.far = sicht; }
      this.kameras.forEach(k => k.sichtweiteSetzen(sicht + 20));
    }

    /**
     * Adaptive Qualität: fps (geglättet) länger als adaptivSekunden unter fpsUnten → Stufe runter,
     * länger über fpsOben → Stufe hoch (Hysterese durch die Lücke 45…58 und die Wartezeit).
     */
    _qualitaetAnpassen(dt) {
      const g = R.config.grafik, q = this.qualitaet;
      if (!g.adaptiv || (this.zustand !== 'rennen' && this.zustand !== 'online') || this.pausiert || !(dt > 0) || dt > 0.25) { q.unten = q.oben = 0; return; }
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
      // Runde 4: Teile an den Auto-Meshes (Schild-Hülle, Turbo-Flammen, Rauch) zuerst lösen – die Meshes sind Katalog-Caches
      if (this.pickups) { this.pickups.zerstoeren(); this.pickups = null; }
      if (this.muenzen) { this.muenzen.zerstoeren(); this.muenzen = null; }     // Runde 6 (W3-G)
      if (this.abschlepp) { this.abschlepp.zerstoeren(); this.abschlepp = null; }     // 14.10. (v18): Auto-Meshes wieder freigeben (Katalog-Caches)
      if (this.werkstatt) { this.werkstatt.zerstoeren(); this.werkstatt = null; }
      if (this.schaden) { this.schaden.zerstoeren(); this.schaden = null; }
      if (this.polizei) { this.polizei.zerstoeren(); this.polizei = null; }   // Runde 5b: Blaulicht-Lichter, Sirene
      if (this.verkehr) { this.verkehr.zerstoeren(); this.verkehr = null; }    // 15.10. (v25)
      this.huds.forEach(h => h.zerstoeren());
      this.huds = [];
      const autoMeshes = new Set(this.fahrzeuge.map(f => f.mesh));
      const freigeben = (m) => { if (m.map) m.map.dispose(); m.dispose(); };
      this.szene.children.slice().forEach((o) => {
        if (o.isLight && !o.userData.tunnelLicht) return;     // Sonne/Himmel bleiben, Tunnel-Lichter gehören zur Strecke
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
      this.puffs = [];        // W3-F (Gruppen hat die Schleife oben schon entfernt)
      this.tunnelLichter = null;
      this.dynamik = null;
      this._himmelBasis = null; if (R.themes) R.themes.vulkanGlut = 0;   // Runde 6 (W2-C)
      if (this.wetter) { this.wetter.zerstoeren(); this.wetter = null; }
      this.rennen = null; this.strecke = null; this.ergebnis = null;
      this.stoesse = [];
      if (R.Audio) { R.Audio.motorAlleEntfernen(); R.Audio.bremsen(false); }
      if (R.Publikum) R.Publikum.stop();   // 15.10. (v25)
    }

    /** Nur die Strecke samt Deko und Himmel aufbauen (Menühintergrund und Rennen). */
    streckeSzeneBauen(trackId) {
      const daten = R.trackCatalog.find(t => t.id === trackId) || R.trackCatalog[0];
      // Runde 4: Welt (Schichten) je Strecke – ungültige/leere Welt → Standard der Strecke
      const e = this.einstellungen || {};
      const welt = R.Strecke.weltName ? R.Strecke.weltName(daten, e.welt) : (daten.weltStandard || undefined);
      const variante = e.variante && daten.varianten && daten.varianten[e.variante] ? e.variante : '';   // Runde 6: ungültig → Normal
      const strecke = new R.Strecke(daten, { welt, variante, hindernisMenge: e.hindernisMenge });
      this.strecke = strecke;
      strecke.tempoKlasse = e.tempoKlasse || this.tempoKlasse;   // 14.10. (v20): Kurvenschilder (world/schilder.js) beschriften je Tempo-Klasse
      // Runde 4: Wetter/Jahreszeit/Wind (Standard Sommer/klar/0 = wie bisher)
      this.wetter = null;
      if (R.Wetter) {
        // v22: online kommt der Seed vom Server (Megastrecke: gleiche Zonen bei allen); offline wie bisher zufällig
        this._wetterSeed = e.wetterSeed !== undefined ? (e.wetterSeed >>> 0) : Math.floor(Math.random() * 1e9);
        this.wetter = new R.Wetter(this.szene, {
          jahreszeit: e.jahreszeit || 'sommer', wetter: e.wetter || 'klar',
          wind: { staerke: e.windStaerke === undefined ? 0 : e.windStaerke, richtung: e.windRichtung === undefined ? 'zufall' : e.windRichtung },
          thema: daten.thema, seed: this._wetterSeed, strecke, tageszeit: e.tageszeit || 'tag',
        });
      }
      // Strecke + Deko bewegen sich nie: Instanzen in Regionen teilen (Culling je Kamera), Matrizen einfrieren
      this.szene.add(R.themes.statischVorbereiten(strecke.bauen()));
      // 15.10. (v25): Zuschauertribünen (world/tribuenen.js) – VOR der Deko eintragen (dekoSperre), eigene Gruppe mit 3 Meshes
      this.tribuenenGruppe = null;
      if (R.Tribuenen) {
        R.Tribuenen.einbauen(strecke);
        const tg = R.Tribuenen.bauen(strecke);
        if (tg) { this.szene.add(tg); this.tribuenenGruppe = tg; }
      }
      const deko = R.themes.dekoBauen(daten.thema, strecke, this.wetter ? this.wetter.jahreszeit : undefined);
      // Runde 6 (W1-A5): Bäume/Felsen/Büsche zwischen Straße und Zaun als Kollider (nur Physik)
      if (R.Kollisionen.pflanzenSammeln) R.Kollisionen.pflanzenSammeln(strecke, deko);
      this.szene.add(R.themes.statischVorbereiten(deko));
      // Hindernisse (Öl, Sand, Baustelle, Ast) – eigene Gruppe, die Pylonen ändern sich im Rennen
      this.szene.add(R.themes.statischVorbereiten(strecke.hindernisseBauen(), 1));
      // Fantasie: rollende Bälle und Wasserfontänen (bewegen sich → nicht statisch)
      // Runde 4: auch Strecken/Welten, die NUR Strohballen haben (strecke.strohballen ist nach Welt gefiltert)
      this.dynamik = null;
      const strohDa = !!(strecke.strohballen && strecke.strohballen.length) && !(strecke.aktiveSchichten && strecke.aktiveSchichten.strohballen === false);
      const dd = strecke.daten || daten;     // nach Welt gefiltert (Wiese Klassisch: keine Bälle, obwohl der Katalog welche hat)
      if (R.Dynamik && ((dd.baelle && dd.baelle.length) || (dd.wasserstrahlen && dd.wasserstrahlen.length) || strohDa ||
          (strecke.dinos && strecke.dinos.length) ||      // Runde 5b: laufende Dinos
          (R.Dynamik.braucht && R.Dynamik.braucht(strecke)))) {   // Runde 6 (W2-C): Tiere, Vulkan, Meteoriten, Flugsaurier
        this.dynamik = new R.Dynamik(strecke, { seed: 4242 });
        this._hindernisVersion = 0;                        // W2-C1
        this.szene.add(this.dynamik.bauen());
      }
      // Runde 4: Turbo-Felder + Schild-Kugeln (Welt „Verrückt"); die Feld-Grafik baut strecke.bauen() schon
      this.pickups = null;
      if (R.Pickups && ((strecke.boostFelder && strecke.boostFelder.length) || (strecke.schilde && strecke.schilde.length))) {
        this.pickups = new R.Pickups(strecke);
        this.szene.add(this.pickups.bauen());
      }
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
      // Grundhelligkeit merken: im Tunnel wird sie je Ansicht gedimmt (zeichnen)
      if (this._himmelStandard === undefined) this._himmelStandard = this.halbkugelLicht.intensity;
      this.halbkugelLicht.intensity = this._himmelStandard;
      if (this.wetter) {
        const we = this.wetter.anwenden(thema, { halbkugel: this.halbkugelLicht, sonne: this.sonne });
        if (we && we.sicht && this.qualitaet) { this.qualitaet.sicht = we.sicht; if (this.qualitaetAnwenden) this.qualitaetAnwenden(true); }
        this.wetter.partikelBauen(1);
      }
      this._lichtBasis = { himmel: this.halbkugelLicht.intensity, sonne: this.sonne.intensity };
      // Runde 6 (W2-D): Tageszeit – nachts Straßenlaternen (Themen mit laternen: true, Masten als Säulen) und
      // dauerhaft echte Scheinwerfer (dieselben Lichter wie im Tunnel, auch auf Strecken ohne Tunnel)
      const tz = this.wetter && this.wetter.tz;
      this.tageszeitDaten = tz || null;
      this.laternenLampen = null;
      if (tz && tz.laternen && thema.laternen && R.themes.laternenBauen) {
        const lb = R.themes.laternenBauen(strecke, thema, tz.laterne);
        this.szene.add(R.themes.statischVorbereiten(lb.gruppe, 1));
        this.laternenLampen = lb.lampen;
        strecke.saeulen = (strecke.saeulen || []).concat(lb.masten);
      }
      if (strecke.tunnel.length || (tz && tz.echteScheinwerfer)) this._tunnelLichterAnlegen();
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
    zumMenue(sicher) {
      // Runde 6 (W3-F): mitten im Pokal erst nachfragen (Pause → Hauptmenü)
      if (this.pokal && !this.pokal.fertig && !sicher && this.pokalAnzeige) { this.pokalAbbruchFragen(); return; }
      if (this.pokal) this.pokalBeenden(true);
      this.pausiert = false;
      this.pauseAnzeige.verstecken(); this.ergebnisAnzeige.verstecken();
      if (this.pokalAnzeige) this.pokalAnzeige.verstecken();
      this.zustand = 'menue';
      this.szeneAbbauen();
      this.ui.classList.remove('split');
      this.menue.zeigen(0);
    }

    /**
     * Neues Rennen starten. Ohne Argument: aktuelle Einstellungen (= "Nochmal").
     * Mit Argument: wird mit den bisherigen Einstellungen zusammengeführt und gespeichert.
     */
    rennenStarten(einst, opt) {
      if (einst) this.einstellungen = einstellungenPruefen(Object.assign({}, this.einstellungen, einst));
      if (opt && opt.temporaer) this.fahrhilfeStufe = this.einstellungen.fahrhilfe[0];   // W3-F: Pokal-Rennen nicht speichern
      else this.einstellungenSpeichern();
      const e = this.einstellungen;
      if (this.pokalAnzeige) this.pokalAnzeige.verstecken();
      // Runde 6 (W3-F): „Letzter fliegt raus" – mind. 3 Gegner, Runden = Teilnehmer − 1, ohne Polizei
      const CE = (R.config.pokal && R.config.pokal.elimination) || {};
      const elim = e.spielart === 'elimination' && !this.pokal;
      const gegnerE = elim ? Math.max(CE.minGegner || 3, e.gegner) : e.gegner;
      const rundenE = elim ? (e.modus === 'zwei' ? 2 : 1) + gegnerE - 1 : e.runden;
      this.puffs.forEach(p => p.entfernen()); this.puffs = [];
      this.menue.verstecken(); this.ergebnisAnzeige.verstecken(); this.pauseAnzeige.verstecken();
      this.szeneAbbauen();
      const zwei = e.modus === 'zwei';
      this.pausiert = false;
      this.streckeAufbauen(e.streckeId, {
        spieler: zwei ? 2 : 1, autoIds: e.autoIds, fahrer: e.fahrer, gegner: gegnerE, runden: rundenE,
        schwierigkeit: e.schwierigkeit, fahrhilfe: e.fahrhilfe, schaden: e.schaden === true, tempoKlasse: e.tempoKlasse,
        polizei: e.polizei === true && !elim,
        geisterfahrer: e.geisterfahrer === true && !elim, verkehr: elim ? 'aus' : (e.verkehr || 'aus'),    // 15.10. (v25)
        elimination: elim ? { zuschauerSekunden: CE.zuschauerSekunden === undefined ? 6 : CE.zuschauerSekunden } : null,   // W3-F
        upgradesZaehlen: e.upgradesZaehlen !== false,      // W3-G
      });
      for (let i = 0; i < (zwei ? 2 : 1); i++) this.kameraHinzufuegen(this.fahrzeuge[i]);
      const split = zwei;
      this.huds = this.kameras.map((k, i) => new R.Hud(this.hudWurzel, {
        rennen: this.rennen, teilnehmer: this.rennen.teilnehmer[i], fahrzeug: this.fahrzeuge[i], nr: i, split,
      }));
      this.rennen.bei('fertig', () => this.rennenFertig());
      if (elim) this.rennen.bei('raus', (t) => this._ausgeschieden(t));   // Runde 6 (W3-F)
      if (this.wetter) { this.wetter.partikelBauen(this.kameras.length); this.huds.forEach(h => h.wetterSetzen && h.wetterSetzen(this.wetter)); }
      // Runde 4: Gesundheitsbalken (HUD i gehört zu Fahrzeug i – Spieler stehen vorne); aus = versteckt
      this.huds.forEach((h, i) => h.schadenSetzen && h.schadenSetzen(this.schaden, i));
      this.huds.forEach((h, i) => h.werkstattSetzen && h.werkstattSetzen(this.werkstatt, i));   // 14.10. (v18)
      this.huds.forEach((h, i) => h.itemSetzen && h.itemSetzen(this.pickups, this.fahrzeuge.findIndex(f => f.istSpieler && f.spielerNr === i), i));   // W3-H
      // Runde 5b: Polizei-Anzeige (Stopp-Countdown) + Streifenwagen auf der Minimap
      this.huds.forEach((h, i) => h.polizeiSetzen && h.polizeiSetzen(this.polizei, i));
      this.huds.forEach((h, i) => h.verkehrSetzen && h.verkehrSetzen(this.verkehr, i));   // 15.10. (v25): Geisterfahrer-Warnung + Minimap
      this.huds.forEach((h) => h.muenzenSetzen && h.muenzenSetzen(this.muenzen ? 0 : null));   // Runde 6 (W3-G): 🪙 0
      // Ton: Motoren je Auto, Ereignisse
      if (R.Audio) {
        const A = R.Audio; this._tonCd = -1;
        this.fahrzeuge.forEach((f, i) => A.motorAnlegen(i, { spieler: f.istSpieler, auto: f.auto }));   // 14.10. (v21): Klangprofil je Auto (src/audio/motorProfile.js)
        this.rennen.bei('start', () => A.countdown(0));
        this.rennen.bei('runde', (t) => { if (t.istSpieler && t.runde < this.rennen.runden) { A.runde(); if (R.Publikum) R.Publikum.ereignis('runde'); } });
        this.rennen.bei('ziel', (t) => { if (t.istSpieler) { A.ziel(t.zielPlatz); if (R.Publikum) R.Publikum.ereignis('ziel'); } });
      }
      this.zustand = 'rennen';
      this.uhr.rest = 0;
      this.qualitaet.stufe = 0; this.qualitaet.unten = this.qualitaet.oben = 0; this.qualitaet.fpsGlatt = 60;
      this._hudZeit = -1e9;
      this.groesse();
      this._vorwaermen();      // 14.10. (v21): Ruckeln – alles schon vor dem Countdown zur GPU schicken
    }

    /**
     * 14.10. (v21) Ruckeln mitten im Rennen: three.js übersetzt Shader und lädt Geometrie/Texturen erst, wenn ein Objekt zum ERSTEN Mal gezeichnet wird.
     * Alles, was beim Start nicht im Bild ist (Brücke, Gabelung, Bremslicht eines Gegners, Deko weiter hinten an der Strecke …), kostete deshalb später
     * mitten in der Fahrt einen Ruckler. Hier wird einmal alles gezeichnet – ohne Sichtkegel-Test, aber nur auf ein einziges Pixel (Scissor) – direkt
     * nach dem Aufbau, vor dem Countdown. Kosten: ein Frame beim Rennstart. config.grafik.vorwaermen = false schaltet es ab.
     * @returns {number|null} Dauer in ms
     */
    _vorwaermen() {
      const G = R.config.grafik || {}, r = this.renderer;
      if (G.vorwaermen === false || !r || !this.szene) return null;
      const kam = this.kameras[0] ? this.kameras[0].kamera : this.menueKamera;
      if (!kam) return null;
      const t0 = performance.now(), gemerkt = [];
      try {
        this.szene.traverse((o) => { if (o.frustumCulled) { o.frustumCulled = false; gemerkt.push(o); } });
        this.szene.matrixWorldAutoUpdate = false;
        this.szene.updateMatrixWorld();
        if (r.compile) r.compile(this.szene, kam);
        r.setScissorTest(true); r.setScissor(0, 0, 1, 1);
        r.render(this.szene, kam);
        r.setScissorTest(false);
      } catch (e) { /* nur Optik: im Zweifel ohne Vorwärmen weiter */ } finally { gemerkt.forEach((o) => { o.frustumCulled = true; }); }
      this.vorwaermMs = performance.now() - t0;
      return this.vorwaermMs;
    }

    /** Alle Spieler im Ziel: Ergebnis einfrieren (KI-Platzierungen ändern sich danach nicht mehr). */
    rennenFertig() {
      const r = this.rennen;
      this.ergebnis = {
        runden: r.runden,
        zeilen: r.rangliste.map((t, i) => {
          const f = this.fahrzeuge[t.nr];
          // Runde 6 (D3): Sterne je Spieler (nur Menschen und Autopilot-Hook), Summe je Fahrer gespeichert
          let sterne = 0, sterneGesamt = 0;
          if (t.istSpieler && R.Sterne) {
            sterne = R.Sterne.bewerten(i + 1, t.imZiel, t.bestzeit, R.Sterne.zielzeit(this.strecke && this.strecke.katalog, this.tempoKlasse));
            sterneGesamt = R.Sterne.gutschreiben(t.name, sterne);
          }
          // Runde 6 (W3-G): Preisgeld je Spieler (Platz 1/2/3 = 30/20/15, sonst 5) aufs Garage-Konto; mit Schaden an
          // das End-Prozent je Fahrer+Auto merken (nächstes Rennen startet damit, mindestens 30 %)
          let preisgeld = 0, muenzenRennen = 0, muenzenGesamt = 0;
          if (t.istSpieler && R.Garage) {
            preisgeld = R.Garage.preisgeld(t.zielPlatz || i + 1);
            muenzenRennen = this.muenzen ? this.muenzen.anzahlVon(t.nr) : 0;
            muenzenGesamt = R.Garage.gutschreiben(t.name, preisgeld);
            if (this.schaden && this.schaden.an && f && f.auto) R.Garage.restSetzen(t.name, f.auto.id, this.schaden.zustand(t.nr).prozent);
            this._meldung(t.nr, '🏆 Preisgeld +' + preisgeld + ' 🪙', 4000);
            const hd = this.huds[f.spielerNr];
            if (hd && hd.muenzenSetzen && this.muenzen) hd.muenzenSetzen(muenzenRennen + preisgeld, preisgeld);
          }
          return {
            preisgeld, muenzenRennen, muenzenGesamt,
            platz: i + 1, nr: t.nr, name: t.name, istSpieler: t.istSpieler, spielerNr: f.spielerNr, auto: f.auto,
            zeit: t.imZiel ? t.zielZeit : null, beste: t.bestzeit, runden: t.runde, sterne, sterneGesamt,
            raus: t.ausgeschieden ? t.ausscheidRunde : 0,     // W3-F: „Letzter fliegt raus" – in Runde n ausgeschieden
          };
        }),
      };
      if (r.elimination) this.ergebnis.elimination = true;
      // Runde 6 (W3-F): im Pokal statt der Ergebnis-Tafel den Zwischenstand bzw. die Siegerehrung zeigen
      if (this.pokal && this.pokalAnzeige) { this._pokalRennenFertig(); return; }
      this.zustand = 'ergebnis';
      this.ergebnisAnzeige.zeigen(this.ergebnis);
    }

    // ---------- Runde 6 (W3-F): Pokal-Serie (D1) ----------
    /** Pokal mit den aktuellen Einstellungen starten (Größe, Startstärke, Spieler, Autos, Welt/Tageszeit/Wetter). */
    pokalStarten() {
      const e = this.einstellungen;
      this.einstellungenSpeichern();
      this.pokal = new R.Pokal.Serie({ groesse: e.pokalGroesse, startStaerke: e.schwierigkeit, basis: JSON.parse(JSON.stringify(e)) });
      this._pokalRennen();
    }
    /** Nächstes Pokal-Rennen über rennenStarten() (Einstellungen nur vorübergehend, Welt/Wetter je Strecke gültig). */
    _pokalRennen() {
      const s = this.pokal, b = s.basis, re = s.rennenEinstellungen();
      const daten = R.trackCatalog.find(t => t.id === re.streckeId) || R.trackCatalog[0];
      const ein = Object.assign({}, b, re, { spielart: 'pokal' });
      ein.welt = b.welt && daten.welten && daten.welten[b.welt] ? b.welt : '';
      ein.variante = b.variante && daten.varianten && daten.varianten[b.variante] ? b.variante : '';
      if (R.Wetter && R.Wetter.erlaubt && b.jahreszeit !== 'zufall') {
        const erl = R.Wetter.erlaubt(daten.thema, b.jahreszeit) || [];
        if (!erl.length) { ein.jahreszeit = 'sommer'; ein.wetter = 'klar'; }
        else if (b.wetter !== 'zufall' && !erl.includes(b.wetter)) ein.wetter = 'klar';
      }
      this.rennenStarten(ein, { temporaer: true });
    }
    _pokalRennenFertig() {
      const s = this.pokal;
      s.ergebnisEintragen(this.ergebnis.zeilen);
      this.zustand = 'pokal';
      if (!s.fertig) { this.pokalAnzeige.zwischenstand(s); return; }
      const sieger = s.sieger;
      let pokale = 0;
      if (sieger && sieger.istSpieler && !s.gewinnGespeichert) { pokale = R.Pokal.gutschreiben(sieger.name); s.gewinnGespeichert = true; }
      this.pokalAnzeige.siegerehrung(s, { pokale });
    }
    /** Zwischenstand → nächstes Rennen. */
    pokalWeiter() { if (this.pokal && !this.pokal.fertig) this._pokalRennen(); }
    /** Rückfrage „Pokal abbrechen?" (Esc im Zwischenstand, Hauptmenü aus der Pause). */
    pokalAbbruchFragen() {
      if (!this.pokalAnzeige) return;
      this.pokalAnzeige.frage('Pokal abbrechen?', () => this.zumMenue(true), () => {});
    }
    /** Pokal beenden: gespeicherte Einstellungen von vor dem Pokal wiederherstellen; ohne `ohneMenue` ins Hauptmenü. */
    pokalBeenden(ohneMenue) {
      const s = this.pokal;
      this.pokal = null;
      if (s && s.basis) { this.einstellungen = einstellungenPruefen(s.basis); this.einstellungenSpeichern(); }
      if (!ohneMenue) this.zumMenue(true);
    }
    /** Siegerehrung → gleichen Pokal noch einmal. */
    pokalNeu() {
      const s = this.pokal;
      if (s && s.basis) this.einstellungen = einstellungenPruefen(s.basis);
      this.pokal = null;
      this.pokalStarten();
    }

    // ---------- Runde 6 (W3-F): „Letzter fliegt raus" (D7) ----------
    /**
     * Ein Auto scheidet aus: „Puff" + Meldung, Auto unsichtbar und weit weg geparkt (keine Kollisionen mit Autos,
     * Hindernissen, Pflanzen), Physik/Bande/Höhe/Ton überspringen es (f.ausgeschieden). Ausgeschiedene Spieler schauen
     * dem Führenden zu (_zuschauerKameras). Die fahrzeuge-Liste bleibt unverändert (Indizes = Teilnehmer-Nummern).
     */
    _ausgeschieden(t) {
      const f = this.fahrzeuge[t.nr];
      if (!f || f.ausgeschieden) return;
      const d = f.anzeige || f.vehicle;
      if (R.Puff && this.szene) this.puffs.push(new R.Puff(this.szene, d.x, d.y || f.vehicle.y || 0, d.z));
      if (R.Audio && R.Audio._bereit && R.Audio._bereit() && R.Audio._ton && this._spielerAbstand(f.vehicle.x, f.vehicle.z) < 120) {
        R.Audio._ton(520, 90, 0.35, 'sawtooth', 0.35, 0); R.Audio._ton(260, 60, 0.4, 'triangle', 0.3, 0.02);   // „Puff"
      }
      f.ausgeschieden = true;
      if (f.mesh) f.mesh.visible = false;
      if (f.looping && (f.looping.aktiv || f.looping.fallen)) { f.looping.aktiv = false; f.looping.fallen = false; f.vehicle.imLooping = false; }
      if (f.flug && R.Schanzen) R.Schanzen.abbrechen(f.flug, f.vehicle);
      if (f.kleber && R.Kleber) { R.Kleber.abbrechen(f.kleber); R.Kleber.optik(f, false); }
      f.vehicle.setzen(100000 + t.nr * 60, 100000, 0);
      f.vehicle.y = -100;
      this._vorherAngleichen(f);
      f.bremst = false; f.resetHinweis = false; f.falschHerum = false;
      if (R.Audio) R.Audio.motorEntfernen(t.nr);
      this.fahrzeuge.forEach((g, i) => { if (g.istSpieler && i !== t.nr) this._meldung(i, '🚪 ' + t.name + ' ist raus!', 2200); });
    }

    /** Kameras ausgeschiedener Spieler folgen dem Führenden (Zuschauer). */
    _zuschauerKameras() {
      const r = this.rennen;
      if (!r || !r.elimination) return;
      for (let i = 0; i < this.kameras.length; i++) {
        const f = this.fahrzeuge[i];
        if (!f || !f.ausgeschieden) continue;
        const fuehrend = r.rangliste.find(t => !t.ausgeschieden) || r.rangliste[0];
        const lf = fuehrend && this.fahrzeuge[fuehrend.nr];
        if (lf && this.kameras[i].ziel !== lf.vehicle) this.kameras[i].folge(lf.vehicle, lf.anzeige);
      }
    }

    /** Test-Hook: Spieler wird vom Computerfahrer gesteuert (Autopilot an/aus). */
    autopilot(spielerIndex, an) {
      const f = this.fahrzeuge.find(x => x.istSpieler && x.spielerNr === spielerIndex);
      if (!f || !this.strecke) return false;
      if (an === false) { f.autopilot = null; return true; }
      f.autopilot = new R.Driver(f.vehicle, this.strecke, {
        schwierigkeit: 'mittel', seed: 7000 + spielerIndex, name: 'Autopilot ' + (spielerIndex + 1),
      });
      if (typeof f.autopilot.hindernisseSetzen === 'function') f.autopilot.hindernisseSetzen(this.strecke.hindernisse);
      return true;
    }

    /**
     * Strecke aus dem Katalog aufbauen: Grafik, Deko, Thema (Himmel/Nebel),
     * Fahrzeuge auf die Startplätze, Rennleitung.
     * optionen: { spieler (1|2), autoIds, gegner, runden, schwierigkeit, fahrhilfe[], schaden (Runde 4, Standard aus) }
     */
    streckeAufbauen(trackId, optionen) {
      const opt = Object.assign({
        gegner: 3, runden: R.config.rennen.rundenStandard, spieler: 1, autoIds: ['troc-cabrio', 'multivan'],
        fahrhilfe: [R.config.fahrhilfeStandard, R.config.fahrhilfeStandard],
        tempoKlasse: R.config.tempoKlasseStandard || 'normal',
      }, optionen);
      this.tempoKlasse = opt.tempoKlasse;      // Runde 5: fahrzeugHinzufuegen rechnet die Klasse in die Fahrwerte ein
      const strecke = this.streckeSzeneBauen(trackId);
      // Namen: Spieler = gewählte Fahrer, Computer = nicht gewählte Fahrer (Schumacher, Senna, ...)
      const spielerNamen = (opt.fahrer || R.config.fahrerStandard).slice(0, opt.spieler);
      const computerNamen = R.fahrerComputerNamen(spielerNamen, opt.gegner);

      // Fahrzeuge: Spieler zuerst (Startplatz 1, 2), danach die Computerautos.
      // Computer bekommen die Autos, die kein Spieler fährt.
      const katalog = R.carCatalog.waehlbare();   // Polizei (waehlbar: false) weder Spielerwahl noch KI-Gegner
      const spielerIds = opt.autoIds.slice(0, opt.spieler);
      const plaetze = strecke.startpositionen(opt.spieler + opt.gegner);
      // 14.10. (v20): Computer-Gegner nur aus den 4 Modellen mit der guten Optik (Passat, Multivan, 911, T-Roc), bunt gemischt (Lack, T-Roc: Dach
      // offen/zu, Lack blau/gulf), deterministisch je Rennen (Seed aus Strecke, Gegnerzahl und Spielerautos; opt.gegnerSeed überschreibt)
      const gegnerAutos = R.carCatalog.gegnerAutos(opt.gegner, { seed: opt.gegnerSeed !== undefined ? opt.gegnerSeed : [trackId, opt.gegner, spielerIds.join('+')].join('|'), spielerIds });
      const teilnehmer = plaetze.map((p, i) => {
        const istSpieler = i < opt.spieler;
        const auto = istSpieler
          ? (katalog.find(a => a.id === spielerIds[i]) || katalog[0])
          : (gegnerAutos[i - opt.spieler] || katalog[0]);
        // Runde 6 (W3-G): Garage-Werte (Lack, Upgrade-Faktoren) nur für Spieler – die KI nie
        const gw = istSpieler && R.Garage ? R.Garage.fahrzeugWerte(spielerNamen[i], auto.id, opt.upgradesZaehlen !== false) : null;
        const f = this.fahrzeugHinzufuegen(auto, p.x, p.z, p.heading, gw);
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
      this.rennen = new R.RaceManager(strecke, teilnehmer, { runden: opt.runden, elimination: opt.elimination || null });   // W3-F
      // Runde 6 (D3): Start-Boost (Gas im Fenster um „LOS"), nur mit Countdown
      this.startBoost = R.StartBoost && this.rennen.countdownDauer > 0 ? new R.StartBoost(teilnehmer.length) : null;
      // Umgefahrene Pylonen stehen wieder, sobald der Verursacher eine Runde beendet hat
      this.rennen.bei('runde', (t) => strecke.pylonenZurueck(t.nr));
      // Computerfahrer kennen die Hindernisse (falls der Fahrer das unterstützt)
      this.fahrzeuge.forEach((f) => {
        if (f.driver && typeof f.driver.hindernisseSetzen === 'function') f.driver.hindernisseSetzen(strecke.hindernisse);
      });
      // Runde 4: Schaden-System (Spieler und KI gleich). Aus → keine Wirkung, keine Kopie der Fahrwerte, kein Rauch.
      this.schaden = null;
      if (R.Schaden) {
        this.schaden = new R.Schaden(this.fahrzeuge, { an: opt.schaden === true });
        // Runde 6 (W3-G): Spieler starten mit dem Schaden-Rest des letzten Rennens (Garage, min. 30 %; Reparatur = 100 %)
        if (this.schaden.an && R.Garage) {
          for (let i = 0; i < opt.spieler; i++) {
            const f = this.fahrzeuge[i], pr = f && f.auto ? R.Garage.startProzent(spielerNamen[i], f.auto.id) : 100;
            if (pr < 100) this.schaden._punkteSetzen(i, pr);
          }
        }
        if (this.schaden.an) {
          this.fahrzeuge.forEach((f, i) => this.schaden.meshBauen(i, f.mesh));
          this.schaden.bei((e) => this._schadenEreignis(e));
        }
      }
      // 14.10. (v18): sichtbarer Abschleppwagen + Werkstatt neben der Fahrbahn – nur mit Schaden „an“ (online/Server: gar nicht geladen)
      this.abschlepp = null; this.werkstatt = null;
      // 15.10. (v25): config.werkstatt.nurMitSchaden = false → Werkstatt steht auch bei „Schaden aus“ (Kulisse + Asphalt, ohne Heilung); Standard true wie bisher
      const werkKulisse = !!(R.config.werkstatt && R.config.werkstatt.nurMitSchaden === false);
      if ((this.schaden && this.schaden.an) || werkKulisse) {
        if (R.Abschleppwagen && this.schaden && this.schaden.an) this.abschlepp = new R.Abschleppwagen(strecke, this.fahrzeuge, this.schaden, this.szene);
        if (R.Werkstatt) {
          const w = R.Werkstatt.fuer ? R.Werkstatt.fuer(strecke) : new R.Werkstatt(strecke);   // v25: Megastrecke (> 6 km) bekommt zwei
          if (w.vorhanden) {
            const gr = w.bauen();
            if (gr) this.szene.add(gr);
            if (w.freiraeumen) w.freiraeumen(this.szene);     // v25: Bäume im Weg (nur wenn die Platzsuche keine freie Stelle fand)
            w.bei((e) => this._werkstattEreignis(e));
            this.werkstatt = w;
          }
        }
      }
      // Runde 5b: Polizei – Streifenwagen NACH Schaden (bekommt keinen Schaden) als eigene Fahrzeug-Einträge hinter
      // allen Teilnehmern (f.polizei = true); RaceManager/Platzierung/Ergebnis kennen ihn nicht.
      this.polizei = null;
      if (opt.polizei === true && R.Polizei) {
        this.polizei = new R.Polizei(this);
        this.polizei.einsetzen(strecke, opt.spieler + opt.gegner, opt.gegner);
        this.polizei.vorkompilieren(this.renderer, this.szene, this.menueKamera);
      }
      this.verkehr = null;
      if ((opt.geisterfahrer === true || (opt.verkehr && opt.verkehr !== 'aus')) && R.Verkehr && !opt.elimination) {   // 15.10. (v25)
        this.verkehr = new R.Verkehr(this);
        this.verkehr.einsetzen(strecke, opt.spieler + opt.gegner, { geister: opt.geisterfahrer === true, stufe: opt.verkehr || 'aus' });
        this.verkehr.vorkompilieren(this.renderer, this.szene, this.menueKamera);
      }
      // Runde 6 (W3-G): Münzen auf der Fahrbahn (nur im Rennen, jede Welt; keine Physik – nur Einsammeln)
      this.muenzen = null;
      if (R.Muenzen && opt.muenzen !== false) {
        this.muenzen = new R.Muenzen(strecke);
        if (this.muenzen.anzahl) this.szene.add(this.muenzen.bauen()); else this.muenzen = null;
      }
      if (this.tunnelLichter) this._tunnelLichterVorkompilieren();
      return strecke;
    }

    /** Runde 4: Ereignis des Schaden-Systems → Ton, HUD-Meldung, Abschleppen (= Reset am letzten Checkpoint). */
    _schadenEreignis(e) {
      const f = this.fahrzeuge[e.i];
      if (!f) return;
      const A = R.Audio, spieler = !!f.istSpieler;
      if (e.art === 'treffer') { if (A && spieler) A.schadenTreffer(e.stufe); }
      else if (e.art === 'liegengeblieben') {
        this._meldung(e.i, 'Liegengeblieben! 💥', 2400);
        if (A && spieler) A.liegengeblieben();
      } else if (e.art === 'abschleppwagen') {
        this._meldung(e.i, 'Abschleppwagen kommt! 🚛', 2000);
        if (A && spieler) A.abschleppen();
      } else if (e.art === 'abschleppen') {
        this.zuruecksetzen(e.i);
        if (f.driver) f.driver.zurueckgesetzt();
        if (f.autopilot && f.autopilot.zurueckgesetzt) f.autopilot.zurueckgesetzt();
        if (e.reparatur) this._meldung(e.i, 'Abgeschleppt! 🔧', 1200);       // Runde 7: danach zeigt der HUD die Reparatur (hud.js)
        else this._meldung(e.i, 'Weiter geht\'s! 🔧 ' + e.prozent + ' %', 1600);
      } else if (e.art === 'reparatur') {
        if (A && spieler && A.reparaturTon && (R.config.schaden || {}).reparaturTon !== false) A.reparaturTon(e.prozent, this.schaden.losfahrenAb(e.i));
      } else if (e.art === 'reparaturEnde') {
        if (spieler && e.grund === 'voll') this._meldung(e.i, 'Voll repariert! 💯', 1400);
      }
    }

    /** 14.10. (v18): Ereignis der Werkstatt (world/garage.js) → Meldung/Ton für Spieler. */
    _werkstattEreignis(e) {
      const f = this.fahrzeuge[e.i];
      if (!f || !f.istSpieler || f.autopilot) return;
      const A = R.Audio;
      if (e.art === 'start') this._meldung(e.i, 'Werkstatt! 🔧', 1100);
      else if (e.art === 'heilen') { if (A && A.reparaturTon) A.reparaturTon(e.prozent, 1000); }
      else if (e.art === 'voll') this._meldung(e.i, 'Voll repariert! 💯', 1400);
    }

    /** Fahrzeug aus einem Katalog-Eintrag anlegen (Physik + 3D-Modell). */
    fahrzeugHinzufuegen(auto, x, z, heading, garage) {
      // Runde 5: Tempo-Klasse (normal/schnell) VOR jeder Schaden-Kopie (datenBasis) einrechnen
      const vehicle = new R.Vehicle(auto.fahrwerte, { tempoKlasse: this.tempoKlasse || R.config.tempoKlasseStandard || 'normal' });
      // Runde 6 (W3-G): Garage-Upgrades (nur Spieler) ebenfalls direkt in daten – vor der Schaden-Kopie, Turbo bleibt multiplikativ
      if (garage) {
        vehicle.daten.vMax *= garage.vMax || 1; vehicle.daten.grip *= garage.grip || 1; vehicle.daten.bremsen *= garage.bremsen || 1;
        vehicle.garage = garage;
      }
      vehicle.setzen(x, z, heading);
      const mesh = R.carBuilder.bauen(auto, garage && garage.farbe !== null && garage.farbe !== undefined ? { farbe: garage.farbe } : undefined);
      // Runde 6: Dämmerung/Nacht – alle Autos mit leuchtenden Scheinwerfern/Rücklichtern (nur Material, kein Licht)
      if (this.tageszeitDaten && this.tageszeitDaten.autoLicht && R.carBuilder.setzeLicht) R.carBuilder.setzeLicht(mesh, true);
      this.szene.add(mesh);
      const eintrag = { vehicle, mesh, auto, radwinkel: 0 };
      // Looping-Zustand je Fahrzeug (track/looping.js): { aktiv, winkel, v, … }
      eintrag.looping = R.Looping ? R.Looping.zustand() : null;
      // Runde 4: Sprungschanzen-Zustand je Fahrzeug (track/schanze.js): Rampe, Flug, Statistik (fluege, landungen)
      eintrag.flug = R.Schanzen ? R.Schanzen.zustand() : null;
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
      // Runde 5: ein Frame > frameVerwerfenMs (80 ms) wird nicht nachgeholt – höchstens so viel Spielzeit
      // wie maxSchritteProFrame Schritte, der Rest verfällt (kein Eingabe-Lag durch Nachholen).
      if (aktiv) this.uhr.rest += dt; else this.uhr.rest = 0;
      const langerFrame = dt * 1000 > (p.frameVerwerfenMs || 80);
      let schritte = 0;
      // Eingabe: input.steuerung() wird in jedem physikSchritt aus dem aktuellen Tastenzustand gelesen
      // (gleicher Frame, vor dem ersten Schritt aktualisiert durch die Key-Events); frameEnde() erst danach.
      while (this.uhr.rest >= p.schritt && schritte < p.maxSchritteProFrame) {
        this.physikSchritt(p.schritt);
        this.uhr.rest -= p.schritt;
        schritte++;
      }
      // Zu langsam (> maxSchritte·16,7 ms) oder langer Frame: Rest verwerfen statt nachzuholen → keine Spirale
      if ((schritte === p.maxSchritteProFrame || langerFrame) && this.uhr.rest >= p.schritt) this.uhr.rest = this.uhr.rest % p.schritt;
      this.input.frameEnde();
      const t1 = performance.now();

      // Grafik an Physik angleichen: zwischen vorletztem und letztem Physikzustand interpolieren
      const alpha = aktiv ? Math.min(1, this.uhr.rest / p.schritt) : 1;
      const pose = this._loopPose || (this._loopPose = { pos: new THREE.Vector3(), quat: new THREE.Quaternion(), vor: new THREE.Vector3(), oben: new THREE.Vector3() });
      for (let i = 0; i < this.fahrzeuge.length; i++) {
        const f = this.fahrzeuge[i], v = f.vehicle, a = f.vorher, d = f.anzeige, mesh = f.mesh;
        d.x = a.x + (v.x - a.x) * alpha; d.y = a.y + (v.y - a.y) * alpha; d.z = a.z + (v.z - a.z) * alpha;
        d.heading = a.heading + R.Vehicle.winkelDiff(v.heading, a.heading) * alpha;
        d.nicken = a.nicken + (v.nicken - a.nicken) * alpha; d.neigung = a.neigung + (v.neigung - a.neigung) * alpha;
        // Looping: Pose (Position + Drehung, Dach zum Kreismittelpunkt) kommt aus track/looping.js
        if (this.strecke && f.looping && R.Looping.anzeigePose(this.strecke, f.looping, alpha, pose)) {
          mesh.position.copy(pose.pos);
          mesh.quaternion.copy(pose.quat);
          d.x = pose.pos.x; d.y = pose.pos.y; d.z = pose.pos.z;
          f.loopAnzeige = true;
        } else {
          f.loopAnzeige = false;
          mesh.position.set(d.x, d.y, d.z);
        }
        // Längsneigung nach der Straßensteigung: Höhe 1,6 m vor und hinter der (interpolierten) Mitte
        let steigung = 0, geleNeig = 0;
        if (this.strecke) {
          const st = this.strecke, r = d.richtung();
          steigung = Math.atan2(st.hoeheAn(d.x + r.x * 1.6, d.z + r.z * 1.6, f.index) - st.hoeheAn(d.x - r.x * 1.6, d.z - r.z * 1.6, f.index), 3.2);   // W4-I: Index
          // 14.10. (v20, Bug „Auto im Grünen"): abseits der Fahrbahn Nicken/Querneigung/Höhe nach dem Gelände unter den 4 Ecken der
          // Karosserie (Gewicht 0 auf der Straße = unverändert, weich über den Randstreifen); nur Anzeige, v.y bleibt hoeheAn
          const gw = !f.loopAnzeige && !(f.flug && (f.flug.aktiv || f.flug.rampe)) && st.abseitsGewicht ? st.abseitsGewicht(f.nah) : 0;
          if (gw > 0.001) {
            const gp = st.gelaendePose(d.x, d.z, r.x, r.z, v.daten.laenge / 2, v.daten.breite / 2, f.index, this._gelPose || (this._gelPose = {}));
            steigung += (gp.nicken - steigung) * gw; geleNeig = gp.neigung * gw;
            if (gp.dy) mesh.position.y += gp.dy * gw;
          }
        }
        // Runde 4: in der Luft ersetzt das Flug-Nicken die Straßensteigung; Rampe/Landung: Zusatz-Nicken (interpoliert)
        const fz = f.flug;
        if (fz && fz.aktiv) steigung = 0;
        const flugNicken = fz ? R.Schanzen.anzeigeNicken(fz, alpha) : 0;
        // YXZ: erst Heading (Hochachse), dann Nicken (Querachse, > 0 = Bug hoch), dann Wanken (Längsachse) – alles lokal
        if (!f.loopAnzeige) mesh.rotation.set(d.nicken + steigung + flugNicken, d.heading, d.neigung + geleNeig, 'YXZ');
        // Räder rollen und lenken, Bremslicht
        f.radwinkel -= v.vLaengs * dt / 0.34;   // Rolldrehung (Radradius ≈ 0,34 m)
        R.carBuilder.dreheRaeder(mesh, f.radwinkel);
        R.carBuilder.lenkeRaeder(mesh, -v.lenkung * 0.5);
        R.carBuilder.setzeBremslicht(mesh, !!f.bremst);
      }
      if (R.dach) R.dach.frame(this, this.pausiert ? 0 : dt);   // 14.10. (v20): Cabrio-Verdeck auf/zu (src/cars/dach.js), nur Optik
      if (this.zustand === 'menue') this.menueKameraFlug(dt);
      else if (this.rennen && this.rennen.elimination) this._zuschauerKameras();   // W3-F (vor dem Kamera-Update)
      if (this.zustand !== 'menue' && !this.pausiert) for (let i = 0; i < this.kameras.length; i++) { this.kameras[i].update(dt); this._loopingKamera(this.kameras[i], dt, alpha); }
      if (this.strecke) this.strecke.hindernisseAnimieren(this._physikZeit || 0);
      // W4-J: Warnlicht an der Kreuzung (blinkt; schnell, wenn im anderen Abschnitt ein Auto < 60 m vor der Kreuzung ist)
      if (this.strecke && this.strecke.kreuzungen && this.strecke.kreuzungen.length) this.strecke.kreuzungAnimieren(this._physikZeit || 0, this.zustand === 'menue' ? null : this.fahrzeuge);
      if (this.wetter) this.wetter.update(dt, this.zustand === 'menue' ? [this.menueKamera] : this.kameras);
      if (this.dynamik) this.dynamik.animieren();
      if (this.puffs.length) this.puffs = this.puffs.filter(p => p.update(this.pausiert ? 0 : dt));   // W3-F
      if (this.dynamik) this._dinoFrame(dt);    // Runde 6 (W2-C): Himmel beim Vulkanausbruch, Kamera-Duck (Flugsaurier)
      // Runde 4: Turbo-Pfeile/Schild-Kugeln/Hülle/Flammen; Schaden-Rauch + Warnblinker (NACH setzeBremslicht oben)
      if (this.pickups) this.pickups.animieren(this._physikZeit || 0, this.fahrzeuge);
      if (this.muenzen) this.muenzen.animieren(this._physikZeit || 0);      // Runde 6 (W3-G)
      if (this.schaden && this.schaden.an) this.schaden.update(this.pausiert || this.zustand === 'menue' ? 0 : dt);
      if (this.abschlepp) this.abschlepp.update(this.pausiert ? 0 : dt);                      // 14.10. (v18): Abschleppwagen/Kran überschreibt die Mesh-Pose des Wracks
      if (this.werkstatt) this.werkstatt.animieren(this._physikZeit || 0, this.fahrzeuge);   // Schild/Lampe der Werkstatt
      if (this.strecke && this.strecke.tribuenen && this.strecke.tribuenen.length && R.Tribuenen) R.Tribuenen.animieren(this.strecke, this._physikZeit || 0, this.pausiert ? 0 : dt);   // 15.10. (v25): Zuschauer wippen/jubeln, Fahnen wehen
      if (this.polizei) this.polizei.animieren(this._physikZeit || 0);   // Runde 5b: Blaulicht
      if (this.verkehr) this.verkehr.animieren(this._physikZeit || 0);   // 15.10. (v25): Blaulicht Krankenwagen, Rundumleuchte, Lichthupe
      if (this.tunnelLichter) this._tunnelLichterAktualisieren();
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
        lichter: this.lichterZaehlen(),      // Runde 6
      };
    }

    /** Runde 6: aktive Lichter in der Szene zählen (sichtbar, Intensität > 0; auch an Autos hängende Blaulichter). */
    lichterZaehlen() {
      const z = { spot: 0, punkt: 0, richtung: 0, halbkugel: 0, tageszeit: (this.einstellungen && this.einstellungen.tageszeit) || 'tag' };
      this.szene.traverseVisible((o) => {
        if (!o.isLight || !(o.intensity > 0)) return;
        if (o.isSpotLight) z.spot++; else if (o.isPointLight) z.punkt++;
        else if (o.isDirectionalLight) z.richtung++; else if (o.isHemisphereLight) z.halbkugel++;
      });
      return z;
    }

    /** Menü-Hintergrund: Kamera fliegt langsam über der Strecke entlang. */
    menueKameraFlug(dt) {
      const st = this.strecke; if (!st) return;
      this.menueS = (this.menueS + dt * R.config.ui.menueKameraTempo) % st.spline.laenge;
      const sp = st.spline, p = sp.punktBei(this.menueS), q = sp.punktBei(this.menueS + 70);
      const seite = Math.sin(this.menueS / 90) * 16;     // schwenkt langsam über die Straße
      const x = p.x + p.nx * seite, z = p.z + p.nz * seite;
      // W4-I: Höhe aus s (an einer Überführung die richtige Ebene); Höhenmodell 'gelaende' unverändert
      this.menueKamera.position.set(x, st.hoeheBeiS(this.menueS, 0) + 13 + Math.sin(this.menueS / 55) * 4, z);
      this.menueKamera.lookAt(q.x, st.hoeheBeiS(this.menueS + 70, 0) + 1.5, q.z);
    }

    /** Motorgeräusche, Countdown-Pieptöne, Bremsquietschen, Bande – jeden Frame. */
    tonAktualisieren(dt) {
      const A = R.Audio, r = this.rennen, d = this._tonD || (this._tonD = {});
      // W5: online nur während des Rennens hörbar (Ergebnis-Tafel: still)
      const stumm = !(this.zustand === 'rennen' || (this.zustand === 'online' && this.online && this.online.phase === 'rennen')) || this.pausiert;
      if (stumm !== this._tonStumm) { this._tonStumm = stumm; A.motorStumm(stumm); }
      if (this.polizei) this.polizei.ton(stumm);   // Runde 5b: Sirene (Pause/Menü: aus)
      if (R.Publikum) R.Publikum.aktualisieren(this, dt, stumm || !r);   // 15.10. (v25): Publikum an den Tribünen (audio/publikum.js; Jubel steuert auch die Zuschauer-Animation)
      if (this.verkehr) this.verkehr.ton(stumm);   // 15.10. (v25): Sirene Krankenwagen, Hupe Geisterfahrer
      if (!r || stumm) return;
      const z = r.countdownZahl;
      if (z !== this._tonCd) { this._tonCd = z; if (z > 0) A.countdown(z); }
      let bremst = false;
      const fz = this.fahrzeuge;   // Schleifen ohne Closures: läuft jeden Frame
      for (let i = 0; i < fz.length; i++) {
        const f = fz[i], v = f.vehicle; let ab = 0;
        if (f.ausgeschieden) continue;        // W3-F: Motor ist entfernt
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

    /**
     * Kamera im Looping: Verfolger läuft auf dem Kreis hinter dem Auto her, "oben" = Auto-oben (weich).
     * Danach dreht sich "oben" sanft zurück auf die Senkrechte. Cockpit: an der Auto-Pose festgemacht.
     */
    _loopingKamera(k, dt, alpha) {
      const kam = k.kamera, Y = this._oben || (this._oben = new THREE.Vector3(0, 1, 0));
      const f = this._fahrzeugVon(k.ziel), lp = f && f.looping;
      if (!lp || !lp.aktiv || !this.strecke) {
        // zurück zur normalen Kamera: "oben" weich auf die Senkrechte, Blick neu ausrichten
        if (kam.up.y < 0.9999) {
          kam.up.lerp(Y, 1 - Math.exp(-5 * dt)).normalize();
          if (kam.up.y > 0.9999) kam.up.copy(Y);
          kam.lookAt(k.blick);
        }
        k._imLooping = false;
        return;
      }
      const L = k._loop || (k._loop = { pos: new THREE.Vector3(), blick: new THREE.Vector3(), oben: new THREE.Vector3(),
        zPos: new THREE.Vector3(), zBlick: new THREE.Vector3(), zOben: new THREE.Vector3() });
      const ziel = { pos: L.zPos, blick: L.zBlick, oben: L.zOben };
      if (k.modus === 'cockpit') {
        const p = this._loopPose;
        R.Looping.anzeigePose(this.strecke, lp, alpha, p);
        L.zPos.copy(p.pos).addScaledVector(p.oben, 1.15).addScaledVector(p.vor, 0.4);
        L.zBlick.copy(L.zPos).addScaledVector(p.vor, 30).addScaledVector(p.oben, -0.5);
        L.zOben.copy(p.oben);
        L.pos.copy(L.zPos); L.blick.copy(L.zBlick); L.oben.copy(L.zOben);
      } else {
        R.Looping.kameraPose(this.strecke, lp, alpha, k.modus === 'weit' ? 4.5 : 3, ziel);
        if (!k._imLooping) { L.pos.copy(kam.position); L.blick.copy(k.blick); L.oben.copy(kam.up); }
        const t = 1 - Math.exp(-9 * dt);
        L.pos.lerp(L.zPos, t); L.blick.lerp(L.zBlick, Math.min(1, t * 1.6)); L.oben.lerp(L.zOben, t).normalize();
      }
      k._imLooping = true;
      kam.position.copy(L.pos); kam.up.copy(L.oben); kam.lookAt(L.blick);
      // Verfolger-Zustand mitführen: nach der Ausfahrt geht es nahtlos weiter
      k.pos.copy(L.pos); k.blick.copy(L.blick);
    }

    /** Fahrzeug-Eintrag zu einem Vehicle (für Kameras). */
    _fahrzeugVon(vehicle) {
      for (let i = 0; i < this.fahrzeuge.length; i++) if (this.fahrzeuge[i].vehicle === vehicle) return this.fahrzeuge[i];
      return null;
    }

    /** Runde 6 (W2-C): kleinster Abstand (m) eines Spieler-Autos zu (x, z) – Infinity ohne Spieler. */
    _spielerAbstand(x, z) {
      let d = Infinity;
      for (const f of this.fahrzeuge) if (f.istSpieler) d = Math.min(d, Math.hypot(f.vehicle.x - x, f.vehicle.z - z));
      return d;
    }

    /**
     * Runde 6 (W2-C): Ereignisse der Dino-/Tier-Dynamik: Töne (nur in Hörweite eines Spielers), Meldungen,
     * Kamerawackeln (Brüllen < 30 m, Einschlag < 60 m), Kamera-Duck beim Flugsaurier.
     */
    _dinoEreignisse(liste) {
      const C = R.config.dino || {}, A = R.Audio, CV = C.vulkan || {}, CM = C.meteor || {};
      const wackeln = (x, z, radius, staerke) => this.kameras.forEach((kam) => {
        const v = kam.ziel; if (!v) return;
        const d = Math.hypot(v.x - x, v.z - z);
        if (d < radius) kam.wackeln(staerke * (0.4 + 0.6 * (1 - d / radius)));
      });
      for (const e of liste) {
        const d = e.x !== undefined ? this._spielerAbstand(e.x, e.z) : 0;
        if (e.typ === 'bruellen') {
          if (A && A.dinoBruellen && d < 120) A.dinoBruellen(Math.max(0.25, 1 - d / 120), e.art);
          wackeln(e.x, e.z, C.bruellenRadius || 30, C.bruellenWackeln || 2.5);
        } else if (e.typ === 'grollen') {
          if (A && A.grollen) A.grollen(e.dauer || 3);
          this.fahrzeuge.forEach((f, i) => this._meldung(i, '🌋 Der Vulkan bricht aus!', 2600));
          this.kameras.forEach((kam) => kam.wackeln(1.2));
        } else if (e.typ === 'bombe') {
          if (A && A.pfeifen && d < 220) A.pfeifen(e.dauer || 2.6, Math.max(0.3, 1 - d / 220));
        } else if (e.typ === 'einschlag') {
          if (A && A.einschlag && d < 300) A.einschlag(Math.max(0.25, 1 - d / 300));
          const r = e.art === 'meteor' ? (CM.wackelRadius || 60) : (CV.wackelRadius || 60);
          wackeln(e.x, e.z, r, e.art === 'meteor' ? (CM.wackeln || 4) : (CV.wackeln || 5));
        } else if (e.typ === 'meteorWarnung') {
          if (A && A.pfeifen && d < 260) A.pfeifen(e.dauer || 2, Math.max(0.35, 1 - d / 260));
          this.fahrzeuge.forEach((f, i) => { if (f.istSpieler && Math.hypot(f.vehicle.x - e.x, f.vehicle.z - e.z) < 260) this._meldung(i, '☄️ Meteorit!', 1800); });
        } else if (e.typ === 'brummen') {        // W2-C2: Bär betritt die Straße
          if (A && A.baerBrummen && d < 70) A.baerBrummen(Math.max(0.3, 1 - d / 70));
        } else if (e.typ === 'rehRuf') {         // W2-C2: Reh bleibt stehen und schaut
          if (A && A.rehRuf && d < 60) A.rehRuf(Math.max(0.3, 1 - d / 60));
        } else if (e.typ === 'schrei') {
          if (A && A.flugsaurierSchrei && d < 150) {          // W3-H: in der Nähe (< 80 m) doppelt übereinander = deutlich lauter
            A.flugsaurierSchrei(Math.max(0.5, 1 - d / 150));
            if (d < 80) A.flugsaurierSchrei(Math.max(0.5, 1 - d / 150));
          }
        } else if (e.typ === 'duck') {
          const f = this.fahrzeuge[e.nr];
          if (f) this.kameras.forEach((kam) => { if (kam.ziel === f.vehicle) { kam._duckZeit = 0.7; kam._duckStaerke = e.staerke || 0.6; } });
          if (f && f.istSpieler) this._meldung(e.nr, 'Flugsaurier! 🦅', 1200);
        }
      }
    }

    /** Runde 6 (W2-C): je Frame – Himmel/Nebel rötlich bei Vulkanglut, Kamera kurz ducken (nach kameras.update). */
    _dinoFrame(dt) {
      const glut = this.dynamik.vulkanGlut || 0, sz = this.szene, CV = (R.config.dino && R.config.dino.vulkan) || {};
      if (glut > 0 && sz.background && sz.background.isColor) {
        if (!this._himmelBasis) this._himmelBasis = { bg: sz.background.clone(), nebel: sz.fog ? sz.fog.color.clone() : null };
        const rot = this._himmelRot || (this._himmelRot = new THREE.Color(CV.himmelRot !== undefined ? CV.himmelRot : 0x8a3a24));
        const a = glut * (CV.himmelAnteil !== undefined ? CV.himmelAnteil : 0.55);
        sz.background.copy(this._himmelBasis.bg).lerp(rot, a);
        if (sz.fog && this._himmelBasis.nebel) sz.fog.color.copy(this._himmelBasis.nebel).lerp(rot, a * 0.8);
        // W2-C1: Dämmerung/Nacht zeichnen eine Himmelskuppel (verdeckt background) → deren Materialfarbe (Faktor) mit tönen
        const ku = this.wetter && this.wetter._kuppel;
        if (ku && ku.material && ku.material.color) ku.material.color.setRGB(1, 1 - 0.45 * a, 1 - 0.6 * a);
      } else if (this._himmelBasis) {
        if (sz.background && sz.background.isColor) sz.background.copy(this._himmelBasis.bg);
        if (sz.fog && this._himmelBasis.nebel) sz.fog.color.copy(this._himmelBasis.nebel);
        const ku = this.wetter && this.wetter._kuppel;
        if (ku && ku.material && ku.material.color) ku.material.color.setRGB(1, 1, 1);
        this._himmelBasis = null;
      }
      if (this.pausiert) return;
      for (const kam of this.kameras) {
        if (!(kam._duckZeit > 0)) continue;
        const u = 1 - kam._duckZeit / 0.7;
        if (kam.kamera) kam.kamera.position.y -= (kam._duckStaerke || 0.6) * Math.sin(Math.PI * u);
        kam._duckZeit -= dt;
      }
    }

    /** HUD-Meldung (oben) für das Spielerauto i (nur Spieler haben ein HUD). */
    _meldung(i, text, ms) {
      const f = this.fahrzeuge[i];
      if (!f || !f.istSpieler) return;
      const hd = this.huds[f.spielerNr];
      if (hd && hd.meldung) hd.meldung(text, ms);
    }

    /** Looping-Ereignis eines Fahrzeugs: Meldung, Ton, Rennleitung nachführen. */
    _loopingEreignis(i, ereignis) {
      if (!ereignis) return;
      const f = this.fahrzeuge[i];
      if (ereignis === 'gefallen') {
        if (this.rennen && !f.polizei) this.rennen.verfolgungSetzen(i, f.vehicle.x, f.vehicle.z);
        this._vorherAngleichen(f); f.index = -1;
        this._meldung(i, 'Mehr Anlauf! 🚀', 2200);
        if (R.Audio && f.istSpieler) R.Audio.kollision(4);
      } else if (ereignis === 'zuLangsam') {
        this._anlaufEreignis(i, 'zuLangsam');     // Runde 5: Notstopp an der Einfahrt (sonst Anlauf-Bremse davor)
      } else if (ereignis === 'start') {
        this._meldung(i, 'Looping! 🌀', 1200);
      } else if (ereignis === 'geschafft') {
        this._meldung(i, 'Super Looping! 🎉', 1500);
      }
    }

    /** Nur für Tests: Spielzeit ohne Zeichnen vorspulen (Sekunden). */
    schnellvorlauf(sekunden) {
      const dt = R.config.physik.schritt;
      for (let t = 0; t < sekunden; t += dt) this.physikSchritt(dt);
    }


    /**
     * 14.10. (v22) Polizei freikaufen (Doppeltipp Rückwärts bzw. online Eingabe-Bit f): beendet den Stopp von Teilnehmer i sofort gegen
     * config.polizei.freikaufKosten (Standard 10) Münzen. Guthaben = Garage-Konto des Fahrers (R.Garage; die Münzen des laufenden Rennens
     * sind dort schon gutgeschrieben, sie zählen also zuerst/mit; der Rennzähler im HUD sinkt entsprechend). Auf dem Server (this.netzKonto,
     * vom Browser beim Laden gemeldet) wird dieses Guthaben benutzt und dort abgezogen; der Browser bucht sein Garage-Konto nach dem Ereignis 'freikauf' ab.
     * @returns {'ok'|'zuwenig'|'nein'}
     */
    polizeiFreikaufen(i) {
      const po = this.polizei, f = this.fahrzeuge[i], t = this.rennen && this.rennen.teilnehmer[i];
      if (!po || !f || !t || !po.logik.gesperrt(i)) return 'nein';
      const kosten = po.c.freikaufKosten;
      const netz = this.netzKonto && f.spielerNr >= 0;
      const guthaben = netz ? (this.netzKonto[f.spielerNr] || 0) : (R.Garage ? R.Garage.konto(t.name) : 0);
      if (guthaben < kosten) { this._meldung(i, 'Zu wenig Münzen (' + kosten + ' nötig)', 1500); return 'zuwenig'; }
      if (netz) this.netzKonto[f.spielerNr] = guthaben - kosten;
      else if (!R.Garage.abbuchen(t.name, kosten).ok) return 'zuwenig';
      po.freikaufen(i);
      if (this.muenzen && this.muenzen.abziehen(i, kosten) > 0) {
        const hd = this.huds[f.spielerNr];
        if (hd && hd.muenzenSetzen) hd.muenzenSetzen(this.muenzen.anzahlVon(i), 0);
      }
      this._meldung(i, '💰 −' + kosten + ' – weiter!', 1500);
      if (this.freikaufHoerer) this.freikaufHoerer(i, kosten, netz ? this.netzKonto[f.spielerNr] : null);
      return 'ok';
    }

    /**
     * 15.10. (v24): Cabrio-Dach bei Niederschlag – Teil des Physikschritts je Auto mit Verdeck (cars/dachregel.js, config.dachRegen):
     * Nässe an der Position (wetter.nass), Klappzeit/Uhr zählen, Geste (f.dachGeste, gesetzt von dach.js bzw. – online – vom Server aus dem Eingabe-Bit d),
     * Strafe anwenden (Schaden an: schaden.treffer 'nass'; sonst eigener Wert dl.gesund), Meldungen an Menschen. Einmal je Auto und Schritt, VOR der Eingabe.
     */
    _dachVorab(i, f, dl, dt, rennen, schaden) {
      const D = R.DachRegel, v = f.vehicle, t = rennen && rennen.teilnehmer ? rennen.teilnehmer[i] : null;
      const laeuft = !!rennen && rennen.gasErlaubt && !(t && t.imZiel);
      const nass = this.wetter && this.wetter.nass ? this.wetter.nass(v) : false;
      const ev = D.schritt(dl, dt, nass, laeuft);
      const mensch = f.istSpieler && !f.autopilot;
      if (mensch && ev) {
        if (ev === 'nass') { const a = D.anzeige(dl, false, this.netzKonto ? 0 : f.spielerNr); if (a) this._meldung(i, a.text, 3200); }   // Server: jeder Spieler steuert mit den Pfeilen (↑+↓)
        else if (ev === 'zu') this._meldung(i, 'Dach ist zu ✔', 1400);
        else if (ev === 'auf') this._meldung(i, 'Dach ist offen', 1200);
      }
      if (f.dachGeste) { f.dachGeste = false; D.geste(dl, v.vLaengs); }
      if (dl.faellig) {
        if (schaden) {
          const z = schaden.z[i], verl = schaden.treffer(i, 'nass', 99);
          if (verl > 0) { dl.faellig = false; if (mensch) this._meldung(i, '💧 Nass! −' + verl + ' %', 2400); }
          else if (!z || z.liegengeblieben || z.rep || z.punkte <= 0) dl.faellig = false;   // liegengeblieben/Reparatur: nichts mehr zu holen (Uhr läuft normal weiter)
          // sonst Abklingzeit nach einem anderen Treffer: im nächsten Schritt erneut versuchen
        } else {
          const ab = D.strafeAnwenden(dl);
          if (mensch) this._meldung(i, ab > 0 ? '💧 Nass! −' + ab + ' %' : '💧 Nass! (Auto ' + dl.gesund + ' %)', 2400);
        }
      }
    }

    /**
     * Ein fester Physikschritt (1/60 s). Reihenfolge (Runde 4, verbindlich):
     *   1. Eingabe je Auto: Spieler (Tastatur) / Computerfahrer (KI, Autopilot); Countdown → kein Gas.
     *   2. gesperrt?  Schaden: liegengebliebenes Auto bekommt nur Bremse (KI wird nicht gefragt → kein KI-Reset).
     *   3. Looping (track/looping.js) bzw. Flug über eine Schanze (track/schanze.js) ERSETZEN vehicle.schritt → fertig.
     *   4. Faktoren: Turbo (pickups.faktoren) multipliziert vehicle.daten.vMax/beschleunigung NUR um vehicle.schritt
     *      herum und schreibt danach exakt die alten Werte zurück (Schaden tauscht vehicle.daten nur außerhalb).
     *   5. vehicle.schritt (mit Fahrhilfe + Wetter-Umwelt).
     *   6. nachSchritt: Schanze (Rampe hoch / Absprung), Looping-Einfahrt.
     *   7. y: Rampe/Flug (Schanzen.hoehe) bzw. Straßenhöhe – wird nach den Kollisionen nochmal gesetzt (+ Ast-Hüpfer).
     *   8. Kollisionen: Bande (auch im Flug) → Auto-Auto (nicht Looping/Flug) → Hindernisse inkl. Wracks und
     *      Dynamik (Bälle, Wasser, Strohballen). Für Hindernisse/Dynamik merkt der Schild vorher Tempo/Drift
     *      (vorTreffern) und nimmt abgefangene Treffer danach zurück (nachTreffern).
     *      Runde 6: Auto-Auto als Rechtecke (Einstellung rempeln sanft/echt) → Bande nochmal für dabei verschobene
     *      Autos → Looping-Abstand → Pflanzen (Bäume/Felsen fest, Büsche weich) → Hindernisse.
     *   9. Schaden: Schild fängt zählende Bande/Auto-Treffer ab, dann stoesseAuswerten + schritt
     *      (Liegenbleiben, Abschleppen → zuruecksetzen).
     *  10. Pickups.schritt: Turbo-Felder überfahren, Schild-Kugeln aufsammeln (Meldungen, Töne).
     *  11. Höhe, Feststecken, Rennen.schritt (Runden, Checkpoints, Plätze).
     */
    physikSchritt(dt) {
      // W5: Online-Rennen – Server rechnet, hier nur Eingabe senden, eigenen Wagen vorhersagen, andere interpolieren
      if (this.zustand === 'online' && this.online) { this.online.physikSchritt(dt); return; }
      const strecke = this.strecke, rennen = this.rennen;
      const countdown = !!rennen && !rennen.gasErlaubt;
      const schaden = this.schaden && this.schaden.an ? this.schaden : null;
      const werkstatt = this.werkstatt || null;     // 14.10. (v18): nur mit Schaden an (v25: bei nurMitSchaden=false auch als Kulisse; Heilung/KI prüfen `schaden` selbst)
      const pickups = this.pickups;
      const polizei = this.polizei;      // Runde 5b (null = aus → alles wie vorher)
      const verkehr = this.verkehr || null;   // 15.10. (v25)
      const rempeln = this.einstellungen && this.einstellungen.rempeln === 'echt' ? 'echt' : 'sanft';   // Runde 6
      // Fortschritt der Spieler für das Gummiband der KI
      const tn = rennen ? rennen.teilnehmer : [];
      let spielerMax = null;
      for (let i = 0; i < tn.length; i++) if (tn[i].istSpieler && !tn[i].ausgeschieden && (spielerMax === null || tn[i].fortschritt > spielerMax)) spielerMax = tn[i].fortschritt;
      const umgebung = this._umgebung || (this._umgebung = {});   // wiederverwendet (KI liest nur)
      // Zustand vor diesem Schritt merken (für die Interpolation beim Zeichnen)
      for (let i = 0; i < this.fahrzeuge.length; i++) {
        const v = this.fahrzeuge[i].vehicle, a = this.fahrzeuge[i].vorher;
        if (!a) continue;
        a.x = v.x; a.y = v.y; a.z = v.z; a.heading = v.heading; a.nicken = v.nicken; a.neigung = v.neigung;
      }

      this.fahrzeuge.forEach((f, i) => {
        if (f.ausgeschieden) return;          // Runde 6 (W3-F): ausgeschieden („Letzter fliegt raus") – steht geparkt
        const v = f.vehicle;
        // --- 15.10. (v24): Cabrio-Dach bei Regen/Schnee/Hagel (cars/dachregel.js): Klappzeit, Nässe, Strafuhr, Geste; nur Autos mit Verdeck ---
        const dl = f.dachL !== undefined ? f.dachL : (f.dachL = R.DachRegel ? R.DachRegel.neu(f.auto) : null);
        let dachPlan = null;
        if (dl) {
          this._dachVorab(i, f, dl, dt, rennen, schaden);
          if (rennen && (f.driver || f.autopilot) && !f.polizei && (!f.istSpieler || f.autopilot) && !(schaden && schaden.gesperrt(i)) && !(polizei && polizei.gesperrt(i)))
            dachPlan = R.DachRegel.kiPlan(f, dl, strecke, dt);    // KI-Cabrio: bei Nässe anhalten und Dach schließen (null = normal fahren)
        }
        // --- 1./2. Eingabe (liegengeblieben: nur Bremse, Computerfahrer wird nicht gefragt) ---
        let s = { gas: 0, bremse: 0, lenkung: 0 };
        const fahrer = f.driver || f.autopilot || f.polizeiFahrer;       // Computerfahrer (KI, Autopilot, Polizei)
        if (schaden && schaden.gesperrt(i)) s = { gas: 0, bremse: 1, lenkung: 0 };
        else if (polizei && polizei.gesperrt(i)) s = polizei.haltSteuerung(v);   // Runde 5b: von der Polizei angehalten
        else if (f.verkehr) { s = verkehr ? verkehr.steuerung(i, dt) : s; }   // 15.10. (v25): Geisterfahrer/Krankenwagen/Abschleppwagen
        else if (f.polizei) { if (polizei) s = polizei.steuerung(i, dt, rennen); }   // Runde 5b: Streifenwagen
        else if (f.istSpieler && tn[i] && tn[i].imZiel) s = { gas: 0, bremse: v.vLaengs > 0.3 ? 0.6 : 0, lenkung: 0 };   // im Ziel: ausrollen (v23: nur bremsen, solange es vorwärts rollt – sonst fuhr es nach dem Stand rückwärts)
        else if (f.istSpieler && f.spielerNr >= 0 && !f.autopilot) s = this.input.steuerung(f.spielerNr);
        else if (dachPlan && dachPlan.art === 'halten') s = R.DachRegel.halt(v);   // v24: KI-Cabrio steht, Dach schließt (Fahrer nicht fragen: kein „festgefahren“)
        else if (fahrer && rennen && werkstatt && (s = werkstatt.kiSteuerung(i, f, dt, rennen, schaden))) { /* 14.10. (v18): Computer-Auto fährt zur Werkstatt / steht dort */ }
        else if (fahrer && rennen) {
          const t = tn[i];
          // andere = alle Teilnehmer (die KI überspringt ihr eigenes Fahrzeug selbst)
          umgebung.andere = verkehr ? verkehr.andereFuer(polizei ? polizei.andereFuer(tn) : tn, true) : (polizei ? polizei.andereFuer(tn) : tn); umgebung.spielerFortschrittMax = spielerMax;
          umgebung.eigenerFortschritt = t.fortschritt; umgebung.laeuft = rennen.gasErlaubt;
          umgebung.rempeln = rempeln;   // Runde 6: KI ab profi darf bei 'echt' gezielt rempeln
          s = fahrer.steuerung(dt, umgebung);
          if (fahrer.brauchtReset) { this.zuruecksetzen(i); fahrer.zurueckgesetzt(f.index); return; }   // W4-I: Index aus dem Reset
          if (dachPlan && dachPlan.art === 'bremsen') s = R.DachRegel.kiBremsen(s, v, dachPlan);   // v24: KI-Cabrio bremst bis zum Haltepunkt (Lenkung vom Fahrer)
        }
        // --- Runde 7: Abschlepp-Reparatur: Mensch steht, Gas erst ab losfahrenAb (30 %) – beendet dann die Reparatur ---
        if (schaden && schaden.reparatur(i)) s = schaden.reparaturSteuerung(i, s);
        // --- 15.10. (v24): Dach klappt → das Auto steht (kein Gas, bremsen nur bis Stand); Losfahren wird verhindert bis fertig ---
        if (dl && dl.rest > 0) s = R.DachRegel.halt(v);
        // --- Runde 6 (D3): Start-Boost bewerten (Gas-Eingabe VOR der Countdown-Sperre), „Zu früh" sperrt das Gas 1 s ---
        const sb = this.startBoost;
        if (sb && !f.polizei && !f.autopilot && sb.offen(i)) {
          const ev = sb.eingabe(i, s.gas, countdown ? -rennen.countdown : rennen.zeit, f.driver ? { fehler: f.driver.fehler } : null);
          if (ev === 'boost') { this._meldung(i, 'Startboost! 🚀', 1500); if (f.istSpieler) sb.ton('boost'); }
          else if (ev === 'zufrueh') { this._meldung(i, 'Zu früh! 🐢', 1200); if (f.istSpieler) sb.ton('zufrueh'); }
        }
        if (countdown || (sb && sb.gasSperre(i))) s = { gas: 0, bremse: s.bremse, lenkung: s.lenkung };
        // --- Runde 5: Klebestreifen (world/kleber.js): festgeklebt → Eingabe ignorieren; Anlauf-Zustand (track/anlauf.js) ---
        const kz = R.Kleber && strecke && strecke.kleber && strecke.kleber.length ? (f.kleber || (f.kleber = R.Kleber.zustand())) : null;
        if (kz && R.Kleber.gesperrt(kz)) s = { gas: 0, bremse: 0, lenkung: 0 };
        const az = R.Anlauf && strecke ? (f.anlauf || (f.anlauf = R.Anlauf.zustand())) : null;
        if (az && fahrer && (!f.istSpieler || f.autopilot) && !countdown && f.nah && !(polizei && polizei.gesperrt(i))) s = R.Anlauf.kiHilfe(az, v, strecke, f.nah, s);   // KI: Anlauf nehmen
        // --- 3. Im Looping (oder beim Zurückfallen) übernimmt track/looping.js statt vehicle.schritt ---
        const lp = f.looping;
        if (lp && (lp.aktiv || lp.fallen) && strecke) {
          const erg = R.Looping.schritt(lp, v, strecke, s, dt);
          const n = strecke.abfrage(v.x, v.z, f.index);
          f.index = n.index; f.nah = n; v.untergrund = 'strasse';
          f.bremst = false;
          this._loopingEreignis(i, erg);
          return;
        }
        // --- 3. Im Flug (Sprungschanze) übernimmt track/schanze.js statt vehicle.schritt ---
        const fz = f.flug;
        if (fz && fz.aktiv && strecke) {
          const e = R.Schanzen.flugSchritt(fz, v, strecke, s, dt);
          const n = strecke.abfrage(v.x, v.z, f.index);
          f.index = n.index; f.nah = n;
          f.bremst = false;
          this._flugEreignis(i, e);
          return;
        }
        let hilfe;
        if (strecke) {
          const n = strecke.abfrage(v.x, v.z, f.index);
          f.index = n.index;
          v.untergrund = kz ? R.Kleber.untergrund(kz, n.untergrund) : n.untergrund;   // Runde 5: Schonzeit nach dem Lösen
          // Runde 6 (W1-A2): Rand → Gras/Sand weich über abseitsUebergang m (Mischfaktor aus dem Seitenabstand)
          if (v.untergrund === 'gras' || v.untergrund === 'sand') {
            const b2 = strecke.breiteBei ? strecke.breiteBei(n.s) / 2 : strecke.breite / 2;
            const ue = R.config.physik.abseitsUebergang || 1;
            v.untergrundMisch = Math.max(0, Math.min(1, (Math.abs(n.seitenabstand) - b2 - strecke.randBreite) / ue));
          } else v.untergrundMisch = undefined;
          // 14.10. (v18): Werkstatt – auf der Parkfläche Asphalt, auf der Zufahrt Randstreifen statt Gras (kein Bremsen beim Anhalten)
          if (werkstatt) { const wu = werkstatt.untergrund(v, n); if (wu) { v.untergrund = wu; v.untergrundMisch = undefined; } }
          // Runde 6 (W3-H): dynamisch gelegte Ölflecken wirken wie das Hindernis „Ölfleck" (Schild fängt sie ab)
          if (pickups && v.untergrund === 'strasse' && pickups.oel.length && pickups.oelWirkt(i, v)) v.untergrund = 'oel';
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
        // --- 4. Turbo-Faktoren nur für diesen Aufruf (danach exakt zurück) + 5. vehicle.schritt ---
        const xAlt = v.x, zAlt = v.z;
        const fk = pickups ? pickups.faktoren(i) : null, dd = v.daten;
        const fs = sb ? sb.faktoren(i) : null;           // Runde 6: Start-Boost multipliziert zusätzlich (beide nacheinander)
        const dfk = dl && !schaden && dl.gesund < 100 ? R.DachRegel.faktoren(dl) : null;   // v24: Nässe-Schaden ohne Schadensystem (Stufen-Faktoren)
        const fvm = (fk ? fk.vMax : 1) * (fs ? fs.vMax : 1) * (dfk ? dfk.vMax : 1), fbe = (fk ? fk.beschleunigung : 1) * (fs ? fs.beschleunigung : 1) * (dfk ? dfk.beschleunigung : 1);
        const turbo = fvm !== 1 || fbe !== 1;
        const vm0 = dd.vMax, b0 = dd.beschleunigung;
        if (turbo) { dd.vMax = vm0 * fvm; dd.beschleunigung = b0 * fbe; }
        v.schritt(dt, s, hilfe, this.wetter ? this.wetter.umwelt() : undefined);
        if (turbo) { dd.vMax = vm0; dd.beschleunigung = b0; }
        f.bremst = v.letzteSteuerung.bremse > 0 && v.vLaengs > 0.5;
        // --- 6a. Runde 5: Anlauf-Bremse vor Looping/Schanze (VOR Rampe/Einfahrt), KI stellt sich nach kiWarten s selbst
        //         auf die Anlaufposition; Klebestreifen (kleben/lösen) ---
        if (az && f.nah) {
          this._anlaufEreignis(i, R.Anlauf.nachSchritt(az, v, strecke, f.nah, xAlt, zAlt, s, dt));
          if ((!f.istSpieler || f.autopilot) && R.Anlauf.aktiv(az) && az.stehZeit > ((R.config.anlauf && R.config.anlauf.kiWarten) || 2)) {
            this._zurAnlauf(i); return;
          }
        }
        if (kz && f.nah) this._kleberEreignis(i, R.Kleber.nachSchritt(kz, v, strecke, f.nah, dt));
        if (az && az.bremst && v.vLaengs > 0.5) f.bremst = true;          // Bremslicht, solange die Anlauf-Bremse wirkt
        // --- 6. Schanze: Rampe hochfahren / Absprung (f.nah = Abfrage VOR dem Schritt) ---
        if (fz && strecke && f.nah) this._flugEreignis(i, R.Schanzen.nachSchritt(fz, v, strecke, f.nah, xAlt, zAlt, dt));
        // Looping-Einfahrt: s vorwärts überquert? (Bogenlänge nach dem Schritt aus der Verschiebung längs der Tangente)
        if (lp && strecke && strecke.loopings.length && f.nah) {
          const n = f.nah, pt = strecke.spline.punktBei(n.s), dx = v.x - xAlt, dz = v.z - zAlt;
          const erg = R.Looping.einfahrt(lp, v, strecke, n.s, n.s + dx * pt.tx + dz * pt.tz, n.seitenabstand + dx * pt.nx + dz * pt.nz);
          this._loopingEreignis(i, erg);
        }
      });

      // --- 8. Kollisionen nach allen Fahrzeug-Schritten ---
      this._physikZeit = (this._physikZeit || 0) + dt;
      const bandeSt = this._bandeSt || (this._bandeSt = []);
      bandeSt.length = this.fahrzeuge.length;
      for (let i = 0; i < this.fahrzeuge.length; i++) bandeSt[i] = strecke && !this.fahrzeuge[i].ausgeschieden ? R.Kollisionen.bande(this.fahrzeuge[i].vehicle, strecke) : 0;
      // Runde 6: Auto-Auto (Rechtecke, 2 Teilschritte, Mindestabstand); wer dabei bewegt wurde, prüft die Bande
      // nochmal (ein Auto an der Bande gilt beim Trennen als 10× so schwer → das andere weicht aus)
      const kxAlt = this._kollX || (this._kollX = []);
      for (let i = 0; i < this.fahrzeuge.length; i++) { const v = this.fahrzeuge[i].vehicle; kxAlt[2 * i] = v.x; kxAlt[2 * i + 1] = v.z; }
      this.stoesse = R.Kollisionen.autoAuto(this.fahrzeuge, { countdown, rempeln, dt });
      if (strecke && this.stoesse.length) {
        for (let i = 0; i < this.fahrzeuge.length; i++) {
          const v = this.fahrzeuge[i].vehicle;
          if (v.x !== kxAlt[2 * i] || v.z !== kxAlt[2 * i + 1]) bandeSt[i] = Math.max(bandeSt[i], R.Kollisionen.bande(v, strecke));
        }
      }
      if (strecke && R.Kollisionen.loopingAbstand) R.Kollisionen.loopingAbstand(this.fahrzeuge, strecke);   // Runde 6
      for (let k = 0; k < this.stoesse.length; k++) {
        const st = this.stoesse[k];
        if (st.dreht) st.dreht.forEach((d, w) => { if (d) this._meldung(w ? st.b : st.a, 'Dreher! 🌀', 900); });
      }
      // Runde 6 (W1-A5): Bäume/Felsen (fest) und Büsche (weich) zwischen Straße und Zaun
      const ps = strecke && R.Kollisionen.pflanzen ? R.Kollisionen.pflanzen(this.fahrzeuge, strecke, { dt, countdown }) : [];
      for (let k = 0; k < ps.length; k++) {
        const f = this.fahrzeuge[ps[k].nr];
        if (!f || !f.istSpieler) continue;
        if (ps[k].typ === 'baum') {
          if (R.Audio) R.Audio.kollision(Math.min(12, ps[k].staerke));
          this.kameras.forEach((kam) => { if (kam.ziel === f.vehicle) kam.wackeln(Math.min(8, Math.max(3, ps[k].staerke))); });
          this._meldung(ps[k].nr, 'Bumm! 🌳', 900);
        }
      }
      this.pflanzenStoesse = ps;
      // Hindernisse (Pylonen, Bake, Ast, Wracks): Stöße wie Auto-Auto (Ton + Kamerawackeln für Spieler)
      let schild = !!pickups && pickups.vorTreffern(this.fahrzeuge) > 0;
      let hs = strecke ? R.Kollisionen.hindernisse(this.fahrzeuge, strecke, { dt, zeit: this._physikZeit, countdown }) : [];
      if (schild) hs = pickups.nachTreffern(this.fahrzeuge, hs);
      for (let k = 0; k < hs.length; k++) {
        const f = this.fahrzeuge[hs[k].nr];
        if (!f || !f.istSpieler) continue;
        if (R.Audio && hs[k].staerke >= 1.5) R.Audio.kollision(Math.min(12, hs[k].staerke));
        if (hs[k].staerke >= 3) this.kameras.forEach((kam) => { if (kam.ziel === f.vehicle) kam.wackeln(Math.min(8, hs[k].staerke)); });
        if (hs[k].typ === 'brand') this._meldung(hs[k].nr, hs[k].lava ? 'Lava! Heiß! 🔥' : 'Heiß! 🔥', 1000);
        if (hs[k].typ === 'krater') this._meldung(hs[k].nr, 'Krater! 🕳️', 1000);   // Runde 6 (W2-C)
      }
      // Runde 6 (W2-C): Lava-Kontakt qualmt (alle Autos)
      if (this.dynamik && this.dynamik.rauchAn) for (let k = 0; k < hs.length; k++) if (hs[k].lava) this.dynamik.rauchAn(hs[k].x, strecke.hoeheAn(hs[k].x, hs[k].z) + 0.4, hs[k].z, 8, 0x9a9490, 0.9);
      this.hindernisStoesse = hs;
      // Fantasie: Bälle und Wasserstrahlen, Runde 4: Strohballen (nur wenn das Rennen läuft)
      let ds = null;
      if (this.dynamik && rennen && rennen.gasErlaubt) {
        let fuehrend = spielerMax;
        if (fuehrend === null) for (let i = 0; i < tn.length; i++) if (fuehrend === null || tn[i].fortschritt > fuehrend) fuehrend = tn[i].fortschritt;
        // Runde 6 (W2-C): Autos für den Flugsaurier (vorderstes Spieler-Auto)
        const autos = this._dynAutos || (this._dynAutos = []);
        autos.length = this.fahrzeuge.length;
        for (let i = 0; i < this.fahrzeuge.length; i++) {
          const f = this.fahrzeuge[i];
          autos[i] = f.polizei || f.ausgeschieden ? null : { vehicle: f.vehicle, istSpieler: !!f.istSpieler, fortschritt: tn[i] ? tn[i].fortschritt : 0 };
        }
        const e = this.dynamik.schritt(dt, { fortschritt: fuehrend === null ? 0 : fuehrend, runden: rennen.runden, autos });
        if (e.baelleKommen) this.fahrzeuge.forEach((f, i) => this._meldung(i, '⚠️ Bälle kommen!', 2500));
        if (e.ereignisse && e.ereignisse.length) this._dinoEreignisse(e.ereignisse);
        // W2-C1: Krater entstanden/verschwunden → Computerfahrer (KI, Autopilot, Polizei) kennen die neue Liste
        if ((this.dynamik.hindernisVersion || 0) !== (this._hindernisVersion || 0)) {
          this._hindernisVersion = this.dynamik.hindernisVersion || 0;
          for (const f of this.fahrzeuge) for (const d of [f.driver, f.autopilot, f.polizeiFahrer]) {
            if (d && typeof d.hindernisseSetzen === 'function') d.hindernisseSetzen(this.strecke.hindernisse);
          }
        }
        schild = !!pickups && pickups.vorTreffern(this.fahrzeuge) > 0;
        ds = this.dynamik.kollisionen(this.fahrzeuge);
        if (schild) ds = pickups.nachTreffern(this.fahrzeuge, ds);
        for (let k = 0; k < ds.length; k++) {
          const f = this.fahrzeuge[ds[k].nr];
          if (!f || !f.istSpieler) continue;
          if (R.Audio) R.Audio.kollision(Math.min(12, ds[k].staerke));
          this.kameras.forEach((kam) => { if (kam.ziel === f.vehicle) kam.wackeln(Math.min(8, Math.max(4, ds[k].staerke))); });
          // Runde 5b: Dino (Dino-Strecke) und Felsbrocken (Strohballen mit Felsoptik)
          const T = { ball: 'Bumm! ⚽', stroh: 'Stroh! 🌾', dino: 'Dino! 🦕', fels: 'Steinschlag! 🪨', reh: 'Reh! 🦌', baer: 'Bär! 🐻' };
          this._meldung(ds[k].nr, T[ds[k].typ] || 'Platsch! 💦', 1000);
          if (ds[k].brummen && R.Audio && R.Audio.baerBrummen) R.Audio.baerBrummen(1);   // Runde 6 (W2-C)
          if (ds[k].typ === 'reh' && R.Audio && R.Audio.rehRuf) R.Audio.rehRuf(1);         // W2-C2
        }
        this.dynamikStoesse = ds;
      }
      if (R.Audio) this.stoesse.forEach((st) => {
        if (st.staerke >= 1.5 && (this.fahrzeuge[st.a].istSpieler || this.fahrzeuge[st.b].istSpieler)) R.Audio.kollision(st.staerke);
      });
      this.stoesse.forEach((st) => {
        if (st.staerke < 3) return;
        this.kameras.forEach((k) => {
          if (k.ziel === this.fahrzeuge[st.a].vehicle || k.ziel === this.fahrzeuge[st.b].vehicle) k.wackeln(st.staerke);
        });
      });

      // --- 9. Schaden: Schild fängt zählende Bande-/Auto-Treffer ab, dann auswerten + Logik-Uhr ---
      if (schaden) {
        if (pickups) {
          const fang = (i, art, st) => {
            if (pickups.hatSchild(i) && schaden.zaehlt(i, art, st) && pickups.schildVerbrauchen(i)) schaden.abfangen(i);
          };
          for (let i = 0; i < bandeSt.length; i++) if (bandeSt[i] > 0) fang(i, 'bande', bandeSt[i]);
          for (let k = 0; k < this.stoesse.length; k++) { const st = this.stoesse[k]; fang(st.a, 'auto', st.staerke); fang(st.b, 'auto', st.staerke); }
        }
        if (verkehr) for (let k = 0; k < this.stoesse.length; k++) this.stoesse[k].faktor = verkehr.schadenFaktor(this.stoesse[k]);   // 15.10. (v25): Krankenwagen 3× Schaden
        schaden.stoesseAuswerten({ bande: bandeSt, auto: this.stoesse, hindernis: hs, dynamik: ds || [], pflanzen: ps });
        schaden.schritt(dt);
        if (werkstatt && (!rennen || rennen.gasErlaubt)) werkstatt.schritt(dt, this.fahrzeuge, schaden, rennen);   // 14.10. (v18): +15 %/s im Stand
      }

      // --- 10. Pickups: zuerst geplatzte Schilde dieses Schritts melden (schritt() leert die Liste), dann Felder/Kugeln
      //         (erst ab Rennfreigabe – kein Turbo im Countdown) ---
      if (pickups && (!rennen || rennen.gasErlaubt)) {
        const pfz = polizei ? polizei.rennListe : verkehr ? verkehr.rennListe : this.fahrzeuge;   // Runde 5b: Polizei sammelt nichts ein
        for (let k = 0; k < pickups.geplatzt.length; k++) {
          const g = pickups.geplatzt[k];
          this._meldung(g.nr, 'Schild weg! 💥', 1000);
          if (this.fahrzeuge[g.nr] && this.fahrzeuge[g.nr].istSpieler) pickups.ton('platzen');
        }
        for (let k = 0; k < pickups.rutscher.length; k++) {      // W3-H: in einen Ölfleck gefahren
          const g = pickups.rutscher[k];
          this._meldung(g.nr, 'Öl! 🛢️', 900);
          if (this.fahrzeuge[g.nr] && this.fahrzeuge[g.nr].istSpieler) pickups.ton('oelRutsch');
        }
        const ev = pickups.schritt(dt, pfz);
        for (let k = 0; k < ev.length; k++) {
          const e = ev[k], spieler = this.fahrzeuge[e.nr] && this.fahrzeuge[e.nr].istSpieler;
          if (e.typ === 'oel') { this._meldung(e.nr, 'Öl-Fass! 🛢️ (' + (spieler && this.fahrzeuge[e.nr].spielerNr === 1 ? 'E' : 'Leertaste') + ')', 1400); if (spieler) pickups.ton('oelAuf'); }
          else if (e.typ === 'oelGelegt') { /* KI legt Öl: keine Meldung, Überraschung */ }
          else if (e.typ === 'turbo') { this._meldung(e.nr, 'TURBO! 🔥', 1200); if (spieler) pickups.ton('turbo'); }
          else if (e.typ === 'schildPlus') {      // 14.10. (v22): zweite Kugel bei vorhandenem Schild → Schild bleibt, Gesundheit +10 Prozentpunkte
            const plus = this.schaden && this.schaden.an ? this.schaden.heilen(e.nr, ((R.config.stunt && R.config.stunt.schild) || {}).zweiteHeilung === undefined ? 10 : R.config.stunt.schild.zweiteHeilung) : 0;
            this._meldung(e.nr, plus > 0 ? '🛡️ +' + plus + ' % 🔧' : '🛡️ Schild bleibt', 1200);
            if (spieler) pickups.ton('schild');
          }
          else { this._meldung(e.nr, 'Schutzschild! 🛡️', 1200); if (spieler) pickups.ton('schild'); }
        }
      }

      // --- 10b. Runde 6 (W3-G): Münzen einsammeln (keine Physik). Spieler: sofort aufs Garage-Konto + Ton + HUD „+1";
      //          KI sammelt nebenbei (Münze weg, zählt nicht). Polizei sammelt nichts.
      if (this.muenzen && (!rennen || rennen.gasErlaubt)) {
        const ev = this.muenzen.schritt(dt, this.fahrzeuge);
        for (let k = 0; k < ev.length; k++) {
          const f = this.fahrzeuge[ev[k].nr];
          if (!f || !f.istSpieler) continue;
          const t = rennen && rennen.teilnehmer[ev[k].nr];
          if (R.Garage && t) R.Garage.gutschreiben(t.name, 1);
          const hd = this.huds[f.spielerNr];
          if (hd && hd.muenzenSetzen) hd.muenzenSetzen(this.muenzen.anzahlVon(ev[k].nr), 1);
          this.muenzen.ton();
        }
      }

      // --- 11. Höhe (Rampe/Flug/Straße + Ast-Hüpfer), Feststecken, Rennleitung ---
      // W4-J: Spieler nähert sich einer Kreuzung, auf der anderen Seite kommt jemand → einmal je Zufahrt warnen
      const kreuz = strecke && strecke.kreuzungen && strecke.kreuzungen.length && rennen && rennen.gasErlaubt ? strecke : null;
      if (kreuz) kreuz.kreuzungWarnung(this.fahrzeuge);
      this.fahrzeuge.forEach((f, i) => {
        if (f.ausgeschieden) return;          // W3-F
        const v = f.vehicle;
        if (kreuz && f.istSpieler && f.nah) {
          const kb = kreuz.kreuzungBei(f.nah.s, 55);
          if (kb && kb.d < -8 && (kb.pass === 'a' ? kb.k.warnA : kb.k.warnB)) {
            const schl = kb.pass + Math.round(kb.k.sA);
            if (f.kreuzGewarnt !== schl) { f.kreuzGewarnt = schl; this._meldung(i, '🚦 Achtung Kreuzung!\nLinks und rechts schauen!', 1800); }
          } else if (!kb) f.kreuzGewarnt = null;
        }
        // W4-I: mit dem eigenen Streckenindex (Index-Kontinuität) – an einer Überführung bleibt das Auto auf seiner Ebene
        if (strecke && !v.imLooping) v.y = f.flug ? R.Schanzen.hoehe(f.flug, v, strecke, f.index) : strecke.hoeheAn(v.x, v.z, f.index);
        // Hüpfer (Ast): kleine Sprungbewegung, nur Optik
        if (v.huepfer) { f.hoppV = v.huepfer; v.huepfer = 0; f.hoppY = f.hoppY || 0; }
        if (f.hoppV || f.hoppY > 0) {
          f.hoppV -= 9.81 * dt; f.hoppY += f.hoppV * dt;
          if (f.hoppY <= 0) { f.hoppY = 0; f.hoppV = 0; }
          v.y += f.hoppY;
        }
        this._feststeckenPruefen(f, dt, countdown);
      });
      // 14.10. (v22): Doppeltipp Rückwärts während des Polizei-Stopps = freikaufen (10 Münzen). Jeden Schritt abfragen (Flag verfällt sonst nicht).
      if (polizei && rennen && this.input && this.input.rueckwaertsDoppel) {
        for (let i = 0; i < this.fahrzeuge.length; i++) {
          const f = this.fahrzeuge[i];
          if (f.istSpieler && !f.autopilot && f.spielerNr >= 0 && this.input.rueckwaertsDoppel(f.spielerNr) && rennen.gasErlaubt && polizei.gesperrt(i)) this.polizeiFreikaufen(i);
        }
      }
      if (verkehr && rennen) verkehr.schritt(dt, rennen.gasErlaubt);   // 15.10. (v25): Auftritte, Spurwechsel, Hupe
      if (polizei && rennen) polizei.schritt(dt, rennen.gasErlaubt);   // Runde 5b: Ziel, Nähe, Anhalten, Freigabe
      if (rennen) rennen.schritt(dt);
      if (rennen && strecke && strecke.kreuzungen && strecke.kreuzungen.length) this._abbiegenPruefen();   // 13.10. (v16): falsch abgebogen
      if (this.startBoost && rennen && rennen.gasErlaubt) this.startBoost.schritt(dt);
    }

    /**
     * 13.10. (v16): Falsch auf der Kreuzung abgebogen (raceManager: t.abgebogen / t.abbiegeReset). Meldung für Kinder beim
     * Abbiegen; läuft die Frist ab (zurück zur Kreuzung nicht geschafft oder davongefahren), Reset an den letzten Checkpoint
     * (zuruecksetzen – dieselbe Logik wie R/Abschleppen/KI-Reset inkl. Anlaufposition). Pollt die Flags statt Callbacks,
     * damit es lokal und im Server-Spiel (ohne streckeAufbauen) gleich läuft.
     */
    _abbiegenPruefen() {
      const tn = this.rennen.teilnehmer;
      for (let i = 0; i < tn.length; i++) {
        const t = tn[i], f = this.fahrzeuge[i];
        if (!f || f.ausgeschieden) continue;
        if (t.abbiegeReset) {
          this.zuruecksetzen(i);
          const fahrer = f.driver || f.autopilot;
          if (fahrer && fahrer.zurueckgesetzt) fahrer.zurueckgesetzt(f.index);
          f.abgebogenGemeldet = false;
          this._meldung(i, '↩️ Zurückgesetzt!\nZurück auf die Strecke', 2200);
        } else if (t.abgebogen) {
          if (!f.abgebogenGemeldet) { f.abgebogenGemeldet = true; this._meldung(i, '↩️ Falsch abgebogen!\nZurück zur Kreuzung', 3400); }
        } else f.abgebogenGemeldet = false;
      }
    }

    /** Runde 4: Schanzen-Ereignis eines Fahrzeugs: Meldung, Kamerawackeln + Aufsetz-Geräusch bei der Landung. */
    _flugEreignis(i, e) {
      if (!e) return;
      const f = this.fahrzeuge[i];
      if (e === 'zuLangsam') { this._anlaufEreignis(i, 'zuLangsam'); return; }   // Runde 5: Notstopp vor der Rampe
      if (e === 'sprung') this._meldung(i, 'Sprung! ✈️', 1300);
      else if (e === 'landung' || e === 'landungSchraeg') {
        if (f.istSpieler) {
          const w = (R.config.stunt && R.config.stunt.schanze && R.config.stunt.schanze.kameraWackeln) || 2.5;
          this.kameras.forEach((k) => { if (k.ziel === f.vehicle) k.wackeln(w); });
          if (R.Audio) R.Audio.kollision(Math.min(6, 2 + f.flug.landeStaerke / 2));
        }
        if (e === 'landungSchraeg') this._meldung(i, 'Rumms! 😬', 1000);
      }
    }

    /**
     * Runde 5 (M6): Anlauf-Ereignis (track/anlauf.js): 'zuLangsam' (Bremse greift / Notstopp) und 'gestoppt'
     * (steht an der Linie) → HUD „Zu langsam! Zurück und Anlauf nehmen – oder R: Anlaufposition" (Spieler 2: T).
     */
    _anlaufEreignis(i, e) {
      if (e !== 'zuLangsam' && e !== 'gestoppt') return;
      const f = this.fahrzeuge[i];
      if (!f || !f.istSpieler) return;
      const T = R.config.tasten, code = f.spielerNr === 1 ? T.resetSpieler2 : T.resetSpieler1;
      const taste = String(code || '').replace(/^Key/, '') || (f.spielerNr === 1 ? 'T' : 'R');
      this._meldung(i, 'Zu langsam! 🐢\nZurück und Anlauf nehmen – oder ' + taste + ': Anlaufposition', 3500);
    }

    /** Runde 5 (M6): Fahrzeug i auf die Anlaufposition vor dem Looping/der Schanze setzen (Tempo 0). */
    _zurAnlauf(i) {
      const f = this.fahrzeuge[i];
      if (!f || f.ausgeschieden || !this.strecke || !R.Anlauf || !R.Anlauf.aktiv(f.anlauf)) return false;
      if (f.looping && (f.looping.aktiv || f.looping.fallen)) { f.looping.aktiv = false; f.looping.fallen = false; f.vehicle.imLooping = false; }
      if (f.flug) R.Schanzen.abbrechen(f.flug, f.vehicle);
      if (f.kleber) { R.Kleber.abbrechen(f.kleber); R.Kleber.optik(f, false); }
      const pose = R.Anlauf.zurAnlaufposition(f.anlauf, f.vehicle, this.strecke, this.fahrzeuge);
      if (!pose) return false;
      if (this.rennen && !f.polizei) this.rennen.verfolgungSetzen(i, pose.x, pose.z);
      this._vorherAngleichen(f);
      f.index = -1;
      f.stehZeit = 0; f.resetHinweis = false; f.falschHerum = false; f.falschZeit = 0;
      if (f.driver && f.driver.zurueckgesetzt) f.driver.zurueckgesetzt();
      if (f.polizeiFahrer) f.polizeiFahrer.zurueckgesetzt();
      if (f.autopilot && f.autopilot.zurueckgesetzt) f.autopilot.zurueckgesetzt();
      this._meldung(i, 'Anlauf! Jetzt Vollgas! 🚀', 2000);
      return true;
    }

    /** Runde 5: Klebestreifen-Ereignis (world/kleber.js): Meldung + Kleber-Optik am Auto. */
    _kleberEreignis(i, e) {
      if (!e) return;
      const f = this.fahrzeuge[i];
      if (e.typ === 'klebt') {
        R.Kleber.optik(f, true);
        this._meldung(i, 'Festgeklebt! 🍯 ' + e.rest + ' s', 1100);
        if (R.Audio && f.istSpieler && R.Audio.kollision) R.Audio.kollision(2);
      } else if (e.typ === 'tick') {
        this._meldung(i, 'Festgeklebt! 🍯 ' + e.rest + ' s', 1100);
      } else if (e.typ === 'geloest') {
        R.Kleber.optik(f, false);
        this._meldung(i, 'Gelöst! 💨', 1300);
      }
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
      const abseits = n.abstand > (st.breiteBei ? st.breiteBei(n.s) : st.breite) / 2 + st.randBreite;
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
      if (this.zustand === 'online') { if (this.online) this.online.reset(); return; }   // W5: online setzt der Server zurück
      const i = this.fahrzeuge.findIndex(f => f.istSpieler && f.spielerNr === nr);
      // 15.10. (v23): gesperrte Fälle sagen im HUD, warum R gerade nicht geht (vorher still: der Vater drückte R, „es ging nicht“)
      if (i >= 0 && this.schaden && this.schaden.gesperrt(i)) {   // liegengeblieben: der Abschleppwagen kommt gleich
        const z = this.schaden.zustand ? this.schaden.zustand(i) : null, rest = z && z.rest > 0 ? Math.ceil(z.rest - 1e-6) : 0;
        this._meldung(i, '🛻 Abschleppwagen kommt gleich' + (rest > 0 ? ' – noch ' + rest + ' s' : ''), 1500);
        return;
      }
      if (i >= 0 && this.fahrzeuge[i].kleber && R.Kleber.gesperrt(this.fahrzeuge[i].kleber)) { this._meldung(i, '🍯 Festgeklebt – gleich bist du frei', 1500); return; }   // Runde 5: festgeklebt
      if (i >= 0 && this.polizei && this.polizei.gesperrt(i)) {      // von der Polizei angehalten: R wäre ein Ausreißen – warten oder freikaufen
        const kosten = this.polizei.c && this.polizei.c.freikaufKosten > 0 ? this.polizei.c.freikaufKosten : 0;
        this._meldung(i, '🚨 Polizei – warten oder 2× ' + (nr === 1 ? 'S' : '↓') + (kosten ? ' (' + kosten + ' 🪙)' : ''), 1800);
        return;
      }
      // Runde 5 (M6): vor Looping/Schanze gestoppt → Anlaufposition statt letztem Checkpoint
      if (i >= 0 && R.Anlauf && R.Anlauf.aktiv(this.fahrzeuge[i].anlauf) && this._zurAnlauf(i)) return;
      if (i >= 0) this.zuruecksetzen(i);
    }

    /**
     * Fahrzeug i zurück auf die Strecke (letzter Checkpoint bzw. Startplatz).
     * Ist dort ein anderes Auto im Umkreis von 6 m, wird jeweils 8 m weiter
     * hinten auf der Strecke gesucht.
     */
    zuruecksetzen(i) {
      const f = this.fahrzeuge[i];
      if (!f || !this.rennen || f.ausgeschieden) return;     // W3-F: ausgeschiedene Autos bleiben geparkt
      const sp = this.strecke.spline;
      let pose = this.rennen.resetPose(i);
      // 13.10. (v16): Reset-Stelle im Anlaufbereich eines Loopings/einer Schanze → gleich auf die Anlaufposition (sonst Anlauf-Bremse,
      // die KI wartet 2 s und setzt sich nochmal zurück, der Spieler muss R drücken). Nicht vor dem ersten Checkpoint (Startaufstellung).
      let schwung = 0;
      const tr = this.rennen.teilnehmer[i];
      if (R.Anlauf && R.Anlauf.resetPosition && tr && tr.letzterCheckpoint >= 0 && pose.s !== undefined) {
        const ap = R.Anlauf.resetPosition(this.strecke, pose.s, this.fahrzeuge, f.vehicle);
        if (ap) { pose = ap; schwung = ap.tempo || 0; this.rennen.verfolgungSetzen(i, pose.x, pose.z, pose.s); }
      }
      // W4-I: Streckenindex aus dem Checkpoint (s) – an einer Überführung sonst evtl. die falsche Ebene
      const hinweis = () => (pose.s !== undefined ? sp.indexBei(pose.s) : undefined);
      const frei = (x, z) => this.fahrzeuge.every((g, j) => j === i || Math.hypot(g.vehicle.x - x, g.vehicle.z - z) >= 6);
      if (!frei(pose.x, pose.z)) {
        const n = sp.naechster(pose.x, pose.z, hinweis());
        for (let k = 1; k <= 12; k++) {
          const p = sp.punktBei(n.s - 8 * k);
          if (k < 12 && this.strecke.kreuzungNah && this.strecke.kreuzungNah(p.s, 6)) continue;   // W4-J: nicht mitten auf die Kreuzung
          const qq = this.strecke.gabelQ ? this.strecke.gabelQ(p.s, n.s, n.seitenabstand) : n.seitenabstand;   // 14.10. (v18): Gabelung – auf dem Ast bleiben
          const x = p.x + p.nx * qq, z = p.z + p.nz * qq;
          if (frei(x, z) || k === 12) { pose = { x, z, heading: R.headingAus(p.tx, p.tz), s: p.s }; break; }
        }
        this.rennen.verfolgungSetzen(i, pose.x, pose.z, pose.s);
      }
      // Nicht direkt vor/in eine Baustelle, einen Ast oder ein Wrack setzen: dann auf die freie Fahrbahnhälfte
      const nr = sp.naechster(pose.x, pose.z, hinweis());
      for (const h of this.strecke.hindernisse) {
        if (!h.seite || (h.typ !== 'baustelle' && h.typ !== 'ast' && h.typ !== 'wrack' && h.typ !== 'brand' && h.typ !== 'lava')) continue;
        const d = sp.differenzS(nr.s, h.s0);
        if (d > -30 && d < h.laenge + 2) {
          const b = this.strecke.breiteBei ? this.strecke.breiteBei(nr.s) : this.strecke.breite;   // Runde 4: Spuren
          const p = sp.punktBei(nr.s), q = -h.seite * b / 4;
          pose = { x: p.x + p.nx * q, z: p.z + p.nz * q, heading: R.headingAus(p.tx, p.tz), s: nr.s };
        }
      }
      if (f.looping && (f.looping.aktiv || f.looping.fallen)) { f.looping.aktiv = false; f.looping.fallen = false; f.vehicle.imLooping = false; }
      if (f.flug) R.Schanzen.abbrechen(f.flug, f.vehicle);   // Runde 4: Flug/Rampe abbrechen (sonst landet es am alten Ort)
      if (f.kleber) { R.Kleber.abbrechen(f.kleber); R.Kleber.optik(f, false); }   // Runde 5: Kleber lösen
      if (f.anlauf) f.anlauf = R.Anlauf.zustand();                                // Runde 5: Anlauf-Bremse aus
      f.vehicle.setzen(pose.x, pose.z, pose.heading);
      if (schwung > 0) f.vehicle.vLaengs = schwung;   // 13.10.: Start-Schwung, falls der volle Anlauf nicht zurück passt
      const idx = hinweis();
      f.vehicle.y = this.strecke.hoeheAn(pose.x, pose.z, idx);
      this._vorherAngleichen(f);
      f.index = idx !== undefined ? idx : -1;      // W4-I: Index-Kontinuität ab dem Reset
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
        this._tunnelDimmen(ks.length ? 0 : -1);
        r.setScissorTest(false);
        r.setViewport(0, 0, w, h);
        r.render(this.szene, ks.length ? ks[0].kamera : this.menueKamera);
        if (ks.length && R.rueckspiegel) R.rueckspiegel.zeichnen(this, 0, 0, w, h);   // 14.10. (v21): Rückspiegel
        return;
      }
      // Split-Screen: eine Szene, zwei Kameras, je eine Bildhälfte (links Spieler 1, rechts Spieler 2)
      const links = Math.floor(w / 2);
      r.setScissorTest(true);
      ks.forEach((k, i) => {
        const x = i === 0 ? 0 : links, breite = i === 0 ? links : w - links;
        r.setViewport(x, 0, breite, h);
        r.setScissor(x, 0, breite, h);
        this._tunnelDimmen(i);
        r.render(this.szene, k.kamera);
        if (R.rueckspiegel) R.rueckspiegel.zeichnen(this, i, x, breite, h);   // 14.10. (v21): Rückspiegel (Zweispieler nur wenn config.cockpit.spiegel.zweispieler = 'an')
      });
      r.setScissorTest(false);
    }

    // ---------- Tunnel: Licht ----------
    /**
     * Tunnel-Lichter (nur auf Strecken mit Tunnel): 3 Punktlichter (an den 3 Deckenlampen, die einer
     * Kamera im Tunnel am nächsten sind) + 2 Spots als Scheinwerfer (Solo: links/rechts am Spielerauto,
     * zu zweit: je einer pro Spielerauto). Außerhalb des Tunnels unsichtbar (visible = false → der
     * Shader rechnet sie nicht). Nie mehr als 3 Punkt- + 2 Spotlichter.
     */
    _tunnelLichterAnlegen() {
      const L = { punkte: [], spots: [] };
      for (let i = 0; i < 3; i++) {
        const l = new THREE.PointLight(0xffd8a0, 18, 20, 1.6);
        l.userData.tunnelLicht = true; l.visible = false; l.name = 'Tunnellampe';
        this.szene.add(l); L.punkte.push(l);
      }
      for (let i = 0; i < 2; i++) {
        const s = new THREE.SpotLight(0xfff2d8, 900, 75, 0.42, 0.5, 1.3);
        s.userData.tunnelLicht = true; s.visible = false; s.name = 'Scheinwerfer';
        s.target.name = 'ScheinwerferZiel';
        this.szene.add(s); this.szene.add(s.target); L.spots.push(s);
      }
      L.kamIndex = [-1, -1, -1]; L.dunkel = [0, 0, 0];
      // Runde 6 (W2-D): Nacht – Scheinwerfer dauerhaft an, Punktlichter an den nächsten Straßenlaternen (außerhalb
      // des Tunnels). Lichter bleiben immer sichtbar (visible = true, unbenutzt: intensity 0) → Lichterzahl konstant,
      // kein Shader-Neuübersetzen. Budget bleibt 3 Punkt- + 2 Spotlichter.
      const tz = this.tageszeitDaten;
      L.nacht = !!(tz && tz.echteScheinwerfer);
      L.laterne = L.nacht ? Object.assign({ farbe: 0xffd08a, licht: 70, reichweite: 28, abfall: 1.5, punktlichter: 3 }, tz.laterne) : null;
      if (L.nacht) L.punkte.concat(L.spots).forEach((l) => { l.userData.basis = l.intensity; l.visible = true; l.intensity = 0; });
      this.tunnelLichter = L;
    }

    /** Runde 6: Licht schalten – tagsüber visible, nachts immer sichtbar und über die Intensität (0 = aus). */
    _lichtSchalten(l, an) {
      if (!this.tunnelLichter.nacht) { l.visible = an; return; }
      l.visible = true;
      l.intensity = an ? l.userData.basis : 0;
    }

    /** Shader einmal mit eingeschalteten Tunnel-Lichtern übersetzen (kein Ruckler bei der ersten Einfahrt). */
    _tunnelLichterVorkompilieren() {
      const L = this.tunnelLichter;
      if (!L || !this.renderer.compile) return;
      L.punkte.concat(L.spots).forEach(l => { l.visible = true; });
      try { this.renderer.compile(this.szene, this.kameras[0] ? this.kameras[0].kamera : this.menueKamera); } catch (e) { /* egal */ }
      L.punkte.concat(L.spots).forEach(l => { l.visible = !!L.nacht; });     // Runde 6: nachts bleiben sie sichtbar
    }

    /** Je Frame: Spots an die Spielerautos, Punktlichter an die nächsten Lampen, Dunkel-Faktor je Kamera. */
    _tunnelLichterAktualisieren() {
      const L = this.tunnelLichter, st = this.strecke, sp = st.spline;
      // Kameras: im Tunnel? (Dunkel-Faktor 0 außen … 1 ab 18 m tief drin)
      const kams = this.zustand === 'menue' ? [this.menueKamera] : this.kameras.map(k => k.kamera);
      let refX = 0, refZ = 0, refAn = false, bestD = Infinity;
      for (let i = 0; i < 3; i++) L.dunkel[i] = 0;
      for (let i = 0; i < kams.length; i++) {
        const c = kams[i].position, n = sp.naechster(c.x, c.z, L.kamIndex[i] >= 0 ? L.kamIndex[i] : undefined);
        L.kamIndex[i] = n.index;
        const t = st.tunnelBei(n.s, 2);
        if (!t || Math.abs(n.seitenabstand) > st.grenzeEng + 0.5 || c.y > st.hoeheAn(c.x, c.z) + 6.4) continue;
        const tief = Math.min(sp.differenzS(n.s, t.s0), sp.differenzS(t.s1, n.s));
        L.dunkel[this.zustand === 'menue' ? 2 : i] = Math.max(0, Math.min(1, (tief + 2) / 18));
        refAn = true;
        // Punktlichter: Lampen nahe der Kamera, die am tiefsten drin ist
        if (-tief < bestD) { bestD = -tief; refX = c.x; refZ = c.z; }
      }
      // Punktlichter an die 3 nächsten Lampen
      const lampen = st.tunnelLampen || [];
      if (refAn && lampen.length) {
        const nah = this._lampenNah || (this._lampenNah = []);
        nah.length = 0;
        for (let i = 0; i < lampen.length; i++) nah.push(lampen[i]);
        nah.sort((a, b) => ((a.x - refX) ** 2 + (a.z - refZ) ** 2) - ((b.x - refX) ** 2 + (b.z - refZ) ** 2));
        for (let i = 0; i < 3; i++) {
          const l = L.punkte[i], la = nah[i];
          if (L.nacht) this._punktlichtArt(l, false);
          this._lichtSchalten(l, !!la);
          if (la) l.position.set(la.x, la.y, la.z);
        }
      } else if (L.nacht && this.laternenLampen && this.laternenLampen.length) {
        // Runde 6: Nacht außerhalb des Tunnels – Punktlichter an die nächsten Straßenlaternen (zu irgendeiner Kamera)
        const lampen2 = this.laternenLampen, nah = this._lampenNah || (this._lampenNah = []);
        nah.length = 0;
        for (let i = 0; i < lampen2.length; i++) {
          const la = lampen2[i];
          let d = Infinity;
          for (let k = 0; k < kams.length; k++) { const c = kams[k].position; d = Math.min(d, (la.x - c.x) ** 2 + (la.z - c.z) ** 2); }
          la._d = d; nah.push(la);
        }
        nah.sort((a, b) => a._d - b._d);
        const anz = Math.min(3, L.laterne.punktlichter || 3);
        for (let i = 0; i < 3; i++) {
          const l = L.punkte[i], la = i < anz && nah[i] && nah[i]._d < 90 * 90 ? nah[i] : null;
          this._punktlichtArt(l, true);
          this._lichtSchalten(l, !!la);
          if (la) l.position.set(la.x, la.y, la.z);
        }
      } else for (let i = 0; i < 3; i++) this._lichtSchalten(L.punkte[i], false);
      // Scheinwerfer: nur Spielerautos, nur im Tunnel (± 8 m); Runde 6: nachts immer
      const spieler = this._spielerListe || (this._spielerListe = []);
      spieler.length = 0;
      for (let i = 0; i < this.fahrzeuge.length; i++) if (this.fahrzeuge[i].istSpieler && !this.fahrzeuge[i].ausgeschieden) spieler.push(this.fahrzeuge[i]);
      for (let k = 0; k < 2; k++) {
        const s = L.spots[k], f = spieler.length === 1 ? spieler[0] : spieler[k];
        const an = !!f && this.zustand !== 'menue' && !!f.nah && (L.nacht || st.imTunnel(f.nah.s, 8));
        this._lichtSchalten(s, an);
        // 14.10. (v22): tagsüber im Tunnel gehen auch die Leuchten (Scheinwerfer/Rücklichter/Lichtkegel) des Spielerautos an
        if (f && f.mesh && R.carBuilder.setzeLicht && !(this.tageszeitDaten && this.tageszeitDaten.autoLicht) && !!f.mesh.userData.lichtAn !== an) R.carBuilder.setzeLicht(f.mesh, an);
        if (!an) continue;
        const d = f.anzeige, r = d.richtung(), seite = spieler.length === 1 ? (k === 0 ? -0.7 : 0.7) : 0;
        const rx = -r.z, rz = r.x;            // rechts
        s.position.set(d.x + r.x * 2.1 + rx * seite, d.y + 0.75, d.z + r.z * 2.1 + rz * seite);
        s.target.position.set(d.x + r.x * 24 + rx * seite * 2, d.y - 0.4, d.z + r.z * 24 + rz * seite * 2);
        s.target.updateMatrixWorld();
      }
    }

    /** Runde 6: Punktlicht als Straßenlaterne (laterne = true) oder Tunnellampe (wie bisher) einstellen. */
    _punktlichtArt(l, laterne) {
      if (l.userData.laterne === laterne) return;
      l.userData.laterne = laterne;
      const T = this.tunnelLichter.laterne;
      if (laterne) { l.color.setHex(T.farbe); l.userData.basis = T.licht; l.distance = T.reichweite; l.decay = T.abfall; }
      else { l.color.setHex(0xffd8a0); l.userData.basis = 18; l.distance = 20; l.decay = 1.6; }
    }

    /** Himmels- und Sonnenlicht für Ansicht i dimmen, wenn deren Kamera im Tunnel ist (i = -1: Menü). */
    _tunnelDimmen(i) {
      const b = this._lichtBasis;
      if (!b) return;
      const L = this.tunnelLichter;
      const f = L ? L.dunkel[i < 0 ? 2 : i] || 0 : 0;
      this.halbkugelLicht.intensity = b.himmel * (1 - 0.9 * f);
      this.sonne.intensity = b.sonne * (1 - 0.96 * f);
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
        ` | Sicht ${L.qualitaet.sichtweite} m | Zustand: ${this.zustand}` +
        // Runde 6: aktive Lichter (sichtbar und Intensität > 0) – Budget Spot ≤ 2, Punkt ≤ 3 (+ Polizei-Blaulicht)
        ` | Lichter: Spot ${L.lichter.spot} · Punkt ${L.lichter.punkt}${L.lichter.tageszeit !== 'tag' ? ' (' + L.lichter.tageszeit + ')' : ''}`;
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
