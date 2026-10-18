#!/usr/bin/env python3
"""v31 H2: Spiegel-Kosten Zweispieler (robust gegen Rauschen: abwechselnd ohne/mit Spiegel, je N zeichnen()-Aufrufe, Minimum der Wiederholungen).
python3 tests/zwei_spiegel_kosten.py [takt]   (setzt zweiTakt vorübergehend)"""
import os, sys
from playwright.sync_api import sync_playwright
basis = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
url = 'file://' + os.path.join(basis, 'Autorennen.html')
takt = int(sys.argv[1]) if len(sys.argv) > 1 else None
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
JS = """([takt, n, rep]) => { const s = Rennspiel.spiel, c = Rennspiel.config.cockpit, r = s.renderer; if (takt) c.spiegel.zweiTakt = takt;
  const t = (an) => { c.spiegel.an = an; Rennspiel.rueckspiegel.zuruecksetzen(); s.zeichnen(); s.zeichnen(); const t0 = performance.now(); let tri = 0;
    for (let i = 0; i < n; i++) { s.zeichnen(); r.getContext().finish(); tri += r.info.render.triangles; } return [(performance.now() - t0) / n, tri / n]; };
  const o = [], m = []; for (let k = 0; k < rep; k++) { o.push(t(false)); m.push(t(true)); } c.spiegel.an = true;
  const mn = (a, j) => Math.min(...a.map(x => x[j])); return { ohne: mn(o, 0), mit: mn(m, 0), triOhne: mn(o, 1), triMit: mn(m, 1) }; }"""
with sync_playwright() as p:
    b = p.chromium.launch(args=ARGS)
    pg = b.new_page(viewport={'width': 960, 'height': 540})
    pg.goto(url); pg.wait_for_function('window.Rennspiel && Rennspiel.spiel'); pg.wait_for_timeout(800)
    pg.evaluate("""() => Rennspiel.spiel.rennenStarten({ modus: 'zwei', streckeId: 'wald', autoIds: ['passat','porsche-911'], runden: 3, gegner: 3, schwierigkeit: 'mittel', fahrhilfe: ['wenig','wenig'], wetter: 'sonne', jahreszeit: 'herbst' })""")
    pg.evaluate("() => Rennspiel.spiel.schnellvorlauf(10)")
    pg.evaluate("() => Rennspiel.spiel.kameras.forEach(k => { k.modusIndex = Rennspiel.config.kamera.modi.indexOf('cockpit'); })")
    r = pg.evaluate(JS, [takt, 24, 4])
    print(f"Zweispieler Takt {takt or 'config'}: ohne {r['ohne']:.0f} ms/Bild, mit Spiegel {r['mit']:.0f} ms/Bild -> {100*(r['mit']/r['ohne']-1):+.1f} % Zeit; Dreiecke {r['triOhne']:.0f} -> {r['triMit']:.0f} ({100*(r['triMit']/r['triOhne']-1):+.1f} %)")
    b.close()
