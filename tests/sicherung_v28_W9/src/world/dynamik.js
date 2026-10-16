// ============================================================
// Dynamische Objekte (Fantasie-Strecke): rollende Bälle und Wasserfontänen
//
// Katalog (trackCatalog.js):
//   baelle:         [{ s, von: -1|1, abRunde: 'letzte'|n, intervall, tempo, radius, farbe }]
//   wasserstrahlen: [{ s, seitenabstand, intervall, dauer, vorwarnung }]
// Werte für Treffer: config.fantasie.baelle / .wasser.
//
// Bälle: Ab der Runde abRunde (Bezug: führender Spieler, 'letzte' = letzte Runde) rollt an jeder
//   Ballstelle alle `intervall` s ein großer bunter Ball von der Seite `von` quer über die Fahrbahn und
//   verschwindet auf der anderen Seite. Treffer: Tempo −60 %, Ball fliegt weg und verschwindet.
// Wasserstrahl: Düse in einer Bodenplatte. Je Zyklus (intervall s, Startversatz aus dem Seed):
//   vorwarnung s Blubbern (kleine Spritzer), dann dauer s Fontäne. Treffer während der Fontäne:
//   Tempo −40 % + Schlingern (vQuer-Impuls), höchstens einmal je Fontäne und Auto.
// Runde 4 – Strohballen (Schicht „strohballen“, strecke.strohballen [{ s, von, intervall, tempo }], config.strohballen):
//   ab Runde 1 rollt an jeder Stelle alle `intervall` s ein Rundballen (liegender Zylinder, Achse längs der Straße)
//   von der Seite `von` quer über die Fahrbahn. Treffer: Tempo −50 %, der Ballen kippt um, rutscht an den
//   nächsten Fahrbahnrand und bleibt dort liegenZeit (3 s) liegen, dann ist er weg. Stoß-typ 'stroh'.
//   Dynamik lohnt sich auch, wenn eine Strecke NUR Strohballen hat (main.js: Bau-Bedingung beachten).
// Runde 5b – Dinos (Schicht „dinos“, strecke.dinos [{ s, von, intervall, tempo, art }], config.dinos):
//   ab Runde 1 läuft an jeder Stelle alle `intervall` s ein Dino (Dreihorn/Langhals, Low-Poly aus themes.dinoTeile)
//   langsam (tempo m/s) von der Seite `von` quer über die Straße, die Beine wippen. Kontakt: Tempo −60 % + Hüpfer
//   (vehicle.huepfer wie beim Ast), höchstens einmal je Dino und Auto; der Dino bleibt unbeeindruckt und läuft weiter.
//   Stoß-typ 'dino'. Strohballen mit strecke.katalog.strohOptik === 'fels' sehen aus wie Felsbrocken (Stoß-typ 'fels').
// Runde 6 (W2-C) – Dino-Ausbau + Wildtiere (alles nur mit Schicht „dinos“ = ab Welt Hindernisse, Werte config.dino / config.tiere):
//   Dinos: W2-C2: 30 % bleiben MITTEN auf der Straße stehen und kehren dort um (umkehrChance), von den übrigen bleibt
//          stehenChance 1–3 s stehen (Kopf gesenkt). Jede Dino-Stelle brüllt alle 15–30 s (bruellenMin/Max, eigener
//          Zufall dinoRnd → deterministisch je Seed; Kopf hoch) – Ereignis 'bruellen' → main.js: Ton + Kamerawackler < 30 m.
//   Tiere (Katalog tiere [{ art: 'reh'|'baer', s, von, intervall, tempo }]): Reh springt flink (6 m/s), bleibt manchmal stehen
//          und schaut zu den Autos, Geweih bei jedem 2.; Bär trottet (3 m/s). Kontakt: Reh −40 %, Bär −60 % (+ brummen).
//          Grasende Rehe (Deko, auch Welt Klassisch) neben der Straße.
//   Vulkan (Katalog vulkan): alle 80–110 s (eigener Zufall aus dem Seed) grollen s Grollen + Glut (this.vulkanGlut 0..1 →
//          Himmel rot in main.js, Rauch dichter in themes.js), dann Lavabomben (ballistisch) vor dem Führenden; Einschlag auf der
//          Fahrbahn → Hindernis 'krater' (strecke.hindernisse, collisions.js) für dauer s, daneben nur Deko-Krater.
//          Nie auf Start/Ziel, Tunnel, Brücke, Schanze + Landebereich, Lava (bombenZielErlaubt).
//   Meteoriten (Katalog meteoriten [{ s, von }]): je Runde beim ersten Passieren des Führenden: warnZeit s Schatten + Pfeifen,
//          Einschlag abstand m neben der Fahrbahn (Deko-Krater + Staub), dann 3–5 Felsbrocken (Strohballen-Mechanik).
//   Flugsaurier (Katalog flugsaurier { s0, s1, intervall }): alle intervall s, wenn das vorderste Spieler-Auto auf der Geraden
//          ist: kommt in hoehe m von vorn, taucht bis tief m über das Auto (y relativ zum Auto → nie Kontakt), Schrei + Duck.
//   Ereignisse je Schritt: schritt() → erg.ereignisse [{ typ, x, z, … }] (main.js: Töne, Meldungen, Kamera).
// Die KI kennt beides nicht (gewollt). Autos im Looping (vehicle.imLooping) werden nicht getroffen.
// Rechenteil ohne Three.js (Node-Tests: tests/test_dynamik.js), bauen()/animieren() brauchen THREE.
// ============================================================
(function () {
  const R = window.Rennspiel;
  const G = 9.81;

  /** Kleiner deterministischer Zufallsgenerator (mulberry32). */
  function zufall(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function cfg() { return (R.config.fantasie) || {}; }
  function cfgStroh() { return (R.config.strohballen) || {}; }
  function cfgDino() { return (R.config.dinos) || {}; }
  function cfgDinoV() { return (R.config.dino) || {}; }          // Runde 6: Verhalten, Lava, Vulkan, Meteor, Flugsaurier
  function cfgTiere() { return (R.config.tiere) || {}; }         // Runde 6: Rehe, Bären
  // Runde 6: Kollisionsform der Tiere (Kreise längs der Laufrichtung)
  // W2-C2: an die verkleinerten Modelle angepasst (Reh ×0,62 → ~1,2 m hoch, Bär ×0,87 → ~1,5 m)
  const TIER_FORM = { reh: { kreise: [-0.4, 0.4], r: 0.5 }, baer: { kreise: [-0.75, 0.1, 0.85], r: 0.78 } };
  const TIER_GROESSE = { reh: 0.62, baer: 0.87 };
  // Kollisionsform je Dino-Art: Kreise längs der Laufrichtung (Abstand vom Mittelpunkt in m) mit Radius r
  const DINO_FORM = { dreihorn: { kreise: [-1.9, 0, 1.9, 3.1], r: 1.15 }, langhals: { kreise: [-3.6, -1.6, 0.4, 2.3], r: 1.5 } };
  function wert(x, std) { return x === undefined ? std : x; }

  class Dynamik {
    /**
     * @param {Strecke} strecke
     * @param {{seed?:number}} [opt]
     */
    constructor(strecke, opt) {
      const o = opt || {}, d = strecke.daten || {}, sp = strecke.spline;
      this.strecke = strecke;
      this.rnd = zufall(o.seed !== undefined ? o.seed : 4242);
      this.zeit = 0;
      this.baelleAn = false;            // mindestens eine Ballstelle aktiv
      const b = strecke.breite / 2, ueber = wert((cfg().baelle || {}).ueberstand, 12);
      this.stellen = (d.baelle || []).map((e, nr) => ({
        nr, s: sp.wrapS(e.s), von: e.von < 0 ? -1 : 1, abRunde: e.abRunde === undefined ? 'letzte' : e.abRunde,
        intervall: e.intervall || 8, tempo: e.tempo || 9, radius: e.radius || 1.6, farbe: e.farbe !== undefined ? e.farbe : 0xff4fa3,
        qStart: (e.von < 0 ? -1 : 1) * (b + ueber), aktiv: false, timer: 0, baelle: [],
      }));
      this.duesen = (d.wasserstrahlen || []).map((e, nr) => {
        const p = sp.punktBei(e.s), q = e.seitenabstand || 0;
        const x = p.x + p.nx * q, z = p.z + p.nz * q;
        return {
          nr, s: sp.wrapS(e.s), seitenabstand: q, x, z, y: strecke.hoeheAn(x, z),
          intervall: e.intervall || 20, dauer: e.dauer || 2, vorwarnung: wert(e.vorwarnung, 1),
          versatz: this.rnd() * (e.intervall || 20),     // zeitlich zufällig versetzt (Seed)
          zustand: 'aus', phase: 0, getroffen: new Set(),
        };
      });
      // Runde 4: Strohballen (nur wenn die Welt die Schicht einschaltet; strecke.strohballen ist schon gefiltert)
      const CS = cfgStroh(), schichtAn = !strecke.aktiveSchichten || strecke.aktiveSchichten.strohballen !== false;
      const strohListe = schichtAn ? (strecke.strohballen || d.strohballen || []) : [];
      const radius = wert(CS.radius, 0.75), uebS = wert(CS.ueberstand, 8);
      const kat = strecke.katalog || d;
      this.felsOptik = kat.strohOptik === 'fels';
      // Runde 5b: Dinos (nur wenn die Welt die Schicht einschaltet; strecke.dinos ist schon gefiltert)
      const CD = cfgDino(), dinoAn = !strecke.aktiveSchichten || strecke.aktiveSchichten.dinos !== false;
      const dinoListe = dinoAn ? (strecke.dinos || d.dinos || []) : [];
      this.dinoStellen = dinoListe.map((e, nr) => {
        const s = sp.wrapS(e.s), bh = (strecke.breiteBei ? strecke.breiteBei(s) : strecke.breite) / 2, von = e.von < 0 ? -1 : 1;
        const art = DINO_FORM[e.art] ? e.art : 'dreihorn';
        return { nr, s, von, art, intervall: e.intervall || 14, tempo: e.tempo || wert(CD.tempo, 4), bh,
          qStart: von * (bh + wert(CD.ueberstand, 12)), timer: 1 + this.rnd() * Math.min(4, e.intervall || 14), dinos: [] };
      });
      // Runde 6 (W2-C): Ereignisse + Tiere nur mit Schicht „dinos“ (ab Welt Hindernisse); grasende Rehe immer (Deko)
      this.ereignisseAn = dinoAn;
      // W2-C2: Verhalten der Dinos (stehen/umkehren/brüllen) aus eigenem Zufall → je Seed deterministisch, unabhängig von Bällen/Ballen
      this.dinoRnd = zufall(((o.seed !== undefined ? o.seed : 4242) * 2246822519 + 31) >>> 0);
      const CVb = cfgDinoV(), bA = wert(CVb.bruellenMin, 15), bB = wert(CVb.bruellenMax, 30);
      this.dinoStellen.forEach((st) => { st.bruellTimer = bA + this.dinoRnd() * (bB - bA); });
      this.vulkanGlut = 0;
      if (R.themes) R.themes.vulkanGlut = 0;
      this.strohStellen = strohListe.map((e, nr) => {
        const s = sp.wrapS(e.s), bh = (strecke.breiteBei ? strecke.breiteBei(s) : strecke.breite) / 2;
        const von = e.von < 0 ? -1 : 1;
        return { nr, s, von, intervall: e.intervall || 10, tempo: e.tempo || wert(CS.tempo, 5), radius, breite: wert(CS.breite, 1.25),
          qStart: von * (bh + uebS), randQ: bh + (strecke.randBreite || 1) * 0.5 + radius,
          timer: 1 + this.rnd() * Math.min(4, e.intervall || 10), ballen: [] };
      });
      this._extraBauen(strecke, o, dinoAn);   // Runde 6 (W2-C): nach den Strohballen (Meteor-Felsbrocken hängen sich dort an)
    }

    /** Ab welchem Fortschritt (m, Bezug führender Spieler) rollen die Bälle dieser Stelle? */
    _schwelle(st, runden) {
      const L = this.strecke.laenge;
      const r = st.abRunde === 'letzte' ? runden : Math.max(1, +st.abRunde || 1);
      return (Math.min(r, runden) - 1) * L;
    }

    /** Weltposition eines rollenden Balls (s, q) → x, y, z. */
    _ballWelt(ball) {
      const st = this.strecke, p = st.spline.punktBei(ball.s);
      ball.x = p.x + p.nx * ball.q; ball.z = p.z + p.nz * ball.q;
      ball.y = st.hoeheAn(ball.x, ball.z) + ball.radius;
      ball.nx = p.nx; ball.nz = p.nz;
    }

    /** Zustand einer Düse zur Zeit t: 'aus' | 'blubbern' | 'aktiv', phase 0..1 im Abschnitt. */
    duesenZustand(d, t) {
      const z = ((t + d.versatz) % d.intervall + d.intervall) % d.intervall;
      if (z < d.vorwarnung) return { zustand: 'blubbern', phase: z / Math.max(1e-6, d.vorwarnung) };
      if (z < d.vorwarnung + d.dauer) return { zustand: 'aktiv', phase: (z - d.vorwarnung) / d.dauer };
      return { zustand: 'aus', phase: 0 };
    }

    /**
     * Bewegung (je Physikschritt, nur wenn das Rennen läuft).
     * @param {number} dt
     * @param {{fortschritt:number, runden:number}} info  fortschritt = führender Spieler (m)
     * @returns {{baelleKommen:boolean}} baelleKommen = gerade eben die erste Ballstelle aktiv geworden
     */
    schritt(dt, info) {
      const erg = { baelleKommen: false, ereignisse: [] };
      this._erg = erg;                  // Runde 6: Ereignisse (bruellen, grollen, bombe, einschlag, meteorWarnung, schrei, duck)
      this.zeit += dt;
      const C = cfg().baelle || {}, flug = wert(C.flugZeit, 1.2);
      for (const st of this.stellen) {
        if (!st.aktiv && info && info.fortschritt >= this._schwelle(st, info.runden || 1) && info.fortschritt > -1) {
          st.aktiv = true;
          st.timer = 0.4 + this.rnd() * 2.0;          // "plötzlich": kurz nach dem Rundenwechsel
          if (!this.baelleAn) { this.baelleAn = true; erg.baelleKommen = true; }
        }
        if (st.aktiv) {
          st.timer -= dt;
          if (st.timer <= 0) {
            st.timer = st.intervall;
            const ball = { s: st.s + (this.rnd() - 0.5) * 6, q: st.qStart, vq: -st.von * st.tempo, radius: st.radius,
              winkel: 0, zustand: 'rollt', zeit: 0, vx: 0, vy: 0, vz: 0, x: 0, y: 0, z: 0, nx: 1, nz: 0 };
            this._ballWelt(ball);
            st.baelle.push(ball);
          }
        }
        for (let i = st.baelle.length - 1; i >= 0; i--) {
          const ball = st.baelle[i];
          ball.zeit += dt;
          if (ball.zustand === 'rollt') {
            ball.q += ball.vq * dt;
            ball.winkel += Math.abs(ball.vq) / ball.radius * dt;
            this._ballWelt(ball);
            if (ball.q * st.von < -Math.abs(st.qStart)) st.baelle.splice(i, 1);   // drüben angekommen
          } else {
            // weggestoßen: fliegt im Bogen weg, verschwindet nach flugZeit
            ball.x += ball.vx * dt; ball.y += ball.vy * dt; ball.z += ball.vz * dt;
            ball.vy -= G * dt;
            ball.winkel += 8 * dt;
            if (ball.zeit > flug) st.baelle.splice(i, 1);
          }
        }
      }
      this._strohSchritt(dt);
      this._dinoSchritt(dt);
      this._extraSchritt(dt, info || {});     // Runde 6 (W2-C)
      for (const d of this.duesen) {
        const z = this.duesenZustand(d, this.zeit);
        if (d.zustand === 'aktiv' && z.zustand !== 'aktiv') d.getroffen.clear();
        d.zustand = z.zustand; d.phase = z.phase;
      }
      return erg;
    }

    /** Strohballen: neue rollen los (ab Runde 1, sobald das Rennen läuft), rollende/gekippte bewegen. */
    _strohSchritt(dt) {
      const CS = cfgStroh(), kipp = wert(CS.kippZeit, 0.45), liegen = wert(CS.liegenZeit, 3);
      for (const st of this.strohStellen) {
        st.timer -= dt;
        if (st.timer <= 0) {
          st.timer = st.intervall;
          const b = { s: st.s + (this.rnd() - 0.5) * 4, q: st.qStart, vq: -st.von * st.tempo, radius: st.radius, breite: st.breite,
            winkel: 0, kipp: 0, zustand: 'rollt', zeit: 0, qZiel: 0, x: 0, y: 0, z: 0, nx: 1, nz: 0, tx: 0, tz: 1 };
          this._strohWelt(b);
          st.ballen.push(b);
        }
        for (let i = st.ballen.length - 1; i >= 0; i--) {
          const b = st.ballen[i];
          b.zeit += dt;
          if (b.zustand === 'rollt') {
            b.q += b.vq * dt;
            b.winkel += b.vq / b.radius * dt;
            if (b.q * st.von < -Math.abs(st.qStart)) { st.ballen.splice(i, 1); continue; }   // drüben angekommen
          } else {
            // getroffen: kippt in kippZeit um und rutscht an den Rand, liegt dann liegenZeit s, dann weg
            const u = Math.min(1, b.zeit / kipp);
            b.kipp = u;
            b.q = b.qVon + (b.qZiel - b.qVon) * (1 - (1 - u) * (1 - u));
            if (b.zeit > kipp + liegen) { st.ballen.splice(i, 1); continue; }
          }
          this._strohWelt(b);
        }
      }
    }

    /**
     * Dinos: neue laufen los (ab Runde 1, sobald das Rennen läuft), laufende bewegen; drüben (oder nach dem Umkehren
     * wieder auf der eigenen Seite) angekommen → weg. Runde 6: einmal stehen bleiben (Kopf senken, evtl. brüllen),
     * danach mit umkehrChance umdrehen (config.dino).
     */
    _dinoSchritt(dt) {
      const CV = cfgDinoV(), erg = this._erg;
      for (const st of this.dinoStellen) {
        st.timer -= dt;
        if (st.timer <= 0) {
          st.timer = st.intervall;
          const dino = { s: st.s + (this.rnd() - 0.5) * 3, q: st.qStart, vq: -st.von * st.tempo, art: st.art, zeit: 0, phase: this.rnd() * 6,
            getroffen: new Set(), x: 0, y: 0, z: 0, nx: 1, nz: 0, tx: 0, tz: 1, zustand: 'laeuft', stehRest: 0, kopf: 0, umgekehrt: false,
            gestanden: false, stoppQ: null, umkehren: false, bruellt: 0 };
          // W2-C2: kehrt er um (mitten auf der Straße, |q| ≤ 40 % der halben Breite)? Sonst: bleibt er stehen – und wo?
          const dr = this.dinoRnd, bh = st.bh || 6;
          if (dr() < wert(CV.umkehrChance, 0.3)) { dino.umkehren = true; dino.stoppQ = (dr() * 2 - 1) * bh * 0.4; }
          else if (dr() < wert(CV.stehenChance, 0.5)) dino.stoppQ = (dr() * 2 - 1) * (bh + 2);
          this._dinoWelt(dino);
          st.dinos.push(dino);
        }
        for (let i = st.dinos.length - 1; i >= 0; i--) {
          const d = st.dinos[i];
          d.zeit += dt;
          if (d.zustand === 'steht') {
            d.stehRest -= dt;
            if (d.stehRest <= 0) {
              d.zustand = 'laeuft';
              if (d.umkehren) { d.vq = -d.vq; d.umgekehrt = true; d.umkehrQ = d.q; }
            }
          } else {
            d.q += d.vq * dt;
            d.phase += Math.abs(d.vq) * dt * (d.art === 'langhals' ? 0.9 : 1.6);   // Schrittfrequenz
            if (d.stoppQ !== null && !d.gestanden && (d.q - d.stoppQ) * Math.sign(d.vq) >= 0) {
              d.zustand = 'steht'; d.gestanden = true;
              const a = wert(CV.stehenMin, 1), b = wert(CV.stehenMax, 3);
              d.stehRest = a + this.dinoRnd() * (b - a);
            }
          }
          if (d.bruellt > 0) d.bruellt = Math.max(0, d.bruellt - dt);
          // Kopf: stehend gesenkt (1), beim Brüllen hoch (−1,4 → Vorderteil hebt sich), sonst 0
          d.kopf += ((d.bruellt > 0 ? -1.4 : d.zustand === 'steht' ? 1 : 0) - d.kopf) * Math.min(1, dt * (d.bruellt > 0 ? 6 : 3));
          // W2-C2: Atemwolke vor dem Maul, solange er brüllt (nur Optik, eigener Zufall des Rauchs)
          if (d.bruellt > 0 && Math.floor(d.bruellt * 8) !== Math.floor((d.bruellt + dt) * 8)) {
            const vorn = d.art === 'langhals' ? 5.2 : 3.9, hoch = d.art === 'langhals' ? 5.5 : 2.2;
            this.rauchAn(d.x + d.lx * vorn, d.y + hoch, d.z + d.lz * vorn, 2, 0xe8e0d0, 0.7);
          }
          // weg: jenseits der Fahrbahn (oder nach dem Umkehren wieder auf der eigenen Seite) und läuft nach außen
          if (Math.abs(d.q) > Math.abs(st.qStart) + 1e-6 && d.q * d.vq > 0) { st.dinos.splice(i, 1); continue; }
          this._dinoWelt(d);
        }
        // W2-C2: Brüllen alle bruellenMin–bruellenMax s je Stelle – sobald ein Dino der Stelle nah an der Straße ist
        st.bruellTimer -= dt;
        if (st.bruellTimer <= 0) {
          const d = st.dinos.find(x => Math.abs(x.q) < (st.bh || 6) + 5);
          if (d) {
            const a = wert(CV.bruellenMin, 15), b = wert(CV.bruellenMax, 30);
            st.bruellTimer = a + this.dinoRnd() * (b - a);
            d.bruellt = wert(CV.bruellenDauer, 1.2);
            st.bruellZeiten = st.bruellZeiten || []; st.bruellZeiten.push(this.zeit);
            if (erg) erg.ereignisse.push({ typ: 'bruellen', x: d.x, z: d.z, art: d.art, stelle: st.nr });
          } else st.bruellTimer = 0;
        }
      }
    }

    /** Weltposition eines Dinos (s, q) → x, y, z; Laufrichtung (lx, lz) quer zur Straße. */
    _dinoWelt(d) {
      const st = this.strecke, p = st.spline.punktBei(d.s);
      d.x = p.x + p.nx * d.q; d.z = p.z + p.nz * d.q;
      d.y = st.hoeheAn(d.x, d.z);
      d.nx = p.nx; d.nz = p.nz; d.tx = p.tx; d.tz = p.tz;
      const sg = Math.sign(d.vq) || 1;
      d.lx = p.nx * sg; d.lz = p.nz * sg;
    }

    /** Alle Dinos, die gerade über die Straße laufen (für Tests/Anzeige). */
    alleDinos() {
      const l = [];
      for (const st of this.dinoStellen) for (const d of st.dinos) l.push(d);
      return l;
    }

    /** Weltposition eines Strohballens (s, q) → x, y, z (+ Tangente/Normale für die Grafik). */
    _strohWelt(b) {
      const st = this.strecke, p = st.spline.punktBei(b.s);
      b.x = p.x + p.nx * b.q; b.z = p.z + p.nz * b.q;
      // rollend: Mitte = Radius über dem Boden; gekippt (liegt auf der runden Stirnseite): halbe Breite
      const hoehe = b.radius + (b.breite / 2 - b.radius) * b.kipp;
      b.y = st.hoeheAn(b.x, b.z) + hoehe;
      b.nx = p.nx; b.nz = p.nz; b.tx = p.tx; b.tz = p.tz;
    }

    /** Alle Strohballen (rollend oder gekippt) – für Tests/Anzeige. */
    alleStrohballen() {
      const l = [];
      for (const st of this.strohStellen) for (const b of st.ballen) l.push(b);
      return l;
    }

    /** Alle Bälle, die gerade rollen oder fliegen (für Tests/Anzeige). */
    alleBaelle() {
      const l = [];
      for (const st of this.stellen) for (const b of st.baelle) l.push(b);
      return l;
    }

    /**
     * Treffer prüfen (nach den Fahrzeugschritten). Ändert Tempo der getroffenen Autos.
     * @param {Array} fahrzeugListe Vehicles oder Einträge mit .vehicle
     * @returns {{nr:number, typ:'ball'|'wasser', staerke:number}[]}
     */
    kollisionen(fahrzeugListe) {
      const stoesse = [], CB = cfg().baelle || {}, CW = cfg().wasser || {};
      const kapsel = R.Kollisionen && R.Kollisionen.kapsel;
      for (let i = 0; i < fahrzeugListe.length; i++) {
        const f = fahrzeugListe[i], v = (f && f.vehicle) ? f.vehicle : f;
        if (!v || v.imLooping || v.imFlug) continue;    // Runde 4: im Flug über einer Schanze nicht treffbar
        const ka = kapsel ? kapsel(v) : { rad: 0.9, kreise: [{ x: v.x, z: v.z }] };
        // Bälle
        for (const st of this.stellen) {
          for (const ball of st.baelle) {
            if (ball.zustand !== 'rollt') continue;
            const gx = ball.x - v.x, gz = ball.z - v.z, gr = ball.radius + v.daten.laenge;
            if (gx * gx + gz * gz > gr * gr) continue;
            let treffer = false;
            for (const c of ka.kreise) {
              const dx = ball.x - c.x, dz = ball.z - c.z, rr = ka.rad + ball.radius;
              if (dx * dx + dz * dz < rr * rr) { treffer = true; break; }
            }
            if (!treffer) continue;
            const vorher = v.tempo;
            v.vLaengs *= wert(CB.tempoFaktor, 0.4);
            v.vQuer *= 0.5;
            // Ball fliegt weg: vom Auto weg + in Fahrtrichtung, im Bogen nach oben
            const r = v.richtung(), l = Math.hypot(gx, gz) || 1;
            const weg = 5 + vorher * 0.35;
            ball.zustand = 'weg'; ball.zeit = 0;
            ball.vx = gx / l * weg + r.x * vorher * 0.6; ball.vz = gz / l * weg + r.z * vorher * 0.6; ball.vy = 7 + vorher * 0.12;
            stoesse.push({ nr: i, typ: 'ball', staerke: Math.max(3, vorher * 0.6) });
          }
        }
        // Runde 4: Strohballen (Kreis mit Radius ≈ größere Ausdehnung des liegenden Zylinders)
        for (const st of this.strohStellen) {
          for (const b of st.ballen) {
            if (b.zustand !== 'rollt') continue;
            const gx = b.x - v.x, gz = b.z - v.z, gr = b.radius + v.daten.laenge;
            if (gx * gx + gz * gz > gr * gr) continue;
            let treffer = false;
            for (const c of ka.kreise) {
              const dx = b.x - c.x, dz = b.z - c.z, rr = ka.rad + Math.max(b.radius, b.breite / 2) * 0.9;
              if (dx * dx + dz * dz < rr * rr) { treffer = true; break; }
            }
            if (!treffer) continue;
            const vorher = v.tempo;
            v.vLaengs *= wert(cfgStroh().tempoFaktor, 0.5);
            v.vQuer *= 0.5;
            // Ballen kippt um und rutscht an den Fahrbahnrand auf seiner Seite (vom Auto weg)
            const seite = b.q >= 0 ? 1 : -1;
            b.zustand = 'gekippt'; b.zeit = 0; b.qVon = b.q; b.qZiel = seite * st.randQ;
            stoesse.push({ nr: i, typ: this.felsOptik ? 'fels' : 'stroh', staerke: Math.max(3, vorher * 0.5) });
          }
        }
        // Runde 5b: Dinos (Kreise längs der Laufrichtung) – einmal je Dino und Auto, Dino läuft weiter
        const CD = cfgDino();
        for (const st of this.dinoStellen) {
          for (const d of st.dinos) {
            if (d.getroffen.has(i)) continue;
            const form = DINO_FORM[d.art], gx = d.x - v.x, gz = d.z - v.z, gr = 4.5 + form.r + v.daten.laenge;
            if (gx * gx + gz * gz > gr * gr) continue;
            let treffer = false;
            for (const k of form.kreise) {
              const kx = d.x + d.lx * k, kz = d.z + d.lz * k;
              for (const c of ka.kreise) {
                const dx = kx - c.x, dz = kz - c.z, rr = ka.rad + form.r;
                if (dx * dx + dz * dz < rr * rr) { treffer = true; break; }
              }
              if (treffer) break;
            }
            if (!treffer) continue;
            d.getroffen.add(i);
            const vorher = v.tempo;
            v.vLaengs *= wert(CD.tempoFaktor, 0.4);
            v.vQuer *= 0.5;
            v.huepfer = wert(CD.huepfer, 2.6);
            stoesse.push({ nr: i, typ: 'dino', staerke: Math.max(3, vorher * 0.6) });
          }
        }
        // Runde 6 (W2-C): Rehe und Bären – einmal je Tier und Auto, das Tier läuft weiter
        this._tierKollision(v, i, ka, stoesse);
        // Wasserfontänen
        for (const d of this.duesen) {
          if (d.zustand !== 'aktiv' || d.getroffen.has(i)) continue;
          const rr = wert(CW.radius, 2.2) + ka.rad;
          let treffer = false;
          for (const c of ka.kreise) {
            const dx = d.x - c.x, dz = d.z - c.z;
            if (dx * dx + dz * dz < rr * rr) { treffer = true; break; }
          }
          if (!treffer) continue;
          d.getroffen.add(i);
          const vorher = v.tempo;
          v.vLaengs *= wert(CW.tempoFaktor, 0.6);
          // Schlingern: Quer-Impuls weg von der Düse (Seite aus der Lage relativ zum Auto)
          const q = v.rechts(), seite = (v.x - d.x) * q.x + (v.z - d.z) * q.z >= 0 ? 1 : -1;
          v.vQuer += seite * wert(CW.schlingern, 6);
          stoesse.push({ nr: i, typ: 'wasser', staerke: Math.max(2, vorher * 0.3) });
        }
      }
      return stoesse;
    }

    // ------------------------------------------------------------------ Runde 6 (W2-C): Logik

    /** Tiere, grasende Rehe, Meteoriten, Vulkan, Flugsaurier, Krater, Rauch – Datenstrukturen anlegen (ohne THREE). */
    _extraBauen(strecke, o, dinoAn) {
      const sp = strecke.spline, kat = strecke.katalog || strecke.daten || {}, CT = cfgTiere(), CV = cfgDinoV();
      const bhBei = (s) => (strecke.breiteBei ? strecke.breiteBei(s) : strecke.breite) / 2;
      // --- Tiere (Rehe, Bären) ---
      this.tierStellen = (dinoAn ? (kat.tiere || []) : []).map((e, nr) => {
        const s = sp.wrapS(e.s), von = e.von < 0 ? -1 : 1, art = e.art === 'baer' ? 'baer' : 'reh', ct = CT[art] || {};
        return { nr, s, von, art, intervall: e.intervall || 10, tempo: e.tempo || wert(ct.tempo, art === 'baer' ? 3 : 6), bh: bhBei(s),
          qStart: von * (bhBei(s) + wert(CT.ueberstand, 9)), timer: 1 + this.rnd() * Math.min(4, e.intervall || 10), tiere: [], zaehler: 0 };
      });
      // --- Grasende Rehe (Deko neben der Straße, auch Welt Klassisch) ---
      this.grasendeRehe = [];
      if ((kat.tiere || []).length) {
        const rnd = zufall(777 + (kat.id || '').length), n = wert(CT.grasendeRehe, 3), L = sp.laenge;
        for (let k = 0, versuch = 0; this.grasendeRehe.length < n && versuch < 60; versuch++, k++) {
          const s = sp.wrapS((k + 0.3 + rnd() * 0.4) / (n + 1) * L + versuch * 37);
          if (Math.abs(sp.differenzS(s, 0)) < 60 || (strecke._engstellen || []).some(b => strecke._inBereich(b, s, 40))) continue;
          const seite = rnd() < 0.5 ? -1 : 1, grenze = strecke.grenzeBei ? strecke.grenzeBei(s) : strecke.seitenabstandMax;
          const q = seite * Math.min(bhBei(s) + (strecke.randBreite || 1) + 3.5 + rnd() * 2, grenze - 1.5);
          const p = sp.punktBei(s), x = p.x + p.nx * q, z = p.z + p.nz * q;
          if (Math.abs(Math.abs(sp.naechster(x, z).seitenabstand) - Math.abs(q)) > 0.5) continue;   // anderes Streckenteil näher
          if (this.grasendeRehe.some(r => Math.abs(sp.differenzS(r.s, s)) < 150)) continue;
          const w = rnd() * Math.PI * 2;
          this.grasendeRehe.push({ art: 'reh', s, q, x, z, y: strecke.hoeheAn(x, z), lx: Math.cos(w), lz: Math.sin(w), zustand: 'grast',
            phase: rnd() * 10, kopfNick: 0, kopfDreh: 0, sprung: 0, geweih: this.grasendeRehe.length === 1, beinPhase: 0 });
        }
      }
      // --- Meteoriten: Felsbrocken laufen über eigene Strohballen-Stellen (ohne Takt, max. 5 Brocken) ---
      const CM = CV.meteor || {}, CS = cfgStroh();
      this.meteorStellen = (dinoAn ? (kat.meteoriten || []) : []).map((e, nr) => {
        const s = sp.wrapS(e.s), von = e.von < 0 ? -1 : 1, bh = bhBei(s), radius = wert(CS.radius, 0.75);
        const stroh = { nr: 100 + nr, s, von, intervall: Infinity, tempo: wert(CM.brockenTempo, 7), radius, breite: wert(CS.breite, 1.25),
          qStart: von * (bh + wert(CM.abstand, 15)), randQ: bh + (strecke.randBreite || 1) * 0.5 + radius, timer: Infinity, ballen: [], max: 5, meteor: true };
        this.strohStellen.push(stroh);
        const p = sp.punktBei(s), qi = von * (bh + wert(CM.abstand, 15));
        const xi = p.x + p.nx * qi, zi = p.z + p.nz * qi;
        return { nr, s, von, stroh, runde: 0, phase: 'ruhe', zeit: 0, x: xi, z: zi, y: strecke.hoeheAn(xi, zi), ablauf: [],
          start: { x: xi - p.nx * von * 75 + p.tx * 25, y: strecke.hoeheAn(xi, zi) + 150, z: zi - p.nz * von * 75 + p.tz * 25 },
          pos: null, schatten: null };
      });
      if (this.meteorStellen.length) this.felsOptik = true;
      // --- Vulkan (eigener Zufall → Zeitplan deterministisch und unabhängig von Dinos/Bällen) ---
      const seed = o.seed !== undefined ? o.seed : 4242;
      this.vulkan = (dinoAn && kat.vulkan && kat.vulkan.ausbruch !== false) ? { rnd: zufall((seed * 2654435761 + 97) >>> 0),
        naechster: 0, phase: 'ruhe', phaseZeit: 0, bombenRest: 0, bombenTimer: 0, ausbrueche: [], fuehrerS: 0, vFuehrer: 0, fAlt: undefined, ziele: [] } : null;
      if (this.vulkan) this.vulkan.naechster = this._vulkanPause();
      this.bomben = []; this.krater = []; this.puffs = [];
      this.hindernisVersion = 0;         // W2-C1: zählt Krater-Wechsel in strecke.hindernisse (KI neu informieren)
      this._vulkanOrt = this._vulkanOrtBerechnen(strecke);
      // --- Flugsaurier ---
      const kf = kat.flugsaurier, CF = CV.flugsaurier || {};
      this.flugsaurier = (dinoAn && kf) ? { s0: sp.wrapS(kf.s0), s1: sp.wrapS(kf.s1), intervall: kf.intervall || wert(CF.intervall, 40),
        timer: 5, aktiv: false, s: 0, q: 0, x: 0, y: -100, z: 0, d: 0, ziel: -1, geschrien: false, fluegel: 0, yaw: 0, nicken: 0,
        minUeberAuto: Infinity, anzahl: 0 } : null;
    }

    /** Pause bis zum nächsten Vulkanausbruch (s), aus dem Vulkan-Zufall. */
    _vulkanPause() {
      const C = cfgDinoV().vulkan || {}, a = wert(C.intervallMin, 80), b = wert(C.intervallMax, 110);
      return a + this.vulkan.rnd() * (b - a);
    }

    /** Lage des Kulissen-Vulkans (wie themes.vulkanBauen) – Bomben kommen aus dieser Richtung. */
    _vulkanOrtBerechnen(strecke) {
      const V = (R.themes && R.themes.dino && R.themes.dino.vulkan) || { richtung: 0.12, abstand: 1300 };
      const pk = strecke.spline.punkte;
      let mx = 0, mz = 0;
      pk.forEach((p) => { mx += p.x; mz += p.z; });
      mx /= pk.length; mz /= pk.length;
      const st = strecke.spline.punktBei(0), w = Math.atan2(st.tx, st.tz) + (V.richtung || 0);
      return { x: mx + Math.sin(w) * (V.abstand || 1300), z: mz + Math.cos(w) * (V.abstand || 1300) };
    }

    /**
     * Darf eine Lavabombe bei Bogenlänge s landen? Nicht auf Start/Ziel (± 60 m), in Tunnel/Brücke (± 25 m),
     * auf einer Schanze samt Landebereich (−15 … +80 m), an einem Looping (± 40 m) oder auf einer Lava-Zunge (± 15 m).
     */
    bombenZielErlaubt(s) {
      const st = this.strecke, sp = st.spline;
      if (Math.abs(sp.differenzS(s, 0)) < 60) return false;
      if ((st._engstellen || []).some(b => st._inBereich(b, s, 25))) return false;
      if ((st.schanzen || []).some((e) => { const d = sp.differenzS(s, e.s); return d > -15 && d < (e.laenge || 10) + 80; })) return false;
      if ((st.loopings || []).some(l => st._inBereich(l, s, 40))) return false;
      if ((st.hindernisse || []).some(h => h.typ === 'lava' && Math.abs(sp.differenzS(s, h.s)) < h.halblaenge + 15)) return false;
      return true;
    }

    /** Alle Ereignis-Teile je Physikschritt (Tiere, Rehe, Vulkan, Meteoriten, Flugsaurier, Krater, Bomben, Rauch). */
    _extraSchritt(dt, info) {
      this._tierSchritt(dt);
      for (const r of this.grasendeRehe) r.phase += dt;
      if (this.ereignisseAn) {
        this._vulkanSchritt(dt, info);
        this._meteorSchritt(dt, info);
        this._flugsaurierSchritt(dt, info);
      }
      this._bombenSchritt(dt);
      this._kraterSchritt();
      this._puffSchritt(dt);
    }

    /** Rehe/Bären: losschicken, bewegen (Reh in Sprüngen, schaut manchmal; Bär trottet), drüben → weg. */
    _tierSchritt(dt) {
      const CT = cfgTiere();
      for (const st of this.tierStellen) {
        st.timer -= dt;
        if (st.timer <= 0) {
          st.timer = st.intervall;
          const ct = CT[st.art] || {};
          const t = { art: st.art, s: st.s + (this.rnd() - 0.5) * 3, q: st.qStart, vq: -st.von * st.tempo, zeit: 0, phase: 0, beinPhase: this.rnd() * 6,
            getroffen: new Set(), zustand: 'laeuft', schauRest: 0, kopfDreh: 0, kopfNick: 0, sprung: 0, geweih: (st.zaehler++ % 2) === 1,
            gestanden: false, stoppQ: null, x: 0, y: 0, z: 0, lx: 1, lz: 0, nx: 1, nz: 0, tx: 0, tz: 1 };
          if (st.art === 'reh' && this.rnd() < wert(ct.schauenChance, 0.5)) t.stoppQ = (this.rnd() * 2 - 1) * Math.max(1, st.bh - 1);
          this._tierWelt(t);
          st.tiere.push(t);
        }
        for (let i = st.tiere.length - 1; i >= 0; i--) {
          const t = st.tiere[i], ct = CT[t.art] || {};
          t.zeit += dt;
          if (t.zustand === 'schaut') {
            t.schauRest -= dt;
            t.kopfDreh += (1 - t.kopfDreh) * Math.min(1, dt * 6);
            if (t.schauRest <= 0) t.zustand = 'laeuft';
            t.sprung = Math.max(0, t.sprung - dt * 4);
          } else {
            t.q += t.vq * dt;
            t.kopfDreh += (0 - t.kopfDreh) * Math.min(1, dt * 6);
            if (t.art === 'reh') {
              // Sprünge: je sprungWeite m ein Bogen (Höhe sprungHoehe)
              t.phase += Math.abs(t.vq) * dt / wert(ct.sprungWeite, 3.2);
              t.sprung = wert(ct.sprungHoehe, 0.9) * Math.abs(Math.sin(Math.PI * t.phase));
              t.beinPhase = t.phase;
              if (t.stoppQ !== null && !t.gestanden && (t.q - t.stoppQ) * Math.sign(t.vq) >= 0) {
                t.zustand = 'schaut'; t.gestanden = true;
                const a = wert(ct.schauenMin, 0.8), b = wert(ct.schauenMax, 1.6);
                t.schauRest = a + this.rnd() * (b - a);
                if (this._erg) this._erg.ereignisse.push({ typ: 'rehRuf', x: t.x, z: t.z });   // W2-C2: kurzer Ruf
              }
            } else {
              t.beinPhase += Math.abs(t.vq) * dt * 2.2;                 // Trott
              t.sprung = Math.abs(Math.sin(t.beinPhase)) * 0.07;
              // W2-C2: brummt einmal, wenn er die Fahrbahn betritt
              if (!t.gebrummt && Math.abs(t.q) < st.bh + 1) {
                t.gebrummt = true;
                if (this._erg) this._erg.ereignisse.push({ typ: 'brummen', x: t.x, z: t.z });
              }
            }
          }
          if (Math.abs(t.q) > Math.abs(st.qStart) + 1e-6 && t.q * t.vq > 0) { st.tiere.splice(i, 1); continue; }
          this._tierWelt(t);
        }
      }
    }

    /** Weltposition eines Tiers (s, q) → x, y (Boden), z; Laufrichtung quer zur Straße. */
    _tierWelt(t) {
      const st = this.strecke, p = st.spline.punktBei(t.s);
      t.x = p.x + p.nx * t.q; t.z = p.z + p.nz * t.q; t.y = st.hoeheAn(t.x, t.z);
      t.nx = p.nx; t.nz = p.nz; t.tx = p.tx; t.tz = p.tz;
      const sg = Math.sign(t.vq) || 1;
      t.lx = p.nx * sg; t.lz = p.nz * sg;
    }

    /** Alle Tiere, die gerade unterwegs sind (Tests/Anzeige). */
    alleTiere() {
      const l = [];
      for (const st of this.tierStellen) for (const t of st.tiere) l.push(t);
      return l;
    }

    /** Kontakt Auto ↔ Reh/Bär (aus kollisionen()). */
    _tierKollision(v, i, ka, stoesse) {
      const CT = cfgTiere();
      for (const st of this.tierStellen) {
        for (const t of st.tiere) {
          if (t.getroffen.has(i)) continue;
          const form = TIER_FORM[t.art], gx = t.x - v.x, gz = t.z - v.z, gr = 2 + form.r + v.daten.laenge;
          if (gx * gx + gz * gz > gr * gr) continue;
          let treffer = false;
          for (const k of form.kreise) {
            const kx = t.x + t.lx * k, kz = t.z + t.lz * k;
            for (const c of ka.kreise) {
              const dx = kx - c.x, dz = kz - c.z, rr = ka.rad + form.r;
              if (dx * dx + dz * dz < rr * rr) { treffer = true; break; }
            }
            if (treffer) break;
          }
          if (!treffer) continue;
          t.getroffen.add(i);
          const ct = CT[t.art] || {}, vorher = v.tempo;
          v.vLaengs *= wert(ct.tempoFaktor, t.art === 'baer' ? 0.4 : 0.6);
          v.vQuer *= 0.5;
          v.huepfer = wert(ct.huepfer, 2);
          stoesse.push({ nr: i, typ: t.art, staerke: Math.max(3, vorher * (t.art === 'baer' ? 0.6 : 0.4)), brummen: t.art === 'baer' });
        }
      }
    }

    /** Vulkan: ruhe → grollen (Glut steigt, Ereignis 'grollen') → bomben (je bombenAbstand s eine Bombe) → ruhe. */
    _vulkanSchritt(dt, info) {
      const V = this.vulkan, C = cfgDinoV().vulkan || {}, erg = this._erg;
      const zielGlut = V && V.phase !== 'ruhe' ? 1 : 0;
      this.vulkanGlut += (zielGlut - this.vulkanGlut) * Math.min(1, dt / (zielGlut ? 1.2 : 3));
      if (this.vulkanGlut < 0.003) this.vulkanGlut = 0;
      if (R.themes) R.themes.vulkanGlut = this.vulkanGlut;
      if (!V) return;
      const L = this.strecke.laenge;
      // W2-C1: Tempo des Führenden (geglättet) – Bomben landen so, dass er beim Einschlag noch vorausMin m Abstand hat
      const fNeu = info.fortschritt || 0;
      if (V.fAlt !== undefined && dt > 0) V.vFuehrer += (Math.max(0, Math.min(90, (fNeu - V.fAlt) / dt)) - V.vFuehrer) * Math.min(1, dt / 0.5);
      V.fAlt = fNeu;
      V.naechster -= dt;                 // Abstand Beginn → Beginn (80–110 s)
      if (V.phase === 'ruhe') {
        if (V.naechster <= 0) {
          V.phase = 'grollen'; V.phaseZeit = 0; V.naechster = this._vulkanPause();
          V.ausbrueche.push(+this.zeit.toFixed(4));
          if (erg) erg.ereignisse.push({ typ: 'grollen', dauer: wert(C.grollen, 3), x: this._vulkanOrt.x, z: this._vulkanOrt.z });
        }
        return;
      }
      V.phaseZeit += dt;
      if (V.phase === 'grollen' && V.phaseZeit >= wert(C.grollen, 3)) {
        V.phase = 'bomben'; V.phaseZeit = 0; V.bombenRest = wert(C.bomben, 5); V.bombenTimer = 0; V.ziele = [];
        V.fuehrerS = this.strecke.spline.wrapS(((info.fortschritt || 0) % L + L) % L);
        if (erg) erg.ereignisse.push({ typ: 'ausbruch', x: this._vulkanOrt.x, z: this._vulkanOrt.z });
      }
      if (V.phase === 'bomben') {
        V.bombenTimer -= dt;
        if (V.bombenRest > 0 && V.bombenTimer <= 0) {
          V.bombenTimer = wert(C.bombenAbstand, 0.35);
          V.bombenRest--;
          // Führender jetzt (bewegt sich weiter) – Ziel vorausMin..vorausMax davor, quer ± querMax
          const fs = this.strecke.spline.wrapS(((info.fortschritt || 0) % L + L) % L);
          const weg = V.vFuehrer * wert(C.flugZeit, 2.6);   // so weit fährt der Führende, solange die Bombe fliegt
          for (let versuch = 0; versuch < 80; versuch++) {
            const s = this.strecke.spline.wrapS(fs + weg + wert(C.vorausMin, 50) + V.rnd() * (wert(C.vorausMax, 220) - wert(C.vorausMin, 50)));
            let q = (V.rnd() * 2 - 1) * wert(C.querMax, 9);
            if (!this.bombenZielErlaubt(s)) continue;
            // W2-C1: Einschläge eines Ausbruchs mindestens bombenAbstandS m auseinander (Gasse zum Ausweichen bleibt).
            //         Findet sich nach 70 Versuchen keine Stelle mit Abstand, landet die Bombe NEBEN der Fahrbahn (nur Deko-Krater).
            if (V.ziele.some(z => Math.abs(this.strecke.spline.differenzS(s, z)) < wert(C.bombenAbstandS, 30))) {
              if (versuch < 70) continue;
              const st = this.strecke, rand = (st.breiteBei ? st.breiteBei(s) : st.breite) / 2 + (st.randBreite || 1);
              q = (q < 0 ? -1 : 1) * (rand + 3 + V.rnd() * 4);
            } else V.ziele.push(s);
            this._bombeStarten(s, q);
            break;
          }
        }
        if (V.bombenRest <= 0 && V.phaseZeit > wert(C.flugZeit, 2.6) + 1.5) V.phase = 'ruhe';
      }
    }

    /**
     * Lavabombe: ballistisch in flugZeit s auf (s, q). Start 140 m entfernt (halb aus Richtung Vulkan, halb von vorn
     * entlang der Strecke – so fliegt sie den Autos sichtbar entgegen), 30 m über dem Ziel, Bogen nach oben.
     */
    _bombeStarten(s, q) {
      const st = this.strecke, p = st.spline.punktBei(s), C = cfgDinoV().vulkan || {};
      const x1 = p.x + p.nx * q, z1 = p.z + p.nz * q, y1 = st.hoeheAn(x1, z1);
      let dx = this._vulkanOrt.x - x1, dz = this._vulkanOrt.z - z1;
      const l = Math.hypot(dx, dz) || 1;
      dx = dx / l * 0.5 + p.tx * 0.85; dz = dz / l * 0.5 + p.tz * 0.85;
      const l2 = Math.hypot(dx, dz) || 1; dx /= l2; dz /= l2;
      const T = wert(C.flugZeit, 2.6), x0 = x1 + dx * 140, z0 = z1 + dz * 140, y0 = y1 + 30;
      const b = { s, q, x0, y0, z0, x1, y1, z1, T, t: 0, vx: (x1 - x0) / T, vz: (z1 - z0) / T,
        vy: (y1 - y0 + 0.5 * G * T * T) / T, x: x0, y: y0, z: z0, auf: Math.abs(q) <= (st.breiteBei ? st.breiteBei(s) : st.breite) / 2 + (st.randBreite || 1) };
      this.bomben.push(b);
      if (this._erg) this._erg.ereignisse.push({ typ: 'bombe', x: x1, z: z1, dauer: T });
      return b;
    }

    /** Bomben fliegen; beim Aufprall: Krater (auf der Fahrbahn als Hindernis), Staub/Rauch, Ereignis 'einschlag'. */
    _bombenSchritt(dt) {
      for (let i = this.bomben.length - 1; i >= 0; i--) {
        const b = this.bomben[i];
        b.t += dt;
        const t = Math.min(b.t, b.T);
        b.x = b.x0 + b.vx * t; b.z = b.z0 + b.vz * t; b.y = b.y0 + b.vy * t - 0.5 * G * t * t;
        if (Math.floor(b.t * 20) !== Math.floor((b.t - dt) * 20)) this.rauchAn(b.x, b.y, b.z, 1, (Math.floor(b.t * 20) % 2) ? 0xff8a3a : 0x6a5e56, 1.1);   // Glut-/Rauchspur (W2-C1: kräftiger)
        if (b.t >= b.T) {
          this.bomben.splice(i, 1);
          const C = cfgDinoV().krater || {};
          this._kraterAnlegen(b.s, b.q, wert(C.radius, 2.6), wert(C.dauer, 20), b.auf);
          this.rauchAn(b.x1, b.y1 + 0.5, b.z1, 8, 0x8a7c70, 1.4);
          if (this._erg) this._erg.ereignisse.push({ typ: 'einschlag', art: 'bombe', x: b.x1, z: b.z1, aufStrasse: b.auf });
        }
      }
    }

    /**
     * Krater bei (s, q): Grafik (dunkle Mulde mit Glut) + bei alsHindernis ein Hindernis 'krater' in strecke.hindernisse
     * (collisions.js: Tempo −50 %, Schaden −5 %), beides verschwindet nach dauer s.
     */
    _kraterAnlegen(s, q, r, dauer, alsHindernis) {
      const st = this.strecke, p = st.spline.punktBei(s), x = p.x + p.nx * q, z = p.z + p.nz * q;
      const k = { s, q, x, z, y: st.hoeheAn(x, z), r, bis: this.zeit + dauer, ab: this.zeit, h: null };
      if (alsHindernis && st._hindernisseBerechnen) {
        const h = st._hindernisseBerechnen([{ typ: 'krater', s, seitenabstand: q, radius: r }])[0];
        h.nr = st.hindernisse.length; h.dynamisch = true;
        st.hindernisse.push(h);
        k.h = h;
        this.hindernisVersion = (this.hindernisVersion || 0) + 1;   // W2-C1: main.js → driver.hindernisseSetzen neu
      }
      this.krater.push(k);
      return k;
    }

    /** Abgelaufene Krater entfernen (auch aus strecke.hindernisse). */
    _kraterSchritt() {
      for (let i = this.krater.length - 1; i >= 0; i--) {
        const k = this.krater[i];
        if (this.zeit < k.bis) continue;
        this.krater.splice(i, 1);
        if (k.h) {
          k.h.weg = true;
          const liste = this.strecke.hindernisse, j = liste.indexOf(k.h);
          if (j >= 0) liste.splice(j, 1);
          this.hindernisVersion = (this.hindernisVersion || 0) + 1;
        }
      }
    }

    /**
     * Meteoriten: je Stelle und Runde einmal, sobald der Führende s − vorlauf erreicht: 'flug' (warnZeit s, Schatten +
     * Pfeifen) → Einschlag neben der Fahrbahn (Deko-Krater, Staub) → Felsbrocken rollen über die Straße.
     */
    _meteorSchritt(dt, info) {
      const C = cfgDinoV().meteor || {}, L = this.strecke.laenge, erg = this._erg, f = info.fortschritt;
      for (const m of this.meteorStellen) {
        if (m.phase === 'ruhe') {
          if (f === undefined || f === null) continue;
          const punkt = m.runde * L + m.s - wert(C.vorlauf, 85);
          if (f >= punkt && f > -1) {
            m.runde = Math.max(m.runde + 1, Math.floor((f - (m.s - wert(C.vorlauf, 85))) / L) + 1);
            m.phase = 'flug'; m.zeit = 0;
            m.ablauf.push({ typ: 'warnung', zeit: this.zeit, runde: m.runde });
            const p = this.strecke.spline.punktBei(m.s);
            if (erg) erg.ereignisse.push({ typ: 'meteorWarnung', x: p.x, z: p.z, dauer: wert(C.warnZeit, 2) });
          }
          continue;
        }
        if (m.phase !== 'flug') continue;
        m.zeit += dt;
        const T = wert(C.warnZeit, 2), u = Math.min(1, m.zeit / T), uu = u * u * 0.4 + u * 0.6;   // wird schneller
        m.pos = { x: m.start.x + (m.x - m.start.x) * uu, y: m.start.y + (m.y - m.start.y) * uu, z: m.start.z + (m.z - m.start.z) * uu };
        m.schatten = { x: m.pos.x, z: m.pos.z, y: this.strecke.hoeheAn(m.pos.x, m.pos.z), r: 2 + 5 * u, staerke: 0.25 + 0.5 * u };
        if (Math.floor(m.zeit * 25) !== Math.floor((m.zeit - dt) * 25)) this.rauchAn(m.pos.x, m.pos.y, m.pos.z, 1, 0x8a7e72, 1.0);
        if (u >= 1) {
          m.phase = 'ruhe'; m.pos = null; m.schatten = null;
          m.ablauf.push({ typ: 'einschlag', zeit: this.zeit, runde: m.runde });
          this._kraterAnlegen(m.s, m.stroh.qStart, 3.6, wert(C.kraterDauer, 25), false);
          this.rauchAn(m.x, m.y + 0.5, m.z, 16, 0xb8a888, 2.2);
          if (erg) erg.ereignisse.push({ typ: 'einschlag', art: 'meteor', x: m.x, z: m.z });
          // 3–5 Felsbrocken, gestaffelt (weiter außen = kommen später), leicht verschiedene Tempi
          const a = wert(C.brockenMin, 3), b = wert(C.brockenMax, 5), n = a + Math.floor(this.rnd() * (b - a + 1));
          const st = m.stroh;
          for (let k = 0; k < n; k++) {
            const ball = { s: m.s + (k - (n - 1) / 2) * 3.4 + (this.rnd() - 0.5) * 1.2, q: st.qStart + st.von * k * 1.8, vq: -st.von * st.tempo * (0.85 + this.rnd() * 0.3),
              radius: st.radius, breite: st.breite, winkel: 0, kipp: 0, zustand: 'rollt', zeit: 0, qZiel: 0, x: 0, y: 0, z: 0, nx: 1, nz: 0, tx: 0, tz: 1 };
            this._strohWelt(ball);
            st.ballen.push(ball);
          }
          m.ablauf.push({ typ: 'brocken', zeit: this.zeit, anzahl: n });
        }
      }
    }

    /** Ziel des Flugsauriers: vorderstes Spieler-Auto (sonst vorderstes Auto) aus info.autos [{ vehicle, istSpieler, fortschritt }]. */
    _flugZiel(info) {
      const autos = info.autos || [];
      let best = -1, bestF = -Infinity, spieler = autos.some(a => a && a.istSpieler);
      autos.forEach((a, i) => {
        if (!a || !a.vehicle || (spieler && !a.istSpieler)) return;
        const f = a.fortschritt !== undefined ? a.fortschritt : 0;
        if (f > bestF) { bestF = f; best = i; }
      });
      return best;
    }

    /** Flugsaurier: starten (alle intervall s, Ziel auf der Geraden), anfliegen, über das Auto tauchen, hochziehen. */
    _flugsaurierSchritt(dt, info) {
      const F = this.flugsaurier;
      if (!F) return;
      const C = cfgDinoV().flugsaurier || {}, sp = this.strecke.spline, erg = this._erg, autos = info.autos || [];
      F.timer -= dt;                     // W2-C2: läuft auch während des Anflugs → Start-zu-Start = intervall (40 s)
      if (!F.aktiv) {
        if (F.timer > 0) return;
        const zi = this._flugZiel(info);
        const a = zi >= 0 ? autos[zi] : null;
        if (!a) { F.timer = 1; return; }
        const n = sp.naechster(a.vehicle.x, a.vehicle.z);
        const start = wert(C.start, 60), vor = sp.differenzS(n.s, F.s0), rest = sp.differenzS(F.s1, n.s);
        if (vor < 0 || rest < start + 20 || a.vehicle.imFlug) { F.timer = 1; return; }
        F.aktiv = true; F.ziel = zi; F.s = sp.wrapS(n.s + start); F.q = n.seitenabstand; F.geschrien = false; F.geducked = false;
        F.timer = F.intervall; F.anzahl++; F.zeit = 0;
        F.starts = F.starts || []; F.starts.push(this.zeit);
      }
      const a = autos[F.ziel];
      if (!a || !a.vehicle) { F.aktiv = false; return; }
      const v = a.vehicle, n = sp.naechster(v.x, v.z);
      F.zeit += dt;
      F.s = sp.wrapS(F.s - wert(C.tempo, 24) * dt);
      F.q = n.seitenabstand;
      F.d = sp.differenzS(F.s, n.s);
      const tief = wert(C.tief, 2.5), hoch = wert(C.hoehe, 25), br = wert(C.breite, 34);
      const ueber = tief + (hoch - tief) * (1 - Math.exp(-(F.d / br) * (F.d / br)));
      const p = sp.punktBei(F.s), x = p.x + p.nx * F.q, z = p.z + p.nz * F.q;
      const yAlt = F.y;
      F.x = x; F.z = z;
      F.y = Math.max((v.y || this.strecke.hoeheAn(v.x, v.z)) + ueber, this.strecke.hoeheAn(x, z) + Math.min(ueber, 3));
      F.yaw = Math.atan2(p.tz, -p.tx);                    // fliegt gegen die Fahrtrichtung (Modell-Blick +x)
      F.nicken = F.zeit > dt ? Math.atan2(F.y - yAlt, wert(C.tempo, 24) * dt) : 0;
      F.fluegel = Math.abs(F.d) < br * 1.6 ? 0.25 + 0.05 * Math.sin(F.zeit * 9) : Math.sin(F.zeit * 7) * 0.7;
      // Test-/Sicherheitswert: Höhe über dem Auto, wenn er waagerecht nah dran ist
      if (Math.hypot(F.x - v.x, F.z - v.z) < 3) F.minUeberAuto = Math.min(F.minUeberAuto, F.y - (v.y || 0));
      // W3-H: Schrei gleich beim Auftauchen (60 m voraus, in der Nähe laut), Kamera-Duck wenn er über das Auto stößt
      if (!F.geschrien) { F.geschrien = true; if (erg) erg.ereignisse.push({ typ: 'schrei', x: F.x, z: F.z }); }
      if (!F.geducked && F.d < 22) { F.geducked = true; if (erg) erg.ereignisse.push({ typ: 'duck', nr: F.ziel, staerke: wert(C.duck, 0.6) }); }
      if (F.d < -170) { F.aktiv = false; F.y = -100; }
    }

    /** Rauch/Staub-Wölkchen (nur Optik): n Stück an (x, y, z), Farbe, Größe. */
    rauchAn(x, y, z, n, farbe, groesse) {
      for (let k = 0; k < (n || 1); k++) {
        if (this.puffs.length >= 90) this.puffs.shift();
        const w = this.rnd() * Math.PI * 2, r = (groesse || 1) * 0.6 * this.rnd();
        this.puffs.push({ x: x + Math.cos(w) * r, y, z: z + Math.sin(w) * r, vx: Math.cos(w) * 0.8, vy: 1.8 + this.rnd() * 1.8, vz: Math.sin(w) * 0.8,
          t: 0, dauer: 1.4 + this.rnd() * 1.2, g: (groesse || 1) * (0.6 + this.rnd() * 0.5), farbe: farbe === undefined ? 0x777777 : farbe });
      }
    }

    _puffSchritt(dt) {
      for (let i = this.puffs.length - 1; i >= 0; i--) {
        const p = this.puffs[i];
        p.t += dt;
        if (p.t > p.dauer) { this.puffs.splice(i, 1); continue; }
        p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
        p.vy *= 1 - dt * 0.6;
      }
    }

    // ------------------------------------------------------------------ Grafik

    /** Strandball-Geometrie: 6 Keile (Farbe der Stelle, weiß, gelb, Farbe, weiß, blau), Pol-Kappen weiß. */
    _ballGeo(farbe) {
      const g = new THREE.SphereGeometry(1, 24, 14).toNonIndexed();
      const pos = g.attributes.position, n = pos.count, col = new Float32Array(n * 3), c = new THREE.Color();
      const keile = [farbe, 0xffffff, 0xffe14a, farbe, 0xffffff, 0x4da6ff];
      for (let i = 0; i < n; i += 3) {
        let x = 0, y = 0, z = 0;
        for (let k = 0; k < 3; k++) { x += pos.getX(i + k); y += pos.getY(i + k); z += pos.getZ(i + k); }
        const w = (Math.atan2(z, x) + Math.PI) / (Math.PI * 2);
        c.setHex(Math.abs(y / 3) > 0.9 ? 0xffffff : keile[Math.floor(w * 6) % 6]);
        for (let k = 0; k < 3; k++) col.set([c.r, c.g, c.b], (i + k) * 3);
      }
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      return g;
    }

    /** Warnschild-Textur "Bälle!" (gelbes Schild, rotes Dreieck, drei bunte Bälle) – einmal je Strecke. */
    _schildTextur() {
      const cv = document.createElement('canvas'); cv.width = 256; cv.height = 256;
      const x = cv.getContext('2d');
      x.fillStyle = '#ffd400'; x.strokeStyle = '#d0141c'; x.lineWidth = 14;
      x.beginPath(); x.roundRect ? x.roundRect(8, 8, 240, 240, 26) : x.rect(8, 8, 240, 240); x.fill(); x.stroke();
      x.fillStyle = '#d0141c';
      x.beginPath(); x.moveTo(128, 26); x.lineTo(200, 140); x.lineTo(56, 140); x.closePath(); x.fill();
      x.fillStyle = '#ffd400';
      x.beginPath(); x.moveTo(128, 50); x.lineTo(182, 130); x.lineTo(74, 130); x.closePath(); x.fill();
      x.fillStyle = '#111'; x.font = 'bold 64px Arial, sans-serif'; x.textAlign = 'center'; x.fillText('!', 128, 126);
      x.font = 'bold 50px Arial, sans-serif'; x.fillText('BÄLLE!', 128, 196);
      [['#ff4f8b', 70], ['#45a8ff', 128], ['#4cd97b', 186]].forEach(([f, cx]) => {
        x.fillStyle = f; x.beginPath(); x.arc(cx, 226, 13, 0, Math.PI * 2); x.fill();
      });
      const t = new THREE.CanvasTexture(cv);
      if ('colorSpace' in t) t.colorSpace = THREE.SRGBColorSpace;
      return t;
    }

    /**
     * Gruppe 'Dynamik': Bälle (je Stelle ein InstancedMesh, max. 3 gleichzeitig), Warnschilder 100 m vor
     * den Ballstellen, Düsenplatten, Fontänen (transparenter Kegel + Schaumkrone) und Spritzer.
     */
    bauen() {
      const g = new THREE.Group();
      g.name = 'Dynamik';
      const st = this.strecke, sp = st.spline, C = cfg();
      this._ballMeshes = this.stellen.map((s) => {
        const m = new THREE.InstancedMesh(this._ballGeo(s.farbe), new THREE.MeshPhongMaterial({ vertexColors: true, shininess: 80, specular: 0x555555 }), 3);
        m.count = 0; m.frustumCulled = false; m.name = 'Baelle';
        g.add(m);
        return m;
      });
      // Warnschilder (am rechten Rand, schauen den Autos entgegen)
      if (this.stellen.length && typeof document !== 'undefined') {
        const tex = this._schildTextur(), warn = wert((C.baelle || {}).warnAbstand, 100);
        const schildMat = new THREE.MeshLambertMaterial({ map: tex });
        const pfosten = [];
        this.stellen.forEach((s) => {
          const p = sp.punktBei(s.s - warn), q = st.breite / 2 + st.randBreite + 1.6;
          const x = p.x + p.nx * q, z = p.z + p.nz * q, y = st.hoeheAn(x, z);
          const blick = Math.atan2(-p.tx, -p.tz);     // Vorderseite (+z der Ebene) zeigt den Autos entgegen
          const schild = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 2.6), schildMat);
          schild.position.set(x, y + 3.6, z); schild.rotation.y = blick; schild.name = 'Warnschild';
          g.add(schild);
          const ruecken = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 2.6), new THREE.MeshLambertMaterial({ color: 0xb0b0b0 }));
          ruecken.position.copy(schild.position); ruecken.rotation.y = blick + Math.PI; ruecken.name = 'Warnschild';
          g.add(ruecken);
          const pf = new THREE.CylinderGeometry(0.09, 0.09, 2.4, 6); pf.translate(x, y + 1.2, z);
          pfosten.push(pf);
        });
        pfosten.forEach((pf) => { const m = new THREE.Mesh(pf, new THREE.MeshLambertMaterial({ color: 0x9a9aa8 })); m.name = 'Warnschild'; g.add(m); });
      }
      // Düsen: Bodenplatte + Fontäne + Schaumkrone + Spritzer
      const hoehe = wert((C.wasser || {}).hoehe, 8);
      this._fontaenen = this.duesen.map((d) => {
        const p = sp.punktBei(d.s);
        const platte = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.6, 0.14, 20), new THREE.MeshLambertMaterial({ color: 0x9fe8ff }));
        platte.position.set(d.x, d.y + 0.08, d.z); platte.name = 'Duese';
        const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.75, 0.16, 16), new THREE.MeshLambertMaterial({ color: 0x2f7fd0 }));
        ring.position.set(d.x, d.y + 0.1, d.z); ring.name = 'Duese';
        g.add(platte); g.add(ring);
        const kegelGeo = new THREE.CylinderGeometry(1.35, 0.55, 1, 20, 1, true); kegelGeo.translate(0, 0.5, 0);
        const strahl = new THREE.Mesh(kegelGeo, new THREE.MeshPhongMaterial({ color: 0x5cc8ff, emissive: 0x1a4a70, transparent: true, opacity: 0.78,
          shininess: 90, specular: 0xffffff, side: THREE.DoubleSide, depthWrite: false }));
        strahl.position.set(d.x, d.y + 0.1, d.z); strahl.visible = false; strahl.name = 'Fontaene';
        strahl.userData.hoehe = hoehe;
        const krone = new THREE.Mesh(new THREE.IcosahedronGeometry(2.0, 1), new THREE.MeshPhongMaterial({ color: 0xf2fbff, emissive: 0x30506a, transparent: true, opacity: 0.85, depthWrite: false }));
        krone.visible = false; krone.name = 'Fontaene';
        g.add(strahl); g.add(krone);
        return { d, strahl, krone, tx: p.tx, tz: p.tz };
      });
      if (this.duesen.length) {
        const n = this.duesen.length * 14;
        const m = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.3, 0), new THREE.MeshPhongMaterial({ color: 0x9fe0ff, emissive: 0x204060, shininess: 80 }), n);
        m.count = n; m.frustumCulled = false; m.name = 'Spritzer';
        g.add(m);
        this._spritzer = m;
        // feste Zufallswerte je Tropfen (Richtung, Tempo, Versatz)
        const rnd = zufall(77);
        this._tropfen = [];
        for (let i = 0; i < n; i++) this._tropfen.push({ w: rnd() * Math.PI * 2, r: 0.4 + rnd() * 1.0, h: 0.6 + rnd() * 1.2, t0: rnd() });
      }
      // Runde 4: Strohballen – ein InstancedMesh für alle Stellen (höchstens 4 je Stelle gleichzeitig)
      if (this.strohStellen.length) {
        const plaetze = this.strohStellen.reduce((a, st) => a + (st.max || 4), 0);   // Runde 6: Meteor-Stellen bis 5
        const m = this.felsOptik
          ? new THREE.InstancedMesh(this._felsGeo(), new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }), plaetze)
          : new THREE.InstancedMesh(this._strohGeo(), new THREE.MeshLambertMaterial({ vertexColors: true, emissive: 0x2a1e06 }), plaetze);
        m.count = 0; m.frustumCulled = false; m.name = 'Strohballen';
        g.add(m);
        this._strohMesh = m;
      }
      // Runde 5b: Dinos – je Art ein InstancedMesh für die Körper und eins für die Beine (je Stelle höchstens 2 gleichzeitig)
      this._dinoMeshes = {};
      if (this.dinoStellen.length && R.themes && R.themes.dinoTeile) {
        const arten = [...new Set(this.dinoStellen.map(s => s.art))];
        arten.forEach((art) => {
          const teile = R.themes.dinoTeile(art), n = this.dinoStellen.filter(s => s.art === art).length * 2;
          const mat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
          const koerper = new THREE.InstancedMesh(teile.koerper, mat, n);
          const beine = new THREE.InstancedMesh(teile.bein, mat, n * teile.huefte.length);
          koerper.count = 0; beine.count = 0; koerper.frustumCulled = false; beine.frustumCulled = false;
          koerper.name = 'Dino'; beine.name = 'DinoBeine';
          g.add(koerper); g.add(beine);
          this._dinoMeshes[art] = { koerper, beine, huefte: teile.huefte };
        });
      }
      this._m4 = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._v = new THREE.Vector3(); this._sk = new THREE.Vector3();
      this._achse = new THREE.Vector3();
      this._extraGrafik(g);      // Runde 6 (W2-C): Tiere, Krater, Bomben, Meteor + Schatten, Rauch/Staub, Flugsaurier
      this.animieren(0);
      return g;
    }

    /**
     * Rundballen-Geometrie (Einheitsmaße: Radius 1, Länge 1 längs y): Mantel strohgelb mit leichten
     * Streifen, Stirnseiten mit dunklen Ringen (Wickel-Spirale), Ränder etwas dunkler. Vertex-Farben.
     */
    _strohGeo() {
      const pos = [], col = [], c = new THREE.Color();
      const N = 20, RINGE = 6;
      const ton = (x) => { c.setRGB(0.86 * x, 0.68 * x, 0.30 * x); return [c.r, c.g, c.b]; };
      const tri = (a, b, d, fa, fb, fd) => { pos.push(...a, ...b, ...d); col.push(...fa, ...fb, ...fd); };
      for (let k = 0; k < N; k++) {
        const w0 = k / N * Math.PI * 2, w1 = (k + 1) / N * Math.PI * 2;
        const c0 = Math.cos(w0), s0 = Math.sin(w0), c1 = Math.cos(w1), s1 = Math.sin(w1);
        // Mantel in 3 Bändern (Ränder dunkler, Mitte hell, Streifen je Segment)
        const band = [-0.5, -0.42, 0.42, 0.5], hell = [0.8, 1.0, 0.8];
        for (let b = 0; b < 3; b++) {
          const f = ton(hell[b] * (k % 2 ? 0.93 : 1.0));
          const y0 = band[b], y1 = band[b + 1];
          tri([c0, y0, s0], [c0, y1, s0], [c1, y1, s1], f, f, f);
          tri([c0, y0, s0], [c1, y1, s1], [c1, y0, s1], f, f, f);
        }
        // Stirnseiten: Ringe (abwechselnd hell/dunkel), Umlaufsinn nach außen
        for (const yy of [0.5, -0.5]) {
          for (let r = 0; r < RINGE; r++) {
            const ra = r / RINGE, rb = (r + 1) / RINGE;
            const f = ton(r % 2 ? 0.55 : 0.9);
            const A = [c0 * ra, yy, s0 * ra], B = [c1 * ra, yy, s1 * ra], Cc = [c1 * rb, yy, s1 * rb], D = [c0 * rb, yy, s0 * rb];
            // v28 W6: Umlaufsinn war verkehrt herum (Kappen zeigten nach innen → von außen unsichtbar, Ballen wirkte wie ein offenes Rohr)
            if (yy > 0) { tri(A, B, Cc, f, f, f); tri(A, Cc, D, f, f, f); }
            else { tri(A, Cc, B, f, f, f); tri(A, D, Cc, f, f, f); }
          }
        }
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
      geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(col), 3));
      geo.computeVertexNormals();
      return geo;
    }

    /**
     * Runde 5b: Felsbrocken statt Strohballen (Einheitsmaße wie der Rundballen: Radius 1 quer, Länge 1 längs y):
     * unregelmäßiger, grau-brauner Brocken mit helleren Kanten (Vertex-Farben).
     */
    _felsGeo() {
      const g = new THREE.DodecahedronGeometry(1, 1).toNonIndexed();
      const pos = g.attributes.position, n = pos.count, col = new Float32Array(n * 3), c = new THREE.Color(), rnd = zufall(515);
      // Knubbelig verformen (gleiche Ecke → gleicher Versatz, sonst reißt die Fläche auf)
      const versatz = new Map();
      for (let i = 0; i < n; i++) {
        const key = [pos.getX(i), pos.getY(i), pos.getZ(i)].map(v => v.toFixed(3)).join(',');
        if (!versatz.has(key)) versatz.set(key, 0.82 + rnd() * 0.3);
        const f = versatz.get(key);
        pos.setXYZ(i, pos.getX(i) * f, pos.getY(i) * f * 0.5, pos.getZ(i) * f);
      }
      for (let i = 0; i < n; i += 3) {
        c.setHSL(0.07 + rnd() * 0.04, 0.12 + rnd() * 0.1, 0.3 + rnd() * 0.16);
        for (let k = 0; k < 3; k++) col.set([c.r, c.g, c.b], (i + k) * 3);
      }
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      g.computeVertexNormals();
      return g;
    }

    /** Optik je Frame: Bälle (Position + Rollen), Fontänen (Skalierung), Spritzer. */
    animieren() {
      if (!this._m4) return;
      const m4 = this._m4, q = this._q, v = this._v, sk = this._sk, achse = this._achse, t = this.zeit;
      this.stellen.forEach((st, k) => {
        const mesh = this._ballMeshes[k];
        let n = 0;
        for (const b of st.baelle) {
          if (n >= 3) break;
          // Rollen: Achse = oben × Bewegungsrichtung (quer zur Straße)
          if (b.zustand === 'rollt') achse.set(-b.nz * Math.sign(b.vq), 0, b.nx * Math.sign(b.vq)).normalize();
          else achse.set(1, 0, 0);
          q.setFromAxisAngle(achse, b.winkel);
          v.set(b.x, b.y, b.z); sk.setScalar(b.radius * (b.zustand === 'weg' ? Math.max(0.2, 1 - b.zeit / 1.4) : 1));
          m4.compose(v, q, sk);
          mesh.setMatrixAt(n++, m4);
        }
        mesh.count = n;
        mesh.instanceMatrix.needsUpdate = true;
      });
      // Strohballen: Zylinderachse (Einheits-y) längs der Straße; rollen = Drehung um diese Achse,
      // gekippt = Achse kippt nach oben (Ballen liegt auf der Stirnseite)
      if (this._strohMesh) {
        const m = this._strohMesh, qa = this._qa || (this._qa = new THREE.Quaternion()), qr = this._qr || (this._qr = new THREE.Quaternion());
        const yAchse = this._yAchse || (this._yAchse = new THREE.Vector3(0, 1, 0)), ziel = this._ziel || (this._ziel = new THREE.Vector3());
        let n = 0;
        for (const st of this.strohStellen) {
          let je = 0;
          for (const b of st.ballen) {
            if (je++ >= (st.max || 4)) break;
            // Grundlage: y-Achse → Tangente (liegt), dann um die Tangente rollen
            ziel.set(b.tx, 0, b.tz).normalize();
            qa.setFromUnitVectors(yAchse, ziel);
            qr.setFromAxisAngle(ziel, b.winkel);
            q.multiplyQuaternions(qr, qa);
            if (b.kipp > 0) {
              // Kippen um die Querachse (Normale) bis zu 90°: Achse zeigt dann nach oben
              achse.set(b.nx, 0, b.nz).normalize();
              qr.setFromAxisAngle(achse, -b.kipp * Math.PI / 2);
              q.premultiply(qr);
            }
            const fg = this.felsOptik ? 1.35 : 1;      // Felsbrocken optisch etwas größer (Kontakt wie Strohballen)
            v.set(b.x, b.y + (fg - 1) * b.radius * 0.5, b.z); sk.set(b.radius * fg, b.breite * fg, b.radius * fg);
            m4.compose(v, q, sk);
            m.setMatrixAt(n++, m4);
          }
        }
        m.count = n;
        m.instanceMatrix.needsUpdate = true;
      }
      // Runde 5b: Dinos – Körper wippt leicht, Beine pendeln (diagonal gegengleich)
      const dm = this._dinoMeshes;
      if (dm && Object.keys(dm).length) {
        const zaehler = {};
        Object.keys(dm).forEach((a) => { zaehler[a] = { k: 0, b: 0 }; });
        const qb = this._qb || (this._qb = new THREE.Quaternion()), zAchse = this._zAchse || (this._zAchse = new THREE.Vector3(0, 0, 1));
        const yAchse = this._yAchse2 || (this._yAchse2 = new THREE.Vector3(0, 1, 0)), m4b = this._m4b || (this._m4b = new THREE.Matrix4());
        const hv = this._hv || (this._hv = new THREE.Vector3());
        for (const st of this.dinoStellen) {
          const M = dm[st.art]; if (!M) continue;
          let je = 0;
          for (const d of st.dinos) {
            if (je++ >= 2) break;
            const zz = zaehler[st.art], wipp = d.zustand === 'steht' ? 0 : Math.abs(Math.sin(d.phase)) * (st.art === 'langhals' ? 0.18 : 0.12);
            // Blickrichtung +x des Modells → Laufrichtung (lx, lz); Runde 6: stehend Kopf senken (Körper nickt nach vorn)
            q.setFromAxisAngle(yAchse, Math.atan2(-d.lz, d.lx));
            if (Math.abs(d.kopf) > 0.01) { qb.setFromAxisAngle(zAchse, -(d.kopf || 0) * (st.art === 'langhals' ? 0.12 : 0.17)); q.multiply(qb); }
            v.set(d.x, d.y + wipp - Math.max(0, d.kopf || 0) * 0.12, d.z); sk.setScalar(1);
            m4.compose(v, q, sk);
            M.koerper.setMatrixAt(zz.k++, m4);
            M.huefte.forEach((h, j) => {
              const gegen = (j === 0 || j === 3) ? 1 : -1;               // vorne links + hinten rechts zusammen
              qb.setFromAxisAngle(zAchse, Math.sin(d.phase) * 0.45 * gegen);
              hv.set(h[0], h[1], h[2]);
              m4b.compose(hv, qb, sk);
              this._m4c = this._m4c || new THREE.Matrix4();
              this._m4c.multiplyMatrices(m4, m4b);
              M.beine.setMatrixAt(zz.b++, this._m4c);
            });
          }
        }
        Object.keys(dm).forEach((a) => {
          dm[a].koerper.count = zaehler[a].k; dm[a].beine.count = zaehler[a].b;
          dm[a].koerper.instanceMatrix.needsUpdate = true; dm[a].beine.instanceMatrix.needsUpdate = true;
        });
      }
      const tr = this._tropfen;
      this._fontaenen.forEach((F, k) => {
        const d = F.d, z = this.duesenZustand(d, t);
        const h = F.strahl.userData.hoehe;
        if (z.zustand === 'aktiv') {
          // schnell hoch, oben halten (leichtes Wabern), am Ende schnell runter
          const auf = Math.min(1, z.phase / 0.12), ab = Math.min(1, (1 - z.phase) / 0.15), s = Math.min(auf, ab);
          const wab = 1 + 0.06 * Math.sin(t * 23 + k);
          F.strahl.visible = s > 0.01;
          F.strahl.scale.set(wab, Math.max(0.01, h * s), wab);
          F.krone.visible = s > 0.2;
          F.krone.position.set(d.x, d.y + h * s + 0.2, d.z);
          F.krone.scale.setScalar((0.7 + 0.3 * s) * (1 + 0.1 * Math.sin(t * 17)));
        } else { F.strahl.visible = false; F.krone.visible = false; }
        // Spritzer: Blubbern = kleine Hüpfer über der Platte, Fontäne = Tropfen fallen außen herunter
        for (let i = 0; i < 14; i++) {
          const T = tr[k * 14 + i];
          let x = d.x, y = d.y - 5, zz = d.z, s = 0;
          if (z.zustand === 'blubbern') {
            const u = (z.phase * 3 + T.t0) % 1;
            x = d.x + Math.cos(T.w) * T.r * 0.6; zz = d.z + Math.sin(T.w) * T.r * 0.6;
            y = d.y + 0.15 + 4 * T.h * 0.5 * u * (1 - u); s = 0.8;
          } else if (z.zustand === 'aktiv') {
            const u = (z.phase * 4 + T.t0) % 1;
            const rr = 0.8 + (T.r + 1.2) * u;
            x = d.x + Math.cos(T.w) * rr; zz = d.z + Math.sin(T.w) * rr;
            y = d.y + h * 0.9 * (1 - u * u); s = 1.4;
          }
          v.set(x, y, zz); q.identity(); sk.setScalar(s);
          m4.compose(v, q, sk);
          this._spritzer.setMatrixAt(k * 14 + i, m4);
        }
      });
      if (this._spritzer) this._spritzer.instanceMatrix.needsUpdate = true;
      this._extraAnimieren();    // Runde 6 (W2-C)
    }

    // ------------------------------------------------------------------ Runde 6 (W2-C): Grafik

    /** Teile [{ geo, farbe }] zu einer nicht indizierten Geometrie mit Vertex-Farben vereinen. */
    _vereinen(teile) {
      const flach = teile.map(t => ({ g: t.geo.index ? t.geo.toNonIndexed() : t.geo, farbe: t.farbe }));
      const n = flach.reduce((a, t) => a + t.g.attributes.position.count, 0);
      const pos = new Float32Array(n * 3), col = new Float32Array(n * 3), c = new THREE.Color();
      let o = 0;
      flach.forEach(({ g, farbe }) => {
        const k = g.attributes.position.count;
        pos.set(g.attributes.position.array, o * 3);
        c.set(farbe);
        for (let i = 0; i < k; i++) { col[(o + i) * 3] = c.r; col[(o + i) * 3 + 1] = c.g; col[(o + i) * 3 + 2] = c.b; }
        o += k;
      });
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
      geo.computeVertexNormals();
      return geo;
    }

    /**
     * Low-Poly-Wildtiere aus Boxen/Zylindern (Blickrichtung +x, Ursprung am Boden unter der Körpermitte):
     * Reh (schlank, rehbraun, weißer Spiegel): koerper, kopf (Hals + Kopf, Drehpunkt an der Schulter), geweih, bein.
     * Bär (groß, dunkelbraun): koerper (mit Kopf), bein. Beine hängen von der Hüfte nach −y (Drehung um z).
     */
    _tierGeos() {
      const box = (sx, sy, sz, x, y, z, rz) => { const g = new THREE.BoxGeometry(sx, sy, sz); if (rz) g.rotateZ(rz); g.translate(x, y, z); return g; };
      const zyl = (r0, r1, l, x, y, z, rz) => { const g = new THREE.CylinderGeometry(r1, r0, l, 6); g.translate(0, -l / 2, 0); if (rz) g.rotateZ(rz); g.translate(x, y, z); return g; };
      const braun = 0xa0673a, hell = 0xd8b48a, dunkel = 0x2a1a10;
      const reh = {
        koerper: this._vereinen([{ geo: box(1.25, 0.5, 0.42, 0, 1.08, 0), farbe: braun }, { geo: box(1.0, 0.18, 0.36, 0, 0.84, 0), farbe: hell },
          { geo: box(0.16, 0.3, 0.3, -0.66, 1.12, 0), farbe: 0xf4efe6 }, { geo: box(0.12, 0.16, 0.12, -0.7, 1.3, 0), farbe: 0xf4efe6 }]),
        // Hals + Kopf: Drehpunkt (Schulter) im Ursprung, Kopf vorn oben
        kopf: this._vereinen([{ geo: box(0.2, 0.62, 0.2, 0.12, 0.26, 0, -0.45), farbe: braun },
          { geo: box(0.42, 0.22, 0.22, 0.42, 0.58, 0), farbe: braun }, { geo: box(0.16, 0.14, 0.16, 0.66, 0.53, 0), farbe: 0x3a2a20 },
          { geo: box(0.08, 0.2, 0.12, 0.3, 0.76, 0.12, 0.3), farbe: braun }, { geo: box(0.08, 0.2, 0.12, 0.3, 0.76, -0.12, 0.3), farbe: braun },
          { geo: box(0.05, 0.05, 0.05, 0.55, 0.64, 0.115), farbe: 0x111111 }, { geo: box(0.05, 0.05, 0.05, 0.55, 0.64, -0.115), farbe: 0x111111 }]),
        geweih: this._vereinen([-1, 1].reduce((a, sg) => a.concat([
          { geo: zyl(0.035, 0.025, 0.42, 0.38, 1.06, 0.1 * sg, -0.25), farbe: 0xe8d8b0 },
          { geo: zyl(0.025, 0.018, 0.2, 0.42, 0.9, 0.1 * sg, -1.0), farbe: 0xe8d8b0 },
          { geo: zyl(0.025, 0.018, 0.2, 0.33, 1.0, 0.1 * sg, 0.7), farbe: 0xe8d8b0 }]), [])),
        bein: this._vereinen([{ geo: zyl(0.06, 0.04, 0.8, 0, 0, 0), farbe: braun }, { geo: box(0.08, 0.06, 0.1, 0.01, -0.8, 0), farbe: dunkel }]),
        kopfPunkt: [0.5, 1.2, 0], huefte: [[0.48, 0.86, 0.14], [0.48, 0.86, -0.14], [-0.48, 0.86, 0.14], [-0.48, 0.86, -0.14]],
      };
      const bf = 0x5e3b20, bs = 0xa07a52;     // W2-C2: etwas heller (vorher fast schwarz), Schnauze hellbraun
      const baer = {
        koerper: this._vereinen([{ geo: box(1.8, 0.95, 1.0, 0, 1.05, 0), farbe: bf }, { geo: box(0.7, 0.5, 0.9, 0.55, 1.5, 0), farbe: bf },
          { geo: box(0.55, 0.5, 0.55, 1.1, 1.25, 0), farbe: bf }, { geo: box(0.28, 0.24, 0.3, 1.45, 1.15, 0), farbe: bs },
          { geo: box(0.1, 0.1, 0.12, 1.6, 1.22, 0), farbe: 0x111111 },
          { geo: box(0.14, 0.16, 0.12, 1.05, 1.56, 0.2), farbe: bf }, { geo: box(0.14, 0.16, 0.12, 1.05, 1.56, -0.2), farbe: bf },
          { geo: box(0.06, 0.06, 0.06, 1.35, 1.38, 0.15), farbe: 0x111111 }, { geo: box(0.06, 0.06, 0.06, 1.35, 1.38, -0.15), farbe: 0x111111 },
          { geo: box(0.2, 0.2, 0.2, -0.95, 1.2, 0), farbe: bf }]),
        bein: this._vereinen([{ geo: zyl(0.19, 0.16, 0.62, 0, 0, 0), farbe: bf }, { geo: box(0.32, 0.12, 0.34, 0.05, -0.62, 0), farbe: 0x2e1d12 }]),
        huefte: [[0.62, 0.66, 0.3], [0.62, 0.66, -0.3], [-0.62, 0.66, 0.3], [-0.62, 0.66, -0.3]],
      };
      // W2-C2: Größe stimmig zum Auto – Reh (Kopf) ~1,2 m, Bär (Buckel) ~1,5 m; Gelenkpunkte mitskalieren
      const skalieren = (tier, f) => {
        Object.keys(tier).forEach((k) => { if (tier[k] && tier[k].isBufferGeometry) { tier[k].scale(f, f, f); tier[k].computeBoundingBox(); } });
        if (tier.kopfPunkt) tier.kopfPunkt = tier.kopfPunkt.map(x => x * f);
        tier.huefte = tier.huefte.map(h => h.map(x => x * f));
      };
      skalieren(reh, TIER_GROESSE.reh); skalieren(baer, TIER_GROESSE.baer);
      return { reh, baer };
    }

    /** Flugsaurier (Low-Poly, generisch): Rumpf mit Kopf, Schnabel, Kamm (Blick +x), Flügel einzeln (Drehpunkt an der Schulter). */
    _flugsaurierGruppe() {
      const grp = new THREE.Group(); grp.name = 'Flugsaurier';
      const haut = 0x7a5a8a, bauch = 0xc8b0a0, mat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, side: THREE.DoubleSide });
      const ell = (rx, ry, rz, x, y, z) => { const g = new THREE.SphereGeometry(1, 8, 6); g.scale(rx, ry, rz); g.translate(x, y, z); return g; };
      const kegel = (r, l, x, y, z, rz) => { const g = new THREE.ConeGeometry(r, l, 6); g.rotateZ(rz); g.translate(x, y, z); return g; };
      const rumpf = this._vereinen([{ geo: ell(1.0, 0.32, 0.34, 0, 0, 0), farbe: haut }, { geo: ell(0.8, 0.2, 0.26, 0, -0.12, 0), farbe: bauch },
        { geo: ell(0.42, 0.26, 0.22, 1.2, 0.18, 0), farbe: haut }, { geo: kegel(0.13, 1.3, 2.0, 0.12, 0, -Math.PI / 2 + 0.08), farbe: 0xe0c060 },
        { geo: kegel(0.12, 1.1, 0.75, 0.55, 0, Math.PI / 2 + 0.5), farbe: 0xd04030 }, { geo: kegel(0.12, 1.0, -1.35, 0, 0, Math.PI / 2), farbe: haut },
        { geo: ell(0.05, 0.05, 0.05, 1.42, 0.3, 0.17), farbe: 0x111111 }, { geo: ell(0.05, 0.05, 0.05, 1.42, 0.3, -0.17), farbe: 0x111111 }]);
      grp.add(new THREE.Mesh(rumpf, mat));
      // Flügel: Dreieck-Haut von der Schulter (0,0,0) nach außen (z), lokal; zwei Spiegelungen
      const fluegelGeo = (sg) => {
        const pos = [0.5, 0, 0, -0.6, 0, 0, 0.1, 0, 4.2 * sg, 0.5, 0, 0, 0.1, 0, 4.2 * sg, 0.9, 0.05, 2.0 * sg];
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
        const c = new THREE.Color(0x9a6aa0), col = [];
        for (let i = 0; i < 6; i++) col.push(c.r, c.g, c.b);
        g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(col), 3));
        g.computeVertexNormals();
        return g;
      };
      this._fluegel = [-1, 1].map((sg) => { const m = new THREE.Mesh(fluegelGeo(sg), mat); m.position.set(0.1, 0.1, 0.25 * sg); m.userData.sg = sg; grp.add(m); return m; });
      grp.visible = false;
      return grp;
    }

    /** Grafik der Runde-6-Teile (nur was die Strecke braucht): Tiere, Krater, Bomben/Meteor, Schatten, Rauch, Flugsaurier. */
    _extraGrafik(g) {
      const imesh = (geo, mat, n, name) => { const m = new THREE.InstancedMesh(geo, mat, Math.max(1, n)); m.count = 0; m.frustumCulled = false; m.name = name; g.add(m); return m; };
      const rehStellen = this.tierStellen.filter(s => s.art === 'reh').length, baerStellen = this.tierStellen.filter(s => s.art === 'baer').length;
      const nReh = rehStellen * 2 + this.grasendeRehe.length;
      this._tierM = null;
      if (nReh || baerStellen) {
        const T = this._tierGeos(), mat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
        this._tierM = { T };
        if (nReh) Object.assign(this._tierM, { rehK: imesh(T.reh.koerper, mat, nReh, 'Reh'), rehKopf: imesh(T.reh.kopf, mat, nReh, 'Reh'),
          rehGeweih: imesh(T.reh.geweih, mat, nReh, 'Reh'), rehBein: imesh(T.reh.bein, mat, nReh * 4, 'RehBeine') });
        if (baerStellen) Object.assign(this._tierM, { baerK: imesh(T.baer.koerper, mat, baerStellen * 2, 'Baer'), baerBein: imesh(T.baer.bein, mat, baerStellen * 8, 'BaerBeine') });
      }
      const ereignisse = this.ereignisseAn && (this.vulkan || this.meteorStellen.length || this.flugsaurier);
      this._kraterM = null; this._bombeM = null; this._schattenM = null; this._puffM = null; this._flugGrp = null;
      if (ereignisse || this.tierStellen.length) {
        // Rauch/Staub (auch für Lava-Treffer, main.js → rauchAn)
        this._puffM = imesh(new THREE.SphereGeometry(1, 10, 7), new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0.42, depthWrite: false }), 90, 'Rauch');
      }
      if (!ereignisse) return;
      // Krater: dunkle Mulde (Kegelstumpf, Rand erhaben) + glühender Kern (pulsiert)
      const mulde = new THREE.CylinderGeometry(1.0, 1.25, 0.25, 14, 1, true); mulde.translate(0, 0.02, 0);
      const boden = new THREE.CircleGeometry(1.0, 14); boden.rotateX(-Math.PI / 2); boden.translate(0, 0.1, 0);
      const ring = new THREE.TorusGeometry(1.1, 0.18, 4, 14); ring.rotateX(Math.PI / 2); ring.translate(0, 0.14, 0);
      const kraterGeo = this._vereinen([{ geo: boden, farbe: 0x1e1612 }, { geo: mulde, farbe: 0x2e2420 }, { geo: ring, farbe: 0x4a3a30 }]);
      this._kraterM = imesh(kraterGeo, new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -6 }), 16, 'Krater');
      const glut = new THREE.CircleGeometry(0.55, 10); glut.rotateX(-Math.PI / 2); glut.translate(0, 0.13, 0);
      this._glutM = imesh(glut, new THREE.MeshBasicMaterial({ color: 0xff7a1a, polygonOffset: true, polygonOffsetFactor: -8, polygonOffsetUnits: -8 }), 16, 'KraterGlut');
      // Lavabomben + Meteor: glühende Klumpen (leuchten ohne Licht)
      this._bombeM = imesh(new THREE.DodecahedronGeometry(1, 0), new THREE.MeshBasicMaterial({ color: 0xff7a1a, fog: false }), 10, 'Lavabombe');
      this._bombeKernM = imesh(new THREE.IcosahedronGeometry(1, 0), new THREE.MeshBasicMaterial({ color: 0xffe08a, fog: false }), 10, 'Lavabombe');
      // Schatten (Meteor + Bomben): dunkle Scheibe auf dem Boden
      const sch = new THREE.CircleGeometry(1, 20); sch.rotateX(-Math.PI / 2);
      this._schattenM = imesh(sch, new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.5, depthWrite: false,
        polygonOffset: true, polygonOffsetFactor: -10, polygonOffsetUnits: -10 }), 12, 'Schatten');
      if (this.flugsaurier) {
        this._flugGrp = this._flugsaurierGruppe(); g.add(this._flugGrp);
        // W3-H: Schatten auf der Straße (weiche dunkle Ellipse unter dem Flugsaurier, wird beim Annähern größer und dunkler)
        const sg = new THREE.CircleGeometry(1, 24); sg.rotateX(-Math.PI / 2);
        this._flugSchatten = new THREE.Mesh(sg, new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.4, depthWrite: false,
          polygonOffset: true, polygonOffsetFactor: -10, polygonOffsetUnits: -10 }));
        this._flugSchatten.name = 'FlugsaurierSchatten'; this._flugSchatten.visible = false; this._flugSchatten.renderOrder = 2;
        g.add(this._flugSchatten);
      }
    }

    /** Optik je Frame für die Runde-6-Teile. */
    _extraAnimieren() {
      const m4 = this._m4, q = this._q, v = this._v, sk = this._sk, t = this.zeit;
      const qb = this._qx1 || (this._qx1 = new THREE.Quaternion()), yA = this._yA || (this._yA = new THREE.Vector3(0, 1, 0));
      const zA = this._zA || (this._zA = new THREE.Vector3(0, 0, 1)), m4b = this._m4x || (this._m4x = new THREE.Matrix4());
      const m4c = this._m4y || (this._m4y = new THREE.Matrix4()), hv = this._hvx || (this._hvx = new THREE.Vector3());
      const eins = this._eins || (this._eins = new THREE.Vector3(1, 1, 1));
      const TM = this._tierM;
      if (TM) {
        const z = { rk: 0, rb: 0, bk: 0, bb: 0 };
        const reh = (r) => {
          if (!TM.rehK) return;
          q.setFromAxisAngle(yA, Math.atan2(-r.lz, r.lx));
          v.set(r.x, r.y + (r.sprung || 0), r.z);
          m4.compose(v, q, eins);
          TM.rehK.setMatrixAt(z.rk, m4);
          // Kopf: grasen (nicken nach unten) bzw. schauen (zur Seite, zu den Autos) – Drehpunkt Schulter
          let nick = 0, dreh = 0;
          if (r.zustand === 'grast') { const u = Math.sin(r.phase * 0.7); nick = u > -0.3 ? 1.15 : 0.15; dreh = u < -0.6 ? 0.5 * Math.sin(r.phase * 0.4) : 0; }
          else if (r.art === 'reh') { dreh = (r.kopfDreh || 0) * 0.95 * (Math.sign(r.vq || 1)); nick = r.zustand === 'laeuft' ? -0.1 : 0; }
          const KP = TM.T.reh.kopfPunkt;
          const eul = this._eul || (this._eul = new THREE.Euler());
          eul.set(0, dreh, -nick, 'YXZ'); qb.setFromEuler(eul);
          hv.set(KP[0], KP[1], KP[2]); m4b.compose(hv, qb, eins); m4c.multiplyMatrices(m4, m4b);
          TM.rehKopf.setMatrixAt(z.rk, m4c);
          if (r.geweih) TM.rehGeweih.setMatrixAt(z.rk, m4c);
          else { m4c.makeScale(0, 0, 0); TM.rehGeweih.setMatrixAt(z.rk, m4c); }
          // Beine: im Sprung vorne/hinten gestreckt, grasend still
          const sw = r.zustand === 'laeuft' ? Math.sin(r.beinPhase * Math.PI * 2) * 0.6 : 0;
          TM.T.reh.huefte.forEach((h, j) => {
            qb.setFromAxisAngle(zA, j < 2 ? sw : -sw);
            hv.set(h[0], h[1], h[2]); m4b.compose(hv, qb, eins); m4c.multiplyMatrices(m4, m4b);
            TM.rehBein.setMatrixAt(z.rb++, m4c);
          });
          z.rk++;
        };
        for (const r of this.grasendeRehe) reh(r);
        for (const st of this.tierStellen) {
          let je = 0;
          for (const tt of st.tiere) {
            if (je++ >= 2) break;
            if (tt.art === 'reh') { reh(tt); continue; }
            if (!TM.baerK) continue;
            q.setFromAxisAngle(yA, Math.atan2(-tt.lz, tt.lx));
            v.set(tt.x, tt.y + (tt.sprung || 0), tt.z);
            m4.compose(v, q, eins);
            TM.baerK.setMatrixAt(z.bk++, m4);
            TM.T.baer.huefte.forEach((h, j) => {
              const gegen = (j === 0 || j === 3) ? 1 : -1;
              qb.setFromAxisAngle(zA, Math.sin(tt.beinPhase) * 0.5 * gegen);
              hv.set(h[0], h[1], h[2]); m4b.compose(hv, qb, eins); m4c.multiplyMatrices(m4, m4b);
              TM.baerBein.setMatrixAt(z.bb++, m4c);
            });
          }
        }
        if (TM.rehK) {
          [TM.rehK, TM.rehKopf, TM.rehGeweih].forEach((m) => { m.count = z.rk; m.instanceMatrix.needsUpdate = true; });
          TM.rehBein.count = z.rb; TM.rehBein.instanceMatrix.needsUpdate = true;
        }
        if (TM.baerK) { TM.baerK.count = z.bk; TM.baerBein.count = z.bb; TM.baerK.instanceMatrix.needsUpdate = true; TM.baerBein.instanceMatrix.needsUpdate = true; }
      }
      if (this._puffM) {
        const m = this._puffM, c = this._fc || (this._fc = new THREE.Color());
        let n = 0;
        for (const p of this.puffs) {
          const u = p.t / p.dauer, gr = p.g * (0.5 + u * 1.6) * (u > 0.75 ? (1 - u) * 4 : 1);
          v.set(p.x, p.y, p.z); q.identity(); sk.setScalar(Math.max(0.01, gr));
          m4.compose(v, q, sk); m.setMatrixAt(n, m4);
          c.setHex(p.farbe); m.setColorAt(n, c); n++;
        }
        m.count = n; m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true;
      }
      if (this._kraterM) {
        let n = 0;
        for (const k of this.krater) {
          const alt = t - k.ab, rest = k.bis - t, auf = Math.min(1, alt / 0.25), ab = Math.min(1, rest / 1.0);
          const s = k.r * auf * Math.max(0.01, ab);
          v.set(k.x, k.y, k.z); q.setFromAxisAngle(yA, k.s * 0.37); sk.set(s, 1, s);
          m4.compose(v, q, sk); this._kraterM.setMatrixAt(n, m4);
          const gl = s * (0.75 + 0.2 * Math.sin(t * 5 + k.s)) * Math.max(0.25, 1 - alt / 30);
          sk.set(gl, 1, gl); m4.compose(v, q, sk); this._glutM.setMatrixAt(n, m4);
          n++;
        }
        this._kraterM.count = n; this._glutM.count = n;
        this._kraterM.instanceMatrix.needsUpdate = true; this._glutM.instanceMatrix.needsUpdate = true;
        // Bomben + Meteor (+ Schatten)
        let b = 0, sch = 0;
        const bombe = (x, y, z, r) => {
          q.setFromAxisAngle(yA, t * 3 + x); v.set(x, y, z);
          sk.setScalar(r); m4.compose(v, q, sk); this._bombeM.setMatrixAt(b, m4);
          sk.setScalar(r * 0.75); m4.compose(v, q, sk); this._bombeKernM.setMatrixAt(b, m4);
          b++;
        };
        const schatten = (x, y, z, r) => { v.set(x, y + 0.12, z); q.identity(); sk.set(r, 1, r); m4.compose(v, q, sk); this._schattenM.setMatrixAt(sch++, m4); };
        for (const bo of this.bomben) {
          bombe(bo.x, bo.y, bo.z, 3.0);     // W2-C1: größer (vorher 1,6) – aus der Fahrersicht gut erkennbar
          schatten(bo.x, this.strecke.hoeheAn(bo.x, bo.z), bo.z, 0.8 + 1.6 * Math.min(1, bo.t / bo.T));
        }
        for (const m of this.meteorStellen) {
          if (!m.pos) continue;
          bombe(m.pos.x, m.pos.y, m.pos.z, 2.2);
          if (m.schatten) schatten(m.schatten.x, m.schatten.y, m.schatten.z, m.schatten.r);
        }
        this._bombeM.count = b; this._bombeKernM.count = b; this._schattenM.count = sch;
        [this._bombeM, this._bombeKernM, this._schattenM].forEach((mm) => { mm.instanceMatrix.needsUpdate = true; });
      }
      const F = this.flugsaurier, grp = this._flugGrp;
      if (grp) {
        grp.visible = !!(F && F.aktiv);
        const sh = this._flugSchatten;
        if (sh) sh.visible = grp.visible;
        if (grp.visible) {
          // W3-H: Modell ×groesse (Einblenden in den ersten 0,4 s statt Aufpoppen), Schatten auf dem Boden unter ihm
          const CFg = cfgDinoV().flugsaurier || {}, gr = wert(CFg.groesse, 1.8) * Math.min(1, 0.35 + F.zeit / 0.6);
          grp.scale.setScalar(gr);
          if (sh) {
            const hy = this.strecke.hoeheAn(F.x, F.z), hoeheUeber = Math.max(0, F.y - hy), u = Math.max(0, 1 - hoeheUeber / 28);
            sh.position.set(F.x, hy + 0.14, F.z); sh.rotation.y = F.yaw;
            sh.scale.set(gr * 2.4 * (0.5 + 0.5 * u), 1, gr * 3.6 * (0.5 + 0.5 * u));   // längs (x) × quer (z): Spannweite
            sh.material.opacity = 0.18 + 0.32 * u;
          }
          grp.position.set(F.x, F.y, F.z);
          grp.rotation.set(0, F.yaw, F.nicken, 'YXZ');           // Modell blickt +x → Flugrichtung, Nase hoch beim Steigen
          this._fluegel.forEach((m) => { m.rotation.x = -m.userData.sg * F.fluegel; });
        }
      }
    }
  }

  /**
   * Runde 6 (W2-C): Braucht diese Strecke/Welt eine Dynamik, obwohl keine Bälle/Strohballen/Dinos da sind?
   * (Wald: Tiere + grasende Rehe, auch Klassisch; Dino: Vulkan/Meteoriten/Flugsaurier ab Welt Hindernisse.)
   */
  Dynamik.braucht = function (strecke) {
    const k = strecke.katalog || strecke.daten || {}, an = !strecke.aktiveSchichten || strecke.aktiveSchichten.dinos !== false;
    if ((k.tiere || []).length) return true;
    return an && !!((k.meteoriten || []).length || k.flugsaurier || k.vulkan);
  };
  R.Dynamik = Dynamik;
})();
