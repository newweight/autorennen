#!/usr/bin/env python3
"""W4 (v28): Räder in jedem gezeichneten Bild messen (Start, Losfahren, Werkstatt-Zufahrt). python3 tests/raeder_lauf.py strecke welt [sekunden]"""
import sys, os, json
from playwright.sync_api import sync_playwright
basis = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
strecke = sys.argv[1] if len(sys.argv) > 1 else 'wiese'; welt = sys.argv[2] if len(sys.argv) > 2 else 'klassisch'; sek = float(sys.argv[3]) if len(sys.argv) > 3 else 9
url = 'file://' + os.path.join(basis, 'Autorennen.html')
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
START = '''([strecke, welt]) => { const s = Rennspiel.spiel;
  s.rennenStarten({ modus: 'solo', streckeId: strecke, welt: welt, schaden: true, gegner: 3, runden: 3, schwierigkeit: 'mittel', autoIds: ['troc-cabrio'], fahrhilfe: ['aus'] });
  if (!s.laeuft) s.start();
  window.__w = { n: 0, skal: 0, scher: 0, nan: 0, hmin: 9, hmax: -9, hmaxPro: [], nanInfo: null, nick: 0, neig: 0, rotMax: 0 };
  const z0 = () => {};
  s.zeichnen = function () { z0(); const W = window.__w; W.n++;
    s.fahrzeuge.forEach((f, i) => { const m = f.mesh; m.updateMatrixWorld(true);
      W.nick = Math.max(W.nick, Math.abs(m.rotation.x)); W.neig = Math.max(W.neig, Math.abs(m.rotation.z));
      m.userData.raeder.forEach((r, k) => { const e = r.matrixWorld.elements;
        if (e.some(v => !isFinite(v))) { W.nan++; W.nanInfo = { i, k, n: W.n, rx: r.rotation.x, lenk: f.vehicle.lenkung, vl: f.vehicle.vLaengs, rw: f.radwinkel }; return; }
        const sx = Math.hypot(e[0], e[1], e[2]), sy = Math.hypot(e[4], e[5], e[6]), sz = Math.hypot(e[8], e[9], e[10]);
        W.skal = Math.max(W.skal, Math.abs(sx-1), Math.abs(sy-1), Math.abs(sz-1));
        const d = (a, b) => Math.abs((e[a]*e[b] + e[a+1]*e[b+1] + e[a+2]*e[b+2]) / (sx*sy*sz/Math.max(1e-9, [sx,sy,sz][[0,4,8].indexOf(a)]) ));
        const dot = (a, b) => Math.abs(e[a]*e[b] + e[a+1]*e[b+1] + e[a+2]*e[b+2]);
        W.scher = Math.max(W.scher, dot(0,4), dot(0,8), dot(4,8));
        const h = e[13] - s.strecke.hoeheAn(e[12], e[14], f.index); W.hmin = Math.min(W.hmin, h); W.hmax = Math.max(W.hmax, h); }); }); };
  return true; }'''
with sync_playwright() as pw:
    b = pw.chromium.launch(args=ARGS); p = b.new_page(viewport={'width': 640, 'height': 400})
    errs = []; p.on('pageerror', lambda e: errs.append(str(e)))
    p.goto(url); p.wait_for_timeout(1200); p.evaluate(START, [strecke, welt])
    p.evaluate('() => { const s = Rennspiel.spiel; s.uhr.letzte = performance.now(); }')
    p.evaluate('''(sek) => { const s = Rennspiel.spiel; s.laeuft = false; let t = performance.now();
      for (let k = 0; k < sek * 60; k++) { t += 1000 / 60; s._frameRumpf(t); } }''', sek)
    print(strecke, welt, json.dumps(p.evaluate('() => window.__w')), errs); b.close()
