#!/usr/bin/env python3
"""Schnell-Screenshots: python3 tests/cockpit_shot.py <auto> <kamera> <wetter> <ausgabe.png> [kmh] [zwei]"""
import sys, os
from playwright.sync_api import sync_playwright
basis = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
url = 'file://' + os.path.join(basis, 'Autorennen.html')
auto, kam, wetter, aus = sys.argv[1:5]
kmh = float(sys.argv[5]) if len(sys.argv) > 5 else 120
zwei = len(sys.argv) > 6
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
with sync_playwright() as p:
    b = p.chromium.launch(args=ARGS)
    pg = b.new_page(viewport={'width': 1280, 'height': 800})
    fehler = []
    pg.on('pageerror', lambda e: fehler.append(str(e)))
    pg.on('console', lambda m: fehler.append('console.error: ' + m.text) if m.type == 'error' else None)
    pg.goto(url); pg.wait_for_timeout(1200)
    ids = "['%s','multivan']" % auto
    pg.evaluate("""() => Rennspiel.spiel.rennenStarten({ modus: '%s', streckeId: 'wiese', autoIds: %s, runden: 3, gegner: 3, schwierigkeit: 'mittel', fahrhilfe: ['wenig','wenig'], wetter: '%s', jahreszeit: 'herbst' })""" % ('zwei' if zwei else 'solo', ids, wetter))
    pg.wait_for_timeout(500)
    pg.evaluate("() => Rennspiel.spiel.schnellvorlauf(8)")
    pg.evaluate("""([kam, kmh]) => { const s = Rennspiel.spiel; s.kameras.forEach(k => { k.modusIndex = Rennspiel.config.kamera.modi.indexOf(kam); k._erstesMal = true; });
      s.fahrzeuge.forEach((f, i) => { if (i < 2) f.vehicle.vLaengs = kmh / 3.6; }); }""", [kam, kmh])
    pg.wait_for_timeout(2500)
    pg.screenshot(path=aus)
    print('Fehler:', fehler)
    b.close()
