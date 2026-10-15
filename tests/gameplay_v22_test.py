#!/usr/bin/env python3
"""14.10. (v22) Gameplay-Wünsche im Browser (Playwright, headless): python3 tests/gameplay_v22_test.py [ausgabeordner]
 1) Zweite Schild-Kugel bei vorhandenem Schild: Schild bleibt, Gesundheit +10 Prozentpunkte (max. 100), Meldung „🛡️ +10 % 🔧“; ohne Schaden „🛡️ Schild bleibt“;
    Kugel weg; ohne Schild wie bisher
 2) Polizei freikaufen: HUD-Hinweis „(2× ↓ = 10 🪙 freikaufen)“; ↓↓ mit Guthaben → −10 im Garage-Konto, Stopp sofort weg, Meldung „💰 −10 – weiter!“, kein
    „Weiterfahren“; zu wenig → „Zu wenig Münzen (10 nötig)“; Rennzähler sinkt mit; zu zweit: Spieler 2 mit S; Dach-Geste (↑+↓) kauft nicht frei; einzelnes ↓ nichts
 3) Licht bei Dämmerung/Nacht: alle Autos (Spieler, Gegner, Polizei) mit Scheinwerfern, Rücklicht und Lichtkegel (Mesh 'fahrlicht', 1 Draw-Call je Auto);
    Tag: keine Lichtkegel sichtbar; Tunnel am Tag: Spielerauto bekommt Licht; Screenshots tests/out/v22_gameplay/"""
import sys, os, io, json
from playwright.sync_api import sync_playwright
from PIL import Image, ImageStat

basis = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
_a = [x for x in sys.argv[1:] if not x.startswith('--')]
aus = _a[0] if _a else os.path.join(basis, 'tests', 'out', 'v22_gameplay')
os.makedirs(aus, exist_ok=True)
url = 'file://' + os.path.join(basis, 'Autorennen.html')
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
pruef = []
def pruefe(name, ok, info=''):
    pruef.append((name, ok)); print(('OK   ' if ok else 'FEHL ') + name + (' – ' + str(info) if info != '' else ''), flush=True)

STARTEN = '''(o) => { const s = Rennspiel.spiel;
  s.rennenStarten(Object.assign({ modus: 'solo', streckeId: 'wiese', welt: 'klassisch', schaden: false, gegner: 3, runden: 3,
    schwierigkeit: 'mittel', autoIds: ['troc-cabrio', 'multivan'], fahrhilfe: ['wenig', 'wenig'], wetter: 'klar', jahreszeit: 'sommer',
    windStaerke: 0, polizei: false, tageszeit: 'tag' }, o.einst));
  window._mel = []; s.huds.forEach((h) => { const m = h.meldung.bind(h); h.meldung = (t, ms) => { window._mel.push(t); return m(t, ms); }; });
  if (o.vorlauf) { s.pausiert = false; s.schnellvorlauf(o.vorlauf); }
  s.pausiert = true; return true; }'''
VOR = '(sek) => { const s = Rennspiel.spiel; s.pausiert = false; s.schnellvorlauf(sek); s.pausiert = true; return window._mel.slice(); }'

with sync_playwright() as p:
    browser = p.chromium.launch(args=ARGS)
    page = browser.new_page(viewport={'width': 1280, 'height': 800})
    fehler = []
    page.on('pageerror', lambda e: fehler.append(str(e)))
    page.on('console', lambda m: fehler.append('console.error: ' + m.text) if m.type == 'error' else None)
    page.goto(url); page.wait_for_timeout(1500)

    NUR_LICHT = '--nur-licht' in sys.argv
    if not NUR_LICHT:
        # ================= 1) Schild +10 % =================
        page.evaluate(STARTEN, {'einst': {'welt': 'verrueckt', 'schaden': True, 'gegner': 1}, 'vorlauf': 6})
        st = page.evaluate('''() => { const s = Rennspiel.spiel, pk = s.pickups; return { da: !!pk, kugeln: pk ? pk.kugeln.length : 0, schadenAn: s.schaden.an, name: s.rennen.teilnehmer[0].name }; }''')
        pruefe('Welt Verrückt: Pickups + Schaden an', st['da'] and st['kugeln'] >= 2 and st['schadenAn'], st)
        def auf_kugel(k):
            return page.evaluate('''(k) => { const s = Rennspiel.spiel, K = s.pickups.kugeln[k], v = s.fahrzeuge[0].vehicle; v.setzen(K.x, K.z, v.heading); v.vLaengs = 0; return true; }''', k)
        # a) ohne Schild: normaler Schild
        auf_kugel(0); mel = page.evaluate(VOR, 0.05)
        r = page.evaluate('() => { const pk = Rennspiel.spiel.pickups; return { schild: pk.hatSchild(0), da: pk.kugeln[0].da, plus: pk.autos[0].schildPlus || 0 }; }')
        pruefe('ohne Schild: Kugel gibt Schild wie bisher („Schutzschild! 🛡️“)', r['schild'] and not r['da'] and r['plus'] == 0 and any('Schutzschild' in m for m in mel), mel)
        # b) mit Schild + beschädigt: zweite Kugel → +10 %, Schild bleibt
        page.evaluate('() => { const s = Rennspiel.spiel; s.schaden._punkteSetzen(0, 70); }')
        auf_kugel(1); mel = page.evaluate(VOR, 0.05)
        r = page.evaluate('() => { const s = Rennspiel.spiel, pk = s.pickups; return { schild: pk.hatSchild(0), da: pk.kugeln[1].da, prozent: s.schaden.zustand(0).prozent, plus: pk.autos[0].schildPlus || 0, schilde: pk.autos[0].schilde }; }')
        pruefe('mit Schild, 70 % → 80 %, Schild bleibt, Kugel weg, Meldung „🛡️ +10 % 🔧“', r['schild'] and not r['da'] and r['prozent'] == 80 and r['plus'] == 1 and r['schilde'] == 1 and any('🛡️ +10 % 🔧' in m for m in mel), [r, mel])
        # c) 95 % → 100 %, Meldung zeigt tatsächliche Prozentpunkte
        page.evaluate('''() => { const s = Rennspiel.spiel, K = s.pickups.kugeln[0]; K.da = true; s.schaden._punkteSetzen(0, 95); }''')
        auf_kugel(0); mel = page.evaluate(VOR, 0.05)
        r = page.evaluate('() => Rennspiel.spiel.schaden.zustand(0).prozent')
        pruefe('95 % + Kugel → 100 % (nicht mehr), Meldung „+5 %“', r == 100 and any('🛡️ +5 % 🔧' in m for m in mel), [r, mel])
        # d) bei 100 %: Schild bleibt, Meldung „Schild bleibt“, Kugel wird trotzdem eingesammelt
        page.evaluate('''() => { const s = Rennspiel.spiel, K = s.pickups.kugeln[1]; K.da = true; }''')
        auf_kugel(1); mel = page.evaluate(VOR, 0.05)
        r = page.evaluate('() => { const s = Rennspiel.spiel; return { p: s.schaden.zustand(0).prozent, schild: s.pickups.hatSchild(0), da: s.pickups.kugeln[1].da }; }')
        pruefe('bei 100 %: „🛡️ Schild bleibt“, Schild noch da', r['p'] == 100 and r['schild'] and not r['da'] and any('Schild bleibt' in m for m in mel), [r, mel])
        # e) alter Schild fängt danach noch genau einen Treffer
        r = page.evaluate('() => { const pk = Rennspiel.spiel.pickups; return [pk.schildVerbrauchen(0), pk.schildVerbrauchen(0)]; }')
        pruefe('alter Schild fängt weiterhin genau einen Treffer', r == [True, False], r)
        # f) Schaden aus: „Schild bleibt“
        page.evaluate(STARTEN, {'einst': {'welt': 'verrueckt', 'schaden': False, 'gegner': 1}, 'vorlauf': 6})
        page.evaluate('() => { Rennspiel.spiel.pickups.autos[0] || Rennspiel.spiel.pickups._auto(0); Rennspiel.spiel.pickups._auto(0).schild = true; }')
        auf_kugel(0); mel = page.evaluate(VOR, 0.05)
        pruefe('Schaden aus: Schild bleibt, Meldung „🛡️ Schild bleibt“, kein Fehler', any('Schild bleibt' in m for m in mel) and page.evaluate('() => Rennspiel.spiel.pickups.hatSchild(0)'), mel)

        # ================= 2) Polizei freikaufen =================
        PNAME = '''() => Rennspiel.spiel.rennen.teilnehmer[0].name'''
        HALT = '''(i) => { const s = Rennspiel.spiel, lg = s.polizei.logik, a = lg._a(i); a.stopp = 4; a.stoppK = 0; a.schonBis = -Infinity; const st = lg._s(0); st.phase = 'halt'; st.ziel = i; return lg.gesperrt(i); }'''
        ZUS = '''(i) => { const s = Rennspiel.spiel, lg = s.polizei.logik, hud = document.querySelector('.hud-polizei');
          return { gesperrt: lg.gesperrt(i), rest: +lg.rest(i).toFixed(2), konto: Rennspiel.Garage.konto(s.rennen.teilnehmer[i].name), muenzen: s.muenzen ? s.muenzen.anzahlVon(i) : null,
            hud: hud && hud.style.display !== 'none' ? hud.textContent : '', mel: window._mel.slice() }; }'''
        page.evaluate('() => { try { localStorage.clear(); } catch (e) {} Rennspiel.Garage._ramLeeren(); }')
        page.evaluate(STARTEN, {'einst': {'polizei': True, 'gegner': 2}, 'vorlauf': 6})
        name = page.evaluate(PNAME)
        page.evaluate("(n) => Rennspiel.Garage.gutschreiben(n, 25)", name)
        page.evaluate('''() => { const s = Rennspiel.spiel; if (s.muenzen) { s.muenzen.gesammelt[0] = 4; } }''')
        pruefe('Vorbedingung: Polizei an, Guthaben 25', page.evaluate("(n) => Rennspiel.Garage.konto(n)", name) == 25 and page.evaluate('() => !!Rennspiel.spiel.polizei'))
        page.evaluate(HALT, 0)
        page.evaluate(VOR, 0.2)
        page.wait_for_timeout(1200)
        page.evaluate('() => { Rennspiel.spiel.hudAktualisieren(); }')
        z = page.evaluate(ZUS, 0)
        pruefe('HUD während des Stopps: „Anhalten… N s“ + Hinweis „(2× ↓ = 10 🪙 freikaufen)“', z['gesperrt'] and 'Anhalten' in z['hud'] and '(2× ↓ = 10 🪙 freikaufen)' in z['hud'], repr(z['hud']))
        page.screenshot(path=os.path.join(aus, 'freikaufen_hud.png'))
        # einzelnes ↓: nichts
        page.keyboard.down('ArrowDown'); page.keyboard.up('ArrowDown')
        page.evaluate(VOR, 0.1); page.wait_for_timeout(900); page.evaluate(VOR, 0.1)
        z = page.evaluate(ZUS, 0)
        pruefe('einzelnes ↓: weiter angehalten, Konto 25', z['gesperrt'] and z['konto'] == 25, z)
        # zu langsam (0,8 s Pause)
        page.keyboard.down('ArrowDown'); page.keyboard.up('ArrowDown'); page.wait_for_timeout(800)
        page.keyboard.down('ArrowDown'); page.keyboard.up('ArrowDown'); page.evaluate(VOR, 0.1)
        z = page.evaluate(ZUS, 0)
        pruefe('↓ … 0,8 s … ↓ (zu langsam): nichts', z['gesperrt'] and z['konto'] == 25, z)
        # Dach-Geste: ↑ gehalten + ↓↓
        page.keyboard.down('ArrowUp'); page.keyboard.down('ArrowDown'); page.keyboard.up('ArrowDown'); page.keyboard.down('ArrowDown'); page.keyboard.up('ArrowDown'); page.evaluate(VOR, 0.1); page.keyboard.up('ArrowUp')
        z = page.evaluate(ZUS, 0)
        pruefe('↑ gehalten + ↓↓ (Dach-Geste): kauft nicht frei', z['gesperrt'] and z['konto'] == 25, z)
        page.wait_for_timeout(700)
        # echter Doppeltipp
        page.evaluate('() => { window._mel.length = 0; }')
        page.keyboard.down('ArrowDown'); page.keyboard.up('ArrowDown'); page.wait_for_timeout(120)
        page.keyboard.down('ArrowDown'); page.keyboard.up('ArrowDown')
        page.evaluate(VOR, 0.1)
        z = page.evaluate(ZUS, 0)
        pruefe('↓↓: Stopp sofort weg, Konto 25 → 15, Rennzähler 4 → 0 (min(10,4) vom Rennen)', (not z['gesperrt']) and z['konto'] == 15 and z['muenzen'] == 0, z)
        pruefe('Meldung „💰 −10 – weiter!“ und KEIN „Weiterfahren!“', any('💰 −10 – weiter!' in m for m in z['mel']) and not any('Weiterfahren' in m for m in z['mel']), z['mel'])
        page.evaluate(VOR, 0.5)
        pruefe('danach fährt der Spieler wieder (Gas möglich: nicht gesperrt, Schonfrist)', not page.evaluate(ZUS, 0)['gesperrt'])
        page.screenshot(path=os.path.join(aus, 'freikaufen_weiter.png'))
        # zu wenig: Konto auf 5
        page.evaluate("(n) => { const o = Rennspiel.Garage.laden(); o[n].muenzen = 5; Rennspiel.Garage.speichern(o); }", name)
        page.evaluate(HALT, 0); page.evaluate(VOR, 0.1); page.evaluate('() => { window._mel.length = 0; }')
        page.keyboard.down('ArrowDown'); page.keyboard.up('ArrowDown'); page.wait_for_timeout(100); page.keyboard.down('ArrowDown'); page.keyboard.up('ArrowDown'); page.evaluate(VOR, 0.1)
        z = page.evaluate(ZUS, 0)
        pruefe('Konto 5: „Zu wenig Münzen (10 nötig)“, Stopp bleibt, Konto 5', z['gesperrt'] and z['konto'] == 5 and any('Zu wenig Münzen (10 nötig)' in m for m in z['mel']), z)
        # genau 10 reichen
        page.evaluate("(n) => { const o = Rennspiel.Garage.laden(); o[n].muenzen = 10; Rennspiel.Garage.speichern(o); }", name)
        page.keyboard.down('ArrowDown'); page.keyboard.up('ArrowDown'); page.wait_for_timeout(100); page.keyboard.down('ArrowDown'); page.keyboard.up('ArrowDown'); page.evaluate(VOR, 0.1)
        z = page.evaluate(ZUS, 0)
        pruefe('Konto genau 10: freigekauft, Konto 0', (not z['gesperrt']) and z['konto'] == 0, z)
        # nicht angehalten: Doppeltipp kostet nichts
        page.evaluate("(n) => Rennspiel.Garage.gutschreiben(n, 30)", name)
        page.keyboard.down('ArrowDown'); page.keyboard.up('ArrowDown'); page.wait_for_timeout(100); page.keyboard.down('ArrowDown'); page.keyboard.up('ArrowDown'); page.evaluate(VOR, 0.1)
        pruefe('nicht angehalten: ↓↓ kostet nichts (Rückwärtsfahren bleibt ungestört)', page.evaluate(ZUS, 0)['konto'] == 30)
        # Zwei Spieler: Spieler 2 mit S
        page.evaluate('() => { try { localStorage.clear(); } catch (e) {} Rennspiel.Garage._ramLeeren(); }')
        page.evaluate(STARTEN, {'einst': {'polizei': True, 'gegner': 2, 'modus': 'zwei'}, 'vorlauf': 6})
        n2 = page.evaluate("() => Rennspiel.spiel.rennen.teilnehmer[1].name")
        page.evaluate("(n) => Rennspiel.Garage.gutschreiben(n, 40)", n2)
        page.evaluate(HALT, 1); page.evaluate(VOR, 0.1)
        page.keyboard.down('ArrowDown'); page.keyboard.up('ArrowDown'); page.wait_for_timeout(100); page.keyboard.down('ArrowDown'); page.keyboard.up('ArrowDown'); page.evaluate(VOR, 0.1)
        pruefe('Zwei Spieler: Spieler-1-↓↓ kauft Spieler 2 NICHT frei', page.evaluate(ZUS, 1)['gesperrt'] and page.evaluate(ZUS, 1)['konto'] == 40)
        page.evaluate('() => Rennspiel.spiel.hudAktualisieren()'); page.wait_for_timeout(500)
        h2 = page.evaluate("() => [...document.querySelectorAll('.hud-polizei')].map(e => e.style.display !== 'none' ? e.textContent : '')")
        pruefe('Zwei Spieler: HUD von Spieler 2 zeigt „(2× S = 10 🪙 freikaufen)“', any('(2× S = 10 🪙 freikaufen)' in t for t in h2), h2)
        page.keyboard.down('KeyS'); page.keyboard.up('KeyS'); page.wait_for_timeout(100); page.keyboard.down('KeyS'); page.keyboard.up('KeyS'); page.evaluate(VOR, 0.1)
        z = page.evaluate(ZUS, 1)
        pruefe('Zwei Spieler: S S kauft Spieler 2 frei (Konto 40 → 30)', (not z['gesperrt']) and z['konto'] == 30, z)

    # ================= 3) Licht =================
    def licht_info():
        return page.evaluate('''() => { const s = Rennspiel.spiel, r = s.renderer;
          const autos = s.fahrzeuge.map(f => { const m = f.mesh, fl = m.getObjectByName('fahrlicht'); return { id: f.auto && f.auto.id, polizei: !!f.polizei, an: !!m.userData.lichtAn, kegel: !!fl && fl.visible,
            kegelMesh: !!fl, sw: (m.userData.scheinwerfer || []).every(x => x.material.color.getHex() === 0xffffff), bl: m.userData.bremslichtMaterial.color.getHex() }; });
          // Draw-Calls: renderer.info ist je Zeichenaufruf mehrstufig (Spiegel/Minimap) und springt → Zusatz = sichtbare Lichtkegel-Meshes (je 1 Draw-Call, 1 Material)
          let zusatz = 0, dreiecke = 0; s.szene.traverse((o) => { if (o.name === 'fahrlicht' && o.visible) { zusatz++; dreiecke += o.geometry.index.count / 3; } });
          s.zeichnen(); const mit = r.info.render.calls;
          return { autos, mit, ohne: mit - zusatz, zusatz, tris: dreiecke }; }''')
    def shot(name, box=None):
        png = page.screenshot(path=os.path.join(aus, name + '.png'))
        b = Image.open(io.BytesIO(png)).convert('L'); w, h = b.size
        return round(ImageStat.Stat(b).mean[0], 1)

    page.evaluate('() => { Rennspiel.spiel.pausiert = false; }')
    for tz, namen in (('tag', 'tag'), ('daemmerung', 'daemmerung'), ('nacht', 'nacht')):
        page.evaluate(STARTEN, {'einst': {'tageszeit': tz, 'polizei': True, 'gegner': 4, 'streckeId': 'wiese'}, 'vorlauf': 0})
        page.evaluate('() => { new Promise((ok) => { let n = 0; const f = () => (++n >= 12 ? ok() : requestAnimationFrame(f)); requestAnimationFrame(f); }); }')
        page.wait_for_timeout(1500)
        li = licht_info()
        a = li['autos']
        if tz == 'tag':
            pruefe('Tag: kein Auto mit Licht, kein Lichtkegel sichtbar', not any(x['an'] for x in a) and not any(x['kegel'] for x in a), a[:2])
        else:
            pruefe(tz + ': ALLE Autos (%d, inkl. Polizei) mit Licht an' % len(a), all(x['an'] for x in a) and any(x['polizei'] for x in a), [x['id'] for x in a if not x['an']])
            vorn = [x for x in a if x['id'] != 'formel']
            pruefe(tz + ': alle Autos mit Scheinwerfern haben einen sichtbaren Lichtkegel, Scheinwerferglas weiß', all(x['kegel'] and x['sw'] for x in vorn), [x['id'] for x in vorn if not x['kegel']])
            pruefe(tz + ': Zusatz-Draw-Calls durch Lichtkegel ≤ 1 je sichtbares Auto (%d)' % li['zusatz'], 0 < li['zusatz'] <= len(a), li['zusatz'])
        print(tz, 'Lichtkegel-Meshes', li['zusatz'], 'Dreiecke dafür', li['tris'], 'letzter Zeichenaufruf', li['mit'], 'Draw-Calls', flush=True)
    # Bilder Dämmerung: Startaufstellung (Countdown), Einzel (Fahrt), von vorne
    page.evaluate(STARTEN, {'einst': {'tageszeit': 'daemmerung', 'polizei': True, 'gegner': 5, 'streckeId': 'wiese'}, 'vorlauf': 0})
    page.evaluate('() => { Rennspiel.spiel.pausiert = false; }')
    page.evaluate('() => new Promise((ok) => { let n = 0; const f = () => (++n >= 25 ? ok() : requestAnimationFrame(f)); requestAnimationFrame(f); })')
    h1 = shot('daemmerung_startaufstellung')
    page.evaluate('() => { Rennspiel.spiel.pausiert = true; }')
    # Aufstellung von hinten-schräg über dem Feld / von vorne: Kamera in zeichnen() setzen (Schleife läuft weiter, Spiel pausiert)
    KAM = """(w) => { const s = Rennspiel.spiel, k = s.kameras[0].kamera, v = s.fahrzeuge[0].vehicle; if (!s._zeichnenOrig) s._zeichnenOrig = s.zeichnen;
      s.zeichnen = function () { const h = v.heading, fx = -Math.sin(h), fz = -Math.cos(h);
        if (w === 'seitlich') { k.position.set(v.x - fx * 9 + fz * 7, v.y + 3.2, v.z - fz * 9 - fx * 7); k.lookAt(v.x + fx * 6, v.y + 0.4, v.z + fz * 6); }
        else if (w === 'vorne') { k.position.set(v.x + fx * 15 + fz * 2.5, v.y + 1.6, v.z + fz * 15 - fx * 2.5); k.lookAt(v.x - fx * 3, v.y + 0.6, v.z - fz * 3); }
        else if (w === 'flach') { k.position.set(v.x + fx * 7 + fz * 5, v.y + 1.0, v.z + fz * 7 - fx * 5); k.lookAt(v.x - fx * 1, v.y + 0.5, v.z - fz * 1); }
        k.updateMatrixWorld(); return s._zeichnenOrig.apply(s, arguments); }; return true; }"""
    page.evaluate(KAM, 'seitlich')
    page.evaluate('() => new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(ok))))')
    shot('daemmerung_aufstellung_seitlich')
    page.evaluate(KAM, 'vorne')
    page.evaluate('() => new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(ok))))')
    shot('daemmerung_von_vorne')
    page.evaluate(KAM, 'flach')
    page.evaluate('() => new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(ok))))')
    shot('daemmerung_flach_seite')
    page.evaluate('() => { const s = Rennspiel.spiel; if (s._zeichnenOrig) { s.zeichnen = s._zeichnenOrig; s._zeichnenOrig = null; } s.kameras[0]._erstesMal = true; s.pausiert = false; }')
    # Einzel in Fahrt
    page.evaluate(STARTEN, {'einst': {'tageszeit': 'daemmerung', 'polizei': False, 'gegner': 3, 'streckeId': 'wiese'}, 'vorlauf': 0})
    page.evaluate('() => { const s = Rennspiel.spiel; s.autopilot(0); s.pausiert = false; s.schnellvorlauf(9); }')
    page.evaluate('() => new Promise((ok) => { let n = 0; const f = () => (++n >= 30 ? ok() : requestAnimationFrame(f)); requestAnimationFrame(f); })')
    page.evaluate('() => { Rennspiel.spiel.pausiert = true; }')
    page.evaluate('() => new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(ok)))')
    shot('daemmerung_einzel_fahrt')
    # Nacht zum Vergleich
    page.evaluate(STARTEN, {'einst': {'tageszeit': 'nacht', 'polizei': False, 'gegner': 3, 'streckeId': 'wald'}, 'vorlauf': 0})
    page.evaluate('() => { const s = Rennspiel.spiel; s.autopilot(0); s.pausiert = false; s.schnellvorlauf(9); }')
    page.evaluate('() => new Promise((ok) => { let n = 0; const f = () => (++n >= 30 ? ok() : requestAnimationFrame(f)); requestAnimationFrame(f); })')
    page.evaluate('() => { Rennspiel.spiel.pausiert = true; }')
    page.evaluate('() => new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(ok)))')
    shot('nacht_einzel_fahrt')

    # Tunnel am Tag: Spielerauto bekommt Licht (Strecke mit Tunnel suchen)
    tun = page.evaluate('''() => Rennspiel.trackCatalog.filter(t => (t.tunnel && t.tunnel.length) || (t.tunnels && t.tunnels.length)).map(t => t.id)''')
    print('Strecken mit Tunnel-Daten:', tun, flush=True)
    if tun:
        page.evaluate(STARTEN, {'einst': {'tageszeit': 'tag', 'polizei': False, 'gegner': 1, 'streckeId': tun[0]}, 'vorlauf': 0})
        r = page.evaluate('''() => { const s = Rennspiel.spiel, st = s.strecke, f = s.fahrzeuge[0], t0 = st.tunnel && st.tunnel[0];
          if (!t0) return null; const sp = st.spline, mitte = (t0.s0 !== undefined ? (t0.s0 + t0.s1) / 2 : (t0.von + t0.bis) / 2), p = sp.punktBei(mitte);
          const v = f.vehicle; v.setzen(p.x, p.z, Math.atan2(-p.tx, -p.tz)); v.vLaengs = 0; f.nah = st.abfrage(v.x, v.z); s.pausiert = false;
          const vorher = !!f.mesh.userData.lichtAn; s._tunnelLichterAktualisieren(); const drin = !!f.mesh.userData.lichtAn;
          const q = sp.punktBei(mitte + 400); v.setzen(q.x, q.z, v.heading); f.nah = st.abfrage(v.x, v.z); s._tunnelLichterAktualisieren(); const draussen = !!f.mesh.userData.lichtAn;
          return { vorher, drin, draussen, imTunnel: st.imTunnel(mitte, 8) }; }''')
        pruefe('Tunnel am Tag: Spielerauto-Licht aus → im Tunnel an → draußen wieder aus', r is not None and (not r['vorher']) and r['drin'] and (not r['draussen']), r)
    pruefe('keine JS-Fehler', not fehler, fehler[:3])
    browser.close()

n = sum(1 for _, ok in pruef if not ok)
print('\nALLE TESTS OK (%d)' % len(pruef) if n == 0 else '\n%d FEHLER' % n)
sys.exit(1 if n else 0)
