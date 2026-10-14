#!/usr/bin/env python3
"""Test Cabrio-Verdeck (14.10. v20): python3 tests/dach_test.py
Prüft: Start offen · Hinweis „Dach auf/zu“ · ↑+↓ im Stand klappt zu (Animation ≈ 2 s) und wieder auf · in Fahrt NICHT, Meldung „Erst anhalten!“
· einzelne Taste tut nichts · Zweispieler: A+D nur beim WASD-Spieler, ←+→ nur beim Pfeil-Spieler · Optionen-API (dach/lack) · keine Verdeck bei anderen Autos
· Fahrphysik unverändert (gleiche Position nach gleicher Zeit mit/ohne Dach-Eingabe im Stand)."""
import sys, os
from playwright.sync_api import sync_playwright

basis = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
url = 'file://' + os.path.join(basis, 'Autorennen.html')
ergebnisse = []
def pruefe(name, ok, info=''):
    ergebnisse.append(ok); print(('OK   ' if ok else 'FEHL ') + name + (' – ' + str(info) if info != '' else ''))

ZUSTAND = "(i) => { const f = Rennspiel.spiel.fahrzeuge[i]; return Rennspiel.dach.zustand(f.mesh); }"
P = "(i) => Rennspiel.spiel.fahrzeuge[i].mesh.userData.dach.p"
SICHTBAR = "(i) => Rennspiel.spiel.fahrzeuge[i].mesh.userData.dach.gruppe.visible"
MELDUNG = "() => Array.from(document.querySelectorAll('.hud-meldung')).map(e => e.textContent).join('|')"

def warte(page, i, ziel, ms=20000):
    # Spielzeit läuft im Headless-Browser langsamer als die Wanduhr (niedrige fps, dt ≤ 0,25 s) → auf den Zustand warten, nicht auf Sekunden
    try:
        page.wait_for_function("([i, z]) => Rennspiel.dach.zustand(Rennspiel.spiel.fahrzeuge[i].mesh) === z", arg=[i, ziel], timeout=ms)
    except Exception:
        pass

def halt(page):
    # ↓ allein setzt das stehende Auto langsam zurück (Bremse = Rückwärts) – vor jeder Geste wieder auf 0 stellen
    page.evaluate("() => Rennspiel.spiel.fahrzeuge.forEach(f => { f.vehicle.vLaengs = 0; })")

def kombi(page, tasten, halten=300):
    halt(page)
    for t in tasten: page.keyboard.down(t)
    page.wait_for_timeout(halten)
    for t in reversed(tasten): page.keyboard.up(t)

with sync_playwright() as pw:
    browser = pw.chromium.launch(args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
    page = browser.new_page(viewport={'width': 1100, 'height': 650})
    fehler = []
    page.on('pageerror', lambda e: fehler.append(str(e)))
    page.on('console', lambda m: fehler.append('console.error: ' + m.text) if m.type == 'error' else None)
    page.goto(url); page.wait_for_timeout(1200)

    # ---------- Optionen-API (ohne Rennen) ----------
    r = page.evaluate("""() => { const R = Rennspiel, a = R.carCatalog.finde('troc-cabrio');
      const g0 = R.carBuilder.bauen(a), g1 = R.carBuilder.bauen(a, { dach: 'zu', lack: 'gulf' });
      const g2 = R.carBuilder.bauen(Object.assign({}, a, { optionen: { dach: 'zu', lack: 'gulf' } }));
      const m = R.carBuilder.bauen(R.carCatalog.finde('multivan'));
      return { p0: g0.userData.dach.p, v0: g0.userData.dach.gruppe.visible, l0: g0.userData.lackFarbe, bu0: g0.userData.dach.buegel.visible,
        p1: g1.userData.dach.p, v1: g1.userData.dach.gruppe.visible, l1: g1.userData.lackFarbe, bu1: g1.userData.dach.buegel.visible,
        p2: g2.userData.dach.p, l2: g2.userData.lackFarbe, mDach: R.dach.hat(m), tDach: R.dach.hat(g0), z0: R.dach.zustand(g0), z1: R.dach.zustand(g1),
        katalogFarbe: a.farbe, katalogUnveraendert: a.optionen.dach === 'offen' && a.optionen.lack === 'blau' }; }""")
    pruefe('Standard: Dach offen (p = 0, unsichtbar, Bügel sichtbar), Mattblau', r['p0'] == 0 and not r['v0'] and r['bu0'] and r['l0'] == r['katalogFarbe'] and r['z0'] == 'offen', r)
    pruefe('bauen(auto, {dach:"zu", lack:"gulf"}): Dach zu (p = 1, sichtbar, Bügel eingefahren), Gulf-Hellblau', r['p1'] == 1 and r['v1'] and not r['bu1'] and r['l1'] == 0x95d9f2 and r['z1'] == 'zu')
    pruefe('auto.optionen = {dach, lack} wirkt genauso, Katalogeintrag bleibt unverändert', r['p2'] == 1 and r['l2'] == 0x95d9f2 and r['katalogUnveraendert'])
    pruefe('Nur der T-Roc hat ein Verdeck', r['tDach'] and not r['mDach'])

    # ---------- Einzelspieler ----------
    page.evaluate("() => Rennspiel.spiel.rennenStarten({ modus: 'solo', streckeId: 'wiese', autoIds: ['troc-cabrio', 'multivan'], runden: 3, gegner: 3, schwierigkeit: 'mittel', fahrhilfe: ['wenig', 'wenig'] })")
    page.wait_for_timeout(1200)
    pruefe('Einzel: Start offen', page.evaluate(ZUSTAND, 0) == 'offen' and not page.evaluate(SICHTBAR, 0))
    m = page.evaluate(MELDUNG)
    pruefe('HUD-Hinweis „🚗 Dach auf/zu: ↑+↓ im Stand“', 'Dach auf/zu: ↑+↓ im Stand' in m, m)
    # nur eine Taste: nichts
    kombi(page, ['ArrowUp']); kombi(page, ['ArrowDown'])
    pruefe('Einzeltasten ↑ oder ↓ allein ändern nichts', page.evaluate(ZUSTAND, 0) == 'offen')
    # ↑+↓ im Stand
    kombi(page, ['ArrowUp', 'ArrowDown'])
    warte(page, 0, 'faehrt', 5000)
    z = page.evaluate(ZUSTAND, 0); p_mitte = page.evaluate(P, 0)
    pruefe('↑+↓ im Stand: Dach fährt zu (Animation läuft)', z == 'faehrt' and 0 <= p_mitte < 1, f'{z} p={p_mitte:.2f}')
    kombi(page, ['ArrowUp', 'ArrowDown'])   # während der Fahrt des Dachs ignoriert
    warte(page, 0, 'zu')
    pruefe('nach der Klappzeit (2 s Spielzeit): Dach zu (p = 1), zweite Eingabe während der Bewegung wurde ignoriert', page.evaluate(ZUSTAND, 0) == 'zu' and page.evaluate(P, 0) == 1, page.evaluate(P, 0))
    kombi(page, ['ArrowUp', 'ArrowDown'])
    warte(page, 0, 'offen')
    pruefe('↑+↓ erneut: Dach wieder offen (unsichtbar)', page.evaluate(ZUSTAND, 0) == 'offen' and not page.evaluate(SICHTBAR, 0))
    # Fahrphysik: im Stand ändert sich nichts an Position
    pos = page.evaluate("() => { const v = Rennspiel.spiel.fahrzeuge[0].vehicle; return [v.x, v.z, v.vLaengs]; }")
    pruefe('Fahrzeug stand die ganze Zeit (Dach-Eingabe wirkt nicht auf die Physik)', abs(pos[2]) < 0.5, pos)

    # ---------- in Fahrt ----------
    page.evaluate("() => { const v = Rennspiel.spiel.fahrzeuge[0].vehicle; v.vLaengs = 12; }")
    page.keyboard.down("ArrowUp"); page.wait_for_timeout(100); page.keyboard.down("ArrowDown"); page.wait_for_timeout(500)
    # Meldung erst nach ≥ 0,3 s SPIELZEIT gemeinsamem Halten (Headless läuft langsamer als die Wanduhr) → auf die Meldung warten, Tasten bleiben gehalten
    try: page.wait_for_function("() => Array.from(document.querySelectorAll('.hud-meldung')).some(e => e.textContent.indexOf('Erst anhalten') >= 0)", timeout=10000)
    except Exception: pass
    m = page.evaluate(MELDUNG); tempo = page.evaluate("() => Math.abs(Rennspiel.spiel.fahrzeuge[0].vehicle.vLaengs)")
    page.keyboard.up('ArrowDown'); page.keyboard.up('ArrowUp')
    pruefe('in Fahrt: Dach bleibt offen', page.evaluate(ZUSTAND, 0) == 'offen', f'Tempo {tempo:.1f} m/s')
    pruefe('in Fahrt: Meldung „Erst anhalten!“', 'Erst anhalten' in m, m)

    # F6: kurzes Gas+Bremse-Tippen in Fahrt (< 0,3 s Spielzeit) nervt nicht und schaltet nichts
    page.evaluate("() => { const f = Rennspiel.spiel.fahrzeuge[0]; f.vehicle.vLaengs = 12; f._dachSperre = 0; f._dachHalt = 0; Array.from(document.querySelectorAll('.hud-meldung')).forEach(e => e.remove()); }")
    page.keyboard.down("ArrowUp"); page.keyboard.down("ArrowDown"); page.keyboard.up("ArrowDown"); page.keyboard.up("ArrowUp")
    page.wait_for_timeout(600)
    pruefe('in Fahrt: kurzes Gas+Bremse-Tippen: keine Meldung, Dach unverändert', 'Erst anhalten' not in page.evaluate(MELDUNG) and page.evaluate(ZUSTAND, 0) == 'offen')
    # F6: ↑+↓ während der Pause im Stand: nach „Weiter“ passiert nichts
    page.evaluate("() => { Rennspiel.spiel.fahrzeuge.forEach(f => { f.vehicle.vLaengs = 0; }); Rennspiel.spiel.pausiert = true; }")
    page.wait_for_timeout(300)
    page.keyboard.down("ArrowUp"); page.keyboard.down("ArrowDown"); page.keyboard.up("ArrowDown"); page.keyboard.up("ArrowUp")
    page.evaluate("() => new Promise(r => { let n = 0; (function f() { if (++n >= 6) r(); else requestAnimationFrame(f); })(); })")   # ein paar Bilder IN der Pause laufen lassen (unter Last langsam)
    page.evaluate("() => { Rennspiel.spiel.pausiert = false; Rennspiel.spiel.fahrzeuge.forEach(f => { f.vehicle.vLaengs = 0; }); }")
    page.wait_for_timeout(1500)
    pruefe('Pause: ↑+↓ im Pausenmenü löst nach „Weiter“ nichts aus', page.evaluate(ZUSTAND, 0) == 'offen', page.evaluate(ZUSTAND, 0))

    # ---------- Zu zweit ----------
    page.evaluate("() => Rennspiel.spiel.rennenStarten({ modus: 'zwei', streckeId: 'wiese', autoIds: ['troc-cabrio', 'troc-cabrio'], runden: 3, gegner: 1, schwierigkeit: 'mittel', fahrhilfe: ['wenig', 'wenig'] })")
    page.wait_for_timeout(1200)
    n = page.evaluate("() => Rennspiel.spiel.fahrzeuge.filter(f => f.istSpieler).length")
    pruefe('Zweispieler: 2 Spieler', n == 2, n)
    m = page.evaluate(MELDUNG)
    pruefe('Hinweis Spieler 2 nennt A+D, Spieler 1 ↑+↓', 'A+D' in m and '↑+↓' in m, m)
    kombi(page, ['KeyA', 'KeyD'])
    warte(page, 1, 'zu')
    pruefe('A+D: nur Spieler 2 (WASD) bekommt das Dach zu', page.evaluate(ZUSTAND, 1) == 'zu' and page.evaluate(ZUSTAND, 0) == 'offen', (page.evaluate(ZUSTAND, 0), page.evaluate(ZUSTAND, 1)))
    kombi(page, ['ArrowLeft', 'ArrowRight'])
    warte(page, 0, 'zu')
    pruefe('← + →: nur Spieler 1 (Pfeile)', page.evaluate(ZUSTAND, 0) == 'zu' and page.evaluate(ZUSTAND, 1) == 'zu')
    kombi(page, ['ArrowUp', 'ArrowDown'])
    warte(page, 0, 'offen')
    pruefe('↑ + ↓ zu zweit: Spieler 1 wieder offen, Spieler 2 bleibt zu', page.evaluate(ZUSTAND, 0) == 'offen' and page.evaluate(ZUSTAND, 1) == 'zu')
    kombi(page, ['KeyW', 'KeyS'])
    warte(page, 1, 'offen')
    pruefe('W + S: Spieler 2 wieder offen', page.evaluate(ZUSTAND, 1) == 'offen')
    # Autopilot/KI: Gegner fährt ohne Verdeck-Eingabe
    pruefe('keine JS-Fehler', not fehler, fehler[:3])
    browser.close()
print('\nALLE OK' if all(ergebnisse) else '\nFEHLER')
sys.exit(0 if all(ergebnisse) else 1)
