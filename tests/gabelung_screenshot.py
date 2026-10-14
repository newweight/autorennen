#!/usr/bin/env python3
"""Bilder + Draw-Calls der Gabelung (14.10., v18): python3 tests/gabelung_screenshot.py [wiese|wueste|alle] [ausgabeordner] [praefix]
Fahrersicht (vor der Teilung, an der Y-Spitze, auf dem linken/rechten Ast, an der Zusammenführung) und Vogelperspektive (senkrecht + schräg),
Minimap-Ausschnitt. Prüft: keine JS-Fehler, Minimap sichtbar, Draw-Calls (Strecke + Deko + Gabelung), Deko nie auf den Ästen.
Ausgabe: tests/out/gabelung/<strecke>_<name>.png"""
import sys, os, json
from playwright.sync_api import sync_playwright

basis = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
url = 'file://' + os.path.join(basis, 'Autorennen.html')
wahl = sys.argv[1] if len(sys.argv) > 1 else 'alle'
out = sys.argv[2] if len(sys.argv) > 2 else os.path.join(basis, 'tests', 'out', 'gabelung')
praefix = sys.argv[3] if len(sys.argv) > 3 else ''
os.makedirs(out, exist_ok=True)

KAMERA = '''([px, py, pz, lx, ly, lz]) => { const s = Rennspiel.spiel, k = s.kameras[0];
  k.update = () => {}; k.kamera.far = 3000; k.kamera.updateProjectionMatrix();
  if (s.szene.fog) { s.szene.fog.far = 5000; s.szene.fog.near = 4000; }
  k.kamera.position.set(px, py, pz); k.kamera.lookAt(lx, ly, lz); }'''
# Auto auf Ast (ast = -1/+1, 0 = Mitte) bei s stellen; Kamera 'Fahrersicht' dahinter
FAHRER = '''([s, ast, hinter, hoch, vor]) => { const S = Rennspiel.spiel, st = S.strecke, f = S.fahrzeuge[0];
  const P = (ss) => st.astPunkt ? st.astPunkt(ss, ast || 1) : st.spline.punktBei(ss);
  const m = ast ? P(s) : st.spline.punktBei(s);
  f.vehicle.setzen(m.x, m.z, Rennspiel.headingAus(m.tx, m.tz)); f.vehicle.vLaengs = 0; f.index = -1;
  const a = ast ? P(s - hinter) : st.spline.punktBei(s - hinter), b = ast ? P(s + vor) : st.spline.punktBei(s + vor);
  return [a.x, st.hoeheAn(a.x, a.z) + hoch, a.z, b.x, st.hoeheAn(b.x, b.z) + 0.8, b.z]; }'''
OBEN = '''([s, hoehe, rueck, seit]) => { const st = Rennspiel.spiel.strecke, sp = st.spline, p = sp.punktBei(s), b = sp.punktBei(s - rueck);
  const x = b.x + p.nx * seit, z = b.z + p.nz * seit; return [x, st.hoeheAn(p.x, p.z) + hoehe, z, p.x, st.hoeheAn(p.x, p.z), p.z]; }'''
DRAW = '''(() => { const s = Rennspiel.spiel; let n = 0; const namen = [];
  s.szene.children.forEach(g => { if (!(g.name.startsWith('Strecke') || g.name.startsWith('Deko'))) return;
    g.traverse(o => { if ((o.isMesh || o.isInstancedMesh) && o.visible && (!o.isInstancedMesh || o.count > 0) && !(o.userData.stueck > 0)) { n++; namen.push(o.name); } }); });
  return { meshes: n, gabel: namen.filter(x => x.startsWith('Gabel')).length, drawCalls: s.renderer.info.render.calls, dreiecke: s.renderer.info.render.triangles }; })()'''
# Deko-Instanzen, die auf einem Ast liegen? (Abstand zur Astmitte < halbe Breite + Rand + 1 m)
DEKO_AUF_AST = '''(() => { const s = Rennspiel.spiel, st = s.strecke, sp = st.spline; let drauf = 0, n = 0; const m4 = new THREE.Matrix4(), v = new THREE.Vector3();
  s.szene.traverse(o => { if (!o.isInstancedMesh || !o.parent || !o.parent.name.startsWith('Deko')) return;
    for (let i = 0; i < o.count; i++) { o.getMatrixAt(i, m4); v.setFromMatrixPosition(m4);
      const nn = sp.naechster(v.x, v.z), w = st.gabelBei(nn.s); if (!w) continue; n++;
      const rel = Math.abs(Math.abs(nn.seitenabstand) - w.c);
      if (rel < w.h + st.randBreite + 0.8 || Math.abs(nn.seitenabstand) < w.c) drauf++; } });
  return { imBereich: n, aufAstOderInsel: drauf }; })()'''
MINIMAP = '''(() => { const c = document.querySelector('.hud-minimap'); if (!c) return null; const r = c.getBoundingClientRect();
  return { x: r.x, y: r.y, w: r.width, h: r.height }; })()'''

def lauf(browser, sid):
    page = browser.new_page(viewport={'width': 1280, 'height': 800})
    fehler = []
    page.on('pageerror', lambda e: fehler.append(str(e)))
    page.on('console', lambda m: fehler.append('console.' + m.type + ': ' + m.text) if m.type == 'error' else None)
    page.goto(url); page.wait_for_timeout(1500)
    page.evaluate("(id) => Rennspiel.spiel.rennenStarten({ modus: 'solo', streckeId: id, autoIds: ['troc-cabrio', 'multivan'], runden: 3, gegner: 2, schwierigkeit: 'mittel', fahrhilfe: ['wenig', 'wenig'] })", sid)
    page.wait_for_timeout(1200)
    g = page.evaluate('(() => { const st = Rennspiel.spiel.strecke; return st.gabelungen.map(g => ({ s0: g.s0, s1: g.s1, L: g.L, P: g.P })); })()')[0]
    snap = lambda name: page.screenshot(path=os.path.join(out, praefix + sid + '_' + name + '.png'))
    s0, s1, P = g['s0'], g['s1'], g['P']
    def kam(js, arg):
        page.evaluate(KAMERA, page.evaluate(js, arg)); page.wait_for_timeout(700)
    ergebnis = {'strecke': sid, 'gabel': g}
    # Fahrersicht
    for name, (s, ast, hinter, hoch, vor) in {
        '1_fahrer_vor_teilung': (s0 - 70, 0, 9, 3.2, 40),
        '2_fahrer_y_spitze': (s0 + 10, 0, 9, 3.2, 40),
        '3_fahrer_teilung': (s0 + P * 0.7, 0, 9, 3.2, 40),
        '4_fahrer_linker_ast': (s0 + P + 30, -1, 9, 3.0, 40),
        '5_fahrer_rechter_ast': (s0 + P + 30, 1, 9, 3.0, 40),
        '6_fahrer_zusammenfuehrung': (s1 - P * 0.6, 1, 9, 3.2, 45),
        '7_fahrer_nach_zusammenfuehrung': (s1 + 8, 0, 9, 3.2, 40),
    }.items():
        arg = [s, ast, hinter, hoch, vor]
        page.evaluate(KAMERA, page.evaluate(FAHRER, arg)); page.wait_for_timeout(900)
        snap(name)
    # Vogelperspektive
    mitte = (s0 + s1) / 2
    for name, arg in {'8_vogel_senkrecht': [mitte, 260, 0, 0], '9_vogel_schraeg': [s0 - 10, 90, 110, 0],
                      '10_vogel_nase': [s0 + 40, 70, 45, 22], '11_vogel_ende': [s1 - 40, 70, -45, 22],
                      '13_oben_nase': [s0 + 8, 45, 0, 0], '14_oben_ende': [s1 - 8, 45, 0, 0]}.items():
        page.evaluate(KAMERA, page.evaluate(OBEN, arg)); page.wait_for_timeout(900)
        snap(name)
    ergebnis['draw'] = page.evaluate(DRAW)
    ergebnis['deko'] = page.evaluate(DEKO_AUF_AST)
    # Minimap (Spielkamera zurück: Seite neu laden wäre teuer – Minimap ist ein DOM-Canvas, bleibt sichtbar)
    m = page.evaluate(MINIMAP)
    ergebnis['minimap'] = m
    if m:
        page.screenshot(path=os.path.join(out, praefix + sid + '_12_minimap.png'), clip={'x': max(0, m['x'] - 6), 'y': max(0, m['y'] - 6), 'width': m['w'] + 12, 'height': m['h'] + 12})
        # vergrößert (Gabel-Ausschnitt) über die Canvas-Pixel
        page.evaluate('''() => { const c = document.querySelector('.hud-minimap'); const z = document.createElement('canvas'); z.width = c.width * 4; z.height = c.height * 4; const g = z.getContext('2d'); g.imageSmoothingEnabled = false; g.fillStyle = '#9ccf6a'; g.fillRect(0, 0, z.width, z.height); g.drawImage(c, 0, 0, z.width, z.height); window.__mm = z.toDataURL(); }''')
        import base64
        d = page.evaluate('window.__mm').split(',')[1]
        open(os.path.join(out, praefix + sid + '_12b_minimap_gross.png'), 'wb').write(base64.b64decode(d))
    ergebnis['fehler'] = fehler
    page.close()
    return ergebnis

with sync_playwright() as p:
    b = p.chromium.launch(args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
    ids = ['wiese', 'wueste'] if wahl == 'alle' else [wahl]
    rc = 0
    for sid in ids:
        e = lauf(b, sid)
        print(json.dumps(e, ensure_ascii=False))
        if e['fehler'] or not e['minimap'] or e['deko']['aufAstOderInsel'] > 0: rc = 1
    b.close()
    sys.exit(rc)
