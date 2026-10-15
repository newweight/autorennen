#!/usr/bin/env python3
"""Test Cabrio-Dach bei Regen (15.10. v24): python3 tests/dach_regen_test.py
Prüft im Browser: Regen-Start mit offenem Dach → Hinweis im Countdown · Strafuhr im Rennen („Dach zu! noch n s“) · ↑+↓ im Stand:
Meldung „Dach schließt …“, Auto bleibt stehen (Gas gesperrt), danach „Dach ist zu ✔“ und keine Uhr mehr · bei Trockenheit keine Uhr.
Screenshot nach tests/out/v24/regen_hud.png"""
import sys, os
from playwright.sync_api import sync_playwright

basis = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
url = 'file://' + os.path.join(basis, 'Autorennen.html')
out = os.path.join(basis, 'tests', 'out', 'v24'); os.makedirs(out, exist_ok=True)
ergebnisse = []
def pruefe(name, ok, info=''):
    ergebnisse.append(ok); print(('OK   ' if ok else 'FEHL ') + name + (' – ' + str(info) if info != '' else ''))

HUD = "() => Array.from(document.querySelectorAll('.hud-dach')).filter(e => e.style.display !== 'none').map(e => e.textContent).join('|')"
MELD = "() => Array.from(document.querySelectorAll('.hud-meldung')).map(e => e.textContent).join('|')"
DL = "() => { const d = Rennspiel.spiel.fahrzeuge[0].dachL; const v = Rennspiel.spiel.fahrzeuge[0].vehicle; return { ziel: d.ziel, rest: d.rest, nass: d.nass, uhr: d.uhr, strafen: d.strafen, gesund: d.gesund, x: v.x, z: v.z, v: v.vLaengs }; }"

def start(page, wetter):
    page.evaluate("(w) => Rennspiel.spiel.rennenStarten({ modus: 'solo', streckeId: 'wiese', autoIds: ['troc-cabrio', 'multivan'], runden: 3, gegner: 2, schwierigkeit: 'mittel', fahrhilfe: ['wenig', 'wenig'], wetter: w, jahreszeit: 'sommer' })", wetter)
    page.wait_for_timeout(1200)

def kombi(page, tasten, halten=300):
    page.evaluate("() => Rennspiel.spiel.fahrzeuge.forEach(f => { f.vehicle.vLaengs = 0; })")
    for t in tasten: page.keyboard.down(t)
    page.wait_for_timeout(halten)
    for t in reversed(tasten): page.keyboard.up(t)

with sync_playwright() as pw:
    browser = pw.chromium.launch(args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
    page = browser.new_page(viewport={'width': 1100, 'height': 650})
    fehler = []
    page.on('pageerror', lambda e: fehler.append(str(e)))
    page.on('console', lambda m: fehler.append('console.error: ' + m.text) if m.type == 'error' else None)
    page.goto(url); page.wait_for_timeout(1200)

    # ---------- trocken: keine Uhr ----------
    start(page, 'klar')
    pruefe('Trocken: Dach offen, keine Nässe, keine Strafuhr', not page.evaluate(DL)['nass'] and 'Dach zu' not in page.evaluate(HUD), page.evaluate(HUD))

    # ---------- Regen ----------
    start(page, 'regen')
    d = page.evaluate(DL)
    pruefe('Regen-Start: Auto ist nass, Dach offen', d['nass'] and d['ziel'] == 0, d)
    t = page.evaluate(HUD) + '|' + page.evaluate(MELD)
    pruefe('Hinweis auf Regen/Dach (Countdown)', 'Dach' in t and ('Regen' in t or '↑+↓' in t), t)
    # Rennen läuft lassen bis Uhr sichtbar
    try:
        page.wait_for_function("() => /noch \\d+ s/.test(Array.from(document.querySelectorAll('.hud-dach')).map(e => e.textContent).join(' '))", timeout=30000)
    except Exception: pass
    h = page.evaluate(HUD)
    pruefe('Strafuhr im Rennen: „Dach zu! noch n s“', 'noch' in h, h)
    page.screenshot(path=os.path.join(out, 'regen_hud.png'))
    # anhalten und Dach schließen
    page.evaluate("() => { const v = Rennspiel.spiel.fahrzeuge[0].vehicle; v.vLaengs = 0; }")
    kombi(page, ['ArrowUp', 'ArrowDown'])
    try: page.wait_for_function("() => Rennspiel.spiel.fahrzeuge[0].dachL.rest > 0 || Rennspiel.spiel.fahrzeuge[0].dachL.ziel === 1", timeout=5000)
    except Exception: pass
    a = page.evaluate(DL); hh = page.evaluate(HUD)
    pruefe('↑+↓ im Stand: Dach schließt (Ziel zu), Anzeige „schließt“', a['ziel'] == 1 and ('schließt' in hh or a['rest'] <= 0), (a, hh))
    page.keyboard.down('ArrowUp'); page.wait_for_timeout(400)
    b = page.evaluate(DL)
    pruefe('Gas gesperrt: Auto bleibt beim Schließen stehen', (a['rest'] <= 0) or abs(b['v']) < 0.5, (a['rest'], b['v']))
    page.keyboard.up('ArrowUp')
    try: page.wait_for_function("() => Rennspiel.spiel.fahrzeuge[0].dachL.rest <= 0 && Rennspiel.spiel.fahrzeuge[0].dachL.ziel === 1", timeout=20000)
    except Exception: pass
    c = page.evaluate(DL)
    pruefe('Dach zu, keine Strafe angefallen', c['ziel'] == 1 and c['rest'] <= 0 and c['strafen'] == 0 and c['gesund'] == 100, c)
    pruefe('Keine Strafuhr mehr bei geschlossenem Dach', 'noch' not in page.evaluate(HUD), page.evaluate(HUD))
    pruefe('keine JS-Fehler', not fehler, fehler)
    browser.close()

print()
print('ALLE OK' if all(ergebnisse) else 'FEHLER')
sys.exit(0 if all(ergebnisse) else 1)
