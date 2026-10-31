#!/usr/bin/env python3
"""STARTFEHLER: feste Matrix-Prüfung über beide Spiele (Playwright, headless Chromium, 2 CPU-Kerne).

Prüft jede Kombination  Spiel x Strecke x Modus x Grafik  mit ALLEN Spaß-Schaltern an
(Spaß-Elemente, Dino „Überall“, Regenbogenspur, Fahr-Zauber, Zufall, Geist, Tuning Stufe 5, Haustier/Kostüm):

  offline (Solo / Zweispieler):
    1. Start ohne JS-Fehler, Zustand 'rennen', Fehleranzeige („⚠️ Fehler – Esc für Menü“, #moto-fehler) nie sichtbar
    2. Kamera: beim Start steckt keine Kamera im Startbogen/Banner (Abstand), das Banner füllt nicht das Bild; Durchfahrt
       durch die Startlinie in allen 3 Ansichten (Cockpit/Verfolger/Weit) ohne Banner-Treffer (Fahrt mit 25 m/s)
    3. Countdown läuft durch (3 → 0, Zustand 'laeuft')
    4. dann N s fahren (Autopilot, Gas): keine JS-Fehler (pageerror, console.error, window.onerror, Ausnahme in frame()), keine NaN,
       Fahrzeug bewegt sich
    5. Zweispieler + Grafik „Schön“: mitten im Rennen Grafikwechsel über das Pause-Menü (Schön -> Ultra -> Normal -> Schön)
  online (Server als Unterprozess, 2 Browser-Seiten): Raum, Lobby, Start, Countdown, N s fahren (Autopilot), keine Fehler auf beiden Seiten.

Die Spielzeit läuft mit festem Takt (ein Bild = 4 Physikschritte, dazwischen weitere Schritte): bei SwiftShader mit wenigen Bildern je Sekunde
trotzdem 20 s Spielzeit. Gerendert wird jedes Bild wirklich (Grafikstufe, Spiegel, Schatten, HUD).

Aufruf (Teilmengen):
  python3 tests/matrix_alle.py                         # volle Matrix (lang!)
  python3 tests/matrix_alle.py --schnell               # kleine Teilmenge (ca. 10 Min)
  python3 tests/matrix_alle.py --spiel moto --strecke unterwasser --modus zwei --grafik schoen
  Optionen: --spiel auto|moto|beide   --strecke id[,id…]|alle (eigen = Editor-Strecke, stuntpark nur Motorrad)
            --modus solo|zwei|online[,…]|alle   --grafik normal|schoen|ultra|alle   --sekunden 20
            --startbilder  Bild beider Hälften je Strecke (Kamera-Befund) nach tests/bilder_startfehler/kamera/
Ausgabe: je Kombination OK/FEHL, am Ende Zusammenfassung; Exit-Code 0 nur ohne FEHL."""
import tempfile, argparse, os, sys, time, json, socket, subprocess, threading, http.server, functools
from playwright.sync_api import sync_playwright

basis = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist',
        '--autoplay-policy=no-user-gesture-required']
GRAFIKEN = ['normal', 'schoen', 'ultra']
SPIELE = {'auto': ('Autorennen.html', 'rennspiel.grafik.v1'), 'moto': ('Motorrad.html', 'motorrad.grafik.v1')}
ONLINE_STRECKEN = ['mond', 'unterwasser', 'regenbogenland', 'wiese']
SCHNELL_STRECKEN = ['unterwasser', 'mond', 'wiese']
HARMLOS = ('GPU stall',)          # bekannte, harmlose Konsolenmeldungen (SwiftShader)

# ------------------------------------------------------------------------------------------------ Seiten-Skripte
# Profil „alles an“: Dino überall, Regenbogenspur, Fahr-Zauber, Tuning 5, Haustier + Kostüm (Beiwagen) – wie ein Kind mit voller Garage
PROFIL = """(() => { try {
  const ids = ['crossmaschine','crossmaschine-rot','crossmaschine-blau','crossmaschine-gruen','superbike','roller','chopper','quad','passat','porsche-911','troc-cabrio','multivan'];
  const t = {}; ['Jonas','Emmy'].forEach(n => { t[n] = {}; ids.forEach(i => { t[n][i] = { motor: 5, reifen: 5, bremsen: 5 }; }); });
  localStorage.setItem('rennspiel.garage.v1.tuning', JSON.stringify(t));
  localStorage.setItem('rennspiel.garage.v1.motorrad.tuning', JSON.stringify(t));
  localStorage.setItem('rennspiel.spass.zauber.an', '1');
  localStorage.setItem('rennspiel.spass.zauber.figur', JSON.stringify({ fahrer: {
    Jonas: { pet: 'hund', kost: 'ritter', beiwagen: true, gekauft: ['ritter','astronaut','pirat','superheld','dino'] },
    Emmy: { pet: 'papagei', kost: 'astronaut', beiwagen: false, gekauft: ['astronaut'] } } }));
  const w = JSON.stringify({ spur: true, dino: 'immer' });
  localStorage.setItem('rennspiel.spass.welten.motorrad', w); localStorage.setItem('rennspiel.spass.welten.auto', w);
} catch (e) {} })();
window.__fe = []; window.addEventListener('error', (e) => { window.__fe.push(String(e.message) + ' @' + e.filename + ':' + e.lineno + (e.error && e.error.stack ? ' ' + String(e.error.stack).split('\\n').slice(0, 4).join(' | ') : '')); });
window.addEventListener('unhandledrejection', (e) => { window.__fe.push('Promise: ' + String(e.reason && (e.reason.stack || e.reason))); });"""

# Takt-Treiber: Spiel-Schleife aus, wir rufen die Bilder selbst (fester Takt, jedes Bild wird gerendert)
JS_PREP = """() => {
  const R = Rennspiel, S = R.spiel;
  S.laeuft = false;
  const mx = window.__mx = { T: performance.now(), fehler: [] };
  const kurz = (e) => String(e && e.stack || e).split('\\n').slice(0, 5).join(' | ');
  mx.frame = (n) => {
    mx.T += n * 1000 / 60;
    try { S._frameRumpf(mx.T); if (S._fehler) S._fehler.reihe = 0; }
    catch (e) { mx.fehler.push('frame(): ' + kurz(e)); try { S._frameAusnahme(e); } catch (e2) {} }
  };
  mx.laufen = (sek, bulk) => {
    const n = Math.max(1, Math.round(sek / ((bulk + 4) / 60))), vmax = [0, 0];
    for (let i = 0; i < n; i++) {
      for (let b = 0; b < bulk; b++) { try { S.physikSchritt(1 / 60); } catch (e) { mx.fehler.push('physikSchritt(): ' + kurz(e)); break; } }
      mx.frame(4);
      S.fahrzeuge.slice(0, 2).forEach((f, k) => { vmax[k] = Math.max(vmax[k], Math.abs(f.vehicle.vLaengs)); });
      if (mx.fehler.length > 3) break;
    }
    return vmax;
  };
  mx.status = () => {
    const vis = (e) => { if (!e) return false; const c = getComputedStyle(e); return c.display !== 'none' && c.visibility !== 'hidden' && parseFloat(c.opacity || '1') > 0.05; };
    const meld = [...document.querySelectorAll('.hud-meldung')].filter((e) => /Fehler/.test(e.textContent) && vis(e)).map((e) => e.textContent.trim());
    const box = document.getElementById('moto-fehler');
    const r = S.rennen;
    return { zustand: S.zustand, rz: r && r.zustand, cd: r && r.countdown, zeit: r && r.zeit, pausiert: !!S.pausiert,
      nF: S._fehler ? S._fehler.gesamt : 0, meldung: meld, box: !!box && vis(box) ? box.innerText.slice(0, 300) : '', fe: (window.__fe || []).slice(0, 3),
      nan: S.fahrzeuge.some((f) => [f.vehicle.x, f.vehicle.y, f.vehicle.z, f.vehicle.heading, f.vehicle.vLaengs].some((v) => !isFinite(v))),
      fehler: mx.fehler.slice(0, 4), v: S.fahrzeuge.slice(0, 2).map((f) => Math.round(f.vehicle.vLaengs * 10) / 10),
      s: S.fahrzeuge.slice(0, 2).map((f) => { try { return Math.round(S.strecke.spline.naechster(f.vehicle.x, f.vehicle.z).s); } catch (e) { return -1; } }) };
  };
  return true;
}"""

JS_EDITOR = """() => {
  const R = Rennspiel, E = R.Editor;
  if (!E) return { ok: false, text: 'kein Editor' };
  function rng(seed) { let s = seed >>> 0; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; }
  const r = rng(3), a1 = r() * 0.45 + 0.1, a2 = r() * 0.35, p1 = r() * 6, p2 = r() * 6, r0 = 300 + r() * 120, start = r() * 6, roh = [], n = 150;
  for (let i = 0; i < n; i++) { const t = start + (i / n) * 2 * Math.PI * 0.97, rad = r0 * (1 + a1 * Math.sin(2 * t + p1) + a2 * Math.sin(3 * t + p2)); roh.push([rad * Math.cos(t) + (r() - 0.5) * 9, rad * Math.sin(t) + (r() - 0.5) * 9]); }
  const v = E.verarbeiten(roh);
  if (!v.ok) return { ok: false, text: 'verarbeiten: ' + (v.text || v.grund) };
  const d = E.neu(v.pkt, 'Matrix', 'wiese');
  const arten = ['schanze', 'trampolin', 'kanone', 'tor', 'magnet', 'gold'].concat(window.MOTORRAD === true ? ['ring'] : []);
  let s = 300; const gesetzt = [];
  arten.forEach((a) => { try { const x = E.setzen(d, a, s); if (x && x.ok !== false) gesetzt.push(a); } catch (e) {} s += 260; });
  const res = E.Speicher.speichern(d);
  return { ok: !!res.ok, id: res.id, gesetzt, laenge: Math.round(E.umfang ? E.umfang(v.pkt) : 0) };
}"""

JS_STRECKEN = """() => Rennspiel.trackCatalog.filter((t) => !t.eigen).map((t) => t.id)"""

JS_START = """(cfg) => {
  const R = Rennspiel, S = R.spiel, mx = window.__mx; mx.fehler.length = 0; window.__fe = [];
  try { R.Grafik.setzen(cfg.grafik); } catch (e) { mx.fehler.push('Grafik: ' + e); }
  const wb = R.carCatalog.waehlbare().map((a) => a.id);
  const paare = cfg.paare.filter((p) => p.every((x) => wb.indexOf(x) >= 0));
  const ids = (paare.length ? paare[cfg.nr % paare.length] : [wb[0], wb[1] || wb[0]]);
  const ein = Object.assign({ runden: 2, schwierigkeit: 'mittel', fahrhilfe: ['wenig', 'wenig'], spass: true, geist: true, zufall: true, tuning: true, zauber: true,
    autoIds: ids, gegner: cfg.modus === 'zwei' ? 2 : 3, modus: cfg.modus }, cfg.einst || {});
  const t0 = performance.now();
  try { S.rennenStarten(ein); }
  catch (e) { mx.fehler.push('rennenStarten(): ' + String(e && e.stack || e).split('\\n').slice(0, 5).join(' | ')); return { ok: false, fehler: mx.fehler.slice() }; }
  const ms = Math.round(performance.now() - t0);
  mx.T = performance.now(); S.uhr.letzte = mx.T; S.uhr.rest = 0; S.laeuft = false;
  try { S.autopilot(0, true); if (S.kameras.length > 1) S.autopilot(1, true); } catch (e) { mx.fehler.push('autopilot: ' + e); }
  return { ok: true, ms, ids, zustand: S.zustand, rz: S.rennen && S.rennen.zustand, cd: S.rennen && S.rennen.countdown, kameras: S.kameras.length,
    strecke: S.strecke && S.strecke.daten && S.strecke.daten.id, thema: S.strecke && S.strecke.daten && S.strecke.daten.thema };
}"""

# Kamera gegen Startbogen: (a) die echten Kameras beim Start (alle 3 Ansichten) – Abstand + Bildanteil, (b) Durchfahrt mit 25 m/s je Ansicht
JS_KAMERA = """(cfg) => {
  const R = Rennspiel, S = R.spiel, mx = window.__mx;
  for (let i = 0; i < 2; i++) mx.frame(4);
  const bogen = S.szene.getObjectByName('Startbogen');
  const out = { bogen: !!bogen, start: [], durch: [] };
  if (!bogen) return out;
  bogen.updateMatrixWorld(true);
  const alle = [], banner = [];
  bogen.traverse((o) => { if (o.isMesh && o.geometry) { const b = new THREE.Box3().setFromObject(o); alle.push(b); const g = b.getSize(new THREE.Vector3()); if (Math.max(g.x, g.z) > 8) banner.push(b); } });
  const dist = (p) => Math.min.apply(null, alle.map((b) => b.distanceToPoint(p)));
  const v4 = new THREE.Vector4();
  function bildanteil(kam) {
    kam.updateMatrixWorld(true); const inv = kam.matrixWorldInverse.copy(kam.matrixWorld).invert();
    let x0 = 9, x1 = -9, y0 = 9, y1 = -9, vorn = 0, hinten = 0;
    banner.forEach((b) => { for (let i = 0; i < 8; i++) {
      v4.set(i & 1 ? b.max.x : b.min.x, i & 2 ? b.max.y : b.min.y, i & 4 ? b.max.z : b.min.z, 1).applyMatrix4(inv);
      if (v4.z > -kam.near) { hinten++; continue; }
      v4.applyMatrix4(kam.projectionMatrix); const w = v4.w || 1e-9, x = v4.x / w, y = v4.y / w; vorn++;
      x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); } });
    if (hinten && vorn) return 1;
    if (!vorn) return 0;
    const cl = (a) => Math.max(-1, Math.min(1, a));
    return Math.max(0, (cl(x1) - cl(x0)) * (cl(y1) - cl(y0)) / 4);
  }
  const modi = R.config.kamera.modi, idx0 = S.kameras.map((k) => k.modusIndex);
  S.kameras.forEach((k, i) => {
    const p = k.kamera.position;
    out.start.push({ i, modus: k.modus, d: +dist(p).toFixed(2), anteil: +bildanteil(k.kamera).toFixed(3), cam: [p.x, p.y, p.z].map((v) => +v.toFixed(1)) });
  });
  // Durchfahrt: eigene Kamera-Instanz (gleiche, umhüllte update-Funktion), Stellvertreter-Fahrzeug fährt mit 25 m/s von s = -70 bis +70 durch die Startlinie
  const sp = S.strecke.spline, L = sp.laenge;
  modi.forEach((m, mi) => {
    const k = new R.FahrzeugKamera(1.6); k._motoStart = true; k.modusIndex = mi;
    const st = { x: 0, y: 0, z: 0, heading: 0, neigung: 0, nicken: 0, vLaengs: 25, vQuer: 0, lenkung: 0, daten: { vMax: 50 }, richtung() { return { x: -Math.sin(this.heading), z: -Math.cos(this.heading) }; } };
    k.folge(st, st);
    let dmin = 1e9, sMin = 0, amax = 0, erst = true;
    for (let s = -70; s <= 70; s += 25 / 30) {
      const q = sp.punktBei(((s % L) + L) % L);
      st.x = q.x; st.y = q.y; st.z = q.z; st.heading = Math.atan2(-q.tx, -q.tz);
      k.update(1 / 30); erst = false;
      const d = dist(k.kamera.position); if (d < dmin) { dmin = d; sMin = s; }
      if (s > -40 && s < 40) amax = Math.max(amax, bildanteil(k.kamera));
    }
    out.durch.push({ modus: m, d: +dmin.toFixed(2), s: Math.round(sMin), anteil: +amax.toFixed(2) });
  });
  S.kameras.forEach((k, i) => { k.modusIndex = idx0[i]; k._erstesMal = true; });
  return out;
}"""

JS_AUSNAHME_TEXT = """() => (window.__mx ? window.__mx.fehler.slice(0, 4) : [])"""


# ------------------------------------------------------------------------------------------------ Hilfen
KLICK_TIMEOUT = int(__import__("os").environ.get("MX_KLICK_MS", "90000"))   # echter Klick (Sichtbarkeit/Überdeckung wird geprüft); Zeit großzügig wegen SwiftShader

def freier_port():
    s = socket.socket(); s.bind(('127.0.0.1', 0)); p = s.getsockname()[1]; s.close(); return p


def http_server_starten():
    class Still(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *a): pass
    port = freier_port()
    srv = http.server.ThreadingHTTPServer(('127.0.0.1', port), functools.partial(Still, directory=basis))
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv, port


def neue_seite(browser, spiel, breite=400, hoehe=225):
    ctx = browser.new_context(viewport={'width': breite, 'height': hoehe})
    ctx.add_init_script(PROFIL)
    page = ctx.new_page(); page.set_default_timeout(600000)
    page._fl = []
    page.on('pageerror', lambda e: page._fl.append(('pageerror: %s' % str(e)).replace('\n', ' | ')[:700]))
    page.on('console', lambda m: page._fl.append(('console.error: ' + m.text).replace('\n', ' | ')[:900]) if m.type == 'error' and not any(h in m.text for h in HARMLOS) else None)
    return page


def spiel_laden(page, spiel, url=None):
    html = SPIELE[spiel][0]
    page.goto(url or ('file://' + os.path.join(basis, html)), wait_until='domcontentloaded')
    page.wait_for_function('window.Rennspiel && Rennspiel.spiel', timeout=120000, polling=200)
    page.wait_for_timeout(1200)
    page.keyboard.press('ShiftLeft')                 # echte Eingabe: der Ton startet wie beim Kind (Autoplay-Regel), Umschalt tut im Menü nichts
    page.wait_for_timeout(300)
    page.evaluate(JS_PREP)


def alle_fehler(page, st):
    f = list(page._fl)
    for k in ('fehler', 'fe'):
        f += st.get(k, [])
    if st.get('nF'): f.append('frame()-Ausnahmen: %s' % st['nF'])
    if st.get('meldung'): f.append('Fehleranzeige sichtbar: %s' % st['meldung'])
    if st.get('box'): f.append('Fehlerkasten sichtbar: %s' % st['box'])
    if st.get('nan'): f.append('NaN im Fahrzeug')
    if st.get('pausiert') and st.get('zustand') == 'rennen': f.append('Spiel unerwartet pausiert')
    return f


# ------------------------------------------------------------------------------------------------ eine Offline-Kombination
def offline_kombi(page, spiel, strecke, modus, grafik, sekunden, nr, bildordner=None, kamera_ordner=None):
    """Gibt (ok, grund, info) zurück."""
    einst = {'streckeId': strecke}
    if strecke == 'stuntpark': einst = {'stuntpark': True, 'streckeId': 'wiese'}
    paare = ([['superbike', 'quad'], ['roller', 'chopper'], ['crossmaschine', 'crossmaschine-rot']] if spiel == 'moto'
             else [['passat', 'porsche-911'], ['troc-cabrio', 'multivan']])
    page._fl.clear()
    t0 = time.time()
    st = page.evaluate(JS_START, {'grafik': grafik, 'modus': modus, 'einst': einst, 'paare': paare, 'nr': nr})
    if not st.get('ok'): return False, 'Start: ' + ' / '.join(st.get('fehler', [])), {}
    info = {'startMs': st['ms'], 'ids': st['ids']}
    # --- Kamera gegen Startbogen
    kam = page.evaluate(JS_KAMERA, {})
    info['kamera'] = kam
    probleme = []
    if kam['bogen']:
        for s in kam['start']:
            if s['d'] < 1.0: probleme.append('Kamera %d (%s) steckt beim Start im Bogen/Banner (Abstand %.2f m)' % (s['i'] + 1, s['modus'], s['d']))
            if s['anteil'] > 0.5: probleme.append('Banner füllt bei Kamera %d (%s) %d %% des Bildes' % (s['i'] + 1, s['modus'], round(s['anteil'] * 100)))
        for d in kam['durch']:
            if d['d'] < 0.8: probleme.append('Kamera-Durchfahrt (%s): %.2f m am Bogen bei s=%d' % (d['modus'], d['d'], d['s']))
    if kamera_ordner:
        page.evaluate("() => { window.__mx.frame(4); }")
        try: page.screenshot(path=os.path.join(kamera_ordner, '%s_%s_%s_%s.png' % (spiel, strecke, modus, grafik)), timeout=120000)
        except Exception as e: print('      (Bild fehlgeschlagen: %s)' % str(e)[:60])
    s0 = page.evaluate('() => window.__mx.status()')
    f = alle_fehler(page, s0)
    if f: return False, 'Startfehler: ' + ' | '.join(f[:3]), info
    if s0['zustand'] != 'rennen' or s0['rz'] != 'countdown': return False, 'Zustand nach Start: %s/%s' % (s0['zustand'], s0['rz']), info
    cd0 = s0['cd']
    # --- Countdown
    gesehen_cd = [cd0]; ok_cd = False
    for i in range(14):
        page.evaluate('() => window.__mx.laufen(0.6, 8)')      # ein Bild je 0,2 s Spielzeit
        s1 = page.evaluate('() => window.__mx.status()')
        gesehen_cd.append(s1['cd'])
        f = alle_fehler(page, s1)
        if f: return False, 'Fehler im Countdown: ' + ' | '.join(f[:3]), info
        if s1['rz'] == 'laeuft': ok_cd = True; break
    if not ok_cd: return False, 'Countdown läuft nicht durch (Zustand %s, Zähler %s)' % (s1['rz'], [round(c, 2) if c is not None else None for c in gesehen_cd[-4:]]), info
    # --- fahren
    vmax = [0, 0]; fertig = 0.0; gewechselt = []
    while fertig < sekunden:
        schritt = min(5.0, sekunden - fertig)
        v = page.evaluate('(a) => window.__mx.laufen(a[0], a[1])', [schritt, 20])      # ein Bild je 0,4 s Spielzeit
        fertig += schritt; vmax = [max(vmax[0], v[0]), max(vmax[1], v[1])]
        s2 = page.evaluate('() => window.__mx.status()')
        f = alle_fehler(page, s2)
        if f: return False, 'Fehler nach %.0f s Fahrt: %s' % (fertig, ' | '.join(f[:3])), info
        # Grafikwechsel über das Pause-Menü (nur Zweispieler + „Schön“, einmal in der Mitte)
        if modus == 'zwei' and grafik == 'schoen' and not gewechselt and fertig >= sekunden / 2 and s2['rz'] == 'laeuft':
            gewechselt = ['pause']
            try:
                page.evaluate("() => { const S = Rennspiel.spiel; S.pauseSetzen(true); S.pauseAnzeige.zeigen(); }")
                for k in range(3):
                    page.click('#pause [data-g1]', timeout=KLICK_TIMEOUT)
                    page.evaluate('() => window.__mx.frame(4)')
                    gewechselt.append(page.evaluate('() => Rennspiel.Grafik.stufe'))
                page.evaluate("() => { const S = Rennspiel.spiel; S.pauseAnzeige.verstecken(); S.pauseSetzen(false); window.__mx.frame(4); }")
            except Exception as e:
                return False, 'Grafikwechsel im Pause-Menü: ' + str(e)[:1800], info
            s3 = page.evaluate('() => window.__mx.status()'); f = alle_fehler(page, s3)
            if f: return False, 'Fehler nach Grafikwechsel im Pause-Menü: ' + ' | '.join(f[:3]), info
    info['vmax'] = [round(x, 1) for x in vmax]
    info['sek'] = round(time.time() - t0)
    if vmax[0] < 3: return False, 'Spieler 1 fährt nicht (max. %.1f m/s)' % vmax[0], info
    if modus == 'zwei' and vmax[1] < 3: return False, 'Spieler 2 fährt nicht (max. %.1f m/s)' % vmax[1], info
    if bildordner:
        try: page.screenshot(path=os.path.join(bildordner, '%s_%s_%s_%s.png' % (spiel, strecke, modus, grafik)), timeout=120000)
        except Exception: pass
    if probleme: return False, '; '.join(probleme), info
    return True, '', info


# ------------------------------------------------------------------------------------------------ eine Online-Kombination
AUTOPILOT = """(art) => { const s = Rennspiel.spiel, o = s.online, R = Rennspiel;
  if (!s._origSteuerung) s._origSteuerung = s.input.steuerung.bind(s.input);
  const d = new R.Driver(o.vorhersage.vp, s.strecke, { schwierigkeit: 'mittel', seed: 77 + o.du, name: 'Test' });
  if (d.hindernisseSetzen) d.hindernisseSetzen(s.strecke.hindernisse);
  s.input.steuerung = (nr) => {
    if (nr !== 0) return { gas: 0, bremse: 0, lenkung: 0 };
    const t = s.rennen.teilnehmer[o.du];
    const st = d.steuerung(1 / 60, { andere: [], spielerFortschrittMax: null, eigenerFortschritt: t.fortschritt, laeuft: s.rennen.gasErlaubt });
    const v = o.vorhersage.vp;
    return R.Anlauf ? R.Anlauf.kiHilfe({}, v, s.strecke, s.strecke.spline.naechster(v.x, v.z), st) : st; };
  return true; }"""
ON_STATUS = """() => { const S = Rennspiel.spiel, o = S.online, r = S.rennen;
  const vis = (e) => { if (!e) return false; const c = getComputedStyle(e); return c.display !== 'none' && c.visibility !== 'hidden' && parseFloat(c.opacity || '1') > 0.05; };
  const meld = [...document.querySelectorAll('.hud-meldung')].filter((e) => /Fehler/.test(e.textContent) && vis(e)).map((e) => e.textContent.trim());
  const box = document.getElementById('moto-fehler');
  return { zustand: S.zustand, rz: r && r.zustand, empfangen: !!(o && o.empfangen), du: o && o.du, nF: S._fehler ? S._fehler.gesamt : 0, meldung: meld,
    box: !!box && vis(box) ? box.innerText.slice(0, 300) : '', fe: (window.__fe || []).slice(0, 3), pausiert: !!S.pausiert,
    v: S.fahrzeuge && o ? S.fahrzeuge[o.du].vehicle.vLaengs : 0, nan: S.fahrzeuge ? S.fahrzeuge.some((f) => [f.vehicle.x, f.vehicle.z].some((x) => !isFinite(x))) : false }; }"""


def online_kombi(browser, spiel, strecke, grafik, sekunden):
    html, gkey = SPIELE[spiel]
    port = freier_port()
    cmd = ['node', os.path.join(basis, 'server', 'server.js'), '--port', str(port), '--host', '127.0.0.1'] + (['--motorrad'] if spiel == 'moto' else [])
    srv_log = tempfile.NamedTemporaryFile('w+', suffix='.srvlog', delete=False)
    srv = subprocess.Popen(cmd, stdout=srv_log, stderr=subprocess.STDOUT)
    seiten = []
    try:
        for _ in range(100):
            try: socket.create_connection(('127.0.0.1', port), timeout=0.2).close(); break
            except OSError: time.sleep(0.1)
        url = 'http://127.0.0.1:%d/' % port
        host = neue_seite(browser, spiel, 400, 225); gast = neue_seite(browser, spiel, 400, 225); seiten = [host, gast]   # Lobby im kleinen Fenster (src/net/online.js: unter 520 px Höhe kompakt)
        for pg in seiten:
            pg.context.add_init_script("try{localStorage.setItem('%s','%s')}catch(e){}" % (gkey, grafik))
        host.goto(url + html, wait_until='domcontentloaded')
        host.wait_for_function('window.Rennspiel && Rennspiel.spiel', timeout=120000, polling=200); host.wait_for_timeout(1000)
        host.keyboard.press('ShiftLeft')
        host.evaluate("() => { Rennspiel.spiel.menue.onlineOeffnen(); }"); host.wait_for_timeout(400)
        host.click('[data-a="erstellen"]')
        host.wait_for_function("Rennspiel.spiel.menue.onlineUi && Rennspiel.spiel.menue.onlineUi.lobby && Rennspiel.spiel.menue.onlineUi.ansicht === 'lobby'", timeout=900000, polling=200)
        code = host.evaluate('Rennspiel.spiel.menue.onlineUi.lobby.code')
        # Host stellt Strecke + Spaß ein (Lobby-Pillen), 1 Runde, 1 Computer
        for a in ['wert:strecke:' + strecke, 'wert:spass:an', 'wert:zauber:an', 'wert:runden:1', 'wert:gegner:1']:
            try: host.click('[data-a="%s"]' % a, timeout=8000); host.wait_for_timeout(250)
            except Exception: pass
        gast.goto(url + html + '?raum=' + code.lower(), wait_until='domcontentloaded')
        gast.wait_for_function("Rennspiel.spiel.menue.onlineUi && Rennspiel.spiel.menue.onlineUi.ansicht === 'code'", timeout=120000, polling=200)
        gast.keyboard.press('ShiftLeft')
        gast.keyboard.press('Enter')
        gast.wait_for_function("Rennspiel.spiel.menue.onlineUi.lobby !== null && Rennspiel.spiel.menue.onlineUi.ansicht === 'lobby'", timeout=900000, polling=200)
        host.wait_for_function("Rennspiel.spiel.menue.onlineUi.lobby.spieler.length === 2", timeout=90000, polling=200)
        got = host.evaluate("Rennspiel.spiel.menue.onlineUi.lobby.einstellungen.streckeId")
        if got != strecke: return False, 'Lobby: Strecke %s statt %s' % (got, strecke), {}
        gast.keyboard.press('Space')
        host.wait_for_function("Rennspiel.spiel.menue.onlineUi.lobby.spieler[1].bereit === true", timeout=90000, polling=200)
        host.keyboard.press('Enter')
        for pg in seiten:
            pg._fl.clear()
            pg.wait_for_function("Rennspiel.spiel.zustand === 'online' && Rennspiel.spiel.online && Rennspiel.spiel.online.empfangen", timeout=180000, polling=250)
        # Countdown abwarten
        t0 = time.time(); lauf = False
        while time.time() - t0 < 120:
            sts = [pg.evaluate(ON_STATUS) for pg in seiten]
            for pg, st in zip(seiten, sts):
                f = alle_fehler(pg, st)
                if f: return False, 'Fehler im Countdown (%s): %s' % ('Host' if pg is host else 'Gast', ' | '.join(f[:3])), {}
            if all(st['rz'] == 'laeuft' for st in sts): lauf = True; break
            host.wait_for_timeout(500)
        if not lauf:
            zus = []
            for pg in seiten:
                try: zus.append(pg.evaluate("() => { const S = Rennspiel.spiel, o = S.online, u = S.menue && S.menue.onlineUi; return {zustand: S.zustand, phase: o && o.phase, empfangen: !!(o && o.empfangen), rennen: !!S.rennen, rz: S.rennen && S.rennen.zustand, cd: S.rennen && S.rennen.countdown, verb: !!(o && o.verb), hinweis: u && u.hinweis, n: S.fahrzeuge && S.fahrzeuge.length}; }"))
                except Exception as e2: zus.append('Auslesen fehlgeschlagen: %s' % str(e2)[:80])
            try: srv_log.flush(); srv_log.seek(0); slog = srv_log.read()[-500:].replace('\n', ' | ')
            except Exception: slog = ''
            return False, 'Countdown läuft online nicht durch (%s) Zustand Host/Gast=%s Fehler=%s Server=%s Serverlog=%s' % ([st['rz'] for st in sts], zus, [x for pg in seiten for x in pg._fl][:3], 'läuft' if srv.poll() is None else 'BEENDET', slog), {}
        for pg in seiten: pg.evaluate(AUTOPILOT, 'an')
        t1 = time.time(); vmax = [0, 0]
        while time.time() - t1 < sekunden:
            host.wait_for_timeout(1000)
            sts = [pg.evaluate(ON_STATUS) for pg in seiten]
            for k, (pg, st) in enumerate(zip(seiten, sts)):
                vmax[k] = max(vmax[k], abs(st['v'] or 0))
                f = alle_fehler(pg, st)
                if f: return False, 'Fehler beim Fahren (%s): %s' % ('Host' if pg is host else 'Gast', ' | '.join(f[:3])), {}
        if max(vmax) < 3: return False, 'online fährt niemand (max. %.1f m/s)' % max(vmax), {}
        return True, '', {'vmax': [round(x, 1) for x in vmax]}
    except Exception as e:
        import traceback
        fl = [x for pg in seiten for x in pg._fl][:2]
        for pg in seiten:
            try: fl.append(pg.evaluate("() => { const u = Rennspiel.spiel.menue.onlineUi; return u ? 'ansicht=' + u.ansicht + ' hinweis=' + (u.hinweis || '') + ' lobby=' + !!u.lobby + ' fehler=' + (u.fehler || '') : 'keine onlineUi'; }"))
            except Exception: pass
        zeile = [z for z in traceback.format_exc().splitlines() if 'matrix_alle.py' in z][-1:]
        try:
            srv_log.flush(); srv_log.seek(0); slog = srv_log.read()[-400:].replace('\n', ' | ')
        except Exception: slog = ''
        return False, 'Ausnahme: %s %s %s Serverprozess=%s Serverlog=%s' % (str(e)[:250], fl, zeile, 'läuft' if srv.poll() is None else 'BEENDET (%s)' % srv.poll(), slog), {}
    finally:
        for pg in seiten:
            try: pg.context.close()
            except Exception: pass
        srv.terminate()
        try: srv.wait(5)
        except Exception: srv.kill()


# ------------------------------------------------------------------------------------------------ Hauptprogramm
def main():
    ap = argparse.ArgumentParser(description='Matrix-Prüfung Spiel x Strecke x Modus x Grafik')
    ap.add_argument('--spiel', default='beide'); ap.add_argument('--strecke', default='alle'); ap.add_argument('--modus', default='alle')
    ap.add_argument('--grafik', default='alle'); ap.add_argument('--schnell', action='store_true'); ap.add_argument('--sekunden', type=float, default=20)
    ap.add_argument('--startbilder', action='store_true', help='Bild beider Hälften je Strecke (Kamera-Befund)')
    ap.add_argument('--bilder', default='', help='Ordner für Bilder am Ende jeder Kombination')
    ap.add_argument('--json', default='', help='Ergebnis als JSON-Datei')
    a = ap.parse_args()
    spiele = ['auto', 'moto'] if a.spiel == 'beide' else a.spiel.split(',')
    modi = ['solo', 'zwei', 'online'] if a.modus == 'alle' else a.modus.split(',')
    grafiken = GRAFIKEN if a.grafik == 'alle' else a.grafik.split(',')
    if a.schnell:
        if a.strecke == 'alle': a.strecke = ','.join(SCHNELL_STRECKEN)
        if a.grafik == 'alle': grafiken = ['schoen']
        if a.modus == 'alle': modi = ['solo', 'zwei', 'online']
        a.sekunden = min(a.sekunden, 8)
    kamera_ordner = os.path.join(basis, 'tests', 'bilder_startfehler', 'kamera') if a.startbilder else None
    if kamera_ordner: os.makedirs(kamera_ordner, exist_ok=True)
    if a.bilder: os.makedirs(a.bilder, exist_ok=True)
    ergebnisse = []                       # (name, ok, grund)
    T0 = time.time()
    with sync_playwright() as p:
        browser = p.chromium.launch(args=ARGS)
        for spiel in spiele:
            # Strecken ermitteln
            pg = neue_seite(browser, spiel); spiel_laden(pg, spiel)
            katalog = pg.evaluate(JS_STRECKEN)
            ed = pg.evaluate(JS_EDITOR); pg.context.close()
            print('[%s] Katalog: %s | Editor-Strecke: %s' % (spiel, ','.join(katalog), json.dumps(ed)), flush=True)
            alle = list(katalog) + (['stuntpark'] if spiel == 'moto' else []) + (['eigen'] if ed.get('ok') else [])
            if not ed.get('ok'): ergebnisse.append(('%s eigen (Editor-Strecke anlegen)' % spiel, False, 'Editor: %s' % ed.get('text')))
            strecken = alle if a.strecke == 'alle' else [s for s in a.strecke.split(',')]
            off_modi = [m for m in modi if m in ('solo', 'zwei')]
            if off_modi:
                for grafik in grafiken:
                    page = None; zaehler = 0
                    for strecke in strecken:
                        if strecke not in alle: print('  (Strecke %s gibt es im %s-Spiel nicht – übersprungen)' % (strecke, spiel)); continue
                        for modus in off_modi:
                            if page is None or zaehler >= 10:           # Seite regelmäßig erneuern (Speicher der Software-GL)
                                if page is not None: page.context.close()
                                page = neue_seite(browser, spiel); spiel_laden(page, spiel); zaehler = 0
                                ed2 = page.evaluate(JS_EDITOR)
                            sid = strecke
                            if strecke == 'eigen': sid = ed2.get('id') or ed['id']
                            name = '%-4s %-15s %-4s %-6s' % (spiel, strecke, modus, grafik)
                            t = time.time()
                            try:
                                ok, grund, info = offline_kombi(page, spiel, sid, modus, grafik, a.sekunden, zaehler,
                                                                a.bilder or None, kamera_ordner if grafik == grafiken[0] and modus == off_modi[-1] else None)
                            except Exception as e:
                                ok, grund, info = False, 'Ausnahme: ' + str(e)[:250] + ' ' + ' | '.join(page._fl[:2]), {}
                                try: page.context.close()
                                except Exception: pass
                                page = None
                            zaehler += 1
                            print('%s %s  (%.0f s)%s' % ('OK  ' if ok else 'FEHL', name, time.time() - t, '' if ok else '  -> ' + grund), flush=True)
                            if ok and info.get('kamera'):
                                k = info['kamera']
                                if k.get('bogen') and modus == off_modi[-1] and grafik == grafiken[0]:
                                    print('       Kamera: Start %s | Durchfahrt %s' % ([(s['modus'], s['d'], s['anteil']) for s in k['start']], [(d['modus'], d['d']) for d in k['durch']]), flush=True)
                            ergebnisse.append((name.strip(), ok, grund))
                    if page is not None: page.context.close()
            if 'online' in modi:
                onl = [s for s in strecken if s in ONLINE_STRECKEN] if a.strecke != 'alle' or a.schnell is False else ONLINE_STRECKEN
                if a.schnell: onl = [s for s in onl if s == 'unterwasser'][:1] or onl[:1]
                for grafik in grafiken:
                    for strecke in onl:
                        name = '%-4s %-15s %-6s %-6s' % (spiel, strecke, 'online', grafik)
                        t = time.time()
                        ok, grund, info = online_kombi(browser, spiel, strecke, grafik, a.sekunden)
                        print('%s %s  (%.0f s)%s' % ('OK  ' if ok else 'FEHL', name, time.time() - t, '' if ok else '  -> ' + grund), flush=True)
                        ergebnisse.append((name.strip(), ok, grund))
        browser.close()
    n_ok = sum(1 for e in ergebnisse if e[1]); n_f = len(ergebnisse) - n_ok
    print('\n==== ZUSAMMENFASSUNG: %d Kombinationen, %d OK, %d FEHL (%.0f Min) ====' % (len(ergebnisse), n_ok, n_f, (time.time() - T0) / 60))
    for n, ok, g in ergebnisse:
        if not ok: print('  FEHL %s: %s' % (n, g))
    if a.json:
        with open(a.json, 'w') as f: json.dump([{'name': n, 'ok': ok, 'grund': g} for n, ok, g in ergebnisse], f, ensure_ascii=False, indent=1)
    sys.exit(0 if n_f == 0 else 1)


if __name__ == '__main__':
    main()
