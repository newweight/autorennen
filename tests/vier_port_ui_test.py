#!/usr/bin/env python3
"""4 gewinnt – Swift-Port im Browser (Playwright): python3 tests/vier_port_ui_test.py [ausgabeordner]
Prüft Hauptmenü (Texte, Regler, Karten), Spiel zu zweit, Gegen Computer (gleiche Züge wie die Swift-KI, Hintergrund-Worker, Abbruch),
Gewinn/Unentschieden-Dialog (0,7 s), Spaltenwahl per Maus/Tasten, Größenanpassung, Vollbild, Online (2 Browser: Raum, Link, Züge, Revanche,
Aufgeben, Zuschauer, Wiederverbinden), Handy-Größe, JS-Fehler. Bilder: tests/out/vier_port/"""
import sys, os, socket, subprocess, time, json
from playwright.sync_api import sync_playwright

basis = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
out = sys.argv[1] if len(sys.argv) > 1 else os.path.join(basis, 'tests', 'out', 'vier_port')
os.makedirs(out, exist_ok=True)
fehlerliste, pruefungen = [], []

def pruefe(name, ok, info=''):
    pruefungen.append(bool(ok))
    print(('OK   ' if ok else 'FAIL ') + name + (' – ' + str(info) if info != '' else ''), flush=True)

s = socket.socket(); s.bind(('127.0.0.1', 0)); port = s.getsockname()[1]; s.close()
srv = subprocess.Popen(['node', os.path.join(basis, 'server', 'server.js'), '--port', str(port), '--host', '127.0.0.1'], stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
for _ in range(60):
    try: socket.create_connection(('127.0.0.1', port), timeout=0.2).close(); break
    except OSError: time.sleep(0.1)
BASIS = 'http://127.0.0.1:%d/' % port
URL = BASIS + 'spiele/vier-gewinnt/'

def neue_seite(ctx, url, name):
    pg = ctx.new_page()
    pg.on('pageerror', lambda e: fehlerliste.append(name + ': ' + str(e)))
    pg.on('console', lambda m: fehlerliste.append(name + ' console: ' + m.text) if m.type == 'error' and 'ERR_INTERNET_DISCONNECTED' not in m.text else None)
    pg.goto(url); pg.wait_for_load_state('load')
    return pg

def shot(pg, n): pg.screenshot(path=os.path.join(out, n + '.png'))
def status(pg): return pg.locator('#status').inner_text()
def modus(pg): return pg.locator('#modus').inner_text()
def dialog(pg): return pg.locator('.alarm').inner_text() if pg.locator('.alarm').count() else ''
def brett(pg): return pg.evaluate('Array.from(__vier.S.st.b)')       # b[zeile*7+spalte], Zeile 0 unten
def steine(pg): return sum(1 for x in brett(pg) if x)
def klick(pg, c, y=None):                      # echter Mausklick auf die Spalte c (0–6)
    g = pg.evaluate('__vier.geometrie()'); b = pg.locator('#brett').bounding_box()
    pg.mouse.click(b['x'] + g['ox'] + c * g['cell'] + g['cell'] / 2, b['y'] + (y if y is not None else g['H'] / 2))
def tippe(pg, c):
    g = pg.evaluate('__vier.geometrie()'); b = pg.locator('#brett').bounding_box()
    pg.touchscreen.tap(b['x'] + g['ox'] + c * g['cell'] + g['cell'] / 2, b['y'] + g['H'] / 2)
def ki_zug(zuege, tiefe):                      # Referenz: Zug der Swift-KI (gemeinsam/vier-ki.js) für die Zugfolge
    code = "const V=require('%s/spiele/gemeinsam/vier-regeln.js'),K=require('%s/spiele/gemeinsam/vier-ki.js');const st=V.ausZuegen(%s);console.log(K.waehle(st,%d))" % (basis, basis, json.dumps(zuege), tiefe)
    return int(subprocess.check_output(['node', '-e', code]).decode().strip())
def warte_steine(pg, n, sek=15):
    t = time.time()
    while time.time() - t < sek:
        if steine(pg) >= n: return True
        time.sleep(0.1)
    return False

try:
  with sync_playwright() as p:
    br = p.chromium.launch()
    ctx = br.new_context(viewport={'width': 1000, 'height': 800})

    # ================= Hauptmenü =================
    pg = neue_seite(ctx, URL, 'menue')
    txt = pg.inner_text('body')
    pruefe('Titel des Tabs = „4 Gewinnt“ (Fenstertitel der App)', pg.title() == '4 Gewinnt', pg.title())
    pruefe('Hauptmenü: Titel „4 Gewinnt“ und Texte der Karten wie in Swift',
           all(t in txt for t in ['4 Gewinnt', 'Spieler vs Spieler', 'Zu zweit am gleichen Computer', 'Spieler vs Computer', 'Gegen die KI spielen', 'Spielstärke:', 'Mittel', 'Spiel starten']), txt.replace('\n', ' | ')[:200])
    pruefe('Hauptmenü: „oder“-Trenner', txt.count('oder') == 2, txt.count('oder'))
    pruefe('Hauptmenü: Vorschau-Brett 280×120 (MiniBoardView)', pg.evaluate("(()=>{const c=document.getElementById('mini');return c.clientWidth==280&&c.clientHeight==120})()"))
    pruefe('Hauptmenü: Online als weitere Karte im Stil der App', 'Online spielen' in txt and 'Mit Freunden, per Raumcode' in txt)
    pruefe('Hauptmenü: Fensterfarbe = weiß 0,97 (247)', pg.evaluate("getComputedStyle(document.body).backgroundColor") == 'rgb(247, 247, 247)')
    pruefe('Hauptmenü: hervorgehobene Karte hat orangen Rand (accentOrange)', pg.evaluate("getComputedStyle(document.querySelector('.karte.hervor')).borderTopColor") == 'rgb(217, 97, 26)')
    pruefe('Hauptmenü: Start-Knopf orange', pg.evaluate("getComputedStyle(document.getElementById('k-ki')).backgroundColor") == 'rgb(217, 97, 26)')
    shot(pg, 'menue_1000')
    # Regler: Namen wie Swift
    namen = ['', 'Sehr leicht', 'Leicht', 'Leicht', 'Mittel', 'Mittel', 'Stark', 'Stark', 'Sehr stark', 'Sehr stark', 'Experte']
    falsch = []
    for v in range(1, 11):
        pg.evaluate("v=>{const r=document.getElementById('regler');r.value=v;r.dispatchEvent(new Event('input'))}", v)
        if pg.inner_text('#stufe-name') != namen[v]: falsch.append((v, pg.inner_text('#stufe-name')))
    pruefe('Regler 1–10: Stufen-Namen wie in Swift', not falsch, falsch)
    pruefe('Regler: Startwert 5 = „Mittel“, 10 Stufen', pg.evaluate("(()=>{const r=document.getElementById('regler');return r.min=='1'&&r.max=='10'&&r.step=='1'})()"))
    # Tiefe: 1 → 2, 10 → 9
    pg.evaluate("()=>{const r=document.getElementById('regler');r.value=1;r.dispatchEvent(new Event('input'))}"); pg.click('#k-ki')
    pruefe('Modus-Zeile: „Spieler vs. KI (Stärke 2)“ bei Regler 1 (Tiefe min. 2)', modus(pg) == 'Spieler vs. KI (Stärke 2)', modus(pg))
    pg.click('#b-menue'); time.sleep(0.2)
    pg.evaluate("()=>{const r=document.getElementById('regler');r.value=10;r.dispatchEvent(new Event('input'))}"); pg.click('#k-ki')
    pruefe('Modus-Zeile: „Spieler vs. KI (Stärke 9)“ bei Regler 10 (Tiefe max. 9)', modus(pg) == 'Spieler vs. KI (Stärke 9)', modus(pg))
    pg.click('#b-menue'); time.sleep(0.2)
    pruefe('Zurück im Menü: Regler wieder auf 5 / „Mittel“ (Swift: aiDepth = 5)', pg.inner_text('#stufe-name') == 'Mittel' and pg.evaluate("document.getElementById('regler').value") == '5')

    # ================= Spieler vs Spieler =================
    pg.click('#k-zweit'); time.sleep(0.2)
    pruefe('Zu zweit: Modus „Spieler vs. Spieler“, Status „🔴 Rot ist dran“ in Rot', modus(pg) == 'Spieler vs. Spieler' and status(pg) == '🔴 Rot ist dran' and pg.evaluate("getComputedStyle(document.getElementById('status')).color") == 'rgb(230, 38, 26)', status(pg))
    pruefe('Zu zweit: Fenster dunkel (0,07/0,07/0,15), Knöpfe Menü · Neu · ⛶ Vollbild', pg.evaluate("getComputedStyle(document.body).backgroundColor") == 'rgb(18, 18, 38)' and [t.strip() for t in pg.locator('.knoepfe button').all_inner_texts()] == ['Menü', 'Neu', '⛶ Vollbild'], pg.locator('.knoepfe button').all_inner_texts())
    klick(pg, 3)
    b = brett(pg)
    pruefe('Mausklick wirft Rot in Spalte 4 (unterste Zeile), Gelb ist dran', b[3] == 1 and steine(pg) == 1 and status(pg) == '🟡 Gelb ist dran' and pg.evaluate("getComputedStyle(document.getElementById('status')).color") == 'rgb(255, 204, 0)', status(pg))
    shot(pg, 'zweit_1')
    pg.keyboard.press('4'); time.sleep(0.1)
    pruefe('Taste 4 wirft Gelb auf Rot (Schwerkraft)', brett(pg)[10] == 2 and steine(pg) == 2)
    # volle Spalte
    pg.keyboard.press('n'); time.sleep(0.2)
    pruefe('Taste N = Neues Spiel (leeres Brett, Rot ist dran)', steine(pg) == 0 and status(pg) == '🔴 Rot ist dran')
    for _ in range(6): pg.keyboard.press('1')
    pg.keyboard.press('1')
    pruefe('Volle Spalte: siebter Stein wird (still) ignoriert', steine(pg) == 6 and brett(pg)[35] != 0)
    # Gewinn Rot
    pg.click('#b-neu'); time.sleep(0.2)
    pruefe('Knopf „Neu“ startet neu', steine(pg) == 0)
    for c in [1, 7, 2, 7, 3, 7, 4]: pg.keyboard.press(str(c))
    time.sleep(0.3)
    pruefe('Rot gewinnt: Status „🔴 Rot gewinnt! 🎉“ in Rot', status(pg) == '🔴 Rot gewinnt! 🎉' and pg.evaluate("getComputedStyle(document.getElementById('status')).color") == 'rgb(230, 38, 26)', status(pg))
    pruefe('Dialog erscheint erst nach 0,7 s', dialog(pg) == '')
    pg.keyboard.press('1'); time.sleep(0.1)
    pruefe('Nach dem Gewinn keine weiteren Züge', steine(pg) == 7)
    time.sleep(0.7)
    d = dialog(pg)
    pruefe('Dialog „Spiel beendet“ / „🔴 Rot gewinnt!“ / Neues Spiel / Hauptmenü', 'Spiel beendet' in d and '🔴 Rot gewinnt!' in d and 'Neues Spiel' in d and 'Hauptmenü' in d, d.replace('\n', ' | '))
    shot(pg, 'zweit_ende_rot')
    pg.keyboard.press('Enter'); time.sleep(0.2)
    pruefe('Enter = Standardknopf „Neues Spiel“ → leeres Brett', dialog(pg) == '' and steine(pg) == 0 and status(pg) == '🔴 Rot ist dran')
    # Gelb gewinnt, dann Hauptmenü
    for c in [7, 1, 7, 2, 7, 3, 6, 4]: pg.keyboard.press(str(c))
    time.sleep(1.0)
    pruefe('Gelb gewinnt: „🟡 Gelb gewinnt! 🎉“ + Dialog „🟡 Gelb gewinnt!“', status(pg) == '🟡 Gelb gewinnt! 🎉' and '🟡 Gelb gewinnt!' in dialog(pg), status(pg) + ' | ' + dialog(pg))
    pg.click('.alarm .taste:has-text("Hauptmenü")'); time.sleep(0.2)
    pruefe('„Hauptmenü“ im Dialog führt ins Menü', pg.locator('#k-zweit').is_visible())
    # Unentschieden
    pg.click('#k-zweit')
    for c in [6,5,5,2,1,3,0,2,0,6,4,0,0,3,4,6,6,2,3,4,4,1,2,1,2,6,4,6,4,5,1,3,5,2,3,1,0,0,1,5,5,3]: pg.keyboard.press(str(c + 1))
    time.sleep(1.0)
    pruefe('Unentschieden: Status weiß „Unentschieden!“ + Dialog', status(pg) == 'Unentschieden!' and pg.evaluate("getComputedStyle(document.getElementById('status')).color") == 'rgb(255, 255, 255)' and 'Unentschieden!' in dialog(pg), status(pg) + ' | ' + dialog(pg))
    shot(pg, 'zweit_unentschieden')
    pg.keyboard.press('Escape'); time.sleep(0.1)
    pruefe('Zusatz: Esc schließt den Dialog, das Endbrett bleibt sichtbar', dialog(pg) == '' and steine(pg) == 42)
    pg.keyboard.press('m'); time.sleep(0.2)
    pruefe('Taste M = Hauptmenü', pg.locator('#k-zweit').is_visible())

    # ================= Hover, Spaltenwahl, Größe =================
    pg.click('#k-zweit'); time.sleep(0.2)
    g = pg.evaluate('__vier.geometrie()'); bb = pg.locator('#brett').bounding_box()
    pg.mouse.move(bb['x'] + g['ox'] + 5 * g['cell'] + 20, bb['y'] + 30); time.sleep(0.1)
    pruefe('Maus über Spalte 6 → Hover-Spalte 5 (auch über dem Brett, ganze Höhe)', pg.evaluate('__vier.S.hover') == 5)
    pg.mouse.move(bb['x'] + 2, bb['y'] + 30); time.sleep(0.1)
    pruefe('Maus links vom Brett → keine Hover-Spalte', pg.evaluate('__vier.S.hover') == -1)
    pg.mouse.click(bb['x'] + 2, bb['y'] + 100); time.sleep(0.1)
    pruefe('Klick links vom Brett wirft nichts', steine(pg) == 0)
    # Formel BoardView.cellSize
    def zelle(W, H):
        w = (W - 20 - 12) / 7; h = (H - 20 - 12 - 22) / 6.36
        return max(20, int(min(w, h) // 1))
    ok_formel = True; info = []
    for (vw, vh) in [(440, 700), (700, 700), (1400, 900), (380, 420), (1000, 400)]:
        pg.set_viewport_size({'width': vw, 'height': vh}); time.sleep(0.3)
        gg = pg.evaluate('__vier.geometrie()'); soll = zelle(gg['W'], gg['H'])
        info.append((vw, vh, gg['cell'], soll)); ok_formel &= gg['cell'] == soll
    pruefe('Feldgröße = Swift-Formel (BoardView.cellSize) bei 5 Fenstergrößen', ok_formel, info)
    pg.set_viewport_size({'width': 1000, 'height': 800}); time.sleep(0.3)
    sz = pg.evaluate("[parseFloat(getComputedStyle(document.getElementById('status')).fontSize), parseFloat(getComputedStyle(document.getElementById('modus')).fontSize)]")
    pruefe('Schriftgrößen wachsen mit dem Fenster: min(1000,800)/30 = 26,7 / /50 = 16', abs(sz[0] - 800 / 30) < 0.1 and abs(sz[1] - 16) < 0.1, sz)
    pg.set_viewport_size({'width': 380, 'height': 420}); time.sleep(0.3)
    sz = pg.evaluate("[parseFloat(getComputedStyle(document.getElementById('status')).fontSize), parseFloat(getComputedStyle(document.getElementById('modus')).fontSize)]")
    pruefe('Kleinstes Fenster 380×420: Schrift 17 / 11', sz == [17, 11], sz)
    shot(pg, 'zweit_klein_380x420')
    pg.set_viewport_size({'width': 440, 'height': 700}); time.sleep(0.3); shot(pg, 'zweit_440x700')
    pg.set_viewport_size({'width': 1500, 'height': 950}); time.sleep(0.3); shot(pg, 'zweit_gross_1500x950')

    # ================= Vollbild =================
    pg.set_viewport_size({'width': 1000, 'height': 800}); time.sleep(0.2)
    pruefe('Knopf „⛶ Vollbild“ sichtbar', pg.locator('#b-voll').is_visible() and pg.inner_text('#b-voll') == '⛶ Vollbild')
    pg.click('#b-voll'); time.sleep(0.6)
    vb = pg.evaluate('!!document.fullscreenElement')
    pruefe('Vollbild per Fullscreen-API', vb)
    pruefe('Knopf heißt im Vollbild „Vollbild beenden“', pg.inner_text('#b-voll') == 'Vollbild beenden', pg.inner_text('#b-voll'))
    shot(pg, 'zweit_vollbild')
    pg.keyboard.press('f'); time.sleep(0.6)
    pruefe('Taste F beendet das Vollbild; Knopf wieder „⛶ Vollbild“', not pg.evaluate('!!document.fullscreenElement') and pg.inner_text('#b-voll') == '⛶ Vollbild')
    pg.click('#b-menue')

    # ================= Gegen Computer =================
    pg.click('#k-ki'); time.sleep(0.2)
    pruefe('Computer: Modus-Zeile „Spieler vs. KI (Stärke 5)“', modus(pg) == 'Spieler vs. KI (Stärke 5)', modus(pg))
    klick(pg, 3); t0 = time.time()
    ok = warte_steine(pg, 2, 20)
    erwartet = ki_zug([3], 5)
    b = brett(pg)
    gelb_spalte = [s for s in range(7) for z in range(6) if b[z * 7 + s] == 2]
    pruefe('Computer (Tiefe 5) antwortet mit demselben Zug wie die Swift-KI-Logik', ok and gelb_spalte == [erwartet], 'Antwort Spalte %s, erwartet %s (%.1f s)' % (gelb_spalte, erwartet, time.time() - t0))
    pruefe('Danach ist Rot wieder dran', status(pg) == '🔴 Rot ist dran', status(pg))
    folge = [3, erwartet]
    # drei weitere Züge, jeweils mit Referenz vergleichen
    gleich = True
    for c in [2, 4, 3]:
        if not any(1 for s in [c] if brett(pg)[5 * 7 + s] == 0): continue
        vorher = steine(pg); klick(pg, c); folge.append(c)
        if not warte_steine(pg, vorher + 2, 20): gleich = False; break
        ist = pg.evaluate('__vier.S.st.zug')[-1]; soll = ki_zug(folge, 5)
        if ist != soll: gleich = False; pruefe('Zug %d: KI %s ≠ Referenz %s' % (len(folge), ist, soll), False)
        folge.append(ist)
    pruefe('Computer: jeder weitere Zug entspricht der Swift-KI', gleich, pg.evaluate('__vier.S.st.zug'))
    shot(pg, 'computer_1')
    # Mensch darf nicht ziehen, solange die KI rechnet (Tiefe 9) – Oberfläche bleibt bedienbar (Worker)
    pg.click('#b-menue'); pg.evaluate("()=>{const r=document.getElementById('regler');r.value=10;r.dispatchEvent(new Event('input'))}"); pg.click('#k-ki'); time.sleep(0.2)
    klick(pg, 3); time.sleep(0.15)
    denkt = pg.evaluate('__vier.S.denkt')
    t1 = time.time(); pg.evaluate('document.title'); antwort = time.time() - t1
    klick(pg, 4); klick(pg, 2); time.sleep(0.1)
    pruefe('Computer rechnet (Tiefe 9): Klicks in der Zwischenzeit werden ignoriert', denkt and steine(pg) == 1, (denkt, steine(pg)))
    pruefe('Oberfläche bleibt während des Rechnens reaktionsfähig (Web Worker)', antwort < 0.3, '%.3f s' % antwort)
    shot(pg, 'computer_denkt_tiefe9')
    pg.click('#b-menue'); time.sleep(0.2); pg.click('#k-zweit'); time.sleep(5.5)
    pruefe('Menü während die KI rechnet: verspäteter Zug der KI wird verworfen (sessionID)', steine(pg) == 0 and status(pg) == '🔴 Rot ist dran', steine(pg))
    pg.click('#b-neu'); time.sleep(0.2)
    # KI gewinnt → Dialog
    pg.click('#b-menue'); pg.evaluate("()=>{const r=document.getElementById('regler');r.value=1;r.dispatchEvent(new Event('input'))}"); pg.click('#k-ki')
    spiel_ende = False
    for i in range(30):
        frei = pg.evaluate("[0,1,2,3,4,5,6].filter(c=>__vier.S.st.h[c]<6)")
        if not frei or pg.evaluate('__vier.S.gameOver'): break
        klick(pg, frei[0]); n = steine(pg); warte_steine(pg, n + 1, 5); time.sleep(0.15)
    time.sleep(1.2)
    pruefe('Computer (Stärke 2) schlägt einen Spieler, der nur linke Spalten spielt → Dialog „Gelb gewinnt“', '🟡 Gelb gewinnt!' in dialog(pg), dialog(pg).replace('\n', ' | '))
    shot(pg, 'computer_ende')
    pg.click('.alarm .taste:has-text("Neues Spiel")'); time.sleep(0.3)
    pruefe('Neues Spiel im Computer-Modus: leeres Brett, KI-Modus bleibt', steine(pg) == 0 and 'KI' in modus(pg))
    pg.close()

    # ================= Online =================
    ca = br.new_context(viewport={'width': 1000, 'height': 800}); cb = br.new_context(viewport={'width': 1000, 'height': 800})
    A = neue_seite(ca, URL, 'A')
    A.click('#k-online'); time.sleep(0.2)
    pruefe('Online-Bildschirm: Namen, Seitenwahl, Raum erstellen, Beitreten', all(t in A.inner_text('body') for t in ['Wer bist du?', 'Raum erstellen', 'Beitreten', 'Zuschauen', 'Rot (fängt an)']))
    shot(A, 'online_lobby')
    A.click('[data-name="loewe"]'); A.click('[data-seite="w"]'); A.click('[data-a=erstellen]')
    A.wait_for_selector('.codegross'); code = A.inner_text('.codegross').strip()
    pruefe('Raumcode: 4 Zeichen, QR-Code, Link', len(code) == 4 and A.locator('.qr svg').count() == 1 and ('?raum=' + code) in A.inner_text('#linktext'), code)
    shot(A, 'online_warten')
    B = neue_seite(cb, URL + '?raum=' + code.lower(), 'B')
    pruefe('Link ?raum= füllt den Code vor', B.evaluate("document.getElementById('codefeld').value") == code)
    B.click('[data-name="pinguin"]'); B.click('[data-a=beitreten]')
    A.wait_for_selector('#brett'); B.wait_for_selector('#brett'); time.sleep(0.5)
    pruefe('Online: Spielfenster im App-Stil, Status „🔴 Rot ist dran“, Modus „Online – Raum …“', status(A) == '🔴 Rot ist dran' and modus(A) == 'Online – Raum ' + code and status(B) == '🔴 Rot ist dran', status(A) + ' | ' + modus(A))
    pruefe('Online: Spielerzeile mit Namen und „(du)“', 'Löwe (du)' in A.inner_text('#spieler') and 'Pinguin' in A.inner_text('#spieler') and 'Pinguin (du)' in B.inner_text('#spieler'), A.inner_text('#spieler'))
    klick(B, 0); time.sleep(0.4)
    pruefe('Online: B darf nicht werfen, solange A dran ist', steine(B) == 0 and steine(A) == 0)
    for i, (pgx, c) in enumerate([(A, 0), (B, 6), (A, 1), (B, 6), (A, 2), (B, 6)]):
        klick(pgx, c); time.sleep(0.4)
        if i == 2: shot(A, 'online_A'); shot(B, 'online_B')
    pruefe('Online: 6 Steine bei beiden (Server prüft Züge)', steine(A) == 6 and steine(B) == 6 and brett(A) == brett(B))
    klick(A, 3); time.sleep(0.5)
    pruefe('Online: Rot gewinnt – Status bei beiden', status(A) == '🔴 Rot gewinnt! 🎉' and status(B) == '🔴 Rot gewinnt! 🎉', status(A) + ' | ' + status(B))
    time.sleep(0.9)
    pruefe('Online: Dialog bei beiden (Sieger/Verlierer-Zeile, Revanche, Hauptmenü)', 'Du hast gewonnen' in dialog(A) and 'Leider verloren' in dialog(B) and 'Revanche' in dialog(A) and 'Hauptmenü' in dialog(B), dialog(A).replace('\n', ' | ') + ' || ' + dialog(B).replace('\n', ' | '))
    shot(A, 'online_ende_A'); shot(B, 'online_ende_B')
    A.click('.alarm .taste:has-text("Revanche")'); time.sleep(0.5)
    pruefe('Online: A wartet auf die Revanche, B sieht den Wunsch', 'Warte auf den anderen' in dialog(A) and 'Der andere möchte eine Revanche' in dialog(B), dialog(A).replace('\n', ' | ') + ' || ' + dialog(B).replace('\n', ' | '))
    B.click('.alarm .taste:has-text("Revanche")'); time.sleep(0.8)
    pruefe('Online: Revanche → leeres Brett, Farben getauscht (B ist jetzt Rot und beginnt)', steine(A) == 0 and steine(B) == 0 and dialog(A) == '' and 'Pinguin (du)' in B.inner_text('#spieler') and B.inner_text('#spieler').index('Pinguin') < B.inner_text('#spieler').index('Löwe'), B.inner_text('#spieler'))
    klick(B, 3); time.sleep(0.4)
    pruefe('Online: B (Rot) darf jetzt werfen', steine(A) == 1 and steine(B) == 1 and A.inner_text('#status') == '🟡 Gelb ist dran')
    # Zuschauer
    cz = br.new_context(viewport={'width': 800, 'height': 700}); Z = neue_seite(cz, URL + '?raum=' + code, 'Z')
    Z.click('[data-a=zuschauen]'); Z.wait_for_selector('#brett'); time.sleep(0.5)
    klick(Z, 2); time.sleep(0.3)
    pruefe('Zuschauer sieht das Brett (1 Stein), darf nicht werfen', steine(Z) == 1 and steine(A) == 1 and 'zu' in Z.inner_text('#spieler') and Z.locator('#b-neu').is_hidden(), Z.inner_text('#spieler'))
    klick(A, 4); time.sleep(0.4)
    pruefe('Zuschauer sieht den Zug live', steine(Z) == 2)
    shot(Z, 'online_zuschauer')
    # Netz weg bei A
    ca.set_offline(True); A.evaluate("__vier.O.v.ws.close()"); time.sleep(0.8)
    pruefe('Netz weg: Banner „Verbindung weg“', A.locator('#banner').is_visible() and 'Verbindung weg' in A.inner_text('#banner'), A.inner_text('#banner'))
    ca.set_offline(False); time.sleep(4.0)
    pruefe('Netz wieder da: Banner weg, Spiel läuft weiter', A.locator('#banner').is_hidden() and steine(A) == 2)
    A.reload(); A.wait_for_selector('#brett', timeout=15000); time.sleep(0.6)
    pruefe('Seite neu laden: Platz kommt zurück (2 Steine, Gelb ist dran)', steine(A) == 2 and 'Löwe (du)' in A.inner_text('#spieler'), A.inner_text('#spieler'))
    # Menü-Knopf mit Rückfrage, Aufgeben
    A.click('#b-menue'); time.sleep(0.2)
    pruefe('Online: „Menü“ fragt nach (Spiel verlassen?)', 'Spiel verlassen?' in dialog(A), dialog(A).replace('\n', ' | '))
    A.keyboard.press('Enter'); time.sleep(0.2)
    pruefe('„Weiterspielen“ (Standard) bleibt im Spiel', A.locator('#brett').is_visible() and dialog(A) == '')
    A.click('#b-neu'); time.sleep(0.2)
    pruefe('Online: „Aufgeben“ fragt nach', 'Wirklich aufgeben?' in dialog(A), dialog(A).replace('\n', ' | '))
    A.click('.alarm .taste:has-text("Aufgeben")'); time.sleep(1.4)
    pruefe('Aufgeben: B hat gewonnen (Rot), Dialog mit „(Aufgegeben)“', 'Pinguin' not in status(B) and status(B).startswith('🔴 Rot gewinnt') and '(Aufgegeben)' in dialog(B), status(B) + ' | ' + dialog(B).replace('\n', ' | '))
    shot(B, 'online_aufgegeben_B')
    A.click('.alarm .taste:has-text("Hauptmenü")'); time.sleep(0.8)
    pruefe('Verlassen: A im Menü, B und Zuschauer bekommen „Raum wurde geschlossen“', A.locator('#k-zweit').is_visible() and 'geschlossen' in B.inner_text('#hinweis') and 'geschlossen' in Z.inner_text('#hinweis'), B.inner_text('#hinweis'))
    Z.close(); A.close(); B.close(); ca.close(); cb.close(); cz.close()

    # ================= Handy =================
    cm = br.new_context(viewport={'width': 390, 'height': 780}, is_mobile=True, has_touch=True, device_scale_factor=2)
    M = neue_seite(cm, URL, 'mobil')
    breite = M.evaluate("document.documentElement.scrollWidth")
    pruefe('Handy: Hauptmenü ohne waagrechtes Scrollen', breite <= 390, breite); shot(M, 'mobil_menue')
    M.tap('#k-zweit'); time.sleep(0.3)
    tippe(M, 2); time.sleep(0.2); tippe(M, 3); time.sleep(0.2)
    breite = M.evaluate("document.documentElement.scrollWidth")
    pruefe('Handy: Spielfenster ohne Querscroll, zwei Steine per Fingertipp', breite <= 390 and steine(M) == 2, (breite, steine(M))); shot(M, 'mobil_spiel')
    M.tap('#b-menue'); M.tap('#k-online'); time.sleep(0.3)
    pruefe('Handy: Online-Bildschirm ohne Querscroll', M.evaluate("document.documentElement.scrollWidth") <= 390); shot(M, 'mobil_online')
    M.close(); cm.close()
    br.close()
finally:
    srv.terminate()
    try: srv.wait(5)
    except Exception: srv.kill()

print()
for f in fehlerliste: print('JS-FEHLER:', f)
pruefe('keine JS-Fehler', not fehlerliste, len(fehlerliste))
print('\n%d OK, %d FAIL' % (sum(pruefungen), len(pruefungen) - sum(pruefungen)))
sys.exit(0 if all(pruefungen) else 1)
