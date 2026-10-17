#!/usr/bin/env python3
"""v29 F6/F8: Cockpit-Bilder je Auto (Stand + Vollgas nach 5 s) und Nadel-/JS-Fehler-Pruefung.
Aufruf: python3 tests/cockpit_v29_shots.py <ausgabeordner> [auto ...]"""
import sys, os, json
from playwright.sync_api import sync_playwright
basis = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
url = 'file://' + os.path.join(basis, 'Autorennen.html')
out = sys.argv[1]; os.makedirs(out, exist_ok=True)
autos = sys.argv[2:] or ['passat', 'multivan', 'troc-cabrio', 'porsche-911', 'formel', 'bmw-m4', 'amg-gt', 'audi-rs6', 'mini-cooper', 'polizei']
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
ergebnis = {}; fehler = []
with sync_playwright() as p:
    b = p.chromium.launch(args=ARGS)
    pg = b.new_page(viewport={'width': 1280, 'height': 800})
    pg.on('pageerror', lambda e: fehler.append(str(e)))
    pg.on('console', lambda m: fehler.append('console.error: ' + m.text) if m.type == 'error' else None)
    pg.goto(url); pg.wait_for_timeout(1500)
    for a in autos:
        pg.evaluate("""(a) => { const s = Rennspiel.spiel; s.input.gedrueckt.delete('ArrowUp');
          s.rennenStarten({ modus: 'solo', streckeId: 'wiese', gegner: 1, runden: 3, schwierigkeit: 'leicht', autoIds: [a],
            fahrhilfe: ['wenig','wenig'], wetter: 'klar', jahreszeit: 'sommer', windStaerke: 0, polizei: false });
          s.uhr.rest = 0; s.pausiert = true; for (let k = 0; k < 60 * 6 && !s.rennen.gasErlaubt; k++) s.physikSchritt(1 / 60);
          s.kameras.forEach(k => { k.modusIndex = Rennspiel.config.kamera.modi.indexOf('cockpit'); k._erstesMal = true; }); }""", a)
        pg.evaluate("() => { Rennspiel.spiel.pausiert = false; }")
        pg.wait_for_timeout(1500)
        pg.screenshot(timeout=180000, path=f'{out}/cockpit_{a}_stand.png', clip={'x': 220, 'y': 590, 'width': 840, 'height': 210})
        pg.evaluate("() => Rennspiel.spiel.input.gedrueckt.add('ArrowUp')")
        # 5 s Spielzeit: Physik von Hand schrittweise, damit es unabhaengig von der Bildrate ist
        pg.evaluate("() => { const s = Rennspiel.spiel; s.pausiert = true; for (let k = 0; k < 300; k++) s.physikSchritt(1 / 60); s.pausiert = false; }")
        pg.wait_for_timeout(250)
        info = pg.evaluate("""() => { const s = Rennspiel.spiel, f = s.fahrzeuge[0], K = Rennspiel.cockpit, g = K.getriebe(f.auto, f.vehicle.vLaengs, f.vehicle.daten.vMax);
          const h = s.huds ? s.huds[0] : null; return { kmh: Math.round(f.vehicle.vLaengs*3.6), rpm: Math.round(g.rpm), gang: g.gang, skala: g.skala, rot: g.rot, rpmAnzeige: h && h.cockpit ? Math.round(h.cockpit.rpm) : null }; }""")
        pg.screenshot(timeout=180000, path=f'{out}/cockpit_{a}.png', clip={'x': 220, 'y': 590, 'width': 840, 'height': 210})
        ergebnis[a] = info; print(a, info, flush=True)
        pg.evaluate("() => Rennspiel.spiel.input.gedrueckt.delete('ArrowUp')")
    print('Fehler:', fehler)
    b.close()
