#!/usr/bin/env python3
"""Headless-Test: öffnet Autorennen.html per file://, startet ein Rennen auf einer Strecke,
macht Screenshots und liest Zustand aus window.Rennspiel.
Aufruf: python3 tests/screenshot_test.py [streckenId] [ausgabeordner]
  streckenId: wiese (Standard) | wald | wueste | alle
Bilder: 01_start, 02_fahrt, 03_links_abseits, 04_reset, 05_cockpit, 06_weit, 07_huegel,
        08_uebersicht, 09_kurve (engste Stelle: Haarnadel/Schikane), 10_minimap (Ausschnitt),
        Wald: 11_tunnel, 12_bruecke · Wüste: 11_oase, 12_gerade
Prüft: keine JS-Fehler, Deko ≥ breite/2 + 6 m von der Mitte, Draw-Calls Strecke+Deko ≤ 30, Minimap sichtbar."""
import sys, os, json
from playwright.sync_api import sync_playwright

basis = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
wahl = sys.argv[1] if len(sys.argv) > 1 else 'wiese'
url = 'file://' + os.path.join(basis, 'Autorennen.html')

ZUSTAND = '''(() => { const s = Rennspiel.spiel, v = s.fahrzeuge[0].vehicle, r = s.rennen, t = r.teilnehmer[0];
  return { x: +v.x.toFixed(1), z: +v.z.toFixed(1), y: +v.y.toFixed(2), kmh: v.tempoKmh, h: +v.heading.toFixed(2),
    untergrund: v.untergrund, zustand: r.zustand, runde: t.runde, cp: t.naechsterCheckpoint, platz: t.platz,
    fps: s.uhr.fps, kameraY: +s.kameras[0].kamera.position.y.toFixed(2),
    bodenUnterKamera: +s.strecke.hoeheAn(s.kameras[0].kamera.position.x, s.kameras[0].kamera.position.z).toFixed(2),
    drawCalls: s.renderer.info.render.calls, dreiecke: s.renderer.info.render.triangles }; })()'''

# Kamera von Hand setzen (Spielkamera einfrieren) für Übersichtsbilder
KAMERA_FREI = '''([px, py, pz, lx, ly, lz, nebel]) => { const s = Rennspiel.spiel, k = s.kameras[0];
  k.update = () => {}; k.kamera.far = 3000; k.kamera.updateProjectionMatrix();
  if (nebel === false) { s.szene.fog.far = 5000; s.szene.fog.near = 4000; }
  k.kamera.position.set(px, py, pz); k.kamera.lookAt(lx, ly, lz); }'''

# Kamera hinter/über einem Streckenpunkt s, Blick in Fahrtrichtung
KAMERA_BEI_S = '''([s, hinter, hoch, vor]) => { const st = Rennspiel.spiel.strecke, sp = st.spline;
  const a = sp.punktBei(s - hinter), b = sp.punktBei(s + vor);
  return [a.x, st.hoeheAn(a.x, a.z) + hoch, a.z, b.x, st.hoeheAn(b.x, b.z) + 1, b.z, true]; }'''

# Fahrzeug 0 an eine Stelle s setzen (Mitte der Fahrbahn, in Fahrtrichtung)
AUTO_NACH_S = '''(s) => { const sp = Rennspiel.spiel.strecke.spline, q = sp.punktBei(s), f = Rennspiel.spiel.fahrzeuge[0];
  f.vehicle.setzen(q.x, q.z, Rennspiel.headingAus(q.tx, q.tz)); f.index = -1;
  Rennspiel.spiel.kameras[0]._erstesMal = true; }'''

DEKO_PRUEFEN = '''(() => { const s = Rennspiel.spiel, sp = s.strecke.spline; let min = Infinity, n = 0, wo = null;
  const m4 = new THREE.Matrix4(), v = new THREE.Vector3(), jeArt = {};
  s.szene.traverse(o => { if (!o.isInstancedMesh || !o.parent || !o.parent.name.startsWith('Deko')) return;
    jeArt[o.name] = (jeArt[o.name] || 0) + o.count;
    for (let i = 0; i < o.count; i++) { o.getMatrixAt(i, m4); v.setFromMatrixPosition(m4);
      const a = Math.abs(sp.naechster(v.x, v.z).seitenabstand); n++;
      if (a < min) { min = a; wo = o.name; } } });
  return { instanzen: n, jeArt, minAbstandZurMitte: +min.toFixed(1), naechsteArt: wo, grenze: s.strecke.breite / 2 + 6 }; })()'''

# Draw-Calls Strecke + Deko: sichtbare Meshes zählen (obere Grenze, unabhängig vom Blickwinkel)
DRAW_CALLS = '''(() => { const s = Rennspiel.spiel; let n = 0; const namen = [];
  s.szene.children.forEach(g => { if (!(g.name.startsWith('Strecke') || g.name.startsWith('Deko'))) return;
    g.traverse(o => { if ((o.isMesh || o.isInstancedMesh) && o.visible && (!o.isInstancedMesh || o.count > 0)) { n++; namen.push(o.name); } }); });
  return { meshes: n, namen }; })()'''

MINIMAP = '''(() => { const c = document.querySelector('.hud-minimap'); if (!c) return null;
  const r = c.getBoundingClientRect(), st = getComputedStyle(c);
  return { x: r.x, y: r.y, w: r.width, h: r.height, sichtbar: st.display !== 'none' && r.width > 50 && +st.opacity > 0.2 }; })()'''


def lauf(browser, sid, out):
    os.makedirs(out, exist_ok=True)
    page = browser.new_page(viewport={'width': 1280, 'height': 800})
    fehler = []
    page.on('pageerror', lambda e: fehler.append(str(e)))
    page.on('console', lambda m: fehler.append('console.' + m.type + ': ' + m.text) if m.type in ('error',) else None)
    page.goto(url)
    page.wait_for_timeout(1500)
    page.evaluate("(id) => Rennspiel.spiel.rennenStarten({ modus: 'solo', streckeId: id, autoIds: ['troc-cabrio', 'multivan'], runden: 3, gegner: 3, schwierigkeit: 'mittel', fahrhilfe: ['wenig', 'wenig'] })", sid)
    page.wait_for_timeout(1000)
    snap = lambda name: page.screenshot(path=os.path.join(out, name))
    snap('01_start.png')
    z = {'strecke': sid, 'start': page.evaluate(ZUSTAND)}
    z['drawCallsStreckeDeko'] = page.evaluate(DRAW_CALLS)
    z['deko'] = page.evaluate(DEKO_PRUEFEN)
    z['dekoAnzahl'] = page.evaluate('(() => { let a = null; Rennspiel.spiel.szene.children.forEach(g => { if (g.name.startsWith("Deko")) a = g.userData.anzahl; }); return a; })()')
    # Fahrt: Autopilot fährt eine Weile (realistisches Bild mitten im Rennen)
    page.wait_for_function('Rennspiel.spiel.rennen.zustand === "laeuft"', timeout=20000)
    page.evaluate('Rennspiel.spiel.autopilot(0, true)')
    page.wait_for_timeout(12000)
    snap('02_fahrt.png')
    z['nach_fahrt'] = page.evaluate(ZUSTAND)
    z['minimap'] = page.evaluate(MINIMAP)
    if z['minimap']:
        m = z['minimap']
        page.screenshot(path=os.path.join(out, '10_minimap.png'),
                        clip={'x': max(0, m['x'] - 10), 'y': max(0, m['y'] - 10), 'width': m['w'] + 20, 'height': m['h'] + 20})
    page.evaluate('Rennspiel.spiel.autopilot(0, false)')
    # Links ins Abseits (Untergrund prüfen)
    page.keyboard.down('ArrowUp'); page.keyboard.down('ArrowLeft'); page.wait_for_timeout(1500)
    page.keyboard.up('ArrowLeft')
    snap('03_links_abseits.png')
    z['nach_links'] = page.evaluate(ZUSTAND)
    page.keyboard.up('ArrowUp')
    # Untergrund neben der Straße (Auto 5 m neben den Fahrbahnrand einer Geraden setzen)
    z['abseits_untergrund'] = page.evaluate('''(() => { const s = Rennspiel.spiel, st = s.strecke, sp = st.spline, f = s.fahrzeuge[0];
      let sG = 100; for (let x = 60; x < st.laenge; x += 10) if (Math.abs(sp.punktBei(x).kruemmung) < 1 / 500) { sG = x; break; }
      const p = sp.punktBei(sG), q = st.breite / 2 + st.randBreite + 5;
      f.vehicle.setzen(p.x + p.nx * q, p.z + p.nz * q, Rennspiel.headingAus(p.tx, p.tz)); f.index = -1;
      return { erwartet: st.abseitsUntergrund }; })()''')
    page.wait_for_timeout(400)
    z['abseits_untergrund']['ist'] = page.evaluate('Rennspiel.spiel.fahrzeuge[0].vehicle.untergrund')
    page.keyboard.press('KeyR'); page.wait_for_timeout(800)
    snap('04_reset.png')
    z['nach_reset'] = page.evaluate(ZUSTAND)
    page.keyboard.press('KeyC'); page.wait_for_timeout(600)
    snap('05_cockpit.png')
    page.keyboard.press('KeyC'); page.wait_for_timeout(600)
    snap('06_weit.png')
    page.keyboard.press('KeyC'); page.wait_for_timeout(300)   # zurück zur Verfolger-Kamera
    # höchste Stelle der Strecke (liegt das Auto auf der Straße?)
    hoch = page.evaluate('(() => { const sp = Rennspiel.spiel.strecke.spline; let b = sp.punkte[0]; sp.punkte.forEach(p => { if (p.y > b.y) b = p; }); return b.s; })()')
    page.evaluate(AUTO_NACH_S, hoch - 40)
    page.wait_for_timeout(1500)
    snap('07_huegel.png')
    z['huegel'] = page.evaluate(ZUSTAND)
    # Themen-Stellen aus Fahrersicht (Auto dorthin setzen, Verfolger-Kamera)
    daten = page.evaluate('(() => { const d = Rennspiel.spiel.strecke.daten; return { tunnel: d.baumtunnel || null, bruecke: d.bruecke || null }; })()')
    if daten['tunnel']:
        page.evaluate(AUTO_NACH_S, daten['tunnel']['von'] + 25)
        page.wait_for_timeout(1500)
        snap('11_tunnel.png')
    if daten['bruecke']:
        page.evaluate(AUTO_NACH_S, daten['bruecke']['von'] - 14)
        page.wait_for_timeout(1500)
        snap('12_bruecke.png')
    if sid == 'wueste':
        # Stelle der Strecke, die der Oase am nächsten liegt
        s_oase = page.evaluate('''(() => { const s = Rennspiel.spiel; let w = null;
          s.szene.traverse(o => { if (o.name === 'Wasser') w = o.position; });
          return w ? s.strecke.spline.naechster(w.x, w.z).s : null; })()''')
        if s_oase is not None:
            # Blick vom nächsten Streckenpunkt (8 m hoch, 40 m zurück) auf das Wasser
            blick = page.evaluate('''(s) => { const st = Rennspiel.spiel.strecke, sp = st.spline; let w = null;
              Rennspiel.spiel.szene.traverse(o => { if (o.name === 'Wasser') w = o.position; });
              const a = sp.punktBei(s - 40); return [a.x, st.hoeheAn(a.x, a.z) + 8, a.z, w.x, w.y, w.z, true]; }''', s_oase)
            page.evaluate(KAMERA_FREI, blick)
            page.wait_for_timeout(800)
            snap('11_oase.png')
        page.evaluate(AUTO_NACH_S, 520)
        page.wait_for_timeout(1500)
        snap('12_gerade.png')
    # Übersicht von schräg oben und Blick auf die engste Kurve (Haarnadel / Schikane)
    mitte = page.evaluate('(() => { const pk = Rennspiel.spiel.strecke.spline.punkte; let x = 0, z = 0; pk.forEach(p => { x += p.x; z += p.z; }); return [x / pk.length, z / pk.length]; })()')
    page.evaluate(KAMERA_FREI, [mitte[0], 700, mitte[1] + 480, mitte[0], 0, mitte[1], False])
    page.wait_for_timeout(600)
    snap('08_uebersicht.png')
    z['uebersicht'] = page.evaluate(ZUSTAND)
    haar = page.evaluate('(() => { const sp = Rennspiel.spiel.strecke.spline; let b = sp.punkte[0]; sp.punkte.forEach(p => { if (Math.abs(p.kruemmung) > Math.abs(b.kruemmung)) b = p; }); return [b.x, b.y, b.z, b.nx, b.nz]; })()')
    page.evaluate(KAMERA_FREI, [haar[0] - haar[3] * 60, haar[1] + 30, haar[2] - haar[4] * 60, haar[0], haar[1], haar[2], False])
    page.wait_for_timeout(600)
    snap('09_kurve.png')
    z['kurve'] = page.evaluate(ZUSTAND)

    # Prüfungen
    pruef = []
    def pruefe(name, ok, info=''):
        pruef.append(('OK   ' if ok else 'FEHL ') + '[' + sid + '] ' + name + (' – ' + str(info) if info != '' else ''))
    pruefe('keine JS-Fehler', not fehler, fehler[:3])
    d = z['deko']
    pruefe('Deko ≥ breite/2 + 6 m von der Mitte', d['minAbstandZurMitte'] >= d['grenze'] - 0.05,
           f"{d['minAbstandZurMitte']} m ({d['naechsteArt']}), Grenze {d['grenze']} m, {d['instanzen']} Instanzen")
    dc = z['drawCallsStreckeDeko']
    pruefe('Draw-Calls Strecke + Deko ≤ 30', dc['meshes'] <= 30, dc['meshes'])
    pruefe('Minimap sichtbar', bool(z['minimap'] and z['minimap']['sichtbar']), z['minimap'])
    au = z['abseits_untergrund']
    pruefe('Untergrund neben der Straße = Thema', au['ist'] == au['erwartet'], au)
    page.close()
    return z, pruef


ids = ['wiese', 'wald', 'wueste'] if wahl == 'alle' else [wahl]
with sync_playwright() as p:
    browser = p.chromium.launch(args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
    alle = []
    for sid in ids:
        out = sys.argv[2] if len(sys.argv) > 2 and len(ids) == 1 else os.path.join(basis, 'tests', 'out', sid)
        z, pruef = lauf(browser, sid, out)
        print(json.dumps(z, indent=1, ensure_ascii=False))
        alle += pruef
    browser.close()
    print('\n'.join(alle))
    sys.exit(0 if all(z.startswith('OK') for z in alle) else 1)
