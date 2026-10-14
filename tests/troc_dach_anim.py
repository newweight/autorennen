#!/usr/bin/env python3
"""Klappbewegung des T-Roc-Verdecks: python3 tests/troc_dach_anim.py <praefix> -> tests/out/troc/<praefix>_anim.png
(Zustände p = 1, 0.8, 0.6, 0.4, 0.2, 0 von schräg hinten und von der Seite)"""
import sys, os
from playwright.sync_api import sync_playwright
from PIL import Image
basis = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
pre = sys.argv[1] if len(sys.argv) > 1 else 'x'
out = os.path.join(basis, 'tests', 'out', 'troc')
seite = 'file://' + os.path.join(basis, 'tests', 'autos_vorschau.html')
zeilen = []
with sync_playwright() as p:
    b = p.chromium.launch(args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
    pg = b.new_page(viewport={'width': 800, 'height': 480})
    for (w, h) in ((215, 18), (90, 8)):
        reihe = []
        for pv in (1, 0.8, 0.6, 0.4, 0.2, 0):
            pg.goto(f'{seite}?auto=troc-cabrio&winkel={w}&hoehe={h}&dist=7&dach={pv}')
            pg.wait_for_timeout(350)
            f = os.path.join(out, f'_tmp_{w}_{pv}.png'); pg.screenshot(path=f); reihe.append(Image.open(f).convert('RGB').resize((400, 240)))
            os.remove(f)
        zeilen.append(reihe)
    b.close()
c = Image.new('RGB', (400 * 3, 240 * 4))
for r, reihe in enumerate(zeilen):
    for i, im in enumerate(reihe): c.paste(im, ((i % 3) * 400, (r * 2 + i // 3) * 240))
c.save(os.path.join(out, f'{pre}_anim.png'))
