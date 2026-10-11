#!/usr/bin/env python3
"""Menü-/Modus-Test (Playwright, headless Chromium):
a) Menü-Screenshot, b) per Tastatur: zu zweit, Strecke, Fahrer (P1 Senna, P2 versucht Senna -> springt weiter), Autos (P1 Porsche, P2 Multivan), Runden 1, Gegner 2, Start
   -> Split-Screen-Screenshot, c) Autopilot für beide, Schnellvorlauf bis 'ergebnis' -> Ergebnis-Screenshot + Prüfung,
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
    page.on('pageerror', lambda e: fehler.append(str(e)))
    page.on('console', lambda m: fehler.append('console.error: ' + m.text) if m.type == 'error' else None)
    page.goto(url)
    page.wait_for_function('window.Rennspiel && Rennspiel.spiel', timeout=15000)
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
        n_auto = len(page.evaluate('Rennspiel.carCatalog'))
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
    # b) Tastatur: Modus zu zweit
    taste('ArrowRight'); snap('menu_1b_modus_zwei.png')
    pruefe('Modus zu zweit', page.evaluate('Rennspiel.spiel.einstellungen.modus') == 'zwei')
    taste('Enter'); page.wait_for_timeout(200); snap('menu_2_strecke.png')
    karten = page.evaluate("Array.from(document.querySelectorAll('.karte.strecke')).map(k => k.dataset.a)")
    pruefe('Streckenwahl: 4 Karten (Wiese, Wald, Wüste, Fantasie)', karten == ['strecke:wiese', 'strecke:wald', 'strecke:wueste', 'strecke:fantasie'], karten)
    # 4 Karten in EINER Reihe (gleiches offsetTop), im Bild, ohne Überlappung – bei 1280×800 und 1440×900
    LAGE = """(() => { const k = Array.from(document.querySelectorAll('.karte.strecke')), r = k.map(e => e.getBoundingClientRect());
      return { gleicheReihe: new Set(k.map(e => e.offsetTop)).size === 1,
        ok: r.every(a => a.left >= 0 && a.right <= innerWidth && a.bottom <= innerHeight) &&
        r.every((a, i) => r.every((b, j) => i === j || a.right <= b.left + 1 || b.right <= a.left + 1)),
        pillen: k.map(e => !!e.querySelector('.s-pille')), pilleText: k.map(e => e.querySelector('.s-pille') && e.querySelector('.s-pille').textContent),
        hinweis: (k[3].querySelector('.strecken-hinweis') || {}).textContent || '',
        farbe3: getComputedStyle(k[3]).backgroundColor, farbe0: getComputedStyle(k[0]).backgroundColor,
        scroll: document.querySelector('.m-inhalt').scrollHeight <= document.querySelector('.m-inhalt').clientHeight + 1,
        breiten: r.map(a => Math.round(a.width)) }; })()"""
    for vw, vh in ((1280, 800), (1440, 900)):
        page.set_viewport_size({'width': vw, 'height': vh}); page.wait_for_timeout(400)
        lage = page.evaluate(LAGE)
        pruefe(f'Streckenwahl {vw}×{vh}: 4 Karten in einer Reihe (gleiches offsetTop), im Bild, ohne Überlappung', lage['gleicheReihe'] and lage['ok'] and lage['scroll'], lage)
        snap(f'menu_2_strecke_{vw}.png')
    pruefe('Streckenkarten: Schwierigkeits-Pillen leicht/mittel/schnell/spaß', lage['pilleText'] == ['leicht', 'mittel', 'schnell', 'spaß'], lage['pilleText'])
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
    for _ in range(3): taste('ArrowLeft'); page.wait_for_timeout(300)
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
    ids = page.evaluate('Rennspiel.carCatalog.map(a => a.id)')
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
    for _ in range(8):
        if zustand() != 'menue': break
        taste('Enter'); page.wait_for_timeout(100)
    page.wait_for_function('Rennspiel.spiel.zustand === "rennen"', timeout=15000)
    pruefe('Rennen gestartet (zwei Spieler + 2 Computer)', page.evaluate('Rennspiel.spiel.fahrzeuge.length') == 4)
    hudnamen = page.evaluate("Array.from(document.querySelectorAll('.hud-name')).map(e => e.textContent)")
    pruefe('HUD-Kopf zeigt Fahrernamen', len(hudnamen) == 2 and 'Senna' in hudnamen[0] and 'Verstappen' in hudnamen[1], hudnamen)
    page.wait_for_timeout(1500)
    snap('menu_5_splitscreen_countdown.png')
    page.keyboard.down('ArrowUp'); page.keyboard.down('KeyW')
    page.wait_for_function('Rennspiel.spiel.rennen.zustand === "laeuft"', timeout=20000)
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
    pruefe('Draw-Calls im Split-Screen < 120', info['calls'] < 120, info['calls'])
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
    namen = [z[1] for z in zeilen]
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
    # eingefroren: weiter fahren ändert die Tabelle nicht
    page.evaluate('Rennspiel.spiel.schnellvorlauf(30)')
    zeilen2 = page.evaluate('''Array.from(document.querySelectorAll('#ergebnis tbody tr')).map(tr => Array.from(tr.children).map(td => td.textContent.trim()))''')
    pruefe('Ergebnis eingefroren', zeilen == zeilen2)

    # d) Enter = Nochmal
    taste('Enter')
    page.wait_for_function('Rennspiel.spiel.zustand === "rennen"', timeout=5000)
    page.wait_for_timeout(1200)
    cd = page.evaluate('Rennspiel.spiel.rennen.zustand')
    pruefe('Nochmal: neues Rennen mit Countdown', cd == 'countdown', cd)
    speicher1 = page.evaluate('(() => { const m = Rennspiel.spiel.renderer.info.memory; return [m.geometries, m.textures]; })()')
    pruefe('Aufräumen: Geometrien/Texturen wachsen nicht', speicher1[0] <= speicher0[0] + 2 and speicher1[1] <= speicher0[1] + 1, [speicher0, speicher1])
    snap('menu_8_nochmal_countdown.png')
    page.wait_for_function('Rennspiel.spiel.rennen.zustand === "laeuft"', timeout=20000)
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
    # Maus im Menü: Solo wählen, bis Start klicken
    page.click('[data-a="modus:solo"]'); page.wait_for_timeout(150)
    page.click('[data-a="strecke:wiese"]'); page.wait_for_timeout(150)
    page.click('[data-a="fahrer:0:Kerle"]'); page.wait_for_timeout(150)
    snap('menu_10b_fahrer_solo.png')
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
    page.wait_for_function('Rennspiel.spiel.zustand === "rennen"', timeout=15000)
    pruefe('Maus: Solo-Rennen gestartet', page.evaluate('Rennspiel.spiel.kameras.length') == 1 and page.evaluate('Rennspiel.spiel.fahrzeuge[0].auto.id') == 'bmw-m4')
    page.wait_for_function('Rennspiel.spiel.rennen.zustand === "laeuft"', timeout=20000)
    page.wait_for_timeout(1500); snap('menu_13_solo_hud.png')
    pruefe('Solo-HUD zeigt Fahrername Kerle', 'Kerle' in page.evaluate("document.querySelector('.hud-name').textContent"))
    # HUD-Hinweise: "Falsch herum!" und Rundenmeldungen
    page.evaluate("Rennspiel.spiel.fahrzeuge[0].vehicle.heading += Math.PI")
    # Spielzeit läuft unter Software-Grafik langsamer als Echtzeit → auf den Hinweis warten statt fester Pause
    try: page.wait_for_function("document.querySelector('.hud-hinweis').textContent.includes('Falsch herum')", timeout=20000)
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
    page.reload(); page.wait_for_function('window.Rennspiel && Rennspiel.spiel', timeout=15000)
    pruefe('Ungültige Fahrer -> Standard', page.evaluate('Rennspiel.spiel.einstellungen.fahrer') == ['Jonas', 'Emmy'], page.evaluate('Rennspiel.spiel.einstellungen.fahrer'))
    page.evaluate('''localStorage.setItem(Rennspiel.config.ui.speicherSchluessel, JSON.stringify({ fahrer: ['Sara', 'Sara'] }))''')
    page.reload(); page.wait_for_function('window.Rennspiel && Rennspiel.spiel', timeout=15000)
    f2 = page.evaluate('Rennspiel.spiel.einstellungen.fahrer')
    pruefe('Doppelter Fahrer -> zweiter springt weiter', f2[0] == 'Sara' and f2[1] != 'Sara', f2)
    page.evaluate("Rennspiel.spiel.rennenStarten({ modus: 'zwei', gegner: 1 })")   # fahrer fehlt -> gespeicherte/Standardwerte
    pruefe('rennenStarten ohne fahrer-Angabe', page.evaluate('Rennspiel.spiel.rennen.teilnehmer.map(t => t.name)')[0] == 'Sara')
    pruefe('Keine JS-Fehler', not fehler, fehler)
    print(json.dumps({'ok': all(x['ok'] for x in pruefungen), 'fehler': fehler}, ensure_ascii=False))
    browser.close()
sys.exit(0 if all(x['ok'] for x in pruefungen) and not fehler else 1)
