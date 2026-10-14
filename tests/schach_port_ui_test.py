#!/usr/bin/env python3
"""Schach-Oberflächen-Port (Swift-App im Browser) – UI-Test: python3 tests/schach_port_ui_test.py
Menü, Spiel gegen Computer (mehrere Stufen), Akademie-Aufgabe, Tipp (2 Stufen), Zugbewertung, Zurücknehmen, Umwandlung,
3D an/aus, Hunde, Kampf, Wenden, Online mit 2 Browsern, Handy-Größe, keine JS-Fehler. Bilder: tests/out/schach_port/"""
import sys, os, socket, subprocess, time
os.environ.setdefault('PLAYWRIGHT_BROWSERS_PATH', '/opt/pw-browsers')
from playwright.sync_api import sync_playwright

basis = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
out = os.path.join(basis, 'tests', 'out', 'schach_port'); os.makedirs(out, exist_ok=True)
fehler, ergebnisse = [], []

def pruefe(name, ok, info=''):
    ergebnisse.append(bool(ok)); print(('OK   ' if ok else 'FAIL ') + name + (' – ' + str(info) if info != '' else ''), flush=True)

s = socket.socket(); s.bind(('127.0.0.1', 0)); port = s.getsockname()[1]; s.close()
srv = subprocess.Popen(['node', os.path.join(basis, 'server', 'server.js'), '--port', str(port), '--host', '127.0.0.1'], stdout=open('/tmp/claude-0/srv.log','w'), stderr=subprocess.STDOUT)
for _ in range(80):
    try: socket.create_connection(('127.0.0.1', port), timeout=0.2).close(); break
    except OSError: time.sleep(0.1)
URL = 'http://127.0.0.1:%d/spiele/schach/' % port
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']

def neu(p, w=1100, h=760, url=URL, touch=False):
    b = p.chromium.launch(args=ARGS)
    ctx = b.new_context(viewport={'width': w, 'height': h}, has_touch=touch, is_mobile=touch, locale='de-DE')
    pg = ctx.new_page()
    pg.on('pageerror', lambda e: fehler.append('pageerror: ' + str(e)))
    pg.on('console', lambda m: fehler.append('console: ' + m.text) if m.type == 'error' else None)
    pg.goto(url); pg.wait_for_function('window.__schach && document.querySelector(".karte")')
    return b, pg

def ev(pg, js): return pg.evaluate(js)
def shot(pg, name): pg.screenshot(path=os.path.join(out, name + '.png'))
def warte(pg, js, t=20000):
    try: pg.wait_for_function(js, timeout=t); return True
    except Exception: return False
def text(pg, sel): 
    n = pg.query_selector(sel); return n.inner_text() if n else ''
def frei(pg): return warte(pg, 'window.__schach && !__schach.brettBeschaeftigt() ', 15000)

def feld_xy(pg, r, c):
    """Bildschirmposition eines Feldes (2D oder 3D)"""
    return ev(pg, '''(()=>{const A=__schach,S=A.S;
      if(S.use3D&&S.s3){const q=S.s3.feldBildschirm(%d,%d,0.2);const b=S.b3dEl.getBoundingClientRect();return {x:b.left+q.x,y:b.top+q.y};}
      const m=S.b2d.mitte({row:%d,col:%d});const b=S.b2d.cv.getBoundingClientRect();return {x:b.left+m.x,y:b.top+m.y};})()''' % (r, c, r, c))
def klick(pg, r, c):
    q = feld_xy(pg, r, c); pg.mouse.click(q['x'], q['y'])
UCI = lambda u: (8 - int(u[1]), ord(u[0]) - 97, 8 - int(u[3]), ord(u[2]) - 97)
def zug(pg, u, warten=True):
    a, b, c, d = UCI(u); klick(pg, a, b); pg.wait_for_timeout(120); klick(pg, c, d)
    if warten: pg.wait_for_timeout(500); frei(pg); pg.wait_for_timeout(150); frei(pg)
def hist(pg): return ev(pg, '__schach.partie.gameMoveHistory.slice()')
def stat(pg): return text(pg, '#status')
def start_ki(pg, stufe=3, ohne_namen=True):
    pg.evaluate('(s)=>{const r=document.getElementById("regler");r.value=s;r.dispatchEvent(new Event("input"))}', stufe)
    pg.click('#k-ki'); pg.wait_for_selector('.alarm'); pg.click('.alarm button:has-text("Ohne Namen")')
    pg.wait_for_selector('#status'); frei(pg)

with sync_playwright() as p:
    # ============================================================ Menü
    b, pg = neu(p)
    shot(pg, '01_menue')
    pruefe('Menü: Titel + 5 Karten', text(pg, '.titel') == 'Schach' and len(pg.query_selector_all('.karte')) == 5, len(pg.query_selector_all('.karte')))
    pruefe('Menü: Mini-Brett gezeichnet', ev(pg, 'document.getElementById("mini").width') == 180)
    pruefe('Menü: Spielstärke-Text', 'Mittel' in text(pg, '#stufe-name') or text(pg, '#stufe-name') != '', text(pg, '#stufe-name'))

    # ============================================================ Spiel gegen Computer (Stufe 1)
    pg.click('#k-ki'); pg.wait_for_selector('.alarm')
    pruefe('Namensdialog erscheint', 'Wie heisst du' in text(pg, '.alarm'))
    pg.fill('#w-n', 'Anna'); shot(pg, '02_namensdialog'); pg.click('.alarm button:has-text("Los geht")')
    pg.wait_for_selector('#status'); frei(pg); pg.wait_for_timeout(500)
    pruefe('Spiel startet: Weiß am Zug', 'Weiss' in stat(pg) or 'Du' in stat(pg) or 'Zug' in stat(pg), stat(pg))
    pruefe('3D-Brett läuft (Standard)', ev(pg, '__schach.S.use3D && !!__schach.S.s3'))
    shot(pg, '03_spiel_3d')
    zug(pg, 'e2e4')
    pruefe('Zug e2e4 gespielt', hist(pg)[:1] == ['e2e4'], hist(pg))
    pruefe('Computer antwortet', warte(pg, '__schach.partie.gameMoveHistory.length>=2', 30000), hist(pg))
    frei(pg); pg.wait_for_timeout(500)
    shot(pg, '04_nach_zug_3d')
    # --- 2D umschalten
    pg.click('#b-3d'); pg.wait_for_timeout(300)
    pruefe('3D aus → 2D-Brett sichtbar', not ev(pg, '__schach.S.use3D') and pg.query_selector('#b2dwrap canvas') is not None)
    shot(pg, '05_spiel_2d')
    zug(pg, 'g1f3')
    pruefe('2D-Klickzug', len(hist(pg)) >= 3 and hist(pg)[2] == 'g1f3', hist(pg))
    warte(pg, '__schach.partie.gameMoveHistory.length>=4', 30000); frei(pg)
    # --- Tipp 2 Stufen
    warte(pg, '!__schach.partie.computerThinking && __schach.partie.currentPlayer===0', 30000)
    pg.click('#b-tipp'); warte(pg, 'document.getElementById("blasetext").textContent.length>5', 15000)
    t1 = text(pg, '#blasetext'); pruefe('Tipp Stufe 1: Blase mit Text', len(t1) > 5, t1[:60])
    shot(pg, '06_tipp1')
    pg.click('#b-tipp'); pg.wait_for_timeout(500)
    pruefe('Tipp Stufe 2: Pfeil', ev(pg, '!!__schach.S.b2d.hinweisPfeil'), text(pg, '#blasetext')[:60])
    shot(pg, '07_tipp2')
    # --- Hunde / Kampf / Wenden / Farben
    pg.click('#b-hunde'); pg.wait_for_timeout(300)
    pruefe('Hunde an (2D)', ev(pg, '__schach.S.dogs && __schach.S.b2d.hunde'), stat(pg)[:40]); shot(pg, '08_hunde_2d')
    pg.click('#b-kampf'); pg.wait_for_timeout(200); pruefe('Kampf umschaltbar', 'Kampf' in text(pg, '#b-kampf'), text(pg, '#b-kampf'))
    pg.click('#b-kampf')
    pg.click('#b-wenden'); pg.wait_for_timeout(300); pruefe('Wenden dreht das Brett', ev(pg, '__schach.S.b2d.vonSchwarz'))
    shot(pg, '09_gewendet'); pg.click('#b-wenden')
    th0 = ev(pg, '__schach.S.theme'); pg.click('#b-farben'); pruefe('Farben wechselt Thema', ev(pg, '__schach.S.theme') == (th0 + 1) % 6)
    pg.click('#b-hunde')
    # --- Zugwert
    pg.click('#b-zugwert'); pg.wait_for_timeout(300)
    pruefe('Zugwert einschaltbar (Analyse-Fenster)', ev(pg, '__schach.partie.analysisEnabled') and not ev(pg, 'document.getElementById("analyse").classList.contains("hidden")'))
    n0 = len(hist(pg))
    if n0 % 2 == 0:
        zug(pg, 'd2d4'); pg.wait_for_timeout(500)
        pruefe('Zugwert: Bewertung 1–15 im Text', warte(pg, '/\\d+\\s*\\/\\s*15|[0-9]+ von 15|Zugwert/.test(document.getElementById("atext").textContent)', 25000), text(pg, '#atext')[:120])
        shot(pg, '10_zugwert')
    # --- Zurücknehmen (Taste z)
    n1 = len(hist(pg)); warte(pg, '!__schach.partie.computerThinking && __schach.partie.currentPlayer===0', 30000); n1 = len(hist(pg))
    pg.keyboard.press('z'); pg.wait_for_timeout(500)
    pruefe('Zurücknehmen entfernt Züge', len(hist(pg)) < n1, '%d → %d' % (n1, len(hist(pg))))
    # --- Menü per Dropdown
    pg.click('#b-dd'); pg.wait_for_selector('#dropdown'); shot(pg, '11_dropdown'); pg.keyboard.press('Escape')
    pg.click('#b-zur'); pg.wait_for_selector('#k-ki')
    pruefe('← Menü führt zurück', True)
    b.close()

with sync_playwright() as p:
    # ============================================================ PvP: Auto-Wenden, Umwandlung, Hunde 3D, Kampf 3D
    b, pg = neu(p)
    pg.click('#k-pvp'); pg.wait_for_selector('.alarm')
    pg.fill('#w-n', 'Mia'); pg.fill('#s-n', 'Tom'); pg.click('.alarm button:has-text("Los geht")')
    pg.wait_for_selector('#status'); frei(pg)
    pruefe('PvP: Namen im Status', 'Mia' in stat(pg), stat(pg))
    pg.keyboard.press('a'); pg.wait_for_timeout(200)
    zug(pg, 'e2e4'); pg.wait_for_timeout(1500); frei(pg)
    pruefe('Auto-Wenden: Brett dreht nach dem Zug zu Schwarz', ev(pg, '__schach.S.vonSchwarz'), ev(pg, '__schach.S.autoFlip'))
    shot(pg, '12_pvp_autowenden')
    zug(pg, 'e7e5'); pg.wait_for_timeout(1800); frei(pg)
    pruefe('Auto-Wenden: und wieder zurück', not ev(pg, '__schach.S.vonSchwarz'))
    pg.keyboard.press('a'); pg.wait_for_timeout(1500); frei(pg)
    pg.click('#b-hunde'); pg.wait_for_timeout(800)
    pruefe('3D-Hunde: an', ev(pg, '__schach.S.dogs && __schach.S.use3D'))
    shot(pg, '13_hunde_3d')
    for u in ('g1f3', 'b8c6', 'f1b5', 'a7a6', 'b5c6'): zug(pg, u)
    pruefe('Schlagzug mit 3D-Kampf gespielt', len(hist(pg)) == 7, hist(pg))
    shot(pg, '14_schlag_3d')
    pg.click('#b-hunde')
    FEN = 'ev(pg, "(()=>{const A=__schach,K=A.K,p=A.partie;p.board=K.ChessBoard.fromFEN(\'8/P6k/8/8/8/8/8/K7 w - - 0 1\');p.currentPlayer=0;p.gameMoveHistory=[];p.gameOver=false;p.updateUI();})()")'
    exec(FEN); pg.wait_for_timeout(500)
    zug(pg, 'a7a8', warten=False)
    pg.wait_for_selector('.alarm'); pruefe('Umwandlungsdialog (3D)', 'Bauernumwandlung' in text(pg, '.alarm'))
    shot(pg, '15_umwandlung'); pg.keyboard.press('t'); pg.wait_for_timeout(800); frei(pg)
    pruefe('Umwandlung in Turm per Taste', ev(pg, '__schach.partie.board.grid[0][0] && __schach.partie.board.grid[0][0].type') == 4)
    pg.click('#b-3d'); pg.wait_for_timeout(300)
    exec(FEN); pg.wait_for_timeout(300)
    zug(pg, 'a7a8', warten=False); pg.wait_for_selector('.alarm'); pg.click('.alarm button:has-text("Dame")'); pg.wait_for_timeout(800); frei(pg)
    pruefe('Umwandlung per Klick (Dame, 2D)', ev(pg, '__schach.partie.board.grid[0][0].type') == 5)
    b.close()

    # ============================================================ Akademie
    b, pg = neu(p)
    pg.click('#k-akad'); pg.wait_for_selector('#profil-name'); shot(pg, '16_akademie_start')
    pg.fill('#profil-name', 'Lena'); pg.click('#akad-los'); pg.wait_for_selector('.stufe-karte')
    pruefe('Akademie: 10 Stufenkarten', len(pg.query_selector_all('.stufe-karte')) == 10, len(pg.query_selector_all('.stufe-karte')))
    shot(pg, '17_akademie_stufen')
    pg.click('.stufe-karte[data-stufe="1"]'); pg.wait_for_selector('.stufe-karte[data-lektion]'); shot(pg, '18_akademie_aufgaben')
    pg.click('.stufe-karte[data-lektion]'); pg.wait_for_selector('#erkl-text'); frei(pg); pg.wait_for_timeout(400)
    pruefe('Akademie: Erklärtext', len(text(pg, '#erkl-text')) > 20, text(pg, '#erkl-text')[:70]); shot(pg, '19_aufgabe')
    les = ev(pg, '({id:__schach.partie.currentLesson.id,sol:__schach.partie.currentLesson.solutions,free:__schach.partie.currentLesson.freePlayMoves})')
    pg.click('#b-tipp'); pg.wait_for_timeout(300)
    falsch = ev(pg, '(()=>{const A=__schach,p=A.partie,K=A.K;return p.board.allLegalMoves(p.currentPlayer).map(K.moveToUci).filter(u=>!p.currentLesson.solutions.includes(u))[0]})()')
    zug(pg, falsch); pg.wait_for_timeout(500)
    pruefe('Falscher Zug: Hinweis „nicht die Loesung“', 'nicht die Loesung' in text(pg, '#erkl-text'), text(pg, '#erkl-text')[:80])
    shot(pg, '20_aufgabe_falsch')
    pg.wait_for_timeout(2500)
    zug(pg, les['sol'][0]); pg.wait_for_timeout(600)
    pruefe('Aufgabe gelöst: RICHTIG', 'RICHTIG' in text(pg, '#erkl-text'), text(pg, '#erkl-text')[:60])
    pruefe('„Weiter →“ sichtbar', pg.query_selector('#b-weiter') is not None and not ev(pg, 'document.getElementById("b-weiter").classList.contains("hidden")'))
    shot(pg, '21_aufgabe_geloest')
    pg.click('#b-weiter'); pg.wait_for_timeout(600)
    pruefe('Nächste Aufgabe startet', ev(pg, '__schach.partie.currentLesson.id') != les['id'], ev(pg, '__schach.partie.currentLesson.id'))
    pg.click('#b-zur'); pg.wait_for_selector('.stufe-karte[data-lektion]')
    pruefe('Fortschritt gespeichert (✅)', '✅' in text(pg, '.stufe-karte[data-lektion]'))
    b.close()

    # ============================================================ Training mit Coach
    b, pg = neu(p)
    pg.click('#k-tut'); pg.wait_for_selector('#status'); frei(pg); pg.wait_for_timeout(500)
    pruefe('Training: Coach-Panel + Zurück-Knopf', pg.query_selector('#erkl') is not None and pg.query_selector('#b-zurueck') is not None)
    shot(pg, '22_training')
    zug(pg, 'e2e4'); pg.wait_for_timeout(1500); frei(pg)
    pruefe('Training: Erklärung nach Zug', len(text(pg, '#erkl-text')) > 20, text(pg, '#erkl-text')[:60]); shot(pg, '23_training_erkl')
    b.close()

    # ============================================================ Stufen 1/5/10
    for st in (1, 5, 10):
        b, pg = neu(p)
        start_ki(pg, st)
        zug(pg, 'd2d4')
        ok = warte(pg, '__schach.partie.gameMoveHistory.length>=2', 90000 if st == 10 else 30000)
        pruefe('KI Stufe %d antwortet' % st, ok, hist(pg))
        if st == 10: shot(pg, '24_stufe10')
        b.close()

with sync_playwright() as p:
    # ============================================================ Online mit 2 Browsern
    b1, a = neu(p); b2, c = neu(p)
    a.click('#k-online'); a.wait_for_selector('#codefeld'); shot(a, '25_online_lobby')
    a.click('[data-seite="w"]'); a.click('[data-a="erstellen"]'); a.wait_for_selector('#codegross')
    code = text(a, '#codegross').strip(); pruefe('Warteraum: Code + QR', len(code) == 4 and a.query_selector('.qr svg') is not None, code)
    shot(a, '26_online_warteraum')
    c.click('#k-online'); c.wait_for_selector('#codefeld'); c.fill('#codefeld', code); c.click('[data-a="beitreten"]')
    a.wait_for_selector('#status'); c.wait_for_selector('#status'); a.wait_for_timeout(800); c.wait_for_timeout(800); frei(a); frei(c)
    pruefe('Beide im Spiel', a.query_selector('#onlineinfo') is not None and c.query_selector('#onlineinfo') is not None, text(a, '#onlineinfo'))
    pruefe('Online: kein Tipp/Zugwert-Knopf', a.query_selector('#b-tipp') is None and a.query_selector('#b-zugwert') is None)
    pruefe('Weiß = Ersteller, Schwarz sieht von Schwarz', not ev(a, '__schach.S.vonSchwarz') and ev(c, '__schach.S.vonSchwarz'))
    pruefe('Status: Du bist am Zug / wartet', 'Du bist am Zug' in stat(a) and 'am Zug' in stat(c), (stat(a), stat(c)))
    shot(a, '27_online_spiel_weiss'); shot(c, '28_online_spiel_schwarz')
    # Schwarz darf nicht ziehen
    zug(c, 'e7e5', warten=False); c.wait_for_timeout(500); pruefe('Schwarz kann nicht außer der Reihe ziehen', hist(c) == [], hist(c))
    zug(a, 'e2e4'); c.wait_for_timeout(1500); frei(c)
    pruefe('Zug kommt beim Gegner an', hist(c) == ['e2e4'] and hist(a) == ['e2e4'], (hist(a), hist(c)))
    zug(c, 'e7e5'); a.wait_for_timeout(1500); frei(a)
    pruefe('Gegenzug kommt an', hist(a) == ['e2e4', 'e7e5'], hist(a))
    # Wiederverbinden (Reload von A)
    a.reload(timeout=90000); a.wait_for_selector('#status', timeout=30000); a.wait_for_timeout(1500); frei(a)
    pruefe('Wiederverbinden nach Reload', hist(a) == ['e2e4', 'e7e5'] and ev(a, '__schach.S.online'), hist(a))
    # Schnelles Matt: Schäfermatt (nach e4 e5)
    for sp_, u in ((a, 'f1c4'), (c, 'b8c6'), (a, 'd1h5'), (c, 'g8f6'), (a, 'h5f7')):
        zug(sp_, u); a.wait_for_timeout(900); c.wait_for_timeout(900)
    pruefe('Schachmatt-Dialog bei beiden', warte(a, 'document.querySelector(".alarm")', 20000) and warte(c, 'document.querySelector(".alarm")', 20000), text(a, '.alarm')[:80])
    shot(a, '29_online_matt')
    a.click('.alarm button:has-text("Revanche")'); c.wait_for_timeout(500)
    pruefe('Gegner sieht Revanche-Wunsch', 'Revanche' in text(c, '.alarm'), text(c, '.alarm')[:80])
    c.click('.alarm button:has-text("Revanche")'); a.wait_for_timeout(1500); c.wait_for_timeout(500); frei(a)
    pruefe('Revanche: neue Runde, Farben getauscht', hist(a) == [] and ev(a, '__schach.S.vonSchwarz') and not ev(c, '__schach.S.vonSchwarz'), (hist(a), ev(a, '__schach.S.vonSchwarz')))
    shot(a, '30_online_revanche')
    # Aufgeben
    c.click('#b-on'); c.wait_for_selector('.alarm'); c.click('.alarm button:has-text("Aufgeben")'); a.wait_for_selector('.alarm', timeout=10000)
    pruefe('Aufgeben beendet das Spiel', 'gewinnt' in text(a, '.alarm') or 'aufgegeben' in text(a, '.alarm').lower(), text(a, '.alarm')[:80])
    # 3D/2D lokal wählbar online
    a.click('.alarm button:has-text("Hauptmenu")'); a.wait_for_selector('#k-ki')
    pruefe('Hauptmenü nach Online', True)
    b1.close(); b2.close()

    # ============================================================ Handy-Größe, Touch
    b, pg = neu(p, w=390, h=780, touch=True)
    def ueberlauf(pg): return ev(pg, 'document.documentElement.scrollWidth > window.innerWidth + 1')
    pruefe('Handy: Menü ohne Quer-Scroll', not ueberlauf(pg)); shot(pg, '31_handy_menue')
    pg.tap('#k-ki'); pg.wait_for_selector('.alarm'); shot(pg, '32_handy_namen'); pg.tap('.alarm button:has-text("Ohne Namen")')
    pg.wait_for_selector('#status'); frei(pg); pg.wait_for_timeout(600); shot(pg, '33_handy_spiel_3d')
    pruefe('Handy: Spiel ohne Quer-Scroll', not ueberlauf(pg))
    a, bb, cc, d = UCI('e2e4'); q = feld_xy(pg, a, bb); pg.touchscreen.tap(q['x'], q['y']); pg.wait_for_timeout(150); q = feld_xy(pg, cc, d); pg.touchscreen.tap(q['x'], q['y']); pg.wait_for_timeout(300); frei(pg)
    pruefe('Handy: Touch-Zug', hist(pg)[:1] == ['e2e4'], hist(pg))
    pg.tap('#b-3d'); pg.wait_for_timeout(400); shot(pg, '34_handy_spiel_2d')
    pg.tap('#b-hunde'); pg.wait_for_timeout(400); shot(pg, '35_handy_hunde')
    pruefe('Handy: 2D-Brett quadratisch im Rahmen', ev(pg, '(()=>{const r=document.getElementById("b2dwrap").getBoundingClientRect();return r.width<=390&&Math.abs(r.width-r.height)<2})()'))
    pg.tap('#b-dd'); pg.wait_for_selector('#dropdown'); shot(pg, '36_handy_dropdown'); pg.keyboard.press('Escape')
    pg.set_viewport_size({'width': 780, 'height': 390}); pg.wait_for_timeout(600); shot(pg, '37_handy_quer')
    pruefe('Handy quer: ohne Quer-Scroll', not ueberlauf(pg))
    b.close()
    # iPad hochkant
    b, pg = neu(p, w=820, h=1100)
    start_ki(pg, 2); pg.wait_for_timeout(500); shot(pg, '38_ipad_spiel')
    pg.click('#b-zugwert'); pg.wait_for_timeout(500); shot(pg, '39_ipad_zugwert')
    b.close()

print('\nFehler:', fehler)
pruefe('keine JS-Fehler', not fehler, fehler[:3])
srv.kill()
print('%d/%d OK' % (sum(ergebnisse), len(ergebnisse)))
sys.exit(0 if all(ergebnisse) else 1)
