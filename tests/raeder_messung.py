#!/usr/bin/env python3
"""W4 (v28): Räder messen + fotografieren. Aufruf: python3 tests/raeder_messung.py [vorher|nachher]"""
import sys, os, json
from playwright.sync_api import sync_playwright
basis = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
tag = sys.argv[1] if len(sys.argv) > 1 else 'vorher'
aus = os.path.join(basis, 'tests', 'out', 'v28'); os.makedirs(aus, exist_ok=True)
url = 'file://' + os.path.join(basis, 'Autorennen.html')
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
START = '''([strecke, welt, anz]) => { const s = Rennspiel.spiel;
  s.rennenStarten({ modus: 'solo', streckeId: strecke, welt: welt, schaden: true, gegner: anz, runden: 3, schwierigkeit: 'mittel',
    autoIds: ['troc-cabrio'], fahrhilfe: ['aus'] });
  if (!s.laeuft) s.start(); return s.fahrzeuge.length; }'''
MESS = '''() => { const s = Rennspiel.spiel, T = Rennspiel.THREE || window.THREE; const out = [];
  s.fahrzeuge.forEach((f, i) => { const m = f.mesh; m.updateMatrixWorld(true);
    const ws = m.userData.raeder.map((r, k) => { r.updateWorldMatrix(true, false);
      const e = r.matrixWorld.elements; const sx = Math.hypot(e[0], e[1], e[2]), sy = Math.hypot(e[4], e[5], e[6]), sz = Math.hypot(e[8], e[9], e[10]);
      const dot = (a, b) => (e[a]*e[b] + e[a+1]*e[b+1] + e[a+2]*e[b+2]) / (Math.hypot(e[a],e[a+1],e[a+2]) * Math.hypot(e[b],e[b+1],e[b+2]) || 1);
      const px = e[12], py = e[13], pz = e[14];
      const bodenY = s.strecke.hoeheAn(px, pz, f.index);
      return { sx, sy, sz, scher: Math.max(Math.abs(dot(0,4)), Math.abs(dot(0,8)), Math.abs(dot(4,8))), nan: e.some(v => !isFinite(v)), py, bodenY, r: f.vehicle.daten && f.vehicle.daten.radius }; });
    out.push({ i, mx: m.position.x, my: m.position.y, ms: [m.scale.x, m.scale.y, m.scale.z], rot: [m.rotation.x, m.rotation.z], ws }); });
  return out; }'''
fehler = []
with sync_playwright() as pw:
    b = pw.chromium.launch(args=ARGS)
    erg = {}
    for strecke, welt in [('wiese', 'klassisch'), ('alpen', 'klassisch')]:
        p = b.new_page(viewport={'width': 1100, 'height': 700})
        p.on('pageerror', lambda e: fehler.append(str(e)))
        p.goto(url); p.wait_for_timeout(1200)
        n = p.evaluate(START, [strecke, welt, 3])
        res = []
        for k in range(6):
            p.wait_for_timeout(250)
            res.append(p.evaluate(MESS))
        erg[strecke] = res
        p.screenshot(path=os.path.join(aus, f'raeder_{tag}_{strecke}_start.png'))
        p.close()
    json.dump({'erg': erg, 'fehler': fehler}, open(os.path.join(aus, f'raeder_{tag}.json'), 'w'))
    b.close()
for st, res in erg.items():
    for k, fr in enumerate(res):
        mx = max(max(abs(w['sx']-1), abs(w['sy']-1), abs(w['sz']-1)) for a in fr for w in a['ws'])
        sch = max(w['scher'] for a in fr for w in a['ws']); nan = any(w['nan'] for a in fr for w in a['ws'])
        dy = [round(w['py']-w['bodenY'], 2) for a in fr for w in a['ws']]
        print(st, k, 'maxSkalAbw', round(mx,3), 'scher', round(sch,3), 'nan', nan, 'Radhoehe', min(dy), max(dy))
print('Fehler', fehler)
