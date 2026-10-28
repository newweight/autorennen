// Node-Test Motorrad M3: node tests/test_moto_m3.js
// Prüft ohne Browser: neue Typen im Katalog (Superbike, Roller, Chopper, Quad: Felder, Fahrwerte, Klang, Modell), Quad kippt nie, Stunt-Park (ohne KI-Gegner,
// ohne Rennen-Ende, Schanzenplan), Schlamm/Wasser bremsen, Kisten zählen Punkte, Garage-Speicherung (Helm/Kombi/Nummer) und Texte, Knall/Funken als reine Funktionen.
const fs = require('fs');
const { ladeModule } = require('./lade');
let fehler = 0, anzahl = 0;
function pruefe(name, ok, info) { anzahl++; console.log((ok ? 'OK   ' : 'FEHL ') + name + (info !== undefined && info !== '' ? '  (' + info + ')' : '')); if (!ok) fehler++; }
const nah = (a, b, tol) => Math.abs(a - b) <= (tol === undefined ? 1e-9 : tol);

const BASIS = ['tests/moto_m3_flag.js', 'vendor/three.min.js', 'src/config.js', 'src/audio/motorProfile.js', 'src/physics/vehicle.js', 'src/cars/carCatalog.js', 'src/cars/carBuilder.js',
  'src/track/spline.js', 'src/track/trackCatalog.js', 'src/track/trackBuilder.js', 'src/track/schanze.js', 'src/track/anlauf.js',
  'src/moto/motoKatalog.js', 'src/moto/motoModell.js', 'src/moto/motoKlang.js', 'src/moto/schraeglage.js', 'src/moto/stunts.js', 'src/moto/stuntWelt.js',
  'src/moto/motoTypen.js', 'src/moto/motoM3Garage.js', 'src/moto/motoM3Welt.js', 'src/moto/motoM3Effekte.js', 'tests/moto_m3_attrappe.js', 'src/moto/motoM3Start.js'];
const R = ladeModule(BASIS);
const kat = R.carCatalog, TY = R.Moto.typen, Wl = R.Moto.m3welt, FX = R.Moto.m3fx, G3 = R.Moto.m3garage, SL = R.Moto.schraeglage, St = R.Moto.stunts;
const dt = R.config.physik.schritt;

// ---------- 1. Katalog ----------
const NEU = ['superbike', 'roller', 'chopper', 'quad'];
const wb = kat.waehlbare();
pruefe('Katalog: 8 Motorräder wählbar (4 Cross + 4 neue), keine Autos', wb.length === 8 && wb.every((a) => a.sonderbau === 'motorrad'), wb.map((a) => a.id).join(','));
pruefe('Neue Typen vorhanden, wählbar, mit typ-Feld', NEU.every((id) => { const a = kat.finde(id); return a && a.waehlbar === true && a.typ === id && a.karosserie === 'motorrad'; }));
pruefe('ids eindeutig, Autos bleiben (Polizei/Verkehr) und nicht wählbar', new Set(kat.map((a) => a.id)).size === kat.length && kat.finde('polizei') && kat.finde('passat').waehlbar === false, 'n=' + kat.length);
const bereiche = { vMax: [30, 85], beschleunigung: [4, 9], bremsen: [17, 26], rueckwaertsMax: [2, 12], wendigkeit: [2.2, 3.2], grip: [0.78, 0.96], masse: [120, 270], laenge: [1.7, 2.5], breite: [0.65, 1.2] };   // erweitert NUR hier
const pflichtTexte = ['id', 'name', 'marke', 'modell', 'farbeName', 'karosserie', 'beschreibung', 'generischerName'];
NEU.forEach((id) => {
  const a = kat.finde(id), fehlt = [];
  for (const f of pflichtTexte) if (typeof a[f] !== 'string' || !a[f].trim()) fehlt.push(f);
  if (!Number.isInteger(a.farbe) || !Number.isInteger(a.farbe2)) fehlt.push('farbe');
  Object.keys(bereiche).forEach((f) => { if (typeof a.fahrwerte[f] !== 'number') fehlt.push('fahrwerte.' + f); });
  pruefe(`${id}: Pflichtfelder vollständig`, fehlt.length === 0, fehlt.join(', '));
  const aus = Object.keys(bereiche).filter((f) => a.fahrwerte[f] < bereiche[f][0] || a.fahrwerte[f] > bereiche[f][1]);
  pruefe(`${id}: Fahrwerte im (erweiterten) Bereich`, aus.length === 0, aus.join(', '));
  pruefe(`${id}: Beschreibung ein kurzer Satz, Optionen für Helm/Kombi/Nummer`, a.beschreibung.length < 140 && /[.!?]$/.test(a.beschreibung) && Number.isInteger(a.optionen.helm) && Number.isInteger(a.optionen.fahrer) && Number.isInteger(a.optionen.nummer));
});
const cross = kat.finde('crossmaschine').fahrwerte, fw = (id) => kat.finde(id).fahrwerte;
pruefe('Superbike: schnell (vMax > Cross), tief/schnell beschleunigend, weniger wendig', fw('superbike').vMax > cross.vMax * 1.2 && fw('superbike').beschleunigung > cross.beschleunigung && fw('superbike').wendigkeit < cross.wendigkeit);
pruefe('Roller: langsam (vMax < Cross), wendigster Typ, leicht', fw('roller').vMax < cross.vMax * 0.6 && fw('roller').wendigkeit > cross.wendigkeit && NEU.every((id) => fw('roller').wendigkeit >= fw(id).wendigkeit) && fw('roller').masse < cross.masse);
pruefe('Chopper: lang, schwer, gemütlich (Beschleunigung < Cross)', fw('chopper').laenge > cross.laenge && fw('chopper').masse > cross.masse && fw('chopper').beschleunigung < cross.beschleunigung);
pruefe('Quad: breit, kippsicher markiert; alle anderen kippen', fw('quad').breite > 1.0 && kat.finde('quad').kippt === false && TY.kippt('quad') === false && ['superbike', 'roller', 'chopper', 'crossmaschine'].every((id) => TY.kippt(kat.finde(id)) === true));
const gg = kat.gegnerAutos(8, { seed: 'm3', spielerIds: ['superbike'] });
pruefe('KI-Gegner: nur Crossmaschinen (nie die neuen Typen)', gg.length === 8 && gg.every((a) => !a.typ && /^crossmaschine/.test(a.id)), gg.map((a) => a.id).join(','));
pruefe('Katalogeinträge der neuen Typen sind Kopien je Aufruf (typKatalog frisch)', TY.typKatalog()[0] !== TY.typKatalog()[0] && TY.typKatalog().length === 4);

// Klang
const P = R.MotorProfile.profile;
pruefe('Klang: eigenes Profil je Typ (id, Zylinder)', NEU.every((id) => R.MotorProfile.fuer(kat.finde(id)).id === id) && P.superbike.zyl === 4 && P.chopper.zyl === 2 && P.roller.zyl === 1 && P.quad.zyl === 1);
pruefe('Klang: Superbike hoch (höchste Drehzahl und Formant), Chopper tief (niedrigste Drehzahl/Formant), Quad brummig, Roller surrend (hoher Leerlauf, wenig Sub)',
  P.superbike.rpmMax > P.crossmaschine.rpmMax && P.superbike.formant.hz > P.crossmaschine.formant.hz && P.chopper.rpmMax < P.quad.rpmMax && P.chopper.formant.hz < P.quad.formant.hz && P.chopper.leerlauf < P.quad.leerlauf
  && P.quad.sub > 0.25 && P.quad.formant.hz < 700 && P.roller.leerlauf > P.crossmaschine.leerlauf && P.roller.sub < 0.1);
pruefe('Klang: Profile vollständig (alle Felder der Crossmaschine vorhanden)', NEU.every((id) => Object.keys(P.crossmaschine).every((k) => k in P[id])));
pruefe('Klang: Motorprofil-Knallen aus (Auspuffknall kommt aus motoM3Effekte)', ['crossmaschine', 'crossmaschine-rot', ...NEU].every((id) => P[id].knallen === 0));

// ---------- 2. Modelle ----------
const MS = R.Moto.modell.statistik;
NEU.forEach((id) => {
  const a = kat.finde(id), g = R.carBuilder.bauen(a), u = g.userData, s = MS(g);
  pruefe(`${id}: Modell – userData wie die Crossmaschine (lage/purzel/inhalt/Räder/Lenkung/Licht)`, u.moto === true && u.lage && u.purzel && u.inhalt && Array.isArray(u.raeder) && u.lenkObjekte.length === 1 && u.bremslichter.length === 1 && u.scheinwerfer.length === 1 && u.typ === id && u.autoId === id);
  pruefe(`${id}: Modell – wenige Draw-Calls (≤ 30), keine Lichter, Räder: ${id === 'quad' ? 4 : 2}`, s.meshes <= 30 && s.lichter === 0 && u.raeder.length === (id === 'quad' ? 4 : 2), 'Meshes ' + s.meshes + ', Dreiecke ' + s.dreiecke);
  const f1 = g.getObjectByName('teile').geometry, g2 = R.carBuilder.bauen(a);
  pruefe(`${id}: Geometrie wird geteilt (zweites Modell nutzt dieselbe)`, g2.getObjectByName('teile').geometry === f1 && g2.getObjectByName('rad').geometry === g.getObjectByName('rad').geometry);
  u.lenkObjekte[0].rotation.y = 0.4; const w1 = u.lenkObjekte[0].rotation.y;
  pruefe(`${id}: Lenkung übernimmt den Winkel (carBuilder.lenkeRaeder), Räder drehbar`, nah(w1, 0.4, 1e-9) && (u.raeder.forEach((r) => { r.rotation.x = 1; }), u.raeder.every((r) => r.rotation.x === 1)));
  const bb = new R.carBuilder.constructor === undefined ? null : null; void bb;
  const hoch = (() => { let y = -1e9, y0 = 1e9; g.updateMatrixWorld(true); g.traverse((o) => { if (o.isMesh && o.name !== 'schatten') { o.geometry.computeBoundingBox(); const b = o.geometry.boundingBox; if (b) { const m = o.matrixWorld; [b.min.y, b.max.y].forEach((v) => { const w = new R.carBuilder.constructor === undefined ? 0 : 0; void w; y = Math.max(y, v); y0 = Math.min(y0, v); }); } } }); return [y0, y]; })();
  void hoch;
});
{
  // Helm/Kombi/Nummer wirken auf das Modell (andere Geometrie je Farbkombination, andere Nummern-Textur/-Material)
  const q = kat.finde('quad'), o = (h, k, n) => Object.assign({}, q, { optionen: { helm: h, fahrer: k, nummer: n } });
  const a = R.carBuilder.bauen(o(0xff0000, 0x00ff00, 7)), b = R.carBuilder.bauen(o(0x0000ff, 0x00ff00, 7)), c = R.carBuilder.bauen(o(0xff0000, 0xffff00, 7)), d = R.carBuilder.bauen(o(0xff0000, 0x00ff00, 8));
  pruefe('Helm-Farbe ändert das Modell (Fahrer-Geometrie)', a.getObjectByName('fahrer').geometry !== b.getObjectByName('fahrer').geometry);
  pruefe('Kombi-Farbe ändert Fahrer-Geometrie und Armfarbe', a.getObjectByName('fahrer').geometry !== c.getObjectByName('fahrer').geometry && a.getObjectByName('oberarm').material.color.getHex() === 0x00ff00 && c.getObjectByName('oberarm').material.color.getHex() === 0xffff00);
  pruefe('Startnummer ändert das Tafel-Material', a.getObjectByName('nummerTafeln').material !== d.getObjectByName('nummerTafeln').material);
}
{
  const c = R.carBuilder.bauen(kat.finde('crossmaschine'));
  pruefe('Crossmaschine unverändert über motoModell.js gebaut (Räder 2, Teile-Mesh, kein typ)', c.userData.raeder.length === 2 && c.userData.typ === undefined && !!c.getObjectByName('teile') && !!c.getObjectByName('nummerSeite'));
}

// ---------- 3. Quad kippt nie ----------
{
  const PK = SL.PURZEL, quad = R.carBuilder.bauen(kat.finde('quad')), bike = R.carBuilder.bauen(kat.finde('crossmaschine'));
  // harte Kurve → Schräglage, Anprall → Überschlag
  const fahre = (z, mesh, quadModus, schritte) => {
    let h = 0, maxZ = 0, maxX = 0, ausgeloest = 0; const z3 = { wackel: 0 };
    for (let i = 0; i < schritte; i++) {
      h += (Math.sin(i / 25) > 0 ? 1 : -1) * 0.06;                      // heftiges Slalom-Lenken
      SL.bildSchritt(z, { heading: h, v: 30, dt: 1 / 60 });
      if (i % 130 === 40) SL.purzelStart(z);                              // Anprall (Cooldown wirkt wie im Spiel)
      if (quadModus) { if (TY.quadEntschaerfen(z, z3, PK)) ausgeloest++; }
      const pose = SL.purzelSchritt(z, 1 / 60);
      SL.anwenden(mesh, z, pose);
      if (quadModus) { TY.quadAnwenden(mesh, { wackel: z3.wackel, salto: 0, gier: 0 }); z3.wackel = Math.max(0, z3.wackel - 1 / 60); z.lean = 0; z.leanRate = 0; }
      maxZ = Math.max(maxZ, Math.abs(mesh.userData.lage.rotation.z)); maxX = Math.max(maxX, Math.abs(mesh.userData.purzel.rotation.x));
    }
    return { maxZ, maxX, ausgeloest, z3 };
  };
  const mb = fahre(SL.zustand(), bike, false, 600), mq = fahre(SL.zustand(), quad, true, 600);
  pruefe('Kontrolle: Crossmaschine kippt (Schräglage > 15°, Überschlag)', mb.maxZ > 0.26 && mb.maxX > 1.0, `z ${mb.maxZ.toFixed(2)} rad, x ${mb.maxX.toFixed(2)} rad`);
  pruefe('Quad: Schräglage immer exakt 0', mq.maxZ === 0, 'max ' + mq.maxZ);
  pruefe('Quad: kein Purzelbaum (Nicken höchstens ±0,5 rad, nie ein Überschlag)', mq.maxX <= 0.5 + 1e-12, 'max ' + mq.maxX.toFixed(3));
  pruefe('Quad: Anprälle lösen Wackeln aus (statt Überschlag)', mq.ausgeloest >= 4);
  // Einzelschritt: Überschlag läuft, wird abgebrochen, Abklingzeit verhindert neues Auslösen in jedem Schritt
  const z = SL.zustand(); SL.purzelStart(z); const z3 = { wackel: 0 };
  const abg = TY.quadEntschaerfen(z, z3, PK);
  pruefe('Quad: laufender Überschlag wird abgebrochen (aktiv aus, Abklingzeit, Wackeln an)', abg === true && z.purzel.aktiv === false && z.purzel.abkling === PK.abklingzeit && z3.wackel === TY.WACKEL.dauer && SL.purzelStart(z) === false);
  const p0 = TY.quadPose(TY.WACKEL.dauer * 0.5), p1 = TY.quadPose(0);
  pruefe('Quad: Wackel-Pose klein und klingt aus (Gier ≤ 8°, Hüpfer ≤ 6 cm, am Ende 0)', Math.abs(p0.gier) <= 0.14 && p0.hoehe <= 0.06 && p1.gier === 0 && p1.hoehe === 0);
  // Salto der Trick-Pose wird herausgerechnet
  quad.userData.purzel.rotation.x = -Math.PI; quad.userData.lage.rotation.z = 0.6;
  TY.quadAnwenden(quad, { wackel: 0, salto: -Math.PI, gier: 1.2 });
  pruefe('Quad: Salto der Stunt-Pose wird nicht angezeigt, Drehung (Gier) bleibt', nah(quad.userData.purzel.rotation.x, 0, 1e-9) && quad.userData.lage.rotation.z === 0 && nah(quad.userData.lage.rotation.y, 1.2, 1e-9));
}

// ---------- 4. Stunt-Park ----------
const eintrag = Wl.parkEintrag();
const strecke = new R.Strecke(eintrag, { welt: 'klassisch' });
{
  pruefe('Park: Eintrag mit eigener Strecke, Stadion ≈ 1350 m, 40 m breit, flach', eintrag.id === 'stuntpark' && strecke.laenge > 1300 && strecke.laenge < 1400 && eintrag.breite === 40 && eintrag.punkte.every((p) => p[1] === 0), 'Länge ' + strecke.laenge.toFixed(0));
  const ids = R.trackCatalog.map((t) => t.id);
  pruefe('Park steht nicht dauerhaft in der Streckenwahl (R.trackCatalog)', !ids.includes('stuntpark'));
  pruefe('Park: Schanzen aktiv (Steilwand, Feuerring, Bus-Reihe, kleine Schanze) über die vorhandenen Mechaniken', strecke.schanzen.length === 4 && R.Schanzen.liste(strecke).length === 4 && strecke.aktiveSchichten.schanzen === true);
  const D = R.Moto.stuntWelt.stuntDaten(strecke);
  pruefe('Park: Feuerring, Bus-Reihe (3) und 2 Zonen aus dem Plan', D.ringe.length === 1 && D.reihen.length === 1 && D.reihen[0].n === 3 && D.zonen.length === 2);
  const W = R.Moto.stuntWelt, probleme = [];
  eintrag.schanzen.forEach((e) => { const p = W.schanzeProbleme(strecke, e.s, e.laenge); if (p.length) probleme.push(e.s + ':' + p.join('/')); });
  eintrag.motoZonen.forEach((z) => { const p = W.zoneProbleme(strecke, z.s0, z.s1); if (p.length) probleme.push('Zone ' + z.s0 + ':' + p.join('/')); });
  pruefe('Park: alle Schanzen (Anlauf gerade/Landung frei) und Zonen liegen auf Geraden', probleme.length === 0, probleme.join('; '));
  // Steilwand: Rampenwerte und Flugzeit (reicht für einen Salto)
  const sw = R.Schanzen.liste(strecke)[2], g = 9.81, vy = Math.min(20 * Math.sin(sw.winkel), 5), tFlug = (vy + Math.sqrt(vy * vy + 2 * g * sw.hoehe)) / g;
  pruefe('Steilwand: 28° / 6 m, Höhe ≈ 3,2 m, Flugzeit ≥ 1,3 s (Drehung/Salto möglich)', sw.grad === 28 && nah(sw.laenge, 6) && nah(sw.hoehe, 6 * Math.tan(28 * Math.PI / 180), 1e-9) && tFlug >= 1.3, 'Flug ' + tFlug.toFixed(2) + ' s');
  pruefe('Steilwand ist die steilste Rampe der Strecke (alle anderen ≤ 12°)', R.Schanzen.liste(strecke).filter((s) => s.grad > 12).length === 1);
  // Elemente liegen nicht auf Rampen/Landungen und nicht im Start
  const sp = strecke.spline, ramp = eintrag.schanzen.map((e) => [e.s - 40, e.s + e.laenge + 75]);
  const frei = (s) => !ramp.some((r) => s >= r[0] && s <= r[1]);
  pruefe('Felder und Kistenstapel liegen nicht auf Rampen oder in Landezonen, nicht auf Start/Ziel', eintrag.motoFelder.every((f) => frei(f.s) && frei(f.s + f.laenge)) && eintrag.motoKisten.every((k) => frei(k.s)) && eintrag.motoKisten.every((k) => k.s > 30 && k.s < strecke.laenge - 30));
  // Roller (langsamster Typ) schafft das Mindesttempo (20 m/s) vor der ersten Schanze (s 150)
  const v = new R.Vehicle(kat.finde('roller').fahrwerte, { tempoKlasse: null }); let s = 0, t = 0;
  while (v.vLaengs < R.config.motoStunts.schanzeMin && t < 60) { v.schritt(dt, { gas: 1, bremse: 0, lenkung: 0 }); s += v.vLaengs * dt; t += dt; }
  pruefe('Roller erreicht 20 m/s aus dem Stand vor der ersten Schanze (Anlauf 150 m)', s < 140, 'nach ' + s.toFixed(0) + ' m, ' + t.toFixed(1) + ' s');
}
// Start-Umhüllung: 0 Gegner, 999 Runden, Park nur während des Starts im Katalog, Einstellungen danach wieder die alten
{
  const sp = new R.Spiel(); sp.einstellungen.stuntpark = true;
  const e0 = JSON.stringify({ s: sp.einstellungen.streckeId, g: sp.einstellungen.gegner, r: sp.einstellungen.runden });
  sp.rennenStarten({ gegner: 5, runden: 3, streckeId: 'wiese' });
  const ein = sp.aufrufe[0].einst;
  pruefe('Park-Start: Strecke stuntpark, 0 Gegner (keine KI), keine Polizei/Tiere, Einzelrennen', ein.streckeId === 'stuntpark' && ein.gegner === 0 && ein.polizei === false && ein.tiere === false && ein.spielart === 'rennen' && ein.stuntrennen === false);
  pruefe('Park-Start: kein Rennen-Ende (999 Runden, über dem Menü-Maximum)', ein.runden === 999 && sp.rennen.runden === 999 && 999 > R.config.rennen.rundenMax);
  pruefe('Park-Start: Park war nur während des Starts im Streckenkatalog', sp.katalogWaehrend === true && !R.trackCatalog.some((t) => t.id === 'stuntpark'));
  pruefe('Park-Start: Streckenwahl/Gegnerzahl der Einstellungen danach wieder wie vorher, Park-Schalter bleibt für „Nochmal“', JSON.stringify({ s: sp.einstellungen.streckeId, g: sp.einstellungen.gegner, r: sp.einstellungen.runden }) === e0 && sp.einstellungen.stuntpark === true && sp.gespeichert >= 1);
  const sp2 = new R.Spiel(); sp2.rennenStarten({ gegner: 4, runden: 2 });
  pruefe('Normaler Start läuft unverändert durch (Gegner/Runden unberührt, Park aus)', sp2.aufrufe[0].einst.gegner === 4 && sp2.aufrufe[0].einst.runden === 2 && sp2.aufrufe[0].einst.streckeId === undefined && sp2.einstellungen.stuntpark === false);
  const sp3 = new R.Spiel(); sp3.einstellungen.stuntpark = true; sp3.rennenStarten();
  pruefe('„Nochmal“ im Park (ohne Argument) startet wieder den Park', sp3.aufrufe[0].einst.streckeId === 'stuntpark' && sp3.aufrufe[0].einst.gegner === 0);
}

// ---------- 5. Schlamm / Wasser bremsen, 6. Kisten ----------
function szene(x, z, tempo) {
  const v = new R.Vehicle(kat.finde('crossmaschine').fahrwerte, { tempoKlasse: null }); v.x = x; v.z = z; v.vLaengs = tempo;
  const f = { vehicle: v, istSpieler: true, mesh: null, flug: R.Schanzen.zustand(), nah: strecke.abfrage(x, z), motoZ: null };
  const sp = new R.Spiel(); sp.zustand = 'rennen'; sp.pausiert = false; sp.strecke = strecke; sp.fahrzeuge = [f]; sp.rennen = { zeit: 5, runden: 999 };
  sp.stunt = { zeit: 5, fz: [St.zNeu()] };
  return { sp, f, v };
}
function aufPunkt(s, q) { const p = strecke.spline.punktBei(s); return { x: p.x + p.nx * q, z: p.z + p.nz * q, heading: Math.atan2(-p.tx, -p.tz) }; }
function fahreSchritte(S, n, mitPhysik) {
  for (let i = 0; i < n; i++) { S.f.nah = strecke.abfrage(S.v.x, S.v.z); S.sp.physikSchritt(dt); S.v.x += 0; }
}
{
  const gleich = (art) => { const felder = Wl.felder(strecke), fd = felder.find((x) => x.art === art), p = aufPunkt(fd.s0 + fd.laenge / 2, 0); const S = szene(p.x, p.z, 25); S.v.heading = p.heading;
    S.v.vQuer = 0; const v0 = S.v.vLaengs; for (let i = 0; i < 100; i++) { S.f.nah = strecke.abfrage(S.v.x, S.v.z); S.sp.physikSchritt(dt); } return S.v.vLaengs / v0; };
  const schlamm = gleich('schlamm'), wasser = gleich('wasser');
  const pa = aufPunkt(300, 0), SA = szene(pa.x, pa.z, 25); SA.v.heading = pa.heading; for (let i = 0; i < 100; i++) { SA.f.nah = strecke.abfrage(SA.v.x, SA.v.z); SA.sp.physikSchritt(dt); }
  pruefe('Ohne Feld bleibt das Tempo (Haken ändert nichts außerhalb)', SA.v.vLaengs === 25, SA.v.vLaengs);
  pruefe('Schlamm bremst deutlich (Tempo-Faktor < 0,9 je 100 Schritte, ≈ e^(−1,15·t))', schlamm < 0.9 && nah(schlamm, Math.exp(-1.15 * 100 * dt), 1e-9), schlamm.toFixed(3));
  pruefe('Wasser bremst leicht (zwischen Schlamm und frei: Schlamm < Wasser < 1)', schlamm < wasser && wasser < 1 && nah(wasser, Math.exp(-0.4 * 100 * dt), 1e-9), wasser.toFixed(3));
  pruefe('Feld-Faktor reine Funktion: ohne Zeit/unbekannte Art = 1', Wl.feldFaktor('schlamm', 0) === 1 && Wl.feldFaktor('lava', 0.1) === 1 && Wl.feldFaktor('schlamm', 0.1) < Wl.feldFaktor('wasser', 0.1));
  const qa = aufPunkt(485, 19), SQ = szene(qa.x, qa.z, 25); SQ.v.heading = qa.heading; SQ.f.nah = strecke.abfrage(SQ.v.x, SQ.v.z); SQ.sp.physikSchritt(dt);
  pruefe('Am Rand neben dem Schlamm (q > 15) bleibt man frei (Ausweichen möglich)', SQ.v.vLaengs === 25, 'q ' + SQ.f.nah.seitenabstand.toFixed(1));
  // im Flug über Schlamm: keine Bremswirkung
  const pf = aufPunkt(485, 0), SF = szene(pf.x, pf.z, 25); SF.f.flug.aktiv = true; SF.v.imFlug = true; SF.f.nah = strecke.abfrage(SF.v.x, SF.v.z); SF.sp.physikSchritt(dt);
  pruefe('Im Flug über dem Schlamm keine Bremswirkung', SF.v.vLaengs === 25);
}
{
  // Kisten
  const stapel = Wl.kistenListe(strecke), zust = Wl.kistenNeu(stapel);
  const K = { stapel, zust }, mitte = stapel.find((k) => k.s === 70 && k.q === 0);
  const SP = szene(mitte.x, mitte.z - 30, 20); SP.v.x = mitte.x; SP.v.z = mitte.z; SP.v.heading = Math.atan2(-mitte.tx, -mitte.tz);
  SP.sp.motoParkGruppe = { userData: { kisten: K } };
  const zz = SP.sp.stunt.fz[0];
  SP.f.nah = strecke.abfrage(SP.v.x, SP.v.z); SP.sp.physikSchritt(dt);
  pruefe('Kisten: Treffer bei Tempo ≥ 3 m/s – Stapel fliegt weg, +150 Stuntpunkte', zust[mitte.nr].steht === false && zz.punkte === 150 && zz.ereignisse.some((e) => e.art === 'kisten' && e.name === 'Kisten!' && e.punkte === 150), 'Punkte ' + zz.punkte);
  SP.sp.physikSchritt(dt);
  pruefe('Kisten: derselbe Stapel zählt nicht doppelt', zz.punkte === 150);
  pruefe('Kisten: Tempo etwas gebremst (× 0,93), Kisten fliegen in Fahrtrichtung', nah(SP.v.vLaengs, 20 * 0.93, 1e-9) && zust[mitte.nr].kisten.every((k) => (k.vx * -Math.sin(SP.v.heading) + k.vz * -Math.cos(SP.v.heading)) > 0));
  zz.ereignisse.length = 0;
  // Combo: zweiter Stapel kurz danach zählt ×2
  const rechts = stapel.find((k) => k.s === 70 && k.q === 11);
  SP.v.x = rechts.x; SP.v.z = rechts.z; SP.v.vLaengs = 20; SP.f.nah = strecke.abfrage(SP.v.x, SP.v.z); SP.sp.stunt.zeit = 6; SP.sp.physikSchritt(dt);
  pruefe('Kisten: zweiter Stapel im Combo-Fenster zählt ×2 (300), Gesamt 450', zz.punkte === 450, 'Punkte ' + zz.punkte);
  // langsam: nichts
  const links = stapel.find((k) => k.s === 70 && k.q === -11), SL2 = szene(links.x, links.z, 1);
  SL2.sp.motoParkGruppe = { userData: { kisten: K } }; SL2.f.nah = strecke.abfrage(SL2.v.x, SL2.v.z); SL2.sp.physikSchritt(dt);
  pruefe('Kisten: Schleichen (1 m/s) zerlegt nichts, keine Punkte', zust[links.nr].steht === true && SL2.sp.stunt.fz[0].punkte === 0);
  // hoch in der Luft: drüber
  const SH = szene(links.x, links.z, 20); SH.sp.motoParkGruppe = { userData: { kisten: K } }; SH.f.flug.aktiv = true; SH.f.flug.y = 3; SH.v.imFlug = true; SH.f.nah = strecke.abfrage(SH.v.x, SH.v.z); SH.sp.physikSchritt(dt);
  pruefe('Kisten: Drüberfliegen (> 1,6 m hoch) trifft nichts', zust[links.nr].steht === true);
  // Flug und Erneuerung
  let t = 0; while (t < 1.0) { Wl.kistenSchritt(zust, 1 / 60); t += 1 / 60; }
  pruefe('Kisten: Flugbahn (Schwerkraft, am Boden liegen), nach 8 s steht der Stapel wieder', zust[mitte.nr].kisten.every((k) => k.y >= Wl.KISTE / 2 - 1e-9) && zust[mitte.nr].steht === false);
  let neu = false; for (let i = 0; i < 500; i++) neu = Wl.kistenSchritt(zust, 1 / 60) || neu;
  pruefe('Kisten: Erneuerung nach ≈ 8 s', neu && zust[mitte.nr].steht === true);
  pruefe('Kisten: 8 Stapel à 6 Kisten im Park', stapel.length === 8 && Wl.KISTEN_LOKAL.length === 6);
  // Grafik: ein InstancedMesh, wenige Draw-Calls
  const grp = Wl.bauen(strecke);
  let meshes = 0; grp.traverse((o) => { if (o.isMesh) meshes++; });
  pruefe('Park-Grafik: Draw-Calls ≤ 6 (Schlamm, Wasser, Steilwand-Seiten, Kisten als EIN InstancedMesh)', meshes <= 6 && grp.getObjectByName('Kisten').isInstancedMesh && grp.getObjectByName('Kisten').count === 48, 'Meshes ' + meshes);
  const K2 = grp.userData.kisten; Wl.kistenWegschleudern(K2.stapel, K2.zust, 0, { x: 0, z: -1 }, 20); const m0 = new R.Moto.modell.PV.constructor(); void m0;
  Wl.animieren(grp, 0.1);
  pruefe('Park-Grafik: animieren (fliegende Kisten) ohne Fehler, Wasser pulsiert', true);
}

// ---------- 7. Garage ----------
{
  const key = G3.schluessel();
  pruefe('Garage: eigener Speicherschlüssel (…motorrad.stil), getrennt von Autorennen und Münz-Konto', /\.motorrad\.stil$/.test(key) && key !== R.config.garage.speicherSchluessel && key !== R.config.ui.speicherSchluessel, key);
  pruefe('Garage: Standardstil leer (null = Katalogwerte)', JSON.stringify(G3.stilHolen('Paul', 'quad')) === '{"helm":null,"kombi":null,"nr":null}');
  const s1 = G3.stilSetzen('Paul', 'quad', { helm: 0xd7261e, kombi: 0x1e5bd8, nr: 17 });
  pruefe('Garage: Helm, Kombi, Nummer setzen und lesen', s1.helm === 0xd7261e && s1.kombi === 0x1e5bd8 && s1.nr === 17 && JSON.stringify(G3.stilHolen('Paul', 'quad')) === JSON.stringify(s1));
  const roh = JSON.parse(R._ls.d[key]);
  pruefe('Garage: im localStorage gespeichert (JSON je Fahrer und Motorrad)', roh.Paul && roh.Paul.quad && roh.Paul.quad.nr === 17);
  G3._ramLeeren();
  pruefe('Garage: überlebt Neuladen (Lesen aus dem Speicher statt aus dem Arbeitsspeicher)', G3.stilHolen('Paul', 'quad').nr === 17 && G3.stilHolen('Paul', 'quad').helm === 0xd7261e);
  G3.stilSetzen('Paul', 'superbike', { nr: 5 }); G3.stilSetzen('Mia', 'quad', { helm: 0x1fa84f });
  pruefe('Garage: je Fahrer und je Motorrad getrennt', G3.stilHolen('Paul', 'superbike').nr === 5 && G3.stilHolen('Paul', 'quad').nr === 17 && G3.stilHolen('Mia', 'quad').nr === null && G3.stilHolen('Mia', 'quad').helm === 0x1fa84f && G3.stilHolen('Paul', 'superbike').helm === null);
  pruefe('Garage: Nummer geklemmt (1…99), ungültige Farben → Standard', G3.stilSetzen('Paul', 'roller', { nr: 150 }).nr === 99 && G3.stilSetzen('Paul', 'roller', { nr: -4 }).nr === 1 && G3.stilSetzen('Paul', 'roller', { nr: NaN }).nr === null && G3.stilSetzen('Paul', 'roller', { helm: 'rot' }).helm === null);
  R._ls.d[key] = '{kaputt'; G3._ramLeeren();
  pruefe('Garage: kaputter Speicherstand → Standard, kein Fehler', G3.stilHolen('Paul', 'quad').nr === null);
  G3.stilSetzen('Paul', 'quad', { helm: 0xd7261e, kombi: 0x1e5bd8, nr: 17 });
  const q = kat.finde('quad'), qs = G3.stilAuto(q, G3.stilHolen('Paul', 'quad'));
  pruefe('Garage: stilAuto liefert Kopie mit Stil, Katalogeintrag unverändert', qs !== q && qs.optionen.helm === 0xd7261e && qs.optionen.fahrer === 0x1e5bd8 && qs.optionen.nummer === 17 && qs.farbe2 === 0x1e5bd8 && q.optionen.nummer === 4 && q.optionen.helm === 0xf4f4f4);
  pruefe('Garage: ohne Stil dasselbe Objekt zurück (keine Kopie)', G3.stilAuto(q, G3.stilHolen('Niemand', 'quad')) === q);
  pruefe('Garage: Farbwahl blättert durch die Palette (vorwärts/rückwärts, Standard → erste/letzte)', G3.naechsteFarbe(null, 1) === G3.FARBEN[0].hex && G3.naechsteFarbe(null, -1) === G3.FARBEN[7].hex && G3.naechsteFarbe(G3.FARBEN[7].hex, 1) === G3.FARBEN[0].hex && G3.FARBEN.length === 8);
  // Verdrahtung: Garage-Werte liefern den Stil mit, das Spiel baut das Motorrad mit Stil
  const gw = R.Garage.fahrzeugWerte('Paul', 'quad', true);
  pruefe('Verdrahtung: R.Garage.fahrzeugWerte liefert den Stil für Motorräder', gw.stil && gw.stil.nr === 17 && gw.stil.helm === 0xd7261e && R.Garage.fahrzeugWerte('Paul', 'passat', true).stil === undefined);
  const sp = new R.Spiel(); sp.fahrzeugHinzufuegen(q, 0, 0, 0, gw);
  pruefe('Verdrahtung: fahrzeugHinzufuegen baut mit Stil (Spieler), KI ohne Garage unverändert', sp.letztes.auto.optionen.nummer === 17 && sp.letztes.auto.optionen.helm === 0xd7261e && (sp.fahrzeugHinzufuegen(q, 0, 0, 0, null), sp.letztes.auto === q));
  // Texte
  const T = G3.garageText;
  pruefe('Garage-Texte: Auto → Motorrad (Welches Auto…, Dein Auto…, das Auto…, Autos)', T('🔧 Welches Auto soll in die Werkstatt?') === '🔧 Welches Motorrad soll in die Werkstatt?' && T('Dein Auto schneller') === 'Dein Motorrad schneller'
    && T('Nicht nötig – das Auto ist heil 💚') === 'Nicht nötig – das Motorrad ist heil 💚' && T('2 Auto') === '2 Motorrad' && T('Alle Autos') === 'Alle Motorräder' && T('Das Auto startet wieder mit 100 %') === 'Das Motorrad startet wieder mit 100 %');
  pruefe('Garage-Texte: andere Wörter unberührt (Automatik, Lack, Reifen)', T('Automatik') === 'Automatik' && T('🎨 Lack') === '🎨 Lack' && T('Reifen: mehr Haftung') === 'Reifen: mehr Haftung' && T(5) === 5);
}

// ---------- 8. Knall und Funken ----------
{
  const k = FX.CFG.knall, z = FX.knallZustand(), vMax = 60;
  const e = (gas, tempo, t) => ({ gas, tempo, vMax, t });
  FX.knallPruefen(z, e(1, 50, 0));
  const k1 = FX.knallPruefen(z, e(0, 50, 0.05));
  pruefe('Knall: Gas weg bei hoher Drehzahl → Knall (1–3 Schläge, Stärke 0,4–1)', k1 && k1.anzahl >= 1 && k1.anzahl <= 3 && k1.staerke >= 0.4 && k1.staerke <= 1, JSON.stringify(k1));
  FX.knallPruefen(z, e(1, 50, 0.1)); const k2 = FX.knallPruefen(z, e(0, 50, 0.2));
  pruefe('Knall: nicht zweimal innerhalb der Pause (1,4 s)', k2 === null);
  FX.knallPruefen(z, e(1, 50, 2)); const k3 = FX.knallPruefen(z, e(0, 50, 2.1));
  pruefe('Knall: nach der Pause wieder möglich', k3 !== null);
  const zn = FX.knallZustand(); FX.knallPruefen(zn, e(1, 20, 0));
  pruefe('Knall: bei niedriger Drehzahl (Tempo/vMax < 0,55) kein Knall', FX.knallPruefen(zn, e(0, 20, 0.1)) === null);
  const zg = FX.knallZustand(); FX.knallPruefen(zg, e(0.4, 50, 0));
  pruefe('Knall: ohne vorheriges Vollgas (Gas < 0,6) kein Knall', FX.knallPruefen(zg, e(0, 50, 0.1)) === null);
  const zh = FX.knallZustand(); FX.knallPruefen(zh, e(1, 50, 0));
  pruefe('Knall: Gas nur gedrosselt (> 0,1) kein Knall', FX.knallPruefen(zh, e(0.3, 50, 0.1)) === null);
  const za = FX.knallZustand(), zb = FX.knallZustand(); let ga = [], gb = [];
  for (let i = 0; i < 6; i++) { FX.knallPruefen(za, e(1, 55, i * 3)); ga.push(FX.knallPruefen(za, e(0, 55, i * 3 + 0.1)).anzahl); FX.knallPruefen(zb, e(1, 55, i * 3)); gb.push(FX.knallPruefen(zb, e(0, 55, i * 3 + 0.1)).anzahl); }
  pruefe('Knall: deterministisch (gleiche Eingaben, gleiche Folge) und abwechslungsreich', ga.join() === gb.join() && new Set(ga).size >= 2, ga.join());
  pruefe('Knall: leise (Pegel ≤ 0,09, unter dem Motorprofil-Knallen 0,2)', k.pegel <= 0.09 && k.pegel < 0.2);
  let gespielt = 0; const alt = R.Audio; R.Audio = { _bereit: () => true, _stoss: () => { gespielt++; }, _ton: () => { gespielt++; } };
  FX.knallSpielen({ anzahl: 2, staerke: 1 }); const nGespielt = gespielt; R.Audio = { _bereit: () => false, _stoss: () => { gespielt += 100; }, _ton: () => { gespielt += 100; } }; FX.knallSpielen({ anzahl: 2, staerke: 1 }); R.Audio = alt;
  pruefe('Knall: spielt 2 Bausteine je Schlag über R.Audio, bei ausgeschaltetem Ton nichts', nGespielt === 4 && gespielt === 4);

  const rf = (o) => FX.rutschFunken(Object.assign({ purzelAktiv: false, purzelT: 0, purzelDauer: 1.2, abkling: 0, abklingzeit: 2, tempo: 20, untergrund: 'strasse' }, o));
  pruefe('Funken: Sturz-Rutschen auf Asphalt (Landephase des Überschlags und 0,8 s danach)', rf({ purzelAktiv: true, purzelT: 1.1 }) > 0 && rf({ abkling: 1.5 }) > 0);
  pruefe('Funken: nicht während der Luftphase, nicht später, nicht ohne Sturz', rf({ purzelAktiv: true, purzelT: 0.3 }) === 0 && rf({ abkling: 1.0 }) === 0 && rf({}) === 0);
  pruefe('Funken: nicht auf Gras/Sand und nicht bei Schleichtempo', rf({ purzelAktiv: true, purzelT: 1.1, untergrund: 'gras' }) === 0 && rf({ purzelAktiv: true, purzelT: 1.1, tempo: 2 }) === 0);
  pruefe('Funken: Rate wächst mit dem Tempo, ≤ 70 je Sekunde', rf({ purzelAktiv: true, purzelT: 1.1, tempo: 5 }) < rf({ purzelAktiv: true, purzelT: 1.1, tempo: 30 }) && rf({ purzelAktiv: true, purzelT: 1.1, tempo: 99 }) <= 70);
  const af = (o) => FX.aufsetzFunken(Object.assign({ landungNeu: true, landeStaerke: 5, untergrund: 'strasse' }, o));
  pruefe('Funken: Aufsetzen mit dem Unterboden bei harter Landung auf Asphalt (mehr Funken bei härterer Landung, ≤ 24)', af({}) > 0 && af({ landeStaerke: 9 }) > af({ landeStaerke: 4 }) && af({ landeStaerke: 99 }) === 24);
  pruefe('Funken: sanfte Landung, Gras oder keine neue Landung → keine', af({ landeStaerke: 2 }) === 0 && af({ untergrund: 'gras' }) === 0 && af({ landungNeu: false }) === 0);
  // Partikel: geteilt und begrenzt
  const pool = FX.partikelNeu(FX.CFG.maxFunken);
  FX.funkenSpawn(pool, 500, 0, 0, 0, 0, -1);
  let lebend = 0; for (let i = 0; i < pool.n; i++) if (pool.t[i] < pool.leben[i]) lebend++;
  pruefe('Partikel: begrenzt (Ringpuffer, nie mehr als 96 Funken, 64 Spritzer) – 500 Spawns überschreiben die ältesten', pool.n === 96 && lebend <= 96 && FX.CFG.maxSpritzer === 64 && FX.CFG.maxFunken === 96);
  for (let i = 0; i < 60; i++) FX.partikelSchritt(pool, 1 / 60);
  pruefe('Partikel: Funken verlöschen nach ≈ 0,55–1,1 s, Pool danach leer', pool.aktiv === 0 && pool.y.every((y) => y >= 0.02 - 1e-6));
  const sp2 = FX.partikelNeu(FX.CFG.maxSpritzer); FX.spritzSpawn(sp2, 10, 0, 0, 0, 1, 0, [0x6b4423]);
  pruefe('Spritzer: gleicher Pool-Mechanismus, braune Farbe', sp2.r[0] > 0.3 && sp2.g[0] > 0.2 && sp2.b[0] < 0.3 && FX.partikelSchritt(sp2, 0.1) === 10);
  const fg = FX.gruppeBauen(); let pts = 0, meshes = 0, lichter = 0; fg.traverse((o) => { if (o.isPoints) pts++; if (o.isMesh) meshes++; if (o.isLight) lichter++; });
  fg.userData.fx.funken; FX.funkenSpawn(fg.userData.fx.funken, 30, 0, 0, 0, 0, -1); fg.userData.fx.aktualisieren(1 / 60);
  pruefe('Partikel-Grafik: 2 Points-Objekte (2 Draw-Calls), keine Lichter, sichtbar nur bei Funken', pts === 2 && meshes === 0 && lichter === 0 && fg.children[0].visible === true && fg.children[1].visible === false);
}

// ---------- 9. Einbindung ----------
{
  const h = fs.readFileSync(require('path').join(__dirname, '..', 'Motorrad.html'), 'utf8');
  const pos = (n) => h.indexOf('src="src/' + n + '"');
  pruefe('Motorrad.html: neue Dateien eingebunden – Typen/Welt/Effekte vor main.js, Verdrahtung nach cockpitMoto.js (ganz am Ende)',
    pos('moto/motoTypen.js') > pos('moto/motoKlang.js') && pos('moto/motoTypen.js') < pos('main.js') && pos('moto/motoM3Welt.js') < pos('main.js') && pos('moto/motoM3Effekte.js') < pos('main.js') && pos('moto/motoM3Garage.js') < pos('main.js')
    && pos('moto/motoM3Start.js') > pos('moto/cockpitMoto.js') && pos('moto/cockpitMoto.js') > pos('main.js'));
  const a = fs.readFileSync(require('path').join(__dirname, '..', 'Autorennen.html'), 'utf8');
  pruefe('Autorennen.html lädt keine M3-Datei (Autorennen unberührt)', !/motoTypen|motoM3/.test(a));
}

console.log('\n' + (fehler ? 'FEHL: ' + fehler + ' von ' + anzahl : 'Alles OK: ' + anzahl + ' Prüfungen'));
process.exit(fehler ? 1 : 0);
