#!/usr/bin/env python3
"""15.10. (v25): Verkehr im Browser (Playwright, headless): Geisterfahrer, Krankenwagen, Abschleppwagen.
Aufruf: PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers python3 tests/verkehr_test.py
Prüft: Menü-Zeilen (Standard aus), Optionen werden übernommen, Wagen als Fahrzeug-Einträge (nicht im Rennen), Draw-Calls, keine JS-Fehler,
Bilder in tests/out/v25_verkehr/: krankenwagen_blau.png, geisterfahrer_kurve.png, geisterfahrer_warnung.png, abschleppwagen.png"""
import sys, os, json
from playwright.sync_api import sync_playwright

basis = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
out = os.path.join(basis, 'tests', 'out', 'v25_verkehr'); os.makedirs(out, exist_ok=True)
url = 'file://' + os.path.join(basis, 'Autorennen.html')
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
suffix = sys.argv[1] if len(sys.argv) > 1 else ''

STARTEN = '''([geister, stufe, tageszeit, gegner, id]) => { const s = Rennspiel.spiel;
  s.rennenStarten({ modus: 'solo', streckeId: id || 'wiese', welt: id ? '' : 'klassisch', polizei: false, geisterfahrer: geister, verkehr: stufe, gegner, runden: 2, schwierigkeit: 'mittel',
    autoIds: ['porsche-911', 'multivan'], fahrhilfe: ['wenig', 'wenig'], schaden: false, wetter: 'klar', jahreszeit: 'sommer', windStaerke: 0, tageszeit });
  const vk = s.verkehr;
  return { fz: s.fahrzeuge.length, tn: s.rennen.teilnehmer.length, sys: !!vk, wagen: vk ? vk.eintraege.map(e => e.art) : [],
    nichtImRennen: vk ? vk.idx.every(i => i >= s.rennen.teilnehmer.length && s.fahrzeuge[i].polizei) : true,
    geparkt: vk ? vk.eintraege.every(e => !e.aktiv && e.f.ausgeschieden && !e.f.mesh.visible) : true }; }'''

# Wagen e (Art, Nr.) bei Bogenlänge sE auf die Strecke setzen; Spieler sP-Abstand davor/dahinter in Gegenrichtung (rueck) oder gleicher Richtung
PLATZIEREN = '''([art, k, sE, fracE, tempoE, sP, fracP, rueck]) => { const s = Rennspiel.spiel, vk = s.verkehr, st = s.strecke, V = Rennspiel.Verkehr;
  const e = vk.eintraege.find(x => x.art === art && x.k === k);
  e.route = e.route || { a: sE - 400, b: sE + 400 };
  if (art !== 'geisterfahrer') e.route = { a: sE - 50, b: sE + 900 };
  else e.route = { a: Math.min(e.route.a, sE - 250), b: Math.max(e.route.b, sE + 50) };
  vk._erscheinen(e, sE, fracE, tempoE);
  const f = s.fahrzeuge[0], p = V.lagePunkt(st, sP, fracP, 0, 2, {});
  f.vehicle.setzen(p.x, p.z, Rennspiel.headingAus(rueck ? -p.tx : p.tx, rueck ? -p.tz : p.tz));
  f.vehicle.vLaengs = 0; f.vehicle.y = st.hoeheAn(p.x, p.z);
  f.index = st.spline.indexBei(sP); f.nah = st.abfrage(p.x, p.z, f.index); f.index = f.nah.index;
  s._vorherAngleichen(f);
  return { x: e.f.vehicle.x, z: e.f.vehicle.z, aktiv: e.aktiv, s: e.f.nah.s }; }'''

KURVE = '''([a, b]) => { const sp = Rennspiel.spiel.strecke.spline; let best = { s: a, d: 0 };
  for (let s = a + 40; s < b - 40; s += 5) { const p = sp.punktBei(s - 25), q = sp.punktBei(s + 25); const d = Math.abs(Rennspiel.Vehicle.winkelDiff(Math.atan2(q.tx, q.tz), Math.atan2(p.tx, p.tz))); if (d > best.d) best = { s, d }; }
  return best; }'''

STAND = '''() => { const s = Rennspiel.spiel, vk = s.verkehr, hud = document.querySelector('.hud-geisterfahrer');
  return { zeit: +s._physikZeit.toFixed(1), aktiv: vk ? vk.eintraege.map(e => e.aktiv ? e.art[0] + Math.round(e.f.nah.s) : '-') : [], warn: hud && hud.style.display !== 'none' ? hud.textContent : '',
    stat: vk ? vk.statistik : null, nan: s.fahrzeuge.some(g => [g.vehicle.x, g.vehicle.z, g.vehicle.heading].some(x => !isFinite(x))),
    calls: s.renderer.info.render.calls, tris: s.renderer.info.render.triangles, licht: (() => { let n = 0; s.szene.traverse(o => { if (o.isPointLight && o.visible && o.intensity > 0) n++; }); return n; })() }; }'''

ABSTAND = '''([art, k]) => { const s = Rennspiel.spiel, e = s.verkehr.eintraege.find(x => x.art === art && x.k === k), f = s.fahrzeuge[0], c = s.kameras[0].kamera.position, w = e.f.vehicle;
  return { spielerWagen: +Math.hypot(f.vehicle.x - w.x, f.vehicle.z - w.z).toFixed(1), kameraWagen: +Math.hypot(c.x - w.x, c.z - w.z).toFixed(1), aktiv: e.aktiv, sichtbar: e.f.mesh.visible, v: +w.vLaengs.toFixed(1) }; }'''

pruef = []
def pruefe(name, ok, info=''):
    pruef.append((name, ok)); print(('OK   ' if ok else 'FEHL ') + name + (' – ' + str(info) if info != '' else ''), flush=True)

def vor(page, sek):
    page.evaluate('(t) => { const s = Rennspiel.spiel; s.pausiert = false; s.schnellvorlauf(t); s.pausiert = true; }', sek)

def foto(page, name, warte=250):
    # die Kamera folgt nur bei laufendem Spiel: von Hand nachführen (springt sonst nicht zur neuen Position)
    page.evaluate("() => { const s = Rennspiel.spiel, k = s.kameras[0]; s.fahrzeuge.forEach(f => { const v = f.vehicle, a = f.anzeige; a.x = v.x; a.y = v.y; a.z = v.z; a.heading = v.heading; a.nicken = v.nicken; a.neigung = v.neigung; if (f.mesh) { f.mesh.position.set(v.x, v.y, v.z); f.mesh.rotation.y = v.heading; } }); k.folge(k.ziel, k.quelle); for (let i = 0; i < 6; i++) k.update(0.1); s.huds.forEach(h => h.update()); }")
    page.wait_for_timeout(warte)
    page.screenshot(path=os.path.join(out, name))

with sync_playwright() as p:
    browser = p.chromium.launch(args=ARGS)
    page = browser.new_page(viewport={'width': 1280, 'height': 800})
    fehler = []
    page.on('pageerror', lambda e: fehler.append(str(e)))
    page.on('console', lambda m: fehler.append('console.error: ' + m.text) if m.type == 'error' else None)
    page.goto(url); page.wait_for_timeout(1500)

    # --- Standard aus ---
    ein = page.evaluate("() => ({ g: Rennspiel.spiel.einstellungen.geisterfahrer, v: Rennspiel.spiel.einstellungen.verkehr })")
    pruefe('Standard: Geisterfahrer aus, Verkehr aus', ein['g'] is False and ein['v'] == 'aus', ein)
    st = page.evaluate(STARTEN, [False, 'aus', 'tag', 3, None])
    pruefe('ohne Verkehr: kein System, 4 Fahrzeuge', not st['sys'] and st['fz'] == 4, st)

    # --- Menü: Zeilen vorhanden, bedienbar ---
    page.evaluate("() => { const s = Rennspiel.spiel; s.zurMenue && s.zurMenue(); }")
    # --- mit Verkehr ---
    st = page.evaluate(STARTEN, [True, 'viel', 'daemmerung', 3, None])
    pruefe('Geisterfahrer + Verkehr viel: 7 Wagen (3 Geister, 2 Krankenwagen, 2 Abschleppwagen), nicht im Rennen, geparkt unsichtbar',
           st['sys'] and st['wagen'] == ['geisterfahrer'] * 3 + ['krankenwagen'] * 2 + ['abschleppwagen'] * 2 and st['tn'] == 4 and st['fz'] == 11 and st['nichtImRennen'] and st['geparkt'], st)
    vor(page, 7)       # Countdown vorbei
    z = page.evaluate(STAND)
    pruefe('Start sauber (keine NaN)', not z['nan'], z)

    # --- Krankenwagen: Blaulicht (von vorn, Dämmerung) ---
    pl = page.evaluate(PLATZIEREN, ['krankenwagen', 0, 900, 0.28, 0, 913, 0.28, True])
    vor(page, 0.3)
    page.evaluate("() => { const e = Rennspiel.spiel.verkehr.eintraege.find(x => x.art === 'krankenwagen'); e.f.vehicle.vLaengs = 0; e.pause = 0; }")
    foto(page, 'krankenwagen_blau' + suffix + '.png', 400)
    d = page.evaluate(ABSTAND, ['krankenwagen', 0])
    pruefe('Krankenwagen im Bild (Kamera < 45 m, sichtbar)', d['aktiv'] and d['sichtbar'] and d['kameraWagen'] < 45, d)
    z = page.evaluate(STAND)
    pruefe('Krankenwagen aktiv, Blaulicht-Licht an (Licht-Pool, Intensität > 0)', 'k' in ''.join(z['aktiv']) and z['licht'] >= 2, z['licht'])
    pl = page.evaluate(PLATZIEREN, ['krankenwagen', 0, 900, 0.28, 0, 888, 0.28, False])
    vor(page, 0.2)
    foto(page, 'krankenwagen_heck' + suffix + '.png', 400)
    # --- Abschleppwagen ---
    page.evaluate(PLATZIEREN, ['abschleppwagen', 0, 1500, 0.3, 9.5, 1480, 0.3, False])
    vor(page, 0.4)
    foto(page, 'abschleppwagen' + suffix + '.png', 400)
    d = page.evaluate(ABSTAND, ['abschleppwagen', 0])
    pruefe('Abschleppwagen im Bild (Kamera < 45 m, sichtbar)', d['aktiv'] and d['sichtbar'] and d['kameraWagen'] < 45, d)
    # --- Geisterfahrer in der Kurve ---
    routen = page.evaluate("() => Rennspiel.spiel.verkehr.routen.map(r => [r.a, r.b])")
    k = page.evaluate(KURVE, routen[1] if len(routen) > 1 else routen[0])
    sG = k['s'] + 20
    page.evaluate(PLATZIEREN, ['geisterfahrer', 1, sG, 0.45, 20, sG - 125, -0.45, False])
    vor(page, 1.2)
    foto(page, 'geisterfahrer_warnung' + suffix + '.png', 300)
    z = page.evaluate(STAND)
    pruefe('HUD-Warnung „Geisterfahrer voraus“ sichtbar', 'Geisterfahrer voraus' in z['warn'], z['warn'])
    page.evaluate(PLATZIEREN, ['geisterfahrer', 2, k['s'] + 26, -0.45, 20, k['s'] - 8, 0.45, False])
    vor(page, 0.6)
    page.evaluate("() => { document.querySelector('.hud-geisterfahrer').style.visibility = 'hidden'; }")      # Bild ohne Banner (das Warnbild gibt es extra)
    foto(page, 'geisterfahrer_kurve' + suffix + '.png', 300)
    page.evaluate("() => { document.querySelector('.hud-geisterfahrer').style.visibility = ''; }")
    d = page.evaluate(ABSTAND, ['geisterfahrer', 2])
    pruefe('Geisterfahrer in der Kurve im Bild (Kamera < 60 m, sichtbar)', d['aktiv'] and d['sichtbar'] and d['kameraWagen'] < 60, d)
    z = page.evaluate(STAND)
    pruefe('Draw-Calls im Rennen mit Verkehr vertretbar', z['calls'] < 600, f"{z['calls']} Calls, {z['tris']} Dreiecke")
    print(json.dumps(z))

    # --- Lauf: alles fährt, nichts bleibt hängen, keine NaN, keine Fehler ---
    st = page.evaluate(STARTEN, [True, 'viel', 'tag', 3, None])
    page.evaluate('() => { Rennspiel.spiel.autopilot(0); }')
    for sek in range(0, 180):
        vor(page, 1)
    z = page.evaluate(STAND)
    stat = z['stat']
    pruefe('Lauf 180 s: Wagen sind aufgetreten (Geister, Krankenwagen, Abschleppwagen)', stat['geister'] > 0 and stat['kranken'] > 0 and stat['abschlepp'] > 0, stat)
    pruefe('Lauf: keine Wagen ohne Grund festgefahren', stat['haengenAlleine'] <= 1, stat['haengenAlleine'])
    pruefe('Lauf: keine NaN', not z['nan'])

    # --- Abbau / Neustart ohne Verkehr ---
    st = page.evaluate(STARTEN, [False, 'aus', 'tag', 3, None])
    ll = page.evaluate("() => { let n = 0; Rennspiel.spiel.szene.traverse(o => { if (o.isPointLight && o.name === 'Blaulicht-Pool') n++; }); return n; }")
    pruefe('Nach Neustart ohne Verkehr: kein System, keine übrigen Blaulicht-Lichter', not st['sys'] and ll == 0, ll)

    # --- Megastrecke / Gabelung (Stichprobe): Aufbau ohne Fehler ---
    for tid in ['fantasie', 'alpen']:
        try:
            st = page.evaluate(STARTEN, [True, 'viel', 'tag', 3, tid])
            vor(page, 12)
            z = page.evaluate(STAND)
            pruefe(f'{tid}: Aufbau + 12 s ohne Fehler', st['sys'] and not z['nan'], z['aktiv'])
        except Exception as ex:
            pruefe(f'{tid}: Aufbau', False, str(ex)[:200])

    pruefe('keine JS-Fehler', not fehler, fehler[:5])
    browser.close()

n_f = sum(1 for _, ok in pruef if not ok)
print(f"\n{len(pruef)} geprüft, {n_f} Fehler")
sys.exit(1 if n_f else 0)
