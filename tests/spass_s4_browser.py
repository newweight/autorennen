# S4 Browser-Rauchtest (Autorennen + Motorrad): python3 tests/spass_s4_browser.py
# Je Spiel: Menü-Karten, Kurz-Level schaffen (Autopilot), ❓-Schalter auslösen, K.-o. bis zum Ende, Foto speichern. Bilder: tests/bilder_s4/
import sys, os, json, time
from playwright.sync_api import sync_playwright
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
BASIS = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(BASIS, 'tests', 'bilder_s4'); os.makedirs(OUT, exist_ok=True)
ok = fehl = 0
def pruefe(name, gut, info=''):
    global ok, fehl
    print(('OK   ' if gut else 'FEHL ') + name + (('  (' + str(info) + ')') if info != '' else ''))
    if gut: ok += 1
    else: fehl += 1

def lauf(p, html, prefix, lvl):
    fehler = []
    b = p.chromium.launch(args=ARGS); ctx = b.new_context(viewport={'width': 1100, 'height': 650}, accept_downloads=True)
    page = ctx.new_page(); page.set_default_timeout(60000)
    page.on('pageerror', lambda e: fehler.append('pageerror: ' + str(e)))
    page.on('console', lambda m: fehler.append('console.error: ' + m.text) if m.type == 'error' and 'GPU stall' not in m.text and 'WebGL' not in m.text else None)
    def neu():
        page.goto('file://' + os.path.join(BASIS, html)); page.wait_for_function('window.Rennspiel && Rennspiel.spiel'); page.wait_for_timeout(1200)
    sp = 'motorrad' if prefix == 'moto' else 'auto'
    neu()
    # --- Menü: Modus-Schritt mit den neuen Karten
    page.evaluate("Rennspiel.spiel.menue.zeigen(0)"); page.wait_for_timeout(400)
    karten = page.evaluate("[...document.querySelectorAll('[data-a^=\"spassmodus:\"]')].map(e=>e.dataset.a)")
    pruefe(f'{prefix}: Menü zeigt Kurz-Level / Freie Fahrt / K.-o.-Rallye', karten == ['spassmodus:kurz', 'spassmodus:frei', 'spassmodus:ko'], karten)
    page.screenshot(path=f'{OUT}/{prefix}_modus.png')
    page.click('[data-a="spassmodus:kurz"]'); page.wait_for_timeout(600)
    ueb = page.evaluate("!!document.querySelector('.s4-karte, .s4-ueb, #s4-karte')")
    page.screenshot(path=f'{OUT}/{prefix}_level_uebersicht.png')
    pruefe(f'{prefix}: Klick auf Kurz-Level öffnet die Level-Übersicht', ueb)
    page.keyboard.press('Escape'); page.wait_for_timeout(300)
    # --- Kurz-Level per Autopilot
    neu()
    page.evaluate("(l)=>{const S=Rennspiel.spiel; S._s4Modus={art:'kurz', level:l}; S.rennenStarten();}", lvl)
    page.wait_for_timeout(1200)
    page.screenshot(path=f'{OUT}/{prefix}_kurz_start.png')
    r = page.evaluate("""()=>{const S=Rennspiel.spiel; S.autopilot(0,true); S.pausiert=false; const z=S.s4.kurz; let n=0;
      while(!z.ende && n<16000){ S.physikSchritt(1/60); n++; }
      return {n, ende:z.ende, zaehl:z.zaehl, zeit:S.rennen.zeit}}""")
    page.wait_for_timeout(1500); page.screenshot(path=f'{OUT}/{prefix}_kurz_ende.png')
    stand = page.evaluate("(s)=>Rennspiel.SpassKurz.stand(s)", sp)
    pruefe(f'{prefix}: Kurz-Level {lvl} geschafft (Autopilot), mindestens 1 Stern gespeichert', bool(r['ende']) and (stand.get('sterne', {}).get(lvl, 0) >= 1), json.dumps(r) + ' ' + json.dumps(stand.get('sterne')))
    # R-Neustart am letzten Checkpoint: nur prüfen, dass Taste keinen Fehler wirft
    # --- Freie Fahrt: ❓-Schalter auslösen
    neu()
    page.evaluate("()=>{const S=Rennspiel.spiel; S._s4Modus={art:'frei'}; S.rennenStarten();}"); page.wait_for_timeout(1200)
    r = page.evaluate("""()=>{const S=Rennspiel.spiel; S.pausiert=false; let n=0; while(S.rennen.zustand!=='laeuft' && n<900){S.physikSchritt(1/60); n++;}
      const z=S.s4.frei, k=z.kisten[0], f=S.fahrzeuge[0].vehicle;
      f.setzen(k.x,k.z,0); f.y=k.y;
      const vor=Rennspiel.SpassFrei.anzahl(z.sp,z.id).gefunden.length; let m=0;
      while(!z.aufgabe && m<600){ S.physikSchritt(1/60); m++; }
      return {kisten:z.kisten.length, vor, nach:Rennspiel.SpassFrei.anzahl(z.sp,z.id).gefunden.length, aufgabe:z.aufgabe?z.aufgabe.art:null, m}}""")
    page.wait_for_timeout(500); page.screenshot(path=f'{OUT}/{prefix}_frei.png')
    pruefe(f'{prefix}: Freie Fahrt – ❓-Schalter ausgelöst, „Gefunden“ +1, Mini-Aufgabe läuft', r['aufgabe'] is not None and r['nach'] == r['vor'] + 1 and r['kisten'] >= 8, json.dumps(r))
    # --- K.-o.-Rallye bis zum Ende
    neu()
    page.evaluate("()=>{const S=Rennspiel.spiel; S._s4Modus={art:'ko'}; S.rennenStarten();}"); page.wait_for_timeout(1200)
    r = page.evaluate("""()=>{const S=Rennspiel.spiel; S.autopilot(0,true); S.pausiert=false; let n=0; const R=S.rennen;
      while(R.zustand!=='fertig' && n<60*900){ S.physikSchritt(1/60); n++; }
      return {n, zustand:R.zustand, teiln:R.teilnehmer.length, raus:R.ausgeschiedene.length, runden:R.runden, platz1:R.rangliste[0].nr, zeit:Math.round(R.zeit)}}""")
    page.wait_for_timeout(1500); page.screenshot(path=f'{OUT}/{prefix}_ko_ende.png')
    pruefe(f'{prefix}: K.-o.-Rallye läuft bis zum Ende, n − 2 Fahrer ausgeschieden', r['zustand'] == 'fertig' and r['raus'] == r['teiln'] - 2, json.dumps(r))
    # K.-o.-HUD mitten im Rennen
    neu()
    page.evaluate("()=>{const S=Rennspiel.spiel; S._s4Modus={art:'ko'}; S.rennenStarten();}"); page.wait_for_timeout(800)
    page.evaluate("()=>{const S=Rennspiel.spiel; S.autopilot(0,true); S.pausiert=false; for(let n=0;n<60*70;n++) S.physikSchritt(1/60);}"); page.wait_for_timeout(900)
    page.screenshot(path=f'{OUT}/{prefix}_ko_hud.png')
    # --- Fotomodus: P, Rahmen, Sticker, Text, speichern
    neu()
    page.evaluate("()=>{const S=Rennspiel.spiel; S.rennenStarten();}"); page.wait_for_timeout(1500)
    page.evaluate("()=>{const S=Rennspiel.spiel; S.pausiert=false; for(let n=0;n<60*6;n++) S.physikSchritt(1/60);}")
    page.keyboard.press('KeyP'); page.wait_for_timeout(600)
    an = page.evaluate("Rennspiel.SpassFoto.an()")
    pruefe(f'{prefix}: Taste P schaltet den Fotomodus ein (pausiert)', an and page.evaluate("Rennspiel.spiel.pausiert") is True)
    page.click('[data-a="rahmen:polaroid"]'); page.click('[data-a^="sticker:"] >> nth=0'); page.fill('input[data-a="text"]', 'Mein Foto')
    page.mouse.move(500, 300); page.mouse.down(); page.mouse.move(620, 260, steps=6); page.mouse.up(); page.mouse.wheel(0, -200); page.wait_for_timeout(600)
    page.screenshot(path=f'{OUT}/{prefix}_foto_ui.png')
    with page.expect_download() as dl:
        page.click('[data-a="knips"]')
    d = dl.value; pfad = f'{OUT}/{prefix}_foto_gespeichert.png'; d.save_as(pfad)
    info = page.evaluate("window.__s4Foto"); groesse = os.path.getsize(pfad)
    pruefe(f'{prefix}: Foto als PNG gespeichert (Download)', d.suggested_filename.endswith('.png') and groesse > 5000 and info and info.get('bytes', 0) > 5000, f'{d.suggested_filename} {groesse} B')
    page.keyboard.press('Escape'); page.wait_for_timeout(300)
    pruefe(f'{prefix}: Esc beendet den Fotomodus, Rennen läuft weiter', page.evaluate("!Rennspiel.SpassFoto.an() && Rennspiel.spiel.pausiert===false"))
    pruefe(f'{prefix}: keine Konsolenfehler', not fehler, fehler[:3])
    b.close()

with sync_playwright() as p:
    t0 = time.time()
    lauf(p, 'Autorennen.html', 'auto', 'a01')
    lauf(p, 'Motorrad.html', 'moto', 'm01')
print(f'\n{ok} OK, {fehl} FEHL ({time.time()-t0:.0f} s)')
sys.exit(1 if fehl else 0)
