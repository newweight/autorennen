// S2 – Tuning mit Goldstücken (Auto + Motorrad): node tests/test_spass_s2.js
//  A) Preise/Kaufen/Rückgabe: steigend, erste Stufe früh, Kreisprozess (kaufen → zurück) ändert das Konto nicht, Höchststufe, zu wenig Geld
//  B) Wirkung klein und fair: höchstens +8 % Tempo/Anzug/Grip, +10 % Bremsen; messbar (0→100, Höchsttempo, Bremsweg, Querbeschleunigung)
//  C) „Aus“ = bitgleich: Stufen 0 verändern nichts (daten, Fahrverlauf 20 s bitgleich)
//  D) KI: gleichwertiges Tuning je Schwierigkeit
//  E) Speicher je Fahrer und Fahrzeug, Schalter (Standard an), Säuberung von Nachrichten, Sticker
//  F) Server (Auto und Motorrad): Raum-Schalter aus = bitgleich zu ohne; an = Stufen geklemmt, startInfo meldet sie, KI gleichwertig; Server = Client (zwei Kontexte bitgleich)
'use strict';
const { ladeModule } = require('./lade');
const { Simulation, kontextLaden, laden, MODULE, ladenMoto } = require('../server/simulation');

let fehler = 0, ok = 0;
setTimeout(() => { console.log('FEHL Wächter: Test hängt (> 300 s) – Abbruch'); process.exit(3); }, 300000).unref();
function pruefe(name, gut, info) { console.log((gut ? 'OK   ' : 'FEHL ') + name + (info !== undefined ? '  (' + info + ')' : '')); if (gut) ok++; else fehler++; }

const DATEIEN = ['src/config.js', 'src/physics/vehicle.js', 'src/cars/carCatalog.js', 'src/ui/garage.js', 'src/spass/spassTuning.js', 'src/spass/spassSticker.js'];
const R = ladeModule(DATEIEN);
const T = R.SpassTuning, G = R.Garage, C = R.config.spass.tuning, dt = R.config.physik.schritt;
const katalog = R.carCatalog.waehlbare();
const AUTO = katalog[0].id;

// ---------------------------------------------------------------- A) Preise, Kaufen, Rückgabe
{
  G._ramLeeren && G._ramLeeren(); T._ramLeeren();
  const P = C.preise;
  pruefe('A fünf Stufen, Preise streng steigend', P.length === 5 && C.max === 5 && P.every((p, i) => i === 0 || p > P[i - 1]), P.join(','));
  pruefe('A erste Stufe nach einem Rennen möglich (≤ Preisgeld Platz 1)', P[0] <= G.preisgeld(1), P[0] + ' ≤ ' + G.preisgeld(1));
  pruefe('A Preis-Funktion: Stufe 0..4 = Preis, Stufe 5 = voll (null)', T.preis(0) === P[0] && T.preis(4) === P[4] && T.preis(5) === null);
  let r = T.kaufen('Anna', AUTO, 'motor');
  pruefe('A ohne Goldstücke: kein Kauf (grund geld)', !r.ok && r.grund === 'geld' && T.stufen('Anna', AUTO).motor === 0);
  G.gutschreiben('Anna', 1000);
  let summe = 0;
  for (let i = 0; i < 5; i++) { const k = G.konto('Anna'); r = T.kaufen('Anna', AUTO, 'motor'); summe += r.kosten; if (!r.ok || G.konto('Anna') !== k - P[i]) { pruefe('A Kauf Stufe ' + (i + 1), false, JSON.stringify(r)); } }
  pruefe('A 5 Stufen gekauft: Konto stimmt (Summe der Preise)', G.konto('Anna') === 1000 - P.reduce((s, p) => s + p, 0) && summe === 250 && T.stufen('Anna', AUTO).motor === 5, G.konto('Anna'));
  r = T.kaufen('Anna', AUTO, 'motor');
  pruefe('A Stufe 6 gibt es nicht (grund max), nichts abgebucht', !r.ok && r.grund === 'max' && G.konto('Anna') === 750);
  r = T.rueckgaengig('Anna', AUTO, 'motor');
  pruefe('A Rückgängig: Preis der letzten Stufe zurück', r.ok && r.rueck === P[4] && G.konto('Anna') === 750 + P[4] && T.stufen('Anna', AUTO).motor === 4, JSON.stringify(r));
  T.kaufen('Anna', AUTO, 'reifen'); T.kaufen('Anna', AUTO, 'reifen'); T.kaufen('Anna', AUTO, 'bremsen');
  const vorher = G.konto('Anna'), invest = T.investiert(4) + T.investiert(2) + T.investiert(1);
  r = T.zuruecksetzen('Anna', AUTO);
  pruefe('A Alles zurücksetzen: alle Goldstücke zurück, Stufen 0', r.ok && r.rueck === invest && G.konto('Anna') === vorher + invest && T.summe(T.stufen('Anna', AUTO)) === 0, r.rueck + ' / ' + invest);
  pruefe('A Kreisprozess: Konto wieder 1000', G.konto('Anna') === 1000, G.konto('Anna'));
  r = T.rueckgaengig('Anna', AUTO, 'motor');
  pruefe('A nichts zum Zurückgeben → ok false, Konto gleich', !r.ok && G.konto('Anna') === 1000);
  pruefe('A unbekannte Art / leerer Name: kein Kauf', !T.kaufen('Anna', AUTO, 'quatsch').ok && !T.kaufen('', AUTO, 'motor').ok);
  // „Voll getunt“-Meldung
  G.gutschreiben('Berta', 5000); let voll = null;
  for (const a of T.ARTEN) for (let i = 0; i < 5; i++) { const x = T.kaufen('Berta', AUTO, a); if (x.ok) voll = x.voll; }
  pruefe('A voll getunt (alle 3 × 5): Kauf meldet voll', voll === true && T.summe(T.stufen('Berta', AUTO)) === 15);
}

// ---------------------------------------------------------------- B) Wirkung klein und fair
{
  const max = { motor: 5, reifen: 5, bremsen: 5 }, f = T.faktoren(max);
  pruefe('B Höchststufen: Tempo und Anzug +8 %, Grip +8 %, Bremsen +10 % (nicht mehr)', Math.abs(f.vMax - 1.08) < 1e-9 && Math.abs(f.beschleunigung - 1.08) < 1e-9 && Math.abs(f.grip - 1.08) < 1e-9 && Math.abs(f.bremsen - 1.10) < 1e-9, JSON.stringify(f));
  pruefe('B Stufe 1 ist spürbar klein (+1,6 % Tempo)', Math.abs(T.faktoren({ motor: 1, reifen: 0, bremsen: 0 }).vMax - 1.016) < 1e-9);
  pruefe('B Stufen 0 → keine Faktoren (null)', T.faktoren({ motor: 0, reifen: 0, bremsen: 0 }) === null && T.faktoren(null) === null);
  const neu = () => new R.Vehicle(R.carCatalog.finde(AUTO).fahrwerte, { tempoKlasse: 'schnell' });
  const a = neu(), b = neu(); T.anwenden(b, max);
  const mess = (v) => {
    const gerade = { gas: 1, bremse: 0, lenkung: 0 }; let t = 0;
    while (v.vLaengs * 3.6 < 100 && t < 40) { v.schritt(dt, gerade); t += dt; }
    const t100 = t;
    for (let i = 0; i < 60 * 80; i++) v.schritt(dt, gerade);
    const vm = v.vLaengs; let w = 0; v.vLaengs = Math.min(v.vLaengs, 50);
    const v0 = v.vLaengs; while (v.vLaengs > 0 && w < 2000) { v.schritt(dt, { gas: 0, bremse: 1, lenkung: 0 }); w += Math.max(0, v.vLaengs) * dt; }
    return { t100, vm, weg: w, v0, quer: v.querBeschleunigungMax(40, 'strasse') };
  };
  const ma = mess(a), mb = mess(b);
  pruefe('B schneller beschleunigt (0→100 km/h kürzer)', mb.t100 < ma.t100, ma.t100.toFixed(2) + ' → ' + mb.t100.toFixed(2) + ' s');
  pruefe('B Höchsttempo höher, aber höchstens +8 %', mb.vm > ma.vm * 1.02 && mb.vm <= ma.vm * 1.0801, (ma.vm * 3.6).toFixed(0) + ' → ' + (mb.vm * 3.6).toFixed(0) + ' km/h');
  pruefe('B Bremsweg kürzer', mb.weg < ma.weg, ma.weg.toFixed(1) + ' → ' + mb.weg.toFixed(1) + ' m');
  pruefe('B Querbeschleunigung (Grip) höher, höchstens +8,1 %', mb.quer > ma.quer && mb.quer <= ma.quer * 1.0801, (mb.quer / ma.quer).toFixed(4));
  const c = neu(); const ok1 = T.anwenden(c, max), ok2 = T.anwenden(c, max);
  pruefe('B zweimal anwenden rechnet nur einmal', ok1 === true && ok2 === false && Math.abs(c.daten.vMax - b.daten.vMax) < 1e-12);
}

// ---------------------------------------------------------------- C) Aus = bitgleich
{
  const neu = () => new R.Vehicle(R.carCatalog.finde(AUTO).fahrwerte, { tempoKlasse: 'normal' });
  const lauf = (modus) => {
    const v = neu();
    if (modus === 'null') T.anwenden(v, { motor: 0, reifen: 0, bremsen: 0 });
    if (modus === 'leer') T.anwenden(v, null);
    let h = '';
    for (let k = 0; k < 60 * 20; k++) { v.schritt(dt, { gas: 1, bremse: k % 400 > 300 ? 1 : 0, lenkung: Math.sin(k / 50) * 0.6 }); if (k % 20 === 0) h += v.x + '|' + v.z + '|' + v.vLaengs + '|' + v.heading + ';'; }
    return { h, d: JSON.stringify(v.daten), t: v.tuning };
  };
  const o = lauf('ohne'), n = lauf('null'), l = lauf('leer');
  pruefe('C Stufen 0 / null: Fahrwerte und 20-s-Fahrverlauf bitgleich wie ohne Tuning', o.h === n.h && o.h === l.h && o.d === n.d && o.d === l.d && n.t === undefined);
  // Haken im Rennstart: Schalter aus → nichts
  T._ramLeeren(); G.gutschreiben('Cleo', 500); for (let i = 0; i < 3; i++) T.kaufen('Cleo', AUTO, 'motor');
  const v = neu(), vor = JSON.stringify(v.daten), f = { vehicle: v, mesh: null };
  T.anSetzen(false); T.fuerTeilnehmer({}, f, 0, true, { spieler: 1, autoIds: [AUTO], schwierigkeit: 'mittel' }, ['Cleo'], { id: AUTO });
  pruefe('C Menü-Schalter aus: Haken ändert nichts', JSON.stringify(v.daten) === vor && !f.tuning);
  T.anSetzen(true); const opt = { spieler: 1, autoIds: [AUTO], schwierigkeit: 'mittel', tuning: false };
  T.fuerTeilnehmer({}, f, 0, true, opt, ['Cleo'], { id: AUTO });
  pruefe('C opt.tuning false (Rennen ohne): Haken ändert nichts', JSON.stringify(v.daten) === vor);
  T.fuerTeilnehmer({}, f, 0, true, { spieler: 1, autoIds: [AUTO], schwierigkeit: 'mittel' }, ['Cleo'], { id: AUTO });
  pruefe('C Schalter an + Stufen: Haken wirkt (vMax +4,8 %)', f.tuning && f.tuning.motor === 3 && Math.abs(v.daten.vMax / JSON.parse(vor).vMax - 1.048) < 1e-9);
  T._ramLeeren();
}

// ---------------------------------------------------------------- D) KI gleichwertig
{
  const m = [{ motor: 5, reifen: 5, bremsen: 5 }];
  const ki = (s) => T.kiStufen(m, s);
  pruefe('D keine getunten Menschen → Computer ohne Tuning (null)', T.kiStufen([{ motor: 0, reifen: 0, bremsen: 0 }], 'mittel') === null && T.kiStufen([], 'schwer') === null);
  pruefe('D Mensch voll getunt: Leicht 2, Mittel 3, Schwer 4, Profi bis Unschlagbar 5', ki('leicht').motor === 2 && ki('mittel').motor === 3 && ki('schwer').motor === 4 && ki('profi').motor === 5 && ki('unschlagbar').motor === 5, ['leicht', 'mittel', 'schwer', 'profi', 'unschlagbar'].map((s) => ki(s).motor).join(','));
  pruefe('D nie mehr als der Mensch (Mittel über zwei Menschen 5 und 0 → 3·0,6)', T.kiStufen([{ motor: 5, reifen: 0, bremsen: 0 }, { motor: 0, reifen: 0, bremsen: 3 }], 'unschlagbar').motor === 3);
  pruefe('D Stufen immer in 0..5', ['leicht', 'mittel', 'schwer', 'profi', 'meister', 'legende', 'unschlagbar'].every((s) => T.ARTEN.every((k) => ki(s)[k] >= 0 && ki(s)[k] <= 5)));
}

// ---------------------------------------------------------------- E) Speicher, Schalter, Säuberung, Sticker
{
  T._ramLeeren(); G.gutschreiben('Dora', 900);
  T.kaufen('Dora', AUTO, 'motor'); T.kaufen('Dora', katalog[1].id, 'reifen'); T.kaufen('Dora', katalog[1].id, 'reifen');
  pruefe('E Stufen je Fahrzeug getrennt gespeichert', T.stufen('Dora', AUTO).motor === 1 && T.stufen('Dora', katalog[1].id).reifen === 2 && T.stufen('Dora', AUTO).reifen === 0 && T.summe(T.stufen('Emil', AUTO)) === 0);
  T.speichern({ Dora: { [AUTO]: { motor: 99, reifen: -4, bremsen: 'x' } } });
  const s = T.stufen('Dora', AUTO);
  pruefe('E Speicher mit Unsinn wird geklemmt (99→5, −4→0, Text→0)', s.motor === 5 && s.reifen === 0 && s.bremsen === 0, JSON.stringify(s));
  T._ramLeeren(); pruefe('E Schalter „Tuning“ Standard AN, umschaltbar', T.an() === true && (T.anSetzen(false), T.an() === false) && (T.anSetzen(true), T.an() === true));
  pruefe('E Nachricht säubern: Liste [m,r,b] geklemmt, Müll → null', JSON.stringify(T.saeubern([9, -1, 2.7])) === '{"motor":5,"reifen":0,"bremsen":2}' && T.saeubern('x') === null && T.saeubern(null) === null && JSON.stringify(T.alsListe(T.saeubern({ motor: 1, reifen: 2, bremsen: 3 }))) === '[1,2,3]');
  const SK = R.SpassSticker;
  pruefe('E Sticker „Erstes Tuning“ und „Voll getunt“ im Katalog beider Spiele', ['auto', 'motorrad'].every((sp) => ['tuning1', 'tuningVoll'].every((id) => SK.katalog(sp).some((k) => k.id === id))));
  SK.zurueck('auto'); SK.zurueck('motorrad');
  let neu = SK.ereignis('auto', 'tuning', { voll: false });
  pruefe('E erstes Tuning → Sticker „Erstes Tuning“ (nur im Auto-Album)', neu.length === 1 && neu[0].id === 'tuning1' && SK.hat('auto', 'tuning1') && !SK.hat('motorrad', 'tuning1'));
  neu = SK.ereignis('auto', 'tuning', { voll: false });
  pruefe('E nochmal Tuning → kein zweiter Sticker', neu.length === 0);
  neu = SK.ereignis('motorrad', 'tuning', { voll: true });
  pruefe('E voll getunt → beide Sticker (Motorrad)', neu.map((k) => k.id).sort().join() === 'tuning1,tuningVoll');
  SK.zurueck('auto'); SK.zurueck('motorrad');
}

// ---------------------------------------------------------------- F) Server
{
  const einst = (tuning, extra) => Object.assign({ streckeId: 'wiese', gegner: 2, runden: 2, schwierigkeit: 'mittel', zufall: false, spass: false, tuning }, extra || {});
  const autoId = 'troc-cabrio';
  for (const moto of [false, true]) {
    const t = moto ? 'Motorrad' : 'Auto', fz = moto ? 'superbike' : autoId, R0 = moto ? ladenMoto() : laden();
    const extra = moto ? { unfall: 'aus' } : {};
    const sp = (tuning) => [{ fahrer: R0.config.fahrerStandard[0], auto: fz, hilfe: 'wenig', tuning }];
    const neu = (tuning, spielerTuning) => new Simulation({ einstellungen: einst(tuning, extra), spieler: sp(spielerTuning), seed: 7, moto });
    const lauf = (sim, n) => {
      for (let k = 0; k < n; k++) { sim.eingabeSetzen(0, { gas: 1, bremse: 0, lenkung: Math.sin(k / 70) * 0.4 }); sim.schritt(); sim.abholen(); }
      return JSON.stringify(sim.sim.fahrzeuge.map((f) => [f.vehicle.x, f.vehicle.z, f.vehicle.vLaengs, f.vehicle.heading]));
    };
    const ohne = neu(undefined, undefined), aus = neu(false, [5, 5, 5]), an0 = neu(true, [0, 0, 0]), an = neu(true, [5, 5, 5]), an2 = neu(true, [5, 5, 5]);
    pruefe('F ' + t + ': Raum-Schalter fehlt/aus → Einstellung tuning false; startInfo ohne Tuning-Werte', ohne.einstellungen.tuning === false && aus.einstellungen.tuning === false && aus.startInfo().teilnehmer.every((x) => x.tuning === undefined));
    pruefe('F ' + t + ': Schalter AUS, Spieler hat Tuning → Fahrwerte wie ohne (bitgleich)', JSON.stringify(aus.sim.fahrzeuge[0].vehicle.daten) === JSON.stringify(ohne.sim.fahrzeuge[0].vehicle.daten));
    pruefe('F ' + t + ': Schalter AN, Stufen 0 → alles wie ohne', JSON.stringify(an0.sim.fahrzeuge.map((f) => f.vehicle.daten)) === JSON.stringify(ohne.sim.fahrzeuge.map((f) => f.vehicle.daten)));
    const n = 600 + 60 * 8, a = lauf(ohne, n), b = lauf(aus, n), c0 = lauf(an0, n);
    pruefe('F ' + t + ': Fahrverlauf 14 s: aus und „an mit 0 Stufen“ bitgleich zu ohne (alle Fahrzeuge)', a === b && a === c0);
    const vd = (s, i) => s.sim.fahrzeuge[i].vehicle.daten, v0 = vd(ohne, 0);
    pruefe('F ' + t + ': Schalter AN [5,5,5]: Spieler getunt (Tempo +8 %, Grip +8 %, Bremsen +10 %)', Math.abs(vd(an, 0).vMax / v0.vMax - 1.08) < 1e-9 && Math.abs(vd(an, 0).grip / v0.grip - 1.08) < 1e-9 && Math.abs(vd(an, 0).bremsen / v0.bremsen - 1.1) < 1e-9);
    const info = an.startInfo().teilnehmer;
    pruefe('F ' + t + ': startInfo meldet Spieler [5,5,5] und Computer gleichwertig (Mittel: 3,3,3)', JSON.stringify(info[0].tuning) === '[5,5,5]' && JSON.stringify(info[1].tuning) === '[3,3,3]' && JSON.stringify(info[2].tuning) === '[3,3,3]', JSON.stringify(info.map((x) => x.tuning)));
    pruefe('F ' + t + ': Computer wirklich getunt (vMax über dem Katalogwert)', vd(an, 1).vMax > vd(ohne, 1).vMax * 1.04 && vd(an, 1).vMax <= vd(ohne, 1).vMax * 1.0481);
    const klem = new Simulation({ einstellungen: einst(true, extra), spieler: sp([99, -5, 2.6]), seed: 7, moto });
    pruefe('F ' + t + ': Server klemmt Stufen (99,−5,2,6 → 5,0,2)', JSON.stringify(klem.startInfo().teilnehmer[0].tuning) === '[5,0,2]', JSON.stringify(klem.startInfo().teilnehmer[0].tuning));
    const l1 = lauf(an, n), l2 = lauf(an2, n);
    pruefe('F ' + t + ': zwei Server-Läufe mit Tuning bitgleich (deterministisch)', l1 === l2 && l1 !== a);
    pruefe('F ' + t + ': getuntes Auto kommt weiter (Wirkung im Server)', JSON.parse(l1)[0][2] > JSON.parse(a)[0][2] || Math.hypot(JSON.parse(l1)[0][0], JSON.parse(l1)[0][1]) !== Math.hypot(JSON.parse(a)[0][0], JSON.parse(a)[0][1]));
    // Server = Client: Browser-Weg (Vehicle + anwenden mit den gesendeten Stufen); Auto im getrennten Kontext, Motorrad im Motorrad-Kontext
    const RB = moto ? R0 : kontextLaden(MODULE.slice(0, MODULE.indexOf('src/track/megastrecke.js') + 1));
    const auto = RB.carCatalog.waehlbare().find((x) => x.id === fz) || RB.carCatalog.waehlbare()[0];
    const cv = new RB.Vehicle(auto.fahrwerte, { tempoKlasse: an.einstellungen.tempoKlasse });
    RB.SpassTuning.anwenden(cv, RB.SpassTuning.saeubern(info[0].tuning));
    pruefe('F ' + t + ': Server = Client: Fahrwerte bitgleich (Browser-Kontext, gleiche Stufen)', JSON.stringify(cv.daten) === JSON.stringify(vd(an, 0)));
    const sv = new RB.Vehicle(auto.fahrwerte, { tempoKlasse: an.einstellungen.tempoKlasse }); RB.SpassTuning.anwenden(sv, RB.SpassTuning.saeubern(info[0].tuning));
    cv.setzen(0, 0, 0); sv.setzen(0, 0, 0); let gl = true;
    for (let k = 0; k < 600; k++) { const s = { gas: 1, bremse: k % 300 > 250 ? 1 : 0, lenkung: Math.sin(k / 40) * 0.5 }; cv.schritt(dt, s); sv.schritt(dt, s); if (cv.x !== sv.x || cv.z !== sv.z || cv.vLaengs !== sv.vLaengs) gl = false; }
    pruefe('F ' + t + ': zwei Fahrzeuge (Server-/Browser-Weg) 10 s bitgleich', gl);
  }
}

console.log('\nS2 Tuning: OK ' + ok + ', FEHL ' + fehler);
process.exit(fehler ? 1 : 0);
