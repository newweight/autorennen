#!/usr/bin/env python3
"""Browser-Rauchtest Motorrad-Modus: Feuerring der Alpen (Kleinkram M2c-2, Punkt 5).
Aufruf: python3 tests/moto_ring_rauch.py
Prüft und fotografiert (Bild nach tests/out/moto/moto_alpen_ring.png):
  - Alpen: der Ring hat eine Unterkante >= 1,0 m über dem Boden (vorher 0,31 m), die Mitte liegt auf der Flugbahn (Abweichung <= 0,15 m, im Node-Test geprüft)
  - Bild: Motorrad fliegt in der Luft durch die Ringebene (Standbild), Ring und Motorrad im Bild, Ring-Bewertung des Spiels = Volltreffer/Treffer
  - Motorrad.html: 0 JS-Fehler"""
import os, sys, time, socket, subprocess
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

EINST = "({ modus: 'solo', streckeId: 'alpen', autoIds: ['crossmaschine', 'crossmaschine-rot'], runden: 1, gegner: 3, schwierigkeit: 'mittel', fahrhilfe: ['wenig', 'wenig'], stuntrennen: true, unfall: 'aus' })"

try:
    with sync_playwright() as p:
        browser = p.chromium.launch(args=ARGS)
        page = browser.new_page(viewport={'width': 1280, 'height': 800})
        fehler = []
        page.on('pageerror', lambda e: fehler.append('pageerror: ' + str(e)))
        page.on('console', lambda m: fehler.append('console.error: ' + m.text) if m.type == 'error' else None)
        page.goto(basisurl + 'Motorrad.html'); page.wait_for_timeout(1500)
        page.evaluate('() => Rennspiel.spiel.rennenStarten' + EINST); page.wait_for_timeout(500)
        info = page.evaluate('''() => { const s = Rennspiel.spiel; let g = 0; while ((s.zustand !== 'rennen' || !s.rennen.gasErlaubt) && g++ < 3000) s.physikSchritt(1 / 60);
          const D = Rennspiel.Moto.stuntWelt.stuntDaten(s.strecke), r = D.ringe[0], b = s.strecke.hoeheAn(r.x, r.z);
          return { n: D.ringe.length, mitte: +(r.y - b).toFixed(2), radius: r.radius, unterkante: +(r.y - r.radius - b).toFixed(2), oberkante: +(r.y + r.radius - b).toFixed(2), nr: r.nr }; }''')
        pruefe('Alpen: Feuerring vorhanden, Unterkante %.2f m über dem Boden (>= 1,0 m; vorher 0,31 m), Mitte %.2f m, Radius %.1f m' % (info['unterkante'], info['mitte'], info['radius']), info['n'] >= 1 and info['unterkante'] >= 1.0 and info['oberkante'] <= 6.5, info)
        # Das Motorrad rollt mit 32 m/s (Auslegungstempo des Rings) ohne Lenken auf die Schanze; Standbild, sobald das Motorrad in der Luft kurz vor der Ringebene ist
        res = page.evaluate("""() => { const s = Rennspiel.spiel, f = s.fahrzeuge[0], v = f.vehicle, D = Rennspiel.Moto.stuntWelt.stuntDaten(s.strecke), r = D.ringe[0], St = Rennspiel.Moto.stunts;
          const sch = Rennspiel.Schanzen.liste(s.strecke)[r.nr]; const p = s.strecke.spline.punktBei(sch.s - 20);
          v.setzen(p.x, p.z, Rennspiel.headingAus(p.tx, p.tz)); v.vLaengs = 32; v.y = s.strecke.hoeheAn(p.x, p.z); f.index = s.strecke.spline.indexBei(sch.s - 20); f.nah = s.strecke.spline.naechster(p.x, p.z, f.index);
          s.autopilot(0, false); let ok = false, n = 0, prev = null, hit = null;
          for (; n < 60 * 40 && s.zustand === 'rennen'; n++) { if (!f.flug.aktiv) v.vLaengs = 32; s.physikSchritt(1 / 60);
            const d = (v.x - r.x) * r.tx + (v.z - r.z) * r.tz, q = (v.x - r.x) * r.nx + (v.z - r.z) * r.nz;
            if (prev && f.flug.aktiv) { const h = St.ringDurchflug(prev.d, d, prev.q, q, prev.y, v.y, r.y, r.cfgRing || Rennspiel.config.motoStunts); if (h) hit = h; }
            if (f.flug.aktiv && d > -2.2 && d < -0.6) { ok = true; break; } prev = { d, q, y: v.y }; }
          s.pausiert = true; s.kameras.forEach((k) => { k._erstesMal = true; k.update(0.0167); }); s.kameras[0].update = () => {};
          return { ok, n, luft: !!f.flug.aktiv, hoeheUeberBoden: +(v.y - s.strecke.hoeheAn(v.x, v.z)).toFixed(2) }; }""")
        # Kamera von Hand: schräg hinten/seitlich, Blick auf die Ringmitte
        cam = page.evaluate('''() => { const s = Rennspiel.spiel, f = s.fahrzeuge[0], v = f.vehicle, k = s.kameras[0].kamera, D = Rennspiel.Moto.stuntWelt.stuntDaten(s.strecke), r = D.ringe[0];
          const h = { x: v.x, y: v.y, z: v.z };
          k.position.set(h.x - r.tx * 12 + r.nx * 9, h.y + 2.2, h.z - r.tz * 12 + r.nz * 9); k.fov = 55; k.updateProjectionMatrix(); k.lookAt(r.x + r.tx * 2, r.y - 0.4, r.z + r.tz * 2); k.updateMatrixWorld();
          (s.huds || []).forEach((hd) => { hd.eCountdown.className = 'hud-countdown'; hd.eCountdown.style.animation = 'none'; hd.eCountdown.textContent = ''; hd.meldung('x', 1); });
          const pr = (x, y, z) => { const P = new THREE.Vector3(x, y, z).project(k); return { x: +P.x.toFixed(2), y: +P.y.toFixed(2), drin: Math.abs(P.x) < 0.95 && Math.abs(P.y) < 0.95 && P.z < 1 }; };
          const gr = s.strecke.hoeheAn(r.x, r.z);
          return { ring: pr(r.x, r.y, r.z), oben: pr(r.x, r.y + r.radius, r.z), unten: pr(r.x, r.y - r.radius, r.z), links: pr(r.x + r.nx * r.radius, r.y, r.z + r.nz * r.radius), rechts: pr(r.x - r.nx * r.radius, r.y, r.z - r.nz * r.radius), bike: pr(v.x, v.y + 0.9, v.z), abstandRing: +Math.hypot(v.x - r.x, v.z - r.z).toFixed(1), ringHoch: +(r.y - gr).toFixed(2) }; }''')
        page.wait_for_timeout(900)
        page.screenshot(path=os.path.join(out, 'moto_alpen_ring.png')); print('      Bild: tests/out/moto/moto_alpen_ring.png (Alpen: Motorrad in der Luft kurz vor der Ringebene, Kamera schräg hinten)')
        pruefe('Bild Alpen-Ring gültig: Motorrad in der Luft (%.1f m über dem Boden), %.1f m vor dem Ring' % (res['hoeheUeberBoden'], cam['abstandRing']), res['ok'] and res['luft'] and res['hoeheUeberBoden'] > 0.5 and cam['abstandRing'] < 4, {**res, 'cam': cam})
        pruefe('Bild Alpen-Ring: Ring ganz im Bild (Mitte, oben, unten, links, rechts) und Motorrad im Bild', all(cam[k]['drin'] for k in ('ring', 'oben', 'unten', 'links', 'rechts', 'bike')), cam)
        # Weiterfliegen: das Spiel wertet den Durchflug
        w = page.evaluate("""() => { const s = Rennspiel.spiel, v = s.fahrzeuge[0].vehicle, r = Rennspiel.Moto.stuntWelt.stuntDaten(s.strecke).ringe[0]; s.pausiert = false; let n = 0; const z = s.stunt && s.stunt.fz[0]; const before = z ? z.punkte : 0, kreuz = [];
          let prevD = null; for (; n < 60 * 4; n++) { s.physikSchritt(1 / 60); const d = (v.x - r.x) * r.tx + (v.z - r.z) * r.tz; if (prevD !== null && prevD < 0 && d >= 0) kreuz.push({ q: +((v.x - r.x) * r.nx + (v.z - r.z) * r.nz).toFixed(2), dy: +(v.y + 0.9 - r.y).toFixed(2) }); prevD = d; }
          return { punkte0: before, punkte: z ? z.punkte : 0, ringe: z && z.stat ? z.stat.ringe : null, volltreffer: z && z.stat ? z.stat.volltreffer : null, kreuz }; }""")
        pruefe('Der Durchflug wird gewertet: Volltreffer (+1000), mittig (q %s m, dy %s m)' % (w['kreuz'][0]['q'] if w['kreuz'] else '-', w['kreuz'][0]['dy'] if w['kreuz'] else '-'), w['punkte'] >= w['punkte0'] + 1000 and w['volltreffer'] >= 1, w)
        pruefe('Motorrad.html: 0 JS-Fehler im ganzen Lauf', not fehler, '; '.join(fehler[:3]))
        browser.close()
finally:
    server.terminate()
n_ok = sum(ergebnisse); print(f'\n{n_ok}/{len(ergebnisse)} Prüfungen bestanden'); sys.exit(0 if n_ok == len(ergebnisse) else 1)
