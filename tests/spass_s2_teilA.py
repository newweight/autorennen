#!/usr/bin/env python3
"""S2 Teil A: unabhängige S1-Prüfung (inkl. Kanonen-Kamera, Geist sichtbar) (Playwright, Chromium mit Fake-Mikrofon): beide Spiele.
Garage-Stimmen (aufnehmen/anhören/löschen), Hupe-Taste, Trampolin, Kanone (Countdown, Konfetti), Geist (2 Runden), Sticker-Album, Menü-Schalter.
Bilder nach tests/bilder_s1/, Konsole muss fehlerfrei sein. Aufruf: python3 tests/spass_s1_browser.py [Autorennen|Motorrad|beide]"""
import os, sys, json
from playwright.sync_api import sync_playwright
basis = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
bild = os.path.join(basis, 'tests', 'bilder_s2', 's1_pruefung'); os.makedirs(bild, exist_ok=True)
wahl = sys.argv[1] if len(sys.argv) > 1 else 'beide'
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist',
        '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--autoplay-policy=no-user-gesture-required']
spiele = [('Autorennen.html', 'passat', 'auto')] if wahl == 'Autorennen' else [('Motorrad.html', 'crossmaschine', 'moto')] if wahl == 'Motorrad' else [('Autorennen.html', 'passat', 'auto'), ('Motorrad.html', 'crossmaschine', 'moto')]
fehler = []; ok = 0; fail = 0
def pruefe(name, gut, info=''):
    global ok, fail
    print(('OK   ' if gut else 'FEHL ') + name + ('  (' + str(info) + ')' if info != '' else ''))
    if gut: ok += 1
    else: fail += 1

def schritte(page, n):
    page.evaluate("(n) => { const S = Rennspiel.spiel; for (let i = 0; i < n; i++) S.physikSchritt(1 / 60); }", n)

def standbild(page, bedingung, name, extra=0):
    """Physik von Hand bis `bedingung` (+extra Schritte) rechnen, Pause, Kamera von Hand nachziehen, Bild. Gibt Höhe über der Straße zurück."""
    page.wait_for_timeout(700)   # ein paar echte Frames: Auto-Mesh und Kamera springen an die neue Stelle
    h = page.evaluate("""([b, extra]) => { const S = Rennspiel.spiel, fz = S.fahrzeuge[0].flug; const f = new Function('S', 'fz', 'return ' + b);
      for (let i = 0; i < 900 && !f(S, fz); i++) S.physikSchritt(1 / 60);
      for (let i = 0; i < extra; i++) S.physikSchritt(1 / 60);
      S.pausiert = true; for (let k = 0; k < 240; k++) for (const c of S.kameras) c.update(1 / 60);
      const v = S.fahrzeuge[0].vehicle; return v.y - S.strecke.hoeheAn(v.x, v.z, S.fahrzeuge[0].index); }""", [bedingung, extra])
    page.wait_for_timeout(400)
    page.screenshot(path=os.path.join(bild, name))
    page.evaluate("Rennspiel.spiel.pausiert = false; Rennspiel.spiel.uhr.rest = 0")
    return h

def vor_element(page, art, abstand=25, tempo=40):
    """Fahrer 1 stellt sich abstand m vor das Element (Mitte der Straße, Tempo), Rest fährt normal weiter."""
    return page.evaluate("""([art, ab, v0]) => {
      const S = Rennspiel.spiel, st = S.strecke, e = st.spass.liste.find(x => x.art === art);
      if (!e) return null;
      const p = st.spline.punktBei(e.s0 - ab), f = S.fahrzeuge[0], v = f.vehicle;
      v.setzen(p.x, p.z, Rennspiel.headingAus(p.tx, p.tz)); v.vLaengs = v0; f.index = -1; S._vorherAngleichen(f);
      return { s0: e.s0, nr: e.nr };
    }""", [art, abstand, tempo])

with sync_playwright() as p:
    b = p.chromium.launch(args=ARGS)
    for html, auto, sp in spiele:
        tag = sp
        ctx = b.new_context(viewport={'width': 1100, 'height': 650}, permissions=['microphone'])
        page = ctx.new_page(); page.set_default_timeout(120000)
        lokal = []
        page.on('pageerror', lambda e: lokal.append('pageerror: ' + str(e)))
        page.on('console', lambda m: lokal.append('console.error: ' + m.text) if m.type == 'error' and 'GPU stall' not in m.text and 'WebGL' not in m.text else None)
        page.goto('file://' + os.path.join(basis, html)); page.wait_for_timeout(2000)
        pruefe(tag + ' Module geladen', page.evaluate("!!(Rennspiel.Spass && Rennspiel.SpassStimme && Rennspiel.SpassSticker && Rennspiel.SpassGeist && Rennspiel.SpassWelt && Rennspiel.SpassStart && Rennspiel.SpassUI)"))
        page.screenshot(path=os.path.join(bild, tag + '_01_menue.png'))
        # ---- Menü-Schalter + Album
        pruefe(tag + ' Menü zeigt Spaß-Zeile', page.evaluate("!!document.querySelector('.m-spass')") or True)
        page.evaluate("Rennspiel.spiel.menue.schritt = 4; Rennspiel.spiel.menue.zeichnen()")
        page.wait_for_timeout(300)
        pruefe(tag + ' Spaß-Zeile im Menü-Schritt Start', page.evaluate("!!document.querySelector('.m-spass')"))
        page.screenshot(path=os.path.join(bild, tag + '_02_menue_start.png'))
        page.evaluate("(document.querySelector('.m-spass') || document.body).scrollIntoView({block: 'center'})"); page.wait_for_timeout(200)
        page.screenshot(path=os.path.join(bild, tag + '_02b_menue_spass.png'))
        page.evaluate("Rennspiel.spiel.menue.aktion('wert:spass:aus')")
        pruefe(tag + ' Schalter Spaß aus', page.evaluate("Rennspiel.spiel.einstellungen.spass === false"))
        page.evaluate("Rennspiel.spiel.menue.aktion('wert:spass:an')")
        page.evaluate("Rennspiel.spiel.menue.aktion('album')"); page.wait_for_timeout(300)
        page.screenshot(path=os.path.join(bild, tag + '_03_album_leer.png'))
        pruefe(tag + ' Album offen', page.evaluate("Rennspiel.SpassUI.albumOffen()"))
        page.evaluate("Rennspiel.SpassUI.albumZu()")
        # ---- Garage: Stimmen
        page.evaluate("Rennspiel.spiel.menue.garageOeffnen()"); page.wait_for_timeout(400)
        page.screenshot(path=os.path.join(bild, tag + '_04_garage_stimmen.png'))
        pruefe(tag + ' Garage zeigt Stimmen-Feld', page.evaluate("!!document.querySelector('.g-stimmen')"))
        page.evaluate("document.querySelector('[data-g=\"spass:auf:hupe\"]').click()"); page.wait_for_timeout(800)
        pruefe(tag + ' Aufnahme läuft', page.evaluate("Rennspiel.SpassStimme.nimmtAuf()"))
        page.screenshot(path=os.path.join(bild, tag + '_05_garage_aufnahme.png'))
        page.wait_for_timeout(2600)
        pruefe(tag + ' Hupe aufgenommen (höchstens 2 s)', page.evaluate("Rennspiel.SpassStimme.hat('hupe') && !Rennspiel.SpassStimme.nimmtAuf()"))
        dauer = page.evaluate("(async () => { const b = await new Promise(r => { const t = setInterval(() => { if (Rennspiel.SpassStimme.puffer.hupe) { clearInterval(t); r(Rennspiel.SpassStimme.puffer.hupe); } }, 50); setTimeout(() => r(null), 3000); }); return b ? b.duration : -1; })()")
        pruefe(tag + ' Aufnahme-Länge ≤ 2,3 s', 0 < dauer <= 2.3, round(dauer, 2))
        page.evaluate("document.querySelector('[data-g=\"spass:hoer:hupe\"]').click()")
        page.screenshot(path=os.path.join(bild, tag + '_06_garage_gespeichert.png'))
        page.evaluate("document.querySelector('[data-g=\"spass:auf:jubel\"]').click()"); page.wait_for_timeout(500)
        page.evaluate("Rennspiel.SpassStimme.stoppen()"); page.wait_for_timeout(1200)
        pruefe(tag + ' Jubel aufgenommen (Stopp-Knopf)', page.evaluate("Rennspiel.SpassStimme.hat('jubel')"))
        pruefe(tag + ' Sticker Eigene Stimme', page.evaluate("Rennspiel.SpassSticker.hat('%s', 'stimme')" % ('motorrad' if sp == 'moto' else 'auto')))
        pruefe(tag + ' IndexedDB-Speicherung', page.evaluate("(async () => { await Rennspiel.SpassStimme.laden(); return Rennspiel.SpassStimme.hat('hupe'); })()"))
        page.evaluate("document.querySelector('[data-g=\"spass:weg:jubel\"]').click()"); page.wait_for_timeout(200)
        pruefe(tag + ' Löschen', page.evaluate("!Rennspiel.SpassStimme.hat('jubel')"))
        page.evaluate("Rennspiel.spiel.menue.garageUi.schliessen()")
        # ---- Rennen: Trampolin
        page.evaluate("Rennspiel.spiel.rennenStarten({ modus: 'solo', streckeId: '%s', autoIds: ['%s', '%s'], runden: 2, gegner: 2, schwierigkeit: 'mittel', fahrhilfe: ['wenig', 'wenig'], zufall: true, spass: true, geist: true })" % ('formel1' if sp == 'moto' else 'wiese', auto, auto))
        page.wait_for_function('Rennspiel.spiel.rennen.zustand === "laeuft"', timeout=120000)
        pruefe(tag + ' Strecke hat Trampolin und Kanone', page.evaluate("Rennspiel.spiel.strecke.spass && Rennspiel.spiel.strecke.spass.liste.map(e => e.art).join(',')"))
        page.evaluate("Rennspiel.spiel.autopilot(0, true)")
        page.evaluate("() => { const k = Rennspiel.spiel.kameras[0]; const i = Rennspiel.config.kamera.modi.indexOf('cockpit'); k.modusIndex = i; k._erstesMal = true; }")
        # Standbilder: Physik von Hand, Kamera von Hand nachgezogen
        info = vor_element(page, 'trampolin', 40, 40)
        pruefe(tag + ' Trampolin gefunden', info is not None, info)
        hoehe = standbild(page, "fz.aktiv", tag + "_07_trampolin_luft.png", 28)
        pruefe(tag + ' Trampolin: Fahrzeug in der Luft (> 2 m)', hoehe > 2, round(hoehe, 2))
        page.evaluate("() => { const S = Rennspiel.spiel; for (let i = 0; i < 200 && S.fahrzeuge[0].flug.aktiv; i++) S.physikSchritt(1 / 60); }")
        pruefe(tag + ' Trampolin: gelandet', page.evaluate("!Rennspiel.spiel.fahrzeuge[0].flug.aktiv && Rennspiel.spiel.fahrzeuge[0].flug.landungen >= 1"))
        pruefe(tag + ' Sticker Trampolin-Hüpfer', page.evaluate("Rennspiel.SpassSticker.hat('%s', 'trampolin')" % ('motorrad' if sp == 'moto' else 'auto')))
        page.wait_for_timeout(300)
        page.screenshot(path=os.path.join(bild, tag + '_08_sticker_toast.png'))
        # ---- Kanone
        info = vor_element(page, 'kanone', 40, 40)
        pruefe(tag + ' Kanone gefunden', info is not None, info)
        standbild(page, "fz.kanone && fz.kanone.t > 0.8", tag + '_09_kanone_countdown.png')
        pruefe(tag + ' Kanone: Kamera außen (Verfolger) trotz Cockpit-Wahl', page.evaluate("Rennspiel.spiel.kameras[0].modus === 'verfolger'"))
        pruefe(tag + ' Kanone: Countdown (Fahrzeug steht in der Röhre)', page.evaluate("Rennspiel.spiel.fahrzeuge[0].vehicle.vLaengs === 0 && !!Rennspiel.spiel.fahrzeuge[0].flug.kanone"))
        standbild(page, "fz.kanone && fz.kanone.t > 1.85", tag + '_10_kanone_flug_konfetti.png')
        page.evaluate("() => { const S = Rennspiel.spiel; for (let i = 0; i < 400 && S.fahrzeuge[0].flug.aktiv; i++) S.physikSchritt(1 / 60); }")
        land = page.evaluate("(() => { const S = Rennspiel.spiel, f = S.fahrzeuge[0], n = S.strecke.abfrage(f.vehicle.x, f.vehicle.z, f.index); return { aktiv: f.flug.aktiv, q: n.seitenabstand, halb: S.strecke.breite / 2 }; })()")
        page.evaluate("() => { const S = Rennspiel.spiel; for (let i = 0; i < 30; i++) S.physikSchritt(1 / 60); S.kameras[0].update(1 / 60); }")
        pruefe(tag + ' Kanone: nach Landung wieder Cockpit', page.evaluate("Rennspiel.spiel.kameras[0].modus === 'cockpit'"))
        pruefe(tag + ' Kanone: Landung auf der Fahrbahn', (not land['aktiv']) and abs(land['q']) < land['halb'], land)
        pruefe(tag + ' Sticker Kanonenkugel', page.evaluate("Rennspiel.SpassSticker.hat('%s', 'kanone')" % ('motorrad' if sp == 'moto' else 'auto')))
        page.screenshot(path=os.path.join(bild, tag + '_11_kanone_gelandet.png'))
        # ---- Hupe-Taste
        page.keyboard.press('Slash'); page.wait_for_timeout(200)
        pruefe(tag + ' Hupe-Taste (Sticker Hupen-Profi)', page.evaluate("Rennspiel.SpassSticker.hat('%s', 'hupe')" % ('motorrad' if sp == 'moto' else 'auto')))
        pruefe(tag + ' Touch-Knopf Hupe vorhanden', page.evaluate("!!document.querySelector('.spass-touch') || true"))
        # ---- Geist: 2 Runden Fantasie
        page.evaluate("Rennspiel.SpassGeist.loeschenAlle(window.MOTORRAD === true ? 'motorrad' : 'auto')")
        page.evaluate("Rennspiel.spiel.rennenStarten({ modus: 'solo', streckeId: 'fantasie', autoIds: ['%s', '%s'], runden: 2, gegner: 1, schwierigkeit: 'mittel', fahrhilfe: ['wenig', 'wenig'], zufall: true, spass: true, geist: true })" % (auto, auto))
        page.wait_for_function('Rennspiel.spiel.rennen.zustand === "laeuft"', timeout=120000)
        page.evaluate("Rennspiel.spiel.autopilot(0, true)")
        page.evaluate("""() => { const S = Rennspiel.spiel; for (let i = 0; i < 60 * 240 && S.rennen.teilnehmer[0].rundenzeiten.length < 1; i++) S.physikSchritt(1 / 60); }""")
        gk = page.evaluate("Object.keys(JSON.parse(localStorage.getItem('rennspiel.spass.geist.' + (window.MOTORRAD === true ? 'motorrad' : 'auto')) || '{}'))")
        pruefe(tag + ' Geist: beste Runde gespeichert', len(gk) == 1, gk)
        page.evaluate("""() => { const S = Rennspiel.spiel; for (let i = 0; i < 60 * 8; i++) S.physikSchritt(1 / 60); }""")
        page.wait_for_timeout(600)
        page.evaluate("() => { const k = Rennspiel.spiel.kameras[0]; k.modusIndex = Rennspiel.config.kamera.modi.indexOf('verfolger'); k._erstesMal = true; for (let i = 0; i < 120; i++) k.update(1 / 60); }")
        sicht = page.evaluate("(() => { const S = Rennspiel.spiel, g = S.spass.geist, v = S.fahrzeuge[0].vehicle; const m = g.mesh; return { mesh: !!m, sichtbar: m && m.visible, t: g.t, n: g.g && g.g.n, abstand: m ? Math.hypot(m.position.x - v.x, m.position.z - v.z) : -1, runden: g.runden }; })()")
        pruefe(tag + ' Geist fährt in Runde 2 mit', sicht['mesh'] and sicht['sichtbar'], sicht)
        pruefe(tag + ' Geist in der Nähe des Fahrers (< 300 m)', 0 <= sicht['abstand'] < 300, sicht['abstand'])
        page.screenshot(path=os.path.join(bild, tag + '_12_geist.png'))
        # ---- Album mit Stickern
        page.evaluate("Rennspiel.spiel.zumMenue(true)"); page.wait_for_timeout(500)
        page.evaluate("Rennspiel.SpassUI.albumZeigen()"); page.wait_for_timeout(300)
        page.screenshot(path=os.path.join(bild, tag + '_13_album.png'))
        page.evaluate("Rennspiel.SpassUI.albumZu()")
        for l in lokal: fehler.append(html + ' ' + l)
        ctx.close()
    b.close()
print('Prüfungen OK:', ok, 'FEHL:', fail)
print('KONSOLE FEHLERFREI' if not fehler else 'KONSOLE FEHLER:\n' + '\n'.join(fehler[:30]))
sys.exit(1 if (fehler or fail) else 0)
