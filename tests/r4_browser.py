#!/usr/bin/env python3
"""R4 Browser-Prüfung + Bilder (Playwright, Headless/SwiftShader): python3 tests/r4_browser.py [--nur menue|arena|pipe|magnet]
Nur Autorennen. Bilder nach tests/bilder_r4/:
  menue_modus_1100x650.png   Schritt „Modus“ mit der Karte „🎪 Stunt-Arena“
  menue_start_1100x650.png   Schritt „Los!“ (Arena-Hinweis) bzw. Schalterzeile mit „✨ Fahr-Zauber“ und „🌀 Loopings“ (Normalstrecke)
  arena_karte.png            Draufsicht auf die ganze Arena (Stadion, Schanzen, Halfpipe)
  arena_start.png            Verfolgerkamera am Start
  pipe_wand_*.png            Auto in der Halfpipe an der Wand (Verfolger) und oben an der Kante
  pipe_luft.png              Auto in der Luft über der Halfpipe
  fantasie_magnet_*.png      Fantasie mit „🌀 Loopings: Magnet-Röhre“ (Einfahrt, Wand, Decke)
Jeder Konsolenfehler = FEHL. Einzeln laufen lassen (CPU-schonend), großzügige Timeouts."""
import os, sys, json, base64
from playwright.sync_api import sync_playwright

BASIS = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(BASIS, 'tests', 'bilder_r4'); os.makedirs(OUT, exist_ok=True)
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
nur = sys.argv[sys.argv.index('--nur') + 1] if '--nur' in sys.argv else None
ok = fehl = 0
def pruefe(name, gut, info=''):
    global ok, fehl
    print(('OK   ' if gut else 'FEHL ') + name + (('  (' + str(info) + ')') if info != '' else ''), flush=True)
    if gut: ok += 1
    else: fehl += 1
SEED = "(() => { let a = 123456789; Math.random = () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; })();"
FEHLER = []

def neue_seite(p, w, h):
    b = p.chromium.launch(args=ARGS); ctx = b.new_context(viewport={'width': w, 'height': h}); ctx.add_init_script(SEED)
    pg = ctx.new_page(); pg.set_default_timeout(180000); FEHLER.clear()
    pg.on('pageerror', lambda e: FEHLER.append('pageerror: ' + str(e)))
    pg.on('console', lambda m: FEHLER.append('console.error: ' + m.text) if m.type == 'error' and 'GPU stall' not in m.text and 'WebGL' not in m.text and 'favicon' not in m.text else None)
    pg.goto('file://' + os.path.join(BASIS, 'Autorennen.html')); pg.wait_for_function('window.Rennspiel && Rennspiel.spiel'); pg.wait_for_timeout(2500)
    return b, pg

def shot(pg, name):
    pg.screenshot(path=os.path.join(OUT, name))

def uhr_anhalten(pg):
    pg.evaluate("() => { window.__t = 1000; performance.now = () => window.__t; Rennspiel.spiel.uhr.letzte = window.__t; window.requestAnimationFrame = () => 0; }")

def bis_start(pg):
    pg.evaluate("""() => { const s = Rennspiel.spiel, z0 = s.zeichnen; s.zeichnen = function () {}; let g = 0; window.__t = 5000; s.uhr.letzte = window.__t; s.uhr.rest = 0;
      while ((s.zustand !== 'rennen' || !s.rennen.gasErlaubt) && g++ < 1500) { window.__t += 1000 / 60; s._frameRumpf(window.__t); }
      s.zeichnen = z0; }""")

def frames(pg, n):
    pg.evaluate("""(n) => { const s = Rennspiel.spiel, z0 = s.zeichnen; s.zeichnen = function () {}; for (let i = 0; i < n; i++) { window.__t += 1000 / 60; s._frameRumpf(window.__t); } s.zeichnen = z0; }""", n)

def bild(pg, name, ui_weg=True):
    d = pg.evaluate("""([weg]) => { const s = Rennspiel.spiel, r = s.renderer; if (weg) { const u = document.getElementById('ui'); if (u) u.style.display = 'none'; }
      for (let i = 0; i < 4; i++) s.zeichnen(); return r.domElement.toDataURL('image/png'); }""", [ui_weg])
    open(os.path.join(OUT, name), 'wb').write(base64.b64decode(d.split(',')[1]))

# ------------------------------------------------------------ Menü 1100×650
def menue(p):
    b, pg = neue_seite(p, 1100, 650)
    pg.evaluate("() => { Rennspiel.spiel.menue.zeigen(0); }"); pg.wait_for_timeout(800)
    shot(pg, 'menue_modus_1100x650.png')
    pg.evaluate("() => { const i = document.querySelector('.m-inhalt'); if (i) i.scrollTop = i.scrollHeight; }"); pg.wait_for_timeout(300)
    shot(pg, 'menue_modus_1100x650_unten.png')
    karte = pg.evaluate("() => !!document.querySelector('[data-a=\"spassmodus:arena\"]')")
    pruefe('Menü: Karte „Stunt-Arena“ im Modus-Schritt', karte)
    pg.evaluate("() => { const i = document.querySelector('.m-inhalt'); if (i) i.scrollTop = 0; }"); pg.wait_for_timeout(200)
    sichtbar = pg.evaluate("""() => { const e = document.querySelector('[data-a="spassmodus:arena"]'); if (!e) return null; const r = e.getBoundingClientRect(), i = e.closest('.m-inhalt').getBoundingClientRect(); return { oben: Math.round(r.top), unten: Math.round(r.bottom), inhaltUnten: Math.round(i.bottom), ganz: r.top >= i.top && r.bottom <= i.bottom }; }""")
    pruefe('Menü 1100×650: Arena-Karte ohne Scrollen ganz im sichtbaren Bereich (R4-FIX: flachere Modus-Karten)', bool(sichtbar and sichtbar['ganz']), sichtbar)
    # Normalstrecke: Schalter Fahr-Zauber / Loopings (Schritt „Los!“)
    pg.evaluate("() => { const m = Rennspiel.spiel.menue; m.e.spassModus = ''; m.schritt = 4; m.fokus = 0; m.zeichnen(); }"); pg.wait_for_timeout(600)
    shot(pg, 'menue_start_1100x650_oben.png')       # PRUEF-FIX 3: Kopf des Schritts „Los!“ (die Spaß-Schalter liegen darunter und erscheinen erst nach dem Scrollen/↓)
    pg.evaluate("() => { const i = document.querySelector('.m-inhalt'); if (i) i.scrollTop = i.scrollHeight; }"); pg.wait_for_timeout(300)
    shot(pg, 'menue_start_1100x650.png')            # Hauptbild jetzt MIT der Schalterzeile (Spaß-Elemente … 🤖 KI-Tricks … Fahr-Zauber, Loopings)
    shot(pg, 'menue_start_1100x650_unten.png')
    pruefe('Menü: Schalter „🤖 KI-Tricks“ auf dem Hauptbild sichtbar', 'KI-Tricks' in pg.evaluate("() => document.body.innerText"))
    txt = pg.evaluate("() => document.body.innerText")
    pruefe('Menü: Zeile „🌀 Loopings“ mit Klassisch / Magnet-Röhre neben Fahr-Zauber', 'Loopings' in txt and 'Magnet-Röhre' in txt and 'Klassisch' in txt and 'Fahr-Zauber' in txt)
    # Schalter setzen / Standard
    std = pg.evaluate("() => Rennspiel.SpassZauber.loopMag()")
    pg.evaluate("() => { Rennspiel.spiel.menue.wertSetzen('loopmag', 'mag'); Rennspiel.spiel.menue.zeichnen(); }"); pg.wait_for_timeout(300)
    an = pg.evaluate("() => [Rennspiel.SpassZauber.loopMag(), localStorage.getItem('rennspiel.spass.zauber.loopMag')]")
    pg.evaluate("() => { Rennspiel.SpassZauber.anSetzen(false); Rennspiel.spiel.menue.zeichnen(); }")
    grau = pg.evaluate("() => !!document.querySelector('.m-spass .gr.r4-grau')")
    gesperrt = pg.evaluate("() => Rennspiel.SpassZauber.loopMag()")
    pg.evaluate("() => { Rennspiel.SpassZauber.anSetzen(true); Rennspiel.SpassZauber.loopMagSetzen(false); }")
    pruefe('Menü: Standard Klassisch; Magnet-Röhre speichert; ohne Fahr-Zauber ausgegraut und wirkungslos', std is False and an == [True, '1'] and grau and gesperrt is False, f'std {std}, nach Klick {an}, grau {grau}')
    # Streckenkarte Fantasie: Text
    pg.evaluate("() => { Rennspiel.SpassZauber.loopMagSetzen(true); const m = Rennspiel.spiel.menue; m.schritt = 1; m.zeichnen(); }"); pg.wait_for_timeout(400)
    t1 = pg.evaluate("() => document.body.textContent")
    pg.evaluate("() => { Rennspiel.SpassZauber.loopMagSetzen(false); Rennspiel.spiel.menue.zeichnen(); }"); pg.wait_for_timeout(300)
    t0 = pg.evaluate("() => document.body.textContent")
    pruefe('Menü: Streckenkarte Fantasie „2 Loopings“ → „2 Magnet-Röhren“ (nur mit Option)', '2 Magnet-Röhren' in t1 and '2 Loopings' not in t1 and 'zwei Loopings' not in t1 and '2 Loopings' in t0 and '2 Magnet-Röhren' not in t0)
    pruefe('Menü: keine Konsolenfehler', not FEHLER, FEHLER[:3])
    b.close()

# ------------------------------------------------------------ Arena
def arena(p):
    b, pg = neue_seite(p, 960, 540)
    uhr_anhalten(pg)
    pg.evaluate("""() => { const m = Rennspiel.spiel.menue; Rennspiel.SpassZauber.anSetzen(false); m.zeigen(0); m.e.spassModus = 'arena'; m.starten(); window.requestAnimationFrame = () => 0; }""")
    pg.wait_for_timeout(500); bis_start(pg)
    info = pg.evaluate("""() => { const s = Rennspiel.spiel, st = s.strecke, z = st.spass && st.spass.zauber; return { id: st.id, katalog: Rennspiel.trackCatalog.some(t => t.id === 'autoarena'), zustand: s.zustand, gegner: s.fahrzeuge.length,
      runden: s.rennen.runden, pipe: z && z.pipe ? { s0: z.pipe.s0, s1: z.pipe.s1, auto: z.pipe.auto } : null, gruppe: !!s.zauberGruppe, zauberAus: !Rennspiel.SpassZauber.an(), schanzen: st.schanzen.length,
      klasse: document.body.classList.contains('r4-arena'), s4: s.s4 && s.s4.art, einst: s.einstellungen.streckeId }; }""")
    pruefe('Arena: startet als eigene Strecke, nur 1 Fahrzeug, 999 Runden, Katalog danach ohne autoarena', info['id'] == 'autoarena' and info['zustand'] == 'rennen' and info['gegner'] == 1 and info['runden'] == 999 and not info['katalog'] and info['s4'] == 'arena', json.dumps(info)[:300])
    pruefe('Arena: Halfpipe gebaut (Fahr-Zauber erzwungen, Spieler-Einstellung „aus“ bleibt), 2 Schanzen, Szene-Gruppe da', bool(info['pipe']) and info['pipe']['auto'] and info['gruppe'] and info['zauberAus'] and info['schanzen'] == 2, json.dumps(info['pipe']))
    bild(pg, 'arena_start.png')
    # Draufsicht
    d = pg.evaluate("""() => { const s = Rennspiel.spiel, r = s.renderer, W = r.domElement.width, H = r.domElement.height; const cam = new THREE.PerspectiveCamera(62, W / H, 1, 4000);
      const fog = s.szene.fog, weg = []; s.szene.fog = null; s.szene.traverse((o) => { if (o.visible && o.isMesh && o.geometry && o.geometry.boundingSphere === null) o.geometry.computeBoundingSphere(); if (o.visible && o.isMesh && o.geometry && o.geometry.boundingSphere && o.geometry.boundingSphere.radius > 700) { weg.push(o); o.visible = false; } });
      cam.position.set(100, 520, -190); cam.up.set(0, 0, -1); cam.lookAt(100, 0, -190); cam.updateMatrixWorld(); const u = document.getElementById('ui'); if (u) u.style.display = 'none';
      r.setScissorTest(false); r.setViewport(0, 0, innerWidth, innerHeight); r.render(s.szene, cam); const png = r.domElement.toDataURL('image/png'); weg.forEach((o) => { o.visible = true; }); s.szene.fog = fog; return png; }""")
    open(os.path.join(OUT, 'arena_karte.png'), 'wb').write(base64.b64decode(d.split(',')[1]))
    # Fahrt mit Autopilot – Konsole und Stabilität
    pg.evaluate("() => { Rennspiel.spiel.autopilot(0, true); }"); frames(pg, 60 * 25)
    z = pg.evaluate("() => { const f = Rennspiel.spiel.fahrzeuge[0]; return { s: Math.round(f.nah ? f.nah.s : -1), v: Math.round(f.vehicle.vLaengs), ok: isFinite(f.vehicle.x) && isFinite(f.vehicle.z) }; }")
    pruefe('Arena: 25 s Autopilot ohne Fehler, Fahrzeug bewegt sich', z['ok'] and z['v'] > 3, json.dumps(z))
    # zurück ins Hauptmenü: Einstellungen wieder wie vorher, Klasse weg
    pg.evaluate("() => { Rennspiel.spiel.zumMenue(); }"); pg.wait_for_timeout(300)
    rest = pg.evaluate("() => ({ klasse: document.body.classList.contains('r4-arena'), strecke: Rennspiel.spiel.einstellungen.streckeId, katalog: Rennspiel.trackCatalog.some(t => t.id === 'autoarena'), modus: Rennspiel.spiel.einstellungen.spassModus })")
    pruefe('Arena: Hauptmenü räumt auf (Klasse weg, Streckenwahl wieder normal, kein Katalogeintrag)', not rest['klasse'] and rest['strecke'] != 'autoarena' and not rest['katalog'], json.dumps(rest))
    pruefe('Arena: keine Konsolenfehler', not FEHLER, FEHLER[:3])
    b.close()

# ------------------------------------------------------------ Halfpipe: Auto an der Wand (natürliche Fahrt: Pilot lenkt hinein, pumpt in der Pipe)
PIPE_JS = """() => { const s = Rennspiel.spiel, R = Rennspiel; const orig = s.input.steuerung.bind(s.input);
  window.__P = { q: 9, v: 20, pump: false };
  s.input.steuerung = function (nr) {
    const P = window.__P; if (!P || nr !== 0) return orig(nr);
    const st = s.strecke, f = s.fahrzeuge[0], v = f.vehicle, sp = st.spline, n = st.abfrage(v.x, v.z, f.index), vl = Math.max(3, v.vLaengs), L = Math.max(9, Math.min(50, 0.55 * vl + 8)), pt = sp.punktBei(n.s + L);
    const zx = pt.x + pt.nx * P.q, zz = pt.z + pt.nz * P.q; let diff = R.headingAus(zx - v.x, zz - v.z) - v.heading;
    while (diff > Math.PI) diff -= 2 * Math.PI; while (diff < -Math.PI) diff += 2 * Math.PI;
    let lenk = Math.max(-1, Math.min(1, -(2 * vl * Math.sin(diff) / Math.hypot(zx - v.x, zz - v.z)) / v.drehrateMax(vl)));
    const pp = f.flug && f.flug.pipe; if (pp && P.pump) lenk = pp.side * (pp.w > 0 ? 1 : -1);
    return { gas: v.vLaengs < P.v ? 1 : 0, bremse: 0, lenkung: lenk, trick: false };
  };
  window.__zu = () => { const f = s.fahrzeuge[0], fz = f.flug, n = f.nah || {}; return { s: n.s, pipe: !!fz.pipe, phi: fz.pipe ? fz.pipe.phi : null, y: fz.aktiv ? fz.y : f.vehicle.y, luft: !!fz.aktiv && !fz.pipe, hoch: fz.z ? fz.z.pipeMax || 0 : 0, vy: fz.vy }; };
  window.__fr = (k) => { const z0 = s.zeichnen; s.zeichnen = function () {}; for (let i = 0; i < k; i++) { window.__t += 1000 / 60; s._frameRumpf(window.__t); } s.zeichnen = z0; return window.__zu(); };
  window.__aussen = (pos, blick) => { const k = s.kameras[0].kamera, p0 = k.position.clone(), q0 = k.quaternion.clone(); const u = document.getElementById('ui'); if (u) u.style.display = 'none';
    k.position.set(pos[0], pos[1], pos[2]); k.lookAt(blick[0], blick[1], blick[2]); k.updateMatrixWorld(true); s.szene.updateMatrixWorld(); s.renderer.setScissorTest(false); s.renderer.setViewport(0, 0, innerWidth, innerHeight); s.renderer.render(s.szene, k);
    const png = s.renderer.domElement.toDataURL('image/png'); k.position.copy(p0); k.quaternion.copy(q0); k.updateMatrixWorld(true); return png; };
}"""

def pipe(p):
    b, pg = neue_seite(p, 960, 540)
    uhr_anhalten(pg)
    pg.evaluate("""() => { const m = Rennspiel.spiel.menue; m.zeigen(0); m.e.spassModus = 'arena'; m.starten(); window.requestAnimationFrame = () => 0; }""")
    pg.wait_for_timeout(500); bis_start(pg)
    pg.evaluate(PIPE_JS)
    def setzen(dS, q, tempo, pump):
        pg.evaluate("""([dS, q, tempo, pump]) => { const s = Rennspiel.spiel, st = s.strecke, f = s.fahrzeuge[0], v = f.vehicle, pe = st.spass.zauber.pipe, sA = pe.s0 + dS, pt = st.spline.punktBei(sA);
          const x = pt.x + pt.nx * q, z = pt.z + pt.nz * q; v.setzen(x, z, Rennspiel.headingAus(pt.tx, pt.tz)); v.y = st.hoeheAn(x, z); f.index = -1; v.vLaengs = tempo;
          const o = f.flug; o.aktiv = false; o.gleit = null; o.schiene = null; o.pipe = null; s.rennen.verfolgungSetzen(0, x, z, sA); f.autopilot = null; window.__P = { q: 9, v: tempo, pump }; s.pausiert = false;
          const k = s.kameras[0]; if (k) { k._erstesMal = true; } }""", [dS, q, tempo, pump])
    def aussen(name):
        pos = pg.evaluate("""() => { const s = Rennspiel.spiel, st = s.strecke, f = s.fahrzeuge[0], v = f.vehicle, sp = st.spline, n = f.nah, pt = sp.punktBei(n.s - 22);
          const y = v.y + 3; return { p: [pt.x - pt.nx * 0 + pt.tx * 0, y + 4, pt.z], b: [v.x, v.y + 1, v.z], n: [pt.nx, pt.nz, pt.tx, pt.tz], y: v.y }; }""")
        # Blick von der Mittellinie der Pipe (gegenüberliegende Seite, 14 m hinter dem Auto)
        d = pg.evaluate("""() => { const s = Rennspiel.spiel, st = s.strecke, f = s.fahrzeuge[0], v = f.vehicle, sp = st.spline, n = f.nah, pt = sp.punktBei(n.s - 16), side = f.flug.pipe ? f.flug.pipe.side : 1;
          return window.__aussen([pt.x - pt.nx * side * 4, 7 + (f.flug.aktiv ? 0 : 0), pt.z - pt.nz * side * 4], [v.x, v.y + 1, v.z]); }""")
        open(os.path.join(OUT, name), 'wb').write(base64.b64decode(d.split(',')[1]))
    # 1) hinein und hochfahren (ruhig)
    setzen(-40, 9, 20, False)
    z = None
    for i in range(80):
        z = pg.evaluate("window.__fr(6)")
        if z['pipe'] and z['phi'] is not None and z['phi'] > 0.8: break
    bild(pg, 'pipe_wand_verfolger.png'); aussen('pipe_wand_aussen.png')
    pruefe('Pipe: Auto fährt natürlich hinein und hängt in der Rundung (φ > 0,8, Höhe > 1,5 m)', bool(z) and z['pipe'] and z['phi'] > 0.8 and z['y'] > 1.5, json.dumps(z))
    pose = pg.evaluate("() => { const f = Rennspiel.spiel.fahrzeuge[0]; return f._zPose ? { art: f._zPose.art, uy: +f._zPose.u.y.toFixed(2) } : null; }")
    pruefe('Pipe: Auto liegt schräg in der Rundung (Pose pipe, Oben-Vektor geneigt)', bool(pose) and pose['art'] == 'pipe' and pose['uy'] < 0.9, json.dumps(pose))
    # 2) Pumpen bis zur Kante und Luftsprung
    setzen(-40, 9, 20, True)
    luft = None; ma = 0
    for i in range(160):
        z = pg.evaluate("window.__fr(5)")
        ma = max(ma, z['y'])
        if z['luft'] and z['y'] > 9: luft = z; break
    bild(pg, 'pipe_luft_verfolger.png'); aussen('pipe_luft_aussen.png')
    pruefe('Pipe: mit Pumpen oben an der Kante abgehoben (Luft, Höhe > 9 m über der Straße)', bool(luft), json.dumps(luft) + ' max ' + str(round(ma, 2)))
    z = None
    for i in range(60):
        z = pg.evaluate("window.__fr(60)")
        if not z['luft'] and not z['pipe']: break
    pruefe('Pipe: nach den Pendelschlägen wieder auf dem Boden (innerhalb 60 s, Autopilot pumpt weiter)', bool(z) and not z['luft'] and not z['pipe'], json.dumps(z))
    ok_ = pg.evaluate("() => { const f = Rennspiel.spiel.fahrzeuge[0]; return isFinite(f.vehicle.x) && isFinite(f.vehicle.z) && isFinite(f.flug.y); }")
    pruefe('Pipe: Fahrzeugwerte endlich nach dem Sprung', ok_)
    pruefe('Pipe: keine Konsolenfehler', not FEHLER, FEHLER[:3])
    b.close()

# ------------------------------------------------------------ Fantasie mit Magnet-Röhre
def magnet(p):
    b, pg = neue_seite(p, 960, 540)
    uhr_anhalten(pg)
    pg.evaluate("""() => { Rennspiel.SpassZauber.anSetzen(true); Rennspiel.SpassZauber.loopMagSetzen(true);
      Rennspiel.spiel.rennenStarten({ modus: 'solo', streckeId: 'fantasie', autoIds: ['porsche-911', 'multivan'], runden: 2, gegner: 2, schwierigkeit: 'mittel', fahrhilfe: ['wenig', 'wenig'], tageszeit: 'tag', wetter: 'klar', spass: true }); window.requestAnimationFrame = () => 0; }""")
    pg.wait_for_timeout(500); bis_start(pg)
    info = pg.evaluate("""() => { const s = Rennspiel.spiel, st = s.strecke, z = st.spass && st.spass.zauber; return { loopings: st.loopings.length, magnet: z ? z.magnet.filter(m => m.ausLooping).map(m => ({ s: Math.round(m.s0), l: m.laenge })) : [], gruppe: !!s.zauberGruppe, looping3d: !!s.szene.getObjectByName && !!s.szene.getObjectByName('Looping') }; }""")
    pruefe('Fantasie mit Option: 0 Loopings, ≥ 2 Magnet-Röhren statt Loopings, Szene gebaut', info['loopings'] == 0 and len(info['magnet']) >= 2 and info['gruppe'], json.dumps(info))
    erst = info['magnet'][0] if info['magnet'] else None
    if erst:
        ans = [('ein', erst['s'] - 25, 25, 90), ('mitte', erst['s'] - 25, 25, 190), ('decke', erst['s'] - 25, 25, 250)]
        mag = False
        for name, s_, tempo, fr in ans:
            d = pg.evaluate("""([s_, tempo, frames]) => { const s = Rennspiel.spiel, st = s.strecke, f = s.fahrzeuge[0], v = f.vehicle;
              const pt = st.spline.punktBei(s_); v.setzen(pt.x, pt.z, Rennspiel.headingAus(pt.tx, pt.tz)); v.y = st.hoeheAn(pt.x, pt.z); f.index = -1; v.vLaengs = tempo;
              if (f.flug) { const q = f.flug; q.aktiv = false; q.gleit = null; q.schiene = null; q.pipe = null; if (q.z) { q.z.mag = null; } }
              s.rennen.verfolgungSetzen(0, pt.x, pt.z, s_); s.autopilot(0, true); s.pausiert = false;
              const z0 = s.zeichnen; s.zeichnen = function () {}; for (let i = 0; i < frames; i++) { window.__t += 1000 / 60; s._frameRumpf(window.__t); } s.zeichnen = z0;
              return { mag: !!(f.flug.z && f.flug.z.mag), v: Math.round(v.vLaengs) }; }""", [s_, tempo, fr])
            bild(pg, f'fantasie_magnet_{name}.png'); mag = mag or d['mag']
        pruefe('Fantasie: Auto haftet in der Röhre aus dem Looping (Magnet greift)', mag)
    pg.evaluate("() => { Rennspiel.SpassZauber.loopMagSetzen(false); }")
    pruefe('Fantasie: keine Konsolenfehler', not FEHLER, FEHLER[:3])
    b.close()

with sync_playwright() as p:
    for name, fn in (('menue', menue), ('arena', arena), ('pipe', pipe), ('magnet', magnet)):
        if nur and nur != name: continue
        print('--- ' + name, flush=True)
        try: fn(p)
        except Exception as e: pruefe(name + ': Skript lief ohne Ausnahme', False, repr(e)[:300])
with open(os.path.join(OUT, '.ok'), 'w') as f: f.write('x')
print(f'\n{ok} OK, {fehl} FEHL')
sys.exit(1 if fehl else 0)
