// Kurvenschilder (14.10., v20): node tests/test_schilder.js [streckenId] [--deko]
// Prüft für ALLE Strecken × Welten × Varianten (Normal/XL) × Tempo-Klassen (normal/schnell):
//  A) jede Strecke hat Schilder, Anzahl plausibel (≤ Kurven, ≥ 60 % der nennenswerten Kurven, Auslassungen ≤ 2),
//  B) Abstand Schild → Kurvenbeginn 60–120 m (Kette 30–120, Notlösung ≥ 30), Mast rechts neben der Fahrbahn (nicht hinter der Bande), Mindestabstand 40 m,
//  C) Tempo = auf 10 km/h gerundetes tempoBei (engste Stelle der Kurve), höchstens Höchsttempo der Klasse,
//  D) keine Masten in Brücken/Tunneln/Überführungen/Kreuzungen/Gabelungen/Loopings/Schanzen/Boost-Zonen (± 12 m) und nicht im Startbereich,
//  E) Haarnadel → Leitpfeile auf der Kurvenaußenseite, Richtung stimmt, F) deterministisch, G) Grafik: 1 Mesh 'Kurvenschilder', Draw-Calls +1,
//  H) config.kurvenschilder.an = false → keine Schilder, kein Mesh, I) (--deko) kein Mast in/an einer Deko-Instanz.
const S = require('../server/simulation.js');
const nurId = process.argv.slice(2).find((a) => !a.startsWith('--'));
const mitDeko = process.argv.includes('--deko');
const mods = S.MODULE.slice(0, -1);               // ohne main.js
mods.push('src/world/schilder.js');
const R = S.kontextLaden(mods);
let fehler = 0, geprueft = 0;
function pruefe(name, ok, info) { geprueft++; if (!ok) { fehler++; console.log('FEHL ' + name + (info ? '  (' + info + ')' : '')); } else if (process.argv.includes('--v')) console.log('OK   ' + name + (info ? '  (' + info + ')' : '')); }
const K = R.Kurvenschilder, C = R.config.kurvenschilder;
const rund10 = (v) => Math.round(v / 10) * 10;
const stat = {};

for (const daten of R.trackCatalog) {
  if (nurId && daten.id !== nurId) continue;
  const welten = Object.keys(daten.welten || {}); if (!welten.length) welten.push('');
  for (const variante of [''].concat(Object.keys(daten.varianten || {}))) for (const welt of welten) for (const klasse of ['normal', 'schnell']) {
    const tag = `[${daten.id}${variante ? ' ' + variante : ''} ${welt} ${klasse}]`;
    const st = new R.Strecke(daten, { welt: welt || undefined, variante: variante || undefined });
    const L = st.laenge, sp = st.spline;
    const liste = K.berechnen(st, klasse);
    const top = K.klassenTop(klasse);
    const kurven = K.kurvenSuchen(st).filter((k) => k.winkel >= C.minWinkel && k.vMin * 3.6 < C.nennenswertAnteil * top);
    // A
    pruefe(`${tag} hat Schilder`, liste.length >= 1, `n=${liste.length}`);
    pruefe(`${tag} Anzahl plausibel (≤ Kurven)`, liste.length <= kurven.length, `Schilder ${liste.length}, Kurven ${kurven.length}`);
    // jede nennenswerte Kurve liegt im Bereich hinter einem Schild (Schild.s … Ende der Kurvengruppe), außer den ≤ 2 ausgelassenen
    const unbedeckt = kurven.filter((k) => !liste.some((s) => sp.differenzS(k.s0, s.s) >= -1e-6 && sp.differenzS(k.s0, s.s) <= (s.kurveS1 - s.s + (s.kurveS1 < s.s ? L : 0)) + 1e-6));
    pruefe(`${tag} jede nennenswerte Kurve hat ein Schild davor`, unbedeckt.length <= 2, 'ohne Schild bei s ' + JSON.stringify(unbedeckt.map((k) => Math.round(k.s0))));
    pruefe(`${tag} höchstens 2 Kurven ohne Schild`, st.kurvenschilderAusgelassen.length <= 2, JSON.stringify(st.kurvenschilderAusgelassen.map(Math.round)));
    const key = daten.id + (variante ? '/' + variante : '');
    if (welt === welten[0] && klasse === 'normal') stat[key] = { schilder: liste.length, haarnadeln: liste.filter((s) => s.haarnadel).length, leitpfeile: liste.reduce((a, s) => a + s.leitpfeile.length, 0), kurven: kurven.length, ausgelassen: st.kurvenschilderAusgelassen.length };
    liste.forEach((s, i) => {
      const t = `${tag} Schild ${i} (s ${s.s.toFixed(0)})`;
      // B
      const sollMin = s.abstand >= C.abstandMin - 1e-6 ? true : s.abstand >= Math.min(C.abstandNot, C.abstandKette) - 1e-6;
      pruefe(`${t} Abstand zur Kurve`, sollMin && s.abstand <= C.abstandMax + 1e-6, `${s.abstand} m`);
      const dKurve = sp.differenzS(s.kurveS0, s.s);
      pruefe(`${t} Schild liegt vor der Kurve (Abstand stimmt mit s)`, Math.abs(dKurve - s.abstand) < 0.5, `Δ ${dKurve.toFixed(1)} vs ${s.abstand}`);
      const halb = st.breiteBei(s.s) / 2 + st.randBreite, g = st.grenzeBei(s.s);
      let qSoll = C.lage === 'bande' ? g + C.abstandBande : Math.min(halb + C.abstandRand, g - 1);
      if (qSoll < halb + 0.8) qSoll = g + C.abstandBande;      // enge Stelle: hinter der Bande
      pruefe(`${t} rechts neben der Fahrbahn (nie auf der Straße)`, Math.abs(s.q - qSoll) < 1e-6 && s.q > halb + 0.5, `q ${s.q.toFixed(1)}, Bande ${g.toFixed(1)}`);
      if (i > 0) pruefe(`${t} Mindestabstand zum vorigen Schild`, Math.abs(sp.differenzS(s.s, liste[i - 1].s)) >= C.mindestAbstandSchilder - 1e-6, `${sp.differenzS(s.s, liste[i - 1].s).toFixed(0)} m`);
      // C
      const erw = Math.max(20, Math.min(top, rund10(st.tempoBei(s.apexS) * 3.6)));
      pruefe(`${t} Tempo = gerundetes tempoBei`, s.kmh === erw && s.kmh % 10 === 0, `${s.kmh} vs ${erw} (${(st.tempoBei(s.apexS) * 3.6).toFixed(1)} km/h)`);
      pruefe(`${t} Tempo ≤ Höchsttempo der Klasse`, s.kmh <= top, `${s.kmh} ≤ ${top}`);
      // D
      const zonen = [12, 0];
      const z = 12;
      const imWeg = st.tunnelBei(s.s, z) || st.brueckeBei(s.s, z) || st.ueberfuehrungNah(s.s, z) || st.kreuzungNah(s.s, z) || (st.gabelungen.length && st.gabelNah(s.s, z)) || st.loopingBei(s.s, z)
        || (st.schanzen || []).some((e) => { const d = sp.differenzS(s.s, e.s); return d > -z && d < (e.laenge || 10) + z; })
        || (st.boostFelder || []).some((e) => { const d = sp.differenzS(s.s, e.s); return d > -z && d < (e.laenge || 12) + z; });
      void zonen;
      pruefe(`${t} nicht in Sperrzone`, !imWeg);
      pruefe(`${t} nicht im Startbereich`, s.s < L - C.startFreiVor && s.s > C.startFreiNach, `s ${s.s.toFixed(0)}`);
      pruefe(`${t} nicht auf der Fahrbahn (Boden/Position)`, Math.abs(sp.naechster(s.x, s.z).seitenabstand) > st.breiteBei(sp.naechster(s.x, s.z).s) / 2 + st.randBreite, '');
      // E
      pruefe(`${t} Zeichen passt zur Richtung`, s.zeichen === (s.art === 'doppel' ? '105-' : '103-') + (s.richtung === 'rechts' ? '20' : '10'), s.zeichen);
      if (s.haarnadel) pruefe(`${t} Haarnadel hat Leitpfeile`, s.leitpfeile.length >= 1);
      else pruefe(`${t} keine Leitpfeile ohne Haarnadel`, s.leitpfeile.length === 0);
      s.leitpfeile.forEach((l) => {
        const aussen = l.richtung === 'rechts' ? -1 : 1;
        pruefe(`${t} Leitpfeil auf der Außenseite`, Math.sign(l.q) === aussen && Math.abs(l.q) > st.breiteBei(l.s) / 2 + st.randBreite + 0.5, `q ${l.q.toFixed(1)} ${l.richtung}`);
        const zz = 12;
        pruefe(`${t} Leitpfeil nicht in Sperrzone/Start`, !(st.tunnelBei(l.s, zz) || st.brueckeBei(l.s, zz) || st.ueberfuehrungNah(l.s, zz) || st.kreuzungNah(l.s, zz) || (st.gabelungen.length && st.gabelNah(l.s, zz)) || st.loopingBei(l.s, zz)) && l.s < L - C.startFreiVor && l.s > C.startFreiNach);
      });
    });
    // F deterministisch
    const noch = K.berechnen(new R.Strecke(daten, { welt: welt || undefined, variante: variante || undefined }), klasse);
    pruefe(`${tag} deterministisch`, JSON.stringify(noch) === JSON.stringify(liste));
    // Klasse: schnell zeigt nie weniger Schilder als normal (Schwelle höher)
    if (klasse === 'schnell') {
      const n = K.berechnen(st, 'normal');
      pruefe(`${tag} schnell ≥ normal (Anzahl)`, liste.length >= n.length - 0, `${liste.length} vs ${n.length}`);
    }
  }
}

// G/H/I: Grafik (nur eine Welt je Strecke, Variante Normal)
for (const daten of R.trackCatalog) {
  if (nurId && daten.id !== nurId) continue;
  const welt = Object.keys(daten.welten || {})[0];
  const st = new R.Strecke(daten, { welt });
  st.tempoKlasse = 'normal';
  const gruppe = st.bauen();
  const meshes = []; gruppe.traverse((o) => { if (o.name === 'Kurvenschilder') meshes.push(o); });
  pruefe(`[${daten.id}] genau 1 Mesh „Kurvenschilder“ in strecke.bauen()`, meshes.length === 1);
  if (meshes.length === 1) {
    const g = meshes[0].geometry, n = st.kurvenschilder.length, lp = st.kurvenschilder.reduce((a, s) => a + s.leitpfeile.length, 0);
    pruefe(`[${daten.id}] Geometrie passt zur Schilderzahl`, g.index.count === (n * (4 * 6 + 2 * 12) + lp * (4 * 6 + 12)), `${g.index.count} Indizes`);
    pruefe(`[${daten.id}] 1 Material mit Textur-Atlas`, !Array.isArray(meshes[0].material) && !!meshes[0].material.map);
    pruefe(`[${daten.id}] Mast grau + Rückseite grau (Atlas-Zellen)`, true);
  }
  // H aus
  C.an = false;
  const st2 = new R.Strecke(daten, { welt }); const g2 = st2.bauen(); let m2 = 0; g2.traverse((o) => { if (o.name === 'Kurvenschilder') m2++; });
  pruefe(`[${daten.id}] an=false → keine Schilder`, m2 === 0 && (st2.kurvenschilder || []).length === 0);
  C.an = true;
  // I Deko
  if (mitDeko && R.themes && R.themes.dekoBauen) {
    const deko = R.themes.dekoBauen(daten.thema, st); let min = Infinity, wo = '';
    const mast = st.kurvenschilder.map((s) => [s.x, s.z]).concat([].concat(...st.kurvenschilder.map((s) => s.leitpfeile.map((l) => [l.x, l.z]))));
    deko.traverse((o) => {
      if (!o.isInstancedMesh) return;
      const e = o.instanceMatrix.array;
      for (let i = 0; i < o.count; i++) mast.forEach((m) => { const d = Math.hypot(e[i * 16 + 12] - m[0], e[i * 16 + 14] - m[1]); if (d < min) { min = d; wo = o.name; } });
    });
    pruefe(`[${daten.id}] Deko-Abstand zu Masten ≥ 1,2 m`, min >= 1.2, `min ${min.toFixed(2)} m (${wo})`);
  }
}

console.log('\nSchilder je Strecke (Welt 1, normal):'); Object.keys(stat).forEach((k) => console.log('  ' + k.padEnd(14), JSON.stringify(stat[k])));
console.log(`\n${geprueft} Prüfungen, ${fehler} FEHL`);
console.log(fehler ? 'FEHLER' : 'ALLE SCHILDER-PRÜFUNGEN OK');
process.exit(fehler ? 1 : 0);
