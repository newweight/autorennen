#!/usr/bin/env python3
"""Menü-/Modus-Test (Playwright, headless Chromium):
a) Menü-Screenshot (Runde 5b: 5 Streckenkarten inkl. Dino; W4-I: 6 mit Alpen), b) per Tastatur: zu zweit, Strecke, Fahrer (P1 Senna, P2 versucht Senna -> springt weiter), Autos (P1 Porsche, P2 Multivan), Runden 1, Gegner 2, Start
   -> Split-Screen-Screenshot, c) Autopilot für beide, Schnellvorlauf bis 'ergebnis' -> Ergebnis-Screenshot + Prüfung,
e) Runde 4: Welt-Pillen je Strecke, Jahreszeit/Wetter/Wind/Schaden/Gegner(10) im Einstellungen-Schritt, Emojis Emmy 🦁 / Jonas 🐯, Layout ohne Überlauf
d) Titel "Jonas Hot Steering Wheel" im Menü, Fahrernamen in HUD/Meldungen/Ergebnis, KI-Namen aus der Restliste; Enter = Nochmal, Esc = Pause, Weiter, Hauptmenü, keine JS-Fehler, Draw-Calls im Split-Screen < 120.
Aufruf: python3 tests/menu_test.py [ausgabeordner]"""
import sys, os, json
from playwright.sync_api import sync_playwright

basis = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
out = sys.argv[1] if len(sys.argv) > 1 else os.path.join(basis, 'tests', 'out')
os.makedirs(out, exist_ok=True)
url = 'file://' + os.path.join(basis, 'Autorennen.html')
fehler, pruefungen = [], []

def pruefe(name, ok, info=''):
    pruefungen.append({'test': name, 'ok': bool(ok), 'info': info})
    print(('OK   ' if ok else 'FAIL ') + name + (' – ' + str(info) if info != '' else ''))

PIXEL = """(sp) => { const c = document.querySelector('canvas.buehne[data-sp="' + sp + '"]'); if (!c) return null;
  const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0, bunt = new Set();
  for (let i = 3; i < d.length; i += 4) if (d[i] > 20) { n++; if (n % 97 === 0) bunt.add((d[i - 3] >> 4) + ',' + (d[i - 2] >> 4) + ',' + (d[i - 1] >> 4)); }
  return { w: c.width, h: c.height, anteil: n / (d.length / 4), farben: bunt.size }; }"""
IMPASSEND = """(() => { const m = document.querySelector('.m-inhalt'), b = (s) => Array.from(document.querySelectorAll(s)).map(e => e.getBoundingClientRect());
  const alle = b('canvas.buehne').concat(b('.karte.auto'));
  return { scroll: m.scrollHeight <= m.clientHeight + 1, innen: alle.every(r => r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight),
           fuss: Math.max(...alle.map(r => r.bottom)) <= document.querySelector('.m-fuss').getBoundingClientRect().top + 2, n: alle.length }; })()"""

with sync_playwright() as p:
    browser = p.chromium.launch(args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
    page = browser.new_page(viewport={'width': 1280, 'height': 800})
    page.set_default_timeout(120000)   # v29: bei Last (parallele Tests, SwiftShader) braucht der Menühintergrund länger als 30 s
    page.on('pageerror', lambda e: fehler.append(str(e)))
    page.on('console', lambda m: fehler.append('console.error: ' + m.text) if m.type == 'error' else None)
    page.goto(url)
    page.wait_for_function('window.Rennspiel && Rennspiel.spiel', timeout=90000)
    page.wait_for_timeout(1500)
    zustand = lambda: page.evaluate('Rennspiel.spiel.zustand')
    taste = lambda t, n=1: [page.keyboard.press(t) or page.wait_for_timeout(60) for _ in range(n)]
    snap = lambda name: page.screenshot(path=os.path.join(out, name))

    def auto_schritt(label, spieler, dreh, shot):
        """3D-Autowahl prüfen: Bühnen, Kachelbilder, Drehen per Taste und Maus."""
        AV = 'Rennspiel.AutoVorschau'
        pruefe(f'{label}: Vorschau läuft, {len(spieler)} Bühne(n) sichtbar', page.evaluate(AV + '.laeuft') and
               all(page.is_visible(f'canvas.buehne[data-sp="{sp}"]') for sp in spieler) and
               page.evaluate("document.querySelectorAll('canvas.buehne').length") == len(spieler))
        page.wait_for_timeout(600)
        for sp in spieler:
            px = page.evaluate(PIXEL, sp)
            pruefe(f'{label}: Bühne {sp + 1} nicht leer', px and px['anteil'] > 0.03 and px['farben'] >= 4, px)
        bilder = page.evaluate("Array.from(document.querySelectorAll('.karte.auto img')).map(i => i.src.length)")
        n_auto = len(page.evaluate('Rennspiel.carCatalog.waehlbare()'))
        pruefe(f'{label}: Kachelbilder (dataURL > 1000) für alle {n_auto} Autos je Spieler', len(bilder) == n_auto * len(spieler) and min(bilder) > 1000, bilder)
        pruefe(f'{label}: Bühne zeigt gewähltes Auto', all(page.evaluate(f'{AV}.autoId({sp})') == page.evaluate(f'Rennspiel.spiel.einstellungen.autoIds[{sp}]') for sp in spieler))
        r = page.evaluate(IMPASSEND)
        pruefe(f'{label}: passt ohne Scrollen, nichts abgeschnitten', r['scroll'] and r['innen'] and r['fuss'], r)
        snap(shot)
        # Drehen per Taste (je 90° weich; die Eigendrehung liefert in 0,8 s nur ~20°)
        for sp, (links, rechts) in zip(spieler, dreh):
            w0 = page.evaluate(f'{AV}.winkel({sp})'); taste(rechts); page.wait_for_timeout(1500)
            w1 = page.evaluate(f'{AV}.winkel({sp})'); taste(links); page.wait_for_timeout(1500)
            w2 = page.evaluate(f'{AV}.winkel({sp})')
            pruefe(f'{label}: Spieler {sp + 1} dreht mit {rechts}/{links} um 90°', w1 - w0 < -25 and w2 - w1 > 25, [round(w0), round(w1), round(w2)])
        # Pfeiltasten bewegen den Fokus, drehen NICHT
        w0 = page.evaluate(f'{AV}.winkel(0)'); a0 = page.evaluate('Rennspiel.spiel.einstellungen.autoIds[0]')
        page.wait_for_timeout(500)
        taste('ArrowRight' if False else 'ArrowLeft'); page.wait_for_timeout(500)
        w1 = page.evaluate(f'{AV}.winkel(0)')
        pruefe(f'{label}: Pfeiltaste wechselt Auto, dreht nicht extra', page.evaluate('Rennspiel.spiel.einstellungen.autoIds[0]') != a0 and abs(w1 - w0) < 40, [round(w0), round(w1)])
        pruefe(f'{label}: Bühne zeigt nach Wechsel neues Auto', page.evaluate(f'{AV}.autoId(0)') == page.evaluate('Rennspiel.spiel.einstellungen.autoIds[0]'))
        # Mausziehen
        box = page.locator('canvas.buehne[data-sp="0"]').bounding_box()
        cx, cy = box['x'] + box['width'] / 2, box['y'] + box['height'] / 2
        w0 = page.evaluate(f'{AV}.winkel(0)')
        page.mouse.move(cx, cy); page.mouse.down(); page.mouse.move(cx + 60, cy, steps=6); page.mouse.move(cx + 120, cy, steps=6)
        w1 = page.evaluate(f'{AV}.winkel(0)'); page.mouse.up()
        pruefe(f'{label}: Maus-Ziehen dreht (120 px nach rechts)', w1 - w0 < -40, [round(w0), round(w1)])
        px = page.evaluate(PIXEL, 0)
        pruefe(f'{label}: Bühne nach Drehen weiter gefüllt', px and px['anteil'] > 0.03, px)

    def vorschau_stoppt(label):
        f0 = page.evaluate('Rennspiel.AutoVorschau.debug.frames'); page.wait_for_timeout(500)
        f1 = page.evaluate('Rennspiel.AutoVorschau.debug.frames')
        pruefe(f'{label}: Vorschau-Loop stoppt außerhalb des Auto-Schritts', f1 == f0 and not page.evaluate('Rennspiel.AutoVorschau.laeuft'), [f0, f1])
    # a) Menü
    pruefe('Start im Menü', zustand() == 'menue')
    titel = page.evaluate("document.querySelector('.m-titel').textContent")
    pruefe('Titel im Menü sichtbar', 'Jonas Hot Steering Wheel' in titel and page.is_visible('.m-titel')
           and 'autorennen' in page.inner_text('.m-untertitel').lower(), titel)
    pruefe('Seitentitel (title)', page.title() == 'Jonas Hot Steering Wheel', page.title())
    br = page.evaluate("(() => { const r = document.querySelector('.m-titel').getBoundingClientRect(); return [r.left, r.right, innerWidth]; })()")
    pruefe('Titel passt in die Breite', br[0] >= 0 and br[1] <= br[2], br)
    snap('menu_1_modus.png')
    # Runde 6 (W3-G): Garage-Karte im Modus-Schritt, Klick öffnet die Garage, Esc schließt sie wieder
    pruefe('W3-G: Garage-Karte im Modus-Schritt sichtbar', page.is_visible('[data-a="garage"]') and 'Garage' in page.inner_text('[data-a="garage"]'))
    page.click('[data-a="garage"]'); page.wait_for_timeout(300)
    offen = page.is_visible('#garage') and not page.is_visible('#menue')
    taste('Escape'); page.wait_for_timeout(200)
    pruefe('W3-G: Klick öffnet Garage, Esc zurück ins Menü (Modus-Schritt)', offen and page.is_visible('#menue') and not page.is_visible('#garage')
           and page.evaluate('Rennspiel.spiel.menue.schritt') == 0)
    r = page.evaluate("""(() => { const m = document.querySelector('.m-inhalt'), k = document.querySelector('[data-a="garage"]').getBoundingClientRect();
      return { scroll: m.scrollHeight <= m.clientHeight + 1, innen: k.bottom <= document.querySelector('.m-fuss').getBoundingClientRect().top }; })()""")
    pruefe('W3-G: Modus-Schritt mit Garage-Karte passt ohne Scrollen', r['scroll'] and r['innen'], r)
    # Runde 6 (W3-F): 4 Modus-Karten (Allein, Zu zweit, Pokal, Letzter fliegt raus) im Bild, ohne Überlappung – 1280×800 und 1440×900
    MODUS4 = """(() => { const k = Array.from(document.querySelectorAll('.karte.modus-karte')), r = k.map(e => e.getBoundingClientRect()),
      fuss = document.querySelector('.m-fuss').getBoundingClientRect().top;
      return { ids: k.map(e => e.dataset.a), innen: r.every(a => a.left >= 0 && a.right <= innerWidth && a.top >= 0 && a.bottom <= fuss + 2),
        frei: r.every((a, i) => r.every((b, j) => i === j || a.right <= b.left + 1 || b.right <= a.left + 1 || a.bottom <= b.top + 1 || b.bottom <= a.top + 1)),
        textUeber: k.some(e => e.scrollHeight > e.clientHeight + 2) }; })()"""
    for vw, vh in ((1280, 800), (1440, 900)):
        page.set_viewport_size({'width': vw, 'height': vh}); page.wait_for_timeout(300)
        m4 = page.evaluate(MODUS4)
        pruefe(f'W3-F: 4 Modus-Karten {vw}×{vh} im Bild, ohne Überlappung', m4['ids'] == ['modus:solo', 'modus:zwei', 'modus:pokal', 'modus:elimination']
               and m4['innen'] and m4['frei'] and not m4['textUeber'], m4)
    page.set_viewport_size({'width': 1280, 'height': 800}); page.wait_for_timeout(300)
    # W5: 5. Karte „🌐 Online“ – von der Festplatte (file://) ausgegraut mit Hinweis, Pfeiltasten wandern darüber, Enter tut nichts
    ON = """(() => { const k = document.querySelector('.karte.online-karte'); if (!k) return null; const r = k.getBoundingClientRect(), m = document.querySelector('.m-inhalt');
      return { aus: k.classList.contains('aus'), text: k.textContent, gew: k.classList.contains('gewaehlt'), scroll: m.scrollHeight <= m.clientHeight + 1,
        innen: r.left >= 0 && r.right <= innerWidth && r.bottom <= document.querySelector('.m-fuss').getBoundingClientRect().top + 2 }; })()"""
    for vw, vh in ((1280, 800), (1440, 900)):
        page.set_viewport_size({'width': vw, 'height': vh}); page.wait_for_timeout(300)
        o = page.evaluate(ON)
        pruefe(f'W5: Online-Karte {vw}×{vh} von file:// ausgegraut mit Hinweis „Mehrspieler starten“, Modus-Schritt ohne Scrollen',
               o is not None and o['aus'] and 'Mehrspieler starten' in o['text'] and o['scroll'] and o['innen'], o)
    page.set_viewport_size({'width': 1280, 'height': 800}); page.wait_for_timeout(300)
    taste('ArrowRight', 4)
    o = page.evaluate(ON)
    pruefe('W5: Pfeiltasten → nach „Letzter fliegt raus“ die Online-Karte (gewählt, nur ein Cursor)', o['gew'] and page.evaluate('Rennspiel.spiel.menue.onlineGewaehlt')
           and page.evaluate("document.querySelectorAll('.karte.gewaehlt').length") == 1, o)
    snap('menu_1c_modus_online_aus.png')
    taste('Enter'); page.wait_for_timeout(200)
    pruefe('W5: Enter auf der ausgegrauten Online-Karte bleibt im Modus-Schritt (kein Online-Bildschirm)',
           page.evaluate('Rennspiel.spiel.menue.schritt') == 0 and page.is_visible('#menue') and not page.is_visible('#online'))
    taste('ArrowRight')
    pruefe('W5: → von der Online-Karte springt zurück auf „Allein“ (Modus solo, Spielart Rennen)', not page.evaluate('Rennspiel.spiel.menue.onlineGewaehlt') and
           page.evaluate("document.querySelector('[data-a=\"modus:solo\"]').classList.contains('gewaehlt')") and
           page.evaluate("[Rennspiel.spiel.einstellungen.modus, Rennspiel.spiel.einstellungen.spielart].join()") == 'solo,rennen')
    # b) Tastatur: Modus zu zweit
    taste('ArrowRight'); snap('menu_1b_modus_zwei.png')
    pruefe('Modus zu zweit', page.evaluate('Rennspiel.spiel.einstellungen.modus') == 'zwei')
    taste('Enter'); page.wait_for_timeout(200); snap('menu_2_strecke.png')
    karten = page.evaluate("Array.from(document.querySelectorAll('.karte.strecke')).map(k => k.dataset.a)")
    pruefe('Streckenwahl: 8 Karten (Wiese, Wald, Wüste, Fantasie, Dino, Alpen, Formel 1, Megastrecke)', karten == ['strecke:wiese', 'strecke:wald', 'strecke:wueste', 'strecke:fantasie', 'strecke:dino', 'strecke:alpen', 'strecke:formel1', 'strecke:mega'], karten)
    # 6 Karten (W4-I: + Alpen) in EINER Reihe (gleiches offsetTop), im Bild, ohne Überlappung – bei 1280×800 und 1440×900
    LAGE = """(() => { const k = Array.from(document.querySelectorAll('.karte.strecke')), r = k.map(e => e.getBoundingClientRect());
      return { gleicheReihe: new Set(k.map(e => e.offsetTop)).size === 1,
        ok: r.every(a => a.left >= 0 && a.right <= innerWidth && a.bottom <= innerHeight) &&
        r.every((a, i) => r.every((b, j) => i === j || a.right <= b.left + 1 || b.right <= a.left + 1)),
        pillen: k.map(e => !!e.querySelector('.s-pille')), pilleText: k.map(e => e.querySelector('.s-pille') && e.querySelector('.s-pille').textContent),
        hinweis: (k[3].querySelector('.strecken-hinweis') || {}).textContent || '',
        farbe3: getComputedStyle(k[3]).backgroundColor, farbe0: getComputedStyle(k[0]).backgroundColor,
        farbe4: getComputedStyle(k[4]).backgroundColor, bild4: getComputedStyle(k[4].querySelector('.strecken-bild')).backgroundImage,
        textUeber: k.some(e => e.scrollHeight > e.clientHeight + 2),
        scroll: document.querySelector('.m-inhalt').scrollHeight <= document.querySelector('.m-inhalt').clientHeight + 1,
        breiten: r.map(a => Math.round(a.width)) }; })()"""
    for vw, vh in ((1280, 800), (1440, 900)):
        page.set_viewport_size({'width': vw, 'height': vh}); page.wait_for_timeout(400)
        lage = page.evaluate(LAGE)
        pruefe(f'Streckenwahl {vw}×{vh}: 8 Karten in einer Reihe (gleiches offsetTop), im Bild, ohne Überlappung', lage['gleicheReihe'] and lage['ok'] and lage['scroll'] and not lage['textUeber'], lage)
        snap(f'menu_2_strecke_{vw}.png')
    pruefe('Streckenkarten: Schwierigkeits-Pillen leicht/mittel/schnell/spaß/mittel/mittel/schnell/spaß (Formel 1, Mega)', lage['pilleText'] == ['leicht', 'mittel', 'schnell', 'spaß', 'mittel', 'mittel', 'schnell', 'spaß'], lage['pilleText'])
    pruefe('Dino-Karte: eigene Farbe (Rahmen/Hintergrund) + Vulkan-Himmel im Bild', lage['farbe4'] != lage['farbe0'] and '242, 179, 106' in lage['bild4'], [lage['farbe4'], lage['bild4'][:80]])
    pruefe('Fantasie-Karte: eigene Farbe + Hinweis 2 Loopings, Bälle, Wasserstrahl', lage['farbe3'] != lage['farbe0'] and '2 Loopings' in lage['hinweis'] and 'Bälle' in lage['hinweis'] and 'Wasserstrahl' in lage['hinweis'], [lage['farbe3'], lage['hinweis']])
    page.set_viewport_size({'width': 1280, 'height': 800}); page.wait_for_timeout(300)
    # Durchblättern: Menü-Hintergrund baut jede Strecke auf (Deko/Thema ohne Fehler)
    for _ in range(2): taste('ArrowRight'); page.wait_for_timeout(400)
    pruefe('Streckenwahl: Wüste per Pfeiltaste', page.evaluate('Rennspiel.spiel.einstellungen.streckeId') == 'wueste')
    snap('menu_2b_strecke_wueste.png')
    taste('ArrowRight'); page.wait_for_timeout(600)
    pruefe('Streckenwahl: Fantasie per Pfeiltaste (Menü-Hintergrund mit Loopings)', page.evaluate('Rennspiel.spiel.einstellungen.streckeId') == 'fantasie' and
           page.evaluate('(() => { let n = 0; Rennspiel.spiel.szene.traverse(o => { if (o.name === "LoopingBand") n++; }); return n; })()') == 1)
    snap('menu_2c_strecke_fantasie.png')
    taste('ArrowRight'); page.wait_for_timeout(800)
    pruefe('Streckenwahl: Dino per Pfeiltaste (Menü-Hintergrund mit Vulkan + Deko-Dinos)', page.evaluate('Rennspiel.spiel.einstellungen.streckeId') == 'dino' and
           page.evaluate('(() => { let v = 0, d = 0; Rennspiel.spiel.szene.traverse(o => { if (o.name === "Vulkan") v++; if (o.name === "Dinos") d += o.count; }); return v === 1 && d >= 6; })()'))
    snap('menu_2d_strecke_dino.png')
    for _ in range(4): taste('ArrowLeft'); page.wait_for_timeout(300)
    taste('Enter'); page.wait_for_timeout(200)
    # Fahrer: Standard P1 Jonas, P2 Emmy; P1 wählt Senna, P2 läuft mit WASD auf Senna zu und wird übersprungen
    fe = lambda: page.evaluate('Rennspiel.spiel.einstellungen.fahrer')
    pruefe('Fahrer-Schritt aktiv (5 Schritte im Kopf)', page.evaluate("document.querySelector('.m-schritt.aktiv').textContent.includes('Fahrer')")
           and page.evaluate("document.querySelectorAll('.m-schritt').length") == 5)
    pruefe('Standard-Fahrer: Spieler 1 Jonas, Spieler 2 Emmy', fe() == ['Jonas', 'Emmy'], fe())
    karten_f = page.evaluate("document.querySelectorAll('.karte.fahrer').length")
    pruefe('Fahrer-Schritt: 2 × 12 Karten', karten_f == 24, karten_f)
    namen_f = [f['name'] for f in page.evaluate('Rennspiel.config.fahrer')]
    i = 0
    while fe()[0] != 'Senna' and i < 20: taste('ArrowRight'); i += 1
    pruefe('P1 wählt Senna (Pfeiltasten)', fe()[0] == 'Senna', fe())
    i = 0
    while fe()[1] != 'Schumacher' and i < 20: taste('KeyD'); i += 1
    taste('KeyD')      # nächster wäre Senna – gehört P1
    pruefe('P2 versucht Senna -> wird auf anderen gesetzt', fe()[1] not in ('Senna', 'Schumacher') and fe()[1] in namen_f, fe())
    pruefe('P2 sprang auf Verstappen', fe() == ['Senna', 'Verstappen'], fe())
    # Zurück-Richtung und senkrecht (3 Spalten): nie derselbe Fahrer
    ok = True
    for t in ['KeyA', 'KeyA', 'KeyS', 'KeyW', 'KeyW', 'KeyD', 'KeyD', 'KeyS', 'KeyS', 'KeyS', 'KeyA']:
        taste(t); ok = ok and fe()[0] != fe()[1]
    for t in ['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowLeft', 'ArrowUp', 'ArrowRight']:
        taste(t); ok = ok and fe()[0] != fe()[1]
    pruefe('Nie zwei gleiche Fahrer (Tasten-Marathon)', ok, fe())
    # zurück auf P1 Senna, P2 Verstappen
    while fe()[0] != 'Senna': taste('ArrowRight')
    while fe()[1] != 'Verstappen': taste('KeyD')
    snap('menu_3a_fahrer_zwei.png')
    pruefe('Fahrer-Raster überlappt nicht', page.evaluate('''(() => { const r = Array.from(document.querySelectorAll('.karte.fahrer')).map(k => k.getBoundingClientRect());
      for (let i = 0; i < r.length; i++) for (let j = i + 1; j < r.length; j++) { const a = r[i], b = r[j];
        if (a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1) return false; }
      return r.every(a => a.left >= 0 && a.right <= innerWidth && a.top >= 0 && a.bottom <= innerHeight); })()'''))
    taste('Enter'); page.wait_for_timeout(200)
    # Autos: P1 (Pfeile) auf Porsche (Index 3), P2 (WASD) auf Multivan (Index 1)
    ids = page.evaluate('Rennspiel.carCatalog.waehlbare().map(a => a.id)')
    def cursor(sp): return ids.index(page.evaluate(f'Rennspiel.spiel.einstellungen.autoIds[{sp}]'))
    while cursor(0) != ids.index('porsche-911'): taste('ArrowRight')
    while cursor(1) != ids.index('multivan'): taste('KeyD' if cursor(1) < ids.index('multivan') else 'KeyA')
    # P1 und P2 unabhängig bewegen
    snap('menu_3_autos_zwei.png')
    pruefe('Autos P1 Porsche, P2 Multivan', page.evaluate('Rennspiel.spiel.einstellungen.autoIds').__eq__(['porsche-911', 'multivan']))
    auto_schritt('Auto zwei', [0, 1], [('Comma', 'Period'), ('KeyQ', 'KeyE')], 'menu_3b_autos_zwei_3d.png')
    # Fenster 1440×900: ebenfalls ohne Scrollen
    page.set_viewport_size({'width': 1440, 'height': 900}); page.wait_for_timeout(500)
    rr = page.evaluate(IMPASSEND)
    pruefe('Auto zwei 1440×900: passt ohne Scrollen', rr['scroll'] and rr['innen'] and rr['fuss'], rr)
    snap('menu_3c_autos_zwei_1440.png')
    page.set_viewport_size({'width': 1280, 'height': 800}); page.wait_for_timeout(500)
    # Zurück auf die gewünschten Autos (P1 Porsche, P2 Multivan)
    while cursor(0) != ids.index('porsche-911'): taste('ArrowRight')
    while cursor(1) != ids.index('multivan'): taste('KeyD' if cursor(1) < ids.index('multivan') else 'KeyA')
    taste('Enter'); page.wait_for_timeout(200)
    vorschau_stoppt('Auto zwei')
    # Einstellungen: Runden auf 1 (Zeile 0), Gegner auf 2 (Zeile 1)
    taste('ArrowLeft', 12)
    taste('ArrowDown'); taste('ArrowLeft', 6)
    gegner = page.evaluate('Rennspiel.spiel.einstellungen.gegner')
    while gegner > 2: taste('ArrowLeft'); gegner -= 1
    while gegner < 2: taste('ArrowRight'); gegner += 1
    e = page.evaluate('Rennspiel.spiel.einstellungen')
    pruefe('Runden 1, Gegner 2', e['runden'] == 1 and e['gegner'] == 2, e)
    taste('ArrowDown'); taste('ArrowRight')   # Schwierigkeit
    snap('menu_4_einstellungen.png')
    # Start: bis zur Start-Zeile mit Enter, dann Enter
    for _ in range(24):
        if zustand() != 'menue': break
        taste('Enter'); page.wait_for_timeout(100)
    try:
        page.wait_for_function('Rennspiel.spiel.zustand === "rennen"', timeout=120000)
    except Exception:
        print('DIAG Start hängt:', page.evaluate('({z: Rennspiel.spiel.zustand, schritt: Rennspiel.spiel.menue && Rennspiel.spiel.menue.schritt, fokus: Rennspiel.spiel.menue && Rennspiel.spiel.menue.fokus, fehler: Rennspiel.spiel._fehler && Rennspiel.spiel._fehler.gesamt})'), flush=True); raise
    pruefe('Rennen gestartet (zwei Spieler + 2 Computer)', page.evaluate('Rennspiel.spiel.fahrzeuge.length') == 4)
    hudnamen = page.evaluate("Array.from(document.querySelectorAll('.hud-name')).map(e => e.textContent)")
    pruefe('HUD-Kopf zeigt Fahrernamen', len(hudnamen) == 2 and 'Senna' in hudnamen[0] and 'Verstappen' in hudnamen[1], hudnamen)
    page.wait_for_timeout(1500)
    snap('menu_5_splitscreen_countdown.png')
    page.keyboard.down('ArrowUp'); page.keyboard.down('KeyW')
    page.wait_for_function('Rennspiel.spiel.rennen.zustand === "laeuft"', timeout=120000)
    page.wait_for_timeout(2500)
    snap('menu_6_splitscreen_fahrt.png')
    page.keyboard.up('ArrowUp'); page.keyboard.up('KeyW')
    info = page.evaluate('''(() => { const s = Rennspiel.spiel; return { kameras: s.kameras.length, huds: s.huds.length,
      aspect: s.kameras.map(k => +k.kamera.aspect.toFixed(2)), fov: s.kameras.map(k => k.kamera.fov),
      calls: s.renderer.info.render.calls, dreiecke: s.renderer.info.render.triangles,
      namen: s.rennen.teilnehmer.map(t => t.name), spielerNr: s.fahrzeuge.map(f => f.spielerNr) }; })()''')
    pruefe('Split-Screen: 2 Kameras, 2 HUDs', info['kameras'] == 2 and info['huds'] == 2, info)
    pruefe('KI-Namen aus der Restliste (Schumacher, Röhrl; nicht Senna/Verstappen)',
           info['namen'] == ['Senna', 'Verstappen', 'Schumacher', 'Röhrl'], info['namen'])
    # Schwelle 120 (vorher 80): Deko-Instanzen sind seit Runde 2 in bis zu 3×3 Regionen geteilt (config.grafik.dekoZellen),
    # damit jede Kamera nur sichtbare Stücke zeichnet. Das kostet ein paar Draw-Calls mehr, spart aber Dreiecke;
    # ~100 Draw-Calls sind für die M1-GPU unkritisch (CPU-Anteil ≪ 1 ms).
    pruefe('Draw-Calls im Split-Screen < 160', info['calls'] < 160, info['calls'])   # v31: 2 Rückspiegel (je 4. Bild) → 142 statt ~110
    # Einmal ALLES zeichnen (Culling kurz aus), damit auch noch nie sichtbare Geometrien hochgeladen sind:
    # Auto-Geometrien liegen absichtlich dauerhaft im Katalog-Cache. Seit Deko/Autos je Kamera gecullt werden,
    # würden Autos, die erst im Ergebnis ins Bild kommen, sonst fälschlich als "Leck" zählen.
    page.evaluate('''(() => { const s = Rennspiel.spiel, alt = [];
      s.szene.traverse(o => { alt.push([o, o.frustumCulled]); o.frustumCulled = false; });
      s.zeichnen(); alt.forEach(([o, c]) => { o.frustumCulled = c; }); })()''')
    speicher0 = page.evaluate('(() => { const m = Rennspiel.spiel.renderer.info.memory; return [m.geometries, m.textures]; })()')

    # c) Autopilot beide, Vorlauf bis Ergebnis
    page.evaluate('Rennspiel.spiel.autopilot(0, true); Rennspiel.spiel.autopilot(1, true)')
    gespielt = 0
    while gespielt < 400 and zustand() == 'rennen':
        page.evaluate('Rennspiel.spiel.schnellvorlauf(20)'); gespielt += 20
    pruefe('Zustand ergebnis erreicht', zustand() == 'ergebnis', f'{gespielt} s')
    page.wait_for_timeout(2500)
    snap('menu_7_ergebnis.png')
    zeilen = page.evaluate('''Array.from(document.querySelectorAll('#ergebnis tbody tr')).map(tr => Array.from(tr.children).map(td => td.textContent.trim()))''')
    print(json.dumps(zeilen, ensure_ascii=False))
    pruefe('Ergebnis: 4 Zeilen', len(zeilen) == 4, len(zeilen))
    namen = [z[1].replace('⭐', '').strip() for z in zeilen]   # Runde 6: Sterne stehen hinter dem Namen
    pruefe('Ergebnis: Fahrernamen statt Spieler 1/2, KI als "🤖 Name"',
           'Senna' in namen and 'Verstappen' in namen and '🤖 Schumacher' in namen and '🤖 Röhrl' in namen
           and not any('Spieler' in n or 'Computer' in n for n in namen), namen)
    pruefe('Ergebnis: Auto-Spalte gefüllt', all(z[2] for z in zeilen), [z[2] for z in zeilen])
    def sek(t):
        try: m, s = t.split(':'); return int(m) * 60 + float(s)
        except Exception: return 0
    spieler_zeilen = [z for z in zeilen if z[1] in ('Senna', 'Verstappen')]
    pruefe('Ergebnis: Zeiten der Spieler > 0', all(sek(z[3]) > 0 and sek(z[4]) > 0 for z in spieler_zeilen), spieler_zeilen)
    plaetze = [z[0] for z in zeilen]
    pruefe('Ergebnis: Plätze 1.–4.', plaetze == ['1.', '2.', '3.', '4.'], plaetze)
    # Polierrunde W3: Spalte „🪙 Preisgeld" – Spieler Platz 1/2/3 = 30/20/15, sonst 5; KI „–"
    import re as _re
    kopf = page.evaluate("Array.from(document.querySelectorAll('#ergebnis thead th')).map(t => t.textContent.trim())")
    pruefe('Ergebnis: Spalte „🪙 Preisgeld" im Kopf', bool(kopf) and kopf[-1] == '🪙 Preisgeld' and len(kopf) == 6, kopf)
    sp_z = [z for z in zeilen if not z[1].startswith('🤖')]   # Name-Zelle enthält Sterne → nicht per Gleichheit filtern
    pruefe('Ergebnis: 2 Spieler-Zeilen', len(sp_z) == 2, len(sp_z))
    erwartet = {'1.': 30, '2.': 20, '3.': 15}
    def geld(z):
        m = _re.match(r'\+(\d+) 🪙', z[5]); return int(m.group(1)) if m else None
    pruefe('Ergebnis: Preisgeld je Spieler passend zum Platz', all(geld(z) == erwartet.get(z[0], 5) for z in sp_z), [(z[0], z[5]) for z in sp_z])
    pruefe('Ergebnis: KI-Zeilen zeigen „–" beim Preisgeld', all(z[5] == '–' for z in zeilen if z[1].startswith('🤖')), [z[5] for z in zeilen])
    # Runde 6 (D3): Sterne – Spieler 1–3 ⭐ (Platz 1 = 3, Platz 2–3 = 2 oder beste Runde unter Zielzeit), KI keine
    stern = lambda z: z[1].count('⭐')
    pruefe('Ergebnis: Sterne – jeder Spieler 1–3 ⭐, KI keine', all(1 <= stern(z) <= 3 for z in spieler_zeilen) and all(stern(z) == 0 for z in zeilen if z[1].startswith('🤖')), [stern(z) for z in zeilen])
    pruefe('Ergebnis: Sieger-Spieler (Platz 1) hat 3 ⭐, Platz 2–3 mindestens 2 ⭐', all((stern(z) == 3) if z[0] == '1.' else (stern(z) >= 2 if z[0] in ('2.', '3.') else True) for z in spieler_zeilen), [(z[0], stern(z)) for z in spieler_zeilen])
    sg = page.evaluate("JSON.parse(localStorage.getItem('rennspiel.sterne.v1') || '{}')")
    pruefe('Sterne in localStorage rennspiel.sterne.v1 (Senna, Verstappen) = Summe der Sterne', sg.get('Senna') == stern([z for z in zeilen if z[1].startswith('Senna')][0]) and sg.get('Verstappen') == stern([z for z in zeilen if z[1].startswith('Verstappen')][0]), sg)
    # eingefroren: weiter fahren ändert die Tabelle nicht
    page.evaluate('Rennspiel.spiel.schnellvorlauf(30)')
    zeilen2 = page.evaluate('''Array.from(document.querySelectorAll('#ergebnis tbody tr')).map(tr => Array.from(tr.children).map(td => td.textContent.trim()))''')
    pruefe('Ergebnis eingefroren', zeilen == zeilen2)

    # d) Enter = Nochmal
    taste('Enter')
    page.wait_for_function('Rennspiel.spiel.zustand === "rennen"', timeout=60000)
    page.wait_for_timeout(1200)
    cd = page.evaluate('Rennspiel.spiel.rennen.zustand')
    pruefe('Nochmal: neues Rennen mit Countdown', cd == 'countdown', cd)
    speicher1 = page.evaluate('(() => { const m = Rennspiel.spiel.renderer.info.memory; return [m.geometries, m.textures]; })()')
    pruefe('Aufräumen: Geometrien/Texturen wachsen nicht', speicher1[0] <= speicher0[0] + 2 and speicher1[1] <= speicher0[1] + 1, [speicher0, speicher1])
    snap('menu_8_nochmal_countdown.png')
    page.wait_for_function('Rennspiel.spiel.rennen.zustand === "laeuft"', timeout=120000)
    # Pause
    page.wait_for_timeout(1500)
    taste('Escape'); page.wait_for_timeout(300)
    z1 = page.evaluate('Rennspiel.spiel.rennen.zeit')
    page.wait_for_timeout(700)
    z2 = page.evaluate('Rennspiel.spiel.rennen.zeit')
    pruefe('Pause: Physik steht', page.evaluate('Rennspiel.spiel.pausiert') and abs(z2 - z1) < 1e-6 and z1 > 0, [z1, z2])
    snap('menu_9_pause.png')
    taste('Escape'); page.wait_for_timeout(500)
    z3 = page.evaluate('Rennspiel.spiel.rennen.zeit')
    pruefe('Esc beendet Pause', not page.evaluate('Rennspiel.spiel.pausiert') and z3 > z2, [z2, z3])
    taste('Escape'); page.wait_for_timeout(200)
    page.click('#pause [data-a="weiter"]'); page.wait_for_timeout(200)
    pruefe('Weiter-Knopf (Maus)', not page.evaluate('Rennspiel.spiel.pausiert'))
    taste('Escape'); page.wait_for_timeout(200)
    page.click('#pause [data-a="menue"]'); page.wait_for_timeout(500)
    pruefe('Hauptmenü aus Pause', zustand() == 'menue')
    snap('menu_10_zurueck_im_menue.png')

    # ---------- Runde 4: Welt, Jahreszeit, Wetter, Wind, Schaden, Gegner, Emojis ----------
    E = lambda: page.evaluate('Rennspiel.spiel.einstellungen')
    texte = lambda sel: page.evaluate("(s) => Array.from(document.querySelectorAll(s)).map(e => e.textContent.trim())", sel)
    page.click('[data-a="modus:solo"]'); page.wait_for_timeout(150)
    page.click('[data-a="strecke:wiese"]'); page.wait_for_timeout(300)
    w = texte('.m-welt .pille')
    pruefe('Welt-Pillen Wiese: 5 (Klassisch, Hindernisse, Stunt, Verrückt, Alles)', len(w) == 5 and 'Klassisch' in w[0] and 'Verrückt' in w[3] and 'Alles' in w[4] and '🎪' in w[4], w)
    pruefe('Welt Standard: Klassisch aktiv, Standard-Marke, Name in der Erklärung', 'Klassisch' in texte('.m-welt .pille.aktiv')[0] and 'Standard' in w[0]
           and 'Klassisch' in texte('.m-welt .welt-text')[0] and E()['welt'] == '', [texte('.m-welt .welt-text'), E()['welt']])
    page.click('[data-a="welt:stunt"]'); page.wait_for_timeout(300)
    pruefe('Welt Stunt: gespeichert + Erklärung', E()['welt'] == 'stunt' and 'Sprungschanzen' in texte('.m-welt .welt-text')[0], E()['welt'])
    snap('menu_r4_strecke_welt.png')
    page.click('[data-a="welt:klassisch"]'); page.wait_for_timeout(100)
    pruefe('Standard-Welt anklicken -> welt "" (Standard)', E()['welt'] == '', E()['welt'])
    taste('ArrowDown'); taste('ArrowDown')
    pruefe('Taste ↓ schaltet die Welt weiter (Klassisch -> Hindernisse -> Stunt)', E()['welt'] == 'stunt', E()['welt'])
    taste('ArrowDown'); taste('ArrowUp'); taste('ArrowUp'); taste('ArrowUp')
    pruefe('Taste ↑ schaltet zurück (… -> Klassisch = Standard)', E()['welt'] == '', E()['welt'])
    page.click('[data-a="welt:stunt"]')
    taste('ArrowRight'); page.wait_for_timeout(200)
    pruefe('Streckenwechsel setzt Welt auf Standard zurück', E()['streckeId'] == 'wald' and E()['welt'] == '', E())
    page.click('[data-a="welt:verrueckt"]'); page.click('[data-a="strecke:fantasie"]'); page.wait_for_timeout(300)
    w = texte('.m-welt .pille')
    pruefe('Welt-Pillen Fantasie: 3 (Fantasie Standard, Verrückt, Alles), Welt zurückgesetzt', len(w) == 3 and 'Fantasie' in w[0] and 'Verrückt' in w[1] and 'Alles' in w[2] and E()['welt'] == '', [w, E()['welt']])
    snap('menu_r4_strecke_fantasie_welt.png')
    for vw, vh in ((1280, 800), (1440, 900)):
        page.set_viewport_size({'width': vw, 'height': vh}); page.wait_for_timeout(300)
        l = page.evaluate("""(() => { const m = document.querySelector('.m-inhalt'), r = document.querySelector('.m-welt').getBoundingClientRect();
          return { scroll: m.scrollHeight <= m.clientHeight + 1, ok: r.left >= 0 && r.right <= innerWidth && r.bottom <= document.querySelector('.m-fuss').getBoundingClientRect().top }; })()""")
        pruefe(f'Strecke+Welt {vw}×{vh}: ohne Scrollen, Welt-Zeile im Bild', l['scroll'] and l['ok'], l)
    page.set_viewport_size({'width': 1280, 'height': 800}); page.wait_for_timeout(300)
    # ---------- Runde 6 (W2-E): Zeile „Variante“ (Normal / XL) nur bei Wüste und Fantasie ----------
    va = lambda: texte('.m-variante .pille')
    pruefe('Variante Fantasie: Zeile da, Pillen Normal + XL, Standard Normal', len(va()) == 2 and 'Normal' in va()[0] and 'XL' in va()[1] and E()['variante'] == '', [va(), E().get('variante')])
    pruefe('Welt-Pillen Fantasie unverändert 3 (Variante nicht darunter gemischt)', len(texte('.m-welt .pille')) == 3)
    page.click('[data-a="variante:xl"]'); page.wait_for_timeout(700)
    pruefe('Variante XL anklicken: einstellungen.variante xl, Pille aktiv, Erklärung', E()['variante'] == 'xl' and 'XL' in texte('.m-variante .pille.aktiv')[0] and 'doppelt' in texte('.m-variante .welt-text')[0], [E()['variante'], texte('.m-variante .welt-text')])
    pruefe('Menühintergrund baut die XL-Strecke (strecke.variante xl, Fantasie ≈ 2×)', page.evaluate('Rennspiel.spiel.strecke.variante') == 'xl' and page.evaluate('Rennspiel.spiel.strecke.laenge') > 2400, page.evaluate('Rennspiel.spiel.strecke.laenge'))
    page.click('[data-a="welt:verrueckt"]'); page.wait_for_timeout(100)
    pruefe('Welt-Zeile funktioniert weiter mit Variante (Welt verrueckt, Variante bleibt xl)', E()['welt'] == 'verrueckt' and E()['variante'] == 'xl', [E()['welt'], E()['variante']])
    taste('ArrowUp'); page.wait_for_timeout(100)
    pruefe('Taste ↑ schaltet weiterhin die Welt (Verrückt -> Fantasie = Standard), Variante bleibt', E()['welt'] == '' and E()['variante'] == 'xl', [E()['welt'], E()['variante']])
    taste('KeyV'); page.wait_for_timeout(100)
    pruefe('Taste V schaltet XL -> Normal', E()['variante'] == '', E()['variante'])
    taste('KeyV'); page.wait_for_timeout(100)
    pruefe('Taste V schaltet Normal -> XL', E()['variante'] == 'xl', E()['variante'])
    snap('menu_r6_strecke_variante.png')
    for vw, vh in ((1280, 800), (1440, 900)):
        page.set_viewport_size({'width': vw, 'height': vh}); page.wait_for_timeout(300)
        l = page.evaluate("""(() => { const m = document.querySelector('.m-inhalt'), r = document.querySelector('.m-variante').getBoundingClientRect();
          return { scroll: m.scrollHeight <= m.clientHeight + 1, ok: r.left >= 0 && r.right <= innerWidth && r.bottom <= document.querySelector('.m-fuss').getBoundingClientRect().top }; })()""")
        pruefe(f'Strecke+Welt+Variante {vw}×{vh}: ohne Scrollen, Varianten-Zeile im Bild', l['scroll'] and l['ok'], l)
    page.set_viewport_size({'width': 1280, 'height': 800}); page.wait_for_timeout(300)
    taste('ArrowLeft'); page.wait_for_timeout(300)      # Fantasie -> Wüste (Katalogreihenfolge wiese, wald, wueste, fantasie)
    pruefe('Streckenwechsel setzt Variante zurück (Wüste: Zeile da, Normal)', E()['streckeId'] == 'wueste' and len(va()) == 2 and E()['variante'] == '', [E()['streckeId'], va(), E()['variante']])
    page.click('[data-a="variante:xl"]'); page.wait_for_timeout(700)
    pruefe('Wüste XL: strecke.variante xl, Länge ≈ 1,6 × 3331 m', page.evaluate('Rennspiel.spiel.strecke.variante') == 'xl' and abs(page.evaluate('Rennspiel.spiel.strecke.laenge') / 3331 - 1.6) < 0.05, page.evaluate('Rennspiel.spiel.strecke.laenge'))
    page.click('[data-a="variante:"]'); page.wait_for_timeout(700)
    pruefe('Zurück auf Normal: strecke.variante leer, Länge 3331 m', page.evaluate('Rennspiel.spiel.strecke.variante') == '' and abs(page.evaluate('Rennspiel.spiel.strecke.laenge') - 3331) < 5)
    page.click('[data-a="strecke:wiese"]'); page.wait_for_timeout(300)
    # v22 (14.10.): XL für ALLE Strecken – Varianten-Zeile (Normal + XL) bei jeder Strecke, XL baut ≈ Faktor × Länge, Zeile im Bild
    pruefe('Wiese: Varianten-Zeile Normal + XL, Standard Normal', len(va()) == 2 and 'XL' in va()[1] and E()['variante'] == '', [va(), E().get('variante')])
    for sid, f in (('wiese', 1.6), ('wald', 1.6), ('wueste', 1.6), ('fantasie', 2.0), ('dino', 1.6), ('alpen', 1.6)):
        page.click('[data-a="strecke:%s"]' % sid); page.wait_for_timeout(500)
        page.wait_for_function('Rennspiel.spiel.strecke.id === "%s" && Rennspiel.spiel.strecke.variante === ""' % sid, timeout=120000)   # Menühintergrund fertig gebaut (bei Last langsam)
        L0 = page.evaluate('Rennspiel.spiel.strecke.laenge')
        pruefe('%s: Varianten-Zeile Normal + XL, Variante Normal' % sid, len(va()) == 2 and 'Normal' in va()[0] and 'XL' in va()[1] and E()['variante'] == '', [va(), E().get('variante')])
        page.click('[data-a="variante:xl"]'); page.wait_for_timeout(500)
        page.wait_for_function('Rennspiel.spiel.strecke.variante === "xl"', timeout=120000)
        L1 = page.evaluate('Rennspiel.spiel.strecke.laenge')
        l = page.evaluate("""(() => { const m = document.querySelector('.m-inhalt'), r = document.querySelector('.m-variante').getBoundingClientRect();
          return { scroll: m.scrollHeight <= m.clientHeight + 1, ok: r.left >= 0 && r.right <= innerWidth && r.bottom <= document.querySelector('.m-fuss').getBoundingClientRect().top }; })()""")
        pruefe('%s XL: strecke.variante xl, Länge ≈ %s × Normal (%d → %d m), Zeile im Bild ohne Scrollen' % (sid, f, L0, L1), page.evaluate('Rennspiel.spiel.strecke.variante') == 'xl' and abs(L1 / L0 - f) < 0.05 * f and l['scroll'] and l['ok'], l)
        page.click('[data-a="variante:"]'); page.wait_for_timeout(500)
    page.click('[data-a="strecke:wiese"]'); page.wait_for_timeout(300)
    pruefe('Streckenwechsel setzt Variante zurück (Wiese Normal)', E()['variante'] == '' and E()['streckeId'] == 'wiese', E()['variante'])
    page.click('[data-a="strecke:wiese"]'); page.click('[data-a="welt:stunt"]')
    # 12.10. Hindernis-Menge: Zeile „🚧 Hindernisse“ (Normal / Viele / Sehr viele), Taste O, ausgegraut in Welt Klassisch
    page.wait_for_timeout(500)
    hp = texte('.m-hindernisse .pille')
    pruefe('Hindernisse-Zeile unter der Welt: Normal · Viele · Sehr viele, Standard Normal aktiv', len(hp) == 3 and 'Normal' in hp[0] and 'Viele' in hp[1] and 'Sehr viele' in hp[2]
           and 'Normal' in texte('.m-hindernisse .pille.aktiv')[0] and E()['hindernisMenge'] == 'normal', hp)
    n_normal = page.evaluate('Rennspiel.spiel.strecke.hindernisse.length + Rennspiel.spiel.strecke.strohballen.length')
    page.click('[data-a="hindernisse:viele"]'); page.wait_for_timeout(700)
    n_viele = page.evaluate('Rennspiel.spiel.strecke.hindernisse.length + Rennspiel.spiel.strecke.strohballen.length')
    pruefe('Pille „Viele“: Einstellung viele, Menü-Hintergrund neu gebaut mit mehr Hindernissen', E()['hindernisMenge'] == 'viele' and page.evaluate('Rennspiel.spiel.strecke.hindernisMenge') == 'viele' and n_viele > n_normal, [n_normal, n_viele])
    taste('KeyO'); page.wait_for_timeout(700)
    pruefe('Taste O: Viele → Sehr viele (mehr als Viele)', E()['hindernisMenge'] == 'sehrViele' and page.evaluate('Rennspiel.spiel.strecke.hindernisMenge') == 'sehrViele'
           and page.evaluate('Rennspiel.spiel.strecke.hindernisse.length + Rennspiel.spiel.strecke.strohballen.length') > n_viele , E()['hindernisMenge'])
    pruefe('Gespeichert (localStorage) und nach Neuaufbau gültig', page.evaluate("JSON.parse(localStorage.getItem(Rennspiel.config.ui.speicherSchluessel)).hindernisMenge") == 'sehrViele')
    snap('menu_2c_hindernisse_sehrViele.png')
    page.click('[data-a="welt:klassisch"]'); page.wait_for_timeout(700)
    hk = page.evaluate("(() => { const z = document.querySelector('.m-hindernisse'); return { aus: z.classList.contains('aus'), klickbar: z.querySelectorAll('.pille[data-a]').length, text: z.querySelector('.welt-text').textContent }; })()")
    pruefe('Welt Klassisch: Hindernisse-Zeile ausgegraut (keine klickbaren Pillen), Hinweis „Erst ab Welt Hindernisse“', hk['aus'] and hk['klickbar'] == 0 and 'Erst ab Welt' in hk['text'], hk)
    taste('KeyO'); page.wait_for_timeout(300)
    pruefe('Welt Klassisch: Taste O ändert nichts; Strecke ohne Hindernisse', E()['hindernisMenge'] == 'sehrViele' and page.evaluate('Rennspiel.spiel.strecke.hindernisse.length + Rennspiel.spiel.strecke.strohballen.length') == 0)
    snap('menu_2d_hindernisse_klassisch_grau.png')
    page.click('[data-a="welt:hindernisse"]'); page.wait_for_timeout(700)
    pruefe('Zurück in Welt Hindernisse: Wahl „Sehr viele“ bleibt, Zeile wieder aktiv', E()['hindernisMenge'] == 'sehrViele' and page.evaluate("!document.querySelector('.m-hindernisse').classList.contains('aus')"))
    ueb = page.evaluate("""(() => { const m = document.querySelector('.m-inhalt'), f = document.querySelector('.m-fuss'), z = document.querySelector('.m-hindernisse').getBoundingClientRect();
      return { scroll: m.scrollHeight <= m.clientHeight + 1, zeileSichtbar: z.bottom <= f.getBoundingClientRect().top + 2 && z.top > 0 }; })()""")
    pruefe('Strecken-Schritt: Hindernisse-Zeile sichtbar, kein Überlauf im 1280×800-Fenster', ueb['scroll'] and ueb['zeileSichtbar'], ueb)
    page.evaluate("(() => { const m = Rennspiel.spiel.menue; m.e.hindernisMenge = 'bloedsinn'; m.weltFix(); })()")
    pruefe('Ungültiger Wert → Normal (weltFix)', E()['hindernisMenge'] == 'normal')
    page.click('[data-a="hindernisse:normal"]'); page.click('[data-a="welt:stunt"]'); page.wait_for_timeout(300)
    # Fahrer-Emojis
    page.click('[data-a="weiter"]'); page.wait_for_timeout(200)
    em = page.evaluate("""(() => { const f = (n) => document.querySelector('[data-a="fahrer:0:' + n + '"] .avatar').textContent;
      const alle = Array.from(document.querySelectorAll('.karte.fahrer .avatar')).map(a => a.textContent);
      return { emmy: f('Emmy'), jonas: f('Jonas'), einmalig: new Set(alle).size === alle.length, n: alle.length }; })()""")
    pruefe('Emmy-Karte 🦁, Jonas-Karte 🐯, alle 12 Emojis verschieden', em['emmy'] == '🦁' and em['jonas'] == '🐯' and em['einmalig'] and em['n'] == 12, em)
    # Einstellungen-Schritt (solo)
    page.click('[data-a="schritt:4"]'); page.wait_for_timeout(300)
    zl = page.evaluate('Rennspiel.spiel.menue.zeilen()')
    pruefe('Fokus-Reihenfolge solo', zl == ['runden', 'gegner', 'schwierigkeit', 'hilfe0', 'tageszeit', 'jahreszeit', 'wetter', 'wind', 'schaden', 'tempo', 'polizei', 'rempeln', 'geister', 'krankenwagen', 'abschleppwagen', 'tiere', 'rennautos', 'start'], zl)
    pj = texte('[data-a="fokus:5"] .pille')
    pruefe('Jahreszeit-Pillen (Wiese): Frühling, Sommer, Herbst, Winter, Zufall; Sommer aktiv', len(pj) == 5 and 'Sommer' in pj[1] and 'Zufall' in pj[4]
           and 'Sommer' in texte('[data-a="fokus:5"] .pille.aktiv')[0], pj)
    pruefe('Wetter-Pillen Sommer: Klar, Regen, Zufall (kein Schnee)', page.locator('[data-a="wert:wetter:schnee"]').count() == 0 and page.locator('[data-a="wert:wetter:regen"]').count() == 1)
    page.click('[data-a="wert:jahreszeit:winter"]'); page.wait_for_timeout(200)
    pruefe('Winter: Wetter-Pillen enthalten Schnee + Hagel, Wetter auf Klar', page.locator('[data-a="wert:wetter:schnee"]').count() == 1
           and page.locator('[data-a="wert:wetter:hagel"]').count() == 1 and E()['jahreszeit'] == 'winter' and E()['wetter'] == 'klar', E())
    page.click('[data-a="wert:wetter:schnee"]'); page.wait_for_timeout(100)
    pruefe('Wetter Schnee gewählt', E()['wetter'] == 'schnee', E()['wetter'])
    page.click('[data-a="wert:jahreszeit:herbst"]'); page.wait_for_timeout(200)
    pruefe('Jahreszeitwechsel setzt Wetter auf Klar; Herbst: Nebel ja, Schnee nein', E()['wetter'] == 'klar' and page.locator('[data-a="wert:wetter:nebel"]').count() == 1
           and page.locator('[data-a="wert:wetter:schnee"]').count() == 0, E())
    page.click('[data-a="wert:jahreszeit:zufall"]'); page.wait_for_timeout(100)
    pruefe('Jahreszeit Zufall: Wetter Klar/Zufall', texte('[data-a="fokus:6"] .pille') == ['☀️ Klar', '🎲 Zufall'] or len(texte('[data-a="fokus:6"] .pille')) == 2, texte('[data-a="fokus:6"] .pille'))
    page.click('[data-a="wert:jahreszeit:winter"]'); page.click('[data-a="wert:wetter:schnee"]')
    # Wüste: Winter -> Sandsturm-Zeit, kein Schnee
    page.evaluate("Rennspiel.spiel.menue.streckeWaehlen('wueste'); Rennspiel.spiel.menue.zeichnen()"); page.wait_for_timeout(300)
    pw = texte('[data-a="fokus:6"] .pille'); pjw = texte('[data-a="fokus:5"] .pille')
    pruefe('Wüste: Schnee-Wetter zurück auf Klar, Winter heißt Sandsturm-Zeit, Wetter ohne Schnee/Hagel', E()['wetter'] == 'klar' and any('Sandsturm-Zeit' in t for t in pjw)
           and page.locator('[data-a="wert:wetter:schnee"]').count() == 0, [pjw, pw])
    page.click('[data-a="wert:jahreszeit:winter"]'); page.wait_for_timeout(200)
    pw = texte('[data-a="fokus:6"] .pille')
    pruefe('Wüste Winter: Wetter-Pillen Klar, Sandsturm, Zufall – kein Schnee', page.locator('[data-a="wert:wetter:sandsturm"]').count() == 1 and page.locator('[data-a="wert:wetter:schnee"]').count() == 0, pw)
    page.evaluate("Rennspiel.spiel.menue.streckeWaehlen('wiese'); Rennspiel.spiel.menue.zeichnen()"); page.wait_for_timeout(200)
    pruefe('Zurück zur Wiese: Welt zurückgesetzt (Streckenwechsel)', E()['welt'] == '', E()['welt'])
    page.click('[data-a="schritt:1"]'); page.click('[data-a="welt:stunt"]'); page.click('[data-a="schritt:4"]'); page.wait_for_timeout(200)
    # Wind
    for i in range(5): page.click('[data-a="stepper:wind:1"]')
    pruefe('Wind-Stepper bis 5', E()['windStaerke'] == 5 and page.inner_text('[data-a="fokus:7"] .zahl') == '5', E()['windStaerke'])
    page.click('[data-a="stepper:wind:1"]')
    pruefe('Wind-Stepper nach 5: Zufall (🎲)', E()['windStaerke'] == 'zufall' and page.inner_text('[data-a="fokus:7"] .zahl') == '🎲', E()['windStaerke'])
    page.click('[data-a="stepper:wind:-1"]'); page.click('[data-a="stepper:wind:-1"]')
    pruefe('Wind-Stepper zurück 5 -> 4', E()['windStaerke'] == 4, E()['windStaerke'])
    page.click('[data-a="wert:wind:zufall"]')
    pruefe('Wind-Pille 🎲 = Zufall', E()['windStaerke'] == 'zufall', E()['windStaerke'])
    page.click('[data-a="stepper:wind:-1"]'); page.click('[data-a="stepper:wind:-1"]'); page.click('[data-a="stepper:wind:-1"]')
    pruefe('Wind 3 per Stepper (für den Rennstart)', E()['windStaerke'] == 3, E()['windStaerke'])
    # Schaden
    tip = page.get_attribute('[data-a="fokus:8"]', 'title')
    pruefe('Schaden: Standard aus, Tooltip', E()['schaden'] is False and 'Abschleppwagen' in (tip or '') and 'Energie' in (tip or ''), tip)
    page.click('[data-a="wert:schaden:an"]')
    pruefe('Schaden an gespeichert', E()['schaden'] is True and 'An' in texte('[data-a="fokus:8"] .pille.aktiv')[0], E()['schaden'])
    # Gegner bis 10
    for i in range(14): page.click('[data-a="stepper:gegner:1"]')
    pruefe('Gegner-Stepper bis 10 (nicht darüber)', E()['gegner'] == 10 and page.inner_text('[data-a="fokus:1"] .zahl') == '10', E()['gegner'])
    # Tastatur: ↓ bis Start, Werte per ←/→ in Jahreszeit/Wind/Schaden
    page.evaluate('Rennspiel.spiel.menue.fokus = 0; Rennspiel.spiel.menue.zeichnen()')
    for i in range(4): taste('ArrowDown')
    pruefe('Tastatur: 4 × ↓ = Tageszeit-Zeile (linke Spalte unten)', page.evaluate('Rennspiel.spiel.menue.fokus') == 4, page.evaluate('Rennspiel.spiel.menue.fokus'))
    # Runde 6 (W2-D): Tageszeit-Zeile (Standard Tag; → Dämmerung → Nacht, ← zurück), Pillen + Tooltip
    tzp = texte('[data-a^="wert:tageszeit:"]') if page.locator('[data-a^="wert:tageszeit:"]').count() else []
    pruefe('Tageszeit: Pillen Tag / Dämmerung / Nacht, Standard Tag aktiv', len(tzp) == 3 and 'Tag' in tzp[0] and 'Dämmerung' in tzp[1] and 'Nacht' in tzp[2]
           and E().get('tageszeit') == 'tag' and 'Tag' in texte('[data-a="wert:tageszeit:tag"].aktiv')[0], [tzp, E().get('tageszeit')])
    taste('ArrowRight'); t1 = E().get('tageszeit'); taste('ArrowRight'); t2 = E().get('tageszeit'); taste('ArrowRight'); t3 = E().get('tageszeit')
    taste('ArrowLeft'); taste('ArrowLeft'); t4 = E().get('tageszeit')
    pruefe('Tastatur: Tageszeit → Dämmerung → Nacht (bleibt), ← ← Tag', [t1, t2, t3, t4] == ['daemmerung', 'nacht', 'nacht', 'tag'], [t1, t2, t3, t4])
    page.click('[data-a="wert:tageszeit:nacht"]'); page.wait_for_timeout(900)
    gesp_tz = page.evaluate('JSON.parse(localStorage.getItem(Rennspiel.config.ui.speicherSchluessel)).tageszeit')
    pruefe('Tageszeit Nacht anklicken: gespeichert, Menü-Hintergrund nachts (Kuppel + Sterne)', E().get('tageszeit') == 'nacht' and gesp_tz == 'nacht'
           and page.evaluate("Rennspiel.spiel.wetter && Rennspiel.spiel.wetter.tageszeit") == 'nacht'
           and page.evaluate("!!Rennspiel.spiel.szene.getObjectByName('Himmelskuppel')"), [E().get('tageszeit'), gesp_tz])
    snap('menu_r6_tageszeit_nacht.png')
    page.click('[data-a="wert:tageszeit:tag"]'); page.wait_for_timeout(900)
    pruefe('Tageszeit zurück auf Tag: keine Himmelskuppel', E().get('tageszeit') == 'tag' and not page.evaluate("!!Rennspiel.spiel.szene.getObjectByName('Himmelskuppel')"))
    page.evaluate('Rennspiel.spiel.menue.fokus = 4; Rennspiel.spiel.menue.zeichnen()')
    taste('ArrowDown')
    taste('ArrowRight')   # Jahreszeit eine Pille weiter (Winter -> Zufall)
    pruefe('Tastatur: Fokus auf Jahreszeit, → wählt nächste Pille', page.evaluate('Rennspiel.spiel.menue.fokus') == 5 and E()['jahreszeit'] == 'zufall', E()['jahreszeit'])
    taste('ArrowLeft'); taste('ArrowDown'); taste('ArrowDown'); taste('ArrowLeft')   # Winter; Wetter; Wind 3 -> 2
    pruefe('Tastatur: Wind ← = 2', E()['windStaerke'] == 2 and E()['jahreszeit'] == 'winter', E())
    taste('ArrowRight'); taste('ArrowDown'); taste('ArrowLeft')
    pruefe('Tastatur: Schaden ← = aus', E()['schaden'] is False, E()['schaden'])
    taste('ArrowRight'); taste('ArrowDown')
    # Runde 5: Tempo-Klasse (Standard normal, → schnell, ← normal)
    pruefe('Tempo: Standard Normal', E()['tempoKlasse'] == 'normal' and 'Normal' in texte('[data-a="fokus:9"] .pille.aktiv')[0], E().get('tempoKlasse'))
    taste('ArrowRight')
    pruefe('Tastatur: Tempo → = schnell', E()['tempoKlasse'] == 'schnell', E().get('tempoKlasse'))
    taste('ArrowLeft'); taste('ArrowDown')
    pruefe('Tastatur: Polizei-Zeile fokussiert, Standard aus; → = an, ← = aus', E()['polizei'] is False, E().get('polizei'))
    taste('ArrowRight'); an = E()['polizei']; taste('ArrowLeft')
    pruefe('Tastatur: Polizei → = an, ← = aus', an is True and E()['polizei'] is False, [an, E()['polizei']])
    taste('ArrowDown')
    # Runde 6: Rempeln-Zeile (Standard sanft; → = echt, ← = sanft)
    pruefe('Tastatur: Rempeln-Zeile, Standard sanft', E().get('rempeln') == 'sanft', E().get('rempeln'))
    taste('ArrowRight'); r1 = E().get('rempeln'); taste('ArrowLeft')
    pruefe('Tastatur: Rempeln → = echt, ← = sanft', r1 == 'echt' and E().get('rempeln') == 'sanft', [r1, E().get('rempeln')])
    taste('ArrowDown')
    # v25/v28: Zeile „Verkehr“ (Geisterfahrer, Krankenwagen, Abschleppwagen je einzeln aus/an; Standard aus)
    pruefe('Tastatur: Geisterfahrer + Krankenwagen + Abschleppwagen Standard aus', E().get('geisterfahrer') is False and E().get('krankenwagen') is False and E().get('abschleppwagen') is False, [E().get('geisterfahrer'), E().get('krankenwagen'), E().get('abschleppwagen')])
    taste('ArrowRight'); g1 = E().get('geisterfahrer'); taste('ArrowLeft')
    taste('ArrowDown')
    taste('ArrowRight'); k1 = E().get('krankenwagen'); taste('ArrowRight'); k2 = E().get('krankenwagen'); taste('ArrowLeft'); k3 = E().get('krankenwagen')
    taste('ArrowDown')
    taste('ArrowRight'); a1 = E().get('abschleppwagen'); taste('ArrowLeft'); a2 = E().get('abschleppwagen')
    pruefe('Tastatur: Geisterfahrer → = an; Krankenwagen und Abschleppwagen je → = an, ← = aus (einzeln)', g1 is True and E().get('geisterfahrer') is False and [k1, k2, k3, a1, a2] == [True, True, False, True, False], [g1, k1, k2, k3, a1, a2])
    page.click('[data-a="wert:krankenwagen:an"]')
    pruefe('Maus: nur Krankenwagen an (Abschleppwagen bleibt aus)', E().get('krankenwagen') is True and E().get('abschleppwagen') is False and E().get('verkehr') == 'wenig')
    page.click('[data-a="wert:abschleppwagen:an"]'); page.click('[data-a="wert:geister:an"]')
    pruefe('Maus: Pillen setzen Krankenwagen + Abschleppwagen + Geisterfahrer an', E().get('krankenwagen') is True and E().get('abschleppwagen') is True and E().get('geisterfahrer') is True)
    page.click('[data-a="wert:krankenwagen:aus"]')
    pruefe('Maus: Krankenwagen aus, Abschleppwagen bleibt an', E().get('krankenwagen') is False and E().get('abschleppwagen') is True)
    page.click('[data-a="wert:abschleppwagen:aus"]'); page.click('[data-a="wert:geister:aus"]')
    pruefe('Verkehr-Zeile: 3 Gruppen je Aus/An (6 Pillen)', page.locator('[data-a^="wert:geister:"], [data-a^="wert:krankenwagen:"], [data-a^="wert:abschleppwagen:"]').count() == 6)
    taste('ArrowDown')
    t0 = E().get('tiere'); taste('ArrowLeft'); t1 = E().get('tiere'); taste('ArrowRight'); t2 = E().get('tiere')
    pruefe('Tastatur: Tiere (Standard an) ← = aus, → = an', [t0, t1, t2] == [True, False, True], [t0, t1, t2])
    page.click('[data-a="wert:tiere:aus"]'); t3 = E().get('tiere'); page.click('[data-a="wert:tiere:an"]')
    pruefe('Maus: Tiere-Pillen Aus/An', t3 is False and E().get('tiere') is True, [t3, E().get('tiere')])
    taste('ArrowDown')   # v29 (F3): Zeile „Nur Rennautos“ (Wiese: Standard aus)
    n0 = E().get('nurRennautos'); taste('ArrowRight'); n1 = E().get('nurRennautos'); taste('ArrowLeft'); n2 = E().get('nurRennautos')
    pruefe('Tastatur: Nur Rennautos (Wiese) → = an, ← = aus', n1 is True and n2 is False, [n0, n1, n2])
    page.evaluate('Rennspiel.spiel.einstellungen.nurRennautos = null')
    taste('ArrowDown')
    pruefe('Tastatur: ↓ erreicht Start (Fokus-Ring), Schaden wieder an', page.locator('.start-knopf.fokus').count() == 1 and E()['schaden'] is True)
    # Layout ohne Überlauf: solo/zwei × Tafel zu/auf × 1280×800 / 1440×900
    LAYOUT = """(() => { const m = document.querySelector('.m-inhalt'), fuss = document.querySelector('.m-fuss').getBoundingClientRect().top;
      const r = Array.from(document.querySelectorAll('.zeile, .start-knopf, .m-aktionen .knopf, .tafel, .z-wert .pille, .z-wert .rund')).map(e => e.getBoundingClientRect());
      const zeilen = Array.from(document.querySelectorAll('.zeile')).map(e => [e.scrollWidth <= e.clientWidth + 1, e.getBoundingClientRect().width > 100]);
      return { scroll: m.scrollHeight <= m.clientHeight + 1, innen: r.every(a => a.left >= 0 && a.right <= innerWidth && a.top >= 0 && a.bottom <= fuss + 2),
               breitenOk: zeilen.every(z => z[0] && z[1]), n: r.length, h: [m.scrollHeight, m.clientHeight] }; })()"""
    for modus in ('solo', 'zwei'):
        page.evaluate(f"Rennspiel.spiel.einstellungen.modus = '{modus}'; Rennspiel.spiel.menue.einstellungenFix(); Rennspiel.spiel.menue.tafelOffen = false; Rennspiel.spiel.menue.zeichnen()")
        for tafel in (False, True):
            for vw, vh in ((1280, 800), (1440, 900)):
                page.evaluate(f"Rennspiel.spiel.menue.tafelOffen = {'true' if tafel else 'false'}; Rennspiel.spiel.menue.zeichnen()")
                page.set_viewport_size({'width': vw, 'height': vh}); page.wait_for_timeout(300)
                l = page.evaluate(LAYOUT)
                pruefe(f'Einstellungen {modus} {"Tafel auf" if tafel else "Tafel zu"} {vw}×{vh}: ohne Scrollen, nichts abgeschnitten', l['scroll'] and l['innen'] and l['breitenOk'], l)
                snap(f'menu_r4_einstellungen_{modus}_{"tafel" if tafel else "zu"}_{vw}.png')
    page.set_viewport_size({'width': 1280, 'height': 800}); page.wait_for_timeout(300)
    page.evaluate("Rennspiel.spiel.einstellungen.modus = 'solo'; Rennspiel.spiel.menue.einstellungenFix(); Rennspiel.spiel.menue.tafelOffen = false; Rennspiel.spiel.menue.zeichnen()")
    # Start mit den gewählten Welt-Einstellungen
    page.click('[data-a="start"]', force=True)      # fokussierter Knopf wackelt (Animation) -> nicht „stabil“
    page.wait_for_function('Rennspiel.spiel.zustand === "rennen"', timeout=120000)
    st = page.evaluate("""(() => { const s = Rennspiel.spiel; return { welt: s.strecke.welt, schadenAn: !!(s.schaden && s.schaden.an), fz: s.fahrzeuge.length,
      jz: s.wetter ? s.wetter.jahreszeit : null, wetter: s.wetter ? s.wetter.wetterName || s.wetter.wetter : null }; })()""")
    pruefe('Start: Welt Stunt, Schaden an, 11 Autos (10 Gegner)', st['welt'] == 'stunt' and st['schadenAn'] is True and st['fz'] == 11, st)
    pruefe('Start: Jahreszeit Winter im Wetter-Objekt', st['jz'] == 'winter', st)
    pruefe('Rennspiel.spiel.schaden.an true', page.evaluate('Rennspiel.spiel.schaden.an') is True)
    gesp = page.evaluate('localStorage.getItem(Rennspiel.config.ui.speicherSchluessel)')
    pruefe('Welt/Jahreszeit/Wind/Schaden in localStorage', all(x in gesp for x in ('"welt":"stunt"', '"jahreszeit":"winter"', '"windStaerke":3', '"schaden":true')), gesp)
    snap('menu_r4_rennen_stunt_winter.png')
    # rennenStarten mit Argumenten: welt wird übernommen, ungültige Welt -> Standard der Strecke
    page.evaluate("Rennspiel.spiel.rennenStarten({ streckeId: 'wald', welt: 'stunt', jahreszeit: 'sommer', wetter: 'klar', windStaerke: 0, schaden: false, gegner: 3 })")
    pruefe('rennenStarten: Wald + Stunt', page.evaluate('Rennspiel.spiel.strecke.welt') == 'stunt' and page.evaluate('!(Rennspiel.spiel.schaden && Rennspiel.spiel.schaden.an)'))
    page.evaluate("Rennspiel.spiel.rennenStarten({ streckeId: 'fantasie', welt: 'stunt' })")
    pruefe('rennenStarten: Fantasie + ungültige Welt -> Fantasie', page.evaluate('Rennspiel.spiel.strecke.welt') == 'fantasie', page.evaluate('Rennspiel.spiel.strecke.welt'))
    # Aufräumen: Standardwerte wie vor dem Block (spätere Tests erwarten Sommer/klar/kein Wind)
    page.evaluate("Rennspiel.spiel.rennenStarten({ streckeId: 'wiese', welt: '', jahreszeit: 'sommer', wetter: 'klar', windStaerke: 0, schaden: false, gegner: 3, modus: 'solo' })")
    page.evaluate("Rennspiel.spiel.zumMenue()"); page.wait_for_timeout(500)
    # Maus im Menü: Solo wählen, bis Start klicken
    page.click('[data-a="modus:solo"]'); page.wait_for_timeout(150)
    page.click('[data-a="strecke:wiese"]'); page.wait_for_timeout(150)
    page.click('[data-a="weiter"]'); page.wait_for_timeout(150)      # Runde 4: Klick auf die Karte bleibt im Schritt (darunter: Welt)
    page.click('[data-a="fahrer:0:Kerle"]'); page.wait_for_timeout(150)
    snap('menu_10b_fahrer_solo.png')
    page.evaluate("Rennspiel.Sterne.gutschreiben('Kerle', 12)"); page.evaluate("Rennspiel.spiel.menue.zeichnen && Rennspiel.spiel.menue.zeichnen()"); page.wait_for_timeout(200)
    karte = page.evaluate("(() => { const k = document.querySelector('[data-a=\"fahrer:0:Kerle\"]'); return k ? k.textContent.trim() : null; })()")
    pruefe('Runde 6: Fahrerkarte zeigt „⭐ 12“ (Sterne-Gesamtzahl je Fahrer)', karte is not None and '⭐ 12' in karte, karte)
    # Runde 6 (W3-G): Münz-Kontostand an der Fahrerkarte
    page.evaluate("Rennspiel.Garage.gutschreiben('Kerle', 7 - Rennspiel.Garage.konto('Kerle'))"); page.evaluate("Rennspiel.spiel.menue.zeichnen()"); page.wait_for_timeout(150)
    karte = page.evaluate("(() => { const k = document.querySelector('[data-a=\"fahrer:0:Kerle\"]'); return k ? k.textContent.trim() : null; })()")
    pruefe('W3-G: Fahrerkarte zeigt „🪙 n“ (Münz-Kontostand)', karte is not None and ('🪙 %d' % page.evaluate("Rennspiel.Garage.konto('Kerle')")) in karte, karte)
    pruefe('Maus: Fahrer Kerle gewählt, Solo-Raster 12 Karten', page.evaluate('Rennspiel.spiel.einstellungen.fahrer[0]') == 'Kerle'
           and page.evaluate("document.querySelectorAll('.karte.fahrer').length") == 12)
    page.click('[data-a="weiter"]'); page.wait_for_timeout(150)
    page.click('[data-a="auto:0:bmw-m4"]'); page.wait_for_timeout(150)
    snap('menu_11_autos_solo.png')
    auto_schritt('Auto solo', [0], [('Comma', 'Period')], 'menu_11b_autos_solo_3d.png')
    taste('KeyE'); page.wait_for_timeout(100); taste('KeyQ'); page.wait_for_timeout(100)    # Q/E drehen im Solo-Modus ebenfalls
    page.set_viewport_size({'width': 1440, 'height': 900}); page.wait_for_timeout(500)
    rr = page.evaluate(IMPASSEND)
    pruefe('Auto solo 1440×900: passt ohne Scrollen', rr['scroll'] and rr['innen'] and rr['fuss'], rr)
    snap('menu_11c_autos_solo_1440.png')
    page.set_viewport_size({'width': 1280, 'height': 800}); page.wait_for_timeout(300)
    page.click('[data-a="auto:0:bmw-m4"]'); page.wait_for_timeout(150)
    pruefe('Maus: Auto BMW M4 gewählt (Karte)', page.evaluate('Rennspiel.spiel.einstellungen.autoIds[0]') == 'bmw-m4')
    page.click('[data-a="weiter"]'); page.wait_for_timeout(150)
    vorschau_stoppt('Auto solo')
    snap('menu_12_einstellungen_solo.png')
    PILLEN = """(() => { const z = Array.from(document.querySelectorAll('.zeile')).find(e => e.querySelector('[data-a="wert:schwierigkeit:unschlagbar"]'));
      const p = Array.from(z.querySelectorAll('.pille')), r = p.map(e => e.getBoundingClientRect()), zr = z.getBoundingClientRect();
      return { n: p.length, namen: p.map(e => e.textContent.trim()), innen: r.every(a => a.left >= zr.left - 1 && a.right <= zr.right + 1 && a.right <= innerWidth && a.bottom <= innerHeight && a.width > 10),
        abgeschnitten: p.some(e => e.scrollWidth > e.clientWidth + 1), rot: getComputedStyle(p[6]).backgroundColor, rot0: getComputedStyle(p[0]).backgroundColor,
        fuss: Math.max(...r.map(a => a.bottom)) <= document.querySelector('.m-fuss').getBoundingClientRect().top }; })()"""
    for vw, vh in ((1280, 800), (1440, 900)):
        page.set_viewport_size({'width': vw, 'height': vh}); page.wait_for_timeout(400)
        pl = page.evaluate(PILLEN)
        pruefe(f'Einstellungen {vw}×{vh}: 7 Stärke-Pillen sichtbar, nicht abgeschnitten, in Rang-Reihenfolge, Unschlagbar rot mit 💀',
               pl['n'] == 7 and pl['innen'] and not pl['abgeschnitten'] and pl['fuss'] and pl['namen'][0] == 'Leicht' and pl['namen'][6] == '💀 Unschlagbar' and pl['rot'] != pl['rot0'], pl)
        snap(f'menu_12_einstellungen_{vw}.png')
    page.set_viewport_size({'width': 1280, 'height': 800}); page.wait_for_timeout(300)
    page.click('[data-a="start"]')
    page.wait_for_function('Rennspiel.spiel.zustand === "rennen"', timeout=120000)
    pruefe('Maus: Solo-Rennen gestartet', page.evaluate('Rennspiel.spiel.kameras.length') == 1 and page.evaluate('Rennspiel.spiel.fahrzeuge[0].auto.id') == 'bmw-m4')
    page.wait_for_function('Rennspiel.spiel.rennen.zustand === "laeuft"', timeout=120000)
    page.wait_for_timeout(1500); snap('menu_13_solo_hud.png')
    pruefe('Solo-HUD zeigt Fahrername Kerle', 'Kerle' in page.evaluate("document.querySelector('.hud-name').textContent"))
    # HUD-Hinweise: "Falsch herum!" und Rundenmeldungen
    page.evaluate("Rennspiel.spiel.fahrzeuge[0].vehicle.heading += Math.PI")
    # Spielzeit läuft unter Software-Grafik langsamer als Echtzeit → auf den Hinweis warten statt fester Pause
    try: page.wait_for_function("document.querySelector('.hud-hinweis').textContent.includes('Falsch herum')", timeout=120000)
    except Exception: pass
    hinweis = page.evaluate("document.querySelector('.hud-hinweis').textContent")
    snap('menu_14_falsch_herum.png')
    pruefe('Hinweis "Falsch herum!"', 'Falsch herum' in hinweis, hinweis)
    page.evaluate("Rennspiel.spiel.rennenStarten({ modus: 'solo', runden: 3, gegner: 1, autoIds: ['troc-cabrio', 'multivan'] }); Rennspiel.spiel.autopilot(0, true)")
    banner = []
    for _ in range(250):
        page.evaluate('Rennspiel.spiel.schnellvorlauf(1)')
        t = page.evaluate('Rennspiel.spiel.rennen.teilnehmer[0].runde')
        txt = page.evaluate("document.querySelector('.hud-banner').textContent")
        if t >= 1 and not banner: banner.append(txt)
        if t >= 2: banner.append(txt); break
    pruefe('Meldungen "Kerle Runde 2!" und "Kerle Letzte Runde!"', banner == ['KerleRunde 2!', 'KerleLetzte Runde!'], banner)
    page.evaluate('Rennspiel.spiel.schnellvorlauf(150)')
    page.wait_for_timeout(300)
    pruefe('Zieleinlauf-Meldung mit Name', 'Platz' in page.evaluate("document.querySelector('.hud-banner').textContent")
           and 'Kerle' in page.evaluate("document.querySelector('.hud-banner').textContent"),
           page.evaluate("document.querySelector('.hud-banner').textContent"))
    # Einstellungen werden gespeichert
    gespeichert = page.evaluate('localStorage.getItem(Rennspiel.config.ui.speicherSchluessel)')
    pruefe('Einstellungen in localStorage', gespeichert is not None and 'multivan' in gespeichert, gespeichert)
    pruefe('Fahrer in localStorage', '"fahrer":["Kerle"' in gespeichert, gespeichert)
    # Validierung: kaputte / doppelte Fahrer in localStorage
    page.evaluate('''localStorage.setItem(Rennspiel.config.ui.speicherSchluessel, JSON.stringify({ fahrer: ['Nope', 42] }))''')
    page.reload(); page.wait_for_function('window.Rennspiel && Rennspiel.spiel', timeout=90000)
    pruefe('Ungültige Fahrer -> Standard', page.evaluate('Rennspiel.spiel.einstellungen.fahrer') == ['Jonas', 'Emmy'], page.evaluate('Rennspiel.spiel.einstellungen.fahrer'))
    page.evaluate('''localStorage.setItem(Rennspiel.config.ui.speicherSchluessel, JSON.stringify({ fahrer: ['Sara', 'Sara'] }))''')
    page.reload(); page.wait_for_function('window.Rennspiel && Rennspiel.spiel', timeout=90000)
    f2 = page.evaluate('Rennspiel.spiel.einstellungen.fahrer')
    pruefe('Doppelter Fahrer -> zweiter springt weiter', f2[0] == 'Sara' and f2[1] != 'Sara', f2)
    page.evaluate("Rennspiel.spiel.rennenStarten({ modus: 'zwei', gegner: 1 })")   # fahrer fehlt -> gespeicherte/Standardwerte
    pruefe('rennenStarten ohne fahrer-Angabe', page.evaluate('Rennspiel.spiel.rennen.teilnehmer.map(t => t.name)')[0] == 'Sara')
    pruefe('Keine JS-Fehler', not fehler, fehler)
    print(json.dumps({'ok': all(x['ok'] for x in pruefungen), 'fehler': fehler}, ensure_ascii=False))
    browser.close()
sys.exit(0 if all(x['ok'] for x in pruefungen) and not fehler else 1)
