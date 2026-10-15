#!/usr/bin/env python3
"""Zählt gl.linkProgram-Aufrufe pro Sekunde nach Rennstart (Shader-Neukompilier-Sturm = Hänger, v26b)."""
import asyncio, os, sys, json
from playwright.async_api import async_playwright
url = 'file://' + os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'Autorennen.html')
st = sys.argv[1] if len(sys.argv) > 1 else 'wald'
async def main():
    async with async_playwright() as pw:
        b = await pw.chromium.launch(args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
        p = await b.new_page(viewport={'width': 1100, 'height': 650})
        await p.add_init_script("""window.__links=[]; for (const C of [WebGLRenderingContext, WebGL2RenderingContext]) { const o=C.prototype.linkProgram; C.prototype.linkProgram=function(p){ window.__links.push(Math.round(performance.now())); return o.call(this,p); }; }""")
        await p.goto(url); await p.wait_for_timeout(800)
        r = await p.evaluate("""async (st) => {
          const c={modus:'solo',streckeId:st,autoIds:['troc-cabrio','multivan'],runden:3,gegner:8,schwierigkeit:'mittel',fahrhilfe:['wenig','wenig'],wetter:'regen',jahreszeit:'sommer',tageszeit:'nacht',verkehr:'viel',geisterfahrer:true,schaden:true,polizei:true,variante:''};
          window.__links.length = 0; const t0=performance.now(); Rennspiel.spiel.rennenStarten(c);
          const prog=[]; for (let i=0;i<12;i++){ await new Promise(r=>setTimeout(r,1000)); prog.push([Math.round(performance.now()-t0), window.__links.length, Rennspiel.spiel.szene.children.filter(o=>o.isLight).length]); }
          return prog; }""", st)
        print(st, r)
        await b.close()
asyncio.run(main())
