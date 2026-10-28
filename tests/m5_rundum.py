#!/usr/bin/env python3
"""M5: Rundumbilder je Strecke (Start/Ziel, Tribünen, Brücken, Schilder, Streckenrand) -> Kontaktbögen zum Ansehen.
Aufruf: python3 tests/m5_rundum.py [Autorennen|Motorrad] [Ausgabeordner]   (Standard: tests/bilder_m5/rundum_<spiel>)
Bilder in Ausgabeordner/<strecke>_<nr>_<name>.png; Bögen bogen_<strecke>_<k>.png (3×2)."""
import os, sys, json
from playwright.sync_api import sync_playwright
basis = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
spiel = sys.argv[1] if len(sys.argv) > 1 else 'Autorennen'
out = sys.argv[2] if len(sys.argv) > 2 else os.path.join(basis, 'tests', 'bilder_m5', 'rundum_' + spiel.lower())
os.makedirs(out, exist_ok=True)
autos = ['passat', 'passat'] if spiel == 'Autorennen' else ['crossmaschine', 'crossmaschine-rot']
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
ids = (os.environ.get('STRECKEN') or 'wiese,wald,wueste,fantasie,dino,alpen,formel1').split(',')
KAM = '''([sc, qc, hc, st, qt, ht]) => { const S = Rennspiel.spiel, sp = S.strecke.spline, k = S.kameras[0];
  if (!k._eingefroren) { k._eingefroren = true; k.update = () => {}; }
  const a = sp.punktBei(sp.wrapS(sc)), b = sp.punktBei(sp.wrapS(st));
  k.kamera.position.set(a.x + a.nx * qc, S.strecke.bodenHoehe(a.x + a.nx * qc, a.z + a.nz * qc) + hc, a.z + a.nz * qc);
  k.kamera.up.set(0, 1, 0); k.kamera.rotation.z = 0;
  k.kamera.lookAt(b.x + b.nx * qt, S.strecke.bodenHoehe(b.x + b.nx * qt, b.z + b.nz * qt) + ht, b.z + b.nz * qt);
  k.kamera.updateMatrixWorld(true); }'''
fehler = []
with sync_playwright() as p:
    b = p.chromium.launch(args=ARGS)
    page = b.new_page(viewport={'width': 1280, 'height': 720}); page.set_default_timeout(300000)
    page.on('pageerror', lambda e: fehler.append(str(e)))
    page.on('console', lambda m: fehler.append(m.text) if m.type == 'error' else None)
    page.goto('file://' + os.path.join(basis, spiel + '.html')); page.wait_for_timeout(1500)
    for sid in ids:
        opt = "{ modus: 'solo', streckeId: '%s', autoIds: ['%s', '%s'], runden: 2, gegner: 3, schwierigkeit: 'mittel', fahrhilfe: ['wenig', 'wenig'] }" % (sid, autos[0], autos[1])
        page.evaluate("Rennspiel.spiel.rennenStarten(%s)" % opt); page.wait_for_timeout(2500)
        page.add_style_tag(content='.hud, #touch { display: none !important; }')
        page.wait_for_function('Rennspiel.spiel.rennen.zustand === "laeuft"', timeout=300000)
        page.evaluate("Rennspiel.spiel.fahrzeuge.forEach(f => { f.mesh.visible = false; })")
        info = page.evaluate("""(() => { const s = Rennspiel.spiel.strecke; const bs = (s.bruecken || []).map(b => b.s0 !== undefined ? b.s0 : (b.s !== undefined ? b.s : null));
          return { L: s.spline.laenge, trib: (s.tribuenen || []).map(t => [t.s, t.seite, t.typ, t.q0, t.tiefe]), bru: bs, ks: (s.kurvenschilder || []).slice(0, 3).map(k => k.s !== undefined ? k.s : null) }; })()""")
        L = info['L']; pos = []
        pos.append(('start_vorn', [-28, 0, 3.0, 6, 0, 3.0]))
        pos.append(('ziel_hinten', [30, 2, 3.0, -8, 0, 3.0]))
        pos.append(('start_oben', [-18, 0, 9.0, 8, 0, 4.5]))
        for i, (s, sg, typ, q0, tf) in enumerate(info['trib'][:6]):
            pos.append(('trib%d_%s' % (i, typ), [s - 26, -sg * 4, 2.6, s + 6, sg * (q0 + tf / 2), 3.2]))
            pos.append(('trib%d_nah' % i, [s - 8, -sg * 1, 2.0, s + 2, sg * (q0 + tf / 2), 3.4]))
        for i, s in enumerate([x for x in info['bru'] if x is not None][:2]):
            pos.append(('bruecke%d' % i, [s - 35, 0, 3.0, s, 0, 6.0])); pos.append(('bruecke%d_unter' % i, [s - 12, 0, 1.6, s + 6, 0, 5.5]))
        for i, s in enumerate([x for x in info['ks'] if x is not None]):
            pos.append(('schild%d' % i, [s - 25, 0, 2.4, s, 7, 2.0]))
        for k in range(8):
            s = L * (k + 0.5) / 8
            pos.append(('rand%d_links' % k, [s, 0, 2.4, s + 18, -22, 2.5])); pos.append(('rand%d_rechts' % k, [s, 0, 2.4, s + 18, 22, 2.5]))
        namen = []
        for j, (name, a) in enumerate(pos):
            page.evaluate(KAM, a); page.wait_for_timeout(450)
            fn = '%s_%02d_%s.png' % (sid, j, name)
            try: page.screenshot(path=os.path.join(out, fn), timeout=90000)
            except Exception as e: fehler.append(fn + ': ' + str(e)[:80]); continue
            namen.append(fn)
        json.dump(namen, open(os.path.join(out, 'liste_%s.json' % sid), 'w'))
        print(sid, len(namen), 'Bilder', info['trib'][:2] and len(info['trib']), 'Tribünen')
    b.close()
print('Fehler:', fehler[:10])
