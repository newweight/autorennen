// Node-Test Motorrad-Modus (Stufe M1): node tests/test_moto.js
// Prüft Katalog, Schräglage (Formel, Vorzeichen, Deckel), Purzelbaum-Zustand, Modell-Schnittstelle (mit three.min.js im Sandbox) und die Haken.
const { ladeModule } = require('./lade');
const THREE = require('../vendor/three.min.js');   // eigene Instanz nur für Vektor-/Matrix-Rechnung (die Sandbox-Instanz baut die Modelle)
let fehler = 0;
function pruefe(name, ok, info) { console.log((ok ? 'OK   ' : 'FEHL ') + name + (info !== undefined && info !== '' ? '  (' + info + ')' : '')); if (!ok) fehler++; }
const nah = (a, b, tol) => Math.abs(a - b) <= (tol === undefined ? 1e-9 : tol);

// ---------- 1. Katalog ----------
// Referenz: reiner Auto-Katalog (ohne Motorrad-Modus)
const RA = ladeModule(['src/config.js', 'src/physics/vehicle.js', 'src/cars/carCatalog.js']);
const autos = RA.carCatalog.slice();
const autoWend = Math.max(...autos.filter((a) => a.waehlbar !== false).map((a) => a.fahrwerte.wendigkeit));
const autoMasseMin = Math.min(...autos.map((a) => a.fahrwerte.masse));

const R = ladeModule(['tests/moto_flag.js', 'vendor/three.min.js', 'src/config.js', 'src/physics/vehicle.js', 'src/cars/carCatalog.js',
  'src/cars/carBuilder.js', 'src/moto/motoKatalog.js', 'src/moto/motoModell.js', 'src/audio/motorProfile.js', 'src/moto/motoKlang.js', 'src/moto/schraeglage.js']);
const kat = R.carCatalog;
const wb = kat.waehlbare();
pruefe('Motorrad-Modus: 4 Motorräder wählbar, keine Autos', wb.length === 4 && wb.every((a) => a.sonderbau === 'motorrad'), wb.map((a) => a.id).join(','));
pruefe('Autos bleiben im Katalog (Polizei/Verkehr), aber nicht wählbar', kat.finde('polizei') && kat.finde('krankenwagen') && kat.finde('passat') && autos.every((a) => kat.finde(a.id).waehlbar === false));
pruefe('Katalog: 11 Autos + 8 Motorräder', kat.length === 11 + 8, 'n=' + kat.length);
pruefe('ids eindeutig', new Set(kat.map((a) => a.id)).size === kat.length);
pruefe('finde(crossmaschine) liefert Motorrad', kat.finde('crossmaschine') && kat.finde('crossmaschine').karosserie === 'motorrad');
pruefe('nurRennautos() im Motorrad-Modus immer aus', kat.nurRennautos({ nurRennautos: true }, { nurRennautosStandard: true }) === false);
pruefe('Speicher-Schlüssel getrennt von Autorennen', /\.motorrad$/.test(R.config.ui.speicherSchluessel) && /\.motorrad$/.test(R.config.garage.speicherSchluessel)
  && R.config.ui.speicherSchluessel !== RA.config.ui.speicherSchluessel, R.config.ui.speicherSchluessel);

const pflichtTexte = ['id', 'name', 'marke', 'modell', 'farbeName', 'karosserie', 'beschreibung', 'generischerName'];
const pflichtWerte = ['vMax', 'beschleunigung', 'bremsen', 'rueckwaertsMax', 'wendigkeit', 'grip', 'masse', 'laenge', 'breite'];
const bereiche = { vMax: [61, 75.01], beschleunigung: [4, 9], bremsen: [18, 26], rueckwaertsMax: [2, 12], wendigkeit: [2.3, 3.2], grip: [0.78, 0.95], masse: [120, 260], laenge: [1.9, 2.4], breite: [0.7, 1.0] };
kat.filter((a) => a.sonderbau === 'motorrad').forEach((a) => {
  const fehlt = [];
  for (const f of pflichtTexte) if (typeof a[f] !== 'string' || !a[f].trim()) fehlt.push(f);
  if (!Number.isInteger(a.farbe) || a.farbe < 0 || a.farbe > 0xffffff) fehlt.push('farbe');
  if (!Number.isInteger(a.farbe2)) fehlt.push('farbe2');
  if (!a.fahrwerte) fehlt.push('fahrwerte'); else for (const f of pflichtWerte) if (typeof a.fahrwerte[f] !== 'number') fehlt.push('fahrwerte.' + f);
  pruefe(`${a.id}: Pflichtfelder vollständig`, fehlt.length === 0, fehlt.join(', '));
  if (fehlt.length) return;
  const aus = pflichtWerte.filter((f) => a.fahrwerte[f] < bereiche[f][0] || a.fahrwerte[f] > bereiche[f][1]);
  pruefe(`${a.id}: Fahrwerte plausibel (Motorrad-Bereiche)`, aus.length === 0, aus.join(', '));
  pruefe(`${a.id}: wendiger und leichter als jedes Auto`, a.fahrwerte.wendigkeit > autoWend && a.fahrwerte.masse < autoMasseMin);
  pruefe(`${a.id}: Tempo wie Mittelklasse-Auto (240 km/h)`, nah(a.fahrwerte.vMax * 3.6, 240, 0.01));
  pruefe(`${a.id}: Beschreibung ein Satz`, a.beschreibung.length < 140 && /[.!?]$/.test(a.beschreibung));
  pruefe(`${a.id}: Motorklang-Profil vorhanden (Einzylinder)`, R.MotorProfile.fuer(a).zyl === 1 && R.MotorProfile.fuer(a).id === a.id);
});
pruefe('Länge ≈ 2,1 m, Breite ≈ 0,85 m', nah(kat.finde('crossmaschine').fahrwerte.laenge, 2.1, 0.05) && nah(kat.finde('crossmaschine').fahrwerte.breite, 0.85, 0.05));

// KI-Gegner
const g1 = kat.gegnerAutos(5, { seed: 'a', spielerIds: ['crossmaschine'] }), g2 = kat.gegnerAutos(5, { seed: 'a', spielerIds: ['crossmaschine'] });
pruefe('KI-Gegner: Anzahl, deterministisch je Seed', g1.length === 5 && JSON.stringify(g1.map((a) => a.id)) === JSON.stringify(g2.map((a) => a.id)));
pruefe('KI-Gegner: lauter Crossmaschinen, nie die Variante des Spielers, Farben ohne Doppel', g1.every((a) => a.sonderbau === 'motorrad' && a.id !== 'crossmaschine') && new Set(g1.map((a) => a.optionen.farbe)).size === 5, g1.map((a) => a.farbeName).join(','));
pruefe('KI-Gegner: Katalogeinträge unverändert (abgeleitete Kopien)', g1.every((a) => a !== kat.finde(a.id)) && kat.finde('crossmaschine-rot').optionen.farbe === undefined);
pruefe('KI-Gegner: 8 Gegner (mehr als Varianten ohne Spieler) → reihum', kat.gegnerAutos(8, { seed: 1, spielerIds: ['crossmaschine'] }).length === 8);
pruefe('KI-Gegner: anderer Seed → anderes Feld', JSON.stringify(kat.gegnerAutos(6, { seed: 'x' }).map((a) => a.id)) !== JSON.stringify(kat.gegnerAutos(6, { seed: 'y' }).map((a) => a.id)));

// Fahrverhalten im Vergleich zum Passat (Physik unverändert, nur andere Werte)
const dt = R.config.physik.schritt;
function zeit0bis100(fw) { const v = new R.Vehicle(fw, { tempoKlasse: null }); let t = 0; while (v.vLaengs * 3.6 < 100 && t < 30) { v.schritt(dt, { gas: 1, bremse: 0, lenkung: 0 }); t += dt; } return t; }
function kurvenRadius(fw) { const v = new R.Vehicle(fw); return 25 / v.drehrateMax(25); }   // Kreisradius bei Volleinschlag mit 90 km/h (wie test_autos.js)
const passat = kat.finde('passat').fahrwerte, moto = kat.finde('crossmaschine').fahrwerte;
const tM = zeit0bis100(moto), tP = zeit0bis100(passat), rM = kurvenRadius(moto), rP = kurvenRadius(passat);
console.log(`      0→100 km/h: Motorrad ${tM.toFixed(1)} s, Passat ${tP.toFixed(1)} s · Wenderadius bei 90 km/h: Motorrad ${rM.toFixed(0)} m, Passat ${rP.toFixed(0)} m`);
pruefe('Fahrphysik läuft mit Motorrad-Werten (keine NaN, erreicht 100 km/h)', tM < 20 && isFinite(rM));
pruefe('Motorrad beschleunigt schneller und wendet enger als der Passat', tM < tP && rM < rP);

// ---------- 2. Schräglage ----------
const S = R.Moto.schraeglage, G = 9.81;
const grad = (r) => r * 180 / Math.PI;
pruefe('Schräglage: atan(v·ω/g) bei v=20, ω=0,3', nah(S.winkel(20, 0.3), Math.atan(20 * 0.3 / G)), grad(S.winkel(20, 0.3)).toFixed(1) + '°');
pruefe('Schräglage: Linkskurve (ω>0) → positiver Winkel (links), Rechtskurve → negativ, symmetrisch', S.winkel(20, 0.3) > 0 && S.winkel(20, -0.3) < 0 && nah(S.winkel(20, 0.3), -S.winkel(20, -0.3)));
pruefe('Schräglage: bei Stand (v=0) und rückwärts 0', S.winkel(0, 1) === 0 && S.winkel(-5, 1) === 0 && S.winkel(30, 0) === 0);
pruefe('Schräglage: Deckel 45°', nah(S.winkel(60, 3), Math.PI / 4) && nah(S.winkel(60, -3), -Math.PI / 4) && S.winkel(10, 0.2) < Math.PI / 4);
pruefe('Schräglage: unsinnige Eingaben (NaN) → 0', S.winkel(20, NaN) === 0);
{
  const z = S.zustand(); let h = 0;
  for (let i = 0; i < 120; i++) { h += 0.3 / 60; S.bildSchritt(z, { heading: h, v: 20, dt: 1 / 60 }); }
  pruefe('Bildschritt: Linkskurve (heading wächst) → Ziel-Schräglage nach 2 s erreicht (±1°)', Math.abs(grad(z.lean) - grad(Math.atan(20 * 0.3 / G))) < 1, grad(z.lean).toFixed(1) + '°');
  for (let i = 0; i < 120; i++) { S.bildSchritt(z, { heading: h, v: 20, dt: 1 / 60 }); }
  pruefe('Bildschritt: geradeaus → zurück auf ~0', Math.abs(z.lean) < 0.01);
  const z2 = S.zustand(); let h2 = 0;
  for (let i = 0; i < 120; i++) { h2 -= 0.3 / 60; S.bildSchritt(z2, { heading: h2, v: 20, dt: 1 / 60 }); }
  pruefe('Bildschritt: Rechtskurve → negativ', z2.lean < -0.2, grad(z2.lean).toFixed(1) + '°');
  const z3 = S.zustand(); let h3 = 0;
  for (let i = 0; i < 120; i++) { h3 += 0.3 / 60; S.bildSchritt(z3, { heading: h3, v: 0, dt: 1 / 60 }); }
  pruefe('Bildschritt: Stand → 0 (auch beim Drehen auf der Stelle)', z3.lean === 0);
  const z4 = S.zustand(); const l0 = S.bildSchritt(z4, { heading: 0, v: 20, dt: 1 / 60 }); S.bildSchritt(z4, { heading: 0.2, v: 20, dt: 0 });
  pruefe('Bildschritt: Pause (dt=0) hält den Zustand', z4.lean === l0);
  const z5 = S.zustand(); S.bildSchritt(z5, { heading: 0, v: 30, dt: 1 / 60 }); S.bildSchritt(z5, { heading: 3, v: 30, dt: 1 / 60 });
  pruefe('Bildschritt: Reset/Teleport (Heading-Sprung) löst keinen Schräglagen-Ruck aus', Math.abs(z5.lean) < 1e-9);
  // mit echter Fahrphysik: Linkskurve (lenkung −1) → heading wächst → Lage links
  const v = new R.Vehicle(kat.finde('crossmaschine').fahrwerte, { tempoKlasse: null }); const z6 = S.zustand();
  for (let t = 0; t < 4; t += dt) v.schritt(dt, { gas: 1, bremse: 0, lenkung: 0 });
  const h0 = v.heading; let maxLean = 0;
  for (let t = 0; t < 1.5; t += dt) { v.schritt(dt, { gas: 0.5, bremse: 0, lenkung: -1 }); S.bildSchritt(z6, { heading: v.heading, v: v.vLaengs, dt }); maxLean = Math.max(maxLean, z6.lean); }
  pruefe('Fahrphysik: Linkskurve (lenkung −1) → heading wächst UND Schräglage positiv (links)', R.Vehicle.winkelDiff(v.heading, h0) > 0.2 && maxLean > 0.1, grad(maxLean).toFixed(0) + '°');
}
// Vorzeichen am echten Modell: positive Schräglage neigt das Oberteil nach links (= −x bei heading 0, Front −z)
{
  const eintrag = kat.finde('crossmaschine'), m = R.carBuilder.bauen(eintrag);
  const z = S.zustand(); z.lean = 0.5; S.anwenden(m, z, null); m.updateMatrixWorld(true);
  const oben = new THREE.Vector3(0, 1.0, 0); m.userData.inhalt.localToWorld(oben);
  pruefe('Modell: positive Schräglage → Oberkörper nach links (−x), Räder bleiben am Boden', oben.x < -0.3 && oben.y > 0.7, `Spitze x=${oben.x.toFixed(2)} y=${oben.y.toFixed(2)}`);
  const boden = new THREE.Vector3(0, 0, 0); m.userData.inhalt.localToWorld(boden);
  pruefe('Modell: Drehpunkt der Schräglage liegt am Boden', nah(boden.y, 0, 1e-6) && nah(boden.x, 0, 1e-6));
  // Heading 0.5 (Linkskurve, wie main.js: rotation.y = heading): die Neigung zeigt zur linken Fahrzeugseite
  m.rotation.set(0, 0.5, 0, 'YXZ'); m.updateMatrixWorld(true);
  const links = new THREE.Vector3(-1, 0, 0).transformDirection(m.matrixWorld);
  const spitze = new THREE.Vector3(0, 1.0, 0); m.userData.inhalt.localToWorld(spitze);
  pruefe('Modell: Neigung zeigt zur linken Fahrzeugseite auch bei Heading ≠ 0', spitze.x * links.x + spitze.z * links.z > 0.3);
}

// ---------- 3. Purzelbaum ----------
{
  const P = S.PURZEL, z = S.zustand();
  pruefe('Purzel: Konstanten 1,2 s / Abklingzeit 2 s', P.dauer === 1.2 && P.abklingzeit === 2);
  let pose = S.purzelSchritt(z, 0.1);
  pruefe('Purzel: Ruhezustand = aufrecht, nicht aktiv', !pose.aktiv && pose.drehung === 0 && pose.hoehe === 0);
  pruefe('Purzel: Start ok', S.purzelStart(z) === true && z.purzel.aktiv);
  pruefe('Purzel: zweiter Start während des Sturzes abgelehnt', S.purzelStart(z) === false);
  pose = S.purzelSchritt(z, 0.6);
  pruefe('Purzel: nach 0,6 s halb herum (≈ −π, Überschlag nach vorn = negativ) und oben', pose.aktiv && Math.abs(pose.drehung + Math.PI) < 0.2 && pose.hoehe > 1.0, `${pose.drehung.toFixed(2)} rad, ${pose.hoehe.toFixed(2)} m`);
  let t = 0.6, minDrehung = pose.drehung;
  while (t < 1.19) { pose = S.purzelSchritt(z, 1 / 60); t += 1 / 60; minDrehung = Math.min(minDrehung, pose.drehung); }
  pruefe('Purzel: Drehung geht bis fast −2π', minDrehung < -2 * Math.PI + 0.3, minDrehung.toFixed(2));
  pose = S.purzelSchritt(z, 0.05);
  pruefe('Purzel: nach 1,2 s zu Ende und exakt aufrecht (Drehung 0, Höhe 0)', !pose.aktiv && pose.drehung === 0 && pose.hoehe === 0 && pose.lean === 1);
  pruefe('Purzel: Abklingzeit – neuer Sturz sofort nicht möglich', S.purzelStart(z) === false && z.purzel.abkling > 1.9);
  S.purzelSchritt(z, 1.0); pruefe('Purzel: nach 1 s noch gesperrt', S.purzelStart(z) === false);
  S.purzelSchritt(z, 1.05); pruefe('Purzel: nach 2 s wieder möglich', S.purzelStart(z) === true);
  const z2 = S.zustand(); S.purzelStart(z2); S.purzelSchritt(z2, 0.3); const t0 = z2.purzel.t; S.purzelSchritt(z2, 0);
  pruefe('Purzel: Pause (dt=0) hält an', z2.purzel.t === t0);
  pruefe('Purzel: Schräglage blendet während des Überschlags aus (Anteil 0 in der Mitte, 1 am Rand)', S.purzelPose(0.5).lean === 0 && S.purzelPose(0).lean === 1 && S.purzelPose(1).lean === 1);
  // am Modell: Pose anwenden und danach exakt zurück
  const m = R.carBuilder.bauen(kat.finde('crossmaschine')), zz = S.zustand(); zz.lean = 0.3;
  S.anwenden(m, zz, S.purzelPose(0.5));
  pruefe('Purzel am Modell: Gruppe dreht und hüpft (Mitte: x≈−π, Drehpunkt angehoben)', Math.abs(m.userData.purzel.rotation.x + Math.PI) < 0.01 && m.userData.purzel.position.y > R.Moto.modell.PIVOT_Y + 1);
  S.anwenden(m, zz, { drehung: 0, hoehe: 0, lean: 1 });
  pruefe('Purzel am Modell: nach der Landung aufrecht (rotation.x = 0, Höhe normal)', m.userData.purzel.rotation.x === 0 && m.userData.purzel.position.y === R.Moto.modell.PIVOT_Y && m.userData.lage.rotation.z === 0.3);
  // während der Rolle bleibt das Fahrzeug über dem Boden
  let tiefster = Infinity;
  for (let q = 0; q <= 1; q += 0.02) {
    S.anwenden(m, zz, S.purzelPose(q)); m.updateMatrixWorld(true);
    m.userData.raeder.forEach((r) => { const w = new THREE.Vector3(); r.getWorldPosition(w); tiefster = Math.min(tiefster, w.y - 0.33); });
  }
  pruefe('Purzel am Modell: Räder tauchen beim Überschlag nicht tief in den Boden', tiefster > -0.45, tiefster.toFixed(2) + ' m');
}

// ---------- 4. Modell-Schnittstelle ----------
{
  const eintrag = kat.finde('crossmaschine');
  const m = R.carBuilder.bauen(eintrag);       // über den Sonderbau-Haken
  const u = m.userData, st = R.Moto.modell.statistik(m);
  pruefe('carBuilder.bauen liefert für Motorrad-Einträge das Motorradmodell (Sonderbau-Haken)', u.moto === true && u.autoId === 'crossmaschine' && m.name === 'crossmaschine');
  pruefe('Schnittstelle wie bei Autos: raeder, vorderraeder, lenkObjekte, bremslichter, bremslichtMaterial, scheinwerfer, blaulicht, dach', Array.isArray(u.raeder) && u.raeder.length === 2
    && Array.isArray(u.vorderraeder) && u.lenkObjekte.length === 1 && u.bremslichter.length === 1 && u.bremslichtMaterial && u.scheinwerfer.length === 1 && Array.isArray(u.blaulicht) && u.dach === null);
  pruefe('Aufbau: äußere Gruppe → lage → purzel → inhalt', m.children.some((c) => c.name === 'lage') && u.lage.children[0] === u.purzel && u.purzel.children[0] === u.inhalt);
  pruefe('keine Lichter, wenige Draw-Calls (≤ 26), Dreiecke < 8000', st.lichter === 0 && st.meshes <= 26 && st.dreiecke < 8000, `${st.meshes} Meshes, ${Math.round(st.dreiecke)} Dreiecke`);
  let nurLambertBasic = true; m.traverse((o) => { if (o.isMesh && !(o.material.isMeshLambertMaterial || o.material.isMeshBasicMaterial)) nurLambertBasic = false; });
  pruefe('nur Lambert-/Basic-Materialien', nurLambertBasic);
  const schatten = []; m.traverse((o) => { if (o.name === 'schatten') schatten.push(o); });
  pruefe('Schatten-Mesh heißt „schatten“ mit eigener Geometrie (main.js gibt sie beim Abbau frei)', schatten.length === 1 && schatten[0].parent === m);
  const m2 = R.carBuilder.bauen(kat.finde('crossmaschine-rot'));
  const geteilt = new Set(); m2.traverse((o) => { if (o.isMesh && o.name !== 'schatten') geteilt.add(o.geometry); });
  const g1s = []; m.traverse((o) => { if (o.isMesh && o.name !== 'schatten') g1s.push(o.geometry); });
  pruefe('Geometrien werden zwischen Motorrädern geteilt (nur der Fahrer je Farbkombination eigen)', g1s.filter((g) => geteilt.has(g)).length >= g1s.length - 1);
  const kar = (g) => { let k = null; g.traverse((o) => { if (o.name === 'karosserie') k = o; }); return k; };
  pruefe('Lackfarbe aus Katalog bzw. Garage (opt.farbe)', kar(m).material.color.getHex() === eintrag.farbe && kar(R.carBuilder.bauen(eintrag, { farbe: 0x12ab34 })).material.color.getHex() === 0x12ab34 && R.carBuilder.bauen(eintrag, { farbe: 0x12ab34 }).userData.lackFarbe === 0x12ab34);
  pruefe('KI-Eintrag mit optionen.farbe bekommt diese Farbe', kar(R.carBuilder.bauen(g1[0])).material.color.getHex() === g1[0].optionen.farbe);
  R.carBuilder.dreheRaeder(m, -1.5);
  pruefe('dreheRaeder: beide Räder drehen um x', u.raeder.every((r) => r.rotation.x === -1.5));
  const hand = () => m.userData.inhalt.children.filter((c) => c.name === 'handschuh').map((h) => h.position.clone());
  const h0 = hand(); R.carBuilder.lenkeRaeder(m, 0.5); const h1 = hand();
  pruefe('lenkeRaeder: Lenkgruppe dreht, Hände folgen dem Lenker', u.lenkGruppe.quaternion.w < 0.999 && h0.some((p, i) => p.distanceTo(h1[i]) > 0.02), h0.map((p, i) => p.distanceTo(h1[i]).toFixed(3)).join('/'));
  const ober = m.userData.inhalt.children.filter((c) => c.name === 'oberarm'), unter = m.userData.inhalt.children.filter((c) => c.name === 'unterarm');
  const hs = m.userData.inhalt.children.filter((c) => c.name === 'handschuh');
  const ende = (s) => new THREE.Vector3(0, 1, 0).applyMatrix4(new THREE.Matrix4().compose(s.position, s.quaternion, s.scale));
  pruefe('Arme: Unterarm beginnt am Ellbogen des Oberarms und endet an der Hand (nach Lenken)', ober.every((o, i) => ende(o).distanceTo(unter[i].position) < 1e-4) && unter.every((un, i) => ende(un).distanceTo(hs[i].position) < 1e-4));
  pruefe('Arme: Hände greifen die Lenkergriffe (Abstand zum Griff in Ruhelage < 2 cm)', (() => { R.carBuilder.lenkeRaeder(m, 0); return hand().every((p, i) => p.distanceTo(new THREE.Vector3((i ? 1 : -1) * R.Moto.modell.GRIFF.x, R.Moto.modell.GRIFF.y, R.Moto.modell.GRIFF.z)) < 0.02); })());
  R.carBuilder.lenkeRaeder(m, 0.6); m.updateMatrixWorld(true);
  const vorn = new THREE.Vector3(0, 0, -1).transformDirection(u.lenkGruppe.matrixWorld);
  pruefe('Lenkung: positiver Winkel (links) dreht das Vorderrad nach links (−x)', vorn.x < -0.05, 'x=' + vorn.x.toFixed(3));
  R.carBuilder.lenkeRaeder(m, 0);
  R.carBuilder.setzeBremslicht(m, true); R.carBuilder.setzeBremslicht(m, false);
  let lichtOk = true; try { R.carBuilder.setzeLicht(m, true); R.carBuilder.setzeLicht(m, false); } catch (e) { lichtOk = false; console.log(e); }
  pruefe('setzeBremslicht / setzeLicht laufen ohne Fehler', lichtOk);
  R.carBuilder.dreheRaeder(m, 0); m.updateMatrixWorld(true);
  const box = new THREE.Box3(); m.traverse((o) => { if (o.isMesh && o.name !== 'schatten' && o.name !== 'fahrlicht') { o.geometry.computeBoundingBox(); box.union(new THREE.Box3().copy(o.geometry.boundingBox).applyMatrix4(o.matrixWorld)); } });
  pruefe('Maße: Länge 2,0–2,4 m, Breite < 1,0 m, Höhe 1,5–1,9 m, Räder am Boden (y ≥ −0,02)', box.max.z - box.min.z > 2.0 && box.max.z - box.min.z < 2.4 && box.max.x - box.min.x < 1.0 && box.max.y > 1.5 && box.max.y < 1.9 && box.min.y > -0.02 && box.min.y < 0.02,
    `${(box.max.z - box.min.z).toFixed(2)} × ${(box.max.x - box.min.x).toFixed(2)} × ${box.max.y.toFixed(2)}`);
  pruefe('raeder sind Gruppen ohne geometry (trackBuilder.radAufstand überspringt sie)', u.raeder.every((r) => !r.geometry));
}

// ---------- 5. Haken (Umhüllen) ----------
{
  const calls = [];
  const R2 = ladeModule(['tests/moto_flag.js', 'vendor/three.min.js', 'src/config.js', 'src/physics/vehicle.js', 'src/cars/carCatalog.js', 'src/cars/carBuilder.js',
    'src/moto/motoKatalog.js', 'src/moto/motoModell.js', 'src/moto/schraeglage.js']);
  R2.dach = { frame() { calls.push('dach'); } };
  R2.Spiel = { prototype: { physikSchritt() { calls.push('physik'); } } };
  const haken = R2.Moto.schraeglage.installieren();
  pruefe('installieren(): umhüllt R.dach.frame und Spiel.physikSchritt', JSON.stringify(haken) === JSON.stringify(['R.dach.frame', 'Spiel.physikSchritt']), haken.join(','));
  const mesh = R2.carBuilder.bauen(R2.carCatalog.finde('crossmaschine'));
  const spiel = { zustand: 'rennen', stoesse: [], _bandeSt: [0, 0], hindernisStoesse: [], pflanzenStoesse: [],
    fahrzeuge: [{ mesh, vehicle: { vLaengs: 20 }, anzeige: { heading: 0 }, istSpieler: true },
      { mesh: R2.carBuilder.bauen(R2.carCatalog.finde('crossmaschine-rot')), vehicle: { vLaengs: 20 }, anzeige: { heading: 0 } }] };
  for (let i = 0; i < 90; i++) { spiel.fahrzeuge[0].anzeige.heading += 0.3 / 60; R2.dach.frame(spiel, 1 / 60); }
  pruefe('Haken R.dach.frame: Original läuft weiter und die Lage wird auf das Mesh gelegt', calls.length === 90 && mesh.userData.lage.rotation.z > 0.3, (mesh.userData.lage.rotation.z * 180 / Math.PI).toFixed(0) + '°');
  const anz = () => spiel.fahrzeuge.map((f) => (f.motoZ ? f.motoZ.purzel.anzahl : 0));
  const wirkt = (setze) => { const n = anz(); setze(); R2.Spiel.prototype.physikSchritt.call(spiel, 1 / 120); return anz().map((x, i) => x - n[i]); };
  const leer = () => { spiel.stoesse = []; spiel._bandeSt = [0, 0]; spiel.hindernisStoesse = []; spiel.pflanzenStoesse = []; };
  const nachAbkling = () => { spiel.fahrzeuge.forEach((f) => { if (f.motoZ) { f.motoZ.purzel.aktiv = false; f.motoZ.purzel.abkling = 0; } }); };
  pruefe('Kein Sturz bei schwachem Stoß (Bande 3 m/s, Auto 2 m/s)', JSON.stringify(wirkt(() => { leer(); spiel._bandeSt = [3, 0]; spiel.stoesse = [{ a: 0, b: 1, staerke: 2 }]; })) === '[0,0]');
  pruefe('Sturz bei harter Bande (8 m/s) für das betroffene Motorrad', JSON.stringify(wirkt(() => { leer(); spiel._bandeSt = [8, 0]; })) === '[1,0]'); nachAbkling();
  pruefe('Sturz bei hartem Zusammenstoß (8 m/s) für beide', JSON.stringify(wirkt(() => { leer(); spiel.stoesse = [{ a: 0, b: 1, staerke: 8 }]; })) === '[1,1]'); nachAbkling();
  pruefe('Sturz bei hartem Hindernis (Ast 7 m/s), nicht bei Lava', JSON.stringify(wirkt(() => { leer(); spiel.hindernisStoesse = [{ nr: 1, typ: 'ast', staerke: 7 }, { nr: 0, typ: 'brand', staerke: 9 }]; })) === '[0,1]'); nachAbkling();
  pruefe('Sturz bei Baum (6 m/s), nicht bei Busch', JSON.stringify(wirkt(() => { leer(); spiel.pflanzenStoesse = [{ nr: 0, typ: 'baum', staerke: 6 }, { nr: 1, typ: 'busch', staerke: 9 }]; })) === '[1,0]'); nachAbkling();
  pruefe('Abklingzeit: zweiter harter Stoß direkt nach der Landung löst nichts aus', (() => {
    leer(); spiel._bandeSt = [9, 0]; R2.Spiel.prototype.physikSchritt.call(spiel, 1 / 120); const a = spiel.fahrzeuge[0].motoZ.purzel.anzahl;
    R2.dach.frame(spiel, 1.3); R2.Spiel.prototype.physikSchritt.call(spiel, 1 / 120); return spiel.fahrzeuge[0].motoZ.purzel.anzahl === a; })());
  spiel.zustand = 'menue'; nachAbkling();
  pruefe('Außerhalb des Rennens (Menü) kein Sturz', JSON.stringify(wirkt(() => { leer(); spiel._bandeSt = [9, 9]; })) === '[0,0]');
}

console.log(fehler ? `\n${fehler} Prüfung(en) FEHLGESCHLAGEN` : '\nAlle Motorrad-Prüfungen bestanden');
process.exit(fehler ? 1 : 0);
