#!/usr/bin/env python3
"""v28 W8: Feuerwerk an Start/Ziel. Aufruf: python3 tests/feuerwerk_test.py [strecke]  (Standard wiese)
1) Spieler gewinnt (1 Runde, Auto kurz vor der Linie) -> Feuerwerk aktiv, Partikel leben, Punkte sichtbar (Bildunterschied mit/ohne), 1 Draw-Call,
   keine neuen Shader-Programme, laeuft auf der Ergebnistafel weiter, Screenshots (Verfolger, Cockpit, Ergebnis) -> tests/out/v28/feuerwerk_*.png
2) nach zumMenue: spiel.feuerwerk null, kein 'Feuerwerk' in der Szene, 0 Reste (Geometrien/Texturen), 3 Durchlaeufe ohne Wachstum
3) Spieler verliert (Computerfahrer zuerst) -> nie aktiv; Spieler danach Zweiter -> weiter nie
4) Auswahlregel (synthetisch): Mensch+Platz 1 ja, Mensch Platz 2 nein, KI Platz 1 nein, zweiter Mensch als Erster ja"""
import sys, os, io
from playwright.sync_api import sync_playwright
import numpy as np
from PIL import Image
basis = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
url = 'file://' + os.path.join(basis, 'Autorennen.html')
out = os.path.join(basis, 'tests', 'out', 'v28'); os.makedirs(out, exist_ok=True)
sid = (sys.argv[1] if len(sys.argv) > 1 else 'wiese')
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required']
erg = []
def pruefe(n, ok, d=''):
    erg.append(bool(ok)); print(('OK   ' if ok else 'FEHL ') + n + (' - ' + str(d) if d != '' else ''), flush=True)

START = """([sid, modus]) => Rennspiel.spiel.rennenStarten({ modus: modus || 'solo', streckeId: sid, autoIds: ['passat', 'multivan'], runden: 1, gegner: 2, schwierigkeit: 'mittel', fahrhilfe: ['wenig', 'wenig'], tempoKlasse: 'normal', tageszeit: 'daemmerung' })"""
# Teilnehmer idx fährt kurz vor der Linie los (Checkpoint 0 als nächster, Runde 1 läuft); alle anderen weit zurück und stehend
LAUF = '''(idx) => { const S = Rennspiel.spiel, sp = S.strecke.spline, L = S.strecke.laenge, t = S.rennen.teilnehmer[idx], f = S.fahrzeuge[idx];
  S.fahrzeuge.forEach((g, i) => { if (i !== idx) { const p = sp.punktBei(sp.wrapS(L - 250 - 25 * i)); g.vehicle.setzen(p.x, p.z, Rennspiel.headingAus(p.tx, p.tz)); g.vehicle.vLaengs = 0; g.driver && (g.driver.steuerung = () => ({ gas: 0, bremse: 1, lenkung: 0 })); } });
  const q = sp.punktBei(sp.wrapS(L - 12)); t.gestartet = true; t.naechsterCheckpoint = 0;
  f.vehicle.setzen(q.x, q.z, Rennspiel.headingAus(q.tx, q.tz)); f.vehicle.vLaengs = 38; f.index = -1; if (S.kameras[0]) S.kameras[0]._erstesMal = true; }'''
INFO = '''() => { const S = Rennspiel.spiel, fw = S.feuerwerk, ri = S.renderer.info; let n = 0; S.szene.traverse(o => { if (o.name === 'Feuerwerk') n++; });
  return { da: !!fw, aktiv: !!(fw && fw.aktiv), t: fw ? fw.t : 0, lebend: fw ? fw.lebende() : 0, sichtbar: !!(fw && fw.punkte.visible), imSzene: n, zustand: S.zustand,
    geo: ri.memory.geometries, tex: ri.memory.textures, prog: ri.programs ? ri.programs.length : -1, calls: ri.render.calls }; }'''
def bild(page):
    return np.asarray(Image.open(io.BytesIO(page.screenshot())).convert('RGB')).astype(int)
def frames(page, n=3):
    page.evaluate('window._fz0 = window._fz || 0'); page.wait_for_function('(window._fz || 0) >= window._fz0 + %d' % n)

with sync_playwright() as p:
    br = p.chromium.launch(args=ARGS)
    page = br.new_page(viewport={'width': 1024, 'height': 576}); page.set_default_timeout(240000)
    fehler = []
    page.on('pageerror', lambda e: fehler.append(str(e)))
    page.on('console', lambda m: fehler.append(m.text) if m.type == 'error' else None)
    page.goto(url); page.wait_for_timeout(1500)
    page.evaluate('window._fz = 0; (function f() { window._fz++; requestAnimationFrame(f); })()')
    basis_geo = None
    for lauf in range(3):
        page.evaluate(START, [sid, 'solo'])
        page.wait_for_function('Rennspiel.spiel.rennen && Rennspiel.spiel.rennen.zustand === "laeuft"', timeout=120000)
        v = page.evaluate(INFO)
        if lauf == 0:
            pruefe('Rennstart: Feuerwerk-Objekt angelegt, unsichtbar, noch nicht aktiv', v['da'] and not v['aktiv'] and not v['sichtbar'] and v['imSzene'] == 1, v)
        prog0 = v['prog']
        page.wait_for_function('Rennspiel.spiel.rennen.zeit > 3.2', timeout=120000)
        if lauf == 1:
            page.evaluate("() => { const k = Rennspiel.spiel.kameras[0]; for (let i = 0; i < 6 && k.modus !== 'cockpit'; i++) k.naechsterModus(); }")
        page.evaluate(LAUF, 0)
        page.wait_for_function('Rennspiel.spiel.feuerwerk && Rennspiel.spiel.feuerwerk.aktiv', timeout=60000)
        pruefe('Lauf %d: Spieler gewinnt -> Feuerwerk aktiv' % lauf, True)
        if lauf == 1:
            page.wait_for_function('Rennspiel.spiel.feuerwerk.t > 2.0 && Rennspiel.spiel.feuerwerk.lebende() > 60 || !Rennspiel.spiel.feuerwerk.aktiv', timeout=120000)
            page.evaluate("() => document.querySelectorAll('.overlay').forEach(e => { e.style.display = 'none'; })")
            frames(page, 2); page.screenshot(path=os.path.join(out, 'feuerwerk_cockpit_%s.png' % sid))
        if lauf == 0:
            # Bildunterschied mit/ohne Punkte (Verfolgerkamera)
            # Ergebnistafel (erscheint sofort, wenn alle Spieler im Ziel sind) – Feuerwerk läuft darunter weiter
            page.wait_for_function('Rennspiel.spiel.zustand === "ergebnis"', timeout=120000)
            v = page.evaluate(INFO)
            pruefe('Ergebnistafel: Feuerwerk läuft weiter', v['zustand'] == 'ergebnis' and v['aktiv'] and v['sichtbar'], v)
            page.wait_for_function('Rennspiel.spiel.feuerwerk.t > 3.8 || !Rennspiel.spiel.feuerwerk.aktiv', timeout=120000)
            pruefe('Ergebnistafel nach 3,8 s: weiter aktiv', page.evaluate('Rennspiel.spiel.feuerwerk.aktiv') and page.evaluate('Rennspiel.spiel.zustand') == 'ergebnis')
            frames(page, 3); page.screenshot(path=os.path.join(out, 'feuerwerk_ergebnis_%s.png' % sid))
            page.evaluate("() => document.querySelectorAll('.overlay').forEach(e => { e.style.display = 'none'; })")   # freie Sicht für die Bilder darunter
            page.wait_for_function('Rennspiel.spiel.feuerwerk.lebende() > 80', timeout=120000)
            v = page.evaluate(INFO)
            pruefe('Partikel leben', v['lebend'] > 80, v['lebend'])
            pruefe('Keine neuen Shader-Programme nach dem Countdown', v['prog'] == prog0, '%s -> %s' % (prog0, v['prog']))
            a = bild(page); page.screenshot(path=os.path.join(out, 'feuerwerk_verfolger_%s.png' % sid))
            page.evaluate('Rennspiel.spiel.feuerwerk.punkte.visible = false'); frames(page)
            b = bild(page)
            page.evaluate('Rennspiel.spiel.feuerwerk.punkte.visible = Rennspiel.spiel.feuerwerk.aktiv'); frames(page)
            diff = int((np.abs(a - b)[100:215, 180:840].sum(axis=2) > 60).sum())   # nur der Himmel unter den HUD-Kästen
            pruefe('Punkte sichtbar (Pixel mit/ohne)', diff > 150, diff)
            # Draw-Calls mit/ohne (solange die Show läuft; 2 Bilder Abstand je Messung)
            dc = page.evaluate('''() => new Promise(res => { const S = Rennspiel.spiel, fw = S.feuerwerk, rr = (n, f) => { if (n <= 0) f(); else requestAnimationFrame(() => rr(n - 1, f)); };
              if (!fw.aktiv) { res(null); return; }
              fw.punkte.visible = true; rr(3, () => { const mit = S.renderer.info.render.calls, aktiv1 = fw.aktiv; fw.punkte.visible = false; rr(3, () => { const ohne = S.renderer.info.render.calls; fw.punkte.visible = fw.aktiv; res({ mit, ohne, aktiv1 }); }); }); })''')
            pruefe('Draw-Calls +1 solange es läuft', dc is None or (dc['mit'] - dc['ohne'] == 1) or not dc['aktiv1'], dc)
        page.wait_for_function('!Rennspiel.spiel.feuerwerk.aktiv', timeout=120000)
        v = page.evaluate(INFO)
        pruefe('Lauf %d: Show endet von selbst (unsichtbar, 0 Partikel)' % lauf, not v['sichtbar'] and v['lebend'] == 0, v)
        page.evaluate('Rennspiel.spiel.zumMenue(true)'); page.wait_for_timeout(800)
        v = page.evaluate(INFO)
        pruefe('Lauf %d: nach Menü: kein Feuerwerk, 0 Reste' % lauf, not v['da'] and v['imSzene'] == 0, v)
        if lauf == 0: basis_geo = (v['geo'], v['tex'])
        else: pruefe('Lauf %d: Geometrien/Texturen wachsen nicht' % lauf, (v['geo'], v['tex']) <= (basis_geo[0], basis_geo[1]), '%s vs %s' % ((v['geo'], v['tex']), basis_geo))
    # Mitten in der Show: Menü/Nochmal -> aufgeräumt
    page.evaluate(START, [sid, 'solo']); page.wait_for_function('Rennspiel.spiel.rennen.zeit > 3.2', timeout=120000)
    page.evaluate(LAUF, 0); page.wait_for_function('Rennspiel.spiel.feuerwerk && Rennspiel.spiel.feuerwerk.lebende() > 20', timeout=60000)
    page.evaluate(START, [sid, 'solo']); page.wait_for_function('Rennspiel.spiel.rennen && Rennspiel.spiel.rennen.zustand === "laeuft"', timeout=120000)
    v = page.evaluate(INFO)
    pruefe('Nochmal mitten in der Show: neues Rennen, Feuerwerk neu + ruhig, genau 1 im Bild', v['da'] and not v['aktiv'] and v['imSzene'] == 1 and v['lebend'] == 0, v)
    # Verlieren: Computerfahrer (Teilnehmer 1) zuerst
    page.wait_for_function('Rennspiel.spiel.rennen.zeit > 3.2', timeout=120000)
    page.evaluate(LAUF, 1)
    page.wait_for_function('Rennspiel.spiel.rennen.teilnehmer[1].imZiel', timeout=60000)
    page.wait_for_timeout(1500)
    v = page.evaluate(INFO); pruefe('Computerfahrer Erster: kein Feuerwerk', not v['aktiv'] and v['lebend'] == 0 and not v['sichtbar'], v)
    page.evaluate(LAUF, 0)
    page.wait_for_function('Rennspiel.spiel.rennen.teilnehmer[0].imZiel', timeout=60000); page.wait_for_timeout(1500)
    pl = page.evaluate('Rennspiel.spiel.rennen.teilnehmer[0].zielPlatz'); v = page.evaluate(INFO)
    pruefe('Spieler danach Zweiter (Platz %s): weiter kein Feuerwerk' % pl, pl == 2 and not v['aktiv'] and v['lebend'] == 0, v)
    # Auswahlregel synthetisch
    r = page.evaluate('''() => { const S = Rennspiel.spiel; const f = S.feuerwerk; const res = []; f.gestartet = 0; f.aktiv = false;
      const fall = (t) => { f.gestartet = 0; f.aktiv = false; f.punkte.visible = false; S.rennen._melden('ziel', t); const a = f.aktiv; f.beenden(); return a; };
      res.push(fall({ istSpieler: true, zielPlatz: 1, nr: 0 })); res.push(fall({ istSpieler: true, zielPlatz: 2, nr: 0 })); res.push(fall({ istSpieler: false, zielPlatz: 1, nr: 1 })); res.push(fall({ istSpieler: true, zielPlatz: 1, nr: 1 })); return res; }''')
    pruefe('Auswahlregel Mensch1/Platz2/KI1/zweiter Mensch1 = [ja,nein,nein,ja]', r == [True, False, False, True], r)
    # Ton (WebAudio-Synthese, OfflineAudioContext): Zisch + Knall hörbar, aber leise (Spitze < 0,5), kein Fehler, Master-Lautstärke wirkt
    ton = page.evaluate('''async () => {
      const R = Rennspiel, SR = 22050, alt = R.Audio, res = {};
      for (const lautst of [1, 0]) {
        const ctx = new OfflineAudioContext(1, SR * 4, SR), A = new R.AudioKlasse(); A.offlineStarten(ctx); A.lautstaerke = lautst; A._masterSetzen(0.001);
        R.Audio = A; const fw = new R.Feuerwerk.Klasse(null);
        try { A._zeitTest = 0.5; fw._ton('zisch'); A._zeitTest = 1.2; fw._ton('knall'); fw._ton('knall'); } finally { R.Audio = alt; fw.zerstoeren(); }
        const b = await ctx.startRendering(), d = b.getChannelData(0); let pk = 0, q = 0; for (let i = 0; i < d.length; i++) { pk = Math.max(pk, Math.abs(d[i])); q += d[i] * d[i]; }
        res['l' + lautst] = { peak: pk, rms: Math.sqrt(q / d.length) };
      }
      return res; }''')
    pruefe('Ton hörbar und leise (Spitze zwischen 0,005 und 0,5)', 0.005 < ton['l1']['peak'] < 0.5, ton['l1'])
    pruefe('Master-Lautstärke 0 -> stumm', ton['l0']['peak'] < 0.0005, ton['l0'])
    pruefe('Keine Konsolenfehler', not fehler, fehler[:3])
    br.close()
print('%d von %d OK' % (sum(erg), len(erg)))
sys.exit(0 if all(erg) else 1)
