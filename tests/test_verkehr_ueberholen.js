// Verkehr: Krankenwagen/Abschleppwagen verschwinden NICHT mitten im Überholvorgang (v28 W2): node tests/test_verkehr_ueberholen.js [--zaehlen]
// Ein Teilnehmer (Autopilot) überholt einen Krankenwagen und einen Abschleppwagen (wiese, alpen; 50 Fälle: Abstand, Querlage, Tempo, Berührung).
// Gezählt wird jedes Verschwinden, bei dem ein Teilnehmer ≤ 80 m entfernt war (Verschwinden unter den Augen). Erwartung nachher: 0.
//   --zaehlen : nur zählen und ausgeben (kein Abbruchcode) – für den Vorher-Stand
const S = require('../server/simulation.js');
const { Simulation, laden } = S;
const R = laden();
const nurZaehlen = process.argv.includes('--zaehlen');
let fehler = 0, geprueft = 0;
function pruefe(name, ok, info) { geprueft++; console.log((ok ? 'OK   ' : 'FEHL ') + name + (info !== undefined ? '  (' + info + ')' : '')); if (!ok && !nurZaehlen) fehler++; }

function autopilot(st, v, idx, anteil) {
  const n = st.abfrage(v.x, v.z, idx), sp = st.spline;
  const vl = Math.max(3, v.vLaengs), L = Math.max(9, Math.min(50, 0.55 * vl + 8));
  const ziel = sp.punktBei(n.s + L);
  let diff = R.headingAus(ziel.x - v.x, ziel.z - v.z) - v.heading;
  while (diff > Math.PI) diff -= 2 * Math.PI;
  while (diff < -Math.PI) diff += 2 * Math.PI;
  const lenkung = Math.max(-1, Math.min(1, -(2 * vl * Math.sin(diff) / Math.hypot(ziel.x - v.x, ziel.z - v.z)) / v.drehrateMax(vl)));
  const soll = st.tempoBei(n.s + vl * 0.3) * anteil;
  return { s: { gas: v.vLaengs < soll ? 1 : 0, bremse: v.vLaengs > soll + 3 ? 0.5 : 0, lenkung }, idx: n.index };
}

// Fälle: wiese/alpen × Art × (Abstand hinter dem Wagen, Querversatz des Teilnehmers, Tempoanteil)
const faelle = [];
for (const strecke of ['wiese', 'alpen']) {
  for (const art of ['krankenwagen', 'abschleppwagen']) {
    const abst = [25, 45, 70, 100, 130], quer = [0, 0.15, -0.2], anteil = [0.7, 0.85, 1.0];
    let k = 0;
    for (const a of abst) for (const q of quer) { faelle.push({ strecke, art, abstand: a, quer: q, anteil: anteil[k++ % anteil.length] }); }
  }
}
// 2 Strecken × 2 Arten × 15 = 60 -> auf 50 begrenzen (gleichmäßig weglassen)
const wahl = faelle.filter((_, i) => i % 6 !== 5).slice(0, 50);

let verschwunden = 0, nah80 = 0, nah120 = 0, halt12 = 0;
const schlecht = [];
for (const f of wahl) {
  const sim = new Simulation({ einstellungen: { streckeId: f.strecke, runden: 3, gegner: 0, tageszeit: 'tag', jahreszeit: 'sommer', wetter: 'klar', windStaerke: 0,
    krankenwagen: true, abschleppwagen: true, verkehr: 'wenig' }, spieler: [{ fahrer: 'Jonas', auto: 'porsche-911', hilfe: 'aus' }], seed: 5 });
  const st = sim.sim.strecke, vk = sim.sim.verkehr, P = sim.sim.fahrzeuge[0].vehicle;
  const L = st.spline.laenge;
  for (let n = 0; n < 60 * 25 && !sim.sim.rennen.gasErlaubt; n++) sim.schritt();
  const ziel = vk.eintraege.find((e) => e.art === f.art), anderer = vk.eintraege.find((e) => e.art !== f.art && e.art !== 'geisterfahrer');
  // freie Fahrstrecke suchen: Abschnitt mit ≥ 600 m ab s0 (aus den freien Abschnitten des Verkehrs)
  const frei = vk.frei.filter((a) => a[1] - a[0] >= 700).sort((a, b) => (b[1] - b[0]) - (a[1] - a[0]))[0] || vk.frei[0];
  const s0 = frei[0] + 20 + f.abstand;                                       // Wagen erscheint hier; Teilnehmer f.abstand dahinter
  ziel.route = { a: frei[0] + 20, b: frei[1] };
  ziel.ast = 0;
  const spurQ = f.art === 'krankenwagen' ? R.config.verkehr.krankenwagen.spurQ : R.config.verkehr.abschleppwagen.spurQ;
  vk._erscheinen(ziel, s0, spurQ, ziel.tempo * 0.8);
  if (anderer) { anderer.pause = 1e9; }
  // Teilnehmer: f.abstand m hinter dem Wagen, auf der Querlage 0 + f.quer·halbe Breite
  const sP = s0 - f.abstand, pt = st.spline.punktBei(sP), halb = (st.breiteBei ? st.breiteBei(sP) : st.breite) / 2;
  const nx = -pt.tz, nz = pt.tx;
  const ref = vk._pt && null;
  void ref;
  P.setzen(pt.x + nx * halb * f.quer * 0.9 + 0, pt.z + nz * halb * f.quer * 0.9, R.headingAus(pt.tx, pt.tz));
  P.vLaengs = 30;
  let idx = -1, verschwandAm = null;
  const orig = vk._verschwinden.bind(vk);
  const fahrzeuge = sim.sim.fahrzeuge;
  vk._verschwinden = function (e) {
    if (e === ziel && verschwandAm === null) {
      const v = e.f.vehicle;
      const grund = (e.steckt > R.config.verkehr.steckenZeit || e.abseits > R.config.verkehr.abseitsZeit) ? 'steckt' : (e.f.nah && e.route && e.f.nah.s >= e.route.b - 40) ? 'routenende' : 'sonst';
      verschwandAm = { halt: !!e.halt, grund, rest: e.route ? e.route.b - (e.f.nah ? e.f.nah.s : 0) : 0, d: Math.hypot(fahrzeuge[0].vehicle.x - v.x, fahrzeuge[0].vehicle.z - v.z), steckt: e.steckt, abseits: e.abseits, sNah: e.f.nah && e.f.nah.s, ende: e.route && e.route.b, t: sim.sim.rennen.zeit };
    }
    return orig(e);
  };
  for (let n = 0; n < 60 * 40; n++) {
    R.Netz.fahrzeugSchreiben && 0;
    const a = autopilot(st, P, idx, f.anteil); idx = a.idx;
    sim.eingabeSetzen(0, a.s); sim.schritt();
    if (verschwandAm) break;
  }
  if (verschwandAm) {
    verschwunden++;
    if (verschwandAm.halt) { halt12++; vk._verschwinden = orig; continue; }   // v28 A2: Verschwinden im Halt (nach haltMax s, Kamera > 40 m) ist gewollt; geprüft wird nur die Fahrt
    if (verschwandAm.d <= 80) { nah80++; schlecht.push(`${f.strecke}/${f.art} abst ${f.abstand} q ${f.quer} v ${f.anteil}: d=${verschwandAm.d.toFixed(0)} m grund=${verschwandAm.grund} steckt=${verschwandAm.steckt.toFixed(1)} abseits=${verschwandAm.abseits.toFixed(1)} bis Routenende ${verschwandAm.rest.toFixed(0)} m`); }
    if (verschwandAm.d <= 120) nah120++;
  }
  vk._verschwinden = orig;
}
console.log(`Fälle ${wahl.length}, Verschwinden gesamt ${verschwunden}, davon Teilnehmer <= 80 m: ${nah80}, <= 120 m: ${nah120}, davon im Halt (ausgenommen): ${halt12}`);
schlecht.slice(0, 12).forEach((s) => console.log('   ' + s));
pruefe('W2 Wagen verschwindet nie mit Teilnehmer <= 80 m', nah80 === 0, `${nah80} von ${wahl.length}`);
pruefe('W2 Wagen verschwindet nie mit Teilnehmer <= 120 m', nah120 === 0, `${nah120} von ${wahl.length}`);
console.log(`\n${geprueft} geprüft, ${fehler} Fehler`);
process.exit(fehler ? 1 : 0);
