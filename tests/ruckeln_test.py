#!/usr/bin/env python3
"""Ruckeln messen (14.10., v21): python3 tests/ruckeln_test.py [--basis DIR] [--sekunden 60] [--strecken wiese,wald,alpen] [--modi solo,zwei] [--json datei]
Headless Chromium (SwiftShader = Software-GL). Je Szenario: rennenStarten (Streckenbau-Zeit gemessen), dann die Spielschleife von Hand mit 1/60-s-Schritten
pumpen (wie tests/leistung_test.py) und je Frame die CPU-Zeit der Spielschleife (frame() gesamt = physik + audio + hud + render(CPU) + Rest) messen,
dazu die Zahl der Shader-Programme (renderer.info.programs), Texturen, Geometrien und den JS-Heap – steigt eine Zahl im Frame, ist sie die Ursache des Ausreißers
(Shader-Kompilierung / Textur-/Puffer-Upload), fällt der Heap um > 2 MB, war es eine Garbage Collection.
Ausgabe: Anteil Frames > 33 ms, max Frame, p99, Streckenbau-Zeit, erster Frame, die schlimmsten Frames mit Ursache. Auto fährt als Autopilot.
Hinweis: Frame-Zeiten mit Software-GL sind höher als auf einer GPU – aussagekräftig sind die Ausreißer (Spitzen) und der Vergleich vorher/nachher."""
import sys, os, json, argparse, statistics
from playwright.sync_api import sync_playwright

ap = argparse.ArgumentParser()
ap.add_argument('--basis', default=os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
ap.add_argument('--sekunden', type=float, default=60)
ap.add_argument('--strecken', default='wiese,wald,alpen')
ap.add_argument('--modi', default='solo,zwei')
ap.add_argument('--json', default='')
ap.add_argument('--grenze', type=float, default=33.0)
ap.add_argument('--takt', type=int, default=1, help='Physikschritte je gemessenem Frame (Software-GL ist langsam: 4 = 15 Bilder/s statt 60, der Spielablauf bleibt gleich)')
ap.add_argument('--compile', action='store_true', help='Versuch: vor der Messung renderer.compile(szene, kamera) aufrufen')
ap.add_argument('--breite', type=int, default=480)
ap.add_argument('--hoehe', type=int, default=270)
arg = ap.parse_args()
url = 'file://' + os.path.join(os.path.abspath(arg.basis), 'Autorennen.html')

BEREIT = r'''() => {
  const s = Rennspiel.spiel, P = Object.getPrototypeOf(s);
  window.requestAnimationFrame = () => 0;           // Schleife anhalten
  const t = { physik: 0, audio: 0, hud: 0, render: 0 };
  const huelle = (name, block) => { const o = P[name]; s[name] = function () { const a = performance.now(); const r = o.apply(this, arguments); t[block] += performance.now() - a; return r; }; };
  huelle('physikSchritt', 'physik'); huelle('tonAktualisieren', 'audio'); huelle('hudAktualisieren', 'hud'); huelle('zeichnen', 'render');
  window.__t = t; window.__log = []; window.__jetzt = performance.now(); s.uhr.letzte = window.__jetzt; s.uhr.rest = 0;
  window.__last = { prog: s.renderer.info.programs ? s.renderer.info.programs.length : 0, tex: s.renderer.info.memory.textures, geo: s.renderer.info.memory.geometries,
    heap: performance.memory ? performance.memory.usedJSHeapSize : 0 };
  return true; }'''
PUMPE = r'''(n) => {
  const s = Rennspiel.spiel, t = window.__t, schritt = 1000 / 60 * (window.__takt || 1), info = s.renderer.info, L = window.__last;
  for (let i = 0; i < n; i++) {
    for (const k in t) t[k] = 0;
    window.__jetzt += schritt;
    const a = performance.now(); s.frame(window.__jetzt); const ms = performance.now() - a;
    const prog = info.programs ? info.programs.length : 0, tex = info.memory.textures, geo = info.memory.geometries, heap = performance.memory ? performance.memory.usedJSHeapSize : 0;
    window.__log.push([ms, t.physik, t.audio, t.hud, t.render, prog - L.prog, tex - L.tex, geo - L.geo, (heap - L.heap) / 1048576, s.rennen ? +s.rennen.zeit.toFixed(2) : 0, s.rennen ? (s.rennen.gasErlaubt ? 1 : 0) : 0]);
    if (prog > L.prog) { const neu = info.programs.slice(L.prog).map(q => q.name + '#' + q.id + '{' + q.cacheKey + '}'); (window.__neu = window.__neu || []).push([window.__log.length - 1, neu.join(',')]); }
    L.prog = prog; L.tex = tex; L.geo = geo; L.heap = heap;
  }
  return window.__log.length; }'''

def ursache(z):
    u = []
    if z[5] > 0: u.append('Shader +%d' % z[5])
    if z[6] > 0: u.append('Textur +%d' % z[6])
    if z[7] > 0: u.append('Geometrie +%d' % z[7])
    if z[8] < -2: u.append('GC (%.0f MB)' % z[8])
    if not u:
        teile = {'physik': z[1], 'audio': z[2], 'hud': z[3], 'render(CPU)': z[4], 'Rest': z[0] - z[1] - z[2] - z[3] - z[4]}
        k = max(teile, key=teile.get); u.append('%s %.0f ms' % (k, teile[k]))
    return ', '.join(u)

ergebnisse, fehler = [], []
with sync_playwright() as p:
    browser = p.chromium.launch(args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist',
                                      '--enable-precise-memory-info', '--autoplay-policy=no-user-gesture-required'])
    for strecke in arg.strecken.split(','):
        for modus in arg.modi.split(','):
            ctx = browser.new_context(viewport={'width': arg.breite, 'height': arg.hoehe})
            page = ctx.new_page()
            page.on('pageerror', lambda e: fehler.append(str(e)))
            page.goto(url)
            page.wait_for_function('window.Rennspiel && Rennspiel.spiel', timeout=60000)
            page.wait_for_timeout(1500)
            page.evaluate(BEREIT)
            page.evaluate('window.__takt = %d' % arg.takt)
            bau = page.evaluate(f"""(() => {{ const a = performance.now(); Rennspiel.spiel.rennenStarten({{ modus: '{modus}', streckeId: '{strecke}',
                autoIds: ['troc-cabrio', 'multivan'], runden: 3, gegner: 3, schwierigkeit: 'mittel', fahrhilfe: ['wenig', 'wenig'], tempoKlasse: 'normal' }}); return performance.now() - a; }})()""")
            page.evaluate("try { Rennspiel.Audio.start && Rennspiel.Audio.start(); Rennspiel.Audio.setzeAn && Rennspiel.Audio.setzeAn(true); } catch (e) {}")
            page.evaluate("[0, 1].forEach(i => Rennspiel.spiel.autopilot(i, true))")
            page.evaluate("(() => { const s = Rennspiel.spiel; window.__jetzt = performance.now(); s.uhr.letzte = window.__jetzt; s.uhr.rest = 0; const i = s.renderer.info; window.__last = { prog: i.programs ? i.programs.length : 0, tex: i.memory.textures, geo: i.memory.geometries, heap: performance.memory ? performance.memory.usedJSHeapSize : 0 }; })()")
            if arg.compile:
                print('   compile:', page.evaluate("(() => { const s = Rennspiel.spiel, i = s.renderer.info, a = i.programs.length, t = performance.now(); s.renderer.compile(s.szene, s.kameras[0].kamera); return [a, i.programs.length, Math.round(performance.now() - t)]; })()"))
            n = int(arg.sekunden * 60 / arg.takt)
            fertig = 0
            while fertig < n:
                fertig = page.evaluate(PUMPE, min(300, n - fertig))
            log = page.evaluate('window.__log')
            neuProg = dict(page.evaluate('window.__neu || []'))
            # Software-GL: render(CPU) wartet auf SwiftShader und ist kein Maß für eine GPU → „JS“ = Spielschleife ohne render. Ereignis = im Frame entstanden
            # neue Shader-Programme / Texturen / Geometrien (= Kompilierung bzw. Upload, auf der GPU ein Ruckler) – nach dem Countdown (im Rennen) zählen sie als Ruckler.
            ms = [z[0] for z in log]; js = [z[0] - z[4] for z in log]
            ereignis = [i for i, z in enumerate(log) if z[5] > 0 or z[6] > 0 or z[7] > 0]
            im_rennen = [i for i in ereignis if log[i][10] == 1]
            ueber = [i for i, v in enumerate(js) if v > arg.grenze]
            ruckler = sorted(set(ueber) | set(im_rennen))
            vw = page.evaluate('Rennspiel.spiel.vorwaermMs === undefined ? null : Rennspiel.spiel.vorwaermMs')
            r = {'strecke': strecke, 'modus': modus, 'frames': len(ms), 'bauMs': bau, 'vorwaermMs': vw, 'erster': ms[0], 'ersterJs': js[0], 'jsMax': max(js[1:]), 'jsMittel': statistics.mean(js),
                 'jsP99': sorted(js)[int(len(js) * 0.99)], 'jsUeber': len(ueber), 'ereignisseCountdown': len([i for i in ereignis if log[i][10] == 0]), 'ereignisseRennen': len(im_rennen),
                 'rucklerFrames': len(ruckler), 'anteilRuckler': len(ruckler) / len(ms),
                 'programmeGesamt': page.evaluate('Rennspiel.spiel.renderer.info.programs.length'), 'shaderNeu': sum(z[5] for z in log),
                 'shaderImRennen': sum(log[i][5] for i in im_rennen), 'texturImRennen': sum(log[i][6] for i in im_rennen), 'geoImRennen': sum(log[i][7] for i in im_rennen),
                 'gc': sum(1 for z in log if z[8] < -2), 'maxRohMs': max(ms)}
            schlimm = sorted(range(1, len(log)), key=lambda i: -js[i])[:5]
            r['schlimmsteJs'] = [{'frame': i, 'jsMs': round(js[i], 1), 'rennzeit': log[i][9], 'ursache': ursache(log[i])} for i in schlimm]
            r['ereignisFrames'] = [{'programm': neuProg.get(i, ''), 'frame': i, 'rennzeit': log[i][9], 'rennen': log[i][10] == 1, 'ursache': ursache(log[i])} for i in im_rennen[:12]]
            ergebnisse.append(r)
            print(f"{strecke:7} {modus:5} Bau {bau:6.0f} ms (davon Vorwärmen {vw if vw is None else round(vw)} ms) | 1. Frame {ms[0]:7.0f} ms | JS (ohne render) mittel {r['jsMittel']:5.2f} p99 {r['jsP99']:5.1f} max {r['jsMax']:6.1f} ms, > {arg.grenze:.0f} ms: {r['jsUeber']} | "
                  f"Shader neu {r['shaderNeu']} (davon im Rennen {r['shaderImRennen']}), Textur im Rennen +{r['texturImRennen']}, Geo im Rennen +{r['geoImRennen']}, GC {r['gc']} | "
                  f"Ruckler-Frames {r['rucklerFrames']} von {r['frames']} = {100 * r['anteilRuckler']:.2f} %", flush=True)
            for z in r['schlimmsteJs'][:3]:
                print(f"           JS-Spitze Frame {z['frame']:5d}  {z['jsMs']:6.1f} ms  Rennzeit {z['rennzeit']:5.1f} s  {z['ursache']}", flush=True)
            for z in r['ereignisFrames'][:6]:
                print(f"           im Rennen: Frame {z['frame']:5d}  Rennzeit {z['rennzeit']:5.1f} s  {z['ursache']}  {neuProg.get(z['frame'], '')[:40]}", flush=True)
                if neuProg.get(z['frame']):
                    k = neuProg[z['frame']].split('{', 1)[1].rstrip('}').split(',')
                    alle = page.evaluate('Rennspiel.spiel.renderer.info.programs.map(q => q.cacheKey)')
                    bester = min((a.split(',') for a in alle if a != ','.join(k)), key=lambda a: sum(1 for x, y in zip(a, k) if x != y) + abs(len(a) - len(k)), default=None)
                    if bester: print('              Unterschied zum ähnlichsten Programm (Position, ähnlich, neu):', [(i, x, y) for i, (x, y) in enumerate(zip(bester, k)) if x != y][:6], flush=True)
            ctx.close()
    browser.close()
if arg.json:
    json.dump(ergebnisse, open(arg.json, 'w'), indent=1)
if fehler: print('JS-Fehler:', fehler[:5])
ges = sum(r['frames'] for r in ergebnisse); ru = sum(r['rucklerFrames'] for r in ergebnisse)
print(f"\nGESAMT: {ges} Frames, Ruckler-Frames (JS > {arg.grenze:.0f} ms oder neue Shader/Texturen/Geometrien im Rennen): {ru} = {100 * ru / max(1, ges):.2f} %, "
      f"JS-Max {max(r['jsMax'] for r in ergebnisse):.1f} ms, Streckenbau max {max(r['bauMs'] for r in ergebnisse):.0f} ms, erster Frame max {max(r['erster'] for r in ergebnisse):.0f} ms")
