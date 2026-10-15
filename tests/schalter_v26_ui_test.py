#!/usr/bin/env python3
"""v26 Internet-Schalter bei der Einladung (Lobby): python3 tests/schalter_v26_ui_test.py [ausgabeordner]
Prüft mit Tailscale-Attrappen (Serve / Serve ohne Identität / Funnel / ohne Header) und simuliertem Helfer (status.json):
Knopf + Hinweis „Freund ohne Tailscale?“ direkt bei Code/Link/QR, echter Status (nur Tailnet / offen bis hh:mm / schaltet / Helfer antwortet nicht),
Aktualisierung ohne Tippen, Funnel-Gäste sehen nichts, Tailnet-Gerät ohne Schalter-Server und lokale Verbindung bekommen eine Erklärung."""
import sys, os, socket, subprocess, time, tempfile, shutil
from playwright.sync_api import sync_playwright
basis = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
out = sys.argv[1] if len(sys.argv) > 1 else os.path.join(basis, 'tests', 'out', 'v26')
os.makedirs(out, exist_ok=True)
pruefungen, fehler = [], []
def pruefe(name, ok, info=''):
    pruefungen.append({'test': name, 'ok': bool(ok), 'info': info})
    print(('OK   ' if ok else 'FAIL ') + name + (' – ' + str(info).replace('\n', ' | ') if info != '' else ''), flush=True)
def frei():
    s = socket.socket(); s.bind(('127.0.0.1', 0)); p = s.getsockname()[1]; s.close(); return p
def warten_auf_port(p):
    for _ in range(80):
        try: socket.create_connection(('127.0.0.1', p), timeout=0.2).close(); return
        except OSError: time.sleep(0.1)
steu = tempfile.mkdtemp(prefix='steuerung-v26-')
import threading
MODUS = [None]
def status(funnel, bis='null'):
    MODUS[0] = (funnel, bis); schreibe()
def schreibe():
    m = MODUS[0]
    if m is None: return
    with open(os.path.join(steu, 'status.json'), 'w') as f: f.write('{"funnel":"%s","bis":%s,"zeit":%d}' % (m[0], m[1], int(time.time() * 1000)))
def helfer_schleife():          # simulierter root-Helfer: schreibt alle 2 s einen frischen Status
    while True:
        time.sleep(2)
        try: schreibe()
        except Exception: pass
threading.Thread(target=helfer_schleife, daemon=True).start()
def server(mit_steuerung=True):
    p = frei()
    args = ['node', os.path.join(basis, 'server', 'server.js'), '--port', str(p), '--host', '127.0.0.1'] + (['--steuerung', steu] if mit_steuerung else [])
    pr = subprocess.Popen(args, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL); warten_auf_port(p); return pr, p
def proxy(art, ziel):
    pp = frei()
    pr = subprocess.Popen(['node', os.path.join(basis, 'tests', 'tailscale_proxy_stub.js'), str(pp), str(ziel), art], stdout=subprocess.PIPE, text=True)
    pr.stdout.readline(); return pr, 'http://127.0.0.1:%d/' % pp
procs = []
try:
    sv, port = server(True); procs.append(sv)
    sv0, port0 = server(False); procs.append(sv0)
    with sync_playwright() as p:
        browser = p.chromium.launch(args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
        def lobby(adresse, name):
            ctx = browser.new_context(viewport={'width': 1280, 'height': 800}); pg = ctx.new_page()
            pg.on('pageerror', lambda e: fehler.append(name + ': ' + str(e)))
            pg.on('console', lambda m: fehler.append(name + ' console.error: ' + m.text) if m.type == 'error' else None)
            pg.goto(adresse); pg.wait_for_function('window.Rennspiel && Rennspiel.spiel', timeout=90000, polling=200); pg.wait_for_timeout(500)
            for _ in range(4): pg.keyboard.press('ArrowRight'); pg.wait_for_timeout(80)
            pg.keyboard.press('Enter'); pg.wait_for_timeout(1200)
            pg.keyboard.press('Enter')     # Raum erstellen
            pg.wait_for_selector('#online .on-lobby', timeout=15000); pg.wait_for_timeout(800)
            return ctx, pg
        einl = lambda pg: pg.inner_text('#online .on-einladung')

        # 1) Tailnet-Gerät (Serve, Identität + XFF), Helfer aus
        status('aus')
        pr, url = proxy('serve', port); procs.append(pr)
        ctx, pg = lobby(url, 'Serve')
        t = einl(pg)
        pruefe('Lobby (Serve): bei Code/Link steht „Freund ohne Tailscale?“ mit Hinweis auf Internet für Freunde', 'Freund ohne Tailscale' in t and 'Internet für Freunde' in t, t)
        pruefe('Lobby (Serve): Status „🔒 … AUS – nur Tailnet“ + Knopf Einschalten', 'nur Tailnet' in t and 'Einschalten' in t, t)
        pg.screenshot(path=os.path.join(out, 'lobby_aus.png'))
        pg.click('#online .on-einladung [data-a="schalter"]'); pg.wait_for_timeout(300)
        pruefe('Lobby: erster Tipp fragt „Sicher?“, schreibt noch nichts', 'Sicher?' in einl(pg) and not open(os.path.join(steu, 'wunsch.json')).read() if os.path.exists(os.path.join(steu, 'wunsch.json')) else 'Sicher?' in einl(pg), einl(pg))
        pg.click('#online .on-einladung [data-a="schalter"]'); pg.wait_for_timeout(500)
        w = open(os.path.join(steu, 'wunsch.json')).read() if os.path.exists(os.path.join(steu, 'wunsch.json')) else ''
        pruefe('Lobby: zweiter Tipp schreibt {"funnel":"an",…}', w.startswith('{"funnel":"an","seit":'), w)
        pruefe('Lobby: danach „⏳ schaltet …“ ohne Knopf', 'schaltet' in einl(pg) and 'Einschalten' not in einl(pg), einl(pg))
        pg.screenshot(path=os.path.join(out, 'lobby_schaltet.png'))
        status('an', str(int(time.time() * 1000) + 3 * 3600000 + 42 * 60000))
        pg.wait_for_function("document.querySelector('#online .on-einladung').textContent.includes('offen bis')", timeout=9000, polling=200)
        t = einl(pg)
        import re
        pruefe('Lobby: ohne Tippen aktualisiert sich der Status → „🌐 AN – offen bis hh:mm (noch 3:4x h)“ + Ausschalten', re.search(r'offen bis \d\d:\d\d', t) and 'noch 3:4' in t and 'Ausschalten' in t, t)
        pg.screenshot(path=os.path.join(out, 'lobby_an.png'))
        pruefe('Lobby: Layout ohne Scrollen (1280×800)', pg.evaluate("(() => { const m = document.querySelector('#online .m-inhalt'); return m.scrollHeight <= m.clientHeight + 1; })()"))
        MODUS[0] = None; os.remove(os.path.join(steu, 'status.json'))
        pg.wait_for_function("document.querySelector('#online .on-einladung').textContent.includes('Helfer antwortet nicht')", timeout=9000, polling=200)
        t = einl(pg)
        pruefe('Helfer-Status fehlt → „Helfer antwortet nicht (keine Status-Datei …) – installieren.command“, kein Knopf', 'keine Status-Datei' in t and 'installieren.command' in t and 'Einschalten' not in t, t)
        pg.screenshot(path=os.path.join(out, 'lobby_helfer_fehlt.png'))
        ctx.close()        # (Rechte-Fall „Wunsch-Datei nicht beschreibbar“: tests/test_schalter_v26.js, Abschnitt D, als anderer Benutzer)

        # 2) Serve ohne Identitäts-Header (nur X-Forwarded-For) → Knopf trotzdem da
        status('aus'); pr2, url2 = proxy('serve-ohne-identitaet', port); procs.append(pr2)
        ctx, pg = lobby(url2, 'ohneIdentitaet')
        pruefe('Lobby (Serve ohne Identitäts-Header, nur Tailnet-IP): Knopf trotzdem da', 'Einschalten' in einl(pg), einl(pg))
        ctx.close()

        # 3) Funnel-Gast: kein Hinweis, kein Knopf, keine Erklärung
        status('aus'); pf, urlf = proxy('funnel', port); procs.append(pf)
        ctx, pg = lobby(urlf, 'Funnel')
        t = einl(pg)
        pruefe('Funnel-Gast: in der Lobby weder Knopf noch Hinweis noch Erklärung', 'Freund ohne Tailscale' not in t and 'Internet' not in t and 'schalter' not in pg.inner_html('#online').lower().replace('on-schalter', ''), t)
        pg.screenshot(path=os.path.join(out, 'lobby_funnel_gast.png'))
        ctx.close()

        # 4) lokal ohne Header (http://localhost)
        ctx, pg = lobby('http://127.0.0.1:%d/' % port, 'lokal')
        t = einl(pg)
        pruefe('Lokal ohne Tailscale: Erklärung „nur von Tailscale-Geräten“, kein Knopf', 'nur von Tailscale-Geräten' in t and 'Einschalten' not in t, t)
        pg.screenshot(path=os.path.join(out, 'lobby_lokal.png'))
        ctx.close()

        # 5) Server ohne --steuerung, Tailnet-Gerät
        pr5, url5 = proxy('serve', port0); procs.append(pr5)
        ctx, pg = lobby(url5, 'ohneSteuerung')
        t = einl(pg)
        pruefe('Server ohne --steuerung (Tailnet-Gerät): „Server ohne Schalter eingerichtet – installieren.command ausführen“', 'Server ohne Schalter eingerichtet' in t and 'installieren.command' in t and 'Einschalten' not in t, t)
        pg.screenshot(path=os.path.join(out, 'lobby_ohne_steuerung.png'))
        ctx.close()
        browser.close()
finally:
    for pr in procs:
        try: pr.terminate()
        except Exception: pass
    shutil.rmtree(steu, ignore_errors=True)
pruefe('keine JS-Fehler', not fehler, fehler[:5])
n_ok = sum(1 for x in pruefungen if x['ok'])
print(f'\n{n_ok}/{len(pruefungen)} OK')
sys.exit(0 if n_ok == len(pruefungen) else 1)
