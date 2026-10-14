#!/usr/bin/env python3
"""Passat Haube/Scheibe (14.10., v18): python3 tests/passat_haube_screenshot.py <praefix> [auto]
Bilder Seite, schräg vorne, Front, Seite nah -> tests/out/passat_haube/<praefix>_*.png"""
import sys, os
from playwright.sync_api import sync_playwright
basis = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
pre = sys.argv[1]; auto = sys.argv[2] if len(sys.argv) > 2 else 'passat'
out = os.path.join(basis, 'tests', 'out', 'passat_haube'); os.makedirs(out, exist_ok=True)
ANS = {'seite': (90, 8, 9.5), 'seite_nah': (90, 6, 6.2), 'front35': (35, 18, 9.5), 'front': (0, 8, 9.5), 'front_nah': (30, 12, 6.0), 'seite_hoch': (90, 25, 7)}
with sync_playwright() as p:
    b = p.chromium.launch(args=['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
    pg = b.new_page(viewport={'width': 1100, 'height': 650})
    errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
    for n, (w, h, d) in ANS.items():
        pg.goto('file://%s/tests/autos_vorschau.html?auto=%s&winkel=%d&hoehe=%d&dist=%s' % (basis, auto, w, h, d))
        pg.wait_for_function('window.vorschau', timeout=60000)
        pg.wait_for_timeout(500)
        pg.screenshot(path=os.path.join(out, '%s_%s.png' % (pre, n)))
    print('Fehler:', errs)
    b.close()
