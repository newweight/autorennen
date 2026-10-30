// Stufe R2 (Online-Modi): node tests/test_r2_online.js
// Kurz-Level, K.-o.-Rallye, Freie Fahrt online zu zweit (bis 6 Menschen), Geist und Dino-Aufgaben online – Auto UND Motorrad. Der Server entscheidet alles.
//  A) Standard bitgleich (ohne R2-Wahl: Einstellungen unverändert), Whitelists (Unbekanntes → Standard), Rückweg auf „Rennen“
//  B) Server = Client: Startaufstellung (plaetze), Frei-Plan (gleich bei gleichem spass/zauber/eigen), Kurz-Abschnitt
//  C) Kurz-Level (Autopilot, Sterne = auswerten, Münzen/Sprung/Kanone, Motorrad Ring/Bus/Tricks, Spieler geht, Zeit um)
//  D) K.-o. (2 Menschen + 3 KI, Reihenfolge, Finale, w, Mensch raus; Auto + Motorrad)
//  E) Freie Fahrt (einmalige Vergabe, Scheitern, Aufgaben = Offline-Rechenteil, Zeitlimit, Ergebnis)
//  F) Dino (Seed, = direktes dino.schritt, nur Besitzer, aus = nichts)
//  G) alter/neuer Client, H) kaputte Nachrichten, I) komplette Läufe über WebSocket
// Wächter 300 s. Kein process.exit im Erfolgsfall.
'use strict';
const http = require('http');
const path = require('path');
const WebSocket = require(path.join(__dirname, '..', 'server', 'node_modules', 'ws'));
const { starten } = require('../server/server');
const { Simulation, laden, ladenMoto, einstellungenPruefen } = require('../server/simulation');

let fehler = 0, ok = 0;
setTimeout(() => { console.log('FEHL Wächter: Test hängt (> 900 s) – Abbruch'); process.exit(3); }, 900000).unref();
function pruefe(name, gut, info) { console.log((gut ? 'OK   ' : 'FEHL ') + name + (info !== undefined ? '  (' + info + ')' : '')); if (gut) ok++; else fehler++; }
const warte = (ms) => new Promise(r => setTimeout(r, ms));
const R = laden(), RM = ladenMoto();
const DT = R.config.physik.schritt;
const json = (x) => JSON.stringify(x);
const nurTeil = process.argv[2] || '';       // z. B. "node tests/test_r2_online.js C" läuft nur Teil C

/** Einfacher Autopilot (Pure Pursuit + Tempo der Ideallinie) aus der Pose → Steuerung. */
function autopilot(C, st, v, idx) {
  const n = st.abfrage(v.x, v.z, idx), sp = st.spline;
  const vl = Math.max(3, v.vLaengs), L = Math.max(9, Math.min(50, 0.55 * vl + 8));
  const ziel = sp.punktBei(n.s + L);
  let diff = C.headingAus(ziel.x - v.x, ziel.z - v.z) - v.heading;
  while (diff > Math.PI) diff -= 2 * Math.PI;
  while (diff < -Math.PI) diff += 2 * Math.PI;
  const lenkung = Math.max(-1, Math.min(1, -(2 * vl * Math.sin(diff) / Math.hypot(ziel.x - v.x, ziel.z - v.z)) / v.drehrateMax(vl)));
  const soll = st.tempoBei(n.s + vl * 0.3) * 0.85;
  return { s: { gas: v.vLaengs < soll ? 1 : 0, bremse: v.vLaengs > soll + 3 ? 0.5 : 0, lenkung }, idx: n.index };
}
/** Server-Simulation mit Autopiloten für alle Menschen (Eingaben aus der Pose). */
function neueSim(einst, namen, moto, seed) {
  return new Simulation({ moto: !!moto, einstellungen: einst, spieler: namen.map((n, i) => ({ fahrer: n, auto: moto ? 'superbike' : 'porsche-911', hilfe: 'aus' })), seed: seed || 7 });
}
function fahren(sim, sek, optionen) {
  const o = optionen || {}, idx = {}, C = sim.R, nM = sim.teilnehmerInfo.filter(t => t.mensch).length;
  const ereig = [];
  for (let n = 0; n < sek * 60 && !sim.fertig; n++) {
    for (let i = 0; i < nM; i++) {
      const f = sim.sim.fahrzeuge[i];
      if (!f.istSpieler) continue;
      if (o.eingabe) { const s = o.eingabe(i, n, f); if (s) { sim.eingabeSetzen(i, s); continue; } }
      const a = autopilot(C, sim.sim.strecke, f.vehicle, idx[i] === undefined ? -1 : idx[i]); idx[i] = a.idx;
      sim.eingabeSetzen(i, a.s);
    }
    sim.schritt();
    for (const e of sim.abholen()) { ereig.push(Object.assign({ n }, e)); if (o.beiEreignis) o.beiEreignis(e, n); }
    if (o.beiSchritt) o.beiSchritt(n);
  }
  return ereig;
}
const teil = (k) => !nurTeil || nurTeil === k;

(async () => {
  // ================================================================== A) Standard bitgleich, Whitelists
  if (teil('A')) {
    const proben = [{}, { streckeId: 'wald', runden: 5, gegner: 2 }, { streckeId: 'alpen', polizei: true, tiere: true, spass: true, zauber: true }, { streckeId: 'wueste', krankenwagen: true, wetter: 'regen' },
      { streckeId: 'dino', hindernisMenge: 'viele', tuning: true }, { streckeId: 'formel1', nurRennautos: true, zufall: true, tageszeit: 'nacht' }];
    let gleich = true, ohneFelder = true;
    for (const moto of [false, true]) for (const p of proben) for (const n of [1, 3, 6]) {
      const mit = einstellungenPruefen(p, n, moto);
      const sp = R.SpassR2; R.SpassR2 = undefined;
      const ohne = einstellungenPruefen(p, n, moto);
      R.SpassR2 = sp;
      if (json(mit) !== json(ohne)) gleich = false;
      for (const k of ['modus', 'level', 'freiZeit', 'geist', 'dino', 'r2b']) if (k in mit) ohneFelder = false;
    }
    pruefe('A ohne R2-Wahl: Raum-Einstellungen bitgleich (mit/ohne R2-Kern, Auto+Motorrad, 1/3/6 Spieler, 6 Proben), keine neuen Schlüssel', gleich && ohneFelder);
    const muell = [{ modus: 'xyz' }, { modus: 5 }, { modus: null }, { modus: 'rennen' }, { level: 'a01' }, { freiZeit: 7 }, { freiZeit: 3 }, { geist: 'ja' }, { geist: 1 }, { geist: false }, { dino: 'xx' }, { dino: 'aus' }, { dino: 7 }];
    const alleStandard = muell.every((m) => { const e = einstellungenPruefen(Object.assign({ streckeId: 'wiese' }, m), 2); return json(e) === json(einstellungenPruefen({ streckeId: 'wiese' }, 2)); });
    pruefe('A Unbekanntes/Falsches (modus xyz, freiZeit 7, geist "ja", dino xx, level ohne Modus) → Standard, nichts im Objekt', alleStandard);
    const g = einstellungenPruefen({ streckeId: 'wiese', geist: true, dino: 'dino' }, 2), g2 = einstellungenPruefen({ streckeId: 'wiese', geist: true, dino: 'immer' }, 2);
    pruefe('A Geist nur mit echtem true, Dino nur dino/immer; sonst keine Schlüssel', g.geist === true && g.dino === 'dino' && g2.dino === 'immer' && einstellungenPruefen({ geist: 'true' }, 2).geist === undefined);
    const ku = einstellungenPruefen({ streckeId: 'alpen', modus: 'kurz', level: 'a02', gegner: 5, polizei: true, tiere: true, krankenwagen: true, zufall: true, wetter: 'regen', tageszeit: 'nacht', windStaerke: 3, geist: true, dino: 'dino' }, 3);
    pruefe('A Kurz: Strecke aus Level, 0 Gegner, 10 Runden-Limit, Polizei/Tiere/Verkehr/Zufall aus, Spaß an, klar/Tag/Wind 0, kein Geist/Dino',
      ku.modus === 'kurz' && ku.level === 'a02' && ku.streckeId === 'wald' && ku.gegner === 0 && ku.runden === R.config.rennen.rundenMax && !ku.polizei && !ku.tiere && !ku.krankenwagen && !ku.zufall && ku.spass === true &&
      ku.wetter === 'klar' && ku.tageszeit === 'tag' && ku.windStaerke === 0 && ku.geist === undefined && ku.dino === undefined, json([ku.streckeId, ku.gegner, ku.runden]));
    const kuF = einstellungenPruefen({ modus: 'kurz', level: 'ZZ' }, 1), kuM = einstellungenPruefen({ modus: 'kurz', level: 'm04' }, 1, true), kuM2 = einstellungenPruefen({ modus: 'kurz', level: 'a01' }, 1, true);
    pruefe('A Kurz: unbekanntes Level → erstes Level; Motorrad kennt m-Level, nicht a-Level', kuF.level === 'a01' && kuM.level === 'm04' && kuM.streckeId === 'wald' && kuM2.level === 'm01');
    const ko = einstellungenPruefen({ streckeId: 'wiese', modus: 'ko', gegner: 1, polizei: true, tiere: true }, 2), ko6 = einstellungenPruefen({ streckeId: 'wiese', modus: 'ko', gegner: 10 }, 6);
    pruefe('A K.-o.: mindestens 3 KI, Runden = SpassKO.runden(Menschen+KI), Polizei/Tiere/Verkehr aus; Obergrenze 12 Fahrzeuge', ko.gegner === 3 && ko.runden === R.SpassKO.runden(5) && !ko.polizei && !ko.tiere && ko6.gegner === 6 && ko6.runden === R.SpassKO.runden(12), json([ko.gegner, ko.runden, ko6.gegner, ko6.runden]));
    const fr = einstellungenPruefen({ streckeId: 'alpen', modus: 'frei', freiZeit: 10, gegner: 4, polizei: true, zufall: true, spass: false }, 2), fr5 = einstellungenPruefen({ streckeId: 'alpen', modus: 'frei', freiZeit: 5 }, 2);
    pruefe('A Frei: 0 Gegner, Polizei/Verkehr/Zufall aus, Spaß an, freiZeit nur 3/5/10 (Standard 5 fehlt im Objekt)', fr.modus === 'frei' && fr.gegner === 0 && !fr.polizei && !fr.zufall && fr.spass === true && fr.freiZeit === 10 && fr5.freiZeit === undefined && fr.streckeId === 'alpen');
    // Rückweg: Modus zurück auf „Rennen“ holt die Werte vor dem Überschreiben zurück (auch Kurz → K.-o. direkt)
    const basis = einstellungenPruefen({ streckeId: 'alpen', gegner: 5, runden: 4, wetter: 'regen', polizei: true, spass: false }, 2);
    const inKurz = einstellungenPruefen(Object.assign({}, basis, { modus: 'kurz', level: 'a03' }), 2);
    const zurueck = einstellungenPruefen(Object.assign({}, inKurz, { modus: 'rennen' }), 2);
    pruefe('A Rückweg Kurz → Rennen: Strecke/Gegner/Runden/Wetter/Polizei wie vorher, keine R2-Schlüssel', json(zurueck) === json(basis), json(zurueck) === json(basis) ? '' : json(zurueck));
    const kurzKo = einstellungenPruefen(Object.assign({}, inKurz, { modus: 'ko' }), 2);
    pruefe('A Kurz → K.-o. direkt: Strecke wieder die des Hosts (alpen), nicht die des Levels', kurzKo.modus === 'ko' && kurzKo.streckeId === 'alpen' && kurzKo.level === undefined && kurzKo.gegner >= 3);
    const koFrei = einstellungenPruefen(Object.assign({}, einstellungenPruefen(Object.assign({}, basis, { modus: 'ko' }), 2), { modus: 'frei' }), 2);
    pruefe('A K.-o. → Frei direkt: 0 Gegner (nicht die K.-o.-Gegner)', koFrei.modus === 'frei' && koFrei.gegner === 0 && koFrei.streckeId === 'alpen');
    // Gleicher Modus: nachträgliches Ändern des Hosts bleibt (z. B. Strecke im K.-o.)
    const koStrecke = einstellungenPruefen(Object.assign({}, einstellungenPruefen(Object.assign({}, basis, { modus: 'ko' }), 2), { streckeId: 'wald' }), 2);
    pruefe('A K.-o.: Strecke ändern bleibt möglich', koStrecke.streckeId === 'wald' && koStrecke.modus === 'ko');
  }

  // ================================================================== B) Server = Client
  if (teil('B')) {
    for (const moto of [false, true]) {
      const C = moto ? RM : R, art = moto ? 'motorrad' : 'auto';
      let alleGleich = true, anzahlFehl = '';
      for (const def of C.SpassKurz.liste(art)) {
        const e = einstellungenPruefen({ modus: 'kurz', level: def.id }, 3, moto);
        const sim = new Simulation({ moto, einstellungen: e, spieler: [{ fahrer: 'Jonas', auto: moto ? 'superbike' : 'porsche-911' }, { fahrer: 'Mia', auto: moto ? 'superbike' : 'porsche-911' }, { fahrer: 'Tom', auto: moto ? 'superbike' : 'porsche-911' }], seed: 5 });
        const info = sim.startInfo(), eS = info.einstellungen;
        // „Browser“: eigener Kontext, Strecke aus den Start-Einstellungen
        const st = C.trackCatalog.find((t) => t.id === eS.streckeId);
        const stB = new C.Strecke(st, { welt: C.Strecke.weltName ? C.Strecke.weltName(st, eS.welt) : undefined, variante: eS.variante, hindernisMenge: eS.hindernisMenge, spass: true });
        const pl = C.SpassR2.plaetze(stB, eS, 3);
        const ok3 = pl.every((p, i) => { const v = sim.sim.fahrzeuge[i].vehicle; return Math.abs(p.x - v.x) < 1e-9 && Math.abs(p.z - v.z) < 1e-9 && Math.abs(p.heading - v.heading) < 1e-9; });
        if (!ok3) { alleGleich = false; anzahlFehl += def.id + ' '; }
      }
      pruefe('B Kurz-Aufstellung: Server-Start und Browser-Rechnung (plaetze) identisch in allen 12 Leveln (' + art + ')', alleGleich, anzahlFehl);
    }
    {
      const pl = R.SpassR2.plaetze({ startpositionen: (n) => ['x' + n] }, { modus: 'ko' }, 4);
      pruefe('B plaetze: ohne Kurz-Modus = strecke.startpositionen(n) unverändert', pl[0] === 'x4');
      const sim = new Simulation({ einstellungen: einstellungenPruefen({ modus: 'kurz', level: 'a01' }, 4), spieler: ['A', 'B', 'C', 'D'].map((n) => ({ fahrer: n, auto: 'porsche-911' })), seed: 3 });
      const v = sim.sim.fahrzeuge.map((f) => f.vehicle), st = sim.sim.strecke, ab = R.SpassKurz.abschnitt(st, R.SpassKurz.level('auto', 'a01'));
      const n0 = st.spline.naechster(v[0].x, v[0].z), n1 = st.spline.naechster(v[1].x, v[1].z), n2 = st.spline.naechster(v[2].x, v[2].z);
      pruefe('B Kurz-Aufstellung: 2 nebeneinander (±2,5 m) auf Höhe des Level-Starts, 3. und 4. eine Reihe (9 m) dahinter', Math.abs(n0.s - ab.s0) < 1 && Math.abs(n1.s - ab.s0) < 1 && Math.abs(n2.s - (ab.s0 - 9)) < 1 &&
        Math.abs(Math.abs(n0.seitenabstand) - 2.5) < 0.1 && n0.seitenabstand * n1.seitenabstand < 0, [n0.s, n1.s, n2.s, ab.s0, n0.seitenabstand, n1.seitenabstand].map((x) => Math.round(x * 10) / 10).join('/'));
      const rt = sim.sim.rennen.teilnehmer;
      pruefe('B Kurz: Rennleitung wie offline gesetzt (gestartet, letzter Checkpoint = Level-Start, Runden-Limit 99)', rt.every((t) => t.gestartet && t.letzterCheckpoint === ab.cp0 && t.naechsterCheckpoint === ab.cp0 + 1) && sim.sim.rennen.runden === 99);
    }
    // Frei-Plan: gleich bei gleichem spass/zauber/eigen (Server-Strecke vs. Browser-Strecke)
    for (const moto of [false, true]) {
      const C = moto ? RM : R;
      let gleich = true, ungleich = '';
      for (const sid of C.trackCatalog.filter((t) => !t.eigen).map((t) => t.id)) {
        for (const zauber of (['wiese', 'alpen', 'mond'].includes(sid) ? [false, true] : [false])) {
          const e = einstellungenPruefen({ streckeId: sid, modus: 'frei', zauber }, 2, moto);
          const sim = new Simulation({ moto, einstellungen: e, spieler: [{ fahrer: 'Jonas', auto: moto ? 'superbike' : 'porsche-911' }], seed: 4 });
          const eS = sim.startInfo().einstellungen, st = C.trackCatalog.find((t) => t.id === eS.streckeId);
          // „Browser“: eigene Strecke aus den Start-Einstellungen, aufgebaut wie main.js streckeSzeneBauen (Schilder, Tribünen, Wracks), anderer Seed/andere Spielerzahl
          const stB = new C.Strecke(st, Object.assign({ welt: C.Strecke.weltName ? C.Strecke.weltName(st, eS.welt) : undefined, variante: eS.variante, hindernisMenge: eS.hindernisMenge }, eS.spass ? { spass: true } : {}, eS.spass && eS.zauber ? { zauber: true } : {}));
          if (C.Kurvenschilder) C.Kurvenschilder.einbauen(stB, eS.tempoKlasse);
          if (C.Tribuenen) C.Tribuenen.einbauen(stB);
          if (C.Kollisionen.wracksEinbauen) C.Kollisionen.wracksEinbauen(stB);
          const sim2 = new Simulation({ moto, einstellungen: Object.assign({}, e, { wetter: 'regen', tageszeit: 'nacht' }), spieler: [{ fahrer: 'Jonas', auto: moto ? 'superbike' : 'porsche-911' }, { fahrer: 'Mia', auto: moto ? 'superbike' : 'porsche-911' }], seed: 987 });
          const a = json(C.SpassFrei.plan(sim.sim.strecke)), b = json(C.SpassFrei.plan(stB)), c2 = json(C.SpassFrei.plan(sim2.sim.strecke));
          if (a !== b || a !== c2) { gleich = false; ungleich += sid + (zauber ? '+z ' : ' ') + (a !== b ? '(Browser) ' : '') + (a !== c2 ? '(Seed) ' : ''); }
        }
      }
      pruefe('B Frei-Plan (12 Kisten) im Server = im Browser auf jeder Strecke, mit und ohne Zauber (' + (moto ? 'Motorrad' : 'Auto') + ')', gleich, ungleich);
    }
  }

  // ================================================================== C) Kurz-Level
  if (teil('C')) {
    const SK = R.SpassKurz;
    const spieler = (moto, n) => Array.from({ length: n }, (_, i) => ({ fahrer: ['Jonas', 'Mia', 'Tom'][i], auto: moto ? 'superbike' : 'porsche-911', hilfe: 'aus' }));
    const kurzSim = (level, n, moto) => new Simulation({ moto: !!moto, einstellungen: einstellungenPruefen({ modus: 'kurz', level }, n, !!moto), spieler: spieler(moto, n), seed: 5 });
    const kurzEv = (ev) => ev.filter((x) => x.art === 'kurz');
    const sterneAus = (sim, zeit) => { const info = sim.startInfo().r2.kurz; return SK.sterne({ t3: info.t3, t2: info.t2, limit: info.limit }, zeit); };
    // C1: a01 (Ziel) zu zweit
    {
      const sim = kurzSim('a01', 2), ev = fahren(sim, 130), k = kurzEv(ev), erg = sim.ergebnis();
      pruefe('C Kurz a01 zu zweit: beide bekommen ein Ergebnis (Ereignis kurz), Rennen endet danach', k.length === 2 && k.every((x) => x.status === 'geschafft') && sim.fertig, json(k.map((x) => [x.nr, x.sterne, x.zeit])));
      pruefe('C Sterne = SpassKurz.sterne(Zeit) mit den Level-Zeiten (t3/t2/limit aus startInfo)', k.every((x) => x.sterne === sterneAus(sim, x.zeit)));
      pruefe('C Ergebnis: Plätze nach Sternen, dann Zeit; jede Zeile hat kurz{status,sterne,zeit}', erg.kurz.level === 'a01' && erg.zeilen.length === 2 && erg.zeilen.every((z) => z.kurz && z.kurz.status === 'geschafft') &&
        erg.zeilen[0].kurz.sterne >= erg.zeilen[1].kurz.sterne && (erg.zeilen[0].kurz.sterne > erg.zeilen[1].kurz.sterne || erg.zeilen[0].kurz.zeit <= erg.zeilen[1].kurz.zeit) && erg.zeilen[0].platz === 1);
    }
    // C2: a02 Münzen – jede/r hat eine eigene Münzwelt (beide sammeln dieselben Münzen); wir „fahren“ die Münzen per Versetzen ab (deterministisch), Zähler = Ereignisse = ich.r2
    {
      const sim = kurzSim('a02', 2), st = sim.sim.strecke;
      const def = SK.level('auto', 'a02'), ab = SK.abschnitt(st, def);
      const wp = R.SpassR2.weltPunkte(st, SK.muenzPlan(st, ab.s0, ab.s1, def.n));
      const gesammelt = [new Set(), new Set()];
      const ev = [];
      const setze = (i, p) => { const v = sim.sim.fahrzeuge[i].vehicle; v.x = p.x; v.z = p.z; v.y = p.y; };
      for (let n = 0; n < 60 * 4; n++) { sim.schritt(); sim.abholen(); }          // Countdown vorbei
      for (let k = 0; k < wp.length; k++) {
        setze(0, wp[k]); if (k < 6) setze(1, wp[k]);                              // Mia nimmt nur die ersten 6 Münzen mit
        sim.eingabeSetzen(0, { gas: 0, bremse: 1, lenkung: 0 }); sim.eingabeSetzen(1, { gas: 0, bremse: 1, lenkung: 0 });
        sim.schritt();
        for (const e of sim.abholen()) { ev.push(e); if (e.art === 'kMuenze') e.ids.forEach((q) => gesammelt[e.an].add(q)); }
      }
      const spaeter = fahren(sim, 130, { eingabe: (i) => (i === 1 ? { gas: 0, bremse: 1, lenkung: 0 } : { gas: 0, bremse: 1, lenkung: 0 }) });
      const all = ev.concat(spaeter), k = kurzEv(all), mu = all.filter((x) => x.art === 'kMuenze');
      const gemeinsam = [...gesammelt[0]].filter((x) => gesammelt[1].has(x)).length;
      pruefe('C Kurz a02 (Goldrausch): Münzen sind pro Spieler eigen – beide sammeln dieselben 6 Münzen, Ereignis nur an den Besitzer', gemeinsam === 6 && mu.every((x) => x.an === 0 || x.an === 1), gemeinsam + ' gemeinsam, ' + mu.length + ' Ereignisse');
      const k0 = k.find((x) => x.nr === 0), k1 = k.find((x) => x.nr === 1);
      pruefe('C Kurz a02: Spieler 0 sammelt alle ' + wp.length + ' Münzen (≥ 12) → geschafft; Spieler 1 mit 6 → Zeit um (0 Sterne); unabhängig voneinander',
        k0 && k0.status === 'geschafft' && k0.sterne >= 1 && k1 && k1.status === 'zeitUm' && k1.sterne === 0, json(k.map((x) => [x.nr, x.status, x.sterne, x.zeit])));
      const l0 = mu.filter((x) => x.an === 0);
      pruefe('C Kurz a02: Zähler im Ereignis wächst um die Zahl der ids und bleibt bei 12 stehen (Ergebnis kommt beim 12.)', l0[l0.length - 1].n === 12 && l0.reduce((a, x) => a + x.ids.length, 0) === 12, l0.length + ' Ereignisse');
      const sim2 = kurzSim('a02', 1); fahren(sim2, 3);
      pruefe('C Kurz: ich.r2 = [Zähler, Status] nur für den Spieler selbst; Zähler startet bei 0', json(sim2.ich(0).r2) === '[0,0]', json(sim2.ich(0).r2));
    }
    // C3: Sprung + Kanone
    {
      const sim = kurzSim('a04', 2), ev = fahren(sim, 80), k = kurzEv(ev);
      pruefe('C Kurz a04 (Kanone): die Kanone zählt (kanoneBumm → Zähler) → geschafft', k.length === 2 && k.every((x) => x.status === 'geschafft'), json(k.map((x) => [x.nr, x.status, x.sterne, x.zeit])));
      const sim2 = kurzSim('a03', 1), ev2 = fahren(sim2, 130), k2 = kurzEv(ev2);
      pruefe('C Kurz a03 (2 Sprünge): Landungen nach Trampolin/Kanone/Schanze zählen → geschafft', k2.length === 1 && k2[0].status === 'geschafft', json(k2.map((x) => [x.status, x.sterne, x.zeit])));
    }
    // C4: Motorrad Ring / Bus / Tricks (Stunt-Zähler)
    {
      const r = {};
      for (const lv of ['m02', 'm04']) { const sim = kurzSim(lv, 2, true); const k = kurzEv(fahren(sim, 110)); r[lv] = k.length === 2 && k.every((x) => x.status === 'geschafft'); }
      pruefe('C Motorrad m02 Feuerring und m04 Busse: Zähler aus dem Stunt-Zähler → geschafft', r.m02 && r.m04, json(r));
      const sim = kurzSim('m06', 1, true);
      let im = 0;
      const k = kurzEv(fahren(sim, 110, { beiSchritt: () => { const mo = sim.zustand().mo[0]; if ((mo[6] & 128) && im <= 0) im = 4; sim.trickSetzen(0, im > 0); if (im > 0) im--; } }));
      pruefe('C Motorrad m06 (3 Tricks): Trick-Taste im Flug → Tricks gezählt → geschafft (ohne Tricks: verpasst, s. o.)', k.length === 1 && k[0].status === 'geschafft', json(k.map((x) => [x.status, x.sterne, x.zeit])));
    }
    // C5: Spieler geht, Zeit um
    {
      const sim = kurzSim('a01', 2); let weg = false;
      const ev = fahren(sim, 130, { beiSchritt: (n) => { if (n === 600 && !weg) { weg = true; sim.zuKI(1); } } });
      const k = kurzEv(ev), erg = sim.ergebnis(), z1 = erg.zeilen.find((z) => z.nr === 1), z0 = erg.zeilen.find((z) => z.nr === 0);
      pruefe('C Kurz: wer geht, ist „weg“ (kein Ergebnis-Ereignis), der andere fährt zu Ende; Rennen endet, wenn alle Menschen fertig/weg sind', k.length === 1 && k[0].nr === 0 && z1.kurz.status === 'weg' && z1.weg === true && z0.kurz.status === 'geschafft' && sim.fertig && erg.zeilen[0].nr === 0);
      const sim2 = kurzSim('a01', 2), ev2 = fahren(sim2, 150, { eingabe: (i) => (i === 0 ? { gas: 0, bremse: 0, lenkung: 0 } : null) });
      const k2 = kurzEv(ev2), e2 = sim2.ergebnis();
      const lim = sim2.startInfo().r2.kurz.limit;
      pruefe('C Kurz: wer steht, scheitert am Zeitlimit (zeitUm, 0 Sterne, Zeit ≥ Limit); der andere ist davon unabhängig fertig', k2.length === 2 && k2.find((x) => x.nr === 0).status === 'zeitUm' && k2.find((x) => x.nr === 0).sterne === 0 && k2.find((x) => x.nr === 0).zeit >= lim && k2.find((x) => x.nr === 1).status === 'geschafft' && e2.zeilen[0].nr === 1, json(k2.map((x) => [x.nr, x.status, x.zeit])));
      const sim3 = kurzSim('a01', 1); sim3.zuKI(0);
      pruefe('C Kurz: geht der letzte Mensch, endet das Rennen sofort', sim3.fertig === true);
    }
  }

  // ================================================================== D) K.-o.-Rallye
  /** Menschen als „Gleiter“: bewegen sich mit festem Tempo auf der Mittellinie (Physik umgangen) – damit K.-o.-Reihenfolgen vorhersagbar sind. */
  function gleiter(sim, tempos) {
    const st = sim.sim.strecke, sp = st.spline, rn = sim.sim.rennen, pos = {};
    return () => {
      if (!rn.gasErlaubt) return;
      for (const i of Object.keys(tempos)) {
        const f = sim.sim.fahrzeuge[+i];
        if (f.ausgeschieden || !f.istSpieler) continue;
        const v = f.vehicle;
        if (pos[i] === undefined) pos[i] = st.spline.naechster(v.x, v.z).s;
        pos[i] += tempos[i] * DT;
        const p = sp.punktBei(pos[i]);
        v.x = p.x; v.z = p.z; v.y = st.hoeheAn(p.x, p.z); v.heading = sim.R.headingAus(p.tx, p.tz); v.vLaengs = tempos[i];
      }
    };
  }
  if (teil('D')) {
    for (const moto of [false, true]) {
      const C = moto ? RM : R, art = moto ? 'Motorrad' : 'Auto';
      const einst = einstellungenPruefen({ modus: 'ko', streckeId: 'wiese', gegner: 3, schwierigkeit: 'leicht' }, 2, moto);
      const sim = new Simulation({ moto, einstellungen: einst, spieler: [{ fahrer: 'Jonas', auto: moto ? 'superbike' : 'porsche-911' }, { fahrer: 'Mia', auto: moto ? 'superbike' : 'porsche-911' }], seed: 5 });
      const glide = gleiter(sim, { 0: 70, 1: 9 });          // Jonas fliegt davon, Mia kriecht
      const ev = fahren(sim, 400, { eingabe: () => ({ gas: 0, bremse: 0, lenkung: 0 }), beiSchritt: () => glide() });
      const raus = ev.filter((x) => x.art === 'raus'), fin = ev.filter((x) => x.art === 'finale'), ziel = ev.filter((x) => x.art === 'ziel'), wert = ev.filter((x) => x.art === 'wertung');
      const erg = sim.ergebnis();
      pruefe('D K.-o. ' + art + ' (2 Menschen + 3 KI): 3 Ausscheidungen in Reihenfolge n = 1, 2, 3, Finale danach, Sieger im Ziel (Ereignis ziel Platz 1), Zweiter wird gesetzt',
        raus.length === 3 && raus.map((x) => x.n).join() === '1,2,3' && fin.length === 1 && ziel.length === 1 && ziel[0].platz === 1 && ziel[0].nr === 0 && sim.sim.rennen.teilnehmer.filter((t) => t.imZiel).length === 2 && sim.sim.rennen.teilnehmer.find((t) => t.zielPlatz === 2) && sim.fertig, json([raus.map((x) => x.nr + ':' + x.n + ':' + x.w), fin.length, ziel.map((x) => x.nr + ':' + x.platz)]));
      pruefe('D K.-o. ' + art + ': Mia (langsam) fliegt zuerst/früh raus, Jonas gewinnt; Wertungs-Ereignisse nur an Menschen, Ausgeschiedene geparkt', raus[0].nr === 1 || raus.some((x) => x.nr === 1), json(raus.map((x) => x.nr)));
      pruefe('D K.-o. ' + art + ': Ergebnis: Jonas Platz 1; Ausgeschiedene mit raus:true und Wertung w (später raus = besser platziert); finale-Flag ko:true',
        erg.ko === true && erg.zeilen[0].nr === 0 && erg.zeilen[0].platz === 1 && erg.zeilen.filter((z) => z.raus).length === 3 && erg.zeilen.filter((z) => z.raus).every((z) => z.w >= 1) &&
        erg.zeilen.slice(2).every((z, i, a) => !i || a[i - 1].w >= z.w), json(erg.zeilen.map((z) => [z.platz, z.nr, z.w])));
      const mia = sim.sim.fahrzeuge[1], jon = sim.sim.fahrzeuge[0];
      pruefe('D K.-o. ' + art + ': ausgeschiedene Fahrzeuge geparkt (f.ausgeschieden, weit weg), Sieger nicht; wertung-Ereignisse nur an Menschen (an = 0/1)', mia.ausgeschieden === true && mia.vehicle.x >= 100000 && !jon.ausgeschieden && wert.every((x) => x.an === 0 || x.an === 1) && wert.length > 0);
    }
    // Mensch raus: Zuschauer-Zeit, dann Ergebnis; geht der Mensch vorher, fährt das Auto als KI weiter
    {
      const einst = einstellungenPruefen({ modus: 'ko', streckeId: 'wiese', gegner: 3, schwierigkeit: 'leicht' }, 1);
      const sim = new Simulation({ einstellungen: einst, spieler: [{ fahrer: 'Mia', auto: 'porsche-911' }], seed: 6 });
      const glide = gleiter(sim, { 0: 8 });
      const ev = fahren(sim, 300, { eingabe: () => ({ gas: 0, bremse: 0, lenkung: 0 }), beiSchritt: () => glide() });
      const raus = ev.filter((x) => x.art === 'raus');
      const nRaus = raus.find((x) => x.nr === 0), zRaus = nRaus ? nRaus.n : -1;
      pruefe('D K.-o.: einziger Mensch fliegt raus → nach 6 s Zuschauen endet das Rennen (Ergebnis), ohne dass ein Sieger feststeht', !!nRaus && sim.fertig && sim.sim.rennen.zustand === 'fertig' && sim.ergebnis().zeilen.find((z) => z.nr === 0).raus === true, 'raus als Nr. ' + zRaus);
      const sim2 = new Simulation({ einstellungen: einst, spieler: [{ fahrer: 'Mia', auto: 'porsche-911' }, { fahrer: 'Tom', auto: 'porsche-911' }], seed: 6 });
      sim2.zuKI(1);
      pruefe('D K.-o.: Spieler geht → sein Auto fährt als Computer weiter, Rennen läuft für den anderen weiter', sim2.fertig === false && sim2.sim.fahrzeuge[1].istSpieler === false && sim2.sim.fahrzeuge[1].driver);
    }
  }

  // ================================================================== E) Freie Fahrt
  if (teil('E')) {
    const SF = R.SpassFrei, C = R.config.spass.frei, FA = R.SpassR2.FreiAufgabe;
    const freiSim = (n, moto, sid, zeit) => new Simulation({ moto: !!moto, einstellungen: einstellungenPruefen({ modus: 'frei', streckeId: sid || 'wiese', freiZeit: zeit || 5 }, n, !!moto),
      spieler: Array.from({ length: n }, (_, i) => ({ fahrer: ['Jonas', 'Mia', 'Tom'][i], auto: moto ? 'superbike' : 'porsche-911', hilfe: 'aus' })), seed: 9 });
    const still = { eingabe: () => ({ gas: 0, bremse: 1, lenkung: 0 }) };
    const stepsOhne = (sim, n, ev) => { for (let k = 0; k < n; k++) { for (let i = 0; i < 3; i++) if (sim.sim.fahrzeuge[i] && sim.sim.fahrzeuge[i].istSpieler) sim.eingabeSetzen(i, { gas: 0, bremse: 1, lenkung: 0 }); sim.schritt(); for (const x of sim.abholen()) ev.push(x); } };
    const hin = (sim, i, p) => { const v = sim.sim.fahrzeuge[i].vehicle; v.x = p.x; v.z = p.z; v.y = p.y; v.vLaengs = 0; };
    const kiste = (sim, art) => sim.r2.teile[0].kisten.find((k) => k.e.art === art);
    // E1: einmalige Vergabe
    {
      const sim = freiSim(2), ev = [];
      pruefe('E Frei: 12 Kisten wie SpassFrei.plan, alle frei zu Beginn; startInfo meldet Anzahl und Limit', sim.r2.teile[0].kisten.length === 12 && sim.r2.teile[0].kisten.every((k) => k.st === 0) && sim.startInfo().r2.frei.kisten === 12 && sim.startInfo().r2.frei.limit === 300);
      stepsOhne(sim, 60 * 4, ev);
      const k = kiste(sim, 'muenzen');
      hin(sim, 0, k); hin(sim, 1, k); stepsOhne(sim, 3, ev);
      const auf = ev.filter((x) => x.art === 'frAufgabe'), km = ev.filter((x) => x.art === 'frKiste');
      pruefe('E Frei: zwei an derselben Kiste – nur der Erste bekommt die Aufgabe (privat: Ereignis an=0), Kiste „vergeben“ (frKiste st 1, von 0) für alle',
        auf.length === 1 && auf[0].an === 0 && auf[0].k === k.e.nr && auf[0].aufgabe === 'muenzen' && km.length === 1 && km[0].st === 1 && km[0].von === 0 && km[0].an === null && k.st === 1, json([auf, km]));
      // E2: Scheitern → wieder frei, dann bekommt Mia sie
      ev.length = 0;
      stepsOhne(sim, 60 * 26, ev);
      const ende = ev.filter((x) => x.art === 'frEnde'), km2 = ev.filter((x) => x.art === 'frKiste');
      pruefe('E Frei: Goldrausch nicht geschafft (25 s) → frEnde ok:false an den Besitzer, 0 Gold, Kiste wieder frei (frKiste st 0)', ende.length === 1 && ende[0].an === 0 && ende[0].ok === false && ende[0].gold === 0 && km2.length === 1 && km2[0].st === 0 && k.st === 0, json(ende));
      ev.length = 0;
      hin(sim, 1, k); stepsOhne(sim, 3, ev);
      pruefe('E Frei: nach dem Scheitern kann Mia die Kiste übernehmen (Aufgabe an=1)', ev.filter((x) => x.art === 'frAufgabe').length === 1 && ev.find((x) => x.art === 'frAufgabe').an === 1);
      // Spieler 0 darf sofort wieder? (Sperre 6 s nach Ende)
    }
    // E3: Aufgaben = Offline-Rechenteil: Goldrausch, Slalom, Sprungweite
    {
      const sim = freiSim(1), ev = [], c = sim.r2.teile[0];
      stepsOhne(sim, 60 * 4, ev);
      const k = kiste(sim, 'muenzen');
      hin(sim, 0, k); stepsOhne(sim, 3, ev);
      const a = sim.r2.teile[0] && null;
      const auf = ev.find((x) => x.art === 'frAufgabe'), st = sim.sim.strecke;
      const erwartet = R.SpassR2.weltPunkte(st, SF.muenzPlan(auf.s + 12, st.breite || 12));
      let n = 0;
      ev.length = 0;
      for (const p of erwartet) { hin(sim, 0, p); stepsOhne(sim, 1, ev); n++; if (ev.some((x) => x.art === 'frEnde')) break; }
      const ende = ev.find((x) => x.art === 'frEnde'), mu = ev.filter((x) => x.art === 'frMuenze');
      pruefe('E Frei Goldrausch: Münzen = SpassFrei.muenzPlan(s+12) (Offline-Rechenteil); mit ' + C.goldrausch.brauche + ' von ' + C.goldrausch.n + ' geschafft, Gold ' + C.goldrausch.gold + ', Kiste ✔ (st 2)',
        !!ende && ende.ok === true && ende.gold === C.goldrausch.gold && n === C.goldrausch.brauche && k.st === 2 && mu.length === C.goldrausch.brauche && mu[mu.length - 1].n === C.goldrausch.brauche, json(ende));
      ev.length = 0; hin(sim, 0, k); stepsOhne(sim, 60 * 8, ev);
      pruefe('E Frei: eine ✔-Kiste löst nie wieder aus', !ev.some((x) => x.art === 'frAufgabe' && x.k === k.e.nr));
      // Slalom
      const ks = kiste(sim, 'slalom');
      ev.length = 0; hin(sim, 0, ks); stepsOhne(sim, 3, ev);
      const as = ev.find((x) => x.art === 'frAufgabe');
      const tore = SF.slalomPlan(as.s + 22, as.seite), sp = st.spline;
      ev.length = 0;
      for (let j = 0; j < tore.length; j++) {
        const q = j === 2 ? tore[j].q + 9 : tore[j].q;                  // Tor 3 verpassen: 5 von 6 reichen
        const p = sp.punktBei(tore[j].s + 0.4), x = p.x + p.nx * q, z = p.z + p.nz * q;
        hin(sim, 0, { x, z, y: st.hoeheAn(x, z) }); stepsOhne(sim, 1, ev);
        if (ev.some((x2) => x2.art === 'frEnde')) break;
      }
      const toreEv = ev.filter((x) => x.art === 'frTor'), endeS = ev.find((x) => x.art === 'frEnde');
      pruefe('E Frei Slalom: Torprüfung = SpassFrei.slalomTor (ein Tor verpasst → frTor ok:false), 5 von 6 → geschafft mit ' + C.slalom.gold + ' Gold',
        !!endeS && endeS.ok === true && endeS.gold === C.slalom.gold && toreEv.some((x) => x.ok === false) && toreEv.filter((x) => x.ok).length === 5, json(toreEv.map((x) => x.ok ? 1 : 0)) + ' ' + json(endeS));
      // Sprungweite
      const kj = kiste(sim, 'sprung');
      if (kj) {
        stepsOhne(sim, 60 * 7, ev);                                          // Sperre nach der letzten Aufgabe (6 s)
        ev.length = 0; hin(sim, 0, kj); stepsOhne(sim, 3, ev);
        const f = sim.sim.fahrzeuge[0];
        f.flug.letzteWeite = C.sprung.weite - 5; sim.sim._flugEreignis(0, 'landung'); stepsOhne(sim, 1, ev);
        const kurz = ev.filter((x) => x.art === 'frWeite'), e1 = ev.find((x) => x.art === 'frEnde');
        f.flug.letzteWeite = C.sprung.weite + 2; sim.sim._flugEreignis(0, 'landung'); stepsOhne(sim, 1, ev);
        const e2 = ev.find((x) => x.art === 'frEnde');
        pruefe('E Frei Sprungweite: zu kurz → Hinweis (frWeite), Aufgabe läuft weiter; ≥ ' + C.sprung.weite + ' m → geschafft, Gold ' + C.sprung.gold, kurz.length === 1 && !e1 && !!e2 && e2.ok && e2.gold === C.sprung.gold, json(e2));
      } else pruefe('E Frei Sprungweite: (keine Sprung-Kiste auf der Wiese)', true, 'übersprungen');
    }
    // E4: Zeitlimit, alle 12, Ergebnis, Spieler geht
    {
      const sim = freiSim(2, false, 'wiese', 3), ev = [];
      stepsOhne(sim, 60 * 4, ev);
      const kisten = sim.r2.teile[0].kisten;
      const k0 = kisten[0]; hin(sim, 0, k0); stepsOhne(sim, 3, ev);
      const gesamt = (n) => { for (let k = 0; k < n * 60 && !sim.fertig; k++) { for (let i = 0; i < 2; i++) sim.eingabeSetzen(i, { gas: 0, bremse: 1, lenkung: 0 }); sim.schritt(); for (const x of sim.abholen()) ev.push(x); } };
      pruefe('E Frei: Spieler geht mitten in der Aufgabe → seine Kiste wird wieder frei (frKiste st 0)', (() => { ev.length = 0; sim.zuKI(0); for (const x of sim.abholen()) ev.push(x); return k0.st === 0 && ev.some((x) => x.art === 'frKiste' && x.st === 0 && x.k === k0.e.nr); })());
      gesamt(190);
      const erg = sim.ergebnis();
      pruefe('E Frei: Zeitlimit 3 min → Rennen endet (fertig), Ergebnis mit frei{geschafft,kisten,zeit} und je Zeile frei{geschafft,gefunden,gold}', sim.fertig && erg.frei.kisten === 12 && erg.frei.zeit >= 179 && erg.zeilen.every((z) => z.frei) && erg.zeilen.find((z) => z.nr === 0).frei.gefunden === 1, json(erg.frei));
      const sim2 = freiSim(1), ev2 = [];
      stepsOhne(sim2, 60 * 4, ev2);
      const ks = sim2.r2.teile[0].kisten; ks.forEach((k, i) => { if (i > 0) k.st = 2; });
      const kleft = ks[0]; hin(sim2, 0, kleft); stepsOhne(sim2, 3, ev2);
      pruefe('E Frei: Aufgabe läuft bei letzter offener Kiste, noch nicht fertig', !sim2.fertig);
      kleft.st = 2; stepsOhne(sim2, 3, ev2);
      pruefe('E Frei: alle 12 Kisten ✔ → Rennen endet sofort (Ergebnis geschafft 12/12)', sim2.fertig && sim2.ergebnis().frei.geschafft === 12);
    }
    // E5: Motorrad
    {
      const sim = freiSim(2, true, 'wiese'), ev = [];
      stepsOhne(sim, 60 * 4, ev);
      const k = kiste(sim, 'muenzen'); hin(sim, 1, k); stepsOhne(sim, 3, ev);
      pruefe('E Frei Motorrad: Kiste vergeben an Spieler 1, Aufgabe nur an ihn', ev.filter((x) => x.art === 'frAufgabe').length === 1 && ev.find((x) => x.art === 'frAufgabe').an === 1);
    }
  }

  // ================================================================== F) Dino-Aufgaben
  if (teil('F')) {
    const SW = R.SpassWelten;
    const dinoSim = (dino, strecke, n, seed, moto) => new Simulation({ moto: !!moto, einstellungen: einstellungenPruefen({ streckeId: strecke, dino, gegner: 1, runden: 2 }, n, !!moto),
      spieler: Array.from({ length: n }, (_, i) => ({ fahrer: ['Jonas', 'Mia'][i], auto: moto ? 'superbike' : 'porsche-911', hilfe: 'aus' })), seed });
    const dinoEv = (ev) => ev.filter((x) => /^dino/.test(x.art));
    {
      const a = dinoSim('dino', 'dino', 2, 21), b = dinoSim('dino', 'dino', 2, 21), c = dinoSim('dino', 'dino', 2, 22);
      const D = (s) => s.r2.teile[0].D;
      pruefe('F Dino: Seed je Mensch = hash32(Raum-Seed, Nr, 0xD10, 3) – gleich bei gleichem Raum-Seed, verschieden je Spieler und je Raum',
        D(a)[0].seed === R.Zufall.hash32(21, 0, 0xD10, 3) && D(a)[1].seed === R.Zufall.hash32(21, 1, 0xD10, 3) && D(a)[0].seed !== D(a)[1].seed && D(a)[0].seed === D(b)[0].seed && D(a)[0].seed !== D(c)[0].seed);
      const aus = dinoSim(undefined, 'dino', 2, 21), wiese = dinoSim('dino', 'wiese', 2, 21), immer = dinoSim('immer', 'wiese', 2, 21);
      pruefe('F Dino aus (Standard) → kein R2 im Raum; „Dino-Land“ nur auf der Dino-Strecke; „Überall“ auch auf der Wiese', aus.r2 === null && wiese.r2.teile.length === 0 && immer.r2.teile.length === 1 && a.r2.teile.length === 1);
    }
    // F2: Server = direktes dino.schritt mit den gleichen Eingaben (K protokolliert) + nur Besitzer
    {
      const sim = dinoSim('dino', 'dino', 2, 31);
      const log = [], orig = SW.dino.schritt;
      SW.dino.schritt = function (D, st, K, dt) { log.push({ i: sim.r2.teile[0].D.indexOf(D), K: Object.assign({}, K), dt }); return orig.apply(this, arguments); };
      let ev;
      try { ev = fahren(sim, 75); } finally { SW.dino.schritt = orig; }
      const de = dinoEv(ev);
      // Wiederholung: frischer Zustand, gleicher Seed, gleiche K-Folge
      const st = sim.sim.strecke, ref = [0, 1].map((i) => { const D = SW.dino.neu(st); D.seed = R.Zufall.hash32(31, i, 0xD10, 3); return D; });
      const soll = [];
      for (const l of log) {
        const D = ref[l.i]; orig(D, st, l.K, l.dt);
        while (D.ereig.length) {
          const x = D.ereig.shift();
          if (x.name === 'gold') soll.push('dinoGold:' + l.i + ':' + x.n + ':' + Math.round(x.muenzen[0].s * 1000) / 1000);
          else if (x.name === 'sammeln') soll.push('dinoSammeln:' + l.i + ':' + x.id);
          else if (x.name === 'wettrennen') soll.push('dinoWett:' + l.i + ':' + Math.round(x.weg));
          else if (x.name === 'sieg' || x.name === 'verloren' || x.name === 'abbruch') soll.push('dinoEnde:' + l.i + ':' + x.name);
        }
      }
      const ist = de.map((x) => x.art + ':' + x.an + ':' + (x.art === 'dinoGold' ? x.n + ':' + x.s0 : x.art === 'dinoSammeln' ? x.id : x.art === 'dinoWett' ? Math.round(x.weg) : x.ende));
      pruefe('F Dino: Server-Ereignisse = direktes SpassWelten.dino.schritt mit denselben Eingaben (Gold, Sammeln, Wettrennen, Ende)', de.length > 0 && json(ist) === json(soll), ist.length + ' Ereignisse; ' + (json(ist) === json(soll) ? '' : json(ist.slice(0, 4)) + ' / ' + json(soll.slice(0, 4))));
      const golds = de.filter((x) => x.art === 'dinoGold');
      pruefe('F Dino: jeder Mensch bekommt seine eigenen Ereignisse (an = 0/1), jede/r mindestens eine Goldwurf nach ~12 s', de.every((x) => x.an === 0 || x.an === 1) && [0, 1].every((i) => golds.some((x) => x.an === i)) && golds.find((x) => x.an === 0).s0 !== golds.find((x) => x.an === 1).s0, json(golds.map((x) => [x.an, x.n, x.s0])));
      pruefe('F Dino: Aufgaben-Ereignisse enthalten alles, was der Client zum Nachbauen braucht (dinoGold {n,s0,q}, dinoWett {weg,vD,s0,sMark})', golds.every((x) => Number.isFinite(x.n + x.s0 + x.q)) && dinoEv(ev).filter((x) => x.art === 'dinoWett').every((x) => Number.isFinite(x.weg + x.vD + x.s0 + x.sMark)));
    }
    // F3: Einsammeln
    {
      const sim = dinoSim('dino', 'dino', 1, 33), st = sim.sim.strecke, SWd = SW.dino;
      const ev = [];
      let golden = null;
      for (let n = 0; n < 60 * 40 && !golden; n++) { sim.eingabeSetzen(0, { gas: 1, bremse: 0, lenkung: 0 }); sim.schritt(); for (const e of sim.abholen()) { ev.push(e); if (e.art === 'dinoGold') golden = e; } }
      pruefe('F Dino: erster Goldwurf kommt nach der Anlaufzeit (≈ 12 s)', !!golden && golden.n === 0);
      if (golden) {
        const D = sim.r2.teile[0].D[0];
        const g = D.gold[0], w = SWd.goldPos(st, g);
        for (let k = 0; k < 90; k++) { sim.eingabeSetzen(0, { gas: 0, bremse: 1, lenkung: 0 }); sim.schritt(); sim.abholen(); }          // Flugzeit der Münze (0,85 s) abwarten
        const v = sim.sim.fahrzeuge[0].vehicle; v.x = w.x; v.z = w.z; v.y = w.y; v.vLaengs = 12;
        const sam = [];
        for (let k = 0; k < 4; k++) { sim.eingabeSetzen(0, { gas: 0, bremse: 0, lenkung: 0 }); sim.schritt(); for (const e of sim.abholen()) if (e.art === 'dinoSammeln') sam.push(e); }
        pruefe('F Dino: Münze einsammeln → dinoSammeln {id} an den Besitzer (Client schreibt +1 Gold gut)', sam.length >= 1 && sam[0].id === g.id && sam[0].an === 0, json(sam));
      }
    }
  }
  // ================================================================== G) echter Server, zwei WebSocket-Clients: Lobby, Start, Zeitlimit-Ergebnis; alter Client; H) kaputte Nachrichten
  {
    const srv = await starten({ port: 0, host: '127.0.0.1', leise: true, tempo: 6, ladenMaxMs: 8000 });
    class Client {
      constructor(port) {
        this.ws = new WebSocket('ws://127.0.0.1:' + port + '/ws'); this.alle = []; this.warter = []; this.ereignisse = [];
        this.offen = new Promise((f, n) => { this.ws.on('open', f); this.ws.on('error', n); });
        this.ws.on('message', (d) => {
          let m; try { m = JSON.parse(d); } catch (e) { return; }
          if (m.t !== 'zustand') { this.alle.push(m); if (m.t === 'ereignis') this.ereignisse.push(m); }
          this.warter = this.warter.filter((w) => { if (w.t === m.t && w.f(m)) { clearTimeout(w.zeit); w.ok(m); return false; } return true; });
        });
      }
      senden(o) { if (this.ws.readyState === 1) this.ws.send(typeof o === 'string' ? o : JSON.stringify(o)); }
      auf(t, f, ms) { return new Promise((fertig) => { const w = { t, f: f || (() => true), ok: fertig, zeit: setTimeout(() => { this.warter = this.warter.filter((x) => x !== w); fertig(null); }, ms || 4000) }; this.warter.push(w); }); }
      zu() { this.ws.terminate(); }
    }
    const h = new Client(srv.port); await h.offen;
    h.senden({ t: 'hallo', v: R.Netz.VERSION }); const hallo = await h.auf('hallo');
    pruefe('G hallo meldet r2: true', !!hallo && hallo.r2 === true);
    // alter Client: raumErstellen ohne R2-Felder → Einstellungen ohne R2-Schlüssel
    h.senden({ t: 'raumErstellen', fahrer: 'Jonas', auto: 'porsche-911', einstellungen: { streckeId: 'wiese', gegner: 2 } });
    const [raum, lob] = await Promise.all([h.auf('raum'), h.auf('lobby')]);
    const ke = lob && lob.einstellungen;
    pruefe('G alter Client: Raum ohne R2-Wahl hat keine R2-Schlüssel (modus/level/freiZeit/geist/dino/r2b)', !!ke && ['modus', 'level', 'freiZeit', 'geist', 'dino', 'r2b'].every((k) => ke[k] === undefined), json(Object.keys(ke || {})));
    // Host-Wahl Kurz-Level, r2b kann der Client nicht setzen
    h.senden({ t: 'einstellungen', einstellungen: { modus: 'kurz', level: 'a01', r2b: { m: 'kurz', x: 1 } } });
    const l2 = await h.auf('lobby', (m) => m.einstellungen && m.einstellungen.modus === 'kurz');
    pruefe('G Lobby-Wahl Kurz-Level: Strecke/Gegner vom Server überschrieben, r2b kommt nur vom Server (nicht der Client-Wert)', !!l2 && l2.einstellungen.gegner === 0 && l2.einstellungen.level === 'a01' && !(l2.einstellungen.r2b && l2.einstellungen.r2b.x === 1), json(l2 && l2.einstellungen.r2b));
    const g = new Client(srv.port); await g.offen;
    g.senden({ t: 'hallo', v: R.Netz.VERSION }); await g.auf('hallo');
    g.senden({ t: 'raumBeitreten', code: raum.code, fahrer: 'Emmy', auto: 'multivan' }); await g.auf('lobby', (m) => m.spieler.length === 2);
    g.senden({ t: 'bereit', an: true }); await h.auf('lobby', (m) => m.spieler[1] && m.spieler[1].bereit);
    h.senden({ t: 'start' });
    const [s1, s2] = await Promise.all([h.auf('start', null, 8000), g.auf('start', null, 8000)]);
    pruefe('G Start: beide bekommen start.r2.kurz (Level, Zeiten) und die Einstellungen mit modus', !!s1 && !!s2 && s1.r2 && s1.r2.kurz && s1.r2.kurz.level === 'a01' && s2.r2 && s2.r2.kurz.limit > 0 && s1.einstellungen.modus === 'kurz', json(s1 && s1.r2));
    h.senden({ t: 'geladen' }); g.senden({ t: 'geladen' });
    // keiner fährt → Zeit um (Limit 120 s, Zeitraffer ×6 = ~20 s)
    const [e1, e2] = await Promise.all([h.auf('ergebnis', null, 240000), g.auf('ergebnis', null, 240000)]);
    pruefe('G Kurz ohne Fahren: Ergebnis kommt bei BEIDEN (Zeit um, 0 Sterne), identisch', !!e1 && !!e2 && json(e1) === json(e2) && e1.zeilen.every((z) => z.kurz && z.kurz.status === 'zeitUm' && z.kurz.sterne === 0), json(e1 && e1.zeilen.map((z) => z.kurz)));
    const kev = h.ereignisse.filter((x) => x.art === 'kurz');
    pruefe('G Ereignis kurz {nr,status,sterne,zeit} für jeden Menschen genau einmal', kev.length === 2 && kev.every((x) => x.status === 'zeitUm'), json(kev.map((x) => [x.nr, x.status])));
    // H) kaputte Nachrichten
    h.senden({ t: 'einstellungen', einstellungen: { modus: 'quatsch', level: 5, freiZeit: 99, geist: 'ja', dino: {} } });
    h.senden('{kaputt'); h.senden({ t: 'einstellungen', einstellungen: null }); h.senden({ t: 'einstellungen' });
    await warte(300);
    pruefe('H kaputte R2-Werte/Nachrichten: Server lebt noch und antwortet auf hallo', await (async () => { h.senden({ t: 'ping', z: 1 }); const p = await h.auf('pong', null, 2000); return !!p; })());
    h.zu(); g.zu();
    // H2) Standard-Raum + Einstellungen mit Unsinn → Standardwerte, keine R2-Schlüssel
    const a = new Client(srv.port); await a.offen; a.senden({ t: 'hallo', v: R.Netz.VERSION }); await a.auf('hallo');
    a.senden({ t: 'raumErstellen', fahrer: 'Jonas', auto: 'porsche-911', einstellungen: { streckeId: 'wiese', modus: 'quatsch', level: 5, freiZeit: 99, geist: 'ja', dino: {} } });
    const lq = await a.auf('lobby');
    pruefe('H Unsinn in R2-Feldern → Standard (keine R2-Schlüssel im Raum)', !!lq && ['modus', 'level', 'freiZeit', 'geist', 'dino'].every((k) => lq.einstellungen[k] === undefined), json(lq && Object.keys(lq.einstellungen)));
    a.zu();
    await srv.schliessen();
  }
  if (typeof globalThis.__r2Weiter === 'function') await globalThis.__r2Weiter();
  console.log('\n' + ok + ' OK, ' + fehler + ' FEHL');
  process.exitCode = fehler ? 1 : 0;
})().catch((e) => { console.error('FEHL Ausnahme:', e && e.stack); process.exit(2); });
