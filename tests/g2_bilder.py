#!/usr/bin/env python3
"""Grafik-Bilder (G1-Nachprüfung / G2): Playwright, SwiftShader. Aufruf:
  python3 tests/g2_bilder.py <Ausgabeordner> <fälle>   Fall = spiel:strecke:stufe:tageszeit:wetter:ansicht   (mehrere, Leerzeichen getrennt)
  spiel auto|moto · stufe normal|schoen|ultra · tageszeit tag|daemmerung|nacht · wetter klar|regen|nebel|schnee|hagel|sandsturm · ansicht chase|nah|zwei|weit
Schreibt <Ordner>/<spiel>_<strecke>_<stufe>_<tz>_<wetter>_<ansicht>.png und eine Zeile je Fall (Draw-Calls, Dreiecke, ms/Bild, Fehler)."""
import os, sys, time, socket, subprocess, json, base64
from playwright.sync_api import sync_playwright
basis = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
out = sys.argv[1]; os.makedirs(out, exist_ok=True)
faelle = [f for f in sys.argv[2:] if not f.startswith('--')]
root = basis
if '--root' in sys.argv: root = sys.argv[sys.argv.index('--root') + 1]; faelle = [f for f in faelle if f != root]
s = socket.socket(); s.bind(('127.0.0.1', 0)); port = s.getsockname()[1]; s.close()
srv = subprocess.Popen([sys.executable, '-m', 'http.server', str(port), '--bind', '127.0.0.1'], cwd=root, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL); time.sleep(1)
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
SEED = "(() => { let a = 123456789; Math.random = () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; })();"
res = []
try:
    with sync_playwright() as p:
        b = p.chromium.launch(args=ARGS)
        for fall in faelle:
            spiel, strecke, stufe, tz, wetter, ansicht = fall.split(':')
            moto = spiel == 'moto'; zwei = ansicht == 'zwei'
            ctx = b.new_context(viewport={'width': 960, 'height': 540}); ctx.add_init_script(SEED)
            pg = ctx.new_page(); fehler = []
            pg.on('pageerror', lambda e: fehler.append(str(e)))
            pg.on('console', lambda m: fehler.append('console:' + m.text) if m.type in ('error', 'warning') and 'GPU stall' not in m.text and 'swiftshader' not in m.text.lower() else None)
            pg.goto(f'http://127.0.0.1:{port}/{"Motorrad" if moto else "Autorennen"}.html'); pg.wait_for_timeout(1200)
            if stufe != 'normal': pg.evaluate('(s) => Rennspiel.Grafik.setzen(s)', stufe)
            pg.evaluate(SEED)
            autos = ['crossmaschine', 'crossmaschine-rot'] if moto else ['porsche-911', 'multivan']
            pg.evaluate("""([a, st, tz, w, zwei]) => { window.__t = 1000; performance.now = () => window.__t; Rennspiel.spiel.uhr.letzte = window.__t;
              Rennspiel.spiel.rennenStarten({ modus: zwei ? 'zwei' : 'solo', streckeId: st, autoIds: a, runden: 1, gegner: 3, schwierigkeit: 'mittel', fahrhilfe: ['wenig', 'wenig'], tageszeit: tz, wetter: w });
              window.requestAnimationFrame = () => 0; }""", [autos, strecke, tz, wetter, zwei])
            pg.wait_for_timeout(600)
            pg.evaluate("""(moto) => { const s = Rennspiel.spiel, z0 = s.zeichnen; s.zeichnen = function () {}; let g = 0; window.__t = 5000; s.uhr.letzte = window.__t; s.uhr.rest = 0;
              while ((s.zustand !== 'rennen' || !s.rennen.gasErlaubt) && g++ < 900) { window.__t += 1000 / 60; s._frameRumpf(window.__t); }
              for (let i = 0; i < (moto ? 40 : 200); i++) { window.__t += 1000 / 60; s._frameRumpf(window.__t); }
              s.zeichnen = z0; document.getElementById('ui').style.display = 'none'; }""", moto)
            d = pg.evaluate("""([ansicht, moto]) => { const s = Rennspiel.spiel; window.__t += 1000 / 60; s._frameRumpf(window.__t);
              if (ansicht === 'seite') { const f = s.fahrzeuge[0].mesh, k = s.kameras[0].kamera, p = new THREE.Vector3(); f.getWorldPosition(p); const h = s.fahrzeuge[0].vehicle.heading, rx = Math.cos(h), rz = -Math.sin(h), fx = -Math.sin(h), fz = -Math.cos(h);
                k.position.set(p.x + rx * 7 - fx * 3, p.y + 2.2, p.z + rz * 7 - fz * 3); k.lookAt(p.x + rx * 40 + fx * 25, p.y + 4, p.z + rz * 40 + fz * 25); k.updateMatrixWorld(true); }
              if (ansicht === 'nah' || ansicht === 'weit') { const f = s.fahrzeuge[0].mesh, k = s.kameras[0].kamera, p = new THREE.Vector3(); f.getWorldPosition(p); const h = s.fahrzeuge[0].vehicle.heading;
                const a = ansicht === 'nah' ? 0.7 : 0.0, dist = ansicht === 'nah' ? (moto ? 6.5 : 4.6) : (moto ? 14 : 16), hh = ansicht === 'nah' ? 1.5 : 6;
                k.position.set(p.x + Math.sin(h + a) * dist, p.y + hh, p.z + Math.cos(h + a) * dist); k.lookAt(p.x, p.y + 0.5, p.z); k.updateMatrixWorld(true); }
              for (let i = 0; i < 6; i++) s.zeichnen();
              const r = s.renderer, gl = r.getContext(); s.zeichnen(); const png = r.domElement.toDataURL('image/png'); const c = r.info.render.calls, tr = r.info.render.triangles;
              gl.finish(); const w0 = Date.now(), n = 6; for (let i = 0; i < n; i++) { s.zeichnen(); gl.finish(); } const ms = (Date.now() - w0) / n;
              return [png, c, tr, ms, r.info.memory.geometries, r.info.memory.textures]; }""", [ansicht, moto])
            name = f'{spiel}_{strecke}_{stufe}_{tz}_{wetter}_{ansicht}'
            open(os.path.join(out, name + '.png'), 'wb').write(base64.b64decode(d[0].split(',')[1]))
            r = {'fall': name, 'calls': d[1], 'dreiecke': d[2], 'ms': round(d[3], 1), 'geo': d[4], 'tex': d[5], 'fehler': fehler[:4]}
            res.append(r); print(json.dumps(r, ensure_ascii=False), flush=True); ctx.close()
        b.close()
finally:
    srv.terminate()
