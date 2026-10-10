#!/usr/bin/env python3
"""Ton-Test (Playwright/Chromium): lädt eine Mini-Seite mit config.js + engine.js und prüft
Rennspiel.Audio – keine JS-Fehler, Context läuft, kein Node-Leck, Lautstärke, an=false, Robustheit.
Aufruf: python3 tests/audio_test.py"""
import sys, os, json
from playwright.sync_api import sync_playwright

basis = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
out = os.path.join(basis, 'tests', 'out'); os.makedirs(out, exist_ok=True)
html_pfad = os.path.join(out, 'audio_test.html')
with open(html_pfad, 'w', encoding='utf-8') as f:
    f.write('''<!doctype html><html lang="de"><head><meta charset="utf-8"><title>Audio-Test</title></head><body>
<script src="../../src/config.js"></script>
<script src="../../src/audio/engine.js"></script>
</body></html>''')
url = 'file://' + html_pfad

ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist',
        '--autoplay-policy=no-user-gesture-required']

ergebnisse = []
def pruefe(name, ok, detail=''):
    ergebnisse.append((name, bool(ok), detail))
    print(('OK   ' if ok else 'FEHLER ') + name + (' – ' + str(detail) if detail != '' else ''))

# Alle Effekte aufrufen
EFFEKTE = '''(() => { const A = Rennspiel.Audio;
  [3, 2, 1, 0].forEach(n => A.countdown(n));
  A.kollision(2); A.kollision(14); A.bande(); A.bande(1); A.runde();
  A.ziel(1); A.ziel(2); A.ziel(5); A.menueKlick(); A.bremsen(true); A.bremsen(false); })()'''

# 200 Updates mit steigendem Tempo für 2 Spieler und 4 KI-Autos (nur 3 dürfen hörbar sein)
UPDATES = '''(() => { const A = Rennspiel.Audio, vMax = 42, d = {}, spur = [], ids = ['p1', 'p2', 'k1', 'k2', 'k3', 'k4'];
  let maxGang = 0, abfaelle = 0, letzt = 0, fMin = 1e9, fMax = 0;
  for (let i = 0; i < 200; i++) {
    const tempo = vMax * (i / 199);
    ids.forEach((id, j) => {
      d.tempo = tempo; d.vMax = vMax; d.gas = 1; d.dt = 1 / 60;
      d.untergrund = (i % 40 < 20 && id === 'p1') ? 'gras' : 'strasse';
      d.abstand = id[0] === 'k' ? 10 * (j - 1) : 0;      // k1=10, k2=20, k3=30, k4=40 m
      A.motorUpdate(id, d);
    });
    const info = A.motorInfo('p1');
    maxGang = Math.max(maxGang, info.gang);
    if (info.grundton < letzt - 8) abfaelle++;           // Schaltpunkt: Grundton fällt
    letzt = info.grundton; fMin = Math.min(fMin, info.grundton); fMax = Math.max(fMax, info.grundton);
  }
  return { maxGang, abfaelle, fMin, fMax }; })()'''

with sync_playwright() as p:
    browser = p.chromium.launch(args=ARGS)
    page = browser.new_page()
    fehler = []
    page.on('pageerror', lambda e: fehler.append(str(e)))
    page.on('console', lambda m: fehler.append('console.error: ' + m.text) if m.type == 'error' else None)
    page.goto(url); page.wait_for_timeout(300)

    # 0) Vor start(): alles ruhig, nichts passiert
    page.evaluate('''(() => { const A = Rennspiel.Audio; A.motorAnlegen('x'); A.motorUpdate('x', { tempo: 5, vMax: 40, gas: 1 });
      A.kollision(5); A.bande(); A.runde(); A.ziel(1); A.countdown(3); A.menueKlick(); A.bremsen(true); A.motorEntfernen('x'); })()''')
    pruefe('vor start(): keine Fehler, kein Context', page.evaluate('Rennspiel.Audio.statistik().zustand') == 'nicht gestartet')

    # 1) Start
    page.evaluate('Rennspiel.Audio.start()'); page.wait_for_timeout(500)
    st = page.evaluate('Rennspiel.Audio.statistik()')
    pruefe('AudioContext läuft', st['zustand'] == 'running', st['zustand'])

    # 2) Stimmen anlegen, 200 Updates, kein Leck
    page.evaluate('''(() => { const A = Rennspiel.Audio;
      A.motorAnlegen('p1', { spieler: true }); A.motorAnlegen('p2', { spieler: true });
      ['k1', 'k2', 'k3', 'k4'].forEach(id => A.motorAnlegen(id)); })()''')
    page.evaluate('''(() => { const A = Rennspiel.Audio, d = { tempo: 0, vMax: 42, gas: 0, abstand: 15 };
      ['p1', 'p2', 'k1', 'k2', 'k3', 'k4'].forEach(id => A.motorUpdate(id, d)); })()''')
    vorher = page.evaluate('Rennspiel.Audio.statistik()')
    r = page.evaluate(UPDATES)
    nachher = page.evaluate('Rennspiel.Audio.statistik()')
    pruefe('Nodes konstant nach 200 Updates', vorher['aktiv'] == nachher['aktiv'] and vorher['erzeugt'] == nachher['erzeugt'],
           f"aktiv {vorher['aktiv']} -> {nachher['aktiv']}, erzeugt {vorher['erzeugt']} -> {nachher['erzeugt']}")
    pruefe('Motor-Slots: höchstens 3 KI + 2 Spieler', nachher['slots'] <= 5 and nachher['kiAktiv'] <= 3,
           f"slots {nachher['slots']}, kiAktiv {nachher['kiAktiv']}")
    pruefe('nur die 3 nächsten KI hörbar', page.evaluate('''(() => { const A = Rennspiel.Audio;
      return ['k1', 'k2', 'k3'].every(i => A.motorInfo(i).hatSlot) && !A.motorInfo('k4').hatSlot; })()'''))
    pruefe('4 Gänge, Drehzahl fällt beim Schalten', r['maxGang'] == 4 and r['abfaelle'] >= 3, r)
    pruefe('Grundton im Bereich 55–400 Hz', 55 <= r['fMin'] and r['fMax'] <= 400, f"{r['fMin']:.0f}–{r['fMax']:.0f} Hz")

    # KI weit weg → Slot wird frei
    page.evaluate('''(() => { const A = Rennspiel.Audio; A.motorUpdate('k1', { tempo: 10, vMax: 42, gas: 1, abstand: 200 }); })()''')
    pruefe('KI außer Hörweite gibt Slot frei', page.evaluate('!Rennspiel.Audio.motorInfo("k1").hatSlot'))

    # 3) Effekte, danach müssen alle Effekt-Nodes wieder abgebaut sein
    page.evaluate(EFFEKTE)
    waehrend = page.evaluate('Rennspiel.Audio.statistik()')
    pruefe('Effekte erzeugen Nodes', waehrend['aktiv'] > nachher['aktiv'], f"aktiv {waehrend['aktiv']}")
    page.wait_for_timeout(3500)
    danach = page.evaluate('Rennspiel.Audio.statistik()')
    pruefe('Effekt-Nodes werden abgebaut', danach['aktiv'] <= nachher['aktiv'] + 1, f"aktiv {danach['aktiv']} (vorher {nachher['aktiv']})")

    # 4) Lautstärke
    page.evaluate('Rennspiel.Audio.setzeLautstaerke(0.3)'); page.wait_for_timeout(700)
    g1 = page.evaluate('Rennspiel.Audio.statistik().gain')
    page.evaluate('Rennspiel.Audio.setzeLautstaerke(0.8)'); page.wait_for_timeout(700)
    g2 = page.evaluate('Rennspiel.Audio.statistik().gain')
    pruefe('Lautstärke 0.3 wirkt', abs(g1 - 0.3) < 0.02, round(g1, 3))
    pruefe('Lautstärke 0.8 wirkt', abs(g2 - 0.8) < 0.02, round(g2, 3))

    # 5) an=false → Gain 0, keine neuen Effekt-Nodes
    page.evaluate('Rennspiel.Audio.an = false'); page.wait_for_timeout(300)
    g3 = page.evaluate('Rennspiel.Audio.statistik().gain')
    e0 = page.evaluate('Rennspiel.Audio.statistik().erzeugt')
    page.evaluate(EFFEKTE)
    e1 = page.evaluate('Rennspiel.Audio.statistik().erzeugt')
    pruefe('an=false: Gain 0', g3 < 0.01, round(g3, 4))
    pruefe('an=false: Effekte erzeugen nichts', e0 == e1, f'{e0} -> {e1}')
    gespeichert = page.evaluate('(() => { try { return localStorage.getItem("rennspiel.ton"); } catch (e) { return "n/a"; } })()')
    pruefe('an=false in localStorage', gespeichert in ('0', 'n/a'), gespeichert)
    page.wait_for_timeout(600)
    # 6) wieder an
    page.evaluate('Rennspiel.Audio.an = true'); page.wait_for_timeout(900)
    st = page.evaluate('Rennspiel.Audio.statistik()')
    pruefe('an=true: läuft wieder mit Lautstärke', st['zustand'] == 'running' and abs(st['gain'] - 0.8) < 0.03, f"{st['zustand']}, gain {st['gain']:.3f}")

    # 7) Aufräumen
    page.evaluate('Rennspiel.Audio.motorAlleEntfernen()')
    st = page.evaluate('Rennspiel.Audio.statistik()')
    pruefe('motorAlleEntfernen leert Stimmen', st['stimmen'] == 0 and st['slotsBelegt'] == 0 and st['kiAktiv'] == 0)
    pruefe('keine JS-Fehler (Seite 1)', not fehler, fehler)
    page.close()

    # 8) Ohne AudioContext: nichts darf scheitern
    page2 = browser.new_page()
    fehler2 = []
    page2.on('pageerror', lambda e: fehler2.append(str(e)))
    page2.add_init_script('delete window.AudioContext; delete window.webkitAudioContext;')
    page2.goto(url); page2.wait_for_timeout(200)
    page2.evaluate('Rennspiel.Audio.start()')
    page2.evaluate('''(() => { const A = Rennspiel.Audio; A.motorAnlegen('a', { spieler: true }); A.motorUpdate('a', { tempo: 9, vMax: 40, gas: 1 });
      A.setzeLautstaerke(0.5); A.an = false; A.an = true; A.motorStumm(true); A.kollision(9); A.bande(); A.runde(); A.ziel(1); A.countdown(0); A.menueKlick(); A.bremsen(true); A.motorAlleEntfernen(); })()''')
    pruefe('ohne AudioContext: keine Fehler', not fehler2 and page2.evaluate('Rennspiel.Audio.statistik().zustand') == 'keiner', fehler2)
    page2.close()
    browser.close()

fehlgeschlagen = [n for n, ok, _ in ergebnisse if not ok]
print(json.dumps({'geprueft': len(ergebnisse), 'fehlgeschlagen': fehlgeschlagen}, ensure_ascii=False))
sys.exit(1 if fehlgeschlagen else 0)
