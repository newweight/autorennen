#!/usr/bin/env python3
"""R6b BILDFIX 3: HUD-Überlagerungen (Missions-Chip #s4-hud, Banner, Ergebnis-Fenster, Sticker-Toast, Platz-Box) in 1280x800 und 844x390.
Prüft per Geometrie, dass sich Chip/Toast/Banner/Platz-Box nicht überlappen; Bilder nach BILD_ORDNER (Standard tests/bilder_r6b).
Aufruf: python3 tests/r6b_hud.py [moto|auto] [praefix]"""
import os, sys, json
from playwright.sync_api import sync_playwright
basis = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
bild = os.environ.get('BILD_ORDNER') or os.path.join(basis, 'tests', 'bilder_r6b'); os.makedirs(bild, exist_ok=True)
tag = sys.argv[1] if len(sys.argv) > 1 else 'moto'; pre = sys.argv[2] if len(sys.argv) > 2 else 'nachher'
html = 'Motorrad.html' if tag == 'moto' else 'Autorennen.html'
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
ok = fehl = 0
def pruefe(name, gut, info=''):
    global ok, fehl
    print(('OK   ' if gut else 'FEHL ') + name + (('  (' + str(info) + ')') if info != '' else ''), flush=True)
    if gut: ok += 1
    else: fehl += 1
# sichtbare Rechtecke der Anzeige-Teile
RECHTE = """() => { const vis = (e) => { if (!e) return null; const r = e.getBoundingClientRect(), c = getComputedStyle(e); if (r.width < 2 || r.height < 2 || c.display === 'none' || c.visibility === 'hidden' || +c.opacity < 0.05) return null; return { l: r.left, t: r.top, r: r.right, b: r.bottom }; };
  const q = (s) => [...document.querySelectorAll(s)].map(vis).filter(Boolean);
  const banner = [...document.querySelectorAll('.hud-banner.an')].map(vis).filter(Boolean);
  return { chip: q('#s4-hud'), platz: q('.hud-platz'), banner, countdown: q('.hud-countdown').filter(() => document.querySelector('.hud-countdown').textContent.trim() !== ''), toast: q('.spass-toast.an'), karte: q('.s4-karte, .ergebnis'), bannerText: banner.length ? document.querySelector('.hud-banner.an').textContent : '' }; }"""
def ueber(a, b): return a['l'] < b['r'] - 1 and b['l'] < a['r'] - 1 and a['t'] < b['b'] - 1 and b['t'] < a['b'] - 1
def paare(r, namen):
    bad = []
    for i, x in enumerate(namen):
        for y in namen[i + 1:]:
            for a in r[x]:
                for b in r[y]:
                    if ueber(a, b): bad.append(x + '×' + y)
    return bad
with sync_playwright() as pw:
    b = pw.chromium.launch(args=ARGS)
    for (w, h) in [(1280, 800), (844, 390)]:
        ctx = b.new_context(viewport={'width': w, 'height': h}); page = ctx.new_page(); page.set_default_timeout(120000)
        fehler = []; page.on('pageerror', lambda e: fehler.append(str(e)))
        def neu(modus):
            page.goto('file://' + os.path.join(basis, html)); page.wait_for_function('window.Rennspiel && Rennspiel.spiel'); page.wait_for_timeout(800)
            if modus: page.evaluate("(m)=>{const S=Rennspiel.spiel; S._s4Modus=m; S.rennenStarten();}", modus)
            else: page.evaluate("(a)=>Rennspiel.spiel.rennenStarten({ modus: 'solo', streckeId: 'wiese', autoIds: [a, a], runden: 2, gegner: 2, schwierigkeit: 'mittel', fahrhilfe: ['wenig', 'wenig'] })", 'crossmaschine' if tag == 'moto' else 'passat')
        def bild_(n): page.screenshot(path=os.path.join(bild, f'{pre}_{tag}_{n}_{w}x{h}.png'))
        # 1) Kurz-Level: Start (Countdown), Chip, dann Ziel mit Ergebnis + Sticker
        neu({'art': 'kurz', 'level': 'm01' if tag == 'moto' else 'a01'}); page.wait_for_timeout(700)
        r = page.evaluate(RECHTE); bild_('kurz_start')
        pruefe(f'{w}x{h} Kurz-Level Start: Chip überlappt Platz-Box/Countdown nicht', not [x for x in paare(r, ['chip', 'platz', 'countdown', 'banner']) if x.startswith('chip') or x.endswith('chip')], (paare(r, ['chip', 'platz', 'countdown', 'banner']), r['chip']))   # Countdown-Zeile ist volle Breite (Zahl mittig): nur der Chip zählt
        page.evaluate("""()=>{const S=Rennspiel.spiel; S.autopilot(0,true); S.pausiert=false; let n=0; while(S.rennen.zustand!=='laeuft' && n<900){S.physikSchritt(1/60); n++;} for(let i=0;i<240;i++) S.physikSchritt(1/60);}""")
        page.wait_for_timeout(400)
        r = page.evaluate(RECHTE); bild_('kurz_fahrt')
        pruefe(f'{w}x{h} Kurz-Level Fahrt: Chip überlappt nichts', not paare(r, ['chip', 'platz', 'banner', 'toast']), paare(r, ['chip', 'platz', 'banner', 'toast']))
        page.evaluate("""()=>{const S=Rennspiel.spiel; const z=S.s4.kurz; let n=0; while(!z.ende && n<16000){ S.physikSchritt(1/60); n++; } }""")
        page.wait_for_timeout(250)
        page.evaluate("Rennspiel.SpassStart.toastStil(); Rennspiel.SpassStart.toastZeigen({ emoji: '🏆', name: 'Testsieg' })")   # zweiter Sticker (Warteschlange)
        page.wait_for_timeout(1200)
        r = page.evaluate(RECHTE); bild_('kurz_ende')
        bad = paare(r, ['karte', 'banner', 'chip', 'toast'])   # die Karte ist ein Modal mit abgedunkeltem Hintergrund: die HUD-Boxen darunter sind gewollt gedimmt
        pruefe(f'{w}x{h} Kurz-Level Ergebnis: Ergebnis-Fenster ohne Banner/Platz-Box/Toast-Überlagerung', r['karte'] and not bad, (bad, r['bannerText']))
        pruefe(f'{w}x{h} Kurz-Level Ergebnis: Sticker steht als Zeile in der Karte', page.evaluate("!!document.querySelector('.s4-karte .s4-sticker')"))
        pruefe(f'{w}x{h} Kurz-Level: keine Rundenanzeige', page.evaluate("(() => { const e = document.querySelector('.hud-runde'); return !e || getComputedStyle(e).display === 'none'; })()"))
        # 2) Freie Fahrt / K.-o.
        for art in ('frei', 'ko'):
            neu({'art': art}); page.wait_for_timeout(700)
            r = page.evaluate(RECHTE); bild_(art + '_start')
            bad = paare(r, ['chip', 'platz', 'countdown', 'banner'])
            pruefe(f'{w}x{h} {art}: Chip überlappt nichts', not bad, (bad, r['chip']))
        # 3) normales Rennen: Zielbanner + Sticker
        neu(None); page.wait_for_timeout(500)
        page.evaluate("()=>{const S=Rennspiel.spiel; S.autopilot(0,true); S.pausiert=false; let n=0; while(S.rennen.zustand!=='laeuft' && n<900){S.physikSchritt(1/60); n++;} for(let i=0;i<120;i++) S.physikSchritt(1/60);}")
        page.evaluate("Rennspiel.spiel.huds && Rennspiel.spiel.huds[0] && Rennspiel.spiel.huds[0].banner('🏁 Platz 1!', 0, 'gold', 'Jonas')")
        page.evaluate("Rennspiel.SpassStart.toastStil(); Rennspiel.SpassStart.toastZeigen({ emoji: '🏆', name: 'Testsieg' })")
        page.wait_for_timeout(700)
        r = page.evaluate(RECHTE); bild_('rennen_banner_toast')
        bad = paare(r, ['banner', 'platz', 'toast'])
        pruefe(f'{w}x{h} Rennen: Zielbanner/Sticker/Platz-Box ohne Überlagerung (Sticker sichtbar, Banner weicht)', not bad and r['toast'], (bad, r['bannerText'], r['toast']))
        pruefe(f'{w}x{h} keine Seitenfehler', not fehler, fehler[:3])
        ctx.close()
    b.close()
print(f'{ok} OK, {fehl} FEHL')
sys.exit(1 if fehl else 0)
