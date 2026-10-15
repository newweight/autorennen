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
    // v25: Zonen anderer Module (Tribünen, Verkehr …): strecke.tribuenen / strecke.sperrzonen / strecke.sperrzonenExtern = [{ s0, s1 } | { s }] – großzügig meiden
    ['sperrzonen', 'sperrzonenExtern'].forEach((k) => { if (Array.isArray(strecke[k])) strecke[k].forEach(e => dazu(e, 12)); });
    // Tribünen (world/tribuenen.js: { s (Mitte), laenge }): ganze Länge + 12 m frei lassen (Standfläche liegt hinter der Bande, Zuschauer/Fahnen davor)
    (strecke.tribuenen || []).forEach((t) => { if (t && typeof t.s === 'number') liste.push({ s0: t.s - (t.laenge || 30) / 2 - 12, s1: t.s + (t.laenge || 30) / 2 + 12 }); });
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
    const laenge = wert(C.laenge, 35);
    const zufahrt = wert(C.zufahrt, 18), ausfahrt = wert(C.ausfahrt, 10);
    const b = strecke.breite / 2, rb = strecke.randBreite || 2;
    const qE = b + rb;                                      // Kante des Randstreifens (Anfang des Asphalt-Keils)
    const qA = qE + wert(C.randAbstand, 0.4);
    const koll = strecke.pflanzenKollider || [];
    const gebB = Math.min(wert(C.gebaeudeBreite, 31), laenge - 2);
    // Feste Säulen (Schildmasten, Warnlichter, Laternen, Startbogen, Looping-Beine …), ohne die der Werkstatt selbst
    const saeulen = (strecke.saeulen || []).filter(c => c.art !== 'werkstatt' && typeof c.x === 'number');
    const saeulenNah = saeulen.map((c) => { const n = sp.naechster(c.x, c.z); return { s: n.s, q: n.seitenabstand, r: c.r || 0.3 }; });
    // Stufen: 1 streng; 2 Flecken/Äste/Klebestreifen auf der Straße stören nicht; 3 + doppelte Krümmung, Anlauf nur ±40 m; 4 + vierfach, nur Wracks,
    // Zufahrt/Ausfahrt nur ±6 m geprüft; 5 + Bäume dürfen im Gebäude stehen (nur die Fläche muss frei sein); 6 (letzte Rettung) wie 5 mit
    // ganz lockerer Krümmung; bei 5 und 6 werden Bäume/Büsche/Felsen in Gebäude/Zufahrt (6: auch Fläche) beim Bauen entfernt (freiraeumen) – nie Sperrzonen.
    const STUFEN = [{ k: 1, hind: 'alle', kleber: true, anlaufVoll: true, keil: true }, { k: 1, hind: 'seite', kleber: false, anlaufVoll: true, keil: true },
      { k: 2, hind: 'seite', kleber: false, anlaufVoll: false, keil: true }, { k: 4, hind: 'wenig', kleber: false, anlaufVoll: false, eng: 16 },
      { k: 4, hind: 'wenig', kleber: false, anlaufVoll: false, eng: 16, baumNurFlaeche: true, raeumenGeb: true },
      { k: 8, hind: 'wenig', kleber: false, anlaufVoll: false, eng: 12, baumNurFlaeche: true, raeumen: true }];
    for (const stufe of STUFEN) {
      const faktor = stufe.k, liste = sperrListe(strecke, stufe);
      const vorn = laenge / 2 + (stufe.keil ? zufahrt : 6), hinten = laenge / 2 + (stufe.keil ? ausfahrt : 6);   // Prüfbereich um s (vorn = gegen die Fahrtrichtung)
      const kern = laenge / 2 + 6;
      const maxK = wert(C.maxKruemmung, 0.0022) * faktor;
      // sucheAb = Mindestabstand des Zufahrt-Keils zur Startlinie, 120 m vor dem Ziel muss die Ausfahrt zu Ende sein (Startaufstellung / Zielraum bleiben frei)
      const sMin = Math.max(wert(C.sucheAb, 85) + laenge / 2 + zufahrt, wert(C.mitteAb, 0)), sMax = Ls - 120 - laenge / 2 - ausfahrt;   // (Keil wird immer gezeichnet, auch wenn Stufe ≥ 4 ihn nicht prüft)
      for (let s = sMin; s < Math.min(sMax, wert(C.sucheBis, Infinity)); s += 6) {
        // Fenster: Fläche (samt Rand) fast gerade, normale Breite, keine Sperrzone; Zufahrt/Ausfahrt ohne Sperrzone
        let ok = true;
        for (let k = -vorn; k <= hinten && ok; k += 4) {
          const p = sp.punktBei(s + k);
          if (Math.abs(k) <= kern && Math.abs(p.kruemmung) > maxK) ok = false;
          else if (strecke.breiteBei && Math.abs(strecke.breiteBei(s + k) - strecke.breite) > 0.01) ok = false;
          else if (gesperrt(strecke, liste, s + k)) ok = false;
        }
        if (!ok) continue;
        for (const seite of [1, -1]) {
          // Platz bis zur Bande (grenzeBei): Fläche bis breite m (mindestens 4,4 m), Gebäude (mindestens 2,4 m tief) bekommt den Rest;
          // enge Zäune (Wald): Gebäude darf bis knapp hinter die Bande reichen (unerreichbar für Autos)
          let grenze = Infinity;
          for (let k = -gebB / 2; k <= gebB / 2; k += 3) grenze = Math.min(grenze, strecke.grenzeBei ? strecke.grenzeBei(s + k) : strecke.seitenabstandMax);
          for (let k = -laenge / 2; k <= laenge / 2; k += 3) grenze = Math.min(grenze, strecke.grenzeBei ? strecke.grenzeBei(s + k) : strecke.seitenabstandMax);
          const aussenMax = grenze + 0.3;
          const breite = klemme(aussenMax - qA - 0.5 - wert(C.gebaeudeTiefe, 5.5), 4.4, wert(C.breite, 6.4));
          const qB = qA + breite, gebQ0 = qB + 0.5, tiefe = Math.min(wert(C.gebaeudeTiefe, 5.5), aussenMax - gebQ0);
          if (tiefe < 2.4 || qB > grenze - 1.8) continue;
          const aussen = gebQ0 + tiefe;
          // Feste Säulen im Weg (Fläche, Keil, Gebäude)? Nie räumbar.
          let frei = true;
          for (let k = 0; k < saeulenNah.length && frei; k++) {
            const c = saeulenNah[k], ds = sp.differenzS(c.s, s), q = c.q * seite;
            if (ds < -(vorn + c.r) || ds > hinten + c.r) continue;
            if (q + c.r > qE - 0.3 && q - c.r < aussen + 1) frei = false;
          }
          if (!frei) continue;
          // Bäume/Felsen/Büsche im Weg? (Pflanzen-Kollider zwischen Straße und Zaun) – Fläche + Gebäude, bei Stufen 1–3 auch Zufahrt/Ausfahrt
          if (!stufe.raeumen) for (let k = 0; k < koll.length && frei; k++) {
            const c = koll[k], q = c.seitenabstand * seite, ds = sp.differenzS(c.s, s);
            if (q + c.r <= qE - 0.3) continue;
            const imKern = Math.abs(ds) <= Math.max(laenge, gebB) / 2 + c.r + 2 && q + c.r > qA - 1 && q - c.r < (stufe.baumNurFlaeche ? qB + 0.5 : aussen + 1.5);
            const imKeil = stufe.keil && ds >= -(laenge / 2 + zufahrt + c.r) && ds <= laenge / 2 + ausfahrt + c.r && q - c.r < qB + 0.5;
            if (imKern || imKeil) frei = false;
          }
          if (!frei) continue;
          return { s: sp.wrapS(s), seite, qA, qB, qE, laenge, breite, gebTiefe: tiefe, gebBreite: gebB, gebQ: gebQ0 + tiefe / 2, grenze, kruemmungMax: maxK,
            zufahrt, ausfahrt, boxen: Math.max(2, Math.round(laenge / wert(C.boxLaenge, 9))), raeumen: !!(stufe.raeumen || stufe.raeumenGeb), stufe: STUFEN.indexOf(stufe) + 1 };
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
      this.platz = (opt && opt.platz) || platzSuchen(strecke, opt && opt.suche);
      this.gemeinsam = (opt && opt.gemeinsam) || null;     // zweite Werkstatt (Megastrecke): „einmal je Runde“ gilt für beide zusammen
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
    _s(i) {
      if (this.st[i]) return this.st[i];
      const st = this.st[i] = { drin: false, heilt: false, runde: -1, benutztRunde: -1, ki: null, kiZeit: 0, kiQ0: 0, kiWarte: 0, letzte10: 0, zeigt: 'aus' };
      if (this.gemeinsam) {       // benutztRunde liegt in einer Liste, die beide Werkstätten teilen
        const g = this.gemeinsam;
        Object.defineProperty(st, 'benutztRunde', { enumerable: true, get: () => (g[i] === undefined ? -1 : g[i]), set: (v) => { g[i] = v; } });
      }
      return st;
    }

    // ---------------------------------------------------------- Geometrie
    /** Welt-Punkt zu Bogenlänge s und Querabstand qs (m, + = Seite der Werkstatt). */
    welt(s, qs) {
      const p = this.strecke.spline.punktBei(s), q = qs * this.platz.seite;
      return { x: p.x + p.nx * q, z: p.z + p.nz * q, tx: p.tx, tz: p.tz, nx: p.nx * this.platz.seite, nz: p.nz * this.platz.seite, s: p.s };
    }
    /** Mitte der Box k (0 = hinterste … boxen − 1 = vorderste in Fahrtrichtung; v25: 4 Boxen auf 35 m): { x, z, s, qs }. */
    boxMitte(k) {
      const P = this.platz, n = P.boxen || 2;
      const s = P.s + ((Math.max(0, Math.min(n - 1, k)) + 0.5) / n - 0.5) * P.laenge, qs = (P.qA + P.qB) / 2;
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

    /** Untergrund für main.js: Fläche = 'strasse', Zufahrt/Ausfahrt (weicher Keil + Lücke zum Randstreifen) = 'rand' statt Gras. */
    untergrund(v, n) {
      const P = this.platz;
      if (!P || !n || !v || (v.untergrund !== 'gras' && v.untergrund !== 'sand' && v.untergrund !== 'rand')) return null;
      const ds = this.strecke.spline.differenzS(n.s, P.s);
      if (ds > P.laenge / 2 + (P.ausfahrt || 3) || ds < -(P.laenge / 2 + (P.zufahrt || 12))) return null;       // Zufahrt (18 m) vor der Fläche bis Ausfahrt (10 m) dahinter
      const qs = n.seitenabstand * P.seite, qE = P.qE !== undefined ? P.qE : P.qA - 0.4;
      if (qs < this.strecke.breite / 2) return null;                              // Fahrbahn selbst: nichts ändern
      if (Math.abs(ds) <= P.laenge / 2 + 0.2 && qs <= P.qB + 0.2 && qs >= P.qA - 0.2) return 'strasse';
      if (qs > qE + this.keilBreite(ds) + 1.2) return null;                        // außerhalb des Keils (Breite des Asphalt-Keils + 1,2 m Toleranz)
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
        st.ki = 'an'; st.kiZeit = 0; st.kiQ0 = n.seitenabstand * P.seite; st.kiWarte = 0; st.kiBox = i % (P.boxen || 2);
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
        // (v25) Bezugspunkt für das Einscheren ist der Anfang der langen Fläche (Box kann bis 30 m weiter hinten liegen)
        const dEin = Math.min(dsBox, Math.max(vor, 0) + 6);
        const dZiel = Math.max(dEin - blick, 0);
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
        if (dEin < 30 || dsBox < 30) vSoll = Math.min(vSoll, 11);
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
    /** Gruppe 'Werkstatt' bauen (Fläche, Zufahrt-Keil, Markierungen, Halle in Segmenten, Schild, Lampe) und Gebäude-Säulen in strecke.saeulen eintragen. */
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
        return this._netz(pos, idx, farbe, versatz);
      };
      const s0 = P.s - P.laenge / 2, s1 = P.s + P.laenge / 2, qE = P.qE !== undefined ? P.qE : P.qA - 0.4;
      const nSeg = Math.max(2, Math.ceil(P.laenge / 3));
      g.add(flaeche(s0, s1, qE - 0.05, P.qA + 0.1, 0x4b4f55, 0.065, nSeg, 1));        // Lücke zwischen Randstreifen und Fläche schließen
      g.add(flaeche(s0, s1, P.qA, P.qB, 0x4b4f55, 0.07, nSeg, 3));
      // Zufahrt vorn / Ausfahrt hinten: weiche Keile von der Straßenkante auf die Fläche (Breite = keilBreite, Glättung wie im Logik-Teil)
      const keil = (sFern, sNah) => {
        const N = 8, pos = [], idx = [];
        for (let k = 0; k <= N; k++) {
          const sk = sFern + (sNah - sFern) * k / N, w = this.keilBreite(sk - P.s);
          for (const q of [qE - 0.05, qE + Math.max(0.02, w)]) { const p = this.welt(sk, q); pos.push(p.x, hoehe(p.x, p.z) + 0.06, p.z); }
        }
        for (let k = 0; k < N; k++) { const i0 = k * 2; idx.push(i0, i0 + 2, i0 + 1, i0 + 1, i0 + 2, i0 + 3); }
        return this._netz(pos, idx, 0x4b4f55, 0);
      };
      g.add(keil(s0 - P.zufahrt, s0));
      g.add(keil(s1, s1 + P.ausfahrt));
      const l = 0.14;   // Linienbreite
      const linie = (a0, a1, b0, b1) => g.add(flaeche(a0, a1, b0, b1, 0xf2f2ee, 0.09, Math.max(1, Math.round(Math.abs(a1 - a0) / 3)), 1, 1));
      linie(s0 + 0.2, s1 - 0.2, P.qA + 0.15, P.qA + 0.15 + l);                // zur Straße
      linie(s0 + 0.2, s1 - 0.2, P.qB - 0.15 - l, P.qB - 0.15);                // zum Gebäude
      linie(s0 + 0.2, s0 + 0.2 + l, P.qA + 0.15, P.qB - 0.15);                // hinten
      linie(s1 - 0.2 - l, s1 - 0.2, P.qA + 0.15, P.qB - 0.15);                // vorn
      const nBox = P.boxen || 2;
      for (let k = 1; k < nBox; k++) { const sk = s0 + P.laenge * k / nBox; linie(sk - l / 2, sk + l / 2, P.qA + 0.15, P.qB - 0.15); }   // Trennlinien der Boxen
      // gelb-schwarze Warnstreifen an der Hallenseite (Teilung ≈ 1,5 m wie in v18)
      const nStr = Math.max(8, Math.round((P.laenge - 1.2) / 1.5));
      for (let k = 0; k < nStr; k++) {
        const a = s0 + 0.6 + k * (P.laenge - 1.2) / nStr, b = a + (P.laenge - 1.2) / nStr / 2;
        g.add(flaeche(a, b, P.qB - 0.15 - 0.7, P.qB - 0.15 - l - 0.02, 0xf2c200, 0.1, 1, 1, 2));
      }
      // --- Halle: ein Segment je Box (folgt der Kurve; lokale Achsen: −z = Fahrtrichtung, x = zur Werkstatt-Seite) ---
      const hGeb = wert(cfg().gebaeudeHoehe, 4.4), breiteG = P.gebBreite, tiefeG = P.gebTiefe;
      const nHalle = nBox, segB = breiteG / nHalle;
      const zurStrasse = -P.seite;                              // Vorzeichen der x-Achse in Richtung Straße
      const tx = zurStrasse * (tiefeG / 2 + 0.04);
      let ybMax = -1e9;
      const segmente = [];
      for (let k = 0; k < nHalle; k++) {
        const ds = (k + 0.5) / nHalle * breiteG - breiteG / 2;
        const m0 = this.welt(P.s + ds, P.gebQ), ma = this.welt(P.s + ds - segB / 2, P.gebQ), mb = this.welt(P.s + ds + segB / 2, P.gebQ);
        const yb = Math.max(hoehe(m0.x, m0.z), hoehe(ma.x, ma.z), hoehe(mb.x, mb.z));
        ybMax = Math.max(ybMax, yb);
        const halle = new THREE.Group();
        halle.position.set(m0.x, yb, m0.z);
        halle.rotation.y = Math.atan2(-m0.tx, -m0.tz);     // wie Auto-Heading: −z = Fahrtrichtung
        const box = (w, h, d, farbe, x, y, z) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(farbe)); m.position.set(x, y, z); halle.add(m); return m; };
        const bw = segB + 0.06;                            // Segmente überlappen leicht (keine Spalten in Kurven)
        box(tiefeG, 1.6, bw, 0x6d7076, 0, -0.7, 0);                                  // Fundament (reicht ins Gelände)
        box(tiefeG, hGeb, bw, 0xd8dde4, 0, hGeb / 2, 0);                             // Wände
        box(tiefeG + 0.7, 0.35, bw + 0.7, 0xa8382c, 0, hGeb + 0.17, 0);              // Dach
        const tw = Math.min(4.4, segB - 1.6);                                        // ein Rolltor je Box
        box(0.1, 3.2, tw, 0x3b414a, tx, 1.6, 0);
        for (let j = 0; j < 5; j++) box(0.06, 0.08, tw, 0x59616c, tx + zurStrasse * 0.04, 0.6 + j * 0.55, 0);
        box(0.08, 0.7, Math.max(1, segB - 0.8), 0x2f6fd0, tx, hGeb - 0.5, 0);        // blaues Band über dem Tor
        g.add(halle); segmente.push(halle);
      }
      // Dachschild (große Hallentafel) in der Mitte
      const tafel = this._tafel(true);
      if (tafel) {
        const mm = this.welt(P.s, P.gebQ), mitte = new THREE.Group();
        mitte.position.set(mm.x, ybMax, mm.z);
        mitte.rotation.y = Math.atan2(-mm.tx, -mm.tz);
        tafel.scale.set(1, 1, 1);
        tafel.position.set(tx + zurStrasse * 0.1, hGeb + 1.35, 0);
        tafel.rotation.y = zurStrasse > 0 ? Math.PI / 2 : -Math.PI / 2;
        mitte.add(tafel);
        for (const dz of [-2.6, 2.6]) { const st = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.3, 0.12), mat(0x555a62)); st.position.set(tx, hGeb + 0.8, dz); mitte.add(st); }
        g.add(mitte);
      }
      // feste Gebäude-Säulen für die Kollision (Kreise alle 4 m entlang der Straßenseite des Gebäudes)
      const sa = [];
      for (let ds = -breiteG / 2 + 2; ds <= breiteG / 2 - 2 + 0.01; ds += 4) { const w = this.welt(P.s + ds, P.gebQ - tiefeG / 2 + 1.2); sa.push({ x: w.x, z: w.z, r: 2.6, art: 'werkstatt' }); }
      strecke.saeulen = (strecke.saeulen || []).concat(sa);
      this._saeulen = sa;
      // --- Schild-Pfosten vor dem Zufahrt-Keil (zur Straße gedreht, schaut dem Verkehr entgegen) ---
      const sp0 = this.welt(s0 - P.zufahrt - 2, qE + 1.4);
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
      // Hütchen: Anfang und Ende der Fläche sowie entlang der Keile
      const huetchen = [[-P.laenge / 2 + 0.5, P.qA + 0.9], [P.laenge / 2 - 0.5, P.qA + 0.9]];
      for (const t of [0.3, 0.65]) huetchen.push([-P.laenge / 2 - P.zufahrt * (1 - t) * 1, qE + this.keilBreite(-P.laenge / 2 - P.zufahrt * (1 - t)) + 0.5]);
      huetchen.push([P.laenge / 2 + P.ausfahrt * 0.5, qE + this.keilBreite(P.laenge / 2 + P.ausfahrt * 0.5) + 0.5]);
      for (const [ds, qs] of huetchen) {
        const w = this.welt(P.s + ds, qs), kegel = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.7, 10), mat(0xff6a1a));
        kegel.position.set(w.x, hoehe(w.x, w.z) + 0.38, w.z); g.add(kegel);
        const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.22, 0.12, 10), mat(0xf4f4f0)); ring.position.set(w.x, hoehe(w.x, w.z) + 0.42, w.z); g.add(ring);
      }
      this._gruppe = g;
      return g;
    }

    /** Gitter-Mesh aus Positionen/Indizes (Oberseite nach oben, leicht vor den Boden gezogen). */
    _netz(pos, idx, farbe, versatz) {
      // Umlaufsinn so wählen, dass die Vorderseite nach OBEN zeigt (sonst dreht DoubleSide die Normale um → fast schwarze Fläche)
      let ny = 0;
      for (let t = 0; t < idx.length; t += 3) {
        const a = idx[t] * 3, b = idx[t + 1] * 3, c = idx[t + 2] * 3;
        ny += (pos[b + 2] - pos[a + 2]) * (pos[c] - pos[a]) - (pos[b] - pos[a]) * (pos[c + 2] - pos[a + 2]);
      }
      if (ny < 0) for (let t = 0; t < idx.length; t += 3) { const x = idx[t + 1]; idx[t + 1] = idx[t + 2]; idx[t + 2] = x; }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.setIndex(idx); geo.computeVertexNormals();
      const m = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color: farbe, side: THREE.DoubleSide, polygonOffset: true,
        polygonOffsetFactor: -2 - (versatz || 0), polygonOffsetUnits: -2 - (versatz || 0) }));
      // sicherheitshalber: Normalen nach oben (Gelände-Gitter ist nahezu eben)
      const nrm = geo.attributes.normal; for (let k = 0; k < nrm.count; k++) if (nrm.getY(k) < 0) nrm.setXYZ(k, -nrm.getX(k), -nrm.getY(k), -nrm.getZ(k));
      return m;
    }

    /**
     * Breite (m ab Randstreifen-Kante qE) des weichen Asphalt-Keils bei Abstand ds (m) von der Fläche-Mitte: vor der Fläche über `zufahrt` m
     * von 0 auf die volle Tiefe (qB − qE), hinter der Fläche über `ausfahrt` m zurück auf 0. Auf der Fläche selbst: volle Tiefe, außerhalb: 0.
     */
    keilBreite(ds) {
      const P = this.platz, voll = P.qB - (P.qE !== undefined ? P.qE : P.qA - 0.4), h = P.laenge / 2;
      if (ds >= -h && ds <= h) return voll;
      if (ds < -h && ds >= -h - P.zufahrt) return voll * glatt(0, 1, (ds + h + P.zufahrt) / P.zufahrt);
      if (ds > h && ds <= h + P.ausfahrt) return voll * glatt(0, 1, 1 - (ds - h) / P.ausfahrt);
      return 0;
    }

    /**
     * Bäume/Büsche/Felsen (Pflanzen-Kollider) auf Fläche, Keil und Gebäude entfernen – nur wenn die Platzsuche sie dort nicht ausschließen konnte
     * (platz.raeumen). Entfernt die Kollider (+ Raster neu) und – mit `wurzel` (THREE-Szene) – die sichtbaren Instanzen an derselben Stelle (Maßstab 0).
     * @returns {number} Anzahl entfernter Kollider
     */
    freiraeumen(wurzel) {
      const P = this.platz, st = this.strecke;
      if (!P || !P.raeumen || !st.pflanzenKollider || this._geraeumt) return 0;
      this._geraeumt = true;
      const sp = st.spline, h = P.laenge / 2, gB = P.gebBreite / 2, aussen = P.gebQ + P.gebTiefe / 2;
      const qE = P.qE !== undefined ? P.qE : P.qA - 0.4;
      const weg = [], bleibt = [];
      st.pflanzenKollider.forEach((c) => {
        const ds = sp.differenzS(c.s, P.s), q = c.seitenabstand * P.seite;
        const imKeil = ds >= -(h + P.zufahrt + c.r) && ds <= h + P.ausfahrt + c.r && q + c.r > qE - 0.3 && q - c.r < P.qB + 0.5;
        const imGeb = Math.abs(ds) <= gB + c.r + 1 && q + c.r > P.qA - 1 && q - c.r < aussen + 1.5;
        (imKeil || imGeb ? weg : bleibt).push(c);
      });
      if (!weg.length) return 0;
      st.pflanzenKollider.length = 0; bleibt.forEach(c => st.pflanzenKollider.push(c));
      const raster = new Map();
      st.pflanzenKollider.forEach((k, idx) => {
        for (let gx = Math.floor((k.x - k.r) / 10); gx <= Math.floor((k.x + k.r) / 10); gx++) for (let gz = Math.floor((k.z - k.r) / 10); gz <= Math.floor((k.z + k.r) / 10); gz++) {
          const key = gx * 100003 + gz;
          (raster.get(key) || raster.set(key, []).get(key)).push(idx);
        }
      });
      st._pflanzenRaster = raster;
      if (wurzel && typeof THREE !== 'undefined' && wurzel.traverse) {
        const nul = new THREE.Matrix4().makeScale(0, 0, 0);
        wurzel.traverse((o) => {
          if (!o.isInstancedMesh || !o.instanceMatrix) return;
          const a = o.instanceMatrix.array; let geaendert = false;
          for (let i = 0; i < o.count; i++) {
            const x = a[i * 16 + 12], z = a[i * 16 + 14];
            if (weg.some(c => (c.x - x) * (c.x - x) + (c.z - z) * (c.z - z) < 0.09)) { o.setMatrixAt(i, nul); geaendert = true; }
          }
          if (geaendert) o.instanceMatrix.needsUpdate = true;
        });
      }
      this.geraeumt = weg.length;
      return weg.length;
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

  // ============================================================ Mehrere Werkstätten (lange Strecken)
  /**
   * Strecken über config.werkstatt.zweiteAb m (Megastrecke ≈ 8 km) bekommen eine zweite Werkstatt ungefähr gegenüber der ersten. Die Gruppe hat
   * dieselbe Schnittstelle wie Werkstatt (main.js/HUD merken keinen Unterschied); „einmal je Runde“ gilt für beide zusammen (gemeinsame Liste).
   */
  class WerkstattGruppe {
    constructor(strecke, ersteOpt) {
      this.strecke = strecke;
      this.benutzt = [];                                  // Fahrzeug → Runde, in der eine der Werkstätten benutzt wurde
      const erste = new Werkstatt(strecke, Object.assign({ gemeinsam: this.benutzt }, ersteOpt || {}));
      this.teile = erste.vorhanden ? [erste] : [];
      const C = cfg(), L = strecke.spline.laenge;
      if (erste.vorhanden && L > wert(C.zweiteAb, 6000)) {
        const ziel = erste.platz.s + L / 2, w = L * 0.12;
        let zweite = null;
        const fenster = [[ziel - w, ziel + w], [ziel - 2 * w, ziel + 2 * w], [0, Infinity]];
        for (const [a, b] of fenster) {
          const a2 = (a % L + L) % L, b2 = a2 + (b - a);              // Fenster ggf. über den Nullpunkt: einfach beide Hälften probieren
          const versuche = b2 > L ? [[a2, L], [0, b2 - L]] : [[a2, b2]];
          for (const [von, bis] of versuche) {
            const kand = new Werkstatt(strecke, { gemeinsam: this.benutzt, suche: { mitteAb: von, sucheBis: bis } });
            if (kand.vorhanden && Math.abs(strecke.spline.differenzS(kand.platz.s, erste.platz.s)) > L * 0.25) { zweite = kand; break; }
          }
          if (zweite) break;
        }
        if (zweite) this.teile.push(zweite);
      }
    }
    get vorhanden() { return this.teile.length > 0; }
    get platz() { return this.teile.length ? this.teile[0].platz : null; }
    get plaetze() { return this.teile.map(t => t.platz); }
    bei(fn) { this.teile.forEach(t => t.bei(fn)); }
    bauen() {
      if (typeof THREE === 'undefined') return null;
      const g = new THREE.Group(); g.name = 'Werkstaetten';
      this.teile.forEach((t) => { const x = t.bauen(); if (x) g.add(x); });
      return g;
    }
    freiraeumen(wurzel) { return this.teile.reduce((n, t) => n + t.freiraeumen(wurzel), 0); }
    schritt(dt, fahrzeuge, schaden, rennen) { this.teile.forEach(t => t.schritt(dt, fahrzeuge, schaden, rennen)); }
    zustand(i) {
      const rang = { heilt: 5, drin: 4, voll: 3, benutzt: 2, voraus: 1, aus: 0 };
      let best = null;
      this.teile.forEach((t) => { const z = t.zustand(i); if (!best || (rang[z.status] || 0) > (rang[best.status] || 0)) best = z; });
      return best || { status: 'aus', vorhanden: false, heilt: false };
    }
    untergrund(v, n) { for (const t of this.teile) { const u = t.untergrund(v, n); if (u) return u; } return null; }
    kiSteuerung(i, f, dt, rennen, schaden) {
      const aktiv = this.teile.find(t => t.st[i] && t.st[i].ki);              // eine begonnene Werkstattfahrt zuerst zu Ende führen
      if (aktiv) return aktiv.kiSteuerung(i, f, dt, rennen, schaden);
      for (const t of this.teile) { const s = t.kiSteuerung(i, f, dt, rennen, schaden); if (s) return s; }
      return null;
    }
    animieren(t, fahrzeuge) { this.teile.forEach(x => x.animieren(t, fahrzeuge)); }
    zerstoeren() { this.teile.forEach(t => t.zerstoeren()); }
  }

  /** Werkstatt(en) für eine Strecke: eine einzelne Werkstatt (Standard) oder – bei sehr langen Strecken – eine Gruppe aus zwei. */
  Werkstatt.fuer = function (strecke, opt) {
    const g = new WerkstattGruppe(strecke, opt);
    return g.teile.length === 1 ? g.teile[0] : g;
  };

  /** Halbe Fahrbahnbreite (Hilfsfunktion). */
  function strecke_b(st) { return st.breite / 2; }

  Werkstatt.platzSuchen = platzSuchen;
  Werkstatt.Gruppe = WerkstattGruppe;
  R.Werkstatt = Werkstatt;
})();
