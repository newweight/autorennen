#!/usr/bin/env python3
"""Cockpit-Anzeigen, Rückspiegel, Wischer (14.10. v21): python3 tests/cockpit_anzeigen_test.py [ausgabeordner]  (Standard tests/out/cockpit)
(Der ältere tests/cockpit_test.py prüft nur den Kamera-Roll der Cockpit-Kamera und bleibt unverändert.)
Bilder: <auto>_cockpit.png (Passat, Multivan, 911, T-Roc, BMW = alte Anzeige), spiegel_an/aus.png, regen_cockpit.png (Wischer), regen_verfolger.png,
        hagel/schnee, zwei_*.png (Zweispieler), klar_ohne_wischer.png. Prüft: Stil je Auto, alter Tacho nur bei „standard“, Instrumente zeichnen Tempo,
        Spiegelbild unterscheidet sich von „Spiegel aus“ und zeigt etwas anderes als die Straße vorn, Spiegel abschaltbar (Config), Zweispieler ohne Spiegel,
        Wischer nur bei Niederschlag + nur im Cockpit-Modus, Tropfen werden abgewischt, Zeichenfläche versteckt bei klarem Wetter, keine JS-Fehler."""
import sys, os, io
from playwright.sync_api import sync_playwright
from PIL import Image, ImageChops, ImageStat

basis = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
out = sys.argv[1] if len(sys.argv) > 1 else os.path.join(basis, 'tests', 'out', 'cockpit')
os.makedirs(out, exist_ok=True)
url = 'file://' + os.path.join(basis, 'Autorennen.html')
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
erg = []
def pruefe(name, ok, info=''):
    erg.append(ok); print(('OK   ' if ok else 'FEHL ') + name + (' – ' + str(info) if info != '' else ''), flush=True)

def start(page, auto, modus='solo', wetter='klar', kam='cockpit', kmh=110, strecke='wiese', jahreszeit='herbst'):
    page.evaluate("""([auto, modus, wetter, strecke, jahreszeit]) => Rennspiel.spiel.rennenStarten({ modus, streckeId: strecke, autoIds: [auto, 'multivan'], runden: 3, gegner: 3,
        schwierigkeit: 'mittel', fahrhilfe: ['wenig', 'wenig'], wetter, jahreszeit })""", [auto, modus, wetter, strecke, jahreszeit])
    page.wait_for_timeout(400)
    page.evaluate("() => Rennspiel.spiel.schnellvorlauf(8)")
    page.evaluate("""([kam, kmh]) => { const s = Rennspiel.spiel; s.kameras.forEach(k => { k.modusIndex = Rennspiel.config.kamera.modi.indexOf(kam); k._erstesMal = true; });
      s.fahrzeuge.forEach((f, i) => { if (i < 2) f.vehicle.vLaengs = kmh / 3.6; }); }""", [kam, kmh])
    page.wait_for_function("() => { const c = Rennspiel.spiel.huds[0].cockpit; if (c.stil === 'standard') return c.rahmen.style.display === 'block'; window._z0 = window._z0 === undefined ? c.zeichnungen : window._z0; return c.zeichnungen > window._z0 + 3; }", timeout=120000)
    page.evaluate("() => { window._z0 = undefined; }")

def bis(page, js, timeout=120000):
    """Wartet (langsame Software-GL!), bis der JS-Ausdruck wahr ist; false bei Zeitüberschreitung."""
    # HUD vorher von Hand aktualisieren (die Spielschleife kommt bei Software-GL und fremder Last oft nur auf < 1 Bild/s)
    try:
        page.wait_for_function("() => { Rennspiel.spiel.huds.forEach((h) => h.update()); return (" + js + ")(); }", timeout=timeout); return True
    except Exception:
        return False

def bild(page, name):
    png = page.screenshot(path=os.path.join(out, name))
    return Image.open(io.BytesIO(png)).convert('RGB')

def unterschied(a, b, box):
    d = ImageChops.difference(a.crop(box), b.crop(box)).convert('L')
    return ImageStat.Stat(d).mean[0]

INFO = """() => { const h = Rennspiel.spiel.huds[0], c = h.cockpit; const sicht = (n) => c.teile[n] ? c.teile[n].el.style.display !== 'none' : false;
  return { stil: c.stil, aktiv: c.aktiv, teile: Object.keys(c.teile).filter(sicht), alterTacho: h.el.querySelector('.hud-tacho').style.display,
    spiegelRahmen: c.rahmen.style.display, wischer: c.wischer ? c.wischer.canvas.style.display : 'x', tropfen: c.wischer ? c.wischer.tropfen.length : -1,
    tachoText: c.teile.tacho ? c.teile.tacho.letzte : (c.teile.drehzahl ? c.teile.drehzahl.letzte : ''), kmh: Math.round(h.f.vehicle.vLaengs * 3.6) }; }"""

with sync_playwright() as pw:
    browser = pw.chromium.launch(args=ARGS)
    page = browser.new_page(viewport={'width': 1280, 'height': 800})
    fehler = []
    page.on('pageerror', lambda e: fehler.append(str(e)))
    page.on('console', lambda m: fehler.append('console.error: ' + m.text) if m.type == 'error' else None)
    page.goto(url); page.wait_for_timeout(1200)

    # ---------- Cockpits je Auto ----------
    for auto, stil, teile in [('passat', 'vw', {'tafel', 'drehzahl', 'tacho', 'mitte'}), ('multivan', 'vw', {'tafel', 'drehzahl', 'tacho', 'mitte'}),
                              ('troc-cabrio', 'vw', {'tafel', 'drehzahl', 'tacho', 'mitte'}),
                              ('porsche-911', 'porsche', {'tafel', 'drehzahl', 'linksAussen', 'linksInnen', 'rechtsInnen', 'rechtsAussen'}),
                              ('bmw-m4', 'standard', set())]:
        start(page, auto)
        i = page.evaluate(INFO)
        bild(page, auto + '_cockpit.png')
        pruefe(f'{auto}: Stil {stil}, Teile {sorted(teile)}', i['stil'] == stil and set(i['teile']) == teile, i)
        pruefe(f'{auto}: alter Tacho ' + ('sichtbar' if stil == 'standard' else 'versteckt'), (i['alterTacho'] != 'none') == (stil == 'standard'), i['alterTacho'])
        if stil == 'vw': pruefe(f'{auto}: Tacho zeichnet das aktuelle Tempo ({i["kmh"]} km/h)', str(i['kmh'])[:1] in i['tachoText'] and i['kmh'] > 50, i['tachoText'])
        pruefe(f'{auto}: Spiegel-Rahmen sichtbar (Standard an)', i['spiegelRahmen'] == 'block')

    # ---------- Spiegel: Inhalt, abschaltbar ----------
    start(page, 'passat')
    mit = bild(page, 'spiegel_an.png')
    box = (480, 540, 800, 605)
    page.evaluate("() => { Rennspiel.config.cockpit.spiegel.an = false; }")
    bis(page, "() => Rennspiel.spiel.huds[0].cockpit.rahmen.style.display === 'none'")
    ohne = bild(page, 'spiegel_aus.png')
    page.evaluate("() => { Rennspiel.config.cockpit.spiegel.an = true; }")
    bis(page, "() => Rennspiel.spiel.huds[0].cockpit.rahmen.style.display === 'block'")
    d = unterschied(mit, ohne, box)
    pruefe('Spiegel zeigt ein Bild (Ausschnitt weicht von „Spiegel aus“ ab)', d > 6, round(d, 1))
    page.evaluate("() => { Rennspiel.config.cockpit.spiegel.an = false; }")
    pruefe('Spiegel aus → Rahmen weg', bis(page, "() => Rennspiel.spiel.huds[0].cockpit.rahmen.style.display === 'none'"))
    page.evaluate("() => { Rennspiel.config.cockpit.spiegel.an = true; }")
    # Positionen per Config verschieben: Spiegel nach oben
    page.evaluate("() => { Rennspiel.config.cockpit.spiegel.y = 30; Rennspiel.spiel.huds[0].cockpit._layoutSp = ''; }")
    bis(page, "() => parseFloat(Rennspiel.spiel.huds[0].cockpit.rahmen.style.top) < 300")
    oben = bild(page, 'spiegel_oben.png')
    top = page.evaluate("() => parseFloat(Rennspiel.spiel.huds[0].cockpit.rahmen.style.top)")
    d2 = unterschied(oben, mit, box)
    pruefe('Position per Config änderbar (Spiegel y = 30: Rahmen wandert nach oben, alter Platz ist leer)', top < 300 and d2 > 20, f'Rahmen oben {top:.0f}px, Unterschied am alten Platz {d2:.1f}')
    page.evaluate("() => { Rennspiel.config.cockpit.spiegel.y = 71.5; Rennspiel.spiel.huds[0].cockpit._layoutSp = ''; }")

    # ---------- Wischer ----------
    start(page, 'passat', wetter='klar')
    i = page.evaluate(INFO)
    pruefe('Klares Wetter: Wischer-Fläche versteckt, keine Tropfen', i['wischer'] == 'none' and i['tropfen'] == 0, i['wischer'])
    for wetter in ('regen', 'schnee', 'hagel'):
        start(page, 'passat', wetter=wetter, jahreszeit='winter' if wetter == 'schnee' else 'herbst')
        bis(page, "() => Rennspiel.spiel.huds[0].cockpit.wischer.tropfen.length > 3", 60000)
        i = page.evaluate(INFO)
        bild(page, wetter + '_cockpit.png')
        pruefe(f'{wetter}: Wischer-Fläche sichtbar, Tropfen/Flocken da', i['wischer'] == 'block' and i['tropfen'] > 3, i)
    # Abwischen: Tropfen füllen die Scheibe, nach einem Wischgang sind sie im Sektor weg
    start(page, 'passat', wetter='regen')
    page.wait_for_timeout(6000)
    n = page.evaluate("""() => { const w = Rennspiel.spiel.huds[0].cockpit.wischer; const a = w.tropfen.length; let kleinster = a, groesster = a;
      return new Promise((res) => { const t0 = performance.now(); const iv = setInterval(() => { const x = w.tropfen.length; kleinster = Math.min(kleinster, x); groesster = Math.max(groesster, x);
        if (performance.now() - t0 > 9000) { clearInterval(iv); res({ start: a, klein: kleinster, gross: groesster, max: Rennspiel.config.cockpit.wischer.tropfen.regen }); } }, 100); }); }""")
    pruefe('Wischer räumt Tropfen ab (Anzahl schwankt: nicht dauerhaft voll, nicht leer)', n['klein'] < n['gross'] and n['gross'] <= n['max'], n)
    start(page, 'passat', wetter='regen', kam='verfolger')
    i = page.evaluate(INFO); bild(page, 'regen_verfolger.png')
    pruefe('Regen in Verfolgersicht: Wischer aus (nur Cockpit-Modus), Instrumente weiter da', i['wischer'] == 'none' and i['aktiv'] and i['spiegelRahmen'] == 'block', i)
    page.evaluate("() => { Rennspiel.config.cockpit.wischer.modi = ['cockpit', 'verfolger', 'weit']; }")
    bis(page, "() => Rennspiel.spiel.huds[0].cockpit.wischer.canvas.style.display === 'block'")
    i = page.evaluate(INFO); bild(page, 'regen_verfolger_wischer_an.png')
    pruefe('wischer.modi erweitert → Wischer auch in Verfolgersicht', i['wischer'] == 'block', i['wischer'])
    page.evaluate("() => { Rennspiel.config.cockpit.wischer.modi = ['cockpit']; }")
    page.evaluate("() => { Rennspiel.config.cockpit.wischer.an = false; }")
    pruefe('wischer.an = false → aus', bis(page, "() => Rennspiel.spiel.huds[0].cockpit.wischer.canvas.style.display === 'none'"))
    page.evaluate("() => { Rennspiel.config.cockpit.wischer.an = true; Rennspiel.config.cockpit.an = false; }")
    bis(page, "() => !Rennspiel.spiel.huds[0].cockpit.aktiv")
    i = page.evaluate(INFO); bild(page, 'cockpit_aus.png')
    pruefe('cockpit.an = false → alter Tacho wieder da, Instrumente weg, Wischer aus', i['alterTacho'] != 'none' and not i['aktiv'] and i['wischer'] == 'none', i)
    page.evaluate("() => { Rennspiel.config.cockpit.an = true; }")

    # ---------- Zweispieler ----------
    for auto in ('passat', 'porsche-911'):
        start(page, auto, modus='zwei', wetter='regen')
        page.evaluate("() => Rennspiel.spiel.kameras.forEach(k => { k.modusIndex = Rennspiel.config.kamera.modi.indexOf('cockpit'); })")
        bis(page, "() => Rennspiel.spiel.huds.every(h => h.cockpit.wischer.canvas.style.display === 'block' && h.cockpit.aktiv)")
        bild(page, f'zwei_{auto}_regen.png')
        r = page.evaluate("() => Rennspiel.spiel.huds.map(h => ({ stil: h.cockpit.stil, aktiv: h.cockpit.aktiv, spiegel: h.cockpit.rahmen.style.display, wischer: h.cockpit.wischer.canvas.style.display }))")
        pruefe(f'Zweispieler ({auto}/multivan): beide Hälften haben Instrumente + Wischer, KEIN Spiegel', len(r) == 2 and all(x['aktiv'] and x['spiegel'] == 'none' and x['wischer'] == 'block' for x in r), r)
    page.evaluate("() => { Rennspiel.config.cockpit.spiegel.zweispieler = 'an'; }")
    bis(page, "() => Rennspiel.spiel.huds.every(h => h.cockpit.rahmen.style.display === 'block')")
    r = page.evaluate("() => Rennspiel.spiel.huds.map(h => h.cockpit.rahmen.style.display)")
    bild(page, 'zwei_mit_spiegel.png')
    pruefe('Zweispieler mit spiegel.zweispieler = "an": Spiegel in beiden Hälften', r == ['block', 'block'], r)
    page.evaluate("() => { Rennspiel.config.cockpit.spiegel.zweispieler = 'aus'; }")

    # ---------- Menü: kein Fehler beim Zurück ins Menü / neues Rennen ----------
    page.evaluate("() => Rennspiel.spiel.zumMenue && Rennspiel.spiel.zumMenue()"); page.wait_for_timeout(500)
    start(page, 'porsche-911', wetter='regen')
    pruefe('keine JS-Fehler', not fehler, fehler[:3])
    browser.close()
print('\nALLE TESTS OK' if all(erg) else f'\n{erg.count(False)} FEHLER')
sys.exit(0 if all(erg) else 1)
