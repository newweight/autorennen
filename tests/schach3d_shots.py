#!/usr/bin/env python3
"""Schach-3D (spiele/schach/3d/): Screenshots + Smoke-Test mit Playwright.
Aufruf: python3 tests/schach3d_shots.py [satz] [ausgabeordner]   (satz: alle | klassisch | hunde | kampf | wenden | ...)
Startet server/server.js auf freiem Port, öffnet demo.html im Testmodus (?manuell&q=hoch), steuert die Zeit von Hand."""
import sys, os, socket, subprocess, time, json
from playwright.sync_api import sync_playwright

basis = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
satz = sys.argv[1] if len(sys.argv) > 1 else 'alle'
out = sys.argv[2] if len(sys.argv) > 2 else os.path.join(basis, 'tests', 'out', 'schach3d')
os.makedirs(out, exist_ok=True)
fehler = []

s = socket.socket(); s.bind(('127.0.0.1', 0)); port = s.getsockname()[1]; s.close()
srv = subprocess.Popen(['node', os.path.join(basis, 'server', 'server.js'), '--port', str(port), '--host', '127.0.0.1'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
for _ in range(80):
    try: socket.create_connection(('127.0.0.1', port), timeout=0.2).close(); break
    except OSError: time.sleep(0.1)
URL = 'http://127.0.0.1:%d/spiele/schach/3d/demo.html' % port

def opener(p, extra='', w=1100, h=720):
    b = p.chromium.launch(args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
    pg = b.new_page(viewport={'width': w, 'height': h})
    pg.on('pageerror', lambda e: fehler.append('pageerror: ' + str(e)))
    pg.on('console', lambda m: fehler.append('console: ' + m.text) if m.type in ('error',) else None)
    pg.goto(URL + '?manuell&q=hoch' + extra); pg.wait_for_load_state('load')
    pg.wait_for_function('window.demo && window.s3')
    pg.evaluate('demo.schritt(0.05)')
    return b, pg

def shot(pg, name, clip_buehne=True):
    pg.evaluate('demo.s3.schritt(0.001)')
    el = pg.query_selector('#buehne') if clip_buehne else None
    pth = os.path.join(out, name + '.png')
    (el.screenshot(path=pth) if el else pg.screenshot(path=pth))
    print('Bild', pth, flush=True)

with sync_playwright() as p:
    if satz in ('alle', 'klassisch'):
        b, pg = opener(p)
        pg.evaluate('demo.schritt(0.2)'); shot(pg, 'klassisch')
        print('Stats', pg.evaluate('demo.stats()'))
        pg.evaluate("demo.s3.markiere([{row:4,col:4},{row:5,col:4}],[{row:1,col:3}],{ausgewaehlt:{row:6,col:4},letzterZug:{from:{row:6,col:3},to:{row:5,col:3}}})")
        shot(pg, 'klassisch_markiert'); b.close()
    if satz in ('alle', 'hunde'):
        b, pg = opener(p, '&hunde')
        pg.evaluate('demo.schritt(0.2)'); shot(pg, 'hunde')
        print('Stats', pg.evaluate('demo.stats()')); b.close()
    if satz in ('alle', 'kampf'):
        nur = os.environ.get('KAMPF')
        for typ, zeiten in [t for t in [('knight', [0.55, 0.8]), ('rook', [0.55, 0.8]), ('bishop', [0.7, 0.95]), ('queen', [0.7, 1.2]), ('pawn', [0.5, 0.75]), ('king', [0.5, 0.75])] if not nur or t[0] in nur.split(',')]:
            for dog in ((False, True) if not os.environ.get('NUR_HUNDE') else (True,)):
                b, pg = opener(p, '&hunde' if dog else '')
                pg.evaluate('demo.schritt(0.2)')
                pg.evaluate("(kampfStart('%s'), 0)" % typ)
                t = 0
                for z in zeiten:
                    pg.evaluate('demo.schritt(%f)' % (z - t)); t = z
                    shot(pg, 'kampf_%s_%s_%d' % (typ, 'hunde' if dog else 'klassisch', int(z * 100)))
                b.close()
    if satz in ('alle', 'wenden'):
        b, pg = opener(p)
        pg.evaluate("(demo.s3.wenden(), 0)"); pg.evaluate('demo.schritt(0.5)'); shot(pg, 'wenden_mitte')
        pg.evaluate('demo.schritt(0.7)'); shot(pg, 'gewendet'); b.close()
        b, pg = opener(p, '&hunde&schwarz'); pg.evaluate('demo.schritt(0.2)'); shot(pg, 'gewendet_hunde'); b.close()

print('JS-Fehler:', fehler if fehler else 'keine')
srv.terminate()
sys.exit(1 if fehler else 0)
