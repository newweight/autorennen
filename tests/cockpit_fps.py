#!/usr/bin/env python3
"""Leistung Cockpit/Spiegel/Wischer (14.10. v21): python3 tests/cockpit_fps.py [--frames 60] [--json datei]
Misst die echten Bilder pro Sekunde der laufenden Spielschleife (rAF-Zähler, je Phase --ms ms; Software-GL = absolute Werte nur relativ lesbar) für Einzel und Zweispieler,
Regen, Kamera Cockpit, 1280x800: A = alles aus (alter Stand: cockpit.an/spiegel.an/wischer.an = false), B = Instrumente + Wischer, C = B + Spiegel,
D (nur Zweispieler) = C mit Spiegel je Hälfte. Je Phase 3 Wiederholungen im Wechsel, Median."""
import sys, os, json, argparse, statistics
from playwright.sync_api import sync_playwright
ap = argparse.ArgumentParser(); ap.add_argument('--ms', type=int, default=5000); ap.add_argument('--json', default=''); ap.add_argument('--auto', default='passat')
ap.add_argument('--wetter', default='regen'); ap.add_argument('--breite', type=int, default=640); ap.add_argument('--hoehe', type=int, default=400)
arg = ap.parse_args()
basis = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
url = 'file://' + os.path.join(basis, 'Autorennen.html')
SETZEN = '''([an, spiegel, wischer, zwei]) => { const c = Rennspiel.config.cockpit; c.an = an; c.spiegel.an = spiegel; c.wischer.an = wischer;
  c.spiegel.zweispieler = zwei ? 'an' : 'aus'; if (Rennspiel.rueckspiegel.zuruecksetzen) Rennspiel.rueckspiegel.zuruecksetzen(); }'''
MESSEN = '''async (ms) => { const s = Rennspiel.spiel;
  return new Promise((res) => { let n = 0, bis = 0; const t0 = performance.now();
    const f = () => { n++; const t = performance.now(); if (t - t0 < ms) requestAnimationFrame(f); else res({ fps: n / ((t - t0) / 1000), frame: (t - t0) / n, dc: s.renderer.info.render.calls }); };
    requestAnimationFrame(f); }); }'''
PROXY = '''(zwei) => { const s = Rennspiel.spiel, r = s.renderer, c = Rennspiel.config.cockpit; const erg = {};
  const messen = (sp) => { c.spiegel.an = sp; c.spiegel.zweispieler = zwei ? 'an' : 'aus'; Rennspiel.rueckspiegel.zuruecksetzen(); const l = [];
    for (let i = 0; i < 4; i++) { s.zeichnen(); l.push([r.info.render.calls, r.info.render.triangles]); } return l; };
  erg.ohne = messen(false); erg.mit = messen(true); c.spiegel.an = true; return erg; }'''
ergebnis = {}
with sync_playwright() as p:
    b = p.chromium.launch(args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
    for modus in ('solo', 'zwei'):
        pg = b.new_page(viewport={'width': arg.breite, 'height': arg.hoehe})
        fehler = []; pg.on('pageerror', lambda e: fehler.append(str(e)))
        pg.goto(url); pg.wait_for_function('window.Rennspiel && Rennspiel.spiel'); pg.wait_for_timeout(500)
        pg.evaluate("""() => Rennspiel.spiel.rennenStarten({ modus: '%s', streckeId: 'wald', autoIds: ['%s','porsche-911'], runden: 3, gegner: 3, schwierigkeit: 'mittel', fahrhilfe: ['wenig','wenig'], wetter: '%s', jahreszeit: 'herbst' })""" % (modus, arg.auto, arg.wetter))
        pg.evaluate("[0, 1].forEach(i => Rennspiel.spiel.autopilot(i, true))")
        pg.evaluate("() => Rennspiel.spiel.schnellvorlauf(12)")
        pg.evaluate("() => Rennspiel.spiel.debugEl && Rennspiel.spiel.debugEl.classList.remove('an')")
        pg.evaluate("() => Rennspiel.spiel.kameras.forEach(k => { k.modusIndex = Rennspiel.config.kamera.modi.indexOf('cockpit'); })")
        for zw in ([False, True] if modus == 'zwei' else [False]):
            pr = pg.evaluate(PROXY, zw)
            ohne = pr['ohne'][-1]; mit = pr['mit']
            print(f"{modus:5} Spiegel-Kosten{' (je Hälfte)' if zw else ''}: Bild ohne Spiegel {ohne[0]} Draw-Calls / {ohne[1]} Dreiecke; Bilder mit Spiegel (Takt 2): "
                  + ' | '.join(f'{m[0]} DC / {m[1]} Dr' for m in mit) + f"  → Mittel +{(sum(m[0] for m in mit) / len(mit)) / ohne[0] * 100 - 100:.0f} % Draw-Calls, +{(sum(m[1] for m in mit) / len(mit)) / max(1, ohne[1]) * 100 - 100:.0f} % Dreiecke", flush=True)
        phasen = [('A_aus', [False, False, False, False]), ('B_instr+wischer', [True, False, True, False]), ('C_+spiegel', [True, True, True, False])]
        if modus == 'zwei': phasen.append(('D_+spiegel_je_Haelfte', [True, True, True, True]))
        res = {n: [] for n, _ in phasen}
        for wdh in range(3):
            for n, cfg in phasen:
                pg.evaluate(SETZEN, cfg)
                pg.wait_for_timeout(300)
                res[n].append(pg.evaluate(MESSEN, arg.ms))
        ergebnis[modus] = {}
        basis_ms = None
        for n, _ in phasen:
            m = {k: statistics.median([r[k] for r in res[n]]) for k in ('fps', 'frame', 'dc')}
            ergebnis[modus][n] = m
            if basis_ms is None: basis_ms = m['fps']
            print(f"{modus:5} {n:24} {m['fps']:6.2f} fps  ({m['frame']:7.1f} ms/Frame)  drawcalls {int(m['dc']):3}  vs. A {100 * (m['fps'] / basis_ms - 1):+5.1f} % fps", flush=True)
        if fehler: print('JS-Fehler:', fehler)
        pg.close()
    b.close()
if arg.json: json.dump(ergebnis, open(arg.json, 'w'), indent=1)
