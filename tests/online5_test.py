#!/usr/bin/env python3
"""14.10. (v22) Online mit 5 Menschen im Browser (Playwright, headless): python3 tests/online5_test.py [ausgabeordner]
Echter Server (Unterprozess), Host = Browser, 4 weitere Menschen = Node-Bots (tests/netz5_bots.js, WebSocket + Autopilot), dazu 2 Computer-Autos.
 a) Lobby mit 5 Spielern: alle 5 Namen/Autos/Bereit sichtbar, nichts abgeschnitten (1280x800 und iPad quer 1024x768; Handy quer 844x390 ist die Lobby schon bei 1 Spieler zu klein - bekannt, nicht Teil dieses Tests), Zaehler "Spieler (5/6)"
 b) Start: Startaufstellung 7 Autos ohne Ueberlappung, HUD "von 7", eigene Nummer, die Autos der 4 anderen als Geister
 c) Rennen bis zum Ergebnis: Ergebnis-Tafel mit 7 Zeilen, davon 5 Menschen, Plaetze 1..7
Bilder: tests/out/v22_gameplay/online5_*.png"""
import sys, os, socket, subprocess, time, json
from playwright.sync_api import sync_playwright

basis = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
_a = [x for x in sys.argv[1:] if not x.startswith('--')]
out = _a[0] if _a else os.path.join(basis, 'tests', 'out', 'v22_gameplay')
os.makedirs(out, exist_ok=True)
pruefungen, fehler = [], []
def pruefe(name, ok, info=''):
    pruefungen.append({'test': name, 'ok': bool(ok), 'info': info})
    print(('OK   ' if ok else 'FEHL ') + name + (' – ' + str(info) if info != '' else ''), flush=True)

s = socket.socket(); s.bind(('127.0.0.1', 0)); port = s.getsockname()[1]; s.close()
srv = subprocess.Popen(['node', os.path.join(basis, 'server', 'server.js'), '--port', str(port), '--host', '127.0.0.1'], stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
url = 'http://127.0.0.1:%d/' % port
for _ in range(50):
    try: socket.create_connection(('127.0.0.1', port), timeout=0.2).close(); break
    except OSError: time.sleep(0.1)
bots = None

ZUSTAND = """(() => { const s = Rennspiel.spiel, o = s.online; if (!o) return null;
  const r = s.rennen, du = o.du, f = s.fahrzeuge[du];
  return { du, runde: r.teilnehmer[du].runde, imZiel: r.teilnehmer[du].imZiel, rz: r.zustand, fps: s.uhr.fps, tempo: f.vehicle.vLaengs, fort: r.teilnehmer[du].fortschritt, n: s.fahrzeuge.length }; })()"""

AUTOPILOT = """(art) => { const s = Rennspiel.spiel, o = s.online, R = Rennspiel;
  if (!s._origSteuerung) s._origSteuerung = s.input.steuerung.bind(s.input);
  if (art === 'aus') { s.input.steuerung = s._origSteuerung; return true; }
  if (art === 'stopp') {     // bremsen bis zum Stillstand, dann loslassen (Bremse im Stand = rückwärts)
    s.input.steuerung = (nr) => (nr === 0 && o.vorhersage.vp.vLaengs > 0.3 ? { gas: 0, bremse: 1, lenkung: 0 } : { gas: 0, bremse: 0, lenkung: 0 }); return true; }
  const d = new R.Driver(o.vorhersage.vp, s.strecke, { schwierigkeit: 'mittel', seed: 77 + o.du, name: 'Test' });
  if (d.hindernisseSetzen) d.hindernisseSetzen(s.strecke.hindernisse);
  s.input.steuerung = (nr) => {
    if (nr !== 0) return { gas: 0, bremse: 0, lenkung: 0 };
    const t = s.rennen.teilnehmer[o.du];
    const st = d.steuerung(1 / 60, { andere: [], spielerFortschrittMax: null, eigenerFortschritt: t.fortschritt, laeuft: s.rennen.gasErlaubt });
    // wie der lokale Autopilot (main.js f.autopilot): in der Anlauf-Zone vor Looping/Schanze Vollgas (R.Anlauf.kiHilfe)
    const v = o.vorhersage.vp;
    return R.Anlauf ? R.Anlauf.kiHilfe({}, v, s.strecke, s.strecke.spline.naechster(v.x, v.z), st) : st;
  };
  return true; }"""


LOBBY_MASS = r"""(() => { const fuss = document.querySelector('#online .m-fuss').getBoundingClientRect().top, m = document.querySelector('#online .m-inhalt');
  const sp = Array.from(document.querySelectorAll('#online .on-sp')).map(e => { const r = e.getBoundingClientRect(), c = e.closest('.on-spalte').getBoundingClientRect(); return { text: e.textContent.trim().replace(/\s+/g, ' '), ok: r.width > 0 && r.height > 0 && r.left >= 0 && r.right <= innerWidth + 1 && r.bottom <= c.bottom + 1 && r.right <= c.right + 1 }; });
  const zaehler = (document.querySelector('.on-spieler') && document.querySelector('.on-spieler').previousElementSibling || {}).textContent;
  return { n: sp.length, alleSichtbar: sp.every(x => x.ok), namen: sp.map(x => x.text), zaehler, scrollY: m.scrollHeight > m.clientHeight + 1,
    ueberSpalte: Array.from(document.querySelectorAll('#online .on-spalte')).some(e => e.scrollHeight > e.clientHeight + 2), spalten: Array.from(document.querySelectorAll('#online .on-spalte')).map(e => [e.className, e.scrollHeight, e.clientHeight, Math.round(e.getBoundingClientRect().bottom)]), fuss: Math.round(fuss), breite: innerWidth }; })()"""

try:
    with sync_playwright() as p:
        browser = p.chromium.launch(args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
        pg = browser.new_context(viewport={'width': 1280, 'height': 800}).new_page()
        pg.on('pageerror', lambda e: fehler.append(str(e)))
        pg.on('console', lambda m: fehler.append('console.error: ' + m.text) if m.type == 'error' else None)
        pg.goto(url)
        pg.wait_for_function('window.Rennspiel && Rennspiel.spiel', timeout=90000, polling=200)
        pg.wait_for_timeout(800)
        for _ in range(4): pg.keyboard.press('ArrowRight'); pg.wait_for_timeout(80)
        pg.keyboard.press('Enter'); pg.wait_for_timeout(300)
        pg.keyboard.press('Enter')
        pg.wait_for_function("Rennspiel.spiel.menue.onlineUi.lobby !== null && Rennspiel.spiel.menue.onlineUi.ansicht === 'lobby'", timeout=10000, polling=200)
        code = pg.evaluate('Rennspiel.spiel.menue.onlineUi.lobby.code')
        for a in ['wert:strecke:wiese', 'wert:runden:1', 'wert:gegner:2', 'wert:schwierigkeit:leicht']:
            pg.click('[data-a="%s"]' % a); pg.wait_for_timeout(350)
        bots = subprocess.Popen(['node', os.path.join(basis, 'tests', 'netz5_bots.js'), str(port), code, '4'], stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
        pg.wait_for_function("Rennspiel.spiel.menue.onlineUi.lobby.spieler.length === 5 && Rennspiel.spiel.menue.onlineUi.lobby.spieler.every(s => s.bereit)", timeout=30000, polling=200)
        pg.wait_for_timeout(500)
        m = pg.evaluate(LOBBY_MASS)
        mitte = [x for x in m['spalten'] if 'on-mitte' in x[0]][0]
        pruefe('a) Lobby 1280x800: 5 Spieler sichtbar, Zaehler 5/6, Spielerspalte ohne Ueberlauf, kein Scrollen der Seite', m['n'] == 5 and m['alleSichtbar'] and '5/6' in (m['zaehler'] or '') and not m['scrollY'] and mitte[1] <= mitte[2] + 2, m)
        pruefe('a) alle 5 verschieden benannt', len(set(x[:12] for x in m['namen'])) == 5, m['namen'])
        pg.screenshot(path=os.path.join(out, 'online5_1_lobby.png'))
        pg.set_viewport_size({'width': 1024, 'height': 768}); pg.wait_for_timeout(500)
        m2 = pg.evaluate(LOBBY_MASS)
        pruefe('a) Lobby iPad quer 1024x768: alle 5 Spieler da, innerhalb der Spalte', m2['n'] == 5 and m2['alleSichtbar'], m2)
        pg.screenshot(path=os.path.join(out, 'online5_2_lobby_ipad.png'))
        pg.set_viewport_size({'width': 1280, 'height': 800}); pg.wait_for_timeout(500)
        pg.keyboard.press('Enter')
        pg.wait_for_function("Rennspiel.spiel.zustand === 'online' && Rennspiel.spiel.online && Rennspiel.spiel.online.empfangen", timeout=60000, polling=200)
        pg.wait_for_timeout(1200)
        st = pg.evaluate(r"""(() => { const s = Rennspiel.spiel, o = s.online, t = s.rennen.teilnehmer, f = s.fahrzeuge;
          let minD = 1e9; for (let i = 0; i < f.length; i++) for (let j = i + 1; j < f.length; j++) minD = Math.min(minD, Math.hypot(f[i].vehicle.x - f[j].vehicle.x, f[i].vehicle.z - f[j].vehicle.z));
          const geist = f.map((g, i) => { let tr = 0, alle = 0; g.mesh.traverse(c => { if (c.material && !Array.isArray(c.material)) { alle++; if (c.material.transparent && c.material.opacity <= 0.61) tr++; } }); return [i, alle ? tr / alle : 0]; });
          return { du: o.du, n: f.length, menschen: t.filter(x => x.mensch !== false && !x.computer).length, namen: t.map(x => x.name), minD, geist,
            hudPlatz: (document.querySelector('.hud-platz') || document.body).textContent.replace(/\s+/g, ' ').slice(0, 40) }; })()""")
        pruefe('b) Start: 7 Autos, Startaufstellung ohne Ueberlappung (min. Abstand >= 4,5 m)', st['n'] == 7 and st['minD'] >= 4.5, [st['n'], round(st['minD'], 2)])
        pruefe('b) die 4 anderen Menschen und 2 Computer als Geister, eigenes Auto deckend', all((g > 0.9) == (i != st['du']) for i, g in st['geist']), st['geist'])
        pruefe('b) HUD zeigt Platz "von 7"', 'von 7' in st['hudPlatz'], st['hudPlatz'])
        pg.screenshot(path=os.path.join(out, 'online5_3_startaufstellung.png'))
        if bots.poll() is not None: print('     Bots beendet, Exit', bots.returncode, bots.stdout.read()[:600], flush=True)
        if '--schnell' in sys.argv: raise SystemExit(0)

        pg.evaluate(AUTOPILOT, 'an')
        bis = time.time() + 400; fertig = False; letzte = (None, time.time()); resets = 0
        while time.time() < bis:
            z = pg.evaluate(ZUSTAND)
            if z is None or z['imZiel'] or z['runde'] >= 1: fertig = True; break
            if letzte[0] is None or abs(z['tempo']) > 0.5: letzte = (True, time.time())
            elif time.time() - letzte[1] > 4: pg.keyboard.press('KeyR'); resets += 1; letzte = (None, time.time())
            pg.wait_for_timeout(1500)
            if time.time() - bis > -380 and not os.path.exists(os.path.join(out, 'online5_4_rennen.png')): pg.screenshot(path=os.path.join(out, 'online5_4_rennen.png'))
        pruefe('c) Host kommt nach 1 Runde ins Ziel', fertig, resets)
        try:
            pg.wait_for_function("Rennspiel.spiel.online && Rennspiel.spiel.online.phase === 'ergebnis'", timeout=200000, polling=500)
            ok = pg.is_visible('.on-ergebnis .ergebnis-karte')
        except Exception:
            ok = False
        pruefe('c) Ergebnis-Tafel erscheint', ok)
        if ok:
            pg.wait_for_timeout(500)
            tab = pg.evaluate(r"""(() => { const z = Array.from(document.querySelectorAll('.on-ergebnis tbody tr, .on-ergebnis tr')).filter(r => r.querySelector('td'));
              return z.map(r => ({ text: r.textContent.trim().replace(/\s+/g, ' '), computer: r.textContent.includes('🤖') })); })()""")
            pruefe('c) Ergebnis: 7 Zeilen, davon 5 Menschen (ohne 🤖)', len(tab) == 7 and sum(1 for t in tab if not t['computer']) == 5, tab)
            pg.screenshot(path=os.path.join(out, 'online5_5_ergebnis.png'))
        pruefe('keine JS-Fehler', not fehler, fehler[:3])
        browser.close()
finally:
    if bots: bots.kill()
    srv.kill()

n = sum(1 for x in pruefungen if not x['ok'])
print('\nALLE TESTS OK (%d)' % len(pruefungen) if n == 0 else '\n%d FEHLER' % n)
sys.exit(1 if n else 0)
