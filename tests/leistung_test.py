#!/usr/bin/env python3
"""Leistungstest (Playwright, headless Chromium mit SwiftShader = Software-GL).

Misst die CPU-Zeit pro Frame, aufgeteilt in physik / audio / hud(+minimap) / grafik (Autos+Kameras) / render,
für Solo (1 Spieler + 3 KI) und Zwei-Spieler (2 Spieler + 3 KI) auf allen drei Strecken,
bei 1280×800 (dpr 1) und 2560×1600 (dpr 2).

Damit die Messung nicht davon abhängt, wie langsam SwiftShader rendert, wird die Spielschleife
angehalten und frame() von Hand mit genau 1/60 s Abstand aufgerufen (= 1 Physikschritt je Frame).
Die Blöcke werden von außen mit performance.now() umklammert (funktioniert auch mit dem alten Stand).
render-ms ist mit Software-GL NICHT aussagekräftig (GPU fehlt) – maßgeblich ist der JS-Anteil
physik + audio + hud (+ grafik).

Aufruf:  python3 tests/leistung_test.py                 # aktueller Stand
         python3 tests/leistung_test.py --basis DIR     # anderer Stand (z. B. Kopie von vorher)
         python3 tests/leistung_test.py --schnell       # nur Wald 2560×1600 (für schnelle Kontrolle)
         Vorher/Nachher-Tabelle gegen tests/leistung_vorher.json (Stand vor Runde 2) wird angehängt.
Ziel:    Split-Screen Wald 2560×1600: physik+audio+hud < 8 ms.
"""
import sys, os, json, argparse
from playwright.sync_api import sync_playwright

ap = argparse.ArgumentParser()
ap.add_argument('--basis', default=os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
ap.add_argument('--frames', type=int, default=120)
ap.add_argument('--schnell', action='store_true')
ap.add_argument('--json', default='')
ap.add_argument('--vorher', default=os.path.join(os.path.dirname(os.path.abspath(__file__)), 'leistung_vorher.json'),
                help='Messung eines älteren Stands (JSON) für die Vorher/Nachher-Tabelle; Standard: Stand vor Runde 2')
arg = ap.parse_args()
url = 'file://' + os.path.join(os.path.abspath(arg.basis), 'Autorennen.html')

# Umklammert die Methoden der Spielschleife und pumpt N Frames von Hand.
MESSEN = r'''async (n) => {
  const s = Rennspiel.spiel, P = Object.getPrototypeOf(s);
  // Spielschleife anhalten: rAF wird zum No-Op, frame() rufen wir selbst auf
  window.requestAnimationFrame = () => 0;
  const t = { physik: 0, audio: 0, hud: 0, render: 0 };
  const huelle = (name, block) => {
    const orig = P[name];
    s[name] = function () { const a = performance.now(); const r = orig.apply(this, arguments); t[block] += performance.now() - a; return r; };
  };
  huelle('physikSchritt', 'physik'); huelle('tonAktualisieren', 'audio');
  huelle('hudAktualisieren', 'hud'); huelle('zeichnen', 'render');
  // Debug-Overlay an (soll im Betrieb auch billig sein)
  document.getElementById('debug').classList.add('an');
  let jetzt = performance.now(); s.uhr.letzte = jetzt; s.uhr.rest = 0;
  const schritt = 1000 / 60;
  // Aufwärmen (JIT, Shader)
  for (let i = 0; i < 20; i++) { jetzt += schritt; s.frame(jetzt); }
  for (const k in t) t[k] = 0;
  const heap0 = performance.memory ? performance.memory.usedJSHeapSize : 0;
  let gesamt = 0;
  for (let i = 0; i < n; i++) {
    jetzt += schritt;
    const a = performance.now(); s.frame(jetzt); gesamt += performance.now() - a;
  }
  const heap1 = performance.memory ? performance.memory.usedJSHeapSize : 0;
  const info = s.renderer.info.render;
  const erg = { frame: gesamt / n, drawCalls: info.calls, dreiecke: info.triangles,
    pixelRatio: s.renderer.getPixelRatio(), canvas: s.canvas.width + 'x' + s.canvas.height,
    heapKB: Math.max(0, (heap1 - heap0) / 1024 / n) };
  for (const k in t) erg[k] = t[k] / n;
  erg.grafik = erg.frame - erg.physik - erg.audio - erg.hud - erg.render;   // Autos/Kameras/Rest
  erg.js = erg.physik + erg.audio + erg.hud;
  erg.leistung = typeof s.leistung === 'function' ? s.leistung() : null;
  return erg;
}'''

STRECKEN = ['wiese', 'wald', 'wueste']
GROESSEN = [(1280, 800, 1), (2560, 1600, 2)]
if arg.schnell: STRECKEN, GROESSEN = ['wald'], [(2560, 1600, 2)]

zeilen, fehler = [], []
with sync_playwright() as p:
    browser = p.chromium.launch(args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
                                      '--ignore-gpu-blocklist', '--enable-precise-memory-info', '--autoplay-policy=no-user-gesture-required'])
    for (w, h, dpr) in GROESSEN:
        for strecke in STRECKEN:
            for modus in ('solo', 'zwei'):
                ctx = browser.new_context(viewport={'width': w, 'height': h}, device_scale_factor=dpr)
                page = ctx.new_page()
                page.on('pageerror', lambda e: fehler.append(str(e)))
                page.goto(url)
                page.wait_for_function('window.Rennspiel && Rennspiel.spiel', timeout=20000)
                page.wait_for_timeout(500)
                page.evaluate(f"""Rennspiel.spiel.rennenStarten({{ modus: '{modus}', streckeId: '{strecke}',
                    autoIds: ['troc-cabrio', 'multivan'], runden: 3, gegner: 3, schwierigkeit: 'mittel', fahrhilfe: ['wenig', 'wenig'] }})""")
                # Ton anschalten, damit motorUpdate wirklich arbeitet (headless: AudioContext ohne Ausgabe)
                page.evaluate("try { Rennspiel.Audio.start && Rennspiel.Audio.start(); Rennspiel.Audio.setzeAn && Rennspiel.Audio.setzeAn(true); } catch (e) {}")
                page.evaluate("[0, 1].forEach(i => Rennspiel.spiel.autopilot(i, true))")
                page.evaluate("Rennspiel.spiel.schnellvorlauf(12)")      # Countdown vorbei, Feld zieht sich auseinander
                e = page.evaluate(MESSEN, arg.frames)
                e.update({'strecke': strecke, 'modus': modus, 'aufloesung': f'{w}x{h}@{dpr}'})
                zeilen.append(e)
                print(f"{e['aufloesung']:>14} {strecke:7} {modus:5}  js {e['js']:6.2f}  physik {e['physik']:5.2f}  audio {e['audio']:5.2f}  "
                      f"hud {e['hud']:5.2f}  grafik {e['grafik']:5.2f}  render {e['render']:7.2f}  dc {e['drawCalls']:3}  "
                      f"tri {e['dreiecke']:7}  pr {e['pixelRatio']}  {e['canvas']}  heap {e['heapKB']:.1f} KB/F", flush=True)
                ctx.close()
    browser.close()

print('\n| Auflösung | Strecke | Modus | JS ms (physik+audio+hud) | physik | audio | hud | grafik | render* | Draw-Calls | Dreiecke | pixelRatio |')
print('|---|---|---|---|---|---|---|---|---|---|---|---|')
for e in zeilen:
    print(f"| {e['aufloesung']} | {e['strecke']} | {e['modus']} | {e['js']:.2f} | {e['physik']:.2f} | {e['audio']:.2f} | {e['hud']:.2f} | "
          f"{e['grafik']:.2f} | {e['render']:.1f} | {e['drawCalls']} | {e['dreiecke']} | {e['pixelRatio']} |")
print('* render mit SwiftShader (Software-GL) – nicht repräsentativ für die GPU des Macs')
if arg.vorher and os.path.exists(arg.vorher):
    alt = {(e['aufloesung'], e['strecke'], e['modus']): e for e in json.load(open(arg.vorher))}
    print('\nVorher/Nachher (vorher = ' + os.path.basename(arg.vorher) + ')')
    print('| Auflösung | Strecke | Modus | JS ms vorher → nachher | Draw-Calls | Dreiecke | pixelRatio |')
    print('|---|---|---|---|---|---|---|')
    for e in zeilen:
        a = alt.get((e['aufloesung'], e['strecke'], e['modus']))
        if not a: continue
        print(f"| {e['aufloesung']} | {e['strecke']} | {e['modus']} | {a['js']:.2f} → {e['js']:.2f} | {a['drawCalls']} → {e['drawCalls']} | "
              f"{a['dreiecke']} → {e['dreiecke']} | {a['pixelRatio']} → {e['pixelRatio']} |")
if arg.json:
    with open(arg.json, 'w') as f: json.dump(zeilen, f, indent=1)

ziel = [e for e in zeilen if e['strecke'] == 'wald' and e['modus'] == 'zwei' and e['aufloesung'].startswith('2560')]
ok = not fehler and all(e['js'] < 8 for e in ziel)
if fehler: print('JS-Fehler:', fehler[:5])
print('ERGEBNIS:', 'OK' if ok else 'FAIL', '– Split-Screen Wald 2560×1600 JS-ms:', [round(e['js'], 2) for e in ziel])
sys.exit(0 if ok else 1)
