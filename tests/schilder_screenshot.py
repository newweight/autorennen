#!/usr/bin/env python3
"""Bilder + Draw-Calls der Kurvenschilder (14.10., v20): python3 tests/schilder_screenshot.py [strecke|alle] [ausgabeordner] [--aus] [--schnell]
Fahrersicht: Auto steht 90 / 50 / 25 m vor dem Schild (Verfolger-Kamera) – für die ersten Schilder und die Haarnadel (Leitpfeile).
--aus: Kurvenschilder abgeschaltet (Vergleich der Draw-Calls). Ausgabe: tests/out/schilder/<strecke>_<name>.png und <strecke>_messung.json"""
import sys, os, json
from playwright.sync_api import sync_playwright

basis = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
url = 'file://' + os.path.join(basis, 'Autorennen.html')
args = [a for a in sys.argv[1:] if not a.startswith('--')]
wahl = args[0] if args else 'alle'
out = args[1] if len(args) > 1 else os.path.join(basis, 'tests', 'out', 'schilder')
aus = '--aus' in sys.argv
klasse = 'schnell' if '--schnell' in sys.argv else 'normal'
os.makedirs(out, exist_ok=True)

DRAW = '''(() => { const s = Rennspiel.spiel; let n = 0; const namen = [];
  s.szene.children.forEach(g => { if (!(g.name.startsWith('Strecke') || g.name.startsWith('Deko'))) return;
    g.traverse(o => { if ((o.isMesh || o.isInstancedMesh) && o.visible && (!o.isInstancedMesh || o.count > 0) && !(o.userData.stueck > 0)) { n++; namen.push(o.name); } }); });
  return { meshes: n, schilderMeshes: namen.filter(x => x === 'Kurvenschilder').length, drawCalls: s.renderer.info.render.calls, dreiecke: s.renderer.info.render.triangles }; })()'''
SCHILDER = '''(() => { const st = Rennspiel.spiel.strecke; return (st.kurvenschilder || []).map(s => ({ nr: s.nr, s: s.s, kmh: s.kmh, zeichen: s.zeichen, haarnadel: s.haarnadel, kurveS0: s.kurveS0, abstand: s.abstand,
  leit: s.leitpfeile.map(l => l.s) })); })()'''
AUTO = '''(s) => { const S = Rennspiel.spiel, sp = S.strecke.spline, q = sp.punktBei(s), f = S.fahrzeuge[0];
  f.vehicle.setzen(q.x, q.z, Rennspiel.headingAus(q.tx, q.tz)); f.vehicle.vLaengs = 0; f.index = -1; S.kameras[0]._erstesMal = true; }'''

def lauf(browser, sid):
    page = browser.new_page(viewport={'width': 1280, 'height': 720})
    fehler = []
    page.on('pageerror', lambda e: fehler.append(str(e)))
    page.on('console', lambda m: fehler.append('console.' + m.type + ': ' + m.text) if m.type == 'error' else None)
    page.goto(url); page.wait_for_timeout(1200)
    if aus:
        page.evaluate('Rennspiel.config.kurvenschilder.an = false')
    page.evaluate("([id, k]) => Rennspiel.spiel.rennenStarten({ modus: 'solo', streckeId: id, autoIds: ['troc-cabrio', 'multivan'], runden: 3, gegner: 2, schwierigkeit: 'mittel', fahrhilfe: ['wenig', 'wenig'], tempoKlasse: k })", [sid, klasse])
    page.wait_for_timeout(1200)
    erg = {'strecke': sid, 'klasse': klasse, 'aus': aus, 'draw': page.evaluate(DRAW), 'schilder': page.evaluate(SCHILDER)}
    page.wait_for_function('Rennspiel.spiel.rennen.zustand === "laeuft"', timeout=90000)
    # Computerautos weit weg parken (stehen sonst im Bild)
    page.evaluate('''(() => { const s = Rennspiel.spiel; s.fahrzeuge.forEach((f, i) => { if (i > 0) { const p = s.strecke.spline.punktBei(s.strecke.laenge - 300 - 20 * i);
      f.vehicle.setzen(p.x, p.z, Rennspiel.headingAus(p.tx, p.tz)); f.driver && (f.driver.steuerung = () => ({ gas: 0, bremse: 1, lenkung: 0 })); } }); })()''')
    if not aus:
        liste = erg['schilder']
        wahl_s = [x for x in liste if not x['haarnadel']][:2] + [x for x in liste if x['haarnadel']][:1]
        for x in wahl_s:
            for d in (90, 50, 25):
                page.evaluate(AUTO, x['s'] - d); page.wait_for_timeout(2500)
                page.screenshot(path=os.path.join(out, '%s_%s%d_%dm.png' % (sid, 'hn' if x['haarnadel'] else 's', x['nr'], d)))
            if x['leit']:
                page.evaluate(AUTO, x['leit'][1] - 45); page.wait_for_timeout(2500)
                page.screenshot(path=os.path.join(out, '%s_leit%d.png' % (sid, x['nr'])))
    erg['fehler'] = fehler
    json.dump(erg, open(os.path.join(out, sid + ('_aus' if aus else '') + '_messung.json'), 'w'), indent=1)
    print(sid, 'aus' if aus else 'an', klasse, json.dumps(erg['draw']), 'Schilder:', len(erg['schilder']), 'Fehler:', fehler)
    page.close()

with sync_playwright() as p:
    browser = p.chromium.launch(args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
    ids = ['wiese', 'wald', 'wueste', 'fantasie', 'dino', 'alpen'] if wahl == 'alle' else [wahl]
    for sid in ids:
        lauf(browser, sid)
    browser.close()
