#!/usr/bin/env python3
"""S5 Browser-Rauchtest + Bilder (Playwright, Headless/SwiftShader): python3 tests/s5_browser.py [--nur mond] [--moto] [--auto] [--stufe normal|ultra]
Je Spiel (Autorennen/Motorrad) × Welt (Mond, Unterwasser, Regenbogenland, Dino mit Begleiter) × Stufe (Normal, Ultra): Rennen starten, Fahrzeug an feste
Stellen setzen, ein paar Sekunden fahren, Bild nach tests/bilder_s5/. Dazu Draw-Calls (renderer.info) Normal je Strecke inkl. der bestehenden (Vergleich) und die Konsole
(jeder Fehler = FEHL). Ergebnis auch als tests/bilder_s5/ergebnis.json."""
import os, sys, json, time, base64
from playwright.sync_api import sync_playwright

BASIS = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(BASIS, 'tests', 'bilder_s5'); os.makedirs(OUT, exist_ok=True)
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
nur = sys.argv[sys.argv.index('--nur') + 1] if '--nur' in sys.argv else None
SPIELE = [s for s, f in (('Autorennen', '--auto'), ('Motorrad', '--moto')) if not (('--auto' in sys.argv or '--moto' in sys.argv) and f not in sys.argv)]
STUFEN = [sys.argv[sys.argv.index('--stufe') + 1]] if '--stufe' in sys.argv else ['normal', 'ultra']
ok = fehl = 0
ergebnis = {'draw_calls': {}, 'fehler': []}
def pruefe(name, gut, info=''):
    global ok, fehl
    print(('OK   ' if gut else 'FEHL ') + name + (('  (' + str(info) + ')') if info != '' else ''), flush=True)
    if gut: ok += 1
    else: fehl += 1

# Ansichten je Strecke: (Name, Position s in m oder 'tor' / 'tor2', Tempo)
ANSICHTEN = {
    'mond': [('start', 40, 0), ('huepfer', 420, 30), ('krater', 900, 30), ('tor', 'tor', 25)],
    'unterwasser': [('draussen', 150, 25), ('tunnel', 620, 30), ('tunnel2', 1600, 30)],
    'regenbogenland': [('fahrt', 300, 30), ('tor', 'tor', 25)],
    'dino': [('begleiter', 500, 35)],
    'wiese': [('spur', 600, 32)],
}
SEED = "(() => { let a = 123456789; Math.random = () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; })();"

def lauf(p, spiel, strecke, stufe, ansichten, extra=''):
    moto = spiel == 'Motorrad'
    b = p.chromium.launch(args=ARGS); ctx = b.new_context(viewport={'width': 960, 'height': 540}); ctx.add_init_script(SEED)
    pg = ctx.new_page(); fehler = []
    pg.on('pageerror', lambda e: fehler.append('pageerror: ' + str(e)))
    pg.on('console', lambda m: fehler.append('console.error: ' + m.text) if m.type == 'error' and 'GPU stall' not in m.text and 'WebGL' not in m.text and 'favicon' not in m.text else None)
    pg.goto('file://' + os.path.join(BASIS, spiel + '.html')); pg.wait_for_function('window.Rennspiel && Rennspiel.spiel'); pg.wait_for_timeout(1200)
    if stufe != 'normal': pg.evaluate('(s) => Rennspiel.Grafik.setzen(s)', stufe)
    autos = ['crossmaschine', 'crossmaschine-rot'] if moto else ['porsche-911', 'multivan']
    pg.evaluate("""([a, st, extra]) => { window.__t = 1000; performance.now = () => window.__t; Rennspiel.spiel.uhr.letzte = window.__t;
      if (extra) { try { eval(extra); } catch (e) { console.error('extra: ' + e); } }
      Rennspiel.spiel.rennenStarten({ modus: 'solo', streckeId: st, autoIds: a, runden: 2, gegner: 3, schwierigkeit: 'mittel', fahrhilfe: ['wenig', 'wenig'], tageszeit: 'tag', wetter: 'klar' });
      window.requestAnimationFrame = () => 0; }""", [autos, strecke, extra])
    pg.wait_for_timeout(500)
    pg.evaluate("""() => { const s = Rennspiel.spiel, z0 = s.zeichnen; s.zeichnen = function () {}; let g = 0; window.__t = 5000; s.uhr.letzte = window.__t; s.uhr.rest = 0;
      while ((s.zustand !== 'rennen' || !s.rennen.gasErlaubt) && g++ < 1200) { window.__t += 1000 / 60; s._frameRumpf(window.__t); }
      s.zeichnen = z0; }""")
    info = pg.evaluate("""() => { const s = Rennspiel.spiel, st = s.strecke; return { laenge: Math.round(st.spline.laenge), tore: (st.spass && st.spass.tore || []).map(t => ({ sT: t.sT, sB: t.sB })),
      szeneKinder: s.szene.children.length, welt: !!s.welt3D, dino: !!s.dinoBegleiter, tunnel: (st.katalog && st.katalog.glasTunnel) || null }; }""")
    erg = {}
    for name, pos, tempo in ansichten:
        s_ = pos
        if pos in ('tor', 'tor2'):
            if not info['tore']: continue
            s_ = max(5, info['tore'][0]['sT'] - 95)
        frames = 150
        d = pg.evaluate("""([s_, tempo, moto, frames]) => { const s = Rennspiel.spiel, st = s.strecke, f = s.fahrzeuge[0], v = f.vehicle, z0 = s.zeichnen;
          const pt = st.spline.punktBei(s_), hd = Rennspiel.headingAus(pt.tx, pt.tz);
          if (s_ > 60) { v.setzen(pt.x, pt.z, hd); v.y = st.hoeheAn(pt.x, pt.z); f.index = -1; v.vLaengs = tempo; if (s.rennen && s.rennen.verfolgungSetzen) s.rennen.verfolgungSetzen(0, pt.x, pt.z); }
          s.autopilot(0, true); s.pausiert = false;
          s.zeichnen = function () {};
          for (let i = 0; i < frames; i++) { window.__t += 1000 / 60; s._frameRumpf(window.__t); }
          s.zeichnen = z0; document.getElementById('ui').style.display = 'none';
          const r = s.renderer, bild = () => { s.zeichnen(); return r.domElement.toDataURL('image/png'); };
          for (let i = 0; i < 6; i++) s.zeichnen();
          const png = bild(); const i1 = r.info;
          return { png, calls: i1.render.calls, tris: i1.render.triangles, v: Math.round(v.vLaengs), y: +v.y.toFixed(1), flug: !!(f.flug && f.flug.aktiv), huepf: (f.flug && f.flug.huepfN) || 0, tele: (f.flug && f.flug.tele && f.flug.tele.n) || 0 }; }""", [s_, tempo, moto, frames])
        pfad = f'{OUT}/{spiel.lower()}_{strecke}_{stufe}_{name}.png'
        open(pfad, 'wb').write(base64.b64decode(d['png'].split(',')[1]))
        erg[name] = {k: d[k] for k in d if k != 'png'}
    b.close()
    return info, erg, fehler

with sync_playwright() as p:
    for spiel in SPIELE:
        for strecke in ['mond', 'unterwasser', 'regenbogenland', 'dino'] + (['wiese'] if nur == 'wiese' else []):
            if nur and strecke != nur: continue
            for stufe in STUFEN:
                extra = "localStorage.setItem('rennspiel.spass.welten." + ('motorrad' if spiel == 'Motorrad' else 'auto') + "', JSON.stringify({spur:" + ('true' if stufe == 'ultra' or strecke == 'wiese' else 'false') + ",dino:'dino'}));" if True else ''
                info, erg, fehler = lauf(p, spiel, strecke, stufe, ANSICHTEN[strecke], extra)
                tag = f'{spiel} {strecke} {stufe}'
                pruefe(f'{tag}: keine Konsolenfehler', not fehler, fehler[:3])
                ergebnis['fehler'] += fehler
                if strecke in ('mond', 'unterwasser'): pruefe(f'{tag}: Welt-Gruppe gebaut', info['welt'])
                if strecke == 'dino': pruefe(f'{tag}: Dino-Begleiter gebaut', info['dino'])
                print('     ', json.dumps(info), json.dumps(erg), flush=True)
                ergebnis['draw_calls'][tag] = {k: v['calls'] for k, v in erg.items()}
    json.dump(ergebnis, open(f'{OUT}/ergebnis.json', 'w'), indent=1)
print(f'\n{ok} OK, {fehl} FEHL')
sys.exit(1 if fehl else 0)
