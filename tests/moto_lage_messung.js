// Messung Schräglage ALT gegen NEU (Node, ohne Browser): node tests/moto_lage_messung.js
// Simuliert Fahrten mit Lenk-Zittern und Bildraten-Schwankung (±20 % dt-Jitter), je 30 und 60 fps, Mittel über 5 Zufallsläufe.
// Annahme: Physik tickt fest mit 60 Hz, die Anzeige liest je Bild das letzte Heading (ohne Interpolation) → Bildraten-Aliasing wie im Spiel.
// Referenz (Soll-Lage) = atan(v·Gierrate_ohne_Zittern/g). Ausgabe: Tabelle + tests/moto_lage_messung.json
const fs = require('fs'), path = require('path');
const { ladeModule } = require('./lade');
const R = ladeModule(['tests/moto_flag.js', 'src/moto/schraeglage.js']);
const S = R.Moto.schraeglage;
const G = 9.81, RAD = 180 / Math.PI;

// ---- ALTE Logik (Kopie aus Commit 430b219, src/moto/schraeglage.js): Gierrate je Bild, exponentiell τ = 0,12 s, Deckel 45° ----
const ALT = {
  zustand: () => ({ lean: 0, heading: null }),
  schritt(z, e) {
    const dt = e.dt; if (!(dt > 0)) return z.lean;
    let w = 0;
    if (dt > 1e-4 && z.heading !== null) { let d = e.heading - z.heading; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; w = Math.abs(d) > 1 ? 0 : Math.max(-8, Math.min(8, d / dt)); }
    z.heading = e.heading;
    const ziel = e.v > 0 ? Math.max(-Math.PI / 4, Math.min(Math.PI / 4, Math.atan(e.v * w / G))) : 0;
    z.lean += (ziel - z.lean) * (1 - Math.exp(-dt / 0.12));
    return z.lean;
  },
};
const NEU = { zustand: S.zustand, schritt: S.bildSchritt };

// ---- Zufall, Szenarien ----
function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
const SZEN = {
  slalom: { v: 15, dauer: 20, omega: (t) => 0.45 * Math.sin(2 * Math.PI * t / 4) },
  kreisfahrt: { v: 25, dauer: 24, omega: (t) => { const p = t % 12, rampe = (a) => Math.max(0, Math.min(1, a / 0.6)); const vz = Math.floor(t / 12) % 2 ? -1 : 1; return vz * 0.25 * Math.min(rampe(p - 1), 1 - rampe(p - 6.4)) * (p > 1 && p < 7 ? 1 : 0); } },
  impulse: { v: 15, dauer: 24, omega: (t) => { const p = t % 3, k = Math.floor(t / 3) % 2 ? -1 : 1; return p > 0.5 && p < 0.8 ? k * 0.3 * Math.sin(Math.PI * (p - 0.5) / 0.3) : 0; } },
};
// Gierrate mit Lenk-Zittern: 7 Hz + 11,3 Hz + tiefpassgefiltertes Rauschen (≈ 5 % der Gierrate + Grundzittern)
function bahn(sz, seed) {
  const r = rng(seed), h = 1 / 1000, n = Math.round(sz.dauer / h), ph1 = r() * 6.28, ph2 = r() * 6.28;
  let rausch = 0; const head = new Float64Array(n + 1), soll = new Float64Array(n + 1); let hd = 0;
  for (let i = 0; i <= n; i++) {
    const t = i * h; rausch += (r() * 2 - 1 - rausch) * 0.02;
    const zit = 0.04 * Math.sin(2 * Math.PI * 7 * t + ph1) + 0.03 * Math.sin(2 * Math.PI * 11.3 * t + ph2) + 0.12 * rausch + 0.08 * Math.abs(sz.omega(t)) * Math.sin(2 * Math.PI * 5 * t + ph1);
    const w = sz.omega(t); hd += (w + zit) * h; head[i] = hd; soll[i] = Math.atan(sz.v * w / G);
  }
  return { head, soll, h, n };
}
function messen(logik, sz, fps, seed) {
  const b = bahn(sz, seed), r = rng(seed * 7 + fps), z = logik.zustand();
  const T = [], L = [], SO = [];
  let t = 0;
  while (t < sz.dauer - 0.5) {
    const dt = (1 / fps) * (1 + (r() * 2 - 1) * 0.2); t += dt;
    const tick = Math.floor(t * 60) / 60, hd = b.head[Math.min(b.n, Math.round(tick / b.h))];   // Physik-Heading (60 Hz getaktet)
    const lean = logik.schritt(z, { heading: hd, v: sz.v, dt });
    T.push(t); L.push(lean); SO.push(b.soll[Math.min(b.n, Math.round(t / b.h))]);
  }
  // Ableitungen je Bild (so sieht es der Spieler)
  const om = [], al = [], ru = [];
  for (let i = 1; i < T.length; i++) om.push((L[i] - L[i - 1]) / (T[i] - T[i - 1]));
  for (let i = 1; i < om.length; i++) al.push((om[i] - om[i - 1]) / (T[i + 1] - T[i]));
  for (let i = 1; i < al.length; i++) ru.push((al[i] - al[i - 1]) / (T[i + 2] - T[i + 1]));
  const max = (a) => a.reduce((m, x) => Math.max(m, Math.abs(x)), 0), rms = (a) => Math.sqrt(a.reduce((s, x) => s + x * x, 0) / a.length);
  // Verzögerung = Zeitversatz, bei dem die Lage am besten zur Soll-Lage passt (Interpolation der Soll-Kurve)
  const sollBei = (tt) => { const i = Math.max(0, Math.min(b.n, Math.round(tt / b.h))); return b.soll[i]; };
  let best = 0, bestE = Infinity;
  for (let ms = 0; ms <= 600; ms += 5) { let e = 0; for (let i = 0; i < T.length; i++) { const d = L[i] - sollBei(T[i] - ms / 1000); e += d * d; } if (e < bestE) { bestE = e; best = ms; } }
  return { maxWinkelgeschw: max(om) * RAD, maxWinkelbeschl: max(al) * RAD, ruckRms: rms(ru) * RAD, verzoegerungMs: best, maxLage: max(L) * RAD, sollMax: max(SO) * RAD };
}
const SEEDS = [1, 2, 3, 4, 5], erg = [];
for (const [name, sz] of Object.entries(SZEN)) for (const fps of [30, 60]) {
  const zeile = { szenario: name, fps };
  for (const [ln, lg] of [['alt', ALT], ['neu', NEU]]) {
    const m = SEEDS.map((s) => messen(lg, sz, fps, s)), mit = {};
    for (const k of Object.keys(m[0])) mit[k] = +(m.reduce((s, x) => s + x[k], 0) / m.length).toFixed(1);
    zeile[ln] = mit;
  }
  zeile.ruckFaktor = +(zeile.alt.ruckRms / zeile.neu.ruckRms).toFixed(1);
  erg.push(zeile);
}
const f = (x, n) => String(x).padStart(n);
console.log('Schräglage ALT → NEU (Mittel über 5 Läufe, ±20 % dt-Jitter, Lenk-Zittern)');
console.log('Szenario    fps | Beschl °/s² alt→neu | Geschw °/s alt→neu | Ruck-RMS °/s³ alt→neu (Faktor) | Verzög. ms alt→neu | max Lage ° alt→neu (Soll)');
for (const z of erg) console.log(`${z.szenario.padEnd(11)} ${f(z.fps, 3)} | ${f(z.alt.maxWinkelbeschl, 8)} → ${f(z.neu.maxWinkelbeschl, 6)} | ${f(z.alt.maxWinkelgeschw, 7)} → ${f(z.neu.maxWinkelgeschw, 6)} | ${f(z.alt.ruckRms, 9)} → ${f(z.neu.ruckRms, 7)} (${z.ruckFaktor}x) | ${f(z.alt.verzoegerungMs, 4)} → ${f(z.neu.verzoegerungMs, 4)} | ${f(z.alt.maxLage, 5)} → ${f(z.neu.maxLage, 5)} (${z.alt.sollMax})`);
const minFaktor = Math.min(...erg.map((z) => z.ruckFaktor)), maxVerz = Math.max(...erg.map((z) => z.neu.verzoegerungMs));
const lageOk = erg.filter((z) => z.szenario !== 'impulse').every((z) => z.neu.maxLage >= z.alt.maxLage * 0.85);
console.log(`\nKleinster Ruck-Faktor: ${minFaktor}x (Ziel ≥ 3x) ${minFaktor >= 3 ? 'OK' : 'FEHL'} | größte Verzögerung NEU: ${maxVerz} ms (Ziel ≤ 250) ${maxVerz <= 250 ? 'OK' : 'FEHL'} | max. Lage in Kurven ≥ 85 % von alt: ${lageOk ? 'OK' : 'FEHL'}`);
fs.writeFileSync(path.join(__dirname, 'moto_lage_messung.json'), JSON.stringify({ erstellt: new Date().toISOString().slice(0, 10), annahmen: 'Physik 60 Hz, Anzeige liest letztes Heading; dt-Jitter ±20 %; 5 Läufe gemittelt', ergebnisse: erg }, null, 1));
process.exitCode = (minFaktor >= 3 && maxVerz <= 250 && lageOk) ? 0 : 1;
