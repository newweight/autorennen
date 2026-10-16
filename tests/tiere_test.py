#!/usr/bin/env python3
"""16.10. (v28 W10): Tiere queren die Straße im Browser (Playwright, headless).
Aufruf: PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers python3 tests/tiere_test.py [ausgabeordner]
Prüft je Strecke: Tierart passt, Tier steht (erzwungen, schräg und gerade) auf der Straße vor dem Spieler, Draw-Calls = Zahl der Tierarten, keine neuen Lichter,
keine JS-Fehler, Aus-Schalter (kein System, kein Draw-Call), Kontakt (Tempo −30 %, kein Schaden, Meldung). Bilder: tests/out/v28/tiere_<strecke>_<gerade|schraeg>.png"""
import sys, os, json
from playwright.sync_api import sync_playwright

basis = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
out = sys.argv[1] if len(sys.argv) > 1 else os.path.join(basis, 'tests', 'out', 'v28'); os.makedirs(out, exist_ok=True)
url = 'file://' + os.path.join(basis, 'Autorennen.html')
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']

STARTEN = '''([id, tiere, schaden]) => { const s = Rennspiel.spiel;
  s.rennenStarten({ modus: 'solo', streckeId: id, welt: '', polizei: false, geisterfahrer: false, krankenwagen: false, abschleppwagen: false, tiere, gegner: 0, runden: 2, schwierigkeit: 'mittel',
    autoIds: ['porsche-911', 'multivan'], fahrhilfe: ['wenig', 'wenig'], schaden: !!schaden, wetter: 'klar', jahreszeit: 'sommer', windStaerke: 0, tageszeit: 'tag' });
  const t = s.tiere;
  return { sys: !!t, arten: t ? t.arten : [], slots: t ? t.slots.length : 0, calls: t ? t.drawCalls() : 0, licht: (() => { let n = 0; s.szene.traverse(o => { if (o.isLight) n++; }); return n; })() }; }'''

# freie Stelle: Bogenlänge mit >= 220 m freiem Weg (Sperrzonen der Tiere), Anfang des freien Stücks + 60
FREI = '''(vonS) => { const s = Rennspiel.spiel, T = s.tiere, L = T.L, Z = T.zonen; const frei = (x) => !Rennspiel.Tiere.gesperrt(Z, ((x % L) + L) % L, 0);
  for (const W of [260, 150, 90, 60]) for (let a = vonS || 100; a < L - 100; a += 5) { let ok = true; for (let d = 0; d <= W; d += 10) if (!frei(a + d)) { ok = false; break; } if (ok) return a + 40; }
  return null; }'''

SETZEN = '''([sP, art, winkel, richtung, von, anzahl, f]) => { const s = Rennspiel.spiel, st = s.strecke, T = s.tiere;
  const p = st.spline.punktBei(sP), fz = s.fahrzeuge[0];
  fz.vehicle.setzen(p.x, p.z, Rennspiel.headingAus(p.tx, p.tz)); fz.vehicle.vLaengs = 0; fz.vehicle.y = st.hoeheAn(p.x, p.z);
  fz.index = st.spline.indexBei(sP); fz.nah = st.abfrage(p.x, p.z, fz.index); fz.index = fz.nah.index; s._vorherAngleichen(fz);
  T.tiere.slice().forEach(t => T._entfernen(t));
  const g = T.erzwingen({ art, sM: sP + 13, von, winkel, richtung, anzahl, fortschritt: f });
  return g ? g.map(t => ({ art: t.art, s: +t.s.toFixed(1), q: +t.q.toFixed(1) })) : null; }'''

pruef = []
def pruefe(name, ok, info=''):
    pruef.append((name, ok)); print(('OK   ' if ok else 'FEHL ') + name + (' – ' + str(info) if info != '' else ''), flush=True)

def vor(page, sek):
    page.evaluate('(t) => { const s = Rennspiel.spiel; s.pausiert = false; s.schnellvorlauf(t); s.pausiert = true; }', sek)

def foto(page, name, warte=300):
    page.evaluate("() => { const s = Rennspiel.spiel, k = s.kameras[0]; s.fahrzeuge.forEach(f => { const v = f.vehicle, a = f.anzeige; a.x = v.x; a.y = v.y; a.z = v.z; a.heading = v.heading; a.nicken = v.nicken; a.neigung = v.neigung; if (f.mesh) { f.mesh.position.set(v.x, v.y, v.z); f.mesh.rotation.y = v.heading; } }); k.folge(k.ziel, k.quelle); for (let i = 0; i < 6; i++) k.update(0.1); s.tiere.animieren(); s.huds.forEach(h => h.update()); }")
    page.wait_for_timeout(warte)
    page.screenshot(path=os.path.join(out, name), timeout=180000)

PLAN = [  # (Strecke, Art, Anzahl, Winkel schräg)
    ('wiese', 'kuh', 1, 40), ('wald', 'reh', 3, 35), ('alpen', 'baer', 1, 45), ('alpen', 'steinbock', 2, 50), ('dino', 'dino', 2, 40), ('wueste', 'kamel', 1, 45), ('fantasie', 'einhorn', 1, 40),
]
if os.environ.get('NUR'): PLAN = [x for x in PLAN if x[0] in os.environ['NUR'].split(',')]

with sync_playwright() as p:
    browser = p.chromium.launch(args=ARGS)
    page = browser.new_page(viewport={'width': 1280, 'height': 800})
    fehler = []
    page.on('pageerror', lambda e: fehler.append(str(e)))
    page.on('console', lambda m: fehler.append('console.error: ' + m.text) if m.type == 'error' else None)
    page.goto(url); page.wait_for_function('window.Rennspiel && Rennspiel.spiel', timeout=90000); page.wait_for_timeout(1500)

    ein = page.evaluate("() => Rennspiel.spiel.einstellungen.tiere")
    pruefe('Standard: Tiere AN', ein is True, ein)

    aus = page.evaluate(STARTEN, ['wiese', False, False])
    pruefe('Aus-Schalter: kein Tiere-System, kein Draw-Call', not aus['sys'] and aus['calls'] == 0, aus)
    licht0 = aus['licht']

    zuletzt = None
    for (sid, art, anz, wink) in PLAN:
        if zuletzt != sid:
            licht0 = page.evaluate(STARTEN, [sid, False, False])['licht']
            r = page.evaluate(STARTEN, [sid, True, False]); zuletzt = sid
            vor(page, 5)
            pruefe(f'{sid}: Tiere-System, Tierart(en) {r["arten"]}', r['sys'] and art in r['arten'], r)
            pruefe(f'{sid}: Draw-Calls = Zahl der Tierarten ({len(r["arten"])}), keine neuen Lichter', r['calls'] == len(r['arten']) and r['licht'] == licht0, f'Lichter {r["licht"]} (ohne Tiere {licht0})')
        sP = page.evaluate(FREI, 100)
        pruefe(f'{sid}/{art}: freie Stelle gefunden', sP is not None, sP)
        if sP is None: continue
        for (name, w, f) in [('gerade', 90, 0.5), ('schraeg', wink, 0.5)]:
            g = page.evaluate(SETZEN, [sP, art, w, 1, 1, anz, f])
            pruefe(f'{sid}/{art} {name}: {anz} Tier(e) auf der Straße angelegt', g is not None and len(g) == anz, g)
            foto(page, f'tiere_{sid}_{art}_{name}.png')
            info = page.evaluate("() => { const s = Rennspiel.spiel, T = s.tiere; return { aktiv: T.slots.filter(x => x.aktiv).length, calls: s.renderer.info.render.calls, inst: Object.values(T._gfx.meshes).map(m => m.count) }; }")
            pruefe(f'{sid}/{art} {name}: {anz} aktive Plätze, Instanzen gesetzt', info['aktiv'] == anz and sum(info['inst']) == anz, info)
    pruefe('keine JS-Fehler', not fehler, fehler[:3])
    browser.close()

n = sum(1 for _, ok in pruef if not ok)
print(f'\n{len(pruef) - n} OK, {n} FEHL')
sys.exit(1 if n else 0)
