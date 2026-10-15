#!/usr/bin/env python3
"""Neustart-Leck-Test (v26b): N× rennenStarten hintereinander; zählt Spiegel/HUD/Canvas/Listener-Indikatoren und Startzeit."""
import asyncio, os, sys, json
from playwright.async_api import async_playwright
basis = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
url = 'file://' + os.path.join(basis, 'Autorennen.html')
N = int(os.environ.get('N', '15'))
async def main():
    async with async_playwright() as pw:
        b = await pw.chromium.launch(args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
        p = await b.new_page(viewport={'width': 1100, 'height': 650})
        fe = []; p.on('pageerror', lambda e: fe.append(str(e)))
        await p.goto(url); await p.wait_for_timeout(800)
        for i in range(N):
            r = await p.evaluate("""async (i) => {
              const c = { modus:'solo', streckeId:'wiese', autoIds:['troc-cabrio','multivan'], runden:3, gegner:8, schwierigkeit:'mittel', fahrhilfe:['wenig','wenig'], wetter:'regen', jahreszeit:'sommer', tageszeit:'nacht', verkehr:'wenig', geisterfahrer:false, schaden:false, variante:'' };
              const t0 = performance.now(); Rennspiel.spiel.rennenStarten(c); const ms = Math.round(performance.now() - t0);
              await new Promise(r => setTimeout(r, 1500));
              const S = Rennspiel.spiel, R = S.renderer;
              const q = (s) => document.querySelectorAll(s).length;
              return { i, ms, spiegel: q('[class*=spiegel]'), canvas: q('canvas'), huds: S.huds.length, kam: S.kameras.length, geo: R.info.memory.geometries, tex: R.info.memory.textures, prog: R.info.programs ? R.info.programs.length : -1, szeneKinder: S.szene.children.length, dom: document.getElementsByTagName('*').length };
            }""", i)
            print(r, flush=True)
        print('Fehler:', fe[:3])
        await b.close()
asyncio.run(main())
