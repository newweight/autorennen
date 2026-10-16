#!/usr/bin/env python3
"""W4 (v28): Radunterkante gegen die SICHTBARE Straße (Raycast auf die Straßen-Meshes, nicht hoeheAn). python3 tests/raeder_boden.py strecke [sek]"""
import sys, os, json
from playwright.sync_api import sync_playwright
basis = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
strecke = sys.argv[1]; sek = float(sys.argv[2]) if len(sys.argv) > 2 else 0
url = 'file://' + os.path.join(basis, 'Autorennen.html')
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
JS = '''([strecke, sek]) => { const s = Rennspiel.spiel;
  s.rennenStarten({ modus: 'solo', streckeId: strecke, welt: 'klassisch', schaden: true, gegner: 3, runden: 3, schwierigkeit: 'mittel', autoIds: ['troc-cabrio'], fahrhilfe: ['aus'] });
  s.zeichnen = () => {}; s.uhr.letzte = performance.now(); let t = performance.now();
  for (let k = 0; k < sek * 60; k++) { t += 1000 / 60; s._frameRumpf(t); }
  const cars = new Set(s.fahrzeuge.map(f => f.mesh)); const ziele = [];
  s.szene.children.forEach(c => { if (!cars.has(c)) c.traverse(o => { if (o.isMesh && o.visible) ziele.push(o); }); });
  const rc = new THREE.Raycaster(), out = [];
  s.fahrzeuge.forEach((f, i) => { f.mesh.updateMatrixWorld(true);
    f.mesh.userData.raeder.forEach((r, k) => { const e = r.matrixWorld.elements; const radius = 0.335;
      rc.set(new THREE.Vector3(e[12], e[13] + 2, e[14]), new THREE.Vector3(0, -1, 0)); rc.far = 5;
      const alle = rc.intersectObjects(ziele, false).map(h => (h.object.name || h.object.type) + '@' + h.point.y.toFixed(3)); const hit = rc.intersectObjects(ziele, false).filter(h => !(h.object.userData && h.object.userData.schatten) && h.object.material && !h.object.material.transparent);
      out.push({ i, k, unterkante: +(e[13] - radius).toFixed(3), strasse: hit.length ? +hit[0].point.y.toFixed(3) : null, name: alle.join(' ') }); }); });
  return out; }'''
with sync_playwright() as pw:
    b = pw.chromium.launch(args=ARGS); p = b.new_page(viewport={'width': 400, 'height': 300})
    p.goto(url); p.wait_for_timeout(1000)
    r = p.evaluate(JS, [strecke, sek])
    for x in r: print(x, 'Einsinken(cm)=', None if x['strasse'] is None else round((x['strasse'] - x['unterkante']) * 100, 1))
    b.close()
