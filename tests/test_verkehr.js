// Verkehr (15.10., v25): node tests/test_verkehr.js
// Geisterfahrer (3 je Runde, entgegen der Fahrtrichtung), Krankenwagen (3× Schaden), Abschleppwagen (langsames Hindernis) – src/world/verkehr.js
//  V1) Planung auf ALLEN Strecken/Welten/Varianten: 3 Routen, nie in Sperrzonen (Tunnel, Brücken, Überführungen, Kreuzungen, Engstellen, Loopings, Schanzen, Start/Ziel), deterministisch
//  V2) Standard AUS: Menü-/Server-Einstellungen, Anzahlen (v28: Krankenwagen/Abschleppwagen einzeln 1; alt wenig/viel = beide an), ohne Verkehr kein `vk` im Zustand (wie Version 4)
//  V3) Schaden: Krankenwagen-Kontakt kostet 3× (15 % statt 5 %), Verkehrswagen selbst nehmen keinen Schaden
//  V4) Rennen mit Autopilot auf mehreren Strecken: Geisterfahrer-Auftritte je Runde (v28: 0–2, im Test fest 2), fahren entgegen der Richtung, Hupe/Lichthupe, nichts bleibt hängen, KI und Mensch kommen ins Ziel
//  V5) Online: vk-Format (14 Zahlen, Flags), Kollision im Geistermodus nur mit Verkehr, Determinismus (zwei Läufe identisch)
const S = require('../server/simulation.js');
const { Simulation, laden, einstellungenPruefen } = S;
const R = laden(), DT = R.config.physik.schritt;
let fehler = 0, geprueft = 0;
function pruefe(name, ok, info) { geprueft++; console.log((ok ? 'OK   ' : 'FEHL ') + name + (info !== undefined ? '  (' + info + ')' : '')); if (!ok) fehler++; }

// ---------------- V1 Planung
{
  const Vk = R.Verkehr;
  let strecken = 0, schlecht = [], zuWenig = [], nichtDet = [];
  for (const daten of R.trackCatalog) {
    const welten = [''].concat(Object.keys(daten.welten || {})), varianten = [''].concat(Object.keys(daten.varianten || {}));
    for (const w of welten) for (const va of varianten) {
      let st;
      try { st = new R.Strecke(daten, { welt: R.Strecke.weltName(daten, w), variante: va }); } catch (e) { schlecht.push(daten.id + '/' + w + '/' + va + ' ' + e.message); continue; }
      strecken++;
      const L = st.spline.laenge, zonen = Vk.sperrzonen(st), routen = Vk.geisterRouten(st, 'test'), r2 = Vk.geisterRouten(st, 'test');
      const nm = `${daten.id}${w ? '/' + w : ''}${va ? '/' + va : ''}`;
      if (JSON.stringify(routen) !== JSON.stringify(r2)) nichtDet.push(nm);
      if (routen.length < 3) zuWenig.push(nm + ':' + routen.length);
      for (const r of routen) {
        for (let s = r.a; s <= r.b; s += 5) if (Vk.gesperrt(zonen, s, 0)) { schlecht.push(nm + ' Route ' + Math.round(r.a) + '–' + Math.round(r.b) + ' in Sperrzone bei ' + Math.round(s)); break; }
        if (r.b > L || r.a < 0) schlecht.push(nm + ' Route außerhalb');
      }
    }
  }
  pruefe('V1 Routen nie in Sperrzonen (alle Strecken/Welten/Varianten)', schlecht.length === 0, `${strecken} Strecken` + (schlecht.length ? ': ' + schlecht.slice(0, 4).join(' | ') : ''));
  pruefe('V1 immer 3 Routen je Strecke', zuWenig.length === 0, zuWenig.slice(0, 6).join(', '));
  pruefe('V1 Planung deterministisch', nichtDet.length === 0, nichtDet.join(','));
}

// ---------------- V2 Einstellungen / Protokoll
const neu = (opt, sp) => new Simulation({ einstellungen: Object.assign({ streckeId: 'wiese', runden: 2, gegner: 2, tageszeit: 'tag', jahreszeit: 'sommer', wetter: 'klar', windStaerke: 0 }, opt),
  spieler: sp || [{ fahrer: 'Jonas', auto: 'porsche-911', hilfe: 'aus' }], seed: 11 });
{
  const c = R.config.verkehr;
  pruefe('V2 Standard: Geisterfahrer aus, Verkehr aus', c.geisterfahrerStandardAn === false && c.verkehrStandard === 'aus');
  const e = (o) => einstellungenPruefen(o, 1);
  pruefe('V2 Server-Prüfung: nur echtes true / bekannte Stufen', e({ geisterfahrer: true }).geisterfahrer === true && e({ geisterfahrer: 'true' }).geisterfahrer === false && e({}).geisterfahrer === false &&
    e({ verkehr: 'xyz' }).verkehr === 'aus' && e({ verkehr: 3 }).verkehr === 'aus' && e({}).verkehr === 'aus');
  // v28 (W1): Krankenwagen/Abschleppwagen je einzeln; alte Einstellung `verkehr` wenig/viel (alter Client) = beide an; explizite Felder gewinnen; nur echtes true
  const k = (o) => { const x = e(o); return x.krankenwagen + '/' + x.abschleppwagen + '/' + x.verkehr; };
  pruefe('V2 v28 Server: krankenwagen/abschleppwagen einzeln, nur echtes true', k({}) === 'false/false/aus' && k({ krankenwagen: true }) === 'true/false/wenig' && k({ abschleppwagen: true }) === 'false/true/wenig' &&
    k({ krankenwagen: true, abschleppwagen: true }) === 'true/true/wenig' && k({ krankenwagen: 'true' }) === 'false/false/aus' && k({ krankenwagen: 1, abschleppwagen: 'an' }) === 'false/false/aus', [k({}), k({ krankenwagen: true }), k({ abschleppwagen: true })].join(' | '));
  pruefe('V2 v28 Migration: verkehr wenig/viel (ohne neue Felder) = beide an, unbekannt = aus, explizite Felder gewinnen', k({ verkehr: 'wenig' }) === 'true/true/wenig' && k({ verkehr: 'viel' }) === 'true/true/wenig' &&
    k({ verkehr: 'xyz' }) === 'false/false/aus' && k({ verkehr: 'viel', krankenwagen: false }) === 'false/true/wenig' && k({ verkehr: 'viel', krankenwagen: false, abschleppwagen: false }) === 'false/false/aus', [k({ verkehr: 'wenig' }), k({ verkehr: 'viel', krankenwagen: false })].join(' | '));
  const A = R.Verkehr.anzahlen;
  pruefe('V2 Anzahlen: aus 0, alt wenig 1+1 / viel 2+2 (nur opt.stufe), Geister-Routen 3', A({}).geist + A({}).kranken + A({}).abschlepp === 0 && A({ stufe: 'wenig' }).kranken === 1 && A({ stufe: 'wenig' }).abschlepp === 1 &&
    A({ stufe: 'viel' }).kranken === 2 && A({ stufe: 'viel' }).abschlepp === 2 && A({ geister: true }).geist === 3);
  pruefe('V2 v28 Anzahlen einzeln: Krankenwagen 1 / Abschleppwagen 1 / beide 1+1 / keiner 0', A({ krankenwagen: true }).kranken === 1 && A({ krankenwagen: true }).abschlepp === 0 && A({ abschleppwagen: true }).abschlepp === 1 && A({ abschleppwagen: true }).kranken === 0 &&
    A({ krankenwagen: true, abschleppwagen: true }).kranken + A({ krankenwagen: true, abschleppwagen: true }).abschlepp === 2 && A({ krankenwagen: false, abschleppwagen: false, stufe: 'viel' }).kranken === 0 &&
    R.Verkehr.aktiv({ krankenwagen: true }) && R.Verkehr.aktiv({ abschleppwagen: true }) && !R.Verkehr.aktiv({ krankenwagen: false, abschleppwagen: false, stufe: 'viel' }) && !R.Verkehr.aktiv({}));
  const aus = neu({}), z0 = aus.zustand();
  pruefe('V2 ohne Verkehr: kein vk, sim.verkehr null (Zustand wie Version 4)', z0.vk === undefined && aus.sim.verkehr === null && z0.a.length === 3);
  const an = neu({ geisterfahrer: true, krankenwagen: true, abschleppwagen: true }), z1 = an.zustand();
  pruefe('V2 mit Verkehr: vk mit 5 Einträgen (3 Geister-Routen + Krankenwagen + Abschleppwagen) à 14 Zahlen, a nur Teilnehmer, Rangliste/Ergebnis ohne Verkehr', Array.isArray(z1.vk) && z1.vk.length === 5 && z1.vk.every(x => x.length === 14) && z1.a.length === 3 &&
    an.sim.rennen.teilnehmer.length === 3 && an.ergebnis().zeilen.length === 3, z1.vk && z1.vk.length);
  pruefe('V2 geparkt: flags 0 (nicht aktiv)', z1.vk.every(x => (x[6] & 2) === 0));
  pruefe('V2 startInfo meldet die Einstellungen', an.startInfo().einstellungen.geisterfahrer === true && an.startInfo().einstellungen.krankenwagen === true && an.startInfo().einstellungen.abschleppwagen === true && an.startInfo().einstellungen.verkehr === 'wenig' && aus.startInfo().einstellungen.verkehr === 'aus' && aus.startInfo().einstellungen.krankenwagen === false);
  pruefe('V2 Netz.VERSION unverändert additiv (≥ 4)', R.Netz.VERSION >= 4, R.Netz.VERSION);
}

// ---------------- V3 Schaden
{
  const mk = () => { const fz = [{ vehicle: { x: 0, z: 0 }, istSpieler: true }, { vehicle: { x: 3, z: 0 } }, { vehicle: { x: 9, z: 0 }, verkehr: { art: 'krankenwagen' } }];
    const sc = new R.Schaden(fz, { an: true }); return { fz, sc }; };
  const a = mk(), b = mk();
  a.sc.treffer(0, 'auto', 6, 0);
  b.sc.treffer(0, 'auto', 6, 0, 3);
  const pa = a.sc.z[0].punkte, pb = b.sc.z[0].punkte;
  pruefe('V3 normaler Rempler −5 %, Krankenwagen ×3 = −15 %', pa === 95 && pb === 85, `${pa} / ${pb}`);
  const c = mk(); c.fz[0].verkehr = { art: 'x' };
  pruefe('V3 Verkehrswagen nehmen selbst keinen Schaden', c.sc.zaehlt(0, 'auto', 6) === false);
  const d = mk(); d.sc.stoesseAuswerten({ auto: [{ a: 0, b: 1, staerke: 6, faktor: 3, dreht: [false, false] }] });
  pruefe('V3 stoesseAuswerten gibt faktor weiter', d.sc.z[0].punkte === 85, d.sc.z[0].punkte);
}

// ---------------- V4/V5 Rennen mit Autopilot
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
function lauf(streckeId, opt, sekunden, extra) {
  const sim = neu(Object.assign({ streckeId, runden: 2 }, opt)), st = sim.sim.strecke, vk = sim.sim.verkehr;
  const pv = new R.Vehicle(R.carCatalog.find(a => a.id === 'porsche-911').fahrwerte, { tempoKlasse: sim.sim.tempoKlasse });
  let idx = -1, fertig = false;
  const log = { warn: 0, ghostRichtungFalsch: 0, maxVkSprung: 0, gesehen: new Set(), hupe: 0, lichthupe: 0, zeitAktiv: 0, geisterAktiv: 0, gegenfahrt: 0, gegenfahrtN: 0, hit: 0 };
  let vor = null;
  for (let n = 0; n < sekunden * 60; n++) {
    R.Netz.fahrzeugSchreiben(pv, sim.ich(0).v);
    const a = autopilot(st, pv, idx, 0.8); idx = a.idx;
    sim.eingabeSetzen(0, a.s); sim.schritt();
    if (vk) {
      const z = sim.zustand(), w = vk.warnung(0);
      if (w) log.warn++;
      vk.eintraege.forEach((e, k) => {
        if (!e.aktiv) return;
        log.gesehen.add(e.art + e.k);
        const f = e.f, v = f.vehicle;
        if (e.art === 'geisterfahrer') {
          log.geisterAktiv++;
          const tg = st.spline.punktBei(f.nah.s), dir = (-Math.sin(v.heading)) * tg.tx + (-Math.cos(v.heading)) * tg.tz;
          if (Math.abs(v.vLaengs) > 10) { log.gegenfahrtN++; if (dir * Math.sign(v.vLaengs) < 0) log.gegenfahrt++; }
          if (e.lichtHupe) log.lichthupe++;
        }
      });
      if (extra) extra(sim, vk, n, log);
    }
    if (sim.sim.rennen.teilnehmer[0].imZiel) { fertig = true; break; }
  }
  return { sim, vk, log, fertig };
}
{
    const kat = R.trackCatalog.map(t => t.id);
  const wahl = ['wiese', 'wald', 'fantasie'].filter(id => kat.includes(id));
  const verteilungAlt = R.config.verkehr.geister.verteilung;
  R.config.verkehr.geister.verteilung = [0, 0, 1];         // v28 (W3): im Test fest 2 Geisterfahrer je Runde (sonst zufällig 0–2)
  for (const id of wahl) {
    const r = lauf(id, { geisterfahrer: true, krankenwagen: true, abschleppwagen: true, runden: 1 }, 500);
    const s = r.vk.statistik, geist = [...r.log.gesehen].filter(x => x.startsWith('geisterfahrer')).length;
    pruefe(`V4 ${id}: Auto kommt ins Ziel`, r.fertig, `t=${(r.sim.sim.rennen.zeit).toFixed(0)}s`);
    const soll2 = R.Verkehr.geisterAuswahl(r.vk.routen, r.vk.seed, 0, r.sim.sim.strecke.spline.laenge).length;       // 2, wo ein Paar mit >= 400 m Abstand existiert (sonst 1)
    pruefe(`V4 ${id}: Geisterfahrer erscheinen (2 je Runde, v28: nie mehr als 2; ohne Paar >= 400 m: 1)`, s.geister === soll2 && geist === soll2, `Auftritte ${s.geister}, verschiedene ${geist}`);
    pruefe(`V4 ${id}: Geisterfahrer fahren entgegen der Fahrtrichtung`, r.log.gegenfahrtN > 0 && r.log.gegenfahrt / r.log.gegenfahrtN > 0.95, `${(100 * r.log.gegenfahrt / Math.max(1, r.log.gegenfahrtN)).toFixed(1)} %`);
    pruefe(`V4 ${id}: keine HUD-Warnung (v28: warnung aus)`, r.log.warn === 0, r.log.warn);
    pruefe(`V4 ${id}: Krankenwagen + Abschleppwagen fahren`, s.kranken > 0 && s.abschlepp > 0, `K ${s.kranken} A ${s.abschlepp}`);
    pruefe(`V4 ${id}: kaum Hängenbleiber`, s.haengenAlleine <= 1, `allein ${s.haengenAlleine}, mit Rempler ${s.haengen - s.haengenAlleine}, Auftritte ${s.auftritte}`);
    const ki = r.sim.sim.rennen.teilnehmer.filter(t => !t.istSpieler);
    pruefe(`V4 ${id}: KI-Gegner kommen voran (alle > 1 Runde)`, ki.every(t => t.fortschritt > r.sim.sim.strecke.spline.laenge * 0.99), ki.map(t => Math.round(t.fortschritt)).join('/'));
  }
  R.config.verkehr.geister.verteilung = verteilungAlt;
}
{
  const a = lauf('wiese', { geisterfahrer: true, krankenwagen: true, abschleppwagen: true }, 90), b = lauf('wiese', { geisterfahrer: true, krankenwagen: true, abschleppwagen: true }, 90);
  pruefe('V5 deterministisch: zwei Läufe gleiche Statistik und Zustand', JSON.stringify(a.vk.statistik) === JSON.stringify(b.vk.statistik) && JSON.stringify(a.sim.zustand().vk) === JSON.stringify(b.sim.zustand().vk));
  const z = a.sim.zustand();
  pruefe('V5 vk-Format: aktive Wagen mit Flag 2 und endlichen Zahlen', z.vk.every(x => x.every(Number.isFinite)) && z.vk.some(x => (x[6] & 2) === 2), JSON.stringify(z.vk.map(x => x[6])));
}
{
  // Kollision im Geistermodus (Stufe 1 ohne `kollisionen`): Teilnehmer stoßen NICHT untereinander, aber mit Verkehr
  const sim = neu({ krankenwagen: true, abschleppwagen: true, gegner: 0 }), vk = sim.sim.verkehr, P = sim.sim.fahrzeuge[0].vehicle;
  const k = vk.eintraege.find(e => e.art === 'abschleppwagen');
  for (let n = 0; n < 60 * 20 && !sim.sim.rennen.gasErlaubt; n++) sim.schritt();
  k.route = { a: 100, b: 900 };
  vk._erscheinen(k, 150, 0, 0);
  const T = k.f.vehicle, rt = T.richtung();
  P.setzen(T.x - rt.x * 12, T.z - rt.z * 12, T.heading);       // 12 m hinter dem Lkw, gleiche Richtung, fährt auf ihn zu
  P.vLaengs = 25;
  let stoss = 0, maxV = 25;
  for (let n = 0; n < 90; n++) { sim.eingabeSetzen(0, { gas: 1, bremse: 0, lenkung: 0 }); T.vLaengs = 0; sim.schritt(); maxV = Math.min(maxV, P.vLaengs); if (sim.sim.stoesse && sim.sim.stoesse.length) stoss++; }
  pruefe('V5 online Geistermodus: Auto stößt mit Abschleppwagen', stoss > 0 && maxV < 15, `Stöße ${stoss}, min v ${maxV.toFixed(1)}`);
}


// ---------------- V7 (v28 W3) Geisterfahrer selten: 0–2 je Runde, Erwartung ~1,2, Mindestabstand 400 m, keine Warnung
{
  const Vk = R.Verkehr;
  let strecken = 0, zuNah = [], keinPaar = [], nichtDet = [], bereich = [];
  for (const daten of R.trackCatalog) {
    const welten = [''].concat(Object.keys(daten.welten || {})), varianten = [''].concat(Object.keys(daten.varianten || {}));
    for (const w of welten) for (const va of varianten) {
      let st; try { st = new R.Strecke(daten, { welt: R.Strecke.weltName(daten, w), variante: va }); } catch (e) { continue; }
      strecken++;
      const L = st.spline.laenge, routen = Vk.geisterRouten(st, 'test'), nm = `${daten.id}${w ? '/' + w : ''}${va ? '/' + va : ''}`;
      let summe = 0, n = 200, paar = 0;
      for (let r = 0; r < n; r++) {
        const a = Vk.geisterAuswahl(routen, 'test', r, L), b = Vk.geisterAuswahl(routen, 'test', r, L);
        if (JSON.stringify(a) !== JSON.stringify(b)) nichtDet.push(nm);
        if (a.length > 2) bereich.push(nm + ':' + a.length);
        summe += a.length;
        if (a.length === 2) {
          paar++;
          const p = routen[a[0]], q = routen[a[1]];
          const d1 = (((q.a - p.b) % L) + L) % L, d2 = (((p.a - q.b) % L) + L) % L;
          if (Math.min(d1, d2) < 400) zuNah.push(nm);
        }
      }
      if (paar === 0 && routen.length >= 2) keinPaar.push(nm);
      if (summe / n > 1.5 || summe / n < 0.7) bereich.push(nm + ' E ' + (summe / n).toFixed(2));
    }
  }
  pruefe('V7 je Runde 0–2 Geisterfahrer, Erwartung 0,7–1,5 auf allen Strecken', bereich.length === 0, `${strecken} Strecken ` + bereich.slice(0, 4).join(' | '));
  pruefe('V7 zwei Geisterfahrer nur mit >= 400 m Strecke dazwischen', zuNah.length === 0, zuNah.slice(0, 4).join(', '));
  pruefe('V7 Auswahl deterministisch (Seed + Runde)', nichtDet.length === 0);
  console.log('     (Strecken ohne Paar >= 400 m, dort nur 1 Geisterfahrer: ' + (keinPaar.length ? keinPaar.slice(0, 6).join(', ') : 'keine') + ')');
  const st0 = R.trackCatalog[0], summe = (() => { let h = [0, 0, 0]; const L = 3000, rt = [{ a: 100, b: 600 }, { a: 1200, b: 1700 }, { a: 2200, b: 2700 }]; for (let r = 0; r < 4000; r++) h[Vk.geisterAuswahl(rt, 'verteilung', r, L).length]++; return h.map(x => x / 4000); })();
  pruefe('V7 Verteilung 0/1/2 ≈ 20/40/40 % (Erwartung ≈ 1,2)', Math.abs(summe[0] - 0.2) < 0.04 && Math.abs(summe[1] - 0.4) < 0.04 && Math.abs(summe[2] - 0.4) < 0.04, summe.map(x => (100 * x).toFixed(0) + ' %').join(' / '));
  void st0;
  pruefe('V7 config: Warnung aus, Mindestabstand 400', R.config.verkehr.geister.warnung === false && R.config.verkehr.geister.mindestAbstand === 400);
  // nie zwei gleichzeitig sichtbar (Mindestabstand): Lauf über mehrere Runden, Abstand der aktiven Geisterfahrer in s
  const r = lauf('wiese', { geisterfahrer: true, runden: 6, gegner: 0 }, 900, (sim, vk, n, log) => {
    const akt = vk.eintraege.filter(e => e.art === 'geisterfahrer' && e.aktiv && e.f.nah);
    if (akt.length > 2) log.mehrAls2 = (log.mehrAls2 || 0) + 1;
    if (akt.length === 2) { const L = sim.sim.strecke.spline.laenge; let d = Math.abs(akt[0].f.nah.s - akt[1].f.nah.s) % L; if (d > L / 2) d = L - d; log.minD = Math.min(log.minD === undefined ? 1e9 : log.minD, d); }
  });
  pruefe('V7 Lauf 6 Runden Wiese: nie 2 Geisterfahrer näher als 400 m, höchstens 2 Auftritte je Runde', !r.log.mehrAls2 && (r.log.minD === undefined || r.log.minD >= 400) && r.vk.statistik.geister <= 12,
    `Auftritte ${r.vk.statistik.geister} in ${r.sim.sim.rennen.zeit.toFixed(0)} s, min Abstand ${r.log.minD === undefined ? '–' : r.log.minD.toFixed(0)} m, Warnungen ${r.log.warn}`);
  pruefe('V7 keine HUD-Warnung, Minimap blinkt nicht', r.log.warn === 0 && r.vk.minimapPunkte().blink === false);
}

// ---------------- V6 KI: Computerfahrer überholen den Verkehr ohne Hängen (KI-Fortschritt bei gleicher Zeit mit/ohne Verkehr)
{
  const fort = (opt) => { const r = lauf('wiese', Object.assign({ runden: 2, gegner: 3 }, opt), 150); return r.sim.sim.rennen.teilnehmer.filter(t => !t.istSpieler).map(t => t.fortschritt); };
  const ohne = fort({}), mit = fort({ geisterfahrer: true, krankenwagen: true, abschleppwagen: true });
  const so = ohne.reduce((x, y) => x + y, 0), sm = mit.reduce((x, y) => x + y, 0);
  pruefe('V6 KI mit Verkehr kommt voran (≥ 70 % des Fortschritts ohne Verkehr nach 150 s)', sm >= 0.7 * so && mit.every(x => x > 1000), `${mit.map(Math.round).join('/')} statt ${ohne.map(Math.round).join('/')} m`);
}

console.log(`\n${geprueft} geprüft, ${fehler} Fehler`);
process.exit(fehler ? 1 : 0);
