#!/usr/bin/env python3
"""S6-Prüfung: Bildfolgen (Verfolger-Ansicht) für Halfpipe, Wallride, Grinden, Riese, Mini, Magnet-Röhre, Gleitschirm, Haustier.
python3 tests/s6_pruef_browser.py [--auto] [--moto] [--normal] [--ultra] [--nur element]
Auto + Motorrad × Normal + Ultra. Fahrzeug wird per Teleport vor das Element gesetzt, Eingaben per Pilot (Test-Hook auf input.steuerung) geskriptet.
Ausgabe: tests/bilder_s6_pruef/<spiel>_<grafik>_<element>_<n>_<name>.png + Blätter <..>_blatt.png + Zustandsprotokoll (konsole/pose); Exit 1 bei Fehlern."""
import os, sys, json, base64
from playwright.sync_api import sync_playwright

BASIS = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(BASIS, 'tests', 'bilder_s6_pruef'); os.makedirs(OUT, exist_ok=True)
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
arg = lambda k: k in sys.argv
nur = sys.argv[sys.argv.index('--nur') + 1] if arg('--nur') else None
SPIELE = [s for s, f in (('Autorennen', '--auto'), ('Motorrad', '--moto')) if not ((arg('--auto') or arg('--moto')) and not arg(f))]
GRAFIK = [g for g, f in (('normal', '--normal'), ('ultra', '--ultra')) if not ((arg('--normal') or arg('--ultra')) and not arg(f))]
ok = fehl = 0
def pruefe(name, gut, info=''):
    global ok, fehl
    print(('OK   ' if gut else 'FEHL ') + name + (('  (' + str(info) + ')') if info != '' else ''), flush=True)
    if gut: ok += 1
    else: fehl += 1
SEED = "(() => { let a = 123456789; Math.random = () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; })();"

# ---- Seite: Pilot, Teleport, Schritt, Bild
JS_HELFER = """() => {
  const R = Rennspiel, s = R.spiel;
  window.__P = null;
  const orig = s.input.steuerung.bind(s.input);
  s.input.steuerung = function (nr) {
    const P = window.__P; if (!P || nr !== 0) return orig(nr);
    const st = s.strecke, f = s.fahrzeuge[0], v = f.vehicle, sp = st.spline;
    const n = st.abfrage(v.x, v.z, f.index), vl = Math.max(3, v.vLaengs), L = Math.max(9, Math.min(50, 0.55 * vl + 8)), pt = sp.punktBei(n.s + L);
    let q = typeof P.q === 'function' ? P.q(n) : P.q; const zx = pt.x + pt.nx * q, zz = pt.z + pt.nz * q;
    let diff = R.headingAus(zx - v.x, zz - v.z) - v.heading;
    while (diff > Math.PI) diff -= 2 * Math.PI; while (diff < -Math.PI) diff += 2 * Math.PI;
    let lenkung = Math.max(-1, Math.min(1, -(2 * vl * Math.sin(diff) / Math.hypot(zx - v.x, zz - v.z)) / v.drehrateMax(vl)));
    if (P.lenk && n && sp.differenzS(n.s, P.lenk.s0) > P.lenk.von && sp.differenzS(n.s, P.lenk.s0) < P.lenk.bis) lenkung = P.lenk.wert;
    return { gas: v.vLaengs < P.v ? 1 : 0, bremse: v.vLaengs > P.v + 3 ? 0.5 : 0, lenkung, trick: false };
  };
  window.__tp = (s_, q, tempo, pilot, extra) => {
    const st = s.strecke, f = s.fahrzeuge[0], v = f.vehicle, pt = st.spline.punktBei(s_), hd = R.headingAus(pt.tx, pt.tz);
    const x = pt.x + pt.nx * q, z = pt.z + pt.nz * q;
    v.setzen(x, z, hd); v.y = st.hoeheAn(x, z); f.index = -1; v.vLaengs = tempo;
    if (f.flug) { const o = f.flug; o.aktiv = false; o.gleit = null; o.schiene = null; o.pipe = null; if (o.z) { o.z.mag = null; o.z.riese = 0; o.z.mini = 0; if (o.z.groesse !== 1 && R.SpassZauber) { o.z.groesse = 1; if (o.z.orig) { v.daten.laenge = o.z.orig.laenge; v.daten.breite = o.z.orig.breite; o.z.orig = null; } } } }
    if (s.rennen && s.rennen.verfolgungSetzen) s.rennen.verfolgungSetzen(0, x, z, s_);
    f.autopilot = null; window.__P = Object.assign({ q: q, v: tempo }, pilot || {}); s.pausiert = false;
    window.__kam = pilot && pilot.kam !== undefined ? pilot.kam : 'verfolger';
    const k = s.kameras[0]; if (k) { k._motoStart = true; k.modusIndex = R.config.kamera.modi.indexOf(window.__kam); k._erstesMal = true; }
    if (extra === 'mini') R.SpassZauber.wirkungSetzen(f, 'mini', 0);
  };
  window.__zustand = () => {
    const st = s.strecke, f = s.fahrzeuge[0], v = f.vehicle, fz = f.flug || {}, z = fz.z || {}, n = f.nah || {};
    const luft = !!fz.aktiv && !fz.pipe && !fz.gleit && !fz.schiene;
    return { s: n.s, q: n.seitenabstand, v: v.vLaengs, y: fz.aktiv ? fz.y : v.y, vy: fz.vy, x: v.x, z: v.z,
      grind: !!(fz.schiene && fz.schiene.art === 'schiene'), wand: !!(fz.schiene && fz.schiene.art === 'wand'), gleit: !!fz.gleit, pipe: !!fz.pipe, mag: !!z.mag, luft, fall: luft && fz.vy < 0,
      riese: z.riese > 0, mini: z.mini > 0, groesse: z.groesse || 1, punkte: z.punkte, phi: fz.pipe ? fz.pipe.phi : null, hoch: z.pipeMax || 0 };
  };
  window.__frames = (n) => { const z0 = s.zeichnen; s.zeichnen = function () {}; for (let i = 0; i < n; i++) { window.__t += 1000 / 60; s._frameRumpf(window.__t); } s.zeichnen = z0; return window.__zustand(); };
  window.__frei = (pos, blick) => { const k = s.kameras[0].kamera, p0 = k.position.clone(), q0 = k.quaternion.clone(); document.getElementById('ui').style.display = 'none';
    k.position.set(pos[0], pos[1], pos[2]); k.lookAt(blick[0], blick[1], blick[2]); k.updateMatrixWorld(true); s.szene.updateMatrixWorld(); s.renderer.setScissorTest(false); s.renderer.setViewport(0, 0, window.innerWidth, window.innerHeight); s.renderer.render(s.szene, k);
    const png = s.renderer.domElement.toDataURL('image/png'); k.position.copy(p0); k.quaternion.copy(q0); k.updateMatrixWorld(true); return { png, calls: s.renderer.info.render.calls }; };
  window.__bild = () => { document.getElementById('ui').style.display = 'none'; for (let i = 0; i < 4; i++) s.zeichnen(); return { png: s.renderer.domElement.toDataURL('image/png'), calls: s.renderer.info.render.calls }; };
}"""

def oeffnen(p, spiel, grafik, fehler):
    moto = spiel == 'Motorrad'
    b = p.chromium.launch(args=ARGS); ctx = b.new_context(viewport={'width': 960, 'height': 540}); ctx.add_init_script(SEED)
    ctx.add_init_script("try { localStorage.setItem('%s', '%s'); } catch (e) {}" % ('motorrad.grafik.v1' if moto else 'rennspiel.grafik.v1', grafik))
    pg = ctx.new_page()
    pg.on('pageerror', lambda e: fehler.append('pageerror: ' + str(e)))
    pg.on('console', lambda m: fehler.append('console.error: ' + m.text) if m.type == 'error' and 'GPU stall' not in m.text and 'WebGL' not in m.text and 'favicon' not in m.text else None)
    pg.goto('file://' + os.path.join(BASIS, spiel + '.html')); pg.wait_for_function('window.Rennspiel && Rennspiel.spiel'); pg.wait_for_timeout(1200)
    return b, pg

def starten(pg, moto, strecke, park=False, menge='normal', gegner=3):
    autos = ['crossmaschine', 'crossmaschine-rot'] if moto else ['porsche-911', 'multivan']
    pg.evaluate("""([a, st, park, menge, gegner]) => { window.__t = 1000; performance.now = () => window.__t; Rennspiel.spiel.uhr.letzte = window.__t;
      Rennspiel.SpassZauber.anSetzen(true);
      Rennspiel.spiel.rennenStarten({ modus: 'solo', streckeId: st, autoIds: a, runden: 2, gegner: gegner, schwierigkeit: 'mittel', fahrhilfe: ['wenig', 'wenig'], tageszeit: 'tag', wetter: 'klar', spass: true, stuntpark: park, hindernisMenge: menge });
      window.requestAnimationFrame = () => 0; }""", [autos, strecke, park, menge, gegner])
    pg.wait_for_timeout(500)
    pg.evaluate("""() => { const s = Rennspiel.spiel, z0 = s.zeichnen; s.zeichnen = function () {}; let g = 0; window.__t = 5000; s.uhr.letzte = window.__t; s.uhr.rest = 0;
      while ((s.zustand !== 'rennen' || !s.rennen.gasErlaubt) && g++ < 1200) { window.__t += 1000 / 60; s._frameRumpf(window.__t); }
      s.zeichnen = z0; }""")
    pg.evaluate(JS_HELFER)

def sichern(pg, pre, nr, name, calls_log):
    d = pg.evaluate("window.__bild()")
    pfad = f'{OUT}/{pre}_{nr}_{name}.png'
    open(pfad, 'wb').write(base64.b64decode(d['png'].split(',')[1]))
    calls_log.append(d['calls'])
    return pfad

def folge(pg, pre, tp, pilot, schritte, maxf=420, extra=None):
    """tp = (s, q, tempo). schritte = [(name, schluessel|None, verzoegerung)]: Bild, sobald Zustand[schluessel] erstmals wahr (None: bei Frame 'verzoegerung') + Verzögerung (Frames).
    Rückgabe: (dateien, Zustandsliste, Setzprotokoll)"""
    pg.evaluate("([a, p, e]) => __tp(a[0], a[1], a[2], p, e)", [list(tp), pilot, extra])
    erst = {}; dateien = []; log = []; fertig = set(); calls = []
    zust = pg.evaluate("__frames(30)")
    for i in range(maxf):
        zust = pg.evaluate("__frames(1)")
        for k in ('grind', 'wand', 'gleit', 'pipe', 'mag', 'luft', 'fall', 'riese', 'mini'):
            if zust[k] and k not in erst: erst[k] = i
        for j, (name, key, dz) in enumerate(schritte):
            if j in fertig: continue
            if key is None: gut = i >= dz
            else: gut = key in erst and i >= erst[key] + dz
            if gut:
                fertig.add(j); dateien.append((name, sichern(pg, pre, len(dateien) + 1, name, calls)))
                log.append(dict(name=name, i=i, **{k: (round(v, 2) if isinstance(v, float) else v) for k, v in zust.items() if v is not None}))
        if len(fertig) == len(schritte): break
    return dateien, log, erst, calls

def blatt(dateien, ziel):
    try:
        from PIL import Image
        bs = [Image.open(p) for _, p in dateien]
        if not bs: return
        w, h = bs[0].size; sw, sh = w * 2 // 3, h * 2 // 3; sp = 2
        zeilen = (len(bs) + 1) // 2
        B = Image.new('RGB', (sw * 2, sh * zeilen), (255, 0, 255))
        for k, im in enumerate(bs): B.paste(im.convert('RGB').resize((sw, sh)), ((k % 2) * sw, (k // 2) * sh))
        B.save(ziel)
    except Exception as e:
        print('Blatt-Fehler', e)

def farbpruefung(dateien):
    """Anteil fast reinschwarz / fast reinweiß (Fläche) pro Bild – Warnung ab 30 %."""
    try:
        from PIL import Image
        out = []
        for name, p in dateien:
            im = Image.open(p).convert('L'); px = im.getdata(); n = len(px)
            sc = sum(1 for v in px if v < 6) / n; we = sum(1 for v in px if v > 250) / n
            out.append((name, round(sc, 3), round(we, 3)))
        return out
    except Exception as e:
        return []

def gruppe(p, spiel, grafik, ergebnisse):
    moto = spiel == 'Motorrad'; tag = f'{spiel.lower()}_{grafik}'
    fehler = []
    def lauf(element, tp, pilot, schritte, **kw):
        if nur and not element.startswith(nur): return None
        pre = f'{tag}_{element}'
        d, log, erst, calls = folge(pg, pre, tp, pilot, schritte, **kw)
        blatt(d, f'{OUT}/{pre}_blatt.png')
        ergebnisse[pre] = dict(dateien=[os.path.basename(x[1]) for x in d], log=log, erst=erst, farbe=farbpruefung(d))
        print('     ', pre, json.dumps(erst), [c for c in calls][:3], flush=True)
        return d, log, erst
    # ---------------- Wiese: Grinden, Wallride, Riese, Magnet, Gleiten, Haustier
    b, pg = oeffnen(p, spiel, grafik, fehler)
    starten(pg, moto, 'wiese')
    info = pg.evaluate("""() => { const st = Rennspiel.spiel.strecke, z = st.spass.zauber; return { schienen: z.schienen.map(e => Object.assign({}, e)), extras: z.extras.map(e => ({ s: st.spline.naechster(e.x, e.z).s, q: e.q, art: e.art })), magnet: z.magnet.map(e => ({ s0: e.s0, laenge: e.laenge })), schlucht: z.schluchten.map(e => ({ sT: e.sT, sL: e.sL })), name: Rennspiel.spiel.rennen.teilnehmer[0].name }; }""")
    # Grinden
    e = next(x for x in info['schienen'] if x['art'] == 'schiene')
    r = lauf('grind', (e['s0'] - 40, e['q'], 24), {'q': e['q'], 'v': 24}, [('vor', None, 24), ('ein', 'grind', 6), ('mitte', 'grind', 50), ('spaet', 'grind', 95)])
    if r: pruefe(f'{tag} Grinden: Fahrzeug fängt sich auf der Schiene', 'grind' in r[2], r[2])
    # Wallride
    e = next(x for x in info['schienen'] if x['art'] == 'wand')
    q0 = e['side'] * (e['halb'] - 0.8)
    r = lauf('wand', (e['s0'] - 40, q0, 24), {'q': q0, 'v': 24, 'lenk': {'s0': e['s0'], 'von': -3, 'bis': 3, 'wert': e['side'] * 0.8}}, [('vor', None, 24), ('ein', 'wand', 6), ('mitte', 'wand', 40), ('spaet', 'wand', 75)])
    if r: pruefe(f'{tag} Wallride: Fahrzeug fährt an der Wand', 'wand' in r[2], r[2])
    # Riese: Kugel einsammeln, dann andere daneben
    e = next(x for x in info['extras'] if x['art'] == 'riese')
    if not nur or nur == 'riese':
        pg.evaluate("""() => { const s = Rennspiel.spiel; window.__RIESE = s.fahrzeuge.length; }""")
        # Gegner direkt neben den Spieler stellen, sobald er Riese wird (JS-Hook im Rahmen von __frames)
        pg.evaluate("""() => { const s = Rennspiel.spiel, R = Rennspiel; const fr = window.__frames; window.__frames = (n) => { for (let i = 0; i < n; i++) { const z = fr(1);
            const f = s.fahrzeuge[0], fz = f.flug && f.flug.z;
            if (fz && fz.riese > 0 && !window.__nachbarn) { window.__nachbarn = true; const st = s.strecke, pt = st.spline.punktBei(z.s + 4);
              [1, 2].forEach((k, j) => { const o = s.fahrzeuge[k]; if (!o) return; const qq = (z.q || 0) + (j ? -2.4 : 2.4), x = pt.x + pt.nx * qq, zz = pt.z + pt.nz * qq; o.vehicle.setzen(x, zz, R.headingAus(pt.tx, pt.tz)); o.vehicle.y = st.hoeheAn(x, zz); o.vehicle.vLaengs = z.v; o.index = -1; });
            }
            if (i === n - 1) return z; } return window.__zustand(); }; window.__nachbarn = false; }""")
    r = lauf('riese', (e['s'] - 30, e['q'], 20), {'q': e['q'], 'v': 20}, [('vor', None, 25), ('ein', 'riese', 4), ('schieben', 'riese', 22), ('lauf', 'riese', 60)])
    if r: pruefe(f'{tag} Riese: Kugel wirkt (Größe > 1)', 'riese' in r[2] and r[1] and max(l.get('groesse', 1) for l in r[1]) > 1.5, r[2])
    pg.evaluate("() => { window.__nachbarn = false; }")
    # Magnet
    m = info['magnet'][0] if info['magnet'] else None
    if m:
        r = lauf('magnet', (m['s0'] - 25, 0, 25), {'q': 0, 'v': 25}, [('vor', None, 20), ('wand', 'mag', 40), ('decke', 'mag', 85), ('runter', 'mag', 135)])
        if r: pruefe(f'{tag} Magnet-Röhre: haftet', 'mag' in r[2], r[2])
    # Gleitschirm / Flügel
    sc = info['schlucht'][0]
    r = lauf('gleit', (sc['sT'] - 60, 0, 30), {'q': 0, 'v': 30}, [('vor', None, 30), ('ab', 'gleit', 4), ('flug', 'gleit', 30), ('flug2', 'gleit', 55), ('land', 'gleit', 90)])
    if r: pruefe(f'{tag} Gleitschirm/Flügel: klappt aus', 'gleit' in r[2], r[2])
    # Haustier beim Sprung (Gleiten)
    pg.evaluate("([n]) => { const F = Rennspiel.SpassZauberFigur; F.setzen(n, 'pet', 'hund'); }", [info['name']])
    pg.evaluate("() => __frames(10)")
    r = lauf('haustier', (sc['sT'] - 60, 0, 30), {'q': 0, 'v': 30}, [('rollt', None, 30), ('absprung', 'gleit', 3), ('hupf', 'gleit', 14), ('flug', 'gleit', 40)])
    if r: pruefe(f'{tag} Haustier: Sprung erreicht', 'gleit' in r[2], r[2])
    pruefe(f'{tag} (Wiese): keine Konsolenfehler', not fehler, fehler[:3])
    b.close()
    # ---------------- Wald: Mini unter Hindernissen
    if not nur or nur == 'mini':
        fehler2 = []
        b, pg = oeffnen(p, spiel, grafik, fehler2)
        starten(pg, moto, 'wald', menge='sehrViele')
        ast = pg.evaluate("""() => { const st = Rennspiel.spiel.strecke; return st.hindernisse.filter(h => h.typ === 'ast').map(h => ({ s: h.s, q: h.seitenabstand, typ: h.typ })); }""")
        zielast = ast[3] if len(ast) > 3 else ast[0]
        lauf('mini', (zielast['s'] - 45, zielast['q'], 22), {'q': zielast['q'], 'v': 22}, [('vor', None, 40), ('naeher', None, 70), ('drunter', None, 92), ('danach', None, 120)], extra='mini')
        pruefe(f'{tag} Mini (Wald): keine Konsolenfehler', not fehler2, fehler2[:3])
        b.close()
    # ---------------- Halfpipe (nur Motorrad, Stunt-Park)
    if moto and (not nur or nur.startswith('halfpipe')):
        fehler3 = []
        b, pg = oeffnen(p, spiel, grafik, fehler3)
        starten(pg, moto, 'stuntpark', park=True, gegner=0)
        pipe = pg.evaluate("() => { const e = Rennspiel.spiel.strecke.spass.zauber.pipe; return e ? { s0: e.s0, s1: e.s1, qF: e.qF, r: e.r } : null; }")
        pruefe(f'{tag} Halfpipe: im Stunt-Park geplant', bool(pipe), pipe)
        if pipe:
            qz = pipe['qF'] + 3.0
            lenkQ = "(n) => (Math.abs(n.seitenabstand) > 0 ? 0 : 0)"
            r = lauf('halfpipe', (pipe['s0'] - 30, 0, 20), {'q': qz, 'v': 20}, [('vor', None, 40), ('hoch', 'pipe', 8), ('hoch2', 'pipe', 30), ('luft', 'luft', 6), ('luft2', 'luft', 22), ('runter', 'fall', 6), ('landung', 'fall', 30)], maxf=520)
            lauf('halfpipe_weit', (pipe['s0'] - 30, 0, 20), {'q': qz, 'v': 20, 'kam': 'weit'}, [('vor', None, 50), ('hoch', 'pipe', 6), ('luft', 'luft', 10), ('luft2', 'luft', 45), ('runter', 'fall', 12), ('landung', 'fall', 40)], maxf=520)
            # Überblick von außen (freie Kamera): Form der Banken, Rand, Schild; Fahrzeug steht unten in der Pipe
            if not nur or nur.startswith('halfpipe'):
                pg.evaluate("([a, p, e]) => __tp(a[0], a[1], a[2], p, e)", [[pipe['s0'] + 36, 0, 0.5], {'q': 0, 'v': 0}, None]); pg.evaluate("__frames(40)")
                ansichten = pg.evaluate("""([s0, s1]) => { const sp = Rennspiel.spiel.strecke.spline, m = sp.punktBei((s0 + s1) / 2), a = sp.punktBei(s0 - 25), b = sp.punktBei(s1 + 25), y = Rennspiel.spiel.strecke.hoeheAn(m.x, m.z);
                  return { m: [m.x, y, m.z], n: [m.nx, m.nz], a: [a.x, a.z], b: [b.x, b.z] }; }""", [pipe['s0'], pipe['s1']])
                mx, my, mz = ansichten['m']; nx, nz = ansichten['n']; ax, az = ansichten['a']
                sichten = [('seite', [mx + nx * 34, my + 12, mz + nz * 34], [mx, my + 2, mz]), ('laengs', [ax, my + 6, az], [mx, my + 1, mz]), ('schraeg', [mx + nx * 22 + (ax - mx) * 0.55, my + 15, mz + nz * 22 + (az - mz) * 0.55], [mx, my + 1, mz])]
                dd = []
                for k, (name, pos, bl) in enumerate(sichten):
                    d = pg.evaluate("([p, b]) => __frei(p, b)", [pos, bl]); pfad = f'{OUT}/{tag}_halfpipe_aussen_{k + 1}_{name}.png'
                    open(pfad, 'wb').write(base64.b64decode(d['png'].split(',')[1])); dd.append((name, pfad))
                blatt(dd, f'{OUT}/{tag}_halfpipe_aussen_blatt.png'); ergebnisse[f'{tag}_halfpipe_aussen'] = dict(dateien=[os.path.basename(x[1]) for x in dd], farbe=farbpruefung(dd))
            if r: pruefe(f'{tag} Halfpipe: Fahrzeug fährt hoch, hebt ab', 'pipe' in r[2] and 'luft' in r[2], r[2])
        pruefe(f'{tag} Halfpipe: keine Konsolenfehler', not fehler3, fehler3[:3])
        b.close()

with sync_playwright() as p:
    ergebnisse = {}
    for spiel in SPIELE:
        for grafik in GRAFIK:
            gruppe(p, spiel, grafik, ergebnisse)
    json.dump(ergebnisse, open(f'{OUT}/protokoll_{"_".join(x.lower() for x in SPIELE)}_{"_".join(GRAFIK)}{"_" + nur if nur else ""}.json', 'w'), indent=1)
    print(f'\n{ok} OK, {fehl} FEHL')
    sys.exit(1 if fehl else 0)
