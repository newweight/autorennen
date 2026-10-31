#!/usr/bin/env python3
"""R6 Beweisbild: Looping-Schub beim Roller (Motorrad, Fantasie, Tempo-Klasse normal): Meldung „Looping-Schub!“ + Flammen vor/im Looping.
Aufruf: python3 tests/r6_looping_schub_bild.py   (Bilder nach tests/bilder_r6/ bzw. $BILD_ORDNER)"""
import os, sys
from playwright.sync_api import sync_playwright
BASIS = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.environ.get('BILD_ORDNER') or os.path.join(BASIS, 'tests', 'bilder_r6'); os.makedirs(OUT, exist_ok=True)
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
fehler = []
with sync_playwright() as p:
    b = p.chromium.launch(args=ARGS); pg = b.new_context(viewport={'width': 1100, 'height': 650}).new_page(); pg.set_default_timeout(300000)
    pg.on('pageerror', lambda e: fehler.append(str(e)))
    pg.goto('file://' + os.path.join(BASIS, 'Motorrad.html')); pg.wait_for_function('window.Rennspiel && Rennspiel.spiel'); pg.wait_for_timeout(1000)
    pg.evaluate("""() => { const s = Rennspiel.spiel; window.__t = 1000; performance.now = () => window.__t; s.uhr.letzte = 1000;
      s.rennenStarten({ modus: 'solo', streckeId: 'fantasie', autoIds: ['roller', 'roller'], runden: 2, gegner: 0, schwierigkeit: 'mittel', fahrhilfe: ['wenig', 'wenig'], tageszeit: 'tag', wetter: 'klar', tempoKlasse: 'normal' }); window.requestAnimationFrame = () => 0; }""")
    pg.wait_for_timeout(500)
    pg.evaluate("""() => { const s = Rennspiel.spiel, z0 = s.zeichnen; s.zeichnen = function () {}; let g = 0; window.__t = 5000; s.uhr.letzte = window.__t; s.uhr.rest = 0;
      while ((s.zustand !== 'rennen' || !s.rennen.gasErlaubt) && g++ < 1500) { window.__t += 1000 / 60; s._frameRumpf(window.__t); } s.zeichnen = z0; }""")
    pg.evaluate("""() => { const s = Rennspiel.spiel, st = s.strecke, f = s.fahrzeuge[0], v = f.vehicle, lp = st.loopings[0]; const sB = lp.s - 140;
      const pt = st.spline.punktBei(sB); v.setzen(pt.x, pt.z, Rennspiel.headingAus(pt.tx, pt.tz)); v.y = st.hoeheAn(pt.x, pt.z); f.index = -1; v.vLaengs = 18;
      s.kameras.forEach((k) => { k.modusIndex = 0; k._erstesMal = true; }); s.autopilot(0, true); s.pausiert = false; }""")
    ids = pg.evaluate("Rennspiel.config.kamera.modi")
    print('Kamera-Modi', ids)
    gefunden = 0; letzte = None
    for i in range(400):
        pg.evaluate("""() => { const s = Rennspiel.spiel, z0 = s.zeichnen; s.zeichnen = function () {}; for (let k = 0; k < 6; k++) { window.__t += 1000 / 60; s._frameRumpf(window.__t); } s.zeichnen = z0; }""")
        info = pg.evaluate("() => { const f = Rennspiel.spiel.fahrzeuge[0], v = f.vehicle; return { txt: document.body.innerText.indexOf('Looping-Schub') >= 0, kmh: Math.round(v.vLaengs * 3.6), loop: !!v.imLooping }; }")
        if info['txt'] and gefunden < 3 and (letzte is None or i - letzte >= 6):
            pg.evaluate("() => { for (let k = 0; k < 3; k++) Rennspiel.spiel.zeichnen(); }")
            pg.screenshot(path=os.path.join(OUT, 'looping_schub_roller_%d.png' % gefunden)); print('Bild', gefunden, info, flush=True); gefunden += 1; letzte = i
        if info['loop'] and gefunden >= 1 and i - (letzte or 0) >= 6 and gefunden < 4:
            pg.evaluate("() => { for (let k = 0; k < 3; k++) Rennspiel.spiel.zeichnen(); }")
            pg.screenshot(path=os.path.join(OUT, 'looping_schub_roller_im_looping.png')); print('Bild im Looping', info, flush=True); gefunden = 4
        if gefunden >= 4: break
    print('Fehler:', fehler[:3], 'Bilder:', gefunden)
    b.close()
sys.exit(0 if gefunden and not fehler else 1)
