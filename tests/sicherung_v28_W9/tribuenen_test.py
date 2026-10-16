#!/usr/bin/env python3
"""Zuschauertribünen (15.10., v25): Bilder (Fahrersicht) + Messungen + Audio-Pegel.
Aufruf: python3 tests/tribuenen_test.py [strecke|alle] [ausgabeordner] [--bilder] [--audio] [--variante=xl] [--mega]
  ohne --bilder/--audio: beides.
Bilder: Fahrersicht an einer Kurventribüne (90 / 45 m davor, daneben) und am Start/Ziel – je Strecke (wiese, wueste, fantasie) in tests/out/v25_tribuenen/.
Messung: Draw-Calls (Strecke + Deko + Tribünen), Dreiecke, Zuschauer, FPS-Schätzung, Konsolenfehler.
Audio (OfflineAudioContext, kein Lautsprecher): Auto fährt von 160 m auf 5 m an eine Tribüne heran, dann vorbei → Pegel (RMS je Sekunde) steigt bei
Annäherung, Jubel beim Vorbeifahren lauter, Pan wechselt von rechts nach links; Ton aus → Stille."""
import sys, os, json, math
from playwright.sync_api import sync_playwright

basis = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
url = 'file://' + os.path.join(basis, 'Autorennen.html')
args = [a for a in sys.argv[1:] if not a.startswith('--')]
wahl = args[0] if args else 'alle'
out = args[1] if len(args) > 1 else os.path.join(basis, 'tests', 'out', 'v25_tribuenen')
os.makedirs(out, exist_ok=True)
nur_bilder = '--bilder' in sys.argv
nur_audio = '--audio' in sys.argv
mit_bilder = not nur_audio
mit_audio = not nur_bilder
variante = ''
for a in sys.argv:
    if a.startswith('--variante='):
        variante = a.split('=', 1)[1]
mega = '--mega' in sys.argv
nur_nah = '--nah' in sys.argv
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required']

ergebnisse = []
def pruefe(name, ok, detail=''):
    ergebnisse.append((name, bool(ok), detail))
    print(('OK   ' if ok else 'FEHL ') + name + (' – ' + str(detail) if detail != '' else ''))

TRIB = '''(() => { const st = Rennspiel.spiel.strecke; return (st.tribuenen || []).map(t => ({ nr: t.nr, typ: t.typ, s: t.s, seite: t.seite, thema: t.thema, laenge: t.laenge, reihen: t.reihen,
  kurve: t.kurve, x: t.x, z: t.z, tx: t.tx, tz: t.tz, ox: t.ox, oz: t.oz, tiefe: t.tiefe, yBasis: t.yBasis })); })()'''
DRAW = '''(() => { const s = Rennspiel.spiel; let n = 0, tri = 0; const namen = []; let trib = 0, zusch = 0, dreiecke = 0;
  s.szene.children.forEach(g => { const zaehl = (g.name.startsWith('Strecke') || g.name.startsWith('Deko') || g.name === 'Tribuenen'); if (!zaehl) return;
    g.traverse(o => { if ((o.isMesh || o.isInstancedMesh) && o.visible && (!o.isInstancedMesh || o.count > 0) && !(o.userData.stueck > 0)) {
      n++; namen.push(o.name); if (o.name.startsWith('Tribuenen')) trib++; if (o.name === 'Tribuenen-Zuschauer') zusch = o.count; } }); });
  const gr = s.szene.children.find(g => g.name === 'Tribuenen');
  return { meshes: n, tribMeshes: trib, zuschauer: zusch, dreieckeTrib: gr ? gr.userData.dreiecke : 0, drawCalls: s.renderer.info.render.calls, dreiecke: s.renderer.info.render.triangles }; })()'''
AUTO = '''([s, q]) => { const S = Rennspiel.spiel, sp = S.strecke.spline, p = sp.punktBei(s), f = S.fahrzeuge[0];
  f.vehicle.setzen(p.x + p.nx * (q || 0), p.z + p.nz * (q || 0), Rennspiel.headingAus(p.tx, p.tz)); f.vehicle.vLaengs = 0; f.index = -1; S.kameras[0]._erstesMal = true; }'''
# Freie Kamera (Nahaufnahmen): Kamera-Update abschalten, Position/Blick setzen. abst = Abstand zur Vorderkante (m, zur Straße hin), seitl = Versatz längs (m),
# hoch = Höhe über Gelände, ziel = Blickhöhe, von = 'strasse' (von der Straße aus) | 'hinten' (von hinten) | 'schraeg'
KAMERA = '''([nr, abst, seitl, hoch, ziel, von]) => { const S = Rennspiel.spiel, t = S.strecke.tribuenen[nr], k = S.kameras[0];
  if (!k._eingefroren) { k._eingefroren = true; k.update = () => {}; }
  const vs = von === 'hinten' ? 1 : -1, qv = von === 'hinten' ? t.tiefe + abst : -abst;
  const px = t.x + t.tx * seitl + t.ox * qv, pz = t.z + t.tz * seitl + t.oz * qv;
  k.kamera.position.set(px, t.yBasis + hoch, pz);
  k.kamera.up.set(0, 1, 0);
  k.kamera.lookAt(t.x + t.ox * t.tiefe * 0.45, t.yBasis + ziel, t.z + t.oz * t.tiefe * 0.45);
  k.kamera.updateMatrixWorld(true); }'''
PARKEN = '''(() => { const s = Rennspiel.spiel; s.fahrzeuge.forEach((f, i) => { if (i > 0) { const p = s.strecke.spline.punktBei(s.strecke.laenge - 300 - 20 * i);
  f.vehicle.setzen(p.x, p.z, Rennspiel.headingAus(p.tx, p.tz)); f.driver && (f.driver.steuerung = () => ({ gas: 0, bremse: 1, lenkung: 0 })); } }); })()'''

def lauf_bilder(browser, sid):
    page = browser.new_page(viewport={'width': 1280, 'height': 720})
    fehler = []
    page.on('pageerror', lambda e: fehler.append(str(e)))
    page.on('console', lambda m: fehler.append('console.' + m.type + ': ' + m.text) if m.type == 'error' else None)
    page.goto(url); page.wait_for_timeout(1200)
    opt = "{ modus: 'solo', streckeId: '%s', autoIds: ['troc-cabrio', 'multivan'], runden: 3, gegner: 2, schwierigkeit: 'mittel', fahrhilfe: ['wenig', 'wenig'], variante: '%s' }" % (sid, variante)
    page.evaluate("Rennspiel.spiel.rennenStarten(%s)" % opt)
    page.wait_for_timeout(1500)
    trib = page.evaluate(TRIB)
    draw = page.evaluate(DRAW)
    page.wait_for_function('Rennspiel.spiel.rennen.zustand === "laeuft"', timeout=90000)
    page.evaluate(PARKEN)
    tag = sid + (('_' + variante) if variante else '')
    pruefe('[%s] Tribünen vorhanden' % tag, len(trib) >= 3, '%d: %s' % (len(trib), ' '.join('%s%d%s' % (t['typ'][0], t['s'], 'R' if t['seite'] > 0 else 'L') for t in trib)))
    pruefe('[%s] 3 Meshes (Draw-Calls +3, höchstens +4)' % tag, draw['tribMeshes'] <= 4, json.dumps(draw))
    kurven = [t for t in trib if t['typ'] == 'kurve'][:2]
    start = [t for t in trib if t['typ'] == 'start'][:1]
    geraden = [t for t in trib if t['typ'] == 'gerade'][:1]
    # Nahaufnahmen (freie Kamera): von der Straße, schräg vom Ende, von hinten
    for t in (kurven[:1] + start + geraden)[:3]:
        name = '%s_%s%d' % (tag, t['typ'], t['nr'])
        for bez, a in (('nah_strasse', [24, 0, 3.0, 3.5, 'strasse']), ('nah_schraeg', [14, -26, 5.5, 3.5, 'strasse']), ('nah_hinten', [16, 10, 6.0, 3.5, 'hinten']), ('nah_figur', [5, -8, 2.6, 3.4, 'strasse'])):
            page.evaluate(KAMERA, [t['nr']] + a); page.wait_for_timeout(1800)
            page.screenshot(path=os.path.join(out, '%s_%s.png' % (name, bez)))
        page.evaluate(KAMERA, [t['nr'], 70, 20, 4.0, 3.0, 'strasse']); page.wait_for_timeout(1800)
        page.screenshot(path=os.path.join(out, '%s_fern.png' % name))
    if nur_nah:
        page.close(); return
    page.reload(); page.wait_for_timeout(1200)
    page.evaluate("Rennspiel.spiel.rennenStarten(%s)" % opt); page.wait_for_timeout(1500)
    page.wait_for_function('Rennspiel.spiel.rennen.zustand === "laeuft"', timeout=90000)
    page.evaluate(PARKEN)
    for t in kurven + start + geraden:
        name = '%s_%s%d' % (tag, t['typ'], t['nr'])
        # Fahrer 90 m und 45 m vor der Tribünenmitte, auf der Tribünenseite der Straße (dort sieht man sie am besten)
        q = t['seite'] * 3.5
        for d in (90, 45):
            page.evaluate(AUTO, [t['s'] - d, q]); page.wait_for_timeout(2300)
            page.screenshot(path=os.path.join(out, '%s_%dm.png' % (name, d)))
        page.evaluate(AUTO, [t['s'], q]); page.wait_for_timeout(2300)
        page.screenshot(path=os.path.join(out, '%s_neben.png' % name))
    # Im Spiel: Publikum-Stimme wird der Tribüne zugeteilt, Jubel bei der Vorbeifahrt (Ton + Zuschauer-Optik)
    if kurven or start:
        t = (kurven or start)[0]
        page.evaluate("Rennspiel.Audio.start()"); page.wait_for_timeout(300)
        page.evaluate(AUTO, [t['s'] - 110, t['seite'] * -2.0]); page.wait_for_timeout(300)
        page.evaluate("(() => { const f = Rennspiel.spiel.fahrzeuge[0]; f.vehicle.vLaengs = 26; })()")
        gesehen = {'laut': 0, 'jubel': 0, 'optik': 0, 'verbunden': False}
        for k in range(160):  # unter Last läuft das Spiel langsam: bis alles gesehen wurde (max ca. 60 s)
            page.wait_for_timeout(250)
            page.evaluate("(() => { const f = Rennspiel.spiel.fahrzeuge[0]; if (f.vehicle.vLaengs < 24) f.vehicle.vLaengs = 26; })()")
            r = page.evaluate('''(nr) => { const P = Rennspiel.Publikum, i = P.info().find(v => v.nr === nr), g = Rennspiel.spiel.strecke._tribGfx;
              return { laut: i ? i.laut : 0, jubel: i ? i.jubel : 0, verbunden: i ? i.verbunden : false, optik: g ? g.jub[nr] : 0, zustand: Rennspiel.Audio._ctx ? Rennspiel.Audio._ctx.state : 'keiner' }; }''', t['nr'])
            gesehen['laut'] = max(gesehen['laut'], r['laut']); gesehen['jubel'] = max(gesehen['jubel'], r['jubel']); gesehen['optik'] = max(gesehen['optik'], r['optik']); gesehen['verbunden'] = gesehen['verbunden'] or r['verbunden']
            gesehen['zustand'] = r['zustand']
            if gesehen['laut'] > 0.5 and gesehen['jubel'] > 0.4 and gesehen['optik'] > 0.4: break
        pruefe('[%s] im Spiel: Publikum-Stimme der Tribüne zugeteilt (laut > 0.5)' % tag, gesehen['verbunden'] and gesehen['laut'] > 0.5, json.dumps(gesehen))
        pruefe('[%s] im Spiel: Jubel bei der Vorbeifahrt (Ton + Zuschauer-Optik)' % tag, gesehen['jubel'] > 0.4 and gesehen['optik'] > 0.4, json.dumps(gesehen))
    # FPS-Schätzung: Frames der Seite in 2 s zählen
    fps = page.evaluate('''() => new Promise(res => { let n = 0; const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 > 2000) res(n / 2); else requestAnimationFrame(f); }; requestAnimationFrame(f); })''')
    pruefe('[%s] keine Konsolenfehler' % tag, not fehler, fehler[:3])
    print('   %s: Draw-Calls %s, Zuschauer %d, FPS (SwiftShader) ≈ %.1f' % (tag, json.dumps(draw), draw['zuschauer'], fps))
    json.dump({'tribuenen': trib, 'draw': draw, 'fps': fps, 'fehler': fehler}, open(os.path.join(out, tag + '_messung.json'), 'w'), indent=1)
    page.close()

AUDIO_SEITE = '''<!doctype html><html><head><meta charset="utf-8"></head><body>
<script src="../../../src/config.js"></script>
<script src="../../../src/audio/motorProfile.js"></script>
<script src="../../../src/audio/engine.js"></script>
<script src="../../../src/audio/publikum.js"></script>
</body></html>'''

AUDIO_JS = '''async (opt) => {
  const R = Rennspiel, A = R.Audio, P = R.Publikum, sr = 22050, T = opt.dauer;
  // künstliche Tribüne: Mitte bei (0, 0), Längsrichtung +x, nach außen +z (Straße liegt bei z < 0)
  const t = { nr: 0, typ: 'gerade', x: 0, z: 0, tx: 1, tz: 0, ox: 0, oz: 1, laenge: 30, tiefe: 8, s: 100 };
  const st = { tribuenen: [t, Object.assign({}, t, { nr: 1, x: 5000, z: 5000 })] };
  const ctx = new OfflineAudioContext(2, sr * T, sr);
  A.offlineStarten(ctx);
  P.start(st);
  const dt = 0.05, schritte = Math.round(T / dt);
  // Auto fährt in +x entlang der Straße z = −28 (Bande + Abstand), Tempo v; Start bei x = −xStart
  const v = opt.tempo, xStart = opt.xStart;
  const log = [];
  for (let i = 0; i < schritte; i++) {
    A._zeitTest = i * dt;
    const x = -xStart + v * i * dt;
    const auto = { x, z: -28, heading: -Math.PI / 2, tempo: v, vMax: 40, spieler: true, nr: 0, platz: 1 };   // heading −π/2: Fahrtrichtung +x (richtung = (−sin h, −cos h))
    P.schritt(dt, [auto], false, { laeuft: true });
    if (i % 10 === 0) { const inf = P.info()[0]; log.push({ t: +(i * dt).toFixed(2), x: +x.toFixed(1), laut: inf ? +inf.laut.toFixed(3) : 0, pan: inf ? +inf.pan.toFixed(2) : 0, jubel: inf ? inf.jubel : 0 }); }
  }
  const buf = await ctx.startRendering();
  const L = buf.getChannelData(0), Rr = buf.getChannelData(1), fenster = Math.round(sr * 1.0), erg = [];
  for (let s = 0; s + fenster <= L.length; s += fenster) {
    let a = 0, b = 0; for (let k = s; k < s + fenster; k++) { a += L[k] * L[k]; b += Rr[k] * Rr[k]; }
    erg.push({ sek: s / sr, rmsL: Math.sqrt(a / fenster), rmsR: Math.sqrt(b / fenster) });
  }
  return { erg, log };
}'''

def lauf_audio():
    from playwright.sync_api import sync_playwright as sp
    pfad = os.path.join(out, 'audio_publikum.html')
    open(pfad, 'w', encoding='utf-8').write(AUDIO_SEITE)
    with sp() as p:
        browser = p.chromium.launch(args=ARGS)
        page = browser.new_page()
        fehler = []
        page.on('pageerror', lambda e: fehler.append(str(e)))
        page.on('console', lambda m: fehler.append('console.error: ' + m.text) if m.type == 'error' else None)
        page.goto('file://' + pfad); page.wait_for_timeout(300)
        # 1) Anfahrt: von 175 m vor der Tribüne mit 25 m/s bis 40 m dahinter (9 s)
        r = page.evaluate(AUDIO_JS, {'dauer': 10, 'tempo': 25, 'xStart': 175})
        e = r['erg']
        rms = [math.sqrt((x['rmsL'] ** 2 + x['rmsR'] ** 2) / 2) for x in e]
        print('   RMS je Sekunde:', ' '.join('%.4f' % x for x in rms))
        print('   Log:', ' '.join('%s:%s/%s' % (l['x'], l['laut'], l['pan']) for l in r['log'][::2]))
        # Annäherung: Sekunde 0..5 (x −175 … −50) → Pegel steigt
        pruefe('Audio: Pegel steigt bei der Annäherung (Sek. 1 → 5)', rms[1] > rms[0] * 1.3 and rms[4] > rms[1] * 1.3, ' → '.join('%.4f' % x for x in rms[:6]))
        pruefe('Audio: weit weg (> 170 m) stumm', rms[0] < 0.0005 or rms[0] < rms[4] * 0.2, '%.5f' % rms[0])
        # Jubel beim Vorbeifahren: Maximum liegt in der Nähe des Vorbeifahrens (x ≈ 0 → Sekunde 7), lauter als die Annäherung bei 50 m
        imax = max(range(len(rms)), key=lambda i: rms[i])
        pruefe('Audio: lautester Moment bei der Vorbeifahrt (Jubel), 5–9 s', 5 <= imax <= 9, 'Sekunde %d, %.4f' % (imax, rms[imax]))
        # Pan: Tribüne liegt in Fahrtrichtung rechts der Straße; die Straße liegt bei z=−28, Tribüne bei z>0 → rechts (Fahrt +x, z wächst nach rechts?) – Vorzeichen prüfen: vorher rechts, danach gleiche Seite
        pans = [l['pan'] for l in r['log'] if l['laut'] > 0.05]
        pruefe('Audio: Panning gesetzt (|pan| > 0.2 an der Seite der Tribüne)', len(pans) > 3 and max(abs(x) for x in pans) > 0.2, 'pan %s' % pans[:3])
        seite_l = sum(x['rmsL'] for x in e[1:9]); seite_r = sum(x['rmsR'] for x in e[1:9])
        pruefe('Audio: Kanal-Balance passt zur Seite (Tribüne auf einer Seite lauter)', abs(seite_l - seite_r) > 0.05 * (seite_l + seite_r), 'L %.3f / R %.3f, pan %.2f' % (seite_l, seite_r, pans[0] if pans else 0))
        # 2) Ton aus (setzeAn false) → Stille: Master-Gain 0, kein Fehler
        r2 = page.evaluate('''() => { const A = Rennspiel.audio || Rennspiel.Audio; return { an: A._an, gain: A._master ? A._master.gain.value : null }; }''')
        # 3) Langsam (< 9 m/s) → kein Vorbeifahrt-Jubel
        r3 = page.evaluate(AUDIO_JS, {'dauer': 8, 'tempo': 5, 'xStart': 60})
        j = [l['jubel'] for l in r3['log']]
        pruefe('Audio: Schleichen (5 m/s) löst keinen Jubel aus', max(j) == 0, 'Jubel max %s' % max(j))
        j2 = [l['jubel'] for l in r['log']]
        pruefe('Audio: Vorbeifahrt (25 m/s) löst Jubel aus', max(j2) > 0.5, 'Jubel max %s' % max(j2))
        pruefe('Audio: keine JS-Fehler', not fehler, fehler[:3])
        browser.close()

with sync_playwright() as p:
    if mit_bilder:
        browser = p.chromium.launch(args=ARGS)
        ids = ['wiese', 'wueste', 'fantasie'] if wahl == 'alle' else [wahl]
        for sid in ids:
            lauf_bilder(browser, sid)
        browser.close()
if mit_audio:
    lauf_audio()
fehl = [e for e in ergebnisse if not e[1]]
print('\n%d Prüfungen, %d FEHL' % (len(ergebnisse), len(fehl)))
sys.exit(1 if fehl else 0)
