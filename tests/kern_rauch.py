#!/usr/bin/env python3
"""K1 – Start-Rauchtest je HTML (Pflicht-Stufe von werkzeuge/alle_pruefen.sh): Seite lädt, Rennen startet, Countdown, 10 s fahren, keine JS-Fehler.
Nutzt die Hilfen aus tests/matrix_alle.py (gleiche Fehlerfänger: pageerror, console.error, frame()-Ausnahmen, Fehleranzeige, NaN).
Aufruf: python3 tests/kern_rauch.py [--spiel auto,moto] [--strecke wiese] [--sekunden 10]
Ausgabe: je Spiel OK/FEHL; Exit-Code 0 nur ohne FEHL."""
import argparse, os, sys, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import matrix_alle as M
from playwright.sync_api import sync_playwright

PROFIL_NAME = {'auto': 'autorennen', 'moto': 'motorrad'}

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--spiel', default='auto,moto'); ap.add_argument('--strecke', default='wiese'); ap.add_argument('--sekunden', type=float, default=10)
    a = ap.parse_args()
    fehler = 0
    with sync_playwright() as p:
        browser = p.chromium.launch(args=M.ARGS)
        for spiel in a.spiel.split(','):
            html = M.SPIELE[spiel][0]
            t = time.time()
            try:
                page = M.neue_seite(browser, spiel)
                M.spiel_laden(page, spiel)
                prof = page.evaluate('() => (Rennspiel.Profil && Rennspiel.Profil.name()) || null')
                ok_p = prof == PROFIL_NAME[spiel]
                print(('OK   ' if ok_p else 'FEHL ') + '%s: Spiel-Profil geladen (%s)' % (html, prof)); fehler += 0 if ok_p else 1
                ok, grund, info = M.offline_kombi(page, spiel, a.strecke, 'solo', 'normal', a.sekunden, 0)
                if not ok: fehler += 1
                print(('OK   ' if ok else 'FEHL ') + '%s: lädt, startet, %.0f s fahren (Strecke %s, vmax %s m/s, %.0f s)%s' % (html, a.sekunden, a.strecke, info.get('vmax'), time.time() - t, '' if ok else '  -> ' + grund))
                page.context.close()
            except Exception as e:
                fehler += 1; print('FEHL %s: Ausnahme: %s' % (html, str(e)[:300]))
        browser.close()
    print('\n%s' % ('%d FEHL' % fehler if fehler else 'alle OK, 0 FEHL'))
    sys.exit(1 if fehler else 0)

if __name__ == '__main__':
    main()
