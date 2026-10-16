#!/usr/bin/env python3
"""v28 W9: Fahrersicht-Bilder der Start/Ziel-Tribüne. python3 tests/tribuene_start_shots.py [ids=wald,dino,alpen,mega] [tag=a]
Bilder: tests/out/v28/tribuene_start_<id>_<tag>_{60m,25m,neben,nah}.png"""
import sys, os, json
from playwright.sync_api import sync_playwright
basis = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
url = 'file://' + os.path.join(basis, 'Autorennen.html')
ids = (sys.argv[1] if len(sys.argv) > 1 else 'wald,dino,alpen,mega').split(',')
tag = sys.argv[2] if len(sys.argv) > 2 else 'a'
out = os.path.join(basis, 'tests', 'out', 'v28'); os.makedirs(out, exist_ok=True)
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
AUTO = '''([s, q]) => { const S = Rennspiel.spiel, sp = S.strecke.spline, p = sp.punktBei(sp.wrapS(s)), f = S.fahrzeuge[0];
  f.vehicle.setzen(p.x + p.nx * (q || 0), p.z + p.nz * (q || 0), Rennspiel.headingAus(p.tx, p.tz)); f.vehicle.vLaengs = 0; f.index = -1; S.kameras[0]._erstesMal = true; }'''
PARKEN = '''(() => { const s = Rennspiel.spiel; s.fahrzeuge.forEach((f, i) => { if (i > 0) { const p = s.strecke.spline.punktBei(s.strecke.laenge - 300 - 20 * i);
  f.vehicle.setzen(p.x, p.z, Rennspiel.headingAus(p.tx, p.tz)); f.driver && (f.driver.steuerung = () => ({ gas: 0, bremse: 1, lenkung: 0 })); } }); })()'''
KAMERA = '''([nr, abst, seitl, hoch, ziel]) => { const S = Rennspiel.spiel, t = S.strecke.tribuenen[nr], k = S.kameras[0];
  if (!k._eingefroren) { k._eingefroren = true; k.update = () => {}; }
  const px = t.x + t.tx * seitl - t.ox * abst, pz = t.z + t.tz * seitl - t.oz * abst;
  k.kamera.position.set(px, t.yBasis + hoch, pz); k.kamera.up.set(0, 1, 0);
  k.kamera.lookAt(t.x + t.ox * t.tiefe * 0.45, t.yBasis + ziel, t.z + t.oz * t.tiefe * 0.45); k.kamera.updateMatrixWorld(true); }'''
with sync_playwright() as p:
    b = p.chromium.launch(args=ARGS)
    for sid in ids:
        page = b.new_page(viewport={'width': 1024, 'height': 576}); fehler = []
        page.on('pageerror', lambda e: fehler.append(str(e)))
        page.goto(url); page.wait_for_timeout(1200)
        page.evaluate("Rennspiel.spiel.rennenStarten({ modus: 'solo', streckeId: '%s', autoIds: ['troc-cabrio', 'multivan'], runden: 3, gegner: 2, schwierigkeit: 'mittel', fahrhilfe: ['wenig', 'wenig'] })" % sid)
        page.wait_for_timeout(4000)
        page.evaluate(PARKEN)
        trib = page.evaluate("(Rennspiel.spiel.strecke.tribuenen || []).map(t => ({nr: t.nr, typ: t.typ, s: t.s, seite: t.seite, thema: t.thema}))")
        st = [t for t in trib if t['typ'] == 'start']
        draw = page.evaluate("(() => { let n = 0; Rennspiel.spiel.szene.children.forEach(g => { if (g.name === 'Tribuenen') g.traverse(o => { if (o.isMesh || o.isInstancedMesh) n++; }); }); return n; })()")
        print(sid, 'Tribünen', len(trib), 'Start', st, 'Meshes', draw, flush=True)
        if st:
            t = st[0]; q = t['seite'] * 3.5
            for d, nm in ((60, '60m'), (25, '25m')):
                page.evaluate(AUTO, [t['s'] - d, q]); page.wait_for_timeout(2500)
                page.screenshot(path=os.path.join(out, 'tribuene_start_%s_%s_%s.png' % (sid, tag, nm)), timeout=150000)
            page.evaluate(AUTO, [t['s'] + 4, q]); page.wait_for_timeout(2500)
            page.screenshot(path=os.path.join(out, 'tribuene_start_%s_%s_neben.png' % (sid, tag)), timeout=150000)
            page.evaluate(KAMERA, [t['nr'], 22, -12, 4.5, 3.0]); page.wait_for_timeout(2500)
            page.screenshot(path=os.path.join(out, 'tribuene_start_%s_%s_nah.png' % (sid, tag)), timeout=150000)
        print(sid, 'Fehler', fehler[:3], flush=True)
        page.close()
    b.close()
