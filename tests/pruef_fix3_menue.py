#!/usr/bin/env python3
"""PRUEF-FIX 3: Ist der Schalter „🤖 KI-Tricks“ im Start-Menü sichtbar und erreichbar? Beide Spiele, 1100×650 und 844×390.
Prüft: Pille im DOM, nach Scrollen im sichtbaren Bereich (nicht von Kopf/Knopfleiste verdeckt), per Mausklick umschaltbar, per Tastatur (↓) erreichbar (Fokus-Zeile 'kiTricks', Pille danach im Bild).
Bilder nach tests/bilder_pruef/. Aufruf: python3 tests/pruef_fix3_menue.py"""
import os, sys
from playwright.sync_api import sync_playwright
BASIS = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(BASIS, 'tests', 'bilder_pruef'); os.makedirs(OUT, exist_ok=True)
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
ok = fehl = 0
def pruefe(n, g, i=''):
    global ok, fehl
    print(('OK   ' if g else 'FEHL ') + n + (('  (' + str(i) + ')') if i != '' else ''), flush=True)
    if g: ok += 1
    else: fehl += 1
MESS = """() => { const p = document.querySelector('[data-a="wert:kiTricks:an"]'); if (!p) return null; const r = p.getBoundingClientRect();
  const sp = document.querySelector('.m-spass'), mi = document.querySelector('.m-inhalt'), ic = mi ? mi.getBoundingClientRect() : null;
  const mx = r.left + r.width / 2, my = r.top + r.height / 2, top = document.elementFromPoint(mx, my);
  return { x: Math.round(r.left), y: Math.round(r.top), b: Math.round(r.width), h: Math.round(r.height), vh: innerHeight, vb: innerWidth, imBild: r.top >= 0 && r.bottom <= innerHeight && r.left >= 0 && r.right <= innerWidth,
    inhalt: ic ? [Math.round(ic.top), Math.round(ic.bottom)] : null, imInhalt: ic ? (r.top >= ic.top - 1 && r.bottom <= ic.bottom + 1) : null, treffer: top === p || p.contains(top) || (top && top.closest && top.closest('.gr') === p.closest('.gr')),
    obenKlasse: top && top.className, aktiv: p.classList.contains('aktiv') }; }"""
with sync_playwright() as pw:
    for spiel, datei in (('auto', 'Autorennen.html'), ('moto', 'Motorrad.html')):
        for (w, h) in ((1100, 650), (844, 390)):
            tag = f'{spiel}_{w}x{h}'
            b = pw.chromium.launch(args=ARGS); pg = b.new_context(viewport={'width': w, 'height': h}).new_page(); pg.set_default_timeout(120000)
            fe = []; pg.on('pageerror', lambda e: fe.append(str(e)))
            pg.goto('file://' + os.path.join(BASIS, datei)); pg.wait_for_function('window.Rennspiel && Rennspiel.spiel'); pg.wait_for_timeout(2500)
            pg.evaluate("() => { Rennspiel.spiel.menue.zeigen(0); }"); pg.wait_for_timeout(500)
            pg.evaluate("() => { const m = Rennspiel.spiel.menue; m.e.spassModus = ''; m.schritt = 4; m.fokus = 0; m.zeichnen(); }"); pg.wait_for_timeout(700)
            m0 = pg.evaluate(MESS)
            pg.screenshot(path=os.path.join(OUT, f'menue_start_{tag}.png'))
            pruefe(f'{tag}: Pille „KI-Tricks“ im DOM', m0 is not None)
            if m0 is None: b.close(); continue
            # 1) Maus: Rad / Scroll im Inhalt
            pg.evaluate("() => { const i = document.querySelector('.m-inhalt'); if (i) i.scrollTop = i.scrollHeight; }"); pg.wait_for_timeout(300)
            m1 = pg.evaluate(MESS)
            pg.screenshot(path=os.path.join(OUT, f'menue_start_{tag}_unten.png'))
            pruefe(f'{tag}: nach Scrollen sichtbar im Bild und nicht verdeckt', bool(m1 and m1['imBild'] and m1['imInhalt'] and m1['treffer']), m1)
            # 2) Klick schaltet um
            vor = pg.evaluate("() => Rennspiel.SpassTricks.an('ki')")
            if m1 and m1['imBild']:
                pg.mouse.click(m1['x'] + m1['b'] / 2, m1['y'] + m1['h'] / 2); pg.wait_for_timeout(300)
            nach = pg.evaluate("() => Rennspiel.SpassTricks.an('ki')")
            pruefe(f'{tag}: Mausklick auf „An“ setzt KI-Tricks (vorher {vor})', nach is True)
            pg.evaluate("() => { const p = document.querySelector('[data-a=\"wert:kiTricks:aus\"]'); if (p) p.click(); }"); pg.wait_for_timeout(200)
            aus = pg.evaluate("() => Rennspiel.SpassTricks.an('ki')")
            pruefe(f'{tag}: Klick auf „Aus“ schaltet aus', aus is False)
            pg.evaluate("() => Rennspiel.SpassTricks.anSetzen('ki', true)")
            # 3) Tastatur: Fokus ↓ bis 'kiTricks'
            pg.evaluate("() => { const m = Rennspiel.spiel.menue; m.fokus = 0; m.zeichnen(); const i = document.querySelector('.m-inhalt'); if (i) i.scrollTop = 0; }"); pg.wait_for_timeout(300)
            fok = None
            for n in range(60):
                pg.keyboard.press('ArrowDown'); pg.wait_for_timeout(40)
                z = pg.evaluate("() => { const m = Rennspiel.spiel.menue, z = m.zeilen(); return z[m.fokus]; }")
                if z == 'kiTricks': fok = n + 1; break
            m2 = pg.evaluate(MESS)
            pruefe(f'{tag}: Tastatur ↓ erreicht Zeile „kiTricks“ ({fok} Tasten) und die Pille liegt dann im Bild', fok is not None and bool(m2 and m2['imBild'] and m2['imInhalt']), m2)
            pg.screenshot(path=os.path.join(OUT, f'menue_start_{tag}_fokus.png'))
            if fok:
                pg.keyboard.press('ArrowLeft'); pg.wait_for_timeout(150); a1 = pg.evaluate("() => Rennspiel.SpassTricks.an('ki')")
                pg.keyboard.press('ArrowRight'); pg.wait_for_timeout(150); a2 = pg.evaluate("() => Rennspiel.SpassTricks.an('ki')")
                pruefe(f'{tag}: ←/→ schaltet KI-Tricks aus/an', a1 is False and a2 is True, (a1, a2))
            pruefe(f'{tag}: keine Seitenfehler', not fe, fe[:2])
            b.close()
print(f'\n{ok} OK, {fehl} FEHL'); sys.exit(1 if fehl else 0)
