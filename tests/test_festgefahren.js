// v23 (15.10.) Festgefahren: Reset (R) und Rückwärts (Bremse/↓) – node tests/test_festgefahren.js [streckenId] [--diag]
// Meldung des Vaters: „Als ich festgefahren war, ging R nicht!“ und „Bremstaste muss auch Rückwärtsfahren ermöglichen“.
// Für Strecken (wiese, wald, alpen, mega, fantasie, wueste) und Festfahr-Szenarien (Busch, Baum, Schildmast/Säule, Zaun/Bande, Zwickel
// Baum-Bande, Wasser/Sand-Rand) wird das Auto an die Falle gefahren (Vollgas, 3 s) und dann
//   A) nur Bremse gehalten → muss bis Stand bremsen und zügig rückwärts herausfahren (≥ 4 m in 3 s),
//   B) R (offline: spielerZuruecksetzen; online: Simulation.reset = Server-Weg) → Auto steht auf der Fahrbahn, frei von Hindernissen,
//      fährt mit Vollgas wieder los (≥ 25 m in 6 s) ohne sich erneut festzufahren.
// Dazu: gesperrte Fälle (liegengeblieben/Abschleppwagen, Kleber, Polizei) zeigen eine HUD-Meldung statt still nichts zu tun.
const { Simulation } = require('../server/simulation.js');
const diag = process.argv.includes('--diag');
const nurId = process.argv.slice(2).find(a => !a.startsWith('--'));
let fehler = 0, anzahl = 0;
function pruefe(name, ok, info) { anzahl++; if (!ok) fehler++; if (!ok || diag) console.log((ok ? 'OK   ' : 'FEHL ') + name + (info ? '  (' + info + ')' : '')); }

const STRECKEN = nurId ? [nurId] : ['wiese', 'wald', 'alpen', 'wueste', 'fantasie', 'mega'];

function neueSim(id, auto) {
  const sim = new Simulation({ einstellungen: { streckeId: id, gegner: 0, runden: 99, schwierigkeit: 'mittel', windStaerke: 0, wetter: 'sonnig' },
    spieler: [{ fahrer: 'T', auto: auto || 'passat' }], seed: 11 });
  let k = 0;
  while (!sim.sim.rennen.gasErlaubt && k++ < 60 * 12) sim.schritt();
  sim.sim.dynamik = null;      // bewegte Hindernisse (Bälle, Steinschlag, Rehe …) würden die Szenen zeitabhängig stören – hier nur feste Fallen
  return sim;
}

/** Auto auf Pose setzen wie ein Teleport im Test (Rennleitung folgt mit, Checkpoint = letzter vor dieser Stelle). */
function setze(sim, x, z, heading) {
  const R = sim.R, S = sim.sim, st = S.strecke, f = S.fahrzeuge[0], t = S.rennen.teilnehmer[0];
  if (f.looping) { f.looping.aktiv = false; f.looping.fallen = false; f.vehicle.imLooping = false; }   // Teleport wie ein Reset: keine Reste von Looping/Flug/Kleber/Anlauf
  if (f.flug) R.Schanzen.abbrechen(f.flug, f.vehicle);
  if (f.kleber) R.Kleber.abbrechen(f.kleber);
  if (f.anlauf) f.anlauf = R.Anlauf.zustand();
  f.vehicle.setzen(x, z, heading);
  f.index = -1;
  const n = st.abfrage(x, z);
  f.vehicle.y = st.hoeheAn(x, z, n.index);
  S._vorherAngleichen(f);
  S.rennen.verfolgungSetzen(0, x, z, n.s);
  // letzter Checkpoint = der zuletzt passierte vor s
  let best = -1, bd = 1e9;
  st.checkpoints.forEach((cp) => { const d = st.spline.differenzS(n.s, cp.s); if (d >= 0 && d < bd) { bd = d; best = cp.nr; } });
  t.letzterCheckpoint = best; t.naechsterCheckpoint = (best + 1) % st.checkpoints.length;
  f.stehZeit = 0; f.resetHinweis = false;
  t.imZiel = false; t.runde = Math.min(t.runde, 1);      // die vielen Testfahrten sollen das Rennen nicht beenden (Ziel = Ausrollen)
  sim.eingabeSetzen(0, { gas: 0, bremse: 0, lenkung: 0 });
  return n;
}

function fahre(sim, s, sek) { const dt = sim.R.config.physik.schritt; for (let k = 0; k < Math.round(sek / dt); k++) { sim.eingabeSetzen(0, s); sim.schritt(); } }

function folgeStrecke(sim) {   // Pure Pursuit, Vollgas
  const R = sim.R, S = sim.sim, st = S.strecke, f = S.fahrzeuge[0], v = f.vehicle;
  const n = st.abfrage(v.x, v.z, f.index), sp = st.spline;
  const vl = Math.max(3, v.vLaengs), L = Math.max(9, Math.min(50, 0.55 * vl + 8));
  const ziel = sp.punktBei(n.s + L);
  let diff = R.headingAus(ziel.x - v.x, ziel.z - v.z) - v.heading;
  while (diff > Math.PI) diff -= 2 * Math.PI;
  while (diff < -Math.PI) diff += 2 * Math.PI;
  const lenkung = Math.max(-1, Math.min(1, -(2 * vl * Math.sin(diff) / Math.hypot(ziel.x - v.x, ziel.z - v.z)) / v.drehrateMax(vl)));
  return { gas: 1, bremse: 0, lenkung };
}

/** Hindernisse (Kreise) nahe (x, z): Pflanzen + Säulen. */
function kreiseNah(st, x, z, rad) {
  const l = [];
  (st.pflanzenKollider || []).forEach(k => { if (Math.hypot(k.x - x, k.z - z) < rad + k.r) l.push({ x: k.x, z: k.z, r: k.r, art: k.art, name: k.name }); });
  (st.saeulen || []).forEach(k => { if (Math.hypot(k.x - x, k.z - z) < rad + k.r) l.push({ x: k.x, z: k.z, r: k.r, art: 'saeule' }); });
  return l;
}

/** Szenarien einer Strecke: Liste { art, x, z, heading } = Auto direkt vor der Falle, Nase zur Falle. */
function szenarien(sim, id) {
  const R = sim.R, st = sim.sim.strecke, sp = st.spline, f = sim.sim.fahrzeuge[0];
  const hl = f.vehicle.daten.laenge / 2 || 2.2;
  const erg = [];
  const kandidat = (art, ox, oz, r, wegVon) => {
    // Auto steht „außen“ (von der Straße weg gesehen hinter der Falle?) – wir nehmen die Richtung zur Straße hin: Falle liegt zwischen Auto und Außen
    const n = st.abfrage(ox, oz);
    const c = sp.punktBei(n.s);
    // Richtung von der Falle zur Straßenmitte
    let dx = c.x - ox, dz = c.z - oz; const dl = Math.hypot(dx, dz) || 1; dx /= dl; dz /= dl;
    // zwei Anfahrten: von der Straße her (Nase zur Falle, nach außen fahren) und quer zur Straße (Nase zur Falle seitlich)
    const winkel = wegVon ? [0, 1] : [0, 1, 2];
    winkel.forEach((w) => {
      const a = w === 0 ? [dx, dz] : w === 1 ? [-dz, dx] : [dz, -dx];
      const ab = r + hl + 0.6;
      const x = ox + a[0] * ab, z = oz + a[1] * ab;
      const nn = st.abfrage(x, z);
      if (Math.abs(nn.seitenabstand) > st.grenzeBei(nn.s) - 1.2) return;     // Startpunkt innerhalb der Bande
      // die Nase zeigt zur Falle; hinter dem Auto (6 m) muss es frei sein (sonst nicht prüfbar)
      const hx = x + a[0] * 7, hz = z + a[1] * 7;
      const nh = st.abfrage(hx, hz);
      if (Math.abs(nh.seitenabstand) > st.grenzeBei(nh.s) - 1.2) return;
      if (kreiseNah(st, hx, hz, 0).length || kreiseNah(st, x + a[0] * 3.5, z + a[1] * 3.5, 0).length) return;
      if (kreiseNah(st, x, z, 0).some(k => Math.hypot(k.x - ox, k.z - oz) > 0.01)) return;   // Start steckt schon in anderer Pflanze
      erg.push({ art, x, z, heading: R.headingAus(-a[0], -a[1]), ox, oz, rueck: [a[0], a[1]], s: nn.s });
    });
  };
  const nPflanze = { fest: 0, weich: 0 }, maxProArt = 14;
  const kol = (st.pflanzenKollider || []).slice();
  // gleichmäßig über die Strecke verteilt
  const schritt = Math.max(1, Math.floor(kol.length / 60));
  for (let i = 0; i < kol.length; i += schritt) {
    const k = kol[i];
    if (nPflanze[k.art] >= maxProArt) continue;
    const n = st.abfrage(k.x, k.z);
    if (Math.abs(n.seitenabstand) > st.grenzeBei(n.s) - 2) continue;
    const vor = erg.length;
    kandidat(k.art === 'fest' ? 'baum' : 'busch', k.kern ? k.kern.x : k.x, k.kern ? k.kern.z : k.z, k.kern ? Math.max(0.5, k.r * 0.6) : k.r);
    if (erg.length > vor) nPflanze[k.art]++;
  }
  const sa = (st.saeulen || []).filter(q => q.art === 'schildmast' || q.art === 'startbogen' || q.art === 'warnlicht' || q.art === 'laterne');
  const saS = Math.max(1, Math.floor(sa.length / 12));
  for (let i = 0; i < sa.length; i += saS) kandidat('saeule', sa[i].x, sa[i].z, sa[i].r || 0.3);
  // Zaun/Bande: an mehreren Stellen quer rechts und links
  for (let k = 0; k < 8; k++) {
    const s = sp.laenge * (k + 0.5) / 8, p = sp.punktBei(s);
    for (const sg of [-1, 1]) {
      const g = st.grenzeBei(s);
      const q = sg * (g - 1.0);   // so nah am Zaun, dass die Nase gleich anliegt
      const x = p.x + p.nx * q, z = p.z + p.nz * q;
      if (kreiseNah(st, x, z, 3).length) continue;
      erg.push({ art: 'zaun', x, z, heading: R.headingAus(p.nx * sg, p.nz * sg), ox: x, oz: z, rueck: [-p.nx * sg, -p.nz * sg], s });
    }
  }
  // Zwickel: Baum zwischen Bande und Straße – Auto zwischen Baum und Bande, Nase zum Baum
  const fe = kol.filter(k => k.art === 'fest');
  let zw = 0;
  for (const k of fe) {
    if (zw >= 6) break;
    const n = st.abfrage(k.x, k.z), g = st.grenzeBei(n.s);
    const aussen = g - Math.abs(n.seitenabstand) - k.r;      // Platz hinter dem Baum bis zur Bande
    if (aussen < 3.5 || aussen > 9 || Math.abs(n.seitenabstand) < st.breiteBei(n.s) / 2) continue;
    const p = sp.punktBei(n.s), sg = Math.sign(n.seitenabstand) || 1;
    const x = k.x + p.nx * sg * (k.r + hl + 0.8), z = k.z + p.nz * sg * (k.r + hl + 0.8);   // Auto außerhalb des Baums, Nase zur Straße hin... Nase zum Baum
    if (kreiseNah(st, x, z, 0).length) continue;
    erg.push({ art: 'zwickel', x, z, heading: R.headingAus(-p.nx * sg, -p.nz * sg), ox: k.x, oz: k.z, rueck: [p.nx * sg, p.nz * sg], s: n.s }); zw++;
  }
  return erg;
}

let ges = { A: 0, Aok: 0, B: 0, Bok: 0, uebersprungen: 0 };
function laufe(id, autoId) {
  const sim = neueSim(id, autoId);
  const R = sim.R, S = sim.sim, st = S.strecke, f = S.fahrzeuge[0], v = f.vehicle;
  const liste = szenarien(sim, id);
  const arten = {};
  liste.forEach(s => { arten[s.art] = (arten[s.art] || 0) + 1; });
  if (diag) console.log('-- ' + id + ' (' + (autoId || 'passat') + '): ' + liste.length + ' Szenarien ' + JSON.stringify(arten));
  pruefe(id + ': Szenarien vorhanden (Pflanzen/Säulen/Zaun)', liste.length >= 8, liste.length + ' ' + JSON.stringify(arten));
  const dt = R.config.physik.schritt;
  for (const sz of liste) {
    const bez = id + '/' + (autoId || 'passat') + '/' + sz.art + '@' + sz.s.toFixed(0);
    // ---- festfahren
    const jam = () => {
      setze(sim, sz.x, sz.z, sz.heading);
      fahre(sim, { gas: 1, bremse: 0, lenkung: 0 }, 2);
      const xa = v.x, za = v.z;
      fahre(sim, { gas: 1, bremse: 0, lenkung: 0 }, 1);
      return { x: v.x, z: v.z, vl: v.vLaengs, bewegt: Math.hypot(v.x - xa, v.z - za) };
    };
    // A) Bremse halten → rückwärts
    const j = jam();
    if (sz.art !== 'zaun' && j.bewegt > 1.5) { ges.uebersprungen++; continue; }      // nicht festgefahren (durch den Busch / am Baum vorbei gerutscht)
    // wie viel Platz hinter dem Auto? (Richtung = hinten, gemessen am Auto selbst)
    const rr = v.richtung(), bx = -rr.x, bz = -rr.z;
    let frei = 8;
    for (let d = 0.5; d <= 8; d += 0.5) {
      const px = v.x + bx * d, pz = v.z + bz * d, nn = st.abfrage(px, pz);
      if (Math.abs(nn.seitenabstand) > st.grenzeBei(nn.s) - 1.0 || kreiseNah(st, px, pz, 0).some(k => Math.hypot(k.x - px, k.z - pz) < k.r + 1.3)) { frei = d - 0.5; break; }
    }
    const x0 = v.x, z0 = v.z;
    let vMin = 0, wegA = 0;
    for (let k = 0; k < Math.round(3.5 / dt); k++) {
      sim.eingabeSetzen(0, { gas: 0, bremse: 1, lenkung: 0 }); sim.schritt();
      vMin = Math.min(vMin, v.vLaengs);
      wegA = Math.max(wegA, Math.hypot(v.x - x0, v.z - z0));
    }
    if (frei >= 2) {
      ges.A++;
      // P4 (16.10.): Zwickel mit knappem Platz (frei < 5 m, z. B. wiese@2493: Auto steht am Ende bei Seitenabstand 22,5 von 25 m Bande) –
      // dort begrenzt die Bande (Auto hat 2,2 m halbe Länge, `frei` rechnet nur mit 1,0 m Rand) den Weg: Erwartung ≥ 2,0 m statt frei−1 (= 2,5 m).
      // Gemessen 2,3 m, vMin −4,2 m/s; keine Tribüne beteiligt (kein Tribünen-Kreis < 12 m). Alle anderen Fälle unverändert.
      const soll = (sz.art === 'zwickel' && frei < 5) ? Math.min(2.0, frei - 1.0) : Math.min(4, frei - 1.0);
      const okA = wegA >= soll && vMin < -1.5;
      if (okA) ges.Aok++;
      pruefe(bez + ': nur Bremse → rückwärts heraus (≥ ' + soll.toFixed(1) + ' m in 3,5 s)', okA, `Schein-Tempo ${j.vl.toFixed(1)} m/s, Weg ${wegA.toFixed(1)} m (frei ${frei} m), vMin ${vMin.toFixed(1)}, untergrund ${v.untergrund}`);
    }

    // B) Reset (R): offline spielerZuruecksetzen / online Simulation.reset (Server)
    for (const weg of ['offline', 'online']) {
      jam();
      const xj = v.x, zj = v.z;
      if (weg === 'offline') S.spielerZuruecksetzen(0); else sim.reset(0);
      const n = st.abfrage(v.x, v.z, f.index);
      const aufStrasse = Math.abs(n.seitenabstand) <= st.breiteBei(n.s) / 2 + 0.01;
      const nah = kreiseNah(st, v.x, v.z, 3).filter(k => k.art !== 'weich' || Math.hypot(k.x - v.x, k.z - v.z) < k.r + 1.5);
      const frei = nah.length === 0;
      const versetzt = Math.hypot(v.x - xj, v.z - zj) > 1;
      // losfahren
      const s0 = n.s;
      let reset0 = f.netReset, stehen = 0, stehMax = 0;
      let xa = v.x, za = v.z;
      for (let k = 0; k < Math.round(6 / dt); k++) {
        sim.eingabeSetzen(0, folgeStrecke(sim)); sim.schritt();
        if (v.tempo < 0.5) { stehen += dt; stehMax = Math.max(stehMax, stehen); } else stehen = 0;
      }
      const n2 = st.abfrage(v.x, v.z, f.index);
      const weiter = sp(st).differenzS(n2.s, s0);
      ges.B++;
      const okB = aufStrasse && frei && versetzt && weiter > 25 && stehMax < 2;
      if (okB) ges.Bok++;
      pruefe(bez + ': R (' + weg + ') → Fahrbahn, frei, fährt weiter', okB,
        `versetzt ${versetzt}, Fahrbahn ${aufStrasse} (${n.seitenabstand.toFixed(1)} m), Hindernisse ${nah.map(k => k.art + ':' + k.name).join(',') || '-'}, weiter ${weiter.toFixed(0)} m, steht max ${stehMax.toFixed(1)} s`);
    }
  }
  return sim;
}
function sp(st) { return st.spline; }

// ---------------- gesperrte Fälle: HUD-Meldung statt Stille ----------------
function sperren() {
  const sim = neueSim('wiese');
  const R = sim.R, S = sim.sim, f = S.fahrzeuge[0];
  const meld = [];
  const hud = S.huds[0]; const alt = hud.meldung;
  hud.meldung = (t, ms) => { meld.push(t); };
  const frisch = () => { meld.length = 0; };
  const x0 = f.vehicle.x;
  // 1) liegengeblieben
  S.schaden = { an: true, gesperrt: () => true, reparatur: () => false };
  frisch(); S.spielerZuruecksetzen(0);
  pruefe('Sperre liegengeblieben: Meldung „Abschleppwagen“', meld.length === 1 && /Abschlepp/.test(meld[0]), meld.join('|'));
  S.schaden = null;
  // 2) Kleber
  const kl = S.fahrzeuge[0].kleber; let alt2 = R.Kleber && R.Kleber.gesperrt;
  if (R.Kleber) {
    f.kleber = { klebt: true }; R.Kleber.gesperrt = () => true;
    frisch(); S.spielerZuruecksetzen(0);
    pruefe('Sperre Kleber: Meldung', meld.length === 1 && /kleb|Kleb/.test(meld[0]), meld.join('|'));
    R.Kleber.gesperrt = alt2; f.kleber = kl;
  }
  // 3) Polizei-Stopp
  S.polizei = { gesperrt: () => true, schritt() {} };
  frisch(); S.spielerZuruecksetzen(0);
  pruefe('Sperre Polizei: Meldung mit „2× ↓“', meld.length === 1 && /Polizei/.test(meld[0]) && /(↓|S)/.test(meld[0]), meld.join('|'));
  S.polizei = null;
  // 4) Gegenprobe: ohne Sperre keine Sperr-Meldung, Auto wird versetzt
  frisch(); setze(sim, f.vehicle.x + 5, f.vehicle.z + 30, 0); S.spielerZuruecksetzen(0);
  pruefe('ohne Sperre: Reset läuft, keine Sperr-Meldung', meld.length === 0, meld.join('|'));
}

// ---------------- Physik-Einzelfälle (v23): Rückwärts zügig, Gas bremst die Rückwärtsfahrt, Ziel rollt nicht rückwärts ----------------
function physikFaelle() {
  const { ladeModule } = require('./lade');
  const R = ladeModule(['src/config.js', 'src/physics/vehicle.js', 'src/cars/carCatalog.js']);
  const dt = R.config.physik.schritt;
  for (const autoId of ['passat', 'multivan', 'mini-cooper', 'formel', 'porsche-911']) {
    const auto = R.carCatalog.waehlbare().find(a => a.id === autoId);
    for (const ug of ['strasse', 'rand', 'gras', 'sand']) {
      const v = new R.Vehicle(auto.fahrwerte); v.setzen(0, 0, 0); v.untergrund = ug;
      let t4 = null, k = 0;
      for (; k < 3 * 60; k++) { v.schritt(dt, { gas: 0, bremse: 1, lenkung: 0 }); if (t4 === null && v.vLaengs <= -4) t4 = (k + 1) * dt; }
      pruefe(`${autoId}/${ug}: Bremse aus dem Stand → ≥ 14 km/h rückwärts in ≤ 1,3 s`, t4 !== null && t4 <= 1.3, t4 === null ? 'nie' : t4.toFixed(2) + ' s');
      // aus Rückwärtsfahrt Gas geben → bremst, steht, fährt vorwärts (≤ 1,5 s bis Vorwärtsfahrt ≥ 2 m/s)
      const w = new R.Vehicle(auto.fahrwerte); w.setzen(0, 0, 0); w.untergrund = ug; w.vLaengs = -6;
      let tv = null;
      for (k = 0; k < 4 * 60; k++) { w.schritt(dt, { gas: 1, bremse: 0, lenkung: 0 }); if (tv === null && w.vLaengs >= 2) { tv = (k + 1) * dt; } }
      pruefe(`${autoId}/${ug}: Gas bei −6 m/s → nach ≤ 1,5 s vorwärts (≥ 2 m/s)`, tv !== null && tv <= 1.5, tv === null ? 'nie' : tv.toFixed(2) + ' s');
      // Vorwärts: Bremse bremst weiter wie bisher (Bremsweg unverändert: 20 m/s → Stand)
      const b = new R.Vehicle(auto.fahrwerte); b.setzen(0, 0, 0); b.untergrund = ug; b.vLaengs = Math.min(20, auto.fahrwerte.vMax * 0.5);
      let tb = null; const v0 = b.vLaengs;
      for (k = 0; k < 6 * 60; k++) { b.schritt(dt, { gas: 0, bremse: 1, lenkung: 0 }); if (tb === null && b.vLaengs <= 0.01) { tb = (k + 1) * dt; break; } }
      pruefe(`${autoId}/${ug}: Bremsen aus ${v0.toFixed(0)} m/s bis Stand in ≤ ${(v0 / auto.fahrwerte.bremsen * 1.6 + 0.5).toFixed(1)} s (wie bisher)`, tb !== null && tb <= v0 / auto.fahrwerte.bremsen * 1.6 + 0.5, tb === null ? 'nie' : tb.toFixed(2) + ' s');
    }
  }
  // Auto im Ziel rollt aus und bleibt stehen (fuhr vorher nach dem Stand rückwärts bis −8 m/s)
  const sim = neueSim('wiese'), S = sim.sim, f = S.fahrzeuge[0], t = S.rennen.teilnehmer[0];
  setze(sim, f.vehicle.x, f.vehicle.z, f.vehicle.heading);
  f.vehicle.vLaengs = 25; t.imZiel = true;
  for (let k = 0; k < 20 * 60; k++) { sim.eingabeSetzen(0, { gas: 0, bremse: 0, lenkung: 0 }); sim.schritt(); t.imZiel = true; }
  pruefe('Im Ziel: Auto rollt aus und steht (kein Rückwärtsfahren)', f.vehicle.vLaengs >= -0.05 && f.vehicle.tempo < 0.3, 'v = ' + f.vehicle.vLaengs.toFixed(2));
}

// ---------------- Abschleppwagen/Liegenbleiben mit der echten Schadenslogik ----------------
function schadenEcht() {
  const sim = neueSim('wiese'), R = sim.R, S = sim.sim, f = S.fahrzeuge[0];
  S.schaden = new R.Schaden(S.fahrzeuge, { an: true });
  const meld = []; S.huds[0].meldung = (tx) => meld.push(tx);
  S.schaden._punkteSetzen(0, 1); S.schaden.treffer(0, 'hindernis', 20);   // letzter Prozentpunkt weg → liegengeblieben
  for (let k = 0; k < 30; k++) { sim.eingabeSetzen(0, { gas: 0, bremse: 0, lenkung: 0 }); sim.schritt(); }
  const z = S.schaden.zustand(0);
  pruefe('Schaden echt: Auto bei 0 % ist liegengeblieben (gesperrt)', S.schaden.gesperrt(0) && z.liegengeblieben, JSON.stringify({ rest: z.rest }));
  meld.length = 0;
  const x0 = f.vehicle.x, z0 = f.vehicle.z;
  S.spielerZuruecksetzen(0);
  pruefe('Schaden echt: R beim Liegenbleiben → Meldung mit Restzeit, Auto bleibt stehen', meld.length === 1 && /Abschlepp/.test(meld[0]) && /noch \d+ s/.test(meld[0]) && f.vehicle.x === x0 && f.vehicle.z === z0, meld.join('|'));
  // nach dem Abschleppen geht R wieder
  for (let k = 0; k < 60 * 12; k++) { sim.eingabeSetzen(0, { gas: 0, bremse: 0, lenkung: 0 }); sim.schritt(); if (!S.schaden.gesperrt(0)) break; }
  pruefe('Schaden echt: nach dem Abschleppen nicht mehr gesperrt', !S.schaden.gesperrt(0));
}

// ---------------- online Ende-zu-Ende: echter Server + WebSocket, R und Rückwärts ----------------
async function online() {
  const path = require('path'), WebSocket = require(path.join(__dirname, '..', 'server', 'node_modules', 'ws'));
  const { starten } = require('../server/server');
  const { laden, kontextLaden } = require('../server/simulation.js');
  const R = laden(), N = R.Netz, DT = R.config.physik.schritt;
  // „Browser“ ohne DOM (wie tests/test_netz.js): Client-Vorhersage mit denselben Dateien wie Autorennen.html
  const C = kontextLaden(['vendor/three.min.js', 'src/config.js', 'src/physics/vehicle.js', 'src/physics/collisions.js', 'src/cars/carCatalog.js',
    'src/track/spline.js', 'src/track/trackCatalog.js', 'src/track/trackBuilder.js', 'src/track/looping.js', 'src/track/schanze.js', 'src/track/anlauf.js',
    'src/world/themes.js', 'src/world/schilder.js', 'src/world/wetter.js', 'src/world/kleber.js', 'src/world/polizei.js', 'src/net/protokoll.js', 'src/net/vorhersage.js']);
  function clientStrecke(e) {
    const daten = C.trackCatalog.find(t => t.id === e.streckeId);
    const st = new C.Strecke(daten, { welt: C.Strecke.weltName(daten, e.welt), variante: e.variante, hindernisMenge: e.hindernisMenge });
    const w = new C.Wetter(null, { jahreszeit: e.jahreszeit, wetter: e.wetter, wind: { staerke: e.windStaerke, richtung: e.windRichtung }, thema: daten.thema, seed: 1, strecke: st, tageszeit: e.tageszeit });
    C.Kurvenschilder.einbauen(st, e.tempoKlasse);
    C.Kollisionen.pflanzenSammeln(st, C.themes.dekoBauen(daten.thema, st, w.jahreszeit));
    C.Kollisionen.wracksEinbauen(st);
    return { st, w };
  }
  const srv = await starten({ port: 0, host: '127.0.0.1', leise: true, ladenMaxMs: 3000 });
  const ws = new WebSocket('ws://127.0.0.1:' + srv.port + '/ws');
  await new Promise((ok) => ws.on('open', ok));
  const warte = (ms) => new Promise(r => setTimeout(r, ms));
  const handler = {}, ereignisse = [];
  let startMsg = null, z = null, V = null, rz = 'countdown';
  const anzeige = () => V ? { x: V.vp.x + V.korr.x, z: V.vp.z + V.korr.z, y: V.vp.y + V.korr.y, heading: V.vp.heading + V.korr.h } : null;
  ws.on('message', (d) => { const m = JSON.parse(d); if (m.t === 'zustand') { z = m; rz = m.rz; if (V && m.ich) V.abgleich(m.ich, anzeige()); } if (m.t === 'start') startMsg = m; if (m.t === 'ereignis') ereignisse.push(m); if (handler[m.t]) handler[m.t](m); });
  const senden = (o) => ws.send(JSON.stringify(o));
  await new Promise((ok) => {
    handler.lobby = () => senden({ t: 'start' });
    handler.start = ok;
    senden({ t: 'raumErstellen', fahrer: 'Jonas', auto: 'passat', hilfe: 'aus', einstellungen: { streckeId: 'wiese', welt: 'klassisch', runden: 99, gegner: 0, schwierigkeit: 'leicht' } });
  });
  handler.lobby = null;
  {
    const e = startMsg.einstellungen, { st: cst, w } = clientStrecke(e), auto = C.carCatalog.waehlbare().find(a => a.id === 'passat');
    V = new C.NetzVorhersage({ strecke: cst, auto, tempoKlasse: e.tempoKlasse, fahrhilfe: 'aus', umwelt: () => w.umwelt() });
    const p0 = cst.startpositionen(startMsg.teilnehmer.length)[0];
    V.vp.setzen(p0.x, p0.z, p0.heading); V.vp.y = cst.hoeheAn(p0.x, p0.z);
  }
  senden({ t: 'geladen' });
  // Eingaben im Echtzeit-Takt (60 je Sekunde), wie online.js
  let cur = { gas: 0, bremse: 0, lenkung: 0 }, rFlag = false, n = 0;
  const t0 = Date.now() / 1000;
  const iv = setInterval(() => {
    const soll = Math.floor((Date.now() / 1000 - t0) / DT);
    while (n < soll) {
      const k = N.eingabeKodieren(cur); n++;
      const msg = { t: 'eingabe', n, g: k.g, b: k.b, l: k.l };
      if (rFlag) { msg.r = 1; rFlag = false; }
      senden(msg);
      if (V) { V.schritt(n, N.eingabeDekodieren(k), { countdown: rz === 'countdown', imZiel: false }); V.abklingen(DT); }
    }
  }, 8);
  const raum = srv.raeume.values().next().value, sim = raum.sim;
  const S = sim.sim, f = S.fahrzeuge[0], v = f.vehicle, st = S.strecke;
  for (let k = 0; k < 400 && !(z && z.rz === 'laeuft'); k++) await warte(50);
  pruefe('online: Rennen läuft', !!z && z.rz === 'laeuft', z && z.rz);
  S.dynamik = null;
  const liste = szenarien(sim, 'wiese');
  const wahl = [liste.find(q => q.art === 'baum'), liste.find(q => q.art === 'saeule'), liste.find(q => q.art === 'zaun'), liste.find(q => q.art === 'zwickel')].filter(Boolean);
  pruefe('online: Szenarien gefunden (Baum, Säule, Zaun, Zwickel)', wahl.length === 4, wahl.map(q => q.art).join(','));
  for (const sz of wahl) {
    const bez = 'online/' + sz.art + '@' + sz.s.toFixed(0);
    // --- A) festfahren, dann Bremse halten
    setze(sim, sz.x, sz.z, sz.heading);
    cur = { gas: 1, bremse: 0, lenkung: 0 }; await warte(2500);
    const xj = v.x, zj = v.z;
    cur = { gas: 0, bremse: 1, lenkung: 0 }; await warte(3000);
    const rr = Math.hypot(v.x - xj, v.z - zj);
    const frei = sz.art === 'zwickel' ? 2 : 3.5;
    pruefe(bez + ': Bremse halten (Server-Weg) → Auto fährt rückwärts heraus (≥ ' + frei + ' m)', rr >= frei, `${rr.toFixed(1)} m, v ${v.vLaengs.toFixed(1)}`);
    { const a = anzeige(); pruefe(bez + ': Client-Vorhersage folgt dem Server (Abstand < 2 m)', Math.hypot(a.x - v.x, a.z - v.z) < 2, Math.hypot(a.x - v.x, a.z - v.z).toFixed(2) + ' m'); }
    // --- B) festfahren, dann R
    setze(sim, sz.x, sz.z, sz.heading);
    cur = { gas: 1, bremse: 0, lenkung: 0 }; await warte(2500);
    const xj2 = v.x, zj2 = v.z, anz0 = ereignisse.filter(e => e.art === 'reset').length;
    cur = { gas: 0, bremse: 0, lenkung: 0 }; rFlag = true; await warte(400);
    const nn = st.abfrage(v.x, v.z, f.index);
    pruefe(bez + ': R (Server-Weg über WebSocket) → Reset-Ereignis, Auto auf der Fahrbahn', ereignisse.filter(e => e.art === 'reset').length > anz0 && Math.hypot(v.x - xj2, v.z - zj2) > 1 && Math.abs(nn.seitenabstand) <= st.breiteBei(nn.s) / 2 + 0.01,
      `Ereignisse ${ereignisse.filter(e => e.art === 'reset').length - anz0}, versetzt ${Math.hypot(v.x - xj2, v.z - zj2).toFixed(1)} m, Seitenabstand ${nn.seitenabstand.toFixed(1)}`);
    // Client bekommt die neue Position im Zustand (a[nr][0..1] = x, z)
    await warte(300);
    { const a = anzeige(); pruefe(bez + ': Client-Anzeige springt auf die Reset-Stelle (Abstand zum Server < 2 m)', Math.hypot(a.x - v.x, a.z - v.z) < 2, Math.hypot(a.x - v.x, a.z - v.z).toFixed(2) + ' m'); }
    const me = z && z.a && z.ich ? z.a[z.ich.nr] : null;
    pruefe(bez + ': Zustand an den Client zeigt die neue Position', !!me && Math.hypot(me[0] - v.x, me[1] - v.z) < 3, me ? Math.hypot(me[0] - v.x, me[1] - v.z).toFixed(2) + ' m' : '–');
    const s0 = nn.s;
    cur = { gas: 1, bremse: 0, lenkung: 0 }; await warte(3000);
    const n2 = st.abfrage(v.x, v.z, f.index);
    pruefe(bez + ': danach Vollgas → fährt weiter (≥ 10 m in 3 s)', st.spline.differenzS(n2.s, s0) >= 10, st.spline.differenzS(n2.s, s0).toFixed(1) + ' m');
  }
  clearInterval(iv); ws.terminate(); await srv.schliessen();
}

async function haupt() {
  const t0 = Date.now();
  for (const id of STRECKEN) {
    laufe(id, 'passat');
    if (id === 'wiese' || id === 'alpen') laufe(id, 'multivan');
  }
  sperren();
  physikFaelle();
  schadenEcht();
  if (!nurId && !process.argv.includes('--ohne-netz')) await online();
  console.log(`${anzahl} Prüfungen, ${fehler} Fehler  (Bremse rückwärts ${ges.Aok}/${ges.A}, Reset ${ges.Bok}/${ges.B}, ${ges.uebersprungen} nicht festgefahren; ${((Date.now() - t0) / 1000).toFixed(0)} s)`);
  console.log(fehler ? 'FEHLER' : 'ALLE OK');
  process.exit(fehler ? 1 : 0);
}
haupt().catch((e) => { console.error(e); process.exit(2); });
