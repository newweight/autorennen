#!/usr/bin/env python3
"""M5: Vorher/Nachher-Bilder je geändertem Schild (Tribünen-Tafel SPEED->TEMPO, Formel-1-Bande SPEED->TEMPO, Touch-Knopf Item->Extra).
Aufruf: python3 tests/m5_schilder_vorher_nachher.py [vorher|nachher]  (vorher: Texte per Skript zurücksetzen, nur Bild; Quelle bleibt unverändert)"""
import os, sys
from playwright.sync_api import sync_playwright
basis = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
out = os.path.join(basis, 'tests', 'bilder_m5'); os.makedirs(out, exist_ok=True)
phase = sys.argv[1] if len(sys.argv) > 1 else 'nachher'
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
# vorher: fillText('TEMPO') -> 'SPEED' (Texturen entstehen beim Streckenbau)
INIT = "(() => { const o = CanvasRenderingContext2D.prototype.fillText; CanvasRenderingContext2D.prototype.fillText = function (t) { if (t === 'TEMPO') arguments[0] = 'SPEED'; return o.apply(this, arguments); }; const s = CanvasRenderingContext2D.prototype.strokeText; CanvasRenderingContext2D.prototype.strokeText = function (t) { if (t === 'TEMPO') arguments[0] = 'SPEED'; return s.apply(this, arguments); }; })()"
KAM = '''([sc, qc, hc, st, qt, ht]) => { const S = Rennspiel.spiel, sp = S.strecke.spline, k = S.kameras[0];
  if (!k._eingefroren) { k._eingefroren = true; k.update = () => {}; }
  const a = sp.punktBei(sp.wrapS(sc)), b = sp.punktBei(sp.wrapS(st));
  k.kamera.position.set(a.x + a.nx * qc, S.strecke.bodenHoehe(a.x + a.nx * qc, a.z + a.nz * qc) + hc, a.z + a.nz * qc);
  k.kamera.up.set(0, 1, 0); k.kamera.lookAt(b.x + b.nx * qt, S.strecke.bodenHoehe(b.x + b.nx * qt, b.z + b.nz * qt) + ht, b.z + b.nz * qt); k.kamera.updateMatrixWorld(true); }'''
with sync_playwright() as p:
    b = p.chromium.launch(args=ARGS)
    ctx = b.new_context(viewport={'width': 1280, 'height': 720}); 
    page = ctx.new_page(); page.set_default_timeout(300000)
    if phase == 'vorher': page.add_init_script(INIT)
    page.goto('file://' + os.path.join(basis, 'Autorennen.html')); page.wait_for_timeout(1500)
    def lauf(sid, name, kam_fn):
        page.evaluate("Rennspiel.spiel.rennenStarten({ modus: 'solo', streckeId: '%s', autoIds: ['passat','passat'], runden: 2, gegner: 1, schwierigkeit: 'mittel', fahrhilfe: ['wenig','wenig'] })" % sid); page.wait_for_timeout(2500)
        page.add_style_tag(content='.hud { display: none !important; }')
        page.wait_for_function('Rennspiel.spiel.rennen.zustand === "laeuft"', timeout=300000)
        page.evaluate("Rennspiel.spiel.fahrzeuge.forEach(f => { f.mesh.visible = false; })")
        page.evaluate(KAM, kam_fn(page)); page.wait_for_timeout(700)
        page.screenshot(path=os.path.join(out, '%s_%s.png' % (name, phase)), timeout=90000); print(name, phase)
    # Tribünen-Tafel (alpen: Tafeln gut sichtbar am Start) – nah an der Tribüne am Start
    lauf('alpen', 'schild_tribuene_tempo', lambda pg: [-4, -1, 1.7, 4, 14, 2.4])
    for k, sc in enumerate([1860, 1900, 1940, 1980, 2020, 2060]):
        lauf('formel1', 'schild_banden_tempo%d' % k, lambda pg, sc=sc: [sc, -12, 1.3, sc + 14, -21, 0.9])
    b.close()
