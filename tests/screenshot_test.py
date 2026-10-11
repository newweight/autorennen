#!/usr/bin/env python3
"""Headless-Test: öffnet Autorennen.html per file://, startet ein Rennen auf einer Strecke,
macht Screenshots und liest Zustand aus window.Rennspiel.
Aufruf: python3 tests/screenshot_test.py [streckenId] [ausgabeordner]
  streckenId: wiese (Standard) | wald | wueste | alle
Bilder: 01_start, 02_fahrt, 03_links_abseits, 04_reset, 05_cockpit, 06_weit, 07_huegel,
        08_uebersicht, 09_kurve (engste Stelle: Haarnadel/Schikane), 10_minimap (Ausschnitt),
        Wald: 11_tunnel (Baumtunnel) · Wüste: 11_oase, 12_gerade
        Runde 3 (je Strecke, falls vorhanden): 13_tunnel_innen (Scheinwerfer), 13b_tunnel_portal, 14_bruecke,
        14b_bruecke_seite (Senke von der Seite), 15_hindernis_baustelle, 16_hindernis_oel, 17_hindernis_ast, 18_hindernis_sand
        Fantasie: 19_looping_aussen, 19b_looping2_aussen, 20_looping_auto (Verfolger kopfüber), 20b_looping_auto_aussen,
        20c_looping_cockpit, 21_ball (Ball auf der Straße), 21b_ball_treffer, 22_wasser_aktiv, 22b_wasser_blubbern
        Runde 4 (Wiese/Wald/Wüste, Welt „Stunt"): 23_spur_eng (1 Spur + Leitplanke), 23b_spur_eng_oben, 24_spur_breit (3 Spuren)
        – main.js kennt die Welt-Wahl noch nicht: der Test setzt vorher trackCatalog[...].weltStandard = 'stunt'.
Prüft: keine JS-Fehler, Deko ≥ breite/2 + 6 m von der Mitte, Draw-Calls Strecke+Deko+Hindernisse ≤ 40, Minimap sichtbar,
       Tunnel innen dunkel (Helligkeit < 45 % von draußen) mit hellem Lichtkegel, höchstens 3 Punkt- + 2 Spotlichter,
       Senke unter der Brücke ≥ 3 m tief, Pylone fällt beim Anfahren um und kommt nach der Runde zurück."""
import sys, os, json, io
from playwright.sync_api import sync_playwright
from PIL import Image, ImageStat


def helligkeit(png, box=None):
    """Mittlere Helligkeit (0..255) eines Screenshots, optional nur im Ausschnitt box=(x0,y0,x1,y1) in Anteilen."""
    bild = Image.open(io.BytesIO(png)).convert('L')
    if box:
        w, h = bild.size
        bild = bild.crop((int(box[0] * w), int(box[1] * h), int(box[2] * w), int(box[3] * h)))
    return ImageStat.Stat(bild).mean[0]

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

# Draw-Calls Strecke + Deko: sichtbare Meshes zählen (obere Grenze, unabhängig vom Blickwinkel).
# In Regionen geteilte InstancedMeshes (userData.stueck > 0) zählen als ein Objekt – je Ansicht wird nur
# gezeichnet, was im Blickfeld liegt (echte Draw-Calls stehen in drawCalls von ZUSTAND).
DRAW_CALLS = '''(() => { const s = Rennspiel.spiel; let n = 0; const namen = [];
  s.szene.children.forEach(g => { if (!(g.name.startsWith('Strecke') || g.name.startsWith('Deko'))) return;
    g.traverse(o => { if ((o.isMesh || o.isInstancedMesh) && o.visible && (!o.isInstancedMesh || o.count > 0) && !(o.userData.stueck > 0)) { n++; namen.push(o.name); } }); });
  return { meshes: n, namen }; })()'''

MINIMAP = '''(() => { const c = document.querySelector('.hud-minimap'); if (!c) return null;
  const r = c.getBoundingClientRect(), st = getComputedStyle(c);
  return { x: r.x, y: r.y, w: r.width, h: r.height, sichtbar: st.display !== 'none' && r.width > 50 && +st.opacity > 0.2 }; })()'''


# Auto an Stelle s, Seitenabstand q setzen, stehen lassen
AUTO_NACH_SQ = '''([s, q]) => { const sp = Rennspiel.spiel.strecke.spline, p = sp.punktBei(s), f = Rennspiel.spiel.fahrzeuge[0];
  f.vehicle.setzen(p.x + p.nx * q, p.z + p.nz * q, Rennspiel.headingAus(p.tx, p.tz)); f.index = -1;
  Rennspiel.spiel.kameras[0]._erstesMal = true; }'''

LICHTER = '''(() => { let punkt = 0, spot = 0; Rennspiel.spiel.szene.traverse(o => { if (o.isPointLight && o.visible) punkt++; if (o.isSpotLight && o.visible) spot++; });
  return { punkt, spot }; })()'''


def runde3_bilder(page, snap):
    """Tunnel, Brücke, Hindernisse aus Fahrersicht. Liefert Messwerte für die Prüfungen."""
    erg = {'tunnel': [], 'bruecken': [], 'lichter': {'punkt': 0, 'spot': 0}}
    info = page.evaluate('''(() => { const st = Rennspiel.spiel.strecke;
      return { tunnel: st.tunnel.map(t => [t.s0, t.s1]), bruecken: st.bruecken.map(b => [b.s0, b.s1, b.art]),
        hindernisse: st.hindernisse.map(h => ({ typ: h.typ, s: h.s, s0: h.s0, q: h.seitenabstand })) }; })()''')
    # Autos der KI aus dem Weg (sonst stehen sie im Bild)
    page.evaluate('''(() => { const s = Rennspiel.spiel; s.fahrzeuge.forEach((f, i) => { if (i > 0) { const p = s.strecke.spline.punktBei(-40 - 10 * i);
      f.vehicle.setzen(p.x, p.z, Rennspiel.headingAus(p.tx, p.tz)); f.driver && (f.driver.steuerung = () => ({ gas: 0, bremse: 1, lenkung: 0 })); } }); })()''')
    for nr, (s0, s1) in enumerate(info['tunnel']):
        # draußen (gleiche Kamera, 60 m vor dem Tunnel) als Vergleich
        page.evaluate(AUTO_NACH_SQ, [s0 - 60, 0]); page.wait_for_timeout(1200)
        draussen = helligkeit(page.screenshot())
        page.evaluate(AUTO_NACH_SQ, [s0 - 22, 0]); page.wait_for_timeout(1200)
        snap('13b_tunnel_portal.png')
        page.evaluate(AUTO_NACH_SQ, [min(s1 - 25, s0 + 40), 0]); page.wait_for_timeout(1500)
        bild = page.screenshot(); snap('13_tunnel_innen.png')
        lichter = page.evaluate(LICHTER)
        erg['lichter'] = {'punkt': max(erg['lichter']['punkt'], lichter['punkt']), 'spot': max(erg['lichter']['spot'], lichter['spot'])}
        # Wände: Ränder oben links/rechts, Kegel: Straße vor dem Auto unten Mitte (unter dem Auto vorbei)
        innen = (helligkeit(bild, (0.0, 0.15, 0.18, 0.6)) + helligkeit(bild, (0.82, 0.15, 1.0, 0.6))) / 2
        kegel = max(helligkeit(bild, (0.30, 0.42, 0.48, 0.58)), helligkeit(bild, (0.52, 0.42, 0.70, 0.58)))
        erg['tunnel'].append({'s0': s0, 'draussen': round(draussen, 1), 'innen': round(innen, 1), 'kegel': round(kegel, 1),
                              'gesamt': round(helligkeit(bild), 1), 'spots': lichter['spot'], 'punkte': lichter['punkt']})
    for s0, s1, art in info['bruecken']:
        page.evaluate(AUTO_NACH_SQ, [s0 - 16, 0]); page.wait_for_timeout(1500)
        snap('14_bruecke.png')
        tiefe = page.evaluate('''([a, b]) => { const st = Rennspiel.spiel.strecke, p = st.spline.punktBei((a + b) / 2);
          return +(st.hoeheAn(p.x, p.z) - st.bodenHoehe(p.x, p.z)).toFixed(2); }''', [s0, s1])
        erg['bruecken'].append({'s0': s0, 'art': art, 'tiefe': tiefe})
        # von der Seite (Senke + Pfeiler/Bogen sichtbar)
        blick = page.evaluate('''([a, b]) => { const st = Rennspiel.spiel.strecke, sp = st.spline, m = sp.punktBei((a + b) / 2);
          const q = 30, x = m.x + m.nx * q - m.tx * 26, z = m.z + m.nz * q - m.tz * 26;
          return [x, st.hoeheAn(m.x, m.z) + 3, z, m.x, st.bodenHoehe(m.x, m.z) + 2, m.z, true]; }''', [s0, s1])
        page.evaluate(KAMERA_FREI, blick); page.wait_for_timeout(800)
        snap('14b_bruecke_seite.png')
        page.evaluate('(() => { const s = Rennspiel.spiel, k = s.kameras[0]; delete k.update; k._erstesMal = true; })()')
    bilder = {'baustelle': '15_hindernis_baustelle.png', 'oel': '16_hindernis_oel.png', 'ast': '17_hindernis_ast.png', 'sand': '18_hindernis_sand.png'}
    gemacht = set()
    for h in info['hindernisse']:
        if h['typ'] in gemacht: continue
        gemacht.add(h['typ'])
        vorne = h['s0'] if h['typ'] == 'baustelle' else h['s']
        page.evaluate(AUTO_NACH_SQ, [vorne - 20, 0]); page.wait_for_timeout(1300)
        snap(bilder[h['typ']])
    # Pylone anfahren: Auto auf die gesperrte Seite vor die Schräge, Gas → Pylone weg; danach Runde → zurück
    bs = [h for h in info['hindernisse'] if h['typ'] == 'baustelle']
    if bs:
        h = bs[0]
        page.evaluate(AUTO_NACH_SQ, [h['s0'] - 12, h['q']])
        page.evaluate('(() => { const v = Rennspiel.spiel.fahrzeuge[0].vehicle; v.vLaengs = 14; })()')
        page.keyboard.down('ArrowUp'); page.evaluate('Rennspiel.spiel.schnellvorlauf(1.8)'); page.keyboard.up('ArrowUp')
        weg = page.evaluate('(() => Rennspiel.spiel.strecke.hindernisse.some(h => h.pylonen && h.pylonen.some(p => p.weg)))()')
        page.wait_for_timeout(500)
        zurueck_n = page.evaluate('''(() => { const s = Rennspiel.spiel; s.rennen._callbacks.runde.forEach(fn => fn(s.rennen.teilnehmer[0])); s.strecke.hindernisseAnimieren(1e9);
          return s.strecke.hindernisse.every(h => !h.pylonen || h.pylonen.every(p => !p.weg)); })()''')
        erg['pylone'] = {'weg': weg, 'zurueck': zurueck_n}
    return erg


# Physik einfrieren, sobald Spielerauto 0 im Looping den Winkel `ziel` erreicht (Kamera läuft weiter)
LOOP_STOPP = '''(ziel) => { const s = Rennspiel.spiel;
  if (!s._origPhysik) s._origPhysik = s.physikSchritt;
  s.physikSchritt = function (dt) { if (s._eingefroren) return; s._origPhysik.call(s, dt);
    const lp = s.fahrzeuge[0].looping; if (lp.aktiv && lp.winkel >= ziel) s._eingefroren = true; }; s._eingefroren = false; }'''
LOOP_WEITER = '''(() => { const s = Rennspiel.spiel; s._eingefroren = false; delete s.physikSchritt; })()'''


def fantasie_bilder(page, snap):
    """Looping (außen, Auto kopfüber aus Verfolger-/Außensicht), Bälle, Wasserstrahl. Liefert Messwerte."""
    erg = {}
    lps = page.evaluate('(() => Rennspiel.spiel.strecke.loopings.map(l => ({ s: l.s, r: l.radius, versatz: l.versatz })))()')
    # Looping von außen (seitlich, leicht erhöht), beide Loopings
    for nr, name in [(0, '19_looping_aussen.png'), (1, '19b_looping2_aussen.png')]:
        l = lps[nr]
        blick = page.evaluate('''([s, r]) => { const st = Rennspiel.spiel.strecke, sp = st.spline, m = sp.punktBei(s + 5);
          const x = m.x - m.nx * 42 - m.tx * 18, z = m.z - m.nz * 42 - m.tz * 18;
          return [x, st.hoeheAn(m.x, m.z) + 9, z, m.x, st.hoeheAn(m.x, m.z) + r, m.z, true]; }''', [l['s'], l['r']])
        page.evaluate(KAMERA_FREI, blick); page.wait_for_timeout(900)
        snap(name)
    page.evaluate('(() => { const s = Rennspiel.spiel, k = s.kameras[0]; delete k.update; k._erstesMal = true; })()')
    # Auto fährt mit Anlauf in Looping 1 (Gas gedrückt), Stopp oben → Verfolger-Kamera
    l = lps[0]
    page.evaluate(AUTO_NACH_SQ, [l['s'] - 70, 0])
    page.evaluate('(() => { const v = Rennspiel.spiel.fahrzeuge[0].vehicle; v.vLaengs = 33; })()')
    page.evaluate(LOOP_STOPP, 3.05)
    page.keyboard.down('ArrowUp')
    page.wait_for_function('Rennspiel.spiel._eingefroren === true', timeout=30000)
    page.wait_for_timeout(1500)       # Kamera setzt sich (läuft weiter)
    snap('20_looping_auto.png')
    erg['oben'] = page.evaluate('''(() => { const s = Rennspiel.spiel, f = s.fahrzeuge[0], m = f.mesh;
      const oben = new THREE.Vector3(0, 1, 0).applyQuaternion(m.quaternion), k = s.kameras[0].kamera;
      const boden = s.strecke.hoeheAn(m.position.x, m.position.z);
      return { winkelGrad: +(f.looping.winkel * 180 / Math.PI).toFixed(0), autoObenY: +oben.y.toFixed(2), hoeheUeberBoden: +(m.position.y - boden).toFixed(1),
        kameraObenY: +k.up.y.toFixed(2), tempoKmh: Math.round(f.looping.v * 3.6), meldung: s.huds[0].meldungText || '' }; })()''')
    # Außensicht mit dem Auto oben im Looping
    blick = page.evaluate('''([s, r]) => { const st = Rennspiel.spiel.strecke, sp = st.spline, m = sp.punktBei(s + 5);
      const x = m.x - m.nx * 30 - m.tx * 6, z = m.z - m.nz * 30 - m.tz * 6;
      return [x, st.hoeheAn(m.x, m.z) + 14, z, m.x, st.hoeheAn(m.x, m.z) + r * 1.4, m.z, true]; }''', [l['s'], l['r']])
    page.evaluate('(() => { const s = Rennspiel.spiel; s._loopingKamera = () => {}; s.kameras[0].kamera.up.set(0, 1, 0); })()')     # Looping-Kamera aus, freie Kamera
    page.evaluate(KAMERA_FREI, blick); page.wait_for_timeout(700)
    snap('20b_looping_auto_aussen.png')
    page.evaluate('(() => { const s = Rennspiel.spiel, k = s.kameras[0]; delete k.update; delete s._loopingKamera; k._erstesMal = true; })()')
    page.keyboard.press('KeyC'); page.wait_for_timeout(900)
    snap('20c_looping_cockpit.png')
    page.keyboard.press('KeyC'); page.keyboard.press('KeyC'); page.wait_for_timeout(200)
    page.evaluate(LOOP_WEITER)
    page.wait_for_function('Rennspiel.spiel.fahrzeuge[0].looping.geschafft >= 1 || Rennspiel.spiel.fahrzeuge[0].looping.gefallen >= 1', timeout=30000)
    page.keyboard.up('ArrowUp')
    erg['durch'] = page.evaluate('''(() => { const s = Rennspiel.spiel, f = s.fahrzeuge[0], lp = f.looping;
      return { geschafft: lp.geschafft, gefallen: lp.gefallen, kmh: f.vehicle.tempoKmh, imLooping: !!f.vehicle.imLooping,
        s: +s.strecke.spline.naechster(f.vehicle.x, f.vehicle.z).s.toFixed(1), meldung: s.huds[0].meldungText || '' }; })()''')
    page.wait_for_timeout(1500)
    erg['kameraNachher'] = page.evaluate('+Rennspiel.spiel.kameras[0].kamera.up.y.toFixed(3)')
    # Zu langsam: Auto fährt mit 15 m/s auf Looping 2 → fährt unten durch, Meldung
    l2 = lps[1]
    page.evaluate(AUTO_NACH_SQ, [l2['s'] - 5, 0])
    page.evaluate('(() => { const v = Rennspiel.spiel.fahrzeuge[0].vehicle; v.vLaengs = 15; })()')
    page.wait_for_function('Rennspiel.spiel.fahrzeuge[0].looping.zuLangsam >= 1', timeout=20000)
    erg['zuLangsam'] = page.evaluate('(() => { const s = Rennspiel.spiel; return { zuLangsam: s.fahrzeuge[0].looping.zuLangsam, meldung: s.huds[0].meldungText || "" }; })()')
    # Ball auf der Straße: Stelle 0 aktivieren, Ball langsam mitten auf die Fahrbahn
    b = page.evaluate('''(() => { const s = Rennspiel.spiel, d = s.dynamik, st = d.stellen[0];
      st.aktiv = true; st.timer = 0; d.baelleAn = true; d.schritt(1 / 60, { fortschritt: 0, runden: 3 });
      const ball = st.baelle[st.baelle.length - 1]; ball.q = -2.5 * st.von; ball.vq = -st.von * 0.4; d._ballWelt(ball);
      st.timer = 1e9; return { s: ball.s, r: ball.radius }; })()''')
    page.evaluate(AUTO_NACH_SQ, [b['s'] - 24, 2.5])
    page.wait_for_timeout(1300)
    snap('21_ball.png')
    # Treffer: Auto fährt mit 25 m/s in den Ball
    page.evaluate(AUTO_NACH_SQ, [b['s'] - 14, -2.3 * 1])
    page.evaluate('''(() => { const s = Rennspiel.spiel, d = s.dynamik, st = d.stellen[0], ball = st.baelle[st.baelle.length - 1];
      const f = s.fahrzeuge[0], v = f.vehicle, n = s.strecke.spline.naechster(v.x, v.z); ball.q = n.seitenabstand; ball.vq = 0; d._ballWelt(ball);
      v.vLaengs = 25; s._tempoVorBall = 25; s.dynamikStoesse = []; })()''')
    page.wait_for_function('(Rennspiel.spiel.huds[0].meldungText || "").startsWith("Bumm")', timeout=15000)
    erg['ball'] = page.evaluate('''(() => { const s = Rennspiel.spiel, v = s.fahrzeuge[0].vehicle;
      return { kmhNachher: Math.round(v.vLaengs * 3.6), meldung: s.huds[0].meldungText || '' }; })()''')
    page.wait_for_timeout(250)
    snap('21b_ball_treffer.png')
    # Wasserstrahl: Zeit der Dynamik einfrieren, Düse 0 mitten in der Fontäne bzw. im Blubbern
    du = page.evaluate('''(() => { const s = Rennspiel.spiel, d = s.dynamik, du = d.duesen[0];
      d._schrittOrig = d.schritt; d.schritt = function () { return {}; };
      du.versatz = ((du.vorwarnung + du.dauer * 0.5 - d.zeit) % du.intervall + du.intervall) % du.intervall; du.zustand = 'aktiv';
      return { s: du.s, q: du.seitenabstand }; })()''')
    page.evaluate(AUTO_NACH_SQ, [du['s'] - 22, -du['q']])
    page.wait_for_timeout(1300)
    snap('22_wasser_aktiv.png')
    page.evaluate('''(() => { const d = Rennspiel.spiel.dynamik, du = d.duesen[0];
      du.versatz = ((du.vorwarnung * 0.5 - d.zeit) % du.intervall + du.intervall) % du.intervall; du.zustand = 'blubbern'; })()''')
    page.wait_for_timeout(400)
    snap('22b_wasser_blubbern.png')
    # Treffer: Fontäne aktiv, Auto fährt mit 25 m/s durch
    page.evaluate('''(() => { const d = Rennspiel.spiel.dynamik, du = d.duesen[0];
      du.versatz = ((du.vorwarnung + du.dauer * 0.5 - d.zeit) % du.intervall + du.intervall) % du.intervall; du.zustand = 'aktiv'; du.getroffen.clear(); })()''')
    page.evaluate(AUTO_NACH_SQ, [du['s'] - 10, du['q']])
    page.evaluate('(() => { const s = Rennspiel.spiel; s.fahrzeuge[0].vehicle.vLaengs = 25; s.dynamikStoesse = []; })()')
    page.wait_for_function('(Rennspiel.spiel.huds[0].meldungText || "").startsWith("Platsch")', timeout=15000)
    erg['wasser'] = page.evaluate('''(() => { const s = Rennspiel.spiel, v = s.fahrzeuge[0].vehicle;
      return { kmhNachher: Math.round(v.vLaengs * 3.6), vQuer: +v.vQuer.toFixed(1), meldung: s.huds[0].meldungText || '' }; })()''')
    page.evaluate('(() => { const d = Rennspiel.spiel.dynamik; d.schritt = d._schrittOrig; })()')
    return erg


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
    page.wait_for_function('Rennspiel.spiel.rennen.zustand === "laeuft"', timeout=60000)
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
    # Runde 4: bei langsamer Software-Grafik kann der nächste Physikschritt später kommen – bis 5 s warten
    try:
        page.wait_for_function('(u) => Rennspiel.spiel.fahrzeuge[0].vehicle.untergrund === u', arg=z['abseits_untergrund']['erwartet'], timeout=5000)
    except Exception:
        pass
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
    daten = page.evaluate('(() => { const d = Rennspiel.spiel.strecke.daten; return { tunnel: d.baumtunnel || null }; })()')
    if daten['tunnel']:
        page.evaluate(AUTO_NACH_S, daten['tunnel']['von'] + 25)
        page.wait_for_timeout(1500)
        snap('11_tunnel.png')
    z['elemente'] = runde3_bilder(page, snap)
    if sid == 'fantasie':
        z['fantasie'] = fantasie_bilder(page, snap)
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
        page.evaluate(AUTO_NACH_S, 754)      # Runde 4: Wüste ×1,45 (vorher 520)
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
    pruefe('Draw-Calls Strecke + Deko + Hindernisse ≤ 40', dc['meshes'] <= 40, dc['meshes'])
    el = z['elemente']
    pruefe('höchstens 3 Punkt- + 2 Spotlichter', el['lichter']['punkt'] <= 3 and el['lichter']['spot'] <= 2, el['lichter'])
    for t in el['tunnel']:
        pruefe('Tunnel innen dunkel (< 45 % von draußen)', t['innen'] < 0.45 * t['draussen'], t)
        pruefe('Tunnel: Lichtkegel heller als die Wände', t['kegel'] > t['innen'] * 1.3, t)
        pruefe('Tunnel: Scheinwerfer + Lampenlichter an', t['spots'] >= 1 and t['punkte'] >= 1, t)
    for b in el['bruecken']:
        pruefe('Brücke über echter Senke (≥ 3 m)', b['tiefe'] >= 3, b)
    if el.get('pylone'):
        py = el['pylone']
        pruefe('Pylone fällt beim Anfahren um', py['weg'], py)
        pruefe('Pylone steht nach der Runde wieder', py['zurueck'], py)
    pruefe('Minimap sichtbar', bool(z['minimap'] and z['minimap']['sichtbar']), z['minimap'])
    if z.get('fantasie'):
        fz = z['fantasie']
        pruefe('Looping: Auto oben kopfüber (Dach nach unten, ≥ 20 m über dem Boden)', fz['oben']['autoObenY'] < -0.9 and fz['oben']['hoeheUeberBoden'] > 20, fz['oben'])
        pruefe('Looping: Kamera folgt der Drehung (oben = Auto-oben)', fz['oben']['kameraObenY'] < -0.5, fz['oben'])
        pruefe('Looping geschafft, Ausfahrt mit Tempo', fz['durch']['geschafft'] >= 1 and fz['durch']['gefallen'] == 0 and fz['durch']['kmh'] > 60 and not fz['durch']['imLooping'], fz['durch'])
        pruefe('Kamera danach wieder aufrecht', fz['kameraNachher'] > 0.999, fz['kameraNachher'])
        pruefe('Zu langsam: keine Übernahme, Meldung', fz['zuLangsam']['zuLangsam'] >= 1 and 'Schneller' in fz['zuLangsam']['meldung'], fz['zuLangsam'])
        pruefe('Ball-Treffer: Tempo −60 % (25 → 10 m/s = 36 km/h), Meldung', abs(fz['ball']['kmhNachher'] - 36) <= 3 and fz['ball']['meldung'] != '', fz['ball'])
        pruefe('Wasser-Treffer: Tempo −40 % (≈ 54 km/h) + Schlingern', abs(fz['wasser']['kmhNachher'] - 54) <= 4 and abs(fz['wasser']['vQuer']) > 2, fz['wasser'])
    au = z['abseits_untergrund']
    pruefe('Untergrund neben der Straße = Thema', au['ist'] == au['erwartet'], au)
    page.close()
    return z, pruef


SPUR_INFO = '''(() => { const st = Rennspiel.spiel.strecke; let lp = 0;
  Rennspiel.spiel.szene.traverse(o => { if (o.name === 'Leitplanken') lp++; });
  return { welt: st.welt, spuren: st.spuren.map(e => ({ s0: e.s0, s1: e.s1, n: e.spuren, b: st.breiteBei((e.s0 + e.s1) / 2) })), leitplanken: lp }; })()'''
KI_WEG = '''(() => { const s = Rennspiel.spiel; s.fahrzeuge.forEach((f, i) => { if (i > 0) { const p = s.strecke.spline.punktBei(-40 - 10 * i);
  f.vehicle.setzen(p.x, p.z, Rennspiel.headingAus(p.tx, p.tz)); f.driver && (f.driver.steuerung = () => ({ gas: 0, bremse: 1, lenkung: 0 })); } }); })()'''


def spur_lauf(browser, sid, out):
    """Runde 4: Welt „Stunt" – enge (1 Spur, Leitplanke) und breite (3 Spuren) Stelle. Liefert (info, Prüfzeilen)."""
    page = browser.new_page(viewport={'width': 1280, 'height': 800})
    fehler = []
    page.on('pageerror', lambda e: fehler.append(str(e)))
    page.on('console', lambda m: fehler.append('console.' + m.type + ': ' + m.text) if m.type in ('error',) else None)
    page.goto(url)
    page.wait_for_timeout(1500)
    # Vorab: Standardwelt der Strecke auf 'stunt' (bis main.js/menu.js die Welt-Wahl kennen)
    page.evaluate("(id) => { Rennspiel.trackCatalog.find(t => t.id === id).weltStandard = 'stunt'; }", sid)
    page.evaluate("(id) => Rennspiel.spiel.rennenStarten({ modus: 'solo', streckeId: id, autoIds: ['troc-cabrio', 'multivan'], runden: 3, gegner: 3, schwierigkeit: 'mittel', fahrhilfe: ['wenig', 'wenig'] })", sid)
    page.wait_for_timeout(1000)
    snap = lambda name: page.screenshot(path=os.path.join(out, name))
    info = page.evaluate(SPUR_INFO)
    page.evaluate(KI_WEG)
    for e in info['spuren']:
        if e['n'] == 1:
            page.evaluate(AUTO_NACH_SQ, [e['s0'] - 30, 0]); page.wait_for_timeout(1500)
            snap('23_spur_eng.png')
            blick = page.evaluate(KAMERA_BEI_S, [e['s0'], 45, 16, 40])
            page.evaluate(KAMERA_FREI, blick); page.wait_for_timeout(800)
            snap('23b_spur_eng_oben.png')
            page.evaluate('(() => { const s = Rennspiel.spiel, k = s.kameras[0]; delete k.update; k._erstesMal = true; })()')
        else:
            page.evaluate(AUTO_NACH_SQ, [e['s0'] + 10, 0]); page.wait_for_timeout(1500)
            snap('24_spur_breit.png')
    page.close()
    zeilen = []

    def pruefe(name, ok, info_=''):
        zeilen.append(('OK   ' if ok else 'FEHL ') + '[' + sid + '/stunt] ' + name + (' – ' + str(info_) if info_ != '' else ''))
    pruefe('keine JS-Fehler', not fehler, fehler[:3])
    pruefe('Welt stunt aktiv, 1-Spur- und 3-Spur-Abschnitt', info['welt'] == 'stunt' and sorted(e['n'] for e in info['spuren']) == [1, 3], info)
    pruefe('Leitplanken-Mesh gebaut', info['leitplanken'] == 1, info['leitplanken'])
    return info, zeilen


ids = ['wiese', 'wald', 'wueste', 'fantasie'] if wahl == 'alle' else [wahl]
with sync_playwright() as p:
    browser = p.chromium.launch(args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
    alle = []
    for sid in ids:
        out = sys.argv[2] if len(sys.argv) > 2 and len(ids) == 1 else os.path.join(basis, 'tests', 'out', sid)
        z, pruef = lauf(browser, sid, out)
        print(json.dumps(z, indent=1, ensure_ascii=False))
        alle += pruef
        if sid in ('wiese', 'wald', 'wueste'):
            info, pruef = spur_lauf(browser, sid, out)
            print(json.dumps({'stunt': info}, ensure_ascii=False))
            alle += pruef
    browser.close()
    print('\n'.join(alle))
    sys.exit(0 if all(z.startswith('OK') for z in alle) else 1)
