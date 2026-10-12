#!/usr/bin/env python3
"""Polierrunde W3: Cockpit-Kamera rollt nicht bei Fahrtrichtung ±90° (Gimbal-Lock, rotation.order 'YXZ').
Aufruf: python3 tests/cockpit_test.py [ausgabeordner]   (Standard tests/out/cockpit)
A) Auto in 8 Richtungen (0°, 45°, … 315°), Neigung 0: Kamera-Roll (Abweichung des up-Vektors von der Senkrechten) < 2°.
B) Mit gewollter Neigung (0,1 rad): Roll = Neigung × 0,5 (± 1°) – in allen 8 Richtungen gleich.
C) Bilder: Cockpit bei Heading 90° und 0° (Horizont waagerecht – bitte ansehen)."""
import sys, os, math
from playwright.sync_api import sync_playwright

basis = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
out = sys.argv[1] if len(sys.argv) > 1 else os.path.join(basis, 'tests', 'out', 'cockpit')
os.makedirs(out, exist_ok=True)
url = 'file://' + os.path.join(basis, 'Autorennen.html')
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']

pruef = []
def pruefe(name, ok, info=''):
    pruef.append((name, ok)); print(('OK   ' if ok else 'FEHL ') + name + (' – ' + str(info) if info != '' else ''), flush=True)

# Auto an Position der Strecke, beliebige Richtung (Grad, 0 = −z), Cockpit-Kamera einmal fest einstellen; Roll messen:
# Roll = Winkel der Kamera-Rechts-Achse aus der Waagerechten (0 bei waagerechtem Horizont).
MESSEN = '''([grad, neigung, order]) => { const s = Rennspiel.spiel, f = s.fahrzeuge[0], v = f.vehicle, k = s.kameras[0];
  v.setzen(v.x, v.z, grad * Math.PI / 180); v.neigung = neigung; v.vLaengs = 0; v.vQuer = 0; v.lenkung = 0;
  s._vorherAngleichen(f);
  f.anzeige.x = v.x; f.anzeige.z = v.z; f.anzeige.heading = v.heading; f.anzeige.neigung = neigung;   // Darstellung (sonst erst im Render-Takt)
  if (order) k.kamera.rotation.order = order;
  k.modusIndex = Rennspiel.config.kamera.modi.indexOf('cockpit'); k._erstesMal = true;
  k.update(1 / 60);
  const c = k.kamera; c.updateMatrixWorld(true);
  const e = c.matrixWorld.elements;                        // Spalten: rechts (0..2), oben (4..6), −Blick (8..10)
  const rechtsY = e[1], obenY = e[5], blickY = -e[9];
  return { rollGrad: Math.asin(Math.max(-1, Math.min(1, rechtsY))) * 180 / Math.PI, obenY, blickY, order: c.rotation.order }; }'''

with sync_playwright() as p:
    browser = p.chromium.launch(args=ARGS)
    page = browser.new_page(viewport={'width': 1280, 'height': 800})
    fehler = []
    page.on('pageerror', lambda e: fehler.append(str(e)))
    page.on('console', lambda m: fehler.append('console.error: ' + m.text) if m.type == 'error' else None)
    page.goto(url); page.wait_for_timeout(1500)
    page.evaluate('''() => { const s = Rennspiel.spiel;
      s.rennenStarten({ modus: 'solo', streckeId: 'wiese', gegner: 1, runden: 1, schwierigkeit: 'leicht', autoIds: ['troc-cabrio'],
        fahrhilfe: ['wenig', 'wenig'], wetter: 'klar', jahreszeit: 'sommer', windStaerke: 0, polizei: false });
      s.uhr.rest = 0; s.pausiert = true; for (let k = 0; k < 60 * 6 && !s.rennen.gasErlaubt; k++) s.physikSchritt(1 / 60); }''')

    pruefe('Kamera: rotation.order = YXZ', page.evaluate('Rennspiel.spiel.kameras[0].kamera.rotation.order') == 'YXZ')
    # A) ohne Neigung
    erg = [(g, page.evaluate(MESSEN, [g, 0])) for g in range(0, 360, 45)]
    for g, r in erg: print(f'   Heading {g:3d}°: Roll {r["rollGrad"]:+.3f}°, up.y {r["obenY"]:.4f}')
    pruefe('A: Roll < 2° in allen 8 Richtungen (Neigung 0)', all(abs(r['rollGrad']) < 2 for g, r in erg), [round(r['rollGrad'], 2) for g, r in erg])
    pruefe('A: Kamera-oben zeigt nach oben (up.y > 0,95)', all(r['obenY'] > 0.95 for g, r in erg), [round(r['obenY'], 3) for g, r in erg])
    # Gegenprobe (nur Anzeige): mit der alten Reihenfolge XYZ rollt der Horizont bei ±90°
    alt = [(g, page.evaluate(MESSEN, [g, 0.1, 'XYZ'])) for g in (0, 90, 270)]
    print('   alt (XYZ, Neigung 0,1):', [(g, round(r['rollGrad'], 1)) for g, r in alt])
    page.evaluate("Rennspiel.spiel.kameras[0].kamera.rotation.order = 'YXZ'")
    # B) gewollte Neigung 0,1 rad → Roll 0,05 rad ≈ 2,9° (Betrag, in jeder Richtung gleich)
    soll = 0.1 * 0.5 * 180 / math.pi
    erg2 = [(g, page.evaluate(MESSEN, [g, 0.1])) for g in range(0, 360, 45)]
    pruefe(f'B: gewollte Neigung wirkt als Roll ≈ {soll:.1f}° (± 1°) in allen Richtungen', all(abs(abs(r['rollGrad']) - soll) < 1 for g, r in erg2), [round(r['rollGrad'], 2) for g, r in erg2])
    # C) Bilder
    page.evaluate('''() => { document.querySelectorAll('.hud-banner,.hud-meldung').forEach(b => { b.style.display = 'none'; }); }''')
    for g in (90, 0):
        page.evaluate(MESSEN, [g, 0]); page.evaluate('Rennspiel.spiel.renderer.render(Rennspiel.spiel.szene, Rennspiel.spiel.kameras[0].kamera)')
        page.screenshot(path=os.path.join(out, f'cockpit_heading_{g}.png'))
    pruefe('Keine JS-Fehler', not fehler, fehler[:3])
    browser.close()

n = sum(1 for _, ok in pruef if not ok)
print(f'\n{len(pruef) - n}/{len(pruef)} OK')
sys.exit(1 if n else 0)
