// ============================================================
// Motorrad-Unfälle (Stufe M2c): Konfiguration + reine Rechenlogik, ohne THREE/DOM (Node-testbar: tests/test_moto_unfall.js).
// Wunsch des Vaters: „Status für Motorrad defekt und dann Reparatur, und Verletzung Mensch und dann kurz Krankenstation;
// bei manchen Unfällen Motorrad-Schaden, bei anderen Mensch.“ Kindgerecht: kein Blut, freundliche Texte.
//
//   R.config.motoUnfall        alle Zahlen an einer Stelle (Verteilung je Modus, Abzüge in Prozent, Untergrenze, Tempo-Wirkung, Pflegezeiten, Szenen-Zeiten)
//   Zwei Zustände je Fahrer: Motorrad 0–100 % (zustand) und Fahrer-Gesundheit 0–100 % (gesundheit), nie unter 10 %, nie liegenbleiben.
//   R.Moto.unfall              Funktionen:
//     Verteilung   folge(modus, saat, nr, n)            deterministische Folge des n-ten Sturzes von Fahrer nr (ohne Zufallsfunktion; gleichmäßig
//                                                       verteilt: Kronecker-Folge, Anfangswert aus Saat + Fahrer-Nr.) → { art: 'schreck'|'schaden'|'leicht'|'schwer', schwer }
//     Zustand      zNeu(modus), sturz(u, saat, nr)       Folge anwenden → { art, szene: 'krankenwagen'|'abschlepp'|null }
//                  pflegeSchritt(u, was, ort, dt)        Pflege hochzählen: ort 'vorOrt' = 1,5 s je 10 %, 'station' = 0,5 s je 10 % (bis 100 %)
//                  darfWeiter(u)                         beide Zustände ≥ 30 %: Gas beendet die Pflege und man fährt los (sonst „Noch kurz warten …“)
//                  pflegeDauer(wert, ort)                Sekunden bis 100 %
//                  faktoren(u)                           { vMax, beschleunigung } proportional zum Fehlbetrag beider Zustände
//                  hudZustand(u)                         { prozent, farbe, gesundheit, fahrerFarbe, symbol }
//     Szenen       szenePlan(pflege), szenePhase(pflege, t)   anfahrt → pflege (vor Ort) → abfahrt, plus Zeitlimit (Rückfall auf den Kontrollpunkt)
//     Stationen    stationenBilden(strecke)              GENAU eine Werkstatt und GENAU eine Krankenstation je Strecke (Platzsuche der Autorennen-Werkstatt, world/garage.js)
//                  stationBereich(w, n)                  liegt eine Streckenabfrage n auf der Fläche der Station?
//                  fahrPose(strecke, s, q)               Welt-Pose { x, y, z, heading } bei Bogenlänge s und Querabstand q (Fahrzeug der Szene)
// Alle Zeiten in Sekunden, Längen in Metern.
// ============================================================
window.Rennspiel = window.Rennspiel || {};

(function () {
  const R = window.Rennspiel;
  R.Moto = R.Moto || {};
  R.config = R.config || {};

  /** Tuning-Tabelle der Unfälle. Hier ändern, nirgends sonst. Alle Prozent sind Punkte auf der 0–100-Anzeige. */
  R.config.motoUnfall = {
    standard: 'sanft',                                   // Menü-Schalter „Unfälle: aus / sanft / echt“
    // Verteilung der Folgen je Sturz; schadenSchwer = Anteil der Motorrad-Schäden, die „schwer“ sind (Abschleppwagen kommt zum Motorrad)
    modi: {
      aus: null,                                         // nie eine Folge (wie M2)
      sanft: { schreck: 0.50, schaden: 0.30, leicht: 0.15, schwer: 0.05, schadenSchwer: 0.10 },
      echt: { schreck: 0.20, schaden: 0.40, leicht: 0.28, schwer: 0.12, schadenSchwer: 1 / 3 },
    },
    // Zwei Zustände: Motorrad 0–100 % und Fahrer-Gesundheit 0–100 %; nie unter minimum, nie liegenbleiben
    minimum: 10,
    abzug: { schaden: 20, schadenSchwer: 50, leicht: 15, schwer: 50 },       // Prozentpunkte je Folge (leicht wenig, schwer viel)
    // Tempo-Wirkung proportional zum Fehlbetrag: bei minimum % fehlen tempoMinus (Höchsttempo und Beschleunigung); der Fahrer wirkt nur aufs Höchsttempo
    tempo: { motorrad: 0.35, fahrer: 0.15 },
    farben: { gelbUnter: 75, rotUnter: 50 },             // HUD-Farbe der Prozentzahl (grün ab 75, gelb ab 50, sonst rot)
    qualmUnter: 75,                                      // Qualm am Motorrad ab Zustand unter …
    // Pflege: Sekunden je 10 % – vor Ort (Krankenwagen/Abschleppwagen kommen zum Unfallort) langsamer als an der Station; sie läuft bis 100 %, man darf aber ab weiterfahrenAb los
    vorOrtSekundenJe10: 1.5,
    weiterfahrenAb: 30,                                  // ab so viel % bei Fahrer UND Motorrad beendet Gas geben die Pflege (vor Ort und an der Station); darunter gesperrt
    stationSekundenJe10: 0.5,
    // Kamera bei der Versorgung (Verfolger/Weit): von der Straßenseite schräg von hinten, Gebäude bzw. Helfer-Fahrzeug und Motorrad zusammen im Bild, die Kamera steckt nie im Gebäude
    kamera: { an: true, hoehe: 4.5, hinter: 9, seitlich: 9, blickSeitlich: 3.5, blickHoeher: 0.55, weichheit: 4 },
    ki: { drossel: 2.0, faktor: 0.45 },                  // KI hält nicht an: beim Vorbeifahren an der Station 2 s lang nur 45 % Höchsttempo (Zeitverlust statt Halt)
    szene: {
      anfahrt: 1.6, abfahrt: 0.9,                        // Fahrzeit des Helfer-Fahrzeugs heran / weg (s); dazwischen läuft die Pflege
      reserve: 10,                                       // Zeitlimit = Plan + Pflege + reserve (s) – danach Rückfall auf „zurück an den Kontrollpunkt“ (v32 N1d)
      wartenMax: 4,                                      // so lange wartet der Start der Szene auf Stillstand/Boden
      anfahrtWeg: 38, abfahrtWeg: 34, seitlich: 3.4,     // Fahrzeug der Szene: Anfahrt-/Abfahrtweg (m), Abstand zur Fahrspur des Motorrads (m)
    },
  };

  const CFG = () => R.config.motoUnfall;
  const frac = (x) => x - Math.floor(x);

  // ---------- deterministische Verteilung ----------
  function hash(text) { let h = 0x811c9dc5; for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return h >>> 0; }
  const A1 = 0.7548776662466927, A2 = 0.5698402909980532;          // Kronecker-Folge (R2): zwei gleichmäßig verteilte Werte je Sturz
  /**
   * Folge des n-ten Sturzes (n ab 1) von Fahrer nr. Deterministisch aus (saat, nr, n): dieselbe Reihenfolge überall (später online gleich gerechnet),
   * ohne Zufallsfunktion des Browsers. Gleichmäßig verteilt: über beliebig viele aufeinanderfolgende Stürze stimmt der Anteil sehr genau mit der Tabelle überein.
   * Rückgabe { art: 'schreck'|'schaden'|'leicht'|'schwer', schwer: boolean (nur bei 'schaden': schwerer Schaden) } oder null im Modus 'aus'.
   */
  function folge(modus, saat, nr, n, cfg) {
    const k = (cfg || CFG()).modi[modus];
    if (!k) return null;
    const h = hash(String(saat) + '|' + nr);
    const o1 = (h >>> 0) / 4294967296, o2 = (Math.imul(h, 2654435761) >>> 0) / 4294967296;
    const r1 = frac(o1 + n * A1), r2 = frac(o2 + n * A2);
    let art;
    if (r1 < k.schreck) art = 'schreck';
    else if (r1 < k.schreck + k.schaden) art = 'schaden';
    else if (r1 < k.schreck + k.schaden + k.leicht) art = 'leicht';
    else art = 'schwer';
    return { art, schwer: art === 'schaden' && r2 < k.schadenSchwer };
  }

  // ---------- Zustand je Fahrer ----------
  function zNeu(modus) {
    return {
      modus: CFG().modi[modus] !== undefined ? modus : CFG().standard,
      sturzNr: 0, zustand: 100, gesundheit: 100,                   // Motorrad / Fahrer in Prozent
      halt: null,                                                 // { art: 'werkstatt'|'kranken', wert (Start), t }
      drossel: 0,                                                 // KI: Restzeit der Tempo-Drossel an einer Station
      szene: null,
      stat: { stuerze: 0, schreck: 0, schaden: 0, leicht: 0, schwer: 0, repariert: 0, geheilt: 0, abschlepp: 0, krankenwagen: 0 },
    };
  }

  /**
   * Einen Sturz anwenden. Rückgabe { art, szene? } – art 'keine' (Modus aus), 'schreck', 'schaden', 'leicht', 'schwer'.
   * 'schaden': Motorrad −abzug.schaden (schwerer Schaden: −abzug.schadenSchwer), nie unter minimum. Schwerer Schaden oder Zustand am Minimum: szene 'abschlepp'
   * (der Abschleppwagen repariert VOR ORT). 'leicht': Fahrer −abzug.leicht. 'schwer': Fahrer −abzug.schwer, szene 'krankenwagen' (Sanitäter versorgen VOR ORT).
   */
  function sturz(u, saat, nr, cfg, ueber) {
    const c = cfg || CFG();
    u.sturzNr++; u.stat.stuerze++;
    const e = ueber || folge(u.modus, saat, nr, u.sturzNr, c);          // ueber = { art, schwer }: Folge vorgeben (Browser-Tests)
    if (!e) return { art: 'keine' };
    if (e.art === 'schreck') { u.stat.schreck++; return { art: 'schreck' }; }
    if (e.art === 'schaden') {
      const vorher = u.zustand;
      u.zustand = Math.max(c.minimum, vorher - (e.schwer ? c.abzug.schadenSchwer : c.abzug.schaden));
      u.stat.schaden++;
      const tief = u.zustand <= c.minimum;
      return { art: 'schaden', schwer: e.schwer, szene: (e.schwer || tief) ? 'abschlepp' : null, zustandVorher: vorher };
    }
    if (e.art === 'leicht') { u.gesundheit = Math.max(c.minimum, u.gesundheit - c.abzug.leicht); u.stat.leicht++; return { art: 'leicht' }; }
    u.gesundheit = Math.max(c.minimum, u.gesundheit - c.abzug.schwer);
    u.stat.schwer++;
    return { art: 'schwer', szene: 'krankenwagen' };
  }

  // ---------- Pflege (Reparatur / Heilung) ----------
  /** Sekunden je 10 % am Ort: 'vorOrt' (Szene) oder 'station'. */
  const sekundenJe10 = (ort, cfg) => { const c = cfg || CFG(); return ort === 'vorOrt' ? c.vorOrtSekundenJe10 : c.stationSekundenJe10; };
  /** Dauer (s), um von Prozent `wert` bis 100 % zu pflegen. */
  function pflegeDauer(wert, ort, cfg) { return Math.max(0, (100 - wert) / 10) * sekundenJe10(ort, cfg); }
  /** Pflegt `was` ('motorrad' | 'fahrer') um dt Sekunden hoch (zählt gleichmäßig). Rückgabe true, wenn 100 % erreicht sind. */
  function pflegeSchritt(u, was, ort, dt, cfg) {
    const k = was === 'motorrad' ? 'zustand' : 'gesundheit', rate = 10 / sekundenJe10(ort, cfg);
    if (u[k] >= 100) return true;
    u[k] = Math.min(100, u[k] + rate * dt);
    if (u[k] >= 100 - 1e-9) { u[k] = 100; if (was === 'motorrad') u.stat.repariert++; else u.stat.geheilt++; return true; }
    return false;
  }
  /** Darf der Fahrer losfahren (Gas beendet die Pflege)? Beide Zustände mindestens weiterfahrenAb %. Darunter: „Noch kurz warten …“. */
  const darfWeiter = (u, cfg) => { const a = (cfg || CFG()).weiterfahrenAb; return u.zustand >= a && u.gesundheit >= a; };
  /** Braucht der Fahrer die Werkstatt / die Krankenstation? */
  const brauchtWerkstatt = (u) => u.zustand < 100;
  const brauchtKranken = (u) => u.gesundheit < 100;

  /** Tempo-Wirkung proportional zum Fehlbetrag: Motorrad (Höchsttempo + Beschleunigung) und Fahrer (nur Höchsttempo). */
  function faktoren(u, cfg) {
    const c = cfg || CFG(), spanne = Math.max(1, 100 - c.minimum);
    const m = Math.max(0, Math.min(1, (100 - u.zustand) / spanne)), f = Math.max(0, Math.min(1, (100 - u.gesundheit) / spanne));
    return { vMax: (1 - c.tempo.motorrad * m) * (1 - c.tempo.fahrer * f), beschleunigung: 1 - c.tempo.motorrad * m };
  }

  /** Anzeige im Spieler-Chip: „🏍️ 75 %“ und „😀 100 %“, je grün ab 75, gelb ab 50, sonst rot; Fahrer-Symbol 😀 (100 %) sonst 🩹 (immer Pflaster: weniger Angst bei Kindern). */
  function hudZustand(u, cfg) {
    const c = cfg || CFG(), farbe = (p) => p >= c.farben.gelbUnter ? 'gruen' : p >= c.farben.rotUnter ? 'gelb' : 'rot';
    const p = Math.round(u.zustand), g = Math.round(u.gesundheit);
    return { prozent: p, farbe: farbe(p), gesundheit: g, fahrerFarbe: farbe(g), symbol: g >= 100 ? '😀' : '🩹' };
  }

  // ---------- Szenen-Zeitplan (Helfer-Fahrzeug kommt zum Unfallort, versorgt vor Ort, fährt weg) ----------
  /** Plan: anfahrt → pflege (Dauer nach Fehlbetrag) → abfahrt; limit = Zeitlimit, danach Rückfall auf den Kontrollpunkt. */
  function szenePlan(pflege, cfg) {
    const k = (cfg || CFG()).szene, ph = [];
    let t = 0;
    for (const [name, dauer] of [['anfahrt', k.anfahrt], ['pflege', pflege], ['abfahrt', k.abfahrt]]) { ph.push({ name, t0: t, dauer, t1: t + dauer }); t += dauer; }
    return { phasen: ph, dauer: t, limit: t + k.reserve };
  }
  /** Phase zur Szenenzeit t: { name, u (0..1 in der Phase), t, ende: boolean }. */
  function szenePhase(pflege, t, cfg) {
    const p = szenePlan(pflege, cfg), ph = p.phasen;
    for (let i = 0; i < ph.length; i++) {
      if (t < ph[i].t1 || i === ph.length - 1) { const x = ph[i]; return { name: x.name, index: i, u: x.dauer > 0 ? Math.max(0, Math.min(1, (t - x.t0) / x.dauer)) : 1, t, ende: t >= p.dauer }; }
    }
    return null;
  }

  // ---------- Stationen: genau EINE Werkstatt, genau EINE Krankenstation je Strecke ----------
  /** Welt-Pose bei Bogenlänge s und Querabstand q (Fahrtrichtung = −z wie bei den Fahrzeugen: heading = atan2(−tx, −tz)). */
  function fahrPose(strecke, s, q) {
    const p = strecke.spline.punktBei(s), x = p.x + p.nx * q, z = p.z + p.nz * q;
    return { x, y: strecke.hoeheAn(x, z), z, heading: Math.atan2(-p.tx, -p.tz), s: p.s, tx: p.tx, tz: p.tz, nx: p.nx, nz: p.nz };
  }
  /**
   * Werkstatt und Krankenstation bilden. Beide benutzen die Platzsuche der Autorennen-Werkstatt (world/garage.js: gerade Stelle, weg von Brücke/Tunnel/Kreuzung/
   * Looping/Schanze/Hindernissen; Fläche + weicher Zufahrt-Keil, befahrbar). Die Krankenstation sucht in Fenstern gegenüber der Werkstatt (mindestens 20 % der
   * Streckenlänge entfernt, sonst 10 %) – nie am selben Fleck. Rückgabe { werkstatt, kranken } (R.Werkstatt-Objekte) oder null, wenn R.Werkstatt fehlt.
   */
  function stationenBilden(strecke, opt) {
    const W = R.Werkstatt;
    if (!W || !strecke || !strecke.spline) return null;
    // Feuerring und Bus-Reihe kennt die Platzsuche der Werkstatt nicht: ihre Bereiche als Sperrzonen mitgeben (danach wieder zurücksetzen)
    const vorher = strecke.sperrzonenExtern;
    try {
      const SW = R.Moto.stuntWelt, zonen = Array.isArray(vorher) ? vorher.slice() : [];
      if (SW && SW.stuntDaten) {
        const d = SW.stuntDaten(strecke);
        const ra = (R.config.motoStunts && R.config.motoStunts.ring && R.config.motoStunts.ring.abstand) || 16;
        d.ringe.forEach((r) => zonen.push({ s0: r.sK + ra - 3, s1: r.sK + ra + 3 }));       // Platzsuche rechnet noch 12 m Rand dazu
        d.reihen.forEach((r) => zonen.push({ s0: r.sK - 8, s1: r.sK + r.a1 + 4 }));
      }
      strecke.sperrzonenExtern = zonen;
      return stationenSuchen(strecke, opt);
    } finally { if (vorher === undefined) delete strecke.sperrzonenExtern; else strecke.sperrzonenExtern = vorher; }
  }
  function stationenSuchen(strecke, opt) {
    const W = R.Werkstatt;
    const w = new W(strecke, opt);
    if (!w.vorhanden) return { werkstatt: null, kranken: null };
    const sp = strecke.spline, L = sp.laenge, ziel = w.platz.s + L / 2;
    let kw = null;
    const kandidaten = [];
    for (const f of [0.12, 0.24, 0.5]) {
      const a = ((ziel - f * L) % L + L) % L, b = a + 2 * f * L;
      (b > L ? [[a, L], [0, b - L]] : [[a, b]]).forEach((x) => kandidaten.push(x));
    }
    // Rückfall (kurze, volle Strecken wie Fantasie „verrückt“): überall außer nahe der Werkstatt suchen – hinter ihr bis zum Ende, dann von vorn bis vor sie
    const sperr = L * 0.1;
    kandidaten.push([w.platz.s + sperr, Infinity], [0, w.platz.s - sperr]);
    for (const mind of [0.2, 0.1]) {
      for (const [von, bis] of kandidaten) {
        const kand = new W(strecke, { suche: { mitteAb: von, sucheBis: bis } });
        if (kand.vorhanden && Math.abs(sp.differenzS(kand.platz.s, w.platz.s)) > L * mind) { kw = kand; break; }
      }
      if (kw) break;
    }
    return { werkstatt: w, kranken: kw };
  }
  /** Liegt die Streckenabfrage n (s, seitenabstand) auf der Fläche der Station w? */
  function stationBereich(w, n) { return !!(w && w.platz && n && w.istDrin(n)); }
  /** Liegt die Bogenlänge s im Längsbereich der Fläche (für die KI, die vorbeifährt)? */
  function stationLaengs(w, strecke, s) {
    if (!w || !w.platz) return false;
    return Math.abs(strecke.spline.differenzS(s, w.platz.s)) <= w.platz.laenge / 2;
  }

  R.Moto.unfall = {
    hash, folge, zNeu, sturz, sekundenJe10, pflegeDauer, pflegeSchritt, darfWeiter, brauchtWerkstatt, brauchtKranken, faktoren, hudZustand,
    szenePlan, szenePhase, fahrPose, stationenBilden, stationBereich, stationLaengs,
  };
})();
