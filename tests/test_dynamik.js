// Node-Test Bälle + Wasserstrahl (Fantasie): node tests/test_dynamik.js
const { ladeModule } = require('./lade');
const R = ladeModule(['src/config.js', 'src/physics/vehicle.js', 'src/track/spline.js', 'src/track/trackCatalog.js',
  'src/track/trackBuilder.js', 'src/physics/collisions.js', 'src/world/dynamik.js']);

let fehler = 0;
function pruefe(name, ok, info) { console.log((ok ? 'OK   ' : 'FEHL ') + name + (info ? '  (' + info + ')' : '')); if (!ok) fehler++; }
const dt = R.config.physik.schritt;
const daten = R.trackCatalog.find(t => t.id === 'fantasie');
const strecke = new R.Strecke(daten), sp = strecke.spline, L = strecke.laenge;

pruefe('Fantasie: 2–3 Ballstellen, 1–2 Wasserstrahlen', daten.baelle.length >= 2 && daten.baelle.length <= 3 &&
  daten.wasserstrahlen.length >= 1 && daten.wasserstrahlen.length <= 2);

// ---------- Aktivierung nach Runde ----------
{
  const d = new R.Dynamik(strecke, { seed: 1 });
  let kommen = 0;
  for (let t = 0; t < 20; t += dt) if (d.schritt(dt, { fortschritt: 100, runden: 3 }).baelleKommen) kommen++;
  pruefe('Runde 1 von 3: keine Bälle', d.alleBaelle().length === 0 && kommen === 0 && d.stellen.every(s => !s.aktiv));
  for (let t = 0; t < 4; t += dt) if (d.schritt(dt, { fortschritt: L + 50, runden: 3 }).baelleKommen) kommen++;
  const st2 = d.stellen.filter(s => s.abRunde === 2), stL = d.stellen.filter(s => s.abRunde === 'letzte');
  pruefe('Runde 2: Stellen mit abRunde 2 aktiv, "letzte" noch nicht, Meldung genau einmal', st2.length > 0 && st2.every(s => s.aktiv) &&
    stL.every(s => !s.aktiv) && kommen === 1, 'Meldungen ' + kommen);
  for (let t = 0; t < 4; t += dt) if (d.schritt(dt, { fortschritt: 2 * L + 50, runden: 3 }).baelleKommen) kommen++;
  pruefe('Letzte Runde: alle Stellen aktiv, keine zweite Meldung', d.stellen.every(s => s.aktiv) && kommen === 1);
  const d1 = new R.Dynamik(strecke, { seed: 1 });
  d1.schritt(dt, { fortschritt: 5, runden: 1 });
  pruefe('1-Runden-Rennen: "letzte" = sofort', d1.stellen.filter(s => s.abRunde === 'letzte').every(s => s.aktiv));
}

// ---------- Ball rollt quer, verschwindet drüben ----------
{
  const d = new R.Dynamik(strecke, { seed: 3 });
  const st = d.stellen[0];
  let ball = null, t = 0;
  while (!ball && t < 10) { d.schritt(dt, { fortschritt: L * 5, runden: 1 }); t += dt; ball = st.baelle[0]; }
  pruefe('Ball erscheint kurz nach der Aktivierung (< 3 s)', !!ball && t < 3, t.toFixed(2) + ' s');
  const q0 = ball.q, s0 = ball.s, x0 = ball.x, z0 = ball.z;
  for (let k = 0; k < 60; k++) d.schritt(dt, { fortschritt: L * 5, runden: 1 });
  const dq = ball.q - q0;
  pruefe('Ball rollt quer (1 s ≈ tempo m, Richtung von Seite "von" weg, s fest)', Math.abs(Math.abs(dq) - st.tempo) < 0.2 &&
    Math.sign(dq) === -st.von && ball.s === s0 && ball.winkel > 1, 'dq=' + dq.toFixed(2) + ' m, Drehung ' + ball.winkel.toFixed(1) + ' rad');
  const pAchse = sp.punktBei(s0), weg = (ball.x - x0) * pAchse.tx + (ball.z - z0) * pAchse.tz;
  pruefe('Bewegung quer zur Fahrtrichtung (längs < 0,1 m)', Math.abs(weg) < 0.1, weg.toFixed(3));
  pruefe('Ball liegt auf dem Boden (y = Straße + Radius)', Math.abs(ball.y - (strecke.hoeheAn(ball.x, ball.z) + ball.radius)) < 1e-6);
  let tWeg = 0;
  while (st.baelle.includes(ball) && tWeg < 10) { d.schritt(dt, { fortschritt: L * 5, runden: 1 }); tWeg += dt; }
  const soll = 2 * Math.abs(st.qStart) / st.tempo - 1;
  pruefe('Ball verschwindet jenseits der Fahrbahn', !st.baelle.includes(ball) && Math.abs(tWeg - soll) < 0.3, tWeg.toFixed(1) + ' s');
}

// ---------- Treffer Auto-Ball: −60 % ----------
{
  const d = new R.Dynamik(strecke, { seed: 3 });
  const st = d.stellen[0];
  while (!st.baelle.length) d.schritt(dt, { fortschritt: L * 5, runden: 1 });
  const ball = st.baelle[0];
  // Auto steht dort, wo der Ball gleich vorbeirollt (Mitte der Fahrbahn), mit 30 m/s Tempo
  const p = sp.punktBei(ball.s), v = new R.Vehicle({});
  v.setzen(p.x, p.z, R.headingAus(p.tx, p.tz));
  let treffer = [], k = 0;
  while (!treffer.length && k < 600) {
    v.vLaengs = 30; v.vQuer = 0;
    d.schritt(dt, { fortschritt: L * 5, runden: 1 });
    treffer = d.kollisionen([v]); k++;
  }
  pruefe('Treffer Auto-Ball erkannt', treffer.length === 1 && treffer[0].typ === 'ball' && treffer[0].nr === 0, JSON.stringify(treffer));
  pruefe('Treffer senkt Tempo um 60 %', Math.abs(v.vLaengs - 12) < 1e-9, v.vLaengs.toFixed(2) + ' m/s');
  pruefe('Ball fliegt weg (nach oben, zustand weg)', ball.zustand === 'weg' && ball.vy > 0);
  pruefe('Kein zweiter Treffer durch denselben Ball', d.kollisionen([v]).length === 0);
  for (let i = 0; i < 90; i++) d.schritt(dt, { fortschritt: L * 5, runden: 1 });
  pruefe('Weggestoßener Ball verschwindet nach flugZeit', !st.baelle.includes(ball));
  // Auto im Looping wird nicht getroffen
  const d2 = new R.Dynamik(strecke, { seed: 3 }), s2 = d2.stellen[0];
  while (!s2.baelle.length) d2.schritt(dt, { fortschritt: L * 5, runden: 1 });
  const b2 = s2.baelle[0], v2 = new R.Vehicle({});
  v2.setzen(b2.x, b2.z, 0); v2.vLaengs = 30; v2.imLooping = true;
  pruefe('Auto im Looping: kein Ball-Treffer', d2.kollisionen([v2]).length === 0 && v2.vLaengs === 30);
}

// ---------- Wasserstrahl: aktiv nur im Fenster, Treffer −40 % + Schlingern ----------
{
  const d = new R.Dynamik(strecke, { seed: 5 });
  const du = d.duesen[0];
  // Zeitfenster über einen ganzen Zyklus abtasten
  let aktiv = 0, blubbern = 0, wechsel = [];
  let vorher = null;
  for (let t = 0; t < du.intervall; t += 0.01) {
    const z = d.duesenZustand(du, t).zustand;
    if (z === 'aktiv') aktiv += 0.01; else if (z === 'blubbern') blubbern += 0.01;
    if (vorher && z !== vorher) wechsel.push(vorher + '→' + z);
    vorher = z;
  }
  pruefe('Je Zyklus: 1 s Blubbern, dann 2 s Strahl', Math.abs(aktiv - du.dauer) < 0.03 && Math.abs(blubbern - du.vorwarnung) < 0.03 &&
    wechsel.includes('blubbern→aktiv') && !wechsel.includes('aus→aktiv'), `aktiv ${aktiv.toFixed(2)} s, blubbern ${blubbern.toFixed(2)} s, ${wechsel.join(' ')}`);
  pruefe('Düsen zeitlich zufällig versetzt (verschiedene Startphasen)', d.duesen.length < 2 || d.duesen[0].versatz !== d.duesen[1].versatz);
  const v = new R.Vehicle({});
  const p = sp.punktBei(du.s);
  v.setzen(du.x, du.z, R.headingAus(p.tx, p.tz));
  // bis "aus" vorspulen, dann darf nichts passieren
  while (d.duesenZustand(du, d.zeit).zustand !== 'aus') d.schritt(dt, { fortschritt: 0, runden: 3 });
  v.vLaengs = 30;
  d.schritt(dt, { fortschritt: 0, runden: 3 });
  pruefe('Strahl aus: kein Treffer', d.kollisionen([v]).length === 0 && v.vLaengs === 30);
  while (d.duesen[0].zustand !== 'blubbern') d.schritt(dt, { fortschritt: 0, runden: 3 });
  pruefe('Blubbern (Vorwarnung): kein Treffer', d.kollisionen([v]).length === 0 && v.vLaengs === 30);
  while (d.duesen[0].zustand !== 'aktiv') d.schritt(dt, { fortschritt: 0, runden: 3 });
  const tr = d.kollisionen([v]);
  pruefe('Strahl aktiv: Treffer, Tempo −40 %', tr.length === 1 && tr[0].typ === 'wasser' && Math.abs(v.vLaengs - 18) < 1e-9, v.vLaengs.toFixed(2) + ' m/s');
  pruefe('Schlingern: vQuer-Impuls', Math.abs(Math.abs(v.vQuer) - R.config.fantasie.wasser.schlingern) < 1e-9, v.vQuer.toFixed(2));
  pruefe('Nur ein Treffer je Fontäne', d.kollisionen([v]).length === 0);
  // nächste Fontäne trifft wieder
  while (d.duesen[0].zustand === 'aktiv') d.schritt(dt, { fortschritt: 0, runden: 3 });
  while (d.duesen[0].zustand !== 'aktiv') d.schritt(dt, { fortschritt: 0, runden: 3 });
  v.vLaengs = 30;
  pruefe('Nächste Fontäne trifft wieder', d.kollisionen([v]).length === 1);
  const weit = new R.Vehicle({}); weit.setzen(du.x + 10, du.z, 0); weit.vLaengs = 30;
  pruefe('10 m daneben: kein Treffer', d.kollisionen([weit]).length === 0);
}

// ---------- Runde 4: Strohballen (Wald, Welt „Hindernisse“) ----------
{
  const CS = R.config.strohballen;
  const wald = R.trackCatalog.find(t => t.id === 'wald');
  const stW = new R.Strecke(wald, { welt: 'hindernisse' }), spW = stW.spline;
  pruefe('Fantasie-Standardwelt: keine Strohballen', new R.Dynamik(strecke).strohStellen.length === 0);
  pruefe('Wald klassisch: keine Strohballen', new R.Dynamik(new R.Strecke(wald, { welt: 'klassisch' })).strohStellen.length === 0);
  const d = new R.Dynamik(stW, { seed: 9 });
  pruefe('Wald hindernisse: Strohballen-Stellen aus dem Katalog, keine Bälle/Düsen', d.strohStellen.length === wald.strohballen.length &&
    d.stellen.length === 0 && d.duesen.length === 0, d.strohStellen.length + ' Stellen');
  const st = d.strohStellen[0];
  let b = null, t = 0;
  while (!b && t < 20) { d.schritt(dt, { fortschritt: 10, runden: 3 }); t += dt; b = st.ballen[0]; }
  pruefe('ab Runde 1: Ballen erscheint (≤ 5 s)', !!b && t <= 5.01, t.toFixed(2) + ' s');
  const q0 = b.q, s0 = b.s;
  for (let k = 0; k < 60; k++) d.schritt(dt, { fortschritt: 10, runden: 3 });
  const dq = b.q - q0;
  pruefe('Ballen rollt quer (1 s ≈ tempo, weg von Seite "von", s fest), dreht sich', Math.abs(Math.abs(dq) - st.tempo) < 0.1 &&
    Math.sign(dq) === -st.von && b.s === s0 && Math.abs(b.winkel) > 1, 'dq=' + dq.toFixed(2) + ' m');
  pruefe('Ballen liegt auf dem Boden (y = Straße + Radius)', Math.abs(b.y - (stW.hoeheAn(b.x, b.z) + b.radius)) < 1e-6);
  // Treffer: Auto steht auf der Fahrbahnmitte, Ballen rollt hinein
  const p = spW.punktBei(b.s), v = new R.Vehicle({});
  v.setzen(p.x, p.z, R.headingAus(p.tx, p.tz));
  let tr = [], k = 0;
  while (!tr.length && k < 600) { v.vLaengs = 30; v.vQuer = 0; d.schritt(dt, { fortschritt: 10, runden: 3 }); tr = d.kollisionen([v]); k++; }
  pruefe('Treffer Auto-Strohballen erkannt (typ stroh)', tr.length === 1 && tr[0].typ === 'stroh' && tr[0].nr === 0, JSON.stringify(tr));
  pruefe('Treffer: Tempo −50 %', Math.abs(v.vLaengs - 15) < 1e-9, v.vLaengs.toFixed(2) + ' m/s');
  pruefe('kein zweiter Treffer durch denselben Ballen', d.kollisionen([v]).length === 0);
  // kippt und rutscht an den Rand, liegt dort, dann weg
  for (let i = 0; i < Math.ceil(CS.kippZeit / dt) + 2; i++) d.schritt(dt, { fortschritt: 10, runden: 3 });
  const nb = spW.naechster(b.x, b.z);
  pruefe('Ballen gekippt (kipp = 1) und am Fahrbahnrand', b.zustand === 'gekippt' && b.kipp === 1 && Math.abs(nb.seitenabstand) > stW.breite / 2,
    'q=' + nb.seitenabstand.toFixed(2) + ' m');
  pruefe('gekippt: liegt auf der Stirnseite (y = Boden + halbe Breite)', Math.abs(b.y - (stW.hoeheAn(b.x, b.z) + b.breite / 2)) < 1e-6);
  for (let i = 0; i < Math.round((CS.liegenZeit - 0.2) / dt); i++) d.schritt(dt, { fortschritt: 10, runden: 3 });
  pruefe('liegt noch kurz vor Ablauf von liegenZeit', st.ballen.includes(b));
  for (let i = 0; i < Math.round(0.4 / dt); i++) d.schritt(dt, { fortschritt: 10, runden: 3 });
  pruefe('nach liegenZeit (3 s) verschwunden', !st.ballen.includes(b));
  // nicht getroffen: rollt drüben raus
  const d2 = new R.Dynamik(stW, { seed: 9 }), st2 = d2.strohStellen[0];
  while (!st2.ballen.length) d2.schritt(dt, { fortschritt: 10, runden: 3 });
  const b2 = st2.ballen[0];
  let tw = 0;
  while (st2.ballen.includes(b2) && tw < 20) { d2.schritt(dt, { fortschritt: 10, runden: 3 }); tw += dt; }
  pruefe('ohne Treffer: verschwindet jenseits der Fahrbahn', !st2.ballen.includes(b2) && Math.abs(tw - 2 * Math.abs(st2.qStart) / st2.tempo) < 0.3,
    tw.toFixed(1) + ' s');
  pruefe('alleStrohballen() liefert Liste', Array.isArray(d2.alleStrohballen()));
}

console.log(fehler === 0 ? '\nALLE TESTS OK' : '\n' + fehler + ' FEHLER');
process.exit(fehler ? 1 : 0);
