#!/usr/bin/env python3
"""Runde 4 (W2-C): Screenshots Wracks / Brand / Strohballen / Schaden (Playwright, headless).
Autorennen.html lädt src/physics/schaden.js (noch) nicht und main.js baut Schaden + Strohballen-Dynamik noch nicht
ein → die Testseite lädt schaden.js vor dem Rennstart nach und baut Dynamik/Schaden selbst in Rennspiel.spiel ein,
genau wie die Einbau-Anleitung (Bericht W2-C).
Aufruf: python3 tests/schaden_screenshot.py [ausgabeordner]   (Standard tests/out/schaden)
Bilder: 01_wald_wrack, 02_wald_brand, 03_wald_strohballen, 04_schaden_rauch30, 05_liegengeblieben, 06_wueste_brand
Prüft: keine JS-Fehler, Wracks in der Szene, Flammen/Rauch vorhanden, Strohballen-Instanzen > 0, HUD-Gesundheitsbalken sichtbar."""
import sys, os, io, json
from playwright.sync_api import sync_playwright
from PIL import Image, ImageStat

basis = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
aus = sys.argv[1] if len(sys.argv) > 1 else os.path.join(basis, 'tests', 'out', 'schaden')
os.makedirs(aus, exist_ok=True)
url = 'file://' + os.path.join(basis, 'Autorennen.html')
SCHADEN_JS = os.path.join(basis, 'src', 'physics', 'schaden.js')


def mittel(png, box=None):
    b = Image.open(io.BytesIO(png)).convert('RGB')
    if box:
        w, h = b.size
        b = b.crop((int(box[0] * w), int(box[1] * h), int(box[2] * w), int(box[3] * h)))
    return [round(x, 1) for x in ImageStat.Stat(b).mean]


# Spieler an Bogenlänge s (Seitenabstand q), KI weit weg geparkt; Kamera springt (kein Nachziehen)
AUTO_NACH_S = '''([s, q]) => { const sp0 = Rennspiel.spiel, sp = sp0.strecke.spline, p = sp.punktBei(s);
  sp0.fahrzeuge.forEach((f, i) => {
    if (i === 0) f.vehicle.setzen(p.x + p.nx * q, p.z + p.nz * q, Rennspiel.headingAus(p.tx, p.tz));
    else { const r = sp.punktBei(s - 300 - 20 * i); f.vehicle.setzen(r.x + r.nx * 40, r.z + r.nz * 40, 0);
      if (f.driver) f.driver.steuerung = () => ({ gas: 0, bremse: 1, lenkung: 0 }); }
    f.index = -1; if (sp0._vorherAngleichen) sp0._vorherAngleichen(f); });
  sp0.kameras.forEach(k => { k._erstesMal = true; }); }'''

# Einbau wie in der Anleitung: Dynamik auch nur für Strohballen, Schaden mit Ereignissen, update je Frame, HUD
EINBAUEN = '''(o) => { const s = Rennspiel.spiel, R = Rennspiel, st = s.strecke;
  if (!s.dynamik && R.Dynamik && st.strohballen && st.strohballen.length) { s.dynamik = new R.Dynamik(st, { seed: 4242 }); s.szene.add(s.dynamik.bauen()); }
  const sch = new R.Schaden(s.fahrzeuge, { an: !!o.an });
  sch.bei((e) => { if (e.art === 'liegengeblieben') s._meldung(e.i, 'Liegengeblieben! 💥', 2600);
    if (e.art === 'abschleppwagen') s._meldung(e.i, '🚚 Abschleppwagen kommt…', 2600);
    if (e.art === 'abschleppen') s.zuruecksetzen(e.i); });
  s.fahrzeuge.forEach((f, i) => sch.meshBauen(i, f.mesh));
  s.huds.forEach((h, k) => { const i = s.fahrzeuge.findIndex(f => f.istSpieler && f.spielerNr === k); h.schadenSetzen(sch, i); });
  const zeichnen = s.zeichnen.bind(s); let t0 = performance.now();
  // (main.js ruft schritt im Physikschritt – hier vereinfacht je Frame)
  s.zeichnen = () => { const t = performance.now(), dt = Math.min(0.1, (t - t0) / 1000); sch.schritt(dt); sch.update(dt); t0 = t; zeichnen(); };
  s._testSchaden = sch;
  document.querySelectorAll('.hud-meldung').forEach(m => { m.style.transition = 'none'; });   // headless: CSS-Übergänge stehen
  return sch.zustand(0); }'''

# Prozent direkt setzen (Treffer ohne Abklingzeit)
PROZENT = '''(p) => { const sch = Rennspiel.spiel._testSchaden;
  for (let k = 0; sch.zustand(0).prozent > p && k < 40; k++) { sch.z[0].abkling = 0; sch.treffer(0, 'hindernis', 5); }
  return sch.zustand(0); }'''

INFO = '''(() => { const s = Rennspiel.spiel, i = s.renderer.info.render;
  let wracks = 0, flammen = 0, rauch = 0, stroh = 0, schadenRauch = 0;
  s.szene.traverse(o => { if (o.name && o.name.startsWith('Wrack ')) wracks++; if (o.name === 'Flamme') flammen++;
    if (o.name === 'Wrackrauch') rauch++; if (o.name === 'Strohballen') stroh += o.count; if (o.name === 'schadenRauch' && o.visible) schadenRauch++; });
  const g = document.querySelector('.hud-gesundheit');
  return { drawCalls: i.calls, dreiecke: i.triangles, fps: s.uhr.fps, wracks, flammen, rauch, stroh, schadenRauch,
    gesundheit: g ? getComputedStyle(g).display !== 'none' : null, gesundheitText: g ? g.textContent : null,
    meldung: (s.huds[0] && s.huds[0].meldungText) || '',
    meldungSichtbar: (() => { const m = document.querySelector('.hud-meldung'); return m ? getComputedStyle(m).opacity : null; })(),
    hindernisTypen: s.strecke.hindernisse.map(h => h.typ).join(',') }; })()'''

# Seitenblick auf das eigene Auto (für Rauch aus der Motorhaube)
KAMERA_SEITE = '''() => { const s = Rennspiel.spiel, k = s.kameras[0], v = s.fahrzeuge[0].vehicle;
  k.update = () => {}; const r = v.richtung(), q = v.rechts(), y = s.strecke.hoeheAn(v.x, v.z);
  k.kamera.position.set(v.x - r.x * 6.5 + q.x * 5.5, y + 2.6, v.z - r.z * 6.5 + q.z * 5.5);
  k.kamera.lookAt(v.x + r.x * 1.2, y + 1.4, v.z + r.z * 1.2); }'''

# Fall: name, strecke, welt, s-Ort (Hindernis-Suche oder Zahl), q, Schaden an, Prozent, Warten auf Strohballen, Seitenkamera
FAELLE = [
    ('01_wald_wrack', 'wald', 'hindernisse', 'wrack', -15, None, False, None, False, False),
    ('02_wald_brand', 'wald', 'hindernisse', 'brand', -17, None, False, None, False, False),
    ('03_wald_strohballen', 'wald', 'hindernisse', 'stroh', -16, None, False, None, True, False),
    ('04_schaden_rauch30', 'wald', 'hindernisse', 300, 0, None, True, 30, False, True),
    ('05_liegengeblieben', 'wiese', 'hindernisse', 420, 0, None, True, 0, False, False),
    ('06_wueste_brand', 'wueste', 'hindernisse', 'brand', -16, None, False, None, False, False),
]

ergebnisse, fehler = {}, []
with sync_playwright() as pw:
    browser = pw.chromium.launch(args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
    for name, strecke, welt, ort, ds, _q, an, prozent, stroh, seite in FAELLE:
        page = browser.new_page(viewport={'width': 1280, 'height': 800})
        js_fehler = []
        page.on('pageerror', lambda e: js_fehler.append(str(e)))
        page.on('console', lambda m: js_fehler.append(m.text) if m.type == 'error' else None)
        page.goto(url)
        page.wait_for_timeout(1000)
        page.add_script_tag(path=SCHADEN_JS)
        page.evaluate("([id, welt]) => Rennspiel.spiel.rennenStarten({ modus: 'solo', streckeId: id, welt, autoIds: ['troc-cabrio', 'multivan'], runden: 3, gegner: 1, schwierigkeit: 'mittel', fahrhilfe: ['aus', 'aus'] })", [strecke, welt])
        page.wait_for_timeout(600)
        info0 = page.evaluate(EINBAUEN, {'an': an, 'prozent': prozent})
        # Ort bestimmen
        if isinstance(ort, str) and ort in ('wrack', 'brand'):
            s_ort = page.evaluate("(t) => { const h = Rennspiel.spiel.strecke.hindernisse.find(x => x.typ === t); return h ? [h.s, h.seitenabstand] : null; }", ort)
            if not s_ort:
                fehler.append(name + ': kein Hindernis ' + ort); page.close(); continue
            page.evaluate(AUTO_NACH_S, [s_ort[0] + ds, s_ort[1] * -0.6])
        elif ort == 'stroh':
            s_ort = page.evaluate("() => { const d = Rennspiel.spiel.dynamik; return d && d.strohStellen.length ? [d.strohStellen[0].s, 0] : null; }")
            if not s_ort:
                fehler.append(name + ': keine Strohballen-Dynamik'); page.close(); continue
            page.evaluate(AUTO_NACH_S, [s_ort[0] + ds, 0])
        else:
            page.evaluate(AUTO_NACH_S, [ort, 0])
        # Countdown überspringen (headless läuft die Spielschleife kaum → Physik per schnellvorlauf)
        page.evaluate('Rennspiel.spiel.schnellvorlauf(4.4)')
        page.wait_for_timeout(300)
        if prozent is not None:
            info0 = page.evaluate(PROZENT, prozent)
        if stroh:
            # vorspulen, bis ein Ballen mitten auf der Straße rollt
            for _ in range(200):
                q = page.evaluate("() => { const b = Rennspiel.spiel.dynamik.strohStellen[0].ballen.find(x => x.zustand === 'rollt'); return b ? b.q : null; }")
                if q is not None and abs(q) < 2.0: break
                page.evaluate('Rennspiel.spiel.schnellvorlauf(0.1)')
            info_stroh = page.evaluate("() => { const d = Rennspiel.spiel.dynamik; return d.strohStellen.map(s => s.ballen.map(b => b.zustand + ':' + b.q.toFixed(1)).join('/') + ' t' + s.timer.toFixed(1)).join(' | ') + ' zeit ' + d.zeit.toFixed(1); }")
            page.wait_for_timeout(300)
        if prozent == 0:
            page.wait_for_timeout(500)
        if seite:
            page.evaluate(KAMERA_SEITE)
            page.wait_for_timeout(500)
        # headless werden kaum Frames gezeichnet: Optik einmal von Hand nachführen (wie main.frame)
        page.evaluate("() => { const s = Rennspiel.spiel; if (s.dynamik) s.dynamik.animieren(); if (s._testSchaden) s._testSchaden.update(0.05); s.zeichnen(); }")
        info = page.evaluate(INFO)
        png = page.screenshot(path=os.path.join(aus, name + ".png"), timeout=180000)
        info['zustand'] = info0
        info['farbe'] = mittel(png)
        info['jsFehler'] = js_fehler
        if stroh: info['strohInfo'] = info_stroh
        ergebnisse[name] = info
        if js_fehler: fehler.append(name + ': JS-Fehler ' + '; '.join(js_fehler))
        if 'wrack' not in info['hindernisTypen'] and 'brand' not in info['hindernisTypen']: fehler.append(name + ': keine Wracks in strecke.hindernisse')
        if info['wracks'] < 1: fehler.append(name + ': kein Wrack-Modell in der Szene')
        if ort == 'brand' and (info['flammen'] < 2 or info['rauch'] < 1): fehler.append(name + ': Flammen/Rauch fehlen')
        if stroh and info['stroh'] < 1: fehler.append(name + ': keine Strohballen sichtbar')
        if an and not info['gesundheit']: fehler.append(name + ': Gesundheitsbalken fehlt')
        if not an and info['gesundheit']: fehler.append(name + ': Gesundheitsbalken sichtbar obwohl Schaden aus')
        if prozent == 30 and info['schadenRauch'] < 1: fehler.append(name + ': kein Rauch bei 30 %')
        if prozent == 0 and ('Liegengeblieben' not in info['meldung'] and 'Abschleppwagen' not in info['meldung']): fehler.append(name + ': Meldung Liegengeblieben fehlt')
        page.close()
    browser.close()

print(json.dumps(ergebnisse, indent=1, ensure_ascii=False))
print('\n'.join(fehler) if fehler else 'ALLE PRÜFUNGEN OK')
sys.exit(1 if fehler else 0)
