#!/usr/bin/env python3
"""Start-Boost im echten Spiel (Playwright, headless): Gas im Fenster -> Boost + Meldung, zu früh -> Verzögerung, spät -> normal.
Aufruf: python3 tests/startboost_test.py"""
import os, sys
from playwright.sync_api import sync_playwright
basis = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
url = 'file://' + os.path.join(basis, 'Autorennen.html')
fehler, ok_alle = [], True
def pruefe(name, ok, info=''):
    global ok_alle
    ok_alle = ok_alle and bool(ok)
    print(('OK   ' if ok else 'FAIL ') + name + (' – ' + str(info) if info != '' else ''))

with sync_playwright() as p:
    b = p.chromium.launch(args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
    page = b.new_page(viewport={'width': 1000, 'height': 600})
    page.on('pageerror', lambda e: fehler.append(str(e)))
    page.goto(url); page.wait_for_function('window.Rennspiel && Rennspiel.spiel', timeout=15000); page.wait_for_timeout(1000)

    def lauf(gas_bei):
        """Rennen starten (solo, 3 Gegner), Gas drücken zur Zeit gas_bei (s relativ zu LOS), danach 2,5 s fahren."""
        page.evaluate("Rennspiel.spiel.rennenStarten({ modus: 'solo', streckeId: 'wiese', runden: 1, gegner: 3, schaden: false, wetter: 'klar', welt: '' })")
        cd = page.evaluate('Rennspiel.spiel.rennen.countdown')
        vor = cd + gas_bei                      # Sekunden bis zum Gasdrücken
        if vor > 0.02: page.evaluate(f'Rennspiel.spiel.schnellvorlauf({vor})')
        page.keyboard.down('ArrowUp')
        rest = (-gas_bei) if gas_bei < 0 else 0
        meldung = ''
        page.evaluate(f'Rennspiel.spiel.schnellvorlauf({max(rest, 0) + 0.3})')
        meldung = page.evaluate("document.querySelector('.hud-meldung') ? document.querySelector('.hud-meldung').textContent : ''")
        page.evaluate('Rennspiel.spiel.schnellvorlauf(2.2)')
        v = page.evaluate('Rennspiel.spiel.fahrzeuge[0].vehicle.vLaengs')
        sb = page.evaluate('Rennspiel.spiel.startBoost.ergebnis(0)')
        page.keyboard.up('ArrowUp')
        return v, sb, meldung

    v_boost, e1, m1 = lauf(-0.1)
    v_frueh, e2, m2 = lauf(-0.6)
    v_spaet, e3, m3 = lauf(0.5)
    print('Tempo nach ~2,5 s (m/s): Boost %.1f · zu früh %.1f · spät %.1f' % (v_boost, v_frueh, v_spaet))
    pruefe('Gas im Fenster: Ergebnis boost + Meldung „Startboost“', e1 == 'boost' and 'Startboost' in m1, (e1, m1))
    pruefe('Gas 0,6 s zu früh: Ergebnis zufrueh + Meldung „Zu früh“', e2 == 'zufrueh' and 'Zu früh' in m2, (e2, m2))
    pruefe('Gas 0,5 s zu spät: normaler Start', e3 == 'normal', e3)
    pruefe('Boost schneller als normaler Start, zu früh langsamer als normal', v_boost > v_spaet + 0.3 and v_frueh < v_spaet - 0.3, (round(v_boost, 1), round(v_spaet, 1), round(v_frueh, 1)))
    # KI bekommt zufällig Boost (Entscheidung bei LOS gefallen)
    erg = page.evaluate("Rennspiel.spiel.fahrzeuge.map((f, i) => f.istSpieler ? 'S' : Rennspiel.spiel.startBoost.ergebnis(i))")
    pruefe('KI-Autos: Startentscheidung gefallen (boost/normal)', all(x in ('boost', 'normal', 'S') for x in erg), erg)
    pruefe('Keine JS-Fehler', not fehler, fehler)
    b.close()
print('ALLE OK' if ok_alle else 'FEHLER')
sys.exit(0 if ok_alle else 1)
