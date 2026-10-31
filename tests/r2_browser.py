#!/usr/bin/env python3
"""Stufe R2 online im Browser (Playwright, headless Chromium, Software-GL):
   python3 tests/r2_browser.py [szenario ...]          Szenarien: lobby kurz ko frei geist dino aus   (ohne Angabe: alle, nacheinander)
   Variante Motorrad: Umgebungsvariable R2_MOTO=1  → Motorrad.html (Server mit --motorrad)

Startet server/server.js als Unterprozess (freier Port), spielt mit ECHTEN Seiten (Host + Gast), prüft Lobby-Zeilen, Start, HUD, Münzen/Kisten/Dino,
Ergebnis, Garage-Gold, keine JS-Fehler. Bilder: tests/bilder_r2/
Hinweis (2 Kerne): immer nur ein Szenario gleichzeitig, großzügige Zeitgrenzen; die Nebenseite (Gast) rendert gedrosselt."""
import sys, os, socket, subprocess, time, json
from playwright.sync_api import sync_playwright

basis = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MOTO = os.environ.get('R2_MOTO') == '1'
SEITE = 'Motorrad.html' if MOTO else 'Autorennen.html'
SUFFIX = '_moto' if MOTO else ''
VPW, VPH = [int(x) for x in os.environ.get('R2_VP', '1100x700').split('x')]      # R2-FIX: Fenstergröße wählbar (z. B. R2_VP=844x390)
SUFFIX += '' if (VPW, VPH) == (1100, 700) else '_%dx%d' % (VPW, VPH)
out = os.environ.get('BILD_ORDNER') or os.path.join(basis, 'tests', 'bilder_r2')
os.makedirs(out, exist_ok=True)
ergebnisse, fehler = [], []
START = time.time()

def pruefe(name, ok, info=''):
    ergebnisse.append(bool(ok))
    print(('OK   ' if ok else 'FEHL ') + name + (('  (' + str(info)[:300] + ')') if info != '' else ''), flush=True)

def freier_port():
    s = socket.socket(); s.bind(('127.0.0.1', 0)); p = s.getsockname()[1]; s.close(); return p

port = freier_port()
args = ['node', os.path.join(basis, 'server', 'server.js'), '--port', str(port), '--host', '127.0.0.1'] + (['--motorrad'] if MOTO else [])
os.makedirs(os.path.join(basis, 'tests', 'out', 'r2'), exist_ok=True)
SERVERLOG = os.path.join(basis, 'tests', 'out', 'r2', 'server%s.log' % ('_moto' if MOTO else ''))
# R2-FIX: Server-Ausgabe in eine Datei (nicht in eine ungelesene Pipe: laeuft die voll, steht der Server und trennt Clients) – dient zugleich als Server-Log
server = subprocess.Popen(args, stdout=open(SERVERLOG, 'w'), stderr=subprocess.STDOUT, text=True)
for _ in range(100):
    try: socket.create_connection(('127.0.0.1', port), timeout=0.2).close(); break
    except OSError: time.sleep(0.1)
url = 'http://127.0.0.1:%d/' % port
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
# Seiten, die gerade nicht gebraucht werden, rendern gedrosselt (window.__rafMs > 0); window.__rafMs = 0 schaltet auf normal zurück
LANGSAM = "window.__rafMs = 1500; (() => { const o = window.requestAnimationFrame.bind(window); window.requestAnimationFrame = (f) => (window.__rafMs > 0 ? setTimeout(() => f(performance.now()), window.__rafMs) : o(f)); })();"

# Autopilot für die eigene Eingabe (reine Verfolgung wie der Computerfahrer)
AUTOPILOT = """(art) => { const s = Rennspiel.spiel, o = s.online, R = Rennspiel;
  if (!s._origSteuerung) s._origSteuerung = s.input.steuerung.bind(s.input);
  if (art === 'aus') { s.input.steuerung = s._origSteuerung; return true; }
  const d = new R.Driver(o.vorhersage.vp, s.strecke, { schwierigkeit: 'mittel', seed: 77 + o.du, name: 'Test' });
  if (d.hindernisseSetzen) d.hindernisseSetzen(s.strecke.hindernisse);
  s.input.steuerung = (nr) => {
    if (nr !== 0) return { gas: 0, bremse: 0, lenkung: 0 };
    const t = s.rennen.teilnehmer[o.du];
    const st = d.steuerung(1 / 60, { andere: [], spielerFortschrittMax: null, eigenerFortschritt: t.fortschritt, laeuft: s.rennen.gasErlaubt });
    const v = o.vorhersage.vp;
    return R.Anlauf ? R.Anlauf.kiHilfe({}, v, s.strecke, s.strecke.spline.naechster(v.x, v.z), st) : st;
  };
  return true; }"""
STAND = """(() => { const s = Rennspiel.spiel, o = s.online; if (!o || !s.rennen) return null; const X = o._r2 || null;
  return { phase: o.phase, rz: s.rennen.zustand, zeit: Math.round(s.rennen.zeit), du: o.du, hud: (document.getElementById('s4-hud') || {}).innerText || '',
    zaehl: X ? X.zaehl : null, fertig: X ? X.fertig || null : null, raus: X ? !!X.raus : null,
    ausg: s.rennen.teilnehmer.map(t => !!t.ausgeschieden), fort: s.rennen.teilnehmer.map(t => Math.round(t.fortschritt)),
    kisten: X && X.fr ? X.fr.kisten.map(k => k.st) : null, fraufg: X && X.fr && X.fr.aufgabe ? X.fr.aufgabe.art : null, frgold: X && X.fr ? X.fr.gold : null,
    geist: X && X.geist ? { runden: X.geist.runden, hat: !!X.geist.g } : null, dino: !!s.dinoBegleiter, dinoExt: !!s.dinoExtern,
    meld: Array.from(document.querySelectorAll('.hud-meldung, .meldung')).map(e => e.innerText).join('|') }; })()"""

def main(szenarien):
    with sync_playwright() as p:
        browser = p.chromium.launch(args=ARGS)

        def seite(name, init=None):
            ctx = browser.new_context(viewport={'width': VPW, 'height': VPH})
            if init: ctx.add_init_script(init)
            pg = ctx.new_page()
            pg.on('pageerror', lambda e: fehler.append(name + ': ' + str(e)))
            pg.on('console', lambda m: fehler.append(name + ' console.error: ' + m.text) if m.type == 'error' and 'WebGL' not in m.text and 'GPU stall' not in m.text and '405' not in m.text else None)
            return pg

        def laden(pg, pfad):
            pg.goto(pfad, wait_until='domcontentloaded', timeout=300000)
            pg.wait_for_function('window.Rennspiel && Rennspiel.spiel', timeout=300000, polling=300)
            pg.wait_for_timeout(700)

        def ui(pg, js):
            return pg.evaluate("(() => { const u = Rennspiel.spiel.menue.onlineUi; " + js + " })()")

        def raum(modus_zeilen):
            """Host erstellt den Raum, Gast tritt bei; Rückgabe (host, gast)"""
            host = seite('Host', LANGSAM); laden(host, url + SEITE)
            host.evaluate("(() => { Rennspiel.spiel.menue.onlineOeffnen(); Rennspiel.spiel.menue.onlineUi.erstellen(); })()")
            host.wait_for_function("(() => { const u = Rennspiel.spiel.menue.onlineUi; return u && u.lobby && u.ansicht === 'lobby'; })()", timeout=30000, polling=200)
            code = ui(host, "return u.lobby.code")
            gast = seite('Gast', LANGSAM); laden(gast, url + SEITE + '?raum=' + code.lower())
            gast.wait_for_function("(() => { const u = Rennspiel.spiel.menue.onlineUi; return u && u.ansicht === 'code'; })()", timeout=60000, polling=200)
            gast.keyboard.press('Enter')
            gast.wait_for_function("(() => { const u = Rennspiel.spiel.menue.onlineUi; return u && u.lobby && u.ansicht === 'lobby'; })()", timeout=30000, polling=200)
            host.evaluate('window.__rafMs = 0'); gast.evaluate('window.__rafMs = 0')
            return host, gast

        def starten(host, gast):
            gast.evaluate("Rennspiel.spiel.menue.onlineUi.aktion('bereit')")
            host.wait_for_function("Rennspiel.spiel.menue.onlineUi.alleBereit()", timeout=15000, polling=200)
            host.evaluate("Rennspiel.spiel.menue.onlineUi.aktion('start')")
            for pg in (host, gast):
                pg.wait_for_function("(() => { const o = Rennspiel.spiel.online; return o && o.phase === 'rennen' && o.vorhersage; })()", timeout=120000, polling=300)

        def einstellen(host, zeile, k):
            host.evaluate("(a) => Rennspiel.spiel.menue.onlineUi.wertSetzen(a[0], a[1])", [zeile, k])
            host.wait_for_timeout(500)

        def lobby_labels(pg):
            return pg.evaluate("Array.from(document.querySelectorAll('#online .on-zeile .on-label')).map(e => e.textContent.trim())")

        def laeuft(pg):
            pg.wait_for_function("Rennspiel.spiel.rennen && Rennspiel.spiel.rennen.zustand === 'laeuft'", timeout=60000, polling=300)

        def warte(pg, bed, sek, schritt=1.0):
            ende = time.time() + sek
            while time.time() < ende:
                s = pg.evaluate(STAND)
                if s and bed(s): return s
                pg.wait_for_timeout(int(schritt * 1000))
            return pg.evaluate(STAND)

        def bild(pg, name):
            try: pg.screenshot(path=os.path.join(out, name + SUFFIX + '.png'), timeout=120000)
            except Exception as e: print('Bild fehlgeschlagen', name, e)

        def schluss(*pgs):
            for pg in pgs:
                try: pg.context.close()
                except Exception: pass

        # ============================================================ lobby
        if 'lobby' in szenarien:
            host, gast = raum(None)
            la = lobby_labels(host); lg = lobby_labels(gast)
            pruefe('Lobby (Host): R2-Zeilen „Spielart“, „Geist“, „Dino-Freund“ da', any('Spielart' in l for l in la) and any('Geist' in l for l in la) and any('Dino' in l for l in la), la[-6:])
            pruefe('Lobby (Gast): keine Einstell-Zeilen (nur Host)', not any('Spielart' in l for l in lg), lg)
            bild(host, 'lobby_host')
            einstellen(host, 'r2modus', 'kurz')
            e = ui(host, "return u.lobby.einstellungen"); la = lobby_labels(host)
            pruefe('Lobby: Modus Kurz-Level → Server setzt Strecke/Level, Zeile „Level“ erscheint, Geist/Dino verschwinden',
                   e.get('modus') == 'kurz' and e.get('level') and any('Level' in l for l in la) and not any('Geist' in l for l in la), [e.get('modus'), e.get('level'), e.get('streckeId'), la[-3:]])
            gtxt = gast.evaluate("document.querySelector('#online .on-zusammen') ? document.querySelector('#online .on-zusammen').innerText : ''")
            pruefe('Lobby (Gast): Hinweiszeile zum Modus', 'Kurz-Level' in gtxt, gtxt[-120:])
            bild(host, 'lobby_kurz_host')
            einstellen(host, 'r2modus', 'frei')
            la = lobby_labels(host)
            pruefe('Lobby: Freie Fahrt → Zeile „Dauer“ (3/5/10 min)', any('Dauer' in l for l in la), la[-3:])
            einstellen(host, 'r2modus', 'rennen')
            e = ui(host, "return u.lobby.einstellungen")
            pruefe('Lobby: zurück auf „Rennen“ → Einstellungen wie vorher (kein modus-Schlüssel, Gegner/Runden zurück)', e.get('modus') is None and 'r2b' not in e and e.get('gegner') is not None, e)
            schluss(host, gast)

        # ============================================================ kurz
        if 'kurz' in szenarien:
            host, gast = raum(None)
            lvl = 'm01' if MOTO else 'a01'      # Ziel-Level: der Autopilot schafft es; Münzen/Sprung/Kanone prüft test_r2_online.js (Teleport auf die Münzpunkte)
            einstellen(host, 'r2modus', 'kurz'); einstellen(host, 'r2level', lvl)
            starten(host, gast)
            for pg in (host, gast): laeuft(pg)
            host.evaluate(AUTOPILOT, 'an'); gast.evaluate(AUTOPILOT, 'an')
            s = warte(host, lambda s: 'Level' in s['hud'] and s['rz'] == 'laeuft', 90, 1.5)
            bild(host, 'kurz_muenzen_host')
            pruefe('Kurz (%s): HUD „Level“ zeigt Aufgabe, Zeit und Rest-Weg' % lvl, 'Level' in s['hud'] and 'bis zum Ziel' in s['hud'], [s['hud'][:80], s['zaehl']])
            s2 = warte(host, lambda s: s['phase'] == 'ergebnis' or s['fertig'], 150, 2)
            bild(host, 'kurz_fertig_host')
            pruefe('Kurz: eigenes Ergebnis (geschafft / Zeit um) kommt vom Server', bool(s2['fertig']) or s2['phase'] == 'ergebnis', [s2['fertig'], s2['hud'][:80]])
            s3 = warte(host, lambda s: s['phase'] == 'ergebnis', 150, 2)
            ht = host.evaluate("document.querySelector('.on-ergebnis') ? document.querySelector('.on-ergebnis').innerText : ''")
            bild(host, 'kurz_ergebnis_host')
            pruefe('Kurz: Ergebnistafel mit Sternen/Zeit je Spieler', s3['phase'] == 'ergebnis' and 'Kurz-Level' in ht and ('⭐' in ht or 'Zeit um' in ht or '–' in ht), ht[:160].replace('\n', ' '))
            if s2['fertig'] and s2['fertig']['status'] == 'geschafft':
                best = host.evaluate("(() => { const sk = Rennspiel.SpassKurz; const sp = window.MOTORRAD === true ? 'motorrad' : 'auto'; const o = sk.stand(sp); return o.sterne; })()")
                pruefe('Kurz: Sterne im Fortschritt (SpassKurz.stand) eingetragen', any(v > 0 for v in best.values()), best)
            schluss(host, gast)

        # ============================================================ ko
        if 'ko' in szenarien:
            host, gast = raum(None)
            einstellen(host, 'r2modus', 'ko')
            e = ui(host, "return u.lobby.einstellungen")
            starten(host, gast)
            for pg in (host, gast): laeuft(pg)
            # Host steht (Gas aus) → wird zuerst ausgeschieden; Gast fährt
            gast.evaluate(AUTOPILOT, 'an')
            s = warte(host, lambda s: s['raus'], 240, 2)
            bild(host, 'ko_raus_host')
            pruefe('K.-o.: stehender Mensch fliegt raus (Ereignis raus, Puff, Zuschauer-HUD)', bool(s['raus']) and 'raus' in s['hud'], [s['raus'], s['hud'][:100], s['ausg']])
            sg = gast.evaluate(STAND)
            pruefe('K.-o. (Gast): sieht das Ausscheiden des anderen (ausgeschieden-Flag) und das HUD „K.-o.-Rallye“', any(sg['ausg']) and 'K.-o.' in sg['hud'], [sg['ausg'], sg['hud'][:80]])
            bild(gast, 'ko_gast')
            schluss(host, gast)

        # ============================================================ frei
        if 'frei' in szenarien:
            host, gast = raum(None)
            einstellen(host, 'r2modus', 'frei')
            starten(host, gast)
            for pg in (host, gast): laeuft(pg)
            s = host.evaluate(STAND)
            pruefe('Frei: 12 Kisten gebaut, HUD „Freie Fahrt“', s['kisten'] and len(s['kisten']) == 12 and 'Freie Fahrt' in s['hud'], [s['kisten'], s['hud'][:80]])
            # Host teleportiert sich NICHT: Autopilot beider; Kiste wird irgendwann angefahren
            host.evaluate(AUTOPILOT, 'an'); gast.evaluate(AUTOPILOT, 'an')
            s = warte(host, lambda s: s['kisten'] and any(k > 0 for k in s['kisten']), 150, 2)
            bild(host, 'frei_kiste_host')
            pruefe('Frei: eine Kiste wird vergeben (Server → alle sehen ⏳/🎯/✔)', s['kisten'] and any(k > 0 for k in s['kisten']), s['kisten'])
            sg = gast.evaluate(STAND)
            pruefe('Frei (Gast): sieht denselben Kisten-Zustand', sg['kisten'] == s['kisten'] or any(k > 0 for k in (sg['kisten'] or [])), [sg['kisten'], s['kisten']])
            schluss(host, gast)

        # ============================================================ geist
        if 'geist' in szenarien:
            host, gast = raum(None)
            einstellen(host, 'r2geist', 'an')
            e = ui(host, "return u.lobby.einstellungen")
            pruefe('Geist: Lobby-Wahl kommt an (geist true)', e.get('geist') is True, e)
            host.evaluate("(() => { const GE = Rennspiel.SpassGeist; GE.loeschenAlle(window.MOTORRAD === true ? 'motorrad' : 'auto'); })()")
            starten(host, gast)
            for pg in (host, gast): laeuft(pg)
            host.evaluate(AUTOPILOT, 'an'); gast.evaluate(AUTOPILOT, 'an')
            s = warte(host, lambda s: s['geist'] and s['geist']['runden'] >= 0 and s['rz'] == 'laeuft', 20, 1)
            pruefe('Geist: Client-Aufzeichnung läuft', bool(s['geist']), s['geist'])
            schluss(host, gast)

        # ============================================================ dino
        if 'dino' in szenarien:
            host, gast = raum(None)
            einstellen(host, 'r2dino', 'immer')
            starten(host, gast)
            for pg in (host, gast): laeuft(pg)
            host.evaluate(AUTOPILOT, 'an'); gast.evaluate(AUTOPILOT, 'an')
            s = warte(host, lambda s: s['dinoExt'] and s['dino'], 60, 1)
            pruefe('Dino: Begleiter im Extern-Modus (Server rechnet die Aufgaben)', s['dinoExt'] and s['dino'], [s['dinoExt'], s['dino']])
            s = warte(host, lambda s: 'Gold' in (s['meld'] or ''), 90, 1)
            bild(host, 'dino_gold_host')
            pruefe('Dino: erster Goldwurf kommt vom Server (Meldung)', 'Gold' in (s['meld'] or ''), s['meld'])
            schluss(host, gast)

        # ============================================================ aus (Offline und Rennen unverändert)
        if 'aus' in szenarien:
            host, gast = raum(None)
            starten(host, gast)
            for pg in (host, gast): laeuft(pg)
            s = host.evaluate(STAND)
            pruefe('Normales Online-Rennen: kein R2-Zustand, kein Extern-Dino', s['hud'] == '' and not s['dinoExt'] and not host.evaluate("!!Rennspiel.spiel.online._r2"), s['hud'][:40])
            schluss(host, gast)

        browser.close()

try:
    szen = sys.argv[1:] or ['lobby', 'aus', 'kurz', 'ko', 'frei', 'geist', 'dino']
    main(szen)
finally:
    try: server.terminate(); server.wait(timeout=5)
    except Exception: server.kill()

pruefe('keine JS-Fehler in allen Seiten', not fehler, fehler[:5])
print('%d OK, %d FEHL  (%.0f s)' % (sum(ergebnisse), len(ergebnisse) - sum(ergebnisse), time.time() - START))
sys.exit(0 if all(ergebnisse) else 1)
