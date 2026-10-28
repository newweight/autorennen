#!/usr/bin/env python3
"""Entwicklungs-Hilfe: Lenker-Bild groß für Gas/Bremse-Werte zeichnen (ohne Spiel-Rendering). python3 tests/m5_lenker_gross.py [quad]"""
import os, sys
from playwright.sync_api import sync_playwright
basis = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
quad = len(sys.argv) > 1 and sys.argv[1] == 'quad'
out = os.path.join('/tmp/claude-0/-home-claude/06f5acbd-138e-5939-87b4-b590c5132cb1/scratchpad', 'gross%s.png' % ('_quad' if quad else ''))
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
JS = """(quad) => { const cv = document.createElement('canvas'); const W = 1000, H = 294; cv.width = W; cv.height = H * 4;
 const g = cv.getContext('2d'); const vals = [[0,0],[.5,0],[1,0],[0,1]];
 const tmp = document.createElement('canvas'); tmp.width = W; tmp.height = H; const t = tmp.getContext('2d');
 vals.forEach((v, i) => { Rennspiel.Moto.cockpit.lenkerZeichnen(t, W, H, 1000/3.4, { steer: 0, kmh: 0, anteil: 0.1, gang: 'N', bike: 0xff6a10, fahrer: 0x1d4ed8, helm: 0xf4f4f4, nr: 1, zwei: false, gas: v[0], brems: v[1], quad }); g.fillStyle = '#444'; g.fillRect(0, i*H, W, H); g.drawImage(tmp, 0, i*H); });
 return cv.toDataURL(); }"""
import base64
with sync_playwright() as p:
    b = p.chromium.launch(args=ARGS); page = b.new_page()
    page.goto('file://' + os.path.join(basis, 'Motorrad.html')); page.wait_for_timeout(1500)
    d = page.evaluate(JS, quad)
    open(out, 'wb').write(base64.b64decode(d.split(',')[1])); print(out)
