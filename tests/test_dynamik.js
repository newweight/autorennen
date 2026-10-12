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

// ---------- Runde 5b: Dinos (Dino-Strecke, Welten Hindernisse/Stunt/Verrückt) ----------
// (Runde 6: Grundverhalten ohne Stehenbleiben prüfen → stehenChance kurz 0)
const stehenAlt = R.config.dino.stehenChance;
R.config.dino.stehenChance = 0;
{
  const CD = R.config.dinos;
  const dino = R.trackCatalog.find(t => t.id === 'dino');
  pruefe('Dino klassisch: keine laufenden Dinos', new R.Dynamik(new R.Strecke(dino, { welt: 'klassisch' })).dinoStellen.length === 0);
  pruefe('Wald hindernisse: keine Dinos (Liste fehlt)', new R.Dynamik(new R.Strecke(R.trackCatalog.find(t => t.id === 'wald'), { welt: 'hindernisse' })).dinoStellen.length === 0);
  ['hindernisse', 'stunt', 'verrueckt'].forEach((w) => {
    const dd = new R.Dynamik(new R.Strecke(dino, { welt: w }));
    pruefe('Dino ' + w + ': Dino-Stellen aktiv, Felsbrocken-Optik', dd.dinoStellen.length === dino.dinos.length && dd.felsOptik === true);
  });
  const stD = new R.Strecke(dino, { welt: 'hindernisse' }), spD = stD.spline;
  const d = new R.Dynamik(stD, { seed: 21 });
  const st = d.dinoStellen[0];
  let dn = null, t = 0;
  while (!dn && t < 20) { d.schritt(dt, { fortschritt: 10, runden: 3 }); t += dt; dn = st.dinos[0]; }
  pruefe('Dino erscheint nach dem Start (≤ 5 s), außerhalb der Fahrbahn', !!dn && t <= 5.01 && Math.abs(dn.q) > stD.breite / 2 + 5, t.toFixed(2) + ' s, q=' + (dn ? dn.q.toFixed(1) : '-'));
  const q0 = dn.q, s0 = dn.s, ph0 = dn.phase;
  for (let k = 0; k < 60; k++) d.schritt(dt, { fortschritt: 10, runden: 3 });
  const dq = dn.q - q0;
  pruefe('Dino läuft quer (1 s ≈ tempo 4 m/s, weg von Seite "von", s fest), Beine bewegen sich', Math.abs(Math.abs(dq) - st.tempo) < 0.05 &&
    Math.sign(dq) === -st.von && dn.s === s0 && dn.phase > ph0 + 1, 'dq=' + dq.toFixed(2) + ' m');
  pruefe('Dino steht auf dem Boden, Laufrichtung quer zur Straße', Math.abs(dn.y - stD.hoeheAn(dn.x, dn.z)) < 1e-6 &&
    Math.abs(dn.lx * dn.tx + dn.lz * dn.tz) < 1e-6);
  // Treffer: Auto steht auf der Fahrbahnmitte, Dino läuft hinein
  const p = spD.punktBei(dn.s), v = new R.Vehicle({});
  v.setzen(p.x, p.z, R.headingAus(p.tx, p.tz));
  let tr = [], k = 0;
  while (!tr.length && k < 900) { v.vLaengs = 30; v.vQuer = 0; v.huepfer = 0; d.schritt(dt, { fortschritt: 10, runden: 3 }); tr = d.kollisionen([v]); k++; }
  pruefe('Treffer Auto-Dino erkannt (typ dino)', tr.length === 1 && tr[0].typ === 'dino' && tr[0].nr === 0, JSON.stringify(tr));
  pruefe('Treffer: Tempo −60 % + Hüpfer', Math.abs(v.vLaengs - 30 * CD.tempoFaktor) < 1e-9 && Math.abs(CD.tempoFaktor - 0.4) < 1e-9 && v.huepfer === CD.huepfer,
    v.vLaengs.toFixed(2) + ' m/s, huepfer ' + v.huepfer);
  pruefe('kein zweiter Treffer durch denselben Dino', d.kollisionen([v]).length === 0);
  const qVor = dn.q;
  d.schritt(dt, { fortschritt: 10, runden: 3 });
  pruefe('Dino unbeeindruckt: läuft mit gleichem Tempo weiter', st.dinos.includes(dn) && Math.abs(Math.abs(dn.q - qVor) - st.tempo * dt) < 1e-9);
  // ohne Treffer: läuft drüben raus und verschwindet
  const d2 = new R.Dynamik(stD, { seed: 21 }), st2 = d2.dinoStellen[0];
  while (!st2.dinos.length) d2.schritt(dt, { fortschritt: 10, runden: 3 });
  const dn2 = st2.dinos[0];
  let tw = 0;
  while (st2.dinos.includes(dn2) && tw < 30) { d2.schritt(dt, { fortschritt: 10, runden: 3 }); tw += dt; }
  pruefe('ohne Treffer: verschwindet jenseits der Fahrbahn (2·qStart/tempo)', !st2.dinos.includes(dn2) && Math.abs(tw - 2 * Math.abs(st2.qStart) / st2.tempo) < 0.3,
    tw.toFixed(1) + ' s');
  pruefe('alleDinos() liefert Liste', Array.isArray(d2.alleDinos()));
  const weit = new R.Vehicle({}); weit.setzen(dn2.x + 40, dn2.z + 40, 0);
  pruefe('Auto weit weg: kein Dino-Treffer', d2.kollisionen([weit]).length === 0);
}
R.config.dino.stehenChance = stehenAlt;

// ================= Runde 6 (W2-C): Dino-Ausbau + Wildtiere =================
const dinoK = R.trackCatalog.find(t => t.id === 'dino'), waldK = R.trackCatalog.find(t => t.id === 'wald');
const CV = R.config.dino, CT = R.config.tiere;
const ug0 = (menge) => [...menge].filter(x => x.umgekehrt);
// ---------- C1: Dinos ×2, stehen (Kopf senken), umkehren, brüllen ----------
{
  const st = new R.Strecke(dinoK, { welt: 'hindernisse' });
  const d = new R.Dynamik(st, { seed: 5 });
  pruefe('C1: ≥ 4 Dino-Stellen (doppelt so viele)', d.dinoStellen.length >= 4, d.dinoStellen.length);
  const gesehen = new Set(), stehZeiten = new Map();
  let umgekehrt = 0, bruellen = 0, maxGleich = 0, kopfOk = true, beineStill = true;
  for (let t = 0; t < 300; t += dt) {
    const e = d.schritt(dt, { fortschritt: 10, runden: 3 });
    bruellen += e.ereignisse.filter(x => x.typ === 'bruellen').length;
    const alle = d.alleDinos();
    maxGleich = Math.max(maxGleich, alle.length);
    for (const dn of alle) {
      gesehen.add(dn);
      if (dn.zustand === 'steht') {
        stehZeiten.set(dn, (stehZeiten.get(dn) || 0) + dt);
        if (stehZeiten.get(dn) > 0.8 && dn.kopf < 0.8 && !(dn.bruellt > 0) && !dn._warBruell) kopfOk = false;
        if (dn._zAlt === 'steht' && dn._ph !== dn.phase) beineStill = false;
      }
      if (dn.bruellt > 0) dn._warBruell = true;       // nach dem Brüllen senkt sich der Kopf erst wieder
      if (dn.zustand !== 'steht') dn._warBruell = false;
      dn._ph = dn.phase; dn._zAlt = dn.zustand;
    }
    for (const dn of gesehen) if (dn.umgekehrt && !dn._gezaehlt) { dn._gezaehlt = true; umgekehrt++; }
  }
  // W2-C1: am Ende noch stehende Dinos nicht mitzählen (Messung abgeschnitten)
  const zeiten = [...stehZeiten.entries()].filter(([dn]) => !(d.alleDinos().includes(dn) && dn.zustand === 'steht')).map(([, z]) => z);
  pruefe('C1: mind. 4 Dinos gleichzeitig unterwegs möglich', maxGleich >= 4, 'max ' + maxGleich);
  pruefe('C1: Dinos bleiben stehen, 1–3 s', zeiten.length >= 5 && zeiten.every(z => z >= 1 - 2 * dt && z <= 3 + 2 * dt),
    zeiten.length + '× ' + Math.min(...zeiten).toFixed(2) + '–' + Math.max(...zeiten).toFixed(2) + ' s');
  pruefe('C1: stehend Kopf gesenkt (kopf → 1), Beine still', kopfOk && beineStill);
  // W2-C2: 30 % ALLER Dinos kehren um – und zwar mitten auf der Straße (|q| ≤ 40 % der halben Breite)
  const fertig = [...gesehen];
  const anteil = fertig.filter(x => x.umkehren).length / Math.max(1, fertig.length);
  pruefe('W2-C2: ≈ 30 % aller Dinos kehren um', anteil > 0.17 && anteil < 0.45, (anteil * 100).toFixed(0) + ' % von ' + fertig.length);
  {
    let n = 0, u = 0;
    for (const seed of [1, 2, 3]) {
      const dl = new R.Dynamik(new R.Strecke(dinoK, { welt: 'hindernisse' }), { seed }), g = new Set();
      for (let t = 0; t < 1000; t += dt) { dl.schritt(dt, { fortschritt: 10, runden: 3 }); dl.alleDinos().forEach(x => g.add(x)); }
      g.forEach((x) => { n++; if (x.umkehren) u++; });
    }
    pruefe('W2-C2: Langlauf 3 Seeds: Umkehr-Anteil 30 % ± 5', Math.abs(u / n - 0.3) < 0.05, (u / n * 100).toFixed(1) + ' % von ' + n);
  }
  const bhMax = Math.max(...d.dinoStellen.map(x => x.bh));
  pruefe('W2-C2: Umkehren mitten auf der Straße', ug0(gesehen).every(x => Math.abs(x.umkehrQ) <= bhMax * 0.4 + 0.2),
    ug0(gesehen).map(x => x.umkehrQ.toFixed(1)).slice(0, 6).join(' '));
  pruefe('C1: brüllen (Ereignis bruellen)', bruellen >= 2, bruellen + '×');
  // W2-C2: je Stelle alle 15–30 s (Abstand zwischen zwei Brüllern einer Stelle: ≥ 15 s, ≤ 30 s + Wartezeit bis ein Dino da ist)
  const abst = [];
  d.dinoStellen.forEach((x) => { const z = x.bruellZeiten || []; for (let k = 1; k < z.length; k++) abst.push(z[k] - z[k - 1]); });
  pruefe('W2-C2: Brüllen je Stelle alle 15–30 s (+ Warten auf einen Dino)', abst.length >= 8 && abst.every(a => a >= 15 - 1e-6) &&
    abst.filter(a => a <= 30 + 1e-6).length >= abst.length * 0.6, abst.length + '× ' + Math.min(...abst).toFixed(1) + '–' + Math.max(...abst).toFixed(1) + ' s');
  pruefe('W2-C2: Brüllen ≈ 300 s × 4 Stellen / 22 s', bruellen >= 30 && bruellen <= 80, bruellen + '×');
  // W2-C2: deterministisch per Seed (Stehen/Umkehren/Brüllen gleich bei gleichem Seed, anders bei anderem)
  const protokoll = (seed) => {
    const dd = new R.Dynamik(new R.Strecke(dinoK, { welt: 'hindernisse' }), { seed }), l = [];
    for (let t = 0; t < 120; t += dt) {
      const e = dd.schritt(dt, { fortschritt: 10, runden: 3 });
      e.ereignisse.forEach(x => l.push(x.typ + '@' + dd.zeit.toFixed(3)));
      dd.alleDinos().forEach((x) => { if (x.umgekehrt && !x._p) { x._p = 1; l.push('um@' + dd.zeit.toFixed(3)); } if (x.zustand === 'steht' && !x._s) { x._s = 1; l.push('steh@' + dd.zeit.toFixed(3)); } });
    }
    return l.join(',');
  };
  const p5 = protokoll(5);
  pruefe('W2-C2: Dino-Verhalten deterministisch (gleicher Seed → gleiches Protokoll, anderer Seed → anders)', p5 === protokoll(5) && p5 !== protokoll(6) && p5.length > 50);
  // Umgekehrter Dino verschwindet auf seiner eigenen Seite
  const ug = [...gesehen].filter(x => x.umgekehrt);
  pruefe('C1: umgekehrte Dinos verlassen die Straße auf der Startseite', ug.every(x => !d.alleDinos().includes(x) ? Math.sign(x.q) === Math.sign(x.vq) : true));
  pruefe('C1: Klassisch – keine laufenden Dinos, keine Ereignisse', new R.Dynamik(new R.Strecke(dinoK, { welt: 'klassisch' })).ereignisseAn === false);
}
// ---------- Rehe + Bären (Wald) ----------
{
  const st = new R.Strecke(waldK, { welt: 'hindernisse' }), sp = st.spline;
  const d = new R.Dynamik(st, { seed: 8 });
  pruefe('Tiere: Wald hindernisse – Stellen aus dem Katalog', d.tierStellen.length === waldK.tiere.length && d.tierStellen.some(x => x.art === 'reh') &&
    d.tierStellen.some(x => x.art === 'baer'));
  const kl = new R.Dynamik(new R.Strecke(waldK, { welt: 'klassisch' }), { seed: 8 });
  const b2 = st.breite / 2 + st.randBreite;
  pruefe('Tiere: Klassisch – keine Tiere auf der Straße, 2–3 grasende Rehe neben der Straße', kl.tierStellen.length === 0 &&
    kl.grasendeRehe.length >= 2 && kl.grasendeRehe.length <= 3 && kl.grasendeRehe.every(r => Math.abs(r.q) > b2 + 1 && Math.abs(r.q) < st.grenzeBei(r.s)),
    kl.grasendeRehe.map(r => Math.round(r.s) + '/' + r.q.toFixed(1)).join(' '));
  pruefe('Tiere: R.Dynamik.braucht(Wald klassisch) = true (grasende Rehe)', R.Dynamik.braucht(new R.Strecke(waldK, { welt: 'klassisch' })));
  let rehMaxSprung = 0, schaut = 0, rehTempo = null, baerTempo = null, geweih = new Set();
  const gesehen = new Set();
  for (let t = 0; t < 60; t += dt) {
    d.schritt(dt, { fortschritt: 10, runden: 3 });
    for (const ti of d.alleTiere()) {
      if (!gesehen.has(ti)) { gesehen.add(ti); ti._q0 = ti.q; ti._t0 = ti.zeit; }
      if (ti.art === 'reh') { rehMaxSprung = Math.max(rehMaxSprung, ti.sprung); if (ti.zustand === 'schaut') schaut++; geweih.add(ti.geweih); }
      if (ti.zeit - ti._t0 > 0.99 && ti.zeit - ti._t0 < 1.01) {
        const v = Math.abs(ti.q - ti._q0) / (ti.zeit - ti._t0);
        if (ti.art === 'reh' && ti.zustand === 'laeuft' && !ti.gestanden) rehTempo = v; else if (ti.art === 'baer') baerTempo = v;
      }
    }
  }
  pruefe('Reh: flink (≈ 6 m/s) in Sprüngen (Höhe ≈ sprungHoehe)', rehTempo !== null && Math.abs(rehTempo - 6) < 0.2 && rehMaxSprung > CT.reh.sprungHoehe * 0.8 && rehMaxSprung <= CT.reh.sprungHoehe + 1e-9,
    (rehTempo || 0).toFixed(2) + ' m/s, Sprung ' + rehMaxSprung.toFixed(2) + ' m');
  pruefe('Reh: bleibt manchmal stehen und schaut', schaut > 0);
  pruefe('Reh: Geweih bei jedem 2.', geweih.has(true) && geweih.has(false));
  pruefe('Bär: trottet (≈ 3 m/s)', baerTempo !== null && Math.abs(baerTempo - 3) < 0.1, (baerTempo || 0).toFixed(2) + ' m/s');
  // Treffer
  const treffe = (art) => {
    const dd = new R.Dynamik(st, { seed: 8 }), stelle = dd.tierStellen.find(x => x.art === art);
    while (!stelle.tiere.length) dd.schritt(dt, { fortschritt: 10, runden: 3 });
    const ti = stelle.tiere[0], p = sp.punktBei(ti.s), v = new R.Vehicle({});
    v.setzen(p.x, p.z, R.headingAus(p.tx, p.tz));
    let tr = [], k = 0;
    while (!tr.length && k < 1200) { v.vLaengs = 30; v.vQuer = 0; dd.schritt(dt, { fortschritt: 10, runden: 3 }); tr = dd.kollisionen([v]); k++; }
    return { tr, v, again: dd.kollisionen([v]).length };
  };
  const r = treffe('reh'), b = treffe('baer');
  pruefe('Reh-Treffer: Tempo −40 % (typ reh)', r.tr.length === 1 && r.tr[0].typ === 'reh' && Math.abs(r.v.vLaengs - 18) < 1e-9 && r.again === 0, JSON.stringify(r.tr));
  pruefe('Bär-Treffer: Tempo −60 % + Brummen (typ baer)', b.tr.length === 1 && b.tr[0].typ === 'baer' && b.tr[0].brummen && Math.abs(b.v.vLaengs - 12) < 1e-9 && b.again === 0,
    JSON.stringify(b.tr));
}
// ---------- W2-C2: Wald – alle Welten mit Tieren, Töne, Variante skaliert tiere generisch ----------
{
  pruefe('W2-C2: Wald 4–5 Tier-Stellen, Rehe und Bären', waldK.tiere.length >= 4 && waldK.tiere.length <= 5 &&
    waldK.tiere.some(t => t.art === 'reh') && waldK.tiere.some(t => t.art === 'baer'));
  ['hindernisse', 'stunt', 'verrueckt'].forEach((w) => {
    const dw = new R.Dynamik(new R.Strecke(waldK, { welt: w }), { seed: 2 });
    pruefe('W2-C2: Wald ' + w + ': Tiere laufen', dw.tierStellen.length === waldK.tiere.length);
  });
  const dw = new R.Dynamik(new R.Strecke(waldK, { welt: 'hindernisse' }), { seed: 4 }), typen = {};
  for (let t = 0; t < 60; t += dt) dw.schritt(dt, { fortschritt: 10, runden: 3 }).ereignisse.forEach((e) => { typen[e.typ] = (typen[e.typ] || 0) + 1; });
  pruefe('W2-C2: Bär brummt beim Betreten der Straße, Reh ruft beim Schauen', typen.brummen >= 2 && typen.rehRuf >= 1, JSON.stringify(typen));
  // varianteAnwenden: Wald hat keine XL-Variante – eine Test-Variante ×1,4 muss tiere trotzdem mitskalieren
  const testK = Object.assign({}, waldK, { varianten: { test: { name: 'Test', faktor: 1.4 } } });
  const sv = new R.Strecke(testK, { welt: 'hindernisse', variante: 'test' });
  const ok = sv.katalog.tiere.every((t, k) => Math.abs(t.s - waldK.tiere[k].s * 1.4) < 0.02 && t.art === waldK.tiere[k].art) && waldK.tiere[0].s === 230;
  const dv = new R.Dynamik(sv, { seed: 1 });
  pruefe('W2-C2: varianteAnwenden skaliert tiere generisch (Katalog unverändert)', ok && dv.tierStellen.length === waldK.tiere.length &&
    dv.tierStellen.every(x => x.s < sv.laenge), sv.katalog.tiere.map(t => t.s).join(', '));
}
// ---------- C5: Meteorit-Ablauf ----------
{
  const st = new R.Strecke(dinoK, { welt: 'hindernisse' }), sp = st.spline, L = st.laenge;
  const d = new R.Dynamik(st, { seed: 13 });
  pruefe('C5: 2 Meteoriten-Stellen, Felsbrocken-Optik', d.meteorStellen.length === 2 && d.felsOptik);
  const m = d.meteorStellen[0], vor = CV.meteor.vorlauf;
  let f = 0, warn = null, ein = null, schattenAufStrasse = false, brocken = 0, ueberStrasse = false;
  const log = [];
  for (let t = 0; t < 140; t += dt) {
    f += 25 * dt;                                   // Führender fährt 25 m/s
    const e = d.schritt(dt, { fortschritt: f, runden: 3 });
    e.ereignisse.forEach((x) => { if (x.typ === 'meteorWarnung' || x.typ === 'einschlag') log.push({ typ: x.typ, t, f, x }); });
    if (m.schatten && Math.abs(sp.naechster(m.schatten.x, m.schatten.z).seitenabstand) < st.breite / 2) schattenAufStrasse = true;
    brocken = Math.max(brocken, m.stroh.ballen.length);
    for (const b of m.stroh.ballen) if (Math.abs(b.q) < 1) ueberStrasse = true;
  }
  const w = log.filter(x => x.typ === 'meteorWarnung' && Math.abs(sp.differenzS(sp.wrapS(x.f), m.s) + vor) < 5);
  warn = w[0];
  ein = log.find(x => x.typ === 'einschlag' && x.x.art === 'meteor' && warn && x.t > warn.t);
  pruefe('C5: Warnung beim ersten Passieren (Führender bei s − vorlauf)', !!warn && Math.abs(warn.f - (m.s - vor)) < 1, warn ? warn.f.toFixed(1) : '-');
  pruefe('C5: Einschlag warnZeit (2 s) später, 15 m neben der Fahrbahn', !!ein && Math.abs(ein.t - warn.t - CV.meteor.warnZeit) < 0.05 &&
    Math.abs(Math.abs(sp.naechster(ein.x.x, ein.x.z).seitenabstand) - (st.breite / 2 + CV.meteor.abstand)) < 0.5,
    ein ? (ein.t - warn.t).toFixed(2) + ' s, q=' + sp.naechster(ein.x.x, ein.x.z).seitenabstand.toFixed(1) : '-');
  pruefe('C5: Schatten wandert über die Straße', schattenAufStrasse);
  pruefe('C5: 3–5 Felsbrocken rollen quer über die Straße', brocken >= 3 && brocken <= 5 && ueberStrasse, brocken + ' Brocken');
  const proRunde = log.filter(x => x.typ === 'meteorWarnung').map(x => Math.floor((x.f + vor) / L) + '@' + Math.round(sp.wrapS(x.f) + vor));
  pruefe('C5: je Stelle genau einmal je Runde', new Set(proRunde).size === proRunde.length && proRunde.length >= 2, proRunde.join(' '));
  pruefe('C5: Ablauf protokolliert (warnung → einschlag → brocken)', m.ablauf.slice(0, 3).map(x => x.typ).join(',') === 'warnung,einschlag,brocken');
}
// ---------- C3: Vulkan – Zeitplan deterministisch, Bomben nicht in Sperrzonen, Krater 20 s ----------
{
  const st = new R.Strecke(dinoK, { welt: 'hindernisse' }), sp = st.spline, L = st.laenge;
  const lauf = (seed, sek, sammeln) => {
    // W2-C1: Krater früherer Läufe (gleiche Strecke, alte Dynamik läuft nicht mehr) entfernen
    for (let i = st.hindernisse.length - 1; i >= 0; i--) if (st.hindernisse[i].typ === 'krater') st.hindernisse.splice(i, 1);
    const d = new R.Dynamik(st, { seed });
    let f = 0, krMax = 0, grollen = 0;
    const ziele = [], krLeben = new Map(), glutMax = { v: 0 };
    for (let t = 0; t < sek; t += dt) {
      f += 34 * dt;
      const e = d.schritt(dt, { fortschritt: f, runden: 99 });
      grollen += e.ereignisse.filter(x => x.typ === 'grollen').length;
      if (sammeln) {
        for (const b of d.bomben) if (!b._gesehen) { b._gesehen = true; ziele.push(b); }
        const kh = st.hindernisse.filter(h => h.typ === 'krater');
        krMax = Math.max(krMax, kh.length);
        kh.forEach(h => krLeben.set(h, (krLeben.get(h) || 0) + dt));
        glutMax.v = Math.max(glutMax.v, d.vulkanGlut);
      }
    }
    return { d, ziele, krMax, krLeben, grollen, glut: glutMax.v };
  };
  const a = lauf(7, 400), b = lauf(7, 400), c = lauf(99, 400);
  const za = a.d.vulkan.ausbrueche, zb = b.d.vulkan.ausbrueche, zc = c.d.vulkan.ausbrueche;
  pruefe('C3: Zeitplan deterministisch (gleicher Seed → gleiche Zeiten)', za.length >= 3 && JSON.stringify(za) === JSON.stringify(zb), za.map(x => x.toFixed(1)).join(', '));
  pruefe('C3: anderer Seed → anderer Zeitplan', JSON.stringify(za) !== JSON.stringify(zc), zc.map(x => x.toFixed(1)).join(', '));
  const abst = za.slice(1).map((x, i) => x - za[i]).concat([za[0]]);
  pruefe('C3: alle 80–110 s', abst.every(x => x >= 80 - 0.05 && x <= 110 + 0.05), abst.map(x => x.toFixed(1)).join(', '));
  pruefe('C3: Grollen-Ereignis je Ausbruch', a.grollen === za.length);
  const g = lauf(7, 2400, true);
  const S = st.schanzen || [];
  const sperr = (s) => Math.abs(sp.differenzS(s, 0)) < 60 || st._engstellen.some(x => st._inBereich(x, s, 20)) ||
    S.some(e => { const dd = sp.differenzS(s, e.s); return dd > -10 && dd < (e.laenge || 10) + 70; });
  const bombenJe = g.d.vulkan.ausbrueche.length * CV.vulkan.bomben;
  pruefe('C3: Lavabomben fliegen (5 je Ausbruch, fast alle mit Ziel)', g.ziele.length >= bombenJe * 0.9 && g.ziele.length <= bombenJe, g.ziele.length + ' von ' + bombenJe);
  pruefe('C3: Lavabomben landen nie in Sperrzonen (Start/Ziel, Tunnel, Brücke, Schanze + Landebereich)', g.ziele.every(x => !sperr(x.s) && g.d.bombenZielErlaubt(x.s)),
    g.ziele.filter(x => sperr(x.s)).map(x => Math.round(x.s)).join(', '));
  pruefe('C3: ballistisch (steigt erst, dann Fall; Start hoch über dem Ziel)', g.ziele.every(x => x.vy > 0 && x.y0 - x.y1 > 10));
  const auf = g.ziele.filter(x => x.auf).length;
  pruefe('C3: Krater auf der Fahrbahn als Hindernis, bleiben 20 s', auf > 0 && g.krMax > 0 && [...g.krLeben.values()].every(z => Math.abs(z - CV.krater.dauer) < 0.1 || z < CV.krater.dauer),
    auf + ' auf der Straße, max gleichzeitig ' + g.krMax + ', Lebensdauer ' + [...g.krLeben.values()].slice(0, 4).map(z => z.toFixed(1)).join('/'));
  pruefe('C3: Himmel-Glut (vulkanGlut) beim Ausbruch > 0,8', g.glut > 0.8, g.glut.toFixed(2));
  pruefe('C3: Bomben-Ziel nie auf Lava', g.ziele.every(x => !st.hindernisse.some(h => h.typ === 'lava' && Math.abs(sp.differenzS(x.s, h.s)) < h.halblaenge + 5)));
}
// ---------- C6: Flugsaurier – kommt von vorn, ≥ 2,5 m über dem Auto, nie Kontakt ----------
{
  const st = new R.Strecke(dinoK, { welt: 'hindernisse' }), sp = st.spline;
  const d = new R.Dynamik(st, { seed: 3 });
  const v = new R.Vehicle({}), F = d.flugsaurier;
  let s = 700, ereig = [], minAbst = Infinity, startD = null, endD = null, vorn = false;
  const autos = [{ vehicle: v, istSpieler: true, fortschritt: 0 }];
  for (let t = 0; t < 16; t += dt) {
    s += 30 * dt;
    const p = sp.punktBei(s);
    v.setzen(p.x + p.nx * 2, p.z + p.nz * 2, R.headingAus(p.tx, p.tz)); v.y = st.hoeheAn(v.x, v.z);
    autos[0].fortschritt = s;
    const e = d.schritt(dt, { fortschritt: s, runden: 3, autos });
    ereig = ereig.concat(e.ereignisse.filter(x => x.typ === 'schrei' || x.typ === 'duck'));
    if (F.aktiv) {
      if (startD === null) { startD = F.d; vorn = F.y - v.y > 20; }
      endD = F.d;
      minAbst = Math.min(minAbst, Math.hypot(F.x - v.x, F.y - v.y, F.z - v.z));
    }
  }
  pruefe('C6/W3-H: Flugsaurier startet 60 m voraus, von vorn, in ~25 m Höhe', startD !== null && startD > 55 && startD < 65 && vorn, 'd0 ' + (startD || 0).toFixed(0) + ' m');
  pruefe('C6: Mindesthöhe über dem Auto ≥ 2,5 m (waagerecht < 3 m)', F.minUeberAuto >= CV.flugsaurier.tief - 1e-6 && F.minUeberAuto < CV.flugsaurier.tief + 0.3,
    F.minUeberAuto.toFixed(3) + ' m');
  pruefe('C6: nie Kontakt (Abstand ≥ 2,4 m)', minAbst >= 2.4, minAbst.toFixed(2) + ' m');
  pruefe('C6: Schrei + Duck genau einmal, fliegt hinten weiter (zieht hoch)', ereig.filter(x => x.typ === 'schrei').length === 1 &&
    ereig.filter(x => x.typ === 'duck').length === 1 && endD < -40, 'd Ende ' + (endD || 0).toFixed(0));
  // W3-H: größer, näher, Schrei beim Auftauchen, Duck ≥ 0,4 m, Mindesthöhe 2,5 m bleibt
  pruefe('W3-H: Flugsaurier Modellgröße ×1,8 (Spannweite 2 × 4,2 × 1,8 ≈ 15 m), Anflug ab 60 m', CV.flugsaurier.groesse === 1.8 && CV.flugsaurier.start === 60 && CV.flugsaurier.tief === 2.5,
    'Spannweite ' + (2 * 4.2 * CV.flugsaurier.groesse).toFixed(1) + ' m');
  {
    const d3 = new R.Dynamik(st, { seed: 3 }), v3 = new R.Vehicle({}), au3 = [{ vehicle: v3, istSpieler: true, fortschritt: 0 }];
    let s3 = 700, schreiD = null, duck = null;
    for (let t = 0; t < 16; t += dt) {
      s3 += 30 * dt; const p = sp.punktBei(s3); v3.setzen(p.x, p.z, R.headingAus(p.tx, p.tz)); v3.y = st.hoeheAn(v3.x, v3.z); au3[0].fortschritt = s3;
      const e = d3.schritt(dt, { fortschritt: s3, runden: 3, autos: au3 });
      e.ereignisse.forEach((x) => { if (x.typ === 'schrei' && schreiD === null) schreiD = d3.flugsaurier.d; if (x.typ === 'duck') duck = x; });
    }
    pruefe('W3-H: Schrei gleich beim Auftauchen (60 m voraus)', schreiD !== null && schreiD > 55, 'd ' + (schreiD || 0).toFixed(0));
    pruefe('W3-H: Kamera-Duck ≥ 0,4 m', duck && duck.staerke >= 0.4, duck ? duck.staerke + ' m' : 'kein Duck');
  }
  // nächster Anflug frühestens nach intervall
  pruefe('C6: Intervall 40 s', F.timer > 20 && d.flugsaurier.intervall === 40, F.timer.toFixed(1));
  // W2-C2: Start-zu-Start = 40 s, solange das Auto auf der Geraden fährt (Auto pendelt auf s 680–900)
  {
    const d2 = new R.Dynamik(st, { seed: 9 }), F2 = d2.flugsaurier, v2 = new R.Vehicle({}), au = [{ vehicle: v2, istSpieler: true, fortschritt: 0 }];
    let s2 = 680;
    for (let t = 0; t < 130; t += dt) {
      s2 += 25 * dt; if (s2 > 900) s2 = 680;
      const p = sp.punktBei(s2);
      v2.setzen(p.x, p.z, R.headingAus(p.tx, p.tz)); v2.y = st.hoeheAn(v2.x, v2.z); au[0].fortschritt = s2;
      d2.schritt(dt, { fortschritt: s2, runden: 3, autos: au });
    }
    const z = F2.starts || [], ab = z.slice(1).map((x, k) => x - z[k]);
    pruefe('W2-C2: Flugsaurier Start-zu-Start alle 40 s', z.length >= 3 && ab.every(a => Math.abs(a - 40) < 1.05), z.map(x => x.toFixed(1)).join(', '));
  }
  const kl = new R.Dynamik(new R.Strecke(dinoK, { welt: 'klassisch' }));
  pruefe('C6/C3/C5: Welt Klassisch – kein Flugsaurier, kein Vulkan, keine Meteoriten', !kl.flugsaurier && !kl.vulkan && kl.meteorStellen.length === 0);
}

// ---------- W2-C1: KI kennt Krater nach dem Einschlag (driver.hindernisseSetzen zur Laufzeit), Bomben mit Abstand ----------
{
  const R2 = ladeModule(['src/config.js', 'src/physics/vehicle.js', 'src/track/spline.js', 'src/track/trackCatalog.js',
    'src/track/trackBuilder.js', 'src/physics/collisions.js', 'src/ai/driver.js', 'src/world/dynamik.js']);
  const st = new R2.Strecke(R2.trackCatalog.find(t => t.id === 'dino'), { welt: 'hindernisse' }), sp = st.spline;
  const v = new R2.Vehicle({}), drv = new R2.Driver(v, st, { schwierigkeit: 'profi', seed: 3 });
  drv.hindernisseSetzen(st.hindernisse);
  const d = new R2.Dynamik(st, { seed: 7 });
  d.vulkan.naechster = 0;
  let f = 400, hv = d.hindernisVersion, wechsel = 0, kenntKrater = false, abstandEinschlag = [];
  const ziele = [];
  for (let t = 0; t < 40; t += dt) {
    f += 30 * dt;                        // Führender fährt 30 m/s
    d.schritt(dt, { fortschritt: f, runden: 99 });
    for (const b of d.bomben) if (!b._g) { b._g = true; ziele.push(b.s); }
    for (const b of d.bomben) if (b.t + dt >= b.T && !b._e) { b._e = true; abstandEinschlag.push(sp.differenzS(b.s, sp.wrapS(f + 30 * dt))); }
    if (d.hindernisVersion !== hv) {
      hv = d.hindernisVersion; wechsel++;
      drv.hindernisseSetzen(st.hindernisse);       // wie main.js / test_welten_ki
      if (drv.streckenHindernisse.some(h => h.typ === 'krater')) kenntKrater = true;
    }
  }
  pruefe('W2-C1: hindernisVersion zählt Krater-Wechsel; hindernisseSetzen erneut aufrufbar → KI kennt Krater (s0/s1)', wechsel >= 2 && kenntKrater, wechsel + ' Wechsel');
  pruefe('W2-C1: nach 20 s sind die Krater auch bei der KI wieder weg', !drv.streckenHindernisse.some(h => h.typ === 'krater') && !st.hindernisse.some(h => h.typ === 'krater'));
  const sortiert = ziele.slice().sort((a, b) => a - b), luecken = sortiert.slice(1).map((x, i) => x - sortiert[i]);
  pruefe('W2-C1: Einschläge eines Ausbruchs ≥ 30 m auseinander (Gasse zum Ausweichen)', ziele.length === 5 && luecken.every(x => x >= 30 - 1e-6), luecken.map(x => x.toFixed(0)).join(', '));
  pruefe('W2-C1: Bomben landen ≥ vorausMin vor dem fahrenden Führenden', abstandEinschlag.length === 5 && abstandEinschlag.every(x => x >= CV.vulkan.vorausMin - 8),
    abstandEinschlag.map(x => x.toFixed(0)).join(', '));
}

console.log(fehler === 0 ? '\nALLE TESTS OK' : '\n' + fehler + ' FEHLER');
process.exit(fehler ? 1 : 0);
