#!/usr/bin/env python3
"""F1 (v29): Menü-Autoauswahl (echte Bühne R.AutoVorschau) in 30°-Schritten drehen und die Bühne fotografieren.
python3 tests/reifen_menu_shots.py <tag> [auto-index ...]  -> tests/out/v29/reifen_<tag>_<autoId>_<winkel>.png"""
import sys, os
from playwright.sync_api import sync_playwright
basis = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
tag = sys.argv[1]; idx = [int(a) for a in sys.argv[2:]] or [2]
out = os.path.join(basis, 'tests', 'out', 'v29'); os.makedirs(out, exist_ok=True)
url = 'file://' + os.path.join(basis, 'Autorennen.html')
AV = 'Rennspiel.AutoVorschau'
with sync_playwright() as p:
    b = p.chromium.launch(args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
    pg = b.new_page(viewport={'width': 1280, 'height': 800}, device_scale_factor=2)
    fehler = []
    pg.on('pageerror', lambda e: fehler.append(str(e)))
    pg.goto(url)
    pg.wait_for_function('window.Rennspiel && Rennspiel.spiel', timeout=90000)
    pg.wait_for_timeout(1500)
    for _ in range(8):
        if pg.evaluate(AV + '.laeuft'): break
        pg.keyboard.press('Enter'); pg.wait_for_timeout(500)
    print('Vorschau läuft:', pg.evaluate(AV + '.laeuft'), 'Auto', pg.evaluate(AV + '.autoId(0)'))
    for k in idx:
        # gewünschtes Auto: Pfeil rechts bis index erreicht
        for _ in range(12):
            ids = pg.evaluate('Rennspiel.carCatalog.waehlbare().map(a => a.id)')
            if pg.evaluate(AV + '.autoId(0)') == ids[k]: break
            pg.keyboard.press('ArrowRight'); pg.wait_for_timeout(500)
        pg.wait_for_timeout(800)
        aid = pg.evaluate(AV + '.autoId(0)')
        cv = pg.locator('canvas.buehne').first
        box = cv.bounding_box()
        for w in range(0, 360, 30):
            ist = pg.evaluate(AV + '.winkel(0)')
            # Maus ziehen: winkel -= dx*0.6  -> dx = (ist - w)/0.6 (kürzester Weg)
            d = ((ist - w + 180) % 360) - 180
            dx = d / 0.6
            x0 = box['x'] + box['width'] / 2; y0 = box['y'] + box['height'] / 2
            pg.mouse.move(x0, y0); pg.mouse.down(); pg.mouse.move(x0 + dx, y0, steps=4); pg.mouse.up()
            pg.wait_for_timeout(500)
            cv.screenshot(path=os.path.join(out, f'reifen_{tag}_{aid}_{w:03d}.png'))
    print('Fehler:', fehler)
    b.close()
