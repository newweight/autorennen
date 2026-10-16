#!/usr/bin/env python3
"""Phase 0: schreibt tests/out/p0/grundlinie.md aus tests/out/p0/_ergebnis.tsv + _ergebnis2.tsv (Läufe mit tests/p0_runner2.sh bzw. dem ersten Läufer)."""
import os, glob, time, re
B = os.path.dirname(os.path.dirname(os.path.abspath(__file__))); P0 = os.path.join(B, 'tests', 'out', 'p0')
HILFS = {'tests/fp_autos.js': 'Geometrie-Prüfsumme je Auto (gibt JSON aus, prüft nichts)', 'tests/ruckeln_test.py': 'Ruckel-Messung (reine Messausgabe, kein Prüfstand)'}
zeilen = []
for f in ('_ergebnis.tsv', '_ergebnis2.tsv'):
    p = os.path.join(P0, f)
    if not os.path.exists(p): continue
    for z in open(p, encoding='utf-8'):
        t = z.rstrip('\n').split('\t')
        if len(t) < 8: continue
        zeilen.append(dict(art=t[0], test=t[1], rc1=int(t[2]), d1=float(t[3]), rc2=None if t[5] == '-' else int(t[5]), d2=float(t[6]) if t[6] not in ('-', '0.0') else 0.0))
def fehlzeilen(name, n=4):
    p = os.path.join(P0, name)
    if not os.path.exists(p): return ''
    t = [x.rstrip() for x in open(p, encoding='utf-8', errors='replace').read().splitlines() if re.match(r'\s*(FEHL|FAIL|FEHLER|✗|ERROR|Traceback)', x) and not re.match(r'\s*FEHLER\s*$', x)]
    return ' ‖ **Fehlzeilen:** ' + ' ⏎ '.join(x.strip().replace('|', '¦')[:200] for x in t[:n]) + (' (+%d weitere)' % (len(t) - n) if len(t) > n else '') if t else ' ‖ (keine FEHL-Zeile im Log: Abbruch durch Zeitlimit/Ausnahme)'
def tail(name, n=5):
    p = os.path.join(P0, name)
    if not os.path.exists(p): return '(kein Log)'
    t = [x.rstrip() for x in open(p, encoding='utf-8', errors='replace').read().splitlines() if x.strip()]
    return ' ⏎ '.join(x.replace('|', '¦')[:170] for x in t[-n:])
tab, gruen, rot, flaky, hilf, tout = [], 0, 0, 0, [], 0
for z in zeilen:
    b = os.path.basename(z['test'])
    if z['test'] in HILFS: hilf.append((z['test'], HILFS[z['test']])); continue
    to = lambda rc: ' (Timeout 1200 s)' if rc == 124 else ''
    if z['rc1'] == 0: erg, gruen = 'grün', gruen + 1; fe = ''
    elif z['rc2'] == 0: erg, flaky = 'flaky (1. Lauf rot rc=%d, 2. Lauf grün)' % z['rc1'], flaky + 1; fe = '1. Lauf: ' + tail(b + '.lauf1.txt') + fehlzeilen(b + '.lauf1.txt')
    elif z['rc1'] == 124 and z['rc2'] == 124: erg, tout = 'TIMEOUT (1200 s, 2× – lief bis dahin ohne FEHL-Zeile; ungewertet, braucht längeres Limit)', tout + 1; fe = tail(b + '.txt') + fehlzeilen(b + '.txt')
    else: erg, rot = 'rot (rc=%d%s, 2. Lauf rc=%s%s)' % (z['rc1'], to(z['rc1']), z['rc2'], to(z['rc2'])), rot + 1; fe = tail(b + '.txt') + fehlzeilen(b + '.txt')
    tab.append('| `%s` | %s | %.0f s%s | %s | `tests/out/p0/%s.txt` |' % (z['test'], erg, z['d1'], (' / %.0f s' % z['d2']) if z['rc2'] is not None else '', fe, b))
alle_py = sorted(glob.glob(os.path.join(B, 'tests', '*.py')) + glob.glob(os.path.join(B, 'tests', '*.js')))
gelaufen = {os.path.join(B, z['test']) for z in zeilen}
uebr = [os.path.basename(x) for x in alle_py if x not in gelaufen and not os.path.basename(x).startswith(('p2_', 'p0_', 'durchlauf_', 'netz5_bots', 'tailscale_proxy', 'lade.js'))]
L = ['# Phase 0 – Grundlinie v27 (%s)\n' % time.strftime('%d.%m.%Y %H:%M'),
     'Jeder Test EINZELN, nacheinander (2 Kerne, nie parallel), `timeout 1200`, Playwright/Chromium aus `/opt/pw-browsers`. Rot → genau einmal wiederholt (grün beim 2. Mal = flaky). '
     'Rot ≠ Fehler im Spiel – erst Phase 3 entscheidet.\n',
     '**Zusammenfassung: %d Tests: %d grün, %d rot, %d flaky, %d Timeout (ungewertet); %d Hilfsskript(e) nicht gewertet.**\n' % (gruen + rot + flaky + tout, gruen, rot, flaky, tout, len(hilf)),
     '| Test | Ergebnis | Dauer (1. / ggf. 2. Lauf) | Letzte 5 Zeilen Fehlerausgabe (nur rot/flaky) | Log |', '|---|---|---|---|---|'] + tab
L.append('\n## Hilfsskripte (Messung/Ausgabe ohne Prüfungen, übersprungen bzw. nicht gewertet)\n')
for t, w in hilf: L.append('- `%s` – %s' % (t, w))
L.append('- `tests/ruckeln_test.py` – Ruckel-Messung (reine Messausgabe)') if not any(t == 'tests/ruckeln_test.py' for t, w in hilf) else None
L.append('- Screenshot-/Mess-/Diagnoseskripte ohne Prüfungen (nicht ausgeführt): ' + ', '.join('`%s`' % x for x in uebr))
open(os.path.join(P0, 'grundlinie.md'), 'w', encoding='utf-8').write('\n'.join(x for x in L if x))
print('grundlinie.md:', gruen, 'grün', rot, 'rot', flaky, 'flaky')
