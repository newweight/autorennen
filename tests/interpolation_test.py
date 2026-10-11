#!/usr/bin/env python3
"""Ruckel-Test: Wie gleichmäßig bewegt sich das Auto-Mesh von Frame zu Frame?

Hintergrund: Physik läuft mit festem Schritt 1/60 s, das Display (60 Hz) liefert Frames
mit 16,7 ms ± Jitter. Ohne Interpolation macht die Physik je Frame mal 0, mal 1, mal 2
Schritte – das Auto springt sichtbar (Schrittweite 0 / 1× / 2×). Mit Interpolation bewegt
sich das Mesh proportional zur echten Frame-Zeit.

Der Test hält die Spielschleife an und ruft frame() selbst im 16,67-ms-Raster ± Jitter auf
(deterministischer Zufall, Jitter nicht aufsummiert wie bei vsync), Zwei-Spieler-Modus mit Autopilot, und loggt je Frame
Mesh-Position, Physik-Position (= was der alte Stand gezeichnet hat) und Kameraposition.

Kennzahl: Variationskoeffizient (Standardabweichung / Mittelwert) der Schrittweite je
Frame, normiert auf die Frame-Zeit (m/s). Ziel mit Interpolation: < 0,10.

Aufruf: python3 tests/interpolation_test.py [--basis DIR] [--jitter 1.5]
"""
import sys, os, argparse
from playwright.sync_api import sync_playwright

ap = argparse.ArgumentParser()
ap.add_argument('--basis', default=os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
ap.add_argument('--jitter', type=float, default=1.5, help='± ms Jitter je Frame')
ap.add_argument('--frames', type=int, default=240)
arg = ap.parse_args()
url = 'file://' + os.path.join(os.path.abspath(arg.basis), 'Autorennen.html')

MESSEN = r'''async ([n, jitter]) => {
  const s = Rennspiel.spiel;
  window.requestAnimationFrame = () => 0;           // Schleife anhalten, frame() selbst aufrufen
  let saat = 12345;
  const zufall = () => { saat = (saat * 1103515245 + 12345) & 0x7fffffff; return saat / 0x7fffffff; };
  // vsync-Raster wie im Browser: Zeitstempel = Start + i·16,67 ms + Jitter (Jitter summiert sich NICHT auf).
  // Physik-Rest startet bei 0 = ungünstigste Phase: der Rest pendelt um die Schrittgrenze.
  const t0 = performance.now(); s.uhr.letzte = t0; s.uhr.rest = 0;
  let letzte = t0;
  const f = s.fahrzeuge[0], k = s.kameras[0].kamera;
  const log = [];
  for (let i = 0; i < n + 30; i++) {
    const jetzt = t0 + (i + 1) * 1000 / 60 + (zufall() * 2 - 1) * jitter;
    const dtMs = jetzt - letzte; letzte = jetzt;
    const vorSchritte = s.rennen.zeit;
    s.frame(jetzt);
    if (i < 30) continue;                              // Einschwingen
    log.push({ dt: dtMs / 1000, mx: f.mesh.position.x, mz: f.mesh.position.z,
      px: f.vehicle.x, pz: f.vehicle.z, kx: k.position.x, kz: k.position.z,
      schritte: Math.round((s.rennen.zeit - vorSchritte) * 60) });
  }
  return log;
}'''

def kennzahlen(log, x, z):
    """Geschwindigkeit je Frame (Schrittweite / Frame-Zeit) → Variationskoeffizient."""
    v = []
    for a, b in zip(log, log[1:]):
        d = ((b[x] - a[x]) ** 2 + (b[z] - a[z]) ** 2) ** 0.5
        v.append(d / b['dt'])
    m = sum(v) / len(v)
    sd = (sum((x_ - m) ** 2 for x_ in v) / len(v)) ** 0.5
    return m, sd / m if m > 0 else 0

with sync_playwright() as p:
    browser = p.chromium.launch(args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
    page = browser.new_page(viewport={'width': 1280, 'height': 800})
    fehler = []
    page.on('pageerror', lambda e: fehler.append(str(e)))
    page.goto(url)
    page.wait_for_function('window.Rennspiel && Rennspiel.spiel', timeout=20000)
    page.evaluate("""Rennspiel.spiel.rennenStarten({ modus: 'zwei', streckeId: 'wald', autoIds: ['troc-cabrio', 'multivan'],
        runden: 3, gegner: 3, schwierigkeit: 'mittel', fahrhilfe: ['wenig', 'wenig'] })""")
    page.evaluate("[0, 1].forEach(i => Rennspiel.spiel.autopilot(i, true))")
    page.evaluate("Rennspiel.spiel.schnellvorlauf(10)")
    log = page.evaluate(MESSEN, [arg.frames, arg.jitter])
    browser.close()

schritte = [e['schritte'] for e in log]
verteilung = {k: schritte.count(k) for k in sorted(set(schritte))}
vm, cv_mesh = kennzahlen(log, 'mx', 'mz')
_, cv_phys = kennzahlen(log, 'px', 'pz')
_, cv_kam = kennzahlen(log, 'kx', 'kz')

def zappeln(log, x, z):
    """Sichtbares Zittern: Abstand Auto↔Kamera, Änderung von Frame zu Frame minus gleitender Mittelwert (cm)."""
    ab = [((e[x] - e['kx']) ** 2 + (e[z] - e['kz']) ** 2) ** 0.5 for e in log]
    d = [b - a for a, b in zip(ab, ab[1:])]
    glatt = [sum(d[max(0, i - 4):i + 5]) / len(d[max(0, i - 4):i + 5]) for i in range(len(d))]
    return 100 * (sum((a - b) ** 2 for a, b in zip(d, glatt)) / len(d)) ** 0.5
z_mesh, z_phys = zappeln(log, 'mx', 'mz'), zappeln(log, 'px', 'pz')
print(f'Basis: {arg.basis}')
print(f'Frames {len(log)}, Jitter ±{arg.jitter} ms, Tempo ≈ {vm * 3.6:.0f} km/h, Physikschritte je Frame: {verteilung}')
print(f'Variationskoeffizient Tempo je Frame:  Mesh {cv_mesh:.3f}  |  Physik roh (= ohne Interpolation) {cv_phys:.3f}  |  Kamera {cv_kam:.3f}')
print(f'Zittern Auto relativ zur Kamera (RMS, cm/Frame):  Mesh {z_mesh:.2f}  |  Physik roh {z_phys:.2f}')
ok = not fehler and cv_mesh < 0.10
if fehler: print('JS-Fehler:', fehler[:3])
print('ERGEBNIS:', 'OK' if ok else 'FAIL', '(Ziel: Mesh < 0,10)')
sys.exit(0 if ok else 1)
