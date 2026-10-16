// ============================================================
// 15.10. (v25) Verkehr auf der Strecke: Geisterfahrer, Krankenwagen, Abschleppwagen
//
// Einstellungen (Menü, Standard AUS = alles wie bisher):
//   geisterfahrer  aus | an      selten (v28: je Runde 0–2, nie zwei nah beieinander) fahren Geisterfahrer ENTGEGEN der Fahrtrichtung (Spline-Folgen mit weichen Spurwechseln, kein Ausweichen,
//                                Licht an + Lichthupe + Hupe), HUD-Warnung „⚠️ Geisterfahrer voraus!“ nur mit config verkehr.geister.warnung (v28: Standard aus)
//   krankenwagen / abschleppwagen  an | aus  (v28: je einzeln, an = 1 Wagen; alt: verkehr aus | wenig | viel → wenig/viel = beide an)
//   Krankenwagen   Multivan-Basis (Katalog 'krankenwagen'), Blaulicht + Sirene, fährt zügig (34 m/s) in Fahrtrichtung, Kontakt = 3× Schaden
//   Abschleppwagen Modell aus world/abschleppwagen.js, gelbe Rundumleuchte, ~9,5 m/s in Fahrtrichtung = bewegliches Hindernis (überholen!)
//
// Aufbau wie die Polizei (world/polizei.js): die Wagen sind Einträge HINTER den Teilnehmern in spiel.fahrzeuge (f.polizei = true: nicht im Rennen,
// keine Pickups/Münzen; f.verkehr = Eintrag). Sie werden nur gebraucht, wenn sie fahren: sonst „geparkt“ (f.ausgeschieden = true, Mesh unsichtbar,
// weit weg – derselbe Mechanismus wie bei „Letzter fliegt raus“, kein Draw-Call). Kollisionen mit Autos laufen über Kollisionen.autoAuto (normal,
// Schaden-System wie Auto-Auto; Krankenwagen: Verlust × config.verkehr.krankenwagen.schadenFaktor, siehe schadenFaktor()).
//
// Planung (rein, ohne Three.js – tests/test_verkehr.js): Sperrzonen = Tunnel, Brücken, Überführungen, Kreuzungen, Spur-Engstellen, Loopings und
// Schanzen samt Anlauf, harte Hindernisse (Baustelle/Ast/Wrack), Start/Ziel; dazwischen die freien Abschnitte. Geisterfahrer-Routen: 3 Abschnitte
// (≥ routeMin, ≤ routeMax m), gleichmäßig über die Runde verteilt, deterministisch aus Strecke + Variante (Seed). In Gabelungen fahren alle Verkehrs-
// teilnehmer auf EINEM Ast (Seed). Krankenwagen/Abschleppwagen erscheinen unsichtbar weit vor einem Spieler (≥ freiAbstand von allen Autos/Kameras).
//
// Schnittstelle für main.js / Server / Online-Client (Klasse Verkehr):
//   new R.Verkehr(spiel)                    einsetzen(strecke, teilnehmerAnzahl, { geister, stufe })   legt die (geparkten) Wagen an
//   steuerung(i, dt, rennen)                Steuerung des Verkehrswagens an Fahrzeug-Index i (Spline-Folgen, Tempo, Bremsen vor Hindernissen)
//   andereFuer(liste) / anhaengen(liste)    aktive Verkehrswagen als „andere“ für die KI (sie überholt ohne Hängen)
//   schritt(dt, laeuft)                     Auftritte (erscheinen/verschwinden), Spurwechsel, Hupe-/Lichthupe-Zustand je Physikschritt
//   animieren(zeit)                         Blaulicht, Rundumleuchte, Lichthupe; Blau-Licht kommt aus dem festen Licht-Pool (v26c, blaulichtQuellen)
//   ton(stumm)                              Sirene des Krankenwagens, Hupe der Geisterfahrer
//   warnung(i)                              HUD: { text, abstand } für Teilnehmer i oder null
//   schadenFaktor(stoss)                    Faktor für den Schaden eines Auto-Stoßes (Krankenwagen: 3, sonst 1)
//   minimapPunkte()                         Positionen der aktiven Wagen für die Minimap
//   zustandKodieren() / zustandAnwenden(v)  Server → Client (Protokoll: zustand.vk), siehe server/PROTOKOLL.md
//   zerstoeren()                            Lichter, eigene Geometrien, Ton
// ============================================================
(function () {
  const R = window.Rennspiel;

  const STANDARD = {
    geisterfahrerStandardAn: false, verkehrStandard: 'aus',
    stufen: { aus: { krankenwagen: 0, abschleppwagen: 0 }, wenig: { krankenwagen: 1, abschleppwagen: 1 }, viel: { krankenwagen: 2, abschleppwagen: 2 } },
    geister: { anzahl: 3, tempo: 21, tempoSchwankung: 3, warnAbstand: 150, spurWechselAb: 70, spurWechselBis: 170, wechselLaenge: 45,
      routeMax: 700, routeMin: 260, routeMinNot: 100, routeLuecke: 30, hupeAbstand: 110, ausloeser: 420, spurAnteil: 0.45, wechselChance: 0.7, wechselAbstand: 120,
      verteilung: [0.2, 0.4, 0.4], mindestAbstand: 400, warnung: false },     // v28 (W3): je Runde 0/1/2 Geisterfahrer (Erwartung 1,2), nie zwei näher als 400 m, keine HUD-Warnung/Minimap-Blinken
    krankenwagen: { tempo: 34, schadenFaktor: 3, autoId: 'krankenwagen', spurQ: 0.28 },
    abschleppwagen: { tempo: 9.5, spurQ: 0.3, hoerweite: 110 },
    sperrVor: 45, sperrNach: 45, loopingVor: 140, loopingNach: 70, schanzeVor: 140, schanzeNach: 40, startFrei: 220, zielFrei: 120,
    hindernisSperre: 25, hindernisNach: 20,
    freiAbstand: 130, spawnVorAnderen: 260, wiederkehr: [4, 12], lichtAbstand: 45, blinkHz: 3,
    // intern
    steckenZeit: 3.5, abseitsZeit: 2.5, steckNah: 15, sichtFrei: 120, endeAuslauf: 40, nachlauf: 25, sichtNachlauf: 40, hintenWeg: 220, sireneHoerweite: 120, hupeHoerweite: 160, vorausblickMin: 7, vorausblickMax: 38,
  };
  function cfg() {
    const c = (R.config && R.config.verkehr) || {};
    return Object.assign({}, STANDARD, c, {
      stufen: Object.assign({}, STANDARD.stufen, c.stufen || {}),
      geister: Object.assign({}, STANDARD.geister, c.geister || {}),
      krankenwagen: Object.assign({}, STANDARD.krankenwagen, c.krankenwagen || {}),
      abschleppwagen: Object.assign({}, STANDARD.abschleppwagen, c.abschleppwagen || {}),
    });
  }
  const klemme = (x, a, b) => (x < a ? a : x > b ? b : x);
  const glatt = (t) => { t = klemme(t, 0, 1); return t * t * (3 - 2 * t); };
  function winkelNorm(w) { if (w !== w) return w; if (!(Math.abs(w) < 1e3)) w = Number.isFinite(w) ? w % (2 * Math.PI) : 0; while (w > Math.PI) w -= 2 * Math.PI; while (w < -Math.PI) w += 2 * Math.PI; return w; }   // v26b: Obergrenze gegen Infinity/riesige Werte
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function hashText(t) { let h = 2166136261 >>> 0; for (let i = 0; i < t.length; i++) { h ^= t.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return h >>> 0; }

  // ------------------------------------------------------------
  // Planung (rein)
  // ------------------------------------------------------------
  /** Sperrzonen der Strecke als sortierte, verschmolzene Liste [[a, b], …] in [0, L]. */
  function sperrzonen(strecke, opt) {
    const c = Object.assign(cfg(), opt || {}), sp = strecke.spline, L = sp.laenge;
    const roh = [];
    const add = (a, b) => {
      if (!(b > a)) return;
      if (b - a >= L) { roh.push([0, L]); return; }
      const a2 = ((a % L) + L) % L, e = a2 + (b - a);
      if (e <= L) roh.push([a2, e]); else { roh.push([a2, L]); roh.push([0, e - L]); }
    };
    const laenge = (s0, s1) => { let d = s1 - s0; if (!(L > 0) || !Number.isFinite(d)) return 0; if (d < 0) d += Math.ceil(-d / L) * L; return d; };   // v26b: ohne Schleife (L = 0 / Infinity → früher Endlosschleife)
    const bereich = (b, vor, nach) => { if (b && b.s0 !== undefined && b.s1 !== undefined) add(b.s0 - vor, b.s0 + laenge(b.s0, b.s1) + nach); };
    // Start/Ziel: Startaufstellung und Zielgerade
    add(-c.zielFrei, c.startFrei);
    (strecke.tunnel || []).forEach((b) => bereich(b, c.sperrVor, c.sperrNach));
    (strecke.bruecken || []).forEach((b) => bereich(b, c.sperrVor, c.sperrNach));
    (strecke.ueberfuehrungen || []).forEach((u) => { bereich(u, c.sperrVor, c.sperrNach); if (u.unten) bereich(u.unten, c.sperrVor, c.sperrNach); });
    (strecke.kreuzungen || []).forEach((k) => {
      bereich(k.a, c.sperrVor, c.sperrNach); bereich(k.b, c.sperrVor, c.sperrNach);
      if (k.s0 !== undefined) bereich({ s0: k.s0, s1: k.s1 }, c.sperrVor, c.sperrNach);
    });
    (strecke._spurEng || []).forEach((e) => bereich(e, 40 + c.sperrVor, 40 + c.sperrNach));        // Engstelle + weicher Übergang (SPUR_UEBERGANG 40 m)
    (strecke.loopings || []).forEach((l) => bereich(l, c.loopingVor, c.loopingNach));
    // Anlauf-Stellen (Looping/Schanze) – bringen auch den berechneten Mindest-Anlauf mit
    if (R.Anlauf && R.Anlauf.stellen) {
      try { R.Anlauf.stellen(strecke).forEach((st) => add(st.s - Math.max(st.abstand || 0, c.loopingVor), st.s + c.loopingNach)); } catch (e) { /* ohne Anlauf-Liste */ }
    }
    (strecke.schanzen || []).forEach((s) => add(s.s - c.schanzeVor, s.s + (s.laenge || 30) + 100 + c.schanzeNach));
    // harte Hindernisse (Baustelle, Ast, Wracks …; Öl-/Sandflecken nicht: dort fährt man einfach durch)
    (strecke.hindernisse || []).forEach((h) => {
      if (h.untergrund || h.s0 === undefined || h.s1 === undefined) return;
      bereich(h, c.hindernisSperre, c.hindernisNach);
    });
    roh.sort((x, y) => x[0] - y[0]);
    const erg = [];
    roh.forEach((z) => {
      const l = erg[erg.length - 1];
      if (l && z[0] <= l[1]) l[1] = Math.max(l[1], z[1]); else erg.push([z[0], z[1]]);
    });
    return erg;
  }

  /** Freie Abschnitte = Komplement der Sperrzonen in [0, L], nur ab minLaenge. */
  function freieAbschnitte(zonen, L, minLaenge) {
    const frei = [];
    let s = 0;
    zonen.forEach((z) => { if (z[0] - s >= minLaenge) frei.push([s, z[0]]); s = Math.max(s, z[1]); });
    if (L - s >= minLaenge) frei.push([s, L]);
    return frei;
  }

  /** Liegt s in einer Sperrzone (± zugabe)? */
  function gesperrt(zonen, s, zugabe) {
    const z = zugabe || 0;
    for (let i = 0; i < zonen.length; i++) if (s >= zonen[i][0] - z && s <= zonen[i][1] + z) return true;
    return false;
  }

  /**
   * Routen der Geisterfahrer: bis zu `anzahl` Abschnitte [a, b] (a < b), gleichmäßig über die Runde verteilt (Mitte nahe L·(k+½)/anzahl + Seed-Versatz),
   * jeder ≥ routeMin und ≤ routeMax lang, ohne Überlappung (60 m Abstand). Reicht der Platz nicht, werden kürzere Routen (≥ routeMinNot) genommen.
   */
  function geisterRouten(strecke, seed, opt) {
    const c = Object.assign(cfg(), opt || {}), G = c.geister, L = strecke.spline.laenge, rnd = mulberry32(hashText('geister|' + seed));
    const zonen = sperrzonen(strecke, opt);
    let freie = freieAbschnitte(zonen, L, G.routeMinNot);
    const routen = [];
    for (let k = 0; k < G.anzahl; k++) {
      const ziel = L * (k + 0.5) / G.anzahl + (rnd() - 0.5) * L / (G.anzahl * 3);
      let best = null;
      freie.forEach((f) => {
        const laenge = f[1] - f[0];
        if (laenge < G.routeMinNot) return;
        let len = Math.min(G.routeMax, laenge - 8);
        // zu wenige freie Abschnitte für die restlichen Routen: den Abschnitt in m kürzere Routen teilen (Abstand routeLuecke)
        const noetig = G.anzahl - k;
        if (freie.length < noetig) {
          const m = klemme(Math.ceil(noetig / freie.length), 1, Math.floor((laenge - 8 + G.routeLuecke) / (G.routeMinNot + G.routeLuecke)) || 1);
          len = Math.min(len, Math.floor((laenge - 8 - G.routeLuecke * (m - 1)) / m));
        }
        const mitte = klemme(ziel, f[0] + 2 + len / 2, f[1] - 2 - len / 2);
        const a = mitte - len / 2, b = mitte + len / 2;
        let dist = Math.abs(((((a + b) / 2 - ziel) % L) + 1.5 * L) % L - L / 2);
        if (len < G.routeMin) dist += L / 6;                  // zu kurze Notrouten nur, wenn nichts Besseres da ist
        const wert = dist - 0.15 * len;
        if (!best || wert < best.wert) best = { a, b, wert, len };
      });
      if (!best) break;
      routen.push({ a: best.a, b: best.b, laenge: best.len });
      // belegt: Route + 60 m Abstand aus den freien Abschnitten herausnehmen
      const neu = [];
      freie.forEach((f) => {
        const x0 = best.a - G.routeLuecke, x1 = best.b + G.routeLuecke;
        if (f[1] <= x0 || f[0] >= x1) { neu.push(f); return; }
        if (x0 - f[0] >= G.routeMinNot) neu.push([f[0], x0]);
        if (f[1] - x1 >= G.routeMinNot) neu.push([x1, f[1]]);
      });
      freie = neu;
    }
    routen.sort((x, y) => x.a - y.a);
    return routen;
  }

  /**
   * v28 (W3): Welche der geplanten Routen sind in Runde `runde` (0-basiert) besetzt? 0, 1 oder 2 Geisterfahrer (G.verteilung = Wahrscheinlichkeiten für 0/1/2,
   * Standard 0,2/0,4/0,4 → Erwartung 1,2), deterministisch aus Seed + Runde. Zwei Routen nur, wenn zwischen ihnen mindestens G.mindestAbstand m Strecke liegen
   * (dann sind nie zwei gleichzeitig nah beieinander sichtbar); gibt es kein solches Paar, wird es einer.
   * @returns {number[]} Indizes in `routen`
   */
  function geisterAuswahl(routen, seed, runde, laenge, opt) {
    const G = Object.assign({}, cfg().geister, (opt && opt.geister) || {}), rnd = mulberry32(hashText('gr|' + seed + '|' + runde));
    const v = Array.isArray(G.verteilung) && G.verteilung.length === 3 ? G.verteilung : [0.2, 0.4, 0.4];
    const summe = (v[0] + v[1] + v[2]) || 1, u = rnd() * summe;
    let n = u < v[0] ? 0 : u < v[0] + v[1] ? 1 : 2;
    n = Math.min(n, routen.length);
    if (n === 0) return [];
    if (n === 1) return [Math.floor(rnd() * routen.length)];
    const paare = [];
    const luecke = (p, q) => { const d1 = (((q.a - p.b) % laenge) + laenge) % laenge, d2 = (((p.a - q.b) % laenge) + laenge) % laenge; return Math.min(d1, d2); };
    for (let i = 0; i < routen.length; i++) for (let j = i + 1; j < routen.length; j++) if (luecke(routen[i], routen[j]) >= G.mindestAbstand) paare.push([i, j]);
    if (!paare.length) return [Math.floor(rnd() * routen.length)];
    return paare[Math.floor(rnd() * paare.length)];
  }

  // ------------------------------------------------------------
  // Lage auf der Strecke
  // ------------------------------------------------------------
  /**
   * Punkt auf der Strecke bei Bogenlänge s. frac = Querlage als Anteil der nutzbaren halben Fahrbahnbreite (−1 links … +1 rechts, in Fahrtrichtung der
   * Strecke gesehen), rand = Abstand der Wagenmitte zum Fahrbahnrand. In Gabelungen: ab 25 m nach der Teilung Querlage in/um die Mitte des Astes ast (−1/+1).
   * @returns {{x:number, z:number, q:number, s:number, tx:number, tz:number}}
   */
  function lagePunkt(strecke, s, frac, ast, rand, aus) {
    const sp = strecke.spline, p = sp.punktBei(s), o = aus || {};
    const w = strecke.gabelungen && strecke.gabelungen.length ? strecke.gabelBei(s) : null;
    const halb = (w ? strecke.breite : (strecke.breiteBei ? strecke.breiteBei(s) : strecke.breite)) / 2;
    let Q = frac * Math.max(0.4, halb - rand);
    if (w && ast) {
      const rand2 = Math.min(w.u, w.g.L - w.u), g = glatt(rand2 / 25);
      const Qf = ast * w.c + frac * Math.max(0.3, w.h - rand);
      Q += (Qf - Q) * g;
    }
    o.x = p.x + p.nx * Q; o.z = p.z + p.nz * Q; o.q = Q; o.s = p.s; o.tx = p.tx; o.tz = p.tz;
    return o;
  }

  /** Ast (−1/+1) für eine Route, wenn sie eine Gabelung berührt, sonst 0 (Seed-Bit). */
  function astFuer(strecke, a, b, bit) {
    if (!strecke.gabelungen || !strecke.gabelungen.length) return 0;
    for (let s = a; s <= b; s += 10) if (strecke.gabelBei(s)) return bit ? 1 : -1;
    return 0;
  }

  // ------------------------------------------------------------
  // Fahrer (rein): Spline-Folgen mit Pure Pursuit (wie ai/driver.js, aber ohne Hindernisplanung)
  // ------------------------------------------------------------
  /**
   * Lenkung zum Zielpunkt (zx, zz). e.lenk = geglättete Lenkung (wird fortgeschrieben). tempo = vLaengs (kann negativ sein).
   * Gleiche Rechnung wie ai/driver.js (Kreisbogen durch Auto und Zielpunkt, Lenkverzug ausgleichen).
   */
  function lenkungZu(v, zx, zz, tempo, e, dt) {
    const vLenk = Math.max(3, Math.abs(tempo)), rateMax = Math.max(0.05, v.drehrateMax(vLenk)), wg = v.weltGeschwindigkeit();
    const px = v.x + wg.x * 0.2, pz = v.z + wg.z * 0.2, ph = v.heading - v.lenkung * rateMax * 0.2 * (tempo >= 0 ? 1 : -1);
    const hZiel = R.headingAus(zx - px, zz - pz), diff = winkelNorm(hZiel - ph), Lg = Math.max(4, Math.hypot(zx - px, zz - pz));
    const rateSoll = 2 * vLenk * Math.sin(klemme(diff, -1.4, 1.4)) / Lg;
    const ziel = klemme(-rateSoll / rateMax, -1, 1);
    e.lenk = (e.lenk || 0) + (ziel - (e.lenk || 0)) * Math.min(1, 14 * dt);
    return e.lenk;
  }
  /** Gas/Bremse für Zieltempo soll (m/s, ≥ 0) bei Tempo tempo. */
  function tempoSteuerung(soll, tempo) {
    const err = soll - tempo;
    let gas = 0, bremse = 0;
    if (err > 0) gas = klemme(err / 0.8, 0.15, 1);
    else if (err < -1.5 && tempo > 0.5) bremse = klemme((-err - 1.5) / 2 + 0.3, 0, 1);
    if (soll <= 0.1) { gas = 0; bremse = tempo > 0.3 ? 1 : 0; }
    return { gas, bremse };
  }

  // ------------------------------------------------------------
  // Abschleppwagen-Modell (Sonderbau für carBuilder.bauen)
  // ------------------------------------------------------------
  const LKW_AUTO = {
    id: 'abschleppwagen', name: 'Abschleppwagen', marke: 'Abschleppdienst', modell: 'Kranwagen', farbe: 0xf0b020, farbe2: 0x30343a, farbeName: 'Gelb',
    karosserie: 'van', waehlbar: false, sonderbau: 'abschleppwagen', generischerName: 'Abschleppwagen', beschreibung: 'Langsam und breit – überholen!',
    abmessungen: { laenge: 8.0, breite: 2.55, hoehe: 3.1, radstand: 4.6, radRadius: 0.58 },
    fahrwerte: { vMax: 16, beschleunigung: 3.2, bremsen: 14, rueckwaertsMax: 5, wendigkeit: 1.15, grip: 0.82, masse: 7500, laenge: 8.0, breite: 2.55 },
  };
  R.sonderbauten = R.sonderbauten || {};
  R.sonderbauten.abschleppwagen = function () {
    // Lkw aus world/abschleppwagen.js (Kran, Ladefläche, zwei Rundumleuchten), eingepackt in eine Gruppe mit den Feldern, die main.js/carBuilder erwarten
    const A = R.Abschleppwagen && R.Abschleppwagen.prototype && R.Abschleppwagen.prototype._lkwBauen;
    const g = new THREE.Group();
    g.name = 'abschleppwagen';
    let lkw = null;
    if (A) { lkw = A.call({}); lkw.visible = true; lkw.position.set(0, 0, 0.4); g.add(lkw); }
    else {
      const m = new THREE.Mesh(new THREE.BoxGeometry(2.4, 2.4, 7.5), new THREE.MeshLambertMaterial({ color: 0xf0b020 })); m.position.set(0, 1.4, 0); g.add(m);
    }
    const U = lkw ? lkw.userData : {};
    // Räder: main.js dreht userData.raeder mit Radradius 0,34 m; der Lkw hat 0,58 m → Stellvertreter, die langsamer drehen
    const faktor = 0.34 / 0.58;
    const raeder = (U.raeder || []).map((r) => {
      const st = { rotation: {} };
      Object.defineProperty(st.rotation, 'x', { set(w) { r.rotation.x = w * faktor; }, get() { return r.rotation.x / faktor; } });
      return st;
    });
    const bremsMat = new THREE.MeshBasicMaterial({ color: 0x5a0000 });
    g.userData = {
      autoId: 'abschleppwagen', karosserie: 'van', lackFarbe: 0xf0b020, raeder, vorderraeder: [], lenkObjekte: [], bremslichter: [], scheinwerfer: [],
      bremslichtMaterial: bremsMat, blaulicht: [], dach: null, rundum: [U.blink, U.blink2].filter(Boolean), lkw,
    };
    return g;
  };

  // ------------------------------------------------------------
  // Verkehr (Glue für main.js / Server / Online-Client)
  // ------------------------------------------------------------
  const GEISTER_MODELLE = ['passat', 'multivan', 'porsche-911', 'mini-cooper', 'audi-rs6', 'bmw-m4', 'amg-gt'];
  const GEISTER_FARBEN = [0x8e3fc7, 0xe8731a, 0x1aa79c, 0xd7dc1f, 0xf06fb0, 0x2f4fd0, 0xb02a2a];   // Fremdfarben (Katalogfarben der Modelle sind das nicht)

  class Verkehr {
    constructor(spiel) {
      this.spiel = spiel;
      this.c = cfg();
      this.idx = [];              // Fahrzeug-Indizes aller Verkehrswagen
      this.eintraege = [];        // { art, k, idx, aktiv, ... }
      this.n = 0;                 // Teilnehmer (Indizes 0 … n−1)
      this.zeit = 0;
      this.nurAnzeige = false;    // Online-Client: nichts rechnen, nur zeigen
      this.statistik = { auftritte: 0, geister: 0, kranken: 0, abschlepp: 0, verschwunden: 0, haengen: 0, haengenAlleine: 0, warnungen: 0 };
      this.zonen = []; this.frei = []; this.routen = [];
      this._eigen = []; this._lichter = []; this._farben = [0x2a5cff, 0x9fb8ff]; this._phase = -1; this._mm = [];
      this._rr = 0;               // Rundlauf: nächster Spieler für Krankenwagen/Abschleppwagen
      this._tn = [];              // Teilnehmerdaten (wiederverwendet)
      this._andere = [];
    }

    /** v28 (W1): Krankenwagen/Abschleppwagen je einzeln An/Aus (opt.krankenwagen / opt.abschleppwagen); ohne diese Felder gilt wie früher opt.stufe. */
    static _einzeln(opt) { return !!opt && (typeof opt.krankenwagen === 'boolean' || typeof opt.abschleppwagen === 'boolean'); }

    static aktiv(opt) { return !!opt && (opt.geister === true || opt.krankenwagen === true || opt.abschleppwagen === true || (!Verkehr._einzeln(opt) && !!opt.stufe && opt.stufe !== 'aus')); }

    /**
     * v28 (W1): Einstellungen (Menü/Lobby/Server) → Optionen für einsetzen(). Neue Felder `krankenwagen`/`abschleppwagen` (bool) gelten;
     * fehlen sie (alte gespeicherte Einstellung / alter Client), gilt `verkehr` 'wenig'/'viel' → beide an (Migration), sonst aus.
     * @returns {{geister:boolean, krankenwagen:boolean, abschleppwagen:boolean}}
     */
    static ausEinstellung(e) {
        const o = e || {}, alt = o.verkehr === 'wenig' || o.verkehr === 'viel';
        return { geister: o.geisterfahrer === true,
          krankenwagen: typeof o.krankenwagen === 'boolean' ? o.krankenwagen : alt,
          abschleppwagen: typeof o.abschleppwagen === 'boolean' ? o.abschleppwagen : alt };
    }

    /** Anzahl Wagen je Art für die Optionen (einzeln an = 1 Wagen; alte Stufen wenig 1+1 / viel 2+2 bleiben für opt.stufe lesbar). */
    static anzahlen(opt) {
      const c = cfg(), o = opt || {};
      const geist = o.geister === true ? c.geister.anzahl : 0;
      if (Verkehr._einzeln(o)) return { geist, kranken: o.krankenwagen === true ? 1 : 0, abschlepp: o.abschleppwagen === true ? 1 : 0 };
      const st = c.stufen[o.stufe] || c.stufen.aus;
      return { geist, kranken: st.krankenwagen || 0, abschlepp: st.abschleppwagen || 0 };
    }

    /** Auto-Daten (Katalog bzw. Sonderbau) für Art/Nummer. */
    static autoDaten(art, k, seed) {
      const c = cfg(), kat = R.carCatalog || [];
      if (art === 'krankenwagen') return kat.find((a) => a.id === c.krankenwagen.autoId) || kat.find((a) => a.id === 'multivan') || kat[0];
      if (art === 'abschleppwagen') return LKW_AUTO;
      // Geisterfahrer: Modell + Fremdfarbe deterministisch (Mischung nach Seed, jedes Modell/jede Farbe höchstens einmal)
      const rnd = mulberry32(hashText('geisterauto|' + seed));
      const modelle = GEISTER_MODELLE.filter((id) => kat.find((a) => a.id === id)), farben = GEISTER_FARBEN.slice();
      for (let i = modelle.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); const t = modelle[i]; modelle[i] = modelle[j]; modelle[j] = t; }
      for (let i = farben.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); const t = farben[i]; farben[i] = farben[j]; farben[j] = t; }
      const auto = kat.find((a) => a.id === modelle[k % modelle.length]);
      return Object.assign({}, auto, { optionen: Object.assign({}, auto.optionen || {}, { farbe: farben[k % farben.length] }) });
    }

    /**
     * Wagen anlegen (alle geparkt). opt = { geister: bool, krankenwagen: bool, abschleppwagen: bool } (v28; alt: stufe: 'aus'|'wenig'|'viel').
     * @returns {number[]} Fahrzeug-Indizes
     */
    einsetzen(strecke, teilnehmerAnzahl, opt) {
      const sp = this.spiel, c = this.c, o = opt || {};
      this.strecke = strecke; this.n = teilnehmerAnzahl; this.opt = o;
      this.seed = [strecke.id || strecke.name || 'strecke', strecke.variante || '', strecke.welt || '', teilnehmerAnzahl].join('|');
      const anz = Verkehr.anzahlen(o);
      const L = strecke.spline.laenge;
      this.zonen = sperrzonen(strecke);
      this.frei = freieAbschnitte(this.zonen, L, c.geister.routeMinNot);
      this.routen = anz.geist ? geisterRouten(strecke, this.seed) : [];
      const rndAst = mulberry32(hashText('ast|' + this.seed));
      const neu = (art, k, auto, route) => {
        const f = sp.fahrzeugHinzufuegen(auto, 100000 + this.eintraege.length * 60, 100000, 0);
        f.polizei = true; f.istSpieler = false; f.spielerNr = -1; f.vehicle.verkehrWagen = true;
        f.fahrhilfe = 'aus'; f.index = -1; f.stehZeit = 0; f.resetHinweis = false; f.falschHerum = false; f.falschZeit = 0;
        const e = { art, k, f, idx: -1, aktiv: false, route: route || null, lenk: 0, pause: 0, ast: 0, frac: 0, richtung: art === 'geisterfahrer' ? -1 : 1,
          tempo: 0, steckt: 0, abseits: 0, wechsel: null, anzahlAuftritte: 0, gesehen: {}, hupe: 0, lichtHupe: false, nahe: 1e9, nummer: this.eintraege.length };
        f.verkehr = e;
        e.idx = sp.fahrzeuge.indexOf(f);
        this.eintraege.push(e); this.idx.push(e.idx);
        this._parken(e);
        this._optikVorbereiten(e);
        return e;
      };
      for (let k = 0; k < anz.geist; k++) {
        const route = this.routen[k] || null;
        const e = neu('geisterfahrer', k, Verkehr.autoDaten('geisterfahrer', k, this.seed), route);
        e.ast = route ? astFuer(strecke, route.a, route.b, rndAst() < 0.5) : 0;
        e.tempo = c.geister.tempo + (mulberry32(hashText('gt|' + this.seed + k))() - 0.5) * 2 * c.geister.tempoSchwankung;
        e.rand = 2.0; e.laenge = e.f.vehicle.daten.laenge; e.leer = !route;
      }
      for (let k = 0; k < anz.kranken; k++) {
        const e = neu('krankenwagen', k, Verkehr.autoDaten('krankenwagen', k, this.seed));
        e.tempo = c.krankenwagen.tempo; e.rand = 2.2; e.pause = 3 + k * 5 + mulberry32(hashText('kp|' + this.seed + k))() * 4;
      }
      for (let k = 0; k < anz.abschlepp; k++) {
        const e = neu('abschleppwagen', k, Verkehr.autoDaten('abschleppwagen', k, this.seed));
        e.tempo = c.abschleppwagen.tempo; e.rand = 2.7; e.pause = 6 + k * 6 + mulberry32(hashText('ap|' + this.seed + k))() * 4;
      }
      this.rnd = mulberry32(hashText('lauf|' + this.seed));
      this.rennListe = sp.fahrzeuge.slice(0, this.n);
      return this.idx.slice();
    }

    // ---------- Parken / Erscheinen ----------
    _parken(e) {
      const f = e.f, sp = this.spiel;
      f.vehicle.setzen(100000 + e.nummer * 60, 100000, 0);
      f.vehicle.y = -100;
      f.ausgeschieden = true; f.bremst = false; f.nah = null; f.index = -1;
      if (f.mesh) f.mesh.visible = false;
      if (f.looping && (f.looping.aktiv || f.looping.fallen)) { f.looping.aktiv = false; f.looping.fallen = false; f.vehicle.imLooping = false; }
      if (f.flug && R.Schanzen) R.Schanzen.abbrechen(f.flug, f.vehicle);
      if (sp._vorherAngleichen) sp._vorherAngleichen(f);
      f.netReset = (f.netReset || 0) + 1;
      e.aktiv = false; e.lichtHupe = false; e.hupe = 0;
      const A = R.Audio;
      if (A && A.motorUpdate && e.idx >= 0) { try { A.motorUpdate(e.idx, { tempo: 0, vMax: 30, gas: 0, untergrund: 'strasse', abstand: 1e9, dt: 0.016 }); } catch (err) { /* egal */ } }
      this._lichtAus(e);
    }

    /** Wagen e erscheint bei Bogenlänge s in Fahrtrichtung dir auf Querlage frac. */
    _erscheinen(e, s, frac, tempo0) {
      const st = this.strecke, f = e.f, v = f.vehicle, sp = this.spiel;
      const pt = lagePunkt(st, s, frac, e.ast, e.rand, this._pt || (this._pt = {}));
      const heading = e.richtung > 0 ? R.headingAus(pt.tx, pt.tz) : R.headingAus(-pt.tx, -pt.tz);
      v.setzen(pt.x, pt.z, heading);
      v.vLaengs = tempo0;
      v.y = st.hoeheAn(pt.x, pt.z);
      f.ausgeschieden = false; f.bremst = false; f.stehZeit = 0;
      if (f.mesh) f.mesh.visible = true;
      f.index = st.spline.indexBei(s);
      f.nah = st.abfrage(pt.x, pt.z, f.index); f.index = f.nah.index;
      if (sp._vorherAngleichen) sp._vorherAngleichen(f);
      f.netReset = (f.netReset || 0) + 1;
      e.aktiv = true; e.halt = false; e.lenk = 0; e.steckt = 0; e.abseits = 0; e.wechsel = null; e.alter = 0; e.hupe = 0; e.nahe = 1e9; e.naechsterWechsel = Infinity;
      e.frac = frac; e.fracZiel = frac; e.sStart = s;
      this.statistik.auftritte++;
      if (e.art === 'geisterfahrer') this.statistik.geister++; else if (e.art === 'krankenwagen') this.statistik.kranken++; else this.statistik.abschlepp++;
    }

    _verschwinden(e) {
      this.statistik.verschwunden++;
      this._parken(e);
      const c = this.c;
      e.pause = c.wiederkehr[0] + this.rnd() * (c.wiederkehr[1] - c.wiederkehr[0]);
    }

    // ---------- Teilnehmerdaten ----------
    _teilnehmer() {
      const sp = this.spiel, fz = sp.fahrzeuge, r = sp.rennen, tn = r ? r.teilnehmer : [], L = this.strecke.spline.laenge;
      const l = this._tn; l.length = this.n;
      for (let i = 0; i < this.n; i++) {
        const f = fz[i], t = tn[i];
        let o = l[i]; if (!o) o = l[i] = {};
        o.x = f.vehicle.x; o.z = f.vehicle.z; o.s = f.nah ? f.nah.s : f.ausgeschieden ? 0 : this.strecke.spline.naechster(o.x, o.z, f.index >= 0 ? f.index : undefined).s;
        o.prog = t ? t.fortschritt : 0; o.mensch = !!f.istSpieler; o.fertig = !!(t && t.imZiel) || !!f.ausgeschieden; o.v = f.vehicle.vLaengs; o.nr = i;
      }
      void L;
      return l;
    }

    /** Darf hier unsichtbar ein Wagen erscheinen? Menschen/Kameras ≥ freiAbstand, Computerfahrer und andere Verkehrswagen ≥ 70 m entfernt. */
    _spawnFrei(x, z) {
      const fz = this.spiel.fahrzeuge, kams = this.spiel.kameras || [], fa = this.c.freiAbstand;
      for (let i = 0; i < this.n; i++) {
        const v = fz[i].vehicle, d = Math.hypot(v.x - x, v.z - z);
        if (d < (fz[i].istSpieler ? fa : 70)) return false;
      }
      if (this.spiel.zustand !== 'menue') for (let j = 0; j < kams.length; j++) { const p = kams[j].kamera && kams[j].kamera.position; if (p && Math.hypot(p.x - x, p.z - z) < fa) return false; }
      for (const e of this.eintraege) if (e.aktiv && Math.hypot(e.f.vehicle.x - x, e.f.vehicle.z - z) < 70) return false;
      return true;
    }

    /** v28 (W2): Abstand zum nächsten Teilnehmer, der noch im Rennen ist (Mensch oder Computer). */
    _teilnehmerAbstand(x, z, tn) {
      let d = 1e9;
      for (let i = 0; i < tn.length; i++) { if (tn[i].fertig) continue; const q = Math.hypot(tn[i].x - x, tn[i].z - z); if (q < d) d = q; }
      return d;
    }

    /** Abstand zur nächsten Spieler-KAMERA (Mensch); ohne Kameras: nächster menschlicher Teilnehmer. */
    _kameraAbstand(x, z) {
      const kams = this.spiel.kameras || [], zustand = this.spiel.zustand;
      let d = 1e9;
      if (zustand !== 'menue') for (let j = 0; j < kams.length; j++) { const p = kams[j].kamera && kams[j].kamera.position; if (p) d = Math.min(d, Math.hypot(p.x - x, p.z - z)); }
      return d;
    }

    // ---------- Logik je Physikschritt ----------
    schritt(dt, laeuft) {
      if (this.nurAnzeige || !laeuft || !this.eintraege.length) return;
      this.zeit += dt;
      const tn = this._teilnehmer();
      for (const e of this.eintraege) {
        if (e.aktiv) this._aktiv(e, dt, tn); else this._inaktiv(e, dt, tn);
      }
    }

    _menschen(tn) {
      const m = [];
      for (let i = 0; i < tn.length; i++) if (tn[i].mensch && !tn[i].fertig) m.push(tn[i]);
      if (m.length) return m;
      // kein Mensch mehr im Rennen (oder nur Computer): die Spitze zählt
      let best = null;
      for (let i = 0; i < tn.length; i++) if (!tn[i].fertig && (!best || tn[i].prog > best.prog)) best = tn[i];
      return best ? [best] : [];
    }

    /** v28 (W3): ist Geisterfahrer k in Runde `runde` dabei? (Auswahl je Runde zwischengespeichert) */
    _geisterDabei(k, runde) {
      const c = this._geisterPlan || (this._geisterPlan = {});
      let a = c[runde];
      if (!a) a = c[runde] = Verkehr.geisterAuswahl(this.routen, this.seed, runde, this.strecke.spline.laenge);
      return a.indexOf(k) >= 0;
    }

    _inaktiv(e, dt, tn) {
      const c = this.c, L = this.strecke.spline.laenge;
      if (e.art === 'geisterfahrer') {
        if (!e.route) return;
        const { a, b } = e.route, G = c.geister, laufRunden = this.spiel.rennen ? this.spiel.rennen.runden : 99;
        const menschen = this._menschen(tn);
        let ausloeser = null, key0 = 0;
        for (const h of menschen) {
          const sH = ((h.s % L) + L) % L;
          let d = a - sH; if (d < -L / 2) d += L; if (d > L / 2) d -= L;
          if (d < 40 || d > G.ausloeser) continue;
          const key = Math.floor((h.prog + d) / L);
          if (key < 0 || key >= laufRunden) continue;
          if (!this._geisterDabei(e.k, key)) continue;                                  // v28 (W3): in dieser Runde nicht besetzt
          if (e.gesehen[h.nr] === key) continue;
          ausloeser = h; key0 = key; break;
        }
        if (!ausloeser) return;
        // am oberen Ende der Route erscheinen (weit von allen Autos und Kameras)
        const pt = lagePunkt(this.strecke, b, 0, e.ast, e.rand, this._pt || (this._pt = {}));
        if (!this._spawnFrei(pt.x, pt.z)) return;
        if (this._anderesGeisterNah(e, b)) return;                                      // v28 (W3): nie zwei Geisterfahrer gleichzeitig näher als mindestAbstand
        // alle Teilnehmer, die diesen Auftritt „gehabt“ haben (noch vor oder auf der Route), merken
        for (const h of tn) {
          const sH = ((h.s % L) + L) % L;
          let d = a - sH; if (d < -L / 2) d += L; if (d > L / 2) d -= L;
          if (d <= G.ausloeser && d > -(b - a)) e.gesehen[h.nr] = Math.floor((h.prog + d) / L);
        }
        e.anzahlAuftritte++;
        const rnd = mulberry32(hashText('gw|' + this.seed + '|' + e.k + '|' + e.anzahlAuftritte));
        e.frac = (rnd() < 0.5 ? -1 : 1) * G.spurAnteil;
        if (e.ast) e.frac = e.ast * Math.abs(e.frac);
        e.wechselChance = rnd() < G.wechselChance;
        e.wechselDist = G.spurWechselAb + rnd() * (G.spurWechselBis - G.spurWechselAb);
        this._erscheinen(e, b, e.frac, e.tempo * 0.85);
        e.naechsterWechsel = b - 30;         // frühestens hier der erste Spurwechsel
        void key0;
        return;
      }
      // Krankenwagen / Abschleppwagen: Pause, dann unsichtbar weit vor einem Spieler erscheinen
      e.pause -= dt;
      if (e.pause > 0) return;
      const menschen = this._menschen(tn);
      if (!menschen.length) { e.pause = 2; return; }
      const h = menschen[(this._rr++) % menschen.length];
      const rnd = this.rnd;
      for (let versuch = 0; versuch < 5; versuch++) {
        let s0 = h.s + c.spawnVorAnderen + rnd() * 70 + versuch * 45;
        s0 = ((s0 % L) + L) % L;
        // freien Abschnitt suchen, der s0 enthält und noch ≥ 200 m Fahrstrecke bietet, sonst Anfang des nächsten
        let wahl = null;
        for (const f of this.frei) if (s0 >= f[0] && s0 <= f[1] - 200) { wahl = { s: s0, ende: f[1] }; break; }
        if (!wahl) for (const f of this.frei) if (f[0] > s0 && f[1] - f[0] >= 220) { wahl = { s: f[0] + 20, ende: f[1] }; break; }
        if (!wahl) { const f = this.frei.find((q) => q[1] - q[0] >= 220); if (f) wahl = { s: f[0] + 20, ende: f[1] }; }
        if (!wahl) { e.pause = 5; return; }
        const pt = lagePunkt(this.strecke, wahl.s, 0, 0, 0, this._pt || (this._pt = {}));
        if (!this._spawnFrei(pt.x, pt.z)) continue;
        e.route = { a: wahl.s, b: wahl.ende };
        e.ast = astFuer(this.strecke, wahl.s, wahl.ende, rnd() < 0.5);
        const qC = e.art === 'krankenwagen' ? c.krankenwagen.spurQ : c.abschleppwagen.spurQ;
        e.anzahlAuftritte++;
        this._erscheinen(e, wahl.s, e.ast ? e.ast * Math.max(0.2, qC) : qC, e.tempo * 0.8);
        return;
      }
      e.pause = 1.5;
    }

    /** v28 (W3): fährt schon ein anderer Geisterfahrer näher als G.mindestAbstand m (Strecke) bei s? */
    _anderesGeisterNah(e, s) {
      const L = this.strecke.spline.laenge, M = this.c.geister.mindestAbstand;
      for (const q of this.eintraege) {
        if (q === e || !q.aktiv || q.art !== 'geisterfahrer' || !q.f.nah) continue;
        let d = Math.abs(q.f.nah.s - s) % L; if (d > L / 2) d = L - d;
        if (d < M) return true;
      }
      return false;
    }

    _aktiv(e, dt, tn) {
      const c = this.c, f = e.f, v = f.vehicle, st = this.strecke, L = st.spline.laenge, n = f.nah;
      e.alter += dt;
      if (!n) return;
      // v28 (W2): Teilnehmer-Abstand. Festgefahren / abseits NUR bei echtem Stillstand (< 1 m/s) und ohne Teilnehmer ≤ 15 m (sonst Rempler/Überholen);
      // wegnehmen NUR, wenn kein Teilnehmer und keine Kamera ≤ 120 m entfernt ist (nie unter den Augen eines Fahrers).
      const dTn = this._teilnehmerAbstand(v.x, v.z, tn), dSicht = Math.min(dTn, this._kameraAbstand(v.x, v.z));
      const soll = e.sollTempo === undefined ? e.tempo : e.sollTempo;
      if (Math.abs(v.vLaengs) < 1.0 && soll > 3 && e.alter > 2 && dTn > c.steckNah) e.steckt += dt; else e.steckt = 0;
      const halb = (st.breiteBei ? st.breiteBei(n.s) : st.breite) / 2;
      if (Math.abs(n.seitenabstand) > halb + (st.randBreite || 3) + 1 && dTn > c.steckNah) e.abseits += dt; else e.abseits = 0;
      if ((e.steckt > c.steckenZeit || e.abseits > c.abseitsZeit) && dSicht > c.sichtFrei) {
        this.statistik.haengen++;
        if (dTn > 14) this.statistik.haengenAlleine++;       // festgefahren OHNE Teilnehmer in der Nähe = Fehler der Steuerung (kein Rempler)
        this._verschwinden(e); return;
      }
      const kamD = this._kameraAbstand(v.x, v.z);
      if (e.art === 'geisterfahrer') {
        const a = e.route.a;
        // am Ende der Route (unten) verschwinden – nicht vor den Augen eines Spielers
        if (n.s <= a - c.nachlauf && kamD > 30) { this._verschwinden(e); return; }
        if (n.s <= a - c.sichtNachlauf) { this._verschwinden(e); return; }
        if (n.s > e.route.b + 60 || n.s < a - 120) { this._verschwinden(e); return; }       // falsch gelandet (Reset o. ä.)
        this._geisterLogik(e, dt, tn);
      } else {
        const ende = e.route.b;
        // Ende des freien Abschnitts erreicht → verschwinden (nicht vor den Augen); oder alle Teilnehmer weit voraus
        // v28 (W2): am Routenende nur wegnehmen, wenn kein Teilnehmer/keine Kamera ≤ 120 m (sonst weiterrollen bis 40 m hinter das Ende, dann anhalten)
        const sicht = dSicht > c.sichtFrei;
        e.halt = n.s >= ende + c.endeAuslauf;
        if (e.halt) e.frac += klemme((e.frac >= 0 ? 0.85 : -0.85) - e.frac, -0.5 * dt, 0.5 * dt);      // wartet am Rand, nicht mitten auf der Fahrbahn
        if (n.s >= ende - c.nachlauf && kamD > 40 && sicht) { this._verschwinden(e); return; }
        if (n.s >= ende + 10 && sicht) { this._verschwinden(e); return; }
        if (e.alter > 4) {
          let alleVoraus = true;
          for (let i = 0; i < tn.length; i++) {
            if (tn[i].fertig) continue;
            let d = n.s - ((tn[i].s % L) + L) % L; if (d < -L / 2) d += L; if (d > L / 2) d -= L;
            if (d > -c.hintenWeg) { alleVoraus = false; break; }
          }
          if (alleVoraus && kamD > c.hintenWeg && dSicht > c.sichtFrei) { this._verschwinden(e); return; }
        }
      }
    }

    /** Geisterfahrer: Spurwechsel, Hupe/Lichthupe-Zustand. */
    _geisterLogik(e, dt, tn) {
      const c = this.c, G = c.geister, st = this.strecke, L = st.spline.laenge, n = e.f.nah, v = e.f.vehicle;
      // nächster Teilnehmer in Fahrtrichtung des Geisterfahrers (also tiefer s), der noch auf ihn zukommt
      let nahe = 1e9, nahH = null;
      for (let i = 0; i < tn.length; i++) {
        if (tn[i].fertig) continue;
        let d = n.s - ((tn[i].s % L) + L) % L; if (d < -L / 2) d += L; if (d > L / 2) d -= L;     // d > 0: Teilnehmer liegt (in s) hinter dem Geisterfahrer = vor ihm in seiner Fahrtrichtung
        if (d < -4) continue;                                                                       // schon vorbei
        if (d < nahe) { nahe = d; nahH = tn[i]; }
      }
      e.nahe = nahe;
      // Spurwechsel: weicher Wechsel der Querlage über wechselLaenge m, frühestens wechselAbstand m nach dem letzten
      if (e.wechsel) {
        const u = (e.wechsel.s0 - n.s) / G.wechselLaenge;
        e.frac = e.wechsel.von + (e.wechsel.nach - e.wechsel.von) * glatt(u);
        if (u >= 1) { e.frac = e.wechsel.nach; e.wechsel = null; e.naechsterWechsel = n.s - G.wechselAbstand; }
      } else if (e.wechselChance !== false && nahH && nahe >= G.spurWechselAb * 0.6 && nahe <= e.wechselDist && n.s <= e.naechsterWechsel &&
        !(st.gabelNah && st.gabelNah(n.s, 70)) && !gesperrt(this.zonen, n.s - G.wechselLaenge, 30)) {
        e.wechsel = { s0: n.s - 5, von: e.frac, nach: -e.frac };
        e.wechselChance = e.anzahlAuftritte % 2 === 0 ? true : e.wechselChance;       // jeder zweite Auftritt wechselt noch einmal
      }
      // Lichthupe + Hupe, solange ein Teilnehmer in hupeAbstand auf ihn zufährt
      e.lichtHupe = nahe < G.hupeAbstand;
      if (e.lichtHupe) { e.hupe -= dt; if (e.hupe <= 0) { e.hupe = 1.6; e.hupeJetzt = true; } } else e.hupe = 0;
      void v;
    }

    // ---------- Steuerung (Physikschritt) ----------
    steuerung(i, dt) {
      const e = this.spiel.fahrzeuge[i] && this.spiel.fahrzeuge[i].verkehr;
      const halt = { gas: 0, bremse: 0, lenkung: 0 };
      if (!e || !e.aktiv) return halt;
      const f = e.f, v = f.vehicle, st = this.strecke, n = f.nah, c = this.c;
      if (!n) return halt;
      const dir = e.richtung, tempo = v.vLaengs;
      const vorausblick = klemme(0.9 * Math.abs(tempo), c.vorausblickMin, c.vorausblickMax);
      const sZiel = n.s + dir * vorausblick;
      const pz = lagePunkt(st, sZiel, e.frac, e.ast, e.rand, this._pz || (this._pz = {}));
      // der Spurwechsel wirkt am Zielpunkt etwas früher als am Wagen: Querlage am Zielpunkt aus dem Wechsel
      let frac = e.frac;
      if (e.wechsel) { const u = (e.wechsel.s0 - sZiel) / c.geister.wechselLaenge; frac = e.wechsel.von + (e.wechsel.nach - e.wechsel.von) * glatt(u); }
      const pz2 = frac === e.frac ? pz : lagePunkt(st, sZiel, frac, e.ast, e.rand, this._pz2 || (this._pz2 = {}));
      const lenkung = lenkungZu(v, pz2.x, pz2.z, tempo, e, dt);
      // Zieltempo: gewünschtes Tempo, in Kurven nach der Ideallinie begrenzt
      let soll = e.tempo;
      if (st.tempoBei) soll = Math.min(soll, Math.max(7, st.tempoBei(sZiel) * 0.7));
      // Krankenwagen/Abschleppwagen bremsen vor langsameren Autos vor ihnen (kein Auffahren); Geisterfahrer nicht (sie weichen nicht aus)
      if (e.art !== 'geisterfahrer') soll = Math.min(soll, this._folgeTempo(e, v, soll));
      if (e.halt) soll = 0;                  // v28 (W2): Routenende erreicht, Teilnehmer noch in Sicht → anhalten statt vor ihren Augen zu verschwinden
      e.sollTempo = soll;
      const s = tempoSteuerung(soll, tempo);
      f.bremst = s.bremse > 0 && tempo > 0.5;
      return { gas: s.gas, bremse: s.bremse, lenkung };
    }

    /** Folgetempo: nächstes Fahrzeug direkt vor mir (längs ≤ 10 + 1,3·v, quer < 2,4 m) bestimmt das Tempo. */
    _folgeTempo(e, v, soll) {
      const fz = this.spiel.fahrzeuge, r = v.richtung(), q = v.rechts(), bl = 10 + 1.3 * Math.abs(v.vLaengs);
      let best = soll;
      for (let j = 0; j < fz.length; j++) {
        const g = fz[j];
        if (g === e.f || g.ausgeschieden) continue;
        const w = g.vehicle, dx = w.x - v.x, dz = w.z - v.z;
        if (dx * dx + dz * dz > (bl + 12) * (bl + 12)) continue;
        const vor = dx * r.x + dz * r.z, quer = dx * q.x + dz * q.z;
        const luecke = vor - (v.daten.laenge + w.daten.laenge) / 2;
        if (vor <= 0 || luecke > bl || Math.abs(quer) > (v.daten.breite + w.daten.breite) / 2 + 0.6) continue;
        const wv = w.vLaengs * (r.x * (-Math.sin(w.heading)) + r.z * (-Math.cos(w.heading)));        // Tempo des anderen in meiner Richtung
        if (wv >= v.vLaengs - 0.5) continue;
        best = Math.min(best, luecke < 3 ? 0 : Math.max(0, wv + (luecke - 3) * 0.6));
      }
      return best;
    }

    // ---------- KI / Schaden / HUD ----------
    /** Aktive Verkehrswagen an die Liste anhängen (die KI liest nur .vehicle). */
    anhaengen(liste) {
      for (let k = 0; k < this.eintraege.length; k++) {
        const e = this.eintraege[k];
        if (!e.aktiv) continue;
        const f = e.f;
        liste.push(f._verkehrAndere || (f._verkehrAndere = { vehicle: f.vehicle, istSpieler: false, polizei: true, verkehr: true }));
      }
      return liste;
    }
    andereFuer(liste) {
      // liste = Teilnehmer (+ Streifenwagen) – wird NICHT verändert, ein eigenes Feld mit den aktiven Verkehrswagen angehängt
      const a = this._andere; a.length = 0;
      for (let i = 0; i < liste.length; i++) a.push(liste[i]);
      return this.anhaengen(a);
    }

    /** Faktor für den Schaden eines Auto-Stoßes { a, b } (Indizes in spiel.fahrzeuge): 3 bei Krankenwagen, sonst 1. */
    schadenFaktor(stoss) {
      const fz = this.spiel.fahrzeuge;
      const ka = fz[stoss.a] && fz[stoss.a].verkehr, kb = fz[stoss.b] && fz[stoss.b].verkehr;
      if ((ka && ka.art === 'krankenwagen') || (kb && kb.art === 'krankenwagen')) return this.c.krankenwagen.schadenFaktor;
      return 1;
    }

    /** HUD-Warnung für Teilnehmer i: Geisterfahrer ≤ warnAbstand voraus (in s) und noch nicht vorbei. */
    warnung(i) {
      if (i >= this.n) return null;
      const f = this.spiel.fahrzeuge[i], G = this.c.geister;
      if (!G.warnung) return null;                       // v28 (W3): keine HUD-Vorwarnung (config verkehr.geister.warnung)
      if (!f || !f.nah) return null;
      const L = this.strecke.spline.laenge;
      let best = null;
      for (const e of this.eintraege) {
        if (!e.aktiv || e.art !== 'geisterfahrer') continue;
        const g = e.f, w = g.nah || (g.nah = this.strecke.spline.naechster(g.vehicle.x, g.vehicle.z));
        let d = w.s - f.nah.s; if (d < -L / 2) d += L; if (d > L / 2) d -= L;
        if (d < -3 || d > G.warnAbstand) continue;
        if (!best || d < best.abstand) best = { text: '⚠️ Geisterfahrer voraus!', abstand: Math.round(d), art: 'geisterfahrer' };
      }
      if (best && best.abstand !== undefined) this.statistik.warnungen++;
      return best;
    }

    minimapPunkte() {
      const l = this._mm; l.length = 0;
      for (const e of this.eintraege) if (e.aktiv) l.push({ vehicle: e.f.vehicle, art: e.art });
      l.blink = this.c.geister.warnung ? this._phase === 1 : false;       // v28 (W3): Minimap-Blinken nur mit Warnung
      return l;
    }

    // ---------- Netz (Server → Client) ----------
    /**
     * zustand.vk: je Verkehrswagen ein Eintrag im Format von `a` (14 Zahlen: x, z, y, richtung, tempo, lenkung, flags, nicken, neigung, 0, 0, 0, 0, resetZähler);
     * flags: 1 bremst · 2 aktiv · 4 Lichthupe. Geparkte Wagen: Nullen (flags 0).
     */
    zustandKodieren() {
      const rd = (R.Netz && R.Netz.rund) || ((x, n) => { const m = Math.pow(10, n); return Math.round(x * m) / m; });
      return this.eintraege.map((e) => {
        const f = e.f, v = f.vehicle;
        if (!e.aktiv) return [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, f.netReset || 0];
        return [rd(v.x, 3), rd(v.z, 3), rd(v.y, 3), rd(v.heading, 4), rd(v.vLaengs, 2), rd(v.lenkung, 3), 2 | (f.bremst ? 1 : 0) | (e.lichtHupe ? 4 : 0),
          rd(v.nicken, 3), rd(v.neigung, 3), 0, 0, 0, 0, f.netReset || 0];
      });
    }
    /** Client: Flags der Wagen aus einem Zustand (Liste vk, hier die zuletzt angezeigte Interpolation). */
    zustandAnwenden(a0, a1) {
      for (let k = 0; k < this.eintraege.length; k++) {
        const e = this.eintraege[k], z = a1 && a1[k];
        if (!z) continue;
        const aktiv = !!(z[6] & 2);
        if (aktiv !== e.aktiv) {
          e.aktiv = aktiv; e.f.ausgeschieden = !aktiv;
          if (e.f.mesh) e.f.mesh.visible = aktiv;
          if (!aktiv) this._lichtAus(e);
        }
        e.f.bremst = !!(z[6] & 1);
        e.lichtHupe = !!(z[6] & 4);
        void a0;
      }
    }

    // ---------- Optik ----------
    _optikVorbereiten(e) {
      if (typeof THREE === 'undefined' || !e.f.mesh) return;
      const c = this.c, mesh = e.f.mesh;
      if (e.art === 'geisterfahrer' && R.carBuilder.setzeLicht) R.carBuilder.setzeLicht(mesh, true);
      if (e.art === 'krankenwagen') {
        const bl = mesh.userData && mesh.userData.blaulicht;
        if (bl && bl.length >= 2) bl.forEach((m) => { if (m.material && !m.userData.verkehrKopie) { m.material = m.material.clone(); m.userData.verkehrKopie = true; this._eigen.push(m.material); } });
        const h = (e.f.auto && e.f.auto.abmessungen && e.f.auto.abmessungen.hoehe) || 2.1;
        // v26c: kein eigenes PointLight je Krankenwagen (Lichtzahl muss nach dem Rennstart konstant bleiben); nur die Lage merken, das Licht kommt aus dem Licht-Pool
        e.blauLokal = [[-0.45, h + 0.35, 0.6], [0.45, h + 0.35, 0.6]];
      }
      void c;
    }

    _lichtAus(e) {
      void e;      // v26c: das Blaulicht-Licht gehört dem Licht-Pool (er schaltet über die Intensität), hier nichts mehr zu tun
    }

    /** Blaulicht (blau/blau abwechselnd), Rundumleuchte (orange abwechselnd), Lichthupe (Fahrlicht blinkt); das PointLight dazu kommt aus dem Licht-Pool (v26c). */
    animieren(zeit) {
      if (typeof THREE === 'undefined' || !this.eintraege.length) return;
      const c = this.c, phase = Math.floor(zeit * c.blinkHz * 2) % 2, hupPhase = Math.floor(zeit * 4) % 2;
      for (const e of this.eintraege) {
        const f = e.f, mesh = f.mesh;
        if (!mesh) continue;
        if (!e.aktiv) { if (mesh.visible) mesh.visible = false; continue; }
        if (!mesh.visible) mesh.visible = true;
        if (e.art === 'krankenwagen') {
          if (phase !== e._phase) { e._phase = phase; R.carBuilder.setzeBlaulicht(mesh, phase ? 1 : 2); }
        } else if (e.art === 'abschleppwagen') {
          const r = mesh.userData.rundum;
          if (r && r.length >= 2 && phase !== e._phase) { e._phase = phase; r[0].color.setHex(phase ? 0xffa21a : 0x5a3200); r[1].color.setHex(phase ? 0x5a3200 : 0xffa21a); }
        } else if (R.carBuilder.setzeLicht) {
          const an = !e.lichtHupe || hupPhase === 0;
          if (an !== e._licht) { e._licht = an; R.carBuilder.setzeLicht(mesh, an); }
        }
      }
      this._farben[0] = phase ? 0x2a5cff : 0x9fb8ff; this._farben[1] = phase ? 0x9fb8ff : 0x2a5cff;
      this._phase = phase;
    }

    /**
     * v26c: Blaulicht-Quellen für den Licht-Pool (src/world/lichtPool.js): aktive Krankenwagen mit Mesh, Lage der zwei Lichter, Farben, Stärke, Reichweite, Abstand.
     * @param {Array} out wird nur gefüllt (nicht geleert)
     */
    blaulichtQuellen(out) {
      for (const e of this.eintraege) {
        if (e.art !== 'krankenwagen' || !e.aktiv || !e.blauLokal || !e.f.mesh) continue;
        out.push({ f: e.f, mesh: e.f.mesh, lokal: e.blauLokal, farben: this._farben, staerke: 26, reichweite: 13, abstand: this.c.lichtAbstand });
      }
    }

    /** v26c: gibt es Krankenwagen (= Blaulicht-Quellen für den Pool)? */
    hatBlaulicht() { return this.eintraege.some((e) => e.art === 'krankenwagen' && !!e.blauLokal); }

    /** v26c: leer – die Lichtzahl ändert sich im Rennen nicht mehr (Main._vorwaermen übersetzt alles mit der endgültigen Lichtlage). */
    vorkompilieren() { }

    // ---------- Ton ----------
    /** Sirene des nächsten aktiven Krankenwagens (Lautstärke nach Abstand zum nächsten Spieler), Hupe der Geisterfahrer. */
    ton(stumm) {
      const A = R.Audio;
      if (!A || !this.eintraege.length) return;
      const sp = this.spiel, r = sp.rennen, fz = sp.fahrzeuge, c = this.c;
      if (stumm || !r || !r.gasErlaubt) { this._sirene(false, 0); return; }
      let laut = 0;
      const sprecher = [];
      for (const e of this.eintraege) {
        if (!e.aktiv) continue;
        let dm = 1e9;
        for (let i = 0; i < this.n; i++) { if (!fz[i].istSpieler) continue; const w = fz[i].vehicle, v = e.f.vehicle; dm = Math.min(dm, Math.hypot(w.x - v.x, w.z - v.z)); }
        if (e.art === 'krankenwagen') laut = Math.max(laut, Math.pow(klemme(1 - dm / c.sireneHoerweite, 0, 1), 1.5));
        else if (e.art === 'geisterfahrer' && e.hupeJetzt) { e.hupeJetzt = false; if (dm < c.hupeHoerweite) sprecher.push(Math.pow(klemme(1 - dm / c.hupeHoerweite, 0, 1), 1.2)); }
      }
      this._sirene(laut > 0.01, laut);
      sprecher.forEach((l) => this._hupe(l));
    }

    /** Zweite Sirene (höher und schneller als die Polizei-Sirene), eigene Oszillatoren; nutzt nur die Hilfsfunktionen von R.Audio. */
    _sirene(an, laut) {
      const A = R.Audio;
      if (!A || !A._ctx || !A._effekte || !A._gain || !A._n) return;
      const ctx = A._ctx, t = ctx.currentTime, s = klemme(laut === undefined ? 1 : +laut, 0, 1);
      let w = this._sireneW;
      try {
        if (!an || !(s > 0)) {
          if (!w) return;
          w.gain.gain.setTargetAtTime(0, t, 0.08);
          w.quellen.forEach((q) => { try { q.stop(t + 0.6); } catch (err) { /* egal */ } });
          this._sireneW = null;
          return;
        }
        if (!w) {
          const o1 = A._n(ctx.createOscillator()), o2 = A._n(ctx.createOscillator()), lfo = A._n(ctx.createOscillator());
          const hub = A._gain(73), g2 = A._gain(0.2), g = A._gain(0);
          o1.type = 'sine'; o2.type = 'triangle';
          o1.frequency.value = 513; o2.frequency.value = 513;
          lfo.type = 'square'; lfo.frequency.value = 1.05;
          lfo.connect(hub); hub.connect(o1.frequency); hub.connect(o2.frequency);
          o1.connect(g); o2.connect(g2); g2.connect(g); g.connect(A._effekte);
          const quellen = [o1, o2, lfo], nodes = [o1, o2, lfo, hub, g2, g];
          quellen.forEach((q) => q.start(t));
          o1.onended = () => { A._aktiv -= nodes.length; nodes.forEach((nd) => { try { nd.disconnect(); } catch (err) { /* egal */ } }); };
          w = this._sireneW = { quellen, gain: g };
        }
        if (w._laut === undefined || Math.abs(w._laut - s) > 0.02) { w._laut = s; w.gain.gain.setTargetAtTime(0.11 * s, t, 0.15); }
      } catch (err) { this._sireneW = null; }
    }

    /** Hupe (zwei kurze Töne) mit Lautstärke laut 0..1. */
    _hupe(laut) {
      const A = R.Audio;
      if (!A || !A._ton || !A._bereit || !A._bereit()) return;
      try {
        A._ton(420, 420, 0.22, 'square', 0.07 * laut, 0); A._ton(520, 520, 0.22, 'square', 0.06 * laut, 0);
        A._ton(420, 420, 0.3, 'square', 0.07 * laut, 0.3); A._ton(520, 520, 0.3, 'square', 0.06 * laut, 0.3);
      } catch (err) { /* egal */ }
    }

    zerstoeren() {
      this._sirene(false, 0);
      this._eigen.forEach((x) => { if (x && x.dispose) x.dispose(); });
      this._lichter = []; this._eigen = [];
      this.eintraege.forEach((e) => { if (e.f) e.f.verkehr = null; });
    }
  }

  Verkehr.sperrzonen = sperrzonen;
  Verkehr.freieAbschnitte = freieAbschnitte;
  Verkehr.geisterRouten = geisterRouten;
  Verkehr.geisterAuswahl = geisterAuswahl;
  Verkehr.lagePunkt = lagePunkt;
  Verkehr.astFuer = astFuer;
  Verkehr.gesperrt = gesperrt;
  Verkehr.lenkungZu = lenkungZu;
  Verkehr.tempoSteuerung = tempoSteuerung;
  Verkehr.LKW_AUTO = LKW_AUTO;
  Verkehr.cfg = cfg;
  R.Verkehr = Verkehr;
})();
