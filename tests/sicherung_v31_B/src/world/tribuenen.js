// ============================================================
// 15.10. (v25) Zuschauertribünen auf Wiese, Wüste und Fantasie.
//   Wunsch des Vaters: „Baue noch Zuschauertribünen bei Wüste, Wiese, Fantasie, ungefähr 5 je Strecke, auch in Kurven,
//   dort wo Zuschauertribünen sind auch mit Akustik.“   (Akustik: src/audio/publikum.js, R.Publikum)
//
//   R.Tribuenen.berechnen(strecke) → [Tribüne]   (reine Logik, deterministisch, kein Zufall außer einem festen Seed; läuft auch in Node/Server)
//   R.Tribuenen.einbauen(strecke)  → [Tribüne]   berechnen + strecke.tribuenen + feste Kollisions-Säulen (strecke.saeulen, art 'tribuene')
//   R.Tribuenen.bauen(strecke)     → THREE.Group 'Tribuenen' | null   (3 Meshes = +3 Draw-Calls: Gerüst, Zuschauer, Banner/Fahnen)
//   R.Tribuenen.animieren(strecke, zeit, dt)   Wippen/Jubeln der Zuschauer (Uniforms), Fahnen wehen
//   R.Tribuenen.jubeln(strecke, nr, staerke)   Zuschauer der Tribüne nr jubeln (Arme hoch, hüpfen); wird von R.Publikum gerufen
//   R.Tribuenen.sperre(strecke, x, z, zugabe)  liegt (x, z) auf/neben einer Tribüne? (trackBuilder.dekoSperre: keine Pflanzen darauf)
//
//   Tribüne = { nr, typ: 'start' | 'kurve' | 'gerade', thema, s, seite (−1 links, +1 rechts), laenge, reihen, tiefe, hoehe,
//     x, z (Mitte der Vorderkante), tx, tz (Längsrichtung = Straßenrichtung), ox, oz (nach außen, weg von der Straße),
//     yBasis (Oberkante Gelände, höchster Punkt), yMin, kurve: { dir, winkel, apexS } | null, dach (Anteil 0.5…1), seed }
//   Lokale Achsen: u = längs (tx, tz), v = nach außen (ox, oz), y = hoch. Vorderkante bei v = 0, Rückseite bei v = tiefe.
//
//   Lage: HINTER der Bande (Bande + abstandBande m), Kurventribünen an der Kurvenaußenseite, eine am Start/Ziel; nie in/neben Tunnel, Brücke,
//   Überführung, Kreuzung, Gabelung, Looping, Schanze, Turbo-Feld, Hindernissen, nicht an Engstellen (Leitplanke), nicht in der Nähe anderer
//   Streckenteile (echter Abstand zu ALLEN Abschnitten), nicht an steilem Gelände, nicht auf Kurvenschild-Masten/Startbogen.
//   Konfiguration: config.tribuenen (an: false schaltet alles ab).
// ============================================================
(function () {
  const R = window.Rennspiel;

  const cfg = () => R.config.tribuenen || {};
  const num = (v, d) => (typeof v === 'number' && isFinite(v) ? v : d);
  const MAX_ZONEN = 12;      // Jubel-Zonen im Zuschauer-Shader (Tribünen je Strecke ≤ 12)

  // ------------------------------------------------------------------ Zufall (fester Seed → überall gleiche Tribünen)
  function mulberry32(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      let t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  function textSeed(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

  // ------------------------------------------------------------------ Themen / Farben
  const THEMEN = {
    wiese: {
      beton: 0xb9bdc2, betonDunkel: 0x8c9197, stahl: 0x4d5a66, sitze: [0xd33b2f, 0x2f6fd0, 0xf2c200, 0xf4f4f4],
      dach: [0xc0392b, 0x2e6fb5, 0x2f9e5a], blende: 0xf4f4f4, bande: [0xe84a3c, 0xf6f6f6, 0x2f6fd0, 0xf6f6f6], banner: 0, fahnen: [0, 1, 2],
    },
    wueste: {
      beton: 0xdcc391, betonDunkel: 0xb89a68, stahl: 0x7a5636, sitze: [0xc0562c, 0xf0c27a, 0x8c3b1e, 0xfff0cf],
      dach: [0xd98e3b, 0xc4572a, 0xe9c46a], blende: 0xfff0cf, bande: [0xd98e3b, 0xfff0cf, 0x8c3b1e, 0xf0c27a], banner: 1, fahnen: [3, 4],
    },
    fantasie: {
      beton: 0xeaa8da, betonDunkel: 0x9a70d6, stahl: 0x2fb4c8, sitze: [0xff4fa3, 0x37d6c8, 0xffd93b, 0x8a5cff, 0x5cd65c],
      dach: [0xff4fa3, 0x37d6c8, 0xffd93b, 0x8a5cff], blende: 0xffd93b, bande: [0xff4fa3, 0x37d6c8, 0xffd93b, 0x8a5cff], banner: 2, fahnen: [5, 6, 7],
    },
  };
  // v28 W9: Wald (Holz), Dino (Stein + Palmen), Alpen (Holz, Alpen-Fahnen) – nur Start/Ziel-Tribüne (config.tribuenen.nurStart)
  THEMEN.wald = {
    beton: 0x9a7448, betonDunkel: 0x5e4630, stahl: 0x4a3524, sitze: [0x2f7a3c, 0xc98a3a, 0x8a5a2b, 0xe8dcc0],
    dach: [0x7a4a26, 0x5e4630, 0x8a5a2b], blende: 0xe8dcc0, bande: [0x2f7a3c, 0xe8dcc0, 0x7a4a26, 0xe8dcc0], banner: 3, fahnen: [8, 9, 10], holz: true,
  };
  THEMEN.dino = {
    beton: 0xa89f91, betonDunkel: 0x6f675b, stahl: 0x5a4a38, sitze: [0xd96f2b, 0x6aa84f, 0xf2c14e, 0xe9e1cf],
    dach: [0x4f9a3c, 0x7da63a, 0x3c7a34], blende: 0xe9e1cf, bande: [0x6aa84f, 0xe9e1cf, 0xd96f2b, 0xe9e1cf], banner: 4, fahnen: [11, 12], palmen: true,
  };
  THEMEN.alpen = {
    beton: 0xa5784a, betonDunkel: 0x6b4a2c, stahl: 0x5a3d22, sitze: [0xc8322a, 0xf4f4f4, 0x2f6fd0, 0x3f7a3c],
    dach: [0x7a4a26, 0xa5593a, 0x6b4a2c], blende: 0xf4f4f4, bande: [0xf6f6f6, 0x2f6fd0, 0xf6f6f6, 0xc8322a], banner: 5, fahnen: [13, 14, 15], holz: true,
  };
  const FARBEN_ZUSCHAUER = [0xe53935, 0x1e88e5, 0xfdd835, 0x43a047, 0xffffff, 0xff7043, 0x8e24aa, 0x00acc1, 0xf06292, 0x212121, 0xffb300, 0x7cb342];

  // ------------------------------------------------------------------ Themen-Abschnitte (Megastrecke: je Abschnitt ein Thema)
  /** Bereiche { s0, s1, thema }, in denen Tribünen stehen dürfen (normale Strecke: ganze Runde, wenn das Thema passt). */
  function bereicheVon(st) {
    const C = cfg(), erlaubt = C.themen || ['wiese', 'wueste', 'fantasie'], L = st.spline.laenge, d = st.daten || {};
    if (d.mega && R.Mega && R.Mega.info && R.Mega.info.sektionen) {
      return R.Mega.info.sektionen.filter((s) => erlaubt.indexOf(s.thema) >= 0).map((s) => ({ s0: s.s0, s1: Math.min(L, s.s1), thema: s.thema, mega: true }));
    }
    const th = st.thema || d.thema;
    return erlaubt.indexOf(th) >= 0 ? [{ s0: 0, s1: L, thema: th, mega: false }] : [];
  }

  // ------------------------------------------------------------------ Sperrzonen
  /** Ist Bogenlänge s (± zug m) gesperrt? Streckenteile (Tunnel, Brücke …) mit zug, Hindernisse/Wracks/… mit hindZug. */
  function gesperrt(st, s, zug, hindZug) {
    const sp = st.spline;
    if (st.tunnelBei(s, zug) || st.brueckeBei(s, zug) || st.ueberfuehrungNah(s, zug) || st.kreuzungNah(s, zug)) return true;
    if (st.gabelungen && st.gabelungen.length && st.gabelNah(s, zug)) return true;
    if (st.loopings && st.loopings.length && st.loopingBei(s, zug + 20)) return true;
    for (const e of st.schanzen || []) { const d = sp.differenzS(s, e.s); if (d > -(zug + (e.anlauf || 0) + 40) && d < (e.laenge || 10) + zug) return true; }
    for (const e of st.boostFelder || []) { const d = sp.differenzS(s, e.s); if (d > -zug && d < (e.laenge || 12) + zug) return true; }
    const dd = st.daten || {};
    const listen = [st.hindernisse, st.wracks, st.strohballen, st.schilde, st.dinos, st.spuren, dd.baelle, dd.wasserstrahlen];
    for (let k = 0; k < listen.length; k++) {
      const li = listen[k]; if (!li) continue;
      for (let i = 0; i < li.length; i++) {
        const e = li[i];
        if (typeof e.s0 === 'number' && typeof e.s1 === 'number') {
          if (sp.differenzS(s, e.s0) >= -hindZug && sp.differenzS(s, e.s1) <= hindZug) return true;
        } else if (typeof e.s === 'number') {
          if (Math.abs(sp.differenzS(s, e.s)) < hindZug + (e.halblaenge || 0)) return true;
        }
      }
    }
    return false;
  }

  // ------------------------------------------------------------------ Platz prüfen
  /**
   * Tribüne an Bogenlänge s auf Seite `seite` (−1/+1) mit Länge/Reihen: gültiger Platz oder null.
   * Prüft Sperrzonen, Bande, Abstand zu ALLEN Streckenabschnitten, Gelände (Hang, Senke, Tunnelhügel) und feste Säulen.
   */
  function nein(grund) { platz.grund = grund; return null; }
  function platz(st, s, seite, laenge, reihen) {
    const C = cfg(), sp = st.spline;
    s = sp.wrapS(s);
    const hl = laenge / 2, vorne = num(C.vorne, 1.6), tiefe = vorne + reihen * num(C.reiheTiefe, 0.9) + num(C.hinten, 1.4);
    const g = st.grenzeBei(s);
    if (g < st.seitenabstandMax - 0.01) return nein('engstelle');                       // Engstelle (Leitplanke, Brücke …): keine Bande-Reserve
    const zug = num(C.sperre, 14), hz = num(C.sperreHindernis, 6);
    for (let d = -hl - 8; d <= hl + 8 + 1e-9; d += 6) if (gesperrt(st, s + d, zug, hz)) return nein('sperrzone');
    const p = sp.punktBei(s), q0 = g + num(C.abstandBande, 3);
    const ox = p.nx * seite, oz = p.nz * seite, tx = p.tx, tz = p.tz;
    const X = p.x + ox * q0, Z = p.z + oz * q0;
    // feste Säulen (Schildmasten, Startbogen, Looping-Beine, Kreuzungs-Masten) dürfen nicht auf/neben der Tribüne stehen
    for (const q of st.saeulen || []) {
      if (q.art === 'tribuene') continue;
      const du = (q.x - X) * tx + (q.z - Z) * tz, dv = (q.x - X) * ox + (q.z - Z) * oz, r = (q.r || 0.3) + 2;
      if (Math.abs(du) < hl + r && dv > -r && dv < tiefe + r) return nein('saeule');
    }
    // Raster über die Standfläche: zuerst die Ecken (schnelles Ausscheiden), dann alles
    const nu = Math.max(2, Math.ceil(laenge / 3));
    const us = []; for (let i = 0; i <= nu; i++) us.push(-hl - 1 + (laenge + 2) * i / nu);
    const vs = [-1.5, tiefe + 1.5, 0, tiefe * 0.5, tiefe];
    const rad = st.seitenabstandMax + 8;
    const hangMax = (C.nurStart || []).indexOf(st.thema || (st.daten && st.daten.thema)) >= 0 ? num(C.startMaxHang, 4.5) : num(C.maxHang, 2.2);   // v28 W9: Alpen-Hang am Start
    let yMax = -Infinity, yMin = Infinity;
    const punkte = [];
    const usR = [us[0], us[us.length - 1]].concat(us.slice(1, -1));          // Ecken zuerst (schnelles Ausscheiden)
    for (const v of vs) for (const u of usR) punkte.push([u, v]);
    for (const [u, v] of punkte) {
      const x = X + tx * u + ox * v, z = Z + tz * u + oz * v;
      const ab = sp.abschnitte(x, z, rad);
      for (const e of ab) if (e.abstand < st.grenzeBei(e.s) + 0.8) return nein('streckenteil');      // zu nah an einem Streckenteil (auch an fremden Abschnitten)
      if (st.dekoSperre(x, z)) return nein('dekosperre');                                           // Tunnelhügel, Brückensenke, Kreuzung, steiler Hang …
      if (st.senkeTiefe(x, z) > 0.01) return nein('senke');
      const h = st.hoeheAn(x, z);
      if (h > yMax) yMax = h; if (h < yMin) yMin = h;
      if (yMax - yMin > hangMax) return nein('hang');
    }
    return { s, seite, laenge, reihen, tiefe, x: X, z: Z, tx, tz, ox, oz, yBasis: yMax, yMin, q0 };
  }

  // ------------------------------------------------------------------ Auswahl
  function berechnen(st) {
    const C = cfg(), sp = st.spline, L = sp.laenge;
    if (C.an === false) return [];
    const bereiche = bereicheVon(st);
    if (!bereiche.length) return [];
    const bereichVon = (s) => { s = sp.wrapS(s); for (let i = 0; i < bereiche.length; i++) if (s >= bereiche[i].s0 && s < bereiche[i].s1) return i; return -1; };
    const d = st.daten || {};
    const seed = textSeed(String(d.id || st.name || '') + ':' + Math.round(L)) ^ 0x7b1b0e;
    const rnd = mulberry32(seed);
    // Anzahl je Bereich (normale Strecke: ein Bereich; Megastrecke: je Themenabschnitt)
    const nurStart = C.nurStart || [];
    const refL = num(C.refLaenge, 3300), basis = num(C.anzahl, 5);
    const soll = bereiche.map((b) => {
      const len = b.s1 - b.s0, roh = Math.round(basis * len / refL);
      if (nurStart.indexOf(b.thema) >= 0) return b.mega ? 0 : 1;          // v28 W9: Wald/Dino/Alpen: nur die Start/Ziel-Tribüne
      if (!b.mega && st.daten && st.daten.tribuenenOpt && num(st.daten.tribuenenOpt.anzahl, 0) > 0) return Math.floor(st.daten.tribuenenOpt.anzahl);   // v29 F3: Formel 1 = Start/Ziel + 2 Kurven (Katalog tribuenenOpt)
      return b.mega ? Math.max(num(C.megaMin, 2), Math.min(roh, num(C.anzahlMax, 8))) : Math.max(num(C.anzahlMin, 5), Math.min(roh, num(C.anzahlMax, 8)));
    });
    const kurven = (d.tribuenenOpt && R.Formel1 && R.Formel1.tribuenenKurven ? R.Formel1.tribuenenKurven(st)      // v29 F3: weite Formel-1-Kurven (Kurvenschilder-Suche kennt nur enge)
      : (R.Kurvenschilder && R.Kurvenschilder.kurvenSuchen ? R.Kurvenschilder.kurvenSuchen(st) : []))
      .filter((k) => k.winkel >= num(C.kurveWinkelMin, 35));
    const lMin = num(C.laenge && C.laenge[0], 30), lMax = num(C.laenge && C.laenge[1], 40);
    const rMin = num(C.reihen && C.reihen[0], 5), rMax = num(C.reihen && C.reihen[1], 8);
    const gewaehlt = [];
    const sepOk = (pl) => gewaehlt.every((o) => Math.abs(sp.differenzS(o.s, pl.s)) >= num(C.abstandMin, 130) && Math.hypot(o.x - pl.x, o.z - pl.z) >= num(C.abstandWelt, 70));
    const imBereich = (pl) => {
      const hl = pl.laenge / 2, b = bereichVon(pl.s);
      return b >= 0 && bereichVon(pl.s - hl) === b && bereichVon(pl.s + hl) === b;
    };
    /** Versuch an s: Seiten der Reihe nach, Längen absteigend. Gibt den Platz (mit Typ) zurück oder null. */
    const versuche = (typ, s, seiten, extra) => {
      const reihen = rMin + Math.floor(rnd() * (rMax - rMin + 1));
      const lang = lMin + rnd() * (lMax - lMin);
      for (const seite of seiten) {
        for (const l of [lang, Math.max(20, lang - 6), 20]) {
          const pl = platz(st, s, seite, Math.round(l * 2) / 2, reihen);
          if (pl && imBereich(pl) && sepOk(pl)) { pl.typ = typ; if (extra) pl.kurve = extra; return pl; }
        }
      }
      return null;
    };

    // 1) Start/Ziel (nur eine je Strecke): möglichst genau an der Ziellinie, rechts vor links
    let startDa = false;
    const wunschSeite = d.tribuenenOpt && d.tribuenenOpt.startSeite;     // v29 F3: Formel 1 – Start/Ziel-Tribüne links (Boxen rechts)
    const startSeiten = wunschSeite === -1 ? [-1, 1] : [1, -1];
    for (const off of [0, 8, -8, 16, -16, 28, -28, 42, -42, 60, -60, 80, -80, 100, -100, 125, -125, 150, -150]) {
      const pl = versuche('start', off, startSeiten);
      if (pl) { gewaehlt.push(pl); startDa = true; break; }
    }
    // 2) Kurventribünen (Außenseite), je Bereich ein Anteil der Tribünen, größte Winkel zuerst
    bereiche.forEach((b, bi) => {
      const hatStart = startDa && gewaehlt.length && bereichVon(gewaehlt[0].s) === bi;
      const frei = soll[bi] - (hatStart ? 1 : 0);
      let nK = b.mega ? Math.round(soll[bi] * num(C.kurvenAnteil, 0.4)) : Math.max(num(C.kurvenMin, 2), Math.round(soll[bi] * num(C.kurvenAnteil, 0.4)));
      nK = Math.min(nK, frei);
      const kand = kurven.filter((k) => bereichVon(k.apexS) === bi).sort((a, c) => c.winkel - a.winkel || a.apexS - c.apexS);
      let geschafft = 0;
      for (const k of kand) {
        if (geschafft >= nK) break;
        const aussen = k.dir > 0 ? -1 : 1;                       // Rechtskurve → Außenseite links
        let pl = null;
        for (const off of [0, -10, 10, -20, 20, -32, 32]) {
          pl = versuche('kurve', k.apexS + off, [aussen], { dir: k.dir, winkel: Math.round(k.winkel), apexS: k.apexS });
          if (pl) break;
        }
        if (pl) { gewaehlt.push(pl); geschafft++; }
      }
    });
    // 3) Rest auf Geraden verteilen: immer in die größte Lücke
    bereiche.forEach((b, bi) => {
      let fehl = 0, durchlaeufe = 0;
      const sperrLuecken = [];
      while (fehl < 40 && durchlaeufe++ < 400) {     // v26b: harte Obergrenze (auch wenn eine Platzierung nicht zum Bereich zählt)
        const meine = gewaehlt.filter((o) => bereichVon(o.s) === bi);
        if (meine.length >= soll[bi]) break;
        // Lücken im Bereich
        const ss = meine.map((o) => o.s).sort((x, y) => x - y);
        const luecken = [];
        if (!b.mega && b.s0 === 0 && b.s1 === L) {
          if (!ss.length) luecken.push({ a: 0, l: L });
          else for (let i = 0; i < ss.length; i++) { const a = ss[i], e = i + 1 < ss.length ? ss[i + 1] : ss[0] + L; luecken.push({ a, l: e - a }); }
        } else {
          const gr = [b.s0].concat(ss, [b.s1]);
          for (let i = 0; i + 1 < gr.length; i++) luecken.push({ a: gr[i], l: gr[i + 1] - gr[i] });
        }
        const brauchbar = luecken.filter((q) => !sperrLuecken.some((z) => Math.abs(z - (q.a + q.l / 2)) < 20));
        if (!brauchbar.length) break;
        brauchbar.sort((x, y) => y.l - x.l);
        const lu = brauchbar[0];
        let pl = null;
        const letzte = meine.length ? meine[meine.length - 1].seite : -1;
        const mitte = lu.a + lu.l / 2, spanne = Math.min(lu.l * 0.35, 160);
        for (let off = 0; off <= spanne && !pl; off += 10) {
          for (const o of off === 0 ? [0] : [off, -off]) {
            const seiten = letzte > 0 ? [-1, 1] : [1, -1];
            pl = versuche('gerade', mitte + o, seiten);
            if (pl) break;
          }
        }
        if (pl) gewaehlt.push(pl); else { sperrLuecken.push(mitte); fehl++; }
      }
    });
    // Fertigstellen: sortieren, Daten ergänzen
    gewaehlt.sort((a, b) => a.s - b.s);
    gewaehlt.forEach((t, nr) => {
      const bi = bereichVon(t.s), th = bi >= 0 ? bereiche[bi].thema : bereiche[0].thema;
      const rt = num(C.reiheTiefe, 0.9), rh = num(C.reiheHoehe, 0.45);
      t.nr = nr; t.thema = th;
      t.kurve = t.kurve || null;
      t.hoehe = 0.35 + t.reihen * rh;
      t.dach = [1, 0.75, 0.6, 0.9, 0.7][nr % 5];
      if (t.typ === 'start') t.dach = 1;
      t.seed = (seed + nr * 7919) >>> 0;
      t.reiheTiefe = rt; t.reiheHoehe = rh;
    });
    return gewaehlt;
  }

  /** Säulen (Kreise) für die Kollision: eine Reihe entlang der Vorderkante. */
  function saeulenVon(t) {
    const C = cfg(), r = num(C.kollisionRadius, 1.9), sa = [], hl = t.laenge / 2;
    const n = Math.max(2, Math.ceil((t.laenge - 2 * r) / (r * 1.6)) + 1);
    for (let i = 0; i < n; i++) {
      const u = -hl + r + (t.laenge - 2 * r) * i / (n - 1), v = 0.4;
      sa.push({ x: t.x + t.tx * u + t.ox * v, z: t.z + t.tz * u + t.oz * v, r, art: 'tribuene', nr: t.nr });
    }
    return sa;
  }

  /** Berechnen UND eintragen: strecke.tribuenen + feste Säulen (auch im Server – Physik identisch). Idempotent. */
  function einbauen(st) {
    if (st._tribSaeulen) st.saeulen = (st.saeulen || []).filter((q) => st._tribSaeulen.indexOf(q) < 0);
    st._tribSaeulen = null; st.tribuenen = [];
    const C = cfg();
    if (C.an === false) return st.tribuenen;
    const liste = berechnen(st);
    st.tribuenen = liste;
    const sa = [];
    if (C.kollision !== false) liste.forEach((t) => saeulenVon(t).forEach((q) => sa.push(q)));
    st._tribSaeulen = sa;
    if (sa.length) st.saeulen = (st.saeulen || []).concat(sa);
    return liste;
  }

  /** Liegt (x, z) auf oder bis `zugabe` m neben einer Tribüne? */
  function sperre(st, x, z, zugabe) {
    const li = st.tribuenen; if (!li || !li.length) return false;
    const zg = zugabe === undefined ? num(cfg().dekoAbstand, 4) : zugabe;
    for (let i = 0; i < li.length; i++) {
      const t = li[i], dx = x - t.x, dz = z - t.z;
      if (dx * dx + dz * dz > (t.laenge + t.tiefe + 10) * (t.laenge + t.tiefe + 10)) continue;
      const u = dx * t.tx + dz * t.tz, v = dx * t.ox + dz * t.oz;
      if (Math.abs(u) < t.laenge / 2 + zg && v > -zg && v < t.tiefe + zg) return true;
    }
    return false;
  }

  // ------------------------------------------------------------------ Grafik: Mesher
  /** Sammelt Dreiecke (Position, Normale, Farbe, optional UV + Wehen-Gewicht). */
  function Mesher(mitUv) {
    this.pos = []; this.nor = []; this.col = []; this.uv = mitUv ? [] : null; this.weh = mitUv ? [] : null; this.idx = [];
  }
  Mesher.prototype.ecke = function (p, n, c, u, v, w) {
    this.pos.push(p[0], p[1], p[2]); this.nor.push(n[0], n[1], n[2]); this.col.push(c[0], c[1], c[2]);
    if (this.uv) { this.uv.push(u || 0, v || 0); this.weh.push(w || 0); }
    return this.pos.length / 3 - 1;
  };
  /** Viereck a-b-c-d (gegen den Uhrzeigersinn von außen gesehen); n = Normale. */
  Mesher.prototype.quad = function (a, b, c, d, n, farbe, uvs, weh) {
    const i = this.ecke(a, n, farbe, uvs && uvs[0], uvs && uvs[1], weh && weh[0]);
    this.ecke(b, n, farbe, uvs && uvs[2], uvs && uvs[3], weh && weh[1]);
    this.ecke(c, n, farbe, uvs && uvs[4], uvs && uvs[5], weh && weh[2]);
    this.ecke(d, n, farbe, uvs && uvs[6], uvs && uvs[7], weh && weh[3]);
    this.idx.push(i, i + 1, i + 2, i, i + 2, i + 3);
  };
  /** Quader aus 8 Ecken (0–3 unten, 4–7 oben, gleiche Reihenfolge); ohne = Bitmaske der ausgelassenen Flächen (1 unten, 2 oben). */
  Mesher.prototype.hexa = function (c, farbe, ohne) {
    const mx = (c[0][0] + c[1][0] + c[2][0] + c[3][0] + c[4][0] + c[5][0] + c[6][0] + c[7][0]) / 8;
    const my = (c[0][1] + c[1][1] + c[2][1] + c[3][1] + c[4][1] + c[5][1] + c[6][1] + c[7][1]) / 8;
    const mz = (c[0][2] + c[1][2] + c[2][2] + c[3][2] + c[4][2] + c[5][2] + c[6][2] + c[7][2]) / 8;
    const flaechen = [[0, 1, 2, 3, 1], [4, 5, 6, 7, 2], [0, 1, 5, 4, 0], [1, 2, 6, 5, 0], [2, 3, 7, 6, 0], [3, 0, 4, 7, 0]];
    for (const f of flaechen) {
      if (ohne && f[4] && (ohne & f[4])) continue;
      let a = c[f[0]], b = c[f[1]], cc = c[f[2]], d = c[f[3]];
      let ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = d[0] - a[0], vy = d[1] - a[1], vz = d[2] - a[2];
      let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
      const fx = (a[0] + cc[0]) / 2 - mx, fy = (a[1] + cc[1]) / 2 - my, fz = (a[2] + cc[2]) / 2 - mz;
      if (nx * fx + ny * fy + nz * fz < 0) { nx = -nx; ny = -ny; nz = -nz; [a, d] = [d, a]; [b, cc] = [cc, b]; }
      this.quad(a, b, cc, d, [nx, ny, nz], farbe);
    }
  };
  Mesher.prototype.geometrie = function () {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    if (this.uv) { geo.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2)); geo.setAttribute('aWehen', new THREE.Float32BufferAttribute(this.weh, 1)); }
    geo.setIndex(this.idx);
    geo.computeBoundingSphere();
    return geo;
  };

  function farbeVon(hex, faktor) {
    const c = new THREE.Color(hex), f = faktor === undefined ? 1 : faktor;
    return [Math.min(1, c.r * f), Math.min(1, c.g * f), Math.min(1, c.b * f)];
  }

  // ------------------------------------------------------------------ Textur-Atlas (Banner, Fahnen, Werbetafeln)
  const ATLAS = 1024, ATLAS_H = 2048;     // v28 W9: Atlas 1024×2048 (neue Banner y 768/896/1024, neue Fahnen y 1152/1280)
  /** Zellen: Banner (1024×128) bei y 0/128/256 je Thema, Fahnen (128×128) bei y 384, Werbetafeln (256×128) bei y 512. */
  function atlasBauen(text) {
    const cv = document.createElement('canvas'); cv.width = ATLAS; cv.height = ATLAS_H;
    const g = cv.getContext('2d');
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, ATLAS, ATLAS_H);
    const schrift = (t, x, y, w, h, farbe, rand, groesse) => {
      g.save(); g.textAlign = 'center'; g.textBaseline = 'middle';
      let px = groesse || h * 0.62; g.font = 'bold ' + px + 'px Arial, Helvetica, sans-serif';
      while (g.measureText(t).width > w * 0.94 && px > 8) { px -= 2; g.font = 'bold ' + px + 'px Arial, Helvetica, sans-serif'; }
      g.lineJoin = 'round'; g.lineWidth = Math.max(3, px * 0.14); g.strokeStyle = rand; g.strokeText(t, x + w / 2, y + h / 2 + px * 0.04);
      g.fillStyle = farbe; g.fillText(t, x + w / 2, y + h / 2 + px * 0.04);
      g.restore();
    };
    // --- Banner
    const banner = (y, c1, c2, schriftFarbe, rand, muster) => {
      const gr = g.createLinearGradient(0, y, ATLAS, y); gr.addColorStop(0, c1); gr.addColorStop(1, c2);
      g.fillStyle = gr; g.fillRect(0, y, ATLAS, 128);
      g.save(); g.beginPath(); g.rect(0, y, ATLAS, 128); g.clip();
      if (muster === 'zielflagge') {
        for (let i = 0; i < 16; i++) for (let j = 0; j < 4; j++) { g.fillStyle = (i + j) % 2 ? '#111' : '#fff'; g.fillRect(i * 32, y + j * 32, 32, 32); }
        g.fillStyle = c1; g.fillRect(100, y, ATLAS - 200, 128);
      } else if (muster === 'duenen') {
        g.fillStyle = 'rgba(255,255,255,0.18)';
        for (let i = 0; i < 6; i++) { g.beginPath(); g.arc(80 + i * 190, y + 150, 90, Math.PI, 0); g.fill(); }
      } else if (muster === 'baeume') {
        g.fillStyle = 'rgba(10,50,20,0.35)';
        for (let i = 0; i < 12; i++) { const bx = 40 + i * 88; g.beginPath(); g.moveTo(bx - 34, y + 150); g.lineTo(bx, y + 40); g.lineTo(bx + 34, y + 150); g.fill(); g.beginPath(); g.moveTo(bx - 26, y + 110); g.lineTo(bx, y + 14); g.lineTo(bx + 26, y + 110); g.fill(); }
      } else if (muster === 'palmen') {
        g.strokeStyle = 'rgba(40,90,30,0.5)'; g.lineWidth = 7;
        for (let i = 0; i < 8; i++) { const bx = 70 + i * 130; for (let a = 0; a < 5; a++) { const w = -2.6 + a * 0.55; g.beginPath(); g.moveTo(bx, y + 128); g.quadraticCurveTo(bx + Math.cos(w) * 30, y + 128 + Math.sin(w) * 60 - 20, bx + Math.cos(w) * 58, y + 128 + Math.sin(w) * 40 + 6); g.stroke(); } }
      } else if (muster === 'raute') {
        for (let i = -1; i < 17; i++) for (let j = 0; j < 3; j++) { g.fillStyle = (i + j) % 2 ? 'rgba(255,255,255,0.55)' : 'rgba(35,95,200,0.55)'; const cx = i * 64 + (j % 2) * 32, cy = y + j * 48 + 8; g.beginPath(); g.moveTo(cx, cy - 32); g.lineTo(cx + 32, cy); g.lineTo(cx, cy + 32); g.lineTo(cx - 32, cy); g.fill(); }
      } else if (muster === 'sterne') {
        const cols = ['#ffd93b', '#37d6c8', '#ff4fa3', '#ffffff'];
        for (let i = 0; i < 24; i++) { g.fillStyle = cols[i % 4]; const sx = 20 + i * 42, sy = y + (i % 2 ? 18 : 108); g.beginPath(); g.arc(sx, sy, 8, 0, 7); g.fill(); }
      }
      g.restore();
      g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(0, y, ATLAS, 6); g.fillRect(0, y + 122, ATLAS, 6);
      schrift(text, 40, y + 6, ATLAS - 80, 116, schriftFarbe, rand);
    };
    banner(0, '#c62828', '#1565c0', '#ffffff', '#101830', 'zielflagge');
    banner(128, '#e08a2c', '#a8431c', '#fff6dd', '#4a1d0c', 'duenen');
    banner(256, '#8a5cff', '#ff4fa3', '#fff36b', '#2b0f55', 'sterne');
    banner(768, '#2f7a3c', '#7a4a26', '#fff6dd', '#15301a', 'baeume');
    banner(896, '#b8a98a', '#6f8f3a', '#fff6dd', '#3d3320', 'palmen');
    banner(1024, '#1f5fb8', '#c8322a', '#ffffff', '#0f1f45', 'raute');
    // --- Fahnen (8 Zellen à 128×128)
    const fahne = (i, farben, art) => {
      const x = (i % 8) * 128, y = i < 8 ? 384 : 1152 + ((i - 8) >> 3) * 128;
      g.save(); g.beginPath(); g.rect(x, y, 128, 128); g.clip();
      g.fillStyle = farben[0]; g.fillRect(x, y, 128, 128);
      g.fillStyle = farben[1];
      if (art === 'diag') { g.beginPath(); g.moveTo(x, y + 128); g.lineTo(x + 128, y); g.lineTo(x + 128, y + 56); g.lineTo(x + 56, y + 128); g.fill(); g.beginPath(); g.moveTo(x, y + 72); g.lineTo(x + 72, y); g.lineTo(x, y); g.fill(); }
      else if (art === 'balken') { g.fillRect(x, y + 40, 128, 48); }
      else if (art === 'kreis') { g.beginPath(); g.arc(x + 64, y + 64, 40, 0, 7); g.fill(); g.fillStyle = farben[2] || farben[0]; g.beginPath(); g.arc(x + 64, y + 64, 20, 0, 7); g.fill(); }
      else if (art === 'karo') { for (let a = 0; a < 4; a++) for (let b = 0; b < 4; b++) if ((a + b) % 2) g.fillRect(x + a * 32, y + b * 32, 32, 32); }
      else if (art === 'kreuz') { g.fillRect(x + 48, y, 32, 128); g.fillRect(x, y + 48, 128, 32); }
      g.restore();
    };
    fahne(0, ['#d33b2f', '#ffffff'], 'diag'); fahne(1, ['#2f6fd0', '#f2c200'], 'balken'); fahne(2, ['#2f9e5a', '#ffffff'], 'kreis');
    fahne(3, ['#d98e3b', '#fff0cf'], 'diag'); fahne(4, ['#8c3b1e', '#f0c27a'], 'karo');
    fahne(5, ['#ff4fa3', '#37d6c8', '#ffd93b'], 'kreis'); fahne(6, ['#37d6c8', '#8a5cff'], 'diag'); fahne(7, ['#ffd93b', '#ff4fa3'], 'kreuz');
    fahne(8, ['#2f7a3c', '#e8dcc0', '#7a4a26'], 'kreis'); fahne(9, ['#7a4a26', '#e8dcc0'], 'diag'); fahne(10, ['#3f6b34', '#c98a3a'], 'balken');    // Wald
    fahne(11, ['#d96f2b', '#f2e6c0'], 'diag'); fahne(12, ['#6aa84f', '#e9e1cf'], 'karo');                                                           // Dino
    fahne(13, ['#2f6fd0', '#ffffff'], 'karo'); fahne(14, ['#c8322a', '#ffffff'], 'kreuz'); fahne(15, ['#ffffff', '#2f6fd0', '#c8322a'], 'kreis');   // Alpen
    // --- Werbetafeln (4 Zellen à 256×128)
    const tafel = (i, t, c1, c2, sc) => {
      const x = i * 256, y = 512;
      g.fillStyle = c1; g.fillRect(x, y, 256, 128);
      g.fillStyle = c2; g.fillRect(x, y, 256, 14); g.fillRect(x, y + 114, 256, 14);
      schrift(t, x + 8, y + 14, 240, 100, sc, 'rgba(0,0,0,0.55)');
    };
    tafel(0, 'TURBO!', '#ffd93b', '#d33b2f', '#d33b2f'); tafel(1, 'SPEED', '#1e88e5', '#ffffff', '#ffffff');
    tafel(2, 'JONAS', '#43a047', '#ffee58', '#ffffff'); tafel(3, 'GAS GEBEN!', '#e53935', '#ffffff', '#fff6dd');
    const tex = new THREE.CanvasTexture(cv);
    if (THREE.SRGBColorSpace !== undefined && 'colorSpace' in tex) tex.colorSpace = THREE.SRGBColorSpace;
    else if (THREE.sRGBEncoding !== undefined) tex.encoding = THREE.sRGBEncoding;
    tex.anisotropy = 4; tex.needsUpdate = true;
    const inset = 0.5 / ATLAS;
    const zelle = (x, y, w, h) => [x / ATLAS + inset, 1 - (y + h) / ATLAS_H + inset / 2, (x + w) / ATLAS - inset, 1 - y / ATLAS_H - inset / 2];   // u0, v0, u1, v1
    return {
      textur: tex,
      banner: (i) => i < 3 ? zelle(0, i * 128, ATLAS, 128) : zelle(0, 768 + (i - 3) * 128, ATLAS, 128),
      fahne: (i) => i < 8 ? zelle(i * 128, 384, 128, 128) : zelle((i - 8) * 128, 1152, 128, 128),
      tafel: (i) => zelle(i * 256, 512, 256, 128),
    };
  }

  // ------------------------------------------------------------------ Zuschauer-Figur (sitzend, Ursprung = Sitzfläche, blickt nach +z)
  function figurGeometrie() {
    const pos = [], nor = [], teil = [];
    const box = (x0, x1, y0, y1, z0, z1, t, tOben) => {
      const f = [[[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1]], [[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [0, 0, -1]],
        [[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [1, 0, 0]], [[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [-1, 0, 0]],
        [[x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], [0, 1, 0]]];
      f.splice(1, 1);                                   // Rückseite (−z) weglassen: von der Straße und von oben nie zu sehen (spart 20 % Dreiecke)
      f.forEach((q) => { for (const i of [0, 1, 2, 0, 2, 3]) { pos.push(q[i][0], q[i][1], q[i][2]); nor.push(q[4][0], q[4][1], q[4][2]); teil.push(q[4][1] === 1 && tOben !== undefined ? tOben : t); } });
    };
    box(-0.17, 0.17, 0.0, 0.17, 0.0, 0.46, 4);          // Oberschenkel (Hose)
    box(-0.17, 0.17, 0.0, 0.46, -0.14, 0.11, 0);        // Oberkörper (Hemd)
    box(-0.27, -0.18, 0.10, 0.44, -0.06, 0.07, 3);      // Arme (Hemd, im Jubel hoch)
    box(0.18, 0.27, 0.10, 0.44, -0.06, 0.07, 3);
    box(-0.12, 0.12, 0.46, 0.70, -0.11, 0.12, 1, 2);    // Kopf (Haut, Oberseite = Haare)
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    geo.setAttribute('aTeil', new THREE.Float32BufferAttribute(teil, 1));
    geo.computeBoundingSphere();
    return geo;
  }

  // ------------------------------------------------------------------ Shader-Anpassungen
  function zuschauerMaterial(uni) {
    const mat = new THREE.MeshLambertMaterial({ color: 0xffffff });
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uZeit = uni.uZeit; sh.uniforms.uJub = uni.uJub;
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float aTeil;\nuniform float uZeit;\nuniform vec4 uJub[' + MAX_ZONEN + '];')
        .replace('#include <begin_vertex>', [
          'vec3 transformed = vec3( position );',
          '{',
          '  vec3 ip = instanceMatrix[3].xyz;',
          '  float h1 = fract(sin(dot(ip.xz, vec2(12.9898, 78.233))) * 43758.5453);',
          '  float h2 = fract(h1 * 37.0 + 0.318);',
          '  float h3 = fract(h2 * 17.0 + 0.77);',
          '  vec3 hemd = vColor;',
          '  vec3 haut = mix(vec3(0.97, 0.78, 0.64), vec3(0.50, 0.32, 0.22), h2);',
          '  vec3 haar = mix(vec3(0.10, 0.07, 0.05), vec3(0.88, 0.72, 0.36), h3);',
          '  vec3 hose = mix(vec3(0.16, 0.20, 0.36), vec3(0.46, 0.38, 0.28), h3);',
          '  vec3 c = hemd;',
          '  if (aTeil > 0.5 && aTeil < 1.5) c = haut; else if (aTeil > 1.5 && aTeil < 2.5) c = haar; else if (aTeil > 3.5) c = hose;',
          '  vColor = c;',
          '  float j = 0.0;',
          '  for (int i = 0; i < ' + MAX_ZONEN + '; i++) { vec4 z = uJub[i]; vec2 d = ip.xz - z.xy; j = max(j, z.w * step(dot(d, d), z.z * z.z)); }',
          '  float ph = h1 * 6.2832;',
          '  transformed.y += 0.012 * sin(uZeit * (2.3 + h2) + ph);',
          '  transformed.y += j * 0.11 * abs(sin(uZeit * (5.5 + 2.0 * h3) + ph));',
          '  if (aTeil > 2.5 && aTeil < 3.5) transformed.y += j * (0.40 + 0.12 * sin(uZeit * (9.0 + 3.0 * h2) + ph));',
          '}',
        ].join('\n'));
    };
    mat.customProgramCacheKey = () => 'tribuene-zuschauer';
    return mat;
  }

  function bannerMaterial(textur, uni) {
    const mat = new THREE.MeshLambertMaterial({ map: textur, side: THREE.DoubleSide, emissive: new THREE.Color(0x303030), emissiveMap: textur });
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uZeit = uni.uZeit;
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float aWehen;\nuniform float uZeit;')
        .replace('#include <begin_vertex>', [
          '#include <begin_vertex>',
          'transformed += normal * (sin(uZeit * 3.4 + position.x * 0.9 + position.z * 0.9 + position.y * 0.5) * 0.20 + sin(uZeit * 5.7 + position.x * 1.7) * 0.06) * aWehen;',
        ].join('\n'));
    };
    mat.customProgramCacheKey = () => 'tribuene-banner';
    return mat;
  }

  // ------------------------------------------------------------------ Grafik: bauen
  function bauen(st) {
    const C = cfg();
    const liste = st.tribuenen;
    if (!liste || !liste.length || typeof THREE === 'undefined') return null;
    const gruppe = new THREE.Group(); gruppe.name = 'Tribuenen';
    const atlas = atlasBauen(String(C.text || 'JONAS HOT STEERING WHEEL'));
    const uni = { uZeit: { value: 0 }, uJub: { value: [] } };
    for (let i = 0; i < MAX_ZONEN; i++) uni.uJub.value.push(new THREE.Vector4(0, 0, 0, 0));
    const M = new Mesher(false), B = new Mesher(true);
    const figur = [];            // Zuschauer-Instanzen { x, y, z, yaw, s, farbe }

    liste.forEach((t) => {
      const th = THEMEN[t.thema] || THEMEN.wiese, rnd = mulberry32(t.seed);
      const hl = t.laenge / 2, n = t.reihen, rt = t.reiheTiefe, rh = t.reiheHoehe, vorne = num(C.vorne, 1.6);
      const rowV0 = (r) => vorne + r * rt, rowTop = (r) => 0.35 + (r + 1) * rh;
      const D = t.tiefe, yB = t.yBasis, yRel0 = t.yMin - t.yBasis - 0.8;
      // lokal (u, y, v) → Welt
      const W = (u, y, v) => [t.x + t.tx * u + t.ox * v, yB + y, t.z + t.tz * u + t.oz * v];
      const box = (u0, u1, y0, y1, v0, v1, farbe, ohne, fak) => {
        const f = farbeVon(farbe, fak === undefined ? 1 + (rnd() - 0.5) * 0.06 : fak);
        M.hexa([W(u0, y0, v0), W(u1, y0, v0), W(u1, y0, v1), W(u0, y0, v1), W(u0, y1, v0), W(u1, y1, v0), W(u1, y1, v1), W(u0, y1, v1)], f, ohne);
      };
      // Fundament (reicht bis unter das tiefste Gelände) + Vorplatz
      box(-hl - 0.5, hl + 0.5, yRel0, 0.2, -0.4, D + 0.4, th.betonDunkel, 1, 1);
      // Terrassen (massiv) und Sitzblöcke
      for (let r = 0; r < n; r++) {
        box(-hl, hl, 0.2, rowTop(r), rowV0(r), rowV0(r) + rt, th.beton, 1, 1 - (r % 2) * 0.05);
        const bl = 3.4, nb = Math.max(2, Math.round(t.laenge / bl)), w = t.laenge / nb;
        for (let b = 0; b < nb; b++) {
          const fc = th.sitze[(r + b * 2 + t.nr) % th.sitze.length];
          box(-hl + b * w + 0.06, -hl + (b + 1) * w - 0.06, rowTop(r), rowTop(r) + 0.07, rowV0(r) + 0.12, rowV0(r) + rt - 0.2, fc, 1, 0.62);
        }
        // Geländerpfosten an beiden Seiten
        for (const sg of [-1, 1]) box(sg * (hl + 0.05) - 0.05, sg * (hl + 0.05) + 0.05, rowTop(r), rowTop(r) + 0.85, rowV0(r) + 0.15, rowV0(r) + rt - 0.05, th.stahl, 1, 1);
      }
      // Rückgang + Rückwand
      box(-hl, hl, 0.2, rowTop(n - 1), rowV0(n), D - 0.35, th.beton, 1, 0.92);
      box(-hl, hl, 0.2, rowTop(n - 1) + 1.15, D - 0.35, D, th.betonDunkel, 1, 1);
      // Rückseite: Pilaster alle ~4 m und ein Farbband in der Dachfarbe (sonst eine kahle Wand)
      const nPil = Math.max(3, Math.round(t.laenge / 4));
      for (let k = 0; k <= nPil; k++) { const u = -hl + t.laenge * k / nPil; box(u - 0.22, u + 0.22, 0.2, rowTop(n - 1) + 1.4, D, D + 0.28, th.stahl, 1, 1); }
      box(-hl, hl, rowTop(n - 1) * 0.45, rowTop(n - 1) * 0.45 + 0.7, D, D + 0.1, th.dach[t.nr % th.dach.length], 1, 1);
      // Werbebande vorn (Brüstung) mit Oberkante
      const nbd = Math.max(3, Math.round(t.laenge / 3)), wb = t.laenge / nbd;
      for (let b = 0; b < nbd; b++) box(-hl + b * wb, -hl + (b + 1) * wb, 0.2, 1.1, 0.1, 0.34, th.bande[(b + t.nr) % th.bande.length], 1, 1);
      box(-hl, hl, 1.1, 1.18, 0.06, 0.38, th.stahl, 1, 1);
      if (th.holz) {                                                   // v28 W9: Holz – Rundholz-Pfosten vor der Bande, Querbalken an der Rückwand
        const np = Math.max(3, Math.round(t.laenge / 3.6));
        for (let k = 0; k <= np; k++) { const u = -hl + t.laenge * k / np; box(u - 0.13, u + 0.13, yRel0, 1.35, 0.02, 0.28, 0x6b4a2c, 1, 1); }
        for (let r = 0; r < n; r += 2) box(-hl, hl, rowTop(r) - 0.02, rowTop(r) + 0.02, rowV0(r) + rt - 0.03, rowV0(r) + rt + 0.01, 0x3d2a18, 1, 1);
      }
      // Dach (teilweise): schräge Platte über den hinteren Reihen
      const rf = Math.min(n - 2, Math.max(1, Math.floor(n * 0.3)));
      const ru = Math.min(hl + 0.6, hl * t.dach + 0.6);
      const uc = ru >= hl ? 0 : (t.nr % 2 ? -1 : 1) * (hl - ru);          // teilweise: Dach sitzt an einem Ende, nicht mittig
      const vF = rowV0(rf) - 0.2, vB = D + 0.9;
      const Hf = rowTop(rf) + 2.9, Hb = Hf + 1.1;
      const dFarbe = th.dach[t.nr % th.dach.length];
      const dd = 0.24;
      M.hexa([W(uc - ru, Hf, vF), W(uc + ru, Hf, vF), W(uc + ru, Hb, vB), W(uc - ru, Hb, vB),
        W(uc - ru, Hf + dd, vF), W(uc + ru, Hf + dd, vF), W(uc + ru, Hb + dd, vB), W(uc - ru, Hb + dd, vB)], farbeVon(dFarbe), 0);
      // Blende vorn (helle Kante) und Träger
      M.hexa([W(uc - ru, Hf - 0.45, vF - 0.06), W(uc + ru, Hf - 0.45, vF - 0.06), W(uc + ru, Hf - 0.45, vF + 0.14), W(uc - ru, Hf - 0.45, vF + 0.14),
        W(uc - ru, Hf + dd + 0.1, vF - 0.06), W(uc + ru, Hf + dd + 0.1, vF - 0.06), W(uc + ru, Hf + dd + 0.1, vF + 0.14), W(uc - ru, Hf + dd + 0.1, vF + 0.14)], farbeVon(th.blende), 0);
      const nSt = Math.max(2, Math.round(ru * 2 / 7) + 1);
      for (let i = 0; i < nSt; i++) {
        const u = uc - ru + 0.5 + (2 * ru - 1) * i / (nSt - 1);
        box(u - 0.14, u + 0.14, 0.2, Hb - 0.05, D - 0.75, D - 0.47, th.stahl, 1, 1);                 // hintere Stütze
        box(u - 0.11, u + 0.11, rowTop(rf - 1), Hf - 0.02, vF + 0.02, vF + 0.22, th.stahl, 1, 1);     // vordere Stütze
        // Querträger unter dem Dach (Fachwerk-Andeutung): Strebe von vorn unten nach hinten oben
        M.hexa([W(u - 0.05, Hf - 0.25, vF + 0.2), W(u + 0.05, Hf - 0.25, vF + 0.2), W(u + 0.05, Hb - 0.25, D - 0.6), W(u - 0.05, Hb - 0.25, D - 0.6),
          W(u - 0.05, Hf - 0.05, vF + 0.2), W(u + 0.05, Hf - 0.05, vF + 0.2), W(u + 0.05, Hb - 0.05, D - 0.6), W(u - 0.05, Hb - 0.05, D - 0.6)], farbeVon(th.stahl), 0);
      }
      // Betrachter an der Straße blickt nach +o; sein „rechts“ ist (−oz, 0, ox). Wächst u nach rechts (t·rechts > 0), liegt das größere u rechts.
      const tRechts = t.tx * (-t.oz) + t.tz * t.ox > 0;
      /** Senkrechte Fläche zwischen uA und uB (lokal), zur Straße gedreht und lesbar; wA/wB = Weh-Gewicht (Fahnentuch weht) an den Enden. */
      const lesbar = (uA, uB, y0, y1, v, cell, wA, wB) => {
        const aLinks = tRechts ? uA < uB : uA > uB;
        const lo = aLinks ? uA : uB, hi = aLinks ? uB : uA, wLo = aLinks ? wA : wB, wHi = aLinks ? wB : wA;
        B.quad(W(lo, y0, v), W(hi, y0, v), W(hi, y1, v), W(lo, y1, v), [-t.ox, 0, -t.oz], [1, 1, 1],
          [cell[0], cell[1], cell[2], cell[1], cell[2], cell[3], cell[0], cell[3]], [wLo, wHi, wHi, wLo]);
      };
      // Fahnenmasten außen neben der Tribüne
      const mastH = Hb + 3.2;
      const masten = [{ u: -(hl + 0.35), v: vorne + 0.2 }, { u: hl + 0.35, v: vorne + 0.2 }];
      if (t.laenge > 29 || t.thema === 'fantasie') masten.push({ u: -(hl + 0.35), v: D - 0.3 }, { u: hl + 0.35, v: D - 0.3 });
      masten.forEach((m, mi) => {
        box(m.u - 0.07, m.u + 0.07, 0.2, mastH, m.v - 0.07, m.v + 0.07, th.palmen ? 0x7a5a36 : th.holz ? 0x6b4a2c : 0xd8d8d8, 1, 1);
        if (th.palmen && (masten.length > 2 ? mi < 2 : mi === 0)) {           // v28 W9: Dino – Mast als Palme: dicker Stamm + 8 Wedel
          box(m.u - 0.2, m.u + 0.2, 0.2, 1.2, m.v - 0.2, m.v + 0.2, 0x7a5a36, 1, 0.85);
          box(m.u - 0.12, m.u + 0.12, 1.2, mastH + 0.2, m.v - 0.12, m.v + 0.12, 0x8a6a40, 1, 1);
          const hoch = mastH + 0.2;
          for (let a = 0; a < 8; a++) {
            const w = a * 0.7854 + (mi % 2) * 0.3, du = Math.cos(w), dv = Math.sin(w), pu = -dv, pv = du, L = 3.3, sink = 1.5;
            const P = (k, wid, dy) => W(m.u + du * L * k + pu * wid, hoch + dy, m.v + dv * L * k + pv * wid);
            const gr = a % 2 ? 0x2f8a3c : 0x4fa83c;
            M.hexa([P(0, -0.2, 0), P(0, 0.2, 0), P(1, 0.55, -sink), P(1, -0.55, -sink), P(0, -0.2, 0.1), P(0, 0.2, 0.1), P(1, 0.55, -sink + 0.1), P(1, -0.55, -sink + 0.1)], farbeVon(gr), 0);
          }
        }
        if (th.palmen && (masten.length > 2 ? mi < 2 : mi === 0)) return;     // Palme statt Fahne
        if (C.fahnen === false) return;
        const cell = atlas.fahne(th.fahnen[(mi + t.nr) % th.fahnen.length]);
        const fw = 2.2, fh = 1.35, innen = m.u < 0 ? 1 : -1;       // Fahne weht zur Tribünenmitte hin
        lesbar(m.u, m.u + innen * fw, mastH - 0.15 - fh, mastH - 0.15, m.v, cell, 0, 1);
      });
      // Banner unter der Dachkante („Jonas Hot Steering Wheel“) und Werbetafeln an der Brüstung (zeigen zur Straße)
      const bw = Math.min(2 * ru - 1, 16);
      lesbar(uc - bw / 2, uc + bw / 2, Hf - 1.55, Hf - 0.45, vF - 0.1, atlas.banner(th.banner), 0.4, 0.4);
      const nT = Math.max(2, Math.floor(t.laenge / 3.2)), wT = t.laenge / nT;
      for (let b = 0; b < nT; b++) lesbar(-hl + b * wT + 0.1, -hl + (b + 1) * wT - 0.1, 0.32, 1.02, 0.07, atlas.tafel((b + t.nr) % 4), 0, 0);

      // Zuschauer
      const dichte = num(C.zuschauer && C.zuschauer.dichte, 0.85);
      if (!C.zuschauer || C.zuschauer.an !== false) {
        const bs = 0.58, ns = Math.floor((t.laenge - 0.8) / bs);
        for (let r = 0; r < n; r++) {
          const fuell = dichte * (1 - 0.1 * (r / n)) * (t.typ === 'start' ? 1 : 0.95);
          for (let k = 0; k < ns; k++) {
            if (rnd() > fuell) continue;
            const u = -hl + 0.4 + (k + 0.5) * bs + (rnd() - 0.5) * 0.06;
            const v = rowV0(r) + rt - 0.38 + (rnd() - 0.5) * 0.06;
            const w = W(u, rowTop(r) + 0.07, v);
            figur.push({ x: w[0], y: w[1], z: w[2], yaw: Math.atan2(-t.ox, -t.oz), s: 1.08 + rnd() * 0.22, f: FARBEN_ZUSCHAUER[Math.floor(rnd() * FARBEN_ZUSCHAUER.length)] });
          }
        }
      }
    });

    // --- Gerüst-Mesh
    const matM = new THREE.MeshLambertMaterial({ vertexColors: true });
    const meshM = new THREE.Mesh(M.geometrie(), matM); meshM.name = 'Tribuenen-Geruest'; meshM.frustumCulled = true;
    gruppe.add(meshM);
    // --- Banner/Fahnen
    const meshB = new THREE.Mesh(B.geometrie(), bannerMaterial(atlas.textur, uni)); meshB.name = 'Tribuenen-Banner'; meshB.frustumCulled = true;
    // Vertex-Farbe der Banner ist weiß (kein vertexColors) – Attribut bleibt ungenutzt
    gruppe.add(meshB);
    // --- Zuschauer (InstancedMesh, ein Draw-Call)
    let meshZ = null;
    if (figur.length) {
      meshZ = new THREE.InstancedMesh(figurGeometrie(), zuschauerMaterial(uni), figur.length);
      meshZ.name = 'Tribuenen-Zuschauer';
      const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), pos = new THREE.Vector3(), sc = new THREE.Vector3(), ey = new THREE.Vector3(0, 1, 0), col = new THREE.Color();
      figur.forEach((f, i) => {
        q.setFromAxisAngle(ey, f.yaw); pos.set(f.x, f.y, f.z); sc.set(f.s, f.s, f.s);
        m4.compose(pos, q, sc); meshZ.setMatrixAt(i, m4);
        col.setHex(f.f); meshZ.setColorAt(i, col);
      });
      meshZ.instanceMatrix.needsUpdate = true; if (meshZ.instanceColor) meshZ.instanceColor.needsUpdate = true;
      meshZ.frustumCulled = false;
      gruppe.add(meshZ);
    }
    gruppe.traverse((o) => { o.updateMatrix(); o.matrixAutoUpdate = false; });
    gruppe.updateMatrixWorld(true);
    // Zustand für animieren()/jubeln()
    const jub = liste.map(() => 0);
    st._tribGfx = { uni, jub, zeit: 0 };
    gruppe.userData.zuschauer = figur.length;
    gruppe.userData.dreiecke = (M.idx.length + B.idx.length) / 3 + (meshZ ? figur.length * meshZ.geometry.attributes.position.count / 3 : 0);
    return gruppe;
  }

  /** Jeden Frame: Zeit-Uniform und Jubel-Zonen (klingen exponentiell ab). */
  function animieren(st, zeit, dt) {
    const g = st && st._tribGfx; if (!g || !st.tribuenen) return;
    g.uni.uZeit.value = zeit;
    const ab = Math.exp(-(dt || 0) / num(cfg().jubelAbklingen, 1.6));
    const li = st.tribuenen;
    for (let i = 0; i < MAX_ZONEN; i++) {
      const v = g.uni.uJub.value[i];
      if (i < li.length) {
        g.jub[i] *= ab; if (g.jub[i] < 0.01) g.jub[i] = 0;
        const t = li[i];
        v.set(t.x + t.ox * t.tiefe * 0.5, t.z + t.oz * t.tiefe * 0.5, t.laenge * 0.5 + t.tiefe, g.jub[i]);
      } else v.set(0, 0, 0, 0);
    }
  }

  /** Zuschauer der Tribüne nr jubeln lassen (0…1, nimmt nie ab, nur zu). */
  function jubeln(st, nr, staerke) {
    const g = st && st._tribGfx; if (!g || nr < 0 || nr >= g.jub.length) return;
    g.jub[nr] = Math.max(g.jub[nr], Math.max(0, Math.min(1, staerke === undefined ? 1 : staerke)));
  }

  R.Tribuenen = { berechnen, einbauen, bauen, animieren, jubeln, sperre, platz, gesperrt, bereicheVon, saeulenVon, MAX_ZONEN, THEMEN };
})();
