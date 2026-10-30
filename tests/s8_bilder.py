#!/usr/bin/env python3
"""S8 Bilder (Playwright, SwiftShader): python3 tests/s8_bilder.py [teil ...]   Teile: hund mini ring spiegel qualm felder garage lobby
Bilder nach tests/bilder_s8/ (Rennbild je Fix: Hund im Dachkorb, Mini-Kamera, Alpen-Ring, Spiegel Zweispieler, Qualm, Schlamm/Wasser/Kisten, Garage-Tuning)."""
import os, sys, base64
from playwright.sync_api import sync_playwright
BASIS = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(BASIS, 'tests', 'bilder_s8'); os.makedirs(OUT, exist_ok=True)
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
TEILE = [a for a in sys.argv[1:] if not a.startswith('-')] or ['hund', 'mini', 'ring', 'spiegel', 'qualm', 'felder', 'garage']
fehler = []
def seite(p, spiel, w=1100, h=760):
    b = p.chromium.launch(args=ARGS); pg = b.new_context(viewport={'width': w, 'height': h}).new_page()
    pg.on('pageerror', lambda e: fehler.append('pageerror: ' + str(e)))
    pg.on('console', lambda m: fehler.append('console.error: ' + m.text) if m.type == 'error' and 'GPU stall' not in m.text and 'WebGL' not in m.text and 'favicon' not in m.text else None)
    pg.goto('file://' + os.path.join(BASIS, spiel + '.html'), timeout=120000); pg.wait_for_function('window.Rennspiel && Rennspiel.spiel', timeout=120000); pg.wait_for_timeout(1200)
    return b, pg
START = """([opt]) => { const R = Rennspiel, s = R.spiel; window.__t = 1000; performance.now = () => window.__t; s.uhr.letzte = 1000;
  s.rennenStarten(Object.assign({ modus: 'solo', runden: 2, gegner: 1, schwierigkeit: 'mittel', fahrhilfe: ['wenig', 'wenig'] }, opt)); }"""
# Fahrzeug 0 bei s (Bogenlänge) hinstellen, ein paar Bilder laufen lassen, dann sauber rendern (UI aus) und als PNG zurück
SZENE = """([modus, sB, q, v, n, dx]) => { const s = Rennspiel.spiel, z0 = s.zeichnen; s.zeichnen = function () {}; let g = 0; window.__t = 5000; s.uhr.letzte = window.__t; s.uhr.rest = 0;
  while ((s.zustand !== 'rennen' || !s.rennen.gasErlaubt) && g++ < 1500) { window.__t += 1000 / 60; s._frameRumpf(window.__t); }
  const k = s.kameras[0], f = s.fahrzeuge[0], vv = f.vehicle, st = s.strecke, sp = st.spline;
  if (modus) k.modusIndex = Rennspiel.config.kamera.modi.indexOf(modus);
  const pt = sp.punktBei(sB), x = pt.x + pt.nx * (q || 0), zz = pt.z + pt.nz * (q || 0);
  vv.setzen(x, zz, Rennspiel.headingAus(pt.tx, pt.tz)); vv.y = st.hoeheAn(x, zz); f.index = sp.indexBei(sB); f.nah = sp.naechster(x, zz, f.index); vv.vLaengs = v || 5;
  s.autopilot(0, true); s.pausiert = false; s.kameras.forEach((c) => { c._erstesMal = true; c.update(0.0167); });
  for (let i = 0; i < (n || 90); i++) { window.__t += 1000 / 60; s._frameRumpf(window.__t); }
  s.zeichnen = z0; document.getElementById('ui').style.display = 'none'; for (let i = 0; i < 4; i++) s.zeichnen();
  const out = { png: s.renderer.domElement.toDataURL('image/png'), modus: k.modus, calls: s.renderer.info.render.calls };
  if (dx) Object.assign(out, eval(dx)); document.getElementById('ui').style.display = ''; return out; }"""
def speichern(d, name):
    open(f'{OUT}/{name}.png', 'wb').write(base64.b64decode(d['png'].split(',')[1])); print('Bild', name, {k: d[k] for k in d if k != 'png'}, flush=True)

with sync_playwright() as p:
    if 'hund' in TEILE or 'mini' in TEILE:
        b, pg = seite(p, 'Autorennen'); name = pg.evaluate("Rennspiel.config.fahrerStandard[0]")
        pg.evaluate("""([n]) => { const R = Rennspiel; R.Garage.gutschreiben(n, 500); R.SpassZauber.anSetzen(true); R.SpassZauberFigur.setzen(n, 'pet', 'hund'); R.SpassZauberFigur.setzen(n, 'kost', 'ritter'); R.SpassZauberFigur.setzen(n, 'gekauft', ['ritter']); }""", [name])
        pg.evaluate(START, [{'streckeId': 'wiese', 'autoIds': ['porsche-911', 'multivan'], 'spass': True}])
        if 'hund' in TEILE:
            for modus in ('weit', 'verfolger'):
                speichern(pg.evaluate(SZENE, [modus, 200, 0, 5, 90, None]), f'hund_dachkorb_{modus}')
        if 'mini' in TEILE:
            for modus in ('verfolger', 'weit'):
                pg.evaluate("() => { const f = Rennspiel.spiel.fahrzeuge[0]; if (f.flug && f.flug.z) f.flug.z.groesse = 0.5; }")
                speichern(pg.evaluate(SZENE, [modus, 200, 0, 5, 120, "({ sk: Rennspiel.spiel.fahrzeuge[0]._zSk })"]), f'mini_kamera_{modus}')
            pg.evaluate("() => { const f = Rennspiel.spiel.fahrzeuge[0]; if (f.flug && f.flug.z) f.flug.z.groesse = 1; }")
            speichern(pg.evaluate(SZENE, ['verfolger', 200, 0, 5, 120, "({ sk: Rennspiel.spiel.fahrzeuge[0]._zSk })"]), 'mini_vergleich_normal_verfolger')
        b.close()
    if 'ring' in TEILE:
        b, pg = seite(p, 'Motorrad')
        pg.evaluate("Rennspiel.SpassZauber.anSetzen(true)")
        pg.evaluate(START, [{'streckeId': 'alpen', 'autoIds': ['crossmaschine', 'crossmaschine-rot'], 'spass': True}])
        sB = pg.evaluate("""() => { const st = Rennspiel.spiel.strecke, d = Rennspiel.Moto.stuntWelt.stuntDaten(st), r = d.ringe[0], sp = st.spline; let b = 0, bd = 1e9;
          for (let s = 0; s < sp.laenge; s += 1) { const q = sp.punktBei(s), dd = Math.hypot(q.x - r.x, q.z - r.z); if (dd < bd) { bd = dd; b = s; } } return b; }""")
        for modus, dist in (('verfolger', 14), ('weit', 12)):
            speichern(pg.evaluate(SZENE, [modus, sB - dist, 0, 8, 12, None]), f'alpen_ring_{modus}')
        b.close()
    if 'spiegel' in TEILE:
        b, pg = seite(p, 'Motorrad', 1100, 700)
        pg.evaluate(START, [{'modus': 'zwei', 'streckeId': 'wiese', 'autoIds': ['crossmaschine', 'crossmaschine-rot'], 'gegner': 2, 'fahrer': ['Senna', 'Verstappen'], 'fahrhilfe': ['wenig', 'wenig']}])
        pg.evaluate("""() => { const s = Rennspiel.spiel; window.__t = 5000; s.uhr.letzte = window.__t; s.uhr.rest = 0; let g = 0; while ((s.zustand !== 'rennen' || !s.rennen.gasErlaubt) && g++ < 1500) { window.__t += 1000 / 60; s._frameRumpf(window.__t); }
          s.kameras.forEach((k) => { k.modusIndex = Rennspiel.config.kamera.modi.indexOf('cockpit'); }); s.autopilot(0, true); s.autopilot(1, true); for (let i = 0; i < 120; i++) { window.__t += 1000 / 60; s._frameRumpf(window.__t); } }""")
        pg.wait_for_timeout(500); pg.screenshot(path=f'{OUT}/spiegel_zweispieler_cockpit.png', timeout=120000); print('Bild spiegel_zweispieler_cockpit', flush=True)
        r = pg.evaluate("""() => Array.from(document.querySelectorAll('.cm-spiegel, [class*=spiegel]')).slice(0, 8).map(e => { const r = e.getBoundingClientRect(); return [e.className, Math.round(r.left), Math.round(r.right), Math.round(r.top), Math.round(r.bottom)]; })""")
        print('Spiegel-Rechtecke', r)
        b.close()
    if 'qualm' in TEILE:
        for spiel, ids, strecke in (('Motorrad', ['crossmaschine', 'crossmaschine-rot'], 'formel1'), ('Motorrad', ['crossmaschine', 'crossmaschine-rot'], 'wiese')):
            for qual in ('normal', 'ultra'):
                b, pg = seite(p, spiel)
                pg.evaluate("([q]) => { try { Rennspiel.spiel.einstellungen.grafik = q; if (Rennspiel.Grafik && Rennspiel.Grafik.setzen) Rennspiel.Grafik.setzen(q); } catch (e) {} }", [qual])
                pg.evaluate(START, [{'streckeId': strecke, 'autoIds': ids, 'unfall': 'normal'}])
                pg.evaluate("() => { const s = Rennspiel.spiel; let g = 0; window.__t = 5000; s.uhr.letzte = 5000; s.uhr.rest = 0; s.zeichnen0 = s.zeichnen; s.zeichnen = function () {}; while ((s.zustand !== 'rennen' || !s.rennen.gasErlaubt) && g++ < 1500) { window.__t += 1000 / 60; s._frameRumpf(window.__t); } s.zeichnen = s.zeichnen0; }")
                pg.evaluate("() => { const u = Rennspiel.spiel.unfall && Rennspiel.spiel.unfall.fz[0]; if (u) { u.zustand = 38; u.gesundheit = 90; } }")
                d = pg.evaluate(SZENE, ['verfolger', 200, 0, 22, 150, "({ qualm: !!(Rennspiel.spiel.unfall && Rennspiel.spiel.unfall.fz[0].qualm), z: Rennspiel.spiel.unfall && Rennspiel.spiel.unfall.fz[0].zustand })"])
                speichern(d, f'qualm_{strecke}_{qual}')
                b.close()
    if 'felder' in TEILE:
        b, pg = seite(p, 'Motorrad')
        pg.evaluate("Rennspiel.SpassZauber.anSetzen(true)")
        for sid in ('wiese', 'wald'):
            pg.evaluate(START, [{'streckeId': sid, 'autoIds': ['crossmaschine', 'crossmaschine-rot'], 'spass': True, 'gegner': 1}])
            plan = pg.evaluate("() => { const s8 = Rennspiel.spiel.strecke.spass && Rennspiel.spiel.strecke.spass.s8; return s8 ? { felder: s8.felder, kisten: s8.kisten.slice(0, 2) } : null; }")
            print(sid, 'Plan', plan, flush=True)
            if not plan: continue
            for f in plan['felder'][:2]:
                speichern(pg.evaluate(SZENE, ['verfolger', f['s0'] - 16, (f['q0'] + f['q1']) / 2, 12, 60, "({ tempo: Rennspiel.spiel.fahrzeuge[0].vehicle.tempoKmh })"]), f'feld_{sid}_{f["art"]}')
            if plan['kisten']:
                k = plan['kisten'][0]
                speichern(pg.evaluate(SZENE, ['verfolger', k['s'] - 10, k['q'], 8, 60, None]), f'kisten_{sid}')
        b.close()
    if 'garage' in TEILE:
        b, pg = seite(p, 'Motorrad', 1200, 760); name = pg.evaluate("Rennspiel.config.fahrerStandard[0]")
        pg.evaluate("""([n]) => { const R = Rennspiel; R.Garage.gutschreiben(n, 900); R.SpassTuning.kaufen(n, R.spiel.einstellungen.autoIds[0], 'motor');
          const m = R.spiel.menue; m.garageOeffnen(); const g = m.garageUi; g.fahrer = n; g.autoId = R.spiel.einstellungen.autoIds[0]; g.phase = 'tuning'; g.tuningZeile = 0; g.zeichnen(); }""", [name])
        pg.wait_for_timeout(1500); pg.screenshot(path=f'{OUT}/garage_tuning_gesamt.png', timeout=120000); print('Bild garage_tuning_gesamt', flush=True)
        print(pg.evaluate("(document.querySelector('.g-tuningpanel') || {}).innerText"))
        b.close()
print('Konsolenfehler:', fehler[:5])
