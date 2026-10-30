#!/usr/bin/env python3
"""R4 P5 + Lobby-Reihenfolge im Browser (Playwright, headless Chromium, Software-GL):
   python3 tests/r4_lobby_browser.py [lobby|loop ...]     lobby = Reihenfolge/Sichtbarkeit der Spaß-Zeilen + Bilder 844x390 und 1100x650 (Bilder: tests/bilder_r4/lobby_*.png)
                                                          loop  = (nur Auto) loopMag online: Host + Gast, Fantasie, 0 Loopings / Röhren wie der Server (Node-Wert), Standard klassisch
   Variante Motorrad: R4_MOTO=1 (Motorrad.html, Server --motorrad; loop entfällt)
Hinweis (2 Kerne): immer nur ein Szenario gleichzeitig, großzügige Zeitgrenzen; die Nebenseite (Gast) rendert gedrosselt."""
import sys, os, socket, subprocess, time, json
from playwright.sync_api import sync_playwright

basis = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MOTO = os.environ.get('R4_MOTO') == '1'
SEITE = 'Motorrad.html' if MOTO else 'Autorennen.html'
SUFFIX = '_moto' if MOTO else ''
out = os.path.join(basis, 'tests', 'bilder_r4')
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
os.makedirs(os.path.join(basis, 'tests', 'out', 'r4'), exist_ok=True)
SERVERLOG = os.path.join(basis, 'tests', 'out', 'r4', 'server_lobby%s.log' % ('_moto' if MOTO else ''))
# R2-FIX: Server-Ausgabe in eine Datei (nicht in eine ungelesene Pipe: laeuft die voll, steht der Server und trennt Clients) – dient zugleich als Server-Log
server = subprocess.Popen(args, stdout=open(SERVERLOG, 'w'), stderr=subprocess.STDOUT, text=True)
for _ in range(100):
    try: socket.create_connection(('127.0.0.1', port), timeout=0.2).close(); break
    except OSError: time.sleep(0.1)
url = 'http://127.0.0.1:%d/' % port
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
# Seiten, die gerade nicht gebraucht werden, rendern gedrosselt (window.__rafMs > 0); window.__rafMs = 0 schaltet auf normal zurück
LANGSAM = "window.__rafMs = 1500; (() => { const o = window.requestAnimationFrame.bind(window); window.requestAnimationFrame = (f) => (window.__rafMs > 0 ? setTimeout(() => f(performance.now()), window.__rafMs) : o(f)); })();"

STAND_L = """(() => { const s = Rennspiel.spiel, st = s.strecke; if (!st) return null; const z = st.spass && st.spass.zauber;
  return { loopings: st.loopings.length, magnet: z ? z.magnet.length : -1, aus: z ? z.magnet.filter(m => m.ausLooping).length : -1,
    rohre: z ? z.magnet.map(m => [m.s0, m.s1, m.laenge, m.rampe, !!m.ausLooping].join(':')).join('|') : '', id: st.daten && st.daten.id,
    lm: s.einstellungen && s.einstellungen.loopMag, zauber: s.einstellungen && s.einstellungen.zauber }; })()"""
VIEWS = [(844, 390), (1100, 650)]
VPW_ = {'844x390': 844, '1100x650': 1100}; VPH_ = {'844x390': 390, '1100x650': 650}

def node_erwartung(mag):
    """Server-Seite: Strecke Fantasie mit/ohne loopMag aus demselben Code (Node), Rückgabe {loopings, magnet, aus, rohre}"""
    js = ("const {Simulation}=require('./server/simulation');"
          "const sim=new Simulation({einstellungen:{streckeId:'fantasie',gegner:1,runden:1,spass:true,zauber:true,zufall:false" + (",loopMag:true" if mag else "") + "},spieler:[{fahrer:'A',auto:'porsche-911',hilfe:'wenig'}],seed:5});"
          "const st=sim.sim.strecke,z=st.spass.zauber;console.log(JSON.stringify({loopings:st.loopings.length,magnet:z.magnet.length,aus:z.magnet.filter(m=>m.ausLooping).length,rohre:z.magnet.map(m=>[m.s0,m.s1,m.laenge,m.rampe,!!m.ausLooping].join(':')).join('|')}))")
    return json.loads(subprocess.check_output(['node', '-e', js], cwd=basis, text=True).strip().splitlines()[-1])

def main(szenarien):
    with sync_playwright() as p:
        browser = p.chromium.launch(args=ARGS)

        def seite(name, init=None, vp=(1100, 650)):
            ctx = browser.new_context(viewport={'width': vp[0], 'height': vp[1]})
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

        def raum(vp, mit_gast=False, init=LANGSAM):
            host = seite('Host', init, vp); laden(host, url + SEITE)
            host.evaluate("(() => { Rennspiel.spiel.menue.onlineOeffnen(); Rennspiel.spiel.menue.onlineUi.erstellen(); })()")
            host.wait_for_function("(() => { const u = Rennspiel.spiel.menue.onlineUi; return u && u.lobby && u.ansicht === 'lobby'; })()", timeout=60000, polling=200)
            gast = None
            if mit_gast:
                code = ui(host, "return u.lobby.code")
                gast = seite('Gast', LANGSAM, vp); laden(gast, url + SEITE + '?raum=' + code.lower())
                gast.wait_for_function("(() => { const u = Rennspiel.spiel.menue.onlineUi; return u && u.ansicht === 'code'; })()", timeout=60000, polling=200)
                gast.keyboard.press('Enter')
                gast.wait_for_function("(() => { const u = Rennspiel.spiel.menue.onlineUi; return u && u.lobby && u.ansicht === 'lobby'; })()", timeout=30000, polling=200)
            host.evaluate('window.__rafMs = 0')
            if gast: gast.evaluate('window.__rafMs = 0')
            host.wait_for_timeout(600)
            return host, gast

        def einstellen(host, zeile, k):
            host.evaluate("(a) => Rennspiel.spiel.menue.onlineUi.wertSetzen(a[0], a[1])", [zeile, k])
            host.wait_for_timeout(500)

        def bild(pg, name):
            try: pg.screenshot(path=os.path.join(out, name + '.png'), timeout=120000)
            except Exception as e: print('Bild fehlgeschlagen', name, e)

        def schluss(*pgs):
            for pg in pgs:
                try: pg and pg.context.close()
                except Exception: pass

        # ============================================================ lobby: Reihenfolge, Sichtbarkeit, Bilder
        if 'lobby' in szenarien:
            for vp in VIEWS:
                tag = '%dx%d' % vp
                host, _ = raum(vp)
                zeilen = ui(host, "return u.zeilen()")
                labels = host.evaluate("Array.from(document.querySelectorAll('#online .on-zeile .on-label')).map(e => e.textContent.trim())")
                def pos(teil): return next((i for i, l in enumerate(labels) if teil in l), -1)
                reihenfolge = ['Spielart', 'Spaß-Elemente', 'Fahr-Zauber'] + ([] if MOTO else ['Loopings']) + ['Tricks', 'Strecke']
                ps = [pos(t) for t in reihenfolge]
                pruefe('Lobby %s: Zeilen in der Reihenfolge %s' % (tag, ' · '.join(reihenfolge)), all(x >= 0 for x in ps) and ps == sorted(ps), ps)
                pruefe('Lobby %s: Loopings-Zeile %s' % (tag, 'fehlt im Motorrad (richtig)' if MOTO else 'da'), (pos('Loopings') < 0) == MOTO, labels[:8])
                # Fokus-Reihenfolge = Anzeige-Reihenfolge der Host-Spalte
                fok = host.evaluate("Array.from(document.querySelectorAll('#online .on-einst .on-zeile[data-a^=\"fokus:\"]')).map(e => +e.getAttribute('data-a').split(':')[1])")
                pruefe('Lobby %s: Fokus-Nummern der Host-Spalte aufsteigend (Tastatur folgt der Anzeige)' % tag, fok == sorted(fok) and len(set(fok)) == len(fok), fok)
                namen = ['r2modus', 'spass', 'zauber'] + ([] if MOTO else ['loopmag']) + ['r3tricks', 'strecke']
                idx = [zeilen.index(n) if n in zeilen else -1 for n in namen]
                pruefe('Lobby %s: zeilen() = %s' % (tag, namen), all(i >= 0 for i in idx) and idx == sorted(idx), zeilen[:10])
                # Sichtbarkeit: wie weit muss man scrollen, bis die Zeile ganz in der Host-Spalte steht (Spalte = on-einst)
                def sicht(teil):
                    return host.evaluate("""(t) => { const sp = document.querySelector('#online .on-einst'); const z = Array.from(sp.querySelectorAll('.on-zeile')).find(e => e.querySelector('.on-label').textContent.includes(t));
                      if (!z) return null; const a = sp.getBoundingClientRect(), r = z.getBoundingClientRect();
                      return { scroll: Math.max(0, Math.round(r.bottom - a.bottom)), spalte: Math.round(a.height), ganz: r.top >= a.top - 1 && r.bottom <= a.bottom + 1 }; }""", teil)
                sv = {t: sicht(t) for t in ['Tricks', 'Loopings', 'Fahr-Zauber', 'Spaß-Elemente', 'Strecke']}
                if tag == '1100x650':
                    pruefe('Lobby %s: Tricks-Zeile (und alle Spaß-Zeilen) ohne Scrollen ganz im Bild' % tag, all(sv[t] is None or sv[t]['ganz'] for t in ['Tricks', 'Loopings', 'Fahr-Zauber', 'Spaß-Elemente']), sv)
                else:
                    pruefe('Lobby %s: Tricks-Zeile nach höchstens 1 Spaltenhöhe Scrollen erreichbar (%s px bei Spalte %s px)' % (tag, sv['Tricks']['scroll'], sv['Tricks']['spalte']), sv['Tricks'] and sv['Tricks']['scroll'] <= sv['Tricks']['spalte'] * 1.2, sv)
                # Mausrad scrollt die Host-Spalte
                host.mouse.move(int(VPW_[tag] * 0.82), int(VPH_[tag] * 0.55)); host.mouse.wheel(0, 300); host.wait_for_timeout(300)
                st = host.evaluate("document.querySelector('#online .on-einst').scrollTop")
                pruefe('Lobby %s: Mausrad scrollt die Host-Spalte (scrollTop %s)' % (tag, st), st > 0 or sv['Tricks']['ganz'] and tag == '1100x650' and host.evaluate("(() => { const e = document.querySelector('#online .on-einst'); return e.scrollHeight > e.clientHeight; })()"), st)
                host.evaluate("document.querySelector('#online .on-einst').scrollTop = 0")
                # Tastatur: ↓ von Loopings (Auto) bzw. Fahr-Zauber (Motorrad) auf Tricks → Zeile steht ganz in der Spalte
                vor = 'zauber' if MOTO else 'loopmag'
                ui(host, "u.fokus = u.zeilen().indexOf('%s'); u.zeichnen();" % vor)
                host.keyboard.press('ArrowDown'); host.wait_for_timeout(400)
                fz = host.evaluate("""(() => { const sp = document.querySelector('#online .on-einst'), f = sp.querySelector('.on-zeile.fokus'); if (!f) return null; const a = sp.getBoundingClientRect(), r = f.getBoundingClientRect();
                  return { label: f.querySelector('.on-label').textContent.trim(), ganz: r.top >= a.top - 1 && r.bottom <= a.bottom + 1 }; })()""")
                pruefe('Lobby %s: ↓ auf „Tricks“ → Fokus-Zeile ist Tricks und steht ganz in der Spalte' % tag, fz and 'Tricks' in fz['label'] and fz['ganz'], fz)
                host.evaluate("document.querySelector('#online .on-einst').scrollTop = 0")
                ui(host, "u.fokus = 0; u.zeichnen();")
                host.wait_for_timeout(200)
                bild(host, 'lobby_%s_%s%s' % ('moto' if MOTO else 'auto', tag, ''))
                # Klick/Wert: Tricks an/aus und Loopings (Auto) schalten
                einstellen(host, 'r3tricks', 'an')
                pruefe('Lobby %s: Tricks an → Raum-Einstellung tricks:true' % tag, ui(host, "return u.lobby.einstellungen.tricks") is True)
                einstellen(host, 'r3tricks', 'aus')
                if not MOTO:
                    einstellen(host, 'loopmag', 'mag')
                    e = ui(host, "return u.lobby.einstellungen")
                    pruefe('Lobby %s: Loopings → Magnet-Röhre → Raum-Einstellung loopMag:true' % tag, e.get('loopMag') is True, [e.get('spass'), e.get('zauber'), e.get('loopMag')])
                    bild(host, 'lobby_auto_%s_magnet' % tag)
                    einstellen(host, 'zauber', 'aus')
                    e = ui(host, "return u.lobby.einstellungen")
                    pruefe('Lobby %s: Fahr-Zauber aus → loopMag verschwindet (Server)' % tag, 'loopMag' not in e and e.get('zauber') is False, e.get('loopMag'))
                    einstellen(host, 'zauber', 'an'); einstellen(host, 'loopmag', 'klassisch')
                schluss(host)

        # ============================================================ loop: Online-Rennen Fantasie mit Magnet-Röhre (Host + Gast)
        if 'loop' in szenarien and not MOTO:
            for mag in (True, False):
                erw = node_erwartung(mag)
                host, gast = raum((1100, 650), mit_gast=True)
                einstellen(host, 'strecke', 'fantasie')
                if mag: einstellen(host, 'loopmag', 'mag')
                e = ui(host, "return u.lobby.einstellungen")
                pruefe('Online %s: Raum-Einstellungen fantasie, spass/zauber an, loopMag %s' % ('Magnet' if mag else 'klassisch', 'true' if mag else 'fehlt'),
                       e.get('streckeId') == 'fantasie' and e.get('spass') is True and e.get('zauber') is True and (e.get('loopMag') is True) == mag and (mag or 'loopMag' not in e), e)
                gtxt = gast.evaluate("document.querySelector('#online .on-zusammen') ? document.querySelector('#online .on-zusammen').innerText : ''")
                pruefe('Online %s: Gast sieht %s' % ('Magnet' if mag else 'klassisch', 'Hinweis „Magnet-Röhre“' if mag else 'keinen Magnet-Hinweis'), ('Magnet-Röhre' in gtxt) == mag, gtxt[-90:])
                gast.evaluate("Rennspiel.spiel.menue.onlineUi.aktion('bereit')")
                host.wait_for_function("Rennspiel.spiel.menue.onlineUi.alleBereit()", timeout=15000, polling=200)
                host.evaluate("Rennspiel.spiel.menue.onlineUi.aktion('start')")
                for pg in (host, gast):
                    pg.wait_for_function("(() => { const o = Rennspiel.spiel.online; return o && o.phase === 'rennen' && o.vorhersage; })()", timeout=180000, polling=300)
                sh, sg = host.evaluate(STAND_L), gast.evaluate(STAND_L)
                for n, s in (('Host', sh), ('Gast', sg)):
                    pruefe('Online %s %s: Strecke wie Server (Node): Loopings %s, Röhren %s (aus Loopings %s), gleiche Röhren-Daten' % ('Magnet' if mag else 'klassisch', n, erw['loopings'], erw['magnet'], erw['aus']),
                           s and s['id'] == 'fantasie' and s['loopings'] == erw['loopings'] and s['magnet'] == erw['magnet'] and s['aus'] == erw['aus'] and s['rohre'] == erw['rohre'], s)
                pruefe('Online %s: Host-Einstellung loopMag in der Browser-Strecke = %s' % ('Magnet' if mag else 'klassisch', mag), (sh['lm'] is True) == mag, sh['lm'])
                bild(host, 'online_loopmag_host' if mag else 'online_klassisch_host')
                schluss(host, gast)

        browser.close()

try:
    szen = sys.argv[1:] or ['lobby', 'loop']
    main(szen)
finally:
    try: server.terminate(); server.wait(timeout=5)
    except Exception: server.kill()

pruefe('keine JS-Fehler in allen Seiten', not fehler, fehler[:5])
print('%d OK, %d FEHL  (%.0f s)' % (sum(ergebnisse), len(ergebnisse) - sum(ergebnisse), time.time() - START))
sys.exit(0 if all(ergebnisse) else 1)
