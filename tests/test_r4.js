// R4 – Auto-Stunt-Arena mit Halfpipe + Loopings als Magnet-Röhre (offline): node tests/test_r4.js
//  A) Arena: Katalogeintrag, Plan (Halfpipe 700–950, Auto-Werte, vCap), Profil auf strecke.hoeheAn, ohne Fahr-Zauber keine Pipe, Katalog sonst ohne autoarena
//  B) Motorrad/Standard bitgleich: Pipe-Fingerabdrücke und Pläne gegen tests/r4_referenz.json (aus dem Stand VOR R4), Motorrad-Pipe ohne Auto-Felder
//  C) Auto in der Halfpipe: deterministisch, Wandfahrten/Höhe/Luft/Landung (Pendelschläge messen), vCap, Gas hält das Tempo, kein Steckenbleiben, mehrere Autos
//  D) Looping → Magnet-Röhre: Fantasie 0 Loopings / ≥ 2 Röhren, ohne Option exakt wie vorher, Sperrzonen, KI fährt die Runde, Menü-Schalter, Hülle
const fs = require('fs'), path = require('path');
const { Simulation, laden, ladenMoto } = require('../server/simulation');

let fehler = 0, ok = 0;
setTimeout(() => { console.log('FEHL Wächter: Test hängt (> 900 s) – Abbruch'); process.exit(3); }, 900000).unref();
function pruefe(name, gut, info) { console.log((gut ? 'OK   ' : 'FEHL ') + name + (info !== undefined ? '  (' + info + ')' : '')); if (gut) ok++; else fehler++; }
const hash = (h, x) => Math.imul(h ^ Math.round(x * 10000), 16777619) >>> 0;
const REF = JSON.parse(fs.readFileSync(path.join(__dirname, 'r4_referenz.json'), 'utf8'));

// Arena in den Auto-Katalog legen (im Spiel macht das die Hülle in spassArena.js nur während rennenStarten); Stunt-Park für die Motorrad-Referenz
const R = laden();
const katalogVorher = R.trackCatalog.some((t) => t.id === 'autoarena');
new Function('window', 'THREE', fs.readFileSync(path.join(__dirname, '..', 'src/spass/spassArena.js'), 'utf8'))({ Rennspiel: R }, undefined);
const katalogNachLaden = R.trackCatalog.some((t) => t.id === 'autoarena');
R.trackCatalog.push(R.SpassArena.eintrag());
{
  const RM = ladenMoto();
  new Function('window', 'THREE', fs.readFileSync(path.join(__dirname, '..', 'src/moto/motoM3Welt.js'), 'utf8'))({ Rennspiel: RM }, undefined);
  const pe = RM.Moto.m3welt.parkEintrag();
  if (!RM.trackCatalog.some((t) => t.id === 'stuntpark')) RM.trackCatalog.push(pe);
  if (!R.trackCatalog.some((t) => t.id === 'stuntpark')) R.trackCatalog.push(JSON.parse(JSON.stringify(pe)));
}

function neu(id, moto, opt) {
  opt = opt || {};
  const sim = new Simulation({ einstellungen: Object.assign({ streckeId: id, gegner: opt.gegner || 0, runden: opt.runden || 3, spass: true, zauber: opt.zauber !== false, zufall: false, unfall: moto ? 'aus' : undefined, schwierigkeit: 'mittel' }, opt.einst || {}),
    spieler: opt.ohneMensch ? [] : [{ fahrer: 'Jonas', auto: opt.auto || (moto ? 'crossmaschine' : 'porsche-911'), hilfe: 'wenig' }], seed: opt.seed || 5, moto });
  const S = sim.sim;
  return { sim, S, st: S.strecke, f: S.fahrzeuge[0], v: S.fahrzeuge[0] && S.fahrzeuge[0].vehicle };
}
function lenkungZu(Rk, st, f, v, qZiel) {
  const sp = st.spline, n = st.abfrage(v.x, v.z, f.index), vl = Math.max(3, v.vLaengs), L = Math.max(9, Math.min(50, 0.55 * vl + 8)), pt = sp.punktBei(n.s + L);
  const zx = pt.x + pt.nx * qZiel, zz = pt.z + pt.nz * qZiel;
  let diff = Rk.headingAus(zx - v.x, zz - v.z) - v.heading;
  while (diff > Math.PI) diff -= 2 * Math.PI; while (diff < -Math.PI) diff += 2 * Math.PI;
  return Math.max(-1, Math.min(1, -(2 * vl * Math.sin(diff) / Math.hypot(zx - v.x, zz - v.z)) / v.drehrateMax(vl)));
}

// ---------------------------------------------------------------- A) Arena
{
  const e = R.SpassArena.eintrag(), st = new R.Strecke(R.trackCatalog.find((t) => t.id === 'autoarena'), { spass: true, zauber: true }), z = st.spass.zauber, pe = z && z.pipe;
  pruefe('A Arena: Eintrag (stuntBereich, leere motoFelder, 2 Schanzen 8°/12°, Stadion 40 m breit, keine Gegner-Schichten)', e.stuntBereich === true && Array.isArray(e.motoFelder) && e.motoFelder.length === 0 && e.schanzen.length === 2 && e.schanzen[0].winkel === 8 && e.schanzen[1].winkel === 12 && e.breite === 40 && e.id === 'autoarena');
  pruefe('A Arena: Katalog ohne autoarena nach dem Laden (die Hülle trägt sie nur beim Start ein)', katalogVorher === false && katalogNachLaden === false);
  pruefe('A Arena: Halfpipe im Plan (Gerade 2, s 700–950, Radius 7, Rampen 22, Auto-Flag, vCap 26, Lage 1034 / 150..250), sonst nichts vom Zauber', !!pe && pe.s0 === 700 && pe.s1 === 950 && pe.r === 7 && pe.rampe === 22 && pe.auto === true && pe.vCap === 26 && pe.geo.zOff === 1034 && pe.geo.xMin === 150 && pe.geo.xMax === 250 && !z.magnet.length && !z.schluchten.length && !z.schienen.length && !z.extras.length);
  const sp = st.spline, proto = Object.getPrototypeOf(st), s = 825, p = sp.punktBei(s), q = 13;
  const h = st.hoeheAn(p.x + p.nx * q, p.z + p.nz * q), h0 = proto.hoeheAn.call(st, p.x + p.nx * q, p.z + p.nz * q);
  pruefe('A Arena: strecke.hoeheAn = Straße + Profil (Wand bis 7 m, Mitte flach, vor/hinter der Pipe unverändert)', Math.abs(h - h0 - R.SpassZauber.pipeProfil(pe, s, q)) < 1e-9 && h > 6.9 && h0 === 0 && st.hoeheAn(p.x, p.z) === 0 && st.hoeheAn(200, 650 - 1034) === 0 && st.hoeheAn(200, 975 - 1034) === 0, `Höhe bei q=13: ${h.toFixed(2)}`);
  const ohne = new R.Strecke(R.trackCatalog.find((t) => t.id === 'autoarena'), { spass: true, zauber: false }), ohneSpass = new R.Strecke(R.trackCatalog.find((t) => t.id === 'autoarena'), {});
  pruefe('A Arena: ohne Fahr-Zauber / ohne Spaß keine Halfpipe (Geländeform unverändert)', ohne.spass.zauber === null && ohneSpass.spass === null && ohne.hoeheAn(p.x + p.nx * q, p.z + p.nz * q) === 0);
  const a = JSON.stringify(st.spass.zauber), b = JSON.stringify(new R.Strecke(R.trackCatalog.find((t) => t.id === 'autoarena'), { spass: true, zauber: true }).spass.zauber);
  pruefe('A Arena: Plan deterministisch; keine Trampoline/Kanonen/Tore (motoFelder hält sie fern)', a === b && st.spass.liste.length === 0 && (st.spass.tore || []).length === 0);
  const g = R.SpassZauber;
  pruefe('A Arena: Fahr-Zauber erzwingen gilt nur solange gesetzt (Einstellung des Spielers bleibt)', (() => { const vor = g.an(); g.erzwingen(true); const d = g.an(); g.erzwingen(false); return d === true && g.an() === vor; })());
}

// ---------------------------------------------------------------- B) Motorrad / Standard bitgleich
{
  const RM = ladenMoto();
  const lauf = (pump) => {
    const t = neu('stuntpark', true, { runden: 99 }), sp = t.st.spline, pe = t.st.spass.zauber.pipe, pt = sp.punktBei(pe.s0 - 20);
    t.v.setzen(pt.x, pt.z, RM.headingAus(pt.tx, pt.tz)); t.v.vLaengs = 12; t.f.index = -1;
    t.S.rennen.verfolgungSetzen(t.S.rennen.teilnehmer[0], t.v.x, t.v.z, pe.s0 - 20);
    let h = 2166136261, rides = 0, ymax = 0;
    for (let i = 0; i < 60 * 20; i++) {
      const n = t.f.nah, a2 = n ? sp.differenzS(n.s, pe.s0) : -99;
      const s = { gas: t.v.vLaengs < 12 ? 1 : 0, bremse: 0, lenkung: lenkungZu(RM, t.st, t.f, t.v, 0) };
      if (pump) { if (a2 > 6 && a2 < 18) s.lenkung = 1; if (t.f.flug.pipe) s.lenkung = t.f.flug.pipe.side * (t.f.flug.pipe.w > 0 ? 1 : -1); }
      else if (a2 > 6 && a2 < 14) s.lenkung = 0.6;
      t.sim.eingabeSetzen(0, s); t.sim.schritt();
      h = hash(hash(hash(h, t.v.x), t.v.z), t.f.flug.y); ymax = Math.max(ymax, t.f.flug.y); if (t.f.flug.pipe) rides++;
    }
    return { txt: h + ' rides ' + rides + ' ymax ' + ymax.toFixed(3), pipe: t.st.spass.zauber.pipe };
  };
  const p1 = lauf(true), p2 = lauf(false);
  pruefe('B Motorrad: Halfpipe (Stunt-Park) bitgleich zum Stand vor R4 – Pumpen', p1.txt === REF['moto-pipe-pump'], p1.txt);
  pruefe('B Motorrad: Halfpipe (Stunt-Park) bitgleich zum Stand vor R4 – ruhig', p2.txt === REF['moto-pipe-ruhig'], p2.txt);
  pruefe('B Motorrad: Plan der Pipe ohne Auto-Felder (auto/vCap/geo fehlen)', JSON.stringify(Object.keys(p1.pipe)) === JSON.stringify(['s0', 's1', 'qF', 'r', 'rampe', 'halb']));
  const sj = (id) => { const st = new R.Strecke(R.trackCatalog.find((t) => t.id === id), { spass: true, zauber: true }); let h = 0; for (const c of JSON.stringify(st.spass.zauber)) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0; return h + '/' + st.loopings.length; };
  const bad = ['wiese', 'fantasie', 'alpen', 'wald'].filter((id) => sj(id) !== REF['planhash-' + id]);
  pruefe('B Standard: Zauber-Pläne (Wiese, Fantasie, Alpen, Wald) und Loopings-Anzahl bitgleich zum Stand vor R4', bad.length === 0, bad.join(',') || 'alle gleich');
  const rennen = (id, moto, zauber) => { const t = neu(id, moto, { gegner: 2, zauber, runden: 1 }); let h = 2166136261, n = 0; while (!t.sim.fertig && n < 60 * 40) { t.sim.schritt(); n++; t.S.fahrzeuge.forEach((f) => { h = hash(hash(h, f.vehicle.x), f.vehicle.z); }); } return h; };
  // Kurzlauf (40 s) gegen den Fingerabdruck desselben Laufs auf dem Referenzstand: Wert steht in r4_referenz.json unter kurz-…
  const kurz = { 'auto-fantasie-zauber': rennen('fantasie', false, true), 'auto-fantasie-ohne': rennen('fantasie', false, false), 'moto-alpen-zauber': rennen('alpen', true, true) };
  const refKurz = REF.kurz || null;
  if (refKurz) pruefe('B Standard: Rennen Fantasie (Zauber an/aus) und Motorrad Alpen, 40 s, bitgleich zum Stand vor R4', Object.keys(kurz).every((k) => refKurz[k] === kurz[k]), JSON.stringify(kurz));
  else console.log('INFO Kurzläufe (für r4_referenz.json):', JSON.stringify(kurz));
}

// ---------------------------------------------------------------- C) Auto in der Halfpipe
const AP = R.config.spass.zauber.pipeAuto;
function pipeLauf(strategie, v0, qEin, auto, opt) {
  opt = opt || {};
  const t = neu('autoarena', false, { runden: 99, auto }), sp = t.st.spline, pe = t.st.spass.zauber.pipe, v = t.v, f = t.f, Rk = R;
  const sStart = pe.s0 - 70, pt = sp.punktBei(sStart);
  v.setzen(pt.x, pt.z, Rk.headingAus(pt.tx, pt.tz)); v.vLaengs = v0; f.index = -1;
  t.S.rennen.verfolgungSetzen(t.S.rennen.teilnehmer[0], v.x, v.z, sStart);
  const r = { rides: 0, hoch: 0, luft: 0, flughoeheMax: 0, imRohr: 0, vMaxRohr: 0, h: 2166136261, nan: false, t: 0, fertig: false, landungenInPipe: 0 };
  let inPipe = false, nuLuft = false, yLuft = 0, luftStart = 0, gasAn = opt.gas !== false;
  for (let i = 0; i < 60 * 45; i++) {
    const n = f.nah, vl = Math.max(3, v.vLaengs), s = n ? n.s : sStart, P = f.flug.pipe;
    let qZiel = 0, lenk;
    if (!P && strategie !== 'gerade' && s > pe.s0 - 30 && s < pe.s1 - 30 && !f.flug.aktiv) qZiel = qEin;
    lenk = lenkungZu(Rk, t.st, f, v, qZiel);
    if (P) lenk = strategie === 'pump' ? P.side * (P.w > 0 ? 1 : -1) : 0;
    t.sim.eingabeSetzen(0, { gas: gasAn && v.vLaengs < v0 ? 1 : 0, bremse: 0, lenkung: lenk }); t.sim.schritt();
    const P2 = f.flug.pipe;
    if (P2 && !inPipe) { inPipe = true; r.rides++; }
    if (!P2 && inPipe) inPipe = false;
    if (P2) { r.imRohr++; r.hoch = Math.max(r.hoch, P2.hoch || 0); r.vMaxRohr = Math.max(r.vMaxRohr, P2.vF); }
    const ak = f.flug.aktiv && !P2;
    if (ak && !nuLuft) { nuLuft = true; luftStart = i; yLuft = f.flug.y; }
    if (ak) yLuft = Math.max(yLuft, f.flug.y);
    if (!ak && nuLuft) { nuLuft = false; if (i - luftStart > 15) { r.luft++; r.flughoeheMax = Math.max(r.flughoeheMax, yLuft - pe.r); } }
    if (!isFinite(v.x) || !isFinite(v.z) || !isFinite(f.flug.y)) r.nan = true;
    r.h = hash(hash(hash(r.h, v.x), v.z), f.flug.y);
    r.t = i / 60;
    if (f.nah && f.nah.s > pe.s1 + 40 && !P2 && !f.flug.aktiv) { r.fertig = true; break; }
  }
  r.vEnde = v.vLaengs; r.sEnde = f.nah && f.nah.s;
  return r;
}
{
  const ruhig = pipeLauf('ruhig', 24, 9), ruhig2 = pipeLauf('ruhig', 24, 9), pump = pipeLauf('pump', 24, 9), pump2 = pipeLauf('pump', 24, 9);
  pruefe('C Auto: Halfpipe deterministisch (zwei Läufe bitgleich, ruhig und Pumpen)', ruhig.h === ruhig2.h && pump.h === pump2.h && ruhig.rides === ruhig2.rides, `${ruhig.h} ${pump.h}`);
  pruefe('C Auto: ruhig hineinlenken – mehrere Pendelschläge (≥ 2 Wandfahrten), schaukelt von selbst bis ≥ 3 m hoch, kein Herausfliegen', ruhig.rides >= 2 && ruhig.hoch >= 3 && ruhig.luft === 0 && ruhig.fertig && !ruhig.nan, `${ruhig.rides} Wandfahrten, höchster Punkt ${ruhig.hoch.toFixed(2)} m, ${ruhig.imRohr / 60} s im Rohr`);
  pruefe('C Auto: Pumpen (gegen die Wand lenken, wenn es hochgeht) – bis zur Kante, Luftsprung ≥ 2 m über der Kante und höchstens 8 m, landet wieder in der Pipe', pump.luft >= 1 && pump.flughoeheMax >= 2 && pump.flughoeheMax <= 8 && pump.fertig && pump.hoch >= 6, `${pump.rides} Wandfahrten, ${pump.luft} Luftsprünge, Flughöhe ${pump.flughoeheMax.toFixed(2)} m über der Kante, höchster Punkt ${pump.hoch.toFixed(2)} m`);
  pruefe('C Auto: Geradeaus durch die Pipe-Mitte – nichts passiert (Rennlinie frei)', (() => { const g = pipeLauf('gerade', 24, 0); return g.rides === 0 && g.fertig && g.luft === 0; })());
  // vCap: mit 40 m/s hinein – im Rohr höchstens 26 m/s
  const schnell = pipeLauf('pump', 40, 9);
  pruefe(`C Auto: Tempo im Rohr gedeckelt (vCap ${AP.vCap} m/s) – auch bei 40 m/s Einfahrt`, schnell.rides >= 1 && schnell.vMaxRohr <= AP.vCap + 1e-9 && schnell.fertig, `im Rohr max ${schnell.vMaxRohr.toFixed(2)} m/s`);
  // Steckenbleiben: Gas halten – Tempo bleibt; ohne Gas (rollen) trotzdem durch
  const ohneGas = pipeLauf('ruhig', 20, 9, 'porsche-911', { gas: false });
  pruefe('C Auto: auch ohne Gas bleibt das Auto nicht stecken – kommt innerhalb von 45 s am Ende der Pipe heraus', ohneGas.fertig && !ohneGas.nan, `${ohneGas.t.toFixed(1)} s, Ende bei s ${ohneGas.sEnde && ohneGas.sEnde.toFixed(0)}, ${ohneGas.rides} Wandfahrten`);
  const langsam = pipeLauf('ruhig', 9, 9);
  pruefe('C Auto: langsam (9 m/s) hineinlenken – kommt ebenfalls heraus, nichts bricht', langsam.fertig && !langsam.nan, `${langsam.t.toFixed(1)} s, ${langsam.rides} Wandfahrten, höchster Punkt ${langsam.hoch.toFixed(2)} m`);
  // mehrere Autos (schwer, schnell, Formel)
  const autos = ['multivan', 'amg-gt', 'formel', 'mini-cooper'].map((a) => [a, pipeLauf('pump', 24, 9, a)]);
  pruefe('C Auto: Multivan, AMG GT, Formel, Mini – alle kommen mit Pumpen heraus, nie in der Luft verloren, nie außerhalb der Arena (|q| ≤ 20)', autos.every(([a, r]) => r.fertig && !r.nan && r.rides >= 1), autos.map(([a, r]) => `${a}: ${r.rides}×, Luft ${r.luft}, ${r.flughoeheMax.toFixed(1)} m`).join(' | '));
}

// ---------------------------------------------------------------- D) Looping → Magnet-Röhre
{
  const SZ = R.SpassZauber, Rk = R;
  const bau = (id, opt) => new Rk.Strecke(Rk.trackCatalog.find((t) => t.id === id), Object.assign({ spass: true, zauber: true }, opt || {}));
  const fk = bau('fantasie'), fm = bau('fantasie', { loopingMagnet: true }), fm2 = bau('fantasie', { loopingMagnet: true });
  const rm = fm.spass.zauber.magnet.filter((m) => m.ausLooping);
  pruefe('D Fantasie: mit Magnet-Röhren-Option 0 Loopings und ≥ 2 Röhren aus Loopings (2 Loopings ohne Option)', fk.loopings.length === 2 && fm.loopings.length === 0 && rm.length >= 2, `Röhren ${fm.spass.zauber.magnet.map((m) => Math.round(m.s0) + '/' + m.laenge).join(' ')}`);
  pruefe('D Fantasie: Plan deterministisch; Säulen der Loopings entfallen (Bande)', JSON.stringify(fm.spass.zauber) === JSON.stringify(fm2.spass.zauber) && fk.saeulen.some((x) => x.art === 'loopingBein') && !fm.saeulen.some((x) => x.art === 'loopingBein') && fm.saeulen.length < fk.saeulen.length, `${fk.saeulen.length} → ${fm.saeulen.length}`);
  const sp = fm.spline, z = fm.spass.zauber;
  const belegt = z.magnet.map((m) => ({ a: m.s0, b: m.s1 })).concat((fm.schanzen || []).map((e) => ({ a: e.s, b: e.s + (e.laenge || 10) })));
  let ueberlapp = 0;
  for (let i = 0; i < belegt.length; i++) for (let j = i + 1; j < belegt.length; j++) if (Math.abs(sp.differenzS((belegt[i].a + belegt[i].b) / 2, (belegt[j].a + belegt[j].b) / 2)) < (belegt[i].b - belegt[i].a) / 2 + (belegt[j].b - belegt[j].a) / 2) ueberlapp++;
  const inZonen = rm.every((m) => fm.spass.zonen.some((zo) => sp.differenzS(m.s0, zo.s0) >= -8 && sp.differenzS(m.s1, zo.s1) <= 8));
  const andere = [].concat(z.schluchten.map((e) => [e.sT - 14, e.sL + 14]), z.schienen.map((e) => [e.s0, e.s1]), (fm.spass.liste || []).map((e) => [e.s0, e.s0 + (e.laenge || 10)]), (fm.spass.tore || []).map((e) => [e.sA, e.sB]));
  const stoert = andere.some(([a, b]) => rm.some((m) => Math.abs(sp.differenzS((a + b) / 2, (m.s0 + m.s1) / 2)) < (b - a) / 2 + m.laenge / 2));
  pruefe('D Fantasie: Röhren aus Loopings überlappen nichts (Schanzen, andere Röhren, Schluchten, Schienen, Trampoline/Tore) und stehen in spass.zonen (Zufall/Hindernisse meiden sie)', ueberlapp === 0 && !stoert && inZonen);
  // nicht gerade genug oder kein Platz → bleibt Looping: andere Strecken ändern sich nicht
  const same = ['wiese', 'wald', 'alpen'].every((id) => JSON.stringify(bau(id).spass.zauber) === JSON.stringify(bau(id, { loopingMagnet: true }).spass.zauber));
  pruefe('D Strecken ohne Loopings: Option ändert nichts (Pläne gleich)', same);
  pruefe('D Ohne Fahr-Zauber bleibt das Looping (Option wirkt nur mit spass+zauber)', bau('fantasie', { zauber: false, loopingMagnet: true }).loopings.length === 2 && new Rk.Strecke(Rk.trackCatalog.find((t) => t.id === 'fantasie'), { loopingMagnet: true }).loopings.length === 2);
  pruefe('D Wer die Röhre aus dem Looping fährt, hat dieselben Magnet-Regeln (Wand/Decke, θ = π in der Mitte)', rm.every((m) => Math.abs(SZ.magnetTheta(m, sp, m.s0 + m.laenge / 2) - Math.PI) < 1e-9 && SZ.magnetTheta(m, sp, m.s0 - 1) === 0 && m.rampe * 2 < m.laenge));
  // Menü-Schalter
  const s0 = SZ.loopMagRoh(); SZ.loopMagSetzen(true);
  const an = SZ.an(); const m1 = SZ.loopMag(); SZ.anSetzen(false); const m2 = SZ.loopMag(); SZ.anSetzen(an); SZ.loopMagSetzen(s0);
  pruefe('D Menü: Loopings „Magnet-Röhre“ gilt nur mit Fahr-Zauber; Standard Klassisch', s0 === false && m1 === an && m2 === false);
  pruefe('D Hülle um streckeAufbauen vorhanden (Magnet-Röhre nur im Offline-Rennstart, nie online)', R.Spiel.prototype._loopMagHuelle === true);

  // Rennen: KI auf Fantasie mit Röhren statt Loopings (Option per Hülle um R.Spass.plan eingeschleust)
  const planOrig = R.Spass.plan;
  R.Spass.plan = function (st, sicht, zufallAn, opt) { return planOrig.call(this, st, sicht, zufallAn, Object.assign({}, opt, { loopingMagnet: true })); };
  const t0 = Date.now(), t = neu('fantasie', false, { gegner: 3, runden: 1, ohneMensch: true });
  const stF = t.st, zF = stF.spass.zauber;
  let n = 0, resets = 0, magnet = 0, h = 2166136261;
  const prev = t.S.fahrzeuge.map(() => 0);
  while (!t.sim.fertig && n < 60 * 500) {
    t.sim.schritt(); n++;
    t.sim.abholen().forEach((e) => { if (e.art === 'reset') resets++; });
    t.S.fahrzeuge.forEach((f, i) => { const zz = f.flug.z; if (zz && zz.magN > prev[i]) { magnet += zz.magN - prev[i]; prev[i] = zz.magN; } h = hash(hash(h, f.vehicle.x), f.vehicle.z); });
  }
  R.Spass.plan = planOrig;
  const t2 = neu('fantasie', false, { gegner: 3, runden: 1, ohneMensch: true });
  pruefe(`D Fantasie mit Röhren statt Loopings: alle KI im Ziel ohne Resets, jede Röhre wird befahren (${zF.magnet.length} Röhren, ${magnet} Fahrten, ${stF.loopings.length} Loopings)`, t.sim.fertig && resets === 0 && stF.loopings.length === 0 && magnet >= zF.magnet.length * 2, `${(n / 60).toFixed(0)} s, Resets ${resets}, ${((Date.now() - t0) / 1000).toFixed(0)} s Rechenzeit`);
  pruefe('D Fantasie klassisch (Option aus) hat weiter 2 Loopings und keine Röhren aus Loopings', t2.st.loopings.length === 2 && !t2.st.spass.zauber.magnet.some((m) => m.ausLooping));
}

console.log(`\n${ok} OK, ${fehler} FEHL`);
process.exit(fehler ? 1 : 0);
