#!/usr/bin/env python3
"""Browser-Rauchtest Motorrad-Modus (Stufe M2d „Cockpit + zwei Rückspiegel“).
Aufruf: python3 tests/moto_cockpit_rauch.py
Startet einen lokalen http-Server (Repo-Wurzel), lädt Motorrad.html und prüft:
  - Cockpit-Ansicht: Lenker-Bild (Griffe, Instrument) da, zwei Spiegel-Rahmen, Auto-Cockpit (VW/Porsche-Tafel, Instrumente, Wischer) nie
  - Kamera kippt mit der Schräglage um 50 % (Vorzeichen), sitzt im Helm (kein Fahrer im Bild)
  - die beiden Spiegel-Kameras schauen hinten-links bzw. hinten-rechts (echte Kameras im Spiel, Vorzeichen), seitlich versetzt
  - Spiegelbilder erscheinen im Bild (Pixel), links und rechts unterschiedlich; Auflösung halb, nie größer als der Ausschnitt
  - Draw-Call-Zuwachs gegenüber dem einen Autorennen-Spiegel höchstens +20 % (solo und zu zweit, Mittel über 32 Bilder)
  - Verfolger-/Weit-Ansicht: zwei Spiegel nur, wenn das Autorennen dort einen Spiegel zeigt (config.cockpit.spiegel.modi)
  - Touch (Klasse t-rennen): kein Lenker, keine Spiegel, alter Tacho bleibt
  - HUD ohne Überlappung (inkl. beider Spiegel und des Lenkers) bei 1280×800, 1920×1080, 844×390, solo und zu zweit; mit Unfall-HUD und Meldung
  - Purzelbaum: eigenes Motorrad im Solo-Cockpit ausgeblendet (und danach wieder sichtbar)
  - Autorennen.html: 0 JS-Fehler, keine Motorrad-Datei, ein Spiegel wie bisher
Bilder: tests/out/moto/moto_cockpit.png, moto_cockpit_zwei.png (+ moto_cockpit_verfolger.png)"""
import os, sys, json, time, socket, subprocess
from playwright.sync_api import sync_playwright

basis = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
out = os.path.join(basis, 'tests', 'out', 'moto'); os.makedirs(out, exist_ok=True)

def freier_port():
    s = socket.socket(); s.bind(('127.0.0.1', 0)); p = s.getsockname()[1]; s.close(); return p

port = freier_port()
server = subprocess.Popen([sys.executable, '-m', 'http.server', str(port), '--bind', '127.0.0.1'], cwd=basis, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1.0)
basisurl = f'http://127.0.0.1:{port}/'
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
ergebnisse = []
def pruefe(name, ok, info=''):
    ergebnisse.append(bool(ok)); print(('OK   ' if ok else 'FEHL ') + name + (f'  ({info})' if info != '' else ''))
def bild(page, name, hinweis=''):
    page.screenshot(path=os.path.join(out, name)); print(f'      Bild: tests/out/moto/{name} {hinweis}')

JS_HELFER = '''() => {
  const S = () => Rennspiel.spiel, DT = 1 / 60;
  window.__C = {
    warteStart() { const s = S(); let g = 0; while ((s.zustand !== 'rennen' || !s.rennen.gasErlaubt) && g++ < 3000) s.physikSchritt(DT); },
    lauf(sek) { const s = S(); for (let t = 0; t < sek; t += DT) s.physikSchritt(DT); },
    modus(m) { S().kameras.forEach((k) => { k.modusIndex = m; k._erstesMal = true; k.update(0.0167); }); },
    snap() { S().kameras.forEach((k) => { k._erstesMal = true; k.update(0.0167); }); },
    leerCountdown() { (S().huds || []).forEach((hd) => { hd.eCountdown.className = 'hud-countdown'; hd.eCountdown.style.animation = 'none'; hd.eCountdown.textContent = ''; }); },
    // Draw-Calls je Bild im Mittel über n Bilder (nach Einlaufen), beide Spiegel-Arten über config.motoCockpit.aus
    calls(aus, n) { const s = S(), r = s.renderer; Rennspiel.config.motoCockpit.aus = aus; for (let i = 0; i < 16; i++) s.zeichnen();
      let c = 0, t = 0; for (let i = 0; i < n; i++) { s.zeichnen(); c += r.info.render.calls; t += r.info.render.triangles; } Rennspiel.config.motoCockpit.aus = false; return { calls: c / n, tri: t / n }; },
    hudKollisionen() {
      const out = [], els = [];
      document.querySelectorAll('.hud').forEach((h, hi) => {
        const hr = h.getBoundingClientRect(), klipp = (r) => ({ left: Math.max(r.left, hr.left), right: Math.min(r.right, hr.right), top: Math.max(r.top, hr.top), bottom: Math.min(r.bottom, hr.bottom) });
        h.querySelectorAll('*').forEach((e) => {
          const cs = getComputedStyle(e), r = klipp(e.getBoundingClientRect());
          if (r.right - r.left < 2 || r.bottom - r.top < 2 || cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity) < 0.05) return;
          let p = e.parentElement, ok = true; while (p && p !== h) { const pc = getComputedStyle(p); if (pc.display === 'none' || parseFloat(pc.opacity) < 0.05) { ok = false; break; } p = p.parentElement; }
          if (!ok) return;
          const eigen = [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()) || e.tagName === 'CANVAS' || e.classList.contains('cp-moto-spiegel');
          if (!eigen) return;
          els.push({ hi, e, n: e.tagName + '.' + String(e.className).split(' ').join('.') + '[' + (e.textContent || '').trim().slice(0, 18) + ']', r, fam: e.classList.contains('cp-moto-spiegel') || e.classList.contains('cp-moto-lenker') });
        });
      });
      for (let i = 0; i < els.length; i++) for (let j = i + 1; j < els.length; j++) {
        const a = els[i], b = els[j]; if (a.e.contains(b.e) || b.e.contains(a.e) || (a.e.parentElement === b.e.parentElement && /platz|moto-zustand/.test(a.e.parentElement.className))) continue;
        if (a.fam && b.fam) continue;                          // Lenker-Bild und seine Spiegel gehören zusammen (Stiele)
        const w = Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left), h2 = Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top);
        if (w > 2 && h2 > 2) out.push(a.hi + ':' + a.n + ' x ' + b.hi + ':' + b.n + ' (' + Math.round(w) + 'x' + Math.round(h2) + ')');
      }
      // die beiden Spiegel eines HUD dürfen sich auch nicht berühren
      document.querySelectorAll('.hud').forEach((h, hi) => { const m = [...h.querySelectorAll('.cp-moto-spiegel')].filter((e) => getComputedStyle(e).display !== 'none').map((e) => e.getBoundingClientRect());
        if (m.length === 2 && Math.min(m[0].right, m[1].right) - Math.max(m[0].left, m[1].left) > 0) out.push(hi + ': Spiegel überlappen sich'); });
      return { elemente: els.length, spiegel: els.filter((x) => x.e.classList.contains('cp-moto-spiegel')).length, lenker: els.filter((x) => x.e.classList.contains('cp-moto-lenker')).length, kollisionen: out };
    },
    // Hinweis „Festgefahren? R drücken“ kurz zeigen (bleibt nur in diesem Aufruf): Lage gegen Spiegel/Lenker prüfen
    hinweisKollision() {
      const res = [];
      (S().huds || []).forEach((hd, hi) => {
        const e = hd.eHinweis, alt = { t: e.textContent, d: e.style.display };
        e.textContent = 'Festgefahren? ' + (hd.nr === 0 ? 'R' : 'T') + ' drücken'; e.style.display = 'block';
        const r = e.getBoundingClientRect(); const andere = [...hd.el.querySelectorAll('.cp-moto-spiegel, .cp-moto-lenker')].filter((x) => getComputedStyle(x).display !== 'none');
        andere.forEach((x) => { const q = x.getBoundingClientRect(); const w = Math.min(r.right, q.right) - Math.max(r.left, q.left), h = Math.min(r.bottom, q.bottom) - Math.max(r.top, q.top); if (w > 2 && h > 2) res.push(hi + ': Hinweis x ' + x.className + ' (' + Math.round(w) + 'x' + Math.round(h) + ')'); });
        e.textContent = alt.t; e.style.display = alt.d;
      });
      return res;
    },
  };
}'''

EINST = "({ modus: '%s', streckeId: '%s', autoIds: ['crossmaschine', 'crossmaschine-rot'], runden: 1, gegner: 3, schwierigkeit: 'mittel', fahrhilfe: ['wenig', 'wenig'] })"

try:
    with sync_playwright() as p:
        browser = p.chromium.launch(args=ARGS)
        page = browser.new_page(viewport={'width': 1280, 'height': 800})
        fehler = []
        page.on('pageerror', lambda e: fehler.append('pageerror: ' + str(e)))
        page.on('console', lambda m: fehler.append('console.error: ' + m.text) if m.type == 'error' else None)
        page.on('requestfailed', lambda r: fehler.append('requestfailed: ' + r.url))
        page.goto(basisurl + 'Motorrad.html'); page.wait_for_timeout(1500)
        page.evaluate(JS_HELFER)

        def ev(js, arg=None):
            return page.evaluate(js, arg) if arg is not None else page.evaluate(js)
        def starte(strecke='wiese', modus='solo', autopilot=True):
            ev('() => Rennspiel.spiel.rennenStarten' + EINST % (modus, strecke)); page.wait_for_timeout(500)
            if autopilot:
                ev('() => { Rennspiel.spiel.autopilot(0, true); if (Rennspiel.spiel.kameras.length > 1) Rennspiel.spiel.autopilot(1, true); }')
            ev('() => { __C.warteStart(); __C.lauf(8); __C.leerCountdown(); }')

        # ---------------- Module ----------------
        info = ev('''() => ({ c: !!Rennspiel.Moto.cockpit, inst: Rennspiel.Moto.cockpit.installiert, cfg: Rennspiel.config.motoCockpit, wischer: Rennspiel.config.cockpit.wischer.modi })''')
        pruefe('Cockpit-Modul geladen, Umhüllungen: ' + ', '.join(info['inst']), info['c'] and len(info['inst']) >= 4, info['inst'])
        pruefe('Config: Kamera kippt 50 %, Scheibenwischer im Motorradmodus aus', info['cfg']['rollAnteil'] == 0.5 and info['wischer'] == [], info['cfg']['rollAnteil'])

        # ---------------- Solo, Cockpit ----------------
        starte('wiese', 'solo')
        ev('() => __C.modus(1)'); page.wait_for_timeout(800)
        st = ev('''() => { const h = document.querySelector('.hud'), cs = (e) => e ? getComputedStyle(e).display : null;
          const sp = [...h.querySelectorAll('.cp-moto-spiegel')];
          return { modus: Rennspiel.spiel.kameras[0].modus, lenker: cs(h.querySelector('.cp-moto-lenker')), spiegel: sp.map((e) => cs(e)), altRahmen: getComputedStyle(h.querySelector('.hud-spiegel')).visibility,
            tafel: [...h.querySelectorAll('.cp-tafel, .cp-drehzahl, .cp-tacho, .cp-mitte, .cp-linksAussen')].filter((e) => cs(e) !== 'none').length, wischer: cs(h.querySelector('.hud-wischer')),
            alterTacho: cs(h.querySelector('.hud-tacho')), chip: h.querySelector('.hud-platz').style.position || '', hinweisUnten: h.querySelector('.hud-hinweis').style.bottom,
            sichtbarAutoRahmen: Rennspiel.rueckspiegel.sichtbar(Rennspiel.spiel, 0) }; }''')
        pruefe('Cockpit-Ansicht: Lenker-Bild + zwei Spiegel-Rahmen da, Rahmen des Autorennens unsichtbar', st['modus'] == 'cockpit' and st['lenker'] == 'block' and st['spiegel'] == ['block', 'block'] and st['altRahmen'] == 'hidden', st)
        pruefe('Cockpit-Ansicht: kein Auto-Cockpit (VW/Porsche-Tafel, Instrumente), kein Scheibenwischer', st['tafel'] == 0 and st['wischer'] in (None, 'none'), st['tafel'])
        pruefe('Cockpit-Ansicht: alter Tacho weg (das Instrument am Lenker zeigt km/h), Platz-Chip bleibt oben Mitte, Hinweis über die Spiegel gesetzt', st['alterTacho'] == 'none' and st['chip'] == '' and st['hinweisUnten'].endswith('px'), f"chip='{st['chip']}'")

        # Lenker-Bild gezeichnet (Pixel in der Mitte unten sind nicht transparent); Instrument zeigt Tempo
        px = ev('''() => { const c = document.querySelector('.cp-moto-lenker'), g = c.getContext('2d'), d = g.getImageData(0, 0, c.width, c.height).data; let n = 0, grip = 0;
          for (let i = 3; i < d.length; i += 4) if (d[i] > 200) n++;
          return { w: c.width, h: c.height, gefuellt: n / (d.length / 4), kmh: Math.round(Rennspiel.spiel.fahrzeuge[0].vehicle.vLaengs * 3.6) }; }''')
        pruefe('Lenker-Bild gezeichnet (Anteil gefüllter Bildpunkte 15–70 %)', 0.15 < px['gefuellt'] < 0.7 and px['w'] > 100, f"{px['gefuellt']:.2f} {px['w']}x{px['h']}")

        # Schräglage -> Kamera-Kippung (angehalten, Pose ruhig)
        ev('() => { Rennspiel.spiel.pausiert = true; }'); page.wait_for_timeout(500)
        rr = ev('''() => { const s = Rennspiel.spiel, f = s.fahrzeuge[0], k = s.kameras[0], erg = {};
          for (const l of [0, 0.6, -0.6]) { f.motoZ.lean = l; k._erstesMal = true; k.update(0.0167); erg[l] = { z: k.kamera.rotation.z, y: k.kamera.position.y, x: k.kamera.position.x, zz: k.kamera.position.z }; }
          f.motoZ.lean = 0; k._erstesMal = true; k.update(0.0167); return erg; }''')
        dz = rr['0.6']['z'] - rr['0']['z']; dz2 = rr['-0.6']['z'] - rr['0']['z']
        pruefe('Kamera kippt mit der Schräglage um 50 %: Lean +0,6 → Roll +0,30, −0,6 → −0,30 (links positiv wie das Motorrad)', abs(dz - 0.3) < 0.01 and abs(dz2 + 0.3) < 0.01, f'{dz:.3f} / {dz2:.3f}')
        hh = ev('''() => { const s = Rennspiel.spiel, f = s.fahrzeuge[0], k = s.kameras[0], res = [];
          for (const l of [0, 0.3, 0.6, -0.5]) { f.motoZ.lean = l; Rennspiel.Moto.schraeglage.anwenden(f.mesh, f.motoZ, null); f.mesh.updateMatrixWorld(true); k._erstesMal = true; k.update(0.0167);
            const h = f.mesh.userData.lage.localToWorld(new THREE.Vector3(0, 1.64, -0.13)), c = k.kamera.position; const d = [c.x - h.x, c.y - h.y, c.z - h.z], hd = (s.kameras[0].quelle || s.kameras[0].ziel).heading, vor = [-Math.sin(hd), 0, -Math.cos(hd)], df = d[0] * vor[0] + d[2] * vor[2];
              res.push(+Math.sqrt(Math.max(0, d[0] * d[0] + d[1] * d[1] + d[2] * d[2] - df * df)).toFixed(3)); }
          f.motoZ.lean = 0; Rennspiel.Moto.schraeglage.anwenden(f.mesh, f.motoZ, null); return res; }''')
        pruefe('Kamera folgt dem Helm quer zur Fahrtrichtung, auch in Schräglage (Abstand ≤ 0,2 m bei Lean 0 / 0,3 / 0,6 / −0,5; vor dem Helmschirm)', all(d < 0.2 for d in hh), hh)

        # Spiegel-Kameras: echte Kameras im Spiel nach hinten-links / hinten-rechts
        for _ in range(2): ev('() => { __C.snap(); }');
        ev('() => { Rennspiel.spiel.pausiert = false; }'); page.wait_for_timeout(1500)
        ev('() => { Rennspiel.spiel.pausiert = true; }'); page.wait_for_timeout(300)
        ev('() => { Rennspiel.rueckspiegel.zuruecksetzen(); }'); page.wait_for_timeout(500)          # beide Spiegel neu aufnehmen
        kr = ev('''() => { const s = Rennspiel.spiel, f = s.fahrzeuge[0], q = s.kameras[0].quelle || s.kameras[0].ziel, hd = q.heading, ks = Rennspiel.Moto.cockpit.kameras(), erg = {};
          const hinten = [Math.sin(hd), Math.cos(hd)], links = [-Math.cos(hd), Math.sin(hd)];
          ks.forEach((k, m) => { const d = new THREE.Vector3(); k.getWorldDirection(d); const dot = (a) => d.x * a[0] + d.z * a[1];
            erg[m ? 'rechts' : 'links'] = { hinten: +dot(hinten).toFixed(3), links: +dot(links).toFixed(3), vorn: +(-dot(hinten)).toFixed(3),
              seitlich: +((k.position.x - q.x) * links[0] + (k.position.z - q.z) * links[1]).toFixed(2), y: +(k.position.y - q.y).toFixed(2) }; });
          return erg; }''')
        L, Rr = kr['links'], kr['rechts']
        pruefe('linke Spiegel-Kamera schaut nach hinten UND links, rechte nach hinten UND rechts (Vorzeichen, echte Kameras im Spiel)',
               L['hinten'] > 0.8 and L['links'] > 0.3 and Rr['hinten'] > 0.8 and Rr['links'] < -0.3, kr)
        pruefe('Spiegel-Kameras sitzen seitlich versetzt: links links der Mitte (+0,42 m), rechts rechts (−0,42 m), auf Spiegelhöhe', abs(L['seitlich'] - 0.42) < 0.05 and abs(Rr['seitlich'] + 0.42) < 0.05 and 1.0 < L['y'] < 1.6, f"{L['seitlich']} / {Rr['seitlich']} y {L['y']}")
        zs = ev('() => Rennspiel.Moto.cockpit.zustandSpiegel()')
        pruefe('Spiegelbilder (RenderTargets) für beide Spiegel angelegt, halbe Auflösung (144 px breit bei 1280×800)', zs['rt'][0] == [True, True] and zs['groesse'][0][0][0] == 144 and zs['groesse'][0][1][0] == 144, zs['groesse'][0])

        # Pixel in den Spiegeln: gezeichnet, und links ≠ rechts
        ev('() => { __C.snap(); }'); page.wait_for_timeout(500)
        rect = ev('''() => [...document.querySelectorAll('.cp-moto-spiegel')].map((e) => { const r = e.getBoundingClientRect(); return [Math.round(r.left + r.width * 0.2), Math.round(r.top + r.height * 0.25), Math.round(r.width * 0.6), Math.round(r.height * 0.5)]; })''')
        from PIL import Image
        import io
        png = page.screenshot(); im = Image.open(io.BytesIO(png)).convert('RGB')
        def stat(r):
            crop = im.crop((r[0], r[1], r[0] + r[2], r[1] + r[3])); px = list(crop.getdata()); n = len(px)
            mean = [sum(c[i] for c in px) / n for i in range(3)]; var = sum(sum((c[i] - mean[i]) ** 2 for i in range(3)) for c in px) / n
            return {'mean': [round(x) for x in mean], 'std': round(var ** 0.5, 1), 'hash': hash(crop.resize((12, 6)).tobytes()) }
        a, b = stat(rect[0]), stat(rect[1])
        pruefe('Spiegelbilder im Bild: beide mit Inhalt (Streuung > 8) und links ≠ rechts', a['std'] > 8 and b['std'] > 8 and a['hash'] != b['hash'], f"{a} {b}")

        # Eigener Mittelpunkt nicht verdeckt: Lenker unten, Spiegel nicht auf Minimap/Chips (HUD-Prüfung unten)
        ev('() => { Rennspiel.spiel.pausiert = false; }')

        # ---------------- Natürliche Kurve: Bild ----------------
        page.wait_for_function("() => { const f = Rennspiel.spiel.fahrzeuge[0]; return f.motoZ && Math.abs(f.motoZ.lean) > 0.25 && Rennspiel.spiel.zustand === 'rennen'; }", timeout=90000, polling=50)
        ev('() => { Rennspiel.spiel.pausiert = true; }'); page.wait_for_timeout(600)
        ev('() => { __C.leerCountdown(); __C.snap(); }'); page.wait_for_timeout(600)
        lean = ev('() => Rennspiel.spiel.fahrzeuge[0].motoZ.lean')
        bild(page, 'moto_cockpit.png', f'(Kurve, Schräglage {lean:.2f} rad = {lean*57.3:.0f}°)')
        pruefe('Bild moto_cockpit.png in einer Kurve aufgenommen (Schräglage ≥ 0,25 rad)', abs(lean) >= 0.25, f'{lean:.2f}')
        # Weiche Ränder: der Lenker-Canvas endet links/rechts nicht an einer harten Kante (Deckkraft am Rand ≈ 0, nach innen steigend)
        def kanten(nr=0):
            return ev("""(nr) => { const c = document.querySelectorAll('.cp-moto-lenker')[nr]; const g = c.getContext('2d'), w = c.width, h = c.height;
              const a = (x) => { const d = g.getImageData(x, 0, 1, h).data; let m = 0; for (let i = 3; i < d.length; i += 4) m = Math.max(m, d[i]); return m; };
              return { rand: [a(0), a(w - 1)], innen: [a(Math.round(w * 0.12)), a(Math.round(w * 0.88))], b: c.getBoundingClientRect().width }; }""", nr)
        k = kanten(0)
        pruefe('Lenker-Bild: Ränder laufen weich aus (Deckkraft ganz außen < 20, bei 12 % Breite voll sichtbar > 200)', max(k['rand']) < 20 and min(k['innen']) > 200, k)
        ev('() => { Rennspiel.spiel.pausiert = false; }')

        # ---------------- Draw-Calls ----------------
        ev('() => { Rennspiel.spiel.pausiert = true; __C.snap(); }'); page.wait_for_timeout(300)
        base = ev('() => __C.calls(true, 32)'); neu = ev('() => __C.calls(false, 32)')
        zuw = neu['calls'] / base['calls'] - 1
        pruefe(f"Draw-Calls solo, Cockpit: zwei Spiegel {neu['calls']:.1f} gegen einen Autorennen-Spiegel {base['calls']:.1f} je Bild: {zuw*100:+.1f} % (höchstens +20 %)", zuw <= 0.20, f"Dreiecke {neu['tri']:.0f} / {base['tri']:.0f}")
        ev('() => { Rennspiel.spiel.kameras.forEach((k) => { k.modusIndex = 0; }); __C.snap(); }')
        base2 = ev('() => __C.calls(true, 32)'); neu2 = ev('() => __C.calls(false, 32)')
        zuw2 = neu2['calls'] / base2['calls'] - 1
        pruefe(f"Draw-Calls solo, Verfolger: zwei Spiegel {neu2['calls']:.1f} gegen einen {base2['calls']:.1f}: {zuw2*100:+.1f} % (höchstens +20 %)", zuw2 <= 0.20)

        # ---------------- Verfolger / Weit ----------------
        ev('() => { Rennspiel.spiel.pausiert = false; __C.modus(0); }'); page.wait_for_timeout(900)
        ev('() => { Rennspiel.spiel.pausiert = true; __C.leerCountdown(); }'); page.wait_for_timeout(500)
        v = ev('''() => { const h = document.querySelector('.hud'), r = (e) => { const b = e.getBoundingClientRect(); return [b.left, b.top, b.right, b.bottom].map(Math.round); };
          const fr = [...h.querySelectorAll('.cp-moto-spiegel')], alt = Rennspiel.rueckspiegel.rechteck(window.innerWidth, window.innerHeight, false);
          return { modus: Rennspiel.spiel.kameras[0].modus, lenker: getComputedStyle(h.querySelector('.cp-moto-lenker')).display, frames: fr.map((e) => getComputedStyle(e).display), rects: fr.map(r), alt, alterTacho: getComputedStyle(h.querySelector('.hud-tacho')).display,
            chip: h.querySelector('.hud-platz').style.position, hinweis: h.querySelector('.hud-hinweis').style.bottom }; }''')
        innen = v['rects'][0][0] >= v['alt']['x'] - 8 and v['rects'][1][2] <= v['alt']['x'] + v['alt']['b'] + 8 and abs(v['rects'][0][1] - v['alt']['y']) <= 8
        pruefe('Verfolger-Ansicht: zwei Spiegel teilen sich den Platz des einen (oben Mitte), kein Lenker, alter Tacho da, Chip neben dem Spiegel', v['modus'] == 'verfolger' and v['lenker'] == 'none' and v['frames'] == ['block', 'block'] and innen and v['alterTacho'] != 'none' and v['chip'] == 'absolute', v)
        bild(page, 'moto_cockpit_verfolger.png', '(Verfolger-Ansicht: zwei Spiegel oben Mitte)')
        # Autorennen zeigt in einer Ansicht keinen Spiegel -> hier auch nicht
        ev("() => { Rennspiel.config.cockpit.spiegel.modi = ['cockpit']; }"); page.wait_for_timeout(500)
        v2 = ev('''() => ({ frames: [...document.querySelectorAll('.hud .cp-moto-spiegel')].map((e) => getComputedStyle(e).display), sichtbar: Rennspiel.rueckspiegel.sichtbar(Rennspiel.spiel, 0) })''')
        pruefe('Verfolger-Ansicht ohne Spiegel im Autorennen (config.cockpit.spiegel.modi = [cockpit]): auch hier keine Spiegel', v2['frames'] == ['none', 'none'] and v2['sichtbar'] is False, v2)
        ev("() => { Rennspiel.config.cockpit.spiegel.modi = ['cockpit', 'verfolger', 'weit']; __C.modus(2); }"); page.wait_for_timeout(600)
        w = ev('''() => ({ modus: Rennspiel.spiel.kameras[0].modus, frames: [...document.querySelectorAll('.hud .cp-moto-spiegel')].map((e) => getComputedStyle(e).display) })''')
        pruefe('Weit-Ansicht: zwei Spiegel wie im Autorennen (modi enthält weit)', w['modus'] == 'weit' and w['frames'] == ['block', 'block'], w)

        # ---------------- Touch ----------------
        ev("() => { document.documentElement.classList.add('t-rennen'); __C.modus(1); }"); page.wait_for_timeout(700)
        t = ev('''() => { const h = document.querySelector('.hud'); return { lenker: getComputedStyle(h.querySelector('.cp-moto-lenker')).display, frames: [...h.querySelectorAll('.cp-moto-spiegel')].map((e) => getComputedStyle(e).display), alterTacho: getComputedStyle(h.querySelector('.hud-tacho')).display }; }''')
        pruefe('Touch (Klasse t-rennen): kein Lenker-Bild, keine Spiegel, alter Tacho sichtbar (unten liegen die Touch-Knöpfe)', t['lenker'] == 'none' and t['frames'] == ['none', 'none'] and t['alterTacho'] != 'none', t)
        ev("() => { document.documentElement.classList.remove('t-rennen'); }"); page.wait_for_timeout(500)

        # ---------------- Purzelbaum: eigenes Motorrad im Solo-Cockpit weg ----------------
        ev('() => { __C.modus(1); Rennspiel.spiel.pausiert = true; }'); page.wait_for_timeout(500)
        pz = ev('''() => { const s = Rennspiel.spiel, f = s.fahrzeuge[0], r = s.renderer, orig = r.render.bind(r), sicht = []; const z = f.motoZ;
          const mal = (aktiv) => { z.purzel.aktiv = aktiv; z.purzel.t = 0.5; sicht.length = 0; r.render = function (sz, k) { if (r.getRenderTarget() === null) sicht.push(f.mesh.visible); return orig(sz, k); }; s.zeichnen(); r.render = orig; return sicht.slice(); };
          const normal = mal(false), tumble = mal(true); z.purzel.aktiv = false; z.purzel.t = 0; return { normal, tumble, danach: f.mesh.visible }; }''')
        pruefe('Purzelbaum im Solo-Cockpit: eigenes Motorrad für diese Zeit ausgeblendet, sonst sichtbar, danach wieder sichtbar', pz['normal'][0] is True and pz['tumble'][0] is False and pz['danach'] is True, pz)

        # ---------------- HUD ohne Überlappung ----------------
        def hud_pruefen(w, h, modus, name):
            page.set_viewport_size({'width': w, 'height': h}); page.wait_for_timeout(300)
            starte('wiese', modus=modus, autopilot=False)
            ev('''() => { const s = Rennspiel.spiel; s.pausiert = false; s.kameras.forEach((k) => { k.modusIndex = 1; }); __C.snap(); }''')
            # Unfall-HUD (Zustände, Mitte-Text) und Meldung zeigen
            ev('''() => { const s = Rennspiel.spiel; s.unfall.fz.forEach((u, i) => { if (!u) return; u.zustand = 62; u.gesundheit = 41; });
              s.fahrzeuge.forEach((f, i) => { if (f.istSpieler) { const u = s.unfall.fz[i]; u.zustand = 33; u.gesundheit = 70; u.halt = { art: 'werkstatt', t: 0, steht: true }; } });
              s._meldung(0, 'Bus-Sprung! +1.200', 20000); if (s.kameras.length > 1) s._meldung(1, 'Bus-Sprung! +1.200', 20000); }''')
            page.wait_for_timeout(700); ev('() => { __C.leerCountdown(); }'); page.wait_for_timeout(700); ev('() => { __C.snap(); }'); page.wait_for_timeout(500)
            ev('() => { __C.leerCountdown(); }')
            r = ev('() => __C.hudKollisionen()'); hk = ev('() => __C.hinweisKollision()')
            erwartet = 2 if modus == 'solo' else 4
            pruefe(f'HUD {name} {modus}, Cockpit: {r["elemente"]} Elemente ({r["spiegel"]} Spiegel, {r["lenker"]} Lenker), keine Überlappung (auch Hinweis „Festgefahren?“)', r['spiegel'] == erwartet and r['lenker'] == erwartet // 2 and not r['kollisionen'] and not hk, (r['kollisionen'] + hk)[:4])
            return r
        for (w, h, modus, name) in [(1280, 800, 'solo', '1280x800'), (1920, 1080, 'solo', '1920x1080'), (844, 390, 'solo', '844x390'), (1280, 800, 'zwei', '1280x800'), (844, 390, 'zwei', '844x390')]:
            hud_pruefen(w, h, modus, name)
        # Zweispieler: Draw-Calls und Bild
        page.set_viewport_size({'width': 1280, 'height': 800}); page.wait_for_timeout(300)
        starte('wiese', 'zwei')
        ev('''() => { const s = Rennspiel.spiel; s.pausiert = false; s.kameras.forEach((k) => { k.modusIndex = 1; }); __C.snap(); }''')
        page.wait_for_timeout(600)
        ev('() => { Rennspiel.spiel.pausiert = true; __C.snap(); }'); page.wait_for_timeout(400)
        base = ev('() => __C.calls(true, 32)'); neu = ev('() => __C.calls(false, 32)')
        zuw = neu['calls'] / base['calls'] - 1
        pruefe(f"Draw-Calls zu zweit, Cockpit: vier Spiegel {neu['calls']:.1f} gegen zwei Autorennen-Spiegel {base['calls']:.1f} je Bild: {zuw*100:+.1f} % (höchstens +20 %)", zuw <= 0.20, f"Dreiecke {neu['tri']:.0f} / {base['tri']:.0f}")
        zs = ev('() => Rennspiel.Moto.cockpit.zustandSpiegel()')
        pruefe('Zweispieler: Spiegelbild 115 px breit (0,8 × halbe Solo-Auflösung; vorher 72 px, im 115-px-Fenster zu grob)', zs['groesse'][0][0][0] == 115 and zs['groesse'][1][0][0] == 115, zs['groesse'])
        zr = ev("""() => { const s = Rennspiel.spiel; return [0, 1].map((i) => { const h = s.huds[i].el.getBoundingClientRect(); const sp = [...s.huds[i].el.parentElement.querySelectorAll('.cp-moto-spiegel')].map((e) => e.getBoundingClientRect()).filter((r) => r.left >= h.left - 1 && r.right <= h.right + 1 && r.width > 0); return sp.map((r) => [Math.round(r.width), Math.round(r.height)]); }); }""")
        pruefe('Zweispieler: Spiegel-Fenster je Seite mindestens 130 × 70 px (solo-Maß war 113 × 71 bei halber Breite)', all(len(x) == 2 and all(w >= 130 and h >= 70 for (w, h) in x) for x in zr), zr)
        # Bild zu zweit: beide fahren (Autopilot), warten bis eine Kurve
        ev('() => { Rennspiel.spiel.pausiert = false; }')
        try:
            page.wait_for_function("() => { const f = Rennspiel.spiel.fahrzeuge.filter((g) => g.istSpieler); return f.length === 2 && f.some((g) => g.motoZ && Math.abs(g.motoZ.lean) > 0.22) && Rennspiel.spiel.zustand === 'rennen'; }", timeout=90000, polling=50)
        except Exception as e:
            print('      (keine Kurve gefunden, Bild trotzdem)')
        ev('() => { Rennspiel.spiel.pausiert = true; }'); page.wait_for_timeout(600)
        ev('() => { __C.leerCountdown(); __C.snap(); }'); page.wait_for_timeout(600)
        bild(page, 'moto_cockpit_zwei.png', '(Zweispieler, beide im Cockpit)')
        for nr in (0, 1):
            k = kanten(nr)
            pruefe(f'Zweispieler, Lenker {nr}: Ränder weich und Ziffern groß genug (km/h-Ziffer ≥ 40 px hoch auf dem Bildschirm)', max(k['rand']) < 20 and min(k['innen']) > 200 and k['b'] / 1000 * 92 >= 40, k)
        ev('() => { Rennspiel.spiel.pausiert = false; }')

        pruefe('Motorrad.html: 0 JS-Fehler im ganzen Lauf', not fehler, '; '.join(fehler[:3]))

        # ---------------- Autorennen.html unberührt ----------------
        page2 = browser.new_page(viewport={'width': 1280, 'height': 800}); f2 = []
        page2.on('pageerror', lambda e: f2.append('pageerror: ' + str(e)))
        page2.on('console', lambda m: f2.append('console.error: ' + m.text) if m.type == 'error' else None)
        geladen = []
        page2.on('request', lambda r: geladen.append(r.url) if '/src/moto/' in r.url else None)
        page2.goto(basisurl + 'Autorennen.html'); page2.wait_for_timeout(1500)
        page2.evaluate("() => Rennspiel.spiel.rennenStarten({ modus: 'solo', streckeId: 'wiese', autoIds: ['porsche-911', 'multivan'], runden: 1, gegner: 3, schwierigkeit: 'mittel', fahrhilfe: ['wenig', 'wenig'] })"); page2.wait_for_timeout(1200)
        page2.evaluate("() => { Rennspiel.spiel.kameras[0].modusIndex = 1; }"); page2.wait_for_timeout(800)
        a = page2.evaluate('''() => ({ moto: !!window.Rennspiel.Moto, flag: window.MOTORRAD === true, lenker: document.querySelectorAll('.cp-moto-lenker, .cp-moto-spiegel').length, rahmen: getComputedStyle(document.querySelector('.hud-spiegel')).visibility,
          wischerModi: Rennspiel.config.cockpit.wischer.modi, vw: !!document.querySelector('.cp-tafel'), sichtbar: Rennspiel.rueckspiegel.sichtbar(Rennspiel.spiel, 0), modus: Rennspiel.spiel.kameras[0].modus })''')
        pruefe('Autorennen.html: 0 JS-Fehler, keine Moto-Datei, ein Spiegel wie bisher, Porsche-Cockpit da, Wischer-Config unverändert',
               not f2 and not geladen and not a['moto'] and not a['flag'] and a['lenker'] == 0 and a['rahmen'] == 'visible' and a['wischerModi'] == ['cockpit'] and a['vw'] and a['sichtbar'], f"{f2[:2]} {geladen[:2]} {a}")
        browser.close()
finally:
    server.terminate()

ok = sum(ergebnisse); print(f'\n{ok}/{len(ergebnisse)} Prüfungen bestanden')
sys.exit(0 if ok == len(ergebnisse) else 1)
