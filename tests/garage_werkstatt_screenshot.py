#!/usr/bin/env python3
"""14.10. (v18) Abschleppwagen + Werkstatt: echtes Spiel im Browser (Playwright, headless) – Bilder + Integrationsprüfung.
Aufruf: python3 tests/garage_werkstatt_screenshot.py [ausgabeordner]   (Standard tests/out/garage)
Bilder: 01_abschlepp_kommt (Wagen fährt heran), 02_abschlepp_haelt (hält neben dem Wrack), 03_abschlepp_kran (Kran hebt das Auto),
        04_abschlepp_faehrt_weg (Auto auf der Ladefläche), 05_werkstatt_voraus (Schild/Halle von der Straße, HUD „Werkstatt voraus“),
        06_werkstatt_heilt (Auto auf der Fläche, HUD „Werkstatt: 55 %“), 07_werkstatt_benutzt (rotes Schild, HUD „schon benutzt“),
        08_split_werkstatt (2 Spieler: links heilt, rechts voraus), 09_werkstatt_uebersicht (Halle + Fläche von oben/seitlich)
Prüft nebenbei: Abschleppwagen sichtbar/bewegt, Auto-Mesh wird wieder frei, HUD-Texte der Werkstatt, Schaden aus → weder Werkstatt noch Wagen, keine JS-Fehler."""
import sys, os
from playwright.sync_api import sync_playwright

basis = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
aus = sys.argv[1] if len(sys.argv) > 1 else os.path.join(basis, 'tests', 'out', 'garage')
os.makedirs(aus, exist_ok=True)
url = 'file://' + os.path.join(basis, 'Autorennen.html')
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']

START = '''([modus, schaden, strecke, welt]) => { const s = Rennspiel.spiel;
  s.rennenStarten({ modus, streckeId: strecke || 'wiese', welt: welt || 'klassisch', schaden, gegner: 0, runden: 5, schwierigkeit: 'mittel',
    autoIds: ['troc-cabrio', 'multivan'], fahrhilfe: ['aus', 'aus'] });
  s.schnellvorlauf(6);
  if (!s.laeuft) s.start();                       // Frames laufen (Bilder!), die Physik steht (pausiert) und wird von Hand geschaltet
  s.pausiert = true;
  s._gas = [0, 0]; s.input.steuerung = (nr) => ({ gas: s._gas[nr] || 0, bremse: 0, lenkung: 0 });
  const w = s.werkstatt;
  return { an: !!(s.schaden && s.schaden.an), werkstatt: !!w, abschlepp: !!s.abschlepp, platz: w ? { s: w.platz.s, seite: w.platz.seite, stufe: w.platz.stufe } : null }; }'''
# Auto i liegenbleiben lassen (0 %)
LIEGEN = '''(i) => { const s = Rennspiel.spiel, sc = s.schaden; sc.z[i].abkling = 0; sc._punkteSetzen(i, 5); sc.treffer(i, 'hindernis', 5); return sc.zustand(i); }'''
# n Sekunden Physik, danach Anzeige (Kamera/HUD) nachziehen
SCHRITTE = '''([sek]) => { const s = Rennspiel.spiel; for (let n = 0; n < Math.round(sek * 60); n++) s.physikSchritt(1 / 60);
  s.fahrzeuge.forEach((g) => { const d = g.anzeige, w = g.vehicle; d.x = w.x; d.y = w.y; d.z = w.z; d.heading = w.heading; d.nicken = w.nicken; d.neigung = w.neigung; });
  s.kameras.forEach(k => { for (let j = 0; j < 40; j++) k.update(1 / 60); }); s.huds.forEach(h => h.update());
  return s.fahrzeuge.map((f, i) => ({ i, p: s.schaden ? s.schaden.zustand(i).prozent : 100, tempo: +f.vehicle.tempo.toFixed(2), x: f.vehicle.x, z: f.vehicle.z,
    meshSicht: f.mesh.visible, meshY: +f.mesh.position.y.toFixed(2) })); }'''
STOPP = '''() => { const s = Rennspiel.spiel; s.uhr.rest = 0; s.pausiert = true; document.querySelectorAll('.hud-banner').forEach(b => { b.className = 'hud-banner'; }); }'''
WEITER = '''() => { Rennspiel.spiel.pausiert = false; }'''
# Auto i auf Streckenposition (Bogenlänge s, Querabstand q rechts +) stellen, in Fahrtrichtung, Stand
STELLEN = '''([i, s0, q]) => { const g = Rennspiel.spiel, st = g.strecke, p = st.spline.punktBei(s0), f = g.fahrzeuge[i], v = f.vehicle;
  const x = p.x + p.nx * q, z = p.z + p.nz * q;
  v.setzen(x, z, Math.atan2(-p.tx, -p.tz)); v.vLaengs = 0; v.vQuer = 0; v.y = st.hoeheAn(x, z); f.index = -1; f.nah = st.abfrage(x, z);
  g._vorherAngleichen(f); return true; }'''
HUD = '''(klasse) => Array.from(document.querySelectorAll('.' + klasse)).map(e => ({ text: e.textContent, an: getComputedStyle(e).display !== 'none' }))'''
# Kamera i frei setzen (Bild von der Seite/oben)
KAMERA = '''([i, x, y, z, ax, az]) => { const g = Rennspiel.spiel, k = g.kameras[i]; g._freieKamera = true; k.update = function () {};
  k.kamera.position.set(x, y, z); k.kamera.lookAt(ax, 0.5, az); return true; }'''

fehler, pr = [], []
def pruefe(name, ok, info=''):
    pr.append((name, bool(ok), info)); print(('OK   ' if ok else 'FEHL ') + name + ('  (' + str(info) + ')' if info != '' else ''))

def bild(page, name, warte=450):
    page.evaluate(STOPP); page.wait_for_timeout(warte)
    page.screenshot(path=os.path.join(aus, name))

with sync_playwright() as pw:
    browser = pw.chromium.launch(args=ARGS)
    # ---------------- Schaden aus: weder Werkstatt noch Wagen ----------------
    page = browser.new_page(viewport={'width': 1280, 'height': 800})
    page.on('pageerror', lambda e: fehler.append(str(e)))
    page.on('console', lambda m: fehler.append('console.error: ' + m.text) if m.type == 'error' else None)
    page.goto(url); page.wait_for_timeout(1200)
    info = page.evaluate(START, ['solo', False])
    pruefe('Schaden aus: keine Werkstatt, kein Abschleppwagen', not info['an'] and not info['werkstatt'] and not info['abschlepp'], info)
    szene = page.evaluate('() => { const n = []; Rennspiel.spiel.szene.traverse(o => { if (o.name === "Werkstatt" || o.name === "Abschleppwagen") n.push(o.name); }); return n; }')
    pruefe('Schaden aus: nichts davon in der Szene', not szene, szene)
    page.close()

    # ---------------- Einzelspieler: Abschleppwagen ----------------
    page = browser.new_page(viewport={'width': 1280, 'height': 800})
    page.on('pageerror', lambda e: fehler.append(str(e)))
    page.on('console', lambda m: fehler.append('console.error: ' + m.text) if m.type == 'error' else None)
    page.goto(url); page.wait_for_timeout(1200)
    info = page.evaluate(START, ['solo', True])
    pruefe('Schaden an: Werkstatt + Abschleppwagen vorhanden', info['an'] and info['werkstatt'] and info['abschlepp'], info)
    # Spieler auf eine freie Strecke (Gerade) stellen, damit das Bild etwas zeigt: 80 m nach Start/Ziel
    page.evaluate(STELLEN, [0, 40, 1.5])
    page.evaluate(SCHRITTE, [0.5])
    z = page.evaluate(LIEGEN, 0)
    pruefe('Auto liegengeblieben (0 %)', z['liegengeblieben'] and z['prozent'] == 0, z)
    r = page.evaluate(SCHRITTE, [1.2])[0]
    bild(page, '01_abschlepp_kommt.png')            # (Frames laufen nur beim Warten – danach prüfen)
    sicht = page.evaluate('() => { const a = Rennspiel.spiel.abschlepp.eintraege[0]; return a && a.lkw ? { sichtbar: a.lkw.visible, x: a.lkw.position.x, z: a.lkw.position.z } : null; }')
    pruefe('1,2 s: Abschleppwagen sichtbar und noch unterwegs', sicht and sicht['sichtbar'], sicht)
    r = page.evaluate(SCHRITTE, [1.4])[0]            # 2,6 s
    bild(page, '02_abschlepp_haelt.png')
    r = page.evaluate(SCHRITTE, [0.7])[0]            # 3,3 s
    bild(page, '03_abschlepp_kran.png')
    r = page.evaluate(SCHRITTE, [1.3])[0]            # 4,6 s
    bild(page, '04_abschlepp_faehrt_weg.png')
    r = page.evaluate('() => { const f = Rennspiel.spiel.fahrzeuge[0]; return { meshY: f.mesh.position.y, vy: f.vehicle.y }; }')
    pruefe('4,6 s: Auto-Mesh liegt auf der Ladefläche (über dem Boden, Physik-Auto bleibt unten)', r['meshY'] > r['vy'] + 0.9, r)
    r = page.evaluate(SCHRITTE, [1.4])[0]            # 6,0 s: abgeschleppt, Reparatur am Reset-Punkt
    page.evaluate(STOPP); page.wait_for_timeout(400)
    page.evaluate(SCHRITTE, [0.2]); page.evaluate(STOPP); page.wait_for_timeout(400)
    r = page.evaluate('() => { const f = Rennspiel.spiel.fahrzeuge[0]; return { sicht: f.mesh.visible, sk: f.mesh.scale.x, y: f.mesh.position.y - f.vehicle.y }; }')
    pruefe('nach dem Abschleppen: Auto-Mesh wieder sichtbar, Größe 1, auf dem Boden', r['sicht'] and abs(r['sk'] - 1) < 1e-6 and abs(r['y']) < 0.5, r)
    szeneLkw = page.evaluate('() => Rennspiel.spiel.abschlepp.eintraege[0].lkw.visible')
    pruefe('nach dem Abschleppen: Abschleppwagen weg', not szeneLkw, szeneLkw)
    page.close()

    # ---------------- Einzelspieler: Werkstatt ----------------
    page = browser.new_page(viewport={'width': 1280, 'height': 800})
    page.on('pageerror', lambda e: fehler.append(str(e)))
    page.on('console', lambda m: fehler.append('console.error: ' + m.text) if m.type == 'error' else None)
    page.goto(url); page.wait_for_timeout(1200)
    info = page.evaluate(START, ['solo', True])
    P = page.evaluate('() => { const P = Rennspiel.spiel.werkstatt.platz; return { s: P.s, seite: P.seite, qA: P.qA, qB: P.qB, laenge: P.laenge }; }')
    page.evaluate('() => { const sc = Rennspiel.spiel.schaden; sc.z[0].abkling = 0; sc._punkteSetzen(0, 40); }')
    page.evaluate(STELLEN, [0, P['s'] - 34, 2.5])
    page.evaluate(SCHRITTE, [0.4])
    hud = page.evaluate(HUD, 'hud-werkstatt')
    pruefe('HUD „Werkstatt voraus“ (Fläche < 60 m voraus)', hud and hud[0]['an'] and 'voraus' in hud[0]['text'], hud)
    bild(page, '05_werkstatt_voraus.png')
    # in die Box stellen, 1 s stehen
    box = page.evaluate('() => { const b = Rennspiel.spiel.werkstatt.boxMitte(1); return b; }')
    page.evaluate(STELLEN, [0, box['s'], box['qs'] * P['seite']])
    r = page.evaluate(SCHRITTE, [1.0])[0]
    hud = page.evaluate(HUD, 'hud-werkstatt')
    pruefe('1 s auf der Fläche: +15 % (40 → 55) und HUD „Werkstatt: 55 %“', 53 <= r['p'] <= 56 and hud and hud[0]['an'] and 'Werkstatt: %d %%' % r['p'] in hud[0]['text'], [r['p'], hud])
    bild(page, '06_werkstatt_heilt.png')
    # Fläche verlassen und wiederkommen → benutzt
    page.evaluate(STELLEN, [0, P['s'], 1.5]); page.evaluate(SCHRITTE, [0.3])
    page.evaluate(STELLEN, [0, box['s'], box['qs'] * P['seite']]); page.evaluate(SCHRITTE, [0.5])
    hud = page.evaluate(HUD, 'hud-werkstatt')
    pruefe('2. Besuch in derselben Runde: HUD „schon benutzt“', hud and hud[0]['an'] and 'schon benutzt' in hud[0]['text'], hud)
    bild(page, '07_werkstatt_benutzt.png')
    # Übersicht: Kamera von schräg oben auf die Werkstatt
    w = page.evaluate('() => { const w = Rennspiel.spiel.werkstatt, a = w.welt(w.platz.s, 0), b = w.welt(w.platz.s - 22, -9), c = w.welt(w.platz.s, (w.platz.qA + w.platz.qB) / 2); return { b, c, a }; }')
    page.evaluate(KAMERA, [0, w['b']['x'], 11, w['b']['z'], w['c']['x'], w['c']['z']])
    page.evaluate(STOPP); page.wait_for_timeout(450)
    page.screenshot(path=os.path.join(aus, '09_werkstatt_uebersicht.png'))
    page.close()

    # ---------------- Split-Screen ----------------
    page = browser.new_page(viewport={'width': 1280, 'height': 800})
    page.on('pageerror', lambda e: fehler.append(str(e)))
    page.on('console', lambda m: fehler.append('console.error: ' + m.text) if m.type == 'error' else None)
    page.goto(url); page.wait_for_timeout(1200)
    info = page.evaluate(START, ['zwei', True])
    P = page.evaluate('() => { const P = Rennspiel.spiel.werkstatt.platz; return { s: P.s, seite: P.seite }; }')
    page.evaluate('() => { const sc = Rennspiel.spiel.schaden; sc.z[0].abkling = 0; sc._punkteSetzen(0, 30); sc.z[1].abkling = 0; sc._punkteSetzen(1, 50); }')
    box0 = page.evaluate('() => Rennspiel.spiel.werkstatt.boxMitte(0)')
    page.evaluate(STELLEN, [0, box0['s'], box0['qs'] * P['seite']])
    page.evaluate(STELLEN, [1, P['s'] - 30, 2.0])
    r = page.evaluate(SCHRITTE, [1.4])
    hud = page.evaluate(HUD, 'hud-werkstatt')
    pruefe('Split-Screen: links heilt (30 → ≈ 51 %), rechts „voraus“ – zwei eigene Anzeigen', len(hud) == 2 and r[0]['p'] >= 48 and r[1]['p'] == 50, [r[0]['p'], r[1]['p'], hud])
    bild(page, '08_split_werkstatt.png')
    page.close()
    browser.close()

pruefe('keine JS-Fehler', not fehler, fehler[:3])
n_fehl = sum(1 for _, ok, _ in pr if not ok)
print('\n%d Prüfungen, %d FEHL' % (len(pr), n_fehl))
sys.exit(1 if n_fehl else 0)
