// ============================================================
// Spaß-Paket S6 – Fahr-Zauber, RECHENTEIL (Autorennen UND Motorrad; läuft im Browser, in der Vorhersage und im Server; kein Three.js, kein Math.random):
//   🧲 Magnet-Röhre   strecke.spass.zauber.magnet = [{ nr, s0, s1, laenge, rampe, halb }]: wer mit Tempo ≥ vMin (oder mit dem Magnet-Extra) einfährt, haftet – das Fahrzeug rollt an der Wand
//                     hoch, fährt kopfüber an der Decke und rollt zurück. Die Physik bleibt auf der Bodenspur (x/z/Tempo wie ohne Röhre), nur der Winkel θ(s) ist neu
//                     (magnetTheta, rein aus s) und das Fahrzeug ist kollisionsfrei (vehicle.imFlug) – die Anzeige (spassZauberUI.js) legt Pose und Kamera um θ.
//   🪂 Schlucht       .schluchten = [{ nr, sT, sL, halb }]: Absprung-Linie sT, Lücke bis sL. Beim Überqueren klappen Flügel/Gleitschirm aus (fz.gleit): feste Bahn in s, Lenken
//                     links/rechts verschiebt q, sichere Landung bei sL; wer zu weit daneben landet, wird freundlich vor die Schlucht zurückgesetzt (fz.z.versatz).
//   🛹 Schiene/Wand   .schienen = [{ nr, art: 'schiene'|'wand', side, s0, s1, q, hoehe, halb }]: Grinden (Fahrzeug rutscht mit Funken auf dem Geländer, Punkte) und Wallride
//                     (kurze Wand-Abschnitte). Einfangen: Querlage q beim Überqueren von s0 (Wand zusätzlich: gegen die Wand lenken). Austritt am Ende oder durch Wegsteuern.
//   🛝 Halfpipe       .pipe = { s0, s1, qF, r, rampe } (nur Stunt-Park): beidseits runde Rampen; Profil pipeProfil(s, q) wird auf strecke.hoeheAn aufaddiert; Hochfahren/Abheben/
//                     Zurückrollen als Zustand fz.pipe (Pendel auf dem Kreisbogen), Trick in der Luft über die normalen Flug-Tricks.
//   🍄 Extras         .extras = [{ nr, s, q, art: 'riese'|'mini'|'magnet', x, y, z }]: Zauber-Kugeln, nach 12 s wieder da (Spiel._zExtra). Riese: 8 s × Größe, schiebt andere weg;
//                     Mini: 8 s kleiner + schneller, Hindernisse (Pylonen/Äste/Baken) berühren nicht. Magnet-Extra 10 s: haftet in jeder Röhre.
// Alles nur auf Strecken mit Option { spass: true, zauber: true } (trackBuilder reicht opt durch); ohne: strecke.spass.zauber = null → kein Codepfad = bitgleich.
// Zustand je Fahrzeug: fz.z (fz = f.flug) – dadurch auch in der Vorhersage (eigener fz) vorhanden.
// Ereignisse (R.Spass.melden → fz.spassE): magnet · magnetEnde · gleitStart · gleitLand · gleitDaneben · grind · grindEnde · wand · wandEnde · pipeStart · pipeLuft · riese · mini · magnetExtra · riesenEnde
// Öffentlich: R.SpassZauber = { plan, nachSchritt, magnetTheta, pipeProfil, zustand, an, anSetzen, … }
// ============================================================
(function () {
  const R = window.Rennspiel;
  if (!R || !R.config || !R.Spass || !R.Schanzen || !R.Spline || !R.Spiel) return;
  if (R.SpassZauber) return;

  R.config.spass.zauber = {
    standardAn: true,
    magnet: { laenge: 150, rampe: 36, vMin: 6, itemZeit: 10, halten: true, verlustProS: 0.006, bremsSchwelle: 0.9, platz: { je: 2200, max: 2, abLaenge: 1300, kappa: 1 / 320, vorher: 25, nachher: 25 } },
    schlucht: { luecke: 90, vGleitMin: 20, vGleitMax: 44, scheitel: 4, scheitelU: 0.35, landeStaerke: 0.5, qRate: 6, zentrieren: 0.3, randToleranz: 0.6, landeTempo: 0.97, zurueck: 34, resetTempo: 9, pad: 14,
      platz: { je: 2600, max: 2, abLaenge: 1500, kappa: 1 / 380, vorher: 30, nachher: 30 } },
    schiene: { laenge: 54, hoehe: 0.85, rand: 1.0, einfang: 1.2, vMin: 5, ausSek: 0.12, ausLenk: 0.45, hop: 2.4, punkteJeM: 2, platz: { je: 1500, max: 2, abLaenge: 1100, kappa: 1 / 260, vorher: 14, nachher: 22 } },
    wand: { laenge: 38, hoehe: 2.3, abstand: 0.3, einfang: 1.7, vMin: 11, lenkMin: 0.15, ausSek: 0.12, ausLenk: 0.45, hop: 1.2, punkteJeM: 3, platz: { je: 2300, max: 2, abLaenge: 1400, kappa: 1 / 260, vorher: 14, nachher: 22 } },
    loopMag: { laenge: 90, rampe: 24, rand: 4 },      // R4: Looping → Magnet-Röhre (Menü „🌀 Loopings“, Standard Klassisch): Röhre um die Mitte des Loopings; rand = Abstand zu anderen Elementen
    pipe: { s0: 800, s1: 872, qF: 6, r: 6, rampe: 14, wMin: 5, pumpe: 2.5, vyMax: 11, reibung: 0.3, abstandStart: 0.08, vMin: 4, hopInnen: 2.0 },
    // R4: Halfpipe der Auto-Stunt-Arena (src/spass/spassArena.js, Eintrag mit stuntBereich: true). Länger und breiter als die Motorrad-Pipe; vCap = Höchsttempo im Rohr (m/s).
    pipeAuto: { s0: 700, s1: 950, qF: 6, r: 7, rampe: 22, wMin: 5, pumpe: 2.5, vyMax: 11, reibung: 0.03, abstandStart: 0.08, vMin: 4, hopInnen: 2.0, vCap: 26, einfangMax: 0.75, reMin: 0.5 },
    pipeGeo: { zOff: 1034, xMin: 150, xMax: 250 },      // Lage der Pipe-Gerade im Stadion (z = s − zOff, x im Streifen xMin..xMax) – gilt für Stunt-Park und Stunt-Arena
    extras: { n: 3, radius: 2.6, erneuerung: 12, vorher: 25,
      riese: { zeit: 8, faktor: 2.1, vMax: 0.9, besch: 0.8, schiebe: 0.09 },
      mini: { zeit: 8, faktor: 0.6, vMax: 1.15, besch: 1.35 },
      magnet: { zeit: 10 } },
    abstand: 110,
  };
  const C = () => R.config.spass.zauber;
  const klemme = (x, a, b) => (x < a ? a : x > b ? b : x);
  const glatt = (u) => { u = klemme(u, 0, 1); return u * u * (3 - 2 * u); };
  const G = () => (R.config.stunt && R.config.stunt.schanze && R.config.stunt.schanze.g !== undefined ? R.config.stunt.schanze.g : 9.81);
  const melden = (fz, n) => R.Spass.melden(fz, n);

  // ---------------------------------------------------------------- Schalter (Menü „✨ Fahr-Zauber“, Standard an)
  const AN = { an: null, erzwungen: false, loopMag: null, bau: false };
  function an() {
    if (AN.erzwungen) return true;                        // R4: Stunt-Arena braucht die Halfpipe (nur während des Rennstarts gesetzt)
    if (AN.an === null) {
      AN.an = !(R.config.spass.zauber && R.config.spass.zauber.standardAn === false);
      try { const o = typeof localStorage !== 'undefined' ? localStorage.getItem('rennspiel.spass.zauber.an') : null; if (o === '0') AN.an = false; else if (o === '1') AN.an = true; } catch (e) { /* kein localStorage */ }
    }
    return AN.an;
  }
  /** R4: Loopings als Magnet-Röhre (Menü „🌀 Loopings“, Standard Klassisch = aus). Gilt nur mit Fahr-Zauber und nur für Rennen, die der Spieler offline startet. */
  function loopMagRoh() {
    if (AN.loopMag === null) {
      AN.loopMag = false;
      try { const o = typeof localStorage !== 'undefined' ? localStorage.getItem('rennspiel.spass.zauber.loopMag') : null; if (o === '1') AN.loopMag = true; } catch (e) { /* kein localStorage */ }
    }
    return AN.loopMag;
  }
  const loopMag = () => loopMagRoh() && an();
  function loopMagSetzen(b) { AN.loopMag = !!b; try { if (typeof localStorage !== 'undefined') localStorage.setItem('rennspiel.spass.zauber.loopMag', b ? '1' : '0'); } catch (e) { /* egal */ } }
  function erzwingen(b) { AN.erzwungen = !!b; }
  function anSetzen(b) { AN.an = !!b; try { if (typeof localStorage !== 'undefined') localStorage.setItem('rennspiel.spass.zauber.an', b ? '1' : '0'); } catch (e) { /* egal */ } }

  /** Neuer Zustand (fz.z). */
  function zustand() {
    return { mag: null, magN: 0, magV: 0, magItem: 0, riese: 0, mini: 0, groesse: 1, orig: null, punkte: 0, grindM: 0, wandM: 0, versatz: null, pipeN: 0, gleitN: 0, ausZeit: 0, letzter: null };
  }
  const zz = (fz) => fz.z || (fz.z = zustand());

  // ---------------------------------------------------------------- Rechenhilfen (rein)
  /** Rollwinkel θ der Magnet-Röhre bei Bogenlänge s (0 = Boden, π = Decke). */
  function magnetTheta(e, sp, s) {
    const a = sp.differenzS(s, e.s0);
    if (a <= 0 || a >= e.laenge) return 0;
    const r = e.rampe;
    if (a < r) return Math.PI * glatt(a / r);
    if (a > e.laenge - r) return Math.PI * (1 - glatt((a - (e.laenge - r)) / r));
    return Math.PI;
  }
  /** Höhe des Halfpipe-Profils bei (s, q): beidseits Kreisbogen mit Radius r·w(s) (w blendet an beiden Enden in rampe m auf 1 ein). */
  function pipeW(e, a) { const L = e.s1 - e.s0; return a <= 0 || a >= L ? 0 : glatt(a / e.rampe) * glatt((L - a) / e.rampe); }
  function pipeProfil(e, s, q) {
    const a = s - e.s0, w = pipeW(e, a);
    if (w <= 0) return 0;
    const re = e.r * w, d = Math.abs(q) - e.qF;
    if (d <= 0) return 0;
    if (d >= re) return re;
    return re - Math.sqrt(re * re - d * d);
  }

  // ---------------------------------------------------------------- Platzierung
  function hashText(t) { let h = 2166136261 >>> 0; for (let i = 0; i < t.length; i++) { h ^= t.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return h >>> 0; }

  function plan(st, sicht, zufallAn, erg, opt) {
    const daten = st.daten || {};
    const leer = { magnet: [], schluchten: [], schienen: [], extras: [], pipe: null };
    if (!st.spline || !erg || !opt || opt.zauber !== true) return null;
    const c = C();
    // Stunt-Park (nur Motorrad-Katalog) und Stunt-Arena (R4, nur Autorennen: daten.stuntBereich): echte Halfpipe
    if (daten.id === 'stuntpark' || daten.stuntBereich === true) {
      const arena = daten.stuntBereich === true, p = arena ? c.pipeAuto : c.pipe;
      leer.pipe = { s0: p.s0, s1: p.s1, qF: p.qF, r: p.r, rampe: p.rampe, halb: st.breite / 2 };
      if (arena) { leer.pipe.auto = true; leer.pipe.vCap = p.vCap; leer.pipe.geo = Object.assign({}, c.pipeGeo); }   // nur Arena: Motorrad-Pipe bleibt bitgleich (kein auto/vCap/geo)
      erg.zonen.push({ s0: p.s0 - 10, s1: p.s1 + 10 });
      pipeEinbauen(st, leer.pipe);
      return leer;
    }
    if (daten.mega || daten.motoFelder || daten.motoKisten) return null;
    const sp = st.spline, L = sp.laenge, SP = R.config.spass.platz;
    const N = Math.max(8, Math.ceil(L / 4)), ds = L / N, kr = new Float32Array(N);
    for (let k = 0; k < N; k++) kr[k] = Math.abs(sp.punktBei(k * ds).kruemmung || 0);
    const kMax = (a, b) => { let i0 = Math.floor(a / ds), i1 = Math.ceil(b / ds), m = 0; if (i1 - i0 > N) { i0 = 0; i1 = N; } for (let i = i0; i <= i1; i++) { const x = kr[((i % N) + N) % N]; if (x > m) m = x; } return m; };
    const lm = (opt.loopingMagnet === true || AN.bau === true) && st.loopings && st.loopings.length > 0, alteLoops = lm ? st.loopings.slice() : null;
    if (lm) st.loopings = [];                                       // R4: ohne die Looping-Sperrzonen messen (die Loopings werden gleich ersetzt oder von Hand wieder eingetragen)
    let belegt;
    try { belegt = R.Spass.sperrZonen(st, sicht, !zufallAn).slice(); } finally { if (lm) st.loopings = alteLoops; }
    (erg.zonen || []).forEach((z) => { const len = sp.wrapS(z.s1 - z.s0); belegt.push({ c: z.s0 + len / 2, h: len / 2 }); });
    const frei = (a, b) => { const c0 = (a + b) / 2, h0 = (b - a) / 2; for (let k = 0; k < belegt.length; k++) if (Math.abs(sp.differenzS(c0, belegt[k].c)) < h0 + belegt[k].h) return false; return true; };
    const seed = hashText(String(daten.id || st.id || '') + '|' + (st.variante || '') + '|zauber');
    const von = SP.startFrei, bis = L - SP.zielFrei, laenge = bis - von;
    const halb = Math.max(2.5, (st.breite || 12) / 2);
    const gesetzt = [];
    const phase = (seed % 89) / 89 * 6;
    /** Sucht ab Wunschlage `wunsch` (Bogenlänge) die ruhigste freie Stelle für ein Element der Länge len. Liefert s (Beginn) oder null. */
    function suche(len, pl, wunsch) {
      for (const fr of [1, 1.7, 3, 6, 12, Infinity]) {
        let beste = null;
        for (let s = Math.round(von + phase); s <= bis - len; s += 6) {
          const sa = s - pl.vorher, sb = s + len + pl.nachher;
          if (sa < von - 20 || sb > bis + 20) continue;
          if (!frei(sa, sb)) continue;
          if (gesetzt.some((z) => Math.abs(sp.differenzS((sa + sb) / 2, (z.a + z.b) / 2)) < (sb - sa) / 2 + (z.b - z.a) / 2 + c.abstand)) continue;
          const k = kMax(sa, sb);
          if (fr !== Infinity && k >= fr * pl.kappa) continue;
          const wert = k * 1e5 + Math.abs(s + len / 2 - wunsch) * 0.02;
          if (!beste || wert < beste.w) beste = { s, w: wert, sa, sb };
        }
        if (beste) { gesetzt.push({ a: beste.sa, b: beste.sb }); erg.zonen.push({ s0: beste.sa, s1: beste.sb }); return beste.s; }
      }
      return null;
    }
    const nach = (je, max, abL, pl) => (L >= abL ? klemme(Math.round(L / je), 1, max) : 0);
    // R4: Loopings → Magnet-Röhre (zuerst, damit alle anderen Elemente drumherum gelegt werden). Wunschplatz = Mitte des Loopings; ist dort etwas im Weg (Start/Ziel, Kreuzung, Kurve),
    // rückt die Röhre in 6-m-Schritten zur nächsten freien geraden Stelle der Runde. Reicht der Platz nicht für alle, werden die Röhren kürzer (90 → 70 → 56 m); was dann
    // noch nicht passt, bleibt ein Looping.
    if (lm) {
      const LM = c.loopMag, M0 = c.magnet;
      const versuch = (len) => {
        const rampe = len === LM.laenge ? LM.rampe : Math.round(len * LM.rampe / LM.laenge), neu = [], gz = gesetzt.slice(), rest = [];
        alteLoops.forEach((l) => {
          const mitte = l.s0 + sp.wrapS(l.s1 - l.s0) / 2;
          let ok = null;
          for (let d = 0; d <= L / 2 && !ok; d += 6) for (const sg of (d === 0 ? [1] : [1, -1])) {
            const s0 = sp.wrapS(mitte - len / 2 + sg * d), sa = s0 - LM.rand, sb = s0 + len + LM.rand;
            if (sa < von - 20 || sb > bis + 20 || !frei(sa, sb) || kMax(sa, sb) >= M0.platz.kappa) continue;
            if (gz.some((z) => Math.abs(sp.differenzS((sa + sb) / 2, (z.a + z.b) / 2)) < (sb - sa) / 2 + (z.b - z.a) / 2)) continue;
            ok = { s0, sa, sb }; break;
          }
          if (!ok) { rest.push(l); return; }
          gz.push({ a: ok.sa, b: ok.sb });
          neu.push({ nr: 0, s0: ok.s0, s1: ok.s0 + len, laenge: len, rampe, halb, ausLooping: true, sa: ok.sa, sb: ok.sb });
        });
        return { neu, rest };
      };
      let best = null;
      for (const len of [LM.laenge, Math.round(LM.laenge * 0.78), Math.round(LM.laenge * 0.62)]) {
        const v = versuch(len);
        if (!best || v.neu.length > best.neu.length) best = v;
        if (!v.rest.length) break;
      }
      best.neu.forEach((m) => { gesetzt.push({ a: m.sa, b: m.sb }); erg.zonen.push({ s0: m.sa, s1: m.sb }); delete m.sa; delete m.sb; m.nr = leer.magnet.length; leer.magnet.push(m); });
      best.rest.forEach((l) => { belegt.push({ c: l.s0 + (sp.wrapS(l.s1 - l.s0) + 35 - 100) / 2, h: (sp.wrapS(l.s1 - l.s0) + 135) / 2 }); });
      if (best.rest.length !== alteLoops.length) { st.loopings = best.rest; best.rest.forEach((l, i) => { l.nr = i; }); }
    }
    // Schlucht
    const S = c.schlucht, nS = nach(S.platz.je, S.platz.max, S.platz.abLaenge);
    for (let i = 0; i < nS; i++) {
      const s = suche(S.luecke + S.pad * 2, S.platz, von + laenge * (i + 0.15) / nS);
      if (s !== null) leer.schluchten.push({ nr: leer.schluchten.length, sT: s + S.pad, sL: s + S.pad + S.luecke, halb });
    }
    // Magnet-Röhre
    const M = c.magnet, nM = nach(M.platz.je, M.platz.max, M.platz.abLaenge);
    for (let i = 0; i < nM; i++) {
      const s = suche(M.laenge, M.platz, von + laenge * (i + 0.45) / nM);
      if (s !== null) leer.magnet.push({ nr: leer.magnet.length, s0: s, s1: s + M.laenge, laenge: M.laenge, rampe: M.rampe, halb });
    }
    // Schienen (Geländer am Rand) und Wände
    const Sc = c.schiene, nSc = nach(Sc.platz.je, Sc.platz.max, Sc.platz.abLaenge);
    let seite = (seed & 1) ? 1 : -1;
    for (let i = 0; i < nSc; i++) {
      const s = suche(Sc.laenge, Sc.platz, von + laenge * (i + 0.7) / nSc);
      if (s !== null) { leer.schienen.push({ nr: leer.schienen.length, art: 'schiene', side: seite, s0: s, s1: s + Sc.laenge, laenge: Sc.laenge, q: seite * (halb - Sc.rand), hoehe: Sc.hoehe, halb }); seite = -seite; }
    }
    const W = c.wand, nW = nach(W.platz.je, W.platz.max, W.platz.abLaenge);
    for (let i = 0; i < nW; i++) {
      const s = suche(W.laenge, W.platz, von + laenge * (i + 0.9) / Math.max(1, nW));
      if (s !== null) { leer.schienen.push({ nr: leer.schienen.length, art: 'wand', side: seite, s0: s, s1: s + W.laenge, laenge: W.laenge, q: seite * (halb + W.abstand), hoehe: W.hoehe, halb }); seite = -seite; }
    }
    // Extras (Zauber-Kugeln): Riese, Mini, Magnet auf freier Strecke (nur Punktzonen, ± vorher)
    const E = c.extras, arten = ['riese', 'mini', 'magnet'];
    for (let i = 0; i < E.n; i++) {
      const wunsch = von + laenge * (i + 0.5) / E.n + ((seed >> (i * 3)) % 40) - 20;
      let gut = null;
      for (let dsv = 0; dsv < 400 && gut === null; dsv += 6) for (const sg of [1, -1]) {
        const s = sp.wrapS(wunsch + sg * dsv);
        if (s < von || s > bis) continue;
        if (!frei(s - E.vorher, s + E.vorher)) continue;
        if (leer.extras.some((x) => Math.abs(sp.differenzS(s, x.s)) < 150)) continue;
        gut = s; break;
      }
      if (gut === null) continue;
      const pt = sp.punktBei(gut), q = ((i + (seed & 3)) % 3 - 1) * halb * 0.5;
      const x = pt.x + pt.nx * q, z = pt.z + pt.nz * q;
      leer.extras.push({ nr: leer.extras.length, s: gut, q, art: arten[(i + (seed >>> 5)) % 3], x, y: st.hoeheAn(x, z), z });
    }
    return leer;
  }
  const planOrig = R.Spass.plan;
  R.Spass.plan = function (st, sicht, zufallAn, opt) {
    const erg = planOrig.apply(this, arguments);
    try { erg.zauber = plan(st, sicht, zufallAn, erg, opt); } catch (e) { erg.zauber = null; if (typeof console !== 'undefined') console.error('Fahr-Zauber (Plan):', e); }
    return erg;
  };
  const zauberVon = (st) => (st && st.spass && st.spass.zauber) || null;

  /** Halfpipe-Profil auf die Höhe der Strecke aufaddieren (Stunt-Park/Stunt-Arena, Gerade 2: x = 2·Radius, z = s − zOff; Lage in e.geo, Vorgabe pipeGeo = 1034 / 150..250). */
  function pipeEinbauen(st, e) {
    if (st._pipeEin) return;
    st._pipeEin = true;
    const proto = Object.getPrototypeOf(st), o = proto.hoeheAn, sp = st.spline, geo = e.geo || C().pipeGeo, zOff = geo.zOff, xMin = geo.xMin, xMax = geo.xMax;
    const z0 = e.s0 - zOff - 2, z1 = e.s1 - zOff + 2;
    st.hoeheAn = function (x, z, idx) {
      const y = o.call(this, x, z, idx);
      if (z < z0 || z > z1 || x < xMin || x > xMax) return y;
      const s = z + zOff, p = sp.punktBei(s), q = (x - p.x) * p.nx + (z - p.z) * p.nz;
      return y + pipeProfil(e, s, q);
    };
  }

  // ---------------------------------------------------------------- Zustände starten
  function magnetAus(fz, z, v) {
    if (!z.mag) return;
    z.mag = null;
    if (!fz.aktiv) v.imFlug = false;
    melden(fz, 'magnetEnde');
  }

  /**
   * FIX1: Tempo in der Magnet-Röhre bleibt erhalten (vorher bremsten Reibung/Steigung die Fahrt bis auf ein Drittel ab).
   * Nur volles Bremsen (≥ bremsSchwelle; die Bremshilfe schafft höchstens 0,8) gibt das Tempo frei. Wer nicht bremst, behält das Einfahrtstempo (nur ein leichter Verlust verlustProS); wer Gas gibt, wird schneller; wer bremst (Bremse > bremsSchwelle), wird langsamer.
   * Rein aus Zustand + letzter Steuerung → Server, Vorhersage und Offline-Spiel rechnen bitgleich.
   */
  function magnetHalten(z, v, dt) {
    const c = C().magnet, ls = v.letzteSteuerung, br = ls ? (ls.bremse || 0) : 0;
    if (c.halten === false) return;                          // (nur für Vorher/Nachher-Messungen)
    if (br > c.bremsSchwelle || !(z.magV > 0)) { z.magV = v.vLaengs; return; }
    if (v.vLaengs >= z.magV) { z.magV = v.vLaengs; return; }
    z.magV *= 1 - c.verlustProS * dt;
    if (v.vLaengs < z.magV) v.vLaengs = z.magV;
  }

  function gleitStart(fz, v, st, nah, e, q) {
    const c = C().schlucht, sp = st.spline, z = zz(fz);
    const vF = klemme(Math.max(v.vLaengs, c.vGleitMin), c.vGleitMin, c.vGleitMax);
    const pL = sp.punktBei(e.sL), gap = e.sL - e.sT;
    const sAkt = nah.s, u0 = klemme(sp.differenzS(sAkt, e.sT) / gap, 0, 0.9);
    const y0 = st.hoeheAn(v.x, v.z, nah.index);
    fz.index = nah.index;
    fz.gleit = { nr: e.nr, t: u0 * gap / vF, T: gap / vF, sT: e.sT, sL: e.sL, q: klemme(q, -(e.halb + 1), e.halb + 1), halb: e.halb, vF, y0, yL: st.hoeheAn(pL.x, pL.z, nah.index) };
    fz.aktiv = true; fz.rampe = null; fz.rampenH = 0; fz.vy = 4; fz.y = y0; fz.yVorher = y0; fz.t = 0; fz.sprungGemeldet = true;
    fz.startX = v.x; fz.startZ = v.z; fz.fluege++; fz.nicken = 0; fz.nickenVorher = 0;
    v.vLaengs = vF; v.vQuer = 0; v.imFlug = true;
    z.gleitN++;
    melden(fz, 'gleitStart');
    return 'gleit';
  }

  function schieneStart(fz, v, st, nah, e, q, kontext) {
    const c = e.art === 'wand' ? C().wand : C().schiene, sp = st.spline, z = zz(fz);
    const vF = Math.max(v.vLaengs, c.vMin);
    fz.index = nah.index;
    fz.schiene = { nr: e.nr, art: e.art, side: e.side, s: sp.differenzS(nah.s, e.s0) > 0 ? nah.s : e.s0, s1: e.s1, q: e.q, h: e.hoehe, vF, m: 0, weg: 0, ausT: 0, qA: q };
    fz.aktiv = true; fz.rampe = null; fz.rampenH = 0; fz.vy = 0; fz.y = st.hoeheAn(v.x, v.z, nah.index); fz.yVorher = fz.y; fz.t = 0; fz.sprungGemeldet = true;
    fz.startX = v.x; fz.startZ = v.z; fz.nicken = 0; fz.nickenVorher = 0;
    v.imFlug = true; v.vQuer = 0;
    melden(fz, e.art === 'wand' ? 'wand' : 'grind');
    return e.art;
  }

  /** Pipe-Werte: Auto-Arena (e.auto) hat eigene, sonst die Motorrad-Werte. */
  const pipeC = (e) => (e.auto ? C().pipeAuto : C().pipe);
  function pipeStart(fz, v, st, nah, e, q, sAlt, xAlt, zAlt, dt) {
    const c = pipeC(e), sp = st.spline, z = zz(fz);
    const side = q >= 0 ? 1 : -1, w = pipeW(e, nah.s - e.s0), re = e.r * w;
    if (re < 0.4) return null;
    if (e.auto && (re < e.r * c.reMin || Math.abs(q) - e.qF > re * c.einfangMax)) return null;      // R4: Auto wird erst eingefangen, wenn die Rundung unter ihm schon hoch genug ist (sonst Katapult am Rampenanfang); Motorrad unverändert
    const pt = sp.punktBei(nah.s), vo = dt > 0 ? ((v.x - xAlt) * pt.nx + (v.z - zAlt) * pt.nz) / dt * side : 0;
    const d = Math.abs(q) - e.qF, phi0 = Math.asin(klemme(d / re, 0, 0.99));
    fz.pipe = { e, side, phi: phi0, w: Math.max(vo, c.wMin) / re, s: nah.s, vF: e.vCap ? Math.min(v.vLaengs, e.vCap) : v.vLaengs, sAus: 0 };
    fz.index = nah.index;
    fz.aktiv = true; fz.rampe = null; fz.rampenH = 0; fz.vy = 0; fz.y = st.hoeheAn(v.x, v.z, nah.index); fz.yVorher = fz.y; fz.t = 0; fz.sprungGemeldet = true;
    fz.startX = v.x; fz.startZ = v.z; fz.nicken = 0; fz.nickenVorher = 0;
    v.imFlug = true; v.vQuer = 0;
    z.pipeN++;
    melden(fz, 'pipeStart');
    return 'pipe';
  }

  /**
   * Nach dem normalen Fahrschritt (nah = Abfrage VOR dem Schritt, xAlt/zAlt = Position davor – wie R.SpassWelten.nachSchritt): Magnet, Schlucht, Schiene/Wand, Halfpipe.
   * Liefert 'gleit' | 'schiene' | 'wand' | 'pipe' | null (Magnet erzeugt keinen eigenen Flug).
   */
  function nachSchritt(fz, v, st, nah, xAlt, zAlt, dt, kontext) {
    const za = zauberVon(st);
    if (!za || !fz || !nah || !st) return null;
    const z = zz(fz), sp = st.spline, pt = sp.punktBei(nah.s), dx = v.x - xAlt, dz = v.z - zAlt;
    const sAlt = nah.s, sNeu = sAlt + dx * pt.tx + dz * pt.tz, q = nah.seitenabstand + dx * pt.nx + dz * pt.nz;
    // Magnet: Austritt prüfen (auch im Flug), Eintritt am Anfang der Röhre
    if (z.mag) { const a = sp.differenzS(sNeu, z.mag.s0); if (a < -2 || a > z.mag.laenge + 2 || fz.aktiv) magnetAus(fz, z, v); }
    if (fz.aktiv || v.imLooping) return null;
    if (!z.mag && za.magnet.length) {
      for (let i = 0; i < za.magnet.length; i++) {
        const e = za.magnet[i], aA = sp.differenzS(sAlt, e.s0), aN = sp.differenzS(sNeu, e.s0);
        if (!((aA < 0 && aN >= 0 && aN < 20) || (aN > 0 && aN < e.rampe * 0.5))) continue;   // Linie überquert – oder (nach einem Hüpfer/Sprung) in der Einfahrt gelandet
        if (v.vLaengs >= C().magnet.vMin || z.magItem > 0) { z.mag = e; z.magN++; z.magV = v.vLaengs; v.imFlug = true; melden(fz, 'magnet'); }
        break;
      }
    }
    if (z.mag) { magnetHalten(z, v, dt); return null; }       // in der Röhre: Tempo halten, keine anderen Elemente (nie überlappend geplant)
    // Schlucht: Linie sT überquert → Gleiten; auf dem Boden mitten in der Schlucht (z. B. nach einem Sprung) ebenso
    for (let i = 0; i < za.schluchten.length; i++) {
      const e = za.schluchten[i], aA = sp.differenzS(sAlt, e.sT), aN = sp.differenzS(sNeu, e.sT), inn = sp.differenzS(sNeu, e.sT) >= 0 && sp.differenzS(sNeu, e.sL) < 0;
      if ((aA < 0 && aN >= 0 && aN < 20) || (inn && aN >= 0 && aN < e.sL - e.sT)) return gleitStart(fz, v, st, nah, e, q);
    }
    // Schienen / Wände
    for (let i = 0; i < za.schienen.length; i++) {
      const e = za.schienen[i], aA = sp.differenzS(sAlt, e.s0), aN = sp.differenzS(sNeu, e.s0);
      if (!(aA < 0 && aN >= 0 && aN < 20)) continue;
      const c = e.art === 'wand' ? C().wand : C().schiene;
      if (!(v.vLaengs >= c.vMin)) continue;
      const ls = v.letzteSteuerung ? v.letzteSteuerung.lenkung : 0;
      if (e.art === 'schiene') { if (Math.abs(q - e.q) > c.einfang) continue; }
      else {
        if (!(q * e.side >= e.halb - c.einfang)) continue;                       // am Rand auf der Wandseite
        if (!(z.magItem > 0 || ls * e.side >= c.lenkMin)) continue;             // gegen die Wand lenken (oder Magnet-Extra)
      }
      return schieneStart(fz, v, st, nah, e, q);
    }
    // Halfpipe
    const pe = za.pipe;
    if (pe) {
      const a = sp.differenzS(sNeu, pe.s0);
      if (a > 3 && a < pe.s1 - pe.s0 - 3 && Math.abs(q) > pe.qF + pipeC(pe).abstandStart && v.vLaengs >= pipeC(pe).vMin) return pipeStart(fz, v, st, nah, pe, q, sAlt, xAlt, zAlt, dt);
    }
    return null;
  }

  // ---------------------------------------------------------------- Flug-Ersatz: Gleiten, Schiene/Wand, Halfpipe
  function weltPose(st, s, q) { const p = st.spline.punktBei(s); return { x: p.x + p.nx * q, z: p.z + p.nz * q, tx: p.tx, tz: p.tz, nx: p.nx, nz: p.nz, p }; }

  function gleitSchritt(fz, v, st, steuerung, dt) {
    const Gl = fz.gleit, c = C().schlucht, sp = st.spline, z = zz(fz);
    Gl.t += dt; fz.t += dt; fz.yVorher = fz.y; fz.nickenVorher = fz.nicken;
    const lenk = klemme((steuerung && steuerung.lenkung) || 0, -1, 1);
    v.lenkung += (lenk - v.lenkung) * Math.min(1, 6 * dt);
    const dq = lenk * c.qRate - Gl.q * c.zentrieren;                 // Lenkung > 0 = zur +n-Seite (q wächst)
    Gl.q = klemme(Gl.q + dq * dt, -(Gl.halb + 6), Gl.halb + 6);
    const u = Math.min(1, Gl.t / Gl.T), s = Gl.sT + (Gl.sL - Gl.sT) * u;
    const w = weltPose(st, s, Gl.q);
    // Höhenprofil (FIX1): Schirm öffnet sofort → schneller Auftrieb bis zum Scheitel (scheitelU), danach langer Gleitflug, der flach ausläuft (sanfte Landung ohne Senkrechtstoß)
    const U = c.scheitelU, h = u < U ? c.scheitel * Math.sin(Math.PI / 2 * u / U) : c.scheitel * (1 + Math.cos(Math.PI * (u - U) / (1 - U))) / 2;
    const y = Gl.y0 + (Gl.yL - Gl.y0) * u + h;
    v.x = w.x; v.z = w.z;
    v.heading = R.headingAus(w.tx * Gl.vF + w.nx * dq, w.tz * Gl.vF + w.nz * dq);
    v.vLaengs = Gl.vF; v.vQuer = 0; v.neigung *= Math.exp(-3 * dt);
    fz.y = y; fz.vy = (y - fz.yVorher) / dt;
    fz.nicken += (klemme(Math.atan2(fz.vy, Math.max(8, Gl.vF)), -0.3, 0.3) - fz.nicken) * Math.min(1, 5 * dt);
    v.letzteSteuerung = { gas: (steuerung && steuerung.gas) || 0, bremse: 0, lenkung: lenk };
    v.untergrund = 'strasse';
    if (u < 1) return null;
    // Landung
    const e = fz.gleit;
    fz.gleit = null;
    if (Math.abs(Gl.q) <= Gl.halb + c.randToleranz) {
      const boden = st.hoeheAn(v.x, v.z, fz.index), n = st.abfrage(v.x, v.z, fz.index);
      v.heading = R.headingAus(w.tx, w.tz);
      fz.tempoVorLandung = Gl.vF; v.vLaengs = Gl.vF * c.landeTempo; v.vQuer = 0;
      fz.landeStaerke = c.landeStaerke; fz.letzteFlugzeit = fz.t; fz.maxFlugzeit = Math.max(fz.maxFlugzeit || 0, fz.t); fz.letzteWeite = Gl.sL - Gl.sT;
      fz.letzteLandung = { sauber: true, aufStrasse: true, winkel: 0, seitenabstand: n.seitenabstand, s: n.s };
      fz.landungen++; fz.aktiv = false; fz.y = boden; fz.vy = 0; fz.nicken = -0.05; v.imFlug = false; v.untergrund = n.untergrund;
      melden(fz, 'gleitLand');
      return 'landung';
    }
    // zu weit daneben: freundlich vor die Schlucht zurück
    const sZ = sp.wrapS(Gl.sT - c.zurueck), pz = sp.punktBei(sZ);
    v.x = pz.x; v.z = pz.z; v.heading = R.headingAus(pz.tx, pz.tz); v.vLaengs = c.resetTempo; v.vQuer = 0; v.lenkung = 0; v.neigung = 0;
    fz.aktiv = false; fz.y = st.hoeheAn(v.x, v.z, fz.index); fz.vy = 0; fz.nicken = 0; v.imFlug = false;
    z.versatz = { s: sZ };
    melden(fz, 'gleitDaneben');
    return null;
  }

  function schieneSchritt(fz, v, st, steuerung, dt) {
    const S = fz.schiene, art = S.art, c = art === 'wand' ? C().wand : C().schiene, sp = st.spline, z = zz(fz);
    fz.t += dt; fz.yVorher = fz.y; fz.nickenVorher = fz.nicken;
    const lenk = klemme((steuerung && steuerung.lenkung) || 0, -1, 1);
    v.lenkung += (lenk - v.lenkung) * Math.min(1, 6 * dt);
    // Einrasten in die Linie q (weich, in 0,25 s), Tempo konstant
    S.qA += (S.q - S.qA) * Math.min(1, 10 * dt);
    S.s += S.vF * dt; S.weg += S.vF * dt; S.m = S.weg;
    z.punkte += S.vF * dt * c.punkteJeM;
    if (art === 'wand') z.wandM += S.vF * dt; else z.grindM += S.vF * dt;
    const w = weltPose(st, S.s, S.qA), boden = st.hoeheAn(w.x, w.z, fz.index);
    v.x = w.x; v.z = w.z; v.heading = R.headingAus(w.tx, w.tz); v.vLaengs = S.vF; v.vQuer = 0; v.neigung *= Math.exp(-3 * dt);
    fz.y = boden + S.h * glatt(S.weg / 3); fz.vy = (fz.y - fz.yVorher) / dt;
    fz.nicken *= Math.exp(-4 * dt);
    v.letzteSteuerung = { gas: (steuerung && steuerung.gas) || 0, bremse: 0, lenkung: lenk };
    v.untergrund = 'strasse';
    // Wegsteuern?
    if (lenk * S.side < -c.ausLenk && S.weg > 2) S.ausT += dt; else S.ausT = 0;
    const ende = sp.differenzS(S.s, S.s1) >= 0, weg = S.ausT >= c.ausSek;
    if (!ende && !weg) return null;
    // Austritt: kleiner Hüpfer, normaler Flug übernimmt (Landung auf der Fahrbahn)
    fz.schiene = null;
    fz.vy = c.hop; fz.t = 0; fz.sprungGemeldet = true; fz.fluege++;
    v.vQuer = 0;
    if (weg) { const lat = -S.side * 2.0, vx = w.tx * S.vF + w.nx * lat, vz = w.tz * S.vF + w.nz * lat; v.heading = R.headingAus(vx, vz); }
    z.letzter = { art, m: Math.round(S.weg), punkte: Math.round(z.punkte) };
    melden(fz, art === 'wand' ? 'wandEnde' : 'grindEnde');
    return null;
  }

  function pipeSchritt(fz, v, st, steuerung, dt) {
    const P = fz.pipe, e = P.e, c = pipeC(e), sp = st.spline, z = zz(fz), g = G();
    fz.t += dt; fz.yVorher = fz.y; fz.nickenVorher = fz.nicken;
    const lenk = klemme((steuerung && steuerung.lenkung) || 0, -1, 1);
    v.lenkung += (lenk - v.lenkung) * Math.min(1, 6 * dt);
    P.vF *= Math.exp(-c.reibung * (e.auto ? 1 - klemme((steuerung && steuerung.gas) || 0, 0, 1) : 1) * dt);   // R4: Auto – mit Gas bleibt das Tempo im Rohr (kein Steckenbleiben); Motorrad unverändert
    P.s += P.vF * dt;
    const a = P.s - e.s0, w = pipeW(e, a), re = Math.max(0.3, e.r * w);
    const aus = lenk * P.side;                                       // > 0: nach außen (zur Wand) lenken
    P.w += (-(g / re) * Math.sin(P.phi) + c.pumpe * aus / Math.max(1, re / 3)) * dt;
    P.phi += P.w * dt;
    const pt = sp.punktBei(P.s);
    if (P.phi <= 0 && P.w <= 0 || w <= 0.02) return pipeVerlassen(fz, v, st, P, pt, re, false);
    if (P.phi >= Math.PI / 2 - 0.02 && P.w > 0) return pipeVerlassen(fz, v, st, P, pt, re, true);
    const q = P.side * (e.qF + re * Math.sin(P.phi));
    const wp = weltPose(st, P.s, q), boden = st.hoeheAn(wp.x, wp.z, fz.index) - pipeProfil(e, P.s, q);   // Grundhöhe ohne Profil
    v.x = wp.x; v.z = wp.z; v.heading = R.headingAus(pt.tx, pt.tz); v.vLaengs = P.vF; v.vQuer = 0;
    fz.y = boden + re * (1 - Math.cos(P.phi)); fz.vy = (fz.y - fz.yVorher) / dt;
    fz.nicken *= Math.exp(-4 * dt); v.neigung = 0;
    v.letzteSteuerung = { gas: (steuerung && steuerung.gas) || 0, bremse: 0, lenkung: lenk };
    v.untergrund = 'strasse';
    P.hoch = Math.max(P.hoch || 0, re * (1 - Math.cos(P.phi)));
    z.pipeMax = Math.max(z.pipeMax || 0, P.hoch);
    return null;
  }
  function pipeVerlassen(fz, v, st, P, pt, re, luft) {
    const e = P.e, c = pipeC(e);
    if (luft) {
      // oben an der Kante: senkrecht hoch, leicht nach innen – der normale Flug (Tricks, Landung) übernimmt
      const q = P.side * (e.qF + re), lat = -P.side * c.hopInnen;
      const wp = weltPose(st, P.s, q), grund = st.hoeheAn(wp.x, wp.z, fz.index) - pipeProfil(e, P.s, q);
      const vx = pt.tx * P.vF + pt.nx * lat, vz = pt.tz * P.vF + pt.nz * lat;
      v.x = wp.x; v.z = wp.z; v.heading = R.headingAus(vx, vz); v.vLaengs = Math.hypot(vx, vz); v.vQuer = 0;
      fz.pipe = null; fz.vy = klemme(re * P.w, 2, c.vyMax); fz.y = grund + re; fz.yVorher = fz.y; fz.t = 0; fz.sprungGemeldet = false; fz.fluege++;
      melden(fz, 'pipeLuft');
      return null;
    }
    // zurück auf den Boden: die Querbewegung wird zur Fahrtrichtung nach innen
    const lat = -P.side * re * Math.abs(P.w), wp = weltPose(st, P.s, P.side * e.qF);
    const vx = pt.tx * P.vF + pt.nx * lat, vz = pt.tz * P.vF + pt.nz * lat;
    v.x = wp.x; v.z = wp.z; v.heading = R.headingAus(vx, vz); v.vLaengs = Math.hypot(vx, vz); v.vQuer = 0;
    fz.pipe = null;
    const boden = st.hoeheAn(v.x, v.z, fz.index), n = st.abfrage(v.x, v.z, fz.index);
    fz.aktiv = false; fz.y = boden; fz.vy = 0; fz.nicken = 0; v.imFlug = false; v.untergrund = n.untergrund;
    return null;
  }

  // Umhüllung: Flug-Ersatz (nach der S1-Umhüllung geladen → läuft zuerst), Landung in der Halfpipe wieder einfangen, Abbruch räumt auf
  const S0 = R.Schanzen;
  if (!S0._zauberHuelle) {
    S0._zauberHuelle = true;
    const flugSchritt = S0.flugSchritt, abbrechen = S0.abbrechen;
    S0.flugSchritt = function (fz, vehicle, strecke, steuerung, dt) {
      if (fz && fz.aktiv) {
        if (fz.gleit && strecke && strecke.spass) return gleitSchritt(fz, vehicle, strecke, steuerung, dt);
        if (fz.schiene && strecke && strecke.spass) return schieneSchritt(fz, vehicle, strecke, steuerung, dt);
        if (fz.pipe && strecke && strecke.spass) return pipeSchritt(fz, vehicle, strecke, steuerung, dt);
      }
      return flugSchritt.apply(this, arguments);
    };
    S0.abbrechen = function (fz, vehicle) {
      if (fz) {
        fz.gleit = null; fz.schiene = null; fz.pipe = null;
        if (fz.z) { if (fz.z.mag) fz.z.mag = null; }
      }
      return abbrechen.apply(this, arguments);
    };
  }

  // ---------------------------------------------------------------- Größe / Tempo (Riese, Mini), Magnet-Extra
  function groesseSetzen(v, z, faktor) {
    if (!z.orig) z.orig = { laenge: v.daten.laenge, breite: v.daten.breite };
    v.daten.laenge = z.orig.laenge * faktor; v.daten.breite = z.orig.breite * faktor;
    z.groesse = faktor;
    if (faktor === 1) z.orig = null;
  }
  function wirkungSetzen(f, art, zeit) {
    const fz = f.flug, v = f.vehicle, z = zz(fz), E = C().extras;
    if (art === 'riese') { z.riese = E.riese.zeit; z.mini = 0; groesseSetzen(v, z, E.riese.faktor); melden(fz, 'riese'); }
    else if (art === 'mini') { z.mini = E.mini.zeit; z.riese = 0; groesseSetzen(v, z, E.mini.faktor); melden(fz, 'mini'); }
    else if (art === 'magnet') { z.magItem = E.magnet.zeit; melden(fz, 'magnetExtra'); }
  }
  function zeitAblauf(f, dt) {
    const fz = f.flug, v = f.vehicle, z = fz.z;
    if (!z) return;
    if (z.riese > 0) { z.riese -= dt; if (z.riese <= 0) { z.riese = 0; groesseSetzen(v, z, 1); melden(fz, 'riesenEnde'); } }
    if (z.mini > 0) { z.mini -= dt; if (z.mini <= 0) { z.mini = 0; groesseSetzen(v, z, 1); melden(fz, 'riesenEnde'); } }
    if (z.magItem > 0) z.magItem = Math.max(0, z.magItem - dt);
    const E = C().extras;
    v._zF = z.riese > 0 ? E.riese : z.mini > 0 ? E.mini : null;
    v._zMini = z.mini > 0;
  }

  const V = R.Vehicle && R.Vehicle.prototype;
  if (V && !V._zauberSchritt) {
    V._zauberSchritt = true;
    const schritt = V.schritt;
    V.schritt = function () {
      const zf = this._zF;
      if (!zf) return schritt.apply(this, arguments);
      const dd = this.daten, vm = dd.vMax, be = dd.beschleunigung;
      dd.vMax = vm * zf.vMax; dd.beschleunigung = be * zf.besch;
      try { return schritt.apply(this, arguments); } finally { dd.vMax = vm; dd.beschleunigung = be; }
    };
  }
  // Mini passt unter niedrigen Hindernissen durch: für den Aufruf von Kollisionen.hindernisse zählt es als „im Flug“
  const K = R.Kollisionen;
  if (K && K.hindernisse && !K._zauberHuelle) {
    K._zauberHuelle = true;
    const hind = K.hindernisse;
    K.hindernisse = function (liste) {
      let tmp = null;
      if (liste) for (let i = 0; i < liste.length; i++) { const v = liste[i] && liste[i].vehicle; if (v && v._zMini && !v.imFlug) { (tmp || (tmp = [])).push(v); v.imFlug = true; } }
      try { return hind.apply(this, arguments); } finally { if (tmp) tmp.forEach((v) => { v.imFlug = false; }); }
    };
  }

  // ---------------------------------------------------------------- Spiel.physikSchritt (Browser + Server)
  const P = R.Spiel.prototype;
  // R4: nur Rennen, die der Spieler offline startet (streckeAufbauen), bauen Loopings als Magnet-Röhre – Online (streckeSzeneBauen direkt) und der Server bleiben klassisch (P5 folgt nach R2)
  if (!P._loopMagHuelle && P.streckeAufbauen) {
    P._loopMagHuelle = true;
    const aufbauen = P.streckeAufbauen;
    P.streckeAufbauen = function () {
      AN.bau = loopMag();
      try { return aufbauen.apply(this, arguments); } finally { AN.bau = false; }
    };
  }
  if (!P._zauberPhysik) {
    P._zauberPhysik = true;
    const orig = P.physikSchritt;
    P.physikSchritt = function (dt) {
      const st = this.strecke, za = zauberVon(st), fahr = this.fahrzeuge;
      if (!za || !fahr || !fahr.length || (this.zustand === 'online' && this.online)) return orig.apply(this, arguments);
      const vor = this._zauberVor || (this._zauberVor = []);
      for (let i = 0; i < fahr.length; i++) {
        const f = fahr[i], v = f.vehicle, fz = f.flug, lp = f.looping, e = vor[i] || (vor[i] = {});
        e.x = v.x; e.z = v.z; e.aus = !fz || fz.aktiv || !!(lp && (lp.aktiv || lp.fallen)) || !!v.verkehr;
        if (fz && fz.z) zeitAblauf(f, 0);
      }
      const r = orig.apply(this, arguments);
      const zeit = this._physikZeit || 0;
      const ex = this._zExtra || (this._zExtra = za.extras.map(() => ({ bis: 0 })));
      for (let i = 0; i < fahr.length; i++) {
        const f = fahr[i], e = vor[i], fz = f.flug, v = f.vehicle;
        if (!fz || !e) continue;
        if (fz.z) zeitAblauf(f, dt);
        if (!e.aus && !f.ausgeschieden && f.nah) nachSchritt(fz, v, st, f.nah, e.x, e.z, dt, { mensch: !!f.istSpieler });
        else if (fz.z && fz.z.mag && fz.aktiv) magnetAus(fz, fz.z, v);
        // Extras einsammeln
        if (za.extras.length && !f.ausgeschieden && !v.verkehr && !(fz.aktiv && !(fz.gleit || fz.schiene || fz.pipe))) {
          for (let k = 0; k < za.extras.length; k++) {
            const x = za.extras[k], s = ex[k];
            if (zeit < s.bis) continue;
            const dx = v.x - x.x, dz = v.z - x.z, rr = C().extras.radius + (v.daten.breite || 2) * 0.3;
            if (dx * dx + dz * dz <= rr * rr && Math.abs((v.y || 0) - x.y) < 4 && f.nah) {
              s.bis = zeit + C().extras.erneuerung; s.von = i;
              wirkungSetzen(f, x.art, 0);
              this._zauberExtra = { nr: k, wer: i, art: x.art };
            }
          }
        }
        const q = fz.spassE;                                    // Ereignisse leeren (falls spassPhysik.js sie bei Strecken ohne Trampolin/Kanone nicht abholt)
        if (q && q.length) { if (typeof this.spassEreignis === 'function') { while (q.length) this.spassEreignis(i, q.shift()); } else q.length = 0; }
        const z = fz.z;
        if (z && z.versatz) {
          const vs = z.versatz; z.versatz = null;
          this._zauberVersetzen(i, f, vs.s);
        }
      }
      // Riesen schieben andere sanft weg
      for (let i = 0; i < fahr.length; i++) {
        const f = fahr[i], fz = f.flug, z = fz && fz.z;
        if (!z || !(z.riese > 0) || f.ausgeschieden) continue;
        const A = f.vehicle, sch = C().extras.riese.schiebe;
        for (let j = 0; j < fahr.length; j++) {
          if (j === i) continue;
          const o = fahr[j], B = o.vehicle;
          if (o.ausgeschieden || B.imFlug || B.imLooping || B.verkehr || (o.flug && o.flug.aktiv)) continue;
          const dx = B.x - A.x, dz = B.z - A.z, d = Math.sqrt(dx * dx + dz * dz) || 0.001, rr = (A.daten.laenge + B.daten.laenge) * 0.5;
          if (d >= rr) continue;
          const m = Math.min((rr - d) * 0.3, sch);
          B.x += dx / d * m; B.z += dz / d * m;
          if (B.vLaengs > 3) B.vLaengs *= 0.998;
        }
      }
      return r;
    };
    /** Nach dem freundlichen Zurücksetzen (Schlucht verfehlt): Rennleitung und Fahrzeug-Zustand nachziehen. */
    P._zauberVersetzen = function (i, f, s) {
      const rn = this.rennen, t = rn && rn.teilnehmer && rn.teilnehmer[i];
      if (t && rn.strecke && !t.imZiel) rn.verfolgungSetzen(t, f.vehicle.x, f.vehicle.z, s);
      if (typeof this._vorherAngleichen === 'function') this._vorherAngleichen(f);
      f.index = -1;
      if (f.driver && f.driver.zurueckgesetzt) f.driver.zurueckgesetzt();
    };
  }

  R.SpassZauber = { an, anSetzen, erzwingen, loopMag, loopMagRoh, loopMagSetzen, plan, nachSchritt, magnetTheta, pipeProfil, pipeW, zustand, zz, wirkungSetzen, zeitAblauf, magnetAus, glatt, weltPose, zauberVon };
})();
