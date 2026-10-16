#!/usr/bin/env python3
"""v28 W4b („unterer Reifen verschmolzen"): Im echten Spiel (Browser) Räder gegen die sichtbare Oberfläche messen (Raycast auf die Szene,
ohne Autos) und Nahaufnahmen machen: Startaufstellung (Nachbarauto) auf wiese + alpen, Werkstatt-Fläche/-Keil auf wiese.
python3 tests/raeder_boden_shots.py <tag: vorher|nachher> [projektordner]   → tests/out/v28/raeder_boden_<tag>_<ort>.png (im Projekt dieses Skripts)
"""
import sys, os
from playwright.sync_api import sync_playwright
hier = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
tag = sys.argv[1] if len(sys.argv) > 1 else 'nachher'
basis = sys.argv[2] if len(sys.argv) > 2 else hier
aus = os.path.join(hier, 'tests', 'out', 'v28'); os.makedirs(aus, exist_ok=True)
url = 'file://' + os.path.join(basis, 'Autorennen.html')
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
START = '''([strecke]) => { const s = Rennspiel.spiel;
  s.rennenStarten({ modus: 'solo', streckeId: strecke, welt: 'klassisch', schaden: true, gegner: 5, runden: 3, schwierigkeit: 'mittel', autoIds: ['passat'], fahrhilfe: ['aus'] });
  if (!s.laeuft && s.start) s.start(); s.pausiert = true; return s.fahrzeuge.map(f => f.auto && (f.auto.id || f.auto)); }'''
# Auto i auf die Werkstatt setzen (Fläche bzw. Keil), Pause: nur die Anzeige-Pose läuft weiter
SETZEN = '''([i, wo]) => { const s = Rennspiel.spiel, st = s.strecke, w = s.werkstatt, P = w && w.platz; if (!P) return null;
  const T = w.teile ? w.teile[0] : w, qE = P.qE !== undefined ? P.qE : P.qA - 0.4;
  const pos = wo === 'flaeche' ? T.welt(P.s + 4, (P.qA + P.qB) / 2) : T.welt(P.s - P.laenge / 2 - 7, qE + 0.6);
  const f = s.fahrzeuge[i], v = f.vehicle, h = Math.atan2(-pos.tx, -pos.tz);
  v.setzen(pos.x, pos.z, h); v.vLaengs = 0; f.index = -1; const n = st.abfrage(pos.x, pos.z); f.index = n.index; f.nah = n; v.y = st.hoeheAn(pos.x, pos.z, f.index);
  s._vorherAngleichen(f); return [pos.x, pos.z]; }'''
# Freie Kamera: tief, seitlich auf die Räder von Auto i (rechte Seite, Blick auf die Radunterkante)
KAM = '''([i, seite]) => { const g = Rennspiel.spiel, f = g.fahrzeuge[i], k = g.kameras[0]; k.update = function () {};
  const m = f.mesh, h = m.rotation.y, sx = Math.cos(h) * seite, sz = -Math.sin(h) * seite, fx = -Math.sin(h), fz = -Math.cos(h);
  const px = m.position.x, pz = m.position.z, py = m.position.y;
  k.kamera.position.set(px + sx * 3.0 + fx * 0.3, py + 0.45, pz + sz * 3.0 + fz * 0.3); k.kamera.lookAt(px + fx * 0.1, py + 0.18, pz + fz * 0.1); return 1; }'''
# Raycast je Rad: sichtbare Fläche (keine Autos, keine durchsichtigen) unter der Radmitte, Bogen ±60° um den tiefsten Punkt
MESS = '''() => { const s = Rennspiel.spiel, T = THREE, autos = new Set(s.fahrzeuge.map(f => f.mesh)), ziele = [];
  s.szene.children.forEach(c => { if (!autos.has(c)) c.traverse(o => { if (o.isMesh && o.visible && o.material && !o.material.transparent && !(o.userData && o.userData.schatten)) ziele.push(o); }); });
  const rc = new T.Raycaster(), ab = new T.Vector3(0, -1, 0), out = [];
  s.fahrzeuge.forEach((f, i) => { f.mesh.updateMatrixWorld(true); let min = Infinity;
    f.mesh.userData.raeder.forEach(r => { if (!r.geometry.boundingBox) r.geometry.computeBoundingBox(); const bb = r.geometry.boundingBox, rad = (bb.max.y - bb.min.y) / 2;
      const e = r.matrixWorld.elements, ax = new T.Vector3(e[0], e[1], e[2]).normalize(), up = new T.Vector3(0, 1, 0), w = up.clone().addScaledVector(ax, -up.dot(ax)).normalize(), u = new T.Vector3().crossVectors(ax, w);
      for (let gr = -60; gr <= 60; gr += 10) { const t = gr * Math.PI / 180; const p = new T.Vector3(e[12], e[13], e[14]).addScaledVector(w, -rad * Math.cos(t)).addScaledVector(u, rad * Math.sin(t));
        rc.set(new T.Vector3(p.x, e[13], p.z), ab); rc.far = 3; const hit = rc.intersectObjects(ziele, false)[0]; if (hit) min = Math.min(min, p.y - hit.point.y); } });
    out.push({ i, auto: f.auto && f.auto.id, min_cm: +(min * 100).toFixed(1) }); });
  return out; }'''
with sync_playwright() as pw:
    b = pw.chromium.launch(args=ARGS); p = b.new_page(viewport={'width': 900, 'height': 520})
    errs = []; p.on('pageerror', lambda e: errs.append(str(e)))
    p.goto(url); p.wait_for_timeout(1200)
    for strecke in ['wiese', 'alpen']:
        print(strecke, p.evaluate(START, [strecke])); p.wait_for_timeout(1500)
        m = p.evaluate(MESS); print(' Startaufstellung (Radkontur − sichtbare Fläche, cm):', [(x['auto'], x['min_cm']) for x in m])
        p.evaluate(KAM, [1, -1]); p.wait_for_timeout(500)
        p.screenshot(path=os.path.join(aus, f'raeder_boden_{tag}_start_{strecke}.png'))
        if strecke == 'wiese':
            for wo in ['flaeche', 'keil']:
                print(' Werkstatt', wo, p.evaluate(SETZEN, [0, wo])); p.wait_for_timeout(800)
                m = p.evaluate(MESS); print('  Spielerauto:', m[0])
                p.evaluate(KAM, [0, 1 if wo == 'flaeche' else -1]); p.wait_for_timeout(500)
                p.screenshot(path=os.path.join(aus, f'raeder_boden_{tag}_werkstatt_{wo}.png'))
    print('JS-Fehler:', errs); b.close()
