#!/usr/bin/env python3
"""W5 Mehrspieler im Browser (Playwright, headless Chromium): python3 tests/online_test.py [ausgabeordner]
Startet server/server.js als Unterprozess (freier Port) und spielt mit 2 Browser-Kontexten:
 a) Menü über http: Online-Karte aktiv (von file:// ausgegraut – prüft menu_test), Host erstellt Raum (Tastatur),
    Lobby passt in 1280×800, Code/Link/QR (QR wird mit OpenCV gelesen = Link)
 b) Gast öffnet den Link ?raum=CODE → Code-Eingabe vorausgefüllt → Enter → Lobby mit 2 Spielern → Leertaste = bereit
 c) Host stellt Fantasie / 1 Runde / 1 Computer ein und startet (Enter); beide im Zustand 'online'
 d) Countdown: Gast-Sicht mit halbtransparentem Host-Auto (Materialien 0,6), eigenes Auto deckend, HUD mit 🌐-Ping
 e) beide fahren 20 s (Autopilot über die Eingabe: input.steuerung → R.Driver auf dem vorhergesagten Wagen),
    Screenshots Host-/Gast-Sicht, dann bremsen beide bis zum Stillstand → Positionen beider Sichten < 3 m;
    Server-Zustände in beiden Sichten gleich (Computer-Auto zum selben Tick)
 f) weiterfahren bis die Runde zählt (Ziel) → Ergebnis-Tafel bei beiden; keine JS-Fehler
W5 Stufe 2 (Rempeln online):
 g) Lobby: Gast sieht „Geister“ (nur Ansicht), Host schaltet per Klick auf „💥 Rempeln“ (Server übernimmt, Gast sieht den Wert,
    zuletzt gewählter Wert landet in den lokalen Einstellungen); Start mit Rempeln: alle Autos deckend, Vorhersage kennt die
    Stellvertreter; der Gast fährt in das stehende Host-Auto → Stoß in der Vorhersage, keine harte Korrektur, keine JS-Fehler
Bilder: tests/out/online/"""
import sys, os, socket, subprocess, time, json
from playwright.sync_api import sync_playwright

basis = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
out = sys.argv[1] if len(sys.argv) > 1 else os.path.join(basis, 'tests', 'out', 'online')
os.makedirs(out, exist_ok=True)
pruefungen, fehler = [], []

def pruefe(name, ok, info=''):
    pruefungen.append({'test': name, 'ok': bool(ok), 'info': info})
    print(('OK   ' if ok else 'FAIL ') + name + (' – ' + str(info) if info != '' else ''), flush=True)

s = socket.socket(); s.bind(('127.0.0.1', 0)); port = s.getsockname()[1]; s.close()
srv = subprocess.Popen(['node', os.path.join(basis, 'server', 'server.js'), '--port', str(port), '--host', '127.0.0.1'],
                       stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
url = 'http://127.0.0.1:%d/' % port
for _ in range(50):
    try:
        socket.create_connection(('127.0.0.1', port), timeout=0.2).close(); break
    except OSError: time.sleep(0.1)

ZUSTAND = """(() => { const s = Rennspiel.spiel, o = s.online; if (!o) return null;
  const r = s.rennen, du = o.du, f = s.fahrzeuge[du];
  return { du, n: o.n, ping: o.verb && o.verb.ping, pingText: o.pingEl && o.pingEl.textContent, stat: o.vorhersage && o.vorhersage.stat,
    runde: r.teilnehmer[du].runde, imZiel: r.teilnehmer[du].imZiel, rz: r.zustand, fps: s.uhr.fps,
    pos: s.fahrzeuge.map(g => [g.vehicle.x, g.vehicle.z]), tempo: f.vehicle.vLaengs, fort: r.teilnehmer[du].fortschritt }; })()"""

# Autopilot über den normalen Eingabeweg: input.steuerung(0) liefert die Werte eines Computerfahrers, der auf dem
# vorhergesagten eigenen Wagen sitzt (R.Driver, Stärke mittel, + Anlauf-Hilfe wie lokal). 'stopp' = voll bremsen.
AUTOPILOT = """(art) => { const s = Rennspiel.spiel, o = s.online, R = Rennspiel;
  if (!s._origSteuerung) s._origSteuerung = s.input.steuerung.bind(s.input);
  if (art === 'aus') { s.input.steuerung = s._origSteuerung; return true; }
  if (art === 'stopp') {     // bremsen bis zum Stillstand, dann loslassen (Bremse im Stand = rückwärts)
    s.input.steuerung = (nr) => (nr === 0 && o.vorhersage.vp.vLaengs > 0.3 ? { gas: 0, bremse: 1, lenkung: 0 } : { gas: 0, bremse: 0, lenkung: 0 }); return true; }
  const d = new R.Driver(o.vorhersage.vp, s.strecke, { schwierigkeit: 'mittel', seed: 77 + o.du, name: 'Test' });
  if (d.hindernisseSetzen) d.hindernisseSetzen(s.strecke.hindernisse);
  s.input.steuerung = (nr) => {
    if (nr !== 0) return { gas: 0, bremse: 0, lenkung: 0 };
    const t = s.rennen.teilnehmer[o.du];
    const st = d.steuerung(1 / 60, { andere: [], spielerFortschrittMax: null, eigenerFortschritt: t.fortschritt, laeuft: s.rennen.gasErlaubt });
    // wie der lokale Autopilot (main.js f.autopilot): in der Anlauf-Zone vor Looping/Schanze Vollgas (R.Anlauf.kiHilfe)
    const v = o.vorhersage.vp;
    return R.Anlauf ? R.Anlauf.kiHilfe({}, v, s.strecke, s.strecke.spline.naechster(v.x, v.z), st) : st;
  };
  return true; }"""

try:
    with sync_playwright() as p:
        browser = p.chromium.launch(args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
        def seite(name):
            pg = browser.new_context(viewport={'width': 1280, 'height': 800}).new_page()
            pg.on('pageerror', lambda e: fehler.append(name + ': ' + str(e)))
            pg.on('console', lambda m: fehler.append(name + ' console.error: ' + m.text) if m.type == 'error' else None)
            return pg
        host = seite('Host')
        host.goto(url)
        host.wait_for_function('window.Rennspiel && Rennspiel.spiel', timeout=90000, polling=200)
        host.wait_for_timeout(800)
        # ---------- a) Host: Online-Karte, Raum erstellen ----------
        karte = host.evaluate("(() => { const k = document.querySelector('[data-a=\"online\"]'); return k ? { aus: k.classList.contains('aus'), text: k.textContent } : null; })()")
        pruefe('Menü (http): Online-Karte da und aktiv', karte is not None and not karte['aus'], karte)
        for _ in range(4): host.keyboard.press('ArrowRight'); host.wait_for_timeout(80)
        gew = host.evaluate("Rennspiel.spiel.menue.onlineGewaehlt === true && !!document.querySelector('.karte.online-karte.gewaehlt')")
        pruefe('Pfeiltasten: nach „Letzter fliegt raus“ kommt die Online-Karte (5. Karte)', gew)
        host.keyboard.press('Enter'); host.wait_for_timeout(300)
        pruefe('Enter öffnet den Online-Bildschirm (Raum erstellen / beitreten)', host.is_visible('#online') and host.is_visible('[data-a="erstellen"]'))
        host.screenshot(path=os.path.join(out, 'online_1_start.png'))
        host.keyboard.press('Enter')
        host.wait_for_function("Rennspiel.spiel.menue.onlineUi.lobby !== null && Rennspiel.spiel.menue.onlineUi.ansicht === 'lobby'", timeout=10000, polling=200)
        host.wait_for_timeout(400)
        code = host.evaluate('Rennspiel.spiel.menue.onlineUi.lobby.code')
        lobby = host.evaluate("""(() => { const m = document.querySelector('#online .m-inhalt'), r = (s) => { const e = document.querySelector(s); return e ? e.getBoundingClientRect() : null; };
          const fuss = document.querySelector('#online .m-fuss').getBoundingClientRect().top;
          const sp = Array.from(document.querySelectorAll('#online .on-spalte')).map(e => e.getBoundingClientRect());
          return { code: document.querySelector('.on-code').textContent, link: document.querySelector('.on-link').textContent, qr: !!document.querySelector('.on-qr svg'),
            scroll: m.scrollHeight <= m.clientHeight + 1, innen: sp.every(a => a.left >= 0 && a.right <= innerWidth && a.top >= 0 && a.bottom <= fuss + 2),
            ueber: Array.from(document.querySelectorAll('#online .on-spalte')).some(e => e.scrollHeight > e.clientHeight + 2), start: !!document.querySelector('[data-a="start"]') }; })()""")
        pruefe('Lobby (Host): Code groß, Link = origin/?raum=CODE, QR-Code, Start-Knopf', lobby['code'] == code and lobby['link'] == url.rstrip('/') + '/?raum=' + code and lobby['qr'] and lobby['start'], lobby['link'])
        pruefe('Lobby (Host) 1280×800: ohne Scrollen, Spalten im Bild, nichts abgeschnitten', lobby['scroll'] and lobby['innen'] and not lobby['ueber'], lobby)
        host.screenshot(path=os.path.join(out, 'online_2_lobby_host_qr.png'))
        try:
            import cv2
            img = cv2.imread(os.path.join(out, 'online_2_lobby_host_qr.png'))
            wert, _, _ = cv2.QRCodeDetector().detectAndDecode(img)
            pruefe('QR-Code im Screenshot lesbar (OpenCV) = Link', wert == lobby['link'], wert)
        except ImportError:
            pruefe('QR-Code lesbar (OpenCV fehlt – übersprungen)', True)
        # ---------- b) Gast über den Link ----------
        gast = seite('Gast')
        gast.goto(url + '?raum=' + code.lower())
        gast.wait_for_function("window.Rennspiel && Rennspiel.spiel && Rennspiel.spiel.menue.onlineUi && Rennspiel.spiel.menue.onlineUi.ansicht === 'code'", timeout=90000, polling=200)
        vor = gast.evaluate("Rennspiel.spiel.menue.onlineUi.code.join('')")
        pruefe('Gast: Link ?raum= öffnet direkt die Code-Eingabe, vorausgefüllt', vor == code, vor)
        gast.screenshot(path=os.path.join(out, 'online_3_gast_code.png'))
        # Tastatur-Eingabe prüfen: löschen + falsches Zeichen (O) + neu tippen
        gast.keyboard.press('Backspace'); gast.keyboard.press('KeyO')
        hw = gast.evaluate("Rennspiel.spiel.menue.onlineUi.hinweis")
        dbg0 = gast.evaluate("document.getElementById('debug').classList.contains('an')")
        gast.keyboard.type(code[-1])
        jetzt = gast.evaluate("Rennspiel.spiel.menue.onlineUi.code.join('')")
        gast.keyboard.press('KeyH'); gast.keyboard.press('Backspace'); gast.keyboard.type(code[-1])      # H = Debug-Taste im Spiel
        dbg1 = gast.evaluate("document.getElementById('debug').classList.contains('an')")
        pruefe('Code-Eingabe: ⌫ löscht, „O“ abgewiesen (Hinweis), Tippen füllt; Buchstaben lösen keine Spieltasten aus (H ≠ Debug)', jetzt == code and 'O' in hw and dbg0 == dbg1, [jetzt, hw])
        gast.keyboard.press('Enter')
        gast.wait_for_function("Rennspiel.spiel.menue.onlineUi.ansicht === 'lobby'", timeout=10000, polling=200)
        host.wait_for_function("Rennspiel.spiel.menue.onlineUi.lobby.spieler.length === 2", timeout=10000, polling=200)
        gast.keyboard.press('Space')
        host.wait_for_function("Rennspiel.spiel.menue.onlineUi.lobby.spieler[1].bereit === true", timeout=10000, polling=200)
        gast.wait_for_timeout(300)
        gast.screenshot(path=os.path.join(out, 'online_4_lobby_gast.png'))
        gl = gast.evaluate("(() => { const o = Rennspiel.spiel.menue.onlineUi; return { n: o.lobby.spieler.length, host: o.istHost, bereit: o.ichLobby().bereit, start: !!document.querySelector('[data-a=\"start\"]'), einst: !!document.querySelector('.on-zusammen') }; })()")
        pruefe('Gast-Lobby: 2 Spieler, Gast bereit (Leertaste), kein Start-Knopf, Einstellungen nur zum Ansehen', gl['n'] == 2 and not gl['host'] and gl['bereit'] and not gl['start'] and gl['einst'], gl)
        gz = gast.evaluate("document.querySelector('.on-zusammen').textContent")
        pruefe('Rempeln-Schalter: Standard Geister (Host-Zeile 👻 aktiv, Gast sieht „Geister“, kein Schalter beim Gast)',
               host.evaluate("(() => { const a = document.querySelector('[data-a=\"wert:kollisionen:aus\"]'); return !!a && a.classList.contains('aktiv'); })()")
               and 'Geister' in gz and gast.evaluate("!document.querySelector('[data-a^=\"wert:kollisionen\"]')"), gz[-40:])
        # ---------- b2) 12.10. Hindernis-Menge in der Lobby: grau in Welt ohne Hindernisse, Host stellt ein, Gast sieht es ----------
        hm0 = host.evaluate("""(() => { const z = Array.from(document.querySelectorAll('.on-zeile')).find(e => e.querySelector('.on-label').textContent.includes('Hindernisse'));
          return z ? { pillen: Array.from(z.querySelectorAll('.pille')).map(p => p.textContent.trim()), aus: z.querySelectorAll('.pille.aus').length, klickbar: z.querySelectorAll('.pille[data-a]').length,
            label: z.querySelector('.on-label').textContent } : null; })()""")
        pruefe('Lobby (Host): Zeile 🚧 Hindernisse mit Normal/Viele/Sehr viele; in Welt Klassisch ausgegraut (nicht klickbar) mit Hinweis',
               hm0 and hm0['pillen'] == ['Normal', 'Viele', 'Sehr viele'] and hm0['aus'] == 3 and hm0['klickbar'] == 0 and 'erst ab Welt' in hm0['label'], hm0)
        host.click('[data-a="wert:welt:hindernisse"]'); host.wait_for_timeout(400)
        host.click('[data-a="wert:hindernisMenge:viele"]')
        for pg in (host, gast):
            pg.wait_for_function("Rennspiel.spiel.menue.onlineUi.lobby.einstellungen.hindernisMenge === 'viele'", timeout=10000, polling=200)
        host.wait_for_timeout(300)
        gz2 = gast.evaluate("document.querySelector('.on-zusammen').textContent")
        hl = host.evaluate("""(() => { const m = document.querySelector('#online .m-inhalt'); const fuss = document.querySelector('#online .m-fuss').getBoundingClientRect().top;
          const z = Array.from(document.querySelectorAll('.on-zeile')).find(e => e.querySelector('.on-label').textContent.includes('Hindernisse'));
          return { aktiv: z.querySelector('.pille.aktiv').textContent.trim(), klickbar: z.querySelectorAll('.pille[data-a]').length, scroll: m.scrollHeight <= m.clientHeight + 1,
            innen: Array.from(document.querySelectorAll('#online .on-spalte')).every(e => e.getBoundingClientRect().bottom <= fuss + 2) }; })()""")
        pruefe('Host wählt Welt Hindernisse + „Viele“: Server übernimmt, Zeile aktiv, Gast sieht „Hindernisse: Viele“, Lobby passt in 1280×800',
               hl['aktiv'] == 'Viele' and hl['klickbar'] == 3 and hl['scroll'] and hl['innen'] and 'Hindernisse: Viele' in gz2, [hl, gz2[:90]])
        host.screenshot(path=os.path.join(out, 'online_4b_lobby_hindernisse_viele.png'))
        gast.screenshot(path=os.path.join(out, 'online_4c_lobby_gast_hindernisse.png'))
        host.click('[data-a="wert:hindernisMenge:sehrViele"]')
        host.wait_for_function("Rennspiel.spiel.menue.onlineUi.lobby.einstellungen.hindernisMenge === 'sehrViele'", timeout=10000, polling=200)
        # ---------- c) Host stellt ein und startet ----------
        for a in ['wert:strecke:fantasie', 'wert:runden:1', 'wert:gegner:1', 'wert:schwierigkeit:leicht']:
            host.click('[data-a="%s"]' % a); host.wait_for_timeout(350)
        e = host.evaluate('Rennspiel.spiel.menue.onlineUi.lobby.einstellungen')
        pruefe('Host stellt per Klick ein: Fantasie, 1 Runde, 1 Computer', e['streckeId'] == 'fantasie' and e['runden'] == 1 and e['gegner'] == 1, e)
        host.screenshot(path=os.path.join(out, 'online_5_lobby_host_einstellungen.png'))
        host.keyboard.press('Enter')
        for pg in (host, gast):
            pg.wait_for_function("Rennspiel.spiel.zustand === 'online' && Rennspiel.spiel.online && Rennspiel.spiel.online.empfangen", timeout=30000, polling=200)
        pruefe('Beide im Zustand „online“ (Szene gebaut, Server-Zustände kommen)', True)
        SIG = "(() => { const st = Rennspiel.spiel.strecke; return { menge: st.hindernisMenge, einst: Rennspiel.spiel.einstellungen.hindernisMenge, n: st.hindernisse.length + st.strohballen.length, sig: JSON.stringify([st.hindernisse.map(h => [h.typ, h.s, h.seitenabstand]), st.wracks, st.strohballen]) }; })()"
        sh_, sg_ = host.evaluate(SIG), gast.evaluate(SIG)
        pruefe('12.10. Online mit „Sehr viele“ (Fantasie): Host und Gast bauen dieselbe Strecke (gleiche Hindernisse, Wracks, Strohballen), mehr als normal (2 Hindernisse + 0 Strohballen)',
               sh_['menge'] == 'sehrViele' and sg_['menge'] == 'sehrViele' and sh_['sig'] == sg_['sig'] and sh_['n'] > 4, [sh_['n'], sg_['n'], sh_['menge'], sg_['einst']])
        # ---------- d) Countdown: Geister, HUD ----------
        gast.wait_for_timeout(700)
        geist = gast.evaluate("""(() => { const s = Rennspiel.spiel, o = s.online, erg = [];
          s.fahrzeuge.forEach((f, i) => { let tr = 0, alle = 0, op = 1; f.mesh.traverse(c => { if (c.material && !Array.isArray(c.material)) { alle++; if (c.material.transparent && c.material.opacity <= 0.61) tr++; } });
            erg.push({ i, eigen: i === o.du, anteil: alle ? tr / alle : 0 }); });
          return erg; })()""")
        andere_ok = all(g['anteil'] > 0.9 for g in geist if not g['eigen'])
        eigen_ok = all(g['anteil'] < 0.2 for g in geist if g['eigen'])
        pruefe('Geister: alle anderen Autos halbtransparent (0,6), eigenes Auto deckend', andere_ok and eigen_ok, geist)
        gast.screenshot(path=os.path.join(out, 'online_6_gast_countdown_geist.png'))
        zh = host.evaluate(ZUSTAND); zg = gast.evaluate(ZUSTAND)
        pruefe('HUD: 🌐-Ping in der Namenskarte', zh and zg and zh['pingText'] and zh['pingText'].startswith('🌐') and 'ms' in zh['pingText'], [zh and zh['pingText'], zg and zg['pingText']])
        # ---------- e) 20 s fahren ----------
        for pg in (host, gast): pg.evaluate(AUTOPILOT, 'an')
        start = time.time(); fort0 = [host.evaluate(ZUSTAND)['fort'], gast.evaluate(ZUSTAND)['fort']]
        host.wait_for_timeout(9000)
        host.screenshot(path=os.path.join(out, 'online_7_rennen_host.png'))
        gast.screenshot(path=os.path.join(out, 'online_8_rennen_gast.png'))
        host.wait_for_timeout(max(0, 20000 - int((time.time() - start) * 1000)))
        zh = host.evaluate(ZUSTAND); zg = gast.evaluate(ZUSTAND)
        pruefe('Beide fahren (Fortschritt > 150 m in 20 s), Rennen läuft', zh['fort'] - fort0[0] > 150 and zg['fort'] - fort0[1] > 150 and zh['rz'] == 'laeuft',
               '%.0f / %.0f m, fps %s/%s, Eingaben %d/%d' % (zh['fort'] - fort0[0], zg['fort'] - fort0[1], zh['fps'], zg['fps'], zh['n'], zg['n']))
        print('     Vorhersage Host:', zh['stat'], '\n     Vorhersage Gast:', zg['stat'], '\n     Ping (ms):', round(zh['ping'] or -1, 1), round(zg['ping'] or -1, 1), flush=True)
        # gleiche Server-Zustände in beiden Sichten: Pose des Computer-Autos (Nr. 2) zum selben Tick
        k_gl = gast.evaluate("Rennspiel.spiel.online.puffer.liste[Rennspiel.spiel.online.puffer.liste.length - 10].k")
        SUCHE = """(k) => { const p = Rennspiel.spiel.online.puffer.liste.find(z => z.k === k); return p ? p.a[2].slice(0, 4) : null; }"""
        gleich = host.evaluate(SUCHE, k_gl)
        gleich2 = gast.evaluate(SUCHE, k_gl)
        pruefe('Beide Sichten bekommen dieselben Server-Zustände (Computer-Auto zum selben Tick)', gleich is not None and gleich == gleich2, [gleich, gleich2])
        # beide bremsen bis zum Stillstand → Positionen vergleichen
        for pg in (host, gast): pg.evaluate(AUTOPILOT, 'stopp')
        host.wait_for_timeout(4500)
        zh = host.evaluate(ZUSTAND); zg = gast.evaluate(ZUSTAND)
        abw = [((zh['pos'][i][0] - zg['pos'][i][0]) ** 2 + (zh['pos'][i][1] - zg['pos'][i][1]) ** 2) ** 0.5 for i in (0, 1)]
        pruefe('Positionen beider Sichten (Host-Auto, Gast-Auto) nach dem Anhalten < 3 m auseinander', max(abw) < 3,
               ['%.3f m' % a for a in abw] + ['Tempo %.2f / %.2f m/s' % (zh['tempo'], zg['tempo'])])
        host.screenshot(path=os.path.join(out, 'online_9_host_stand.png'))
        gast.screenshot(path=os.path.join(out, 'online_10_gast_stand.png'))
        # ---------- f) bis die Runde zählt ----------
        for pg in (host, gast): pg.evaluate(AUTOPILOT, 'an')
        # Wer direkt vor dem Looping angehalten hat, bekommt „Zu langsam! … R: Anlaufposition“ (wie lokal) – der Test
        # macht es wie ein Kind: steht ein Auto 4 s still, drückt er R (Reset über das Netz: Server setzt auf die Anlaufposition).
        bis = time.time() + 150
        fertig = False
        letzte = {id(host): (None, time.time()), id(gast): (None, time.time())}
        resets = 0
        while time.time() < bis:
            zh = host.evaluate(ZUSTAND)
            if zh is None or zh['runde'] >= 1 or zh['imZiel']:
                fertig = True; break
            for pg in (host, gast):
                z = zh if pg is host else pg.evaluate(ZUSTAND)
                if z is None or z['imZiel']: continue
                f0, t0 = letzte[id(pg)]          # Stillstand am eigenen Tempo messen (fortschritt hängt an den Checkpoints)
                if f0 is None or abs(z['tempo']) > 0.5: letzte[id(pg)] = (True, time.time())
                elif time.time() - t0 > 4:
                    pg.keyboard.press('KeyR'); resets += 1; letzte[id(pg)] = (None, time.time())
            host.wait_for_timeout(1000)
        if resets: print('     R gedrückt (Anlaufposition/Reset über das Netz):', resets, 'mal', flush=True)
        pruefe('Runde zählt hoch (Host im Ziel nach 1 Runde Fantasie)', fertig, zh and {k: zh[k] for k in ('runde', 'imZiel', 'fort', 'rz')})
        # Ergebnis bei beiden (der Gast fährt weiter, bis auch er im Ziel ist – oder 60 s nach dem ersten Menschen)
        for pg, name in ((host, 'Host'), (gast, 'Gast')):
            try:
                pg.wait_for_function("Rennspiel.spiel.online && Rennspiel.spiel.online.phase === 'ergebnis'", timeout=100000, polling=500)
                ok = pg.is_visible('.on-ergebnis .ergebnis-karte')
            except Exception as ex:
                ok = False
            pruefe(f'Ergebnis-Tafel bei {name}', ok)
        host.screenshot(path=os.path.join(out, 'online_11_ergebnis_host.png'))
        gast.screenshot(path=os.path.join(out, 'online_12_ergebnis_gast.png'))
        # Host → Lobby, beide wieder in der Lobby
        host.keyboard.press('Enter')
        try:
            for pg in (host, gast):
                pg.wait_for_function("Rennspiel.spiel.zustand === 'menue' && Rennspiel.spiel.menue.onlineUi.ansicht === 'lobby'", timeout=15000, polling=200)
            pruefe('Host: „Zur Lobby“ → beide wieder in der Lobby (Szene abgebaut)', True)
        except Exception as ex:
            pruefe('Host: „Zur Lobby“ → beide wieder in der Lobby (Szene abgebaut)', False, [pg.evaluate("[Rennspiel.spiel.zustand, Rennspiel.spiel.online && Rennspiel.spiel.online.phase]") for pg in (host, gast)])
        # ---------- g) W5 Stufe 2: Rempeln online ----------
        host.click('[data-a="wert:hindernisMenge:normal"]')
        host.wait_for_function("Rennspiel.spiel.menue.onlineUi.lobby.einstellungen.hindernisMenge === 'normal'", timeout=10000, polling=200)
        gast.keyboard.press('Space')
        host.wait_for_function("Rennspiel.spiel.menue.onlineUi.lobby.spieler[1].bereit === true", timeout=10000, polling=200)
        host.click('[data-a="wert:kollisionen:an"]')
        for pg in (host, gast):
            pg.wait_for_function("Rennspiel.spiel.menue.onlineUi.lobby.einstellungen.kollisionen === true", timeout=10000, polling=200)
        host.wait_for_timeout(300)
        hint = host.evaluate("document.querySelector('#online .on-mitte').textContent")
        hostzeile = host.evaluate("(() => { const a = document.querySelector('[data-a=\"wert:kollisionen:an\"]'); return !!a && a.classList.contains('aktiv'); })()")
        gz = gast.evaluate("document.querySelector('.on-zusammen').textContent")
        gl2 = host.evaluate("""(() => { const m = document.querySelector('#online .m-inhalt'); const fuss = document.querySelector('#online .m-fuss').getBoundingClientRect().top;
          return { scroll: m.scrollHeight <= m.clientHeight + 1, ueber: Array.from(document.querySelectorAll('#online .on-spalte')).some(e => e.scrollHeight > e.clientHeight + 2),
            innen: Array.from(document.querySelectorAll('#online .on-spalte')).every(e => e.getBoundingClientRect().bottom <= fuss + 2) }; })()""")
        pruefe('Host schaltet auf 💥 Rempeln: Server übernimmt, Zeile aktiv, Hinweis „gut bei Ping unter 100 ms“, Gast sieht „Rempeln an“',
               hostzeile and 'Rempeln (gut bei Ping unter 100 ms)' in hint and 'Rempeln an' in gz, [hint[-60:], gz[-30:]])
        pruefe('Lobby (Host) mit der neuen Zeile 1280×800: nichts abgeschnitten, kein Scrollen', gl2['scroll'] and gl2['innen'] and not gl2['ueber'], gl2)
        gespeichert = host.evaluate("(() => { try { return JSON.parse(localStorage.getItem(Rennspiel.config.ui.speicherSchluessel)).kollisionen; } catch (e) { return null; } })()")
        pruefe('Zuletzt gewählter Wert (Rempeln) steht in den lokalen Einstellungen', gespeichert is True, gespeichert)
        host.screenshot(path=os.path.join(out, 'online_14_lobby_rempeln.png'))
        gast.screenshot(path=os.path.join(out, 'online_15_lobby_rempeln_gast.png'))
        host.keyboard.press('Enter')
        for pg in (host, gast):
            pg.wait_for_function("Rennspiel.spiel.zustand === 'online' && Rennspiel.spiel.online && Rennspiel.spiel.online.empfangen", timeout=30000, polling=200)
        gast.wait_for_timeout(700)
        deck = gast.evaluate("""(() => { const s = Rennspiel.spiel, o = s.online, erg = [];
          s.fahrzeuge.forEach((f, i) => { let tr = 0, alle = 0; f.mesh.traverse(c => { if (c.material && !Array.isArray(c.material)) { alle++; if (c.material.transparent && c.material.opacity <= 0.61) tr++; } });
            erg.push({ i, anteil: alle ? tr / alle : 0 }); });
          const v = o.vorhersage; return { autos: erg, koll: o.kollisionen, vp: v.kollisionen, sv: v.stellvertreter.length, n: s.fahrzeuge.length }; })()""")
        pruefe('Rempeln: alle Autos deckend (nicht halbtransparent), Vorhersage kennt die Stellvertreter der anderen',
               all(g['anteil'] < 0.2 for g in deck['autos']) and deck['koll'] and deck['vp'] and deck['sv'] == deck['n'] - 1, deck)
        gast.screenshot(path=os.path.join(out, 'online_16_gast_countdown_rempeln.png'))
        # Host steht still; der Gast (hinter ihm auf dem Startfeld) steuert auf das Host-Auto zu
        host.evaluate(AUTOPILOT, 'stopp')
        gast.evaluate("""() => { const s = Rennspiel.spiel, o = s.online, R = Rennspiel;
          if (!s._origSteuerung) s._origSteuerung = s.input.steuerung.bind(s.input);
          s.input.steuerung = (nr) => { if (nr !== 0) return { gas: 0, bremse: 0, lenkung: 0 };
            const ich = o.vorhersage.vp, ziel = s.fahrzeuge[0].vehicle;       // Nr. 0 = Host
            let d = R.headingAus(ziel.x - ich.x, ziel.z - ich.z) - ich.heading;
            while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
            return { gas: ich.vLaengs < 14 ? 1 : 0.3, bremse: 0, lenkung: Math.max(-1, Math.min(1, -3 * Math.sin(d))) }; };
          return true; }""")
        stoss = 0
        for _ in range(40):
            gast.wait_for_timeout(500)
            stoss = gast.evaluate("Rennspiel.spiel.online.vorhersage.stat.stoesse")
            if stoss >= 3: break
        zg = gast.evaluate(ZUSTAND); zh = host.evaluate(ZUSTAND)
        abstand = ((zg['pos'][0][0] - zh['pos'][0][0]) ** 2 + (zg['pos'][0][1] - zh['pos'][0][1]) ** 2) ** 0.5
        pruefe('Rempeln: Gast fährt ins stehende Host-Auto → Stoß in der Vorhersage (≥ 3), Sicht-Abweichung des Host-Autos < 3 m',
               stoss >= 3 and abstand < 3, 'Stöße %s, %s; Host-Auto in beiden Sichten %.2f m auseinander' % (stoss, zg['stat'], abstand))
        gast.screenshot(path=os.path.join(out, 'online_17_rempeln_gast.png'))
        host.screenshot(path=os.path.join(out, 'online_18_rempeln_host.png'))
        # Rennen verlassen (Host: Esc, dann Enter)
        host.keyboard.press('Escape'); host.wait_for_timeout(300); host.keyboard.press('Enter')
        # Host verlässt → Gast bekommt Hinweis
        gast.wait_for_function("Rennspiel.spiel.menue.onlineUi.ansicht === 'start' && Rennspiel.spiel.menue.onlineUi.hinweis.length > 0", timeout=10000, polling=200)
        pruefe('Host verlässt den Raum → Gast zurück mit Hinweis', 'Host' in gast.evaluate('Rennspiel.spiel.menue.onlineUi.hinweis'), gast.evaluate('Rennspiel.spiel.menue.onlineUi.hinweis'))
        gast.screenshot(path=os.path.join(out, 'online_13_gast_raum_zu.png'))
        gast.keyboard.press('Escape'); gast.wait_for_timeout(300)
        pruefe('Esc → zurück ins Hauptmenü', gast.is_visible('#menue') and not gast.is_visible('#online'))
        browser.close()
finally:
    srv.terminate()
    try: log = srv.communicate(timeout=5)[0]
    except Exception: log = ''
    print('--- Server-Protokoll ---\n' + '\n'.join(log.strip().splitlines()[-14:]))

pruefe('keine JS-Fehler', not fehler, fehler[:5])
n_ok = sum(1 for x in pruefungen if x['ok'])
print(f'\n{n_ok}/{len(pruefungen)} OK')
with open(os.path.join(out, 'online_ergebnis.json'), 'w') as f: json.dump({'pruefungen': pruefungen, 'fehler': fehler}, f, ensure_ascii=False, indent=1)
sys.exit(0 if n_ok == len(pruefungen) else 1)
