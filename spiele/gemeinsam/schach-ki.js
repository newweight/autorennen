// ============================================================
// Schach – Computergegner (UMD; im Browser im Web Worker, spiele/schach/ki-worker.js).
// Negamax mit Alpha-Beta, Zugsortierung (Schlagen zuerst), Ruhesuche, einfache Bewertung (Material + Feldtabellen).
//   BRETT.SchachKI.waehle(partie, stufe, { zeitMs, zufall }) → { m, text, wert, tiefe }
// Stufe 1 leicht: Tiefe 1, Wackeln in der Bewertung, manchmal ein Zufallszug · 2 mittel: Tiefe 3 · 3 schwer: bis Tiefe 6 in ~2,5 s.
// ============================================================
(function (root, f) {
  if (typeof module === 'object' && module.exports) module.exports = f(require('./schach-regeln.js'));
  else { root.BRETT = root.BRETT || {}; root.BRETT.SchachKI = f(root.BRETT.Schach); }
})(typeof self !== 'undefined' ? self : this, function (S) {
  const WERT = [0, 100, 320, 330, 500, 900, 0];
  const MATT = 30000;
  // Feldtabellen (aus Sicht Weiß, oben = 8. Reihe), „Simplified Evaluation Function“
  const T = {
    1: [0, 0, 0, 0, 0, 0, 0, 0, 50, 50, 50, 50, 50, 50, 50, 50, 10, 10, 20, 30, 30, 20, 10, 10, 5, 5, 10, 25, 25, 10, 5, 5, 0, 0, 0, 20, 20, 0, 0, 0, 5, -5, -10, 0, 0, -10, -5, 5, 5, 10, 10, -20, -20, 10, 10, 5, 0, 0, 0, 0, 0, 0, 0, 0],
    2: [-50, -40, -30, -30, -30, -30, -40, -50, -40, -20, 0, 0, 0, 0, -20, -40, -30, 0, 10, 15, 15, 10, 0, -30, -30, 5, 15, 20, 20, 15, 5, -30, -30, 0, 15, 20, 20, 15, 0, -30, -30, 5, 10, 15, 15, 10, 5, -30, -40, -20, 0, 5, 5, 0, -20, -40, -50, -40, -30, -30, -30, -30, -40, -50],
    3: [-20, -10, -10, -10, -10, -10, -10, -20, -10, 0, 0, 0, 0, 0, 0, -10, -10, 0, 5, 10, 10, 5, 0, -10, -10, 5, 5, 10, 10, 5, 5, -10, -10, 0, 10, 10, 10, 10, 0, -10, -10, 10, 10, 10, 10, 10, 10, -10, -10, 5, 0, 0, 0, 0, 5, -10, -20, -10, -10, -10, -10, -10, -10, -20],
    4: [0, 0, 0, 0, 0, 0, 0, 0, 5, 10, 10, 10, 10, 10, 10, 5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, 0, 0, 0, 5, 5, 0, 0, 0],
    5: [-20, -10, -10, -5, -5, -10, -10, -20, -10, 0, 0, 0, 0, 0, 0, -10, -10, 0, 5, 5, 5, 5, 0, -10, -5, 0, 5, 5, 5, 5, 0, -5, 0, 0, 5, 5, 5, 5, 0, -5, -10, 5, 5, 5, 5, 5, 0, -10, -10, 0, 5, 0, 0, 0, 0, -10, -20, -10, -10, -5, -5, -10, -10, -20],
    6: [-30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30, -20, -30, -30, -40, -40, -30, -30, -20, -10, -20, -20, -20, -20, -20, -20, -10, 20, 20, 0, 0, 0, 0, 20, 20, 20, 30, 10, 0, 0, 10, 30, 20],
  };
  const KOENIG_ENDE = [-50, -40, -30, -20, -20, -30, -40, -50, -30, -20, -10, 0, 0, -10, -20, -30, -30, -10, 20, 30, 30, 20, -10, -30, -30, -10, 30, 40, 40, 30, -10, -30,
    -30, -10, 30, 40, 40, 30, -10, -30, -30, -10, 20, 30, 30, 20, -10, -30, -30, -30, 0, 0, 0, 0, -30, -30, -50, -30, -30, -30, -30, -30, -30, -50];

  /** Bewertung aus Sicht des Spielers am Zug (Zentibauern). */
  function bewerten(s) {
    const b = s.b;
    let sc = 0, schwer = 0;
    for (let sq = 0; sq < 64; sq++) { const v = b[sq]; if (v) { const a = Math.abs(v); if (a > 1 && a < 6) schwer += WERT[a]; } }
    const ende = schwer <= 2600;
    for (let sq = 0; sq < 64; sq++) {
      const v = b[sq];
      if (!v) continue;
      const a = Math.abs(v), w = v > 0;
      const idx = w ? ((7 - (sq >> 3)) << 3) + (sq & 7) : sq;
      const pst = a === 6 ? (ende ? KOENIG_ENDE[idx] : T[6][idx]) : T[a][idx];
      const x = WERT[a] + pst;
      sc += w ? x : -x;
    }
    return s.turn === 1 ? sc : -sc;
  }

  function sortiert(s, zuege) {
    const b = s.b, sc = zuege.map(m => {
      const ziel = Math.abs(b[(m >> 6) & 63]), fig = Math.abs(b[m & 63]);
      let w = 0;
      if (ziel) w = 10 * WERT[ziel] - WERT[fig] + 10000;
      else if (((m >> 15) & 3) === 1) w = 10 * 100 - 100 + 10000;
      if ((m >> 12) & 7) w += 8000 + WERT[(m >> 12) & 7];
      return w;
    });
    const idx = zuege.map((_, i) => i).sort((x, y) => sc[y] - sc[x]);
    return idx.map(i => zuege[i]);
  }

  function waehle(partie, stufe, opt) {
    opt = opt || {};
    const rnd = opt.zufall || Math.random;
    const s = S.klon(partie.s);
    const alle = S.legalZuege(s);
    if (!alle.length) return null;
    const ergebnis = (m, wert, tiefe) => ({ m, text: S.zuText(m), wert, tiefe });
    if (stufe <= 1 && rnd() < 0.2) return ergebnis(alle[Math.floor(rnd() * alle.length)], 0, 0);

    const maxTiefe = stufe <= 1 ? 1 : stufe === 2 ? 3 : 6;
    const zeitMs = opt.zeitMs || (stufe >= 3 ? 2500 : stufe === 2 ? 1500 : 500);
    const ende = Date.now() + zeitMs;
    const wackeln = stufe <= 1 ? 90 : 0;
    let knoten = 0, abbruch = false;

    function ruhe(alpha, beta, pl) {
      const stand = bewerten(s);
      if (stand >= beta) return stand;
      if (stand > alpha) alpha = stand;
      if (pl >= 6) return alpha;
      const t = s.turn, ki = t === 1 ? 0 : 1;
      for (const m of sortiert(s, S.genZuege(s, true))) {
        const rg = S.machen(s, m);
        if (S.angegriffen(s.b, s.ks[ki], -t)) { S.zurueck(s, rg); continue; }
        const w = -ruhe(-beta, -alpha, pl + 1);
        S.zurueck(s, rg);
        if (w >= beta) return w;
        if (w > alpha) alpha = w;
      }
      return alpha;
    }

    function negamax(tiefe, alpha, beta, ply) {
      if ((++knoten & 1023) === 0 && Date.now() > ende) abbruch = true;
      if (abbruch) return 0;
      if (s.half >= 100) return 0;
      if (tiefe <= 0) return ruhe(alpha, beta, 0);
      const t = s.turn, ki = t === 1 ? 0 : 1;
      let beste = -Infinity, ginge = false;
      for (const m of sortiert(s, S.genZuege(s, false))) {
        const rg = S.machen(s, m);
        if (S.angegriffen(s.b, s.ks[ki], -t)) { S.zurueck(s, rg); continue; }
        ginge = true;
        const w = -negamax(tiefe - 1, -beta, -alpha, ply + 1);
        S.zurueck(s, rg);
        if (abbruch) return 0;
        if (w > beste) beste = w;
        if (beste > alpha) alpha = beste;
        if (alpha >= beta) break;
      }
      if (!ginge) return S.angegriffen(s.b, s.ks[ki], -t) ? -MATT + ply : 0;
      return beste;
    }

    let beste = ergebnis(sortiert(s, alle)[0], 0, 0);
    for (let tiefe = 1; tiefe <= maxTiefe; tiefe++) {
      let bestW = -Infinity, bestM = 0, alpha = -Infinity;
      const liste = sortiert(s, alle);
      if (beste.m) { const i = liste.indexOf(beste.m); if (i > 0) { liste.splice(i, 1); liste.unshift(beste.m); } }
      const werte = [];
      for (const m of liste) {
        const rg = S.machen(s, m);
        let w = -negamax(tiefe - 1, -Infinity, wackeln ? Infinity : -alpha, 1);
        S.zurueck(s, rg);
        if (abbruch) break;
        if (wackeln) w += Math.floor((rnd() - 0.5) * 2 * wackeln);
        werte.push([m, w]);
        if (w > bestW) { bestW = w; bestM = m; }
        if (w > alpha) alpha = w;
      }
      if (abbruch) break;                          // unfertige Tiefe verwerfen
      beste = ergebnis(bestM, bestW, tiefe);
      if (Math.abs(bestW) > MATT - 100) break;     // Matt gefunden
    }
    return beste;
  }
  return { waehle, bewerten };
});
