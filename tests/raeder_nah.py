#!/usr/bin/env python3
"""W4 (v28): Nahaufnahmen der Räder eines Nachbarautos (Start + Losfahren). python3 tests/raeder_nah.py [vorher|nachher] [strecke]"""
import sys, os
from playwright.sync_api import sync_playwright
basis = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
tag = sys.argv[1] if len(sys.argv) > 1 else 'vorher'; strecke = sys.argv[2] if len(sys.argv) > 2 else 'wiese'
aus = os.path.join(basis, 'tests', 'out', 'v28')
url = 'file://' + os.path.join(basis, 'Autorennen.html')
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
START = '''([strecke]) => { const s = Rennspiel.spiel;
  s.rennenStarten({ modus: 'solo', streckeId: strecke, welt: 'klassisch', schaden: true, gegner: 3, runden: 3, schwierigkeit: 'mittel', autoIds: ['troc-cabrio'], fahrhilfe: ['aus'] });
  if (!s.laeuft) s.start(); return s.fahrzeuge.map(f => f.auto && (f.auto.id || f.auto)); }'''
# Freie Kamera seitlich-vorn am Auto i (Abstand 3.2 m, Höhe 0.5)
KAM = '''([i]) => { const g = Rennspiel.spiel, f = g.fahrzeuge[i], k = g.kameras[0]; g._freieKamera = true; k.update = function () {};
  const m = f.mesh, h = m.rotation.y; const sx = Math.cos(h), sz = -Math.sin(h);   // rechte Seite grob
  const px = m.position.x, pz = m.position.z, py = m.position.y;
  const fx = -Math.sin(h), fz = -Math.cos(h);
  k.kamera.position.set(px + sx * 3.4 + fx * 1.2, py + 0.7, pz + sz * 3.4 + fz * 1.2); k.kamera.lookAt(px + fx * 1.2, py + 0.35, pz + fz * 1.2); return [h]; }'''
with sync_playwright() as pw:
    b = pw.chromium.launch(args=ARGS); p = b.new_page(viewport={'width': 1000, 'height': 560})
    errs = []; p.on('pageerror', lambda e: errs.append(str(e)))
    p.goto(url); p.wait_for_timeout(1200); print(p.evaluate(START, [strecke]))
    p.wait_for_timeout(3500)
    for t in range(6):
        p.evaluate(KAM, [1]); p.wait_for_timeout(350)
        p.screenshot(path=os.path.join(aus, f'raeder_{tag}_{strecke}_nah{t}.png'))
    print(errs); b.close()
