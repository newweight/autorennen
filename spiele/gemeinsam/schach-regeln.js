// ============================================================
// Schach – vollständige Regeln (UMD: Browser window.BRETT.Schach, Server/Tests require).
// Rochade, en passant, Umwandlung, Schach/Matt/Patt, 50-Züge-Regel, dreifache Wiederholung, unzureichendes Material.
//
// Felder 0..63: feld = reihe*8 + linie, reihe 0 = 1. Reihe (Weiß unten), linie 0 = a-Linie. "e2" = 12.
// Figuren: 1 Bauer, 2 Springer, 3 Läufer, 4 Turm, 5 Dame, 6 König; Weiß positiv, Schwarz negativ. Farbe: 1 = Weiß, -1 = Schwarz.
// Zug = Ganzzahl: von | nach << 6 | umwandlung << 12 (2..5) | flag << 15 (1 en passant, 2 Rochade, 3 Doppelschritt).
// Stellung: { b: Int8Array(64), turn, castle (1 WK, 2 WD, 4 SK, 8 SD), ep (Feld oder -1), half, full, ks: [Weiß-König, Schwarz-König] }
// Partie (Klasse): ganze Partie mit Zugliste, Rückgängig, Status.
// Zug-Text ("UCI"): "e2e4", "e7e8q".
// ============================================================
(function (root, f) {
  if (typeof module === 'object' && module.exports) module.exports = f();
  else { root.BRETT = root.BRETT || {}; root.BRETT.Schach = f(); }
})(typeof self !== 'undefined' ? self : this, function () {
  const P = 1, N = 2, B = 3, R = 4, Q = 5, K = 6;
  const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

  // ---- Tabellen ----
  const KN = [], KG = [], RAYS = [], PAWN_FROM = [[], []];
  const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];   // [dReihe, dLinie]: 0-3 Turm, 4-7 Läufer
  for (let sq = 0; sq < 64; sq++) {
    const r = sq >> 3, l = sq & 7;
    KN[sq] = []; KG[sq] = []; RAYS[sq] = [];
    for (const [dr, dl] of [[2, 1], [2, -1], [-2, 1], [-2, -1], [1, 2], [1, -2], [-1, 2], [-1, -2]]) {
      const rr = r + dr, ll = l + dl; if (rr >= 0 && rr < 8 && ll >= 0 && ll < 8) KN[sq].push(rr * 8 + ll);
    }
    for (const [dr, dl] of DIRS) {
      const rr = r + dr, ll = l + dl; if (rr >= 0 && rr < 8 && ll >= 0 && ll < 8) KG[sq].push(rr * 8 + ll);
      const ray = []; let r2 = rr, l2 = ll;
      while (r2 >= 0 && r2 < 8 && l2 >= 0 && l2 < 8) { ray.push(r2 * 8 + l2); r2 += dr; l2 += dl; }
      RAYS[sq].push(ray);
    }
    // Felder, von denen aus ein weißer (0) / schwarzer (1) Bauer dieses Feld schlägt
    PAWN_FROM[0][sq] = []; PAWN_FROM[1][sq] = [];
    for (const dl of [-1, 1]) {
      if (l + dl < 0 || l + dl > 7) continue;
      if (r - 1 >= 0) PAWN_FROM[0][sq].push((r - 1) * 8 + l + dl);
      if (r + 1 < 8) PAWN_FROM[1][sq].push((r + 1) * 8 + l + dl);
    }
  }
  const MASK = new Int8Array(64).fill(15);
  MASK[0] = 15 & ~2; MASK[7] = 15 & ~1; MASK[4] = 15 & ~3; MASK[56] = 15 & ~8; MASK[63] = 15 & ~4; MASK[60] = 15 & ~12;

  const feldName = (sq) => 'abcdefgh'[sq & 7] + (1 + (sq >> 3));
  const feldAus = (t) => { const l = 'abcdefgh'.indexOf(t[0]), r = '12345678'.indexOf(t[1]); return l < 0 || r < 0 ? -1 : r * 8 + l; };
  const von = (m) => m & 63, nach = (m) => (m >> 6) & 63, umw = (m) => (m >> 12) & 7, flag = (m) => (m >> 15) & 3;
  const zug = (v, n, u, f) => v | (n << 6) | ((u || 0) << 12) | ((f || 0) << 15);
  const PCH = { 2: 'n', 3: 'b', 4: 'r', 5: 'q' };
  function zuText(m) { return feldName(von(m)) + feldName(nach(m)) + (umw(m) ? PCH[umw(m)] : ''); }

  // ---- Stellung ----
  function leer() { return { b: new Int8Array(64), turn: 1, castle: 0, ep: -1, half: 0, full: 1, ks: [4, 60] }; }
  function klon(s) { return { b: Int8Array.from(s.b), turn: s.turn, castle: s.castle, ep: s.ep, half: s.half, full: s.full, ks: [s.ks[0], s.ks[1]] }; }

  function ausFen(fen) {
    const t = String(fen).trim().split(/\s+/), s = leer();
    const zeilen = t[0].split('/');
    if (zeilen.length !== 8) throw new Error('FEN: 8 Reihen erwartet');
    const bild = { p: 1, n: 2, b: 3, r: 4, q: 5, k: 6 };
    for (let i = 0; i < 8; i++) {
      let l = 0; const r = 7 - i;
      for (const ch of zeilen[i]) {
        if (/\d/.test(ch)) l += +ch;
        else { const w = bild[ch.toLowerCase()]; if (!w) throw new Error('FEN: Figur ' + ch); s.b[r * 8 + l] = ch === ch.toLowerCase() ? -w : w; if (w === K) s.ks[ch === ch.toLowerCase() ? 1 : 0] = r * 8 + l; l++; }
      }
    }
    s.turn = (t[1] || 'w') === 'b' ? -1 : 1;
    const c = t[2] || '-'; s.castle = (c.includes('K') ? 1 : 0) | (c.includes('Q') ? 2 : 0) | (c.includes('k') ? 4 : 0) | (c.includes('q') ? 8 : 0);
    s.ep = t[3] && t[3] !== '-' ? feldAus(t[3]) : -1;
    s.half = +(t[4] || 0); s.full = +(t[5] || 1);
    return s;
  }
  function zuFen(s) {
    let o = '';
    for (let r = 7; r >= 0; r--) {
      let n = 0;
      for (let l = 0; l < 8; l++) {
        const v = s.b[r * 8 + l];
        if (!v) { n++; continue; }
        if (n) { o += n; n = 0; }
        const ch = ' pnbrqk'[Math.abs(v)]; o += v > 0 ? ch.toUpperCase() : ch;
      }
      if (n) o += n;
      if (r) o += '/';
    }
    const c = (s.castle & 1 ? 'K' : '') + (s.castle & 2 ? 'Q' : '') + (s.castle & 4 ? 'k' : '') + (s.castle & 8 ? 'q' : '');
    return o + ' ' + (s.turn === 1 ? 'w' : 'b') + ' ' + (c || '-') + ' ' + (s.ep >= 0 ? feldName(s.ep) : '-') + ' ' + s.half + ' ' + s.full;
  }

  /** Greift `farbe` das Feld sq an? */
  function angegriffen(b, sq, farbe) {
    for (const f of PAWN_FROM[farbe === 1 ? 0 : 1][sq]) if (b[f] === farbe * P) return true;
    for (const f of KN[sq]) if (b[f] === farbe * N) return true;
    for (const f of KG[sq]) if (b[f] === farbe * K) return true;
    const rays = RAYS[sq];
    for (let d = 0; d < 8; d++) {
      const ray = rays[d];
      for (let i = 0; i < ray.length; i++) {
        const v = b[ray[i]];
        if (!v) continue;
        if (v * farbe > 0) { const a = Math.abs(v); if (a === Q || (d < 4 ? a === R : a === B)) return true; }
        break;
      }
    }
    return false;
  }
  const imSchach = (s) => angegriffen(s.b, s.ks[s.turn === 1 ? 0 : 1], -s.turn);

  /** Pseudolegale Züge (König kann im Schach stehen bleiben – legalZuege filtert). nurSchlag: nur Schlagzüge/Umwandlungen (für die KI). */
  function genZuege(s, nurSchlag) {
    const out = [], b = s.b, t = s.turn;
    for (let sq = 0; sq < 64; sq++) {
      const v = b[sq];
      if (!v || v * t < 0) continue;
      const a = v * t;
      const r = sq >> 3;
      if (a === P) {
        const vor = sq + 8 * t, letzte = t === 1 ? 6 : 1, startR = t === 1 ? 1 : 6;
        const l = sq & 7;
        if (!b[vor] && (!nurSchlag || r === letzte)) {
          if (r === letzte) for (let u = Q; u >= N; u--) out.push(zug(sq, vor, u, 0));
          else {
            out.push(zug(sq, vor, 0, 0));
            if (r === startR && !b[vor + 8 * t]) out.push(zug(sq, vor + 8 * t, 0, 3));
          }
        }
        for (const dl of [-1, 1]) {
          if (l + dl < 0 || l + dl > 7) continue;
          const z = vor + dl;
          if (b[z] * t < 0) {
            if (r === letzte) for (let u = Q; u >= N; u--) out.push(zug(sq, z, u, 0));
            else out.push(zug(sq, z, 0, 0));
          } else if (z === s.ep) out.push(zug(sq, z, 0, 1));
        }
      } else if (a === N || a === K) {
        for (const z of (a === N ? KN[sq] : KG[sq])) { const w = b[z]; if (w * t <= 0 && (!nurSchlag || w)) out.push(zug(sq, z, 0, 0)); }
        if (a === K && !nurSchlag) {
          const heim = t === 1 ? 0 : 56;
          if (sq === heim + 4 && !angegriffen(b, sq, -t)) {
            if ((s.castle & (t === 1 ? 1 : 4)) && !b[heim + 5] && !b[heim + 6] && b[heim + 7] === t * R &&
              !angegriffen(b, heim + 5, -t) && !angegriffen(b, heim + 6, -t)) out.push(zug(sq, heim + 6, 0, 2));
            if ((s.castle & (t === 1 ? 2 : 8)) && !b[heim + 3] && !b[heim + 2] && !b[heim + 1] && b[heim] === t * R &&
              !angegriffen(b, heim + 3, -t) && !angegriffen(b, heim + 2, -t)) out.push(zug(sq, heim + 2, 0, 2));
          }
        }
      } else {
        const d0 = a === B ? 4 : 0, d1 = a === R ? 4 : 8;
        for (let d = d0; d < d1; d++) {
          for (const z of RAYS[sq][d]) {
            const w = b[z];
            if (!w) { if (!nurSchlag) out.push(zug(sq, z, 0, 0)); continue; }
            if (w * t < 0) out.push(zug(sq, z, 0, 0));
            break;
          }
        }
      }
    }
    return out;
  }

  /** Zug ausführen; liefert Rückgängig-Daten für zurueck(). */
  function machen(s, m) {
    const b = s.b, v = von(m), n = nach(m), u = umw(m), fl = flag(m), t = s.turn, pc = b[v];
    const rg = { m, pc, cap: 0, castle: s.castle, ep: s.ep, half: s.half, full: s.full, ks0: s.ks[0], ks1: s.ks[1] };
    if (fl === 1) { const cs = n - 8 * t; rg.cap = b[cs]; b[cs] = 0; } else rg.cap = b[n];
    b[n] = u ? t * u : pc; b[v] = 0;
    if (fl === 2) {
      if (n > v) { b[v + 1] = b[v + 3]; b[v + 3] = 0; } else { b[v - 1] = b[v - 4]; b[v - 4] = 0; }
    }
    if (pc === t * K) s.ks[t === 1 ? 0 : 1] = n;
    s.castle &= MASK[v] & MASK[n];
    s.ep = fl === 3 ? (v + n) >> 1 : -1;
    s.half = (pc === t * P || rg.cap) ? 0 : s.half + 1;
    if (t === -1) s.full++;
    s.turn = -t;
    return rg;
  }
  function zurueck(s, rg) {
    const b = s.b, m = rg.m, v = von(m), n = nach(m), fl = flag(m);
    s.turn = -s.turn; const t = s.turn;
    b[v] = rg.pc; b[n] = 0;
    if (fl === 1) b[n - 8 * t] = rg.cap; else b[n] = rg.cap;
    if (fl === 2) {
      if (n > v) { b[v + 3] = b[v + 1]; b[v + 1] = 0; } else { b[v - 4] = b[v - 1]; b[v - 1] = 0; }
    }
    s.castle = rg.castle; s.ep = rg.ep; s.half = rg.half; s.full = rg.full; s.ks[0] = rg.ks0; s.ks[1] = rg.ks1;
  }

  /** Alle legalen Züge der Stellung. */
  function legalZuege(s) {
    const out = [], t = s.turn, ki = t === 1 ? 0 : 1;
    for (const m of genZuege(s, false)) {
      const rg = machen(s, m);
      if (!angegriffen(s.b, s.ks[ki], -t)) out.push(m);
      zurueck(s, rg);
    }
    return out;
  }

  function perft(s, tiefe) {
    if (tiefe === 0) return 1;
    const t = s.turn, ki = t === 1 ? 0 : 1;
    let n = 0;
    for (const m of genZuege(s, false)) {
      const rg = machen(s, m);
      if (!angegriffen(s.b, s.ks[ki], -t)) n += tiefe === 1 ? 1 : perft(s, tiefe - 1);
      zurueck(s, rg);
    }
    return n;
  }

  /** Zu wenig Material für ein Matt: K–K, K+L–K, K+S–K, Läufer nur auf gleichfarbigen Feldern. */
  function zuWenigMaterial(s) {
    const lauefer = [];                            // Feldfarben der Läufer
    let andere = 0;
    for (let sq = 0; sq < 64; sq++) {
      const a = Math.abs(s.b[sq]);
      if (!a || a === K) continue;
      if (a === B) lauefer.push(((sq >> 3) + (sq & 7)) & 1);
      else if (a === N) andere++;
      else return false;
    }
    if (andere === 0) return lauefer.every(c => c === lauefer[0]);
    return andere === 1 && lauefer.length === 0;
  }

  function schluessel(s) {
    let k = '';
    for (let i = 0; i < 64; i++) k += String.fromCharCode(s.b[i] + 70);
    let ep = -1;
    if (s.ep >= 0) for (const m of legalZuege(s)) if (flag(m) === 1) { ep = s.ep; break; }
    return k + (s.turn === 1 ? 'w' : 'b') + s.castle + ',' + ep;
  }

  // ---- Partie ----
  class Partie {
    constructor(fen) {
      this.s = ausFen(fen || START_FEN);
      this.startFen = zuFen(this.s);
      this.zuege = [];                 // gespielte Züge (Ganzzahlen)
      this.rg = [];                    // Rückgängig-Daten
      this.keys = [schluessel(this.s)];
      this._st = null;
    }
    get am() { return this.s.turn; }
    legale() { return legalZuege(this.s); }
    /** Legaler Zug von→nach (Umwandlung u = 2..5 oder Buchstabe), sonst null. */
    finden(v, n, u) {
      if (typeof u === 'string') u = { n: 2, b: 3, r: 4, q: 5 }[u.toLowerCase()] || 0;
      for (const m of this.legale()) if (von(m) === v && nach(m) === n && umw(m) === (u || 0)) return m;
      return null;
    }
    ausText(t) {
      const m = /^([a-h][1-8])([a-h][1-8])([qrbn])?$/.exec(String(t));
      return m ? this.finden(feldAus(m[1]), feldAus(m[2]), m[3] || 0) : null;
    }
    /** Alle legalen Ziele einer Figur (für die Anzeige), je { nach, umw: [..] , schlag }. */
    ziele(v) {
      const o = new Map();
      for (const m of this.legale()) if (von(m) === v) {
        const e = o.get(nach(m)) || { nach: nach(m), umw: [], schlag: !!this.s.b[nach(m)] || flag(m) === 1 };
        if (umw(m)) e.umw.push(umw(m));
        o.set(nach(m), e);
      }
      return [...o.values()];
    }
    ziehen(m) {
      if (this.status().ende) return false;
      if (!this.legale().includes(m)) return false;
      this.rg.push(machen(this.s, m));
      this.zuege.push(m);
      this.keys.push(schluessel(this.s));
      this._st = null;
      return true;
    }
    rueckgaengig() {
      if (!this.zuege.length) return false;
      zurueck(this.s, this.rg.pop());
      this.zuege.pop(); this.keys.pop(); this._st = null;
      return true;
    }
    /** { ende: null | 'matt'|'patt'|'fuenfzig'|'wiederholung'|'material', sieger: 1|-1|0|null, schach: bool } */
    status() {
      if (this._st) return this._st;
      const s = this.s, schach = imSchach(s);
      let ende = null, sieger = null;
      if (!legalZuege(s).length) { if (schach) { ende = 'matt'; sieger = -s.turn; } else { ende = 'patt'; sieger = 0; } }
      else if (zuWenigMaterial(s)) { ende = 'material'; sieger = 0; }
      else if (s.half >= 100) { ende = 'fuenfzig'; sieger = 0; }
      else {
        const k = this.keys[this.keys.length - 1];
        if (this.keys.filter(x => x === k).length >= 3) { ende = 'wiederholung'; sieger = 0; }
      }
      return (this._st = { ende, sieger, schach });
    }
    textListe() { return this.zuege.map(zuText); }
    static ausTexten(liste, fen) {
      const p = new Partie(fen);
      for (const t of liste) { const m = p.ausText(t); if (!m || !p.ziehen(m)) return null; }
      return p;
    }
  }

  return { P, N, B, R, Q, K, START_FEN, feldName, feldAus, von, nach, umw, flag, zug, zuText, ausFen, zuFen, klon, angegriffen, imSchach, genZuege,
    machen, zurueck, legalZuege, perft, zuWenigMaterial, schluessel, Partie };
});
