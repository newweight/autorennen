#!/usr/bin/env python3
"""S6 Browser-Test Haustier + Kostüm: python3 tests/s6_figur_browser.py [--moto] [--auto]
Garage-Bild (Werkstatt mit Tier/Kostüm), Rennbilder (außen, Cockpit, Sprung), Konsole (jeder Fehler = FEHL). Bilder nach tests/bilder_s6/."""
import os, sys, base64
from playwright.sync_api import sync_playwright
BASIS = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(BASIS, 'tests', 'bilder_s6'); os.makedirs(OUT, exist_ok=True)
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
SPIELE = [s for s, f in (('Autorennen', '--auto'), ('Motorrad', '--moto')) if not (('--auto' in sys.argv or '--moto' in sys.argv) and f not in sys.argv)]
ok = fehl = 0
def pruefe(name, gut, info=''):
    global ok, fehl
    print(('OK   ' if gut else 'FEHL ') + name + (('  (' + str(info) + ')') if info != '' else ''), flush=True)
    if gut: ok += 1
    else: fehl += 1
KOMBIS = [('hund', 'ritter'), ('katze', 'astronaut'), ('hase', 'pirat'), ('papagei', 'superheld'), ('dino', 'dino')]
with sync_playwright() as p:
    for spiel in SPIELE:
        moto = spiel == 'Motorrad'
        b = p.chromium.launch(args=ARGS); pg = b.new_context(viewport={'width': 1100, 'height': 760}).new_page(); fehler = []
        pg.on('pageerror', lambda e: fehler.append('pageerror: ' + str(e)))
        pg.on('console', lambda m: fehler.append('console.error: ' + m.text) if m.type == 'error' and 'GPU stall' not in m.text and 'WebGL' not in m.text and 'favicon' not in m.text else None)
        pg.goto('file://' + os.path.join(BASIS, spiel + '.html')); pg.wait_for_function('window.Rennspiel && Rennspiel.spiel'); pg.wait_for_timeout(1200)
        name = pg.evaluate("Rennspiel.config.fahrerStandard[0]")
        pg.evaluate("""([n]) => { Rennspiel.Garage.gutschreiben(n, 500); Rennspiel.SpassZauber.anSetzen(true); }""", [name])
        # Garage
        pg.evaluate("""([n, pet, kost]) => { const R = Rennspiel; R.SpassZauberFigur.setzen(n, 'pet', pet); R.SpassZauberFigur.setzen(n, 'kost', kost);
          const m = R.spiel.menue; m.garageOeffnen(); const g = m.garageUi; g.fahrer = n; g.autoId = R.spiel.einstellungen.autoIds[0]; g.phase = 'werkstatt'; g.zeile = 0; g.zeichnen(); }""", [name, 'hund', 'ritter'])
        pg.wait_for_timeout(1500)
        pg.screenshot(path=f'{OUT}/{spiel.lower()}_garage_figur.png', timeout=120000)
        txt = pg.evaluate("document.getElementById('garage').innerText")
        pruefe(f'{spiel}: Garage zeigt Haustier- und Kostüm-Zeile', 'Haustier' in txt and 'Kostüm' in txt)
        pg.evaluate("""() => { Rennspiel.spiel.menue.garageUi.schliessen(); }""")
        autos = ['crossmaschine', 'crossmaschine-rot'] if moto else ['porsche-911', 'multivan']
        for pet, kost in KOMBIS:
            pg.evaluate("""([n, pet, kost]) => { const R = Rennspiel; R.SpassZauberFigur.setzen(n, 'pet', pet); R.SpassZauberFigur.setzen(n, 'kost', kost); R.SpassZauberFigur.setzen(n, 'gekauft', [kost]); R.SpassZauberFigur.setzen(n, 'beiwagen', true);
              window.__t = 1000; performance.now = () => window.__t; R.spiel.uhr.letzte = 1000; }""", [name, pet, kost])
            pg.evaluate("""([a, n]) => { const R = Rennspiel, s = R.spiel; s.rennenStarten({ modus: 'solo', streckeId: 'regenbogenland', autoIds: a, runden: 2, gegner: 2, schwierigkeit: 'mittel', fahrhilfe: ['wenig', 'wenig'], tageszeit: 'tag', wetter: 'klar', fahrer: [n, R.config.fahrerStandard[1]] }); window.requestAnimationFrame = () => 0; }""", [autos, name])
            pg.wait_for_timeout(300)
            for modus in ('weit', 'cockpit'):
                d = pg.evaluate("""([modus, moto]) => { const s = Rennspiel.spiel, z0 = s.zeichnen; s.zeichnen = function () {}; let g = 0; window.__t = 5000; s.uhr.letzte = window.__t; s.uhr.rest = 0;
                  while ((s.zustand !== 'rennen' || !s.rennen.gasErlaubt) && g++ < 1200) { window.__t += 1000 / 60; s._frameRumpf(window.__t); }
                  const k = s.kameras[0], f = s.fahrzeuge[0], v = f.vehicle, st = s.strecke;
                  k.modusIndex = Rennspiel.config.kamera.modi.indexOf(modus);
                  const pt = st.spline.punktBei(200), hd = Rennspiel.headingAus(pt.tx, pt.tz); v.setzen(pt.x, pt.z, hd); v.y = st.hoeheAn(pt.x, pt.z); f.index = -1; v.vLaengs = 5; s.autopilot(0, true); s.pausiert = false;
                  for (let i = 0; i < 90; i++) { window.__t += 1000 / 60; s._frameRumpf(window.__t); }
                  s.zeichnen = z0; document.getElementById('ui').style.display = 'none'; for (let i = 0; i < 4; i++) s.zeichnen();
                  const F = f.mesh.userData.zFig; return { png: s.renderer.domElement.toDataURL('image/png'), teile: F ? F.teile.length : -1, modus: k.modus }; }""", [modus, moto])
                open(f'{OUT}/{spiel.lower()}_figur_{pet}_{kost}_{modus}.png', 'wb').write(base64.b64decode(d['png'].split(',')[1]))
                pruefe(f'{spiel} {pet}/{kost} {modus}: Figur angebaut', d['teile'] > 0, {k: d[k] for k in d if k != 'png'})
            pg.evaluate("document.getElementById('ui').style.display = ''")
        st = pg.evaluate("([sp]) => [Rennspiel.SpassSticker.hat(sp, 'haustier'), Rennspiel.SpassSticker.hat(sp, 'kostuem')]", ['motorrad' if moto else 'auto'])
        pruefe(f'{spiel}: Sticker Tierfreund + Verkleidet', st[0] and st[1], st)
        pruefe(f'{spiel}: keine Konsolenfehler', not fehler, fehler[:3])
        b.close()
print(f'\n{ok} OK, {fehl} FEHL')
sys.exit(1 if fehl else 0)
