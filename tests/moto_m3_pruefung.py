#!/usr/bin/env python3
"""Motorrad M3 Prüfung (echte Eingaben): python3 tests/moto_m3_pruefung.py <schritt>  – Bilder nach tests/bilder_m3_pruefung/"""
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
        bild(page, '01_menue.png')
        page.click('.m-park .karten-name'); page.wait_for_timeout(500); bild(page, '02_park_gewaehlt.png')
        page.click('[data-a=weiter]'); page.wait_for_timeout(800); bild(page, '03_schritt2.png')
        print(page.evaluate("() => document.body.innerText.slice(0,400)"))
        for k in range(5):
            page.keyboard.press('Enter'); page.wait_for_timeout(700); bild(page, f'04_schritt_{k}.png')
        for k in range(30):
            if page.evaluate("() => window.Rennspiel.spiel.zustand") != 'menue': break
            page.keyboard.press('Enter'); page.wait_for_timeout(400)
        page.wait_for_timeout(2500); bild(page, '04_nach_enter.png'); print('zustand', page.evaluate("() => window.Rennspiel.spiel.zustand"))
        page.wait_for_timeout(5000)
        print(page.evaluate("() => { const s=window.Rennspiel.spiel; return {z:s.zustand, f:s.fahrzeuge.length, g:s.fahrzeuge.filter(f=>!f.istSpieler).length, r:s.rennen&&s.rennen.runden, st:s.einstellungen.stuntpark}; }"))
        bild(page, '05_park_start.png')
        print('FEHLER', fehler)
        b.close()
finally:
    server.terminate()
