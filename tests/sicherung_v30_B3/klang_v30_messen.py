#!/usr/bin/env python3
"""v30 G2: Motorklang vorher/nachher messen. Aufruf: python3 tests/klang_v30_messen.py <audio-ordner> <ausgabe-ordner> [--wav]
Rendert je Profil bei Leerlauf/halb/Vollgas 3 s (feste Drehzahl) im OfflineAudioContext, misst RMS (dBFS), Energieanteil > 4 kHz,
Teiltoene (Peaks < 3 kHz, >= 10 dB ueber Umfeld, ausser Grundton-Vielfachen-Dopplung) und schreibt Ergebnis-JSON (+ WAVs)."""
import os, sys, json, base64, wave
import numpy as np
from playwright.sync_api import sync_playwright
hier = os.path.dirname(os.path.abspath(__file__))
audio = os.path.abspath(sys.argv[1]); aus = os.path.abspath(sys.argv[2]); wav = '--wav' in sys.argv
os.makedirs(aus, exist_ok=True)
SR = 44100
html = os.path.join(aus, '_messen.html')
open(html, 'w').write('<!doctype html><html><head><meta charset="utf-8"></head><body><script src="file://%s/motorProfile.js"></script><script src="file://%s/engine.js"></script></body></html>' % (audio, audio))
RENDER = '''async (a) => {
  const R = window.Rennspiel, SR = %d;
  { let s = 777; Math.random = () => { s = (s * 1664525 + 1013904223) %% 4294967296; return s / 4294967296; }; }
  const ctx = new OfflineAudioContext(1, Math.ceil(SR * a.sek), SR);
  const A = new R.AudioKlasse(); A.offlineStarten(ctx);
  A.motorAnlegen('m', { spieler: !a.ki, auto: a.id });
  const p = R.MotorProfile.fuer(a.id);
  const d = { tempo: 0, vMax: 70, gas: a.gas, dt: 1 / 60, untergrund: 'strasse', abstand: a.ki ? 12 : 0 };
  if (a.fahrt) {
    const spur = [];
    for (let i = 0; i < a.sek * 60; i++) { const t = i / 60; A._zeitTest = t;
      const T = 14; if (t < T) { d.tempo = d.vMax * Math.pow(t / T, 0.7); d.gas = 1; } else if (t < T + 5) { d.tempo = d.vMax * (1 - 0.55 * (t - T) / 5); d.gas = 0; } else { d.tempo = d.vMax * 0.45; d.gas = 0.4; }
      A.motorUpdate('m', d); }
  } else {
    d.drehzahl = a.rpm; d.tempo = 20;
    for (let i = 0; i < a.sek * 60; i++) { A._zeitTest = i / 60; A.motorUpdate('m', d); }
  }
  const buf = await ctx.startRendering();
  const f32 = buf.getChannelData(0);
  const u8 = new Uint8Array(f32.buffer.slice(0));
  let bin = ''; for (let i = 0; i < u8.length; i += 8192) bin += String.fromCharCode.apply(null, u8.subarray(i, i + 8192));
  return { b64: btoa(bin), leer: p.leerlauf, max: p.rpmMax, zyl: p.zyl, zw: A._slots && A._slots[0] ? A._slots[0].k.zw : null };
}''' % SR
def dec(r): return np.frombuffer(base64.b64decode(r['b64']), dtype='<f4').astype(np.float64)
def wavw(pf, s):
    with wave.open(pf, 'wb') as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR); w.writeframes((np.clip(s, -1, 1) * 32767).astype('<i2').tobytes())
def analyse(sig, f0):
    x = sig[SR:3 * SR]; rms = 20 * np.log10(np.sqrt(np.mean(x ** 2)) + 1e-12)
    w = x * np.hanning(len(x)); n = 1 << int(np.ceil(np.log2(len(w) * 2)))
    sp = np.abs(np.fft.rfft(w, n)) ** 2; fr = np.fft.rfftfreq(n, 1 / SR)
    hf = sp[fr > 4000].sum() / sp.sum()
    # Teiltoene: lokale Maxima 20 Hz..3 kHz, >= 10 dB ueber dem gleitenden Median (+-60 bins), mind. 0.35*f0 auseinander
    db = 10 * np.log10(sp + 1e-20); m = (fr > 15) & (fr < 3000); idx = np.where(m)[0]
    med = np.array([np.median(db[max(0, i - 80):i + 80]) for i in idx[::4]]); medf = np.interp(idx, idx[::4], med)
    pk = [i for j, i in enumerate(idx) if 2 <= j < len(idx) - 2 and db[i] > db[i - 1] and db[i] >= db[i + 1] and db[i] - medf[j] >= 10]
    pk.sort(key=lambda i: -db[i]); sel = []
    for i in pk:
        if all(abs(fr[i] - fr[j]) > max(3.0, 0.2 * f0) for j in sel): sel.append(i)
    sel = sel[:12]
    return {'rms': float(rms), 'hf': float(hf), 'teil': len(sel), 'peak': float(np.max(np.abs(x)))}
erg = {}
with sync_playwright() as p:
    b = p.chromium.launch(args=['--no-sandbox', '--autoplay-policy=no-user-gesture-required']); pg = b.new_page()
    errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto('file://' + html); pg.wait_for_timeout(300)
    ids = pg.evaluate('Rennspiel.MotorProfile.alle().map(p => p.id)')
    for pid in ids:
        if pid in ('polizei', 'krankenwagen'): continue
        info = pg.evaluate('(i)=>{const p=Rennspiel.MotorProfile.fuer(i);return [p.leerlauf,p.rpmMax,p.zyl]}', pid)
        l, mx, z = info
        for last, rpm, gas in (('leerlauf', l, 0.05), ('niedrig', l + 0.2 * (0.9 * mx - l), 0.4), ('halb', (l + 0.9 * mx) / 2, 0.6), ('voll', 0.9 * mx, 1.0)):
            r = pg.evaluate(RENDER, {'id': pid, 'sek': 3, 'rpm': rpm, 'gas': gas})
            s = dec(r); f0 = rpm / 60 * z / 2
            e = analyse(s, f0); e['f0'] = f0; erg['%s_%s' % (pid, last)] = e
            if wav: wavw(os.path.join(aus, 'klang_%s_%s.wav' % (pid, last)), s)
    # KI-Pfad (Entfernung 12 m), Vollgas
    for pid in ('passat', 'porsche-911', 'formel'):
        r = pg.evaluate(RENDER, {'id': pid, 'sek': 3, 'rpm': 0.8 * pg.evaluate('(i)=>Rennspiel.MotorProfile.fuer(i).rpmMax', pid), 'gas': 1.0, 'ki': True})
        erg['KI_' + pid] = analyse(dec(r), 100); erg['KI_' + pid]['zw'] = r['zw']
    # Fahrt 22 s: Klickmass = max |2. Differenz| / RMS
    for pid in ('passat', 'porsche-911', 'amg-gt', 'formel'):
        r = pg.evaluate(RENDER, {'id': pid, 'sek': 22, 'fahrt': True, 'gas': 1})
        s = dec(r); d2 = np.abs(np.diff(s, 2)); erg['fahrt_' + pid] = {'klick': float(d2.max() / (np.sqrt(np.mean(s ** 2)) + 1e-12)), 'peak': float(np.max(np.abs(s))), 'rms': float(20 * np.log10(np.sqrt(np.mean(s ** 2)))) }
        if wav: wavw(os.path.join(aus, 'fahrt_%s.wav' % pid), s)
    erg['_fehler'] = errs
json.dump(erg, open(os.path.join(aus, 'messung.json'), 'w'), indent=1)
for k, v in erg.items():
    if k != '_fehler': print(k, {a: (round(c, 4) if not isinstance(c, dict) else c) for a, c in v.items()})
print('Fehler:', errs)
