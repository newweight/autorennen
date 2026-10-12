#!/usr/bin/env python3
"""Headless-Test: öffnet Autorennen.html per file://, startet ein Rennen auf einer Strecke,
macht Screenshots und liest Zustand aus window.Rennspiel.
Aufruf: python3 tests/screenshot_test.py [streckenId] [ausgabeordner]
  streckenId: wiese (Standard) | wald | wueste | fantasie | dino | alpen | alle
        Runde 5b Dino: 30_vulkan, 31_lavasee, 32_deko_dino, 33_dino_strasse_<art>, 33b_dino_nah, 34_dino_treffer, 35_felsbrocken
        Runde 6 (W4-I) Alpen: 40_pass, 41_serpentinen, 42_ueberfuehrung_unten, 43_ueberfuehrung_oben, 43b_ueberfuehrung_seite,
        43c_kreuzung_von_oben, 44_tunnel_berg, 45_see, 46_gipfelkreuz (+ Fahrt über/unter der Brücke: Höhe bleibt auf der Ebene)
        Runde 6 (W4-J) Fantasie-Kreuzung: 50_kreuzung_vorn (Fahrersicht A, Auto quert), 50b_kreuzung_vorn_b (aus der Schleife),
        51_kreuzung_seitlich, 52_kreuzung_oben, 53_warnlicht_ruhig / 53b_warnlicht_an (Mast nah, Lampe an) / 53c_warnlicht_aus
        (Lampe aus), 54_auto_quert (Auto mitten auf der Kreuzung, Blick von A), 55_kreuzung_fahrt (Autopilot über die Kreuzung),
        56_minimap_kreuzung (+ Fahrt A/B: Abschnitt bleibt, Reset auf B bleibt auf B, Warnlicht schnell bei Querverkehr)
Bilder: 01_start, 02_fahrt, 03_links_abseits, 04_reset, 05_cockpit, 06_weit, 07_huegel,
        08_uebersicht, 09_kurve (engste Stelle: Haarnadel/Schikane), 10_minimap (Ausschnitt),
        Wald: 11_tunnel (Baumtunnel) · Wüste: 11_oase, 12_gerade
        Runde 3 (je Strecke, falls vorhanden): 13_tunnel_innen (Scheinwerfer), 13b_tunnel_portal, 14_bruecke,
        14b_bruecke_seite (Senke von der Seite), 15_hindernis_baustelle, 16_hindernis_oel, 17_hindernis_ast, 18_hindernis_sand
        Fantasie: 19_looping_aussen, 19b_looping2_aussen, 20_looping_auto (Verfolger kopfüber), 20b_looping_auto_aussen,
        20c_looping_cockpit, 21_ball (Ball auf der Straße), 21b_ball_treffer, 22_wasser_aktiv, 22b_wasser_blubbern,
        Runde 5: 25_anlauf_meldung (zu langsam → Stopp + HUD), 25b_anlaufposition (nach R), 26_kleber_streifen,
        27_festgeklebt (HUD), 27b_festgeklebt_nah (Fäden/Blasen)
        Runde 4 (Wiese/Wald/Wüste, Welt „Stunt"): 23_spur_eng (1 Spur + Leitplanke), 23b_spur_eng_oben, 24_spur_breit (3 Spuren)
        – main.js kennt die Welt-Wahl noch nicht: der Test setzt vorher trackCatalog[...].weltStandard = 'stunt'.
12.10. Hindernis-Menge (menge_lauf): je Strecke normal/viele/sehrViele in Welt „Hindernisse“ (Anzahl, Draw-Calls), Bilder Wiese/Wüste:
        M1_sehrViele_fahrersicht, M2_sehrViele_uebersicht, M3_sehrViele_schraeg, M4_sehrViele_autopilot.
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
# Runde 5b: liegengebliebene Autos (Gruppe 'Wracks', je Wrack ~12 Auto-Meshes) zählen extra (wracks), nicht zur Strecke.
DRAW_CALLS = '''(() => { const s = Rennspiel.spiel; let n = 0, w = 0; const namen = [];
  const imWrack = (o) => { for (let p = o.parent; p; p = p.parent) if (p.name === 'Wracks') return true; return false; };
  s.szene.children.forEach(g => { if (!(g.name.startsWith('Strecke') || g.name.startsWith('Deko'))) return;
    g.traverse(o => { if ((o.isMesh || o.isInstancedMesh) && o.visible && (!o.isInstancedMesh || o.count > 0) && !(o.userData.stueck > 0)) {
      if (imWrack(o)) { w++; return; } n++; namen.push(o.name); } }); });
  return { meshes: n, wracks: w, namen }; })()'''

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
        if h['typ'] in gemacht or h['typ'] not in bilder: continue      # Wracks (typ wrack/brand) haben eigene Bilder
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
    # Runde 5: Zu langsam (15 m/s, ohne Gas) auf Looping 2 → Anlauf-Bremse stoppt 10 m davor, Meldung; R → Anlaufposition;
    # Vollgas von dort → geschafft
    l2 = lps[1]
    page.evaluate(KI_WEG)
    page.evaluate(AUTO_NACH_SQ, [l2['s'] - 60, 0])
    page.evaluate('(() => { const v = Rennspiel.spiel.fahrzeuge[0].vehicle; v.vLaengs = 15; })()')
    page.evaluate('Rennspiel.spiel.schnellvorlauf(9)')      # Physik ohne Zeichnen (Software-Grafik ist langsam)
    page.wait_for_timeout(600)
    snap('25_anlauf_meldung.png')
    erg['zuLangsam'] = page.evaluate('''(() => { const s = Rennspiel.spiel, f = s.fahrzeuge[0], sp = s.strecke.spline, n = sp.naechster(f.vehicle.x, f.vehicle.z);
      const L = s.strecke.loopings[1];
      return { abstand: +sp.differenzS(L.s, n.s).toFixed(2), imLooping: !!f.vehicle.imLooping, geschafft: f.looping.geschafft,
        meldung: s.huds[0].meldungText || '' }; })()''')
    page.keyboard.press('KeyR'); page.wait_for_timeout(300)
    erg['anlaufPos'] = page.evaluate('''(() => { const s = Rennspiel.spiel, f = s.fahrzeuge[0], sp = s.strecke.spline, n = sp.naechster(f.vehicle.x, f.vehicle.z);
      const L = s.strecke.loopings[1], st = Rennspiel.Anlauf.stellen(s.strecke)[1];
      return { abstand: +sp.differenzS(L.s, n.s).toFixed(1), soll: st.abstand, kmh: f.vehicle.tempoKmh, meldung: s.huds[0].meldungText || '' }; })()''')
    page.wait_for_timeout(600)
    snap('25b_anlaufposition.png')
    vorher = erg['durch']['geschafft']
    page.keyboard.down('ArrowUp')
    page.evaluate('''(n) => { const s = Rennspiel.spiel, lp = s.fahrzeuge[0].looping;
      for (let k = 0; k < 60 * 25 && lp.geschafft <= n && lp.gefallen === 0; k++) s.physikSchritt(1 / 60); }''', vorher)
    page.keyboard.up('ArrowUp')
    erg['vonAnlauf'] = page.evaluate('''(() => { const f = Rennspiel.spiel.fahrzeuge[0]; return { geschafft: f.looping.geschafft, gefallen: f.looping.gefallen,
      eingriffe: f.anlauf.eingriffe }; })()''')
    # Runde 5: Klebestreifen (Abschnitt mit beiden Seiten): Streifen von oben/hinten, dann Auto langsam drauf → festgeklebt
    kl = page.evaluate('(() => { const st = Rennspiel.spiel.strecke, k = st.kleber.find(e => e.seite === 0) || st.kleber[0]; return { s0: k.s0, s1: k.s1, q: st.breite / 2 + st.randBreite / 2 }; })()')
    page.evaluate(AUTO_NACH_SQ, [kl['s0'] - 30, 0]); page.wait_for_timeout(300)
    blick = page.evaluate(KAMERA_BEI_S, [kl['s0'] + 5, 25, 9, 30])
    page.evaluate(KAMERA_FREI, blick); page.wait_for_timeout(800)
    snap('26_kleber_streifen.png')
    page.evaluate('(() => { const s = Rennspiel.spiel, k = s.kameras[0]; delete k.update; k._erstesMal = true; })()')
    page.evaluate(AUTO_NACH_SQ, [kl['s0'] + 12, kl['q']])
    page.evaluate('(() => { Rennspiel.spiel.fahrzeuge[0].vehicle.vLaengs = 3; })()')
    page.evaluate('''(() => { const s = Rennspiel.spiel, f = s.fahrzeuge[0];
      for (let k = 0; k < 60 * 6 && !(f.kleber && f.kleber.klebt > 0 && f.kleber.klebt < 4.2); k++) s.physikSchritt(1 / 60); })()''')
    erg['kleber'] = page.evaluate('''(() => { const s = Rennspiel.spiel, f = s.fahrzeuge[0];
      return { klebt: +f.kleber.klebt.toFixed(1), untergrund: f.vehicle.untergrund, kmh: f.vehicle.tempoKmh, optik: !!(f._kleberOptik && f._kleberOptik.visible),
        meldung: s.huds[0].meldungText || '' }; })()''')
    page.wait_for_timeout(500)
    snap('27_festgeklebt.png')
    # Außensicht nah am festgeklebten Auto (Fäden/Blasen)
    blick = page.evaluate('''(() => { const s = Rennspiel.spiel, v = s.fahrzeuge[0].vehicle, sp = s.strecke.spline, n = sp.naechster(v.x, v.z), p = sp.punktBei(n.s);
      const sg = n.seitenabstand > 0 ? -1 : 1, x = v.x + p.nx * sg * 5 - p.tx * 3, z = v.z + p.nz * sg * 5 - p.tz * 3;
      return [x, s.strecke.hoeheAn(x, z) + 2.2, z, v.x, v.y + 0.4, v.z, true]; })()''')
    page.evaluate(KAMERA_FREI, blick); page.wait_for_timeout(700)
    snap('27b_festgeklebt_nah.png')
    page.evaluate('(() => { const s = Rennspiel.spiel, k = s.kameras[0]; delete k.update; k._erstesMal = true; })()')
    page.evaluate('''(() => { const s = Rennspiel.spiel, f = s.fahrzeuge[0];
      for (let k = 0; k < 60 * 6 && f.kleber.klebt > 0; k++) s.physikSchritt(1 / 60); })()''')
    erg['geloest'] = page.evaluate('''(() => { const s = Rennspiel.spiel, f = s.fahrzeuge[0];
      return { klebt: f.kleber.klebt, frei: +f.kleber.frei.toFixed(1), optik: !!(f._kleberOptik && f._kleberOptik.visible), meldung: s.huds[0].meldungText || '' }; })()''')
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


def dino_bilder(page, snap):
    """Runde 5b: Vulkan/Lavasee, Deko-Dinos, laufender Dino auf der Straße + Treffer, Felsbrocken. Liefert Messwerte."""
    erg = {}
    page.evaluate(KI_WEG)
    info = page.evaluate('''(() => { const s = Rennspiel.spiel; let lava = null, vulkan = 0, rauch = 0, dinos = 0;
      s.szene.traverse(o => { if (o.name === 'Lavasee') lava = o.userData; if (o.name === 'Vulkan') vulkan++; if (o.name === 'Vulkanrauch') rauch++;
        if (o.name === 'Dinos') dinos += o.count; });
      return { lava, vulkan, rauch, dekoDinos: dinos, dinoStellen: s.dynamik ? s.dynamik.dinoStellen.map(d => ({ s: d.s, von: d.von, art: d.art })) : [],
        fels: !!(s.dynamik && s.dynamik.felsOptik) }; })()''')
    erg['info'] = info
    # Start-Blick Richtung Vulkan (Kamera hinter dem Start, etwas erhöht)
    blick = page.evaluate(KAMERA_BEI_S, [30, 40, 7, 120])
    page.evaluate(KAMERA_FREI, blick); page.wait_for_timeout(900)
    snap('30_vulkan.png')
    erg['vulkanPixel'] = page.evaluate('''(() => { const s = Rennspiel.spiel; let v = null; s.szene.traverse(o => { if (o.name === 'Vulkan') v = o; });
      const p = new THREE.Vector3().setFromMatrixPosition(v.matrixWorld).project(s.kameras[0].kamera);
      return { x: +p.x.toFixed(2), y: +p.y.toFixed(2), z: +p.z.toFixed(3) }; })()''')
    # Lavasee vom nächsten Streckenpunkt
    if info['lava']:
        blick = page.evaluate('''(l) => { const st = Rennspiel.spiel.strecke, sp = st.spline, n = sp.naechster(l.x, l.z), a = sp.punktBei(n.s - 30);
          return [a.x, st.hoeheAn(a.x, a.z) + 9, a.z, l.x, st.hoeheAn(l.x, l.z), l.z, true]; }''', info['lava'])
        page.evaluate(KAMERA_FREI, blick); page.wait_for_timeout(900)
        snap('31_lavasee.png')
    page.evaluate('(() => { const s = Rennspiel.spiel, k = s.kameras[0]; delete k.update; k._erstesMal = true; })()')
    # Deko-Dino: Kamera auf den ersten Langhals (Instanz 0 des ersten Dinos-Meshes) von der Straße aus
    blick = page.evaluate('''(() => { const s = Rennspiel.spiel, st = s.strecke, sp = st.spline; let m = null;
      s.szene.traverse(o => { if (o.name === 'Dinos' && o.count && !m) m = o; });
      const m4 = new THREE.Matrix4(); m.getMatrixAt(0, m4); const p = new THREE.Vector3().setFromMatrixPosition(m4);
      const n = sp.naechster(p.x, p.z), a = sp.punktBei(n.s);
      return [a.x, st.hoeheAn(a.x, a.z) + 3, a.z, p.x, p.y + 5, p.z, true]; })()''')
    page.evaluate(KAMERA_FREI, blick); page.wait_for_timeout(900)
    snap('32_deko_dino.png')
    page.evaluate('(() => { const s = Rennspiel.spiel, k = s.kameras[0]; delete k.update; k._erstesMal = true; })()')
    # Laufender Dino mitten auf der Straße (Zeit der Dynamik eingefroren), Auto 28 m davor
    for nr in range(len(info['dinoStellen'])):
        d = page.evaluate('''(nr) => { const s = Rennspiel.spiel, dy = s.dynamik, st = dy.dinoStellen[nr];
          if (!dy._schrittOrig) { dy._schrittOrig = dy.schritt; dy.schritt = function () { return {}; }; }
          st.dinos.length = 0; st.timer = 0; dy._dinoSchritt(1 / 60); st.timer = 1e9;
          const dn = st.dinos[0]; dn.q = 1.5 * st.von; dn.phase = 0.9; dy._dinoWelt(dn); dy.animieren();
          return { s: dn.s, art: dn.art }; }''', nr)
        page.evaluate(AUTO_NACH_SQ, [d['s'] - 30, -2])
        page.wait_for_timeout(1300)
        snap('33_dino_strasse_' + d['art'] + '.png')
    # Seitenansicht des Dinos auf der Straße
    blick = page.evaluate('''(() => { const s = Rennspiel.spiel, st = s.strecke, dn = s.dynamik.dinoStellen[0].dinos[0], p = st.spline.punktBei(dn.s);
      return [dn.x - p.tx * 18 + p.nx * 10, dn.y + 4, dn.z - p.tz * 18 + p.nz * 10, dn.x, dn.y + 2, dn.z, true]; })()''')
    page.evaluate(KAMERA_FREI, blick); page.wait_for_timeout(900)
    snap('33b_dino_nah.png')
    page.evaluate('(() => { const s = Rennspiel.spiel, k = s.kameras[0]; delete k.update; k._erstesMal = true; })()')
    # Treffer: Dynamik läuft wieder, Dino der Stelle 0 steht mitten auf der Spur des Autos, Auto mit 25 m/s hinein
    page.evaluate('''(() => { const dy = Rennspiel.spiel.dynamik; dy.schritt = dy._schrittOrig; delete dy._schrittOrig; })()''')
    s0 = page.evaluate('''(() => { const s = Rennspiel.spiel, dy = s.dynamik, st = dy.dinoStellen[0], dn = st.dinos[0];
      dn.q = 0; dn.vq = 0; dy._dinoWelt(dn); dn.getroffen.clear(); return dn.s; })()''')
    page.evaluate(AUTO_NACH_SQ, [s0 - 14, 0])
    page.evaluate('(() => { const s = Rennspiel.spiel; s.fahrzeuge[0].vehicle.vLaengs = 25; s.dynamikStoesse = []; })()')
    try:
        page.wait_for_function('(Rennspiel.spiel.huds[0].meldungText || "").startsWith("Dino")', timeout=15000)
    except Exception:
        pass
    erg['treffer'] = page.evaluate('''(() => { const s = Rennspiel.spiel, v = s.fahrzeuge[0].vehicle, dn = s.dynamik.dinoStellen[0].dinos[0];
      return { kmhNachher: Math.round(v.vLaengs * 3.6), meldung: s.huds[0].meldungText || '', dinoDa: !!dn, getroffen: dn ? dn.getroffen.size : 0 }; })()''')
    page.wait_for_timeout(200)
    snap('34_dino_treffer.png')
    # Felsbrocken (Strohballen-Mechanik) auf der Straße
    if info['fels']:
        f = page.evaluate('''(() => { const dy = Rennspiel.spiel.dynamik, st = dy.strohStellen[0];
          st.ballen.length = 0; st.timer = 0; dy._strohSchritt(1 / 60); st.timer = 1e9; const b = st.ballen[0]; b.q = 0; b.vq = 0.01; dy._strohWelt(b); dy.animieren();
          return { s: b.s }; })()''')
        page.evaluate(AUTO_NACH_SQ, [f['s'] - 22, 2])
        page.wait_for_timeout(1200)
        snap('35_felsbrocken.png')
    return erg


# Physik synchron vorspulen, bis die Bedingung (JS-Ausdruck mit s = Rennspiel.spiel) gilt – höchstens sek Sekunden
VORSPULEN_BIS = '''([bed, sek]) => { const s = Rennspiel.spiel, f = new Function('s', 'return ' + bed);
  for (let t = 0; t < sek; t += 1 / 60) { s.physikSchritt(1 / 60); if (f(s)) return +t.toFixed(2); } return null; }'''
DYN_FRIEREN = '''(() => { const dy = Rennspiel.spiel.dynamik; if (!dy._schrittW2) { dy._schrittW2 = dy.schritt; dy.schritt = function () { return { ereignisse: [] }; }; } })()'''
DYN_WEITER = '''(() => { const dy = Rennspiel.spiel.dynamik; if (dy._schrittW2) { dy.schritt = dy._schrittW2; delete dy._schrittW2; } })()'''
KAMERA_LOS = '(() => { const s = Rennspiel.spiel, k = s.kameras[0]; delete k.update; k._erstesMal = true; })()'


def dino_w2c_bilder(page, snap):
    """Runde 6 (W2-C): Lava-Zunge, Ausbruch (Himmel rot + Bomben), Krater, Meteorit-Schatten + Einschlag,
    Flugsaurier über dem Auto, Tunnel 2 innen, Berg-Massiv, stehender Dino. Liefert Messwerte."""
    erg = {}
    page.evaluate(KI_WEG)
    info = page.evaluate('''(() => { const s = Rennspiel.spiel, st = s.strecke, dy = s.dynamik;
      let berg = 0; s.szene.traverse(o => { if (o.name === 'Bergmassiv') berg++; });
      return { lava: st.hindernisse.filter(h => h.typ === 'lava').map(h => ({ s: h.s, seite: h.seite })), tunnel: st.tunnel.map(t => [t.s0, t.s1]),
        berg, dinoStellen: dy.dinoStellen.length, vulkan: !!dy.vulkan, meteore: dy.meteorStellen.length, flug: !!dy.flugsaurier }; })()''')
    erg['info'] = info
    # 40: Lava-Zunge aus Fahrersicht (Auto auf der freien Hälfte)
    if info['lava']:
        l = info['lava'][0]
        page.evaluate(AUTO_NACH_SQ, [l['s'] - 24, -l['seite'] * 2.5]); page.wait_for_timeout(1400)
        snap('40_lava_zunge.png')
        blick = page.evaluate(KAMERA_BEI_S, [l['s'], 16, 7, 6])
        page.evaluate(KAMERA_FREI, blick); page.wait_for_timeout(900)
        snap('40b_lava_oben.png')
        page.evaluate(KAMERA_LOS)
        # Lava-Kontakt: Auto auf die Lava-Hälfte, rollt hinein → 1 s Stopp, Meldung „Lava!"
        page.evaluate(AUTO_NACH_SQ, [l['s'] - 12, l['seite'] * 3.2])
        page.evaluate('(() => { Rennspiel.spiel.fahrzeuge[0].vehicle.vLaengs = 12; })()')
        page.evaluate(VORSPULEN_BIS, ['(s.huds[0].meldungText || "").startsWith("Lava")', 3])
        erg['lavaKontakt'] = page.evaluate('''(() => { const s = Rennspiel.spiel, v = s.fahrzeuge[0].vehicle;
          return { meldung: s.huds[0].meldungText || '', stopp: +(v._lavaStopp || 0).toFixed(2), kmh: Math.round(v.vLaengs * 3.6), rauch: s.dynamik.puffs.length }; })()''')
        page.wait_for_timeout(250)
        snap('40c_lava_kontakt.png')
    # 41: Vulkanausbruch – Auto auf der langen Geraden, Ausbruch sofort auslösen, nach dem Grollen Bomben im Flug
    page.evaluate(AUTO_NACH_SQ, [700, 0])
    # Führender = Auto an s 700 (der Rennfortschritt springt beim Versetzen nicht mit)
    page.evaluate('''(() => { const dy = Rennspiel.spiel.dynamik; dy._schrittEcht = dy.schritt;
      dy.schritt = function (dt, info) { info.fortschritt = 700; return dy._schrittEcht.call(dy, dt, info); }; })()''')
    page.evaluate('''(() => { const dy = Rennspiel.spiel.dynamik; dy.vulkan.naechster = 0; dy.vulkan.phase = 'ruhe'; })()''')
    erg['ausbruchNach'] = page.evaluate(VORSPULEN_BIS, ['s.dynamik.bomben.length >= 3 && s.dynamik.bomben[0].t > 1.9', 9])
    page.evaluate(DYN_FRIEREN)
    page.wait_for_timeout(500)
    erg['ausbruch'] = page.evaluate('''(() => { const s = Rennspiel.spiel, dy = s.dynamik, bg = s.szene.background;
      return { glut: +dy.vulkanGlut.toFixed(2), bomben: dy.bomben.length, himmel: [bg.r, bg.g, bg.b].map(x => +x.toFixed(2)), meldung: s.huds[0].meldungText || '',
        hoehen: dy.bomben.map(b => +(b.y - b.y1).toFixed(1)), zielS: dy.bomben.map(b => Math.round(b.s)) }; })()''')
    page.wait_for_timeout(2600)     # Meldung ausblenden lassen (verdeckt sonst den Horizont mit den Bomben)
    bild41 = page.screenshot(path=os.path.join(page._ausgabe, '41_ausbruch.png')) if hasattr(page, '_ausgabe') else None
    if bild41 is None:
        snap('41_ausbruch.png')
    else:
        # Himmel im Bild (oben, zwischen Platz-Anzeige und Uhr): rötlich?
        st_ = ImageStat.Stat(Image.open(io.BytesIO(bild41)).convert('RGB').crop((int(0.42 * 1280), int(0.30 * 800), int(0.58 * 1280), int(0.355 * 800))))   # W2-C1: unter der Meldung
        erg['ausbruch']['himmelBild'] = [round(x) for x in st_.mean]
    # von oben-seitlich auf die Bomben schauen
    blick = page.evaluate('''(() => { const s = Rennspiel.spiel, dy = s.dynamik, b = dy.bomben[0], v = s.fahrzeuge[0].vehicle;
      return b ? [v.x, v.y + 14, v.z, b.x, b.y, b.z, true] : [v.x, v.y + 10, v.z, v.x + 50, v.y, v.z, true]; })()''')
    page.evaluate(KAMERA_FREI, blick); page.wait_for_timeout(800)
    snap('41b_bomben.png')
    page.evaluate(KAMERA_LOS)
    page.evaluate(DYN_WEITER)
    page.evaluate(VORSPULEN_BIS, ['s.dynamik.bomben.length === 0 && s.strecke.hindernisse.some(h => h.typ === "krater")', 6])
    k = page.evaluate('''(() => { const st = Rennspiel.spiel.strecke, h = st.hindernisse.find(x => x.typ === 'krater'); return h ? { s: h.s, q: h.seitenabstand } : null; })()''')
    erg['krater'] = k
    page.evaluate('(() => { const dy = Rennspiel.spiel.dynamik; if (dy._schrittEcht) { dy.schritt = dy._schrittEcht; delete dy._schrittEcht; } })()')
    if k:
        page.evaluate(DYN_FRIEREN)
        page.evaluate(AUTO_NACH_SQ, [k['s'] - 18, k['q'] * 0.3]); page.wait_for_timeout(1300)
        snap('42_krater.png')
        page.evaluate(DYN_WEITER)
        # Krater anfahren: Tempo −50 %, Meldung
        page.evaluate(AUTO_NACH_SQ, [k['s'] - 7, k['q']])
        page.evaluate('(() => { Rennspiel.spiel.fahrzeuge[0].vehicle.vLaengs = 20; })()')
        page.evaluate(VORSPULEN_BIS, ['(s.huds[0].meldungText || "").startsWith("Krater")', 2])
        erg['kraterKontakt'] = page.evaluate('''(() => { const s = Rennspiel.spiel, v = s.fahrzeuge[0].vehicle;
          return { meldung: s.huds[0].meldungText || '', kmh: Math.round(v.vLaengs * 3.6) }; })()''')
    # 43: Meteorit – Flug anhalten, wenn der Schatten auf der Straße liegt
    page.evaluate(DYN_WEITER)
    m = page.evaluate('''(() => { const s = Rennspiel.spiel, dy = s.dynamik, m = dy.meteorStellen[0]; m.phase = 'flug'; m.zeit = 0; return { s: m.s, von: m.von }; })()''')
    page.evaluate(AUTO_NACH_SQ, [m['s'] - 40, 0])
    page.evaluate(VORSPULEN_BIS, ['!!s.dynamik.meteorStellen[0].schatten && Math.abs(s.strecke.spline.naechster(s.dynamik.meteorStellen[0].schatten.x, s.dynamik.meteorStellen[0].schatten.z).seitenabstand) < 2', 3])
    page.evaluate(DYN_FRIEREN)
    blick = page.evaluate('''(() => { const s = Rennspiel.spiel, m = s.dynamik.meteorStellen[0], v = s.fahrzeuge[0].vehicle;
      const sc = m.schatten || { x: m.x, z: m.z, y: m.y }; return [v.x, v.y + 7, v.z, (sc.x * 2 + m.pos.x) / 3, (sc.y * 2 + m.pos.y) / 3, (sc.z * 2 + m.pos.z) / 3, true]; })()''')
    page.evaluate(KAMERA_FREI, blick)
    erg['meteor'] = page.evaluate('''(() => { const s = Rennspiel.spiel, m = s.dynamik.meteorStellen[0];
      return { schatten: m.schatten ? { r: +m.schatten.r.toFixed(1), q: +s.strecke.spline.naechster(m.schatten.x, m.schatten.z).seitenabstand.toFixed(1) } : null,
        hoehe: m.pos ? +(m.pos.y - m.y).toFixed(0) : null }; })()''')
    page.wait_for_timeout(800)
    snap('43_meteor_schatten.png')
    page.evaluate(KAMERA_LOS)
    page.evaluate(DYN_WEITER)
    page.evaluate(VORSPULEN_BIS, ['s.dynamik.meteorStellen[0].stroh.ballen.length >= 3', 3])
    page.evaluate('Rennspiel.spiel.schnellvorlauf(0.9)')
    page.evaluate(DYN_FRIEREN)
    erg['meteorBrocken'] = page.evaluate('Rennspiel.spiel.dynamik.meteorStellen[0].stroh.ballen.length')
    blick = page.evaluate('''(() => { const s = Rennspiel.spiel, st = s.strecke, m = s.dynamik.meteorStellen[0], p = st.spline.punktBei(m.s);
      return [p.x - p.tx * 30 - p.nx * m.von * 12, st.hoeheAn(p.x, p.z) + 9, p.z - p.tz * 30 - p.nz * m.von * 12, m.x, m.y + 2, m.z, true]; })()''')
    page.evaluate(KAMERA_FREI, blick); page.wait_for_timeout(800)
    snap('43b_meteor_einschlag.png')
    page.evaluate(KAMERA_LOS)
    page.evaluate(DYN_WEITER)
    # 44: Flugsaurier – Auto steht auf der Geraden, Anflug auslösen, einfrieren wenn er über dem Auto ist
    page.evaluate(AUTO_NACH_SQ, [760, 2])
    page.evaluate('''(() => { const F = Rennspiel.spiel.dynamik.flugsaurier; F.aktiv = false; F.timer = 0; F.minUeberAuto = Infinity; })()''')
    page.evaluate(VORSPULEN_BIS, ['s.dynamik.flugsaurier.aktiv && s.dynamik.flugsaurier.d < 9', 12])
    page.evaluate(DYN_FRIEREN)
    erg['flugsaurier'] = page.evaluate('''(() => { const s = Rennspiel.spiel, F = s.dynamik.flugsaurier, v = s.fahrzeuge[0].vehicle;
      return { aktiv: F.aktiv, d: +F.d.toFixed(1), ueberAuto: +(F.y - v.y).toFixed(2), meldung: s.huds[0].meldungText || '' }; })()''')
    page.wait_for_timeout(500)
    snap('44_flugsaurier.png')
    blick = page.evaluate('''(() => { const s = Rennspiel.spiel, st = s.strecke, F = s.dynamik.flugsaurier, v = s.fahrzeuge[0].vehicle, p = st.spline.punktBei(st.spline.naechster(v.x, v.z).s);
      return [v.x + p.nx * 16 - p.tx * 6, v.y + 3, v.z + p.nz * 16 - p.tz * 6, v.x, v.y + 2, v.z, true]; })()''')
    page.evaluate(KAMERA_FREI, blick); page.wait_for_timeout(800)
    snap('44b_flugsaurier_seite.png')
    page.evaluate(KAMERA_LOS)
    page.evaluate(DYN_WEITER)
    page.evaluate(VORSPULEN_BIS, ['!s.dynamik.flugsaurier.aktiv', 12])
    erg['flugsaurier']['minUeberAuto'] = page.evaluate('+Rennspiel.spiel.dynamik.flugsaurier.minUeberAuto.toFixed(3)')
    # 45: Tunnel 2 innen (in der Kurve) + 46: Berg-Massiv von außen
    if len(info['tunnel']) >= 2:
        t2 = info['tunnel'][1]
        page.evaluate(AUTO_NACH_SQ, [t2[0] + 85, 0]); page.wait_for_timeout(1500)
        snap('45_tunnel2_innen.png')
        page.evaluate(AUTO_NACH_SQ, [info['tunnel'][0][0] + 25, 0]); page.wait_for_timeout(1500)   # W2-C1
        snap('45a_tunnel1_innen.png')
        page.evaluate(AUTO_NACH_SQ, [info['tunnel'][0][1] + 30, 0]); page.wait_for_timeout(1400)
        snap('45b_schlucht.png')
        blick = page.evaluate('''([a, b]) => { const st = Rennspiel.spiel.strecke, sp = st.spline, m = sp.punktBei((a + b) / 2), p0 = sp.punktBei(a - 120);
          return [p0.x - p0.nx * 60, st.hoeheAn(p0.x, p0.z) + 45, p0.z - p0.nz * 60, m.x, st.hoeheAn(m.x, m.z) + 15, m.z, true]; }''', [info['tunnel'][0][0], t2[1]])
        page.evaluate(KAMERA_FREI, blick); page.wait_for_timeout(900)
        snap('46_bergmassiv.png')
        page.evaluate(KAMERA_LOS)
        page.evaluate(AUTO_NACH_SQ, [info['tunnel'][0][0] - 45, 0]); page.wait_for_timeout(1400)
        snap('46b_portal_tunnel1.png')
    # 47: stehender Dino mit gesenktem Kopf auf der Straße
    page.evaluate(DYN_FRIEREN)
    d = page.evaluate('''(() => { const s = Rennspiel.spiel, dy = s.dynamik, st = dy.dinoStellen[2] || dy.dinoStellen[0];
      st.dinos.length = 0; st.timer = 0; dy._erg = { ereignisse: [] }; dy._dinoSchritt(1 / 60); st.timer = 1e9;
      const dn = st.dinos[0]; dn.q = -2 * st.von; dn.zustand = 'steht'; dn.kopf = 1; dn.stehRest = 99; dy._dinoWelt(dn); dy.animieren();
      return { s: dn.s }; })()''')
    page.evaluate(AUTO_NACH_SQ, [d['s'] - 26, 2]); page.wait_for_timeout(1300)
    snap('47_dino_steht.png')
    # W2-C2: Dino kehrt mitten auf der Straße um (steht quer, dreht sich zurück) – Seitenblick; dann brüllend (Kopf hoch)
    page.evaluate('''(() => { const dy = Rennspiel.spiel.dynamik, st = dy.dinoStellen[2] || dy.dinoStellen[0], dn = st.dinos[0];
      dn.q = 0.6; dn.umkehren = true; dn.umgekehrt = true; dn.zustand = 'laeuft'; dn.vq = st.von * st.tempo; dn.kopf = 0.3; dn.phase = 0.8;
      dy._dinoWelt(dn); dy.animieren(); })()''')
    blick = page.evaluate('''(() => { const s = Rennspiel.spiel, st = s.strecke, dn = (s.dynamik.dinoStellen[2] || s.dynamik.dinoStellen[0]).dinos[0], p = st.spline.punktBei(dn.s);
      return [dn.x - p.tx * 16 + p.nx * 6, dn.y + 4, dn.z - p.tz * 16 + p.nz * 6, dn.x, dn.y + 2, dn.z, true]; })()''')
    page.evaluate(KAMERA_FREI, blick); page.wait_for_timeout(800)
    snap('47b_dino_umkehr.png')
    erg['umkehr'] = page.evaluate('''(() => { const dn = (Rennspiel.spiel.dynamik.dinoStellen[2] || Rennspiel.spiel.dynamik.dinoStellen[0]).dinos[0];
      return { q: +dn.q.toFixed(2), vq: +dn.vq.toFixed(2), umgekehrt: dn.umgekehrt }; })()''')
    page.evaluate('''(() => { const dy = Rennspiel.spiel.dynamik, dn = (dy.dinoStellen[2] || dy.dinoStellen[0]).dinos[0];
      dn.zustand = 'steht'; dn.bruellt = 1.2; dn.kopf = -1.4; dn.stehRest = 99;
      for (let k = 0; k < 4; k++) { dy._schrittW2.call(dy, 1 / 15, { fortschritt: 0, runden: 3, autos: [] }); dn.bruellt = Math.max(dn.bruellt, 0.6); dn.kopf = -1.4; }
      dy.animieren(); })()''')
    page.wait_for_timeout(500)
    snap('47c_dino_bruellt.png')
    page.evaluate(KAMERA_LOS)
    page.evaluate('''(() => { const st = Rennspiel.spiel.dynamik.dinoStellen[2] || Rennspiel.spiel.dynamik.dinoStellen[0]; st.dinos.length = 0; st.timer = 3; })()''')
    page.evaluate(DYN_WEITER)
    return erg


def wald_tiere_bilder(page, snap):
    """Runde 6 (W2-C): Reh und Bär auf der Straße, grasende Rehe, Reh-Treffer. Liefert Messwerte."""
    erg = {}
    page.evaluate(KI_WEG)
    info = page.evaluate('''(() => { const dy = Rennspiel.spiel.dynamik; return dy ? { stellen: dy.tierStellen.map(t => ({ art: t.art, s: t.s, von: t.von })),
      grasend: dy.grasendeRehe.map(r => ({ s: r.s, q: r.q })) } : null; })()''')
    erg['info'] = info
    if not info:
        return erg
    # W2-C2: Größen aus den (skalierten) Modellen: Reh Kopf/Ohren ~1,2 m, Bär ~1,5 m; Draw-Calls inkl. Dynamik-Gruppe (obere Grenze)
    erg['groesse'] = page.evaluate('''(() => { const T = Rennspiel.spiel.dynamik._tierM && Rennspiel.spiel.dynamik._tierM.T; if (!T) return null;
      const bb = (g) => { g.computeBoundingBox(); return g.boundingBox; };
      return { reh: +(T.reh.kopfPunkt[1] + bb(T.reh.kopf).max.y).toFixed(2), rehRuecken: +bb(T.reh.koerper).max.y.toFixed(2),
        rehLaenge: +(bb(T.reh.koerper).max.x - bb(T.reh.koerper).min.x).toFixed(2),
        baer: +bb(T.baer.koerper).max.y.toFixed(2), baerLaenge: +(bb(T.baer.koerper).max.x - bb(T.baer.koerper).min.x).toFixed(2) }; })()''')
    erg['drawCallsDynamik'] = page.evaluate('''(() => { let n = 0; const namen = [];
      Rennspiel.spiel.szene.children.forEach(g => { if (g.name !== 'Dynamik') return;
        g.traverse(o => { if ((o.isMesh || o.isInstancedMesh) && o.visible) { n++; namen.push(o.name); } }); });
      return { meshes: n, namen }; })()''')
    page.evaluate(DYN_FRIEREN)
    for art in ('reh', 'baer'):
        nr = next((i for i, t in enumerate(info['stellen']) if t['art'] == art), None)
        if nr is None: continue
        d = page.evaluate('''(nr) => { const s = Rennspiel.spiel, dy = s.dynamik, st = dy.tierStellen[nr];
          st.tiere.length = 0; st.timer = 0; st.zaehler = 1; dy._tierSchritt(1 / 60); st.timer = 1e9;
          const t = st.tiere[0]; t.q = 1.5 * st.von; t.phase = 0.5; t.beinPhase = 0.6; t.sprung = t.art === 'reh' ? 0.6 : 0.05; t.zustand = 'laeuft';
          dy._tierWelt(t); dy.animieren(); return { s: t.s, art: t.art, geweih: t.geweih }; }''', nr)
        page.evaluate(AUTO_NACH_SQ, [d['s'] - 18, -2]); page.wait_for_timeout(1300)
        snap('48_' + art + '_strasse.png')
        blick = page.evaluate('''(nr) => { const s = Rennspiel.spiel, st = s.strecke, t = s.dynamik.tierStellen[nr].tiere[0], p = st.spline.punktBei(t.s);
          return [t.x - p.tx * 7 + p.nx * 4, t.y + 2, t.z - p.tz * 7 + p.nz * 4, t.x, t.y + 0.9, t.z, true]; }''', nr)
        page.evaluate(KAMERA_FREI, blick); page.wait_for_timeout(800)
        snap('48b_' + art + '_nah.png')
        page.evaluate(KAMERA_LOS)
        erg[art] = d
        if art == 'reh':
            # W2-C2: Reh bleibt mitten auf der Straße stehen und schaut zum Auto (Kopf zur Seite)
            page.evaluate('''(nr) => { const dy = Rennspiel.spiel.dynamik, t = dy.tierStellen[nr].tiere[0];
              t.q = 0.5 * Math.sign(t.q || 1); t.zustand = 'schaut'; t.kopfDreh = 1; t.sprung = 0; t.schauRest = 99; t.beinPhase = 0; dy._tierWelt(t); dy.animieren(); }''', nr)
            page.evaluate(AUTO_NACH_SQ, [d['s'] - 8, 1.5]); page.wait_for_timeout(1200)
            snap('48c_reh_schaut.png')
    if info['grasend']:
        r = info['grasend'][0]
        blick = page.evaluate('''(r) => { const st = Rennspiel.spiel.strecke, sp = st.spline, p = sp.punktBei(r.s - 10), q = sp.punktBei(r.s);
          const x = q.x + q.nx * r.q, z = q.z + q.nz * r.q; return [p.x, st.hoeheAn(p.x, p.z) + 2.2, p.z, x, st.hoeheAn(x, z) + 0.6, z, true]; }''', r)
        page.evaluate(KAMERA_FREI, blick); page.wait_for_timeout(900)
        snap('50_rehe_grasen.png')
        page.evaluate(KAMERA_LOS)
    # Bär-Treffer: Auto fährt hinein → −60 %, Meldung „Bär!"
    nr = next((i for i, t in enumerate(info['stellen']) if t['art'] == 'baer'), None)
    if nr is not None:
        page.evaluate(DYN_WEITER)
        s0 = page.evaluate('''(nr) => { const dy = Rennspiel.spiel.dynamik, st = dy.tierStellen[nr], t = st.tiere[0];
          t.q = 0; t.vq = 0.001; dy._tierWelt(t); t.getroffen.clear(); return t.s; }''', nr)
        page.evaluate(AUTO_NACH_SQ, [s0 - 12, 0])
        page.evaluate('(() => { Rennspiel.spiel.fahrzeuge[0].vehicle.vLaengs = 25; })()')
        page.evaluate(VORSPULEN_BIS, ['(s.huds[0].meldungText || "").startsWith("Bär")', 2])
        erg['baerTreffer'] = page.evaluate('''(() => { const s = Rennspiel.spiel, v = s.fahrzeuge[0].vehicle; return { meldung: s.huds[0].meldungText || '', kmh: Math.round(v.vLaengs * 3.6) }; })()''')
        page.wait_for_timeout(200)
        snap('49_baer_treffer.png')
    page.evaluate(DYN_WEITER)
    return erg


# Runde 6 (W4-I): Alpen – Auto an (s, q) setzen MIT Streckenindex (an der Überführung sonst falsche Ebene), Fahrer nr
AUTO_SQ_INDEX = """([s, q, nr]) => { const sp = Rennspiel.spiel.strecke.spline, st = Rennspiel.spiel.strecke, p = sp.punktBei(s), f = Rennspiel.spiel.fahrzeuge[nr];
  f.vehicle.setzen(p.x + p.nx * q, p.z + p.nz * q, Rennspiel.headingAus(p.tx, p.tz)); f.index = sp.indexBei(s);
  f.vehicle.y = st.hoeheAn(f.vehicle.x, f.vehicle.z, f.index); f.vehicle.vLaengs = 0; f.vehicle.vQuer = 0;
  if (Rennspiel.spiel._vorherAngleichen) Rennspiel.spiel._vorherAngleichen(f); Rennspiel.spiel.kameras[0]._erstesMal = true; }"""
JAGD_KAMERA = """(() => { const k = Rennspiel.spiel.kameras[0]; delete k.update; k._erstesMal = true;
  const s = Rennspiel.spiel; if (s.qualitaet) s.kameras.forEach(kk => kk.sichtweiteSetzen(s.qualitaet.sicht + 20)); })()"""


def alpen_bilder(page, snap):
    """W4-I: Pass, Serpentinen, Überführung von unten/oben/seitlich, Tunnel im Berg, See, Gipfelkreuz + Fahrten über/unter der Brücke."""
    erg = {}
    page.evaluate('Rennspiel.config.grafik.adaptiv = false')
    # Gegner bremsen (sie stören die Bilder nicht), Spieler 0 wird gesetzt
    # (Bremse 0: im Stand würde die Bremse rückwärts rollen lassen)
    page.evaluate("Rennspiel.spiel.fahrzeuge.forEach((f, i) => { if (i > 0 && f.driver) f.driver.steuerung = () => ({ gas: 0, bremse: 0, lenkung: 0 }); })")
    info = page.evaluate("""(() => { const s = Rennspiel.spiel, st = s.strecke, sp = st.spline, u = st.ueberfuehrungen[0];
      let pass = sp.punkte[0]; sp.punkte.forEach(p => { if (p.y > pass.y) pass = p; });
      let deko = null, kranz = 0, see = null, kreuz = null; s.szene.traverse(o => { if (o.name === 'Bergkranz') kranz++; if (o.name === 'Bergsee') see = o.position.toArray(); });
      s.szene.children.forEach(g => { if (g.name.startsWith('Deko')) deko = g.userData.anzahl; });
      let ueb = 0; s.szene.traverse(o => { if (o.name === 'Ueberfuehrung') ueb++; });
      return { kr: u.kreuzung, s0: u.s0, s1: u.s1, pass: { s: pass.s, y: pass.y }, tunnel: st.tunnel.map(t => [t.s0, t.s1]), deko, kranz, see, ueb,
        bruecke: st.bruecken.map(b => [b.s0, b.s1]), haar: (() => { let b = sp.punkte[0]; sp.punkte.forEach(p => { if (Math.abs(p.kruemmung) > Math.abs(b.kruemmung)) b = p; }); return b.s; })() }; })()""")
    erg['info'] = info
    kr = info['kr']
    # 40 Pass (Fahrersicht, kurz vor dem höchsten Punkt)
    page.evaluate(JAGD_KAMERA); page.evaluate(AUTO_SQ_INDEX, [info['pass']['s'] - 35, 0, 0]); page.wait_for_timeout(1500); snap('40_pass.png')
    erg['pass'] = page.evaluate(ZUSTAND)
    # 41 Serpentinen von schräg oben (Kamera frei, ohne Nebel)
    sp = page.evaluate("""(s) => { const st = Rennspiel.spiel.strecke, sp = st.spline, a = sp.punktBei(s);
      let mx = 0, mz = 0, n = 0; for (let d = -250; d <= 250; d += 10) { const p = sp.punktBei(s + d); mx += p.x; mz += p.z; n++; } return [mx / n, a.y, mz / n]; }""", info['haar'])
    page.evaluate(KAMERA_FREI, [sp[0] + 40, sp[1] + 120, sp[2] + 230, sp[0], sp[1], sp[2], False]); page.wait_for_timeout(800); snap('41_serpentinen.png')
    # 42 Überführung von unten: Spieler auf der unteren Bahn vor der Kreuzung, KI 1 steht oben auf der Brücke
    page.evaluate(JAGD_KAMERA)
    page.evaluate(AUTO_SQ_INDEX, [kr['sOben'] + 1, 2, 1]); page.evaluate(AUTO_SQ_INDEX, [kr['sUnten'] - 26, 0, 0])
    page.wait_for_timeout(1500); snap('42_ueberfuehrung_unten.png')
    # 43 von oben: Spieler auf der Brücke, KI 1 steht unten unter der Brücke
    page.evaluate(AUTO_SQ_INDEX, [kr['sUnten'] + 1, -2, 1]); page.evaluate(AUTO_SQ_INDEX, [kr['sOben'] - 22, 0, 0])
    page.wait_for_timeout(1500); snap('43_ueberfuehrung_oben.png')
    erg['oben_stand'] = page.evaluate("""(() => { const f = Rennspiel.spiel.fahrzeuge; return { y0: f[0].vehicle.y, y1: f[1].vehicle.y }; })()""")
    # 43b seitlich (quer zur Brücke, tief) mit beiden Autos an der Kreuzung
    page.evaluate(AUTO_SQ_INDEX, [kr['sOben'] - 2, 2, 0])
    blick = page.evaluate("""(s) => { const p = Rennspiel.spiel.strecke.spline.punktBei(s);
      return [p.x + p.nx * 55 - p.tx * 12, p.y - 1, p.z + p.nz * 55 - p.tz * 12, p.x, p.y - 3, p.z, true]; }""", kr['sOben'])
    page.wait_for_timeout(300); page.evaluate(KAMERA_FREI, blick); page.wait_for_timeout(800); snap('43b_ueberfuehrung_seite.png')
    page.evaluate(KAMERA_FREI, [kr['x'] - 120, kr['dy'] + 80, kr['z'] + 120, kr['x'], 10, kr['z'], False]); page.wait_for_timeout(800); snap('43c_kreuzung_von_oben.png')
    # Fahrt ÜBER die Brücke (Autopilot, KI 1 steht unten): Höhe bleibt oben, kein Stoß mit dem Auto darunter
    page.evaluate(JAGD_KAMERA)
    page.evaluate(AUTO_SQ_INDEX, [kr['sUnten'] + 1, 0, 1]); page.evaluate(AUTO_SQ_INDEX, [kr['sOben'] - 70, 0, 0])
    page.evaluate("""(() => { const s = Rennspiel.spiel; window._alpenLog = []; s.autopilot(0, true);
      const f = s.fahrzeuge[0].vehicle; f.vLaengs = 20; })()""")
    log_js = """(() => { const s = Rennspiel.spiel, st = s.strecke, f = s.fahrzeuge[0], g = s.fahrzeuge[1];
      return { s: f.nah ? f.nah.s : null, y: f.vehicle.y, ySoll: f.nah ? st.hoeheBeiS(f.nah.s, f.nah.seitenabstand) : null, kmh: f.vehicle.tempoKmh,
        y1: g.vehicle.y, x1: g.vehicle.x, z1: g.vehicle.z, abst: Math.hypot(f.vehicle.x - g.vehicle.x, f.vehicle.z - g.vehicle.z) }; })()"""
    def fahren(sK, bild):
        # Schnellvorlauf in 0,1-s-Schritten (Software-Grafik ist zu langsam für Echtzeit); das Bild danach extra
        f = []
        for k in range(80):
            page.evaluate('Rennspiel.spiel.schnellvorlauf(0.1)'); f.append(page.evaluate(log_js))
        return f
    erg['fahrt_oben'] = fahren(kr['sOben'], None)
    page.evaluate(AUTO_SQ_INDEX, [kr['sUnten'] + 1, 0, 1]); page.evaluate(AUTO_SQ_INDEX, [kr['sOben'] - 30, 0, 0])
    page.evaluate("(() => { Rennspiel.spiel.fahrzeuge[0].vehicle.vLaengs = 20; })()"); page.wait_for_timeout(900)
    snap('43d_ueberfuehrung_fahrt_oben.png')
    # Fahrt UNTER der Brücke durch (KI 1 steht oben)
    page.evaluate(AUTO_SQ_INDEX, [kr['sOben'] + 1, 0, 1]); page.evaluate(AUTO_SQ_INDEX, [kr['sUnten'] - 70, 0, 0])
    page.evaluate("(() => { Rennspiel.spiel.fahrzeuge[0].vehicle.vLaengs = 20; })()")
    erg['fahrt_unten'] = fahren(kr['sUnten'], None)
    page.evaluate(AUTO_SQ_INDEX, [kr['sOben'] + 1, 0, 1]); page.evaluate(AUTO_SQ_INDEX, [kr['sUnten'] - 30, 0, 0])
    page.evaluate("(() => { Rennspiel.spiel.fahrzeuge[0].vehicle.vLaengs = 20; })()"); page.wait_for_timeout(900)
    snap('43e_ueberfuehrung_fahrt_unten.png')
    page.evaluate('Rennspiel.spiel.autopilot(0, false)')
    # 44 Tunnel im Berg (von außen, Fahrersicht 45 m vor dem Portal)
    page.evaluate(JAGD_KAMERA); page.evaluate(AUTO_SQ_INDEX, [info['tunnel'][0][0] - 45, 0, 0]); page.wait_for_timeout(1500); snap('44_tunnel_berg.png')
    # 45 See + Steinbrücke (frei, schräg von oben)
    if info['see']:
        sx, sy, sz = info['see']
        page.evaluate(KAMERA_FREI, [sx - 70, sy + 35, sz - 90, sx + 10, sy, sz + 40, True]); page.wait_for_timeout(800); snap('45_see.png')
    # 46 Gipfelkreuz am Pass (frei)
    gk = page.evaluate("""(() => { let p = null; Rennspiel.spiel.szene.traverse(o => { if (o.name === 'Gipfelkreuz' && o.count) { const m = new THREE.Matrix4(); o.getMatrixAt(0, m); p = new THREE.Vector3().setFromMatrixPosition(m).toArray(); } }); return p; })()""")
    erg['gipfelkreuz'] = gk
    if gk:
        page.evaluate(KAMERA_FREI, [gk[0] + 18, gk[1] + 6, gk[2] + 22, gk[0], gk[1] + 4, gk[2], True]); page.wait_for_timeout(800); snap('46_gipfelkreuz.png')
    # Minimap: an der Kreuzung liegt die (hellere) Brückenfahrbahn obenauf
    erg['minimap'] = page.evaluate("""(([x, z]) => { const k = Rennspiel.Minimap._cache && Object.values(Rennspiel.Minimap._cache).find(e => e.strecke === Rennspiel.spiel.strecke);
      if (!k) return null; const [px, py] = k.nachPx(x, z), d = k.canvas.getContext('2d').getImageData(Math.round(px), Math.round(py), 1, 1).data; return [d[0], d[1], d[2]]; })""", [kr['x'], kr['z']])
    page.evaluate(JAGD_KAMERA)
    return erg


def fantasie_kreuzung_bilder(page, snap):
    """W4-J: niveaugleiche Kreuzung – Bilder (vorn, seitlich, oben, Warnlicht an/aus, Auto quert, Fahrt) + Messwerte."""
    erg = {}
    page.evaluate('Rennspiel.config.grafik.adaptiv = false')
    page.evaluate(LOOP_WEITER)
    # Gegner anhalten (Bremse 0: im Stand würde die Bremse rückwärts rollen lassen); Spieler 0 wird gesetzt
    page.evaluate("Rennspiel.spiel.fahrzeuge.forEach((f, i) => { if (i > 0 && f.driver) f.driver.steuerung = () => ({ gas: 0, bremse: 0, lenkung: 0 }); })")
    # Warnlicht-Zeit im Test festhalten (window._kzeit), sonst blinkt es zufällig im Bild
    page.evaluate("""(() => { const st = Rennspiel.spiel.strecke, orig = st.kreuzungAnimieren.bind(st);
      st.kreuzungAnimieren = (z, f) => orig(window._kzeit !== undefined ? window._kzeit : z, f); })()""")
    info = page.evaluate("""(() => { const s = Rennspiel.spiel, st = s.strecke, k = st.kreuzungen[0];
      let platte = 0, masten = 0, lampen = 0, hoefe = 0; s.szene.traverse(o => { if (o.name === 'Kreuzungsplatte') platte++; if (o.name === 'Warnlicht-Masten') masten++;
        if (o.name === 'Warnlampen') lampen++; if (o.name === 'Warnlicht-Hof') hoefe++; });
      return { sA: k.sA, sB: k.sB, x: k.x, z: k.z, y: st.hoeheAn(k.x, k.z), winkel: k.winkel, dy: k.dy, platte, masten, lampen, hoefe,
        masts: k.masten.map(m => ({ x: m.x, z: m.z, pass: m.pass, bx: m.blick.x, bz: m.blick.z })) }; })()""")
    erg['info'] = info
    sA, sB = info['sA'], info['sB']
    LAMPEN = """(() => { const k = Rennspiel.spiel.strecke.kreuzungen[0];
      return { warnA: k.warnA, warnB: k.warnB, lampen: k._lampen.map(l => ({ pass: l.pass, seite: l.seite, farbe: l.mat.color.getHex(), hof: +l.hmat.opacity.toFixed(2) })) }; })()"""
    # 50 Fahrersicht auf Abschnitt A, 45 m vor der Kreuzung; KI 1 quert gerade auf B
    page.evaluate('window._kzeit = 0.1')
    page.evaluate(JAGD_KAMERA)
    page.evaluate(AUTO_SQ_INDEX, [sB - 3, 1.5, 1]); page.evaluate(AUTO_SQ_INDEX, [sA - 45, 0, 0])
    page.wait_for_timeout(1500); snap('50_kreuzung_vorn.png')
    erg['vorn'] = page.evaluate(LAMPEN)
    # 50b aus der Schleife (Abschnitt B), 40 m vor der Kreuzung, KI 1 auf A in der Kreuzung
    page.evaluate(AUTO_SQ_INDEX, [sA - 2, -2, 1]); page.evaluate(AUTO_SQ_INDEX, [sB - 40, 0, 0])
    page.wait_for_timeout(1500); snap('50b_kreuzung_vorn_b.png')
    # 51 seitlich (aus der Ecke zwischen beiden Ausfahrten, flach) – 52 von oben
    page.evaluate(AUTO_SQ_INDEX, [sB - 1, 1.5, 1]); page.evaluate(AUTO_SQ_INDEX, [sA - 12, 0, 0])
    page.wait_for_timeout(300)
    blick = page.evaluate("""(() => { const st = Rennspiel.spiel.strecke, k = st.kreuzungen[0], sp = st.spline, a = sp.punktBei(k.sA), b = sp.punktBei(k.sB);
      const dx = a.tx + b.tx, dz = a.tz + b.tz, l = Math.hypot(dx, dz), y = st.hoeheAn(k.x, k.z);
      return [k.x + dx / l * 38, y + 5.5, k.z + dz / l * 38, k.x, y + 1.2, k.z, true]; })()""")
    page.evaluate(KAMERA_FREI, blick); page.wait_for_timeout(900); snap('51_kreuzung_seitlich.png')
    page.evaluate(KAMERA_FREI, [info['x'] + 6, info['y'] + 70, info['z'] + 22, info['x'], info['y'], info['z'], True]); page.wait_for_timeout(900); snap('52_kreuzung_oben.png')
    # 53 Warnlicht nah (Mast an der Zufahrt A): ruhig (niemand auf B), dann Querverkehr auf B → schnell/hell, dann Lampe aus
    m = [mm for mm in info['masts'] if mm['pass'] == 'a'][0]
    page.evaluate(AUTO_SQ_INDEX, [sB + 150, 0, 1]); page.evaluate(AUTO_SQ_INDEX, [sA - 160, 0, 0])
    nah = [m['x'] + m['bx'] * 7.5 + m['bz'] * 2.5, info['y'] + 2.6, m['z'] + m['bz'] * 7.5 - m['bx'] * 2.5, m['x'], info['y'] + 2.6, m['z'], True]
    page.evaluate(KAMERA_FREI, nah); page.wait_for_timeout(900); snap('53_warnlicht_ruhig.png')
    erg['ruhig'] = page.evaluate(LAMPEN)
    page.evaluate(AUTO_SQ_INDEX, [sB - 30, 0, 1]); page.wait_for_timeout(900); snap('53b_warnlicht_an.png')
    erg['warn'] = page.evaluate(LAMPEN)
    page.evaluate('window._kzeit = 0.27'); page.wait_for_timeout(700); snap('53c_warnlicht_aus.png')
    erg['warnAus'] = page.evaluate(LAMPEN)
    page.evaluate('delete window._kzeit')
    # 54 Auto mitten auf der Kreuzung (quer), Blick von der Zufahrt A (Kamera hinter Spieler 0, steht 30 m davor)
    page.evaluate(JAGD_KAMERA)
    page.evaluate(AUTO_SQ_INDEX, [sB, 0, 1]); page.evaluate(AUTO_SQ_INDEX, [sA - 30, -2, 0])
    page.wait_for_timeout(1500); snap('54_auto_quert.png')
    # Fahrten: Autopilot über die Kreuzung auf A (KI 1 steht auf B kurz hinter der Kreuzung), dann auf B
    log_js = """(() => { const s = Rennspiel.spiel, st = s.strecke, f = s.fahrzeuge[0], t = s.rennen.teilnehmer[0];
      return { s: f.nah ? f.nah.s : null, sRennen: t.s, ug: f.vehicle.untergrund, y: f.vehicle.y, ySoll: st.hoeheAn(f.vehicle.x, f.vehicle.z), kmh: f.vehicle.tempoKmh }; })()"""
    def fahren(n):
        f = []
        for k in range(n):
            page.evaluate('Rennspiel.spiel.schnellvorlauf(0.1)'); f.append(page.evaluate(log_js))
        return f
    page.evaluate(AUTO_SQ_INDEX, [sB + 20, 0, 1]); page.evaluate(AUTO_SQ_INDEX, [sA - 60, 0, 0])
    page.evaluate("(() => { const s = Rennspiel.spiel; s.rennen.verfolgungSetzen(0, s.fahrzeuge[0].vehicle.x, s.fahrzeuge[0].vehicle.z, %f); s.autopilot(0, true); s.fahrzeuge[0].vehicle.vLaengs = 22; })()" % (sA - 60))
    erg['fahrtA'] = fahren(45)
    page.evaluate(AUTO_SQ_INDEX, [sA + 20, 0, 1]); page.evaluate(AUTO_SQ_INDEX, [sB - 50, 0, 0])
    page.evaluate("(() => { const s = Rennspiel.spiel; s.rennen.verfolgungSetzen(0, s.fahrzeuge[0].vehicle.x, s.fahrzeuge[0].vehicle.z, %f); s.fahrzeuge[0].vehicle.vLaengs = 18; })()" % (sB - 50))
    erg['fahrtB'] = fahren(40)
    page.evaluate(AUTO_SQ_INDEX, [sB + 20, 0, 1]); page.evaluate(AUTO_SQ_INDEX, [sA - 25, 0, 0])
    page.evaluate("(() => { Rennspiel.spiel.fahrzeuge[0].vehicle.vLaengs = 18; })()"); page.wait_for_timeout(900)
    snap('55_kreuzung_fahrt.png')
    page.evaluate('Rennspiel.spiel.autopilot(0, false)')
    # Reset-Taste auf Abschnitt B (letzter Checkpoint vor der Kreuzung auf B) → bleibt auf B
    erg['reset'] = page.evaluate("""(() => { const s = Rennspiel.spiel, st = s.strecke, k = st.kreuzungen[0], t = s.rennen.teilnehmer[0];
      let cp = st.checkpoints[0]; st.checkpoints.forEach(c => { const d = st.spline.differenzS(k.sB, c.s); if (d > 0 && d < st.spline.differenzS(k.sB, cp.s) || st.spline.differenzS(k.sB, cp.s) <= 0) cp = c; });
      t.letzterCheckpoint = cp.nr; t.naechsterCheckpoint = (cp.nr + 1) % st.checkpoints.length;
      s.spielerZuruecksetzen(0); return { cpS: cp.s, index: s.fahrzeuge[0].index, sIndex: st.spline.punkte[Math.max(0, s.fahrzeuge[0].index)].s }; })()""")
    page.evaluate("(() => { const s = Rennspiel.spiel; s.autopilot(0, true); })()")
    erg['nachReset'] = fahren(60)
    page.evaluate('Rennspiel.spiel.autopilot(0, false)')
    # 56 Minimap mit Andreaskreuz (Pixel an der Kreuzung rot/weiß)
    mm = page.evaluate(MINIMAP)
    if mm:
        page.screenshot(path=os.path.join(page._ausgabe, '56_minimap_kreuzung.png'), clip={'x': max(0, mm['x'] - 10), 'y': max(0, mm['y'] - 10), 'width': mm['w'] + 20, 'height': mm['h'] + 20})
    erg['minimap'] = page.evaluate("""(([x, z]) => { const k = Rennspiel.Minimap._cache && Object.values(Rennspiel.Minimap._cache).find(e => e.strecke === Rennspiel.spiel.strecke);
      if (!k) return null; const [px, py] = k.nachPx(x, z), d = k.canvas.getContext('2d').getImageData(Math.round(px), Math.round(py), 1, 1).data; return [d[0], d[1], d[2]]; })""", [info['x'], info['z']])
    page.evaluate(JAGD_KAMERA)
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
    page._ausgabe = out
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
        z['kreuzung'] = fantasie_kreuzung_bilder(page, snap)   # Runde 6 (W4-J)
    if sid == 'dino':
        z['dino'] = dino_bilder(page, snap)
        z['w2c'] = dino_w2c_bilder(page, snap)      # Runde 6 (W2-C)
    if sid == 'wald':
        z['tiere'] = wald_tiere_bilder(page, snap)  # Runde 6 (W2-C)
    if sid == 'alpen':
        z['alpen'] = alpen_bilder(page, snap)       # Runde 6 (W4-I)
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
    pruefe('Draw-Calls Strecke + Deko + Hindernisse ≤ 45 (ohne Wrack-Autos)', dc['meshes'] <= 45, str(dc['meshes']) + ' (+ ' + str(dc['wracks']) + ' Wrack-Meshes)')
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
        pruefe('Zu langsam: Stopp 10 m vor der Einfahrt, kein Looping/Durchfahren, Meldung mit R', abs(fz['zuLangsam']['abstand'] - 10) < 1 and
               not fz['zuLangsam']['imLooping'] and 'Zu langsam' in fz['zuLangsam']['meldung'] and 'R: Anlaufposition' in fz['zuLangsam']['meldung'], fz['zuLangsam'])
        pruefe('R → Anlaufposition (Abstand laut Anlauf-Stelle), Tempo 0, Meldung', abs(fz['anlaufPos']['abstand'] - fz['anlaufPos']['soll']) < 12 and fz['anlaufPos']['kmh'] == 0 and 'Anlauf' in fz['anlaufPos']['meldung'], fz['anlaufPos'])
        pruefe('Von der Anlaufposition mit Vollgas: Looping geschafft', fz['vonAnlauf']['gefallen'] == 0 and fz['vonAnlauf']['geschafft'] > fz['durch']['geschafft'], fz['vonAnlauf'])
        pruefe('Kleber: festgeklebt (Tempo 0, Optik an, Meldung „Festgeklebt! 🍯")', fz['kleber']['kmh'] == 0 and fz['kleber']['optik'] and 'Festgeklebt' in fz['kleber']['meldung'], fz['kleber'])
        pruefe('Kleber: nach 5 s gelöst (Optik aus, Schonzeit)', fz['geloest']['klebt'] == 0 and not fz['geloest']['optik'] and fz['geloest']['frei'] > 0, fz['geloest'])
        pruefe('Ball-Treffer: Tempo −60 % (25 → 10 m/s = 36 km/h), Meldung', abs(fz['ball']['kmhNachher'] - 36) <= 3 and fz['ball']['meldung'] != '', fz['ball'])
        pruefe('Wasser-Treffer: Tempo −40 % (≈ 54 km/h) + Schlingern', abs(fz['wasser']['kmhNachher'] - 54) <= 4 and abs(fz['wasser']['vQuer']) > 2, fz['wasser'])
    if z.get('kreuzung'):
        kz = z['kreuzung']; i = kz['info']
        pruefe('W4-J Kreuzung: Platte, 4 Masten (1 Mesh), 4 Lampen-Meshes, 8 Lichthöfe, 70–110°, |Δy| < 1 m', i['platte'] == 1 and i['masten'] == 1 and
               i['lampen'] == 4 and i['hoefe'] == 8 and 70 <= i['winkel'] <= 110 and i['dy'] < 1, {k: i[k] for k in ('platte', 'masten', 'lampen', 'hoefe', 'winkel', 'dy')})
        ru, wa, au = kz['ruhig'], kz['warn'], kz['warnAus']
        an_r = [l for l in ru['lampen'] if l['pass'] == 'a' and l['hof'] > 0]
        an_w = [l for l in wa['lampen'] if l['pass'] == 'a' and l['hof'] > 0]
        pruefe('W4-J Warnlicht: ruhig blinkt gedämpft (Hof 0,45), bei Querverkehr auf B an den A-Masten hell (Hof 1), Lampen abwechselnd',
               not ru['warnA'] and wa['warnA'] and len(an_r) == 1 and an_r[0]['hof'] < 0.6 and len(an_w) == 1 and an_w[0]['hof'] == 1 and
               [l['hof'] for l in au['lampen'] if l['pass'] == 'a'] != [l['hof'] for l in wa['lampen'] if l['pass'] == 'a'], [ru, wa, au])
        def fahrt(f, sK, name):
            nah = [e for e in f if e['s'] is not None and abs(e['s'] - sK) < 30]
            ok = len(nah) >= 3 and all(abs(e['sRennen'] - e['s']) < 3 and e['ug'] in ('strasse', 'rand') and abs(e['y'] - e['ySoll']) < 0.3 for e in nah) and \
                max(e['s'] for e in f if e['s'] is not None) > sK + 10
            pruefe('W4-J Fahrt über die Kreuzung auf ' + name + ': Abschnitt bleibt (s, Rennleitung), Straße, Höhe = Gelände', ok,
                   [(round(e['s']), round(e['sRennen']), e['ug']) for e in nah][:10])
        fahrt(kz['fahrtA'], i['sA'], 'A')
        fahrt(kz['fahrtB'], i['sB'], 'B')
        nr = kz['nachReset']
        pruefe('W4-J Reset-Taste vor der Kreuzung auf B: Index auf B, fährt danach auf B über die Kreuzung', abs(kz['reset']['sIndex'] - kz['reset']['cpS']) < 3 and
               max(e['s'] for e in nr if e['s'] is not None) > i['sB'] + 5 and all(abs(e['s'] - i['sA']) > 40 for e in nr if e['s'] is not None),
               [kz['reset'], [round(e['s']) for e in nr if e['s'] is not None][::5]])
        mmk = kz['minimap']
        pruefe('W4-J Minimap: Andreaskreuz an der Kreuzung (rot/weiß)', mmk is not None and mmk[0] > 200 and mmk[2] < 120 or (mmk and min(mmk) > 220), mmk)
    if z.get('dino'):
        dz = z['dino']
        pruefe('Dino: Vulkan + Rauch gebaut, Vulkan im Startblick (Bildmitte oben)', dz['info']['vulkan'] == 1 and dz['info']['rauch'] == 1 and
               abs(dz['vulkanPixel']['x']) < 0.9 and -1 < dz['vulkanPixel']['y'] < 1 and dz['vulkanPixel']['z'] <= 1, dz['vulkanPixel'])
        pruefe('Dino: Lavasee neben der Strecke', dz['info']['lava'] is not None, dz['info']['lava'])
        pruefe('Dino: 6–10 Deko-Dinos', 6 <= dz['info']['dekoDinos'] <= 10, dz['info']['dekoDinos'])
        pruefe('Dino: laufende Dinos (≥ 4 Stellen, Runde 6) + Felsbrocken in Welt Hindernisse', len(dz['info']['dinoStellen']) >= 4 and dz['info']['fels'], dz['info'])
        pruefe('Dino-Treffer: Tempo −60 % (25 → 10 m/s = 36 km/h), Meldung „Dino!", Dino bleibt', abs(dz['treffer']['kmhNachher'] - 36) <= 3 and
               dz['treffer']['meldung'].startswith('Dino') and dz['treffer']['dinoDa'], dz['treffer'])
    if z.get('w2c'):
        w = z['w2c']
        pruefe('W2-C: Berg-Massiv, 2 Tunnel, Vulkan/Meteoriten/Flugsaurier aktiv', w['info']['berg'] == 1 and len(w['info']['tunnel']) == 2 and
               w['info']['vulkan'] and w['info']['meteore'] == 2 and w['info']['flug'], w['info'])
        if w.get('lavaKontakt'):
            pruefe('W2-C: Lava-Kontakt → Stopp, Meldung „Lava!", Rauch', w['lavaKontakt']['meldung'].startswith('Lava') and w['lavaKontakt']['rauch'] > 0, w['lavaKontakt'])
        a = w['ausbruch']
        hb = a.get('himmelBild') or a['himmel']
        pruefe('W2-C: Ausbruch – Himmel rötlich im Bild (r > g + 20, r > b + 40), ≥ 3 Bomben in der Luft, Meldung', a['glut'] > 0.6 and
               hb[0] > hb[1] + (20 if a.get('himmelBild') else 0) and hb[0] > hb[2] + (40 if a.get('himmelBild') else 0) and a['bomben'] >= 3, a)
        pruefe('W2-C: Krater auf der Fahrbahn', w['krater'] is not None, w['krater'])
        if w.get('kraterKontakt'):
            pruefe('W2-C: Krater-Kontakt → Meldung „Krater!", Tempo ≈ −50 %', w['kraterKontakt']['meldung'].startswith('Krater') and w['kraterKontakt']['kmh'] <= 45, w['kraterKontakt'])
        pruefe('W2-C: Meteorit – Schatten auf der Straße, Felsbrocken danach', w['meteor']['schatten'] is not None and w['meteorBrocken'] >= 3, [w['meteor'], w['meteorBrocken']])
        if w.get('umkehr'):
            pruefe('W2-C2: Dino kehrt mitten auf der Straße um', w['umkehr']['umgekehrt'] and abs(w['umkehr']['q']) < 3, w['umkehr'])
        fs = w['flugsaurier']
        pruefe('W2-C: Flugsaurier über dem Auto (≥ 2,5 m, < 5 m), Meldung, nie tiefer als 2,5 m', fs['aktiv'] and 2.5 - 1e-3 <= fs['ueberAuto'] < 5 and
               fs['meldung'].startswith('Flugsaurier') and fs['minUeberAuto'] >= 2.499, fs)
    if z.get('tiere') and z['tiere'].get('info'):
        t = z['tiere']
        pruefe('Wald: Rehe + Bären + 2–3 grasende Rehe', len(t['info']['stellen']) >= 2 and 2 <= len(t['info']['grasend']) <= 3, t['info'])
        g = t.get('groesse') or {}
        pruefe('W2-C2: Größen stimmig – Reh ≈ 1,2 m (1,05–1,4), Bär ≈ 1,5 m (1,35–1,7)', 1.05 <= g.get('reh', 0) <= 1.4 and 1.35 <= g.get('baer', 0) <= 1.7, g)
        gesamt = dc['meshes'] + t['drawCallsDynamik']['meshes']
        pruefe('W2-C2: Draw-Calls Strecke + Deko + Hindernisse + Dynamik (Tiere) ≤ 45', gesamt <= 45,
               str(dc['meshes']) + ' + ' + str(t['drawCallsDynamik']['meshes']) + ' ' + str(t['drawCallsDynamik']['namen']))
        if t.get('baerTreffer'):
            pruefe('Wald: Bär-Treffer → Meldung „Bär!", Tempo −60 % (≈ 36 km/h)', t['baerTreffer']['meldung'].startswith('Bär') and t['baerTreffer']['kmh'] <= 40, t['baerTreffer'])
    if z.get('alpen'):
        a = z['alpen']; i = a['info']; kr = i['kr']
        d = i['deko'] or {}
        pruefe('Alpen: Überführung gebaut, Schneegipfel-Kranz, See, Gipfelkreuz, Hütten ≥ 3, Kühe ≥ 5, Tannen ≥ 500', i['ueb'] == 1 and i['kranz'] == 1 and
               bool(i['see']) and d.get('gipfelkreuz') and d.get('huetten', 0) >= 3 and d.get('kuehe', 0) >= 5 and d.get('tannen', 0) >= 500, d)
        so = a['oben_stand']
        pruefe('Alpen: Auto oben auf der Brücke ≈ Kreuzung oben, Auto darunter ≈ unten (Δy ≥ 7 m)', so['y0'] - so['y1'] >= 7, so)
        def fahrt_ok(f, oben):
            # alle Messpunkte nahe der Kreuzung: Höhe = Fahrbahn des eigenen Abschnitts (±0,5 m), s im richtigen Abschnitt
            nah = [e for e in f if e['s'] is not None and abs(e['s'] - (kr['sOben'] if oben else kr['sUnten'])) < 40]
            return len(nah) >= 5 and all(abs(e['y'] - e['ySoll']) < 0.5 for e in nah), nah
        ok_o, nah_o = fahrt_ok(a['fahrt_oben'], True)
        dicht = min(a['fahrt_oben'], key=lambda e: e['abst'])     # Messpunkt direkt über dem Auto darunter
        pruefe('Alpen: Fahrt über die Brücke – Höhe bleibt oben (s oben, ±0,5 m), über dem Auto darunter Δy ≥ 7 m', ok_o and
               max(e['s'] for e in a['fahrt_oben']) > kr['sOben'] + 5 and dicht['y'] - dicht['y1'] >= 7,
               'über dem Auto: Abstand ' + str(round(dicht['abst'], 2)) + ' m, Δy ' + str(round(dicht['y'] - dicht['y1'], 2)) + ' m; ' +
               str([(round(e['s']), round(e['y'], 2)) for e in nah_o][:8]))
        ok_u, nah_u = fahrt_ok(a['fahrt_unten'], False)
        pruefe('Alpen: Fahrt unter der Brücke durch – Höhe bleibt unten', ok_u and max(e['s'] for e in a['fahrt_unten']) > kr['sUnten'] + 5,
               [(round(e['s']), round(e['y'], 2)) for e in nah_u])
        x1 = [(e['x1'], e['z1']) for e in a['fahrt_oben']]
        weg1 = max(((p[0] - x1[0][0]) ** 2 + (p[1] - x1[0][1]) ** 2) ** 0.5 for p in x1)
        pruefe('Alpen: Auto darunter wird beim Überfahren nicht angestoßen (bewegt sich < 5 cm), Abstand x/z dabei < 6 m', weg1 < 0.05 and
               min(e['abst'] for e in a['fahrt_oben']) < 6, 'Weg ' + str(round(weg1, 3)) + ' m, min. Abstand ' + str(round(min(e['abst'] for e in a['fahrt_oben']), 2)) + ' m')
        mm = a['minimap']
        pruefe('Alpen: Minimap zeigt die Brückenfahrbahn obenauf (hell an der Kreuzung)', mm is not None and mm[0] > 100 and abs(mm[0] - 0x7d) < 30, mm)
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


def menge_lauf(browser, sid, out, bilder=True):
    """12.10. Hindernis-Menge: Welt „Hindernisse“ mit normal / viele / sehrViele im echten Spiel.
    Misst je Menge die Draw-Calls (Blick von 14 Stellen entlang der Runde) und die Anzahl; bei bilder=True außerdem Bilder
    mit 'sehrViele' (Fahrersicht in der dichtesten Stelle, Übersicht von oben, schräg, Autopilot; dichteste Stelle = meiste Hindernisse in 300 m). Prüft: keine JS-Fehler,
    Draw-Calls bei 'sehrViele' höchstens +40 gegenüber 'normal' (Gesamtmaximum < 160), Anzahl wächst normal < viele < sehrViele."""
    os.makedirs(out, exist_ok=True)
    zeilen, erg = [], {}
    fehler = []

    def pruefe(name, ok, info_=''):
        zeilen.append(('OK   ' if ok else 'FEHL ') + '[' + sid + '/hindernisse] ' + name + (' – ' + str(info_) if info_ != '' else ''))
    for menge in ('normal', 'viele', 'sehrViele'):
        page = browser.new_page(viewport={'width': 1280, 'height': 800})
        page.on('pageerror', lambda e: fehler.append(str(e)))
        page.on('console', lambda m: fehler.append('console.' + m.type + ': ' + m.text) if m.type in ('error',) else None)
        page.goto(url)
        page.wait_for_timeout(1500)
        page.evaluate("([id, m]) => Rennspiel.spiel.rennenStarten({ modus: 'solo', streckeId: id, welt: 'hindernisse', hindernisMenge: m, autoIds: ['troc-cabrio', 'multivan'], runden: 3, gegner: 3, schwierigkeit: 'mittel', fahrhilfe: ['wenig', 'wenig'] })", [sid, menge])
        page.wait_for_timeout(1200)
        info = page.evaluate('''(() => { const st = Rennspiel.spiel.strecke, o = Rennspiel.spiel.einstellungen;
          return { menge: st.hindernisMenge, einst: o.hindernisMenge, L: st.laenge,
            hindernisse: st.hindernisse.filter(h => h.typ !== 'wrack' && h.typ !== 'brand').length, wracks: st.hindernisse.filter(h => h.typ === 'wrack' || h.typ === 'brand').length,
            stroh: st.strohballen.length, zusatz: st.hindernisZusatz }; })()''')
        calls = []
        for k in range(14):
            page.evaluate('''(s) => { const sp = Rennspiel.spiel.strecke.spline, q = sp.punktBei(s), f = Rennspiel.spiel.fahrzeuge[0];
              f.vehicle.setzen(q.x, q.z, Rennspiel.headingAus(q.tx, q.tz)); f.index = -1; Rennspiel.spiel.kameras[0]._erstesMal = true; }''', info['L'] * (k + 0.5) / 14)
            page.wait_for_timeout(450)
            calls.append(page.evaluate('Rennspiel.spiel.renderer.info.render.calls'))
        erg[menge] = dict(info, callsMax=max(calls), callsMittel=round(sum(calls) / len(calls), 1))
        if menge == 'sehrViele' and bilder:
            # dichteste Stelle: die meisten Hindernisse in 110 m voraus (Fahrersicht soll mehrere zeigen)
            dicht = page.evaluate('''(() => { const st = Rennspiel.spiel.strecke, sp = st.spline;
              const liste = st.hindernisse.filter(h => h.typ !== 'krater').map(h => h.s); let best = null;
              liste.forEach(s => { const n = liste.filter(t => { const d = sp.differenzS(t, s - 25); return d >= 0 && d <= 110; }).length;
                let k = 0; for (let x = -25; x <= 110; x += 15) k = Math.max(k, Math.abs(sp.punktBei(s + x).kruemmung || 0));   // möglichst gerade (Sicht)
                if (k < 1 / 60 && (!best || n > best.n)) best = { s, n }; });
              return best; })()''')
            erg['dicht'] = dicht
            s0 = dicht['s'] - 25 - 25 + 25
            page.wait_for_function('Rennspiel.spiel.rennen.zustand === "laeuft"', timeout=60000)
            page.wait_for_function('Rennspiel.spiel.rennen.zeit > 1.4', timeout=60000)      # „LOS!“ ist weg (Renn-Zeit, nicht Wanduhr)
            page.evaluate(AUTO_NACH_S, s0); page.wait_for_timeout(1500)
            page.screenshot(path=os.path.join(out, 'M1_sehrViele_fahrersicht.png'))
            blick = page.evaluate(KAMERA_BEI_S, [s0 + 5, 12, 14, 100])
            page.evaluate(KAMERA_FREI, blick); page.wait_for_timeout(900)
            page.screenshot(path=os.path.join(out, 'M2_sehrViele_uebersicht.png'))
            blick = page.evaluate(KAMERA_BEI_S, [s0 + 80, 18, 8, 80])
            page.evaluate(KAMERA_FREI, blick); page.wait_for_timeout(900)
            page.screenshot(path=os.path.join(out, 'M3_sehrViele_schraeg.png'))
            page.evaluate('(() => { const s = Rennspiel.spiel, k = s.kameras[0]; delete k.update; k._erstesMal = true; })()')
            # Autopilot fährt die dichte Stelle
            page.evaluate(AUTO_NACH_S, s0 - 40)
            page.evaluate('Rennspiel.spiel.autopilot(0, true)')
            page.wait_for_timeout(4500)
            page.screenshot(path=os.path.join(out, 'M4_sehrViele_autopilot.png'))
            page.evaluate('Rennspiel.spiel.autopilot(0, false)')
        page.close()
    n, v, s = erg['normal'], erg['viele'], erg['sehrViele']
    ges = lambda e: e['hindernisse'] + e['wracks'] + e['stroh']
    pruefe('Menge im Spiel angekommen (normal/viele/sehrViele)', n['menge'] == 'normal' and v['menge'] == 'viele' and s['menge'] == 'sehrViele' and s['einst'] == 'sehrViele')
    pruefe('Anzahl wächst: ' + '/'.join(str(ges(e)) for e in (n, v, s)) + ' (Hindernisse+Wracks+Strohballen)', ges(n) < ges(v) < ges(s) and ges(v) >= 0.7 * n['L'] / 150 and ges(s) >= 0.7 * n['L'] / 80 and s['wracks'] - n['wracks'] <= 2,
           'Zusatz sehrViele: ' + json.dumps(s['zusatz']))
    pruefe('Fahrersicht sehrViele: mindestens 3 Hindernisse in 110 m voraus (' + str(erg.get('dicht')) + ')', bool(erg.get('dicht')) and erg['dicht']['n'] >= 3 or not bilder)
    pruefe('Draw-Calls: sehrViele höchstens +40 gegenüber normal (max ' + str(s['callsMax']) + ' / ' + str(n['callsMax']) + ', Mittel ' + str(s['callsMittel']) + ' / ' + str(n['callsMittel']) + ')',
           s['callsMax'] <= n['callsMax'] + 40 and s['callsMax'] < 160, 'viele max ' + str(v['callsMax']))
    pruefe('keine JS-Fehler', not fehler, fehler[:3])
    return erg, zeilen


ids = ['wiese', 'wald', 'wueste', 'fantasie', 'dino', 'alpen'] if wahl == 'alle' else [wahl]
with sync_playwright() as p:
    browser = p.chromium.launch(args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
    alle = []
    for sid in ids:
        out = sys.argv[2] if len(sys.argv) > 2 and len(ids) == 1 else os.path.join(basis, 'tests', 'out', sid)
        z, pruef = lauf(browser, sid, out)
        print(json.dumps(z, indent=1, ensure_ascii=False))
        alle += pruef
        if sid in ('wiese', 'wald', 'wueste', 'dino', 'alpen'):
            info, pruef = spur_lauf(browser, sid, out)
            print(json.dumps({'stunt': info}, ensure_ascii=False))
            alle += pruef
        if sid in ('wiese', 'wald', 'wueste', 'dino', 'alpen'):      # 12.10. Hindernis-Menge (Bilder nur für Wiese + Wüste, Messung für alle)
            erg, pruef = menge_lauf(browser, sid, out, bilder=sid in ('wiese', 'wueste'))
            print(json.dumps({'hindernisMenge': erg}, ensure_ascii=False))
            alle += pruef
    browser.close()
    print('\n'.join(alle))
    sys.exit(0 if all(z.startswith('OK') for z in alle) else 1)
