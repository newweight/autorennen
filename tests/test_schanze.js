// Node-Test Sprungschanzen (Runde 4, src/track/schanze.js): node tests/test_schanze.js
// a) Physik: 30 m/s über 12°-Rampe → fliegt ≥ 1 s und ≥ 25 m, landet auf der Straße, Tempo × 0,95;
//    10 m/s → kurzer Hüpfer; Landung quer (Heading ≠ Tangente > 25°) → × 0,8; Rampe hebt y, Bug hoch;
//    hoeheAuf(s); Rampe nur von vorne auf der Fahrbahn; imFlug während des Flugs.
// b) KI: alle 7 Stufen fahren 1 Runde Wiese/Wald/Wüste (Welt „Stunt"), fliegen über JEDE Schanze und landen auf der Straße.
// c) Welten: Schanzen nur in Stunt/Verrückt.
// d) Runde 5 (Anlauf, track/anlauf.js): unter config.anlauf.schanzeMin kein Auffahren (Notstopp bzw. sanfte Anlauf-Bremse
//    10 m davor), rückwärts löst, R → Anlaufposition, Vollgas von dort → fliegt (jedes Auto × Klasse, alle Schanzen).
const { ladeModule } = require('./lade');
const R = ladeModule(['src/config.js', 'src/physics/vehicle.js', 'src/cars/carCatalog.js', 'src/track/spline.js', 'src/track/trackCatalog.js',
  'src/track/trackBuilder.js', 'src/track/schanze.js', 'src/track/anlauf.js', 'src/race/raceManager.js', 'src/physics/collisions.js', 'src/ai/driver.js']);

let fehler = 0;
function pruefe(name, ok, info) { console.log((ok ? 'OK   ' : 'FEHL ') + name + (info ? '  (' + info + ')' : '')); if (!ok) fehler++; }
const dt = R.config.physik.schritt, S = R.Schanzen, C = R.config.stunt.schanze;
const katalog = (id) => R.trackCatalog.find(t => t.id === id);

const wiese = new R.Strecke(katalog('wiese'), { welt: 'stunt' }), sp = wiese.spline;
const sch12 = S.liste(wiese).find(e => e.grad === 12), sch8 = S.liste(wiese).find(e => e.grad === 8);
pruefe('Wiese (Stunt) hat Schanzen 8° und 12°', !!sch12 && !!sch8, S.liste(wiese).map(e => e.grad + '°@' + e.s.toFixed(0)).join(', '));
pruefe('hoeheAuf: 0 davor, tan(12°)·5 in der Mitte, Kante = laenge·tan', S.hoeheAuf(wiese, sch12.s - 1) === 0 &&
  Math.abs(S.hoeheAuf(wiese, sch12.s + 5) - 5 * Math.tan(12 * Math.PI / 180)) < 1e-9 && Math.abs(S.hoeheAuf(wiese, sch12.s + 10) - sch12.hoehe) < 1e-9 &&
  S.hoeheAuf(wiese, sch12.s + 10.5) === 0, 'Kante ' + sch12.hoehe.toFixed(2) + ' m');

/** Auto 15 m vor der Schanze, Tempo v, Seitenabstand q, Heading-Abweichung dh (rad). */
function aufstellen(strecke, schanze, v0, q, dh) {
  const p = strecke.spline.punktBei(schanze.s - 15);
  const v = new R.Vehicle({});
  v.setzen(p.x + p.nx * (q || 0), p.z + p.nz * (q || 0), R.headingAus(p.tx, p.tz) + (dh || 0));
  v.vLaengs = v0;
  return { v, fz: S.zustand(), index: -1 };
}
/** Fahren mit fester Steuerung, Tempo (ohne Gas) wird vor der Kante gehalten. Liefert Verlauf. */
function fahren(strecke, a, steuerung, n, halten) {
  const verlauf = [];
  for (let k = 0; k < n; k++) {
    if (halten !== undefined && !a.fz.aktiv && a.fz.fluege === 0) a.v.vLaengs = halten;
    const vor = a.v.vLaengs;
    const r = S.fahrzeugSchritt(a.fz, a.v, strecke, steuerung, dt, a.index);
    a.index = r.index;
    verlauf.push({ e: r.ereignis, vor, nach: a.v.vLaengs, y: a.v.y, boden: strecke.hoeheAn(a.v.x, a.v.z), luft: a.fz.aktiv, rampe: !!a.fz.rampe,
      nick: S.anzeigeNicken(a.fz, 1), imFlug: !!a.v.imFlug });
    if (r.ereignis === 'landung' || r.ereignis === 'landungSchraeg') break;
  }
  return verlauf;
}

// ---------- 30 m/s über 12° ----------
{
  const a = aufstellen(wiese, sch12, 30, 0);
  const vl = fahren(wiese, a, { gas: 0, bremse: 0, lenkung: 0 }, 600, 30);
  const ev = vl.filter(x => x.e).map(x => x.e);
  const land = vl[vl.length - 1];
  pruefe('30 m/s / 12°: abflug → sprung → landung', ev[0] === 'abflug' && ev.includes('sprung') && land.e === 'landung', ev.join(' → '));
  pruefe('30 m/s / 12°: Flugzeit ≥ 1 s', a.fz.letzteFlugzeit >= 1, a.fz.letzteFlugzeit.toFixed(2) + ' s');
  pruefe('30 m/s / 12°: Weite ≥ 25 m', a.fz.letzteWeite >= 25, a.fz.letzteWeite.toFixed(1) + ' m');
  pruefe('30 m/s / 12°: landet auf der Straße, sauber', a.fz.letzteLandung.aufStrasse && a.fz.letzteLandung.sauber,
    'q=' + a.fz.letzteLandung.seitenabstand.toFixed(2) + ' m, ' + a.fz.letzteLandung.winkel.toFixed(1) + '°');
  const vor = a.fz.tempoVorLandung;
  pruefe('30 m/s / 12°: Tempo × 0,95 bei der Landung', Math.abs(land.nach - vor * C.landungSauber) < 1e-9, vor.toFixed(2) + ' → ' + land.nach.toFixed(2));
  const rampe = vl.filter(x => x.rampe);
  const maxRampe = Math.max(...rampe.map(x => x.y - x.boden));
  pruefe('Rampe: y steigt bis ~Kantenhöhe, Bug hoch', rampe.length > 5 && maxRampe > sch12.hoehe - 0.6 && maxRampe <= sch12.hoehe + 1e-6 &&
    Math.max(...rampe.map(x => x.nick)) > 0.12, 'max ' + maxRampe.toFixed(2) + ' m, Nicken ' + (Math.max(...rampe.map(x => x.nick)) * 180 / Math.PI).toFixed(1) + '°');
  const luft = vl.filter(x => x.luft);
  const hoch = Math.max(...luft.map(x => x.y - x.boden));
  pruefe('Flug: Scheitel über der Kante, imFlug gesetzt, nach Landung frei', hoch > sch12.hoehe && luft.every(x => x.imFlug) && !a.v.imFlug,
    'Scheitel ' + hoch.toFixed(2) + ' m über Boden');
  pruefe('Flug: Bug erst hoch, dann runter', Math.max(...luft.map(x => x.nick)) > 0.05 && Math.min(...luft.map(x => x.nick)) < -0.05);
  pruefe('Landung: Nick-Impuls Bug runter', land.nick < -0.02, (land.nick * 180 / Math.PI).toFixed(1) + '°');
  const nach = fahren(wiese, a, { gas: 1, bremse: 0, lenkung: 0 }, 60);
  pruefe('Danach normal weiter (Nicken klingt ab, auf dem Boden)', nach.every(x => !x.luft && Math.abs(x.y - x.boden) < 1e-9) && Math.abs(nach[nach.length - 1].nick) < 0.005);
}

// ---------- 15 m/s (knapp über dem Mindesttempo): kurzer Hüpfer; 10 m/s: Notstopp (Runde 5) ----------
{
  const a = aufstellen(wiese, sch12, 15, 1);
  const vl = fahren(wiese, a, { gas: 0 }, 600, 15);
  pruefe('15 m/s / 12°: kurzer Hüpfer (< 1,2 s, < 18 m), sauber', vl[vl.length - 1].e === 'landung' && a.fz.letzteFlugzeit < 1.2 && a.fz.letzteWeite < 18,
    a.fz.letzteFlugzeit.toFixed(2) + ' s, ' + a.fz.letzteWeite.toFixed(1) + ' m, sprung-Meldung ' + vl.some(x => x.e === 'sprung'));
  const b = aufstellen(wiese, sch12, 10, 1);
  const vb = fahren(wiese, b, { gas: 0 }, 120, undefined);
  const nb = sp.naechster(b.v.x, b.v.z);
  pruefe('10 m/s (unter schanzeMin, ohne Anlauf-Bremse): kein Auffahren, Notstopp vor der Rampe', vb.some(x => x.e === 'zuLangsam') &&
    b.fz.fluege === 0 && vb.every(x => !x.rampe && !x.luft) && sp.differenzS(nb.s, sch12.s) < 0 && b.v.vLaengs === 0,
    'steht ' + (-sp.differenzS(nb.s, sch12.s)).toFixed(2) + ' m vor der Rampe');
}
// ---------- 8°-Schanze 30 m/s ----------
{
  const a = aufstellen(wiese, sch8, 30, -2);
  fahren(wiese, a, { gas: 0 }, 600, 30);
  pruefe('30 m/s / 8°: fliegt kürzer als 12°, landet sauber', a.fz.landungen === 1 && a.fz.letzteLandung.sauber && a.fz.letzteFlugzeit > 0.6,
    a.fz.letzteFlugzeit.toFixed(2) + ' s, ' + a.fz.letzteWeite.toFixed(1) + ' m');
}
// ---------- 75 m/s (270 km/h): vyMax deckelt, Landung noch auf der Geraden ----------
{
  const a = aufstellen(wiese, sch12, 75, 0);
  fahren(wiese, a, { gas: 0 }, 900, 75);
  pruefe('75 m/s / 12°: Weite ≤ 120 m (vyMax), sauber auf der Straße', a.fz.letzteWeite <= 120 && a.fz.letzteLandung.sauber,
    a.fz.letzteFlugzeit.toFixed(2) + ' s, ' + a.fz.letzteWeite.toFixed(1) + ' m');
}
// ---------- Landung quer → × 0,8 ----------
{
  const a = aufstellen(wiese, sch12, 30, 0);
  // bis zum Abflug normal, dann im Flug quer drehen (35°)
  let vor = 0, land = null;
  for (let k = 0; k < 600; k++) {
    if (!a.fz.aktiv && a.fz.fluege === 0) a.v.vLaengs = 30;
    if (a.fz.aktiv && a.fz.t > 0.3 && !a.gedreht) { a.v.heading += 35 * Math.PI / 180; a.gedreht = true; }
    vor = a.v.vLaengs;
    const r = S.fahrzeugSchritt(a.fz, a.v, wiese, { gas: 0 }, dt, a.index); a.index = r.index;
    if (r.ereignis === 'landung' || r.ereignis === 'landungSchraeg') { land = r.ereignis; break; }
  }
  pruefe('Landung quer (35°): landungSchraeg, Tempo × 0,8', land === 'landungSchraeg' && Math.abs(a.v.vLaengs - a.fz.tempoVorLandung * C.landungSchraeg) < 1e-9,
    land + ', ' + a.fz.tempoVorLandung.toFixed(1) + ' → ' + a.v.vLaengs.toFixed(1));
}
// ---------- Landung abseits → × 0,8 ----------
{
  const a = aufstellen(wiese, sch12, 30, 5.5);
  // im Flug nach rechts versetzen (wie Seitenwind) → landet neben der Fahrbahn
  let land = null;
  for (let k = 0; k < 600 && !land; k++) {
    if (!a.fz.aktiv && a.fz.fluege === 0) a.v.vLaengs = 30;
    if (a.fz.aktiv) a.v.vQuer = 5;
    const r = S.fahrzeugSchritt(a.fz, a.v, wiese, { gas: 0 }, dt, a.index); a.index = r.index;
    if (r.ereignis === 'landung' || r.ereignis === 'landungSchraeg') land = r.ereignis;
  }
  pruefe('Landung abseits: landungSchraeg (aufStrasse = false)', land === 'landungSchraeg' && !a.fz.letzteLandung.aufStrasse,
    'q=' + a.fz.letzteLandung.seitenabstand.toFixed(1) + ' m');
}
// ---------- Rampe nur von vorne und auf der Fahrbahn ----------
{
  const a = aufstellen(wiese, sch12, 30, wiese.breite / 2 + 3);    // neben der Straße
  const vl = fahren(wiese, a, { gas: 0 }, 120, 30);
  pruefe('Neben der Fahrbahn: keine Rampe, kein Flug', vl.every(x => !x.rampe && !x.luft) && a.fz.fluege === 0);
  // rückwärts über die Kante: keine Rampe
  const p = sp.punktBei(sch12.s + sch12.laenge + 8), v = new R.Vehicle({});
  v.setzen(p.x, p.z, R.headingAus(-p.tx, -p.tz)); v.vLaengs = 20;
  const b = { v, fz: S.zustand(), index: -1 };
  const vb = fahren(wiese, b, { gas: 0 }, 90, 20);
  pruefe('Falsch herum über die Schanze: kein Flug', vb.every(x => !x.luft) && b.fz.fluege === 0);
}
// ---------- Abbrechen (Reset) ----------
{
  const a = aufstellen(wiese, sch12, 30, 0);
  for (let k = 0; k < 600 && !a.fz.aktiv; k++) { a.v.vLaengs = 30; S.fahrzeugSchritt(a.fz, a.v, wiese, { gas: 0 }, dt, -1); }
  S.abbrechen(a.fz, a.v);
  pruefe('abbrechen(): nicht mehr in der Luft, imFlug false, hoehe = Boden', !S.inLuft(a.fz) && !a.v.imFlug &&
    S.hoehe(a.fz, a.v, wiese) === wiese.hoeheAn(a.v.x, a.v.z));
}

// ---------- Kollisionen: Auto im Flug (Einbau collisions.js: imFlug wie imLooping) ----------
{
  const paar = (flug) => { const a = new R.Vehicle({}), b = new R.Vehicle({}); a.setzen(0, 0, 0); b.setzen(0, -3, 0); a.vLaengs = 10; a.imFlug = flug;
    a.x += 0; return R.Kollisionen.autoAuto([a, b]).length; };
  const ohne = paar(false), mit = paar(true);
  console.log('INFO autoAuto: ohne imFlug ' + ohne + ' Stoß, mit imFlug ' + mit + (ohne && !mit ? ' → collisions.js kennt imFlug' : ' → Einbau in collisions.js noch offen'));
}

// ---------- Welten: Schanzen nur in Stunt/Verrückt ----------
['wiese', 'wald', 'wueste', 'fantasie'].forEach((id) => {
  const d = katalog(id);
  Object.keys(d.welten).forEach((w) => {
    const st = new R.Strecke(d, { welt: w }), soll = d.welten[w].schanzen ? (d.schanzen || []).length : 0;
    if (w === 'stunt' || w === 'verrueckt' || st.schanzen.length) pruefe(id + '/' + w + ': ' + soll + ' Schanzen', S.liste(st).length === soll);
    else if (st.schanzen.length !== 0) pruefe(id + '/' + w + ': keine Schanzen', false);
  });
});

// ---------- Runde 5: Anlauf-Bremse, Anlaufposition, Vollgas von dort ----------
{
  const AN = R.Anlauf, CA = R.config.anlauf, klassen = Object.keys(R.config.tempoKlassen || { schnell: 1 });
  /** Spurhalter (Tangente + Mitte). */
  const spur = (st, v, gas) => {
    const n = st.spline.naechster(v.x, v.z), p = st.spline.punktBei(n.s + 4);
    const fehler = R.Vehicle.winkelDiff(v.heading, R.headingAus(p.tx, p.tz));
    return { gas, bremse: 0, lenkung: Math.max(-1, Math.min(1, fehler * 2.5 - n.seitenabstand * 0.08)) };
  };
  ['wiese', 'wald', 'wueste'].forEach((id) => {
    const st = new R.Strecke(katalog(id), { welt: 'stunt' }), stl = AN.stellen(st), ssp = st.spline;
    pruefe(`${id}: Anlauf-Stellen = Schanzen`, stl.length === S.liste(st).length && stl.every(x => x.art === 'schanze'),
      stl.map(x => 's=' + x.s.toFixed(0) + ' ' + x.abstand + ' m (' + x.quelle + ')').join(' | '));
    stl.forEach((sx, nr) => {
      // a) 50 m davor mit 10 m/s ohne Gas → sanfter Stopp 10 m davor
      {
        const p = ssp.punktBei(sx.s - 50), v = new R.Vehicle({});
        v.setzen(p.x, p.z, R.headingAus(p.tx, p.tz)); v.vLaengs = 10;
        const az = AN.zustand(), fz = S.zustand(); let index = -1, ev = [], maxV = 0, vAlt = 10;
        for (let k = 0; k < 60 * 8; k++) {
          const r = S.fahrzeugSchritt(fz, v, st, spur(st, v, 0), dt, index, undefined, az); index = r.index; if (r.ereignis) ev.push(r.ereignis);
          if (az.bremst && vAlt > 1.5) maxV = Math.max(maxV, (vAlt - v.vLaengs) / dt); vAlt = v.vLaengs;
        }
        const d = ssp.differenzS(sx.s, ssp.naechster(v.x, v.z).s);
        // (je nach Rollwiderstand bremst die Anlauf-Bremse auf 10 m, oder das Auto rollt vorher von selbst aus → gleicher Zustand)
        pruefe(`${id} Schanze ${nr + 1}: 10 m/s → Stopp ${CA.stopp}–${CA.stopp + 5} m davor, kein Flug, R-Zustand`, (ev[0] === 'zuLangsam' || ev[0] === 'gestoppt') &&
          fz.fluege === 0 && d > CA.stopp - 0.6 && d < CA.stopp + 5 && v.vLaengs === 0 && maxV <= CA.bremsVerz + 0.6 && AN.aktiv(az),
          d.toFixed(2) + ' m, ' + maxV.toFixed(1) + ' m/s², ' + ev.join(','));
        // rückwärts, dann R → Anlaufposition
        for (let k = 0; k < 120; k++) { const r = S.fahrzeugSchritt(fz, v, st, Object.assign(spur(st, v, 0), { lenkung: 0, bremse: 1 }), dt, index, undefined, az); index = r.index; }
        const dz = ssp.differenzS(sx.s, ssp.naechster(v.x, v.z).s);
        const pose = AN.zurAnlaufposition(az, v, st, []);
        const nP = ssp.naechster(pose.x, pose.z);
        pruefe(`${id} Schanze ${nr + 1}: rückwärts möglich, R → Anlaufposition ${sx.abstand} m davor`, dz > CA.stopp + 3 &&
          Math.abs(ssp.differenzS(sx.s, nP.s) - sx.abstand) < 0.6 && v.vLaengs === 0, 'rückwärts bis ' + dz.toFixed(1) + ' m, dann ' + ssp.differenzS(sx.s, nP.s).toFixed(1) + ' m');
      }
      // b) Von der Anlaufposition Vollgas (Spurhalter): alle Autos × Klassen fliegen, Absprung ≥ schanzeMin + 10 %
      {
        const pose = AN.position(st, sx, [], null);
        let alle = 0, ok = 0, minV = Infinity, wer = '', schlecht = [];
        R.carCatalog.forEach((auto) => klassen.concat(['worst']).forEach((k) => {
          const v = new R.Vehicle(auto.fahrwerte, { tempoKlasse: k === 'worst' ? null : k });
          if (k === 'worst') { v.daten.vMax = auto.fahrwerte.vMax * 0.7; v.daten.beschleunigung = auto.fahrwerte.beschleunigung * 0.85; }
          v.setzen(pose.x, pose.z, pose.heading);
          const az = AN.zustand(), fz = S.zustand(); let index = -1, vAb = null;
          for (let i = 0; i < 60 * 20 && fz.landungen === 0; i++) {
            const r = S.fahrzeugSchritt(fz, v, st, spur(st, v, 1), dt, index, undefined, az); index = r.index;
            if (r.ereignis === 'abflug' && vAb === null) vAb = v.vLaengs;
          }
          alle++;
          const gut = fz.fluege >= 1 && az.eingriffe === 0 && vAb >= sx.vMin * (1 + CA.reserve);
          if (gut) ok++; else schlecht.push(auto.id + '/' + k + ' ' + (vAb ? (vAb * 3.6).toFixed(0) + ' km/h' : 'kein Flug, Eingriffe ' + az.eingriffe));
          if (vAb !== null && vAb < minV) { minV = vAb; wer = auto.id + '/' + k; }
        }));
        pruefe(`${id} Schanze ${nr + 1}: von der Anlaufposition mit Vollgas fliegen alle (${alle} Läufe)`, ok === alle,
          `langsamster Absprung ${(minV * 3.6).toFixed(0)} km/h (${wer})` + (schlecht.length ? ' | FEHL: ' + schlecht.join('; ') : ''));
      }
    });
  });
}

// ---------- KI: alle 7 Stufen, 1 Runde, jede Schanze geflogen und auf der Straße gelandet ----------
const STUFEN = Object.keys(R.config.schwierigkeiten).sort((x, y) => R.config.schwierigkeiten[x].rang - R.config.schwierigkeiten[y].rang);
['wiese', 'wald', 'wueste'].forEach((id) => {
  const strecke = new R.Strecke(katalog(id), { welt: 'stunt' }), n = S.liste(strecke).length;
  STUFEN.forEach((stufe) => {
    const start = strecke.startpositionen(1)[0];
    const v = new R.Vehicle({});
    v.setzen(start.x, start.z, start.heading);
    const rennen = new R.RaceManager(strecke, [{ vehicle: v, name: 'KI', istSpieler: false }], { runden: 1, countdown: 0 });
    const d = new R.Driver(v, strecke, { schwierigkeit: stufe, seed: 11, name: 'KI' });
    const t = rennen.teilnehmer[0], fz = S.zustand(), az = R.Anlauf.zustand();
    let index = -1, vMin = Infinity, vMaxAb = 0;
    for (let k = 0; k < 60 * 240 && !t.imZiel; k++) {
      const s = d.steuerung(dt, { andere: [], spielerFortschrittMax: null, eigenerFortschritt: t.fortschritt, laeuft: true });
      if (d.brauchtReset) break;
      const r = S.fahrzeugSchritt(fz, v, strecke, s, dt, index, undefined, az);
      index = r.index;
      if (r.ereignis === 'abflug') { vMin = Math.min(vMin, v.vLaengs); vMaxAb = Math.max(vMaxAb, v.vLaengs); }
      rennen.schritt(dt);
    }
    pruefe(`KI ${id} ${stufe}: Runde fertig, ${n}/${n} Schanzen geflogen, alle sauber auf der Straße`,
      t.imZiel && fz.fluege === n && fz.landungen === n && fz.schraeg === 0 && fz.abseits === 0 && az.eingriffe === 0,
      `${t.rundenzeiten.map(z => z.toFixed(1)).join('/')} s | Flüge ${fz.fluege}, schräg ${fz.schraeg}, abseits ${fz.abseits} | ` +
      `Absprung ${(vMin * 3.6).toFixed(0)}–${(vMaxAb * 3.6).toFixed(0)} km/h | max. Flug ${fz.maxFlugzeit.toFixed(2)} s`);
  });
});

console.log(fehler === 0 ? '\nALLE TESTS OK' : '\n' + fehler + ' FEHLER');
process.exit(fehler ? 1 : 0);
