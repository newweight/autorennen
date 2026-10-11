#!/usr/bin/env python3
"""Runde 6 (W1-A3/A4): Rempeln „echt" im Browser (Playwright, headless).
Aufruf: python3 tests/rempeln_test.py
Wiese Klassisch, rempeln: 'echt', Schaden an, autopilot(0) + 5 KI „profi", 120 s Rennzeit (Schritt für Schritt synchron).
Prüft: Drehungen > 0 (Stöße mit dreht), Schaden-Treffer > 0, keine NaN, keine Verschmelzung (kleinster Rechteck-Abstand
aller Autopaare > 0,05 m in JEDEM Schritt, ohne Looping/Flug), keine JS-Fehler; Menü-Pille „Rempeln" vorhanden,
Standard sanft. Bild bei der ersten Drehung: tests/out/rempeln_drehung.png (Kamera hinter dem gedrehten Auto, längs der Straße)."""
import sys, os, json
from playwright.sync_api import sync_playwright

basis = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
out = os.path.join(basis, 'tests', 'out'); os.makedirs(out, exist_ok=True)
url = 'file://' + os.path.join(basis, 'Autorennen.html')
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']

STARTEN = '''() => { const s = Rennspiel.spiel;
  s.rennenStarten({ modus: 'solo', streckeId: 'wiese', welt: 'klassisch', rempeln: 'echt', schaden: true, gegner: 5, runden: 5,
    schwierigkeit: 'profi', autoIds: ['troc-cabrio', 'multivan'], fahrhilfe: ['wenig', 'wenig'], wetter: 'klar', jahreszeit: 'sommer',
    windStaerke: 0, polizei: false });
  s.autopilot(0);
  s.uhr.rest = 0; s.pausiert = true;          // Physik nur noch synchron aus dem Test
  s._rz = { treffer: 0, dreher: 0, drehAutos: 0, stoesse: 0, minAbst: Infinity, minWo: '', nan: false, schritte: 0, kiRempler: 0 };
  if (s.schaden) s.schaden.bei((e) => { if (e.art === 'treffer') s._rz.treffer++; });
  return { rempeln: s.einstellungen.rempeln, schaden: !!(s.schaden && s.schaden.an), fz: s.fahrzeuge.length,
    pflanzen: (s.strecke.pflanzenKollider || []).length }; }'''

# bis zu `sekunden` Rennzeit rechnen; bricht ab (stopp = true), sobald ein Auto neu ins Drehen kommt (für das Bild)
LAUF = '''([sekunden, stoppBeiDrehung]) => { const s = Rennspiel.spiel, K = Rennspiel.Kollisionen, z = s._rz, dt = 1 / 60;
  let gedreht = -1;
  for (let t = 0; t < sekunden - 1e-9; t += dt) {
    s.physikSchritt(dt); z.schritte++;
    const f = s.fahrzeuge;
    for (const st of s.stoesse) { z.stoesse++; if (st.dreht) { z.dreher++; st.dreht.forEach((d, w) => { if (d) { z.drehAutos++; gedreht = w ? st.b : st.a; } }); } }
    for (let i = 0; i < f.length; i++) {
      const a = f[i].vehicle;
      if (![a.x, a.z, a.heading, a.vLaengs, a.vQuer].every(Number.isFinite)) z.nan = true;
      if (a.imLooping || a.imFlug) continue;
      for (let j = i + 1; j < f.length; j++) {
        const b = f[j].vehicle;
        if (b.imLooping || b.imFlug) continue;
        if (Math.abs(a.x - b.x) > 8 || Math.abs(a.z - b.z) > 8) continue;
        const d = K.obbAbstand(a, b);
        if (d < z.minAbst) { z.minAbst = d; z.minWo = 'Schritt ' + z.schritte + ' Autos ' + i + '/' + j; }
      }
    }
    // fürs Bild nur eine deutliche Drehung (≥ 1,4 rad/s ≈ 25° und mehr)
    if (stoppBeiDrehung && gedreht >= 0 && Math.abs(f[gedreht].vehicle.drehImpuls) >= 1.4) return { stopp: true, auto: gedreht, zeit: z.schritte * dt };
  }
  z.kiRempler = s.fahrzeuge.reduce((n, g) => n + ((g.driver && g.driver.rempler) || 0), 0);
  return { stopp: false, zeit: z.schritte * dt }; }'''

# Bild: das gedrehte Auto noch 0,33 s weiterdrehen lassen, Kamera 11 m hinter ihm längs der Straße, 4,5 m hoch
BILD = '''(nr) => { const s = Rennspiel.spiel, R = Rennspiel, f = s.fahrzeuge[nr], v = f.vehicle, sp = s.strecke.spline;
  for (let k = 0; k < 20; k++) s.physikSchritt(1 / 60);
  s._rz.schritte += 20;
  s.fahrzeuge.forEach((g) => { const d = g.anzeige, w = g.vehicle; d.x = w.x; d.y = w.y; d.z = w.z; d.heading = w.heading; d.nicken = w.nicken; d.neigung = w.neigung;
    const a = g.vorher; if (a) { a.x = w.x; a.y = w.y; a.z = w.z; a.heading = w.heading; a.nicken = w.nicken; a.neigung = w.neigung; } });
  const n = sp.naechster(v.x, v.z), p = sp.punktBei(n.s), c = s.kameras[0].kamera;
  c.position.set(v.x - p.tx * 11 + p.nx * 2, v.y + 4.5, v.z - p.tz * 11 + p.nz * 2);
  c.up.set(0, 1, 0); c.lookAt(v.x + p.tx * 3, v.y + 0.6, v.z + p.tz * 3);
  document.querySelectorAll('.hud-banner').forEach(b => { b.className = 'hud-banner'; });
  const winkel = R.Vehicle.winkelDiff(v.heading, R.headingAus(p.tx, p.tz)) * 180 / Math.PI;
  return { auto: nr, name: s.rennen.teilnehmer[nr] ? s.rennen.teilnehmer[nr].name : '?', drehImpuls: +v.drehImpuls.toFixed(2),
    winkelZurStrasse: +winkel.toFixed(0), kmh: v.tempoKmh }; }'''

pruef = []
def pruefe(name, ok, info=''):
    pruef.append((name, ok)); print(('OK   ' if ok else 'FEHL ') + name + (' – ' + str(info) if info != '' else ''), flush=True)

with sync_playwright() as p:
    browser = p.chromium.launch(args=ARGS)
    page = browser.new_page(viewport={'width': 1280, 'height': 800})
    fehler = []
    page.on('pageerror', lambda e: fehler.append(str(e)))
    page.on('console', lambda m: fehler.append('console.error: ' + m.text) if m.type == 'error' else None)
    page.goto(url); page.wait_for_timeout(1500)

    # Menü: Pille vorhanden, Standard sanft (frischer Speicher)
    menue = page.evaluate('''() => { const s = Rennspiel.spiel; const e = s.einstellungen;
      const pillen = [...document.querySelectorAll('[data-a^="wert:rempeln:"]')].map(x => x.textContent);
      return { std: e.rempeln, pillen, zeile: s.menue && s.menue.zeilen ? s.menue.zeilen().includes('rempeln') : null }; }''')
    pruefe('Einstellung rempeln: Standard „sanft"', menue['std'] == 'sanft', menue)
    pruefe('Menü: Pille „Rempeln: Sanft / Echt" in der rechten Spalte (falls Startseite offen)', menue['zeile'] in (True, None) and
           (not menue['pillen'] or menue['pillen'] == ['Sanft', 'Echt']), menue)

    st = page.evaluate(STARTEN)
    pruefe('Rennen: rempeln echt, Schaden an, 6 Autos', st['rempeln'] == 'echt' and st['schaden'] and st['fz'] == 6, st)

    gesamt, bild = 120.0, None
    while True:
        z0 = page.evaluate('() => Rennspiel.spiel._rz.schritte / 60')
        rest = gesamt - z0
        if rest <= 1e-6: break
        r = page.evaluate(LAUF, [rest, bild is None])
        if r['stopp'] and bild is None:
            info = page.evaluate(BILD, r['auto'])
            page.wait_for_timeout(250)
            datei = os.path.join(out, 'rempeln_drehung.png')
            page.screenshot(path=datei)
            bild = dict(info, zeit=round(r['zeit'], 1), datei=datei)
            print('Bild bei Drehung:', bild, flush=True)
            page.evaluate('() => { const s = Rennspiel.spiel; s.kameras[0]._erstesMal = true; }')
        if not r['stopp']: break
    z = page.evaluate('() => { const z = Rennspiel.spiel._rz; return Object.assign({}, z, { zeit: z.schritte / 60 }); }')
    print('Zähler:', json.dumps(z), flush=True)
    pruefe('120 s gerechnet', z['zeit'] >= 119.9, round(z['zeit'], 1))
    pruefe('Drehungen > 0', z['dreher'] > 0, 'Stöße %d, mit Drehung %d (Autos %d), KI-Rempler %d' % (z['stoesse'], z['dreher'], z['drehAutos'], z['kiRempler']))
    pruefe('Schaden-Treffer > 0', z['treffer'] > 0, z['treffer'])
    pruefe('keine NaN', not z['nan'])
    pruefe('keine Verschmelzung: min. Rechteck-Abstand aller Autopaare > 0,05 m in jedem Schritt', z['minAbst'] > 0.05,
           '%.3f m (%s)' % (z['minAbst'], z['minWo']))
    pruefe('Bild bei einer Drehung aufgenommen', bild is not None, bild)
    prozente = page.evaluate('() => Rennspiel.spiel.fahrzeuge.map((f, i) => Rennspiel.spiel.schaden.zustand(i).prozent)')
    print('Schaden-Prozent je Auto:', prozente, flush=True)
    pruefe('keine JS-Fehler', not fehler, fehler[:3])
    browser.close()

n = sum(1 for _, ok in pruef if not ok)
print('\nALLE TESTS OK' if n == 0 else '\n%d FEHLER' % n)
sys.exit(1 if n else 0)
