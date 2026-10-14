#!/usr/bin/env python3
"""T-Roc Screenshots: python3 tests/troc_screenshot.py <praefix> [extra-query]  -> tests/out/troc/<praefix>_<ansicht>.png
Ansichten: front35, seite, heck215, heck_nah (offen/zu je nach &dach=, Lack &lack=)."""
import sys, os
from playwright.sync_api import sync_playwright
basis = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
pre = sys.argv[1] if len(sys.argv) > 1 else 'x'
extra = sys.argv[2] if len(sys.argv) > 2 else ''
out = os.path.join(basis, 'tests', 'out', 'troc'); os.makedirs(out, exist_ok=True)
seite = 'file://' + os.path.join(basis, 'tests', 'autos_vorschau.html')
V = {'front35': (35, 18, 6.5), 'seite': (90, 8, 7.5), 'heck215': (215, 18, 6.5), 'front0': (0, 10, 6.5), 'oben': (150, 55, 7.5)}
with sync_playwright() as p:
    b = p.chromium.launch(args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
    pg = b.new_page(viewport={'width': 1000, 'height': 600})
    err = []
    pg.on('pageerror', lambda e: err.append(str(e)))
    for n, (w, h, d) in V.items():
        pg.goto(f'{seite}?auto=troc-cabrio&winkel={w}&hoehe={h}&dist={d}{extra}')
        pg.wait_for_timeout(500)
        pg.screenshot(path=os.path.join(out, f'{pre}_{n}.png'))
    print('fehler', err)
    b.close()
