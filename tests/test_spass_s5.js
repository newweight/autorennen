// S5 – Neue Welten (Rechenteile, Autorennen UND Motorrad): node tests/test_spass_s5.js
//  A) Katalog + Strecken: Mond, Unterwasser, Regenbogenland (Thema, Länge, Schwerkraft nur auf dem Mond), Tore: Sperrregeln wie Trampolin/Kanone/Glastunnel
//  B) Schwerkraft je Strecke: Flugzeit Mond = 2·vy/(0,35·g), Erde unverändert; Server und „Browser“ rechnen bitgleich
//  C) Hüpfer bei Bodenwellen (nur Mond), deterministisch
//  D) Teleport-Tore: Durchfahrt → Partnertor, Tempo/Richtung bleiben, Checkpoints gutgeschrieben, deterministisch, Server (Simulation)
//  E) KI schafft die Runde auf allen neuen Strecken (Auto und Motorrad): ins Ziel, keine Resets, kaum abseits
//  F) Vorhersage (Client) = Server auf dem Mond (Hüpfer) und im Regenbogenland (Tor)
//  G) Sticker, „Spaß aus“ ohne Tore, alte Strecken ohne S5-Felder
'use strict';
const { Simulation, kontextLaden, laden, ladenMoto, MODULE } = require('../server/simulation');

let fehler = 0, ok = 0;
setTimeout(() => { console.log('FEHL Wächter: Test hängt (> 600 s) – Abbruch'); process.exit(3); }, 600000).unref();
function pruefe(name, gut, info) { console.log((gut ? 'OK   ' : 'FEHL ') + name + (info !== undefined ? '  (' + info + ')' : '')); if (gut) ok++; else fehler++; }

const NEU = ['mond', 'unterwasser', 'regenbogenland'];
const ALT = ['wiese', 'wald', 'wueste', 'fantasie', 'dino', 'alpen', 'formel1'];
const SPIELE = [['auto', laden()], ['motorrad', ladenMoto()]];
const bau = (R, id, opt) => new R.Strecke(R.trackCatalog.find((t) => t.id === id), Object.assign({ spass: true }, opt || {}));
const hash = (h, x) => { h = Math.imul(h ^ Math.round(x * 10000), 16777619) >>> 0; return h; };

// ---------------------------------------------------------------- A) Katalog + Strecken
for (const [sp, R] of SPIELE) {
  const kat = (id) => R.trackCatalog.find((t) => t.id === id);
  pruefe(`A ${sp}: drei neue Strecken im Katalog (Mond, Unterwasser, Regenbogenland) mit Thema`, NEU.every((id) => kat(id)) && kat('mond').thema === 'mond' && kat('unterwasser').thema === 'ozean' && kat('regenbogenland').thema === 'regenbogen');
  pruefe(`A ${sp}: Themen für Wetter/Deko vorhanden, nur klares Wetter in den neuen Welten`, ['mond', 'ozean', 'regenbogen'].every((t) => R.themes[t] && R.Wetter.erlaubt(t, 'sommer').join() === 'klar' && R.Wetter.erlaubt(t, 'winter').join() === 'klar'));
  pruefe(`A ${sp}: Schwerkraft 0,35 nur auf dem Mond (sonst kein Feld = Erde)`, R.SpassWelten.schwerkraft(bau(R, 'mond')) === 0.35 && NEU.slice(1).concat(ALT).every((id) => R.SpassWelten.schwerkraft(bau(R, id)) === 1));
  const info = [];
  let laengeOk = true;
  for (const id of NEU) {
    const st = bau(R, id), L = st.spline.laenge;
    if (!(L > 1800 && L < 3300)) laengeOk = false;
    info.push(id + ' ' + Math.round(L) + ' m, Tore ' + st.spass.tore.length + ', Elemente ' + st.spass.liste.length);
  }
  pruefe(`A ${sp}: Längen 1,8–3,3 km, Spaß-Plan baut`, laengeOk, info.join(' | '));
  // Sperrregeln: Tore nie in Trampolin/Kanone, nie im Glastunnel, Paare mit Abstand
  let regelOk = true, infoR = '', anzTore = 0;
  for (const id of NEU.concat(ALT)) {
    const st = bau(R, id), s = st.spline, T = st.spass.tore || [];
    anzTore += T.length;
    for (const t of T) {
      const a = t.sA - 22, b = t.sB + 22, mitte = (a + b) / 2, h = (b - a) / 2;
      st.spass.liste.forEach((e) => { const c = e.s0 + (e.laenge || 0) / 2; if (Math.abs(s.differenzS(mitte, c)) < h + (e.laenge || 0) / 2) { regelOk = false; infoR += `${id}:${e.art} `; } });
      ((st.katalog && st.katalog.glasTunnel) || []).forEach((g) => { if (Math.abs(s.differenzS(mitte, (g.s0 + g.s1) / 2)) < h + (g.s1 - g.s0) / 2) { regelOk = false; infoR += `${id}:glas `; } });
      if (!(t.sB - t.sT > 100 && t.sB - t.sT < 160 && t.halb > 2.5)) { regelOk = false; infoR += id + ':maß '; }
    }
    for (let i = 0; i < T.length; i++) for (let j = i + 1; j < T.length; j++) if (Math.abs(s.differenzS(T[i].sB, T[j].sA)) < 100) { regelOk = false; infoR += id + ':paare '; }
  }
  pruefe(`A ${sp}: Tore – nie in Trampolin/Kanone/Glastunnel, Abstand A–B 100–160 m, Paare getrennt`, regelOk && anzTore >= 3, infoR + 'Tore gesamt ' + anzTore);
  pruefe(`A ${sp}: Mond und Regenbogenland haben mindestens ein Torpaar, Plan ist deterministisch`, bau(R, 'mond').spass.tore.length >= 1 && bau(R, 'regenbogenland').spass.tore.length >= 1 &&
    JSON.stringify(bau(R, 'mond').spass.tore) === JSON.stringify(bau(R, 'mond').spass.tore));
}

// ---------------------------------------------------------------- B) Schwerkraft je Strecke, Server = „Browser“
{
  const CL = kontextLaden(['vendor/three.min.js', 'src/config.js', 'src/physics/vehicle.js', 'src/physics/collisions.js', 'src/cars/carCatalog.js', 'src/track/spline.js', 'src/track/trackCatalog.js',
    'src/track/trackBuilder.js', 'src/track/looping.js', 'src/track/schanze.js', 'src/track/trackWelten.js', 'src/track/anlauf.js', 'src/spass/spassKern.js', 'src/world/themes.js', 'src/world/wetter.js', 'src/world/themenS5.js',
    'src/net/protokoll.js', 'src/main.js', 'src/spass/spassPhysik.js', 'src/spass/spassWelten.js']);
  const flug = (R, id, vy) => {
    const st = bau(R, id), car = R.carCatalog.waehlbare()[0], v = new R.Vehicle(car.fahrwerte, { tempoKlasse: 'mittel' });
    const p = st.spline.punktBei(30); v.setzen(p.x, p.z, R.headingAus(p.tx, p.tz)); v.y = st.hoeheAn(p.x, p.z); v.vLaengs = 0;
    const fz = R.Schanzen.zustand(); fz.aktiv = true; fz.vy = vy; fz.y = v.y; fz.yVorher = v.y; fz.t = 0; fz.index = 0; fz.sprungGemeldet = true; v.imFlug = true;
    const dt = R.config.physik.schritt; let h = 2166136261, n = 0, hmax = 0;
    while (fz.aktiv && n < 60 * 60) { R.Schanzen.flugSchritt(fz, v, st, { gas: 0, lenkung: 0 }, dt); h = hash(h, fz.y); hmax = Math.max(hmax, fz.y - st.hoeheAn(v.x, v.z)); n++; }
    return { t: n * dt, h, hmax };
  };
  const R0 = laden();
  const g = R0.config.stunt.schanze.g, vy = 10;
  const mond = flug(R0, 'mond', vy), erde = flug(R0, 'wiese', vy), mondC = flug(CL, 'mond', vy), erdeC = flug(CL, 'wiese', vy);
  pruefe('B Flugzeit Mond = 2·vy/(0,35·g)', Math.abs(mond.t - 2 * vy / (0.35 * g)) < 0.12, `${mond.t.toFixed(2)} s, erwartet ${(2 * vy / (0.35 * g)).toFixed(2)} s, Höhe ${mond.hmax.toFixed(1)} m`);
  pruefe('B Flugzeit Erde unverändert (Wiese)', Math.abs(erde.t - 2 * vy / g) < 0.08, `${erde.t.toFixed(2)} s`);
  pruefe('B Server und „Browser“ rechnen den Flug bitgleich (Mond und Erde)', mond.h === mondC.h && erde.h === erdeC.h && mond.t === mondC.t, `${mond.h} ${mondC.h}`);
  pruefe('B Trampolin auf dem Mond sanfter (Faktor 0,5), auf der Erde unverändert', bau(R0, 'mond').katalog.trampolinFaktor === 0.5 && !bau(R0, 'wiese').katalog.trampolinFaktor);
}

// ---------------------------------------------------------------- Hilfs-Lauf: KI-Rennen in der Simulation
function lauf(id, moto, opt) {
  opt = opt || {};
  const sim = new Simulation({ einstellungen: { streckeId: id, gegner: 3, runden: opt.runden || 1, schwierigkeit: opt.schw || 'mittel', spass: opt.spass !== false, zufall: false, unfall: moto ? 'aus' : undefined }, spieler: [], seed: 3, moto });
  const S = sim.sim, st = S.strecke, r = { huep: 0, tele: 0, abseits: 0, resets: 0, h: 2166136261, schritte: 0, fertig: false, tore: (st.spass && st.spass.tore) || [], teleListe: [] };
  const hn = S.fahrzeuge.map(() => 0), tn = S.fahrzeuge.map(() => 0), maxS = opt.maxSchritte || 60 * 400;
  while (!sim.fertig && r.schritte < maxS) {
    sim.schritt(); r.schritte++;
    const ev = sim.abholen();
    S.fahrzeuge.forEach((f, i) => {
      if (f.flug.huepfN > hn[i]) { r.huep += f.flug.huepfN - hn[i]; hn[i] = f.flug.huepfN; }
      if (f.flug.tele && f.flug.tele.n > tn[i]) { r.tele += f.flug.tele.n - tn[i]; tn[i] = f.flug.tele.n; r.teleListe.push({ i, schritt: r.schritte, tele: JSON.parse(JSON.stringify(f.flug.tele)), tempo: f.vehicle.vLaengs, hd: f.vehicle.heading }); }
      const t = S.rennen.teilnehmer[i]; if (S.rennen.gasErlaubt && Math.abs(t.seitenabstand) > st.breite / 2 + 1.5) r.abseits++;
      r.h = hash(hash(hash(r.h, f.vehicle.x), f.vehicle.z), f.vehicle.y);
    });
    ev.forEach((e) => { if (e.art === 'reset') r.resets++; });
    if (opt.bis && opt.bis(r, S)) break;
  }
  r.fertig = sim.fertig; r.S = S; r.st = st;
  r.zeiten = S.rennen.teilnehmer.map((t) => t.bestzeit && +t.bestzeit.toFixed(1));
  return r;
}

// ---------------------------------------------------------------- C) Hüpfer
for (const moto of [false, true]) {
  const sp = moto ? 'motorrad' : 'auto';
  const a = lauf('mond', moto, { maxSchritte: 60 * 50 }), b = lauf('mond', moto, { maxSchritte: 60 * 50 }), w = lauf('wiese', moto, { maxSchritte: 60 * 50 });
  pruefe(`C ${sp}: Mond – Bodenwellen werfen die Fahrzeuge in die Luft (Hüpfer), auf der Wiese keiner`, a.huep >= 3 && w.huep === 0, `Mond ${a.huep}, Wiese ${w.huep} in 50 s`);
  pruefe(`C ${sp}: Hüpfer deterministisch (zwei Läufe bitgleich)`, a.h === b.h && a.huep === b.huep, `${a.h} ${b.h}`);
}

// ---------------------------------------------------------------- D) Teleport-Tore + E) KI schafft die Runde
const lauefe = {};
for (const moto of [false, true]) for (const id of NEU) {
  const sp = moto ? 'motorrad' : 'auto', t0 = Date.now();
  const r = lauf(id, moto), r2 = id === 'regenbogenland' || id === 'mond' ? lauf(id, moto) : null;
  lauefe[sp + id] = r;
  const tAnz = r.tore.length;
  pruefe(`E ${sp}/${id}: alle KI im Ziel (1 Runde), keine Resets, abseits ≤ 120 Schritte`, r.fertig && r.resets === 0 && r.abseits <= 120, `${(r.schritte / 60).toFixed(0)} s, Zeiten ${r.zeiten.join('/')}, Resets ${r.resets}, abseits ${r.abseits}, Hüpfer ${r.huep}, Teleports ${r.tele} (${((Date.now() - t0) / 1000).toFixed(0)} s Rechenzeit)`);
  if (tAnz) {
    pruefe(`D ${sp}/${id}: Teleports passieren (jede KI fährt durch das Tor), Tempo und Fahrtrichtung bleiben`, r.tele >= 3 && r.teleListe.every((e) => {
      const st = r.st, pB = st.spline.punktBei(e.tele.sZiel), dh = Math.abs(r.S.fahrzeuge[0].vehicle.constructor.winkelDiff(e.hd, require('../server/simulation').laden().headingAus(pB.tx, pB.tz)));
      return e.tempo > 5 && Math.hypot(e.tele.nach.x - pB.x, e.tele.nach.z - pB.z) <= st.breite / 2 + 0.5 && dh < 0.5;
    }), `${r.tele} Teleports, Tore ${JSON.stringify(r.tore.map((t) => [Math.round(t.sT), Math.round(t.sB)]))}`);
  }
  if (r2) pruefe(`D ${sp}/${id}: zwei Läufe bitgleich (Hüpfer + Teleport deterministisch)`, r.h === r2.h && r.tele === r2.tele && r.huep === r2.huep, `${r.h} ${r2.h}`);
}

// ---------------------------------------------------------------- F) Vorhersage = Server (Mond: Hüpfer, Regenbogenland: Tor)
{
  const C = kontextLaden(['vendor/three.min.js', 'src/config.js', 'src/physics/vehicle.js', 'src/physics/collisions.js', 'src/cars/carCatalog.js',
    'src/track/spline.js', 'src/track/trackCatalog.js', 'src/track/trackBuilder.js', 'src/track/looping.js', 'src/track/schanze.js', 'src/track/trackWelten.js', 'src/track/anlauf.js', 'src/spass/spassKern.js',
    'src/world/themes.js', 'src/world/schilder.js', 'src/world/wetter.js', 'src/world/themenS5.js', 'src/world/kleber.js', 'src/world/polizei.js', 'src/net/protokoll.js', 'src/spass/spassWelten.js', 'src/net/vorhersage.js']);
  const autopilot = (st, v, idx) => {
    const n = st.abfrage(v.x, v.z, idx), sp = st.spline, vl = Math.max(3, v.vLaengs), L = Math.max(9, Math.min(50, 0.55 * vl + 8)), ziel = sp.punktBei(n.s + L);
    let diff = C.headingAus(ziel.x - v.x, ziel.z - v.z) - v.heading;
    while (diff > Math.PI) diff -= 2 * Math.PI; while (diff < -Math.PI) diff += 2 * Math.PI;
    const lenkung = Math.max(-1, Math.min(1, -(2 * vl * Math.sin(diff) / Math.hypot(ziel.x - v.x, ziel.z - v.z)) / v.drehrateMax(vl)));
    const soll = st.tempoBei(n.s + vl * 0.3) * 0.85;
    return { s: { gas: v.vLaengs < soll ? 1 : 0, bremse: v.vLaengs > soll + 3 ? 0.5 : 0, lenkung }, idx: n.index };
  };
  for (const [id, sMin] of [['mond', 0], ['regenbogenland', 1100]]) {
    const sim = new Simulation({ einstellungen: { streckeId: id, runden: 2, gegner: 0, tageszeit: 'tag', jahreszeit: 'sommer', wetter: 'klar', spass: true }, spieler: [{ fahrer: 'Jonas', auto: 'porsche-911', hilfe: 'wenig' }], seed: 1234 });
    const info = sim.startInfo(), e = info.einstellungen;
    const daten = C.trackCatalog.find((t) => t.id === id), st = new C.Strecke(daten, { spass: true });
    const w = new C.Wetter(null, { jahreszeit: e.jahreszeit, wetter: e.wetter, wind: { staerke: e.windStaerke, richtung: e.windRichtung }, thema: daten.thema, seed: 1, strecke: st, tageszeit: e.tageszeit });
    const auto = C.carCatalog.waehlbare().find((a) => a.id === 'porsche-911');
    const V = new C.NetzVorhersage({ strecke: st, auto, tempoKlasse: e.tempoKlasse, fahrhilfe: 'wenig', umwelt: () => w.umwelt() });
    const p = st.startpositionen(info.teilnehmer.length)[0];
    V.vp.setzen(p.x, p.z, p.heading); V.vp.y = st.hoeheAn(p.x, p.z);
    const pv = new C.Vehicle(auto.fahrwerte, { tempoKlasse: e.tempoKlasse });
    let maxNormal = 0, maxStart = 0, sonder = 0, idx = -1, schritte = 0, gleich = 0, hup = 0, tele = 0;
    const fz0 = () => sim.sim.fahrzeuge[0].flug;
    let hn = 0, tn = 0;
    const lang = id === 'mond' ? 60 * 60 : 60 * 100;
    for (let n = 1; n <= lang; n++) {
      const ich0 = sim.ich(0);
      C.Netz.fahrzeugSchreiben(pv, ich0.v);
      const a = autopilot(st, pv, idx); idx = a.idx;
      const s = C.Netz.eingabeDekodieren(C.Netz.eingabeKodieren(a.s));
      const cd = sim.sim.rennen.zustand === 'countdown', ziel = sim.sim.rennen.teilnehmer[0].imZiel;
      sim.eingabeSetzen(0, s); sim.schritt();
      V.schritt(n, s, { countdown: cd, imZiel: ziel });
      const f = fz0(); if (f.huepfN > hn) { hup += f.huepfN - hn; hn = f.huepfN; } if (f.tele && f.tele.n > tn) { tele += f.tele.n - tn; tn = f.tele.n; }
      if (n % 3 === 0) {
        const ich = sim.ich(0); ich.ack = n;
        const d = Math.hypot(V.vp.x - ich.v[0], V.vp.z - ich.v[1]);
        if (ich.so || V.sonder) sonder++;
        else if (n < 60 * 6) maxStart = Math.max(maxStart, d);
        else { maxNormal = Math.max(maxNormal, d); schritte++; if (d < 1e-3) gleich++; }
        V.abgleich(ich, null);
      }
    }
    const anteil = gleich / Math.max(1, schritte);
    pruefe(`F ${id}: Vorhersage = Server (≥ 90 % der Vergleiche < 1 mm, max < 3 m), dabei ${hup} Hüpfer, ${tele} Teleports`, anteil >= 0.9 && maxNormal < 3 && schritte > 100 && (id === 'mond' ? hup >= 3 : tele >= 1),
      `${(anteil * 100).toFixed(1)} % gleich, max ${maxNormal.toFixed(3)} m, Start ${maxStart.toFixed(3)} m, ${schritte} Vergleiche, ${sonder} Sonderzustand`);
    void sMin;
  }
}

// ---------------------------------------------------------------- G) Sticker, Spaß aus, alte Strecken
{
  const { ladeModule } = require('./lade');
  const RS = ladeModule(['src/config.js', 'src/spass/spassSticker.js']), SK = RS.SpassSticker;
  for (const spiel of ['auto', 'motorrad']) {
    SK.zurueck(spiel);
    const kat = SK.katalog(spiel).map((k) => k.id), neu = ['mond', 'mondHupf', 'tiefsee', 'regenbogen', 'teleport', 'dinofreund'];
    pruefe(`G ${spiel}: sechs neue Sticker im Katalog (eindeutig, ≤ 60)`, neu.every((id) => kat.includes(id)) && new Set(kat).size === kat.length && kat.length <= 60, kat.length);
    const g = (n, d) => SK.ereignis(spiel, n, d).map((k) => k.id);
    SK.ereignis(spiel, 'ziel', { platz: 2, streckeId: 'wiese' });
    const r1 = g('ziel', { platz: 2, streckeId: 'mond' }), r2 = g('ziel', { platz: 2, streckeId: 'unterwasser' }), r3 = g('ziel', { platz: 2, streckeId: 'regenbogenland' });
    pruefe(`G ${spiel}: Ziel auf Mond / Unterwasser / Regenbogenland gibt je einen Sticker`, r1.includes('mond') && r2.includes('tiefsee') && r3.includes('regenbogen'), [r1, r2, r3].join(' | '));
    pruefe(`G ${spiel}: Hüpfer erst ab 10, Teleport, Dino-Brüllen`, g('huepfer', { n: 9 }).length === 0 && g('huepfer', { n: 10 }).includes('mondHupf') && g('teleport').includes('teleport') && g('dino').includes('dinofreund'));
    SK.zurueck(spiel);
  }
}
for (const [sp, R] of SPIELE) {
  const aus = bau(R, 'mond', { spass: false });
  pruefe(`G ${sp}: Spaß aus → keine Tore (spass = null), Strecke bleibt gleich lang`, !aus.spass && Math.abs(aus.spline.laenge - bau(R, 'mond').spline.laenge) < 1e-9);
  const S5KEYS = ['schwerkraft', 'gripFaktor', 'bremsFaktor', 'huepfer', 'glasTunnel', 'regenbogenFahrbahn', 'trampolinFaktor', 'keineWolken', 'keineSonne'];
  pruefe(`G ${sp}: alte Strecken haben kein S5-Feld`, ALT.every((id) => !S5KEYS.some((k) => R.trackCatalog.find((t) => t.id === id)[k] !== undefined)));
  const w = new R.Wetter(null, { thema: 'wiese', seed: 1 }), um = w.umwelt(), wm = new R.Wetter(null, { thema: 'mond', seed: 1, strecke: bau(R, 'mond') }).umwelt();
  pruefe(`G ${sp}: Grip je Strecke – Mond rutschiger/weniger Bremse, Wiese unverändert`, um.gripFaktor === 1 && wm.gripFaktor < 1 && wm.bremsFaktor < 1, `Mond ${wm.gripFaktor}/${wm.bremsFaktor}`);
}

console.log(`\n${ok} OK, ${fehler} FEHL`);
process.exit(fehler ? 1 : 0);
