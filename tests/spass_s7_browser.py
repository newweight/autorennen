#!/usr/bin/env python3
"""S7 Browser-Test Strecken-Editor (Playwright, Headless/SwiftShader): python3 tests/spass_s7_browser.py [--auto] [--moto] [--ausgabe bilder_s7]
Je Spiel: Menü → Karte „✏️ Strecke malen“ → mit der Maus eine Linie malen (wackelig, mit Lücke) → Strecke wird fertig → Welt wählen → Teile per Antippen setzen
(Schanze, Trampolin, Kanone, Teleport-Tore, Goldstücke, Looping, Magnet-Röhre, Schlucht, Hügel, Moto: Feuerring) → Radierer + Rückgängig → Probefahren (Rennen startet mit
der Strecke, Elemente da, Fahrzeug fährt) → zurück in den Editor → Speichern (KI-Testrunde, Vorschaubild, Sticker) → Streckenwahl: „Meine Strecken“ → Teilen (Code) → Import in frischer Seite.
Zusätzlich: Acht (Brücke), Handy hochkant 390×844 und Mac 1280×800 (Bilder nach tests/bilder_s7/), Fehlerhinweis bei offener Linie, Konsole ohne Fehler."""
import os, sys, json, math
from playwright.sync_api import sync_playwright

BASIS = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(BASIS, 'tests', sys.argv[sys.argv.index('--ausgabe') + 1] if '--ausgabe' in sys.argv else 'bilder_s7'); os.makedirs(OUT, exist_ok=True)
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
SPIELE = [s for s, f in (('Autorennen', '--auto'), ('Motorrad', '--moto')) if not (('--auto' in sys.argv or '--moto' in sys.argv) and f not in sys.argv)]
ok = fehl = 0
def pruefe(name, gut, info=''):
    global ok, fehl
    print(('OK   ' if gut else 'FEHL ') + name + (('  (' + str(info) + ')') if info != '' else ''), flush=True)
    if gut: ok += 1
    else: fehl += 1

def malen_punkte(cx, cy, rx, ry, n=90, wackel=6, luecke=0.04, start=0.3):
    pts = []
    for i in range(n):
        t = start + (i / n) * 2 * math.pi * (1 - luecke)
        r = 1 + 0.18 * math.sin(2 * t + 1) + 0.1 * math.sin(3 * t)
        pts.append((cx + rx * r * math.cos(t) + ((i * 7919) % 13 - 6) * wackel / 6, cy + ry * r * math.sin(t) + ((i * 104729) % 11 - 5) * wackel / 6))
    return pts
def acht_punkte(cx, cy, rx, ry, n=120):
    return [(cx + rx * math.sin(i / n * 2 * math.pi), cy + ry * math.sin(2 * i / n * 2 * math.pi)) for i in range(n + 1)]

def neue_seite(p, spiel, w, h, touch=False):
    b = p.chromium.launch(args=ARGS)
    ctx = b.new_context(viewport={'width': w, 'height': h}, has_touch=touch, is_mobile=touch, device_scale_factor=1)
    pg = ctx.new_page(); fehler = []
    pg.on('pageerror', lambda e: fehler.append('pageerror: ' + str(e)))
    pg.on('console', lambda m: fehler.append('console.error: ' + m.text) if m.type == 'error' and 'GPU stall' not in m.text and ('WebGL' not in m.text or 'Shader' in m.text or 'Program' in m.text) and 'favicon' not in m.text else None)
    pg.goto('file://' + os.path.join(BASIS, spiel + '.html')); pg.wait_for_function('window.Rennspiel && Rennspiel.spiel'); pg.wait_for_timeout(1000)
    return b, ctx, pg, fehler

def leinwand(pg):
    return pg.evaluate("() => { const r = document.querySelector('#e7 canvas').getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; }")
def strich(pg, pts, mit_ende=True):
    pg.mouse.move(*pts[0]); pg.mouse.down()
    for q in pts[1:]: pg.mouse.move(*q)
    if mit_ende: pg.mouse.up()
def pixel_fuer_s(pg, s):
    return pg.evaluate("""(s) => { const S = Rennspiel.EditorUI.zustand(), sp = Rennspiel.Editor.geometrie(S.d), p = sp.punktBei(s), a = S.ansicht,
      r = document.querySelector('#e7 canvas').getBoundingClientRect(); return [r.left + a.cw / 2 + (p.x - a.ox) * a.sx, r.top + a.ch / 2 + (p.z - a.oz) * a.sx]; }""", s)
def tippe_auf_s(pg, s, art=None):
    if art: pg.click('.e7-t[data-t="%s"]' % art)
    x, y = pixel_fuer_s(pg, s)
    pg.mouse.click(x, y); pg.wait_for_timeout(120)
def gerade_stellen(pg, art):
    """Bogenlängen, an denen das Teil laut Regelwerk passt (Raster 30 m)."""
    return pg.evaluate("""(art) => { const S = Rennspiel.EditorUI.zustand(), E = Rennspiel.Editor, out = []; for (let s = 150; s < E.geometrie(S.d).laenge - 150; s += 30) { const r = E.stelle(S.d, art, s); if (r.ok && !r.verschoben && out.indexOf(r.s) < 0) out.push(r.s); } return out; }""", art)

def lauf_spiel(p, spiel):
    moto = spiel == 'Motorrad'
    kz = 'moto' if moto else 'auto'
    b, ctx, pg, fehler = neue_seite(p, spiel, 1280, 800)
    # ---- Menü: Karte „Strecke malen“ im Modus-Schritt
    karte = pg.query_selector('.karte[data-a="editor:weiter"]')
    pruefe(f'{spiel}: Menü hat die Karte „✏️ Strecke malen“ (Schritt Modus)', karte is not None)
    pg.evaluate("localStorage.clear()")
    pg.screenshot(path=f'{OUT}/{kz}_menue_modus_1280.png')
    karte.click(); pg.wait_for_selector('#e7', timeout=3000); pg.wait_for_timeout(300)
    pruefe(f'{spiel}: Editor öffnet (Vollbild über dem Menü)', pg.evaluate("Rennspiel.EditorUI.offen()"))
    pg.screenshot(path=f'{OUT}/{kz}_editor_leer_1280.png')
    c = leinwand(pg)
    # ---- offene Linie → freundlicher Hinweis
    halb = malen_punkte(c['x'] + c['w'] / 2, c['y'] + c['h'] / 2, c['w'] * 0.22, c['h'] * 0.3)[:40]
    strich(pg, halb); pg.wait_for_timeout(200)
    txt = pg.evaluate("document.querySelector('.e7-blase').textContent"); fz = pg.evaluate("Rennspiel.EditorUI.zustand().ort")
    pruefe(f'{spiel}: offene Linie → freundlicher Hinweis mit Fehlerort (kein Absturz)', 'geschlossen' in txt and fz is not None and pg.evaluate("Rennspiel.EditorUI.zustand().d") is None, txt)
    pg.screenshot(path=f'{OUT}/{kz}_editor_hinweis_offen_1280.png')
    # ---- richtige Linie malen
    pts = malen_punkte(c['x'] + c['w'] / 2, c['y'] + c['h'] / 2, c['w'] * 0.3, c['h'] * 0.32)
    strich(pg, pts); pg.wait_for_timeout(500)
    d = pg.evaluate("(() => { const S = Rennspiel.EditorUI.zustand(); return S.d ? { n: S.d.pkt.length, L: Math.round(Rennspiel.Editor.geometrie(S.d).laenge), welt: S.d.welt } : null; })()")
    pruefe(f'{spiel}: Linie gemalt → Strecke fertig (glatt, geschlossen)', d is not None and 900 < d['L'] < 6000, json.dumps(d))
    pg.screenshot(path=f'{OUT}/{kz}_editor_gemalt_1280.png')
    # ---- Welt wählen
    pg.click('.e7-chip[data-w="mond"]'); pg.wait_for_timeout(100)
    pruefe(f'{spiel}: Welt wählen (Mond)', pg.evaluate("Rennspiel.EditorUI.zustand().d.welt") == 'mond')
    pg.click('.e7-chip[data-w="wiese"]'); pg.wait_for_timeout(100)
    # ---- Teile per Antippen
    gesetzt = {}
    arten = ['schanze', 'trampolin', 'kanone', 'tor', 'magnet', 'schlucht', 'looping', 'gold', 'gold'] + (['ring'] if moto else [])
    for a in arten:
        st = gerade_stellen(pg, a)
        if not st: gesetzt[a] = gesetzt.get(a, 0); continue
        # vorderste passende Stelle nehmen, die nicht schon belegt ist
        n0 = pg.evaluate("Rennspiel.EditorUI.zustand().d.el.length")
        tippe_auf_s(pg, st[len(st) // 2], a)
        n1 = pg.evaluate("Rennspiel.EditorUI.zustand().d.el.length")
        if n1 > n0: gesetzt[a] = gesetzt.get(a, 0) + 1
    gesetzt_n = pg.evaluate("Rennspiel.EditorUI.zustand().d.el.length")
    pruefe(f'{spiel}: Teile per Antippen gesetzt ({gesetzt_n}: {json.dumps(gesetzt)})', gesetzt_n >= 5 and all(gesetzt.get(a, 0) >= 1 for a in ['schanze', 'trampolin', 'gold']), json.dumps(gesetzt))
    # Hügel per Schieber
    pg.click('.e7-t[data-t="huegel"]')
    pg.evaluate("(() => { const i = document.querySelector('.e7-schieber input'); i.value = 6; i.dispatchEvent(new Event('input', { bubbles: true })); })()")
    l = pg.evaluate("Rennspiel.Editor.geometrie(Rennspiel.EditorUI.zustand().d).laenge")
    tippe_auf_s(pg, l * 0.45); tippe_auf_s(pg, l * 0.8)
    pruefe(f'{spiel}: Hügel per Schieber gesetzt', pg.evaluate("Rennspiel.EditorUI.zustand().d.hoehen.length") >= 1, pg.evaluate("JSON.stringify(Rennspiel.EditorUI.zustand().d.hoehen)"))
    pg.click('.e7-t[data-t="huegel"]'); pg.wait_for_timeout(150)
    pg.screenshot(path=f'{OUT}/{kz}_editor_gebaut_1280.png')
    # ---- Radierer + Rückgängig
    n0 = pg.evaluate("Rennspiel.EditorUI.zustand().d.el.length")
    s_sch = pg.evaluate("Rennspiel.EditorUI.zustand().d.el.find(e => e.a === 'schanze').s")
    pg.click('.e7-t[data-t="radierer"]')
    x, y = pixel_fuer_s(pg, s_sch + 5); pg.mouse.click(x, y); pg.wait_for_timeout(120)
    n1 = pg.evaluate("Rennspiel.EditorUI.zustand().d.el.length")
    pg.click('.e7-t[data-t="radierer"]')
    pg.click('.e7-k[data-b="zurueck"]'); pg.wait_for_timeout(120)
    n2 = pg.evaluate("Rennspiel.EditorUI.zustand().d.el.length")
    pruefe(f'{spiel}: Radiergummi löscht ein Teil, „Zurück“ holt es wieder', n1 == n0 - 1 and n2 == n0, f'{n0} → {n1} → {n2}')
    # ---- Setzen an unpassender Stelle → freundlicher Hinweis, nichts passiert
    nn = pg.evaluate("Rennspiel.EditorUI.zustand().d.el.length")
    tippe_auf_s(pg, 20, 'schanze')
    txt = pg.evaluate("document.querySelector('.e7-blase').textContent"); nn2 = pg.evaluate("Rennspiel.EditorUI.zustand().d.el.length")
    s_neu = pg.evaluate("Math.min(...Rennspiel.EditorUI.zustand().d.el.filter(e => e.a === 'schanze').map(e => e.s))")
    pruefe(f'{spiel}: Teil am Start: abgelehnt oder freundlich auf passende Stelle geschoben (nie in der Start-Gerade)', (nn2 == nn or s_neu >= 100) and len(txt) > 5, f'{txt} s={s_neu}')
    if nn2 > nn: pg.click('.e7-k[data-b="zurueck"]')
    pg.click('.e7-t[data-t="schanze"]')
    # ---- Probefahren (allein)
    elemente = pg.evaluate("Rennspiel.EditorUI.zustand().d.el.map(e => e.a)")
    name = 'Testbahn ' + kz
    pg.fill('.e7-name', name)
    pg.click('.e7-k[data-b="probe"]'); pg.wait_for_timeout(200)
    pg.screenshot(path=f'{OUT}/{kz}_dialog_probefahren_1280.png')
    pg.click('.e7-dlg .e7-k:has-text("Mit Computer-Autos")')
    pg.wait_for_function("Rennspiel.spiel.zustand === 'rennen'", timeout=20000)
    info = pg.evaluate("""() => { const s = Rennspiel.spiel, st = s.strecke; return { id: st.id, eigen: !!st.katalog.eigen, laenge: Math.round(st.spline.laenge), spass: st.spass ? st.spass.liste.length : -1, tore: st.spass ? st.spass.tore.length : -1,
      zauber: st.spass && st.spass.zauber ? st.spass.zauber.magnet.length + st.spass.zauber.schluchten.length : -1, schanzen: st.schanzen.length, loopings: st.loopings.length, autos: s.fahrzeuge.length, editorOffen: Rennspiel.EditorUI.offen() }; }""")
    erwartet_sp = sum(1 for e in elemente if e in ('trampolin', 'kanone')); erwartet_tore = sum(1 for e in elemente if e == 'tor')
    erwartet_zau = sum(1 for e in elemente if e in ('magnet', 'schlucht')); erwartet_sch = sum(1 for e in elemente if e in ('schanze', 'ring')); erwartet_lo = sum(1 for e in elemente if e == 'looping')
    pruefe(f'{spiel}: Probefahren startet das Rennen auf der gemalten Strecke (Editor zu, 4 Autos)', info['eigen'] and info['id'].startswith('eigen-') and not info['editorOffen'] and info['autos'] == 4, json.dumps(info))
    pruefe(f'{spiel}: im Rennen: genau die gesetzten Elemente (Trampolin/Kanone {erwartet_sp}, Tore {erwartet_tore}, Magnet/Schlucht {erwartet_zau}, Schanzen {erwartet_sch}, Loopings {erwartet_lo})',
           info['spass'] == erwartet_sp and info['tore'] == erwartet_tore and info['zauber'] == erwartet_zau and info['schanzen'] == erwartet_sch and info['loopings'] == erwartet_lo, json.dumps(info))
    # Zeit vorspulen (wie s5_browser): Countdown, dann ~12 s Fahrt
    pg.evaluate("""() => { const s = Rennspiel.spiel, z0 = s.zeichnen; s.zeichnen = function () {}; let g = 0; window.__t = performance.now(); const echt = performance.now.bind(performance); void echt;
      s.uhr.letzte = window.__t; s.uhr.rest = 0; while ((s.zustand !== 'rennen' || !s.rennen.gasErlaubt) && g++ < 1500) { window.__t += 1000 / 60; s._frameRumpf(window.__t); } s.zeichnen = z0; }""")
    fahrt = pg.evaluate("""() => { const s = Rennspiel.spiel, v0 = s.fahrzeuge.find(f => f.istSpieler), z0 = s.zeichnen; s.zeichnen = function () {}; const x0 = v0.vehicle.x, zz0 = v0.vehicle.z;
      for (let i = 0; i < 60 * 12; i++) { window.__t += 1000 / 60; if (i % 30 === 0) s.autopilot(0, true); s._frameRumpf(window.__t); } s.zeichnen = z0;
      return { weit: Math.round(Math.hypot(v0.vehicle.x - x0, v0.vehicle.z - zz0)), tempo: Math.round(v0.vehicle.vLaengs * 3.6), ki: s.fahrzeuge.filter(f => !f.istSpieler).map(f => Math.round(f.vehicle.vLaengs * 3.6)) }; }""")
    pruefe(f'{spiel}: Fahrzeug fährt auf der eigenen Strecke, Computer-Autos auch', fahrt['weit'] > 60 and any(t > 20 for t in fahrt['ki']), json.dumps(fahrt))
    pg.evaluate("Rennspiel.spiel.zeichnen && Rennspiel.spiel.zeichnen()"); pg.wait_for_timeout(300)
    pg.screenshot(path=f'{OUT}/{kz}_rennen_probefahrt_1280.png')
    # ---- zurück ins Hauptmenü → Editor wieder offen mit demselben Entwurf
    pg.evaluate("Rennspiel.spiel.zumMenue(true)"); pg.wait_for_timeout(500)
    zur = pg.evaluate("({ offen: Rennspiel.EditorUI.offen(), n: Rennspiel.EditorUI.offen() ? Rennspiel.EditorUI.zustand().d.el.length : -1, name: Rennspiel.EditorUI.offen() ? Rennspiel.EditorUI.zustand().d.name : '' })")
    pruefe(f'{spiel}: Hauptmenü nach dem Probefahren führt zurück in den Editor (Entwurf unverändert)', zur['offen'] and zur['n'] == len(elemente) and zur['name'] == name, json.dumps(zur))
    # ---- Speichern: Name, KI-Testrunde, Vorschau, Sticker
    pg.click('.e7-k[data-b="speichern"]'); pg.wait_for_selector('#e7-sname'); pg.wait_for_timeout(100)
    pg.screenshot(path=f'{OUT}/{kz}_dialog_speichern_1280.png')
    pg.click('.e7-dlg .e7-k:has-text("Speichern")')
    pg.wait_for_function("Rennspiel.Editor.Speicher.liste().length >= 1 || !!document.querySelector('.e7-dlg h3') && /schaffen die Computer/.test(document.querySelector('.e7-dlg h3').textContent)", timeout=20000)
    if pg.evaluate("Rennspiel.Editor.Speicher.liste().length") == 0:
        pg.click('.e7-dlg .e7-k:has-text("Trotzdem")'); pg.wait_for_timeout(300)
    pg.wait_for_timeout(400)
    sp = pg.evaluate("""() => { const l = Rennspiel.Editor.Speicher.liste(); return { n: l.length, name: l[0] && l[0].daten.name, vorschau: l[0] ? l[0].vorschau.length : 0, ki: l[0] && l[0].daten.ki, katalog: Rennspiel.trackCatalog.some(t => t.eigen), sticker: Rennspiel.SpassSticker.hat('%s', 'streckeEigen') }; }""" % ('motorrad' if moto else 'auto'))
    pruefe(f'{spiel}: Speichern → in „Meine Strecken“ (Name, Vorschaubild, KI-Testrunde ok, Sticker „Erste eigene Strecke“)', sp['n'] == 1 and sp['name'] == name and sp['vorschau'] > 1500 and sp['ki'] and sp['ki'].get('ok') is True and sp['katalog'] and sp['sticker'], json.dumps(sp))
    pg.screenshot(path=f'{OUT}/{kz}_editor_gespeichert_1280.png')
    # ---- Teilen: Code
    pg.click('.e7-k[data-b="teilen"]'); pg.wait_for_selector('#e7-code'); code = pg.evaluate("document.querySelector('#e7-code').value")
    pruefe(f'{spiel}: Teilen zeigt Code (STRECKE1.…)', code.startswith('STRECKE1.') and len(code) > 500, len(code))
    pg.screenshot(path=f'{OUT}/{kz}_dialog_teilen_1280.png')
    pg.click('.e7-dlg .e7-k:has-text("Schließen")')
    # ---- Editor schließen → Streckenwahl: „Meine Strecken“
    pg.click('.e7-x'); pg.wait_for_timeout(500)
    pg.evaluate("Rennspiel.spiel.menue.schritt = 1; Rennspiel.spiel.menue.fokus = 0; Rennspiel.spiel.menue.zeichnen()"); pg.wait_for_timeout(500)
    kopf = pg.evaluate("(document.querySelector('.m-meine-kopf') || {}).textContent")
    eigene = pg.evaluate("[...document.querySelectorAll('.karte.strecke[data-a^=\"strecke:eigen-\"]')].map(c => ({ text: c.querySelector('.karten-name').textContent, bild: (c.querySelector('.strecken-bild').style.backgroundImage || '').slice(0, 20) }))")
    pruefe(f'{spiel}: Streckenwahl: „✏️ Meine Strecken“ mit der gespeicherten Strecke und Vorschaubild', kopf == '✏️ Meine Strecken' and len(eigene) == 1 and name in eigene[0]['text'] and eigene[0]['bild'].startswith('url('), json.dumps(eigene, ensure_ascii=False))
    pg.screenshot(path=f'{OUT}/{kz}_menue_strecken_1280.png')
    pg.click('.karte.strecke[data-a^="strecke:eigen-"]'); pg.wait_for_timeout(300)
    gew = pg.evaluate("Rennspiel.spiel.menue.e.streckeId")
    pruefe(f'{spiel}: eigene Strecke in der Streckenwahl anwählbar', gew.startswith('eigen-'), gew)
    # ---- normales Rennen aus dem Menü (nicht Probefahren): Solo mit der eigenen Strecke
    pg.evaluate("Rennspiel.spiel.rennenStarten({ modus: 'solo', gegner: 2, runden: 1 })"); pg.wait_for_timeout(500)
    pruefe(f'{spiel}: Rennen aus der Streckenwahl startet mit der eigenen Strecke', pg.evaluate("Rennspiel.spiel.zustand === 'rennen' && Rennspiel.spiel.strecke.id") == gew)
    pg.evaluate("Rennspiel.spiel.zumMenue(true)"); pg.wait_for_timeout(300)
    # ---- Seite neu laden: Strecke noch da; Code importieren in frischer Seite
    pg.reload(); pg.wait_for_function('window.Rennspiel && Rennspiel.spiel'); pg.wait_for_timeout(800)
    da = pg.evaluate("Rennspiel.trackCatalog.filter(t => t.eigen).map(t => t.name)")
    pruefe(f'{spiel}: nach dem Neuladen steht die Strecke im Katalog', da == [name], json.dumps(da, ensure_ascii=False))
    pg.evaluate("localStorage.clear()")
    b2, ctx2, pg2, fehler2 = neue_seite(p, spiel, 1280, 800)
    pg2.evaluate("Rennspiel.spiel.menue.aktion('editor:weiter')"); pg2.wait_for_selector('#e7'); pg2.click('.e7-k[data-b="import"]'); pg2.wait_for_selector('#e7-imp')
    pg2.fill('#e7-imp', 'Hier meine Strecke:\n' + code + '\nViel Spaß!'); pg2.click('.e7-dlg .e7-k:has-text("Laden")'); pg2.wait_for_timeout(500)
    imp = pg2.evaluate("(() => { const S = Rennspiel.EditorUI.zustand(); return S.d ? { name: S.d.name, el: S.d.el.length, L: Math.round(Rennspiel.Editor.geometrie(S.d).laenge) } : null; })()")
    pruefe(f'{spiel}: Import des Codes in frischer Seite (anderes Gerät): gleiche Strecke', imp is not None and imp['name'] == name and imp['el'] == len(elemente) and imp['L'] == d['L'], json.dumps(imp, ensure_ascii=False))
    pg2.click('.e7-t[data-t="schanze"]') if False else None
    pg2.screenshot(path=f'{OUT}/{kz}_editor_importiert_1280.png')
    pruefe(f'{spiel}: Konsole (Seite 2) ohne Fehler', not fehler2, fehler2[:3])
    b2.close()
    pruefe(f'{spiel}: Konsole ohne Fehler (ganzer Ablauf)', not fehler, fehler[:3])
    b.close()

def lauf_acht(p, spiel):
    kz = 'moto' if spiel == 'Motorrad' else 'auto'
    b, ctx, pg, fehler = neue_seite(p, spiel, 1280, 800)
    pg.evaluate("localStorage.clear()"); pg.evaluate("Rennspiel.spiel.menue.aktion('editor:neu')"); pg.wait_for_selector('#e7'); pg.wait_for_timeout(200)
    c = leinwand(pg); strich(pg, acht_punkte(c['x'] + c['w'] / 2, c['y'] + c['h'] / 2, c['w'] * 0.3, c['h'] * 0.2)); pg.wait_for_timeout(500)
    kr = pg.evaluate("(() => { const S = Rennspiel.EditorUI.zustand(); return S.d ? Rennspiel.Editor.kreuzungenVon(S.d).length : -1; })()")
    pruefe(f'{spiel}: Acht gemalt → eine Brücke (Überführung)', kr == 1, kr)
    pg.click('.e7-chip[data-w="regenbogenland"]'); pg.wait_for_timeout(200)
    pg.screenshot(path=f'{OUT}/{kz}_editor_acht_bruecke_1280.png')
    pg.click('.e7-k[data-b="probe"]'); pg.click('.e7-dlg .e7-k:has-text("Allein")'); pg.wait_for_function("Rennspiel.spiel.zustand === 'rennen'", timeout=20000)
    ue = pg.evaluate("(() => { const st = Rennspiel.spiel.strecke; return { n: st.ueberfuehrungen.length, dy: st.ueberfuehrungen[0] && st.ueberfuehrungen[0].kreuzung ? +st.ueberfuehrungen[0].kreuzung.dy.toFixed(1) : -1, modell: st.hoehenModell }; })()")
    pruefe(f'{spiel}: Acht im Rennen: Überführung gebaut (Δy ≥ 7 m, Höhenmodell strasse)', ue['n'] == 1 and ue['dy'] >= 7 and ue['modell'] == 'strasse', json.dumps(ue))
    pg.evaluate("""() => { const s = Rennspiel.spiel, z0 = s.zeichnen; s.zeichnen = function () {}; let g = 0; window.__t = performance.now(); s.uhr.letzte = window.__t; s.uhr.rest = 0;
      while ((s.zustand !== 'rennen' || !s.rennen.gasErlaubt) && g++ < 1500) { window.__t += 1000 / 60; s._frameRumpf(window.__t); } s.zeichnen = z0;
      const st = s.strecke, k = st.ueberfuehrungen[0].kreuzung, f = s.fahrzeuge[0].vehicle, p = st.spline.punktBei(k.sOben - 60); f.setzen(p.x, p.z, Rennspiel.headingAus(p.tx, p.tz)); f.y = st.hoeheAn(p.x, p.z); f.vLaengs = 20; }""")
    pg.wait_for_timeout(100)
    pg.evaluate("""() => { const s = Rennspiel.spiel, z0 = s.zeichnen; s.zeichnen = function () {}; for (let i = 0; i < 40; i++) { window.__t += 1000 / 60; s._frameRumpf(window.__t); } s.zeichnen = z0; s.zeichnen && s.zeichnen(); }""")
    pg.wait_for_timeout(300)
    pg.screenshot(path=f'{OUT}/{kz}_rennen_bruecke_1280.png')
    pruefe(f'{spiel}: Konsole ohne Fehler (Acht)', not fehler, fehler[:3])
    b.close()

def lauf_handy(p, spiel):
    kz = 'moto' if spiel == 'Motorrad' else 'auto'
    b, ctx, pg, fehler = neue_seite(p, spiel, 390, 844, touch=True)
    pg.evaluate("localStorage.clear()"); pg.evaluate("Rennspiel.spiel.menue.aktion('editor:neu')"); pg.wait_for_selector('#e7'); pg.wait_for_timeout(300)
    pg.screenshot(path=f'{OUT}/{kz}_editor_leer_390x844.png')
    c = leinwand(pg)
    pruefe(f'{spiel}: Handy hochkant: Leinwand und Bedienfeld sichtbar, keine Seiten-Scrollbalken', c['w'] > 300 and c['h'] > 250 and pg.evaluate("document.documentElement.scrollWidth <= window.innerWidth + 1"), json.dumps(c))
    strich(pg, malen_punkte(c['x'] + c['w'] / 2, c['y'] + c['h'] / 2, c['w'] * 0.32, c['h'] * 0.32)); pg.wait_for_timeout(500)
    # Antippen mit dem Finger (touchscreen.tap): Schanze
    st = gerade_stellen(pg, 'schanze')
    if st:
        pg.touchscreen.tap(*[0, 0]) if False else None
        pg.tap('.e7-t[data-t="schanze"]'); x, y = pixel_fuer_s(pg, st[len(st) // 2]); pg.touchscreen.tap(x, y); pg.wait_for_timeout(200)
    nschan = pg.evaluate("Rennspiel.EditorUI.zustand().d.el.filter(e => e.a === 'schanze').length")
    pruefe(f'{spiel}: Handy: Antippen mit dem Finger setzt eine Schanze', nschan == 1, nschan)
    for a in ['trampolin', 'gold']:
        s2 = gerade_stellen(pg, a)
        if s2: pg.tap('.e7-t[data-t="%s"]' % a); x, y = pixel_fuer_s(pg, s2[0]); pg.touchscreen.tap(x, y); pg.wait_for_timeout(150)
    pg.wait_for_timeout(200)
    pg.screenshot(path=f'{OUT}/{kz}_editor_gebaut_390x844.png')
    pg.tap('.e7-k[data-b="speichern"]'); pg.wait_for_selector('#e7-sname'); pg.wait_for_timeout(150)
    pg.screenshot(path=f'{OUT}/{kz}_dialog_speichern_390x844.png')
    pg.evaluate("document.querySelector('.e7-dlg .e7-k').click()")
    pg.wait_for_function("Rennspiel.Editor.Speicher.liste().length >= 1 || !!document.querySelector('.e7-dlg h3') && /schaffen die Computer/.test(document.querySelector('.e7-dlg h3').textContent)", timeout=20000)
    pg.wait_for_timeout(500)
    pg.screenshot(path=f'{OUT}/{kz}_editor_nach_speichern_390x844.png')
    pruefe(f'{spiel}: Konsole ohne Fehler (Handy)', not fehler, fehler[:3])
    b.close()

with sync_playwright() as p:
    for spiel in SPIELE:
        print('=== ' + spiel, flush=True)
        lauf_spiel(p, spiel)
        lauf_acht(p, spiel)
        lauf_handy(p, spiel)
print(f'\n{ok} OK, {fehl} FEHL')
sys.exit(1 if fehl else 0)
