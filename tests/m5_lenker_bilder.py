#!/usr/bin/env python3
"""M5: Bildfolgen Gasgriff/Bremshebel am Lenker (Cockpit) und am Modell (Verfolger).
Aufruf: python3 tests/m5_lenker_bilder.py [Ausgabe]  -> tests/bilder_m5/lenker_*.png
Gas/Bremse werden über einen Test-Haken (letzteSteuerung fest) vorgegeben; geprüft wird nur die Anzeige."""
import os, sys, json
from playwright.sync_api import sync_playwright
basis = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
out = sys.argv[1] if len(sys.argv) > 1 else os.path.join(basis, 'tests', 'bilder_m5')
os.makedirs(out, exist_ok=True)
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
FIX = '''([g, b]) => { const f = Rennspiel.spiel.fahrzeuge.find(x => x.istSpieler), v = f.vehicle;
  Object.defineProperty(v, 'letzteSteuerung', { configurable: true, get() { return { gas: g, bremse: b, lenkung: 0 }; }, set() {} }); }'''
fehler = []
res = {}
with sync_playwright() as p:
    br = p.chromium.launch(args=ARGS)
    page = br.new_page(viewport={'width': 1280, 'height': 720}); page.set_default_timeout(300000)
    page.on('pageerror', lambda e: fehler.append(str(e)))
    page.on('console', lambda m: fehler.append(m.text) if m.type == 'error' else None)
    page.goto('file://' + os.path.join(basis, 'Motorrad.html')); page.wait_for_timeout(1500)
    for auto, tag in (('crossmaschine', 'cross'), ('quad', 'quad')):
        page.evaluate("Rennspiel.spiel.rennenStarten({ modus: 'solo', streckeId: 'wiese', autoIds: ['%s', '%s'], runden: 2, gegner: 1, schwierigkeit: 'mittel', fahrhilfe: ['wenig', 'wenig'] })" % (auto, auto))
        page.wait_for_function('Rennspiel.spiel.rennen.zustand === "laeuft"', timeout=300000); page.wait_for_timeout(500)
        page.evaluate("Rennspiel.spiel.autopilot(0, false)")
        for ansicht in ('cockpit', 'verfolger'):
            page.evaluate("(a) => { const k = Rennspiel.spiel.kameras[0]; k.modusIndex = Rennspiel.config.kamera.modi.indexOf(a); }", ansicht)
            page.wait_for_timeout(700)
            for serie, werte in (('gas', [(0, 0), (.33, 0), (.66, 0), (1, 0)]), ('bremse', [(0, 0), (0, .33), (0, .66), (0, 1)])):
                for i, (g, b) in enumerate(werte):
                    page.evaluate(FIX, [g, b]); page.wait_for_timeout(1400)
                    if ansicht == 'cockpit':
                        clip = {'x': 280, 'y': 440, 'width': 720, 'height': 280}
                    else:
                        page.evaluate('''() => { const S = Rennspiel.spiel, k = S.kameras[0], v = S.fahrzeuge.find(x => x.istSpieler).vehicle;
                          if (!k._eingefroren) { k._eingefroren = true; k.update = () => {}; }
                          const h = v.heading, bx = Math.sin(h), bz = Math.cos(h), rx = Math.cos(h), rz = -Math.sin(h);
                          k.kamera.position.set(v.x + bx * 1.5 + rx * 0.5, v.y + 1.75, v.z + bz * 1.5 + rz * 0.5); k.kamera.up.set(0, 1, 0);
                          k.kamera.lookAt(v.x - bx * 0.2 + rx * 0.3, v.y + 1.1, v.z - bz * 0.2 + rz * 0.3); k.kamera.updateMatrixWorld(true); }''')
                        page.wait_for_timeout(400)
                        clip = {'x': 340, 'y': 160, 'width': 600, 'height': 400}
                    fn = 'lenker_%s_%s_%s%d.png' % (tag, ansicht, serie, i + 1)
                    page.screenshot(path=os.path.join(out, fn), clip=clip, timeout=90000); print(fn)
            if auto == 'quad' and ansicht == 'verfolger': pass
    br.close()
print('Fehler:', fehler[:10])
