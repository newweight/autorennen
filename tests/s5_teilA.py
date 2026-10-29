#!/usr/bin/env python3
"""S5 Teil A im Browser: Freie Fahrt ohne „Runde 1/99“, Sticker-Hinweis weicht der Ergebniskarte aus. python3 tests/s5_teilA.py (beide Spiele). Bilder: tests/bilder_s5/teilA_*.png"""
import os, sys, base64
from playwright.sync_api import sync_playwright
BASIS = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(BASIS, 'tests', 'bilder_s5'); os.makedirs(OUT, exist_ok=True)
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
ok = fehl = 0
def pruefe(name, gut, info=''):
    global ok, fehl
    print(('OK   ' if gut else 'FEHL ') + name + (('  (' + str(info) + ')') if info != '' else ''), flush=True)
    if gut: ok += 1
    else: fehl += 1
with sync_playwright() as p:
    for spiel in ['Autorennen', 'Motorrad']:
        pre = spiel.lower()
        b = p.chromium.launch(args=ARGS); pg = b.new_page(viewport={'width': 1100, 'height': 650}); fehler = []
        pg.on('pageerror', lambda e: fehler.append(str(e)))
        pg.on('console', lambda m: fehler.append(m.text) if m.type == 'error' and 'GPU' not in m.text and 'WebGL' not in m.text else None)
        pg.goto('file://' + os.path.join(BASIS, spiel + '.html')); pg.wait_for_function('window.Rennspiel && Rennspiel.spiel'); pg.wait_for_timeout(1000)
        autos = ['crossmaschine', 'crossmaschine-rot'] if spiel == 'Motorrad' else ['porsche-911', 'multivan']
        # Freie Fahrt
        pg.evaluate("""(a) => { window.__t = 1000; performance.now = () => window.__t; Rennspiel.spiel.uhr.letzte = window.__t; const S = Rennspiel.spiel; S._s4Modus = { art: 'frei' };
          S.rennenStarten({ modus: 'solo', streckeId: 'wiese', autoIds: a, runden: 99, gegner: 0, schwierigkeit: 'mittel', fahrhilfe: ['wenig', 'wenig'] }); window.__raf = window.requestAnimationFrame; window.requestAnimationFrame = () => 0;
          const zz = S.zeichnen; S.zeichnen = function () {}; let g = 0; window.__t = 5000; S.uhr.letzte = window.__t; S.uhr.rest = 0; while ((S.zustand !== 'rennen' || !S.rennen.gasErlaubt) && g++ < 1500) { window.__t += 1000 / 60; S._frameRumpf(window.__t); }
          for (let i = 0; i < 60; i++) { window.__t += 1000 / 60; S._frameRumpf(window.__t); } S.zeichnen = zz; }""", autos)
        r = pg.evaluate("""() => { const e = document.querySelector('.hud-runde'); return { da: !!e, anzeige: e ? getComputedStyle(e).display : null, text: e ? e.textContent : '', klasse: document.body.classList.contains('s4-frei') }; }""")
        
        pruefe(f'{spiel}: Freie Fahrt blendet „Runde 1/99“ aus', r['klasse'] and (not r['da'] or r['anzeige'] == 'none'), r)
        # normales Rennen: HUD-Runde wieder da
        pg.evaluate("""(a) => { const S = Rennspiel.spiel; S._s4Modus = null; S.rennenStarten({ modus: 'solo', streckeId: 'wiese', autoIds: a, runden: 2, gegner: 1, schwierigkeit: 'mittel', fahrhilfe: ['wenig', 'wenig'] });
          const zz = S.zeichnen; S.zeichnen = function () {}; let g = 0; window.__t += 1000; S.uhr.letzte = window.__t; S.uhr.rest = 0; while ((S.zustand !== 'rennen' || !S.rennen.gasErlaubt) && g++ < 1500) { window.__t += 1000 / 60; S._frameRumpf(window.__t); }
          for (let i = 0; i < 30; i++) { window.__t += 1000 / 60; S._frameRumpf(window.__t); } S.zeichnen = zz; }""", autos)
        r = pg.evaluate("() => { const e = document.querySelector('.hud-runde'); return { anzeige: e ? getComputedStyle(e).display : null, klasse: document.body.classList.contains('s4-frei'), text: e ? e.textContent : '' }; }")
        pruefe(f'{spiel}: normales Rennen zeigt die Runde wieder', (not r['klasse']) and r['anzeige'] not in (None, 'none'), r)
        # Ergebniskarte + Sticker-Hinweis
        pg.evaluate("""() => { const S = Rennspiel.spiel; S.autopilot(0, true); let g = 0; const z0 = S.zeichnen; S.zeichnen = function () {}; while (S.zustand === 'rennen' && g++ < 60 * 400) { S.physikSchritt(1 / 60); window.__t += 1000 / 60; S._frameRumpf(window.__t); } for (let i = 0; i < 120; i++) { window.__t += 1000 / 60; S._frameRumpf(window.__t); } S.zeichnen = z0; }""")
        pg.wait_for_timeout(300)
        z = pg.evaluate("() => ({ zustand: Rennspiel.spiel.zustand, karte: [...document.querySelectorAll('.ergebnis,.pause-karte')].filter(x => x.getClientRects().length > 0).length })")
        pg.evaluate("() => Rennspiel.SpassStart.toastZeigen({ emoji: '🏆', name: 'Erster Sieg' })"); pg.wait_for_timeout(500)
        t = pg.evaluate("() => { const e = document.querySelector('.spass-toast'); return e ? { klasse: e.className, unten: e.getBoundingClientRect().top > window.innerHeight * 0.6 } : null; }")
        
        pruefe(f'{spiel}: Ergebniskarte sichtbar, Sticker-Hinweis klein unten (überdeckt sie nicht)', z['karte'] >= 1 and t and 'unten' in t['klasse'] and t['unten'], [z, t])
        pg.wait_for_timeout(3500)
        pg.evaluate("() => Rennspiel.SpassStart.toastZeigen({ emoji: '🏁', name: 'Im Ziel' })")  # Gegenprobe ohne Karte unten
        pruefe(f'{spiel}: keine Konsolenfehler', not fehler, fehler[:3])
        b.close()
print(f'\n{ok} OK, {fehl} FEHL'); sys.exit(1 if fehl else 0)
