// Node-Test v20: Polizei steht NEBEN dem angehaltenen Auto + Gegnerauswahl: node tests/test_polizei_neben.js
// a) Fahren + weiches Einparken (Vehicle-Physik): Ziel bremst von 0/20/40 m/s auf 0, Streifenwagen kommt von hinten (beide Seiten, 3 Richtungen):
//    am Ende parallel (< 0,05 rad), Karosserie-Abstand 0,6–1,0 m, längs ≤ 0,6 m versetzt, nie Überlappung, Einparken ohne Sprung (≤ 0,6 m/Schritt)
// b) Seitenwahl (parkSeiteWaehlen) auf ALLEN Katalog-Strecken (+ Stunt-Welt): Ziel an vielen Stellen/Querlagen, die gewählte Parkpose liegt
//    auf der Fahrbahn (alle 4 Ecken), nicht in Bande/Gelände; Seite = die mit mehr Platz (zur Fahrbahnmitte); Auto in der Lücke → andere Seite
// c) Online/Server: gleiche Dateien (src/world/polizei.js, carCatalog) im Server-Kontext → bitgleiches Einparken; Server-Sim ohne Polizei,
//    Server-Computerfüller nur aus 4 Modellen (mit optionen), identisch zu main.js-Auswahl (R.carCatalog.gegnerAutos)
// d) Gegnerauswahl: nur Passat/Multivan/911/T-Roc, deterministisch, gemischt (alle 4 ab 4 Gegnern), T-Roc dach offen/zu + lack blau/gulf gemischt,
//    Lackfarben ohne Doppel je Modell (solange die Palette reicht), Spielerauto-Standardfarbe nie bei Gegnern desselben Modells; Katalog unverändert
const { ladeModule } = require('./lade');
let fehler = 0;
function pruefe(name, ok, info) { console.log((ok ? 'OK   ' : 'FEHL ') + name + (info !== undefined && info !== '' ? '  (' + info + ')' : '')); if (!ok) fehler++; }
const R = ladeModule(['src/config.js', 'src/physics/vehicle.js', 'src/world/polizei.js', 'src/cars/carCatalog.js',
  'src/track/spline.js', 'src/track/trackCatalog.js', 'src/track/trackBuilder.js']);
const P = R.Polizei, C = R.config.polizei, dt = 1 / 60;
const winkel = (w) => { while (w > Math.PI) w -= 2 * Math.PI; while (w < -Math.PI) w += 2 * Math.PI; return w; };

// ---------- a) Fahren + Einparken ----------
function lauf(seite, v0, hz, vP0) {
  const z = new R.Vehicle({}); z.setzen(0, 0, hz); z.vLaengs = v0;
  const f = z.richtung(), q = z.rechts();
  const p = new R.Vehicle({}); p.setzen(-f.x * 9 + q.x * seite * 1.2, -f.z * 9 + q.z * seite * 1.2, hz); p.vLaengs = vP0;
  const D = P.parkAbstand({ breite: z.daten.breite }, p.daten.breite, C);
  let sprung = 0, minGap = 9, ueber = false;
  for (let k = 0; k < 60 * 14; k++) {
    z.schritt(dt, { gas: 0, bremse: z.vLaengs > 0.3 ? 1 : 0, lenkung: 0 });            // angehalten: nur Bremse (haltSteuerung)
    p.schritt(dt, P.parkSteuerung(p, z, seite, D, C.versatzVor));
    const x0 = p.x, z0 = p.z;
    P.einparken(p, z, seite, D, C.versatzVor, dt, C.einparkRate);
    sprung = Math.max(sprung, Math.hypot(p.x - x0, p.z - z0));
    const g = P.kapselAbstand({ x: p.x, z: p.z, heading: p.heading, laenge: p.daten.laenge, breite: p.daten.breite }, { x: z.x, z: z.z, heading: z.heading, laenge: z.daten.laenge, breite: z.daten.breite });
    if (k > 60) minGap = Math.min(minGap, g);
    if (g <= 0.01) ueber = true;
  }
  const rel = { quer: (p.x - z.x) * q.x + (p.z - z.z) * q.z, laengs: (p.x - z.x) * f.x + (p.z - z.z) * f.z };
  const gap = P.kapselAbstand({ x: p.x, z: p.z, heading: p.heading, laenge: p.daten.laenge, breite: p.daten.breite }, { x: z.x, z: z.z, heading: z.heading, laenge: z.daten.laenge, breite: z.daten.breite });
  return { gap, par: Math.abs(winkel(p.heading - z.heading)), laengs: rel.laengs, sprung, ueber, vP: p.vLaengs, vZ: z.vLaengs, minGap };
}
for (const seite of [-1, 1]) for (const v0 of [0, 20, 40]) for (const hz of [0, 1.2, -2.5]) {
  const r = lauf(seite, v0, hz, Math.max(v0, 10) + 3);
  pruefe(`Einparken Seite ${seite > 0 ? 'rechts' : 'links'}, Ziel bremst von ${v0} m/s, Richtung ${hz}: parallel, Abstand 0,6–1,0 m, kein Sprung`,
    r.par < 0.05 && r.gap >= 0.6 && r.gap <= 1.0 && Math.abs(r.laengs - C.versatzVor) < 0.6 && !r.ueber && r.sprung < 0.6 && Math.abs(r.vP) < 0.6 && Math.abs(r.vZ) < 0.1,
    `Abstand ${r.gap.toFixed(2)} m, Winkel ${r.par.toFixed(3)}, längs ${r.laengs.toFixed(2)}, max. Schritt ${r.sprung.toFixed(2)} m, vP ${r.vP.toFixed(2)}`);
}

// ---------- b) Seitenwahl auf allen Strecken ----------
{
  const fensterWelten = [];
  for (const daten of R.trackCatalog) {
    const welten = [daten.weltStandard].concat(daten.welten && daten.welten.stunt ? ['stunt'] : []);
    for (const welt of welten) fensterWelten.push([daten, welt]);
  }
  let gesamt = 0, schlecht = 0, enge = 0, gewaehltMehr = 0, falsch = 0;
  for (const [daten, welt] of fensterWelten) {
    const st = new R.Strecke(daten, { welt });
    let n = 0, bad = 0, nl = 0;
    for (let s = 20; s < st.laenge - 20; s += 37) {
      const pt = st.spline.punktBei(s);
      const halb = st.breiteBei(s) / 2;
      for (const frac of [-0.7, -0.3, 0, 0.35, 0.75]) {
        const q = frac * (halb - 1.0);                                    // Ziel hält irgendwo auf der Fahrbahn (Auto-Mitte ≥ 1 m vom Rand)
        const z = { x: pt.x + pt.nx * q, z: pt.z + pt.nz * q, heading: Math.atan2(-pt.tx, -pt.tz), laenge: 4.88, breite: 1.83 };
        const pl = { laenge: 4.88, breite: 1.83 };
        const nz = st.abfrage(z.x, z.z);
        if (st.breiteBei(nz.s) / 2 - Math.abs(nz.seitenabstand) < 1.0) continue;   // Mittellinie in der Gabelung/Kreuzung liegt nicht auf einer Fahrbahn: kein gültiger Halteplatz
        const w = P.parkSeiteWaehlen(st, z, pl, [], 1, C);
        n++;
        // Referenz: Platz beider Seiten selbst nachrechnen
        const D = P.parkAbstand(z, 1.83, C);
        const platz = (seite) => { const pose = P.parkPose(z, seite, D, C.versatzVor); const fx = -Math.sin(pose.heading), fz = -Math.cos(pose.heading), qx = Math.cos(pose.heading), qz = -Math.sin(pose.heading);
          let mn = 99; for (const la of [-2.44, 2.44]) for (const qa of [-0.915, 0.915]) { const nn = st.abfrage(pose.x + fx * la + qx * qa, pose.z + fz * la + qz * qa); mn = Math.min(mn, st.breiteBei(nn.s) / 2 - Math.abs(nn.seitenabstand)); } return mn; };
        const pr = platz(1), pn = platz(-1), best = Math.max(pr, pn);
        if (Math.abs(w.platz - (w.seite > 0 ? pr : pn)) > 1e-9) falsch++;
        // gewählte Seite hat ≥ Platz der anderen (bis auf den Bonus der „bisherigen“ Seite von 1,5 m, gedeckelt bei 3 m)
        if (Math.min(w.platz, 3) + 1e-9 < Math.min(best, 3) - 1.5) { bad++; if (process.env.DBG) console.log('  schlecht1', daten.id, welt, s.toFixed(0), frac, w.platz.toFixed(2), pr.toFixed(2), pn.toFixed(2)); }
        if (w.platz < 0 && best >= 0) { bad++; if (process.env.DBG) console.log('  schlecht2', daten.id, welt, s.toFixed(0), frac); }                               // nie über den Rand, wenn die andere Seite passt
        if (best < 0) nl++;                                                // beide Seiten ragen hinaus: nur bei Ziel dicht am Rand erlaubt
        if (w.platz < -1.5) { bad++; if (process.env.DBG) console.log('  schlecht3', daten.id, welt, s.toFixed(0), frac, 'halb', halb.toFixed(1), 'q', q.toFixed(2), w.platz.toFixed(2), pr.toFixed(2), pn.toFixed(2)); }
        if ((w.seite > 0) !== (pr >= pn) && Math.abs(Math.min(pr, 3) - Math.min(pn, 3)) > 1.5) gewaehltMehr++;
      }
    }
    gesamt += n; schlecht += bad; enge += nl;
    pruefe(`Seitenwahl ${daten.id}/${welt}: ${n} Stopps, Parkpose immer auf der Fahrbahn bzw. die bessere Seite`, bad === 0, bad ? bad + ' schlecht' : `${nl} beidseitig knapp`);
  }
  pruefe('Seitenwahl: gewählter Platz stimmt mit Nachrechnung überein', falsch === 0, falsch);
  pruefe('Seitenwahl: bei klarem Unterschied (> 1,5 m) immer die Seite mit mehr Platz (zur Fahrbahnmitte)', gewaehltMehr === 0, gewaehltMehr);
  console.log(`   gesamt ${gesamt} Stopps, ${enge} davon mit zu wenig Platz auf beiden Seiten`);
  // künstlich: Ziel nah am rechten Rand → Streifenwagen links; Auto in der linken Lücke → rechts (wenn Platz)
  const st = { breite: 12, abfrage: (x, z) => ({ s: 0, seitenabstand: x }), breiteBei: () => 12 };
  const z = { x: 4.0, z: 0, heading: 0, laenge: 4.88, breite: 1.83 };
  pruefe('Ziel dicht am rechten Rand (Mitte 4,0 m) → Streifenwagen links (Fahrbahnmitte)', P.parkSeiteWaehlen(st, z, { laenge: 4.88, breite: 1.83 }, [], 1, C).seite === -1);
  pruefe('Ziel dicht am linken Rand (−4,0 m) → Streifenwagen rechts', P.parkSeiteWaehlen(st, { x: -4, z: 0, heading: 0, laenge: 4.88, breite: 1.83 }, { laenge: 4.88, breite: 1.83 }, [], -1, C).seite === 1);
  const D = P.parkAbstand(z, 1.83, C), lücke = P.parkPose(z, -1, D, C.versatzVor);
  const w2 = P.parkSeiteWaehlen(st, { x: 1.0, z: 0, heading: 0, laenge: 4.88, breite: 1.83 }, { laenge: 4.88, breite: 1.83 }, [{ x: 1 - D, z: -0.4, heading: 0, laenge: 4.5, breite: 1.8 }], -1, C);
  pruefe('Auto in der linken Parklücke → rechts (auch wenn er links fährt)', w2.seite === 1, JSON.stringify(w2));
  pruefe('Schmale Strecke 5 m: Parkpose (Ziel mittig) passt auf die Fahrbahn', (() => { const s5 = { abfrage: (x) => ({ s: 0, seitenabstand: x }), breiteBei: () => 5 };
    const w = P.parkSeiteWaehlen(s5, { x: -1.2, z: 0, heading: 0, laenge: 4.88, breite: 1.83 }, { laenge: 4.88, breite: 1.83 }, [], 1, C); return w.platz >= -0.05; })());
  void lücke;
}

// ---------- c) Server / online ----------
{
  const { kontextLaden, Simulation } = require('../server/simulation');
  const S = kontextLaden(['src/config.js', 'src/physics/vehicle.js', 'src/world/polizei.js', 'src/cars/carCatalog.js']);
  const a = lauf(1, 30, 0.7, 33), SP = S.Polizei;
  // gleicher Lauf im Server-Kontext
  const z = new S.Vehicle({}); z.setzen(0, 0, 0.7); z.vLaengs = 30;
  const f = z.richtung(), q = z.rechts();
  const p = new S.Vehicle({}); p.setzen(-f.x * 9 + q.x * 1.2, -f.z * 9 + q.z * 1.2, 0.7); p.vLaengs = 33;
  const D = SP.parkAbstand({ breite: z.daten.breite }, p.daten.breite, S.config.polizei);
  for (let k = 0; k < 60 * 14; k++) {
    z.schritt(dt, { gas: 0, bremse: z.vLaengs > 0.3 ? 1 : 0, lenkung: 0 });
    p.schritt(dt, SP.parkSteuerung(p, z, 1, D, S.config.polizei.versatzVor));
    SP.einparken(p, z, 1, D, S.config.polizei.versatzVor, dt, S.config.polizei.einparkRate);
  }
  const gap = SP.kapselAbstand({ x: p.x, z: p.z, heading: p.heading, laenge: p.daten.laenge, breite: p.daten.breite }, { x: z.x, z: z.z, heading: z.heading, laenge: z.daten.laenge, breite: z.daten.breite });
  pruefe('Server-Kontext: Einparken bitgleich zum Client-Kontext', Math.abs(gap - a.gap) < 1e-12, gap.toFixed(6) + ' / ' + a.gap.toFixed(6));
  const sim = new Simulation({ einstellungen: { streckeId: 'wiese', gegner: 6, runden: 1, polizei: true }, spieler: [{ fahrer: 'Jonas', auto: 'bmw-m4' }], seed: 3 });
  pruefe('Server-Simulation (v21): Polizei online nur mit Einstellung, Streifenwagen hinter den Teilnehmern', !!sim.sim.polizei && sim.sim.fahrzeuge.some(x => x.polizei));
  const sim0 = new Simulation({ einstellungen: { streckeId: 'wiese', gegner: 6, runden: 1 }, spieler: [{ fahrer: 'Jonas', auto: 'bmw-m4' }], seed: 3 });
  pruefe('Server-Simulation ohne Polizei-Einstellung: spiel.polizei = null', sim0.sim.polizei === null && !sim0.sim.fahrzeuge.some(x => x.polizei));
  const ids = sim.teilnehmerInfo.filter(t => !t.mensch).map(t => t.autoId);
  const erlaubt = ['passat', 'multivan', 'porsche-911', 'troc-cabrio'];
  pruefe('Server-Computerfüller: nur die 4 Modelle', ids.length === 6 && ids.every(i => erlaubt.includes(i)), ids.join(','));
  const erwartet = sim.R.carCatalog.gegnerAutos(6, { seed: ['wiese', 6, 'bmw-m4'].join('|'), spielerIds: ['bmw-m4'] });
  pruefe('Server-Auswahl = gegnerAutos(seed Strecke|Zahl|Spielerautos), optionen mitgeschickt', sim.teilnehmerInfo.slice(1).every((t, i) => t.autoId === erwartet[i].id && JSON.stringify(t.optionen || {}) === JSON.stringify(erwartet[i].optionen || {})));
  pruefe('Teilnehmer-Info: nur Computer haben optionen, Spieler nicht', sim.teilnehmerInfo[0].optionen === undefined);
}

// ---------- d) Gegnerauswahl ----------
{
  const K = R.carCatalog, erlaubt = ['passat', 'multivan', 'porsche-911', 'troc-cabrio'];
  const katalogVorher = JSON.stringify(K);
  for (const n of [1, 3, 5, 8, 12]) {
    const l = K.gegnerAutos(n, { seed: 'x|' + n, spielerIds: ['troc-cabrio'] });
    pruefe(`Gegnerauswahl ${n}: Länge, nur die 4 Modelle`, l.length === n && l.every(a => erlaubt.includes(a.id)), l.map(a => a.id).join(','));
    if (n >= 4) pruefe(`Gegnerauswahl ${n}: alle 4 Modelle vorhanden (bunt gemischt)`, erlaubt.every(id => l.some(a => a.id === id)));
  }
  pruefe('Deterministisch: gleicher Seed → gleiches Feld, anderer Seed → anderes', JSON.stringify(K.gegnerAutos(7, { seed: 'a' })) === JSON.stringify(K.gegnerAutos(7, { seed: 'a' })) &&
    JSON.stringify(K.gegnerAutos(7, { seed: 'a' })) !== JSON.stringify(K.gegnerAutos(7, { seed: 'b' })));
  // T-Roc-Mischung über viele Seeds
  let offen = 0, zu = 0, blau = 0, gulf = 0, troc = 0, fremdOpt = 0;
  for (let i = 0; i < 60; i++) for (const a of K.gegnerAutos(8, { seed: 'seed' + i })) if (a.id === 'troc-cabrio') {
    troc++; if (a.optionen.dach === 'offen') offen++; else if (a.optionen.dach === 'zu') zu++; if (a.optionen.lack === 'blau') blau++; else if (a.optionen.lack === 'gulf') gulf++;
  } else if (a.optionen && (a.optionen.dach || a.optionen.lack)) fremdOpt++;
  pruefe('T-Roc-Gegner: Dach offen UND zu, Lack blau UND gulf gemischt (je ≥ 25 %)', troc > 0 && offen >= troc * 0.25 && zu >= troc * 0.25 && blau >= troc * 0.25 && gulf >= troc * 0.25 && offen + zu === troc && blau + gulf === troc, `${troc}: offen ${offen}/zu ${zu}, blau ${blau}/gulf ${gulf}`);
  pruefe('Nur der T-Roc bekommt dach/lack', fremdOpt === 0);
  // Farben: keine Doppel je Modell innerhalb einer Palette-Länge
  const l = K.gegnerAutos(12, { seed: 'farben', spielerIds: ['passat'] });
  const jeModell = {};
  l.forEach(a => { if (a.id !== 'troc-cabrio') (jeModell[a.id] = jeModell[a.id] || []).push(a.optionen.farbe === undefined ? 'std' : a.optionen.farbe); });
  pruefe('Farben je Modell ohne Doppel (3 Autos je Modell, Palette 5)', Object.values(jeModell).every(c => new Set(c).size === c.length), JSON.stringify(jeModell));
  pruefe('Spieler fährt Passat → kein Gegner-Passat in Passat-Standardfarbe', !(jeModell.passat || []).includes('std'));
  const abgeleitet = K.gegnerAutos(4, { seed: 'k' })[0];
  pruefe('Abgeleitete Autos: gleiche id/Fahrwerte/Form wie der Katalogeintrag, Katalog unverändert', abgeleitet.fahrwerte === K.finde(abgeleitet.id).fahrwerte && abgeleitet.form === K.finde(abgeleitet.id).form && JSON.stringify(K) === katalogVorher);
  pruefe('Polizei weiterhin nicht wählbar und nie Gegner', K.finde('polizei').waehlbar === false && !K.waehlbare().some(a => a.id === 'polizei') && erlaubt.every(id => !!K.finde(id)));
  pruefe('Streifenwagen = Passat-Geometrie: Form des Passats + Optionen lack/lichtbalken', K.finde('polizei').optionen.lack === 'polizei' && K.finde('polizei').optionen.lichtbalken === true &&
    ['dachHinten', 'heckTyp', 'fenster', 'nase'].every(k => JSON.stringify(K.finde('polizei').form[k]) === JSON.stringify(K.finde('passat').form[k])) && K.finde('polizei').lackVarianten.polizei.form.polizeiDekor === true);
}

console.log(fehler ? '\n' + fehler + ' FEHLER' : '\nAlle Polizei-Neben-Tests OK');
process.exit(fehler ? 1 : 0);
