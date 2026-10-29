#!/usr/bin/env python3
"""S2 Teil A: Geist wirklich im Bild? Runde 1 fahren (Autopilot), in Runde 2 Kamera dicht hinter den Geist stellen, Bild + Pixel-Vergleich mit/ohne Geist."""
import os, sys
from playwright.sync_api import sync_playwright
basis = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
bild = os.path.join(basis, 'tests', 'bilder_s2', 's1_pruefung'); os.makedirs(bild, exist_ok=True)
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
ok = True
with sync_playwright() as p:
    b = p.chromium.launch(args=ARGS)
    for html, auto, tag in [('Autorennen.html', 'passat', 'auto'), ('Motorrad.html', 'crossmaschine', 'moto')]:
        page = b.new_context(viewport={'width': 1100, 'height': 650}).new_page(); page.set_default_timeout(120000)
        fehler = []
        page.on('pageerror', lambda e: fehler.append(str(e)))
        page.goto('file://' + os.path.join(basis, html)); page.wait_for_timeout(1500)
        page.evaluate("Rennspiel.SpassGeist.loeschenAlle(window.MOTORRAD === true ? 'motorrad' : 'auto')")
        page.evaluate("Rennspiel.spiel.rennenStarten({ modus: 'solo', streckeId: 'fantasie', autoIds: ['%s','%s'], runden: 2, gegner: 0, schwierigkeit: 'mittel', fahrhilfe: ['wenig','wenig'], zufall: true, spass: true, geist: true })" % (auto, auto))
        page.wait_for_function('Rennspiel.spiel.rennen.zustand === "laeuft"', timeout=120000)
        page.evaluate("Rennspiel.spiel.autopilot(0, true)")
        page.evaluate("() => { const S = Rennspiel.spiel; for (let i = 0; i < 60 * 240 && S.rennen.teilnehmer[0].rundenzeiten.length < 1; i++) S.physikSchritt(1 / 60); }")
        page.evaluate("() => { const S = Rennspiel.spiel; for (let i = 0; i < 60 * 6; i++) S.physikSchritt(1 / 60); }")
        page.wait_for_timeout(500)
        info = page.evaluate("""() => { const S = Rennspiel.spiel, g = S.spass.geist; S.pausiert = true;
          const m = g.mesh, k = S.kameras[0].kamera, h = m.rotation.y;
          // Kamera 7 m hinter dem Geist, 2,5 m hoch, Blick auf den Geist
          k.position.set(m.position.x + Math.sin(h) * 7, m.position.y + 2.5, m.position.z + Math.cos(h) * 7); k.lookAt(m.position.x, m.position.y + 0.8, m.position.z);
          return { sichtbar: m.visible, y: m.position.y, deckkraft: (Array.isArray(m.children[0] && m.children[0].material) ? 1 : (m.children[0] && m.children[0].material && m.children[0].material.opacity)) }; }""")
        page.wait_for_timeout(500)
        page.screenshot(path=os.path.join(bild, tag + '_14_geist_nah.png'))
        page.evaluate("() => { Rennspiel.spiel.spass.geist.mesh.visible = false; Rennspiel.spiel.spass.geist.g = null; }")
        page.wait_for_timeout(400)
        page.screenshot(path=os.path.join(bild, tag + '_14_ohne_geist.png'))
        from PIL import Image, ImageChops
        a = Image.open(os.path.join(bild, tag + '_14_geist_nah.png')).convert('RGB'); c = Image.open(os.path.join(bild, tag + '_14_ohne_geist.png')).convert('RGB')
        d = ImageChops.difference(a, c).convert('L').point(lambda v: 255 if v > 24 else 0)
        n = sum(1 for v in d.getdata() if v)
        print(tag, info, 'Pixel anders:', n, 'Fehler:', fehler)
        if n < 800 or fehler: ok = False
    b.close()
print('OK' if ok else 'FEHL'); sys.exit(0 if ok else 1)
