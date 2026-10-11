// Node-Test Start-Boost (Fenster-Logik deterministisch) + Sterne-Wertung: node tests/test_startboost.js
const { ladeModule } = require('./lade');
const R = ladeModule(['src/config.js', 'src/race/startBoost.js', 'src/race/sterne.js']);
let fehler = 0;
function pruefe(name, ok, info) { console.log((ok ? 'OK   ' : 'FEHL ') + name + (info ? '  (' + info + ')' : '')); if (!ok) fehler++; }
const dt = 1 / 60;

/** Spielt einen Start durch: gasVon/gasBis = Zeitraum (relativ zu LOS) in dem Gas gedrückt ist. Gibt { ereignis, zeit, ergebnis, sb }. */
function start(gasVon, gasBis, opt) {
  const sb = new R.StartBoost(1, opt);
  let ereignis = null, zeitEreignis = null;
  for (let k = -Math.round(3 / dt); k < Math.round(3 / dt); k++) {
    const trel = k * dt + 1e-9;
    const gas = trel >= gasVon - 1e-6 && trel <= gasBis + 1e-6;
    if (sb.offen(0)) { const e = sb.eingabe(0, gas ? 1 : 0, trel); if (e) { ereignis = e; zeitEreignis = trel; } }
    if (trel >= 0) sb.schritt(dt);
  }
  return { ereignis, zeit: zeitEreignis, ergebnis: sb.ergebnis(0), sb };
}
const HALTEN = 99;

// --- Fenster ---
let r = start(-0.2, HALTEN);
pruefe('Gas 0,20 s vor LOS gehalten → Boost (bei LOS)', r.ereignis === 'boost' && r.zeit >= 0 && r.zeit < 0.03, r.ereignis);
r = start(-0.25, HALTEN);
pruefe('Gas genau 0,25 s vor LOS → Boost (Fensterrand)', r.ereignis === 'boost');
r = start(-0.30, HALTEN);
pruefe('Gas 0,30 s vor LOS gehalten → „Zu früh"', r.ereignis === 'zufrueh' && r.ergebnis === 'zufrueh', r.ereignis);
r = start(-2.5, HALTEN);
pruefe('Gas schon im Countdown (−2,5 s) → „Zu früh"', r.ereignis === 'zufrueh');
r = start(0.0, HALTEN);
pruefe('Gas genau bei LOS → Boost', r.ereignis === 'boost');
r = start(0.10, HALTEN);
pruefe('Gas 0,10 s nach LOS → Boost (Zeit ≈ 0,10)', r.ereignis === 'boost' && Math.abs(r.zeit - 0.10) < 0.02, String(r.zeit));
r = start(0.15, HALTEN);
pruefe('Gas 0,15 s nach LOS → Boost (Fensterrand)', r.ereignis === 'boost');
r = start(0.25, HALTEN);
pruefe('Gas 0,25 s nach LOS → normaler Start (kein Boost, keine Verzögerung)', r.ereignis === null && r.ergebnis === 'normal' && !r.sb.gasSperre(0), String(r.ergebnis));
r = start(5, HALTEN);
pruefe('Gas nie gedrückt → normaler Start', r.ereignis === null && r.ergebnis === 'normal');
r = start(-1.0, -0.5);
{ // früh gedrückt, aber wieder losgelassen; dann im Fenster erneut
  const sb = new R.StartBoost(1); let ev = null;
  for (let k = -Math.round(3 / dt); k < Math.round(1 / dt); k++) {
    const trel = k * dt + 1e-9, gas = (trel >= -1.0 && trel <= -0.5) || trel >= -0.1;
    if (sb.offen(0)) { const e = sb.eingabe(0, gas ? 1 : 0, trel); if (e) ev = e; }
  }
  pruefe('Früh gedrückt, losgelassen, im Fenster neu gedrückt → Boost', ev === 'boost');
}
pruefe('Früh gedrückt und vor LOS losgelassen, danach nie → normal', r.ereignis === null && r.ergebnis === 'normal', String(r.ergebnis));

// --- Dauer, Faktoren, Verzögerung ---
{
  const sb = new R.StartBoost(2);
  for (let k = -60; k < 0; k++) sb.eingabe(0, k > -10, k * dt);       // Gas ab −10 Schritten = −0,17 s
  const e = sb.eingabe(0, 1, 0);
  pruefe('Boost-Start bei LOS, Faktoren 1,2/1,2', e === 'boost' && sb.faktoren(0).vMax === 1.2 && sb.faktoren(0).beschleunigung === 1.2);
  let t = 0; while (sb.boostAktiv(0) && t < 5) { sb.schritt(dt); t += dt; }
  pruefe('Boost dauert 1,5 s', Math.abs(t - 1.5) < 0.03, t.toFixed(3) + ' s');
  pruefe('danach Faktoren wieder 1/1', sb.faktoren(0).vMax === 1 && sb.faktoren(0).beschleunigung === 1);
  pruefe('anderes Auto unbeeinflusst (Faktor 1)', sb.faktoren(1).vMax === 1 && !sb.boostAktiv(1));
}
{
  const sb = new R.StartBoost(1);
  for (let k = -100; k < 0; k++) sb.eingabe(0, 1, k * dt);
  const e = sb.eingabe(0, 1, 0);
  pruefe('Zu früh: Gas 1,0 s gesperrt', e === 'zufrueh' && sb.gasSperre(0));
  let t = 0; while (sb.gasSperre(0) && t < 5) { sb.schritt(dt); t += dt; }
  pruefe('Sperre endet nach 1,0 s, kein Boost', Math.abs(t - 1.0) < 0.03 && !sb.boostAktiv(0), t.toFixed(3) + ' s');
  pruefe('Entscheidung fällt nur einmal (danach null)', sb.eingabe(0, 1, 1.0) === null);
}
{ // Spieler 1 und 2 unabhängig
  const sb = new R.StartBoost(2);
  for (let k = -30; k < 0; k++) { sb.eingabe(0, 1, k * dt); sb.eingabe(1, k > -5, k * dt); }
  const e0 = sb.eingabe(0, 1, 0), e1 = sb.eingabe(1, 1, 0);
  pruefe('Zwei Spieler unabhängig: P1 zu früh, P2 Boost', e0 === 'zufrueh' && e1 === 'boost' && sb.gasSperre(0) && !sb.gasSperre(1) && sb.boostAktiv(1));
}

// --- KI ---
{
  const chance = (f) => new R.StartBoost(1).kiChance(f);
  pruefe('KI-Chance sinkt mit dem Fehler-Anteil (unschlagbar > legende > mittel > leicht)',
    chance(0) > chance(0.01) && chance(0.01) > chance(0.15) && chance(0.15) > chance(0.25), [0, 0.01, 0.15, 0.25].map(chance).map(x => x.toFixed(2)).join(' / '));
  const zaehle = (fehler, n) => { let b = 0; for (let k = 0; k < n; k++) { const sb = new R.StartBoost(1, { seed: 100 + k }); sb.eingabe(0, 0, -0.5, { fehler }); if (sb.eingabe(0, 0, 0, { fehler }) === 'boost') b++; } return b / n; };
  const pLeicht = zaehle(0.25, 400), pMittel = zaehle(0.15, 400), pUn = zaehle(0, 400);
  pruefe('KI-Würfeln: leicht ≈ 15 %, mittel ≈ 47 %, unschlagbar ≈ 95 % (±8 %)',
    Math.abs(pLeicht - 0.15) < 0.08 && Math.abs(pMittel - 0.47) < 0.08 && Math.abs(pUn - 0.95) < 0.08, [pLeicht, pMittel, pUn].map(x => x.toFixed(2)).join(' / '));
  const a = new R.StartBoost(3, { seed: 5 }), b = new R.StartBoost(3, { seed: 5 });
  const lauf = (sb) => [0, 1, 2].map(i => sb.eingabe(i, 0, 0, { fehler: 0.15 }) || sb.ergebnis(i)).join(',');
  pruefe('KI-Würfeln deterministisch (gleicher Seed → gleiches Ergebnis)', lauf(a) === lauf(b));
  const sb = new R.StartBoost(1); sb.eingabe(0, 1, -2, { fehler: 0 });
  pruefe('KI wird vor LOS nie entschieden und nie „zu früh" bestraft', sb.offen(0) && !sb.gasSperre(0));
}

// --- Sterne ---
const S = R.Sterne;
pruefe('Sterne: Platz 1 = 3', S.bewerten(1, true, 200, 125) === 3);
pruefe('Sterne: Platz 2 und 3 = 2', S.bewerten(2, true, 200, 125) === 2 && S.bewerten(3, true, 200, 125) === 2);
pruefe('Sterne: Platz 4, Runde unter Zielzeit = 2', S.bewerten(4, true, 120, 125) === 2);
pruefe('Sterne: Platz 4, Runde über Zielzeit = 1', S.bewerten(4, true, 130, 125) === 1 && S.bewerten(8, true, null, 125) === 1);
pruefe('Sterne: nicht angekommen = 0', S.bewerten(1, false, 100, 125) === 0);
pruefe('Sterne: Zielzeit je Strecke/Tempo-Klasse', S.zielzeit({ zielRundenzeit: 100 }, 'normal') === 100 && Math.abs(S.zielzeit({ zielRundenzeit: 100 }, 'schnell') - 90) < 1e-9 && S.zielzeit({}, 'normal') === null);
// localStorage-Attrappe
const store = {};
R.Sterne.KEY !== undefined && pruefe('Sterne: Schlüssel rennspiel.sterne.v1', S.KEY === 'rennspiel.sterne.v1');
const R2 = ladeModule(['src/config.js', 'src/race/sterne.js']);
const w = global; // vm-Sandbox hat kein localStorage → Rückfall im Speicher
pruefe('Sterne: ohne localStorage Rückfall im Speicher (gutschreiben/summe)', R2.Sterne.gutschreiben('Emmy', 3) === 3 && R2.Sterne.gutschreiben('Emmy', 2) === 5 && R2.Sterne.summe('Emmy') === 5 && R2.Sterne.summe('Jonas') === 0);
pruefe('Sterne: Text ⭐⭐⭐', S.text(3) === '⭐⭐⭐' && S.text(0) === '');
{
  const sandbox = { console, Math, performance: { now: () => Date.now() }, localStorage: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } } };
  const fs = require('fs'), vm = require('vm');
  sandbox.window = sandbox; vm.createContext(sandbox);
  ['src/config.js', 'src/race/sterne.js'].forEach(f => vm.runInContext(fs.readFileSync(f, 'utf8'), sandbox));
  const SS = sandbox.Rennspiel.Sterne;
  SS.gutschreiben('Jonas', 3); SS.gutschreiben('Jonas', 1);
  pruefe('Sterne: localStorage rennspiel.sterne.v1 = {"Jonas":4}', store['rennspiel.sterne.v1'] === '{"Jonas":4}' && SS.summe('Jonas') === 4, store['rennspiel.sterne.v1']);
  store['rennspiel.sterne.v1'] = 'kaputt{';
  pruefe('Sterne: kaputter Speicher → 0, kein Fehler', SS.summe('Jonas') === 0 && SS.gutschreiben('Jonas', 2) === 2);
}

console.log(fehler === 0 ? '\nALLE TESTS OK' : '\n' + fehler + ' FEHLER');
process.exit(fehler === 0 ? 0 : 1);
