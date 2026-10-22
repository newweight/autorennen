#!/usr/bin/env python3
"""v32 N3+N4: Garage-Knopf im Hauptmenü sichtbar/klickbar (1024x768, 1280x800, 1920x1080, Touch) + jedes Rennen startet mit 100 %.
Aufruf: export PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers; python3 tests/garage_knopf_test.py"""
import os, sys
from playwright.sync_api import sync_playwright
basis = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
url = 'file://' + os.path.join(basis, 'Autorennen.html')
out = os.path.join(basis, 'tests', 'out', 'v32'); os.makedirs(out, exist_ok=True)
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
pruef = []; fehler = []
def pruefe(n, ok, info=''):
    pruef.append(ok); print(('OK   ' if ok else 'FEHL ') + n + (' – ' + str(info) if info != '' else ''), flush=True)
BOX = '''() => { const b = document.getElementById('garage-knopf'); if (!b) return null; const r = b.getBoundingClientRect();
  const m = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
  return { l: r.left, t: r.top, r: r.right, b: r.bottom, w: innerWidth, h: innerHeight, treffer: !!m && (m === b || b.contains(m)) && [[r.left + 22, (r.top + r.bottom) / 2], [r.right - 22, (r.top + r.bottom) / 2]].every(([x, y]) => { const e = document.elementFromPoint(x, y); return e === b || b.contains(e); }), scroll: document.documentElement.scrollHeight > innerHeight + 1 }; }'''
START = '''(modus) => Rennspiel.spiel.rennenStarten({ modus, streckeId: 'wiese', welt: 'klassisch', schaden: true, gegner: 1, runden: 1,
  schwierigkeit: 'leicht', fahrer: ['Jonas', 'Emmy'], autoIds: ['passat', 'multivan'], fahrhilfe: ['aus', 'aus'], wetter: 'klar', jahreszeit: 'sommer', tageszeit: 'tag', polizei: false })'''
PROZ = '''() => { const s = Rennspiel.spiel; return s.fahrzeuge.map((f, i) => f.istSpieler ? s.schaden.zustand(i).prozent : null).filter(x => x !== null); }'''
with sync_playwright() as p:
    br = p.chromium.launch(args=ARGS)
    def neu(vp, **kw):
        ctx = br.new_context(viewport=vp, **kw); pg = ctx.new_page(); pg.set_default_timeout(120000)
        pg.on('pageerror', lambda e: fehler.append(str(e)))
        pg.goto(url); pg.wait_for_function('window.Rennspiel && Rennspiel.spiel'); pg.wait_for_timeout(1200); return pg
    NUR = os.environ.get('NUR', '')   # NUR=n4: nur Start-100-%-Teil; NUR=handy: nur Handy
    for w, h in ([] if NUR else [(1024, 768), (1280, 800), (1920, 1080)]):
        pg = neu({'width': w, 'height': h})
        for schritt in (0, 3):   # Modus-Schritt und Auto-Schritt
            pg.evaluate(f'Rennspiel.spiel.menue.schritt = {schritt}; Rennspiel.spiel.menue.zeichnen()'); pg.wait_for_timeout(500)
            b = pg.evaluate(BOX)
            ok = b and b['l'] >= 0 and b['t'] >= 0 and b['r'] <= b['w'] and b['b'] <= b['h'] and b['treffer'] and not b['scroll']
            pruefe(f'{w}x{h} Schritt {schritt}: Knopf sichtbar, im Bild, nicht verdeckt, kein Scrollen', ok, b)
            pg.screenshot(path=os.path.join(out, f'garage_knopf_{w}x{h}_s{schritt}.png'))
        pg.evaluate('Rennspiel.spiel.menue.schritt = 0; Rennspiel.spiel.menue.zeichnen()'); pg.wait_for_timeout(300)
        pg.click('#garage-knopf'); pg.wait_for_timeout(800)
        auf = pg.evaluate('!!(Rennspiel.spiel.menue.garageUi && Rennspiel.spiel.menue.garageUi.sichtbar)')
        pruefe(f'{w}x{h}: Klick öffnet die Garage', auf)
        pg.screenshot(path=os.path.join(out, f'garage_offen_{w}x{h}.png'))
        pg.keyboard.press('Escape'); pg.wait_for_timeout(500)
        pruefe(f'{w}x{h}: Esc schließt, Menü zurück', pg.evaluate('!Rennspiel.spiel.menue.garageUi.sichtbar') and pg.evaluate('!!document.getElementById("garage-knopf")'))
        pg.keyboard.press('KeyG'); pg.wait_for_timeout(500)
        pruefe(f'{w}x{h}: Taste G öffnet weiter', pg.evaluate('Rennspiel.spiel.menue.garageUi.sichtbar'))
        pg.context.close()
    # Touch (Handy quer)
    if NUR != 'n4':
      pg = neu({'width': 844, 'height': 390}, has_touch=True, is_mobile=True, device_scale_factor=2)
      pg.wait_for_timeout(500)
      b = pg.evaluate(BOX)
      pruefe('Handy 844x390: Knopf im Bild und nicht verdeckt', b and b['l'] >= 0 and b['r'] <= b['w'] and b['t'] >= 0 and b['b'] <= b['h'] and b['treffer'], b)
      pg.screenshot(path=os.path.join(out, 'garage_knopf_handy.png'))
      pg.tap('#garage-knopf'); pg.wait_for_timeout(800)
      pruefe('Handy: Antippen öffnet die Garage', pg.evaluate('!!(Rennspiel.spiel.menue.garageUi && Rennspiel.spiel.menue.garageUi.sichtbar)'))
      pg.context.close()
    if NUR != 'handy':
      # N4: Start 100 %
      pg = neu({'width': 1280, 'height': 800})
      pg.evaluate('localStorage.clear()')
      pg.evaluate("""(() => { const G = Rennspiel.Garage; G.gutschreiben('Jonas', 500); G.gutschreiben('Emmy', 500);
        G.upgradeKaufen('Jonas', 'passat', 'motor'); const o = G.laden(); o.Jonas.autos.passat.rest = 40; o.Emmy.autos.multivan = Object.assign(o.Emmy.autos.multivan || {}, { rest: 35 }); G.speichern(o); })()""")
      pruefe('Altstand: Rest 40 % im Speicher wird beim Laden verworfen (100)', pg.evaluate("Rennspiel.Garage.autoDaten('Jonas','passat').rest") == 100)
      for modus in ('solo', 'zwei'):
          pg.evaluate(START, modus); pg.wait_for_timeout(600)
          pruefe(f'{modus}: Start mit Schaden an = 100 % (trotz Rest 40/35)', pg.evaluate(PROZ) == ([100] if modus == 'solo' else [100, 100]), pg.evaluate(PROZ))
          pg.evaluate("(()=>{const s=Rennspiel.spiel; s.schaden._punkteSetzen(0,30); if(s.fahrzeuge[1].istSpieler) s.schaden._punkteSetzen(1,30);})()")
          # Schaden im Rennen -> Rennen-Neustart (Menüweg) -> 100 %
          pg.evaluate(START, modus); pg.wait_for_timeout(600)
          pruefe(f'{modus}: Neustart nach Schaden 30 % = 100 %', pg.evaluate(PROZ) == ([100] if modus == 'solo' else [100, 100]), pg.evaluate(PROZ))
      # Echter Rennende-Pfad: Rest wird NICHT mehr gespeichert
      pg.evaluate(START, 'solo'); pg.wait_for_timeout(500)
      pg.evaluate("Rennspiel.spiel.schaden._punkteSetzen(0, 25)")
      pg.evaluate("Rennspiel.spiel.zumMenue && Rennspiel.spiel.zumMenue()"); pg.wait_for_timeout(400)
      pg.evaluate(START, 'solo'); pg.wait_for_timeout(600)
      pruefe('Nach Garage-Gang/Menü: nächstes Rennen 100 %', pg.evaluate(PROZ) == [100], pg.evaluate(PROZ))
      st = pg.evaluate("Rennspiel.Garage.autoDaten('Jonas','passat').motor")
      pruefe('Tuning bleibt dauerhaft (Motor Stufe 1)', st == 1, st)
      v = pg.evaluate("Rennspiel.spiel.fahrzeuge[0].vehicle.daten.vMax / new Rennspiel.Vehicle(Rennspiel.spiel.fahrzeuge[0].auto.fahrwerte, {tempoKlasse: Rennspiel.spiel.tempoKlasse}).daten.vMax")
      pruefe('Motor-Tuning wirkt im Rennen (vMax > Basis, ca. +4 %)', 1.03 < v < 1.06, round(v, 3))
      pruefe('keine JS-Fehler', not fehler, fehler[:3])
    br.close()
print(f'\n{sum(pruef)} OK, {len(pruef) - sum(pruef)} FEHL'); sys.exit(0 if all(pruef) else 1)
