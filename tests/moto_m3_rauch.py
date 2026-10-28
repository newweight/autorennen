#!/usr/bin/env python3
"""Browser-Rauchtest Motorrad M3: python3 tests/moto_m3_rauch.py
Startet python -m http.server, lädt Motorrad.html, startet jedes neue Fahrzeug (Superbike, Roller, Chopper, Quad) einmal
und den Stunt-Park (ohne Gegner), prüft: keine Konsolenfehler/pageerror, Gegnerzahl 0 im Park. Je 1 Screenshot nach tests/bilder_m3/."""
import os, sys, time, socket, subprocess
from playwright.sync_api import sync_playwright

basis = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
out = os.path.join(basis, 'tests', 'bilder_m3'); os.makedirs(out, exist_ok=True)
s = socket.socket(); s.bind(('127.0.0.1', 0)); port = s.getsockname()[1]; s.close()
server = subprocess.Popen([sys.executable, '-m', 'http.server', str(port), '--bind', '127.0.0.1'], cwd=basis, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1.0)
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
res = []; fehler = []
def pruefe(n, ok, info=''):
    res.append(bool(ok)); print(('OK   ' if ok else 'FEHL ') + n + (f'  ({info})' if info != '' else ''))
def bild(page, name):
    for v in range(2):
        try: page.screenshot(path=os.path.join(out, name), timeout=60000); print('      Bild: tests/bilder_m3/' + name); return
        except Exception as e:
            if v == 1: print('      Bild ausgelassen (Timeout): ' + name)
            page.wait_for_timeout(1500)
START = "(a) => { const s = Rennspiel.spiel; s.rennenStarten(Object.assign({ modus: 'solo', streckeId: 'wiese', autoIds: [a.id, a.id], runden: 1, gegner: 2, schwierigkeit: 'mittel', fahrhilfe: ['wenig', 'wenig'] }, a.extra || {})); let g = 0; while ((s.zustand !== 'rennen' || !s.rennen.gasErlaubt) && g++ < 3000) s.physikSchritt(1 / 60); for (let i = 0; i < 180; i++) { s.fahrzeuge[0].vehicle && s.physikSchritt(1 / 60); } s.zeichnen && s.zeichnen(); return { zustand: s.zustand, fahrzeuge: s.fahrzeuge.length, gegner: s.fahrzeuge.filter((f) => !f.istSpieler).length, runden: s.rennen.runden }; }"
try:
    with sync_playwright() as p:
        b = p.chromium.launch(args=ARGS); page = b.new_page(viewport={'width': 1000, 'height': 600})
        page.on('pageerror', lambda e: fehler.append('pageerror: ' + str(e)))
        page.on('console', lambda m: fehler.append('console.error: ' + m.text) if m.type == 'error' else None)
        page.goto(f'http://127.0.0.1:{port}/Motorrad.html'); page.wait_for_timeout(1500)
        for tid in ['superbike', 'roller', 'chopper', 'quad']:
            r = page.evaluate(START, {'id': tid}); page.wait_for_timeout(300)
            pruefe(f'{tid}: Rennen startet und läuft', r['zustand'] == 'rennen' and r['fahrzeuge'] >= 1, str(r))
            bild(page, f'm3_{tid}.png')
        r = page.evaluate(START, {'id': 'quad', 'extra': {'stuntpark': True}}); page.wait_for_timeout(300)
        pruefe('Stunt-Park: läuft, keine Gegner, 999 Runden', r['zustand'] == 'rennen' and r['gegner'] == 0 and r['runden'] == 999, str(r))
        bild(page, 'm3_stuntpark.png')
        page.wait_for_timeout(500)
        pruefe('Keine Konsolenfehler/pageerror', not fehler, '; '.join(fehler[:3]))
        b.close()
finally:
    server.terminate()
print('\n' + ('Alles OK' if all(res) else 'FEHL: %d' % res.count(False)))
sys.exit(0 if all(res) else 1)
