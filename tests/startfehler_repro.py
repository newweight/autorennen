#!/usr/bin/env python3
"""STARTFEHLER Teil 1: Nachstellen Zweispieler/Solo, Grafik Normal/Schön/Ultra, Strecke wählbar.
Aufruf: python3 tests/startfehler_repro.py [spiel moto|auto] [strecke] [modus zwei|solo] [grafik normal|schoen|ultra] [praefix]"""
import os, sys, json
from playwright.sync_api import sync_playwright
basis = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
bild = os.path.join(basis, 'tests', 'bilder_startfehler'); os.makedirs(bild, exist_ok=True)
spiel, strecke, modus, grafik, pre = (sys.argv[1:6] + [None]*5)[:5]
spiel = spiel or 'moto'; strecke = strecke or 'unterwasser'; modus = modus or 'zwei'; grafik = grafik or 'schoen'; pre = pre or 'vorher'
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
html, auto = ('Motorrad.html', 'crossmaschine') if spiel == 'moto' else ('Autorennen.html', 'passat')
with sync_playwright() as p:
    b = p.chromium.launch(args=ARGS)
    page = b.new_page(viewport={'width': 1280, 'height': 720}); page.set_default_timeout(120000)
    log = []
    page.on('pageerror', lambda e: log.append('pageerror: %s\n%s' % (e, getattr(e, 'stack', ''))))
    page.on('console', lambda m: log.append('console.%s: %s' % (m.type, m.text)) if m.type in ('error', 'warning') and 'GPU stall' not in m.text else None)
    page.add_init_script("window.addEventListener('error', e => { (window.__fe = window.__fe || []).push(String(e.message) + ' @' + e.filename + ':' + e.lineno + ' ' + (e.error && e.error.stack || '')); });")
    sp_name = 'motorrad' if spiel == 'moto' else 'auto'
    page.add_init_script("try{localStorage.setItem('rennspiel.spass.welten.%s', JSON.stringify({spur:true,dino:'immer'}));localStorage.setItem('rennspiel.spass.zauber.an','1');}catch(e){}" % sp_name)
    page.goto('file://' + os.path.join(basis, html)); page.wait_for_timeout(1500)
    page.evaluate("Rennspiel.Grafik.setzen('%s')" % grafik)
    page.evaluate("Rennspiel.spiel.rennenStarten({ modus: '%s', streckeId: '%s', autoIds: ['%s', '%s'], runden: 2, gegner: 2, spass: true, geist: true, zufall: true, schwierigkeit: 'mittel', fahrhilfe: ['wenig', 'wenig'] })" % (modus, strecke, auto, auto))
    for i in range(12):
        page.wait_for_timeout(1000)
        z = page.evaluate("(() => { const s = Rennspiel.spiel; return { z: s.rennen && s.rennen.zustand, cd: s.rennen && s.rennen.countdown, fe: !!(s._fehler && s._fehler.gestoppt) || !!(s._fehler && s._fehler.gesamt), n: s._fehler && s._fehler.gesamt }; })()")
        print(i, z)
    page.screenshot(path=os.path.join(bild, '%s_%s_%s_%s_%s.png' % (pre, spiel, strecke, modus, grafik)))
    print('\n'.join(log[:12]))
    print('window.__fe', page.evaluate("window.__fe"))
    b.close()
