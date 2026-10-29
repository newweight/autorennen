// ============================================================
// Motorrad-Stunts (Stufe M2): Konfiguration (Punkte-Tabelle) + reine Rechenlogik, ohne THREE/DOM (Node-testbar: tests/test_moto_stunts.js).
//
//   R.config.motoStunts        alle Zahlen an einer Stelle (Punkte, Combo-Fenster, Trick-Zeiten, Ring, Bus-Reihe, Zonen, KI) – leicht änderbar
//   R.Moto.stunts              Funktionen:
//     Combo         comboNeu, comboStunt(c, jetzt) → Multiplikator, comboSturz, comboRest
//     Tricks        restFlugzeit, trickPlan (Zeitplanung: kein Trick bei zu kurzer Flugzeit, fertig bis kurz vor der Landung),
//                   trickPose (Drehung um die Hochachse / Salto um die Querachse als Anzeige-Winkel), achsenVersatz (Wheelie/Stoppie um die Radachse)
//     Ring          ringBewertung (Volltreffer / Treffer / vorbei), ringDurchflug (Ebenen-Durchgang mit Interpolation)
//     Bus-Reihe     reiheLage (Rechteck der Reihe), reiheStatus (drüber / Kontakt / außerhalb), reiheFlugbahn (Mindestabstand zur Oberkante)
//     Wertung       stuntrennenWertung (Platzpunkte + Stuntpunkte, sortiert nach Gesamt)
//     KI            kiPlan (deterministisch per Saat)
//     Zustand       zNeu, tasteKante, schritt – die Zustandsmaschine je Fahrer (siehe stuntStart.js, dort wird sie ans Spiel gehängt)
// Alle Zeiten in Sekunden, Längen in Metern, Winkel in rad.
// ============================================================
window.Rennspiel = window.Rennspiel || {};

(function () {
  const R = window.Rennspiel;
  R.Moto = R.Moto || {};
  R.config = R.config || {};

  /** Punkte- und Tuning-Tabelle der Motorrad-Stunts. Hier ändern, nirgends sonst. */
  R.config.motoStunts = {
    punkte: {
      drehung: 200,            // Drehung in der Luft (360° um die Hochachse)
      salto: 400,              // Salto (360° um die Querachse)
      feuerring: 500,          // Durchflug durch den Feuerring
      volltreffer: 1000,       // genau mittig durch den Feuerring
      busProFahrzeug: 300,     // je Bus/Auto der Reihe, über die man springt
      wheelieProMeter: 10,     // Wheelie in der Zone, je Meter
      stoppieProMeter: 12,     // Stoppie in der Zone, je Meter
    },
    combo: { fenster: 4, max: 5 },                       // jeder Stunt innerhalb von 4 s nach dem letzten → Multiplikator +1, höchstens ×5
    platzpunkte: [2000, 1500, 1000], platzRest: 500,     // Stuntrennen: 1./2./3. Platz, sonst
    // Tricks: dauer = normale Drehzeit, min = kürzeste (abgekürzte) Drehzeit, reserve = so viel Zeit vor der Landung muss der Trick fertig sein
    trick: {
      drehung: { dauer: 0.8, min: 0.5 }, salto: { dauer: 1.0, min: 0.7 },
      reserve: 0.15, frueh: 0.1,                         // frueh: frühestens so lange nach dem Absprung beginnt ein Trick
      upgradeFenster: 0.35,                              // zweites Tippen in diesem Fenster macht aus der Drehung einen Salto
      hoehe: 0.35,                                       // kleiner Hüpfer beim Salto (nur Anzeige)
    },
    taste: ['ShiftRight', 'ShiftLeft'],                  // Spieler 1 (Pfeile) / Spieler 2 (WASD): Trick-Taste; am Boden in der Wheelie-Zone = Wheelie
    schanzeMin: 20,                                      // m/s: Mindesttempo auf eine Schanze im Motorradmodus (config.anlauf.schanzeMin; Standard Autos 14)
    ring: {
      abstand: 16, auslegung: 32,                        // Ringmitte so weit hinter der Kante; Bahn für dieses Tempo (m/s) berechnet
      radius: 3.0, innen: 1.5, koerper: 0.2,             // Außenradius, Volltreffer-Kreis, Fahrer-Spielraum (Treffer, wenn Abstand ≤ radius − koerper)
      fahrerHoehe: 0.9,                                  // Fahrermitte über dem Bodenpunkt des Motorrads
    },
    reihe: {
      tiefeJe: 2.7, luecke: 0.0, start: 0.5,             // Tiefe je Fahrzeug in Fahrtrichtung (quer aufgestellt), Abstand hinter der Kante
      bus: { hoehe: 2.5, laenge: 15 },
      sicherheit: 0.3,                                   // geforderter Mindestabstand Flugbahn – Oberkante (m)
      kontaktHoehe: 0.0,                                 // Flug tiefer als Oberkante + dieser Wert = Kontakt
    },
    zonen: { mindestMeter: 8, wheelieWinkel: 0.5, stoppieWinkel: 0.38, minTempo: 5, stoppieMinTempo: 6 },
    ki: { trickChance: 0.6, saltoAnteil: 0.4, startMin: 0.15, startMax: 0.45 },
  };

  // Motorradmodus: Mindesttempo auf eine Schanze 20 m/s (Autos: 14) – so ist die Bus-Reihe schon beim langsamsten erlaubten Anfahren sicher überflogen (tests/test_moto_stunts.js)
  if (window.MOTORRAD === true && R.config.anlauf) R.config.anlauf.schanzeMin = R.config.motoStunts.schanzeMin;

  const CFG = () => R.config.motoStunts;
  const G = 9.81;
  const klemme = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
  const glatt = (p) => { p = klemme(p, 0, 1); return p * p * (3 - 2 * p); };

  // ---------- Combo ----------
  function comboNeu() { return { zaehler: 0, letzter: -Infinity, max: 0 }; }
  /** Einen Stunt zur Combo zählen. Rückgabe: Multiplikator für DIESEN Stunt (1 beim ersten, dann ×2, ×3 … höchstens combo.max). */
  function comboStunt(c, jetzt, cfg) {
    const k = (cfg || CFG()).combo;
    c.zaehler = (jetzt - c.letzter <= k.fenster && c.zaehler > 0) ? c.zaehler + 1 : 1;
    c.letzter = jetzt;
    c.max = Math.max(c.max, Math.min(k.max, c.zaehler));
    return Math.min(k.max, c.zaehler);
  }
  /** Sturz: Combo weg. */
  function comboSturz(c) { c.zaehler = 0; c.letzter = -Infinity; }
  /** Restzeit des Combo-Fensters (0 = abgelaufen) und aktueller Multiplikator für die Anzeige. */
  function comboRest(c, jetzt, cfg) {
    const k = (cfg || CFG()).combo, rest = c.zaehler > 0 ? c.letzter + k.fenster - jetzt : 0;
    return rest > 0 ? { rest, mult: Math.min(k.max, c.zaehler), zaehler: c.zaehler } : { rest: 0, mult: 0, zaehler: 0 };
  }

  // ---------- Flugzeit + Trick-Planung ----------
  /** Restflugzeit (s) bis zum Boden: y = aktuelle Höhe, vy = Steiggeschwindigkeit, boden = Höhe des Bodens darunter. */
  function restFlugzeit(y, vy, boden, g) {
    const gg = g || G, h = Math.max(0, y - boden);
    return (vy + Math.sqrt(Math.max(0, vy * vy + 2 * gg * h))) / gg;
  }
  /**
   * Trick-Zeitplanung. rest = geschätzte Restflugzeit. Liefert { art, dauer, abgekuerzt } oder null (zu kurz → gar nicht erst beginnen).
   * Der Trick ist spätestens `reserve` s vor der Landung fertig; reicht die Zeit nicht für die normale Dauer, wird er bis auf `min` verkürzt;
   * ein Salto, der dafür zu lang wäre, wird zur Drehung herabgestuft.
   */
  function trickPlan(rest, art, cfg) {
    const k = (cfg || CFG()).trick, frei = rest - k.reserve;
    const c = k[art];
    if (!c) return null;
    if (frei >= c.dauer) return { art, dauer: c.dauer, abgekuerzt: false };
    if (frei >= c.min) return { art, dauer: frei, abgekuerzt: true };
    if (art === 'salto') { const p = trickPlan(rest, 'drehung', cfg); return p ? { art: 'drehung', dauer: p.dauer, abgekuerzt: true } : null; }
    return null;
  }
  /** Anzeige-Pose eines laufenden Tricks bei Zeitanteil p ∈ [0,1]: gier (Drehung um die Hochachse), salto (um die Querachse, vorwärts = negativ), hoehe. */
  function trickPose(art, p, cfg) {
    const e = glatt(p), k = (cfg || CFG()).trick;
    if (art === 'drehung') return { gier: 2 * Math.PI * e, salto: 0, hoehe: 0 };
    if (art === 'salto') return { gier: 0, salto: -2 * Math.PI * e, hoehe: k.hoehe * Math.sin(Math.PI * klemme(p, 0, 1)) };
    return { gier: 0, salto: 0, hoehe: 0 };
  }
  /**
   * Position der Gruppe `purzel`, damit sich das Motorrad um eine Radachse statt um die Fahrzeugmitte dreht (Wheelie: Hinterachse,
   * Stoppie: Vorderachse). theta = Drehung um die Querachse (Vorderrad hoch = positiv). pivotY/pivotZ = Ruhelage der Gruppe (0,7 | 0),
   * achseY/achseZ = Radachse. Rückgabe { y, z }: purzel.position.
   */
  function achsenVersatz(theta, achseY, achseZ, pivotY, pivotZ) {
    const dy = pivotY - achseY, dz = (pivotZ || 0) - achseZ, c = Math.cos(theta), s = Math.sin(theta);
    return { y: achseY + dy * c - dz * s, z: achseZ + dy * s + dz * c };
  }

  // ---------- Feuerring ----------
  /** Bewertung eines Durchflugs: q = seitlich, dy = senkrecht zur Ringmitte (m). */
  function ringBewertung(q, dy, cfg) {
    const k = (cfg || CFG()).ring, r = Math.hypot(q, dy);
    if (r <= k.innen) return 'volltreffer';
    if (r <= k.radius - k.koerper) return 'treffer';
    return 'vorbei';
  }
  /**
   * Durchgang durch die Ringebene zwischen zwei Positionen. d0/d1 = Abstand der Position zur Ebene (Fahrtrichtung positiv) vorher/nachher,
   * q0/q1 seitlich, y0/y1 Höhe, ringY = Höhe der Ringmitte. Liefert null (keine Ebene passiert) oder { q, dy, bewertung }.
   */
  function ringDurchflug(d0, d1, q0, q1, y0, y1, ringY, cfg) {
    if (!(d0 < 0 && d1 >= 0)) return null;
    const a = d1 === d0 ? 1 : -d0 / (d1 - d0), q = q0 + (q1 - q0) * a, dy = (y0 + (y1 - y0) * a) + (cfg || CFG()).ring.fahrerHoehe - ringY;
    return { q, dy, bewertung: ringBewertung(q, dy, cfg) };
  }
  /** Höhe der Ringmitte (absolut) aus der Flugbahn bei Tempo `v`: Absprung (yKante, Winkel in rad), Abstand d hinter der Kante. */
  function ringHoehe(yKante, winkel, d, v, cfg, vyMax, g) {
    const k = (cfg || CFG()).ring, vv = v || k.auslegung, vy = Math.min(vv * Math.sin(winkel), vyMax === undefined ? 5 : vyMax), t = (d === undefined ? k.abstand : d) / vv;
    return yKante + vy * t - 0.5 * (g || G) * t * t;
  }

  // ---------- Bus-/Autoreihe ----------
  /**
   * Lage der Reihe als Rechteck in Streckenkoordinaten: a = Abstand hinter der Kante (Fahrtrichtung), q = seitlich.
   * reihe = { art: 'bus' | 'auto', n }; breite = Rampenbreite (Fahrbahn + 0,5). Rückgabe { a0, a1, tiefe, halb, hoehe, n, art }.
   */
  function reiheLage(reihe, breite, cfg) {
    const k = (cfg || CFG()).reihe, f = k[reihe.art] || k.bus, tiefe = reihe.n * k.tiefeJe;
    return { art: reihe.art, n: reihe.n, a0: k.start, a1: k.start + tiefe, tiefe, halb: Math.min(f.laenge, breite) / 2, hoehe: f.hoehe };
  }
  /**
   * Status eines Fahrers relativ zur Reihe. a/q = Lage (a hinter der Kante), hoch = Höhe über dem Boden, luft = im Flug.
   * 'ausser' (nicht über der Reihe), 'drueber' (sicher über der Oberkante), 'kontakt' (am Boden in der Reihe oder zu tief), 'hinter' (a > a1).
   */
  function reiheStatus(L, a, q, hoch, luft, cfg) {
    const k = (cfg || CFG()).reihe;
    if (a > L.a1) return 'hinter';
    if (a < L.a0 || Math.abs(q) > L.halb) return 'ausser';
    if (!luft) return 'kontakt';
    return hoch >= L.hoehe + k.kontaktHoehe ? 'drueber' : 'kontakt';
  }
  /**
   * Mindestabstand (m) einer ballistischen Flugbahn zur Oberkante der Reihe. Bahn: Absprung in Höhe h0 über dem Boden der Kante,
   * Steigung vy0, Tempo v (alles in der Streckenebene, Boden eben). Prüft a ∈ [a0, a1]; negativ = Berührung. landeAbstand = a der Landung.
   */
  function reiheFlugbahn(L, h0, vy0, v, g) {
    const gg = g || G;
    let min = Infinity;
    const n = 60;
    for (let i = 0; i <= n; i++) {
      const a = L.a0 + (L.a1 - L.a0) * i / n, t = a / v, y = h0 + vy0 * t - 0.5 * gg * t * t;
      min = Math.min(min, y - L.hoehe);
    }
    const tl = (vy0 + Math.sqrt(vy0 * vy0 + 2 * gg * h0)) / gg;
    return { abstand: min, landeA: v * tl, flugzeit: tl };
  }

  // ---------- Stuntrennen-Wertung ----------
  /** zeilen: [{ platz, stunt, ... }] → um platzPunkte, gesamt ergänzt, nach gesamt (dann Platz) sortiert, rang = neue Reihenfolge. */
  function stuntrennenWertung(zeilen, cfg) {
    const k = cfg || CFG();
    const erg = zeilen.map((z) => {
      const pp = k.platzpunkte[z.platz - 1] !== undefined ? k.platzpunkte[z.platz - 1] : k.platzRest;
      return Object.assign({}, z, { platzPunkte: pp, stuntPunkte: z.stunt || 0, gesamt: pp + (z.stunt || 0) });
    });
    erg.sort((a, b) => b.gesamt - a.gesamt || a.platz - b.platz);
    erg.forEach((z, i) => { z.rang = i + 1; });
    return erg;
  }

  // ---------- KI ----------
  function hash(text) { let h = 0x811c9dc5; for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return h >>> 0; }
  function zufall(seed) {
    let a = seed >>> 0;
    return function () { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  /** Soll ein KI-Fahrer in diesem Flug einen Trick machen? Deterministisch aus Saat, Fahrernummer und Flugnummer. → null | { art, startT } */
  function kiPlan(saat, nr, flugNr, cfg) {
    const k = (cfg || CFG()).ki, r = zufall(hash(saat + '|' + nr + '|' + flugNr));
    if (r() >= k.trickChance) return null;
    const art = r() < k.saltoAnteil ? 'salto' : 'drehung', startT = k.startMin + (k.startMax - k.startMin) * r();
    return { art, startT };
  }

  // ---------- Zustandsmaschine je Fahrer ----------
  function zNeu() {
    return {
      punkte: 0, combo: comboNeu(), jetzt: 0,
      luft: false, flugT: 0, flugNr: 0, ereignisse: [],
      trick: null,                 // { art, t, dauer, start, abgekuerzt }
      wartend: null,               // { art, seit } – Tipp auf der Rampe / kurz nach dem Absprung, wartet auf `frueh`
      folge: null,                 // nach dem laufenden Trick gewünscht
      tastePrev: false, gierRest: 0,
      ringFertig: false, reiheUeber: false, reiheFertig: false,
      wheelie: { aktiv: false, meter: 0, winkel: 0 }, stoppie: { aktiv: false, meter: 0, winkel: 0 },
      pose: { gier: 0, salto: 0, hoehe: 0, nick: 0, achse: 'hinten' },
      stat: { spruenge: 0, drehungen: 0, saltos: 0, abgekuerzt: 0, ringe: 0, volltreffer: 0, busse: 0, wheelieM: 0, stoppieM: 0, stuerze: 0, ereignisse: 0 },
    };
  }
  /** Flanke der Trick-Taste: neu gedrückt (down = gehalten ODER in diesem Bild angetippt, auch wenn schon wieder losgelassen). */
  function tasteKante(z, down) {
    const kante = !!down && !z.tastePrev;
    z.tastePrev = !!down;
    return kante;
  }

  /** Stunt gutschreiben. basis = Punkte laut Tabelle, name = Anzeigetext. Liefert das Ereignis. */
  function vergeben(z, art, name, basis, jetzt, extra) {
    const mult = comboStunt(z.combo, jetzt);
    const punkte = basis * mult;
    z.punkte += punkte; z.stat.ereignisse++;
    const e = Object.assign({ art, name, basis, mult, punkte, gesamt: z.punkte, combo: z.combo.zaehler }, extra || {});
    z.ereignisse.push(e);
    return e;
  }
  /** Sturz (Purzelbaum): Combo weg, Tricks/Zonen laufen aus. */
  function sturz(z) {
    comboSturz(z.combo); z.stat.stuerze++;
    z.trick = null; z.gierRest = 0; z.wartend = null; z.folge = null;
    z.wheelie.aktiv = false; z.wheelie.meter = 0; z.stoppie.aktiv = false; z.stoppie.meter = 0;
  }

  /** Laufenden Trick werten (Punkte, Statistik). */
  function trickFertig(z, k, jetzt) {
    const t = z.trick;
    if (!t) return;
    if (t.art === 'salto') { z.stat.saltos++; vergeben(z, 'salto', 'Salto!', k.punkte.salto, jetzt, { abgekuerzt: t.abgekuerzt }); }
    else { z.stat.drehungen++; vergeben(z, 'drehung', 'Drehung!', k.punkte.drehung, jetzt, { abgekuerzt: t.abgekuerzt }); }
    if (t.abgekuerzt) z.stat.abgekuerzt++;
  }

  function trickBeginnen(z, art, rest, cfg) {
    const plan = trickPlan(rest, art, cfg);
    if (!plan) return false;
    z.trick = { art: plan.art, t: 0, dauer: plan.dauer, start: z.flugT, abgekuerzt: plan.abgekuerzt };
    return true;
  }

  /**
   * Ein Schritt. e = {
   *   dt, jetzt (Spielzeit s), luft (im Flug), rampe (auf der Rampe), flugT (s seit Absprung), y, vy, boden (Bodenhöhe darunter),
   *   tippen (Trick-Taste neu gedrückt: true), halten (Trick-Taste gehalten), bremse (Bremse gehalten), v (Tempo m/s), weg (m in diesem Schritt),
   *   zone: null | 'wheelie' | 'stoppie' (Zone, in der das Motorrad gerade ist), landung: true im Schritt der Landung, abflug: true im Schritt des Absprungs,
   *   sturz: true wenn gerade ein Purzelbaum begann, ring: null | { bewertung }, bus: null | { n } (Bus-Sprung gelungen)
   * }
   * Rückgabe: z.ereignisse (Liste; der Aufrufer leert sie).
   */
  function schritt(z, e, cfg) {
    const k = cfg || CFG(), dt = e.dt;
    z.jetzt = e.jetzt;
    // --- Absprung / Landung ---
    if (e.abflug) {
      z.luft = true; z.flugT = 0; z.flugNr++; z.stat.spruenge++; z.ringFertig = false; z.reiheUeber = false; z.reiheFertig = false;
      z.trick = null; z.gierRest = 0;
    }
    if (e.luft) z.flugT = e.flugT;
    if (e.landung || (z.luft && !e.luft && !e.abflug)) {
      z.luft = false;
      if (z.trick && z.trick.t / z.trick.dauer >= 0.5) trickFertig(z, k, e.jetzt);   // Landung kam etwas früher als geplant: Trick zählt trotzdem (kein Sturz durch Tricks)
      z.trick = null; z.gierRest = 0;
      z.wartend = null; z.folge = null;
    }
    if (e.sturz) sturz(z);

    // --- Trick-Taste ---
    if (e.tippen) {
      if (e.luft || e.rampe) {
        const rest = e.luft ? restFlugzeit(e.y, e.vy, e.boden) : 9;
        if (z.trick) {
          if (z.trick.art === 'drehung' && z.trick.t <= k.trick.upgradeFenster) {
            const p = trickPlan(rest, 'salto', k);                   // Salto von jetzt an; der schon gedrehte Winkel wird sanft abgebaut
            if (p && p.art === 'salto') {
              z.gierRest = trickPose('drehung', z.trick.t / z.trick.dauer, k).gier;
              z.trick = { art: 'salto', t: 0, dauer: p.dauer, start: z.flugT, abgekuerzt: p.abgekuerzt };
            }
          } else if (!z.folge) z.folge = 'drehung';
        } else if (z.wartend) {
          if (z.wartend.art === 'drehung') z.wartend.art = 'salto';
        } else if (e.luft && z.flugT >= k.trick.frueh) {
          if (!trickBeginnen(z, 'drehung', rest, k)) { /* zu kurz: nichts */ }
        } else z.wartend = { art: 'drehung', seit: e.jetzt };
      }
    }
    if (z.wartend && e.luft && z.flugT >= k.trick.frueh && !z.trick) {
      const rest = restFlugzeit(e.y, e.vy, e.boden);
      trickBeginnen(z, z.wartend.art, rest, k);
      z.wartend = null;
    }
    // --- laufender Trick ---
    if (z.trick) {
      z.trick.t += dt;
      if (z.trick.t >= z.trick.dauer) {
        trickFertig(z, k, e.jetzt);
        z.trick = null;
        if (z.folge) {
          const art = z.folge; z.folge = null;
          if (e.luft) trickBeginnen(z, art, restFlugzeit(e.y, e.vy, e.boden), k);
        }
      }
    }
    // --- Ring / Bus ---
    if (e.ring && !z.ringFertig && e.ring.bewertung !== 'vorbei') {
      z.ringFertig = true;
      if (e.ring.bewertung === 'volltreffer') { z.stat.volltreffer++; vergeben(z, 'volltreffer', 'Volltreffer!', k.punkte.volltreffer, e.jetzt); }
      else { z.stat.ringe++; vergeben(z, 'feuerring', 'Feuerring!', k.punkte.feuerring, e.jetzt); }
    }
    if (e.bus && !z.reiheFertig) {
      z.reiheFertig = true; z.stat.busse += e.bus.n;
      vergeben(z, 'bus', 'Bus-Sprung!', k.punkte.busProFahrzeug * e.bus.n, e.jetzt, { n: e.bus.n });
    }
    // --- Wheelie / Stoppie ---
    const zk = k.zonen, boden = !e.luft && !e.rampe;
    const wheelieOk = boden && e.zone === 'wheelie' && e.halten && e.v >= zk.minTempo;
    const stoppieOk = boden && e.zone === 'stoppie' && e.bremse && e.v >= (z.stoppie.aktiv ? 3 : zk.stoppieMinTempo);
    zoneSchritt(z, z.wheelie, wheelieOk, e.weg, zk, k, 'wheelie', 'Wheelie!', k.punkte.wheelieProMeter, e.jetzt);
    zoneSchritt(z, z.stoppie, stoppieOk, e.weg, zk, k, 'stoppie', 'Hinterrad hoch!', k.punkte.stoppieProMeter, e.jetzt);

    // --- Anzeige-Pose ---
    const pose = z.pose;
    let tp = { gier: 0, salto: 0, hoehe: 0 };
    if (z.trick) tp = trickPose(z.trick.art, z.trick.t / z.trick.dauer, k);
    if (z.gierRest) { z.gierRest *= Math.exp(-dt / 0.1); if (Math.abs(z.gierRest) < 0.01) z.gierRest = 0; }
    pose.gier = tp.gier + (z.gierRest || 0); pose.salto = tp.salto; pose.hoehe = tp.hoehe;
    const glaett = 1 - Math.exp(-dt / 0.12);
    z.wheelie.winkel += ((z.wheelie.aktiv ? zk.wheelieWinkel : 0) - z.wheelie.winkel) * glaett;
    z.stoppie.winkel += ((z.stoppie.aktiv ? zk.stoppieWinkel : 0) - z.stoppie.winkel) * glaett;
    if (z.wheelie.winkel < 0.003) z.wheelie.winkel = 0;
    if (z.stoppie.winkel < 0.003) z.stoppie.winkel = 0;
    pose.nick = z.wheelie.winkel > z.stoppie.winkel ? z.wheelie.winkel : -z.stoppie.winkel;
    pose.achse = pose.nick >= 0 ? 'hinten' : 'vorn';
    return z.ereignisse;
  }

  function zoneSchritt(z, w, ok, weg, zk, k, art, name, proMeter, jetzt) {
    if (ok) {
      if (!w.aktiv) { w.aktiv = true; w.meter = 0; }
      w.meter += Math.max(0, weg || 0);
    } else if (w.aktiv) {
      w.aktiv = false;
      if (w.meter >= zk.mindestMeter) {
        const m = Math.round(w.meter);
        if (art === 'wheelie') z.stat.wheelieM += m; else z.stat.stoppieM += m;
        vergeben(z, art, name, Math.round(w.meter * proMeter), jetzt, { meter: m });
      }
      w.meter = 0;
    }
  }

  R.Moto.stunts = {
    comboNeu, comboStunt, comboSturz, comboRest,
    restFlugzeit, trickPlan, trickPose, achsenVersatz,
    ringBewertung, ringDurchflug, ringHoehe,
    reiheLage, reiheStatus, reiheFlugbahn,
    stuntrennenWertung, kiPlan, hash, zufall,
    zNeu, tasteKante, schritt, sturz, vergeben,
  };
})();
