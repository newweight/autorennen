// Z1 – Zufällige Strecke (Münzen + Hindernisse jede Runde / jedes Spiel neu): node tests/test_zufall.js
//  A) Seeds: verschiedene Seeds → verschiedene Lagen, gleicher Seed → gleiche Lage (bitgleich, auch nach denselben Ereignissen), Runde 2 ≠ Runde 1 ≠ Runde 3
//  B) Sperrregeln (neu gelegte Objekte): nie auf Start/Ziel, nie in Looping/Schanzen-Flugbahn/Überführung/Gabelung … (feste Zonen), nie überlappend, Menge bleibt gleich
//  C) Fahrzeuge: nichts im Fenster eines Fahrzeugs wird verschoben (Hindernisse und Münzen), neue Lagen liegen nie im Fenster; Nachzügler nach dem Wegfahren
//  D) Kollisionsstrukturen: strecke.hindernisse (und eingebaute Wracks) zeigen nach dem Ereignis die neue Lage; Aus = Katalog-Lage, bitgleich
//  E) Taktgeber (R.Zufall.takt): ein Ereignis je Rundenwechsel des Führenden, kein Ereignis nach dem Ziel (maxRunde)
//  F) Online: Server (Simulation, Autorennen UND Motorrad) und Client (eigener Kontext) haben nach jedem Rundenwechsel dieselbe Lage (aus {runde, n, v});
//     alter Client (ohne `zufall`) bekommt die feste Strecke, kein Ereignis; Einstellungen additiv geprüft
'use strict';
const { ladeModule } = require('./lade');
const { Simulation, kontextLaden, laden, MODULE, einstellungenPruefen } = require('../server/simulation');

let fehler = 0, ok = 0;
setTimeout(() => { console.log('FEHL Wächter: Test hängt (> 300 s) – Abbruch'); process.exit(3); }, 300000).unref();
function pruefe(name, gut, info) { console.log((gut ? 'OK   ' : 'FEHL ') + name + (info !== undefined ? '  (' + info + ')' : '')); if (gut) ok++; else fehler++; }

// ---------------------------------------------------------------- Engine-Kontext (wie die Browser-Dateien, ohne Three.js)
const RC = ladeModule(['src/config.js', 'src/physics/vehicle.js', 'src/track/spline.js', 'src/track/trackCatalog.js', 'src/track/trackBuilder.js', 'src/track/zufall.js',
  'src/physics/collisions.js', 'src/cars/carCatalog.js', 'src/world/muenzen.js']);
const Z = RC.Zufall, CZ = RC.config.zufall;
const KOMBIS = [['wiese', 'hindernisse', ''], ['wald', 'hindernisse', ''], ['dino', 'hindernisse', ''], ['wueste', 'alles', ''], ['alpen', 'verrueckt', ''], ['fantasie', 'verrueckt', ''], ['dino', 'alles', 'xl']];
const katalog = (id) => RC.trackCatalog.find(t => t.id === id);
function bau(id, welt, variante, seed) {
  const opt = { welt, variante };
  if (seed !== null) opt.zufall = { seed };
  const st = new RC.Strecke(katalog(id), opt);
  const mz = st.zufall && new RC.Muenzen(st);
  return { st, mz };
}
const fing = (a) => {
  const zs = a.st.zufall;
  return zs.objekte.map(o => o.liste + o.i + '@' + o.s + '/' + o.seite).join(',') + '|' + a.st.hindernisse.map(h => (h.typ || '') + ':' + Math.round(h.s * 100) / 100).join(',') + '|' + (a.mz ? a.mz.liste.map(m => m.s + '/' + m.q).join(',') : '');
};
// Fahrzeug-Bogenlängen je Ereignis: deterministisch aus einem Hash (zwei bis vier Fahrzeuge)
function fahrzeuge(L, nr, anz) { const v = []; for (let k = 0; k < anz; k++) v.push(Z.hash32(nr, k, 77) % Math.round(L)); return v; }
function fensterVon(v, L, sp) {
  const rueck = CZ.rueck, vor = CZ.vor;
  return v.map((s) => ({ c: s + (vor - rueck) / 2, h: (vor + rueck) / 2 }));
}
const imFenster = (sp, fenster, c, h) => fenster.some((f) => Math.abs(sp.differenzS(c, f.c)) < h + f.h);

// ---------------------------------------------------------------- A) Seeds
{
  let verschieden = 0, gleich = 0, runden = 0, n = 0, aus = 0;
  for (const [id, welt, va] of KOMBIS) {
    const a1 = bau(id, welt, va, 1001), a2 = bau(id, welt, va, 1002), a3 = bau(id, welt, va, 1003), b1 = bau(id, welt, va, 1001);
    if (!a1.st.zufall.objekte.length) continue;
    n++;
    if (fing(a1) !== fing(a2) && fing(a2) !== fing(a3) && fing(a1) !== fing(a3)) verschieden++;
    if (fing(a1) === fing(b1)) gleich++;
    // dieselben Ereignisse → wieder gleich; Runde 2 ≠ Runde 1 ≠ Runde 3
    const L = a1.st.laenge, v2 = fahrzeuge(L, 2, 3), v3 = fahrzeuge(L, 3, 3);
    const f1 = fing(a1);
    Z.ereignis(a1.st, { runde: 2, n: 0, v: v2 }); Z.ereignis(b1.st, { runde: 2, n: 0, v: v2 });
    const f2 = fing(a1);
    Z.ereignis(a1.st, { runde: 3, n: 0, v: v3 }); Z.ereignis(b1.st, { runde: 3, n: 0, v: v3 });
    const f3 = fing(a1);
    if (f2 !== f1 && f3 !== f2 && f3 !== f1) runden++;
    if (fing(a1) !== fing(b1)) gleich--;
    if (!new RC.Strecke(katalog(id), { welt, variante: va }).zufall) aus++;
  }
  pruefe('A verschiedene Seeds → verschiedene Lagen (Hindernisse + Münzen), alle ' + n + ' Strecken/Welten', verschieden === n, verschieden + '/' + n);
  pruefe('A gleicher Seed → bitgleiche Lage (Runde 1 und nach denselben Ereignissen)', gleich === n, gleich + '/' + n);
  pruefe('A Runde 2 ≠ Runde 1 ≠ Runde 3', runden === n, runden + '/' + n);
  pruefe('A ohne `zufall` (Aus): strecke.zufall === null, nichts läuft', aus === KOMBIS.length, aus + '/' + KOMBIS.length);
}

// ---------------------------------------------------------------- B) Sperrregeln + C) Fenster
{
  let regelFehler = [], ueberlapp = 0, mengeFehl = 0, fensterVerletzt = 0, fensterBewegt = 0, geprueft = 0, mzFenster = 0, mzBewegt = 0, ereignisse = 0, fehlVorkommen = 0;
  for (const [id, welt, va] of KOMBIS) {
    for (let seed = 1; seed <= 4; seed++) {
      const a = bau(id, welt, va, 500 + seed), st = a.st, zs = st.zufall, sp = st.spline, L = sp.laenge;
      if (!zs.objekte.length) continue;
      const HM = zs.HM, ZR = zs.ZR;
      const anzObj = zs.objekte.length, anzHind = st.hindernisse.length, anzMz = a.mz ? a.mz.liste.length : 0;
      for (let r = 2; r <= 5; r++) {
        const v = fahrzeuge(L, r * 10 + seed, 1 + (r % 4));
        const fenster = fensterVon(v, L, sp);
        const vorher = zs.objekte.map(o => o.s), mzVorher = a.mz ? a.mz.liste.map(m => m.s) : [];
        const erg = Z.ereignis(st, { runde: r, n: 0, v });
        ereignisse++; if (zs.fehl) fehlVorkommen++;
        const bew = new Set(erg.bewegt);
        const ext = (o) => ({ c: o.s + (o.ext[1] - o.ext[0]) / 2, h: (o.ext[0] + o.ext[1]) / 2 });
        for (const o of zs.objekte) {
          const e = ext(o);
          if (!bew.has(o.id)) {
            // Fenster: wer vorher im Fenster lag, wurde nicht verschoben
            if (o.s !== vorher[o.id]) fensterBewegt++;
            continue;
          }
          geprueft++;
          // nie im Fenster eines Fahrzeugs
          if (imFenster(sp, fenster, e.c, e.h)) fensterVerletzt++;
          // Start/Ziel
          if (o.s - o.ext[0] < HM.startFrei - 1e-6 || o.s + o.ext[1] > L - HM.zielFrei + 1e-6) regelFehler.push(id + ' Start/Ziel ' + o.art + '@' + o.s);
          // feste Zonen (Tunnel, Brücke, Überführung, Kreuzung, Looping, Gabelung, Spuren, Schanzen, Boost, Schilde, Wasser, Meteoriten, Boxen …); Kleber: Seitenregel
          for (const z of zs.fest) {
            if (z.kleberSeite !== undefined) continue;
            if (Math.abs(sp.differenzS(e.c, z.c)) < e.h + z.h - 1e-6) { regelFehler.push(id + ' feste Zone ' + o.art + '@' + o.s); break; }
          }
          // Looping samt Anlauf, Schanze samt Anlauf/Flug/Landung (unabhängig von zs.fest geprüft)
          for (const l of st.loopings || []) {
            const c = (l.s0 + l.s1 + ZR.loopingNach - ZR.loopingVor) / 2, h = (sp.wrapS(l.s1 - l.s0) + ZR.loopingVor + ZR.loopingNach) / 2;
            if (Math.abs(sp.differenzS(e.c, c)) < e.h + h - 1e-6) regelFehler.push(id + ' Looping ' + o.art + '@' + o.s);
          }
          for (const sc of st.schanzen || []) {
            const c = sc.s + ((sc.laenge || 10) + ZR.schanzeNach - (sc.anlauf || 0) - ZR.schanzeVor) / 2, h = ((sc.laenge || 10) + (sc.anlauf || 0) + ZR.schanzeVor + ZR.schanzeNach) / 2;
            if (Math.abs(sp.differenzS(e.c, c)) < e.h + h - 1e-6) regelFehler.push(id + ' Schanze ' + o.art + '@' + o.s);
          }
          // Überlappung mit anderen Objekten
          for (const p of zs.objekte) {
            if (p === o || (bew.has(p.id) && p.id < o.id)) continue;
            const f = ext(p);
            if (Math.abs(sp.differenzS(e.c, f.c)) < e.h + f.h - 1e-6) { ueberlapp++; break; }
          }
        }
        // Menge bleibt gleich
        if (zs.objekte.length !== anzObj || st.hindernisse.length !== anzHind || (a.mz && a.mz.liste.length !== anzMz)) mengeFehl++;
        // Münzen: wer im Fenster lag, blieb liegen; was sich bewegt hat, liegt nicht im Fenster
        if (a.mz) a.mz.liste.forEach((m, i) => {
          if (m.s !== mzVorher[i]) { mzBewegt++; if (imFenster(sp, fenster, m.s, 2.5)) mzFenster++; }
          else if (!m.da) { /* eingesammelt und geblieben */ }
        });
      }
    }
  }
  pruefe('B Sperrregeln eingehalten (Start/Ziel, feste Zonen, Looping, Schanzen-Flugbahn) bei ' + geprueft + ' neu gelegten Objekten', regelFehler.length === 0, regelFehler.slice(0, 3).join('; ') || ereignisse + ' Ereignisse');
  pruefe('B neu gelegte Objekte überlappen weder einander noch die bleibenden', ueberlapp === 0, String(ueberlapp));
  pruefe('B Menge je Strecke bleibt gleich (Objekte, Hindernisse, Münzen)', mengeFehl === 0, String(mengeFehl));
  pruefe('B alle Objekte finden Platz (dichte Strecken eingeschlossen) – zs.fehl = 0 in allen Ereignissen', fehlVorkommen === 0, fehlVorkommen + ' von ' + ereignisse);
  pruefe('C keine neue Lage liegt im Fenster eines Fahrzeugs (60 m hinter … 300 m vor), Hindernisse', fensterVerletzt === 0, String(fensterVerletzt));
  pruefe('C Objekte, die nicht neu gelegt wurden (Fahrzeug nahe), bleiben unverändert', fensterBewegt === 0, String(fensterBewegt));
  pruefe('C Münzen: verschoben nur außerhalb der Fahrzeug-Fenster', mzFenster === 0 && mzBewegt > 0, mzBewegt + ' bewegt, ' + mzFenster + ' im Fenster');
}

// ---------------------------------------------------------------- C) Nachzügler: ein Objekt mit Fahrzeug daneben bleibt, wandert nach dem Wegfahren
{
  const a = bau('dino', 'hindernisse', '', 4242), st = a.st, zs = st.zufall, sp = st.spline, L = sp.laenge;
  const ziel = zs.objekte.find(o => o.liste === 'hindernisse') || zs.objekte[0];
  const sAlt = ziel.s;
  const v = [Math.round(sAlt - 20)];      // Fahrzeug 20 m vor dem Objekt: es liegt im Fenster (vor … 300 m)
  const erg0 = Z.ereignis(st, { runde: 2, n: 0, v });
  const blieb = ziel.s === sAlt && ziel.ausstehend === true && !erg0.bewegt.includes(ziel.id);
  const wart = Z.wartend(st), kandMit = Z.kandidaten(st, v), kandOhne = Z.kandidaten(st, [Math.round((sAlt + L / 2) % L)]);
  const erg1 = Z.ereignis(st, { runde: 2, n: 1, v: [Math.round((sAlt + L / 2) % L)] });
  const ext = (o) => ({ c: o.s + (o.ext[1] - o.ext[0]) / 2, h: (o.ext[0] + o.ext[1]) / 2 });
  pruefe('C Objekt mit Fahrzeug in der Nähe bleibt stehen (ausstehend), wird bei Rundenwechsel nicht verschoben', blieb, 'bleibt @' + sAlt + ', wartend ' + wart);
  pruefe('C Nachzügler: mit Fahrzeug daneben kein Kandidat, nach dem Wegfahren schon', kandMit === 0 && kandOhne >= 1, kandMit + '/' + kandOhne);
  pruefe('C Nachzügler-Ereignis (n = 1) bewegt das wartende Objekt an eine neue Stelle ohne Fahrzeug im Fenster',
    erg1.bewegt.includes(ziel.id) && ziel.s !== sAlt && !ziel.ausstehend && !imFenster(sp, fensterVon([Math.round((sAlt + L / 2) % L)], L, sp), ext(ziel).c, ext(ziel).h), 'neu @' + ziel.s);
}

// ---------------------------------------------------------------- D) Kollisionsstrukturen
{
  let hindFehler = 0, wrFehler = 0, wrGeprueft = 0, hGeprueft = 0;
  for (const [id, welt, va] of [['wiese', 'hindernisse', ''], ['dino', 'hindernisse', ''], ['wald', 'alles', ''], ['alpen', 'verrueckt', '']]) {
    const a = bau(id, welt, va, 77), st = a.st, zs = st.zufall, sp = st.spline, L = sp.laenge;
    RC.Kollisionen.wracksEinbauen(st);      // wie hindernisseBauen/Server: Wracks als feste Hindernisse anhängen
    for (let r = 2; r <= 4; r++) {
      Z.ereignis(st, { runde: r, n: 0, v: fahrzeuge(L, r + 90, 2) });
      for (const o of zs.objekte) {
        if (o.liste === 'hindernisse') {
          const h = st.hindernisse[o.i];
          hGeprueft++;
          if (!h || Math.abs(sp.differenzS(h.s, st._hindernisseBerechnen([o.e])[0].s)) > 1e-6 || h.nr !== o.i) hindFehler++;      // frisch aus dem Eintrag gerechnet (Baustelle: s = Mitte)
        } else if (o.liste === 'wracks') {
          const h = st.hindernisse.find(x => x && x.quelle === o.i);
          wrGeprueft++;
          if (!h || Math.abs(sp.differenzS(h.s, st.wracks[o.i].s)) > 1e-6 || Math.abs(sp.differenzS(st.wracks[o.i].s, o.s)) > 1e-6) wrFehler++;
        }
      }
    }
  }
  pruefe('D strecke.hindernisse zeigt nach jedem Ereignis die neue Lage (nur geänderte Einträge ersetzt, nr = Index)', hindFehler === 0 && hGeprueft > 0, hGeprueft + ' geprüft, ' + hindFehler + ' falsch');
  pruefe('D eingebaute Wracks (Kollision/KI) liegen an der neuen Lage', wrFehler === 0, wrGeprueft + ' geprüft, ' + wrFehler + ' falsch');
  const ohne = new RC.Strecke(katalog('dino'), { welt: 'hindernisse' }), ohne2 = new RC.Strecke(katalog('dino'), { welt: 'hindernisse' });
  const aus1 = ohne.hindernisse.map(h => h.typ + ':' + h.s).join(','), aus2 = ohne2.hindernisse.map(h => h.typ + ':' + h.s).join(',');
  const mit = new RC.Strecke(katalog('dino'), { welt: 'hindernisse', zufall: { seed: 5 } });
  pruefe('D Aus: Katalog-Lage, bitgleich bei jedem Bau; Zufall ändert den Katalog nicht (Kopien)', aus1 === aus2 && aus1 !== mit.hindernisse.map(h => h.typ + ':' + h.s).join(',') &&
    new RC.Strecke(katalog('dino'), { welt: 'hindernisse' }).hindernisse.map(h => h.typ + ':' + h.s).join(',') === aus1);
}

// ---------------------------------------------------------------- E) Taktgeber
{
  const a = bau('wiese', 'hindernisse', '', 9), st = a.st, L = st.laenge;
  const T = (fort, dt) => Z.takt(st, fort, dt === undefined ? 1 / 60 : dt, 3);
  const e0 = T([-50, -80]);                                         // vor dem Start: nichts
  const e1 = T([L * 0.5 + 10, L * 0.2]);                            // Führender noch in Runde 1
  const e2 = T([L + 5, L * 0.9]);                                   // Führender beginnt Runde 2
  if (e2) Z.ereignis(st, e2);
  const e3 = T([L + 9, L * 0.95]);                                  // gleiche Runde: kein zweites Ereignis (n = 0)
  const e4 = T([3 * L + 100, 3 * L]);                               // Führender im Ziel (Fortschritt ≥ Runden × Länge): auf die letzte Runde begrenzt
  pruefe('E Takt: vor dem Start und in Runde 1 kein Ereignis', e0 === null && e1 === null);
  pruefe('E Takt: Rundenwechsel des Führenden → genau ein Ereignis { runde 2, n 0, v ganzzahlig }', e2 && e2.runde === 2 && e2.n === 0 && e2.v.length === 2 && e2.v.every(Number.isInteger) && (e3 === null || e3.n >= 1), JSON.stringify(e2));
  pruefe('E Takt: im Ziel höchstens Runde = Rundenzahl (maxRunde)', e4 === null || e4.runde <= 3, JSON.stringify(e4));
}

// ---------------------------------------------------------------- F) Online: Server ↔ Client
const SPIELER = (R) => [{ fahrer: R.config.fahrerStandard[0], auto: 'troc-cabrio', hilfe: 'wenig' }];
function lageVon(st) {
  const zs = st.zufall;
  return zs.objekte.map(o => o.liste + o.i + '@' + o.s + '/' + o.seite).join(',') + '|' + st.hindernisse.filter(h => !h.dynamisch).map(h => (h.typ || '') + ':' + Math.round(h.s * 1000) / 1000).join(',');      // Krater der Dynamik (dynamisch) gehören nicht zur Zufalls-Lage
}
/** Strecke wie der Browser (main.js streckeSzeneBauen, Physik-Teile; dieselben Schritte wie im Server: Schilder, Tribünen, Pflanzen, Wracks, Laternen). */
function clientStrecke(C, e, seed, wetterSeed) {
  const daten = C.trackCatalog.find(t => t.id === e.streckeId);
  const st = new C.Strecke(daten, { welt: C.Strecke.weltName(daten, e.welt), variante: e.variante, hindernisMenge: e.hindernisMenge, zufall: { seed } });
  const w = new C.Wetter(null, { jahreszeit: e.jahreszeit, wetter: e.wetter, wind: { staerke: e.windStaerke, richtung: e.windRichtung }, thema: daten.thema, seed: wetterSeed, strecke: st, tageszeit: e.tageszeit });
  st.tempoKlasse = e.tempoKlasse;
  if (C.Kurvenschilder) C.Kurvenschilder.einbauen(st, e.tempoKlasse);
  if (C.Tribuenen) C.Tribuenen.einbauen(st);
  C.Kollisionen.pflanzenSammeln(st, C.themes.dekoBauen(daten.thema, st, w.jahreszeit));
  C.Kollisionen.wracksEinbauen(st);
  const th = C.themes[daten.thema];
  if (w.tz && w.tz.laternen && th.laternen && C.themes.laternenBauen) st.saeulen = (st.saeulen || []).concat(C.themes.laternenBauen(st, th, w.tz.laterne).masten);
  return st;
}
function onlineTest(titel, moto) {
  const R0 = moto ? require('../server/simulation').ladenMoto() : laden();
  const einst = { streckeId: 'dino', welt: 'hindernisse', zufall: true, gegner: 3, runden: 3, schwierigkeit: 'leicht', polizei: false };
  if (moto) einst.unfall = 'aus';
  const sim = new Simulation({ einstellungen: einst, spieler: [{ fahrer: R0.config.fahrerStandard[0], auto: moto ? 'superbike' : 'troc-cabrio', hilfe: 'wenig' }], seed: 31337, moto });
  const info = sim.startInfo();
  const C = moto ? kontextLaden(require('../server/simulation').MODULE.slice(0, MODULE.indexOf('src/track/megastrecke.js') + 1)
    .concat(['src/world/garage.js', 'src/moto/motoKatalog.js', 'src/moto/motoTypen.js', 'src/moto/schraeglage.js', 'src/moto/stunts.js', 'src/moto/stuntWelt.js', 'src/moto/unfall.js', 'src/main.js']), { MOTORRAD: true })
    : kontextLaden(MODULE);
  pruefe(titel + ': startInfo meldet zufallSeed (additiv), Einstellung zufall = true', Number.isInteger(info.zufallSeed) && info.einstellungen.zufall === true, String(info.zufallSeed));
  const cst = clientStrecke(C, info.einstellungen, info.zufallSeed, info.wetterSeed), sst = sim.sim.strecke;
  // „Browser-Spiel“: Motorrad-Stationen (Werkstatt + Krankenstation) wie motoOnline.aufbau – nach dem Strecken-Bau, gleiche Plätze wie beim Server
  const clientSpiel = {};
  if (moto) { const b = C.Moto.unfall.stationenBilden(cst); if (b && b.werkstatt && b.kranken) clientSpiel.motoStationen = { werkstatt: b.werkstatt, kranken: b.kranken }; }
  pruefe(titel + ': Runde 1 – Client und Server haben dieselbe Lage', lageVon(cst) === lageVon(sst) && cst.zufall.objekte.length > 0, cst.zufall.objekte.length + ' Objekte');
  const events = []; let gleich = 0, verschieden = 0, lage1 = lageVon(sst);
  for (let t = 0; t < 40000 && events.filter(e => e.n === 0).length < 2; t++) {
    sim.schritt();
    for (const ev of sim.abholen()) {
      if (ev.art !== 'zufall') continue;
      events.push(ev);
      C.Zufall.externAus(cst, clientSpiel);      // wie R.ZufallSpiel.anwenden (Browser): Stationen als Sperrzonen melden, dann das Ereignis
      C.Zufall.ereignis(cst, { runde: ev.runde, n: ev.n, v: ev.v });
      if (lageVon(cst) === lageVon(sst)) gleich++; else verschieden++;
    }
  }
  const n0 = events.filter(e => e.n === 0);
  if (moto) pruefe(titel + ': Werkstatt + Krankenstation beim Client wie beim Server (Sperrzonen der Neuverteilung)', !!clientSpiel.motoStationen && sim.sim.motoStationen && Math.abs(clientSpiel.motoStationen.werkstatt.platz.s - sim.sim.motoStationen.werkstatt.platz.s) < 1e-6);
  pruefe(titel + ': Server schickt `zufall`-Ereignisse beim Rundenwechsel des Führenden (Runde 2, Runde 3)', n0.length >= 2 && n0[0].runde === 2 && n0[1].runde === 3 && events.every(e => e.v.every(Number.isInteger)), events.map(e => e.runde + '.' + e.n).join(' '));
  pruefe(titel + ': nach JEDEM Ereignis stimmen Client und Server überein (Objekte, Hindernisse – bitgleich)', verschieden === 0 && gleich === events.length && gleich >= 2, gleich + ' gleich, ' + verschieden + ' verschieden');
  pruefe(titel + ': Lage in Runde 2 ≠ Runde 1 (Server)', lageVon(sst) !== lage1);
  // alter Client: Einstellungen ohne `zufall` → feste Strecke, kein Ereignis, kein Seed
  const alt = new Simulation({ einstellungen: { streckeId: 'dino', welt: 'hindernisse', gegner: 3, runden: 3, schwierigkeit: 'leicht' }, spieler: [{ fahrer: R0.config.fahrerStandard[0], auto: moto ? 'superbike' : 'troc-cabrio', hilfe: 'wenig' }], seed: 31337, moto });
  let altEv = 0;
  for (let t = 0; t < 3000; t++) { alt.schritt(); altEv += alt.abholen().filter(e => e.art === 'zufall').length; }
  pruefe(titel + ': alter Client (ohne `zufall`): kein Seed, keine Zufalls-Strecke, kein Ereignis', alt.startInfo().zufallSeed === undefined && !alt.sim.strecke.zufall && altEv === 0 && alt.startInfo().einstellungen.zufall === false);
}
onlineTest('F Autorennen online', false);
onlineTest('F Motorrad online', true);
{
  const e0 = einstellungenPruefen({}, 1), e1 = einstellungenPruefen({ zufall: true }, 1), e2 = einstellungenPruefen({ zufall: 'ja' }, 1), e3 = einstellungenPruefen({ zufall: 1 }, 1);
  pruefe('F Einstellungen additiv: nur ein echtes true schaltet ein (alter Client sendet nichts → aus)', e0.zufall === false && e1.zufall === true && e2.zufall === false && e3.zufall === false);
  const sa = new Simulation({ einstellungen: { streckeId: 'wiese', welt: 'hindernisse', zufall: true, gegner: 1, runden: 2 }, spieler: SPIELER(laden()), seed: 1 });
  const sb = new Simulation({ einstellungen: { streckeId: 'wiese', welt: 'hindernisse', zufall: true, gegner: 1, runden: 2 }, spieler: SPIELER(laden()), seed: 2 });
  const sc = new Simulation({ einstellungen: { streckeId: 'wiese', welt: 'hindernisse', zufall: true, gegner: 1, runden: 2 }, spieler: SPIELER(laden()), seed: 1 });
  pruefe('F Rennseed kommt aus dem Raum-Seed: gleicher Raum-Seed → gleiche Lage, anderer → andere Lage',
    sa.startInfo().zufallSeed !== sb.startInfo().zufallSeed && lageVon(sa.sim.strecke) !== lageVon(sb.sim.strecke) && lageVon(sa.sim.strecke) === lageVon(sc.sim.strecke));
}

console.log('\n' + (fehler ? 'FEHL: ' + fehler : 'Alles OK') + ' (' + ok + ' OK)');
process.exit(fehler ? 1 : 0);
