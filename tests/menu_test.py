#!/usr/bin/env python3
"""Menü-/Modus-Test (Playwright, headless Chromium):
a) Menü-Screenshot, b) per Tastatur: zu zweit, Strecke, Autos (P1 Porsche, P2 Multivan), Runden 1, Gegner 2, Start
   -> Split-Screen-Screenshot, c) Autopilot für beide, Schnellvorlauf bis 'ergebnis' -> Ergebnis-Screenshot + Prüfung,
d) Enter = Nochmal, Esc = Pause, Weiter, Hauptmenü, keine JS-Fehler, Draw-Calls im Split-Screen < 80.
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
    # a) Menü
    pruefe('Start im Menü', zustand() == 'menue')
    snap('menu_1_modus.png')
    # b) Tastatur: Modus zu zweit
    taste('ArrowRight'); snap('menu_1b_modus_zwei.png')
    pruefe('Modus zu zweit', page.evaluate('Rennspiel.spiel.einstellungen.modus') == 'zwei')
    taste('Enter'); page.wait_for_timeout(200); snap('menu_2_strecke.png')
    karten = page.evaluate("Array.from(document.querySelectorAll('.karte.strecke')).map(k => k.dataset.a)")
    pruefe('Streckenwahl: 3 Karten (Wiese, Wald, Wüste)', karten == ['strecke:wiese', 'strecke:wald', 'strecke:wueste'], karten)
    # Durchblättern: Menü-Hintergrund baut jede Strecke auf (Deko/Thema ohne Fehler)
    for _ in range(2): taste('ArrowRight'); page.wait_for_timeout(400)
    pruefe('Streckenwahl: Wüste per Pfeiltaste', page.evaluate('Rennspiel.spiel.einstellungen.streckeId') == 'wueste')
    snap('menu_2b_strecke_wueste.png')
    for _ in range(2): taste('ArrowLeft'); page.wait_for_timeout(300)
    taste('Enter'); page.wait_for_timeout(200)
    # Autos: P1 (Pfeile) auf Porsche (Index 3), P2 (WASD) auf Multivan (Index 1)
    ids = page.evaluate('Rennspiel.carCatalog.map(a => a.id)')
    def cursor(sp): return ids.index(page.evaluate(f'Rennspiel.spiel.einstellungen.autoIds[{sp}]'))
    while cursor(0) != ids.index('porsche-911'): taste('ArrowRight')
    while cursor(1) != ids.index('multivan'): taste('KeyD' if cursor(1) < ids.index('multivan') else 'KeyA')
    # P1 und P2 unabhängig bewegen
    snap('menu_3_autos_zwei.png')
    pruefe('Autos P1 Porsche, P2 Multivan', page.evaluate('Rennspiel.spiel.einstellungen.autoIds').__eq__(['porsche-911', 'multivan']))
    taste('Enter'); page.wait_for_timeout(200)
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
    pruefe('Draw-Calls im Split-Screen < 80', info['calls'] < 80, info['calls'])
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
    pruefe('Ergebnis: Spieler 1 und Spieler 2 vorhanden', 'Spieler 1' in namen and 'Spieler 2' in namen, namen)
    def sek(t):
        try: m, s = t.split(':'); return int(m) * 60 + float(s)
        except Exception: return 0
    spieler_zeilen = [z for z in zeilen if z[1].startswith('Spieler')]
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
    page.click('[data-a="auto:0:bmw-m4"]'); page.wait_for_timeout(150)
    snap('menu_11_autos_solo.png')
    page.click('[data-a="weiter"]'); page.wait_for_timeout(150)
    snap('menu_12_einstellungen_solo.png')
    page.click('[data-a="start"]')
    page.wait_for_function('Rennspiel.spiel.zustand === "rennen"', timeout=15000)
    pruefe('Maus: Solo-Rennen gestartet', page.evaluate('Rennspiel.spiel.kameras.length') == 1 and page.evaluate('Rennspiel.spiel.fahrzeuge[0].auto.id') == 'bmw-m4')
    page.wait_for_function('Rennspiel.spiel.rennen.zustand === "laeuft"', timeout=20000)
    page.wait_for_timeout(1500); snap('menu_13_solo_hud.png')
    # HUD-Hinweise: "Falsch herum!" und Rundenmeldungen
    page.evaluate("Rennspiel.spiel.fahrzeuge[0].vehicle.heading += Math.PI")
    page.wait_for_timeout(2500)
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
    pruefe('Meldungen "Runde 2!" und "Letzte Runde!"', banner == ['Runde 2!', 'Letzte Runde!'], banner)
    page.evaluate('Rennspiel.spiel.schnellvorlauf(150)')
    page.wait_for_timeout(300)
    pruefe('Zieleinlauf-Meldung', 'Platz' in page.evaluate("document.querySelector('.hud-banner').textContent"),
           page.evaluate("document.querySelector('.hud-banner').textContent"))
    # Einstellungen werden gespeichert
    gespeichert = page.evaluate('localStorage.getItem(Rennspiel.config.ui.speicherSchluessel)')
    pruefe('Einstellungen in localStorage', gespeichert is not None and 'multivan' in gespeichert, gespeichert)
    pruefe('Keine JS-Fehler', not fehler, fehler)
    print(json.dumps({'ok': all(x['ok'] for x in pruefungen), 'fehler': fehler}, ensure_ascii=False))
    browser.close()
sys.exit(0 if all(x['ok'] for x in pruefungen) and not fehler else 1)
