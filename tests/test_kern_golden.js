// K1 – Golden-Tests: Fingerabdrücke gegen gespeicherte Werte in tests/golden/*.json
//   node tests/test_kern_golden.js                      prüft Strecken-Geometrie (Autorennen + Motorrad, je Strecke + Welt), Fahrphysik (Auto + Motorrad) und die Radwelt-Referenz (nur Aufbau)
//   node tests/test_kern_golden.js --neu                schreibt die Referenzen für Autorennen/Motorrad NEU (nur nach bewusster Änderung! Begründung ins VERLAUF_KERN.md)
//   node tests/test_kern_golden.js --radwelt <pfad>     berechnet die Radwelt-Strecken (Alpen, Wiese, Wald, Mega + 2 Baukasten-Beispiele, window.RADWELT) aus dem Radwelt-Repo <pfad>
//                                                       und speichert sie als Referenz tests/golden/radwelt.json (Referenz, falls die Radwelt-Strecken je angefasst werden)
//   node tests/test_kern_golden.js --radwelt-pruefen <pfad>   rechnet die Radwelt-Strecken aus <pfad> und vergleicht mit radwelt.json
//   Optionen: --nur strecken|physik|radwelt   nur diesen Teil
// Fingerabdruck = SHA-1 über alle Zahlen mit voller Genauigkeit; Rot = die Geometrie/Physik hat sich verändert: nicht einspielen, bis geklärt (Plan Schutzregel 4).
'use strict';
const fs = require('fs');
const path = require('path');
const { ladeSpiel, laden, listeAusHtml, WURZEL } = require('./kern_lader');
const F = require('./kern_fingerabdruck');

const GOLDEN = path.join(__dirname, 'golden');
const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const wert = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
const NEU = flag('--neu');
const NUR = wert('--nur');
const nurTeil = (t) => !NUR || NUR === t;
let fehler = 0, ok = 0;
setTimeout(() => { console.log('FEHL Wächter: Test hängt (> 600 s)'); process.exit(3); }, 600000).unref();
function pruefe(name, gut, info) { console.log((gut ? 'OK   ' : 'FEHL ') + name + (info !== undefined && info !== '' ? '  (' + info + ')' : '')); if (gut) ok++; else fehler++; }
const lesen = (n) => { try { return JSON.parse(fs.readFileSync(path.join(GOLDEN, n), 'utf8')); } catch (e) { return null; } };
const schreiben = (n, o) => { fs.mkdirSync(GOLDEN, { recursive: true }); fs.writeFileSync(path.join(GOLDEN, n), JSON.stringify(o, null, 1) + '\n'); console.log('geschrieben: tests/golden/' + n); };

/** Vergleich Ist gegen Referenz: eine Zeile je Gruppe, bei FEHL die ersten Unterschiede. */
function vergleiche(gruppe, ref, ist) {
  if (!ref) { pruefe(gruppe + ': Referenz vorhanden', false, 'tests/golden fehlt – erst mit --neu erzeugen'); return; }
  const schluessel = new Set(Object.keys(ref).concat(Object.keys(ist)));
  const schlecht = [];
  schluessel.forEach((k) => { const u = F.unterschiede(ref[k], ist[k], ''); if (u.length) schlecht.push(k + ' → ' + u.slice(0, 3).join('; ')); });
  pruefe(gruppe + ': ' + Object.keys(ist).length + ' Einträge gleich der Referenz', !schlecht.length, schlecht.length ? schlecht.length + ' weichen ab' : '');
  schlecht.slice(0, 12).forEach((s) => console.log('        ' + s));
}

// ------------------------------------------------------------------ Strecken (Autorennen / Motorrad)
/** Alle Strecken × Welten (+ Varianten) mit den Standard-Optionen des Spiels (Spaß-Elemente + Fahr-Zauber an wie im Spiel). Teure Meshes: nicht für jede Welt der schweren Strecken. */
function streckenFingerabdruecke(R) {
  const erg = {};
  for (const daten of R.trackCatalog) {
    const welten = daten.welten ? Object.keys(daten.welten) : [''];
    const schwer = daten.id === 'alpen' || daten.id === 'mega';
    const std = R.Strecke.weltName ? R.Strecke.weltName(daten, '') : daten.weltStandard;
    for (const w of welten) {
      const mesh = !schwer || w === std || w === 'klassisch';
      erg[daten.id + '|' + (w || '-')] = F.strecke(R, daten, { welt: w || undefined, variante: '', hindernisMenge: 'normal', spass: true, zauber: true }, { bauen: mesh, deko: w === std || w === '' });
    }
    for (const v of Object.keys(daten.varianten || {})) {
      erg[daten.id + '|variante:' + v] = F.strecke(R, daten, { welt: std, variante: v, hindernisMenge: 'normal', spass: true, zauber: true }, { bauen: !schwer });
    }
  }
  return erg;
}

// ------------------------------------------------------------------ Physik (Auto / Motorrad)
function physikFingerabdruecke() {
  const S = require('../server/simulation');
  const erg = { auto: { vehicle: {}, simulation: {} }, motorrad: { vehicle: {}, simulation: {} } };
  const Ra = S.laden(), Rm = S.ladenMoto();
  for (const a of Ra.carCatalog.waehlbare()) for (const tk of ['normal', 'schnell']) erg.auto.vehicle[a.id + '|' + tk] = F.vehicleFahrt(Ra, a.fahrwerte, tk);
  for (const a of Rm.carCatalog.waehlbare()) for (const tk of ['normal', 'schnell']) erg.motorrad.vehicle[a.id + '|' + tk] = F.vehicleFahrt(Rm, a.fahrwerte, tk);
  for (const [auto, strecke] of [['troc-cabrio', 'wiese'], ['passat', 'alpen'], ['porsche-911', 'wald']]) erg.auto.simulation[auto + '|' + strecke] = F.simulationsFahrt(S, false, auto, strecke, 1200);
  for (const [moto, strecke] of [['superbike', 'wiese'], ['crossmaschine', 'wald'], ['quad', 'wueste'], ['chopper', 'wiese']]) erg.motorrad.simulation[moto + '|' + strecke] = F.simulationsFahrt(S, true, moto, strecke, 1200);
  return erg;
}

// ------------------------------------------------------------------ Radwelt
const RAD_BAUKASTEN = [
  { name: 'baukasten-rund-wiese', p: { km: 12, anstiege: 3, hm: 250, maxSteig: 8, art: 'rund', seed: 4242, thema: 'wiese' } },
  { name: 'baukasten-ab-wald', p: { km: 8, anstiege: 2, hm: 120, maxSteig: 6, art: 'ab', seed: 777, thema: 'wald' } },
];
/** Radwelt-Strecken aus einem Ordner mit Radwelt.html (Radwelt-Repo). */
function radweltFingerabdruecke(basis) {
  let liste;
  if (fs.existsSync(path.join(basis, 'Radwelt.html'))) liste = listeAusHtml(path.join(basis, 'Radwelt.html'));
  else { const sp = require('./kern_lader').spieleLesen().radwelt; liste = (sp && sp.module || []).filter((m) => typeof m === 'string'); }
  if (!liste.length) throw new Error('Keine Radwelt-Modulliste gefunden in ' + basis);
  const { R, fehl } = laden(basis, liste, { RADWELT: true });
  const echt = fehl.filter((f) => !/src\/rad\/main\.js/.test(f));      // src/rad/main.js startet im Browser die Oberfläche; ohne Browser darf es abbrechen
  if (echt.length) throw new Error('Radwelt-Module: ' + echt.join(' | '));
  const erg = {};
  const bau = (daten) => {
    const opt = { welt: R.Strecke.weltName ? R.Strecke.weltName(daten, 'klassisch') : undefined, variante: '', hindernisMenge: 'normal' };
    return F.strecke(R, daten, opt, { bauen: true, deko: true });
  };
  for (const id of ['alpen', 'wiese', 'wald', 'mega']) {
    const d = R.trackCatalog.find((t) => t.id === id);
    if (!d) throw new Error('Radwelt-Strecke fehlt im Katalog: ' + id);
    erg[id] = bau(d);
  }
  for (const b of RAD_BAUKASTEN) {
    const r = R.RadStreckenBau.bauen(b.p);
    if (!r.ok) throw new Error('Baukasten ' + b.name + ' nicht baubar: ' + r.hinweis);
    erg[b.name] = Object.assign(bau(r.daten), { kennzahlen: F.hash(F.json(r.kennzahlen || {}), 16) });
  }
  // Selbsttest: zweiter Durchlauf der kleinsten Strecke muss denselben Fingerabdruck liefern (sonst taugt die Referenz nichts)
  const nochmal = bau(R.trackCatalog.find((t) => t.id === 'wald'));
  const unterschied = F.unterschiede(erg.wald, nochmal);
  if (unterschied.length) throw new Error('Radwelt-Fingerabdruck nicht reproduzierbar: ' + unterschied.join('; '));
  return erg;
}

// ================================================================== Ablauf
function strecken(spielId, flags, datei) {
  const t0 = Date.now();
  const { R, fehl } = ladeSpiel(spielId, flags);
  pruefe('Strecken ' + (flags && flags.MOTORRAD ? 'Motorrad' : 'Autorennen') + ': Module laden ohne Fehler', !fehl.length, fehl.join(' | '));
  const ist = streckenFingerabdruecke(R);
  if (NEU) { schreiben(datei, ist); return; }
  vergleiche('Strecken ' + (flags && flags.MOTORRAD ? 'Motorrad' : 'Autorennen'), lesen(datei), ist);
  console.log('      (' + ((Date.now() - t0) / 1000).toFixed(1) + ' s)');
}

if (nurTeil('strecken')) {
  strecken('autorennen', {}, 'strecken_autorennen.json');
  strecken('motorrad', { MOTORRAD: true }, 'strecken_motorrad.json');
}
if (nurTeil('physik')) {
  const t0 = Date.now();
  const ist = physikFingerabdruecke();
  if (NEU) schreiben('physik.json', ist);
  else {
    const ref = lesen('physik.json');
    vergleiche('Physik Auto (Vehicle + Simulation)', ref && ref.auto, ist.auto);
    vergleiche('Physik Motorrad (Vehicle + Simulation)', ref && ref.motorrad, ist.motorrad);
    console.log('      (' + ((Date.now() - t0) / 1000).toFixed(1) + ' s)');
  }
}
if (flag('--radwelt')) {
  const pfad = path.resolve(wert('--radwelt') || '/home/claude/radwelt');
  const ist = radweltFingerabdruecke(pfad);
  let commit = '';
  try { commit = require('child_process').execSync('git -C "' + pfad + '" rev-parse --short HEAD', { encoding: 'utf8' }).trim(); } catch (e) { /* kein git */ }
  schreiben('radwelt.json', { _quelle: { pfad, commit, erzeugt: new Date().toISOString().slice(0, 10), hinweis: 'Referenz der Radwelt-Strecken (Radwelt bleibt eigenes Repo); prüfen: node tests/test_kern_golden.js --radwelt-pruefen <pfad>' }, strecken: ist });
  pruefe('Radwelt-Referenz erzeugt (' + Object.keys(ist).length + ' Strecken: ' + Object.keys(ist).join(', ') + ')', true);
} else if (flag('--radwelt-pruefen')) {
  const pfad = path.resolve(wert('--radwelt-pruefen') || '.');
  const ref = lesen('radwelt.json');
  vergleiche('Radwelt-Strecken (' + pfad + ')', ref && ref.strecken, radweltFingerabdruecke(pfad));
} else if (nurTeil('radwelt')) {
  const ref = lesen('radwelt.json');
  const soll = ['alpen', 'wiese', 'wald', 'mega'].concat(RAD_BAUKASTEN.map((b) => b.name));
  pruefe('Radwelt-Referenz tests/golden/radwelt.json vorhanden (Alpen, Wiese, Wald, Mega, Baukasten)', !!ref && soll.every((k) => ref.strecken && ref.strecken[k] && ref.strecken[k].spline && ref.strecken[k].bauen), ref ? '' : 'fehlt – node tests/test_kern_golden.js --radwelt /home/claude/radwelt');
}

console.log(fehler ? '\n' + fehler + ' FEHL, ' + ok + ' OK' : '\nalle ' + ok + ' OK, 0 FEHL');
process.exit(fehler ? 1 : 0);
