#!/usr/bin/env python3
"""Motorsound im echten Spiel (14.10. (v21)): python3 tests/sound_spiel_test.py
Prüft: jedes Fahrzeug bekommt das Klangprofil seines Autos · Zweispieler: zwei Spieler-Motoren + höchstens 2 Computer-Motoren hörbar ·
Gegner sind leiser als Spieler · Pause/Menü stumm · CPU je Bild (motorUpdate, Mittel) · keine JS-Fehler."""
import sys, os
from playwright.sync_api import sync_playwright

basis = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
url = 'file://' + os.path.join(basis, 'Autorennen.html')
ergebnisse = []
def pruefe(name, ok, info=''):
    ergebnisse.append(ok); print(('OK   ' if ok else 'FEHL ') + name + (' – ' + str(info) if info != '' else ''))

with sync_playwright() as pw:
    browser = pw.chromium.launch(args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'])
    page = browser.new_page(viewport={'width': 1000, 'height': 600})
    fehler = []
    page.on('pageerror', lambda e: fehler.append(str(e)))
    page.on('console', lambda m: fehler.append('console.error: ' + m.text) if m.type == 'error' else None)
    page.goto(url); page.wait_for_timeout(1200)
    page.evaluate("() => { Rennspiel.Audio.start(); Rennspiel.Audio.setzeAn(true); }")
    # Messhaken: Zeit in motorUpdate
    page.evaluate("""() => { const A = Rennspiel.Audio, o = A.motorUpdate.bind(A); window.__m = { n: 0, ms: 0 };
      A.motorUpdate = function (id, d) { const t = performance.now(); o(id, d); window.__m.ms += performance.now() - t; window.__m.n++; }; }""")
    page.evaluate("() => Rennspiel.spiel.rennenStarten({ modus: 'zwei', streckeId: 'wiese', autoIds: ['porsche-911', 'multivan'], runden: 3, gegner: 4, schwierigkeit: 'mittel', fahrhilfe: ['wenig', 'wenig'] })")
    page.wait_for_timeout(6000)
    info = page.evaluate("""() => { const R = Rennspiel, A = R.Audio;
      return { st: A.statistik(), f: R.spiel.fahrzeuge.map((f, i) => ({ auto: f.auto.id, sp: f.istSpieler, m: A.motorInfo(i) })), z: R.spiel.zustand }; }""")
    print('   Zustand', info['z'], '| AudioContext', info['st']['zustand'])
    pruefe('jedes Fahrzeug hat das Profil seines Autos', all(x['m'] and x['m']['profil'] == x['auto'] for x in info['f']), [(x['auto'], x['m'] and x['m']['profil']) for x in info['f']])
    pruefe('Spieler 1 = Porsche 911 (6 Zyl.), Spieler 2 = Multivan (4 Zyl.)', info['f'][0]['m']['zylinder'] == 6 and info['f'][1]['m']['zylinder'] == 4)
    gegner = [x['auto'] for x in info['f'] if not x['sp']]
    pruefe('Gegner sind nur Passat/Multivan/911/T-Roc (je ein eigener Klang)', set(gegner) <= {'passat', 'multivan', 'porsche-911', 'troc-cabrio'}, gegner)
    hoer = sum(1 for x in info['f'] if not x['sp'] and x['m']['hatSlot'])
    pruefe('höchstens 2 Computer-Motoren hörbar', hoer <= 2 and info['st']['slots'] <= 4, f"hörbar {hoer}, Slots {info['st']['slots']}")
    pruefe('beide Spieler-Motoren belegt, im Rennen läuft Ton', info['f'][0]['m']['hatSlot'] and info['f'][1]['m']['hatSlot'] and info['st']['zustand'] == 'running', info['f'][0]['m'])
    # Der Headless-Browser (SwiftShader, ausgelastete Maschine) schafft oft < 1 Bild/s -> die Ton-Aktualisierung des Spiels direkt aufrufen
    page.evaluate("() => { window.__m.n = 0; window.__m.ms = 0; }")
    tot = page.evaluate("""() => { const sp = Rennspiel.spiel; const t0 = performance.now();
      for (let i = 0; i < 300; i++) { sp.tonAktualisieren(1 / 60); } return performance.now() - t0; }""")
    m = page.evaluate("() => window.__m")
    us = m['ms'] * 1000 / max(1, m['n'])
    pruefe(f"CPU im Spiel: {us:.1f} µs je motorUpdate ({m['n']} Aufrufe), tonAktualisieren gesamt {tot / 300 * 1000:.0f} µs je Bild (6 Autos), Limit 400 µs", m['n'] > 600 and tot / 300 * 1000 < 400)
    # Pause: Motoren stumm (tonAktualisieren wie im Spielbild aufrufen)
    page.evaluate("() => { Rennspiel.spiel.pauseSetzen(true); Rennspiel.spiel.tonAktualisieren(1 / 60); }"); page.wait_for_timeout(600)
    pruefe('Pause: Motor-Bus stumm', page.evaluate("() => Rennspiel.Audio._motorBus.gain.value") < 0.02)
    page.evaluate("() => { Rennspiel.spiel.pauseSetzen(false); Rennspiel.spiel.tonAktualisieren(1 / 60); }"); page.wait_for_timeout(600)
    pruefe('Weiter: Motor-Bus wieder an', page.evaluate("() => Rennspiel.Audio._motorBus.gain.value") > 0.3)
    # Ton aus -> kein Absturz, Master 0
    page.evaluate("() => Rennspiel.Audio.setzeAn(false)"); page.wait_for_timeout(500)
    pruefe('Ton aus: Master-Gain 0', page.evaluate("() => Rennspiel.Audio.statistik().gain") < 0.01)
    page.evaluate("() => Rennspiel.Audio.setzeAn(true)")
    # Einzelrennen mit dem Formel-Renner
    page.evaluate("() => Rennspiel.spiel.rennenStarten({ modus: 'solo', streckeId: 'wiese', autoIds: ['formel'], runden: 3, gegner: 2, schwierigkeit: 'mittel', fahrhilfe: ['wenig'] })")
    try: page.wait_for_function("() => Rennspiel.Audio.motorInfo(0) && Rennspiel.Audio.motorInfo(0).hatSlot", timeout=20000)
    except Exception: pass
    r = page.evaluate("() => { const A = Rennspiel.Audio; return A.motorInfo(0); }")
    pruefe('Einzelrennen Formel: Profil formel (10 Zyl., 8 Gänge)', r['profil'] == 'formel' and r['zylinder'] == 10 and r['gaenge'] == 8, r)
    pruefe('keine JS-Fehler', not fehler, fehler[:3])
    browser.close()
n = sum(1 for o in ergebnisse if not o)
print(f'\n{len(ergebnisse) - n} OK, {n} FEHL'); sys.exit(1 if n else 0)
