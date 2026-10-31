// Node-Test Looping-Schub (STARTFEHLER): node tests/test_looping_schub.js
// Fahrzeuge, deren Höchsttempo das Looping-Mindesttempo nicht erreicht (Motorrad-Roller, Tempo-Klasse „normal“, 84 km/h < 87 km/h),
// bekommen am Looping-Anlauf (src/track/anlauf.js) einen automatischen Schub auf Mindesttempo + 5 % statt in der Anlauf-Bremse zu hängen.
//   a) Roller schafft beide Loopings der Fantasie-Strecke UND eines Loopings einer Editor-Strecke – Mensch (Vollgas + Spurhalter) und KI (Driver).
//   b) Schnelle Fahrzeuge: bitgleich wie ohne Schub (config.anlauf.schubSchwelle = 0 → alter Weg), nie ein 'schub'-Ereignis.
//   c) Deterministisch: zwei Läufe liefern denselben Hash (Server = Client = Vorhersage rechnen dieselbe Funktion).
//   d) Autorennen (ohne Roller): kein einziges Fahrzeug bekommt Schub.
const { ladenMoto, laden } = require('../server/simulation');
const RM = ladenMoto(), RA = laden();
let fehler = 0;
function pruefe(name, ok, info) { console.log((ok ? 'OK   ' : 'FEHL ') + name + (info ? '  (' + info + ')' : '')); if (!ok) fehler++; }
const dt = RM.config.physik.schritt;

function hashZahl(h, x) { const b = Buffer.alloc(8); b.writeDoubleLE(x); for (const z of b) { h ^= z; h = Math.imul(h, 16777619) >>> 0; } return h; }

/** Ein Lauf von der Anlaufposition mit Vollgas + Spurhalter (Mensch) bzw. Driver (KI). Liefert Ergebnis + Hash. */
function lauf(R, strecke, st, fahrwerte, klasse, art, stufe) {
  const sp = strecke.spline, LP = R.Looping, AN = R.Anlauf;
  const pose = AN.position(strecke, st, [], null);
  const v = new R.Vehicle(fahrwerte, { tempoKlasse: klasse });
  v.setzen(pose.x, pose.z, pose.heading);
  const lp = LP.zustand(), az = AN.zustand();
  let drv = null;
  if (art === 'ki') drv = new R.Driver(v, strecke, { schwierigkeit: stufe || 'mittel', seed: 7, name: 'KI' });
  let index = -1, ev = [], h = 2166136261, eintritt = null, schubSchritte = 0, vMaxSeen = 0;
  for (let k = 0; k < 60 * 40; k++) {
    let s;
    if (art === 'ki') {
      s = drv.steuerung(dt, { andere: [], spielerFortschrittMax: null, eigenerFortschritt: 0, laeuft: true });
      if (index >= 0 || true) { const n = strecke.abfrage(v.x, v.z, index); s = AN.kiHilfe(az, v, strecke, n, s); }
    } else {
      const n = sp.naechster(v.x, v.z), p = sp.punktBei(n.s + 4);
      const fe = R.Vehicle.winkelDiff(v.heading, R.headingAus(p.tx, p.tz));
      s = { gas: 1, bremse: 0, lenkung: Math.max(-1, Math.min(1, fe * 2.5 - n.seitenabstand * 0.08)) };
    }
    const r = LP.fahrzeugSchritt(lp, v, strecke, s, dt, index, az); index = r.index;
    if (r.ereignis) ev.push(r.ereignis);
    if (r.ereignis === 'start') eintritt = lp.v;
    if (az.schub) schubSchritte++;
    vMaxSeen = Math.max(vMaxSeen, v.vLaengs);
    h = hashZahl(hashZahl(hashZahl(h, v.x), v.z), v.vLaengs);
    if (r.ereignis === 'geschafft' || r.ereignis === 'gefallen') break;
  }
  return { ev, lp, az, eintritt, h, schubSchritte, vMaxSeen, v };
}

// ---- Strecken: Fantasie (Katalog) + Editor-Strecke mit Looping
function editorStrecke(R) {
  const E = R.Editor, pkt = [];
  const rad = 420;
  for (let i = 0; i < 160; i++) { const t = (i / 160) * 2 * Math.PI * 0.97; pkt.push([rad * Math.cos(t) * (1 + 0.15 * Math.sin(2 * t)), rad * Math.sin(t)]); }
  const vv = E.verarbeiten(pkt);
  if (!vv.ok) return null;
  const d = E.neu(vv.pkt, 'Schub-Test', 'wiese');
  const L = E.geometrie(d).laenge; let gesetzt = 0;
  for (let s = 200; s < L - 250 && gesetzt < 1; s += 25) { const st = E.setzen(d, 'looping', s); if (st.ok) gesetzt++; }
  if (!gesetzt) return null;
  d.id = 'eigen-schub'; E.registrieren(d);
  return new R.Strecke(R.trackCatalog.find((t) => t.id === 'eigen-schub'));
}

const fantasie = new RM.Strecke(RM.trackCatalog.find((t) => t.id === 'fantasie'));
const editor = editorStrecke(RM);
pruefe('Editor-Strecke mit Looping lässt sich bauen', !!editor && editor.loopings && editor.loopings.length >= 1, editor ? editor.loopings.length + ' Looping(s)' : 'keine');

const roller = RM.carCatalog.find((a) => a.id === 'roller');
pruefe('Roller im Motorrad-Katalog; Klasse „normal“ erreicht das Looping-Mindesttempo nie', !!roller);
const rn = new RM.Vehicle(roller.fahrwerte, { tempoKlasse: 'normal' });
pruefe('Roller (normal): vMax < Looping-Mindesttempo der Fantasie', rn.daten.vMax < fantasie.loopings[0].vMin, (rn.daten.vMax * 3.6).toFixed(0) + ' < ' + (fantasie.loopings[0].vMin * 3.6).toFixed(0) + ' km/h');

// ---- a) Roller schafft jedes Looping: Mensch und KI, alle Tempo-Klassen
for (const [name, str] of [['Fantasie', fantasie], ['Editor-Strecke', editor]]) {
  if (!str) continue;
  const stellen = RM.Anlauf.stellen(str).filter((s) => s.art === 'looping');
  stellen.forEach((st, nr) => {
    for (const art of ['mensch', 'ki']) {
      for (const k of Object.keys(RM.config.tempoKlassen)) {
        const e = lauf(RM, str, st, roller.fahrwerte, k, art);
        const langsam = k === 'normal';
        const gut = e.lp.geschafft === 1 && e.lp.gefallen === 0 && e.az.eingriffe === 0 && e.eintritt >= st.vMin - 1e-6 &&
          (langsam ? e.ev.includes('schub') : !e.ev.includes('schub'));
        pruefe(`${name} Looping ${nr + 1}: Roller/${k} ${art === 'ki' ? 'KI' : 'Mensch'} → geschafft, keine Anlauf-Bremse, ${langsam ? 'mit „Looping-Schub“' : 'ohne Schub'}`, gut,
          `Einfahrt ${e.eintritt ? (e.eintritt * 3.6).toFixed(0) : '-'} km/h (vMin ${(st.vMin * 3.6).toFixed(0)}), Ereignisse ${[...new Set(e.ev)].join(',')}, Bremse-Eingriffe ${e.az.eingriffe}`);
      }
    }
  });
}

// ---- b) Schnelle Fahrzeuge: bitgleich mit/ohne Schub-Code
{
  const stellen = RM.Anlauf.stellen(fantasie).filter((s) => s.art === 'looping');
  let alle = 0, gleich = 0, schubDa = 0, schlecht = [];
  const klassen = Object.keys(RM.config.tempoKlassen);
  for (const auto of RM.carCatalog) for (const k of klassen) {
    const vM = new RM.Vehicle(auto.fahrwerte, { tempoKlasse: k }).daten.vMax;
    if (vM < stellen[0].vMin * RM.config.anlauf.schubSchwelle) continue;      // die bekommen Schub (siehe a)
    for (const art of ['mensch', 'ki']) {
      const mit = lauf(RM, fantasie, stellen[0], auto.fahrwerte, k, art);
      const alt = RM.config.anlauf.schubSchwelle; RM.config.anlauf.schubSchwelle = 0;
      const ohne = lauf(RM, fantasie, stellen[0], auto.fahrwerte, k, art);
      RM.config.anlauf.schubSchwelle = alt;
      alle++; if (mit.h === ohne.h) gleich++; else schlecht.push(auto.id + '/' + k + '/' + art);
      if (mit.ev.includes('schub') || mit.schubSchritte) schubDa++;
    }
  }
  pruefe(`Schnelle Fahrzeuge (vMax ≥ Mindesttempo × 1,05): bitgleich mit und ohne Schub-Code (${alle} Läufe), nie ein Schub`, alle > 0 && gleich === alle && schubDa === 0,
    `${gleich}/${alle} gleich, Schub ${schubDa}×` + (schlecht.length ? ' | ' + schlecht.slice(0, 5).join('; ') : ''));
}

// ---- c) Deterministisch
{
  const st = RM.Anlauf.stellen(fantasie).filter((s) => s.art === 'looping')[0];
  const a = lauf(RM, fantasie, st, roller.fahrwerte, 'normal', 'mensch'), b = lauf(RM, fantasie, st, roller.fahrwerte, 'normal', 'mensch');
  const c = lauf(RM, fantasie, st, roller.fahrwerte, 'normal', 'ki'), d = lauf(RM, fantasie, st, roller.fahrwerte, 'normal', 'ki');
  pruefe('Looping-Schub deterministisch (zwei Läufe, Mensch und KI, derselbe Hash)', a.h === b.h && c.h === d.h && a.schubSchritte > 0, `Schub-Schritte ${a.schubSchritte}`);
  pruefe('Schub-Ziel = Mindesttempo + 5 %, kein Überschwingen', a.vMaxSeen <= st.vMin * 1.05 + 0.5, `max ${(a.vMaxSeen * 3.6).toFixed(0)} km/h, Ziel ${(st.vMin * 1.05 * 3.6).toFixed(0)} km/h`);
}

// ---- d) Autorennen: nie Schub
{
  const str = new RA.Strecke(RA.trackCatalog.find((t) => t.id === 'fantasie'));
  const stellen = RA.Anlauf.stellen(str).filter((s) => s.art === 'looping');
  let alle = 0, schub = 0;
  for (const auto of RA.carCatalog) for (const k of Object.keys(RA.config.tempoKlassen)) {
    const e = lauf(RA, str, stellen[0], auto.fahrwerte, k, 'mensch'); alle++; if (e.ev.includes('schub') || e.schubSchritte) schub++;
  }
  pruefe(`Autorennen: kein Auto bekommt Looping-Schub (${alle} Läufe)`, schub === 0, schub + '×');
}

console.log(fehler === 0 ? '\nALLE TESTS OK' : '\n' + fehler + ' FEHLER');
process.exit(fehler ? 1 : 0);
