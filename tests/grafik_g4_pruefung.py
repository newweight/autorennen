#!/usr/bin/env python3
"""Grafik G4 – Prüfung (Normal gegen Stand vor G2 = 2e3724c; sonst wie G1) (Playwright, Headless/SwiftShader). Aufruf: python3 tests/grafik_g1_pruefung.py [--alt <Commit>]
Beleg „Normal = bitgleich“: Autorennen und Motorrad je auf der Wiese, feste Szene (Math.random mit festem Startwert, Takt Bild für Bild 1/60 s),
Bild Normal VORHER (Stand --alt, Standard 74b6f40 per git archive) gegen NACHHER (Arbeitsverzeichnis): Pixel-Differenz (Anzahl abweichender Pixel, größte
Kanal-Abweichung) und renderer.info (Draw-Calls, Dreiecke). Dazu Bilder Normal/Schön/Ultra (Tag, Nah-Ansicht, Nacht) nach tests/bilder_g1/ und grobe
ms je Bild je Stufe (nur Relation, SwiftShader). Ergebnis auch als tests/bilder_g4/normal_pruefung/ergebnis.json."""
import os, sys, time, socket, subprocess, tempfile, json, base64, io
from playwright.sync_api import sync_playwright
from PIL import Image, ImageChops

basis = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
out = os.path.join(basis, 'tests', 'bilder_g2', 'normal_pruefung'); os.makedirs(out, exist_ok=True)
alt = sys.argv[sys.argv.index('--alt') + 1] if '--alt' in sys.argv else '2e3724c'
tmp = tempfile.mkdtemp(prefix='g1_alt_')
subprocess.run(f'git -C "{basis}" archive {alt} | tar -x -C "{tmp}"', shell=True, check=True)

def port():
    s = socket.socket(); s.bind(('127.0.0.1', 0)); p = s.getsockname()[1]; s.close(); return p
srv = []
def serve(root):
    p = port(); srv.append(subprocess.Popen([sys.executable, '-m', 'http.server', str(p), '--bind', '127.0.0.1'], cwd=root, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)); return p
pn, pa = serve(basis), serve(tmp); time.sleep(1.0)
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
SEED = "(() => { let a = 123456789; Math.random = () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; })();"
STUFEN = ['normal', 'schoen', 'ultra']

def lauf(browser, port_, spiel, stufe, tageszeit, ansichten, umschalten=False):
    """Ein Rennstart, feste Szene; liefert {ansicht: (PNG-Bytes, draw_calls, dreiecke)} und ms je Bild."""
    moto = spiel == 'Motorrad'
    ctx = browser.new_context(viewport={'width': 960, 'height': 540}); ctx.add_init_script(SEED)
    pg = ctx.new_page(); fehler = []
    pg.on('pageerror', lambda e: fehler.append(str(e)))
    pg.goto(f'http://127.0.0.1:{port_}/{spiel}.html'); pg.wait_for_timeout(1200)
    autos = ['crossmaschine', 'crossmaschine-rot'] if moto else ['porsche-911', 'multivan']
    if stufe != 'normal':
        pg.evaluate('(s) => Rennspiel.Grafik.setzen(s)', stufe)
    else:   # Schalter existiert nur im Nachher-Stand; Normal ist Standard (nichts gespeichert)
        pass
    pg.evaluate(SEED)
    pg.evaluate("""([a, tz]) => { window.__t = 1000; performance.now = () => window.__t; Rennspiel.spiel.uhr.letzte = window.__t;
      Rennspiel.spiel.rennenStarten({ modus: 'solo', streckeId: 'wiese', autoIds: a, runden: 1, gegner: 3, schwierigkeit: 'mittel', fahrhilfe: ['wenig', 'wenig'], tageszeit: tz, wetter: 'sonne' });
      window.requestAnimationFrame = () => 0; }""", [autos, tageszeit])
    pg.wait_for_timeout(500)
    pg.evaluate("""(moto) => { const s = Rennspiel.spiel, z0 = s.zeichnen; s.zeichnen = function () {}; let g = 0; window.__t = 5000; s.uhr.letzte = window.__t; s.uhr.rest = 0;
      while ((s.zustand !== 'rennen' || !s.rennen.gasErlaubt) && g++ < 900) { window.__t += 1000 / 60; s._frameRumpf(window.__t); }
      for (let i = 0; i < (moto ? 15 : 120); i++) { window.__t += 1000 / 60; s._frameRumpf(window.__t); }
      s.zeichnen = z0; document.getElementById('ui').style.display = 'none'; }""", moto)
    erg = {}
    for name, nah in ansichten:
        if umschalten:    # gleiche Szene, kein Spielschritt dazwischen: Normal → Ultra → Normal → zeichnen; muss dem ersten Bild exakt gleichen
            JS = """([nah, umsch]) => { const s = Rennspiel.spiel; window.__t += 1000 / 60; s._frameRumpf(window.__t);
              if (nah) { const f = s.fahrzeuge[0].mesh, k = s.kameras[0].kamera, p = new THREE.Vector3(); f.getWorldPosition(p); const h = s.fahrzeuge[0].vehicle.heading;
                const a = nah === 1 ? 0.7 : -0.7, dist = window.MOTORRAD ? 6.5 : 4.6;
                k.position.set(p.x + Math.sin(h + a) * dist, p.y + (window.MOTORRAD ? 1.6 : 1.4), p.z + Math.cos(h + a) * dist); k.lookAt(p.x, p.y + 0.5, p.z); k.updateMatrixWorld(true); }
              const r = s.renderer, bild = () => { s.zeichnen(); return r.domElement.toDataURL('image/png'); };
              const viele = () => { for (let i = 0; i < 10; i++) s.zeichnen(); };   // Rückspiegel rendert nur alle paar Bilder neu → durchlaufen lassen
              viele(); const A = bild(); Rennspiel.Grafik.setzen('ultra'); viele(); Rennspiel.Grafik.setzen('normal'); viele(); const B = bild();
              return [A, B, r.info.render.calls]; }"""
            d = pg.evaluate(JS, [nah, True])
            erg[name] = (base64.b64decode(d[0].split(',')[1]), d[2], 0, base64.b64decode(d[1].split(',')[1]))
            continue
        d = pg.evaluate("""(nah) => { const s = Rennspiel.spiel; window.__t += 1000 / 60; s._frameRumpf(window.__t);
          if (nah) { const f = s.fahrzeuge[0].mesh, k = s.kameras[0].kamera, p = new THREE.Vector3(); f.getWorldPosition(p); const h = s.fahrzeuge[0].vehicle.heading;
            const a = nah === 1 ? 0.7 : -0.7, dist = window.MOTORRAD ? 6.5 : 4.6;
            k.position.set(p.x + Math.sin(h + a) * dist, p.y + (window.MOTORRAD ? 1.6 : 1.4), p.z + Math.cos(h + a) * dist); k.lookAt(p.x, p.y + 0.5, p.z); k.updateMatrixWorld(true); s.zeichnen(); }
          const r = s.renderer; return [r.domElement.toDataURL('image/png'), r.info.render.calls, r.info.render.triangles]; }""", nah)
        erg[name] = (base64.b64decode(d[0].split(',')[1]), d[1], d[2])
    ms = pg.evaluate("""() => { const s = Rennspiel.spiel, gl = s.renderer.getContext(); s.zeichnen(); gl.finish(); const m = [];
      for (let k = 0; k < 5; k++) { const w0 = Date.now(), n = 12; for (let i = 0; i < n; i++) { s.zeichnen(); gl.finish(); } m.push((Date.now() - w0) / n); }
      m.sort((a, b) => a - b); return m[2]; }""")
    info = pg.evaluate("() => { const r = Rennspiel.spiel.renderer; const st = Rennspiel.spiel._g1; return { tm: r.toneMapping, schatten: r.shadowMap.enabled, g1: !!(st && st.aktiv), glows: st ? st.glows.length : 0 }; }")
    ctx.close()
    return erg, ms, info, fehler

def diff(a, b):
    ia, ib = Image.open(io.BytesIO(a)).convert('RGB'), Image.open(io.BytesIO(b)).convert('RGB')
    if ia.size != ib.size: return {'groesse_verschieden': True}
    d = ImageChops.difference(ia, ib)
    px = sum(1 for p in d.getdata() if p != (0, 0, 0)); mx = max(x[1] for x in d.getextrema())
    return {'abweichende_pixel': px, 'von': ia.size[0] * ia.size[1], 'max_kanal': mx}

ergebnis = {}
try:
    with sync_playwright() as p:
        b = p.chromium.launch(args=ARGS)
        for spiel, kurz in (('Autorennen', 'auto'), ('Motorrad', 'moto')):
            R = ergebnis[spiel] = {}
            ans = [('chase', 0), ('nah', 2)]
            vor, msv, infov, fev = lauf(b, pa, spiel, 'normal', 'tag', ans)
            nach, msn, infon, fen = lauf(b, pn, spiel, 'normal', 'tag', ans)
            vor2, _, _, _ = lauf(b, pa, spiel, 'normal', 'tag', ans)          # Kontrolle: derselbe alte Stand zweimal → Grundrauschen der Szene (Zufall/Zeit)
            R['normal_vorher_nachher'] = {a: dict(diff(vor[a][0], nach[a][0]), draw_calls_vorher=vor[a][1], draw_calls_nachher=nach[a][1], dreiecke_vorher=vor[a][2], dreiecke_nachher=nach[a][2]) for a, _ in ans}
            R['kontrolle_vorher_gegen_vorher'] = {a: diff(vor[a][0], vor2[a][0]) for a, _ in ans}
            for a, _ in ans:
                Image.open(io.BytesIO(vor[a][0])).convert('RGB').save(os.path.join(out, f'{kurz}_normal_{a}_VORHER.png'))
                ImageChops.difference(Image.open(io.BytesIO(vor[a][0])).convert('RGB'), Image.open(io.BytesIO(nach[a][0])).convert('RGB')).point(lambda v: min(255, v * 8)).save(os.path.join(out, f'{kurz}_normal_{a}_diff_x8.png'))
            R['normal_vorher_nachher']['renderer'] = {'vorher': infov, 'nachher': infon, 'fehler': fev + fen}
            R['ms_je_bild'] = {'normal_vorher': round(msv, 1), 'normal': round(msn, 1)}
            # Rückschalt-Prüfung: gleiche Szene Normal → Ultra → wieder Normal ↔ erstes Normal-Bild (kein Spielschritt dazwischen)
            rw, _, _, _ = lauf(b, pn, spiel, 'normal', 'tag', ans, umschalten=True)
            R['normal_nach_ultra_zurueckgeschaltet'] = {a: diff(rw[a][0], rw[a][3]) for a, _ in ans}
            for st in STUFEN:
                erg = nach if st == 'normal' else None
                if st != 'normal':
                    erg, ms, info, fe = lauf(b, pn, spiel, st, 'tag', ans)
                    R['ms_je_bild'][st] = round(ms, 1); R[st] = {'draw_calls': erg['chase'][1], 'renderer': info, 'fehler': fe}
                for a, _ in ans:
                    open(os.path.join(out, f'{kurz}_{st}_{a}.png'), 'wb').write(erg[a][0])
                n_erg, n_ms, n_info, n_fe = lauf(b, pn, spiel, st, 'nacht', [('chase', 0), ('nah', 1)])
                for a in ('chase', 'nah'):
                    open(os.path.join(out, f'{kurz}_{st}_nacht_{a}.png'), 'wb').write(n_erg[a][0])
                R.setdefault('nacht', {})[st] = {'draw_calls': n_erg['chase'][1], 'glows': n_info['glows'], 'fehler': n_fe}
            print(spiel, json.dumps(R, indent=1), flush=True)
        b.close()
finally:
    for s in srv: s.terminate()
json.dump(ergebnis, open(os.path.join(out, 'ergebnis.json'), 'w'), indent=1)
