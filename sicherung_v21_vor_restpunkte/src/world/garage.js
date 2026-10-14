// ============================================================
// 14.10. (v18) Werkstatt („Garage“, Boxenplatz) neben der Fahrbahn – NUR bei Einstellung „Schaden an“.
//
//   const w = new Rennspiel.Werkstatt(strecke)       // sucht den Platz selbst (platzSuchen); w.platz === null → diese Strecke hat keine
//   w.bauen()                                        // THREE.Group: Parkfläche, Boxen-Markierung, Gebäude, Schild + Lampe (nur mit THREE)
//   w.schritt(dt, fahrzeuge, schaden, rennen)        // Logik-Uhr im Physikschritt, NACH schaden.schritt (siehe main.js, Schritt 9)
//   w.zustand(i)                                     // → { status, prozent, entfernung } für den HUD (status: aus|voraus|drin|heilt|voll|benutzt)
//   w.untergrund(v, n)                               // 'strasse' (auf der Fläche) | 'rand' (Zufahrt) | null (nichts ändern) – main.js
//   w.kiSteuerung(i, f, dt, rennen, schaden)         // Computer-Auto fährt hin, wenn sein Wert < kiUnter % → { gas, bremse, lenkung } | null
//   w.bei(fn)                                        // Ereignisse fn({ art, i, prozent }): 'start' (erstes Heilen), 'heilen' (je 10 %), 'voll', 'benutzt'
//   w.animieren(t, fahrzeuge)                        // Schild/Lampe je Frame (Zustand des nächsten Menschen)
//   w.zerstoeren()
//
// Regeln (config.werkstatt): Wer mit der Fahrzeugmitte auf der Fläche steht (Tempo < steheTempo m/s) bekommt prozentProSekunde (15) % je
// Sekunde bis 100 % (schaden.werkstattHeilen). Einmal je Runde: nach dem Heilen gilt die Werkstatt für dieses Auto in dieser Runde als
// benutzt (Schild „schon benutzt – nächste Runde“). Wer liegengeblieben ist oder gerade im Abschlepp-Reparieren steht, wird nicht geheilt.
// Platz (platzSuchen): gerade Stelle ab sucheAb m nach Start/Ziel, ganzes Fenster fast gerade, normal breit, weg von Brücken/Tunnel/Kreuzung/
// Looping/Schanze (samt Anlauf)/Klebestreifen/Hindernissen/Bällen und ohne Baum/Fels im Weg; Fläche liegt zwischen Randstreifen und Zaun
// (die Bande bleibt unverändert, das Gebäude steht davor und ist über strecke.saeulen fest). Das Gras-Bremsen auf Fläche und Zufahrt hebt
// untergrund() auf (nur Logik hier, trackBuilder/collisions unverändert).
// KI: Computer-Auto/Autopilot mit Wert < kiUnter, nicht benutzt in dieser Runde, kiVorlauf m vor der Fläche → eigene Zielverfolgung auf die
// Fläche (Treppe der Seitenlage), bremst, steht bis kiBis % (höchstens kiMaxWarten s), danach fährt der Driver wieder (driver.zurueckgesetzt).
// Alles deterministisch (nur Physik-dt). Logik ohne THREE (Node-Tests: tests/test_garage_werkstatt.js).
// ============================================================
(function () {
  const R = window.Rennspiel;

  function cfg() { return (R.config && R.config.werkstatt) || {}; }
  function wert(x, std) { return x === undefined ? std : x; }
  function glatt(a, b, x) { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); }
  function klemme(x, a, b) { return Math.max(a, Math.min(b, x)); }

  // ---------------------------------------------------------- Platzsuche
  // Streckendaten-Listen, die schon über eigene Abfragen berücksichtigt werden (Hindernisse, Brücken/Tunnel, Anlauf, Spuren …)
  const SONDER = new Set(['hindernisse', 'wracks', 'bruecken', 'bruecke', 'tunnel', 'ueberfuehrungen', 'schanzen', 'loopings', 'spuren', 'kleber', 'kreuzungen', 'huegel']);
  /** Katalog-Einträge der Strecke, die Platz am Rand belegen (Zonen als { s0, s1 } bzw. { s }). */
  function sperrListe(strecke, stufe) {
    stufe = stufe || { hind: 'alle', kleber: true, anlaufVoll: true };
    const liste = [];
    const dazu = (e, zugabe) => {
      if (!e || typeof e !== 'object') return;
      if (typeof e.s0 === 'number' && typeof e.s1 === 'number') liste.push({ s0: e.s0 - zugabe, s1: e.s1 + zugabe });
      else if (typeof e.s === 'number') liste.push({ s0: e.s - zugabe, s1: e.s + zugabe });
    };
    const C = cfg(), sp = strecke.spline, sperr = wert(C.sperrAbstand, 40);
    (strecke._engstellen || []).forEach(e => dazu(e, stufe.eng !== undefined ? stufe.eng : sperr));
    (strecke.daten && strecke.daten.gabelungen || []).forEach(e => dazu(e, 60));   // Gabelung (Wiese/Wüste): eigene Äste, großzügig frei lassen
    (strecke.kreuzungen || []).forEach((k) => { if (typeof k.sA === 'number') liste.push({ s0: k.sA - 90, s1: k.sA + 90 }); if (typeof k.sB === 'number') liste.push({ s0: k.sB - 90, s1: k.sB + 90 }); });
    if (stufe.kleber) (strecke.kleber || []).forEach(e => dazu(e, 8));
    // Hindernisse: Wracks/Brände stehen am Rand (großzügig), Baustelle sperrt eine Fahrbahnhälfte, Flecken/Äste liegen auf der Straße (knapp)
    (strecke.hindernisse || []).forEach((e) => {
      const seite = e.typ === 'wrack' || e.typ === 'brand';
      if (stufe.hind === 'alle') dazu(e, seite ? 18 : e.typ === 'baustelle' ? 12 : wert(C.hindernisAbstand, 8));
      else if (stufe.hind === 'seite' && (seite || e.typ === 'baustelle')) dazu(e, seite ? 18 : 8);
      else if (stufe.hind === 'wenig' && seite) dazu(e, 14);
    });
    // Loopings/Schanzen samt Anlauf (R.Anlauf.stellen: { s, abstand })
    try {
      if (R.Anlauf && R.Anlauf.stellen) R.Anlauf.stellen(strecke).forEach(z => liste.push(stufe.anlaufVoll ? { s0: z.s - 10, s1: z.s + 35, anlauf: z.abstand || 0 } : { s0: z.s - 40, s1: z.s + 35 }));
    } catch (e) { /* ohne Anlauf-Modul: weiter */ }
    // Alles Weitere aus den Streckendaten, was eine Bogenlänge hat (Bälle, Wasserstrahlen, Strohballen, Dinos …) – großzügig
    const d = strecke.daten || {};
    Object.keys(d).forEach((k) => {
      if (k === 'punkte' || !Array.isArray(d[k])) return;
      if (k === 'gabelungen' || SONDER.has(k)) return;
      d[k].forEach(e => dazu(e, 20));
    });
    void sp;
    return liste;
  }

  /** Liegt s (m) in einer Sperrzone? Anlauf-Zonen reichen VOR der Stelle um `anlauf` m zurück. */
  function gesperrt(strecke, liste, s) {
    const sp = strecke.spline;
    for (let k = 0; k < liste.length; k++) {
      const z = liste[k], mitte = (z.s0 + z.s1) / 2, halb = Math.abs(sp.differenzS(z.s1, z.s0)) / 2 + 0.5;
      const dm = sp.differenzS(s, mitte);
      if (z.anlauf !== undefined) { if (dm > -(halb + z.anlauf + 15) && dm < halb) return true; continue; }
      if (Math.abs(dm) <= halb) return true;
    }
    return false;
  }

  /**
   * Platz für die Werkstatt suchen. Ergebnis { s, seite (+1 rechts / −1 links), qA, qB (Fläche, m ab Mittellinie, immer positiv), laenge, breite,
   * gebTiefe, gebBreite, gebQ (Mitte des Gebäudes), grenze } oder null.
   * Reihenfolge: ab sucheAb m nach Start/Ziel in 6-m-Schritten, je Stelle erst rechts, dann links; erster Treffer. Findet sich nichts, wird
   * zweimal gelockert (Krümmung × 2, dann × 4); danach null.
   */
  function platzSuchen(strecke, optionen) {
    if (!strecke || !strecke.spline) return null;
    const C = Object.assign({}, cfg(), optionen || {});
    const sp = strecke.spline, Ls = sp.laenge;
    const laenge = wert(C.laenge, 13), fensterStd = wert(C.sucheFenster, 36);
    const b = strecke.breite / 2, rb = strecke.randBreite || 2;
    const qA = b + rb + wert(C.randAbstand, 0.4);
    const koll = strecke.pflanzenKollider || [];
    const gebB = wert(C.gebaeudeBreite, 12);
    // Stufen: 1 streng; 2 Flecken/Äste/Klebestreifen auf der Straße stören nicht; 3 + doppelte Krümmung, Anlauf nur ±40 m; 4 + vierfach, nur Wracks,
    // kleineres Fenster; 5 + Bäume dürfen im Gebäude stehen (nur die Fläche muss frei sein)
    const STUFEN = [{ k: 1, hind: 'alle', kleber: true, anlaufVoll: true }, { k: 1, hind: 'seite', kleber: false, anlaufVoll: true },
      { k: 2, hind: 'seite', kleber: false, anlaufVoll: false }, { k: 4, hind: 'wenig', kleber: false, anlaufVoll: false, fenster: 24, eng: 16 },
      { k: 4, hind: 'wenig', kleber: false, anlaufVoll: false, fenster: 24, eng: 16, baumNurFlaeche: true }];
    for (const stufe of STUFEN) {
      const faktor = stufe.k, liste = sperrListe(strecke, stufe), fenster = stufe.fenster || fensterStd;
      const maxK = wert(C.maxKruemmung, 0.0022) * faktor;
      for (let s = wert(C.sucheAb, 70); s < Ls - 120; s += 6) {
        // Fenster: fast gerade, normale Breite, keine Sperrzone
        let ok = true;
        for (let k = -fenster / 2; k <= fenster / 2 && ok; k += 4) {
          const p = sp.punktBei(s + k);
          if (Math.abs(p.kruemmung) > maxK) ok = false;
          else if (strecke.breiteBei && Math.abs(strecke.breiteBei(s + k) - strecke.breite) > 0.01) ok = false;
          else if (gesperrt(strecke, liste, s + k)) ok = false;
        }
        if (!ok) continue;
        for (const seite of [1, -1]) {
          // Platz bis zur Bande (grenzeBei): Fläche bis breite m (mindestens 4,4 m), Gebäude (mindestens 2,4 m tief) bekommt den Rest;
          // enge Zäune (Wald): Gebäude darf bis knapp hinter die Bande reichen (unerreichbar für Autos)
          let grenze = Infinity;
          for (let k = -gebB / 2; k <= gebB / 2; k += 3) grenze = Math.min(grenze, strecke.grenzeBei ? strecke.grenzeBei(s + k) : strecke.seitenabstandMax);
          const aussenMax = grenze + 0.3;
          const breite = klemme(aussenMax - qA - 0.5 - wert(C.gebaeudeTiefe, 5.5), 4.4, wert(C.breite, 6.4));
          const qB = qA + breite, gebQ0 = qB + 0.5, tiefe = Math.min(wert(C.gebaeudeTiefe, 5.5), aussenMax - gebQ0);
          if (tiefe < 2.4 || qB > grenze - 1.8) continue;
          const aussen = gebQ0 + tiefe;
          // Bäume/Felsen/Büsche im Weg? (Pflanzen-Kollider zwischen Straße und Zaun)
          let frei = true;
          for (let k = 0; k < koll.length && frei; k++) {
            const c = koll[k], q = c.seitenabstand * seite;
            if (Math.abs(sp.differenzS(c.s, s)) > Math.max(laenge, gebB) / 2 + c.r + 2) continue;
            if (q + c.r > qA - 1 && q - c.r < (stufe.baumNurFlaeche ? qB + 0.5 : aussen + 1.5)) frei = false;
          }
          if (!frei) continue;
          return { s: sp.wrapS(s), seite, qA, qB, laenge, breite, gebTiefe: tiefe, gebBreite: gebB, gebQ: gebQ0 + tiefe / 2, grenze, kruemmungMax: maxK, stufe: STUFEN.indexOf(stufe) + 1 };
        }
      }
    }
    return null;
  }

  // ============================================================ Werkstatt
  class Werkstatt {
    /**
     * @param {Strecke} strecke
     * @param {{platz?:object}} [opt] platz: fertigen Platz vorgeben (Tests); sonst platzSuchen(strecke)
     */
    constructor(strecke, opt) {
      this.strecke = strecke;
      this.platz = (opt && opt.platz) || platzSuchen(strecke);
      this.st = [];                 // je Fahrzeug: { drin, heilt, runde (Runde des Heilens), benutztRunde, bereitsGemeldet, ki, kiZeit, kiQ0, kiWarte, letzte10 }
      this._hoerer = [];
      this._gruppe = null;
      this._zeigeZustand = null;
      this._zeit = 0;
    }

    get vorhanden() { return !!this.platz; }
    bei(fn) { if (typeof fn === 'function') this._hoerer.push(fn); }
    _melden(art, i, extra) {
      const e = Object.assign({ art, i }, extra);
      for (const fn of this._hoerer) { try { fn(e); } catch (err) { if (typeof console !== 'undefined') console.error(err); } }
    }
    _s(i) { return this.st[i] || (this.st[i] = { drin: false, heilt: false, runde: -1, benutztRunde: -1, ki: null, kiZeit: 0, kiQ0: 0, kiWarte: 0, letzte10: 0, zeigt: 'aus' }); }

    // ---------------------------------------------------------- Geometrie
    /** Welt-Punkt zu Bogenlänge s und Querabstand qs (m, + = Seite der Werkstatt). */
    welt(s, qs) {
      const p = this.strecke.spline.punktBei(s), q = qs * this.platz.seite;
      return { x: p.x + p.nx * q, z: p.z + p.nz * q, tx: p.tx, tz: p.tz, nx: p.nx * this.platz.seite, nz: p.nz * this.platz.seite, s: p.s };
    }
    /** Mitte einer Box (0 = hinten, 1 = vorn in Fahrtrichtung): { x, z, s, qs }. */
    boxMitte(k) {
      const P = this.platz;
      const s = P.s + (k === 0 ? -1 : 1) * P.laenge / 4, qs = (P.qA + P.qB) / 2;
      const w = this.welt(s, qs);
      return { x: w.x, z: w.z, s, qs };
    }
    /** Fahrzeugmitte (Streckenabfrage n: s, seitenabstand) auf der Fläche? */
    istDrin(n) {
      const P = this.platz;
      if (!P || !n) return false;
      const ds = this.strecke.spline.differenzS(n.s, P.s), qs = n.seitenabstand * P.seite;
      return Math.abs(ds) <= P.laenge / 2 && qs >= P.qA - 0.2 && qs <= P.qB + 0.2;
    }
    /** Abstand (m) vor der Fläche entlang der Strecke (> 0 = Fläche liegt voraus, Anfang der Fläche), sonst −1. */
    _vorAnfang(n) {
      const P = this.platz, ds = this.strecke.spline.differenzS(P.s - P.laenge / 2, n.s);
      return ds;
    }

    /** Untergrund für main.js: Fläche = 'strasse', Zufahrt (zwischen Randstreifen und Fläche, auf Höhe der Fläche) = 'rand' statt Gras. */
    untergrund(v, n) {
      const P = this.platz;
      if (!P || !n || !v || (v.untergrund !== 'gras' && v.untergrund !== 'sand' && v.untergrund !== 'rand')) return null;
      const ds = this.strecke.spline.differenzS(n.s, P.s);
      if (ds > P.laenge / 2 + 3 || ds < -(P.laenge / 2 + 12)) return null;       // Zufahrt: 12 m vor der Fläche bis 3 m dahinter
      const qs = n.seitenabstand * P.seite;
      if (qs < this.strecke.breite / 2 || qs > P.qB + 1.2) return null;          // zwischen Fahrbahnkante und hinterer Kante der Fläche
      if (Math.abs(ds) <= P.laenge / 2 + 0.2 && qs <= P.qB + 0.2 && qs >= P.qA - 0.2) return 'strasse';
      return v.untergrund === 'rand' ? null : 'rand';
    }

    // ---------------------------------------------------------- Logik
    /**
     * Logik-Uhr (Physikschritt). fahrzeuge = main.js this.fahrzeuge (Einträge mit vehicle, nah (Streckenabfrage), istSpieler, polizei …).
     * Nur Einträge mit Schaden-Zustand (schaden.z[i]) zählen; Polizei/ausgeschiedene nicht.
     */
    schritt(dt, fahrzeuge, schaden, rennen) {
      const P = this.platz;
      this._zeit += dt;
      if (!P || !schaden || !schaden.an) return;
      const C = cfg(), rate = wert(C.prozentProSekunde, 15), steh = wert(C.steheTempo, 1);
      for (let i = 0; i < fahrzeuge.length && i < schaden.z.length; i++) {
        const f = fahrzeuge[i];
        if (!f || f.polizei || f.ausgeschieden) continue;
        const st = this._s(i), z = schaden.z[i], n = f.nah, v = f.vehicle;
        const t = rennen && rennen.teilnehmer ? rennen.teilnehmer[i] : null;
        const runde = t ? t.runde : 0;
        const drin = !!n && !(v && v.imLooping) && this.istDrin(n);
        const still = !!v && Math.abs(v.vLaengs) < steh && Math.abs(v.vQuer || 0) < steh;
        st.aktRunde = runde;
        // Zustand für den HUD
        let status = 'aus';
        if (drin) {
          if (z.punkte >= 100) status = st.benutztRunde === runde ? 'voll' : 'aus';
          else if (st.benutztRunde === runde && !st.heilt) status = 'benutzt';
          else status = st.heilt ? 'heilt' : 'drin';
        }
        if (drin && still && !z.liegengeblieben && !z.rep && z.punkte < 100 && st.benutztRunde !== runde) {
          if (!st.heilt) { st.heilt = true; st.runde = runde; st.letzte10 = Math.floor(z.punkte / 10); this._melden('start', i, { prozent: z.punkte }); }
          schaden.werkstattHeilen(i, rate * dt);
          const zehn = Math.floor(z.punkte / 10);
          if (zehn > st.letzte10) { st.letzte10 = zehn; this._melden('heilen', i, { prozent: z.punkte }); }
          if (z.punkte >= 100) { st.benutztRunde = st.runde; st.heilt = false; status = 'voll'; this._melden('voll', i, { prozent: 100 }); this._melden('benutzt', i, { prozent: 100 }); }
          else status = 'heilt';
        }
        // Fläche verlassen (oder fährt los) nach dem Heilen → in dieser Runde benutzt
        if (st.heilt && (!drin || !still)) {
          if (!drin) { st.benutztRunde = st.runde; st.heilt = false; this._melden('benutzt', i, { prozent: z.punkte }); }
          else if (!still) status = 'drin';
        }
        // Nähe: Hinweis „Werkstatt voraus“ (nur wenn Heilen sinnvoll)
        if (status === 'aus' && n && !drin && z.punkte < 100 && !z.liegengeblieben && !z.rep && st.benutztRunde !== runde) {
          const d = this._vorAnfang(n), q = n.seitenabstand * P.seite;
          if (d > 0 && d < wert(C.melden, 60) && q > -strecke_b(this.strecke) - 0.5) status = 'voraus';
        }
        st.zeigt = status;
        st.drin = drin;
      }
    }

    /** Zustand für den HUD von Fahrzeug i. */
    zustand(i) {
      const st = this.st[i];
      return { status: st ? st.zeigt : 'aus', vorhanden: !!this.platz, heilt: !!(st && st.heilt) };
    }

    // ---------------------------------------------------------- KI
    /**
     * Computer-Auto i fährt zur Werkstatt und steht dort. null = Driver fährt normal (nicht zuständig).
     * f = Eintrag aus fahrzeuge (vehicle, nah, driver/autopilot), schaden = R.Schaden (an).
     */
    kiSteuerung(i, f, dt, rennen, schaden) {
      const P = this.platz, C = cfg();
      if (!P || !schaden || !schaden.an || !f || !f.vehicle || !f.nah || f.polizei) return null;
      const z = schaden.z[i];
      if (!z || z.liegengeblieben || z.rep) { const s0 = this.st[i]; if (s0) s0.ki = null; return null; }
      const st = this._s(i), v = f.vehicle, n = f.nah, sp = this.strecke.spline;
      const t = rennen && rennen.teilnehmer ? rennen.teilnehmer[i] : null, runde = t ? t.runde : 0;
      if (v.imLooping || (f.flug && f.flug.aktiv)) return null;
      const vor = this._vorAnfang(n);                      // m bis zum Anfang der Fläche (> 0 = voraus)
      const benutzt = st.benutztRunde === runde;
      if (!st.ki) {
        // Einstieg: Wert unter kiUnter, in dieser Runde noch nicht benutzt, Fläche liegt kiVorlauf m (oder weniger) voraus, Auto auf der Straße
        const q = n.seitenabstand * P.seite;
        if (z.punkte >= wert(C.kiUnter, 40) || benutzt || !(vor > 14 && vor <= wert(C.kiVorlauf, 90))) return null;
        if (Math.abs(n.seitenabstand) > this.strecke.breite / 2 + (this.strecke.randBreite || 2)) return null;
        void q;
        st.ki = 'an'; st.kiZeit = 0; st.kiQ0 = n.seitenabstand * P.seite; st.kiWarte = 0; st.kiBox = (i % 2 === 0) ? 1 : 0;
      }
      st.kiZeit += dt;
      const box = this.boxMitte(st.kiBox);
      if (st.ki === 'an') {
        if (benutzt || st.kiZeit > 30) { st.ki = null; return this._kiFreigeben(f); }
        const dsBox = sp.differenzS(box.s, n.s);           // > 0: Box liegt voraus
        const qs = n.seitenabstand * P.seite;
        const vor0 = Math.max(0, v.vLaengs), blick = klemme(6 + vor0 * 0.5, 6, 22);
        // Zielpunkt: Seitenlage in zwei weichen Stufen – erst (ab 80 m vor der Box) auf den Fahrbahnrand der Werkstattseite,
        // dann (26 → 3 m vor der Box) schräg über Randstreifen und Zufahrt auf die Box-Mitte. So bleibt das Auto bis kurz vorher auf Asphalt.
        const dZiel = Math.max(dsBox - blick, 0);
        const qRand = Math.max(1.5, this.strecke.breite / 2 - 2.4);
        const u1 = glatt(0, 1, (80 - dZiel) / 35), u2 = glatt(0, 1, (26 - dZiel) / 23);
        const qZiel = (st.kiQ0 * (1 - u1) + qRand * u1) * (1 - u2) + box.qs * u2;
        const sZiel = dsBox - blick > 0 ? n.s + blick : box.s;
        const w = this.welt(sZiel, dsBox - blick > 0 ? qZiel : box.qs);
        // Pure Pursuit wie driver.js / test_reset_anlauf
        const dx = w.x - v.x, dz = w.z - v.z, dist = Math.hypot(dx, dz) || 1;
        let diff = Math.atan2(-dx, -dz) - v.heading;      // heading: Vorwärts = (−sin h, −cos h)
        while (diff > Math.PI) diff -= 2 * Math.PI;
        while (diff < -Math.PI) diff += 2 * Math.PI;
        const vl = Math.max(3, vor0);
        // Vorzeichen wie test_reset_anlauf: lenkung = −(2·v·sin α / Abstand) / drehrateMax
        const lenkung = klemme(-(2 * vl * Math.sin(diff) / dist) / v.drehrateMax(vl), -1, 1);
        // Tempo: bis zur Box bremsen (v² = 2·a·Restweg); beim Einscheren (letzte 30 m) höchstens 11 m/s
        const rest = Math.max(0, dsBox - 0.3);
        let vSoll = Math.min(wert(C.kiTempo, 22), Math.sqrt(2 * wert(C.kiBremse, 6) * rest) + 0.3);
        if (dsBox < 30) vSoll = Math.min(vSoll, 11);
        // auf der Fläche und fast stehend → fertig angekommen
        if (this.istDrin(n) && vor0 < wert(C.steheTempo, 1) * 0.9) { st.ki = 'steht'; st.kiWarte = 0; return { gas: 0, bremse: 0, lenkung: 0 }; }
        const gas = vor0 < vSoll - 0.5 ? klemme((vSoll - vor0) * 0.5, 0.15, 1) : 0;
        const bremse = vor0 > vSoll + 1.0 ? klemme((vor0 - vSoll) * 0.25, 0.15, 1) : 0;
        return { gas, bremse, lenkung };
      }
      if (st.ki === 'steht') {
        st.kiWarte += dt;
        const fertig = z.punkte >= wert(C.kiBis, 100) || benutzt || st.kiWarte > wert(C.kiMaxWarten, 9) + 1.5;
        if (fertig || !this.istDrin(n)) { st.ki = null; return this._kiFreigeben(f); }
        // stehen: bremsen nur solange das Auto noch vorwärts rollt (Bremse im Stand würde rückwärts fahren lassen)
        return { gas: v.vLaengs < -0.3 ? 0.2 : 0, bremse: v.vLaengs > 0.3 ? 1 : 0, lenkung: 0 };
      }
      return null;
    }
    _kiFreigeben(f) {
      if (f.driver && f.driver.zurueckgesetzt) f.driver.zurueckgesetzt(f.index);
      if (f.autopilot && f.autopilot.zurueckgesetzt) f.autopilot.zurueckgesetzt();
      return null;
    }

    // ---------------------------------------------------------- Grafik (braucht THREE)
    /** Gruppe 'Werkstatt' bauen (Fläche, Markierung, Gebäude, Schild, Lampe) und Gebäude-Säulen in strecke.saeulen eintragen. */
    bauen() {
      const P = this.platz;
      if (!P || typeof THREE === 'undefined') return null;
      const strecke = this.strecke, g = new THREE.Group();
      g.name = 'Werkstatt';
      const mat = (c) => new THREE.MeshLambertMaterial({ color: c });
      const hoehe = (x, z) => strecke.hoeheAn(x, z);
      // --- Fläche und Markierungen als Gitter, das dem Gelände folgt ---
      const flaeche = (s0, s1, q0, q1, farbe, dy, nS, nQ, versatz) => {
        const pos = [], idx = [];
        nS = nS || 1; nQ = nQ || 1;
        for (let a = 0; a <= nS; a++) for (let c = 0; c <= nQ; c++) {
          const w = this.welt(s0 + (s1 - s0) * a / nS, q0 + (q1 - q0) * c / nQ);
          pos.push(w.x, hoehe(w.x, w.z) + dy, w.z);
        }
        for (let a = 0; a < nS; a++) for (let c = 0; c < nQ; c++) {
          const i0 = a * (nQ + 1) + c, i1 = i0 + 1, i2 = i0 + nQ + 1, i3 = i2 + 1;
          idx.push(i0, i2, i1, i1, i2, i3);
        }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
        geo.setIndex(idx); geo.computeVertexNormals();
        const m = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color: farbe, side: THREE.DoubleSide, polygonOffset: true,
          polygonOffsetFactor: -2 - (versatz || 0), polygonOffsetUnits: -2 - (versatz || 0) }));
        // Normalen nach oben erzwingen (Gitter kann je nach Seite gespiegelt sein)
        const nrm = geo.attributes.normal; for (let k = 0; k < nrm.count; k++) if (nrm.getY(k) < 0) nrm.setXYZ(k, -nrm.getX(k), -nrm.getY(k), -nrm.getZ(k));
        return m;
      };
      const s0 = P.s - P.laenge / 2, s1 = P.s + P.laenge / 2;
      g.add(flaeche(s0, s1, P.qA, P.qB, 0x4b4f55, 0.07, 8, 3));
      const l = 0.14;   // Linienbreite
      const linie = (a0, a1, b0, b1) => g.add(flaeche(a0, a1, b0, b1, 0xf2f2ee, 0.09, Math.max(1, Math.round(Math.abs(a1 - a0) / 3)), 1, 1));
      linie(s0 + 0.2, s1 - 0.2, P.qA + 0.15, P.qA + 0.15 + l);                // zur Straße
      linie(s0 + 0.2, s1 - 0.2, P.qB - 0.15 - l, P.qB - 0.15);                // zum Gebäude
      linie(s0 + 0.2, s0 + 0.2 + l, P.qA + 0.15, P.qB - 0.15);                // hinten
      linie(s1 - 0.2 - l, s1 - 0.2, P.qA + 0.15, P.qB - 0.15);                // vorn
      linie(P.s - l / 2, P.s + l / 2, P.qA + 0.15, P.qB - 0.15);              // Trennlinie der zwei Boxen
      // gelb-schwarze Warnstreifen an der Hallenseite
      for (let k = 0; k < 8; k++) {
        const a = s0 + 0.6 + k * (P.laenge - 1.2) / 8, b = a + (P.laenge - 1.2) / 16;
        g.add(flaeche(a, b, P.qB - 0.15 - 0.7, P.qB - 0.15 - l - 0.02, 0xf2c200, 0.1, 1, 1, 2));
      }
      // --- Gebäude (lokale Achsen: −z = Fahrtrichtung, x = zur Werkstatt-Seite) ---
      const m0 = this.welt(P.s, P.gebQ), hGeb = wert(cfg().gebaeudeHoehe, 4.4), breiteG = P.gebBreite, tiefeG = P.gebTiefe;
      const yb = Math.max(hoehe(m0.x, m0.z), hoehe(this.welt(P.s - breiteG / 2, P.gebQ).x, this.welt(P.s - breiteG / 2, P.gebQ).z), hoehe(this.welt(P.s + breiteG / 2, P.gebQ).x, this.welt(P.s + breiteG / 2, P.gebQ).z));
      const halle = new THREE.Group();
      halle.position.set(m0.x, yb, m0.z);
      halle.rotation.y = Math.atan2(-m0.tx, -m0.tz) * 1;     // wie Auto-Heading: −z = Fahrtrichtung
      // x-Achse der Gruppe = rechts der Fahrtrichtung; liegt die Werkstatt links (seite −1), zeigt „zur Straße“ nach +x
      const zurStrasse = -P.seite;                              // Vorzeichen der x-Achse in Richtung Straße
      const box = (w, h, d, farbe, x, y, z) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(farbe)); m.position.set(x, y, z); halle.add(m); return m; };
      box(tiefeG, 1.6, breiteG, 0x6d7076, 0, -0.7, 0);                                   // Fundament (reicht ins Gelände)
      box(tiefeG, hGeb, breiteG, 0xd8dde4, 0, hGeb / 2, 0);                              // Wände
      box(tiefeG + 0.7, 0.35, breiteG + 0.7, 0xa8382c, 0, hGeb + 0.17, 0);               // Dach
      // zwei Rolltore zur Straße
      const tx = zurStrasse * (tiefeG / 2 + 0.04);
      for (const dz of [-3.1, 3.1]) {
        box(0.1, 3.2, 4.4, 0x3b414a, tx, 1.6, dz);
        for (let k = 0; k < 5; k++) box(0.06, 0.08, 4.4, 0x59616c, tx + zurStrasse * 0.04, 0.6 + k * 0.55, dz);
      }
      box(0.08, 0.7, 11.2, 0x2f6fd0, tx, hGeb - 0.5, 0);                                 // blaues Band über den Toren
      // Dachschild
      const tafel = this._tafel(true);
      if (tafel) {
        tafel.scale.set(1, 1, 1);
        tafel.position.set(tx + zurStrasse * 0.1, hGeb + 1.35, 0);
        tafel.rotation.y = zurStrasse > 0 ? Math.PI / 2 : -Math.PI / 2;
        halle.add(tafel);
        const stuetze = (dz) => box(0.12, 1.3, 0.12, 0x555a62, tx, hGeb + 0.8, dz);
        stuetze(-2.6); stuetze(2.6);
      }
      g.add(halle);
      // feste Gebäude-Säulen für die Kollision (drei Kreise entlang der Straßenseite des Gebäudes)
      const sa = [];
      for (const ds of [-4, 0, 4]) { const w = this.welt(P.s + ds, P.gebQ - tiefeG / 2 + 1.2); sa.push({ x: w.x, z: w.z, r: 2.6, art: 'werkstatt' }); }
      strecke.saeulen = (strecke.saeulen || []).concat(sa);
      this._saeulen = sa;
      // --- Schild-Pfosten am Zufahrtsanfang (zur Straße gedreht, schaut dem Verkehr entgegen) ---
      const sp0 = this.welt(P.s - P.laenge / 2 - 1.5, P.qA + 0.4);
      const schild = new THREE.Group();
      schild.position.set(sp0.x, hoehe(sp0.x, sp0.z), sp0.z);
      schild.rotation.y = Math.atan2(-sp0.tx, -sp0.tz);
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.16, 3.0, 0.16), mat(0x666b73)); post.position.y = 1.5; schild.add(post);
      const brett = this._tafel(false);
      if (brett) { brett.position.set(0, 3.0, 0.12); schild.add(brett); }
      const lampeMat = new THREE.MeshBasicMaterial({ color: 0x33dd55 });
      const lampe = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), lampeMat); lampe.position.set(0, 4.05, 0.05); schild.add(lampe);
      g.add(schild);
      this._lampe = lampeMat; this._brett = brett;
      // Hütchen am Anfang und Ende der Fläche
      for (const [ds, qs] of [[-P.laenge / 2 + 0.5, P.qA + 0.9], [P.laenge / 2 - 0.5, P.qA + 0.9]]) {
        const w = this.welt(P.s + ds, qs), kegel = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.7, 10), mat(0xff6a1a));
        kegel.position.set(w.x, hoehe(w.x, w.z) + 0.38, w.z); g.add(kegel);
        const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.22, 0.12, 10), mat(0xf4f4f0)); ring.position.set(w.x, hoehe(w.x, w.z) + 0.42, w.z); g.add(ring);
      }
      this._gruppe = g;
      return g;
    }

    /** Beschriftete Tafel (Canvas); dach = große Hallentafel. Zwei Zustände: bereit / benutzt (nur die Straßen-Tafel wechselt). */
    _tafel(dach) {
      if (typeof document === 'undefined') return null;
      const zeichne = (benutzt) => {
        const c = document.createElement('canvas');
        c.width = 512; c.height = dach ? 128 : 192;
        const x = c.getContext('2d');
        if (!x) return null;
        x.fillStyle = benutzt ? '#8a2a2a' : '#1f6fd1'; x.fillRect(0, 0, c.width, c.height);
        x.strokeStyle = '#fff'; x.lineWidth = 8; x.strokeRect(6, 6, c.width - 12, c.height - 12);
        // Schraubenschlüssel (gezeichnet, keine Emoji-Schrift nötig)
        x.save(); x.translate(70, c.height / 2); x.rotate(-0.8); x.fillStyle = '#ffe14a';
        x.fillRect(-8, -42, 16, 84); x.beginPath(); x.arc(0, -46, 24, 0, Math.PI * 2); x.fill();
        x.fillStyle = benutzt ? '#8a2a2a' : '#1f6fd1'; x.fillRect(-9, -76, 18, 26);
        x.beginPath(); x.arc(0, 46, 20, 0, Math.PI * 2); x.fillStyle = '#ffe14a'; x.fill(); x.restore();
        x.fillStyle = '#fff'; x.textAlign = 'center'; x.textBaseline = 'middle';
        if (dach) { x.font = 'bold 76px sans-serif'; x.fillText('WERKSTATT', 318, 66, 370); }
        else if (!benutzt) {
          x.font = 'bold 60px sans-serif'; x.fillText('WERKSTATT', 318, 62, 370);
          x.font = 'bold 36px sans-serif'; x.fillStyle = '#ffe14a'; x.fillText('Anhalten = reparieren', 318, 112, 370);
          x.fillStyle = '#fff'; x.font = 'bold 30px sans-serif'; x.fillText('1× pro Runde', 318, 156, 370);
        } else {
          x.font = 'bold 56px sans-serif'; x.fillText('WERKSTATT', 318, 58, 370);
          x.font = 'bold 36px sans-serif'; x.fillStyle = '#ffd0d0'; x.fillText('schon benutzt', 318, 108, 370);
          x.font = 'bold 30px sans-serif'; x.fillText('nächste Runde wieder', 318, 152, 370);
        }
        const tex = new THREE.CanvasTexture(c);
        if (THREE.sRGBEncoding !== undefined && tex.encoding !== undefined) tex.encoding = THREE.sRGBEncoding;
        return tex;
      };
      const frei = zeichne(false);
      if (!frei) return null;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(dach ? 8 : 2.6, dach ? 2 : 0.975), new THREE.MeshBasicMaterial({ map: frei, side: THREE.DoubleSide }));
      m.name = dach ? 'WerkstattDach' : 'WerkstattSchild';
      if (!dach) { m.userData.texFrei = frei; m.userData.texBenutzt = zeichne(true); m.userData.benutzt = false; }
      return m;
    }

    /** Je Frame: Schild/Lampe zeigen den Zustand des nächsten Menschen (grün = frei in dieser Runde, rot = schon benutzt), Lampe pulsiert beim Heilen. */
    animieren(t, fahrzeuge) {
      if (!this._lampe || !this.platz) return;
      const P = this.platz, sp = this.strecke.spline;
      let best = null, bestD = 1e9, heilt = false;
      for (let i = 0; i < (fahrzeuge || []).length; i++) {
        const f = fahrzeuge[i], st = this.st[i];
        if (!f || !f.istSpieler || f.autopilot || !f.nah) continue;
        const d = Math.abs(sp.differenzS(f.nah.s, P.s));
        if (st && st.heilt) heilt = true;
        if (d < bestD) { bestD = d; best = i; }
      }
      let benutzt = false;
      if (best !== null && bestD < 150) {
        const st = this.st[best];
        benutzt = !!(st && st.benutztRunde >= 0 && st.benutztRunde === st.aktRunde);
      }
      const frei = !benutzt;
      const puls = heilt ? 0.55 + 0.45 * Math.sin(t * 14) : 1;
      this._lampe.color.setRGB(frei ? 0.2 * puls : 0.95, frei ? 0.9 * puls : 0.15, frei ? 0.33 * puls : 0.12);
      const b = this._brett;
      if (b && b.userData.benutzt !== benutzt && b.userData.texBenutzt) {
        b.userData.benutzt = benutzt;
        b.material.map = benutzt ? b.userData.texBenutzt : b.userData.texFrei;
        b.material.needsUpdate = true;
      }
    }

    zerstoeren() {
      if (this.strecke && this._saeulen && this.strecke.saeulen) this.strecke.saeulen = this.strecke.saeulen.filter(s => this._saeulen.indexOf(s) < 0);
      this._saeulen = null;
      if (this._gruppe) {
        this._gruppe.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) { if (o.material.map) o.material.map.dispose(); o.material.dispose(); } });
        if (this._gruppe.parent) this._gruppe.parent.remove(this._gruppe);
      }
      this._gruppe = null; this._lampe = null; this._brett = null; this._hoerer = [];
    }
  }

  /** Halbe Fahrbahnbreite (Hilfsfunktion). */
  function strecke_b(st) { return st.breite / 2; }

  Werkstatt.platzSuchen = platzSuchen;
  R.Werkstatt = Werkstatt;
})();
