import os, sys
from playwright.sync_api import sync_playwright
basis = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
bild = os.path.join(basis, 'tests', 'bilder_s2'); os.makedirs(bild, exist_ok=True)
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
wahl = sys.argv[1] if len(sys.argv) > 1 else 'auto'
html, auto, tag = ('Autorennen.html', 'passat', 'auto') if wahl == 'auto' else ('Motorrad.html', 'crossmaschine', 'moto')
with sync_playwright() as p:
    b = p.chromium.launch(args=ARGS)
    page = b.new_context(viewport={'width': 1100, 'height': 650}).new_page(); page.set_default_timeout(60000)
    log = []
    page.on('pageerror', lambda e: log.append('pageerror ' + str(e)))
    page.on('console', lambda m: log.append(m.text) if m.type == 'error' and 'GPU' not in m.text and 'WebGL' not in m.text else None)
    page.goto('file://' + os.path.join(basis, html)); page.wait_for_timeout(1500)
    page.evaluate("Rennspiel.Garage.gutschreiben(Rennspiel.config.fahrer[0].name, 600)")
    page.evaluate("Rennspiel.spiel.menue.garageOeffnen()"); page.wait_for_timeout(300)
    page.evaluate("(a) => { const g = Rennspiel.spiel.menue.garageUi; g.fahrer = Rennspiel.config.fahrer[0].name; g.autoId = a; g.phase = 'werkstatt'; g.zeile = 0; g.zeichnen(); }", auto)
    page.wait_for_timeout(1200)
    page.screenshot(path=os.path.join(bild, 'x_' + tag + '_werkstatt.png'))
    page.click('[data-g="tuning:oeffnen"]'); page.wait_for_timeout(1000)
    page.screenshot(path=os.path.join(bild, 'x_' + tag + '_tuning0.png'))
    for art in ['motor', 'reifen', 'bremsen']:
        for i in range(3):
            page.click('[data-g="tuning:kauf:%s"]' % art); page.wait_for_timeout(150)
    page.wait_for_timeout(1500)
    page.screenshot(path=os.path.join(bild, 'x_' + tag + '_tuning3.png'))
    print(log)
    b.close()
