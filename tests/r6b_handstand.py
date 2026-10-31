#!/usr/bin/env python3
"""R6b BILDFIX 2: Handstand-Pose des Motorrad-Fahrers (Spieler + KI) – Bilder aus eigener Seiten-/Front-/Rückkamera und aus den echten Spielkameras (Verfolger/Cockpit).
Superman/Ruhe zum Vergleich. Aufruf: python3 tests/r6b_handstand.py [praefix]   (Bilder tests/bilder_r6b/<praefix>_handstand_*.png)"""
import os, sys, base64
from playwright.sync_api import sync_playwright
from PIL import Image
basis = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
bild = os.environ.get('BILD_ORDNER') or os.path.join(basis, 'tests', 'bilder_r6b'); os.makedirs(bild, exist_ok=True)
pre = sys.argv[1] if len(sys.argv) > 1 else 'nachher'
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
EIGEN = '''([art, d, h, w, idx]) => { const S = Rennspiel.spiel, f = S.fahrzeuge[idx], m = f.mesh, r = S.renderer; S.zeichnen();
  Rennspiel.SpassTricks.fahrer.animieren(m, art === 'ruhe' ? null : art, 1, 0.3);
  m.updateMatrixWorld(true); const c = new THREE.Vector3().setFromMatrixPosition(m.matrixWorld);
  const hd = f.vehicle.heading, rx = Math.cos(hd), rz = -Math.sin(hd), bx = Math.sin(hd), bz = Math.cos(hd);
  const W = r.domElement.width, H = r.domElement.height, cam = new THREE.PerspectiveCamera(50, W / H, 0.2, 1500);
  cam.position.set(c.x + (rx * Math.cos(w) + bx * Math.sin(w)) * d, c.y + h, c.z + (rz * Math.cos(w) + bz * Math.sin(w)) * d); cam.lookAt(c.x, c.y + 1.7, c.z); cam.updateMatrixWorld(true);
  r.setScissorTest(false); r.setViewport(0, 0, innerWidth, innerHeight); r.render(S.szene, cam); return r.domElement.toDataURL('image/png'); }'''
with sync_playwright() as pw:
    b = pw.chromium.launch(args=ARGS); page = b.new_page(viewport={'width': 800, 'height': 500}); page.set_default_timeout(300000)
    fehler = []; page.on('pageerror', lambda e: fehler.append(str(e)))
    page.goto('file://' + os.path.join(basis, 'Motorrad.html')); page.wait_for_function('window.Rennspiel && Rennspiel.spiel')
    page.evaluate("Rennspiel.spiel.rennenStarten({ modus: 'solo', streckeId: 'formel1', autoIds: ['crossmaschine', 'crossmaschine'], runden: 2, gegner: 1, schwierigkeit: 'mittel', fahrhilfe: ['wenig', 'wenig'], zufall: false, spass: true, geist: false })")
    page.wait_for_function('Rennspiel.spiel.rennen.zustand === "laeuft"', timeout=300000)
    page.evaluate("Rennspiel.spiel.pausiert = true")
    for art in ('handstand', 'superman'):
        for idx, wer in ((0, 'spieler'), (1, 'ki')):
            namen = []
            for i, (d, h, w) in enumerate([(5.2, 1.9, 0), (5.2, 1.9, 1.57), (6, 2.2, 3.14), (4.5, 1.6, 0.6)]):
                data = page.evaluate(EIGEN, [art, d, h, w, idx]); n = os.path.join(bild, f'_t{i}.png'); open(n, 'wb').write(base64.b64decode(data.split(',')[1])); namen.append(n)
            ims = [Image.open(n) for n in namen]; w_, h_ = ims[0].size; bl = Image.new('RGB', (w_, h_))
            for i, im in enumerate(ims): bl.paste(im.resize((w_ // 2, h_ // 2)), ((i % 2) * (w_ // 2), (i // 2) * (h_ // 2)))
            bl.save(os.path.join(bild, f'{pre}_{art}_{wer}.png'))
            for n in namen: os.remove(n)
    # echte Spielkameras (Spieler): Trick-Zustand vorgeben, Spielbild mit HUD
    for kam in ('verfolger', 'cockpit'):
        page.evaluate("(m) => { const k = Rennspiel.spiel.kameras[0]; let n = 0; while (k.modus !== m && n++ < 4) k.naechsterModus(); }", kam)
        page.evaluate("""() => { const S = Rennspiel.spiel; S.pausiert = false; window.__t = (window.__t || 20000); S.uhr.letzte = window.__t; S.uhr.rest = 0;
          for (let i = 0; i < 40; i++) { window.__t += 1000 / 60; S._frameRumpf(window.__t); } S.pausiert = true; }""")
        data = page.evaluate("""() => { const S = Rennspiel.spiel, r = S.renderer, k = S.kameras[0]; Rennspiel.SpassTricks.fahrer.animieren(S.fahrzeuge[0].mesh, 'handstand', 1, 0.3);
          r.setScissorTest(false); r.setViewport(0, 0, innerWidth, innerHeight); S.fahrzeuge[0].mesh.updateMatrixWorld(true); S.zeichnen(); Rennspiel.SpassTricks.fahrer.animieren(S.fahrzeuge[0].mesh, 'handstand', 1, 0.3); S.fahrzeuge[0].mesh.updateMatrixWorld(true); r.render(S.szene, k.kamera); return r.domElement.toDataURL('image/png'); }""")
        open(os.path.join(bild, f'{pre}_handstand_spielkamera_{kam}.png'), 'wb').write(base64.b64decode(data.split(',')[1]))
    print('Fehler:', fehler[:3]); b.close()
