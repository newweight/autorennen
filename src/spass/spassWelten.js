// ============================================================
// Spaß-Paket S5 – Neue Welten, RECHENTEIL (Autorennen UND Motorrad; läuft im Browser, in der Vorhersage und im Server; kein Three.js, kein Math.random):
//   Schwerkraft je Strecke   strecke.katalog.schwerkraft (Mond 0,35) – wirkt in track/schanze.js flugSchritt (eine Zeile dort), im Trampolin (trampolinFaktor) und bei den Hüpfern.
//                            Alte Strecken haben kein Feld → Faktor 1 → bitgleich.
//   Grip je Strecke          katalog.gripFaktor / bremsFaktor: Wetter.umwelt() liefert die Faktoren schon eingerechnet (Fahrphysik, KI-Planung, Vorhersage – alles über umwelt()).
//   Hüpfer bei Bodenwellen   Strecken mit katalog.huepfer: wo das Höhenprofil der Straße schneller nach unten wegkrümmt, als es die (kleine) Schwerkraft zulässt
//                            (Tempo² · Krümmung > faktor · g), hebt das Fahrzeug ab (normaler Flug: fz.aktiv, Lenkung 20 %, sanfte Landung ohne Tempoverlust). Rein aus Höhenprofil + Tempo.
//   Teleport-Tore            R.Spass.plan hängt strecke.spass.tore = [{ nr, sA, sT, sB, halb }] an: Tor A (blau, Eingang) und Tor B (orange, Ausgang) `abstand` m weiter vorn,
//                            auf freier, fast gerader Strecke (gleiche Sperrregeln wie Trampolin/Kanone). Durchfahrt durch A → Fahrzeug erscheint bei B (gleiche Richtung zur Straße,
//                            gleicher Querversatz, gleiches Tempo); übersprungene Checkpoints werden gutgeschrieben. Nur mit Strecken-Option { spass: true } (wie Trampolin/Kanone).
//   Spiel.physikSchritt      umhüllt (nach spassPhysik.js): nach jedem Schritt je Fahrzeug R.SpassWelten.nachSchritt (Hüpfer, Tore), danach Rennleitung/Index nachziehen.
// Öffentlich: R.SpassWelten = { nachSchritt, plan, schwerkraft, huepfenPruefen, toreFuer, profil, … dino: { neu, schritt, frei, tempo, sBei, goldPos } } (FIX1: Dino-Aufgaben Gold + Wettrennen).
// Ereignisse (fz.spassE, wie Trampolin/Kanone): 'teleport' · fz.tele = { n, von:{x,y,z}, nach:{x,y,z}, tor } für die Anzeige.
// ============================================================
(function () {
  const R = window.Rennspiel;
  if (!R || !R.config || !R.Spass || !R.Schanzen || !R.Spline) return;
  if (R.SpassWelten) return;

  R.config.spass.welten = {
    tor: {
      abstand: 130,                 // m von Tor A (Eingang) bis Tor B (Ausgang)
      vMin: 3,                      // m/s: langsamer löst nichts aus
      randZu: 0.6,                  // m: die Tore reichen bis so dicht an den Fahrbahnrand
      platz: { je: 1900, max: 2, abLaenge: 1700, schritt: 6, kappa: 1 / 280, vorher: 22, nachher: 22, abstand: 120 },
    },
    huepfer: {
      abklingen: 0.15,              // s Pause nach einer Landung
      vyMin: 0.35,                  // m/s: mindestens so steil nach oben, sonst kein Hüpfer
      tempoErhalt: 0.992,           // × Tempo vor dem Abheben bleibt nach der Landung (statt × 0,95 der Schanzen-Landung)
      messweite: 6,                 // m: Abstand der Messpunkte für die Krümmung des Höhenprofils
    },
  };
  const C = () => R.config.spass.welten;
  const klemme = (x, a, b) => (x < a ? a : x > b ? b : x);
  const kat = (st) => (st && st.katalog) || {};

  /** Schwerkraft-Faktor der Strecke (1 = Erde). */
  function schwerkraft(st) { const k = kat(st).schwerkraft; return k > 0 ? k : 1; }

  // ---------------------------------------------------------------- Tore planen
  function plan(st, sicht, zufallAn, erg) {
    const daten = st.daten || {};
    if (!st.spline || !erg || daten.mega || daten.id === 'stuntpark' || daten.motoFelder || daten.motoKisten) return [];
    const sp = st.spline, L = sp.laenge, T = C().tor, P = T.platz, SP = R.config.spass.platz;
    if (L < P.abLaenge) return [];
    const n = klemme(Math.round(L / P.je), 1, P.max);
    const N = Math.max(8, Math.ceil(L / 4)), ds = L / N, kr = new Float32Array(N);
    for (let k = 0; k < N; k++) kr[k] = Math.abs(sp.punktBei(k * ds).kruemmung || 0);
    const kMax = (a, b) => { let i0 = Math.floor(a / ds), i1 = Math.ceil(b / ds), m = 0; if (i1 - i0 > N) { i0 = 0; i1 = N; } for (let i = i0; i <= i1; i++) { const x = kr[((i % N) + N) % N]; if (x > m) m = x; } return m; };
    const belegt = R.Spass.sperrZonen(st, sicht, !zufallAn).slice();
    (erg.zonen || []).forEach((z) => { const len = sp.wrapS(z.s1 - z.s0); belegt.push({ c: z.s0 + len / 2, h: len / 2 }); });
    const frei = (a, b) => { const c0 = (a + b) / 2, h0 = (b - a) / 2; for (let k = 0; k < belegt.length; k++) if (Math.abs(sp.differenzS(c0, belegt[k].c)) < h0 + belegt[k].h) return false; return true; };
    let h = 2166136261 >>> 0; const txt = String(daten.id || st.id || '') + '|' + (st.variante || '') + '|tore';
    for (let i = 0; i < txt.length; i++) { h ^= txt.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    const phase = (h % 89) / 89 * P.schritt;
    const von = SP.startFrei, bis = L - SP.zielFrei, laenge = bis - von;
    const halb = Math.max(2.5, (st.breite || 12) / 2 - T.randZu);
    const tore = [];
    for (let i = 0; i < n; i++) {
      const a0 = von + laenge * i / n, a1 = von + laenge * (i + 1) / n;
      let gut = null;
      for (const fr of [1, 1.7, 3]) {
        let beste = null;
        for (let s = Math.round(a0 + phase); s <= a1 - T.abstand * 0.2; s += P.schritt) {
          const sa = s - P.vorher, sb = s + T.abstand + P.nachher;
          if (sa < von - 20 || sb > bis + 20) continue;
          if (!frei(sa, sb)) continue;
          if (tore.some((z) => Math.abs(sp.differenzS((sa + sb) / 2, (z.sA + z.sB) / 2)) < (sb - sa) / 2 + (z.sB - z.sA) / 2 + P.abstand)) continue;
          const k = kMax(sa, sb);
          if (k >= fr * P.kappa) continue;
          if (!beste || k < beste.k - 1e-9) beste = { s, k };
        }
        if (beste) { gut = beste.s; break; }
      }
      if (gut === null) continue;
      tore.push({ nr: tore.length, sA: gut, sT: gut + 2, sB: gut + T.abstand, halb });
    }
    tore.forEach((z) => erg.zonen.push({ s0: z.sA - P.vorher, s1: z.sB + P.nachher }));
    return tore;
  }
  const planOrig = R.Spass.plan;
  R.Spass.plan = function (st, sicht, zufallAn) {
    const erg = planOrig.apply(this, arguments);
    try { erg.tore = plan(st, sicht, zufallAn, erg); } catch (e) { erg.tore = []; }
    return erg;
  };
  const toreFuer = (st) => (st && st.spass && st.spass.tore) || [];

  // ---------------------------------------------------------------- Hüpfer
  /** Höhenprofil der Mittellinie (y der Spline-Punkte), einmal je Strecke. */
  function profil(st) {
    if (st._welteProfil) return st._welteProfil;
    const sp = st.spline, pk = sp.punkte, N = pk.length;
    const p = { sp, ds: sp.ds, N, y: new Float32Array(N) };
    for (let i = 0; i < N; i++) p.y[i] = pk[i].y;
    st._welteProfil = p;
    return p;
  }
  function yBei(p, s) {
    const L = p.sp.laenge, f = (((s % L) + L) % L) / p.ds, i = Math.floor(f) % p.N, w = f - Math.floor(f);
    return p.y[i] + (p.y[(i + 1) % p.N] - p.y[i]) * w;
  }
  /**
   * Hebt das Fahrzeug an einer Kuppe ab? s = Bogenlänge, v = Tempo längs. Liefert { vy } oder null.
   * Bedingung: Höhenprofil krümmt nach unten (k < 0) und v²·(−k) > faktor·g (die Straße „fällt weg“), dabei steigt es noch (vy > vyMin).
   */
  function huepfenPruefen(st, s, v, g) {
    const k0 = kat(st).huepfer;
    if (!k0 || !(v >= (k0.vMin || 0))) return null;
    const m = C().huepfer.messweite, p = profil(st);
    const y0 = yBei(p, s), ya = yBei(p, s - m), yb = yBei(p, s + m);
    const k = (yb - 2 * y0 + ya) / (m * m);
    if (!(k < 0)) return null;
    const vy = (yBei(p, s + m / 2) - yBei(p, s - m / 2)) / m * v;
    if (!(v * v * -k > (k0.faktor || 1) * g) || !(vy > C().huepfer.vyMin)) return null;
    return { vy, k };
  }
  function huepfen(fz, v, st, nah) {
    const g = (R.config.stunt && R.config.stunt.schanze && R.config.stunt.schanze.g !== undefined ? R.config.stunt.schanze.g : 9.81) * schwerkraft(st);
    if (fz.huepfSperre > 0 || v.vLaengs < 1) return null;
    const h = huepfenPruefen(st, nah.s, v.vLaengs, g);
    if (!h) return null;
    fz.index = nah.index;
    fz.vy = h.vy; fz.y = st.hoeheAn(v.x, v.z, fz.index); fz.yVorher = fz.y; fz.t = 0; fz.aktiv = true; fz.rampe = null; fz.rampenH = 0;
    fz.startX = v.x; fz.startZ = v.z; fz.sprungGemeldet = true; fz.fluege++; fz.nicken = 0; fz.nickenVorher = 0;
    fz.huepfer = true; fz.huepfN = (fz.huepfN || 0) + 1;
    v.imFlug = true;
    return 'huepfer';
  }
  // Landung nach einem Hüpfer: kaum Tempoverlust (die Schanzen-Landung nimmt 5 %, das summierte sich auf jeder Bodenwelle)
  const flugSchritt0 = R.Schanzen.flugSchritt;
  R.Schanzen.flugSchritt = function (fz, vehicle, strecke, steuerung, dt) {
    const e = flugSchritt0.apply(this, arguments);
    if (fz && fz.huepfer && !fz.aktiv) {
      fz.huepfer = false; fz.huepfLandung = true;      // Anzeige: sanfte Landung statt Kamerawackeln
      if (fz.tempoVorLandung > 0) vehicle.vLaengs = Math.max(vehicle.vLaengs, fz.tempoVorLandung * C().huepfer.tempoErhalt);
      fz.huepfSperre = Math.round(C().huepfer.abklingen / R.config.physik.schritt);
    }
    return e;
  };
  const abbrechen0 = R.Schanzen.abbrechen;
  R.Schanzen.abbrechen = function (fz) { if (fz) { fz.huepfer = false; fz.huepfSperre = 0; } return abbrechen0.apply(this, arguments); };

  // ---------------------------------------------------------------- Tore benutzen
  function winkelDiff(a, b) { return R.Vehicle.winkelDiff(a, b); }
  /** Durchfahrt durch Tor A? Dann: Fahrzeug zu Tor B setzen. Liefert 'teleport' oder null. */
  function toreBenutzen(fz, v, st, nah, xAlt, zAlt) {
    const tore = toreFuer(st);
    if (!tore.length || !(v.vLaengs >= C().tor.vMin)) return null;
    const sp = st.spline, pt = sp.punktBei(nah.s), dx = v.x - xAlt, dz = v.z - zAlt;
    const sAlt = nah.s, sNeu = sAlt + dx * pt.tx + dz * pt.tz, q = nah.seitenabstand + dx * pt.nx + dz * pt.nz;
    for (let i = 0; i < tore.length; i++) {
      const e = tore[i], aA = sp.differenzS(sAlt, e.sT), aN = sp.differenzS(sNeu, e.sT);
      if (!(aA < 0 && aN >= 0 && aN < 20)) continue;
      if (Math.abs(q) > e.halb + 0.4) continue;
      const pA = sp.punktBei(e.sT), sZiel = sp.wrapS(e.sB + 2 + aN), pB = sp.punktBei(sZiel);
      const dh = winkelDiff(v.heading, R.headingAus(pA.tx, pA.tz));
      const qz = klemme(q, -e.halb, e.halb);
      const von = { x: v.x, y: v.y, z: v.z };
      v.x = pB.x + pB.nx * qz; v.z = pB.z + pB.nz * qz;
      v.heading = R.headingAus(pB.tx, pB.tz) + dh;
      v.y = st.hoeheAn(v.x, v.z);
      fz.index = -1;
      fz.tele = { n: ((fz.tele && fz.tele.n) || 0) + 1, von, nach: { x: v.x, y: v.y, z: v.z }, tor: e.nr, sZiel, sTor: e.sT };
      R.Spass.melden(fz, 'teleport');
      return 'teleport';
    }
    return null;
  }

  /**
   * Nach dem normalen Fahrschritt (wie R.Spass.nachSchritt; nah = Abfrage VOR dem Schritt): Hüpfer und Tore. Nur am Boden.
   * Liefert 'huepfer' | 'teleport' | null.
   */
  function nachSchritt(fz, v, st, nah, xAlt, zAlt, dt) {
    if (!fz || fz.aktiv || v.imLooping || !nah || !st) return null;
    if (fz.huepfSperre > 0) fz.huepfSperre--;
    if (kat(st).huepfer) { const e = huepfen(fz, v, st, nah); if (e) return e; }
    if (st.spass && st.spass.tore && st.spass.tore.length) return toreBenutzen(fz, v, st, nah, xAlt, zAlt);
    return null;
  }

  // ---------------------------------------------------------------- Grip/Bremse je Strecke (über Wetter.umwelt())
  const W = R.Wetter && R.Wetter.prototype;
  if (W && !W._weltenUmwelt) {
    W._weltenUmwelt = true;
    const umwelt0 = W.umwelt;
    W.umwelt = function () {
      const u = umwelt0.apply(this, arguments), k = this.strecke && this.strecke.katalog;
      if (!k || (!k.gripFaktor && !k.bremsFaktor)) return u;
      const m = this._weltU || (this._weltU = {});
      Object.assign(m, u);
      if (k.gripFaktor) m.gripFaktor = u.gripFaktor * k.gripFaktor;
      if (k.bremsFaktor) m.bremsFaktor = u.bremsFaktor * k.bremsFaktor;
      return m;
    };
  }

  // ---------------------------------------------------------------- Spiel.physikSchritt (Browser + Server)
  const P = R.Spiel && R.Spiel.prototype;
  if (P && !P._weltenPhysik) {
    P._weltenPhysik = true;
    const orig = P.physikSchritt;
    P.physikSchritt = function (dt) {
      const st = this.strecke, fahr = this.fahrzeuge;
      const tore = st && st.spass && st.spass.tore && st.spass.tore.length;
      if (!st || !fahr || !fahr.length || !(tore || kat(st).huepfer)) return orig.apply(this, arguments);
      const vor = this._weltVor || (this._weltVor = []);
      for (let i = 0; i < fahr.length; i++) {
        const f = fahr[i], v = f.vehicle, fz = f.flug, lp = f.looping, e = vor[i] || (vor[i] = {});
        e.x = v.x; e.z = v.z; e.aus = !fz || fz.aktiv || !!(lp && (lp.aktiv || lp.fallen)) || !!v.verkehr;
      }
      const r = orig.apply(this, arguments);
      for (let i = 0; i < fahr.length; i++) {
        const f = fahr[i], e = vor[i], fz = f.flug, v = f.vehicle;
        if (!fz || !e) continue;
        if (!e.aus && !f.ausgeschieden && !fz.aktiv && f.nah) {
          const erg = nachSchritt(fz, v, st, f.nah, e.x, e.z, dt);
          if (erg === 'teleport') this._weltTeleportAnwenden(i, f);
        }
      }
      return r;
    };
    /** Nach dem Teleport: Rennleitung und Fahrzeug-Zustand nachziehen (Server und Browser gleich). */
    P._weltTeleportAnwenden = function (i, f) {
      const tl = f.flug.tele, rn = this.rennen, st = this.strecke;
      if (!tl) return;
      const t = rn && rn.teilnehmer && rn.teilnehmer[i];
      if (t && rn.strecke && rn.strecke.checkpoints && !t.imZiel) {
        // übersprungene Checkpoints (zwischen Tor A und dem Ziel) gutschreiben, sonst käme das Fahrzeug nie an den nächsten
        const sp = st.spline;
        for (let g = 0; g < 8; g++) {
          const cp = rn.strecke.checkpoints[t.naechsterCheckpoint];
          if (!cp || cp.nr === 0) break;
          if (!(sp.differenzS(cp.s, tl.sTor) > 0 && sp.differenzS(cp.s, tl.sZiel) <= 0)) break;
          rn._checkpointErreicht(t, cp);
        }
        rn.verfolgungSetzen(t, f.vehicle.x, f.vehicle.z, tl.sZiel);
      }
      if (typeof this._vorherAngleichen === 'function') this._vorherAngleichen(f);
      f.index = -1;
      if (f.driver && f.driver.zurueckgesetzt) f.driver.zurueckgesetzt();
    };
  }

  // ---------------------------------------------------------------- Dino-Freund: Aufgaben (FIX1, rein – Anzeige in spassWeltenUI.js)
  //   🪙 Goldstücke   Ab und zu wirft der Dino 3 Goldstücke auf die Fahrbahn VOR dem Spieler (Ort rein aus Zähler + Strecken-Name: deterministisch, kein Math.random).
  //                   Einsammeln = Garage-Kasse + 1 (Anzeige übernimmt das Gutschreiben). Keine Physik, keine Kollision.
  //   🏁 Wettrennen   Der Dino ruft „Wettrennen!“: wer zuerst an der Fahne `weg` m weiter ist, gewinnt. Dino-Tempo = Soll-Tempo der Strecke (max. Fahrzeug-Tempo) × tempoFaktor
  //                   der Schwierigkeit (config.schwierigkeiten – wie die Computer-Fahrer). Kein Einfluss auf das Rennergebnis; Sieg → Sticker „Dino geschlagen“.
  //   Nur Offline-Anzeige (die Aufgaben laufen im Browser, online gibt es den Dino-Begleiter nicht); der Rechenteil bleibt trotzdem rein und bitgleich testbar.
  R.config.spass.welten.dino = {
    gold: { erstNach: 12, pauseMin: 16, pauseSpanne: 12, anzahl: 3, abstand: 5, vorn: 34, vornSek: 1.2, flug: 0.85, dauer: 15, radius: 2.5, qAnteil: 0.55, vMin: 6 },
    rennen: { erstNach: 38, pauseMin: 50, pauseSpanne: 40, weg: 300, vMin: 8, tau: 1.2, vorsprung: 6, dMin: 10, maxSek: 70, fahne: 0.9 },
  };
  const hashT = (txt) => { let h = 2166136261 >>> 0; for (let i = 0; i < txt.length; i++) { h ^= txt.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return h >>> 0; };
  const mischen = (h, n) => { h = (h ^ Math.imul(n + 1, 0x9E3779B1)) >>> 0; h = Math.imul(h ^ (h >>> 15), 0x85EBCA6B) >>> 0; h = Math.imul(h ^ (h >>> 13), 0xC2B2AE35) >>> 0; return (h ^ (h >>> 16)) >>> 0; };

  /** Ist Bogenlänge s für Dino-Gold/Fahne frei von Sonderelementen (Looping, Schanze, Brücke, Gabelung, Kreuzung, Trampolin/Kanone, Tore, Zauber-Elemente)? */
  function dinoFrei(st, s) {
    const sp = st.spline, L = sp.laenge, drin = (a, b) => { const l = sp.wrapS(b - a); return sp.wrapS(s - a) <= l; };
    if (s < 60 || s > L - 30) return false;
    let frei = true;
    const sperre = (a, b) => { if (frei && drin(a, b)) frei = false; };
    (st.loopings || []).forEach((l) => sperre(l.s0 - 25, l.s1 + 25));
    (st.schanzen || []).forEach((x) => sperre(x.s - 25, x.s + (x.laenge || 10) + 80));
    (st.ueberfuehrungen || []).forEach((u) => { sperre(u.s0 - 20, u.s1 + 20); if (u.unten) sperre(u.unten.s0 - 20, u.unten.s1 + 20); });
    (st.gabelungen || []).forEach((g) => sperre(g.s0 - 20, g.s1 + 20));
    (st.kreuzungen || []).forEach((k) => [k.a, k.b].forEach((b) => sperre(b.s0 - 25, b.s1 + 25)));
    const sx = st.spass;
    if (sx) {
      (sx.liste || []).forEach((e) => sperre(e.s0 - 25, e.s0 + (e.laenge || 10) + 25));
      (sx.tore || []).forEach((e) => sperre(e.sA - 20, e.sB + 20));
      const z = sx.zauber;
      if (z) {
        (z.magnet || []).forEach((e) => sperre(e.s0 - 20, e.s1 + 20));
        (z.schluchten || []).forEach((e) => sperre(e.sT - 40, e.sL + 40));
        (z.schienen || []).forEach((e) => sperre(e.s0 - 20, e.s1 + 20));
        if (z.pipe) sperre(z.pipe.s0 - 20, z.pipe.s1 + 20);
      }
    }
    return frei;
  }

  /** Neuer Aufgaben-Zustand für eine Strecke (Zeiten in Rennsekunden). */
  function dinoNeu(st) {
    const c = C().dino, seed = hashT(String((st && (st.id || (st.daten && st.daten.id))) || '') + '|dinoAufgaben');
    return { seed, n: 0, nR: 0, zeit: 0, tGold: c.gold.erstNach, tRennen: c.rennen.erstNach, gold: [], rennen: null, ereig: [], gesammelt: 0, siege: 0, niederlagen: 0 };
  }

  /** Mittleres Soll-Tempo der Strecke über [s0, s0+weg], höchstens vMax (das Fahrzeug schafft nie mehr). */
  function dinoTempo(st, s0, weg, vMax, schw) {
    const sp = st.spline, tf = ((R.config.schwierigkeiten || {})[schw] || (R.config.schwierigkeiten || {}).mittel || { tempoFaktor: 0.78 }).tempoFaktor;
    let sum = 0, n = 0;
    for (let d = 0; d <= weg; d += 20) { sum += Math.min(vMax, st.tempoBei(sp.wrapS(s0 + d))); n++; }
    const ref = Math.min(vMax, sum / Math.max(1, n));
    return klemme(ref * tf, C().dino.rennen.dMin, Math.max(C().dino.rennen.dMin, vMax));
  }

  /** Dino-Fahne: Strecke s des Dinos zur Zeit t nach dem Ruf (sanfter Start). */
  function dinoSBei(R_, t) {
    const c = C().dino.rennen, tau = c.tau;
    return R_.s0 + c.vorsprung + R_.vD * (t - tau * (1 - Math.exp(-t / tau)));
  }

  /** Weltposition (x, z) eines Dino-Goldstücks. */
  function dinoGoldPos(st, g) { const p = st.spline.punktBei(g.s); return { x: p.x + p.nx * g.q, z: p.z + p.nz * g.q, y: st.hoeheAn(p.x + p.nx * g.q, p.z + p.nz * g.q), p }; }

  /**
   * Ein Schritt der Aufgaben. K = { s, x, z, v, bereit (fährt auf dem Boden im laufenden Rennen), schw, vMax }. Ereignisse in D.ereig: { name: 'gold'|'sammeln'|'wettrennen'|'sieg'|'verloren'|'weg', … }.
   * Goldstücke: D.gold = [{ id, s, q, alter, flug, dauer }] (alter zählt hoch; beim Einsammeln/Ablaufen entfernt).
   */
  function dinoSchritt(D, st, K, dt) {
    const c = C().dino, G = c.gold, W = c.rennen, sp = st.spline, halb = Math.max(2.5, (st.breite || 12) / 2);
    if (!(dt > 0)) return D;
    D.zeit += dt;
    for (let i = D.gold.length - 1; i >= 0; i--) {
      const g = D.gold[i]; g.alter += dt;
      if (g.alter >= G.dauer) { D.gold.splice(i, 1); D.ereig.push({ name: 'weg', id: g.id }); continue; }
      if (K.bereit && g.alter >= G.flug) {
        const w = dinoGoldPos(st, g), dx = K.x - w.x, dz = K.z - w.z;
        if (dx * dx + dz * dz <= G.radius * G.radius) { D.gold.splice(i, 1); D.gesammelt++; D.ereig.push({ name: 'sammeln', id: g.id }); }
      }
    }
    // Wettrennen läuft
    const Rn = D.rennen;
    if (Rn) {
      Rn.t += dt; Rn.sD = dinoSBei(Rn, Rn.t);
      const p = sp.differenzS(K.s, Rn.s0), dD = Rn.sD - Rn.s0;
      if (p >= Rn.weg) { D.rennen = null; D.siege++; D.tRennen = W.pauseMin + mischen(D.seed, 1000 + D.nR) % (W.pauseSpanne + 1); D.ereig.push({ name: 'sieg', zeit: Rn.t, dinoWeg: dD }); }
      else if (dD >= Rn.weg) { D.rennen = null; D.niederlagen++; D.tRennen = W.pauseMin + mischen(D.seed, 1000 + D.nR) % (W.pauseSpanne + 1); D.ereig.push({ name: 'verloren', zeit: Rn.t, spielerWeg: p }); }
      else if (Rn.t > W.maxSek || !K.bereit && Rn.t > 4 && K.v < 1) { D.rennen = null; D.tRennen = 12; D.ereig.push({ name: 'abbruch' }); }
      else if (p < -40) { D.rennen = null; D.tRennen = 12; D.ereig.push({ name: 'abbruch' }); }   // falsch herum / zurückgesetzt
      return D;
    }
    if (!K.bereit) return D;
    // Gold werfen
    if (K.v >= G.vMin) {
      D.tGold -= dt;
      if (D.tGold <= 0) {
        const h = mischen(D.seed, D.n), q = (((h % 7) - 3) / 3) * halb * G.qAnteil, s0 = sp.wrapS(K.s + G.vorn + K.v * G.vornSek);
        const ok = dinoFrei(st, s0) && dinoFrei(st, sp.wrapS(s0 + G.abstand * (G.anzahl - 1)));
        if (!ok) D.tGold = 3;
        else {
          const lst = [];
          for (let k = 0; k < G.anzahl; k++) { const g = { id: D.n * 10 + k, s: sp.wrapS(s0 + k * G.abstand), q, alter: -k * 0.12, flug: G.flug, dauer: G.dauer }; D.gold.push(g); lst.push(g); }
          D.ereig.push({ name: 'gold', muenzen: lst, n: D.n });
          D.n++; D.tGold = G.pauseMin + mischen(D.seed, 500 + D.n) % (G.pauseSpanne + 1);
        }
      }
    }
    // Wettrennen rufen (nur im Fahrbetrieb, nicht mit Gold im Flug)
    if (K.v >= W.vMin && !D.gold.some((g) => g.alter < g.flug + 0.3)) {
      D.tRennen -= dt;
      if (D.tRennen <= 0) {
        let sM = null;
        for (let d = 0; d <= 60 && sM === null; d += 10) { const s = sp.wrapS(K.s + W.weg + d); if (dinoFrei(st, s)) sM = { s, d }; }
        if (sM === null) D.tRennen = 8;
        else {
          const weg = W.weg + sM.d, vD = dinoTempo(st, K.s, weg, K.vMax || 28, K.schw);
          D.rennen = { s0: K.s, sMark: sM.s, weg, vD, t: 0, sD: K.s + W.vorsprung, nr: D.nR };
          D.nR++; D.ereig.push({ name: 'wettrennen', weg, vD });
        }
      }
    }
    return D;
  }

  R.SpassWelten = { nachSchritt, plan, schwerkraft, huepfenPruefen, toreFuer, profil, huepfen, toreBenutzen, dino: { neu: dinoNeu, schritt: dinoSchritt, frei: dinoFrei, tempo: dinoTempo, sBei: dinoSBei, goldPos: dinoGoldPos } };
})();
