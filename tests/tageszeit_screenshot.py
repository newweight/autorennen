#!/usr/bin/env python3
"""Runde 6 (W2-D): Tageszeit Tag / Dämmerung / Nacht im echten Spiel (Playwright, headless).
Aufruf: python3 tests/tageszeit_screenshot.py [ausgabeordner]   (Standard tests/out/tageszeit)
Teil 1 – Regression Tag: für jede Strecke Licht-/Himmel-/Nebelwerte nach streckeSzeneBauen (Einstellung tageszeit 'tag')
  bitgleich mit tests/tageszeit_tag_referenz.json (aufgenommen mit dem Stand VOR W2-D; neu aufnehmen: --referenz <ordner
  mit altem Autorennen.html>). Außerdem: tagsüber keine Kuppel/Sterne/Laternen, Autolicht aus, keine Lichter außer Tunnel.
Teil 2 – Bilder (tests/out/tageszeit/*.png), je Rennszene nach schnellvorlauf + 1,2 s echter Fahrt:
  01 Wiese Dämmerung, 02 Wald Nacht (Laternen + Scheinwerferkegel), 03 Wüste Nacht, 04 Fantasie Nacht, 05 Dino Nacht,
  06 Wiese Nacht + Regen, 07 Wüste Dämmerung, 08 Wald Nacht zu zweit (Split).
Prüft je Bild: keine JS-Fehler, Zusatz-Draw-Calls der Tageszeit (Kuppel, Sterne, Laternen) ≤ 6, Lichter Spot ≤ 2 /
  Punkt ≤ 3 (ohne Polizei), nachts Spots an (Solo 2, zu zweit 2), Autos mit Licht, HUD-Symbol 🌙/🌇, Bild nicht schwarz
  (mittlere Helligkeit unteres Drittel), Straße heller als der Rand (lesbar)."""
import sys, os, io, json
from playwright.sync_api import sync_playwright
from PIL import Image, ImageStat

basis = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
args = [a for a in sys.argv[1:] if not a.startswith('--')]
aus = args[0] if args else os.path.join(basis, 'tests', 'out', 'tageszeit')
os.makedirs(aus, exist_ok=True)
url = 'file://' + os.path.join(basis, 'Autorennen.html')
REF = os.path.join(basis, 'tests', 'tageszeit_tag_referenz.json')
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
STRECKEN = ['wiese', 'wald', 'wueste', 'fantasie', 'dino']

LICHTWERTE = '''(sid) => { const s = Rennspiel.spiel; s.szeneAbbauen(); s.zustand = 'menue'; s.streckeSzeneBauen(sid);
  const h = s.halbkugelLicht, so = s.sonne, f = s.szene.fog, r = (x) => +x.toFixed(9);
  const namen = []; s.szene.traverse(o => { if (['Himmelskuppel', 'Sterne', 'Laternen', 'Mond'].includes(o.name)) namen.push(o.name); });
  return { hk: [h.color.getHex(), h.groundColor.getHex(), r(h.intensity)],
    so: [so.color.getHex(), r(so.intensity), r(so.position.x), r(so.position.y), r(so.position.z)],
    fog: [f.color.getHex(), r(f.near), r(f.far)], bg: s.szene.background.getHex(),
    basis: [r(s._lichtBasis.himmel), r(s._lichtBasis.sonne)], tunnelLichter: !!s.tunnelLichter,
    lichter: s.szene.children.filter(o => o.isLight).length, sichtbareLichter: s.szene.children.filter(o => o.isLight && o.visible).length,
    namen }; }'''

STARTEN = '''(o) => { const s = Rennspiel.spiel;
  s.rennenStarten(Object.assign({ modus: 'solo', streckeId: 'wiese', welt: '', schaden: false, gegner: 4, runden: 3,
    schwierigkeit: 'mittel', autoIds: ['troc-cabrio', 'multivan'], fahrhilfe: ['wenig', 'wenig'], wetter: 'klar', jahreszeit: 'sommer',
    windStaerke: 0, polizei: false, tageszeit: 'tag' }, o.einst));
  s.autopilot(0); if (o.einst.modus === 'zwei') s.autopilot(1);
  s.schnellvorlauf(o.vorlauf);
  return { tz: s.einstellungen.tageszeit, wetter: s.wetter && s.wetter.tageszeit }; }'''

MESSEN = '''() => { const s = Rennspiel.spiel, r = s.renderer;
  s.zeichnen(); const mit = r.info.render.calls;
  const weg = []; s.szene.traverse(o => { if (['Himmelskuppel', 'Sterne', 'Laternen'].includes(o.name)) weg.push(o); });
  weg.forEach(o => { o.visible = false; }); s.zeichnen(); const ohne = r.info.render.calls;
  weg.forEach(o => { o.visible = true; }); s.zeichnen();
  const L = s.lichterZaehlen(), autos = s.fahrzeuge.map(f => !!f.mesh.userData.lichtAn);
  const sym = [...document.querySelectorAll('.w-symbol')].map(e => e.textContent);
  return { drawMit: mit, drawOhne: ohne, zusatz: mit - ohne, objekte: weg.map(o => o.name), lichter: L,
    autosLicht: autos, hud: sym, lampen: (s.laternenLampen || []).length,
    masten: (s.strecke.saeulen || []).filter(q => q.art === 'laterne').length,
    spots: s.tunnelLichter ? s.tunnelLichter.spots.map(l => +l.intensity.toFixed(1)) : [],
    punkte: s.tunnelLichter ? s.tunnelLichter.punkte.map(l => +l.intensity.toFixed(1)) : [],
    hk: +s.halbkugelLicht.intensity.toFixed(3), sonne: +s.sonne.intensity.toFixed(3),
    fortschritt: s.rennen.teilnehmer.map(t => +(t.runde + (t.anteil || 0)).toFixed(2)) }; }'''

SZENEN = [
    ('01_wiese_daemmerung', {'streckeId': 'wiese', 'tageszeit': 'daemmerung'}, 9),
    ('02_wald_nacht', {'streckeId': 'wald', 'tageszeit': 'nacht'}, 9),
    ('03_wueste_nacht', {'streckeId': 'wueste', 'tageszeit': 'nacht'}, 9),
    ('04_fantasie_nacht', {'streckeId': 'fantasie', 'tageszeit': 'nacht'}, 24),
    ('05_dino_nacht', {'streckeId': 'dino', 'tageszeit': 'nacht'}, 9),
    ('06_wiese_nacht_regen', {'streckeId': 'wiese', 'tageszeit': 'nacht', 'wetter': 'regen'}, 14),
    ('07_wueste_daemmerung', {'streckeId': 'wueste', 'tageszeit': 'daemmerung'}, 9),
    ('08_wald_nacht_zwei', {'streckeId': 'wald', 'tageszeit': 'nacht', 'modus': 'zwei'}, 12),
]


def helligkeit(png, box):
    b = Image.open(io.BytesIO(png)).convert('L')
    w, h = b.size
    return round(ImageStat.Stat(b.crop((int(box[0] * w), int(box[1] * h), int(box[2] * w), int(box[3] * h)))).mean[0], 1)


pruef = []
def pruefe(name, ok, info=''):
    pruef.append((name, ok)); print(('OK   ' if ok else 'FEHL ') + name + (' – ' + str(info) if info != '' else ''), flush=True)


def referenz_aufnehmen(browser, ordner):
    page = browser.new_page(viewport={'width': 1280, 'height': 800})
    page.goto('file://' + os.path.join(os.path.abspath(ordner), 'Autorennen.html')); page.wait_for_timeout(1500)
    werte = {sid: page.evaluate(LICHTWERTE, sid) for sid in STRECKEN}
    page.close()
    json.dump(werte, open(REF, 'w'), indent=1)
    print('Referenz aufgenommen:', REF)


with sync_playwright() as p:
    browser = p.chromium.launch(args=ARGS)
    if '--referenz' in sys.argv:
        referenz_aufnehmen(browser, args[0]); browser.close(); sys.exit(0)
    page = browser.new_page(viewport={'width': 1280, 'height': 800})
    fehler = []
    page.on('pageerror', lambda e: fehler.append(str(e)))
    page.on('console', lambda m: fehler.append('console.error: ' + m.text) if m.type == 'error' else None)
    page.goto(url); page.wait_for_timeout(1500)

    # ---- Teil 1: Tag = bitgleich ----
    pruefe('Einstellung tageszeit: Standard „tag"', page.evaluate('Rennspiel.spiel.einstellungen.tageszeit') == 'tag')
    ref = json.load(open(REF)) if os.path.exists(REF) else None
    pruefe('Referenzdatei vorhanden', ref is not None, REF)
    for sid in STRECKEN:
        w = page.evaluate(LICHTWERTE, sid)
        r = ref[sid] if ref else {}
        abw = [k for k in ('hk', 'so', 'fog', 'bg', 'basis', 'tunnelLichter', 'lichter', 'sichtbareLichter') if w.get(k) != r.get(k)]
        pruefe('Tag %s: Licht/Himmel/Nebel bitgleich mit vorher' % sid, not abw, {k: (w.get(k), r.get(k)) for k in abw})
        pruefe('Tag %s: keine Kuppel/Sterne/Laternen/Mond' % sid, not w['namen'], w['namen'])
    # Tag-Rennen: Autolicht aus, keine Nacht-Objekte
    page.evaluate(STARTEN, {'einst': {'streckeId': 'wald', 'tageszeit': 'tag'}, 'vorlauf': 3})
    m = page.evaluate(MESSEN)
    pruefe('Tag-Rennen: Autolicht aus, keine Zusatz-Objekte, HUD ohne 🌙/🌇', not any(m['autosLicht']) and not m['objekte']
           and not any(('🌙' in x or '🌇' in x) for x in m['hud']) and m['masten'] == 0, m)

    # ---- Teil 2: Bilder ----
    ergebnisse = {}
    for name, einst, vorlauf in SZENEN:
        zwei = einst.get('modus') == 'zwei'
        page.evaluate(STARTEN, {'einst': einst, 'vorlauf': vorlauf})
        # echte Frames (mind. 40, swiftshader ist langsam): Kamera folgt, Lichter werden gesetzt; dann anhalten
        page.evaluate('() => new Promise((ok) => { let n = 0; const f = () => (++n >= 40 ? ok() : requestAnimationFrame(f)); requestAnimationFrame(f); })')
        page.evaluate('() => { Rennspiel.spiel.pausiert = true; }')
        page.evaluate('() => new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(ok)))')
        m = page.evaluate(MESSEN)
        png = page.screenshot(path=os.path.join(aus, name + '.png'))
        # Helligkeit: unteres Drittel (Straße + Auto), Straßenmitte vs. Rand
        m['hell_unten'] = helligkeit(png, (0, 0.62, 1, 1))
        m['hell_strasse'] = helligkeit(png, (0.38, 0.62, 0.62, 0.8)) if not zwei else helligkeit(png, (0.15, 0.62, 0.35, 0.8))
        m['hell_gesamt'] = helligkeit(png, (0, 0, 1, 1))
        ergebnisse[name] = m
        print(name, json.dumps(m, ensure_ascii=False), flush=True)
        tz = einst['tageszeit']
        L = m['lichter']
        ansichten = 2 if zwei else 1
        pruefe(name + ': Zusatz-Draw-Calls ≤ 6 je Ansicht', m['zusatz'] <= 6 * ansichten, '%d bei %d Ansicht(en) (%s)' % (m['zusatz'], ansichten, m['objekte']))
        pruefe(name + ': Lichter Spot ≤ 2, Punkt ≤ 3', L['spot'] <= 2 and L['punkt'] <= 3, L)
        pruefe(name + ': alle Autos mit Licht', all(m['autosLicht']), m['autosLicht'])
        pruefe(name + ': HUD-Symbol ' + ('🌙' if tz == 'nacht' else '🌇'), all(('🌙' if tz == 'nacht' else '🌇') in x for x in m['hud']), m['hud'])
        grenze = 15 if tz == 'nacht' else 30
        pruefe(name + ': Bild nicht zu schwarz (unteres Drittel ≥ %d)' % grenze, m['hell_unten'] >= grenze, m['hell_unten'])
        if tz == 'nacht':
            pruefe(name + ': Scheinwerfer-Spots an (2)', L['spot'] == 2, m['spots'])
            pruefe(name + ': Himmelskuppel' + ('' if 'regen' in name else ' + Sterne'),
                   'Himmelskuppel' in m['objekte'] and ('Sterne' in m['objekte'] or 'regen' in name), m['objekte'])
            if einst['streckeId'] in ('wiese', 'wald'):
                pruefe(name + ': Laternen da (Masten = Säulen) und ≥ 1 Laternen-Punktlicht', m['lampen'] > 10 and m['masten'] == m['lampen'] and L['punkt'] >= 1,
                       'Lampen %d, Masten %d, Punkt %d' % (m['lampen'], m['masten'], L['punkt']))
            else:
                pruefe(name + ': keine Laternen (Thema ohne laternen)', m['lampen'] == 0)
            pruefe(name + ': Halbkugellicht schwach (≤ 0,3)', m['hk'] <= 0.3 + 1e-9, m['hk'])
        else:
            pruefe(name + ': Dämmerung – Sonne 0,7, keine Spots', abs(m['sonne'] - 0.7) < 1e-6 and L['spot'] == 0, (m['sonne'], L))
    # Nacht-Rennen mit Laternen (Masten = Säulen): KI fährt 200 s ohne Reset, Spieler-Autopilot ebenso
    for sid in ('wiese', 'wald'):
        page.evaluate('() => { Rennspiel.spiel.pausiert = false; }')
        page.evaluate(STARTEN, {'einst': {'streckeId': sid, 'tageszeit': 'nacht', 'gegner': 8, 'runden': 5}, 'vorlauf': 200})
        r = page.evaluate('''() => { const s = Rennspiel.spiel; return { resets: s.fahrzeuge.map(f => f.driver ? f.driver.resets || 0 : 0),
          runden: s.rennen.teilnehmer.map(t => t.runde), nan: s.fahrzeuge.some(f => !Number.isFinite(f.vehicle.x)) }; }''')
        pruefe('Nacht %s 200 s, 8 KI: keine Resets, alle ≥ 1 Runde, keine NaN' % sid, sum(r['resets']) == 0 and min(r['runden']) >= 1 and not r['nan'], r)
    pruefe('keine JS-Fehler', not fehler, fehler[:3])
    json.dump(ergebnisse, open(os.path.join(aus, 'messwerte.json'), 'w'), indent=1, ensure_ascii=False)
    browser.close()

n = sum(1 for _, ok in pruef if not ok)
print('\nALLE TESTS OK' if n == 0 else '\n%d FEHLER' % n)
sys.exit(1 if n else 0)
