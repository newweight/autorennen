#!/usr/bin/env python3
"""Runde 5b: Polizei im Browser (Playwright, headless).
Aufruf: python3 tests/polizei_test.py
Wiese Klassisch, polizei: true, 3 Gegner (mittel), 2 Runden, autopilot(0) (mittel), Streifenwagen 'meister':
  - 1 Streifenwagen als eigener Fahrzeug-Eintrag (f.polizei), RaceManager hat nur 4 Teilnehmer
  - innerhalb 200 s mindestens eine Anhaltung des Spielers; HUD „🚨 Polizei! Anhalten… N s" sichtbar (Bild
    tests/out/polizei_stopp.png), Countdown zählt herunter; Spieler steht; danach „Weiterfahren", Spieler fährt weiter
  - max. 1 Anhaltung je Auto und Runde; keine JS-Fehler; Ergebnis-Tafel ohne Polizei (4 Zeilen)
  - 6 Gegner → 2 Streifenwagen; polizei: false → kein Streifenwagen; Abbau/Nochmal sauber (keine Blaulicht-Lichter übrig)."""
import sys, os, json
from playwright.sync_api import sync_playwright

basis = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
out = os.path.join(basis, 'tests', 'out'); os.makedirs(out, exist_ok=True)
url = 'file://' + os.path.join(basis, 'Autorennen.html')
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']

STARTEN = '''([pol, gegner, runden]) => { const s = Rennspiel.spiel;
  s.rennenStarten({ modus: 'solo', streckeId: 'wiese', welt: 'klassisch', polizei: pol, gegner, runden, schwierigkeit: 'mittel',
    autoIds: ['troc-cabrio', 'multivan'], fahrhilfe: ['wenig', 'wenig'], schaden: false, wetter: 'klar', jahreszeit: 'sommer', windStaerke: 0 });
  s.autopilot(0);
  return { fz: s.fahrzeuge.length, tn: s.rennen.teilnehmer.length, polizei: s.fahrzeuge.filter(f => f.polizei).length,
    sys: !!s.polizei, idx: s.polizei ? s.polizei.idx : null, auto: s.fahrzeuge.filter(f => f.polizei).map(f => f.auto.id),
    lichter: (() => { let n = 0; s.szene.traverse(o => { if (o.isPointLight && o.name === 'Blaulicht-Pool') n++; }); return n; })() }; }'''

ZUSTAND = '''() => { const s = Rennspiel.spiel, p = s.polizei, f = s.fahrzeuge[0], t = s.rennen.teilnehmer[0], hud = document.querySelector('.hud-polizei');
  const pf = p ? s.fahrzeuge[p.idx[0]] : null;
  return { zeit: +s._physikZeit.toFixed(2), gesperrt: p ? p.gesperrt(0) : false, rest: p ? +p.logik.rest(0).toFixed(2) : 0,
    ziel: p ? p.logik.zielVon(0) : null, phase: p ? p.logik.streifen[0] && p.logik.streifen[0].phase : null,
    stat: p ? JSON.parse(JSON.stringify(p.statistik)) : null, kmh: f.vehicle.tempoKmh, fortschritt: Math.round(t.fortschritt), runde: t.runde,
    abstand: pf ? +Math.hypot(pf.vehicle.x - f.vehicle.x, pf.vehicle.z - f.vehicle.z).toFixed(1) : null,
    polKmh: pf ? pf.vehicle.tempoKmh : null,
    hud: hud && hud.style.display !== 'none' ? hud.textContent : '', zustand: s.zustand,
    nan: s.fahrzeuge.some(g => [g.vehicle.x, g.vehicle.z, g.vehicle.heading, g.vehicle.vLaengs].some(x => !isFinite(x))) }; }'''

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

    # --- Regression: polizei false ---
    st = page.evaluate(STARTEN, [False, 3, 2])
    pruefe('polizei: false → kein Streifenwagen, kein System, 4 Fahrzeuge', st['polizei'] == 0 and not st['sys'] and st['fz'] == 4, st)
    pruefe('Standard-Einstellung polizei = false', page.evaluate("Rennspiel.spiel.einstellungen.polizei") is False)

    # --- 6 Gegner → 2 Streifenwagen ---
    st = page.evaluate(STARTEN, [True, 6, 2])
    pruefe('6 Gegner → 2 Streifenwagen, Teilnehmer 7, Fahrzeuge 9, fester Licht-Pool mit 2 Blaulicht-Lichtern (v26c: nicht mehr je Streifenwagen)', st['polizei'] == 2 and st['tn'] == 7 and st['fz'] == 9 and st['lichter'] == 2, st)

    # --- Hauptlauf ---
    st = page.evaluate(STARTEN, [True, 3, 2])
    pruefe('3 Gegner → 1 Streifenwagen (Index 4), RaceManager 4 Teilnehmer', st['polizei'] == 1 and st['tn'] == 4 and st['idx'] == [4], st)
    pruefe('Streifenwagen-Auto: Katalog „polizei" oder Ersatz', st['auto'][0] in ('polizei', 'polizei-ersatz'), st['auto'])
    page.evaluate('() => { Rennspiel.spiel.pausiert = true; }')     # Echtzeit-Schleife anhalten (ohne Pause-Fenster), nur Schnellvorlauf
    stopp = None; verlauf = []
    for sek in range(1, 201):
        page.evaluate('() => { const s = Rennspiel.spiel; s.pausiert = false; s.schnellvorlauf(1); s.pausiert = true; }')
        z = page.evaluate(ZUSTAND)
        if sek % 10 == 0: verlauf.append((sek, z['abstand'], z['ziel'], z['kmh'], z['polKmh']))
        if z['gesperrt']:
            stopp = (sek, z); break
    print('Verlauf (s, Abstand Polizei–Spieler, Ziel, km/h Spieler, km/h Polizei):', verlauf)
    pruefe('innerhalb 200 s: Spieler angehalten', stopp is not None, stopp[0] if stopp else verlauf[-3:])
    if stopp:
        # 3 s weiter (Polizei parkt daneben), dann Bild mit HUD
        # Runde 6: nach dem Anhalten bremst der Spieler noch aus (Rempeln/Abseits-Physik) → bis zu 6 s vorspulen, bis er steht
        # P4 (16.10.): Countdown früh messen. Der Stopp dauert 4 s (stoppDauer), der Spieler steht erst bei rest ≈ 1 s (bremst ~3 s aus) – dann ist die Anzeige schon „1 s“ und
        # nach 3 s weiterem Vorspulen weg. Deshalb: Messung A direkt nach Stopp-Beginn (rest 3–4 s), Messung B nach 1 s Vorspulen (rest 2–3 s), erst danach wie bisher auf „steht“ warten.
        HUD_DA = "() => { const e = document.querySelector('.hud-polizei'); return !!e && e.style.display !== 'none' && e.textContent.indexOf('Anhalten') >= 0; }"
        page.evaluate('() => { Rennspiel.spiel.pausiert = false; }')
        try: page.wait_for_function(HUD_DA, timeout=15000)      # HUD wird nur in laufenden Bildern (20 Hz) aktualisiert, SwiftShader braucht für die ersten Bilder lange
        except Exception: pass
        page.evaluate('() => { Rennspiel.spiel.pausiert = true; }')
        zA = page.evaluate(ZUSTAND)
        page.evaluate('() => { const s = Rennspiel.spiel; s.pausiert = false; s.schnellvorlauf(1); }')
        try: page.wait_for_function("(alt) => { const e = document.querySelector('.hud-polizei'); return !!e && e.textContent !== alt; }", arg=zA['hud'], timeout=15000)
        except Exception: pass
        page.evaluate('() => { Rennspiel.spiel.pausiert = true; }')
        zB = page.evaluate(ZUSTAND)
        pruefe('Countdown zählt herunter (früh gemessen, rest 4 s → 1 s später kleiner, Anzeige „Anhalten… N s“ ändert sich)',
               zA['gesperrt'] and zB['gesperrt'] and 'Anhalten' in zA['hud'] and 'Anhalten' in zB['hud'] and zB['hud'] != zA['hud'] and zB['rest'] < zA['rest'] - 0.5, (zA['rest'], zA['hud'][:22], zB['rest'], zB['hud'][:22]))
        # P4 (16.10.): Der Stopp dauert 4 s (rest zählt 4 → 0). Früher 3 s fest vorspulen + Echtzeit-Warten (pausiert blieb false) → erster Schnappschuss erst bei rest ≈ 0,8,
        # nach weiteren 3 s war die Anzeige weg. Jetzt: in 0,5-s-Schritten nur so lange vorspulen, bis er steht (< 3 km/h), dann Spiel anhalten, bevor gewartet wird.
        page.evaluate('() => { const s = Rennspiel.spiel; s.pausiert = false; s.kameras[0]._erstesMal = true; s.schnellvorlauf(1); s.pausiert = true; }')
        for _ in range(6):
            if abs(page.evaluate(ZUSTAND)['kmh']) < 3: break
            page.evaluate('() => { const s = Rennspiel.spiel; s.pausiert = false; s.schnellvorlauf(0.5); s.pausiert = true; }')
        # HUD läuft mit 20 Hz in frame(); SwiftShader braucht für die ersten Frames mit Blaulicht-Lichtern lange → warten
        try: page.wait_for_function("() => { const e = document.querySelector('.hud-polizei'); return e && e.textContent.indexOf('Anhalten') >= 0; }", timeout=8000)
        except Exception: pass
        page.wait_for_timeout(1500)     # Kamera hinter dem Spieler (Schnellvorlauf bewegt sie nicht)
        page.evaluate('() => { Rennspiel.spiel.pausiert = true; }')
        page.wait_for_timeout(150)
        z1 = page.evaluate(ZUSTAND)
        page.screenshot(path=os.path.join(out, 'polizei_stopp.png'))
        print('Stopp-Zustand:', json.dumps(z1, ensure_ascii=False))
        pruefe('HUD zeigt „🚨 Polizei! Anhalten… N s"', 'Polizei! Anhalten' in z1['hud'] and ' s' in z1['hud'], z1['hud'])
        pruefe('Spieler steht (< 3 km/h)', abs(z1['kmh']) < 3, z1['kmh'])
        pruefe('Streifenwagen daneben (≤ 12 m), Phase halt', z1['abstand'] is not None and z1['abstand'] <= 12 and z1['phase'] == 'halt', (z1['abstand'], z1['phase']))
        page.evaluate('() => { const s = Rennspiel.spiel; s.pausiert = false; s.schnellvorlauf(4.5); }')
        page.wait_for_timeout(800)      # P4: HUD läuft mit 20 Hz, SwiftShader braucht länger, bis die Anzeige verschwindet
        z3 = page.evaluate(ZUSTAND)
        pruefe('nach 10 s frei (Freigabe), HUD-Countdown weg', not z3['gesperrt'] and z3['stat']['freigaben'] >= 1 and 'Anhalten' not in z3['hud'], z3)
        page.evaluate('() => { const s = Rennspiel.spiel; s.schnellvorlauf(8); s.pausiert = true; }')
        z4 = page.evaluate(ZUSTAND)
        pruefe('danach fährt er weiter (+ Fortschritt, Tempo > 40 km/h)', z4['fortschritt'] > z3['fortschritt'] + 60 and z4['kmh'] > 40, (z3['fortschritt'], z4['fortschritt'], z4['kmh']))
    # Rest des Rennens bis zur Ergebnis-Tafel
    for _ in range(80):
        page.evaluate('() => { const s = Rennspiel.spiel; if (s.zustand === "rennen") { s.pausiert = false; s.schnellvorlauf(5); s.pausiert = true; } }')
        if page.evaluate('Rennspiel.spiel.zustand') == 'ergebnis': break
    z = page.evaluate(ZUSTAND)
    st = z['stat']
    je = {}
    for a in (st['anhaltungen'] if st else []): je[(a['nr'], a['runde'])] = je.get((a['nr'], a['runde']), 0) + 1
    pruefe('max. 1 Anhaltung je Auto und Runde', all(v == 1 for v in je.values()), st['anhaltungen'] if st else None)
    pruefe('keine NaN', not z['nan'])
    page.wait_for_timeout(1200)
    erg = page.evaluate('''() => ({ zustand: Rennspiel.spiel.zustand, zeilen: Rennspiel.spiel.ergebnis ? Rennspiel.spiel.ergebnis.zeilen.map(z => z.name) : null,
      dom: Array.from(document.querySelectorAll('#ergebnis tbody tr')).map(tr => tr.children[1] ? tr.children[1].textContent.trim() : '') })''')
    page.screenshot(path=os.path.join(out, 'polizei_ergebnis.png'))
    pruefe('Ergebnis-Tafel: 4 Zeilen, keine Polizei', erg['zustand'] == 'ergebnis' and erg['zeilen'] and len(erg['zeilen']) == 4 and len(erg['dom']) == 4 and
           not any('Polizei' in n for n in erg['dom'] + erg['zeilen']), erg)
    # Nochmal + Abbau
    page.evaluate('() => Rennspiel.spiel.rennenStarten()')
    page.wait_for_timeout(300)
    n = page.evaluate('''() => { let n = 0; Rennspiel.spiel.szene.traverse(o => { if (o.isPointLight && o.name === 'Blaulicht-Pool') n++; }); return [n, Rennspiel.spiel.fahrzeuge.filter(f => f.polizei).length]; }''')
    pruefe('Nochmal: genau 2 Licht-Pool-Lichter, 1 Streifenwagen', n == [2, 1], n)
    page.evaluate('() => Rennspiel.spiel.zumMenue()')
    page.wait_for_timeout(300)
    n = page.evaluate('''() => { let n = 0; Rennspiel.spiel.szene.traverse(o => { if (o.isPointLight && o.name === 'Blaulicht-Pool') n++; }); return [n, !!Rennspiel.spiel.polizei]; }''')
    pruefe('Menü: Polizei abgebaut (keine Lichter, kein System)', n == [0, False], n)
    pruefe('keine JS-Fehler', not fehler, fehler[:3])
    browser.close()

print('\n' + ('Alle Polizei-Browsertests OK' if all(ok for _, ok in pruef) else str(sum(1 for _, ok in pruef if not ok)) + ' FEHLER'))
sys.exit(0 if all(ok for _, ok in pruef) else 1)
