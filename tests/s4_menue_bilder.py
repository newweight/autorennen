#!/usr/bin/env python3
"""S4 Teil A – Menü „Los!“-Schritt bei 1100x650, 1280x800, 390x844, 844x390 (beide Spiele): Bilder + Prüfung Start-Knopf/Schalter sichtbar. Aufruf: python3 tests/s4_menue_bilder.py [praefix]"""
import os, sys
from playwright.sync_api import sync_playwright
basis = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
bild = os.path.join(basis, 'tests', 'bilder_s4'); os.makedirs(bild, exist_ok=True)
pre = sys.argv[1] if len(sys.argv) > 1 else 'menue'
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
GROESSEN = [(1100, 650), (1280, 800), (390, 844), (844, 390)]
JS = """() => { const w = document.querySelector('#menue'), inh = w.querySelector('.m-inhalt'), fuss = w.querySelector('.m-fuss').getBoundingClientRect();
  const sk = w.querySelector('.start-knopf'); const r = sk ? sk.getBoundingClientRect() : null; const ir = inh.getBoundingClientRect();
  return { start: !!r, startSichtbar: r ? (r.bottom <= fuss.top + 2 && r.top >= ir.top - 2 && r.bottom <= innerHeight && r.right <= innerWidth + 1) : false,
           fussUnten: fuss.bottom <= innerHeight + 1, scrollbar: inh.scrollHeight > inh.clientHeight + 1, seitlich: document.documentElement.scrollWidth <= innerWidth + 1 }; }"""
ok = True
with sync_playwright() as p:
    b = p.chromium.launch(args=ARGS)
    for html, tag in [('Autorennen.html', 'auto'), ('Motorrad.html', 'moto')]:
        for (w, h) in GROESSEN:
            ctx = b.new_context(viewport={'width': w, 'height': h}, has_touch=(w < 900 or h < 500), is_mobile=(w < 900 or h < 500))
            page = ctx.new_page(); page.set_default_timeout(120000)
            page.goto('file://' + os.path.join(basis, html)); page.wait_for_function('window.Rennspiel && Rennspiel.spiel'); page.wait_for_timeout(1500)
            page.evaluate("Rennspiel.spiel.menue.zeigen(4)"); page.wait_for_timeout(500)
            r = page.evaluate(JS)
            gut = r['startSichtbar'] and r['fussUnten'] and r['seitlich']
            ok = ok and gut
            print(('OK   ' if gut else 'FEHL ') + f'{tag} {w}x{h}', r)
            page.screenshot(path=os.path.join(bild, f'{pre}_{tag}_{w}x{h}.png'))
            ctx.close()
    b.close()
sys.exit(0 if ok else 1)
