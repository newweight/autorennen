// Runde 6 (W3-F): Pokal-Logik (R.Pokal) und „Letzter fliegt raus" (RaceManager-Option elimination) – ohne Browser.
// Aufruf: node tests/test_pokal.js
// eigener Lader (wie tests/lade.js), damit der Test window.localStorage in der Sandbox setzen kann
const fs = require('fs'), path = require('path'), vm = require('vm');
const sandbox = { console, Math, performance: { now: () => Date.now() } };
sandbox.window = sandbox; sandbox.addEventListener = () => {}; sandbox.globalThis = sandbox;
vm.createContext(sandbox);
for (const d of ['src/config.js', 'src/physics/vehicle.js', 'src/track/spline.js', 'src/track/trackCatalog.js',
  'src/track/trackBuilder.js', 'src/race/raceManager.js', 'src/race/pokal.js']) vm.runInContext(fs.readFileSync(path.join(__dirname, '..', d), 'utf8'), sandbox, { filename: d });
const R = sandbox.Rennspiel;
let fehler = 0;
function pruefe(name, ok, info) { console.log((ok ? 'OK   ' : 'FAIL ') + name + (info !== undefined ? ' – ' + JSON.stringify(info) : '')); if (!ok) fehler++; }
const P = R.Pokal;

// ---------- Punkte ----------
const soll = { 1: 10, 2: 8, 3: 6, 4: 5, 5: 4, 6: 3, 7: 2, 8: 1, 9: 1, 12: 1 };
pruefe('Punkte je Platz 1.=10 … 7.=2, ab 8. = 1', Object.keys(soll).every((p) => P.punkte(+p) === soll[p]), Object.keys(soll).map((p) => P.punkte(+p)));
pruefe('Punkte für ungültige Plätze = 0', P.punkte(0) === 0 && P.punkte(undefined) === 0 && P.punkte(NaN) === 0);

// ---------- Reihenfolge ----------
pruefe('Pokal 5: Wiese → Wald → Wüste → Fantasie → Dino', JSON.stringify(P.strecken(5)) === JSON.stringify(['wiese', 'wald', 'wueste', 'fantasie', 'dino']), P.strecken(5));
pruefe('Pokal 4: Wiese → Wald → Wüste → Fantasie', JSON.stringify(P.strecken(4)) === JSON.stringify(['wiese', 'wald', 'wueste', 'fantasie']), P.strecken(4));
pruefe('Pokal 3: Wiese → Wald → Fantasie', JSON.stringify(P.strecken(3)) === JSON.stringify(['wiese', 'wald', 'fantasie']), P.strecken(3));
pruefe('Ungültige Größe → Standard (3)', P.groesse(7) === 3 && P.strecken('x').length === 3);
pruefe('Alle Pokal-Strecken gibt es im Katalog', [3, 4, 5].every((g) => P.strecken(g).length === g));

// ---------- Stärke-Steigerung ----------
const reihe = (start, n) => Array.from({ length: n }, (_, i) => P.staerke(start, i));
pruefe('leicht, 5 Rennen: leicht → mittel → schwer → profi → meister', JSON.stringify(reihe('leicht', 5)) === JSON.stringify(['leicht', 'mittel', 'schwer', 'profi', 'meister']), reihe('leicht', 5));
pruefe('profi, 5 Rennen: profi → meister → legende → legende → legende (Obergrenze)', JSON.stringify(reihe('profi', 5)) === JSON.stringify(['profi', 'meister', 'legende', 'legende', 'legende']), reihe('profi', 5));
pruefe('legende bleibt legende', reihe('legende', 3).every((s) => s === 'legende'));
pruefe('unschlagbar bleibt unschlagbar (über der Obergrenze)', reihe('unschlagbar', 3).every((s) => s === 'unschlagbar'));
pruefe('unbekannte Startstärke → Standard', P.staerke('quatsch', 0) === R.config.schwierigkeitStandard);

// ---------- Serie ----------
const auto = (id) => ({ id, name: id, farbe: 0xff0000 });
const zeilen = (namen) => namen.map((n, i) => ({ platz: i + 1, name: n, istSpieler: n === 'Jonas' || n === 'Emmy', spielerNr: n === 'Jonas' ? 0 : n === 'Emmy' ? 1 : -1, auto: auto('a-' + n) }));
const s = new P.Serie({ groesse: 3, startStaerke: 'mittel', basis: { streckeId: 'dino' } });
pruefe('Serie: 3 Rennen, Start Wiese/mittel', s.anzahl === 3 && s.nr === 0 && !s.fertig &&
  JSON.stringify(s.rennenEinstellungen()) === JSON.stringify({ streckeId: 'wiese', schwierigkeit: 'mittel' }), s.rennenEinstellungen());
const p1 = s.ergebnisEintragen(zeilen(['Jonas', 'Schumacher', 'Senna', 'Emmy', 'Verstappen', 'Röhrl', 'Sara', 'Max', 'Lena']));
pruefe('Rennen 1: Punkte 10/8/6/5/4/3/2/1/1', [p1.Jonas, p1.Schumacher, p1.Senna, p1.Emmy, p1.Verstappen, p1['Röhrl'], p1.Sara, p1.Max, p1.Lena].join() === '10,8,6,5,4,3,2,1,1', p1);
pruefe('nach Rennen 1: Wald / schwer', JSON.stringify(s.rennenEinstellungen()) === JSON.stringify({ streckeId: 'wald', schwierigkeit: 'schwer' }), s.rennenEinstellungen());
s.ergebnisEintragen(zeilen(['Schumacher', 'Jonas', 'Senna', 'Emmy', 'Verstappen', 'Röhrl', 'Sara', 'Max', 'Lena']));
pruefe('nach Rennen 2: Fantasie / profi', JSON.stringify(s.rennenEinstellungen()) === JSON.stringify({ streckeId: 'fantasie', schwierigkeit: 'profi' }), s.rennenEinstellungen());
let t = s.tabelle();
pruefe('Gleichstand 18:18, je 1 Sieg, gleiche Plätze → letztes Rennen entscheidet: Schumacher vor Jonas',
  t[0].name === 'Schumacher' && t[1].name === 'Jonas' && t[0].punkte === 18 && t[1].punkte === 18, t.slice(0, 3).map((z) => [z.name, z.punkte]));
s.ergebnisEintragen(zeilen(['Jonas', 'Senna', 'Schumacher', 'Emmy', 'Verstappen', 'Röhrl', 'Sara', 'Max', 'Lena']));
t = s.tabelle();
pruefe('Serie fertig nach 3 Rennen', s.fertig && s.nr === 3);
pruefe('Endstand: Jonas 28, Schumacher 24, Senna 20', t[0].name === 'Jonas' && t[0].punkte === 28 && t[1].name === 'Schumacher' && t[1].punkte === 24 && t[2].name === 'Senna' && t[2].punkte === 20,
  t.slice(0, 3).map((z) => [z.name, z.punkte]));
pruefe('Sieger = Jonas (Spieler, 2 Siege), Rang 1..9', s.sieger.name === 'Jonas' && s.sieger.istSpieler && s.sieger.siege === 2 && t.map((z) => z.rang).join() === '1,2,3,4,5,6,7,8,9');
pruefe('nach dem Ende keine weiteren Punkte', Object.keys(s.ergebnisEintragen(zeilen(['Lena']))).length === 0 && s.tabelle()[0].punkte === 28);
pruefe('Auto des Fahrers gemerkt', t[0].auto && t[0].auto.id === 'a-Jonas');
pruefe('Basis-Einstellungen gemerkt', s.basis && s.basis.streckeId === 'dino');
// Gleichstand Punkte und Siege → bessere Platzierungen entscheiden
const g = new P.Serie({ groesse: 3, startStaerke: 'leicht' });
g.ergebnisEintragen(zeilen(['A', 'B', 'C', 'D']));   // A10 B8 C6 D5
g.ergebnisEintragen(zeilen(['D', 'C', 'B', 'A']));   // D10 C8 B6 A5  → A15 B14 C14 D15
const tg = g.tabelle();
pruefe('Gleichstand A/D 15 (je 1 Sieg, 1.+4.) → letztes Rennen entscheidet: D vor A', tg[0].name === 'D' && tg[1].name === 'A', tg.map((z) => [z.name, z.punkte]));
pruefe('Gleichstand B/C 14: gleiche Plätze (2.+3.) → letztes Rennen: C vor B', tg[2].name === 'C' && tg[3].name === 'B', tg.map((z) => z.name));

// ---------- Speicherung (ohne localStorage: RAM-Rückfall) ----------
pruefe('ohne localStorage: 0 Pokale', P.gewinne('Jonas') === 0);
pruefe('gutschreiben → 1, 2', P.gutschreiben('Jonas') === 1 && P.gutschreiben('Jonas') === 2 && P.gewinne('Jonas') === 2);
pruefe('andere Fahrer unberührt', P.gewinne('Emmy') === 0 && P.gutschreiben('Emmy') === 1 && P.gewinne('Jonas') === 2);
// mit (falschem) localStorage-Ersatz
const speicher = {}; sandbox.localStorage = { getItem: (k) => (k in speicher ? speicher[k] : null), setItem: (k, v) => { speicher[k] = String(v); } };
pruefe('mit localStorage: Schlüssel rennspiel.pokale.v1', P.KEY === 'rennspiel.pokale.v1');
P.gutschreiben('Sara');
pruefe('mit localStorage: gespeichert als JSON', JSON.parse(speicher['rennspiel.pokale.v1']).Sara === 1, speicher);
speicher['rennspiel.pokale.v1'] = '{kaputt';
pruefe('kaputter Speicher → 0, kein Absturz', P.gewinne('Sara') === 0);
speicher['rennspiel.pokale.v1'] = JSON.stringify({ Max: -3, Lena: 2.7, Tom: 'x' });
pruefe('ungültige Werte → 0 / abgerundet', P.gewinne('Max') === 0 && P.gewinne('Lena') === 2 && P.gewinne('Tom') === 0);
sandbox.localStorage = { getItem: () => { throw new Error('gesperrt'); }, setItem: () => { throw new Error('gesperrt'); } };
pruefe('gesperrter Speicher: kein Absturz', (() => { try { P.gewinne('X'); P.gutschreiben('X'); return true; } catch (e) { return false; } })());
delete sandbox.localStorage;

// ---------- „Letzter fliegt raus": RaceManager (Autos fahren kinematisch die Mittellinie ab) ----------
const dt = R.config.physik.schritt;
function elimRennen(tempi, opt) {
  const daten = R.trackCatalog.find((x) => x.id === 'wiese');
  const strecke = new R.Strecke(daten, { welt: daten.weltStandard });
  const sp = strecke.spline, n = tempi.length;
  const start = strecke.startpositionen(n);
  const autos = start.map((p) => { const v = new R.Vehicle({}); v.setzen(p.x, p.z, p.heading); return v; });
  const s0 = autos.map((v) => sp.naechster(v.x, v.z).s);
  const rennen = new R.RaceManager(strecke, autos.map((v, i) => ({ vehicle: v, name: 'Auto' + i, istSpieler: (opt && opt.spieler === i) })),
    { runden: n - 1, countdown: 0, elimination: (opt && opt.elimination) || true });
  const ev = [];
  rennen.bei('raus', (t) => ev.push({ art: 'raus', nr: t.nr, runde: t.ausscheidRunde, aktiv: rennen.teilnehmer.filter((x) => !x.ausgeschieden).length, leaderRunde: Math.max(...rennen.teilnehmer.map((x) => x.runde)) }));
  rennen.bei('ziel', (t) => ev.push({ art: 'ziel', nr: t.nr }));
  rennen.bei('fertig', () => ev.push({ art: 'fertig' }));
  const weg = autos.map(() => 0);
  let zeit = 0;
  for (let k = 0; k < 60 * 900 && rennen.zustand !== 'fertig'; k++) {
    autos.forEach((v, i) => {
      if (rennen.teilnehmer[i].ausgeschieden) return;
      weg[i] += tempi[i] * dt;
      const p = sp.punktBei(s0[i] + weg[i]);
      v.x = p.x; v.z = p.z;
    });
    rennen.schritt(dt); zeit += dt;
  }
  return { rennen, ev, zeit };
}
const e1 = elimRennen([40, 38, 36, 34, 32]);
const raus = e1.ev.filter((e) => e.art === 'raus');
pruefe('5 Teilnehmer → 4 Runden', e1.rennen.runden === 4);
pruefe('je Runde scheidet einer aus (Runde 1, 2, 3, 4)', raus.map((e) => e.runde).join() === '1,2,3,4', raus);
pruefe('Ausscheid-Reihenfolge: langsamstes zuerst (4, 3, 2, 1)', raus.map((e) => e.nr).join() === '4,3,2,1', raus.map((e) => e.nr));
pruefe('je Runde einer weniger (4, 3, 2, 1 Fahrende)', raus.map((e) => e.aktiv).join() === '4,3,2,1', raus.map((e) => e.aktiv));
pruefe('Sieger = schnellstes Auto, imZiel, Platz 1, dann fertig', e1.ev.some((e) => e.art === 'ziel' && e.nr === 0) && e1.ev[e1.ev.length - 1].art === 'fertig' &&
  e1.rennen.rangliste[0].nr === 0 && e1.rennen.teilnehmer[0].imZiel);
pruefe('Rangliste in Ausscheid-Reihenfolge (0, 1, 2, 3, 4)', e1.rennen.rangliste.map((t) => t.nr).join() === '0,1,2,3,4', e1.rennen.rangliste.map((t) => t.nr));
pruefe('Platz-Feld passt zur Rangliste', e1.rennen.rangliste.every((t, i) => t.platz === i + 1));
pruefe('keine NaN (Fortschritt, Zeiten)', e1.rennen.teilnehmer.every((t) => Number.isFinite(t.fortschritt)) && Number.isFinite(e1.rennen.teilnehmer[0].zielZeit));
pruefe('Ausgeschiedene: Fortschritt eingefroren', (() => { const t = e1.rennen.teilnehmer[4]; return t.ausgeschieden && t.runde === 0; })());
// Überrundete: zwei sehr langsame Autos → kein Hängenbleiben (Führender eine Runde voraus → Letzter raus)
const e2 = elimRennen([40, 39, 38, 4, 3]);
const raus2 = e2.ev.filter((e) => e.art === 'raus');
pruefe('Zwei Schnecken: beide fliegen zuerst raus (4, 3), Rennen endet', raus2.slice(0, 2).map((e) => e.nr).join() === '4,3' && e2.rennen.zustand === 'fertig', raus2);
pruefe('Zwei Schnecken: Rennen nicht viel länger als das normale', e2.zeit < e1.zeit * 1.3, [Math.round(e1.zeit), Math.round(e2.zeit)]);
// Spieler raus → Zuschauen, nach zuschauerSekunden Schluss
const e3 = elimRennen([40, 38, 36, 34, 20], { spieler: 4, elimination: { zuschauerSekunden: 5 } });
const r3 = e3.ev.filter((e) => e.art === 'raus');
const t3 = e3.rennen.teilnehmer[4];
pruefe('Spieler (langsam) scheidet in Runde 1 aus', r3[0] && r3[0].nr === 4 && t3.ausgeschieden);
pruefe('alle Spieler raus → nach 5 s Ergebnis (nur 1 ausgeschieden)', e3.rennen.zustand === 'fertig' && r3.length === 1 && Math.abs(e3.zeit - t3.ausscheidZeit - 5) < 0.1,
  [Math.round(t3.ausscheidZeit * 10) / 10, Math.round(e3.zeit * 10) / 10]);
pruefe('dann: Fahrende vorn (nach Fortschritt), Spieler letzter', e3.rennen.rangliste[4].nr === 4 && e3.rennen.rangliste[0].nr === 0, e3.rennen.rangliste.map((t) => t.nr));
// Normales Rennen unverändert (keine Option)
const daten = R.trackCatalog.find((x) => x.id === 'wiese');
const st = new R.Strecke(daten, { welt: daten.weltStandard });
const rn = new R.RaceManager(st, [{ vehicle: new R.Vehicle({}), name: 'A' }], { runden: 2, countdown: 0 });
pruefe('normales Rennen: elimination = null, kein Ausgeschiedener', rn.elimination === null && rn.teilnehmer[0].ausgeschieden === false && rn.ausgeschiedene.length === 0);

console.log(fehler ? fehler + ' Fehler' : 'alle Pokal-Tests OK');
process.exit(fehler ? 1 : 0);
