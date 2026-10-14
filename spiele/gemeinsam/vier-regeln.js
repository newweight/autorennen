// ============================================================
// 4 gewinnt – Regeln (UMD: Browser window.BRETT.Vier, Server/Tests require).
// Brett 7 Spalten × 6 Zeilen. b[zeile*7 + spalte], zeile 0 = unten. Spieler 1 (Rot) beginnt, Spieler 2 (Gelb).
// Zustand: { b, h (Steine je Spalte), zug (Liste der Spalten), am (1|2), ende (null | { sieger: 0|1|2, reihe: [Indizes]|null }) }
// ============================================================
(function (root, f) {
  if (typeof module === 'object' && module.exports) module.exports = f();
  else { root.BRETT = root.BRETT || {}; root.BRETT.Vier = f(); }
})(typeof self !== 'undefined' ? self : this, function () {
  const SP = 7, ZE = 6;
  const RICHT = [[1, 0], [0, 1], [1, 1], [1, -1]];

  function neu() { return { b: new Int8Array(SP * ZE), h: new Int8Array(SP), zug: [], am: 1, ende: null }; }
  function erlaubt(st, s) { return Number.isInteger(s) && s >= 0 && s < SP && st.h[s] < ZE && !st.ende; }

  /** Alle zusammenhängenden Steine (≥ 4) durch (z,s) in einer Richtung, sonst null. */
  function gewinnReihe(b, z, s, spieler) {
    for (const [dz, ds] of RICHT) {
      const reihe = [z * SP + s];
      for (const sign of [1, -1]) {
        let zz = z + dz * sign, ss = s + ds * sign;
        while (zz >= 0 && zz < ZE && ss >= 0 && ss < SP && b[zz * SP + ss] === spieler) { reihe.push(zz * SP + ss); zz += dz * sign; ss += ds * sign; }
      }
      if (reihe.length >= 4) return reihe;
    }
    return null;
  }

  /** Stein in Spalte s werfen. → { zeile, spalte } oder null (nicht erlaubt). */
  function ziehen(st, s) {
    if (!erlaubt(st, s)) return null;
    const z = st.h[s]++;
    st.b[z * SP + s] = st.am;
    st.zug.push(s);
    const reihe = gewinnReihe(st.b, z, s, st.am);
    if (reihe) st.ende = { sieger: st.am, reihe };
    else if (st.zug.length === SP * ZE) st.ende = { sieger: 0, reihe: null };
    st.am = 3 - st.am;
    return { zeile: z, spalte: s };
  }
  function zurueck(st) {
    if (!st.zug.length) return false;
    const s = st.zug.pop();
    const z = --st.h[s];
    st.b[z * SP + s] = 0;
    st.am = 3 - st.am;
    st.ende = null;
    return true;
  }
  /** Zustand aus Zugliste aufbauen; null wenn ein Zug unzulässig ist. */
  function ausZuegen(liste) {
    const st = neu();
    for (const s of liste) if (!ziehen(st, s)) return null;
    return st;
  }
  return { SP, ZE, neu, erlaubt, ziehen, zurueck, ausZuegen, gewinnReihe };
});
