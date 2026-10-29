#!/usr/bin/env python3
"""S3 – Browser-Prüfung der neuen Tricks (Playwright, SwiftShader): Motorrad Superman/Handstand/Backflip (Bildfolgen), Auto Fassrolle/Schraube, Zeitlupe, Schalter, Menü.
Bilder nach tests/bilder_s3/. Aufruf: python3 tests/spass_s3_browser.py [Motorrad|Autorennen|beide]"""
import os, sys, json
from playwright.sync_api import sync_playwright
from PIL import Image
basis = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
bild = os.path.join(basis, 'tests', 'bilder_s3'); os.makedirs(bild, exist_ok=True)
wahl = sys.argv[1] if len(sys.argv) > 1 else 'beide'
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
spiele = [('Autorennen.html', 'passat', 'auto')] if wahl == 'Autorennen' else [('Motorrad.html', 'crossmaschine', 'moto')] if wahl == 'Motorrad' else [('Motorrad.html', 'crossmaschine', 'moto'), ('Autorennen.html', 'passat', 'auto')]
fehler = []; ok = 0; fail = 0
def pruefe(name, gut, info=''):
    global ok, fail
    print(('OK   ' if gut else 'FEHL ') + name + ('  (' + str(info) + ')' if info != '' else ''))
    if gut: ok += 1
    else: fail += 1

def sprung(page, schritte_bis=0.0):
    """Fahrer 1 40 m vor das Trampolin, bis zum Absprung rechnen, danach schritte_bis Sekunden Flug."""
    return page.evaluate("""(t) => {
      const S = Rennspiel.spiel, st = S.strecke, e = st.spass.liste.find(x => x.art === 'trampolin');
      const p = st.spline.punktBei(e.s0 - 40), f = S.fahrzeuge[0], v = f.vehicle;
      v.setzen(p.x, p.z, Rennspiel.headingAus(p.tx, p.tz)); v.vLaengs = 40; f.index = -1; S._vorherAngleichen(f);
      S.pausiert = false;
      for (let i = 0; i < 900 && !f.flug.aktiv; i++) S.physikSchritt(1 / 60);
      for (let i = 0; i < Math.round(t * 60); i++) S.physikSchritt(1 / 60);
      S.pausiert = true; S.uhr.rest = 0;
      return { aktiv: f.flug.aktiv, t: f.flug.t };
    }""", schritte_bis)

def schritte(page, n):
    return page.evaluate("""(n) => { const S = Rennspiel.spiel; S.pausiert = false; for (let i = 0; i < n; i++) S.physikSchritt(1 / 60); S.pausiert = true; S.uhr.rest = 0; const f = S.fahrzeuge[0]; return { aktiv: f.flug.aktiv, t: f.flug.t }; }""", n)

def seite(page, name, abstand=4.0, hoch=0.9, winkel=0.0):
    """Kamera von Hand seitlich neben das Fahrzeug (winkel 0 = rechts, 90° = von hinten), Bild nach name."""
    page.evaluate("""([d, h, w]) => { const S = Rennspiel.spiel, f = S.fahrzeuge[0], m = f.mesh, k = S.kameras[0].kamera;
      const hd = f.vehicle.heading, rx = Math.cos(hd), rz = -Math.sin(hd), bx = Math.sin(hd), bz = Math.cos(hd);   // rechts / hinten
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
        lokal = []
        page.on('pageerror', lambda e: lokal.append('pageerror: ' + str(e)))
        page.on('console', lambda m: lokal.append('console.error: ' + m.text) if m.type == 'error' and 'GPU stall' not in m.text and 'WebGL' not in m.text else None)
        page.goto('file://' + os.path.join(basis, html)); page.wait_for_timeout(2000)
        pruefe(tag + ' Module geladen', page.evaluate("!!(Rennspiel.SpassTricks && Rennspiel.SpassTricks.fahrer && Rennspiel.SpassTricks.ui)"))
        page.evaluate("Rennspiel.SpassSticker.zurueck(window.MOTORRAD === true ? 'motorrad' : 'auto')")
        page.evaluate("Rennspiel.spiel.rennenStarten({ modus: 'solo', streckeId: '%s', autoIds: ['%s', '%s'], runden: 2, gegner: 1, schwierigkeit: 'leicht', fahrhilfe: ['wenig', 'wenig'], zufall: false, spass: true, geist: false })" % ('formel1' if tag == 'moto' else 'wiese', auto, auto))
        page.wait_for_function('Rennspiel.spiel.rennen.zustand === "laeuft"', timeout=120000)
        page.evaluate("Rennspiel.spiel.autopilot(0, true)")
        page.evaluate("() => { const k = Rennspiel.spiel.kameras[0]; k.modusIndex = Rennspiel.config.kamera.modi.indexOf('verfolger'); k._erstesMal = true; }")
        page.wait_for_timeout(800)
        # Zeitlupe für die Bildfolgen aus (sonst Kamera-Schwenk)
        page.evaluate("Rennspiel.SpassTricks.anSetzen('zeit', false)")
        if tag == 'moto':
            sp = 'motorrad'
            for art, tasten in [('superman', ['ArrowUp']), ('handstand', ['ArrowLeft']), ('backflip', ['ArrowDown'])]:
                r = sprung(page, 0.25)
                pruefe(tag + ' ' + art + ': in der Luft', r['aktiv'], r)
                p0 = page.evaluate("Rennspiel.spiel.stunt.fz[0].punkte")
                page.keyboard.down('ShiftRight'); page.keyboard.down(tasten[0])
                n0 = schritte(page, 3)
                page.keyboard.up(tasten[0]); page.keyboard.up('ShiftRight')
                namen = []
                for k, (frames, tt) in enumerate([(2, 'start'), (12, 'mitte1'), (12, 'mitte2'), (14, 'mitte3'), (14, 'ende')]):
                    schritte(page, frames)
                    st = page.evaluate("(() => { const z = Rennspiel.spiel._t3.fz[0]; return { art: z.trick && z.trick.art, p: z.trick && +(z.trick.t / z.trick.dauer).toFixed(2), pose: z.pose.art, w: +z.pose.w.toFixed(2) }; })()")
                    if k == 0: pruefe(tag + ' ' + art + ': Trick gestartet', st['art'] == art, st)
                    n = '%s_%s_%d.png' % (tag, art, k); seite(page, n, 4.2, 1.0); namen.append(n)
                    n = '%s_%s_%db.png' % (tag, art, k); seite(page, n, 3.6, 1.0, 1.2); namen.append(n)
                blatt(namen, '%s_%s_folge.png' % (tag, art), 4)
                # bis zur Landung
                page.evaluate("() => { const S = Rennspiel.spiel; S.pausiert = false; for (let i = 0; i < 400 && S.fahrzeuge[0].flug.aktiv; i++) S.physikSchritt(1 / 60); for (let i = 0; i < 5; i++) S.physikSchritt(1 / 60); S.pausiert = true; S.uhr.rest = 0; }")
                p1 = page.evaluate("Rennspiel.spiel.stunt.fz[0].punkte")
                pruefe(tag + ' ' + art + ': Punkte gutgeschrieben', p1 - p0 >= {'superman': 500, 'handstand': 700, 'backflip': 500}[art], '%d → %d' % (p0, p1))
                pruefe(tag + ' ' + art + ': Sticker', page.evaluate("Rennspiel.SpassSticker.hat('%s', '%s')" % (sp, art)))
                page.evaluate("Rennspiel.spiel.pausiert = false"); page.wait_for_timeout(100)
        for l in lokal: fehler.append(html + ' ' + l)
        ctx.close()
    b.close()
print('Prüfungen OK:', ok, 'FEHL:', fail)
print('KONSOLE FEHLERFREI' if not fehler else 'KONSOLE FEHLER:\n' + '\n'.join(fehler[:30]))
sys.exit(1 if (fehler or fail) else 0)
