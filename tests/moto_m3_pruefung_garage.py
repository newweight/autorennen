#!/usr/bin/env python3
"""Motorrad M3 Prüfung Garage (echte Eingaben): python3 tests/moto_m3_pruefung_garage.py  – Bilder nach tests/bilder_m3_pruefung/"""
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
        page.keyboard.press('g'); page.wait_for_timeout(800); bild(page, 'g01_fahrer.png')
        page.keyboard.press('Enter'); page.wait_for_timeout(800); bild(page, 'g02_autowahl.png')
        print(page.evaluate("() => document.body.innerText.slice(0,500)"))
        names = ['superbike', 'roller', 'chopper', 'quad']
        for k in range(4): page.keyboard.press('ArrowRight')
        page.wait_for_timeout(400)
        for n in names:
            page.wait_for_timeout(500); bild(page, f'g03_wahl_{n}.png')
            page.keyboard.press('Enter'); page.wait_for_timeout(900); bild(page, f'g04_werkstatt_{n}_std.png')
            page.keyboard.press('j'); page.keyboard.press('k'); page.keyboard.press('n'); page.keyboard.press('n'); page.keyboard.press('n')
            page.wait_for_timeout(900); bild(page, f'g05_werkstatt_{n}_stil.png')
            print(n, page.evaluate("() => window.Rennspiel.Moto.m3garage.laden()"))
            if n == 'chopper':
                page.click('[data-m3="helm:%d"]' % 0x1fa84f); page.click('[data-m3="kombi:%d"]' % 0xf6c20a); page.click('[data-m3="nr:1"]')
                page.wait_for_timeout(900); bild(page, 'g06_chopper_klick.png')
            page.keyboard.press('Escape'); page.wait_for_timeout(500)
            page.keyboard.press('ArrowRight'); page.wait_for_timeout(300)
        print(page.evaluate("() => JSON.stringify(window.Rennspiel.Moto.m3garage.laden())"))
        page.reload(); page.wait_for_timeout(2000)
        print('nach Reload', page.evaluate("() => JSON.stringify(window.Rennspiel.Moto.m3garage.laden())"))
        page.keyboard.press('g'); page.wait_for_timeout(600); page.keyboard.press('Enter'); page.wait_for_timeout(600)
        for k in range(6): page.keyboard.press('ArrowRight')
        page.keyboard.press('Enter'); page.wait_for_timeout(1000); bild(page, 'g07_chopper_nach_reload.png')
        print('FEHLER', fehler)
        b.close()
finally:
    server.terminate()
