#!/usr/bin/env python3
"""FIX2 Teil 2 – Wheelie-/Stoppie-Schilder aus Fahrersicht (Verfolger + Cockpit-Höhe). Aufruf: python3 tests/fix2_schild.py [praefix]"""
import os, sys
from playwright.sync_api import sync_playwright
basis = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
bild = os.path.join(basis, 'tests', 'bilder_fix2'); os.makedirs(bild, exist_ok=True)
pre = sys.argv[1] if len(sys.argv) > 1 else 'schild'
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
KAM = '''([s, abstand, hoehe, blick]) => { const S = Rennspiel.spiel, sp = S.strecke.spline, k = S.kameras[0];
  if (!k._eingefroren) { k._eingefroren = true; k.update = () => {}; }
  const a = sp.punktBei(sp.wrapS(s - abstand)), b = sp.punktBei(sp.wrapS(s + blick));
  k.kamera.position.set(a.x, S.strecke.bodenHoehe(a.x, a.z) + hoehe, a.z);
  k.kamera.up.set(0, 1, 0); k.kamera.lookAt(b.x, S.strecke.bodenHoehe(b.x, b.z) + 1.5, b.z); k.kamera.updateMatrixWorld(true); }'''
EINST = "({ modus: 'solo', streckeId: 'wiese', autoIds: ['crossmaschine', 'crossmaschine-rot'], runden: 1, gegner: 1, schwierigkeit: 'mittel', fahrhilfe: ['wenig', 'wenig'] })"
with sync_playwright() as p:
    b = p.chromium.launch(args=ARGS)
    ctx = b.new_context(viewport={'width': 1280, 'height': 720})
    page = ctx.new_page(); page.set_default_timeout(300000)
    page.goto('file://' + os.path.join(basis, 'Motorrad.html')); page.wait_for_function('window.Rennspiel && Rennspiel.spiel'); page.wait_for_timeout(1500)
    page.evaluate('() => Rennspiel.spiel.rennenStarten' + EINST); page.wait_for_timeout(2500)
    page.add_style_tag(content='.hud { display: none !important; }')
    page.wait_for_function('Rennspiel.spiel.rennen.zustand === "laeuft"', timeout=300000)
    page.evaluate("Rennspiel.spiel.fahrzeuge.forEach(f => { f.mesh.visible = false; })")
    for art, s0 in [('stoppie', 110), ('wheelie', 1655)]:
        for name, abst, hoeh in [('verfolger', 22, 3.2), ('cockpit', 12, 1.5), ('nah', 7, 2.4)]:
            page.evaluate(KAM, [s0 - 6, abst, hoeh, 20]); page.wait_for_timeout(600)
            page.screenshot(path=os.path.join(bild, f'{pre}_{art}_{name}.png'), timeout=90000); print(art, name)
    b.close()
