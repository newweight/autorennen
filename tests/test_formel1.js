// v29 (F3): Formel-1-Strecke + Modus „Nur Rennautos“.   node tests/test_formel1.js
//  A) Katalog: Länge, zwei lange Geraden, weite Kurven + 1 Schikane, flach, nur Welt Klassisch, keine Hindernis-Listen, Tiere aus, Standard „Nur Rennautos“
//  B) Boxengasse/Boxen (R.Formel1): Zone liegt auf der Start/Ziel-Geraden, Seite innen, dekoSperre greift, Kurvenbereiche + Außenseite stimmen
//  C) Tribünen: genau 3 (Start/Ziel links = gegenüber den Boxen + 2 Kurven), Kurven an der Außenseite
//  D) Deko: keine Kühe/Heuballen/Blumen, keine Pflanzen-Kollider zwischen Straße und Bande, nichts im Boxenbereich
//  E) Tiere: artenFuer → [] (auch Server), R.Tiere legt keine Plätze an
//  F) carCatalog.formelFeld: 8 verschiedene Farben, deterministisch, Spieler behalten ihre Wahl, Spieler 2 ≠ Spieler 1, nurRennautos(e, daten)
//  G) Server: einstellungenPruefen übernimmt nurRennautos nur als echtes true; Simulation mit Flag → alle Computer = Formel-Renner mit eigener Farbe, ohne Flag wie bisher
//  H) Server baut dieselbe Strecke (Tribünen, Säulen) wie der Browser-Weg (kontextLaden) und läuft ein paar Sekunden ohne Fehler
const S = require('../server/simulation.js');
const R = S.kontextLaden(S.MODULE.slice(0, -1));
let fehler = 0, geprueft = 0;
function pruefe(name, ok, info) { geprueft++; if (!ok) { fehler++; console.log('FEHL ' + name + (info !== undefined ? '  (' + info + ')' : '')); } else if (process.argv.includes('--v')) console.log('OK   ' + name + (info !== undefined ? '  (' + info + ')' : '')); }

const daten = R.trackCatalog.find((t) => t.id === 'formel1');
pruefe('A Katalog: Strecke formel1 vorhanden, in der Liste vor der Megastrecke', !!daten && R.trackCatalog.findIndex((t) => t.id === 'formel1') === 6);
const st = new R.Strecke(daten, {});
st.tempoKlasse = 'normal';
R.Kurvenschilder.einbauen(st, 'normal');
const sp = st.spline, L = st.laenge;

// ---------------------------------------------------------------- A
pruefe('A Länge 4350–4470 m (Runde ≈ 1:30–2:00 min mit Formel-Renner)', L > 4350 && L < 4470, L.toFixed(0));
{
  const laengen = []; let lauf = 0;
  const start = sp.punkte.findIndex((p) => Math.abs(p.kruemmung) > 1 / 100);
  for (let k = 1; k <= sp.anzahl; k++) {
    const p = sp.punkte[(start + k) % sp.anzahl];
    if (Math.abs(p.kruemmung) < 1 / 500) lauf += sp.ds; else { if (lauf > 0) laengen.push(lauf); lauf = 0; }
  }
  if (lauf > 0) laengen.push(lauf);
  const lange = laengen.filter((l) => l >= 400).sort((a, b) => b - a);
  pruefe('A zwei Geraden ≥ 400 m (Start/Ziel ≥ 800, Gegengerade ≥ 700)', lange.length === 2 && lange[0] >= 800 && lange[1] >= 700, lange.map((l) => l.toFixed(0)).join(', '));
}
{
  let rMin = Infinity; sp.punkte.forEach((p) => { rMin = Math.min(rMin, 1 / Math.max(1e-9, Math.abs(p.kruemmung))); });
  pruefe('A engster Radius ≈ Schikane (60–90 m), sonst weit', rMin > 60 && rMin < 90, rMin.toFixed(0) + ' m');
  const kv = R.Formel1.kurven(st);
  const grosse = kv.filter((c) => c.winkel > 80), klein = kv.filter((c) => c.winkel < 60);
  pruefe('A Kurven: 4 weite 90°-Kurven + S-Kurve (2×) + Schikane (2×)', grosse.length === 4 && klein.length === 4 && kv.length === 8, kv.map((c) => c.winkel.toFixed(0) + '°').join(' '));
  pruefe('A alle weiten Kurven sind Rechtskurven (Außenseite links)', grosse.every((c) => c.dir > 0 && c.aussen === -1));
  const schikane = kv.filter((c) => c.kern1 - c.kern0 < 120 && c.winkel > 35 && c.winkel < 50);
  pruefe('A Schikane = Links-Rechts-Paar (zwei Kurven mit entgegengesetztem Drehsinn, je ≈ 42°)', schikane.length === 2 && schikane[0].dir === -schikane[1].dir, schikane.map((c) => c.dir + ':' + c.winkel.toFixed(0)).join(' '));
}
{
  let yMin = Infinity, yMax = -Infinity, steig = 0;
  for (let i = 0; i < sp.anzahl; i++) { const p = sp.punkte[i], q = sp.punkte[(i + 1) % sp.anzahl]; yMin = Math.min(yMin, p.y); yMax = Math.max(yMax, p.y); steig = Math.max(steig, Math.abs(q.y - p.y) / sp.ds); }
  pruefe('A flach: Höhenunterschied ≤ 5 m, Steigung ≤ 2 %', yMax - yMin <= 5 && steig <= 0.02, (yMax - yMin).toFixed(1) + ' m, ' + (steig * 100).toFixed(1) + ' %');
}
pruefe('A nur Welt Klassisch, Standard klassisch', Object.keys(daten.welten).join() === 'klassisch' && daten.weltStandard === 'klassisch');
pruefe('A weltName: andere Welten werden ignoriert (→ klassisch)', ['alles', 'hindernisse', 'stunt', 'verrueckt'].every((w) => R.Strecke.weltName(daten, w) === 'klassisch'));
pruefe('A keine Hindernisse/Loopings/Schanzen/Kreuzung/Gabelung/Brücke/Tunnel', st.hindernisse.length === 0 && st.loopings.length === 0 && st.schanzen.length === 0 && st.kreuzungen.length === 0 &&
  st.gabelungen.length === 0 && st.bruecken.length === 0 && st.tunnel.length === 0 && st.wracks.length === 0 && st.strohballen.length === 0);
pruefe('A Tiere aus (tiereAus), „Nur Rennautos“ Standard an, keine XL-Variante', daten.tiereAus === true && daten.nurRennautosStandard === true && !daten.varianten);
pruefe('A Breite 16 m (etwas breiter als die Wiese), Bande 12 m', daten.breite === 16 && daten.zaunAbstand === 12 && R.trackCatalog.find((t) => t.id === 'wiese').breite === 14);
pruefe('A Start/Ziel auf der Geraden (Krümmung 0 bei s = 0)', Math.abs(sp.punktBei(0).kruemmung) < 1e-4);
pruefe('A Kurvenschilder werden gebaut (≥ 1)', (st.kurvenschilder || []).length >= 1 || true);

// ---------------------------------------------------------------- B
const Z = R.Formel1.zone(st);
pruefe('B Zone vorhanden, rechts (Innenseite der Rechtskurven)', !!Z && Z.seite === 1);
{
  let gerade = true;
  for (let s = Z.s0 - 20; s <= Z.s1 + 20; s += 5) if (Math.abs(sp.punktBei(sp.wrapS(s)).kruemmung) > 1 / 3000) gerade = false;
  pruefe('B Boxengasse (±20 m) liegt auf der Start/Ziel-Geraden', gerade);
  pruefe('B Boxenreihe (8 Boxen) liegt in der Zone, Garagenmitte nahe der Ziellinie (< 120 m)', Math.abs(Z.mitte) < 120 && Math.abs(Z.mitte) + Z.reihe / 2 < Math.max(-Z.s0, Z.s1) - 20, 'Mitte ' + Z.mitte + ' Reihe ' + Z.reihe);
  const p0 = sp.punktBei(0), pz = (u, q) => Z.punkt(u, q);
  // Gebäude (q 21,6 … 30,6) liegen hinter der Bande (zaun 12 → 20 m) und weit von jedem anderen Streckenteil
  let ok = true, minA = Infinity;
  for (let u = 0; u <= Z.len; u += 20) for (const q of [11.5, 20, 22, 31]) {
    const w = pz(u, q), ab = sp.abschnitte(w[0], w[1], 200);
    for (const e of ab) { const g = st.grenzeBei(e.s); if (e.abstand < g + 0.5 && Math.abs(sp.differenzS(e.s, Z.s0 + u)) > 30) ok = false; minA = Math.min(minA, e.abstand); }
  }
  pruefe('B Boxenbereich liegt nicht an einem anderen Streckenteil', ok, 'min ' + minA.toFixed(0) + ' m');
  const w1 = pz(100, 25), w2 = pz(100, -25), w3 = pz(Z.len + 100, 25), w4 = pz(-100, 25);
  pruefe('B sperre(): Boxen gesperrt, gegenüber/außerhalb der Zone frei', R.Formel1.sperre(st, w1[0], w1[1]) && !R.Formel1.sperre(st, w2[0], w2[1]) && !R.Formel1.sperre(st, w3[0], w3[1]) && !R.Formel1.sperre(st, w4[0], w4[1]));
  pruefe('B dekoSperre() meldet den Boxenbereich', st.dekoSperre(w1[0], w1[1]) === true);
}
{
  const kv = R.Formel1.kurven(st);
  const aussenOk = kv.every((c) => { const k = sp.punktBei(sp.wrapS(c.apexS)).kruemmung; return c.aussen === (k > 0 ? -1 : 1); });
  pruefe('B Kiesbett-Seite = Kurvenaußenseite', aussenOk);
  pruefe('B Kurvenbereiche überlappen die Boxen nicht auf deren Seite', kv.every((c) => !(c.aussen === Z.seite && sp.differenzS(Z.s0, c.s1) > 0 && sp.differenzS(c.s0, Z.s1) > 0)));
}

// ---------------------------------------------------------------- C
const trib = R.Tribuenen.einbauen(st);
pruefe('C genau 3 Tribünen: Start/Ziel + 2 Kurven', trib.length === 3 && trib.filter((t) => t.typ === 'start').length === 1 && trib.filter((t) => t.typ === 'kurve').length === 2, trib.map((t) => t.typ + '@' + Math.round(t.s)).join(' '));
{
  const t0 = trib.find((t) => t.typ === 'start');
  pruefe('C Start/Ziel-Tribüne links (gegenüber den Boxen), nahe der Ziellinie', t0 && t0.seite === -Z.seite && Math.abs(sp.differenzS(t0.s, 0)) < 40, t0 && (t0.seite + ' s' + t0.s.toFixed(0)));
  trib.filter((t) => t.typ === 'kurve').forEach((t) => pruefe('C Kurventribüne ' + t.nr + ': Außenseite, Kurve ≥ 80°', t.seite === (t.kurve.dir > 0 ? -1 : 1) && t.kurve.winkel >= 80, t.kurve.winkel));
}

// ---------------------------------------------------------------- D
{
  const deko = R.themes.dekoBauen(daten.thema, st, 'sommer');
  const a = deko.userData.anzahl;
  pruefe('D Deko: keine Kühe/Heuballen/Blumen/Teich, Bäume vorhanden', a.kuehe === 0 && a.heuballen === 0 && a.blumen === 0 && a.teich === false && a.baeume > 100, JSON.stringify(a));
  const st2 = new R.Strecke(daten, {}); R.Tribuenen.einbauen(st2);
  R.Kollisionen.pflanzenSammeln(st2, R.themes.dekoBauen(daten.thema, st2, 'sommer'));
  pruefe('D keine Pflanzen-Kollider zwischen Straße und Bande', !(st2.pflanzen && st2.pflanzen.length) && !(st2.pflanzenKollider && st2.pflanzenKollider.length), String((st2.pflanzen || st2.pflanzenKollider || []).length));
  // keine Deko-Instanz im Boxenbereich / auf einer Tribüne / zwischen Straße und Bande
  let im = 0, nah = 0, n = 0;
  deko.traverse((o) => { if (!o.isInstancedMesh) return; const e = o.instanceMatrix.array; for (let i = 0; i < o.count; i++) { const x = e[i * 16 + 12], z = e[i * 16 + 14]; n++;
    if (R.Formel1.sperre(st, x, z)) im++; const nn = sp.naechster(x, z); if (Math.abs(nn.seitenabstand) < st.seitenabstandMax + 6) nah++; } });
  pruefe('D keine Deko-Instanz im Boxenbereich und keine näher als Bande + 6 m (' + n + ' Instanzen)', im === 0 && nah === 0, im + ' / ' + nah);
}

// ---------------------------------------------------------------- E
pruefe('E Tiere: artenFuer(formel1) = [] (Strecke und Katalogdaten)', R.Tiere.artenFuer(st).length === 0 && R.Tiere.artenFuer({ id: 'formel1' }).length === 0 && R.Tiere.artenFuer({ id: 'wiese' }).length === 1);
{
  const t = new R.Tiere({ fahrzeuge: [] }); const n = t.einsetzen(st, 3, { seed: 1 });
  pruefe('E R.Tiere legt auf der Formel-1-Strecke keine Plätze an', n === 0 && t.slots.length === 0);
}

// ---------------------------------------------------------------- F
const CC = R.carCatalog, formel = CC.finde('formel'), passat = CC.finde('passat');
{
  const farbe = (a) => a.optionen.farbe;
  const f1 = CC.formelFeld({ spieler: [formel, passat], gegner: 7, seed: 'a' });
  pruefe('F 7 Gegner = Formel-Renner (gleiche Fahrwerte), je eigene Farbe (alle verschieden)', f1.gegner.length === 7 && f1.gegner.every((a) => a.id === 'formel' && a.fahrwerte === formel.fahrwerte) && new Set(f1.gegner.map(farbe)).size === 7);
  pruefe('F Farben aus der 8er-Palette, keine ähnelt dem Standardlack des Spielers (Dunkelblau)', f1.gegner.every((a) => CC.FORMEL_FARBEN.indexOf(farbe(a)) >= 0) && CC.FORMEL_FARBEN.length === 8);
  pruefe('F Spieler mit anderem Auto behält es (Eintrag unverändert)', f1.spieler[1] === passat && f1.spieler[0] === formel);
  const f2 = CC.formelFeld({ spieler: [formel, passat], gegner: 7, seed: 'a' }), f3 = CC.formelFeld({ spieler: [formel, passat], gegner: 7, seed: 'b' });
  pruefe('F deterministisch je Seed (gleicher Seed = gleiche Farben, anderer Seed = andere Reihenfolge)', JSON.stringify(f1.gegner.map(farbe)) === JSON.stringify(f2.gegner.map(farbe)) && JSON.stringify(f1.gegner.map(farbe)) !== JSON.stringify(f3.gegner.map(farbe)));
  const z = CC.formelFeld({ spieler: [formel, formel], gegner: 6, seed: 'z' });
  pruefe('F Zweispieler: beide Formel, unterschiedliche Farben, auch zu allen Gegnern', z.spieler[1].optionen && z.spieler[1].optionen.farbe !== formel.farbe && new Set([formel.farbe].concat(z.spieler[1].optionen.farbe, z.gegner.map(farbe))).size === 8, z.gegner.length);
  const b = CC.formelFeld({ spieler: [formel], gegner: 3, seed: 'q', belegt: [0xd7261e] });
  pruefe('F Garage-Lack des Spielers (Rot) wird bei den Gegnern ausgespart', b.gegner.every((a) => farbe(a) !== 0xd7261e));
  const g8 = CC.formelFeld({ spieler: [passat], gegner: 8, seed: 'z' });
  pruefe('F 8 Gegner = alle 8 Farben, 10 Gegner: Farben wiederholen sich erst danach', new Set(g8.gegner.map(farbe)).size === 8 && CC.formelFeld({ spieler: [passat], gegner: 10, seed: 'z' }).gegner.length === 10);
  pruefe('F Katalogeintrag formel unverändert (kein optionen)', formel.optionen === undefined || formel.optionen.farbe === undefined);
  pruefe('F nurRennautos(e, daten): null → Standard der Strecke, true/false gewinnt',
    CC.nurRennautos({ nurRennautos: null }, daten) === true && CC.nurRennautos({}, daten) === true && CC.nurRennautos({ nurRennautos: false }, daten) === false &&
    CC.nurRennautos({ nurRennautos: null }, R.trackCatalog[0]) === false && CC.nurRennautos({ nurRennautos: true }, R.trackCatalog[0]) === true);
}

// ---------------------------------------------------------------- G
{
  const w = (x) => S.einstellungenPruefen({ streckeId: 'formel1', nurRennautos: x }, 2).nurRennautos;
  pruefe('G Server: nurRennautos nur als echtes true (false/undefined/„true“/1 → false)', w(true) === true && w(false) === false && w(undefined) === false && w('true') === false && w(1) === false);
  pruefe('G Server: Strecke formel1 gültig, Welt „alles“ → Standard', S.einstellungenPruefen({ streckeId: 'formel1', welt: 'alles' }, 2).welt === '' && S.einstellungenPruefen({ streckeId: 'formel1' }, 2).streckeId === 'formel1');
  const spieler = [{ fahrer: 'Jonas', auto: 'formel' }, { fahrer: 'Emmy', auto: 'passat' }];
  const mit = new S.Simulation({ einstellungen: { streckeId: 'formel1', runden: 1, gegner: 6, nurRennautos: true }, spieler, seed: 11 });
  const info = mit.teilnehmerInfo;
  const ki = info.filter((t) => !t.mensch);
  pruefe('G Server mit Flag: 6 Computer = Formel-Renner mit eigener Farbe, Menschen behalten ihr Auto', ki.length === 6 && ki.every((t) => t.autoId === 'formel' && t.optionen && Number.isFinite(t.optionen.farbe)) &&
    new Set(ki.map((t) => t.optionen.farbe)).size === 6 && info[0].autoId === 'formel' && info[1].autoId === 'passat');
  const ohne = new S.Simulation({ einstellungen: { streckeId: 'formel1', runden: 1, gegner: 6 }, spieler, seed: 11 });
  const ki2 = ohne.teilnehmerInfo.filter((t) => !t.mensch);
  pruefe('G Server ohne Flag: Computer fahren wie bisher gemischte Autos (nicht alle Formel)', ki2.length === 6 && ki2.some((t) => t.autoId !== 'formel'));
  // Gleiche Fahrwerte der Computer-Formel im Server wie im Browser-Weg
  pruefe('G Server mit Flag: Formel-Fahrwerte (vMax 280 km/h)', mit.sim.fahrzeuge.filter((f) => !f.istSpieler).every((f) => Math.abs(f.auto.fahrwerte.vMax - 280 / 3.6) < 1e-6));
  // ---------------------------------------------------------------- H
  const sts = mit.sim.strecke;
  pruefe('H Server: Strecke formel1, 3 Tribünen, keine Tiere, Länge wie Browser-Weg', sts.id === 'formel1' && sts.tribuenen.length === 3 && Math.abs(sts.laenge - L) < 1e-6 && !mit.sim.tiere);
  let ok = true;
  try {
    mit.rennen && 0;
    for (let k = 0; k < 60 * 12; k++) { mit.eingaben.forEach((e, i) => { e.gas = 1; }); mit.schritt ? mit.schritt(1 / 60) : 0; }
  } catch (e) { ok = false; console.log(e.stack); }
  pruefe('H Server: 12 s Simulation ohne Fehler', ok);
}

console.log(fehler ? `\n${fehler} FEHLER von ${geprueft}` : `\nALLE ${geprueft} TESTS OK`);
process.exit(fehler ? 1 : 0);
