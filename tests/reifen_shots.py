#!/usr/bin/env python3
"""F1 (v29): Auto in mehreren Drehwinkeln/Höhen screenshotten -> tests/out/v29/reifen_<tag>_<auto>_<winkel>_<hoehe>.png
python3 tests/reifen_shots.py <tag> [auto ...]"""
import sys, os
from playwright.sync_api import sync_playwright
basis = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
tag = sys.argv[1]; autos = sys.argv[2:] or ['golf']
out = os.path.join(basis, 'tests', 'out', 'v29'); os.makedirs(out, exist_ok=True)
seite = 'file://' + os.path.join(basis, 'tests', 'autos_vorschau.html')
with sync_playwright() as p:
    b = p.chromium.launch(args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
    pg = b.new_page(viewport={'width': 900, 'height': 500})
    for a in autos:
        for w in (20, 60, 100, 140, 200, 250, 300):
            for h in (5, 25):
                pg.goto(f'{seite}?auto={a}&winkel={w}&hoehe={h}&dist=5.5&lack=weiss')
                pg.wait_for_timeout(350)
                pg.screenshot(path=os.path.join(out, f'reifen_{tag}_{a}_{w}_{h}.png'))
    b.close()
