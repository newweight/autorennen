// ============================================================
// 14.10. (v20) Kurvenschilder: deutsche Verkehrszeichen vor jeder nennenswerten Kurve.
//   „Straßenschilder überall, wo angezeigt wird, wie schnell die Kurve zu fahren ist“ (Wunsch des Vaters).
//
//   R.Kurvenschilder.berechnen(strecke, tempoKlasse) → [Schild]   (reine Logik, läuft auch in Node; deterministisch, kein Zufall)
//   R.Kurvenschilder.bauen(strecke, tempoKlasse)     → THREE.Mesh | null   (EIN Mesh, EINE Canvas-Textur-Atlas = +1 Draw-Call)
//   strecke.kurvenschilder = die Liste der letzten Berechnung (trackBuilder.bauen() ruft bauen() auf, wenn das Modul geladen ist).
//
//   Schild = {
//     nr, art: 'kurve' | 'doppel', zeichen: '103-10' | '103-20' | '105-10' | '105-20' (Z 103 Kurve / Z 105 Doppelkurve, -10 links, -20 rechts),
//     richtung: 'links' | 'rechts' (erste Kurve), s (Bogenlänge des Mastes), q (Seitenabstand, + = rechts), x, z, y,
//     kmh (empfohlenes Tempo, auf 10 gerundet), apexS (engste Stelle), kurveS0 / kurveS1 (Beginn/Ende der Kurve bzw. Kurvengruppe),
//     abstand (m vom Schild bis Kurvenbeginn), haarnadel (bool), leitpfeile: [{ s, q, x, z, y, richtung }] (Z 625, Kurvenaußenseite)
//   }
//   Kurve = zusammenhängender Bereich mit |Krümmung| > 1/radiusMax in gleicher Richtung (Krümmung > 0 = Rechtskurve). Nennenswert: Winkel ≥ minWinkel
//   und Tempo (strecke.tempoBei) < nennenswertAnteil × Höchsttempo der Tempo-Klasse. Schilder stehen nie in Brücken/Tunneln/Überführungen/
//   Kreuzungen/Gabelungen/Loopings/Schanzen/Boost-Zonen (± config.kurvenschilder.sperre m), nicht im Startbereich, nicht in einer anderen Kurve.
//   Konfiguration: config.kurvenschilder (an: false schaltet alles ab).
// ============================================================
(function () {
  const R = window.Rennspiel;

  const cfg = () => R.config.kurvenschilder || {};
  const rund10 = (kmh) => Math.round(kmh / 10) * 10;

  /** Höchsttempo (km/h, auf 10 abgerundet) der Tempo-Klasse. */
  function klassenTop(klasse) {
    const C = cfg(), K = (R.config.tempoKlassen || {})[klasse] || (R.config.tempoKlassen || {})[R.config.tempoKlasseStandard] || { vMax: 1 };
    return Math.floor((C.refKmh || 260) * K.vMax / 10) * 10;
  }

  /** Ist an Bogenlänge s (± Sperrabstand) ein Schild-Mast erlaubt? (vorhandene Helfer der Strecke) */
  function frei(st, s, z) {
    if (st.tunnelBei(s, z) || st.brueckeBei(s, z) || st.ueberfuehrungNah(s, z) || st.kreuzungNah(s, z)) return false;
    if (st.gabelungen && st.gabelungen.length && st.gabelNah(s, z)) return false;
    if (st.loopings.length && st.loopingBei(s, z + 20)) return false;
    const sp = st.spline;
    // d = s − e.s (gewickelt): gesperrt von (Anlauf + z) vor bis (Länge + z) hinter dem Anfang
    for (const e of st.schanzen || []) { const d = sp.differenzS(s, e.s); if (d > -(z + (e.anlauf || 0) + 40) && d < (e.laenge || 10) + z) return false; }
    for (const e of st.boostFelder || []) { const d = sp.differenzS(s, e.s); if (d > -z && d < (e.laenge || 12) + z) return false; }
    return true;
  }

  /** Kurven (Bereiche gleicher Richtung) der Strecke mit Beginn, Ende, Winkel, engster Stelle. */
  function kurvenSuchen(st) {
    const C = cfg(), sp = st.spline, pk = sp.punkte, N = pk.length, ds = sp.ds, kMin = 1 / (C.radiusMax || 200);
    const reg = [];
    let cur = null, luecke = 0;
    const schliessen = () => { if (cur) { cur.i1 = cur.letzter; reg.push(cur); cur = null; } };
    for (let i = 0; i < N; i++) {
      const k = pk[i].kruemmung, vorz = k > 0 ? 1 : -1;
      if (Math.abs(k) > kMin) {
        if (cur && cur.dir !== vorz) schliessen();
        if (!cur) cur = { dir: vorz, i0: i, letzter: i, kmax: 0 };
        cur.letzter = i; luecke = 0;
        if (Math.abs(k) > cur.kmax) cur.kmax = Math.abs(k);
      } else if (cur) {
        if (++luecke > 3) schliessen();
      }
    }
    schliessen();
    return reg.map((r) => {
      let winkel = 0, ia = r.i0;
      for (let i = r.i0; i <= r.i1; i++) winkel += Math.abs(pk[i].kruemmung) * ds;
      // Kurvenbeginn: erster Punkt mit ≥ 35 % der stärksten Krümmung (Übergang aus der Geraden gehört noch nicht zur Kurve)
      for (let i = r.i0; i <= r.i1; i++) if (Math.abs(pk[i].kruemmung) >= 0.35 * r.kmax) { ia = i; break; }
      let ie = r.i1;
      for (let i = r.i1; i >= r.i0; i--) if (Math.abs(pk[i].kruemmung) >= 0.35 * r.kmax) { ie = i; break; }
      // engste Stelle = kleinstes Ideallinien-Tempo im Bereich (strecke.tempoBei)
      let apexS = pk[ia].s, vMin = Infinity;
      for (let s = pk[ia].s; s <= pk[ie].s + 1e-6; s += ds) { const v = st.tempoBei(s); if (v < vMin) { vMin = v; apexS = s; } }
      return { dir: r.dir, s0: pk[ia].s, s1: pk[ie].s, winkel: winkel * 180 / Math.PI, apexS, vMin };
    });
  }

  /** Schilder einer Strecke. tempoKlasse: 'normal' | 'schnell' (Standard: config.tempoKlasseStandard). */
  function berechnen(st, tempoKlasse) {
    const C = cfg(), sp = st.spline, L = sp.laenge;
    if (C.an === false) return [];
    const klasse = tempoKlasse || st.tempoKlasse || R.config.tempoKlasseStandard || 'normal';
    const top = klassenTop(klasse), schwelle = (C.nennenswertAnteil || 0.75) * top;
    const kurven = kurvenSuchen(st).filter((k) => k.winkel >= (C.minWinkel || 25) && k.vMin * 3.6 < schwelle);
    // Gruppen: Kurven, die näher als gruppeAbstand aufeinander folgen, bekommen ein gemeinsames Schild
    const gruppen = [];
    kurven.forEach((k) => {
      const g = gruppen[gruppen.length - 1];
      if (g && k.s0 - g.s1 < (C.gruppeAbstand || 75) && k.s1 - g.s0 <= (C.gruppeMax || 280)) { g.kurven.push(k); g.s1 = Math.max(g.s1, k.s1); }
      else gruppen.push({ s0: k.s0, s1: k.s1, kurven: [k], kette: !!g && k.s0 - g.s1 < (C.gruppeAbstand || 75) });   // kette: Anschluss ohne freie Gerade davor
    });
    const liste = [], masten = [], ausgelassen = [];   // masten: s aller gesetzten Masten (Mindestabstand)
    const nahAnMast = (s, abst) => masten.some((m) => Math.abs(sp.differenzS(m, s)) < abst);
    const startOk = (s) => s < L - (C.startFreiVor || 70) && s > (C.startFreiNach || 30);
    const mastOrt = (s, seite) => {
      // Lage: 'rand' (Standard) = knapp neben dem Randstreifen (gut lesbar, ohne Kollision; nie weiter weg als die Bande);
      //       'bande' = außerhalb der Bande (weit weg: nur mit sehr großen Schildern lesbar)
      const p = sp.punktBei(s), g = st.grenzeBei(s);
      const halb = st.breiteBei(s) / 2 + st.randBreite;
      let qa = C.lage === 'bande' ? g + (C.abstandBande || 1.2) : Math.min(halb + (C.abstandRand || 3), g - 1);
      if (qa < halb + 0.8) qa = g + (C.abstandBande || 1.2);   // Bande liegt direkt an der Fahrbahn (enge Stelle, Leitplanke): Schild dahinter
      const q = seite * qa;
      const x = p.x + p.nx * q, z = p.z + p.nz * q;
      return { s, q, x, z, y: st.hoeheAn(x, z), px: p.x, pz: p.z, py: p.y };
    };
    gruppen.forEach((g, nr) => {
      let ort = null, abst = 0;
      // Findet sich für die Gruppe kein Platz (z. B. Gabelung unmittelbar davor), wird die erste Kurve nicht angekündigt und das Schild gilt
      // der nächsten (eine Haarnadel dahinter bekommt so trotzdem ihr Schild)
      while (!ort && g.kurven.length) {
        g.s0 = g.kurven[0].s0;
        const vAn = Math.min(top / 3.6, Math.max(st.tempoBei(g.s0 - 120), 12));
        const basis = Math.min(C.abstandMax || 120, Math.max(C.abstandMin || 60, (C.abstandSek || 2.4) * vAn));
        const vorherEnde = nr > 0 ? gruppen[nr - 1].s1 : -Infinity;
        // Kette (zu lange Kurvenfolge, in Stücke geteilt): kein freies Stück davor → Schild darf näher (ab abstandKette) und in der Vorgängerkurve stehen
        const maxD = g.kette ? (C.abstandMax || 120) : Math.min(C.abstandMax || 120, g.s0 - vorherEnde - 10);
        const minD = g.kette ? (C.abstandKette || 30) : (C.abstandMin || 60), schritt = C.abstandSuche || 5;
        // Durchgang 1: Wunschbereich mit voller Sperre; Durchgang 2 (Notlösung): näher an der Kurve (ab abstandNot) und mit kleinerer Sperre
        const durchgaenge = [[minD, C.sperre || 30], [Math.min(minD, C.abstandNot || 30), C.sperreNot || 12]];
        for (const [dMin, sperre] of durchgaenge) {
          if (ort) break;
          const kand = [];
          for (let d = dMin; d <= maxD + 1e-9; d += schritt) kand.push(d);
          kand.sort((x, y) => Math.abs(x - basis) - Math.abs(y - basis) || x - y);
          for (const d of kand) {
            const s = sp.wrapS(g.s0 - d);
            if (!startOk(s) || !frei(st, s, sperre) || nahAnMast(s, C.mindestAbstandSchilder || 40)) continue;
            const o = mastOrt(s, 1);
            if (!o || st.dekoSperre(o.x, o.z)) continue;
            ort = o; abst = d; break;
          }
        }
        if (!ort) { ausgelassen.push(g.kurven.shift().s0); g.kette = true; }
      }
      if (!ort) return;
      masten.push(ort.s);
      const erste = g.kurven[0], gemischt = g.kurven.some((k) => k.dir !== erste.dir);
      const apex = g.kurven.reduce((b, k) => (k.vMin < b.vMin ? k : b), g.kurven[0]);
      const kmh = Math.max(20, Math.min(top, rund10(st.tempoBei(apex.apexS) * 3.6)));
      const richtung = erste.dir > 0 ? 'rechts' : 'links';
      const schild = {
        nr: liste.length, art: gemischt ? 'doppel' : 'kurve', zeichen: (gemischt ? '105-' : '103-') + (erste.dir > 0 ? '20' : '10'), richtung,
        s: ort.s, q: ort.q, x: ort.x, z: ort.z, y: ort.y, kmh, apexS: apex.apexS, kurveS0: g.s0, kurveS1: g.s1, abstand: abst,
        haarnadel: false, leitpfeile: [],
      };
      // Haarnadel / Spitzkehre: Leitpfeil-Tafeln (Z 625) an der Kurvenaußenseite
      const hn = g.kurven.filter((k) => k.winkel >= (C.haarnadelWinkel || 130) && k.vMin * 3.6 <= (C.haarnadelKmh || 80));
      hn.forEach((k) => {
        schild.haarnadel = true;
        const aussen = k.dir > 0 ? -1 : 1, richtungK = k.dir > 0 ? 'rechts' : 'links', da = C.leitpfeilAbstand || 24;
        // Wunschplätze: Scheitel und je ±da; ist einer gesperrt, wird um 12 m verschoben (bis ±3·da), höchstens 3 Tafeln je Haarnadel
        let gesetzt = 0;
        [0, -1, 1, -0.5, 0.5, -1.5, 1.5, -2, 2, -3, 3].forEach((f) => {
          if (gesetzt >= 3) return;
          const s = sp.wrapS(k.apexS + f * da);
          if (s < k.s0 - 20 || s > k.s1 + 20) return;   // nur an der Kurve selbst
          if (!startOk(s) || !frei(st, s, C.sperreNot || 12) || nahAnMast(s, 12)) return;
          if (gesetzt && schild.leitpfeile.some((l) => Math.abs(sp.differenzS(l.s, s)) < da * 0.6)) return;
          const o = mastOrt(s, aussen);
          if (!o || st.dekoSperre(o.x, o.z)) return;
          masten.push(s); gesetzt++;
          schild.leitpfeile.push({ s: o.s, q: o.q, x: o.x, z: o.z, y: o.y, richtung: richtungK });
        });
      });
      liste.push(schild);
    });
    st.kurvenschilderAusgelassen = ausgelassen;
    return liste;
  }

  /** Blickrichtung eines Schildes: zur Fahrbahnmitte ca. 70 m vor dem Mast (Einheitsvektor x, z). */
  function blickRichtung(st, s, x, z) {
    const p = st.spline.punktBei(s - 70);
    let fx = p.x - x, fz = p.z - z; const l = Math.hypot(fx, fz) || 1;
    return [fx / l, fz / l];
  }

  /**
   * 14.10. (v21) Schilder berechnen UND ihre Masten als feste Säulen { x, z, r, art: 'schildmast' } in strecke.saeulen eintragen
   * (nur der dünne Mast, Radius config.kurvenschilder.mastRadius ≈ 0,12 m – nicht das Schild). Läuft auch im Server (Physik identisch).
   * Idempotent: ein zweiter Aufruf ersetzt Liste und Säulen. bauen() nutzt die Liste weiter, wenn sie zur Tempo-Klasse passt.
   */
  function einbauen(st, tempoKlasse) {
    const C = cfg(), klasse = tempoKlasse || st.tempoKlasse || R.config.tempoKlasseStandard || 'normal';
    if (st._schildSaeulen) st.saeulen = (st.saeulen || []).filter((q) => st._schildSaeulen.indexOf(q) < 0);
    st._schildSaeulen = null;
    const liste = berechnen(st, klasse);
    st.kurvenschilder = liste; st._schildKlasse = klasse;
    const m = C.massstab || 2, r = C.mastRadius !== undefined ? C.mastRadius : 0.12, sa = [];
    if (C.mastKollision !== false && r > 0) {
      const mast = (s, x, z) => { const f = blickRichtung(st, s, x, z); sa.push({ x: x - f[0] * 0.06 * m, z: z - f[1] * 0.06 * m, r, art: 'schildmast' }); };
      liste.forEach((sc) => { mast(sc.s, sc.x, sc.z); sc.leitpfeile.forEach((l) => mast(l.s, l.x, l.z)); });
    }
    st._schildSaeulen = sa;
    if (sa.length) st.saeulen = (st.saeulen || []).concat(sa);
    return liste;
  }

  // ------------------------------------------------------------------ Grafik

  const ZELLE = 128;
  const GRAU = '#8d9298', GRAU_DUNKEL = '#6f747a';

  /** Zeichen 103/105: weißes Dreieck, roter Rand, schwarzer Pfeil. art 'kurve' | 'doppel', richtung der ersten Kurve. */
  function zeichneDreieck(g, art, richtung) {
    const dreieck = (inset, farbe) => {
      const cx = 64, ap = 6 + inset * 1.9, bo = 114 - inset * 1.0, hw = 59 - inset * 1.73;
      g.fillStyle = farbe; g.beginPath();
      const r = 7;
      g.moveTo(cx, ap); g.lineTo(cx + hw, bo); g.lineTo(cx - hw, bo); g.closePath();
      g.lineJoin = 'round'; g.lineWidth = r; g.strokeStyle = farbe; g.fill(); g.stroke();
    };
    dreieck(0, '#d0141a');
    dreieck(13, '#ffffff');
    g.save();
    if (richtung === 'links') { g.translate(128, 0); g.scale(-1, 1); }
    g.strokeStyle = '#111'; g.fillStyle = '#111'; g.lineWidth = 13; g.lineCap = 'butt'; g.lineJoin = 'miter';
    g.beginPath();
    if (art === 'doppel') {
      // Z 105: Pfeil mit zwei Bögen – erst in Richtung der ersten Kurve (hier: rechts), dann zurück nach links; Spitze oben
      g.moveTo(44, 104); g.lineTo(44, 92); g.bezierCurveTo(44, 74, 76, 80, 76, 62);
      g.bezierCurveTo(76, 52, 66, 50, 66, 42);
      g.stroke();
      g.beginPath(); g.moveTo(66, 24); g.lineTo(53, 46); g.lineTo(79, 46); g.closePath(); g.fill();
    } else {
      // Pfeil: gerade hoch, dann Bogen nach rechts oben
      g.moveTo(48, 102); g.lineTo(48, 74); g.bezierCurveTo(48, 58, 56, 50, 74, 44);
      g.stroke();
      g.beginPath(); g.moveTo(88, 38); g.lineTo(70, 29); g.lineTo(70, 59); g.closePath(); g.fill();
    }
    g.restore();
  }

  /** Zeichen 274 (Tempo-Scheibe): weiß, roter Rand, schwarze Zahl. */
  function zeichneScheibe(g, kmh) {
    g.fillStyle = '#d0141a'; g.beginPath(); g.arc(64, 64, 60, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#ffffff'; g.beginPath(); g.arc(64, 64, 42, 0, Math.PI * 2); g.fill();
    const t = String(kmh);
    g.fillStyle = '#111'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = 'bold ' + (t.length >= 3 ? 38 : 50) + 'px Arial, Helvetica, sans-serif';
    g.fillText(t, 64, 53);
    g.font = 'bold 19px Arial, Helvetica, sans-serif';   // „km/h“ klein unter der Zahl
    g.fillText('km/h', 64, 93);
  }

  /** Zeichen 625 (Leitpfeil-Tafel): rot-weiß schräg gestreifter Rand, weißes Feld, großer roter Pfeil. */
  function zeichneLeitpfeil(g, richtung) {
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, 128, 128);
    g.save(); g.beginPath(); g.rect(0, 0, 128, 128); g.clip();
    g.fillStyle = '#d0141a';
    for (let i = -160; i < 160; i += 32) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + 16, 0); g.lineTo(i + 16 + 128, 128); g.lineTo(i + 128, 128); g.closePath(); g.fill(); }
    g.restore();
    g.fillStyle = '#ffffff'; g.fillRect(16, 16, 96, 96);
    g.save();
    if (richtung === 'links') { g.translate(128, 0); g.scale(-1, 1); }
    g.fillStyle = '#d0141a';
    g.beginPath(); g.moveTo(26, 52); g.lineTo(62, 52); g.lineTo(62, 34); g.lineTo(102, 64); g.lineTo(62, 94); g.lineTo(62, 76); g.lineTo(26, 76); g.closePath(); g.fill();
    g.restore();
  }

  function zeichneRueckDreieck(g) {
    g.fillStyle = GRAU; g.lineJoin = 'round'; g.lineWidth = 7; g.strokeStyle = GRAU;
    g.beginPath(); g.moveTo(64, 6); g.lineTo(123, 114); g.lineTo(5, 114); g.closePath(); g.fill(); g.stroke();
  }
  function zeichneRueckScheibe(g) { g.fillStyle = GRAU; g.beginPath(); g.arc(64, 64, 60, 0, Math.PI * 2); g.fill(); }

  /** Atlas aus Zellen (Name → Zeichenfunktion). Gibt { textur, uv(name) } zurück. */
  function atlasBauen(namen, zeichner) {
    const spalten = 8, zeilen = Math.max(1, Math.ceil(namen.length / spalten));
    let h = 1; while (h < zeilen * ZELLE) h *= 2;
    const cv = document.createElement('canvas'); cv.width = spalten * ZELLE; cv.height = h;
    const g = cv.getContext('2d');
    g.clearRect(0, 0, cv.width, cv.height);
    const ort = {};
    namen.forEach((n, i) => {
      const cx = (i % spalten) * ZELLE, cy = Math.floor(i / spalten) * ZELLE;
      g.save(); g.translate(cx, cy); g.beginPath(); g.rect(0, 0, ZELLE, ZELLE); g.clip();
      zeichner(n, g);
      g.restore();
      ort[n] = { u0: cx / cv.width, u1: (cx + ZELLE) / cv.width, v1: 1 - cy / h, v0: 1 - (cy + ZELLE) / h };
    });
    const tex = new THREE.CanvasTexture(cv);
    if (THREE.SRGBColorSpace !== undefined && 'colorSpace' in tex) tex.colorSpace = THREE.SRGBColorSpace;
    else if (THREE.sRGBEncoding !== undefined) tex.encoding = THREE.sRGBEncoding;
    tex.anisotropy = 4;
    tex.needsUpdate = true;
    return { textur: tex, ort, breite: cv.width, hoehe: h };
  }

  /** Das Schilder-Mesh der Strecke (oder null, wenn keine Schilder). */
  function bauen(st, tempoKlasse) {
    const C = cfg();
    const klasse = tempoKlasse || st.tempoKlasse || R.config.tempoKlasseStandard || 'normal';
    const liste = (st.kurvenschilder && st._schildKlasse === klasse) ? st.kurvenschilder : einbauen(st, klasse);
    if (!liste.length) return null;
    const m = C.massstab || 2;

    // --- Atlas: nur die gebrauchten Zeichen
    const namen = ['grau', 'rueckDreieck', 'rueckScheibe'];
    const braucht = (n) => { if (!namen.includes(n)) namen.push(n); };
    liste.forEach((s) => {
      braucht('dreieck-' + s.art + '-' + s.richtung); braucht('scheibe-' + s.kmh);
      s.leitpfeile.forEach((l) => braucht('leit-' + l.richtung));
    });
    const atlas = atlasBauen(namen, (n, g) => {
      if (n === 'grau') { g.fillStyle = GRAU_DUNKEL; g.fillRect(0, 0, ZELLE, ZELLE); }
      else if (n === 'rueckDreieck') zeichneRueckDreieck(g);
      else if (n === 'rueckScheibe') zeichneRueckScheibe(g);
      else if (n.startsWith('dreieck-')) { const t = n.split('-'); zeichneDreieck(g, t[1], t[2]); }
      else if (n.startsWith('scheibe-')) zeichneScheibe(g, +n.slice(8));
      else if (n.startsWith('leit-')) zeichneLeitpfeil(g, n.slice(5));
    });
    const inset = 0.5 / atlas.breite;   // halbes Texel: kein Überlaufen in die Nachbarzelle

    // --- Geometrie
    const pos = [], nor = [], uvs = [], idx = [];
    const ecke = (p, n, u, v) => { pos.push(p[0], p[1], p[2]); nor.push(n[0], n[1], n[2]); uvs.push(u, v); return pos.length / 3 - 1; };
    const quad = (a, b, c, d, n, zelle) => {   // a=links unten, b=rechts unten, c=rechts oben, d=links oben (aus Sicht des Betrachters)
      const z = atlas.ort[zelle], u0 = z.u0 + inset, u1 = z.u1 - inset, v0 = z.v0 + inset, v1 = z.v1 - inset;
      const i = ecke(a, n, u0, v0); ecke(b, n, u1, v0); ecke(c, n, u1, v1); ecke(d, n, u0, v1);
      idx.push(i, i + 1, i + 2, i, i + 2, i + 3);
    };
    /** Tafel (quadratisch, Seite w), Mitte (cx, cy, cz), schaut in Richtung f (waagrecht, normiert), Rückseite grau. */
    const tafel = (cx, cy, cz, w, f, zelleVorn, zelleHinten) => {
      const r = [f[2], 0, -f[0]], h = w / 2, n = [f[0], 0, f[2]], nb = [-f[0], 0, -f[2]], t = 0.05 * m;
      const P = (sx, sy, dz) => [cx + r[0] * sx * h + n[0] * dz, cy + sy * h, cz + r[2] * sx * h + n[2] * dz];
      quad(P(-1, -1, 0), P(1, -1, 0), P(1, 1, 0), P(-1, 1, 0), n, zelleVorn);
      // Rückseite: gespiegelt (von hinten gesehen ist rechts = −r)
      quad(P(1, -1, -t), P(-1, -1, -t), P(-1, 1, -t), P(1, 1, -t), nb, zelleHinten);
    };
    const mast = (x, z, y0, y1, br) => {   // vierseitiger Mast
      const e = [[-br, -br], [br, -br], [br, br], [-br, br]], nn = [[0, 0, -1], [1, 0, 0], [0, 0, 1], [-1, 0, 0]];
      const z0 = atlas.ort.grau, u = (z0.u0 + z0.u1) / 2, v = (z0.v0 + z0.v1) / 2;
      for (let k = 0; k < 4; k++) {
        const a = e[k], b = e[(k + 1) % 4], n = nn[k];
        const i = ecke([x + a[0], y0, z + a[1]], n, u, v); ecke([x + b[0], y0, z + b[1]], n, u, v);
        ecke([x + b[0], y1, z + b[1]], n, u, v); ecke([x + a[0], y1, z + a[1]], n, u, v);
        idx.push(i, i + 2, i + 1, i, i + 3, i + 2);
      }
    };
    const blick = (s, x, z) => blickRichtung(st, s, x, z);

    liste.forEach((sc) => {
      const f2 = blick(sc.s, sc.x, sc.z), f = [f2[0], 0, f2[1]];
      const road = sc.y;     // Boden am Mast
      // Mast nie tiefer als die Fahrbahn − 1 m (Hang)
      const yb = Math.max(road, st.spline.punktBei(sc.s).y - 1.0);
      const Ts = 0.9 * m, Ds = 0.6 * m;
      const discBot = yb + 1.2 + 0.4 * m, discTop = discBot + Ds;
      const triBot = discTop + 0.05 * m - 0.125 * Ts;
      const x = sc.x - f[0] * 0.06 * m, z = sc.z - f[2] * 0.06 * m;      // Mast hinter den Tafeln
      mast(x, z, yb - 0.6, triBot + 0.62 * Ts, 0.04 * m);
      tafel(sc.x, discBot + Ds / 2, sc.z, Ds, f, 'scheibe-' + sc.kmh, 'rueckScheibe');
      tafel(sc.x, triBot + Ts / 2, sc.z, Ts, f, 'dreieck-' + sc.art + '-' + sc.richtung, 'rueckDreieck');
      sc.leitpfeile.forEach((l) => {
        const fl2 = blick(l.s, l.x, l.z), fl = [fl2[0], 0, fl2[1]], W = 0.9 * m;
        const yl = Math.max(l.y, st.spline.punktBei(l.s).y - 1.0);
        const lx = l.x - fl[0] * 0.06 * m, lz = l.z - fl[2] * 0.06 * m;
        mast(lx, lz, yl - 0.6, yl + 0.9 * m + W * 0.8, 0.04 * m);
        tafel(l.x, yl + 0.9 * m + W / 2, l.z, W, fl, 'leit-' + l.richtung, 'grau');
      });
    });

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.setIndex(idx);
    geo.computeBoundingSphere();
    const mat = new THREE.MeshLambertMaterial({ map: atlas.textur, alphaTest: 0.45, emissive: new THREE.Color(0x707070), emissiveMap: atlas.textur });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = 'Kurvenschilder';
    mesh.frustumCulled = true;
    return mesh;
  }

  R.Kurvenschilder = { berechnen, einbauen, bauen, klassenTop, frei, kurvenSuchen };
})();
