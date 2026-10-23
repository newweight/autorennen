// v33 K1/K2: node tests/test_tiere_ausweichen.js [kurz]
//  K1) Computerfahrer (KI) weichen Tieren nach Lage aus: Tier links der eigenen Linie → rechts vorbei, rechts → links vorbei, mittig → freie Seite (gleich: rechts);
//      Entscheidung bleibt bis vorbei (kein Zickzack), kein Kontakt; Einheit: andere Autos neben dem Tier sperren die Seite, Straßenrand sperrt die Seite
//  K2) Polizei, Krankenwagen, Abschleppwagen, Geisterfahrer fahren NICHT durch Tiere: bremsen/weichen aus, wo nichts geht halten sie kurz (höchstens Standzeit des Tiers + 4 s) und fahren weiter
//      Kein Tier-Drama: Tiere erschrecken nur (Tempo −30 %, kein Schaden) – hier geprüft: Kontakt nur bei unvermeidbarem Auftauchen
// Server = Client: alles über server/simulation.js (lädt dieselben Module wie der Browser)
const S = require('../server/simulation.js');
const { Simulation, laden } = S;
const R = laden();
const KURZ = process.argv.includes('kurz');
let fehler = 0, geprueft = 0;
function pruefe(name, ok, info) { geprueft++; console.log((ok ? 'OK   ' : 'FEHL ') + name + (info !== undefined ? '  (' + info + ')' : '')); if (!ok) fehler++; }
const Tiere = R.Tiere;
const L2 = (s, L) => ((s % L) + L) % L;
const EINST = { runden: 40, gegner: 1, tageszeit: 'tag', jahreszeit: 'sommer', wetter: 'klar', windStaerke: 0, schwierigkeit: 'mittel' };
function neueStreckeEinheit(id) { return new R.Strecke(R.trackCatalog.find((d) => d.id === id), { welt: R.Strecke.weltName(R.trackCatalog.find((d) => d.id === id), ''), variante: '' }); }
function neu(opt, seed) {
  return new Simulation({ einstellungen: Object.assign({}, EINST, opt), spieler: [{ fahrer: 'Jonas', auto: 'porsche-911', hilfe: 'aus' }], seed: seed || 11 });
}
const stehend = (g, q, dauer) => g.forEach((x) => { x.zustand = 'steht'; x.stehtNoch = dauer; x.stehDauer = dauer; x.ziel = 0; x.faktor = 0; x.q = q; x.schonGestanden = true; });
const reversals = (xs, schwelle) => { let n = 0, last = 0, ext = xs[0]; for (let i = 1; i < xs.length; i++) { const d = xs[i] - ext; if (Math.abs(d) > schwelle) { const sg = Math.sign(d); if (last && sg !== last) n++; last = sg; ext = xs[i]; } else if (!last || (last > 0 && xs[i] > ext) || (last < 0 && xs[i] < ext)) ext = xs[i]; } return n; };

// ---------------- K1 Simulation: stehendes Tier links / rechts / auf der eigenen Linie der KI
// Nur ein Computerauto (zuKI(0)), die anderen Autos weit weg. Tier steht (erschreckt nicht), 80 m voraus, q = Lage der KI + delta.
function k1Fall(streckeId, delta, seed) {
  const sim = neu({ streckeId, tiere: true }, seed), st = sim.sim.strecke, T = sim.sim.tiere, L = st.spline.laenge;
  sim.zuKI(0); T.c = Object.assign({}, T.c, { erschreckAbstand: 0 });
  const f1 = sim.sim.fahrzeuge[1], v1 = f1.vehicle;
  let wait = 0, akt = null;
  for (let n = 0; n < 60 * 3000; n++) {
    sim.schritt(); const rz = sim.sim.rennen; if (!rz.gasErlaubt) continue; T.naechster = 1e9;
    if (!akt) {
      wait++;
      if (wait > 60 + seed * 7 && f1.nah && v1.vLaengs > 20 && sim.sim.fahrzeuge.every((f) => f === f1 || Math.hypot(f.vehicle.x - v1.x, f.vehicle.z - v1.z) > 150) &&
          !Tiere.gesperrt(T.zonen, L2(f1.nah.s + 140, L), 60) && !Tiere.gesperrt(T.zonen, L2(f1.nah.s, L), 20)) {
        const nn = st.spline.naechster(v1.x, v1.z, f1.index), grenze = (st.breiteBei ? st.breiteBei(nn.s) : st.breite) / 2;
        const g = T.erzwingen({ art: T.arten[0], sM: f1.nah.s + 80, von: 1, winkel: 90, richtung: 1, anzahl: 1, fortschritt: 0.5 });
        if (!g) { wait = 0; continue; }
        const q = Math.max(-grenze + 1.5, Math.min(grenze - 1.5, nn.seitenabstand + delta));
        stehend(g, q, 14);
        akt = { t0: rz.zeit, tier: g[0], qT: q, q0: nn.seitenabstand, rel: [], vmin: 1e9, dmin: 1e9, qPass: null };
      }
      continue;
    }
    const sl = T.slots[akt.tier.slot], nn = st.spline.naechster(v1.x, v1.z, f1.index), ds = st.spline.differenzS(akt.tier.s, nn.s);
    akt.vmin = Math.min(akt.vmin, v1.vLaengs);
    if (sl.aktiv) akt.dmin = Math.min(akt.dmin, Math.hypot(sl.x - v1.x, sl.z - v1.z));
    if (ds > -4 && ds < 40) akt.rel.push(nn.seitenabstand - akt.qT);
    if (akt.prev > 0 && ds <= 0 && akt.qPass === null) akt.qPass = nn.seitenabstand - akt.tier.q;
    akt.prev = ds;
    if (rz.zeit - akt.t0 > 13) { akt.kontakt = akt.tier.getroffen.has(1); let last = 0, w = 0; for (const x of akt.rel) { if (Math.abs(x) > 0.5) { const sg = Math.sign(x); if (last && sg !== last) w++; last = sg; } } akt.wechsel = w; return akt; }
  }
  return null;
}
{
  const strecken = KURZ ? ['wiese'] : ['wiese', 'wald'];
  const faelle = [], deltas = [-2.5, -1.2, 1.2, 2.5, 0];
  for (const id of strecken) for (const d of deltas) for (const seed of [11, 12]) { const a = k1Fall(id, d, seed); if (a) { a.id = id; a.d = d; faelle.push(a); } }
  const gesamt = strecken.length * deltas.length * 2;
  pruefe('K1 alle Fälle ausgewertet', faelle.length === gesamt, faelle.length + '/' + gesamt);
  // nach der tatsächlichen Lage beim Aufstellen (am Rand wird das Tier ggf. näher an die Linie geschoben): Tier links der Linie = Auto rechts vom Tier
  const links = faelle.filter((a) => a.q0 - a.qT > 0.8), rechts = faelle.filter((a) => a.q0 - a.qT < -0.8), mitte = faelle.filter((a) => Math.abs(a.q0 - a.qT) <= 0.8);
  const info = (xs) => xs.map((a) => a.id[0] + a.d + ':' + (a.qPass === null ? '?' : (a.qPass > 0 ? 'R' : 'L'))).join(' ');
  pruefe('K1 Tier links der eigenen Linie → KI fährt rechts vorbei', links.length > 0 && links.every((a) => a.qPass !== null && a.qPass > 0), info(links));
  pruefe('K1 Tier rechts der eigenen Linie → KI fährt links vorbei', rechts.length > 0 && rechts.every((a) => a.qPass !== null && a.qPass < 0), info(rechts));
  pruefe('K1 Tier auf der Linie → eine Seite gewählt, ohne Kontakt', mitte.length > 0 && mitte.every((a) => a.qPass !== null && !a.kontakt), info(mitte));
  pruefe('K1 kein Zickzack: Seite zum Tier wechselt nie (0 Wechsel in allen Fällen)', faelle.every((a) => a.wechsel === 0), faelle.map((a) => a.wechsel).join(''));
  pruefe('K1 kein Kontakt in allen Fällen', faelle.every((a) => !a.kontakt), faelle.filter((a) => a.kontakt).map((a) => a.id + a.d).join(' ') || 'keiner');
  pruefe('K1 Abstand zum Tier ≥ 1,8 m (Mitte–Mitte) in allen Fällen', faelle.every((a) => a.dmin >= 1.8), 'min ' + Math.min.apply(null, faelle.map((a) => a.dmin)).toFixed(2));
  const beide = new Set(faelle.filter((a) => a.d === 0).map((a) => a.qPass > 0 ? 'R' : 'L'));
  void beide;
}

// ---------------- K1 Einheit: Seitenwahl am Driver direkt (keine Simulation) – Lage, andere Autos, Straßenrand, Halten der Entscheidung
{
  const st = neueStreckeEinheit('wiese'), sp = st.spline, p = sp.punktBei(300), nx = p.nx, nz = p.nz;
  const mk = (qMe) => { const v = new R.Vehicle(R.carCatalog.find((a) => a.id === 'porsche-911').fahrwerte, {}); v.setzen(p.x + nx * qMe, p.z + nz * qMe, R.headingAus(p.tx, p.tz)); v.vLaengs = 30; return v; };
  const fremd = (q, ds, tempo) => { const pt = sp.punktBei(300 + ds); return { istSpieler: false, ausgeschieden: false, vehicle: { x: pt.x + pt.nx * q, z: pt.z + pt.nz * q, y: 0, heading: R.headingAus(pt.tx, pt.tz), vLaengs: tempo, vQuer: 0, imLooping: false, imFlug: false, daten: { laenge: 4.5, breite: 1.8 },
    weltGeschwindigkeit() { return { x: pt.tx * tempo, z: pt.tz * tempo }; }, richtung() { return { x: pt.tx, z: pt.tz }; } } }; };
  const tier = (q, ds) => { const pt = sp.punktBei(300 + ds); return { istSpieler: false, tier: true, ausgeschieden: false, vehicle: { x: pt.x + pt.nx * q, z: pt.z + pt.nz * q, y: 0, heading: 0, vLaengs: 0, vQuer: 0, imLooping: false, imFlug: false, tier: true, vx: 0, vz: 0, daten: { laenge: 1.9, breite: 1.8 },
    weltGeschwindigkeit() { return { x: 0, z: 0 }; }, richtung() { return { x: 0, z: 0 }; } } }; };
  const probe = (qMe, linie, andere, schritte) => { const v = mk(qMe), d = new R.Driver(v, st, { schwierigkeit: 'mittel', seed: 3 }); d.versatzBasis = linie; let letzte = null; const seiten = [];
    for (let i = 0; i < (schritte || 1); i++) { d.steuerung(0.016, { andere, laeuft: true }); const m = [...d.tierMerk.values()][0]; if (m) seiten.push(m.seite); letzte = d.hindernisse.find((h) => h.tierSeite); } return { d, seiten, ziel: letzte && letzte.ziel, seite: seiten.length ? seiten[seiten.length - 1] : 0 }; };
  const T0 = tier(0, 55);
  pruefe('K1 Einheit: Tier links der Linie (Auto bei +1,5, Tier bei 0) → rechts vorbei (Seite +1, Ziel > Tier)', (() => { const r = probe(1.5, 1.5, [T0]); return r.seite === 1 && r.ziel > 1.5; })());
  pruefe('K1 Einheit: Tier rechts der Linie (Auto bei −1,5) → links vorbei (Seite −1, Ziel < Tier)', (() => { const r = probe(-1.5, -1.5, [T0]); return r.seite === -1 && r.ziel < -1.5; })());
  pruefe('K1 Einheit: Tier mittig, Auto mittig → freie Seite (gleich frei: rechts), nicht hin und her (40 Schritte gleich)', (() => { const r = probe(0, 0, [T0], 40); return r.seiten.length === 40 && r.seiten.every((x) => x === r.seiten[0]); })());
  const Tr = tier(2.0, 55);        // Tier rechts der Mitte → mehr Platz links
  pruefe('K1 Einheit: Tier liegt 2 m rechts der Mitte, Auto auf seiner Linie (2,0) → die Seite mit mehr Platz (links)', (() => { const r = probe(2.0, 2.0, [Tr]); return r.seite === -1; })());
  pruefe('K1 Einheit: anderes Auto steht rechts neben dem Tier → Auto fährt links vorbei (obwohl es rechts von der Tierlinie fährt)', (() => { const r = probe(1.5, 1.5, [T0, fremd(3.2, 55, 1)]); return r.seite === -1; })());
  pruefe('K1 Einheit: anderes Auto steht links neben dem Tier → Auto fährt rechts vorbei (obwohl es links von der Tierlinie fährt)', (() => { const r = probe(-1.5, -1.5, [T0, fremd(-3.2, 55, 1)]); return r.seite === 1; })());
  pruefe('K1 Einheit: zwei Tiere 5 m hintereinander (links und rechts der Linie) → gemeinsame Seite (kein Ziel zwischen den Tieren)', (() => {
    const v = mk(0.3), d = new R.Driver(v, st, { schwierigkeit: 'mittel', seed: 3 }); d.versatzBasis = 0.3; const an = [tier(1.8, 55), tier(-2.2, 60)];
    for (let i = 0; i < 30; i++) d.steuerung(0.016, { andere: an, laeuft: true });
    const seiten = [...d.tierMerk.values()].map((m) => m.seite); return seiten.length === 2 && seiten[0] === seiten[1] && seiten[0] !== 0;
  })());
  const g = 6.5, Tg = tier(g - 0.6, 55);      // Tier ganz am rechten Rand: rechts vorbei geht nicht (Bande)
  pruefe('K1 Einheit: Tier am rechten Straßenrand, Auto rechts der Mitte → links vorbei (rechts passt nicht auf die Straße)', (() => { const r = probe(g - 0.2, g - 0.2, [Tg]); return r.seite === -1 && Math.abs(r.ziel) <= r.d._grenzeBei(300) + 1e-9; })());
  pruefe('K1 Einheit: anderes Auto neben MIR auf der Seite des Ausweichwegs → Auto wählt die andere Seite', (() => { const r = probe(0.5, 0.5, [Tr, fremd(-2.0, 0, 30)]); return r.seite === 1; })());
}

// ---------------- K2 Polizei / Verkehrswagen (Krankenwagen, Abschleppwagen, Geisterfahrer): kein Durchfahren
// Eine Begegnung: der Wagen fährt auf Reisetempo, das Tier steht (szene 'steht', erschreckt nicht) bzw. läuft quer (szene 'quert') in SEINER Spur, dist m voraus.
//  Messwerte: Kontakt (Tier hat DIESEN Wagen berührt), durch (Tier-Mitte kommt dem Wagen-Mitte < 1,2 m nahe), längster Halt (v < 0,5 m/s) während das Tier in 40 m Nähe ist, Weiterfahrt danach
function k2Lauf(art, szene, dist, stehZeit, seed, o) {
  o = o || {};
  const polizei = art === 'polizei', geister = art === 'geisterfahrer';
  const sim = neu({ streckeId: o.strecke || 'wiese', gegner: 0, tiere: true, polizei: polizei, geisterfahrer: geister, krankenwagen: art === 'krankenwagen', abschleppwagen: art === 'abschleppwagen', verkehr: 'wenig' }, seed || 5);
  const st = sim.sim.strecke, T = sim.sim.tiere, vk = sim.sim.verkehr, P = sim.sim.fahrzeuge[0].vehicle, L = st.spline.laenge;
  T.c = Object.assign({}, T.c, { erschreckAbstand: 0 });
  for (let n = 0; n < 60 * 25 && !sim.sim.rennen.gasErlaubt; n++) sim.schritt();
  let f, i, e = null, dir = 1;
  if (polizei) {
    i = sim.sim.polizei.idx[0]; f = sim.sim.fahrzeuge[i];
    for (let n = 0; n < 60 * 90 && !(f.nah && f.vehicle.vLaengs > 20); n++) { sim.schritt(); T.naechster = 1e9; }
    { const nz = st.spline.naechster(f.vehicle.x, f.vehicle.z, f.index), pt = st.spline.punktBei(nz.s - 400); P.setzen(pt.x, pt.z, R.headingAus(pt.tx, pt.tz)); P.vLaengs = 0; sim.sim.fahrzeuge[0].ausgeschieden = true; }      // der (stehende) Spieler weit hinter dem Streifenwagen, nicht im Weg
  } else {
    e = vk.eintraege.find((x) => x.art === art);
    const anderer = vk.eintraege.find((x) => x !== e);
    if (anderer) anderer.pause = 1e9;
    const frei = vk.frei.filter((a) => a[1] - a[0] >= 700).sort((a, b) => (b[1] - b[0]) - (a[1] - a[0]))[0] || vk.frei[0];
    if (geister) {
      e.route = { a: frei[0] + 10, b: frei[1] - 10 }; e.frac = 0.45; e.wechselChance = false; e.naechsterWechsel = Infinity; e.wechselDist = 1e9;
      e.richtung = -1; vk._erscheinen(e, frei[1] - 10, 0.45, e.tempo * 0.8); dir = -1;
    } else {
      const s0 = frei[0] + 20; e.route = { a: s0, b: frei[1] }; e.ast = 0;
      vk._erscheinen(e, s0, R.config.verkehr[art].spurQ, e.tempo * 0.8);
    }
    const pt = st.spline.punktBei(e.route.a - 300); P.setzen(pt.x, pt.z, R.headingAus(pt.tx, pt.tz)); P.vLaengs = 0;
    f = e.f; i = sim.sim.fahrzeuge.indexOf(f);
    for (let n = 0; n < 60 * (o.warm || 8); n++) { sim.schritt(); T.naechster = 1e9; }
  }
  const v = f.vehicle, v0 = v.vLaengs;
  const nn = st.spline.naechster(v.x, v.z, f.index), grenze = (st.breiteBei ? st.breiteBei(nn.s) : st.breite) / 2;
  const sM = nn.s + dir * dist;
  const g = T.erzwingen({ art: T.arten[0], sM, von: 1, winkel: 90, richtung: 1, anzahl: 1, fortschritt: szene === 'quert' ? (o.fort === undefined ? 0.2 : o.fort) : 0.5 });
  if (!g) return null;
  const tier = g[0];
  if (szene === 'steht') stehend([tier], Math.max(-grenze + 1.5, Math.min(grenze - 1.5, nn.seitenabstand)), stehZeit);
  if (szene === 'wechsel') {     // Geisterfahrer wechselt gerade die Spur; das Tier steht in der ZIEL-Spur (gespiegelte Querlage)
    stehend([tier], -nn.seitenabstand, stehZeit);
    e.wechsel = { s0: nn.s - 5, von: e.frac, nach: -e.frac };
  }
  const sl = T.slots[tier.slot];
  let vPrev = v.vLaengs, kontakt = false, vKontakt = 0, durch = false, dmin = 1e9, halt = 0, haltMax = 0, tierWeg = null, vNach = 0, vmin = v0, t = 0, vorher = null;
  for (let n = 0; n < 60 * 30; n++) {
    vPrev = v.vLaengs; sim.schritt(); T.naechster = 1e9; t += 1 / 60;
    if (tier.getroffen.has(i) && !kontakt) { kontakt = true; vKontakt = Math.abs(vPrev); }
    const aktiv = sl.aktiv && T.tiere.includes(tier);
    if (aktiv) {
      const dx = sl.x - v.x, dz = sl.z - v.z, d = Math.hypot(dx, dz), r = v.richtung(), vor = dx * r.x + dz * r.z;
      dmin = Math.min(dmin, d);
      if (vorher !== null && vorher > 0 && vor <= 0 && d < 1.2) durch = true;
      vorher = vor;
      if (d < 40) { vmin = Math.min(vmin, v.vLaengs); if (Math.abs(v.vLaengs) < 0.5) { halt += 1 / 60; haltMax = Math.max(haltMax, halt); } else halt = 0; }
    } else if (tierWeg === null) tierWeg = t;
    if (tierWeg !== null && t > tierWeg + 8) { vNach = v.vLaengs; break; }
  }
  return { kontakt, vKontakt, hart: kontakt && vKontakt > 3, durch, dmin, haltMax, vmin, v0, tierWeg, vNach };
}
{
  const arten = KURZ ? ['krankenwagen', 'polizei'] : ['krankenwagen', 'abschleppwagen', 'geisterfahrer', 'polizei'];
  {     // Geisterfahrer beim Spurwechsel: das Tier steht in der Spur, in die er wechselt
    const w = k2Lauf('geisterfahrer', 'wechsel', 48, 8, 9);
    pruefe('K2 geisterfahrer: beim Spurwechsel steht ein Tier in der Zielspur (48 m) → kein Kontakt, kein Durchfahren', w !== null && !w.hart && !w.durch, w && `Kontakt ${w.kontakt} (${w.vKontakt.toFixed(1)} m/s), Abstand ${w.dmin.toFixed(2)} m, Tempo min ${w.vmin.toFixed(1)}/${w.v0.toFixed(1)}`);
  }
  for (const art of arten) {
    const s = k2Lauf(art, 'steht', 110, 6, 5), q = k2Lauf(art, 'quert', 70, 0, 6), s2 = k2Lauf(art, 'steht', 60, 9, 7);
    const ok = (r) => r !== null;
    pruefe(`K2 ${art}: Tiere/Wagen aufgebaut`, ok(s) && ok(q) && ok(s2));
    if (!(ok(s) && ok(q) && ok(s2))) continue;
    pruefe(`K2 ${art}: Tier steht in der Spur (110 m) → kein Kontakt, kein Durchfahren`, !s.hart && !s.durch, `Kontakt ${s.kontakt}, kleinster Abstand ${s.dmin.toFixed(2)} m, Tempo min ${s.vmin.toFixed(1)}/${s.v0.toFixed(1)}`);
    pruefe(`K2 ${art}: Tier steht 9 s in der Spur (60 m) → kein Kontakt, kein Durchfahren`, !s2.hart && !s2.durch, `Kontakt ${s2.kontakt}, Abstand ${s2.dmin.toFixed(2)} m, Tempo min ${s2.vmin.toFixed(1)}`);
    pruefe(`K2 ${art}: Halt höchstens Standzeit + 4 s und danach Weiterfahrt (v > 3 m/s)`, s2.haltMax <= 9 + 4 && s2.vNach > 3 && s.haltMax <= 6 + 4 && s.vNach > 3, `Halt ${s.haltMax.toFixed(1)} s / ${s2.haltMax.toFixed(1)} s, danach ${s.vNach.toFixed(1)} / ${s2.vNach.toFixed(1)} m/s`);
    pruefe(`K2 ${art}: querendes Tier (70 m) → kein Kontakt, kein Durchfahren`, !q.hart && !q.durch, `Kontakt ${q.kontakt}, Abstand ${q.dmin.toFixed(2)} m, Tempo min ${q.vmin.toFixed(1)}/${q.v0.toFixed(1)}`);
  }
}

console.log(`\n${geprueft - fehler} OK, ${fehler} FEHL (${geprueft} Prüfungen)`);
process.exit(fehler ? 1 : 0);
