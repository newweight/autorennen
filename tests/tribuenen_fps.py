#!/usr/bin/env python3
"""FPS mit/ohne Tribünen (15.10., v25): python3 tests/tribuenen_fps.py [strecke] – gleiche Szene, config.tribuenen.an = true/false, Auto steht 60 m vor der
Start/Ziel-Tribüne (viele Zuschauer im Bild). SwiftShader (Software-Rendering) → nur Verhältnis aussagekräftig; Last durch andere Prozesse schwankt (2 Durchgänge abwechselnd)."""
import sys, os, json
from playwright.sync_api import sync_playwright
basis = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
url = 'file://' + os.path.join(basis, 'Autorennen.html')
sid = sys.argv[1] if len(sys.argv) > 1 else 'wiese'
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
FPS = '''() => new Promise(res => { let n = 0, maxdt = 0, last = performance.now(); const t0 = last; const f = () => { const t = performance.now(); maxdt = Math.max(maxdt, t - last); last = t; n++; if (t - t0 > 4000) res({ fps: n / ((t - t0) / 1000), maxMs: maxdt }); else requestAnimationFrame(f); }; requestAnimationFrame(f); })'''
def lauf(browser, an):
    page = browser.new_page(viewport={'width': 960, 'height': 540})
    page.goto(url); page.wait_for_timeout(1000)
    page.evaluate('Rennspiel.config.tribuenen.an = %s' % ('true' if an else 'false'))
    page.evaluate("Rennspiel.spiel.rennenStarten({ modus: 'solo', streckeId: '%s', autoIds: ['troc-cabrio', 'multivan'], runden: 3, gegner: 2, schwierigkeit: 'mittel', fahrhilfe: ['wenig', 'wenig'] })" % sid)
    page.wait_for_function('Rennspiel.spiel.rennen.zustand === "laeuft"', timeout=120000)
    n = page.evaluate('(Rennspiel.spiel.strecke.tribuenen || []).length')
    page.evaluate('''(() => { const s = Rennspiel.spiel; s.fahrzeuge.forEach((f, i) => { if (i > 0) { const p = s.strecke.spline.punktBei(s.strecke.laenge - 300 - 20 * i);
      f.vehicle.setzen(p.x, p.z, Rennspiel.headingAus(p.tx, p.tz)); f.driver && (f.driver.steuerung = () => ({ gas: 0, bremse: 1, lenkung: 0 })); } });
      const sp = s.strecke.spline, p = sp.punktBei(-60), f = s.fahrzeuge[0]; f.vehicle.setzen(p.x, p.z, Rennspiel.headingAus(p.tx, p.tz)); f.index = -1; s.kameras[0]._erstesMal = true; })()''')
    page.wait_for_timeout(2500)
    r = page.evaluate(FPS)
    r['tribuenen'] = n
    r['dreiecke'] = page.evaluate('Rennspiel.spiel.renderer.info.render.triangles')
    r['drawCalls'] = page.evaluate('Rennspiel.spiel.renderer.info.render.calls')
    page.close()
    return r
with sync_playwright() as p:
    b = p.chromium.launch(args=ARGS)
    erg = []
    for an in (False, True, False, True):
        r = lauf(b, an); r['an'] = an; erg.append(r); print(json.dumps(r))
    b.close()
for an in (False, True):
    l = [e for e in erg if e['an'] == an]
    print('Tribünen %s: FPS %.1f (Mittel), Dreiecke %d, Draw-Calls %d' % ('an ' if an else 'aus', sum(e['fps'] for e in l) / len(l), l[0]['dreiecke'], l[0]['drawCalls']))
