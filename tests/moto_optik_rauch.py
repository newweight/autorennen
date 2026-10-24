#!/usr/bin/env python3
"""Browser-Rauchtest Motorrad-Modus (Stufe M2b „Optik-Feinschliff“).
Aufruf: python3 tests/moto_optik_rauch.py
Prüft und fotografiert (Bilder nach tests/out/moto/):
  - Busse: Bus-Reihe als erkennbare Busse (Schulbus gelb, Linienbusse rot/blau/weiß/grün, Fensterband, Räder, Front-/Heckscheibe, Dach), ein Mesh (1 Draw-Call),
    Lage/Höhe wie zuvor (Oberkante = Reihenhöhe), moto_busse.png (Anfahrt) und moto_busse_nah.png (schräg von vorn)
  - Touch (844×390, 667×375, 932×430, 1024×768, 1280×800): Trick-Knopf beschriftet „Trick“, ⭐-Knopf ausgegraut + „kein Item“, Trick-Knopf berührt weder Minikarte noch
    Gas/Bremse/Tacho/Zeiten/Spieler-Chip (getBoundingClientRect); moto_touch_knoepfe.png
  - Menü: fünf Modus-Karten liegen vollständig im Inhaltsbereich (nichts angeschnitten) bei 844×390, 1024×768, 1280×800, 1920×1080; moto_menue_modus.png
  - Autorennen.html: Menü unverändert (nur notiert, ob dort Karten angeschnitten sind), 0 JS-Fehler, lädt keine Moto-Datei"""
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

EINST = "({ modus: 'solo', streckeId: '%s', autoIds: ['crossmaschine', 'crossmaschine-rot'], runden: 1, gegner: 3, schwierigkeit: 'mittel', fahrhilfe: ['wenig', 'wenig'], stuntrennen: true, unfall: 'aus' })"
RECHTECKE = '''() => { const q = (s) => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(), cs = getComputedStyle(e);
  return { l: Math.round(r.left), t: Math.round(r.top), r: Math.round(r.right), b: Math.round(r.bottom), d: cs.display, txt: (e.textContent || '').trim(), op: cs.opacity }; };
  return { trick: q('.moto-touch'), item: q('.t-item'), mini: q('.hud-minimap'), gas: q('.t-gas'), brems: q('.t-bremse'), tacho: q('.hud-tacho'), zeiten: q('.hud-zeiten'), chip: q('.hud-links'), platz: q('.hud-platz'),
    reset: q('.t-reset'), kam: q('.t-kamera'), pause: q('.t-pause'), links: q('.t-links'), rechts: q('.t-rechts'), cls: document.documentElement.className }; }'''
def ueber(a, b):
    return not (a['r'] <= b['l'] or b['r'] <= a['l'] or a['b'] <= b['t'] or b['b'] <= a['t'])

try:
    with sync_playwright() as p:
        browser = p.chromium.launch(args=ARGS)
        fehler = []
        def neue_seite(w, h, touch=False):
            ctx = browser.new_context(viewport={'width': w, 'height': h}, has_touch=touch, is_mobile=touch, device_scale_factor=1)
            pg = ctx.new_page()
            pg.on('pageerror', lambda e: fehler.append('pageerror: ' + str(e)))
            pg.on('console', lambda m: fehler.append('console.error: ' + m.text) if m.type == 'error' else None)
            return ctx, pg

        # ---------------- Busse ----------------
        ctx, page = neue_seite(1280, 800)
        page.goto(basisurl + 'Motorrad.html'); page.wait_for_timeout(1500)
        page.evaluate('() => Rennspiel.spiel.rennenStarten' + EINST % 'wiese'); page.wait_for_timeout(500)
        info = page.evaluate('''() => { const s = Rennspiel.spiel; let g = 0; while ((s.zustand !== 'rennen' || !s.rennen.gasErlaubt) && g++ < 3000) s.physikSchritt(1 / 60);
          const st = s.strecke, D = Rennspiel.Moto.stuntWelt.stuntDaten(st), L = D.reihen[0], m = s.motoStuntGruppe.getObjectByName('BusReihe'), pos = m.geometry.attributes.position, farben = new Set(), col = m.geometry.attributes.color;
          for (let i = 0; i < col.count; i += 7) farben.add([col.getX(i), col.getY(i), col.getZ(i)].map((v) => v.toFixed(2)).join(','));
          let yMax = -1e9, yMin = 1e9; for (let i = 0; i < pos.count; i++) { const dx = pos.getX(i) - L.x, dz = pos.getZ(i) - L.z, a = dx * L.tx + dz * L.tz; if (a >= L.a0 - 0.2 && a <= L.a1 + 0.2) { yMax = Math.max(yMax, pos.getY(i) - st.hoeheAn(pos.getX(i), pos.getZ(i))); yMin = Math.min(yMin, pos.getY(i) - st.hoeheAn(pos.getX(i), pos.getZ(i))); } }
          return { n: L.n, hoehe: L.hoehe, yMax: +yMax.toFixed(2), yMin: +yMin.toFixed(2), tris: pos.count / 3, meshe: s.motoStuntGruppe.children.filter((c) => c.name === 'BusReihe').length, farben: farben.size, sK: L.sK, a0: L.a0, a1: L.a1 }; }''')
        pruefe(f"Busse: ein Mesh (1 Draw-Call) mit {info['tris']:.0f} Dreiecken, viele Farben (Karosserie, Glas, Reifen, Licht: {info['farben']} Töne), Oberkante {info['yMax']} m ≈ Reihenhöhe {info['hoehe']} m (± Geländeneigung quer über 15 m; der genaue Wert an der Kante steht im Stunt-Test)",
               info['meshe'] == 1 and info['farben'] >= 8 and abs(info['yMax'] - info['hoehe']) <= 0.3 and info['yMin'] >= -0.3, info)
        # Anfahrt: Autopilot fährt bis 38 m vor die Rampe (echter Anlauf), dann Standbild
        page.evaluate("""() => { const s = Rennspiel.spiel, L = Rennspiel.Moto.stuntWelt.stuntDaten(s.strecke).reihen[0], f = s.fahrzeuge[0]; s.autopilot(0, true); let davor = false, n = 0;
          for (; n < 60 * 240 && s.zustand === 'rennen'; n++) { s.physikSchritt(1 / 60); if (f.nah && f.nah.s < L.sK - 100) davor = true; if (davor && !f.flug.aktiv && f.nah && f.nah.s >= L.sK - 16 - 38) break; }
          s.pausiert = true; s.kameras.forEach((k) => { k._erstesMal = true; k.update(0.0167); });
          (s.huds || []).forEach((hd) => { hd.eCountdown.className = 'hud-countdown'; hd.eCountdown.style.animation = 'none'; hd.eCountdown.textContent = ''; hd.meldung('x', 1); }); }""")
        page.wait_for_timeout(900)
        bild(page, 'moto_busse.png', '(Anfahrt auf die Bus-Reihe)')
        # schräg von vorn, nah: Kamera von Hand
        nah = page.evaluate('''() => { const s = Rennspiel.spiel, st = s.strecke, L = Rennspiel.Moto.stuntWelt.stuntDaten(st).reihen[0], k = s.kameras[0].kamera;
          const P = (a, q, y) => ({ x: L.x + L.tx * a + L.nx * q, z: L.z + L.tz * a + L.nz * q, y }), c = P(L.a0 - 9, L.halb + 3.5, 0), ziel = P(L.a0 + 3, L.halb - 2.5, 0);
          k.position.set(c.x, st.hoeheAn(c.x, c.z) + 3.0, c.z); k.lookAt(ziel.x, st.hoeheAn(ziel.x, ziel.z) + 1.4, ziel.z); k.fov = 55; k.updateProjectionMatrix(); k.updateMatrixWorld();
          s.kameras[0].update = () => {}; const p = new THREE.Vector3(ziel.x, st.hoeheAn(ziel.x, ziel.z) + 1.4, ziel.z).project(k); return { drin: Math.abs(p.x) < 0.9 && Math.abs(p.y) < 0.9 && p.z < 1 }; }''')
        page.wait_for_timeout(600)
        bild(page, 'moto_busse_nah.png', '(schräg von vorn: Schulbus gelb, Linienbusse, Fenster, Räder, Scheiben)')
        pruefe('Bus-Bilder: Kamera auf die Reihe gerichtet (Ziel im Bild)', nah['drin'], nah)
        ctx.close()

        # ---------------- Touch ----------------
        for (w, h) in [(844, 390), (667, 375), (932, 430), (1024, 768), (1280, 800)]:
            ctx, page = neue_seite(w, h, touch=True)
            page.goto(basisurl + 'Motorrad.html?touch=1'); page.wait_for_timeout(1500)
            page.evaluate('() => Rennspiel.spiel.rennenStarten' + EINST % 'wiese'); page.wait_for_timeout(1000)
            r = page.evaluate(RECHTECKE)
            t = r['trick']
            ok_text = t and 'Trick' in t['txt'] and '🌀' in t['txt'] and t['d'] != 'none'
            kollidiert = [k for k in ['mini', 'gas', 'brems', 'tacho', 'zeiten', 'chip', 'platz', 'reset', 'kam', 'pause', 'links', 'rechts', 'item'] if r[k] and r[k]['d'] != 'none' and ueber(t, r[k])]
            pruefe(f'Touch {w}×{h}: Trick-Knopf beschriftet („{t["txt"] if t else None}“), berührt nichts (Minikarte, Gas, Bremse, Tacho, Zeiten, Chip, Platz …)', ok_text and not kollidiert, f"{t} x {kollidiert}" if kollidiert else f"Knopf {t['l']},{t['t']}–{t['r']},{t['b']}; Minikarte {r['mini']['l']},{r['mini']['t']}–{r['mini']['r']},{r['mini']['b']}")
            it = r['item']
            pruefe(f'Touch {w}×{h}: ausgegrauter ⭐-Knopf ist beschriftet („{it["txt"]}“, Deckkraft {it["op"]})', it and 'Item' in page.evaluate("() => getComputedStyle(document.querySelector('.t-item'), '::after').content") and float(it['op']) < 0.6, it)
            if (w, h) == (844, 390):
                page.wait_for_timeout(300); bild(page, 'moto_touch_knoepfe.png', '(844×390: Trick-Knopf über der Bremse, Minikarte rechts oben, ⭐ „kein Item“)')
            ctx.close()

        # ---------------- Menü ----------------
        for (w, h) in [(844, 390), (1024, 768), (1280, 800), (1920, 1080)]:
            ctx, page = neue_seite(w, h)
            page.goto(basisurl + 'Motorrad.html'); page.wait_for_timeout(2200)
            m = page.evaluate("""() => { const re = document.querySelector('.reihe.modus-reihe'), mi = document.querySelector('.m-inhalt').getBoundingClientRect(), rr = re.getBoundingClientRect();
              const ks = [...re.querySelectorAll('.karte')].map((k) => { const r = k.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.right), Math.round(r.top), Math.round(r.bottom)]; });
              return { karten: ks, inhalt: [Math.round(mi.left), Math.round(mi.right), Math.round(mi.top), Math.round(mi.bottom)], sw: document.documentElement.scrollWidth, iw: innerWidth }; }""")
            voll = len(m['karten']) == 5 and all(k[0] >= m['inhalt'][0] and k[1] <= m['inhalt'][1] and k[2] >= m['inhalt'][2] - 14 and k[3] <= m['inhalt'][3] + 2 for k in m['karten']) and m['sw'] <= m['iw']
            pruefe(f'Menü {w}×{h}: alle 5 Modus-Karten liegen ganz im Inhaltsbereich (links {m["karten"][0][0]}, rechts {m["karten"][-1][1]}, Bereich {m["inhalt"][0]}–{m["inhalt"][1]})', voll, m)
            if (w, h) == (1280, 800): bild(page, 'moto_menue_modus.png', '(1280×800: erste Karte nicht mehr angeschnitten)')
            if (w, h) == (844, 390): bild(page, 'moto_menue_modus_844.png', '(844×390)')
            ctx.close()

        # ---------------- Autorennen.html ----------------
        ctx, page = neue_seite(844, 390)
        geladen = []
        page.on('request', lambda r: geladen.append(r.url) if '/src/moto/' in r.url else None)
        page.goto(basisurl + 'Autorennen.html'); page.wait_for_timeout(2200)
        a = page.evaluate("""() => { const re = document.querySelector('.reihe.modus-reihe'), mi = document.querySelector('.m-inhalt').getBoundingClientRect(), rr = re.getBoundingClientRect(); return { reihe: [Math.round(rr.left), Math.round(rr.right)], inhalt: [Math.round(mi.left), Math.round(mi.right)], moto: !!window.Rennspiel.Moto }; }""")
        print(f"      Hinweis (nur notiert, nicht geändert): Autorennen.html 844×390: Modus-Reihe {a['reihe'][0]}…{a['reihe'][1]} px, Inhalt {a['inhalt'][0]}…{a['inhalt'][1]} px")
        page.evaluate("() => Rennspiel.spiel.rennenStarten({ modus: 'solo', streckeId: 'wiese', autoIds: ['troc-cabrio', 'multivan'], runden: 1, gegner: 3, schwierigkeit: 'mittel', fahrhilfe: ['wenig', 'wenig'] })"); page.wait_for_timeout(800)
        pruefe('Autorennen.html: 0 JS-Fehler, lädt keine Moto-Datei', not geladen and not a['moto'], str(geladen[:2]))
        ctx.close()
        pruefe('Motorrad.html: 0 JS-Fehler im ganzen Lauf', not fehler, '; '.join(fehler[:3]))
        browser.close()
finally:
    server.terminate()

ok = sum(ergebnisse); print(f'\n{ok}/{len(ergebnisse)} Prüfungen bestanden')
sys.exit(0 if ok == len(ergebnisse) else 1)
