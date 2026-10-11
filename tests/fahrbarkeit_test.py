#!/usr/bin/env python3
"""Runde 5 – Fahrbarkeit mit echter Tastatur-Eingabe (Playwright keyboard.down/up, kein Autopilot).

Je Strecke (Wiese, Wald) in Tempo-Klasse „normal" (Standard), Fahrhilfe „wenig", 3 Computer-Gegner:
  a) Solo: Spieler 1 (Pfeiltasten) fährt 60 s Spielzeit,
  b) Split-Screen: Spieler 1 (Pfeile) UND Spieler 2 (WASD) fahren gleichzeitig 60 s.
Lenk-Logik des Tests (einfach, wie ein Kind mit Blick nach vorn): Ziel = Punkt auf der Mittellinie
max(10 m, 0,55·v + 6 m) voraus → links/rechts drücken, wenn der Winkel dorthin > 0,03 rad (sonst loslassen).
Gas gehalten; Gas los über dem Ideallinien-Tempo (R.Driver.tempoProfil, 1 s voraus), Bremse ab +3 m/s darüber.
Prüft: > 95 % der Physikschritte auf der Straße (Untergrund weder Gras noch Sand), Fortschritt > 1 km in 60 s,
keine JS-Fehler. Gezählt wird in jedem Physikschritt (Hülle um spiel.physikSchritt), erst ab Rennfreigabe.
Aufruf: python3 tests/fahrbarkeit_test.py [wiese|wald ...]
"""
import sys, os, json, time
from playwright.sync_api import sync_playwright

basis = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
url = 'file://' + os.path.join(basis, 'Autorennen.html')
strecken = sys.argv[1:] or ['wiese', 'wald']
SPIELZEIT = 60.0
TASTEN = [{'gas': 'ArrowUp', 'bremse': 'ArrowDown', 'links': 'ArrowLeft', 'rechts': 'ArrowRight'},
          {'gas': 'KeyW', 'bremse': 'KeyS', 'links': 'KeyA', 'rechts': 'KeyD'}]

ZAEHLER = r'''() => { const s = Rennspiel.spiel;
  if (s._fbOrig) return;
  s._fbOrig = s.physikSchritt; s._fb = [{ an: 0, ab: 0 }, { an: 0, ab: 0 }];
  s.physikSchritt = function (dt) {
    this._fbOrig(dt);
    if (!this.rennen || !this.rennen.gasErlaubt) return;
    this.fahrzeuge.forEach((f, i) => { if (!f.istSpieler || i > 1) return;
      const u = f.vehicle.untergrund; if (u === 'gras' || u === 'sand') this._fb[i].ab++; else this._fb[i].an++; });
  }; }'''

# Steuerentscheidung je Spieler (Lenkung zur Mitte nach dem Punkt voraus, Tempo nach dem Ideallinien-Profil)
ENTSCHEIDUNG = r'''(anzahl) => { const R = Rennspiel, s = R.spiel, st = s.strecke, sp = st.spline, r = s.rennen;
  const aus = [];
  for (let i = 0; i < anzahl; i++) {
    const f = s.fahrzeuge[i], v = f.vehicle;
    const n = sp.naechster(v.x, v.z);
    const L = Math.max(10, 0.55 * Math.max(0, v.vLaengs) + 6), p = sp.punktBei(n.s + L);
    const d = R.Vehicle.winkelDiff(R.headingAus(p.x - v.x, p.z - v.z), v.heading);
    const soll = R.Driver.tempoProfil(st, v).tempoBei(n.s + Math.max(0, v.vLaengs) * 1.0);
    aus.push({ links: d > 0.03, rechts: d < -0.03, gas: v.vLaengs < soll + 0.5, bremse: v.vLaengs > soll + 3,
      seite: n.seitenabstand, kmh: v.tempoKmh, fortschritt: r.teilnehmer[i].fortschritt });
  }
  return { zeit: r.zeit, frei: r.gasErlaubt, aus, fb: s._fb, fps: s.leistung ? s.leistung().fps : null,
           klasse: s.fahrzeuge[0].vehicle.tempoKlasse, vMax: s.fahrzeuge[0].vehicle.daten.vMax * 3.6 }; }'''

fehler_gesamt = 0
def pruefe(name, ok, info=''):
    global fehler_gesamt
    print(('OK   ' if ok else 'FEHL ') + name + (f'  ({info})' if info != '' else ''))
    if not ok: fehler_gesamt += 1

with sync_playwright() as pw:
    browser = pw.chromium.launch(args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
    for sid in strecken:
        for modus in ('solo', 'zwei'):
            page = browser.new_page(viewport={'width': 960, 'height': 600})
            js_fehler = []
            page.on('pageerror', lambda e: js_fehler.append(str(e)))
            page.goto(url); page.wait_for_function('window.Rennspiel && Rennspiel.spiel', timeout=20000)
            page.evaluate("localStorage.clear()")
            page.evaluate("""([id, modus]) => Rennspiel.spiel.rennenStarten({ modus, streckeId: id, autoIds: ['passat', 'troc-cabrio'],
                runden: 5, gegner: 3, schwierigkeit: 'mittel', fahrhilfe: ['wenig', 'wenig'], tempoKlasse: 'normal', welt: '' })""", [sid, modus])
            page.evaluate(ZAEHLER)
            page.focus('body') if page.query_selector('body') else None
            anzahl = 2 if modus == 'zwei' else 1
            gedrueckt = [dict(gas=False, bremse=False, links=False, rechts=False) for _ in range(anzahl)]
            start = time.time(); z = None; ticks = 0; max_seite = [0.0] * anzahl
            while time.time() - start < 900:
                z = page.evaluate(ENTSCHEIDUNG, anzahl)
                ticks += 1
                if z['frei'] and z['zeit'] >= SPIELZEIT: break
                for i, a in enumerate(z['aus']):
                    max_seite[i] = max(max_seite[i], abs(a['seite'])) if z['frei'] else max_seite[i]
                    for art in ('gas', 'bremse', 'links', 'rechts'):
                        soll = bool(a[art]) and z['frei']
                        if art == 'gas' and not z['frei']: soll = False
                        if soll != gedrueckt[i][art]:
                            (page.keyboard.down if soll else page.keyboard.up)(TASTEN[i][art]); gedrueckt[i][art] = soll
                page.wait_for_timeout(15)
            for i in range(anzahl):
                for art, an in gedrueckt[i].items():
                    if an: page.keyboard.up(TASTEN[i][art])
            dauer = time.time() - start
            print(f'\n=== {sid} / {modus}: Tempo-Klasse {z["klasse"]} (vMax {z["vMax"]:.0f} km/h), Spielzeit {z["zeit"]:.1f} s in {dauer:.0f} s echt, '
                  f'{ticks} Steuer-Ticks, fps {z["fps"]} ===')
            for i in range(anzahl):
                fb = z['fb'][i]; gesamt = fb['an'] + fb['ab']
                anteil = fb['an'] / gesamt if gesamt else 0
                weg = z['aus'][i]['fortschritt']
                name = f'{sid}/{modus} Spieler {i + 1} ({"Pfeile" if i == 0 else "WASD"})'
                pruefe(f'{name}: > 95 % auf der Straße', anteil > 0.95 and gesamt > 0,
                       f'{anteil * 100:.1f} % von {gesamt} Schritten, max. Seitenabstand {max_seite[i]:.1f} m')
                pruefe(f'{name}: Fortschritt > 1000 m in 60 s', weg > 1000, f'{weg:.0f} m')
            pruefe(f'{sid}/{modus}: Spielzeit 60 s erreicht, keine JS-Fehler', z['zeit'] >= SPIELZEIT and not js_fehler, js_fehler[:2])
            page.close()
    browser.close()

print('\nALLE TESTS OK' if fehler_gesamt == 0 else f'\n{fehler_gesamt} FEHLER')
sys.exit(1 if fehler_gesamt else 0)
