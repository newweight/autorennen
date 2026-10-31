"""R6b BILDFIX 1: echtes Fahren über die Wiese-Rampe (s 75–85) mit dem Motorrad (Gas + Tempo ≥ Schanzen-Mindesttempo): Cockpit + Verfolger, Bilder zeigen Fahrer/Straße statt ocker Fläche.
Aufruf: python3 tests/r6b_fahrt.py <Bildordner> [normal|ultra]"""
import os, sys
from playwright.sync_api import sync_playwright
basis=os.path.dirname(os.path.dirname(os.path.abspath(__file__))); out=sys.argv[1]; stufe=sys.argv[2] if len(sys.argv)>2 else 'normal'; os.makedirs(out,exist_ok=True)
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
SETZEN = '''([s0, abstand, v0]) => { const S = Rennspiel.spiel, sp = S.strecke.spline, p = sp.punktBei(sp.wrapS(s0 - abstand)), v = S.fahrzeuge[0].vehicle;
  v.setzen(p.x, p.z, Rennspiel.headingAus(p.tx, p.tz)); v.y = S.strecke.hoeheAn(p.x, p.z); v.vLaengs = v0; }'''
with sync_playwright() as pw:
    b=pw.chromium.launch(args=ARGS); page=b.new_page(viewport={'width':1280,'height':720}); page.set_default_timeout(300000)
    page.goto('file://'+basis+'/Motorrad.html'); page.wait_for_function('window.Rennspiel && Rennspiel.spiel')
    page.evaluate("Rennspiel.Grafik.setzen('%s')"%stufe)
    page.evaluate("Rennspiel.spiel.rennenStarten({ modus: 'solo', streckeId: 'wiese', autoIds: ['crossmaschine','crossmaschine-rot'], runden: 1, gegner: 0, schwierigkeit: 'mittel', fahrhilfe: ['wenig','wenig'] })")
    page.wait_for_function('Rennspiel.spiel.rennen.zustand === "laeuft"', timeout=300000)
    page.wait_for_timeout(4000)
    for kam in ('cockpit','verfolger'):
        page.evaluate("(m) => { const k = Rennspiel.spiel.kameras[0]; let n = 0; while (k.modus !== m && n++ < 4) k.naechsterModus(); }", kam)
        page.evaluate(SETZEN,[75,45,28]); page.keyboard.down("ArrowUp"); page.evaluate("window.__tv=setInterval(()=>{const v=Rennspiel.spiel.fahrzeuge[0].vehicle; if(v.vLaengs<28) v.vLaengs=28;},16)")
        n=0
        for i in range(45):
            page.wait_for_timeout(120)
            d=page.evaluate("()=>{const S=Rennspiel.spiel,v=S.fahrzeuge[0].vehicle; return [+v.x.toFixed(1),+v.y.toFixed(2),+v.z.toFixed(1), +(v.vLaengs||0).toFixed(1), +S.strecke.hoeheAn(v.x,v.z).toFixed(2), S.fahrzeuge[0].flug&&S.fahrzeuge[0].flug.aktiv]}")
            if i%3==0: print(kam,i,d, flush=True)
            if -86<d[2]<-70 and n<3:
                page.screenshot(path=os.path.join(out,'%s_%s_rampe%d.png'%(stufe,kam,n))); print('SHOT',d, flush=True); n+=1
        page.keyboard.up("ArrowUp"); page.evaluate("clearInterval(window.__tv)")
    b.close()
