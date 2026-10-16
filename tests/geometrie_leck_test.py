# P3 S3: Wächst renderer.info.memory.geometries je Rennen? Welche Geometrien bleiben nach zumMenue zurück?
# Hook: BufferGeometry.setAttribute merkt sich den Erzeuger-Stack (erste Zeile außerhalb three.min.js),
#       addEventListener('dispose') = von WebGL hochgeladen, dispose() = freigegeben.
# Aufruf: python3 tests/out/p3/s3_geometrie_leck.py <strecke> <verkehr aus|viel> [rennen=4] [variante]
import asyncio, os, sys, json, subprocess, socket, time, collections
from playwright.async_api import async_playwright
os.environ.setdefault('PLAYWRIGHT_BROWSERS_PATH', '/opt/pw-browsers')
BASIS = '/home/claude/v27'; OUT = os.path.join(BASIS, "tests/out/p4")
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required']
STRECKE = sys.argv[1] if len(sys.argv) > 1 else 'mega'
VERKEHR = sys.argv[2] if len(sys.argv) > 2 else 'viel'
N = int(sys.argv[3]) if len(sys.argv) > 3 else 4
VAR = sys.argv[4] if len(sys.argv) > 4 else ''
EINST = dict(modus='solo', streckeId=STRECKE, autoIds=['porsche-911', 'mini-cooper'], runden=1, gegner=5, schwierigkeit='mittel', fahrhilfe=['wenig', 'wenig'],
             wetter='sonne', jahreszeit='sommer', tempoKlasse='normal', tageszeit='daemmerung', verkehr=VERKEHR, geisterfahrer=False, schaden=False, polizei=False,
             variante=VAR, welt='', hindernisMenge='normal', spielart='rennen')
HOOK = r'''() => {
  const G = THREE.BufferGeometry.prototype; window.__geo = new Set();
  const sa = G.setAttribute; G.setAttribute = function () { if (!this.__wo) { const st = (new Error().stack || '').split('\n').slice(1).map(z => z.trim())
      .filter(z => !z.includes('three.min.js')); this.__wo = st.slice(0, 3).map(z => z.replace(/^at /, '').replace(/https?:\/\/[^/]+\//, '')).join(' < '); } return sa.apply(this, arguments); };
  const ae = G.addEventListener; G.addEventListener = function (t) { if (t === 'dispose') window.__geo.add(this); return ae.apply(this, arguments); };
  const di = G.dispose; G.dispose = function () { window.__geo.delete(this); return di.apply(this, arguments); };
  return true; }'''
LISTE = r'''() => { const s = Rennspiel.spiel, inSzene = new Set(); s.szene.traverse(o => { if (o.geometry) inSzene.add(o.geometry); });
  const m = {}; for (const g of window.__geo) { const k = (inSzene.has(g) ? 'SZENE ' : 'LOSE  ') + (g.type || '?') + ' | ' + (g.__wo || '(ohne setAttribute)'); m[k] = (m[k] || 0) + 1; }
  return { info: s.renderer.info.memory.geometries, verfolgt: window.__geo.size, gruppen: m }; }'''

def port():
    s = socket.socket(); s.bind(('127.0.0.1', 0)); p = s.getsockname()[1]; s.close(); return p

async def main():
    p = port()
    srv = subprocess.Popen(['node', 'server/server.js', '--port', str(p), '--host', '127.0.0.1'], cwd=BASIS, stdout=subprocess.DEVNULL, stderr=subprocess.STDOUT)
    for _ in range(600):
        try: socket.create_connection(('127.0.0.1', p), timeout=.2).close(); break
        except OSError: time.sleep(.1)
    stand = []
    async with async_playwright() as pw:
        br = await pw.chromium.launch(args=ARGS)
        pg = await (await br.new_context(viewport={'width': 1000, 'height': 620})).new_page()
        await pg.goto('http://127.0.0.1:%d/' % p); await pg.wait_for_function('window.Rennspiel && Rennspiel.spiel', timeout=90000)
        await pg.evaluate(HOOK)
        for nr in range(1, N + 1):
            await pg.evaluate('(e) => { Rennspiel.spiel.rennenStarten(e); Rennspiel.spiel.autopilot(0, true); }', EINST)
            await pg.wait_for_timeout(6000)
            await pg.evaluate('() => Rennspiel.spiel.rennenFertig()')
            await pg.wait_for_timeout(1500)
            await pg.evaluate('() => Rennspiel.spiel.zumMenue(true)')
            await pg.wait_for_timeout(5000)
            l = await pg.evaluate(LISTE); stand.append(l)
            print('Rennen %d: info.geometries=%d, verfolgt=%d' % (nr, l['info'], l['verfolgt']), flush=True)
        await br.close()
    srv.kill()
    # Differenz zwischen Rennen 2 und letztem Rennen: was wächst?
    a, b = collections.Counter(stand[1]['gruppen']), collections.Counter(stand[-1]['gruppen'])
    diff = {k: b[k] - a[k] for k in set(a) | set(b) if b[k] != a[k]}
    print('Zuwachs Rennen 2 → %d (je Gruppe):' % N)
    for k, v in sorted(diff.items(), key=lambda x: -x[1]): print('  %+d  %s' % (v, k))
    name = 's3_%s_%s%s.json' % (STRECKE, VERKEHR, ('_' + VAR) if VAR else '')
    json.dump({'einst': EINST, 'stand': stand, 'zuwachs': diff}, open(os.path.join(OUT, name), 'w'), ensure_ascii=False, indent=1)

asyncio.run(main())
