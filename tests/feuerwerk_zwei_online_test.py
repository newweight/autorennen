#!/usr/bin/env python3
"""v29 F5: Feuerwerk-Tafel-Verzoegerung im Zweispieler (Mensch 1 gewinnt) und online (Client-Optik, Einheit ohne Server).
Aufruf: python3 tests/feuerwerk_zwei_online_test.py [strecke]"""
import sys, os
from playwright.sync_api import sync_playwright
basis = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
url = 'file://' + os.path.join(basis, 'Autorennen.html')
sid = sys.argv[1] if len(sys.argv) > 1 else 'wiese'
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required']
erg = []
def pruefe(n, ok, d=''):
    erg.append(bool(ok)); print(('OK   ' if ok else 'FEHL ') + n + (' - ' + str(d) if d != '' else ''), flush=True)
START = """([sid]) => Rennspiel.spiel.rennenStarten({ modus: 'zwei', streckeId: sid, autoIds: ['passat', 'multivan'], runden: 1, gegner: 1, schwierigkeit: 'mittel', fahrhilfe: ['wenig', 'wenig'], tempoKlasse: 'normal', tageszeit: 'tag' })"""
# idx kurz vor die Linie (alle anderen weit zurueck/stehend ausser dem Ausnahme-Index)
LAUF = '''([idx, bleib]) => { const S = Rennspiel.spiel, sp = S.strecke.spline, L = S.strecke.laenge, t = S.rennen.teilnehmer[idx], f = S.fahrzeuge[idx];
  S.fahrzeuge.forEach((g, i) => { if (i !== idx && i !== bleib) { const p = sp.punktBei(sp.wrapS(L - 250 - 25 * i)); g.vehicle.setzen(p.x, p.z, Rennspiel.headingAus(p.tx, p.tz)); g.vehicle.vLaengs = 0; g.driver && (g.driver.steuerung = () => ({ gas: 0, bremse: 1, lenkung: 0 })); } });
  const q = sp.punktBei(sp.wrapS(L - 12)); t.gestartet = true; t.naechsterCheckpoint = 0;
  f.vehicle.setzen(q.x, q.z, Rennspiel.headingAus(q.tx, q.tz)); f.vehicle.vLaengs = 38; f.index = -1; }'''
with sync_playwright() as p:
    br = p.chromium.launch(args=ARGS)
    page = br.new_page(viewport={'width': 1024, 'height': 576}); page.set_default_timeout(240000)
    fehler = []; page.on('pageerror', lambda e: fehler.append(str(e)))
    page.goto(url); page.wait_for_timeout(1500)
    page.evaluate(START, [sid]); page.wait_for_function('Rennspiel.spiel.rennen && Rennspiel.spiel.rennen.zustand === "laeuft"', timeout=120000)
    page.wait_for_function('Rennspiel.spiel.rennen.zeit > 3.2', timeout=120000)
    # Spieler 1 gewinnt, Spieler 2 bleibt weit zurueck
    page.evaluate(LAUF, [0, -1])
    page.wait_for_function('Rennspiel.spiel.feuerwerk && Rennspiel.spiel.feuerwerk.aktiv', timeout=60000)
    pruefe('Zweispieler: Mensch 1 Erster -> Feuerwerk aktiv', True)
    page.wait_for_timeout(1200)
    v = page.evaluate('() => ({ z: Rennspiel.spiel.zustand, rz: Rennspiel.spiel.rennen.zustand, t: Rennspiel.spiel.feuerwerk.t, p2: Rennspiel.spiel.rennen.teilnehmer[1].imZiel })')
    pruefe('Zweispieler: solange Spieler 2 noch faehrt, laeuft das Rennen weiter (keine Tafel)', v['z'] == 'rennen' and v['rz'] == 'laeuft' and not v['p2'], v)
    # Spieler 2 kommt 1,5 s spaeter ins Ziel -> Tafel erst bei Show-Zeit >= 6 s
    page.evaluate(LAUF, [1, 0])
    page.wait_for_function('Rennspiel.spiel.rennen.teilnehmer[1].imZiel', timeout=60000)
    v = page.evaluate('() => ({ z: Rennspiel.spiel.zustand, t: Rennspiel.spiel.feuerwerk.t, rz: Rennspiel.spiel.rennen.zustand })')
    pruefe('Zweispieler: beide im Ziel, Show-Zeit < 5 s -> Tafel noch nicht da (%.1f s)' % v['t'], v['t'] > 5 or v['z'] == 'rennen', v)
    page.wait_for_function('Rennspiel.spiel.zustand === "ergebnis"', timeout=240000)
    v = page.evaluate('() => ({ z: Rennspiel.spiel.zustand, t: Rennspiel.spiel.feuerwerk.t, aktiv: Rennspiel.spiel.feuerwerk.aktiv })')
    pruefe('Zweispieler: Tafel nach >= 5,9 s Show-Zeit (%.2f s)' % v['t'], v['t'] >= 5.9 and v['aktiv'], v)
    pl = page.evaluate('() => Rennspiel.spiel.rennen.teilnehmer.map(t => t.zielPlatz)')
    pruefe('Zweispieler: Spieler 1 Platz 1, Spieler 2 Platz 2', pl[0] == 1 and pl[1] == 2, pl)
    page.evaluate('Rennspiel.spiel.zumMenue(true)'); page.wait_for_timeout(500)
    # Online (Einheit): ergebnisFreigeben haelt/zeigt die Tafel je nach Feuerwerk
    r = page.evaluate('''() => { const O = Rennspiel.Online && Rennspiel.Online.Bildschirm; if (!O) return { fehlt: true };
      const o = Object.create(O.prototype), fw = { aktiv: true, t: 2, zerstoert: false, c: { tafelNach: 6 } }, el = { style: { display: 'none' } };
      o.spiel = { feuerwerk: fw }; o.ergEl = el; o.phase = 'ergebnis'; o._ergWarten = true;
      const a = []; o.ergebnisFreigeben(); a.push(el.style.display);           // t=2 -> weiter versteckt
      fw.t = 6.1; o.ergebnisFreigeben(); a.push(el.style.display);               // t>=6 -> sichtbar
      o._ergWarten = true; el.style.display = 'none'; fw.t = 1; fw.aktiv = false; o.ergebnisFreigeben(); a.push(el.style.display);   // Show vorbei -> sichtbar
      o._ergWarten = true; el.style.display = 'none'; fw.aktiv = true; o.phase = 'lobby'; o.ergebnisFreigeben(); a.push(el.style.display + '/' + o._ergWarten);   // Phase weg -> nichts zeigen, Merker aus
      return { a }; }''')
    pruefe('Online: Tafel-Verzoegerung (versteckt bei t=2, sichtbar bei 6,1, sichtbar nach Show, Phase weg -> aus)', r.get('a') == ['none', '', '', 'none/false'], r)
    pruefe('Keine JS-Fehler', not fehler, fehler[:3])
    br.close()
print('%d von %d OK' % (sum(erg), len(erg)))
sys.exit(0 if all(erg) else 1)
