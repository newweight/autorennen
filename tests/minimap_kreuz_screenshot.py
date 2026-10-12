#!/usr/bin/env python3
"""Runde 7: Minimap-Andreaskreuz bleibt sichtbar, wenn ein Auto auf der Kreuzung steht (Fantasie).
Aufruf: python3 tests/minimap_kreuz_screenshot.py [Ausgabename] [Wurzelordner]
Setzt das Spielerauto (und ein KI-Auto knapp daneben) auf die Kreuzung, hält an und speichert den Minimap-Ausschnitt 4× vergrößert
(deviceScaleFactor 4) nach tests/out/minimap_kreuz_<Name>.png. Prüft per Pixelprobe: rot/weiß des Kreuzes liegt auch über dem Autopunkt."""
import sys, os
from playwright.sync_api import sync_playwright

name = sys.argv[1] if len(sys.argv) > 1 else 'nachher'
basis = sys.argv[2] if len(sys.argv) > 2 else os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
aus = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'tests', 'out'); os.makedirs(aus, exist_ok=True)
url = 'file://' + os.path.join(basis, 'Autorennen.html')
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']

with sync_playwright() as p:
    b = p.chromium.launch(args=ARGS)
    page = b.new_page(viewport={'width': 1280, 'height': 800}, device_scale_factor=4)
    fehler = []
    page.on('pageerror', lambda e: fehler.append(str(e)))
    page.goto(url); page.wait_for_timeout(1500)
    page.evaluate("() => Rennspiel.spiel.rennenStarten({ modus: 'solo', streckeId: 'fantasie', autoIds: ['troc-cabrio', 'multivan'], runden: 3, gegner: 3, schwierigkeit: 'mittel', fahrhilfe: ['wenig', 'wenig'] })")
    page.wait_for_timeout(800)
    info = page.evaluate("""() => { const s = Rennspiel.spiel, k = s.strecke.kreuzungen[0], sp = s.strecke.spline, a = sp.punktBei(k.sA);
      const setze = (f, x, z, h) => { f.vehicle.setzen(x, z, h); f.vehicle.vLaengs = 0; f.index = -1; };
      setze(s.fahrzeuge[0], k.x, k.z, Rennspiel.headingAus(a.tx, a.tz));          // eigenes Auto genau auf der Kreuzung
      // KI-Auto 1 daneben (6 m entlang der Strecke), damit man sieht, dass KI-Punkte weiter erkennbar sind
      const b = sp.punktBei(k.sA - 9); setze(s.fahrzeuge[1], b.x, b.z, Rennspiel.headingAus(b.tx, b.tz));
      s.pausiert = true; return { x: k.x, z: k.z }; }""")
    page.wait_for_timeout(900)
    mm = page.evaluate("""() => { const c = document.querySelector('.hud-minimap'); const r = c.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; }""")
    datei = os.path.join(aus, 'minimap_kreuz_%s.png' % name)
    page.screenshot(path=datei, clip={'x': mm['x'], 'y': mm['y'], 'width': mm['w'], 'height': mm['h']})
    # Pixelprobe am Kreuzmittelpunkt-Rand (Diagonale, 5 px vom Zentrum): rot/weiß?
    probe = page.evaluate("""() => { const c = document.querySelector('.hud-minimap'), k = Rennspiel.Minimap._cache && Object.values(Rennspiel.Minimap._cache).find(e => e.strecke === Rennspiel.spiel.strecke);
      const kr = Rennspiel.spiel.strecke.kreuzungen[0], [px, py] = k.nachPx(kr.x, kr.z), g = c.getContext('2d'), d = [];
      for (let o = -3; o <= 3; o++) { const q = g.getImageData(Math.round(px + o * 1.5), Math.round(py + o * 1.5), 1, 1).data; d.push([q[0], q[1], q[2]]); }
      return { px, py, diag: d, rotAnteil: d.filter(q => q[0] > 190 && q[1] < 90 && q[2] < 90).length }; }""")
    print(datei, probe, 'Fehler:', fehler)
    b.close()
