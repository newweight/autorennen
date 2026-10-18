// v31 H1: node tests/test_looping_aussen.js [kurz]
// „Looping: Autos fahren irgendwann außen“ – 11 Teilnehmer (2 Spieler-Autopiloten + 9 KI) × 5 Seeds × 3 Runden auf Fantasie
// (Welt Alles/Verrückt, Server-Simulation = main.js physikSchritt, mit Rempeln, Tieren, teils Geisterfahrer/Krankenwagen/Abschleppwagen).
// Prüft je Durchfahrt (Positionslog tests/looping_log.js): ab Höhe 0,3 m liegt die Auto-Mitte höchstens bandHalb − 1 m von der Bandmitte
// (Auto-Rand nie über der Bandkante), Looping-Pose = Physik-Position (Bodenspur), kein Sturz/Reset im Looping, niemand fährt unten durch,
// alle Durchfahrten geschafft. Dazu Einheitenprüfung autoQ (stetig, klemmt nichts, was schon im Band liegt).
const { lauf } = require('./looping_log.js');
const { ladeModule } = require('./lade');
const R = ladeModule(['src/config.js', 'src/physics/vehicle.js', 'src/cars/carCatalog.js', 'src/track/spline.js', 'src/track/trackCatalog.js', 'src/track/trackBuilder.js', 'src/track/looping.js']);
let fehler = 0;
function pruefe(name, ok, info) { console.log((ok ? 'OK   ' : 'FEHL ') + name + (info ? '  (' + info + ')' : '')); if (!ok) fehler++; }

// ---- Einheit: autoQ (v31 H1d: linear gleiten, ≤ 0,5 m je Schritt, KI-Einstiegsspur nie außerhalb des Bands) ----
{
  const st = new R.Strecke(R.trackCatalog.find(t => t.id === 'fantasie')), L = st.loopings[0], LP = R.Looping;
  let startOk = true, rate = 0, ende = true, spurOk = true, info = '';
  for (let q0 = -6; q0 <= 6.001; q0 += 0.5) {
    const lp = { qEin: q0 }; let alt = LP.autoQ(L, lp, 0);
    if (Math.abs(alt - q0) > 1e-9) startOk = false;
    for (let w = 0.0125; w <= 2 * Math.PI; w += 0.0125) {            // 0,0125 rad = 0,5 m Bogen = 1 Schritt bei 40 m/s (r = 12 m → 0,055 rad); hier feiner, Rate je rad zählt
      const q = LP.autoQ(L, lp, w), bq = LP.bandQ(L, w), h = L.radius * (1 - Math.cos(w));
      rate = Math.max(rate, Math.abs(q - alt) / 0.0125); alt = q;
      if (w > 1.5 && Math.abs(q - bq) > 1e-9) ende = false;                  // nach ≈ 86° auf der Bandmitte
      if (Math.abs(q0 - LP.bandQ(L, 0)) <= L.bandHalb - 1 + 1e-9 && h > 0.3 && Math.abs(q - bq) > L.bandHalb - 1 + 1e-9) { spurOk = false; info = 'q0 ' + q0 + ' w ' + w.toFixed(3); }
    }
  }
  pruefe('autoQ: Start = Einfahrtsposition (qEin −6 … +6)', startOk);
  pruefe('autoQ: ≤ 0,5 m je Schritt bis 40 m/s (max. ' + rate.toFixed(2) + ' m/rad · 0,055 rad = ' + (rate * 0.055).toFixed(2) + ' m)', rate * 0.055 <= 0.5 + 1e-9, rate.toFixed(2) + ' m/rad');
  pruefe('autoQ: nach ≈ 86° liegt jedes Auto auf der Bandmitte', ende);
  pruefe('autoQ: wer auf der Einstiegsspur (Bandmitte ± (bandHalb − 1)) einfährt, liegt ab 0,3 m Höhe nie neben dem Band', spurOk, info);
}

// ---- 11 Teilnehmer × Seeds × 3 Runden ----
const kurz = process.argv[2] === 'kurz';
const laeufe = [
  { seed: 1, welt: 'alles', tiere: true, geister: false },
  { seed: 2, welt: 'verrueckt', tiere: true, geister: true },
  { seed: 3, welt: 'alles', tiere: false, geister: false, stufe: 'schwer' },
  { seed: 4, welt: 'alles', tiere: true, geister: true, stufe: 'leicht' },
  { seed: 6, welt: 'alles', tiere: true, geister: false, stufe: 'unschlagbar' },
  { seed: 5, welt: 'verrueckt', tiere: true, geister: false, klasse: 'schnell' },
].slice(0, kurz ? 1 : 6);
for (const o of laeufe) {
  const e = lauf(Object.assign({ n: 11, runden: 3 }, o));
  const p = e.paesse || [];
  const bez = `[seed ${o.seed} ${o.welt}${o.tiere ? ' Tiere' : ''}${o.geister ? ' Verkehr' : ''}${o.stufe ? ' ' + o.stufe : ''}${o.klasse ? ' ' + o.klasse : ''}] 11 Teilnehmer × 3 Runden: `;
  pruefe(bez + p.length + ' Looping-Durchfahrten, alle geschafft, kein Sturz, kein Reset im Looping', p.length >= 40 && e.gefallen === 0 && e.resetsImLooping === 0 && e.geschafft + e.nochDrin === e.eintritte, `Einfahrten ${e.eintritte}, geschafft ${e.geschafft}, gestürzt ${e.gefallen}, bei Rennende noch drin ${e.nochDrin}`);
  pruefe(bez + 'keiner verlässt die Röhre: Auto-Mitte ab 0,3 m Höhe nie weiter als bandHalb − 1 m von der Bandmitte (Ausnahme: Auto wich im Anflug aus bzw. kam sehr knapp daneben an → gleitet aufs Band; ≤ 8 % der Durchfahrten)', p.filter(x => x.ueber > 1.0 && !x.veto).length === 0 && p.filter(x => x.ueber > 1e-6).length <= Math.ceil(p.length * 0.08), `außen: ${p.filter(x => x.ueber > 1e-6).length} von ${p.length} (davon beim Anflug ausgewichen/fuehren() ausgesetzt: ${p.filter(x => x.ueber > 1e-6 && x.veto).length}), ohne Ausweichen > 1 m: ${p.filter(x => x.ueber > 1.0 && !x.veto).length}, größter Überstand ${Math.max(0, ...p.map(x => x.ueber)).toFixed(2)} m (gleitend ≤ 0,5 m/Schritt)`);
  pruefe(bez + 'Looping-Pose = Physik-Position (Bodenspur) auf ± 0,5 m', e.maxPoseDiff < 0.5, e.maxPoseDiff.toFixed(3) + ' m');
  pruefe(bez + 'kein Auto fährt unten durch / unter dem Looping', e.unterLooping.length === 0, JSON.stringify(e.unterLooping.slice(0, 3)));
  pruefe(bez + 'Fang ohne Ruck: Querversatz je Physikschritt (Gerade ≤ 0,4 m, im Looping ≤ 0,5 m; Gerade: max. ' + e.maxFuehr + ' m in ' + e.nFuehr + ' Schritten; im Looping: max. ' + (e.maxDq || 0) + ' m)', (e.maxDq || 0) <= 0.5 && e.maxFuehr <= 0.4 + 1e-6 && e.nFuehr > 0, '');
  console.log('INFO ' + bez + 'qEin-Verteilung: ' + [-6, -4, -2, 0, 2, 4, 6].map(k => k + ':' + p.filter(x => Math.round(x.qEin / 2) * 2 === k).length).join(' ') + ', Ziel ' + e.imZiel + '/11, ' + e.zeit.toFixed(0) + ' s');
}
console.log(fehler ? '\n' + fehler + ' FEHLER' : '\nALLE OK');
process.exit(fehler ? 1 : 0);
