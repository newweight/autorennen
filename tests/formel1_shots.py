#!/usr/bin/env python3
"""v29 F3: Bilder der Formel-1-Strecke (Boxen, Kurve mit Tribüne/Kiesbett, Startaufstellung mit 8 Formel-Rennern, Gesamtansicht).
Aufruf: python3 tests/formel1_shots.py [ausgabeordner] [suffix]    (Standard: tests/out/v29, formel1_<name><suffix>.png)
Misst nebenbei Draw-Calls/Dreiecke der Formel1-Gruppe und sammelt Konsolenfehler."""
import sys, os, json
from playwright.sync_api import sync_playwright
basis = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
url = 'file://' + os.path.join(basis, 'Autorennen.html')
out = sys.argv[1] if len(sys.argv) > 1 else os.path.join(basis, 'tests', 'out', 'v29')
suf = sys.argv[2] if len(sys.argv) > 2 else ''
os.makedirs(out, exist_ok=True)
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
# Kamera frei: (s_cam, q_cam, hoehe, s_ziel, q_ziel, hoehe_ziel)  – q: + rechts
KAM = '''([sc, qc, hc, st, qt, ht]) => { const S = Rennspiel.spiel, sp = S.strecke.spline, k = S.kameras[0];
  if (!k._eingefroren) { k._eingefroren = true; k.update = () => {}; }
  const a = sp.punktBei(sp.wrapS(sc)), b = sp.punktBei(sp.wrapS(st));
  k.kamera.position.set(a.x + a.nx * qc, S.strecke.bodenHoehe(a.x + a.nx * qc, a.z + a.nz * qc) + hc, a.z + a.nz * qc);
  k.kamera.up.set(0, 1, 0);
  k.kamera.lookAt(b.x + b.nx * qt, S.strecke.bodenHoehe(b.x + b.nx * qt, b.z + b.nz * qt) + ht, b.z + b.nz * qt);
  k.kamera.updateMatrixWorld(true); }'''
KAM_ABS = '''([x, y, z, tx, ty, tz]) => { const S = Rennspiel.spiel, k = S.kameras[0];
  if (!k._eingefroren) { k._eingefroren = true; k.update = () => {}; }
  k.kamera.position.set(x, y, z); k.kamera.up.set(0, 1, 0); k.kamera.lookAt(tx, ty, tz); k.kamera.updateMatrixWorld(true); }'''
INFO = '''(() => { const S = Rennspiel.spiel, g = S.szene.children.find(c => c.name === 'Formel1'); let n = 0, tri = 0;
  if (g) g.traverse(o => { if (o.isMesh) { n++; const gg = o.geometry; tri += (gg.index ? gg.index.count : gg.attributes.position.count) / 3 * (o.isInstancedMesh ? o.count : 1); } });
  return { formel1Meshes: n, formel1Dreiecke: Math.round(tri), kurven: g ? g.userData.formel1 : null, tribuenen: (S.strecke.tribuenen || []).map(t => t.typ + t.s.toFixed(0) + (t.seite > 0 ? 'R' : 'L')),
    farben: S.fahrzeuge.map(f => f.auto && f.auto.id + ':' + ((f.auto.optionen && f.auto.optionen.farbe) !== undefined ? f.auto.optionen.farbe.toString(16) : '-')) }; })()'''
SHOTS = {
 'start_aufstellung': ('countdown', [40, 0, 5.5, -2, 0, 0.6]),
 'start_aufstellung2': ('countdown', [-30, -6, 3.2, 20, 2, 0.5]),
 'boxen_gerade': ('frei', [-330, 5, 2.4, -50, 14, 1.8]),
 'boxen_schraeg': ('frei', [150, -4, 3.5, -90, 22, 2.0]),
 'tribuene_start': ('frei', [-60, 6, 2.6, 10, -24, 4.0]),
 'kurve_tribuene': ('kurve', None),
 'kiesbett': ('kiesbett', None),
 'boxen_nah1': ('frei', [-230, 13.5, 1.7, -100, 24, 2.2]),
 'boxen_nah2': ('frei', [-10, 14, 2.2, -120, 24, 2.4]),
 'boxen_hoch': ('frei', [-120, -6, 11, -60, 22, 1.5]),
 'turm': ('frei', [-100, 8, 3.0, 20, 26, 6.0]),
 'banden_gerade': ('frei', [1900, -2, 1.5, 2000, -21, 0.8]),
 'ueberblick': ('oben', None),
 'schikane': ('frei', [2930, 3, 3.0, 3060, -4, 0.8]),
}
nur = os.environ.get('NUR')
fehler = []
with sync_playwright() as p:
    b = p.chromium.launch(args=ARGS)
    page = b.new_page(viewport={'width': 1280, 'height': 720})
    page.set_default_timeout(300000)
    page.on('pageerror', lambda e: fehler.append(str(e)))
    page.on('console', lambda m: fehler.append('console.' + m.type + ': ' + m.text) if m.type == 'error' else None)
    page.goto(url); page.wait_for_timeout(1500)
    opt = "{ modus: 'solo', streckeId: 'formel1', autoIds: ['formel', 'formel'], runden: 3, gegner: 7, schwierigkeit: 'mittel', fahrhilfe: ['wenig', 'wenig'] }"
    page.evaluate("Rennspiel.spiel.rennenStarten(%s)" % opt)
    page.wait_for_timeout(2500)
    print(json.dumps(page.evaluate(INFO), ensure_ascii=False))
    def foto(name):
        if nur and name not in nur.split(','): return
        page.wait_for_timeout(600)
        page.screenshot(path=os.path.join(out, 'formel1_%s%s.png' % (name, suf)))
        print('Bild', name)
    # Countdown-Bilder (Autos stehen in der Aufstellung)
    for name in ('start_aufstellung', 'start_aufstellung2'):
        art, a = SHOTS[name]
        page.evaluate(KAM, a); foto(name)
    page.wait_for_function('Rennspiel.spiel.rennen.zustand === "laeuft"', timeout=300000)
    # Autos wegparken (stören die Aufnahmen nicht), Rennen pausieren
    page.evaluate('''(() => { const S = Rennspiel.spiel; S.fahrzeuge.forEach((f, i) => { f.mesh.visible = i === 0 ? false : false; }); })()''')
    for name, (art, a) in SHOTS.items():
        if name.startswith('start_aufstellung'): continue
        if art == 'frei':
            page.evaluate(KAM, a); foto(name)
        elif art == 'kurve':
            t = page.evaluate("(() => { const t = Rennspiel.spiel.strecke.tribuenen.find(t => t.typ === 'kurve'); return [t.s, t.seite]; })()")
            s, seite = t
            page.evaluate(KAM, [s - 70, -seite * 4, 2.6, s + 4, seite * 22, 3.0]); foto(name + '_vorher')
            page.evaluate(KAM, [s - 30, -seite * 5, 3.2, s + 20, seite * 14, 1.5]); foto(name)
        elif art == 'kiesbett':
            ks = page.evaluate("Rennspiel.Formel1.kurven(Rennspiel.spiel.strecke).map(c => [c.kern0, c.kern1, c.aussen])")
            k0 = ks[3] if len(ks) > 3 else ks[0]
            s0, s1, au = k0
            page.evaluate(KAM, [s0 + 30, -au * 5.0, 2.8, s0 + 120, au * 14, 0.3]); foto(name)
        elif art == 'oben':
            page.evaluate('Rennspiel.spiel.szene.fog = null; Rennspiel.spiel.kameras[0].kamera.far = 6000; Rennspiel.spiel.kameras[0].kamera.updateProjectionMatrix()'); page.evaluate(KAM_ABS, [520, 1500, 1500, 520, 0, 120]); foto(name)
    b.close()
print('FEHLER (Konsole):', len(fehler))
for f in fehler[:10]: print('  ', f[:300])
