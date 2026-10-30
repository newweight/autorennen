// ============================================================
// Motorrad S8 – Schlamm, Wasser und Kistenstapel auch auf den normalen Strecken (nur Motorrad, nur mit „🎪 Spaß-Elemente“).
//
// Rechenteil (Browser offline, Vorhersage, Server – gleiche Datei, kein Math.random, keine Uhr):
//   Platzierung   Haken in R.Spass.plan (wie Tore/Zauber): strecke.spass.s8 = { felder: [{ art, s0, laenge, q0, q1 }], kisten: [{ s, q }] }.
//                 Sperrregeln wie S1/Z1: R.Spass.sperrZonen (Start/Ziel, Tunnel, Brücken, Kreuzungen, Looping, Schanzen, Boost, Schilde, Bälle, feste
//                 Hindernisse …) + alle schon vergebenen Spaß-Zonen (Trampolin, Kanone, Tore, Zauber); gerade Stellen (Krümmung); die eigenen Zonen kommen
//                 in strecke.spass.zonen, damit Zufalls-Hindernisse/Münzen (track/zufall.js) dort nichts hinlegen. Nie auf Stunt-Park, Mega, eigenen Strecken.
//   Wirkung       nach jedem Physikschritt (Spiel.physikSchritt umhüllt – läuft im Server genauso): Schlamm Tempo × e^(−1,15·dt), Wasser × e^(−0,4·dt);
//                 Kistenstapel: Treffer ab 3 m/s beim EINFAHREN in den Kreis (1,6 m) → Tempo × 0,93, + Stuntpunkte; der Zustand „drin“ gilt
//                 je FAHRER und ergibt sich aus der Position – so rechnen Server und Vorhersage ohne gemeinsamen Zeitzustand gleich. Ereignis (für die Anzeige) über spiel.s8Ereignis(i, k).
//   Vorhersage    R.Moto.s8.eigen(z, v, st, nah, dt) – gleiche Rechnung für den eigenen Wagen (src/net/vorhersage.js).
// Anzeige (nur Browser, braucht src/moto/motoM3Welt.js): Gruppe 'MotoS8' (Wl.bauen mit den S8-Daten), Kisten fliegen bei jedem Treffer (auch fremder
//   Fahrer online: Ereignis `kiste`), Spritzer aus den Partikeln von motoM3Effekte.js.
// ============================================================
(function () {
  if (window.MOTORRAD !== true) return;
  const R = window.Rennspiel;
  if (!R || !R.config || !R.Spass || !R.Spiel) return;
  if (R.Moto && R.Moto.s8) return;
  R.Moto = R.Moto || {};

  R.config.motoS8 = {
    feld: { schlamm: { bremse: 1.15, laenge: 26 }, wasser: { bremse: 0.4, laenge: 44, breite: 0.75, spritz: 80 } },   // FIX3: Wasser länger (44 statt 30 m), breiter (75 % der Fahrbahn), viel mehr Spritzer (je s)
    kisten: { radius: 1.6, minTempo: 3, punkte: 150, bremse: 0.93, proGruppe: 2 },
    platz: { feldJe: 1500, feldMax: 4, lockerung: [1, 1.7, 3, 6],   // FIX3: Krümmungs-Stufen der Suche (zuletzt sehr locker: Wasser soll auf JEDER Strecke vorkommen)
       kistenJe: 1700, kistenMax: 3, ab: 900, schritt: 6, abstand: 120, kappa: 1 / 150, abseits: 0.3 },
  };
  const C = () => R.config.motoS8;
  const klemme = (x, a, b) => (x < a ? a : x > b ? b : x);
  function hashText(t) { let h = 2166136261 >>> 0; for (let i = 0; i < t.length; i++) { h ^= t.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return h >>> 0; }

  // ---------------------------------------------------------------- Platzierung
  function planS8(st, sicht, zufallAn, erg) {
    const daten = st.daten || {};
    const id = String(daten.id || st.id || '');
    if (!st.spline || daten.mega || id === 'stuntpark' || daten.motoFelder || daten.motoKisten || /^eigen/.test(id)) return null;
    const sp = st.spline, L = sp.laenge, c = C(), P = c.platz, SP = R.config.spass.platz;
    if (L < P.ab) return null;
    const N = Math.max(8, Math.ceil(L / 4)), ds = L / N, kr = new Float32Array(N);
    for (let k = 0; k < N; k++) kr[k] = Math.abs(sp.punktBei(k * ds).kruemmung || 0);
    const kMax = (a, b) => { let i0 = Math.floor(a / ds), i1 = Math.ceil(b / ds), m = 0; if (i1 - i0 > N) { i0 = 0; i1 = N; } for (let i = i0; i <= i1; i++) { const x = kr[((i % N) + N) % N]; if (x > m) m = x; } return m; };
    const belegt = R.Spass.sperrZonen(st, sicht, !zufallAn).slice();
    (erg.zonen || []).forEach((z) => { const len = sp.wrapS(z.s1 - z.s0); belegt.push({ c: z.s0 + len / 2, h: len / 2 }); });
    const frei = (a, b) => { const c0 = (a + b) / 2, h0 = (b - a) / 2; for (let k = 0; k < belegt.length; k++) if (Math.abs(sp.differenzS(c0, belegt[k].c)) < h0 + belegt[k].h) return false; return true; };
    const seed = hashText(id + '|' + (st.variante || '') + '|s8');
    const von = SP.startFrei, bis = L - SP.zielFrei, laenge = bis - von, phase = (seed % 89) / 89 * P.schritt;
    const breite = st.breite || 12, halb = breite / 2;
    const nF = klemme(Math.round(L / P.feldJe), 1, P.feldMax), nK = klemme(Math.round(L / P.kistenJe), 1, P.kistenMax), n = nF + nK;
    const gesetzt = [];
    // Je Element ein eigener Abschnitt der Runde (Schlamm/Wasser und Kisten im Wechsel), gelockerte Krümmungs-Stufen
    function suche(i, vor, nach, r0, r1) {
      const a0 = r0 !== undefined ? r0 : von + laenge * i / n, a1 = r1 !== undefined ? r1 : von + laenge * (i + 1) / n;
      for (const fr of P.lockerung) {
        let beste = null;
        for (let s = Math.round(a0 + phase); s <= a1 - (vor + nach) * 0.25; s += P.schritt) {
          const sa = s - vor, sb = s + nach;
          if (sa < von - 20 || sb > bis + 20) continue;
          if (!frei(sa, sb)) continue;
          if (gesetzt.some((z) => Math.abs(sp.differenzS((sa + sb) / 2, (z.s0 + z.s1) / 2)) < (sb - sa) / 2 + (z.s1 - z.s0) / 2 + P.abstand)) continue;
          const k = kMax(sa, sb);
          if (k >= fr * P.kappa) continue;
          if (!beste || k < beste.k - 1e-9) beste = { s, k };
        }
        if (beste) return beste.s;
      }
      return null;
    }
    const felder = [], kisten = [], zonen = [];
    let nrF = 0, nrK = 0;
    for (let i = 0; i < n; i++) {
      const istKisten = nrK < nK && (i % 2 === 1 || nrF >= nF);       // Schlamm/Wasser und Kisten im Wechsel
      if (!istKisten && nrF >= nF) continue;
      if (istKisten) {
        const s = suche(i, 14, 14);
        if (s === null) continue;
        const a = klemme(halb * 0.5, 1.5, halb - 1.2), links = ((seed >> (i & 7)) & 1) === 1 ? -1 : 1;
        kisten.push({ s, q: -a * links }, { s: s + 3, q: a * links }); nrK++;
        gesetzt.push({ s0: s - 14, s1: s + 17 }); zonen.push({ s0: s - 16, s1: s + 19 });
      } else {
        const art = nrF % 2 === 0 ? 'wasser' : 'schlamm';   // FIX3: das erste Feld ist immer Wasser (Wunsch des Vaters)
        const s = suche(i, 32, c.feld[art].laenge + 12);
        if (s === null) continue;
        feldSetzen(art, s);
      }
    }
    // FIX3: Wasser auf JEDER Strecke: fand der eigene Abschnitt keine Stelle, wird die ganze Runde abgesucht (auch statt eines nicht platzierten Schlamms)
    if (!felder.some((f) => f.art === 'wasser')) { const s = suche(-1, 32, c.feld.wasser.laenge + 12, von, bis); if (s !== null) feldSetzen('wasser', s); }
    function feldSetzen(art, s) {
      const len = c.feld[art].laenge;
      const seite = (nrF + (seed & 1)) % 2 === 0 ? 1 : -1;      // die Seite wechselt: man kann ausweichen
      const br = Math.min((art === 'wasser' ? c.feld.wasser.breite : 0.7) * breite, breite - 1.2);      // Breite des Feldes in m (Wasser 75 % der Fahrbahn); der Rest bleibt zum Ausweichen
      const q0 = seite > 0 ? -halb + 0.6 : halb - 0.6 - br, q1 = q0 + br;
      felder.push({ art, s0: s, laenge: len, q0: Math.round(q0 * 100) / 100, q1: Math.round(q1 * 100) / 100 });
      gesetzt.push({ s0: s - 32, s1: s + len + 12 }); zonen.push({ s0: s - 34, s1: s + len + 14 });
      nrF++;
    }
    if (!felder.length && !kisten.length) return null;
    zonen.forEach((z) => erg.zonen.push(z));
    return { felder, kisten };
  }
  const planOrig = R.Spass.plan;
  R.Spass.plan = function (st, sicht, zufallAn) {
    const erg = planOrig.apply(this, arguments);
    try { erg.s8 = planS8(st, sicht, zufallAn, erg); } catch (e) { erg.s8 = null; }
    return erg;
  };

  // ---------------------------------------------------------------- Rechnen
  function daten(st) { return st && st.spass && st.spass.s8 || null; }
  function stapel(st) {
    const s8 = daten(st);
    if (!s8 || !s8.kisten.length) return [];
    if (s8._stapel) return s8._stapel;
    const sp = st.spline;
    return (s8._stapel = s8.kisten.map((k, nr) => { const p = sp.punktBei(k.s); return { nr, x: p.x + p.nx * k.q, z: p.z + p.nz * k.q }; }));
  }
  function feldBei(st, s, q) {
    const s8 = daten(st), sp = st.spline;
    if (!s8) return null;
    for (let i = 0; i < s8.felder.length; i++) {
      const f = s8.felder[i], a = sp.differenzS(s, f.s0);
      if (a >= 0 && a <= f.laenge && q >= f.q0 && q <= f.q1) return f;
    }
    return null;
  }
  /** Zustand je Fahrer: liegt er gerade im Trefferkreis eines Stapels? (Treffer nur beim EINFAHREN – ohne Zeit, damit die Vorhersage nach jedem Abgleich dasselbe rechnet.) */
  function zNeu() { return { drin: [] }; }
  /** Zustand aus der Position setzen (Vorhersage nach dem Abgleich mit dem Server-Zustand). */
  function drinSetzen(z, v, st) {
    const sl = stapel(st), r2 = C().kisten.radius * C().kisten.radius;
    for (let k = 0; k < sl.length; k++) { const dx = v.x - sl[k].x, dz = v.z - sl[k].z; z.drin[k] = dx * dx + dz * dz <= r2; }
  }
  /**
   * Ein Schritt für einen Wagen: Schlamm/Wasser bremsen, Kistenstapel zerlegen. Gibt die Nummer des getroffenen Stapels zurück (oder −1).
   * luft = im Flug höher als 1,6 m (Kisten werden überflogen).
   */
  function eigen(z, v, st, nah, dt, luft) {
    const s8 = daten(st);
    if (!s8 || !(dt > 0) || !nah) return -1;
    const c = C();
    if (s8.felder.length && !v.imFlug && !v.imLooping) {
      const f = feldBei(st, nah.s, nah.seitenabstand);
      if (f) v.vLaengs *= Math.exp(-c.feld[f.art].bremse * dt);
    }
    const tempo = Math.abs(v.vLaengs), sl = stapel(st), r2 = c.kisten.radius * c.kisten.radius;
    let treffer = -1;
    for (let k = 0; k < sl.length; k++) {
      const dx = v.x - sl[k].x, dz = v.z - sl[k].z, drin = dx * dx + dz * dz <= r2;
      if (drin && !z.drin[k] && !luft && tempo >= c.kisten.minTempo && treffer < 0) { v.vLaengs *= c.kisten.bremse; treffer = k; }
      z.drin[k] = drin;
    }
    return treffer;
  }

  const P = R.Spiel.prototype;
  const physikOrig = P.physikSchritt;
  P.physikSchritt = function (dt) {
    const r = physikOrig.apply(this, arguments);
    const st = this.strecke;
    if (!daten(st) || !(dt > 0) || this.pausiert || this.online || !this.fahrzeuge) return r;
    const St = R.Moto.stunts;
    for (let i = 0; i < this.fahrzeuge.length; i++) {
      const f = this.fahrzeuge[i], v = f && f.vehicle;
      if (!f || !v || f.ausgeschieden || f.polizei || f.verkehr || !f.nah) continue;
      const fl = f.flug, luft = !!(fl && fl.aktiv && fl.y - st.hoeheAn(v.x, v.z) > 1.6);
      const k = eigen(f.s8 || (f.s8 = zNeu()), v, st, f.nah, dt, luft);
      if (k >= 0) {
        const sz = this.stunt, zz = sz && sz.fz && sz.fz[i];
        if (zz && St && St.vergeben) St.vergeben(zz, 'kisten', 'Kisten!', C().kisten.punkte, sz.zeit);
        if (typeof this.s8Ereignis === 'function') this.s8Ereignis(i, k);
      }
    }
    return r;
  };

  R.Moto.s8 = { planS8, daten, stapel, feldBei, zNeu, drinSetzen, eigen };

  // ---------------------------------------------------------------- Anzeige (Browser)
  const Wl = R.Moto.m3welt, FX = R.Moto.m3fx;
  if (typeof THREE === 'undefined' || !Wl || !Wl.bauen) return;
  const SPRITZ = { schlamm: [0x6b4423, 0x7a5230, 0x4f3118], wasser: [0x7fc8ff, 0xdff3ff, 0x4fb0ff] };
  function loesen(g) {
    if (!g) return;
    if (g.parent) g.parent.remove(g);
    g.traverse((x) => { if (x.geometry) x.geometry.dispose(); if (x.material) { if (x.material.map) x.material.map.dispose(); x.material.dispose(); } if (x.isInstancedMesh && x.dispose) x.dispose(); });
  }
  const szeneOrig = P.streckeSzeneBauen;
  P.streckeSzeneBauen = function () {
    const r = szeneOrig.apply(this, arguments);
    try {
      loesen(this.motoS8Gruppe); this.motoS8Gruppe = null;
      const s8 = this.strecke && daten(this.strecke);
      if (s8 && this.szene) {
        const falsch = Object.create(this.strecke, {
          daten: { value: { motoFelder: s8.felder.map((f) => ({ art: f.art, s: f.s0, laenge: f.laenge, q0: f.q0, q1: f.q1 })), motoKisten: s8.kisten.map((k) => ({ s: k.s, q: k.q })) } },
        });
        const g = Wl.bauen(falsch);
        if (g) { g.name = 'MotoS8'; this.szene.add(g); this.motoS8Gruppe = g; }
      }
    } catch (e) { console.error('Motorrad S8 (Szene):', e); }
    return r;
  };
  /** Kistenstapel k fliegt weg (Treffer von Fahrer i; offline aus der Physik, online aus dem Ereignis `kiste`). */
  function kisteAnzeigen(spiel, i, k) {
    const g = spiel.motoS8Gruppe, K = g && g.userData.kisten, f = spiel.fahrzeuge[i], v = f && f.vehicle;
    if (!K || !v || !K.zust[k] || !K.zust[k].steht) return;
    const r = v.richtung();
    Wl.kistenWegschleudern(K.stapel, K.zust, k, { x: r.x, z: r.z }, Math.max(3, Math.abs(v.vLaengs)));
    if (f.istSpieler && R.Audio && R.Audio.bande) { try { R.Audio.bande(0.5); } catch (e) { /* Ton egal */ } }
  }
  const s8Alt = P.s8Ereignis;
  P.s8Ereignis = function (i, k) { if (s8Alt) s8Alt.apply(this, arguments); try { kisteAnzeigen(this, i, k); } catch (e) { /* nur Optik */ } };
  R.Moto.s8.kisteAnzeigen = kisteAnzeigen;

  const spritzRest = [];
  function bildS8(spiel, dt) {
    const g = spiel.motoS8Gruppe;
    if (!g) return;
    if (dt > 0) Wl.animieren(g, dt);
    const fxg = spiel.motoFxGruppe && spiel.motoFxGruppe.userData.fx, st = spiel.strecke;
    if (!fxg || !FX || !(dt > 0) || !spiel.fahrzeuge) return;
    const nT = spiel.online ? spiel.online.nT : spiel.fahrzeuge.length;
    for (let i = 0; i < nT; i++) {
      const f = spiel.fahrzeuge[i], v = f && f.vehicle;
      if (!f || !v || !f.nah || v.imFlug) continue;
      const tempo = Math.abs(v.vLaengs);
      if (tempo <= 2) continue;
      const fd = feldBei(st, f.nah.s, f.nah.seitenabstand);
      if (!fd) continue;
      const art = fd.art, ri = v.richtung(), boden = st.hoeheAn(v.x, v.z);
      spritzRest[i] = (spritzRest[i] || 0) + (art === 'wasser' ? 30 : 26) * Math.min(1, tempo / 12) * dt;
      const n = Math.floor(spritzRest[i]); spritzRest[i] -= n;
      if (n > 0) { const q = v.rechts(); FX.spritzSpawn(fxg.spritzer, n, v.x - ri.x * 0.6, boden, v.z - ri.z * 0.6, q.x, q.z, SPRITZ[art]); }
    }
  }
  if (R.dach && typeof R.dach.frame === 'function') {
    const frame = R.dach.frame;
    R.dach.frame = function (spiel, dt) {
      const r = frame.apply(this, arguments);
      try { bildS8(spiel, dt); } catch (e) { console.error('Motorrad S8 (Bild):', e); }
      return r;
    };
  }
  R.Moto.s8.bildS8 = bildS8;
})();
