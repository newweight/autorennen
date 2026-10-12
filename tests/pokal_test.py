#!/usr/bin/env python3
"""Runde 6 (W3-F): Pokal-Serie (D1) und „Letzter fliegt raus" (D7) im Browser (Playwright, headless Chromium).
a) Modus-Schritt: 4 Karten (Allein, Zu zweit, Pokal, Letzter fliegt raus) passen bei 1280×800 und 1440×900, Tastatur ←→ wandert über alle 4
b) Pokal 3 Rennen (solo, Autopilot + Schnellvorlauf je Rennen): Strecken Wiese → Wald → Fantasie, KI-Stärke steigt, Zwischenstände,
   Siegerehrung (Podest, Konfetti) – Screenshot, Pokal-Zähler im Fahrer-Schritt, Einstellungen danach wiederhergestellt
c) Pokal abbrechen: Esc im Zwischenstand → Rückfrage (Nein bleibt, Ja → Hauptmenü), Pause → Hauptmenü fragt ebenfalls
d) Elimination solo: 5 Teilnehmer, 4 Runden, je Runde einer weniger, Sieger korrekt, Ergebnistafel in Ausscheid-Reihenfolge, keine NaN
e) Elimination zu zweit: ausgeschiedener Spieler 2 sieht den Führenden (Zuschauer-Kamera), HUD-Hinweis
Keine JS-Fehler. Aufruf: python3 tests/pokal_test.py [ausgabeordner]"""
import sys, os, json
from playwright.sync_api import sync_playwright

basis = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
out = sys.argv[1] if len(sys.argv) > 1 else os.path.join(basis, 'tests', 'out', 'pokal')
os.makedirs(out, exist_ok=True)
url = 'file://' + os.path.join(basis, 'Autorennen.html')
fehler, pruefungen = [], []

def pruefe(name, ok, info=''):
    pruefungen.append({'test': name, 'ok': bool(ok), 'info': info})
    print(('OK   ' if ok else 'FAIL ') + name + (' – ' + str(info) if info != '' else ''), flush=True)

KARTEN = """(() => { const k = Array.from(document.querySelectorAll('.karte.modus-karte')).map(e => { const r = e.getBoundingClientRect();
  return { id: e.dataset.a, l: r.left, r: r.right, t: r.top, b: r.bottom }; });
  const m = document.querySelector('.m-inhalt'), fuss = document.querySelector('.m-fuss').getBoundingClientRect().top;
  const g = document.querySelector('.garage-karte'); const gr = g ? g.getBoundingClientRect() : null;
  let ueber = false; for (let i = 0; i < k.length; i++) for (let j = i + 1; j < k.length; j++) {
    const a = k[i], b = k[j]; if (a.l < b.r - 1 && b.l < a.r - 1 && a.t < b.b - 1 && b.t < a.b - 1) ueber = true; }
  return { n: k.length, ids: k.map(x => x.id), innen: k.every(x => x.l >= 0 && x.r <= innerWidth && x.t >= 0 && x.b <= fuss + 2),
    ueber, scroll: m.scrollHeight <= m.clientHeight + 1, garage: gr ? gr.bottom <= fuss + 2 : null }; })()"""

# Spieler-Autopilot mit fester Stärke (main.js-Hook autopilot() nimmt „mittel"; hier wählbar)
AUTOPILOT = """(st) => { const s = Rennspiel.spiel; s.autopilot(0, true); const f = s.fahrzeuge[0];
  f.autopilot = new Rennspiel.Driver(f.vehicle, s.strecke, { schwierigkeit: st, seed: 7000, name: 'Autopilot' });
  if (f.autopilot.hindernisseSetzen) f.autopilot.hindernisseSetzen(s.strecke.hindernisse); return true; }"""

def bis_zustand(page, ziel, max_s=900, schritt=20):
    """Schnellvorlauf in Stücken, bis spiel.zustand == ziel (oder max_s Spielsekunden)."""
    t = 0
    while t < max_s and page.evaluate('Rennspiel.spiel.zustand') != ziel:
        page.evaluate(f'Rennspiel.spiel.schnellvorlauf({schritt})'); t += schritt
    return t

with sync_playwright() as p:
    browser = p.chromium.launch(args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
    page = browser.new_page(viewport={'width': 1280, 'height': 800})
    page.on('pageerror', lambda e: fehler.append(str(e)))
    page.on('console', lambda m: fehler.append('console.error: ' + m.text) if m.type == 'error' else None)
    page.goto(url)
    page.wait_for_function('window.Rennspiel && Rennspiel.spiel', timeout=15000)
    page.wait_for_timeout(1200)
    taste = lambda t, n=1: [page.keyboard.press(t) or page.wait_for_timeout(70) for _ in range(n)]
    snap = lambda name: page.screenshot(path=os.path.join(out, name))
    E = 'Rennspiel.spiel.einstellungen'

    # ---------- a) Modus-Schritt ----------
    page.evaluate("Rennspiel.spiel.menue.zeigen(0)"); page.wait_for_timeout(300)
    for vw, vh in ((1280, 800), (1440, 900)):
        page.set_viewport_size({'width': vw, 'height': vh}); page.wait_for_timeout(300)
        k = page.evaluate(KARTEN)
        pruefe(f'Modus {vw}×{vh}: 4 Karten im Bild, ohne Überlappung, ohne Scrollen (Garage-Karte auch)',
               k['n'] == 4 and k['innen'] and not k['ueber'] and k['scroll'] and k['garage'] is not False, k)
        snap(f'pokal_a_modus_{vw}.png')
    page.set_viewport_size({'width': 1280, 'height': 800}); page.wait_for_timeout(300)
    page.evaluate(f"{E}.modus = 'solo'; {E}.spielart = 'rennen'; Rennspiel.spiel.menue.zeichnen()")
    folge = []
    for _ in range(4):
        taste('ArrowRight')
        folge.append(page.evaluate(f"{E}.spielart + '/' + {E}.modus"))
    pruefe('Tastatur → wandert: zwei, Pokal, Raus, wieder allein', folge == ['rennen/zwei', 'pokal/zwei', 'elimination/zwei', 'rennen/solo'], folge)
    page.click('[data-a="pokalgroesse:4"]'); page.wait_for_timeout(100)
    page.click('[data-a="spieler:solo:pokal"]'); page.wait_for_timeout(100)
    pruefe('Pillen auf der Pokal-Karte: 4 Rennen, allein', page.evaluate(f"[{E}.spielart, {E}.pokalGroesse, {E}.modus].join()") == 'pokal,4,solo')
    pruefe('Pokal-Karte gewählt', page.evaluate("document.querySelector('.karte.m-pokal').classList.contains('gewaehlt')"))
    snap('pokal_a2_modus_pokal.png')
    # Einstellungs-Schritt: Pokal-Zeile oben, 3/4/5
    page.evaluate("Rennspiel.spiel.menue.schritt = 4; Rennspiel.spiel.menue.fokus = 0; Rennspiel.spiel.menue.zeichnen()"); page.wait_for_timeout(200)
    pruefe('Einstellungen: erste Zeile „Pokal" (Spaltenkopf) mit 3 Pillen, Fokus', page.evaluate("Rennspiel.spiel.menue.zeilen()[0]") == 'pokal' and
           page.evaluate("document.querySelectorAll('.pokal-zeile .pille').length") == 3 and page.evaluate("document.querySelector('.pokal-zeile').classList.contains('fokus')"))
    taste('ArrowLeft')
    pruefe('Pokal-Zeile: ← → 3 Rennen', page.evaluate(f'{E}.pokalGroesse') == 3)
    for modus in ('solo', 'zwei'):
        page.evaluate(f"{E}.modus = '{modus}'; Rennspiel.spiel.menue.einstellungenFix(); Rennspiel.spiel.menue.zeichnen()"); page.wait_for_timeout(200)
        l = page.evaluate("""(() => { const m = document.querySelector('.m-inhalt'), z = Array.from(document.querySelectorAll('.zeile, .start-knopf, h3.pokal-zeile')).map(e => e.getBoundingClientRect());
          return { scroll: m.scrollHeight <= m.clientHeight + 1, innen: z.every(r => r.left >= 0 && r.right <= innerWidth + 1 && r.bottom <= innerHeight) }; })()""")
        pruefe(f'Einstellungen Pokal {modus} 1280×800: ohne Scrollen, nichts abgeschnitten', l['scroll'] and l['innen'], l)
        snap(f'pokal_a3_einstellungen_{modus}.png')

    # ---------- b) Pokal 3 Rennen ----------
    page.evaluate(f"""Object.assign({E}, {{ modus: 'solo', spielart: 'pokal', pokalGroesse: 3, gegner: 2, runden: 1, schwierigkeit: 'leicht',
        streckeId: 'wueste', welt: '', variante: '', jahreszeit: 'sommer', wetter: 'klar', windStaerke: 0, schaden: false, polizei: false,
        fahrer: ['Jonas', 'Emmy'], tageszeit: 'tag' }}); Rennspiel.spiel.einstellungenSpeichern(); Rennspiel.spiel.menue.starten()""")
    page.wait_for_timeout(500)
    erwartet = [('wiese', 'leicht'), ('wald', 'mittel'), ('fantasie', 'schwer')]
    for nr, (strecke, staerke) in enumerate(erwartet):
        info = page.evaluate("({ z: Rennspiel.spiel.zustand, s: Rennspiel.spiel.strecke && Rennspiel.spiel.strecke.id, st: Rennspiel.spiel.einstellungen.schwierigkeit, "
                             "ki: Rennspiel.spiel.fahrzeuge.filter(f => f.driver).map(f => f.driver.schwierigkeit || (f.driver.stufe && f.driver.stufe.name) || null), "
                             "n: Rennspiel.spiel.rennen.teilnehmer.length, r: Rennspiel.spiel.rennen.runden })")
        pruefe(f'Rennen {nr + 1}: {strecke}, KI {staerke}, 3 Teilnehmer, 1 Runde', info['z'] == 'rennen' and info['s'] == strecke and info['st'] == staerke
               and info['n'] == 3 and info['r'] == 1, info)
        page.evaluate(AUTOPILOT, 'legende')
        if nr == 0:
            page.evaluate('Rennspiel.spiel.schnellvorlauf(8)'); page.wait_for_timeout(400); snap('pokal_b0_rennen1.png')
        t = bis_zustand(page, 'pokal', 600)
        pruefe(f'Rennen {nr + 1} fertig → Zustand pokal ({t} s Spielzeit)', page.evaluate('Rennspiel.spiel.zustand') == 'pokal', t)
        page.wait_for_timeout(900)
        if nr < 2:
            z = page.evaluate("""(() => { const s = Rennspiel.spiel.pokal, t = s.tabelle(); return { nr: s.nr, punkte: t.map(x => x.punkte), namen: t.map(x => x.name),
              zeilen: document.querySelectorAll('#pokal tbody tr').length, sichtbar: getComputedStyle(document.getElementById('pokal')).display !== 'none',
              titel: document.querySelector('#pokal h1').textContent, nan: document.getElementById('pokal').textContent.includes('NaN') }; })()""")
            summe = sum(z['punkte'])
            pruefe(f'Zwischenstand nach Rennen {nr + 1}: sichtbar, 3 Zeilen, Punkte 10+8+6 je Rennen, kein NaN',
                   z['sichtbar'] and z['zeilen'] == 3 and summe == 24 * (nr + 1) and not z['nan'] and z['nr'] == nr + 1, z)
            page.wait_for_timeout(1500)        # Einblend-Animation (Software-Rendering: wenige Bilder/s)
            snap(f'pokal_b{nr + 1}_zwischenstand.png')
            page.wait_for_timeout(300)
            taste('Enter'); page.wait_for_timeout(600)
    sieg = page.evaluate("""(() => { const s = Rennspiel.spiel.pokal, t = s.tabelle(); return { fertig: s.fertig, sieger: t[0].name, spieler: t[0].istSpieler,
      punkte: t.map(x => x.punkte), podest: document.querySelectorAll('.podest-platz:not(.leer)').length, gold: (document.querySelector('.podest-platz.p1 .podest-fahrer') || {}).textContent,
      konfetti: document.querySelectorAll('.konfetti i').length, bilder: document.querySelectorAll('.podest-auto img').length,
      titel: document.querySelector('#pokal h1').textContent, pokale: Rennspiel.Pokal.gewinne('Jonas') }; })()""")
    pruefe('Siegerehrung: Pokal fertig, Podest 3 Karten, Konfetti, Auto-Bilder', sieg['fertig'] and sieg['podest'] == 3 and sieg['konfetti'] >= 50 and sieg['bilder'] == 3
           and 'Siegerehrung' in sieg['titel'], sieg)
    pruefe('Siegerehrung: Gold = Tabellenerster', sieg['sieger'] in (sieg['gold'] or ''), sieg)
    pruefe('Pokal-Gewinn gespeichert (nur Spieler)', sieg['pokale'] == (1 if sieg['spieler'] and sieg['sieger'] == 'Jonas' else 0), sieg)
    page.wait_for_timeout(1500)
    snap('pokal_b4_siegerehrung.png')
    page.set_viewport_size({'width': 1440, 'height': 900}); page.wait_for_timeout(500); snap('pokal_b4_siegerehrung_1440.png')
    page.set_viewport_size({'width': 1280, 'height': 800}); page.wait_for_timeout(300)
    sitzt = page.evaluate("""(() => { const k = document.querySelector('.pokal-karte').getBoundingClientRect(); return k.top >= 0 && k.bottom <= innerHeight && k.left >= 0 && k.right <= innerWidth; })()""")
    pruefe('Siegerehrung passt in 1280×800', sitzt)
    taste('Escape'); page.wait_for_timeout(500)
    nach = page.evaluate(f"({{ z: Rennspiel.spiel.zustand, p: Rennspiel.spiel.pokal, s: {E}.streckeId, st: {E}.schwierigkeit, sa: {E}.spielart, "
                         f"gespeichert: JSON.parse(localStorage.getItem('rennspiel.einstellungen.v1')).streckeId }})")
    pruefe('Esc → Hauptmenü, Einstellungen wie vor dem Pokal (Wüste, leicht, Pokal)', nach['z'] == 'menue' and nach['p'] is None and nach['s'] == 'wueste'
           and nach['st'] == 'leicht' and nach['sa'] == 'pokal' and nach['gespeichert'] == 'wueste', nach)
    # Pokal-Zähler im Fahrer-Schritt (Gewinn notfalls für den Test gutschreiben, damit die Anzeige geprüft wird)
    if sieg['pokale'] == 0: page.evaluate("Rennspiel.Pokal.gutschreiben('Jonas')")
    page.evaluate("Rennspiel.spiel.menue.schritt = 2; Rennspiel.spiel.menue.zeichnen()"); page.wait_for_timeout(300)
    karte = page.evaluate("""(() => { const k = document.querySelector('[data-a="fahrer:0:Jonas"]'); return k ? k.textContent : null; })()""")
    pruefe('Fahrer-Schritt: Jonas zeigt 🏆 1', karte is not None and '🏆 1' in karte, karte)
    snap('pokal_b5_fahrer_pokale.png')

    # ---------- c) Abbrechen mit Rückfrage ----------
    page.evaluate(f"Object.assign({E}, {{ spielart: 'pokal', pokalGroesse: 3, gegner: 1, runden: 1, schwierigkeit: 'leicht', streckeId: 'wald' }}); Rennspiel.spiel.menue.starten()")
    page.wait_for_timeout(400)
    taste('Escape'); page.wait_for_timeout(200)       # Pause
    pruefe('Pokal-Rennen: Esc → Pause', page.evaluate('Rennspiel.spiel.pausiert'))
    page.click('#pause [data-a="menue"]'); page.wait_for_timeout(200)
    pruefe('Pause → Hauptmenü im Pokal: Rückfrage erscheint', page.evaluate("Rennspiel.spiel.pokalAnzeige.frageOffen") and page.is_visible('#pokal-frage'))
    snap('pokal_c1_rueckfrage.png')
    taste('Enter'); page.wait_for_timeout(200)       # Fokus steht auf „Nein"
    pruefe('Rückfrage „Nein": weiter in der Pause, Pokal läuft', not page.evaluate("Rennspiel.spiel.pokalAnzeige.frageOffen") and page.evaluate('Rennspiel.spiel.zustand') == 'rennen'
           and page.evaluate('Rennspiel.spiel.pokal !== null'))
    taste('Escape'); page.wait_for_timeout(200)       # Pause zu
    page.evaluate(AUTOPILOT, 'legende')
    bis_zustand(page, 'pokal', 600); page.wait_for_timeout(900)
    taste('Escape'); page.wait_for_timeout(200)
    pruefe('Zwischenstand: Esc → Rückfrage', page.evaluate("Rennspiel.spiel.pokalAnzeige.frageOffen"))
    taste('ArrowLeft'); taste('Enter'); page.wait_for_timeout(400)
    ab = page.evaluate(f"({{ z: Rennspiel.spiel.zustand, p: Rennspiel.spiel.pokal, s: {E}.streckeId, g: {E}.gegner }})")
    pruefe('Rückfrage „Ja": Hauptmenü, Pokal weg, Einstellungen zurück (Wald, 1 Gegner)', ab['z'] == 'menue' and ab['p'] is None and ab['s'] == 'wald' and ab['g'] == 1, ab)

    # ---------- d) Elimination solo: 5 Teilnehmer ----------
    page.evaluate("Rennspiel.config.pokal.elimination.zuschauerSekunden = null")   # Rennen immer bis zum Schluss (Prüfung je Runde)
    page.evaluate(f"""Object.assign({E}, {{ modus: 'solo', spielart: 'elimination', gegner: 4, runden: 2, schwierigkeit: 'leicht', streckeId: 'wiese',
        welt: '', polizei: true }}); Rennspiel.spiel.menue.starten();
        window._raus = []; Rennspiel.spiel.rennen.bei('raus', (t) => window._raus.push({{ nr: t.nr, name: t.name, runde: t.ausscheidRunde,
          aktiv: Rennspiel.spiel.rennen.teilnehmer.filter(x => !x.ausgeschieden).length, puffs: Rennspiel.spiel.puffs.length,
          sichtbar: Rennspiel.spiel.fahrzeuge[t.nr].mesh.visible }}));""")
    page.wait_for_timeout(400)
    st = page.evaluate("({ n: Rennspiel.spiel.rennen.teilnehmer.length, r: Rennspiel.spiel.rennen.runden, pol: !!Rennspiel.spiel.polizei, e: !!Rennspiel.spiel.rennen.elimination })")
    pruefe('Elimination: 5 Teilnehmer, 4 Runden, ohne Polizei', st['n'] == 5 and st['r'] == 4 and not st['pol'] and st['e'], st)
    # Bild der „Puff"-Wolke: 14 m vor dem Spielerauto (nur Optik; das echte Ausscheiden prüft der Lauf unten)
    page.evaluate("Rennspiel.spiel.schnellvorlauf(4.5)"); page.wait_for_timeout(2500)
    page.evaluate("""(() => { const s = Rennspiel.spiel, v = s.fahrzeuge[0].vehicle, x = v.x - Math.sin(v.heading) * 14, z = v.z - Math.cos(v.heading) * 14;
      s.puffs.push(new Rennspiel.Puff(s.szene, x, s.strecke.hoeheAn(x, z), z)); })()""")
    try: page.wait_for_function("Rennspiel.spiel.puffs.length && Rennspiel.spiel.puffs[0].zeit > 0.1", timeout=8000)
    except Exception: pass
    snap('pokal_d1_puff.png')
    page.evaluate(AUTOPILOT, 'legende')
    bis_zustand(page, 'ergebnis', 1500)
    raus = page.evaluate('window._raus')
    pruefe('je Runde einer raus: Runden 1, 2, 3, 4', [r['runde'] for r in raus] == [1, 2, 3, 4], raus)
    pruefe('je Runde einer weniger: 4, 3, 2, 1 Fahrende', [r['aktiv'] for r in raus] == [4, 3, 2, 1], [r['aktiv'] for r in raus])
    pruefe('Ausgeschiedene sofort unsichtbar, Puff-Wolke angelegt', all(not r['sichtbar'] and r['puffs'] >= 1 for r in raus), raus)
    erg = page.evaluate("""(() => { const s = Rennspiel.spiel, r = s.rennen; return { zustand: s.zustand, sieger: r.rangliste[0].name, siegerImZiel: r.rangliste[0].imZiel,
      siegerRaus: r.rangliste[0].ausgeschieden, reihe: r.rangliste.map(t => t.name), zeilen: Array.from(document.querySelectorAll('#ergebnis tbody tr')).map(z => z.textContent),
      titel: document.querySelector('#ergebnis h1').textContent,
      nan: s.fahrzeuge.some(f => !Number.isFinite(f.vehicle.x) || !Number.isFinite(f.vehicle.z)) || r.teilnehmer.some(t => !Number.isFinite(t.fortschritt))
        || document.getElementById('ergebnis').textContent.includes('NaN'),
      ausgeschieden: s.fahrzeuge.filter(f => f.ausgeschieden).length }; })()""")
    reihe_erw = [erg['sieger']] + [r['name'] for r in reversed(raus)]
    pruefe('Sieger = letztes Auto (nicht ausgeschieden, im Ziel)', erg['zustand'] == 'ergebnis' and erg['siegerImZiel'] and not erg['siegerRaus']
           and erg['sieger'] not in [r['name'] for r in raus], erg['sieger'])
    pruefe('Ergebnistafel in Ausscheid-Reihenfolge', erg['reihe'] == reihe_erw and len(erg['zeilen']) == 5
           and all(r['name'] in erg['zeilen'][4 - i] for i, r in enumerate(raus)), [erg['reihe'], reihe_erw])
    pruefe('Ergebnistafel: „raus in Runde n", Titel „Letzter fliegt raus"', all(f'raus in Runde {r["runde"]}' in erg['zeilen'][4 - i] for i, r in enumerate(raus))
           and 'Letzter fliegt raus' in erg['titel'], erg['zeilen'])
    pruefe('Elimination: keine NaN, 4 Autos ausgeschieden', not erg['nan'] and erg['ausgeschieden'] == 4, erg)
    snap('pokal_d2_ergebnis.png')

    # ---------- e) Elimination zu zweit: Zuschauer-Kamera ----------
    page.evaluate("Rennspiel.config.pokal.elimination.zuschauerSekunden = 6")
    page.evaluate(f"""Object.assign({E}, {{ modus: 'zwei', spielart: 'elimination', gegner: 3, schwierigkeit: 'leicht', streckeId: 'wiese' }});
        Rennspiel.spiel.zumMenue(true); Rennspiel.spiel.menue.starten();""")
    page.wait_for_timeout(400)
    page.evaluate(AUTOPILOT, 'legende')                  # Spieler 1 fährt, Spieler 2 bleibt stehen → fliegt in Runde 1 raus
    t = 0
    while t < 600 and not page.evaluate('Rennspiel.spiel.fahrzeuge[1].ausgeschieden'):
        page.evaluate('Rennspiel.spiel.schnellvorlauf(5)'); t += 5
    # Software-Rendering zu zweit: nur ~1 Bild/s → auf das nächste Bild warten (Kamera/HUD werden im Frame gesetzt)
    try: page.wait_for_function("(() => { const s = Rennspiel.spiel, f = s.rennen.rangliste.find(t => !t.ausgeschieden); return s.kameras[1].ziel === s.fahrzeuge[f.nr].vehicle; })()", timeout=20000)
    except Exception: pass
    page.wait_for_timeout(1500)
    z = page.evaluate("""(() => { const s = Rennspiel.spiel, r = s.rennen, f = r.rangliste.find(t => !t.ausgeschieden);
      return { raus: s.fahrzeuge[1].ausgeschieden, n: r.teilnehmer.length, runden: r.runden, kamera: s.kameras[1].ziel === s.fahrzeuge[f.nr].vehicle,
        fuehrend: f.name, hinweis: document.querySelectorAll('.hud-hinweis')[1] ? document.querySelectorAll('.hud-hinweis')[1].textContent : null,
        kamera1: s.kameras[0].ziel === s.fahrzeuge[0].vehicle }; })()""")
    pruefe('Zu zweit: 5 Teilnehmer (2 + 3), 4 Runden', z['n'] == 5 and z['runden'] == 4, z)
    pruefe('Spieler 2 raus → Kamera 2 folgt dem Führenden, Kamera 1 bleibt bei Spieler 1', z['raus'] and z['kamera'] and z['kamera1'], z)
    pruefe('HUD Spieler 2: „Du schaust zu"', z['hinweis'] is not None and 'schaust zu' in z['hinweis'], z['hinweis'])
    snap('pokal_e1_zuschauer.png')
    bis_zustand(page, 'ergebnis', 1500)
    pruefe('Zu zweit: Rennen endet mit Ergebnis', page.evaluate('Rennspiel.spiel.zustand') == 'ergebnis')
    # Nochmal (Enter) startet wieder „Letzter fliegt raus"
    page.wait_for_timeout(900); taste('Enter'); page.wait_for_timeout(400)
    pruefe('Nochmal → wieder Elimination', page.evaluate('Rennspiel.spiel.zustand') == 'rennen' and page.evaluate('!!Rennspiel.spiel.rennen.elimination'))
    page.evaluate("Rennspiel.spiel.zumMenue(true)"); page.wait_for_timeout(300)

    pruefe('keine JS-Fehler', len(fehler) == 0, fehler[:5])
    browser.close()

anz = sum(1 for x in pruefungen if not x['ok'])
with open(os.path.join(out, 'pokal_test.json'), 'w') as f: json.dump(pruefungen, f, ensure_ascii=False, indent=1)
print(f'{len(pruefungen) - anz}/{len(pruefungen)} OK' + (' – FEHLER: ' + str(anz) if anz else ''))
sys.exit(1 if anz else 0)
