#!/usr/bin/env python3
"""Schneller Menü-Screenshot: python3 tests/fix2_shot.py auto|moto BxH schritt datei"""
import os, sys
from playwright.sync_api import sync_playwright
basis = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
tag, gr, schritt, datei = sys.argv[1], sys.argv[2], int(sys.argv[3]), sys.argv[4]
w, h = map(int, gr.split('x'))
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
with sync_playwright() as p:
    b = p.chromium.launch(args=ARGS)
    ctx = b.new_context(viewport={'width': w, 'height': h}, has_touch=(w < 900 or h < 500), is_mobile=(w < 900 or h < 500))
    page = ctx.new_page(); page.set_default_timeout(120000)
    page.goto('file://' + os.path.join(basis, 'Autorennen.html' if tag == 'auto' else 'Motorrad.html'))
    page.wait_for_function('window.Rennspiel && Rennspiel.spiel'); page.wait_for_timeout(1500)
    page.evaluate(f"Rennspiel.spiel.menue.zeigen({schritt})"); page.wait_for_timeout(500)
    page.screenshot(path=datei)
    b.close()
