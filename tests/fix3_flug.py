#!/usr/bin/env python3
"""FIX3 Flug-Verzerrung (Playwright, SwiftShader): python3 tests/fix3_flug.py <vorher|nachher> [szenen] [qualitaet]
Szenen: schanze kanone trampolin gleit   Qualität: normal ultra   Bilder nach tests/bilder_fix3/ (Bildfolge je Szene zu einem Streifen zusammengesetzt)
Misst je Bild: Sichtfeld (fov), Kamera-Roll, Tempo-Streifen (Deckkraft/Transform), Flug aktiv – Ergebnis als JSON (tests/bilder_fix3/flug_<tag>.json)."""
import os, sys, json, io
from playwright.sync_api import sync_playwright
from PIL import Image
BASIS = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(BASIS, 'tests', 'bilder_fix3'); os.makedirs(OUT, exist_ok=True)
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
TAG = sys.argv[1] if len(sys.argv) > 1 else 'vorher'
REST = sys.argv[2:]
SZENEN = [a for a in REST if a in ('schanze', 'kanone', 'trampolin', 'gleit')] or ['schanze', 'kanone', 'trampolin', 'gleit']
QUAL = [a for a in REST if a in ('normal', 'ultra')] or ['normal', 'ultra']
MODI = ['verfolger', 'cockpit', 'weit']
STRECKE = {'schanze': 'alpen', 'kanone': 'wiese', 'trampolin': 'wiese', 'gleit': None}
fehler = []; messung = {}

def start(p, qual, strecke, zauber):
    b = p.chromium.launch(args=ARGS); pg = b.new_context(viewport={'width': 900, 'height': 520}).new_page()
    pg.on('pageerror', lambda e: fehler.append('pageerror: ' + str(e)))
    pg.on('console', lambda m: fehler.append('console.error: ' + m.text) if m.type == 'error' and 'GPU stall' not in m.text and 'WebGL' not in m.text and 'favicon' not in m.text else None)
    pg.goto('file://' + os.path.join(BASIS, 'Motorrad.html'), timeout=120000); pg.wait_for_function('window.Rennspiel && Rennspiel.spiel', timeout=120000); pg.wait_for_timeout(1000)
    pg.evaluate("""([q, st, zb]) => { const R = Rennspiel, s = R.spiel; window.__t = 1000; performance.now = () => window.__t; s.uhr.letzte = 1000;
      R.SpassZauber.anSetzen(zb);
      try { s.einstellungen.grafik = q; if (R.Grafik && R.Grafik.setzen) R.Grafik.setzen(q); } catch (e) {}
      s.rennenStarten({ modus: 'solo', streckeId: st, autoIds: ['crossmaschine', 'crossmaschine-rot'], runden: 2, gegner: 1, schwierigkeit: 'mittel', fahrhilfe: ['wenig', 'wenig'], tageszeit: 'tag', wetter: 'klar', spass: true, stunt: 'normal' });
      window.requestAnimationFrame = () => 0; }""", [qual, strecke, zauber])
    pg.wait_for_timeout(600)
    pg.evaluate("""() => { const s = Rennspiel.spiel, z0 = s.zeichnen; s.zeichnen = function () {}; let g = 0; window.__t = 5000; s.uhr.letzte = window.__t; s.uhr.rest = 0;
      while ((s.zustand !== 'rennen' || !s.rennen.gasErlaubt) && g++ < 1500) { window.__t += 1000 / 60; s._frameRumpf(window.__t); } s.zeichnen = z0; }""")
    return b, pg

ORT = """([szene]) => { const R = Rennspiel, s = R.spiel, st = s.strecke; let sB = null, tempo = 30;
  if (szene === 'schanze') { const l = R.Schanzen.liste(st); const L = l.find((e) => e.hoehe >= 1.0) || l[0]; if (L) sB = L.s - 45; tempo = 32; }
  else if (szene === 'kanone' || szene === 'trampolin') { const e = st.spass && st.spass.liste.find((x) => x.art === szene); if (e) { sB = e.s0 - 25; tempo = szene === 'kanone' ? 30 : 38; } }
  else if (szene === 'gleit') { const z = st.spass && st.spass.zauber; if (z && z.schluchten.length) { sB = z.schluchten[0].sT - 60; tempo = 30; } }
  return sB === null ? null : { sB, tempo }; }"""
SETZEN = """([sB, tempo, modus]) => { const R = Rennspiel, s = R.spiel, st = s.strecke, f = s.fahrzeuge[0], v = f.vehicle; const pt = st.spline.punktBei(Math.max(5, sB)), hd = R.headingAus(pt.tx, pt.tz);
  v.setzen(pt.x, pt.z, hd); v.y = st.hoeheAn(pt.x, pt.z); f.index = -1; v.vLaengs = tempo; if (f.flug) { const q = f.flug; q.aktiv = false; q.gleit = null; q.schiene = null; q.pipe = null; }
  s.kameras.forEach((k) => { k.modusIndex = R.config.kamera.modi.indexOf(modus); k._erstesMal = true; });
  s.autopilot(0, true); s.pausiert = false; document.getElementById('ui').style.display = 'none'; }"""
SCHRITT = """([n]) => { const R = Rennspiel, s = R.spiel, f = s.fahrzeuge[0], k = s.kameras[0], e = (n2) => document.getElementById(n2);
  for (let i = 0; i < n; i++) { window.__t += 1000 / 60; s._frameRumpf(window.__t); }
  const fl = f.flug || {}, v = f.vehicle, str = e('g4-streifen'), st = s.strecke;
  return { luft: !!(fl.aktiv || fl.gleit), hoch: +(v.y - st.hoeheAn(v.x, v.z)).toFixed(2), fov: +k.kamera.fov.toFixed(2), aspect: +k.kamera.aspect.toFixed(3), roll: +k.kamera.rotation.z.toFixed(3),
    tA: +(k._tempoAnteil || 0).toFixed(2), blur: str ? (str.style.display === 'none' ? 0 : +str.style.opacity) : -1, streifenT: str ? str.style.transform : '', tempo: Math.round(v.vLaengs), zl: +(s.zeitlupe || (s._zeitlupe && s._zeitlupe.faktor) || 1) }; }"""

# Bild = Spielcanvas + Tempo-Streifen-Ebene (CSS-Deckkraft/Drehung/Skalierung nachgebildet); page.screenshot geht hier nicht (Bildschleife von Hand getrieben)
BILD = """() => { const s = Rennspiel.spiel, c = s.renderer.domElement; s.zeichnen(); const o = document.createElement('canvas'); o.width = c.width; o.height = c.height; const g = o.getContext('2d'); g.drawImage(c, 0, 0);
  const str = document.getElementById('g4-streifen'); if (str && str.style.display !== 'none' && +str.style.opacity > 0) { g.save(); g.globalAlpha = +str.style.opacity; g.translate(o.width / 2, o.height / 2);
    const m = /rotate\\(([-\\d.]+)deg\\) scale\\(([\\d.]+)\\)/.exec(str.style.transform || ''); if (m) { g.rotate(+m[1] * Math.PI / 180); g.scale(+m[2], +m[2]); } g.drawImage(str, -o.width / 2, -o.height / 2, o.width, o.height); g.restore(); }
  return o.toDataURL('image/png'); }"""
def bild(pg):
    import base64
    return Image.open(io.BytesIO(base64.b64decode(pg.evaluate(BILD).split(',')[1]))).convert('RGB')

def streifen(bilder, name):
    if not bilder: return
    w, h = bilder[0].size; sk = 0.5; w2, h2 = int(w * sk), int(h * sk)
    cols = 3; rows = (len(bilder) + cols - 1) // cols
    m = Image.new('RGB', (cols * w2, rows * h2), (0, 0, 0))
    for i, b in enumerate(bilder): m.paste(b.resize((w2, h2)), ((i % cols) * w2, (i // cols) * h2))
    m.save(f'{OUT}/{name}.png'); print('Bild', name, flush=True)

with sync_playwright() as p:
    for qual in QUAL:
        for szene in SZENEN:
            strecke = STRECKE[szene]
            if szene in ('gleit', 'trampolin'):
                pruef = "() => { const z = Rennspiel.spiel.strecke.spass && Rennspiel.spiel.strecke.spass.zauber; return !!(z && z.schluchten.length); }" if szene == 'gleit' else \
                        "() => !!(Rennspiel.spiel.strecke.spass && Rennspiel.spiel.strecke.spass.liste.some((e) => e.art === 'trampolin'))"
                strecke = None
                for cand in ('wiese', 'wueste', 'alpen', 'formel1', 'mond', 'wald', 'dino', 'fantasie', 'regenbogenland', 'unterwasser'):
                    b, pg = start(p, qual, cand, True)
                    if pg.evaluate(pruef): strecke = cand; break
                    b.close()
                if strecke is None: print('keine Strecke fuer', szene); continue
            else:
                b, pg = start(p, qual, strecke, False)
            ort = pg.evaluate(ORT, [szene])
            print(qual, szene, strecke, ort, flush=True)
            if not ort: b.close(); continue
            for modus in MODI:
                pg.evaluate(SETZEN, [ort['sB'], ort['tempo'], modus])
                reihe = []; bilder = []; schon = 0; luftN = 0
                for i in range(260):
                    r = pg.evaluate(SCHRITT, [3]); r['i'] = i; reihe.append(r)
                    if r['luft']:
                        luftN += 1
                        if luftN % 9 == 1 and len(bilder) < 6: bilder.append(bild(pg))
                    elif luftN > 0 and len(bilder) < 6 and i % 3 == 0 and not r['luft'] and schon == 0: bilder.append(bild(pg)); schon = 1
                    if luftN > 0 and not r['luft'] and i > 20 and schon: break
                messung[f'{qual}_{szene}_{modus}'] = reihe
                luft = [r for r in reihe if r['luft']]
                print('  ', modus, 'Luft-Bilder', len(luft), 'fov', sorted({r['fov'] for r in reihe}), 'roll max', max([abs(r['roll']) for r in reihe] or [0]), 'blur max in Luft', max([r['blur'] for r in luft] or [0]), flush=True)
                streifen(bilder, f'{TAG}_{qual}_{szene}_{modus}')
            b.close()
json.dump(messung, open(f'{OUT}/flug_{TAG}.json', 'w'))
print('Konsolenfehler:', fehler[:5])
