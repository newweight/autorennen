#!/usr/bin/env python3
"""HANDY-HUD: Aufnahme der Rennansicht auf dem iPhone (Playwright, Chromium, hasTouch/isMobile) – vorher/nachher.
Spiele: Motorrad.html, Autorennen.html (lokaler http-Server aus dem Repo). Hoch- und Querformat (iPhone 14: 844x390 / 390x844).
Start des Rennens über das Menü mit echtem Tippen (page.tap), Einblendungen per Funktionsaufruf ausgelöst (Test-Haken).
Bilder: tests/bilder_handy/<phase>_<spiel>_<quer|hoch>_<szene>.png   (gitignored, wie tests/bilder_*/)
Zusätzlich je Bild: „Mitte frei?“ – sichtbare Einblendungen, die das mittlere Drittel (x 33–67 %) / mittlere 60 % (y 20–80 %) berühren.
Aufruf:  python3 tests/handy_hud.py vorher|nachher [moto|auto|beide] [quer|hoch|beide]
Desktop-Vergleich (pixelgleich):  python3 tests/handy_hud.py desktop <name>   → tests/bilder_handy/desktop_<name>_<spiel>.png"""
import os, sys, json, functools, threading, http.server
from playwright.sync_api import sync_playwright

basis = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
out = os.path.join(basis, 'tests', 'bilder_handy'); os.makedirs(out, exist_ok=True)
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required']
SPIELE = {'moto': 'Motorrad', 'auto': 'Autorennen'}

class Still(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
srv = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(Still, directory=basis))
PORT = srv.server_address[1]
threading.Thread(target=srv.serve_forever, daemon=True).start()

# Selektoren aller Einblendungen, die im Rennen erscheinen können (für die „Mitte frei“-Messung)
EINBLENDUNGEN = ['.hud-banner', '.hud-countdown', '.hud-hinweis', '.hud-meldung', '.hud-werkstatt', '.hud-polizei', '.hud-geisterfahrer', '.hud-dach',
                 '.hud-reparatur', '.moto-mitte', '.spass-toast', '#dino-sieg', '#dino-wett', '#s4-hud']
MESS = """(sel) => { const W = innerWidth, H = innerHeight, res = [];
  const x0 = W * .333, x1 = W * .667, y0 = H * .2, y1 = H * .8;
  sel.forEach((s) => document.querySelectorAll(s).forEach((e) => {
    const c = getComputedStyle(e); if (c.display === 'none' || c.visibility === 'hidden' || parseFloat(c.opacity) < .05) return;
    const r = e.getBoundingClientRect(); if (r.width < 2 || r.height < 2) return;
    const ix = Math.max(0, Math.min(r.right, x1) - Math.max(r.left, x0)), iy = Math.max(0, Math.min(r.bottom, y1) - Math.max(r.top, y0));
    res.push({ s, text: (e.textContent || '').trim().slice(0, 28), l: Math.round(r.left), t: Math.round(r.top), r: Math.round(r.right), b: Math.round(r.bottom),
      mitte: Math.round(ix * iy / ((x1 - x0) * (y1 - y0)) * 1000) / 10 }); }));
  return res; }"""

def gerate(p, quer):
    d = dict(p.devices['iPhone 14']) if 'iPhone 14' in p.devices else dict(p.devices['iPhone 13'])
    w, h = (844, 390) if quer else (390, 844)
    d['viewport'] = {'width': w, 'height': h}; d['screen'] = {'width': w, 'height': h}
    return d

def tippen(pg, sel, text=None):
    loc = pg.locator(sel + (':has-text("%s")' % text if text else '')).first
    loc.scroll_into_view_if_needed(); loc.tap(); pg.wait_for_timeout(250)

def rennen_starten(pg, moto):
    """Menü nur per Tippen bis zum Rennen (Allein, erste Strecke, Fahrer, Fahrzeug, Los)."""
    tippen(pg, '[data-a="modus:solo"]')
    for _ in range(12):
        if pg.evaluate('Rennspiel.spiel.zustand') == 'rennen': break
        if pg.locator('.m-nav [data-a="start"]').count():
            tippen(pg, '.m-nav [data-a="start"]'); pg.wait_for_timeout(800); continue
        k = pg.locator('.karte.gewaehlt')
        if k.count() == 0:
            pg.locator('.karte[data-a]').first.tap(); pg.wait_for_timeout(250); k = pg.locator('.karte.gewaehlt')
        if k.count(): k.first.tap(); pg.wait_for_timeout(300)
    assert pg.evaluate('Rennspiel.spiel.zustand') == 'rennen', 'Rennen nicht gestartet'

JS_SZENEN = {
  'banner': "() => { const h = Rennspiel.spiel.huds[0]; h.banner('Runde 2!', 6000, '', h.t.name); }",
  'banner_letzte': "() => { const h = Rennspiel.spiel.huds[0]; h.banner('Letzte Runde!', 6000, '', h.t.name); }",
  'meldung_kurz': "() => { Rennspiel.spiel.huds[0].meldung('🌀 Looping geschafft!', 8000); }",
  'meldung_lang': "() => { Rennspiel.spiel.huds[0].meldung('Anlauf nehmen!\\nGas geben und Schwung holen', 8000); }",
  'sticker': "() => { Rennspiel.SpassStart.toastZeigen({ emoji: '🏆', name: 'Erster Sieg' }); }",
  'stunt': "() => { const s = Rennspiel.spiel, h = s.huds[0]; h.meldung('Salto! +400 ×2', 8000, 'linear-gradient(90deg, rgba(255,122,0,.95), rgba(255,176,0,.95))'); }",
  'hinweis': "() => { const f = Rennspiel.spiel.fahrzeuge[0]; Object.defineProperty(f, 'falschHerum', { get: () => true, set: () => {}, configurable: true }); }",
  'polizei': "() => { const h = Rennspiel.spiel.huds[0]; h.polizeiSetzen({ anzeige: () => ({ art: 'stopp', rest: 8, kosten: 5 }), minimapPunkte: () => [] }, 0); h._polizeiAnzeigen(); }",
  'geisterfahrer': "() => { const h = Rennspiel.spiel.huds[0]; h.verkehrSetzen({ warnung: () => ({ text: '⚠️ Geisterfahrer voraus!', abstand: 120 }), minimapPunkte: () => [] }, 0); h._verkehrAnzeigen(); }",
  'werkstatt': "() => { const h = Rennspiel.spiel.huds[0]; h.schaden = { zustand: () => ({ prozent: 60, liegengeblieben: false }) }; h.schadenIndex = 0; h.werkstatt = { zustand: () => ({ status: 'voraus' }) }; h.werkstattIndex = 0; h._werkstattAnzeigen(); }",
  'dino_sieg': """() => { const d = document.createElement('div'); d.id = 'dino-sieg'; d.innerHTML = '🏆 Du hast den Dino geschlagen!<small>Geschafft in 12,3 Sekunden 🦖</small>'; document.body.appendChild(d); }""",
  'dino_wett': """() => { const d = document.createElement('div'); d.id = 'dino-wett'; d.innerHTML = '<div class="bahn"></div><span class="ich" style="left:80px;top:-6px">🏍️</span><span class="dino" style="left:120px;top:12px">🦖</span><span class="fahne">🏁</span>'; document.body.appendChild(d); }""",
  'mission': "() => { Rennspiel.SpassModi.hud('<b>Kurz-Level 3</b><small>Sammle 5 Münzen · 0:42</small>'); }",
  'moto_mitte': """() => { const hd = Rennspiel.spiel.huds[0]; const m = document.createElement('div'); m.className = 'moto-mitte'; m.style.display = 'block'; m.style.background = 'linear-gradient(90deg, rgba(31,111,209,.92), rgba(70,150,235,.92))';
      m.innerHTML = '🏍️ Du liegst schräg!<span class="hinweis">Lenker gerade halten</span>'; hd.el.appendChild(m); }""",
}
AUFRAEUMEN = """() => { document.querySelectorAll('#dino-sieg,#dino-wett,.moto-mitte,.spass-toast').forEach((e) => e.remove());
  const s = Rennspiel.spiel, h = s.huds[0]; if (h) { try { h.eBanner.className = 'hud-banner'; h.eMeldung.style.opacity = '0'; h.meldungText = ''; } catch (e) {}
    h.polizei = null; if (h.ePolizei) h.ePolizei.style.display = 'none'; h.verkehr = null; if (h.eVerkehr) h.eVerkehr.style.display = 'none';
    h.werkstatt = null; h.schaden = null; if (h.eWerk) { h.eWerk.style.display = 'none'; h.eWerk._an = false; } }
  const f = s.fahrzeuge[0]; if (f) Object.defineProperty(f, 'falschHerum', { value: false, writable: true, configurable: true });
  try { Rennspiel.SpassModi.hud(''); } catch (e) {} }"""

def aufnehmen(p, browser, phase, spiel, quer):
    moto = spiel == 'moto'
    name = '%s_%s_%s' % (phase, spiel, 'quer' if quer else 'hoch')
    ctx = browser.new_context(**gerate(p, quer))
    pg = ctx.new_page(); pg.set_default_timeout(120000); fehler = []
    pg.on('pageerror', lambda e: fehler.append(str(e)))
    pg.on('console', lambda m: fehler.append('console.error: ' + m.text) if m.type == 'error' and 'GPU stall' not in m.text else None)
    pg.add_init_script("try { localStorage.setItem('rennspiel.spass.welten.%s', JSON.stringify({ dino: 'immer' })); } catch (e) {}" % ('motorrad' if moto else 'auto'))
    pg.goto('http://127.0.0.1:%d/%s.html' % (PORT, SPIELE[spiel])); pg.wait_for_function('window.Rennspiel && Rennspiel.spiel', polling=200); pg.wait_for_timeout(1500)
    bericht = {'bild': name, 'hochformat_overlay': pg.evaluate("getComputedStyle(document.getElementById('t-quer')).display") if not quer else None, 'szenen': {}}
    if not quer:
        pg.screenshot(path=os.path.join(out, name + '_menue.png'))
    try:
        if not quer and bericht['hochformat_overlay'] == 'flex':
            # Hochformat: Das Menü ist querformatig (Schild „Bitte quer halten“ blockiert Tippen) → Start nur per Funktionsaufruf (Ersatz für „Quer starten, dann drehen“)
            bericht['start_per_js'] = True
            pg.evaluate("""(m) => Rennspiel.spiel.rennenStarten({ modus: 'solo', streckeId: 'wiese', autoIds: m ? ['superbike','quad'] : ['troc-cabrio','multivan'], runden: 3, gegner: 3, schwierigkeit: 'mittel', fahrhilfe: ['wenig','wenig'] })""", moto)
            pg.wait_for_timeout(1500)
        else:
            rennen_starten(pg, moto)
    except Exception as e:
        bericht['startfehler'] = str(e)[:300]; pg.screenshot(path=os.path.join(out, name + '_startfehler.png')); ctx.close(); return bericht
    pg.screenshot(path=os.path.join(out, name + '_countdown.png'))
    bericht['szenen']['countdown'] = pg.evaluate(MESS, EINBLENDUNGEN)
    # bis zum Losfahren warten, dann Autopilot (Gas) – Fahrt
    pg.evaluate("() => { const s = Rennspiel.spiel; try { s.autopilot(0, true); } catch (e) {} }")
    pg.wait_for_function("() => Rennspiel.spiel.rennen && Rennspiel.spiel.rennen.zustand === 'laeuft'", timeout=180000, polling=300)
    pg.wait_for_timeout(2500)
    pg.screenshot(path=os.path.join(out, name + '_fahrt.png'))
    bericht['szenen']['fahrt'] = pg.evaluate(MESS, EINBLENDUNGEN)
    szenen = ['banner', 'banner_letzte', 'meldung_kurz', 'meldung_lang', 'sticker', 'hinweis', 'polizei', 'geisterfahrer', 'werkstatt', 'dino_sieg', 'dino_wett', 'mission']
    if moto: szenen += ['stunt', 'moto_mitte']
    for sz in szenen:
        pg.evaluate(AUFRAEUMEN)
        try:
            pg.evaluate(JS_SZENEN[sz])
        except Exception as e:
            bericht['szenen'][sz] = 'FEHLER beim Auslösen: ' + str(e)[:160]; continue
        pg.wait_for_timeout(900)
        if sz == 'sticker':     # Toasts laufen nacheinander (je ~3 s): auf „.an“ warten
            try: pg.wait_for_function("() => document.querySelector('.spass-toast.an')", timeout=15000, polling=100); pg.wait_for_timeout(500)
            except Exception: pass
        pg.screenshot(path=os.path.join(out, '%s_%s.png' % (name, sz)))
        bericht['szenen'][sz] = pg.evaluate(MESS, EINBLENDUNGEN)
    # alles zugleich (Stapelung)
    pg.evaluate(AUFRAEUMEN)
    for sz in ['banner', 'meldung_kurz', 'sticker', 'hinweis', 'dino_wett', 'mission'] + (['stunt'] if moto else []):
        try: pg.evaluate(JS_SZENEN[sz])
        except Exception: pass
    try: pg.wait_for_function("() => document.querySelector('.spass-toast.an')", timeout=15000, polling=100); pg.wait_for_timeout(500)
    except Exception: pass
    pg.screenshot(path=os.path.join(out, name + '_alles.png'))
    bericht['szenen']['alles'] = pg.evaluate(MESS, EINBLENDUNGEN)
    bericht['js_fehler'] = fehler[:5]
    ctx.close()
    return bericht

def desktop(p, browser, tag):
    for spiel in ('moto', 'auto'):
        ctx = browser.new_context(viewport={'width': 1280, 'height': 720}); pg = ctx.new_page(); pg.set_default_timeout(120000)
        pg.goto('http://127.0.0.1:%d/%s.html' % (PORT, SPIELE[spiel])); pg.wait_for_function('window.Rennspiel && Rennspiel.spiel', polling=200); pg.wait_for_timeout(1500)
        pg.screenshot(path=os.path.join(out, 'desktop_%s_%s_menue.png' % (tag, spiel)))
        # Rennen mit festem Takt starten und mehrere Einblendungen auslösen – deterministisch (Spielschleife aus, feste Bilder)
        pg.evaluate("""() => { const S = Rennspiel.spiel; S.rennenStarten({ modus: 'solo', streckeId: 'wiese', autoIds: [%s], runden: 2, gegner: 3, schwierigkeit: 'mittel', fahrhilfe: ['wenig','wenig'] }); }""" % ("'superbike','quad'" if spiel == 'moto' else "'troc-cabrio','multivan'"))
        pg.evaluate("""() => { const S = Rennspiel.spiel; S.laeuft = false; window.__T = performance.now(); window.__f = (n) => { for (let i = 0; i < n; i++) { window.__T += 1000 / 60; S._frameRumpf(window.__T); } }; }""")
        pg.evaluate("() => window.__f(30)")
        pg.screenshot(path=os.path.join(out, 'desktop_%s_%s_countdown.png' % (tag, spiel)))
        pg.evaluate("""() => { const h = Rennspiel.spiel.huds[0]; h.banner('Runde 2!', 600000, '', h.t.name); h.meldung('🌀 Looping geschafft!', 600000);
          Rennspiel.SpassStart.toastZeigen({ emoji: '🏆', name: 'Erster Sieg' }); window.__f(2); }""")
        pg.wait_for_timeout(1200)
        pg.evaluate("() => window.__f(2)")
        pg.screenshot(path=os.path.join(out, 'desktop_%s_%s_einblendungen.png' % (tag, spiel)))
        # nur die HTML-Ebene (3D-Bild ausgeblendet) → deterministisch, pixelgenau vergleichbar
        pg.add_style_tag(content='#spiel{visibility:hidden!important} *{animation:none!important;transition:none!important}')
        pg.wait_for_timeout(300)
        pg.screenshot(path=os.path.join(out, 'desktop_%s_%s_ui.png' % (tag, spiel)))
        ctx.close()

if __name__ == '__main__':
    phase = sys.argv[1] if len(sys.argv) > 1 else 'vorher'
    wahl = sys.argv[2] if len(sys.argv) > 2 else 'beide'
    ori = sys.argv[3] if len(sys.argv) > 3 else 'beide'
    with sync_playwright() as p:
        browser = p.chromium.launch(args=ARGS)
        if phase == 'desktop':
            desktop(p, browser, sys.argv[2]); browser.close(); sys.exit(0)
        alle = {}
        for spiel in (['moto', 'auto'] if wahl == 'beide' else [wahl]):
            for quer in ([True, False] if ori == 'beide' else [ori == 'quer']):
                b = aufnehmen(p, browser, phase, spiel, quer); alle[b['bild']] = b
                print('==', b['bild'], b.get('startfehler', ''), 'Hochformat-Overlay:', b.get('hochformat_overlay'), 'JS-Fehler:', b.get('js_fehler'))
                for sz, v in b['szenen'].items():
                    if isinstance(v, str): print('  ', sz, v); continue
                    print('  %-14s' % sz, ' | '.join('%s “%s” Mitte %s%%' % (e['s'], e['text'], e['mitte']) for e in v if e['mitte'] > 0) or '(Mitte frei)')
        json.dump(alle, open(os.path.join(out, 'bericht_%s.json' % phase), 'w'), ensure_ascii=False, indent=1)
        browser.close()
