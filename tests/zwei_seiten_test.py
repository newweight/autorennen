#!/usr/bin/env python3
"""v31 H2+H3 Browser: Zweispieler, Fahrernamen, Tastendruck -> welche Hälfte reagiert; Spiegel je Hälfte; Bilder tests/out/v31/zwei_*.png"""
import os, sys
from playwright.sync_api import sync_playwright
basis = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
url = 'file://' + os.path.join(basis, 'Autorennen.html')
out = os.path.join(basis, 'tests', 'out', 'v31'); os.makedirs(out, exist_ok=True)
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
fehl = 0
def ok(n, b, i=''):
    global fehl
    if not b: fehl += 1
    print(('OK   ' if b else 'FEHL ') + n + (' – ' + str(i) if i != '' else ''), flush=True)
with sync_playwright() as p:
    b = p.chromium.launch(args=ARGS)
    pg = b.new_page(viewport={'width': 1280, 'height': 720})
    err = []; pg.on('pageerror', lambda e: err.append(str(e)))
    pg.on('console', lambda m: err.append(m.text) if m.type == 'error' else None)
    pg.goto(url); pg.wait_for_function('window.Rennspiel && Rennspiel.spiel'); pg.wait_for_timeout(800)
    pg.evaluate("""() => Rennspiel.spiel.rennenStarten({ modus: 'zwei', streckeId: 'wiese', autoIds: ['passat','porsche-911'], fahrer: ['Mia','Jonas'], runden: 3, gegner: 2, schwierigkeit: 'mittel', fahrhilfe: ['wenig','wenig'], wetter: 'sonne', jahreszeit: 'sommer' })""")
    pg.wait_for_timeout(600)
    h = pg.evaluate("() => Rennspiel.spiel.huds.map(h => [h.nr, h.seite, h.el.className, h.el.getBoundingClientRect().left])")
    print(h)
    ok('HUD Spieler 1 (WASD, Index 1) links', h[1][2].split()[-1] == 'links' and h[1][3] < 10, h[1])
    ok('HUD Spieler 0 (Pfeile) rechts', h[0][2].split()[-1] == 'rechts' and h[0][3] > 600, h[0])
    txt = pg.evaluate("() => Array.from(document.querySelectorAll('.hud-hinweis')).map(e => e.textContent)")
    ok('Countdown-Hinweis', all('WASD' in t for t in txt), txt)
    pg.screenshot(path=os.path.join(out, 'zwei_countdown.png'))
    # Fahrzeuge vorwärts, Kamera Cockpit
    pg.evaluate("() => Rennspiel.spiel.schnellvorlauf(8)")
    pg.evaluate("() => { const s = Rennspiel.spiel; s.fahrzeuge.forEach((f,i) => { if (i < 2) f.vehicle.vLaengs = 0; }); }")
    pg.wait_for_timeout(1500)
    pg.evaluate("() => Rennspiel.spiel.fahrzeuge.slice(0,2).forEach(f => { f.vehicle.vLaengs = 0; })")
    pg.wait_for_timeout(300)
    ST = """() => { const s = Rennspiel.spiel, hl = s.huds.find(h => h.el.classList.contains('links')), hr = s.huds.find(h => h.el.classList.contains('rechts'));
      return { links: s.input.steuerung(hl.f.spielerNr).gas, rechts: s.input.steuerung(hr.f.spielerNr).gas, nrL: hl.f.spielerNr, nrR: hr.f.spielerNr }; }"""
    pg.keyboard.down('KeyW'); pg.wait_for_timeout(300)
    st = pg.evaluate(ST); pg.keyboard.up('KeyW')
    ok('W steuert das Auto der LINKEN Hälfte (nicht das rechte)', st['links'] == 1 and st['rechts'] == 0, st)
    pg.keyboard.down('ArrowUp'); pg.wait_for_timeout(300)
    st = pg.evaluate(ST); pg.keyboard.up('ArrowUp')
    ok('Pfeil hoch steuert das Auto der RECHTEN Hälfte (nicht das linke)', st['rechts'] == 1 and st['links'] == 0, st)
    # echte Fahrt: Spieler links gibt Gas, Auto links legt deutlich mehr zurück
    pg.evaluate("() => Rennspiel.spiel.fahrzeuge.slice(0,2).forEach(f => { f.vehicle.vLaengs = 0; })")
    pg.keyboard.down('KeyW'); pg.wait_for_timeout(3000)
    pg.screenshot(path=os.path.join(out, 'zwei_wasd_links.png'))
    v = pg.evaluate("() => Rennspiel.spiel.fahrzeuge.slice(0,2).map(f => f.vehicle.vLaengs)")
    pg.keyboard.up('KeyW')
    ok('W: Spieler 1 (links) schneller als Spieler 0', v[1] > v[0] + 1, v)
    # Spiegel: sichtbar je Hälfte, Verfolger + Cockpit
    for modus in ('verfolger', 'cockpit'):
        pg.evaluate("(m) => { const s = Rennspiel.spiel; s.kameras.forEach(k => { k.modusIndex = Rennspiel.config.kamera.modi.indexOf(m); k._erstesMal = true; }); s.fahrzeuge.slice(0,2).forEach(f => { f.vehicle.vLaengs = 25; }); }", modus)
        pg.wait_for_timeout(2500)
        sb = pg.evaluate("() => [0,1].map(i => Rennspiel.rueckspiegel.sichtbar(Rennspiel.spiel, i))")
        ok(f'Spiegel sichtbar beide Hälften ({modus})', all(sb), sb)
        pg.screenshot(path=os.path.join(out, f'zwei_spiegel_{modus}.png'))
    ok('keine JS-Fehler', not err, err[:3])
    b.close()
sys.exit(1 if fehl else 0)
