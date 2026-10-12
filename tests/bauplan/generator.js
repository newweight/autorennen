// Strecken-Bauplan-Generator (Hilfswerkzeug, kein Test):
//   node tests/bauplan/generator.js tests/bauplan/wald.json  → JSON { laengen, punkte } für trackCatalog.js
// Plan: [["G",l]] Gerade, [["K",r,grad]] Bogen (+ = rechts), [["G?"]] zwei Geraden, die die Runde schließen,
// [["R",r]] Restbogen bis zur Gesamtdrehung ±360°. Start (0,0) Richtung -z. Höhe y aus den Hügeln.
// + rechts. Start (0,0) Richtung -z. "R" = Restbogen bis Gesamtdrehung ±360.
// Runde 6 (W4-I, Alpen): [["Y", h]] = Höhenmarke an der aktuellen Stelle; mit "hoehenModell": "strasse" kommt y NICHT aus
// den Hügeln, sondern aus den Marken (stückweise linear in der Bogenlänge, dann gleitend über ±"glaetten" m gemittelt).
// Die Gesamtdrehung darf dann auch 0° sein (Acht mit Überführung) – die Richtung wird nicht geschlossen, nur die Lage (G?).
const fs = require('fs');
const cfg = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const plan = cfg.plan;

function laufen(laengen) {
  // gibt Punkte zurück; laengen = Werte für G? in Reihenfolge
  let x = 0, z = 0, h = 0, sl = 0;  // h: Richtung als Winkel, dir = (sin h, -cos h); rechts = +h; sl = Bogenlänge
  const pts = [[0, 0, 0]], marken = [];
  let gi = 0, summe = 0;
  const gesamt = plan.reduce((a, s) => a + (s[0] === 'K' ? s[2] : 0), 0);
  for (const s of plan) {
    let typ = s[0];
    if (typ === 'Y') { marken.push([sl, s[1]]); continue; }
    if (typ === 'G' || typ === 'G?') {
      const l = typ === 'G' ? s[1] : laengen[gi++];
      const n = Math.max(1, Math.ceil(Math.abs(l) / (cfg.hoehenModell === 'strasse' ? 30 : 35)));
      for (let k = 1; k <= n; k++) pts.push([x + Math.sin(h) * l * k / n, z - Math.cos(h) * l * k / n, sl + l * k / n]);
      x += Math.sin(h) * l; z -= Math.cos(h) * l; sl += l;
    } else {
      let r = s[1], grad = typ === 'K' ? s[2] : ((Math.sign(gesamt) || 1) * 360 - gesamt);
      if (typ === 'R' && Math.abs(grad) > 300) grad = grad - Math.sign(grad) * 360;
      const a = grad * Math.PI / 180, bogen = Math.abs(a) * r;
      const n = Math.max(2, Math.ceil(bogen / (cfg.hoehenModell === 'strasse' ? 9 : 10)));
      const sg = Math.sign(a);
      // Mittelpunkt rechts (sg>0) oder links
      const cx = x + Math.cos(h) * r * sg, cz = z + Math.sin(h) * r * sg;
      for (let k = 1; k <= n; k++) {
        const hk = h + a * k / n;
        pts.push([cx - Math.cos(hk) * r * sg, cz - Math.sin(hk) * r * sg, sl + bogen * k / n]);
      }
      h += a; x = pts[pts.length - 1][0]; z = pts[pts.length - 1][1]; sl += bogen;
      summe += grad;
    }
  }
  return { pts, x, z, h, sl, marken };
}
const anzahlFrei = plan.filter(s => s[0] === 'G?').length;
let laengen = [];
if (anzahlFrei === 2) {
  const e0 = laufen([0, 0]), e1 = laufen([1, 0]), e2 = laufen([0, 1]);
  const a = [e1.x - e0.x, e1.z - e0.z], b = [e2.x - e0.x, e2.z - e0.z];
  const det = a[0] * b[1] - a[1] * b[0];
  const l1 = (-e0.x * b[1] + e0.z * b[0]) / det, l2 = (a[0] * -e0.z - a[1] * -e0.x) / det;
  laengen = [l1, l2];
}
const erg = laufen(laengen);
let pts = erg.pts;
// letzter Punkt == erster -> weg
if (Math.hypot(pts[pts.length - 1][0], pts[pts.length - 1][1]) < 0.5) pts.pop();
// Runde 4: "skalierung": { faktor, mitte: [x, z] } → Punkte und Hügel (x, z, r) um die Mitte skalieren
// (Wald ×1,25, Wüste ×1,45; Mitte = Schwerpunkt der Kontrollpunkte vor dem Skalieren). Höhen h bleiben.
let huegel = cfg.huegel || [];
if (cfg.skalierung) {
  const f = cfg.skalierung.faktor, [mx, mz] = cfg.skalierung.mitte;
  pts = pts.map(([x, z]) => [mx + f * (x - mx), mz + f * (z - mz)]);
  huegel = huegel.map(g => ({ x: mx + f * (g.x - mx), z: mz + f * (g.z - mz), r: g.r * f, h: g.h }));
}
const hoehe = (x, z) => huegel.reduce((s, g) => s + g.h * Math.exp(-((x - g.x) ** 2 + (z - g.z) ** 2) / (2 * g.r * g.r)), 0);
const r1 = v => Math.round(v * 10) / 10, r2 = v => Math.round(v * 100) / 100;
let hoeheBei = (x, z) => hoehe(r1(x), r1(z));
if (cfg.hoehenModell === 'strasse') {
  // W4-I: Höhe aus den Marken (periodisch), gleitender Mittelwert über ±glaetten m
  const L = erg.sl, ms = erg.marken.concat([[erg.marken[0][0] + L, erg.marken[0][1]]]);
  const linear = (s) => { for (let i = 0; i < ms.length - 1; i++) if (s >= ms[i][0] && s <= ms[i + 1][0]) return ms[i][1] + (ms[i + 1][1] - ms[i][1]) * (s - ms[i][0]) / (ms[i + 1][0] - ms[i][0]); return ms[0][1]; };
  const GL = cfg.glaetten || 30;
  const glatt = (s) => { let sum = 0, n = 0; for (let d = -GL; d <= GL; d += 2) { sum += linear(((s + d) % L + L) % L); n++; } return sum / n; };
  const sVon = new Map(erg.pts.map(p => [p[0] + ',' + p[1], p[2]]));
  hoeheBei = (x, z) => glatt(sVon.get(x + ',' + z));
}
const punkte = pts.map(([x, z]) => [r1(x), r2(hoeheBei(x, z)), r1(z)]);
const endH = erg.h * 180 / Math.PI;
console.log(JSON.stringify({ laengen: laengen.map(r1), endWinkel: r1(endH), schluss: [r1(erg.x), r1(erg.z)],
  huegel: cfg.skalierung ? huegel.map(g => ({ x: r1(g.x), z: r1(g.z), r: r1(g.r), h: g.h })) : undefined, punkte }));
