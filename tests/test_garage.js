// Node-Test Münzen + Garage (Runde 6, W3-G): node tests/test_garage.js
// Münzen: 20–40 je Strecke (alle Strecken + XL), Reihen à 5 auf Geraden, nichts im Looping/Start, auf der Fahrbahn,
//   deterministisch; Einsammeln ändert NICHTS am Fahrzeug (keine Physik), Looping/Flug/Polizei sammeln nicht.
// Garage (ohne localStorage → Arbeitsspeicher): Kontostand, Preisgeld, Farbkauf (20, danach gratis, Original gratis),
//   R1: keine Upgrades mehr (Faktoren immer 1, config ohne upgradePreise); alte Upgrade-Stufen 0–3 werden beim Laden
//   einmalig in Goldstücke erstattet (30 / 30+60 / 30+60+100 je Art), idempotent, Hinweis-Betrag einmalig,
//   Reparatur-Logik (nur mit Schaden an und Rest < 100), Schaden-Rest (min. 30 %), Speicherformat, Fahrer getrennt.
const { ladeModule } = require('./lade');
const R = ladeModule(['src/config.js', 'src/physics/vehicle.js', 'src/track/spline.js', 'src/track/trackCatalog.js',
  'src/track/trackBuilder.js', 'src/cars/carCatalog.js', 'src/world/muenzen.js', 'src/ui/garage.js']);

let fehler = 0;
function pruefe(name, ok, info) { console.log((ok ? 'OK   ' : 'FEHL ') + name + (info !== undefined ? '  (' + info + ')' : '')); if (!ok) fehler++; }
const G = R.Garage, CG = R.config.garage;

// ------------------------------------------------------------ Münzen: Platzierung
{
  const zeilen = [];
  let alleOk = true, imLooping = 0, neben = 0, start = 0, reihenOk = true;
  for (const d of R.trackCatalog) {
    const varianten = [''].concat(Object.keys(d.varianten || {}));
    const welten = Object.keys(d.welten || { klassisch: 1 });
    for (const v of varianten) for (const w of [welten[0], welten[welten.length - 1]]) {
      const st = new R.Strecke(d, { welt: w, variante: v });
      const m = new R.Muenzen(st), L = st.spline.laenge;
      const n = m.anzahl;
      if (n < CG.muenzen.anzahlMin || n > CG.muenzen.anzahlMax) alleOk = false;
      for (const k of m.liste) {
        for (const l of st.loopings || []) if (st._inBereich(l, k.s, 0)) imLooping++;
        if (Math.abs(k.q) > st.breite / 2 - 1) neben++;
        if (k.s < CG.muenzen.startFrei - 0.01) start++;
      }
      // Reihen: je Reihe genau 5 Münzen im Abstand 6 m
      const reihen = {};
      m.liste.forEach((k) => { if (k.reihe >= 0) (reihen[k.reihe] = reihen[k.reihe] || []).push(k); });
      Object.values(reihen).forEach((r) => {
        if (r.length !== CG.muenzen.reihe) reihenOk = false;
        for (let j = 1; j < r.length; j++) if (Math.abs(st.spline.differenzS(r[j].s, r[j - 1].s) - CG.muenzen.reiheAbstand) > 0.01) reihenOk = false;
      });
      zeilen.push(d.id + (v ? '/' + v : '') + '/' + w + ': ' + n + ' (' + Object.keys(reihen).length + ' Reihen, ' + m.liste.filter(k => k.reihe < 0).length + ' einzeln, ' + Math.round(L) + ' m)');
    }
  }
  console.log('  ' + zeilen.join('\n  '));
  pruefe('Münzen: jede Strecke/Variante/Welt 20–40 Stück', alleOk);
  pruefe('Münzen: Reihen à 5 im Abstand 6 m', reihenOk);
  pruefe('Münzen: keine im Looping-Bereich, keine am Start, alle auf der Fahrbahn', imLooping === 0 && neben === 0 && start === 0, imLooping + '/' + neben + '/' + start);
  const st = new R.Strecke(R.trackCatalog[0], {});
  const a = new R.Muenzen(st).liste.map(k => [k.s, k.q]), b = new R.Muenzen(st).liste.map(k => [k.s, k.q]);
  pruefe('Münzen: Platzierung deterministisch', JSON.stringify(a) === JSON.stringify(b));
  const m = new R.Muenzen(st);
  pruefe('Münzen: Geraden haben Reihen, Kurven Einzelmünzen', m.liste.some(k => k.reihe >= 0) && m.liste.some(k => k.reihe < 0));
}

// ------------------------------------------------------------ Münzen: Einsammeln ohne Physik
{
  const st = new R.Strecke(R.trackCatalog[0], {});
  const m = new R.Muenzen(st), k0 = m.liste[0], k1 = m.liste[1], k2 = m.liste[2];
  const v = new R.Vehicle(R.carCatalog.finde('porsche-911').fahrwerte);
  v.setzen(k0.x + 0.5, k0.z, 1.2); v.y = k0.y - 0.95; v.vLaengs = 42.5; v.vQuer = 1.25; v.lenkung = 0.3;
  const vorher = JSON.stringify(v);
  const ev = m.schritt(1 / 60, [{ vehicle: v }]);
  pruefe('Einsammeln: Auto an der Münze → Ereignis {nr 0}', ev.length === 1 && ev[0].nr === 0 && ev[0].k === 0 && !k0.da, JSON.stringify(ev));
  pruefe('Einsammeln: Fahrzeug bitgleich unverändert (kein Stoß, kein Bremsen)', JSON.stringify(v) === vorher);
  pruefe('Einsammeln: zweites Mal nichts (Münze weg)', m.schritt(1 / 60, [{ vehicle: v }]).length === 0 && m.anzahlVon(0) === 1);
  // Looping / Flug / Polizei sammeln nicht; KI (Index 3) sammelt
  const w = new R.Vehicle({}); w.setzen(k1.x, k1.z, 0); w.y = k1.y - 0.95; w.imLooping = true;
  pruefe('Einsammeln: im Looping nicht', m.schritt(1 / 60, [null, { vehicle: w }]).length === 0);
  w.imLooping = false;
  pruefe('Einsammeln: in der Luft (flug.aktiv) nicht', m.schritt(1 / 60, [null, { vehicle: w, flug: { aktiv: true } }]).length === 0);
  pruefe('Einsammeln: Polizei nicht', m.schritt(1 / 60, [null, { vehicle: w, polizei: true }]).length === 0);
  const ki = new R.Vehicle({}); ki.setzen(k2.x, k2.z, 0); ki.y = k2.y - 0.95;
  const e2 = m.schritt(1 / 60, [null, null, null, { vehicle: ki }]);
  pruefe('Einsammeln: KI sammelt nebenbei (Münze weg, Zähler je Fahrzeug)', e2.length === 1 && e2[0].nr === 3 && m.anzahlVon(3) === 1);
  const unter = new R.Vehicle({}); unter.setzen(k1.x, k1.z, 0); unter.y = k1.y - 10;
  pruefe('Einsammeln: 10 m tiefer (Tunnel/Brücke) nicht', m.schritt(1 / 60, [{ vehicle: unter }]).length === 0);
  m.zuruecksetzen();
  pruefe('zuruecksetzen: alle Münzen wieder da, Zähler 0', m.uebrig === m.anzahl && m.anzahlVon(0) === 0);
}

// ------------------------------------------------------------ Garage: Konto, Preisgeld
G._ramLeeren();
pruefe('Preisgeld: 1 = 30, 2 = 20, 3 = 15, 4/9 = 5', G.preisgeld(1) === 30 && G.preisgeld(2) === 20 && G.preisgeld(3) === 15 && G.preisgeld(4) === 5 && G.preisgeld(9) === 5);
pruefe('Konto neu = 0', G.konto('Jonas') === 0);
pruefe('gutschreiben 30 + 1 → 31', G.gutschreiben('Jonas', 30) === 30 && G.gutschreiben('Jonas', 1) === 31 && G.konto('Jonas') === 31);
pruefe('gutschreiben negativ wird ignoriert', G.gutschreiben('Jonas', -50) === 31);
pruefe('Fahrer getrennt (Emmy = 0)', G.konto('Emmy') === 0);
pruefe('Polizei nicht in der Garage', !G.autos().some(a => a.id === 'polizei') && G.autos().length === R.carCatalog.waehlbare().length);
pruefe('4 Farben je Auto (alle Garage-Autos)', G.autos().every(a => G.farbenFuer(a.id).length === 4 && G.farbenFuer(a.id).every(Number.isFinite)));

// ------------------------------------------------------------ Garage: Farben
{
  const pink = G.farbenFuer('troc-cabrio')[3];
  let r = G.farbeKaufen('Emmy', 'troc-cabrio', pink);
  pruefe('Farbe ohne Geld: grund geld, Kosten 20, nichts geändert', !r.ok && r.grund === 'geld' && r.kosten === 20 && G.lackFarbe('Emmy', 'troc-cabrio') === null);
  r = G.farbeKaufen('Jonas', 'troc-cabrio', pink);
  pruefe('Farbe kaufen: −20 (31 → 11), aktiv', r.ok && r.kosten === 20 && G.konto('Jonas') === 11 && G.lackFarbe('Jonas', 'troc-cabrio') === pink);
  r = G.farbeKaufen('Jonas', 'troc-cabrio', null);
  pruefe('Original wählen: gratis, Lack null', r.ok && r.kosten === 0 && G.lackFarbe('Jonas', 'troc-cabrio') === null && G.konto('Jonas') === 11);
  r = G.farbeKaufen('Jonas', 'troc-cabrio', pink);
  pruefe('Gekaufte Farbe erneut: gratis', r.ok && r.kosten === 0 && G.konto('Jonas') === 11 && G.lackFarbe('Jonas', 'troc-cabrio') === pink);
  r = G.farbeKaufen('Jonas', 'troc-cabrio', 0x123456);
  pruefe('Fremde Farbe abgelehnt', !r.ok && r.grund === 'farbe');
  pruefe('Farbe gilt nur für dieses Auto', G.lackFarbe('Jonas', 'multivan') === null);
  pruefe('fahrzeugWerte liefert Lack', G.fahrzeugWerte('Jonas', 'troc-cabrio').farbe === pink);
}

// ------------------------------------------------------------ Garage: Upgrades entfernt (R1) + Erstattung
{
  pruefe('R1: config.garage ohne upgradePreise/upgradeJeStufe', CG.upgradePreise === undefined && CG.upgradeJeStufe === undefined);
  pruefe('R1: keine Upgrade-Funktionen mehr (upgradeKaufen/upgradePreis/faktoren/ARTEN)', G.upgradeKaufen === undefined && G.upgradePreis === undefined && G.faktoren === undefined && G.ARTEN === undefined);
  G.gutschreiben('Jonas', 400);
  const fw = G.fahrzeugWerte('Jonas', 'troc-cabrio', true);
  pruefe('R1: fahrzeugWerte: Faktoren immer 1 (auch mit altem Parameter „true“)', fw.vMax === 1 && fw.grip === 1 && fw.bremsen === 1);
  const d = G.autoDaten('Jonas', 'troc-cabrio');
  pruefe('R1: autoDaten ohne motor/reifen/bremsen', !('motor' in d) && !('reifen' in d) && !('bremsen' in d));

  // Erstattung: Stufe 0 / 1 / 2 / 3 je Art, mehrere Autos, mehrere Fahrer
  G._ramLeeren();
  G.speichern({
    Anna: { muenzen: 10, autos: { passat: { farbe: null, farben: [], motor: 0, reifen: 0, bremsen: 0, rest: 100 } } },                     // 0 → 0
    Ben: { muenzen: 5, autos: { passat: { farbe: 0xe3202b, farben: [0xe3202b], motor: 1, reifen: 0, bremsen: 0, rest: 100 } } },          // 1 → 30
    Cleo: { muenzen: 0, autos: { passat: { farbe: null, farben: [], motor: 2, reifen: 0, bremsen: 0, rest: 100 } } },                     // 2 → 90
    Dino: { muenzen: 100, autos: { passat: { farbe: null, farben: [], motor: 3, reifen: 3, bremsen: 3, rest: 100 },                       // 3×190 = 570
      multivan: { farbe: null, farben: [], motor: 1, reifen: 2, bremsen: 3, rest: 100 } } },                                                 // 30+90+190 = 310
  });
  pruefe('Erstattung Stufe 0: Konto bleibt 10', G.konto('Anna') === 10);
  pruefe('Erstattung Stufe 1: 5 + 30 = 35', G.konto('Ben') === 35, G.konto('Ben'));
  pruefe('Erstattung Stufe 2 (30+60): 0 + 90', G.konto('Cleo') === 90, G.konto('Cleo'));
  pruefe('Erstattung Stufe 3 in allen Arten + zweites Auto: 100 + 570 + 310 = 980', G.konto('Dino') === 980, G.konto('Dino'));
  const o = G.laden();
  const rein = Object.keys(o).every((n) => o[n].upgradesErstattet === true && Object.keys(o[n].autos).every((id) => !('motor' in o[n].autos[id]) && !('reifen' in o[n].autos[id]) && !('bremsen' in o[n].autos[id])));
  pruefe('Upgrade-Daten gelöscht, Merker upgradesErstattet gesetzt', rein, JSON.stringify(o.Dino));
  pruefe('Lack bleibt bei der Erstattung (Ben: rot, gekauft)', G.lackFarbe('Ben', 'passat') === 0xe3202b && G.autoDaten('Ben', 'passat').farben.length === 1);
  // Idempotenz: mehrfach laden/speichern/lesen ändert nichts
  const vorher = JSON.stringify(G.laden());
  G.konto('Dino'); G.autoDaten('Dino', 'passat'); G.speichern(G.laden()); G.laden();
  pruefe('Idempotent: nochmal laden/speichern → Konto und Daten gleich', G.konto('Dino') === 980 && JSON.stringify(G.laden()).replace(/"erstattung":\d+,?/g, '') === vorher.replace(/"erstattung":\d+,?/g, ''));
  // alte Felder tauchen später wieder auf (z. B. alte Sicherung eingespielt) → nur gelöscht, NICHT nochmal bezahlt
  { const p = G.laden(); p.Dino.autos.passat.motor = 3; G.speichern(p); pruefe('Alte Felder nach der Erstattung: ignoriert/gelöscht, kein zweites Geld', G.konto('Dino') === 980 && !('motor' in G.autoDaten('Dino', 'passat')) && !('motor' in G.laden().Dino.autos.passat)); }
  // neuer Fahrer ohne Upgrades: keine Gutschrift
  G.gutschreiben('Neu', 7);
  pruefe('Neuer Fahrer: kein Geld dazu', G.konto('Neu') === 7);
  // Hinweis-Betrag: einmalig, Summe + je Fahrer, danach null
  const h = G.hinweisHolen();
  pruefe('Hinweis: Summe 30 + 90 + 880 = 1000, vier... drei Fahrer mit Erstattung', !!h && h.summe === 1000 && h.fahrer.length === 3, JSON.stringify(h));
  pruefe('Hinweis je Fahrer (Ben 30, Cleo 90, Dino 880)', !!h && h.fahrer.find((x) => x.name === 'Ben').summe === 30 && h.fahrer.find((x) => x.name === 'Cleo').summe === 90 && h.fahrer.find((x) => x.name === 'Dino').summe === 880);
  pruefe('Hinweis nur EINMAL (zweiter Aufruf null, Konto unverändert)', G.hinweisHolen() === null && G.konto('Dino') === 980);
  pruefe('Hinweis-Merker gelöscht (kein „erstattung“ mehr im Speicher)', Object.keys(G.laden()).every((n) => !('erstattung' in G.laden()[n])));
  // Spielstand ohne jedes Upgrade: kein Hinweis
  G._ramLeeren(); G.speichern({ Eva: { muenzen: 12, autos: { passat: { farbe: null, farben: [], rest: 100 } } } });
  pruefe('Spielstand ohne Upgrades: kein Hinweis, Konto 12', G.hinweisHolen() === null && G.konto('Eva') === 12);
  // kaputte Stufen (9, -2, 'x', 1.7) werden geklemmt: 9 → 3 (190), -2 → 0, 'x' → 0, 1.7 → 1 (30)
  G._ramLeeren(); G.speichern({ Kai: { muenzen: 0, autos: { a: { motor: 9, reifen: -2, bremsen: 'x' }, b: { motor: 1.7 } } } });
  pruefe('Kaputte Stufen geklemmt: 190 + 30 = 220', G.konto('Kai') === 220, G.konto('Kai'));
  G._ramLeeren();
  // Wirkung wie in main.js.fahrzeugHinzufuegen: mit Garage-Werten bleibt vehicle.daten unverändert (Faktor 1)
  const v0 = new R.Vehicle(R.carCatalog.finde('troc-cabrio').fahrwerte, { tempoKlasse: 'normal' });
  const v1 = new R.Vehicle(R.carCatalog.finde('troc-cabrio').fahrwerte, { tempoKlasse: 'normal' });
  v1.daten.vMax *= fw.vMax; v1.daten.grip *= fw.grip; v1.daten.bremsen *= fw.bremsen;
  pruefe('vehicle.daten mit Garage-Werten = Standard (Katalog unverändert)', v1.daten.vMax === v0.daten.vMax && v1.daten.grip === v0.daten.grip && R.carCatalog.finde('troc-cabrio').fahrwerte.vMax === 230 / 3.6);
  // Quelltext: nirgends mehr upgradesZaehlen / upgradePreise
  const fs = require('fs'), pfad = require('path');
  const dateien = ['src/main.js', 'src/config.js', 'src/ui/garage.js', 'src/ui/menu.js', 'src/spass/spassTuningUI.js', 'src/net/online.js', 'server/server.js', 'server/simulation.js'];
  const treffer = dateien.filter((f) => /upgradesZaehlen|upgradePreise|upgradeJeStufe|upgradeKaufen/.test(fs.readFileSync(pfad.join(__dirname, '..', f), 'utf8')));
  pruefe('Quelltext ohne upgradesZaehlen/upgradePreise/upgradeJeStufe/upgradeKaufen', treffer.length === 0, treffer.join(','));
}

// ------------------------------------------------------------ Garage: Reparatur / Schaden-Rest
{
  pruefe('Reparatur mit Schaden aus: „nicht nötig"', G.reparieren('Jonas', 'troc-cabrio', false).grund === 'nichtNoetig');
  pruefe('Reparatur heiles Auto: „nicht nötig"', G.reparieren('Jonas', 'troc-cabrio', true).grund === 'nichtNoetig');
  pruefe('Startprozent ohne Rest = 100', G.startProzent('Jonas', 'troc-cabrio') === 100);
  const k0 = G.konto('Jonas');
  G.restSetzen('Jonas', 'troc-cabrio', 55);
  pruefe('v32: Rest 55 gesetzt → Start trotzdem 100 %', G.startProzent('Jonas', 'troc-cabrio') === 100 && G.autoDaten('Jonas', 'troc-cabrio').rest === 100);
  G.restSetzen('Jonas', 'troc-cabrio', 0);
  pruefe('v32: Rest 0 (liegengeblieben) → Start 100 %', G.startProzent('Jonas', 'troc-cabrio') === 100);
  const r = G.reparieren('Jonas', 'troc-cabrio', true);
  pruefe('v32: Reparatur kostet nichts (nichtNoetig, Konto gleich)', !r.ok && r.grund === 'nichtNoetig' && r.kosten === 0 && G.konto('Jonas') === k0);
  // alter gespeicherter Rest (40) wird beim Laden verworfen; altes Motor-Upgrade 1 wird erstattet (R1)
  {
    const o = G.laden(); o.Alt = { muenzen: 50, autos: { multivan: { farbe: null, farben: [], motor: 1, reifen: 0, bremsen: 0, rest: 40 } } };
    G.speichern(o);
    const d = G.autoDaten('Alt', 'multivan');
    pruefe('v32: alter Rest 40 → beim Laden 100, altes Motor-Upgrade weg, Start 100 %', d.rest === 100 && !('motor' in d) && G.startProzent('Alt', 'multivan') === 100);
    pruefe('v32/R1: Reparatur ohne Kosten, Konto 50 + 30 (Erstattung Motor 1) = 80', G.reparieren('Alt', 'multivan', true).kosten === 0 && G.konto('Alt') === 80, G.konto('Alt'));
  }
}

// ------------------------------------------------------------ Speicherformat
{
  G._ramLeeren();
  G.gutschreiben('Jonas', 50); G.farbeKaufen('Jonas', 'troc-cabrio', R.config.garage.farben['troc-cabrio'][3]);
  const o = G.laden();
  const j = o.Jonas, a = j && j.autos && j.autos['troc-cabrio'];
  pruefe('Speicherformat { fahrer: { muenzen, upgradesErstattet, autos: { autoId: { farbe, farben, rest } } } } (ohne Upgrade-Felder)',
    !!a && typeof j.muenzen === 'number' && j.upgradesErstattet === true && !('motor' in a) && !('reifen' in a) && !('bremsen' in a) && Number.isFinite(a.farbe) && Array.isArray(a.farben) && a.rest === 100,
    JSON.stringify(o).slice(0, 220));
  pruefe('JSON-tauglich (Hin und zurück gleich)', JSON.stringify(JSON.parse(JSON.stringify(o))) === JSON.stringify(o));
  // kaputte Daten → Standardwerte
  G.speichern({ Kerle: { muenzen: 'viel', autos: { passat: { motor: 9, reifen: -2, farbe: 'rot' } } }, Sara: 5 });
  const d = G.autoDaten('Kerle', 'passat');
  pruefe('Kaputte Werte → Standard (Farbe null, Konto = Erstattung der geklemmten Stufe 3 = 190, Sara 0)', G.konto('Kerle') === 190 && d.farbe === null && !('motor' in d) && G.konto('Sara') === 0,
    JSON.stringify(d));
}

console.log(fehler === 0 ? '\nALLE TESTS OK' : '\n' + fehler + ' FEHLER');
process.exit(fehler ? 1 : 0);
