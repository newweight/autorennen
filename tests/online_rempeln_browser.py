"""v28 W5: PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers python3 tests/online_rempeln_browser.py [ausgabeordner]

Zwei Browser (wie Vater: 2 Fenster auf einem Mac, localhost) gegen server/server.js:
 a) Speicherstand: frisch → Rempeln; alter Stand {kollisionen:false} ohne kollisionenGewaehlt → Rempeln;
    selbst gewählt {kollisionen:false, kollisionenGewaehlt:true} → Geister bleibt; altes true bleibt true
 b) Lobby: Host ohne Klick → Rempeln aktiv, Gast sieht „Rempeln an“, Texte „🚗💥 Rempeln (normal)“ / „👻 Geister – durchfahren“
 c) Rennen (Wiese, 0 Computer): Host steht (bremst), Gast fährt auf das Host-Auto und schiebt es (Gas gehalten).
    v28c: Der GAST hängt hinter einem Latenz-Proxy (tests/latenz_proxy.js, Rundlauf 0/50/100/200 ms nacheinander im selben Rennen, je 12 s),
    der Host direkt (wie Vater am Mac + Freund über Tailscale). Gemessen wird IN BEIDEN SEITEN nach jedem Physikschritt (Hook auf
    online.physikSchritt, kein Abfragen im 40-ms-Takt mehr; gemessen wird ohne Zeichnen – Software-Grafik schafft auf 2 Kernen sonst nur 3–5 Bilder/s –,
    für die Bilder wird kurz gezeichnet) als Rechteck-Abstand (Kollisionen.obbAbstand, < 0 = Überlappung):
      Anzeige (eigenes Auto wie gezeichnet gegen das angezeigte andere Auto), Vorhersage (eigene Vorhersage ohne Korrektur/Trennung gegen das
      angezeigte andere), dazu die SERVER-Positionen beider Autos aus jedem empfangenen Zustand. Beide Seiten müssen takten: ≥ 15 Physikschritte/s
      (auf dem Test-Rechner, 2 Kerne + Parallel-Last, schaffen sie 25–38/s und stehen beide gleichzeitig bis 0,6–2,2 s still = Rechner-Last, nur Info;
      gemessen wird je Schritt, das Spiel holt Eingaben nach – NetzEingabeTakt; den exakten 60-Hz-Fall misst tests/test_online_rempeln.js Block U).
    Bestanden je Latenz: Gast- und Host-Anzeige ≤ 0,3 m dauerhaft (kurze Spitzen ≤ 0,8 m für ≤ 150 ms), Server ≤ 0,05 m (Rundung), Stöße in der
    Vorhersage. Bilder der Gast-Sicht beim Kontakt: <ausgabe>/rempeln_<ms>ms.png (Standard tests/out/v28c). Dazu der Ping im HUD.
"""
import sys, os, socket, subprocess, time, json
from playwright.sync_api import sync_playwright

basis = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
out = sys.argv[1] if len(sys.argv) > 1 else os.path.join(basis, 'tests', 'out', 'v28c')
LATENZEN = [0, 50, 100, 200]
PHASE_S = 12
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
# v28c: Gast über einen Latenz-Proxy (Rundlauf per stdin umschaltbar)
prx = subprocess.Popen(['node', os.path.join(basis, 'tests', 'latenz_proxy.js'), str(port), '0'], stdin=subprocess.PIPE, stdout=subprocess.PIPE, text=True)
pport = int(prx.stdout.readline().split()[1])
gurl = 'http://127.0.0.1:%d/' % pport
def rtt(ms):
    prx.stdin.write('rtt %d\n' % ms); prx.stdin.flush(); prx.stdout.readline()

# v28c: Rekorder je Seite – nach JEDEM Physikschritt (Anzeige/Vorhersage) und je empfangenem Zustand (Server-Positionen)
REKORDER = """() => { const s = Rennspiel.spiel, o = s.online, K = Rennspiel.Kollisionen, er = o.du === 0 ? 1 : 0;
  const rec = window.__rec = { st: [], zu: [] };
  // Software-Grafik (SwiftShader) auf 2 Kernen schafft sonst nur 3–5 Bilder/s → die Messung (Logik der Anzeige) läuft ohne Zeichnen; für Bilder kurz an
  window.__zAus = () => { s.zeichnen = function () {}; }; window.__zAn = () => { delete s.zeichnen; }; window.__zAus();
  const box = (a, d) => ({ x: a[0], z: a[1], heading: a[3], daten: d });
  const ps = o.physikSchritt;
  o.physikSchritt = function (dt) { ps.call(this, dt); const V = o.vorhersage; if (!V || o.phase !== 'rennen') return;
    const ich = s.fahrzeuge[o.du].vehicle, an = s.fahrzeuge[er].vehicle;
    rec.st.push([performance.now(), K.obbAbstand(ich, an), K.obbAbstand(V.vp, an), Math.hypot(ich.x - an.x, ich.z - an.z), V.stat.stoesse, V.trenn ? Math.hypot(V.trenn.x, V.trenn.z) : 0, o.verb && o.verb.ping]); };
  const ze = o.zustandEmpfangen;
  o.zustandEmpfangen = function (z) { ze.call(this, z); if (z && z.a && z.a[0] && z.a[1]) rec.zu.push([performance.now(), K.obbAbstand(box(z.a[0], s.fahrzeuge[0].vehicle.daten), box(z.a[1], s.fahrzeuge[1].vehicle.daten))]); };
  return true; }"""
HOLEN = "() => { const r = window.__rec, x = { st: r.st, zu: r.zu }; r.st = []; r.zu = []; return x; }"

def auswerten(st):
    """tiefste Überlappung (m), längste Zeit am Stück > 0,3 m (ms), Schritte/s, Kontakt-Schritte (Mitten < 6 m)."""
    tief, lauf0, lmax, n = 0.0, None, 0.0, 0
    # None = Marke um ein Bildschirmfoto (dort wird kurz gezeichnet, die Seite steht) → Lücken über die Marke zählen nicht
    luecke = max([0.0] + [st[i][0] - st[i - 1][0] for i in range(1, len(st)) if st[i] and st[i - 1]])
    st = [w for w in st if w]
    for w in st:
        ov = w[1]
        tief = max(tief, -ov)
        if ov < -0.3:
            if lauf0 is None: lauf0 = w[0]
            lmax = max(lmax, w[0] - lauf0)
        else: lauf0 = None
    dauer = (st[-1][0] - st[0][0]) / 1000 if len(st) > 1 else 0
    kontakt = sum(1 for w in st if w[3] < 6)
    vtief = max([0.0] + [-w[2] for w in st])
    return {'tief': round(tief, 2), 'ms03': round(lmax), 'sps': round(len(st) / dauer) if dauer else 0, 'luecke': round(luecke), 'kontakt': kontakt, 'vtief': round(vtief, 2),
            'stoesse': (st[-1][4] - st[0][4]) if st else 0, 'trenn': round(max([0.0] + [w[5] for w in st]), 2)}

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
        gast.goto(gurl + '?raum=' + code)
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
        for pg in (host, gast):
            pg.set_viewport_size({'width': 640, 'height': 400})     # weniger Software-Grafik → beide Seiten takten
            pg.evaluate(REKORDER)
        alle, pings = {}, []
        def foto(pfad):
            # Bild der Gast-Sicht: kurz zeichnen; beide Seiten bekommen eine Marke (None), Lücken darüber zählen nicht als Takt-Stillstand
            host.evaluate('window.__rec.st.push(null)')
            gast.evaluate('window.__rec.st.push(null); window.__zAn()'); gast.wait_for_timeout(250)
            gast.screenshot(path=pfad)
            gast.evaluate('window.__zAus(); window.__rec.st.push(null)'); host.evaluate('window.__rec.st.push(null)')
        for L in LATENZEN:
            rtt(L)
            gast.wait_for_timeout(4000 if L == LATENZEN[0] else 3000)   # Uhr/Warteschlange stellen sich auf die neue Latenz ein (erste Phase: Gast fährt erst heran)
            host.evaluate(HOLEN); gast.evaluate(HOLEN)
            bild, t0 = False, time.time()
            while time.time() - t0 < PHASE_S:
                gast.wait_for_timeout(500)
                if not bild:
                    w = gast.evaluate("() => { const r = window.__rec.st.filter(Boolean); return r.length ? r[r.length - 1] : null; }")
                    if w and w[3] < 5.6:
                        foto(os.path.join(out, 'rempeln_%dms.png' % L)); bild = True
            hg, gg = host.evaluate(HOLEN), gast.evaluate(HOLEN)
            if not bild:
                foto(os.path.join(out, 'rempeln_%dms.png' % L))
            eh, eg = auswerten(hg['st']), auswerten(gg['st'])
            srv_tief = round(max([0.0] + [-z[1] for z in gg['zu']] + [-z[1] for z in hg['zu']]), 2)
            pings += [w[6] for w in gg['st'] if w and isinstance(w[6], (int, float))]
            alle[L] = {'host': eh, 'gast': eg, 'server': srv_tief, 'zustaende': len(gg['zu'])}
            ok_anz = lambda e: e['tief'] <= 0.3 or (e['tief'] <= 0.8 and e['ms03'] <= 150)
            pruefe('c) %3d ms: Gast-Anzeige ≤ 0,3 m (Spitzen ≤ 0,8 m ≤ 150 ms), Host-Anzeige dito, Server ≤ 0,05 m, Kontakt + Stöße, beide takten' % L,
                   ok_anz(eg) and ok_anz(eh) and srv_tief <= 0.05 and eg['kontakt'] > 30 and eg['stoesse'] >= 1 and min(eg['sps'], eh['sps']) >= 15,
                   'Gast Anzeige %.2f m [%d ms > 0,3] (Vorhersage %.2f, Versatz max %.2f) | Host %.2f m [%d ms] | Server %.2f m (%d Zustände) | Kontakt %d Schritte, Stöße %d | Schritte/s Gast %d Host %d, längste Lücke %d/%d ms (nur Info)'
                   % (eg['tief'], eg['ms03'], eg['vtief'], eg['trenn'], eh['tief'], eh['ms03'], srv_tief, len(gg['zu']), eg['kontakt'], eg['stoesse'], eg['sps'], eh['sps'], eg['luecke'], eh['luecke']))
        gast.evaluate('window.__rec.st.push(null); window.__zAn()'); gast.wait_for_timeout(300)
        gast.screenshot(path=os.path.join(out, 'w5_gast_ende.png'))
        pt = gast.evaluate("Rennspiel.spiel.online.pingEl && Rennspiel.spiel.online.pingEl.textContent")
        # nur Info: hier rechnen 2 Browser mit Software-Grafik (SwiftShader) auf einer CPU – der HUD-Ping enthält die Bildzeit des
        # überlasteten Hauptthreads. Der reine Netz-Ping localhost steht in tests/test_online_rempeln.js (P, ~0–1 ms).
        print('INFO c) HUD-Ping Gast (inkl. Proxy-Latenz, Software-Grafik): min %s / max %s ms, HUD „%s“' % (round(min(pings)) if pings else None, round(max(pings)) if pings else None, pt), flush=True)
        with open(os.path.join(out, 'rempeln_browser_messung.json'), 'w') as f: json.dump(alle, f, indent=1)
        browser.close()
finally:
    srv.terminate(); prx.terminate()
echt = [f for f in fehler if 'favicon' not in f]
pruefe('keine JS-Fehler', not echt, echt[:5])
print('\n%d FAIL' % len(fails))
sys.exit(1 if fails else 0)
