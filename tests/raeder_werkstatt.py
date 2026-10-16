#!/usr/bin/env python3
"""W4 (v28): Räder auf Werkstatt-Keil/Fläche und Hang: Radmittelpunkt über Boden. python3 tests/raeder_werkstatt.py strecke [welt]"""
import sys, os, json
from playwright.sync_api import sync_playwright
basis = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
strecke = sys.argv[1]; welt = sys.argv[2] if len(sys.argv) > 2 else 'klassisch'
url = 'file://' + os.path.join(basis, 'Autorennen.html')
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
JS = '''([strecke, welt]) => { const s = Rennspiel.spiel;
  s.rennenStarten({ modus: 'solo', streckeId: strecke, welt, schaden: true, gegner: 0, runden: 3, schwierigkeit: 'mittel', autoIds: ['troc-cabrio'], fahrhilfe: ['aus'] });
  s.zeichnen = () => {}; s.pausiert = true;
  const st = s.strecke, w = s.werkstatt, f = s.fahrzeuge[0], v = f.vehicle, mesh = f.mesh;
  const pl = w && w.platz; const out = { platz: pl ? { s: pl.s, seite: pl.seite } : null, proben: [] };
  if (!pl) return out;
  const s0 = pl.s, L = s.strecke.spline.laenge || 0;
  for (let ds = -30; ds <= 48; ds += 6) for (const dq of [0, 3, 6, 9, 12, 15]) {
    const p = st.spline.punktBei(st.spline.wrapS ? st.spline.wrapS(s0 + ds) : s0 + ds), q = pl.seite * dq;
    const x = p.x + p.nx * q, z = p.z + p.nz * q, h = Math.atan2(-p.tx, -p.tz);
    v.setzen(x, z, h); v.vLaengs = 0; v.y = st.hoeheAn(x, z); f.index = -1; f.nah = st.abfrage(x, z); s._vorherAngleichen(f);
    f.anzeige.x = v.x; f.anzeige.y = v.y; f.anzeige.z = v.z; f.anzeige.heading = h; f.anzeige.nicken = 0; f.anzeige.neigung = 0;
    s.uhr.rest = 0; s._frameRumpf(performance.now() + 1);
    mesh.updateMatrixWorld(true);
    const hs = mesh.userData.raeder.map(r => { const e = r.matrixWorld.elements; return e[13] - st.hoeheAn(e[12], e[14], f.index); });
    out.proben.push({ ds, dq, gw: +(st.abseitsGewicht ? st.abseitsGewicht(f.nah) : 0).toFixed(2), nick: +mesh.rotation.x.toFixed(3), neig: +mesh.rotation.z.toFixed(3),
      hmin: +Math.min(...hs).toFixed(3), hmax: +Math.max(...hs).toFixed(3), untergrund: v.untergrund });
  }
  return out; }'''
with sync_playwright() as pw:
    b = pw.chromium.launch(args=ARGS); p = b.new_page(viewport={'width': 400, 'height': 300})
    errs = []; p.on('pageerror', lambda e: errs.append(str(e)))
    p.goto(url); p.wait_for_timeout(1000)
    r = p.evaluate(JS, [strecke, welt]); print(strecke, r['platz'], errs)
    pr = r['proben']
    print('Proben', len(pr), 'hmin', min(x['hmin'] for x in pr), 'hmax', max(x['hmax'] for x in pr), 'nickmax', max(abs(x['nick']) for x in pr), 'neigmax', max(abs(x['neig']) for x in pr))
    for x in pr:
        if x['hmin'] < 0.27 or x['hmax'] > 0.45 or abs(x['neig']) > 0.05: print(x)
    b.close()
