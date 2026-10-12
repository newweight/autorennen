#!/usr/bin/env python3
"""Bilder der Fantasie-Kreuzung (v14, Kreuzungs-Zaun): zeigt, wo die Bande beim Abbiegen greift und ob dort ein Zaun steht.
Aufruf: python3 tests/kreuzung_zaun_screenshot.py [ausgabeordner]   (Standard tests/out/kreuzzaun)
Bilder: k1_fahrer_a_nach_b (Fahrersicht: Auto steht an der Bande, nachdem es von A auf die Querstraße B abgebogen ist),
        k2_fahrer_b_nach_a (dasselbe von B nach A), k3_vogel (von oben), k4_schraeg (aus der Ecke), k5_fahrer_a_gerade
        (Fahrer auf A geradeaus: Fahrbahn frei, Zaun nur in den Zwickeln), k6_zwickel_nah.
Ausgabe: JSON mit Draw-Calls und Zaun-Zahlen."""
import sys, os, json
from playwright.sync_api import sync_playwright

basis = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
out = sys.argv[1] if len(sys.argv) > 1 else os.path.join(basis, 'tests', 'out', 'kreuzzaun')
os.makedirs(out, exist_ok=True)
url = 'file://' + os.path.join(basis, 'Autorennen.html')

KAMERA_FREI = '''([px, py, pz, lx, ly, lz]) => { const s = Rennspiel.spiel, k = s.kameras[0];
  k.update = () => {}; k.kamera.far = 3000; k.kamera.updateProjectionMatrix();
  k.kamera.position.set(px, py, pz); k.kamera.lookAt(lx, ly, lz); }'''
# Auto 0 an Weltpunkt (x, z) mit Fahrtrichtung (dx, dz) setzen, Index des Abschnitts sK (Index-Kontinuität)
AUTO_SETZEN = '''([x, z, dx, dz, sK]) => { const s = Rennspiel.spiel, st = s.strecke, sp = st.spline, f = s.fahrzeuge[0];
  f.vehicle.setzen(x, z, Rennspiel.headingAus(dx, dz)); f.index = sp.indexBei(sK);
  f.vehicle._bandeIndex = f.index; f.vehicle.y = st.hoeheAn(x, z, f.index); f.vehicle.vLaengs = 0; f.vehicle.vQuer = 0; }'''

with sync_playwright() as p:
    browser = p.chromium.launch(args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
    page = browser.new_page(viewport={'width': 1280, 'height': 800})
    fehler = []
    page.on('pageerror', lambda e: fehler.append(str(e)))
    page.on('console', lambda m: fehler.append('console.' + m.type + ': ' + m.text) if m.type == 'error' else None)
    page.goto(url); page.wait_for_timeout(1500)
    page.evaluate("Rennspiel.spiel.rennenStarten({ modus: 'solo', streckeId: 'fantasie', autoIds: ['troc-cabrio', 'multivan'], runden: 3, gegner: 3, schwierigkeit: 'mittel', fahrhilfe: ['aus', 'aus'] })")
    page.wait_for_function('Rennspiel.spiel.rennen.zustand === "laeuft"', timeout=60000)
    page.wait_for_timeout(3500)   # „LOS!“-Einblendung abwarten
    page.evaluate('Rennspiel.config.grafik.adaptiv = false')
    page.evaluate("Rennspiel.spiel.fahrzeuge.forEach((f, i) => { if (i > 0 && f.driver) f.driver.steuerung = () => ({ gas: 0, bremse: 0, lenkung: 0 }); })")
    # Gegner weit weg parken
    page.evaluate("""(() => { const s = Rennspiel.spiel, sp = s.strecke.spline; s.fahrzeuge.forEach((f, i) => { if (i === 0) return;
      const q = sp.punktBei(300 + i * 40); f.vehicle.setzen(q.x, q.z, Rennspiel.headingAus(q.tx, q.tz)); f.index = sp.indexBei(300 + i * 40); }); })()""")
    k = page.evaluate("""(() => { const st = Rennspiel.spiel.strecke, k = st.kreuzungen[0], sp = st.spline, a = sp.punktBei(k.sA), b = sp.punktBei(k.sB);
      return { x: k.x, z: k.z, y: st.hoeheAn(k.x, k.z), sA: k.sA, sB: k.sB, ta: [a.tx, a.tz], tb: [b.tx, b.tz], grenze: st.seitenabstandMax, halbL: k.halbL }; })()""")
    snap = lambda n: page.screenshot(path=os.path.join(out, n + '.png'))

    def fahrer(name, sK, rich, hinter=9, hoch=2.6, vor=35, abstand=0):
        """Auto steht `abstand` m von der Mitte entfernt auf der Querstraße (Richtung rich), Kamera dahinter."""
        dx, dz = rich
        ax, az = k['x'] + dx * abstand, k['z'] + dz * abstand
        page.evaluate(AUTO_SETZEN, [ax, az, dx, dz, sK])
        page.evaluate("(() => { const k = Rennspiel.spiel.kameras[0]; k.update = () => {}; })()")
        page.evaluate(KAMERA_FREI, [ax - dx * hinter, k['y'] + hoch, az - dz * hinter, ax + dx * vor, k['y'] + 1.0, az + dz * vor])
        page.wait_for_timeout(900); snap(name)

    # k1: von A nach B abgebogen: steht an der Bande (≈ 21 m von der Mitte) auf B-Richtung
    fahrer('k1_fahrer_a_nach_b', k['sA'], k['tb'], abstand=18.5, hinter=14, hoch=3.2)
    # k2: von B nach A
    fahrer('k2_fahrer_b_nach_a', k['sB'], k['ta'], abstand=18.5, hinter=14, hoch=3.2)
    # k5: Fahrer auf A geradeaus, 25 m vor der Mitte
    fahrer('k5_fahrer_a_gerade', k['sA'], k['ta'], abstand=-30, hinter=10, hoch=2.8, vor=60)
    # k3 Vogel, k4 schräg, k6 Zwickel nah
    ex, ez, ey = k['x'], k['z'], k['y']
    page.evaluate(AUTO_SETZEN, [ex + k['ta'][0] * -60, ez + k['ta'][1] * -60, k['ta'][0], k['ta'][1], k['sA']])
    page.evaluate(KAMERA_FREI, [ex + 4, ey + 85, ez + 14, ex, ey, ez]); page.wait_for_timeout(900); snap('k3_vogel')
    dx, dz = k['ta'][0] + k['tb'][0], k['ta'][1] + k['tb'][1]; l = (dx * dx + dz * dz) ** 0.5
    page.evaluate(KAMERA_FREI, [ex + dx / l * 48, ey + 14, ez + dz / l * 48, ex, ey + 0.5, ez]); page.wait_for_timeout(900); snap('k4_schraeg')
    page.evaluate(KAMERA_FREI, [ex + dx / l * 20, ey + 4.5, ez + dz / l * 20, ex + dx / l * 17, ey + 0.8, ez + dz / l * 17 + 8]); page.wait_for_timeout(900); snap('k6_zwickel_nah')
    # k7: echt gefahren – Auto biegt in der Mitte auf die Querstraße ab (Vollgas) und stößt an die Bande; Verfolger-Kamera
    for name, sK, rich in (('k7_gefahren_a_nach_b', k['sA'], k['tb']), ('k8_gefahren_b_nach_a', k['sB'], k['ta'])):
        page.evaluate("(() => { const k = Rennspiel.spiel.kameras[0]; delete k.update; k._erstesMal = true; })()")
        page.evaluate(AUTO_SETZEN, [k['x'], k['z'], rich[0], rich[1], sK])
        page.evaluate("Rennspiel.spiel.fahrzeuge[0].vehicle.vLaengs = 12")
        page.keyboard.down('ArrowUp')
        for i in range(40): page.evaluate('Rennspiel.spiel.schnellvorlauf(0.1)')
        page.keyboard.up('ArrowUp')
        page.wait_for_timeout(1200); snap(name)
        pos = page.evaluate("(() => { const v = Rennspiel.spiel.fahrzeuge[0].vehicle; return [v.x, v.z, v.tempoKmh]; })()")
        erg_k = {'abstand_mitte': round(((pos[0] - k['x']) ** 2 + (pos[1] - k['z']) ** 2) ** 0.5, 1), 'kmh': round(pos[2], 1)}
        print(name, json.dumps(erg_k))
    info = page.evaluate("""(() => { const s = Rennspiel.spiel; let zaun = null;
      s.szene.traverse(o => { if (o.name === 'Zaunpfosten') zaun = o.count; });
      return { pfosten: zaun, zaunInfo: s.strecke.zaunInfo, drawCalls: s.renderer.info.render.calls, dreiecke: s.renderer.info.render.triangles }; })()""")
    print(json.dumps({'kreuzung': k, 'info': info, 'fehler': fehler}, ensure_ascii=False))
    browser.close()
