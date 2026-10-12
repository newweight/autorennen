// Node-Test Münzen + Garage (Runde 6, W3-G): node tests/test_garage.js
// Münzen: 20–40 je Strecke (alle Strecken + XL), Reihen à 5 auf Geraden, nichts im Looping/Start, auf der Fahrbahn,
//   deterministisch; Einsammeln ändert NICHTS am Fahrzeug (keine Physik), Looping/Flug/Polizei sammeln nicht.
// Garage (ohne localStorage → Arbeitsspeicher): Kontostand, Preisgeld, Farbkauf (20, danach gratis, Original gratis),
//   Upgrades 30/60/100 und Faktoren (+4 % vMax / +4 % grip / +6 % bremsen je Stufe, Schalter aus = 1),
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
  pruefe('fahrzeugWerte liefert Lack', G.fahrzeugWerte('Jonas', 'troc-cabrio', true).farbe === pink && G.fahrzeugWerte('Jonas', 'troc-cabrio', false).farbe === pink);
}

// ------------------------------------------------------------ Garage: Upgrades
{
  G.gutschreiben('Jonas', 400);       // 411
  const p = [];
  for (let i = 0; i < 4; i++) { const r = G.upgradeKaufen('Jonas', 'troc-cabrio', 'motor'); p.push(r.ok ? r.kosten : r.grund); }
  pruefe('Motor: Stufen kosten 30/60/100, danach „max"', JSON.stringify(p) === JSON.stringify([30, 60, 100, 'max']), JSON.stringify(p));
  pruefe('Konto nach Motor 3: 411 − 190 = 221', G.konto('Jonas') === 221, G.konto('Jonas'));
  G.upgradeKaufen('Jonas', 'troc-cabrio', 'reifen');
  G.upgradeKaufen('Jonas', 'troc-cabrio', 'bremsen'); G.upgradeKaufen('Jonas', 'troc-cabrio', 'bremsen');
  const f = G.faktoren('Jonas', 'troc-cabrio', true);
  const nah = (a, b) => Math.abs(a - b) < 1e-9;
  pruefe('Faktoren: vMax 1,12 (3×4 %), grip 1,04, bremsen 1,12 (2×6 %)', nah(f.vMax, 1.12) && nah(f.grip, 1.04) && nah(f.bremsen, 1.12), JSON.stringify(f));
  const aus = G.faktoren('Jonas', 'troc-cabrio', false);
  pruefe('Schalter aus: alle Faktoren 1', aus.vMax === 1 && aus.grip === 1 && aus.bremsen === 1);
  const fremd = G.faktoren('Emmy', 'troc-cabrio', true);
  pruefe('Upgrades je Fahrer+Auto (Emmy/Cabrio, Jonas/Multivan = 1)', fremd.vMax === 1 && G.faktoren('Jonas', 'multivan', true).vMax === 1);
  const r = G.upgradeKaufen('Emmy', 'multivan', 'motor');
  pruefe('Upgrade ohne Geld: grund geld, Kosten 30', !r.ok && r.grund === 'geld' && r.kosten === 30);
  pruefe('Unbekanntes Upgrade abgelehnt', !G.upgradeKaufen('Jonas', 'multivan', 'turbo').ok);
  // Wirkung wie in main.js.fahrzeugHinzufuegen: Faktoren direkt in vehicle.daten
  const v0 = new R.Vehicle(R.carCatalog.finde('troc-cabrio').fahrwerte, { tempoKlasse: 'normal' });
  const v1 = new R.Vehicle(R.carCatalog.finde('troc-cabrio').fahrwerte, { tempoKlasse: 'normal' });
  v1.daten.vMax *= f.vMax; v1.daten.grip *= f.grip; v1.daten.bremsen *= f.bremsen;
  pruefe('vehicle.daten: vMax × 1,12 gegenüber Standard (Katalog unverändert)', nah(v1.daten.vMax / v0.daten.vMax, 1.12) &&
    R.carCatalog.finde('troc-cabrio').fahrwerte.vMax === 230 / 3.6);
}

// ------------------------------------------------------------ Garage: Reparatur / Schaden-Rest
{
  pruefe('Reparatur mit Schaden aus: „nicht nötig"', G.reparieren('Jonas', 'troc-cabrio', false).grund === 'nichtNoetig');
  pruefe('Reparatur heiles Auto: „nicht nötig"', G.reparieren('Jonas', 'troc-cabrio', true).grund === 'nichtNoetig');
  pruefe('Startprozent ohne Rest = 100', G.startProzent('Jonas', 'troc-cabrio') === 100);
  G.restSetzen('Jonas', 'troc-cabrio', 55);
  pruefe('Rest 55 → nächstes Rennen startet mit 55 %', G.startProzent('Jonas', 'troc-cabrio') === 55);
  G.restSetzen('Jonas', 'troc-cabrio', 0);
  pruefe('Rest 0 (liegengeblieben) → mindestens 30 %', G.startProzent('Jonas', 'troc-cabrio') === 30);
  const k0 = G.konto('Jonas');
  const r = G.reparieren('Jonas', 'troc-cabrio', true);
  pruefe('Reparatur: −10 Münzen, Start wieder 100 %', r.ok && r.kosten === 10 && G.konto('Jonas') === k0 - 10 && G.startProzent('Jonas', 'troc-cabrio') === 100);
  G.restSetzen('Emmy', 'multivan', 40);
  pruefe('Reparatur ohne Geld: grund geld', G.reparieren('Emmy', 'multivan', true).grund === 'geld' && G.startProzent('Emmy', 'multivan') === 40);
}

// ------------------------------------------------------------ Speicherformat
{
  const o = G.laden();
  const j = o.Jonas, a = j && j.autos && j.autos['troc-cabrio'];
  pruefe('Speicherformat { fahrer: { muenzen, autos: { autoId: { farbe, motor, reifen, bremsen } } } }',
    !!a && typeof j.muenzen === 'number' && a.motor === 3 && a.reifen === 1 && a.bremsen === 2 && Number.isFinite(a.farbe) && Array.isArray(a.farben) && a.rest === 100,
    JSON.stringify(o).slice(0, 220));
  pruefe('JSON-tauglich (Hin und zurück gleich)', JSON.stringify(JSON.parse(JSON.stringify(o))) === JSON.stringify(o));
  // kaputte Daten → Standardwerte
  G.speichern({ Kerle: { muenzen: 'viel', autos: { passat: { motor: 9, reifen: -2, farbe: 'rot' } } }, Sara: 5 });
  const d = G.autoDaten('Kerle', 'passat');
  pruefe('Kaputte Werte → geklemmt/Standard (Stufen 0..3, Farbe null, Konto 0)', G.konto('Kerle') === 0 && d.motor === 3 && d.reifen === 0 && d.farbe === null && G.konto('Sara') === 0,
    JSON.stringify(d));
}

console.log(fehler === 0 ? '\nALLE TESTS OK' : '\n' + fehler + ' FEHLER');
process.exit(fehler ? 1 : 0);
