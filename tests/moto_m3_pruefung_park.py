#!/usr/bin/env python3
"""Motorrad M3 Prüfung (echte Eingaben): python3 tests/moto_m3_pruefung_park.py  – Bilder nach tests/bilder_m3_pruefung/"""
import os, sys, time, socket, subprocess
from playwright.sync_api import sync_playwright
basis = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
out = os.path.join(basis, 'tests', 'bilder_m3_pruefung'); os.makedirs(out, exist_ok=True)
s = socket.socket(); s.bind(('127.0.0.1', 0)); port = s.getsockname()[1]; s.close()
server = subprocess.Popen([sys.executable, '-m', 'http.server', str(port), '--bind', '127.0.0.1'], cwd=basis, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1.0)
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
fehler = []
def bild(page, name):
    for v in range(2):
        try: page.screenshot(path=os.path.join(out, name), timeout=60000); print('Bild', name); return
        except Exception: page.wait_for_timeout(1500)
try:
    with sync_playwright() as p:
        b = p.chromium.launch(args=ARGS); ctx = b.new_context(viewport={'width': 1280, 'height': 800}); page = ctx.new_page()
        page.on('pageerror', lambda e: fehler.append('pageerror: ' + str(e)))
        page.on('console', lambda m: fehler.append('console.error: ' + m.text) if m.type == 'error' else None)
        page.goto(f'http://127.0.0.1:{port}/Motorrad.html'); page.wait_for_timeout(2500)
        START = "(a) => { const s = window.Rennspiel.spiel; s.rennenStarten({ modus: 'solo', stuntpark: true, autoIds: [a, a], runden: 1, gegner: 0, schwierigkeit: 'mittel', fahrhilfe: ['wenig', 'wenig'] }); return s.zustand; }"
        TELE = "(s0) => { const sp = window.Rennspiel.spiel; const f = sp.fahrzeuge[0], v = f.vehicle, p = sp.strecke.spline.punktBei(s0); v.x = p.x; v.z = p.z; v.heading = window.Rennspiel.headingAus(p.tx, p.tz); v.vLaengs = 0; return [v.x, v.z]; }"
        faelle = [('quad', 'schlamm', 440), ('superbike', 'wasser', 1085), ('chopper', 'kisten', 40), ('superbike', 'steilwand', 715)]
        for auto, n, s0 in faelle:
            page.evaluate(START, auto); page.wait_for_function("() => window.Rennspiel.spiel.rennen && window.Rennspiel.spiel.rennen.gasErlaubt", timeout=90000)
            page.evaluate(TELE, s0); page.wait_for_timeout(300)
            page.keyboard.down('ArrowUp')
            for k in range(3):
                page.wait_for_timeout(1800 if n != 'steilwand' else 2200); bild(page, f'p_{n}_{k}.png')
            page.keyboard.up('ArrowUp')
            print(n, page.evaluate("() => { const f=window.Rennspiel.spiel.fahrzeuge[0]; return {v:Math.round(f.vehicle.vLaengs*3.6), punkte: window.Rennspiel.spiel.stunt && window.Rennspiel.spiel.stunt.fz[0] && window.Rennspiel.spiel.stunt.fz[0].punkte}; }"))
        print('FEHLER', fehler)
        b.close()
finally:
    server.terminate()
