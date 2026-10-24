// ============================================================
// Motorrad-Stunts (Stufe M2) – Strecken-Teil: Stuntplan je Strecke (Schanzen, Feuerring, Bus-Reihe, Wheelie-/Stoppie-Zonen),
// Anpassung des Streckenkatalogs zur Laufzeit (nur MOTORRAD-Modus) und die Grafik dazu.
//
// Docking ohne eine v34-Datei zu ändern – Autorennen.html lädt diese Datei nicht. Beim Laden (vor main.js) wird R.trackCatalog
// (Datenobjekte, die trackBuilder.js / main.js lesen) für den Motorradmodus umgebaut:
//   welten[*].schanzen = true     Schanzen-Schicht in JEDER Welt an (track/schanze.js + track/anlauf.js liefern Rampe, Flug, Landung, Anlauf-Bremse)
//   schanzen                      ersetzt durch den Stuntplan (2–3 je Strecke, auf geraden Stücken mit Auslauf); Zusatzfeld `moto: { ring | reihe }`
//                                 bleibt in strecke.schanzen[i] erhalten (trackBuilder kopiert die Einträge mit Object.assign)
//   motoZonen                     [{ s0, s1, art: 'wheelie' | 'stoppie' }] – varianteAnwenden (XL) skaliert s0/s1 wie bei allen Listen mit
//   weiche Elemente im Umfeld der Schanzen (Öl, Sand, Baustelle, Ast, Wracks, Stroh, Boost, Schilde, Bälle, Fontänen, Dinos, Kleber)
//                                 fehlen in der Laufzeit-Kopie (sonst läge z. B. ein Sandfleck mitten auf der Rampe)
// Reine Funktionen (Node-Tests): radiusBei, sperren, schanzeProbleme, zoneProbleme, katalogAnpassen, stuntDaten, zoneBei.
// Grafik (braucht THREE): bauen(strecke) → Gruppe 'MotoStunts': Feuerring = Torus + 2 Flammenringe (3 Draw-Calls) + Ständer (1),
// Bus-Reihe = 1 Mesh je Reihe, Zonen = 1 Mesh Bodenmarkierung + Schilder (je Schild 1 Mesh, geteilte Geometrie/Textur).
// ============================================================
window.Rennspiel = window.Rennspiel || {};

(function () {
  const R = window.Rennspiel;
  R.Moto = R.Moto || {};

  // ---------- Stuntplan je Strecke (Bogenlänge s in m, Normalmaß; XL skaliert die Lage mit) ----------
  // schanzen: { s, winkel, laenge, moto?: { ring: true } | { reihe: { art: 'bus', n } }, bestand?: true (Schanze aus dem Autokatalog übernommen) }
  //   kleine Schanze 8°/10 m, Standard-Schanze 12°/10 m, Bus-Schanze 12°/16 m (Kante 3,4 m hoch, damit die 2,5 m hohen Busse sicher unterflogen werden)
  // zonen: { s0, s1, art }
  const S8 = { winkel: 8, laenge: 10 }, S12 = { winkel: 12, laenge: 10 }, SB = { winkel: 12, laenge: 16 };
  const PLAN = {
    wiese: { laenge: 3040,
      schanzen: [Object.assign({ s: 75, bestand: true }, S8), Object.assign({ s: 640, moto: { ring: true } }, S12), Object.assign({ s: 2760, moto: { reihe: { art: 'bus', n: 4 } } }, SB)],
      zonen: [{ s0: 110, s1: 170, art: 'stoppie' }, { s0: 1655, s1: 1735, art: 'wheelie' }] },
    wald: { laenge: 2477,
      schanzen: [Object.assign({ s: 65, bestand: true, moto: { ring: true } }, S12), Object.assign({ s: 2082, bestand: true, moto: { reihe: { art: 'bus', n: 3 } } }, SB)],
      zonen: [{ s0: 2255, s1: 2305, art: 'wheelie' }, { s0: 2412, s1: 2465, art: 'stoppie' }] },
    wueste: { laenge: 3331,
      schanzen: [Object.assign({ s: 2030, moto: { ring: true } }, S12), Object.assign({ s: 2850, moto: { reihe: { art: 'bus', n: 5 } } }, SB), Object.assign({ s: 3250 }, S8)],
      zonen: [{ s0: 25, s1: 95, art: 'stoppie' }, { s0: 360, s1: 430, art: 'wheelie' }] },
    fantasie: { laenge: 1420,
      schanzen: [Object.assign({ s: 360, moto: { ring: true } }, S12), Object.assign({ s: 1190, moto: { reihe: { art: 'bus', n: 3 } } }, SB)],
      zonen: [{ s0: 545, s1: 615, art: 'wheelie' }] },
    dino: { laenge: 2753,
      schanzen: [Object.assign({ s: 150, moto: { ring: true } }, S12), Object.assign({ s: 1410, moto: { reihe: { art: 'bus', n: 4 } } }, SB), Object.assign({ s: 2715 }, S8)],
      zonen: [{ s0: 25, s1: 95, art: 'wheelie' }] },
    alpen: { laenge: 2921,
      schanzen: [Object.assign({ s: 65, bestand: true, moto: { ring: true } }, S8), Object.assign({ s: 280 }, S12), Object.assign({ s: 2400, moto: { reihe: { art: 'bus', n: 4 } } }, SB)],
      zonen: [{ s0: 795, s1: 865, art: 'wheelie' }, { s0: 1005, s1: 1075, art: 'stoppie' }] },
    formel1: { laenge: 4408,
      schanzen: [Object.assign({ s: 250 }, S8), Object.assign({ s: 850, moto: { ring: true } }, S12), Object.assign({ s: 1900, moto: { reihe: { art: 'bus', n: 5 } } }, SB), Object.assign({ s: 3300 }, S8)],
      zonen: [{ s0: 1730, s1: 1800, art: 'wheelie' }, { s0: 2200, s1: 2270, art: 'stoppie' }] },
  };

  /** Radius (m) der Strecke bei s (aus der Richtungsänderung über ±5 m); 1e9 = gerade. */
  function radiusBei(sp, s) {
    const a = sp.punktBei(s - 5), b = sp.punktBei(s + 5);
    let d = Math.atan2(b.tx, b.tz) - Math.atan2(a.tx, a.tz);
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;
    return d === 0 ? 1e9 : 10 / Math.abs(d);
  }

  /** Harte Sperrbereiche der Strecke [[s0, s1, Name]] (alles, was sich nicht verschieben lässt). */
  function sperren(strecke) {
    const o = [], add = (a, b, n) => o.push([a, b, n]);
    (strecke.spuren || []).forEach((e) => { if (e.breite < strecke.breite) add(e.s0 - 45, e.s1 + 45, 'enge Stelle'); });
    (strecke.bruecken || []).forEach((e) => add(e.s0 - 20, e.s1 + 20, 'Brücke'));
    (strecke.tunnel || []).forEach((e) => add(e.s0 - 20, e.s1 + 20, 'Tunnel'));
    (strecke.gabelungen || []).forEach((e) => add(e.s0 - 30, e.s1 + 30, 'Gabelung'));
    (strecke.ueberfuehrungen || []).forEach((e) => add(e.s0 - 30, e.s1 + 30, 'Überführung'));
    (strecke.kreuzungen || []).forEach((e) => { add(e.sA - 40, e.sA + 40, 'Kreuzung'); add(e.sB - 40, e.sB + 40, 'Kreuzung'); });
    (strecke.loopings || []).forEach((e) => add(e.s - 170, e.s + 60, 'Looping'));
    return o;
  }

  /**
   * Prüft eine Schanze bei s (laenge = Rampenlänge): Liste von Problemen, leer = geeignet.
   * Anforderungen (aus den vorhandenen Schanzen abgeleitet): Rampe fast gerade (R > 500 m, −3 … laenge+3), Anlauf davor R ≥ 60 m (−35 … −3),
   * Landung R ≥ 150 m (laenge+3 … laenge+70), keine harten Elemente (Brücke, Tunnel, enge Stelle, Gabelung, Kreuzung, Looping) von −40 bis +90 m
   * hinter der Kante, nicht auf der Start-/Ziellinie. opt.bestand = true: Anlauf und Landung dürfen in Kurven liegen (Schanzen, die schon im Autokatalog standen, z. B. Wald).
   */
  function schanzeProbleme(strecke, s, laenge, opt) {
    const o = opt || {}, sp = strecke.spline, L = sp.laenge, lg = laenge || 10, probleme = [];
    for (let d = -35; d <= lg + 70; d += 5) {
      if (o.bestand && (d < -3 || d > lg + 3)) continue;
      const lim = d < -3 ? 60 : (d <= lg + 3 ? 500 : 150);
      if (radiusBei(sp, s + d) < lim) { probleme.push('Kurve bei ' + (d >= 0 ? '+' : '') + d + ' m'); break; }
    }
    const x0 = s - 40, x1 = s + lg + 90;
    sperren(strecke).forEach((b) => { for (const sh of [-L, 0, L]) if (!(b[1] + sh < x0 || b[0] + sh > x1)) { probleme.push(b[2]); break; } });
    const dz = sp.differenzS(0, s);
    if (dz > -5 && dz < lg + 5) probleme.push('Start/Ziel');
    return probleme;
  }

  /** Prüft eine Wheelie-/Stoppie-Zone [s0, s1]: durchgehend gerade oder sanft gebogen (R ≥ 250 m), keine harten Elemente, nicht über die Ziellinie. */
  function zoneProbleme(strecke, s0, s1) {
    const sp = strecke.spline, L = sp.laenge, probleme = [];
    for (let s = s0 - 5; s <= s1 + 5; s += 5) if (radiusBei(sp, s) < 250) { probleme.push('Kurve bei ' + Math.round(s)); break; }
    sperren(strecke).forEach((b) => { for (const sh of [-L, 0, L]) if (!(b[1] + sh < s0 - 5 || b[0] + sh > s1 + 5)) { probleme.push(b[2]); break; } });
    if (s1 > L - 5 || s0 < 15) probleme.push('Start/Ziel');
    return probleme;
  }

  const WEICH = ['hindernisse', 'wracks', 'strohballen', 'boostFelder', 'schilde', 'baelle', 'wasserstrahlen', 'dinos'];
  const UMFELD_VOR = 55, UMFELD_NACH = 115;     // m um jede Schanze (vor der Rampe / nach der Kante)

  /**
   * Katalog für den Motorradmodus umbauen. katalog = R.trackCatalog. Gibt die Liste der angepassten Strecken-ids zurück.
   * Die Datenobjekte werden in dieser Seite verändert (Motorrad.html), Autorennen.html lädt diese Datei nicht.
   */
  function katalogAnpassen(katalog) {
    const erg = [];
    (katalog || []).forEach((k) => {
      const plan = PLAN[k.id];
      if (!plan || k.motoAngepasst) return;
      if (k.welten) Object.keys(k.welten).forEach((w) => { k.welten[w] = Object.assign({}, k.welten[w], { schanzen: true }); });
      k.schanzen = plan.schanzen.map((e) => JSON.parse(JSON.stringify(e)));
      k.motoZonen = (plan.zonen || []).map((e) => Object.assign({}, e));
      const Lk = plan.laenge;
      const nah = (s, a, b) => { let d = s - a; d = ((d % Lk) + Lk) % Lk; if (d > Lk / 2) d -= Lk; return d > -UMFELD_VOR && d < b + UMFELD_NACH; };
      const naheSchanze = (s) => plan.schanzen.some((e) => nah(s, e.s, e.laenge || 10));
      WEICH.forEach((f) => { if (Array.isArray(k[f])) k[f] = k[f].filter((e) => !(typeof e.s === 'number' && naheSchanze(e.s))); });
      if (Array.isArray(k.kleber)) k.kleber = k.kleber.filter((e) => !(naheSchanze(e.s0) || naheSchanze(e.s1)));
      k.motoAngepasst = true;
      erg.push(k.id);
    });
    if (megaAnpassen(katalog)) erg.push('mega');
    return erg;
  }

  // Zusätzliche Stunt-Elemente nur für die Megastrecke (Bogenlänge der Mega-Runde, ~8,05 km): Gerade im Dino-/Fantasie-Teil, Wüsten-Anfang, Zielgerade.
  // Die übernommenen Quell-Schanzen reichen dort nicht (nur 3 auf 8 km, keine Bus-Reihe) – Lage mit schanzeProbleme/zoneProbleme geprüft (tests/test_moto_stunts.js).
  const MEGA_EXTRA = {
    schanzen: [Object.assign({ s: 2150, moto: { reihe: { art: 'bus', n: 4 } } }, SB), Object.assign({ s: 2450, moto: { ring: true } }, S12),
      Object.assign({ s: 3700 }, S8), Object.assign({ s: 7500, moto: { reihe: { art: 'bus', n: 3 } } }, SB)],
    zonen: [{ s0: 2705, s1: 2775, art: 'wheelie' }],
  };

  /**
   * Megastrecke (src/track/megastrecke.js, Autorennen-Modul): setzt sich aus Stücken der Quellstrecken zusammen und hat ihre Schanzenliste beim Laden
   * aus den noch unveränderten Katalogen übernommen. Darum wird der Eintrag nach der Anpassung der Quellen neu gebaut (R.Mega.eintragBauen, dieselben
   * Layout-Daten) und danach der Stuntplan der Quellen auf die Mega-Bogenlänge umgerechnet – mit kleinerem Rand als dort (Anlauf ≥ 45 m, Landung ≥ 95 m).
   */
  function megaAnpassen(katalog) {
    const M = R.Mega;
    if (!M || typeof M.eintragBauen !== 'function' || !M.LAYOUT || typeof M._quelle !== 'function') return false;
    const i = katalog.findIndex((t) => t.id === 'mega');
    if (i < 0 || katalog[i].motoAngepasst) return false;
    const neu = M.eintragBauen(M.LAYOUT);
    const wrap = (s, L) => ((s % L) + L) % L;
    const schanzen = [], zonen = [];
    (M.info.abschnitte || []).forEach((ab) => {
      const plan = PLAN[ab.id], q = M._quelle(ab.id);
      if (!plan || !q) return;
      const L = q.L, len = wrap(ab.quelleS1 - ab.quelleS0, L);
      plan.schanzen.forEach((e) => {
        const ds = wrap(e.s - ab.quelleS0, L);
        if (ds < 45 || ds + (e.laenge || 10) + 95 > len) return;
        const n = JSON.parse(JSON.stringify(e)); delete n.bestand; n.s = Math.round((ab.megaS0 + ds) * 10) / 10;
        schanzen.push(n);
      });
      (plan.zonen || []).forEach((z) => {
        const d0 = wrap(z.s0 - ab.quelleS0, L), d1 = d0 + (z.s1 - z.s0);
        if (d0 < 30 || d1 + 10 > len) return;
        zonen.push({ s0: Math.round((ab.megaS0 + d0) * 10) / 10, s1: Math.round((ab.megaS0 + d1) * 10) / 10, art: z.art });
      });
    });
    MEGA_EXTRA.schanzen.forEach((e) => schanzen.push(JSON.parse(JSON.stringify(e))));
    MEGA_EXTRA.zonen.forEach((z) => zonen.push(Object.assign({}, z)));
    schanzen.sort((a, b) => a.s - b.s);
    zonen.sort((a, b) => a.s0 - b.s0);
    if (neu.welten) Object.keys(neu.welten).forEach((w) => { neu.welten[w] = Object.assign({}, neu.welten[w], { schanzen: true }); });
    neu.schanzen = schanzen; neu.motoZonen = zonen; neu.motoAngepasst = true;
    // weiche Hindernisse im Umfeld der neuen Schanzen entfernen (die Quellen haben das nur für ihre eigenen Schanzen getan)
    const L = M.info.laenge || 1e9;
    const nah = (s) => schanzen.some((e) => { let d = s - e.s; d = ((d % L) + L) % L; if (d > L / 2) d -= L; return d > -UMFELD_VOR && d < (e.laenge || 10) + UMFELD_NACH; });
    WEICH.forEach((f) => { if (Array.isArray(neu[f])) neu[f] = neu[f].filter((e) => !(typeof e.s === 'number' && nah(e.s))); });
    if (Array.isArray(neu.kleber)) neu.kleber = neu.kleber.filter((e) => !(nah(e.s0) || nah(e.s1)));
    katalog[i] = neu;
    return true;
  }

  // ---------- Daten der Stunt-Elemente einer Strecke (ohne THREE) ----------
  /**
   * Lage von Feuerringen, Bus-Reihen und Zonen einer Strecke. Ergebnis zwischengespeichert an strecke._motoDaten.
   *   ringe[]  { nr, x, y, z, tx, tz, nx, nz, radius, innen, boden }       (y absolut, Ringmitte = Fahrermitte der Referenzbahn)
   *   reihen[] { nr, n, art, x, z, tx, tz, nx, nz, a0, a1, halb, hoehe, sK, breite }   (x/z = Kante der Schanze, a = Abstand dahinter)
   *   zonen[]  { art, s0, s1 }
   */
  function stuntDaten(strecke) {
    if (strecke._motoDaten) return strecke._motoDaten;
    const cfg = R.config.motoStunts, sp = strecke.spline, ringe = [], reihen = [], zonen = [];
    const liste = R.Schanzen ? R.Schanzen.liste(strecke) : [];
    const vyMax = (R.config.stunt && R.config.stunt.schanze && R.config.stunt.schanze.vyMax) || 5;
    (strecke.schanzen || []).forEach((e, i) => {
      const S = liste[i];
      if (!S || !e.moto) return;
      const sK = S.s + S.laenge, pK = sp.punktBei(sK), yK = strecke.hoeheAn(pK.x, pK.z) + S.hoehe;
      if (e.moto.ring) {
        const d = cfg.ring.abstand, pr = sp.punktBei(sK + d);
        ringe.push({ nr: i, x: pr.x, z: pr.z, y: R.Moto.stunts.ringHoehe(yK, S.winkel, d, cfg.ring.auslegung, cfg, vyMax) + cfg.ring.fahrerHoehe,
          tx: pr.tx, tz: pr.tz, nx: pr.nx, nz: pr.nz, radius: cfg.ring.radius, innen: cfg.ring.innen, boden: strecke.hoeheAn(pr.x, pr.z), sK, yKante: yK });
      }
      if (e.moto.reihe) {
        const breite = (strecke.breiteBei ? strecke.breiteBei(sK) : strecke.breite) - 0.6;       // Busse 0,3 m schmaler als der Asphalt je Seite: liegen sicher auf der Fahrbahn, auch wenn sie dahinter leicht in eine Kurve geht
        const L = R.Moto.stunts.reiheLage(e.moto.reihe, breite, cfg);
        reihen.push(Object.assign({ nr: i, x: pK.x, z: pK.z, tx: pK.tx, tz: pK.tz, nx: pK.nx, nz: pK.nz, sK, breite, yKante: yK }, L));
      }
    });
    ((strecke.daten && strecke.daten.motoZonen) || []).forEach((z) => {
      zonen.push({ art: z.art, s0: sp.wrapS(z.s0), s1: sp.wrapS(z.s1) });
    });
    strecke._motoDaten = { ringe, reihen, zonen };
    return strecke._motoDaten;
  }

  /** Liegt Bogenlänge s in einer Zone? Rückgabe die Zone oder null. */
  function zoneBei(strecke, s) {
    const z = stuntDaten(strecke).zonen, sp = strecke.spline;
    for (let i = 0; i < z.length; i++) { const a = sp.differenzS(s, z[i].s0), l = sp.differenzS(z[i].s1, z[i].s0); if (a >= 0 && a <= l) return z[i]; }
    return null;
  }

  // ============================================================
  // Grafik (nur mit THREE)
  // ============================================================
  const ZEIT = { t: 0 };
  let W = null;       // THREE-Werkzeug, erst bei Bedarf
  function werkzeug() {
    if (W) return W;
    W = { m: new THREE.Matrix4(), q: new THREE.Quaternion(), s: new THREE.Vector3(), p: new THREE.Vector3(), e: new THREE.Euler(), c: new THREE.Color() };
    return W;
  }
  /** Matrix aus Position, Drehung (YXZ: ry, rx, rz) und Skalierung. */
  function mat(px, py, pz, ry, sx, sy, sz, rx, rz) {
    const w = werkzeug();
    w.e.set(rx || 0, ry || 0, rz || 0, 'YXZ'); w.q.setFromEuler(w.e); w.p.set(px, py, pz); w.s.set(sx, sy, sz);
    return new THREE.Matrix4().compose(w.p, w.q, w.s);
  }
  const headingY = (tx, tz) => Math.atan2(tx, tz);   // Drehung um y, so dass lokales +z entlang (tx, tz) zeigt

  /** Kleiner Geometrie-Sammler: Boxen/Kegel/Flächen mit Matrix + Vertex-Farbe → eine nicht indizierte BufferGeometry. */
  function sammler() {
    const P = [], N = [], C = [], c = new THREE.Color();
    return {
      add(geo, m4, hex) {
        const g = geo.index ? geo.toNonIndexed() : geo.clone();
        g.applyMatrix4(m4);
        const p = g.attributes.position.array, n = g.attributes.normal.array;
        c.set(hex);
        for (let i = 0; i < p.length; i++) { P.push(p[i]); N.push(n[i]); }
        for (let i = 0; i < p.length / 3; i++) C.push(c.r, c.g, c.b);
        g.dispose();
      },
      geo() {
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
        g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
        g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
        return g;
      },
    };
  }

  /** Feuerring: Torus + 2 Flammenringe (Kegel nach außen) + Ständer. */
  function ringBauen(r, gruppe) {
    const rc = r.radius - 0.25, rg = new THREE.Group();
    rg.position.set(r.x, r.y, r.z);
    rg.rotation.y = headingY(r.tx, r.tz);                  // Lochachse (lokal z) entlang der Strecke
    const torus = new THREE.Mesh(new THREE.TorusGeometry(rc, 0.25, 8, 36), new THREE.MeshBasicMaterial({ color: 0xff5a10 }));
    rg.add(torus);
    const flammen = (n, hMin, hMax, versatz, hex, opa) => {
      const s = sammler(), kegel = new THREE.ConeGeometry(0.2, 1, 5);
      for (let i = 0; i < n; i++) {
        const w = versatz + i / n * Math.PI * 2, h = hMin + (hMax - hMin) * (0.5 + 0.5 * Math.sin(i * 2.3 + versatz * 5));
        s.add(kegel, mat(Math.cos(w) * (rc + 0.15 + h / 2), Math.sin(w) * (rc + 0.15 + h / 2), 0, 0, 1, h, 1, 0, w - Math.PI / 2), hex);
      }
      kegel.dispose();
      const m = new THREE.Mesh(s.geo(), new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: opa, side: THREE.DoubleSide, depthWrite: false }));
      m.frustumCulled = false;
      return m;
    };
    const fa = flammen(18, 0.7, 1.5, 0, 0xff7a00, 0.92), fb = flammen(14, 0.45, 1.0, 0.2, 0xffd23a, 0.95);
    rg.add(fa); rg.add(fb);
    const anim = (t) => {
      fa.rotation.z = t * 1.2; fb.rotation.z = -t * 0.8;
      const a = 1 + 0.07 * Math.sin(t * 9), b = 1 + 0.09 * Math.sin(t * 13 + 1);
      fa.scale.set(a, a, 1); fb.scale.set(b, b, 1);
      torus.material.color.setHex(Math.sin(t * 7) > 0 ? 0xff5a10 : 0xff7a22);
    };
    gruppe.add(rg);
    gruppe.userData.anim.push(anim);
    // Ständer links/rechts (bis zum Boden)
    const st = sammler(), box = new THREE.BoxGeometry(1, 1, 1), ry = headingY(r.tx, r.tz);
    [-1, 1].forEach((sg) => {
      const px = r.x + r.nx * sg * (r.radius + 0.55), pz = r.z + r.nz * sg * (r.radius + 0.55), g0 = strecke0(r), h = Math.max(1, r.y - g0);
      st.add(box, mat(px, g0 + h / 2, pz, ry, 0.35, h, 0.35), 0x55565e);
      st.add(box, mat(px, r.y, pz, ry, 0.7, 0.3, 0.7), 0xff8a1a);
    });
    box.dispose();
    gruppe.add(new THREE.Mesh(st.geo(), new THREE.MeshLambertMaterial({ vertexColors: true })));
  }
  const strecke0 = (r) => r.boden;

  const BUSFARBEN = [0xf2c200, 0xd8362b, 0x2f6fd6, 0xf4f4f4, 0x2fa84f];
  /** Bus-Reihe: n Gelenkbusse quer zur Fahrtrichtung, nebeneinander (1 Mesh). */
  function reiheBauen(L, strecke, gruppe) {
    const cfg = R.config.motoStunts.reihe, s = sammler(), ry = headingY(L.tx, L.tz);
    const box = new THREE.BoxGeometry(1, 1, 1), laenge = L.halb * 2, tiefe = cfg.tiefeJe - 0.4;
    for (let i = 0; i < L.n; i++) {
      const a = L.a0 + (i + 0.5) * cfg.tiefeJe, cx = L.x + L.tx * a, cz = L.z + L.tz * a, g0 = strecke.hoeheAn(cx, cz);
      const farbe = BUSFARBEN[(i + (L.nr || 0)) % BUSFARBEN.length], h = L.hoehe;
      const teil = (px, py, pz, sx, sy, sz, hex) => s.add(box, mat(cx + L.nx * px + L.tx * pz, g0 + py, cz + L.nz * px + L.tz * pz, ry, sx, sy, sz), hex);
      teil(0, 0.2 + (h - 0.2) / 2, 0, laenge, h - 0.2, tiefe, farbe);                   // Karosserie
      teil(0, h - 0.05, 0, laenge - 0.2, 0.12, tiefe - 0.2, 0xdedede);                  // Dach
      [-1, 1].forEach((sg) => {
        const fz = sg * (tiefe / 2 + 0.01);
        teil(0, 1.45, fz, laenge - 1.2, 0.7, 0.04, 0x16222e);                           // Fensterband (zur Anfahrt und zur Gegenseite)
        teil(0, 0.8, fz, laenge - 0.6, 0.12, 0.04, 0xffffff);                           // Zierstreifen
      });
      teil(0, 0.12, 0, laenge - 0.4, 0.3, tiefe - 0.2, 0x1b1b1f);                       // Unterboden/Räder (dunkel)
      teil(0, 0.2 + (h - 0.2) / 2, 0, 0.12, h - 0.2, tiefe + 0.02, 0x2b2b30);           // Gelenk in der Mitte
    }
    box.dispose();
    const m = new THREE.Mesh(s.geo(), new THREE.MeshLambertMaterial({ vertexColors: true }));
    m.name = 'BusReihe';
    gruppe.add(m);
  }

  function schildTextur(text, hex) {
    const c = document.createElement('canvas'); c.width = 256; c.height = 128;
    const g = c.getContext('2d');
    g.fillStyle = hex; g.fillRect(0, 0, 256, 128);
    g.strokeStyle = '#fff'; g.lineWidth = 8; g.strokeRect(6, 6, 244, 116);
    g.fillStyle = '#fff'; g.font = 'bold 50px Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(text, 128, 66);
    return new THREE.CanvasTexture(c);
  }

  /** Zonen: Bodenmarkierung (Randbalken, Pfeile) in einem Mesh + Schilder an beiden Seiten am Anfang. */
  function zonenBauen(zonen, strecke, gruppe) {
    if (!zonen.length) return;
    const sp = strecke.spline, s = sammler(), quad = new THREE.PlaneGeometry(1, 1), box = new THREE.BoxGeometry(1, 1, 1);
    const farbe = { wheelie: [0xffb000, 0xffffff, 0xff7a00, '#ff7a00', 'WHEELIE'], stoppie: [0x2f8bff, 0xffffff, 0x1c5fd0, '#1c5fd0', 'STOPPIE'] };
    const texturen = {}, schilder = [];
    zonen.forEach((z) => {
      const f = farbe[z.art] || farbe.wheelie, len = sp.differenzS(z.s1, z.s0);
      const flach = (sa, br, ln, hex) => {      // Rechteck auf der Fahrbahn bei Bogenlänge sa (Mitte), Breite br quer, Länge ln längs
        const p = sp.punktBei(sa), y = strecke.hoeheAn(p.x, p.z) + 0.07;
        s.add(quad, mat(p.x, y, p.z, headingY(p.tx, p.tz), br, ln, 1, -Math.PI / 2), hex);
      };
      const halb = Math.min(strecke.breite, 12) * 0.5 - 1.0;
      [0, len].forEach((a, i) => { const sa = z.s0 + a + (i ? -0.8 : 0.8); flach(sa, halb * 2, 1.4, f[0]); flach(sa, halb * 2, 0.35, f[1]); });   // Start-/Endbalken
      for (let a = 8; a < len - 6; a += 10) {                                                                                                         // Pfeile (Winkel) in der Mitte
        [-1, 1].forEach((sg) => {
          const p = sp.punktBei(z.s0 + a), y = strecke.hoeheAn(p.x, p.z) + 0.07, ry = headingY(p.tx, p.tz) + sg * 0.6;
          s.add(quad, mat(p.x - p.nx * sg * 0.55, y, p.z - p.nz * sg * 0.55, ry, 0.5, 2.2, 1, -Math.PI / 2), f[2]);
        });
      }
      if (!texturen[z.art]) texturen[z.art] = schildTextur(f[4], f[3]);
      [-1, 1].forEach((sg) => {
        const p = sp.punktBei(z.s0 - 6), q = (strecke.breite / 2 + 1.6) * sg, x = p.x + p.nx * q, zz = p.z + p.nz * q, g0 = strecke.hoeheAn(x, zz);
        s.add(box, mat(x, g0 + 1.5, zz, headingY(p.tx, p.tz), 0.15, 3, 0.15), 0x55565e);
        schilder.push({ x, z: zz, y: g0 + 3.2, ry: headingY(p.tx, p.tz) + Math.PI, art: z.art });
      });
    });
    quad.dispose(); box.dispose();
    const mesh = new THREE.Mesh(s.geo(), new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }));
    mesh.name = 'ZonenMarken';
    gruppe.add(mesh);
    const geo = new THREE.PlaneGeometry(3.2, 1.6), mats = {};
    schilder.forEach((sc) => {
      const mm = mats[sc.art] || (mats[sc.art] = new THREE.MeshBasicMaterial({ map: texturen[sc.art], side: THREE.DoubleSide }));
      const m = new THREE.Mesh(geo, mm);
      m.position.set(sc.x, sc.y, sc.z); m.rotation.y = sc.ry;
      gruppe.add(m);
    });
  }

  /** Alle Stunt-Elemente einer Strecke als Gruppe 'MotoStunts' (leer, wenn nichts da ist). */
  function bauen(strecke) {
    const gruppe = new THREE.Group();
    gruppe.name = 'MotoStunts';
    gruppe.userData.anim = [];
    const d = stuntDaten(strecke);
    d.ringe.forEach((r) => ringBauen(r, gruppe));
    d.reihen.forEach((L) => reiheBauen(L, strecke, gruppe));
    zonenBauen(d.zonen, strecke, gruppe);
    return gruppe;
  }
  /** Flammen animieren (je Bild). */
  function animieren(gruppe, dt) {
    if (!gruppe || !gruppe.userData || !gruppe.userData.anim) return;
    ZEIT.t += dt || 0;
    gruppe.userData.anim.forEach((f) => f(ZEIT.t));
  }

  R.Moto.stuntWelt = { PLAN, radiusBei, sperren, schanzeProbleme, zoneProbleme, katalogAnpassen, stuntDaten, zoneBei, bauen, animieren, WEICH, UMFELD_VOR, UMFELD_NACH };

  if (window.MOTORRAD === true && R.trackCatalog) katalogAnpassen(R.trackCatalog);
})();
