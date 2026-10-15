#!/usr/bin/env python3
"""15.10. (v23) Festgefahren im echten Browser (Playwright, headless, ECHTE Tastendrücke in Echtzeit): python3 tests/festgefahren_browser_test.py
Auto in einen Baum gefahren (↑ gehalten) →
  1) ↓ (Bremse) gehalten → Auto fährt rückwärts vom Baum weg (≥ 3 m), danach ↑ → fährt wieder vorwärts (Gas bremst die Rückwärtsfahrt),
  2) R → Auto steht auf der Fahrbahn und fährt mit ↑ los,
  3) gesperrte Fälle zeigen im HUD, warum R nicht geht: liegengeblieben („🛻 Abschleppwagen kommt gleich – noch n s“), Polizei-Stopp („🚨 Polizei – warten oder 2× ↓ (10 🪙)“),
  4) Fokus: nach einem Klick auf das Spielfeld und auf ein HUD-Element geht R weiterhin."""
import sys, os, json
from playwright.sync_api import sync_playwright
basis = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
url = 'file://' + os.path.join(basis, 'Autorennen.html')
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
pruef = []
def pruefe(name, ok, info=''):
    pruef.append((name, ok)); print(('OK   ' if ok else 'FEHL ') + name + (' – ' + str(info) if info != '' else ''), flush=True)

STARTEN = '''(o) => { const s = Rennspiel.spiel;
  s.rennenStarten(Object.assign({ modus: 'solo', streckeId: 'wiese', welt: 'klassisch', schaden: true, gegner: 0, runden: 3,
    schwierigkeit: 'mittel', autoIds: ['passat', 'multivan'], fahrhilfe: ['aus', 'aus'], wetter: 'klar', jahreszeit: 'sommer',
    windStaerke: 0, polizei: true, tageszeit: 'tag' }, o || {}));
  window._mel = []; s.huds.forEach((h) => { const m = h.meldung.bind(h); h.meldung = (t, ms) => { window._mel.push(t); return m(t, ms); }; });
  return true; }'''
# Auto direkt vor einen Baum (Nase zum Baum, Straße im Rücken)
FALLE = '''() => { const s = Rennspiel.spiel, st = s.strecke, sp = st.spline, f = s.fahrzeuge[0], v = f.vehicle, R = Rennspiel;
  const hl = (v.daten.laenge || 4.5) / 2;
  const L = (st.pflanzenKollider || []).filter(k => k.art === 'fest');
  for (const k of L) {
    const n = st.abfrage(k.x, k.z), g = st.grenzeBei(n.s);
    if (Math.abs(n.seitenabstand) < st.breiteBei(n.s) / 2 + 3 || Math.abs(n.seitenabstand) > g - 4) continue;
    const c = sp.punktBei(n.s); let dx = c.x - k.x, dz = c.z - k.z; const d = Math.hypot(dx, dz); dx /= d; dz /= d;
    const x = k.x + dx * (k.r + hl + 0.7), z = k.z + dz * (k.r + hl + 0.7);
    const nn = st.abfrage(x, z);
    if ((st.pflanzenKollider || []).some(q => q !== k && Math.hypot(q.x - x, q.z - z) < q.r + 2.5)) continue;
    v.setzen(x, z, R.headingAus(-dx, -dz)); v.y = st.hoeheAn(x, z, nn.index); s._vorherAngleichen(f); f.index = -1;
    s.rennen.verfolgungSetzen(0, x, z, nn.s);
    const t = s.rennen.teilnehmer[0]; let best = -1, bd = 1e9; st.checkpoints.forEach((cp) => { const dd = sp.differenzS(nn.s, cp.s); if (dd >= 0 && dd < bd) { bd = dd; best = cp.nr; } }); t.letzterCheckpoint = best; t.naechsterCheckpoint = (best + 1) % st.checkpoints.length;
    window._baum = { x: k.x, z: k.z };
    return { x, z, s: nn.s, baum: window._baum };
  }
  return null; }'''
POS = '''() => { const s = Rennspiel.spiel, st = s.strecke, v = s.fahrzeuge[0].vehicle, n = st.abfrage(v.x, v.z, s.fahrzeuge[0].index);
  return { x: v.x, z: v.z, v: v.vLaengs, sa: n.seitenabstand, halbbreite: st.breiteBei(n.s) / 2, s: n.s, untergrund: v.untergrund,
           dBaum: window._baum ? Math.hypot(v.x - window._baum.x, v.z - window._baum.z) : null }; }'''

def halte(page, taste, sim_sek, maxwand=40):
    """Taste halten, bis sim_sek Sekunden SPIELZEIT vergangen sind (die Spielzeit läuft im Headless-Browser langsamer als die Wanduhr)."""
    t0 = page.evaluate('() => Rennspiel.spiel.rennen.zeit')
    page.keyboard.down(taste)
    waited = 0
    while waited < maxwand * 1000:
        page.wait_for_timeout(100); waited += 100
        if page.evaluate('() => Rennspiel.spiel.rennen.zeit') - t0 >= sim_sek: break
    ergebnis = page.evaluate(POS)
    page.keyboard.up(taste)
    return ergebnis

with sync_playwright() as p:
    browser = p.chromium.launch(args=ARGS)
    page = browser.new_page(viewport={'width': 1280, 'height': 800})
    fehler = []
    page.on('pageerror', lambda e: fehler.append(str(e)))
    page.goto(url); page.wait_for_timeout(1500)
    page.evaluate(STARTEN)
    page.wait_for_timeout(500)
    # Countdown abwarten (Echtzeit)
    for _ in range(60):
        if page.evaluate('() => Rennspiel.spiel.rennen.gasErlaubt'): break
        page.wait_for_timeout(250)
    pruefe('Rennen läuft (Echtzeit)', page.evaluate('() => Rennspiel.spiel.rennen.gasErlaubt'))
    page.evaluate('() => { Rennspiel.spiel.dynamik = null; }')

    def festfahren():
        f = page.evaluate(FALLE)
        halte(page, 'ArrowUp', 2.5)
        return f
    f = festfahren()
    pruefe('Falle gefunden', bool(f), f)
    z0 = page.evaluate(POS)
    pruefe('festgefahren (Auto nahe am Baum, kaum Tempo)', z0['dBaum'] is not None and z0['dBaum'] < 5, z0)

    # 1) Bremse halten → rückwärts
    z1 = halte(page, 'ArrowDown', 3.0)
    pruefe('↓ gehalten: Auto fährt rückwärts vom Baum weg (≥ 3 m weiter weg, Tempo rückwärts)', z1['dBaum'] - z0['dBaum'] >= 3 and z1['v'] < -1, [round(z0['dBaum'], 1), round(z1['dBaum'], 1), round(z1['v'], 1)])
    # Gas bremst die Rückwärtsfahrt, danach vorwärts
    z2 = halte(page, 'ArrowUp', 1.5)
    pruefe('danach ↑: Rückwärtsfahrt endet zügig, Auto fährt vorwärts', z2['v'] > 0.5, round(z2['v'], 1))

    # 2) R drücken (Fokus erst auf Spielfeld und HUD geklickt)
    f = festfahren()
    page.mouse.click(640, 400)
    page.evaluate("() => { const e = document.querySelector('.hud-platz'); if (e) e.click(); }")
    a = page.evaluate(POS)
    page.keyboard.press('KeyR'); page.wait_for_timeout(500)
    b = page.evaluate(POS)
    pruefe('R: Auto wird versetzt und steht auf der Fahrbahn', abs(b['sa']) <= b['halbbreite'] + 0.05 and abs(b['x'] - a['x']) + abs(b['z'] - a['z']) > 1, [a, b])
    c = halte(page, 'ArrowUp', 2.5)
    pruefe('danach ↑: fährt los (≥ 8 m, Fahrbahn)', (c['s'] - b['s']) >= 8, [round(b['s']), round(c['s'])])

    # 3) gesperrte Fälle: Meldungen
    page.evaluate('() => { window._mel.length = 0; Rennspiel.spiel.schaden._punkteSetzen(0, 1); Rennspiel.spiel.schaden.treffer(0, "hindernis", 20); }')
    page.wait_for_timeout(300)
    page.evaluate('() => { window._mel.length = 0; }')
    a = page.evaluate(POS); page.keyboard.press('KeyR'); page.wait_for_timeout(200)
    mel = page.evaluate('() => window._mel.slice()'); b = page.evaluate(POS)
    pruefe('liegengeblieben + R: Meldung „Abschleppwagen kommt gleich – noch n s“, Auto bleibt', any('Abschleppwagen kommt gleich' in m and 'noch' in m for m in mel) and abs(a['x'] - b['x']) + abs(a['z'] - b['z']) < 1.0, mel)
    page.screenshot(path=os.path.join(basis, 'tests', 'out', 'v23', 'r_gesperrt_abschlepp.png'))
    # warten bis abgeschleppt (Reparatur beginnt, Spiel läuft weiter)
    for _ in range(80):
        if not page.evaluate('() => Rennspiel.spiel.schaden.gesperrt(0)'): break
        page.wait_for_timeout(250)
    pruefe('nach dem Abschleppen nicht mehr gesperrt', not page.evaluate('() => Rennspiel.spiel.schaden.gesperrt(0)'))
    page.evaluate('() => { const s = Rennspiel.spiel; s.schaden._punkteSetzen(0, 100); const lg = s.polizei.logik, a = lg._a(0); a.stopp = 6; a.stoppK = 0; a.schonBis = -Infinity; }')
    page.evaluate('() => { window._mel.length = 0; }')
    a = page.evaluate(POS); page.keyboard.press('KeyR'); page.wait_for_timeout(200)
    mel = page.evaluate('() => window._mel.slice()'); b = page.evaluate(POS)
    pruefe('Polizei-Stopp + R: Meldung „🚨 Polizei – warten oder 2× ↓“, Auto bleibt', any('Polizei' in m and '2× ↓' in m for m in mel) and abs(a['x'] - b['x']) + abs(a['z'] - b['z']) < 1.0, mel)
    page.screenshot(path=os.path.join(basis, 'tests', 'out', 'v23', 'r_gesperrt_polizei.png'))
    pruefe('keine Seitenfehler', not fehler, fehler)
    browser.close()
n = sum(1 for _, ok in pruef if not ok)
print(f'{len(pruef)} Prüfungen, {n} Fehler')
sys.exit(1 if n else 0)
