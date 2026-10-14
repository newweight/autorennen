#!/usr/bin/env python3
"""Nahaufnahmen für die Optik-Prüfung: python3 tests/schach3d_nah.py [klassisch|hunde] [name az el dist ...]"""
import sys, os, socket, subprocess, time
from playwright.sync_api import sync_playwright
basis = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
out = os.path.join(basis, 'tests', 'out', 'schach3d'); os.makedirs(out, exist_ok=True)
modus = sys.argv[1] if len(sys.argv) > 1 else 'klassisch'
s = socket.socket(); s.bind(('127.0.0.1', 0)); port = s.getsockname()[1]; s.close()
srv = subprocess.Popen(['node', os.path.join(basis, 'server', 'server.js'), '--port', str(port), '--host', '127.0.0.1'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
for _ in range(80):
    try: socket.create_connection(('127.0.0.1', port), timeout=0.2).close(); break
    except OSError: time.sleep(0.1)
ansichten = [('nah_vorn', 0, 0.45, 7.0), ('nah_schraeg', 0.6, 0.55, 7.2), ('nah_hinten', 3.14159, 0.5, 7.5)]
with sync_playwright() as p:
    b = p.chromium.launch(args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
    pg = b.new_page(viewport={'width': 1000, 'height': 640})
    fehler = []
    pg.on('pageerror', lambda e: fehler.append(str(e)))
    pg.on('console', lambda m: fehler.append(m.text) if m.type == 'error' else None)
    pg.goto('http://127.0.0.1:%d/spiele/schach/3d/demo.html?manuell&q=hoch%s' % (port, '&hunde' if modus == 'hunde' else '')); pg.wait_for_function('window.demo')
    for n, az, el, d in ansichten:
        pg.evaluate('demo.s3.kameraSetzen(%f,%f,%f); demo.schritt(0.1)' % (az, el, d))
        pg.query_selector('#buehne').screenshot(path=os.path.join(out, '%s_%s.png' % (n, modus))); print(n)
    print('Fehler:', fehler or 'keine'); b.close()
srv.terminate()
