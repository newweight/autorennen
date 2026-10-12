#!/usr/bin/env python3
"""Runde 7 (Abschlepp-Reparatur): echtes Spiel im Browser (Playwright, headless) – Bilder + Integrationsprüfung.
Aufruf: python3 tests/reparatur_screenshot.py [ausgabeordner]   (Standard tests/out/reparatur)
Bilder: 01_reparatur_20 (orange, „ab 30 % kannst du losfahren“), 02_gasversuch_20 (rot, „Noch nicht!“), 03_reparatur_40 (grün, „Gas = losfahren“),
        04_split_20_50 (2 Spieler: links 20 %, rechts 50 %)
Prüft im echten Spiel (main.js-Verdrahtung): Gas bei 20 % wirkungslos (Auto steht), Gas bei 30 % → fährt, bleibt 30 %; Warten → 100 % nach 10 s;
KI wird nach dem Abschleppen gehalten und ab 60 % freigegeben; keine JS-Fehler."""
import sys, os, json
from playwright.sync_api import sync_playwright

basis = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
aus = sys.argv[1] if len(sys.argv) > 1 else os.path.join(basis, 'tests', 'out', 'reparatur')
os.makedirs(aus, exist_ok=True)
url = 'file://' + os.path.join(basis, 'Autorennen.html')
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']

# Rennen starten (Schaden an), Countdown überspringen, Spieler i auf 0 % → liegengeblieben; Eingabe-Platzhalter (Gas per Schalter)
START = '''([modus, nSpieler]) => { const s = Rennspiel.spiel; s.laeuft = false;
  s.rennenStarten({ modus, streckeId: 'wiese', welt: 'klassisch', schaden: true, gegner: 3, runden: 5, schwierigkeit: 'mittel',
    autoIds: ['troc-cabrio', 'multivan'], fahrhilfe: ['aus', 'aus'] });
  s.schnellvorlauf(6);
  s._gas = [0, 0]; s.input.steuerung = (nr) => ({ gas: s._gas[nr] || 0, bremse: 0, lenkung: 0 });
  s._log = [];
  s.schaden.bei((e) => s._log.push(e.art + (e.grund ? ':' + e.grund : '') + ':' + e.i + ':' + e.prozent));
  return { an: s.schaden.an, spieler: s.fahrzeuge.filter(f => f.istSpieler).length }; }'''
# Auto i liegenbleiben lassen und bis zum Abschleppen (5 s) vorspulen → Reparatur beginnt
LIEGEN = '''(i) => { const s = Rennspiel.spiel, sc = s.schaden; sc.z[i].abkling = 0; sc._punkteSetzen(i, 5); sc.treffer(i, 'hindernis', 5);
  let n = 0; while (sc.zustand(i).liegengeblieben && n < 900) { s.physikSchritt(1 / 60); n++; }
  return sc.zustand(i); }'''
# n Physikschritte, Anzeige (Kamera/HUD) nachziehen
SCHRITTE = '''([sek]) => { const s = Rennspiel.spiel; for (let n = 0; n < Math.round(sek * 60); n++) s.physikSchritt(1 / 60);
  s.fahrzeuge.forEach((g) => { const d = g.anzeige, w = g.vehicle; d.x = w.x; d.y = w.y; d.z = w.z; d.heading = w.heading; d.nicken = w.nicken; d.neigung = w.neigung; });
  s.kameras.forEach(k => k.update(1 / 60)); s.huds.forEach(h => h.update());      // (laeuft = false: HUD von Hand nachziehen)
  return s.fahrzeuge.map((f, i) => ({ i, p: s.schaden.zustand(i).prozent, rep: s.schaden.zustand(i).reparatur, tempo: +f.vehicle.tempo.toFixed(2), x: f.vehicle.x, z: f.vehicle.z })); }'''
HUD = '''() => Array.from(document.querySelectorAll('.hud-reparatur')).map(e => ({ text: e.textContent, an: getComputedStyle(e).display !== 'none' }))'''
STOPP = '''() => { const s = Rennspiel.spiel; s.uhr.rest = 0; s.pausiert = true; document.querySelectorAll('.hud-banner').forEach(b => { b.className = 'hud-banner'; }); }'''
GAS = '''([nr, g]) => { Rennspiel.spiel._gas[nr] = g; }'''

fehler, pr = [], []
def pruefe(name, ok, info=''):
    pr.append((name, bool(ok), info)); print(('OK   ' if ok else 'FEHL ') + name + ('  (' + str(info) + ')' if info != '' else ''))

with sync_playwright() as pw:
    browser = pw.chromium.launch(args=ARGS)
    # ---------------- Einzelspieler ----------------
    page = browser.new_page(viewport={'width': 1280, 'height': 800})
    page.on('pageerror', lambda e: fehler.append(str(e)))
    page.on('console', lambda m: fehler.append('console.error: ' + m.text) if m.type == 'error' else None)
    page.goto(url); page.wait_for_timeout(1200)
    info = page.evaluate(START, ['solo', 1])
    pruefe('Rennen mit Schaden an gestartet', info['an'] and info['spieler'] == 1, info)
    z = page.evaluate(LIEGEN, 0)
    pruefe('nach dem Abschleppen: Reparatur 0 %, Auto steht', z['reparatur'] and z['prozent'] == 0, z)
    r = page.evaluate(SCHRITTE, [2.05])
    pruefe('2 s später 20 %', r[0]['p'] == 20 and r[0]['rep'], r[0])
    page.wait_for_timeout(400)
    hud = page.evaluate(HUD)
    pruefe('HUD zeigt „Reparatur 20 %“ und „ab 30 %“', hud and hud[0]['an'] and 'Reparatur 20 %' in hud[0]['text'] and 'ab 30 %' in hud[0]['text'], hud)
    page.evaluate(STOPP); page.wait_for_timeout(300)
    page.screenshot(path=os.path.join(aus, '01_reparatur_20.png'))
    page.evaluate('() => { Rennspiel.spiel.pausiert = false; }')
    # Gasversuch bei 20 %: Auto bleibt stehen
    page.evaluate(GAS, [0, 1])
    pos0 = page.evaluate(SCHRITTE, [0.3])[0]
    pruefe('Gas bei 20 % wirkungslos: Auto steht (Tempo 0)', pos0['tempo'] < 0.01 and pos0['rep'], pos0)
    page.wait_for_timeout(300)
    hud = page.evaluate(HUD)
    pruefe('HUD: „Noch nicht!“ beim Gasversuch', hud and 'Noch nicht' in hud[0]['text'], hud)
    page.evaluate(STOPP); page.wait_for_timeout(300)
    page.screenshot(path=os.path.join(aus, '02_gasversuch_20.png'))
    page.evaluate('() => { Rennspiel.spiel.pausiert = false; }')
    # weiter bis 30 % (Gas gedrückt gehalten): fährt sofort los, bleibt 30 %
    r = page.evaluate(SCHRITTE, [1.0])[0]
    r2 = page.evaluate(SCHRITTE, [2.0])[0]
    pruefe('Gas gehalten: ab 30 % fährt das Auto los (kein Warten bis 40 %), Wert bleibt 30 %', r['p'] == 30 and not r['rep'] and r2['tempo'] > 3 and r2['p'] == 30, [r, r2])
    log = page.evaluate('() => Rennspiel.spiel._log')
    pruefe('Ereignisse: reparaturEnde losgefahren bei 30 %', any(l.startswith('reparaturEnde:losgefahren:0:30') for l in log), log[-6:])
    page.evaluate(GAS, [0, 0])
    # zweiter Versuch: warten bis 40 % → Bild; dann bis 100 %
    page.evaluate(LIEGEN, 0)
    r = page.evaluate(SCHRITTE, [4.05])[0]
    page.wait_for_timeout(400)
    hud = page.evaluate(HUD)
    pruefe('40 %: HUD „Gas = losfahren“', r['p'] == 40 and hud and 'Gas = losfahren' in hud[0]['text'] and '40 %' in hud[0]['text'], hud)
    page.evaluate(STOPP); page.wait_for_timeout(300)
    page.screenshot(path=os.path.join(aus, '03_reparatur_40.png'))
    page.evaluate('() => { Rennspiel.spiel.pausiert = false; }')
    r = page.evaluate(SCHRITTE, [6.0])[0]
    pruefe('ohne Gas: nach 10 s 100 %, Reparatur endet, Auto steht noch', r['p'] == 100 and not r['rep'] and r['tempo'] < 0.3, r)
    page.wait_for_timeout(300)
    hud = page.evaluate(HUD)
    pruefe('HUD-Reparatur danach weg', not hud or not hud[0]['an'], hud)
    # KI: nach dem Abschleppen gehalten, ab 60 % frei
    ki = page.evaluate('''() => { const s = Rennspiel.spiel, sc = s.schaden; const i = s.fahrzeuge.findIndex(f => !f.istSpieler && !f.polizei);
      sc.z[i].abkling = 0; sc._punkteSetzen(i, 5); sc.treffer(i, 'hindernis', 5);
      let n = 0; while (sc.zustand(i).liegengeblieben && n < 900) { s.physikSchritt(1 / 60); n++; }
      const a = sc.zustand(i), g0 = sc.gesperrt(i);
      for (let k = 0; k < 330; k++) s.physikSchritt(1 / 60);     // 5,5 s → 50 %
      const b = sc.zustand(i), g1 = sc.gesperrt(i);
      for (let k = 0; k < 60; k++) s.physikSchritt(1 / 60);      // 6,5 s → 60 %, frei
      const c = sc.zustand(i);
      return { start: a.prozent, rep: a.reparatur, g0, p55: b.prozent, g1, p65: c.prozent, frei: !sc.gesperrt(i), repEnde: c.reparatur }; }''')
    pruefe('KI: nach Abschleppen 0 %, gesperrt; bei 50 % noch gesperrt; ab 60 % frei', ki['start'] == 0 and ki['rep'] and ki['g0'] and ki['p55'] == 50 and ki['g1'] and ki['p65'] == 60 and ki['frei'] and not ki['repEnde'], ki)
    page.close()

    # ---------------- Split-Screen (2 Spieler) ----------------
    page = browser.new_page(viewport={'width': 1280, 'height': 800})
    page.on('pageerror', lambda e: fehler.append(str(e)))
    page.on('console', lambda m: fehler.append('console.error: ' + m.text) if m.type == 'error' else None)
    page.goto(url); page.wait_for_timeout(1200)
    info = page.evaluate(START, ['zwei', 2])
    pruefe('Split-Screen mit 2 Spielern gestartet', info['an'] and info['spieler'] == 2, info)
    idx2 = page.evaluate('() => Rennspiel.spiel.fahrzeuge.findIndex((f) => f.istSpieler && f.spielerNr === 1)')
    # Spieler 1 liegenbleiben, 1,5 s später Spieler 2 → Spieler 1 wird 1,5 s früher abgeschleppt (Reparatur-Vorsprung)
    page.evaluate('''() => { const s = Rennspiel.spiel, sc = s.schaden; sc.z[0].abkling = 0; sc._punkteSetzen(0, 5); sc.treffer(0, 'hindernis', 5); }''')
    page.evaluate(SCHRITTE, [1.5])
    page.evaluate('''(i) => { const s = Rennspiel.spiel, sc = s.schaden; sc.z[i].abkling = 0; sc._punkteSetzen(i, 5); sc.treffer(i, 'hindernis', 5);
      let n = 0; while (sc.zustand(i).liegengeblieben && n < 900) { s.physikSchritt(1 / 60); n++; } }''', idx2)
    r = page.evaluate(SCHRITTE, [2.05])
    p0, p1 = r[0]['p'], r[idx2]['p']
    pruefe('Split-Screen: beide Spieler unabhängig in der Reparatur (Spieler 1 weiter als Spieler 2)', r[0]['rep'] and r[idx2]['rep'] and p0 > p1, [p0, p1])
    page.wait_for_timeout(400)
    hud = page.evaluate(HUD)
    pruefe('Split-Screen: zwei HUD-Reparaturanzeigen mit eigenen Prozenten', len(hud) == 2 and all(h['an'] for h in hud), hud)
    page.evaluate(GAS, [1, 1])      # Spieler 2 drückt Gas bei 20 % → wirkungslos, Spieler 1 unberührt
    q = page.evaluate(SCHRITTE, [0.2])
    pruefe('Split-Screen: Gas von Spieler 2 bei < 30 % wirkungslos, Spieler 1 repariert weiter', q[idx2]['tempo'] < 0.01 and q[0]['rep'], [q[0], q[idx2]])
    page.evaluate(STOPP); page.wait_for_timeout(300)
    page.screenshot(path=os.path.join(aus, '04_split_hoch_niedrig.png'))
    page.close()
    browser.close()

pruefe('keine JS-Fehler', not fehler, fehler[:3])
n_fehl = sum(1 for _, ok, _ in pr if not ok)
print('\n%d Prüfungen, %d FEHL' % (len(pr), n_fehl))
sys.exit(1 if n_fehl else 0)
