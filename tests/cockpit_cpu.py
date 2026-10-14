#!/usr/bin/env python3
"""CPU-Zeit je Frame (14.10. v21), robust gegen Last durch andere Prozesse: python3 tests/cockpit_cpu.py [--frames 40] [--auto passat] [--strecke wald] [--json datei]
Statt fps (hängen bei Software-GL und fremder Last stark vom Zufall ab) wird die CPU-Zeit (user+sys) ALLER Chromium-Prozesse je gerendertem Frame gemessen
(Software-GL rechnet die Grafik auf der CPU → proportional zur GPU-Arbeit: Draw-Calls, Dreiecke, Pixel). Spielschleife von Hand gepumpt (1/60 s je Frame),
nach den Frames ein Screenshot (erzwingt, dass alles fertig gezeichnet ist). Phasen im Wechsel (3 Wiederholungen), Median.
A = alles aus, B = Instrumente + Wischer (Regen), C = B + Spiegel, D (Zweispieler) = C mit Spiegel je Hälfte."""
import sys, os, json, argparse, statistics
import psutil
from playwright.sync_api import sync_playwright
ap = argparse.ArgumentParser(); ap.add_argument('--frames', type=int, default=40); ap.add_argument('--auto', default='passat'); ap.add_argument('--strecke', default='wald')
ap.add_argument('--wetter', default='regen'); ap.add_argument('--breite', type=int, default=960); ap.add_argument('--hoehe', type=int, default=600); ap.add_argument('--json', default='')
ap.add_argument('--zweispieler', action='store_true')
arg = ap.parse_args()
basis = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
url = 'file://' + os.path.join(basis, 'Autorennen.html')
SETZEN = '''([an, spiegel, wischer, zwei]) => { const c = Rennspiel.config.cockpit; c.an = an; c.spiegel.an = spiegel; c.wischer.an = wischer;
  c.spiegel.zweispieler = zwei ? 'an' : 'aus'; Rennspiel.rueckspiegel.zuruecksetzen(); }'''
PUMPEN = '''(n) => { const s = Rennspiel.spiel;
  if (!s._cpuPatch) { s._cpuPatch = true; window.requestAnimationFrame = () => 0; s._jetzt = performance.now(); s.uhr.letzte = s._jetzt; s.uhr.rest = 0; }
  for (let i = 0; i < n; i++) { s._jetzt += 1000 / 60; s.frame(s._jetzt); } return s.renderer.info.render.calls; }'''
def cpu(proc):
    t = 0.0
    for p in [proc] + proc.children(recursive=True):
        try: c = p.cpu_times(); t += c.user + c.system
        except Exception: pass
    return t
ergebnis = {}
with sync_playwright() as pw:
    b = pw.chromium.launch(args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
    me = psutil.Process()
    for modus in (['zwei'] if arg.zweispieler else ['solo', 'zwei']):
        pg = b.new_page(viewport={'width': arg.breite, 'height': arg.hoehe})
        pg.goto(url); pg.wait_for_function('window.Rennspiel && Rennspiel.spiel'); pg.wait_for_timeout(500)
        pg.evaluate("""() => Rennspiel.spiel.rennenStarten({ modus: '%s', streckeId: '%s', autoIds: ['%s','porsche-911'], runden: 3, gegner: 3, schwierigkeit: 'mittel', fahrhilfe: ['wenig','wenig'], wetter: '%s', jahreszeit: 'herbst' })""" % (modus, arg.strecke, arg.auto, arg.wetter))
        pg.evaluate("[0, 1].forEach(i => Rennspiel.spiel.autopilot(i, true))")
        pg.evaluate("() => Rennspiel.spiel.schnellvorlauf(12)")
        pg.evaluate("() => Rennspiel.spiel.kameras.forEach(k => { k.modusIndex = Rennspiel.config.kamera.modi.indexOf('cockpit'); })")
        phasen = [('A_aus', [False, False, False, False]), ('B_instr+wischer', [True, False, True, False]), ('C_+spiegel', [True, True, True, False])]
        if modus == 'zwei': phasen.append(('D_+spiegel_je_Haelfte', [True, True, True, True]))
        res = {n: [] for n, _ in phasen}
        for wdh in range(4):
            for n, cfg in phasen:
                pg.evaluate(SETZEN, cfg)
                pg.evaluate(PUMPEN, 8); pg.screenshot(type='jpeg', quality=10, timeout=300000)         # aufwärmen / leerlaufen lassen
                t0 = cpu(me) if False else None
                # Prozessbaum des Browsers: psutil kennt nur unseren Python-Prozess + Kinder (Playwright-Treiber + Chromium)
                a = cpu(me)
                pg.evaluate(PUMPEN, arg.frames); pg.screenshot(type='jpeg', quality=10, timeout=300000)
                z = cpu(me) - a
                if wdh > 0: res[n].append(z / arg.frames * 1000)       # erste Runde = Aufwärmen
        ergebnis[modus] = {}
        basis_ms = None
        for n, _ in phasen:
            m = statistics.median(res[n]); ergebnis[modus][n] = {'cpu_ms': m, 'alle': res[n]}
            if basis_ms is None: basis_ms = m
            print(f"{modus:5} {n:24} {m:7.1f} CPU-ms/Frame  ({', '.join(f'{x:.0f}' for x in res[n])})  vs. A {100 * (m / basis_ms - 1):+5.1f} %", flush=True)
        pg.close()
    b.close()
if arg.json: json.dump(ergebnis, open(arg.json, 'w'), indent=1)
