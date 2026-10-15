#!/usr/bin/env python3
"""Hänger-Suche (15.10. v26b): startet Rennen in vielen Kombinationen mit Watchdog (CDP Debugger.pause bei Hänger).
Aufruf: python3 tests/haenger_matrix.py [strecke ...]  (Standard: wiese)  Umgebung: HMAX=Sekunden je Start (20)"""
import asyncio, os, sys, json, itertools, time
from playwright.async_api import async_playwright

basis = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
url = os.environ.get('URL') or ('file://' + os.path.join(basis, 'Autorennen.html'))
HMAX = float(os.environ.get('HMAX', '20'))
strecken = sys.argv[1:] or ['wiese']

def kombis():
    if os.environ.get('QUICK'):
        for st in strecken:
            for modus in ('solo', 'zwei'):
                for var in ('', 'xl'):
                    yield dict(streckeId=st, tageszeit='nacht', wetter='regen', verkehr='viel', geisterfahrer=True, schaden=True, polizei=True, variante=var, modus=modus)
        return
    for st in strecken:
        for tz, wetter in [('nacht', 'regen'), ('daemmerung', 'regen')]:
            for verkehr, geister in [('aus', False), ('wenig', False), ('viel', True)]:
                for schaden in (False, True):
                    for var in ('', 'xl'):
                        for modus in ('solo', 'zwei'):
                            yield dict(streckeId=st, tageszeit=tz, wetter=wetter, verkehr=verkehr, geisterfahrer=geister,
                                       schaden=schaden, variante=var, modus=modus)

async def lauf(k, browser):
    page = await browser.new_page(viewport={'width': 1100, 'height': 650})
    fehler = []
    page.on('pageerror', lambda e: fehler.append(str(e)))
    await page.goto(url); await page.wait_for_timeout(800)
    cdp = await page.context.new_cdp_session(page)
    pausiert = asyncio.get_event_loop().create_future()
    cdp.on('Debugger.paused', lambda ev: (not pausiert.done()) and pausiert.set_result(ev))
    await cdp.send('Debugger.enable')
    einst = dict(modus=k['modus'], streckeId=k['streckeId'], autoIds=['troc-cabrio', 'multivan'], runden=3, gegner=8 if k['modus'] == 'solo' else 7,
                 schwierigkeit='mittel', fahrhilfe=['wenig', 'wenig'], wetter=k['wetter'], jahreszeit='sommer', tageszeit=k['tageszeit'],
                 verkehr=k['verkehr'], geisterfahrer=k['geisterfahrer'], schaden=k['schaden'], variante=k['variante'], polizei=k.get('polizei', False))
    t0 = time.time()
    await cdp.send('Runtime.evaluate', {'expression': "window.__hb=0; setInterval(()=>window.__hb++,100); setTimeout(()=>{ try { Rennspiel.spiel.rennenStarten(%s); window.__ok=1; } catch(e){ window.__err=String(e&&e.stack||e); } },0); 1" % json.dumps(einst)})
    await page.keyboard.down('ArrowUp')
    ergebnis = None
    # 1) Start abwarten, 2) 10 s Simulation beobachten
    while True:
        await asyncio.sleep(1.0)
        try:
            r = await asyncio.wait_for(cdp.send('Runtime.evaluate', {'expression': "JSON.stringify({ok:window.__ok||0,err:window.__err||null,hb:window.__hb,z:Rennspiel.spiel.zustand})", 'returnByValue': True}), float(os.environ.get('POLL', '10')))
            d = json.loads(r['result']['value'])
        except asyncio.TimeoutError:
            await cdp.send('Debugger.pause')
            try:
                ev = await asyncio.wait_for(pausiert, 10)
                fr = ev['callFrames'][:8]
                st = ['%s %s:%d' % (f['functionName'] or '(anon)', f['url'].split('/')[-1], f['location']['lineNumber'] + 1) for f in fr]
                ergebnis = ('HÄNGER', st)
            except asyncio.TimeoutError:
                ergebnis = ('HÄNGER', ['(nicht pausierbar)'])
            break
        if d['err']: ergebnis = ('FEHLER', d['err']); break
        if d['ok'] and time.time() - t0 > HMAX / 2 + 4: ergebnis = ('OK', '%.1fs' % (time.time() - t0)); break
        if time.time() - t0 > HMAX * 4: ergebnis = ('ZU LANGSAM', d); break
    if fehler and ergebnis[0] == 'OK': ergebnis = ('JS-FEHLER', fehler[:2])
    await page.close()
    return ergebnis

async def main():
    n_h = 0
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
        for k in kombis():
            e = await lauf(k, browser)
            print(e[0], json.dumps(k, ensure_ascii=False), e[1], flush=True)
            if e[0] != 'OK': n_h += 1
        await browser.close()
    print('Auffällig:', n_h)
asyncio.run(main())
