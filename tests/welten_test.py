#!/usr/bin/env python3
"""Runde 4 (Integration, Agent F): alle Strecken × alle Welten mit Schaden AN, Regen, Wind 3, 10 Gegner (Playwright, headless).
Aufruf: python3 tests/welten_test.py [streckeId ...]   (Standard: alle Strecken)
Je Strecke/Welt: rennenStarten (5 Runden, damit auf Fantasie nach 200 s noch niemand im Ziel ist) + autopilot(0) + schnellvorlauf(200). Prüft:
  keine JS-Fehler, keine NaN, alle Gegner Fortschritt > 0, Schaden-Prozent aller Autos 0..100,
  Welt „verrueckt": mindestens ein Turbo-Ereignis, Welt „stunt": mindestens ein Flug (Zähler f.flug.fluege).
Danach ein Bild je Strecke/Welt (tests/out/welten/<strecke>_<welt>.png): Stunt/Verrückt = Spielerauto im Flug über
der ersten Schanze (falls vorhanden), Hindernisse = vor dem ersten Wrack, sonst Rennszene. Physik + Kamera werden dafür
synchron weitergerechnet und dann angehalten (spiel.pausiert direkt, ohne Pause-Fenster) → Draw-Calls je Bild.
Zusätzlich (nur wenn 'wiese' dabei ist): Regression – rennenStarten({streckeId:'wiese'}) ohne weitere Felder =
Klassisch, kein Wetter, kein Schaden, keine Hindernisse/Pickups/Dynamik; und Bahnen der Autos nach 60 s bitgleich
mit einem Lauf, in dem schanze.js/pickups.js/schaden.js fehlen (= Stand vor Runde 4)."""
import sys, os, json
from playwright.sync_api import sync_playwright

basis = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
aus = os.path.join(basis, 'tests', 'out', 'welten'); os.makedirs(aus, exist_ok=True)
url = 'file://' + os.path.join(basis, 'Autorennen.html')
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']

# Zähler: Wrack-/Brand-Treffer der KI und Liegenbleiben/Abschleppen (über Hooks, ohne Spielcode zu ändern)
STARTEN = '''([sid, welt]) => { const s = Rennspiel.spiel, R = Rennspiel;
  s.rennenStarten({ modus: 'solo', streckeId: sid, welt, schaden: true, wetter: 'regen', jahreszeit: 'sommer', windStaerke: 3,
    gegner: 10, runden: 5, schwierigkeit: 'mittel', autoIds: ['troc-cabrio', 'multivan'], fahrhilfe: ['wenig', 'wenig'] });
  s.autopilot(0);
  s._zaehl = { wrackKI: 0, wrackSpieler: 0, liegen: 0, abschleppen: 0, kiAbgeschleppt: 0 };
  if (!R.Kollisionen._orig) R.Kollisionen._orig = R.Kollisionen.hindernisse;
  R.Kollisionen.hindernisse = function () { const l = R.Kollisionen._orig.apply(this, arguments);
    l.forEach(h => { if (h.typ === 'wrack' || h.typ === 'brand') { if (Rennspiel.spiel.fahrzeuge[h.nr].istSpieler) s._zaehl.wrackSpieler++; else s._zaehl.wrackKI++; } });
    return l; };
  if (s.schaden) s.schaden.bei((e) => { if (e.art === 'liegengeblieben') s._zaehl.liegen++;
    if (e.art === 'abschleppen') { s._zaehl.abschleppen++; if (!s.fahrzeuge[e.i].istSpieler) s._zaehl.kiAbgeschleppt++; } });
  return { welt: s.strecke.welt, gegner: s.fahrzeuge.length - 1, schaden: !!(s.schaden && s.schaden.an), wetter: s.einstellungen.wetter,
    wind: s.wetter ? s.wetter.windStaerke : null, schanzen: s.strecke.schanzen.length, felder: s.pickups ? s.pickups.felder.length : 0,
    kugeln: s.pickups ? s.pickups.kugeln.length : 0, wracks: s.strecke.hindernisse.filter(h => h.typ === 'wrack' || h.typ === 'brand').length,
    stroh: s.dynamik ? s.dynamik.strohStellen.length : 0 }; }'''

ZUSTAND = '''() => { const s = Rennspiel.spiel, r = s.rennen, pk = s.pickups;
  const autos = s.fahrzeuge.map((f, i) => { const v = f.vehicle, t = r.teilnehmer[i], z = s.schaden ? s.schaden.zustand(i) : { prozent: 100 };
    return { name: t.name, spieler: !!f.istSpieler, runde: t.runde, fortschritt: Math.round(t.fortschritt), prozent: z.prozent,
      nan: [v.x, v.y, v.z, v.heading, v.vLaengs, v.vQuer, t.fortschritt, z.prozent].some(x => !isFinite(x)),
      fluege: f.flug ? f.flug.fluege : 0, schraeg: f.flug ? f.flug.schraeg : 0,
      turbos: pk && pk.autos[i] ? pk.autos[i].turbos : 0, schilde: pk && pk.autos[i] ? pk.autos[i].schilde : 0,
      abgefangen: pk && pk.autos[i] ? pk.autos[i].abgefangen : 0, resets: f.driver ? f.driver.resets || 0 : null }; });
  return { autos, zaehl: s._zaehl, vMaxRest: s.fahrzeuge.every(f => !f.vehicle.datenBasis || Math.abs(f.vehicle.daten.vMax -
    f.vehicle.datenBasis.vMax * (1 - 0.04 * s.schaden.zustand(s.fahrzeuge.indexOf(f)).stufe)) < 1e-9) }; }'''

# Bild vorbereiten: Spielerauto an s0 setzen (Tempo v0), dann synchron Physik + Kamera rechnen, bis bedingung erfüllt
# ('flug' = 0,35 s in der Luft, sonst feste Schrittzahl), dann anhalten (pausiert ohne Fenster) und zeichnen lassen.
BILD = '''([s0, q, v0, art, schritte]) => { const s = Rennspiel.spiel, R = Rennspiel, f = s.fahrzeuge[0], v = f.vehicle, sp = s.strecke.spline;
  if (s0 !== null) { const p = sp.punktBei(s0);
    v.setzen(p.x + p.nx * q, p.z + p.nz * q, R.headingAus(p.tx, p.tz)); v.vLaengs = v0; v.y = s.strecke.hoeheAn(v.x, v.z);
    if (f.flug) R.Schanzen.abbrechen(f.flug, v); if (f.autopilot) f.autopilot.zurueckgesetzt(); f.index = -1; s._vorherAngleichen(f); }
  const k = s.kameras[0]; k._erstesMal = true;
  const sync = () => { s.fahrzeuge.forEach((g) => { const d = g.anzeige, w = g.vehicle; d.x = w.x; d.y = w.y; d.z = w.z; d.heading = w.heading; d.nicken = w.nicken; d.neigung = w.neigung; }); k.update(1 / 60); };
  let n = 0;
  for (; n < schritte; n++) { s.physikSchritt(1 / 60); sync();
    if (art === 'flug' && f.flug && f.flug.aktiv && f.flug.t > 0.25) break; }
  s.uhr.rest = 0; s.pausiert = true;
  // Flug: Kamera seitlich-hinten (Rampe + Auto in der Luft im Bild); angehalten → frame() bewegt die Kamera nicht
  if (art === 'flug') { const d = f.anzeige, r = v.richtung(), qv = v.rechts(), c = k.kamera;
    c.position.set(d.x + qv.x * 13 - r.x * 15, s.strecke.hoeheAn(d.x, d.z) + 3.2, d.z + qv.z * 13 - r.z * 15);
    c.up.set(0, 1, 0); c.lookAt(d.x - r.x * 4, d.y, d.z - r.z * 4); }
  document.querySelectorAll('.hud-banner').forEach(b => { b.className = 'hud-banner'; });
  return { schritte: n, flug: !!(f.flug && f.flug.aktiv), hoehe: +(v.y - s.strecke.hoeheAn(v.x, v.z)).toFixed(2), kmh: v.tempoKmh,
    prozent: s.schaden ? s.schaden.zustand(0).prozent : null }; }'''

def strecken_welten(page):
    return page.evaluate("() => Rennspiel.trackCatalog.map(d => [d.id, Object.keys(d.welten || { klassisch: 1 })])")

def regression(browser, fehler_global):
    """rennenStarten({streckeId:'wiese'}) = Klassisch ohne Extras; Bahnen bitgleich mit/ohne Runde-4-Module."""
    erg = {}
    for ohne in (False, True):
        page = browser.new_page(viewport={'width': 1280, 'height': 800})
        fehler = []
        page.on('pageerror', lambda e: fehler.append(str(e)))
        page.on('console', lambda m: fehler.append('console.error: ' + m.text) if m.type == 'error' else None)
        page.goto(url); page.wait_for_timeout(1200)
        # W3-G: auch Münzen/Garage weg – Münzen dürfen die Bahnen nicht verändern (nur Einsammeln, kein Stoß)
        if ohne: page.evaluate("() => { delete Rennspiel.Schanzen; delete Rennspiel.Pickups; delete Rennspiel.Schaden; delete Rennspiel.Muenzen; delete Rennspiel.Garage; }")
        info = page.evaluate('''() => { const s = Rennspiel.spiel; s.laeuft = false;   // keine echten Frames: nur der Schnellvorlauf zählt
          s.rennenStarten({ streckeId: 'wiese' });
          const r = { welt: s.strecke.welt, wetter: s.einstellungen.wetter, wind: s.einstellungen.windStaerke, schadenEinst: s.einstellungen.schaden,
            schadenAn: !!(s.schaden && s.schaden.an), hindernisse: s.strecke.hindernisse.length, pickups: s.pickups, dynamik: s.dynamik,
            schanzen: s.strecke.schanzen.length, gegner: s.fahrzeuge.length - 1 };
          s.schnellvorlauf(60);
          r.bahn = s.fahrzeuge.map(f => [f.vehicle.x, f.vehicle.z, f.vehicle.heading, f.vehicle.vLaengs, f.vehicle.y]);
          r.muenzen = s.muenzen ? [s.muenzen.anzahl, s.muenzen.anzahl - s.muenzen.uebrig] : null;
          return r; }''')
        info['fehler'] = fehler; fehler_global.extend(fehler)
        erg['ohne' if ohne else 'mit'] = info
        page.close()
    m, o = erg['mit'], erg['ohne']
    gleich = m['bahn'] == o['bahn']
    abw = max(abs(a - b) for x, y in zip(m['bahn'], o['bahn']) for a, b in zip(x, y))
    pruef = [('Regression: Welt klassisch, Wetter klar, Wind 0, Schaden aus', m['welt'] == 'klassisch' and m['wetter'] == 'klar' and m['wind'] == 0 and m['schadenEinst'] is False and not m['schadenAn'],
              {k: m[k] for k in ('welt', 'wetter', 'wind', 'schadenEinst', 'schadenAn')}),
             ('Regression: keine Hindernisse, keine Pickups, keine Dynamik, keine Schanzen', m['hindernisse'] == 0 and m['pickups'] is None and m['dynamik'] is None and m['schanzen'] == 0,
              {k: m[k] for k in ('hindernisse', 'pickups', 'dynamik', 'schanzen')}),
             ('Regression: Bahnen nach 60 s bitgleich mit/ohne schanze.js+pickups.js+schaden.js+muenzen.js+garage.js', gleich, 'max. Abweichung %.3g' % abw),
             ('Regression: Münzen liegen (Klassisch) und werden dabei eingesammelt [anzahl, eingesammelt]', bool(m.get('muenzen')) and m['muenzen'][1] > 0 and o.get('muenzen') is None, [m.get('muenzen'), o.get('muenzen')])]
    return pruef

def main():
    nur = sys.argv[1:]
    alle_pruef = []
    tabelle = []
    with sync_playwright() as p:
        browser = p.chromium.launch(args=ARGS)
        fehler_global = []
        page = browser.new_page(viewport={'width': 1280, 'height': 800})
        page.goto(url); page.wait_for_timeout(1200)
        liste = [(sid, w) for sid, welten in strecken_welten(page) for w in welten if not nur or sid in nur]
        page.close()
        for sid, welt in liste:
            page = browser.new_page(viewport={'width': 1280, 'height': 800})
            fehler = []
            page.on('pageerror', lambda e: fehler.append(str(e)))
            page.on('console', lambda m: fehler.append('console.error: ' + m.text) if m.type == 'error' else None)
            page.goto(url); page.wait_for_timeout(1200)
            start = page.evaluate(STARTEN, [sid, welt])
            page.wait_for_timeout(300)
            page.evaluate('() => Rennspiel.spiel.schnellvorlauf(200)')
            z = page.evaluate(ZUSTAND)
            autos = z['autos']; gegner = [a for a in autos if not a['spieler']]
            fluege = sum(a['fluege'] for a in autos); turbos = sum(a['turbos'] for a in autos)
            tag = '[%s/%s]' % (sid, welt)
            pr = [(tag + ' keine JS-Fehler', not fehler, fehler[:3]),
                  (tag + ' keine NaN', not any(a['nan'] for a in autos), ''),
                  (tag + ' 10 Gegner, alle Fortschritt > 0', len(gegner) == 10 and all(a['fortschritt'] > 0 for a in gegner),
                   [a['fortschritt'] for a in gegner]),
                  (tag + ' Schaden-Prozent 0..100 (Schaden an)', start['schaden'] and all(0 <= a['prozent'] <= 100 for a in autos),
                   [a['prozent'] for a in autos]),
                  (tag + ' Schaden-Fahrwerte = Basis × Stufe (Turbo exakt zurückgeschrieben)', z['vMaxRest'], '')]
            if welt == 'verrueckt': pr.append((tag + ' mindestens ein Turbo-Ereignis', turbos >= 1, 'Turbos %d' % turbos))
            if welt == 'stunt': pr.append((tag + ' mindestens ein Flug', fluege >= 1, 'Flüge %d' % fluege))
            # Liegenbleiben → Abschleppen (KI-Auto 3): 5 s Stillstand, dann Reset am Checkpoint mit 60 %, KI fährt weiter
            ab = page.evaluate('''() => { const s = Rennspiel.spiel, i = 3, f = s.fahrzeuge[i], sc = s.schaden, t = s.rennen.teilnehmer[i];
              sc.z[i].abkling = 0; sc._punkteSetzen(i, 5); sc.treffer(i, 'hindernis', 5);
              const r = { gesperrt: sc.gesperrt(i), x0: f.vehicle.x, z0: f.vehicle.z };
              s.schnellvorlauf(2.5); r.tempoLiegen = f.vehicle.tempo; r.nochGesperrt = sc.gesperrt(i);
              const fo = t.fortschritt; s.schnellvorlauf(3); r.danach = sc.zustand(i).prozent; r.gesperrtDanach = sc.gesperrt(i);
              r.versetzt = Math.hypot(f.vehicle.x - r.x0, f.vehicle.z - r.z0) > 0.5; r.brauchtReset = f.driver.brauchtReset;
              const fo2 = t.fortschritt; s.schnellvorlauf(8); r.weiter = Math.round(t.fortschritt - fo2); r.zaehl = s._zaehl; return r; }''')
            pr.append((tag + ' KI liegengeblieben → 5 s still → abgeschleppt (60 %) → fährt weiter',
                       ab['gesperrt'] and ab['nochGesperrt'] and ab['tempoLiegen'] < 0.01 and not ab['gesperrtDanach'] and ab['danach'] == 60
                       and ab['versetzt'] and not ab['brauchtReset'] and ab['weiter'] > 50 and ab['zaehl']['kiAbgeschleppt'] >= 1, ab))
            # Bild
            st = page.evaluate("() => { const s = Rennspiel.spiel, L = s.strecke; const sch = Rennspiel.Schanzen ? Rennspiel.Schanzen.liste(L) : [];"
                               " const w = L.hindernisse.filter(h => h.typ === 'wrack' || h.typ === 'brand');"
                               " return { schanze: sch.length ? sch[0].s : null, wrack: w.length ? { s: w[0].s, q: w[0].seitenabstand, typ: w[0].typ } : null }; }")
            if st['schanze'] is not None and welt in ('stunt', 'verrueckt'):
                bild = page.evaluate(BILD, [st['schanze'] - 50, 0, 33, 'flug', 400])
                if welt == 'stunt': pr.append((tag + ' Bild: Spielerauto im Flug', bild['flug'] and bild['hoehe'] > 0.8, bild))
            elif st['wrack'] is not None and welt == 'hindernisse':
                bild = page.evaluate(BILD, [st['wrack']['s'] - 26, -st['wrack']['q'] * 0.5, 8, '', 20])
            else:
                bild = page.evaluate(BILD, [None, 0, 0, '', 1])
            page.wait_for_timeout(700)    # einige echte Frames (angehalten): Meshes, HUD, Draw-Calls
            dc = page.evaluate('() => { const L = Rennspiel.spiel.leistung(); return { drawCalls: L.drawCalls, dreiecke: Math.round(L.dreiecke / 1000) }; }')
            datei = os.path.join(aus, '%s_%s.png' % (sid, welt))
            page.screenshot(path=datei)
            tabelle.append({'strecke': sid, 'welt': welt, 'drawCalls': dc['drawCalls'], 'dreieckeK': dc['dreiecke'], 'fluege': fluege, 'turbos': turbos,
                            'schilde': sum(a['schilde'] for a in autos), 'abgefangen': sum(a['abgefangen'] for a in autos),
                            'prozentMin': min(a['prozent'] for a in autos), 'zaehl': z['zaehl'], 'kiResets': sum(a['resets'] or 0 for a in gegner),
                            'runden': [a['runde'] for a in gegner], 'start': start, 'bild': bild})
            alle_pruef += pr
            fehler_global += fehler
            page.close()
        if not nur or 'wiese' in nur:
            alle_pruef += regression(browser, fehler_global)
        browser.close()
    print(json.dumps(tabelle, indent=1, ensure_ascii=False))
    print('\nStrecke/Welt            Draw-Calls  Dreiecke  Flüge  Turbos  Schilde  min%  Liegen  KI-Wrack  KI-Resets')
    for t in tabelle:
        print('%-22s %10d %8dk %6d %7d %8d %5d %7d %9d %10d' % (t['strecke'] + '/' + t['welt'], t['drawCalls'], t['dreieckeK'], t['fluege'], t['turbos'],
              t['schilde'], t['prozentMin'], t['zaehl']['liegen'], t['zaehl']['wrackKI'], t['kiResets']))
    for name, ok, info in alle_pruef:
        print(('OK   ' if ok else 'FEHL ') + name + (' – ' + json.dumps(info, ensure_ascii=False) if info != '' else ''))
    sys.exit(0 if all(ok for _, ok, _ in alle_pruef) else 1)

if __name__ == '__main__':
    main()
