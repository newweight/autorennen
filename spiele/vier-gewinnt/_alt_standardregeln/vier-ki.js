// ============================================================
// 4 gewinnt – Computergegner (UMD): Minimax mit Alpha-Beta. Stufe 1 leicht (Tiefe 2, oft Zufallszug), 2 mittel (Tiefe 4), 3 schwer (Tiefe 7).
//   BRETT.VierKI.waehle(zustand, stufe, zufall?) → Spalte
// ============================================================
(function (root, f) {
  if (typeof module === 'object' && module.exports) module.exports = f(require('./vier-regeln.js'));
  else { root.BRETT = root.BRETT || {}; root.BRETT.VierKI = f(root.BRETT.Vier); }
})(typeof self !== 'undefined' ? self : this, function (V) {
  const SP = V.SP, ZE = V.ZE;
  const TIEFE = { 1: 2, 2: 4, 3: 7 };
  const REIHENFOLGE = [3, 2, 4, 1, 5, 0, 6];
  const FENSTER = [];                      // alle 69 Vierer-Fenster als Indexlisten
  for (let z = 0; z < ZE; z++) for (let s = 0; s < SP; s++) for (const [dz, ds] of [[0, 1], [1, 0], [1, 1], [1, -1]]) {
    const w = [];
    for (let k = 0; k < 4; k++) { const zz = z + dz * k, ss = s + ds * k; if (zz < 0 || zz >= ZE || ss < 0 || ss >= SP) { w.length = 0; break; } w.push(zz * SP + ss); }
    if (w.length === 4) FENSTER.push(w);
  }

  /** Bewertung aus Sicht von `ich` (positiv = gut für ich). */
  function bewerten(st, ich) {
    const b = st.b, du = 3 - ich;
    let sc = 0;
    for (let z = 0; z < ZE; z++) { const v = b[z * SP + 3]; if (v === ich) sc += 3; else if (v === du) sc -= 3; }
    for (const w of FENSTER) {
      let a = 0, c = 0;
      for (let k = 0; k < 4; k++) { const v = b[w[k]]; if (v === ich) a++; else if (v === du) c++; }
      if (a && c) continue;
      if (a === 3) sc += 6; else if (a === 2) sc += 2;
      if (c === 3) sc -= 7; else if (c === 2) sc -= 2;
    }
    return sc;
  }

  function suche(st, tiefe, alpha, beta) {
    if (st.ende) return st.ende.sieger === 0 ? 0 : -(100000 + tiefe);        // der letzte Zieher hat gewonnen → schlecht für den, der dran ist
    if (tiefe === 0) return bewerten(st, st.am);
    let best = -Infinity;
    for (const s of REIHENFOLGE) {
      if (st.h[s] >= ZE) continue;
      V.ziehen(st, s);
      const w = -suche(st, tiefe - 1, -beta, -alpha);
      V.zurueck(st);
      if (w > best) best = w;
      if (best > alpha) alpha = best;
      if (alpha >= beta) break;
    }
    return best;
  }

  function waehle(st, stufe, zufall) {
    const rnd = zufall || Math.random;
    const frei = REIHENFOLGE.filter(s => V.erlaubt(st, s));
    if (!frei.length) return -1;
    if (stufe <= 1 && rnd() < 0.3) return frei[Math.floor(rnd() * frei.length)];
    const tiefe = TIEFE[stufe] || 4;
    let besteW = -Infinity, beste = [];
    for (const s of frei) {
      V.ziehen(st, s);
      const w = -suche(st, tiefe - 1, -Infinity, Infinity);
      V.zurueck(st);
      if (w > besteW) { besteW = w; beste = [s]; } else if (w === besteW) beste.push(s);
    }
    return beste[Math.floor(rnd() * beste.length)];
  }
  return { waehle, bewerten, TIEFE };
});
