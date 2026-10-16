#!/usr/bin/env python3
"""FORTSETZUNG (16.10. 06:45) ab schilder_screenshot.py; sonst wie p2_nachlauf.py. Phase-0-Nachlauf + Phase-2-D (nacheinander, nie parallel).  python3 tests/p2_nachlauf.py [--nach PID]
 1. test_welten_ki.js (3000 s) und fahrbarkeit_test.py (1500 s): die zwei Timeouts der Grundlinie mit größerem Limit
 2. alle Screenshot-/Mess-/Diagnoseskripte ohne Prüfungen: nur 'endet ohne Exception' (Limit 900 s). Schutz: Stand von tests/ wird vorher gesichert; was die Skripte
    ändern/anlegen, wird nach tests/out/p0/mess_ausgaben/ verschoben und der ursprüngliche Stand wiederhergestellt.
Ergebnis: tests/out/p0/nachlauf.tsv (+ Logs tests/out/p0/nachlauf_<name>.txt)"""
import os, sys, time, subprocess, shutil, hashlib, json
BASIS = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(BASIS)
os.environ['PLAYWRIGHT_BROWSERS_PATH'] = '/opt/pw-browsers'
P0 = 'tests/out/p0'
# P4 (16.10.): Aufräumen (Löschen neuer / Zurücksetzen geänderter Dateien gegenüber der P0-Sicherung) lässt die Ergebnisordner aller Phasen in Ruhe – auch p3 und p4.
# ACHTUNG: Dateien direkt unter tests/ (z. B. in P4 angepasste Tests) würden gegenüber /tmp/p0_tests_sicherung als „geändert“ zurückgesetzt – das Skript nach P4 nicht mehr laufen lassen.
AUSNAHME = ('tests/out/p0', 'tests/out/p2', 'tests/out/p3', 'tests/out/p4')
MESS = P0 + '/mess_ausgaben'
os.makedirs(MESS, exist_ok=True)
if '--nach' in sys.argv:
    pid = sys.argv[sys.argv.index('--nach') + 1]
    while os.path.exists('/proc/' + pid): time.sleep(10)

def kill_server(): subprocess.run('pkill -f "server/server[.]js --port"', shell=True)

def lauf(name, cmd, limit, env=None):
    kill_server()
    t0 = time.time(); log = '%s/nachlauf_%s.txt' % (P0, name)
    e = dict(os.environ); e.update(env or {})
    try:
        with open(log, 'w') as f: r = subprocess.run(cmd, stdout=f, stderr=subprocess.STDOUT, timeout=limit, env=e); rc = r.returncode
    except subprocess.TimeoutExpired: rc = 'TIMEOUT'
    kill_server()
    d = time.time() - t0
    letzte = ' ⏎ '.join(open(log, errors='replace').read().strip().split('\n')[-3:])[:600]
    with open(P0 + '/nachlauf.tsv', 'a') as f: f.write('%s\t%s\t%.0f\t%s\t%s\n' % (name, rc, d, ' '.join(cmd), letzte.replace('\t', ' ')))
    print(time.strftime('%T'), name, rc, '%.0fs' % d, flush=True)
    return rc

def hashes():
    h = {}
    for w, _, fs in os.walk('tests'):
        if w.startswith(AUSNAHME) or '__pycache__' in w: continue
        for fn in fs:
            if fn.startswith('p2_'): continue
            p = os.path.join(w, fn)
            try: h[p] = (os.path.getsize(p), os.path.getmtime(p))
            except OSError: pass
    return h

sicherung = '/tmp/p0_tests_sicherung'
import filecmp
S = lambda n: '%s/%s' % (MESS, n)
LISTE = [
    ('abschlepp_diag.py', ['python3', 'tests/abschlepp_diag.py', 'wiese', 'alles', '2'], {}),
    ('alpen_shots.py', ['python3', 'tests/alpen_shots.py'], {}),
    ('autos_screenshot.py', ['python3', 'tests/autos_screenshot.py'], {}),
    ('cockpit_cpu.py', ['python3', 'tests/cockpit_cpu.py', '--frames', '15'], {}),
    ('cockpit_fps.py', ['python3', 'tests/cockpit_fps.py'], {}),
    ('cockpit_shot.py', ['python3', 'tests/cockpit_shot.py', 'passat', 'cockpit', 'klar', S('cockpit_shot.png'), '120'], {}),
    ('gabelung_screenshot.py', ['python3', 'tests/gabelung_screenshot.py', 'alle', S('gabelung')], {}),
    ('garage_werkstatt_screenshot.py', ['python3', 'tests/garage_werkstatt_screenshot.py', S('garage')], {}),
    ('gruen_screenshot.py', ['python3', 'tests/gruen_screenshot.py', S('gruen')], {}),
    ('haenger_link.py', ['python3', 'tests/haenger_link.py', 'wald'], {}),
    ('haenger_matrix.py', ['python3', 'tests/haenger_matrix.py'], {'QUICK': '1'}),
    ('haenger_neustart.py', ['python3', 'tests/haenger_neustart.py'], {'N': '3'}),
    ('haenger_zeit.py', ['python3', 'tests/haenger_zeit.py'], {}),
    ('kreuzung_abbiegen_screenshot.py', ['python3', 'tests/kreuzung_abbiegen_screenshot.py', S('kreuzabbiegen')], {}),
    ('kreuzung_bande_diag.js', ['node', 'tests/kreuzung_bande_diag.js'], {}),
    ('kreuzung_zaun_screenshot.py', ['python3', 'tests/kreuzung_zaun_screenshot.py', S('kreuzzaun')], {}),
    ('licht_vorher_nachher.py', ['python3', 'tests/licht_vorher_nachher.py', 'neu', S('licht')], {}),
    ('mega_screenshot.py', ['python3', 'tests/mega_screenshot.py', S('mega')], {}),
    ('messung_server_tick.js', ['node', 'tests/messung_server_tick.js', '8'], {}),
    ('minimap_kreuz_screenshot.py', ['python3', 'tests/minimap_kreuz_screenshot.py', 'p0'], {}),
    ('passat_haube_screenshot.py', ['python3', 'tests/passat_haube_screenshot.py', 'p0'], {}),
    ('polizei_screenshot.py', ['python3', 'tests/polizei_screenshot.py', 'p0'], {}),
    ('reparatur_screenshot.py', ['python3', 'tests/reparatur_screenshot.py', S('reparatur')], {}),
    ('ruckeln_test.py', ['python3', 'tests/ruckeln_test.py'], {}),
    ('schach3d_nah.py', ['python3', 'tests/schach3d_nah.py', 'klassisch'], {}),
    ('schach3d_shots.py', ['python3', 'tests/schach3d_shots.py', 'alle', S('schach3d')], {}),
    ('schaden_screenshot.py', ['python3', 'tests/schaden_screenshot.py', S('schaden')], {}),
    ('schilder_screenshot.py', ['python3', 'tests/schilder_screenshot.py'], {}),
    ('stunt_screenshot.py', ['python3', 'tests/stunt_screenshot.py', S('stunt')], {}),
    ('tageszeit_screenshot.py', ['python3', 'tests/tageszeit_screenshot.py'], {}),
    ('tribuenen_fps.py', ['python3', 'tests/tribuenen_fps.py', 'wiese'], {}),
    ('troc_screenshot.py', ['python3', 'tests/troc_screenshot.py', 'p0'], {}),
    ('troc_montage.py', ['python3', 'tests/troc_montage.py', 'p0'], {}),
    ('troc_dach_anim.py', ['python3', 'tests/troc_dach_anim.py', 'p0'], {}),
    ('werkstatt_v25_screenshot.py', ['python3', 'tests/werkstatt_v25_screenshot.py'], {}),
    ('wetter_screenshot.py', ['python3', 'tests/wetter_screenshot.py', S('wetter')], {}),
    ('xl_screenshot.py', ['python3', 'tests/xl_screenshot.py'], {'XL_OUT': S('xl')}),
]
START = 'schilder_screenshot.py'
gehen = False
for name, cmd, env in LISTE:
    if name == START: gehen = True
    if gehen: lauf(name, cmd, 900, env)
neu, geaendert = [], []
for w, _, fs in os.walk('tests'):
    if w.startswith('tests/out') or '__pycache__' in w or w.startswith('tests/sicherung_'): pass
    if w.startswith(AUSNAHME) or '__pycache__' in w: continue
    for fn in fs:
        if fn.startswith('p2_'): continue
        p = os.path.join(w, fn); q = os.path.join(sicherung, os.path.relpath(p, 'tests'))
        if not os.path.exists(q): neu.append(p)
        elif not filecmp.cmp(p, q, shallow=False): geaendert.append(p)
for p in neu + geaendert:
    ziel = os.path.join(MESS, 'seiteneffekt', p); os.makedirs(os.path.dirname(ziel), exist_ok=True); shutil.copy2(p, ziel)
for p in neu: os.remove(p)
for p in geaendert: shutil.copy2(os.path.join(sicherung, os.path.relpath(p, 'tests')), p)
json.dump({'neu': neu, 'geaendert': geaendert}, open(P0 + '/nachlauf_seiteneffekte.json', 'w'), indent=1)
print('FERTIG', time.strftime('%T'), 'neu', len(neu), 'geaendert', len(geaendert), flush=True)
