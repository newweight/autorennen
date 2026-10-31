#!/usr/bin/env python3
"""R5: Stunt-Schilder (WHEELIE / HINTERRAD HOCH!) im echten Spiel, Kamera = echte Spielkameras (Cockpit, Verfolger), HUD an.
Strecken wiese + alpen, Grafik Normal + Ultra. Bilder nach tests/bilder_r5/. Aufruf: python3 tests/r5_schild.py"""
import os, sys
from playwright.sync_api import sync_playwright
basis = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
bild = os.environ.get('BILD_ORDNER') or os.path.join(basis, 'tests', 'bilder_r5'); os.makedirs(bild, exist_ok=True)
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
# (Strecke, Art, Zonen-Start s0) – Schild steht 12 m vor s0
ZIELE = [z for z in [('wiese', 'stoppie', 110), ('wiese', 'wheelie', 1655), ('alpen', 'stoppie', 1005), ('alpen', 'wheelie', 795)] if len(sys.argv) < 2 or z[1] in sys.argv[1:]]
SETZEN = '''([s0, abstand]) => { const S = Rennspiel.spiel, sp = S.strecke.spline, p = sp.punktBei(sp.wrapS(s0 - abstand)), v = S.fahrzeuge[0].vehicle;
  v.setzen(p.x, p.z, Rennspiel.headingAus(p.tx, p.tz)); v.y = S.strecke.hoeheAn(p.x, p.z); }'''
fehler = []
with sync_playwright() as pw:
    b = pw.chromium.launch(args=ARGS)
    for stufe in ('normal', 'ultra'):
        page = b.new_page(viewport={'width': 1280, 'height': 720}); page.set_default_timeout(300000)
        page.on('pageerror', lambda e: fehler.append(str(e)))
        page.goto('file://' + os.path.join(basis, 'Motorrad.html')); page.wait_for_function('window.Rennspiel && Rennspiel.spiel')
        page.evaluate("Rennspiel.Grafik.setzen('%s')" % stufe)
        for sid in sorted({z[0] for z in ZIELE}, reverse=True):
            page.evaluate("Rennspiel.spiel.rennenStarten({ modus: 'solo', streckeId: '%s', autoIds: ['crossmaschine', 'crossmaschine-rot'], runden: 1, gegner: 0, schwierigkeit: 'mittel', fahrhilfe: ['wenig', 'wenig'] })" % sid)
            page.wait_for_function('Rennspiel.spiel.rennen.zustand === "laeuft"', timeout=300000)
            for (sx, art, s0) in [z for z in ZIELE if z[0] == sid]:
                for kam, abst in (('cockpit', 30), ('verfolger', 24)):
                    page.evaluate("(m) => { const k = Rennspiel.spiel.kameras[0]; let n = 0; while (k.modus !== m && n++ < 4) k.naechsterModus(); }", kam)
                    page.evaluate(SETZEN, [s0, abst])
                    page.wait_for_function("Rennspiel.spiel.kameras[0].modus && true"); page.wait_for_timeout(900)
                    page.evaluate(SETZEN, [s0, abst]); page.wait_for_timeout(700)
                    pfad = os.path.join(bild, f'{stufe}_{sid}_{art}_{kam}.png'); page.screenshot(path=pfad, timeout=120000); print(pfad, flush=True)
        page.close()
    b.close()
print('Fehler:', fehler)
