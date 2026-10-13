#!/usr/bin/env python3
"""13.10. (v16) Fantasie-Kreuzung: Abbiegen – Bilder der Kinder-Meldung und des Resets.
Aufruf: python3 tests/kreuzung_abbiegen_screenshot.py [ausgabeordner]   (Standard tests/out/kreuzabbiegen)
Bilder: a1_abgebogen (Auto hat die Kreuzung verlassen, steht auf der Querstraße: „↩️ Falsch abgebogen! Zurück zur Kreuzung“),
        a2_weiter (1,5 s später, noch auf der Querstraße, ohne Wand), a3_reset (nach der Frist zurück am letzten Checkpoint, Meldung „Zu weit weg“).
Prüft nebenbei: Meldungstext im HUD sichtbar, kein Bandenstoß auf der Querstraße, Checkpoint-Zähler unverändert, Reset nach ≈ 4 s.
Ausgabe: JSON; Exit 1 bei Fehler."""
import sys, os, json
from playwright.sync_api import sync_playwright

basis = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
out = sys.argv[1] if len(sys.argv) > 1 else os.path.join(basis, 'tests', 'out', 'kreuzabbiegen')
os.makedirs(out, exist_ok=True)
url = 'file://' + os.path.join(basis, 'Autorennen.html')
fehlerliste = []

def pruefe(name, ok, info=''):
    print(('OK   ' if ok else 'FEHL ') + name + ('  (' + str(info) + ')' if info else ''))
    if not ok: fehlerliste.append(name)

with sync_playwright() as p:
    browser = p.chromium.launch(args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
    page = browser.new_page(viewport={'width': 1280, 'height': 800})
    js = []
    page.on('pageerror', lambda e: js.append(str(e)))
    page.on('console', lambda m: js.append('console.' + m.type + ': ' + m.text) if m.type == 'error' else None)
    page.goto(url); page.wait_for_timeout(1500)
    page.evaluate("Rennspiel.spiel.rennenStarten({ modus: 'solo', streckeId: 'fantasie', autoIds: ['troc-cabrio', 'multivan'], runden: 3, gegner: 3, schwierigkeit: 'mittel', fahrhilfe: ['aus', 'aus'] })")
    page.wait_for_function('Rennspiel.spiel.rennen.zustand === "laeuft"', timeout=60000)
    page.wait_for_timeout(3500)
    page.evaluate('Rennspiel.config.grafik.adaptiv = false')
    page.evaluate("Rennspiel.spiel.fahrzeuge.forEach((f, i) => { if (i > 0 && f.driver) f.driver.steuerung = () => ({ gas: 0, bremse: 0, lenkung: 0 }); })")
    page.evaluate("""(() => { const s = Rennspiel.spiel, sp = s.strecke.spline; s.fahrzeuge.forEach((f, i) => { if (i === 0) return;
      const q = sp.punktBei(300 + i * 40); f.vehicle.setzen(q.x, q.z, Rennspiel.headingAus(q.tx, q.tz)); f.index = sp.indexBei(300 + i * 40); }); })()""")
    # Auto 25 m vor der Mitte auf Abschnitt A, Rennleitung mitführen (letzter Checkpoint 7 = 828 m)
    page.evaluate("""(() => { const s = Rennspiel.spiel, st = s.strecke, sp = st.spline, k = st.kreuzungen[0], f = s.fahrzeuge[0], t = s.rennen.teilnehmer[0];
      const p = sp.punktBei(k.sA - 25); f.vehicle.setzen(p.x, p.z, Rennspiel.headingAus(p.tx, p.tz)); f.index = sp.indexBei(p.s); f.vehicle._bandeIndex = f.index;
      f.vehicle.y = st.hoeheAn(p.x, p.z, f.index); f.vehicle.vLaengs = 10; t.gestartet = true; t.letzterCheckpoint = 7; t.naechsterCheckpoint = 8;
      s.rennen.verfolgungSetzen(0, p.x, p.z, p.s); s._vorherAngleichen(f); window.__reset0 = f.netReset || 0; window.__resets = 0;
      const z = s.zuruecksetzen; s.zuruecksetzen = function (i) { window.__resets++; return z.call(this, i); }; })()""")
    daten = page.evaluate("""(() => { const st = Rennspiel.spiel.strecke, k = st.kreuzungen[0], b = st.spline.punktBei(k.sB);
      return { x: k.x, z: k.z, tb: [b.tx, b.tz] }; })()""")
    page.keyboard.down('ArrowUp')
    stoss = 0
    # geradeaus bis zur Mitte, dort auf die Querstraße B abbiegen (Heading + Tempo drehen, wie im Diagnose-Skript)
    for i in range(100):
        page.evaluate('Rennspiel.spiel.schnellvorlauf(0.05)')
        if page.evaluate("Math.hypot(Rennspiel.spiel.fahrzeuge[0].vehicle.x - %f, Rennspiel.spiel.fahrzeuge[0].vehicle.z - %f)" % (daten['x'], daten['z'])) < 3.5: break
    page.evaluate("""(tb) => { const v = Rennspiel.spiel.fahrzeuge[0].vehicle, h = Rennspiel.headingAus(tb[0], tb[1]); v.heading = h;
      v.weltGeschwindigkeitSetzen(-Math.sin(h) * 11, -Math.cos(h) * 11); }""", daten['tb'])
    cp0 = page.evaluate("Rennspiel.spiel.rennen.teilnehmer[0].letzterCheckpoint")
    for i in range(120):
        page.evaluate('Rennspiel.spiel.schnellvorlauf(0.05)')
        stoss += page.evaluate("Rennspiel.spiel.fahrzeuge[0].vehicle._anBande ? 1 : 0")
        if page.evaluate("!!Rennspiel.spiel.rennen.teilnehmer[0].abgebogen"): break
    page.wait_for_timeout(700)
    zustand = page.evaluate("""(() => { const s = Rennspiel.spiel, t = s.rennen.teilnehmer[0], v = s.fahrzeuge[0].vehicle, k = s.strecke.kreuzungen[0];
      return { abgebogen: !!t.abgebogen, dm: Math.hypot(v.x - k.x, v.z - k.z), cp: t.letzterCheckpoint, next: t.naechsterCheckpoint, text: document.body.innerText }; })()""")
    page.screenshot(path=os.path.join(out, 'a1_abgebogen.png'))
    pruefe('Auto ist abgebogen (Rennleitung), ≥ 17 m von der Mitte', zustand['abgebogen'] and zustand['dm'] >= 16.5, round(zustand['dm'], 1))
    pruefe('Meldung „Falsch abgebogen! Zurück zur Kreuzung" im HUD sichtbar', 'Falsch abgebogen' in zustand['text'] and 'Zurück zur Kreuzung' in zustand['text'])
    # weiter auf der Querstraße: keine Wand
    for i in range(30):
        page.evaluate('Rennspiel.spiel.schnellvorlauf(0.05)')
        stoss += page.evaluate("Rennspiel.spiel.fahrzeuge[0].vehicle._anBande ? 1 : 0")
    page.wait_for_timeout(500); page.screenshot(path=os.path.join(out, 'a2_weiter.png'))
    zw = page.evaluate("""(() => { const s = Rennspiel.spiel, t = s.rennen.teilnehmer[0], v = s.fahrzeuge[0].vehicle, k = s.strecke.kreuzungen[0];
      return { dm: Math.hypot(v.x - k.x, v.z - k.z), kmh: v.tempoKmh, cp: t.letzterCheckpoint, next: t.naechsterCheckpoint }; })()""")
    pruefe('auf der Querstraße weitergefahren (> 30 m), kein Bandenstoß in der Einmündung', stoss == 0 and zw['dm'] > 30, 'Stöße %d, %.0f m, %.0f km/h' % (stoss, zw['dm'], zw['kmh']))
    pruefe('Checkpoint-Zähler unverändert', zw['cp'] == cp0 and zw['next'] == 8, 'letzter %s, nächster %s' % (zw['cp'], zw['next']))
    # Frist abwarten: Reset
    page.keyboard.up('ArrowUp')
    n = 0
    while n < 200 and page.evaluate('window.__resets') == 0:
        page.evaluate('Rennspiel.spiel.schnellvorlauf(0.05)'); n += 1
    page.wait_for_timeout(500); page.screenshot(path=os.path.join(out, 'a3_reset.png'))
    nach = page.evaluate("""(() => { const s = Rennspiel.spiel, t = s.rennen.teilnehmer[0], v = s.fahrzeuge[0].vehicle, cp = s.strecke.checkpoints[7];
      return { resets: window.__resets, abgebogen: !!t.abgebogen, dcp: Math.hypot(v.x - cp.x, v.z - cp.z), text: document.body.innerText }; })()""")
    pruefe('Reset nach der Frist an den letzten Checkpoint (innerhalb ~4 s weiterer Fahrt)', nach['resets'] == 1 and not nach['abgebogen'] and nach['dcp'] < 160, 'Resets %d, Abstand zum Checkpoint %.0f m' % (nach['resets'], nach['dcp']))
    pruefe('Reset-Meldung sichtbar', 'Zurück auf die Strecke' in nach['text'])
    pruefe('keine JS-Fehler', len(js) == 0, js[:3])
    print(json.dumps({'zustand': zustand, 'zw': zw, 'nach': {k: v for k, v in nach.items() if k != 'text'}}, ensure_ascii=False))
    browser.close()
sys.exit(1 if fehlerliste else 0)
