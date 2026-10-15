#!/usr/bin/env python3
"""v22 (14.10.): Alpen-Bilder vorher/nachher + Höhenprofil.
   python3 tests/alpen_shots.py [basisordner] [tag] [variante]
   basisordner: Projektordner mit Autorennen.html (Standard: dieses Projekt), tag: Dateipräfix (Standard 'nachher'), variante: '' | 'xl'
   → tests/out/v22_strecken/<tag>_alpen[_xl]_{profil,seite,fahrer_*,ueberfuehrung}.png"""
import sys, os, json
from playwright.sync_api import sync_playwright
import matplotlib; matplotlib.use('Agg')
import matplotlib.pyplot as plt

hier = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
basis = os.path.abspath(sys.argv[1]) if len(sys.argv) > 1 else hier
tag = sys.argv[2] if len(sys.argv) > 2 else 'nachher'
var = sys.argv[3] if len(sys.argv) > 3 else ''
out = os.path.join(hier, 'tests', 'out', 'v22_strecken'); os.makedirs(out, exist_ok=True)
pre = f'{tag}_alpen' + ('_xl' if var else '')
url = 'file://' + os.path.join(basis, 'Autorennen.html')

KAMERA_FREI = '''([px, py, pz, lx, ly, lz]) => { const s = Rennspiel.spiel, k = s.kameras[0];
  k.update = () => {}; k.kamera.far = 6000; k.kamera.updateProjectionMatrix();
  s.szene.fog.far = 9000; s.szene.fog.near = 8000;
  k.kamera.position.set(px, py, pz); k.kamera.lookAt(lx, ly, lz); }'''
INFO = '''(() => { const s = Rennspiel.spiel, st = s.strecke, sp = st.spline;
  let xmin = 1e9, xmax = -1e9, zmin = 1e9, zmax = -1e9;
  sp.punkte.forEach(p => { xmin = Math.min(xmin, p.x); xmax = Math.max(xmax, p.x); zmin = Math.min(zmin, p.z); zmax = Math.max(zmax, p.z); });
  let ms = 0; sp.punkte.forEach((p, i) => { const q = sp.punkte[(i + 1) % sp.anzahl]; ms = Math.max(ms, Math.abs(q.y - p.y) / sp.ds); });
  return { laenge: st.laenge, box: [xmin, xmax, zmin, zmax], maxSteig: ms, prof: sp.punkte.filter((p, i) => i % 5 === 0).map(p => [p.s, p.y]),
    tunnel: st.tunnel.map(t => [t.s0, t.s1]), ueb: st.ueberfuehrungen.map(u => [u.s0, u.s1]) }; })()'''
fehler = []
with sync_playwright() as p:
    b = p.chromium.launch(args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
    page = b.new_page(viewport={'width': 1280, 'height': 720})
    page.on('pageerror', lambda e: fehler.append(str(e)))
    page.goto(url); page.wait_for_timeout(1500)
    page.evaluate("([id, v]) => Rennspiel.spiel.rennenStarten({ modus: 'solo', streckeId: id, welt: 'klassisch', variante: v, autoIds: ['passat', 'multivan'], runden: 3, gegner: 0, schwierigkeit: 'mittel', fahrhilfe: ['wenig', 'wenig'] })", ['alpen', var])
    page.wait_for_timeout(2500)
    info = page.evaluate(INFO)
    print(tag, var or 'normal', 'Länge %.0f' % info['laenge'], 'max Steigung %.1f %%' % (info['maxSteig'] * 100),
          'y %.1f…%.1f' % (min(y for _, y in info['prof']), max(y for _, y in info['prof'])))
    # Fahrersicht an mehreren Stellen (Spielkamera, Auto auf der Mitte)
    f = 1.6 if var else 1.0
    for name, s in [('kuppe1', 800), ('senke1', 945), ('anstieg', 1040), ('abfahrt', 1750), ('kuppe2', 1890), ('talfahrt', 2300)]:
        page.evaluate('''([s]) => { const R = Rennspiel, sp = R.spiel.strecke.spline, q = sp.punktBei(s), fz = R.spiel.fahrzeuge[0];
          fz.vehicle.setzen(q.x, q.z, R.headingAus(q.tx, q.tz)); fz.index = -1; R.spiel.kameras[0]._erstesMal = true; }''', [s * f])
        page.wait_for_timeout(1600)
        page.screenshot(path=os.path.join(out, f'{pre}_fahrer_{name}.png'), timeout=150000)
    # Höhenprofil
    fig, ax = plt.subplots(figsize=(12, 3.6))
    ax.plot([s for s, _ in info['prof']], [y for _, y in info['prof']], color='#2b6cb0', lw=2)
    for t in info['tunnel']: ax.axvspan(t[0], t[1], color='#888', alpha=.35)
    for u in info['ueb']: ax.axvspan(u[0], u[1], color='#e07b00', alpha=.3)
    ax.set_xlabel('Bogenlänge s (m)'); ax.set_ylabel('Höhe y (m)'); ax.set_ylim(-10, 110 if var else 85)
    ax.set_title(f'Alpen {"XL " if var else ""}{tag}: Höhe {min(y for _, y in info["prof"]):.0f}…{max(y for _, y in info["prof"]):.0f} m, max. Steigung {info["maxSteig"]*100:.1f} %, Länge {info["laenge"]:.0f} m')
    ax.grid(alpha=.3); fig.tight_layout(); fig.savefig(os.path.join(out, pre + '_profil.png'), dpi=80); plt.close(fig)
    # Seitenansicht: Kamera weit seitlich (+x), Blick quer über die Strecke
    xmin, xmax, zmin, zmax = info['box']; mx, mz = (xmin + xmax) / 2, (zmin + zmax) / 2
    breit = zmax - zmin
    page.evaluate(KAMERA_FREI, [xmax + breit * 0.9, 60, mz, mx, 25, mz]); page.wait_for_timeout(1500)
    page.screenshot(path=os.path.join(out, pre + '_seite.png'), timeout=150000)
    # schräg von oben
    page.evaluate(KAMERA_FREI, [mx + breit * 0.55, breit * 0.45, mz + breit * 0.75, mx, 20, mz]); page.wait_for_timeout(1200)
    page.screenshot(path=os.path.join(out, pre + '_schraeg.png'), timeout=150000)
    b.close()
print('JS-Fehler:', fehler[:3] or 'keine')
