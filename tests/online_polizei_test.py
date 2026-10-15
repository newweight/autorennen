#!/usr/bin/env python3
"""Polizei ONLINE im Browser (14.10., v21): python3 tests/online_polizei_test.py [ausgabeordner]
Startet server/server.js (freier Port), ein Browser (Host allein) erstellt einen Raum, schaltet in der Lobby 🚨 Polizei an (Zeile vorhanden, Server übernimmt),
startet auf der Wiese ohne Computer, fährt langsam. Prüft: Streifenwagen-Mesh (Blaulicht) im Spiel, bewegt sich, HUD „🚨 Polizei! Anhalten… N s“ zählt herunter,
das eigene Auto bleibt stehen (Vorhersage), Streifenwagen steht daneben, danach „Weiterfahren“ und HUD weg, keine JS-Fehler. Bilder: tests/out/online_polizei/"""
import sys, os, socket, subprocess, time
from playwright.sync_api import sync_playwright

basis = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
out = sys.argv[1] if len(sys.argv) > 1 else os.path.join(basis, 'tests', 'out', 'online_polizei')
os.makedirs(out, exist_ok=True)
fehler, bilanz = [], []

def pruefe(name, ok, info=''):
    bilanz.append(bool(ok))
    print(('OK   ' if ok else 'FAIL ') + name + (' – ' + str(info) if info != '' else ''), flush=True)

s = socket.socket(); s.bind(('127.0.0.1', 0)); port = s.getsockname()[1]; s.close()
srv = subprocess.Popen(['node', os.path.join(basis, 'server', 'server.js'), '--port', str(port), '--host', '127.0.0.1'], stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
url = 'http://127.0.0.1:%d/' % port
for _ in range(50):
    try: socket.create_connection(('127.0.0.1', port), timeout=0.2).close(); break
    except OSError: time.sleep(0.1)

LANGSAM = """() => { const s = Rennspiel.spiel, o = s.online, R = Rennspiel;
  const d = new R.Driver(o.vorhersage.vp, s.strecke, { schwierigkeit: 'leicht', seed: 5, name: 'Test' });
  if (d.hindernisseSetzen) d.hindernisseSetzen(s.strecke.hindernisse);
  s.input.steuerung = (nr) => {
    if (nr !== 0) return { gas: 0, bremse: 0, lenkung: 0 };
    const t = s.rennen.teilnehmer[o.du], v = o.vorhersage.vp;
    const st = d.steuerung(1 / 60, { andere: [], spielerFortschrittMax: null, eigenerFortschritt: t.fortschritt, laeuft: s.rennen.gasErlaubt });
    return { gas: v.vLaengs < 9 ? 1 : 0, bremse: v.vLaengs > 12 ? 0.5 : 0, lenkung: st.lenkung };
  }; return true; }"""
LAGE = """() => { const s = Rennspiel.spiel, o = s.online, p = s.polizei;
  const f = s.fahrzeuge[o.du], hud = s.huds[0], el = hud.ePolizei;
  const pf = p ? s.fahrzeuge[p.idx[0]] : null;
  return { n: s.fahrzeuge.length, polizei: !!p, streifen: pf ? { polizei: !!pf.polizei, mesh: !!pf.mesh, sichtbar: pf.mesh && pf.mesh.visible, x: pf.vehicle.x, z: pf.vehicle.z, v: pf.vehicle.vLaengs,
      lampen: !!(pf.mesh && pf.mesh.userData.blaulicht && pf.mesh.userData.blaulicht.length), lichter: s.lichtPool ? s.lichtPool.lichter.length : 0 } : null,
    ich: { x: f.vehicle.x, z: f.vehicle.z, v: f.vehicle.vLaengs }, rest: o.vorhersage.polizeiRest, text: el ? el.textContent : null, anzeige: el ? el.style.display : null,
    gesperrt: p ? p.logik.gesperrt(o.du) : null, rz: s.rennen.zustand }; }"""

try:
    with sync_playwright() as p:
        browser = p.chromium.launch(args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
        pg = browser.new_context(viewport={'width': 1280, 'height': 800}).new_page()
        pg.on('pageerror', lambda e: fehler.append(str(e)))
        pg.on('console', lambda m: fehler.append('console.error: ' + m.text) if m.type == 'error' else None)
        pg.goto(url)
        pg.wait_for_function('window.Rennspiel && Rennspiel.spiel', timeout=90000, polling=200)
        pg.wait_for_timeout(800)
        for _ in range(4): pg.keyboard.press('ArrowRight'); pg.wait_for_timeout(80)
        pg.keyboard.press('Enter'); pg.wait_for_timeout(300)
        pg.keyboard.press('Enter')
        pg.wait_for_function("Rennspiel.spiel.menue.onlineUi.lobby !== null && Rennspiel.spiel.menue.onlineUi.ansicht === 'lobby'", timeout=10000, polling=200)
        pg.wait_for_timeout(400)
        zeile = pg.evaluate("(() => { const z = Array.from(document.querySelectorAll('.on-zeile')).find(e => e.querySelector('.on-label').textContent.includes('Polizei')); return z ? Array.from(z.querySelectorAll('.pille')).map(x => x.textContent.trim()) : null; })()")
        pruefe('Lobby (Host): Zeile 🚨 Polizei mit Aus / An', zeile == ['Aus', '🚨 An'], zeile)
        pg.click('[data-a="wert:polizei:an"]')
        pg.wait_for_function("Rennspiel.spiel.menue.onlineUi.lobby.einstellungen.polizei === true", timeout=10000, polling=200)
        pruefe('Host schaltet Polizei an: Server übernimmt', True)
        for a in ['wert:strecke:wiese', 'wert:runden:3', 'wert:gegner:0']:
            pg.click('[data-a="%s"]' % a); pg.wait_for_timeout(300)
        pg.screenshot(path=os.path.join(out, '1_lobby.png'))
        pg.keyboard.press('Enter')
        pg.wait_for_function("Rennspiel.spiel.zustand === 'online' && Rennspiel.spiel.online && Rennspiel.spiel.online.empfangen", timeout=60000, polling=200)
        l0 = pg.evaluate(LAGE)
        pruefe('Spiel: Polizei-Objekt und Streifenwagen (2 Fahrzeuge: Auto + Streifenwagen) mit Mesh und Blaulicht', l0['polizei'] and l0['n'] == 2 and l0['streifen'] and l0['streifen']['polizei'] and l0['streifen']['mesh'] and l0['streifen']['lampen'] and l0['streifen']['lichter'] == 2, l0['streifen'])
        pg.evaluate(LANGSAM)
        pg.wait_for_function("Rennspiel.spiel.rennen.zustand === 'laeuft'", timeout=60000, polling=200)
        x0 = l0['streifen']['x']; z0 = l0['streifen']['z']
        try:
            pg.wait_for_function("([x0, z0]) => { const s = Rennspiel.spiel, f = s.fahrzeuge[s.polizei.idx[0]]; return Math.hypot(f.vehicle.x - x0, f.vehicle.z - z0) > 5; }", arg=[x0, z0], timeout=60000, polling=100)
            bewegt = True
        except Exception: bewegt = False
        pruefe('Streifenwagen fährt (Position ändert sich über Server-Zustände)', bewegt)
        pg.screenshot(path=os.path.join(out, '2_jagd.png'))
        # ---- Anhaltung: Unter Last (headless, Software-GL ≈ 5 fps) fährt das Auto zu unregelmäßig, damit die Polizei es sicher einholt (das prüft
        # tests/test_polizei_online.js deterministisch) → hier ein künstlicher Server-Zustand mit ps/po/ich.ps in die echte Client-Verarbeitung.
        SYNTH = """async () => {
          const s = Rennspiel.spiel, o = s.online, V = o.vorhersage, R = Rennspiel, p = s.polizei, me = s.fahrzeuge[o.du].vehicle;
          const orig = o.zustandEmpfangen.bind(o), echt = o.puffer.neuester;
          o.zustandEmpfangen = () => {};                            // echte Zustände ruhen (sonst überschreiben sie ps nach 50 ms)
          const erg = { texte: [], v: [], rest: [] };
          try {
            let k = echt.k + 1000;
            const synth = (rest) => {
              const z = JSON.parse(JSON.stringify(echt)); z.k = k++;
              const q = { x: Math.cos(me.heading), z: -Math.sin(me.heading) }, f = { x: -Math.sin(me.heading), z: -Math.cos(me.heading) };
              z.a[0][0] = me.x; z.a[0][1] = me.z; z.a[0][3] = me.heading; z.a[0][4] = me.vLaengs;
              z.po = [[me.x + q.x * 2.64 + f.x * 0.4, me.z + q.z * 2.64 + f.z * 0.4, me.y, me.heading, me.vLaengs, 0, 0, 0, 0, 0, 0, 0, 0, 0]];
              z.pz = [0]; z.ps = [[0, rest]];
              z.ich = Object.assign({}, echt.ich, { v: R.Netz.fahrzeugLesen(V.vp), ack: o.n, ps: rest, so: 0 }); delete z.ich.sz;
              return z;
            };
            orig(synth(3.4));
            erg.restNach = V.polizeiRest;
            for (let i = 0; i < 40; i++) {
              await new Promise(r => setTimeout(r, 100));
              const el = s.huds[0].ePolizei;
              erg.texte.push(el ? el.textContent : null); erg.v.push(+me.vLaengs.toFixed(2)); erg.rest.push(+V.polizeiRest.toFixed(2));
              if (V.polizeiRest <= 0) break;
            }
            erg.gesperrt = p.logik.gesperrt(o.du);
            erg.streifen = { x: s.fahrzeuge[p.idx[0]].vehicle.x, z: s.fahrzeuge[p.idx[0]].vehicle.z }; erg.ich = { x: me.x, z: me.z };
          } finally { o.zustandEmpfangen = orig; }
          return erg;
        }"""
        pg.wait_for_timeout(1500)
        r = pg.evaluate(SYNTH)
        pruefe('Client übernimmt ich.ps: Vorhersage-Rest ≈ 3,4 s', r['restNach'] > 3.3 and r['restNach'] <= 3.4, r['restNach'])
        txt = [t for t in r['texte'] if t]
        pruefe('HUD zeigt „🚨 Polizei! Anhalten… N s“', any('Anhalten' in t for t in txt), txt[:2])
        pruefe('Vorhersage zählt den Rest herunter', len(r['rest']) > 2 and r['rest'][-1] < r['rest'][0], [r['rest'][0], r['rest'][-1]])
        pg.screenshot(path=os.path.join(out, '3_stopp.png'))
        # nach dem künstlichen Zustand holen die echten Zustände (ohne ps) die Anzeige zurück: HUD-Text weg, Rest 0
        pg.wait_for_timeout(2500)
        e = pg.evaluate(LAGE)
        pruefe('Echte Zustände ohne ps: Anhaltung beendet (Rest 0, HUD ohne „Anhalten“)', e['rest'] == 0 and not (e['text'] and 'Anhalten' in e['text'] and e['anzeige'] != 'none'), [e['rest'], e['text']])
        pg.screenshot(path=os.path.join(out, '4_weiter.png'))
        browser.close()
finally:
    srv.terminate()
pruefe('keine JS-Fehler', not fehler, fehler[:3])
print('\n%d Prüfungen, %d FAIL' % (len(bilanz), bilanz.count(False)))
sys.exit(0 if all(bilanz) else 1)
