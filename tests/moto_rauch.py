#!/usr/bin/env python3
"""Browser-Rauchtest Motorrad-Modus (Stufe M1).
Aufruf: python3 tests/moto_rauch.py
Startet einen kleinen lokalen http-Server (Repo-Wurzel), lädt Motorrad.html und prüft:
  - Menü: nur Crossmaschinen wählbar, keine Online-Karte, Zeilen Schaden/Verkehr ausgeblendet, Fahrzeugwahl-Bild
  - Rennen Solo mit 3 KI auf der Wiese (Spieler per Autopilot), ~15 s Echtzeit: keine JS-Fehler, keine NaN,
    Schräglage folgt der Kurvenrichtung (Vorzeichen), Bild „Kurve von hinten“
  - erzwungener Purzelbaum (Bild), danach wieder aufrecht
  - Zweispieler-Split startet fehlerfrei
  - Autorennen.html lädt weiterhin fehlerfrei (9 Autos wählbar, kein Motorrad-Modus)
Bilder: tests/out/moto/"""
import os, sys, json, time, socket, subprocess
from playwright.sync_api import sync_playwright

basis = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
out = os.path.join(basis, 'tests', 'out', 'moto'); os.makedirs(out, exist_ok=True)

def freier_port():
    s = socket.socket(); s.bind(('127.0.0.1', 0)); p = s.getsockname()[1]; s.close(); return p

port = freier_port()
server = subprocess.Popen([sys.executable, '-m', 'http.server', str(port), '--bind', '127.0.0.1'], cwd=basis, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1.0)
basisurl = f'http://127.0.0.1:{port}/'
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
ergebnisse = []
def pruefe(name, ok, info=''):
    ergebnisse.append(bool(ok)); print(('OK   ' if ok else 'FEHL ') + name + (f'  ({info})' if info != '' else ''))

try:
    with sync_playwright() as p:
        browser = p.chromium.launch(args=ARGS)
        # ---------------- Motorrad.html ----------------
        page = browser.new_page(viewport={'width': 1280, 'height': 800})
        fehler = []
        page.on('pageerror', lambda e: fehler.append('pageerror: ' + str(e)))
        page.on('console', lambda m: fehler.append('console.error: ' + m.text) if m.type == 'error' else None)
        page.on('requestfailed', lambda r: fehler.append('requestfailed: ' + r.url))
        page.goto(basisurl + 'Motorrad.html'); page.wait_for_timeout(1500)
        info = page.evaluate('''() => { const R = Rennspiel; return { moto: window.MOTORRAD === true, titel: document.title,
          wb: R.carCatalog.waehlbare().map(a => a.id), haken: R.Moto.haken, key: R.config.ui.speicherSchluessel,
          ids: R.spiel.einstellungen.autoIds, schaden: R.spiel.einstellungen.schaden, kr: R.spiel.einstellungen.krankenwagen,
          ab: R.spiel.einstellungen.abschleppwagen, gf: R.spiel.einstellungen.geisterfahrer }; }''')
        pruefe('Motorrad-Modus aktiv, Titel „Motorrad-Rennen“', info['moto'] and info['titel'] == 'Motorrad-Rennen')
        pruefe('nur 4 Crossmaschinen wählbar', len(info['wb']) == 4 and all(i.startswith('crossmaschine') for i in info['wb']), ','.join(info['wb']))
        pruefe('Haken gesetzt (R.dach.frame, Spiel.physikSchritt)', info['haken'] == ['R.dach.frame', 'Spiel.physikSchritt'], info['haken'])
        pruefe('Voreinstellungen: Schaden, Krankenwagen, Abschleppwagen, Geisterfahrer aus', not (info['schaden'] or info['kr'] or info['ab'] or info['gf']))
        pruefe('Autowahl zeigt auf Crossmaschinen (nicht mehr Standard-Autos)', all(i.startswith('crossmaschine') for i in info['ids']), info['ids'])
        pruefe('eigener Speicher-Schlüssel', info['key'].endswith('.motorrad'), info['key'])

        # Menü: Modus-Schritt (Online-Karte weg), Fahrzeugwahl-Schritt (Bild)
        page.evaluate('() => Rennspiel.spiel.menue.zeigen(0)'); page.wait_for_timeout(500)
        online = page.evaluate("() => !!document.querySelector('.online-karte')")
        pruefe('Menü: Online-Karte ausgeblendet', not online)
        page.evaluate('() => Rennspiel.spiel.menue.zeigen(4)'); page.wait_for_timeout(500)
        sichtbar = page.evaluate('''() => ['schaden', 'geister', 'krankenwagen', 'abschleppwagen'].map(k => { const e = document.querySelector('[data-a^="wert:' + k + ':"]'); return e ? !!e.offsetParent : false; })''')
        pruefe('Menü: Zeilen Schaden und Verkehr (Geister/Kranken-/Abschleppwagen) ausgeblendet', not any(sichtbar), sichtbar)
        page.evaluate('() => Rennspiel.spiel.menue.zeigen(3)'); page.wait_for_timeout(2500)
        karten = page.evaluate("() => document.querySelectorAll('#menue .karte, #menue [data-a^=\"auto\"]').length")
        page.screenshot(path=os.path.join(out, 'moto_menue_fahrzeugwahl.png'))
        print('      Bild: tests/out/moto/moto_menue_fahrzeugwahl.png (Kacheln/Karten im DOM: %d)' % karten)

        # Rennen: Solo, 3 KI, Wiese, Autopilot
        page.evaluate('''() => Rennspiel.spiel.rennenStarten({ modus: 'solo', streckeId: 'wiese', autoIds: ['crossmaschine', 'crossmaschine-rot'],
          runden: 2, gegner: 3, schwierigkeit: 'mittel', fahrhilfe: ['wenig', 'wenig'] })''')
        page.wait_for_timeout(800)
        page.evaluate('() => Rennspiel.spiel.autopilot(0, true)')
        start = page.evaluate('''() => { const s = Rennspiel.spiel; return { n: s.fahrzeuge.length, ids: s.fahrzeuge.map(f => f.auto.id), farben: s.fahrzeuge.map(f => f.mesh.userData.lackFarbe),
          moto: s.fahrzeuge.every(f => f.mesh.userData.moto === true), schaden: !!(s.schaden && s.schaden.an), abschlepp: !!s.abschlepp, zustand: s.zustand }; }''')
        pruefe('Rennen: 4 Fahrzeuge, alle Motorradmodell, Schaden/Abschleppwagen aus', start['n'] == 4 and start['moto'] and not start['schaden'] and not start['abschlepp'], start['ids'])
        pruefe('KI-Gegner: andere Farben als der Spieler, untereinander verschieden', len(set(start['farben'])) == 4, [hex(c) for c in start['farben']])

        MESS = '''() => { const s = Rennspiel.spiel; return s.fahrzeuge.map((f, i) => { const u = f.mesh.userData, z = f.motoZ;
          return { lean: u.lage.rotation.z, flip: u.purzel.rotation.x, y: u.purzel.position.y, kmh: Math.round(f.vehicle.tempoKmh), heading: f.anzeige.heading,
            nan: [f.vehicle.x, f.vehicle.z, f.vehicle.heading, u.lage.rotation.z, f.mesh.position.x].some(v => !isFinite(v)), purzel: z ? z.purzel.anzahl : -1 }; }); }'''
        t0 = time.time(); bild = False; letzter = None; stimmt = 0; gesamt = 0; maxl = 0.0; kmh_max = 0
        while time.time() - t0 < 16:
            page.wait_for_timeout(120)
            m = page.evaluate(MESS)
            sp = m[0]; kmh_max = max(kmh_max, sp['kmh'])
            maxl = max(maxl, abs(sp['lean']))
            if letzter is not None and sp['kmh'] > 25:
                dh = (sp['heading'] - letzter['heading'] + 3.14159265) % 6.2831853 - 3.14159265
                if abs(dh) > 0.004:              # sichtbare Kurve: Heading wächst = Linkskurve = Lage positiv
                    gesamt += 1; stimmt += 1 if (dh > 0) == (sp['lean'] > 0.03) or (dh < 0) == (sp['lean'] < -0.03) else 0
            letzter = sp
            if not bild and abs(sp['lean']) > 0.28 and sp['kmh'] > 40:
                page.screenshot(path=os.path.join(out, 'moto_kurve_von_hinten.png')); bild = True
        if not bild:
            page.screenshot(path=os.path.join(out, 'moto_kurve_von_hinten.png'))
        print('      Bild: tests/out/moto/moto_kurve_von_hinten.png (starke Kurvenlage gefunden: %s, max. Lage %.0f°, max. Tempo %d km/h)' % (bild, maxl * 57.3, kmh_max))
        m = page.evaluate(MESS)
        pruefe('keine NaN in Fahrzeug/Pose', not any(x['nan'] for x in m))
        pruefe('Spieler fährt (Autopilot): Tempo > 40 km/h erreicht', kmh_max > 40, kmh_max)
        pruefe('Schräglage entsteht in Kurven (max. > 15°) und bleibt ≤ 45°', 0.26 < maxl <= 0.7854 + 1e-6, '%.1f°' % (maxl * 57.3))
        pruefe('Vorzeichen live: Lage folgt der Kurvenrichtung (≥ 80 % der Kurvenbilder)', gesamt >= 5 and stimmt / max(1, gesamt) >= 0.8, f'{stimmt}/{gesamt}')

        # Purzelbaum erzwingen (gleicher Weg wie ein harter Stoß: purzelStart) und Mitte als Bild
        page.evaluate('''() => { const S = Rennspiel.Moto.schraeglage, f = Rennspiel.spiel.fahrzeuge[0]; f.motoZ.purzel.abkling = 0; f.motoZ.purzel.aktiv = false; window.__ok = S.purzelStart(f.motoZ); }''')
        page.wait_for_timeout(560)
        mitte = page.evaluate(MESS)[0]
        page.screenshot(path=os.path.join(out, 'moto_purzelbaum.png'))
        print('      Bild: tests/out/moto/moto_purzelbaum.png (Mitte: Drehung %.2f rad, Hüpfer-Höhe y=%.2f)' % (mitte['flip'], mitte['y']))
        page.wait_for_timeout(1400)
        ende = page.evaluate(MESS)[0]
        pruefe('Purzelbaum: in der Mitte gedreht und angehoben', abs(mitte['flip']) > 1.5 and mitte['y'] > 1.0)
        pruefe('Purzelbaum: nach ~2 s wieder aufrecht (Drehung 0, Höhe normal)', ende['flip'] == 0 and abs(ende['y'] - 0.7) < 1e-9, f"{ende['flip']:.3f} / {ende['y']:.2f}")
        # harter Stoß über das echte Signal (Physikschritt): Bande-Wert setzen -> der Haken liest ihn nach dem Schritt
        page.evaluate('''() => { const s = Rennspiel.spiel, f = s.fahrzeuge[1]; f.motoZ.purzel.abkling = 0; f.motoZ.purzel.aktiv = false; window.__vor = f.motoZ.purzel.anzahl;
          const orig = Rennspiel.Kollisionen.bande; Rennspiel.Kollisionen.bande = (v, st) => (v === f.vehicle ? 9 : orig(v, st)); window.__orig = orig; }''')
        page.wait_for_timeout(300)
        nach = page.evaluate('''() => { const f = Rennspiel.spiel.fahrzeuge[1]; Rennspiel.Kollisionen.bande = window.__orig; return f.motoZ.purzel.anzahl - window.__vor; }''')
        pruefe('harter Anprall (Bande 9 m/s, echte Kollisions-Signale) löst Purzelbaum aus', nach >= 1, nach)
        page.evaluate('() => Rennspiel.spiel.autopilot(0, false)')

        # Schnellvorlauf: Rennen zu Ende laufen lassen (keine Fehler im Ergebnis, Physik unverändert)
        page.evaluate('() => Rennspiel.spiel.autopilot(0, true)')
        page.evaluate('() => Rennspiel.spiel.schnellvorlauf(120)'); page.wait_for_timeout(400)
        z = page.evaluate('''() => { const s = Rennspiel.spiel; return { runden: s.rennen.teilnehmer.map(t => t.runde), nan: s.fahrzeuge.some(f => !isFinite(f.vehicle.x)), p: s.fahrzeuge.map(f => f.motoZ ? f.motoZ.purzel.anzahl : 0) }; }''')
        pruefe('Schnellvorlauf 120 s: KI fährt Runden, keine NaN', max(z['runden']) >= 1 and not z['nan'], f"Runden {z['runden']}, Stürze {z['p']}")

        # Zweispieler-Split
        page.evaluate('''() => Rennspiel.spiel.rennenStarten({ modus: 'zwei', streckeId: 'wiese', autoIds: ['crossmaschine-blau', 'crossmaschine-gruen'], runden: 1, gegner: 2, schwierigkeit: 'mittel', fahrhilfe: ['wenig', 'wenig'] })''')
        page.wait_for_timeout(2500)
        zwei = page.evaluate('''() => { const s = Rennspiel.spiel; return { n: s.fahrzeuge.length, kam: s.kameras.length, huds: s.huds.length, moto: s.fahrzeuge.every(f => f.mesh.userData.moto) }; }''')
        page.screenshot(path=os.path.join(out, 'moto_zweispieler.png'))
        pruefe('Zweispieler-Split: 2 Kameras/HUDs, 4 Motorräder', zwei['kam'] == 2 and zwei['huds'] == 2 and zwei['n'] == 4 and zwei['moto'], zwei)
        # Rückkehr ins Menü und Garage öffnen (Vorschau mit Motorrad-Modell)
        page.evaluate('() => { const s = Rennspiel.spiel; s.zurueckInsMenue ? s.zurueckInsMenue() : null; }')
        page.wait_for_timeout(500)
        pruefe('keine JS-Fehler in Motorrad.html', not fehler, fehler[:4])
        page.close()

        # ---------------- Autorennen.html unverändert ----------------
        page2 = browser.new_page(viewport={'width': 1280, 'height': 800})
        fehler2 = []
        page2.on('pageerror', lambda e: fehler2.append('pageerror: ' + str(e)))
        page2.on('console', lambda m: fehler2.append('console.error: ' + m.text) if m.type == 'error' else None)
        page2.goto(basisurl + 'Autorennen.html'); page2.wait_for_timeout(2000)
        a = page2.evaluate('''() => ({ moto: window.MOTORRAD, n: Rennspiel.carCatalog.waehlbare().length, titel: document.title, moto_js: !!(Rennspiel.Moto), key: Rennspiel.config.ui.speicherSchluessel })''')
        pruefe('Autorennen.html: kein Motorrad-Modus, 9 Autos wählbar, Schlüssel unverändert', a['moto'] is None and a['n'] == 9 and not a['moto_js'] and not a['key'].endswith('.motorrad'), a)
        page2.evaluate('''() => Rennspiel.spiel.rennenStarten({ modus: 'solo', streckeId: 'wiese', autoIds: ['troc-cabrio', 'multivan'], runden: 1, gegner: 2, schwierigkeit: 'mittel', fahrhilfe: ['wenig', 'wenig'] })''')
        page2.wait_for_timeout(3000)
        page2.evaluate('() => Rennspiel.spiel.schnellvorlauf(20)'); page2.wait_for_timeout(500)
        pruefe('Autorennen.html: Rennen startet, 0 JS-Fehler', not fehler2 and page2.evaluate('() => Rennspiel.spiel.fahrzeuge.length') == 3, fehler2[:3])
        page2.close()
        browser.close()
finally:
    server.terminate()

print('\n%d/%d Prüfungen bestanden' % (sum(ergebnisse), len(ergebnisse)))
sys.exit(0 if all(ergebnisse) else 1)
