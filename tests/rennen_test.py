#!/usr/bin/env python3
"""Integrationstest: komplettes Rennen im Schnellvorlauf (Spieler fährt nicht), KI muss fahren und Runden zählen."""
import sys, os, json
from playwright.sync_api import sync_playwright

basis = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
out = os.path.join(basis, 'tests', 'out'); os.makedirs(out, exist_ok=True)
url = 'file://' + os.path.join(basis, 'Autorennen.html')

ZUSTAND = '''(() => { const s = Rennspiel.spiel, r = s.rennen;
  return { zustand: r.zustand, teilnehmer: r.teilnehmer.map((t, i) => ({ name: t.name, runde: t.runde, cp: t.naechsterCheckpoint,
    platz: t.platz, fortschritt: Math.round(t.fortschritt), imZiel: !!t.imZiel, kmh: t.vehicle.tempoKmh,
    untergrund: t.vehicle.untergrund, nan: [t.vehicle.x, t.vehicle.z, t.vehicle.heading, t.vehicle.vLaengs].some(v => !isFinite(v)),
    resets: s.fahrzeuge[i].driver ? s.fahrzeuge[i].driver.resets || 0 : null })) }; })()'''

with sync_playwright() as p:
    browser = p.chromium.launch(args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
    page = browser.new_page(viewport={'width': 1280, 'height': 800})
    fehler = []
    page.on('pageerror', lambda e: fehler.append(str(e)))
    page.on('console', lambda m: fehler.append('console.error: ' + m.text) if m.type == 'error' else None)
    page.goto(url); page.wait_for_timeout(1500)
    page.evaluate("Rennspiel.spiel.rennenStarten({ modus: 'solo', streckeId: 'wiese', autoIds: ['troc-cabrio', 'multivan'], runden: 3, gegner: 3, schwierigkeit: 'mittel', fahrhilfe: ['wenig', 'wenig'] })")
    page.wait_for_timeout(1000)
    ergebnis = {}; bisher = 0
    for sek in (5, 60, 120, 240, 400):
        page.evaluate('(s) => Rennspiel.spiel.schnellvorlauf(s)', sek - bisher); bisher = sek
        ergebnis[sek] = page.evaluate(ZUSTAND)
        page.wait_for_timeout(300)
        page.screenshot(path=os.path.join(out, f'rennen_{sek:03d}s.png'))
    print(json.dumps({'verlauf': ergebnis, 'fehler': fehler}, indent=1, ensure_ascii=False))
    browser.close()
