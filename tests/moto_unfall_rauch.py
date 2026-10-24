#!/usr/bin/env python3
"""Browser-Rauchtest Motorrad-Modus (Stufe M2c „Unfälle“).
Aufruf: python3 tests/moto_unfall_rauch.py
Startet einen lokalen http-Server (Repo-Wurzel), lädt Motorrad.html und prüft:
  - Menü: Zeile „Unfälle“ (Aus / Sanft / Echt), Standard sanft, Klick speichert (Schlüssel mit .motorrad)
  - alle 7 Strecken: genau 1 Werkstatt + 1 Krankenstation in der Szene, nicht am selben Fleck, beschildert (Wegweiser)
  - Tempo-Wirkung beider Zustände (echte Fahrphysik), Qualm unter 75 %
  - Werkstatt/Krankenstation: einfach hineinfahren, das Motorrad bremst selbst, 0,5 s je 10 %, Gas beendet die Pflege ab 30 % (unter 30 % gesperrt)
  - Krankenwagen / Abschleppwagen kommen zum Unfallort und versorgen VOR ORT (1,5 s je 10 %), Zeitlimit-Rückfall auf den Kontrollpunkt
  - KI: vor Ort ab 30 % weiter, an der Station bis 100 % (45 % Tempo beim Vorbeifahren)
  - natürlicher Sturz (Purzelbaum) → Folge deterministisch wie unfall.folge; Modus „aus“ ohne Folgen; Stuntrennen: Punkte unverändert
  - ganzes Rennen mit erzwungenen Stürzen bei allen Fahrern: keine hängende Szene, kein NaN, Ergebnis erreicht
  - HUD ohne Überlappung (1280×800, 1920×1080, 844×390; solo und zu zweit)
  - Autorennen.html: 0 JS-Fehler, lädt keine Moto-Datei
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

JS_HELFER = '''() => {
  const S = () => Rennspiel.spiel, UN = () => Rennspiel.Moto.unfall, DT = 1 / 60;
  // Der Purzelbaum-Zeitablauf läuft im Spiel je BILD (schraeglage.js); bei reinem Vorspulen ohne Bilder wie im Spiel mitzählen
  { const sp = Rennspiel.spiel, proto = Object.getPrototypeOf(sp).physikSchritt;
    sp.physikSchritt = function (dt) { const r = proto.call(this, dt); this.fahrzeuge.forEach((f) => { if (f && f.motoZ) Rennspiel.Moto.schraeglage.purzelSchritt(f.motoZ, dt); }); return r; }; }
  window.__U = {
    // n Physikschritte; stoppt vorher, wenn bed() wahr wird. Rückgabe: vergangene Sekunden
    lauf(sek, bed) { const s = S(); let t = 0; for (; t < sek; t += DT) { if (bed && bed()) break; s.physikSchritt(DT); } return t; },
    warteStart() { const s = S(); let g = 0; while ((s.zustand !== 'rennen' || !s.rennen.gasErlaubt) && g++ < 3000) s.physikSchritt(DT); },
    u(i) { return S().unfall.fz[i || 0]; },
    gas(an) { const inp = S().input; if (an) inp.gedrueckt.add('ArrowUp'); else inp.gedrueckt.delete('ArrowUp'); },
    zustand(i, z, g) { const u = __U.u(i); if (z !== null && z !== undefined) u.zustand = z; if (g !== null && g !== undefined) u.gesundheit = g; },
    // Motorrad i auf die Fläche der Station (art 'werkstatt' | 'kranken') setzen, Tempo v (m/s) in Fahrtrichtung
    aufStation(i, art, v, ds) {
      const s = S(), st = s.motoStationen, w = art === 'werkstatt' ? st.werkstatt : st.kranken, P = w.platz, f = s.fahrzeuge[i || 0], q = (P.qA + P.qB) / 2;
      const uu = __U.u(i || 0); uu.inSt = { werkstatt: false, kranken: false }; uu.halt = null; uu.halteBremse = false;       // wie von außen hineingefahren: die Flanke „hinein“ muss neu entstehen
      const pt = w.welt(P.s - P.laenge / 2 + (ds === undefined ? 5 : ds), q), sp = s.strecke.spline;
      f.vehicle.setzen(pt.x, pt.z, Rennspiel.headingAus(pt.tx, pt.tz)); f.vehicle.vLaengs = v; f.vehicle.y = s.strecke.hoeheAn(pt.x, pt.z, sp.indexBei(pt.s)); f.index = sp.indexBei(pt.s);
      f.vehicle.untergrund = 'strasse';
      const n = sp.naechster(pt.x, pt.z, f.index); f.nah = n;
      return { s: n.s, q: n.seitenabstand, drin: w.istDrin(n) };
    },
    // Motorrad i auf die Strecke bei Bogenlänge s (Mitte), Tempo v
    aufStrecke(i, sB, v, q) {
      const s = S(), sp = s.strecke.spline, p = sp.punktBei(sB), f = s.fahrzeuge[i || 0], qq = q || 0;
      const x = p.x + p.nx * qq, z = p.z + p.nz * qq;
      f.vehicle.setzen(x, z, Rennspiel.headingAus(p.tx, p.tz)); f.vehicle.vLaengs = v; f.vehicle.y = s.strecke.hoeheAn(x, z, sp.indexBei(sB)); f.index = sp.indexBei(sB);
      f.nah = sp.naechster(x, z, f.index);
    },
    // Bogenlänge mitten in der längsten Lücke zwischen Anlauf-/Ring-/Bus-/Zonen-Stellen (kein Sprung in der Nähe)
    sicherS() { const s = S(), st = s.strecke, L = st.spline.laenge, D = Rennspiel.Moto.stuntWelt.stuntDaten(st), p = [];
      Rennspiel.Anlauf.stellen(st).forEach((z) => p.push(z.s)); D.ringe.forEach((r) => p.push(r.sK + 20)); D.reihen.forEach((r) => p.push(r.sK + 10)); D.zonen.forEach((z) => p.push(z.s0, z.s1)); p.push(0);
      p.sort((a, b) => a - b); let best = 0, bs = L / 2; for (let i = 0; i < p.length; i++) { const a = p[i], b = i + 1 < p.length ? p[i + 1] : L; if (b - a > best) { best = b - a; bs = (a + b) / 2; } } return bs; },
    kameraSnap() { S().kameras.forEach((k) => { k._erstesMal = true; k.update(0.0167); }); },
    halten(an) { S().pausiert = !!an; },
    abgeleitet() {
      const s = S(), U = UN(), u = __U.u(0), f = s.fahrzeuge[0], sz = u.szene;
      return { z: Math.round(u.zustand * 10) / 10, g: Math.round(u.gesundheit * 10) / 10, szene: sz ? sz.phase + ':' + (sz.plan ? U.szenePhase(sz.pflege, sz.t).name : '') : null, halt: u.halt ? (u.halt.art + (u.halt.steht ? ':steht' : ':bremst')) : null,
        v: Math.round(f.vehicle.vLaengs * 10) / 10, nan: s.fahrzeuge.some((g) => !isFinite(g.vehicle.x) || !isFinite(g.vehicle.z) || !isFinite(g.mesh.position.x)) };
    },
    // Projektion eines Objekts (Weltkoordinaten) in die Kamera 0: drin = im Bild
    projiziere(x, y, z) { const k = S().kameras[0].kamera; k.updateMatrixWorld(); const n = new THREE.Vector3(x, y, z).project(k); return { ndc: [+n.x.toFixed(2), +n.y.toFixed(2)], drin: Math.abs(n.x) < 0.95 && Math.abs(n.y) < 0.95 && n.z < 1 }; },
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
        const a = els[i], b = els[j]; if (a.e.contains(b.e) || b.e.contains(a.e) || (a.e.parentElement === b.e.parentElement && /platz|moto-zustand/.test(a.e.parentElement.className))) continue;
        const w = Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left), h2 = Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top);
        if (w > 2 && h2 > 2) out.push(a.hi + ':' + a.n + ' x ' + b.hi + ':' + b.n + ' (' + Math.round(w) + 'x' + Math.round(h2) + ')');
      }
      return { elemente: els.length, kollisionen: out };
    },
  };
}'''


# Einblendungen (Text mitten im Bild, Meldung, Banner) dürfen Fahrer und Motorrad nicht verdecken: Bildschirm-Rechteck des Motorrads (acht Eckpunkte der Hüllbox, Fahrer inklusive) gegen die DOM-Rechtecke
EINBLEND = '''() => { const s = Rennspiel.spiel, f = s.fahrzeuge[0], v = f.vehicle, k = s.kameras[0].kamera, cv = document.querySelector('canvas'), cr = cv.getBoundingClientRect(); k.updateMatrixWorld();
  const hd = (s.huds && s.huds[0]) ? s.huds[0].el.getBoundingClientRect() : cr;
  const h = v.heading, fx = -Math.sin(h), fz = -Math.cos(h), lx = -fz, lz = fx; let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9, vorne = true;
  for (const a of [-1.0, 1.0]) for (const b of [-0.5, 0.5]) for (const y of [0, 1.9]) { const P = new THREE.Vector3(v.x + fx * a + lx * b, v.y + y, v.z + fz * a + lz * b).project(k); if (P.z > 1) vorne = false;
    const px = hd.left + (P.x + 1) / 2 * hd.width, py = hd.top + (1 - P.y) / 2 * hd.height; x0 = Math.min(x0, px); x1 = Math.max(x1, px); y0 = Math.min(y0, py); y1 = Math.max(y1, py); }
  const bike = { l: Math.round(x0), t: Math.round(y0), r: Math.round(x1), b: Math.round(y1) }, liste = [];
  document.querySelectorAll('.moto-mitte, .hud-meldung, .hud-banner').forEach((e) => { const cs = getComputedStyle(e), r = e.getBoundingClientRect(), txt = (e.textContent || '').trim();
    if (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity) < 0.05 || r.width < 4 || r.height < 4 || !txt || txt === 'x') return;
    const w = Math.min(r.right, bike.r) - Math.max(r.left, bike.l), hh = Math.min(r.bottom, bike.b) - Math.max(r.top, bike.t);
    liste.push({ n: e.className.split(' ')[0] + '[' + txt.slice(0, 40).replace(/\\n/g, ' ') + ']', r: [Math.round(r.left), Math.round(r.top), Math.round(r.right), Math.round(r.bottom)], ueberlappt: w > 1 && hh > 1 }); });
  return { bike, vorne, imBild: bike.r > 0 && bike.l < hd.right && bike.b > 0 && bike.t < hd.bottom, liste, treffer: liste.filter((e) => e.ueberlappt).map((e) => e.n) }; }'''

# Abstände (m) zwischen den Umrissen von Motorrad (mit Fahrer), Helfer-Figur und Helfer-Fahrzeug in Straßenkoordinaten (längs / quer): Lücke = größere der beiden Achsen-Lücken, < 0 heißt überlappt
ABSTAND = '''() => { const s = Rennspiel.spiel, f = s.fahrzeuge[0], u = __U.u(0), sz = u.szene, n = s.strecke.spline.naechster(f.vehicle.x, f.vehicle.z, f.index), p = s.strecke.spline.punktBei(n.s);
  const tx = p.tx, tz = p.tz, nx = p.nx, nz = p.nz;
  const box = (obj, ausser) => { const b = { a0: 1e9, a1: -1e9, q0: 1e9, q1: -1e9, y0: 1e9, y1: -1e9 }; obj.updateMatrixWorld(true);
    const rein = (o) => { if (o === ausser) return; if (o.isMesh && o.geometry && o.visible !== false) { if (!o.geometry.boundingBox) o.geometry.computeBoundingBox(); const g = o.geometry.boundingBox;
        for (const x of [g.min.x, g.max.x]) for (const y of [g.min.y, g.max.y]) for (const z of [g.min.z, g.max.z]) { const v = new THREE.Vector3(x, y, z).applyMatrix4(o.matrixWorld), dx = v.x - p.x, dz = v.z - p.z, a = dx * tx + dz * tz, q = dx * nx + dz * nz;
          b.a0 = Math.min(b.a0, a); b.a1 = Math.max(b.a1, a); b.q0 = Math.min(b.q0, q); b.q1 = Math.max(b.q1, q); b.y0 = Math.min(b.y0, v.y); b.y1 = Math.max(b.y1, v.y); } }
      o.children.forEach(rein); };
    rein(obj); return b; };
  const luecke = (A, B) => +Math.max(A.a0 - B.a1, B.a0 - A.a1, A.q0 - B.q1, B.q0 - A.q1).toFixed(2);
  const qualm = f.mesh.getObjectByName('Qualm'), bike = box(f.mesh, qualm), figObj = sz && sz.figur && sz.figur.visible ? sz.figur : (u.stFigur && u.stFigur.visible ? u.stFigur : null), fahrz = sz && sz.helfer ? sz.helfer.mesh : null;
  const fig = figObj ? box(figObj) : null, fz = fahrz ? box(fahrz) : null, r2 = (b) => b && { laenge: +(b.a1 - b.a0).toFixed(2), breite: +(b.q1 - b.q0).toFixed(2), hoch: +(b.y1 - b.y0).toFixed(2), a: [+b.a0.toFixed(2), +b.a1.toFixed(2)], q: [+b.q0.toFixed(2), +b.q1.toFixed(2)] };
  return { bike: r2(bike), figur: r2(fig), fahrzeug: r2(fz), figurBike: fig ? luecke(fig, bike) : null, fahrzeugBike: fz ? luecke(fz, bike) : null, figurFahrzeug: fig && fz ? luecke(fig, fz) : null, fahrzeugDavor: fz ? +(fz.a0 - bike.a1).toFixed(2) : null }; }'''

# Prüfung für Werkstatt/Krankenstation im Bild: Gebäude deckend (auch bei naher Kamera), Kamera nicht im Gebäude, Gebäude + Motorrad + Figur im Bild
STATION_PRUEFUNG = '''(art) => { const s = Rennspiel.spiel, w = art === 'werkstatt' ? s.motoStationen.werkstatt : s.motoStationen.kranken, P = w.platz, u = __U.u(0), f = s.fahrzeuge[0], k = s.kameras[0].kamera;
  // Gebäude deckend: nach einem Animationsschritt mit allen Fahrzeugen (die Halle des Autorennens würde sich bei Kameraabstand < 8 m durchsichtig machen)
  // main.js ruft spiel.werkstatt.animieren(t, fahrzeuge, kameras): das ist hier die Schnittstelle (stub) – sie darf die Halle nie ausblenden
  for (let i = 0; i < 20; i++) s.werkstatt.animieren(5 + i / 60, s.fahrzeuge, s.kameras);
  const durchsichtig = []; let meshe = 0;
  w._gruppe.traverse((o) => { if (!o.isMesh || !o.material) return; const ms = Array.isArray(o.material) ? o.material : [o.material]; ms.forEach((m) => { meshe++; if (m.opacity < 0.999 || (m.transparent && m.opacity < 1)) durchsichtig.push((o.name || o.parent && o.parent.name || '?') + ':' + m.opacity.toFixed(2)); }); });
  // Lage der Kamera in Stationskoordinaten (Platz-Werte sind je Seite positiv)
  const n = s.strecke.spline.naechster(k.position.x, k.position.z, f.index), qs = n.seitenabstand * P.seite, ds = s.strecke.spline.differenzS(n.s, P.s);
  const imGebaeude = Math.abs(ds) < P.gebBreite / 2 + 0.5 && qs > P.gebQ - P.gebTiefe / 2 - 0.5 && qs < P.gebQ + P.gebTiefe / 2 + 0.5 && k.position.y < s.strecke.hoeheAn(k.position.x, k.position.z) + (Rennspiel.config.werkstatt.gebaeudeHoehe || 4.4) + 1;
  const proj = (x, y, z) => { k.updateMatrixWorld(); const v = new THREE.Vector3(x, y, z).project(k); return { ndc: [+v.x.toFixed(2), +v.y.toFixed(2)], drin: Math.abs(v.x) < 0.95 && Math.abs(v.y) < 0.95 && v.z < 1 }; };
  const pm = proj(f.vehicle.x, f.vehicle.y + 0.8, f.vehicle.z), g = u.stFigur ? proj(u.stFigur.position.x, u.stFigur.position.y + 0.9, u.stFigur.position.z) : null;
  const mitte = w.welt(P.s, P.qE !== undefined ? P.qE : P.qA), gb = w.welt(P.s, P.gebQ), pg = proj(gb.x, s.strecke.hoeheAn(gb.x, gb.z) + 2, gb.z);
  const e1 = w.welt(P.s - P.gebBreite / 2 + 2, P.gebQ), e2 = w.welt(P.s + P.gebBreite / 2 - 2, P.gebQ), pe1 = proj(e1.x, s.strecke.hoeheAn(e1.x, e1.z) + 2, e1.z), pe2 = proj(e2.x, s.strecke.hoeheAn(e2.x, e2.z) + 2, e2.z);
  return { meshe, durchsichtig: durchsichtig.slice(0, 6), nDurch: durchsichtig.length, imGebaeude, kamAbstand: +Math.hypot(k.position.x - gb.x, k.position.z - gb.z).toFixed(1), motorrad: pm, figur: g, gebaeude: pg, ecken: [pe1, pe2], figurDa: !!(u.stFigur && u.stFigur.visible), figurArt: u.stFigur && u.stFigur.userData.art }; }'''

EINST = "({ modus: '%s', streckeId: '%s', autoIds: ['crossmaschine', 'crossmaschine-rot'], runden: 1, gegner: 3, schwierigkeit: 'mittel', fahrhilfe: ['wenig', 'wenig'], stuntrennen: %s, unfall: '%s' })"

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

        def starte(strecke='wiese', modus='solo', unfall='echt', stunt='false', autopilot=True, warte=True):
            page.evaluate('() => Rennspiel.spiel.rennenStarten' + EINST % (modus, strecke, stunt, unfall)); page.wait_for_timeout(400)
            if autopilot: page.evaluate('() => Rennspiel.spiel.autopilot(0, true)')
            if warte: page.evaluate('() => __U.warteStart()')
        def ev(js, arg=None):
            return page.evaluate(js, arg) if arg is not None else page.evaluate(js)

        # ---------------- Module ----------------
        info = ev('''() => ({ unfall: !!Rennspiel.Moto.unfall, welt: !!Rennspiel.Moto.unfallWelt, start: !!Rennspiel.Moto.unfallStart, cfg: Rennspiel.config.motoUnfall })''')
        c = info['cfg']
        pruefe('Unfall-Module geladen; Config R.config.motoUnfall: vor Ort 1,5 s je 10 %, Station 0,5 s je 10 %, weiterfahrenAb 30, Minimum 10',
               info['unfall'] and info['welt'] and info['start'] and c['vorOrtSekundenJe10'] == 1.5 and c['stationSekundenJe10'] == 0.5 and c['weiterfahrenAb'] == 30 and c['minimum'] == 10, c['standard'])

        # ---------------- Menü ----------------
        ev("() => { try { localStorage.removeItem(Rennspiel.config.ui.speicherSchluessel + '.unfall'); } catch (e) {} }")
        ev('() => Rennspiel.spiel.menue.zeigen(4)'); page.wait_for_timeout(500)
        zeile = ev('''() => { const k = document.querySelector('[data-a^="wert:unfall:"]'); const z = k && k.closest('.zeile'); const pillen = [...document.querySelectorAll('[data-a^="wert:unfall:"]')];
          return z ? { label: z.querySelector('.z-label').textContent.trim(), pillen: pillen.map((e) => e.textContent.trim() + (e.classList.contains('aktiv') ? '*' : '')), sichtbar: getComputedStyle(z).display !== 'none', fokusIdx: z.getAttribute('data-a'),
            schaden: [...document.querySelectorAll('[data-a^="wert:schaden:"]')].length } : null; }''')
        pruefe('Menü: Zeile „Unfälle“ mit Aus / Sanft / Echt, Standard Sanft', zeile is not None and zeile['sichtbar'] and zeile['pillen'] == ['Aus', 'Sanft*', 'Echt'], zeile)
        ev('() => document.querySelector(\'[data-a="wert:unfall:echt"]\').click()'); page.wait_for_timeout(300)
        sp = ev("() => ({ e: Rennspiel.spiel.einstellungen.unfall, key: Rennspiel.config.ui.speicherSchluessel + '.unfall', gespeichert: localStorage.getItem(Rennspiel.config.ui.speicherSchluessel + '.unfall') })")
        pruefe('Menü: Klick auf „Echt“ setzt den Modus und speichert ihn (Schlüssel mit .motorrad)', sp['e'] == 'echt' and sp['gespeichert'] == 'echt' and '.motorrad' in sp['key'], sp)
        ev('() => document.querySelector(\'[data-a="wert:unfall:sanft"]\').click()'); page.wait_for_timeout(200)
        ev('() => Rennspiel.spiel.menue.zeigen(0)')

        # ---------------- Stationen je Strecke ----------------
        ids = ev('() => Rennspiel.trackCatalog.map((t) => t.id)')
        nur = []
        for tid in ids:
            starte(tid, autopilot=False, warte=False)
            r = ev('''() => { const s = Rennspiel.spiel, m = s.motoStationen, L = s.strecke.spline.laenge; if (!m) return null;
              const ws = m.gruppe.children.filter((c) => c.name === 'Werkstatt').length, ks = m.gruppe.children.filter((c) => c.name === 'Krankenstation').length;
              return { ws, ks, schilder: m.gruppe.children.length - ws - ks, abstand: Math.abs(s.strecke.spline.differenzS(m.werkstatt.platz.s, m.kranken.platz.s)), L, standard: s.werkstatt === m.stub, hudWerk: !!(s.huds[0] && s.huds[0].werkstatt) }; }''')
            ok = r is not None and r['ws'] == 1 and r['ks'] == 1 and r['schilder'] == 4 and r['abstand'] >= r['L'] * 0.1 and r['standard']
            if not ok: nur.append(tid + ' ' + str(r))
        pruefe(f'Je Strecke ({len(ids)}): genau 1 Werkstatt + 1 Krankenstation + 4 Wegweiser in der Szene, ≥ 10 % der Länge auseinander', not nur, '; '.join(nur[:3]))

        # ---------------- Tempo-Wirkung (echte Fahrphysik) ----------------
        starte('wiese', autopilot=False, warte=False)
        tempo = ev('''() => { const s = Rennspiel.spiel, daten = s.fahrzeuge[0].vehicle.daten, f0 = s.fahrzeuge[0].vehicle;
          const lauf = (z, g) => { const v = new Rennspiel.Vehicle(Object.assign({}, daten)); v.setzen(0, 0, 0); v.untergrund = 'strasse'; const u = Rennspiel.Moto.unfall.zNeu('echt'); u.zustand = z; u.gesundheit = g; v._motoU = u; u.purzelGesehen = 0;
            let t3 = 0; for (let t = 0; t < 40; t += 1 / 60) { v.schritt(1 / 60, { gas: 1, bremse: 0, lenkung: 0 }); if (Math.abs(t - 3) < 1 / 120) t3 = v.vLaengs; } return { vmax: v.vLaengs, v3: t3, daten: v.daten.vMax }; };
          return { ganz: lauf(100, 100), kaputt: lauf(10, 100), krank: lauf(100, 10), beides: lauf(10, 10), halb: lauf(55, 100) }; }''')
        rk = tempo['kaputt']['vmax'] / tempo['ganz']['vmax']; rf = tempo['krank']['vmax'] / tempo['ganz']['vmax']; rh = tempo['halb']['vmax'] / tempo['ganz']['vmax']; ra = tempo['kaputt']['v3'] / tempo['ganz']['v3']
        pruefe(f'Tempo Motorrad: bei 10 % Höchsttempo ×{rk:.2f} (Soll 0,65), bei 55 % ×{rh:.2f} (Soll 0,825), Beschleunigung (v nach 3 s) ×{ra:.2f}; Fahrer 10 % ×{rf:.2f} (Soll 0,85); Fahrwerte danach unverändert',
               abs(rk - 0.65) < 0.02 and abs(rh - 0.825) < 0.02 and abs(rf - 0.85) < 0.02 and ra < 0.8 and tempo['ganz']['daten'] == tempo['kaputt']['daten'], f"{tempo['ganz']['vmax']:.1f} / {tempo['kaputt']['vmax']:.1f} m/s")

        # ---------------- Natürlicher Sturz → deterministische Folge ----------------
        starte('wiese', autopilot=True)
        nat = ev('''() => { const s = Rennspiel.spiel, U = Rennspiel.Moto.unfall, f = s.fahrzeuge[0], u = __U.u(0), erwartet = [], saat = s.unfall.saat; let ok = true; const art = [];
          const v = U.zNeu('echt');
          for (let k = 1; k <= 8; k++) { const e = U.sturz(v, saat, 0); erwartet.push(e.art + (e.szene ? '!' : '')); }
          for (let k = 0; k < 8; k++) { f.motoZ.purzel.aktiv = false; f.motoZ.purzel.abkling = 0; Rennspiel.Moto.schraeglage.purzelStart(f.motoZ); const n0 = u.stat.stuerze; let g = 0; while (u.stat.stuerze === n0 && g++ < 5) s.physikSchritt(1 / 60); art.push(u.stat.stuerze === n0 + 1 ? 'ok' : 'kein Sturz erkannt');
            // Szenen zu Ende laufen lassen (Gas für die Autopilot-Fahrer = „darf weiter“ ab 30 %)
            __U.lauf(40, () => !u.szene); }
          return { erwartet, art, stat: u.stat, szene: !!u.szene }; }''')
        pruefe('Natürlicher Sturz (Purzelbaum) wird erkannt: 8 Stürze gezählt, Folge-Statistik wie unfall.sturz mit gleicher Saat (deterministisch), keine hängende Szene',
               all(a == 'ok' for a in nat['art']) and nat['stat']['stuerze'] == 8 and not nat['szene'], f"{nat['stat']}, Soll {nat['erwartet']}")
        # Statistik gegen die Soll-Folge
        soll = {'schreck': 0, 'schaden': 0, 'leicht': 0, 'schwer': 0}
        for e in nat['erwartet']: soll[e.replace('!', '')] += 1
        pruefe('Folge-Zähler Schreck/Schaden/leicht/schwer stimmen mit der Soll-Folge überein', all(nat['stat'][k] == soll[k] for k in soll), f"{ {k: nat['stat'][k] for k in soll} } = {soll}")
        starte('wiese', unfall='aus', autopilot=True)
        aus = ev('''() => { const s = Rennspiel.spiel, f = s.fahrzeuge[0], u = __U.u(0); for (let k = 0; k < 12; k++) { f.motoZ.purzel.aktiv = false; f.motoZ.purzel.abkling = 0; Rennspiel.Moto.schraeglage.purzelStart(f.motoZ); __U.lauf(2); }
          return { z: u.zustand, g: u.gesundheit, szene: !!u.szene, halt: !!u.halt, modus: u.modus, hudZeile: getComputedStyle(document.querySelector('.moto-zustand')).display }; }''')
        pruefe('Modus „aus“: 12 Stürze ohne jede Folge (100 % / 100 %, keine Szene), HUD-Zeile ausgeblendet', aus['z'] == 100 and aus['g'] == 100 and not aus['szene'] and aus['modus'] == 'aus' and aus['hudZeile'] == 'none', aus)

        # ---------------- Qualm + Schaden (Bild) ----------------
        starte('wiese', autopilot=True)
        ev('() => { __U.lauf(8); Rennspiel.Moto.unfallStart.sturzFolge(Rennspiel.spiel, 0, { art: "schaden", schwer: false }); __U.lauf(2); Rennspiel.Moto.unfallStart.sturzFolge(Rennspiel.spiel, 0, { art: "schaden", schwer: false }); }')
        ev('() => { const u = __U.u(0); __U.lauf(30, () => !u.szene); __U.lauf(3); __U.halten(true); }'); page.wait_for_timeout(500); ev('() => __U.kameraSnap()'); page.wait_for_timeout(700)
        q = ev('''() => { const s = Rennspiel.spiel, u = __U.u(0), f = s.fahrzeuge[0], pts = u.qualm ? u.qualm.userData.pts : null; return { z: u.zustand, qualm: !!u.qualm, sichtbar: !!(u.qualm && u.qualm.visible), objekte: u.qualm ? u.qualm.children.filter((c) => c.visible).length : 0, punkte: !!(pts && pts.isPoints), n: pts ? pts.geometry.attributes.position.count : 0, mesh: f.mesh.children.includes(u.qualm), v: f.vehicle.tempoKmh, p: u.qualm ? __U.projiziere(f.mesh.position.x, f.mesh.position.y + 1.4, f.mesh.position.z) : null }; }''')
        bild(page, 'moto_unfall_schaden.png', f"(Motorrad {q['z']:.0f} %, Qualm)")
        pruefe('Motorrad-Schaden: zweimal −20 % → 60 %, Qualm sichtbar (runde weiche Scheiben in EINEM Points-Objekt am Motorrad = 1 Draw-Call), Motorrad im Bild', abs(q['z'] - 60) < 0.01 and q['sichtbar'] and q['objekte'] == 1 and q['punkte'] and q['n'] == 16 and q['mesh'] and q['p']['drin'], q)
        # Qualm wird bei mehr Schaden deutlicher (Stärke 0,35 gegen 0,95), liegt VOR dem Fahrer (z < −0,5, nie an/hinter ihm: verdeckt aus der Verfolger-Kamera nichts), wird bei der Versorgung abgeschwächt (dim)
        ds = ev("""() => { const W = Rennspiel.moto || Rennspiel.Moto.unfallWelt, u = __U.u(0), q = u.qualm, g = q.userData.pts.geometry.attributes, out = {};
          const stat = () => { let n = 0, grau = 0, gr = 0, gross = 0, zMax = -1e9, yMin = 1e9, yMax = -1e9, xAbs = 0; for (let i = 0; i < 16; i++) { if (g.aAlpha.array[i] > 0.02) { n++; grau += g.aGrau.array[i]; gross = Math.max(gross, g.aSize.array[i]); zMax = Math.max(zMax, g.position.array[i * 3 + 2]); yMin = Math.min(yMin, g.position.array[i * 3 + 1]); yMax = Math.max(yMax, g.position.array[i * 3 + 1]); xAbs = Math.max(xAbs, Math.abs(g.position.array[i * 3])); } }
            return { scheiben: n, grau: +(grau / Math.max(1, n)).toFixed(2), gross: +gross.toFixed(2), zMax: +zMax.toFixed(2), yMin: +yMin.toFixed(2), yMax: +yMax.toFixed(2), xAbs: +xAbs.toFixed(2) }; };
          for (const [k, st, dim] of [['leicht', 0.35, 1], ['stark', 0.95, 1], ['versorgt', 0.95, 0.1]]) { const r = Rennspiel.Moto.unfallWelt.qualmZeigen(q, 0.37, st, dim); out[k] = Object.assign({ maxAlpha: +r.maxAlpha.toFixed(2), sicht: r.sichtbar }, stat()); }
          Rennspiel.Moto.unfallWelt.qualmZeigen(q, 0.37, 0.4, 1); return out; }""")
        pruefe('Qualm: ab starkem Schaden (< 50 %) mehr Scheiben, dunkler, größer, deckender als bei leichtem; alle Scheiben vor dem Fahrer (z < −0,5, schmal, steigen nach oben)', ds['stark']['scheiben'] > ds['leicht']['scheiben'] and ds['stark']['grau'] < ds['leicht']['grau'] - 0.05 and ds['stark']['gross'] > ds['leicht']['gross'] and ds['stark']['maxAlpha'] > ds['leicht']['maxAlpha'] and ds['stark']['zMax'] < -0.5 and ds['stark']['xAbs'] < 0.45 and ds['stark']['yMax'] - ds['stark']['yMin'] > 0.5, ds)
        pruefe('Qualm: bei der Versorgung (dim 0,1) stark abgeschwächt (höchste Deckkraft %s gegen %s, ≤ 0,15 und ≤ ein Viertel)' % (ds['versorgt']['maxAlpha'], ds['stark']['maxAlpha']), ds['versorgt']['maxAlpha'] <= 0.15 and ds['versorgt']['maxAlpha'] <= ds['stark']['maxAlpha'] / 4 + 0.001, ds)
        ev('() => __U.halten(false)')

        # ---------------- Werkstatt ----------------
        starte('wiese', autopilot=False)
        ev('() => { __U.lauf(2); __U.zustand(0, 40, 100); }')
        pos = ev("() => __U.aufStation(0, 'werkstatt', 14)")
        pruefe('Testaufbau: Motorrad steht mit Tempo auf der Fläche der Werkstatt (istDrin)', pos['drin'], pos)
        w = ev('''() => { const u = __U.u(0), out = { halt: null, bremsWeg: 0, tSteht: null, tFertig: null, vorher: u.zustand }; let t = 0, x0 = Rennspiel.spiel.fahrzeuge[0].vehicle.x, z0 = Rennspiel.spiel.fahrzeuge[0].vehicle.z, steht0 = null;
          for (; t < 20; t += 1 / 60) { Rennspiel.spiel.physikSchritt(1 / 60); if (u.halt && !out.halt) out.halt = u.halt.art; if (u.halt && u.halt.steht && out.tSteht === null) { out.tSteht = t; steht0 = u.zustand; } if (!u.halt && out.halt) { out.tFertig = t; break; } }
          const f = Rennspiel.spiel.fahrzeuge[0].vehicle; out.bremsWeg = Math.hypot(f.x - x0, f.z - z0); out.steht0 = steht0; out.nachher = u.zustand; out.pflegeZeit = out.tFertig - out.tSteht; return out; }''')
        pruefe(f"Werkstatt: das Motorrad bremst selbst (Halt nach {w['tSteht']:.1f} s, {w['bremsWeg']:.0f} m), 40 → 100 % in {w['pflegeZeit']:.2f} s (Soll 6 × 0,5 = 3,0 s)", w['halt'] == 'werkstatt' and w['nachher'] == 100 and abs(w['pflegeZeit'] - 3.0) < 0.2, w)
        # Gas beendet die Pflege ab 30 %: Werkstatt mit 40 % und Gas
        ev('() => { __U.zustand(0, 40, 100); __U.aufStation(0, "werkstatt", 6); __U.gas(false); }')
        g1 = ev('''() => { const u = __U.u(0); let t = 0, steht = null, ende = null; __U.gas(false); for (; t < 20; t += 1 / 60) { Rennspiel.spiel.physikSchritt(1 / 60); if (u.halt && u.halt.steht && steht === null) { steht = t; } if (steht !== null && t > steht + 0.3) __U.gas(true); if (!u.halt && steht !== null) { ende = t; break; } } __U.gas(false); return { steht, ende, dauer: ende - steht, z: u.zustand }; }''')
        pruefe(f"Werkstatt: ab 30 % beendet NEUES Gas geben die Pflege (40 % → los 0,3 s nach dem Halt, nach {g1['dauer']:.2f} s, Wert {g1['z']:.0f} %)", 0.25 < g1['dauer'] < 0.5 and 39 < g1['z'] < 48, g1)
        # unter 30 % gesperrt
        ev('() => { __U.zustand(0, 20, 100); __U.aufStation(0, "werkstatt", 6); }')
        g2 = ev('''() => { const u = __U.u(0); let t = 0, steht = null, ende = null; __U.gas(false); for (; t < 20; t += 1 / 60) { Rennspiel.spiel.physikSchritt(1 / 60); if (u.halt && u.halt.steht && steht === null) steht = t; if (steht !== null && t > steht + 0.1) __U.gas(true); if (!u.halt && steht !== null) { ende = t; break; } } __U.gas(false); return { dauer: ende - steht, z: u.zustand }; }''')
        pruefe(f"Werkstatt: bei 20 % ist Losfahren gesperrt – Gas wirkt erst ab 30 % (nach {g2['dauer']:.2f} s, Soll 0,5 s; Wert {g2['z']:.0f} %)", abs(g2['dauer'] - 0.5) < 0.12 and 29 < g2['z'] < 36, g2)
        # Wer das Gas einfach gedrückt hält, wird trotzdem ganz repariert (Gas muss neu gedrückt werden)
        ev('() => { __U.zustand(0, 40, 100); __U.aufStation(0, "werkstatt", 6); }')
        g3 = ev('''() => { const u = __U.u(0); let t = 0, steht = null, ende = null; __U.gas(true); for (; t < 20; t += 1 / 60) { Rennspiel.spiel.physikSchritt(1 / 60); if (u.halt && u.halt.steht && steht === null) steht = t; if (!u.halt && steht !== null) { ende = t; break; } } __U.gas(false); return { dauer: ende - steht, z: u.zustand }; }''')
        pruefe(f"Werkstatt: gehaltenes Gas gilt nicht als „weiterfahren“ – 40 % → 100 % in {g3['dauer']:.2f} s (Soll 3,0 s)", abs(g3['dauer'] - 3.0) < 0.2 and g3['z'] == 100, g3)
        # Bild: mitten in der Pflege
        ev('() => { __U.zustand(0, 25, 100); __U.aufStation(0, "werkstatt", 6); __U.lauf(10, () => __U.u(0).halt && __U.u(0).halt.steht && __U.u(0).zustand > 52); __U.halten(true); }'); page.wait_for_timeout(500); ev('() => __U.kameraSnap()'); page.wait_for_timeout(700)
        wb = ev('''() => ({ a: __U.abgeleitet(), text: document.querySelector('.moto-mitte').textContent, zeile: document.querySelector('.moto-zustand').textContent, hall: Rennspiel.spiel.motoStationen.werkstatt._gruppe ? 1 : 0 })''')
        bild(page, 'moto_unfall_werkstatt.png', f"({wb['text']!r}, Zeile {wb['zeile']!r})")
        ab1 = ev(ABSTAND)
        pruefe('Werkstatt: Mechaniker steht neben dem Motorrad – Lücke zum Umriss (mit Fahrer) %s m ≥ 0,8' % ab1['figurBike'], ab1['figur'] is not None and ab1['figurBike'] >= 0.8, ab1)
        eb = ev(EINBLEND)
        pruefe('Einblendungen verdecken Fahrer und Motorrad nicht (Werkstatt): Motorrad bei x {}–{}, y {}–{}, {} Einblendung(en) geprüft'.format(eb['bike']['l'], eb['bike']['r'], eb['bike']['t'], eb['bike']['b'], len(eb['liste'])), eb['vorne'] and eb['imBild'] and len(eb['liste']) >= 1 and not eb['treffer'], eb)
        sp1 = ev(STATION_PRUEFUNG, 'werkstatt')
        pruefe('Werkstatt deckend: alle %d Meshe der Halle undurchsichtig (Deckkraft 1), auch mit Kameraabstand < 8 m (kein Geisterhaus)' % sp1['meshe'], sp1['meshe'] > 20 and sp1['nDurch'] == 0, sp1)
        pruefe('Werkstatt im Bild: Kamera steht nicht im Gebäude (%.0f m von der Gebäudemitte), Gebäude (Mitte und beide Enden), Motorrad und Mechaniker im Bild' % sp1['kamAbstand'], not sp1['imGebaeude'] and sp1['gebaeude']['drin'] and sp1['motorrad']['drin'] and sp1['figurDa'] and sp1['figurArt'] == 'mechaniker' and sp1['figur']['drin'] and sp1['kamAbstand'] > 8, sp1)
        pruefe('Werkstatt-Bild: Motorrad steht auf der Fläche, Text „Mechaniker schraubt … NN %“ und „Noch kurz warten …“/„Gas = weiterfahren“, beide Prozentwerte im Chip', wb['a']['halt'] == 'werkstatt:steht' and 'Mechaniker schraubt' in wb['text'] and ('Gas = weiterfahren' in wb['text'] or 'Noch kurz warten' in wb['text']) and '%' in wb['zeile'], wb['text'].replace('\n', ' | '))
        ev('() => __U.halten(false)')

        # ---------------- Krankenstation ----------------
        starte('wiese', autopilot=False)
        ev('() => { __U.lauf(2); __U.zustand(0, 100, 45); }')
        pos = ev("() => __U.aufStation(0, 'kranken', 12)")
        k = ev('''() => { const u = __U.u(0), out = { halt: null, tSteht: null, tFertig: null }; let t = 0;
          for (; t < 20; t += 1 / 60) { Rennspiel.spiel.physikSchritt(1 / 60); if (u.halt && !out.halt) out.halt = u.halt.art; if (u.halt && u.halt.steht && out.tSteht === null) out.tSteht = t; if (!u.halt && out.halt) { out.tFertig = t; break; } }
          out.pflegeZeit = out.tFertig - out.tSteht; out.g = u.gesundheit; out.geheilt = u.stat.geheilt; return out; }''')
        pruefe(f"Krankenstation: 45 → 100 % in {k['pflegeZeit']:.2f} s (Soll 5,5 × 0,5 = 2,75 s), Statistik geheilt = 1", k['halt'] == 'kranken' and k['g'] == 100 and abs(k['pflegeZeit'] - 2.75) < 0.2 and k['geheilt'] == 1, k)
        ev('() => { __U.zustand(0, 100, 20); __U.aufStation(0, "kranken", 6); __U.lauf(10, () => __U.u(0).halt && __U.u(0).halt.steht && __U.u(0).gesundheit > 45); __U.halten(true); }'); page.wait_for_timeout(500); ev('() => __U.kameraSnap()'); page.wait_for_timeout(700)
        kb = ev('''() => ({ a: __U.abgeleitet(), text: document.querySelector('.moto-mitte').textContent, zeile: document.querySelector('.moto-zustand').textContent })''')
        bild(page, 'moto_unfall_krankenstation.png', f"({kb['text']!r})")
        ab2 = ev(ABSTAND)
        pruefe('Krankenstation: Sanitäter steht neben dem Motorrad – Lücke zum Umriss (mit Fahrer) %s m ≥ 0,8' % ab2['figurBike'], ab2['figur'] is not None and ab2['figurBike'] >= 0.8, ab2)
        eb = ev(EINBLEND)
        pruefe('Einblendungen verdecken Fahrer und Motorrad nicht (Krankenstation): Motorrad bei x {}–{}, y {}–{}, {} Einblendung(en) geprüft'.format(eb['bike']['l'], eb['bike']['r'], eb['bike']['t'], eb['bike']['b'], len(eb['liste'])), eb['vorne'] and eb['imBild'] and len(eb['liste']) >= 1 and not eb['treffer'], eb)
        sp2 = ev(STATION_PRUEFUNG, 'kranken')
        pruefe('Krankenstation deckend: alle %d Meshe undurchsichtig, auch mit Kameraabstand < 8 m' % sp2['meshe'], sp2['meshe'] > 20 and sp2['nDurch'] == 0, sp2)
        pruefe('Krankenstation im Bild: Kamera nicht im Gebäude (%.0f m von der Gebäudemitte), Gebäude, Motorrad und Sanitäter im Bild' % sp2['kamAbstand'], not sp2['imGebaeude'] and sp2['gebaeude']['drin'] and sp2['motorrad']['drin'] and sp2['figurDa'] and sp2['figurArt'] == 'sanitaeter' and sp2['figur']['drin'] and sp2['kamAbstand'] > 8, sp2)
        kr = ev("""() => { const w = Rennspiel.spiel.motoStationen.kranken, g = w._gruppe, n = {}; g.traverse((o) => { if (o.name) n[o.name] = (n[o.name] || 0) + 1; });
          let weiss = 0, rot = 0; g.traverse((o) => { if (o.isMesh && o.material && o.material.color) { const h = o.material.color.getHex(); if (h === 0xffffff || h === 0xfbfcfd || h === 0xeef2f5) weiss++; if (h === 0xe0342c || (h >> 16) > 0xc0 && ((h >> 8) & 255) < 0x60) rot++; } });
          return { kreuzFront: n.KrankenKreuzFront || 0, kreuzDach: n.KrankenKreuzDach || 0, weiss, rot, tafel: !!w._tafel }; }""")
        pruefe('Krankenstation erkennbar: große rote Kreuze an der Front (≥ 2) und auf dem Dach (2), weiße Wände/Dach, rote Teile', kr['kreuzFront'] >= 2 and kr['kreuzDach'] == 2 and kr['weiss'] >= 4 and kr['rot'] >= 2, kr)
        pruefe('Krankenstation-Bild: Motorrad hält auf der Fläche, Text „Sanitäter verbinden … NN %“', kb['a']['halt'] == 'kranken:steht' and 'Sanitäter verbinden' in kb['text'], kb['text'].replace('\n', ' | '))
        ev('() => __U.halten(false)')


        # ---------------- Beschilderung: Wegweiser vor der Zufahrt ----------------
        for art, name in [('werkstatt', 'Werkstatt'), ('kranken', 'Krankenstation')]:
            starte('wiese', autopilot=False)
            ev('(art) => { __U.zustand(0, art === "werkstatt" ? 40 : 100, art === "werkstatt" ? 100 : 45); __U.lauf(1); }', art)
            w = ev('''(art) => { const s = Rennspiel.spiel, m = s.motoStationen, w = art === 'werkstatt' ? m.werkstatt : m.kranken, P = w.platz, sp = s.strecke.spline; const sB = P.s - P.laenge / 2 - P.zufahrt - 120;
              __U.aufStrecke(0, sB, 6, -P.seite * 2.5); __U.lauf(0.1); __U.halten(true);
              const tafeln = m.gruppe.children.filter((c) => c.type === 'Group' && c.name === '' && c.children.some((k) => k.geometry && k.geometry.type === 'PlaneGeometry'));
              return { P: { s: P.s, seite: P.seite } }; }''', art)
            page.wait_for_timeout(500); ev('() => __U.kameraSnap()'); page.wait_for_timeout(700)
            r = ev('''(art) => { const s = Rennspiel.spiel, m = s.motoStationen, w = art === 'werkstatt' ? m.werkstatt : m.kranken, P = w.platz; const qE = P.qE !== undefined ? P.qE : P.qA - 0.4;
              const pr = [160, 70].map((ab) => { const pt = w.welt(P.s - P.laenge / 2 - P.zufahrt - ab, qE + 1.8); const h = s.strecke.hoeheAn(pt.x, pt.z); return __U.projiziere(pt.x, h + 5.4, pt.z); });
              const hall = w.welt(P.s, P.gebQ), halle = __U.projiziere(hall.x, s.strecke.hoeheAn(hall.x, hall.z) + 5, hall.z);
              return { schild70: pr[1], schild160: pr[0], halle }; }''', art)
            bild(page, 'moto_unfall_wegweiser_%s.png' % ('werkstatt' if art == 'werkstatt' else 'krankenstation'), f"({name}: Wegweiser 70 m / 160 m vor der Zufahrt)")
            eb = ev(EINBLEND)
            pruefe(f'Einblendungen verdecken Fahrer und Motorrad nicht ({name} voraus): Motorrad x {eb["bike"]["l"]}–{eb["bike"]["r"]}, y {eb["bike"]["t"]}–{eb["bike"]["b"]}', eb['vorne'] and eb['imBild'] and any('voraus' in e['n'] for e in eb['liste']) and not eb['treffer'], eb)
            pruefe(f'Beschilderung {name}: Wegweiser „{name.upper()} 70 m“ im Bild, wenn man 120 m vor der Zufahrt steht', r['schild70']['drin'] or r['schild160']['drin'], r)
            ev('() => __U.halten(false)')

        # ---------------- Krankenwagen vor Ort ----------------
        starte('wiese', autopilot=False)
        ev('() => { __U.lauf(3); __U.aufStrecke(0, __U.sicherS(), 24, 1.5); __U.zustand(0, 100, 100); }')
        kw = ev('''() => { const s = Rennspiel.spiel, u = __U.u(0); Rennspiel.Moto.unfallStart.sturzFolge(s, 0, { art: 'schwer' }); const out = { phasen: [], gesund0: u.gesundheit, tPflege: null }; let last = '', t = 0, tAnf = null;
          for (; t < 40 && u.szene; t += 1 / 60) { s.physikSchritt(1 / 60); const sz = u.szene; const k = sz ? sz.phase + (sz.plan ? ':' + Rennspiel.Moto.unfall.szenePhase(sz.pflege, sz.t).name : '') : 'ende'; if (k !== last) { last = k; out.phasen.push([+t.toFixed(2), k, Math.round(u.gesundheit)]); } }
          out.dauer = t; out.g = u.gesundheit; out.nan = __U.abgeleitet().nan; out.rueck = s.unfall.rueckfaelle || 0; out.stat = u.stat.krankenwagen; return out; }''')
        ph = [x[1] for x in kw['phasen']]
        pflege_t = [x[0] for x in kw['phasen'] if x[1] == 'lauf:pflege'][0] if 'lauf:pflege' in ph else None
        ende_t = [x[0] for x in kw['phasen'] if x[1] == 'ende'][0] if 'ende' in ph else None
        pruefe(f"Krankenwagen vor Ort ohne Gas: Fahrer 50 → 100 % (5 × 1,5 = 7,5 s Pflege), Szene {ende_t if ende_t else 0:.1f} s lang, Phasen {ph}, kein Rückfall",
               ph == ['warten', 'lauf:anfahrt', 'lauf:pflege', 'lauf:abfahrt', 'ende'] and kw['g'] == 100 and ende_t is not None and 9.2 < ende_t < 11.5 and kw['rueck'] == 0 and not kw['nan'], kw['phasen'])
        # Bild: Pflege läuft
        ev('() => { __U.lauf(3); __U.aufStrecke(0, __U.sicherS(), 24, 1.5); __U.zustand(0, 100, 100); Rennspiel.Moto.unfallStart.sturzFolge(Rennspiel.spiel, 0, { art: "schwer" }); const u = __U.u(0); __U.lauf(30, () => u.szene && u.szene.plan && u.gesundheit > 66); __U.halten(true); }'); page.wait_for_timeout(500); ev('() => __U.kameraSnap()'); page.wait_for_timeout(700)
        kwb = ev('''() => { const s = Rennspiel.spiel, u = __U.u(0), sz = u.szene, h = sz.helfer.mesh; return { a: __U.abgeleitet(), text: document.querySelector('.moto-mitte').textContent, helfer: __U.projiziere(h.position.x, h.position.y + 1.2, h.position.z), figur: sz.figur ? sz.figur.visible : false, sichtbar: h.visible, zeile: document.querySelector('.moto-zustand').textContent }; }''')
        bild(page, 'moto_unfall_krankenwagen.png', f"({kwb['text']!r})")
        ab3 = ev(ABSTAND)
        pruefe('Krankenwagen vor Ort: Sanitäter %s m seitlich vom Motorrad-Umriss (≥ 0,8), Krankenwagen %s m davor (≥ 1,5, vor dem Motorrad), Figur–Wagen %s m (> 0)' % (ab3['figurBike'], ab3['fahrzeugBike'], ab3['figurFahrzeug']), ab3['figur'] is not None and ab3['fahrzeug'] is not None and ab3['figurBike'] >= 0.8 and ab3['fahrzeugBike'] >= 1.5 and ab3['fahrzeugDavor'] >= 1.5 and ab3['figurFahrzeug'] > 0, ab3)
        eb = ev(EINBLEND)
        pruefe('Einblendungen verdecken Fahrer und Motorrad nicht (Krankenwagen): Motorrad bei x {}–{}, y {}–{}, {} Einblendung(en) geprüft'.format(eb['bike']['l'], eb['bike']['r'], eb['bike']['t'], eb['bike']['b'], len(eb['liste'])), eb['vorne'] and eb['imBild'] and len(eb['liste']) >= 1 and not eb['treffer'], eb)
        pruefe('Krankenwagen-Bild: Krankenwagen steht neben dem Motorrad (im Bild), Sanitäter steht daneben, Text „Sanitäter verbinden … NN %“ zählt hoch', kwb['helfer']['drin'] and kwb['figur'] and 'Sanitäter verbinden' in kwb['text'], kwb['text'].replace('\n', ' | ') + ' ' + str(kwb['helfer']))
        ev('() => __U.halten(false)')
        # Gas ab 30 %: sofort weiter, sobald der Wagen da ist
        ev('() => { __U.lauf(1); __U.aufStrecke(0, __U.sicherS(), 24, 1.5); __U.zustand(0, 100, 100); }')
        gk = ev('''() => { const s = Rennspiel.spiel, u = __U.u(0); Rennspiel.Moto.unfallStart.sturzFolge(s, 0, { art: 'schwer' }); __U.gas(false); let t = 0, tPfl = null, tFrei = null; const v = [];
          for (; t < 20 && u.szene; t += 1 / 60) { if (t > 0.5) __U.gas(true); s.physikSchritt(1 / 60); const sz = u.szene; if (sz && sz.plan && tPfl === null && Rennspiel.Moto.unfall.szenePhase(sz.pflege, sz.t).name === 'pflege') tPfl = t; if (sz && sz.frei && tFrei === null) tFrei = t; }
          __U.gas(false); return { tPfl, tFrei, g: u.gesundheit, halteBremse: u.halteBremse, ende: !u.szene }; }''')
        pruefe(f"Krankenwagen: bei 50 % darf man gleich los – Gas beendet die Versorgung, sobald der Wagen da ist (Pflegebeginn {gk['tPfl']:.2f} s, frei {gk['tFrei']:.2f} s), Szene endet", gk['tFrei'] is not None and gk['tFrei'] - gk['tPfl'] < 0.2 and gk['ende'] and not gk['halteBremse'], gk)

        # ---------------- Abschleppwagen vor Ort ----------------
        starte('wiese', autopilot=False)
        ev('() => { __U.lauf(3); __U.aufStrecke(0, __U.sicherS(), 24, 1.5); __U.zustand(0, 20, 100); }')
        ab = ev('''() => { const s = Rennspiel.spiel, u = __U.u(0); Rennspiel.Moto.unfallStart.sturzFolge(s, 0, { art: 'schaden', schwer: true }); const out = { phasen: [] }; let last = '', t = 0, z0 = u.zustand;
          for (; t < 40 && u.szene; t += 1 / 60) { s.physikSchritt(1 / 60); const sz = u.szene; const k = sz ? sz.phase + (sz.plan ? ':' + Rennspiel.Moto.unfall.szenePhase(sz.pflege, sz.t).name : '') : 'ende'; if (k !== last) { last = k; out.phasen.push([+t.toFixed(2), k, Math.round(u.zustand)]); } }
          out.z = u.zustand; out.z0 = z0; out.rep = u.stat.repariert; return out; }''')
        ph = [x[1] for x in ab['phasen']]
        ende_t = [x[0] for x in ab['phasen'] if x[1] == 'ende'][0] if 'ende' in ph else None
        pruefe(f"Abschleppwagen vor Ort: schwerer Schaden (Zustand {ab['z0']:.0f} → 10 %) → Reparatur vor Ort bis 100 % (13,5 s Pflege), Szene {ende_t if ende_t else 0:.1f} s, Phasen {ph}", ph == ['warten', 'lauf:anfahrt', 'lauf:pflege', 'lauf:abfahrt', 'ende'] and ab['z'] == 100 and ende_t is not None and 15 < ende_t < 18.5, ab['phasen'])
        ev('() => { __U.lauf(2); __U.aufStrecke(0, __U.sicherS(), 24, 1.5); __U.zustand(0, 100, 100); Rennspiel.Moto.unfallStart.sturzFolge(Rennspiel.spiel, 0, { art: "schaden", schwer: true }); const u = __U.u(0); __U.lauf(30, () => u.szene && u.szene.plan && u.zustand > 66); __U.halten(true); }'); page.wait_for_timeout(500); ev('() => __U.kameraSnap()'); page.wait_for_timeout(700)
        abb = ev('''() => { const s = Rennspiel.spiel, u = __U.u(0), sz = u.szene, h = sz.helfer.mesh; return { a: __U.abgeleitet(), text: document.querySelector('.moto-mitte').textContent, helfer: __U.projiziere(h.position.x, h.position.y + 1.5, h.position.z), figur: sz.figur ? sz.figur.visible : false, art: sz.helfer.art }; }''')
        bild(page, 'moto_unfall_abschlepp.png', f"({abb['text']!r})")
        ab4 = ev(ABSTAND)
        pruefe('Abschleppwagen vor Ort: Mechaniker %s m seitlich vom Motorrad-Umriss (≥ 0,8), Abschleppwagen %s m davor (≥ 1,5, vor dem Motorrad), Figur–Wagen %s m (> 0)' % (ab4['figurBike'], ab4['fahrzeugBike'], ab4['figurFahrzeug']), ab4['figur'] is not None and ab4['fahrzeug'] is not None and ab4['figurBike'] >= 0.8 and ab4['fahrzeugBike'] >= 1.5 and ab4['fahrzeugDavor'] >= 1.5 and ab4['figurFahrzeug'] > 0, ab4)
        rd = ev("""() => { const m = __U.u(0).szene.helfer.mesh; let reifen = 0, felgen = 0, ecken = []; m.traverse((o) => { if (o.isMesh && o.geometry && o.geometry.parameters && Math.abs(o.geometry.parameters.radiusTop - 0.58) < 1e-6) { reifen++; ecken.push(o.geometry.parameters.radialSegments); felgen += o.children.filter((c) => c.isMesh).length; } }); return { reifen, felgen, ecken: [...new Set(ecken)] }; }""")
        pruefe('Abschleppwagen-Räder runder und mit Felge (Laufzeit-Überlagerung, world/abschleppwagen.js unverändert): %d Reifen mit %s Ecken, %d Felgenteile' % (rd['reifen'], rd['ecken'], rd['felgen']), rd['reifen'] == 6 and rd['ecken'] == [28] and rd['felgen'] == 12, rd)
        eb = ev(EINBLEND)
        pruefe('Einblendungen verdecken Fahrer und Motorrad nicht (Abschleppwagen): Motorrad bei x {}–{}, y {}–{}, {} Einblendung(en) geprüft'.format(eb['bike']['l'], eb['bike']['r'], eb['bike']['t'], eb['bike']['b'], len(eb['liste'])), eb['vorne'] and eb['imBild'] and len(eb['liste']) >= 1 and not eb['treffer'], eb)
        pruefe('Abschleppwagen-Bild: Abschleppwagen (Kran) steht neben dem Motorrad (im Bild), Mechaniker steht daneben, Text „Mechaniker schraubt … NN %“', abb['art'] == 'abschlepp' and abb['helfer']['drin'] and abb['figur'] and 'Mechaniker schraubt' in abb['text'], abb['text'].replace('\n', ' | ') + ' ' + str(abb['helfer']))
        ev('() => __U.halten(false)')

        # ---------------- Zeitlimit: Rückfall auf den Kontrollpunkt ----------------
        starte('wiese', autopilot=False)
        ev('() => { __U.lauf(8); __U.aufStrecke(0, __U.sicherS(), 24, 1.5); __U.zustand(0, 100, 100); }')
        rf = ev('''() => { const s = Rennspiel.spiel, u = __U.u(0), cfg = Rennspiel.config.motoUnfall, alt = cfg.szene.reserve; cfg.szene.reserve = -9; const x0 = s.fahrzeuge[0].vehicle.x;
          Rennspiel.Moto.unfallStart.sturzFolge(s, 0, { art: 'schwer' }); let t = 0; for (; t < 30 && u.szene; t += 1 / 60) s.physikSchritt(1 / 60); cfg.szene.reserve = alt;
          return { t, ende: !u.szene, rueck: s.unfall.rueckfaelle || 0, g: u.gesundheit, halteBremse: u.halteBremse, bewegt: Math.hypot(s.fahrzeuge[0].vehicle.x - x0, 0) > 1, kinder: s.szene.children.filter((c) => c.name === 'Abschleppwagen').length }; }''')
        pruefe(f"Zeitlimit: hängende Szene → Rückfall auf den Kontrollpunkt nach {rf['t']:.1f} s (Pflege nachgeholt, Fahrer 100 %, Haltebremse aus)", rf['ende'] and rf['rueck'] == 1 and rf['g'] == 100 and not rf['halteBremse'], rf)

        # ---------------- KI ----------------
        starte('wiese', autopilot=True)
        ki = ev('''() => { const s = Rennspiel.spiel, U = Rennspiel.Moto.unfall, u = __U.u(1); __U.lauf(10); const o = {};
          Rennspiel.Moto.unfallStart.sturzFolge(s, 1, { art: 'schwer' }); let t = 0, frei = null, pfl = null; for (; t < 40 && u.szene; t += 1 / 60) { s.physikSchritt(1 / 60); const sz = u.szene; if (sz && sz.plan && pfl === null && U.szenePhase(sz.pflege, sz.t).name === 'pflege') pfl = t; if (sz && sz.frei && frei === null) frei = t; }
          o.vorOrt = { pfl, frei, g: u.gesundheit, ende: !u.szene };
          // Station: KI auf die Werkstatt-Fläche mit 50 %
          __U.zustand(1, 50, 100); const f = s.fahrzeuge[1]; const st = s.motoStationen, w = st.werkstatt, P = w.platz, sp = s.strecke.spline, pt = sp.punktBei(P.s - P.laenge / 2 + 2);
          f.vehicle.setzen(pt.x, pt.z, Rennspiel.headingAus(pt.tx, pt.tz)); f.vehicle.vLaengs = 30; f.index = sp.indexBei(pt.s); f.nah = sp.naechster(pt.x, pt.z, f.index);
          let t2 = 0, vmin = 1e9, vmax = 0, pf = null; for (; t2 < 12; t2 += 1 / 60) { s.physikSchritt(1 / 60); if (u.kiPflege) { if (pf === null) pf = t2; vmin = Math.min(vmin, f.vehicle.vLaengs); } if (pf !== null && !u.kiPflege) break; }
          o.station = { z: u.zustand, dauer: t2 - (pf || 0), kiPflege: !!u.kiPflege, vmin, rep: u.stat.repariert };
          return o; }''')
        pruefe(f"KI vor Ort: fährt ab 30 % weiter (Fahrer 50 %: Pflegebeginn {ki['vorOrt']['pfl']:.2f} s, frei {ki['vorOrt']['frei']:.2f} s), Szene endet", ki['vorOrt']['ende'] and abs(ki['vorOrt']['frei'] - ki['vorOrt']['pfl']) < 0.2 and abs(ki['vorOrt']['g'] - 50) < 1, ki['vorOrt'])
        pruefe(f"KI an der Station: fährt weiter (Tempo ≥ {ki['station']['vmin']:.0f} m/s) und wird bis 100 % repariert (50 % → 100 % in {ki['station']['dauer']:.2f} s, Soll 2,5 s)", ki['station']['z'] == 100 and not ki['station']['kiPflege'] and 2.2 < ki['station']['dauer'] < 3.1 and ki['station']['vmin'] > 3, ki['station'])

        # ---------------- Stuntrennen: Punkte unverändert ----------------
        starte('wiese', stunt='true', autopilot=True)
        sr = ev('''() => { const s = Rennspiel.spiel, z = s.stunt.fz[0], u = __U.u(0); __U.lauf(30); z.punkte = 1234; z.combo = { zaehler: 3, letzter: z.jetzt }; const p0 = z.punkte;
          Rennspiel.Moto.unfallStart.sturzFolge(s, 0, { art: 'leicht' }); Rennspiel.Moto.schraeglage.purzelStart(s.fahrzeuge[0].motoZ); __U.lauf(40, () => !u.szene); return { p0, p1: z.punkte, g: u.gesundheit }; }''')
        pruefe('Stuntrennen: Sturz/Unfall zieht keine Stuntpunkte ab', sr['p0'] == sr['p1'] == 1234, sr)

        # ---------------- Ganzes Rennen mit erzwungenen Stürzen ----------------
        starte('wiese', autopilot=True)
        gesamt = ev('''() => { const s = Rennspiel.spiel, U = Rennspiel.Moto.unfallStart; let t = 0, n = 0, naechster = 6, nan = false, hang = 0; const arten = ['schwer', 'schaden-schwer', 'leicht', 'schaden', 'schwer'];
          for (; t < 400 && s.zustand === 'rennen'; t += 1 / 60) { s.physikSchritt(1 / 60);
            if (t > naechster) { naechster += 6; const i = n % s.fahrzeuge.length; const a = arten[n % arten.length]; n++; const f = s.fahrzeuge[i]; if (f && !f.ausgeschieden && s.unfall.fz[i] && !s.unfall.fz[i].szene && !s.unfall.fz[i].halt) U.sturzFolge(s, i, a === 'schaden-schwer' ? { art: 'schaden', schwer: true } : { art: a, schwer: false }); }
            if (s.fahrzeuge.some((g) => !isFinite(g.vehicle.x) || !isFinite(g.vehicle.z))) { nan = true; break; } }
          const offen = s.unfall.fz.filter((u) => u && u.szene && u.szene.plan && u.szene.t > u.szene.plan.limit).length; const stat = s.unfall.fz.filter(Boolean).map((u) => u.stat);
          return { t, zustand: s.zustand, n, nan, offen, rueck: s.unfall.rueckfaelle || 0, sumKw: stat.reduce((a, b) => a + b.schwer, 0), sumAb: stat.reduce((a, b) => a + b.schaden, 0), min: Math.min(...s.unfall.fz.filter(Boolean).map((u) => Math.min(u.zustand, u.gesundheit))) }; }''')
        pruefe(f"Ganzes Rennen mit {gesamt['n']} erzwungenen Stürzen (alle Arten, alle Fahrer, {gesamt['t']:.0f} s): Ziel erreicht, kein NaN, keine hängende Szene (nichts über dem Zeitlimit), kein Rückfall, nie unter 10 %", gesamt['zustand'] != 'rennen' and not gesamt['nan'] and gesamt['offen'] == 0 and gesamt['rueck'] == 0 and gesamt['min'] >= 10, gesamt)

        # ---------------- HUD ohne Überlappung ----------------
        def hud_pruefen(w, h, modus, name):
            page.set_viewport_size({'width': w, 'height': h}); page.wait_for_timeout(300)
            starte('wiese', modus=modus, autopilot=False, warte=False)
            ev('() => { __U.warteStart(); __U.lauf(5); }')
            ev("() => (Rennspiel.spiel.huds || []).forEach((hd) => { hd.eCountdown.className = 'hud-countdown'; hd.eCountdown.style.animation = 'none'; hd.eCountdown.textContent = ''; })")      # Countdown-Anzeige „LOS!“ weg (wie hudSzene im Stunt-Test)
            ev('''() => { const s = Rennspiel.spiel; s.pausiert = false; s.unfall.fz.forEach((u, i) => { if (!u) return; u.zustand = 62; u.gesundheit = 41; }); __U.aufStation(0, 'kranken', 6); __U.lauf(10, () => __U.u(0).halt && __U.u(0).halt.steht);
              if (s.fahrzeuges) {} }''')
            if modus == 'zwei':
                ev('''() => { const s = Rennspiel.spiel, i = s.fahrzeuge.findIndex((f) => f.istSpieler && f.spielerNr === 1); const u = s.unfall.fz[i]; u.zustand = 33; u.gesundheit = 70; u.halt = { art: 'werkstatt', t: 0, steht: true }; }''')
            ev('() => __U.halten(true)'); page.wait_for_timeout(500); ev('() => __U.kameraSnap()'); page.wait_for_timeout(500)
            ev("() => (Rennspiel.spiel.huds || []).forEach((hd) => { hd.eCountdown.className = 'hud-countdown'; hd.eCountdown.style.animation = 'none'; hd.eCountdown.textContent = ''; })"); page.wait_for_timeout(300)
            r = ev('() => __U.hudKollisionen()')
            txt = ev("() => [...document.querySelectorAll('.moto-mitte')].map((e) => getComputedStyle(e).display === 'none' ? '-' : e.textContent.replace(/\\n/g, ' | '))")
            pruefe(f'HUD {name} {w}×{h}: keine Überlappung ({r["elemente"]} Elemente), Prozentwerte + Text sichtbar', not r['kollisionen'] and any(t != '-' for t in txt), '; '.join(r['kollisionen'][:3]) + ' ' + str(txt))
            return r
        for (w, h, m, nm) in [(1280, 800, 'solo', 'solo'), (1920, 1080, 'solo', 'solo'), (844, 390, 'solo', 'solo'), (1280, 800, 'zwei', 'zu zweit'), (1920, 1080, 'zwei', 'zu zweit'), (844, 390, 'zwei', 'zu zweit')]:
            hud_pruefen(w, h, m, nm)
            if (w, h, m) == (1280, 800, 'solo'): bild(page, 'moto_unfall_hud.png', '(Spieler-Chip mit 🏍️ und 😀 Prozent, Text mitten im Bild)')
            if (w, h, m) == (844, 390, 'solo'): bild(page, 'moto_unfall_hud_844.png', '(844×390)')
            if (w, h, m) == (1280, 800, 'zwei'): bild(page, 'moto_unfall_hud_zwei.png', '(zu zweit)')
        page.set_viewport_size({'width': 1280, 'height': 800})

        pruefe('Motorrad.html: 0 JS-Fehler im ganzen Lauf', not fehler, '; '.join(fehler[:3]))

        # ---------------- Autorennen.html unberührt ----------------
        page2 = browser.new_page(viewport={'width': 1280, 'height': 800}); f2 = []
        page2.on('pageerror', lambda e: f2.append('pageerror: ' + str(e)))
        page2.on('console', lambda m: f2.append('console.error: ' + m.text) if m.type == 'error' else None)
        geladen = []
        page2.on('request', lambda r: geladen.append(r.url) if '/src/moto/' in r.url else None)
        page2.goto(basisurl + 'Autorennen.html'); page2.wait_for_timeout(1500)
        a = page2.evaluate('''() => ({ moto: !!(window.Rennspiel.Moto), flag: window.MOTORRAD === true, werkstatt: !!window.Rennspiel.Werkstatt, autos: window.Rennspiel.carCatalog.filter((c) => c.waehlbar).length })''')
        page2.evaluate("() => Rennspiel.spiel.rennenStarten({ modus: 'solo', streckeId: 'wiese', autoIds: ['troc-cabrio', 'multivan'], runden: 1, gegner: 3, schwierigkeit: 'mittel', fahrhilfe: ['wenig', 'wenig'] })"); page2.wait_for_timeout(800)
        a2 = page2.evaluate('() => ({ unfall: !!Rennspiel.spiel.unfall, stationen: !!Rennspiel.spiel.motoStationen, zustand: Rennspiel.spiel.zustand })')
        pruefe('Autorennen.html: 0 JS-Fehler, lädt keine Moto-Datei, keine Unfall-/Stations-Objekte', not f2 and not geladen and not a['moto'] and not a['flag'] and not a2['unfall'] and not a2['stationen'], f"{f2[:2]} {geladen[:2]} {a} {a2}")
        browser.close()
finally:
    server.terminate()

ok = sum(ergebnisse); print(f'\n{ok}/{len(ergebnisse)} Prüfungen bestanden')
sys.exit(0 if ok == len(ergebnisse) else 1)
