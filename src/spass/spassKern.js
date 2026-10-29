// ============================================================
// Spaß-Paket S1 – Rechenkern: Trampolin und Kanone (Auto UND Motorrad, auch im Server geladen; kein Three.js, keine Zeit, kein Math.random).
//
//   R.Spass.plan(strecke, sicht)           Platzierung (rein aus der Streckengeometrie): strecke.spass = { liste, zonen } – feste Elemente, nie verschoben.
//                                          Nur mit Strecken-Option { spass: true } (trackBuilder.js ruft plan auf). Ohne Option: strecke.spass = null → nichts davon läuft
//                                          („aus“ = bitgleich der alte Stand).
//   R.Spass.nachSchritt(fz, v, st, nah, xAlt, zAlt, dt)   nach dem normalen Fahrschritt: Trampolin-Absprung / Einfahrt in die Kanone erkennen.
//                                          Liefert 'trampolin' | 'kanone' | null. Gleicher Aufruf in main.js (Umhüllung in spassStart.js), im Server und in der Vorhersage.
//   R.Schanzen.flugSchritt / abbrechen     umhüllt: ist fz.kanone gesetzt, läuft statt der Ballistik die feste Kanonen-Bahn (Einziehen → Countdown → Schuss).
//
// Trampolin: ein Sprung (fz.aktiv, fz.vy = config.spass.trampolin.vy) – der normale Flug von schanze.js übernimmt (Lenkung 20 %, Landung, Tricks beim Motorrad).
// Kanone:   Fahrzeug fährt in die Röhre → wird zur Mündung gezogen (einziehen s) → Countdown 3-2-1 (countdown s) → Rumms: feste Bahn von der Mündung zu einem
//           Streckenpunkt `weite` m weiter (Bogen mit Scheitelhöhe, Mitte der Fahrbahn) in flugZeit s → Landung exakt auf der Fahrbahn, Tempo landeTempo.
//           Die Bahn folgt der Mittellinie (Spline) – auch in leichten Kurven sicher auf der Straße; nie durch Tunnel/Brücken (Sperrzonen bei der Platzierung).
// Ereignisse je Fahrzeug: fz.spassE (Liste von Namen, höchstens 12) – spassStart.js leert sie (Ton, Konfetti, Sticker); Server/Vorhersage ignorieren sie.
// Alles Ganzzahl-/Gleitkomma-deterministisch aus Position, Zeit im Flug und fester Konfiguration → Server = Client.
// ============================================================
(function () {
  const R = window.Rennspiel;
  if (!R || !R.config) return;

  R.config.spass = {
    standardAn: true,             // Menü „Spaß-Elemente“ (🎪), Standard an
    geistStandardAn: true,        // Menü „Geist“ (👻), Standard an
    trampolin: {
      vy: 9.0,                    // m/s Abfluggeschwindigkeit nach oben (Flugzeit ≈ 1,8 s, Höhe ≈ 4 m)
      vMin: 3,                    // m/s: langsamer löst nichts aus
      vMax: 46,                   // m/s: schneller wird auf diesen Wert gebremst (Flugweite < 85 m)
      laenge: 8, halbBreite: 4.8, // m (Matte); halbe Breite höchstens Straßenbreite/2 − 0,8
      gerade: { vor: 12, nach: 110, kappa: 1 / 250 },   // freie, gerade Strecke davor/dahinter (m) und größte Krümmung dort
    },
    kanone: {
      laenge: 9, halbBreite: 3.0, // m (Röhre) / Einfahrt-Breite beidseits der Mittellinie
      einziehen: 0.4,             // s: Fahrzeug wird zur Mündung gezogen
      countdown: 1.2,             // s: 3 … 2 … 1 (je 0,4 s), dann Rumms
      flugZeit: 2.4,              // s Schuss
      weite: 110,                 // m Bogenlänge von der Mündung bis zur Landung
      scheitel: 7,                // m Höhe über der Linie Mündung-Landung
      innenHoehe: 1.6,            // m: Fahrzeug sitzt so hoch in der Röhre
      landeTempo: 0.75,           // × Höchsttempo des Fahrzeugs (höchstens weite/flugZeit)
      gerade: { vor: 15, nach: 30, kappaRohr: 1 / 400, kappaBahn: 1 / 200 },
    },
    // Platzierung: je Streckenlänge so viele Elemente (jeweils mindestens 1, höchstens …)
    platz: { trampolinJe: 1500, trampolinMax: 3, kanoneJe: 3800, kanoneMax: 2, kanoneAbLaenge: 1300, schritt: 6, startFrei: 200, zielFrei: 180, abstand: 150 },
  };
  function C() { return R.config.spass; }
  const klemme = (x, a, b) => (x < a ? a : x > b ? b : x);
  const glatt = (u) => u * u * (3 - 2 * u);

  // ---------------------------------------------------------------- Platzierung
  function hashText(t) { let h = 2166136261 >>> 0; for (let i = 0; i < t.length; i++) { h ^= t.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return h >>> 0; }

  /**
   * Sperr-Intervalle (Mitte c, halbe Länge h) rund um alles, was nicht überflogen/überfahren werden soll – wie festeZonen in track/zufall.js, etwas großzügiger.
   */
  function sperrZonen(st, sicht, mitHindernissen) {
    const sp = st.spline, belegt = [];
    const zone = (s0, s1, vor, nach) => { const len = sp.wrapS(s1 - s0); belegt.push({ c: s0 + (len + nach - vor) / 2, h: (len + vor + nach) / 2 }); };
    const punkt = (s, vor, nach) => belegt.push({ c: s + (nach - vor) / 2, h: (vor + nach) / 2 });
    const P = C().platz;
    punkt(0, P.zielFrei, P.startFrei);                // Start/Ziel
    (st.tunnel || []).forEach((t) => zone(t.s0, t.s1, 25, 25));
    (st.bruecken || []).forEach((b) => zone(b.s0, b.s1, 25, 25));
    (st.ueberfuehrungen || []).forEach((u) => { zone(u.s0, u.s1, 25, 25); if (u.unten) zone(u.unten.s0, u.unten.s1, 25, 25); });
    (st.kreuzungen || []).forEach((k) => { zone(k.a.s0, k.a.s1, 25, 25); zone(k.b.s0, k.b.s1, 25, 25); });
    (st.loopings || []).forEach((l) => zone(l.s0, l.s1, 100, 35));
    (st.gabelungen || []).forEach((g) => zone(g.s0, g.s1, 25, 25));
    (st.spuren || []).forEach((e) => { if (e.breite < st.breite) zone(e.s0, e.s1, 45, 45); });
    (st.schanzen || []).forEach((e) => zone(e.s, e.s + (e.laenge || 10), (e.anlauf || 0) + 75, 85));
    (st.boostFelder || []).forEach((e) => zone(e.s, e.s + (e.laenge || 12), 25, 25));
    (st.schilde || []).forEach((e) => punkt(e.s, 25, 25));
    ((sicht && sicht.baelle) || st.baelle || []).forEach((e) => punkt(e.s, 25, 25));
    ((sicht && sicht.wasserstrahlen) || st.wasserstrahlen || []).forEach((e) => punkt(e.s, 25, 25));
    ((sicht && sicht.kleber) || []).forEach((e) => zone(e.s0, e.s1, 25, 25));
    const kat = st.katalog || st.daten || {};
    (kat.meteoriten || []).forEach((e) => punkt(e.s, 70, 50));
    (kat.motoZonen || []).forEach((e) => zone(e.s0, e.s1, 25, 25));
    if (kat.boxen && typeof kat.boxen.s0 === 'number') zone(Math.min(kat.boxen.s0, kat.boxen.s1), Math.max(kat.boxen.s0, kat.boxen.s1), 30, 30);
    // feste Katalog-Hindernisse nur bei „Zufällige Strecke: aus“ (mit Z1 räumt track/zufall.js ohnehin um die Elemente herum: festeZonen)
    if (mitHindernissen) {
      (st.hindernisse || []).forEach((e) => punkt(e.s, 20, 20 + (e.laenge || 0)));
      (st.wracks || []).forEach((e) => punkt(e.s, 25, 25));
      (st.strohballen || []).forEach((e) => punkt(e.s, 25, 25));
      (st.dinos || []).forEach((e) => punkt(e.s, 30, 30));
      (kat.tiere || []).forEach((e) => punkt(e.s, 25, 25));
    }
    return belegt;
  }

  /** Elemente platzieren. Rein aus der Geometrie (Spline, Krümmung, Sperrzonen) und der Strecken-ID; stuntpark/Megastrecke: keine. */
  function plan(st, sicht, zufallAn) {
    const leer = { liste: [], zonen: [], trampoline: 0, kanonen: 0 };
    const daten = st.daten || {};
    if (!st.spline || daten.mega || daten.id === 'stuntpark' || daten.motoFelder || daten.motoKisten) return leer;
    const sp = st.spline, L = sp.laenge, c = C(), P = c.platz, T = c.trampolin, K = c.kanone;
    // Krümmung alle 4 m
    const N = Math.max(8, Math.ceil(L / 4)), ds = L / N, kr = new Float32Array(N);
    for (let k = 0; k < N; k++) kr[k] = Math.abs(sp.punktBei(k * ds).kruemmung || 0);
    const kMax = (a, b) => {
      let i0 = Math.floor(a / ds), i1 = Math.ceil(b / ds), m = 0;
      if (i1 - i0 > N) { i0 = 0; i1 = N; }
      for (let i = i0; i <= i1; i++) { const x = kr[((i % N) + N) % N]; if (x > m) m = x; }
      return m;
    };
    const belegt = sperrZonen(st, sicht, !zufallAn);
    const frei = (a, b) => {                       // Intervall [a, b] (Bogenlänge, b > a) frei von allen Sperrzonen?
      const c0 = (a + b) / 2, h0 = (b - a) / 2;
      for (let k = 0; k < belegt.length; k++) if (Math.abs(sp.differenzS(c0, belegt[k].c)) < h0 + belegt[k].h) return false;
      return true;
    };
    const liste = [], zonen = [];
    const seed = hashText(String(daten.id || st.id || '') + '|' + (st.variante || '') + '|spass');
    const nK = L >= P.kanoneAbLaenge ? klemme(Math.round(L / P.kanoneJe), 1, P.kanoneMax) : 0;
    const nT = klemme(Math.round(L / P.trampolinJe), 1, P.trampolinMax);
    const breite = st.breite || 12;
    // Suche je Element in einem eigenen Abschnitt der Runde; gelockerte Krümmungs-Stufen, bester (kleinste Krümmung) gewinnt
    function suche(art, i, n, vor, nach, stufen) {
      const von = P.startFrei, bis = L - P.zielFrei, laenge = bis - von;
      const a0 = von + laenge * i / n, a1 = von + laenge * (i + 1) / n;
      const phase = (seed % 97) / 97 * P.schritt;
      for (let stufe = 0; stufe < stufen.length; stufe++) {
        let beste = null;
        for (let s = Math.round(a0 + phase); s <= a1 - (vor + nach) * 0.25; s += P.schritt) {
          const sa = s - vor, sb = s + nach;
          if (sa < von - 20 || sb > bis + 20) continue;
          if (!frei(sa, sb)) continue;
          // Abstand zu bereits gesetzten Elementen
          let nah = false;
          for (const z of zonen) if (Math.abs(sp.differenzS((sa + sb) / 2, (z.s0 + z.s1) / 2)) < (sb - sa) / 2 + (z.s1 - z.s0) / 2 + P.abstand) { nah = true; break; }
          if (nah) continue;
          const kr1 = stufen[stufe](s);
          if (kr1 === null) continue;
          if (!beste || kr1 < beste.k - 1e-9) beste = { s, k: kr1 };
        }
        if (beste) return beste.s;
      }
      return null;
    }
    // Kanonen zuerst (brauchen mehr Platz)
    for (let i = 0; i < nK; i++) {
      const sLandRel = K.laenge + K.weite;
      const stufen = [[1, 1], [1.6, 2], [2.7, 3.5], [4, 5]].map(([fr, fb]) => (s) => {
        const kr = kMax(s - K.gerade.vor, s + K.laenge), kb = kMax(s + K.laenge, s + sLandRel + 10);
        return kr < fr * K.gerade.kappaRohr && kb < fb * K.gerade.kappaBahn ? kr + kb : null;
      });
      const s = suche('kanone', i, nK, K.gerade.vor, sLandRel + K.gerade.nach, stufen);
      if (s === null) continue;
      const nr = liste.length;
      liste.push({ nr, art: 'kanone', s0: s, laenge: K.laenge, halb: K.halbBreite, qc: 0, sT: s + 1.5, sMund: s + K.laenge - 1.2, sLand: s + K.laenge - 1.2 + K.weite });
      zonen.push({ s0: s - K.gerade.vor, s1: s + sLandRel + K.gerade.nach });
    }
    for (let i = 0; i < nT; i++) {
      const G = T.gerade;
      const stufen = [1, 1.7, 3].map((fr) => (s) => { const k = kMax(s - G.vor, s + T.laenge + G.nach); return k < fr * G.kappa ? k : null; });
      const s = suche('trampolin', i, nT, G.vor, T.laenge + G.nach, stufen);
      if (s === null) continue;
      const nr = liste.length;
      liste.push({ nr, art: 'trampolin', s0: s, laenge: T.laenge, halb: Math.min(T.halbBreite, breite / 2 - 0.8), sT: s + T.laenge / 2 });
      zonen.push({ s0: s - G.vor, s1: s + T.laenge + G.nach });
    }
    liste.sort((a, b) => a.s0 - b.s0);
    liste.forEach((e, i) => { e.nr = i; });
    return { liste, zonen, trampoline: liste.filter((e) => e.art === 'trampolin').length, kanonen: liste.filter((e) => e.art === 'kanone').length };
  }

  // ---------------------------------------------------------------- Auslösen (nach dem Fahrschritt)
  function melden(fz, name) {
    const q = fz.spassE || (fz.spassE = []);
    q.push(name);
    if (q.length > 12) q.shift();
  }

  function trampolinStart(fz, v, st, nah, e) {
    const c = C().trampolin;
    fz.index = nah.index;
    fz.vy = c.vy; fz.y = st.hoeheAn(v.x, v.z, fz.index); fz.yVorher = fz.y; fz.t = 0; fz.aktiv = true; fz.rampe = null; fz.rampenH = 0;
    fz.startX = v.x; fz.startZ = v.z; fz.sprungGemeldet = false; fz.fluege++; fz.nicken = 0; fz.nickenVorher = 0;
    if (v.vLaengs > c.vMax) v.vLaengs = c.vMax;
    v.imFlug = true;
    fz.trampolin = 1;
    melden(fz, 'trampolin');
    return 'trampolin';
  }

  function kanoneStart(fz, v, st, nah, e, q) {
    const c = C().kanone, sp = st.spline;
    fz.index = nah.index;
    const pM = sp.punktBei(e.sMund), pL = sp.punktBei(e.sLand);
    const xL = pL.x + pL.nx * e.qc, zL = pL.z + pL.nz * e.qc;
    const y0 = st.hoeheAn(v.x, v.z, fz.index);
    fz.kanone = {
      nr: e.nr, t: 0, ticks: 0, vor: false,
      x0: v.x, z0: v.z, y0, h0: v.heading,
      sMund: e.sMund, qMund: e.qc, sLand: e.sLand, qLand: e.qc,
      yMund: st.hoeheAn(pM.x + pM.nx * e.qc, pM.z + pM.nz * e.qc, fz.index) + c.innenHoehe,
      yLand: st.hoeheAn(xL, zL, fz.index),
    };
    fz.aktiv = true; fz.rampe = null; fz.rampenH = 0; fz.vy = 0; fz.y = y0; fz.yVorher = y0; fz.t = 0; fz.sprungGemeldet = true;
    fz.startX = v.x; fz.startZ = v.z; fz.fluege++; fz.nicken = 0; fz.nickenVorher = 0;
    v.vLaengs = 0; v.vQuer = 0;
    v.imFlug = true;
    melden(fz, 'kanoneEin');
    return 'kanone';
  }

  /**
   * Nach dem normalen Fahrschritt (nah = Abfrage VOR dem Schritt, xAlt/zAlt = Position davor – wie R.Schanzen.nachSchritt).
   * Nur am Boden (nicht im Flug/Looping). Löst aus, wenn die Auslöselinie eines Elements vorwärts innerhalb der Breite überquert wird.
   */
  function nachSchritt(fz, v, st, nah, xAlt, zAlt, dt) {
    const sa = st && st.spass;
    if (!sa || !sa.liste.length || !fz || fz.aktiv || v.imLooping || !nah) return null;
    const sp = st.spline, pt = sp.punktBei(nah.s), dx = v.x - xAlt, dz = v.z - zAlt;
    const sAlt = nah.s, sNeu = sAlt + dx * pt.tx + dz * pt.tz, q = nah.seitenabstand + dx * pt.nx + dz * pt.nz;
    const c = C();
    for (let i = 0; i < sa.liste.length; i++) {
      const e = sa.liste[i];
      const aA = sp.differenzS(sAlt, e.sT), aN = sp.differenzS(sNeu, e.sT);
      if (!(aA < 0 && aN >= 0 && aN < 20)) continue;
      if (Math.abs(q - (e.qc || 0)) > e.halb) continue;
      if (e.art === 'trampolin') {
        if (!(v.vLaengs >= c.trampolin.vMin)) continue;
        return trampolinStart(fz, v, st, nah, e);
      }
      if (!(v.vLaengs >= 2)) continue;
      return kanoneStart(fz, v, st, nah, e, q);
    }
    return null;
  }

  // ---------------------------------------------------------------- Kanonen-Flug (ersetzt flugSchritt, solange fz.kanone gesetzt ist)
  function kanoneSchritt(fz, v, st, steuerung, dt) {
    const K = fz.kanone, c = C().kanone, sp = st.spline;
    K.t += dt; fz.t += dt; fz.yVorher = fz.y; fz.nickenVorher = fz.nicken;
    const tE = c.einziehen, tC = tE + c.countdown, tF = tC + c.flugZeit;
    let x, z, y, heading, ereignis = null;
    v.lenkung = 0; v.vQuer = 0; v.neigung *= 0.9;
    v.letzteSteuerung = { gas: 0, bremse: 0, lenkung: 0 };
    v.untergrund = 'strasse';
    const pM = sp.punktBei(K.sMund), xM = pM.x + pM.nx * K.qMund, zM = pM.z + pM.nz * K.qMund, hM = R.headingAus(pM.tx, pM.tz);
    if (K.t < tE) {                                     // hineingezogen
      const u = glatt(klemme(K.t / tE, 0, 1));
      x = K.x0 + (xM - K.x0) * u; z = K.z0 + (zM - K.z0) * u; y = K.y0 + (K.yMund - K.y0) * u;
      heading = K.h0 + R.Vehicle.winkelDiff(hM, K.h0) * u;
      v.vLaengs = 0;
    } else if (K.t < tC) {                              // Countdown 3 – 2 – 1
      x = xM; z = zM; y = K.yMund; heading = hM; v.vLaengs = 0;
      const tick = Math.min(2, Math.floor((K.t - tE) / (c.countdown / 3)));
      if (tick >= K.ticks) { K.ticks = tick + 1; melden(fz, 'kanone' + (3 - tick)); }
    } else {                                            // Schuss
      if (!K.vor) { K.vor = true; melden(fz, 'kanoneBumm'); }
      const u = klemme((K.t - tC) / c.flugZeit, 0, 1);
      const s = K.sMund + (K.sLand - K.sMund) * u, qq = K.qMund + (K.qLand - K.qMund) * u;
      const p = sp.punktBei(s);
      x = p.x + p.nx * qq; z = p.z + p.nz * qq;
      y = K.yMund + (K.yLand - K.yMund) * u + 4 * c.scheitel * u * (1 - u);
      heading = R.headingAus(p.tx, p.tz);
      v.vLaengs = (K.sLand - K.sMund) / c.flugZeit;
      if (K.t >= tF) return kanoneLanden(fz, v, st, x, z, heading);
    }
    v.x = x; v.z = z; v.heading = heading; fz.y = y;
    fz.vy = (y - fz.yVorher) / dt;
    const zielN = K.t < tC ? 0 : klemme(Math.atan2(fz.vy, Math.max(8, v.vLaengs)), -0.5, 0.5);
    fz.nicken += (zielN - fz.nicken) * Math.min(1, 6 * dt);
    return ereignis;
  }

  function kanoneLanden(fz, v, st, x, z, heading) {
    const K = fz.kanone, c = C().kanone;
    v.x = x; v.z = z; v.heading = heading;
    const n = st.abfrage(x, z, fz.index), boden = st.hoeheAn(x, z, fz.index);
    const vMax = (v.daten && v.daten.vMax) || 40;
    fz.tempoVorLandung = v.vLaengs;
    v.vLaengs = Math.min((K.sLand - K.sMund) / c.flugZeit, Math.max(12, c.landeTempo * vMax));
    v.vQuer = 0;
    fz.landeStaerke = 3; fz.letzteFlugzeit = fz.t; fz.maxFlugzeit = Math.max(fz.maxFlugzeit || 0, fz.t);
    fz.letzteWeite = K.sLand - K.sMund;
    fz.letzteLandung = { sauber: true, aufStrasse: true, winkel: 0, seitenabstand: n.seitenabstand, s: n.s };
    fz.landungen++;
    fz.aktiv = false; fz.y = boden; fz.vy = 0; fz.kanone = null;
    fz.nicken = -0.05;
    v.imFlug = false;
    v.untergrund = n.untergrund;
    melden(fz, 'kanoneLand');
    return 'landung';
  }

  /** Trampolin-Flug: das Fahrzeug dreht sich sanft mit der Straße mit (Drehrate ≤ 0,6 rad/s, zusätzlich zur Lenkung des Spielers) und landet so auf der Fahrbahn – auch in leichten Kurven. */
  function trampolinDrehen(fz, v, st, dt) {
    const n = st.abfrage(v.x, v.z, fz.index), p = st.spline.punktBei(n.s), k = klemme(n.seitenabstand * 0.04, -0.35, 0.35);
    const ziel = R.headingAus(p.tx - p.nx * k, p.tz - p.nz * k);
    v.heading += klemme(R.Vehicle.winkelDiff(ziel, v.heading) * 3, -0.6, 0.6) * dt;
  }

  // Umhüllung: Kanonen-Flug statt Ballistik, Lenkhilfe im Trampolin-Flug; abbrechen löscht auch die Kanone
  const S = R.Schanzen;
  if (S && !S._spassHuelle) {
    S._spassHuelle = true;
    const flugSchritt = S.flugSchritt, abbrechen = S.abbrechen;
    S.flugSchritt = function (fz, vehicle, strecke, steuerung, dt) {
      if (fz && fz.aktiv) {
        if (fz.kanone) return kanoneSchritt(fz, vehicle, strecke, steuerung, dt);
        if (fz.trampolin && strecke && strecke.spass) {
          trampolinDrehen(fz, vehicle, strecke, dt);
          const e = flugSchritt.apply(this, arguments);
          if (!fz.aktiv) fz.trampolin = 0;
          return e;
        }
      }
      return flugSchritt.apply(this, arguments);
    };
    S.abbrechen = function (fz, vehicle) {
      if (fz) { fz.kanone = null; fz.trampolin = 0; }
      return abbrechen.apply(this, arguments);
    };
  }

  R.Spass = { plan, nachSchritt, kanoneSchritt, sperrZonen, melden };
})();
