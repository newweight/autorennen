#!/usr/bin/env python3
"""FIX2 Teil 1 – Grafik-Knopf in jedem Menü-Schritt, beiden Spielen, allen Größen: sichtbar/im Bild/nicht verdeckt/klickbar/schaltet. Aufruf: python3 tests/fix2_grafik.py [praefix]"""
import os, sys
from playwright.sync_api import sync_playwright
basis = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
bild = os.path.join(basis, 'tests', 'bilder_fix2'); os.makedirs(bild, exist_ok=True)
pre = sys.argv[1] if len(sys.argv) > 1 else 'grafik'
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
GROESSEN = [(1440, 900), (1280, 800), (1100, 650), (390, 844), (844, 390)]
JS = """() => { const k = [...document.querySelectorAll('#menue [data-g1]')];
  return k.map(e => { const r = e.getBoundingClientRect(); const cx = Math.min(innerWidth-1, Math.max(0, r.left + r.width/2)), cy = Math.min(innerHeight-1, Math.max(0, r.top + r.height/2));
    const top = document.elementFromPoint(cx, cy); const imBild = r.width > 0 && r.height > 0 && r.left >= -1 && r.top >= -1 && r.right <= innerWidth + 1 && r.bottom <= innerHeight + 1;
    return { text: e.textContent, imBild, offen: !!top && (top === e || e.contains(top)), w: Math.round(r.width), h: Math.round(r.height), x: Math.round(r.left), y: Math.round(r.top) }; }); }"""
ok = True
with sync_playwright() as p:
    b = p.chromium.launch(args=ARGS)
    for html, tag in [t for t in [('Autorennen.html', 'auto'), ('Motorrad.html', 'moto')] if len(sys.argv) < 3 or t[1] == sys.argv[2]]:
        for (w, h) in GROESSEN:
            ctx = b.new_context(viewport={'width': w, 'height': h}, has_touch=(w < 900 or h < 500), is_mobile=(w < 900 or h < 500))
            page = ctx.new_page(); page.set_default_timeout(120000)
            errs = []; page.on('pageerror', lambda e: errs.append(str(e)))
            page.goto('file://' + os.path.join(basis, html)); page.wait_for_function('window.Rennspiel && Rennspiel.spiel'); page.wait_for_timeout(1500)
            page.evaluate("try{localStorage.clear()}catch(e){}")
            for schritt in range(1, 5):
                page.evaluate(f"Rennspiel.spiel.menue.zeigen({schritt})"); page.wait_for_timeout(400)
                r = page.evaluate(JS)
                gut = len(r) >= 1 and all(x['imBild'] and x['offen'] and x['h'] >= 28 for x in r)
                ok = ok and gut
                print(('OK   ' if gut else 'FEHL ') + f'{tag} {w}x{h} schritt{schritt}', r)
                if schritt in (1, 4) or not gut:
                    try: page.screenshot(path=os.path.join(bild, f'{pre}_{tag}_{w}x{h}_s{schritt}.png'), timeout=120000)
                    except Exception as e: print('   (Bild fehlgeschlagen)', str(e)[:60])
            # Klick-Test im Schritt 1: Normal -> Schön -> Ultra -> Normal
            page.evaluate("Rennspiel.spiel.menue.zeigen(1)"); page.wait_for_timeout(300)
            seq = []
            for i in range(3 if (w, h) in ((1280, 800), (390, 844)) else 0):
                try:
                    page.locator('#menue [data-g1]').first.click(timeout=60000)
                except Exception as e:
                    seq.append('KLICKFEHLER'); break
                page.wait_for_timeout(1500); seq.append(page.locator('#menue [data-g1]').first.text_content())
            gk = seq == ['✨ Grafik: Schön', '✨ Grafik: Ultra', '✨ Grafik: Normal'] or (w, h) not in ((1280, 800), (390, 844))
            ok = ok and gk
            print(('OK   ' if gk else 'FEHL ') + f'{tag} {w}x{h} klick', seq, errs[:2])
            ctx.close()
    b.close()
sys.exit(0 if ok else 1)
