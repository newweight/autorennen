#!/usr/bin/env python3
"""v19 Internet-Schalter im Browser (schnell, ohne Rennen): python3 tests/schalter_ui_test.py [ausgabeordner]
Eigener Server mit --steuerung; Browser OHNE Tailnet-Header → Schalter unsichtbar, Taste I wirkungslos; Browser MIT Tailscale-User-Login-Header
→ Zeile „Internet für Freunde“, Nachfrage beim Einschalten, Wunsch-Datei, Status vom (simulierten) Helfer, Ausschalten, Layout. Server OHNE --steuerung → unsichtbar.
Die gleichen Prüfungen laufen auch in tests/online_test.py (dort zusammen mit dem langen Rennen)."""
import sys, os, socket, subprocess, time, json
from playwright.sync_api import sync_playwright
basis = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
out = sys.argv[1] if len(sys.argv) > 1 else os.path.join(basis, 'tests', 'out', 'online')
os.makedirs(out, exist_ok=True)
pruefungen, fehler = [], []
def pruefe(name, ok, info=''):
    pruefungen.append({'test': name, 'ok': bool(ok), 'info': info})
    print(('OK   ' if ok else 'FAIL ') + name + (' – ' + str(info) if info != '' else ''), flush=True)
def frei():
    s = socket.socket(); s.bind(('127.0.0.1', 0)); p = s.getsockname()[1]; s.close(); return p
def starten(args):
    p = frei()
    pr = subprocess.Popen(['node', os.path.join(basis, 'server', 'server.js'), '--port', str(p), '--host', '127.0.0.1'] + args, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
    for _ in range(50):
        try: socket.create_connection(('127.0.0.1', p), timeout=0.2).close(); break
        except OSError: time.sleep(0.1)
    return pr, 'http://127.0.0.1:%d/' % p
srv, url = starten([])
try:
    with sync_playwright() as p:
        browser = p.chromium.launch(args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
        def seite(name):
            pg = browser.new_context(viewport={'width': 1280, 'height': 800}).new_page()
            pg.on('pageerror', lambda e: fehler.append(name + ': ' + str(e)))
            pg.on('console', lambda m: fehler.append(name + ' console.error: ' + m.text) if m.type == 'error' else None)
            return pg
        def onlineOeffnen_(pg, adresse):
            pg.goto(adresse)
            pg.wait_for_function('window.Rennspiel && Rennspiel.spiel', timeout=90000, polling=200)
            pg.wait_for_timeout(500)
            for _ in range(4): pg.keyboard.press('ArrowRight'); pg.wait_for_timeout(80)
            pg.keyboard.press('Enter'); pg.wait_for_timeout(1200)
        host = seite('Host')
        onlineOeffnen_(host, url)
        sch = host.evaluate("({ box: (() => { const e = document.querySelector('#online .on-schalter-box'); return e ? getComputedStyle(e).display : null; })(), text: document.querySelector('#online').textContent.includes('Internet für Freunde'), obj: Rennspiel.spiel.menue.onlineUi.schalter })")
        pruefe('Internet-Schalter: ohne --steuerung / ohne Tailnet-Header unsichtbar (Box ausgeblendet, kein Text, kein Recht)', sch['box'] in (None, 'none') and not sch['text'] and sch['obj'] is None, sch)
        host.screenshot(path=os.path.join(out, 'online_1_start.png'))

        # ---------- v19 Internet-Schalter (eigener Server mit --steuerung, Browser mit/ohne Tailnet-Header) ----------
        import tempfile, shutil
        steu = tempfile.mkdtemp(prefix='steuerung-')
        s2 = socket.socket(); s2.bind(('127.0.0.1', 0)); port2 = s2.getsockname()[1]; s2.close()
        srv2 = subprocess.Popen(['node', os.path.join(basis, 'server', 'server.js'), '--port', str(port2), '--host', '127.0.0.1', '--steuerung', steu],
                                stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
        url2 = 'http://127.0.0.1:%d/' % port2
        for _ in range(50):
            try: socket.create_connection(('127.0.0.1', port2), timeout=0.2).close(); break
            except OSError: time.sleep(0.1)
        def proxy(art):      # Attrappe für Tailscale Serve/Funnel (setzt die Identitäts-Header wie Tailscale, Chromium schickt eigene Header nicht beim WebSocket mit)
            pp = frei_port()
            pr = subprocess.Popen(['node', os.path.join(basis, 'tests', 'tailscale_proxy_stub.js'), str(pp), str(port2), art], stdout=subprocess.PIPE, text=True)
            pr.stdout.readline()
            return pr, 'http://127.0.0.1:%d/' % pp
        def frei_port():
            q = socket.socket(); q.bind(('127.0.0.1', 0)); n = q.getsockname()[1]; q.close(); return n
        def statusSchreiben(funnel, bis):
            with open(os.path.join(steu, 'status.json'), 'w') as f: f.write('{"funnel":"%s","bis":%s,"zeit":%d}' % (funnel, bis, int(time.time() * 1000)))
        def onlineOeffnen(pg, adresse):
            pg.goto(adresse)
            pg.wait_for_function('window.Rennspiel && Rennspiel.spiel', timeout=90000, polling=200)
            pg.wait_for_timeout(500)
            for _ in range(4): pg.keyboard.press('ArrowRight'); pg.wait_for_timeout(80)
            pg.keyboard.press('Enter'); pg.wait_for_timeout(1200)
        try:
            if 'host' in dir() and not host.is_closed(): host.close()
            if 'gast' in dir() and not gast.is_closed(): gast.close()
            ohne = seite('SchalterOhne')
            onlineOeffnen(ohne, url2)
            o1 = ohne.evaluate("({ obj: Rennspiel.spiel.menue.onlineUi.schalter, sichtbar: (() => { const e = document.querySelector('#online .on-schalter-box'); return !!e && getComputedStyle(e).display !== 'none'; })(), text: document.querySelector('#online').textContent.includes('Internet für Freunde') })")
            pruefe('Internet-Schalter: Server MIT --steuerung, Browser OHNE Tailnet-Header → unsichtbar', o1['obj'] is None and not o1['sichtbar'] and not o1['text'], o1)
            ohne.keyboard.press('KeyI'); ohne.wait_for_timeout(400)
            pruefe('Internet-Schalter: Taste I ohne Recht wirkungslos (keine Wunsch-Datei)', not os.path.exists(os.path.join(steu, 'wunsch.json')))
            ohne.close()      # Software-GL: nur eine Spielseite gleichzeitig
            # Browser MIT Tailnet-Header (Playwright schickt die Header auch beim WebSocket-Upgrade)
            prF, urlF = proxy('funnel')     # Funnel-Attrappe: Browser über „Internet“ → kein Recht, auch wenn er selbst Tailscale-Header mitschickt
            ctxF = browser.new_context(viewport={'width': 1280, 'height': 800}, extra_http_headers={'Tailscale-User-Login': 'sebastian@example.com'})
            fu = ctxF.new_page()
            onlineOeffnen(fu, urlF)
            oF = fu.evaluate("({ obj: Rennspiel.spiel.menue.onlineUi.schalter, text: document.querySelector('#online').textContent.includes('Internet für Freunde') })")
            pruefe('Internet-Schalter: über Funnel-Attrappe (Tailscale-Funnel-Request, kein Login) → unsichtbar, auch bei gefälschtem Header im Browser', oF['obj'] is None and not oF['text'], oF)
            ctxF.close(); prF.terminate()
            prS, urlS = proxy('serve')      # Serve-Attrappe: Tailscale-User-Login + X-Forwarded-For (Tailnet), Verbindung von 127.0.0.1
            ctx = browser.new_context(viewport={'width': 1280, 'height': 800})
            mit = ctx.new_page()
            mit.on('pageerror', lambda e: fehler.append('SchalterMit: ' + str(e)))
            statusSchreiben('aus', 'null')
            onlineOeffnen(mit, urlS)
            mit.wait_for_function("document.querySelector('#online .on-schalter-box') && document.querySelector('#online .on-schalter-box').textContent.includes('AUS')", timeout=10000, polling=200)
            t1 = mit.inner_text('#online .on-schalter-box')
            pruefe('Internet-Schalter: mit Tailnet-Header sichtbar: „Internet für Freunde: AUS“ + Knopf Einschalten', 'Internet für Freunde' in t1 and 'AUS' in t1 and 'Einschalten' in t1, t1)
            pruefe('Internet-Schalter: Hinweis „Freunde ohne Tailscale können mitspielen, solange AN“', 'ohne Tailscale können mitspielen' in mit.inner_text('#online'))
            mit.screenshot(path=os.path.join(out, 'online_20_schalter_aus.png'))
            mit.click('[data-a="schalter"]'); mit.wait_for_timeout(300)
            t2 = mit.inner_text('#online .on-schalter-box')
            pruefe('Internet-Schalter: erster Tipp auf Einschalten fragt nach („Sicher?“), schaltet noch nicht', 'Sicher?' in t2 and not os.path.exists(os.path.join(steu, 'wunsch.json')), t2)
            # (kein Screenshot hier: unter Software-GL dauert er > 5 s und die Rückfrage läuft ab)
            mit.click('[data-a="schalter"]'); mit.wait_for_timeout(500)
            w = open(os.path.join(steu, 'wunsch.json')).read() if os.path.exists(os.path.join(steu, 'wunsch.json')) else ''
            pruefe('Internet-Schalter: zweiter Tipp schreibt die Wunsch-Datei {"funnel":"an",…}', w.startswith('{"funnel":"an","seit":'), w)
            pruefe('Internet-Schalter: danach „wird umgeschaltet …“ (Helfer hat noch nicht geantwortet)', 'umgeschaltet' in mit.inner_text('#online .on-schalter-box'), mit.inner_text('#online .on-schalter-box'))
            statusSchreiben('an', int(time.time() * 1000) + 3 * 3600000 + 42 * 60000)
            mit.wait_for_function("document.querySelector('#online .on-schalter-box').textContent.includes('AN') && document.querySelector('#online .on-schalter-box').textContent.includes('noch 3:4')", timeout=12000, polling=200)
            t3 = mit.inner_text('#online .on-schalter-box')
            pruefe('Internet-Schalter: Status vom Helfer → „AN (noch 3:4x h)“ + Knopf Ausschalten', 'AN' in t3 and 'noch 3:4' in t3 and 'Ausschalten' in t3, t3)
            mit.screenshot(path=os.path.join(out, 'online_22_schalter_an.png'))
            mit.wait_for_timeout(5200)      # Rate-Limit 5 s
            mit.keyboard.press('KeyI'); mit.wait_for_timeout(500)
            w2 = open(os.path.join(steu, 'wunsch.json')).read()
            pruefe('Internet-Schalter: Taste I / Ausschalten ohne Rückfrage → {"funnel":"aus",…}', w2.startswith('{"funnel":"aus","seit":'), w2)
            pruefe('Internet-Schalter: Layout 1280×800 ohne Scrollen', mit.evaluate("(() => { const m = document.querySelector('#online .m-inhalt'); return m.scrollHeight <= m.clientHeight + 1; })()"))
            ctx.close()
        finally:
            try: prS.terminate()
            except Exception: pass
            srv2.terminate(); shutil.rmtree(steu, ignore_errors=True)
        browser.close()
finally:
    srv.terminate()
pruefe('keine JS-Fehler', not fehler, fehler[:5])
n_ok = sum(1 for x in pruefungen if x['ok'])
print(f'\n{n_ok}/{len(pruefungen)} OK')
sys.exit(0 if n_ok == len(pruefungen) else 1)
