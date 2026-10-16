// 13.10. (v16) Reset vor Looping/Schanze – node tests/test_reset_anlauf.js [streckeId] [--diag]
// Problem (VERLAUF „Runde 7“, Abschlepp-Flake): Wird ein Auto am letzten Checkpoint zurückgesetzt und liegt dieser näher als der
// Anlauf-Abstand VOR einem Looping/einer Schanze, steht es aus dem Stand ohne ausreichend Anlauf → Anlauf-Bremse stoppt es,
// KI wartet 2 s und setzt sich selbst zurück, Spieler muss R drücken.
// Prüfung: für jede Strecke × Welt × Variante mit Loopings/Schanzen und JEDEN Checkpoint (jede Stelle, die ein Reset je sein kann):
//   Reset des Autos (echtes main.js zuruecksetzen auf der kopflosen Server-Simulation) → KI bzw. Spieler mit Vollgas fährt aus dem Stand
//   → schafft die nächste Stelle (Looping/Schanze) OHNE Anlauf-Bremse und OHNE erneuten Reset. Dazu: Reset-Punkt höchstens 150 m hinter
//   dem Checkpoint (Spieler wird nicht weit zurückgeworfen) und nie mehr als 150 m vor/hinter dem Anlauf-Abstand.
// Mit --diag werden auch die durchgefallenen Fälle einzeln ausgegeben; ohne Fehlschlag nur Zusammenfassung je Strecke.
const { Simulation } = require('../server/simulation.js');
const diag = process.argv.includes('--diag');
const nurId = process.argv.slice(2).find(a => !a.startsWith('--'));
const sim0 = new Simulation({ einstellungen: { streckeId: 'wiese', gegner: 0 }, spieler: [{ fahrer: 'T', auto: 'passat' }], seed: 1 });
const R = sim0.R;
if (process.argv.includes('--ohne-fix')) R.Anlauf.resetPosition = () => null;   // Vergleich: Verhalten vor v16
let fehler = 0;
function pruefe(name, ok, info) { console.log((ok ? 'OK   ' : 'FEHL ') + name + (info ? '  (' + info + ')' : '')); if (!ok) fehler++; }
const dt = R.config.physik.schritt;
const MAX_ZURUECK = 150;   // m: so weit darf der Reset-Punkt hinter dem Checkpoint liegen (Spieler nicht weit zurückwerfen)

/** Spieler mit Vollgas: Pure Pursuit auf der Straße, nie Bremse. */
function spielerSteuerung(st, v, idx) {
  const n = st.abfrage(v.x, v.z, idx), sp = st.spline;
  const vl = Math.max(3, v.vLaengs), L = Math.max(9, Math.min(50, 0.55 * vl + 8));
  const ziel = sp.punktBei(n.s + L);
  let diff = R.headingAus(ziel.x - v.x, ziel.z - v.z) - v.heading;
  while (diff > Math.PI) diff -= 2 * Math.PI;
  while (diff < -Math.PI) diff += 2 * Math.PI;
  const lenkung = Math.max(-1, Math.min(1, -(2 * vl * Math.sin(diff) / Math.hypot(ziel.x - v.x, ziel.z - v.z)) / v.drehrateMax(vl)));
  return { gas: 1, bremse: 0, lenkung };
}

/** Eine Strecke/Welt/Variante: alle Checkpoints × (KI, Spieler) → Ergebnisliste. */
function pruefStrecke(id, welt, variante, tempo) {
  const sim = new Simulation({ einstellungen: { streckeId: id, welt, variante, gegner: 0, runden: 3, tempoKlasse: tempo, schwierigkeit: 'mittel' },
    spieler: [{ fahrer: 'T', auto: 'passat' }], seed: 7 });
  const st = sim.sim.strecke, sp = st.spline, rennen = sim.sim.rennen;
  const stellen = R.Anlauf.stellen(st);
  if (!stellen.length) return null;
  const f = sim.sim.fahrzeuge[0], t = rennen.teilnehmer[0];
  let k = 0;
  while (!rennen.gasErlaubt && k++ < 60 * 10) sim.schritt();
  const laenge = sp.laenge, erg = [];
  for (const kp of st.checkpoints) {
    // Welche Stelle liegt als nächste vor dem Checkpoint (innerhalb Abstand + 60 m)? (alle betrachten, die den Anlauf berühren)
    const ziele = stellen.map(z => ({ z, d: sp.differenzS(z.s, kp.s) })).filter(x => x.d > -1 && x.d < x.z.abstand + 60).sort((a, b) => a.d - b.d);
    if (!ziele.length) continue;
    const ziel = ziele[0].z;
    for (const wer of ['ki', 'spieler']) {
      // Zustand: Rennen läuft, Auto war zuletzt an diesem Checkpoint → Reset wie Abschleppen/Reset-Taste/Driver-Festfahren
      f.istSpieler = wer === 'spieler'; f.spielerNr = wer === 'spieler' ? 0 : -1; t.istSpieler = wer === 'spieler';
      if (wer === 'ki') { f.driver = new R.Driver(f.vehicle, st, { schwierigkeit: 'mittel', seed: 99, name: 'KI' }); f.driver.hindernisseSetzen(st.hindernisse); }
      else f.driver = null;
      t.letzterCheckpoint = kp.nr; t.naechsterCheckpoint = (kp.nr + 1) % st.checkpoints.length;
      t.imZiel = false; t.ausgeschieden = false; f.ausgeschieden = false;
      f.vehicle.vLaengs = 0;
      sim.sim.zuruecksetzen(0);
      if (f.driver) f.driver.zurueckgesetzt(f.index);
      const startS = sp.naechster(f.vehicle.x, f.vehicle.z, f.index >= 0 ? f.index : undefined).s;
      const zurueck = sp.differenzS(kp.s, startS);               // >0: Auto steht hinter dem Checkpoint
      const dVorStelle = sp.differenzS(ziel.s, startS);
      const reset0 = f.netReset, eing0 = f.anlauf ? f.anlauf.eingriffe : 0, ges0 = f.anlauf ? f.anlauf.gestoppt : 0;
      const lg0 = f.looping.geschafft, fl0 = f.flug.fluege;
      let ok = false, grund = '', zeit = 0, vMax = 0;
      for (let n = 0; n < 60 * 40; n++) {
        if (wer === 'spieler') { const nah = st.abfrage(f.vehicle.x, f.vehicle.z, f.index); sim.eingabeSetzen(0, spielerSteuerung(st, f.vehicle, f.index)); }
        sim.schritt(); zeit += dt; vMax = Math.max(vMax, f.vehicle.vLaengs);
        if (f.netReset !== reset0) { grund = 'erneuter Reset'; break; }
        if (f.anlauf && (f.anlauf.eingriffe !== eing0 || f.anlauf.gestoppt !== ges0)) { grund = 'Anlauf-Bremse'; break; }
        if (f.looping.gefallen && ziel.art === 'looping') { grund = 'Looping gefallen'; break; }
        const geschafft = ziel.art === 'looping' ? f.looping.geschafft > lg0 : f.flug.fluege > fl0;
        if (geschafft) { ok = true; break; }
      }
      if (!ok && !grund) grund = 'nicht angekommen (40 s)';
      erg.push({ cp: kp.nr, wer, art: ziel.art, nr: ziel.nr, ok, grund, zurueck, dVorStelle, abstand: ziel.abstand, zeit, vMax });
    }
  }
  return { st, erg, sim };
}

const KLASSEN = process.env.TEMPO_KLASSE ? [process.env.TEMPO_KLASSE] : ['normal', 'schnell'];
let gesamt = 0, gesamtOk = 0;
for (const daten of R.trackCatalog) {
  if (nurId && daten.id !== nurId) continue;
  const welten = Object.keys(daten.welten || { klassisch: 1 });
  const varianten = [''].concat(Object.keys(daten.varianten || {}));
  for (const welt of welten) for (const variante of varianten) for (const tempo of KLASSEN) {
    const e = pruefStrecke(daten.id, welt === 'klassisch' && !daten.welten ? '' : welt, variante, tempo);
    if (!e) continue;
    const schlecht = e.erg.filter(x => !x.ok);
    const maxZ = Math.max(...e.erg.map(x => x.zurueck), -Infinity);
    gesamt += e.erg.length; gesamtOk += e.erg.length - schlecht.length;
    const txt = `[${daten.id}/${welt}${variante ? '/' + variante : ''}/${tempo}] ${e.erg.length / 2} Checkpoints im Anlauf-Bereich × KI+Spieler`;
    pruefe(txt + ': Stelle ohne Anlauf-Bremse/Reset geschafft, Reset-Punkt ≤ ' + MAX_ZURUECK + ' m hinter Checkpoint',
      schlecht.length === 0 && maxZ <= MAX_ZURUECK + 1e-6,   // P4 (16.10.): Gleitkomma-Toleranz, Dino XL liegt bei 150,0000 m (knapp darüber)
      `max zurück ${maxZ.toFixed(0)} m` + (schlecht.length ? ', ' + schlecht.length + ' schlecht: ' + schlecht.map(x => `cp${x.cp}/${x.wer}/${x.art}${x.nr} ${x.grund} (d ${x.dVorStelle.toFixed(0)}/${x.abstand} m)`).join('; ') : ''));
  }
}
// Start-Schwung: darf der Reset-Punkt höchstens 60 m hinter den Checkpoint (statt 150 m), fehlt Anlaufweg → Schwung statt Bremse
if (!nurId || nurId === 'fantasie') {
  const alt = R.config.anlauf.resetMaxZurueck;
  R.config.anlauf.resetMaxZurueck = 60;
  for (const tempo of KLASSEN) {
    const e = pruefStrecke('fantasie', 'fantasie', '', tempo);
    const schlecht = e.erg.filter(x => !x.ok), maxZ = Math.max(...e.erg.map(x => x.zurueck));
    gesamt += e.erg.length; gesamtOk += e.erg.length - schlecht.length;
    pruefe(`[fantasie/${tempo}] Rücksetz-Grenze 60 m: Reset-Punkt ≤ 60 m hinter Checkpoint, fehlender Anlauf durch Start-Schwung ersetzt, Looping trotzdem geschafft`,
      schlecht.length === 0 && maxZ <= 60 + 1e-6, `max zurück ${maxZ.toFixed(0)} m` + (schlecht.length ? ', schlecht: ' + schlecht.map(x => `cp${x.cp}/${x.wer} ${x.grund}`).join('; ') : ''));
  }
  R.config.anlauf.resetMaxZurueck = alt;
}
console.log(`\n${gesamtOk}/${gesamt} Fälle ok`);
console.log(fehler ? 'FEHLER: ' + fehler : 'ALLE OK');
process.exit(fehler ? 1 : 0);
