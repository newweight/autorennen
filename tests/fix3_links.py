#!/usr/bin/env python3
"""FIX3 Punkt 1: Motorrad-Spiel ohne Links zu anderen Spielen. Der „Weitere Spiele“-Link erscheint nur über http(s) (nicht über file://) –
deshalb wird hier über einen kleinen lokalen Webserver geprüft. Motorrad.html: keine <a href>, kein Text „Weitere Spiele“ in Menü/Pause/Ergebnis; Autorennen.html: Link bleibt wie bisher."""
import os, sys, threading, http.server, socketserver, functools
from playwright.sync_api import sync_playwright
BASIS = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
H = functools.partial(http.server.SimpleHTTPRequestHandler, directory=BASIS)
class Leise(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
H = functools.partial(Leise, directory=BASIS)
srv = socketserver.TCPServer(('127.0.0.1', 0), H); port = srv.server_address[1]
threading.Thread(target=srv.serve_forever, daemon=True).start()
fail = 0
def pruefe(name, gut, info=''):
    global fail
    print(('OK   ' if gut else 'FEHL ') + name + ('  (' + str(info) + ')' if info != '' else ''))
    if not gut: fail += 1
JS_LINKS = "() => Array.from(document.querySelectorAll('a[href], [data-href], [onclick*=location], [onclick*=\"window.open\"]')).map(e => (e.getAttribute('href') || e.outerHTML.slice(0, 60)))"
JS_TEXT = "() => { const t = document.body.innerText || ''; return /Weitere Spiele|Radwelt|Spieleportal|Schach|4 gewinnt|Vier gewinnt/i.test(t); }"
with sync_playwright() as p:
    b = p.chromium.launch(args=ARGS)
    for seite, erwartet in (('Motorrad.html', 0), ('Autorennen.html', 1)):
        pg = b.new_context(viewport={'width': 1100, 'height': 700}).new_page(); pg.set_default_timeout(120000)
        fehler = []; pg.on('pageerror', lambda e: fehler.append(str(e)))
        pg.goto(f'http://127.0.0.1:{port}/{seite}'); pg.wait_for_function('window.Rennspiel && Rennspiel.spiel'); pg.wait_for_timeout(1500)
        links = pg.evaluate(JS_LINKS)
        pruefe(f'{seite}: Hauptmenü, Links = {erwartet}', len(links) == erwartet, links)
        if seite == 'Motorrad.html':
            pruefe('Motorrad: kein Text zu anderen Spielen im Menü', not pg.evaluate(JS_TEXT))
            # alle Menü-Schritte durchblättern, dann Rennen + Pause + Ergebnis
            for i in range(5):
                pg.evaluate("([i]) => { const m = Rennspiel.spiel.menue; m.schritt = i; m.zeichnen(); }", [i])
                links = pg.evaluate(JS_LINKS); pruefe(f'Motorrad Menü-Schritt {i}: keine Links', not links and not pg.evaluate(JS_TEXT), links)
            pg.evaluate("""() => { const s = Rennspiel.spiel; s.rennenStarten({ modus: 'solo', runden: 1, gegner: 1, streckeId: 'wiese', autoIds: ['crossmaschine', 'crossmaschine-rot'], schwierigkeit: 'mittel', fahrhilfe: ['wenig', 'wenig'] }); }""")
            pg.wait_for_timeout(1500)
            pg.keyboard.press('Escape'); pg.wait_for_timeout(600)
            links = pg.evaluate(JS_LINKS); pruefe('Motorrad Pause: keine Links', not links and not pg.evaluate(JS_TEXT), links)
            pg.keyboard.press('Escape'); pg.wait_for_timeout(300)
            pg.evaluate("""() => { const s = Rennspiel.spiel; if (s.rennenBeenden) s.rennenBeenden(); else if (s.ergebnisZeigen) s.ergebnisZeigen(); }""")
            pg.wait_for_timeout(800)
            links = pg.evaluate(JS_LINKS); pruefe('Motorrad nach Rennen/Ergebnis: keine Links', not links and not pg.evaluate(JS_TEXT), links)
        pruefe(f'{seite}: keine Seitenfehler', not fehler, fehler[:2])
        pg.context.close()
    b.close()
srv.shutdown()
print('FEHLER:', fail); sys.exit(1 if fail else 0)
