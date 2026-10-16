#!/usr/bin/env python3
"""W6 (v28): Strohballen-Stellen fotografieren (Fahrersicht 60 m davor, Seite der Startseite, Gegenseite). python3 tests/stroh_foto.py tag strecke [welt] [nr]"""
import sys, os, json
from playwright.sync_api import sync_playwright
basis = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
tag = sys.argv[1]; strecke = sys.argv[2]; welt = sys.argv[3] if len(sys.argv) > 3 else 'hindernisse'; nur = int(sys.argv[4]) if len(sys.argv) > 4 and sys.argv[4] != "" else None
aus = os.path.join(basis, 'tests', 'out', 'v28'); os.makedirs(aus, exist_ok=True)
url = 'file://' + os.path.join(basis, 'Autorennen.html')
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
START = '''([strecke, welt, nr, sek]) => { const s = Rennspiel.spiel;
  s.rennenStarten({ modus: 'solo', streckeId: strecke, welt, schaden: false, gegner: 0, runden: 3, schwierigkeit: 'mittel', autoIds: ['troc-cabrio'], fahrhilfe: ['aus'] });
  const st = s.strecke, d = s.dynamik; const stelle = d.strohStellen[nr]; if (!stelle) return null;
  const f = s.fahrzeuge[0], v = f.vehicle, sp = st.spline, p = sp.punktBei(sp.wrapS(stelle.s - 60));
  v.setzen(p.x, p.z, Math.atan2(-p.tx, -p.tz)); v.vLaengs = 0; v.y = st.hoeheAn(p.x, p.z); f.index = -1; f.nah = st.abfrage(p.x, p.z); s._vorherAngleichen(f);
  s.input.steuerung = () => ({ gas: 0, bremse: 1, lenkung: 0 });
  s.zeichnen0 = s.zeichnen; s.zeichnen = () => {}; s.uhr.letzte = performance.now(); let t = performance.now();
  for (let k = 0; k < sek * 60; k++) { t += 1000 / 60; s._frameRumpf(t); }
  s.zeichnen = s.zeichnen0; s.pausiert = true;
  return { n: d.strohStellen.length, s: stelle.s, von: stelle.von, qStart: stelle.qStart, bh: stelle.qStart / stelle.von - 8, ballen: stelle.ballen.length, rand: stelle.randQ, zaunAbstand: st.zaunAbstand, optik: d.felsOptik }; }'''
KAM = '''([nr, art]) => { const s = Rennspiel.spiel, st = s.strecke, d = s.dynamik, e = d.strohStellen[nr], sp = st.spline, g = s, k = s.kameras[0];
  g._freieKamera = true; k.update = function () {};
  const bh = e.qStart / e.von - 8; let a, b, ziel;
  const P = (ds, q, h) => { const p = sp.punktBei(sp.wrapS(e.s + ds)); return [p.x + p.nx * q, st.hoeheAn(p.x + p.nx * q, p.z + p.nz * q) + h, p.z + p.nz * q]; };
  if (art === 'fahrer') { a = P(-60, 0, 1.8); ziel = P(0, 0, 0.8); }
  else if (art === 'nah') { a = P(-18, 0, 1.6); ziel = P(0, 0, 0.8); }
  else if (art === 'start') { a = P(-6, e.von * (bh + 3), 2.2); ziel = P(0, -e.von * bh * 0.5, 0.6); }   // von der Startseite (Ballen kommen von hier) über die Straße
  else if (art === 'startseite') { a = P(-14, -e.von * (bh + 4), 3.0); ziel = P(0, e.von * (bh + 8), 0.8); }  // von der Gegenseite auf die Startstelle
  else if (art === 'gegen') { a = P(-6, -e.von * (bh + 3), 2.2); ziel = P(0, e.von * bh * 0.5, 0.6); }   // von der Zielseite zurück
  else if (art === 'ende' || art === 'seite') { const b = d.alleStrohballen()[0]; if (!b) return false; const nx = b.nx, nz = b.nz, tx = b.tx, tz = b.tz;
    a = art === 'ende' ? [b.x - tx * 5, b.y + 0.5, b.z - tz * 5] : [b.x + nx * 5 * Math.sign(b.q || 1), b.y + 0.6, b.z + nz * 5 * Math.sign(b.q || 1)]; ziel = [b.x, b.y, b.z]; }
  else if (art === 'schraeg' || art === 'schraeg2') { const b = d.alleStrohballen()[0]; if (!b) return false; const sg = art === 'schraeg' ? 1 : -1;
    a = [b.x - b.tx * 3.0 * sg + b.nx * 2.4, b.y + 0.9, b.z - b.tz * 3.0 * sg + b.nz * 2.4]; ziel = [b.x, b.y, b.z]; }
  else if (art === 'oben') { a = P(0, 0, 55); ziel = P(0, 0.01, 0); }
  k.kamera.position.set(a[0], a[1], a[2]); k.kamera.lookAt(ziel[0], ziel[1], ziel[2]); k.kamera.updateMatrixWorld(true); s.zeichnen(); return true; }'''
with sync_playwright() as pw:
    b = pw.chromium.launch(args=ARGS); errs = []
    for nr in ([nur] if nur is not None else [0, 1]):
        p = b.new_page(viewport={'width': 900, 'height': 500}); p.on('pageerror', lambda e: errs.append(str(e)))
        p.goto(url); p.wait_for_timeout(1000)
        info = p.evaluate(START, [strecke, welt, nr, 9.5]); print(strecke, welt, nr, info)
        if not info: p.close(); continue
        for art in (sys.argv[5].split(',') if len(sys.argv) > 5 else ['fahrer', 'nah', 'start', 'startseite', 'gegen', 'oben', 'ende', 'seite']):
            p.evaluate(KAM, [nr, art]); p.wait_for_timeout(350)
            p.screenshot(path=os.path.join(aus, f'stroh_{tag}_{strecke}{nr}_{art}.png'))
        p.close()
    print(errs); b.close()
