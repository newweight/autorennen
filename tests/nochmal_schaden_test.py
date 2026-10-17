#!/usr/bin/env python3
"""17.10. (v30 G1) „Nochmal“ nach dem Rennen setzt den Schaden zurück: python3 tests/nochmal_schaden_test.py
Rennen mit Schaden an, Health drücken, Rennen beenden (Ergebnistafel), „Nochmal“ → HUD/Health 100 %, Rauch weg, Werkstatt-Zähler 0.
Solo und Zwei-Spieler; danach neues Rennen aus dem Menü (Garage-Rest bleibt dort wie bisher)."""
import os, sys
from playwright.sync_api import sync_playwright
basis = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
url = 'file://' + os.path.join(basis, 'Autorennen.html')
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
pruef = []
def pruefe(name, ok, info=''):
    pruef.append((name, ok)); print(('OK   ' if ok else 'FEHL ') + name + (' – ' + str(info) if info != '' else ''), flush=True)
START = '''(modus) => Rennspiel.spiel.rennenStarten({ modus, streckeId: 'wiese', welt: 'klassisch', schaden: true, gegner: 1, runden: 1,
  schwierigkeit: 'leicht', autoIds: ['passat', 'multivan'], fahrhilfe: ['aus', 'aus'], wetter: 'klar', jahreszeit: 'sommer', tageszeit: 'tag', polizei: false })'''
DRUECKEN = '''(p) => { const s = Rennspiel.spiel; s.schaden._punkteSetzen(0, p); if (s.fahrzeuge[1] && s.fahrzeuge[1].istSpieler) s.schaden._punkteSetzen(1, p);
  s.schaden.z[0].wAkku = 0.5; return s.schaden.zustand(0).prozent; }'''
ZUSTAND = '''() => { const s = Rennspiel.spiel, z = s.schaden.zustand(0), z1 = s.schaden.zustand(1);
  const hud = s.huds[0]; const el = hud ? hud.eGZahl : null;
  const rauch = s.fahrzeuge[0].mesh.children.filter(c => c.name === 'schadenRauch' && c.visible).length;
  return { p0: z.prozent, stufe: z.stufe, p1: z1.prozent, rauch, vMax: s.fahrzeuge[0].vehicle.daten.vMax, vMaxBasis: s.fahrzeuge[0].vehicle.datenBasis ? s.fahrzeuge[0].vehicle.datenBasis.vMax : null,
    wAkku: s.schaden.z[0].wAkku || 0, hud: el ? el.textContent.trim() : null, hudBreite: hud && hud.eGBalken ? hud.eGBalken.style.width : null,
    werk: s.werkstatt ? JSON.stringify(Object.keys(s.werkstatt).filter(k => /benutzt|genutzt|zaehl/i.test(k))) : null }; }'''
with sync_playwright() as p:
    b = p.chromium.launch(args=ARGS); pg = b.new_page(viewport={'width': 1280, 'height': 800})
    fehler = []; pg.on('pageerror', lambda e: fehler.append(str(e)))
    pg.goto(url); pg.wait_for_function('() => window.Rennspiel && Rennspiel.spiel', timeout=60000)
    pg.evaluate('() => { localStorage.clear(); }')
    for modus in ('solo', 'zwei'):
        pg.evaluate('() => { localStorage.clear(); }')
        pg.evaluate(START, modus); pg.wait_for_timeout(800)
        pruefe(modus + ': Start 100 %', pg.evaluate(ZUSTAND)['p0'] == 100)
        pg.evaluate(DRUECKEN, 40); pg.wait_for_timeout(500)
        z = pg.evaluate(ZUSTAND); print('   gedrückt:', z)
        pruefe(modus + ': Schaden 40 % vor Rennende', z['p0'] == 40 and z['stufe'] == 3)
        # Rennende erzwingen: Ergebnis wie nach Zieleinlauf
        pg.evaluate('() => { const s = Rennspiel.spiel; s.rennen.teilnehmer.forEach(t => { t.imZiel = true; t.zielZeit = 60 + t.nr; t.zielPlatz = t.nr + 1; t.runde = s.rennen.runden; }); s.rennenFertig(true); }')
        pg.wait_for_timeout(500)
        ger = pg.evaluate('() => ({ sicht: Rennspiel.spiel.ergebnisAnzeige.sichtbar, rest: JSON.parse(localStorage.getItem("rennspiel.garage.v1") || "{}") })')
        pruefe(modus + ': Ergebnistafel da', ger['sicht'], str(ger['rest'])[:200])
        pg.evaluate('() => { const a = Rennspiel.spiel.ergebnisAnzeige; a.seit = 0; a.aktion("nochmal"); }'); pg.wait_for_timeout(1000)
        z = pg.evaluate(ZUSTAND); print('   nach Nochmal:', z)
        pruefe(modus + ': Nochmal → Health 100 %', z['p0'] == 100 and z['p1'] == 100, z['p0'])
        pruefe(modus + ': HUD zeigt 100 %', '100' in (z['hud'] or '') or '100' in (z['hudBreite'] or ''), (z['hud'], z['hudBreite']))
        pruefe(modus + ': Nochmal → Stufe 0, volle Fahrwerte, kein Rauch, Werkstatt-Akku 0', z['stufe'] == 0 and z['vMax'] == z['vMaxBasis'] and z['rauch'] == 0 and z['wAkku'] == 0, z)
    pruefe('keine JS-Fehler', not fehler, fehler[:2])
    b.close()
n = sum(1 for _, o in pruef if not o); print('\n%d Prüfungen, %d FEHL' % (len(pruef), n)); sys.exit(1 if n else 0)
