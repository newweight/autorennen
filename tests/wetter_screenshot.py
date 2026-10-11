#!/usr/bin/env python3
"""Runde 4: Screenshots Jahreszeit/Wetter/Wind (Playwright, headless).
main.js baut das Wetter (noch) nicht ein → die Testseite lädt src/world/wetter.js nach und baut Deko (Jahreszeit),
Himmel/Nebel/Licht, Wolken/Sonne und Partikel selbst in Rennspiel.spiel.szene ein – genau wie die Einbau-Anleitung.
Aufruf: python3 tests/wetter_screenshot.py [ausgabeordner]   (Standard tests/out/wetter)
Bilder: 01_wiese_herbst_regen, 02_wald_winter_schnee, 03_wueste_sandsturm, 04_wiese_fruehling_sonne,
        05_wald_herbst_klar, 06_wiese_sommer_standard, 07_wiese_winter_hagel, 08_wald_herbst_nebel, 09_split_regen
Prüft: keine JS-Fehler, Wetter-Objekte (= zusätzliche Draw-Calls) ≤ 6 auch im Split-Screen, Windanzeige im HUD bei Wind > 0,
       Bild-Helligkeit Winter > Sommer (weißer Boden), Sandsturm orange (R > B)."""
import sys, os, io, json
from playwright.sync_api import sync_playwright
from PIL import Image, ImageStat

basis = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
aus = sys.argv[1] if len(sys.argv) > 1 else os.path.join(basis, 'tests', 'out', 'wetter')
os.makedirs(aus, exist_ok=True)
url = 'file://' + os.path.join(basis, 'Autorennen.html')
WETTER_JS = os.path.join(basis, 'src', 'world', 'wetter.js')


def mittel(png, box=None):
    b = Image.open(io.BytesIO(png)).convert('RGB')
    if box:
        w, h = b.size
        b = b.crop((int(box[0] * w), int(box[1] * h), int(box[2] * w), int(box[3] * h)))
    return [round(x, 1) for x in ImageStat.Stat(b).mean]


# Wetter wie in der Einbau-Anleitung aufbauen (Deko neu mit Jahreszeit, anwenden, Partikel, HUD, Physik-Umwelt, update)
EINBAUEN = '''(o) => { const s = Rennspiel.spiel, R = Rennspiel, st = s.strecke, thema = st.thema || st.daten.thema;
  const alt = s.szene.children.find(c => c.name.startsWith('Deko'));
  if (alt) { s.szene.remove(alt); }
  s.szene.add(R.themes.statischVorbereiten(R.themes.dekoBauen(thema, st, o.jahreszeit)));
  const w = new R.Wetter(s.szene, { jahreszeit: o.jahreszeit, wetter: o.wetter, wind: { staerke: o.wind, richtung: o.richtung },
    thema, seed: 77, strecke: st });
  const erg = w.anwenden(R.themes[thema], { halbkugel: s.halbkugelLicht, sonne: s.sonne });
  s.qualitaet.sicht = erg.sicht; s.qualitaetAnwenden(true);
  s.szene.fog.near = erg.sicht * erg.nebelNah;
  s._lichtBasis = { himmel: s.halbkugelLicht.intensity, sonne: s.sonne.intensity };
  w.partikelBauen(s.kameras.length);
  s.huds.forEach(h => h.wetterSetzen(w));
  s.fahrzeuge.forEach(f => { const v = f.vehicle, orig = v.schritt.bind(v); v.schritt = (dt, x, h) => orig(dt, x, h, w.umwelt()); });
  const zeichnen = s.zeichnen.bind(s); let t0 = performance.now();
  s.zeichnen = () => { const t = performance.now(); w.update((t - t0) / 1000, s.zeichnenKameras ? s.zeichnenKameras() : s.kameras); t0 = t; zeichnen(); };
  s._testWetter = w;
  return { jahreszeit: w.jahreszeit, wetter: w.wetterArt, wind: w.windStaerke, sicht: Math.round(erg.sicht),
    nebelNah: erg.nebelNah, umwelt: Object.assign({}, w.umwelt()) }; }'''

AUTO_NACH_S = '''(s) => { const sp = Rennspiel.spiel.strecke.spline, q = sp.punktBei(s), sp0 = Rennspiel.spiel;
  sp0.fahrzeuge.forEach((f, i) => { const p = sp.punktBei(s - 30 - 25 * i); if (i === 0) f.vehicle.setzen(q.x, q.z, Rennspiel.headingAus(q.tx, q.tz));
    else { f.vehicle.setzen(p.x + p.nx * 30, p.z + p.nz * 30, 0); if (f.driver) f.driver.steuerung = () => ({ gas: 0, bremse: 1, lenkung: 0 }); } f.index = -1; });
  sp0.kameras[0]._erstesMal = true; }'''

# Kamera zur Sonne drehen (Blick waagerecht in Sonnenrichtung, leicht nach oben)
KAMERA_SONNE = '''() => { const s = Rennspiel.spiel, k = s.kameras[0], w = s._testWetter, v = s.fahrzeuge[0].vehicle;
  k.update = () => {}; const d = w._sonnenDir || { x: 0.6, y: 0.3, z: 0.4 }, fl = Math.hypot(d.x, d.z);
  const y = s.strecke.hoeheAn(v.x, v.z) + 4;
  k.kamera.position.set(v.x - d.x / fl * 12, y, v.z - d.z / fl * 12);
  k.kamera.lookAt(v.x + d.x / fl * 100, y + 22, v.z + d.z / fl * 100); }'''

INFO = '''(() => { const s = Rennspiel.spiel, i = s.renderer.info.render;
  const el = document.querySelector('.hud-wetter'), wind = document.querySelector('.hud-wetter .w-wind');
  let wetterObjekte = 0; s.szene.traverse(o => { if ((o.isMesh || o.isPoints || o.isLineSegments) && o.visible && (o.name.startsWith('Wetter') ||
    (o.parent && o.parent.name === 'Wetter Himmel'))) wetterObjekte++; });
  return { drawCalls: i.calls, wetterObjekte, dreiecke: i.triangles, fps: s.uhr.fps,
    hudWetter: el ? getComputedStyle(el).display !== 'none' : null, hudWind: wind ? getComputedStyle(wind).display !== 'none' : null,
    hudText: el ? el.textContent : null, pfeil: (document.querySelector('.w-pfeil') || {}).style ? document.querySelector('.w-pfeil').style.transform : null,
    windSeite: +s.fahrzeuge[0].vehicle.windSeite.toFixed(2) }; })()'''

FAELLE = [
    ('01_wiese_herbst_regen', 'wiese', 'herbst', 'regen', 2, 1.2, 420, False),
    ('02_wald_winter_schnee', 'wald', 'winter', 'schnee', 1, 0.5, 400, False),
    ('03_wueste_sandsturm', 'wueste', 'winter', 'sandsturm', 4, 1.0, 600, False),
    ('04_wiese_fruehling_sonne', 'wiese', 'fruehling', 'klar', 0, 0, 420, True),
    ('05_wald_herbst_klar', 'wald', 'herbst', 'klar', 3, 2.0, 1100, False),
    ('06_wiese_sommer_standard', 'wiese', 'sommer', 'klar', 0, 0, 420, False),
    ('07_wiese_winter_hagel', 'wiese', 'winter', 'hagel', 5, 0.3, 900, False),
    ('08_wald_herbst_nebel', 'wald', 'herbst', 'nebel', 0, 0, 400, False),
    ('09_split_regen', 'wiese', 'fruehling', 'regen', 3, 2.5, 600, False),
]

ergebnisse, fehler = {}, []
with sync_playwright() as pw:
    browser = pw.chromium.launch(args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
    for name, strecke, jz, wetter, wind, richtung, s, sonne in FAELLE:
        page = browser.new_page(viewport={'width': 1280, 'height': 800})
        js_fehler = []
        page.on('pageerror', lambda e: js_fehler.append(str(e)))
        page.goto(url)
        page.wait_for_timeout(1200)
        page.add_script_tag(path=WETTER_JS)
        modus = 'zwei' if 'split' in name else 'solo'
        page.evaluate("([id, modus]) => Rennspiel.spiel.rennenStarten({ modus, streckeId: id, autoIds: ['troc-cabrio', 'multivan'], runden: 3, gegner: 2, schwierigkeit: 'mittel', fahrhilfe: ['aus', 'aus'] })", [strecke, modus])
        page.wait_for_timeout(800)
        page.evaluate(AUTO_NACH_S, s)
        page.wait_for_timeout(900)
        vorher = page.evaluate(INFO)
        hell_vorher = mittel(page.screenshot())
        info = page.evaluate(EINBAUEN, {'jahreszeit': jz, 'wetter': wetter, 'wind': wind, 'richtung': richtung})
        page.wait_for_timeout(1500)
        if sonne:
            page.evaluate(KAMERA_SONNE)
            page.wait_for_timeout(600)
        nachher = page.evaluate(INFO)
        png = page.screenshot(path=os.path.join(aus, name + '.png'))
        e = {'wetter': info, 'drawCallsVorher': vorher['drawCalls'], 'drawCallsNachher': nachher['drawCalls'],
             'zusatzDrawCalls': nachher['drawCalls'] - vorher['drawCalls'], 'wetterObjekte': nachher['wetterObjekte'], 'hud': {k: nachher[k] for k in ('hudWetter', 'hudWind', 'hudText', 'pfeil', 'windSeite')},
             'farbeVorher': hell_vorher, 'farbeNachher': mittel(png), 'farbeOben': mittel(png, (0, 0, 1, 0.3)), 'fps': nachher['fps'], 'jsFehler': js_fehler}
        ergebnisse[name] = e
        if js_fehler: fehler.append(name + ': JS-Fehler ' + '; '.join(js_fehler))
        if e['wetterObjekte'] > 6: fehler.append(name + ': %d Wetter-Objekte (Draw-Calls)' % e['wetterObjekte'])
        if wind > 0 and not e['hud']['hudWind']: fehler.append(name + ': Windanzeige fehlt')
        if wind == 0 and wetter == 'klar' and e['hud']['hudWetter']: fehler.append(name + ': HUD-Wetter sichtbar obwohl klar/Wind 0')
        page.close()
    browser.close()

if ergebnisse['02_wald_winter_schnee']['farbeNachher'][1] <= ergebnisse['02_wald_winter_schnee']['farbeVorher'][1]:
    fehler.append('Winter nicht heller als vorher')
sand = ergebnisse['03_wueste_sandsturm']['farbeNachher']
if not sand[0] > sand[2] + 20: fehler.append('Sandsturm nicht orange %s' % sand)
print(json.dumps(ergebnisse, indent=1, ensure_ascii=False))
print('\n'.join(fehler) if fehler else 'ALLE PRÜFUNGEN OK')
sys.exit(1 if fehler else 0)
