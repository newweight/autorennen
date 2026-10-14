#!/usr/bin/env python3
"""Brettspiele im Browser (Playwright, headless Chromium): python3 tests/brett_ui_test.py [ausgabeordner]
Startet server/server.js (freier Port) und prüft 4 gewinnt (Schach: eigener Test schach_port_ui_test.py): lokal (zu zweit), gegen Computer (Worker), online (2 Browser-Kontexte:
Raum, Link ?raum=, Züge, Brett dreht für Schwarz, Matt/Gewinn, Revanche mit Farbtausch, Wiederverbinden nach Netzabbruch und Reload), Startseite,
Handy-Größe, Link im Autorennen-Menü. Bilder: tests/out/brett/"""
import sys, os, socket, subprocess, time
from playwright.sync_api import sync_playwright

basis = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
out = sys.argv[1] if len(sys.argv) > 1 else os.path.join(basis, 'tests', 'out', 'brett')
os.makedirs(out, exist_ok=True)
fehlerliste, pruefungen = [], []

def pruefe(name, ok, info=''):
    pruefungen.append(bool(ok))
    print(('OK   ' if ok else 'FAIL ') + name + (' – ' + str(info) if info != '' else ''), flush=True)

s = socket.socket(); s.bind(('127.0.0.1', 0)); port = s.getsockname()[1]; s.close()
srv = subprocess.Popen(['node', os.path.join(basis, 'server', 'server.js'), '--port', str(port), '--host', '127.0.0.1'], stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
for _ in range(60):
    try: socket.create_connection(('127.0.0.1', port), timeout=0.2).close(); break
    except OSError: time.sleep(0.1)
BASIS = 'http://127.0.0.1:%d/' % port

def neue_seite(ctx, url, name):
    pg = ctx.new_page()
    pg.on('pageerror', lambda e: fehlerliste.append(name + ': ' + str(e)))
    pg.on('console', lambda m: fehlerliste.append(name + ' console: ' + m.text) if m.type == 'error' else None)
    pg.goto(url); pg.wait_for_load_state('load')
    return pg

def shot(pg, n): pg.screenshot(path=os.path.join(out, n + '.png'))
def feld(pg, n): return pg.locator('.s-feld[data-sq="%d"]' % n)
def sq(name): return 'abcdefgh'.index(name[0]) + 8 * (int(name[1]) - 1)
def zug(pg, t, umw=None):
    feld(pg, sq(t[:2])).click(); feld(pg, sq(t[2:4])).click()
    if umw: pg.locator('.s-umw [data-u="%d"]' % umw).click()
def status(pg): return pg.locator('#status').inner_text()
def overlay(pg): return pg.locator('.overlay .text').inner_text() if pg.locator('.overlay .text').count() else ''

try:
  with sync_playwright() as p:
    br = p.chromium.launch()
    ctx = br.new_context(viewport={'width': 1280, 'height': 800})

    # ---------- Startseite + Link im Autorennen-Menü ----------
    pg = neue_seite(ctx, BASIS + 'spiele/', 'start')
    pruefe('Startseite: drei Karten (4 gewinnt, Schach, Autorennen)', pg.locator('.karte').count() == 3 and 'Schach' in pg.inner_text('#karten'), pg.locator('.karte').count())
    pruefe('Startseite: Autorennen-Link zeigt auf /', pg.locator('a.karte >> nth=2').get_attribute('href') == '../')
    shot(pg, 'startseite'); pg.close()
    pg = neue_seite(ctx, BASIS, 'autorennen')
    pg.wait_for_selector('.weitere-spiele', timeout=60000)
    pruefe('Autorennen-Hauptmenü hat „Weitere Spiele“', 'Weitere Spiele' in pg.inner_text('.weitere-spiele') and pg.get_attribute('.weitere-spiele', 'href') == 'spiele/')
    shot(pg, 'autorennen_menue')
    pg.click('.weitere-spiele'); pg.wait_for_url('**/spiele/')
    pruefe('Klick führt zur Spiele-Startseite', pg.locator('.karte').count() == 3)
    pg.close()

    # ---------- 4 gewinnt: Swift-Port → eigener Test tests/vier_port_ui_test.py (siehe Ende dieser Datei) ----------

    # ---------- Schach: Swift-Port → eigener Test tests/schach_port_ui_test.py (siehe Ende dieser Datei) ----------

    br.close()
finally:
    srv.terminate()
    try: srv.wait(5)
    except Exception: srv.kill()

r = subprocess.run([sys.executable, os.path.join(basis, 'tests', 'schach_port_ui_test.py')], capture_output=True, text=True)
pruefe('Schach Swift-Port: tests/schach_port_ui_test.py', r.returncode == 0, (r.stdout.strip().splitlines() or ['?'])[-1])

# 4 gewinnt (Swift-Port) hat seinen eigenen UI-Test (eigener Server, eigene Bilder in tests/out/vier_port/)
r = subprocess.run([sys.executable, os.path.join(basis, 'tests', 'vier_port_ui_test.py')], capture_output=True, text=True)
pruefe('4 gewinnt Swift-Port: tests/vier_port_ui_test.py', r.returncode == 0, (r.stdout.strip().splitlines() or ['?'])[-1])

print()
for f in fehlerliste: print('JS-FEHLER:', f)
pruefe('keine JS-Fehler', not fehlerliste, len(fehlerliste))
print('\n%d OK, %d FAIL' % (sum(pruefungen), len(pruefungen) - sum(pruefungen)))
sys.exit(0 if all(pruefungen) else 1)
