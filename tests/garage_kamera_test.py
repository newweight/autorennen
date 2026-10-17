#!/usr/bin/env python3
"""v29 F4: Kamera beim Ausfahren aus der Werkstatt-Halle. Aufruf: python3 tests/garage_kamera_test.py [vorher|nachher] [strecke]
Auto in der vordersten Box (Schaden 40 %), heilen, losfahren (Variante parallel / schraeg zur Halle gedreht); Bilder Verfolger + Cockpit beim Ausfahren
-> tests/out/v29/garage_kamera_<tag>_<variante>_<kamera>_<n>.png. Prueft: Verfolgerkamera nie in/hinter Hallenwand (Raycast), Lichter/Programme konstant."""
import sys, os, json
from playwright.sync_api import sync_playwright
basis = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
tag = sys.argv[1] if len(sys.argv) > 1 else 'nachher'
sid = sys.argv[2] if len(sys.argv) > 2 else 'wiese'
out = os.path.join(basis, 'tests', 'out', 'v29'); os.makedirs(out, exist_ok=True)
url = 'file://' + os.path.join(basis, 'Autorennen.html')
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
erg = []; ERG = {}
OHNE = len(sys.argv) > 3 and sys.argv[3] == 'ohne'   # Gegenprobe: Ausblenden aus (ausblendMin = 1) = Zustand vorher
def pruefe(n, ok, d=''):
    erg.append(bool(ok)); print(('OK   ' if ok else 'FEHL ') + n + (' - ' + str(d) if d != '' else ''), flush=True)
START = '''([sid]) => { const s = Rennspiel.spiel;
  s.rennenStarten({ modus: 'solo', streckeId: sid, variante: '', welt: 'klassisch', schaden: true, gegner: 0, runden: 5, schwierigkeit: 'mittel',
    autoIds: ['passat', 'multivan'], fahrhilfe: ['aus', 'aus'], tageszeit: 'tag' });
  s.schnellvorlauf(6); if (!s.laeuft) s.start(); s.pausiert = true;
  s._gas = 0; s._lenk = null; s.input.steuerung = (nr) => (nr === 0 ? { gas: s._gas, bremse: 0, lenkung: s._lenk ? s._lenk() : 0 } : { gas: 0, bremse: 0, lenkung: 0 });
  const w = s.werkstatt, t = (w.teile || [w])[0]; return { werk: !!w, s: t.platz.s, seite: t.platz.seite, laenge: t.platz.laenge }; }'''
STELLEN = '''([s0, q, winkel]) => { const g = Rennspiel.spiel, st = g.strecke, p = st.spline.punktBei(s0), f = g.fahrzeuge[0], v = f.vehicle, t = (g.werkstatt.teile || [g.werkstatt])[0];
  const x = p.x + p.nx * q, z = p.z + p.nz * q, seite = t.platz.seite;
  // Blickrichtung: Fahrtrichtung, um winkel (Grad) zur Halle gedreht (Halle = Normale * seite)
  const tx = p.tx, tz = p.tz, nx = p.nx * seite, nz = p.nz * seite, a = winkel * Math.PI / 180;
  const dx = tx * Math.cos(a) + nx * Math.sin(a), dz = tz * Math.cos(a) + nz * Math.sin(a);
  v.setzen(x, z, Math.atan2(-dx, -dz)); v.vLaengs = 0; v.vQuer = 0; v.y = st.hoeheAn(x, z); f.index = -1; f.nah = st.abfrage(x, z); g._vorherAngleichen(f);
  g.kameras[0]._erstesMal = true; return true; }'''
SCHRITTE = '''([sek, gas, hin]) => { const s = Rennspiel.spiel, f = s.fahrzeuge[0], v = f.vehicle, st = s.strecke; s._gas = gas;
  if (hin) { // lenken: Zielrichtung = Streckentangente (leicht zur Strasse)
    s._lenk = () => { const n = st.abfrage(v.x, v.z), p = st.spline.punktBei(n.s); let diff = Math.atan2(-p.tx, -p.tz) - v.heading; while (diff > Math.PI) diff -= 2 * Math.PI; while (diff < -Math.PI) diff += 2 * Math.PI; return Math.max(-1, Math.min(1, -diff * 2)); }; } else s._lenk = null;
  const k = s.kameras[0];
  for (let n = 0; n < Math.round(sek * 60); n++) { s.physikSchritt(1 / 60); const d = f.anzeige; d.x = v.x; d.y = v.y; d.z = v.z; d.heading = v.heading; d.nicken = v.nicken; d.neigung = v.neigung; k.update(1 / 60); }
  s.huds.forEach(h => h.update()); return { v: v.vLaengs, x: v.x, z: v.z }; }'''
KAM = '''([modus]) => { const k = Rennspiel.spiel.kameras[0]; let n = 0; while (k.modus !== modus && n++ < 4) k.naechsterModus(); return k.modus; }'''
# Bildanteil, den die Halle (opake Hallen-Meshes, Opacity > 0,5) verdeckt: Strahlenraster durch das ganze Bild
RAY = '''() => { const s = Rennspiel.spiel, k = s.kameras[0], g = []; s.szene.traverse(o => { if (o.name === 'Werkstatt') g.push(o); });
  const meshes = []; g.forEach(gr => gr.traverse(o => { if (o.isMesh && o.geometry && o.geometry.type === 'BoxGeometry') meshes.push(o); }));
  const alle = []; s.szene.traverse(o => { if (o.isMesh && o.visible && !(o.material && o.material.transparent && o.material.opacity < 0.5)) alle.push(o); });
  const rc = new THREE.Raycaster(); let treffer = 0, n = 0; const vorn = new THREE.Vector2();
  for (let i = 0; i < 16; i++) for (let j = 0; j < 9; j++) { vorn.set(-0.94 + 1.88 * i / 15, -0.9 + 1.8 * j / 8); rc.setFromCamera(vorn, k.kamera); n++;
    const h = rc.intersectObjects(meshes.filter(m => m.material.opacity > 0.5), false); if (h.length && h[0].distance < 60) treffer++; }
  const alpha = meshes.length ? meshes[0].material.opacity : 1;
  return { anteil: +(treffer / n).toFixed(3), alpha: +alpha.toFixed(2) }; }'''
STOPP = '''() => { const s = Rennspiel.spiel; s.uhr.rest = 0; s.pausiert = true; document.querySelectorAll('.hud-banner').forEach(b => { b.className = 'hud-banner'; }); }'''
with sync_playwright() as p:
    br = p.chromium.launch(args=ARGS)
    page = br.new_page(viewport={'width': 1280, 'height': 720}); page.set_default_timeout(240000)
    fehler = []
    page.on('pageerror', lambda e: fehler.append(str(e)))
    page.goto(url); page.wait_for_timeout(1500)
    if OHNE: page.evaluate('() => { Rennspiel.config.werkstatt.ausblendMin = 1; }')
    info = page.evaluate(START, [sid]); pruefe('Werkstatt vorhanden', info['werk'], info)
    P = info
    box = page.evaluate('() => { const w = Rennspiel.spiel.werkstatt, t = (w.teile || [w])[0]; return t.boxMitte(t.platz.boxen - 1); }')
    for var, wink in (('parallel', 0), ('schraeg', 55)):
        for kam in ('verfolger', 'cockpit'):
            page.evaluate(KAM, [kam])
            page.evaluate('() => { const sc = Rennspiel.spiel.schaden; sc.z[0].abkling = 0; sc._punkteSetzen(0, 40); }')
            page.evaluate(STELLEN, [box['s'], box['qs'] * P['seite'], wink])
            page.evaluate(SCHRITTE, [4.5, 0, False])
            pr = page.evaluate('() => Rennspiel.spiel.schaden.zustand(0).prozent'); print(var, kam, 'Schaden nach Heilung', pr)
            mx = 0; ant = []
            for n in range(1, 9):
                r = page.evaluate(SCHRITTE, [0.35, 1, True])
                page.evaluate("() => new Promise(r => { let n = 0; (function f() { if (++n > 6) r(); else requestAnimationFrame(f); })(); })")   # ein paar Bilder, damit das Ausblenden nachkommt
                ray = page.evaluate(RAY); ant.append(ray['anteil'])
                page.evaluate(STOPP); page.wait_for_timeout(350)
                page.screenshot(path=os.path.join(out, 'garage_kamera_%s_%s_%s_%d.png' % (tag, var, kam, n)))
                print(var, kam, n, 'v=%.1f' % r['v'], ray)
            ERG[(var, kam)] = ant
            if not OHNE: pruefe('%s %s: Hallenwand verdeckt hoechstens 10 %% des Bildes (max %.0f %%)' % (var, kam, 100 * max(ant)), max(ant) <= 0.10, ant)
    pruefe('Keine JS-Fehler', not fehler, fehler[:3])
    br.close()
print('Bildanteil Halle:', json.dumps({'%s/%s' % k: v for k, v in ERG.items()}))
print('%d von %d OK' % (sum(erg), len(erg)))
sys.exit(0 if all(erg) else 1)
