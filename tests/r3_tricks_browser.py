#!/usr/bin/env python3
"""R3 – Browser-Prüfung der KI-Tricks (Playwright, SwiftShader): KI-Auto Fassrolle/Schraube, KI-Motorrad Superman/Handstand/Backflip, Schalter aus = kein Trick.
Bilder nach tests/bilder_r3/. Aufruf: python3 tests/r3_tricks_browser.py [Motorrad|Autorennen|beide]"""
import os, sys
from playwright.sync_api import sync_playwright
from PIL import Image
basis = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
bild = os.path.join(basis, 'tests', 'bilder_r3'); os.makedirs(bild, exist_ok=True)
wahl = sys.argv[1] if len(sys.argv) > 1 else 'beide'
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
spiele = [('Autorennen.html', 'passat', 'auto')] if wahl == 'Autorennen' else [('Motorrad.html', 'crossmaschine', 'moto')] if wahl == 'Motorrad' else [('Motorrad.html', 'crossmaschine', 'moto'), ('Autorennen.html', 'passat', 'auto')]
ok = 0; fail = 0
def pruefe(name, gut, info=''):
    global ok, fail
    print(('OK   ' if gut else 'FEHL ') + name + ('  (' + str(info) + ')' if info != '' else ''))
    if gut: ok += 1
    else: fail += 1

def sprung_ki(page):
    """KI (Fahrzeug 1) 40 m vor das Trampolin, bis zum Absprung rechnen; Rückgabe Flugnummer."""
    return page.evaluate("""() => {
      const S = Rennspiel.spiel, st = S.strecke, e = st.spass.liste.find(x => x.art === 'trampolin');
      const p = st.spline.punktBei(e.s0 - 40), f = S.fahrzeuge[1], v = f.vehicle;
      v.setzen(p.x, p.z, Rennspiel.headingAus(p.tx, p.tz)); v.vLaengs = 40; f.index = -1; S._vorherAngleichen(f);
      S.pausiert = false;
      for (let i = 0; i < 900 && !f.flug.aktiv; i++) S.physikSchritt(1 / 60);
      S.pausiert = true; S.uhr.rest = 0;
      return f.flug.fluege;
    }""")

def schritte(page, n):
    return page.evaluate("""(n) => { const S = Rennspiel.spiel; S.pausiert = false; for (let i = 0; i < n; i++) S.physikSchritt(1 / 60); S.pausiert = true; S.uhr.rest = 0; const z = S._t3 && S._t3.fz[1]; return { aktiv: S.fahrzeuge[1].flug.aktiv, art: z && z.trick ? z.trick.art : null, p: z && z.trick ? +(z.trick.t / z.trick.dauer).toFixed(2) : 0 }; }""", n)

def seite(page, name, abstand, hoch, winkel=0.0):
    page.evaluate("""([d, h, w]) => { const S = Rennspiel.spiel, f = S.fahrzeuge[1], m = f.mesh, k = S.kameras[0].kamera;
      const hd = f.vehicle.heading, rx = Math.cos(hd), rz = -Math.sin(hd), bx = Math.sin(hd), bz = Math.cos(hd);
      m.updateMatrixWorld(true); const c = new THREE.Vector3(); c.setFromMatrixPosition(m.matrixWorld);
      k.position.set(c.x + (rx * Math.cos(w) + bx * Math.sin(w)) * d, c.y + h, c.z + (rz * Math.cos(w) + bz * Math.sin(w)) * d); k.lookAt(c.x, c.y + h * 0.8 + 0.2, c.z); k.rotation.z = 0; }""", [abstand, hoch, winkel])
    page.wait_for_timeout(350)
    page.screenshot(path=os.path.join(bild, name))

def blatt(namen, ziel, spalten=3):
    ims = [Image.open(os.path.join(bild, n)) for n in namen]
    w, h = ims[0].size; w2, h2 = w // 2, h // 2
    zeilen = (len(ims) + spalten - 1) // spalten
    bl = Image.new('RGB', (w2 * spalten, h2 * zeilen))
    for i, im in enumerate(ims): bl.paste(im.resize((w2, h2)), ((i % spalten) * w2, (i // spalten) * h2))
    bl.save(os.path.join(bild, ziel))

with sync_playwright() as p:
    b = p.chromium.launch(args=ARGS)
    for html, auto, tag in spiele:
        ctx = b.new_context(viewport={'width': 1000, 'height': 600})
        page = ctx.new_page(); page.set_default_timeout(120000)
        fehlerliste = []
        page.on('pageerror', lambda e: fehlerliste.append('pageerror: ' + str(e)))
        page.on('console', lambda m: fehlerliste.append('console.error: ' + m.text) if m.type == 'error' and 'GPU stall' not in m.text and 'WebGL' not in m.text else None)
        page.goto('file://' + os.path.join(basis, html)); page.wait_for_timeout(2000)
        pruefe(tag + ' Schalter KI-Tricks Standard an', page.evaluate("Rennspiel.SpassTricks.an('ki') === true"))
        page.evaluate("Rennspiel.spiel.rennenStarten({ modus: 'solo', streckeId: '%s', autoIds: ['%s', '%s'], runden: 2, gegner: 1, schwierigkeit: 'unschlagbar', fahrhilfe: ['wenig', 'wenig'], zufall: false, spass: true, geist: false })" % ('formel1' if tag == 'moto' else 'wiese', auto, auto))
        page.wait_for_function('Rennspiel.spiel.rennen.zustand === "laeuft"', timeout=120000)
        page.evaluate("Rennspiel.spiel.autopilot(0, true)")
        page.evaluate("Rennspiel.SpassTricks.anSetzen('zeit', false)")
        page.wait_for_timeout(800)
        gewuenscht = ['superman', 'handstand', 'backflip'] if tag == 'moto' else ['fassrolle', 'schraube']
        gesehen = {}
        for versuch in range(40):
            if all(a in gesehen for a in gewuenscht[:2 if tag == 'moto' else 2]): break
            nr = sprung_ki(page)
            plan = page.evaluate("(() => { const f = Rennspiel.spiel.fahrzeuge[1]; return f._r3 && f._r3.nr === f.flug.fluege ? f._r3.plan : (Rennspiel.SpassTricks._intern.kiPlanFlug(Rennspiel.spiel, 1, f, f.flug.fluege)); })()")
            if not plan or plan['art'] in gesehen:
                page.evaluate("() => { const S = Rennspiel.spiel; S.pausiert = false; for (let i = 0; i < 500 && S.fahrzeuge[1].flug.aktiv; i++) S.physikSchritt(1 / 60); S.pausiert = true; S.uhr.rest = 0; }")
                continue
            art = plan['art']
            # bis kurz nach dem Trickstart rechnen (Start ~ startT + Prüfung)
            st = {'art': None}
            for _ in range(40):
                st = schritte(page, 3)
                if st['art']: break
            if st['art'] != art:
                page.evaluate("() => { const S = Rennspiel.spiel; S.pausiert = false; for (let i = 0; i < 500 && S.fahrzeuge[1].flug.aktiv; i++) S.physikSchritt(1 / 60); S.pausiert = true; S.uhr.rest = 0; }")
                continue
            namen = []
            for k, frames in enumerate([2, 10, 10, 10, 10]):
                schritte(page, frames)
                if tag == 'moto':
                    n = '%s_ki_%s_%d.png' % (tag, art, k); seite(page, n, 4.2, 1.0); namen.append(n)
                else:
                    n = '%s_ki_%s_%d.png' % (tag, art, k); seite(page, n, 7.5, 2.0); namen.append(n)
                    n = '%s_ki_%s_%db.png' % (tag, art, k); seite(page, n, 7.5, 2.0, 1.2); namen.append(n)
            blatt(namen, '%s_ki_%s_folge.png' % (tag, art), 5 if tag == 'moto' else 4)
            z = page.evaluate("(() => { const S = Rennspiel.spiel; S.pausiert = false; for (let i = 0; i < 500 && S.fahrzeuge[1].flug.aktiv; i++) S.physikSchritt(1 / 60); for (let i = 0; i < 6; i++) S.physikSchritt(1 / 60); S.pausiert = true; S.uhr.rest = 0; const z = S._t3.fz[1]; return { stat: z.stat, wackel: !!z.wackel, fehl: z.landeFehler, v: S.fahrzeuge[1].vehicle.vLaengs }; })()")
            gesehen[art] = True
            pruefe(tag + ' KI ' + art + ': fertig gezählt, kein Wackeln/Fehltrick', z['stat'][art] >= 1 and not z['wackel'] and not z['fehl'], z['stat'])
        for a in gewuenscht[:2]:
            pruefe(tag + ' KI zeigt ' + a, a in gesehen)
        # Schalter aus: kein Trick-Zustand der KI
        page.evaluate("Rennspiel.SpassTricks.anSetzen('ki', false)")
        vor = page.evaluate("(Rennspiel.spiel._t3 && Rennspiel.spiel._t3.fz[1]) ? Object.values(Rennspiel.spiel._t3.fz[1].stat).reduce((a, b) => a + b, 0) : 0")
        for _ in range(6):
            sprung_ki(page)
            page.evaluate("() => { const S = Rennspiel.spiel; S.pausiert = false; for (let i = 0; i < 500 && S.fahrzeuge[1].flug.aktiv; i++) S.physikSchritt(1 / 60); S.pausiert = true; S.uhr.rest = 0; }")
        nach = page.evaluate("(Rennspiel.spiel._t3 && Rennspiel.spiel._t3.fz[1]) ? Object.values(Rennspiel.spiel._t3.fz[1].stat).reduce((a, b) => a + b, 0) : 0")
        pruefe(tag + ' Schalter aus: KI macht keine Tricks mehr', nach == vor, '%d → %d' % (vor, nach))
        pruefe(tag + ' keine Seitenfehler', not fehlerliste, fehlerliste[:3])
        ctx.close()
    b.close()
print('\n%d OK, %d FEHL' % (ok, fail))
sys.exit(1 if fail else 0)
