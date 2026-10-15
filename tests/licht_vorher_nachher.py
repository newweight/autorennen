#!/usr/bin/env python3
"""v26c: Bilder Blaulicht vorher/nachher.  python3 tests/licht_vorher_nachher.py <alt|neu> [ausgabeordner]
alt = Kopie des Spiels mit dem Stand vor dem Licht-Pool (tests/sicherung_v26c_licht_alt/src), URL per ALT_URL=file:///…/Autorennen.html.
Nacht, Regen, Streifenwagen + Krankenwagen: das Spielerauto wird 13 m hinter den Streifenwagen bzw. Krankenwagen gesetzt, je 3 Bilder im Blaulicht-Takt."""
import os, sys, time
from playwright.sync_api import sync_playwright
basis = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
wer = sys.argv[1] if len(sys.argv) > 1 else 'neu'
out = sys.argv[2] if len(sys.argv) > 2 else os.path.join(basis, 'tests', 'out', 'v26c')
os.makedirs(out, exist_ok=True)
url = os.environ.get('ALT_URL') if wer == 'alt' else 'file://' + os.path.join(basis, 'Autorennen.html')
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-proxy-server']
CFG = dict(modus='solo', streckeId='wiese', autoIds=['troc-cabrio', 'multivan'], runden=3, gegner=3, schwierigkeit='mittel', fahrhilfe=['wenig', 'wenig'],
           wetter='regen', jahreszeit='sommer', tageszeit='nacht', verkehr='viel', geisterfahrer=False, schaden=False, polizei=True)
HINTER = """([art, abstand]) => { const s = Rennspiel.spiel; let z = null;
  if (art === 'polizei' && s.polizei) z = s.fahrzeuge[s.polizei.idx[0]];
  if (art === 'rtw' && s.verkehr) { const e = s.verkehr.eintraege.find(e => e.art === 'krankenwagen' && e.aktiv); if (e) { e.f.mesh.visible = true; z = e.f; } }
  if (!z) return null;
  const f = s.fahrzeuge[0], v = z.vehicle, h = v.heading;
  f.vehicle.setzen(v.x + Math.sin(h) * abstand, v.z + Math.cos(h) * abstand, h); f.vehicle.vLaengs = 0;
  return { x: v.x, z: v.z, lichter: s.lichterZaehlen(), pool: s.lichtPool ? s.lichtPool.lichter.map(l => [l.visible, +l.intensity.toFixed(1)]) : null }; }"""
with sync_playwright() as p:
    b = p.chromium.launch(args=ARGS)
    pg = b.new_context(viewport={'width': 960, 'height': 540}).new_page()
    fehler = []; pg.on('pageerror', lambda e: fehler.append(str(e)))
    pg.goto(url); pg.wait_for_timeout(1500)
    pg.evaluate("(c) => { Rennspiel.spiel.rennenStarten(c); Rennspiel.spiel.autopilot(0); }", CFG)
    pg.wait_for_function("Rennspiel.spiel.rennen.zustand !== 'countdown'", timeout=120000, polling=200)
    for art in ('polizei', 'rtw'):
        for i in range(3):
            if art == 'rtw':
                try: pg.wait_for_function("Rennspiel.spiel.verkehr.eintraege.some(e => e.art === 'krankenwagen' && e.aktiv)", timeout=60000, polling=300)
                except Exception: print('kein aktiver Krankenwagen'); break
            r = pg.evaluate(HINTER, [art, 13])
            pg.wait_for_timeout(180 + 110 * i)
            pg.screenshot(path=os.path.join(out, '%s_%s_%d.png' % (wer, art, i + 1)))
            print(wer, art, i + 1, r and r['lichter'], r and r['pool'], flush=True)
    print('Fehler:', fehler)
    b.close()
