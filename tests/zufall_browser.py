#!/usr/bin/env python3
"""Browser-Lauf Z1 (Zufällige Strecke): python3 tests/zufall_browser.py
Je Spiel (Autorennen, Motorrad) ein kurzer Lauf über 2 Runden im Zeitraffer (physikSchritt ohne Zeichnen, Computerfahrer fahren):
  - Zufall AN: Lage der Hindernisse und Münzen in Runde 2 ≠ Runde 1, zwei Rennen mit verschiedenem Seed liegen verschieden, kein Konsolenfehler,
    Neuverteilung dauert kurz (kein Ruckler), Strecken-/Hindernis-Gruppe wird getauscht (nicht verdoppelt), KI kennt die neue Liste.
  - Zufall AUS: Lage in jeder Runde und in jedem Rennen unverändert (altes Verhalten).
Screenshots nach tests/bilder_zufall/."""
import os, sys, time, socket, subprocess, json
from playwright.sync_api import sync_playwright

basis = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
out = os.path.join(basis, 'tests', 'bilder_zufall'); os.makedirs(out, exist_ok=True)
s = socket.socket(); s.bind(('127.0.0.1', 0)); port = s.getsockname()[1]; s.close()
server = subprocess.Popen([sys.executable, '-m', 'http.server', str(port), '--bind', '127.0.0.1'], cwd=basis, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1.0)
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
res = []; fehler = []
def pruefe(n, ok, info=''):
    res.append(bool(ok)); print(('OK   ' if ok else 'FEHL ') + n + (f'  ({info})' if info != '' else ''))
def bild(page, name):
    for v in range(2):
        try: page.screenshot(path=os.path.join(out, name), timeout=60000); print('      Bild: tests/bilder_zufall/' + name); return
        except Exception as e:
            if v == 1: print('      Bild ausgelassen (Timeout): ' + name)
            page.wait_for_timeout(1500)

# Rennen starten, bis zur Freigabe laufen lassen; liefert Kennzahlen
START = """(a) => { const s = Rennspiel.spiel;
  s.rennenStarten(Object.assign({ modus: 'solo', streckeId: a.strecke, welt: a.welt || '', autoIds: [a.auto, a.auto], runden: 3, gegner: 3, schwierigkeit: 'mittel', fahrhilfe: ['wenig', 'wenig'], zufall: a.zufall }, a.extra || {}));
  let g = 0; while ((s.zustand !== 'rennen' || !s.rennen.gasErlaubt) && g++ < 3000) s.physikSchritt(1 / 60);
  return { zustand: s.zustand, seed: s.zufallSeed, zufall: !!(s.strecke && s.strecke.zufall), gruppen: s.scene ? 0 : (s.szene.children.filter(c => c.name === 'Strecke Hindernisse').length) }; }"""
# Lage: Hindernisse (Typ, s auf 0,5 m) + Münzen (gerundet)
LAGE = """() => { const s = Rennspiel.spiel, st = s.strecke;
  return { h: st.hindernisse.filter(h => !h.dynamisch).map(h => h.typ + '@' + Math.round(h.s * 2) / 2), m: s.muenzen ? s.muenzen.liste.map(m => Math.round(m.s)) : [],
    runde: st.zufall ? st.zufall.runde : 0, version: st.zufallVersion || 0, hg: s.szene.children.filter(c => c.name === 'Strecke Hindernisse').length }; }"""
# Zeitraffer bis Führender in Runde r ist (oder Schrittgrenze); misst die längste Neuverteilung
LAUF = """(r) => { const s = Rennspiel.spiel, st = s.strecke; let n = 0, max = 0, ev = 0, v0 = st.zufallVersion || 0;
  const t0 = performance.now();
  while (n++ < 40000) {
    const a = performance.now(); s.physikSchritt(1 / 60); const d = performance.now() - a;
    if ((st.zufallVersion || 0) !== v0) { v0 = st.zufallVersion; ev++; if (d > max) max = d; }
    const f = Math.max.apply(null, s.rennen.teilnehmer.map(t => t.fortschritt));
    if (Math.floor(f / st.laenge) + 1 >= r) break;
  }
  return { schritte: n, ereignisse: ev, maxMs: Math.round(max * 10) / 10, gesamtMs: Math.round(performance.now() - t0) }; }"""
KI = """() => { const s = Rennspiel.spiel, st = s.strecke; const ds = s.fahrzeuge.map(f => f.driver).filter(d => d && d.streckenHindernisse); const soll = st.hindernisse.filter(h => h && h.s0 !== undefined && h.s1 !== undefined);
  return { ki: ds.length, gleich: ds.every(d => d.streckenHindernisse.length === soll.length && d.streckenHindernisse.every((h, i) => h === soll[i])) }; }"""

def spiel_lauf(page, titel, strecke, welt, auto, extra=None):
    print(f'\n== {titel} ==')
    r = page.evaluate(START, {'strecke': strecke, 'welt': welt, 'auto': auto, 'zufall': True, 'extra': extra})
    pruefe(f'{titel}: Rennen startet, Zufall aktiv, Seed gesetzt', r['zustand'] == 'rennen' and r['zufall'] and isinstance(r['seed'], int), str(r))
    l1 = page.evaluate(LAGE)
    bild(page, f'{titel}_runde1.png')
    lauf = page.evaluate(LAUF, 2)
    l2 = page.evaluate(LAGE)
    pruefe(f'{titel}: Runde 2 erreicht, Neuverteilung gelaufen', l2['runde'] == 2 and lauf['ereignisse'] >= 1, str(lauf))
    pruefe(f'{titel}: Hindernisse Runde 2 ≠ Runde 1', l1['h'] != l2['h'] and len(l1['h']) == len(l2['h']), f"{len(l1['h'])} Hindernisse")
    if l1['m']: pruefe(f'{titel}: Münzen Runde 2 ≠ Runde 1 (Anzahl gleich)', l1['m'] != l2['m'] and len(l1['m']) == len(l2['m']), f"{len(l1['m'])} Münzen")
    pruefe(f'{titel}: Hindernis-Gruppe genau einmal in der Szene', l1['hg'] == 1 and l2['hg'] == 1, f"{l1['hg']}/{l2['hg']}")
    pruefe(f'{titel}: Neuverteilung ohne Ruckler (längster Schritt mit Ereignis < 120 ms)', lauf['maxMs'] < 120, f"{lauf['maxMs']} ms")
    k = page.evaluate(KI)
    pruefe(f'{titel}: KI kennt die aktuelle Hindernis-Liste', k['ki'] == 0 or k['gleich'], str(k))
    page.evaluate('() => Rennspiel.spiel.zeichnen && Rennspiel.spiel.zeichnen()')
    bild(page, f'{titel}_runde2.png')
    # zweites Rennen mit anderem Seed
    r2 = page.evaluate(START, {'strecke': strecke, 'welt': welt, 'auto': auto, 'zufall': True, 'extra': extra})
    m1 = page.evaluate(LAGE)
    pruefe(f'{titel}: zweites Rennen: anderer Seed und andere Lage', r2['seed'] != r['seed'] and m1['h'] != l1['h'], f"{r['seed']} → {r2['seed']}")
    # AUS: bitgleich altes Verhalten
    a1 = page.evaluate(START, {'strecke': strecke, 'welt': welt, 'auto': auto, 'zufall': False, 'extra': extra})
    la = page.evaluate(LAGE)
    pruefe(f'{titel}: AUS: kein Zufall aktiv', not a1['zufall'] and a1['seed'] is None, str(a1))
    page.evaluate(LAUF, 2)
    lb = page.evaluate(LAGE)
    a2 = page.evaluate(START, {'strecke': strecke, 'welt': welt, 'auto': auto, 'zufall': False, 'extra': extra})
    lc = page.evaluate(LAGE)
    pruefe(f'{titel}: AUS: Lage in Runde 2 und im nächsten Rennen unverändert', la['h'] == lb['h'] == lc['h'] and la['m'] == lb['m'] == lc['m'], f"{len(la['h'])} Hindernisse")

try:
    with sync_playwright() as p:
        b = p.chromium.launch(args=ARGS)
        for datei, titel, strecke, welt, auto, extra in [
            ('Autorennen.html', 'auto_dino', 'dino', 'hindernisse', 'troc-cabrio', None),
            ('Autorennen.html', 'auto_wiese', 'wiese', 'hindernisse', 'troc-cabrio', None),
            ('Motorrad.html', 'moto_wiese', 'wiese', 'hindernisse', 'superbike', None),
        ]:
            page = b.new_page(viewport={'width': 1000, 'height': 600})
            page.on('pageerror', lambda e: fehler.append('pageerror: ' + str(e)))
            page.on('console', lambda m: fehler.append('console.error: ' + m.text) if m.type == 'error' else None)
            page.goto(f'http://127.0.0.1:{port}/{datei}'); page.wait_for_timeout(1500)
            spiel_lauf(page, titel, strecke, welt, auto, extra)
            page.close()
        # Menü: Schalter vorhanden, Standard An
        page = b.new_page(viewport={'width': 1440, 'height': 900})
        page.on('pageerror', lambda e: fehler.append('pageerror: ' + str(e)))
        page.on('console', lambda m: fehler.append('console.error: ' + m.text) if m.type == 'error' else None)
        page.goto(f'http://127.0.0.1:{port}/Autorennen.html'); page.wait_for_timeout(1500)
        ist = page.evaluate("() => { const s = Rennspiel.spiel; s.menue.zeigen(4); return { an: s.einstellungen.zufall, zeilen: s.menue.zeilen().includes('zufall'), html: document.body.innerText.includes('Zufällige Strecke') }; }")
        page.wait_for_timeout(400)
        bild(page, 'menue_autorennen.png')
        pruefe('Menü Autorennen: „Zufällige Strecke“ vorhanden, Standard An', ist['an'] is True and ist['zeilen'] and ist['html'], str(ist))
        page.close()
        pruefe('Keine Konsolenfehler/pageerror', not fehler, '; '.join(fehler[:3]))
        b.close()
finally:
    server.terminate()
print('\n' + ('Alles OK' if all(res) else 'FEHL: %d' % res.count(False)))
sys.exit(0 if all(res) else 1)
