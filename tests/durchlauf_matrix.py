#!/usr/bin/env python3
"""Phase 2 (15.10. v27): echte Durchläufe – nur Berichte, kein Fix.  python3 tests/durchlauf_matrix.py [Optionen]
Teile (--teil, Standard alle nacheinander): offline (Einzel/Zweispieler, komplette Rennen, 5 Rennen je Tab) · online (2 Browser + Sonderfälle)
                                            · brett (4 gewinnt + Schach) · dauer (Server-Dauerlauf)
Optionen: --liste (nur Matrix zeigen)  --nur ID[,ID]  --session sN  --wiederholen  --bericht (nur Bericht neu schreiben)  --seed 27
          --dauer-min 20  --max-offline N  --kurz (kleine Probe: je Teil nur wenige Läufe)
Ergebnisse: tests/out/p2/ergebnisse.jsonl (fortsetzbar), Bericht tests/out/p2/durchlaeufe.md, Bilder tests/out/p2/*.png.
Steuerung des Spielers: Test-Haken Rennspiel.spiel.autopilot(i, true) (= Computerfahrer R.Driver, wie im Spiel für KI); online: input.steuerung → R.Driver (wie tests/online5_test.py).
Zeitraffer: Rennspiel.spiel.schnellvorlauf(s) (nur Physik/Rennleitung, ohne Zeichnen) im Wechsel mit voll gezeichneten Bildern (frame() von Hand, 1/60 s je Bild);
Rundenzahl 1 (Letzter fliegt raus: Teilnehmer-1).  Hänger-Watchdog: ein Aufruf > 60 s → CDP Debugger.pause → Stack im Bericht."""
import asyncio, os, sys, json, time, random, socket, subprocess, itertools, argparse, statistics, re, traceback, shutil
from playwright.async_api import async_playwright

BASIS = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(BASIS, 'tests', 'out', 'p2')
os.makedirs(OUT, exist_ok=True)
JSONL = os.path.join(OUT, 'ergebnisse.jsonl')
os.environ.setdefault('PLAYWRIGHT_BROWSERS_PATH', '/opt/pw-browsers')
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-precise-memory-info',
        '--autoplay-policy=no-user-gesture-required', '--js-flags=--expose-gc']
WATCHDOG = 60.0          # s ohne Antwort = Hänger
SESSION_N = 5            # Rennen je Tab
FR_ZYKLUS, SKIP_S = 12, 10   # voll gezeichnete Bilder je Zyklus, danach so viele Sekunden Zeitraffer
MAX_SIM_S, MAX_WALL_S = 900, 420

ap = argparse.ArgumentParser()
ap.add_argument('--teil', default='alle'); ap.add_argument('--liste', action='store_true'); ap.add_argument('--nur', default='')
ap.add_argument('--session', default=''); ap.add_argument('--wiederholen', action='store_true'); ap.add_argument('--bericht', action='store_true')
ap.add_argument('--seed', type=int, default=27); ap.add_argument('--dauer-min', type=float, default=20); ap.add_argument('--max-offline', type=int, default=0)
ap.add_argument('--kurz', action='store_true')
ARG = ap.parse_args()

STRECKEN = ['wiese', 'wald', 'wueste', 'fantasie', 'dino', 'alpen', 'mega']
FAKTOREN = [('strecke', STRECKEN), ('variante', ['', 'xl']), ('tageszeit', ['tag', 'daemmerung', 'nacht']), ('wetter', ['klar', 'regen', 'schnee']),
            ('modus', ['solo', 'zwei']), ('polizei', [0, 1]), ('schaden', [0, 1]), ('hind', [0, 1]), ('verkehr', [0, 1]), ('geister', [0, 1]),
            ('welt', ['', 'verrueckt', 'alles']), ('troc', [0, 1])]
WETTER_NAME = {'klar': 'sonne', 'regen': 'regen', 'schnee': 'schnee'}

def gueltig(c): return not (c['strecke'] == 'mega' and c['variante'] == 'xl')

def paarweise(rng):
    """Greedy-Paarweise-Abdeckung (alle Wertepaare zweier Faktoren mindestens einmal) – deterministisch durch den Seed."""
    namen = [f[0] for f in FAKTOREN]; werte = [f[1] for f in FAKTOREN]
    offen = set()
    for i in range(len(namen)):
        for j in range(i + 1, len(namen)):
            for a in werte[i]:
                for b in werte[j]:
                    c = {'strecke': 'mega', 'variante': 'xl'}
                    if (namen[i], a) in [('strecke', 'mega')] and (namen[j], b) == ('variante', 'xl'): continue
                    if (namen[j], b) in [('strecke', 'mega')] and (namen[i], a) == ('variante', 'xl'): continue
                    offen.add((i, a, j, b))
    zeilen = []
    while offen:
        beste, bn = None, -1
        for _ in range(250):
            c = {n: rng.choice(w) for n, w in zip(namen, werte)}
            if not gueltig(c): continue
            n = sum(1 for (i, a, j, b) in offen if c[namen[i]] == a and c[namen[j]] == b)
            if n > bn: beste, bn = c, n
        if bn <= 0: break
        zeilen.append(beste)
        offen = {(i, a, j, b) for (i, a, j, b) in offen if not (beste[namen[i]] == a and beste[namen[j]] == b)}
    return zeilen

def konfig_text(c):
    t = [c['strecke'], 'XL' if c.get('variante') == 'xl' else 'normal', c['tageszeit'], WETTER_NAME.get(c['wetter'], c['wetter']), c['modus']]
    for k, n in (('polizei', 'Polizei'), ('schaden', 'Schaden'), ('hind', 'Hindernisse-viel'), ('verkehr', 'Verkehr-viel'), ('geister', 'Geisterfahrer'), ('troc', 'T-Roc-offen')):
        if c.get(k): t.append(n)
    if c.get('welt'): t.append('Welt=' + c['welt'])
    if c.get('tempo'): t.append('Tempo-schnell')
    if c.get('spielart') == 'elimination': t.append('Letzter-fliegt-raus')
    return ' · '.join(t)

def einst_aus(c):
    solo = c['modus'] == 'solo'
    welt = c.get('welt', '')
    if c.get('hind') and not welt: welt = 'hindernisse' if c['strecke'] != 'fantasie' else 'verrueckt'
    e = dict(modus='solo' if solo else 'zwei', streckeId=c['strecke'], autoIds=['troc-cabrio', 'multivan'] if c.get('troc') else ['porsche-911', 'mini-cooper'],
             runden=1, gegner=5 if solo else 4, schwierigkeit='mittel', fahrhilfe=['wenig', 'wenig'], wetter=c['wetter'],
             jahreszeit=c.get('jahr') or ('winter' if c['wetter'] == 'schnee' else 'sommer'), tempoKlasse='schnell' if c.get('tempo') else 'normal', tageszeit=c['tageszeit'], verkehr='viel' if c.get('verkehr') else 'aus',
             geisterfahrer=bool(c.get('geister')), schaden=bool(c.get('schaden')), polizei=bool(c.get('polizei')), variante=c.get('variante', ''),
             welt=welt, hindernisMenge='sehrViele' if c.get('hind') else 'normal', spielart=c.get('spielart', 'rennen'))
    if c.get('spielart') == 'elimination': e['gegner'] = 3
    return e

def offline_matrix(seed):
    rng = random.Random(seed)
    zeilen = paarweise(rng)
    for z in zeilen: z['modus'] = z['modus']                     # solo/zwei (Online: eigener Teil)
    liste = []
    for i, z in enumerate(zeilen): liste.append(('o%02d' % (i + 1), 'Paarweise', z))
    # Letzter fliegt raus (kurze Strecken)
    for i, st in enumerate(['wiese', 'fantasie', 'wald', 'dino']):
        z = dict(strecke=st, variante='', tageszeit=['tag', 'nacht', 'daemmerung', 'tag'][i], wetter=['klar', 'regen', 'klar', 'schnee'][i], modus=['solo', 'zwei', 'solo', 'solo'][i],
                 polizei=0, schaden=i % 2, hind=0, verkehr=0, geister=0, welt='', troc=1, spielart='elimination')
        liste.append(('e%02d' % (i + 1), 'Letzter fliegt raus', z))
    # 10 Zufallskombinationen (fester Seed)
    r2 = random.Random(seed * 1000 + 7)
    for i in range(10):
        while True:
            z = {n: r2.choice(w) for n, w in FAKTOREN}
            if gueltig(z): break
        liste.append(('z%02d' % (i + 1), 'Zufall', z))
    # Ergänzung (P2-Auftrag): Hagel/Nebel/Sandsturm und Tempo-Klasse schnell (nicht Teil der paarweisen Auswahl, eigene IDs)
    erg = [('hagel', 'wiese', '', 'tag', 'sommer', 'solo', 0), ('hagel', 'alpen', '', 'nacht', 'winter', 'zwei', 0), ('hagel', 'mega', '', 'daemmerung', 'sommer', 'solo', 0),
           ('nebel', 'wald', '', 'daemmerung', 'sommer', 'solo', 0), ('sandsturm', 'wueste', '', 'tag', 'sommer', 'zwei', 0),
           ('klar', 'wiese', '', 'tag', 'sommer', 'solo', 1), ('regen', 'dino', '', 'nacht', 'sommer', 'zwei', 1), ('klar', 'mega', '', 'tag', 'sommer', 'solo', 1),
           ('hagel', 'fantasie', 'xl', 'nacht', 'sommer', 'solo', 1)]
    for i, (w, st, va, tz, jz, mo, tp) in enumerate(erg):
        liste.append(('x%02d' % (i + 1), 'Ergänzung', dict(strecke=st, variante=va, tageszeit=tz, wetter=w, jahr=jz, modus=mo, polizei=int(i % 2 == 0), schaden=i % 2, hind=0, verkehr=int(i % 3 == 0),
                                                         geister=0, welt='', troc=0, tempo=tp)))
    # Leck-Tabs: 5 gleiche Rennen hintereinander in EINEM Tab
    leck = [('L', dict(strecke='wiese', variante='', tageszeit='tag', wetter='klar', modus='solo', polizei=0, schaden=0, hind=0, verkehr=0, geister=0, welt='', troc=1)),
            ('M', dict(strecke='alpen', variante='xl', tageszeit='nacht', wetter='regen', modus='zwei', polizei=1, schaden=1, hind=0, verkehr=1, geister=1, welt='', troc=1)),
            ('G', dict(strecke='mega', variante='', tageszeit='daemmerung', wetter='klar', modus='solo', polizei=0, schaden=0, hind=0, verkehr=1, geister=0, welt='', troc=0))]
    return liste, leck

def sessions_bilden(liste, leck):
    """Rennen auf Tabs verteilen: Paarweise/Elimination/Zufall in Gruppen zu je SESSION_N, dazu je ein Leck-Tab mit 5 gleichen Rennen."""
    s = []
    for k in range(0, len(liste), SESSION_N): s.append(('s%d' % (len(s) + 1), [(i, g, c) for (i, g, c) in liste[k:k + SESSION_N]], False))
    for buchstabe, c in leck: s.append(('s%d' % (len(s) + 1) + '-leck' + buchstabe, [('%s%d' % (buchstabe, n + 1), 'Leck-Tab', c) for n in range(SESSION_N)], True))
    return s

# ---------------------------------------------------------------- Ergebnisse
def lese_ergebnisse():
    d = {}
    if os.path.exists(JSONL):
        for z in open(JSONL, encoding='utf-8'):
            try: r = json.loads(z); d[r['id']] = r
            except Exception: pass
    return d

def speichere(r):
    with open(JSONL, 'a', encoding='utf-8') as f: f.write(json.dumps(r, ensure_ascii=False) + '\n')
    print('%-6s %-8s %-7s %6.1fs  %s' % (r['id'], r.get('teil', ''), r['ergebnis'], r.get('dauer', 0), (r.get('konfig') or '')[:90]) + ('  !! ' + str(r.get('notiz', ''))[:160] if r['ergebnis'] != 'OK' else ''), flush=True)

# ---------------------------------------------------------------- Server
def freier_port():
    s = socket.socket(); s.bind(('127.0.0.1', 0)); p = s.getsockname()[1]; s.close(); return p

class Server:
    def __init__(self, name='srv', mem_sek=120, extra=None):
        self.port = freier_port(); self.name = name
        self.memdatei = os.path.join(OUT, 'servermem_%s.jsonl' % name)
        if os.path.exists(self.memdatei): os.remove(self.memdatei)
        self.logdatei = os.path.join(OUT, 'server_%s.log' % name)
        env = dict(os.environ, P2_MEM_FILE=self.memdatei, P2_MEM_SEK=str(mem_sek))
        self.log = open(self.logdatei, 'w')
        self.p = subprocess.Popen(['node', '--expose-gc', '--require', os.path.join(BASIS, 'tests', 'p2_mem_hook.js'), os.path.join(BASIS, 'server', 'server.js'),
                                   '--port', str(self.port), '--host', '127.0.0.1'] + (extra or []), stdout=self.log, stderr=subprocess.STDOUT, env=env, cwd=BASIS)
        for _ in range(100):
            try: socket.create_connection(('127.0.0.1', self.port), timeout=0.2).close(); break
            except OSError: time.sleep(0.1)
        self.url = 'http://127.0.0.1:%d/' % self.port
    def lebt(self): return self.p.poll() is None
    def stoppen(self):
        try: self.p.terminate(); self.p.wait(10)
        except Exception:
            try: self.p.kill()
            except Exception: pass
        try: self.log.close()
        except Exception: pass

# ---------------------------------------------------------------- Seite mit Watchdog
class Haenger(Exception): pass
class JsFehler(Exception): pass

class Seite:
    def __init__(self, page, cdp, name):
        self.page, self.cdp, self.name = page, cdp, name
        self.fehler = []; self.abgestuerzt = False; self.pausiert = None
        page.on('pageerror', lambda e: self.fehler.append('pageerror: ' + str(e)[:300]))
        page.on('console', lambda m: self.fehler.append('console.error: ' + m.text[:300]) if m.type == 'error' else None)
        page.on('crash', lambda: setattr(self, 'abgestuerzt', True))
        cdp.on('Debugger.paused', self._pause)
    def _pause(self, ev):
        if self.pausiert and not self.pausiert.done(): self.pausiert.set_result(ev)
    async def ev(self, expr, timeout=WATCHDOG):
        try:
            r = await asyncio.wait_for(self.cdp.send('Runtime.evaluate', {'expression': expr, 'returnByValue': True, 'awaitPromise': True}), timeout)
        except asyncio.TimeoutError:
            raise Haenger(await self.stack())
        if 'exceptionDetails' in r:
            d = r['exceptionDetails']; ex = d.get('exception', {})
            raise JsFehler((ex.get('description') or d.get('text') or 'JS-Fehler')[:600])
        return r['result'].get('value')
    async def stack(self):
        try:
            self.pausiert = asyncio.get_event_loop().create_future()
            await self.cdp.send('Debugger.enable'); await self.cdp.send('Debugger.pause')
            ev = await asyncio.wait_for(self.pausiert, 10)
            return ['%s %s:%d' % (f['functionName'] or '(anon)', f['url'].split('/')[-1], f['location']['lineNumber'] + 1) for f in ev['callFrames'][:14]]
        except Exception:
            return ['(nicht pausierbar)']
    async def shot(self, name):
        pfad = os.path.join(OUT, name + '.png')
        try:                                   # direkt über CDP: Playwrights screenshot() wartet auf requestAnimationFrame (offline absichtlich stillgelegt)
            import base64
            r = await asyncio.wait_for(self.cdp.send('Page.captureScreenshot', {'format': 'png'}), 30)
            open(pfad, 'wb').write(base64.b64decode(r['data'])); return os.path.relpath(pfad, BASIS)
        except Exception: return None
    async def schliessen(self):
        try: await asyncio.wait_for(self.page.context.close(), 15)
        except Exception: pass

async def neue_seite(browser, url, name, w=1000, h=620):
    ctx = await browser.new_context(viewport={'width': w, 'height': h})
    page = await ctx.new_page()
    cdp = await ctx.new_cdp_session(page)
    s = Seite(page, cdp, name)
    await page.goto(url, timeout=90000)
    await page.wait_for_function('window.Rennspiel && Rennspiel.spiel', timeout=90000, polling=200)
    await page.wait_for_timeout(500)
    return s

# ---------------------------------------------------------------- Seiten-Hilfscode (Offline: Spielschleife von Hand)
P2_JS = r'''(() => {
  if (window.__p2) return true;
  const s = Rennspiel.spiel, R = Rennspiel;
  window.requestAnimationFrame = () => 0;                   // Spielschleife anhalten: frame() rufen wir selbst (1/60 s je Bild)
  try { R.Audio.start && R.Audio.start(); R.Audio.setzeAn && R.Audio.setzeAn(true); } catch (e) {}
  let jetzt = performance.now(), renderMs = 0, js = [], simS = 0;
  const orig = s.zeichnen; s.zeichnen = function () { const a = performance.now(); try { return orig.apply(this, arguments); } finally { renderMs += performance.now() - a; } };
  s.uhr.letzte = jetzt; s.uhr.rest = 0;
  const frames = (n) => { for (let i = 0; i < n; i++) { jetzt += 1000 / 60; renderMs = 0; const a = performance.now(); s.frame(jetzt); js.push(performance.now() - a - renderMs); simS += 1 / 60; } };
  const mem = () => { try { if (window.gc) window.gc(); } catch (e) {}
    const i = s.renderer.info;
    return { prog: i.programs ? i.programs.length : -1, geo: i.memory.geometries, tex: i.memory.textures, heapMB: performance.memory ? +(performance.memory.usedJSHeapSize / 1048576).toFixed(2) : -1 }; };
  const stat = () => { const r = s.rennen; return { z: s.zustand, rz: r ? r.zustand : null, simS: +simS.toFixed(1), n: js.length, platz: r ? r.teilnehmer.filter(t => t.imZiel).length : 0, nt: r ? r.teilnehmer.length : 0 }; };
  window.__p2 = {
    frames, mem, stat,
    start(einst) { js = []; simS = 0; const t0 = performance.now(); s.rennenStarten(einst);
      for (let i = 0; i < (einst.modus === 'zwei' ? 2 : 1); i++) s.autopilot(i, true);
      return { startMs: Math.round(performance.now() - t0), vorwaermMs: s.vorwaermMs, n: s.fahrzeuge.length, tmax: s.rennen.teilnehmer.length }; },
    zyklus(n, skip) { frames(n); if (s.zustand === 'rennen' && !s.pausiert && s.rennen && s.rennen.zustand !== 'fertig') { const a = s.rennen.zustand; s.schnellvorlauf(skip); simS += skip; } return stat(); },
    statistik() { const a = js.slice().sort((x, y) => x - y), q = (p) => a.length ? a[Math.min(a.length - 1, Math.floor(p * a.length))] : 0;
      return { n: a.length, p50: +q(0.5).toFixed(2), p95: +q(0.95).toFixed(2), max: +(a.length ? a[a.length - 1] : 0).toFixed(2) }; },
    ergebnis() { return Array.from(document.querySelectorAll('#ergebnis tbody tr')).map(r => r.textContent.trim().replace(/\s+/g, ' ')); },
    sperreMs: (R.config.ui && R.config.ui.ergebnisSperreMs) || 800,
  };
  return true; })()'''

def pctl(a, p):
    a = sorted(a)
    return a[min(len(a) - 1, int(p * len(a)))] if a else 0

async def offline_rennen(sess, rid, gruppe, c, bild):
    r = dict(id=rid, teil='offline', gruppe=gruppe, konfig=konfig_text(c), cfg=c, repro='python3 tests/durchlauf_matrix.py --nur %s' % rid)
    t0 = time.time(); sess.fehler.clear()
    try:
        r['vor'] = await sess.ev('__p2.mem()')
        einst = einst_aus(c)
        info = await sess.ev('__p2.start(%s)' % json.dumps(einst))
        r['start'] = info
        fertig, st = False, None
        while True:
            st = await sess.ev('__p2.zyklus(%d,%d)' % (FR_ZYKLUS, SKIP_S))
            if st['z'] == 'ergebnis': fertig = True; break
            if st['z'] != 'rennen': r['ergebnis'] = 'FEHLER'; r['notiz'] = 'Zustand unerwartet: %s' % st; break
            if st['simS'] > MAX_SIM_S * (3 if c.get('spielart') == 'elimination' else 1):
                r['ergebnis'] = 'FEHLER'; r['notiz'] = 'Rennen endet nicht (%.0f s Spielzeit, im Ziel %d/%d)' % (st['simS'], st['platz'], st['nt']); break
            if time.time() - t0 > MAX_WALL_S * (3 if c.get('spielart') == 'elimination' else 1):
                r['ergebnis'] = 'FEHLER'; r['notiz'] = 'Zeitlimit %d s (Spielzeit %.0f s)' % (MAX_WALL_S, st['simS']); break
        r['simS'] = st['simS'] if st else 0
        r['frames'] = await sess.ev('__p2.statistik()')
        if fertig:
            await sess.ev('__p2.frames(30)')
            await sess.page.wait_for_timeout(int(await sess.ev('__p2.sperreMs')) + 300)
            zeilen = await sess.ev('__p2.ergebnis()')
            erwartet = info['tmax']
            r['tafelZeilen'] = len(zeilen)
            if bild:
                r['bild'] = await sess.shot('tafel_' + rid)
            if len(zeilen) < 1 or (len(zeilen) != erwartet and not c.get('spielart') == 'elimination'):
                r['ergebnis'] = 'FEHLER'; r['notiz'] = 'Ergebnis-Tafel: %d Zeilen, erwartet %d' % (len(zeilen), erwartet)
            # P4 (16.10.): Klick per Maus-Koordinaten. Im rAF-stillgelegten Modus (__p2) wird die Hover-Transition des Knopfes (.knopf, styles.css:98) nie fertig,
            # Playwright wartet dann auf „stable“ und scheitert (P2: 11×, P3 S2 als Testartefakt widerlegt: echter Mausklick auf die Koordinaten wirkt 3/3).
            box = await sess.ev("(() => { const b = document.querySelector('#ergebnis [data-a=menue]'); if (!b) return null; const q = b.getBoundingClientRect(); return { x: q.left + q.width / 2, y: q.top + q.height / 2, w: q.width, h: q.height }; })()")
            if not box or box['w'] <= 0:
                raise Exception('Hauptmenü-Knopf auf der Ergebnis-Tafel nicht gefunden: %s' % box)
            await sess.page.mouse.click(box['x'], box['y'])
            await sess.ev('__p2.frames(20)')
            z = await sess.ev('Rennspiel.spiel.zustand')
            if z != 'menue':
                r['ergebnis'] = 'FEHLER'; r['notiz'] = (r.get('notiz', '') + ' Nach Hauptmenü-Klick Zustand=%s' % z).strip()
        r['nach'] = await sess.ev('__p2.mem()')
        if 'ergebnis' not in r: r['ergebnis'] = 'OK'
    except Haenger as h:
        r['ergebnis'] = 'HÄNGER'; r['stack'] = h.args[0]; r['notiz'] = 'Aufruf > %d s ohne Antwort' % WATCHDOG; sess.kaputt = True
    except JsFehler as e:
        r['ergebnis'] = 'FEHLER'; r['notiz'] = 'JS-Ausnahme im Aufruf: ' + str(e)[:300]; sess.kaputt = True
    except Exception as e:
        r['ergebnis'] = 'FEHLER'; r['notiz'] = 'Testfehler: %s: %s' % (type(e).__name__, str(e)[:1200]); sess.kaputt = True
        try:
            r['bild_fehler'] = await asyncio.wait_for(sess.shot('fehler_' + rid), 20)
            r['dom_ergebnis'] = await asyncio.wait_for(sess.ev("(() => { const e = document.getElementById('ergebnis'); const b = e && e.querySelector('[data-a=menue]'); if (!b) return 'kein Menue-Knopf'; const q = b.getBoundingClientRect(); const t = document.elementFromPoint(q.x + q.width / 2, q.y + q.height / 2); return {rect: [q.x, q.y, q.width, q.height], disp: getComputedStyle(e).display, oben: t ? (t.tagName + '#' + t.id + '.' + t.className) : null, zustand: Rennspiel.spiel.zustand}; })()", 10), 20)
        except Exception: pass
    if sess.abgestuerzt: r['ergebnis'] = 'HÄNGER'; r['notiz'] = 'Seite abgestürzt (crash)'; sess.kaputt = True
    r['jsFehler'] = list(sess.fehler)
    if r['jsFehler'] and r['ergebnis'] == 'OK': r['ergebnis'] = 'FEHLER'; r['notiz'] = 'JS-Fehler: ' + r['jsFehler'][0][:200]
    elif r['jsFehler']: r['notiz'] = (r.get('notiz', '') + ' | JS-Fehler: ' + r['jsFehler'][0][:160]).strip(' |')
    r['dauer'] = round(time.time() - t0, 1)
    return r

async def teil_offline(pw, sel_ids):
    liste, leck = offline_matrix(ARG.seed)
    sessions = sessions_bilden(liste, leck)
    if ARG.liste:
        for sid, rennen, istleck in sessions:
            print('== Tab %s ==' % sid)
            for (i, g, c) in rennen: print('  %-4s %-20s %s' % (i, g, konfig_text(c)))
        print('Offline-Läufe:', sum(len(s[1]) for s in sessions), '· online/brett/dauer: eigener Teil'); return
    fertig = lese_ergebnisse()
    srv = Server('offline')
    browser = await pw.chromium.launch(args=ARGS)
    try:
        for sid, rennen, istleck in sessions:
            if ARG.session and ARG.session != sid.split('-')[0] and ARG.session != sid: continue
            todo = [(i, g, c) for (i, g, c) in rennen if (not sel_ids or i in sel_ids) and (ARG.wiederholen or sel_ids or i not in fertig)]
            if not todo: continue
            if ARG.max_offline and len([1 for k in lese_ergebnisse() if lese_ergebnisse()[k].get('teil') == 'offline']) >= ARG.max_offline: break
            sess = None; n = 0
            for (i, g, c) in todo:
                if sess is None or getattr(sess, 'kaputt', False):
                    if sess: await sess.schliessen()
                    sess = await neue_seite(browser, srv.url, sid)
                    sess.kaputt = False; await sess.ev(P2_JS); n = 0
                n += 1
                r = await offline_rennen(sess, i, g, c, bild=(n == 1 or istleck and n == SESSION_N))
                r['tab'] = sid; r['tabNr'] = n; speichere(r)
            if sess: await sess.schliessen()
    finally:
        await browser.close(); srv.stoppen()

# ================================================================ ONLINE (2 Browser, echter Server)
P2O_JS = r'''(() => {
  if (window.__p2o) return true;
  const s = Rennspiel.spiel; let render = 0, js = [], last = performance.now();
  const oz = s.zeichnen; s.zeichnen = function () { const a = performance.now(); try { return oz.apply(this, arguments); } finally { render += performance.now() - a; } };
  const of = s.frame; s.frame = function (t) { const a = performance.now(); render = 0; try { return of.call(this, t); } finally { js.push(performance.now() - a - render); last = performance.now(); if (js.length > 30000) js.splice(0, 8000); } };
  const mem = () => { try { if (window.gc) window.gc(); } catch (e) {} const i = s.renderer.info;
    return { prog: i.programs ? i.programs.length : -1, geo: i.memory.geometries, tex: i.memory.textures, heapMB: performance.memory ? +(performance.memory.usedJSHeapSize / 1048576).toFixed(2) : -1 }; };
  window.__p2o = { mem, age: () => performance.now() - last, reset: () => { js = []; },
    stats() { const a = js.slice().sort((x, y) => x - y), q = (p) => a.length ? a[Math.min(a.length - 1, Math.floor(p * a.length))] : 0; return { n: a.length, p50: +q(0.5).toFixed(2), p95: +q(0.95).toFixed(2), max: +(a.length ? a[a.length - 1] : 0).toFixed(2) }; } };
  return true; })()'''
ZUSTAND_O = r'''(() => { const s = Rennspiel.spiel, o = s.online; const base = { z: s.zustand, age: window.__p2o ? Math.round(window.__p2o.age()) : -1 };
  if (!o) return base; const r = s.rennen, t = r && r.teilnehmer ? r.teilnehmer[o.du] : null, v = o.vorhersage ? o.vorhersage.vp : null;
  return Object.assign(base, { phase: o.phase, du: o.du, runde: t ? t.runde : null, imZiel: t ? t.imZiel : null, rz: r ? r.zustand : null, tempo: v ? v.vLaengs : 0, n: s.fahrzeuge.length,
    ansicht: o.ansicht, hinweis: o.hinweis || '', erg: !!document.querySelector('.on-ergebnis .ergebnis-karte') }); })()'''
AUTOPILOT_O = r'''(() => { const s = Rennspiel.spiel, o = s.online, R = Rennspiel;
  if (!s._origSteuerung) s._origSteuerung = s.input.steuerung.bind(s.input);
  const d = new R.Driver(o.vorhersage.vp, s.strecke, { schwierigkeit: 'mittel', seed: 77 + o.du, name: 'Test' });
  if (d.hindernisseSetzen) d.hindernisseSetzen(s.strecke.hindernisse);
  s.input.steuerung = (nr) => {
    if (nr !== 0) return { gas: 0, bremse: 0, lenkung: 0 };
    const t = s.rennen.teilnehmer[o.du];
    const st = d.steuerung(1 / 60, { andere: [], spielerFortschrittMax: null, eigenerFortschritt: t.fortschritt, laeuft: s.rennen.gasErlaubt });
    const v = o.vorhersage.vp;
    return R.Anlauf ? R.Anlauf.kiHilfe({}, v, s.strecke, s.strecke.spline.naechster(v.x, v.z), st) : st;
  };
  return true; })()'''
SERVER_FEHLER = re.compile(r'(TypeError|ReferenceError|RangeError|Unhandled|uncaught|Uncaught|ERR_|Error:)')

class OnlineAbbruch(Exception): pass

async def online_host(browser, url, name):
    s = await neue_seite(browser, url, name, 960, 600)
    await s.ev(P2O_JS)
    for _ in range(4): await s.page.keyboard.press('ArrowRight'); await s.page.wait_for_timeout(80)
    await s.page.keyboard.press('Enter'); await s.page.wait_for_timeout(300)
    await s.page.keyboard.press('Enter')
    await s.page.wait_for_function("Rennspiel.spiel.menue.onlineUi.lobby !== null && Rennspiel.spiel.menue.onlineUi.ansicht === 'lobby'", timeout=20000, polling=200)
    s.code = await s.ev('Rennspiel.spiel.menue.onlineUi.lobby.code')
    return s

async def online_gast(browser, url, code, name):
    s = await neue_seite(browser, url + '?raum=' + code, name, 960, 600)
    await s.ev(P2O_JS)
    await s.page.wait_for_selector('#online [data-a="beitreten"]', timeout=20000)
    await s.page.click('#online [data-a="beitreten"]')
    await s.page.wait_for_function("Rennspiel.spiel.menue.onlineUi.lobby !== null && Rennspiel.spiel.menue.onlineUi.ansicht === 'lobby'", timeout=20000, polling=200)
    return s

def lobby_wahl(c):
    """Einstellungen eines Online-Laufs als Klick-Liste (Zeile, Wert) – Reihenfolge: Strecke zuerst (Varianten/Welten hängen daran)."""
    w = [('strecke', c['strecke']), ('variante', c.get('variante', '')), ('welt', c.get('welt') or ('hindernisse' if c.get('hind') and c['strecke'] != 'fantasie' else ('verrueckt' if c.get('hind') else ''))),
         ('hindernisMenge', 'viele' if c.get('hind') else 'normal'), ('runden', '1'), ('gegner', str(c.get('gegner', 2))), ('schwierigkeit', 'leicht'),
         ('tageszeit', c['tageszeit']), ('jahreszeit', 'winter' if c['wetter'] == 'schnee' else 'sommer'), ('wetter', c['wetter']),
         ('polizei', 'an' if c.get('polizei') else 'aus'), ('geisterfahrer', 'an' if c.get('geister') else 'aus'), ('verkehr', 'viel' if c.get('verkehr') else 'aus'),
         ('kollisionen', 'an' if c.get('kollisionen') else 'aus')]
    return [(z, v) for z, v in w if v is not None and not (z == 'welt' and v == '')]

async def lobby_einstellen(host, c):
    """Klickt die Lobby-Einstellungen. P4 (16.10.): Klicks werden NICHT mehr still verworfen (P2-n04 lief so auf 'wald' statt 'wueste', weil der Strecken-Klick
    scheiterte, als der Menü-Hintergrund neu gebaut wurde). Je Klick bis zu 4 Versuche; fehlt nur 'variante'/'welt'/'hindernisMenge=normal' (strecken-/weltabhängig, bewusst nicht immer wählbar),
    bleibt der Standard; jeder andere fehlende/gescheiterte Klick -> OnlineAbbruch (Ergebnis FEHLER mit Text)."""
    probleme = []
    for zeile, wert in lobby_wahl(c):
        sel = '#online [data-a="wert:%s:%s"]' % (zeile, wert)
        geklickt, letzter = False, ''
        for versuch in range(4):
            try:
                if await host.page.locator(sel).count() == 0:
                    letzter = 'Knopf fehlt'
                else:
                    await host.page.click(sel, timeout=4000)
                    geklickt = True; break
            except Exception as e:
                letzter = '%s: %s' % (type(e).__name__, str(e).splitlines()[0][:90])
            await host.page.wait_for_timeout(500)
        if not geklickt:
            # 'hindernisMenge=normal': ohne Hindernis-Welt sind die Stufen ausgegraut (online.js:508 aus: !an → kein Klickziel), „normal“ ist ohnehin der Standard
            if letzter == 'Knopf fehlt' and (zeile in ('variante', 'welt') or (zeile == 'hindernisMenge' and wert == 'normal')):
                print('   Lobby: %s=%s nicht wählbar (Standard bleibt)' % (zeile, wert), flush=True)
            else:
                probleme.append('%s=%s (%s)' % (zeile, wert, letzter))
        await host.page.wait_for_timeout(250)
    if probleme:
        raise OnlineAbbruch('Lobby-Klicks gescheitert: ' + '; '.join(probleme))

async def alle_bereit(host, gaeste, anzahl, bots=False):
    for g in gaeste:
        try:
            if not await g.ev("(Rennspiel.spiel.menue.onlineUi.lobby.spieler.find(x => x.id === Rennspiel.spiel.menue.onlineUi.lobby.du) || {}).bereit"):
                await g.page.click('#online [data-a="bereit"]', timeout=5000)
        except Exception: pass
    await host.page.wait_for_function("(n => { const l = Rennspiel.spiel.menue.onlineUi.lobby; return l && l.spieler.length === n && l.spieler.every(s => s.bereit); })(%d)" % anzahl, timeout=40000, polling=250)

async def online_rennen(tabs, host, c, t_max=420, ereignisse=None, mitspieler=None):
    """Startet das Rennen (Host), fährt mit Autopilot bis alle noch anwesenden Tabs die Ergebnis-Tafel haben. ereignisse: {Sekunde: async fn}."""
    r = {}
    await host.page.click('#online [data-a="start"]', timeout=10000)
    for t in tabs:
        await t.page.wait_for_function("Rennspiel.spiel.zustand === 'online' && Rennspiel.spiel.online && Rennspiel.spiel.online.empfangen && Rennspiel.spiel.online.vorhersage", timeout=90000, polling=250)
        await t.ev('__p2o.reset()')
        await t.ev(AUTOPILOT_O)
    t0 = time.time(); stehen = {id(t): (time.time(), None) for t in tabs}; ereig = dict(ereignisse or {}); aktiv = list(tabs); hist = []
    while True:
        await asyncio.sleep(1.5)
        dt = time.time() - t0
        for sek in sorted(list(ereig)):
            if dt >= sek:
                fn = ereig.pop(sek); res = await fn(aktiv)
                if isinstance(res, list): aktiv = res
        if not aktiv: break
        erledigt = 0
        for t in list(aktiv):
            z = await t.ev(ZUSTAND_O)
            if t.abgestuerzt: raise Haenger(['Seite abgestürzt (crash) – ' + t.name])
            hist.append((t.name, round(dt), z.get('phase'), z.get('runde')))
            if z.get('phase') == 'ergebnis': erledigt += 1; continue
            if z.get('age', 0) > 60000: raise Haenger(['kein Frame seit %d s – %s (z=%s phase=%s)' % (z['age'] // 1000, t.name, z['z'], z.get('phase'))])
            if z.get('phase') == 'rennen' and z.get('rz') == 'laeuft':
                if abs(z.get('tempo') or 0) > 0.5: stehen[id(t)] = (time.time(), True)
                elif time.time() - stehen[id(t)][0] > 6: await t.page.keyboard.press('KeyR'); stehen[id(t)] = (time.time(), None)
        if erledigt == len(aktiv): break
        if dt > t_max: raise OnlineAbbruch('Rennen endet nicht nach %d s: %s' % (t_max, hist[-6:]))
    r['dauer_rennen'] = round(time.time() - t0, 1)
    r['tafel'] = {}
    for t in aktiv:
        await t.page.wait_for_timeout(500)
        try: r['tafel'][t.name] = await t.ev("document.querySelectorAll('.on-ergebnis tbody tr').length")
        except Exception: r['tafel'][t.name] = -1
    return r, aktiv

def serverfehler(srv, ab):
    try:
        txt = open(srv.logdatei, encoding='utf-8', errors='replace').read()
    except Exception: return []
    return [z[:200] for z in txt[ab:].splitlines() if SERVER_FEHLER.search(z)][:5]

def logpos(srv):
    try: return os.path.getsize(srv.logdatei)
    except Exception: return 0

async def online_szenario(browser, srv, sid, titel, rennen, jitter=False, bots=0, ereignisse=None, nachher=None, gastzahl=1):
    """Ein Online-Raum mit Host-Browser + Gast-Browser (+ Bots), nacheinander mehrere Rennen über 'Zur Lobby'. Ergebnis je Rennen ein Datensatz."""
    proxy, url = None, srv.url
    if jitter:
        proxy = subprocess.Popen(['node', os.path.join(BASIS, 'tests', 'p2_jitter_proxy.js'), str(srv.port), 'tailscale', '7'], stdout=subprocess.PIPE, text=True)
        url = 'http://127.0.0.1:%s/' % proxy.stdout.readline().split()[1]
    botproc = None; tabs = []; ergebnisse = []
    try:
        host = await online_host(browser, url, 'host'); tabs.append(host)
        gast = await online_gast(browser, url, host.code, 'gast'); tabs.append(gast)
        for k, (rid, c) in enumerate(rennen):
            r = dict(id=rid, teil='online', gruppe=titel, konfig=konfig_text(dict(c, modus='online')) + (' · Jitter-tailscale' if jitter else '') + (' · +%d Bots' % bots if bots else ''), cfg=c,
                     repro='python3 tests/durchlauf_matrix.py --teil online --nur %s' % rid)
            t0 = time.time(); [t.fehler.clear() for t in tabs]; sl = logpos(srv)
            try:
                if k > 0:
                    await host.page.click('.on-ergebnis [data-a="zurLobby"]', timeout=15000)
                    for t in tabs:
                        await t.page.wait_for_function("Rennspiel.spiel.menue.onlineUi.lobby && Rennspiel.spiel.menue.onlineUi.ansicht === 'lobby' && (!Rennspiel.spiel.online || !Rennspiel.spiel.online.phase)", timeout=30000, polling=250)
                r['vor'] = {t.name: await t.ev('__p2o.mem()') for t in tabs}
                await lobby_einstellen(host, c)
                if bots and k == 0:
                    botproc = subprocess.Popen(['node', os.path.join(BASIS, 'tests', 'netz5_bots.js'), str(srv.port), host.code, str(bots)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                await alle_bereit(host, [t for t in tabs if t is not host], 2 + (bots if k == 0 else 0))
                ev = ereignisse.get(k) if ereignisse else None
                res, aktiv = await online_rennen([t for t in tabs if not getattr(t, 'weg', False)], host, c, ereignisse=ev)
                r.update(res)
                r['frames'] = {t.name: await t.ev('__p2o.stats()') for t in aktiv}
                if k == 0 or r['dauer_rennen'] > 0: r['bild'] = await host.shot('tafel_' + rid)
                if any(v == 0 for v in r['tafel'].values()): r['ergebnis'] = 'FEHLER'; r['notiz'] = 'Ergebnis-Tafel leer: %s' % r['tafel']
                r['nach'] = {}
                r.setdefault('ergebnis', 'OK')
            except Haenger as h:
                r['ergebnis'] = 'HÄNGER'; r['stack'] = h.args[0]; r['notiz'] = 'Browser reagiert nicht / kein Frame'
            except OnlineAbbruch as e:
                r['ergebnis'] = 'FEHLER'; r['notiz'] = str(e)[:300]
            except Exception as e:
                # P4: Aufrufstelle mit ausgeben (Zeile/Funktion der innersten Test-Frames), sonst ist ein 90-s-Timeout nicht zuzuordnen
                wo = ' <- '.join('%s:%d' % (f.name, f.lineno) for f in reversed([f for f in traceback.extract_tb(e.__traceback__) if f.filename == os.path.abspath(__file__)][-4:]))
                r['ergebnis'] = 'FEHLER'; r['notiz'] = '%s: %s [%s]' % (type(e).__name__, str(e)[:240], wo)
            if not srv.lebt(): r['ergebnis'] = 'FEHLER'; r['notiz'] = (r.get('notiz', '') + ' SERVER ABGESTÜRZT').strip()
            r['jsFehler'] = [t.name + ': ' + f for t in tabs for f in t.fehler]
            sf = serverfehler(srv, sl)
            if sf: r['serverLog'] = sf
            if r['jsFehler'] and r['ergebnis'] == 'OK': r['ergebnis'] = 'FEHLER'; r['notiz'] = 'JS-Fehler: ' + r['jsFehler'][0][:200]
            r['dauer'] = round(time.time() - t0, 1)
            speichere(r); ergebnisse.append(r)
            if r['ergebnis'] in ('HÄNGER',) or (r['ergebnis'] == 'FEHLER' and not srv.lebt()): break
            if getattr(host, 'weg', False): break
        if nachher:
            await nachher(tabs, host, srv, ergebnisse)
    except Exception as e:
        rid = rennen[len(ergebnisse)][0] if len(ergebnisse) < len(rennen) else rennen[-1][0]
        if len(ergebnisse) < len(rennen):
            speichere(dict(id=rid, teil='online', gruppe=titel, konfig=konfig_text(dict(rennen[len(ergebnisse)][1], modus='online')), ergebnis='FEHLER', dauer=0,
                           notiz='Aufbau: %s: %s' % (type(e).__name__, str(e)[:240]), jsFehler=[t.name + ': ' + f for t in tabs for f in t.fehler], repro='python3 tests/durchlauf_matrix.py --teil online --nur %s' % rid))
    finally:
        if botproc:
            try: botproc.kill()
            except Exception: pass
        for t in tabs: await t.schliessen()
        if proxy:
            try: proxy.kill()
            except Exception: pass

def basis_cfg(**kw):
    c = dict(strecke='wiese', variante='', tageszeit='tag', wetter='klar', modus='online', polizei=0, schaden=0, hind=0, verkehr=0, geister=0, welt='', troc=0, gegner=2)
    c.update(kw); return c

async def esc_verlassen(t):
    await t.page.keyboard.press('Escape'); await t.page.wait_for_timeout(500)
    # P4 (16.10.): der Dialog liegt im eigenen Overlay (online.js:128 dialogEl = div.overlay.pause), NICHT in #online (P3 S6 n07/n08)
    await t.page.click('.overlay.pause:not(#pause) [data-a="rennenVerlassen"]', timeout=8000)

async def teil_online(pw, sel_ids):
    szen = []
    # Standard: 2 Browser, 4 Rennen im selben Raum/Tab, wechselnde Konfiguration
    szen.append(('n01', 'Online 2 Browser (4 Rennen im selben Tab)', [
        ('n01', basis_cfg()),
        ('n02', basis_cfg(strecke='wald', tageszeit='nacht', wetter='regen', polizei=1, verkehr=1, geister=1)),
        ('n03', basis_cfg(strecke='alpen', variante='xl', tageszeit='daemmerung', wetter='schnee', hind=1)),
        ('n04', basis_cfg(strecke='wueste', tageszeit='tag', wetter='klar', kollisionen=1, welt='verrueckt'))], dict()))
    szen.append(('n05', 'Online Jitter-Profil tailscale', [('n05', basis_cfg(strecke='dino', tageszeit='nacht', wetter='regen', verkehr=1)),
                                                          ('n06', basis_cfg(strecke='fantasie', tageszeit='daemmerung'))], dict(jitter=True)))
    async def gast_geht(aktiv):
        g = [t for t in aktiv if t.name == 'gast'][0]
        await esc_verlassen(g); g.weg = True
        await g.page.wait_for_timeout(800)
        return [t for t in aktiv if t is not g]
    async def dritter(aktiv):
        h = [t for t in aktiv if t.name == 'host'][0]
        d = await neue_seite(h.page.context.browser, h.page.url.split('?')[0] + '?raum=' + h.code, 'dritter', 800, 500)
        try:
            await d.page.wait_for_selector('#online [data-a="beitreten"]', timeout=20000); await d.page.click('#online [data-a="beitreten"]')
            await d.page.wait_for_timeout(2500)
            hint = await d.ev("Rennspiel.spiel.menue.onlineUi.hinweis || ''")
            h.dritter_hinweis = hint
        finally:
            h.dritter_fehler = list(d.fehler); await d.schliessen()
        h.fehler.extend(['dritter: ' + f for f in h.dritter_fehler])
        return aktiv
    async def nach_dritter(tabs, host, srv, erg):
        if erg: erg[-1]['notiz'] = (erg[-1].get('notiz', '') + ' | Dritter Browser mitten im Rennen: Hinweis=%r' % getattr(host, 'dritter_hinweis', None)).strip(' |')
    szen.append(('n07', 'Online: Dritter will mittendrin beitreten, danach geht der Gast mitten im Rennen', [('n07', basis_cfg(strecke='wald', tageszeit='daemmerung'))],
                 dict(ereignisse={0: {8: dritter, 16: gast_geht}}, nachher=nach_dritter)))
    async def host_geht(aktiv):
        h = [t for t in aktiv if t.name == 'host'][0]
        await esc_verlassen(h); h.weg = True
        await h.page.wait_for_timeout(500)
        g = [t for t in aktiv if t.name == 'gast'][0]
        for _ in range(40):
            z = await g.ev(ZUSTAND_O)
            if z.get('z') == 'menue' or z.get('phase') in (None, 'ergebnis'): break
            await asyncio.sleep(0.5)
        g.nach_host = await g.ev(ZUSTAND_O)
        return []
    async def nach_host(tabs, host, srv, erg):
        g = [t for t in tabs if t.name == 'gast'][0]
        if erg: erg[-1]['notiz'] = (erg[-1].get('notiz', '') + ' | Gast nach Host-Weggang: %s' % json.dumps(getattr(g, 'nach_host', None), ensure_ascii=False)).strip(' |')
    szen.append(('n08', 'Online: Host verlässt mitten im Rennen', [('n08', basis_cfg(strecke='wiese', tageszeit='nacht'))], dict(ereignisse={0: {12: host_geht}}, nachher=nach_host)))
    async def gast_reload(aktiv):
        g = [t for t in aktiv if t.name == 'gast'][0]
        await g.page.reload(timeout=90000)
        await g.page.wait_for_function('window.Rennspiel && Rennspiel.spiel', timeout=90000, polling=200)
        await g.ev(P2O_JS); g.weg = True; g.neu_geladen = True
        return [t for t in aktiv if t is not g]
    async def nach_gast_reload(tabs, host, srv, erg):
        g = [t for t in tabs if t.name == 'gast'][0]
        try:
            await host.page.click('.on-ergebnis [data-a="zurLobby"]', timeout=15000)
            await host.page.wait_for_function("Rennspiel.spiel.menue.onlineUi.lobby && Rennspiel.spiel.menue.onlineUi.ansicht === 'lobby'", timeout=20000, polling=250)
            code = await host.ev('Rennspiel.spiel.menue.onlineUi.lobby.code')
            await g.page.goto(srv.url + '?raum=' + code, timeout=90000)
            await g.page.wait_for_function('window.Rennspiel && Rennspiel.spiel', timeout=90000, polling=200); await g.ev(P2O_JS)
            await g.page.wait_for_selector('#online [data-a="beitreten"]', timeout=20000); await g.page.click('#online [data-a="beitreten"]')
            await g.page.wait_for_function("Rennspiel.spiel.menue.onlineUi.lobby && Rennspiel.spiel.menue.onlineUi.ansicht === 'lobby'", timeout=20000, polling=250)
            g.weg = False
            await alle_bereit(host, [g], 2)
            res, aktiv = await online_rennen([host, g], host, basis_cfg(), ereignisse=None)
            ok = all(v > 0 for v in res['tafel'].values())
            rr = dict(id='n09', teil='online', gruppe='Online: Wiederverbinden (Tab neu laden, danach neues Rennen im selben Raum)', konfig='wiese · normal · tag · sonne · online · nach Reload', ergebnis='OK' if ok else 'FEHLER',
                      dauer=res['dauer_rennen'], tafel=res['tafel'], frames={t.name: await t.ev('__p2o.stats()') for t in aktiv}, jsFehler=[t.name + ': ' + f for t in tabs for f in t.fehler],
                      repro='python3 tests/durchlauf_matrix.py --teil online --nur n08', notiz='' if ok else 'Ergebnis-Tafel leer nach Wiederverbinden')
            if rr['jsFehler'] and ok: rr['ergebnis'] = 'FEHLER'; rr['notiz'] = 'JS-Fehler: ' + rr['jsFehler'][0][:200]
            speichere(rr)
        except Haenger as h:
            speichere(dict(id='n09', teil='online', gruppe='Online: Wiederverbinden', konfig='nach Reload', ergebnis='HÄNGER', stack=h.args[0], dauer=0, repro='python3 tests/durchlauf_matrix.py --teil online --nur n08', jsFehler=[]))
        except Exception as e:
            speichere(dict(id='n09', teil='online', gruppe='Online: Wiederverbinden', konfig='nach Reload', ergebnis='FEHLER', notiz='%s: %s' % (type(e).__name__, str(e)[:240]), dauer=0, repro='python3 tests/durchlauf_matrix.py --teil online --nur n08', jsFehler=[t.name + ': ' + f for t in tabs for f in t.fehler]))
    szen.append(('n08b', 'Online: Gast lädt den Tab mitten im Rennen neu (Wiederverbinden)', [('n08b', basis_cfg(strecke='wiese', tageszeit='tag'))], dict(ereignisse={0: {10: gast_reload}}, nachher=nach_gast_reload)))
    szen.append(('n10', 'Online mit 5 Menschen (2 Browser + 3 Bots)', [('n10', basis_cfg(strecke='wiese', tageszeit='daemmerung', gegner=2))], dict(bots=3)))
    if ARG.liste:
        for sid, titel, rennen, kw in szen: print('Online %s: %s -> %s' % (sid, titel, ', '.join('%s=%s' % (i, konfig_text(dict(c, modus='online'))) for i, c in rennen)))
        return
    fertig = lese_ergebnisse()
    srv = Server('online')
    browser = await pw.chromium.launch(args=ARGS)
    try:
        for sid, titel, rennen, kw in szen:
            ids = [i for i, c in rennen] + (['n09'] if sid == 'n08b' else [])
            if sel_ids and not (set(ids) & sel_ids or sid in sel_ids): continue
            if not sel_ids and not ARG.wiederholen and all(i in fertig for i in ids): continue
            await online_szenario(browser, srv, sid, titel, rennen, **kw)
            if not srv.lebt():
                srv.stoppen(); srv = Server('online')
    finally:
        await browser.close(); srv.stoppen()

# ================================================================ BRETTSPIELE
class BrettFehler(Exception): pass

def rnd_fuer(seed, name):
    return random.Random('%s-%s' % (seed, name))

async def vier_neu(browser, url, w=1000, h=800, name='vier'):
    ctx = await browser.new_context(viewport={'width': w, 'height': h}); pg = await ctx.new_page()
    fe = []
    pg.on('pageerror', lambda e: fe.append('pageerror: ' + str(e)[:300]))
    pg.on('console', lambda m: fe.append('console.error: ' + m.text[:300]) if m.type == 'error' and 'ERR_INTERNET_DISCONNECTED' not in m.text else None)
    await pg.goto(url, timeout=60000); await pg.wait_for_function('window.__vier', timeout=30000)
    pg.fe = fe; return pg

async def vier_brett(pg): return await pg.evaluate('Array.from(__vier.S.st.b)')
async def vier_status(pg): return await pg.locator('#status').inner_text()
def vier_fertig_text(s): return ('gewinnt' in s) or ('Unentschieden' in s)

async def vier_zug(pg, c):
    await pg.keyboard.press(str(c + 1)); await pg.wait_for_timeout(120)

async def vier_spiel_lokal(pg, rng, ki=False, max_zuege=60):
    """Spielt bis Spielende (Status: gewinnt/Unentschieden). ki=True: Mensch zieht zufällig (gültig), Computer antwortet (Hintergrund-Worker)."""
    zuege = 0
    for _ in range(max_zuege):
        s = await vier_status(pg)
        if vier_fertig_text(s): return s, zuege
        b = await vier_brett(pg)
        frei = [c for c in range(7) if b[5 * 7 + c] == 0]
        if not frei: break
        n0 = sum(1 for x in b if x)
        await vier_zug(pg, rng.choice(frei)); zuege += 1
        if ki:                                   # warten bis der Computer geantwortet hat (oder Spielende)
            for _ in range(150):
                await pg.wait_for_timeout(100)
                s = await vier_status(pg)
                if vier_fertig_text(s) or sum(1 for x in await vier_brett(pg) if x) >= n0 + 2: break
            else: raise BrettFehler('Computer antwortet nicht (Stein %d)' % n0)
    await pg.wait_for_timeout(300)
    return await vier_status(pg), zuege

async def vier_dialog(pg): return (await pg.locator('.alarm').inner_text()) if await pg.locator('.alarm').count() else ''

async def brett_vier(browser, srv, seed, ids):
    url = srv.url + 'spiele/vier-gewinnt/'
    rng = rnd_fuer(seed, 'vier')
    if 'b01' in ids or not ids:
        r = dict(id='b01', teil='brett', gruppe='4 gewinnt', konfig='4 gewinnt · lokal zu zweit · Partie bis Spielende + Neues Spiel', repro='python3 tests/durchlauf_matrix.py --teil brett --nur b01'); t0 = time.time()
        pg = None
        try:
            pg = await vier_neu(browser, url); await pg.click('#k-zweit'); await pg.wait_for_timeout(300)
            s, n = await vier_spiel_lokal(pg, rng)
            await pg.wait_for_timeout(1000); d = await vier_dialog(pg)
            r['notiz'] = '%d Züge, Status „%s“' % (n, s)
            if not vier_fertig_text(s) or 'Spiel beendet' not in d: raise BrettFehler('Kein Spielende/Dialog: %r | %r' % (s, d[:80]))
            r['bild'] = None
            await pg.click('.alarm .taste:has-text("Neues Spiel")'); await pg.wait_for_timeout(400)
            if sum(1 for x in await vier_brett(pg) if x) != 0: raise BrettFehler('Neues Spiel: Brett nicht leer')
            await vier_zug(pg, 3)
            if sum(1 for x in await vier_brett(pg) if x) != 1: raise BrettFehler('Nach Neues Spiel kein Zug möglich')
            r['ergebnis'] = 'OK'
        except Exception as e: r['ergebnis'] = 'FEHLER'; r['notiz'] = '%s: %s' % (type(e).__name__, str(e)[:240])
        r['jsFehler'] = list(pg.fe) if pg else []; r['dauer'] = round(time.time() - t0, 1)
        if r['jsFehler'] and r['ergebnis'] == 'OK': r['ergebnis'] = 'FEHLER'
        speichere(r)
        if pg: await pg.context.close()
    if 'b02' in ids or not ids:
        r = dict(id='b02', teil='brett', gruppe='4 gewinnt', konfig='4 gewinnt · gegen Computer Stufe 3 · Partie bis Spielende + Neues Spiel', repro='python3 tests/durchlauf_matrix.py --teil brett --nur b02'); t0 = time.time(); pg = None
        try:
            pg = await vier_neu(browser, url)
            await pg.evaluate("()=>{const r=document.getElementById('regler');r.value=3;r.dispatchEvent(new Event('input'))}")
            await pg.click('#k-ki'); await pg.wait_for_timeout(300)
            modus = await pg.locator('#modus').inner_text()
            s, n = await vier_spiel_lokal(pg, rng, ki=True)
            await pg.wait_for_timeout(1000); d = await vier_dialog(pg)
            r['notiz'] = '%s; %d eigene Züge, Status „%s“' % (modus, n, s)
            if not vier_fertig_text(s) or 'Spiel beendet' not in d: raise BrettFehler('Kein Spielende/Dialog: %r | %r' % (s, d[:80]))
            await pg.click('.alarm .taste:has-text("Neues Spiel")'); await pg.wait_for_timeout(400)
            if sum(1 for x in await vier_brett(pg) if x) != 0: raise BrettFehler('Neues Spiel: Brett nicht leer')
            r['ergebnis'] = 'OK'
        except Exception as e: r['ergebnis'] = 'FEHLER'; r['notiz'] = '%s: %s' % (type(e).__name__, str(e)[:240])
        r['jsFehler'] = list(pg.fe) if pg else []; r['dauer'] = round(time.time() - t0, 1)
        if r['jsFehler'] and r['ergebnis'] == 'OK': r['ergebnis'] = 'FEHLER'
        speichere(r)
        if pg: await pg.context.close()
    if 'b03' in ids or not ids:
        r = dict(id='b03', teil='brett', gruppe='4 gewinnt', konfig='4 gewinnt · online 2 Browser · Partie bis Spielende + Revanche (beide) + Zug in 2. Partie', repro='python3 tests/durchlauf_matrix.py --teil brett --nur b03'); t0 = time.time(); A = B = None
        try:
            A = await vier_neu(browser, url); B = None
            await A.click('#k-online'); await A.wait_for_timeout(300)
            await A.click('[data-name="loewe"]'); await A.click('[data-seite="w"]'); await A.click('[data-a=erstellen]')
            await A.wait_for_selector('.codegross'); code = (await A.inner_text('.codegross')).strip()
            B = await vier_neu(browser, url + '?raum=' + code)
            await B.click('[data-name="pinguin"]'); await B.click('[data-a=beitreten]')
            await A.wait_for_selector('#brett'); await B.wait_for_selector('#brett'); await A.wait_for_timeout(500)
            n = 0; ende = False
            for _ in range(60):
                s = await vier_status(A)
                if vier_fertig_text(s): ende = True; break
                b = await vier_brett(A); frei = [c for c in range(7) if b[35 + c] == 0]
                if not frei: break
                am_zug = A if n % 2 == 0 else B           # Rot beginnt = Ersteller A
                g = g_geometrie = await am_zug.evaluate('__vier.geometrie()'); bb = await am_zug.locator('#brett').bounding_box(); c = rng.choice(frei)
                await am_zug.mouse.click(bb['x'] + g['ox'] + c * g['cell'] + g['cell'] / 2, bb['y'] + g['H'] / 2)
                n += 1
                for _w in range(40):
                    await A.wait_for_timeout(100)
                    if sum(1 for x in await vier_brett(A) if x) >= n and sum(1 for x in await vier_brett(B) if x) >= n: break
                else: raise BrettFehler('Zug %d kommt nicht bei beiden an' % n)
            if not ende: raise BrettFehler('Online-Partie endet nicht (%d Züge)' % n)
            await A.wait_for_timeout(1200); dA, dB = await vier_dialog(A), await vier_dialog(B)
            if 'Revanche' not in dA or 'Revanche' not in dB: raise BrettFehler('Kein Revanche-Dialog: %r | %r' % (dA[:60], dB[:60]))
            await A.click('.alarm .taste:has-text("Revanche")'); await A.wait_for_timeout(500)
            await B.click('.alarm .taste:has-text("Revanche")'); await A.wait_for_timeout(1000)
            if sum(1 for x in await vier_brett(A) if x) or sum(1 for x in await vier_brett(B) if x): raise BrettFehler('Revanche: Brett nicht leer')
            # B ist jetzt Rot und beginnt
            g = await B.evaluate('__vier.geometrie()'); bb = await B.locator('#brett').bounding_box()
            await B.mouse.click(bb['x'] + g['ox'] + 3 * g['cell'] + g['cell'] / 2, bb['y'] + g['H'] / 2); await A.wait_for_timeout(700)
            if sum(1 for x in await vier_brett(A) if x) != 1: raise BrettFehler('Nach Revanche: Zug von B kommt bei A nicht an')
            r['ergebnis'] = 'OK'; r['notiz'] = '%d Züge in Partie 1' % n
        except Exception as e: r['ergebnis'] = 'FEHLER'; r['notiz'] = '%s: %s' % (type(e).__name__, str(e)[:240])
        r['jsFehler'] = [('A: ' + f) for f in (A.fe if A else [])] + [('B: ' + f) for f in (B.fe if B else [])]; r['dauer'] = round(time.time() - t0, 1)
        if r['jsFehler'] and r['ergebnis'] == 'OK': r['ergebnis'] = 'FEHLER'
        speichere(r)
        for x in (A, B):
            if x: await x.context.close()

# ---- Schach
UCI = lambda u: (8 - int(u[1]), ord(u[0]) - 97, 8 - int(u[3]), ord(u[2]) - 97)

async def sch_neu(browser, url, w=1100, h=760):
    ctx = await browser.new_context(viewport={'width': w, 'height': h}, locale='de-DE'); pg = await ctx.new_page()
    fe = []
    pg.on('pageerror', lambda e: fe.append('pageerror: ' + str(e)[:300]))
    pg.on('console', lambda m: fe.append('console.error: ' + m.text[:300]) if m.type == 'error' else None)
    await pg.goto(url, timeout=60000); await pg.wait_for_function('window.__schach && document.querySelector(".karte")', timeout=60000)
    pg.fe = fe; return pg

async def sch_warte(pg, js, t=20000):
    try: await pg.wait_for_function(js, timeout=t); return True
    except Exception: return False
async def sch_frei(pg): return await sch_warte(pg, 'window.__schach && !__schach.brettBeschaeftigt()', 15000)
async def sch_xy(pg, r, c):
    return await pg.evaluate('''(()=>{const A=__schach,S=A.S;
      if(S.use3D&&S.s3){const q=S.s3.feldBildschirm(%d,%d,0.2);const b=S.b3dEl.getBoundingClientRect();return {x:b.left+q.x,y:b.top+q.y};}
      const m=S.b2d.mitte({row:%d,col:%d});const b=S.b2d.cv.getBoundingClientRect();return {x:b.left+m.x,y:b.top+m.y};})()''' % (r, c, r, c))
async def sch_klick(pg, r, c):
    q = await sch_xy(pg, r, c); await pg.mouse.click(q['x'], q['y'])
async def sch_zug(pg, u):
    a, b, c, d = UCI(u); await sch_klick(pg, a, b); await pg.wait_for_timeout(120); await sch_klick(pg, c, d)
    await pg.wait_for_timeout(500); await sch_frei(pg); await pg.wait_for_timeout(150); await sch_frei(pg)
async def sch_hist(pg): return await pg.evaluate('__schach.partie.gameMoveHistory.slice()')
async def sch_2d(pg):
    if await pg.evaluate('__schach.S.use3D'): await pg.click('#b-3d'); await pg.wait_for_timeout(500)
async def sch_ende(pg, t=20000): return await sch_warte(pg, 'document.querySelector(".alarm") || __schach.partie.gameOver', t)
async def sch_legal(pg): return await pg.evaluate('(()=>{const A=__schach,p=A.partie,K=A.K;return p.board.allLegalMoves(p.currentPlayer).map(K.moveToUci)})()')

async def brett_schach(browser, srv, seed, ids):
    url = srv.url + 'spiele/schach/'; rng = rnd_fuer(seed, 'schach')
    FOOL = ['f2f3', 'e7e5', 'g2g4', 'd8h4']                    # Narrenmatt
    SCHAEFER = ['e2e4', 'e7e5', 'f1c4', 'b8c6', 'd1h5', 'g8f6', 'h5f7']
    if 'b04' in ids or not ids:
        r = dict(id='b04', teil='brett', gruppe='Schach', konfig='Schach · lokal zu zweit · Narrenmatt bis Schachmatt-Dialog + Neues Spiel + Schäfermatt', repro='python3 tests/durchlauf_matrix.py --teil brett --nur b04'); t0 = time.time(); pg = None
        try:
            pg = await sch_neu(browser, url); await pg.click('#k-pvp'); await pg.wait_for_selector('.alarm'); await pg.click('.alarm button:has-text("Ohne Namen")')
            await pg.wait_for_selector('#status'); await sch_frei(pg); await sch_2d(pg)
            for u in FOOL: await sch_zug(pg, u)
            if not await sch_ende(pg): raise BrettFehler('Kein Spielende nach Narrenmatt: %s' % await sch_hist(pg))
            await pg.wait_for_timeout(1000); d = await pg.locator('.alarm').inner_text() if await pg.locator('.alarm').count() else ''
            if 'Spiel beendet' not in d: raise BrettFehler('Kein Ende-Dialog: %r' % d[:80])
            r['notiz'] = 'Dialog: ' + d.replace('\n', ' | ')[:80]
            await pg.click('.alarm button:has-text("Neues Spiel")'); await pg.wait_for_timeout(600); await sch_frei(pg)
            if await sch_hist(pg): raise BrettFehler('Neues Spiel: Zugliste nicht leer')
            for u in SCHAEFER: await sch_zug(pg, u)
            if not await sch_ende(pg): raise BrettFehler('Kein Spielende nach Schäfermatt')
            r['ergebnis'] = 'OK'
        except Exception as e: r['ergebnis'] = 'FEHLER'; r['notiz'] = (r.get('notiz', '') + ' %s: %s' % (type(e).__name__, str(e)[:240])).strip()
        r['jsFehler'] = list(pg.fe) if pg else []; r['dauer'] = round(time.time() - t0, 1)
        if r['jsFehler'] and r['ergebnis'] == 'OK': r['ergebnis'] = 'FEHLER'
        speichere(r)
        if pg: await pg.context.close()
    if 'b05' in ids or not ids:
        r = dict(id='b05', teil='brett', gruppe='Schach', konfig='Schach · gegen Computer Stufe 3 · Partie bis Spielende (zufällige gültige Züge, max. 90 Züge, sonst Aufgeben) + Neues Spiel', repro='python3 tests/durchlauf_matrix.py --teil brett --nur b05'); t0 = time.time(); pg = None
        try:
            pg = await sch_neu(browser, url)
            await pg.evaluate('(s)=>{const r=document.getElementById("regler");r.value=s;r.dispatchEvent(new Event("input"))}', 3)
            await pg.click('#k-ki'); await pg.wait_for_selector('.alarm'); await pg.click('.alarm button:has-text("Ohne Namen")')
            await pg.wait_for_selector('#status'); await sch_frei(pg); await sch_2d(pg)
            eigene = 0; ende = False
            for _ in range(90):
                if await pg.evaluate('__schach.partie.gameOver') or await pg.locator('.alarm').count(): ende = True; break
                if not await sch_warte(pg, '!__schach.partie.computerThinking && __schach.partie.currentPlayer===0', 40000): raise BrettFehler('Computer zieht nicht (Zug %d)' % eigene)
                await sch_frei(pg)
                if await pg.evaluate('__schach.partie.gameOver'): ende = True; break
                zuege = await sch_legal(pg)
                if not zuege: ende = True; break
                n0 = len(await sch_hist(pg)); await sch_zug(pg, rng.choice(zuege)); eigene += 1
                if not await sch_warte(pg, '__schach.partie.gameMoveHistory.length>=%d || __schach.partie.gameOver' % (n0 + 1), 10000): raise BrettFehler('Eigener Zug %d nicht angenommen' % eigene)
            n_end = len(await sch_hist(pg))
            if not ende:
                await pg.click('#b-dd') if False else None
                r['notiz'] = 'Kein Mattende nach %d eigenen Zügen (Partie läuft noch, kein Fehler) – ' % eigene
            else:
                await pg.wait_for_timeout(1200); d = await pg.locator('.alarm').inner_text() if await pg.locator('.alarm').count() else ''
                r['notiz'] = '%d eigene Züge, %d Halbzüge, Dialog: %s' % (eigene, n_end, d.replace('\n', ' | ')[:70])
                if 'Spiel beendet' in d:
                    await pg.click('.alarm button:has-text("Neues Spiel")'); await pg.wait_for_timeout(600); await sch_frei(pg)
                    if await sch_hist(pg): raise BrettFehler('Neues Spiel: Zugliste nicht leer')
                elif not d: raise BrettFehler('Spielende ohne Dialog')
            r['ergebnis'] = 'OK'
        except Exception as e: r['ergebnis'] = 'FEHLER'; r['notiz'] = (r.get('notiz', '') + ' %s: %s' % (type(e).__name__, str(e)[:240])).strip()
        r['jsFehler'] = list(pg.fe) if pg else []; r['dauer'] = round(time.time() - t0, 1)
        if r['jsFehler'] and r['ergebnis'] == 'OK': r['ergebnis'] = 'FEHLER'
        speichere(r)
        if pg: await pg.context.close()
    if 'b06' in ids or not ids:
        r = dict(id='b06', teil='brett', gruppe='Schach', konfig='Schach · online 2 Browser · Schäfermatt, Revanche (Farben tauschen), Narrenmatt, Aufgeben', repro='python3 tests/durchlauf_matrix.py --teil brett --nur b06'); t0 = time.time(); A = C = None
        try:
            A = await sch_neu(browser, url)
            await A.click('#k-online'); await A.wait_for_selector('#codefeld'); await A.click('[data-seite="w"]'); await A.click('[data-a="erstellen"]'); await A.wait_for_selector('#codegross')
            code = (await A.inner_text('#codegross')).strip()
            C = await sch_neu(browser, url)
            await C.click('#k-online'); await C.wait_for_selector('#codefeld'); await C.fill('#codefeld', code); await C.click('[data-a="beitreten"]')
            await A.wait_for_selector('#status'); await C.wait_for_selector('#status'); await A.wait_for_timeout(800); await sch_frei(A); await sch_frei(C)
            for x in (A, C): await sch_2d(x)
            for sp, u in ((A, 'e2e4'), (C, 'e7e5'), (A, 'f1c4'), (C, 'b8c6'), (A, 'd1h5'), (C, 'g8f6'), (A, 'h5f7')):
                await sch_zug(sp, u); await A.wait_for_timeout(700); await C.wait_for_timeout(700)
            if not (await sch_warte(A, 'document.querySelector(".alarm")', 20000) and await sch_warte(C, 'document.querySelector(".alarm")', 20000)): raise BrettFehler('Matt-Dialog nicht bei beiden')
            await A.click('.alarm button:has-text("Revanche")'); await C.wait_for_timeout(600)
            await C.click('.alarm button:has-text("Revanche")'); await A.wait_for_timeout(1500); await sch_frei(A)
            if await sch_hist(A) or not await A.evaluate('__schach.S.vonSchwarz'): raise BrettFehler('Revanche: keine neue Runde mit getauschten Farben')
            # jetzt ist C Weiß: Narrenmatt mit getauschten Rollen (Weiß verliert): f2f3 e7e5 g2g4 d8h4 – C zieht Weiß
            for sp, u in ((C, 'f2f3'), (A, 'e7e5'), (C, 'g2g4'), (A, 'd8h4')):
                await sch_zug(sp, u); await A.wait_for_timeout(700); await C.wait_for_timeout(700)
            if not (await sch_warte(A, 'document.querySelector(".alarm")', 20000) and await sch_warte(C, 'document.querySelector(".alarm")', 20000)): raise BrettFehler('2. Partie: Matt-Dialog nicht bei beiden')
            await A.click('.alarm button:has-text("Revanche")'); await C.wait_for_timeout(600); await C.click('.alarm button:has-text("Revanche")'); await A.wait_for_timeout(1500)
            # Aufgeben
            await sch_frei(A); await C.click('#b-on'); await C.wait_for_selector('.alarm'); await C.click('.alarm button:has-text("Aufgeben")')
            await A.wait_for_selector('.alarm', timeout=10000)
            t = await A.locator('.alarm').inner_text()
            if 'gewinnt' not in t and 'aufgegeben' not in t.lower(): raise BrettFehler('Aufgeben: Dialog %r' % t[:80])
            r['ergebnis'] = 'OK'; r['notiz'] = 'Aufgeben-Dialog: ' + t.replace('\n', ' | ')[:60]
        except Exception as e: r['ergebnis'] = 'FEHLER'; r['notiz'] = (r.get('notiz', '') + ' %s: %s' % (type(e).__name__, str(e)[:240])).strip()
        r['jsFehler'] = [('A: ' + f) for f in (A.fe if A else [])] + [('C: ' + f) for f in (C.fe if C else [])]; r['dauer'] = round(time.time() - t0, 1)
        if r['jsFehler'] and r['ergebnis'] == 'OK': r['ergebnis'] = 'FEHLER'
        speichere(r)
        for x in (A, C):
            if x: await x.context.close()

async def teil_brett(pw, sel_ids):
    ids = set(sel_ids) if sel_ids else set()
    fertig = lese_ergebnisse()
    if not ids and not ARG.wiederholen: ids = {i for i in ('b01', 'b02', 'b03', 'b04', 'b05', 'b06') if i not in fertig}
    elif not ids: ids = {'b01', 'b02', 'b03', 'b04', 'b05', 'b06'}
    if ARG.liste: print('Brettspiele: b01 4g lokal · b02 4g Computer(3) · b03 4g online · b04 Schach lokal · b05 Schach Computer(3) · b06 Schach online'); return
    if not ids: return
    srv = Server('brett'); browser = await pw.chromium.launch(args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
    try:
        if ids & {'b01', 'b02', 'b03'}: await brett_vier(browser, srv, ARG.seed, ids & {'b01', 'b02', 'b03'})
        if ids & {'b04', 'b05', 'b06'}: await brett_schach(browser, srv, ARG.seed, ids & {'b04', 'b05', 'b06'})
    finally:
        await browser.close(); srv.stoppen()

# ================================================================ SERVER-DAUERLAUF
async def teil_dauer(pw, sel_ids):
    if ARG.liste: print('Dauerlauf: %.0f min Räume erstellen/verlassen, Speicher alle 2 min' % ARG.dauer_min); return
    fertig = lese_ergebnisse()
    if 'd01' in fertig and not ARG.wiederholen and not sel_ids: return
    if sel_ids and 'd01' not in sel_ids: return
    srv = Server('dauer', mem_sek=120)
    t0 = time.time(); r = dict(id='d01', teil='dauer', gruppe='Server-Dauerlauf', konfig='Server %.0f min · Räume im Takt erstellen/betreten/starten/verlassen/abrupt trennen · Speicher alle 2 min' % ARG.dauer_min,
                               repro='python3 tests/durchlauf_matrix.py --teil dauer --dauer-min %g' % ARG.dauer_min)
    try:
        p = await asyncio.create_subprocess_exec('node', os.path.join(BASIS, 'tests', 'p2_server_last.js'), str(srv.port), str(ARG.dauer_min), str(ARG.seed), stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.STDOUT)
        ausgabe, _ = await asyncio.wait_for(p.communicate(), ARG.dauer_min * 60 + 120)
        txt = ausgabe.decode('utf-8', 'replace')
        letzte = [z for z in txt.splitlines() if z.startswith('ENDE')]
        r['zaehler'] = letzte[0][5:] if letzte else txt[-300:]
        await asyncio.sleep(3)
        mem = [json.loads(z) for z in open(srv.memdatei) if z.strip()]
        r['mem'] = mem
        if len(mem) >= 3:
            basis = mem[1] if len(mem) > 2 else mem[0]          # Messung nach ~2 min (warm), die erste direkt nach dem Start ist zu klein
            ende = mem[-1]
            r['wachstumRss'] = round((ende['rss'] / basis['rss'] - 1) * 100, 1); r['wachstumHeap'] = round((ende['heapUsed'] / basis['heapUsed'] - 1) * 100, 1)
            r['wachstumHeapStart'] = round((ende['heapUsed'] / mem[0]['heapUsed'] - 1) * 100, 1); r['wachstumRssStart'] = round((ende['rss'] / mem[0]['rss'] - 1) * 100, 1)
            ok = r['wachstumHeap'] < 30 and r['wachstumRss'] < 30
            r['ergebnis'] = 'OK' if ok and srv.lebt() else 'FEHLER'
            r['notiz'] = 'heapUsed %+.1f %% (Start→Ende %+.1f %%), RSS %+.1f %% (Start→Ende %+.1f %%), Handles %s→%s' % (r['wachstumHeap'], r['wachstumHeapStart'], r['wachstumRss'], r['wachstumRssStart'], mem[1]['handles'] if len(mem) > 1 else '?', ende['handles'])
        else:
            r['ergebnis'] = 'FEHLER'; r['notiz'] = 'zu wenige Speicher-Messungen: %d' % len(mem)
        if not srv.lebt(): r['ergebnis'] = 'FEHLER'; r['notiz'] += ' · SERVER ABGESTÜRZT'
        sf = serverfehler(srv, 0)
        if sf: r['serverLog'] = sf; r['notiz'] += ' · Serverlog-Fehlerzeilen: %d' % len(sf)
    except Exception as e:
        r['ergebnis'] = 'FEHLER'; r['notiz'] = '%s: %s' % (type(e).__name__, str(e)[:240])
    r['dauer'] = round(time.time() - t0, 1); r['jsFehler'] = []
    speichere(r)
    srv.stoppen()

# ================================================================ BERICHT
def mem_text(v, n):
    if not v or not n: return '–'
    return 'Prog %s→%s · Geo %s→%s · Tex %s→%s · Heap %s→%s MB' % (v['prog'], n['prog'], v['geo'], n['geo'], v['tex'], n['tex'], v['heapMB'], n['heapMB'])

def bericht_schreiben():
    erg = lese_ergebnisse()
    def reihe(teil): return [erg[k] for k in sorted(erg) if erg[k].get('teil') == teil]
    off, onl, bre, dau = reihe('offline'), reihe('online'), reihe('brett'), reihe('dauer')
    alle = off + onl + bre + dau
    zahl = lambda l, e: sum(1 for r in l if r['ergebnis'] == e)
    L = []
    L.append('# Phase 2 – echte Durchläufe (v27, %s)\n' % time.strftime('%d.%m.%Y %H:%M'))
    L.append('Aufruf: `python3 tests/durchlauf_matrix.py` (Seed %d). Nur Berichte, kein Fix. Maschine 2 Kerne, Chromium mit SwiftShader (Software-GL): Render-Zeiten sind NICHT aussagekräftig, '
             'ausgewiesen wird die **JS-Zeit je Bild ohne Zeichnen** (physik + audio + hud + Autos/Kameras). Spieler = Computerfahrer (`spiel.autopilot`), Zeitraffer = `schnellvorlauf(10 s)` im Wechsel '
             'mit 12 voll gezeichneten Bildern; Rundenzahl 1. Online: Autopilot über `input.steuerung`, Echtzeit.\n' % ARG.seed)
    L.append('## Zusammenfassung\n')
    L.append('| Teil | Läufe | OK | FEHLER | HÄNGER |\n|---|---|---|---|---|')
    for n, l in (('Offline (Einzel/Zweispieler)', off), ('Online (2 Browser u. Sonderfälle)', onl), ('Brettspiele', bre), ('Server-Dauerlauf', dau)):
        L.append('| %s | %d | %d | %d | %d |' % (n, len(l), zahl(l, 'OK'), zahl(l, 'FEHLER'), zahl(l, 'HÄNGER')))
    L.append('| **Gesamt** | **%d** | **%d** | **%d** | **%d** |\n' % (len(alle), zahl(alle, 'OK'), zahl(alle, 'FEHLER'), zahl(alle, 'HÄNGER')))
    bad = [r for r in alle if r['ergebnis'] != 'OK']
    L.append('## Auffälligkeiten (jeder FEHLER/HÄNGER mit Reproduktionsbefehl)\n')
    if not bad: L.append('Keine.\n')
    for r in bad:
        L.append('- **%s** [%s] %s – %s: %s  \n  Repro: `%s`' % (r['id'], r['ergebnis'], r.get('konfig', ''), r.get('gruppe', ''), (r.get('notiz') or '')[:400], r.get('repro', '')))
        if r.get('jsFehler'): L.append('  JS-Fehler: ' + '; '.join(r['jsFehler'][:3])[:500])
        if r.get('serverLog'): L.append('  Serverlog: ' + '; '.join(r['serverLog'][:3])[:400])
    L.append('')
    hs = [r for r in alle if r['ergebnis'] == 'HÄNGER' and r.get('stack')]
    if hs:
        L.append('## Hänger-Stacks (CDP Debugger.pause)\n')
        for r in hs: L.append('**%s** %s\n```\n%s\n```' % (r['id'], r.get('konfig', ''), '\n'.join(r['stack'])))
    # Offline
    L.append('## Offline-Läufe (komplette Rennen: Countdown → Ziel → Ergebnis-Tafel → Hauptmenü → nächstes Rennen im selben Tab)\n')
    L.append('Frame-Zeit = JS-ms je Bild ohne Zeichnen (p50 / p95 / max, voll gezeichnete Bilder). Speicher: Shader-Programme / Geometrien / Texturen / JS-Heap (nach gc) im Menü vor → nach dem Rennen.\n')
    L.append('| ID | Tab | Konfiguration | Ergebnis | Dauer | Spielzeit | JS-ms p50/p95/max | JS-Fehler | Speicher vor→nach |\n|---|---|---|---|---|---|---|---|---|')
    for r in off:
        fr = r.get('frames') or {}
        L.append('| %s | %s/%s | %s | %s | %.0f s | %s s | %s | %s | %s |' % (r['id'], r.get('tab', ''), r.get('tabNr', ''), r.get('konfig', ''), r['ergebnis'], r.get('dauer', 0), r.get('simS', '–'),
                 ('%s / %s / %s (n=%s)' % (fr.get('p50'), fr.get('p95'), fr.get('max'), fr.get('n'))) if fr else '–',
                 (r['jsFehler'][0][:90] if r.get('jsFehler') else '0'), mem_text(r.get('vor'), r.get('nach'))))
    L.append('')
    L.append('### Speicherverlauf der Leck-Tabs (5 gleiche Rennen hintereinander in EINEM Tab, Wachstum > 20 % = Verdacht)\n')
    L.append('| Tab | Konfiguration | Heap nach Rennen 1…5 (MB) | Heap-Wachstum 1→5 | Programme 1→5 | Geometrien 1→5 | Texturen 1→5 | Urteil |\n|---|---|---|---|---|---|---|---|')
    tabs = {}
    for r in off:
        if r.get('gruppe') == 'Leck-Tab' and r.get('nach'): tabs.setdefault(r.get('tab'), []).append(r)
    for t, rs in sorted(tabs.items()):
        rs.sort(key=lambda r: r.get('tabNr', 0)); h = [x['nach']['heapMB'] for x in rs]
        w = (h[-1] / h[0] - 1) * 100 if len(h) > 1 and h[0] > 0 else 0
        pg, gg, tg = rs[-1]['nach']['prog'] - rs[0]['nach']['prog'], rs[-1]['nach']['geo'] - rs[0]['nach']['geo'], rs[-1]['nach']['tex'] - rs[0]['nach']['tex']
        urteil = 'LECK-VERDACHT' if (w > 20 or gg > 0 or tg > 0 or pg > 0) else 'kein Wachstum'
        if len(rs) < SESSION_N: urteil += ' (nur %d Rennen)' % len(rs)
        L.append('| %s | %s | %s | %+.1f %% | %d→%d | %d→%d | %d→%d | %s |' % (t, rs[0].get('konfig', ''), ' / '.join(str(x) for x in h), w, rs[0]['nach']['prog'], rs[-1]['nach']['prog'], rs[0]['nach']['geo'], rs[-1]['nach']['geo'], rs[0]['nach']['tex'], rs[-1]['nach']['tex'], urteil))
    L.append('')
    # Online
    L.append('## Online-Läufe (echter Server, 2 Browser)\n')
    L.append('| ID | Szenario | Konfiguration | Ergebnis | Dauer | Rennen | Tafel-Zeilen | JS-ms p95 (je Tab) | JS-Fehler | Notiz |\n|---|---|---|---|---|---|---|---|---|---|')
    for r in onl:
        fr = r.get('frames') or {}
        L.append('| %s | %s | %s | %s | %.0f s | %s s | %s | %s | %s | %s |' % (r['id'], r.get('gruppe', ''), r.get('konfig', ''), r['ergebnis'], r.get('dauer', 0), r.get('dauer_rennen', '–'), json.dumps(r.get('tafel', {}), ensure_ascii=False),
                 ', '.join('%s %s' % (k, v.get('p95')) for k, v in fr.items()) or '–', (r['jsFehler'][0][:90] if r.get('jsFehler') else '0'), (r.get('notiz') or '')[:160]))
    L.append('')
    # Speicher online
    vor = [(r['id'], r.get('vor')) for r in onl if r.get('vor')]
    if vor:
        L.append('### Online: Browser-Speicher je Rennen im Lobby-Zustand (vor Rennstart)\n')
        L.append('| Lauf | Host Prog/Geo/Tex/Heap | Gast Prog/Geo/Tex/Heap |\n|---|---|---|')
        for i, v in vor: L.append('| %s | %s | %s |' % (i, ' / '.join(str(v.get('host', {}).get(k, '–')) for k in ('prog', 'geo', 'tex', 'heapMB')), ' / '.join(str(v.get('gast', {}).get(k, '–')) for k in ('prog', 'geo', 'tex', 'heapMB'))))
        L.append('')
    # Brett
    L.append('## Brettspiele (je Partie bis Spielende, dann Revanche/Neues Spiel)\n')
    L.append('| ID | Spiel/Modus | Ergebnis | Dauer | JS-Fehler | Notiz |\n|---|---|---|---|---|---|')
    for r in bre: L.append('| %s | %s | %s | %.0f s | %s | %s |' % (r['id'], r.get('konfig', ''), r['ergebnis'], r.get('dauer', 0), (r['jsFehler'][0][:90] if r.get('jsFehler') else '0'), (r.get('notiz') or '')[:200]))
    L.append('')
    # Dauerlauf
    L.append('## Server-Dauerlauf\n')
    for r in dau:
        L.append('%s – %s (%.0f s). Zähler: `%s`\n' % (r['ergebnis'], r.get('notiz', ''), r.get('dauer', 0), r.get('zaehler', '')))
        if r.get('mem'):
            L.append('| Minute | RSS MB | heapUsed MB | external MB | Handles |\n|---|---|---|---|---|')
            t0 = r['mem'][0]['t']
            for m in r['mem']: L.append('| %.0f | %.1f | %.1f | %.1f | %s |' % ((m['t'] - t0) / 60000, m['rss'] / 1048576, m['heapUsed'] / 1048576, m['external'] / 1048576, m['handles']))
        L.append('')
    # Bilder
    bilder = sorted(f for f in os.listdir(OUT) if f.endswith('.png'))
    L.append('## Screenshots der Ergebnis-Tafeln (Stichprobe)\n')
    for b in bilder: L.append('- `tests/out/p2/%s`' % b)
    L.append('\n## Nicht abgedeckt / Einschränkungen\n')
    L.append('- Mega-Strecke hat keine XL-Variante (Kombination ausgelassen). Schaden ist online ausgeschaltet (Spiel-Vorgabe), daher nicht in den Online-Läufen.\n'
             '- Fahrer ist ein Computerfahrer, kein Mensch: Fahrhilfe/Lenkhilfe-Pfade (`hilfeStufe`) laufen im Offline-Teil nicht, nur online mit `fahrhilfe: wenig` serverseitig.\n'
             '- Zeitraffer (`schnellvorlauf`) überspringt Zeichnen/Kamera/HUD/Tribünen-Animation; diese laufen nur in den 12 gezeichneten Bildern je 10 s Spielzeit.\n'
             '- SwiftShader: keine Aussage über GPU-Shader-Übersetzungszeit auf dem Mac.\n')
    open(os.path.join(OUT, 'durchlaeufe.md'), 'w', encoding='utf-8').write('\n'.join(L))
    print('Bericht: tests/out/p2/durchlaeufe.md')

async def main():
    sel = set(x.strip() for x in ARG.nur.split(',') if x.strip())
    if ARG.bericht: bericht_schreiben(); return
    teile = ['offline', 'online', 'brett', 'dauer'] if ARG.teil == 'alle' else ARG.teil.split(',')
    if sel and ARG.teil == 'alle':
        teile = []
        if any(re.match(r'^[osezLMG]\d', i) for i in sel): teile.append('offline')
        if any(i.startswith('n') for i in sel): teile.append('online')
        if any(i.startswith('b') for i in sel): teile.append('brett')
        if any(i.startswith('d') for i in sel): teile.append('dauer')
    async with async_playwright() as pw:
        for t in teile:
            try:
                await {'offline': teil_offline, 'online': teil_online, 'brett': teil_brett, 'dauer': teil_dauer}[t](pw, sel)
            except Exception:
                traceback.print_exc()
    if not ARG.liste: bericht_schreiben()

if __name__ == '__main__':
    asyncio.run(main())
