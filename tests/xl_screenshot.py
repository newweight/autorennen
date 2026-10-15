"""Runde 6 (W2-E): Streckenvarianten XL – Übersichtsbilder + Prüfungen im echten Spiel.
   python3 tests/xl_screenshot.py [wueste|fantasie|alle]  → tests/out/xl_<id>_normal.png / xl_<id>_xl.png (+ Loopings/Tunnel/Brücke-Nahbilder)
   Prüft: strecke.variante, Länge ≈ Faktor ×, Minimap sichtbar, Loopings sitzen auf der Straße, keine JS-Fehler."""
import sys, os, json
from playwright.sync_api import sync_playwright

basis = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
url = 'file://' + os.path.join(basis, 'Autorennen.html')
out = os.environ.get('XL_OUT') or os.path.join(basis, 'tests', 'out'); os.makedirs(out, exist_ok=True)   # v22: XL_OUT=Ordner
wahl = sys.argv[1] if len(sys.argv) > 1 else 'alle'
ids = ['wiese', 'wald', 'wueste', 'fantasie', 'dino', 'alpen'] if wahl == 'alle' else wahl.split(',')   # v22: alle 6 Strecken, Liste mit Komma

KAMERA_FREI = '''([px, py, pz, lx, ly, lz]) => { const s = Rennspiel.spiel, k = s.kameras[0];
  k.update = () => {}; k.kamera.far = 6000; k.kamera.updateProjectionMatrix();
  s.szene.fog.far = 9000; s.szene.fog.near = 8000;
  k.kamera.position.set(px, py, pz); k.kamera.lookAt(lx, ly, lz); }'''
INFO = '''(() => { const s = Rennspiel.spiel, st = s.strecke, sp = st.spline;
  const m = document.querySelector('.hud-minimap'), r = m ? m.getBoundingClientRect() : null;
  let xmin = 1e9, xmax = -1e9, zmin = 1e9, zmax = -1e9, x0 = 0, z0 = 0;
  sp.punkte.forEach(p => { xmin = Math.min(xmin, p.x); xmax = Math.max(xmax, p.x); zmin = Math.min(zmin, p.z); zmax = Math.max(zmax, p.z); x0 += p.x; z0 += p.z; });
  return { variante: st.variante, laenge: +st.laenge.toFixed(0), ziel: st.katalog.zielRundenzeit, cps: st.checkpoints.length,
    box: [xmin, xmax, zmin, zmax].map(Math.round), mitte: [x0 / sp.punkte.length, z0 / sp.punkte.length],
    minimap: r ? { w: r.width, h: r.height, sichtbar: r.width > 50 && getComputedStyle(m).display !== 'none' } : null,
    loopings: st.loopings.map(l => { const p = sp.punktBei(l.s); return { s: Math.round(l.s), x: p.x, z: p.z, y: p.y, auf: st.untergrundAn(p.x, p.z) }; }),
    tunnel: st.tunnel.map(t => ({ s0: t.s0, s1: t.s1, m: [t.m.x, t.m.z] })), bruecken: st.bruecken.map(b => ({ s0: b.s0, s1: b.s1, m: [b.m.x, b.m.z] })) }; })()'''

ergebnis = []
def pruefe(name, ok, info=''):
    z = ('OK   ' if ok else 'FEHL ') + name + ('  (' + str(info) + ')' if info != '' else '')
    print(z); ergebnis.append(z)

with sync_playwright() as p:
    browser = p.chromium.launch(args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
    for sid in ids:
        basisInfo = None
        for var in ['', 'xl']:
            page = browser.new_page(viewport={'width': 1280, 'height': 800})
            fehler = []
            page.set_default_timeout(180000)   # v22: bei Last (Software-GL) dauern Bilder > 30 s
            page.on('pageerror', lambda e: fehler.append(str(e)))
            page.on('console', lambda m: fehler.append(m.text) if m.type == 'error' else None)
            page.goto(url); page.wait_for_timeout(1500)
            page.evaluate("([id, v]) => Rennspiel.spiel.rennenStarten({ modus: 'solo', streckeId: id, welt: 'alles', variante: v, autoIds: ['troc-cabrio', 'multivan'], runden: 3, gegner: 3, schwierigkeit: 'mittel', fahrhilfe: ['wenig', 'wenig'] })", [sid, var])
            page.wait_for_timeout(2500)
            info = page.evaluate(INFO)
            tag = var or 'normal'
            print(sid, tag, json.dumps({k: info[k] for k in ('variante', 'laenge', 'ziel', 'cps', 'box', 'minimap')}))
            pruefe(f'[{sid} {tag}] strecke.variante = "{var}"', info['variante'] == var)
            pruefe(f'[{sid} {tag}] Minimap sichtbar', bool(info['minimap'] and info['minimap']['sichtbar']), info['minimap'])
            # Übersicht von schräg oben, passend zur Streckengröße
            xmin, xmax, zmin, zmax = info['box']; mx, mz = info['mitte']
            groesse = max(xmax - xmin, zmax - zmin)
            page.evaluate(KAMERA_FREI, [mx, groesse * 0.95, mz + groesse * 0.55, mx, 0, mz])
            page.wait_for_timeout(1500)
            page.screenshot(path=os.path.join(out, f'xl_{sid}_{tag}.png'))
            if var == '':
                basisInfo = info
            else:
                pruefe(f'[{sid}] Länge ≈ Faktor ×', abs(info['laenge'] / basisInfo['laenge'] - page.evaluate("(id) => Rennspiel.trackCatalog.find(t => t.id === id).varianten.xl.faktor", sid)) < 0.04 * 2, (basisInfo['laenge'], info['laenge']))
                pruefe(f'[{sid}] Checkpoints mehr als Normal', info['cps'] > basisInfo['cps'], (basisInfo['cps'], info['cps']))
                f = info['laenge'] / basisInfo['laenge']
                # Nahbilder: Loopings / Tunnel / Brücke (Kamera seitlich-oben auf die Stelle)
                stellen = [('looping%d' % i, l['s']) for i, l in enumerate(info['loopings'])] + \
                          [('tunnel%d' % i, (t['s0'] + t['s1']) / 2) for i, t in enumerate(info['tunnel'])] + \
                          [('bruecke%d' % i, (b['s0'] + b['s1']) / 2) for i, b in enumerate(info['bruecken'])]
                for name, s in stellen:
                    blick = page.evaluate('''([s]) => { const st = Rennspiel.spiel.strecke, sp = st.spline, a = sp.punktBei(s - 70), b = sp.punktBei(s + 15);
                      return [a.x + a.nx * 35, st.hoeheAn(a.x, a.z) + 40, a.z + a.nz * 35, b.x, st.hoeheAn(b.x, b.z) + 4, b.z]; }''', [s])
                    page.evaluate(KAMERA_FREI, blick); page.wait_for_timeout(800)
                    page.screenshot(path=os.path.join(out, f'xl_{sid}_{name}.png'))
                for l in info['loopings']:
                    pruefe(f'[{sid} xl] Looping@{l["s"]} sitzt auf der Straße', l['auf'] == 'strasse', l['auf'])
            pruefe(f'[{sid} {tag}] keine JS-Fehler', not fehler, fehler[:3])
            page.close()
    browser.close()
print('\n' + ('ALLE OK' if all(z.startswith('OK') for z in ergebnis) else 'FEHLER'))
sys.exit(0 if all(z.startswith('OK') for z in ergebnis) else 1)
