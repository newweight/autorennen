// ============================================================
// Spaß-Paket S1 – Geist vom besten Lauf (nur offline, Solo): je Strecke + Fahrzeugart wird die beste Runde aufgezeichnet (Position/Richtung/Höhe ~10 Hz,
// kompakt als Text mit Differenzen, localStorage) und als halbdurchsichtiges Geister-Fahrzeug nachgefahren (keine Kollision, spassStart.js).
//   R.SpassGeist.schluessel(streckeId, autoId)       Speicherschlüssel einer Aufnahme
//   R.SpassGeist.neu() / .schritt(a, dt, x, z, heading, y)   Aufzeichner (eine Runde); .abschluss(a, zeit) → Datensatz { zeit, n, d }
//   R.SpassGeist.entpacken(satz) → { zeit, n, x, z, h, y }   .pose(g, t, aus) → Pose bei Rundenzeit t (null nach dem Ende)
//   R.SpassGeist.holen(spiel, key) / .ablegen(spiel, key, satz)   Speicher je Spiel (auto | motorrad), höchstens `max` Läufe (ältester fliegt raus)
//   R.SpassGeist.besser(alt, zeit)                   Ist die neue Zeit besser als die gespeicherte?
// ============================================================
(function () {
  const R = window.Rennspiel;
  if (!R) return;
  const DT = 0.1, MAX = 40, MAXPUNKTE = 3600;
  const G = { DT, MAX };
  const spielName = () => (window.MOTORRAD === true ? 'motorrad' : 'auto');
  G.schluessel = (streckeId, autoId) => String(streckeId) + '|' + String(autoId);

  G.neu = () => ({ t: 0, n: 0, x: [], z: [], h: [], y: [] });
  /** Zeit dt weiter, bei jedem 0,1-s-Raster die Pose festhalten (Lauf über MAXPUNKTE Punkte = 6 min wird nicht mehr aufgezeichnet). */
  G.schritt = function (a, dt, x, z, h, y) {
    a.t += dt;
    while (a.t >= a.n * DT && a.n < MAXPUNKTE) { a.x.push(x); a.z.push(z); a.h.push(h); a.y.push(y); a.n++; }
  };
  const w100 = (h) => Math.round((((h + Math.PI) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI) * 100 - Math.PI * 100);
  /** Datensatz: Differenzen (x, z in 0,1 m; Richtung in 0,01 rad, y in 0,1 m) als Base-36-Text. */
  G.abschluss = function (a, zeit) {
    const teile = [];
    let px = 0, pz = 0, ph = 0, py = 0;
    for (let i = 0; i < a.n; i++) {
      const x = Math.round(a.x[i] * 10), z = Math.round(a.z[i] * 10), h = w100(a.h[i]), y = Math.round(a.y[i] * 10);
      let dh = h - ph; if (dh > 314) dh -= 628; else if (dh < -314) dh += 628;
      teile.push((x - px).toString(36), (z - pz).toString(36), dh.toString(36), (y - py).toString(36));
      px = x; pz = z; ph = ph + dh; py = y;
    }
    return { zeit: Math.round(zeit * 1000) / 1000, n: a.n, d: teile.join(',') };
  };
  G.entpacken = function (s) {
    if (!s || typeof s.d !== 'string' || !(s.n > 1)) return null;
    const v = s.d.split(',');
    if (v.length !== s.n * 4) return null;
    const g = { zeit: s.zeit, n: s.n, x: new Float64Array(s.n), z: new Float64Array(s.n), h: new Float64Array(s.n), y: new Float64Array(s.n) };
    let x = 0, z = 0, h = 0, y = 0;
    for (let i = 0; i < s.n; i++) {
      x += parseInt(v[4 * i], 36); z += parseInt(v[4 * i + 1], 36); h += parseInt(v[4 * i + 2], 36); y += parseInt(v[4 * i + 3], 36);
      if (!Number.isFinite(x + z + h + y)) return null;
      g.x[i] = x / 10; g.z[i] = z / 10; g.h[i] = h / 100; g.y[i] = y / 10;
    }
    return g;
  };
  /** Pose bei Rundenzeit t (s); aus = { x, z, h, y } wird gefüllt. Nach dem letzten Punkt: null. */
  G.pose = function (g, t, aus) {
    if (!g || t < 0) return null;
    const f = t / DT, i = Math.floor(f);
    if (i >= g.n - 1) return null;
    const u = f - i, o = aus || {};
    o.x = g.x[i] + (g.x[i + 1] - g.x[i]) * u; o.z = g.z[i] + (g.z[i + 1] - g.z[i]) * u; o.y = g.y[i] + (g.y[i + 1] - g.y[i]) * u;
    let dh = g.h[i + 1] - g.h[i]; if (dh > Math.PI) dh -= 2 * Math.PI; else if (dh < -Math.PI) dh += 2 * Math.PI;
    o.h = g.h[i] + dh * u;
    return o;
  };
  G.besser = (alt, zeit) => !alt || !(alt.zeit > 0) || zeit < alt.zeit;

  // ---------- Speicher ----------
  const ram = {};
  const lsKey = (sp) => 'rennspiel.spass.geist.' + (sp || spielName());
  function lesen(sp) {
    try {
      const ls = typeof localStorage !== 'undefined' ? localStorage : null;
      if (ls) { const o = JSON.parse(ls.getItem(lsKey(sp)) || 'null'); if (o && typeof o === 'object') return o; }
    } catch (e) { /* weiter mit Arbeitsspeicher */ }
    return ram[sp || spielName()] || {};
  }
  function schreiben(sp, o) {
    ram[sp || spielName()] = o;
    try { const ls = typeof localStorage !== 'undefined' ? localStorage : null; if (ls) ls.setItem(lsKey(sp), JSON.stringify(o)); } catch (e) { /* zu groß/gesperrt: nur Arbeitsspeicher */ }
  }
  G.holen = function (sp, key) { const o = lesen(sp); return o[key] || null; };
  G.ablegen = function (sp, key, satz) {
    const o = lesen(sp);
    o[key] = Object.assign({ ts: Date.now() }, satz);
    const keys = Object.keys(o);
    if (keys.length > MAX) { keys.sort((a, b) => (o[a].ts || 0) - (o[b].ts || 0)); keys.slice(0, keys.length - MAX).forEach((k) => delete o[k]); }
    schreiben(sp, o);
  };
  G.loeschenAlle = (sp) => schreiben(sp, {});
  R.SpassGeist = G;
})();
