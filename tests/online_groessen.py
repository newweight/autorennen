#!/usr/bin/env python3
"""Online-Bildschirm und Lobby in 4 Fenstergrößen x beide Spiele: alle wichtigen Knöpfe im Bild, echter page.click.
Bilder: tests/bilder_startfehler/online/. Aufruf: python3 tests/online_groessen.py [moto|auto]"""
import os, sys, time, socket, subprocess
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import matrix_alle as M
from playwright.sync_api import sync_playwright

GR = [(844, 390), (1100, 650), (1280, 800), (400, 225)]
out = os.path.join(M.basis, 'tests', 'bilder_startfehler', 'online'); os.makedirs(out, exist_ok=True)
JS_RECTS = """(sel) => [...document.querySelectorAll(sel)].map(k => { const r = k.getBoundingClientRect(); return [(k.dataset.a || k.textContent).trim().slice(0, 18), Math.round(r.top), Math.round(r.bottom), Math.round(r.left), Math.round(r.right)]; })"""
fehl = 0
spiele = [sys.argv[1]] if len(sys.argv) > 1 else ['moto', 'auto']
with sync_playwright() as p:
    b = p.chromium.launch(args=M.ARGS)
    for spiel in spiele:
        html, gkey = M.SPIELE[spiel]
        port = M.freier_port()
        srv = subprocess.Popen(['node', os.path.join(M.basis, 'server', 'server.js'), '--port', str(port), '--host', '127.0.0.1'] + (['--motorrad'] if spiel == 'moto' else []),
                               stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        try:
            for _ in range(100):
                try: socket.create_connection(('127.0.0.1', port), timeout=0.2).close(); break
                except OSError: time.sleep(0.1)
            for (w, h) in GR:
                pg = M.neue_seite(b, spiel, w, h)
                pg.goto('http://127.0.0.1:%d/%s' % (port, html), wait_until='domcontentloaded')
                pg.wait_for_function('window.Rennspiel && Rennspiel.spiel', timeout=120000, polling=200); pg.wait_for_timeout(800)
                pg.keyboard.press('ShiftLeft')
                pg.evaluate('() => Rennspiel.spiel.menue.onlineOeffnen()'); pg.wait_for_timeout(500)
                r1 = pg.evaluate(JS_RECTS, '#online [data-a="erstellen"], #online [data-a="beitreten"]')
                ok1 = bool(r1) and all(0 <= t and bt <= h and 0 <= l and rr <= w for _, t, bt, l, rr in r1)
                pg.screenshot(path='%s/%s_%dx%d_start.png' % (out, spiel, w, h))
                klick = 'klick-ok'
                try: pg.click('[data-a="erstellen"]', timeout=60000)
                except Exception as e: klick = 'KLICK-FEHL ' + str(e)[:100]
                ok2 = False; r2 = []
                try:
                    pg.wait_for_function("Rennspiel.spiel.menue.onlineUi.ansicht === 'lobby'", timeout=30000, polling=200); pg.wait_for_timeout(600)
                    r2 = pg.evaluate(JS_RECTS, '#online [data-a="wert:runden:1"], #online [data-a="bereit"], #online [data-a="start"], #online [data-a="verlassen"], #online .knopf')
                    pflicht = [x for x in r2 if x[0] in ('verlassen', 'start', 'bereit')]      # Pflicht im Bild; Einstellungs-Pillen dürfen scrollen (Klick wird geprüft)
                    ok2 = bool(pflicht) and all(0 <= t and bt <= h and 0 <= l and rr <= w for _, t, bt, l, rr in pflicht)
                    pg.screenshot(path='%s/%s_%dx%d_lobby.png' % (out, spiel, w, h))
                    k2 = 'klick-ok'
                    try: pg.click('[data-a="wert:runden:1"]', timeout=60000)
                    except Exception as e: k2 = 'KLICK-FEHL ' + str(e)[:100]
                    klick += ' / Lobby ' + k2
                except Exception as e: klick += ' / Lobby: ' + str(e)[:100]
                gut = ok1 and ok2 and 'FEHL' not in klick
                fehl += 0 if gut else 1
                print('%s %dx%d %s start=%s lobby=%s %s %s' % ('OK  ' if gut else 'FEHL', w, h, spiel, 'im Bild' if ok1 else 'AUSSERHALB ' + str(r1), 'im Bild' if ok2 else 'AUSSERHALB ' + str(r2), klick, ''), flush=True)
                pg.context.close()
        finally:
            srv.terminate()
    b.close()
print('Ergebnis: %d FEHL' % fehl)
sys.exit(1 if fehl else 0)
