#!/usr/bin/env python3
"""Headless-Screenshots der Auto-Vorschau (tests/autos_vorschau.html) nach tests/out/autos_*.png.
Aufruf: python3 tests/autos_screenshot.py [ausgabeordner] [auto-id ...]
Erzeugt:
  autos_uebersicht_<ansicht>.png   alle Autos im Raster (front35, seite, heck, front0)
  autos_<id>_<ansicht>.png         je Auto Einzelansichten (front35, seite, heck)
  autos_<id>_alle4.png             je Auto 4 Blickwinkel nebeneinander (Front ¾, Seite, Heck ¾, Front)
  autos_alle4.png                  alle Autos untereinander, je 4 Blickwinkel
Mit --nur-alle4 werden nur die alle4-Bilder erzeugt (schneller).
Alle Aufnahmen mit Blaulicht-Phase 1 (links an) – wirkt nur beim Streifenwagen.
Zusätzlich: autos_polizei_blaulicht1.png / _blaulicht2.png (Front-Ansicht, Phase 1 links an, Phase 2 rechts an).
"""
import sys, os, json
from playwright.sync_api import sync_playwright

basis = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
args = sys.argv[1:]
out = os.path.join(basis, 'tests', 'out')
if args and os.path.isdir(args[0]) or (args and '/' in args[0]):
    out, args = args[0], args[1:]
nur_alle4 = '--nur-alle4' in args
nur_ids = [a for a in args if not a.startswith('--')]
os.makedirs(out, exist_ok=True)
seite = 'file://' + os.path.join(basis, 'tests', 'autos_vorschau.html')

ANSICHTEN = {'front35': 35, 'seite': 90, 'heck': 215, 'front0': 0}

with sync_playwright() as p:
    browser = p.chromium.launch(args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
    page = browser.new_page(viewport={'width': 1600, 'height': 900})
    fehler = []
    page.on('pageerror', lambda e: fehler.append(str(e)))
    page.on('console', lambda m: fehler.append('console.' + m.type + ': ' + m.text) if m.type in ('error',) else None)

    # alle4: je Auto 4 Blickwinkel
    ids = None
    page.goto(f'{seite}?ansicht=alle4')
    n = page.evaluate('() => window.Rennspiel.carCatalog.length')
    page.set_viewport_size({'width': 1600, 'height': 400 * n})
    page.goto(f'{seite}?ansicht=alle4&blaulicht=1')
    page.wait_for_timeout(800)
    page.screenshot(path=os.path.join(out, 'autos_alle4.png'))
    page.set_viewport_size({'width': 1600, 'height': 400})
    ids = page.evaluate('() => window.Rennspiel.carCatalog.map(a => a.id)')
    for i in ids:
        if nur_ids and i not in nur_ids:
            continue
        page.goto(f'{seite}?ansicht=alle4&auto={i}&blaulicht=1')
        page.wait_for_timeout(400)
        page.screenshot(path=os.path.join(out, f'autos_{i}_alle4.png'))
    # Blaulicht-Kontrolle: Streifenwagen von vorn, Phase 1 (links) und Phase 2 (rechts)
    if 'polizei' in ids and (not nur_ids or 'polizei' in nur_ids):
        page.set_viewport_size({'width': 800, 'height': 500})
        for ph in (1, 2):
            page.goto(f'{seite}?auto=polizei&winkel=0&hoehe=20&blaulicht={ph}')
            page.wait_for_timeout(300)
            page.screenshot(path=os.path.join(out, f'autos_polizei_blaulicht{ph}.png'))
    page.set_viewport_size({'width': 1600, 'height': 900})
    if nur_alle4:
        print(json.dumps({'fehler': fehler}, ensure_ascii=False))
        browser.close()
        sys.exit(1 if fehler else 0)

    # Übersichten
    for name, w in ANSICHTEN.items():
        page.goto(f'{seite}?winkel={w}&blaulicht=1')
        page.wait_for_timeout(500)
        page.screenshot(path=os.path.join(out, f'autos_uebersicht_{name}.png'))

    # Katalog-Ids und Meshzahl auslesen
    page.goto(seite + '?winkel=35')
    page.wait_for_timeout(300)
    info = page.evaluate('''() => window.vorschau.eintraege.map(e => {
        let meshes = 0; e.auto.traverse(o => { if (o.isMesh) meshes++; });
        return { id: e.auto.userData.autoId, typ: e.auto.userData.karosserie, meshes,
                 raeder: e.auto.userData.raeder.length, vorne: e.auto.userData.vorderraeder.length,
                 lenk: e.auto.userData.lenkObjekte.length, brems: e.auto.userData.bremslichter.length };
    })''')
    # Einzelansichten
    for a in info:
        if nur_ids and a['id'] not in nur_ids:
            continue
        for name in ('front35', 'seite', 'heck'):
            page.goto(f"{seite}?auto={a['id']}&winkel={ANSICHTEN[name]}&blaulicht=1")
            page.wait_for_timeout(300)
            page.screenshot(path=os.path.join(out, f"autos_{a['id']}_{name}.png"))

    # Demo-SUV (kein Katalogauto, nur zur Kontrolle des Typs 'suv')
    if not nur_ids or 'demo-suv' in nur_ids:
        for name in ('front35', 'seite', 'heck'):
            page.goto(f"{seite}?auto=demo-suv&extra=1&winkel={ANSICHTEN[name]}")
            page.wait_for_timeout(300)
            page.screenshot(path=os.path.join(out, f"autos_demo-suv_{name}.png"))

    print(json.dumps({'autos': info, 'fehler': fehler}, indent=1, ensure_ascii=False))
    browser.close()
