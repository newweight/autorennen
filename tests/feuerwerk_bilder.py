#!/usr/bin/env python3
"""v29 F5: nur Bilder der Show (Optik-Iteration). Aufruf: python3 tests/feuerwerk_bilder.py [verfolger|cockpit] [zeiten ...] -> tests/out/v29/fwb_<kamera>_<t>s.png"""
import sys, os
from playwright.sync_api import sync_playwright
basis = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
url = 'file://' + os.path.join(basis, 'Autorennen.html')
out = os.path.join(basis, 'tests', 'out', 'v29'); os.makedirs(out, exist_ok=True)
kam = sys.argv[1] if len(sys.argv) > 1 else 'verfolger'
zeiten = [float(x) for x in sys.argv[2:]] or [1.5, 3, 5, 7, 9, 11]
tod = os.environ.get('TAG', 'daemmerung')
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required']
START = """([sid, modus]) => Rennspiel.spiel.rennenStarten({ modus: modus || 'solo', streckeId: sid, autoIds: ['passat', 'multivan'], runden: 1, gegner: 2, schwierigkeit: 'mittel', fahrhilfe: ['wenig', 'wenig'], tempoKlasse: 'normal', tageszeit: '%s' })"""
# Teilnehmer idx fährt kurz vor der Linie los (Checkpoint 0 als nächster, Runde 1 läuft); alle anderen weit zurück und stehend
LAUF = '''(idx) => { const S = Rennspiel.spiel, sp = S.strecke.spline, L = S.strecke.laenge, t = S.rennen.teilnehmer[idx], f = S.fahrzeuge[idx];
  S.fahrzeuge.forEach((g, i) => { if (i !== idx) { const p = sp.punktBei(sp.wrapS(L - 250 - 25 * i)); g.vehicle.setzen(p.x, p.z, Rennspiel.headingAus(p.tx, p.tz)); g.vehicle.vLaengs = 0; g.driver && (g.driver.steuerung = () => ({ gas: 0, bremse: 1, lenkung: 0 })); } });
  const q = sp.punktBei(sp.wrapS(L - 12)); t.gestartet = true; t.naechsterCheckpoint = 0;
  f.vehicle.setzen(q.x, q.z, Rennspiel.headingAus(q.tx, q.tz)); f.vehicle.vLaengs = 38; f.index = -1; if (S.kameras[0]) S.kameras[0]._erstesMal = true; }'''

START = START.replace("tageszeit: '%s'", "tageszeit: '" + tod + "'")
with sync_playwright() as p:
    br = p.chromium.launch(args=ARGS)
    page = br.new_page(viewport={'width': 1024, 'height': 576}); page.set_default_timeout(240000)
    page.goto(url); page.wait_for_timeout(1500)
    page.evaluate('window._fz = 0; (function f() { window._fz++; requestAnimationFrame(f); })()')
    page.evaluate(START, [os.environ.get('STRECKE', 'wiese'), 'solo'])
    page.wait_for_function('Rennspiel.spiel.rennen && Rennspiel.spiel.rennen.zustand === "laeuft"', timeout=120000)
    page.wait_for_function('Rennspiel.spiel.rennen.zeit > 3.2', timeout=120000)
    page.evaluate("() => { const k = Rennspiel.spiel.kameras[0]; for (let i = 0; i < 6 && k.modus !== '%s'; i++) k.naechsterModus(); }" % kam)
    page.evaluate(LAUF, 0)
    page.wait_for_function('Rennspiel.spiel.feuerwerk && Rennspiel.spiel.feuerwerk.aktiv', timeout=60000)
    for t in zeiten:
        page.wait_for_function('Rennspiel.spiel.feuerwerk.t >= %s || !Rennspiel.spiel.feuerwerk.aktiv' % t, timeout=240000)
        page.evaluate("() => { Rennspiel.spiel.pausiert = true; document.querySelectorAll('.overlay').forEach(e => { e.dataset.vor = e.style.display; e.style.display = 'none'; }); }")
        page.evaluate("() => new Promise(r => { let n = 0; (function f() { if (++n > 3) r(); else requestAnimationFrame(f); })(); })")
        page.screenshot(path=os.path.join(out, 'fwb_%s_%gs.png' % (kam, t)))
        page.evaluate("() => { document.querySelectorAll('.overlay').forEach(e => { if (e.dataset.vor !== undefined) e.style.display = e.dataset.vor; }); Rennspiel.spiel.pausiert = false; }")
    print(page.evaluate('() => { const f = Rennspiel.spiel.feuerwerk; return f ? { t: f.t, spitze: f.spitze, geplatzt: f.geplatzt } : null; }'))
    br.close()
