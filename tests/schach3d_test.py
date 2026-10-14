#!/usr/bin/env python3
"""Schach-3D Funktions-Test (Playwright, headless Chromium): python3 tests/schach3d_test.py
Prüft: keine JS-Fehler, Klick-Auswahl per Raycast, Drehen/Zoom/Pinch, Wenden/Auto-Wenden, Zug-Animationen aller Angreifer
(klassisch + Hunde), Rochade, Umwandlung, en passant, Abbruch durch neuen Zug, Stellung während Animation, Namensschild,
Thema/Qualität, Aufräumen, Phone-Größe, 2D-Animation. Bilder: tests/out/schach3d/"""
import sys, os, socket, subprocess, time
from playwright.sync_api import sync_playwright

basis = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
out = os.path.join(basis, 'tests', 'out', 'schach3d'); os.makedirs(out, exist_ok=True)
fehler, ergebnisse = [], []

def pruefe(name, ok, info=''):
    ergebnisse.append(bool(ok)); print(('OK   ' if ok else 'FAIL ') + name + (' – ' + str(info) if info != '' else ''), flush=True)

s = socket.socket(); s.bind(('127.0.0.1', 0)); port = s.getsockname()[1]; s.close()
srv = subprocess.Popen(['node', os.path.join(basis, 'server', 'server.js'), '--port', str(port), '--host', '127.0.0.1'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
for _ in range(80):
    try: socket.create_connection(('127.0.0.1', port), timeout=0.2).close(); break
    except OSError: time.sleep(0.1)
URL = 'http://127.0.0.1:%d/spiele/schach/3d/demo.html' % port
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']

def neu(p, extra='', w=1100, h=720):
    b = p.chromium.launch(args=ARGS)
    pg = b.new_page(viewport={'width': w, 'height': h})
    pg.on('pageerror', lambda e: fehler.append('pageerror: ' + str(e)))
    pg.on('console', lambda m: fehler.append('console: ' + m.text) if m.type == 'error' else None)
    pg.goto(URL + '?manuell&q=hoch' + extra); pg.wait_for_function('window.demo && window.s3')
    pg.evaluate('demo.schritt(0.05)')
    return b, pg

def ev(pg, js): return pg.evaluate(js)

with sync_playwright() as p:
    b, pg = neu(p)
    # --- Raycast-Klick
    box = pg.query_selector('#buehne').bounding_box()
    ev(pg, 'window.__k = []; demo.s3.onFeldKlick((r,c)=>window.__k.push([r,c]))')
    def klick_feld(r, c, hoehe=0.0):
        q = ev(pg, 'demo.s3.feldBildschirm(%d,%d,%f)' % (r, c, hoehe))
        pg.mouse.click(box['x'] + q['x'], box['y'] + q['y'])
    klick_feld(6, 4, 0.5)       # Weißer Bauer e2 (Figur)
    klick_feld(4, 4)            # leeres Feld e4
    klick_feld(0, 3, 0.7)       # schwarze Dame
    k = ev(pg, 'window.__k')
    pruefe('Klick auf Figur/Feld meldet Zeile/Spalte', k == [[6, 4], [4, 4], [0, 3]], k)
    # Klick neben das Brett: kein Callback
    pg.mouse.click(box['x'] + 5, box['y'] + 5)
    pruefe('Klick neben das Brett ohne Callback', len(ev(pg, 'window.__k')) == 3)
    # --- Drehen/Neigen/Zoom per Maus
    az0 = ev(pg, 'demo.s3._kam.az'); el0 = ev(pg, 'demo.s3._kam.el'); d0 = ev(pg, 'demo.s3._kam.dist')
    cx, cy = box['x'] + box['width'] / 2, box['y'] + box['height'] * 0.4
    pg.mouse.move(cx, cy); pg.mouse.down(); pg.mouse.move(cx + 100, cy + 30, steps=5); pg.mouse.up()
    az1 = ev(pg, 'demo.s3._kam.az'); el1 = ev(pg, 'demo.s3._kam.el')
    pruefe('Ziehen nach rechts dreht (az -0,8)', abs((az1 - az0) + 0.8) < 0.05, round(az1 - az0, 3))
    pruefe('Ziehen nach unten neigt (el +0,18)', abs((el1 - el0) - 0.18) < 0.05, round(el1 - el0, 3))
    pruefe('Drag löst keinen Klick aus', len(ev(pg, 'window.__k')) == 3)
    pg.mouse.move(cx, cy); pg.mouse.wheel(0, 200)
    d1 = ev(pg, 'demo.s3._kam.dist')
    pruefe('Mausrad zoomt (Abstand wächst)', d1 > d0 + 0.5, (d0, d1))
    pg.mouse.wheel(0, -5000)
    pruefe('Zoom begrenzt auf 6,5', abs(ev(pg, 'demo.s3._kam.dist') - 6.5) < 1e-6)
    # Pinch (zwei Zeiger)
    ev(pg, 'demo.s3.kameraSetzen(0, 0.8, 12)')
    ev(pg, '''(()=>{ const cv = demo.s3.canvas; const r = cv.getBoundingClientRect(); const mk=(t,id,x,y)=>cv.dispatchEvent(new PointerEvent(t,{pointerId:id,clientX:r.left+x,clientY:r.top+y,bubbles:true,pointerType:'touch'}));
      mk('pointerdown',1,300,300); mk('pointerdown',2,400,300); mk('pointermove',1,250,300); mk('pointermove',2,450,300); mk('pointerup',1,250,300); mk('pointerup',2,450,300); })()''')
    pruefe('Pinch auseinander zoomt hinein', ev(pg, 'demo.s3._kam.dist') < 11, ev(pg, 'demo.s3._kam.dist'))
    ev(pg, 'demo.s3.kameraSetzen(0, 0.8, 12.4)')
    # --- Wenden
    ev(pg, '(demo.s3.wenden(), 0)'); ev(pg, 'demo.schritt(1.2)')
    pruefe('Wenden fährt auf π', abs(ev(pg, 'demo.s3._kam.az') - 3.14159) < 0.01, ev(pg, 'demo.s3._kam.az'))
    pg.evaluate('demo.schritt(0.1)'); pg.query_selector('#buehne').screenshot(path=os.path.join(out, 'gewendet.png'))
    ev(pg, '(demo.s3.wenden(), 0)'); ev(pg, 'demo.schritt(1.2)')
    pruefe('Zurückwenden fährt auf 0 (mod 2π)', abs(ev(pg, 'demo.s3._kam.az') % 6.283185307179586) < 0.01 or abs(ev(pg, 'demo.s3._kam.az') % 6.283185307179586 - 6.283185307179586) < 0.01)
    # kurzer Weg: von 0.2 aus wenden → nächstliegende Entsprechung
    ev(pg, 'demo.s3.kameraSetzen(7.0)')   # 7.0 ≈ 2π + 0.72
    ev(pg, '(demo.s3.wenden(true), 0)'); ev(pg, 'demo.schritt(1.2)')
    pruefe('Wenden nimmt kürzesten Weg (7,0 → 3π ≈ 9,42 ... oder π)', min(abs(ev(pg, 'demo.s3._kam.az') - 3.14159), abs(ev(pg, 'demo.s3._kam.az') - 9.4248)) < 0.01, ev(pg, 'demo.s3._kam.az'))
    ev(pg, 'demo.s3.kameraSetzen(0); demo.s3._schwarz=false')
    # --- Zugmechanik: je Angreifer klassisch/Hunde
    for dog in (False, True):
        ev(pg, 'demo.s3.hunde(%s)' % ('true' if dog else 'false'))
        for typ in ['knight', 'rook', 'bishop', 'queen', 'pawn', 'king']:
            ev(pg, "window.__fertig=false; void kampfStart('%s').then(()=>{window.__fertig=true})" % typ)
            ev(pg, 'demo.schritt(0.3)')
            mitte = ev(pg, 'demo.s3.animiert')
            ev(pg, 'demo.schritt(3.0)')
            fertig = ev(pg, 'window.__fertig')
            n = ev(pg, 'demo.s3.pieces.size'); soll = ev(pg, 'demo.s3.gitter.flat().filter(Boolean).length')
            kinder = ev(pg, 'demo.s3.piecesRoot.children.length')
            rest = ev(pg, 'demo.s3.fxRoot.children.length')
            pruefe('Kampf %s%s: Promise erfüllt, Opfer entfernt, Effekte aufgeräumt' % (typ, ' (Hunde)' if dog else ''),
                   mitte and fertig and n == soll and kinder == soll and rest == 0, (mitte, fertig, n, soll, kinder, rest))
    ev(pg, 'demo.s3.hunde(false)')
    # --- Kampf aus → einfacher Zug
    ev(pg, 'demo.s3.kampf(false)')
    t = ev(pg, "window.__f=false; (kampfStart('rook').then(()=>{window.__f=true}), 0)"); ev(pg, 'demo.schritt(0.9)')
    pruefe('Kampf aus: Zug nach ~0,9 s fertig (kein Kampf)', ev(pg, 'window.__f'))
    ev(pg, 'demo.s3.kampf(true)')
    # --- Rochade
    ev(pg, "document.getElementById('bRochade').click()"); ev(pg, 'demo.schritt(1.5)')
    ok = ev(pg, "(()=>{const s=demo.s3; const k=s.pieces.get(7*8+6), r=s.pieces.get(7*8+5); return !!k&&!!r&&k.userData.typ==='king'&&r.userData.typ==='rook'&&Math.abs(r.position.x-1.5)<1e-3&&Math.abs(k.position.x-2.5)<1e-3})()")
    pruefe('Rochade: König g1, Turm f1', ok)
    # --- Umwandlung
    ev(pg, "document.getElementById('bUmw').click()"); ev(pg, 'demo.schritt(1.5)')
    ok = ev(pg, "(()=>{const n=demo.s3.pieces.get(0*8+4); return !!n && n.userData.typ==='queen' && n.userData.farbe==='white'})()")
    pruefe('Umwandlung: weiße Dame auf e8', ok)
    # --- en passant (Opfer neben dem Zielfeld)
    ev(pg, '''(()=>{ const g=demo.start(); g[3][3]={color:'white',type:'pawn'}; g[6][3]=null; g[3][4]={color:'black',type:'pawn'}; g[1][4]=null; demo.s3.setzeStellung(g);
        window.__ep=false; demo.s3.animiereZug({from:{row:3,col:3},to:{row:2,col:4},isEnPassant:true,capturedPiece:{type:'pawn'}}).then(()=>{window.__ep=true}) })()''')
    ev(pg, 'demo.schritt(2.5)')
    ok = ev(pg, "window.__ep && !demo.s3.pieces.get(3*8+4) && !!demo.s3.pieces.get(2*8+4) && demo.s3.gitter[3][4]===null")
    pruefe('en passant: Opfer neben dem Ziel entfernt', ok)
    # --- Abbruch durch neuen Zug / Stellung während Animation
    ev(pg, '''(()=>{ demo.s3.setzeStellung(demo.start()); window.__a=0; window.__b=0;
        demo.s3.animiereZug({from:{row:6,col:4},to:{row:4,col:4}}).then(()=>window.__a=1);
        demo.s3.vorspulen(0.2);
        demo.s3.animiereZug({from:{row:1,col:4},to:{row:3,col:4}}).then(()=>window.__b=1); })()''')
    pruefe('Neuer Zug beendet laufenden sofort (Promise 1 erfüllt)', ev(pg, 'window.__a') == 1 and ev(pg, 'window.__b') == 0)
    ev(pg, 'demo.schritt(1.5)')
    ok = ev(pg, "!!demo.s3.pieces.get(4*8+4) && !!demo.s3.pieces.get(3*8+4) && demo.s3.pieces.size===32")
    pruefe('Beide Züge ausgeführt, 32 Figuren', ok and ev(pg, 'window.__b') == 1)
    ev(pg, '''(()=>{ const s=demo.s3; const g=demo.start(); s.setzeStellung(g);
        s.animiereZug({from:{row:6,col:0},to:{row:5,col:0}}); const g2=demo.start(); g2[6][0]=null; g2[5][0]={color:'white',type:'pawn'}; g2[1][7]=null; g2[2][7]={color:'black',type:'pawn'};
        s.setzeStellung(g2); })()''')
    ev(pg, 'demo.schritt(1.5)')
    ok = ev(pg, "!!demo.s3.pieces.get(2*8+7) && !demo.s3.pieces.get(1*8+7) && !!demo.s3.pieces.get(5*8)")
    pruefe('setzeStellung während Animation wird danach angewendet', ok)
    # --- Auto-Wenden
    ev(pg, 'demo.s3.kameraSetzen(0); demo.s3._schwarz=false; demo.s3.autoWenden(true)')
    ev(pg, "demo.s3.setzeStellung(demo.start()); demo.s3.animiereZug({from:{row:6,col:4},to:{row:4,col:4}}); demo.schritt(1.3); demo.schritt(1.2)")
    pruefe('Auto-Wenden: nach Weiß-Zug Blick von Schwarz', abs(ev(pg, 'demo.s3._kam.az') - 3.14159) < 0.02, ev(pg, 'demo.s3._kam.az'))
    ev(pg, 'demo.s3.autoWenden(false)')
    # --- Namensschild
    ev(pg, "demo.s3.setzeStellung(demo.start()); demo.s3.namensschild({row:7,col:1},'Falko'); demo.schritt(0.1)")
    pruefe('Namensschild als Sprite an der Figur', ev(pg, "demo.s3.pieces.get(7*8+1).children.some(c=>c.name==='namensschild')"))
    ev(pg, "demo.s3.animiereZug({from:{row:7,col:1},to:{row:5,col:2}}); demo.schritt(1.5)")
    pruefe('Namensschild zieht mit', ev(pg, "demo.s3.pieces.get(5*8+2).children.some(c=>c.name==='namensschild')") and not ev(pg, "demo.s3.pieces.get(7*8+1)"))
    ev(pg, "demo.s3.namensschild({row:5,col:2},''); demo.schritt(0.1)")
    pruefe('Namensschild entfernen', not ev(pg, "demo.s3.pieces.get(5*8+2).children.some(c=>c.name==='namensschild')"))
    # --- Thema / Qualität / Stat
    for t in range(6): ev(pg, 'demo.s3.setzeThema(%d)' % t)
    ev(pg, "demo.s3.setzeThema(1); demo.s3.setzeStellung(demo.start()); demo.s3.kameraSetzen(0,0.8,12.4); demo.schritt(0.1)"); pg.query_selector('#buehne').screenshot(path=os.path.join(out, 'thema_holz.png'))
    for q in ['mittel', 'niedrig', 'hoch']:
        ev(pg, "demo.s3.qualitaet('%s'); demo.schritt(0.1)" % q)
    pruefe('Qualität umschaltbar', ev(pg, 'demo.s3.statistik().stufe') == 'hoch')
    ev(pg, "demo.s3.setzeThema(0)")
    # --- Hunde-Umschalten live + Plaketten
    ev(pg, "demo.s3.hunde(true); demo.schritt(0.1)")
    pruefe('Hunde live: 32 Köpfe', ev(pg, "(()=>{let n=0; demo.s3.piecesRoot.traverse(o=>{if(o.name==='hundekopf')n++}); return n})()") == 32)
    st = ev(pg, 'demo.s3.statistik()')
    pruefe('Draw-Calls Hunde-Startstellung < 400', st['drawCalls'] < 400, st)
    ev(pg, "demo.s3.hunde(false); demo.schritt(0.1)")
    st = ev(pg, 'demo.s3.statistik()'); pruefe('Draw-Calls klassisch < 150', st['drawCalls'] < 150, st)
    b.close()

    # --- Phone-Größe (Hochformat → horizontales Sichtfeld)
    b, pg = neu(p, '', 390, 800)
    pg.evaluate('demo.schritt(0.2)')
    pg.screenshot(path=os.path.join(out, 'phone.png'))
    pruefe('Phone: Seite ohne Horizontalscroll', pg.evaluate('document.documentElement.scrollWidth <= window.innerWidth + 1'))
    fov = pg.evaluate('demo.s3.kamera.fov'); pruefe('Phone: Hochformat-Sichtfeld angepasst', fov > 40, fov)
    b.close()

    # --- 2D-Animation
    b, pg = neu(p, '', 900, 1400)
    ev(pg, "window.__z=0; an2.animiere({typ:'knight',weiss:true,schlag:{typ:'pawn',weiss:false},von:{x:100,y:300},nach:{x:200,y:150},zelle:48}).then(()=>window.__z=1)")
    ev(pg, 'an2.einfrieren(0.2)'); pg.query_selector('#brett2d').screenshot(path=os.path.join(out, 'anim2d_gleiten.png'))
    ev(pg, 'an2.einfrieren(0.55)'); pg.query_selector('#brett2d').screenshot(path=os.path.join(out, 'anim2d_kampf.png'))
    ev(pg, 'an2.abbrechen()'); pruefe('2D: abbrechen erfüllt Promise', ev(pg, 'window.__z') == 1)
    ev(pg, "an2.animiere({typ:'queen',weiss:true,schlag:{typ:'rook',weiss:false},von:{x:100,y:300},nach:{x:200,y:150},zelle:48,hunde:true}); an2.einfrieren(0.9)")
    pg.query_selector('#brett2d').screenshot(path=os.path.join(out, 'anim2d_show.png'))
    ev(pg, 'an2.abbrechen()')
    # echte Zeit: Klick-Züge im 2D-Brett (läuft mit requestAnimationFrame)
    ev(pg, "klick2(6,4); klick2(4,4)"); pg.wait_for_function('window.an2.laeuft === false', timeout=5000)
    pruefe('2D: Zug per Klick läuft durch', ev(pg, 'an2.laeuft') is False)
    b.close()

print('JS-Fehler:', fehler if fehler else 'keine')
pruefe('keine JS-Fehler', not fehler)
srv.terminate()
print('\n%d/%d OK' % (sum(ergebnisse), len(ergebnisse)))
sys.exit(0 if all(ergebnisse) else 1)
