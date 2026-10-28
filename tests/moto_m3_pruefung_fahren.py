#!/usr/bin/env python3
"""Motorrad M3 Prüfung (echte Eingaben): python3 tests/moto_m3_pruefung_fahren.py  – Bilder nach tests/bilder_m3_pruefung/"""
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
        START = "(a) => { const s = window.Rennspiel.spiel; s.rennenStarten(Object.assign({ modus: 'solo', streckeId: 'wiese', autoIds: [a.id, a.id], runden: 1, gegner: a.gegner, schwierigkeit: 'mittel', fahrhilfe: ['wenig', 'wenig'] }, a.extra || {})); return s.zustand; }"
        for n in ['superbike', 'roller', 'chopper', 'quad']:
            page.evaluate(START, {'id': n, 'gegner': 2}); page.wait_for_function("() => window.Rennspiel.spiel.rennen && window.Rennspiel.spiel.rennen.gasErlaubt", timeout=90000)
            page.keyboard.down('ArrowUp'); page.wait_for_timeout(5000)
            page.keyboard.down('ArrowLeft'); page.wait_for_timeout(600); page.keyboard.up('ArrowLeft'); page.wait_for_timeout(500)
            bild(page, f'f_{n}_a.png')
            page.keyboard.press('c'); page.wait_for_timeout(500); bild(page, f'f_{n}_b.png')
            page.keyboard.press('c'); page.wait_for_timeout(500); bild(page, f'f_{n}_c.png')
            page.keyboard.up('ArrowUp')
            print(n, page.evaluate("() => { const f=window.Rennspiel.spiel.fahrzeuge[0]; return {v:Math.round(f.vehicle.vLaengs*3.6), z:window.Rennspiel.spiel.zustand}; }"))
        print('FEHLER', fehler)
        b.close()
finally:
    server.terminate()
