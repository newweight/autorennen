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
        return { nr, s, von, art, intervall: e.intervall || 14, tempo: e.tempo || wert(CD.tempo, 4),
          qStart: von * (bh + wert(CD.ueberstand, 12)), timer: 1 + this.rnd() * Math.min(4, e.intervall || 14), dinos: [] };
      });
      this.strohStellen = strohListe.map((e, nr) => {
        const s = sp.wrapS(e.s), bh = (strecke.breiteBei ? strecke.breiteBei(s) : strecke.breite) / 2;
        const von = e.von < 0 ? -1 : 1;
        return { nr, s, von, intervall: e.intervall || 10, tempo: e.tempo || wert(CS.tempo, 5), radius, breite: wert(CS.breite, 1.25),
          qStart: von * (bh + uebS), randQ: bh + (strecke.randBreite || 1) * 0.5 + radius,
          timer: 1 + this.rnd() * Math.min(4, e.intervall || 10), ballen: [] };
      });
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
      const erg = { baelleKommen: false };
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

    /** Dinos: neue laufen los (ab Runde 1, sobald das Rennen läuft), laufende bewegen; drüben angekommen → weg. */
    _dinoSchritt(dt) {
      for (const st of this.dinoStellen) {
        st.timer -= dt;
        if (st.timer <= 0) {
          st.timer = st.intervall;
          const dino = { s: st.s + (this.rnd() - 0.5) * 3, q: st.qStart, vq: -st.von * st.tempo, art: st.art, zeit: 0, phase: this.rnd() * 6,
            getroffen: new Set(), x: 0, y: 0, z: 0, nx: 1, nz: 0, tx: 0, tz: 1 };
          this._dinoWelt(dino);
          st.dinos.push(dino);
        }
        for (let i = st.dinos.length - 1; i >= 0; i--) {
          const d = st.dinos[i];
          d.zeit += dt;
          d.q += d.vq * dt;
          d.phase += Math.abs(d.vq) * dt * (d.art === 'langhals' ? 0.9 : 1.6);   // Schrittfrequenz
          if (d.q * st.von < -Math.abs(st.qStart)) { st.dinos.splice(i, 1); continue; }
          this._dinoWelt(d);
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
        const m = this.felsOptik
          ? new THREE.InstancedMesh(this._felsGeo(), new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }), this.strohStellen.length * 4)
          : new THREE.InstancedMesh(this._strohGeo(), new THREE.MeshLambertMaterial({ vertexColors: true, emissive: 0x2a1e06 }), this.strohStellen.length * 4);
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
            if (yy > 0) { tri(A, Cc, B, f, f, f); tri(A, D, Cc, f, f, f); }
            else { tri(A, B, Cc, f, f, f); tri(A, Cc, D, f, f, f); }
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
            if (je++ >= 4) break;
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
            const zz = zaehler[st.art], wipp = Math.abs(Math.sin(d.phase)) * (st.art === 'langhals' ? 0.18 : 0.12);
            // Blickrichtung +x des Modells → Laufrichtung (lx, lz)
            q.setFromAxisAngle(yAchse, Math.atan2(-d.lz, d.lx));
            v.set(d.x, d.y + wipp, d.z); sk.setScalar(1);
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
    }
  }

  R.Dynamik = Dynamik;
})();
