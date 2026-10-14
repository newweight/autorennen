#!/usr/bin/env python3
"""Polizei-Stopp-Szene + Startaufstellung als Bilder nach tests/out/polizei/<praefix>_*.png.
Aufruf: python3 tests/polizei_screenshot.py <praefix>   (PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers)"""
import sys, os, json
from playwright.sync_api import sync_playwright
basis = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
praefix = sys.argv[1] if len(sys.argv) > 1 else 'x'
out = os.path.join(basis, 'tests', 'out', 'polizei'); os.makedirs(out, exist_ok=True)
url = 'file://' + os.path.join(basis, 'Autorennen.html')
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
STARTEN = '''([strecke, gegner]) => { const s = Rennspiel.spiel;
  s.rennenStarten({ modus: 'solo', streckeId: strecke, welt: 'klassisch', polizei: true, gegner, runden: 3, schwierigkeit: 'mittel',
    autoIds: ['troc-cabrio', 'multivan'], fahrhilfe: ['wenig', 'wenig'], schaden: false, wetter: 'klar', jahreszeit: 'sommer', windStaerke: 0 });
  s.autopilot(0); return true; }'''
# Kamera frei setzen und ein Bild rendern (Spiel pausiert)
KAMERA = '''([px, py, pz, lx, ly, lz]) => { const s = Rennspiel.spiel, k = s.kameras[0].kamera;
  k.position.set(px, py, pz); k.lookAt(lx, ly, lz); k.updateMatrixWorld(true); s.renderer.render(s.szene, k); return true; }'''
with sync_playwright() as p:
    b = p.chromium.launch(args=ARGS)
    page = b.new_page(viewport={'width': 1100, 'height': 700})
    fehler = []
    page.on('pageerror', lambda e: fehler.append(str(e)))
    page.goto(url); page.wait_for_timeout(1500)
    page.evaluate(STARTEN, ['wiese', 5])
    page.wait_for_timeout(800)
    page.screenshot(path=os.path.join(out, f'{praefix}_start.png'))
    # Startaufstellung von hinten/oben
    import math
    pos = page.evaluate('() => Rennspiel.spiel.fahrzeuge.slice(0, 6).map(f => [f.vehicle.x, f.vehicle.z, f.vehicle.heading])')
    mx = sum(q[0] for q in pos) / len(pos); mz = sum(q[1] for q in pos) / len(pos); h = pos[0][2]
    fx, fz = -math.sin(h), -math.cos(h)
    page.evaluate('() => { Rennspiel.spiel.pausiert = true; }')
    page.evaluate(KAMERA, [mx - fx * 16 + 0.0, 8, mz - fz * 16, mx, 0.3, mz])
    page.screenshot(path=os.path.join(out, f'{praefix}_start_oben.png'))
    page.evaluate(KAMERA, [mx + fx * 14 + fz * 6, 3.5, mz + fz * 14 - fx * 6, mx, 0.6, mz])
    page.screenshot(path=os.path.join(out, f'{praefix}_start_vorn.png'))
    page.evaluate('() => { Rennspiel.spiel.pausiert = false; }')
    # bis zum Stopp vorspulen
    stopp = None
    page.evaluate('() => { Rennspiel.spiel.pausiert = true; }')
    for sek in range(1, 1000):
        page.evaluate('() => { const s = Rennspiel.spiel; s.pausiert = false; s.schnellvorlauf(0.25); s.pausiert = true; }')
        if page.evaluate('() => Rennspiel.spiel.polizei.gesperrt(0)'): stopp = sek * 0.25; break
    print('Stopp nach s:', stopp)
    if stopp:
        for _ in range(12):     # bis ~1,3 s vor der Freigabe: das Auto steht, der Streifenwagen daneben
            if page.evaluate('() => Rennspiel.spiel.polizei.logik.rest(0)') < 1.4: break
            page.evaluate('() => { const s = Rennspiel.spiel; s.pausiert = false; s.schnellvorlauf(0.25); s.pausiert = true; }')
        d = page.evaluate('''() => { const s = Rennspiel.spiel, f = s.fahrzeuge[0].vehicle, q = s.fahrzeuge[s.polizei.idx[0]].vehicle;
          return { a: [f.x, f.y, f.z, f.heading, f.vLaengs], p: [q.x, q.y, q.z, q.heading, q.vLaengs], rest: s.polizei.logik.rest(0) }; }''')
        print(json.dumps(d))
        import math
        ax, ay, az, ah = d['a'][:4]; fx, fz = -math.sin(ah), -math.cos(ah); rx, rz = -fz, fx
        px, pz = d['p'][0], d['p'][2]
        seite = 1 if ((px - ax) * rx + (pz - az) * rz) >= 0 else -1
        mx, mz = (ax + px) / 2, (az + pz) / 2
        ansichten = {
          'hinten': [ax - fx * 9, ay + 3.2, az - fz * 9, mx, ay + 0.6, mz],
          'oben': [mx, ay + 14, mz + 0.01, mx, ay, mz],
          'seite': [mx + rx * seite * 9, ay + 2.2, mz + rz * seite * 9, mx, ay + 0.8, mz],
          'schraeg': [px + fx * 5 + rx * seite * 4, ay + 2.2, pz + fz * 5 + rz * seite * 4, px, ay + 1.0, pz],
        }
        for n, v in ansichten.items():
            page.evaluate(KAMERA, v); page.wait_for_timeout(200)
            page.evaluate(KAMERA, v)
            page.screenshot(path=os.path.join(out, f'{praefix}_stopp_{n}.png'))
    print('Fehler:', fehler[:3])
    b.close()
