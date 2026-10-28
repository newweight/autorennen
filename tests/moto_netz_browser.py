#!/usr/bin/env python3
"""Motorrad M4 online im Browser (Playwright, headless Chromium): python3 tests/moto_netz_browser.py [ausgabeordner]
Startet server/server.js --motorrad als Unterprozess (freier Port) und spielt mit echten Browser-Seiten:

 A) Menü (Seite vom Spielserver): Karte „Online“ da, Text/Titel Motorrad, Taste O öffnet den Online-Bildschirm, Titel-Emoji 🏍️
 B) Host erstellt Motorrad-Raum, Lobby: Zeilen Unfälle/Stuntrennen (keine Polizei), Einladungslink = Seite selbst; Gast über ?raum=, wählt Quad, bereit
 C) Auto-Raum daneben (Autorennen.html): anderer Code, keine Motorrad-Felder; Motorrad-Gast in den Auto-Code → Hinweis „Auto-Raum“ (falscheArt)
 D) Rennen zu zweit (Superbike + Quad): Schattenzustand (Stunts/Unfall/Stationen) gebaut, beide fahren; Host stürzt (Vollgas in die Bande) → Purzelbaum auf BEIDEN Seiten,
    Unfall-% sichtbar; das Quad (Gast, gleiche Eingabe) stürzt nie; Stuntpunkte kommen bei beiden an
 E) Helfer-Fahrzeuge/Stationen im echten Browser (künstlicher Server-Zustand: Szene Abschleppwagen/Krankenwagen, Station): Meshes gebaut, Bild ohne Fehler
 F) Ergebnistafel mit Spalte „Stunt“ (künstliches Ergebnis) + Meldung an das Portal (POST /api/bestenliste, Body {spiel, modus, name, punkte})
 G) Motorrad-Seite NICHT vom Spielserver (statischer Server wie das Portal, window.MOTORRAD_SERVER): Raum erstellen/beitreten geht trotzdem
 H) Zweispieler offline unverändert: Start mit Split-Screen ohne Fehler, keine Online-Zustände; Autorennen.html lädt fehlerfrei (Online-Karte wie vorher)
 Keine JS-Fehler in allen Seiten. Prozesse (Server, Browser) werden am Ende sicher beendet.
Bilder: tests/out/moto_netz/"""
import sys, os, socket, subprocess, time, json, threading, http.server, functools, signal
from playwright.sync_api import sync_playwright

basis = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
out = sys.argv[1] if len(sys.argv) > 1 else os.path.join(basis, 'tests', 'out', 'moto_netz')
os.makedirs(out, exist_ok=True)
ergebnisse, fehler = [], []
START = time.time()

def pruefe(name, ok, info=''):
    ergebnisse.append(bool(ok))
    print(('OK   ' if ok else 'FEHL ') + name + (('  (' + str(info) + ')') if info != '' else ''), flush=True)

def freier_port():
    s = socket.socket(); s.bind(('127.0.0.1', 0)); p = s.getsockname()[1]; s.close(); return p

def warten_auf_port(port):
    for _ in range(100):
        try: socket.create_connection(('127.0.0.1', port), timeout=0.2).close(); return True
        except OSError: time.sleep(0.1)
    return False

port = freier_port()
server = subprocess.Popen(['node', os.path.join(basis, 'server', 'server.js'), '--port', str(port), '--host', '127.0.0.1', '--motorrad'],
                          stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
# „Portal“: statischer Server auf anderem Port (nur Dateien, kein /ws) – wie portal_server.py für www/motorrad
class Still(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
portal_port = freier_port()
portal = http.server.ThreadingHTTPServer(('127.0.0.1', portal_port), functools.partial(Still, directory=basis))
threading.Thread(target=portal.serve_forever, daemon=True).start()
warten_auf_port(port)
url = 'http://127.0.0.1:%d/' % port
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']

# Nebenseiten (Auto-Raum, falscher Code) rendern kaum: sonst verhungern die Software-GL-Seiten auf wenigen Kernen
LANGSAM = "window.requestAnimationFrame = (f) => setTimeout(() => f(performance.now()), 500);"
AUTOPILOT = """(art) => { const s = Rennspiel.spiel, o = s.online, R = Rennspiel;
  if (!s._origSteuerung) s._origSteuerung = s.input.steuerung.bind(s.input);
  if (art === 'aus') { s.input.steuerung = s._origSteuerung; return true; }
  if (art === 'bande') { s.input.steuerung = (nr) => (nr === 0 ? { gas: 1, bremse: 0, lenkung: 0.3 } : { gas: 0, bremse: 0, lenkung: 0 }); return true; }
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
LAGE = """(() => { const s = Rennspiel.spiel, o = s.online; if (!o || !s.rennen) return null; const du = o.du;
  return { du, rz: s.rennen.zustand, v: s.fahrzeuge[du].vehicle.vLaengs, fort: s.rennen.teilnehmer.map(t => Math.round(t.fortschritt)),
    purzel: s.fahrzeuge.map(f => f.motoZ ? f.motoZ.purzel.anzahl : -1), purzelAktiv: s.fahrzeuge.map(f => f.motoZ ? f.motoZ.purzel.aktiv : null),
    punkte: s.stunt ? s.stunt.fz.map(z => z.punkte) : null, un: s.unfall ? s.unfall.fz.map(u => u && [Math.round(u.zustand), Math.round(u.gesundheit)]) : null,
    hart: o.vorhersage.stat.hart, fps: Math.round(s.uhr.fps), station: !!s.motoStationen }; })()"""

def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(args=ARGS)

        def seite(name, init=None):
            ctx = browser.new_context(viewport={'width': 1280, 'height': 800})
            if init: ctx.add_init_script(init)
            pg = ctx.new_page()
            pg.on('pageerror', lambda e: fehler.append(name + ': ' + str(e)))
            pg.on('console', lambda m: fehler.append(name + ' console.error: ' + m.text) if m.type == 'error' and not (name == 'PortalOhne' and 'WebSocket' in m.text) else None)
            return pg

        def laden(pg, pfad, mit_server=True):
            pg.goto(pfad, wait_until='domcontentloaded', timeout=120000)
            pg.wait_for_function('window.Rennspiel && Rennspiel.spiel', timeout=90000, polling=200)
            pg.wait_for_timeout(700)

        def lobby_warten(pg):
            pg.wait_for_function("Rennspiel.spiel.menue.onlineUi && Rennspiel.spiel.menue.onlineUi.lobby !== null && Rennspiel.spiel.menue.onlineUi.ansicht === 'lobby'", timeout=15000, polling=200)
            pg.wait_for_timeout(300)

        CODE_AUTO = []
        # ============================================================ C) Auto-Raum daneben + falsche Art
        auto = seite('AutoHost', LANGSAM)
        laden(auto, url + 'Autorennen.html')
        for _ in range(4): auto.keyboard.press('ArrowRight'); auto.wait_for_timeout(80)
        auto.keyboard.press('Enter'); auto.wait_for_timeout(300); auto.keyboard.press('Enter'); lobby_warten(auto)
        code_a = auto.evaluate('Rennspiel.spiel.menue.onlineUi.lobby.code')
        ea = auto.evaluate('Rennspiel.spiel.menue.onlineUi.lobby.einstellungen')
        la = auto.evaluate("Array.from(document.querySelectorAll('#online .on-zeile .on-label')).map(e => e.textContent.trim())")
        pruefe('C Auto-Raum (Autorennen.html, unveränderter Client) neben dem Motorrad-Raum: anderer Code, keine Motorrad-Felder (Code-Unterschied zum Motorrad-Raum: siehe unten), Zeilen Polizei/Verkehr wie immer',
               bool(code_a) and ea.get('moto') is None and ea.get('unfall') is None and any('Polizei' in l for l in la) and any('Verkehr' in l for l in la), [code_a, la[-4:]])
        falsch = seite('Falsch', LANGSAM)
        laden(falsch, url + 'Motorrad.html?raum=' + code_a.lower())
        falsch.wait_for_function("Rennspiel.spiel.menue.onlineUi && Rennspiel.spiel.menue.onlineUi.ansicht === 'code'", timeout=60000, polling=200)
        falsch.keyboard.press('Enter'); falsch.wait_for_timeout(1200)
        hw = falsch.evaluate("({ ansicht: Rennspiel.spiel.menue.onlineUi.ansicht, hinweis: Rennspiel.spiel.menue.onlineUi.hinweis, lobby: !!Rennspiel.spiel.menue.onlineUi.lobby })")
        pruefe('C Motorrad-Spieler mit Auto-Code: Hinweis „Auto-Raum“, bleibt in der Code-Eingabe, keine Lobby', hw['ansicht'] == 'code' and 'Auto-Raum' in hw['hinweis'] and not hw['lobby'], hw)
        auto_lobby_n = auto.evaluate('Rennspiel.spiel.menue.onlineUi.lobby.spieler.length')
        pruefe('C Auto-Raum bleibt unberührt (1 Spieler)', auto_lobby_n == 1, auto_lobby_n)
        falsch.context.close()

        CODE_AUTO.append(code_a); auto.context.close()   # bei nur 2 Kernen verhungern sonst die Software-GL-Seiten

        # ============================================================ A) Menü
        host = seite('Host')
        laden(host, url + 'Motorrad.html')
        karte = host.evaluate("(() => { const k = document.querySelector('[data-a=\"online\"]'); return k ? { aus: k.classList.contains('aus'), text: k.textContent, title: k.getAttribute('title') } : null; })()")
        pruefe('A Menü: Karte „Online“ ist da und aktiv (Seite vom Spielserver), Text „Motorrad-Raum“, Titel ohne Tags',
               karte is not None and not karte['aus'] and 'Motorrad-Raum' in karte['text'] and 'übers Internet' not in karte['text'] and karte['title'] and '<' not in karte['title'], karte)
        host.screenshot(path=os.path.join(out, '01_menue.png'))
        host.keyboard.press('KeyO'); host.wait_for_timeout(400)
        titel = host.evaluate("(() => { const e = document.querySelector('#online .m-titel'); return e ? e.textContent : null; })()")
        pruefe('A Taste O öffnet den Online-Bildschirm (Raum erstellen / beitreten), Titel mit 🏍️ statt 🏎️', host.is_visible('#online') and host.is_visible('[data-a="erstellen"]') and titel and '🏍' in titel and '🏎' not in titel, titel)
        host.screenshot(path=os.path.join(out, '02_online_start.png'))

        # ============================================================ B) Lobby
        host.keyboard.press('Enter'); lobby_warten(host)
        code = host.evaluate('Rennspiel.spiel.menue.onlineUi.lobby.code')
        einst = host.evaluate('Rennspiel.spiel.menue.onlineUi.lobby.einstellungen')
        lob = host.evaluate("""(() => ({ labels: Array.from(document.querySelectorAll('#online .on-zeile .on-label')).map(e => e.textContent.trim()), link: document.querySelector('.on-link').textContent,
          h3: Array.from(document.querySelectorAll('#online h3')).map(e => e.textContent.trim()), spieler: Array.from(document.querySelectorAll('#online .on-sp .on-auto')).map(e => e.textContent.trim()),
          autoPillen: Array.from(document.querySelectorAll('[data-a^="wert:auto:"]')).map(e => e.getAttribute('data-a').slice(10)) }))()""")
        pruefe('B Lobby (Host): Motorrad-Raum (moto, Unfälle sanft), Zeilen „Unfälle“ + „Stuntrennen“, keine Polizei/Verkehr/Rennautos, Motorrad-Auswahl mit Superbike/Roller/Chopper/Quad, Link = Motorrad-Seite',
               einst.get('moto') is True and einst.get('unfall') == 'sanft' and any('Unfälle' in l for l in lob['labels']) and any('Stuntrennen' in l for l in lob['labels']) and not any(x in ' '.join(lob['labels']) for x in ('Polizei', 'Verkehr', 'Rennautos'))
               and all(x in lob['autoPillen'] for x in ('superbike', 'roller', 'chopper', 'quad')) and 'porsche-911' not in lob['autoPillen'] and lob['link'] == url + 'Motorrad.html?raum=' + code, [lob['labels'], lob['link']])
        host.screenshot(path=os.path.join(out, '03_lobby_host.png'))
        # Host: Einstellungen
        for a in ['wert:runden:1', 'wert:gegner:1', 'wert:unfall:echt', 'wert:stuntrennen:an']:
            host.click('[data-a="%s"]' % a); host.wait_for_timeout(350)
        e2 = host.evaluate('Rennspiel.spiel.menue.onlineUi.lobby.einstellungen')
        pruefe('B Host stellt per Klick ein: 1 Runde, 1 Computer, Unfälle „Echt“, Stuntrennen an (Server übernimmt)', e2['runden'] == 1 and e2['gegner'] == 1 and e2['unfall'] == 'echt' and e2['stuntrennen'] is True, e2)
        gast = seite('Gast')
        laden(gast, url + 'Motorrad.html?raum=' + code.lower())
        gast.wait_for_function("Rennspiel.spiel.menue.onlineUi && Rennspiel.spiel.menue.onlineUi.ansicht === 'code'", timeout=60000, polling=200)
        vor = gast.evaluate("Rennspiel.spiel.menue.onlineUi.code.join('')")
        pruefe('B Gast: Link ?raum= öffnet die Code-Eingabe (vorausgefüllt)', vor == code, vor)
        gast.keyboard.press('Enter'); lobby_warten(gast)
        host.wait_for_function("Rennspiel.spiel.menue.onlineUi.lobby.spieler.length === 2", timeout=10000, polling=200)
        gast.click('[data-a="wert:auto:quad"]'); gast.wait_for_timeout(300)
        host.click('[data-a="wert:auto:superbike"]'); host.wait_for_timeout(300)
        gast.keyboard.press('Space')
        host.wait_for_function("Rennspiel.spiel.menue.onlineUi.lobby.spieler[1].bereit === true", timeout=10000, polling=200)
        gz = gast.evaluate("document.querySelector('.on-zusammen').textContent")
        autos = host.evaluate("Rennspiel.spiel.menue.onlineUi.lobby.spieler.map(s => s.auto)")
        pruefe('B Gast-Lobby: sieht „Unfälle: echt“ + Stuntrennen, kein Polizei-Text; Wahl Superbike (Host) + Quad (Gast)', 'Unfälle: echt' in gz and 'Stuntrennen' in gz and 'Polizei' not in gz and autos == ['superbike', 'quad'], [gz[-80:], autos])
        gast.screenshot(path=os.path.join(out, '04_lobby_gast.png'))

        # ============================================================ D) Rennen
        host.keyboard.press('Enter')
        pruefe('C Motorrad-Raum und Auto-Raum haben verschiedene Codes und laufen parallel auf demselben Server', CODE_AUTO and CODE_AUTO[0] != code, [CODE_AUTO, code])
        for pg in (host, gast):
            pg.wait_for_function("Rennspiel.spiel.zustand === 'online' && Rennspiel.spiel.online && Rennspiel.spiel.online.empfangen", timeout=60000, polling=200)
        S = "(() => { const s = Rennspiel.spiel; return { stunt: !!s.stunt && s.stunt.fz.length, unfall: !!s.unfall && s.unfall.modus, rennen: s.stuntrennen, station: !!s.motoStationen, hud: !!document.querySelector('.moto-stunt, .moto-zustand'), du: s.online.du, autoIds: s.fahrzeuge.map(f => f.auto && f.auto.id) }; })()"
        sh, sg = host.evaluate(S), gast.evaluate(S)
        pruefe('D Rennen gebaut (beide): Stunt-/Unfall-Schattenzustand je Teilnehmer, Modus echt, Werkstatt + Krankenstation, HUD mit Unfall-/Stunt-Anzeige, Superbike + Quad',
               sh['stunt'] == 3 and sg['stunt'] == 3 and sh['unfall'] == 'echt' and sh['station'] and sg['station'] and sh['hud'] and sh['autoIds'][:2] == ['superbike', 'quad'], [sh, sg])
        # Phase 1: Host + Gast fahren Vollgas in die Bande (Host = Superbike stürzt, Gast = Quad nie)
        for pg in (host, gast): pg.evaluate(AUTOPILOT, 'bande')
        gestuerzt = False
        for i in range(60):
            host.wait_for_timeout(1000)
            lh = host.evaluate(LAGE)
            if lh and lh['purzel'][0] >= 1: gestuerzt = True; break
        lh, lg = host.evaluate(LAGE), gast.evaluate(LAGE)
        gast.wait_for_timeout(1500); lg = gast.evaluate(LAGE)
        pruefe('D Host (Superbike) stürzt in die Bande: Purzelbaum-Zähler steigt auf BEIDEN Seiten (eigene und Gast-Sicht), Quad (Gast, gleiche Eingabe) stürzt nie',
               gestuerzt and lh['purzel'][0] >= 1 and lg['purzel'][0] >= 1 and lh['purzel'][1] == 0 and lg['purzel'][1] == 0, [lh['purzel'], lg['purzel'], 'Fort ' + str(lh['fort']), 'fps ' + str(lh['fps'])])
        pruefe('D Unfall-% kommt an: nach dem Sturz ist beim Host Motorrad oder Fahrer unter 100 % (Server → Client), bei beiden Seiten gleich', lh['un'][0] != [100, 100] and lh['un'][0] == lg['un'][0], [lh['un'], lg['un']])
        host.screenshot(path=os.path.join(out, '05_host_nach_sturz.png')); gast.screenshot(path=os.path.join(out, '06_gast_sicht.png'))
        # Phase 2: Autopilot; Tricks per Taste; Reset (R) wenn jemand steht (Anlauf-Bremse wie offline)
        for pg in (host, gast): pg.evaluate(AUTOPILOT, 'an')
        host.keyboard.down('ShiftRight'); gast.keyboard.down('ShiftRight')
        steht = {'h': 0, 'g': 0}
        punkte_ok = False; l1 = l2 = None
        for i in range(150):
            host.wait_for_timeout(1000)
            l1, l2 = host.evaluate(LAGE), gast.evaluate(LAGE)
            if not l1 or not l2: continue
            for k, pg, l in (('h', host, l1), ('g', gast, l2)):
                steht[k] = steht[k] + 1 if abs(l['v']) < 0.3 else 0
                if steht[k] >= 4:
                    pg.keyboard.press('KeyR'); steht[k] = 0
            if (l1['punkte'] and (l1['punkte'][0] > 0 or l1['punkte'][1] > 0)) and l1['punkte'] == l2['punkte']:
                punkte_ok = True; break
        host.keyboard.up('ShiftRight'); gast.keyboard.up('ShiftRight')
        pruefe('D Stuntpunkte kommen bei BEIDEN Clients an und sind gleich (Feuerring/Drehung …) – beide Spieler fahren mit Autopilot + Trick-Taste', punkte_ok, [l1 and l1['punkte'], l2 and l2['punkte'], 'Fort ' + str(l1 and l1['fort'])])
        host.screenshot(path=os.path.join(out, '07_host_rennen.png')); gast.screenshot(path=os.path.join(out, '08_gast_rennen.png'))
        hud = host.evaluate("(() => { const e = document.querySelector('.moto-stunt'); const z = document.querySelector('.moto-zustand'); return { stunt: e ? e.textContent : null, zustand: z ? z.textContent : null }; })()")
        pruefe('D HUD zeigt Stuntpunkte (⭐) und Motorrad-/Fahrer-% des eigenen Fahrers', hud['stunt'] and '⭐' in hud['stunt'] and hud['zustand'] and '%' in hud['zustand'], hud)

        # ============================================================ E) Helfer-Fahrzeuge + Station im echten Browser (künstlicher Server-Zustand)
        EINSPIELEN = """(art) => { const s = Rennspiel.spiel, o = s.online, M = Rennspiel.Moto.online, du = o.du, f = s.fahrzeuge[du];
          if (!s._zEmpf) { s._zEmpf = o.zustandEmpfangen; }
          o.zustandEmpfangen = () => {};              // der echte Server-Zustand ruht, solange wir einen künstlichen zeigen
          const n = s.fahrzeuge.length, mo = []; for (let i = 0; i < n; i++) mo.push([0, 0, 0, 0, 100, 100, 0, 0, 0, 0, 0, 0, 0]);
          const sN = f.nah ? f.nah.s : 100, qN = f.nah ? f.nah.seitenabstand : 0;
          if (art === 'abschlepp' || art === 'kranken') {
            mo[du] = [1, 0, 0, 0, art === 'abschlepp' ? 40 : 100, art === 'kranken' ? 40 : 100, 8, 0, 0, 0, 0, 0, [art === 'abschlepp' ? 0 : 1, 1, 3.5, sN, qN, qN >= 0 ? qN - 3 : qN + 3, qN >= 0 ? -1 : 1, 4, 0, 0]];
          } else if (art === 'werkstatt') { mo[du] = [0, 0, 0, 0, 50, 100, 2 | 4, 0, 0, 0, 0, 0, 0]; }
          M.zustand(o, { mo, ich: { mu: [mo[du][4], mo[du][5], art === 'aus' ? 0 : 1] } });
          return true; }"""
        ZUR = """() => { const o = Rennspiel.spiel.online; if (Rennspiel.spiel._zEmpf) { o.zustandEmpfangen = Rennspiel.spiel._zEmpf; Rennspiel.spiel._zEmpf = null; } return true; }"""
        PRUEF = """() => { const s = Rennspiel.spiel, o = s.online, u = s.unfall.fz[o.du], sz = u.szene;
          return { szene: sz ? { art: sz.art, phase: sz.phase, helfer: !!(sz.helfer && sz.helfer.mesh), imBild: !!(sz.helfer && sz.helfer.mesh && sz.helfer.mesh.parent), plan: !!sz.plan } : null,
            halt: u.halt ? u.halt.art : null, mitte: (document.querySelector('.moto-mitte') || {}).textContent || '', z: [Math.round(u.zustand), Math.round(u.gesundheit)] }; }"""
        for pg in (host, gast): pg.evaluate(AUTOPILOT, 'aus')
        host.evaluate(EINSPIELEN, 'abschlepp'); host.wait_for_timeout(1500)
        pa = host.evaluate(PRUEF)
        host.screenshot(path=os.path.join(out, '09_szene_abschlepp.png'))
        pruefe('E Abschleppwagen vor Ort (künstlicher Server-Zustand): Szene gespiegelt, Helfer-Fahrzeug im Bild gebaut, Text „Mechaniker“ mitten im Bild, Motorrad 40 %',
               pa['szene'] and pa['szene']['art'] == 'abschlepp' and pa['szene']['phase'] == 'lauf' and pa['szene']['helfer'] and pa['szene']['imBild'] and 'Mechaniker' in pa['mitte'] and pa['z'][0] == 40, pa)
        host.evaluate(EINSPIELEN, 'kranken'); host.wait_for_timeout(1500)
        pk = host.evaluate(PRUEF)
        host.screenshot(path=os.path.join(out, '10_szene_kranken.png'))
        pruefe('E Krankenwagen vor Ort: Szene wechselt auf Krankenwagen (Abschleppwagen weg), Helfer gebaut, Text „Sanitäter“, Fahrer 40 %',
               pk['szene'] and pk['szene']['art'] == 'krankenwagen' and pk['szene']['helfer'] and 'Sanitäter' in pk['mitte'] and pk['z'][1] == 40, pk)
        host.evaluate(EINSPIELEN, 'werkstatt'); host.wait_for_timeout(1200)
        pw = host.evaluate(PRUEF)
        pruefe('E Station (Halt Werkstatt, steht): Szene weg, Halt „werkstatt“, Text „Mechaniker schraubt“', pw['szene'] is None and pw['halt'] == 'werkstatt' and 'Mechaniker' in pw['mitte'], pw)
        host.evaluate(EINSPIELEN, 'aus'); host.wait_for_timeout(800)
        pn = host.evaluate(PRUEF)
        pruefe('E danach alles weg (keine Szene, kein Halt, Fahrer wieder 100 %)', pn['szene'] is None and pn['halt'] is None and pn['z'] == [100, 100], pn)
        host.evaluate(ZUR)

        # ============================================================ F) Ergebnis + Portal-Bestenliste
        gemeldet = []
        def abfangen(route, request):
            try: gemeldet.append(json.loads(request.post_data or '{}'))
            except Exception: gemeldet.append({'roh': request.post_data})
            route.fulfill(status=200, content_type='application/json', body='{"platz":1,"liste":[]}')
        host.route('**/api/bestenliste', abfangen)
        ERG = """() => { const o = Rennspiel.spiel.online, du = o.du, n = Rennspiel.spiel.fahrzeuge.length;
          const zeilen = Rennspiel.spiel.rennen.teilnehmer.map((t, i) => ({ platz: i + 1, nr: t.nr, name: t.name, mensch: !!t.istSpieler, weg: false, autoId: Rennspiel.spiel.fahrzeuge[i].auto.id,
            zeit: i === 0 ? 100.5 : null, beste: i === 0 ? 100.5 : null, runden: 1, stunt: i === du ? 1250 : i === 0 ? 300 : 0 }));
          o.ergebnisEmpfangen({ t: 'ergebnis', runden: 1, zeilen, stuntrennen: true }); return zeilen.length; }"""
        n = host.evaluate(ERG); host.wait_for_timeout(1500)
        tab = host.evaluate("""(() => { const e = document.querySelector('.ergebnis-karte'); return e ? { kopf: Array.from(e.querySelectorAll('thead th')).map(x => x.textContent), zeilen: e.querySelectorAll('tbody tr').length, text: e.textContent } : null; })()""")
        host.screenshot(path=os.path.join(out, '11_ergebnis.png'))
        pruefe('F Ergebnistafel (Stuntrennen): Spalten Rang/Name/Motorrad/Platzpunkte/Stunt/Gesamt, Zeile je Teilnehmer, Text „Motorrad“ statt „Auto“', tab and 'Gesamt' in tab['kopf'] and any('Stunt' in k for k in tab['kopf']) and tab['zeilen'] == n and 'Auto' not in ' '.join(tab['kopf']), tab and tab['kopf'])
        pruefe('F Meldung an die Portal-Bestenliste: genau ein POST /api/bestenliste mit {spiel: motorrad, modus: stuntrennen-online, name, punkte: 1250}', len(gemeldet) == 1 and gemeldet[0].get('spiel') == 'motorrad' and gemeldet[0].get('modus') == 'stuntrennen-online'
               and gemeldet[0].get('punkte') == 1250 and isinstance(gemeldet[0].get('name'), str) and set(gemeldet[0].keys()) == {'spiel', 'modus', 'name', 'punkte'}, gemeldet)

        # Aufräumen der Spiel-Seiten
        for pg in (host, gast): pg.context.close()

        # ============================================================ G) Motorrad-Seite NICHT vom Spielserver (Portal-Stil)
        init = "window.MOTORRAD_SERVER = '127.0.0.1:%d';" % port
        ph = seite('PortalHost', init)
        laden(ph, 'http://127.0.0.1:%d/Motorrad.html' % portal_port)
        ph.keyboard.press('KeyO'); ph.wait_for_timeout(400); ph.keyboard.press('Enter'); lobby_warten(ph)
        code_p = ph.evaluate('Rennspiel.spiel.menue.onlineUi.lobby.code')
        link_p = ph.evaluate("document.querySelector('.on-link').textContent")
        pruefe('G Seite aus dem „Portal“ (anderer Port, window.MOTORRAD_SERVER): Raum erstellen klappt über den Spielserver, Einladungslink zeigt auf die Seite im Portal', bool(code_p) and link_p == 'http://127.0.0.1:%d/Motorrad.html?raum=%s' % (portal_port, code_p), link_p)
        pg2 = seite('PortalGast', init)
        laden(pg2, 'http://127.0.0.1:%d/Motorrad.html?raum=%s' % (portal_port, code_p))
        pg2.wait_for_function("Rennspiel.spiel.menue.onlineUi && Rennspiel.spiel.menue.onlineUi.ansicht === 'code'", timeout=60000, polling=200)
        pg2.keyboard.press('Enter'); lobby_warten(pg2)
        ph.wait_for_function("Rennspiel.spiel.menue.onlineUi.lobby.spieler.length === 2", timeout=10000, polling=200)
        pruefe('G Gast aus dem „Portal“ tritt dem Raum bei (2 Spieler)', True)
        ph.screenshot(path=os.path.join(out, '12_portal_lobby.png'))
        for q in (ph, pg2): q.context.close()      # bei 2 Kernen: Seiten sofort schließen
        # ohne MOTORRAD_SERVER: Seite vom statischen Server ohne /ws → freundliche Meldung statt Absturz
        pn = seite('PortalOhne')
        laden(pn, 'http://127.0.0.1:%d/Motorrad.html' % portal_port)
        pn.keyboard.press('KeyO'); pn.wait_for_timeout(400); pn.keyboard.press('Enter'); pn.wait_for_timeout(2500)
        hn = pn.evaluate("({ ansicht: Rennspiel.spiel.menue.onlineUi.ansicht, hinweis: Rennspiel.spiel.menue.onlineUi.hinweis })")
        pruefe('G ohne Server-Adresse (Seite vom statischen Server): „Keine Verbindung zum Server“, kein Absturz, Spiel bleibt bedienbar', hn['ansicht'] == 'start' and 'Verbindung' in hn['hinweis'], hn)
        pn.context.close()

        # ============================================================ H) offline unverändert
        off = seite('Offline')
        laden(off, url + 'Motorrad.html')
        off.click('[data-a="modus:zwei"]'); off.wait_for_timeout(300)
        for _ in range(8):                                          # Schritte durchklicken bis „LOS GEHT'S“
            if off.query_selector('[data-a="start"]'): break
            off.click('[data-a="weiter"]'); off.wait_for_timeout(300)
        off.click('[data-a="start"]')
        try:
            off.wait_for_function("Rennspiel.spiel.zustand === 'rennen' || Rennspiel.spiel.zustand === 'countdown'", timeout=40000, polling=250)
            off.wait_for_timeout(4000)
            zo = off.evaluate("({ z: Rennspiel.spiel.zustand, huds: (Rennspiel.spiel.huds || Rennspiel.spiel.hud || []).length || (Rennspiel.spiel.fahrzeuge.filter(f => f.istSpieler).length), online: !!Rennspiel.spiel.online, stunt: !!Rennspiel.spiel.stunt, fz: Rennspiel.spiel.fahrzeuge.filter(f => f.istSpieler).length })")
            pruefe('H Zweispieler offline (Split-Screen): startet wie vorher, 2 HUDs, 2 Spieler-Motorräder, kein Online-Zustand', zo['huds'] == 2 and zo['fz'] == 2 and not zo['online'], zo)
            off.screenshot(path=os.path.join(out, '13_offline_zwei.png'))
        except Exception as ex:
            pruefe('H Zweispieler offline startet', False, str(ex)[:200])
        off.context.close()
        ar = seite('Autorennen')
        laden(ar, url + 'Autorennen.html')
        k = ar.evaluate("(() => { const k = document.querySelector('[data-a=\"online\"]'); return k ? { aus: k.classList.contains('aus'), text: k.textContent } : null; })()")
        pruefe('H Autorennen.html (Server mit Motorrad-Schalter): lädt fehlerfrei, Online-Karte wie vorher („übers Internet“), kein Motorrad-Modus', k and not k['aus'] and 'übers Internet' in k['text'] and ar.evaluate('window.MOTORRAD !== true && !Rennspiel.Moto'), k)
        ar.context.close()
        browser.close()

try:
    main()
except Exception as ex:
    import traceback; traceback.print_exc()
    pruefe('Test läuft ohne Ausnahme durch', False, str(ex)[:300])
finally:
    portal.shutdown()
    server.terminate()
    try: server.wait(timeout=5)
    except Exception: server.kill()

pruefe('Keine JS-Fehler in allen Seiten (pageerror / console.error)', not fehler, fehler[:5])
n_ok, n_fehl = sum(ergebnisse), len(ergebnisse) - sum(ergebnisse)
print('\n%d OK, %d FEHL  (%.0f s)' % (n_ok, n_fehl, time.time() - START))
print('ALLE MOTORRAD-BROWSER-TESTS OK' if not n_fehl else 'FEHLER')
sys.exit(1 if n_fehl else 0)
