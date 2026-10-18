#!/usr/bin/env python3
"""W5-3 Touch-Steuerung: Geräte-Emulation iPhone 13 / iPad quer (hasTouch) und Desktop ohne Touch.
Prüft: Bildschirm-Tasten sichtbar (≥ 64 px, nicht über dem HUD), Desktop: nichts; Multi-Touch Gas + Links gleichzeitig,
Wischen ◀ → ▶, Loslassen; Item-Tipp = wurdeGedrueckt(item1) (auch Reset/Kamera/Pause); Menü bis zum Rennen nur per Tippen
(zweites Tippen = weiter, Los-Taste in der Leiste); Mobil-Qualität (pixelRatio ≤ 1,5, eine Stufe niedriger); Hochformat-Hinweis;
Neigung → Lenkung; keine JS-Fehler. Bilder: tests/out/touch/. v31 H4: Touch-Laptop/Tastatur-Umschaltung, Bilder tests/out/v31/touch_*.png.   Aufruf: python3 tests/touch_test.py"""
import sys, os
from playwright.sync_api import sync_playwright

basis = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
out = os.path.join(basis, 'tests', 'out', 'touch'); os.makedirs(out, exist_ok=True)
url = 'file://' + os.path.join(basis, 'Autorennen.html')
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
START = "Rennspiel.spiel.rennenStarten({ modus: 'solo', streckeId: 'wiese', autoIds: ['troc-cabrio', 'multivan'], runden: 3, gegner: 3, schwierigkeit: 'mittel', fahrhilfe: ['wenig','wenig'] })"
ergebnisse = []
def pruefe(name, ok, info=''):
    ergebnisse.append(ok); print(('OK   ' if ok else 'FEHL ') + name + (' – ' + str(info) if info != '' else ''))

RECHTECKE = '''() => { const r = {}; document.querySelectorAll('#touch [data-t]').forEach(e => { const b = e.getBoundingClientRect(); r[e.dataset.t] = [b.left, b.top, b.width, b.height]; });
  const hud = []; document.querySelectorAll('.hud .chip, .hud-minimap, .hud-tacho').forEach(e => { const b = e.getBoundingClientRect(); if (b.width > 0) hud.push([e.className.toString(), b.left, b.top, b.right, b.bottom]); });
  return { r, hud, w: innerWidth, h: innerHeight }; }'''

def mitte(rr, k): x, y, w, h = rr[k]; return x + w / 2, y + h / 2
def ueberlappt(a, b): return a[0] < b[0] + b[2] and a[0] + a[2] > b[0] and a[1] < b[1] + b[3] and a[1] + a[3] > b[1]

def touch_punkte(cdp, typ, punkte):
    # Punkt = (x, y) oder (x, y, id); bei touchEnd gelten die genannten Punkte als losgelassen
    cdp.send('Input.dispatchTouchEvent', {'type': typ, 'touchPoints': [{'x': pt[0], 'y': pt[1], 'id': pt[2] if len(pt) > 2 else i} for i, pt in enumerate(punkte, 1)]})

def geraet(p, browser, name, bildname):
    ctx = browser.new_context(**p.devices[name])
    page = ctx.new_page(); fehler = []
    page.on('pageerror', lambda e: fehler.append(str(e)))
    page.on('console', lambda m: fehler.append('console.error: ' + m.text) if m.type == 'error' else None)
    page.goto(url); page.wait_for_timeout(1800)
    pruefe(f'[{name}] Touch erkannt (R.Touch.aktiv)', page.evaluate('Rennspiel.Touch.aktiv') is True)
    pruefe(f'[{name}] im Menü keine Spiel-Tasten', page.evaluate("getComputedStyle(document.getElementById('touch')).display") == 'none')
    pruefe(f'[{name}] Vollbild-Taste nur wo möglich', page.evaluate("!!document.getElementById('t-voll') === !!(document.documentElement.requestFullscreen || document.documentElement.webkitRequestFullscreen)"))

    # ---- Menü nur per Tippen ----
    def tippe(sel, text=None):
        loc = page.locator(sel + (f':has-text("{text}")' if text else '')).first
        loc.scroll_into_view_if_needed(); loc.tap(); page.wait_for_timeout(250)
    schritt = lambda: page.evaluate('Rennspiel.spiel.menue.schritt')
    tippe('[data-a="modus:solo"]'); pruefe(f'[{name}] Menü: Tippen auf „Allein“ → Strecke', schritt() == 1, schritt())
    tippe('[data-a="strecke:wald"]'); pruefe(f'[{name}] Menü: 1. Tippen wählt (bleibt im Schritt)', schritt() == 1 and page.evaluate('Rennspiel.spiel.einstellungen.streckeId') == 'wald')
    tippe('[data-a="strecke:wald"]'); pruefe(f'[{name}] Menü: 2. Tippen auf gewählte Karte → weiter', schritt() == 2, schritt())
    tippe('.m-nav .knopf', 'Zurück'); pruefe(f'[{name}] Menü: ◀ Zurück', schritt() == 1)
    tippe('.m-nav .knopf', 'Weiter'); pruefe(f'[{name}] Menü: Weiter ▶', schritt() == 2)
    tippe('.karte.fahrer:not(.gewaehlt)'); tippe('.karte.fahrer.gewaehlt'); pruefe(f'[{name}] Fahrer wählen + bestätigen', schritt() == 3, schritt())
    tippe('.karte.auto:not(.gewaehlt)'); tippe('.karte.auto.gewaehlt'); pruefe(f'[{name}] Auto wählen + bestätigen', schritt() == 4, schritt())
    page.screenshot(path=os.path.join(out, f'{bildname}_menue_los.png'))
    pruefe(f'[{name}] Leiste hat „🏁 Los!“', page.locator('.m-nav [data-a="start"]').count() == 1)
    tippe('.m-nav [data-a="start"]'); page.wait_for_timeout(1500)
    pruefe(f'[{name}] Rennen per Tippen gestartet', page.evaluate('Rennspiel.spiel.zustand') == 'rennen', page.evaluate('Rennspiel.spiel.zustand'))
    page.wait_for_timeout(600)

    # ---- Bedienelemente ----
    pruefe(f'[{name}] Bildschirm-Tasten sichtbar im Rennen', page.evaluate("getComputedStyle(document.getElementById('touch')).display") == 'block')
    d = page.evaluate(RECHTECKE); rr = d['r']
    klein = {k: v for k, v in rr.items() if min(v[2], v[3]) < 64}
    pruefe(f'[{name}] alle Tasten ≥ 64 px', not klein, klein)
    pruefe(f'[{name}] Tasten im Bild', all(v[0] >= 0 and v[1] >= 0 and v[0] + v[2] <= d['w'] and v[1] + v[3] <= d['h'] for v in rr.values()))
    uber = [(k, h[0]) for k, v in rr.items() for h in d['hud'] if ueberlappt(v, [h[1], h[2], h[3] - h[1], h[4] - h[2]])]
    pruefe(f'[{name}] Tasten verdecken das HUD nicht', not uber, uber)
    paar = [(a, b) for a in rr for b in rr if a < b and ueberlappt(rr[a], rr[b])]
    pruefe(f'[{name}] Tasten überlappen sich nicht', not paar, paar)
    pr = page.evaluate('Rennspiel.spiel.renderer.getPixelRatio()')
    pruefe(f'[{name}] pixelRatio ≤ 1,5 (Qualität eine Stufe niedriger)', pr <= 1.25 + 1e-6, pr)
    page.screenshot(path=os.path.join(out, f'{bildname}_rennen.png'))

    # ---- Multi-Touch (echte Touch-Ereignisse über CDP) ----
    cdp = ctx.new_cdp_session(page)
    st = 'Rennspiel.spiel.input.steuerung(0)'
    gx, gy = mitte(rr, 'gas'); lx, ly = mitte(rr, 'links'); rx, ry = mitte(rr, 'rechts'); bx, by = mitte(rr, 'bremse')
    touch_punkte(cdp, 'touchStart', [(gx, gy), (lx, ly)]); page.wait_for_timeout(120)
    s = page.evaluate(st); pruefe(f'[{name}] Multi-Touch Gas + Links = {{gas:1, lenkung:-1}}', s['gas'] == 1 and s['lenkung'] == -1 and s['bremse'] == 0, s)
    page.screenshot(path=os.path.join(out, f'{bildname}_multitouch.png'))
    touch_punkte(cdp, 'touchMove', [(gx, gy), (rx, ry)]); page.wait_for_timeout(120)
    s = page.evaluate(st); pruefe(f'[{name}] Wischen ◀ → ▶ schaltet um', s['gas'] == 1 and s['lenkung'] == 1, s)
    touch_punkte(cdp, 'touchMove', [(bx, by), (rx, ry)]); page.wait_for_timeout(120)
    s = page.evaluate(st); pruefe(f'[{name}] Gas → Bremse (Wischen)', s['gas'] == 0 and s['bremse'] == 1 and s['lenkung'] == 1, s)
    touch_punkte(cdp, 'touchEnd', [(rx, ry, 2)]); page.wait_for_timeout(120)
    s = page.evaluate(st); pruefe(f'[{name}] ein Finger weg: Lenkung 0, Bremse bleibt', s['lenkung'] == 0 and s['bremse'] == 1, s)
    touch_punkte(cdp, 'touchEnd', []); page.wait_for_timeout(120)
    s = page.evaluate(st); pruefe(f'[{name}] alle Finger weg: alles 0', s == {'gas': 0, 'bremse': 0, 'lenkung': 0}, s)
    # Fahren: Gas gehalten → Auto beschleunigt wirklich
    v0 = page.evaluate('Rennspiel.spiel.fahrzeuge[0].vehicle.tempoKmh')
    page.evaluate('Rennspiel.spiel.schnellvorlauf(4)')   # Countdown
    touch_punkte(cdp, 'touchStart', [(gx, gy)]); page.wait_for_timeout(2500)
    v1 = page.evaluate('Rennspiel.spiel.fahrzeuge[0].vehicle.tempoKmh'); touch_punkte(cdp, 'touchEnd', [])
    pruefe(f'[{name}] Gas-Taste lässt das Auto fahren', v1 > v0 + 5, (v0, v1))

    # ---- Einzeltasten über denselben Weg wie die Tastatur ----
    T = page.evaluate('Rennspiel.config.tasten')
    for taste, code in (('item', T['item1']), ('reset', T['resetSpieler1']), ('kamera', T['kamera'])):
        ok = page.evaluate('''([t, code]) => { const el = document.querySelector('#touch [data-t="' + t + '"]'), b = el.getBoundingClientRect();
          const i = Rennspiel.spiel.input; i.geradeGedrueckt.clear();
          el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 77, clientX: b.left + 5, clientY: b.top + 5, pointerType: 'touch' }));
          return i.wurdeGedrueckt(code); }''', [taste, code])
        pruefe(f'[{name}] Tipp „{taste}“ → wurdeGedrueckt({code})', ok)
    k0 = page.evaluate('Rennspiel.spiel.kameras[0].modus'); kx, ky = mitte(rr, 'kamera'); page.touchscreen.tap(kx, ky); page.wait_for_timeout(300)
    k1 = page.evaluate('Rennspiel.spiel.kameras[0].modus'); pruefe(f'[{name}] echter Tipp 📷 wechselt die Kamera', k0 != k1, (k0, k1))
    ix, iy = mitte(rr, 'item')
    page.evaluate("window.__t = []; Rennspiel.spiel.input.beiTaste(c => window.__t.push(c))"); page.touchscreen.tap(ix, iy); page.wait_for_timeout(200)
    pruefe(f'[{name}] echter Tipp ⭐ sendet {T["item1"]}', T['item1'] in page.evaluate('window.__t'))
    px, py = mitte(rr, 'pause'); page.touchscreen.tap(px, py); page.wait_for_timeout(400)
    pruefe(f'[{name}] Tipp ⏸ pausiert, Tasten weg', page.evaluate('Rennspiel.spiel.pausiert') is True and page.evaluate("getComputedStyle(document.getElementById('touch')).display") == 'none')
    page.screenshot(path=os.path.join(out, f'{bildname}_pause.png'))
    page.locator('#pause [data-a="weiter"]').tap(); page.wait_for_timeout(400)
    pruefe(f'[{name}] Weiter-Knopf der Pause per Tippen', page.evaluate('Rennspiel.spiel.pausiert') is False)

    # ---- Neigung: reine Mathe + Ereignis ----
    n = page.evaluate('''() => { const T = Rennspiel.Touch.neigungZuLenkung; return [T(0, -90, 90), T(20, -90, 90), T(-20, -90, 90), T(20, -90, 270), T(60, -90, 90), T(2, -90, 90)]; }''')
    pruefe(f'[{name}] Neigung → Lenkung (0, +, −, gespiegelt bei 270°, Anschlag, Totzone)', n[0] == 0 and 0 < n[1] < 1 and n[2] == -n[1] and n[3] == -n[1] and n[4] == 1 and n[5] == 0, [round(x, 2) for x in n])
    page.evaluate('Rennspiel.Touch.neigen = true; Rennspiel.Touch.neigung = 0.5')
    s = page.evaluate(st); pruefe(f'[{name}] Neigung 0,5 → steuerung(0).lenkung 0,5', abs(s['lenkung'] - 0.5) < 1e-9, s)
    page.evaluate('Rennspiel.Touch.neigen = false; Rennspiel.Touch.neigung = 0')
    pruefe(f'[{name}] keine JS-Fehler', not fehler, fehler[:3])
    ctx.close()

with sync_playwright() as p:
    browser = p.chromium.launch(args=ARGS)
    # ---- Desktop ohne Touch ----
    ctx = browser.new_context(viewport={'width': 1280, 'height': 800}); page = ctx.new_page(); fehler = []
    page.on('pageerror', lambda e: fehler.append(str(e)))
    page.goto(url); page.wait_for_timeout(1500)
    pruefe('[Desktop] R.Touch.aktiv false', page.evaluate('Rennspiel.Touch.aktiv') is False)
    page.evaluate(START); page.wait_for_timeout(1200)
    pruefe('[Desktop] kein #touch / #t-quer / #t-voll im DOM', page.evaluate("!document.getElementById('touch') && !document.getElementById('t-quer') && !document.getElementById('t-voll')"))
    pruefe('[Desktop] <html> ohne touch-an', page.evaluate("!document.documentElement.classList.contains('touch-an')"))
    pruefe('[Desktop] Input.steuerung unverändert (Tastatur)', page.evaluate("(() => { const i = Rennspiel.spiel.input; i.gedrueckt.add('ArrowUp'); i.gedrueckt.add('ArrowLeft'); const s = i.steuerung(0); i.gedrueckt.clear(); return s.gas === 1 && s.lenkung === -1; })()"))
    pruefe('[Desktop] pixelRatio-Startstufe unverändert (1)', page.evaluate('Rennspiel.spiel._startStufe()') == 0)
    page.screenshot(path=os.path.join(out, 'desktop_rennen.png'))
    pruefe('[Desktop] keine JS-Fehler', not fehler, fehler[:3]); ctx.close()
    NUR = os.environ.get('TOUCH_NUR') == 'v31'   # nur der v31-Abschnitt (schneller)
    if not NUR:
        geraet(p, browser, 'iPhone 13 landscape', 'iphone')
        if os.environ.get('TOUCH_NUR') != 'iphone': geraet(p, browser, 'iPad (gen 7) landscape', 'ipad')
    # ---- Hochformat ----
    ctx = browser.new_context(**p.devices['iPhone 13']); page = ctx.new_page(); page.goto(url); page.wait_for_timeout(1500)
    if not NUR: pruefe('[iPhone Hochformat] Hinweis „Bitte Handy quer halten“ sichtbar', page.evaluate("getComputedStyle(document.getElementById('t-quer')).display") == 'flex')
    page.screenshot(path=os.path.join(out, 'iphone_hochformat.png')); ctx.close()
    ctx = browser.new_context(**p.devices['iPhone 13 landscape']); page = ctx.new_page(); page.goto(url); page.wait_for_timeout(1500)
    pruefe('[iPhone quer] kein Hochformat-Hinweis', page.evaluate("getComputedStyle(document.getElementById('t-quer')).display") == 'none'); ctx.close()

    # ---- v31 H4: Touch-Laptop (hasTouch ohne isMobile) + Tastatur ----
    out31 = os.path.join(basis, 'tests', 'out', 'v31'); os.makedirs(out31, exist_ok=True)
    SICHT = "getComputedStyle(document.getElementById('touch')).display"
    SCHL = "localStorage.getItem('rennspiel.eingabe')"
    def rennen_an(page):
        page.evaluate(START); page.wait_for_timeout(1500); page.evaluate('Rennspiel.spiel.schnellvorlauf(4)'); page.wait_for_timeout(500)
    # a) Touch-Laptop frisch: Windows-Laptop meldet maxTouchPoints > 0, aber pointer: fine -> Tastatur-Modus, keine Knöpfe
    ctx = browser.new_context(viewport={'width': 1366, 'height': 768}, has_touch=True, is_mobile=False); page = ctx.new_page(); fehler = []
    page.on('pageerror', lambda e: fehler.append(str(e)))
    page.add_init_script("Object.defineProperty(window, 'matchMedia', { value: (q) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }) });")
    page.goto(url); page.wait_for_timeout(1500)
    pruefe('[Touch-Laptop] Modul da, Modus = tastatur (pointer: fine)', page.evaluate('Rennspiel.Touch.aktiv') is True and page.evaluate('Rennspiel.Touch.modus') == 'tastatur', page.evaluate('Rennspiel.Touch.modus'))
    rennen_an(page)
    pruefe('[Touch-Laptop] Rennen: keine Touch-Knöpfe, kein touch-an/t-rennen', page.evaluate(SICHT) == 'none' and page.evaluate("!document.documentElement.classList.contains('touch-an') && !document.documentElement.classList.contains('t-rennen')"))
    pruefe('[Touch-Laptop] Startstufe = Desktop (0)', page.evaluate('Rennspiel.spiel._startStufe()') == 0)
    pruefe('[Touch-Laptop] Hinweis „Tippen unten = Touch-Steuerung“ im Rennstart', page.evaluate("!!document.getElementById('t-tipp')"))
    page.screenshot(path=os.path.join(out31, 'touch_laptop_tastatur_rennen.png'))
    page.wait_for_timeout(3300)
    pruefe('[Touch-Laptop] Hinweis nach 3 s weg', page.evaluate("!document.getElementById('t-tipp')"))
    # b) Touch erzwingen (?touch=1 simuliert Handy-Start): Knöpfe da -> Tastendruck blendet aus, merkt, bleibt nach Neuladen weg
    page.goto(url + '?touch=1'); page.wait_for_timeout(1500); rennen_an(page)
    pruefe('[Touch-Laptop ?touch=1] Knöpfe da', page.evaluate(SICHT) == 'block')
    page.screenshot(path=os.path.join(out31, 'touch_laptop_knoepfe_an.png'))
    page.keyboard.down('ArrowUp'); page.wait_for_timeout(300); page.keyboard.up('ArrowUp'); page.wait_for_timeout(300)
    pruefe('[Touch-Laptop] Tastendruck blendet Knöpfe aus', page.evaluate(SICHT) == 'none' and page.evaluate('Rennspiel.Touch.modus') == 'tastatur')
    pruefe('[Touch-Laptop] localStorage „tastatur“ gemerkt', page.evaluate(SCHL) == 'tastatur', page.evaluate(SCHL))
    pruefe('[Touch-Laptop] Layout wie Desktop (kein touch-an)', page.evaluate("!document.documentElement.classList.contains('touch-an')"))
    page.screenshot(path=os.path.join(out31, 'touch_laptop_nach_taste.png'))
    page.goto(url + '?touch=1'); page.wait_for_timeout(1500)
    # c) Neuladen ohne Parameter: bleibt Tastatur (gemerkt); mit ?touch=1 erzwungen wäre wieder Touch -> daher ohne
    page.goto(url); page.wait_for_timeout(1500); rennen_an(page)
    pruefe('[Touch-Laptop] nach Neuladen weiterhin Tastatur, keine Knöpfe', page.evaluate(SICHT) == 'none' and page.evaluate('Rennspiel.Touch.modus') == 'tastatur')
    # d) Berührung der Knopfzone (untere Hälfte) blendet wieder ein und merkt „touch“
    cdp = ctx.new_cdp_session(page)
    touch_punkte(cdp, 'touchStart', [(1200, 650)]); page.wait_for_timeout(100); touch_punkte(cdp, 'touchEnd', []); page.wait_for_timeout(400)
    pruefe('[Touch-Laptop] Berührung unten blendet Knöpfe wieder ein', page.evaluate(SICHT) == 'block' and page.evaluate('Rennspiel.Touch.modus') == 'touch', page.evaluate('Rennspiel.Touch.modus'))
    pruefe('[Touch-Laptop] localStorage „touch“ gemerkt', page.evaluate(SCHL) == 'touch', page.evaluate(SCHL))
    page.screenshot(path=os.path.join(out31, 'touch_laptop_wieder_touch.png'))
    # e) Berührung im Menü ändert nichts (nur im Rennen, untere Hälfte)
    page.evaluate("localStorage.setItem('rennspiel.eingabe','tastatur')"); page.goto(url); page.wait_for_timeout(1500)
    touch_punkte(cdp, 'touchStart', [(1200, 650)]); page.wait_for_timeout(100); touch_punkte(cdp, 'touchEnd', []); page.wait_for_timeout(300)
    pruefe('[Touch-Laptop] Berührung im Menü schaltet nicht auf Touch', page.evaluate('Rennspiel.Touch.modus') == 'tastatur')
    # f) Pausemenü-Knopf (Esc) + Einstellungen-Knopf
    rennen_an(page); page.keyboard.press('Escape'); page.wait_for_timeout(500)
    pruefe('[Touch-Laptop] Pausemenü hat Knopf „Touch-Steuerung“ (aus)', page.locator('#pause [data-eingabe]').count() == 1 and 'aus' in page.locator('#pause [data-eingabe]').inner_text(), page.locator('#pause [data-eingabe]').inner_text() if page.locator('#pause [data-eingabe]').count() else '')
    page.screenshot(path=os.path.join(out31, 'touch_pause_knopf.png'))
    page.locator('#pause [data-eingabe]').click(); page.wait_for_timeout(300)
    pruefe('[Touch-Laptop] Pausemenü-Knopf schaltet Touch an + merkt', page.evaluate('Rennspiel.Touch.modus') == 'touch' and page.evaluate(SCHL) == 'touch' and page.evaluate('Rennspiel.spiel.pausiert') is True)
    page.locator('#pause [data-a="weiter"]').click(); page.wait_for_timeout(500)
    pruefe('[Touch-Laptop] nach Weiter: Knöpfe da', page.evaluate(SICHT) == 'block')
    page.screenshot(path=os.path.join(out31, 'touch_nach_pauseknopf.png'))
    page.evaluate('Rennspiel.Touch.modusSetzen("tastatur")')
    page.evaluate("Rennspiel.spiel.zumMenue()"); page.wait_for_timeout(500)
    page.evaluate("Rennspiel.spiel.menue.schritt = 4; Rennspiel.spiel.menue.zeichnen && Rennspiel.spiel.menue.zeichnen()"); page.wait_for_timeout(500)
    n = page.locator('#menue [data-eingabe]').count()
    pruefe('[Touch-Laptop] Einstellungen (Menü-Schritt 5) haben Knopf „Touch-Steuerung“', n == 1, n)
    pruefe('[Touch-Laptop] Menü ohne Extra-„🏁 Los!“ in der Leiste (Desktop-Menü)', page.locator('.m-nav [data-a="start"]').count() == 0)
    page.screenshot(path=os.path.join(out31, 'touch_einstellungen_knopf.png'))
    pruefe('[Touch-Laptop] keine JS-Fehler', not fehler, fehler[:3]); ctx.close()
    # g) Desktop ohne Touch: kein Knopf im Pausemenü
    ctx = browser.new_context(viewport={'width': 1280, 'height': 800}); page = ctx.new_page(); page.goto(url); page.wait_for_timeout(1500); rennen_an(page)
    page.keyboard.press('Escape'); page.wait_for_timeout(400)
    pruefe('[Desktop] kein Tipp-Hinweis', page.evaluate("!document.getElementById('t-tipp')"))
    pruefe('[Desktop] Pausemenü ohne Touch-Knopf (unverändert)', page.locator('#pause [data-eingabe]').count() == 0)
    ctx.close()
    # h) Handy (iPhone, pointer: coarse): Touch-Modus auch ohne Tastendruck; synthetische Tasten der Knöpfe schalten NICHT um
    ctx = browser.new_context(**p.devices['iPhone 13 landscape']); page = ctx.new_page(); page.goto(url); page.wait_for_timeout(1500); rennen_an(page)
    pruefe('[iPhone] kein Tipp-Hinweis', page.evaluate("!document.getElementById('t-tipp')"))
    pruefe('[iPhone] Modus touch, Knöpfe da', page.evaluate('Rennspiel.Touch.modus') == 'touch' and page.evaluate(SICHT) == 'block')
    page.evaluate("window.dispatchEvent(new KeyboardEvent('keydown', { code: 'ArrowUp', key: 'ArrowUp', bubbles: true }))"); page.wait_for_timeout(300)
    pruefe('[iPhone] unechte Taste (Skript) schaltet nicht um', page.evaluate('Rennspiel.Touch.modus') == 'touch' and page.evaluate(SCHL) is None)
    ctx.close()
    browser.close()
print(f'\n{sum(ergebnisse)}/{len(ergebnisse)} OK')
sys.exit(0 if all(ergebnisse) else 1)
