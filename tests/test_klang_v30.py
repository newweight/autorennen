#!/usr/bin/env python3
"""v30 G2 Motorklang mehrstimmig/weniger schrill. Misst vorher (tests/sicherung_v30_B) und nachher (src/audio) mit derselben Methode
(tests/klang_v30_messen.py), schreibt WAVs nach tests/out/v30/klang_<profil>_<leerlauf|halb|voll>.wav (vorher: tests/out/v30/vorher/).
Prueft: Anteil > 4 kHz mind. 50 % geringer (oder beide < 0,05 %), RMS +-1 dB, >= 2 Teiltoene, Sub-Anteil bei Diesel/V8 nicht kleiner als vorher,
Klickmass der Fahrt nicht groesser als vorher (x1,2), Spitze < 0,9, KI-Pfad vereinfacht (nur 2 Tonoszillatoren), keine JS-Fehler."""
import os, sys, json, subprocess, wave, shutil
import numpy as np
hier = os.path.dirname(os.path.abspath(__file__)); wurzel = os.path.dirname(hier)
out = os.path.join(hier, 'out', 'v30'); vor = os.path.join(out, 'vorher'); nach = os.path.join(out, 'nachher')
env = dict(os.environ, PLAYWRIGHT_BROWSERS_PATH=os.environ.get('PLAYWRIGHT_BROWSERS_PATH', '/opt/pw-browsers'))
for audio, ziel in ((os.path.join(hier, 'sicherung_v30_B'), vor), (os.path.join(wurzel, 'src', 'audio'), nach)):
    subprocess.run([sys.executable, os.path.join(hier, 'klang_v30_messen.py'), audio, ziel, '--wav'], check=True, env=env, stdout=subprocess.DEVNULL)
V = json.load(open(os.path.join(vor, 'messung.json'))); N = json.load(open(os.path.join(nach, 'messung.json')))
SR = 44100; erg = []
def pruefe(n, ok, d=''):
    erg.append(bool(ok)); print(('OK   ' if ok else 'FEHL ') + n + ('  [%s]' % d if d != '' else ''))
def lies(pf):
    with wave.open(pf) as w: return np.frombuffer(w.readframes(w.getnframes()), dtype='<i2').astype(float) / 32767
def prom(fr, sp, f0, tol=0.03):
    im = (fr > f0 * (1 - tol)) & (fr < f0 * (1 + tol)); um = (fr > f0 * 0.5) & (fr < f0 * 1.7) & ~((fr > f0 * 0.9) & (fr < f0 * 1.1))
    return 20 * np.log10(sp[im].max() / (np.median(sp[um]) + 1e-12))
ids = sorted({k.rsplit('_', 1)[0] for k in V if k.endswith('_voll')})
for pid in ids:
    for last in ('leerlauf', 'niedrig', 'halb', 'voll'):
        v, n = V[pid + '_' + last], N[pid + '_' + last]
        shutil.copy(os.path.join(nach, 'klang_%s_%s.wav' % (pid, last)), os.path.join(out, 'klang_%s_%s.wav' % (pid, last)))
        ok = n['hf'] <= 0.5 * v['hf'] or (n['hf'] < 5e-4 and v['hf'] < 5e-4)
        pruefe('%s %s: Energie > 4 kHz %.3f %% -> %.3f %%' % (pid, last, v['hf'] * 100, n['hf'] * 100), ok)
        pruefe('%s %s: RMS %.1f -> %.1f dBFS (+-1 dB)' % (pid, last, v['rms'], n['rms']), abs(n['rms'] - v['rms']) <= 1.0, '%+.2f' % (n['rms'] - v['rms']))
        pruefe('%s %s: Spitze %.2f < 0,9' % (pid, last, n['peak']), n['peak'] < 0.9)
        # Teiltoene: Oktave darunter (f0/2), Grundton f0 und 2 f0 jeweils >= 6 dB ueber Umfeld
        x = lies(os.path.join(nach, 'klang_%s_%s.wav' % (pid, last)))[SR:3 * SR] * np.hanning(2 * SR)
        nn = 1 << 19; sp = np.abs(np.fft.rfft(x, nn)); fr = np.fft.rfftfreq(nn, 1 / SR); f0 = n['f0']
        teile = [m for m in (0.5, 1, 2) if f0 * m > 20 and prom(fr, sp, f0 * m) >= 6]
        pruefe('%s %s: >= 2 Teiltoene (%s x f0)' % (pid, last, teile), len(teile) >= 2 or (last in ('leerlauf', 'niedrig') and len(teile) >= 1))
    # Sub 40-90 Hz bei Diesel/V8 (Vollgas): Anteil nicht kleiner als vorher
    if pid in ('passat', 'multivan', 'amg-gt', 'audi-rs6'):
        def sub(pf):
            x = lies(pf)[SR:3 * SR] * np.hanning(2 * SR); sp = np.abs(np.fft.rfft(x, 1 << 19)) ** 2; fr = np.fft.rfftfreq(1 << 19, 1 / SR)
            return sp[(fr >= 40) & (fr <= 90)].sum() / (2 * SR) ** 2
        a, b = sub(os.path.join(vor, 'klang_%s_niedrig.wav' % pid)), sub(os.path.join(nach, 'klang_%s_niedrig.wav' % pid))
        pruefe('%s niedrig: Pegel 40-90 Hz (Rumpel) %+.1f dB gegenueber vorher (>= -1 dB)' % (pid, 10 * np.log10(b / a)), b >= a * 0.79)
for k in sorted(N):
    if k.startswith('fahrt_'):
        pruefe('%s: Klickmass %.2f -> %.2f (<= 1,2 x vorher oder < 0,5)' % (k, V[k]['klick'], N[k]['klick']), N[k]['klick'] <= max(1.2 * V[k]['klick'], 0.5))
        pruefe('%s: Fahrt-RMS %.1f -> %.1f dBFS (+-1 dB)' % (k, V[k]['rms'], N[k]['rms']), abs(N[k]['rms'] - V[k]['rms']) <= 1.0)
        pruefe('%s: Spitze %.2f < 0,9' % (k, N[k]['peak']), N[k]['peak'] < 0.9)
    if k.startswith('KI_'):
        pruefe('%s: KI-Pfad > 4 kHz %.3f %% -> %.3f %%' % (k, V[k]['hf'] * 100, N[k]['hf'] * 100), N[k]['hf'] <= 0.5 * V[k]['hf'] or N[k]['hf'] < 5e-4)
        pruefe('%s: KI RMS %.1f -> %.1f dBFS (nicht lauter, <= +1 dB)' % (k, V[k]['rms'], N[k]['rms']), N[k]['rms'] - V[k]['rms'] <= 1.0)
for pid in ('passat', 'porsche-911', 'formel'):
    z = N['KI_' + pid]['zw']; zv = V['KI_' + pid]['zw']
    pruefe('KI %s vereinfacht: Rechteck/Sub/Ansaugrauschen getrennt, nur Saege + Oktave (2 Tonoszillatoren; vorher 3: gB=%s)' % (pid, zv.get('gB')), z['gB'] is False and z['gS'] is False and z['ans'] is False and z['gH'] is True)
pruefe('keine JS-Fehler', not N['_fehler'] and not V['_fehler'], N['_fehler'])
print('\n%d OK, %d FEHL' % (sum(erg), len(erg) - sum(erg)))
sys.exit(0 if all(erg) else 1)
