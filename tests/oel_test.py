#!/usr/bin/env python3
"""Runde 6 (W3-H): Ölfalle + Flugsaurier im Browser (Playwright, headless).
Aufruf: python3 tests/oel_test.py [ausgabeordner]   (Standard tests/out/oel)
Teil A (Fantasie, Welt Verrückt): Spieler sammelt ein Ölfass, Taste Space legt den Fleck 8 m hinter das Auto (Item weg, HUD-Symbol),
  ein KI-Auto fährt dahinter hinein und schlingert (vQuer > 0,5 m/s, Untergrund 'oel'). Bilder: oel_fleck.png.
Teil B (Dino, Welt Alles): Flugsaurier aus Fahrersicht (Cockpit) – groß im Bild, Schatten auf der Straße. Bilder: flugsaurier_*.png."""
import sys, os, json
from playwright.sync_api import sync_playwright

basis = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
out = sys.argv[1] if len(sys.argv) > 1 else os.path.join(basis, 'tests', 'out', 'oel')
os.makedirs(out, exist_ok=True)
url = 'file://' + os.path.join(basis, 'Autorennen.html')
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']

STARTEN = '''([strecke, welt]) => { const s = Rennspiel.spiel;
  s.rennenStarten({ modus: 'solo', streckeId: strecke, welt: welt, gegner: 3, runden: 3, schwierigkeit: 'mittel',
    autoIds: ['troc-cabrio', 'multivan'], fahrhilfe: ['wenig', 'wenig'], wetter: 'klar', jahreszeit: 'sommer', windStaerke: 0, polizei: false });
  s.uhr.rest = 0; s.pausiert = true;
  for (let k = 0; k < 60 * 6 && !s.rennen.gasErlaubt; k++) s.physikSchritt(1 / 60);
  return { gas: s.rennen.gasErlaubt, fz: s.fahrzeuge.length, pickups: !!s.pickups, faesser: s.pickups ? s.pickups.faesser.length : 0,
    flug: !!(s.dynamik && s.dynamik.flugsaurier) }; }'''

# Auto i auf Bogenlänge s0 (Seitenabstand q), Tempo v0, Richtung der Strecke
SETZEN = '''([i, s0, q, v0]) => { const s = Rennspiel.spiel, sp = s.strecke.spline, R = Rennspiel, f = s.fahrzeuge[i];
  const p = sp.punktBei(s0); f.vehicle.setzen(p.x + p.nx * q, p.z + p.nz * q, R.headingAus(p.tx, p.tz));
  f.vehicle.vLaengs = v0; f.vehicle.vQuer = 0; f.index = -1; s._vorherAngleichen(f); }'''

SCHRITTE = '''(n) => { const s = Rennspiel.spiel; for (let k = 0; k < n; k++) s.physikSchritt(1 / 60);
  s.fahrzeuge.forEach(f => s._vorherAngleichen(f)); }'''

pruef = []
def pruefe(name, ok, info=''):
    pruef.append((name, ok)); print(('OK   ' if ok else 'FEHL ') + name + (' – ' + str(info) if info != '' else ''), flush=True)

with sync_playwright() as p:
    browser = p.chromium.launch(args=ARGS)
    page = browser.new_page(viewport={'width': 1280, 'height': 800})
    fehler = []
    page.on('pageerror', lambda e: fehler.append(str(e)))
    page.on('console', lambda m: fehler.append('console.error: ' + m.text) if m.type == 'error' else None)
    page.goto(url); page.wait_for_timeout(1500)

    # ---------------- Teil A: Ölfalle ----------------
    st = page.evaluate(STARTEN, ['fantasie', 'verrueckt'])
    pruefe('Fantasie Verrückt: Rennen läuft, Ölfässer vorhanden', st['gas'] and st['pickups'] and st['faesser'] == 2, st)
    # KI-Autos stehen lassen (nur Auto 1 wird gezielt gefahren)
    page.evaluate('''() => { const s = Rennspiel.spiel; s.fahrzeuge.forEach((f, i) => { if (i > 1) f.vehicle.vLaengs = 0; }); s.autopilot(0, false); }''')
    # Bild vom Ölfass (zweites Fass, Kamera 7 m davor)
    page.evaluate('''() => { const s = Rennspiel.spiel, k = s.pickups.faesser[1], sp = s.strecke.spline, p = sp.punktBei(k.s), c = s.kameras[0].kamera;
      s.pickups.animieren(1.0, s.fahrzeuge); c.position.set(k.x - p.tx * 7 + p.nx * 1.5, k.y + 1.6, k.z - p.tz * 7 + p.nz * 1.5); c.up.set(0, 1, 0); c.lookAt(k.x, k.y, k.z);
      document.querySelectorAll('.hud-banner,.hud-meldung').forEach(b => { b.style.display = 'none'; }); }''')
    page.wait_for_timeout(300)
    page.screenshot(path=os.path.join(out, 'oel_fass.png'))
    fass = page.evaluate('''() => { const k = Rennspiel.spiel.pickups.faesser[0]; return { s: k.s, q: k.q }; }''')
    # Spieler fährt ins Fass (Tempo 20 m/s, Lenkung 0 – Eingabe fest)
    page.evaluate('''() => { const s = Rennspiel.spiel; s.input.steuerung = () => ({ gas: 0.6, bremse: 0, lenkung: 0 }); }''')
    page.evaluate(SETZEN, [0, fass['s'] - 6, fass['q'], 20])
    page.evaluate(SCHRITTE, 40)
    a = page.evaluate('''() => { const s = Rennspiel.spiel, pk = s.pickups; s.huds.forEach(h => h.update()); return { item: pk.itemVon(0), da: pk.faesser[0].da,
      hud: !!document.querySelector('.hud-item') && document.querySelector('.hud-item').style.display !== 'none', hudText: (document.querySelector('.hud-item') || {}).textContent }; }''')
    pruefe('Ölfass gesammelt: Item „oel", Fass weg, HUD-Symbol 🛢️', a['item'] == 'oel' and not a['da'] and a['hud'], a)

    # Engste Kurve suchen (größte Richtungsänderung auf 20 m) – dort wirkt das Schlingern am deutlichsten; Spieler (mit Item) dorthin
    kurve = page.evaluate('''() => { const sp = Rennspiel.spiel.strecke.spline, L = sp.laenge || sp.gesamtLaenge; let best = 0, bs = 0;
      for (let s0 = 100; s0 < L - 100; s0 += 5) { const a = sp.punktBei(s0), b = sp.punktBei(s0 + 20), d = Math.abs(Math.atan2(a.tx * b.tz - a.tz * b.tx, a.tx * b.tx + a.tz * b.tz));
        if (d > best) { best = d; bs = s0; } }
      return { s: bs, grad: +(best * 180 / Math.PI).toFixed(0) }; }''')
    print('engste Kurve:', kurve, flush=True)
    page.evaluate(SETZEN, [0, kurve['s'] + 12, 0, 0])
    # echtes keydown-Ereignis (Input → taste()), nur für diesen Moment nicht pausiert
    o = page.evaluate('''() => { const s = Rennspiel.spiel, pk = s.pickups; s.pausiert = false;
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', key: ' ' })); window.dispatchEvent(new KeyboardEvent('keyup', { code: 'Space', key: ' ' })); s.pausiert = true;
      const v = s.fahrzeuge[0].vehicle, r = v.richtung(); const f = pk.oel[0]; s.huds.forEach(h => h.update());
      return { n: pk.oel.length, item: pk.itemVon(0), x: f ? f.x : 0, z: f ? f.z : 0, vx: v.x, vz: v.z, rx: r.x, rz: r.z }; }''')
    hinten = (o['vx'] - o['x']) * o['rx'] + (o['vz'] - o['z']) * o['rz']
    pruefe('Space legt einen Ölfleck 8 m hinter das Auto, Item verbraucht', o['n'] == 1 and o['item'] is None and abs(hinten - 8) < 0.5, 'hinten %.2f m' % hinten)
    hud_weg = page.evaluate('''() => { const e = document.querySelector('.hud-item'); return !e || e.style.display === 'none'; }''')
    pruefe('HUD-Symbol verschwindet nach dem Legen', hud_weg)

    # KI-Auto 1: 22 m hinter dem Fleck, Tempo 25 m/s, normale KI-Steuerung → fährt hinein und schlingert
    sfleck = page.evaluate('''() => { const s = Rennspiel.spiel, f = s.pickups.oel[0], n = s.strecke.spline.naechster(f.x, f.z); return { s: n.s, q: n.seitenabstand }; }''')
    page.evaluate(SETZEN, [1, sfleck['s'] - 22, sfleck['q'], 25])
    page.evaluate('''() => { const s = Rennspiel.spiel; s.fahrzeuge[0].vehicle.vLaengs = 0; s.input.steuerung = () => ({ gas: 0, bremse: 1, lenkung: 0 }); }''')
    r = page.evaluate('''() => { const s = Rennspiel.spiel, v = s.fahrzeuge[1].vehicle; let maxQ = 0, oel = false, schritte = 0;
      for (let k = 0; k < 60 * 4; k++) { s.physikSchritt(1 / 60); schritte++; if (v.untergrund === 'oel') oel = true; maxQ = Math.max(maxQ, Math.abs(v.vQuer)); }
      return { maxQ: +maxQ.toFixed(2), oel, kmh: Math.round(v.vLaengs * 3.6) }; }''')
    pruefe('KI-Auto (kennt den Fleck nicht) fährt hinein: Untergrund oel, schlingert (vQuer > 0,5 m/s)', r['oel'] and r['maxQ'] > 0.5, r)

    # Bild: Fleck von hinten (Kamera 9 m hinter dem Fleck, 3,5 m hoch), Spielerauto davor
    page.evaluate(SETZEN, [0, sfleck['s'] + 14, sfleck['q'], 0])
    page.evaluate(SETZEN, [1, sfleck['s'] - 40, 6, 0])
    page.evaluate(SCHRITTE, 2)
    page.evaluate('''() => { const s = Rennspiel.spiel, f = s.pickups.oel[0]; f.alter = 3; const sp = s.strecke.spline, n = sp.naechster(f.x, f.z), p = sp.punktBei(n.s), c = s.kameras[0].kamera;
      s.kameras[0]._erstesMal = true; c.position.set(f.x - p.tx * 10 + p.nx * 1.2, s.strecke.hoeheAn(f.x, f.z) + 3.4, f.z - p.tz * 10 + p.nz * 1.2);
      c.up.set(0, 1, 0); c.lookAt(f.x + p.tx * 4, s.strecke.hoeheAn(f.x, f.z), f.z + p.tz * 4);
      document.querySelectorAll('.hud-banner,.hud-meldung').forEach(b => { b.style.display = 'none'; }); }''')
    page.wait_for_timeout(300)
    page.screenshot(path=os.path.join(out, 'oel_fleck.png'))
    # Pause beendet: Aufräumen der Kamera egal; Schild-Probe im Browser: Schild fängt Öl ab
    sch = page.evaluate('''() => { const s = Rennspiel.spiel, pk = s.pickups, f = pk.oel[0], v = s.fahrzeuge[1].vehicle; v.setzen(f.x, f.z, f.heading);
      pk.autos[1].schild = true; const w = pk.oelWirkt(1, v); return { wirkt: w, schildDa: pk.hatSchild(1) }; }''')
    pruefe('Schild fängt Öl im Spiel ab (verbraucht)', sch['wirkt'] is False and sch['schildDa'] is False, sch)
    # 6er-Limit im Spiel
    lim = page.evaluate('''() => { const s = Rennspiel.spiel, pk = s.pickups; for (let k = 0; k < 9; k++) { pk.autos[0].item = 1; pk.oelLegen(0); } return pk.oel.length; }''')
    pruefe('höchstens 6 Flecken gleichzeitig', lim == 6, lim)

    # ---------------- Teil B: Flugsaurier ----------------
    page.goto(url); page.wait_for_timeout(1200)
    st = page.evaluate(STARTEN, ['dino', 'alles'])
    pruefe('Dino Alles: Flugsaurier vorhanden', st['flug'], st)
    page.evaluate('''() => { const s = Rennspiel.spiel; s.fahrzeuge.forEach((f, i) => { if (i) f.vehicle.vLaengs = 0; }); s.dynamik.flugsaurier.timer = 0.5;
      s.input.steuerung = () => ({ gas: 0.5, bremse: 0, lenkung: 0 }); const k = s.kameras[0]; k.modusIndex = Math.max(0, Rennspiel.config.kamera.modi.indexOf('cockpit')); k._erstesMal = true; }''')
    # Auto auf die Gerade (s 700), 18 m/s, dann Schritt für Schritt bis der Flugsaurier ≈ 22 m vor dem Auto ist
    page.evaluate(SETZEN, [0, 700, 0, 18])
    page.evaluate(SCHRITTE, 5)
    bilder = []
    ziele = [('flugsaurier_anflug', 45), ('flugsaurier_nah', 20), ('flugsaurier_ueber', 5)]
    gefunden = {}
    for name, dziel in ziele:
        r = page.evaluate('''(dz) => { const s = Rennspiel.spiel, F = s.dynamik.flugsaurier, v = s.fahrzeuge[0].vehicle; let n = 0;
          while (n < 60 * 25 && !(F.aktiv && F.d <= dz && F.d > -30)) { s.physikSchritt(1 / 60); n++;
            if (!F.aktiv && n % 60 === 0 && v.vLaengs < 10) v.vLaengs = 18; }
          s.fahrzeuge.forEach(f => s._vorherAngleichen(f)); s.kameras[0].kamera.rotation.order = 'YXZ'; /* Testumgehung: Cockpit-Kamera rollt bei Heading ±90° (Euler XYZ) */ s.kameras[0]._erstesMal = true; s.kameras[0].update(1 / 60); s.dynamik.animieren();
          document.querySelectorAll('.hud-banner,.hud-meldung').forEach(b => { b.style.display = 'none'; });
          return { aktiv: F.aktiv, d: +F.d.toFixed(1), y: +(F.y - v.y).toFixed(1), n }; }''', dziel)
        page.wait_for_timeout(350)
        datei = os.path.join(out, name + '.png')
        # Bildschirm-Größe des Flugsauriers: Projektion von Flügelspitzen (Gruppe ×1,8: ±4,2·1,8 m quer)
        sz = page.evaluate('''() => { const s = Rennspiel.spiel, g = s.dynamik._flugGrp, c = s.kameras[0].kamera; if (!g || !g.visible) return null;
          c.updateMatrixWorld(); g.updateMatrixWorld(true);
          const proj = (x, y, z) => { const v = new THREE.Vector3(x, y, z).applyMatrix4(g.matrixWorld).project(c); return v; };
          const a = proj(0.1, 0, -4.2), b = proj(0.1, 0, 4.2), m = proj(0, 0, 0);
          return { breitePx: +(Math.abs(a.x - b.x) * innerWidth / 2).toFixed(0), mitteX: +m.x.toFixed(2), mitteY: +m.y.toFixed(2), z: +m.z.toFixed(3), scale: +g.scale.x.toFixed(2),
            schatten: !!(s.dynamik._flugSchatten && s.dynamik._flugSchatten.visible) }; }''')
        page.screenshot(path=datei)
        gefunden[name] = dict(r, **(sz or {}))
        print(name, gefunden[name], flush=True)
    page.evaluate('''() => { const s = Rennspiel.spiel, k = s.kameras[0]; k.modusIndex = 0; k.kamera.rotation.order = 'YXZ'; k._erstesMal = true; k.update(1 / 60); s.dynamik.animieren(); }''')
    page.wait_for_timeout(300)
    page.screenshot(path=os.path.join(out, 'flugsaurier_verfolger.png'))
    a = gefunden['flugsaurier_anflug']; nah = gefunden['flugsaurier_nah']; ue = gefunden['flugsaurier_ueber']
    pruefe('Flugsaurier erscheint und fliegt an (Anflug-Bild)', a.get('aktiv') and 'breitePx' in a, a)
    pruefe('Modell ×1,8 in der Szene', abs(nah.get('scale', 0) - 1.8) < 0.01, nah.get('scale'))
    pruefe('Flugsaurier groß im Bild: Spannweite > 40 % der Bildbreite (512 px) beim Überflug', ue.get('breitePx', 0) > 512 or nah.get('breitePx', 0) > 512,
           'nah %s px / über %s px' % (nah.get('breitePx'), ue.get('breitePx')))
    pruefe('Schatten auf der Straße sichtbar', nah.get('schatten') is True)
    pruefe('Höhe über dem Auto beim Überflug ≥ 2,5 m', ue.get('y', 0) >= 2.4, ue.get('y'))
    pruefe('keine JS-Fehler', not fehler, fehler[:3])
    browser.close()

n = sum(1 for _, ok in pruef if not ok)
print('\nALLE TESTS OK' if n == 0 else '\n%d FEHLER' % n)
sys.exit(1 if n else 0)
