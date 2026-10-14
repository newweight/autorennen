// Node-Test "Auto im Grünen" (14.10., v20): node tests/test_gelaende_hoehe.js [streckenId]
// A) Gelände (nur im befahrbaren Bereich bis zur Bande): Auto-Unterkante (4 Ecken der Karosserie, Fahrzeug-Y = strecke.hoeheAn wie in main.js, Nicken nach Straßensteigung)
//    gegen das ECHTE Gelände-Mesh (Boden-Gitter + Böschung, hier mit eigener Höhenabfrage auf den Mesh-Dreiecken) – 2…25 m beidseitig
//    neben der Fahrbahn, alle Strecken, Auto längs / quer / schräg. Gefordert: Auto versinkt nie mehr als 0,1 m im Boden.
// B) Pflanzen: weiche Kollider (Büsche, Farne, Gestrüpp …) lassen das Auto durchfahren. Das Auto darf dabei nie so tief im Busch
//    stehen, dass es unsichtbar wird: Dach-Mitte (Höhe = Dachhöhe des Autos) nie innerhalb eines Busch-Körpers – für alle Autos.
const fs = require('fs'), path = require('path'), vm = require('vm');
const root = path.join(__dirname, '..');
const sb = { console, Math, performance: { now: () => Date.now() } };
sb.window = sb; sb.addEventListener = () => {}; sb.globalThis = sb; sb.self = sb;
const ctx2d = new Proxy({}, { get: () => () => ({ addColorStop() {} }) });
sb.document = { createElement: () => ({ getContext: () => ctx2d, style: {} }) };
vm.createContext(sb);
const log = console.log; console.log = () => {};   // three.min.js meldet "deprecated"
['vendor/three.min.js'].forEach(d => vm.runInContext(fs.readFileSync(path.join(root, d), 'utf8'), sb, { filename: d }));
console.log = log;
['src/config.js', 'src/physics/vehicle.js', 'src/physics/collisions.js', 'src/cars/carCatalog.js', 'src/track/spline.js', 'src/track/trackCatalog.js',
  'src/track/trackBuilder.js', 'src/track/schanze.js', 'src/world/themes.js'].forEach(d => vm.runInContext(fs.readFileSync(path.join(root, d), 'utf8'), sb, { filename: d }));
const R = sb.Rennspiel, T = sb.THREE;
let fehler = 0;
function pruefe(name, ok, info) { console.log((ok ? 'OK   ' : 'FEHL ') + name + (info ? '  (' + info + ')' : '')); if (!ok) fehler++; }
const nurId = process.argv[2];
const GRENZE_SINKEN = 0.1;      // m

/** Höhenfeld über Dreiecke (Gitter-Buckets): höchste Fläche über (x, z) aus allen Meshes. */
function hoehenFeld(meshes) {
  const B = 8, tab = new Map(), tris = [];
  for (const m of meshes) {
    const g = m.geometry, p = g.attributes.position, idx = g.index ? g.index.array : null, n = idx ? idx.length : p.count;
    for (let i = 0; i < n; i += 3) {
      const a = idx ? idx[i] : i, b = idx ? idx[i + 1] : i + 1, c = idx ? idx[i + 2] : i + 2;
      const t = [p.getX(a), p.getY(a), p.getZ(a), p.getX(b), p.getY(b), p.getZ(b), p.getX(c), p.getY(c), p.getZ(c)];
      const k = tris.push(t) - 1;
      const x0 = Math.floor(Math.min(t[0], t[3], t[6]) / B), x1 = Math.floor(Math.max(t[0], t[3], t[6]) / B);
      const z0 = Math.floor(Math.min(t[2], t[5], t[8]) / B), z1 = Math.floor(Math.max(t[2], t[5], t[8]) / B);
      for (let gx = x0; gx <= x1; gx++) for (let gz = z0; gz <= z1; gz++) { const key = gx * 100003 + gz; (tab.get(key) || tab.set(key, []).get(key)).push(k); }
    }
  }
  return (x, z) => {
    const l = tab.get(Math.floor(x / B) * 100003 + Math.floor(z / B));
    let top = -Infinity;
    if (!l) return top;
    for (const k of l) {
      const t = tris[k];
      const d = (t[5] - t[8]) * (t[0] - t[6]) + (t[6] - t[3]) * (t[2] - t[8]);
      if (Math.abs(d) < 1e-12) continue;
      const u = ((t[5] - t[8]) * (x - t[6]) + (t[6] - t[3]) * (z - t[8])) / d;
      const v = ((t[8] - t[2]) * (x - t[6]) + (t[0] - t[6]) * (z - t[8])) / d;
      const w = 1 - u - v;
      if (u < -1e-4 || v < -1e-4 || w < -1e-4) continue;   // Float32-Eckpunkte: Kanten haben Rundungsspalten ~1e-5
      top = Math.max(top, u * t[1] + v * t[4] + w * t[7]);
    }
    return top;
  };
}

// ============================================================ A) Gelände
const AUTOS = R.carCatalog || R.cars || [];
const passat = AUTOS.find(a => a.id === 'passat');
const streckenListe = R.trackCatalog.filter(d => !nurId || d.id === nurId);
const ergA = [];
for (const daten of streckenListe) {
  const st = new R.Strecke(daten, {});
  const th = (R.themes && R.themes[st.thema]) || {};
  const meshes = [st._bodenBauen(th.boden !== undefined ? th.boden : 0x5f9e3a, th.boden2)];
  if (st.sModell) meshes.push(st._boeschungBauen(th));
  // feine Senke unter Brücken (2-m-Raster, exakt bodenHoehe) liegt über dem groben Gitter
  (st.bruecken || []).forEach(b => { const o = st._senkeBauen(b, th); o.traverse(m => { if (m.geometry && m.geometry.attributes && m.geometry.attributes.position) meshes.push(m); }); });
  const feld = hoehenFeld(meshes);
  const sp = st.spline, L = sp.laenge, hl = (passat ? passat.fahrwerte.laenge : 4.88) / 2, hb = (passat ? passat.fahrwerte.breite : 1.83) / 2;
  const q0s = [2, 3, 4, 5, 6, 8, 10, 12, 15, 18, 21, 25];
  let hebWo = '', sinkMax = -Infinity, wo = '', mitteMax = -Infinity, hebMax = -Infinity, n = 0;
  const rand = st.breite / 2 + st.randBreite;
  for (let s = 0; s < L; s += 5.7) {
    const p = sp.punktBei(s);
    // unter einer Brücke / in einem Tunnel liegt das Gelände absichtlich tiefer (Senke) → nur freie Strecke prüfen
    if ((st.bruecken || []).some(b => st._inBereich(b, s, 30)) || (st.tunnel || []).some(t => st._inBereich(t, s, 30))) continue;
    // Überführung (Alpen): unter/neben ihr hängt die Höhe vom Streckenindex des Autos ab (oben/unten) – hier nicht prüfbar ohne echte Fahrt
    if ((st.ueberfuehrungen || []).some(u => st._inBereich(u, s, 60) || (u.unten && st._inBereich(u.unten, s, 80)))) continue;
    for (const sg of [-1, 1]) for (const q0 of q0s) {
      const q = (rand + q0) * sg;
      if (Math.abs(q) > st.grenzeBei(s) - 0.3) continue;      // hinter der Bande/dem Zaun kann kein Auto stehen
      const x = p.x + p.nx * q, z = p.z + p.nz * q;
      const nah = sp.naechster(x, z), idx = nah.index, gw = st.abseitsGewicht(nah);
      for (const dh of [0, Math.PI / 4, Math.PI / 2]) {
        const hd = Math.atan2(-p.tx, -p.tz) + dh;           // heading wie vehicle.js: 0 = −z, Fahrtrichtung (−sin, −cos)
        const rx = -Math.sin(hd), rz = -Math.cos(hd);
        const y = st.hoeheAn(x, z, idx);
        // Anzeige-Pose wie main.js: Nicken nach Straßensteigung (±1,6 m), abseits (Gewicht gw) Nicken/Querneigung/Höhe nach dem Gelände
        let nick = Math.atan2(st.hoeheAn(x + rx * 1.6, z + rz * 1.6, idx) - st.hoeheAn(x - rx * 1.6, z - rz * 1.6, idx), 3.2), neig = 0, dy = 0;
        if (gw > 0.001) {
          const gp = st.gelaendePose(x, z, rx, rz, hl, hb, idx);
          nick += (gp.nicken - nick) * gw; neig = gp.neigung * gw; dy = gp.dy * gw;
        }
        const obj = new T.Object3D();
        obj.position.set(x, y + dy, z); obj.rotation.set(nick, hd, neig, 'YXZ'); obj.updateMatrixWorld(true);
        let sink = -Infinity;
        for (const [a, b] of [[1, 1], [1, -1], [-1, 1], [-1, -1], [0, 0]]) {
          const c = new T.Vector3(b * hb, 0, -a * hl).applyMatrix4(obj.matrixWorld);       // lokal: +x rechts, −z vorn
          const g = feld(c.x, c.z);
          if (g === -Infinity) continue;
          sink = Math.max(sink, g - c.y);
        }
        n++;
        const gm = feld(x, z);
        if (gm > -Infinity) { mitteMax = Math.max(mitteMax, gm - y); if (y - gm > hebMax) { hebMax = y - gm; hebWo = 's=' + s.toFixed(0) + ' q=' + q.toFixed(1); } }
        if (sink > sinkMax) { sinkMax = sink; wo = 's=' + s.toFixed(0) + ' q=' + q.toFixed(1) + ' dh=' + (dh * 57.3).toFixed(0) + '°'; }
      }
    }
  }
  ergA.push({ id: daten.id, sinkMax, wo, mitteMax, hebMax, n });
  pruefe(`[${daten.id}] A Auto-Unterkante höchstens ${GRENZE_SINKEN} m unter dem Gelände (2…25 m neben der Fahrbahn)`, sinkMax < GRENZE_SINKEN,
    `max Versinken ${sinkMax.toFixed(3)} m bei ${wo}; Mitte: Mesh über Auto max ${mitteMax.toFixed(3)} m; ${n} Stellungen`);
  pruefe(`[${daten.id}] A Auto schwebt nirgends mehr als 0,3 m über dem Gelände`, hebMax < 0.3, `max ${hebMax.toFixed(3)} m bei ${hebWo}`);
}

// ============================================================ B) Büsche
// Busch-Körper = Ellipsoid aus der Geometrie-Box der Instanz (Icosaeder ≈ 0,85 der Box). Dach-Mitte des Autos auf Dachhöhe.
function buschTest(daten, welt, jahreszeit) {
  const st = new R.Strecke(daten, { welt });
  const deko = R.themes.dekoBauen(daten.thema, st, jahreszeit);
  const kol = R.Kollisionen.pflanzenSammeln(st, deko);
  const weichNamen = new Set(R.config.pflanzen.weich);
  const koerper = [];
  const besuche = (o) => {
    if (o.isInstancedMesh && weichNamen.has(o.name)) {
      const g = o.geometry; g.computeBoundingBox();
      const bb = g.boundingBox, c = bb.getCenter(new T.Vector3()), e = bb.getSize(new T.Vector3()).multiplyScalar(0.5 * 0.85);
      const mat = new T.Matrix4(), inv = new T.Matrix4();
      for (let i = 0; i < o.count; i++) {
        o.getMatrixAt(i, mat); inv.copy(mat).invert();
        const px = mat.elements[12], pz = mat.elements[14];
        koerper.push({ inv: inv.clone(), c, e, x: px, z: pz, name: o.name });
      }
    }
    (o.children || []).forEach(besuche);
  };
  besuche(deko);
  return { st, kol, koerper };
}
function innen(k, x, y, z) {
  const v = new T.Vector3(x, y, z).applyMatrix4(k.inv);
  const a = (v.x - k.c.x) / k.e.x, b = (v.y - k.c.y) / k.e.y, c = (v.z - k.c.z) / k.e.z;
  return a * a + b * b + c * c <= 1;
}
const ergB = [];
for (const daten of streckenListe) {
  const { st, koerper } = buschTest(daten, undefined, undefined);
  const weich = st.pflanzenKollider.filter(k => k.art === 'weich');
  // nur Büsche im befahrbaren Bereich (zwischen Straße und Zaun; weiter draußen gibt es keinen Kollider – dorthin kommt kein Auto: Bande)
  const erreichbar = koerper.filter(b => st.pflanzenKollider.some(k => k.kern && Math.hypot(k.x - b.x, k.z - b.z) < 0.3));   // Riesenfarn (dünner Stamm, weiter Schirm) zählt wie ein Baum
  const dt = R.config.physik.schritt;
  const autosTest = AUTOS.length ? AUTOS : [{ id: 'standard', fahrwerte: {}, abmessungen: { hoehe: 1.5 } }];
  let versteckt = 0, geprueft = 0, schlimm = '';
  for (const a of autosTest) {
    const hD = (a.abmessungen && a.abmessungen.hoehe) || 1.5;
    for (const k of weich) {
      const yb = st.bodenHoehe ? st.bodenHoehe(k.x, k.z) : st.hoeheAn(k.x, k.z);
      // Fahrversuche: das Auto fährt aus 8 Richtungen auf die Busch-Mitte zu (Heading), wird je Schritt wie main.js behandelt
      for (let r = 0; r < 8; r++) {
        const w = r * Math.PI / 4, v = new R.Vehicle(a.fahrwerte);
        const dx = Math.sin(w), dz = -Math.cos(w);       // Fahrtrichtung
        v.setzen(k.x - dx * 9, k.z - dz * 9, w);
        v.vLaengs = 12;
        let drin = false;
        for (let t = 0; t < 120; t++) {
          v.schritt(dt, { gas: 0.4, bremse: 0, lenkung: 0 });
          R.Kollisionen.pflanzen([{ vehicle: v }], st, { dt, countdown: false });
          const y = st.hoeheAn(v.x, v.z);
          for (const b of erreichbar) {
            if (Math.abs(b.x - v.x) > 6 || Math.abs(b.z - v.z) > 6) continue;
            if (innen(b, v.x, y + hD, v.z)) { drin = true; if (process.env.DBG2) { const kk = weich.map(k => [Math.hypot(k.x - v.x, k.z - v.z), k]).sort((p, q) => p[0] - q[0])[0]; console.log('DBG', a.id, 'Busch', b.name, b.x.toFixed(1), b.z.toFixed(1), 'Auto', v.x.toFixed(1), v.z.toFixed(1), 'dist Busch', Math.hypot(b.x - v.x, b.z - v.z).toFixed(2), 'naechster Kollider d', kk[0].toFixed(2), 'r', kk[1].r.toFixed(2), 'kern', JSON.stringify(kk[1].kern), 'box', b.c.x.toFixed(2), b.c.y.toFixed(2), b.e.x.toFixed(2), b.e.y.toFixed(2)); } break; }
          }
          if (drin) break;
        }
        geprueft++;
        if (drin) { versteckt++; if (!schlimm) schlimm = a.id + ' @' + k.x.toFixed(0) + ',' + k.z.toFixed(0); }
      }
    }
  }
  ergB.push({ id: daten.id, weich: weich.length, geprueft, versteckt });
  pruefe(`[${daten.id}] B Dach-Mitte nie im Busch (${weich.length} weiche Kollider × ${autosTest.length} Autos × 8 Anfahrten)`, versteckt === 0, `${versteckt} von ${geprueft} Fahrten mit Dach im Busch ${schlimm ? '(z. B. ' + schlimm + ')' : ''}`);
}
console.log(fehler ? '\n' + fehler + ' FEHLER' : '\nALLE OK');
process.exit(fehler ? 1 : 0);
