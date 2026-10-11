// ============================================================
// Strecke: Logik (Untergrund, Höhe, Startaufstellung, Checkpoints,
// Ideallinien-Tempo) und Grafik (bauen()).
// Nur bauen() braucht Three.js – alles andere läuft auch in Node-Tests.
//
// Heading-Konvention wie vehicle.js: heading 0 = Richtung -z,
// richtung() = { x: -sin h, z: -cos h }, Linkslenken erhöht heading.
//
// Runde 4: Welten + Spuren.
//   new R.Strecke(daten, { welt })   welt = Name aus daten.welten (sonst daten.weltStandard)
//   strecke.welt (Name), strecke.weltDaten / strecke.aktiveSchichten ({ hindernisse, wracks, … : bool })
//   strecke.daten = Katalogeintrag, aber nur mit den Listen aktiver Schichten (dynamik.js liest baelle/
//   wasserstrahlen von hier); strecke.katalog = unveränderter Katalogeintrag.
//   strecke.hindernisse / loopings / wracks / strohballen / schanzen / boostFelder / schilde: leer, wenn aus.
//   strecke.breiteBei(s): Fahrbahnbreite an s (Spuren: 1 Spur 5 m, 3 Spuren 15 m, Übergang 40 m);
//   Straße, Randsteine, Mittellinien, Bande (grenzeBei), Untergrund und Checkpoints nutzen sie.
//   Enge Stellen (1 Spur): Leitplanke direkt hinter dem Randstreifen (_leitplankenBauen).
// ============================================================
(function () {
  const R = window.Rennspiel;

  // Ideallinie (für die Computerfahrer in Abschnitt 5)
  const A_QUER_MAX = 7;     // m/s² erlaubte Querbeschleunigung
  const A_BREMS = 8;        // m/s² Bremsverzögerung vor Kurven
  const V_DECKEL = 78;      // m/s Höchsttempo der Ideallinie (Autos bis 270 km/h; Bremshilfe nutzt tempoBei)
  const KERB_KRUEMMUNG = 1 / 150;  // ab hier rot-weiße Randsteine
  // Brücken und Tunnel: Bande direkt hinter dem Randstreifen (Geländer / Tunnelwand)
  const ENG_ZUGABE = 0.4;   // m hinter dem Randstreifen
  const TRICHTER = 25;      // m Übergang von der normalen zur engen Bande (davor und danach)
  // Senke unter einer Brücke (lokal um die Brückenmitte: l längs, q quer)
  const SENKE_Q0 = 34, SENKE_Q1 = 58;    // volle Tiefe bis q0, flach bei q1
  const GROB_RAND = 6, GROB_ABSENKUNG = 1.5;  // grobes Bodengitter tiefer/weiter als die feine Senke
  // Runde 4: Spuren (Katalog spuren [{ s0, s1, spuren: 1 | 3 }])
  const SPUR_BREITE = { 1: 5, 3: 15 };   // m Fahrbahnbreite je Spurzahl
  const SPUR_UEBERGANG = 40;             // m weicher Übergang vor s0 und nach s1
  const BODEN_HALB = 800, BODEN_SICHT = 450;   // Bodenplatte mind. ±800 m, sonst Strecke + 450 m Rand
  // Alle Schichten einer Welt (Katalog welten[name] = { schicht: bool })
  const SCHICHTEN = ['hindernisse', 'wracks', 'strohballen', 'spuren', 'schanzen', 'baelle', 'wasserstrahlen', 'boost', 'schild', 'loopings'];
  // Katalogfeld je Schicht (Liste der Einträge)
  const SCHICHT_FELD = { hindernisse: 'hindernisse', wracks: 'wracks', strohballen: 'strohballen', spuren: 'spuren',
    schanzen: 'schanzen', baelle: 'baelle', wasserstrahlen: 'wasserstrahlen', boost: 'boostFelder', schild: 'schilde', loopings: 'loopings' };

  /** Weicher Übergang 0 → 1 zwischen a und b. */
  function glatt(a, b, x) { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); }

  /** Heading (wie vehicle.js) aus einer Richtung in XZ. */
  function headingAus(tx, tz) { return Math.atan2(-tx, -tz); }

  /**
   * Welt-Auswahl: Name der Welt, die für diese Daten gilt (unbekannt/leer → weltStandard → erste Welt).
   * Ohne welten im Katalog (alte/Test-Daten): null = alles aktiv wie bisher.
   */
  function weltName(daten, wunsch) {
    const w = daten.welten;
    if (!w) return null;
    if (wunsch && w[wunsch]) return wunsch;
    if (daten.weltStandard && w[daten.weltStandard]) return daten.weltStandard;
    return Object.keys(w)[0] || null;
  }

  /** Aktive Schichten { hindernisse: bool, … } einer Welt (alle Schichten belegt, fehlend = false). */
  function weltSchichten(daten, name) {
    const erg = {};
    const w = name && daten.welten ? daten.welten[name] : null;
    SCHICHTEN.forEach((k) => { erg[k] = w ? !!w[k] : true; });   // ohne Welten: alles wie bisher
    if (!w) erg.spuren = !!(daten.spuren && daten.spuren.length);
    return erg;
  }

  class Strecke {
    /**
     * @param {object} daten Eintrag aus Rennspiel.trackCatalog
     * @param {{welt?:string}} [optionen] welt = Name aus daten.welten (Standard: daten.weltStandard)
     */
    constructor(daten, optionen) {
      const opt = optionen || {};
      this.katalog = daten;
      this.welt = weltName(daten, opt.welt);
      this.weltDaten = weltSchichten(daten, this.welt);
      this.aktiveSchichten = Object.assign({}, this.weltDaten);
      const an = (k) => !!this.aktiveSchichten[k];
      // Datensicht nur mit aktiven Schichten (dynamik.js, themes.js und main.js lesen strecke.daten)
      const sicht = Object.assign({}, daten);
      SCHICHTEN.forEach((k) => { const f = SCHICHT_FELD[k]; if (f in daten || !an(k)) sicht[f] = an(k) ? (daten[f] || []) : []; });
      this.daten = sicht;
      this.id = daten.id;
      this.name = daten.name;
      this.thema = daten.thema;
      this.breite = daten.breite;
      this.randBreite = daten.randBreite;
      this.huegel = daten.huegel || [];
      this.abseitsUntergrund = daten.abseitsUntergrund || 'gras';   // 'gras' | 'sand'
      this.spline = new R.Spline(daten.punkte, { abstand: 2 });
      this.laenge = this.spline.laenge;
      // Spuren (nur wenn die Welt sie einschaltet): [{ s0, s1, spuren, breite }]
      this.spuren = (sicht.spuren || []).map(e => ({ s0: this.spline.wrapS(e.s0), s1: this.spline.wrapS(e.s1), spuren: e.spuren,
        breite: SPUR_BREITE[e.spuren] || this.breite }));
      this._spurEng = this.spuren.filter(e => e.breite < this.breite);
      // Höhe der Mittellinie exakt aus dem Gelände (die y-Werte im Katalog sind gerundet)
      if (this.huegel.length) this.spline.punkte.forEach((p) => { p.y = this.gelaendeHoehe(p.x, p.z); });
      // Unsichtbare weiche Bande (physics/collisions.js) + sichtbarer Holzzaun genau dort
      this.zaunAbstand = daten.zaunAbstand || 18;   // m ab Straßenrand
      this.seitenabstandMax = this.breite / 2 + this.zaunAbstand;
      this.grenzeEng = this.breite / 2 + this.randBreite + ENG_ZUGABE;   // Geländer / Tunnelwand
      // Brücken und Tunnel (Bogenlänge s0..s1). Alt: bruecke { von, bis } → eine Holzbrücke.
      const br = daten.bruecken || (daten.bruecke ? [{ s0: daten.bruecke.von, s1: daten.bruecke.bis, art: 'holz' }] : []);
      this.bruecken = br.map(b => this._bereich(b, { holz: 'holz', stein: 'stein', stahl: 'stahl' }[b.art] || 'holz'));
      this.bruecken.forEach((b) => {
        b.tiefe = b.tiefe || 5;
        // Senke quer nur so weit, dass kein anderes Streckenstück abgesenkt wird
        let frei = Infinity;
        for (const p of this.spline.punkte) {
          if (Math.abs(this.spline.differenzS(p.s, b.mitte)) < b.halb + 60) continue;
          const dx = p.x - b.m.x, dz = p.z - b.m.z;
          if (Math.abs(dx * b.m.tx + dz * b.m.tz) > b.halb + GROB_RAND + 30) continue;   // weit vor/hinter der Brücke egal
          frei = Math.min(frei, Math.abs(dx * b.m.nx + dz * b.m.nz));
        }
        b.q1 = Math.max(24, Math.min(SENKE_Q1, frei - this.breite / 2 - this.randBreite - GROB_RAND - 12));
        b.q0 = Math.min(SENKE_Q0, b.q1 - 18);
      });
      this.bruecke = this.bruecken[0] || null;          // Kurzform (erste Brücke) für Deko/ältere Aufrufer
      this.tunnel = (daten.tunnel || []).map(t => this._bereich(t, t.art === 'sandstein' ? 'sandstein' : 'fels'));
      this._engstellen = this.bruecken.concat(this.tunnel);
      this.hindernisse = this._hindernisseBerechnen(sicht.hindernisse || []);
      this._flecken = this.hindernisse.filter(h => h.untergrund);
      // Loopings (Fantasie): Datenstruktur hier, Fahrlogik + Grafik in track/looping.js
      this.loopings = this._loopingsBerechnen(sicht.loopings || []);
      // Runde 4: Listen für noch nicht gebaute Schichten (Agent C/D): Kopien mit s in [0, laenge)
      const kopie = (liste) => (liste || []).map(e => Object.assign({}, e, { s: this.spline.wrapS(e.s) }));
      this.wracks = kopie(sicht.wracks);            // [{ s, seitenabstand, brennt, autoId }]
      this.strohballen = kopie(sicht.strohballen);  // [{ s, von, intervall, tempo }]
      this.schanzen = kopie(sicht.schanzen);        // [{ s, winkel: 8 | 12, laenge }]
      this.boostFelder = kopie(sicht.boostFelder);  // [{ s, seitenabstand, laenge }]
      this.schilde = kopie(sicht.schilde);          // [{ s, seitenabstand }]
      this.checkpoints = this._checkpointsBerechnen(daten.checkpointAbstand || 120);
      this.idealLinie = this._idealLinieBerechnen();
    }

    // ---------------------------------------------------------- Abfragen

    /** Geländehöhe aus den Hügeln (gilt auf und neben der Strecke). */
    gelaendeHoehe(x, z) {
      let h = 0;
      for (const g of this.huegel) {
        const dx = x - g.x, dz = z - g.z;
        h += g.h * Math.exp(-(dx * dx + dz * dz) / (2 * g.r * g.r));
      }
      return h;
    }

    /** Höhe der Straße (und des Bodens außerhalb von Senken) an (x, z). Autos fahren auf dieser Höhe. */
    hoeheAn(x, z, startIndex) {
      if (this.huegel.length) return this.gelaendeHoehe(x, z);
      return this.spline.hoeheBei(x, z, startIndex);
    }

    /**
     * Höhe des sichtbaren Bodens: wie hoeheAn, aber unter Brücken abgesenkt (Bach, Teich, Schlucht).
     * Die Fahrbahn auf der Brücke bleibt auf hoeheAn – nur der Boden darunter fällt ab.
     */
    bodenHoehe(x, z) {
      return this.hoeheAn(x, z) - this.senkeTiefe(x, z);
    }

    /** Absenkung (m, ≥ 0) unter Brücken. grob = für das grobe Bodengitter (weiter + tiefer, siehe _bodenBauen). */
    senkeTiefe(x, z, grob) {
      let t = 0;
      for (const b of this.bruecken) {
        const dx = x - b.m.x, dz = z - b.m.z;
        const l = Math.abs(dx * b.m.tx + dz * b.m.tz), q = Math.abs(dx * b.m.nx + dz * b.m.nz);
        if (l > b.halb + 40 || q > b.q1 + 30) continue;
        const r = grob ? GROB_RAND : 0;
        // längs: flacher Grund in der Mitte, Böschung bis zu den Brückenenden (Schlucht steiler)
        const innen = b.art === 'stahl' ? 0.62 : 0.42;
        const fl = 1 - glatt(innen, 1, l / (b.halb + r));
        const fq = 1 - glatt(b.q0 + r, b.q1 + r, q);
        let d = b.tiefe * fl * fq;
        if (grob) d += GROB_ABSENKUNG * (1 - glatt(b.halb + r, b.halb + r + 10, l)) * (1 - glatt(b.q1 + r, b.q1 + r + 10, q));
        t = Math.max(t, d);
      }
      return t;
    }

    /** Bereich { s0, s1 } aus dem Katalog vervollständigen (Mitte, Rahmen für die Senke). */
    _bereich(e, art) {
      const s0 = e.s0, s1 = e.s1, mitte = (s0 + s1) / 2;
      return { s0, s1, von: s0, bis: s1, laenge: s1 - s0, halb: (s1 - s0) / 2, mitte, art, tiefe: e.tiefe,
        m: this.spline.punktBei(mitte) };
    }

    /** Liegt s im Bereich b (± zugabe)? Berücksichtigt den Rundenübergang. */
    _inBereich(b, s, zugabe) {
      const z = zugabe || 0, sp = this.spline;
      return sp.differenzS(s, b.s0) >= -z && sp.differenzS(s, b.s1) <= z;
    }

    /** Liegt Bogenlänge s in einem Tunnel? (zugabe in m verlängert ihn an beiden Enden) */
    imTunnel(s, zugabe) { return this.tunnelBei(s, zugabe) !== null; }

    /** Tunnel an Bogenlänge s oder null. */
    tunnelBei(s, zugabe) {
      for (const t of this.tunnel) if (this._inBereich(t, s, zugabe)) return t;
      return null;
    }

    /** Brücke an Bogenlänge s oder null. */
    brueckeBei(s, zugabe) {
      for (const b of this.bruecken) if (this._inBereich(b, s, zugabe)) return b;
      return null;
    }

    /**
     * Darf an (x, z) keine Deko stehen? (Tunnelhügel, Brückensenke) n = naechster(x, z), falls schon bekannt.
     */
    dekoSperre(x, z, n) {
      if (this.tunnel.length) {
        const nn = n || this.spline.naechster(x, z);
        if (this.imTunnel(nn.s, 8) && Math.abs(nn.seitenabstand) < this.grenzeEng + 16) return true;
      }
      for (const b of this.bruecken) {
        const dx = x - b.m.x, dz = z - b.m.z;
        if (Math.abs(dx * b.m.tx + dz * b.m.tz) < b.halb + 5 && Math.abs(dx * b.m.nx + dz * b.m.nz) < b.q0 + 8) return true;
      }
      return false;
    }

    /**
     * Seitenabstand der Bande an Bogenlänge s: normal seitenabstandMax, auf Brücken und in Tunneln
     * direkt hinter dem Randstreifen (grenzeEng), mit weichem Trichter (TRICHTER m) davor und danach.
     */
    grenzeBei(s) {
      let g = this.seitenabstandMax;
      const sp = this.spline;
      for (const b of this._engstellen) {
        const aussen = this._aussen(b, s);
        if (aussen >= TRICHTER) continue;
        g = Math.min(g, this.grenzeEng + (this.seitenabstandMax - this.grenzeEng) * glatt(0, 1, aussen / TRICHTER));
      }
      // Enge Spur-Abschnitte: Leitplanke folgt dem Fahrbahnrand (inkl. Übergang), davor/danach Trichter
      for (const e of this._spurEng) {
        const aussen = this._aussen(e, s);
        if (aussen >= SPUR_UEBERGANG + TRICHTER) continue;
        const gRand = this.breiteBei(s) / 2 + this.randBreite + ENG_ZUGABE;
        const t = aussen <= SPUR_UEBERGANG ? 0 : glatt(0, 1, (aussen - SPUR_UEBERGANG) / TRICHTER);
        g = Math.min(g, gRand + (this.seitenabstandMax - gRand) * t);
      }
      void sp;
      return g;
    }

    /** Abstand (m) von s zum Bereich { s0, s1 } entlang der Strecke, 0 = innerhalb (Rundenübergang beachtet). */
    _aussen(b, s) {
      const sp = this.spline, d0 = sp.differenzS(s, b.s0), d1 = sp.differenzS(s, b.s1);
      return d0 >= 0 && d1 <= 0 ? 0 : Math.min(Math.abs(d0), Math.abs(d1));
    }

    /**
     * Fahrbahnbreite (m) an Bogenlänge s. Ohne aktive Spuren konstant this.breite; in einem Spur-Abschnitt
     * die Spurbreite (1 Spur 5 m, 3 Spuren 15 m), davor und danach SPUR_UEBERGANG m weicher Übergang.
     */
    breiteBei(s) {
      const sp = this.spuren;
      if (!sp.length) return this.breite;
      for (let i = 0; i < sp.length; i++) {
        const e = sp[i], aussen = this._aussen(e, s);
        if (aussen >= SPUR_UEBERGANG) continue;
        return e.breite + (this.breite - e.breite) * glatt(0, SPUR_UEBERGANG, aussen);
      }
      return this.breite;
    }

    /** Spur-Abschnitt, in dessen Bereich (inkl. Übergang + zugabe) s liegt, oder null. */
    spurBei(s, zugabe) {
      for (const e of this.spuren) if (this._aussen(e, s) < SPUR_UEBERGANG + (zugabe || 0)) return e;
      return null;
    }

    /** Liegt Bogenlänge s auf einer Brücke? */
    _aufBruecke(s) {
      return this.brueckeBei(s) !== null;
    }

    /** Untergrund aus Seitenabstand (+ Bogenlänge s für Brücke und Hindernis-Flecken). */
    _untergrundAus(seitenabstand, s) {
      const a = Math.abs(seitenabstand);
      const b2 = (s !== undefined && this.spuren.length) ? this.breiteBei(s) / 2 : this.breite / 2;
      if (a <= b2) {
        // Öl- und Sandflecken (Ellipse um die Mitte des Flecks)
        if (s !== undefined) {
          for (let i = 0; i < this._flecken.length; i++) {
            const h = this._flecken[i], ds = this.spline.differenzS(s, h.s);
            if (Math.abs(ds) > h.halblaenge) continue;
            const u = ds / h.halblaenge, v = (seitenabstand - h.seitenabstand) / h.halbbreite;
            if (u * u + v * v <= 1) return h.untergrund;
          }
        }
        return 'strasse';
      }
      if (a <= b2 + this.randBreite) return 'rand';
      // Holzsteg: bis zum Geländer fährt man auf Brettern (wie Randstreifen)
      if (s !== undefined && this._aufBruecke(s) && a <= this.seitenabstandMax) return 'rand';
      return this.abseitsUntergrund;
    }

    /** 'strasse' | 'rand' | 'gras' | 'sand'. startIndex (optional) beschleunigt die Suche. */
    untergrundAn(x, z, startIndex) {
      const n = this.spline.naechster(x, z, startIndex);
      return this._untergrundAus(n.seitenabstand, n.s);
    }

    /** Alles auf einmal: naechster()-Ergebnis + untergrund (für die Spielschleife). */
    abfrage(x, z, startIndex) {
      const n = this.spline.naechster(x, z, startIndex);
      n.untergrund = this._untergrundAus(n.seitenabstand, n.s);
      return n;
    }

    // ---------------------------------------------------------- Hindernisse

    /**
     * Katalog-Einträge { typ, s, seite, breite? } → Hindernisse für Physik, KI und Grafik.
     * Jedes Hindernis (auch die Datenstruktur für die KI):
     *   typ            'oel' | 'sand' | 'baustelle' | 'ast'
     *   s              Mitte entlang der Strecke (m)
     *   s0, s1, laenge Anfang/Ende entlang der Strecke (Baustelle: inkl. Pylonen-Schräge davor)
     *   seitenabstand  Mitte quer (m, rechts +), halbbreite (m): belegt seitenabstand ± halbbreite
     *   gefahr         0..1 (config.hindernisse[typ].gefahr)
     *   untergrund     nur Flecken: 'oel' / 'sandFleck' (siehe untergrundAn)
     * Zusätzlich für die Kollision: x, z, radius (Grobtest), pylonen [{x,z,weg,...}], segmente [{ax,az,bx,bz,art}].
     */
    _hindernisseBerechnen(liste) {
      const C = R.config.hindernisse || {}, sp = this.spline, b = this.breite / 2;
      const welt = (s, q) => { const p = sp.punktBei(s); return { x: p.x + p.nx * q, z: p.z + p.nz * q, s: sp.wrapS(s), q }; };
      return liste.map((e, nr) => {
        const c = C[e.typ] || {};
        const h = { nr, typ: e.typ, gefahr: c.gefahr !== undefined ? c.gefahr : 0.5 };
        const vz = (e.seite || 1) >= 0 ? 1 : -1;
        if (e.typ === 'oel' || e.typ === 'sand') {
          const hb = (e.breite || c.breite || 5) / 2, hl = (e.laenge || c.laenge || 8) / 2;
          const q = Math.max(-(b - 1), Math.min(b - 1, (e.seite || 0) * b));
          Object.assign(h, { s: sp.wrapS(e.s), laenge: hl * 2, halblaenge: hl, seitenabstand: q, halbbreite: hb,
            untergrund: c.untergrund || (e.typ === 'oel' ? 'oel' : 'sandFleck') });
          h.s0 = sp.wrapS(e.s - hl); h.s1 = sp.wrapS(e.s + hl);
          const m = welt(e.s, q); h.x = m.x; h.z = m.z; h.radius = Math.max(hl, hb);
        } else if (e.typ === 'baustelle') {
          // Gesperrt: Hälfte vz von q = vz·0,6 bis zur Fahrbahnkante, über laenge m ab s.
          // Davor eine Pylonen-Schräge (vorlauf m) von der Kante zur Sperrlinie, Bake am Beginn.
          const L = e.laenge || c.laenge || 30, vor = c.vorlauf || 9, innen = 0.6;
          Object.assign(h, { s: sp.wrapS(e.s - vor + (L + vor) / 2), s0: sp.wrapS(e.s - vor), s1: sp.wrapS(e.s + L),
            laenge: L + vor, seitenabstand: vz * (b + innen) / 2, halbbreite: (b - innen) / 2 + 0.3, seite: vz,
            sperrS: sp.wrapS(e.s) });
          const pyl = [], abst = c.pylonenAbstand || 3;
          const nSchraeg = Math.max(2, Math.round(vor / 2.2));
          for (let k = 0; k <= nSchraeg; k++) {
            const u = k / nSchraeg;
            pyl.push(welt(e.s - vor + vor * u, vz * (b - 0.4 + (innen - b + 0.4) * u)));
          }
          for (let d = abst; d <= L + 1e-6; d += abst) pyl.push(welt(e.s + d, vz * innen));
          pyl.push(welt(e.s + L, vz * (b * 0.5 + innen * 0.5)), welt(e.s + L, vz * (b - 0.4)));
          h.pylonen = pyl.map(p => Object.assign(p, { weg: false, wegZeit: 0, von: -1 }));
          // Rot-weiße Bake quer über die gesperrte Hälfte (fest, wirkt wie eine Bande)
          const a = welt(e.s + 0.8, vz * (innen + 0.2)), z = welt(e.s + 0.8, vz * (b - 0.1));
          h.segmente = [{ ax: a.x, az: a.z, bx: z.x, bz: z.z, art: 'bake' }];
          const m = welt(e.s + L / 2 - vor / 2, vz * b / 2); h.x = m.x; h.z = m.z; h.radius = (L + vor) / 2 + 3;
        } else if (e.typ === 'ast') {
          // Ast vom Fahrbahnrand (etwas darüber hinaus) bis knapp vor die Mitte, leicht schräg
          const aussen = welt(e.s - 0.8, vz * (b + 0.6)), innen = welt(e.s + 0.8, vz * 0.5);
          Object.assign(h, { s: sp.wrapS(e.s), s0: sp.wrapS(e.s - 1.5), s1: sp.wrapS(e.s + 1.5), laenge: 3,
            seitenabstand: vz * (b + 0.5) / 2, halbbreite: (b - 0.5) / 2 + 0.3, seite: vz });
          h.segmente = [{ ax: aussen.x, az: aussen.z, bx: innen.x, bz: innen.z, art: 'ast', dicke: c.dicke || 0.28 }];
          h.x = (aussen.x + innen.x) / 2; h.z = (aussen.z + innen.z) / 2; h.radius = b / 2 + 2;
        }
        return h;
      });
    }

    /**
     * Katalog-Einträge { s, radius, versatz? } → Loopings:
     *   s          Einfahrt (Bogenlänge, m) – dort hebt das Band von der Straße ab
     *   radius     Kreisradius (m), versatz: Ausfahrt bei s + versatz (Straße läuft unten weiter)
     *   seitenVersatz  Helix: seitliche Verschiebung über die ganze Runde (Breite × 0,6)
     *   bandHalb   halbe Breite des Fahrbahnbands
     *   vMin       Mindest-Einfahrtstempo sqrt(5·g·r), vObenMin = sqrt(g·r)
     *   s0, s1     grober Bereich, den der Kreis über der Straße belegt (Deko/Hindernisse frei halten)
     */
    _loopingsBerechnen(liste) {
      const C = (R.config.fantasie && R.config.fantasie.looping) || {}, g = 9.81, sp = this.spline;
      return liste.map((e, nr) => {
        const r = e.radius || 12, versatz = e.versatz || C.versatz || 10;
        return {
          nr, s: sp.wrapS(e.s), radius: r, versatz,
          seitenVersatz: this.breite * (C.seitenVersatzAnteil || 0.6),
          bandHalb: (C.bandBreite || 7.2) / 2,
          vMin: Math.sqrt((C.vMinFaktor || 5) * g * r), vObenMin: Math.sqrt(g * r),
          s0: sp.wrapS(e.s - r * 0.5), s1: sp.wrapS(e.s + versatz + r * 1.3),
        };
      });
    }

    /** Looping, dessen Bereich s (± zugabe) berührt, oder null. */
    loopingBei(s, zugabe) {
      for (const l of this.loopings) if (this._inBereich(l, s, zugabe)) return l;
      return null;
    }

    /** Umgefahrene Pylonen wieder aufstellen: alle oder nur die von Fahrzeug nr (Rundenende). */
    pylonenZurueck(nr) {
      let n = 0;
      for (const h of this.hindernisse) {
        if (!h.pylonen) continue;
        for (const p of h.pylonen) if (p.weg && (nr === undefined || p.von === nr)) { p.weg = false; p.von = -1; n++; }
      }
      if (n) this.pylonenGeaendert = true;
      return n;
    }

    /** Ziel-Tempo der Ideallinie an Bogenlänge s (m/s). */
    tempoBei(s) {
      const sp = this.spline, N = sp.anzahl;
      const f = sp.wrapS(s) / sp.ds, i = Math.floor(f) % N, w = f - Math.floor(f);
      return this.idealLinie[i] + (this.idealLinie[(i + 1) % N] - this.idealLinie[i]) * w;
    }

    /**
     * Startaufstellung: 2 Spalten gestaffelt hinter der Startlinie,
     * Pole-Position vorne rechts.
     * @returns {{x:number, z:number, heading:number}[]}
     */
    startpositionen(n) {
      const liste = [];
      for (let i = 0; i < n; i++) {
        const reihe = Math.floor(i / 2), links = i % 2 === 1;
        const hinter = 8 + reihe * 9 + (links ? 4.5 : 0);
        const p = this.spline.punktBei(-hinter);
        const q = links ? -3.5 : 3.5;
        liste.push({ x: p.x + p.nx * q, z: p.z + p.nz * q, heading: headingAus(p.tx, p.tz) });
      }
      return liste;
    }

    _checkpointsBerechnen(abstand) {
      const anzahl = Math.max(3, Math.round(this.laenge / abstand));
      const liste = [];
      for (let k = 0; k < anzahl; k++) {
        const s = k * this.laenge / anzahl;
        const p = this.spline.punktBei(s);
        // breite = lokale Fahrbahnbreite (Tore/Anzeigen an engen und breiten Stellen)
        liste.push({ nr: k, s, x: p.x, z: p.z, tx: p.tx, tz: p.tz, nx: p.nx, nz: p.nz, breite: this.breiteBei(s) });
      }
      return liste;   // Checkpoint 0 = Start/Ziel
    }

    /**
     * Ziel-Tempo je Abtastpunkt: v = sqrt(aQuer / |Krümmung|), gedeckelt,
     * dann rückwärts geglättet, damit vor Kurven rechtzeitig gebremst wird.
     */
    _idealLinieBerechnen() {
      const pk = this.spline.punkte, N = pk.length, ds = this.spline.ds;
      const v = new Array(N);
      for (let i = 0; i < N; i++) {
        // stärkste Krümmung in ±3 Punkten (Kurveneingang nicht unterschätzen)
        let k = 0;
        for (let j = -3; j <= 3; j++) k = Math.max(k, Math.abs(pk[(i + j + N) % N].kruemmung));
        v[i] = Math.min(V_DECKEL, Math.sqrt(A_QUER_MAX / Math.max(k, 1e-6)));
      }
      // zweimal rückwärts herum (Rundkurs: Kurve nach Start wirkt auf das Ende)
      for (let runde = 0; runde < 2; runde++) {
        for (let i = N - 1; i >= 0; i--) {
          const naechstes = v[(i + 1) % N];
          v[i] = Math.min(v[i], Math.sqrt(naechstes * naechstes + 2 * A_BREMS * ds));
        }
      }
      return v;
    }

    // ---------------------------------------------------------- Grafik

    /** Baut die Strecke als THREE.Group (Boden, Straße, Linien, Randsteine, Start/Ziel). */
    bauen() {
      const gruppe = new THREE.Group();
      gruppe.name = 'Strecke ' + this.name;
      const thema = (R.themes && R.themes[this.thema]) || {};
      gruppe.add(this._bodenBauen(thema.boden !== undefined ? thema.boden : 0x5f9e3a, thema.boden2));
      gruppe.add(this._strasseBauen(thema.asphalt || 0x3c3f45));
      gruppe.add(this._mittellinieBauen());
      gruppe.add(this._randBauen());
      gruppe.add(this._startZielBauen());
      gruppe.add(this._startbogenBauen());
      gruppe.add(this._zaunBauen(thema.zaun || {}));
      if (this._spurEng.length) gruppe.add(this._leitplankenBauen());
      this.bruecken.forEach((b) => {
        gruppe.add(this._senkeBauen(b, thema));
        gruppe.add(this._brueckeBauen(b, thema));
      });
      if (this.tunnel.length) this._tunnelBauen(thema).forEach(m => gruppe.add(m));
      if (this.loopings.length && R.Looping && R.Looping.bauen) gruppe.add(R.Looping.bauen(this, thema));
      // Runde 4 (W2-D): Sprungschanzen und Turbo-Felder (nur wenn die Welt sie einschaltet)
      if (this.aktiveSchichten.schanzen && this.schanzen.length) gruppe.add(this.schanzenBauen(thema));
      if (this.aktiveSchichten.boost && this.boostFelder.length) gruppe.add(this.boostBauen());
      return gruppe;
    }

    /**
     * Runde 4: Sprungschanzen (Keile auf der Fahrbahn, track/schanze.js). Die Rampe hebt den Spline NICHT –
     * hoeheAn bleibt der Boden; die Rampenhöhe liefert R.Schanzen.hoeheAuf(strecke, s).
     */
    schanzenBauen(thema) {
      if (!R.Schanzen || !R.Schanzen.bauen) return new THREE.Group();
      return R.Schanzen.bauen(this, thema);
    }

    /** Runde 4: Turbo-Felder (leuchtende Pfeile, world/pickups.js; animiert über Pickups.animieren). */
    boostBauen() {
      if (!R.Pickups || !R.Pickups.felderBauen) return new THREE.Group();
      return R.Pickups.felderBauen(this);
    }

    /** Lambert-Material, leicht zur Kamera gezogen gegen Flimmern (z-fighting). */
    _material(farbe, versatz) {
      return new THREE.MeshLambertMaterial({
        color: farbe === undefined ? 0xffffff : farbe,
        vertexColors: farbe === undefined,
        polygonOffset: versatz > 0, polygonOffsetFactor: -versatz, polygonOffsetUnits: -versatz,
      });
    }

    /** Punkt neben der Mittellinie (q > 0 = rechts) inkl. Höhe + Anhebung. */
    _seitPunkt(p, q, anheben) {
      const x = p.x + p.nx * q, z = p.z + p.nz * q;
      return [x, this.hoeheAn(x, z) + anheben, z];
    }

    /** Liste von Vierecken (je 4 Ecken + Farbe) → BufferGeometry (nicht indiziert). */
    _viereckeZuGeometrie(vierecke) {
      const pos = new Float32Array(vierecke.length * 18);
      const col = new Float32Array(vierecke.length * 18);
      const c = new THREE.Color();
      let o = 0;
      for (const v of vierecke) {
        c.set(v.farbe);
        // a b c d gegen den Uhrzeigersinn von oben gesehen: a-b-c, a-c-d
        for (const e of [v.a, v.b, v.c, v.a, v.c, v.d]) {
          pos[o] = e[0]; pos[o + 1] = e[1]; pos[o + 2] = e[2];
          col[o] = c.r; col[o + 1] = c.g; col[o + 2] = c.b;
          o += 3;
        }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      g.computeVertexNormals();
      return g;
    }

    /**
     * Viereck zwischen Querschnitt p (Anfang) und q (Ende), seitlich von qa bis qb.
     * Reihenfolge so, dass die Fläche nach oben zeigt.
     */
    _band(p, q, qa, qb, anheben, farbe) {
      return {
        a: this._seitPunkt(p, qa, anheben), b: this._seitPunkt(p, qb, anheben),
        c: this._seitPunkt(q, qb, anheben), d: this._seitPunkt(q, qa, anheben), farbe,
      };
    }

    /** Wie _band, aber mit eigener Querlage am Ende q (qa1/qb1) – für veränderliche Fahrbahnbreite. */
    _band2(p, q, qa0, qb0, qa1, qb1, anheben, farbe) {
      return {
        a: this._seitPunkt(p, qa0, anheben), b: this._seitPunkt(p, qb0, anheben),
        c: this._seitPunkt(q, qb1, anheben), d: this._seitPunkt(q, qa1, anheben), farbe,
      };
    }

    /** Boden: Grundfarbe, optional mit großen Flecken in Farbe 2 (Nadelboden, Sandwellen). */
    _bodenBauen(farbe, farbe2) {
      // Mittelpunkt der Strecke
      let mx = 0, mz = 0;
      const pk = this.spline.punkte;
      pk.forEach(p => { mx += p.x; mz += p.z; });
      mx /= pk.length; mz /= pk.length;
      // Rasterweite aus config (100 → 16 m Felder, 20.000 Dreiecke statt 51.200 bei 160).
      // Geprüft: bei 100 bleibt die Straße auf allen Strecken ≥ 2,5 cm über dem Boden, 80 sticht im Wald durch.
      const raster = (R.config.grafik && R.config.grafik.bodenRaster) || 160;
      // Runde 4: lange Strecken (Wüste ±685 m) – Platte mind. 1600 m, sonst Strecke + BODEN_SICHT je Seite,
      // Feldgröße bleibt gleich (1600 / raster). this.bodenPlatte = { mx, mz, hx, hz } für Deko.
      const g = this._bodenMasse();
      const nx = Math.max(raster, Math.round(raster * g.hx / BODEN_HALB)), nz = Math.max(raster, Math.round(raster * g.hz / BODEN_HALB));
      const geo = new THREE.PlaneGeometry(2 * g.hx, 2 * g.hz, nx, nz);
      geo.rotateX(-Math.PI / 2);
      const pos = geo.attributes.position;
      const farben = new Float32Array(pos.count * 3);
      const basis = new THREE.Color(farbe), zweite = new THREE.Color(farbe2 !== undefined ? farbe2 : farbe), c = new THREE.Color();
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i) + mx, z = pos.getZ(i) + mz;
        // Unter Brücken: grobes Gitter tiefer als die feine Senke (_senkeBauen), damit es nicht durchsticht
        pos.setXYZ(i, x, this.hoeheAn(x, z) - (this.bruecken.length ? this.senkeTiefe(x, z, true) : 0), z);
        this._bodenFarbe(x, z, basis, zweite, farbe2 !== undefined, c);
        farben[i * 3] = c.r; farben[i * 3 + 1] = c.g; farben[i * 3 + 2] = c.b;
      }
      geo.setAttribute('color', new THREE.BufferAttribute(farben, 3));
      geo.computeVertexNormals();
      const boden = new THREE.Mesh(geo, this._material(undefined, 0));
      boden.name = 'Boden';
      return boden;
    }

    /** Mitte und halbe Kantenlängen der Bodenplatte (Mitte = Schwerpunkt der Mittellinie). */
    _bodenMasse() {
      if (this.bodenPlatte) return this.bodenPlatte;
      let mx = 0, mz = 0, ax = 0, az = 0;
      const pk = this.spline.punkte;
      pk.forEach(p => { mx += p.x; mz += p.z; });
      mx /= pk.length; mz /= pk.length;
      pk.forEach(p => { ax = Math.max(ax, Math.abs(p.x - mx)); az = Math.max(az, Math.abs(p.z - mz)); });
      this.bodenPlatte = { mx, mz, hx: Math.max(BODEN_HALB, Math.ceil(ax + BODEN_SICHT)), hz: Math.max(BODEN_HALB, Math.ceil(az + BODEN_SICHT)) };
      return this.bodenPlatte;
    }

    /** Bodenfarbe an (x, z): leichte Farbflecken, damit die Wiese nicht wie Plastik aussieht. */
    _bodenFarbe(x, z, basis, zweite, mitZweiter, c) {
      const f = 0.9 + 0.1 * Math.sin(x * 0.047 + Math.sin(z * 0.031) * 2) * Math.cos(z * 0.052 - x * 0.013)
        + 0.04 * Math.sin(x * 0.31 + z * 0.27);
      // Flecken: weiche Mischung zur zweiten Farbe
      const m = !mitZweiter ? 0 : Math.max(0, Math.min(1,
        0.5 + 0.9 * Math.sin(x * 0.021 + Math.cos(z * 0.017) * 2.2) * Math.sin(z * 0.025 - x * 0.008 + 1.3)));
      return c.copy(basis).lerp(zweite, m).multiplyScalar(f);
    }

    _strasseBauen(asphalt) {
      const pk = this.spline.punkte, N = pk.length;
      const pos = new Float32Array(N * 2 * 3), col = new Float32Array(N * 2 * 3);
      const c = new THREE.Color();
      for (let i = 0; i < N; i++) {
        const p = pk[i], b = this.breiteBei(p.s) / 2;      // Runde 4: Breite je Stelle (Spuren)
        const l = this._seitPunkt(p, -b, 0.06), r = this._seitPunkt(p, b, 0.06);
        pos.set(l, i * 6); pos.set(r, i * 6 + 3);
        // Asphalt mit leichter Streifung (Flickstellen)
        const f = 1 + 0.05 * Math.sin(i * 0.9) * Math.sin(i * 0.23);
        c.setHex(asphalt).multiplyScalar(f);
        col.set([c.r, c.g, c.b, c.r, c.g, c.b], i * 6);
      }
      const index = [];
      for (let i = 0; i < N; i++) {
        const j = (i + 1) % N;
        const l0 = i * 2, r0 = i * 2 + 1, l1 = j * 2, r1 = j * 2 + 1;
        index.push(l0, r0, r1, l0, r1, l1);
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
      geo.setIndex(index);
      geo.computeVertexNormals();
      const m = new THREE.Mesh(geo, this._material(undefined, 1));
      m.name = 'Strasse';
      return m;
    }

    _mittellinieBauen() {
      const sp = this.spline, vierecke = [];
      const strich = 3, luecke = 4, w = 0.14;
      for (let s = 8; s + strich < this.laenge - 6; s += strich + luecke) {
        // Runde 4: 3 Spuren → zwei Linien bei ±Breite/6, 1 Spur → keine Mittellinie
        const spur = this.spurBei(s + strich / 2);
        if (spur && spur.spuren === 1) continue;
        // Strich in 1-m-Stücken, damit er Kurven folgt
        for (let t = 0; t < strich; t += 1) {
          const p = sp.punktBei(s + t), q = sp.punktBei(s + t + 1);
          if (spur && spur.spuren === 3) {
            const a = this.breiteBei(s + t) / 6, e = this.breiteBei(s + t + 1) / 6;
            [-1, 1].forEach(vz => vierecke.push(this._band2(p, q, vz * a - w, vz * a + w, vz * e - w, vz * e + w, 0.08, 0xf0f0f0)));
          } else vierecke.push(this._band(p, q, -w, w, 0.08, 0xf0f0f0));
        }
      }
      const m = new THREE.Mesh(this._viereckeZuGeometrie(vierecke), this._material(undefined, 2));
      m.name = 'Mittellinie';
      return m;
    }

    _randBauen() {
      const pk = this.spline.punkte, N = pk.length, rb = this.randBreite;
      const vierecke = [];
      // Fantasie: Regenbogen-Randsteine (Thema regenbogen = Farbliste), in Kurven kräftig, auf Geraden heller
      const thema = (R.themes && R.themes[this.thema]) || {}, rb6 = thema.regenbogen;
      const hell = rb6 ? rb6.map(f => new THREE.Color(f).lerp(new THREE.Color(0xffffff), 0.45).getHex()) : null;
      for (let i = 0; i < N; i++) {
        const p = pk[i], q = pk[(i + 1) % N];
        // Kurve? (stärkste Krümmung in ±4 Punkten, damit die Steine nicht flackern)
        let k = 0;
        for (let j = -4; j <= 4; j++) k = Math.max(k, Math.abs(pk[(i + j + N) % N].kruemmung));
        const kurve = k > KERB_KRUEMMUNG;
        let farbe = kurve ? (i % 2 === 0 ? 0xd42a2a : 0xf4f4f4) : 0x8f9294;
        if (rb6) farbe = (kurve ? rb6 : hell)[i % rb6.length];
        const b = this.breiteBei(p.s) / 2, bq = this.breiteBei(q.s) / 2;   // Runde 4: Breite je Stelle
        vierecke.push(this._band2(p, q, -b - rb, -b, -bq - rb, -bq, 0.07, farbe));
        vierecke.push(this._band2(p, q, b, b + rb, bq, bq + rb, 0.07, farbe));
      }
      const m = new THREE.Mesh(this._viereckeZuGeometrie(vierecke), this._material(undefined, 1));
      m.name = 'Randsteine';
      return m;
    }

    _startZielBauen() {
      const sp = this.spline, b = this.breite / 2, vierecke = [];
      const feld = 1, reihen = 3, spalten = Math.round(this.breite / feld);
      for (let r = 0; r < reihen; r++) {
        const p = sp.punktBei(-reihen * feld / 2 + r * feld), q = sp.punktBei(-reihen * feld / 2 + (r + 1) * feld);
        for (let c = 0; c < spalten; c++) {
          const farbe = (r + c) % 2 === 0 ? 0x111111 : 0xf6f6f6;
          vierecke.push(this._band(p, q, -b + c * feld, -b + (c + 1) * feld, 0.1, farbe));
        }
      }
      // Startplätze: weiße Querbalken vor jeder Position
      const n = (R.config.rennen.gegnerMax || 5) + 1;
      this.startpositionen(n).forEach((st) => {
        const nah = sp.naechster(st.x, st.z);
        const s = nah.s, quer = nah.seitenabstand;
        const p = sp.punktBei(s + 2.6), q = sp.punktBei(s + 3.0);
        vierecke.push(this._band(p, q, quer - 1.3, quer + 1.3, 0.1, 0xf0f0f0));
      });
      const m = new THREE.Mesh(this._viereckeZuGeometrie(vierecke), this._material(undefined, 3));
      m.name = 'StartZiel';
      return m;
    }

    _startbogenBauen() {
      const g = new THREE.Group();
      g.name = 'Startbogen';
      const p = this.spline.punktBei(0);
      const weite = this.breite / 2 + this.randBreite + 1.2;
      const mastMat = new THREE.MeshLambertMaterial({ color: 0xdedede });
      const mastGeo = new THREE.BoxGeometry(0.5, 7, 0.5);
      [-1, 1].forEach((seite) => {
        const x = p.x + p.nx * weite * seite, z = p.z + p.nz * weite * seite;
        const mast = new THREE.Mesh(mastGeo, mastMat);
        mast.position.set(x, this.hoeheAn(x, z) + 3.5, z);
        g.add(mast);
      });
      const banner = new THREE.Mesh(new THREE.BoxGeometry(weite * 2 + 0.5, 1.4, 0.3),
        new THREE.MeshLambertMaterial({ color: 0xe0352b }));
      banner.position.set(p.x, this.hoeheAn(p.x, p.z) + 6.6, p.z);
      banner.rotation.y = headingAus(p.tx, p.tz);
      g.add(banner);
      return g;
    }
    /**
     * Zaunpunkte einer Seite (seite = +1 rechts, -1 links) bei seitenabstandMax.
     * Ein Punkt ist "gültig", wenn er wirklich zu seinem eigenen Streckenstück gehört:
     * Liegt ein anderes Streckenstück näher (Innenseite enger Kurven, nahe Geraden),
     * entfällt er – dort gibt es auch physikalisch keine Bande.
     * @returns {{x,y,z,ok:boolean}[]} je Abtastpunkt
     */
    zaunPunkte(seite) {
      const sp = this.spline, pk = sp.punkte;
      return pk.map((p) => {
        const g = this.grenzeBei(p.s), q = g * seite;     // vor Brücken/Tunneln trichterförmig enger
        const x = p.x + p.nx * q, z = p.z + p.nz * q;
        const n = sp.naechster(x, z);
        const ok = n.abstand >= g - 1.0;
        return { x, z, y: this.hoeheAn(x, z), ok, s: p.s };
      });
    }

    /**
     * Zaun auf beiden Seiten: Pfosten alle 8 m (EIN InstancedMesh) und zwei
     * Querlatten als durchgehendes Band (EIN Mesh, beidseitig). = 2 Draw-Calls.
     * stil (aus dem Thema): { latten, pfosten (Farben), art: 'holz' | 'leitpfosten' }
     *   'leitpfosten' = weiße Pfosten mit schwarzem Kopf, ohne Latten (Wüste).
     * Auf der Brücke entfällt der Zaun – dort steht das Geländer.
     */
    _zaunBauen(stil) {
      const g = new THREE.Group();
      g.name = 'Zaun';
      const leit = stil.art === 'leitpfosten';
      const PFOSTEN_ALLE = Math.max(1, Math.round((leit ? 10 : 8) / this.spline.ds));
      const LATTEN = leit ? [] : [{ h: 0.45, d: 0.16 }, { h: 0.95, d: 0.16 }];   // Höhe Mitte, Dicke
      const pfosten = [], pos = [];
      [-1, 1].forEach((seite) => {
        const zp = this.zaunPunkte(seite), N = zp.length;
        // Auf Brücken steht das Geländer, im Tunnel die Wand, an engen Spur-Stellen die Leitplanke
        zp.forEach((a) => {
          if (this._engstellen.some(b => this._inBereich(b, a.s, 1.5))) a.ok = false;
          if (this._spurEng.some(e => this._aussen(e, a.s) < SPUR_UEBERGANG + 1.5)) a.ok = false;
        });
        for (let i = 0; i < N; i++) {
          const a = zp[i], b = zp[(i + 1) % N];
          if (i % PFOSTEN_ALLE === 0 && a.ok) pfosten.push(a);
          if (!a.ok || !b.ok) continue;
          if (Math.hypot(b.x - a.x, b.z - a.z) > 8) continue;   // Sprung (Schleife) – auslassen
          for (const l of LATTEN) {
            const u0 = l.h - l.d / 2, u1 = l.h + l.d / 2;
            pos.push(a.x, a.y + u0, a.z, b.x, b.y + u0, b.z, b.x, b.y + u1, b.z,
                     a.x, a.y + u0, a.z, b.x, b.y + u1, b.z, a.x, a.y + u1, a.z);
          }
        }
      });
      // Latten
      const lattenGeo = new THREE.BufferGeometry();
      lattenGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
      lattenGeo.computeVertexNormals();
      if (pos.length) {
        const latten = new THREE.Mesh(lattenGeo, new THREE.MeshLambertMaterial({ color: stil.latten || 0x9a6a3c, side: THREE.DoubleSide }));
        latten.name = 'Zaunlatten';
        g.add(latten);
      }
      // Pfosten (Leitpfosten: 8 Höhen-Segmente, oberstes Stück schwarz mit oranger Reflektor-Linie)
      const pfGeo = leit ? new THREE.BoxGeometry(0.22, 1.1, 0.22, 1, 11, 1) : new THREE.BoxGeometry(0.18, 1.3, 0.18);
      pfGeo.translate(0, leit ? 0.5 : 0.55, 0);
      let pfMat;
      if (leit) {
        const pp = pfGeo.attributes.position, farben = new Float32Array(pp.count * 3), c = new THREE.Color();
        for (let i = 0; i < pp.count; i++) {
          const y = pp.getY(i);
          c.setHex(y > 0.84 ? 0x1c1c1c : y > 0.74 ? 0xff8a1f : stil.pfosten || 0xf2efe6);
          farben.set([c.r, c.g, c.b], i * 3);
        }
        pfGeo.setAttribute('color', new THREE.BufferAttribute(farben, 3));
        pfMat = new THREE.MeshLambertMaterial({ vertexColors: true });
      } else {
        pfMat = new THREE.MeshLambertMaterial({ color: stil.pfosten || 0x6e4a2a });
      }
      const pf = new THREE.InstancedMesh(pfGeo, pfMat, Math.max(1, pfosten.length));
      const m = new THREE.Matrix4();
      pfosten.forEach((p, i) => { m.makeTranslation(p.x, p.y, p.z); pf.setMatrixAt(i, m); });
      pf.count = pfosten.length;
      pf.instanceMatrix.needsUpdate = true;
      pf.name = 'Zaunpfosten';
      g.add(pf);
      this.zaunInfo = { pfosten: pfosten.length, lattenStuecke: pos.length / 36 };
      return g;
    }

    /**
     * Runde 4: Leitplanken an engen Spur-Abschnitten (1 Spur), beidseitig genau an der Bande (grenzeBei),
     * über Abschnitt + Übergang: verzinktes Band (0,45–0,8 m) + Pfosten alle 4 m. Ein Mesh (Vertex-Farben).
     */
    _leitplankenBauen() {
      const v = [], sp = this.spline;
      for (const e of this._spurEng) {
        const a = e.s0 - SPUR_UEBERGANG, laenge = sp.differenzS(e.s1, e.s0) + 2 * SPUR_UEBERGANG;
        const n = Math.max(4, Math.round(laenge / 2));
        [-1, 1].forEach((sg) => {
          for (let k = 0; k < n; k++) {
            const s0 = a + laenge * k / n, s1 = a + laenge * (k + 1) / n;
            const q0 = sg * (this.grenzeBei(s0) - 0.15), q1 = sg * (this.grenzeBei(s1) - 0.15);
            const p0 = this._punktSQ(s0, q0, 0), p1 = this._punktSQ(s1, q1, 0);
            const wand = (u0, u1, farbe) => ({ a: [p0[0], p0[1] + u0, p0[2]], b: [p1[0], p1[1] + u0, p1[2]],
              c: [p1[0], p1[1] + u1, p1[2]], d: [p0[0], p0[1] + u1, p0[2]], farbe });
            v.push(wand(0.45, 0.62, 0xc9ced3), wand(0.62, 0.8, 0xaeb4ba));
            if (k % 2 === 0) {
              const pp = sp.punktBei(s0);
              this._kiste(v, p0[0], p0[2], pp.tx, pp.tz, 0.06, 0.06, p0[1] - 0.2, p0[1] + 0.85, 0x6f757b);
            }
          }
        });
      }
      const mesh = new THREE.Mesh(this._viereckeZuGeometrie(v),
        new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }));
      mesh.name = 'Leitplanken';
      return mesh;
    }

    // ---------------------------------------------------------- Brücken, Senken, Tunnel

    /** Weltpunkt bei Bogenlänge s, quer q, Höhe = Straße an dieser Stelle + dy. */
    _punktSQ(s, q, dy) {
      const p = this.spline.punktBei(s);
      return this._seitPunkt(p, q, dy || 0);
    }

    /** Senkrechte Fläche zwischen (s0,q0) und (s1,q1), Höhen relativ zur Straße (u0 unten, u1 oben). */
    _wandSQ(s0, q0, s1, q1, u0, u1, farbe) {
      const a = this._punktSQ(s0, q0, 0), c = this._punktSQ(s1, q1, 0);
      return { a: [a[0], a[1] + u0, a[2]], b: [c[0], c[1] + u0, c[2]], c: [c[0], c[1] + u1, c[2]], d: [a[0], a[1] + u1, a[2]], farbe };
    }

    /**
     * Quader (z. B. Brückenpfeiler) von yUnten bis yOben (absolut), Mitte (x, z),
     * halbe Kanten hl längs (tx, tz) und hq quer (nx, nz). Ohne Boden.
     */
    _kiste(v, x, z, tx, tz, hl, hq, yUnten, yOben, farbe) {
      const nx = -tz, nz = tx;
      const e = (sl, sq, y) => [x + tx * hl * sl + nx * hq * sq, y, z + tz * hl * sl + nz * hq * sq];
      const ecken = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
      for (let i = 0; i < 4; i++) {
        const [a1, b1] = ecken[i], [a2, b2] = ecken[(i + 1) % 4];
        v.push({ a: e(a1, b1, yUnten), b: e(a2, b2, yUnten), c: e(a2, b2, yOben), d: e(a1, b1, yOben), farbe });
      }
      v.push({ a: e(-1, -1, yOben), b: e(1, -1, yOben), c: e(1, 1, yOben), d: e(-1, 1, yOben), farbe });
    }

    /**
     * Feine Senke unter einer Brücke (2-m-Raster, Bodenhöhe exakt aus bodenHoehe): Böschung, Grund,
     * Schlucht-Schichten in der Wüste. Das grobe Bodengitter liegt hier tiefer (senkeTiefe grob).
     */
    _senkeBauen(b, thema) {
      const m = b.m, RAND = 6 + 18;              // GROB_RAND + eine Zelle des groben Gitters (16 m) + Zugabe
      const L = b.halb + RAND, Q = b.q1 + RAND, ST = 2;
      const nl = Math.ceil(2 * L / ST), nq = Math.ceil(2 * Q / ST);
      const pos = new Float32Array((nl + 1) * (nq + 1) * 3), col = new Float32Array(pos.length);
      const basis = new THREE.Color(thema.boden !== undefined ? thema.boden : 0x5f9e3a);
      const zweite = new THREE.Color(thema.boden2 !== undefined ? thema.boden2 : basis.getHex());
      const c = new THREE.Color(), erde = new THREE.Color(b.art === 'stahl' ? 0xa65a34 : 0x6b5a3a);
      const schicht = new THREE.Color(0xc98a52), grund = new THREE.Color(b.art === 'stahl' ? 0x9c6a44 : 0x4f7a34);
      let o = 0;
      for (let i = 0; i <= nl; i++) {
        for (let j = 0; j <= nq; j++) {
          const l = -L + 2 * L * i / nl, q = -Q + 2 * Q * j / nq;
          const x = m.x + m.tx * l + m.nx * q, z = m.z + m.tz * l + m.nz * q;
          const t = this.senkeTiefe(x, z), y = this.hoeheAn(x, z) - t;
          pos[o] = x; pos[o + 1] = y; pos[o + 2] = z;
          this._bodenFarbe(x, z, basis, zweite, thema.boden2 !== undefined, c);
          const anteil = t / b.tiefe;                     // 0 oben … 1 Grund
          if (anteil > 0.02) {
            if (b.art === 'stahl') {
              // Schlucht: rote Felswände mit hellen Gesteinsschichten, sandiger Grund
              const lage = 0.5 + 0.5 * Math.sin(t * 2.3 + Math.sin(x * 0.05) * 0.8);
              c.lerp(erde, Math.min(1, anteil * 2.2)).lerp(schicht, lage * 0.45 * Math.min(1, anteil * 3));
              if (anteil > 0.93) c.lerp(grund, 0.6);
            } else {
              c.lerp(erde, Math.min(0.75, anteil * 1.6) * (anteil < 0.9 ? 1 : 0.4));
              if (anteil > 0.9) c.lerp(grund, 0.5);
            }
          }
          col[o] = c.r; col[o + 1] = c.g; col[o + 2] = c.b;
          o += 3;
        }
      }
      const index = [];
      for (let i = 0; i < nl; i++) for (let j = 0; j < nq; j++) {
        const a = i * (nq + 1) + j, bb = a + 1, cc = a + nq + 1, d = cc + 1;
        index.push(a, bb, d, a, d, cc);
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
      geo.setIndex(index);
      geo.computeVertexNormals();
      // Umlaufsinn prüfen: Normalen müssen nach oben zeigen
      if (geo.attributes.normal.getY(0) < 0) {
        for (let k = 0; k < index.length; k += 3) { const h = index[k + 1]; index[k + 1] = index[k + 2]; index[k + 2] = h; }
        geo.setIndex(index); geo.computeVertexNormals();
      }
      const mesh = new THREE.Mesh(geo, this._material(undefined, 0));
      mesh.name = 'Senke';
      return mesh;
    }

    /**
     * Brücke b (Daten: bruecken [{ s0, s1, art, tiefe }]) – alles in EINEM Mesh mit Vertex-Farben:
     *   holz:  Bretterbelag, Holzgeländer, Holzjoche bis zum Bach
     *   stein: Steinbrüstung, Bogen über Teich/Bach (Zwickelwände bis zum Bogen)
     *   stahl: Betonplatte auf Pfeilern über der Schlucht, rotes Stahlgeländer
     * Geländer genau an der Bande (grenzeEng). Wasser im Grund (nicht in der Wüste).
     */
    _brueckeBauen(b) {
      const w = this.grenzeEng, v = [], s0 = b.s0, s1 = b.s1, bb = this.breite / 2;
      const schritte = Math.max(4, Math.round(b.laenge));
      const sAt = (k) => s0 + (s1 - s0) * k / schritte;
      const unten = (s, q) => { const p = this._punktSQ(s, q, 0); return this.bodenHoehe(p[0], p[2]); };

      if (b.art === 'holz') {
        // Bretter quer (abwechselnd hell/dunkel), über Straße und Rand bis zum Geländer
        for (let k = 0; k < schritte; k++) {
          const p = this.spline.punktBei(sAt(k)), q = this.spline.punktBei(sAt(k) + (s1 - s0) / schritte * 0.92);
          v.push(this._band(p, q, -w, w, 0.16, k % 2 ? 0x8a5a32 : 0x7a4d2a));
          v.push(this._band(p, q, -bb - 0.25, -bb, 0.17, 0xe8dcc0), this._band(p, q, bb, bb + 0.25, 0.17, 0xe8dcc0));
          v.push(this._band(p, q, -w, w, -0.55, 0x4a301a));                         // Unterseite
        }
        [-1, 1].forEach((sg) => {
          const quer = w * sg;
          for (let k = 0; k < schritte; k++) {
            const a = sAt(k), e = sAt(k + 1);
            v.push(this._wandSQ(a, quer, e, quer, -0.55, 0.16, 0x5a3a1e));            // Randbalken
            v.push(this._wandSQ(a, quer, e, quer, 1.0, 1.18, 0x9a6a3c));              // Handlauf
            v.push(this._wandSQ(a, quer, e, quer, 0.5, 0.62, 0x9a6a3c));              // Mittellatte
            v.push(this._band(this.spline.punktBei(a), this.spline.punktBei(e), quer - 0.12, quer + 0.12, 1.18, 0xa87848));
          }
          // Geländerpfosten alle ~3 m
          const n = Math.max(2, Math.round(b.laenge / 3));
          for (let k = 0; k <= n; k++) {
            const s = s0 + b.laenge * k / n, p = this.spline.punktBei(s);
            const x = p.x + p.nx * quer, z = p.z + p.nz * quer, y = this.hoeheAn(x, z);
            this._kiste(v, x, z, p.tx, p.tz, 0.12, 0.12, y - 0.5, y + 1.3, 0x5a3a1e);
          }
        });
        // Holzjoche: je zwei Stützen + Querbalken alle ~8 m bis in den Bach
        const nJ = Math.max(1, Math.round(b.laenge / 8));
        for (let k = 1; k < nJ; k++) {
          const s = s0 + b.laenge * k / nJ, p = this.spline.punktBei(s);
          let yQuer = Infinity;
          [-1, 1].forEach((sg) => {
            const q = (w - 0.6) * sg, x = p.x + p.nx * q, z = p.z + p.nz * q, y = this.hoeheAn(x, z);
            yQuer = Math.min(yQuer, y);
            this._kiste(v, x, z, p.tx, p.tz, 0.22, 0.22, this.bodenHoehe(x, z) - 0.5, y - 0.5, 0x4e331b);
          });
          const a = this._punktSQ(s, -w + 0.4, 0), e = this._punktSQ(s, w - 0.4, 0);
          this._kiste(v, (a[0] + e[0]) / 2, (a[2] + e[2]) / 2, p.nx, p.nz, w - 0.4, 0.18, yQuer - 1.3, yQuer - 0.9, 0x4e331b);
        }
      } else if (b.art === 'stein') {
        // Bogen: Unterkante wie ein flacher Halbkreis vom Grund an den Enden bis kurz unter die Fahrbahn
        const DICKE = 0.9;
        // Bogen: Unterkante = flacher Halbkreis, in der Mitte DICKE unter der Fahrbahn, an den Enden auf der Böschung
        const mitteTief = this.hoeheAn(b.m.x, b.m.z) - this.bodenHoehe(b.m.x, b.m.z);
        const bogen = (k) => {           // Tiefe der Bogenunterkante unter der Fahrbahn (m, > 0)
          const u = (k / schritte) * 2 - 1, s = sAt(k), p = this._punktSQ(s, 0, 0);
          const luft = p[1] - unten(s, 0) + 0.3;            // bis knapp in die Böschung
          const ub = u / 0.78;                               // Bogen spannt über den Grund, außen volle Mauer
          if (Math.abs(ub) >= 1) return Math.max(DICKE, luft);
          return Math.max(DICKE, Math.min(luft, DICKE + (mitteTief + 0.5 - DICKE) * (1 - Math.sqrt(1 - ub * ub))));
        };
        const wa = w + 0.55;
        for (let k = 0; k < schritte; k++) {
          const a = sAt(k), e = sAt(k + 1), ha = bogen(k), he = bogen(k + 1);
          const steinA = (k % 2) ? 0x9d978b : 0x8f897d;
          [-1, 1].forEach((sg) => {
            // Brüstung (innen + außen + Deckstein)
            v.push(this._wandSQ(a, w * sg, e, w * sg, 0, 0.95, steinA));
            v.push(this._band(this.spline.punktBei(a), this.spline.punktBei(e), Math.min(w * sg, wa * sg), Math.max(w * sg, wa * sg), 0.95, 0xb4ae9f));
            // Zwickelwand außen von der Brüstung bis zur Bogenunterkante
            const pa = this._punktSQ(a, wa * sg, 0), pe = this._punktSQ(e, wa * sg, 0);
            v.push({ a: [pa[0], pa[1] - ha, pa[2]], b: [pe[0], pe[1] - he, pe[2]], c: [pe[0], pe[1] + 0.95, pe[2]], d: [pa[0], pa[1] + 0.95, pa[2]], farbe: steinA });
            // Bogenstein-Band an der Unterkante (dunkler)
            v.push({ a: [pa[0], pa[1] - ha, pa[2]], b: [pe[0], pe[1] - he, pe[2]], c: [pe[0], pe[1] - he + 0.5, pe[2]], d: [pa[0], pa[1] - ha + 0.5, pa[2]], farbe: 0x7b756a });
          });
          // Bogenunterseite (Laibung)
          const pl = this._punktSQ(a, -wa, 0), pr = this._punktSQ(a, wa, 0), ql = this._punktSQ(e, -wa, 0), qr = this._punktSQ(e, wa, 0);
          v.push({ a: [pl[0], pl[1] - ha, pl[2]], b: [pr[0], pr[1] - ha, pr[2]], c: [qr[0], qr[1] - he, qr[2]], d: [ql[0], ql[1] - he, ql[2]], farbe: 0x77716a });
        }
      } else {
        // stahl: Betonplatte 1,4 m dick, Pfeiler bis in die Schlucht, rotes Geländer
        const DICKE = 1.4;
        for (let k = 0; k < schritte; k++) {
          const a = sAt(k), e = sAt(k + 1);
          v.push(this._band(this.spline.punktBei(a), this.spline.punktBei(e), -w - 0.3, w + 0.3, -DICKE, 0x8e8a84));   // Unterseite
          [-1, 1].forEach((sg) => {
            const q = (w + 0.3) * sg;
            v.push(this._wandSQ(a, q, e, q, -DICKE, 0.25, 0xa7a29a));                 // Plattenrand
            v.push(this._band(this.spline.punktBei(a), this.spline.punktBei(e), Math.min(w * sg, q), Math.max(w * sg, q), 0.25, 0xbab5ac));
            v.push(this._wandSQ(a, w * sg, e, w * sg, 0.0, 0.25, 0xa7a29a));          // Bordstein
            v.push(this._wandSQ(a, w * sg, e, w * sg, 0.95, 1.1, 0xc0392b));           // Handlauf
            v.push(this._wandSQ(a, w * sg, e, w * sg, 0.5, 0.58, 0xc0392b));           // Mittelholm
          });
        }
        [-1, 1].forEach((sg) => {
          const n = Math.max(2, Math.round(b.laenge / 2.5));
          for (let k = 0; k <= n; k++) {
            const s = s0 + b.laenge * k / n, p = this.spline.punktBei(s);
            const x = p.x + p.nx * w * sg, z = p.z + p.nz * w * sg, y = this.hoeheAn(x, z);
            this._kiste(v, x, z, p.tx, p.tz, 0.07, 0.07, y, y + 1.1, 0x9b2c20);
          }
        });
        // Pfeiler (je einer pro ~16 m, breit unter der Fahrbahn)
        const nP = Math.max(2, Math.round(b.laenge / 16));
        for (let k = 1; k < nP; k++) {
          const s = s0 + b.laenge * k / nP, p = this.spline.punktBei(s), y = this.hoeheAn(p.x, p.z);
          this._kiste(v, p.x, p.z, p.tx, p.tz, 0.9, bb - 1, this.bodenHoehe(p.x, p.z) - 1, y - DICKE + 0.05, 0x9a948b);
          this._kiste(v, p.x, p.z, p.tx, p.tz, 1.3, bb + 0.2, y - DICKE - 0.6, y - DICKE + 0.05, 0x8a847b);   // Pfeilerkopf
        }
      }
      // Widerlager an beiden Enden (Mauer quer unter der Fahrbahn bis zum Boden)
      [s0, s1].forEach((s) => {
        const p = this.spline.punktBei(s), y = this.hoeheAn(p.x, p.z);
        this._kiste(v, p.x, p.z, p.tx, p.tz, 0.8, w + 0.6, Math.min(y, this.bodenHoehe(p.x, p.z)) - 1.5, y - 0.35,
          b.art === 'holz' ? 0x7d776b : b.art === 'stein' ? 0x8f897d : 0x9a948b);
      });
      // Wasser im Grund (Bach / Teich), folgt dem Gefälle der Senke
      if (b.art !== 'stahl') {
        const breiteL = b.halb * (b.art === 'stein' ? 0.42 : 0.3), Q = b.q0 + 10, ST = 3;
        const m = b.m, pend = (q) => Math.sin(q * 0.11) * 2.2;
        for (let q = -Q; q < Q; q += ST) {
          const ecke = (l, qq) => {
            const ll = l + pend(qq), x = m.x + m.tx * ll + m.nx * qq, z = m.z + m.tz * ll + m.nz * qq;
            return [x, this.bodenHoehe(x, z) + 0.35, z];
          };
          v.push({ a: ecke(-breiteL, q), b: ecke(breiteL, q), c: ecke(breiteL, q + ST), d: ecke(-breiteL, q + ST),
            farbe: b.art === 'stein' ? 0x4f95c0 : 0x3f86b8 });
        }
      }
      const mesh = new THREE.Mesh(this._viereckeZuGeometrie(v),
        new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }));
      mesh.name = 'Bruecke';
      return mesh;
    }

    /**
     * Tunnel (Daten: tunnel [{ s0, s1, art: 'fels' | 'sandstein' }]): Röhre mit dunklen Innenwänden,
     * Fels-/Sandsteinhügel darüber, Steinportal an beiden Enden, Deckenlampen alle 12 m.
     * Liefert [Röhre (1 Mesh, Vertex-Farben), Lampen (1 Mesh, MeshBasic = leuchtet ohne Licht)].
     * this.tunnelLampen = [{ x, y, z, s }] für die Punktlichter (main.js).
     */
    _tunnelBauen() {
      const v = [], lampen = [], sp = this.spline;
      const W = this.grenzeEng + 0.35, WAND = 3.4, H = 6.6, M = 17, N = 13, ST = 2;
      this.tunnelLampen = [];
      for (const t of this.tunnel) {
        const sand = t.art === 'sandstein';
        const fInnen = sand ? 0x3a322c : 0x2e2e30, fWand = sand ? 0x4a4038 : 0x3c3b39;
        const fHuegel = sand ? [0xc68d58, 0xd8a56c, 0xb97f4c] : [0x4b6a33, 0x587a3a, 0x6f6e62];
        const fPortal = sand ? [0xb57d4c, 0xc68d58] : [0x55603f, 0x646a58], fRahmen = sand ? 0xe0b07a : 0xbdb8aa;
        // Querschnitte (Weltkoordinaten): innen 13 Punkte (Wand links unten → Bogen → Wand rechts unten), außen 13
        const quer = (s) => {
          const p = sp.punktBei(s), yc = this.hoeheAn(p.x, p.z);
          const wp = (q, y) => [p.x + p.nx * q, y, p.z + p.nz * q];
          const innen = [], aussen = [];
          innen.push(wp(-W, this.hoeheAn(p.x - p.nx * W, p.z - p.nz * W) - 0.4));
          for (let k = 0; k <= 10; k++) {
            const th = Math.PI - k * Math.PI / 10;
            innen.push(wp(W * Math.cos(th), yc + WAND + (H - WAND) * Math.sin(th)));
          }
          innen.push(wp(W, this.hoeheAn(p.x + p.nx * W, p.z + p.nz * W) - 0.4));
          for (let k = 0; k < N; k++) {
            const tt = -1 + 2 * k / (N - 1), q = tt * (W + M), x = p.x + p.nx * q, z = p.z + p.nz * q;
            const fuss = Math.min(yc - 1, this.bodenHoehe(x, z) - 0.8);
            const rauh = Math.sin(s * 0.37 + k * 1.7) * 0.7 + Math.sin(s * 0.11 - k * 0.9) * 0.6;
            const oben = yc + H + 3.2 + rauh * (1 - Math.abs(tt));
            // runder Hügel: oben flach gewölbt, seitlich weich bis zum Fuß
            const form = Math.cos(Math.min(1, Math.abs(tt)) * Math.PI / 2);
            aussen.push([x, fuss + (oben - fuss) * Math.pow(form, 0.7), z]);
          }
          return { innen, aussen, p, yc };
        };
        const n = Math.max(2, Math.round(t.laenge / ST));
        let alt = quer(t.s0);
        for (let i = 1; i <= n; i++) {
          const s = t.s0 + t.laenge * i / n, neu = quer(s);
          for (let k = 0; k < N - 1; k++) {
            // innen: Wände unten etwas heller, Gewölbe dunkel mit leichten Ringen
            const ring = (i % 3 === 0) ? 0.85 : 1;
            const c = new THREE.Color(k === 0 || k === N - 2 ? fWand : fInnen).multiplyScalar(ring).getHex();
            v.push({ a: alt.innen[k], b: neu.innen[k], c: neu.innen[k + 1], d: alt.innen[k + 1], farbe: c });
            const fh = fHuegel[(Math.floor(i / 2) * 7 + k * 3 + (Math.sin(i * 0.7 + k) > 0.3 ? 1 : 0)) % fHuegel.length];
            v.push({ a: alt.aussen[k], b: alt.aussen[k + 1], c: neu.aussen[k + 1], d: neu.aussen[k], farbe: fh });
          }
          // Gehweg zwischen Randstreifen und Wand (dunkler Beton)
          const b0 = this.breite / 2 + this.randBreite;
          const pa = sp.punktBei(s - t.laenge / n), pb = sp.punktBei(s);
          v.push(this._band(pa, pb, -W, -b0, 0.09, 0x3d3c3a), this._band(pa, pb, b0, W, 0.09, 0x3d3c3a));
          alt = neu;
        }
        // Portale an beiden Enden: Stirnfläche zwischen Röhre und Hügel + vorstehender Steinrahmen
        [[t.s0, -1], [t.s1, 1]].forEach(([s, rv]) => {
          const qs = quer(s), vor = quer(s + rv * 0.6);
          const weit = (pt, mitte, f) => [mitte[0] + (pt[0] - mitte[0]) * f, pt[1], mitte[2] + (pt[2] - mitte[2]) * f];
          for (let k = 0; k < N - 1; k++) {
            // Stirnseite des Hügels: Fels/Moos (Wald) bzw. Sandstein, nur der Rahmen ist heller Stein
            v.push({ a: qs.innen[k], b: qs.innen[k + 1], c: qs.aussen[k + 1], d: qs.aussen[k], farbe: fPortal[k % 2] });
            // Rahmen: innen-Kante 0,6 m vorgezogen, 1,1 m breit
            const ia = vor.innen[k], ib = vor.innen[k + 1];
            const mitte = [vor.p.x, 0, vor.p.z];
            const hoch = (pt, d) => { const r = weit(pt, mitte, (W + 1.6) / W); return [r[0], pt[1] + d, r[2]]; };
            const da = k === 0 ? 0 : 1.5 * Math.sin(Math.PI * (k) / (N - 1)), db = k + 1 === N - 1 ? 0 : 1.5 * Math.sin(Math.PI * (k + 1) / (N - 1));
            v.push({ a: ia, b: ib, c: hoch(ib, db), d: hoch(ia, da), farbe: fRahmen });
            v.push({ a: qs.innen[k], b: qs.innen[k + 1], c: ib, d: ia, farbe: fRahmen });      // Laibung des Rahmens
            v.push({ a: hoch(ia, da), b: hoch(ib, db), c: hoch(qs.innen[k + 1], db), d: hoch(qs.innen[k], da), farbe: fRahmen });
          }
        });
        // Deckenlampen alle 12 m (leuchtende Flächen) – Positionen für die Punktlichter merken
        for (let s = t.s0 + 6; s <= t.s1 - 3; s += 12) {
          const p = sp.punktBei(s), y = this.hoeheAn(p.x, p.z) + H - 0.18;
          const e = (sl, sq) => [p.x + p.tx * 0.9 * sl + p.nx * 0.45 * sq, y, p.z + p.tz * 0.9 * sl + p.nz * 0.45 * sq];
          lampen.push({ a: e(-1, -1), b: e(1, -1), c: e(1, 1), d: e(-1, 1), farbe: 0xfff3c8 });
          this.tunnelLampen.push({ x: p.x, y: y - 0.3, z: p.z, s });
        }
      }
      const roehre = new THREE.Mesh(this._viereckeZuGeometrie(v),
        new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }));
      roehre.name = 'Tunnel';
      const lampenMesh = new THREE.Mesh(this._viereckeZuGeometrie(lampen),
        new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide }));
      lampenMesh.name = 'Tunnellampen';
      return [roehre, lampenMesh];
    }

    // ---------------------------------------------------------- Hindernisse (Grafik)

    /** Geometrien (bereits verschoben) mit je einer Farbe zu einer nicht indizierten Geometrie vereinen. */
    _teileVereinen(teile) {
      const flach = teile.map(t => ({ g: t.geo.index ? t.geo.toNonIndexed() : t.geo, farbe: t.farbe }));
      const anzahl = flach.reduce((s, t) => s + t.g.attributes.position.count, 0);
      const pos = new Float32Array(anzahl * 3), col = new Float32Array(anzahl * 3), c = new THREE.Color();
      let o = 0;
      flach.forEach(({ g, farbe }) => {
        const n = g.attributes.position.count;
        pos.set(g.attributes.position.array, o * 3);
        c.set(farbe);
        for (let i = 0; i < n; i++) col.set([c.r, c.g, c.b], (o + i) * 3);
        o += n;
      });
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
      geo.computeVertexNormals();
      return geo;
    }

    /**
     * Hindernisse als Gruppe 'Strecke Hindernisse' (höchstens 4 Draw-Calls):
     * Flecken (Sand), Ölflecken (glänzend), feste Teile (Ast, Baken, Schilder), Pylonen (InstancedMesh).
     * Die Pylonen ändern sich (umgefahren → blinken → weg): hindernisseAnimieren(zeit).
     */
    hindernisseBauen() {
      // Runde 4: Wracks (Schicht „wracks“) als feste Hindernisse anhängen (einmalig, vor dem Bau der KI-Fahrer)
      if (R.Kollisionen && R.Kollisionen.wracksEinbauen) R.Kollisionen.wracksEinbauen(this);
      const g = new THREE.Group();
      g.name = 'Strecke Hindernisse';
      const sp = this.spline, sand = [], oel = [], teile = [];
      const fleck = (h, liste, farbeMitte, farbeRand, hoch) => {
        const N = 28, seed = h.nr * 7.3;
        const mitte = sp.punktBei(h.s);
        const m = [mitte.x + mitte.nx * h.seitenabstand, 0, mitte.z + mitte.nz * h.seitenabstand];
        m[1] = this.hoeheAn(m[0], m[2]) + hoch;
        let vorher = null, erster = null;
        for (let k = 0; k <= N; k++) {
          const w = (k % N) / N * Math.PI * 2;
          const r = 0.86 + 0.1 * Math.sin(w * 3 + seed) + 0.05 * Math.sin(w * 7 + seed * 2);
          const ds = Math.cos(w) * h.halblaenge * r, dq = Math.sin(w) * h.halbbreite * r;
          const p = sp.punktBei(h.s + ds), q = h.seitenabstand + dq;
          const x = p.x + p.nx * q, z = p.z + p.nz * q, pt = [x, this.hoeheAn(x, z) + hoch, z];
          if (vorher) liste.push({ m, a: vorher, b: pt, fm: farbeMitte, fr: farbeRand });
          vorher = pt; if (!erster) erster = pt;
        }
      };
      for (const h of this.hindernisse) {
        if (h.typ === 'sand') fleck(h, sand, 0xe8d29c, 0xbfa36c, 0.095);
        else if (h.typ === 'oel') fleck(h, oel, 0x07070b, 0x3b2d55, 0.095);
      }
      // Fächer-Dreiecke → Geometrie (Mitte hell/dunkel, Rand andere Farbe), Umlaufsinn nach oben
      const facher = (liste) => {
        const pos = [], col = [], c1 = new THREE.Color(), c2 = new THREE.Color();
        for (const d of liste) {
          c1.set(d.fm); c2.set(d.fr);
          const nyA = (d.a[2] - d.m[2]) * (d.b[0] - d.m[0]) - (d.a[0] - d.m[0]) * (d.b[2] - d.m[2]);
          const [a, b] = nyA > 0 ? [d.a, d.b] : [d.b, d.a];
          pos.push(...d.m, ...a, ...b);
          col.push(c1.r, c1.g, c1.b, c2.r, c2.g, c2.b, c2.r, c2.g, c2.b);
        }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
        geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(col), 3));
        geo.computeVertexNormals();
        return geo;
      };
      if (sand.length) {
        const m = new THREE.Mesh(facher(sand), this._material(undefined, 4));
        m.name = 'Sandflecken'; g.add(m);
      }
      if (oel.length) {
        const m = new THREE.Mesh(facher(oel), new THREE.MeshPhongMaterial({ vertexColors: true, shininess: 60,
          specular: 0xc8c8e8, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }));
        m.name = 'Oelflecken'; g.add(m);
      }
      // Feste Teile: Ast (Stamm + Zweige), Baken (rot-weiß), Baustellen-Schild
      const zyl = (ax, ay, az, bx, by, bz, r, farbe) => {
        const l = Math.hypot(bx - ax, by - ay, bz - az);
        const geo = new THREE.CylinderGeometry(r * 0.75, r, l, 7, 1);
        const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(bx - ax, by - ay, bz - az).normalize());
        geo.applyQuaternion(q); geo.translate((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2);
        teile.push({ geo, farbe });
      };
      const kiste = (x, y, z, sx, sy, sz, drehung, farbe) => {
        const geo = new THREE.BoxGeometry(sx, sy, sz);
        geo.rotateY(drehung); geo.translate(x, y, z);
        teile.push({ geo, farbe });
      };
      const pylonen = [];
      for (const h of this.hindernisse) {
        if (h.typ === 'ast') {
          const sg = h.segmente[0], dk = sg.dicke;
          const ya = this.hoeheAn(sg.ax, sg.az) + dk * 0.8, yb = this.hoeheAn(sg.bx, sg.bz) + dk * 0.7;
          zyl(sg.ax, ya, sg.az, sg.bx, yb, sg.bz, dk * 1.15, 0x6b4426);
          // Zweige: drei Stück, schräg nach oben/zur Seite, mit Blattbüscheln
          const L = Math.hypot(sg.bx - sg.ax, sg.bz - sg.az), ux = (sg.bx - sg.ax) / L, uz = (sg.bz - sg.az) / L;
          [[0.3, 1, 1.6], [0.55, -1, 1.3], [0.8, 1, 1.1]].forEach(([f, s, len]) => {
            const x0 = sg.ax + ux * L * f, z0 = sg.az + uz * L * f, y0 = ya + (yb - ya) * f;
            const x1 = x0 + (ux * 0.6 - uz * s) * len, z1 = z0 + (uz * 0.6 + ux * s) * len, y1 = y0 + 0.5 * len;
            zyl(x0, y0, z0, x1, y1, z1, dk * 0.38, 0x7a5030);
            const blatt = new THREE.IcosahedronGeometry(0.7, 0); blatt.translate(x1, y1 + 0.15, z1);
            teile.push({ geo: blatt, farbe: this.thema === 'wueste' ? 0x8a8a4a : 0x3f7a2c });
          });
          // Rinde-Stummel am dicken Ende
          zyl(sg.ax - ux * 0.3, ya, sg.az - uz * 0.3, sg.ax, ya, sg.az, dk * 1.05, 0x58361d);
        } else if (h.typ === 'baustelle') {
          const sg = h.segmente[0];
          const L = Math.hypot(sg.bx - sg.ax, sg.bz - sg.az), ux = (sg.bx - sg.ax) / L, uz = (sg.bz - sg.az) / L;
          const dreh = Math.atan2(-uz, ux);
          // Bake: rot-weiß gestreifte Planke auf zwei Füßen (Streifen = einzelne Kisten)
          const nStreifen = Math.max(4, Math.round(L / 0.6));
          for (let k = 0; k < nStreifen; k++) {
            const f = (k + 0.5) / nStreifen, x = sg.ax + ux * L * f, z = sg.az + uz * L * f, y = this.hoeheAn(x, z);
            kiste(x, y + 0.85, z, L / nStreifen, 0.32, 0.08, dreh, k % 2 ? 0xf2f2f2 : 0xd62b22);
            kiste(x, y + 0.45, z, L / nStreifen, 0.16, 0.06, dreh, k % 2 ? 0xd62b22 : 0xf2f2f2);
          }
          [0.08, 0.92].forEach((f) => {
            const x = sg.ax + ux * L * f, z = sg.az + uz * L * f, y = this.hoeheAn(x, z);
            kiste(x, y + 0.5, z, 0.08, 1.0, 0.08, dreh, 0x333333);
            kiste(x, y + 0.04, z, 0.25, 0.08, 0.7, dreh, 0x222222);
            // Warnleuchte oben
            kiste(x, y + 1.12, z, 0.18, 0.16, 0.12, dreh, 0xffb400);
          });
          // Schild "Baustelle" am Fahrbahnrand vor der Schräge (rotes Dreieck, weiße Fläche, schwarzes Männchen)
          const ps = sp.punktBei(h.s0 - 12), qS = h.seite * (this.breite / 2 + this.randBreite + 1.2);
          const xs = ps.x + ps.nx * qS, zs = ps.z + ps.nz * qS, ys = this.hoeheAn(xs, zs);
          const blick = Math.atan2(-ps.tx, -ps.tz);     // Schild schaut den Autos entgegen
          kiste(xs, ys + 1.0, zs, 0.08, 2.0, 0.08, blick, 0x8a8a8a);
          const dreieck = (r, farbe, vor) => {
            const geo = new THREE.CircleGeometry(r, 3); geo.rotateZ(Math.PI / 2);
            geo.translate(0, 0, vor); geo.rotateY(blick); geo.translate(xs, ys + 2.2, zs);
            teile.push({ geo, farbe });
            const hinten = new THREE.CircleGeometry(r, 3); hinten.rotateZ(Math.PI / 2); hinten.rotateY(Math.PI);
            hinten.translate(0, 0, -0.02); hinten.rotateY(blick); hinten.translate(xs, ys + 2.2, zs);
            teile.push({ geo: hinten, farbe: 0x9a9a9a });
          };
          dreieck(0.75, 0xd62b22, 0.05); dreieck(0.55, 0xf4f4f4, 0.07);
          const mann = new THREE.BoxGeometry(0.12, 0.38, 0.02); mann.rotateZ(0.5); mann.translate(0, 0, 0.09);
          mann.rotateY(blick); mann.translate(xs, ys + 2.15, zs);
          teile.push({ geo: mann, farbe: 0x111111 });
          h.pylonen.forEach((p) => pylonen.push(p));
        }
      }
      if (teile.length) {
        const m = new THREE.Mesh(this._teileVereinen(teile), new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }));
        m.name = 'Hindernisteile'; g.add(m);
      }
      if (pylonen.length) {
        // Pylone: Fuß (schwarz), Kegel (orange) mit weißem Reflexstreifen – eine Geometrie mit Vertex-Farben
        const fuss = new THREE.BoxGeometry(0.5, 0.05, 0.5); fuss.translate(0, 0.025, 0);
        const unten = new THREE.CylinderGeometry(0.17, 0.24, 0.3, 10); unten.translate(0, 0.2, 0);
        const streifen = new THREE.CylinderGeometry(0.13, 0.17, 0.16, 10); streifen.translate(0, 0.43, 0);
        const oben = new THREE.CylinderGeometry(0.035, 0.13, 0.28, 10); oben.translate(0, 0.65, 0);
        const geo = this._teileVereinen([{ geo: fuss, farbe: 0x222222 }, { geo: unten, farbe: 0xff6a10 },
          { geo: streifen, farbe: 0xf6f6f6 }, { geo: oben, farbe: 0xff6a10 }]);
        const m = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true }), pylonen.length);
        m.name = 'Pylonen';
        m.frustumCulled = false;          // Instanzen ändern sich: keine feste Begrenzungskugel
        this._pylonMesh = m; this._pylonListe = pylonen;
        pylonen.forEach((p, i) => { p.i = i; p.y = this.hoeheAn(p.x, p.z) + 0.07; m.setColorAt(i, new THREE.Color(1, 1, 1)); });
        g.add(m);
        this.pylonenGeaendert = true;
        this.hindernisseAnimieren(0);
      }
      // Runde 4: liegengebliebene/brennende Autos (Grafik + Warnblinker/Feuer in physics/schaden.js)
      const wracke = this.hindernisse.filter(h => h.typ === 'wrack' || h.typ === 'brand');
      if (wracke.length && R.Schaden && R.Schaden.wrackGruppe) g.add(R.Schaden.wrackGruppe(this, wracke));
      return g;
    }

    /**
     * Pylonen-Zustand anzeigen: stehen / umgefahren (blinkt blinkZeit s rot und kippt) / weg.
     * Nur Arbeit, wenn sich etwas geändert hat oder gerade eine blinkt.
     */
    hindernisseAnimieren(zeit) {
      const m = this._pylonMesh;
      if (!m || (!this.pylonenGeaendert && !this._blinkt)) return;
      const C = (R.config.hindernisse && R.config.hindernisse.baustelle) || {}, blink = C.blinkZeit || 0.3;
      const mat = this._m4 || (this._m4 = new THREE.Matrix4()), q = this._q || (this._q = new THREE.Quaternion());
      const v = this._v3 || (this._v3 = new THREE.Vector3()), sk = this._sk || (this._sk = new THREE.Vector3());
      const achse = this._achse || (this._achse = new THREE.Vector3()), farbe = this._farbe || (this._farbe = new THREE.Color());
      let blinkt = false;
      for (const p of this._pylonListe) {
        v.set(p.x, p.y, p.z); q.identity(); sk.set(1, 1, 1); farbe.setRGB(1, 1, 1);
        if (p.weg) {
          const t = zeit - p.wegZeit;
          if (t >= 0 && t < blink) {
            blinkt = true;
            achse.set(p.kx || 1, 0, p.kz || 0).normalize();
            q.setFromAxisAngle(achse, Math.min(1.4, t / blink * 1.4));        // kippt um
            if (Math.floor(t / 0.06) % 2 === 0) farbe.setRGB(1.6, 0.1, 0.1); else farbe.setRGB(1.2, 1.2, 1.2);
          } else sk.set(0, 0, 0);
        }
        mat.compose(v, q, sk);
        m.setMatrixAt(p.i, mat);
        m.setColorAt(p.i, farbe);
      }
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
      this._blinkt = blinkt;
      this.pylonenGeaendert = false;
    }
  }

  Strecke.headingAus = headingAus;
  Strecke.weltName = weltName;            // (daten, wunsch) → gültiger Weltname
  Strecke.weltSchichten = weltSchichten;  // (daten, name) → { schicht: bool }
  Strecke.SCHICHTEN = SCHICHTEN;
  Strecke.SPUR_BREITE = SPUR_BREITE;
  Strecke.SPUR_UEBERGANG = SPUR_UEBERGANG;
  R.Strecke = Strecke;
  R.headingAus = headingAus;
})();
