// ============================================================
// W5-2: kleiner QR-Code-Erzeuger ohne Abhängigkeiten (läuft offline, auch von file://).
// Nur Byte-Modus (UTF-8), Fehlerkorrektur L/M, Versionen 1–10 (bis 213 Byte bei M – reicht für Raum-Links).
//
// Algorithmus und Tabellen nach „QR Code generator library“ von Project Nayuki
// (https://www.nayuki.io/page/qr-code-generator-library), MIT-Lizenz:
//   Copyright (c) Project Nayuki. Permission is hereby granted, free of charge, to any person obtaining a copy of
//   this software and associated documentation files, to deal in the Software without restriction, including the
//   rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, subject
//   to the condition that the above copyright notice and this permission notice shall be included in all copies or
//   substantial portions of the Software. THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND.
// Hier stark gekürzt und deutsch kommentiert.
//
//   R.QR.matrix(text, 'M')  → { groesse, dunkel(x, y) }
//   R.QR.svg(text, opt)     → SVG-Text (opt: { modul: px je Modul, rand: Module Ruhezone (4), farbe, hintergrund, stufe })
// ============================================================
(function () {
  const R = window.Rennspiel || (window.Rennspiel = {});

  // Index 0 unbenutzt; Versionen 1–10
  const ECC_JE_BLOCK = { L: [-1, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18], M: [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26] };
  const BLOECKE = { L: [-1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4], M: [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5] };
  const FORMAT = { L: 1, M: 0 };

  function rohModule(ver) {
    let n = (16 * ver + 128) * ver + 64;
    if (ver >= 2) { const a = Math.floor(ver / 7) + 2; n -= (25 * a - 10) * a - 55; if (ver >= 7) n -= 36; }
    return n;
  }
  const datenBytes = (ver, st) => Math.floor(rohModule(ver) / 8) - ECC_JE_BLOCK[st][ver] * BLOECKE[st][ver];

  // GF(256) mit Polynom 0x11D
  function mal(x, y) {
    let z = 0;
    for (let i = 7; i >= 0; i--) { z = (z << 1) ^ ((z >>> 7) * 0x11D); z ^= ((y >>> i) & 1) * x; }
    return z & 0xFF;
  }
  function rsTeiler(grad) {
    const r = new Array(grad).fill(0); r[grad - 1] = 1;
    let wurzel = 1;
    for (let i = 0; i < grad; i++) {
      for (let j = 0; j < r.length; j++) { r[j] = mal(r[j], wurzel); if (j + 1 < r.length) r[j] ^= r[j + 1]; }
      wurzel = mal(wurzel, 0x02);
    }
    return r;
  }
  function rsRest(daten, teiler) {
    const r = new Array(teiler.length).fill(0);
    for (const b of daten) {
      const f = b ^ r.shift(); r.push(0);
      teiler.forEach((c, i) => { r[i] ^= mal(c, f); });
    }
    return r;
  }

  function utf8(text) {
    if (typeof TextEncoder !== 'undefined') return Array.from(new TextEncoder().encode(text));
    const s = unescape(encodeURIComponent(text)), a = [];
    for (let i = 0; i < s.length; i++) a.push(s.charCodeAt(i));
    return a;
  }

  function matrix(text, stufe) {
    const st = stufe === 'L' ? 'L' : 'M', bytes = utf8(String(text));
    let ver = 1;
    for (; ver <= 10; ver++) if (4 + (ver < 10 ? 8 : 16) + bytes.length * 8 <= datenBytes(ver, st) * 8) break;
    if (ver > 10) throw new Error('QR: Text zu lang');
    // --- Bitstrom: Modus Byte (0100), Länge, Daten, Abschluss, Füllbytes ---
    const bits = [];
    const schreib = (wert, n) => { for (let i = n - 1; i >= 0; i--) bits.push((wert >>> i) & 1); };
    schreib(4, 4); schreib(bytes.length, ver < 10 ? 8 : 16);
    bytes.forEach(b => schreib(b, 8));
    const kap = datenBytes(ver, st) * 8;
    schreib(0, Math.min(4, kap - bits.length));
    schreib(0, (8 - bits.length % 8) % 8);
    for (let p = 0xEC; bits.length < kap; p ^= 0xEC ^ 0x11) schreib(p, 8);
    const daten = [];
    for (let i = 0; i < bits.length; i += 8) { let b = 0; for (let k = 0; k < 8; k++) b = (b << 1) | bits[i + k]; daten.push(b); }
    // --- Fehlerkorrektur je Block, verschränkt ---
    const anzahl = BLOECKE[st][ver], eccLen = ECC_JE_BLOCK[st][ver], roh = Math.floor(rohModule(ver) / 8);
    const kurz = anzahl - roh % anzahl, kurzLen = Math.floor(roh / anzahl), teiler = rsTeiler(eccLen), bloecke = [];
    for (let i = 0, k = 0; i < anzahl; i++) {
      const d = daten.slice(k, k + kurzLen - eccLen + (i < kurz ? 0 : 1)); k += d.length;
      const e = rsRest(d, teiler);
      if (i < kurz) d.push(0);
      bloecke.push(d.concat(e));
    }
    const alle = [];
    for (let i = 0; i < bloecke[0].length; i++) bloecke.forEach((b, j) => { if (i !== kurzLen - eccLen || j >= kurz) alle.push(b[i]); });

    // --- Matrix: Funktionsmuster ---
    const n = ver * 4 + 17;
    const m = [], fkt = [];
    for (let y = 0; y < n; y++) { m.push(new Array(n).fill(false)); fkt.push(new Array(n).fill(false)); }
    const setz = (x, y, d) => { m[y][x] = d; fkt[y][x] = true; };
    for (let i = 0; i < n; i++) { setz(6, i, i % 2 === 0); setz(i, 6, i % 2 === 0); }
    const finder = (cx, cy) => {
      for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
        const d = Math.max(Math.abs(dx), Math.abs(dy)), x = cx + dx, y = cy + dy;
        if (x >= 0 && x < n && y >= 0 && y < n) setz(x, y, d !== 2 && d !== 4);
      }
    };
    finder(3, 3); finder(n - 4, 3); finder(3, n - 4);
    if (ver > 1) {
      const a = Math.floor(ver / 7) + 2, schritt = Math.ceil((ver * 4 + 4) / (a * 2 - 2)) * 2, pos = [6];
      for (let p = n - 7; pos.length < a; p -= schritt) pos.splice(1, 0, p);
      for (let i = 0; i < a; i++) for (let j = 0; j < a; j++) {
        if ((i === 0 && j === 0) || (i === 0 && j === a - 1) || (i === a - 1 && j === 0)) continue;
        for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) setz(pos[i] + dx, pos[j] + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
      }
    }
    const formatSetzen = (maske) => {
      const d = (FORMAT[st] << 3) | maske;
      let r = d;
      for (let i = 0; i < 10; i++) r = (r << 1) ^ ((r >>> 9) * 0x537);
      const b = ((d << 10) | r) ^ 0x5412, bit = (i) => ((b >>> i) & 1) !== 0;
      for (let i = 0; i <= 5; i++) setz(8, i, bit(i));
      setz(8, 7, bit(6)); setz(8, 8, bit(7)); setz(7, 8, bit(8));
      for (let i = 9; i < 15; i++) setz(14 - i, 8, bit(i));
      for (let i = 0; i < 8; i++) setz(n - 1 - i, 8, bit(i));
      for (let i = 8; i < 15; i++) setz(8, n - 15 + i, bit(i));
      setz(8, n - 8, true);
    };
    formatSetzen(0);
    if (ver >= 7) {
      let r = ver;
      for (let i = 0; i < 12; i++) r = (r << 1) ^ ((r >>> 11) * 0x1F25);
      const b = (ver << 12) | r;
      for (let i = 0; i < 18; i++) { const d = ((b >>> i) & 1) !== 0, a = n - 11 + i % 3, c = Math.floor(i / 3); setz(a, c, d); setz(c, a, d); }
    }
    // --- Daten im Zickzack ---
    let i = 0;
    for (let rechts = n - 1; rechts >= 1; rechts -= 2) {
      if (rechts === 6) rechts = 5;
      for (let v = 0; v < n; v++) for (let j = 0; j < 2; j++) {
        const x = rechts - j, hoch = ((rechts + 1) & 2) === 0, y = hoch ? n - 1 - v : v;
        if (!fkt[y][x] && i < alle.length * 8) { m[y][x] = ((alle[i >>> 3] >>> (7 - (i & 7))) & 1) !== 0; i++; }
      }
    }
    // --- Maske mit der kleinsten Strafe wählen ---
    const MASKEN = [
      (x, y) => (x + y) % 2 === 0, (x, y) => y % 2 === 0, (x) => x % 3 === 0, (x, y) => (x + y) % 3 === 0,
      (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0, (x, y) => (x * y) % 2 + (x * y) % 3 === 0,
      (x, y) => ((x * y) % 2 + (x * y) % 3) % 2 === 0, (x, y) => ((x + y) % 2 + (x * y) % 3) % 2 === 0,
    ];
    const anwenden = (k) => { for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (!fkt[y][x] && MASKEN[k](x, y)) m[y][x] = !m[y][x]; };
    const strafe = () => {
      let p = 0, dunkel = 0;
      const zeile = (get) => {
        let s = '';
        for (let k = 0; k < n; k++) s += get(k) ? '1' : '0';
        for (const lauf of s.match(/0{5,}|1{5,}/g) || []) p += lauf.length - 2;
        let pos = -1;
        while ((pos = s.indexOf('1011101', pos + 1)) >= 0) {
          const vor = s.slice(Math.max(0, pos - 4), pos), nach = s.slice(pos + 7, pos + 11);
          if ((pos < 4 || vor === '0000') || (pos + 11 > n || nach === '0000')) p += 40;
        }
      };
      for (let y = 0; y < n; y++) zeile((k) => m[y][k]);
      for (let x = 0; x < n; x++) zeile((k) => m[k][x]);
      for (let y = 0; y < n - 1; y++) for (let x = 0; x < n - 1; x++) {
        const c = m[y][x];
        if (c === m[y][x + 1] && c === m[y + 1][x] && c === m[y + 1][x + 1]) p += 3;
      }
      for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (m[y][x]) dunkel++;
      p += Math.floor(Math.abs(dunkel * 20 - n * n * 10) / (n * n)) * 10;
      return p;
    };
    let beste = 0, besteP = Infinity;
    for (let k = 0; k < 8; k++) {
      anwenden(k); formatSetzen(k);
      const p = strafe();
      if (p < besteP) { besteP = p; beste = k; }
      anwenden(k);           // XOR zurück
    }
    anwenden(beste); formatSetzen(beste);
    return { groesse: n, version: ver, maske: beste, dunkel: (x, y) => x >= 0 && y >= 0 && x < n && y < n && m[y][x] };
  }

  /** QR-Code als SVG-Text (eine Pfad-Fläche, scharf bei jeder Größe). */
  function svg(text, opt) {
    const o = Object.assign({ modul: 4, rand: 4, farbe: '#000', hintergrund: '#fff', stufe: 'M' }, opt);
    const q = matrix(text, o.stufe), n = q.groesse, g = n + 2 * o.rand;
    let d = '';
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (q.dunkel(x, y)) d += 'M' + (x + o.rand) + ' ' + (y + o.rand) + 'h1v1h-1z';
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + g + ' ' + g + '" width="' + g * o.modul + '" height="' + g * o.modul +
      '" shape-rendering="crispEdges"><rect width="' + g + '" height="' + g + '" fill="' + o.hintergrund + '"/><path d="' + d + '" fill="' + o.farbe + '"/></svg>';
  }

  R.QR = { matrix, svg };
})();
