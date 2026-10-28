#!/usr/bin/env python3
"""M5: sammelt zur Laufzeit ALLE Canvas-Texte (fillText/strokeText) je Strecke in beiden Spielen + DOM-Texte der Menüs.
Aufruf: python3 tests/m5_texte.py   -> Liste je Spiel/Strecke (so findet man auch zusammengesetzte Strings)."""
import os, json, sys
from playwright.sync_api import sync_playwright
basis = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
INIT = """(() => { window.__T = {}; const w = (n) => { const o = CanvasRenderingContext2D.prototype[n];
  CanvasRenderingContext2D.prototype[n] = function (t) { try { const k = String(t); window.__T[k] = (window.__T[k] || 0) + 1; } catch (e) {} return o.apply(this, arguments); }; };
  w('fillText'); w('strokeText'); })()"""
spiele = [('Autorennen.html', ['passat', 'passat'], 'passat'), ('Motorrad.html', ['crossmaschine', 'crossmaschine-rot'], 'moto')]
ergebnis = {}
fehler = []
with sync_playwright() as p:
    b = p.chromium.launch(args=ARGS)
    for html, autos, tag in spiele:
        page = b.new_page(viewport={'width': 1280, 'height': 720}); page.set_default_timeout(300000)
        page.add_init_script(INIT)
        page.on('pageerror', lambda e: fehler.append(str(e)))
        page.on('console', lambda m: fehler.append(m.text) if m.type == 'error' else None)
        page.goto('file://' + os.path.join(basis, html)); page.wait_for_timeout(1500)
        ids = page.evaluate("Object.keys(Rennspiel.config.strecken || {}).length ? Object.keys(Rennspiel.config.strecken) : (Rennspiel.TrackCatalog ? Object.keys(Rennspiel.TrackCatalog.strecken || {}) : [])")
        if not ids: ids = ['wiese', 'wald', 'wueste', 'fantasie', 'dino', 'alpen', 'formel1']
        print(html, ids)
        ergebnis[html + ':menue'] = page.evaluate("document.body.innerText")
        for sid in ids:
            opt = "{ modus: 'solo', streckeId: '%s', autoIds: ['%s', '%s'], runden: 2, gegner: 3, schwierigkeit: 'mittel', fahrhilfe: ['wenig', 'wenig'] }" % (sid, autos[0], autos[1])
            try:
                page.evaluate("Rennspiel.spiel.rennenStarten(%s)" % opt); page.wait_for_timeout(2500)
                page.evaluate("Rennspiel.spiel.autopilot && Rennspiel.spiel.autopilot(0, true)")
                page.wait_for_timeout(4000)
                ergebnis[html + ':' + sid] = page.evaluate("Object.keys(window.__T)")
                ergebnis[html + ':' + sid + ':dom'] = page.evaluate("document.body.innerText")
            except Exception as e:
                fehler.append(sid + ': ' + str(e)[:200])
        page.close()
    b.close()
alle = {}
for k, v in ergebnis.items():
    if k.endswith(':menue') or k.endswith(':dom'): continue
    for t in v: alle.setdefault(t, []).append(k)
print('--- CANVAS-TEXTE (einmalig) ---')
for t, ks in sorted(alle.items()): print(repr(t), '<-', len(ks), 'x', ks[0])
json.dump(ergebnis, open(os.path.join(basis, 'tests', 'bilder_m5', 'texte.json'), 'w'), ensure_ascii=False, indent=1)
print('Fehler:', fehler[:10])
