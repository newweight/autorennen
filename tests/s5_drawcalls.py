#!/usr/bin/env python3
"""S5 Draw-Call-Vergleich (Normal): python3 tests/s5_drawcalls.py [--moto|--auto]
Je Strecke 5 feste Stellen (5/25/45/65/85 % der Länge, Verfolger-Kamera, Fahrzeug fährt kurz), renderer.info.render.calls und Dreiecke; Spaß an (Standard), Dino-Begleiter und
Regenbogenspur wie im Spiel-Standard. Ausgabe: je Strecke Mittel und Höchstwert, dazu das Urteil „neue Strecken nicht teurer als die teuerste bestehende“."""
import os, sys, json
from playwright.sync_api import sync_playwright
BASIS = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
SEED = "(() => { let a = 123456789; Math.random = () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; })();"
ALT = ['wiese', 'wald', 'wueste', 'fantasie', 'dino', 'alpen', 'formel1', 'mega']
NEU = ['mond', 'unterwasser', 'regenbogenland']
REF = {'Autorennen': (131.0, 144), 'Motorrad': (179.6, 278)}     # teuerste bestehende Strecke (Mittel, Höchstwert) aus tests/bilder_s5/drawcalls.json
if '--neu' in sys.argv: ALT = []     # nur die neuen Strecken messen (Vergleich mit den bekannten Werten der alten, siehe tests/bilder_s5/drawcalls.json)
SPIELE = [s for s, f in (('Autorennen', '--auto'), ('Motorrad', '--moto')) if not (('--auto' in sys.argv or '--moto' in sys.argv) and f not in sys.argv)]
erg = {}
with sync_playwright() as p:
    for spiel in SPIELE:
        moto = spiel == 'Motorrad'
        for sid in ALT + NEU:
            b = p.chromium.launch(args=ARGS); ctx = b.new_context(viewport={'width': 960, 'height': 540}); ctx.add_init_script(SEED)
            pg = ctx.new_page(); fehler = []
            pg.on('pageerror', lambda e: fehler.append(str(e)))
            pg.goto('file://' + os.path.join(BASIS, spiel + '.html')); pg.wait_for_function('window.Rennspiel && Rennspiel.spiel'); pg.wait_for_timeout(1000)
            autos = ['crossmaschine', 'crossmaschine-rot'] if moto else ['porsche-911', 'multivan']
            ok = pg.evaluate("""([a, st]) => { if (!Rennspiel.trackCatalog.find(t => t.id === st)) return false; window.__t = 1000; performance.now = () => window.__t; Rennspiel.spiel.uhr.letzte = window.__t;
              Rennspiel.spiel.rennenStarten({ modus: 'solo', streckeId: st, autoIds: a, runden: 2, gegner: 3, schwierigkeit: 'mittel', fahrhilfe: ['wenig', 'wenig'], tageszeit: 'tag', wetter: 'klar' });
              window.requestAnimationFrame = () => 0; return true; }""", [autos, sid])
            if not ok: b.close(); continue
            pg.wait_for_timeout(500)
            pg.evaluate("""() => { const s = Rennspiel.spiel, z0 = s.zeichnen; s.zeichnen = function () {}; let g = 0; window.__t = 5000; s.uhr.letzte = window.__t; s.uhr.rest = 0;
              while ((s.zustand !== 'rennen' || !s.rennen.gasErlaubt) && g++ < 1200) { window.__t += 1000 / 60; s._frameRumpf(window.__t); } s.zeichnen = z0; }""")
            werte = []
            for f in (0.05, 0.25, 0.45, 0.65, 0.85):
                d = pg.evaluate("""(f) => { const s = Rennspiel.spiel, st = s.strecke, fz = s.fahrzeuge[0], v = fz.vehicle, z0 = s.zeichnen, sp = st.spline, s_ = sp.laenge * f;
                  const pt = sp.punktBei(s_), hd = Rennspiel.headingAus(pt.tx, pt.tz); v.setzen(pt.x, pt.z, hd); v.y = st.hoeheAn(pt.x, pt.z); fz.index = -1; v.vLaengs = 28;
                  if (s.rennen && s.rennen.verfolgungSetzen) s.rennen.verfolgungSetzen(0, pt.x, pt.z);
                  s.autopilot(0, true); s.pausiert = false; s.zeichnen = function () {};
                  for (let i = 0; i < 150; i++) { window.__t += 1000 / 60; s._frameRumpf(window.__t); } s.zeichnen = z0; document.getElementById('ui').style.display = 'none';
                  for (let i = 0; i < 6; i++) s.zeichnen(); return { c: s.renderer.info.render.calls, t: s.renderer.info.render.triangles }; }""", f)
                werte.append(d['c'])
            erg[spiel + ' ' + sid] = {'mittel': round(sum(werte) / len(werte), 1), 'max': max(werte), 'werte': werte, 'fehler': fehler[:2]}
            print(spiel, sid, erg[spiel + ' ' + sid], flush=True)
            b.close()
    for spiel in SPIELE:
        a, am = REF[spiel][::-1] if not ALT else (max(erg[spiel + ' ' + s]['max'] for s in ALT if spiel + ' ' + s in erg), max(erg[spiel + ' ' + s]['mittel'] for s in ALT if spiel + ' ' + s in erg))
        n = {s: (erg[spiel + ' ' + s]['mittel'], erg[spiel + ' ' + s]['max']) for s in NEU if spiel + ' ' + s in erg}
        print(f'{spiel}: teuerste bestehende Strecke: Mittel {am}, Höchstwert {a}; neue (Mittel, Höchstwert): {n}')
        print(('OK   ' if all(v[0] <= am + 0.5 for v in n.values()) else 'FEHL ') + f'{spiel}: neue Strecken im Mittel nicht teurer als die teuerste bestehende')
_o = os.path.join(BASIS, 'tests', 'bilder_s5_fix' if '--neu' in sys.argv else 'bilder_s5'); os.makedirs(_o, exist_ok=True)
json.dump(erg, open(os.path.join(_o, 'drawcalls.json'), 'w'), indent=1)
