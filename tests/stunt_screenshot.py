#!/usr/bin/env python3
"""Runde 4 (W2-D): Screenshots Sprungschanzen + Turbo-Felder + Schild (Playwright, headless).
main.js baut Schanzen/Pickups (noch) nicht ein → die Testseite lädt src/track/schanze.js und src/world/pickups.js nach
(VOR dem Rennstart, damit strecke.bauen() Rampen und Turbo-Felder baut) und hängt Flug/Faktoren/Pickups so ein,
wie es die Einbau-Anleitung für main.js beschreibt (Wrapper um vehicle.schritt, physikSchritt und zeichnen).
Aufruf: python3 tests/stunt_screenshot.py [ausgabeordner]   (Standard tests/out/stunt)
Bilder: 01_wald_rampe_vorne, 02_wald_flug_seite, 03_wald_flug_hinten, 04_fantasie_turbo_feld, 05_fantasie_turbo_flammen,
        06_fantasie_schild_kugel, 07_fantasie_auto_schild
Prüft: keine JS-Fehler, Flug tatsächlich (Höhe über Boden > 1 m), Turbo aktiv, Schild aufgesammelt."""
import sys, os, json
from playwright.sync_api import sync_playwright

basis = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
aus = sys.argv[1] if len(sys.argv) > 1 else os.path.join(basis, 'tests', 'out', 'stunt')
os.makedirs(aus, exist_ok=True)
url = 'file://' + os.path.join(basis, 'Autorennen.html')
SKRIPTE = [os.path.join(basis, 'src', 'track', 'schanze.js'), os.path.join(basis, 'src', 'world', 'pickups.js')]

# Einbau wie in der Anleitung (main.js): Flug ersetzt vehicle.schritt, Faktoren nur um vehicle.schritt, y aus dem
# Flugzustand nach dem Physikschritt, Pickups.schritt je Physikschritt, Nicken + animieren je Frame.
EINBAUEN = '''() => { const s = Rennspiel.spiel, R = Rennspiel, st = s.strecke;
  const pk = new R.Pickups(st); s.pickups = pk; s.szene.add(pk.bauen()); s._ev = [];
  s.fahrzeuge.forEach((f, i) => { f.flug = R.Schanzen.zustand(); const v = f.vehicle, orig = v.schritt.bind(v);
    v.schritt = (dt, x, h, u) => { const fz = f.flug;
      if (fz.aktiv) { const e = R.Schanzen.flugSchritt(fz, v, st, x, dt); if (e) s._ev.push(i + ':' + e); return; }
      const n = st.abfrage(v.x, v.z), xA = v.x, zA = v.z, fk = pk.faktoren(i), d = v.daten, vm0 = d.vMax, b0 = d.beschleunigung;
      d.vMax = vm0 * fk.vMax; d.beschleunigung = b0 * fk.beschleunigung;
      orig(dt, x, h, u);
      d.vMax = vm0; d.beschleunigung = b0;
      const e = R.Schanzen.nachSchritt(fz, v, st, n, xA, zA, dt); if (e) s._ev.push(i + ':' + e); }; });
  const ps = s.physikSchritt.bind(s);
  s.physikSchritt = (dt) => { ps(dt);
    s.fahrzeuge.forEach((f) => { f.vehicle.y = R.Schanzen.hoehe(f.flug, f.vehicle, st); });
    pk.schritt(dt, s.fahrzeuge).forEach(e => s._ev.push(e.nr + ':' + e.typ));
  };
  const z = s.zeichnen.bind(s);
  s.zeichnen = () => { s.fahrzeuge.forEach((f) => { f.mesh.rotation.x += R.Schanzen.anzeigeNicken(f.flug, 1); });
    pk.animieren(performance.now() / 1000, s.fahrzeuge); z(); };
  return { schanzen: R.Schanzen.liste(st).map(e => e.grad + '°@' + Math.round(e.s)), felder: pk.felder.length, kugeln: pk.kugeln.length,
    gruppe: s.szene.children.some(c => c.name && c.name.startsWith('Strecke') && c.getObjectByName('SchanzenKeile')) }; }'''

# Spielerauto an s (Seitenabstand q, Tempo v), Gegner weit weg; Steuerung des Spielers fest (gas, lenkung 0)
SETZEN = '''([s0, q, v0, gas]) => { const s = Rennspiel.spiel, sp = s.strecke.spline, R = Rennspiel;
  s.fahrzeuge.forEach((f, i) => { const p = sp.punktBei(s0 - 60 * i), qq = i === 0 ? q : 40;
    f.vehicle.setzen(p.x + p.nx * qq, p.z + p.nz * qq, R.headingAus(p.tx, p.tz)); f.index = -1;
    if (f.flug) R.Schanzen.abbrechen(f.flug, f.vehicle);
    if (i === 0) f.vehicle.vLaengs = v0; else if (f.driver) f.driver.steuerung = () => ({ gas: 0, bremse: 1, lenkung: 0 }); });
  s.input.steuerung = () => ({ gas, bremse: 0, lenkung: 0 });
  if (s.pickups) s.pickups.zuruecksetzen();
  s.fahrzeuge.forEach(f => s._vorherAngleichen(f));
  s.kameras[0]._erstesMal = true; s.pausiert = false; }'''

INFO = '''() => { const s = Rennspiel.spiel, f = s.fahrzeuge[0], v = f.vehicle, st = s.strecke, pk = s.pickups;
  return { y: +(v.y - st.hoeheAn(v.x, v.z)).toFixed(2), flug: !!(f.flug && f.flug.aktiv), t: f.flug ? +f.flug.t.toFixed(2) : 0,
    fluege: f.flug ? f.flug.fluege : 0, kmh: Math.round(v.vLaengs * 3.6), turbo: pk ? pk.turboAktiv(0) : null,
    schild: pk ? pk.hatSchild(0) : null, ev: s._ev.slice(-6), drawCalls: s.renderer.info.render.calls, pausiert: s.pausiert }; }'''

KAMERA_SEITE = '''([seite, hoch, zurueck]) => { const s = Rennspiel.spiel, k = s.kameras[0], v = s.fahrzeuge[0].vehicle, d = s.fahrzeuge[0].anzeige;
  const r = v.richtung(), q = v.rechts();
  k.kamera.position.set(d.x + q.x * seite - r.x * zurueck, d.y + hoch, d.z + q.z * seite - r.z * zurueck);
  k.kamera.up.set(0, 1, 0); k.kamera.lookAt(d.x + r.x * 2, d.y + 0.6, d.z + r.z * 2); }'''

# Kamera fest an einer Streckenstelle (s, Seitenabstand q, Höhe h über dem Boden), Blick auf das Auto
KAMERA_PUNKT = '''([s0, q, h]) => { const s = Rennspiel.spiel, st = s.strecke, k = s.kameras[0], d = s.fahrzeuge[0].anzeige;
  const p = st.spline.punktBei(s0), x = p.x + p.nx * q, z = p.z + p.nz * q;
  k.kamera.position.set(x, st.hoeheAn(x, z) + h, z); k.kamera.up.set(0, 1, 0); k.kamera.lookAt(d.x, d.y + 0.5, d.z); }'''

ergebnisse, fehler = {}, []


def warte_bis(page, bedingung, max_s=20):
    """Physik ohne Zeichnen vorspulen (Headless-Rendering ist zu langsam für Echtzeit), bis die Bedingung (JS-Ausdruck
    mit s, f, pk) wahr ist; dann pausieren, Anzeige = Physikzustand, Verfolger-Kamera neu ausrichten."""
    ok = page.evaluate("""([b, maxS]) => { const s = Rennspiel.spiel, f = s.fahrzeuge[0], pk = s.pickups, dt = Rennspiel.config.physik.schritt;
      const fn = new Function('s', 'f', 'pk', 'return ' + b);
      let ok = false;
      for (let k = 0; k < maxS / dt; k++) { s.physikSchritt(dt); if (fn(s, f, pk)) { ok = true; break; } }
      s.pausiert = true;
      s.fahrzeuge.forEach((g) => { const v = g.vehicle, d = g.anzeige; d.x = v.x; d.y = v.y; d.z = v.z; d.heading = v.heading; d.nicken = v.nicken; d.neigung = v.neigung; s._vorherAngleichen(g); });
      const k = s.kameras[0]; k._erstesMal = true; for (let i = 0; i < 30; i++) k.update(dt);
      return ok; }""", [bedingung, max_s])
    if not ok:
        fehler.append('Bedingung nicht erreicht: ' + bedingung)


def rennen(page, strecke, welt):
    page.goto(url)
    page.wait_for_timeout(1000)
    for p in SKRIPTE:
        page.add_script_tag(path=p)
    page.evaluate("([id, welt]) => Rennspiel.spiel.rennenStarten({ modus: 'solo', streckeId: id, welt, autoIds: ['troc-cabrio', 'multivan'], runden: 3, gegner: 1, schwierigkeit: 'mittel', fahrhilfe: ['viel', 'viel'] })", [strecke, welt])
    page.wait_for_timeout(400)
    page.evaluate('() => Rennspiel.spiel.schnellvorlauf(4.5)')      # Countdown vorbei
    return page.evaluate(EINBAUEN)


def bild(page, name, extra=None):
    page.wait_for_timeout(500)
    info = page.evaluate(INFO)
    if extra:
        info.update(extra)
    page.screenshot(path=os.path.join(aus, name + '.png'))
    ergebnisse[name] = info
    print(name, json.dumps(info, ensure_ascii=False))
    return info


with sync_playwright() as pw:
    browser = pw.chromium.launch(args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
    page = browser.new_page(viewport={'width': 1280, 'height': 800})
    js_fehler = []
    page.on('pageerror', lambda e: js_fehler.append(str(e)))

    # ---------- Wald, Welt Stunt: Schanze 12° bei s = 2082 ----------
    e = rennen(page, 'wald', 'stunt')
    print('Einbau Wald:', e)
    if not e['gruppe']: fehler.append('Wald: SchanzenKeile nicht in der Strecken-Gruppe')
    s12 = 2082
    page.evaluate(SETZEN, [s12 - 32, 1.5, 0, 0])
    page.wait_for_timeout(1500)
    page.evaluate('() => { Rennspiel.spiel.pausiert = true; }')
    bild(page, '01_wald_rampe_vorne')
    page.evaluate(SETZEN, [s12 - 45, 0.5, 30, 1])
    warte_bis(page, 'f.flug.aktiv && f.flug.t > 0.55')
    page.evaluate(KAMERA_SEITE, [13, 1.5, 3])
    i = bild(page, '02_wald_flug_seite')
    if not (i['flug'] and i['y'] > 1): fehler.append('Wald: Auto nicht im Flug (%s)' % i)
    page.evaluate(SETZEN, [s12 - 45, 0.5, 30, 1])
    warte_bis(page, 'f.flug.aktiv && f.flug.t > 0.75')
    page.evaluate(KAMERA_PUNKT, [s12 - 6, -3, 1.6])
    i = bild(page, '03_wald_flug_hinten')
    if not i['flug']: fehler.append('Wald: Flug (hinten) fehlt')
    warte_bis(page, 'f.flug.landungen >= 1')
    i = page.evaluate(INFO)
    print('nach Landung', i)
    if not any('landung' in x for x in i['ev']): fehler.append('Wald: keine Landung gemeldet %s' % i['ev'])

    # ---------- Fantasie, Welt Verrückt: Turbo-Feld s = 680, Schild s = 400 ----------
    e = rennen(page, 'fantasie', 'verrueckt')
    print('Einbau Fantasie:', e)
    page.evaluate(SETZEN, [680 - 26, 0, 0, 0])
    page.wait_for_timeout(1500)
    page.evaluate('() => { Rennspiel.spiel.pausiert = true; }')
    bild(page, '04_fantasie_turbo_feld')
    page.evaluate(SETZEN, [680 - 30, 0, 28, 1])
    warte_bis(page, 'pk.turboAktiv(0) && pk.autos[0].turbo < 2.0')
    page.evaluate(KAMERA_SEITE, [-3.5, 1.4, 7])
    i = bild(page, '05_fantasie_turbo_flammen')
    if not i['turbo']: fehler.append('Fantasie: Turbo nicht aktiv')
    page.evaluate(SETZEN, [400 - 22, 0, 0, 0])
    page.wait_for_timeout(1500)
    page.evaluate('() => { Rennspiel.spiel.pausiert = true; }')
    bild(page, '06_fantasie_schild_kugel')
    page.evaluate(SETZEN, [400 - 14, 0, 11, 0])
    warte_bis(page, 'pk.hatSchild(0) && (pk._t = (pk._t || 0) + 1) > 20')
    page.evaluate(KAMERA_SEITE, [6, 2.2, 5])
    i = bild(page, '07_fantasie_auto_schild')
    if not i['schild']: fehler.append('Fantasie: kein Schild')
    browser.close()

if js_fehler: fehler.append('JS-Fehler: ' + '; '.join(js_fehler))
with open(os.path.join(aus, 'ergebnis.json'), 'w') as d:
    json.dump({'ergebnisse': ergebnisse, 'fehler': fehler}, d, ensure_ascii=False, indent=1)
print('\nFEHLER:\n' + '\n'.join(fehler) if fehler else '\nSTUNT-SCREENSHOTS OK')
sys.exit(1 if fehler else 0)
