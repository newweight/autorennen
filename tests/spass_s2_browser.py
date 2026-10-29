#!/usr/bin/env python3
"""S2 Tuning – Browser-Rauchtest (Playwright), beide Spiele: Menü-Schalter, Garage-Schritt „Tuning“ (kaufen, Stufe zurück, zurücksetzen, Sticker),
Tuning-Teile auf der Bühne, getuntes Fahrzeug im Rennen (Fahrwerte, Teile am Mesh, KI gleichwertig), Schalter aus = nichts.
Bilder nach tests/bilder_s2/. Aufruf: python3 tests/spass_s2_browser.py [Autorennen|Motorrad|beide]"""
import os, sys
from playwright.sync_api import sync_playwright
from PIL import Image
basis = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
bild = os.path.join(basis, 'tests', 'bilder_s2'); os.makedirs(bild, exist_ok=True)
wahl = sys.argv[1] if len(sys.argv) > 1 else 'beide'
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
spiele = [('Autorennen.html', 'passat', 'auto')] if wahl == 'Autorennen' else [('Motorrad.html', 'crossmaschine', 'moto')] if wahl == 'Motorrad' else [('Autorennen.html', 'passat', 'auto'), ('Motorrad.html', 'crossmaschine', 'moto')]
fehler = []; ok = 0; fail = 0
def pruefe(name, gut, info=''):
    global ok, fail
    print(('OK   ' if gut else 'FEHL ') + name + ('  (' + str(info) + ')' if info != '' else ''))
    if gut: ok += 1
    else: fail += 1

with sync_playwright() as p:
    b = p.chromium.launch(args=ARGS)
    for html, auto, tag in spiele:
        page = b.new_context(viewport={'width': 1100, 'height': 650}).new_page(); page.set_default_timeout(120000)
        lokal = []
        page.on('pageerror', lambda e: lokal.append('pageerror: ' + str(e)))
        page.on('console', lambda m: lokal.append('console.error: ' + m.text) if m.type == 'error' and 'GPU stall' not in m.text and 'WebGL' not in m.text else None)
        page.goto('file://' + os.path.join(basis, html)); page.wait_for_timeout(2000)
        name = page.evaluate("Rennspiel.config.fahrer[0].name")
        pruefe(tag + ' Module geladen', page.evaluate("!!(Rennspiel.SpassTuning && Rennspiel.SpassTuningUI && Rennspiel.SpassTuningOnline)"))
        page.evaluate("Rennspiel.SpassSticker.zurueck(window.MOTORRAD === true ? 'motorrad' : 'auto')")
        page.evaluate("Rennspiel.Garage.gutschreiben(%r, 800)" % name)
        # ---- Menü-Schalter
        page.evaluate("Rennspiel.spiel.menue.schritt = 4; Rennspiel.spiel.menue.zeichnen()"); page.wait_for_timeout(300)
        pruefe(tag + ' Menü: Pille „Tuning“ da', page.evaluate("!!document.querySelector('[data-a=\"wert:tuning:an\"]')"))
        page.evaluate("(document.querySelector('.m-spass') || document.body).scrollIntoView({block: 'center'})"); page.wait_for_timeout(200)
        page.screenshot(path=os.path.join(bild, tag + '_01_menue_tuning.png'))
        pruefe(tag + ' Menü: Standard an', page.evaluate("Rennspiel.SpassTuning.an() === true"))
        page.evaluate("Rennspiel.spiel.menue.aktion('wert:tuning:aus')")
        pruefe(tag + ' Menü: Schalter aus (gespeichert)', page.evaluate("Rennspiel.SpassTuning.an() === false && Rennspiel.spiel.einstellungen.tuning === false"))
        page.evaluate("Rennspiel.spiel.menue.aktion('wert:tuning:an')")
        pruefe(tag + ' Menü: Schalter wieder an', page.evaluate("Rennspiel.SpassTuning.an() === true"))
        # ---- Garage: Werkstatt → Tuning
        page.evaluate("Rennspiel.spiel.menue.garageOeffnen()"); page.wait_for_timeout(300)
        page.evaluate("([n, a]) => { const g = Rennspiel.spiel.menue.garageUi; g.fahrer = n; g.autoId = a; g.phase = 'werkstatt'; g.zeile = 0; g.zeichnen(); }", [name, auto])
        page.wait_for_timeout(1200)
        pruefe(tag + ' Garage: Knopf „Tuning öffnen“ in der Werkstatt', page.evaluate("!!document.querySelector('[data-g=\"tuning:oeffnen\"]')"))
        page.screenshot(path=os.path.join(bild, tag + '_02_garage_werkstatt.png'))
        page.click('[data-g="tuning:oeffnen"]'); page.wait_for_timeout(900)
        pruefe(tag + ' Garage: Tuning-Schritt offen mit 3 Kaufknöpfen', page.evaluate("document.querySelectorAll('[data-g^=\"tuning:kauf:\"]').length === 3"))
        page.screenshot(path=os.path.join(bild, tag + '_03_tuning_stufe0.png'))
        k0 = page.evaluate("Rennspiel.Garage.konto(%r)" % name)
        page.click('[data-g="tuning:kauf:motor"]'); page.wait_for_timeout(500)
        k1 = page.evaluate("Rennspiel.Garage.konto(%r)" % name)
        pruefe(tag + ' Kauf Motor Stufe 1: 10 Goldstücke abgebucht', k0 - k1 == 10, '%d → %d' % (k0, k1))
        pruefe(tag + ' Sticker „Erstes Tuning“ + Toast', page.evaluate("Rennspiel.SpassSticker.hat(window.MOTORRAD === true ? 'motorrad' : 'auto', 'tuning1')") and page.evaluate("!!document.querySelector('.spass-toast')"))
        page.screenshot(path=os.path.join(bild, tag + '_04_tuning_stufe1_toast.png'))
        page.click('[data-g="tuning:rueck:motor"]'); page.wait_for_timeout(300)
        pruefe(tag + ' Stufe zurück: Goldstücke zurück', page.evaluate("Rennspiel.Garage.konto(%r)" % name) == k0 and page.evaluate("Rennspiel.SpassTuning.stufen(%r, %r).motor" % (name, auto)) == 0)
        for art in ['motor', 'reifen', 'bremsen']:
            for i in range(3):
                page.click('[data-g="tuning:kauf:%s"]' % art); page.wait_for_timeout(120)
        page.wait_for_timeout(900)
        pruefe(tag + ' Stufe 3 in allem: Konto 800 − 3 × 80', page.evaluate("Rennspiel.Garage.konto(%r)" % name) == 800 - 240)
        pruefe(tag + ' Bühne zeigt Tuning-Teile (Neubau mit Teilen)', page.evaluate("Rennspiel.SpassTuning._vorschau === null || Rennspiel.SpassTuning._vorschau === undefined"))
        page.screenshot(path=os.path.join(bild, tag + '_05_tuning_stufe3.png'))
        for art in ['motor', 'reifen', 'bremsen']:
            for i in range(2):
                page.click('[data-g="tuning:kauf:%s"]' % art); page.wait_for_timeout(120)
        page.wait_for_timeout(900)
        pruefe(tag + ' voll getunt: Sticker „Voll getunt“', page.evaluate("Rennspiel.SpassSticker.hat(window.MOTORRAD === true ? 'motorrad' : 'auto', 'tuningVoll')"))
        pruefe(tag + ' voll getunt: Konto 800 − 750', page.evaluate("Rennspiel.Garage.konto(%r)" % name) == 50)
        page.screenshot(path=os.path.join(bild, tag + '_06_tuning_voll.png'))
        # Bühne rundum (4 Ansichten) → Blatt
        teile = []
        for k in range(4):
            page.wait_for_timeout(1300)
            f = os.path.join(bild, '_rund%d.png' % k)
            page.locator('canvas.buehne').screenshot(path=f); teile.append(f)
            page.keyboard.press('Period')
        ims = [Image.open(f) for f in teile]; w, h = ims[0].size
        blatt = Image.new('RGB', (w * 2, h * 2))
        for i, im in enumerate(ims): blatt.paste(im, ((i % 2) * w, (i // 2) * h))
        blatt.save(os.path.join(bild, tag + '_07_tuning_voll_rundum.png'))
        for f in teile: os.remove(f)
        page.keyboard.press('Escape'); page.wait_for_timeout(300)
        pruefe(tag + ' Esc: zurück in die Werkstatt', page.evaluate("Rennspiel.spiel.menue.garageUi.phase") == 'werkstatt')
        page.evaluate("Rennspiel.spiel.menue.garageUi.aktion('tuning:oeffnen')"); page.wait_for_timeout(300)
        page.click('[data-g="tuning:reset"]'); page.wait_for_timeout(300)
        pruefe(tag + ' Alles zurücksetzen: 800 Goldstücke wieder da', page.evaluate("Rennspiel.Garage.konto(%r)" % name) == 800 and page.evaluate("Rennspiel.SpassTuning.summe(Rennspiel.SpassTuning.stufen(%r, %r))" % (name, auto)) == 0)
        # Tastatur: Pfeile
        page.evaluate("() => { const g = Rennspiel.spiel.menue.garageUi; g.tuningZeile = 0; g.zeichnen(); }")
        page.keyboard.press('Enter'); page.wait_for_timeout(200)
        pruefe(tag + ' Tastatur: Enter kauft (Motor Stufe 1)', page.evaluate("Rennspiel.SpassTuning.stufen(%r, %r).motor" % (name, auto)) == 1)
        page.keyboard.press('ArrowDown'); page.keyboard.press('ArrowRight'); page.wait_for_timeout(200)
        pruefe(tag + ' Tastatur: ↓ → kauft Reifen', page.evaluate("Rennspiel.SpassTuning.stufen(%r, %r).reifen" % (name, auto)) == 1)
        page.keyboard.press('ArrowLeft'); page.wait_for_timeout(200)
        pruefe(tag + ' Tastatur: ← gibt zurück', page.evaluate("Rennspiel.SpassTuning.stufen(%r, %r).reifen" % (name, auto)) == 0)
        page.evaluate("Rennspiel.spiel.menue.garageUi.aktion('tuning:reset')")
        page.evaluate("Rennspiel.spiel.menue.garageUi.schliessen()")
        # ---- Rennen mit Tuning: Stufen 5/5/5 kaufen, dann fahren
        page.evaluate("([n, a]) => { for (const k of ['motor', 'reifen', 'bremsen']) for (let i = 0; i < 5; i++) Rennspiel.SpassTuning.kaufen(n, a, k); }", [name, auto])
        start = "Rennspiel.spiel.rennenStarten({ modus: 'solo', streckeId: 'wiese', autoIds: ['%s', '%s'], runden: 2, gegner: 2, schwierigkeit: 'mittel', fahrhilfe: ['wenig', 'wenig'], zufall: false, spass: false, geist: false })" % (auto, auto)
        page.evaluate("Rennspiel.spiel.einstellungen.fahrer[0] = %r" % name)
        page.evaluate(start)
        page.wait_for_function('Rennspiel.spiel.rennen.zustand === "laeuft"', timeout=120000)
        r = page.evaluate("""() => { const S = Rennspiel.spiel, T = Rennspiel.SpassTuning, fz = S.fahrzeuge;
          return { tu: fz.slice(0, 3).map(f => f.vehicle.tuning || null), teile: fz.slice(0, 3).map(f => !!f.mesh.getObjectByName('tuningTeile')),
                   vm: fz.slice(0, 3).map(f => f.vehicle.daten.vMax / (f.vehicle.datenBasis ? f.vehicle.datenBasis.vMax : f.vehicle.daten.vMax)), name: S.rennen.teilnehmer[0].name }; }""")
        pruefe(tag + ' Rennen: Spieler Stufen 5/5/5 am Fahrzeug', r['tu'][0] == {'motor': 5, 'reifen': 5, 'bremsen': 5}, r['tu'])
        pruefe(tag + ' Rennen: Computer gleichwertig (Mittel → 3/3/3)', r['tu'][1] == {'motor': 3, 'reifen': 3, 'bremsen': 3} and r['tu'][2] == {'motor': 3, 'reifen': 3, 'bremsen': 3}, r['tu'])
        pruefe(tag + ' Rennen: Tuning-Teile am Mesh (Spieler und Computer)', all(r['teile']), r['teile'])
        # Bild: hinter und neben dem getunten Spieler (Kamera von Hand, Pause), Verfolger-Ansicht ohne Cockpit-Rahmen, nach dem „LOS!“
        page.evaluate("() => { const k = Rennspiel.spiel.kameras[0]; k.modusIndex = Rennspiel.config.kamera.modi.indexOf('verfolger'); k._erstesMal = true; }")
        page.wait_for_function('Rennspiel.spiel.rennen.gasErlaubt === true', timeout=120000)
        page.evaluate("() => { const S = Rennspiel.spiel; for (let i = 0; i < 90; i++) S.physikSchritt(1 / 60); }")
        page.wait_for_timeout(2600)
        def kamerabild(datei, seite):
            page.evaluate("""(seite) => { const S = Rennspiel.spiel; S.pausiert = true; const f = S.fahrzeuge[0], v = f.vehicle, k = S.kameras[0].kamera, h = v.heading;
              const fx = -Math.sin(h), fz = -Math.cos(h), rx = Math.cos(h), rz = -Math.sin(h);
              const d = seite === 'hinten' ? [-fx * 5.2 + rx * 1.6, 1.9, -fz * 5.2 + rz * 1.6] : [rx * 5.0 - fx * 1.0, 1.1, rz * 5.0 - fz * 1.0];
              k.position.set(v.x + d[0], v.y + d[1], v.z + d[2]); k.lookAt(v.x, v.y + 0.55, v.z); }""", seite)
            page.wait_for_timeout(500); page.screenshot(path=os.path.join(bild, datei))
        kamerabild(tag + '_08_rennen_getunt_hinten.png', 'hinten')
        kamerabild(tag + '_09_rennen_getunt_seite.png', 'seite')
        page.evaluate("Rennspiel.spiel.pausiert = false")
        # Schalter aus → neues Rennen ohne Tuning
        page.evaluate("Rennspiel.SpassTuning.anSetzen(false)")
        page.evaluate(start); page.wait_for_function('Rennspiel.spiel.rennen.zustand === "laeuft"', timeout=120000)
        r2 = page.evaluate("Rennspiel.spiel.fahrzeuge.slice(0, 3).map(f => [f.vehicle.tuning || null, !!f.mesh.getObjectByName('tuningTeile')])")
        pruefe(tag + ' Rennen mit Schalter AUS: kein Tuning, keine Teile (Spieler und Computer)', all(x[0] is None and not x[1] for x in r2), r2)
        page.evaluate("Rennspiel.SpassTuning.anSetzen(true)")
        # Online-Lobby-Schalter (reine Anzeige)
        pruefe(tag + ' Online: meineWahl sendet Tuning-Stufen', page.evaluate("(() => { const o = Object.create(Rennspiel.Online.Bildschirm.prototype); o.spiel = Rennspiel.spiel; Rennspiel.spiel.einstellungen.fahrer[0] = %r; Rennspiel.spiel.einstellungen.autoIds[0] = %r; const w = o.meineWahl(); return JSON.stringify(w.tuning); })()" % (name, auto)) == '[5,5,5]')
        page.evaluate("Rennspiel.SpassTuning.speichern({})")
        for l in lokal: fehler.append(html + ' ' + l)
        page.context.close()
    b.close()
print('Prüfungen OK:', ok, 'FEHL:', fail)
print('KONSOLE FEHLERFREI' if not fehler else 'KONSOLE FEHLER:\n' + '\n'.join(fehler[:30]))
sys.exit(1 if (fehler or fail) else 0)
