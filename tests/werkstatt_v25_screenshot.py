#!/usr/bin/env python3
"""15.10. (v25) Werkstatt auf jeder Strecke, 35 m lange Abstellfläche – echtes Spiel im Browser (Playwright, headless).
Aufruf: python3 tests/werkstatt_v25_screenshot.py [ausgabeordner] [streckenId[:variante] ...]   (Standard tests/out/v25_werkstatt, alle Strecken)
Bilder je Strecke:  <id>[_xl]_1_voraus (Fahrersicht, Schild + Zufahrt), <id>[_xl]_2_seite (Kamera quer über die Straße: ganze Zone),
                    <id>[_xl]_3_oben (von oben), <id>[_xl]_4_heilt (Auto in der vordersten Box, HUD)  – Mega zusätzlich _w2_ (zweite Werkstatt)
Prüft nebenbei: Werkstatt in der Szene, Länge ≥ 30 m, kein JS-Fehler, Schaden aus → keine Werkstatt (Standard), nurMitSchaden=false → Kulisse ohne Heilung."""
import sys, os
from playwright.sync_api import sync_playwright

basis = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
args = [a for a in sys.argv[1:]]
aus = os.path.join(basis, 'tests', 'out', 'v25_werkstatt')
if args and not (':' in args[0] or args[0] in ('wiese', 'wald', 'wueste', 'fantasie', 'dino', 'alpen', 'mega')):
    aus = args.pop(0)
os.makedirs(aus, exist_ok=True)
url = 'file://' + os.path.join(basis, 'Autorennen.html')
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
FAELLE = [('wiese', ''), ('wald', ''), ('wueste', ''), ('fantasie', ''), ('dino', ''), ('alpen', ''), ('mega', ''),
          ('wiese', 'xl'), ('wald', 'xl'), ('alpen', 'xl')]
if args:
    FAELLE = [(a.split(':')[0], a.split(':')[1] if ':' in a else '') for a in args]
WELT = {'fantasie': 'fantasie'}

START = '''([strecke, variante, welt, schaden, nurMit]) => { const s = Rennspiel.spiel;
  if (nurMit === false) Rennspiel.config.werkstatt.nurMitSchaden = false;
  s.rennenStarten({ modus: 'solo', streckeId: strecke, variante, welt, schaden, gegner: 0, runden: 5, schwierigkeit: 'mittel',
    autoIds: ['troc-cabrio', 'multivan'], fahrhilfe: ['aus', 'aus'] });
  s.schnellvorlauf(6);
  if (!s.laeuft) s.start();
  s.pausiert = true;
  s._gas = [0, 0]; s.input.steuerung = (nr) => ({ gas: s._gas[nr] || 0, bremse: 0, lenkung: 0 });
  const w = s.werkstatt;
  const teile = w ? (w.teile || [w]) : [];
  return { an: !!(s.schaden && s.schaden.an), werkstatt: !!w, laenge: Math.round(s.strecke.spline.laenge),
    plaetze: teile.map(t => ({ s: Math.round(t.platz.s), seite: t.platz.seite, laenge: t.platz.laenge, stufe: t.platz.stufe, boxen: t.platz.boxen })) }; }'''
SCHRITTE = '''([sek]) => { const s = Rennspiel.spiel; for (let n = 0; n < Math.round(sek * 60); n++) s.physikSchritt(1 / 60);
  s.fahrzeuge.forEach((g) => { const d = g.anzeige, w = g.vehicle; d.x = w.x; d.y = w.y; d.z = w.z; d.heading = w.heading; d.nicken = w.nicken; d.neigung = w.neigung; });
  s.kameras.forEach(k => { for (let j = 0; j < 40; j++) k.update(1 / 60); }); s.huds.forEach(h => h.update());
  return s.fahrzeuge.map((f, i) => ({ i, p: s.schaden ? s.schaden.zustand(i).prozent : 100 })); }'''
STOPP = '''() => { const s = Rennspiel.spiel; s.uhr.rest = 0; s.pausiert = true; document.querySelectorAll('.hud-banner').forEach(b => { b.className = 'hud-banner'; }); }'''
STELLEN = '''([i, s0, q]) => { const g = Rennspiel.spiel, st = g.strecke, p = st.spline.punktBei(s0), f = g.fahrzeuge[i], v = f.vehicle;
  const x = p.x + p.nx * q, z = p.z + p.nz * q;
  v.setzen(x, z, Math.atan2(-p.tx, -p.tz)); v.vLaengs = 0; v.vQuer = 0; v.y = st.hoeheAn(x, z); f.index = -1; f.nah = st.abfrage(x, z);
  g._vorherAngleichen(f); return true; }'''
HUD = '''(klasse) => Array.from(document.querySelectorAll('.' + klasse)).map(e => ({ text: e.textContent, an: getComputedStyle(e).display !== 'none' }))'''
# Kamera frei: Position relativ zur Werkstatt k (Bogenlänge-Versatz ds, Querabstand q zur Werkstattseite, Höhe über Boden), Blick auf die Flächenmitte
KAMERA = '''([k, ds, q, hoch, blickDs]) => { const g = Rennspiel.spiel, w = Rennspiel.spiel.werkstatt, t = (w.teile || [w])[k], P = t.platz;
  const a = t.welt(P.s + ds, q), c = t.welt(P.s + (blickDs || 0), (P.qA + P.qB) / 2), kam = g.kameras[0];
  g._freieKamera = true; kam.update = function () {};
  kam.kamera.position.set(a.x, g.strecke.hoeheAn(a.x, a.z) + hoch, a.z); kam.kamera.lookAt(c.x, g.strecke.hoeheAn(c.x, c.z) + 0.5, c.z); return true; }'''

fehler, pr, nichtGeladen = [], [], set()
def pruefe(name, ok, info=''):
    pr.append((name, bool(ok), info)); print(('OK   ' if ok else 'FEHL ') + name + ('  (' + str(info) + ')' if info != '' else ''))

def neue_seite(browser):
    page = browser.new_page(viewport={'width': 1280, 'height': 800})
    page.on('pageerror', lambda e: fehler.append(str(e)))
    page.on('requestfailed', lambda r: nichtGeladen.add(r.url.replace('file://' + basis, '')))
    page.on('console', lambda m: fehler.append('console.error: ' + m.text) if m.type == 'error' and 'Failed to load resource' not in m.text else None)
    page.goto(url); page.wait_for_timeout(1200)
    return page

def bild(page, name, warte=450):
    page.evaluate(STOPP); page.wait_for_timeout(warte)
    page.screenshot(path=os.path.join(aus, name + '.png'))

with sync_playwright() as pw:
    browser = pw.chromium.launch(args=ARGS)
    # ---- Standard: Schaden aus → keine Werkstatt; nurMitSchaden=false → Kulisse ohne Heilung ----
    page = neue_seite(browser)
    info = page.evaluate(START, ['wiese', '', 'klassisch', False, None])
    pruefe('Schaden aus (Standard nurMitSchaden = true): keine Werkstatt', not info['werkstatt'], info)
    page.close()
    page = neue_seite(browser)
    info = page.evaluate(START, ['wiese', '', 'klassisch', False, False])
    pruefe('nurMitSchaden = false + Schaden aus: Werkstatt steht als Kulisse', info['werkstatt'], info)
    P = page.evaluate('() => { const P = Rennspiel.spiel.werkstatt.platz; return { s: P.s, seite: P.seite }; }')
    box = page.evaluate('() => Rennspiel.spiel.werkstatt.boxMitte(2)')
    page.evaluate(STELLEN, [0, box['s'], box['qs'] * P['seite']])
    r = page.evaluate(SCHRITTE, [1.0])
    pruefe('… ohne Schaden-System keine Heilung, kein Absturz (Wert 100 %)', r[0]['p'] == 100)
    bild(page, 'kulisse_ohne_schaden')
    page.close()

    for sid, var in FAELLE:
        tag = sid + ('_' + var if var else '')
        page = neue_seite(browser)
        info = page.evaluate(START, [sid, var, WELT.get(sid, 'klassisch'), True, None])
        pruefe('%s: Werkstatt in der Szene, %d Platz/Plätze, Länge %s m' % (tag, len(info['plaetze']), [p['laenge'] for p in info['plaetze']]),
               info['werkstatt'] and info['plaetze'] and all(p['laenge'] >= 30 for p in info['plaetze']), info)
        szene = page.evaluate('() => { const n = []; Rennspiel.spiel.szene.traverse(o => { if (o.name === "Werkstatt") n.push(o.name); }); return n.length; }')
        pruefe('%s: Gruppe „Werkstatt“ in der Szene (%d)' % (tag, szene), szene == len(info['plaetze']))
        for k, pl in enumerate(info['plaetze']):
            suf = '' if len(info['plaetze']) == 1 else '_w%d' % (k + 1)
            P = pl
            if k > 0:
                # zweite Werkstatt: „einmal je Runde“ gilt für beide zusammen → nach dem Besuch der ersten zeigt sie „schon benutzt“ (Absicht), dann Liste leeren
                page.evaluate(STELLEN, [0, P['s'], 2.0]); page.evaluate(SCHRITTE, [0.2])
                box = page.evaluate('([k]) => { const w = Rennspiel.spiel.werkstatt; return w.teile[k].boxMitte(1); }', [k])
                page.evaluate(STELLEN, [0, box['s'], box['qs'] * P['seite']]); page.evaluate(SCHRITTE, [0.5])
                hb = page.evaluate(HUD, 'hud-werkstatt')
                pruefe('%s%s: nach Besuch der 1. Werkstatt gilt „benutzt“ auch hier (gemeinsam je Runde)' % (tag, suf), hb and 'schon benutzt' in hb[0]['text'], hb)
                page.evaluate('() => { Rennspiel.spiel.werkstatt.benutzt.length = 0; }')
            # Spieler 55 m vor der Fläche (Fahrersicht), mit Schaden 40 %
            page.evaluate('() => { const sc = Rennspiel.spiel.schaden; sc.z[0].abkling = 0; sc._punkteSetzen(0, 40); }')
            page.evaluate(STELLEN, [0, P['s'] - P['laenge'] / 2 - 45, 2.0])
            page.evaluate(SCHRITTE, [0.4])
            hud = page.evaluate(HUD, 'hud-werkstatt')
            bild(page, '%s%s_1_voraus' % (tag, suf))
            # quer über die Straße, schräg: ganze Zone im Bild
            page.evaluate('() => { const sc = Rennspiel.spiel.schaden; sc._punkteSetzen(0, 100); }')      # HUD-Hinweis „voraus“ aus (verdeckt sonst das Bild)
            page.evaluate(KAMERA, [k, -16, -30, 10, 0])
            bild(page, '%s%s_2_seite' % (tag, suf))
            page.evaluate(KAMERA, [k, -3, 6, 80, 0])
            bild(page, '%s%s_3_oben' % (tag, suf))
            page.evaluate('() => { const sc = Rennspiel.spiel.schaden; sc.z[0].abkling = 0; sc._punkteSetzen(0, 40); }')
            # Auto in der vordersten Box, 1 s stehen
            page.evaluate('() => { Rennspiel.spiel._freieKamera = false; }')
            box = page.evaluate('([k]) => { const w = Rennspiel.spiel.werkstatt; return (w.teile || [w])[k].boxMitte(((w.teile || [w])[k].platz.boxen || 2) - 1); }', [k])
            page.evaluate(STELLEN, [0, box['s'], box['qs'] * P['seite']])
            r = page.evaluate(SCHRITTE, [1.0])[0]
            hud2 = page.evaluate(HUD, 'hud-werkstatt')
            pruefe('%s%s: vorderste Box heilt (40 → ≈ 55 %%), HUD zeigt Werkstatt' % (tag, suf), 53 <= r['p'] <= 56 and hud2 and hud2[0]['an'], [r['p'], hud2])
            bild(page, '%s%s_4_heilt' % (tag, suf))
        page.close()
    browser.close()

pruefe('keine JS-Fehler', not fehler, fehler[:3])
if nichtGeladen: print('Hinweis: Ressourcen nicht geladen (nicht Werkstatt):', sorted(nichtGeladen)[:6])
n_fehl = sum(1 for _, ok, _ in pr if not ok)
print('\n%d Prüfungen, %d FEHL' % (len(pr), n_fehl))
sys.exit(1 if n_fehl else 0)
