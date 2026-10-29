#!/usr/bin/env python3
"""FIX1 Browser-Messung/Bildfolgen (Playwright, Headless/SwiftShader):  python3 tests/fix1_browser.py [gleit|magnet|dino] [--auto] [--moto] [--bilder]
 gleit  : Anfahrt aus 150 m mit 30/60/90/120 km/h (+ langsam 15, schnell 150): Schirm-Zeitpunkt, Gleitdauer, Landung; Bilder tests/bilder_fix1/
 magnet : Tempo-Verlauf in der Röhre als Zahl (Gas gehalten / ohne Gas), Alpen (Steigung) + Wiese
 dino   : Dino wirft Goldstück, Wettrennen-Einblendung (Bilder)
Ausgabe: tests/bilder_fix1/."""
import os, sys, json, base64
from playwright.sync_api import sync_playwright

BASIS = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(BASIS, 'tests', 'bilder_fix1'); os.makedirs(OUT, exist_ok=True)
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
arg = lambda k: k in sys.argv
MODUS = next((a for a in sys.argv[1:] if a in ('gleit', 'magnet', 'dino')), 'gleit')
SPIELE = [s for s, f in (('Autorennen', '--auto'), ('Motorrad', '--moto')) if not ((arg('--auto') or arg('--moto')) and not arg(f))]
ok = fehl = 0
def pruefe(name, gut, info=''):
    global ok, fehl
    print(('OK   ' if gut else 'FEHL ') + name + (('  (' + str(info) + ')') if info != '' else ''), flush=True)
    if gut: ok += 1
    else: fehl += 1
SEED = "(() => { let a = 123456789; Math.random = () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; })();"

JS_HELFER = """() => {
  const R = Rennspiel, s = R.spiel;
  window.__P = null;
  const orig = s.input.steuerung.bind(s.input);
  s.input.steuerung = function (nr) {
    const P = window.__P; if (!P || nr !== 0) return orig(nr);
    const st = s.strecke, f = s.fahrzeuge[0], v = f.vehicle, sp = st.spline;
    const n = st.abfrage(v.x, v.z, f.index), vl = Math.max(3, v.vLaengs), L = Math.max(9, Math.min(50, 0.55 * vl + 8)), pt = sp.punktBei(n.s + L);
    const qq = window.__qf ? window.__qf(n) : P.q, zx = pt.x + pt.nx * qq, zz = pt.z + pt.nz * qq;
    let diff = R.headingAus(zx - v.x, zz - v.z) - v.heading;
    while (diff > Math.PI) diff -= 2 * Math.PI; while (diff < -Math.PI) diff += 2 * Math.PI;
    let lenkung = Math.max(-1, Math.min(1, -(2 * vl * Math.sin(diff) / Math.hypot(zx - v.x, zz - v.z)) / v.drehrateMax(vl)));
    if (P.lenkWert !== undefined && f.flug && f.flug.gleit) lenkung = P.lenkWert;
    if (P.ohneGas) return { gas: 0, bremse: 0, lenkung, trick: false };
    const vs = P.tempo ? st.tempoBei(n.s + vl * 0.3) * P.tempo : P.v;
    return { gas: v.vLaengs < vs ? 1 : 0, bremse: v.vLaengs > vs + 3 ? 0.5 : 0, lenkung, trick: false };
  };
  window.__tp = (s_, q, tempo, pilot) => {
    const st = s.strecke, f = s.fahrzeuge[0], v = f.vehicle, pt = st.spline.punktBei(s_), hd = R.headingAus(pt.tx, pt.tz);
    const x = pt.x + pt.nx * q, z = pt.z + pt.nz * q;
    v.setzen(x, z, hd); v.y = st.hoeheAn(x, z); f.index = -1; v.vLaengs = tempo;
    if (f.flug) { const o = f.flug; o.aktiv = false; o.gleit = null; o.schiene = null; o.pipe = null; if (o.z) { o.z.mag = null; o.z.magV = 0; } }
    if (s.rennen && s.rennen.verfolgungSetzen) s.rennen.verfolgungSetzen(0, x, z, s_);
    f.autopilot = null; window.__P = Object.assign({ q: q, v: tempo }, pilot || {}); s.pausiert = false;
    const k = s.kameras[0]; if (k) { k._motoStart = true; k.modusIndex = R.config.kamera.modi.indexOf('verfolger'); k._erstesMal = true; }
  };
  window.__zustand = () => {
    const st = s.strecke, f = s.fahrzeuge[0], v = f.vehicle, fz = f.flug || {}, z = fz.z || {}, n = f.nah || {};
    const fl = f.mesh && f.mesh.userData && f.mesh.userData.zFluegel;
    return { s: n.s, q: n.seitenabstand, v: v.vLaengs, y: fz.aktiv ? fz.y : v.y, x: v.x, z: v.z, gleit: !!fz.gleit, aktiv: !!fz.aktiv, mag: !!z.mag,
      fl: fl ? (fl.visible ? +fl.scale.x.toFixed(2) : 0) : -1, boden: st.hoeheAn(v.x, v.z), gt: fz.gleit ? fz.gleit.t : null, gT: fz.gleit ? fz.gleit.T : null, pz: s._physikZeit };
  };
  window.__frames = (n) => { const z0 = s.zeichnen; s.zeichnen = function () {}; for (let i = 0; i < n; i++) { window.__t += 1000 / 60; s._frameRumpf(window.__t); } s.zeichnen = z0; return window.__zustand(); };
  window.__bild = () => { document.getElementById('ui').style.display = 'none'; for (let i = 0; i < 4; i++) s.zeichnen(); document.getElementById('ui').style.display = ''; return { png: s.renderer.domElement.toDataURL('image/png') }; };
}"""

def oeffnen(p, spiel, fehler):
    b = p.chromium.launch(args=ARGS); ctx = b.new_context(viewport={'width': 960, 'height': 540}); ctx.add_init_script(SEED)
    pg = ctx.new_page()
    pg.on('pageerror', lambda e: fehler.append('pageerror: ' + str(e)))
    pg.on('console', lambda m: fehler.append('console.error: ' + m.text) if m.type == 'error' and 'GPU stall' not in m.text and 'WebGL' not in m.text and 'favicon' not in m.text else None)
    pg.goto('file://' + os.path.join(BASIS, spiel + '.html')); pg.wait_for_function('window.Rennspiel && Rennspiel.spiel'); pg.wait_for_timeout(1200)
    return b, pg

def starten(pg, moto, strecke, gegner=0):
    autos = ['crossmaschine', 'crossmaschine-rot'] if moto else ['porsche-911', 'multivan']
    pg.evaluate("""([a, st, gegner]) => { window.__t = 1000; performance.now = () => window.__t; Rennspiel.spiel.uhr.letzte = window.__t;
      Rennspiel.SpassZauber.anSetzen(true);
      Rennspiel.spiel.rennenStarten({ modus: 'solo', streckeId: st, autoIds: a, runden: 2, gegner: gegner, schwierigkeit: 'mittel', fahrhilfe: ['wenig', 'wenig'], tageszeit: 'tag', wetter: 'klar', spass: true });
      window.requestAnimationFrame = () => 0; }""", [autos, strecke, gegner])
    pg.wait_for_timeout(500)
    pg.evaluate("""() => { const s = Rennspiel.spiel, z0 = s.zeichnen; s.zeichnen = function () {}; let g = 0; window.__t = 5000; s.uhr.letzte = window.__t; s.uhr.rest = 0;
      while ((s.zustand !== 'rennen' || !s.rennen.gasErlaubt) && g++ < 1200) { window.__t += 1000 / 60; s._frameRumpf(window.__t); }
      s.zeichnen = z0; }""")
    pg.evaluate(JS_HELFER)

def bild(pg, pfad, voll=False):
    if voll:   # ganze Seite (Canvas + HUD + Einblendungen)
        pg.evaluate("() => { for (let i = 0; i < 4; i++) Rennspiel.spiel.zeichnen(); }"); pg.screenshot(path=pfad, timeout=120000); return
    d = pg.evaluate("window.__bild()")
    open(pfad, 'wb').write(base64.b64decode(d['png'].split(',')[1]))

def blatt(pfade, ziel, spalten=3):
    try:
        from PIL import Image
        bs = [Image.open(x) for x in pfade]
        w, h = bs[0].size; sw, sh = w * 2 // 3, h * 2 // 3
        zeilen = (len(bs) + spalten - 1) // spalten
        B = Image.new('RGB', (sw * spalten, sh * zeilen), (255, 0, 255))
        for k, im in enumerate(bs): B.paste(im.convert('RGB').resize((sw, sh)), ((k % spalten) * sw, (k // spalten) * sh))
        B.save(ziel)
    except Exception as e:
        print('Blatt-Fehler', e)

def gleit_lauf(pg, sch, kmh, extra=None, bilder=None, abstand=150, maxf=None):
    """Teleport 'abstand' m vor die Schlucht, Pilot hält Tempo. Misst je Bild; Rückgabe dict."""
    V = kmh / 3.6
    pg.evaluate("([a, q, v, p]) => __tp(a, q, v, p)", [sch['sT'] - abstand, 0, V, dict(extra or {}, v=V)])
    pg.evaluate("__frames(5)")
    maxf = maxf or int(abstand / max(V, 2) * 60) + 500
    r = dict(kmh=kmh, start=None, ende=None, fl1=None, flMax=0, yMax=0, vorLandung=None, nachLandung=None, verlauf=[], boden=None)
    gk = 0; sp = []
    for i in range(maxf):
        z = pg.evaluate("__frames(1)")
        if z['gleit'] and r['start'] is None:
            r['start'] = i; r['fl1'] = z['fl']; r['sAbsprung'] = z['s'] - sch['sT']
        if r['start'] is not None:
            r['flMax'] = max(r['flMax'], z['fl']); r['yMax'] = max(r['yMax'], z['y'] - z['boden'])
            if (i - r['start']) % 10 == 0: r['verlauf'].append((i - r['start'], round(z['gt'] or 0, 2), round(z['s'] - sch['sT'], 1), round(z['y'] - z['boden'], 2), z['fl'], round(z['v'] * 3.6)))
            if bilder is not None and bilder.get('n', 0) < len(bilder['zeiten']) and (i - r['start']) >= bilder['zeiten'][bilder['n']]:
                pfad = f"{OUT}/{bilder['pre']}_{bilder['n'] + 1}.png"; bild(pg, pfad); bilder['dateien'].append(pfad); bilder['n'] += 1
            if not z['gleit'] and r['ende'] is None:
                r['ende'] = i; r['nachLandung'] = round(z['v'] * 3.6, 1); r['sEnde'] = z['s'] - sch['sT']; r['qEnde'] = z['q']
                if bilder is not None:
                    pfad = f"{OUT}/{bilder['pre']}_land.png"; bild(pg, pfad); bilder['dateien'].append(pfad)
                for _ in range(60): z = pg.evaluate("__frames(1)")
                r['nach1s'] = z
                break
    r['dauer'] = None if r['ende'] is None or r['start'] is None else round((r['ende'] - r['start']) / 60, 2)
    return r

def lauf_gleit(p):
    for spiel in SPIELE:
        moto = spiel == 'Motorrad'; tag = spiel.lower()
        fehler = []
        b, pg = oeffnen(p, spiel, fehler)
        starten(pg, moto, 'mond')
        sch = pg.evaluate("() => { const e = Rennspiel.spiel.strecke.spass.zauber.schluchten[0]; return { sT: e.sT, sL: e.sL, halb: e.halb }; }")
        print(tag, 'Schlucht', sch, flush=True)
        for kmh in ([int(x) for x in os.environ["KMH"].split(",")] if os.environ.get("KMH") else (15, 30, 60, 90, 120, 150)):
            bi = dict(n=0, zeiten=[0, 6, 20, 45, 80], pre=f'{tag}_gleit_{kmh}', dateien=[]) if (arg('--bilder') and kmh in (60, 120)) else None
            r = gleit_lauf(pg, sch, kmh, bilder=bi)
            print(f"{tag} {kmh:3d} km/h: Gleitstart Bild {r['start']} (s ab sT {r.get('sAbsprung')}), Schirm im 1. Bild {r['fl1']}, Gleitdauer {r['dauer']} s, v nach Landung {r['nachLandung']}, Höhe max {r['yMax']:.2f}, Ende s {r.get('sEnde')}", flush=True)
            print('    Verlauf (Bild, s ab sT, Höhe, Schirm, km/h):', r['verlauf'][:12], flush=True)
            if bi and bi['dateien']: blatt(bi['dateien'], f"{OUT}/{bi['pre']}_blatt.png")
        print('Konsole:', fehler[:3])
        b.close()


def lauf_dino(p):
    for spiel in SPIELE:
        moto = spiel == 'Motorrad'; tag = spiel.lower()
        fehler = []
        b, pg = oeffnen(p, spiel, fehler)
        pg.evaluate("Rennspiel.SpassWeltenUI.einst().dino = 'immer'")
        starten(pg, moto, 'dino')
        pg.evaluate("([a, q, v, p]) => __tp(a, q, v, p)", [300, 0, 20, {'v': 20}])
        pg.evaluate("__frames(20)")
        pg.evaluate("""() => { const A = Rennspiel.spiel.dinoAuf; A.L.tGold = 0.3; A.L.tRennen = 99999;
          window.__qf = (n) => { const g = A.L.gold.find((x) => x.alter >= x.flug * 0.5 && Rennspiel.spiel.strecke.spline.differenzS(x.s, n.s) > 5); return g ? g.q : 0; };
          window.__dz = () => { const s = Rennspiel.spiel, A = s.dinoAuf, f = s.fahrzeuge[0], n = s.rennen.teilnehmer[0]; return { gold: A.L.gold.map(g => +g.alter.toFixed(2)), n: A.L.n, gesammelt: A.L.gesammelt, konto: Rennspiel.Garage.konto(n.name),
            hud: s.muenzen ? s.muenzen.anzahlVon(0) : null, rennen: A.L.rennen ? { t: +A.L.rennen.t.toFixed(1), vD: +A.L.rennen.vD.toFixed(1), sD: A.L.rennen.sD - A.L.rennen.s0 } : null, siege: A.L.siege, nied: A.L.niederlagen, tor: A.tor.visible, sieg: !!document.getElementById('dino-sieg'), leiste: !!(A.wett && A.wett.style.display !== 'none'), meshes: A.pool.filter(m => m.visible).length, dinoSicht: s.dinoBegleiter.gruppe.visible, v: f.vehicle.vLaengs, s: f.nah && f.nah.s, kasse0: window.__kasse0 }; };
          window.__kasse0 = Rennspiel.Garage.konto(Rennspiel.spiel.rennen.teilnehmer[0].name); }""")
        proto = []
        def schuss(name):
            pfad = f'{OUT}/{tag}_dino_{name}.png'; bild(pg, pfad, True); proto.append(pfad); return pfad
        # --- Gold wirft
        z = None
        for i in range(1500):
            z = pg.evaluate("__frames(1) && __dz()")
            if z['gold'] and z['gold'][0] >= 0.35: break
        pruefe(f'{tag} Dino wirft Goldstück (Bogenflug sichtbar)', bool(z['gold']) and z['meshes'] >= 1, z)
        pfade = [schuss('gold_1_flug')]
        for i in range(120):
            z = pg.evaluate("__frames(1) && __dz()")
            if z['gold'] and z['gold'][0] >= 1.3: break
        pfade.append(schuss('gold_2_liegt'))
        vor = z['konto']
        for i in range(500):
            z = pg.evaluate("__frames(1) && __dz()")
            if z['gesammelt'] >= 1: break
        pg.evaluate("__frames(2)"); pfade.append(schuss('gold_3_gesammelt'))
        for i in range(120): z = pg.evaluate("__frames(1) && __dz()")
        pruefe(f'{tag} Gold einsammeln: Kasse +1 je Stück, Zähler im Rennen', z['gesammelt'] >= 1 and z['konto'] - z['kasse0'] >= z['gesammelt'] and (z['hud'] is None or z['hud'] >= z['gesammelt']), f"gesammelt {z['gesammelt']}, Konto {z['kasse0']} -> {z['konto']}, HUD {z['hud']}")
        blatt(pfade, f'{OUT}/{tag}_dino_gold_blatt.png')
        # --- Wettrennen
        sNow = pg.evaluate("__dz()")['s']
        pg.evaluate("([a, q, v, p]) => __tp(a, q, v, p)", [330, 0, 24, {'v': 24, 'tempo': 0.9}])   # (Pilot nach dem Gold-Slalom zurück auf die Mittellinie, lavafreier Abschnitt)
        pg.evaluate("() => { const A = Rennspiel.spiel.dinoAuf; A.L.tGold = 99999; A.L.tRennen = 0.3; window.__qf = null; }")
        for i in range(2400):
            z = pg.evaluate("__frames(1) && __dz()")
            if z['rennen']: break
        pg.evaluate("__frames(18)"); z = pg.evaluate("__dz()")
        pruefe(f'{tag} Wettrennen: Dino ruft, Fahne + Leiste da', bool(z['rennen']) and z['tor'] and z['leiste'], z)
        pf2 = [schuss('wett_1_ruf')]
        for i in range(60): pg.evaluate("__frames(1)")
        pf2.append(schuss('wett_2_lauf'))
        # Fahne von der Seite (freie Kamera) und Dino mitten im Lauf
        spur = []
        for i in range(2000):
            z = pg.evaluate("__frames(1) && __dz()")
            if i % 60 == 0 and z['rennen']: spur.append((z['rennen']['t'], round(z['v'] * 3.6), round(z['rennen']['sD']), round(z['s']), pg.evaluate('() => { const s = Rennspiel.spiel, f = s.fahrzeuge[0]; return Math.round(s.strecke.tempoBei(f.nah.s) * 3.6) + (f.flug.aktiv ? "F" : "") + (f.vehicle.untergrund || "")[0]; }')))
            if not z['rennen'] or z['siege'] or z['nied']: break
            if z['rennen']['t'] > 6.0 and len(pf2) == 2: pf2.append(schuss('wett_3_spaet'))
        pg.evaluate("__frames(14)"); z = pg.evaluate("__dz()")
        print(f'{tag} Wettrennen-Verlauf (t s, Spieler km/h, Dino m):', spur, flush=True)
        pf2.append(schuss('wett_4_ergebnis'))
        pruefe(f'{tag} Wettrennen: Sieger-Einblendung', z['sieg'] and (z['siege'] + z['nied']) == 1, z)
        pruefe(f'{tag} Wettrennen: Spieler (Vollgas) schlägt den Dino -> Sticker', z['siege'] == 1, f"Siege {z['siege']}, Niederlagen {z['nied']}")
        blatt(pf2, f'{OUT}/{tag}_dino_wettrennen_blatt.png', 2)
        # Sticker gespeichert?
        st = pg.evaluate("Rennspiel.SpassSticker.hat(window.MOTORRAD === true ? 'motorrad' : 'auto', 'dinoSieg')")
        pruefe(f'{tag} Sticker „Dino geschlagen“ im Album', st is True)
        pruefe(f'{tag} keine Konsolenfehler', not fehler, fehler[:3])
        b.close()

with sync_playwright() as p:
    if MODUS == 'gleit': lauf_gleit(p)
    if MODUS == 'dino': lauf_dino(p)
    print(f'\n{ok} OK, {fehl} FEHL')
    sys.exit(1 if fehl else 0)
