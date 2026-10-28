#!/usr/bin/env python3
"""Bildfolge Schräglage vorher/nachher (Playwright). Aufruf: python3 tests/moto_lage_bilder.py
'vorher' = Stand des Vor-Commits (git archive des Parent-Commits der Schräglage-Änderung, Argument --alt <commit>, Standard HEAD~0 vor Commit = HEAD),
'nachher' = Arbeitsverzeichnis. Das Spiel wird deterministisch Bild für Bild (1/60 s) mit gehaltener Pfeiltaste links getrieben,
je 8 Bilder im Abstand 0,1 s ab Lenkbeginn, in Verfolger- und Cockpit-Ansicht -> tests/bilder_lage/{vorher,nachher}_{verfolger,cockpit}_NN.png"""
import os, sys, time, socket, subprocess, tempfile
from playwright.sync_api import sync_playwright

basis = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
out = os.path.join(basis, 'tests', 'bilder_lage'); os.makedirs(out, exist_ok=True)
alt = sys.argv[sys.argv.index('--alt') + 1] if '--alt' in sys.argv else 'HEAD'
tmp = tempfile.mkdtemp(prefix='lage_alt_')
subprocess.run(f'git -C "{basis}" archive {alt} | tar -x -C "{tmp}"', shell=True, check=True)

def port():
    s = socket.socket(); s.bind(('127.0.0.1', 0)); p = s.getsockname()[1]; s.close(); return p
srv = []
def serve(root):
    p = port(); srv.append(subprocess.Popen([sys.executable, '-m', 'http.server', str(p), '--bind', '127.0.0.1'], cwd=root, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)); return p
pn, pa = serve(basis), serve(tmp); time.sleep(1.0)
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
EINST = "({ modus: 'solo', streckeId: 'wiese', autoIds: ['crossmaschine', 'crossmaschine-rot'], runden: 1, gegner: 0, schwierigkeit: 'mittel', fahrhilfe: ['wenig', 'wenig'] })"
FRAME = "(n) => { const s = Rennspiel.spiel; for (let i = 0; i < n; i++) { window.__t += 1000 / 60; s._frameRumpf(window.__t); } }"

def lauf(page, url, praefix, ansicht):
    page.goto(url + 'Motorrad.html'); page.wait_for_timeout(1500)
    page.evaluate('() => { window.__t = performance.now(); }')
    page.evaluate('() => Rennspiel.spiel.rennenStarten' + EINST); page.wait_for_timeout(500)
    page.evaluate('() => { window.requestAnimationFrame = () => 0; }'); page.wait_for_timeout(300)   # echte Schleife anhalten, wir takten selbst
    page.evaluate('() => { window.__t = performance.now(); const s = Rennspiel.spiel; let g = 0; while ((s.zustand !== "rennen" || !s.rennen.gasErlaubt) && g++ < 600) { window.__t += 1000/60; s._frameRumpf(window.__t); } }')
    page.evaluate('() => { const s = Rennspiel.spiel; s.kameras.forEach((k) => { k.modusIndex = Rennspiel.config.kamera.modi.indexOf("%s"); k._erstesMal = true; }); }' % ansicht)
    page.keyboard.down('ArrowUp'); page.evaluate(FRAME, 60 * 5)                      # 5 s Gas geradeaus
    page.evaluate("() => { document.querySelectorAll('.hud-countdown').forEach((e) => { e.style.display = 'none'; }); }")
    page.keyboard.down('ArrowLeft')
    for k in range(8):
        page.evaluate(FRAME, 6)
        for v in range(3):
            try: page.screenshot(path=os.path.join(out, f'{praefix}_{"verfolger" if ansicht == "verfolger" else "cockpit"}_{k + 1:02d}.png'), timeout=60000); break
            except Exception: page.wait_for_timeout(1500)
    lean = page.evaluate('() => Rennspiel.spiel.fahrzeuge[0].motoZ.lean * 180 / Math.PI')
    page.keyboard.up('ArrowLeft'); page.keyboard.up('ArrowUp')
    print(f'{praefix}/{ansicht}: Lage nach 0,8 s Lenken {lean:.1f} Grad')

try:
    with sync_playwright() as p:
        b = p.chromium.launch(args=ARGS)
        for praefix, pt in (('vorher', pa), ('nachher', pn)):
            for ansicht in ('verfolger', 'cockpit'):
                page = b.new_page(viewport={'width': 960, 'height': 540}); fehler = []
                page.on('pageerror', lambda e: fehler.append(str(e)))
                lauf(page, f'http://127.0.0.1:{pt}/', praefix, ansicht); page.close()
                if fehler: print('JS-Fehler:', fehler[:3])
        b.close()
finally:
    for s in srv: s.terminate()
