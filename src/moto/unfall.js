// ============================================================
// Motorrad-Unfälle (Stufe M2c): Konfiguration + reine Rechenlogik, ohne THREE/DOM (Node-testbar: tests/test_moto_unfall.js).
// Wunsch des Vaters: „Status für Motorrad defekt und dann Reparatur, und Verletzung Mensch und dann kurz Krankenstation;
// bei manchen Unfällen Motorrad-Schaden, bei anderen Mensch.“ Kindgerecht: kein Blut, freundliche Texte.
//
//   R.config.motoUnfall        alle Zahlen an einer Stelle (Verteilung je Modus, Schadensstufen, Tempo-Wirkung, Haltezeiten, Szenen-Zeiten)
//   R.Moto.unfall              Funktionen:
//     Verteilung   folge(modus, saat, nr, n)            deterministische Folge des n-ten Sturzes von Fahrer nr (ohne Zufallsfunktion; gleichmäßig
//                                                       verteilt: Kronecker-Folge, Anfangswert aus Saat + Fahrer-Nr.) → { art: 'schreck'|'schaden'|'leicht'|'schwer', schwer }
//     Zustand      zNeu(modus), sturz(u, saat, nr)       Folge anwenden (Motorrad-Zustand 100 → −25 % je Schaden, nie unter 25; Pflaster)
//                  reparieren(u), heilen(u), abschlepp(u), krankenwagen(u)   Wirkung der Stationen / Szenen
//                  faktoren(u)                           { vMax, beschleunigung } (Schaden: bis −30 % bei 25 %, Pflaster: −10 % Höchsttempo)
//                  hudZustand(u)                         { prozent, farbe: 'gruen'|'gelb'|'rot', fahrer: 'ok'|'pflaster'|'verband', symbol }
//     Szenen       szenePlan(art), szeneDauer(art), szenePhase(art, t)   Zeitplan Krankenwagen-/Abschleppwagen-Szene (Teil A am Unfallort, Teil B an der Station)
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

  /** Tuning-Tabelle der Unfälle. Hier ändern, nirgends sonst. */
  R.config.motoUnfall = {
    standard: 'sanft',                                   // Menü-Schalter „Unfälle: aus / sanft / echt“
    // Verteilung der Folgen je Sturz; schadenSchwer = Anteil der Motorrad-Schäden, die „schwer“ sind (Abschleppwagen bringt das Motorrad zur Werkstatt)
    modi: {
      aus: null,                                         // nie eine Folge (wie M2)
      sanft: { schreck: 0.50, schaden: 0.30, leicht: 0.15, schwer: 0.05, schadenSchwer: 0.10 },
      echt: { schreck: 0.20, schaden: 0.40, leicht: 0.28, schwer: 0.12, schadenSchwer: 1 / 3 },
    },
    schaden: { schritt: 25, minimum: 25, tempoMinus: 0.30, qualmUnter: 75, gelbUnter: 75, rotUnter: 50 },   // −25 % je Schaden, nie unter 25; bei 25 % −30 % Tempo/Beschleunigung; Qualm unter 75 %
    pflaster: { tempo: 0.9 },                            // leicht verletzt: −10 % Höchsttempo
    station: { halt: 2.0, bremse: 7.0 },                 // Durchfahren = 2 s Halt, dann repariert bzw. geheilt
    ki: { drossel: 2.0, faktor: 0.45 },                  // KI hält nicht an: beim Vorbeifahren an der Station 2 s lang nur 45 % Höchsttempo (Zeitverlust statt Halt)
    szene: {
      max: 12,                                           // Zeitlimit je Szene (s): danach Rückfall auf „zurück an den Kontrollpunkt“ (v32 N1d)
      wartenMax: 4,                                      // so lange wartet der Start der Szene auf Stillstand/Boden
      // [Name, Dauer] – Teil A am Unfallort, Teil B an der Station (zusammen etwa 5–6 s)
      krank: { A: [['anfahrt', 1.1], ['hin', 0.6], ['zurueck', 0.7], ['abfahrt', 0.7]], B: [['ankunft', 0.5], ['hin', 0.7], ['zurueck', 0.5], ['abfahrt', 0.5]] },
      abschlepp: { A: [['anfahrt', 1.6], ['beladen', 1.1], ['abfahrt', 0.8]], B: [['ankunft', 0.6], ['abladen', 1.0], ['abfahrt', 0.7]] },
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
      sturzNr: 0, zustand: 100, fahrer: 'ok',                    // fahrer: 'ok' | 'pflaster' | 'verband'
      halt: null,                                                 // { art: 'werkstatt'|'kranken', t }
      drossel: 0,                                                 // KI: Restzeit der Tempo-Drossel an einer Station
      szene: null,
      stat: { stuerze: 0, schreck: 0, schaden: 0, leicht: 0, schwer: 0, repariert: 0, geheilt: 0, abschlepp: 0, krankenwagen: 0 },
    };
  }

  /**
   * Einen Sturz anwenden. Rückgabe { art, abschlepp?, zustandVorher? } – art 'keine' (Modus aus), 'schreck', 'schaden', 'leicht', 'schwer'.
   * 'schaden': Zustand −25 % (höchstens bis 25 %); steht der Zustand schon auf 25 %, oder ist der Schaden „schwer“, kommt der Abschleppwagen (abschlepp: true).
   * 'leicht': Pflaster (nur wenn der Fahrer noch keins/keinen Verband hat). 'schwer': der Krankenwagen holt den Fahrer (die Szene setzt am Ende den Verband).
   */
  function sturz(u, saat, nr, cfg) {
    const c = cfg || CFG();
    u.sturzNr++; u.stat.stuerze++;
    const e = folge(u.modus, saat, nr, u.sturzNr, c);
    if (!e) return { art: 'keine' };
    const s = c.schaden;
    if (e.art === 'schreck') { u.stat.schreck++; return { art: 'schreck' }; }
    if (e.art === 'schaden') {
      const vorher = u.zustand, tief = vorher <= s.minimum;
      u.zustand = Math.max(s.minimum, vorher - s.schritt);
      u.stat.schaden++;
      return { art: 'schaden', abschlepp: e.schwer || tief, zustandVorher: vorher };
    }
    if (e.art === 'leicht') { if (u.fahrer === 'ok') u.fahrer = 'pflaster'; u.stat.leicht++; return { art: 'leicht' }; }
    u.stat.schwer++;
    return { art: 'schwer' };
  }
  /** Werkstatt (Durchfahren oder Abschleppwagen): Motorrad wieder 100 %. */
  function reparieren(u) { if (u.zustand < 100) u.stat.repariert++; u.zustand = 100; }
  /** Krankenstation (Durchfahren): Pflaster/Verband ab. */
  function heilen(u) { if (u.fahrer !== 'ok') u.stat.geheilt++; u.fahrer = 'ok'; }
  /** Der Abschleppwagen hat das Motorrad zur Werkstatt gebracht. */
  function abschlepp(u) { u.stat.abschlepp++; reparieren(u); }
  /** Der Krankenwagen hat den Fahrer zur Krankenstation gebracht: ab jetzt mit Verband. */
  function krankenwagen(u) { u.stat.krankenwagen++; u.fahrer = 'verband'; }
  /** Braucht der Fahrer die Werkstatt / die Krankenstation? */
  const brauchtWerkstatt = (u) => u.zustand < 100;
  const brauchtKranken = (u) => u.fahrer !== 'ok';

  /** Tempo-Wirkung: Schaden bis −30 % Höchsttempo und Beschleunigung (linear von 100 % bis 25 %), Pflaster zusätzlich −10 % Höchsttempo. Verband: keine Strafe. */
  function faktoren(u, cfg) {
    const c = cfg || CFG(), s = c.schaden;
    const anteil = Math.max(0, Math.min(1, (100 - u.zustand) / Math.max(1, 100 - s.minimum)));
    const f = 1 - s.tempoMinus * anteil;
    return { vMax: f * (u.fahrer === 'pflaster' ? c.pflaster.tempo : 1), beschleunigung: f };
  }

  /** Anzeige im Spieler-Chip: „🏍️ 75 %“ (grün ab 75, gelb ab 50, sonst rot) und Fahrer 😀 / 🩹 / 🩼. */
  function hudZustand(u, cfg) {
    const s = (cfg || CFG()).schaden, p = Math.round(u.zustand);
    return { prozent: p, farbe: p >= s.gelbUnter ? 'gruen' : p >= s.rotUnter ? 'gelb' : 'rot', fahrer: u.fahrer, symbol: u.fahrer === 'pflaster' ? '🩹' : u.fahrer === 'verband' ? '🩼' : '😀' };
  }

  // ---------- Szenen-Zeitplan ----------
  function szenePlan(art, cfg) {
    const k = (cfg || CFG()).szene[art];
    if (!k) return null;
    let t = 0;
    const teil = (liste, seg) => liste.map(([name, dauer]) => { const p = { seg, name, t0: t, dauer, t1: t + dauer }; t += dauer; return p; });
    const A = teil(k.A, 'A'), B = teil(k.B, 'B');
    return { phasen: A.concat(B), dauerA: A[A.length - 1].t1, dauer: t };
  }
  /** Gesamtdauer der Szene (A + B). */
  function szeneDauer(art, cfg) { const p = szenePlan(art, cfg); return p ? p.dauer : 0; }
  /** Phase zur Szenenzeit t: { seg: 'A'|'B', name, u (0..1 in der Phase), t (Szenenzeit), tSeg, ende: boolean }. */
  function szenePhase(art, t, cfg) {
    const p = szenePlan(art, cfg);
    if (!p) return null;
    const ph = p.phasen;
    for (let i = 0; i < ph.length; i++) {
      if (t < ph[i].t1 || i === ph.length - 1) {
        const x = ph[i], u = Math.max(0, Math.min(1, (t - x.t0) / x.dauer));
        return { seg: x.seg, name: x.name, index: i, u, t, tSeg: t - (x.seg === 'A' ? 0 : p.dauerA), ende: t >= p.dauer };
      }
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
        d.ringe.forEach((r) => zonen.push({ s0: r.sK - 15, s1: r.sK + 34 }));
        d.reihen.forEach((r) => zonen.push({ s0: r.sK - 15, s1: r.sK + r.a1 + 30 }));
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
    hash, folge, zNeu, sturz, reparieren, heilen, abschlepp, krankenwagen, brauchtWerkstatt, brauchtKranken, faktoren, hudZustand,
    szenePlan, szeneDauer, szenePhase, fahrPose, stationenBilden, stationBereich, stationLaengs,
  };
})();
