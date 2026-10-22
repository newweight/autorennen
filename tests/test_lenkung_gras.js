// v32 N2: Lenkung im Gras (auch nach Crash/Öl, mit Schaden, mit Fahrhilfe) – node tests/test_lenkung_gras.js
// Misst die Gierrate bei vollem Lenkeinschlag (Mittel über 0,3–1,0 s, Tempo gehalten) für den aktuellen Stand (NACHHER)
// und für den Stand vor N2 (VORHER = tests/sicherung_v32_B/{config,vehicle}.js) und prüft:
//  - Asphalt/Rand/Öl auf der Straße: exakt wie vorher (alle Autos, 3–60 m/s, mit/ohne Schaden, mit Fahrhilfe)
//  - Gras: Gierrate ≥ 60 % der Asphalt-Gierrate (gleiches Auto, gleiches Tempo, ohne Schaden), Schaden 0–4, Fahrhilfe aus/wenig/viel
//  - Gras während Crash-/Öl-Drehung: Lenkwirkung ≥ 50 % Asphalt; Drehung (Öl-Status) endet nach ≤ 2 s
const { ladeModule } = require('./lade');
const fs = require('fs'), path = require('path');
const NEU = ladeModule(['src/config.js', 'src/physics/vehicle.js', 'src/cars/carCatalog.js']);
const altDa = fs.existsSync(path.join(__dirname, 'sicherung_v32_B', 'vehicle.js'));
const ALT = altDa ? ladeModule(['tests/sicherung_v32_B/config.js', 'tests/sicherung_v32_B/vehicle.js', 'src/cars/carCatalog.js']) : null;
let fehler = 0, ok = 0;
function pruefe(name, bed, info) { if (bed) ok++; else { fehler++; console.log('FEHL ' + name + (info ? '  (' + info + ')' : '')); } }

const autos = NEU.carCatalog ? NEU.carCatalog.filter((a) => a.fahrwerte) : [];
const fahrwerte = autos.length ? autos.map((a) => ({ id: a.id, fw: a.fahrwerte })) : [{ id: 'standard', fw: {} }];

/** Gierrate (rad/s, > 0 = in Lenkrichtung) bei Lenkung lenk; o = { fw, v, ug, stufe, hilfe, winkel, seite, dreh, oel } */
function gier(R, o, lenk) {
  const dt = R.config.physik.schritt;
  const v = new R.Vehicle(o.fw || {}, { tempoKlasse: 'normal' });
  if (o.stufe) { const f = 1 - 0.03 * o.stufe; v.daten = Object.assign({}, v.daten, { grip: v.daten.grip * f }); }
  v.setzen(0, 0, o.winkel || 0);
  v.untergrund = o.ug || 'strasse'; v._ugAlt = v.untergrund;
  v.untergrundMisch = v.untergrund === 'gras' || v.untergrund === 'sand' ? 1 : undefined;
  v.vLaengs = o.v;
  if (o.oel) { const O = R.config.physik.schleudern.oel; v.drehImpuls = o.oel; v.drehLenk = O.lenkung; v.drehAb = O.abklingen; v.drehErhalt = O.weltErhalt; }
  if (o.dreh) v.drehImpuls = o.dreh;
  const H = o.hilfe ? R.config.fahrhilfen[o.hilfe] : null;
  const hilfe = H && H.lenkhilfe > 0 ? { lenkhilfe: H.lenkhilfe, bremshilfe: 0, tangente: { tx: 0, tz: -1 }, seitenabstand: o.seite || 10, zieltempo: 99 } : undefined;
  let g = 0, n = 0;
  const T0 = 0.3, T = o.T || 0.7, N0 = Math.round(T0 / dt), N = Math.round((T0 + T) / dt);
  for (let k = 0; k < N; k++) {
    const hAlt = v.heading;
    v.schritt(dt, { gas: v.vLaengs < o.v ? 1 : 0, bremse: 0, lenkung: lenk }, hilfe);
    if (k >= N0) { g += -(v.heading - hAlt) / dt * Math.sign(lenk || 1); n++; }
  }
  return g / n;
}
/** Lenkwirkung = Gier(lenk) − Gier(0) in Lenkrichtung (für Drehungen: was die Lenkung ausmacht) */
function wirkung(R, o, lenk) { return gier(R, o, lenk) - gier(R, o, 0) * Math.sign(lenk); }
const p = (x) => (100 * x).toFixed(0) + '%';

// ---- 1) Asphalt, Rand, Öl auf der Straße: unverändert (Asphalt-Fahrgefühl + KI-Planung) ----
if (ALT) {
  let max = 0, faelle = 0;
  for (const { fw } of fahrwerte) for (const ug of ['strasse', 'rand', 'oel']) for (const v of [3, 8, 15, 25, 40, 60]) for (const st of [0, 3]) for (const lenk of [1, -0.5]) {
    const o = { fw, v, ug, stufe: st };
    max = Math.max(max, Math.abs(gier(NEU, o, lenk) - gier(ALT, o, lenk))); faelle++;
    const a = new NEU.Vehicle(fw, { tempoKlasse: 'normal' }), b = new ALT.Vehicle(fw, { tempoKlasse: 'normal' });
    a.untergrund = b.untergrund = ug;
    max = Math.max(max, Math.abs(a.drehrateMax(v) - b.drehrateMax(v)));
  }
  // Fahrhilfe auf Asphalt + Rempel-Drehung auf Asphalt
  for (const { fw } of fahrwerte) for (const v of [8, 15, 30]) for (const w of [-0.8, 0, 0.8]) for (const lenk of [1, -1]) {
    const o = { fw, v, hilfe: 'viel', winkel: w, seite: 4 }, o2 = { fw, v, dreh: 4.7 };
    max = Math.max(max, Math.abs(gier(NEU, o, lenk) - gier(ALT, o, lenk)), Math.abs(gier(NEU, o2, lenk) - gier(ALT, o2, lenk))); faelle += 2;
  }
  pruefe('Asphalt/Rand/Öl/Fahrhilfe/Rempler auf der Straße unverändert (' + faelle + ' Fälle)', max < 1e-12, 'max Abweichung ' + max);
}

// ---- 2) Tabelle Standard-Auto (Passat-ähnlich), VORHER / NACHHER in % der Asphalt-Gierrate ----
const zeilen = [
  ['Gras', { ug: 'gras' }], ['Gras + Schaden 2', { ug: 'gras', stufe: 2 }], ['Gras + Schaden 4', { ug: 'gras', stufe: 4 }],
  ['Öl (Straße)', { ug: 'oel' }],
  ['Gras + Öl-Drehung', { ug: 'gras', oel: -2.4, wirk: true }], ['Gras + Crash-Drehung', { ug: 'gras', dreh: -4.7, wirk: true }],
  ['Gras + Crash + Schaden 4', { ug: 'gras', dreh: -4.7, stufe: 4, wirk: true }],
  ['Gras + Hilfe viel 0° (links)', { ug: 'gras', hilfe: 'viel', lenk: -1 }], ['Gras + Hilfe viel 0° (rechts)', { ug: 'gras', hilfe: 'viel' }],
  ['Gras + Hilfe viel 45° (links)', { ug: 'gras', hilfe: 'viel', winkel: 0.8, lenk: -1 }],
  ['Gras + Hilfe viel 80° S4 (links)', { ug: 'gras', hilfe: 'viel', winkel: 1.4, stufe: 4, lenk: -1 }],
];
console.log('Gierrate bei vollem Einschlag in % der Asphalt-Gierrate (Standard-Auto), VORHER → NACHHER');
const tempi = [5, 10, 15, 25];
console.log('  ' + ''.padEnd(34) + tempi.map((v) => (v + ' m/s').padStart(13)).join(''));
console.log('  ' + 'Asphalt rad/s'.padEnd(34) + tempi.map((v) => gier(NEU, { v }, 1).toFixed(2).padStart(13)).join(''));
for (const [name, o] of zeilen) {
  const zelle = (v) => {
    const a = gier(NEU, { v }, 1), oo = Object.assign({ v }, o), l = o.lenk || 1;
    const f = (R) => (o.wirk ? wirkung(R, oo, l) : gier(R, oo, l)) / a;
    return ((ALT ? p(f(ALT)) + '→' : '') + p(f(NEU))).padStart(13);
  };
  console.log('  ' + name.padEnd(34) + tempi.map(zelle).join(''));
}

// ---- 3) Gras: alle Autos, Schaden 0–4, Fahrhilfe aus/wenig/viel, beide Richtungen ≥ 60 % Asphalt ----
{
  let schlecht = null, n = 0;
  for (const { id, fw } of fahrwerte) for (const v of [3, 5, 8, 10, 12, 15]) {
    const a = gier(NEU, { fw, v }, 1);
    for (const st of [0, 2, 4]) for (const hilfe of [null, 'wenig', 'viel']) for (const w of hilfe ? [-1.4, -0.8, 0, 0.8, 1.4] : [0]) for (const lenk of [1, -1]) {
      const r = gier(NEU, { fw, v, ug: 'gras', stufe: st, hilfe, winkel: w }, lenk) / a; n++;
      if (!schlecht || r < schlecht.r) schlecht = { r, id, v, st, hilfe, w, lenk };
    }
  }
  pruefe('Gras: Gierrate ≥ 60 % Asphalt (' + n + ' Fälle, alle Autos, Schaden 0–4, Fahrhilfe, beide Richtungen)', schlecht.r >= 0.6,
    'schlechtester ' + p(schlecht.r) + ' ' + JSON.stringify(schlecht));
  console.log('Gras schlechtester Fall nachher: ' + p(schlecht.r) + ' (' + schlecht.id + ', ' + schlecht.v + ' m/s, Schaden ' + schlecht.st + ', Hilfe ' + schlecht.hilfe + ')');
  // Sand ebenso (abseits)
  let sMin = 9;
  for (const { fw } of fahrwerte) for (const v of [5, 10, 13]) sMin = Math.min(sMin, gier(NEU, { fw, v, ug: 'sand' }, 1) / gier(NEU, { fw, v }, 1));
  pruefe('Sand: Gierrate ≥ 60 % Asphalt', sMin >= 0.6, p(sMin));
}

// ---- 4) Gras während Drehung (Crash/Öl, gegen und mit der Lenkung): Lenkwirkung ≥ 50 % Asphalt ----
{
  let min = 9, wo = '';
  for (const { id, fw } of fahrwerte) for (const v of [5, 10, 15]) {
    const a = gier(NEU, { fw, v }, 1);
    for (const d of [{ dreh: 4.7 }, { dreh: -4.7 }, { oel: 2.4 }, { oel: -2.4 }]) for (const st of [0, 4]) {
      const r = wirkung(NEU, Object.assign({ fw, v, ug: 'gras', stufe: st, T: 0.5 }, d), 1) / a;
      if (r < min) { min = r; wo = id + ' ' + v + ' m/s ' + JSON.stringify(d) + ' S' + st; }
    }
  }
  pruefe('Gras + Crash/Öl-Drehung: Lenkwirkung ≥ 50 % Asphalt', min >= 0.5, p(min) + ' ' + wo);
}

// ---- 5) Öl-/Crash-Drehung endet (kein Dauerzustand) und danach lenkt das Auto wie normal im Gras ----
{
  const R = NEU, dt = R.config.physik.schritt;
  for (const art of ['oel', 'crash']) {
    const v = new R.Vehicle({}, { tempoKlasse: 'normal' });
    v.setzen(0, 0, 0); v.vLaengs = 15; v.untergrund = 'strasse'; v._ugAlt = 'strasse';
    if (art === 'oel') { v.untergrund = 'oel'; v.schritt(dt, { gas: 1, bremse: 0, lenkung: 0.5 }); }
    else v.drehImpuls = 4.7;
    pruefe(art + ': Drehung beginnt', Math.abs(v.drehImpuls) > 0.5, v.drehImpuls.toFixed(2));
    v.untergrund = 'gras'; v.untergrundMisch = 1;
    let t = 0;
    while (v.drehImpuls && t < 5) { v.schritt(dt, { gas: 1, bremse: 0, lenkung: 1 }); t += dt; }
    pruefe(art + ': Drehung endet nach ≤ 2 s (im Gras)', !v.drehImpuls && v.drehLenk === undefined && t <= 2, t.toFixed(2) + ' s');
    const vv = v.vLaengs, ref = new R.Vehicle({}, { tempoKlasse: 'normal' });
    ref.untergrund = 'gras';
    pruefe(art + ': danach volle Gras-Drehrate', Math.abs(v.drehrateMax(vv) - ref.drehrateMax(vv)) < 1e-9);
  }
}
// ---- 6) Server = Client: dieselbe Datei (server/simulation.js lädt src/physics/vehicle.js) ----
{
  const sim = fs.readFileSync(path.join(__dirname, '..', 'server', 'simulation.js'), 'utf8');
  pruefe('Server lädt src/physics/vehicle.js + src/config.js (gleiche Formel)', sim.includes("'src/physics/vehicle.js'") && sim.includes("'src/config.js'"));
}
console.log((fehler ? 'FEHLER ' : 'ALLES OK ') + ok + ' OK, ' + fehler + ' FEHL');
process.exit(fehler ? 1 : 0);
