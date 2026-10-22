#!/usr/bin/env python3
"""Runde 6 (W3-G): Münzen + Garage im Browser (Playwright, headless Chromium, Software-Grafik).
a) Rennen Wiese (Autopilot): Münzen liegen (20–40, 1 Draw-Call), Spieler sammelt (HUD „🪙 n"), KI sammelt nebenbei,
   Preisgeld nach dem Rennen (Kontostand = gesammelt + Preisgeld), Bild der Münzreihe.
b) Garage per Taste G: Fahrer → Auto → Werkstatt; Farbe per Pfeil = Live-Vorschau auf der Bühne, Enter kauft (−20),
   Motor-Upgrade per Tastatur (−30), Reifen per Maus, Reparatur bei Schaden aus = „Nicht nötig", Esc zurück ins Menü.
c) Nächstes Rennen: Spielerauto im neuen Lack (Material-Farben + Pixel im Bild), KI unverändert; vMax × 1,04;
   Schalter „Upgrades zählen: aus" → vMax Standard, Lack bleibt.
d) Schaden-Rest: mit Schaden an Endprozent gespeichert → nächstes Rennen startet damit; Reparatur → 100 %.
e) Fahrer-Schritt zeigt „🪙 n"; keine JS-Fehler.
Bilder: tests/out/garage/*.png (mit Read ansehen).  Aufruf: python3 tests/garage_test.py"""
import sys, os, json
from playwright.sync_api import sync_playwright
from PIL import Image

basis = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
out = os.path.join(basis, 'tests', 'out', 'garage')
os.makedirs(out, exist_ok=True)
url = 'file://' + os.path.join(basis, 'Autorennen.html')
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
fehler, pruefungen = [], []

def pruefe(name, ok, info=''):
    pruefungen.append({'test': name, 'ok': bool(ok), 'info': info})
    print(('OK   ' if ok else 'FAIL ') + name + (' – ' + str(info) if info != '' else ''))

def pixel_anteil(datei, art, box=None):
    """Anteil der Pixel eines Farbtons ('pink' | 'gold') im Bild bzw. Ausschnitt (robust gegen Licht/Schatten)."""
    im = Image.open(datei).convert('RGB')
    if box: im = im.crop(box)
    w, h = im.size
    px = im.load()
    n = treffer = 0
    for y in range(h):
        for x in range(w):
            r, g, b = px[x, y]; n += 1
            if art == 'pink' and r > 140 and g < 0.6 * r and b > 0.5 * r and b < r: treffer += 1
            if art == 'gold' and r > 150 and 0.5 * r < g < 0.92 * r and b < 0.45 * r: treffer += 1
    return treffer / max(1, n)

PINK = 0xff5fb8
# Material-Prüfung: kommt der Lack (linear, wie THREE.Color) in den Vertex-Farben der Karosserie vor?
LACK_IM_MESH = """([nr, hex]) => { const f = Rennspiel.spiel.fahrzeuge[nr]; let k = null; f.mesh.traverse(o => { if (o.name === 'karosserie') k = o; });
  const c = new THREE.Color(hex), a = k.geometry.getAttribute('color'); let n = 0;
  for (let i = 0; i < a.count; i++) if (Math.abs(a.getX(i) - c.r) < 0.01 && Math.abs(a.getY(i) - c.g) < 0.01 && Math.abs(a.getZ(i) - c.b) < 0.01) n++;
  return { anteil: n / a.count, lack: f.mesh.userData.lackFarbe }; }"""
VMAX = """(nr) => { const s = Rennspiel.spiel, f = s.fahrzeuge[nr], b = new Rennspiel.Vehicle(f.auto.fahrwerte, { tempoKlasse: s.tempoKlasse });
  return { v: f.vehicle.daten.vMax, basis: b.daten.vMax, verh: f.vehicle.daten.vMax / b.daten.vMax, grip: f.vehicle.daten.grip / b.daten.grip,
           bremsen: f.vehicle.daten.bremsen / b.daten.bremsen }; }"""

with sync_playwright() as p:
    browser = p.chromium.launch(args=ARGS)
    page = browser.new_page(viewport={'width': 1280, 'height': 800})
    page.on('pageerror', lambda e: fehler.append(str(e)))
    page.on('console', lambda m: fehler.append('console.error: ' + m.text) if m.type == 'error' else None)
    page.goto(url)
    page.evaluate('localStorage.clear()')
    page.reload()
    page.wait_for_function('window.Rennspiel && Rennspiel.spiel', timeout=15000)
    page.wait_for_timeout(800)
    def snap(name):
        page.screenshot(path=os.path.join(out, name)); return os.path.join(out, name)
    taste = lambda t, n=1: [page.keyboard.press(t) or page.wait_for_timeout(80) for _ in range(n)]
    E = lambda: page.evaluate('Rennspiel.spiel.einstellungen')

    # ---------------------------------------------------------------- a) Rennen mit Münzen
    page.evaluate("""Rennspiel.spiel.rennenStarten({ modus: 'solo', streckeId: 'wiese', welt: '', variante: '', gegner: 1, runden: 1,
      fahrer: ['Jonas', 'Emmy'], autoIds: ['troc-cabrio', 'multivan'], schaden: false, polizei: false, tageszeit: 'tag',
      jahreszeit: 'sommer', wetter: 'klar', windStaerke: 0 })""")
    info = page.evaluate("""(() => { const s = Rennspiel.spiel, m = s.muenzen; let mesh = null; s.szene.traverse(o => { if (o.name === 'MuenzenMesh') mesh = o; });
      return { n: m ? m.anzahl : 0, instanzen: mesh ? mesh.count : 0, hud: document.querySelector('.hud-muenzen') ? document.querySelector('.hud-muenzen').textContent : null }; })()""")
    pruefe('Münzen liegen auf der Wiese (20–40, eine InstancedMesh)', 20 <= info['n'] <= 40 and info['instanzen'] == info['n'], info)
    pruefe('HUD zeigt „🪙 0" beim Start', info['hud'] and '🪙 0' in info['hud'], info['hud'])
    # P4 (16.10.): erst den Countdown abwarten – die große „3“ verdeckte genau die Münzreihe (Projektion x≈636–640, y≈298–324), siehe tests/out/p3/urteile.md S7
    page.wait_for_function('Rennspiel.spiel.rennen.zustand === "laeuft" && Rennspiel.spiel.rennen.zeit > 1.2', timeout=60000)   # auch „LOS!“ (hud.js:551, zeit < 1 s) ist dann weg
    # Bild: Spieler kurz vor der ersten Münzreihe (nach dem Countdown, direkt versetzt)
    page.evaluate("""(() => { const s = Rennspiel.spiel, m = s.muenzen, r = m.liste.find(k => k.reihe >= 0), sp = s.strecke.spline, p = sp.punktBei(r.s - 22);
      const v = s.fahrzeuge[0].vehicle; v.setzen(p.x + p.nx * r.q, p.z + p.nz * r.q, Rennspiel.headingAus(p.tx, p.tz)); v.y = s.strecke.hoeheAn(v.x, v.z);
      s._vorherAngleichen(s.fahrzeuge[0]); s.kameras[0]._erstesMal = true; })()""")
    page.wait_for_timeout(1500)
    bild_reihe = snap('01_muenzreihe.png')
    gelb = pixel_anteil(bild_reihe, 'gold', box=(300, 250, 980, 650))
    pruefe('Bild: goldene Münzen sichtbar (gelbe Pixel vor dem Auto)', gelb > 0.001, round(gelb, 4))
    # Spieler-Autopilot, Rennen zu Ende fahren (Spieler wurde versetzt → neu starten für saubere Wertung)
    page.evaluate("""Rennspiel.spiel.rennenStarten(); Rennspiel.spiel.autopilot(0, true)""")
    plus_gesehen = False
    for _ in range(40):
        page.evaluate('Rennspiel.spiel.schnellvorlauf(5)')
        if page.evaluate('Rennspiel.spiel.muenzen && Rennspiel.spiel.muenzen.anzahlVon(0) > 0'): plus_gesehen = True
        if page.evaluate('Rennspiel.spiel.zustand') != 'rennen': break
    page.wait_for_timeout(300)
    erg = page.evaluate("""(() => { const s = Rennspiel.spiel, z = s.ergebnis ? s.ergebnis.zeilen.find(x => x.istSpieler) : null;
      return { zustand: s.zustand, gesammelt: s.muenzen ? s.muenzen.anzahlVon(0) : -1, ki: s.muenzen ? s.muenzen.anzahlVon(1) : -1,
        uebrig: s.muenzen ? s.muenzen.uebrig : -1, platz: z && z.platz, preisgeld: z && z.preisgeld, konto: Rennspiel.Garage.konto('Jonas'),
        hud: document.querySelector('.hud-muenzen') ? document.querySelector('.hud-muenzen').textContent : '' }; })()""")
    print(json.dumps(erg, ensure_ascii=False))
    pruefe('Rennen beendet (Ergebnis)', erg['zustand'] == 'ergebnis', erg['zustand'])
    pruefe('Spieler (Autopilot) hat Münzen gesammelt', erg['gesammelt'] >= 1 and plus_gesehen, erg['gesammelt'])
    pruefe('KI sammelt nebenbei (zählt nicht fürs Konto)', erg['ki'] >= 0, erg['ki'])
    soll = {1: 30, 2: 20, 3: 15}.get(erg['platz'], 5)
    pruefe('Preisgeld passend zum Platz (1 = 30, 2 = 20 …)', erg['preisgeld'] == soll, [erg['platz'], erg['preisgeld']])
    pruefe('Kontostand = gesammelt + Preisgeld', erg['konto'] == erg['gesammelt'] + erg['preisgeld'], erg)
    pruefe('HUD zeigt gesammelt + Preisgeld', ('🪙 %d' % (erg['gesammelt'] + erg['preisgeld'])) in erg['hud'], erg['hud'])
    snap('02_ergebnis.png')

    # ---------------------------------------------------------------- b) Garage
    page.evaluate("Rennspiel.Garage.gutschreiben('Jonas', 200)")      # genug für die Käufe im Test
    konto0 = page.evaluate("Rennspiel.Garage.konto('Jonas')")
    page.evaluate('Rennspiel.spiel.zumMenue()'); page.wait_for_timeout(500)
    pruefe('Menü: Garage-Karte im Modus-Schritt', page.is_visible('[data-a="garage"]'))
    taste('KeyG'); page.wait_for_timeout(300)
    pruefe('Taste G öffnet die Garage, Menü versteckt', page.is_visible('#garage') and not page.is_visible('#menue'))
    pruefe('Garage Schritt 1: 12 Fahrerkarten mit Kontostand', page.evaluate("document.querySelectorAll('#garage .karte.fahrer').length") == 12
           and ('🪙 %d' % konto0) in page.inner_text('#garage [data-g="fahrer:Jonas"]'), page.inner_text('#garage [data-g="fahrer:Jonas"]'))
    snap('03_garage_fahrer.png')
    taste('Enter'); page.wait_for_timeout(400)
    pruefe('Garage Schritt 2: Autos ohne Polizei, Bühne', page.evaluate("document.querySelectorAll('#garage .karte.auto').length") == page.evaluate('Rennspiel.carCatalog.waehlbare().length')
           and page.query_selector('#garage [data-g="auto:polizei"]') is None and page.is_visible('#garage canvas.buehne'))
    taste('Enter'); page.wait_for_timeout(600)
    pruefe('Werkstatt für Jonas / T-Roc Cabrio', 'Cabrio' in page.inner_text('#garage .g-autoname') and page.evaluate("Rennspiel.AutoVorschau.autoId(0)") == 'troc-cabrio')
    lack0 = page.evaluate('Rennspiel.AutoVorschau.lack(0)')
    taste('ArrowRight', 4); page.wait_for_timeout(500)
    lack_vorschau = page.evaluate('Rennspiel.AutoVorschau.lack(0)')
    pruefe('Pfeil → Pink: Live-Vorschau auf der Bühne (noch nicht gekauft)', lack_vorschau == PINK and lack0 != PINK
           and page.evaluate("Rennspiel.Garage.lackFarbe('Jonas', 'troc-cabrio')") is None and page.evaluate("Rennspiel.Garage.konto('Jonas')") == konto0, [lack0, lack_vorschau])
    winkel0 = page.evaluate('Rennspiel.AutoVorschau.winkel(0)'); taste('Period'); page.wait_for_timeout(900)
    pruefe('Bühne dreht mit . (90°)', page.evaluate('Rennspiel.AutoVorschau.winkel(0)') - winkel0 < -25)
    taste('Enter'); page.wait_for_timeout(500)
    pruefe('Enter kauft Pink: −20, Lack gespeichert', page.evaluate("Rennspiel.Garage.lackFarbe('Jonas', 'troc-cabrio')") == PINK
           and page.evaluate("Rennspiel.Garage.konto('Jonas')") == konto0 - 20, page.inner_text('#garage .g-nachricht'))
    pruefe('Bühne zeigt gekauften Lack', page.evaluate('Rennspiel.AutoVorschau.lack(0)') == PINK)
    taste('ArrowDown', 2); taste('Enter'); page.wait_for_timeout(300)
    pruefe('Tastatur: Motor Stufe 1 (−30)', page.evaluate("Rennspiel.Garage.autoDaten('Jonas', 'troc-cabrio').motor") == 1
           and page.evaluate("Rennspiel.Garage.konto('Jonas')") == konto0 - 50)
    page.click('#garage [data-g="upgrade:reifen"]'); page.wait_for_timeout(300)
    pruefe('Maus: Reifen Stufe 1 (−30), Balken zeigt 1 von 3', page.evaluate("Rennspiel.Garage.autoDaten('Jonas', 'troc-cabrio').reifen") == 1
           and page.evaluate("Array.from(document.querySelectorAll('#garage .g-zeile')).filter(z => z.textContent.includes('Reifen'))[0].querySelectorAll('.g-balken i.voll').length") == 1)
    page.click('#garage [data-g="reparatur"]'); page.wait_for_timeout(300)
    pruefe('Reparatur bei Schaden aus: „Nicht nötig", kostet nichts', 'Nicht nötig' in page.inner_text('#garage .g-nachricht')
           and page.evaluate("Rennspiel.Garage.konto('Jonas')") == konto0 - 80, page.inner_text('#garage .g-nachricht'))
    page.mouse.move(5, 5); page.wait_for_timeout(700)
    lay = page.evaluate("""(() => { const m = document.querySelector('#garage .m-inhalt'), r = Array.from(document.querySelectorAll('#garage .g-zeile, #garage canvas.buehne')).map(e => e.getBoundingClientRect());
      return { scroll: m.scrollHeight <= m.clientHeight + 1, innen: r.every(a => a.left >= 0 && a.right <= innerWidth && a.bottom <= innerHeight) }; })()""")
    pruefe('Werkstatt passt ohne Scrollen (1280×800)', lay['scroll'] and lay['innen'], lay)
    bild_garage = snap('04_werkstatt.png')
    pink_buehne = pixel_anteil(bild_garage, 'pink', box=(40, 160, 600, 560))
    pruefe('Bild Werkstatt: Auto auf der Bühne pink', pink_buehne > 0.01, round(pink_buehne, 4))
    page.set_viewport_size({'width': 1440, 'height': 900}); page.wait_for_timeout(400)
    snap('04b_werkstatt_1440.png')
    page.set_viewport_size({'width': 1280, 'height': 800}); page.wait_for_timeout(300)
    taste('Escape'); page.wait_for_timeout(200)
    pruefe('Esc: zurück zur Autowahl', page.evaluate("document.querySelectorAll('#garage .karte.auto').length") > 0)
    lay2 = page.evaluate("""(() => { const m = document.querySelector('#garage .m-inhalt'), f = document.querySelector('#garage .m-fuss').getBoundingClientRect();
      const r = Array.from(document.querySelectorAll('#garage .karte.auto, #garage canvas.buehne')).map(e => e.getBoundingClientRect());
      return { scroll: m.scrollHeight <= m.clientHeight + 1, innen: r.every(a => a.left >= 0 && a.right <= innerWidth && a.top >= 0 && a.bottom <= f.top + 2) }; })()""")
    pruefe('Autowahl passt ohne Scrollen, nichts abgeschnitten', lay2['scroll'] and lay2['innen'], lay2)
    snap('05_garage_autos.png')
    taste('Escape'); taste('Escape'); page.wait_for_timeout(300)
    pruefe('Esc ×3: Menü wieder da, Garage zu', page.is_visible('#menue') and not page.is_visible('#garage'))
    # Fahrer-Schritt zeigt Münzen
    page.click('[data-a="modus:solo"]'); page.wait_for_timeout(150); taste('Enter'); page.wait_for_timeout(200)
    karte = page.inner_text('[data-a="fahrer:0:Jonas"]')
    pruefe('Fahrer-Schritt: Jonas-Karte zeigt „🪙 n"', ('🪙 %d' % page.evaluate("Rennspiel.Garage.konto('Jonas')")) in karte, karte)

    # ---------------------------------------------------------------- c) Nächstes Rennen: neuer Lack, Upgrade
    page.evaluate("""Rennspiel.spiel.rennenStarten({ modus: 'solo', streckeId: 'wiese', gegner: 1, runden: 1, fahrer: ['Jonas', 'Emmy'],
      autoIds: ['troc-cabrio', 'multivan'], upgradesZaehlen: true })""")
    m0 = page.evaluate(LACK_IM_MESH, [0, PINK]); m1 = page.evaluate(LACK_IM_MESH, [1, PINK])
    pruefe('Rennen: Spielerauto im Garage-Lack (Material-Farben pink)', m0['lack'] == PINK and m0['anteil'] > 0.2, m0)
    pruefe('Rennen: KI-Auto unverändert (kein Pink)', m1['lack'] != PINK and m1['anteil'] == 0, m1)
    std = page.evaluate("(() => { let k = null; Rennspiel.carBuilder.bauen(Rennspiel.carCatalog.finde('troc-cabrio')).traverse(o => { if (o.name === 'karosserie') k = o; }); return k.geometry.uuid; })()")
    pink_geo = page.evaluate("(() => { let k = null; Rennspiel.spiel.fahrzeuge[0].mesh.traverse(o => { if (o.name === 'karosserie') k = o; }); return k.geometry.uuid; })()")
    # P4 (16.10.): Standardfarbe aus dem Katalog lesen (T-Roc „Edition Blue“ = 0x4d6fe0, früher hart 0x1f7bff)
    katalog_farbe = page.evaluate("Rennspiel.carCatalog.finde('troc-cabrio').farbe")
    pruefe('Cache: Standard-Cabrio hat eigene Geometrie (unverändert in der Katalogfarbe)', std != pink_geo and page.evaluate("Rennspiel.carBuilder.bauen(Rennspiel.carCatalog.finde('troc-cabrio')).userData.lackFarbe") == katalog_farbe, hex(katalog_farbe))
    vm = page.evaluate(VMAX, 0); vk = page.evaluate(VMAX, 1)
    pruefe('Upgrade Motor 1: vMax × 1,04, Reifen 1: grip × 1,04', abs(vm['verh'] - 1.04) < 1e-6 and abs(vm['grip'] - 1.04) < 1e-6, vm)
    pruefe('KI ohne Upgrades (vMax × 1)', abs(vk['verh'] - 1) < 1e-9, vk)
    page.wait_for_function('Rennspiel.spiel.rennen.zustand === "laeuft"', timeout=30000)
    page.evaluate('Rennspiel.spiel.autopilot(0, true); Rennspiel.spiel.schnellvorlauf(4)')
    page.wait_for_timeout(1200)
    bild_rennen = snap('06_rennen_pink.png')
    pink_rennen = pixel_anteil(bild_rennen, 'pink', box=(400, 380, 880, 760))
    pruefe('Bild Rennen: eigenes Auto pink (Pixel hinter der Kamera)', pink_rennen > 0.01, round(pink_rennen, 4))
    # Schalter aus (wie in der Garage) → Standard-vMax, Lack bleibt
    page.evaluate("Rennspiel.spiel.rennenStarten({ upgradesZaehlen: false })")
    vm2 = page.evaluate(VMAX, 0); m2 = page.evaluate(LACK_IM_MESH, [0, PINK])
    pruefe('Schalter aus: vMax/grip Standard, Lack bleibt pink', abs(vm2['verh'] - 1) < 1e-9 and abs(vm2['grip'] - 1) < 1e-9 and m2['lack'] == PINK, [vm2, m2['lack']])
    pruefe('Schalter gespeichert (Einstellungen)', E()['upgradesZaehlen'] is False and '"upgradesZaehlen":false' in page.evaluate('localStorage.getItem(Rennspiel.config.ui.speicherSchluessel)'))
    page.evaluate("Rennspiel.spiel.rennenStarten({ upgradesZaehlen: true })")
    pruefe('Schalter wieder an: vMax × 1,04', abs(page.evaluate(VMAX, 0)['verh'] - 1.04) < 1e-6)

    # ---------------------------------------------------------------- d) Schaden-Rest + Reparatur
    page.evaluate("Rennspiel.spiel.rennenStarten({ schaden: true, gegner: 1 })")
    pruefe('Schaden an, heiles Auto: Start 100 %', page.evaluate('Rennspiel.spiel.schaden.zustand(0).prozent') == 100)
    page.evaluate("Rennspiel.spiel.schaden._punkteSetzen(0, 45); Rennspiel.spiel.rennenFertig()")
    pruefe('Rennende speichert Rest 45 % (Jonas/Cabrio)', page.evaluate("Rennspiel.Garage.autoDaten('Jonas', 'troc-cabrio').rest") == 45)
    page.evaluate("Rennspiel.spiel.rennenStarten()")
    pruefe('Nächstes Rennen startet mit 45 %, KI mit 100 %', page.evaluate('Rennspiel.spiel.schaden.zustand(0).prozent') == 45
           and page.evaluate('Rennspiel.spiel.schaden.zustand(1).prozent') == 100, [page.evaluate('Rennspiel.spiel.schaden.zustand(0).prozent'), page.evaluate('Rennspiel.spiel.schaden.zustand(1).prozent')])
    page.evaluate("Rennspiel.spiel.schaden._punkteSetzen(0, 0); Rennspiel.spiel.rennenFertig(); Rennspiel.spiel.rennenStarten()")
    pruefe('Rest 0 → Start mit mindestens 30 %', page.evaluate('Rennspiel.spiel.schaden.zustand(0).prozent') == 30)
    # Reparatur in der Garage (Maus)
    page.evaluate('Rennspiel.spiel.zumMenue()'); page.wait_for_timeout(300)
    page.click('[data-a="garage"]'); page.wait_for_timeout(300)
    page.click('#garage [data-g="fahrer:Jonas"]'); page.wait_for_timeout(300)
    page.click('#garage [data-g="auto:troc-cabrio"]'); page.wait_for_timeout(500)
    rep_text = page.inner_text('#garage .g-zeile:nth-child(2)')
    k1 = page.evaluate("Rennspiel.Garage.konto('Jonas')")
    page.click('#garage [data-g="reparatur"]'); page.wait_for_timeout(300)
    pruefe('Reparatur (Schaden an, 30 %): −10, Rest 100', page.evaluate("Rennspiel.Garage.autoDaten('Jonas', 'troc-cabrio').rest") == 100
           and page.evaluate("Rennspiel.Garage.konto('Jonas')") == k1 - 10, [rep_text, page.inner_text('#garage .g-nachricht')])
    snap('07_werkstatt_repariert.png')
    page.click('#garage [data-g="schliessen"]'); page.wait_for_timeout(300)
    page.evaluate("Rennspiel.spiel.rennenStarten()")
    pruefe('Nach Reparatur: Start mit 100 %', page.evaluate('Rennspiel.spiel.schaden.zustand(0).prozent') == 100)
    # Schaden aus: kein Rest gespeichert/angewendet (Standard unverändert)
    page.evaluate("Rennspiel.spiel.rennenStarten({ schaden: false })")
    pruefe('Schaden aus: kein Schaden-System aktiv', not page.evaluate('!!(Rennspiel.spiel.schaden && Rennspiel.spiel.schaden.an)'))
    page.evaluate("Rennspiel.spiel.rennenStarten({ schaden: false, upgradesZaehlen: true })")

    pruefe('Keine JS-Fehler', not fehler, fehler)
    print(json.dumps({'ok': all(x['ok'] for x in pruefungen), 'fehler': fehler}, ensure_ascii=False))
    browser.close()
sys.exit(0 if all(x['ok'] for x in pruefungen) and not fehler else 1)
