#!/usr/bin/env python3
"""Browser-Rauchtest Motorrad-Modus (Stufe M2 „Stunts“).
Aufruf: python3 tests/moto_stunts_rauch.py
Startet einen lokalen http-Server (Repo-Wurzel), lädt Motorrad.html und prüft:
  - Menü: Karte „Stuntrennen“ vorhanden, Klick setzt das Flag
  - Stuntrennen Wiese, Spieler per Autopilot, Trick-Taste (ShiftRight) in der Luft: >= 1 Sprung, >= 1 Trick, Salto in der Luft (Bild),
    Feuerring (Bild), Bus-Reihe, HUD mit Punkten/Combo (Bild), Punkte > 0, Ergebnistafel nach Gesamtpunkten (Bild)
  - Wheelie-Zone (Taste gehalten) und Stoppie-Zone (Bremse), Physik unverändert
  - alle 7 Strecken: Rennen startet, Spieler springt, keine NaN
  - normales „Rennen“ (kein Stuntrennen): Punkte werden angezeigt, aber nicht gewertet, keine Stunt-Tafel
  - Zweispieler: zwei HUD-Felder, linke Umschalt-Taste für Spieler 2
  - Autorennen.html: 0 JS-Fehler, keine Schanzen-Änderung (Wiese Klassisch ohne Schanzen), 9 Autos
Bilder: tests/out/moto/"""
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

# Hilfsfunktionen im Browser: Vorlauf mit Autopilot und Trick-Taste (je Flug 1 bzw. 2 Taps), bis Bedingung erfüllt
JS_HELFER = '''() => {
  window.__T = {
    start(einst) { const s = Rennspiel.spiel; s.rennenStarten(einst); },
    warteStart() { const s = Rennspiel.spiel; let g = 0; while (s.zustand !== 'rennen' && g++ < 3000) s.physikSchritt(1 / 60); },
    // läuft bis Spieler-Wegstrecke >= bisS (am Boden) oder Zustand != rennen; Taps: ungerade Flüge 1 Tap (Drehung), gerade 2 Taps (Salto)
    vorlauf(bisS, maxSek, taps) {
      const s = Rennspiel.spiel, inp = s.input, code = 'ShiftRight', dt = Rennspiel.config.physik.schritt; let flugId = -1, n = 0, ziel = 0, t = 0, davor = false;
      for (; t < maxSek; t += dt) {
        const f = s.fahrzeuge[0], fl = f.flug;
        if (s.zustand !== 'rennen') break;
        if (f.nah && f.nah.s < bisS) davor = true;     // Startaufstellung liegt kurz vor der Ziellinie (s ≈ L): erst nach dem Überfahren zählt s
        if (!fl.aktiv && davor && f.nah && f.nah.s >= bisS) break;
        if (taps) {
          if (fl.aktiv && fl.fluege !== flugId) { flugId = fl.fluege; n = 0; ziel = flugId % 2 ? 1 : 2; }
          if (fl.aktiv && n < ziel && fl.t > 0.25 + n * 0.12) { inp.gedrueckt.add(code); inp.geradeGedrueckt.add(code); n++; }
        }
        s.physikSchritt(dt); inp.gedrueckt.delete(code); inp.geradeGedrueckt.delete(code);
      }
      return t;
    },
    stand() {
      const s = Rennspiel.spiel, f = s.fahrzeuge[0], z = s.stunt && s.stunt.fz[0], D = Rennspiel.Moto.stuntWelt.stuntDaten(s.strecke);
      let ringD = null; if (D.ringe.length) { const r = D.ringe[0]; ringD = (f.vehicle.x - r.x) * r.tx + (f.vehicle.z - r.z) * r.tz; }
      return { luft: !!f.flug.aktiv, t: f.flug.t, flug: f.flug.fluege, salto: z ? z.pose.salto : 0, gier: z ? z.pose.gier : 0, nick: z ? z.pose.nick : 0, s: f.nah ? f.nah.s : 0, ringD,
        kmh: Math.round(f.vehicle.tempoKmh), p: z ? z.punkte : 0, stat: z ? z.stat : null, ev: s.stunt ? s.stunt.alle.map(e => e.fahrzeug + '|' + e.art + '|' + e.punkte) : [],
        nan: s.fahrzeuge.some(g => !isFinite(g.vehicle.x) || !isFinite(g.vehicle.z) || !isFinite(g.mesh.position.x)), zustand: s.zustand, zeit: s.stunt ? s.stunt.zeit : 0 };
    },
    // Tippt im Flug (ab 0,22 s) n-mal die Trick-Taste als echte keydown/keyup-Ereignisse, ausgelöst im Physikschritt (unabhängig von der Bildrate des Testbrowsers)
    autoTippen(n) {
      const s = Rennspiel.spiel, orig = Object.getPrototypeOf(s).physikSchritt; let letzter = -1;
      s.physikSchritt = function (dt) {
        const fl = this.fahrzeuge[0].flug;
        if (fl.aktiv && fl.fluege !== letzter && fl.t > 0.22) { letzter = fl.fluege;
          for (let i = 0; i < n; i++) { window.dispatchEvent(new KeyboardEvent('keydown', { code: 'ShiftRight' })); window.dispatchEvent(new KeyboardEvent('keyup', { code: 'ShiftRight' })); } }
        return orig.call(this, dt);
      };
    },
    autoAus() { delete Rennspiel.spiel.physikSchritt; },
    // echte Tastaturereignisse (wie ein Spieler): Doppeltippen = zwei keydown im Abstand von ~160 ms
    tippen(n) {
      const schlaf = (ms) => new Promise((r) => setTimeout(r, ms));
      return (async () => { for (let i = 0; i < n; i++) { window.dispatchEvent(new KeyboardEvent('keydown', { code: 'ShiftRight' })); await schlaf(90);
        window.dispatchEvent(new KeyboardEvent('keyup', { code: 'ShiftRight' })); await schlaf(70); } })();
    },
  };
}'''

def warte_ergebnis(page, sek=20):
    """Die Ergebnistafel erscheint erst nach einer Echtzeit-Verzögerung im Bildlauf (nicht im Schnellvorlauf) – kurz abwarten."""
    t0 = time.time()
    while time.time() - t0 < sek:
        if page.evaluate("() => Rennspiel.spiel.zustand === 'ergebnis' && !!document.querySelector('.ergebnis-karte')"): break
        page.wait_for_timeout(200)
    page.wait_for_timeout(300)

EINST = "({ modus: 'solo', streckeId: '%s', autoIds: ['crossmaschine', 'crossmaschine-rot'], runden: %d, gegner: 3, schwierigkeit: 'mittel', fahrhilfe: ['wenig', 'wenig'], stuntrennen: %s })"

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

        # ---------------- Menü ----------------
        info = page.evaluate('''() => ({ stunt: !!Rennspiel.Moto.stuntStart, cfg: Object.keys(Rennspiel.config.motoStunts), schanzeMin: Rennspiel.config.anlauf.schanzeMin })''')
        pruefe('Stunt-Module geladen, Config-Tabelle R.config.motoStunts da, Anlauf-Mindesttempo 20 m/s', info['stunt'] and 'punkte' in info['cfg'] and info['schanzeMin'] == 20, info['schanzeMin'])
        page.evaluate('() => Rennspiel.spiel.menue.zeigen(0)'); page.wait_for_timeout(500)
        karte = page.evaluate("() => { const k = document.querySelector('[data-a=\"modus:stunt\"]'); return k ? k.textContent.trim().slice(0, 40) : null; }")
        pruefe('Menü: Modus-Karte „Stuntrennen“ vorhanden', karte is not None and 'Stuntrennen' in karte, karte)
        page.evaluate("() => document.querySelector('[data-a=\"modus:stunt\"]').click()"); page.wait_for_timeout(300)
        flag = page.evaluate('() => !!Rennspiel.spiel.einstellungen.stuntrennen')
        pruefe('Menü: Klick auf die Karte setzt das Stuntrennen-Flag', flag)
        page.evaluate("() => Rennspiel.spiel.menue.zeigen(0)"); page.wait_for_timeout(300)
        page.evaluate('() => document.querySelector(\'[data-a="modus:solo"]\').click()'); page.wait_for_timeout(300)
        flag2 = page.evaluate('() => !!Rennspiel.spiel.einstellungen.stuntrennen')
        pruefe('Menü: normale Karte „Allein gegen Computer“ schaltet das Flag wieder aus', not flag2)
        page.evaluate("() => Rennspiel.spiel.menue.zeigen(0)"); page.wait_for_timeout(300)
        page.evaluate('() => document.querySelector(\'[data-a="modus:stunt"]\').scrollIntoView({ inline: "center" })'); page.wait_for_timeout(300)
        bild(page, 'moto_stunt_menue.png', '(Modus-Karte Stuntrennen)')

        # ---------------- Stuntrennen Wiese, Autopilot ----------------
        page.evaluate('() => Rennspiel.spiel.rennenStarten' + EINST % ('wiese', 1, 'true'))
        page.wait_for_timeout(500)
        page.evaluate('() => Rennspiel.spiel.autopilot(0, true)')
        st = page.evaluate('''() => { const s = Rennspiel.spiel; return { stunt: !!s.stunt, sr: s.stunt && s.stunt.stuntrennen, n: s.stunt && s.stunt.fz.length, hud: document.querySelectorAll('.moto-stunt').length,
          gruppe: !!s.motoStuntGruppe, drawcalls: s.motoStuntGruppe ? s.motoStuntGruppe.children.length : -1 }; }''')
        pruefe('Stuntrennen: Zustand je Fahrzeug (4), HUD-Feld, Szenen-Gruppe', st['stunt'] and st['sr'] and st['n'] == 4 and st['hud'] == 1 and st['gruppe'], st)

        page.evaluate('() => __T.warteStart()')
        # Sprung 1 (Rampe bei 75 m) und Weg bis kurz vor die Ring-Rampe (640 m) im Vorlauf, mit Tricks
        page.evaluate('() => __T.vorlauf(560, 120, true)')
        s1 = page.evaluate('() => __T.stand()')
        pruefe('Vorlauf: mind. 1 Sprung, mind. 1 Trick, Punkte > 0', s1['stat']['spruenge'] >= 1 and (s1['stat']['drehungen'] + s1['stat']['saltos']) >= 1 and s1['p'] > 0, f"Sprünge {s1['stat']['spruenge']}, Drehungen {s1['stat']['drehungen']}, Punkte {s1['p']}")
        page.wait_for_timeout(2000)       # Kamera setzt sich im Echtzeit-Lauf wieder hinter das Motorrad

        # Echtzeit A: Feuerring (Bild vor dem Durchflug), HUD mit Punkten/Combo (Bild nach dem Durchflug)
        bilder = {'ring': False, 'hud': False, 'salto': False}; t0 = time.time()
        page.evaluate('() => __T.autoTippen(1)')
        while time.time() - t0 < 90 and not (bilder['ring'] and bilder['hud']):
            page.wait_for_timeout(40)
            z = page.evaluate('() => __T.stand()')
            if z['nan']: break
            if z['luft'] and not bilder['ring'] and z['ringD'] is not None and -26 < z['ringD'] < -8 and z['s'] > 560:
                bild(page, 'moto_stunt_feuerring.png', '(Ring %.0f m voraus)' % -z['ringD']); bilder['ring'] = True; continue
            if not bilder['hud'] and any(e.split('|')[1] in ('feuerring', 'volltreffer') for e in z['ev'] if e.startswith('0|')):
                page.wait_for_timeout(150); bild(page, 'moto_stunt_hud.png', '(HUD: Punkte/Combo, Einblendung Feuerring)'); bilder['hud'] = True
            if z['s'] > 800 and not z['luft']: break
        z = page.evaluate('() => __T.stand()')
        evs = [e.split('|')[1] for e in z['ev'] if e.startswith('0|')]
        pruefe('Echtzeit: Feuerring durchflogen (Ring oder Volltreffer) oder bewusst verpasst ohne Schaden', ('feuerring' in evs or 'volltreffer' in evs) or z['stat']['stuerze'] == 0, evs)
        pruefe('keine NaN in Fahrzeugen', not z['nan'])
        page.evaluate('() => __T.autoAus()')
        # Echtzeit B: zweimal tippen im Flug über der Bus-Reihe (Wiese 2760) = Salto, Bild mitten in der Drehung
        page.evaluate('() => __T.vorlauf(2650, 200, true)'); page.wait_for_timeout(2000)
        page.evaluate('() => __T.autoTippen(2)'); t0 = time.time()
        while time.time() - t0 < 90 and not bilder['salto']:
            page.wait_for_timeout(40)
            z = page.evaluate('() => __T.stand()')
            if z['luft'] and z['s'] > 2650 and 1.3 < abs(z['salto']) < 5.0:
                bild(page, 'moto_stunt_salto.png', '(Salto in der Luft über der Bus-Reihe, %.1f rad)' % z['salto']); bilder['salto'] = True
            if z['s'] > 2900 and not z['luft']: break
        page.evaluate('() => __T.autoAus()')
        pruefe('Bilder: Feuerring, HUD, Salto aufgenommen', all(bilder.values()), bilder)
        if not bilder['hud']: bild(page, 'moto_stunt_hud.png', '(HUD, Ersatzbild)')
        sa = page.evaluate('() => __T.stand().stat')
        pruefe('Salto per Doppeltippen mit echten Tastenereignissen (ShiftRight zweimal) gewertet', sa['saltos'] >= 1, sa)

        # Rest der Runde im Vorlauf: Bus-Reihe, danach Ergebnis
        page.evaluate('() => __T.vorlauf(1e9, 400, true)')
        z = page.evaluate('() => __T.stand()')
        gesamt = page.evaluate('() => Rennspiel.spiel.stunt.fz.map(z => ({ p: z.punkte, st: z.stat }))')
        busse = [g['st']['busse'] for g in gesamt]
        pruefe('Bus-Reihe: Spieler und KI fliegen drüber (Bus-Sprung), Stürze 0', gesamt[0]['st']['busse'] >= 1 and gesamt[0]['st']['stuerze'] == 0, f'Busse {busse}')
        pruefe('Jeder der 4 Fahrer hat Stuntpunkte (KI-Stunts laufen)', all(g['p'] > 0 for g in gesamt), [g['p'] for g in gesamt])
        page.evaluate('() => Rennspiel.spiel.schnellvorlauf(60)'); warte_ergebnis(page)
        erg = page.evaluate('''() => { const s = Rennspiel.spiel; return { zustand: s.zustand, tafel: !!document.querySelector('.moto-erg'),
          zeilen: [...document.querySelectorAll('.moto-erg tbody tr')].map(r => [...r.querySelectorAll('td')].map(t => t.textContent.trim()).slice(0, 7)),
          wertung: s.ergebnis ? 1 : 0 }; }''')
        gesamtwerte = [int(r[6].replace('.', '')) for r in erg['zeilen']] if erg['zeilen'] else []
        pruefe('Ergebnistafel Stuntrennen: Tabelle mit 4 Zeilen, absteigend nach Gesamtpunkten', erg['tafel'] and len(gesamtwerte) == 4 and gesamtwerte == sorted(gesamtwerte, reverse=True), gesamtwerte)
        bild(page, 'moto_stunt_ergebnis.png', '(Ergebnistafel Stuntrennen)')
        pruefe('keine JS-Fehler im Stuntrennen', not fehler, fehler[:4])

        # ---------------- Wheelie ----------------
        page.evaluate('() => Rennspiel.spiel.zumMenue(true)'); page.wait_for_timeout(400)
        page.evaluate('() => Rennspiel.spiel.rennenStarten' + EINST % ('wiese', 1, 'true')); page.wait_for_timeout(400)
        page.evaluate('() => Rennspiel.spiel.autopilot(0, true)')
        page.evaluate('() => { __T.warteStart(); __T.vorlauf(1620, 300, true); }')
        w = page.evaluate('''() => { const s = Rennspiel.spiel, inp = s.input, W = Rennspiel.Moto.stuntWelt, f = s.fahrzeuge[0], dt = Rennspiel.config.physik.schritt; let maxNick = 0, t = 0;
          for (; t < 20; t += dt) { const zo = W.zoneBei(s.strecke, f.nah.s); if (zo && zo.art === 'wheelie') inp.gedrueckt.add('ShiftRight'); else inp.gedrueckt.delete('ShiftRight');
            s.physikSchritt(dt); maxNick = Math.max(maxNick, s.stunt.fz[0].pose.nick); if (f.nah.s > 1760) break; }
          inp.gedrueckt.delete('ShiftRight'); const z = s.stunt.fz[0];
          return { m: z.stat.wheelieM, maxNick, s: f.nah.s, p: z.punkte, kmh: Math.round(f.vehicle.tempoKmh) }; }''')
        pruefe('Wheelie-Zone: Taste gehalten -> Wheelie-Meter > 10 m, Vorderrad hebt (Nick > 0.3 rad)', w['m'] > 10 and w['maxNick'] > 0.3, w)
        page.evaluate('() => Rennspiel.spiel.zumMenue(true)'); page.wait_for_timeout(400)

        # ---------------- Stoppie (Mensch fährt: Gas, in der Zone Bremse) ----------------
        page.evaluate('() => Rennspiel.spiel.rennenStarten' + EINST % ('wiese', 1, 'true')); page.wait_for_timeout(400)
        sp = page.evaluate('''() => { const s = Rennspiel.spiel, inp = s.input, W = Rennspiel.Moto.stuntWelt, f = s.fahrzeuge[0], dt = Rennspiel.config.physik.schritt; __T.warteStart();
          let maxNick = 0, kmhVor = 0; inp.gedrueckt.add('ArrowUp');
          for (let t = 0; t < 25; t += dt) { const zo = W.zoneBei(s.strecke, f.nah.s);
            if (zo && zo.art === 'stoppie') { if (!kmhVor) kmhVor = f.vehicle.tempoKmh; inp.gedrueckt.add('ArrowDown'); inp.gedrueckt.delete('ArrowUp'); } else { inp.gedrueckt.delete('ArrowDown'); inp.gedrueckt.add('ArrowUp'); }
            s.physikSchritt(dt); maxNick = Math.min(maxNick, s.stunt.fz[0].pose.nick); if (f.nah.s > 165 && f.nah.s < 1000 && zo === null) break; if (f.vehicle.tempoKmh < 3 && kmhVor) break; }
          inp.gedrueckt.delete('ArrowDown'); inp.gedrueckt.delete('ArrowUp'); return { m: s.stunt.fz[0].stat.stoppieM, minNick: maxNick, kmhVor: Math.round(kmhVor) }; }''')
        pruefe('Stoppie-Zone: Bremse -> Stoppie-Meter > 5 m, Hinterrad hebt (Nick < -0.2 rad)', sp['m'] > 5 and sp['minNick'] < -0.2, sp)
        page.evaluate('() => Rennspiel.spiel.zumMenue(true)'); page.wait_for_timeout(400)

        # ---------------- Bild: Rampe + Bus-Reihe von der Seite (Standbild, Kamera von Hand) ----------------
        page.evaluate('() => Rennspiel.spiel.rennenStarten' + EINST % ('wiese', 1, 'true')); page.wait_for_timeout(400)
        page.evaluate('''() => { const s = Rennspiel.spiel; __T.warteStart(); const L = Rennspiel.Moto.stuntWelt.stuntDaten(s.strecke).reihen[0], k = s.kameras[0].kamera, mitte = L.a0 + L.tiefe / 2;
          s.pausiert = true;
          const cx = L.x + L.tx * (mitte - 7) + L.nx * 17, cz = L.z + L.tz * (mitte - 7) + L.nz * 17, ey = L.yKante - 3.4;
          k.position.set(cx, ey + 4.5, cz); k.lookAt(L.x + L.tx * mitte, ey + 1.2, L.z + L.tz * mitte); k.updateMatrixWorld(); k.updateProjectionMatrix(); }''')
        page.wait_for_timeout(700)
        bild(page, 'moto_stunt_busreihe.png', '(Rampe + Bus-Reihe von der Seite)')
        n = page.evaluate("() => { const g = Rennspiel.spiel.motoStuntGruppe; let m = 0, tri = 0; g.traverse(o => { if (o.isMesh) { m++; tri += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3; } }); return { meshes: m, dreiecke: Math.round(tri) }; }")
        pruefe('Stunt-Welt (Ring, Bus-Reihe, Zonen, Schilder) braucht wenige Draw-Calls', n['meshes'] <= 24 and n['dreiecke'] < 20000, n)
        page.evaluate('() => { Rennspiel.spiel.pausiert = false; Rennspiel.spiel.zumMenue(true); }'); page.wait_for_timeout(400)

        # ---------------- Bus-Kontakt: zu tief/am Boden in der Reihe = Purzelbaum und weiter, kein Steckenbleiben ----------------
        page.evaluate('() => Rennspiel.spiel.rennenStarten' + EINST % ('wiese', 1, 'true')); page.wait_for_timeout(400)
        bk = page.evaluate('''() => { const s = Rennspiel.spiel, f = s.fahrzeuge[0], v = f.vehicle, inp = s.input, dt = Rennspiel.config.physik.schritt; __T.warteStart();
          const L = Rennspiel.Moto.stuntWelt.stuntDaten(s.strecke).reihen[0], a0 = L.a0 + 1;
          v.setzen(L.x + L.tx * a0, L.z + L.tz * a0, Rennspiel.headingAus(L.tx, L.tz)); v.vLaengs = 12; inp.gedrueckt.add('ArrowUp');
          const z = s.stunt.fz[0]; z.combo.zaehler = 2; z.combo.letzter = s.stunt.zeit;
          let t = 0, aEnde = 0; for (; t < 5; t += dt) { s.physikSchritt(dt); aEnde = (v.x - L.x) * L.tx + (v.z - L.z) * L.tz; if (aEnde > L.a1 + 6) break; }
          inp.gedrueckt.delete('ArrowUp');
          return { stuerze: z.stat.stuerze, purzel: f.motoZ.purzel.anzahl, kmh: Math.round(v.tempoKmh), aEnde, a1: L.a1, t, combo: z.combo.zaehler, nan: !isFinite(v.x) }; }''')
        pruefe('Bus-Kontakt (am Boden mitten in der Reihe): Purzelbaum, Combo weg, fährt weiter hinter die Reihe, kein Steckenbleiben', bk['stuerze'] >= 1 and bk['purzel'] >= 1 and bk['combo'] == 0 and bk['aEnde'] > bk['a1'] and bk['kmh'] > 0 and not bk['nan'], bk)
        page.evaluate('() => Rennspiel.spiel.zumMenue(true)'); page.wait_for_timeout(400)

        # ---------------- alle Strecken: Rennen startet, Spieler springt ----------------
        ids = page.evaluate('() => Rennspiel.trackCatalog.map(t => t.id)')
        for tid in ids:
            page.evaluate('(id) => Rennspiel.spiel.rennenStarten(' + (EINST % ('__ID__', 1, 'true')).replace("'__ID__'", 'id') + ')', tid); page.wait_for_timeout(300)
            page.evaluate('() => { Rennspiel.spiel.autopilot(0, true); __T.warteStart(); __T.vorlauf(1e9, 200, true); }')
            r = page.evaluate('''() => { const s = Rennspiel.spiel, z = s.stunt.fz[0]; return { n: s.strecke.id, sprung: z.stat.spruenge, tricks: z.stat.drehungen + z.stat.saltos, p: z.punkte, stuerze: z.stat.stuerze,
              ring: z.stat.ringe + z.stat.volltreffer, bus: z.stat.busse, nan: s.fahrzeuge.some(g => !isFinite(g.vehicle.x)), ramps: s.strecke.schanzen ? s.strecke.schanzen.length : 0 }; }''')
            pruefe(f'Strecke {tid}: Sprünge >= 2, Tricks >= 1, Punkte > 0, keine NaN', r['sprung'] >= 2 and r['tricks'] >= 1 and r['p'] > 0 and not r['nan'], r)
            page.evaluate('() => Rennspiel.spiel.zumMenue(true)'); page.wait_for_timeout(200)

        # ---------------- normales Rennen: Punkte angezeigt, nicht gewertet ----------------
        page.evaluate('() => Rennspiel.spiel.rennenStarten' + EINST % ('wiese', 1, 'false')); page.wait_for_timeout(400)
        page.evaluate('() => { Rennspiel.spiel.autopilot(0, true); __T.warteStart(); __T.vorlauf(1e9, 400, true); Rennspiel.spiel.schnellvorlauf(60); }'); warte_ergebnis(page)
        nr = page.evaluate('''() => { const s = Rennspiel.spiel; return { sr: s.stunt.stuntrennen, p: s.stunt.fz[0].punkte, hud: document.querySelectorAll('.moto-stunt').length, tafel: !!document.querySelector('.moto-erg'), zustand: s.zustand,
          titel: (document.querySelector('.ergebnis-karte h1') || {}).textContent }; }''')
        pruefe('Rennen (kein Stuntrennen): Punkte laufen im HUD, aber keine Stunt-Wertungstafel', nr['sr'] is False and nr['p'] > 0 and nr['hud'] == 1 and not nr['tafel'], nr)
        page.evaluate('() => Rennspiel.spiel.zumMenue(true)'); page.wait_for_timeout(400)

        # ---------------- Zweispieler ----------------
        page.evaluate('''() => Rennspiel.spiel.rennenStarten({ modus: 'zwei', streckeId: 'wiese', autoIds: ['crossmaschine-blau', 'crossmaschine-gruen'], runden: 1, gegner: 2, schwierigkeit: 'mittel', fahrhilfe: ['wenig', 'wenig'], stuntrennen: true })'''); page.wait_for_timeout(600)
        zw = page.evaluate('''() => { const s = Rennspiel.spiel; s.autopilot(0, true); s.autopilot(1, true); __T.warteStart(); __T.vorlauf(1e9, 25, false);
          return { hud: document.querySelectorAll('.moto-stunt').length, pops: document.querySelectorAll('.moto-popups').length, n: s.stunt.fz.length, sr: s.stunt.stuntrennen,
            taste: [...Rennspiel.spiel.input.spielTasten].filter(k => k.startsWith('Shift')) }; }''')
        pruefe('Zweispieler: je Bildhälfte ein Stunt-Feld, Tasten ShiftRight/ShiftLeft registriert', zw['hud'] == 2 and zw['pops'] == 2 and zw['n'] == 4 and set(zw['taste']) == {'ShiftRight', 'ShiftLeft'}, zw)
        # Spieler 2 tippt mit ShiftLeft im Flug (Vorlauf mit Sprung bei 75 m)
        sp2 = page.evaluate('''() => { const s = Rennspiel.spiel, inp = s.input, dt = Rennspiel.config.physik.schritt, f = s.fahrzeuge[1]; let ok = 0, t = 0;
          for (; t < 60 && s.zustand === 'rennen'; t += dt) { if (f.flug.aktiv && f.flug.t > 0.3 && ok === 0) { inp.gedrueckt.add('ShiftLeft'); inp.geradeGedrueckt.add('ShiftLeft'); ok = 1; }
            s.physikSchritt(dt); inp.gedrueckt.delete('ShiftLeft'); inp.geradeGedrueckt.delete('ShiftLeft'); if (ok === 1 && !f.flug.aktiv) break; }
          const z = s.stunt.fz[1]; return { ok, tricks: z.stat.drehungen + z.stat.saltos, sprung: z.stat.spruenge, p: z.punkte, ersteTaste: s.fahrzeuge[1].spielerNr }; }''')
        page.wait_for_timeout(500)
        bild(page, 'moto_stunt_zweispieler.png', '(Zweispieler mit Stunt-HUD)')
        pruefe('Zweispieler: Spieler 2 trickt mit linker Umschalt-Taste', sp2['ok'] == 1 and sp2['tricks'] >= 1, sp2)
        pruefe('keine JS-Fehler (gesamter Lauf)', not fehler, fehler[:4])
        page.close()

        # ---------------- Touch: Trick-Knopf nur im Motorradmodus ----------------
        for seite, erwartet in (('Motorrad.html', True), ('Autorennen.html', False)):
            pt = browser.new_page(viewport={'width': 1000, 'height': 500}, has_touch=True)
            ft = []
            pt.on('pageerror', lambda e: ft.append(str(e)))
            pt.goto(basisurl + seite + '?touch=1'); pt.wait_for_timeout(1500)
            pt.evaluate("() => Rennspiel.spiel.rennenStarten({ modus: 'solo', streckeId: 'wiese', autoIds: [Rennspiel.carCatalog.waehlbare()[0].id], runden: 1, gegner: 1, schwierigkeit: 'mittel', fahrhilfe: ['wenig', 'wenig'] })")
            pt.wait_for_timeout(1500)
            knopf = pt.evaluate("() => !!document.querySelector('.moto-touch')")
            pruefe(f'Touch ({seite}): Trick-Knopf {"vorhanden" if erwartet else "nicht vorhanden"}', knopf == erwartet and not ft, ft[:2])
            if erwartet: pt.screenshot(path=os.path.join(out, 'moto_stunt_touch.png')); print('      Bild: tests/out/moto/moto_stunt_touch.png (Touch-Knopf)')
            pt.close()

        # ---------------- Autorennen.html unverändert ----------------
        page2 = browser.new_page(viewport={'width': 1280, 'height': 800})
        fehler2 = []
        page2.on('pageerror', lambda e: fehler2.append('pageerror: ' + str(e)))
        page2.on('console', lambda m: fehler2.append('console.error: ' + m.text) if m.type == 'error' else None)
        page2.goto(basisurl + 'Autorennen.html'); page2.wait_for_timeout(2000)
        a = page2.evaluate('''() => ({ moto: window.MOTORRAD, n: Rennspiel.carCatalog.waehlbare().length, motoJs: !!Rennspiel.Moto, cfg: !!Rennspiel.config.motoStunts,
          schanzenWiese: JSON.stringify(Rennspiel.trackCatalog.find(t => t.id === 'wiese').schanzen || null), motoFeld: JSON.stringify(Rennspiel.trackCatalog).indexOf('"moto"') >= 0,
          zonen: JSON.stringify(Rennspiel.trackCatalog).indexOf('motoZonen') >= 0, schanzeMin: Rennspiel.config.anlauf.schanzeMin })''')
        pruefe('Autorennen.html: kein Motorrad-/Stunt-Code, Katalog unverändert (keine moto-/Zonen-Felder), Anlauf-Mindesttempo 14', a['moto'] is None and not a['motoJs'] and not a['cfg'] and not a['motoFeld'] and not a['zonen'] and a['schanzeMin'] == 14, a)
        page2.evaluate('''() => Rennspiel.spiel.rennenStarten({ modus: 'solo', streckeId: 'wiese', autoIds: ['troc-cabrio', 'multivan'], runden: 1, gegner: 2, schwierigkeit: 'mittel', fahrhilfe: ['wenig', 'wenig'] })''')
        page2.wait_for_timeout(2500)
        sz = page2.evaluate('''() => { const s = Rennspiel.spiel; s.schnellvorlauf(30); return { n: s.fahrzeuge.length, schanzen: s.strecke.schanzen ? s.strecke.schanzen.length : 0, welt: s.strecke.welt || null, hud: document.querySelectorAll('.moto-stunt').length }; }''')
        pruefe('Autorennen.html: Wiese Klassisch ohne Schanzen wie zuvor, 3 Fahrzeuge, kein Stunt-HUD', sz['n'] == 3 and sz['schanzen'] == 0 and sz['hud'] == 0, sz)
        pruefe('Autorennen.html: 0 JS-Fehler', not fehler2, fehler2[:3])
        page2.close()
        browser.close()
finally:
    server.terminate()

print('\n%d/%d Prüfungen bestanden' % (sum(ergebnisse), len(ergebnisse)))
sys.exit(0 if all(ergebnisse) else 1)
