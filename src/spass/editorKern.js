// ============================================================
// Spaß-Paket S7 – Strecken-Editor, RECHENTEIL (Autorennen UND Motorrad; läuft im Browser, in Tests und im Server; kein DOM, kein Three.js, kein Math.random).
//   R.Editor.verarbeiten(roh)        gemalte Linie (Meter) → glatte, geschlossene Runde: { ok, pkt, laenge, kreuzungen, hinweise } oder { ok:false, text, ort }
//   R.Editor.neu(pkt, name, welt)    Projekt-Daten { v, name, welt, pkt, hoehen, el }
//   R.Editor.stelle(d, art, s)       Element-Platzierung prüfen/verschieben: { ok, s, verschoben, grund }
//   R.Editor.setzen / entfernen / hoeheSetzen        Elemente und Hügel in die Projekt-Daten
//   R.Editor.eintrag(d)              Katalog-Eintrag (Format wie trackCatalog.js / trackWelten.js, id 'eigen-…')
//   R.Editor.registrieren(d)         Eintrag in R.trackCatalog (ersetzt gleiche id) · R.Editor.aufraeumen() entfernt alle
//   R.Editor.fahrtest(eintrag)       KI-Testrunde (Vehicle + Ideallinie, ohne Bild): { ok, probleme:[{ s, text }], zeit }
//   R.Editor.pruefen(d)              Server-Prüfung fremder Daten (Größe, Werte klemmen, Kurven, Elemente) → bereinigte Daten oder null
//   R.Editor.Speicher                Speichern/Laden (localStorage je Spiel, bis 20) · R.Editor.code(d) / R.Editor.ausCode(text) = Teilen
// Elemente (el: [{ a, s, … }], s = Bogenlänge der fertigen Strecke in m):
//   schanze (Rampe 12°) · ring (Schanze + Feuerring, nur Motorrad) · looping · trampolin · kanone · tor (Paar: A bei s, B 130 m weiter) · gold (Reihe aus 5) · magnet (Röhre) · schlucht
//   Schanze/Looping/Gold stehen im Katalog-Eintrag (schanzen/loopings/eigeneMuenzen); Trampolin/Kanone/Tor/Magnet/Schlucht setzt der Haken in R.Spass.plan
//   (die automatische Platzierung der Spaß-Elemente wird für eigene Strecken durch die Wahl des Kindes ersetzt).
// Höhe: Hügel { s, h } → huegel im Katalog (Höhenmodell „gelände“). Kreuzt sich die Linie selbst, wird die obere Fahrbahn eine Überführung
//   (Höhenmodell „strasse“, wie Alpen): die Höhen kommen dann aus dem Profil entlang der Strecke.
// Alles nur für Strecken mit id 'eigen-…': ohne eigene Strecke läuft hier nichts (bestehende Strecken bitgleich).
// ============================================================
(function () {
  const R = window.Rennspiel;
  if (!R || !R.trackCatalog || !R.Spline) return;
  if (R.Editor) return;

  // ---------------------------------------------------------------- Grenzen
  const K = {
    welt: 1600,              // Zeichenfläche: Quadrat, ±800 m
    abstand: 12,             // Abstand der Kontrollpunkte (m)
    sigma: 38,               // Glättung (m)
    minLaenge: 900, maxLaenge: 6000,
    minRadius: 36,           // engste Kurve (m); die engsten Katalog-Strecken haben ≈ 25 m
    minAbstand: 48,          // Mindestabstand zweier getrennter Streckenstücke (Mitte–Mitte, m)
    minAbstandBogen: 110,    // „getrennt“ = mehr als so viele Meter Strecke dazwischen
    maxKreuzungen: 2, minKreuzWinkel: 35,
    maxLuecke: 420,          // so weit darf das Ende der gemalten Linie vom Anfang entfernt sein
    geradeHalb: 60, geradeUebergang: 200,    // Start/Ziel: ±60 m ganz gerade, dann 200 m weicher Übergang
    maxStrecken: 20, maxElemente: 24, maxHuegel: 12, hoeheMin: -4, hoeheMax: 8,
    bruecke: { hub: 8.6, halb: 150, fenster: 55, abstandStart: 330, abstandKreuz: 420 },
    nameLaenge: 24,
    codePraefix: 'STRECKE1.',
  };
  const WELTEN = [
    { id: 'wiese', basis: 'wiese', name: 'Wiese', emoji: '🌳' },
    { id: 'wald', basis: 'wald', name: 'Wald', emoji: '🌲' },
    { id: 'wueste', basis: 'wueste', name: 'Wüste', emoji: '🏜️' },
    { id: 'fantasie', basis: 'fantasie', name: 'Zauberland', emoji: '🍄' },
    { id: 'dino', basis: 'dino', name: 'Dino-Land', emoji: '🦖' },
    { id: 'mond', basis: 'mond', name: 'Mond', emoji: '🌙' },
    { id: 'regenbogenland', basis: 'regenbogenland', name: 'Regenbogenland', emoji: '🌈' },
    { id: 'unterwasser', basis: 'unterwasser', name: 'Unterwasser', emoji: '🐋' },
  ];
  const ARTEN = ['schanze', 'ring', 'looping', 'trampolin', 'kanone', 'tor', 'gold', 'magnet', 'schlucht'];
  const ARTEN_INFO = {
    schanze: { emoji: '🛫', name: 'Schanze' }, ring: { emoji: '🔥', name: 'Feuerring', moto: true }, looping: { emoji: '🎢', name: 'Looping' },
    trampolin: { emoji: '🤸', name: 'Trampolin' }, kanone: { emoji: '💥', name: 'Kanone' }, tor: { emoji: '🌀', name: 'Teleport-Tore' },
    gold: { emoji: '🪙', name: 'Goldstücke' }, magnet: { emoji: '🧲', name: 'Magnet-Röhre' }, schlucht: { emoji: '🪂', name: 'Schlucht' },
  };
  const MAXJE = { schanze: 4, ring: 2, looping: 3, trampolin: 3, kanone: 2, tor: 2, gold: 8, magnet: 2, schlucht: 2 };

  const klemme = (x, a, b) => (x < a ? a : x > b ? b : x);
  const glatt = (u) => { u = klemme(u, 0, 1); return u * u * (3 - 2 * u); };
  const rund = (x, n) => { const f = Math.pow(10, n === undefined ? 1 : n); return Math.round(x * f) / f; };
  const zahl = (x, std) => (typeof x === 'number' && isFinite(x) ? x : std);
  const mod = (a, n) => ((a % n) + n) % n;

  // ---------------------------------------------------------------- Linien-Rechnung (geschlossenes Vieleck [[x, z], …])
  function umfang(P) { let l = 0; for (let i = 0; i < P.length; i++) { const a = P[i], b = P[(i + 1) % P.length]; l += Math.hypot(b[0] - a[0], b[1] - a[1]); } return l; }
  /** Geschlossenes Vieleck in n gleich lange Stücke neu abtasten (n fehlt: ≈ d). */
  function neuAbtasten(P, d, n) {
    const m = P.length, cum = [0];
    for (let i = 0; i < m; i++) { const a = P[i], b = P[(i + 1) % m]; cum.push(cum[i] + Math.hypot(b[0] - a[0], b[1] - a[1])); }
    const L = cum[m];
    n = n || Math.max(8, Math.round(L / d));
    const out = [];
    let j = 0;
    for (let k = 0; k < n; k++) {
      const t = k * L / n;
      while (j < m - 1 && cum[j + 1] < t) j++;
      const a = P[j], b = P[(j + 1) % m], len = cum[j + 1] - cum[j], u = len > 1e-9 ? (t - cum[j]) / len : 0;
      out.push([a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u]);
    }
    return out;
  }
  function glaettenGauss(P, sigma) {
    const n = P.length, d = umfang(P) / n, m = Math.max(1, Math.ceil(3 * sigma / d)), w = [];
    let sw = 0;
    for (let k = -m; k <= m; k++) { const x = Math.exp(-(k * d) * (k * d) / (2 * sigma * sigma)); w.push(x); sw += x; }
    return P.map((_, i) => {
      let x = 0, z = 0;
      for (let k = -m; k <= m; k++) { const q = P[mod(i + k, n)], g = w[k + m]; x += q[0] * g; z += q[1] * g; }
      return [x / sw, z / sw];
    });
  }
  function mitteSchwer(P) { let x = 0, z = 0; P.forEach((p) => { x += p[0]; z += p[1]; }); return [x / P.length, z / P.length]; }
  /** Auf Umfang L0 zurückskalieren (um den Schwerpunkt), damit das Glätten/Entschärfen die Strecke nicht schrumpft. */
  function umfangHalten(P, L0) {
    const c = mitteSchwer(P), f = L0 / umfang(P);
    return P.map((p) => [c[0] + (p[0] - c[0]) * f, c[1] + (p[1] - c[1]) * f]);
  }
  /** Krümmung 1/R an Punkt i (Umkreis durch i−1, i, i+1; Betrag). */
  function kruemmung(P, i) {
    const n = P.length, a = P[mod(i - 1, n)], b = P[i], c = P[(i + 1) % n];
    const ux = b[0] - a[0], uz = b[1] - a[1], vx = c[0] - b[0], vz = c[1] - b[1];
    const la = Math.hypot(ux, uz), lb = Math.hypot(vx, vz), lc = Math.hypot(c[0] - a[0], c[1] - a[1]);
    if (la * lb * lc < 1e-9) return 0;
    return Math.abs(2 * (ux * vz - uz * vx) / (la * lb * lc));
  }
  function kruemmungMax(P) { let m = 0, im = 0; for (let i = 0; i < P.length; i++) { const k = kruemmung(P, i); if (k > m) { m = k; im = i; } } return { k: m, i: im }; }

  function schnitt(a, b, c, d) {
    const rx = b[0] - a[0], rz = b[1] - a[1], sx = d[0] - c[0], sz = d[1] - c[1], den = rx * sz - rz * sx;
    if (Math.abs(den) < 1e-9) return null;
    const t = ((c[0] - a[0]) * sz - (c[1] - a[1]) * sx) / den, u = ((c[0] - a[0]) * rz - (c[1] - a[1]) * rx) / den;
    if (t < 0 || t >= 1 || u < 0 || u >= 1) return null;
    return { t, u, x: a[0] + rx * t, z: a[1] + rz * t, winkel: Math.acos(klemme(Math.abs(rx * sx + rz * sz) / (Math.hypot(rx, rz) * Math.hypot(sx, sz)), 0, 1)) * 180 / Math.PI };
  }
  /** Selbstüberschneidungen: [{ i, j, x, z, winkel }] (Segmentindizes, i < j; nahe Treffer zusammengefasst). */
  function kreuzungenFinden(P) {
    const n = P.length, erg = [];
    for (let i = 0; i < n; i++) {
      const a = P[i], b = P[(i + 1) % n];
      for (let j = i + 2; j < n; j++) {
        if (i === 0 && j === n - 1) continue;
        const c = P[j], d = P[(j + 1) % n];
        if (Math.max(a[0], b[0]) < Math.min(c[0], d[0]) || Math.max(c[0], d[0]) < Math.min(a[0], b[0]) || Math.max(a[1], b[1]) < Math.min(c[1], d[1]) || Math.max(c[1], d[1]) < Math.min(a[1], b[1])) continue;
        const h = schnitt(a, b, c, d);
        if (!h) continue;
        const alt = erg.find((e) => Math.abs(e.i - i) <= 2 && Math.abs(e.j - j) <= 2);
        if (alt) continue;
        erg.push({ i, j, x: h.x, z: h.z, winkel: h.winkel });
      }
    }
    return erg;
  }
  /** Zu nahe Stücke: [{ a, b, d }] (Punktindizes, nicht Teil einer Kreuzung). */
  function zuNah(P, D, kreuz) {
    const n = P.length, d0 = umfang(P) / n, minB = Math.ceil(K.minAbstandBogen / d0), E = Math.ceil(60 / d0), erg = [];
    const ausnahme = (a, b) => kreuz.some((k) => (Math.abs(mod(a - k.i + n / 2, n) - n / 2) <= E && Math.abs(mod(b - k.j + n / 2, n) - n / 2) <= E) || (Math.abs(mod(b - k.i + n / 2, n) - n / 2) <= E && Math.abs(mod(a - k.j + n / 2, n) - n / 2) <= E));
    for (let a = 0; a < n; a++) for (let b = a + minB; b < n; b++) {
      if (n - (b - a) < minB) continue;
      const dx = P[a][0] - P[b][0], dz = P[a][1] - P[b][1];
      if (dx * dx + dz * dz >= D * D) continue;
      if (ausnahme(a, b)) continue;
      erg.push({ a, b, d: Math.hypot(dx, dz) });
    }
    return erg;
  }

  /**
   * Enge Kurven entschärfen und zu nahe Stücke auseinanderschieben (Schritt für Schritt, Umfang bleibt).
   * fix[i] = true: Punkt bleibt stehen (gerades Stück). abtasten = false: Indizes bleiben (für fix).
   */
  function entspannen(P, rMin, opt) {
    opt = opt || {};
    const n0 = P.length, L0 = umfang(P), kreuz = kreuzungenFinden(P), fix = opt.fix || null;
    let n = n0, schritte = 0;
    for (let it = 0; it < (opt.max || 500); it++) {
      n = P.length;
      const kr = new Float32Array(n);
      let schlecht = 0;
      for (let i = 0; i < n; i++) { kr[i] = kruemmung(P, i); if (kr[i] > 1 / (rMin * 1.03)) schlecht++; }
      const nah = opt.ohneAbstand ? [] : zuNah(P, K.minAbstand, kreuz);
      if (!schlecht && !nah.length) break;
      schritte++;
      const neu = P.map((p) => [p[0], p[1]]);
      // Entschärfen: lokal zum Mittelpunkt der Nachbarn ziehen, je enger desto stärker, auf ±2 Nachbarn verteilt
      if (schlecht) {
        for (let i = 0; i < n; i++) {
          if (fix && fix[i]) continue;
          let w = 0;
          for (let k = -2; k <= 2; k++) { const x = clamp01((kr[mod(i + k, n)] * rMin - 0.85) * 3) * (k === 0 ? 1 : k * k === 1 ? 0.7 : 0.4); if (x > w) w = x; }
          if (w <= 0) continue;
          const a = P[mod(i - 1, n)], b = P[(i + 1) % n];
          neu[i][0] += (((a[0] + b[0]) / 2) - P[i][0]) * 0.5 * w;
          neu[i][1] += (((a[1] + b[1]) / 2) - P[i][1]) * 0.5 * w;
        }
      }
      // Auseinanderschieben: Paare, die zu nah sind, bewegen sich voneinander weg (samt Nachbarn)
      for (const p of nah) {
        const dx = P[p.a][0] - P[p.b][0], dz = P[p.a][1] - P[p.b][1], d = Math.max(1e-6, p.d), push = (K.minAbstand - d) * 0.3;
        for (let k = -2; k <= 2; k++) {
          const f = k === 0 ? 1 : k * k === 1 ? 0.6 : 0.25, ia = mod(p.a + k, n), ib = mod(p.b + k, n);
          if (!(fix && fix[ia])) { neu[ia][0] += dx / d * push * f; neu[ia][1] += dz / d * push * f; }
          if (!(fix && fix[ib])) { neu[ib][0] -= dx / d * push * f; neu[ib][1] -= dz / d * push * f; }
        }
      }
      P = neu;
      if (!opt.festeIndizes) {
        P = umfangHalten(P, L0);
        if (it % 4 === 3) P = neuAbtasten(P, K.abstand, n0);
      } else P = umfangHalten(P, L0);
    }
    return { P, schritte };
  }
  function clamp01(x) { return x < 0 ? 0 : x > 1 ? 1 : x; }

  /** Geradestes Stück suchen (±K.geradeHalb gerade, dazu weicher Übergang), begradigen, Start in die Mitte legen, Strecke so drehen, dass sie bei (0,0) nach −z startet. */
  function startGerade(P, kreuz) {
    const n = P.length, d = umfang(P) / n, m1 = Math.round(K.geradeHalb / d), m2 = Math.round((K.geradeHalb + K.geradeUebergang) / d), kr = P.map((_, i) => kruemmung(P, i));
    let best = null;
    for (let c = 0; c < n; c++) {
      let mx = 0;
      for (let k = -m2; k <= m2; k++) mx = Math.max(mx, kr[mod(c + k, n)]);
      const nahK = kreuz.some((q) => Math.min(Math.abs(mod(c - q.i + n / 2, n) - n / 2), Math.abs(mod(c - q.j + n / 2, n) - n / 2)) * d < K.bruecke.abstandStart);
      if (nahK) continue;
      if (!best || mx < best.mx - 1e-9) best = { c, mx };
    }
    if (!best) return null;
    const c = best.c, Q = P.map((p) => [p[0], p[1]]), a = P[mod(c - 1, n)], b = P[(c + 1) % n], tl = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, tx = (b[0] - a[0]) / tl, tz = (b[1] - a[1]) / tl;
    for (let k = -m2; k <= m2; k++) {
      const i = mod(c + k, n), arc = Math.abs(k) * d, w = arc <= K.geradeHalb ? 1 : 1 - glatt((arc - K.geradeHalb) / K.geradeUebergang);
      const lx = P[c][0] + tx * k * d, lz = P[c][1] + tz * k * d;
      Q[i] = [P[i][0] + (lx - P[i][0]) * w, P[i][1] + (lz - P[i][1]) * w];
    }
    const R2 = [], fix = new Array(n).fill(false);
    for (let k = 0; k < n; k++) R2.push(Q[(c + k) % n]);
    for (let k = -m1; k <= m1; k++) fix[mod(k, n)] = true;
    // drehen/verschieben: Start bei (0,0), Fahrtrichtung −z
    const dx = R2[1][0] - R2[n - 1][0], dz = R2[1][1] - R2[n - 1][1], l = Math.hypot(dx, dz) || 1, fr = -dz / l, fi = -dx / l;
    const o = R2[0];
    return { P: R2.map((p) => { const x = p[0] - o[0], z = p[1] - o[1]; return [x * fr - z * fi, x * fi + z * fr]; }), fix, mx: best.mx };
  }

  const FEHLER = {
    leer: 'Ich sehe noch keine Linie. Mal mit dem Finger oder der Maus eine große Runde!',
    kurz: 'Die Linie ist zu kurz für eine Strecke. Mal eine größere Runde!',
    offen: 'Die Linie ist nicht geschlossen. Mal sie bis fast zum Anfang zurück!',
    zuKurz: 'Die Strecke ist noch zu kurz zum Fahren. Mal eine größere Runde!',
    zuLang: 'Das ist eine riesige Strecke! Mal sie etwas kleiner, dann macht sie mehr Spaß.',
    kreuzMehr: 'Hier kreuzt sich die Linie zu oft. Mehr als zwei Brücken schafft die Strecke nicht – mal weniger Schleifen!',
    kreuzFlach: 'Die Linien kreuzen sich zu flach, da passt keine Brücke hin. Kreuze sie lieber quer!',
    kreuzStart: 'Die Kreuzung liegt zu nah an Start und Ziel. Mal die Schleife weiter weg vom Anfang!',
    nah: 'Hier liegen zwei Stücke der Strecke zu dicht nebeneinander, da passen die Autos nicht durch. Mal sie weiter auseinander!',
    eng: 'Diese Kurve ist zu eng zum Fahren. Mal sie etwas weiter!',
    gerade: 'Ich finde keine gerade Stelle für Start und Ziel. Mal ein längeres, gerades Stück!',
  };

  /**
   * Gemalte Linie → fertige Runde. roh = [[x, z], …] in Metern (Zeichenfläche K.welt). Ergebnis:
   *   { ok:true, pkt:[[x, z]…] (Abstand ≈ 12 m, Start bei (0,0), Fahrtrichtung −z), laenge, kreuzungen:[{ i, j, x, z, winkel }], hinweise:[…] }
   *   { ok:false, grund, text, ort:{ x, z }|null }  (freundlicher Hinweis; ort in den Koordinaten der gemalten Linie)
   */
  function verarbeiten(roh, opt) {
    opt = opt || {};
    const hinweise = [], H = K.welt / 2;
    const fehl = (grund, ort) => ({ ok: false, grund, text: FEHLER[grund], ort: ort || null });
    // 1) bereinigen: nur endliche Punkte, in die Zeichenfläche, doppelte Punkte weg
    let pts = [];
    (roh || []).forEach((p) => {
      if (!Array.isArray(p) || !isFinite(p[0]) || !isFinite(p[1])) return;
      const q = [klemme(p[0], -H, H), klemme(p[1], -H, H)], l = pts[pts.length - 1];
      if (!l || Math.hypot(q[0] - l[0], q[1] - l[1]) >= 2) pts.push(q);
    });
    if (pts.length < 2) return fehl('leer');
    let L = 0;
    for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    if (L < 150 || pts.length < 6) return fehl('kurz');
    const luecke = Math.hypot(pts[0][0] - pts[pts.length - 1][0], pts[0][1] - pts[pts.length - 1][1]);
    if (luecke > K.maxLuecke || luecke > L * 0.35) return fehl('offen', { x: pts[pts.length - 1][0], z: pts[pts.length - 1][1] });
    // 2) abtasten und glätten (Schließen: die Lücke wird ein Teil der Runde)
    let P = neuAbtasten(pts, K.abstand);
    const Lroh = umfang(P);
    if (Lroh < K.minLaenge * 0.7) return fehl('zuKurz');
    P = umfangHalten(glaettenGauss(glaettenGauss(P, K.sigma), K.sigma * 0.6), Lroh);
    P = neuAbtasten(P, K.abstand);
    if (umfang(P) < K.minLaenge) return fehl('zuKurz');
    if (umfang(P) > K.maxLaenge) return fehl('zuLang');
    // 3) enge Kurven entschärfen, zu nahe Stücke trennen
    const k0 = kruemmungMax(P).k;
    const e1 = entspannen(P, K.minRadius);
    P = e1.P;
    if (e1.schritte > 0) hinweise.push(k0 > 1 / K.minRadius ? 'Enge Kurven habe ich etwas weiter gemacht.' : 'Ich habe Stücke auseinandergeschoben.');
    P = neuAbtasten(P, K.abstand);
    // 4) Kreuzungen (= Brücken) prüfen
    let kreuz = kreuzungenFinden(P);
    if (kreuz.length > K.maxKreuzungen) return fehl('kreuzMehr', { x: kreuz[K.maxKreuzungen].x, z: kreuz[K.maxKreuzungen].z });
    const flach = kreuz.find((c) => c.winkel < K.minKreuzWinkel);
    if (flach) return fehl('kreuzFlach', { x: flach.x, z: flach.z });
    // 5) gerades Stück für Start und Ziel, Ausrichtung
    const sg = startGerade(P, kreuz);
    if (!sg) return kreuz.length ? fehl('kreuzStart', { x: kreuz[0].x, z: kreuz[0].z }) : fehl('gerade');
    if (sg.mx > 1 / 250) hinweise.push('Für Start und Ziel habe ich ein gerades Stück gemacht.');
    const e2 = entspannen(sg.P, K.minRadius, { fix: sg.fix, festeIndizes: true, max: 200 });
    P = neuAbtasten(e2.P, K.abstand, sg.P.length);
    // 6) Endprüfung (am echten Spline)
    kreuz = kreuzungenFinden(P);
    const m = messen(P);
    if (m.minRadius < K.minRadius * 0.8) {
      const e3 = entspannen(P, K.minRadius * 1.3, { max: 300, festeIndizes: true });
      P = e3.P;
    }
    const m2 = messen(P);
    if (m2.minRadius < K.minRadius * 0.8) { const o = P[m2.iMin]; return fehl('eng', { x: o[0], z: o[1] }); }
    const nah = zuNah(P, K.minAbstand * 0.8, kreuz);
    if (nah.length) { const o = P[nah[0].a]; return fehl('nah', { x: o[0], z: o[1] }); }
    kreuz = kreuzungenFinden(P);
    if (kreuz.length > K.maxKreuzungen) return fehl('kreuzMehr', { x: kreuz[0].x, z: kreuz[0].z });
    const fl = kreuz.find((c) => c.winkel < K.minKreuzWinkel * 0.8);
    if (fl) return fehl('kreuzFlach', { x: fl.x, z: fl.z });
    const d0 = P[0];
    P = P.map((p) => [rund(p[0] - d0[0]), rund(p[1] - d0[1])]);
    const lang = umfang(P);
    if (lang < K.minLaenge * 0.9) return fehl('zuKurz');
    if (lang > K.maxLaenge * 1.05) return fehl('zuLang');
    return { ok: true, pkt: P, laenge: lang, kreuzungen: kreuzungenFinden(P), hinweise };
  }

  /** Engster Radius aus dem echten Spline (Kontrollpunkte flach). */
  function messen(P) {
    const sp = splineAus(P);
    let mk = 0, iMin = 0;
    for (let i = 0; i < sp.punkte.length; i++) { const k = Math.abs(sp.punkte[i].kruemmung || 0); if (k > mk) { mk = k; iMin = i; } }
    // Index im Kontrollpunkt-Vieleck: nächster Kontrollpunkt zur Stelle
    const q = sp.punkte[iMin];
    let b = 0, bd = Infinity;
    P.forEach((p, i) => { const dd = Math.hypot(p[0] - q.x, p[1] - q.z); if (dd < bd) { bd = dd; b = i; } });
    return { minRadius: mk > 0 ? 1 / mk : 1e9, laenge: sp.laenge, iMin: b, s: q.s };
  }
  function splineAus(P, y) { return new R.Spline(P.map((p, i) => [p[0], y ? y[i] : 0, p[1]]), { abstand: 2 }); }

  // ---------------------------------------------------------------- Projekt-Daten
  const welt = (id) => WELTEN.find((w) => w.id === id) || WELTEN[0];
  const sauber = (t) => String(t === undefined || t === null ? '' : t).replace(/[<>&"'`\\\u0000-\u001f]/g, '').replace(/\s+/g, ' ').trim().slice(0, K.nameLaenge);

  function neu(pkt, name, weltId) {
    return { v: 1, name: sauber(name) || 'Meine Strecke', welt: welt(weltId).id, pkt: pkt.map((p) => [p[0], p[1]]), hoehen: [], el: [] };
  }
  const spCache = new WeakMap();
  /** Spline der Projekt-Daten (flach, gleiche Bogenlänge wie die fertige Strecke, solange keine Höhe stört). */
  function geometrie(d) {
    let sp = spCache.get(d.pkt);
    if (!sp) { sp = splineAus(d.pkt); spCache.set(d.pkt, sp); }
    return sp;
  }

  // ---------------------------------------------------------------- Elemente: Regeln
  const cfgS = () => R.config.spass || {};
  const cfgW = () => (cfgS().welten || { tor: { abstand: 130, platz: { vorher: 22, nachher: 22, kappa: 1 / 280 } } });
  const cfgZ = () => cfgS().zauber || null;
  /** Je Art: Fußabdruck [vor, nach] um die Referenz-Bogenlänge s, Geradheits-Prüfungen [[von, bis, kappaMax]] (relativ zu s) und Länge für die Anzeige. */
  function regel(art) {
    const S = cfgS(), P = S.platz || { startFrei: 200, zielFrei: 180 };
    switch (art) {
      case 'schanze': return { zone: [-75, 10 + 85], pruef: [[-35, -3, 1 / 60], [-3, 13, 1 / 500], [13, 80, 1 / 150]], laenge: 10 };
      case 'ring': { const ra = (R.config.motoStunts && R.config.motoStunts.ring && R.config.motoStunts.ring.abstand) || 16;
        return { zone: [-75, 10 + ra + 90], pruef: [[-35, -3, 1 / 60], [-3, 13, 1 / 500], [13, 80 + ra, 1 / 150]], laenge: 10 + ra }; }
      case 'looping': return { zone: [-140, 90], pruef: [[-130, 60, 1 / 350]], laenge: 30 };
      case 'trampolin': { const T = S.trampolin || { laenge: 8, gerade: { vor: 12, nach: 110, kappa: 1 / 250 } };
        return { zone: [-T.gerade.vor, T.laenge + T.gerade.nach], pruef: [[-T.gerade.vor, T.laenge + T.gerade.nach, T.gerade.kappa]], laenge: T.laenge }; }
      case 'kanone': { const Ka = S.kanone || { laenge: 9, weite: 110, gerade: { vor: 15, nach: 30, kappaRohr: 1 / 400, kappaBahn: 1 / 200 } }, g = Ka.gerade;
        return { zone: [-g.vor, Ka.laenge + Ka.weite + g.nach], pruef: [[-g.vor, Ka.laenge, g.kappaRohr], [Ka.laenge, Ka.laenge + Ka.weite + 10, g.kappaBahn]], laenge: Ka.laenge + Ka.weite }; }
      case 'tor': { const T = cfgW().tor, p = T.platz;
        return { zone: [-p.vorher, T.abstand + p.nachher], pruef: [[-p.vorher, T.abstand + p.nachher, p.kappa]], laenge: T.abstand }; }
      case 'magnet': { const Z = cfgZ(), M = Z ? Z.magnet : { laenge: 150, platz: { vorher: 25, nachher: 25, kappa: 1 / 320 } };
        return { zone: [-M.platz.vorher, M.laenge + M.platz.nachher], pruef: [[-M.platz.vorher, M.laenge + M.platz.nachher, M.platz.kappa]], laenge: M.laenge }; }
      case 'schlucht': { const Z = cfgZ(), Sc = Z ? Z.schlucht : { luecke: 44, pad: 14, platz: { vorher: 30, nachher: 30, kappa: 1 / 380 } }, len = Sc.luecke + Sc.pad * 2;
        return { zone: [-Sc.platz.vorher, len + Sc.platz.nachher], pruef: [[-Sc.platz.vorher, len + Sc.platz.nachher, Sc.platz.kappa]], laenge: len }; }
      case 'gold': return { zone: [-6, 30], pruef: [[0, 24, 0.008]], laenge: 24, leicht: true };
      default: return null;
    }
  }
  const kappaAb = (sp, a, b) => {            // größte Krümmung auf [a, b] (Bogenlänge, darf über die Runde hinausgehen)
    const N = sp.punkte.length, ds = sp.ds;
    let m = 0;
    for (let i = Math.floor(a / ds); i <= Math.ceil(b / ds); i++) { const k = Math.abs(sp.punkte[mod(i, N)].kruemmung || 0); if (k > m) m = k; }
    return m;
  };
  function zonen(d, ohneIndex) {
    const sp = geometrie(d), z = [];
    d.el.forEach((e, i) => {
      if (i === ohneIndex) return;
      const r = regel(e.a);
      if (r) z.push({ a: e.a, s0: e.s + r.zone[0], s1: e.s + r.zone[1], leicht: !!r.leicht });
    });
    kreuzZonen(d, sp).forEach((k) => z.push(k));
    return z;
  }
  /** Bereiche an Kreuzungen (Brücke/Rampe), in denen nichts stehen darf. */
  function kreuzZonen(d, sp) {
    const z = [];
    (kreuzungenVon(d) || []).forEach((k) => {
      z.push({ a: 'kreuz', s0: k.sOben - K.bruecke.halb - 30, s1: k.sOben + K.bruecke.halb + 30 });
      z.push({ a: 'kreuz', s0: k.sUnten - 90, s1: k.sUnten + 90 });
    });
    return z;
  }
  /** Kreuzungen der Projekt-Daten mit Bogenlängen (sOben = später im Umlauf auf der Kontrollpolylinie, auf Spline-Länge umgerechnet). */
  function kreuzungenVon(d) {
    if (d._kreuz) return d._kreuz;
    const k = kreuzungenFinden(d.pkt), n = d.pkt.length, Lp = umfang(d.pkt), sp = geometrie(d), f = sp.laenge / Lp, dd = Lp / n;
    const arc = (idx, t) => (idx + (t || 0)) * dd * f;
    d._kreuz = k.map((c) => {
      const a = arc(c.i, 0.5), b = arc(c.j, 0.5);
      // die obere Fahrbahn: die weiter vom Start entfernte Stelle zuletzt im Umlauf (größeres s), sofern beide weit genug vom Start liegen
      return { sOben: Math.max(a, b), sUnten: Math.min(a, b), x: c.x, z: c.z, winkel: c.winkel };
    });
    return d._kreuz;
  }

  /**
   * Passt ein Element der Art `art` an Bogenlänge s? Sucht bei Bedarf die nächste passende Stelle (bis ± 320 m).
   * → { ok, s, verschoben, grund }. ohneIndex: dieses Element zählt nicht (Verschieben).
   */
  function stelle(d, art, sWunsch, ohneIndex) {
    const r = regel(art), sp = geometrie(d), L = sp.laenge, S = cfgS(), P = S.platz || { startFrei: 200, zielFrei: 180 };
    if (!r) return { ok: false, grund: 'Das kenne ich nicht.' };
    if (art === 'ring' && !(typeof window !== 'undefined' && window.MOTORRAD === true)) return { ok: false, grund: 'Den Feuerring gibt es nur beim Motorrad.' };
    const anz = d.el.filter((e, i) => i !== ohneIndex && e.a === art).length;
    if (anz >= MAXJE[art]) return { ok: false, grund: 'Davon sind schon genug da.' };
    if (d.el.length - (ohneIndex !== undefined ? 1 : 0) >= K.maxElemente) return { ok: false, grund: 'Die Strecke ist schon ziemlich voll!' };
    const zz = zonen(d, ohneIndex);
    let grund = 'Hier passt es nicht.';
    const pruefe = (s) => {
      const a = s + r.zone[0], b = s + r.zone[1];
      if (a < (r.leicht ? 90 : P.startFrei - 30) || b > L - (r.leicht ? 40 : P.zielFrei - 30)) { grund = 'Zu nah an Start und Ziel.'; return false; }
      for (const q of zz) {
        if (r.leicht && q.leicht) { if (b > q.s0 && a < q.s1) { grund = 'Hier liegen schon Goldstücke.'; return false; } continue; }
        if (b > q.s0 && a < q.s1) { grund = q.a === 'kreuz' ? 'Zu nah an der Brücke.' : 'Da ist schon etwas anderes.'; return false; }
      }
      for (const [von, bis, kappa] of r.pruef) if (kappaAb(sp, s + von, s + bis) > kappa) { grund = 'Hier ist die Strecke zu kurvig – such eine lange Gerade!'; return false; }
      return true;
    };
    for (let dv = 0; dv <= 320; dv += 4) for (const sg of dv ? [1, -1] : [1]) {
      const s = rund(sWunsch + sg * dv, 0);
      if (s < 0 || s > L) continue;
      if (pruefe(s)) return { ok: true, s, verschoben: dv > 8 };
    }
    return { ok: false, grund };
  }
  /** Element setzen (Platzierung prüft stelle()). → { ok, index, s, verschoben, grund } */
  function setzen(d, art, sWunsch, extra) {
    const st = stelle(d, art, sWunsch);
    if (!st.ok) return st;
    const e = { a: art, s: st.s };
    if (art === 'gold') e.q = extra && typeof extra.q === 'number' ? klemme(extra.q, -0.5, 0.5) : (d.el.filter((x) => x.a === 'gold').length % 2 ? 0.35 : -0.35);
    d.el.push(e);
    d.el.sort((a, b) => a.s - b.s);
    return { ok: true, index: d.el.indexOf(e), s: e.s, verschoben: st.verschoben };
  }
  function entfernen(d, index) { if (index >= 0 && index < d.el.length) d.el.splice(index, 1); }
  /** Hügel (h in m, negativ = Senke) an Bogenlänge s; vorhandener Hügel in der Nähe wird ersetzt. h = 0 löscht. */
  function hoeheSetzen(d, s, h) {
    h = klemme(Math.round(zahl(h, 0)), K.hoeheMin, K.hoeheMax);
    const L = geometrie(d).laenge, i = d.hoehen.findIndex((x) => Math.abs(x.s - s) < 70 || Math.abs(x.s - s) > L - 70);
    if (i >= 0) d.hoehen.splice(i, 1);
    if (h !== 0) {
      if (d.hoehen.length >= K.maxHuegel) return { ok: false, grund: 'Das sind schon genug Hügel.' };
      d.hoehen.push({ s: rund(s, 0), h });
      d.hoehen.sort((a, b) => a.s - b.s);
    }
    return { ok: true };
  }

  // ---------------------------------------------------------------- Katalog-Eintrag
  const AUS = { hindernisse: false, wracks: false, strohballen: false, spuren: false, schanzen: false, baelle: false, wasserstrahlen: false, boost: false, schild: false, loopings: false, kleber: false, dinos: false };
  const KOPIE = ['thema', 'breite', 'randBreite', 'zaunAbstand', 'abseitsUntergrund', 'schwerkraft', 'trampolinFaktor', 'gripFaktor', 'bremsFaktor', 'keineWolken', 'keineSonne', 'huepfer', 'regenbogenFahrbahn', 'tiereAus'];
  function basisEintrag(id) { return R.trackCatalog.find((t) => t.id === id && !t.eigen) || null; }
  const hash = (t) => { let h = 2166136261 >>> 0; for (let i = 0; i < t.length; i++) { h ^= t.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return h >>> 0; };
  const idVon = (d) => d.id || ('eigen-' + hash(JSON.stringify([d.pkt])).toString(36));

  /** Hügel-Beitrag an Position (x, z) bzw. Bogenlänge. */
  const hHuegel = (h) => ({ r: 70 + 6 * Math.abs(h) });

  function eintrag(d) {
    const w = welt(d.welt), basis = basisEintrag(w.basis) || {}, sp = geometrie(d), L = sp.laenge;
    const kreuz = kreuzungenVon(d).slice(0, K.maxKreuzungen);
    const ueber = kreuz.length > 0;
    const e = {
      id: idVon(d), name: sauber(d.name) || 'Meine Strecke', emoji: '✏️', eigen: true, thema: basis.thema || 'wiese',
      beschreibung: 'Von dir gemalt (' + w.name + ', ' + Math.round(L) + ' m).' + (d.ki && d.ki.ok === false ? ' ⚠️ Computer-Autos schaffen sie nicht.' : ''),
      schwierigkeit: 'spass', zielRundenzeit: Math.round(L / 30), checkpointAbstand: 120, keineVariante: true,
      weltStandard: 'klassisch', welten: { klassisch: Object.assign({}, AUS, { schanzen: true, loopings: true }) },
      bruecken: [], tunnel: [], hindernisse: [], schanzen: [], loopings: [],
    };
    KOPIE.forEach((k) => { if (basis[k] !== undefined) e[k] = basis[k]; });
    if (!e.breite) e.breite = 14;
    if (!e.randBreite) e.randBreite = 1.5;
    if (!e.zaunAbstand) e.zaunAbstand = 14;
    // Höhen
    const pk = sp.punkte, step = Math.max(1, Math.round(K.abstand / sp.ds));
    const hs = d.hoehen.filter((x) => x.h !== 0);
    if (!ueber) {
      e.huegel = hs.map((x) => { const p = sp.punktBei(x.s); return { x: rund(p.x), z: rund(p.z), r: hHuegel(x.h).r, h: x.h }; });
      e.punkte = d.pkt.map((p) => { let y = 0; e.huegel.forEach((g) => { const dx = p[0] - g.x, dz = p[1] - g.z; y += g.h * Math.exp(-(dx * dx + dz * dz) / (2 * g.r * g.r)); }); return [p[0], rund(y, 2), p[1]]; });
    } else {
      // Überführung: Höhenmodell „strasse“; y aus dem Profil entlang der Strecke (Hügel außer in den Brückenbereichen + Rampe unter der oberen Fahrbahn)
      e.hoehenModell = 'strasse';
      e.huegel = [];
      const Lp = umfang(d.pkt), n = d.pkt.length, dd = Lp / n, f = L / Lp, B = K.bruecke;
      const dist = (a, b) => { const x = Math.abs(a - b) % L; return Math.min(x, L - x); };
      e.punkte = d.pkt.map((p, i) => {
        const s = i * dd * f;
        let sperr = 0;
        kreuz.forEach((k) => { sperr = Math.max(sperr, 1 - glatt((dist(s, k.sOben) - B.halb) / 60), 1 - glatt((dist(s, k.sUnten) - 60) / 60)); });
        let y = 0;
        hs.forEach((x) => { const dx = dist(s, x.s), r = hHuegel(x.h).r; y += x.h * Math.exp(-dx * dx / (2 * r * r)); });
        y *= 1 - sperr;
        kreuz.forEach((k) => { const dx = dist(s, k.sOben); if (dx < B.halb) y += B.hub * 0.5 * (1 + Math.cos(Math.PI * dx / B.halb)); });
        return [p[0], rund(y, 2), p[1]];
      });
      e.ueberfuehrungen = kreuz.map((k) => ({ s0: Math.max(5, Math.round(k.sOben - B.fenster)), s1: Math.min(Math.round(L - 5), Math.round(k.sOben + B.fenster)), art: 'beton' }));
    }
    void pk; void step;
    // Elemente
    const sp2 = [];
    d.el.forEach((x) => {
      if (x.a === 'schanze') e.schanzen.push({ s: x.s, winkel: 12, laenge: 10 });
      else if (x.a === 'ring') e.schanzen.push({ s: x.s, winkel: 12, laenge: 10, moto: { ring: true } });
      else if (x.a === 'looping') e.loopings.push({ s: x.s, radius: 12 });
      else if (x.a === 'gold') { e.eigeneMuenzen = e.eigeneMuenzen || []; e.eigeneMuenzen.push({ s: x.s, q: x.q || 0 }); }
      else sp2.push({ a: x.a, s: x.s });
    });
    e.editor = { v: 1, spass: sp2, welt: w.id };
    return e;
  }

  // ---------------------------------------------------------------- Registrieren (R.trackCatalog)
  function registrieren(d) {
    const e = eintrag(d), i = R.trackCatalog.findIndex((t) => t.id === e.id);
    if (i >= 0) R.trackCatalog[i] = e; else R.trackCatalog.push(e);
    return e;
  }
  function aufraeumen() {
    for (let i = R.trackCatalog.length - 1; i >= 0; i--) if (R.trackCatalog[i].eigen) R.trackCatalog.splice(i, 1);
  }

  // ---------------------------------------------------------------- Spaß-Haken (Trampolin, Kanone, Tore, Magnet, Schlucht an der Wahl des Kindes)
  function planEinsetzen(st, erg, opt) {
    const kat = st.katalog || {};
    if (!kat.eigen || !kat.editor || !erg) return;
    const sp = st.spline, S = cfgS(), T = S.trampolin, Ka = S.kanone, breite = st.breite || 14;
    const liste = [], zonenNeu = [], tore = [];
    const magnet = [], schluchten = [];
    const halb = Math.max(2.5, breite / 2);
    kat.editor.spass.forEach((e) => {
      const r = regel(e.a);
      if (!r) return;
      zonenNeu.push({ s0: e.s + r.zone[0], s1: e.s + r.zone[1] });
      if (e.a === 'trampolin') liste.push({ nr: 0, art: 'trampolin', s0: e.s, laenge: T.laenge, halb: Math.min(T.halbBreite, breite / 2 - 0.8), sT: e.s + T.laenge / 2 });
      else if (e.a === 'kanone') liste.push({ nr: 0, art: 'kanone', s0: e.s, laenge: Ka.laenge, halb: Ka.halbBreite, qc: 0, sT: e.s + 1.5, sMund: e.s + Ka.laenge - 1.2, sLand: e.s + Ka.laenge - 1.2 + Ka.weite });
      else if (e.a === 'tor') { const W = cfgW().tor; tore.push({ nr: tore.length, sA: e.s, sT: e.s + 2, sB: e.s + W.abstand, halb: Math.max(2.5, breite / 2 - W.randZu) }); }
      else if (e.a === 'magnet' && cfgZ()) { const M = cfgZ().magnet; magnet.push({ nr: magnet.length, s0: e.s, s1: e.s + M.laenge, laenge: M.laenge, rampe: M.rampe, halb }); }
      else if (e.a === 'schlucht' && cfgZ()) { const Sc = cfgZ().schlucht; schluchten.push({ nr: schluchten.length, sT: e.s + Sc.pad, sL: e.s + Sc.pad + Sc.luecke, halb }); }
    });
    liste.sort((a, b) => a.s0 - b.s0);
    liste.forEach((e, i) => { e.nr = i; });
    erg.liste = liste; erg.zonen = zonenNeu;
    erg.trampoline = liste.filter((e) => e.art === 'trampolin').length; erg.kanonen = liste.filter((e) => e.art === 'kanone').length;
    erg.tore = tore;
    if (erg.zauber) erg.zauber = { magnet, schluchten, schienen: [], extras: [], pipe: null };
    void sp; void opt;
  }
  if (R.Spass && typeof R.Spass.plan === 'function') {
    const planOrig = R.Spass.plan;
    R.Spass.plan = function (st) {
      const erg = planOrig.apply(this, arguments);
      try { if (st && st.katalog && st.katalog.eigen) planEinsetzen(st, erg, arguments[3]); } catch (e) { if (typeof console !== 'undefined') console.error('Strecken-Editor (Plan):', e); }
      return erg;
    };
  }

  // ---------------------------------------------------------------- KI-Testrunde (schnell, ohne Bild)
  /**
   * Fährt die Strecke einmal mit Vehicle + Ideallinie (wie die KI: Zielpunkt voraus, Tempo aus tempoBei) und meldet Stellen, an denen es nicht geht:
   * weit von der Straße, steckt fest, oder die Runde wird nicht fertig. → { ok, probleme:[{ s, text }], zeit, runden }
   */
  function fahrtest(daten, opt) {
    opt = opt || {};
    const probleme = [];
    try {
      const st = new R.Strecke(daten, { spass: opt.spass !== false });
      const auto = R.carCatalog.waehlbare()[0], v = new R.Vehicle(auto.fahrwerte, { tempoKlasse: 'mittel' });
      const p0 = st.startpositionen(1)[0], dt = (R.config.physik && R.config.physik.schritt) || 1 / 60;
      v.setzen(p0.x, p0.z, p0.heading); v.y = st.hoeheAn(p0.x, p0.z); v.vLaengs = 0;
      const sp = st.spline, L = sp.laenge, grenze = st.breite / 2 + st.randBreite + 2.5;
      // 1) Geometrie: keine Kurve enger als 22 m (die KI schleicht sonst im Schritttempo oder bleibt hängen)
      for (let i = 0; i < sp.punkte.length; i++) {
        const k = Math.abs(sp.punkte[i].kruemmung || 0);
        if (k > 1 / 22) { probleme.push({ s: Math.round(sp.punkte[i].s), text: 'Hier ist die Kurve zu eng für die Computer-Autos.' }); break; }
      }
      if (probleme.length) return { ok: false, probleme, zeit: null, laenge: L };
      let idx = -1, sMax = 0, schritte = 0, draussen = 0, langsam = 0, zeit = 0, letztes = null;
      const maxS = Math.ceil((opt.maxZeit || Math.max(150, L / 6)) / dt);
      let bandeIdx = 0;
      void bandeIdx;
      while (schritte < maxS) {
        const n = st.abfrage(v.x, v.z, idx);
        idx = n.index;
        const vl = Math.max(3, v.vLaengs), la = Math.max(9, Math.min(50, 0.55 * vl + 8)), ziel = sp.punktBei(n.s + la);
        let diff = R.headingAus(ziel.x - v.x, ziel.z - v.z) - v.heading;
        while (diff > Math.PI) diff -= 2 * Math.PI;
        while (diff < -Math.PI) diff += 2 * Math.PI;
        const lenk = klemme(-(2 * vl * Math.sin(diff) / Math.max(1, Math.hypot(ziel.x - v.x, ziel.z - v.z))) / v.drehrateMax(vl), -1, 1);
        const soll = st.tempoBei(n.s + vl * 0.3) * 0.85;
        v.schritt(dt, { gas: v.vLaengs < soll ? 1 : 0, bremse: v.vLaengs > soll + 3 ? 0.5 : 0, lenkung: lenk }, null, null);
        if (R.Kollisionen && R.Kollisionen.bande) R.Kollisionen.bande(v, st);
        schritte++; zeit += dt;
        const k = Math.abs(n.seitenabstand);
        if (k > grenze) { draussen++; if (draussen === 30) probleme.push({ s: Math.round(n.s), text: 'Hier kommt das Computer-Auto von der Straße ab.' }); } else draussen = Math.max(0, draussen - 1);
        if (v.vLaengs < 1.5 && zeit > 6) { langsam++; if (langsam === 180) probleme.push({ s: Math.round(n.s), text: 'Hier bleibt das Computer-Auto stehen.' }); } else langsam = 0;
        // Fortschritt: ganze Runde = vom Start bis wieder zum Start
        if (n.s > sMax && n.s < sMax + 60) sMax = n.s;
        if (sMax > L - 12) { letztes = zeit; break; }
        if (probleme.length) break;
      }
      if (letztes === null && !probleme.length) probleme.push({ s: Math.round(sMax), text: 'Hier kommt das Computer-Auto nicht weiter.' });
      return { ok: probleme.length === 0, probleme, zeit: letztes, laenge: L };
    } catch (err) {
      return { ok: false, probleme: [{ s: 0, text: 'Die Strecke lässt sich nicht bauen.' }], fehler: String(err && err.message || err) };
    }
  }

  // ---------------------------------------------------------------- Prüfen (Server und Import: fremde Daten)
  /** Bereinigt fremde Projekt-Daten (Größe, Werte klemmen). → neue Daten oder null (abgelehnt). Grund in pruefen.letzterGrund. */
  function pruefen(x) {
    const nein = (g) => { pruefen.letzterGrund = g; return null; };
    if (!x || typeof x !== 'object' || !Array.isArray(x.pkt)) return nein('Keine Strecke');
    if (x.pkt.length < 40 || x.pkt.length > 800) return nein('Punktzahl');
    const H = K.welt + 100, pkt = [];
    for (const p of x.pkt) {
      if (!Array.isArray(p) || typeof p[0] !== 'number' || typeof p[1] !== 'number' || !isFinite(p[0]) || !isFinite(p[1])) return nein('Punkt');
      pkt.push([rund(klemme(p[0], -H, H)), rund(klemme(p[1], -H, H))]);
    }
    const Lp = umfang(pkt);
    if (!(Lp >= K.minLaenge * 0.8 && Lp <= K.maxLaenge * 1.1)) return nein('Länge');
    const n = pkt.length, dd = Lp / n;
    for (let i = 0; i < n; i++) { const a = pkt[i], b = pkt[(i + 1) % n]; if (Math.hypot(b[0] - a[0], b[1] - a[1]) > 3 * dd + 20) return nein('Lücke'); }
    if (kruemmungMax(pkt).k > 1 / (K.minRadius * 0.55)) return nein('Kurve zu eng');
    const kz = kreuzungenFinden(pkt);
    if (kz.length > K.maxKreuzungen || kz.some((c) => c.winkel < K.minKreuzWinkel * 0.7)) return nein('Kreuzungen');
    if (zuNah(pkt, K.minAbstand * 0.6, kz).length) return nein('zu nah');
    const d = { v: 1, name: sauber(x.name) || 'Meine Strecke', welt: welt(x.welt).id, pkt, hoehen: [], el: [] };
    if (x.id && /^eigen-[a-z0-9]{1,12}$/.test(String(x.id))) d.id = String(x.id);
    if (x.ki && x.ki.ok === false) d.ki = { ok: false, s: zahl(x.ki.s, 0), text: String(x.ki.text || '').replace(/[<>&"'`\\]/g, '').slice(0, 80) };
    const L = geometrie(d).laenge;
    (Array.isArray(x.hoehen) ? x.hoehen : []).slice(0, K.maxHuegel).forEach((h) => { if (h && isFinite(h.s) && isFinite(h.h) && Math.round(h.h) !== 0) d.hoehen.push({ s: klemme(Math.round(h.s), 0, Math.floor(L)), h: klemme(Math.round(h.h), K.hoeheMin, K.hoeheMax) }); });
    // Elemente einzeln wieder setzen: dieselben Regeln wie im Editor (ohne Verschieben); was nicht passt, fällt weg
    (Array.isArray(x.el) ? x.el : []).slice(0, K.maxElemente * 2).forEach((e) => {
      if (!e || ARTEN.indexOf(e.a) < 0 || !isFinite(e.s) || d.el.length >= K.maxElemente) return;
      const st = stelle(d, e.a, klemme(Math.round(e.s), 0, Math.floor(L)));
      if (st.ok && Math.abs(st.s - e.s) <= 8) { const q = { a: e.a, s: st.s }; if (e.a === 'gold') q.q = klemme(zahl(e.q, 0), -0.5, 0.5); d.el.push(q); d.el.sort((a, b) => a.s - b.s); }
    });
    pruefen.letzterGrund = '';
    return d;
  }

  // ---------------------------------------------------------------- Teilen: Code (Text) und Datei
  // Base64 ohne btoa/Buffer (läuft auch im Server-Kontext); Text als UTF-8
  const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  function b64(text) {
    const t = unescape(encodeURIComponent(text));
    let o = '';
    for (let i = 0; i < t.length; i += 3) {
      const a = t.charCodeAt(i), b = i + 1 < t.length ? t.charCodeAt(i + 1) : NaN, c = i + 2 < t.length ? t.charCodeAt(i + 2) : NaN;
      o += B64[a >> 2] + B64[((a & 3) << 4) | ((b || 0) >> 4)] + (isNaN(b) ? '=' : B64[((b & 15) << 2) | ((c || 0) >> 6)]) + (isNaN(c) ? '=' : B64[c & 63]);
    }
    return o;
  }
  function unb64(text) {
    const t = String(text).replace(/=+$/, '');
    let bits = 0, n = 0, o = '';
    for (let i = 0; i < t.length; i++) {
      const v = B64.indexOf(t[i]);
      if (v < 0) throw new Error('Zeichen');
      bits = (bits << 6) | v; n += 6;
      if (n >= 8) { n -= 8; o += String.fromCharCode((bits >> n) & 255); bits &= (1 << n) - 1; }
    }
    return decodeURIComponent(escape(o));
  }
  /** Strecke als Text-Code (Punkte als ganze Zehntelmeter, Unterschiede zum Vorgänger). */
  function code(d) {
    let lx = 0, lz = 0;
    const pk = d.pkt.map((p) => { const x = Math.round(p[0] * 10), z = Math.round(p[1] * 10), r = (x - lx) + ',' + (z - lz); lx = x; lz = z; return r; }).join(';');
    const o = { v: 1, n: sauber(d.name), w: d.welt, p: pk, h: d.hoehen.map((x) => [x.s, x.h]), e: d.el.map((x) => [ARTEN.indexOf(x.a), x.s, x.q === undefined ? 0 : Math.round(x.q * 100)]) };
    return K.codePraefix + b64(JSON.stringify(o)) + '.ENDE';     // „.“ gibt es in Base64 nicht: so findet der Import das Ende auch in einem Chat-Text
  }
  /** Text-Code → bereinigte Projekt-Daten oder null (Grund in ausCode.letzterGrund). */
  function ausCode(text) {
    const nein = (g) => { ausCode.letzterGrund = g; return null; };
    try {
      const roh = String(text || ''), i0 = roh.indexOf(K.codePraefix);
      if (i0 < 0) return nein('Das ist kein Streckencode.');
      let t = roh.slice(i0 + K.codePraefix.length);
      const punkt = t.indexOf('.');
      if (punkt >= 0) t = t.slice(0, punkt);
      t = t.replace(/\s+/g, '');
      if (t.length > 60000) return nein('Der Code ist zu lang.');
      const o = JSON.parse(unb64(t));
      if (!o || o.v !== 1 || typeof o.p !== 'string') return nein('Das ist kein Streckencode.');
      let x = 0, z = 0;
      const pkt = o.p.split(';').slice(0, 900).map((s) => { const q = s.split(','); x += parseInt(q[0], 10); z += parseInt(q[1], 10); return [x / 10, z / 10]; });
      const d = pruefen({ name: o.n, welt: o.w, pkt, hoehen: (o.h || []).map((q) => ({ s: q[0], h: q[1] })), el: (o.e || []).map((q) => ({ a: ARTEN[q[0]], s: q[1], q: (q[2] || 0) / 100 })) });
      if (!d) return nein('Diese Strecke kann ich nicht fahren (' + pruefen.letzterGrund + ').');
      ausCode.letzterGrund = '';
      return d;
    } catch (e) { return nein('Das ist kein Streckencode.'); }
  }

  // ---------------------------------------------------------------- Speichern (localStorage je Spiel, bis 20 Strecken)
  const spielName = () => (typeof window !== 'undefined' && window.MOTORRAD === true ? 'motorrad' : 'auto');
  const SP = { ram: {} };
  const schluessel = (sp) => 'rennspiel.editor.strecken.' + (sp || spielName());
  function liste(sp) {
    sp = sp || spielName();
    let a = null;
    try { const ls = typeof localStorage !== 'undefined' ? localStorage : null; if (ls) a = JSON.parse(ls.getItem(schluessel(sp)) || 'null'); } catch (e) { a = null; }
    if (!Array.isArray(a)) a = SP.ram[sp] ? JSON.parse(JSON.stringify(SP.ram[sp])) : [];
    return a.filter((x) => x && x.daten && Array.isArray(x.daten.pkt)).slice(0, K.maxStrecken);
  }
  function sichern(sp, a) {
    sp = sp || spielName();
    SP.ram[sp] = JSON.parse(JSON.stringify(a));
    try { const ls = typeof localStorage !== 'undefined' ? localStorage : null; if (ls) ls.setItem(schluessel(sp), JSON.stringify(a)); return true; } catch (e) { return false; }
  }
  /** Speichern: { daten, vorschau? }. Gleicher Name/gleiche id überschreibt; voll → { ok:false, grund }. */
  function speichern(d, vorschau, sp) {
    sp = sp || spielName();
    const a = liste(sp), id = d.id || idVon(d);
    d.id = id;
    const i = a.findIndex((x) => x.daten.id === id);
    const satz = { daten: JSON.parse(JSON.stringify(d)), vorschau: vorschau || (i >= 0 ? a[i].vorschau : ''), zeit: Date.now() };
    if (i >= 0) a[i] = satz;
    else { if (a.length >= K.maxStrecken) return { ok: false, grund: 'Du hast schon ' + K.maxStrecken + ' Strecken. Lösch erst eine alte.' }; a.push(satz); }
    sichern(sp, a);
    if (sp === spielName()) registrieren(d);
    return { ok: true, id, anzahl: a.length };
  }
  function loeschen(id, sp) {
    sp = sp || spielName();
    sichern(sp, liste(sp).filter((x) => x.daten.id !== id));
    const i = R.trackCatalog.findIndex((t) => t.id === id && t.eigen);
    if (i >= 0 && sp === spielName()) R.trackCatalog.splice(i, 1);
  }
  /** Alle gespeicherten Strecken in R.trackCatalog eintragen (beim Seitenstart). */
  function alleRegistrieren(sp) {
    let n = 0;
    liste(sp).forEach((x) => { try { const d = pruefen(Object.assign({}, x.daten, { id: x.daten.id })); if (d) { d.id = x.daten.id; registrieren(d); n++; } } catch (e) { /* kaputte Strecke ignorieren */ } });
    return n;
  }
  function laden(id, sp) { const x = liste(sp).find((q) => q.daten.id === id); return x ? JSON.parse(JSON.stringify(x.daten)) : null; }
  const Speicher = { liste, speichern, loeschen, laden, alleRegistrieren, schluessel };

  R.Editor = {
    K, WELTEN, ARTEN, ARTEN_INFO, MAXJE, FEHLER, Speicher,
    verarbeiten, neu, geometrie, regel, stelle, setzen, entfernen, hoeheSetzen, eintrag, registrieren, aufraeumen, planEinsetzen, fahrtest, pruefen, code, ausCode, sauber,
    kreuzungenVon, kreuzungenFinden, umfang, neuAbtasten, kruemmungMax, messen, zuNah, welt, spielName, glaettenGauss, umfangHalten, entspannen, startGerade,
  };
})();
