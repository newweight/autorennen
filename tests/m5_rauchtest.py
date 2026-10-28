#!/usr/bin/env python3
"""M5 Abschluss-Rauchtest: beide Spiele, Grafik Normal und Ultra, Zufällige Strecke an, 2 Runden (Autopilot), alle 7 Strecken;
Konsole muss fehlerfrei sein. Aufruf: python3 tests/m5_rauchtest.py [Autorennen|Motorrad|beide]  (STRECKEN=wiese,... zum Einschränken)"""
import os, sys, time
from playwright.sync_api import sync_playwright
basis = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
wahl = sys.argv[1] if len(sys.argv) > 1 else 'beide'
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
ids = (os.environ.get('STRECKEN') or 'wiese,wald,wueste,fantasie,dino,alpen,formel1').split(',')
spiele = [('Autorennen.html', 'passat')] if wahl == 'Autorennen' else [('Motorrad.html', 'crossmaschine')] if wahl == 'Motorrad' else [('Autorennen.html', 'passat'), ('Motorrad.html', 'crossmaschine')]
fehler = []; ok = 0; gesamt = 0
with sync_playwright() as p:
    b = p.chromium.launch(args=ARGS)
    for html, auto in spiele:
        for stufe in ('normal', 'ultra'):
            page = b.new_page(viewport={'width': 1024, 'height': 576}); page.set_default_timeout(600000)
            lokal = []
            page.on('pageerror', lambda e: lokal.append('pageerror: ' + str(e)))
            page.on('console', lambda m: lokal.append('console.error: ' + m.text) if m.type == 'error' and 'GPU stall' not in m.text and 'WebGL' not in m.text else None)
            page.goto('file://' + os.path.join(basis, html)); page.wait_for_timeout(1500)
            page.evaluate("Rennspiel.Grafik.setzen('%s')" % stufe)
            for sid in ids:
                gesamt += 1
                try:
                    page.evaluate("Rennspiel.spiel.rennenStarten({ modus: 'solo', streckeId: '%s', autoIds: ['%s', '%s'], runden: 2, gegner: 3, schwierigkeit: 'mittel', fahrhilfe: ['wenig', 'wenig'], zufall: true })" % (sid, auto, auto))
                    page.wait_for_function('Rennspiel.spiel.rennen.zustand === "laeuft"', timeout=120000)
                    page.evaluate("Rennspiel.spiel.autopilot(0, true)")
                    # 2 Runden: Zeitraffer über Test-Hook, falls vorhanden; sonst feste Fahrzeit
                    ende = False
                    for k in range(60):                       # bis 60 × 10 s Spielzeit; dazwischen echte Bilder (Zeichnen, Schatten, Spiegel)
                        page.evaluate("(() => { const S = Rennspiel.spiel; for (let i = 0; i < 600 && S.rennen.zustand === 'laeuft'; i++) S.physikSchritt(1 / 60); })()")
                        page.wait_for_timeout(400)
                        if page.evaluate("Rennspiel.spiel.rennen.zustand") != 'laeuft': ende = True; break
                    info = page.evaluate("(() => { const r = Rennspiel.spiel.rennen; return r.zustand; })()")
                    print(html, stufe, sid, 'Zustand', info, 'Ende' if ende else '(Zeitlimit, weiter)')
                    ok += 1
                except Exception as e:
                    lokal.append(sid + ': ' + str(e)[:150])
            for l in lokal: fehler.append(html + ' ' + stufe + ' ' + l)
            page.close()
    b.close()
print('Läufe:', ok, '/', gesamt)
print('KONSOLE FEHLERFREI' if not fehler else 'FEHLER:\n' + '\n'.join(fehler[:30]))
sys.exit(1 if fehler else 0)
