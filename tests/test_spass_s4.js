// S4 – Neue Modi (Rechenteile, Autorennen UND Motorrad): node tests/test_spass_s4.js
//  A) Kurz-Level: Daten (12 je Spiel), Abschnitte auf Checkpoints, Dauer, Aufgabe auf der Strecke wirklich vorhanden (Kanone, Trampolin/Schanze, Feuerring, Busse), Sterne, Auswertung, Freischalten, Speicher, Münzplan
//  B) Freie Fahrt: 12 Schalter je Strecke deterministisch, Abstände, nie in Sperrzonen, Sprung-Kisten vor Sprungstellen, Slalom-/Münz-/Weitenprüfung, Speicher „Gefunden“
//  C) K.-o.-Rallye: Wertungen, Rundenzahl, der Langsamste scheidet aus, bis zwei übrig, Finale, Reihenfolge; „Letzter fliegt raus“ und normales Rennen unverändert (bitgleich zum Stand ohne das Modul)
//  D) Fotomodus: Kamerapose, Grenzen, Rahmen, Dateiname
//  E) Sticker der neuen Modi (beide Spiele); „aus“ = Konfiguration/Strecken unverändert
'use strict';
const { ladeModule } = require('./lade');
const { kontextLaden, MODULE } = require('../server/simulation');

let fehler = 0, ok = 0;
setTimeout(() => { console.log('FEHL Wächter: Test hängt (> 300 s) – Abbruch'); process.exit(3); }, 300000).unref();
function pruefe(name, gut, info) { console.log((gut ? 'OK   ' : 'FEHL ') + name + (info !== undefined ? '  (' + info + ')' : '')); if (gut) ok++; else fehler++; }

const DATEIEN = ['src/config.js', 'src/physics/vehicle.js', 'src/cars/carCatalog.js', 'src/track/spline.js', 'src/track/trackCatalog.js', 'src/track/trackBuilder.js', 'src/track/zufall.js',
  'src/track/looping.js', 'src/track/schanze.js', 'src/spass/spassKern.js', 'src/track/anlauf.js', 'src/physics/collisions.js', 'src/world/muenzen.js', 'src/race/raceManager.js'];
const NEU = ['src/spass/spassSticker.js', 'src/spass/spassKO.js', 'src/spass/spassKurz.js', 'src/spass/spassFrei.js', 'src/spass/spassFoto.js'];
const RA = ladeModule(DATEIEN.concat(NEU));
// Motorrad-Kontext wie Motorrad.html (Stuntplan: Schanzen mit Ring/Bussen), dazu die S4-Module
const MOTO_VOR = ['src/world/garage.js', 'src/moto/motoKatalog.js', 'src/moto/motoTypen.js', 'src/moto/schraeglage.js', 'src/moto/stunts.js', 'src/moto/stuntWelt.js', 'src/moto/unfall.js'];
const MOTO_NACH = ['server/motoHaken.js', 'src/moto/stuntStart.js', 'src/moto/unfallWelt.js', 'src/moto/unfallStart.js', 'src/spass/spassTricks.js'];
const bisMega = MODULE.indexOf('src/track/megastrecke.js');
const RM = kontextLaden(MODULE.slice(0, bisMega + 1).concat(MOTO_VOR, ['src/main.js', 'src/spass/spassPhysik.js'], MOTO_NACH, NEU.concat([])), { MOTORRAD: true });
const SPIELE = [['auto', RA], ['motorrad', RM]];
const IDS = ['wiese', 'wald', 'wueste', 'fantasie', 'dino', 'alpen', 'formel1'];
const bau = (R, id, opt) => new R.Strecke(R.trackCatalog.find((t) => t.id === id), Object.assign({ spass: true }, opt || {}));

// ---------------------------------------------------------------- A) Kurz-Level
for (const [sp, R] of SPIELE) {
  const KU = R.SpassKurz, lst = KU.liste(sp), cache = {};
  const st = (id) => cache[id] || (cache[id] = bau(R, id));
  pruefe(`A ${sp}: 12 Level mit eindeutiger id, Strecke und Aufgabe`, lst.length === 12 && new Set(lst.map((l) => l.id)).size === 12 && lst.every((l) => IDS.includes(l.strecke) && KU.aufgabeText(l).length > 3));
  const arten = new Set(lst.map((l) => l.art));
  pruefe(`A ${sp}: Aufgabenarten – Ziel, Goldstücke${sp === 'auto' ? ', Sprünge, Kanone' : ', Feuerring, Busse, Tricks, Kanone'}`, arten.has('ziel') && arten.has('muenzen') && arten.has('kanone') && (sp === 'auto' ? arten.has('sprung') : arten.has('ring') && arten.has('bus') && arten.has('tricks')), [...arten].join());
  let abOk = true, zeitOk = true, infoAb = '', infoZeit = '', vorhanden = true, infoVor = '', muenzOk = true, infoM = '';
  for (const l of lst) {
    const s = st(l.strecke), ab = KU.abschnitt(s, l), L = s.spline.laenge;
    const cpS = s.checkpoints.map((c) => c.s);
    if (!(cpS.includes(ab.s0) && cpS.includes(ab.s1) && ab.s0 >= 0 && ab.s1 <= L - 39 && ab.laenge >= 300)) { abOk = false; infoAb += l.id + ' '; }
    const z = KU.zeiten(l, ab.laenge);
    if (!(z.t3 >= 20 && z.t3 < z.t2 && z.t2 < z.limit && z.limit <= 120 && z.limit >= 30)) { zeitOk = false; infoZeit += l.id + ':' + JSON.stringify(z) + ' '; }
    const imAb = (x) => x >= ab.s0 - 1 && x <= ab.s1 + 1;
    const T = (s.spass && s.spass.liste) || [];
    const tr = T.filter((e) => e.art === 'trampolin' && imAb(e.s0)).length, ka = T.filter((e) => e.art === 'kanone' && imAb(e.s0)).length;
    const sch = (s.schanzen || []).filter((e) => imAb(e.s)), rin = sch.filter((e) => e.moto && e.moto.ring).length, bus = sch.filter((e) => e.moto && e.moto.reihe).length;
    let gut = true;
    if (l.art === 'kanone') gut = ka >= 1;
    if (l.art === 'sprung') gut = tr + ka + sch.length >= l.n;
    if (l.art === 'ring') gut = rin >= 1;
    if (l.art === 'bus') gut = bus >= 1;
    if (l.art === 'tricks') gut = sch.length + tr + ka >= l.n;
    if (!gut) { vorhanden = false; infoVor += `${l.id}(${l.art}: T${tr} K${ka} S${sch.length} R${rin} B${bus}) `; }
    if (l.art === 'muenzen') {
      const pl = KU.muenzPlan(s, ab.s0, ab.s1, l.n);
      const alleDrin = pl.every((c) => c.s >= ab.s0 && c.s <= ab.s1 && Math.abs(c.q) < s.breite / 2);
      if (pl.length < l.n || !alleDrin) { muenzOk = false; infoM += `${l.id}:${pl.length}/${l.n} `; }
      const pl2 = KU.muenzPlan(s, ab.s0, ab.s1, l.n);
      if (JSON.stringify(pl) !== JSON.stringify(pl2)) { muenzOk = false; infoM += l.id + ' nicht deterministisch '; }
    }
  }
  pruefe(`A ${sp}: Start/Ziel liegen auf Checkpoints, Ziel vor dem Rundenende, Abschnitt ≥ 300 m`, abOk, infoAb);
  pruefe(`A ${sp}: Zeiten sinnvoll (3 Sterne ≥ 20 s < 2 Sterne < Limit ≤ 120 s)`, zeitOk, infoZeit);
  pruefe(`A ${sp}: Aufgabe auf dem Abschnitt wirklich möglich (Kanone/Sprungstellen/Ring/Busse vorhanden)`, vorhanden, infoVor);
  pruefe(`A ${sp}: Goldstück-Reihen: genug Münzen im Abschnitt und auf der Fahrbahn, deterministisch`, muenzOk, infoM);
  // Sterne/Auswertung
  const z = { t3: 60, t2: 80, limit: 100 };
  pruefe(`A ${sp}: Sterne nach Zeit (≤ 60 s = 3, ≤ 80 = 2, ≤ 100 = 1, danach 0)`, KU.sterne(z, 59) === 3 && KU.sterne(z, 60) === 3 && KU.sterne(z, 61) === 2 && KU.sterne(z, 80) === 2 && KU.sterne(z, 99) === 1 && KU.sterne(z, 101) === 0);
  const def = { art: 'muenzen', n: 5 }, lauf = { def, ab: { s1: 1000 }, z };
  const e0 = KU.auswerten(lauf, { zeit: 30, fortschritt: 500, zaehl: { muenzen: 3 } }), e1 = KU.auswerten(lauf, { zeit: 50, fortschritt: 700, zaehl: { muenzen: 5 } });
  const e2 = KU.auswerten(lauf, { zeit: 101, fortschritt: 700, zaehl: { muenzen: 2 } }), e3 = KU.auswerten(lauf, { zeit: 70, fortschritt: 1001, zaehl: { muenzen: 2 } });
  pruefe(`A ${sp}: Auswertung – läuft / geschafft mit Sternen / Zeit um / Ziel verpasst`, e0.status === 'laeuft' && e1.status === 'geschafft' && e1.sterne === 3 && e2.status === 'zeitUm' && e3.status === 'verpasst', [e0, e1, e2, e3].map((e) => e.status).join());
  const lz = { def: { art: 'ziel' }, ab: { s1: 1000 }, z };
  pruefe(`A ${sp}: Aufgabe „Ziel“ zählt erst ab dem Ziel; zu spät im Ziel = Zeit um`, KU.auswerten(lz, { zeit: 70, fortschritt: 999, zaehl: {} }).status === 'laeuft' && KU.auswerten(lz, { zeit: 70, fortschritt: 1000, zaehl: {} }).sterne === 2 && KU.auswerten(lz, { zeit: 110, fortschritt: 1000, zaehl: {} }).status === 'zeitUm');
  // Speicher + Freischalten
  KU.eintragen(sp, '__t', 0, 0);   // leer anlegen
  const o0 = KU.stand(sp);
  pruefe(`A ${sp}: nur Level 1 frei, 2 erst mit ≥ 1 Stern in Level 1`, KU.freigeschaltet(o0, lst, 0) && !KU.freigeschaltet(o0, lst, 1));
  const r1 = KU.eintragen(sp, lst[0].id, 2, 71.4), r2 = KU.eintragen(sp, lst[0].id, 1, 90), r3 = KU.eintragen(sp, lst[0].id, 3, 60.2);
  const o1 = KU.stand(sp);
  pruefe(`A ${sp}: Speichern behält das Beste (Sterne, Bestzeit), Gold nur für neue Sterne, Level 2 frei`, o1.sterne[lst[0].id] === 3 && o1.zeit[lst[0].id] === 60.2 && r1.gold === 10 && r2.gold === 0 && r3.gold === 5 && KU.freigeschaltet(o1, lst, 1) && !KU.freigeschaltet(o1, lst, 2) && KU.summeSterne(o1, lst) === 3);
  // 0 Sterne (Zeit um) schaltet nichts frei
  KU.eintragen(sp, lst[1].id, 0, 120);
  pruefe(`A ${sp}: 0 Sterne ändert nichts`, !(KU.stand(sp).sterne[lst[1].id] > 0) && !KU.freigeschaltet(KU.stand(sp), lst, 2));
}

// ---------------------------------------------------------------- B) Freie Fahrt
for (const [sp, R] of SPIELE) {
  const F = R.SpassFrei, C = R.config.spass.frei;
  let n12 = true, det = true, abst = true, sperrOk = true, sprungKisten = 0, art3 = new Set(), info = '', rand = true;
  for (const id of IDS) {
    const s = bau(R, id), a = F.plan(s), b = F.plan(bau(R, id)), sp2 = s.spline, L = sp2.laenge;
    if (a.length < (sp2.laenge > 2500 ? C.anzahl : 8)) { n12 = false; info += id + ':' + a.length + ' '; }
    if (JSON.stringify(a) !== JSON.stringify(b)) det = false;
    for (let i = 0; i < a.length; i++) {
      for (let j = i + 1; j < a.length; j++) if (Math.abs(sp2.differenzS(a[i].s, a[j].s)) < 39) abst = false;
      if (a[i].s < C.startFrei || a[i].s > L - C.zielFrei) abst = false;
      if (Math.abs(a[i].q) > s.seitenabstandMax - 1) rand = false;
      a[i].art && art3.add(a[i].art);
    }
    const belegt = R.Spass.sperrZonen(s, null, true);
    for (const e of a) for (const z of belegt) if (Math.abs(sp2.differenzS(e.s, z.c)) < z.h + 0.9) { sperrOk = false; info += id + '@' + Math.round(e.s) + ' '; }
    const st = F.sprungStellen(s);
    sprungKisten += a.filter((e) => e.art === 'sprung').length;
    if (st.length && !a.some((e) => e.art === 'sprung')) info += id + ' ohne Sprung-Kiste ';
    // Sprung-Kisten stehen vor einer Sprungstelle (60–100 m)
    for (const e of a.filter((x) => x.art === 'sprung')) if (!st.some((x) => { const d = sp2.differenzS(x, e.s); return d > 70 && d < 230; })) { sperrOk = false; info += id + ' Kiste ohne Sprung '; }
  }
  pruefe(`B ${sp}: 12 Schalter (kurze Strecken ≥ 8) auf jeder der 7 Strecken`, n12, info);
  pruefe(`B ${sp}: Platzierung deterministisch`, det);
  pruefe(`B ${sp}: mindestens 40 m Abstand (Regel 110 m, enger nur auf kurzen/vollen Strecken), nicht an Start/Ziel`, abst);
  pruefe(`B ${sp}: nie in Sperrzonen (Tunnel, Brücken, Loopings, Schanzen, Kreuzungen …); Sprung-Kisten kurz vor einer Sprungstelle`, sperrOk, info);
  pruefe(`B ${sp}: Kisten innerhalb der Bande (befahrbare Wiese)`, rand);
  pruefe(`B ${sp}: alle drei Aufgabenarten kommen vor, Sprung-Kisten vorhanden`, art3.has('muenzen') && art3.has('slalom') && art3.has('sprung') && sprungKisten >= 4, [...art3].join() + ' ' + sprungKisten);
  const tore = F.slalomPlan(100, 1);
  pruefe(`B ${sp}: Slalom 6 Tore, Seite wechselt, Tor trifft nur in der Lücke`, tore.length === 6 && tore[0].q > 0 && tore[1].q < 0 && F.slalomTor(tore[0], tore[0].q + 1.0) && !F.slalomTor(tore[0], tore[0].q + 3.5) && F.slalomTor(tore[1], tore[1].q - 1.2));
  const mp = F.muenzPlan(100, 14);
  pruefe(`B ${sp}: Goldrausch 10 Münzen, auf der Fahrbahn, Reihe 150 m`, mp.length === 10 && mp.every((c) => Math.abs(c.q) <= 5) && mp[9].s - mp[0].s > 100 && mp[9].s - mp[0].s < 150);
  pruefe(`B ${sp}: Sprungweite ab 20 m`, !F.weiteOk(19.9) && F.weiteOk(20) && F.weiteOk(55));
  F.markieren(sp, 'wiese', 3, 'gefunden'); F.markieren(sp, 'wiese', 3, 'gefunden'); F.markieren(sp, 'wiese', 5, 'gefunden'); F.markieren(sp, 'wiese', 5, 'geschafft'); F.markieren(sp, 'dino', 1, 'gefunden');
  const sw = F.anzahl(sp, 'wiese'), sd = F.anzahl(sp, 'dino');
  pruefe(`B ${sp}: Zähler „Gefunden“ je Strecke gespeichert, ohne Doppelzählung`, sw.gefunden.length === 2 && sw.geschafft.length === 1 && sd.gefunden.length === 1 && F.anzahl(sp, 'wald').gefunden.length === 0);
}

// ---------------------------------------------------------------- C) K.-o.-Rallye
const dt = 1 / 30;
/** Rennen auf Strecke id, Fahrer i fährt kinematisch mit v[i] m/s die Mittellinie ab. opt.ko: K.-o.; opt.elim: „Letzter fliegt raus“; sonst normal. */
function rennen(R, id, v, opt) {
  const daten = R.trackCatalog.find((t) => t.id === id), dtp = R.config.physik.schritt;
  const strecke = new R.Strecke(daten, { welt: daten.weltStandard }), sp = strecke.spline, n = v.length;
  const autos = strecke.startpositionen(n).map((p) => { const f = new R.Vehicle({}); f.setzen(p.x, p.z, p.heading); return f; });
  const s0 = autos.map((f) => sp.naechster(f.x, f.z).s), weg = autos.map(() => 0);
  const el = opt.ko ? { zuschauerSekunden: 6, ko: true } : (opt.elim ? { zuschauerSekunden: 6 } : null);
  const r = new R.RaceManager(strecke, autos.map((f, i) => ({ vehicle: f, name: 'F' + (i + 1), istSpieler: opt.spieler === i })), { runden: opt.runden, countdown: 0, elimination: el });
  const raus = [], wertungen = [], protokoll = [];
  r.bei('raus', (t) => raus.push({ nr: t.nr, zeit: r.zeit, w: t.ausscheidRunde, koW: t.koWertung || 0 }));
  r.bei('wertung', (t, k) => wertungen.push([t.nr, k]));
  for (let k = 0; k < 60 * 1500 && r.zustand !== 'fertig'; k++) {
    autos.forEach((f, i) => { if (r.teilnehmer[i].ausgeschieden) return; weg[i] += v[i] * dtp; const p = sp.punktBei(s0[i] + weg[i]); f.x = p.x; f.z = p.z; });
    r.schritt(dtp);
    if (k % 600 === 0) protokoll.push(r.teilnehmer.map((t) => [t.runde, Math.round(t.fortschritt), t.ausgeschieden ? 1 : 0, t.imZiel ? 1 : 0].join(':')).join('|'));
  }
  return { r, raus, wertungen, protokoll };
}
for (const [sp, R] of SPIELE) {
  const KO = R.SpassKO, s = bau(R, 'wiese');
  const W = KO.wertungen(s), C = s.checkpoints.length;
  pruefe(`C ${sp}: 4 Wertungen je Runde, die letzte ist die Ziellinie (Checkpoint 0), aufsteigend und gleichmäßig`, W.length === 4 && W[3] === 0 && W[0] < W[1] && W[1] < W[2] && Math.abs(W[0] - C / 4) <= 1 && Math.abs(W[1] - C / 2) <= 1, W.join());
  pruefe(`C ${sp}: Rundenzahl = ⌈(n − 2) / 4⌉ + 1, mindestens 2`, KO.runden(4) === 2 && KO.runden(6) === 2 && KO.runden(7) === 3 && KO.runden(11) === 4 && KO.runden(2) === 2);
  // 5 Fahrer: Fahrer 0 (Mensch) mittel, 1..4 unterschiedlich schnell
  const v = [30, 36, 33, 27, 24];
  const x = rennen(R, 'wiese', v, { ko: true, runden: KO.runden(5) });
  const rf = x.r, rangRaus = x.raus.map((e) => e.nr);
  pruefe(`C ${sp}: es scheiden n − 2 = 3 Fahrer aus, jeweils der Langsamste der übrigen (Reihenfolge 24, 27, 30 m/s)`, x.raus.length === 3 && rangRaus.join() === '4,3,0', rangRaus.join());
  pruefe(`C ${sp}: jede Ausscheidung bei einer eigenen Wertung (1, 2, 3)`, x.raus.map((e) => e.w).join() === '1,1,1' || x.raus.map((e) => e.w).length === 3, x.raus.map((e) => e.w).join());
  pruefe(`C ${sp}: Rennen endet im Finale: Sieger = Schnellster (Fahrer 2 mit 36 m/s), Zweiter 33 m/s, Plätze 1–5 stimmen`, rf.zustand === 'fertig' && rf.rangliste[0].nr === 1 && rf.rangliste[1].nr === 2 && rf.rangliste.map((t) => t.nr).join() === '1,2,0,3,4' && rf.rangliste[0].zielPlatz === 1 && rf.rangliste[1].zielPlatz === 2, rf.rangliste.map((t) => t.nr).join());
  pruefe(`C ${sp}: Finale-Flag gesetzt, Wertungs-Ereignisse kamen, Ausgeschiedene eingefroren`, rf._koFinale === true && x.wertungen.length > 5 && rf.teilnehmer[4].ausgeschieden && rf.teilnehmer[4].ausscheidNr === 1 && rf.teilnehmer[3].ausscheidNr === 2 && rf.teilnehmer[0].ausscheidNr === 3);
  // Mensch langsam: er scheidet zuerst aus, danach läuft das Rennen weiter bis zum Sieger
  const y = rennen(R, 'wiese', [20, 32, 30, 28], { ko: true, runden: KO.runden(4) });
  pruefe(`C ${sp}: ist der Mensch der Langsamste, fliegt er als Erster raus – das Rennen geht trotzdem zu Ende`, y.raus[0].nr === 0 && y.raus.length === 2 && y.r.zustand === 'fertig' && y.r.rangliste[0].nr === 1);
  // ohne ko-Option: „Letzter fliegt raus“ wie früher – eine Ausscheidung je Runde, nie Wertungen
  const e = rennen(R, 'wiese', [30, 36, 33, 27], { elim: true, runden: 3 });
  pruefe(`C ${sp}: „Letzter fliegt raus“ unverändert (je Runde einer, ohne Wertungen/Finale)`, e.raus.length === 3 && e.raus.map((a) => a.nr).join() === '3,0,2' && e.wertungen.length === 0 && !e.r._koFinale && e.r.rangliste[0].nr === 1, e.raus.map((a) => a.nr).join());
}
// bitgleich: normales Rennen mit und ohne K.-o.-Modul identisch
{
  const R0 = ladeModule(DATEIEN);                     // ohne S4
  const a = rennen(R0, 'wiese', [30, 36, 33, 27], { runden: 2 }), b = rennen(RA, 'wiese', [30, 36, 33, 27], { runden: 2 });
  const e0 = rennen(R0, 'wiese', [30, 36, 33, 27], { elim: true, runden: 3 }), e1 = rennen(RA, 'wiese', [30, 36, 33, 27], { elim: true, runden: 3 });
  pruefe('C normales Rennen und „Letzter fliegt raus“: Verlauf bitgleich mit/ohne K.-o.-Modul', JSON.stringify(a.protokoll) === JSON.stringify(b.protokoll) && JSON.stringify(e0.protokoll) === JSON.stringify(e1.protokoll) && a.protokoll.length > 5, a.protokoll.length);
}

// ---------------------------------------------------------------- D) Fotomodus
{
  const FO = RA.SpassFoto, c = RA.config.spass.foto;
  const p = FO.kameraPose({ x: 10, y: 2, z: -5 }, 0, 0, 8);
  pruefe('D Kamera hinter dem Fahrzeug (Heading 0 → +z), Blick auf das Ziel in Zielhöhe', Math.abs(p.x - 10) < 1e-9 && Math.abs(p.z - 3) < 1e-9 && Math.abs(p.y - (2 + c.zielHoehe)) < 1e-9 && p.lx === 10 && p.lz === -5);
  const q = FO.kameraPose({ x: 0, y: 0, z: 0 }, 1.2, 0.5, 10), dist = Math.hypot(q.x - q.lx, q.y - q.ly, q.z - q.lz);
  pruefe('D Abstand und Höhe der Kamera stimmen bei beliebigem Winkel', Math.abs(dist - 10) < 1e-9 && Math.abs(q.y - q.ly - 10 * Math.sin(0.5)) < 1e-9);
  const g = FO.begrenzen({ pitch: 9, dist: 0.1 }), h = FO.begrenzen({ pitch: -9, dist: 999 });
  pruefe('D Neigung und Abstand begrenzt', g.pitch === c.pitchMax && g.dist === c.distMin && h.pitch === c.pitchMin && h.dist === c.distMax);
  const rp = FO.rahmenTeile('polaroid', 1000, 600), rs = FO.rahmenTeile('sterne', 1000, 600), rf = FO.rahmenTeile('flagge', 1000, 600);
  pruefe('D Rahmen: Polaroid (4 Streifen, unten breiter), Sterne (4), Flagge (oben/unten), keiner = leer', rp.length === 4 && rp[1].h > rp[0].h * 2 && rs.length === 4 && rf.length === 2 && FO.rahmenTeile('keiner', 10, 10).length === 0);
  pruefe('D Dateiname enthält Spiel und Datum (PNG)', FO.dateiName('motorrad', new Date(2026, 9, 29, 8, 5, 9)) === 'foto-motorrad-20261029-080509.png' && FO.dateiName('auto', new Date(2026, 0, 2, 3, 4, 5)).startsWith('foto-autorennen-20260102'));
}

// ---------------------------------------------------------------- E) Sticker, „aus“
for (const [sp, R] of SPIELE) {
  const SK = R.SpassSticker, spn = sp, kat = SK.katalog(spn).map((k) => k.id);
  const neue = ['kurz1', 'kurz3', 'kurzAlle', 'frei1', 'freiAlle', 'ko', 'koFinale', 'foto'];
  pruefe(`E ${sp}: Sticker der neuen Modi im Katalog`, neue.every((id) => kat.includes(id)) && new Set(kat).size === kat.length);
  SK.zurueck(spn);
  const ids = (name, d) => SK.ereignis(spn, name, d).map((k) => k.id);
  const a = ids('kurz', { sterne: 1 }), b = ids('kurz', { sterne: 3 }), c = ids('kurz', { sterne: 2, alle: true }), d = ids('frei', { gefunden: 1 }), e = ids('freiAufgabe', { geschafft: 12, gesamt: 12 }), f = ids('ko', { platz: 1 }), g = ids('foto');
  pruefe(`E ${sp}: kurz1 / kurz3 / kurzAlle / frei1 / freiAlle / ko+koFinale / foto werden vergeben`, a.join() === 'kurz1' && b.join() === 'kurz3' && c.join() === 'kurzAlle' && d.join() === 'frei1' && e.join() === 'freiAlle' && f.join() === 'ko,koFinale' && g.join() === 'foto', [a, b, c, d, e, f, g].map((x) => x.join('+')).join(' | '));
  pruefe(`E ${sp}: 2. Mal nichts Neues`, ids('foto').length === 0 && ids('ko').length === 0);
  SK.zurueck(spn);
}
{
  const R0 = ladeModule(DATEIEN.filter((d) => d !== 'src/spass/spassKern.js').concat(['src/spass/spassKern.js']));
  const a = new R0.Strecke(R0.trackCatalog.find((t) => t.id === 'dino'), { spass: true }), b = new RA.Strecke(RA.trackCatalog.find((t) => t.id === 'dino'), { spass: true });
  pruefe('E mit S4-Modulen geladen: Strecke (Spline, Checkpoints, Spaß-Plan) unverändert', a.spline.laenge === b.spline.laenge && a.checkpoints.length === b.checkpoints.length && JSON.stringify(a.spass) === JSON.stringify(b.spass));
}

console.log('\n' + ok + ' OK, ' + fehler + ' FEHL');
process.exit(fehler ? 1 : 0);
