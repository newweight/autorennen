#!/usr/bin/env python3
"""Integrationstest: komplettes Rennen im Schnellvorlauf (Spieler fährt nicht), KI muss fahren und Runden zählen.
Aufruf: python3 tests/rennen_test.py [streckenId]   (Standard wiese; fantasie: zusätzlich Loopings/Bälle/Wasser prüfen)
Prüft: keine JS-Fehler, keine NaN, alle 3 KI nach 400 s mit 3 Runden im Ziel (Fantasie: Loopings geschafft, kein Sturz)."""
import sys, os, json
from playwright.sync_api import sync_playwright

basis = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
out = os.path.join(basis, 'tests', 'out'); os.makedirs(out, exist_ok=True)
url = 'file://' + os.path.join(basis, 'Autorennen.html')
sid = sys.argv[1] if len(sys.argv) > 1 else 'wiese'

ZUSTAND = '''(() => { const s = Rennspiel.spiel, r = s.rennen;
  return { zustand: r.zustand, teilnehmer: r.teilnehmer.map((t, i) => ({ name: t.name, runde: t.runde, cp: t.naechsterCheckpoint,
    platz: t.platz, fortschritt: Math.round(t.fortschritt), imZiel: !!t.imZiel, kmh: t.vehicle.tempoKmh,
    untergrund: t.vehicle.untergrund, nan: [t.vehicle.x, t.vehicle.z, t.vehicle.heading, t.vehicle.vLaengs].some(v => !isFinite(v)),
    resets: s.fahrzeuge[i].driver ? s.fahrzeuge[i].driver.resets || 0 : null,
    looping: s.fahrzeuge[i].looping ? { geschafft: s.fahrzeuge[i].looping.geschafft, gefallen: s.fahrzeuge[i].looping.gefallen, zuLangsam: s.fahrzeuge[i].looping.zuLangsam } : null })),
    baelle: s.dynamik ? s.dynamik.alleBaelle().length : null, baelleAn: s.dynamik ? s.dynamik.baelleAn : null }; })()'''

with sync_playwright() as p:
    browser = p.chromium.launch(args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
    page = browser.new_page(viewport={'width': 1280, 'height': 800})
    fehler = []
    page.on('pageerror', lambda e: fehler.append(str(e)))
    page.on('console', lambda m: fehler.append('console.error: ' + m.text) if m.type == 'error' else None)
    page.goto(url); page.wait_for_timeout(1500)
    page.evaluate("(id) => Rennspiel.spiel.rennenStarten({ modus: 'solo', streckeId: id, autoIds: ['troc-cabrio', 'multivan'], runden: 3, gegner: 3, schwierigkeit: 'mittel', fahrhilfe: ['wenig', 'wenig'] })", sid)
    page.wait_for_timeout(1000)
    ergebnis = {}; bisher = 0
    for sek in (5, 60, 120, 240, 400):
        page.evaluate('(s) => Rennspiel.spiel.schnellvorlauf(s)', sek - bisher); bisher = sek
        ergebnis[sek] = page.evaluate(ZUSTAND)
        page.wait_for_timeout(300)
        page.screenshot(path=os.path.join(out, f'rennen_{sid}_{sek:03d}s.png' if sid != 'wiese' else f'rennen_{sek:03d}s.png'))
    print(json.dumps({'verlauf': ergebnis, 'fehler': fehler}, indent=1, ensure_ascii=False))
    browser.close()
    ende = ergebnis[400]['teilnehmer']
    ki = ende[1:]
    pruef = [('keine JS-Fehler', not fehler, fehler[:3]),
             ('keine NaN', not any(t['nan'] for t in ende), ''),
             ('3 KI × 3 Runden in 400 s im Ziel', all(t['imZiel'] and t['runde'] >= 3 for t in ki), [(t['name'], t['runde']) for t in ki])]
    if sid == 'fantasie':
        n = 2 * 3   # 2 Loopings × 3 Runden
        pruef.append(('Fantasie: jede KI ≥ ' + str(n) + ' Loopings geschafft, 0 Stürze', all(t['looping']['geschafft'] >= n and t['looping']['gefallen'] == 0 for t in ki),
                      [t['looping'] for t in ki]))
    for name, ok, info in pruef: print(('OK   ' if ok else 'FEHL ') + '[' + sid + '] ' + name + (' – ' + str(info) if info != '' else ''))
    sys.exit(0 if all(ok for _, ok, _ in pruef) else 1)
