#!/usr/bin/env python3
"""v28 W7: Start/Ziel-Schild. Fahrersicht ~60 m vor dem Startbalken je Strecke (+ XL + Mega) und von hinten (Rückseite 'ZIEL');
Draw-Calls mit/ohne Schild-Mesh. Ausgabe tests/out/v28/startziel_*.png. Aufruf: python3 tests/startziel_test.py [id ...]"""
import sys, os, json
from playwright.sync_api import sync_playwright
basis = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
url = 'file://' + os.path.join(basis, 'Autorennen.html')
out = os.path.join(basis, 'tests', 'out', 'v28'); os.makedirs(out, exist_ok=True)
FAELLE = [('wiese', ''), ('wald', ''), ('wueste', ''), ('fantasie', ''), ('dino', ''), ('alpen', ''), ('wueste', 'xl'), ('fantasie', 'xl'), ('mega', '')]
wahl = [a for a in sys.argv[1:] if not a.startswith('-')]
if wahl: FAELLE = [f for f in FAELLE if f[0] in wahl or (f[0] + '_' + f[1]) in wahl]
AUTO = '''([d, rueck]) => { const S = Rennspiel.spiel, sp = S.strecke.spline, L = S.strecke.laenge;
  const s = rueck ? d : sp.wrapS(L - d), q = sp.punktBei(s), f = S.fahrzeuge[0];
  f.vehicle.setzen(q.x, q.z, Rennspiel.headingAus(q.tx, q.tz) + (rueck ? Math.PI : 0)); f.vehicle.vLaengs = 0; f.index = -1; S.kameras[0]._erstesMal = true;
  S.fahrzeuge.forEach((g, i) => { if (i > 0) { const p = sp.punktBei(sp.wrapS(s - 300 - 20 * i)); g.vehicle.setzen(p.x, p.z, Rennspiel.headingAus(p.tx, p.tz)); g.driver && (g.driver.steuerung = () => ({ gas: 0, bremse: 1, lenkung: 0 })); } }); }'''
CALLS = '''() => { const S = Rennspiel.spiel; const m = []; S.szene.traverse(o => { if (o.name === 'StartZielSchild') m.push(o); });
  return new Promise(res => requestAnimationFrame(() => requestAnimationFrame(() => { const mit = S.renderer.info.render.calls; m.forEach(o => o.visible = false);
    requestAnimationFrame(() => requestAnimationFrame(() => { const ohne = S.renderer.info.render.calls; m.forEach(o => o.visible = true); res({ schilder: m.length, mit, ohne }); })); }))); }'''
fehl = 0
with sync_playwright() as p:
    browser = p.chromium.launch(args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
    for sid, var in FAELLE:
        page = browser.new_page(viewport={'width': 1024, 'height': 576}); page.set_default_timeout(240000)
        err = []
        page.on('pageerror', lambda e: err.append(str(e)))
        page.goto(url); page.wait_for_timeout(1200)
        page.evaluate("""([sid, var_]) => Rennspiel.spiel.rennenStarten({ modus: 'solo', streckeId: sid, variante: var_, autoIds: ['passat', 'multivan'], runden: 1, gegner: 2, schwierigkeit: 'mittel', fahrhilfe: ['wenig', 'wenig'], tempoKlasse: 'normal' })""", [sid, var])
        page.wait_for_function('Rennspiel.spiel.rennen && Rennspiel.spiel.rennen.zustand === "laeuft"', timeout=120000)
        page.wait_for_function('Rennspiel.spiel.rennen.zeit > 3.2', timeout=120000)
        name = sid + ('_' + var if var else '')
        for d, rueck, tag in [(52, False, '60m'), (44, True, 'hinten')]:
            page.evaluate(AUTO, [d, rueck]); page.wait_for_timeout(700)
            page.evaluate(AUTO, [d, rueck]); page.wait_for_timeout(500)
            page.screenshot(path=os.path.join(out, 'startziel_%s_%s.png' % (name, tag)))
        c = page.evaluate(CALLS)
        ok = c['schilder'] == 1 and c['mit'] - c['ohne'] == 1 and not err
        fehl += 0 if ok else 1
        print(('OK   ' if ok else 'FEHL '), name, c, err[:2])
        page.close()
    browser.close()
print('FEHL gesamt', fehl)
sys.exit(1 if fehl else 0)
