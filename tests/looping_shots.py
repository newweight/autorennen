#!/usr/bin/env python3
"""v31 H1: Screenshots Looping – Auto fährt rechts (q = +4) in den Looping 1 (Fantasie), Physik wird bei 25° / 70° / 150° eingefroren,
freie Kamera schräg von vorn/seitlich. Bilder: tests/out/v31/looping_<tag>_<grad>.png   (tag = Argument, Standard "nachher")
Aufruf: python3 tests/looping_shots.py [tag]"""
import sys, os
from playwright.sync_api import sync_playwright
basis = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
out = os.path.join(basis, 'tests', 'out', 'v31'); os.makedirs(out, exist_ok=True)
tag = sys.argv[1] if len(sys.argv) > 1 else 'nachher'
url = 'file://' + os.path.join(basis, 'Autorennen.html')
KAMERA = '''([px, py, pz, lx, ly, lz]) => { const s = Rennspiel.spiel, k = s.kameras[0];
  k.update = () => {}; s._loopingKamera = () => {}; k.kamera.far = 3000; k.kamera.updateProjectionMatrix(); k.kamera.up.set(0, 1, 0);
  k.kamera.position.set(px, py, pz); k.kamera.lookAt(lx, ly, lz); }'''
STOPP = '''(ziel) => { const s = Rennspiel.spiel; if (!s._origPhysik) s._origPhysik = s.physikSchritt;
  s.physikSchritt = function (dt) { if (s._eingefroren) return; s._origPhysik.call(s, dt);
    const lp = s.fahrzeuge[0].looping; if (lp.aktiv && lp.winkel >= ziel) s._eingefroren = true; }; s._eingefroren = false; }'''
with sync_playwright() as p:
    b = p.chromium.launch(args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
    page = b.new_page(viewport={'width': 1100, 'height': 700})
    fehler = []; page.on('pageerror', lambda e: fehler.append(str(e)))
    page.goto(url); page.wait_for_timeout(1500)
    page.evaluate("() => Rennspiel.spiel.rennenStarten({ modus: 'solo', streckeId: 'fantasie', welt: 'alles', autoIds: ['troc-cabrio', 'multivan'], runden: 3, gegner: 1, schwierigkeit: 'mittel', fahrhilfe: ['wenig', 'wenig'] })")
    page.wait_for_function("Rennspiel.spiel.rennen.zustand === 'laeuft'", timeout=60000)
    page.add_style_tag(content='#hud, .hud, [id^=hud], canvas ~ div { display: none !important }')
    page.evaluate('''(() => { const s = Rennspiel.spiel; s.fahrzeuge.forEach((f, i) => { if (i > 0) { const p = s.strecke.spline.punktBei(-40 - 10 * i);
      f.vehicle.setzen(p.x, p.z, Rennspiel.headingAus(p.tx, p.tz)); f.driver && (f.driver.steuerung = () => ({ gas: 0, bremse: 1, lenkung: 0 })); } }); })()''')
    for grad in (25, 70, 150):
        page.evaluate('''([s, q]) => { const sp = Rennspiel.spiel.strecke.spline, p = sp.punktBei(s), f = Rennspiel.spiel.fahrzeuge[0];
          const L = Rennspiel.spiel.strecke.loopings[0]; f.looping.aktiv = false; f.vehicle.imLooping = false;
          f.vehicle.setzen(p.x + p.nx * q, p.z + p.nz * q, Rennspiel.headingAus(p.tx, p.tz)); f.index = -1; f.vehicle.vLaengs = 33; Rennspiel.spiel.kameras[0]._erstesMal = true; }''', [170 - 40, 4.0])
        page.evaluate(STOPP, grad * 3.14159265 / 180)
        page.keyboard.down('ArrowUp')
        page.wait_for_function('Rennspiel.spiel._eingefroren === true', timeout=60000)
        page.keyboard.up('ArrowUp')
        info = page.evaluate('''(() => { const s = Rennspiel.spiel, f = s.fahrzeuge[0], lp = f.looping, L = lp.looping, LP = Rennspiel.Looping, w = lp.winkel;
          return { grad: Math.round(w * 180 / Math.PI), qEin: +lp.qEin.toFixed(2), q: +LP.autoQ(L, lp, w).toFixed(2), bandQ: +LP.bandQ(L, w).toFixed(2), bandHalb: L.bandHalb }; })()''')
        print(grad, info)
        # Kamera: von vorn-rechts, leicht erhöht, auf das Auto gerichtet (sieht Band + Auto)
        cam = page.evaluate('''() => { const s = Rennspiel.spiel, st = s.strecke, m = s.fahrzeuge[0].mesh.position, sp = st.spline, L = st.loopings[0], p = sp.punktBei(L.s + 4);
          const px = p.x - p.tx * 14 + p.nx * 16, pz = p.z - p.tz * 10 + p.nz * 16; return [px, m.y + 2.0, pz, m.x, m.y + 0.5, m.z]; }''')
        page.evaluate(KAMERA, cam); page.wait_for_timeout(800)
        page.screenshot(path=os.path.join(out, 'looping_%s_%d.png' % (tag, grad)))
        page.evaluate('(() => { const s = Rennspiel.spiel; s._eingefroren = false; delete s.physikSchritt; s._origPhysik = null; })()')
        page.evaluate('(() => { const f = Rennspiel.spiel.fahrzeuge[0]; f.looping.aktiv = false; f.looping.fallen = false; f.vehicle.imLooping = false; })()')
    print('JS-Fehler:', fehler)
    b.close()
