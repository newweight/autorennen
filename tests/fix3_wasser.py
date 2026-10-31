#!/usr/bin/env python3
"""FIX3 Wasser/Schlamm/Kisten sichtbar? python3 tests/fix3_wasser.py <vorher|nachher> [strecke ...]
Prüft je Motorrad-Strecke (Standard-Einstellungen, Schalter „Spaß-Elemente“ unverändert), ob Wasser/Schlamm/Kisten geplant sind; Bilder (Verfolger + Cockpit) vor dem Feld und im Feld
nach tests/bilder_fix3/<tag>_wasser_<strecke>_<art>_<ansicht>_<vor|im>.png; Ergebnis JSON tests/bilder_fix3/wasser_<tag>.json"""
import os, sys, json, base64
from playwright.sync_api import sync_playwright
BASIS = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.environ.get('BILD_ORDNER') or os.path.join(BASIS, 'tests', 'bilder_fix3'); os.makedirs(OUT, exist_ok=True)
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
TAG = sys.argv[1] if len(sys.argv) > 1 else 'vorher'
BILDSTRECKEN = [a for a in sys.argv[2:]] or ['wiese', 'alpen', 'wald']
fehler = []
with sync_playwright() as p:
    b = p.chromium.launch(args=ARGS); pg = b.new_context(viewport={'width': 960, 'height': 540}).new_page()
    pg.on('pageerror', lambda e: fehler.append('pageerror: ' + str(e)))
    pg.on('console', lambda m: fehler.append('console.error: ' + m.text) if m.type == 'error' and 'GPU stall' not in m.text and 'WebGL' not in m.text and 'favicon' not in m.text else None)
    pg.goto('file://' + os.path.join(BASIS, 'Motorrad.html'), timeout=120000); pg.wait_for_function('window.Rennspiel && Rennspiel.spiel', timeout=120000); pg.wait_for_timeout(1000)
    # 1) Plan je Strecke (Standard-Einstellungen)
    plan = pg.evaluate("""() => { const R = Rennspiel, s = R.spiel, out = {}; for (const t of R.trackCatalog) { try { s.streckeSzeneBauen(t.id); const st = s.strecke, d = st.spass && st.spass.s8;
      out[t.id] = d ? { laenge: Math.round(st.spline.laenge), felder: d.felder.map((f) => f.art + '@' + Math.round(f.s0) + '+' + Math.round(f.laenge) + ' q' + f.q0 + '..' + f.q1), kisten: d.kisten.length } : null; } catch (e) { out[t.id] = 'FEHLER ' + e.message; } } return out; }""")
    for k, v in plan.items(): print('Plan', k, v)
    json.dump(plan, open(f'{OUT}/wasser_{TAG}.json', 'w'), ensure_ascii=False, indent=1)
    # 2) Bilder
    for sid in BILDSTRECKEN:
        pg.evaluate("""([st]) => { const R = Rennspiel, s = R.spiel; window.__t = 1000; performance.now = () => window.__t; s.uhr.letzte = 1000;
          s.rennenStarten({ modus: 'solo', streckeId: st, autoIds: ['crossmaschine', 'crossmaschine-rot'], runden: 2, gegner: 1, schwierigkeit: 'mittel', fahrhilfe: ['wenig', 'wenig'], tageszeit: 'tag', wetter: 'klar', spass: true });
          window.requestAnimationFrame = () => 0; }""", [sid])
        pg.wait_for_timeout(500)
        pg.evaluate("""() => { const s = Rennspiel.spiel, z0 = s.zeichnen; s.zeichnen = function () {}; let g = 0; window.__t = 5000; s.uhr.letzte = window.__t; s.uhr.rest = 0;
          while ((s.zustand !== 'rennen' || !s.rennen.gasErlaubt) && g++ < 1500) { window.__t += 1000 / 60; s._frameRumpf(window.__t); } s.zeichnen = z0; }""")
        plan1 = pg.evaluate("() => { const d = Rennspiel.spiel.strecke.spass && Rennspiel.spiel.strecke.spass.s8; return d ? { felder: d.felder } : null; }")
        if not plan1 or not plan1['felder']: print('keine Felder auf', sid); continue
        for fd in plan1['felder'][:2]:
            for modus in ('verfolger', 'cockpit'):
                for tag2, off, frames in (('vor', -48, 40), ('im', 8, 25)):
                    d = pg.evaluate("""([sB, q, modus, frames]) => { const R = Rennspiel, s = R.spiel, z0 = s.zeichnen, st = s.strecke, f = s.fahrzeuge[0], v = f.vehicle; s.zeichnen = function () {};
                      const pt = st.spline.punktBei(sB), x = pt.x + pt.nx * q, zz = pt.z + pt.nz * q; v.setzen(x, zz, R.headingAus(pt.tx, pt.tz)); v.y = st.hoeheAn(x, zz); f.index = -1; v.vLaengs = 16;
                      s.kameras.forEach((k) => { k.modusIndex = R.config.kamera.modi.indexOf(modus); k._erstesMal = true; }); s.autopilot(0, true); s.pausiert = false;
                      for (let i = 0; i < frames; i++) { window.__t += 1000 / 60; s._frameRumpf(window.__t); }
                      s.zeichnen = z0; document.getElementById('ui').style.display = 'none'; for (let i = 0; i < 3; i++) s.zeichnen(); return s.renderer.domElement.toDataURL('image/png'); }""",
                        [float(fd['s0']) + off, (fd['q0'] + fd['q1']) / 2, modus, frames])
                    open(f"{OUT}/{TAG}_wasser_{sid}_{fd['art']}_{modus}_{tag2}.png", 'wb').write(base64.b64decode(d.split(',')[1]))
            print('Bilder', sid, fd['art'], flush=True)
    print('Konsolenfehler:', fehler[:5])
    b.close()
