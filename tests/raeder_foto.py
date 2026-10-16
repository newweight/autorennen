#!/usr/bin/env python3
"""W4 (v28): Fotos der Räder jedes Autos beim Losfahren. python3 tests/raeder_foto.py tag strecke [t_sek]"""
import sys, os
from playwright.sync_api import sync_playwright
basis = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
tag = sys.argv[1]; strecke = sys.argv[2]; sek = float(sys.argv[3]) if len(sys.argv) > 3 else 5.5
aus = os.path.join(basis, 'tests', 'out', 'v28')
url = 'file://' + os.path.join(basis, 'Autorennen.html')
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
START = '''([strecke, sek]) => { const s = Rennspiel.spiel;
  s.rennenStarten({ modus: 'solo', streckeId: strecke, welt: 'klassisch', schaden: true, gegner: 3, runden: 3, schwierigkeit: 'mittel', autoIds: ['troc-cabrio'], fahrhilfe: ['aus'] });
  if (!s.laeuft) s.start(); s.uhr.letzte = performance.now(); let t = performance.now();
  s.zeichnen0 = s.zeichnen; s.zeichnen = () => {}; for (let k = 0; k < sek * 60; k++) { t += 1000 / 60; s._frameRumpf(t); } s.zeichnen = s.zeichnen0; s.pausiert = true;
  return s.fahrzeuge.map(f => [f.auto.id, +f.vehicle.tempo.toFixed(1)]); }'''
KAM = '''([i]) => { const g = Rennspiel.spiel, f = g.fahrzeuge[i], k = g.kameras[0]; g._freieKamera = true; k.update = function () {};
  const m = f.mesh, h = m.rotation.y; const sx = Math.cos(h), sz = -Math.sin(h), fx = -Math.sin(h), fz = -Math.cos(h);
  const px = m.position.x, pz = m.position.z, py = m.position.y;
  k.kamera.position.set(px + sx * 3.0 + fx * 1.5, py + 0.55, pz + sz * 3.0 + fz * 1.5); k.kamera.lookAt(px + fx * 1.4, py + 0.35, pz + fz * 1.4);
  g.pausiert = true; g.zeichnen(); return true; }'''
with sync_playwright() as pw:
    b = pw.chromium.launch(args=ARGS); p = b.new_page(viewport={'width': 800, 'height': 450})
    errs = []; p.on('pageerror', lambda e: errs.append(str(e)))
    p.goto(url); p.wait_for_timeout(1200); print(p.evaluate(START, [strecke, sek]))
    for i in (1, 2, 3):
        p.evaluate(KAM, [i]); p.wait_for_timeout(500)
        p.screenshot(path=os.path.join(aus, f'raeder_{tag}_{strecke}_auto{i}.png'))
    print(errs); b.close()
