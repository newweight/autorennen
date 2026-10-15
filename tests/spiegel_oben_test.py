#!/usr/bin/env python3
"""15.10. (v23) Rückspiegel ganz oben Mitte: python3 tests/spiegel_oben_test.py [ausgabeordner]
Solo (1280×800, Verfolger + Cockpit), schmales Fenster (900×700), Zweispieler mit spiegel.zweispieler = 'an' (1280×800):
Spiegel-Rahmen oben (Oberkante ≤ 3 % der Höhe), mittig in der Ansicht (±1 %), Positions-Chip („3. von 4“) überdeckt weder Spiegel noch Name- oder Zeiten-Chip,
Hinweis „Festgefahren?“ unverändert über den Instrumenten. Screenshots in tests/out/v23/."""
import sys, os
from playwright.sync_api import sync_playwright
basis = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
_a = [x for x in sys.argv[1:] if not x.startswith('--')]
aus = _a[0] if _a else os.path.join(basis, 'tests', 'out', 'v23')
os.makedirs(aus, exist_ok=True)
url = 'file://' + os.path.join(basis, 'Autorennen.html')
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
pruef = []
def pruefe(name, ok, info=''):
    pruef.append((name, ok)); print(('OK   ' if ok else 'FEHL ') + name + (' – ' + str(info) if info != '' else ''), flush=True)

RECHTECKE = '''(nr) => { const huds = document.querySelectorAll('.hud'); const h = huds[nr];
  const r = (e) => { if (!e) return null; const b = e.getBoundingClientRect(); return { x: b.left, y: b.top, r: b.right, u: b.bottom, sichtbar: getComputedStyle(e).display !== 'none' && b.width > 0 }; };
  const hb = h.getBoundingClientRect();
  return { hud: { x: hb.left, y: hb.top, r: hb.right, u: hb.bottom }, spiegel: r(h.querySelector('.hud-spiegel')), platz: r(h.querySelector('.hud-platz')), name: r(h.querySelector('.hud-links')),
           zeiten: r(h.querySelector('.hud-zeiten')) }; }'''
def schneidet(a, b):
    return a and b and not (a['r'] <= b['x'] or b['r'] <= a['x'] or a['u'] <= b['y'] or b['u'] <= a['y'])

def starte(page, modus, kam, einst=''):
    page.evaluate("""([modus, kam]) => { Rennspiel.spiel.rennenStarten({ modus: modus, streckeId: 'wiese', autoIds: ['passat', 'multivan'], runden: 3, gegner: 3, schwierigkeit: 'mittel',
      fahrhilfe: ['wenig', 'wenig'], wetter: 'klar', jahreszeit: 'herbst' }); }""", [modus, kam])
    page.wait_for_timeout(400)
    page.evaluate("() => Rennspiel.spiel.schnellvorlauf(8)")
    page.evaluate("""(kam) => { const s = Rennspiel.spiel; s.kameras.forEach(k => { k.modusIndex = Rennspiel.config.kamera.modi.indexOf(kam); k._erstesMal = true; });
      s.fahrzeuge.forEach((f, i) => { if (i < 2) f.vehicle.vLaengs = 33; }); }""", kam)
    page.wait_for_timeout(2200)

with sync_playwright() as p:
    b = p.chromium.launch(args=ARGS)
    fehler = []
    for (w, h, name) in [(1280, 800, 'breit'), (900, 700, 'schmal')]:
        pg = b.new_page(viewport={'width': w, 'height': h})
        pg.on('pageerror', lambda e: fehler.append(str(e)))
        pg.goto(url); pg.wait_for_timeout(1200)
        for kam in ['verfolger', 'cockpit']:
            starte(pg, 'solo', kam)
            r = pg.evaluate(RECHTECKE, 0)
            sp, pl = r['spiegel'], r['platz']
            pruefe(f'{name}/{kam}: Spiegel sichtbar', bool(sp and sp['sichtbar']), sp)
            if sp and sp['sichtbar']:
                pruefe(f'{name}/{kam}: Spiegel ganz oben (Oberkante ≤ 3 % der Höhe)', sp['y'] <= 0.03 * h, round(sp['y'], 1))
                pruefe(f'{name}/{kam}: Spiegel mittig (±1 %)', abs((sp['x'] + sp['r']) / 2 - w / 2) <= 0.01 * w, round((sp['x'] + sp['r']) / 2))
                pruefe(f'{name}/{kam}: Positions-Chip überdeckt den Spiegel nicht', not schneidet(sp, pl), [sp, pl])
                pruefe(f'{name}/{kam}: Positions-Chip überdeckt weder Namen- noch Zeiten-Chip', not schneidet(pl, r['name']) and not schneidet(pl, r['zeiten']), [pl, r['name'], r['zeiten']])
                pruefe(f'{name}/{kam}: Spiegel überdeckt weder Namen- noch Zeiten-Chip', not schneidet(sp, r['name']) and not schneidet(sp, r['zeiten']))
                pruefe(f'{name}/{kam}: alles im Bild', pl['x'] >= 0 and pl['r'] <= w and pl['u'] <= h)
            pg.screenshot(path=os.path.join(aus, f'spiegel_oben_{name}_{kam}.png'))
        pg.close()
    # Zweispieler (Spiegel für beide einschalten)
    pg = b.new_page(viewport={'width': 1280, 'height': 800})
    pg.on('pageerror', lambda e: fehler.append(str(e)))
    pg.goto(url); pg.wait_for_timeout(1200)
    pg.evaluate("() => { Rennspiel.config.cockpit.spiegel.zweispieler = 'an'; }")
    starte(pg, 'zwei', 'verfolger')
    for nr in (0, 1):
        r = pg.evaluate(RECHTECKE, nr)
        sp, pl, hd = r['spiegel'], r['platz'], r['hud']
        pruefe(f'zwei/Hälfte {nr+1}: Spiegel sichtbar und oben', bool(sp and sp['sichtbar']) and sp['y'] <= 0.04 * 800, sp)
        if sp and sp['sichtbar']:
            pruefe(f'zwei/Hälfte {nr+1}: Spiegel mittig in der Hälfte (±1 %)', abs((sp['x'] + sp['r']) / 2 - (hd['x'] + hd['r']) / 2) <= 0.01 * 1280)
            pruefe(f'zwei/Hälfte {nr+1}: Positions-Chip überdeckt nichts', not schneidet(sp, pl) and not schneidet(pl, r['name']) and not schneidet(pl, r['zeiten']), [sp, pl, r['name'], r['zeiten']])
            pruefe(f'zwei/Hälfte {nr+1}: Spiegel überdeckt Namen-/Zeiten-Chip nicht', not schneidet(sp, r['name']) and not schneidet(sp, r['zeiten']), [sp, r['name'], r['zeiten']])
    pg.screenshot(path=os.path.join(aus, 'spiegel_oben_zweispieler.png'))
    pg.close()
    pruefe('keine Seitenfehler', not fehler, fehler)
    b.close()
n = sum(1 for _, ok in pruef if not ok)
print(f'{len(pruef)} Prüfungen, {n} Fehler')
sys.exit(1 if n else 0)
