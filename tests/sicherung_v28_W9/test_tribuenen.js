// Zuschauertribünen (15.10., v25): node tests/test_tribuenen.js [streckenId] [--deko] [--mega]
// Prüft für Wiese, Wüste, Fantasie × alle Welten × Varianten (Normal/XL) (+ Wald/Dino/Alpen: keine Tribünen; + Megastrecke: nur Wiese/Wüste/Fantasie-Abschnitte):
//  A) Anzahl ≈ 5 (4–8; XL bis 8), genau 1 Start/Ziel-Tribüne (s nahe 0), ≥ 2 Kurventribünen an der Kurvenaußenseite (Kurve ≥ 35°, Seite = Außenseite),
//  B) Lage: ganz hinter der Bande (Abstand zu ALLEN Streckenteilen ≥ Bande + 0,8 m an allen Rasterpunkten), Mindestabstand zweier Tribünen,
//     keine Sperrzonen (Tunnel, Brücke, Überführung, Kreuzung, Gabelung, Looping, Schanze, Turbo-Feld, Hindernisse), nicht an Engstellen,
//     keine Kurvenschild-Masten/Startbogen-Säulen/Looping-Beine auf der Standfläche,
//  C) Gelände-Höhe: yBasis ≥ Gelände an allen Rasterpunkten (nicht versunken), Fundament reicht ≥ 0,5 m unter das tiefste Gelände (nicht schwebend),
//     Höhenunterschied ≤ maxHang, keine Brückensenke/Tunnelhügel,
//  D) Kollider: Säulen 'tribuene' auf der Vorderkante, hinter der Bande (Auto kommt normal nicht hin), Auto in der Säule wird herausgeschoben,
//  E) deterministisch (zweiter Aufbau identisch), F) Server baut dieselben Tribünen und Säulen (Simulation), G) Grafik: 3 Meshes,
//     Draw-Calls +3, Dreiecke im Rahmen, Zuschauer-Instanzen > 0, H) an=false → nichts, I) (--deko) keine Deko-Instanz auf einer Tribüne,
//  J) Themen ohne Tribünen (wald, dino, alpen) bekommen keine.
const S = require('../server/simulation.js');
const nurId = process.argv.slice(2).find((a) => !a.startsWith('--'));
const mitDeko = process.argv.includes('--deko');
const mitMega = process.argv.includes('--mega') || !nurId || nurId === 'mega';
const mods = S.MODULE.slice(0, -1);               // ohne main.js
const R = S.kontextLaden(mods);
let fehler = 0, geprueft = 0;
function pruefe(name, ok, info) { geprueft++; if (!ok) { fehler++; console.log('FEHL ' + name + (info ? '  (' + info + ')' : '')); } else if (process.argv.includes('--v')) console.log('OK   ' + name + (info ? '  (' + info + ')' : '')); }
const T = R.Tribuenen, C = R.config.tribuenen;
const stat = {};

function pruefeStrecke(daten, welt, variante, tag) {
  const st = new R.Strecke(daten, { welt: welt || undefined, variante: variante || undefined });
  st.tempoKlasse = 'normal';
  R.Kurvenschilder.einbauen(st, 'normal');
  const liste = T.einbauen(st);
  const sp = st.spline, L = sp.laenge;
  const mega = !!daten.mega;
  const bereiche = T.bereicheVon(st);
  // A ------------------------------------------------------------------
  if (!bereiche.length) {
    pruefe(`${tag} Thema ohne Tribünen → keine`, liste.length === 0, `n=${liste.length}`);
    return st;
  }
  const lo = mega ? 6 : C.anzahlMin - 1, hi = mega ? 12 : C.anzahlMax;
  pruefe(`${tag} Anzahl ≈ 5 (${lo}–${hi})`, liste.length >= lo && liste.length <= hi, `n=${liste.length}`);
  const starts = liste.filter((t) => t.typ === 'start');
  pruefe(`${tag} genau 1 Start/Ziel-Tribüne`, starts.length === 1, `n=${starts.length}`);
  if (starts.length) pruefe(`${tag} Start/Ziel-Tribüne nahe der Ziellinie (≤ 80 m)`, Math.abs(sp.differenzS(starts[0].s, 0)) <= 80 + 1e-6, `s ${starts[0].s.toFixed(0)}`);
  const kurven = liste.filter((t) => t.typ === 'kurve');
  pruefe(`${tag} ≥ 2 Kurventribünen`, kurven.length >= 2, `n=${kurven.length}`);
  kurven.forEach((t) => {
    pruefe(`${tag} Kurve ${t.nr}: Kurvenaußenseite`, t.seite === (t.kurve.dir > 0 ? -1 : 1), `dir ${t.kurve.dir}, Seite ${t.seite}`);
    pruefe(`${tag} Kurve ${t.nr}: Kurvenwinkel ≥ ${C.kurveWinkelMin}°`, t.kurve.winkel >= C.kurveWinkelMin, `${t.kurve.winkel}°`);
    pruefe(`${tag} Kurve ${t.nr}: Tribüne im Kurvenbereich (≤ 40 m vom Scheitel)`, Math.abs(sp.differenzS(t.s, t.kurve.apexS)) <= 40 + 1e-6, `Δ ${sp.differenzS(t.s, t.kurve.apexS).toFixed(0)}`);
  });
  // Mindestabstand
  for (let i = 0; i < liste.length; i++) for (let j = i + 1; j < liste.length; j++) {
    const a = liste[i], b = liste[j];
    pruefe(`${tag} Abstand Tribüne ${a.nr}/${b.nr} ≥ ${C.abstandMin} m (s) und ≥ ${C.abstandWelt} m (Luftlinie)`,
      Math.abs(sp.differenzS(a.s, b.s)) >= C.abstandMin - 1e-6 && Math.hypot(a.x - b.x, a.z - b.z) >= C.abstandWelt - 1e-6, `Δs ${Math.abs(sp.differenzS(a.s, b.s)).toFixed(0)}`);
  }
  liste.forEach((t) => {
    const hl = t.laenge / 2, rad = st.seitenabstandMax + 8;
    const W = (u, v) => [t.x + t.tx * u + t.ox * v, t.z + t.tz * u + t.oz * v];
    pruefe(`${tag} T${t.nr} Länge/Reihen im Rahmen`, t.laenge >= 20 && t.laenge <= C.laenge[1] + 1e-6 && t.reihen >= C.reihen[0] && t.reihen <= C.reihen[1], `${t.laenge} m, ${t.reihen} Reihen`);
    pruefe(`${tag} T${t.nr} Thema passt`, C.themen.indexOf(t.thema) >= 0, t.thema);
    // B: Abstand zu allen Streckenteilen (auch fremden Abschnitten), Bande, Engstellen
    let minAb = Infinity, ok = true, hMin = Infinity, hMax = -Infinity, senke = false, deko = false;
    const nu = Math.ceil(t.laenge / 2), vs = [-1.5, 0, t.tiefe * 0.25, t.tiefe * 0.5, t.tiefe * 0.75, t.tiefe, t.tiefe + 1.5];
    for (const v of vs) for (let i = 0; i <= nu; i++) {
      const [x, z] = W(-hl - 1 + (t.laenge + 2) * i / nu, v);
      for (const e of sp.abschnitte(x, z, rad)) { const m = e.abstand - st.grenzeBei(e.s); if (m < minAb) minAb = m; if (m < 0.8 - 1e-6) ok = false; }
      const h = st.hoeheAn(x, z); if (h < hMin) hMin = h; if (h > hMax) hMax = h;
      if (st.senkeTiefe(x, z) > 0.01) senke = true;
      if (v >= 0 && v <= t.tiefe && st.dekoSperre(x, z)) deko = true;   // dekoSperre enthält jetzt die Tribünen selbst → hier nur prüfen, dass Strecken-Sperren fehlen
    }
    void deko;
    pruefe(`${tag} T${t.nr} hinter der Bande, ≥ 0,8 m Abstand zu allen Streckenteilen`, ok, `min ${minAb.toFixed(1)} m`);
    pruefe(`${tag} T${t.nr} Bande normal (keine Engstelle)`, st.grenzeBei(t.s) >= st.seitenabstandMax - 0.01);
    const q = Math.abs(sp.naechster(t.x, t.z).seitenabstand);
    pruefe(`${tag} T${t.nr} Vorderkante ≥ Bande + ${C.abstandBande - 0.01} m`, q >= st.grenzeBei(t.s) + C.abstandBande - 0.01, `q ${q.toFixed(1)}, Bande ${st.grenzeBei(t.s).toFixed(1)}`);
    // Sperrzonen entlang der Länge
    let gesperrt = false;
    for (let d = -hl - 8; d <= hl + 8 + 1e-9; d += 6) if (T.gesperrt(st, t.s + d, C.sperre, C.sperreHindernis)) gesperrt = true;
    pruefe(`${tag} T${t.nr} keine Sperrzone (Tunnel/Brücke/Überführung/Kreuzung/Gabelung/Looping/Schanze/Turbo/Hindernis)`, !gesperrt, `s ${t.s.toFixed(0)}`);
    // Säulen der Strecke (Masten, Startbogen, Looping-Beine, Warnlicht) nicht auf der Standfläche
    let saeuleDrauf = 0;
    for (const sa of st.saeulen) {
      if (sa.art === 'tribuene') continue;
      const du = (sa.x - t.x) * t.tx + (sa.z - t.z) * t.tz, dv = (sa.x - t.x) * t.ox + (sa.z - t.z) * t.oz;
      if (Math.abs(du) < hl + 1 && dv > -1 && dv < t.tiefe + 1) saeuleDrauf++;
    }
    pruefe(`${tag} T${t.nr} keine Kurvenschild-Masten/Startbogen/Looping-Beine auf der Standfläche`, saeuleDrauf === 0, `n=${saeuleDrauf}`);
    for (const ks of st.kurvenschilder || []) {
      const lst = [ks].concat(ks.leitpfeile || []);
      lst.forEach((m) => { const du = (m.x - t.x) * t.tx + (m.z - t.z) * t.tz, dv = (m.x - t.x) * t.ox + (m.z - t.z) * t.oz; if (Math.abs(du) < hl && dv > 0 && dv < t.tiefe) saeuleDrauf++; });
    }
    pruefe(`${tag} T${t.nr} keine Kurvenschilder auf der Tribüne`, saeuleDrauf === 0);
    // C: Gelände
    pruefe(`${tag} T${t.nr} nicht versunken (yBasis ≥ Gelände − 0,02)`, t.yBasis >= hMax - 0.02, `yBasis ${t.yBasis.toFixed(2)}, Gelände max ${hMax.toFixed(2)}`);
    pruefe(`${tag} T${t.nr} Höhenunterschied ≤ ${C.maxHang} m`, hMax - hMin <= C.maxHang + 1e-6, `${(hMax - hMin).toFixed(2)} m`);
    pruefe(`${tag} T${t.nr} yMin stimmt (≤ Gelände min + 0,02)`, t.yMin <= hMin + 0.02, `yMin ${t.yMin.toFixed(2)} / ${hMin.toFixed(2)}`);
    pruefe(`${tag} T${t.nr} keine Brückensenke/Tunnelhügel unter der Tribüne`, !senke);
    // D: Kollider
    const sa = st.saeulen.filter((c) => c.art === 'tribuene' && c.nr === t.nr);
    pruefe(`${tag} T${t.nr} Kollider vorhanden (≥ 2 Säulen)`, sa.length >= 2, `n=${sa.length}`);
    let nah = Infinity, innen = true;
    sa.forEach((c) => {
      const n = sp.naechster(c.x, c.z), m = Math.abs(n.seitenabstand) - c.r - st.grenzeBei(n.s);
      if (m < nah) nah = m;
      const du = (c.x - t.x) * t.tx + (c.z - t.z) * t.tz, dv = (c.x - t.x) * t.ox + (c.z - t.z) * t.oz;
      if (Math.abs(du) > hl || dv < 0 || dv > t.tiefe) innen = false;
    });
    pruefe(`${tag} T${t.nr} Kollider hinter der Bande (Auto kommt normal nicht hin)`, nah >= 0.9, `Luft zur Bande ${nah.toFixed(1)} m`);
    pruefe(`${tag} T${t.nr} Kollider liegen in der Standfläche`, innen);
  });
  // D2: ein Auto in einer Säule wird herausgeschoben (Physik wie im Server)
  if (liste.length) {
    const t = liste[0], c = st.saeulen.find((q) => q.art === 'tribuene' && q.nr === t.nr);
    const v = new R.Vehicle(R.carCatalog ? (R.carCatalog.find((a) => a.id === 'passat') || R.carCatalog[0]) : undefined);
    v.setzen(c.x + t.ox * 0.3, c.z + t.oz * 0.3, Math.atan2(t.ox, t.oz));
    const vorher = Math.hypot(v.x - c.x, v.z - c.z);
    R.Kollisionen.bande(v, st);
    const nachher = Math.hypot(v.x - c.x, v.z - c.z);
    pruefe(`${tag} Auto in der Tribünen-Säule wird hinausgeschoben`, nachher > vorher + 0.5, `${vorher.toFixed(2)} → ${nachher.toFixed(2)} m`);
  }
  // E: deterministisch
  const st2 = new R.Strecke(daten, { welt: welt || undefined, variante: variante || undefined });
  st2.tempoKlasse = 'normal'; R.Kurvenschilder.einbauen(st2, 'normal'); T.einbauen(st2);
  const kern = (l) => JSON.stringify(l.map((t) => [t.typ, t.s.toFixed(4), t.seite, t.laenge, t.reihen, t.x.toFixed(3), t.z.toFixed(3), t.yBasis.toFixed(3), t.seed]));
  pruefe(`${tag} deterministisch (zweiter Aufbau identisch)`, kern(liste) === kern(st2.tribuenen));
  // Idempotenz: zweites einbauen ersetzt (keine doppelten Säulen)
  const nSa = st.saeulen.length; T.einbauen(st);
  pruefe(`${tag} einbauen idempotent (Säulenzahl gleich)`, st.saeulen.length === nSa, `${nSa} → ${st.saeulen.length}`);
  // G: Grafik
  const gr = T.bauen(st);
  pruefe(`${tag} Grafik: Gruppe 'Tribuenen'`, !!gr && gr.name === 'Tribuenen');
  if (gr) {
    const meshes = []; gr.traverse((o) => { if (o.isMesh || o.isInstancedMesh) meshes.push(o); });
    pruefe(`${tag} Grafik: genau 3 Meshes (+3 Draw-Calls, ≤ +4)`, meshes.length === 3, meshes.map((m) => m.name).join(','));
    const z = meshes.find((m) => m.name === 'Tribuenen-Zuschauer');
    pruefe(`${tag} Grafik: Zuschauer-Instanzen`, !!z && z.count > liste.length * 100, `n=${z ? z.count : 0}`);
    pruefe(`${tag} Grafik: Dreiecke im Rahmen (< 150 000)`, gr.userData.dreiecke < 150000, `${Math.round(gr.userData.dreiecke)}`);
    // Zuschauer stehen auf einer Tribüne und nicht im Gelände
    if (z) {
      const e = z.instanceMatrix.array; let schlecht = 0;
      for (let i = 0; i < z.count; i += 7) {
        const x = e[i * 16 + 12], y = e[i * 16 + 13], zz = e[i * 16 + 14];
        const t = liste.find((tt) => { const du = (x - tt.x) * tt.tx + (zz - tt.z) * tt.tz, dv = (x - tt.x) * tt.ox + (zz - tt.z) * tt.oz; return Math.abs(du) < tt.laenge / 2 && dv > 0 && dv < tt.tiefe; });
        if (!t || y < t.yBasis + 0.3) schlecht++;
      }
      pruefe(`${tag} Grafik: Zuschauer sitzen auf ihrer Tribüne (über dem Boden)`, schlecht === 0, `n=${schlecht}`);
    }
    // Grafik: Gerüst unterhalb des tiefsten Geländes (nicht schwebend)
    const geruest = meshes.find((m) => m.name === 'Tribuenen-Geruest');
    if (geruest) {
      const pos = geruest.geometry.attributes.position.array; let minY = Infinity;
      liste.forEach((t) => { for (let i = 0; i < pos.length; i += 3) { const du = (pos[i] - t.x) * t.tx + (pos[i + 2] - t.z) * t.tz, dv = (pos[i] - t.x) * t.ox + (pos[i + 2] - t.z) * t.oz; if (Math.abs(du) < t.laenge / 2 + 0.6 && dv > -0.5 && dv < t.tiefe + 0.5) minY = Math.min(minY, pos[i + 1] - t.yMin); } });
      pruefe(`${tag} Grafik: Fundament reicht ≥ 0,5 m unter das tiefste Gelände (nicht schwebend)`, minY <= -0.5, `${minY.toFixed(2)}`);
    }
    if (variante === '' && welt === ((daten.welten && Object.keys(daten.welten)[0]) || '')) stat[daten.id] = { n: liste.length, typen: liste.map((t) => t.typ[0] + Math.round(t.s) + (t.seite > 0 ? 'R' : 'L')).join(' '), dreiecke: Math.round(gr.userData.dreiecke), zuschauer: z ? z.count : 0 };
  }
  // I: Deko
  if (mitDeko && R.themes && R.themes.dekoBauen && liste.length) {
    const dk = R.themes.dekoBauen(daten.thema, st); let drauf = 0, min = Infinity;
    dk.traverse((o) => {
      if (!o.isInstancedMesh) return;
      const e = o.instanceMatrix.array;
      for (let i = 0; i < o.count; i++) {
        const x = e[i * 16 + 12], z = e[i * 16 + 14];
        liste.forEach((t) => { const du = (x - t.x) * t.tx + (z - t.z) * t.tz, dv = (x - t.x) * t.ox + (z - t.z) * t.oz; if (Math.abs(du) < t.laenge / 2 + 0.5 && dv > -0.5 && dv < t.tiefe + 0.5) drauf++; });
      }
    });
    pruefe(`${tag} Deko: nichts steht auf einer Tribüne`, drauf === 0, `n=${drauf}`);
  }
  return st;
}

for (const daten of R.trackCatalog) {
  if (nurId && daten.id !== nurId) continue;
  if (daten.id === 'mega') continue;
  const welten = Object.keys(daten.welten || {}); if (!welten.length) welten.push('');
  for (const variante of [''].concat(Object.keys(daten.varianten || {}))) for (const welt of welten) {
    const tag = `[${daten.id}${variante ? ' ' + variante : ''} ${welt}]`;
    pruefeStrecke(daten, welt, variante, tag);
  }
}
// Megastrecke (nur ihre Wiese/Wüste/Fantasie-Abschnitte)
if (mitMega) {
  const daten = R.trackCatalog.find((t) => t.id === 'mega');
  if (daten) {
    const st = pruefeStrecke(daten, 'hindernisse', '', '[mega]');
    const bereiche = T.bereicheVon(st);
    pruefe('[mega] Tribünen nur in Wiese/Wüste/Fantasie-Abschnitten', st.tribuenen.every((t) => bereiche.some((b) => t.s >= b.s0 && t.s < b.s1)));
    pruefe('[mega] Themen der Tribünen ∈ {wiese, wueste, fantasie}', st.tribuenen.every((t) => ['wiese', 'wueste', 'fantasie'].indexOf(t.thema) >= 0), st.tribuenen.map((t) => t.thema[0]).join(''));
  }
}
// H: aus
if (!nurId || nurId === 'wiese') {
  const daten = R.trackCatalog.find((t) => t.id === 'wiese');
  C.an = false;
  const st = new R.Strecke(daten, {}); R.Kurvenschilder.einbauen(st, 'normal');
  const l = T.einbauen(st), g = T.bauen(st);
  pruefe('[wiese] an=false → keine Tribünen, keine Säulen, keine Grafik', l.length === 0 && !g && !st.saeulen.some((c) => c.art === 'tribuene'));
  C.an = true;
  // J: Themen ohne Tribünen
  for (const id of ['wald', 'dino', 'alpen']) {
    const d = R.trackCatalog.find((t) => t.id === id); if (!d) continue;
    const s2 = new R.Strecke(d, {}); R.Kurvenschilder.einbauen(s2, 'normal');
    pruefe(`[${id}] keine Tribünen (Thema nicht gewünscht)`, T.einbauen(s2).length === 0);
  }
}
// F: Server
if (!nurId || nurId === 'wiese' || nurId === 'wueste' || nurId === 'fantasie') {
  for (const id of ['wiese', 'wueste', 'fantasie']) {
    if (nurId && id !== nurId) continue;
    for (const variante of ['', 'xl']) {
      const sim = new S.Simulation({ einstellungen: { streckeId: id, runden: 1, gegner: 1, schwierigkeit: 'mittel', windStaerke: 0, variante }, spieler: [{ fahrer: 'Jonas', auto: 'passat' }], seed: 5 });
      const sst = sim.sim.strecke;
      const daten = R.trackCatalog.find((t) => t.id === id);
      const st = new R.Strecke(daten, { welt: sst.welt, variante: variante || undefined }); st.tempoKlasse = sst.tempoKlasse; R.Kurvenschilder.einbauen(st, st.tempoKlasse); T.einbauen(st);
      const kern = (l) => JSON.stringify((l || []).map((t) => [t.typ, t.s.toFixed(3), t.seite, t.laenge, t.reihen, t.x.toFixed(3), t.z.toFixed(3)]));
      pruefe(`[${id}${variante ? ' ' + variante : ''}] Server baut dieselben Tribünen wie der Browser`, (sst.tribuenen || []).length > 0 && kern(sst.tribuenen) === kern(st.tribuenen), `Server ${(sst.tribuenen || []).length}, Browser ${st.tribuenen.length}`);
      const ks = (x) => JSON.stringify(x.saeulen.filter((c) => c.art === 'tribuene').map((c) => [c.x.toFixed(3), c.z.toFixed(3), c.r]));
      pruefe(`[${id}${variante ? ' ' + variante : ''}] Server-Kollider = Browser-Kollider`, ks(sst) === ks(st));
    }
  }
}

console.log('\nTribünen je Strecke (Welt 1, normal):'); Object.keys(stat).forEach((k) => console.log('  ' + k.padEnd(10), JSON.stringify(stat[k])));
console.log(`\n${geprueft} Prüfungen, ${fehler} FEHL`);
console.log(fehler ? 'FEHLER' : 'ALLE TRIBÜNEN-PRÜFUNGEN OK');
process.exit(fehler ? 1 : 0);
