// Node-Test Stufe S8 „Reste“: node tests/test_spass_s8.js
// A) KI-Motorräder gemischt (Schwierigkeit, Quad, Server=Client, Schalter „aus“ = nur Cross)
// B) Schlamm/Wasser/Kisten auf normalen Motorrad-Strecken (Plan, Sperrzonen, deterministisch, Lauf)
// C) eigene Strecke online (Server prüft Code, baut deterministisch; Müll abgelehnt; alter Stand ohne Feld)
// D) Teleport-Interpolation (kein Gleiten), Online-Effekte (Quad-Wackeln/Knall/Funken aus Zustandsdaten), Garage „Upgrades + Tuning = gesamt“
const fs = require('fs');
const S = require('../server/simulation');
let fehler = 0, anzahl = 0;
function pruefe(name, ok, info) { anzahl++; console.log((ok ? 'OK   ' : 'FEHL ') + name + (info !== undefined && info !== '' ? '  (' + info + ')' : '')); if (!ok) fehler++; }
const RM = S.ladenMoto();
const flotte = (id, sw, seed, extra) => new S.Simulation({ einstellungen: Object.assign({ streckeId: id, gegner: 5, runden: 1, schwierigkeit: sw, spass: true, zufall: true, unfall: 'aus' }, extra || {}), spieler: [], seed, moto: true });
const typen = (sim) => sim.sim.fahrzeuge.map((f) => f.auto.id);

// ---------- A) KI-Mischung ----------
const alle = {};
const ART = (t) => t.replace(/^crossmaschine.*/, 'cross');       // Farbvarianten der Crossmaschine zusammenfassen
const strecken = RM.trackCatalog.filter((t) => !t.eigen && !/stuntpark|mega/.test(t.id)).map((t) => t.id);    // das Gegner-Feld hängt von Strecke/Anzahl/Spielern ab (nicht vom Sim-Seed)
['leicht', 'mittel', 'profi'].forEach((sw) => { alle[sw] = {}; strecken.forEach((id) => typen(flotte(id, sw, 1)).forEach((t) => { t = ART(t); alle[sw][t] = (alle[sw][t] || 0) + 1; })); });
const neu = ['superbike', 'roller', 'chopper', 'quad'];
pruefe('A KI-Feld gemischt: alle vier neuen Typen kommen vor', neu.every((t) => ['leicht', 'mittel', 'profi'].some((sw) => alle[sw][t] > 0)), JSON.stringify(alle));
pruefe('A leicht: mehr Roller/Quad als profi; profi: mehr Superbikes als leicht', (alle.leicht.roller || 0) + (alle.leicht.quad || 0) > (alle.profi.roller || 0) + (alle.profi.quad || 0) && (alle.profi.superbike || 0) > (alle.leicht.superbike || 0));
pruefe('A Crossmaschinen bleiben in jedem Feld dabei', ['leicht', 'mittel', 'profi'].every((sw) => (alle[sw].cross || 0) > 0));
const a1 = typen(flotte('alpen', 'mittel', 7)), a2 = typen(flotte('alpen', 'mittel', 7)), a3 = typen(flotte('wiese', 'mittel', 7));
pruefe('A Server=Client: gleiche Einstellungen + Seed → gleiches Feld (zwei Simulationen, zwei Kontexte)', a1.join() === a2.join() && a1.join() !== a3.join(), a1.join());
const R2 = S.laden(), k2 = RM.carCatalog.gegnerAutos(5, { seed: 7, spielerIds: [], schwierigkeit: 'mittel' }).map((a) => a.id), k3 = RM.carCatalog.gegnerAutos(5, { seed: 7, spielerIds: [], schwierigkeit: 'mittel' }).map((a) => a.id);
pruefe('A gegnerAutos ist rein (kein Zufall außer Seed)', k2.join() === k3.join());
RM.config.motoGegnerGemischt = false;
const nur = RM.carCatalog.gegnerAutos(5, { seed: 7, spielerIds: [], schwierigkeit: 'leicht' }).map((a) => a.id);
pruefe('A Schalter „aus“ → nur Crossmaschinen (alter Stand)', nur.every((t) => /^crossmaschine/.test(t)), nur.join());
RM.config.motoGegnerGemischt = true;
pruefe('A Quad-Regeln: Quad kippt nie, andere kippen', RM.Moto.typen.kippt('quad') === false && RM.Moto.typen.kippt('superbike') === true);

// ---------- B) Schlamm/Wasser/Kisten ----------
const ids = RM.trackCatalog.filter((t) => !t.eigen && !/stuntpark|mega/.test(t.id)).map((t) => t.id);
let mitPlan = 0, ueberlappt = 0, platz = 0;
const plaene = {};
ids.forEach((id) => {
  const p = flotte(id, 'mittel', 5).sim.strecke, s8 = p.spass && p.spass.s8, p2 = flotte(id, 'mittel', 5).sim.strecke.spass.s8;
  plaene[id] = s8;
  if (s8 && (s8.felder.length || s8.kisten.length)) mitPlan++;
  if (JSON.stringify(s8) !== JSON.stringify(p2)) ueberlappt++;
  if (s8) { const fs_ = s8.felder.slice().sort((a, b) => a.s0 - b.s0); for (let i = 1; i < fs_.length; i++) if (fs_[i].s0 < fs_[i - 1].s0 + fs_[i - 1].laenge) platz++; }
});
pruefe('B Mehrere normale Strecken bekommen Schlamm/Wasser/Kisten (' + mitPlan + ' von ' + ids.length + ')', mitPlan >= Math.min(3, ids.length));
pruefe('B Plan deterministisch (zweimal gebaut = gleich) und Felder überlappen nicht', ueberlappt === 0 && platz === 0, 'verschieden ' + ueberlappt + ', überlappend ' + platz);
const stunt = RM.trackCatalog.find((t) => /stuntpark/.test(t.id));
if (stunt) { const sp = flotte(stunt.id, 'mittel', 5, { gegner: 0 }).sim.strecke; pruefe('B Stunt-Park bekommt keine S8-Felder (hat eigene)', !sp.spass || !sp.spass.s8 || (!sp.spass.s8.felder.length && !sp.spass.s8.kisten.length)); }
const sperr = Object.keys(plaene).every((id) => { const p = plaene[id]; if (!p) return true; const z = (RM.trackCatalog.find((t) => t.id === id) || {}); return p.felder.every((f) => f.laenge > 0 && f.s0 >= 0); });
pruefe('B Felder liegen auf der Strecke (Länge > 0, s ≥ 0)', sperr);
const l1 = flotte('wiese', 'mittel', 5), l2 = flotte('wiese', 'mittel', 5);
let h1 = 0, h2 = 0; l1.sim.s8Ereignis = () => { h1++; }; l2.sim.s8Ereignis = () => { h2++; };
for (let i = 0; i < 60 * 40; i++) { l1.schritt(); l2.schritt(); l1.abholen(); l2.abholen(); }
const pos = (s) => s.sim.fahrzeuge.map((f) => f.vehicle.x.toFixed(6) + ',' + f.vehicle.z.toFixed(6)).join(';');
pruefe('B Lauf 40 s: zwei Simulationen bitgleich (Schlamm/Wasser/Kisten wirken im Server)', pos(l1) === pos(l2) && h1 === h2, 'Kistentreffer ' + h1);

// ---------- C) eigene Strecke online ----------
const E = RM.Editor, kreis = (rad, n) => { const o = []; n = n || 120; for (let i = 0; i <= n; i++) { const t = i / n * 2 * Math.PI; o.push([rad * Math.cos(t) * (1 + 0.25 * Math.sin(2 * t)), rad * Math.sin(t)]); } return o; };
const v = E.verarbeiten(kreis(320)), d = v.ok ? E.neu(v.pkt, 'Test S8', 'wiese') : null;
pruefe('C Editor-Strecke gebaut', !!d);
if (d) {
  const code = E.code(d), p = S.eigenPruefen(code);
  pruefe('C Server prüft den Code (eigenPruefen)', !!p && p.name === 'Test S8', JSON.stringify(p));
  const e1 = S.einstellungenPruefen({ eigen: code, streckeId: 'wiese', spass: true }, 2, true), e2 = S.einstellungenPruefen({ eigen: code, streckeId: 'wiese', spass: true }, 2, true);
  pruefe('C einstellungenPruefen: eigene Strecke gewählt, gleiche id bei jedem Aufruf (Hash der Punkte)', e1.eigen === code && /^eigen-/.test(e1.streckeId) && e1.streckeId === e2.streckeId, e1.streckeId);
  const sim = new S.Simulation({ einstellungen: Object.assign({}, e1, { gegner: 3 }), spieler: [], seed: 3, moto: true });
  for (let i = 0; i < 600; i++) { sim.schritt(); sim.abholen(); }
  pruefe('C Rennen auf eigener Strecke läuft (Fahrzeuge bewegen sich, keine NaN)', sim.sim.fahrzeuge.every((f) => Number.isFinite(f.vehicle.x) && Number.isFinite(f.vehicle.z)) && sim.sim.fahrzeuge.some((f) => f.vehicle.vLaengs > 5));
  const b1 = [S.eigenPruefen('STRECKE1.müll'), S.eigenPruefen(''), S.eigenPruefen(5), S.eigenPruefen('x'.repeat(S.EIGEN_CODE_MAX + 1))];
  pruefe('C Müll/zu langer Code wird abgelehnt, kein Absturz', b1.every((x) => x === null));
  const e3 = S.einstellungenPruefen({ eigen: 'STRECKE1.müll', streckeId: 'wiese' }, 2, true);
  pruefe('C ungültiger Code → normale Streckenwahl, Feld „eigen“ fehlt (bitgleich alter Stand)', !('eigen' in e3) && e3.streckeId === 'wiese');
  const e4 = S.einstellungenPruefen({ streckeId: 'wiese' }, 2, true);
  pruefe('C ohne eigen: kein Feld eigen', !('eigen' in e4));
}
const srv = fs.readFileSync(__dirname + '/../server/server.js', 'utf8');
pruefe('C Server: Nachricht „strecke“ nur vom Host, Teile begrenzt', /case 'strecke'/.test(srv) && /istHost|host/.test(srv.slice(srv.indexOf("case 'strecke'"), srv.indexOf("case 'strecke'") + 800)));

// ---------- D) Teleport, Online-Effekte, Garage ----------
const CM = S.kontextLaden(S.MODULE.concat(['src/net/vorhersage.js']), { MOTORRAD: true }), NP = CM.NetzPuffer;
if (NP && NP.interpolieren) {
  const mk = (x, z, rs) => { const a = new Array(15).fill(0); a[0] = x; a[1] = z; a[13] = rs || 0; return a; };
  const vv = {}; NP.interpolieren(mk(0, 0), mk(128, 0), 0.5, vv);
  pruefe('D Teleport (128 m Sprung): kein Gleiten, sofort am Ziel', vv.x === 128, vv.x);
  NP.interpolieren(mk(0, 0), mk(3, 0), 0.5, vv);
  pruefe('D normale Bewegung (3 m): wird weiterhin interpoliert', Math.abs(vv.x - 1.5) < 1e-9, vv.x);
  NP.interpolieren(mk(0, 0), mk(45, 0), 0.5, vv);
  pruefe('D 45 m (Paketverlust bei hohem Tempo): kein Teleport, wird interpoliert', Math.abs(vv.x - 22.5) < 1e-9, vv.x);
} else pruefe('D NetzPuffer.interpolieren im Server-Kontext', false, 'fehlt');
const m3 = fs.readFileSync(__dirname + '/../src/moto/motoM3Start.js', 'utf8');
pruefe('D Online-Effekte (Quad-Wackeln, Knall, Funken) für fremde Fahrer aus Zustandsdaten (nur Anzeige, keine Physik)', /onlineEffekte/.test(m3) && /quadDrop/.test(m3) && /rutschFunken/.test(m3) && /spiel\.online/.test(m3) && !/physikSchritt/.test(m3.slice(m3.indexOf('function onlineEffekte'), m3.indexOf('function onlineEffekte') + 3000)));
const tui = fs.readFileSync(__dirname + '/../src/spass/spassTuningUI.js', 'utf8');
pruefe('D Garage: Tuning-Schritt zeigt „Upgrades + Tuning = gesamt“, alte Upgrades bleiben (R.Garage.upgradeKaufen da)', /Upgrades \+\$\{u\}/.test(tui) && /gesamt \+/.test(tui));
const gar = fs.readFileSync(__dirname + '/../src/ui/garage.js', 'utf8');
pruefe('D alte Garage-Upgrades nicht entfernt', /upgradeKaufen/.test(gar) && /upgradePreise/.test(fs.readFileSync(__dirname + '/../src/config.js', 'utf8')));

console.log(`\n${anzahl - fehler}/${anzahl} Prüfungen bestanden`);
process.exit(fehler ? 1 : 0);
