#!/usr/bin/env python3
"""Megastrecke (v22): python3 tests/mega_screenshot.py [ausgabeordner]
Übersicht von oben + Fahrersicht in 4 Zonen (Winter/Schnee, Herbst/Regen, Sommer/Sonne, Nebel); misst Bauzeit, FPS, Draw-Calls.
Ausgabe: tests/out/mega/*.png und messung.json. Playwright/Chromium aus PLAYWRIGHT_BROWSERS_PATH (nichts installieren)."""
import sys, os, json
from playwright.sync_api import sync_playwright

basis = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
url = 'file://' + os.path.join(basis, 'Autorennen.html')
out = sys.argv[1] if len(sys.argv) > 1 else os.path.join(basis, 'tests', 'out', 'mega')
os.makedirs(out, exist_ok=True)

# Seed suchen, der alle vier Wunsch-Zonen enthält
SUCHE = '''(() => { const W = [['winter','schnee'],['herbst','regen'],['sommer','klar'],[null,'nebel']];
  for (let sd = 1; sd < 3000; sd++) { const z = Rennspiel.Mega.zonen(sd); const g = W.map(w => z.findIndex(q => (!w[0] || q.jz === w[0]) && q.wetter === w[1] && q.s1 - q.s0 > 450));
    if (g.every(i => i >= 0)) return { seed: sd, zonen: g.map(i => ({ i, s0: z[i].s0, s1: z[i].s1, jz: z[i].jz, wetter: z[i].wetter, thema: z[i].thema })) }; } return null; })()'''
DRAW = '''(() => { const s = Rennspiel.spiel; return { drawCalls: s.renderer.info.render.calls, dreiecke: s.renderer.info.render.triangles }; })()'''
AUTO = '''(s) => { const S = Rennspiel.spiel, sp = S.strecke.spline, q = sp.punktBei(s), f = S.fahrzeuge[0];
  f.vehicle.setzen(q.x, q.z, Rennspiel.headingAus(q.tx, q.tz)); f.vehicle.vLaengs = 0; f.index = -1; S.kameras[0]._erstesMal = true;
  S.fahrzeuge.forEach((g, i) => { if (i > 0) { const p = sp.punktBei(sp.wrapS(s - 400 - 20 * i)); g.vehicle.setzen(p.x, p.z, Rennspiel.headingAus(p.tx, p.tz)); g.driver && (g.driver.steuerung = () => ({ gas: 0, bremse: 1, lenkung: 0 })); } }); }'''
FPS = '''() => new Promise(res => { let n = 0; const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 > 3000) res(n / ((performance.now() - t0) / 1000)); else requestAnimationFrame(f); }; requestAnimationFrame(f); })'''

with sync_playwright() as p:
    browser = p.chromium.launch(args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
    page = browser.new_page(viewport={'width': 1024, 'height': 576})
    page.set_default_timeout(240000)
    fehler = []
    page.on('pageerror', lambda e: fehler.append(str(e)))
    page.on('console', lambda m: fehler.append('console.' + m.type + ': ' + m.text) if m.type == 'error' else None)
    page.goto(url); page.wait_for_timeout(1500)
    fund = page.evaluate(SUCHE)
    print('Seed', json.dumps(fund))
    # Offline würfelt streckeSzeneBauen den Seed selbst (einstellungenPruefen kennt wetterSeed nicht) → für den Test festlegen
    page.evaluate("(sd) => { const S = Rennspiel.spiel, o = S.streckeSzeneBauen; S.streckeSzeneBauen = function (id) { if (id === 'mega') this.einstellungen.wetterSeed = sd; return o.call(this, id); }; }", fund['seed'])
    bau = page.evaluate("""() => { const t = performance.now(); Rennspiel.spiel.rennenStarten({ modus: 'solo', streckeId: 'mega', autoIds: ['passat', 'multivan'], runden: 1, gegner: 2, schwierigkeit: 'mittel', fahrhilfe: ['wenig', 'wenig'], tempoKlasse: 'normal', wetterSeed: %d }); return performance.now() - t; }""" % fund['seed'])
    page.wait_for_timeout(1500)
    erg = {'seed': fund['seed'], 'bauMs': bau, 'zonen': fund['zonen']}
    erg['seedImSpiel'] = page.evaluate('Rennspiel.spiel._wetterSeed')
    page.wait_for_function('Rennspiel.spiel.rennen.zustand === "laeuft"', timeout=120000)
    page.evaluate('window._fz = 0; (function f() { window._fz++; requestAnimationFrame(f); })()')
    def frames(n=4):
        a = page.evaluate('window._fz'); page.wait_for_function('window._fz >= %d' % (a + n))
    namen = ['winter_schnee', 'herbst_regen', 'sommer_sonne', 'nebel']
    for z, n in zip(fund['zonen'], namen):
        mitte = (z['s0'] + z['s1']) / 2
        page.evaluate(AUTO, mitte); frames(6)
        page.screenshot(path=os.path.join(out, 'zone_%s.png' % n))
        erg['fps_' + n] = page.evaluate(FPS); erg['draw_' + n] = page.evaluate(DRAW)
        print(n, z['jz'], z['wetter'], z['thema'], 'FPS', round(erg['fps_' + n], 1), erg['draw_' + n])
    # Übergang: 40 m vor Zonengrenze
    z = fund['zonen'][0]
    page.evaluate(AUTO, z['s0'] + 10); frames(6)
    page.screenshot(path=os.path.join(out, 'zonengrenze.png'))
    # Übersicht von oben: Kamera hoch über die Strecke
    page.evaluate('''() => { const S = Rennspiel.spiel, st = S.strecke, pk = st.spline.punkte; let x0=1e9,x1=-1e9,z0=1e9,z1=-1e9; pk.forEach(p => { x0=Math.min(x0,p.x); x1=Math.max(x1,p.x); z0=Math.min(z0,p.z); z1=Math.max(z1,p.z); });
      window._uebersicht = { cx: (x0+x1)/2, cz: (z0+z1)/2, w: Math.max(x1-x0, z1-z0) }; S.pausiert = true; document.getElementById('ui').style.display = 'none'; }''')
    ueb = page.evaluate('''() => { const S = Rennspiel.spiel, u = window._uebersicht, cam = S.kameras[0].kamera || S.kameras[0].camera; if (!cam) return 'keine Kamera';
      const T = Rennspiel.THREE || window.THREE; cam.far = 60000; S.szene.fog = null; if (S.wetter) S.wetter.update = function () {}; if (S.wetter && S.wetter.nebel) S.wetter.nebel = 0; S.szene.traverse(o => { if (o.material && o.material.fog) { o.material.fog = false; o.material.needsUpdate = true; } }); cam.position.set(u.cx, u.w * 1.05, u.cz + 1); cam.up.set(0, 0, -1); cam.lookAt(u.cx, 0, u.cz); cam.updateProjectionMatrix();
      S.kameras[0].aktualisieren = function () {}; S.kameras[0].update = function () {}; S.renderer.render(S.szene, cam); return 'ok'; }''')
    print('Übersicht:', ueb)
    frames(2)
    page.screenshot(path=os.path.join(out, 'uebersicht.png'))
    erg['fehler'] = fehler
    json.dump(erg, open(os.path.join(out, 'messung.json'), 'w'), indent=1)
    print('Bau', round(bau), 'ms, Fehler:', fehler)
    browser.close()
