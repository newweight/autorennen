import os, sys
from playwright.sync_api import sync_playwright
B=os.path.dirname(os.path.dirname(os.path.abspath(__file__))); O=os.path.join(B,'tests','bilder_s8')
A=['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']
with sync_playwright() as p:
    b=p.chromium.launch(args=A)
    for w,h in ((390,844),(844,390)):
        c=b.new_context(viewport={'width':w,'height':h},has_touch=True,is_mobile=True); pg=c.new_page()
        pg.goto('file://'+B+'/Motorrad.html', timeout=120000); pg.wait_for_function('window.Rennspiel && Rennspiel.spiel', timeout=120000); pg.wait_for_timeout(1000)
        pg.evaluate("document.querySelector('.karte[data-a=\"editor:weiter\"]').click()"); pg.wait_for_selector('#e7'); pg.wait_for_timeout(400)
        pg.screenshot(path=f'{O}/editor_{w}x{h}.png')
        print(w,h,pg.evaluate("""()=>{const q=document.querySelector('.e7-chips'),r=q.getBoundingClientRect(),pn=document.querySelector('.e7-panel').getBoundingClientRect();return {chips:[r.left,r.top,r.right,r.bottom],panel:[pn.left,pn.top,pn.right,pn.bottom],sw:q.scrollWidth,cw:q.clientWidth,win:[innerWidth,innerHeight]}}"""))
    b.close()
