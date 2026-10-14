#!/usr/bin/env python3
"""Vorher/Nachher-Bilder "Auto im Grünen" (14.10., v20): python3 tests/gruen_screenshot.py [ausgabeordner]
Vorher = alter Stand aus tests/sicherung_gruen_alt/ (collisions.js, trackBuilder.js, main.js werden per Route eingespielt),
Nachher = aktueller Stand. Szenen: (1) Passat fährt in einen großen Busch (Wiese), (2) Passat am steilen Hang (Alpen, Serpentine).
Ausgabe: <ordner>/{vorher,nachher}_{busch_seite,busch_hinten,busch_oben,hang_seite,hang_vorn}.png"""
import sys, os, json
from playwright.sync_api import sync_playwright

basis = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
url = 'file://' + os.path.join(basis, 'Autorennen.html')
out = sys.argv[1] if len(sys.argv) > 1 else os.path.join(basis, 'tests', 'out', 'gruen')
os.makedirs(out, exist_ok=True)
ALT = os.path.join(basis, 'tests', 'sicherung_gruen_alt')
ALT_ORDNER = None      # wird in main() gebaut: Kopie des Projekts mit dem alten Stand von collisions.js, trackBuilder.js, main.js (Routen für file:// hängen)
ERSATZ = {'src/physics/collisions.js': 'collisions.js', 'src/track/trackBuilder.js': 'trackBuilder.js', 'src/main.js': 'main.js'}

KAMERA = '''([px, py, pz, lx, ly, lz]) => { const s = Rennspiel.spiel, k = s.kameras[0];
  k.update = () => {}; k.kamera.far = 3000; k.kamera.updateProjectionMatrix();
  if (s.szene.fog) { s.szene.fog.far = 5000; s.szene.fog.near = 4000; }
  k.kamera.position.set(px, py, pz); k.kamera.lookAt(lx, ly, lz); }'''
# größten Busch im befahrbaren Bereich suchen (Wiese): Auto-Mitte genau in die Busch-Mitte stellen (wie "durchfahren" im alten Stand)
BUSCH = '''(() => { const S = Rennspiel.spiel, st = S.strecke, f = S.fahrzeuge[0];
  const l = st.pflanzenKollider.filter(k => k.art === 'weich' && k.name === 'Buesche' && Math.abs(k.seitenabstand) < st.breite / 2 + 9)
    .sort((a, b) => b.r - a.r || a.s - b.s);
  const k = l[0]; const p = st.spline.punktBei(k.s);
  const w = Rennspiel.headingAus(p.tx, p.tz);
  const kx = k.kern ? k.kern.x : k.x, kz = k.kern ? k.kern.z : k.z;
  f.vehicle.setzen(kx, kz, w); f.vehicle.vLaengs = 0; f.index = -1;
  return { x: kx, z: kz, y: st.hoeheAn(kx, kz), r: k.r, s: k.s, q: k.seitenabstand, tx: p.tx, tz: p.tz, nx: p.nx, nz: p.nz }; })()'''
# Auto an den Hang stellen: Seite sg, Seitenabstand q (vom Straßenrand), Längsrichtung = Straße
HANG = '''([s, q, sg]) => { const S = Rennspiel.spiel, st = S.strecke, f = S.fahrzeuge[0], p = st.spline.punktBei(s);
  const qq = (st.breite / 2 + st.randBreite + q) * sg, x = p.x + p.nx * qq, z = p.z + p.nz * qq;
  f.vehicle.setzen(x, z, Rennspiel.headingAus(p.tx, p.tz)); f.vehicle.vLaengs = 0; f.index = st.spline.naechster(x, z).index;
  return { x, z, y: st.hoeheAn(x, z, f.index), tx: p.tx, tz: p.tz, nx: p.nx, nz: p.nz }; }'''
# Kamera an (x, z) in Höhe Boden + dy, Blick auf (lx, ly, lz)
KAM_BODEN = '''([x, z, dy, lx, ly, lz]) => { const s = Rennspiel.spiel, st = s.strecke, k = s.kameras[0];
  k.update = () => {}; k.kamera.far = 3000; k.kamera.updateProjectionMatrix();
  k.kamera.position.set(x, st.hoeheAn(x, z) + dy, z); k.kamera.lookAt(lx, ly, lz); }'''
AUTO = '''(() => { const f = Rennspiel.spiel.fahrzeuge[0], m = f.mesh; return { x: m.position.x, y: m.position.y, z: m.position.z, nicken: m.rotation.x, neigung: m.rotation.z, vx: f.vehicle.x, vz: f.vehicle.z, vy: f.vehicle.y }; })()'''

def lauf(browser, alt, name):
    ctx = browser.new_context(viewport={'width': 1280, 'height': 720})
    url = 'file://' + os.path.join(ALT_ORDNER if alt else basis, 'Autorennen.html')
    page = ctx.new_page()
    fehler = []
    page.on('pageerror', lambda e: fehler.append(str(e)))
    page.on('console', lambda m: fehler.append('console.' + m.type + ': ' + m.text) if m.type == 'error' else None)
    page.goto(url); page.wait_for_timeout(1500)
    erg = {'stand': name}
    snap = lambda n: page.screenshot(path=os.path.join(out, name + '_' + n + '.png'))
    # --- 1) Busch (Wiese)
    page.evaluate("() => Rennspiel.spiel.rennenStarten({ modus: 'solo', streckeId: 'wiese', autoIds: ['passat'], runden: 3, gegner: 0, schwierigkeit: 'mittel', fahrhilfe: ['wenig'] })")
    page.wait_for_function('Rennspiel.spiel.rennen && Rennspiel.spiel.rennen.gasErlaubt', timeout=90000)       # Countdown vorbei (Pflanzen-Kollision läuft erst danach)
    b = page.evaluate(BUSCH); page.wait_for_timeout(2500)
    erg['busch'] = dict(b, auto=page.evaluate(AUTO))
    # Seite: Kamera auf der Straßenseite, 7 m vom Busch
    sg = 1 if b['q'] > 0 else -1
    cam = lambda dx, dy, dz: [b['x'] + dx, b['y'] + dy, b['z'] + dz, b['x'], b['y'] + 0.7, b['z']]
    page.evaluate(KAMERA, [b['x'] - b['nx'] * sg * 7 , b['y'] + 2.2, b['z'] - b['nz'] * sg * 7, b['x'], b['y'] + 0.7, b['z']]); page.wait_for_timeout(1200); snap('busch_seite')
    page.evaluate(KAMERA, [b['x'] - b['tx'] * 8 - b['nx'] * sg * 2, b['y'] + 3.0, b['z'] - b['tz'] * 8 - b['nz'] * sg * 2, b['x'], b['y'] + 0.7, b['z']]); page.wait_for_timeout(1200); snap('busch_hinten')
    page.evaluate(KAMERA, [b['x'] + 0.01, b['y'] + 14, b['z'] + 0.01, b['x'], b['y'], b['z']]); page.wait_for_timeout(1200); snap('busch_oben')
    page.close()
    # --- 2) Hang (Alpen)
    page = ctx.new_page(); page.on('pageerror', lambda e: fehler.append(str(e)))
    page.goto(url); page.wait_for_timeout(1500)
    page.evaluate("() => Rennspiel.spiel.rennenStarten({ modus: 'solo', streckeId: 'alpen', autoIds: ['passat'], runden: 3, gegner: 0, schwierigkeit: 'mittel', fahrhilfe: ['wenig'] })")
    page.wait_for_function('Rennspiel.spiel.rennen && Rennspiel.spiel.rennen.gasErlaubt', timeout=90000)
    h = page.evaluate(HANG, [747, 6.5, 1]); page.wait_for_timeout(2500)
    erg['hang'] = dict(h, auto=page.evaluate(AUTO))
    snap2 = lambda n: page.screenshot(path=os.path.join(out, name + '_' + n + '.png'))
    # Seite: Kamera vom Fahrbahn-Rand quer zum Hang
    page.evaluate(KAM_BODEN, [h['x'] - h['nx'] * 8, h['z'] - h['nz'] * 8, 1.6, h['x'], h['y'] + 0.5, h['z']]); page.wait_for_timeout(1200); snap2('hang_seite')
    page.evaluate(KAM_BODEN, [h['x'] - h['tx'] * 7 - h['nx'] * 1, h['z'] - h['tz'] * 7 - h['nz'] * 1, 1.7, h['x'], h['y'] + 0.5, h['z']]); page.wait_for_timeout(1200); snap2('hang_hinten')
    erg['fehler'] = fehler
    page.close(); ctx.close()
    return erg

import tempfile, shutil
ALT_ORDNER = tempfile.mkdtemp(prefix='gruen_alt_')
for d in ('src', 'vendor'): shutil.copytree(os.path.join(basis, d), os.path.join(ALT_ORDNER, d))
shutil.copy(os.path.join(basis, 'Autorennen.html'), ALT_ORDNER)
for pfad, datei in ERSATZ.items(): shutil.copy(os.path.join(ALT, datei), os.path.join(ALT_ORDNER, pfad))
with sync_playwright() as p:
    b = p.chromium.launch(args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
    for alt, name in ((True, 'vorher'), (False, 'nachher')):
        print(json.dumps(lauf(b, alt, name), ensure_ascii=False))
    b.close()
shutil.rmtree(ALT_ORDNER, ignore_errors=True)
