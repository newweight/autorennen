#!/usr/bin/env python3
"""v28 W1: Online-Lobby Krankenwagen / Abschleppwagen je einzeln (Playwright + echter Server): python3 tests/online_verkehr_test.py
Host erstellt Raum; Zeilen „🚑 Krankenwagen“ und „🛻 Abschleppwagen“ (Aus/An, Standard aus); Klick setzt je EINEN Schalter, der Server übernimmt ihn
(Protokoll einstellungen.krankenwagen/abschleppwagen, `verkehr` abgeleitet); Lobby-Layout 1280×800 ohne Scrollen; keine JS-Fehler."""
import sys, os, socket, subprocess, time
from playwright.sync_api import sync_playwright
basis = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
out = os.path.join(basis, 'tests', 'out', 'v28'); os.makedirs(out, exist_ok=True)
fehler = []
def pruefe(name, ok, info=''):
    print(('OK   ' if ok else 'FAIL ') + name + (' – ' + str(info) if info != '' else ''), flush=True)
    if not ok: fehler.append(name)
s = socket.socket(); s.bind(('127.0.0.1', 0)); port = s.getsockname()[1]; s.close()
srv = subprocess.Popen(['node', os.path.join(basis, 'server', 'server.js'), '--port', str(port), '--host', '127.0.0.1'], stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
url = 'http://127.0.0.1:%d/' % port
for _ in range(50):
    try: socket.create_connection(('127.0.0.1', port), timeout=0.2).close(); break
    except OSError: time.sleep(0.1)
LOBBY = "(() => { const L = Rennspiel.spiel.menue.onlineUi.lobby.einstellungen; return { k: L.krankenwagen, a: L.abschleppwagen, v: L.verkehr, g: L.geisterfahrer }; })()"
try:
    with sync_playwright() as p:
        b = p.chromium.launch(args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
        pg = b.new_context(viewport={'width': 1280, 'height': 800}).new_page()
        pg.on('pageerror', lambda e: fehler.append('pageerror ' + str(e)))
        pg.on('console', lambda m: fehler.append('console.error: ' + m.text) if m.type == 'error' else None)
        pg.goto(url); pg.wait_for_function('window.Rennspiel && Rennspiel.spiel', timeout=90000, polling=200); pg.wait_for_timeout(800)
        for _ in range(4): pg.keyboard.press('ArrowRight'); pg.wait_for_timeout(80)
        pg.keyboard.press('Enter'); pg.wait_for_timeout(600)
        pg.keyboard.press('Enter')
        pg.wait_for_function("Rennspiel.spiel.menue.onlineUi.lobby !== null && Rennspiel.spiel.menue.onlineUi.ansicht === 'lobby'", timeout=15000, polling=200)
        pg.wait_for_timeout(500)
        L = pg.evaluate(LOBBY)
        pruefe('Lobby: Standard Krankenwagen + Abschleppwagen aus', L['k'] is False and L['a'] is False and L['v'] == 'aus', L)
        z = pg.evaluate("Array.from(document.querySelectorAll('#online .on-zeile')).map(e => e.querySelector('.on-label').textContent.trim())")
        sw = pg.evaluate("Array.from(document.querySelectorAll('#online [data-a^=\"wert:krankenwagen:\"], #online [data-a^=\"wert:abschleppwagen:\"], #online [data-a^=\"wert:geisterfahrer:\"], #online [data-a^=\"wert:verkehr:\"]')).map(e => e.dataset.a)")
        pruefe('Lobby: Zeile „Verkehr“ mit drei Schaltern (Geisterfahrer, Krankenwagen, Abschleppwagen), kein Aus/Wenig/Viel mehr', sw == ['wert:geisterfahrer:an', 'wert:krankenwagen:an', 'wert:abschleppwagen:an'], sw)
        pg.click('#online [data-a="wert:krankenwagen:an"]'); pg.wait_for_timeout(500)
        L = pg.evaluate(LOBBY)
        pruefe('Klick Krankenwagen An: Server meldet krankenwagen an, abschleppwagen aus, verkehr „wenig“', L['k'] is True and L['a'] is False and L['v'] == 'wenig', L)
        pg.click('#online [data-a="wert:abschleppwagen:an"]'); pg.wait_for_timeout(500)
        L = pg.evaluate(LOBBY)
        pruefe('Klick Abschleppwagen An: beide an', L['k'] is True and L['a'] is True, L)
        pg.click('#online [data-a="wert:krankenwagen:aus"]'); pg.wait_for_timeout(500)      # Schalter steht auf „an“ → Klick schaltet aus
        L = pg.evaluate(LOBBY)
        pruefe('Klick Krankenwagen Aus: Abschleppwagen bleibt an', L['k'] is False and L['a'] is True and L['v'] == 'wenig', L)
        akt = pg.evaluate("Array.from(document.querySelectorAll('#online .pille.aktiv')).map(e => e.textContent.trim())")
        pruefe('Anzeige folgt dem Server (🛻 aktiv, 🚑 nicht)', any('🛻' in x for x in akt) and not any('🚑' in x for x in akt), akt)
        lay = pg.evaluate("""(() => { const m = document.querySelector('#online .m-inhalt'), fuss = document.querySelector('#online .m-fuss').getBoundingClientRect().top;
          const sp = Array.from(document.querySelectorAll('#online .on-spalte')).map(e => e.getBoundingClientRect());
          return { scroll: m.scrollHeight <= m.clientHeight + 1, innen: sp.every(a => a.left >= 0 && a.right <= innerWidth && a.top >= 0 && a.bottom <= fuss + 2),
                   ueber: Array.from(document.querySelectorAll('#online .on-spalte')).some(e => e.scrollHeight > e.clientHeight + 2), h: [m.scrollHeight, m.clientHeight] }; })()""")
        hs = pg.evaluate("Array.from(document.querySelectorAll('#online .on-spalte')).map(e => e.scrollHeight)")
        pruefe('Lobby 1280×800: nicht höher als vorher (v27: rechte Spalte 788 px = Alt-Fehler, die Spalte läuft über; v28: eine Zeile „Verkehr“ statt zwei → 742)', max(hs) <= 788 and lay['scroll'] and lay['innen'], [hs, lay])
        pg.screenshot(path=os.path.join(out, 'online_verkehr_lobby.png'))
        b.close()
finally:
    srv.terminate()
pruefe('keine JS-Fehler', not [f for f in fehler if 'pageerror' in f or 'console.error' in f], [f for f in fehler if 'pageerror' in f or 'console.error' in f][:3])
print('%d Fehler' % len(fehler)); sys.exit(1 if fehler else 0)
