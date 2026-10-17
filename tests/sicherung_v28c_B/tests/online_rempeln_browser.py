"""v28 W5: PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers python3 tests/online_rempeln_browser.py [ausgabeordner]

Zwei Browser (wie Vater: 2 Fenster auf einem Mac, localhost) gegen server/server.js:
 a) Speicherstand: frisch → Rempeln; alter Stand {kollisionen:false} ohne kollisionenGewaehlt → Rempeln;
    selbst gewählt {kollisionen:false, kollisionenGewaehlt:true} → Geister bleibt; altes true bleibt true
 b) Lobby: Host ohne Klick → Rempeln aktiv, Gast sieht „Rempeln an“, Texte „🚗💥 Rempeln (normal)“ / „👻 Geister – durchfahren“
 c) Rennen (Wiese, 0 Computer): Host steht, Gast fährt auf das Host-Auto. Gemessen in der GAST-Sicht je ~40 ms die
    ANGEZEIGTEN Autos (eigenes = Vorhersage, fremdes = NetzAnzeige) als Rechtecke (Kollisionen.obbAbstand, < 0 = Überlappung):
    kein optisches Durchfahren (größte Überlappung < 0,5 m, Mitten nie näher als die halbe Fahrzeuglänge), Gast bremst ab.
    Dazu der Ping im HUD.
"""
import sys, os, socket, subprocess, time, json
from playwright.sync_api import sync_playwright

basis = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
out = sys.argv[1] if len(sys.argv) > 1 else os.path.join(basis, 'tests', 'out', 'v28C')
os.makedirs(out, exist_ok=True)
fails, fehler = [], []

def pruefe(name, ok, info=''):
    if not ok: fails.append(name)
    print(('OK   ' if ok else 'FAIL ') + name + (' – ' + str(info) if info != '' else ''), flush=True)

s = socket.socket(); s.bind(('127.0.0.1', 0)); port = s.getsockname()[1]; s.close()
srv = subprocess.Popen(['node', os.path.join(basis, 'server', 'server.js'), '--port', str(port), '--host', '127.0.0.1'],
                       stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
url = 'http://127.0.0.1:%d/' % port
for _ in range(50):
    try:
        socket.create_connection(('127.0.0.1', port), timeout=0.2).close(); break
    except OSError: time.sleep(0.1)

MESSUNG = """() => { const s = Rennspiel.spiel, o = s.online, R = Rennspiel, ich = s.fahrzeuge[o.du], er = s.fahrzeuge[0];
  const ov = R.Kollisionen.obbAbstand(ich.vehicle, er.vehicle);
  return { ov, d: Math.hypot(ich.vehicle.x - er.vehicle.x, ich.vehicle.z - er.vehicle.z), v: o.vorhersage.vp.vLaengs, L: (ich.vehicle.daten.laenge + er.vehicle.daten.laenge) / 2,
    stoesse: o.vorhersage.stat.stoesse, rz: s.rennen.zustand, ping: o.verb && o.verb.ping }; }"""

try:
    with sync_playwright() as p:
        browser = p.chromium.launch(args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
        def seite(name):
            pg = browser.new_context(viewport={'width': 1280, 'height': 800}).new_page()
            pg.on('pageerror', lambda e: fehler.append(name + ': ' + str(e)))
            pg.on('console', lambda m: fehler.append(name + ' console.error: ' + m.text) if m.type == 'error' else None)
            return pg
        # ---------- a) Speicherstände ----------
        pr = seite('Speicher')
        pr.goto(url); pr.wait_for_function('window.Rennspiel && Rennspiel.spiel && Rennspiel.spiel.einstellungen', timeout=90000, polling=200)
        frisch = pr.evaluate('Rennspiel.spiel.einstellungen.kollisionen')
        erg = {}
        for name, stand in [('alt_false', {'kollisionen': False}), ('gewaehlt_false', {'kollisionen': False, 'kollisionenGewaehlt': True}),
                            ('alt_true', {'kollisionen': True}), ('gewaehlt_true', {'kollisionen': True, 'kollisionenGewaehlt': True})]:
            pr.evaluate("(st) => localStorage.setItem(Rennspiel.config.ui.speicherSchluessel, JSON.stringify(st))", stand)
            pr.reload(); pr.wait_for_function('window.Rennspiel && Rennspiel.spiel && Rennspiel.spiel.einstellungen', timeout=90000, polling=200)
            erg[name] = pr.evaluate('Rennspiel.spiel.einstellungen.kollisionen')
        pruefe('a) Speicher: frisch → Rempeln; alter Stand false (nur Standard) → Rempeln; selbst gewählt Geister bleibt; true bleibt',
               frisch is True and erg == {'alt_false': True, 'gewaehlt_false': False, 'alt_true': True, 'gewaehlt_true': True}, [frisch, erg])
        pr.context.close()
        # ---------- b) Lobby ----------
        host = seite('Host')
        host.goto(url); host.wait_for_function('window.Rennspiel && Rennspiel.spiel', timeout=90000, polling=200)
        host.wait_for_timeout(500)
        for _ in range(4): host.keyboard.press('ArrowRight'); host.wait_for_timeout(80)
        host.keyboard.press('Enter'); host.wait_for_timeout(300)
        host.keyboard.press('Enter')
        host.wait_for_function("Rennspiel.spiel.menue.onlineUi.lobby !== null && Rennspiel.spiel.menue.onlineUi.ansicht === 'lobby'", timeout=15000, polling=200)
        code = host.evaluate('Rennspiel.spiel.menue.onlineUi.lobby.code')
        gast = seite('Gast')
        gast.goto(url + '?raum=' + code)
        gast.wait_for_function("window.Rennspiel && Rennspiel.spiel && Rennspiel.spiel.menue.onlineUi && ['code','lobby'].includes(Rennspiel.spiel.menue.onlineUi.ansicht)", timeout=90000, polling=200)
        if gast.evaluate("Rennspiel.spiel.menue.onlineUi.ansicht") == 'code': gast.keyboard.press('Enter')
        gast.wait_for_function("Rennspiel.spiel.menue.onlineUi.ansicht === 'lobby'", timeout=15000, polling=200)
        host.wait_for_function("Rennspiel.spiel.menue.onlineUi.lobby.spieler.length === 2", timeout=15000, polling=200)
        host.wait_for_timeout(400)
        lb = host.evaluate("""(() => { const an = document.querySelector('[data-a="wert:kollisionen:an"]'), aus = document.querySelector('[data-a="wert:kollisionen:aus"]');
          return { an: an && an.textContent.trim(), aus: aus && aus.textContent.trim(), aktiv: !!an && an.classList.contains('aktiv'), server: Rennspiel.spiel.menue.onlineUi.lobby.einstellungen.kollisionen }; })()""")
        gz = gast.evaluate("document.querySelector('.on-zusammen').textContent")
        pruefe('b) Lobby ohne Klick: Rempeln aktiv (Server true), Texte kindgerecht, Gast sieht „Rempeln an“',
               lb['aktiv'] and lb['server'] is True and lb['an'] == '🚗💥 Rempeln (normal)' and lb['aus'] == '👻 Geister – durchfahren' and 'Rempeln an' in gz, [lb, gz[-30:]])
        host.screenshot(path=os.path.join(out, 'w5_lobby_host.png'))
        # ---------- c) Rennen ----------
        for a in ['wert:strecke:wiese', 'wert:gegner:0', 'wert:runden:1']:
            host.click('[data-a="%s"]' % a); host.wait_for_timeout(350)
        gast.keyboard.press('Space')
        host.wait_for_function("Rennspiel.spiel.menue.onlineUi.lobby.spieler[1].bereit === true", timeout=10000, polling=200)
        host.keyboard.press('Enter')
        for pg in (host, gast):
            pg.wait_for_function("Rennspiel.spiel.zustand === 'online' && Rennspiel.spiel.online && Rennspiel.spiel.online.empfangen", timeout=60000, polling=200)
        info = gast.evaluate("(() => { const o = Rennspiel.spiel.online; return { koll: o.kollisionen, sv: o.vorhersage.stellvertreter.length }; })()")
        pruefe('c) Rennen mit Rempeln: Vorhersage des Gastes kennt das Host-Auto (Stellvertreter)', info['koll'] and info['sv'] == 1, info)
        # Host bremst / steht, Gast steuert auf das Host-Auto zu (wie tests/online_test.py g)
        host.evaluate("""() => { const s = Rennspiel.spiel, o = s.online; s.input.steuerung = (nr) => (nr === 0 && o.vorhersage.vp.vLaengs > 0.3 ? { gas: 0, bremse: 1, lenkung: 0 } : { gas: 0, bremse: 0, lenkung: 0 }); return true; }""")
        gast.evaluate("""() => { const s = Rennspiel.spiel, o = s.online, R = Rennspiel;
          s.input.steuerung = (nr) => { if (nr !== 0) return { gas: 0, bremse: 0, lenkung: 0 };
            const ich = o.vorhersage.vp, ziel = s.fahrzeuge[0].vehicle;
            let d = R.headingAus(ziel.x - ich.x, ziel.z - ich.z) - ich.heading;
            while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
            return { gas: 1, bremse: 0, lenkung: Math.max(-1, Math.min(1, -3 * Math.sin(d))) }; };
          return true; }""")
        gast.wait_for_function("Rennspiel.spiel.rennen.gasErlaubt === true", timeout=30000, polling=200)
        werte, t0 = [], time.time()
        while time.time() - t0 < 14:
            werte.append(gast.evaluate(MESSUNG)); gast.wait_for_timeout(40)
            if len(werte) % 60 == 0: gast.screenshot(path=os.path.join(out, 'w5_gast_%02d.png' % (len(werte) // 60)))
        nah = [w for w in werte if w['d'] < 12]
        ovmin = min(w['ov'] for w in werte); dmin = min(w['d'] for w in werte); L = werte[0]['L']
        vmax = max(w['v'] for w in werte); stoss = werte[-1]['stoesse']
        pruefe('c) Gast-Sicht: eigenes Auto fährt optisch NICHT durch das Host-Auto (Überlappung < 0,5 m, Mitten ≥ halbe Länge), Stöße in der Vorhersage',
               len(nah) > 5 and ovmin > -0.5 and dmin > 0.5 * L and stoss >= 1,
               'Messungen %d (davon nah %d), Rechteck min %.2f m, Mitten min %.2f m (Länge %.2f), Stöße %d, v max %.1f' % (len(werte), len(nah), ovmin, dmin, L, stoss, vmax))
        gast.screenshot(path=os.path.join(out, 'w5_gast_ende.png'))
        pings = [w['ping'] for w in werte if isinstance(w['ping'], (int, float))]
        pt = gast.evaluate("Rennspiel.spiel.online.pingEl && Rennspiel.spiel.online.pingEl.textContent")
        # nur Info: hier rechnen 2 Browser mit Software-Grafik (SwiftShader) auf einer CPU – der HUD-Ping enthält die Bildzeit des
        # überlasteten Hauptthreads. Der reine Netz-Ping localhost steht in tests/test_online_rempeln.js (P, ~0–1 ms).
        print('INFO c) HUD-Ping im Test-Browser (Software-Grafik, belastet): min %s / max %s ms, HUD „%s“' % (round(min(pings)) if pings else None, round(max(pings)) if pings else None, pt), flush=True)
        with open(os.path.join(out, 'w5_browser_messung.json'), 'w') as f: json.dump(werte, f)
        browser.close()
finally:
    srv.terminate()
echt = [f for f in fehler if 'favicon' not in f]
pruefe('keine JS-Fehler', not echt, echt[:5])
print('\n%d FAIL' % len(fails))
sys.exit(1 if fails else 0)
