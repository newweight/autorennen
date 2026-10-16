# P4 F2: frame()-Schutz. A) einmalige Ausnahme in zeichnen -> Bilder laufen weiter, Rennen schreitet fort
# B) Dauer-Ausnahme -> Meldung sichtbar, Physik pausiert, Seite bedienbar (Esc -> Pause-DOM mit Menue-Knopf)
import asyncio, os, sys, json, subprocess, socket, time
from playwright.async_api import async_playwright
os.environ.setdefault('PLAYWRIGHT_BROWSERS_PATH', '/opt/pw-browsers')
BASIS = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required']
def port():
    s = socket.socket(); s.bind(('127.0.0.1', 0)); p = s.getsockname()[1]; s.close(); return p
ok = True
def check(name, c, info=''):
    global ok
    print(('OK   ' if c else 'FEHL ') + name, info, flush=True)
    ok = ok and bool(c)
async def neu(br, p):
    pg = await (await br.new_context(viewport={'width': 1000, 'height': 620})).new_page()
    fehler = []; logs = []
    pg.on('pageerror', lambda e: fehler.append(str(e)[:120]))
    pg.on('console', lambda m: logs.append(m.text) if m.type == 'error' else None)
    await pg.goto('http://127.0.0.1:%d/' % p); await pg.wait_for_function('window.Rennspiel && Rennspiel.spiel', timeout=90000)
    await pg.evaluate('''() => { const s = Rennspiel.spiel; s.rennenStarten({ modus: 'solo', streckeId: 'wiese', gegner: 3, runden: 1 }); s.autopilot(0, true);
        window.__n = 0; const z = s.zeichnen; s.zeichnen = function () { window.__n++; return z.apply(this, arguments); }; }''')
    await pg.wait_for_function('window.__n >= 5', timeout=180000, polling=250)
    await pg.wait_for_function('Rennspiel.spiel.rennen && Rennspiel.spiel.rennen.gasErlaubt', timeout=120000, polling=250)
    await pg.wait_for_timeout(1500)
    return pg, fehler, logs
FORT = '() => { const t = Rennspiel.spiel.rennen.teilnehmer[0]; return (t.runde || 0) * 1e6 + (t.fortschritt || 0); }'   # Rennfortschritt
async def main():
    p = port()
    srv = subprocess.Popen(['node', 'server/server.js', '--port', str(p), '--host', '127.0.0.1'], cwd=BASIS, stdout=subprocess.DEVNULL, stderr=subprocess.STDOUT)
    for _ in range(600):
        try: socket.create_connection(('127.0.0.1', p), timeout=.2).close(); break
        except OSError: time.sleep(.1)
    async with async_playwright() as pw:
        br = await pw.chromium.launch(args=ARGS)
        # A) einmalige Ausnahme
        pg, fehler, logs = await neu(br, p)
        f0 = await pg.evaluate(FORT)
        await pg.evaluate('''() => { const s = Rennspiel.spiel, o = s.zeichnen; let x = 0; s.zeichnen = function () { if (x++ === 0) throw new Error('Testausnahme'); return o.apply(this, arguments); }; }''')
        await pg.wait_for_timeout(1500); c = await pg.evaluate('() => window.__n')
        await pg.wait_for_timeout(4000); d = await pg.evaluate('() => window.__n'); f1 = await pg.evaluate(FORT)
        meld = await pg.evaluate('() => Rennspiel.spiel.huds.map(h => h.meldungText || "")')
        check('A Bilder laufen nach einmaliger Ausnahme weiter', d - c > 0, '(Bilder in 4 s: %d)' % (d - c))
        check('A Rennen schreitet fort', abs(f1 - f0) > 0.5, '(%.1f -> %.1f m)' % (f0, f1))
        check('A keine Fehlermeldung im HUD, nicht pausiert', not any('Fehler' in m for m in meld) and not await pg.evaluate('() => Rennspiel.spiel.pausiert'))
        check('A Ausnahme geloggt', any('frame()' in l for l in logs))
        await pg.context.close()
        # B) Dauer-Ausnahme
        pg, fehler, logs = await neu(br, p)
        await pg.evaluate('''() => { const s = Rennspiel.spiel; s.zeichnen = function () { window.__n++; throw new Error('Dauerausnahme'); }; }''')
        try: await pg.wait_for_function('Rennspiel.spiel.pausiert', timeout=30000, polling=200)
        except Exception: pass
        await pg.wait_for_timeout(500)
        b = await pg.evaluate('() => [Rennspiel.spiel.pausiert, Rennspiel.spiel.huds.map(h => h.meldungText || "")]')
        print('   dbg', await pg.evaluate('() => JSON.stringify(Rennspiel.spiel._fehler)'))
        check('B Physik pausiert + Meldung sichtbar', b[0] and any('Fehler' in m and 'Esc' in m for m in b[1]), str(b))
        n1 = await pg.evaluate('() => window.__n'); await pg.wait_for_timeout(1500); n2 = await pg.evaluate('() => window.__n')
        check('B Bildschleife laeuft weiter (rAF-Kette lebt)', n2 - n1 > 0, '(%d)' % (n2 - n1))
        f1 = await pg.evaluate(FORT); await pg.wait_for_timeout(1000); f2 = await pg.evaluate(FORT)
        check('B Physik steht', abs(f2 - f1) < 1e-6, '(%s -> %s)' % (f1, f2))
        check('B Log begrenzt (<= 8 Fehler)', len([l for l in logs if 'frame()' in l]) <= 8, str(len(logs)))
        await pg.keyboard.press('Escape'); await pg.wait_for_timeout(800)
        st = await pg.evaluate('''() => { const e = document.getElementById("pause"); return [Rennspiel.spiel.zustand, e ? getComputedStyle(e).display : null]; }''')
        print('   nach Esc:', st)
        # Menue erreichbar: Pause-Menue-Knopf
        txt = await pg.evaluate('() => (document.getElementById("pause") || {}).innerText || ""')
        check('B Pause-DOM nach Esc sichtbar/bedienbar', st[1] not in (None, 'none'), txt[:60].replace('\n', ' | '))
        await pg.context.close(); await br.close()
    srv.kill()
    print('ERGEBNIS:', 'ALLES OK' if ok else 'FEHLER'); sys.exit(0 if ok else 1)
asyncio.run(main())
