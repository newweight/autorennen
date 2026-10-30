import sys, os  # Pause-Karte in 4 Fenstergrößen x Solo/Zwei x beide Spiele: alle Knöpfe im Bild + echter Klick
sys.path.insert(0, '/home/claude/autorennen/tests')
import matrix_alle as M
from playwright.sync_api import sync_playwright
out = '/home/claude/autorennen/tests/bilder_startfehler/pause'
os.makedirs(out, exist_ok=True)
GR = [(844,390),(1100,650),(1280,800),(400,225)]
with sync_playwright() as p:
    b = p.chromium.launch(args=M.ARGS)
    for spiel in ('moto','auto'):
        for (w,h) in GR:
            for modus in ('solo','zwei'):
                page = M.neue_seite(b, spiel, w, h)
                M.spiel_laden(page, spiel)
                paare = [['superbike','quad']] if spiel=='moto' else [['passat','porsche-911']]
                st = page.evaluate(M.JS_START, {'grafik':'normal','modus':modus,'einst':{'streckeId':'wiese'},'paare':paare,'nr':0})
                page.evaluate("() => { const S = Rennspiel.spiel; S.pauseSetzen(true); S.pauseAnzeige.zeigen(); }")
                page.wait_for_timeout(800)
                r = page.evaluate("""() => [...document.querySelectorAll('#pause .knopf')].map(k => { const r = k.getBoundingClientRect(); return [k.textContent.trim().slice(0,14), Math.round(r.top), Math.round(r.bottom)]; }).concat([[innerHeight, 0, 0]])""")
                ok = all(0 <= t and bt <= h for _, t, bt in r[:-1])
                klick = ''
                try:
                    page.click('#pause [data-g1]', timeout=60000); klick = 'klick-ok'
                except Exception as e: klick = 'KLICK-FEHL'
                page.screenshot(path='%s/%s_%dx%d_%s.png' % (out, spiel, w, h, modus))
                print(spiel, w, h, modus, 'im Bild' if ok else 'ABGESCHNITTEN', klick, r, flush=True)
                page.context.close()
    b.close()
