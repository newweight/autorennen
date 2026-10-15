#!/usr/bin/env python3
"""Misst je Konfiguration: Dauer von rennenStarten (Main-Thread) und längste Blockade in den ersten 10 s danach (Hänger-Suche v26b)."""
import asyncio, os, sys, json, time
from playwright.async_api import async_playwright
basis = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
url = 'file://' + os.path.join(basis, 'Autorennen.html')
def cfgs():
    base = dict(modus='solo', streckeId='wiese', autoIds=['troc-cabrio', 'multivan'], runden=3, gegner=8, schwierigkeit='mittel', fahrhilfe=['wenig', 'wenig'], wetter='regen', jahreszeit='sommer', tageszeit='nacht', verkehr='aus', geisterfahrer=False, schaden=False, variante='')
    yield 'basis nacht regen', base
    yield 'tag klar', dict(base, tageszeit='tag', wetter='klar')
    yield 'nacht klar', dict(base, wetter='klar')
    yield 'daemmerung regen', dict(base, tageszeit='daemmerung')
    yield 'nacht regen verkehr viel+geister', dict(base, verkehr='viel', geisterfahrer=True)
    yield 'nacht regen schaden', dict(base, schaden=True)
    yield 'nacht regen zwei', dict(base, modus='zwei', gegner=7)
async def main():
    async with async_playwright() as pw:
        b = await pw.chromium.launch(args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
        for name, c in cfgs():
            p = await b.new_page(viewport={'width': 1100, 'height': 650})
            await p.goto(url); await p.wait_for_timeout(800)
            r = await p.evaluate("""async (c) => {
              let last = performance.now(), maxGap = 0, gaps = [];
              const iv = setInterval(() => { const n = performance.now(); const g = n - last; if (g > maxGap) maxGap = g; if (g > 1500) gaps.push(Math.round(g)); last = n; }, 50);
              const t0 = performance.now(); Rennspiel.spiel.rennenStarten(c); const dauer = performance.now() - t0;
              await new Promise(r => setTimeout(r, 10000)); clearInterval(iv);
              return { startMs: Math.round(dauer), maxGapMs: Math.round(maxGap), gaps, lichter: Rennspiel.spiel.szene.children.filter(o => o.isLight).length };
            }""", c)
            print(name, r, flush=True)
            await p.close()
        await b.close()
asyncio.run(main())
