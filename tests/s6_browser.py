#!/usr/bin/env python3
"""S6 Browser-Rauchtest + Bilder (Playwright, Headless/SwiftShader): python3 tests/s6_browser.py [--moto] [--auto] [--nur strecke]
Je Spiel × Strecke: Fahrzeug vor Magnet-Röhre / Schlucht / Schiene / Wand / Kristall setzen, mit Autopilot fahren, Bilder nach tests/bilder_s6/,
Draw-Calls mit und ohne Fahr-Zauber, Konsole (jeder Fehler = FEHL)."""
import os, sys, json, base64
from playwright.sync_api import sync_playwright

BASIS = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(BASIS, 'tests', 'bilder_s6'); os.makedirs(OUT, exist_ok=True)
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
nur = sys.argv[sys.argv.index('--nur') + 1] if '--nur' in sys.argv else None
SPIELE = [s for s, f in (('Autorennen', '--auto'), ('Motorrad', '--moto')) if not (('--auto' in sys.argv or '--moto' in sys.argv) and f not in sys.argv)]
STRECKEN = ['alpen', 'formel1', 'regenbogenland', 'mond']
ok = fehl = 0
def pruefe(name, gut, info=''):
    global ok, fehl
    print(('OK   ' if gut else 'FEHL ') + name + (('  (' + str(info) + ')') if info != '' else ''), flush=True)
    if gut: ok += 1
    else: fehl += 1
SEED = "(() => { let a = 123456789; Math.random = () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; })();"

def lauf(p, spiel, strecke, zauber):
    moto = spiel == 'Motorrad'
    b = p.chromium.launch(args=ARGS); ctx = b.new_context(viewport={'width': 960, 'height': 540}); ctx.add_init_script(SEED)
    pg = ctx.new_page(); fehler = []
    pg.on('pageerror', lambda e: fehler.append('pageerror: ' + str(e)))
    pg.on('console', lambda m: fehler.append('console.error: ' + m.text) if m.type == 'error' and 'GPU stall' not in m.text and 'WebGL' not in m.text and 'favicon' not in m.text else None)
    pg.goto('file://' + os.path.join(BASIS, spiel + '.html')); pg.wait_for_function('window.Rennspiel && Rennspiel.spiel'); pg.wait_for_timeout(1200)
    autos = ['crossmaschine', 'crossmaschine-rot'] if moto else ['porsche-911', 'multivan']
    pg.evaluate("""([a, st, zb]) => { window.__t = 1000; performance.now = () => window.__t; Rennspiel.spiel.uhr.letzte = window.__t;
      Rennspiel.SpassZauber.anSetzen(zb);
      Rennspiel.spiel.rennenStarten({ modus: 'solo', streckeId: st, autoIds: a, runden: 2, gegner: 3, schwierigkeit: 'mittel', fahrhilfe: ['wenig', 'wenig'], tageszeit: 'tag', wetter: 'klar', spass: true });
      window.requestAnimationFrame = () => 0; }""", [autos, strecke, zauber])
    pg.wait_for_timeout(500)
    pg.evaluate("""() => { const s = Rennspiel.spiel, z0 = s.zeichnen; s.zeichnen = function () {}; let g = 0; window.__t = 5000; s.uhr.letzte = window.__t; s.uhr.rest = 0;
      while ((s.zustand !== 'rennen' || !s.rennen.gasErlaubt) && g++ < 1200) { window.__t += 1000 / 60; s._frameRumpf(window.__t); }
      s.zeichnen = z0; }""")
    info = pg.evaluate("""() => { const s = Rennspiel.spiel, st = s.strecke, z = st.spass && st.spass.zauber; return { laenge: Math.round(st.spline.laenge), zauber: !!z,
      magnet: z ? z.magnet.map(e => ({ s: e.s0, l: e.laenge })) : [], schlucht: z ? z.schluchten.map(e => ({ sT: e.sT, sL: e.sL })) : [],
      schiene: z ? z.schienen.map(e => ({ s: e.s0, art: e.art, l: e.laenge })) : [], extras: z ? z.extras.map(e => ({ s: st.spline.naechster(e.x, e.z).s, art: e.art })) : [],
      gruppe: !!s.zauberGruppe }; }""")
    ansichten = []
    if info['magnet']: ansichten += [('magnet_ein', info['magnet'][0]['s'] - 25, 25, 100), ('magnet_mitte', info['magnet'][0]['s'] - 25, 25, 250), ('magnet_decke', info['magnet'][0]['s'] - 25, 25, 330)]
    if info['schlucht']: ansichten += [('schlucht_vor', info['schlucht'][0]['sT'] - 60, 30, 60), ('schlucht_gleit', info['schlucht'][0]['sT'] - 60, 30, 120), ('schlucht_gleit2', info['schlucht'][0]['sT'] - 60, 30, 140)]
    for e in info['schiene'][:2]: ansichten += [(e['art'] + '_vor', e['s'] - 25, 18, 30), (e['art'] + '_fahrt', e['s'] - 25, 18, 90)]
    if info['extras']: ansichten += [('kristall', info['extras'][0]['s'] - 30, 20, 40), ('extra_wirkung', info['extras'][0]['s'] - 12, 20, 120)]
    erg = {}
    for name, s_, tempo, frames in ansichten:
        s_ = max(5, s_)
        d = pg.evaluate("""([s_, tempo, frames]) => { const s = Rennspiel.spiel, st = s.strecke, f = s.fahrzeuge[0], v = f.vehicle, z0 = s.zeichnen;
          const pt = st.spline.punktBei(s_), hd = Rennspiel.headingAus(pt.tx, pt.tz);
          v.setzen(pt.x, pt.z, hd); v.y = st.hoeheAn(pt.x, pt.z); f.index = -1; v.vLaengs = tempo; if (f.flug) { const q = f.flug; q.aktiv = false; q.gleit = null; q.schiene = null; q.pipe = null; if (q.z) { q.z.mag = null; q.z.riese = 0; q.z.mini = 0; q.z.groesse = 1; } }
          if (s.rennen && s.rennen.verfolgungSetzen) s.rennen.verfolgungSetzen(0, pt.x, pt.z);
          s.autopilot(0, true); s.pausiert = false; s.zeichnen = function () {};
          for (let i = 0; i < frames; i++) { window.__t += 1000 / 60; s._frameRumpf(window.__t); }
          s.zeichnen = z0; document.getElementById('ui').style.display = 'none';
          const r = s.renderer; for (let i = 0; i < 4; i++) s.zeichnen(); const png = r.domElement.toDataURL('image/png');
          const fz = f.flug || {}, zz = fz.z || {};
          return { png, calls: r.info.render.calls, mag: !!zz.mag, gleit: !!fz.gleit, schiene: !!fz.schiene, pipe: !!fz.pipe, groesse: +(zz.groesse || 1).toFixed(2), v: Math.round(v.vLaengs) }; }""", [s_, tempo, frames])
        open(f'{OUT}/{spiel.lower()}_{strecke}_{name}.png', 'wb').write(base64.b64decode(d['png'].split(',')[1]))
        erg[name] = {k: d[k] for k in d if k != 'png'}
    b.close()
    return info, erg, fehler

with sync_playwright() as p:
    for spiel in SPIELE:
        for strecke in STRECKEN:
            if nur and strecke != nur: continue
            info, erg, fehler = lauf(p, spiel, strecke, True)
            tag = f'{spiel} {strecke}'
            pruefe(f'{tag}: keine Konsolenfehler', not fehler, fehler[:3])
            pruefe(f'{tag}: Zauber geplant und Szene gebaut', info['zauber'] and info['gruppe'], json.dumps(info)[:200])
            print('     ', json.dumps(erg), flush=True)
            if 'magnet_decke' in erg: pruefe(f'{tag}: Magnet greift', any(erg[k]['mag'] for k in erg if k.startswith('magnet')))
            if 'schlucht_gleit' in erg: pruefe(f'{tag}: Gleiten sichtbar', any(erg[k]['gleit'] for k in erg if k.startswith('schlucht')))
            if strecke == 'regenbogenland':
                i2, e2, f2 = lauf(p, spiel, strecke, False)
                pruefe(f'{tag}: aus: keine Fehler und keine Zauber-Gruppe', not f2 and not i2['gruppe'] and not i2['zauber'])
with open(f'{OUT}/.ok', 'w') as f: f.write('x')
print(f'\n{ok} OK, {fehl} FEHL')
sys.exit(1 if fehl else 0)
