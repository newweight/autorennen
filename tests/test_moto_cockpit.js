// Node-Test Motorrad-Cockpit (M2d): node tests/test_moto_cockpit.js
// Prüft die reinen Funktionen von src/moto/cockpitMoto.js ohne Browser:
//   1. Spiegel-Blickrichtung: links schaut nach hinten-links, rechts nach hinten-rechts (Vorzeichen bei jeder Fahrtrichtung), Winkel zur Rückrichtung = config
//   2. Spiegel-Kameralage: links liegt links der Mitte, rechts rechts (seitlich, ein Stück vor der Mitte)
//   3. Lenker-/Spiegel-Rechtecke: Cockpit-Ansicht in vielen Fenstergrößen, solo und zu zweit, mit Minimap als Hindernis: alles im Bild, nichts überlappt sich
//      (Spiegel / Spiegel, Spiegel / Minimap, Lenker / Minimap); Verfolger-Ansicht: beide Spiegel teilen sich den Platz des einen Autorennen-Spiegels
//   4. Takt: je Bild höchstens ein Spiegel neu; Aufnahmen je Bild im Mittel wie der eine Spiegel des Autorennens (solo und zu zweit)
//   5. Auflösung/Kosten: Bildpunkte je Bild kleiner als beim einen Autorennen-Spiegel
//   6. Kamera-Kippung = 50 % der Schräglage; im Purzelbaum fällt sie weg
//   7. Autorennen-Config bleibt unberührt (Motorrad-Stile gibt es nicht, Auto-Cockpit nie für Motorräder)
const S = require('../server/simulation.js');
let fehler = 0, anzahl = 0;
function pruefe(name, ok, info) { anzahl++; console.log((ok ? 'OK   ' : 'FEHL ') + name + (info !== undefined && info !== '' ? '  (' + info + ')' : '')); if (!ok) fehler++; }
const nah = (a, b, tol) => Math.abs(a - b) <= (tol === undefined ? 1e-9 : tol);

const bisMega = S.MODULE.indexOf('src/track/megastrecke.js');
const BASIS = S.MODULE.slice(0, bisMega + 1).filter((m) => m !== 'vendor/three.min.js' && m !== 'src/main.js');
const R = S.kontextLaden(['tests/moto_flag.js'].concat(BASIS, ['src/moto/motoKatalog.js', 'src/moto/schraeglage.js', 'src/moto/cockpitMoto.js']));
const C = R.Moto.cockpit, cfg = R.config.motoCockpit, sp = R.config.cockpit.spiegel;
const dot = (a, b) => a.dx * b.dx + a.dz * b.dz;
const grad = (r) => r * 180 / Math.PI;

// ---------- 1. Blickrichtung ----------
let ok1 = true, ok1b = true, ok1c = true, fall = '';
for (const hd of [0, 0.7, -2.1, 3.0, 1.57, -1.57, 3.14, 5.5]) {
  const L = C.spiegelRichtung(hd, -1), Rr = C.spiegelRichtung(hd, +1);
  const hinten = L.hinten, links = L.links;
  if (!(dot(L, hinten) > 0 && dot(L, links) > 0)) { ok1 = false; fall = 'links hd=' + hd; }
  if (!(dot(Rr, hinten) > 0 && dot(Rr, links) < 0)) { ok1 = false; fall = 'rechts hd=' + hd; }
  const a = (v) => grad(Math.acos(Math.max(-1, Math.min(1, dot(v, hinten)))));
  if (!nah(a(L), cfg.spiegel.winkel, 1e-6) || !nah(a(Rr), cfg.spiegel.winkel, 1e-6)) ok1b = false;
  // nach vorn (Fahrtrichtung) zeigt kein Spiegel
  const vor = { dx: -Math.sin(hd), dz: -Math.cos(hd) };
  if (dot(L, vor) >= 0 || dot(Rr, vor) >= 0) ok1c = false;
  // Länge 1
  if (!nah(Math.hypot(L.dx, L.dz), 1, 1e-9)) ok1c = false;
}
pruefe('Spiegel links schaut hinten-links, rechts hinten-rechts (8 Fahrtrichtungen)', ok1, fall);
pruefe(`Blickrichtung weicht genau ${cfg.spiegel.winkel}° von „genau hinten“ ab`, ok1b);
pruefe('kein Spiegel schaut nach vorn; Richtungsvektoren haben Länge 1', ok1c);
{ const a = C.spiegelRichtung(0, -1), b = C.spiegelRichtung(0, +1); pruefe('Heading 0: links = (−sin w, +cos w), rechts = (+sin w, +cos w) (Fahrt nach −z, Blick nach +z)', nah(a.dx, -Math.sin(cfg.spiegel.winkel * Math.PI / 180), 1e-9) && a.dz > 0 && nah(b.dx, -a.dx, 1e-9) && b.dz > 0); }

// ---------- 2. Kameralage ----------
let ok2 = true;
for (const hd of [0, 0.7, -2.1, 3.0]) {
  const links = C.spiegelRichtung(hd, -1).links, vorn = { dx: -Math.sin(hd), dz: -Math.cos(hd) };
  const pl = C.spiegelPosition(10, 20, hd, -1), pr = C.spiegelPosition(10, 20, hd, +1);
  const dl = { dx: pl.x - 10, dz: pl.z - 20 }, dr = { dx: pr.x - 10, dz: pr.z - 20 };
  if (!(dot(dl, links) > 0 && dot(dr, links) < 0)) ok2 = false;                                   // links liegt links, rechts rechts
  if (!(nah(dot(dl, links), cfg.spiegel.seitlich, 1e-9) && nah(dot(dr, links), -cfg.spiegel.seitlich, 1e-9))) ok2 = false;
  if (!(nah(dot(dl, vorn), cfg.spiegel.vor, 1e-9) && nah(dot(dr, vorn), cfg.spiegel.vor, 1e-9))) ok2 = false;
}
pruefe(`Spiegel-Kameras sitzen ${cfg.spiegel.seitlich} m seitlich (links links, rechts rechts) und ${cfg.spiegel.vor} m vor der Mitte`, ok2);

// ---------- 3. Rechtecke ----------
const MINI = (vh) => ({ x: 22, y: vh - 22 - 164, b: 164, h: 164 });                      // Minimap: 164 px links unten
const schnitt = (a, b) => Math.min(a.x + a.b, b.x + b.b) - Math.max(a.x, b.x) > 0.5 && Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) > 0.5;
const innen = (r, vw, vh) => r.x >= -0.5 && r.y >= -0.5 && r.x + r.b <= vw + 0.5 && r.y + r.h <= vh + 0.5;
const GROESSEN = [[1280, 800, false], [1920, 1080, false], [844, 390, false], [667, 375, false], [1024, 768, false], [640, 800, true], [960, 1080, true], [422, 390, true], [500, 375, true]];
let bad3 = [];
for (const [vw, vh, split] of GROESSEN) {
  const rs = C.rechtecke(vw, vh, true, null, [MINI(vh)]);
  const [l, r] = rs.spiegel, lk = rs.lenker, tag = `${vw}x${vh}${split ? ' (zwei)' : ''}`;
  if (!(innen(l, vw, vh) && innen(r, vw, vh) && innen(lk, vw, vh))) bad3.push(tag + ': nicht im Bild');
  if (schnitt(l, r)) bad3.push(tag + ': Spiegel überlappen');
  if (schnitt(l, MINI(vh)) || schnitt(r, MINI(vh))) bad3.push(tag + ': Spiegel auf der Minimap');
  if (schnitt(lk, MINI(vh))) bad3.push(tag + ': Lenker auf der Minimap');
  if (!(l.x + l.b < r.x)) bad3.push(tag + ': Seiten vertauscht');
  if (lk.h > vh * cfg.lenker.maxHoehe + 0.5) bad3.push(tag + ': Lenker zu hoch');
  // Mitte des Lenkers: nur verschoben, wenn die Minimap sonst im Weg wäre
  if (lk.b < 40) bad3.push(tag + ': Lenker zu schmal ' + Math.round(lk.b));
}
pruefe(`Cockpit-Ansicht, ${GROESSEN.length} Fenstergrößen (solo/zu zweit): alles im Bild, Spiegel/Lenker nie auf der Minimap, Spiegel nicht aufeinander`, bad3.length === 0, bad3.slice(0, 3).join('; '));
{ const z = C.rechtecke(640, 800, true, null, null, true), e = C.rechtecke(640, 800, true, null, null, false);
  pruefe(`Zweispieler: Lenker-Bild breiter als solo bei gleicher Ansichtsbreite (${Math.round(z.lenker.b)} gegen ${Math.round(e.lenker.b)} px), höchstens ${cfg.lenker.maxHoehe * 100} % der Höhe`, z.lenker.b > e.lenker.b * 1.3 && z.lenker.h <= 800 * cfg.lenker.maxHoehe + 0.5 && z.lenker.x >= 0 && z.lenker.x + z.lenker.b <= 640); }
{ const rs = C.rechtecke(1280, 800, true, null, null); pruefe('ohne Hindernisse sitzt der Lenker mittig, unten, Spiegel symmetrisch', nah(rs.lenker.x + rs.lenker.b / 2, 640, 0.5) && nah(rs.lenker.y + rs.lenker.h, 800, 0.5) && nah(rs.spiegel[0].x + rs.spiegel[0].b / 2 + rs.spiegel[1].x + rs.spiegel[1].b / 2, 1280, 0.5)); }
{ const basis = { x: 480, y: 6, b: 320, h: 68 }, rs = C.rechtecke(1280, 800, false, basis);
  const [l, r] = rs.spiegel;
  pruefe('Verfolger-/Weit-Ansicht: zwei Spiegel teilen sich den Platz des einen (oben Mitte), kein Lenker', rs.lenker === null && l.x >= basis.x - 0.01 && r.x + r.b <= basis.x + basis.b + 0.01 && !schnitt(l, r) && l.y === basis.y && l.h === basis.h && r.h === basis.h && l.b > 100); }

// ---------- 4. Takt ----------
function takttest(nSp, T) {
  const off = C.taktPlan(nSp, T); let pro = new Array(nSp).fill(0), maxJe = 0, summe = 0;
  const N = T * 16;
  for (let z = 1; z <= N; z++) { let je = 0; off.forEach((o, k) => { if (C.faellig(z, T, o)) { pro[k]++; je++; } }); maxJe = Math.max(maxJe, je); summe += je; }
  return { off, pro, maxJe, mittel: summe / N };
}
for (const [nSp, T, bezug, name] of [[2, 4, 0.5, 'solo'], [4, 8, 0.5, 'zu zweit']]) {
  const t = takttest(nSp, T);
  pruefe(`Takt ${name}: ${nSp} Spiegel, alle ${T} Bilder je Spiegel, höchstens 1 Aufnahme je Bild`, t.maxJe <= 1 && t.pro.every((n) => n === 16), `Versatz ${t.off.join('/')}`);
  pruefe(`Takt ${name}: im Mittel ${t.mittel} Aufnahmen je Bild = wie der eine Autorennen-Spiegel (${bezug})`, nah(t.mittel, bezug, 1e-9));
}
{ const solo = C.taktFuer(false, 0, 1), zwei = C.taktFuer(true, 0, 2), langsam = C.taktFuer(false, 2, 1);
  pruefe(`Aufnahmen je Bild: solo ${solo.proBild} = Autorennen (1/${sp.takt}), zu zweit ${zwei.proBild} = Autorennen (2/${sp.zweiTakt}); Spar-Stufe 2 halbiert`,
    nah(solo.proBild, 1 / sp.takt) && nah(zwei.proBild, 2 / sp.zweiTakt) && nah(langsam.proBild, solo.proBild / 2) && solo.n === 2 && zwei.n === 4); }

// ---------- 5. Auflösung ----------
{
  const solo = C.rechtecke(1280, 800, true, null, null).spiegel[0], g = C.rtGroesse(solo, false);
  const auto = { b: sp.aufloesung, h: Math.round(sp.aufloesung * (0.085 * 800) / (0.25 * 1280)) };               // ein Autorennen-Spiegel 25 % × 8,5 %
  const proBild = C.taktFuer(false, 0, 1).proBild * g.b * g.h, autoProBild = (1 / sp.takt) * auto.b * auto.h;      // Bildpunkte je Bild im Mittel
  pruefe(`Auflösung solo: ${g.b}×${g.h} je Spiegel = halbe Breite des Autorennen-Spiegels (${auto.b}×${auto.h})`, g.b === Math.round(auto.b * cfg.spiegel.aufloesungFaktor));
  pruefe(`Bildpunkte je Bild (Mittel, beide Spiegel): ${Math.round(proBild)} ≤ ${Math.round(autoProBild)} beim einen Autorennen-Spiegel`, proBild <= autoProBild);
  const z = C.rechtecke(640, 800, true, null, [MINI(800)], true).spiegel[0], gz = C.rtGroesse(z, true);
  pruefe(`Auflösung zu zweit: ${gz.b}×${gz.h} (× zweiAufloesung ${sp.zweiAufloesung}), nie größer als der Ausschnitt (${Math.round(z.b)} px)`, gz.b <= Math.round(z.b * 1.1) && gz.b <= Math.round(sp.aufloesung * cfg.spiegel.aufloesungFaktor * sp.zweiAufloesung));
}

// ---------- 6. Kippung ----------
pruefe('Kamera-Kippung = 50 % der Schräglage, Vorzeichen bleibt (links +)', nah(C.rollWinkel(0.6), 0.3) && nah(C.rollWinkel(-0.4), -0.2) && C.rollWinkel(0) === 0 && cfg.rollAnteil === 0.5);
{ const SL = R.Moto.schraeglage, z = { lean: 0.5, purzel: { aktiv: false, t: 0 } };
  const a = C.leanFuerKamera(z, SL.purzelPose, SL.PURZEL.dauer);
  z.purzel.aktiv = true; z.purzel.t = SL.PURZEL.dauer * 0.5;
  const b = C.leanFuerKamera(z, SL.purzelPose, SL.PURZEL.dauer);
  z.purzel.t = SL.PURZEL.dauer * 0.02; const c = C.leanFuerKamera(z, SL.purzelPose, SL.PURZEL.dauer);
  pruefe('Schräglage für die Kamera: normal voll, mitten im Purzelbaum 0, ohne Zustand 0, NaN → 0', nah(a, 0.5) && nah(b, 0) && c < 0.5 && C.leanFuerKamera(null) === 0 && C.leanFuerKamera({ lean: NaN }) === 0, `normal ${a}, Purzel-Mitte ${b}`); }

// ---------- 7. Autorennen-Config ----------
{ const st = R.config.cockpit.stile, ids = Object.keys(R.carCatalog && R.carCatalog.length !== undefined ? {} : {});
  const motorraeder = (R.carCatalog || []).filter((a) => a.sonderbau === 'motorrad');
  pruefe('Kein Auto-Cockpit (VW/Porsche) für Motorräder: config.cockpit.stile kennt keine Crossmaschine', !Object.keys(st).some((k) => /cross|moto/i.test(k)) && motorraeder.every((a) => !st[a.id]), `${motorraeder.length} Motorräder`); }

console.log(`\n${anzahl - fehler}/${anzahl} Prüfungen bestanden`);
process.exit(fehler ? 1 : 0);
