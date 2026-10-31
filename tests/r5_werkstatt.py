#!/usr/bin/env python3
"""R5: WERKSTATT-Schild beim Rennstart: Bild direkt nach dem Start (Cockpit + Verfolger, Solo + Zwei, Motorrad + Auto) –
Streckenwahl mit Werkstatt nahe dem Start. Aufruf: python3 tests/r5_werkstatt.py <vorher|nachher> [spiel moto|auto] [strecke ...]"""
import os, sys
from playwright.sync_api import sync_playwright
basis = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
bild = os.path.join(basis, 'tests', 'bilder_r5'); os.makedirs(bild, exist_ok=True)
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
tag = sys.argv[1] if len(sys.argv) > 1 else 'nachher'
spiele = [sys.argv[2]] if len(sys.argv) > 2 else ['moto', 'auto']
strecken = sys.argv[3:] or ['mond', 'unterwasser']
fehler = []
with sync_playwright() as pw:
    b = pw.chromium.launch(args=ARGS)
    for sp in spiele:
        html, auto = ('Motorrad.html', 'crossmaschine') if sp == 'moto' else ('Autorennen.html', 'passat')
        page = b.new_page(viewport={'width': int(os.environ.get('BREITE', 1280)), 'height': int(os.environ.get('HOEHE', 720))}); page.set_default_timeout(300000)
        page.on('pageerror', lambda e: fehler.append(str(e)))
        page.goto('file://' + os.path.join(basis, html)); page.wait_for_function('window.Rennspiel && Rennspiel.spiel')
        for sid in strecken:
            for modus in ('solo', 'zwei'):
                for kam in ('cockpit', 'verfolger'):
                    page.evaluate("([sid,a,m]) => Rennspiel.spiel.rennenStarten({ modus: m, streckeId: sid, autoIds: [a,a], runden: 1, gegner: 0, schwierigkeit: 'mittel', fahrhilfe: ['wenig','wenig'], schaden: true, unfall: 'echt' })", [sid, auto, modus])
                    page.evaluate("(m) => Rennspiel.spiel.kameras.forEach((k) => { let n = 0; while (k.modus !== m && n++ < 4) k.naechsterModus(); })", kam)
                    page.wait_for_function('Rennspiel.spiel.rennen.zustand === "laeuft"', timeout=300000)
                    if sp == 'moto':
                        vis = lambda: page.evaluate("() => { const r = []; Rennspiel.spiel.szene.traverse((o) => { if (o.name === 'Wegweiser') r.push([!!o.userData.startNah, o.visible]); }); return r; }")
                        v0 = vis(); nah = [x for x in v0 if x[0]]
                        print('  Wegweiser start-nah im Countdown/LOS: sichtbar =', [x[1] for x in nah], '(erwartet: leer oder alle False)', 'gesamt', len(v0), flush=True)
                        if any(x[1] for x in nah): fehler.append('Wegweiser im Countdown sichtbar ' + sid)
                    for t in (0.4, 2.0):
                        page.wait_for_timeout(int(t * 1000))
                        pfad = os.path.join(bild, f'werkstatt_{tag}_{sp}_{sid}_{modus}_{kam}_{t}s' + ('' if not os.environ.get('BREITE') else '_' + os.environ['BREITE']) + '.png'); page.screenshot(path=pfad, timeout=120000); print(pfad, flush=True)
        page.close()
    b.close()
print('Fehler:', fehler)
