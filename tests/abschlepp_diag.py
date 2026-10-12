#!/usr/bin/env python3
"""Diagnose der Abschlepp-Prüfung (welten_test.py): mehrfach hintereinander Auto 3 liegenbleiben lassen und je Versuch
Fortschritt/Tempo des abgeschleppten KI-Autos in 0,5-s-Schritten aufzeichnen (20 s nach dem Reset).
Aufruf: python3 tests/abschlepp_diag.py <strecke> <welt> [versuche=6]    – gibt je Versuch 'weiter nach 8 s / 20 s, vMax' aus,
bei langsamen Versuchen (< 50 m nach 8 s) die Reihe [Fortschritt, Tempo, x, z, Abstand zum nächsten Auto]."""
import sys, os, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from playwright.sync_api import sync_playwright
import welten_test as W

sid, welt = sys.argv[1], sys.argv[2]
n = int(sys.argv[3]) if len(sys.argv) > 3 else 6
JS = '''() => { const s = Rennspiel.spiel, i = 3, f = s.fahrzeuge[i], sc = s.schaden, t = s.rennen.teilnehmer[i];
  let w = 0; while (sc.zustand(i).liegengeblieben && w < 20) { s.schnellvorlauf(0.5); w++; }
  sc.z[i].abkling = 0; sc._punkteSetzen(i, 5); sc.treffer(i, 'hindernis', 5);
  s.schnellvorlauf(5.5); const fo2 = t.fortschritt, o = { reihe: [] };
  for (let k = 1; k <= 40; k++) { s.schnellvorlauf(0.5); const v = f.vehicle;
    const nah = Math.min(...s.fahrzeuge.map((g, j) => j === i ? 1e9 : Math.hypot(g.vehicle.x - v.x, g.vehicle.z - v.z)));
    o.reihe.push([Math.round(t.fortschritt - fo2), +v.tempo.toFixed(1), Math.round(v.x), Math.round(v.z), Math.round(nah)]); }
  o.w8 = o.reihe[15][0]; o.w20 = o.reihe[39][0]; o.vMax = Math.max(...o.reihe.map(r => r[1])); return o; }'''
with sync_playwright() as p:
    b = p.chromium.launch(args=W.ARGS); page = b.new_page(viewport={'width': 1280, 'height': 800})
    page.goto(W.url); page.wait_for_timeout(1200)
    page.evaluate(W.STARTEN, [sid, welt]); page.wait_for_timeout(300)
    page.evaluate('() => Rennspiel.spiel.schnellvorlauf(200)')
    for k in range(n):
        r = page.evaluate(JS)
        print('Versuch %d: weiter 8 s = %d m, 20 s = %d m, vMax %.1f' % (k + 1, r['w8'], r['w20'], r['vMax']), flush=True)
        if r['w8'] < 50: print('   Reihe (alle 2 s):', json.dumps(r['reihe'][3::4]), flush=True)
        page.evaluate('() => Rennspiel.spiel.schnellvorlauf(17)')
    b.close()
