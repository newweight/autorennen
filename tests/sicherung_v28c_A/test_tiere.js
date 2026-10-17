// Tiere queren die Straße (16.10., v28 W10): node tests/test_tiere.js [kurz]
// Logik in src/world/tiere.js (Server = Browser, dieselbe Datei).
//  T1) Planung auf ALLEN Strecken/Welten/Varianten: Tierart passt zur Strecke, jeder geplante Weg liegt samt Zugabe nie in Sperrzonen (Kreuzung, Gabelung, Looping, Schanze, Brücke, Tunnel,
//      Start/Ziel ±80 m, Tribüne, Werkstatt, Hindernis), Winkel 20–70° oder gerade, deterministisch (gleicher Seed = gleiche Folge, anderer Seed = andere)
//  T2) Häufigkeit ~1 Auftritt je 60–90 s Rennzeit (je Strecke), Gruppen (Rehe 1–3), erste Auftritte, nur bei laufendem Rennen
//  T3) Erscheinen: nie < 40 m an einem Auto (Aktivierung) und nie direkt vor einem heranfahrenden Auto
//  T4) Rennen (Server-Simulation, Autopilot): Tiere nie in Sperrzonen, Kontakt = Tempo −30 %, KEIN Schaden, Tier flüchtet, Meldungs-Emoji
//  T5) KI bremst/weicht aus: stehendes Tier auf der Spur – KI kommt ohne Berührung vorbei, nicht ewig stehend
//  T6) Server = Client: zustand.ti (14 Zahlen, Flags) → zustandAnwenden/poseAus ergibt dieselben Posen; ohne Tiere kein `ti`; Einstellung nur bei echtem true
//  T7) Rundenzeit KI: mit Tieren AN höchstens +5 % (alle Strecken, Computer-Rennen)
const S = require('../server/simulation.js');
const { Simulation, laden, einstellungenPruefen } = S;
const R = laden(), DT = R.config.physik.schritt;
const KURZ = process.argv.includes('kurz');
let fehler = 0, geprueft = 0;
function pruefe(name, ok, info) { geprueft++; console.log((ok ? 'OK   ' : 'FEHL ') + name + (info !== undefined ? '  (' + info + ')' : '')); if (!ok) fehler++; }
const Tiere = R.Tiere, ARTEN = Tiere.ARTEN;
const L2 = (s, L) => ((s % L) + L) % L;

// ---------- Hilfen: Attrappen-Autos (T1–T3)
function auto(x, z, tempo, heading) {
  const v = { x, z, y: 0, heading: heading || 0, vLaengs: tempo || 0, vQuer: 0, tempo: tempo || 0, imLooping: false, imFlug: false, huepfer: 0, daten: { laenge: 4.5, breite: 1.8 },
    weltGeschwindigkeit() { return { x: -Math.sin(this.heading) * this.vLaengs, z: -Math.cos(this.heading) * this.vLaengs }; }, richtung() { return { x: -Math.sin(this.heading), z: -Math.cos(this.heading) }; } };
  return { vehicle: v, istSpieler: true, ausgeschieden: false, nah: { s: 0 } };
}
function neueStrecke(daten, w, va) { return new R.Strecke(daten, { welt: R.Strecke.weltName(daten, w), variante: va }); }
function mitTiere(strecke, seed, autos) {
  const spiel = { fahrzeuge: autos || [auto(1e6, 1e6, 0)], werkstatt: null };
  if (R.Tribuenen && !strecke.tribuenen) { try { R.Tribuenen.einbauen(strecke); } catch (e) { /* ohne */ } }
  const t = new R.Tiere(spiel); t.einsetzen(strecke, spiel.fahrzeuge.length, { seed });
  return { t, spiel };
}
function pfadS(t) { return [t.s, t.s + t.vs * (Math.abs(t.qZiel - t.anfangQ) / Math.max(1e-6, Math.abs(t.vq)))]; }

// ---------------- T1 Planung
{
  let strecken = 0, schlecht = [], keineArt = [], winkelFalsch = [], nichtDet = [], gesamtAuftritte = 0, artFalsch = [];
  const winkelAlle = [];
  for (const daten of R.trackCatalog) {
    const welten = [''].concat(Object.keys(daten.welten || {})), varianten = [''].concat(Object.keys(daten.varianten || {}));
    for (const w of welten) for (const va of varianten) {
      let st;
      try { st = neueStrecke(daten, w, va); } catch (e) { schlecht.push(daten.id + '/' + w + '/' + va + ' ' + e.message); continue; }
      strecken++;
      const nm = `${daten.id}${w ? '/' + w : ''}${va ? '/' + va : ''}`, L = st.spline.laenge;
      const arten = Tiere.artenFuer(st);
      if (!arten.length || !arten.every(a => ARTEN[a])) keineArt.push(nm);
      const erwartet = { wiese: 'kuh', wald: 'reh', alpen: 'baer', dino: 'dino', wueste: 'kamel', fantasie: 'einhorn' }[daten.id];
      if (erwartet && !arten.includes(erwartet)) artFalsch.push(nm + ' ' + arten.join('+'));
      const lauf = (seed) => {
        const a = auto(1e6, 1e6, 0), { t } = mitTiere(st, seed, [a]), liste = [];
        for (let s = 0; s < L; s += 45) {
          a.nah.s = s; t.tiere.slice().forEach(x => t._entfernen(x));
          if (t._auftritt()) for (const x of t.tiere) liste.push({ art: x.art, s: +x.s.toFixed(2), vs: +x.vs.toFixed(3), vq: +x.vq.toFixed(3), von: x.von, a: +x.alpha.toFixed(3) });
        }
        return { liste, t };
      };
      const r1 = lauf('t1'), r2 = lauf('t1'), r3 = lauf('t2');
      if (JSON.stringify(r1.liste) !== JSON.stringify(r2.liste)) nichtDet.push(nm);
      if (r1.liste.length && JSON.stringify(r1.liste) === JSON.stringify(r3.liste)) nichtDet.push(nm + ' (Seed ohne Wirkung)');
      // jeder Weg samt Zugabe nie in einer Sperrzone (0 Zugabe: harte Probe)
      const t = r1.t, Z = t.zonen;
      const a = auto(1e6, 1e6, 0), { t: t2 } = mitTiere(st, 't1', [a]);
      for (let s = 0; s < L; s += 45) {
        a.nah.s = s; t2.tiere.slice().forEach(x => t2._entfernen(x));
        if (!t2._auftritt()) continue;
        gesamtAuftritte++;
        for (const x of t2.tiere) {
          const tv = Math.abs(x.qZiel - x.anfangQ) / Math.max(1e-6, Math.abs(x.vq)), s0 = x.s, s1 = x.s + x.vs * tv;
          for (let k = 0; k <= 20; k++) { const ss = L2(s0 + (s1 - s0) * k / 20, L); if (Tiere.gesperrt(Z, ss, 0)) { schlecht.push(nm + ' Weg bei s=' + Math.round(ss) + ' in Sperrzone'); break; } }
          const alpha = Math.atan2(Math.abs(x.vq), Math.abs(x.vs)) * 180 / Math.PI;
          winkelAlle.push(alpha);
          if (!(Math.abs(alpha - 90) < 0.6 || (alpha >= 19.5 && alpha <= 70.5))) winkelFalsch.push(nm + ' ' + alpha.toFixed(1));
        }
      }
    }
  }
  pruefe('T1 Tierart je Strecke vorhanden und bekannt', keineArt.length === 0, keineArt.slice(0, 4).join(','));
  pruefe('T1 Wiese Kuh · Wald Reh · Alpen Bär · Dino Dino · Wüste Kamel · Fantasie Einhorn', artFalsch.length === 0, artFalsch.slice(0, 4).join(' | '));
  const a = neueStrecke(R.trackCatalog.find(d => d.id === 'alpen')), m = R.trackCatalog.find(d => d.id === 'mega') ? neueStrecke(R.trackCatalog.find(d => d.id === 'mega')) : null;
  pruefe('T1 Alpen: Bär + Steinbock', Tiere.artenFuer(a).includes('baer') && Tiere.artenFuer(a).includes('steinbock'), Tiere.artenFuer(a).join('+'));
  if (m) pruefe('T1 Mega: Arten aller Abschnitte (Kuh, Reh, Bär, Dino, Kamel, Einhorn)', ['kuh', 'reh', 'baer', 'dino', 'kamel', 'einhorn'].every(x => Tiere.artenFuer(m).includes(x)), Tiere.artenFuer(m).join('+'));
  if (m) {
    const sek = R.Mega.info.sektionen, L = m.spline.laenge; let falsch = [];
    for (const ab of sek) { const mitte = (ab.s0 + ab.s1) / 2, art = Tiere.artBei(m, mitte, 0.99, Tiere.cfg()); const soll = { wiese: 'kuh', wald: 'reh', alpen: 'baer', dino: 'dino', wueste: 'kamel', fantasie: 'einhorn' }[ab.id]; if (art !== soll) falsch.push(ab.id + '→' + art); }
    pruefe('T1 Mega: Tierart je Abschnitt nach Herkunftsstrecke', falsch.length === 0 && L > 0, falsch.join(','));
  }
  pruefe('T1 Wege nie in Sperrzonen (alle Strecken/Welten/Varianten)', schlecht.length === 0, `${strecken} Strecken, ${gesamtAuftritte} Auftritte` + (schlecht.length ? ': ' + schlecht.slice(0, 4).join(' | ') : ''));
  const gerade = winkelAlle.filter(x => Math.abs(x - 90) < 0.6).length / Math.max(1, winkelAlle.length);
  pruefe('T1 Winkel: gerade (90°) oder schräg 20–70°', winkelFalsch.length === 0 && gerade > 0.25 && gerade < 0.6, `gerade ${(100 * gerade).toFixed(0)} %, min ${Math.min(...winkelAlle).toFixed(0)}°`);
  pruefe('T1 Planung deterministisch (gleicher Seed gleich, anderer Seed anders)', nichtDet.length === 0, nichtDet.slice(0, 4).join(','));
}

// ---------------- T2 Häufigkeit + Gruppen, T3 Abstand beim Erscheinen
{
  const ergebnisse = [], minAbstand = [];
  for (const id of ['wiese', 'wald', 'alpen', 'dino', 'wueste', 'fantasie']) {
    const daten = R.trackCatalog.find(d => d.id === id), st = neueStrecke(daten, '', '');
    const L = st.spline.laenge, SEK = KURZ ? 900 : 2400;
    // vier Autos fahren mit 40 m/s hintereinander (dicht: Test der 40-m-Regel)
    const autos = [0, 1, 2, 3].map(() => auto(0, 0, 40, 0)); autos.forEach((a, i) => { a.istSpieler = i < 2; });
    const { t, spiel } = mitTiere(st, 'h-' + id, autos);
    const sS = [0, 18, 55, 130];
    let min = 1e9, aktiv = 0, gruppen = [], letzteAuftritte = 0;
    const alt = t._aktivieren.bind(t);
    t._aktivieren = function (x) { const vorher = x.zustand; alt(x); if (vorher === 'wartet' && x.zustand !== 'wartet') { aktiv++; const sl = this.slots[x.slot]; for (const a of autos) min = Math.min(min, Math.hypot(a.vehicle.x - sl.x, a.vehicle.z - sl.z)); } };
    for (let n = 0; n < SEK / 0.05; n++) {
      sS.forEach((s0, i) => { const s = L2(s0 + 40 * n * 0.05 + 300, L), p = st.spline.punktBei(s); const a = autos[i]; a.vehicle.x = p.x + p.nx * (i % 2 ? 2 : -2); a.vehicle.z = p.z + p.nz * (i % 2 ? 2 : -2); a.vehicle.heading = R.headingAus(p.tx, p.tz); a.nah.s = s; });
      t.schritt(0.05, true);
      if (t.statistik.auftritte !== letzteAuftritte) { letzteAuftritte = t.statistik.auftritte; gruppen.push(t.tiere.filter(x => x.zustand === 'wartet' || x.zeit < 0.01).length); }
    }
    const proMin = t.statistik.auftritte / (SEK / 60);
    ergebnisse.push([id, proMin, t.statistik.auftritte, Math.max(0, ...gruppen)]); minAbstand.push([id, min, aktiv]);
  }
  const bad = ergebnisse.filter(([id, pm]) => pm < 0.55 || pm > 1.05);
  pruefe('T2 Häufigkeit ≈ 1 Tier je 60–90 s (0,67–1,0 je Minute, Toleranz 0,55–1,05)', bad.length === 0, ergebnisse.map(([id, pm, n]) => `${id} ${pm.toFixed(2)}/min (${n})`).join(', '));
  pruefe('T3 Erscheinen: nie < 40 m an einem Auto (4 Autos mit 40 m/s dicht an dicht)', minAbstand.every(([, m, n]) => n > 0 && m >= 40), minAbstand.map(([id, m, n]) => `${id} min ${m.toFixed(0)} m (${n})`).join(', '));
  // Gruppen: Rehe 1–3, nie mehr
  const daten = R.trackCatalog.find(d => d.id === 'wald'), st = neueStrecke(daten, '', ''), a = auto(1e6, 1e6, 0), { t } = mitTiere(st, 'gr', [a]);
  const groessen = {};
  for (let s = 0; s < st.spline.laenge; s += 25) { a.nah.s = s; t.tiere.slice().forEach(x => t._entfernen(x)); if (t._auftritt()) groessen[t.tiere.length] = (groessen[t.tiere.length] || 0) + 1; }
  pruefe('T2 Rehe in Gruppen 1–3 (alle Größen kommen vor)', [1, 2, 3].every(k => groessen[k] > 0) && Object.keys(groessen).every(k => +k >= 1 && +k <= 3), JSON.stringify(groessen));
  // nur bei laufendem Rennen
  const b = auto(1e6, 1e6, 0), { t: t2 } = mitTiere(st, 'lauf', [b]);
  for (let n = 0; n < 60 / 0.05; n++) t2.schritt(0.05, false);
  pruefe('T2 Countdown/Pause: keine Auftritte, solange das Rennen nicht läuft', t2.statistik.auftritte === 0 && t2.zeit === 0);
  // heranfahrendes Auto: kein Erscheinen direkt vor der Nase
  const c = auto(0, 0, 60, 0), { t: t3 } = mitTiere(st, 'nase', [c]);
  const p = st.spline.punktBei(500), q = st.spline.punktBei(430);
  c.vehicle.x = q.x; c.vehicle.z = q.z; c.vehicle.heading = R.headingAus(p.x - q.x, p.z - q.z);          // 70 m vor Punkt p, 60 m/s auf ihn zu
  pruefe('T3 _frei: Punkt 70 m voraus eines 60-m/s-Autos ist NICHT frei (1,3 s Vorlauf), seitlich/hinter ihm ja', !t3._frei(p.x, p.z) && t3._frei(q.x - (p.x - q.x) * 2, q.z - (p.z - q.z) * 2) && t3._frei(q.x + 60, q.z + 60), '');
}

// ---------------- T4 Rennen mit Autopilot (Server-Simulation)
function neu(opt, sp, seed) {
  return new Simulation({ einstellungen: Object.assign({ streckeId: 'wiese', runden: 2, gegner: 2, tageszeit: 'tag', jahreszeit: 'sommer', wetter: 'klar', windStaerke: 0 }, opt),
    spieler: sp || [{ fahrer: 'Jonas', auto: 'porsche-911', hilfe: 'aus' }], seed: seed || 11 });
}
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
{
  const id = 'wiese', sim = neu({ streckeId: id, gegner: 2, tiere: true, runden: 3 }), st = sim.sim.strecke, T = sim.sim.tiere;
  pruefe('T4 Server: Tiere-System da, Kuh-Plätze', !!T && T.arten.join() === 'kuh', T && T.arten.join());
  const pv = new R.Vehicle(R.carCatalog.find(a => a.id === 'porsche-911').fahrwerte, { tempoKlasse: sim.sim.tempoKlasse });
  // Schaden-System dazuschalten (offline-Fall): ein Kuhkontakt darf keine Punkte kosten
  sim.sim.schaden = new R.Schaden(sim.sim.fahrzeuge, { an: true });
  let idx = -1, stoesse = 0, inSperre = 0, getroffenTempo = [], meld = [], schadenMin = 100;
  const meldungAlt = sim.sim._meldung; sim.sim._meldung = function (nr, text, ms) { meld.push(text); return meldungAlt && meldungAlt.call(this, nr, text, ms); };
  const fz = sim.sim.fahrzeuge[0].vehicle;
  let erzwungen = false;
  for (let n = 0; n < 60 * 600; n++) {
    R.Netz.fahrzeugSchreiben(pv, sim.ich(0).v);
    const a = autopilot(st, pv, idx, 0.8); idx = a.idx;
    sim.eingabeSetzen(0, a.s);
    // sicherstellen, dass der Spieler in den ersten 5 Minuten mindestens einmal ein Tier trifft: nach 60 s ein Tier direkt vor dem Spieler erzwingen
    if (!erzwungen && sim.sim.rennen.zeit > 60 && fz.vLaengs > 20) {
      const nah = sim.sim.fahrzeuge[0].nah, sM = nah.s + 14 + fz.vLaengs * 0.2;
      T.erzwingen({ art: 'kuh', sM, von: 1, winkel: 90, richtung: 1, anzahl: 1, fortschritt: 0.5 }); erzwungen = true;
      T.tiere.forEach(x => { x.stehBei = -1; x.faktor = 0.01; x.ziel = 0.01; });        // steht fast (sicherer Treffer)
    }
    const v0 = fz.vLaengs;
    sim.schritt();
    for (const t of T.tiere) { if (t.zustand === 'wartet' || t.erzwungen) continue; if (Tiere.gesperrt(T.zonen, L2(t.s, st.spline.laenge), 0)) inSperre++; }
    const ts = sim.sim._tierStoesse; void ts;
    if (T.statistik.getroffen > stoesse) { stoesse = T.statistik.getroffen; getroffenTempo.push([v0, fz.vLaengs]); }
    if (sim.sim.rennen.teilnehmer[0].imZiel) break;
  }
  pruefe('T4 Tiere nie in Sperrzonen während des ganzen Rennens', inSperre === 0, inSperre);
  pruefe('T4 Kontakt: mindestens ein Stoß, Tempo danach ≈ 0,7× (−30 %), kein Aufprall-Abbruch', getroffenTempo.length > 0 && getroffenTempo.every(([a, b]) => b < a * 0.85 && b > a * 0.45), JSON.stringify(getroffenTempo.slice(0, 3).map(x => x.map(y => +y.toFixed(1)))));
  pruefe('T4 Meldung mit Tier-Icon (🐄)', meld.includes('🐄'), JSON.stringify([...new Set(meld)].slice(0, 4)));
  pruefe('T4 getroffenes Tier flüchtet (Zustand flieht oder schon weg) – kein Hängenbleiben', T.tiere.every(t => t.zustand !== 'steht' || t.stehtNoch < 10), T.tiere.map(t => t.zustand).join());
}
{
  // KEIN Schaden: Spieler allein, Schaden an, Kuh steht mitten auf der Geraden – Treffer, Gesundheit bleibt 100 %
  const sim = neu({ streckeId: 'wiese', gegner: 0, tiere: true, runden: 2 }), st = sim.sim.strecke, T = sim.sim.tiere;
  sim.sim.schaden = new R.Schaden(sim.sim.fahrzeuge, { an: true });
  const pv = new R.Vehicle(R.carCatalog.find(a => a.id === 'porsche-911').fahrwerte, { tempoKlasse: sim.sim.tempoKlasse }), fz = sim.sim.fahrzeuge[0];
  let idx = -1, platziert = false, treffer = 0, minPunkte = 100, nachTreffer = 0;
  for (let n = 0; n < 60 * 150 && nachTreffer < 60 * 4; n++) {
    R.Netz.fahrzeugSchreiben(pv, sim.ich(0).v);
    const a = autopilot(st, pv, idx, 0.8); idx = a.idx; sim.eingabeSetzen(0, a.s);
    if (!platziert && sim.sim.rennen.zeit > 30 && fz.vehicle.vLaengs > 25 && fz.nah && !Tiere.gesperrt(T.zonen, L2(fz.nah.s + 60, st.spline.laenge), 40)) {
      const g = T.erzwingen({ art: 'kuh', sM: fz.nah.s + 16 + fz.vehicle.vLaengs * 0.25, von: 1, winkel: 90, richtung: 1, anzahl: 1, fortschritt: 0.5 });
      g.forEach(x => { x.zustand = 'steht'; x.stehtNoch = 99; x.ziel = 0; x.faktor = 0; x.q = 0.3; }); platziert = true;
    }
    sim.schritt();
    treffer = T.statistik.getroffen;
    if (treffer) { nachTreffer++; minPunkte = Math.min(minPunkte, sim.sim.schaden.z[0].punkte); }
  }
  pruefe('T4 Kontakt: KEIN Schaden (Spieler mit Schaden an trifft die Kuh: Gesundheit bleibt 100 %)', treffer >= 1 && minPunkte === 100, `Treffer ${treffer}, Gesundheit ${minPunkte} %`);
}
{
  // Kontakt direkt (Einheit): Tempo ×0,7, Hüpfer, Tier erschrickt und läuft quer zur Fahrtrichtung weg
  const st = neueStrecke(R.trackCatalog.find(d => d.id === 'wald'), '', ''), a = auto(0, 0, 30, 0), { t } = mitTiere(st, 'k', [a]);
  const p = st.spline.punktBei(300);
  a.vehicle.x = p.x; a.vehicle.z = p.z; a.vehicle.heading = R.headingAus(p.tx, p.tz); a.vehicle.vLaengs = 30; a.istSpieler = true;
  const g = t.erzwingen({ art: 'reh', sM: 300, von: 1, winkel: 90, richtung: 1, anzahl: 1, fortschritt: 0.5 });
  const sl = t.slots[g[0].slot]; sl.x = p.x + p.tx * 0.5; sl.z = p.z + p.tz * 0.5;
  const q0 = g[0].q, r = t.kollisionen([a]);
  pruefe('T4 Einheit: Treffer meldet typ tier/art reh, v × 0,7, Hüpfer, Tier flieht', r.length === 1 && r[0].typ === 'tier' && r[0].art === 'reh' && Math.abs(a.vehicle.vLaengs - 21) < 0.01 && a.vehicle.huepfer > 0 && g[0].zustand === 'flieht', JSON.stringify(r) + ' v=' + a.vehicle.vLaengs.toFixed(2) + ' ' + g[0].zustand);
  const r2 = t.kollisionen([a]);
  pruefe('T4 Einheit: jedes Tier trifft ein Auto nur einmal', r2.length === 0);
  let weg = false; for (let n = 0; n < 600; n++) { t.schritt(0.05, true); if (!t.tiere.includes(g[0])) { weg = true; break; } }
  pruefe('T4 Einheit: erschrockenes Tier verschwindet nach der Flucht', weg);
  void q0;
}

// ---------------- T5 KI weicht aus / bremst
{
  const id = 'wiese', sim = neu({ streckeId: id, gegner: 2, tiere: true, runden: 2, schwierigkeit: 'mittel' }), st = sim.sim.strecke, T = sim.sim.tiere;
  sim.zuKI(0);
  const L = st.spline.laenge;
  const f1 = sim.sim.fahrzeuge[1], v1 = f1.vehicle;
  let platziert = null, minV = 1e9, minD = 1e9, v0 = null, kontakt = 0, nachDurch = false, tFrei = null;
  for (let n = 0; n < 60 * 120; n++) {
    sim.schritt();
    const rz = sim.sim.rennen;
    if (!platziert && rz.gasErlaubt && f1.nah && v1.vLaengs > 22 && !Tiere.gesperrt(T.zonen, L2(f1.nah.s + 90, L), 40)) {
      const g = T.erzwingen({ art: 'kuh', sM: f1.nah.s + 70, von: 1, winkel: 90, richtung: 1, anzahl: 1, fortschritt: 0.5 });
      // Kuh steht in der Fahrbahn (Mitte), 8 s lang
      g.forEach(x => { x.zustand = 'steht'; x.stehtNoch = 8; x.ziel = 0; x.faktor = 0; x.q = 0.8; });
      platziert = { t: rz.zeit, s: f1.nah.s + 70, tier: g[0] };
    }
    if (platziert) {
      const d = Math.hypot(v1.x - T.slots[platziert.tier.slot].x, v1.z - T.slots[platziert.tier.slot].z);
      if (platziert.tier.zustand !== 'wartet' && d < 60) { minV = Math.min(minV, v1.vLaengs); minD = Math.min(minD, d); if (v0 === null) v0 = v1.vLaengs; }
      if (T.statistik.getroffen > kontakt) kontakt = T.statistik.getroffen;
      const sa = L2(f1.nah.s - platziert.s, L); if (sa > 5 && sa < 100) { nachDurch = true; }
      if (nachDurch && rz.zeit - platziert.t > 12) { tFrei = rz.zeit - platziert.t; break; }
    }
  }
  pruefe('T5 KI kommt am stehenden Tier ohne Berührung vorbei', platziert && nachDurch && kontakt === 0, `Treffer ${kontakt}`);
  pruefe('T5 KI bremst oder weicht aus (Tempo < 0,9 × Anfahrtempo ODER Abstand ≥ 1,5 m)', platziert && (minV < 0.9 * v0 || minD >= 1.5), `Anfahrt ${v0 && v0.toFixed(1)} m/s, min ${minV.toFixed(1)} m/s, kleinster Abstand ${minD.toFixed(1)} m`);
  pruefe('T5 KI bleibt nicht stehen (Weiterfahrt innerhalb 12 s)', tFrei !== null, tFrei);
}

// ---------------- T6 Server = Client, Protokoll
{
  const aus = neu({ streckeId: 'wald', gegner: 1 }), z0 = aus.zustand();
  pruefe('T6 ohne Tiere: kein ti, sim.tiere null (Zustand wie vorher)', z0.ti === undefined && aus.sim.tiere === null);
  const e = (o) => einstellungenPruefen(o, 1);
  pruefe('T6 Server-Prüfung: nur echtes true schaltet Tiere an (alter Client = aus)', e({ tiere: true }).tiere === true && e({}).tiere === false && e({ tiere: 'true' }).tiere === false && e({ tiere: 1 }).tiere === false);
  const sim = neu({ streckeId: 'wald', gegner: 1, tiere: true });
  const T = sim.sim.tiere, st = sim.sim.strecke;
  pruefe('T6 mit Tieren: ti im Zustand (Array)', Array.isArray(sim.zustand().ti) && sim.startInfo().einstellungen.tiere === true);
  // Tiere erzwingen und ein paar Schritte
  T.erzwingen({ art: 'reh', sM: 400, von: 1, winkel: 35, richtung: 1, anzahl: 3, fortschritt: 0.3 });
  for (let n = 0; n < 30; n++) sim.schritt();
  const z = sim.zustand(), ti = z.ti;
  pruefe('T6 ti: aktive Plätze = 14 Zahlen, Flag 2, endlich; Leerplätze 0; hinten abgeschnitten', ti.length >= 3 && ti.every(x => x === 0 || (x.length === 14 && x.every(Number.isFinite) && (x[6] & 2) === 2)) && (ti[ti.length - 1] !== 0), JSON.stringify(ti.map(x => x === 0 ? 0 : x[6])));
  const json = JSON.parse(JSON.stringify(z));
  // Client-Seite
  const spiel = { fahrzeuge: [], werkstatt: null }, C = new R.Tiere(spiel); C.nurAnzeige = true; C.einsetzen(st, 2, {});
  pruefe('T6 Client: gleiche Plätze (Anzahl und Art) wie der Server', C.slots.length === T.slots.length && C.slots.every((s, k) => s.art === T.slots[k].art), C.slots.length + '/' + T.slots.length);
  C.zustandAnwenden(json.ti); json.ti.forEach((e2, k) => { if (e2) C.poseAus(k, e2); });
  let maxD = 0, aktivGleich = true;
  for (let k = 0; k < T.slots.length; k++) { const a = T.slots[k], b = C.slots[k]; if (a.aktiv !== b.aktiv) aktivGleich = false; if (a.aktiv) maxD = Math.max(maxD, Math.abs(a.x - b.x), Math.abs(a.z - b.z), Math.abs(a.y - b.y), Math.abs(a.heading - b.heading)); }
  pruefe('T6 Client = Server: gleiche aktive Plätze, Posen auf 1 mm', aktivGleich && maxD < 0.0011, maxD);
  // Client rechnet nichts (nurAnzeige): schritt ändert nichts
  const vor = JSON.stringify(C.zustandKodieren()); C.schritt(1, true); pruefe('T6 Client (nurAnzeige) rechnet nichts', vor === JSON.stringify(C.zustandKodieren()) && C.tiere.length === 0);
  // Deterministik: zwei Server-Läufe gleich
  const lauf2 = () => { const s2 = neu({ streckeId: 'wiese', gegner: 2, tiere: true, runden: 2 }, undefined, 77), st2 = s2.sim.strecke, pv = new R.Vehicle(R.carCatalog.find(a => a.id === 'porsche-911').fahrwerte, { tempoKlasse: s2.sim.tempoKlasse }); let idx = -1; const out = [];
    for (let n = 0; n < 60 * 150; n++) { R.Netz.fahrzeugSchreiben(pv, s2.ich(0).v); const a = autopilot(st2, pv, idx, 0.8); idx = a.idx; s2.eingabeSetzen(0, a.s); s2.schritt(); if (n % 120 === 0) out.push(JSON.stringify(s2.zustand().ti)); }
    return { out, stat: s2.sim.tiere.statistik }; };
  const a = lauf2(), b = lauf2();
  pruefe('T6 deterministisch: zwei Läufe (Seed 77) gleiche ti-Folge und Statistik', JSON.stringify(a.out) === JSON.stringify(b.out) && JSON.stringify(a.stat) === JSON.stringify(b.stat) && a.stat.auftritte >= 1, JSON.stringify(a.stat));
}

// ---------------- T7 Rundenzeit KI mit Tieren AN höchstens +5 %
if (!KURZ || true) {
  const ids = KURZ ? ['wiese', 'wald'] : ['wiese', 'wald', 'alpen', 'dino', 'wueste', 'fantasie'];
  const lauf = (id, tiere) => {
    const sim = neu({ streckeId: id, gegner: 3, runden: 2, schwierigkeit: 'mittel', tiere, tempoKlasse: 'schnell' }, undefined, 5);
    sim.zuKI(0);
    const rz = sim.sim.rennen;
    for (let n = 0; n < 60 * 700 && !rz.teilnehmer.every(t => t.imZiel); n++) sim.schritt();
    const zeiten = rz.teilnehmer.map(t => t.imZiel ? t.zielZeit : NaN);
    return { zeiten, mittel: zeiten.reduce((a, b) => a + b, 0) / zeiten.length, getroffen: sim.sim.tiere ? sim.sim.tiere.statistik.getroffen : 0, auftritte: sim.sim.tiere ? sim.sim.tiere.statistik.auftritte : 0 };
  };
  const zeilen = [];
  for (const id of ids) {
    const o = lauf(id, false), m = lauf(id, true);
    const d = (m.mittel / o.mittel - 1) * 100;
    zeilen.push([id, o.mittel, m.mittel, d, m.getroffen, m.auftritte]);
    pruefe(`T7 ${id}: KI-Rennzeit mit Tieren ≤ +5 %`, Number.isFinite(d) && d <= 5.0, `ohne ${o.mittel.toFixed(1)} s, mit ${m.mittel.toFixed(1)} s (${d >= 0 ? '+' : ''}${d.toFixed(2)} %), Tiere ${m.auftritte} Auftritte, KI-Treffer ${m.getroffen}`);
  }
}

console.log(`\n${geprueft - fehler} OK, ${fehler} FEHL (${geprueft} Prüfungen)`);
process.exit(fehler ? 1 : 0);
