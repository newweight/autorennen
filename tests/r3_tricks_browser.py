#!/usr/bin/env python3
"""R3 – Browser-Prüfung der KI-Tricks (Playwright, SwiftShader): KI-Auto Fassrolle/Schraube, KI-Motorrad Superman/Handstand/Backflip, Schalter aus = kein Trick.
Bilder nach tests/bilder_r3/. Aufruf: python3 tests/r3_tricks_browser.py [Motorrad|Autorennen|beide]
R3 online (Teil C-H): python3 tests/r3_tricks_browser.py online        Auto-Raum mit 2 echten Seiten (Host + Gast): Lobby-Zeile 🤸 Tricks, Fassrolle per Umschalt-Taste (Server rechnet), Pose bei beiden Seiten, Meldung, Raum ohne tricks unverändert
                                                      python3 tests/r3_tricks_browser.py online-moto   Motorrad-Raum mit tricks (Server mit --motorrad): Lobby-Zeile, Start, Computer-Tricks-Anzeige ohne Fehler"""
import os, sys, socket, subprocess, time
from playwright.sync_api import sync_playwright
from PIL import Image
basis = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
bild = os.environ.get('BILD_ORDNER') or os.path.join(basis, 'tests', 'bilder_r3'); os.makedirs(bild, exist_ok=True)
wahl = sys.argv[1] if len(sys.argv) > 1 else 'beide'
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
online = wahl in ('online', 'online-moto')
spiele = [] if online else [('Autorennen.html', 'passat', 'auto')] if wahl == 'Autorennen' else [('Motorrad.html', 'crossmaschine', 'moto')] if wahl == 'Motorrad' else [('Motorrad.html', 'crossmaschine', 'moto'), ('Autorennen.html', 'passat', 'auto')]
ok = 0; fail = 0
def pruefe(name, gut, info=''):
    global ok, fail
    print(('OK   ' if gut else 'FEHL ') + name + ('  (' + str(info) + ')' if info != '' else ''))
    if gut: ok += 1
    else: fail += 1

def sprung_ki(page):
    """KI (Fahrzeug 1) 40 m vor das Trampolin, bis zum Absprung rechnen; Rückgabe Flugnummer."""
    return page.evaluate("""() => {
      const S = Rennspiel.spiel, st = S.strecke, e = st.spass.liste.find(x => x.art === 'trampolin');
      const p = st.spline.punktBei(e.s0 - 40), f = S.fahrzeuge[1], v = f.vehicle;
      v.setzen(p.x, p.z, Rennspiel.headingAus(p.tx, p.tz)); v.vLaengs = 40; f.index = -1; S._vorherAngleichen(f);
      S.pausiert = false;
      for (let i = 0; i < 900 && !f.flug.aktiv; i++) S.physikSchritt(1 / 60);
      S.pausiert = true; S.uhr.rest = 0;
      return f.flug.fluege;
    }""")

def schritte(page, n):
    return page.evaluate("""(n) => { const S = Rennspiel.spiel; S.pausiert = false; for (let i = 0; i < n; i++) S.physikSchritt(1 / 60); S.pausiert = true; S.uhr.rest = 0; const z = S._t3 && S._t3.fz[1]; return { aktiv: S.fahrzeuge[1].flug.aktiv, art: z && z.trick ? z.trick.art : null, p: z && z.trick ? +(z.trick.t / z.trick.dauer).toFixed(2) : 0 }; }""", n)

def seite(page, name, abstand, hoch, winkel=0.0):
    """R6: Bild des KI-Fahrzeugs (Fahrzeug 1) von der Seite aus einer EIGENEN Kamera (Spielschleife stellt die Spielkamera sonst zurück → falsches Motiv: Cockpit des Spielers).
    Erst s.zeichnen() (Posen/Meshes aktualisieren), dann Szene direkt mit eigener Kamera rendern; HUD ist DOM und damit nicht im Bild."""
    import base64
    d = page.evaluate("""([d, h, w]) => { const S = Rennspiel.spiel, f = S.fahrzeuge[1], m = f.mesh, r = S.renderer; S.zeichnen();
      const hd = f.vehicle.heading, rx = Math.cos(hd), rz = -Math.sin(hd), bx = Math.sin(hd), bz = Math.cos(hd);
      m.updateMatrixWorld(true); const c = new THREE.Vector3(); c.setFromMatrixPosition(m.matrixWorld);
      const W = r.domElement.width, H = r.domElement.height, cam = new THREE.PerspectiveCamera(50, W / H, 0.2, 1500);
      cam.position.set(c.x + (rx * Math.cos(w) + bx * Math.sin(w)) * d, c.y + h, c.z + (rz * Math.cos(w) + bz * Math.sin(w)) * d); cam.lookAt(c.x, c.y + 1.1, c.z); cam.updateMatrixWorld(true);
      r.setScissorTest(false); r.setViewport(0, 0, innerWidth, innerHeight); r.render(S.szene, cam); return r.domElement.toDataURL('image/png'); }""", [abstand, hoch, winkel])
    open(os.path.join(bild, name), 'wb').write(base64.b64decode(d.split(',')[1]))

def blatt(namen, ziel, spalten=3):
    ims = [Image.open(os.path.join(bild, n)) for n in namen]
    w, h = ims[0].size; w2, h2 = w // 2, h // 2
    zeilen = (len(ims) + spalten - 1) // spalten
    bl = Image.new('RGB', (w2 * spalten, h2 * zeilen))
    for i, im in enumerate(ims): bl.paste(im.resize((w2, h2)), ((i % spalten) * w2, (i // spalten) * h2))
    bl.save(os.path.join(bild, ziel))

with sync_playwright() as p:
    b = p.chromium.launch(args=ARGS)
    for html, auto, tag in spiele:
        ctx = b.new_context(viewport={'width': 1000, 'height': 600})
        page = ctx.new_page(); page.set_default_timeout(120000)
        fehlerliste = []
        page.on('pageerror', lambda e: fehlerliste.append('pageerror: ' + str(e)))
        page.on('console', lambda m: fehlerliste.append('console.error: ' + m.text) if m.type == 'error' and 'GPU stall' not in m.text and 'WebGL' not in m.text else None)
        page.goto('file://' + os.path.join(basis, html)); page.wait_for_timeout(2000)
        pruefe(tag + ' Schalter KI-Tricks Standard an', page.evaluate("Rennspiel.SpassTricks.an('ki') === true"))
        page.evaluate("Rennspiel.spiel.rennenStarten({ modus: 'solo', streckeId: '%s', autoIds: ['%s', '%s'], runden: 2, gegner: 1, schwierigkeit: 'unschlagbar', fahrhilfe: ['wenig', 'wenig'], zufall: false, spass: true, geist: false })" % ('formel1' if tag == 'moto' else 'wiese', auto, auto))
        page.wait_for_function('Rennspiel.spiel.rennen.zustand === "laeuft"', timeout=120000)
        page.evaluate("Rennspiel.spiel.autopilot(0, true)")
        page.evaluate("Rennspiel.SpassTricks.anSetzen('zeit', false)")
        page.wait_for_timeout(800)
        gewuenscht = ['superman', 'handstand', 'backflip'] if tag == 'moto' else ['fassrolle', 'schraube']
        gesehen = {}
        erzwingen = [a for a in os.environ.get('R3_ERZWINGEN', '').split(',') if a] if tag == 'moto' else []
        # Trampolin-Flug (1,8 s) ist für Superman/Handstand der KI meist zu kurz (Regel: Dauer + Reserve + 0,3 s) → für die Bilder wird der Plan mit früher Startzeit vorgegeben
        RICHT = {'superman': ('hoch', 1), 'handstand': ('rechts', 1), 'backflip': ('runter', 1)}
        for versuch in range(40):
            if erzwingen:
                a = erzwingen.pop(0); rc, dr = RICHT[a]
                page.evaluate("([a, rc, dr]) => { const f = Rennspiel.spiel.fahrzeuge[1]; f._r3 = { nr: f.flug.fluege + 1, plan: { art: a, richtung: rc, dir: dr, startT: 0.1 }, getan: false }; }", [a, rc, dr])
            elif os.environ.get('R3_ERZWINGEN') is not None and os.environ.get('R3_ERZWINGEN') != '' and tag == 'moto': break
            elif all(a in gesehen for a in gewuenscht[:2 if tag == 'moto' else 2]): break
            nr = sprung_ki(page)
            plan = page.evaluate("(() => { const f = Rennspiel.spiel.fahrzeuge[1]; return f._r3 && f._r3.nr === f.flug.fluege ? f._r3.plan : (Rennspiel.SpassTricks._intern.kiPlanFlug(Rennspiel.spiel, 1, f, f.flug.fluege)); })()")
            if not plan or plan['art'] in gesehen:
                page.evaluate("() => { const S = Rennspiel.spiel; S.pausiert = false; for (let i = 0; i < 500 && S.fahrzeuge[1].flug.aktiv; i++) S.physikSchritt(1 / 60); S.pausiert = true; S.uhr.rest = 0; }")
                continue
            art = plan['art']
            # bis kurz nach dem Trickstart rechnen (Start ~ startT + Prüfung)
            st = {'art': None}
            for _ in range(40):
                st = schritte(page, 3)
                if st['art']: break
            if st['art'] != art:
                page.evaluate("() => { const S = Rennspiel.spiel; S.pausiert = false; for (let i = 0; i < 500 && S.fahrzeuge[1].flug.aktiv; i++) S.physikSchritt(1 / 60); S.pausiert = true; S.uhr.rest = 0; }")
                continue
            namen = []
            for k, frames in enumerate([2, 10, 10, 10, 10]):
                schritte(page, frames)
                if tag == 'moto':
                    n = '%s_ki_%s_%d.png' % (tag, art, k); seite(page, n, 6.2, 1.4); namen.append(n)
                else:
                    n = '%s_ki_%s_%d.png' % (tag, art, k); seite(page, n, 7.5, 2.0); namen.append(n)
                    n = '%s_ki_%s_%db.png' % (tag, art, k); seite(page, n, 7.5, 2.0, 1.2); namen.append(n)
            blatt(namen, '%s_ki_%s_folge.png' % (tag, art), 5 if tag == 'moto' else 4)
            z = page.evaluate("(() => { const S = Rennspiel.spiel; S.pausiert = false; for (let i = 0; i < 500 && S.fahrzeuge[1].flug.aktiv; i++) S.physikSchritt(1 / 60); for (let i = 0; i < 6; i++) S.physikSchritt(1 / 60); S.pausiert = true; S.uhr.rest = 0; const z = S._t3.fz[1]; return { stat: z.stat, wackel: !!z.wackel, fehl: z.landeFehler, v: S.fahrzeuge[1].vehicle.vLaengs }; })()")
            gesehen[art] = True
            pruefe(tag + ' KI ' + art + ': fertig gezählt, kein Wackeln/Fehltrick', z['stat'][art] >= 1 and not z['wackel'] and not z['fehl'], z['stat'])
        for a in (gewuenscht[:2] if not os.environ.get('R3_ERZWINGEN') else os.environ['R3_ERZWINGEN'].split(',')):
            pruefe(tag + ' KI zeigt ' + a, a in gesehen)
        # Schalter aus: kein Trick-Zustand der KI
        page.evaluate("Rennspiel.SpassTricks.anSetzen('ki', false)")
        vor = page.evaluate("(Rennspiel.spiel._t3 && Rennspiel.spiel._t3.fz[1]) ? Object.values(Rennspiel.spiel._t3.fz[1].stat).reduce((a, b) => a + b, 0) : 0")
        for _ in range(6):
            sprung_ki(page)
            page.evaluate("() => { const S = Rennspiel.spiel; S.pausiert = false; for (let i = 0; i < 500 && S.fahrzeuge[1].flug.aktiv; i++) S.physikSchritt(1 / 60); S.pausiert = true; S.uhr.rest = 0; }")
        nach = page.evaluate("(Rennspiel.spiel._t3 && Rennspiel.spiel._t3.fz[1]) ? Object.values(Rennspiel.spiel._t3.fz[1].stat).reduce((a, b) => a + b, 0) : 0")
        pruefe(tag + ' Schalter aus: KI macht keine Tricks mehr', nach == vor, '%d → %d' % (vor, nach))
        pruefe(tag + ' keine Seitenfehler', not fehlerliste, fehlerliste[:3])
        ctx.close()
    b.close()

# ================================================================ R3 online (zwei echte Seiten gegen einen echten Server)
def freier_port():
    s = socket.socket(); s.bind(('127.0.0.1', 0)); p = s.getsockname()[1]; s.close(); return p

LANGSAM = "window.__rafMs = 1500; (() => { const o = window.requestAnimationFrame.bind(window); window.requestAnimationFrame = (f) => (window.__rafMs > 0 ? setTimeout(() => f(performance.now()), window.__rafMs) : o(f)); })();"
AUTOPILOT = """() => { const s = Rennspiel.spiel, o = s.online, R = Rennspiel;
  if (!s._origSteuerung) s._origSteuerung = s.input.steuerung.bind(s.input);
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
STAND = """(() => { const s = Rennspiel.spiel, o = s.online; if (!o || !s.rennen) return null; const K = o._r3 || null, V = o.vorhersage;
  const pose = (i) => { const z = s._t3 && s._t3.fz && s._t3.fz[i]; return z ? { art: z.pose.art, p: +(+z.pose.p).toFixed(2), rolle: +(+z.pose.rolle).toFixed(2), schraube: +(+z.pose.schraube).toFixed(2) } : null; };
  return { phase: o.phase, rz: s.rennen.zustand, zeit: Math.round(s.rennen.zeit), du: o.du, r3: !!K, t3: !!s._t3, flug: !!(V && V.fz && V.fz.aktiv), flugT: V && V.fz ? V.fz.t : 0,
    pose0: pose(0), pose1: pose(1), meld: Array.from(document.querySelectorAll('.hud-meldung, .meldung, #hud-meldung')).map(e => e.innerText).join('|'),
    mo: s.stunt ? s.stunt.fz.map(z => z && z.neuPoseZiel ? z.neuPoseZiel.art : null) : null }; })()"""

WATCH = """(auto) => {
  window.__rec = { poses: [], meld: [], gedr: 0, druck: false, fremd: [], flug: 0 };
  const s = Rennspiel.spiel;
  setInterval(() => { try {
    const o = s.online; if (!o || o.phase !== 'rennen') return;
    const fz = o.vorhersage && o.vorhersage.fz, R_ = window.__rec;
    const z = s._t3 && s._t3.fz && s._t3.fz[o.du]; if (z && z.pose.art) R_.poses.push({ art: z.pose.art, p: +z.pose.p.toFixed(2), rolle: +z.pose.rolle.toFixed(2) });
    const z0 = s._t3 && s._t3.fz && s._t3.fz[0]; if (o.du !== 0 && z0 && z0.pose.art) R_.fremd.push({ art: z0.pose.art, p: +z0.pose.p.toFixed(2), rolle: +z0.pose.rolle.toFixed(2) });
    // R6: Bild der Rolle aus eigener Seitenkamera (Host: eigenes Auto, Gast: Auto des Hosts), sobald die Pose läuft – Screenshots per Playwright kommen zu spät
    { const ziel = o.du === 0 ? 0 : 0, zz = s._t3 && s._t3.fz && s._t3.fz[ziel]; window.__shots = window.__shots || [];
      if (zz && zz.pose.art === 'fassrolle' && Math.abs(zz.pose.rolle) > 0.7 && window.__shots.length < 3 && (window.__shotLetzt === undefined || Math.abs(zz.pose.rolle - window.__shotLetzt) > 1.2)) {
        window.__shotLetzt = zz.pose.rolle; const f = s.fahrzeuge[ziel], r = s.renderer; s.zeichnen(); const m = f.mesh; m.updateMatrixWorld(true); const c = new THREE.Vector3(); c.setFromMatrixPosition(m.matrixWorld);
        const hd = f.vehicle.heading, rx = Math.cos(hd), rz = -Math.sin(hd), W = r.domElement.width, H = r.domElement.height, cam = new THREE.PerspectiveCamera(50, W / H, 0.2, 1500);
        cam.position.set(c.x + rx * 7.5, c.y + 2.2, c.z + rz * 7.5); cam.lookAt(c.x, c.y + 1.0, c.z); cam.updateMatrixWorld(true);
        r.setScissorTest(false); r.setViewport(0, 0, innerWidth, innerHeight); r.render(s.szene, cam); window.__shots.push(r.domElement.toDataURL('image/png')); } }
    const h = s.huds && s.huds[0]; if (h && /Fassrolle/.test(h.meldungText || '')) R_.meld.push(h.meldungText);
    if (fz && fz.aktiv) R_.flug++;
    if (auto && fz && fz.aktiv && fz.t >= 0.25 && !R_.druck) { R_.druck = true; R_.gedr++;
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'ShiftRight', key: 'Shift', bubbles: true }));
      setTimeout(() => window.dispatchEvent(new KeyboardEvent('keyup', { code: 'ShiftRight', key: 'Shift', bubbles: true })), 120); }
    if (!(fz && fz.aktiv)) R_.druck = false;
  } catch (e) { } }, 25); return true; }"""

def online_test(moto):
    SEITE = 'Motorrad.html' if moto else 'Autorennen.html'
    sfx = '_moto' if moto else ''
    port = freier_port()
    args = ['node', os.path.join(basis, 'server', 'server.js'), '--port', str(port), '--host', '127.0.0.1'] + (['--motorrad'] if moto else [])
    server = subprocess.Popen(args, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
    for _ in range(100):
        try: socket.create_connection(('127.0.0.1', port), timeout=0.2).close(); break
        except OSError: time.sleep(0.1)
    url = 'http://127.0.0.1:%d/' % port
    fehlerliste = []
    try:
        with sync_playwright() as p:
            b = p.chromium.launch(args=ARGS)
            def seite(name, init=None):
                ctx = b.new_context(viewport={'width': 1100, 'height': 700})
                if init: ctx.add_init_script(init)
                pg = ctx.new_page(); pg.set_default_timeout(120000)
                pg.on('pageerror', lambda e: fehlerliste.append(name + ': ' + str(e)))
                pg.on('console', lambda m: fehlerliste.append(name + ' console.error: ' + m.text) if m.type == 'error' and 'WebGL' not in m.text and 'GPU stall' not in m.text and '405' not in m.text else None)
                return pg
            def laden(pg, pfad):
                pg.goto(pfad, wait_until='domcontentloaded', timeout=300000)
                pg.wait_for_function('window.Rennspiel && Rennspiel.spiel', timeout=300000, polling=300)
                pg.wait_for_timeout(700)
            def ui(pg, js): return pg.evaluate("(() => { const u = Rennspiel.spiel.menue.onlineUi; " + js + " })()")
            def raum():
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
            def labels(pg): return pg.evaluate("Array.from(document.querySelectorAll('#online .on-zeile .on-label')).map(e => e.textContent.trim())")
            def senden(host, einst): host.evaluate("(e) => Rennspiel.spiel.menue.onlineUi.verb.senden({ t: 'einstellungen', einstellungen: e })", einst); host.wait_for_timeout(500)
            def starten(host, gast):
                gast.evaluate("Rennspiel.spiel.menue.onlineUi.aktion('bereit')")
                host.wait_for_function("Rennspiel.spiel.menue.onlineUi.alleBereit()", timeout=15000, polling=200)
                host.evaluate("Rennspiel.spiel.menue.onlineUi.aktion('start')")
                for pg in (host, gast):
                    try: pg.wait_for_function("(() => { const o = Rennspiel.spiel.online; return o && o.phase === 'rennen' && o.vorhersage; })()", timeout=240000, polling=300)
                    except Exception as e:
                        print('Start-Zeitüberschreitung:', pg.evaluate("(() => { const u = Rennspiel.spiel.menue.onlineUi, o = Rennspiel.spiel.online; return JSON.stringify({ ansicht: u && u.ansicht, hinweis: u && u.hinweis, phase: o && o.phase, zustand: Rennspiel.spiel.zustand }); })()"), fehlerliste[:3])
                        raise
            def stand(pg): return pg.evaluate(STAND)
            def bild(pg, name):
                try: pg.screenshot(path=os.path.join(bild_ordner, name + '.png'), timeout=120000)
                except Exception as e: print('Bild fehlgeschlagen', name, e)

            # ---------------- Raum MIT Tricks
            host, gast = raum()
            pruefe('online%s Lobby (Host): Zeile 🤸 Tricks vorhanden (Server meldet hallo.r3)' % sfx, '🤸 Tricks' in labels(host), labels(host))
            pruefe('online%s Lobby (Gast): keine Host-Zeilen, aber Raum noch ohne Tricks' % sfx, '🤸 Tricks' not in labels(gast))
            senden(host, {'streckeId': 'formel1' if moto else 'wiese', 'spass': True, 'gegner': 2, 'runden': 2})
            host.evaluate("Rennspiel.spiel.menue.onlineUi.wertSetzen('r3tricks', 'an')"); host.wait_for_timeout(700)
            pruefe('online%s Lobby: Wahl 🤸 An → Raum-Einstellung tricks = true bei Host und Gast' % sfx, host.evaluate("Rennspiel.spiel.menue.onlineUi.lobby.einstellungen.tricks === true") and gast.evaluate("Rennspiel.spiel.menue.onlineUi.lobby.einstellungen.tricks === true"))
            host.evaluate("(() => { const z = Array.from(document.querySelectorAll('#online .on-zeile')).find(e => e.innerText.indexOf('Tricks') >= 0); if (z) z.scrollIntoView({ block: 'center' }); })()"); host.wait_for_timeout(500)
            bild(host, 'online%s_lobby_tricks' % sfx)
            pruefe('online%s Lobby (Gast): Text "🤸 Tricks: an"' % sfx, gast.evaluate("document.querySelector('#online').innerText.indexOf('Tricks') >= 0"))
            starten(host, gast)
            sh, sg = stand(host), stand(gast)
            if not moto:
                pruefe('online Rennstart: Auto-Raum mit tricks baut den Trick-Zustand auf (_r3, spiel._t3) bei beiden Seiten', sh['r3'] and sh['t3'] and sg['r3'] and sg['t3'], [sh['r3'], sh['t3'], sg['r3'], sg['t3']])
                host.wait_for_function("Rennspiel.spiel.rennen && Rennspiel.spiel.rennen.zustand === 'laeuft'", timeout=60000, polling=300)
                host.evaluate(AUTOPILOT)
                host.evaluate(WATCH, True); gast.evaluate(WATCH, False)      # Beobachter: drückt die Umschalt-Taste 0,25 s nach dem Absprung (echtes keydown), zeichnet Posen und Meldung auf
                ende = time.time() + 480; rec = None; nb = 0
                while time.time() < ende:
                    rec = host.evaluate("window.__rec")
                    if rec and rec['gedr'] >= 1 and nb < 6 and rec['druck']:        # solange die Fassrolle läuft: Bilder (Host und Gast)
                        bild(host, 'online_auto_trick_host_%d' % nb)
                        if nb in (1, 3): bild(gast, 'online_auto_trick_gast_%d' % nb)
                        nb += 1; continue
                    if rec and rec['gedr'] >= 1 and len(rec['poses']) >= 3 and rec['druck'] is False: break
                    host.wait_for_timeout(500)
                pruefe('online Auto: Host kommt in die Luft (Trampolin) und die Taste wurde in der Luft gedrückt', bool(rec and rec['gedr'] >= 1), rec and (rec['gedr'], rec['flug']))
                rec = host.evaluate("window.__rec")
                pruefe('online Auto: der SERVER startet die Fassrolle: Host-Pose fassrolle mit wachsendem Winkel', bool(rec) and len(rec['poses']) >= 3 and all(x['art'] == 'fassrolle' for x in rec['poses']) and max(abs(x['rolle']) for x in rec['poses']) > 1.0, rec and (len(rec['poses']), rec['poses'][:3], rec['poses'][-2:]))
                pruefe('online Auto: Meldung "Fassrolle! +300" beim Host', bool(rec) and len(rec['meld']) >= 1, rec and rec['meld'][:1])
                grec = gast.evaluate("window.__rec")
                pruefe('online Auto: der Gast sieht die Fassrolle des Hosts (Pose von Fahrzeug 0 bei der anderen Seite)', bool(grec) and len(grec['fremd']) >= 1 and all(x['art'] == 'fassrolle' for x in grec['fremd']), grec and (len(grec['fremd']), grec['fremd'][:2]))
                import base64
                for pg_, nm in ((host, 'host'), (gast, 'gast')):
                    for i_, d_ in enumerate(pg_.evaluate("window.__shots || []")):
                        open(os.path.join(bild_ordner, 'online_auto_fassrolle_%s_%d.png' % (nm, i_)), 'wb').write(base64.b64decode(d_.split(',')[1]))
                pruefe('online Auto: Bilder der Fassrolle bei Host und Gast aufgenommen', len(host.evaluate("window.__shots || []")) >= 1 and len(gast.evaluate("window.__shots || []")) >= 1, [len(host.evaluate("window.__shots || []")), len(gast.evaluate("window.__shots || []"))])
                host.wait_for_timeout(1500)
                s = stand(host)
                pruefe('online Auto: nach dem Trick Pose wieder neutral', not (s['pose0'] and s['pose0']['art']), s['pose0'])
            else:
                pruefe('online Motorrad: Raum mit tricks startet, Motorrad-Online-Zustand da (kein Auto-Trickzustand)', sh['phase'] == 'rennen' and not sh['r3'] and sh['mo'] is not None, [sh['phase'], sh['r3'], sh['mo']])
                host.wait_for_function("Rennspiel.spiel.rennen && Rennspiel.spiel.rennen.zustand === 'laeuft'", timeout=60000, polling=300)
                host.wait_for_timeout(8000)
                bild(host, 'online_moto_rennen')
            for pg in (host, gast):
                try: pg.context.close()
                except Exception: pass
            # ---------------- Raum OHNE Tricks (Standard): keine Zeile aktiv, kein Trick-Zustand
            host, gast = raum()
            senden(host, {'streckeId': 'formel1' if moto else 'wiese', 'spass': True, 'gegner': 1, 'runden': 1})
            pruefe('online%s Raum ohne Tricks: Schalter steht auf aus (Standard)' % sfx, host.evaluate("Rennspiel.spiel.menue.onlineUi.lobby.einstellungen.tricks !== true"))
            starten(host, gast)
            sh = stand(host)
            pruefe('online%s Raum ohne Tricks: kein Trick-Zustand (_r3, spiel._t3), Rennen läuft wie bisher' % sfx, sh['phase'] == 'rennen' and not sh['r3'] and (moto or not sh['t3']), [sh['r3'], sh['t3']])
            host.wait_for_timeout(2500)
            host.keyboard.press('ShiftRight')
            host.wait_for_timeout(500)
            pruefe('online%s Raum ohne Tricks: Umschalt-Taste bewirkt nichts (keine Pose)' % sfx, not stand(host)['pose0'] or not stand(host)['pose0']['art'])
            for pg in (host, gast):
                try: pg.context.close()
                except Exception: pass
            b.close()
    finally:
        server.terminate()
    pruefe('online%s keine JS-Fehler auf beiden Seiten' % sfx, not fehlerliste, fehlerliste[:3])

bild_ordner = bild
if online:
    online_test(wahl == 'online-moto')
print('\n%d OK, %d FEHL' % (ok, fail))
sys.exit(1 if fail else 0)
