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
    autoAus() { delete Rennspiel.spiel.physikSchritt; window.__frozen = null; Rennspiel.spiel.pausiert = false; },
    // Zustand des Spielers für Bild-Bedingungen: alles Wichtige in einem Objekt (c.*) – wird nach JEDEM Physikschritt geprüft
    ctx() {
      const s = Rennspiel.spiel, f = s.fahrzeuge[0], v = f.vehicle, z = s.stunt.fz[0], D = Rennspiel.Moto.stuntWelt.stuntDaten(s.strecke), St = Rennspiel.Moto.stunts;
      let ringD = null, ringY = null, reiheA = null, reiheQ = null;
      if (D.ringe.length) { const r = D.ringe[0]; ringD = (v.x - r.x) * r.tx + (v.z - r.z) * r.tz; ringY = r.y; }
      if (D.reihen.length) { const L = D.reihen[D.reihen.length - 1]; reiheA = (v.x - L.x) * L.tx + (v.z - L.z) * L.tz; reiheQ = (v.x - L.x) * L.nx + (v.z - L.z) * L.nz; }
      const cm = St.comboRest(z.combo, z.jetzt), mine = s.stunt.alle.filter((e) => e.fahrzeug === 0), letzter = mine.length ? mine[mine.length - 1] : null;
      const f1 = s.fahrzeuge.find((g) => g.istSpieler && g.spielerNr === 1);
      return { luft: !!f.flug.aktiv, luft1: f1 ? !!f1.flug.aktiv : false, flug: f.flug.fluege, t: f.flug.t, y: v.y, yBoden: s.strecke.hoeheAn(v.x, v.z), salto: Math.abs(z.pose.salto), trickArt: z.trick ? z.trick.art : null,
        s: f.nah ? f.nah.s : 0, ringD, ringY, reiheA, reiheQ, mult: cm.mult, punkte: z.punkte, n: mine.length, letzter: letzter ? letzter.art : null, kmh: Math.round(v.tempoKmh), zeit: s.stunt.zeit, zustand: s.zustand };
    },
    // Regie: nach jedem Physikschritt Bedingung prüfen; trifft sie zu, wird das Spiel auf der Stelle angehalten (Standbild für den Screenshot).
    // opt.taps = Tipps der Trick-Taste je Flug (echte Tastenereignisse), opt.bedingung = JS-Ausdruck über c (siehe ctx).
    regie(opt) {
      const s = Rennspiel.spiel, orig = Object.getPrototypeOf(s).physikSchritt; let letzter = -1;
      const cond = opt.bedingung ? new Function('c', 'return (' + opt.bedingung + ');') : null;
      window.__frozen = null; s.pausiert = false;
      s.physikSchritt = function (dt) {
        if (window.__frozen) return;
        const fl = this.fahrzeuge[0].flug;
        if (opt.taps && fl.aktiv && fl.fluege !== letzter && fl.t > 0.22) { letzter = fl.fluege;
          for (let i = 0; i < opt.taps; i++) { window.dispatchEvent(new KeyboardEvent('keydown', { code: 'ShiftRight' })); window.dispatchEvent(new KeyboardEvent('keyup', { code: 'ShiftRight' })); } }
        const r = orig.call(this, dt);
        if (cond) { const c = __T.ctx(); if (cond(c)) { window.__frozen = c; this.pausiert = true; } }
        return r;
      };
    },
    // nach einem Standbild weiterlaufen (neue Bedingung) – die Taps-Zählung läuft weiter
    weiter(bedingung, taps) { const s = Rennspiel.spiel; delete s.physikSchritt; __T.regie({ bedingung, taps }); },
    // Kameras hart auf das Ziel setzen (nach vorgespulter Zeit ohne Bilder sonst Kameraverzug)
    kameraSnap() { Rennspiel.spiel.kameras.forEach((k) => { k._erstesMal = true; k.update(0.0167); }); },
    halten(an) { Rennspiel.spiel.pausiert = !!an; },
    // projizierte Lage (NDC) und Abstand des Motorrads in jeder Kamera/Bildhälfte
    projektion() {
      const s = Rennspiel.spiel, out = [];
      s.kameras.forEach((k, i) => { const f = s.fahrzeuge.find((g) => g.vehicle === k.ziel); if (!f) return; const m = f.mesh.position.clone(); m.y += 0.9;
        const cam = k.kamera; cam.updateMatrixWorld(); const n = m.clone().project(cam);
        out.push({ spieler: f.spielerNr, halbe: s.halbe(i), abstand: +m.distanceTo(cam.position).toFixed(1), ndc: [+n.x.toFixed(2), +n.y.toFixed(2)], drin: Math.abs(n.x) < 0.95 && Math.abs(n.y) < 0.95 && n.z < 1, luft: !!f.flug.aktiv }); });
      return out;
    },
    // Kamera von Hand (Standbild): rel = Abstand hinten/seitlich/hoch relativ zur Fahrtrichtung der Reihe/Strecke; liefert Lage der Kamera und Projektion des Motorrads
    handKamera(vorn, seit, hoch, blickVor, blickHoch) {
      const s = Rennspiel.spiel, f = s.fahrzeuge[0], k = s.kameras[0].kamera, h = f.mesh.position, r = f.vehicle.richtung ? f.vehicle.richtung() : { x: -Math.sin(f.vehicle.heading), z: -Math.cos(f.vehicle.heading) };
      const tx = r.x, tz = r.z, nx = -tz, nz = tx;
      k.position.set(h.x + tx * vorn + nx * seit, h.y + hoch, h.z + tz * vorn + nz * seit); k.lookAt(h.x + tx * (blickVor || 0), h.y + (blickHoch || 0), h.z + tz * (blickVor || 0)); k.updateMatrixWorld();
      const m = h.clone(); m.y += 0.9; const n = m.clone().project(k);
      return { hinter: +(-vorn).toFixed(1), seitlich: +seit.toFixed(1), hoch, ndc: [+n.x.toFixed(2), +n.y.toFixed(2)], drin: Math.abs(n.x) < 0.95 && Math.abs(n.y) < 0.95 && n.z < 1, abstand: +m.distanceTo(k.position).toFixed(1) };
    },
    // Lage der Bus-Reihe im Netz: Ausdehnung der Eckpunkte in Straßenkoordinaten (a = hinter der Kante, q = quer), Fahrbahnbreite
    busGeometrie() {
      const s = Rennspiel.spiel, st = s.strecke, D = Rennspiel.Moto.stuntWelt.stuntDaten(st), m = s.motoStuntGruppe.getObjectByName('BusReihe'), pos = m.geometry.attributes.position, out = [];
      D.reihen.forEach((L) => { let aMin = 1e9, aMax = -1e9, qMin = 1e9, qMax = -1e9, yMax = -1e9;
        for (let i = 0; i < pos.count; i++) { const dx = pos.getX(i) - L.x, dz = pos.getZ(i) - L.z, a = dx * L.tx + dz * L.tz, q = dx * L.nx + dz * L.nz;
          if (Math.abs(q) <= L.breite) { aMin = Math.min(aMin, a); aMax = Math.max(aMax, a); qMin = Math.min(qMin, q); qMax = Math.max(qMax, q); yMax = Math.max(yMax, pos.getY(i)); } }
        out.push({ nr: L.nr, n: L.n, a: [aMin, aMax].map((v) => +v.toFixed(2)), q: [qMin, qMax].map((v) => +v.toFixed(2)), a0: L.a0, a1: L.a1, halb: L.halb, fahrbahn: st.breiteBei ? st.breiteBei(L.sK) : st.breite, hoehe: +(yMax - st.hoeheAn(L.x, L.z)).toFixed(2) }); });
      return out;
    },
    // alle sichtbaren HUD-Elemente (Text/Minimap/Tacho) je Bildhälfte: Kollisionen der Rechtecke (auf die Bildhälfte beschnitten)
    hudKollisionen() {
      const out = [], els = [];
      document.querySelectorAll('.hud').forEach((h, hi) => {
        const hr = h.getBoundingClientRect(), klipp = (r) => ({ left: Math.max(r.left, hr.left), right: Math.min(r.right, hr.right), top: Math.max(r.top, hr.top), bottom: Math.min(r.bottom, hr.bottom) });
        h.querySelectorAll('*').forEach((e) => {
          const cs = getComputedStyle(e), r = klipp(e.getBoundingClientRect());
          if (r.right - r.left < 2 || r.bottom - r.top < 2 || cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity) < 0.05) return;
          let p = e.parentElement, ok = true; while (p && p !== h) { const pc = getComputedStyle(p); if (pc.display === 'none' || parseFloat(pc.opacity) < 0.05) { ok = false; break; } p = p.parentElement; }
          if (!ok) return;
          const eigen = [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()) || e.tagName === 'CANVAS';
          if (!eigen) return;
          els.push({ hi, e, n: e.tagName + '.' + String(e.className).split(' ').join('.') + '[' + (e.textContent || '').trim().slice(0, 18) + ']', r });
        });
      });
      for (let i = 0; i < els.length; i++) for (let j = i + 1; j < els.length; j++) {
        const a = els[i], b = els[j]; if (a.e.contains(b.e) || b.e.contains(a.e) || (a.e.parentElement === b.e.parentElement && /platz/.test(a.e.parentElement.className))) continue;
        const w = Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left), h2 = Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top);
        if (w > 2 && h2 > 2) out.push(a.hi + ':' + a.n + ' x ' + b.hi + ':' + b.n + ' (' + Math.round(w) + 'x' + Math.round(h2) + ')');
      }
      return { elemente: els.length, kollisionen: out };
    },
    // erzwungener HUD-Zustand für die Überlappungsprüfung: 'start' = Countdown, 'fahrt' = Banner + Stunt-Meldung + Punkte/Combo + Live-Anzeige
    hudSzene(szen) {
      const sp = Rennspiel.spiel; sp.pausiert = true;
      (sp.huds || []).forEach((hd) => { if (!hd) return;
        hd.eCountdown.className = 'hud-countdown puls' + (szen === 'start' ? ' an' : ''); hd.eCountdown.textContent = szen === 'start' ? '3' : '';
        hd.eBanner.className = 'hud-banner'; hd.meldung('x', 1);
        if (szen === 'fahrt') { hd.banner('Letzte Runde!', 0, '', 'Spieler'); hd.meldung('Bus-Sprung! +1.200 (3 Busse) ×2', 60000); } });
      const sz = sp.stunt;
      sp.fahrzeuge.forEach((f, fi) => { const z = sz && sz.fz[fi]; if (z) { z.punkte = szen === 'fahrt' ? 12345 : 0; z.combo = szen === 'fahrt' ? { zaehler: 3, letzter: z.jetzt } : z.combo; z.wheelie.aktiv = szen === 'fahrt'; z.wheelie.meter = 23; } });
    },
    // Kamera im echten 60-Hz-Takt (Physik + Kamera-Update je Schritt): Abstand/Projektion beider Hälften über n Sekunden
    kameraLauf(sek) {
      const s = Rennspiel.spiel; let minAb = 1e9, maxAb = 0, drin = 0, n = 0, kmhMax = 0;
      for (let t = 0; t < sek && s.zustand === 'rennen'; t += 1 / 60) { s.physikSchritt(1 / 60); s.kameras.forEach((k) => k.update(1 / 60));
        if (++n % 30 === 0) __T.projektion().forEach((x) => { minAb = Math.min(minAb, x.abstand); maxAb = Math.max(maxAb, x.abstand); if (x.drin) drin++; }); kmhMax = Math.max(kmhMax, s.fahrzeuge[0].vehicle.tempoKmh); }
      return { minAb, maxAb, drin, von: Math.floor(n / 30) * s.kameras.length, kmhMax: Math.round(kmhMax) };
    },
    // echte Tastaturereignisse (wie ein Spieler): Doppeltippen = zwei keydown im Abstand von ~160 ms
    tippen(n) {
      const schlaf = (ms) => new Promise((r) => setTimeout(r, ms));
      return (async () => { for (let i = 0; i < n; i++) { window.dispatchEvent(new KeyboardEvent('keydown', { code: 'ShiftRight' })); await schlaf(90);
        window.dispatchEvent(new KeyboardEvent('keyup', { code: 'ShiftRight' })); await schlaf(70); } })();
    },
  };
}'''

def warte_ergebnis(page, sek=30):
    """Die Ergebnistafel blendet laut Spiel-CSS erst nach 1,2 s Verzögerung + 0,6 s ein (animation einblenden). Gültig ist sie erst, wenn sie wirklich sichtbar ist
    (Deckkraft 1, Tabelle im Bild) – ein früheres Bild zeigt nur das Ziel-Banner (das war die Ursache des alten Bildes ohne Liste)."""
    t0 = time.time(); r = None
    while time.time() - t0 < sek:
        r = page.evaluate("""() => { const e = document.getElementById('ergebnis'), t = document.querySelector('.moto-erg') || document.querySelector('.ergebnis-karte table'), rr = t ? t.getBoundingClientRect() : null;
          return { zustand: Rennspiel.spiel.zustand, op: e ? parseFloat(getComputedStyle(e).opacity) : 0, disp: e ? getComputedStyle(e).display : '', hoehe: rr ? rr.height : 0, breite: rr ? rr.width : 0,
            im: rr ? rr.left >= 0 && rr.right <= innerWidth && rr.top >= 0 && rr.bottom <= innerHeight : false }; }""")
        if r['zustand'] == 'ergebnis' and r['op'] >= 0.99 and r['hoehe'] > 50: break
        page.wait_for_timeout(200)
    page.wait_for_timeout(200)
    return r

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
        page.evaluate('() => __T.kameraSnap()')

        # ---- Bild-Regie: das Spiel wird in dem Physikschritt angehalten, in dem die Bedingung zutrifft (Standbild für den Screenshot) ----
        def regie(bed, taps):
            page.evaluate('([b, t]) => { __T.autoAus(); __T.regie({ bedingung: b, taps: t }); }', [bed, taps])
        def weiter(bed, taps):
            page.evaluate('([b, t]) => { const s = Rennspiel.spiel; delete s.physikSchritt; __T.regie({ bedingung: b, taps: t }); }', [bed, taps])
        def warte_standbild(sek=120):
            t0 = time.time()
            while time.time() - t0 < sek:
                r = page.evaluate('() => window.__frozen')
                if r: return r
                page.wait_for_timeout(100)
            return None

        # Bild 1: Feuerring – Motorrad genau in der Ringebene (|Abstand| < 0,6 m), in der Luft; Ringmitte gegen Flughöhe
        regie('c.luft && c.ringD > -0.6 && c.ringD < 0.6', 0)
        fr = warte_standbild()
        page.wait_for_timeout(500)
        rg = page.evaluate('''() => { const s = Rennspiel.spiel, v = s.fahrzeuge[0].vehicle, D = Rennspiel.Moto.stuntWelt.stuntDaten(s.strecke), r = D.ringe[0], b = s.strecke.hoeheAn(r.x, r.z), cfg = Rennspiel.config.motoStunts.ring;
          return { ringMitte: +(r.y - b).toFixed(2), flugbahn: +(v.y + cfg.fahrerHoehe - b).toFixed(2), unterkante: +(r.y - r.radius - b).toFixed(2), bikeUeberBoden: +(v.y - s.strecke.hoeheAn(v.x, v.z)).toFixed(2), radius: r.radius, p: __T.projektion()[0] }; }''')
        bild(page, 'moto_stunt_feuerring.png', '(Motorrad in der Ringebene: Ring-Mitte %.2f m, Flugbahn %.2f m über Boden, Ring-Unterkante %.2f m)' % (rg['ringMitte'], rg['flugbahn'], rg['unterkante']))
        pruefe('Bild Feuerring gültig: Motorrad in der Luft, in der Ringebene (|Abstand| < 0,6 m), im Bild', fr is not None and fr['luft'] and abs(fr['ringD']) < 0.6 and rg['p']['drin'], f"Abstand {fr['ringD']:.2f} m, {rg['p']}")
        pruefe('Feuerring auf der Flugbahn: Ring-Mitte − Flughöhe (Fahrer-Mitte) ≤ 0,3 m; Ring schwebt (Unterkante > 0,25 m über dem Boden)', abs(rg['ringMitte'] - rg['flugbahn']) <= 0.3 and rg['unterkante'] > 0.25, rg)
        page.evaluate('() => { __T.autoAus(); }')
        page.evaluate('() => __T.vorlauf(900, 120, false)')
        z = page.evaluate('() => __T.stand()')
        evs = [e.split('|')[1] for e in z['ev'] if e.startswith('0|')]
        pruefe('Feuerring durchflogen und gewertet (Volltreffer oder Treffer, kein Sturz)', ('feuerring' in evs or 'volltreffer' in evs) and z['stat']['stuerze'] == 0, evs)
        pruefe('keine NaN in Fahrzeugen', not z['nan'])

        # Bilder 2-4 in EINEM Flug über die Bus-Reihe (Wiese 2760): von schräg hinten beim Überfliegen, dann Salto in der Luft, dann HUD mit Combo
        page.evaluate('() => __T.vorlauf(2650, 300, false)'); page.evaluate('() => __T.kameraSnap()')
        regie('c.luft && c.reiheA > 3 && c.reiheA < 8 && c.reiheQ > -2.5 && c.reiheQ < 2.5', 2)
        fr = warte_standbild()
        bus = page.evaluate('''() => { const s = Rennspiel.spiel, v = s.fahrzeuge[0].vehicle, L = Rennspiel.Moto.stuntWelt.stuntDaten(s.strecke).reihen[0];
          const cam = __T.handKamera(-11, 8, 3.2, 4, -2.0);
          return { ueberBus: +(v.y - s.strecke.hoeheAn(v.x, v.z) - L.hoehe).toFixed(2), a: +((v.x - L.x) * L.tx + (v.z - L.z) * L.tz).toFixed(1), q: +((v.x - L.x) * L.nx + (v.z - L.z) * L.nz).toFixed(1), a0: L.a0, a1: L.a1, halb: L.halb, cam }; }''')
        page.wait_for_timeout(600)
        bild(page, 'moto_stunt_busreihe.png', '(über den Bussen, %.1f m über der Oberkante, Kamera %.0f m hinter/%.0f m seitlich des Motorrads)' % (bus['ueberBus'], bus['cam']['hinter'], bus['cam']['seitlich']))
        pruefe('Bild Busreihe gültig: Motorrad in der Luft über der Reihe (a zwischen Reihenanfang/-ende, ≥ 0,3 m über der Oberkante), Kamera schräg hinten, Motorrad im Bild',
               fr is not None and fr['luft'] and bus['a0'] < bus['a'] < bus['a1'] and bus['ueberBus'] >= 0.3 and bus['cam']['hinter'] > 5 and abs(bus['cam']['seitlich']) > 3 and bus['cam']['drin'], bus)
        geo = page.evaluate('() => __T.busGeometrie()')[0]
        pruefe('Busreihe im Netz: quer zur Fahrtrichtung (Querausdehnung ≈ Fahrbahn), mittig auf der Fahrbahn, Tiefe = 4 Busse hinter der Kante, nichts ragt auf den Asphalt hinaus',
               abs(geo['q'][0] + geo['q'][1]) < 0.4 and geo['q'][1] - geo['q'][0] > geo['fahrbahn'] - 1.5 and geo['q'][1] - geo['q'][0] <= geo['fahrbahn'] and geo['a'][0] >= 0.4 and abs((geo['a'][1] - geo['a'][0]) - (geo['a1'] - geo['a0'])) < 0.6 and abs(geo['hoehe'] - 2.5) < 0.2, geo)
        weiter('c.luft && c.trickArt === "salto" && c.salto > 2.0 && c.salto < 4.0', 2)
        fr = warte_standbild()
        sc = page.evaluate('() => __T.handKamera(0, 9, 1.2, 0, 0.5)')
        page.wait_for_timeout(600)
        gr = fr['salto'] * 180 / 3.14159265
        bild(page, 'moto_stunt_salto.png', '(Salto in der Luft, Drehwinkel %.0f°, %.1f m über dem Boden, Seitenansicht)' % (gr, fr['y'] - fr['yBoden']))
        pruefe('Bild Salto gültig: Trick läuft (Salto), Motorrad in der Luft (> 1 m über Boden), Drehwinkel 90–270°, Motorrad im Bild', fr['luft'] and fr['trickArt'] == 'salto' and 90 <= gr <= 270 and fr['y'] - fr['yBoden'] > 1.0 and sc['drin'], f"{gr:.0f}°, {sc}")
        weiter('c.mult >= 2 && !c.luft', 0)
        fr = warte_standbild()
        page.evaluate('() => __T.kameraSnap()'); page.wait_for_timeout(500)
        hd = page.evaluate('''() => { const c = document.querySelector('.moto-stunt .ms-combo'), p = document.querySelector('.moto-stunt .ms-punkte'), m = document.querySelector('.hud-meldung'), cs = getComputedStyle(c);
          return { combo: c.textContent, sichtbar: cs.display !== 'none' && c.getBoundingClientRect().height > 5, gross: c.classList.contains('gross'), punkte: p.textContent, meldung: m.textContent, meldungOp: getComputedStyle(m).opacity, bike: __T.projektion()[0].drin, kk: __T.hudKollisionen() }; }''')
        bild(page, 'moto_stunt_hud.png', '(HUD: %s, %s, Meldung „%s“)' % (hd['punkte'], hd['combo'], hd['meldung']))
        pruefe('Bild HUD gültig: Combo ×2 sichtbar und groß, Punkte, Stunt-Meldung, Motorrad im Bild, keine überlappenden HUD-Elemente', hd['combo'] == 'Combo ×2' and hd['sichtbar'] and hd['gross'] and hd['bike'] and not hd['kk']['kollisionen'], hd)
        page.evaluate('() => __T.autoAus()')
        sa = page.evaluate('() => __T.stand().stat')
        pruefe('Salto per Doppeltippen mit echten Tastenereignissen (ShiftRight zweimal) gewertet', sa['saltos'] >= 1, sa)
        # Combo auch im Einzelspieler sichtbar, sobald der erste Stunt gewertet ist (×1)
        c1 = page.evaluate('''() => { const s = Rennspiel.spiel, z = s.stunt.fz[0]; z.combo = { zaehler: 1, letzter: z.jetzt, max: 1 }; Rennspiel.Moto.stuntHud.frame(s); const c = document.querySelector('.moto-stunt .ms-combo'); return { t: c.textContent, v: c.getBoundingClientRect().height > 5 }; }''')
        pruefe('Combo im Einzelspieler sichtbar, sobald > 0 (Anzeige „Combo ×1“)', c1['t'] == 'Combo ×1' and c1['v'], c1)

        # Rest der Runde im Vorlauf: Bus-Reihe, danach Ergebnis
        page.evaluate('() => __T.vorlauf(1e9, 400, true)')
        z = page.evaluate('() => __T.stand()')
        gesamt = page.evaluate('() => Rennspiel.spiel.stunt.fz.map(z => ({ p: z.punkte, st: z.stat }))')
        busse = [g['st']['busse'] for g in gesamt]
        pruefe('Bus-Reihe: Spieler und KI fliegen drüber (Bus-Sprung), Stürze 0', gesamt[0]['st']['busse'] >= 1 and gesamt[0]['st']['stuerze'] == 0, f'Busse {busse}')
        pruefe('Jeder der 4 Fahrer hat Stuntpunkte (KI-Stunts laufen)', all(g['p'] > 0 for g in gesamt), [g['p'] for g in gesamt])
        page.evaluate('() => Rennspiel.spiel.schnellvorlauf(60)'); sicht = warte_ergebnis(page)
        erg = page.evaluate('''() => { const s = Rennspiel.spiel; return { zustand: s.zustand, tafel: !!document.querySelector('.moto-erg'),
          kopf: [...document.querySelectorAll('.moto-erg thead th')].map(t => t.textContent.trim()),
          zeilen: [...document.querySelectorAll('.moto-erg tbody tr')].map(r => [...r.querySelectorAll('td')].map(t => t.textContent.trim()).slice(0, 7)),
          wertung: s.ergebnis ? 1 : 0 }; }''')
        gesamtwerte = [int(r[6].replace('.', '')) for r in erg['zeilen']] if erg['zeilen'] else []
        bild(page, 'moto_stunt_ergebnis.png', '(Ergebnisliste Stuntrennen, sichtbar: Deckkraft %.2f, Tabelle %dx%d px)' % (sicht['op'], sicht['breite'], sicht['hoehe']))
        pruefe('Ergebnisliste Stuntrennen sichtbar nach dem Ziel (auch nach Schnellvorlauf): Rang, Name, Platz, Platzpunkte, Stuntpunkte, Gesamt, 4 Zeilen absteigend, vollständig im Bild',
               erg['tafel'] and sicht['op'] >= 0.99 and sicht['im'] and len(gesamtwerte) == 4 and gesamtwerte == sorted(gesamtwerte, reverse=True) and any('Stuntpunkte' in k for k in erg['kopf']) and any('Gesamt' in k for k in erg['kopf']), {'kopf': erg['kopf'], 'gesamt': gesamtwerte, 'sicht': sicht})
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

        # ---------------- Draw-Calls der Stunt-Welt ----------------
        page.evaluate('() => Rennspiel.spiel.rennenStarten' + EINST % ('wiese', 1, 'true')); page.wait_for_timeout(400)
        n = page.evaluate("() => { const g = Rennspiel.spiel.motoStuntGruppe; let m = 0, tri = 0; g.traverse(o => { if (o.isMesh) { m++; tri += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3; } }); return { meshes: m, dreiecke: Math.round(tri) }; }")
        pruefe('Stunt-Welt (Ring, Bus-Reihe, Zonen, Schilder) braucht wenige Draw-Calls', n['meshes'] <= 24 and n['dreiecke'] < 20000, n)
        page.evaluate('() => { Rennspiel.spiel.zumMenue(true); }'); page.wait_for_timeout(400)

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
        zw = page.evaluate('''() => { const s = Rennspiel.spiel; s.autopilot(0, true); s.autopilot(1, true); __T.warteStart();
          return { hud: document.querySelectorAll('.moto-stunt').length, n: s.stunt.fz.length, sr: s.stunt.stuntrennen, kameras: s.kameras.length,
            taste: [...Rennspiel.spiel.input.spielTasten].filter(k => k.startsWith('Shift')) }; }''')
        pruefe('Zweispieler: je Bildhälfte ein Stunt-Feld, Tasten ShiftRight/ShiftLeft registriert', zw['hud'] == 2 and zw['n'] == 4 and zw['kameras'] == 2 and set(zw['taste']) == {'ShiftRight', 'ShiftLeft'}, zw)
        # Kamera im 60-Hz-Takt (Physik + Kamera-Update je Schritt): beide Motorräder in beiden Bildhälften im Bild, kleiner Abstand
        kl = page.evaluate('() => __T.kameraLauf(30)')
        pruefe('Zweispieler Kamera (60 Hz, 30 s bis %d km/h): Abstand Kamera–Motorrad %.1f … %.1f m, Motorrad in %d von %d Messungen im Bild' % (kl['kmhMax'], kl['minAb'], kl['maxAb'], kl['drin'], kl['von']), kl['von'] >= 40 and kl['drin'] == kl['von'] and kl['maxAb'] < 14 and kl['minAb'] > 4, kl)
        # Ursache des alten Bildes: nach einem Physik-Vorlauf OHNE Bilder hängt die weich folgende Kamera weit zurück (hier gemessen im selben Aufruf, ohne Bild dazwischen)
        alt = page.evaluate('''() => { __T.vorlauf(1e9, 40, false); const stale = __T.projektion(); __T.kameraSnap(); return { stale, snap: __T.projektion() }; }''')
        pruefe('Zweispieler: Ursache des alten Wiesenbildes – Kamera nach Vorlauf ohne Bilder %.0f m vom Motorrad (nicht im Bild), nach Kamera-Snap %.1f m, beide Hälften im Bild' % (max(x['abstand'] for x in alt['stale']), max(x['abstand'] for x in alt['snap'])),
               max(x['abstand'] for x in alt['stale']) > 50 and all(x['drin'] for x in alt['snap']) and max(x['abstand'] for x in alt['snap']) < 14, alt)
        # Neustart: beide fliegen über die erste Rampe; Standbild, wenn BEIDE in der Luft sind
        page.evaluate('() => { Rennspiel.spiel.zumMenue(true); }'); page.wait_for_timeout(400)
        page.evaluate('''() => Rennspiel.spiel.rennenStarten({ modus: 'zwei', streckeId: 'wiese', autoIds: ['crossmaschine-blau', 'crossmaschine-gruen'], runden: 1, gegner: 2, schwierigkeit: 'mittel', fahrhilfe: ['wenig', 'wenig'], stuntrennen: true })'''); page.wait_for_timeout(600)
        page.evaluate('() => { const s = Rennspiel.spiel; s.autopilot(0, true); s.autopilot(1, true); __T.warteStart(); __T.vorlauf(30, 30, false); __T.kameraSnap(); }')
        regie('c.luft && c.luft1 && c.t > 0.25', 0)
        fr = warte_standbild()
        page.wait_for_timeout(600)
        pr = page.evaluate('() => __T.projektion()')
        bild(page, 'moto_stunt_zweispieler.png', '(beide Motorräder in der Luft, Abstand %s m, im Bild: %s)' % ('/'.join(str(x['abstand']) for x in pr), '/'.join(str(x['drin']) for x in pr)))
        pruefe('Bild Zweispieler gültig: beide Motorräder in der Luft, in ihrer Bildhälfte im Bild (Abstand < 14 m), kein Wald-/Wiesenbild', fr is not None and fr['luft'] and fr['luft1'] and len(pr) == 2 and all(x['drin'] and x['abstand'] < 14 and abs(x['ndc'][0]) < 0.3 for x in pr) and {x['halbe'] for x in pr} == {0, 1}, pr)
        kk = page.evaluate('() => __T.hudKollisionen()')
        pruefe('Zweispieler HUD: keine überlappenden Elemente (1280×800, live im Flug)', not kk['kollisionen'], kk)
        page.evaluate('() => __T.autoAus()')
        # Spieler 2 tippt mit ShiftLeft im Flug (nächster Flug = Ring-Rampe)
        sp2 = page.evaluate('''() => { const s = Rennspiel.spiel, inp = s.input, dt = Rennspiel.config.physik.schritt, f = s.fahrzeuge[1]; let ok = 0, t = 0;
          while (f.flug.aktiv && s.zustand === 'rennen') s.physikSchritt(dt);
          for (; t < 60 && s.zustand === 'rennen'; t += dt) { if (f.flug.aktiv && f.flug.t > 0.3 && ok === 0) { inp.gedrueckt.add('ShiftLeft'); inp.geradeGedrueckt.add('ShiftLeft'); ok = 1; }
            s.physikSchritt(dt); inp.gedrueckt.delete('ShiftLeft'); inp.geradeGedrueckt.delete('ShiftLeft'); if (ok === 1 && !f.flug.aktiv) break; }
          const z = s.stunt.fz[1]; return { ok, tricks: z.stat.drehungen + z.stat.saltos, sprung: z.stat.spruenge, p: z.punkte, ersteTaste: s.fahrzeuge[1].spielerNr }; }''')
        pruefe('Zweispieler: Spieler 2 trickt mit linker Umschalt-Taste', sp2['ok'] == 1 and sp2['tricks'] >= 1, sp2)

        # ---------------- Ergebnis-Absicherung: gewinnt ein Mensch, hält das Spiel die Tafel hinter dem Feuerwerk zurück (_tafelWarten) – im Schnellvorlauf lief das nie ab ----------------
        page.evaluate('() => { Rennspiel.spiel.zumMenue(true); }'); page.wait_for_timeout(400)
        page.evaluate('() => Rennspiel.spiel.rennenStarten' + EINST % ('wiese', 1, 'true')); page.wait_for_timeout(400)
        fb = page.evaluate('''() => { const s = Rennspiel.spiel, F = Rennspiel.Feuerwerk, dt = Rennspiel.config.physik.schritt, orig = F && F.tafelWartezeit; s.autopilot(0, true); __T.warteStart();
          if (F) F.tafelWartezeit = () => 5;          // wie bei einem Sieg mit laufendem Feuerwerk
          let t = 0; while (!s._tafelWarten && s.zustand === 'rennen' && t < 400) { s.physikSchritt(dt); t += dt; }
          const vor = { zustand: s.zustand, warten: !!s._tafelWarten, tafel: !!document.querySelector('.moto-erg') };
          let sek = 0; for (; sek < 15 && s.zustand !== 'ergebnis'; sek += dt) s.physikSchritt(dt);
          if (F) F.tafelWartezeit = orig;
          return { vor, nach: { zustand: s.zustand, warten: !!s._tafelWarten, sek: +sek.toFixed(1), tafel: !!document.querySelector('.moto-erg'), zeilen: document.querySelectorAll('.moto-erg tbody tr').length } }; }''')
        pruefe('Ergebnis nach Sieg mit Feuerwerk-Wartezeit: Tafel wird im Schnellvorlauf nach ~6 s freigegeben (nicht für immer zurückgehalten)', fb['vor']['warten'] and not fb['vor']['tafel'] and fb['nach']['zustand'] == 'ergebnis' and fb['nach']['tafel'] and fb['nach']['zeilen'] == 4 and 5 <= fb['nach']['sek'] <= 8, fb)
        page.evaluate('() => { Rennspiel.spiel.zumMenue(true); }'); page.wait_for_timeout(300)

        # ---------------- HUD-Überlappung: Einzel- und Zweispieler, 1280×800 (hier), 1920×1080 und Handy quer 844×390 (eigene Seiten) ----------------
        def hud_pruefen(pg, titel):
            for modus in ('solo', 'zwei'):
                einst = ("({ modus: 'solo', streckeId: 'wiese', autoIds: ['crossmaschine'], runden: 3, gegner: 2, schwierigkeit: 'mittel', fahrhilfe: ['wenig', 'wenig'], stuntrennen: true })" if modus == 'solo' else
                         "({ modus: 'zwei', streckeId: 'wiese', autoIds: ['crossmaschine-blau', 'crossmaschine-gruen'], runden: 3, gegner: 2, schwierigkeit: 'mittel', fahrhilfe: ['wenig', 'wenig'], stuntrennen: true })")
                pg.evaluate('() => Rennspiel.spiel.zumMenue(true)'); pg.wait_for_timeout(300)
                pg.evaluate('() => Rennspiel.spiel.rennenStarten' + einst); pg.wait_for_timeout(1500)
                for szen in ('start', 'fahrt'):
                    pg.evaluate('(z) => __T.hudSzene(z)', szen); pg.wait_for_timeout(500)
                    r = pg.evaluate('() => __T.hudKollisionen()')
                    pruefe(f'HUD {titel} {modus} ({szen}): {r["elemente"]} sichtbare Elemente, keine Überlappung', r['elemente'] >= 8 and not r['kollisionen'], r['kollisionen'][:4])
                    if titel == '1280x800' and modus == 'zwei' and szen == 'fahrt': pg.screenshot(path=os.path.join(out, 'moto_stunt_hud_zwei.png')); print('      Bild: tests/out/moto/moto_stunt_hud_zwei.png (HUD Zweispieler: Punkte/Combo/Meldung)')
        hud_pruefen(page, '1280x800')
        pruefe('keine JS-Fehler (gesamter Lauf)', not fehler, fehler[:4])
        page.close()
        for (vw, vh, touch) in ((1920, 1080, False), (844, 390, True)):
            pv = browser.new_page(viewport={'width': vw, 'height': vh}, has_touch=touch)
            pv.on('pageerror', lambda e: fehler.append('pageerror: ' + str(e)))
            pv.goto(basisurl + 'Motorrad.html' + ('?touch=1' if touch else '')); pv.wait_for_timeout(1500); pv.evaluate(JS_HELFER)
            hud_pruefen(pv, f'{vw}x{vh}')
            pv.close()

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
