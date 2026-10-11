// Node-Test Schaden-System (Runde 4): node tests/test_schaden.js
// 20 Treffer → 0 %, Stufen-Faktoren, Abklingzeit, Mindeststärke, Brand −10 %, liegengeblieben → gesperrt 5 s →
// Abschleppen mit 60 %, an = false ändert nichts. Partikel-Teil (meshBauen/update) nur mit THREE → hier übersprungen.
const { ladeModule } = require('./lade');
const R = ladeModule(['src/config.js', 'src/physics/vehicle.js', 'src/cars/carCatalog.js', 'src/physics/collisions.js',
  'src/physics/schaden.js']);
let fehler = 0;
function pruefe(name, ok, info) { console.log((ok ? 'OK   ' : 'FEHL ') + name + (info ? '  (' + info + ')' : '')); if (!ok) fehler++; }
const C = R.config.schaden, DT = 1 / 60;
const AUTO = R.carCatalog[0].fahrwerte;
const nah = (a, b) => Math.abs(a - b) < 1e-9;
const neu = (n, an) => {
  const autos = []; for (let i = 0; i < n; i++) autos.push({ vehicle: new R.Vehicle(AUTO) });
  return { autos, s: new R.Schaden(autos, { an }) };
};
/** Abklingzeit verstreichen lassen. */
const warte = (s, sek) => { for (let t = 0; t < sek - 1e-9; t += DT) s.schritt(DT); };

pruefe('config.schaden: Standard aus', C && C.standardAn === false);

// ---------- an = false: keinerlei Wirkung ----------
{
  const { autos, s } = neu(2, false), v = autos[0].vehicle, vMax = v.daten.vMax, d = v.daten;
  let summe = 0;
  for (let k = 0; k < 30; k++) { summe += s.treffer(0, 'hindernis', 10); s.treffer(1, 'bande', 20); warte(s, 1); }
  const z = s.zustand(0);
  pruefe('aus: treffer() zieht nichts ab, Zustand 100 %', summe === 0 && z.prozent === 100 && z.stufe === 0 && !z.liegengeblieben);
  pruefe('aus: Fahrwerte identisch (dasselbe Objekt, vMax gleich, keine datenBasis)', v.daten === d && v.daten.vMax === vMax && v.datenBasis === undefined);
  pruefe('aus: nie gesperrt', !s.gesperrt(0) && !s.gesperrt(1));
  pruefe('aus: meshBauen ohne Wirkung', s.meshBauen(0, {}) === null);
  const st = new R.Schaden([{ vehicle: new R.Vehicle(AUTO) }]);
  pruefe('ohne Option: Standard config (aus)', st.an === false);
}

// ---------- 20 Treffer → 0 %, Stufen und Faktoren ----------
{
  const { autos, s } = neu(1, true), v = autos[0].vehicle, b = Object.assign({}, v.daten);
  pruefe('an: datenBasis = Kopie der Original-Fahrwerte', v.datenBasis && v.datenBasis !== v.daten && v.datenBasis.vMax === b.vMax);
  const stufen = [];
  s.bei((e) => { if (e.art === 'stufe') stufen.push(e.stufe); });
  let ok = true;
  for (let k = 1; k <= 20; k++) {
    const verlust = s.treffer(0, 'hindernis', 4);
    const z = s.zustand(0), soll = 100 - 5 * k;
    if (verlust !== 5 || z.prozent !== soll || z.stufe !== Math.floor((100 - soll) / 20)) ok = false;
    if (k === 4) {   // 80 % → Stufe 1
      const f = R.Schaden.faktoren(1);
      pruefe('80 %: Stufe 1, vMax −4 %, Beschleunigung −6 %, Grip −3 %', z.stufe === 1 && nah(v.daten.vMax, b.vMax * 0.96) &&
        nah(v.daten.beschleunigung, b.beschleunigung * 0.94) && nah(v.daten.grip, b.grip * 0.97) && nah(f.vMax, 0.96),
        (v.daten.vMax * 3.6).toFixed(1) + ' km/h statt ' + (b.vMax * 3.6).toFixed(1));
      pruefe('Faktoren schreiben eine neue Objekt-Kopie (Bremsen/Masse unverändert)', v.daten !== v.datenBasis &&
        v.daten.bremsen === b.bremsen && v.daten.masse === b.masse);
    }
    if (k === 12) pruefe('40 %: Stufe 3 (vMax × 0,88)', z.stufe === 3 && nah(v.daten.vMax, b.vMax * 0.88) && z.rauch === 0, 'rauch ' + z.rauch);
    if (k === 13) pruefe('35 %: Rauch (< 40 %), kein Qualm', z.rauch > 0 && !z.qualm && !z.warnblinker);
    if (k === 17) pruefe('15 %: Qualm + Warnblinker (< 20 %)', z.qualm && z.warnblinker);
    if (k < 20) warte(s, 0.75);
  }
  const z = s.zustand(0);
  pruefe('20 Treffer à −5 % → 0 %, jeder Treffer genau −5', ok && z.prozent === 0, z.prozent + ' %');
  pruefe('Stufen 1…5 nacheinander gemeldet', stufen.join(',') === '1,2,3,4,5', stufen.join(','));
  pruefe('0 %: Stufe 5 (vMax × 0,80, Beschleunigung × 0,70, Grip × 0,85)', z.stufe === 5 && nah(v.daten.vMax, b.vMax * 0.8) &&
    nah(v.daten.beschleunigung, b.beschleunigung * 0.7) && nah(v.daten.grip, b.grip * 0.85));
  pruefe('0 %: liegengeblieben + gesperrt', z.liegengeblieben && s.gesperrt(0));
}

// ---------- Abklingzeit + Mindeststärke ----------
{
  const { s } = neu(2, true);
  s.treffer(0, 'bande', 5);
  const zweiter = s.treffer(0, 'bande', 8);
  // Runde 6: Bande kostet −3 % (config.schaden.verluste.bande)
  pruefe('Abklingzeit: zweiter Treffer direkt danach zählt nicht', zweiter === 0 && s.zustand(0).prozent === 97);
  warte(s, 0.5);
  pruefe('Abklingzeit: nach 0,5 s noch gesperrt', s.treffer(0, 'auto', 5) === 0);
  warte(s, 0.25);
  pruefe('Abklingzeit: nach 0,75 s zählt der nächste Treffer', s.treffer(0, 'auto', 5) === 5 && s.zustand(0).prozent === 92);
  pruefe('Abklingzeit gilt je Fahrzeug (Auto 2 sofort)', s.treffer(1, 'auto', 5) === 5);
  // Schleifen an der Bande (60 Schritte mit Stärke 4): höchstens alle 0,7 s ein Abzug
  const { s: s2 } = neu(1, true);
  for (let k = 0; k < 120; k++) { s2.treffer(0, 'bande', 4); s2.schritt(DT); }
  pruefe('Schleifen 2 s: höchstens 3 Abzüge (kein Dauerabzug)', s2.zustand(0).prozent >= 85, s2.zustand(0).prozent + ' %');
  const { s: s3 } = neu(1, true);
  pruefe('Bande unter 3 m/s zählt nicht', s3.treffer(0, 'bande', 2.9) === 0);
  // Runde 6 (W1-A4): Auto↔Auto schon ab 1 m/s (bisher 2)
  pruefe('Auto unter 1 m/s zählt nicht', s3.treffer(0, 'auto', 0.9) === 0);
  pruefe('Hindernis zählt immer (auch 0,1 m/s)', s3.treffer(0, 'hindernis', 0.1) === 5);
  { const { s: s5 } = neu(1, true); pruefe('Runde 6: Auto ab 1 m/s zählt (−5 %)', s5.treffer(0, 'auto', 1.0) === 5 && s5.zustand(0).prozent === 95); }
  warte(s3, 0.8);
  pruefe('Brand: −10 %', s3.treffer(0, 'brand', 1) === 10 && s3.zustand(0).prozent === 85);
  // stoesseAuswerten: Listen aus collisions/dynamik
  const { s: s4 } = neu(3, true);
  s4.stoesseAuswerten({ bande: [5, 0, 1], auto: [{ a: 1, b: 2, staerke: 3 }], hindernis: [], dynamik: [] });
  pruefe('stoesseAuswerten: Bande ≥ 3 (−3 %) + Auto-Stoß zählen für beide', s4.zustand(0).prozent === 97 && s4.zustand(1).prozent === 95 &&
    s4.zustand(2).prozent === 95);
  // Runde 6: Rempler mit Drehung +3 % (im selben Treffer), Pflanzen: Baum −3 %, Busch nichts
  const { s: s6 } = neu(4, true);
  s6.stoesseAuswerten({ auto: [{ a: 0, b: 1, staerke: 6, dreht: [false, true] }], pflanzen: [{ nr: 2, typ: 'baum', staerke: 8 }, { nr: 3, typ: 'busch', staerke: 5 }] });
  pruefe('Runde 6: Rempler −5 %, gedrehtes Auto −8 %', s6.zustand(0).prozent === 95 && s6.zustand(1).prozent === 92,
    s6.zustand(0).prozent + ' / ' + s6.zustand(1).prozent + ' %');
  pruefe('Runde 6: Baum −3 %, Busch kein Schaden', s6.zustand(2).prozent === 97 && s6.zustand(3).prozent === 100,
    s6.zustand(2).prozent + ' / ' + s6.zustand(3).prozent + ' %');
  const { s: s5 } = neu(1, true);
  s5.stoesseAuswerten({ hindernis: [{ nr: 0, typ: 'brand', staerke: 2 }] });
  pruefe('stoesseAuswerten: Hindernis-typ brand → −10 %', s5.zustand(0).prozent === 90);
}

// ---------- Liegengeblieben: 5 s gesperrt, dann Abschleppen mit 60 % ----------
{
  const { autos, s } = neu(2, true), v = autos[0].vehicle, b = Object.assign({}, v.datenBasis);
  const ereignisse = [];
  s.bei((e) => ereignisse.push(e.art + ':' + e.i));
  for (let k = 0; k < 20; k++) { s.treffer(0, 'hindernis', 5); warte(s, 0.72); }
  pruefe('Ereignis liegengeblieben genau einmal', ereignisse.filter(e => e === 'liegengeblieben:0').length === 1);
  const t0 = ereignisse.length;
  let gesperrt = 0, t = 0, eingefroren = true, trefferWaehrend = 0;
  while (s.gesperrt(0) && t < 10) {
    v.vLaengs = 3; v.vQuer = 1;                // jemand schiebt / Physik rollt weiter
    trefferWaehrend += s.treffer(0, 'hindernis', 5);
    s.schritt(DT); t += DT; gesperrt += DT;
    if (s.gesperrt(0) && (v.vLaengs !== 0 || v.vQuer !== 0)) eingefroren = false;
  }
  pruefe('gesperrt ≈ 5 s (abzüglich Wartezeit nach dem letzten Treffer)', Math.abs(gesperrt + 0.72 - C.liegenZeit) < 0.05, (gesperrt + 0.72).toFixed(2) + ' s');
  pruefe('während gesperrt: Tempo eingefroren (schritt setzt vLaengs/vQuer 0)', eingefroren);
  pruefe('während gesperrt: keine weiteren Treffer', trefferWaehrend === 0);
  const z = s.zustand(0);
  pruefe('Freigabe: 60 %, Stufe 2, nicht mehr liegengeblieben', !s.gesperrt(0) && z.prozent === 60 && z.stufe === 2 && !z.liegengeblieben);
  pruefe('Freigabe: Faktoren Stufe 2 (vMax × 0,92)', nah(v.daten.vMax, b.vMax * 0.92));
  pruefe('Ereignis abschleppen genau einmal (main.js setzt zurück)', ereignisse.slice(t0).filter(e => e === 'abschleppen:0').length === 1);
  pruefe('Ereignis abschleppwagen (Hälfte der Wartezeit) genau einmal, vor abschleppen', ereignisse.slice(t0).join(',') === 'abschleppwagen:0,stufe:0,abschleppen:0',
    ereignisse.slice(t0).join(','));
  pruefe('anderes Auto unberührt', s.zustand(1).prozent === 100 && !s.gesperrt(1));
  const { s: s6 } = neu(1, true);
  for (let k = 0; k < 20; k++) { s6.treffer(0, 'hindernis', 5); warte(s6, 0.72); }
  pruefe('liegengeblieben: Treffer zieht nichts mehr ab', s6.treffer(0, 'brand', 9) === 0);
  // zerstoeren: Fahrwerte zurück
  s.zerstoeren();
  pruefe('zerstoeren: Fahrwerte wieder Basis, datenBasis entfernt', nah(v.daten.vMax, b.vMax) && v.datenBasis === undefined);
}

// ---------- KI-Fahrzeug fährt mit Schaden langsamer (Physik nutzt vehicle.daten) ----------
{
  const { autos, s } = neu(2, true);
  for (let k = 0; k < 8; k++) { s.treffer(1, 'hindernis', 5); warte(s, 0.72); }   // 60 % → Stufe 2
  const [a, b] = autos.map(x => x.vehicle);
  a.setzen(0, 0, 0); b.setzen(10, 0, 0);
  for (let t = 0; t < 40; t += DT) { a.schritt(DT, { gas: 1 }); b.schritt(DT, { gas: 1 }); }
  pruefe('Vollgas 40 s: beschädigtes Auto langsamer (vMax −8 %)', b.vLaengs < a.vLaengs * 0.93 && b.vLaengs > a.vLaengs * 0.88,
    (a.vLaengs * 3.6).toFixed(0) + ' vs ' + (b.vLaengs * 3.6).toFixed(0) + ' km/h');
}

if (typeof THREE === 'undefined') console.log('(Partikel/Warnblinker: ohne THREE übersprungen – siehe tests/schaden_screenshot.py)');
console.log(fehler ? `\n${fehler} FEHLER` : '\nALLE TESTS OK');
process.exit(fehler ? 1 : 0);
