#!/usr/bin/env python3
"""R6b: Belegbilder Kurz-Level mit Münzen (Motorrad m03 / Auto a02: Chip unter der Platz-Box, keine Runde, Münzen sichtbar). Bilder nach tests/bilder_r6b/.
Aufruf: python3 tests/r6b_belege.py"""
import os
from playwright.sync_api import sync_playwright
basis = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
bild = os.environ.get('BILD_ORDNER') or os.path.join(basis, 'tests', 'bilder_r6b'); os.makedirs(bild, exist_ok=True)
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
with sync_playwright() as pw:
    b = pw.chromium.launch(args=ARGS)
    for (html, lvl, tag) in [('Motorrad.html', 'm03', 'moto'), ('Autorennen.html', 'a02', 'auto')]:
        for (w, h) in [(1280, 800), (844, 390)]:
            ctx = b.new_context(viewport={'width': w, 'height': h}); page = ctx.new_page(); page.set_default_timeout(180000)
            fehler = []; page.on('pageerror', lambda e: fehler.append(str(e)))
            page.goto('file://' + os.path.join(basis, html)); page.wait_for_function('window.Rennspiel && Rennspiel.spiel'); page.wait_for_timeout(800)
            page.evaluate("(l)=>{const S=Rennspiel.spiel; S._s4Modus={art:'kurz', level:l}; S.rennenStarten();}", lvl); page.wait_for_timeout(600)
            page.evaluate("""()=>{const S=Rennspiel.spiel; S.autopilot(0,true); S.pausiert=false; let n=0; while(S.rennen.zustand!=='laeuft' && n<900){S.physikSchritt(1/60); n++;} for(let i=0;i<420;i++) S.physikSchritt(1/60); S.pausiert=true; S.uhr.rest=0; }""")
            page.evaluate("()=>{const k=Rennspiel.spiel.kameras[0]; let n=0; while(k.modus!=='verfolger' && n++<4) k.naechsterModus();}"); page.wait_for_timeout(900)
            page.screenshot(path=os.path.join(bild, f'kurz_muenzen_{tag}_{w}x{h}.png'))
            print(tag, w, h, 'Fehler:', fehler[:2], flush=True)
            ctx.close()
    b.close()
