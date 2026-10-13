// 13.10. (v16) Fantasie-Kreuzung: Abbiegen ohne unsichtbare Wand – node tests/test_kreuzung_abbiegen.js [--diag]
// Vorher: Wer auf der niveaugleichen Kreuzung abbog, blieb dem alten Abschnitt zugeordnet; dessen Bande (23 m) lag ~21 m von der
// Kreuzungsmitte quer über der anderen Straße (unsichtbare Wand in den 4 Einmündungen).
// Jetzt: Abschnittswechsel (trackBuilder _kreuzungWechsel, ≥ 17 m auf der Querstraße) + Rennleitung „falsch abgebogen"
// (raceManager _abbiegen: kein Fortschritt/Checkpoint, Frist 4 s, dann Reset) + Meldung/Reset in main.js (_abbiegenPruefen).
// Mit --ohne-fix wird der Abschnittswechsel abgeschaltet (zeigt die alte unsichtbare Wand).
// Geprüft für alle 4 Abbiegerichtungen (Abschnitt a/b × Querstraße vor/zurück):
//   1 Physik pur (wie kreuzung_bande_diag): kein Bandenstoß an der alten Stelle (18–25 m), freie Fahrt bis ≥ 50 m auf der Querstraße,
//     Abschnittswechsel (abfrage-Index gehört danach zur Querstraße), Rückweg zur Mitte wechselt zurück
//   2 Vollsimulation (Server-Spiel, echtes main.js + raceManager): Meldung „Falsch abgebogen", Fortschritt eingefroren, KEINE
//     Checkpoint-Gutschrift (auch wenn der nächste erwartete Checkpoint auf der Querstraße liegt), Reset nach Frist (≤ 4,2 s) an
//     den letzten Checkpoint
//   3 Rückkehr zur Kreuzung innerhalb der Frist: kein Reset, danach läuft der Fortschritt normal weiter
//   4 geradeaus unverändert: Index-Kontinuität identisch zu _naechsterKont, nie „abgebogen", Checkpoints werden gezählt
//   5 KI-Runde: nie abgebogen, kein Reset durch die Kreuzung
const { Simulation } = require('../server/simulation.js');
const diag = process.argv.includes('--diag');
const sim0 = new Simulation({ einstellungen: { streckeId: 'fantasie', welt: 'fantasie', gegner: 0 }, spieler: [{ fahrer: 'T', auto: 'passat' }], seed: 1 });
const R = sim0.R;
if (process.argv.includes('--ohne-fix')) R.Strecke.prototype._naechsterWechsel = function (x, z, i) { return this._naechsterKont(x, z, i); };   // Vergleich: Verhalten vor v16 (keine Abschnittswechsel)
const K = R.Kollisionen, dt = R.config.physik.schritt;
let fehler = 0;
function pruefe(name, ok, info) { console.log((ok ? 'OK   ' : 'FEHL ') + name + (info ? '  (' + info + ')' : '')); if (!ok) fehler++; }
const st0 = new R.Strecke(R.trackCatalog.find(t => t.id === 'fantasie')), sp0 = st0.spline, k0 = st0.kreuzungen[0];
const dMitte = (v) => Math.hypot(v.x - k0.x, v.z - k0.z);
const FALL = [['a', 1], ['a', -1], ['b', 1], ['b', -1]];            // Abschnitt, der abbiegt (a/b) × Richtung auf der Querstraße (+/−)
const sK = (p) => p === 'a' ? k0.sA : k0.sB, sQ = (p) => p === 'a' ? k0.sB : k0.sA;
const name = (p, r) => `Abschnitt ${p} biegt ${r > 0 ? 'vorwärts' : 'rückwärts'} auf ${p === 'a' ? 'b' : 'a'} ab`;

// ---------------------------------------------------------------- 1 Physik pur
console.log('--- 1 Physik pur: Bande/Abschnittswechsel');
for (const [pass, rueck] of FALL) {
  const st = new R.Strecke(R.trackCatalog.find(t => t.id === 'fantasie')), sp = st.spline, k = st.kreuzungen[0];
  const p = sp.punktBei(sK(pass) - 12), q = sp.punktBei(sQ(pass));
  const v = new R.Vehicle({}); v.setzen(p.x, p.z, R.headingAus(p.tx, p.tz)); v.vLaengs = 12; v._idx = -1;
  const ziel = R.headingAus(q.tx * rueck, q.tz * rueck);
  let abgebogen = false, stoss = 0, stossStelle = null, wechselBei = null, maxD = 0, nQ = false;
  for (let i = 0; i < 60 * 8; i++) {
    const n = st.abfrage(v.x, v.z, v._idx); v._idx = n.index; v.untergrund = n.untergrund;
    const dm = Math.hypot(v.x - k.x, v.z - k.z);
    if (!abgebogen && dm < 4) { abgebogen = true; v.heading = ziel; v.weltGeschwindigkeitSetzen(-Math.sin(ziel) * 14, -Math.cos(ziel) * 14); }
    v.schritt(dt, { gas: 0.6, bremse: 0, lenkung: 0 });
    const s0 = K.bande(v, st);
    if (abgebogen && s0 > 0.3 && !stossStelle) stossStelle = { dm: Math.hypot(v.x - k.x, v.z - k.z), kmh: v.tempoKmh };
    if (abgebogen && s0 > 0.3) stoss++;
    if (abgebogen) {
      const dmN = Math.hypot(v.x - k.x, v.z - k.z); maxD = Math.max(maxD, dmN);
      const nn = st.abfrage(v.x, v.z, v._idx);
      if (!wechselBei && Math.abs(sp.differenzS(nn.s, sQ(pass))) < 40) wechselBei = dmN;
    }
  }
  pruefe(`[${name(pass, rueck)}] kein Bandenstoß an der alten Stelle (18–25 m), Fahrt bis ≥ 50 m`,
    !(stossStelle && stossStelle.dm >= 18 && stossStelle.dm <= 25) && maxD >= 50, `max ${maxD.toFixed(0)} m, erster Stoß ${stossStelle ? stossStelle.dm.toFixed(1) + ' m' : 'keiner'}`);
  pruefe(`[${name(pass, rueck)}] Abschnittswechsel auf die Querstraße bei ≈ 17–20 m`, wechselBei !== null && wechselBei >= 16.5 && wechselBei <= 21, wechselBei === null ? 'nie' : wechselBei.toFixed(1) + ' m');
}
// Rückweg: wer auf der Querstraße zur Mitte zurückfährt, ist unter 17 m wieder dem Heimabschnitt oder weiter dem Querabschnitt zugeordnet (Kontinuität) – keine Sprünge
{
  const st = new R.Strecke(R.trackCatalog.find(t => t.id === 'fantasie')), sp = st.spline, k = st.kreuzungen[0];
  const q = sp.punktBei(k.sB);
  let idx = -1, spruenge = 0, letztes = null;
  for (let l = 40; l >= -40; l -= 0.5) {
    const x = q.x + q.tx * l, z = q.z + q.tz * l, n = st.abfrage(x, z, idx < 0 && l === 40 ? sp.indexBei(k.sA) : idx);
    idx = n.index;
    if (letztes !== null && Math.abs(sp.differenzS(n.s, letztes)) > 12) spruenge++;
    letztes = n.s;
  }
  pruefe('Fahrt quer über die Kreuzung entlang b (Start mit Index von a): Zuordnung wechselt genau einmal (beim Verlassen der Kreuzung), kein Flackern', spruenge <= 2, spruenge + ' Sprünge in s');
}

// ---------------------------------------------------------------- 2 Vollsimulation
function neuesSpiel(gegner) {
  const sim = new Simulation({ einstellungen: { streckeId: 'fantasie', welt: 'fantasie', gegner: gegner || 0, runden: 3, schwierigkeit: 'mittel' }, spieler: [{ fahrer: 'T', auto: 'passat' }], seed: 3 });
  let k = 0; while (!sim.sim.rennen.gasErlaubt && k++ < 600) sim.schritt();
  sim.abholen();
  return sim;
}
function lenkungZu(R_, v, zx, zz) {
  // einfache P-Lenkung auf einen Zielpunkt (entschlossen genug für eine 90°-Kurve bei ~6 m/s)
  let diff = R_.headingAus(zx - v.x, zz - v.z) - v.heading;
  while (diff > Math.PI) diff -= 2 * Math.PI; while (diff < -Math.PI) diff += 2 * Math.PI;
  return Math.max(-1, Math.min(1, -2.5 * diff));
}
/** Auto steht 40 m vor der Kreuzung auf pass (letzter Checkpoint cpLetzt, erwartet cpNext). */
function aufstellen(sim, pass, cpLetzt, cpNext) {
  const f = sim.sim.fahrzeuge[0], t = sim.sim.rennen.teilnehmer[0], st = sim.sim.strecke, sp = st.spline;
  const p = sp.punktBei(sK(pass) - 40);
  f.istSpieler = true; f.spielerNr = 0; f.driver = null; t.istSpieler = true;
  f.vehicle.setzen(p.x, p.z, R.headingAus(p.tx, p.tz)); f.vehicle.vLaengs = 8; f.vehicle.y = st.hoeheAn(p.x, p.z);
  f.index = sp.indexBei(p.s);
  t.gestartet = true; t.letzterCheckpoint = cpLetzt; t.naechsterCheckpoint = cpNext; t.imZiel = false; t.runde = 0;
  sim.sim.rennen.verfolgungSetzen(0, p.x, p.z, p.s);
  t._x = f.vehicle.x; t._z = f.vehicle.z;
  sim.sim._vorherAngleichen(f);
  return { f, t, st, sp };
}
/** Fährt zur Mitte, biegt dort in Richtung rueck auf die Querstraße ab (Zielpunkt 28 m hinter der Mitte), fährt dann weiter dorthin. */
function abbiegeFahrt(sim, G, pass, rueck, opt) {
  const { f, t, st, sp } = G, q = sp.punktBei(sQ(pass)), v = f.vehicle;
  const ziel = { x: k0.x + q.tx * rueck * 60, z: k0.z + q.tz * rueck * 60 };
  const nahe = { x: k0.x + q.tx * rueck * 26, z: k0.z + q.tz * rueck * 26 };
  const log = { stoss: [], meldungen: [], reset: false, resetZeit: null, abgebogenZeit: null, maxFortschritt: -1e9, fAbg: null, cpGut: 0, wechselS: null };
  const reset0 = f.netReset;
  if (opt.resetUnterdruecken) sim.sim._abbiegenPruefen = function () { const tn = this.rennen.teilnehmer; for (const x of tn) if (x.abbiegeReset) x.abbiegeReset = false; R.Spiel.prototype._abbiegenPruefen.call(this); };   // Reset aus (nur Meldung), damit die lange Fahrt auf der Querstraße geprüft werden kann
  let zeit = 0, phase = 0, letzteCP = t.letzterCheckpoint, runde0 = t.runde;
  for (let n = 0; n < 60 * opt.maxSek; n++) {
    const dm = dMitte(v);
    if (phase === 0 && dm < 7) phase = 1;                              // an der Mitte: abbiegen
    const zp = phase === 0 ? { x: k0.x, z: k0.z } : (opt.rueckkehr && log.abgebogenZeit !== null && zeit - log.abgebogenZeit > opt.rueckkehr ? { x: k0.x, z: k0.z } : (phase === 1 ? nahe : ziel));
    if (phase === 1 && dMitte(v) > 20) phase = 2;
    const vsoll = phase === 0 ? 9 : (opt.rueckkehr !== undefined ? 4 : 7);
    sim.eingabeSetzen(0, { gas: v.vLaengs < vsoll ? 0.8 : 0, bremse: v.vLaengs > vsoll + 2 ? 0.5 : 0, lenkung: lenkungZu(R, v, zp.x, zp.z) });
    sim.schritt(); zeit += dt;
    if (v._anBande && dm > 17 && dm < 30 && phase >= 1) {
      const pq = sp.punktBei(sQ(pass)), qq = Math.abs((v.x - pq.x) * pq.nx + (v.z - pq.z) * pq.nz);   // Abstand zur Mitte der QUERstraße
      if (qq < st.breite / 2) log.stoss.push(+dm.toFixed(1));                                          // Wand mitten auf der Fahrbahn der Querstraße
    }
    if (t.abgebogen && log.abgebogenZeit === null) { log.abgebogenZeit = zeit; log.fAbg = t.fortschritt; }
    if (t.abgebogen && log.wechselS === null) { const nn = st.abfrage(v.x, v.z, f.index); log.wechselS = Math.abs(sp.differenzS(nn.s, sQ(pass))); }
    if (t.letzterCheckpoint !== letzteCP) { log.cpGut++; letzteCP = t.letzterCheckpoint; }
    if (log.fAbg !== null) log.maxFortschritt = Math.max(log.maxFortschritt, t.fortschritt);
    for (const e of sim.abholen()) if (e.art === 'meldung') log.meldungen.push(e.text);
    if (f.netReset !== reset0 && !log.reset) { log.reset = true; log.resetZeit = zeit; if (opt.stopBeiReset) break; }
  }
  log.runde = t.runde - runde0; log.zeit = zeit;
  return log;
}
console.log('--- 2 Vollsimulation: Meldung, kein Fortschritt, Reset nach Frist');
for (const [pass, rueck] of FALL) {
  // nächster erwarteter Checkpoint: normal (a: 8 bei 947 / b: 10 bei 1183), und böse: der Checkpoint LIEGT auf der Querstraße
  const normal = pass === 'a' ? [7, 8] : [9, 10], boese = pass === 'a' ? [9, 10] : [7, 8];
  for (const [bez, cps] of [['normal', normal], ['Checkpoint auf der Querstraße', boese]]) {
    const sim = neuesSpiel();
    const G = aufstellen(sim, pass, cps[0], cps[1]);
    const log = abbiegeFahrt(sim, G, pass, rueck, { maxSek: 16, resetUnterdruecken: true });
    const spaetFort = G.t.fortschritt;
    pruefe(`[${name(pass, rueck)}; ${bez}] abgebogen erkannt, Meldung „Falsch abgebogen", Abschnittswechsel der Physik`,
      log.abgebogenZeit !== null && log.meldungen.some(m => /Falsch abgebogen/.test(m)) && log.wechselS !== null && log.wechselS < 40, `Meldung ${JSON.stringify(log.meldungen)}`);
    pruefe(`[${name(pass, rueck)}; ${bez}] keine Checkpoint-Gutschrift, keine Runde, Fortschritt eingefroren (10 s Fahrt)`,
      log.cpGut === 0 && log.runde === 0 && G.t.naechsterCheckpoint === cps[1] && log.maxFortschritt - log.fAbg < 1, `cpGut ${log.cpGut}, Fortschritt beim Abbiegen ${log.fAbg === null ? '-' : log.fAbg.toFixed(0)} → danach max ${log.maxFortschritt.toFixed(0)}`);
    pruefe(`[${name(pass, rueck)}; ${bez}] kein Bandenstoß an der alten Stelle`, log.stoss.length === 0, log.stoss.slice(0, 3).join(','));
  }
  const sim = neuesSpiel();
  const G = aufstellen(sim, pass, normal[0], normal[1]);
  const pos0 = { x: sim.sim.strecke.checkpoints[normal[0]].x, z: sim.sim.strecke.checkpoints[normal[0]].z };
  const log = abbiegeFahrt(sim, G, pass, rueck, { maxSek: 16, stopBeiReset: true });
  const rp = G.f.vehicle;
  pruefe(`[${name(pass, rueck)}] Reset nach Frist (≈ 4 s (3,5–4,2) nach dem Abbiegen) an den letzten Checkpoint, Zustand frei`,
    log.reset && log.resetZeit - log.abgebogenZeit <= 4.2 && log.resetZeit - log.abgebogenZeit >= 3.5 && G.t.abgebogen === null && !G.t.abbiegeReset
    && Math.hypot(rp.x - pos0.x, rp.z - pos0.z) < 160 && G.t.letzterCheckpoint === normal[0] && log.meldungen.some(m => /Zurück auf die Strecke/.test(m)),
    `Reset ${log.reset ? (log.resetZeit - log.abgebogenZeit).toFixed(2) + ' s' : 'nie'} nach Abbiegen, Abstand zum Checkpoint ${Math.hypot(rp.x - pos0.x, rp.z - pos0.z).toFixed(0)} m`);
}

// ---------------------------------------------------------------- 3 Rückkehr innerhalb der Frist
console.log('--- 3 Rückkehr zur Kreuzung innerhalb der Frist');
for (const [pass, rueck] of FALL) {
  const cps = pass === 'a' ? [7, 8] : [9, 10];
  const sim = neuesSpiel(), G = aufstellen(sim, pass, cps[0], cps[1]);
  const log = abbiegeFahrt(sim, G, pass, rueck, { maxSek: 16, rueckkehr: 0.2 });
  pruefe(`[${name(pass, rueck)}] kehrt sofort (nach 0,2 s) zur Kreuzung zurück: kein Reset, wieder zu Hause (abgebogen = null)`,
    log.abgebogenZeit !== null && !log.reset && G.t.abgebogen === null, `Reset ${log.reset}, abgebogen ${G.t.abgebogen ? 'ja' : 'nein'}`);
}

// ---------------------------------------------------------------- 4 geradeaus
console.log('--- 4 geradeaus unverändert');
for (const pass of ['a', 'b']) {
  const cps = pass === 'a' ? [7, 8] : [9, 10];
  const sim = neuesSpiel(), G = aufstellen(sim, pass, cps[0], cps[1]);
  const { f, t, st, sp } = G, v = f.vehicle;
  let abg = 0, diffIdx = 0, meld = 0, schritte = 0;
  const cp0 = t.letzterCheckpoint;
  let idxAlt = f.index;
  for (let n = 0; n < 60 * 14; n++) {
    const p = sp.punktBei(sp.naechster(v.x, v.z, f.index).s + 18);
    sim.eingabeSetzen(0, { gas: v.vLaengs < 10 ? 0.8 : 0, bremse: 0, lenkung: lenkungZu(R, v, p.x, p.z) });
    sim.schritt(); schritte++;
    if (t.abgebogen) abg++;
    const a = st.abfrage(v.x, v.z, f.index), b = st._naechsterKont(v.x, v.z, f.index);
    if (a.index !== b.index || a.s !== b.s) diffIdx++;
    for (const e of sim.abholen()) if (e.art === 'meldung' && /abgebogen/.test(e.text)) meld++;
  }
  pruefe(`[geradeaus über a→${pass}-Kreuzung] nie abgebogen, Zuordnung identisch zur Index-Kontinuität, Checkpoint ${cps[1]} gezählt`,
    abg === 0 && diffIdx === 0 && meld === 0 && t.letzterCheckpoint === cps[1], `abgebogen ${abg}, Abweichungen ${diffIdx}, letzter CP ${cp0}→${t.letzterCheckpoint}`);
}
{ // Querstraße ohne Index-Kontinuität: abfrage ohne Index = globaler Nächster (unverändert zu vorher, wenn nicht abgebogen)
  const st = new R.Strecke(R.trackCatalog.find(t => t.id === 'fantasie'));
  let diff = 0, n = 0;
  for (let s = 0; s < st.spline.laenge; s += 7) {
    const p = st.spline.punktBei(s);
    for (const q of [-9, -3, 0, 3, 9]) {
      const x = p.x + p.nx * q, z = p.z + p.nz * q, a = st.abfrage(x, z), b = st._naechsterKont(x, z);
      n++; if (a.index !== b.index) diff++;
    }
  }
  pruefe('abfrage ohne Index (Minimap, Münzen …) entlang der ganzen Strecke identisch zu vorher', diff === 0, `${n} Punkte, ${diff} Abweichungen`);
}

// ---------------------------------------------------------------- 5 KI
console.log('--- 5 KI-Runde (3 Computerautos + 1 Mensch als Autopilot-Statist)');
{
  const sim = neuesSpiel(3), f0 = sim.sim.fahrzeuge[0], t0 = sim.sim.rennen.teilnehmer[0];
  let abg = 0, resets = 0, meld = 0, kreuzungen = 0;
  const imKreuz = sim.sim.fahrzeuge.map(() => false);
  const reset0 = sim.sim.fahrzeuge.map(f => f.netReset);
  for (let n = 0; n < 60 * 150; n++) {
    sim.eingabeSetzen(0, { gas: 0, bremse: 0, lenkung: 0 });
    sim.schritt();
    sim.sim.rennen.teilnehmer.forEach((t, i) => {
      if (t.abgebogen) abg++;
      const d = dMitte(sim.sim.fahrzeuge[i].vehicle);
      if (d < 10 && !imKreuz[i]) { imKreuz[i] = true; kreuzungen++; } else if (d > 25) imKreuz[i] = false;
    });
    for (const e of sim.abholen()) if (e.art === 'meldung' && /abgebogen/.test(e.text)) meld++;
  }
  sim.sim.fahrzeuge.forEach((f, i) => { if (f.netReset !== reset0[i]) resets++; });
  pruefe('3 KI-Autos (Mensch steht): nie abgebogen, keine Meldung, kein Reset; Kreuzung überfahren', abg === 0 && meld === 0 && resets === 0 && kreuzungen >= 3,
    `Kreuzungsüberfahrten ${kreuzungen}, abgebogen ${abg}, Resets ${resets}`);
}
console.log(fehler ? '\nFEHLER: ' + fehler : '\nALLE OK');
process.exit(fehler ? 1 : 0);
