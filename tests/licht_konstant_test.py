#!/usr/bin/env python3
"""v26c (15.10.): Licht-Pool gegen Shader-Neubau.  Beleg: nach dem Rennstart darf sich die Zahl der Lichter je Typ NICHT mehr ändern
und es dürfen KEINE neuen Shader-Programme mehr entstehen (renderer.info.programs.length und gl.linkProgram-Aufrufe konstant).

Aufruf:
  python3 tests/licht_konstant_test.py                 Prüfmodus (bricht mit FEHL ab, wenn nach dem Countdown Programme entstehen)
  MESSEN=1 python3 tests/licht_konstant_test.py        nur messen und Tabelle ausgeben (Vorher-Zahlen), kein Abbruch
  DAUER=60 (s Rennzeit je Szenario, Standard 60), NUR=a,b (Szenario-Namen), ONLINE=0 (Online-Szenario auslassen), SHOTS=1 (Bilder tests/out/v26c/)
Hilfsmittel im Seiten-Kontext: window.__gl = { links, ms } (Zähler über linkProgram/getProgramParameter/getProgramInfoLog),
Rennspiel.spiel.zeichnen wird umhüllt und sammelt die Licht-Signaturen (sichtbare Lichter je Typ) je Bild."""
import os, sys, json, time, socket, subprocess
from playwright.sync_api import sync_playwright

basis = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
out = os.path.join(basis, 'tests', 'out', 'v26c'); os.makedirs(out, exist_ok=True)
url = 'file://' + os.path.join(basis, 'Autorennen.html')
MESSEN = bool(os.environ.get('MESSEN'))
DAUER = float(os.environ.get('DAUER', '60'))
SHOTS = bool(os.environ.get('SHOTS'))
NUR = [x for x in os.environ.get('NUR', '').split(',') if x]
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-proxy-server']

INIT = """
(() => {
  const g = window.__gl = { links: 0, ms: 0, verlauf: [] };
  for (const K of [window.WebGLRenderingContext, window.WebGL2RenderingContext]) {
    if (!K) continue;
    const p = K.prototype, lp = p.linkProgram, gp = p.getProgramParameter, gl = p.getProgramInfoLog;
    p.linkProgram = function (x) { g.links++; g.verlauf.push(Math.round(performance.now())); return lp.call(this, x); };
    p.getProgramParameter = function (a, b) { const t = performance.now(); const r = gp.call(this, a, b); g.ms += performance.now() - t; return r; };
    p.getProgramInfoLog = function (a) { const t = performance.now(); const r = gl.call(this, a); g.ms += performance.now() - t; return r; };
  }
})();
"""

# Hook: Licht-Signaturen je gezeichnetem Bild + Tageszeit; meldet auch, welche Lichter in der Szene stehen
HOOK = """() => {
  const s = Rennspiel.spiel;
  if (s.__hook) return true;
  s.__hook = true; s.__sig = {}; s.__bilder = 0;
  const orig = s.zeichnen.bind(s);
  s.zeichnen = function () {
    const z = { spot: 0, punkt: 0, richtung: 0, halb: 0 };
    s.szene.traverseVisible((o) => { if (!o.isLight) return; if (o.isSpotLight) z.spot++; else if (o.isPointLight) z.punkt++; else if (o.isDirectionalLight) z.richtung++; else if (o.isHemisphereLight) z.halb++; });
    const k = 'S' + z.spot + ' P' + z.punkt + ' D' + z.richtung + ' H' + z.halb;
    s.__sig[k] = (s.__sig[k] || 0) + 1; s.__bilder++;
    return orig();
  };
  return true;
}"""

STAND = """() => { const s = Rennspiel.spiel, r = s.renderer;
  return { programme: r.info.programs ? r.info.programs.length : -1, links: window.__gl.links, glMs: Math.round(window.__gl.ms),
    sig: Object.assign({}, s.__sig), bilder: s.__bilder, rz: s.rennen ? s.rennen.zustand : null, zustand: s.zustand,
    t: +(s._physikZeit || 0).toFixed(1), startMs: Math.round(s.startMs || 0), vorwaermMs: Math.round(s.vorwaermMs || 0) }; }"""

# Online: das eigene Auto fährt vom Computerfahrer gesteuert (wie tests/online_polizei_test.py, aber mit vollem Gas)
FAHREN = """() => { const s = Rennspiel.spiel, o = s.online, R = Rennspiel; if (!o) return false;
  const d = new R.Driver(o.vorhersage.vp, s.strecke, { schwierigkeit: 'mittel', seed: 5, name: 'Test' });
  if (d.hindernisseSetzen) d.hindernisseSetzen(s.strecke.hindernisse);
  s.input.steuerung = (nr) => {
    if (nr !== 0) return { gas: 0, bremse: 0, lenkung: 0 };
    const t = s.rennen.teilnehmer[o.du];
    const st = d.steuerung(1 / 60, { andere: [], spielerFortschrittMax: null, eigenerFortschritt: t.fortschritt, laeuft: s.rennen.gasErlaubt });
    return { gas: st.gas, bremse: st.bremse, lenkung: st.lenkung };
  }; return true; }"""

# Spieler zu den Blaulicht-Fahrzeugen schicken (abwechselnd Streifenwagen, Krankenwagen), damit die Lichter wirklich an/aus gehen
TELEPORT = """(k) => { const s = Rennspiel.spiel; const ziele = [];
  if (s.polizei) s.polizei.idx.forEach(i => ziele.push(s.fahrzeuge[i]));
  if (s.verkehr) s.verkehr.eintraege.forEach(e => { if (e.art === 'krankenwagen' && e.aktiv) ziele.push(e.f); });
  const sp = s.fahrzeuge.filter(f => f.istSpieler);
  if (!ziele.length || !sp.length) return ziele.length;
  const f = sp[k % sp.length], z = ziele[Math.floor(k / sp.length) % ziele.length], v = z.anzeige || z.vehicle;
  f.vehicle.setzen(v.x + 9, v.z + 6, f.vehicle.heading); f.vehicle.vLaengs = 0;
  return ziele.length; }"""

TUNNEL_TP = """() => { const s = Rennspiel.spiel, st = s.strecke; if (!st.tunnel.length) return false;
  const t = st.tunnel[0], p = st.spline.punktBei((t.s0 + t.s1) / 2), f = s.fahrzeuge.find(x => x.istSpieler);
  f.vehicle.setzen(p.x, p.z, f.vehicle.heading); return true; }"""

# Szenarien (offline).  verkehr: aus|wenig|viel
def cfg(**k):
    base = dict(modus='solo', streckeId='wiese', autoIds=['troc-cabrio', 'multivan'], runden=3, gegner=8, schwierigkeit='mittel',
                fahrhilfe=['wenig', 'wenig'], wetter='klar', jahreszeit='sommer', tageszeit='tag', verkehr='aus', geisterfahrer=False,
                schaden=False, polizei=False)
    base.update(k); return base

SZENARIEN = [
    ('tag_ohne',        cfg(), 'Tag, klar, ohne Verkehr (Referenz)'),
    ('tag_viel',        cfg(verkehr='viel', geisterfahrer=True, polizei=True), 'Tag, Verkehr viel, Geister, Polizei, 9 Teilnehmer'),
    ('daemm_regen',     cfg(tageszeit='daemmerung', wetter='regen', verkehr='viel', geisterfahrer=True, polizei=True), 'Dämmerung, Regen, Verkehr viel, Geister, Polizei, 9'),
    ('nacht_regen',     cfg(tageszeit='nacht', wetter='regen', verkehr='viel', geisterfahrer=True, polizei=True, schaden=True), 'Nacht, Regen, Verkehr viel, Geister, Polizei, Schaden, 9'),
    ('nacht_zwei',      cfg(tageszeit='nacht', wetter='regen', modus='zwei', gegner=7, verkehr='viel', geisterfahrer=True, polizei=True), 'Nacht, Regen, ZWEI Spieler, Verkehr viel, Polizei, 9'),
    ('tunnel_tag',      cfg(streckeId='wueste', verkehr='viel', geisterfahrer=True, polizei=True, tunnel=True), 'Tunnel-Strecke (Wüste), Tag, Verkehr viel, Polizei'),
    ('tunnel_nacht',    cfg(streckeId='wueste', tageszeit='nacht', wetter='regen', verkehr='viel', geisterfahrer=True, polizei=True, tunnel=True), 'Tunnel-Strecke (Wüste), Nacht, Regen, Verkehr viel, Polizei'),
    ('tunnel_zwei_tag', cfg(streckeId='wueste', modus='zwei', gegner=7, verkehr='wenig', polizei=True, tunnel=True), 'Tunnel-Strecke, Tag, ZWEI Spieler, Verkehr wenig, Polizei'),
]

pruef = []
def pruefe(name, ok, info=''):
    pruef.append((name, bool(ok)))
    print(('OK   ' if ok else 'FEHL ') + name + (' – ' + str(info) if info != '' else ''), flush=True)

def neue_seite(browser, w=800, h=500):
    pg = browser.new_context(viewport={'width': w, 'height': h}).new_page()
    fehler = []
    pg.add_init_script(INIT)
    pg.on('pageerror', lambda e: fehler.append(str(e)))
    return pg, fehler

def messen_offline(browser, name, c, titel):
    pg, fehler = neue_seite(browser)
    pg.goto(url); pg.wait_for_timeout(1200)
    tunnel = c.pop('tunnel', False)
    pg.evaluate("window.__gl.links = 0; window.__gl.ms = 0; window.__gl.verlauf.length = 0")
    t0 = time.time()
    pg.evaluate("(c) => { Rennspiel.spiel.rennenStarten(c); Rennspiel.spiel.autopilot(0); if (c.modus === 'zwei') Rennspiel.spiel.autopilot(1); }", c)
    pg.evaluate(HOOK)
    start = pg.evaluate(STAND)
    start['wandMs'] = round((time.time() - t0) * 1000)
    # bis die Ampel auf Grün ist (Countdown vorbei)
    pg.wait_for_function("Rennspiel.spiel.rennen.zustand !== 'countdown'", timeout=120000, polling=200)
    nach_cd = pg.evaluate(STAND)
    if SHOTS and name in ('nacht_regen',): pg.screenshot(path=os.path.join(out, name + '_start.png'))
    k = 0; t1 = time.time(); letzte = 0
    while time.time() - t1 < DAUER:
        if tunnel and k % 2 == 0: pg.evaluate(TUNNEL_TP)
        else: pg.evaluate(TELEPORT, k)
        k += 1
        pg.wait_for_timeout(2500)
        if SHOTS and name in ('nacht_regen', 'nacht_zwei') and k in (2, 4): pg.screenshot(path=os.path.join(out, '%s_%d.png' % (name, k)))
        if not MESSEN:
            z = pg.evaluate(STAND)
            if z['programme'] > nach_cd['programme'] or z['links'] > nach_cd['links']:
                pruefe(name + ': ABBRUCH – nach dem Countdown neue Programme', False, {'nach_cd': nach_cd, 'jetzt': z})
                break
    ende = pg.evaluate(STAND)
    pg.close()
    return dict(name=name, titel=titel, start=start, nach_cd=nach_cd, ende=ende, fehler=fehler[:3], teleports=k)

def zeile(r):
    s, c, e = r['start'], r['nach_cd'], r['ende']
    sig = e['sig']
    return '%-16s Programme: Start %3d | n.Countdown %3d | Ende %3d (+%d) | Links nach CD +%d | GL-ms %d | Start %d ms (Vorwärmen %d) | Lichtsignaturen %d: %s' % (
        r['name'], s['programme'], c['programme'], e['programme'], e['programme'] - c['programme'], e['links'] - c['links'], e['glMs'],
        s['startMs'], s['vorwaermMs'], len(sig), json.dumps(sig))

def online_szenario(browser):
    """Host allein: Nacht, Regen, Verkehr viel, Geister, Polizei, 8 Gegner (Online: Gegner = Computer) – Programme nach Rennstart."""
    basis_port = socket.socket(); basis_port.bind(('127.0.0.1', 0)); port = basis_port.getsockname()[1]; basis_port.close()
    srv = subprocess.Popen(['node', os.path.join(basis, 'server', 'server.js'), '--port', str(port), '--host', '127.0.0.1'], stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
    for _ in range(50):
        try: socket.create_connection(('127.0.0.1', port), timeout=0.2).close(); break
        except OSError: time.sleep(0.1)
    try:
        pg, fehler = neue_seite(browser)
        pg.goto('http://127.0.0.1:%d/' % port)
        pg.wait_for_function('window.Rennspiel && Rennspiel.spiel', timeout=90000, polling=200)
        pg.wait_for_timeout(800)
        for _ in range(4): pg.keyboard.press('ArrowRight'); pg.wait_for_timeout(80)
        pg.keyboard.press('Enter'); pg.wait_for_timeout(300)
        pg.keyboard.press('Enter')
        pg.wait_for_function("Rennspiel.spiel.menue.onlineUi.lobby !== null && Rennspiel.spiel.menue.onlineUi.ansicht === 'lobby'", timeout=10000, polling=200)
        pg.wait_for_timeout(400)
        soll = {'polizei': True, 'verkehr': 'viel', 'tageszeit': 'nacht', 'wetter': 'regen', 'geisterfahrer': True, 'gegner': 8}
        for versuch in range(4):          # unter Last verfehlt ein Klick gelegentlich: bis die Lobby-Einstellungen stimmen (max. 4 Runden)
            for a in ['wert:polizei:an', 'wert:strecke:wiese', 'wert:runden:9', 'wert:gegner:8', 'wert:tageszeit:nacht', 'wert:wetter:regen', 'wert:verkehr:viel', 'wert:geisterfahrer:an']:
                try: pg.click('[data-a="%s"]' % a, timeout=3000); pg.wait_for_timeout(300)
                except Exception: print('   (Lobby-Knopf nicht gefunden: %s)' % a)
            e = pg.evaluate("Rennspiel.spiel.menue.onlineUi.lobby.einstellungen")
            if all(e.get(k) == v for k, v in soll.items()): break
        einst = pg.evaluate("JSON.stringify(Rennspiel.spiel.menue.onlineUi.lobby.einstellungen)")
        if not all(e.get(k) == v for k, v in soll.items()): raise Exception('Lobby-Einstellungen nicht gesetzt: ' + einst)
        pg.evaluate("window.__gl.links = 0; window.__gl.ms = 0")
        pg.keyboard.press('Enter')
        pg.wait_for_function("Rennspiel.spiel.zustand === 'online' && Rennspiel.spiel.online && Rennspiel.spiel.online.empfangen", timeout=120000, polling=200)
        pg.evaluate(HOOK)
        pg.evaluate(FAHREN)
        start = pg.evaluate(STAND)
        pg.wait_for_function("Rennspiel.spiel.zustand !== 'online' || (Rennspiel.spiel.rennen && Rennspiel.spiel.rennen.zustand !== 'countdown')", timeout=120000, polling=200)
        nach_cd = pg.evaluate(STAND)
        k = 0; t1 = time.time()
        while time.time() - t1 < DAUER:
            k += 1
            pg.wait_for_timeout(2500)
            if SHOTS and k in (3, 6, 9): pg.screenshot(path=os.path.join(out, 'online_nacht_%d.png' % k))
            if pg.evaluate("Rennspiel.spiel.zustand") != 'online': break
        weg = pg.evaluate("Rennspiel.spiel.zustand") != 'online'
        ende = pg.evaluate(STAND)
        pg.close()
        return dict(name='online_nacht', titel='ONLINE Host: Nacht, Regen, Verkehr viel, Geister, Polizei, 8 Gegner', start=start, nach_cd=nach_cd, ende=ende, fehler=fehler[:3], einst=einst, verbindungWeg=weg)
    finally:
        srv.terminate()

def main():
    ergebnisse = []
    with sync_playwright() as p:
        browser = p.chromium.launch(args=ARGS)
        for name, c, titel in SZENARIEN:
            if NUR and name not in NUR: continue
            try:
                r = messen_offline(browser, name, dict(c), titel)
            except Exception as e:
                print('FEHL %s: Ausnahme %s' % (name, str(e)[:300]), flush=True); pruefe(name + ': Lauf', False, str(e)[:200]); continue
            ergebnisse.append(r)
            print(zeile(r), flush=True)
            if not MESSEN:
                d = r['ende']['programme'] - r['nach_cd']['programme']
                pruefe(name + ': keine neuen Programme nach dem Countdown (%d Links)' % (r['ende']['links'] - r['nach_cd']['links']),
                       d == 0 and r['ende']['links'] == r['nach_cd']['links'], 'Programme %d → %d' % (r['nach_cd']['programme'], r['ende']['programme']))
                nsig = len(r['ende']['sig'])
                pruefe(name + ': genau EINE Licht-Signatur im ganzen Rennen', nsig == 1, r['ende']['sig'])
                pruefe(name + ': keine JS-Fehler', not r['fehler'], r['fehler'])
        if not NUR or 'online_nacht' in NUR:
            if os.environ.get('ONLINE', '1') != '0':
                try:
                    r = online_szenario(browser); ergebnisse.append(r); print(zeile(r), flush=True); print('   Einstellungen:', r['einst'], '| Verbindung weg vor Ende:', r.get('verbindungWeg'))
                    if not MESSEN:
                        pruefe('online_nacht: keine neuen Programme nach dem Countdown', r['ende']['programme'] == r['nach_cd']['programme'] and r['ende']['links'] == r['nach_cd']['links'],
                               'Programme %d → %d' % (r['nach_cd']['programme'], r['ende']['programme']))
                        pruefe('online_nacht: genau EINE Licht-Signatur', len(r['ende']['sig']) == 1, r['ende']['sig'])
                        pruefe('online_nacht: Verbindung bleibt die ganze Messzeit stehen', not r.get('verbindungWeg'))
                except Exception as e:
                    pruefe('online_nacht: Lauf', False, str(e)[:300])
        browser.close()
    json.dump(ergebnisse, open(os.path.join(out, 'messung_%s.json' % ('vorher' if MESSEN else 'lauf')), 'w'), indent=1, ensure_ascii=False)
    if not MESSEN:
        n = sum(1 for _, ok in pruef if not ok)
        print('\n%d Prüfungen, %d FEHL' % (len(pruef), n)); sys.exit(1 if n else 0)

main()
