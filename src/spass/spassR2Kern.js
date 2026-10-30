// ============================================================
// Stufe R2 – Online-Modi (Autorennen UND Motorrad): Kern ohne Three.js, ohne Math.random, ohne Zeit – läuft im Server (server/r2Sim.js) UND im Browser
// (src/spass/spassOnlineR2.js) mit denselben Zahlen. Geladen NACH spassKurz.js / spassFrei.js / spassKO.js.
//
//   R.SpassR2.einstellungen(erg, roh, art, spieler)  Überschreibt je Modus die geprüften Raum-Einstellungen (Kurz-Level, K.-o., Freie Fahrt) und trägt die R2-Felder ein:
//                                                    modus 'rennen'|'kurz'|'ko'|'frei' (Standard rennen) · level (nur Kurz) · freiZeit 3|5|10 (nur Frei, Standard 5) ·
//                                                    geist bool (Standard false) · dino 'aus'|'dino'|'immer' (Standard aus). Schlüssel stehen NUR im Objekt, wenn sie vom Standard
//                                                    abweichen → ohne R2-Wahl sind die Raum-Einstellungen bitgleich wie vorher.
//   R.SpassR2.rohVorher(roh)                         Wechselt der Host zurück auf „Rennen“, kommen die vor dem Überschreiben gesicherten Werte (r2b) zurück.
//   R.SpassR2.plaetze(strecke, e, n)                 Startaufstellung: Kurz-Level nebeneinander am Level-Start (±2,5 m, ab dem 3. Fahrzeug eine Reihe dahinter), sonst strecke.startpositionen(n).
//   R.SpassR2.Muenzen                                Münzwelt (Position + Einsammeln) ohne Grafik – je Spieler eine eigene.
//   R.SpassR2.FreiAufgabe                            Mini-Aufgaben der Freien Fahrt (Goldrausch/Slalom/Sprungweite) als Rechenteil (Server).
// ============================================================
(function () {
  const R = window.Rennspiel;
  if (!R || !R.config) return;

  const MODI = ['rennen', 'kurz', 'ko', 'frei'];
  const FREI_ZEITEN = [3, 5, 10];
  const DINO = ['aus', 'dino', 'immer'];
  const STD = { modus: 'rennen', freiZeit: 5, geist: false, dino: 'aus' };
  const artVon = (e) => (e && e.moto === true ? 'motorrad' : 'auto');
  /** Felder, die ein R2-Modus überschreibt (und die beim Zurückschalten auf „Rennen“ wiederkommen). */
  const AUS = ['polizei', 'tiere', 'krankenwagen', 'abschleppwagen', 'geisterfahrer', 'verkehr'];
  const UEBERSCHRIEBEN = {
    kurz: ['streckeId', 'welt', 'variante', 'eigen', 'gegner', 'runden', 'zufall', 'spass', 'wetter', 'tageszeit', 'jahreszeit', 'windStaerke', 'nurRennautos'].concat(AUS),
    ko: ['gegner', 'runden'].concat(AUS),
    frei: ['gegner', 'runden', 'zufall', 'spass'].concat(AUS),
  };

  const klon = (o) => JSON.parse(JSON.stringify(o));
  const levelListe = (art) => R.SpassKurz.liste(art);
  const levelDef = (art, id) => R.SpassKurz.level(art, id) || levelListe(art)[0];

  // ---------------------------------------------------------------- Einstellungen
  function rohVorher(roh) {
    if (!roh || typeof roh !== 'object' || !roh.r2b || typeof roh.r2b !== 'object') return roh;
    const modusNeu = MODI.indexOf(roh.modus) > 0 ? roh.modus : 'rennen';
    if (modusNeu === roh.r2b.m) return roh;                          // gleicher Modus wie beim Sichern: nichts zurückholen
    const r = Object.assign({}, roh);                                // Modus gewechselt (auch Kurz → K.-o.): die gesicherten Werte wieder einsetzen (nur die Felder dieses Modus)
    (UEBERSCHRIEBEN[roh.r2b.m] || []).forEach((k) => { if (Object.prototype.hasOwnProperty.call(roh.r2b, k)) r[k] = roh.r2b[k]; });
    if (roh.r2b.g === true && r.geist === undefined) r.geist = true;                  // R2-FIX: Lobby-Wahl Geist/Dino überlebt jeden Moduswechsel (wirkt nur im Rennen)
    if (typeof roh.r2b.d === 'string' && r.dino === undefined) r.dino = roh.r2b.d;
    delete r.r2b;
    return r;
  }

  function einstellungen(erg, roh, art, spieler) {
    const r0 = roh || {};
    const modus = MODI.indexOf(r0.modus) > 0 ? r0.modus : 'rennen';
    const geist = r0.geist === true, dino = DINO.indexOf(r0.dino) > 0 ? r0.dino : 'aus';
    if (modus === 'rennen') {
      if (!geist && dino === 'aus') return erg;                    // keine R2-Wahl → bitgleich wie vorher
      const o = Object.assign({}, erg);
      if (geist) o.geist = true;
      if (dino !== 'aus') o.dino = dino;
      return o;
    }
    const c = R.config, N = R.Netz, o = Object.assign({}, erg);
    delete o.geist; delete o.dino;                                 // Geist/Dino gibt es nur im normalen Rennen
    const bisher = r0.r2b && typeof r0.r2b === 'object' && r0.r2b.m === modus ? r0.r2b : null;
    const sicher = { m: modus };                                   // Werte vor dem Überschreiben (Rückweg auf „Rennen“); schon gesicherte bleiben
    UEBERSCHRIEBEN[modus].forEach((k) => {
      if (bisher && Object.prototype.hasOwnProperty.call(bisher, k)) sicher[k] = bisher[k];
      else if (Object.prototype.hasOwnProperty.call(erg, k)) sicher[k] = erg[k];
    });
    const aus = () => { o.polizei = false; o.tiere = false; o.krankenwagen = false; o.abschleppwagen = false; o.geisterfahrer = false; o.verkehr = 'aus'; };
    o.modus = modus;
    delete o.level; delete o.freiZeit;
    if (modus === 'kurz') {
      const def = levelDef(art, r0.level);
      Object.assign(o, { streckeId: def.strecke, welt: '', variante: '', gegner: 0, runden: c.rennen.rundenMax, zufall: false, spass: true, wetter: 'klar', tageszeit: 'tag', jahreszeit: 'sommer', windStaerke: 0, nurRennautos: false });
      aus(); delete o.eigen;
      o.level = def.id;
    } else if (modus === 'ko') {
      const maxKI = Math.max(0, Math.min(c.rennen.gegnerMax, N.MAX_AUTOS - Math.max(1, spieler || 1)));
      const gegner = Math.min(maxKI, Math.max(c.spass.ko.minGegner, +erg.gegner || 0));
      o.gegner = gegner;
      o.runden = Math.min(c.rennen.rundenMax, R.SpassKO.runden(Math.max(1, spieler || 1) + gegner));
      aus();
    } else {                                                       // frei
      Object.assign(o, { gegner: 0, runden: c.rennen.rundenMax, zufall: false, spass: true });
      aus();
      const z = FREI_ZEITEN.indexOf(+r0.freiZeit) >= 0 ? +r0.freiZeit : STD.freiZeit;
      if (z !== STD.freiZeit) o.freiZeit = z;
    }
    if (geist || (bisher && bisher.g === true)) sicher.g = true;      // R2-FIX: Geist/Dino merken (im Modus selbst nicht erlaubt, beim Zurück auf „Rennen“ wieder da)
    if (dino !== 'aus') sicher.d = dino; else if (bisher && typeof bisher.d === 'string') sicher.d = bisher.d;
    o.r2b = sicher;
    return o;
  }

  // ---------------------------------------------------------------- Startaufstellung
  /** Kurz-Level: { def, ab } zur Strecke (null, wenn kein Kurz-Level-Raum). */
  function kurzAbschnitt(strecke, e) {
    if (!e || e.modus !== 'kurz') return null;
    const def = levelDef(artVon(e), e.level);
    return { def, ab: R.SpassKurz.abschnitt(strecke, def) };
  }

  function plaetze(strecke, e, n) {
    const k = kurzAbschnitt(strecke, e);
    if (!k) return strecke.startpositionen(n);
    const sp = strecke.spline, s0 = k.ab.s0, liste = [];
    for (let i = 0; i < n; i++) {
      const reihe = Math.floor(i / 2), inReihe = Math.min(2, n - reihe * 2);
      const q = inReihe < 2 ? 0 : (i % 2 === 0 ? -2.5 : 2.5);
      const p = sp.punktBei(sp.wrapS(s0 - reihe * 9));
      liste.push({ x: p.x + p.nx * q, z: p.z + p.nz * q, heading: R.headingAus(p.tx, p.tz) });
    }
    return liste;
  }

  // ---------------------------------------------------------------- Münzen (ohne Grafik)
  class Muenzen {
    /** punkte: [{ x, y, z }]. schritt() liefert die Nummern der neu eingesammelten (Radius 2,6 m, Höhe < 3,2 m). */
    constructor(punkte, radius) {
      this.punkte = punkte.map((p) => ({ x: p.x, y: p.y, z: p.z, weg: false }));
      this.radius = radius || 2.6; this.gesammelt = 0;
    }
    schritt(x, y, z) {
      const neu = [];
      for (let i = 0; i < this.punkte.length; i++) {
        const c = this.punkte[i];
        if (c.weg) continue;
        const dx = c.x - x, dz = c.z - z;
        if (dx * dx + dz * dz < this.radius * this.radius && Math.abs(c.y - y) < 3.2) { c.weg = true; neu.push(i); this.gesammelt++; }
      }
      return neu;
    }
    uebrig() { return this.punkte.length - this.gesammelt; }
  }
  /** Spline-Punkte [{ s, q }] → Weltpunkte [{ x, y, z }]. */
  function weltPunkte(strecke, liste) {
    const sp = strecke.spline;
    return liste.map((c) => { const p = sp.punktBei(c.s), x = p.x + p.nx * c.q, z = p.z + p.nz * c.q; return { x, z, y: strecke.hoeheAn(x, z) }; });
  }

  // ---------------------------------------------------------------- Freie Fahrt: Mini-Aufgaben (Server-Rechenteil; gleiche Regeln wie spassFrei.js offline)
  const FreiAufgabe = {
    /** Neue Aufgabe der Kiste (art 'muenzen' | 'slalom' | 'sprung') für Fahrer bei Bogenlänge sNow, seite = Vorzeichen des Seitenabstands. */
    neu(strecke, art, sNow, seite) {
      const F = R.SpassFrei, C = R.config.spass.frei;
      const a = { art, t: 0, zaehl: 0, verpasst: 0, naechst: 0, weite: 0, landungen: 0, landungenStart: 0, muenzen: null, tore: null, sNow, seite };
      if (art === 'muenzen') a.muenzen = new Muenzen(weltPunkte(strecke, F.muenzPlan(sNow + 12, strecke.breite || 12)), 2.8);
      else if (art === 'slalom') a.tore = F.slalomPlan(sNow + 22, seite).map((t) => ({ s: t.s, q: t.q, ok: null }));
      void C;
      return a;
    },
    zeitLimit(art) { const C = R.config.spass.frei; return art === 'muenzen' ? C.goldrausch.zeit : art === 'slalom' ? C.slalom.zeit : C.sprung.zeit; },
    gold(art) { const C = R.config.spass.frei; return art === 'muenzen' ? C.goldrausch.gold : art === 'slalom' ? C.slalom.gold : C.sprung.gold; },
    /**
     * Ein Schritt. K = { x, y, z, s, q (Seitenabstand), weite (f.flug.letzteWeite) }, dt in s.
     * → { ende: null | { ok, text }, neueMuenzen: [Nummern], tor: null | { k, ok } (Tore dieses Schritts) }
     */
    schritt(a, strecke, K, dt) {
      const F = R.SpassFrei, C = R.config.spass.frei, sp = strecke.spline;
      const erg = { ende: null, neueMuenzen: [], tore: [] };
      a.t += dt;
      if (a.art === 'muenzen') {
        const neu = a.muenzen.schritt(K.x, K.y, K.z);
        a.zaehl += neu.length; erg.neueMuenzen = neu;
        if (a.zaehl >= C.goldrausch.brauche) erg.ende = { ok: true, text: `${a.zaehl} Goldstücke!` };
        else if (a.t >= C.goldrausch.zeit) erg.ende = { ok: false, text: `nur ${a.zaehl} von ${C.goldrausch.brauche}` };
      } else if (a.art === 'slalom') {
        for (let k = a.naechst; k < a.tore.length; k++) {
          const tor = a.tore[k];
          if (sp.differenzS(K.s, tor.s) >= 0) {
            if (F.slalomTor(tor, K.q)) { a.zaehl++; tor.ok = true; } else { tor.ok = false; a.verpasst++; }
            erg.tore.push({ k, ok: tor.ok });
            a.naechst = k + 1;
          } else break;
        }
        const c = C.slalom;
        if (a.zaehl >= c.brauche) erg.ende = { ok: true, text: `${a.zaehl} von ${c.tore} Toren!` };
        else if (a.verpasst > c.tore - c.brauche || a.naechst >= a.tore.length || a.t >= c.zeit) erg.ende = { ok: false, text: `${a.zaehl} von ${c.tore} Toren` };
      } else {
        if (a.landungen > a.landungenStart) {
          const m = K.weite || 0; a.weite = Math.max(a.weite, m); a.landungenStart = a.landungen;
          if (F.weiteOk(m)) erg.ende = { ok: true, text: `${Math.round(m)} m weit!` };
          else erg.kurz = Math.round(m) + ' m – weiter!';
        }
        if (!erg.ende && a.t >= C.sprung.zeit) erg.ende = { ok: false, text: a.weite ? `nur ${Math.round(a.weite)} m` : 'kein Sprung' };
      }
      return erg;
    },
  };

  R.SpassR2 = { MODI, FREI_ZEITEN, DINO, STD, UEBERSCHRIEBEN, einstellungen, rohVorher, kurzAbschnitt, plaetze, Muenzen, weltPunkte, FreiAufgabe, artVon, levelListe, levelDef, klon };
})();
