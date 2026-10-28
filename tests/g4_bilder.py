#!/usr/bin/env python3
"""Grafik G4 – Bilder + ms/Bild (Playwright, SwiftShader, Seitenfoto inkl. Overlay). Aufruf: python3 tests/g4_bilder.py [spiel auto|moto] [stufen schoen,ultra]
Fälle: regen (Verfolger), regen_cockpit, tempo, funken, puff, feuer (Motorrad: Feuerring im Stunt-Park; Auto: brennendes Wrack auf 'wiese'). → tests/bilder_g4/"""
import os, sys, time, socket, subprocess, json
from playwright.sync_api import sync_playwright
basis = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
out = os.path.join(basis, 'tests', 'bilder_g4'); os.makedirs(out, exist_ok=True)
spiele = [sys.argv[1]] if len(sys.argv) > 1 else ['auto', 'moto']
stufen = sys.argv[2].split(',') if len(sys.argv) > 2 else ['schoen', 'ultra']
s = socket.socket(); s.bind(('127.0.0.1', 0)); port = s.getsockname()[1]; s.close()
srv = subprocess.Popen([sys.executable, '-m', 'http.server', str(port), '--bind', '127.0.0.1'], cwd=basis, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL); time.sleep(1)
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
SEED = "(() => { let a = 123456789; Math.random = () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; })();"
FRAME = "(n) => { const s = Rennspiel.spiel; for (let i = 0; i < n; i++) { window.__t += 1000 / 60; s._frameRumpf(window.__t); } }"
KAM = """([a, dist, hh, seite]) => { const s = Rennspiel.spiel, f = s.fahrzeuge[0].mesh, k = s.kameras[0].kamera, p = new THREE.Vector3(); f.getWorldPosition(p); const h = s.fahrzeuge[0].vehicle.heading;
  k.position.set(p.x + Math.sin(h + a) * dist, p.y + hh, p.z + Math.cos(h + a) * dist); k.lookAt(p.x - Math.sin(h) * (seite || 0), p.y + 0.8, p.z - Math.cos(h) * (seite || 0)); k.updateMatrixWorld(true); }"""
KAM2 = """([a]) => { const s = Rennspiel.spiel, st = s._g4, o = st.ringe[0], k = s.kameras[0].kamera, p = new THREE.Vector3(); o.getWorldPosition(p); const d = new THREE.Vector3(0, 0, 1).transformDirection(o.matrixWorld);
  k.position.set(p.x - d.x * 9 + d.z * 3, p.y + 0.3, p.z - d.z * 9 - d.x * 3); k.lookAt(p.x, p.y + 0.3, p.z); k.updateMatrixWorld(true); }"""
res = []
try:
    with sync_playwright() as p:
        b = p.chromium.launch(args=ARGS)
        for spiel in spiele:
            moto = spiel == 'moto'
            for stufe in stufen:
                for fall in os.environ.get('FAELLE', 'regen,regen_cockpit,tempo,funken,puff,feuer').split(','):
                    if fall == 'regen_cockpit' and not moto and False: continue
                    if os.environ.get('NUR_FEHLENDE') and os.path.exists(os.path.join(out, f'{spiel}_{stufe}_{fall}.png')): continue
                    ctx = b.new_context(viewport={'width': 960, 'height': 540}); ctx.add_init_script(SEED)
                    pg = ctx.new_page(); fehler = []
                    pg.on('pageerror', lambda e: fehler.append(str(e)))
                    pg.on('console', lambda m: fehler.append('console:' + m.text) if m.type in ('error', 'warning') and 'GPU stall' not in m.text and 'swiftshader' not in m.text.lower() else None)
                    pg.goto(f'http://127.0.0.1:{port}/{"Motorrad" if moto else "Autorennen"}.html'); pg.wait_for_timeout(1200)
                    pg.evaluate('(s) => Rennspiel.Grafik.setzen(s)', stufe); pg.evaluate(SEED)
                    autos = ['crossmaschine', 'crossmaschine-rot'] if moto else ['porsche-911', 'multivan']
                    strecke = 'wiese'; park = moto and fall == 'feuer'
                    wetter = 'regen' if fall.startswith('regen') else 'sonne'
                    pg.evaluate("""([a, st, w, park]) => { window.__t = 1000; performance.now = () => window.__t; Rennspiel.spiel.uhr.letzte = window.__t;
                      Rennspiel.spiel.rennenStarten({ modus: 'solo', streckeId: st, autoIds: a, runden: 1, gegner: park ? 0 : 3, schwierigkeit: 'mittel', fahrhilfe: ['wenig', 'wenig'], tageszeit: 'tag', wetter: w, stuntpark: park });
                      window.requestAnimationFrame = () => 0; }""", [autos, strecke, wetter, park])
                    pg.wait_for_timeout(700)
                    pg.evaluate("""() => { const s = Rennspiel.spiel, z0 = s.zeichnen; s.zeichnen = function () {}; let g = 0; window.__t = 5000; s.uhr.letzte = window.__t; s.uhr.rest = 0;
                      while ((s.zustand !== 'rennen' || !s.rennen.gasErlaubt) && g++ < 900) { window.__t += 1000 / 60; s._frameRumpf(window.__t); }
                      s.zeichnen = z0; document.getElementById('ui').style.display = 'none'; }""")
                    pg.evaluate(FRAME, 30)
                    pg.evaluate("(m) => { const k = Rennspiel.spiel.kameras[0]; k.modusIndex = Rennspiel.config.kamera.modi.indexOf(m); k._erstesMal = true; }", 'cockpit' if fall == 'regen_cockpit' else 'verfolger')
                    if fall in ('regen', 'regen_cockpit', 'tempo'):
                        pg.evaluate("() => { const s = Rennspiel.spiel, v = s.fahrzeuge[0].vehicle; s.__h = setInterval(() => {}, 1e9); window.__fix = () => { v.vLaengs = Math.max(v.vLaengs, v.daten.vMax * 0.95); s.kameras[0]._tempoAnteil = 0.95; }; }")
                        for i in range(70 if fall != "tempo" else 14):
                            pg.evaluate("() => { window.__fix(); }"); pg.evaluate(FRAME, 1)
                    elif fall == 'funken':   # echter Anprall: Fahrzeug an die Bande drücken (Schleifen), Motorrad zusätzlich M3-Funken
                        pg.evaluate("""() => { const s = Rennspiel.spiel, v = s.fahrzeuge[0].vehicle, st = s.strecke, sp = st.spline, p = sp.punktBei(120), max = st.seitenabstandMax !== undefined ? st.seitenabstandMax : st.breite / 2 + 40;
                          window.__wand = () => { v.x = p.x + p.nx * (max - 0.3); v.z = p.z + p.nz * (max - 0.3); v.heading = Math.atan2(-p.tx, -p.tz); v.vLaengs = 25; }; window.__wand(); }""")
                        for i in range(6): pg.evaluate("() => { window.__wand(); }"); pg.evaluate(FRAME, 1)
                        pg.evaluate("""() => { const s = Rennspiel.spiel, v = s.fahrzeuge[0].vehicle, g = s.motoFxGruppe; window.__wand();
                          if (g) { const r = [-Math.sin(v.heading), -Math.cos(v.heading)]; Rennspiel.Moto.m3fx.funkenSpawn(g.userData.fx.funken, 40, v.x, s.fahrzeuge[0].mesh.position.y, v.z, r[0], r[1]); } }""")
                        pg.evaluate(FRAME, 4)
                    elif fall == 'puff':
                        pg.evaluate("() => { Rennspiel.Grafik.Effekte.ausloesen(Rennspiel.spiel, 'puff', 0, 1.2); }")
                        pg.evaluate(FRAME, 9)
                    elif fall == 'feuer':
                        if moto:
                            pg.evaluate("""() => { const s = Rennspiel.spiel, G = Rennspiel.Grafik, st = s._g4; const o = st.ringe[0]; const p = new THREE.Vector3(); o.getWorldPosition(p);
                              const v = s.fahrzeuge[0].vehicle, f = s.fahrzeuge[0]; window.__ring = p;
                              window.__ringZu = () => { const rg = o; const d = new THREE.Vector3(0, 0, 1).transformDirection(rg.matrixWorld); v.x = p.x - d.x * 12; v.z = p.z - d.z * 12; v.vLaengs = 0; v.heading = Math.atan2(-d.x, -d.z); }; window.__ringZu(); }""")
                        else:
                            pg.evaluate("""() => { const s = Rennspiel.spiel, v = s.fahrzeuge[0].vehicle, st = s.strecke, h = st.hindernisse.find((x) => x.typ === 'brand' && !x.lava), sp = st.spline, q = sp.punktBei(h.s - 14);
                              v.x = q.x + q.nx * h.seitenabstand * 0.6; v.z = q.z + q.nz * h.seitenabstand * 0.6; v.vLaengs = 0; v.heading = Math.atan2(-q.tx, -q.tz); }""")
                        pg.evaluate(FRAME, 100)
                    # Kamera
                    nah = {'regen': [0.0, 7.5 if not moto else 6, 2.6, 0], 'tempo': [0.0, 8 if not moto else 6.5, 2.6, 0], 'funken': [0.7, 5.5 if not moto else 5, 1.6, 0], 'puff': [0.6, 8 if not moto else 7, 2.2, 0],
                           'feuer': [0.0, 11, 2.0, 10] if moto else [0.35, 9, 2.2, 14]}.get(fall)
                    pg.evaluate("""([src, a]) => { const s = Rennspiel.spiel, z0 = s.zeichnen, f = eval(src); window.__kamArgs = a; s.zeichnen = function () { if (window.__kamArgs) f(window.__kamArgs); return z0.apply(this, arguments); }; }""", [KAM2 if (moto and fall == 'feuer') else KAM, nah])
                    pg.evaluate(FRAME, 1)
                    pg.evaluate("() => { if (window.__fix) window.__fix(); Rennspiel.spiel.zeichnen(); }")
                    name = f'{spiel}_{stufe}_{fall}'
                    pg.screenshot(path=os.path.join(out, name + '.png'), timeout=180000)
                    d = pg.evaluate("""() => { const s = Rennspiel.spiel, gl = s.renderer.getContext(), r = s.renderer; s.zeichnen(); const calls = r.info.render.calls; gl.finish(); const m = [];
                      for (let k = 0; k < 5; k++) { const w0 = Date.now(), n = 8; for (let i = 0; i < n; i++) { s.zeichnen(); gl.finish(); } m.push((Date.now() - w0) / n); } m.sort((a, b) => a - b);
                      return { calls, ms: m[2], z: Rennspiel.Grafik.Effekte.zaehler(s) }; }""")
                    r = {'fall': name, 'calls': d['calls'], 'ms': round(d['ms'], 1), 'zaehler': d['z'], 'fehler': fehler[:5]}
                    res.append(r); print(json.dumps(r, ensure_ascii=False), flush=True); ctx.close()
        b.close()
finally:
    srv.terminate()
ep = os.path.join(out, 'ergebnis.json'); alt = json.load(open(ep)) if os.path.exists(ep) else []
alt = [x for x in alt if x['fall'] not in {r['fall'] for r in res}] + res
json.dump(alt, open(ep, 'w'), indent=1, ensure_ascii=False)
