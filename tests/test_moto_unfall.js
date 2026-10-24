// Node-Test Motorrad-Unfälle (Stufe M2c): node tests/test_moto_unfall.js
// Prüft die reine Logik (src/moto/unfall.js) und die Stationen je Strecke ohne Browser:
//   1. Verteilung der Folgen je Modus (sanft 50/30/15/5, echt 20/40/28/12) über ~1000 Stürze innerhalb ±3 Prozentpunkten, Modus „aus“ ohne Folgen
//   2. Deterministisch (gleiche Saat/Fahrer/Nr. = gleiche Folge, kein Math.random), andere Saat/Fahrer = andere Folge
//   3. Motorrad-Zustand: −25 % je Schaden, nie unter 25 %, bei 25 % + Schaden kommt der Abschleppwagen, Anteil schwerer Schäden je Modus
//   4. Tempo-Wirkung (bei 25 % etwa −30 %), Pflaster −10 % Höchsttempo, Verband keine Strafe
//   5. Reparatur → 100 %, Pflaster/Verband heilt die Krankenstation, Krankenwagen setzt den Verband, HUD-Zustand/Farbe
//   6. Szenen-Zeitplan: Krankenwagen und Abschleppwagen je etwa 4–6 s, Phasen in der richtigen Reihenfolge, Zeitlimit größer als die Szene
//   7. Je Strecke (alle Strecken × Welten × Varianten, Mega): genau 1 Werkstatt und 1 Krankenstation, nicht am selben Fleck, beide auf befahrbarer Lage
//      (gerade, normal breit, Zufahrt/Fläche als „strasse“/„rand“ befahrbar, nicht in Schanze/Anlauf/Ring/Bus-Reihe)
//   8. Autorennen bleibt unberührt (ohne window.MOTORRAD ändert das Modul nichts an der Werkstatt)
const S = require('../server/simulation.js');
let fehler = 0, anzahl = 0;
function pruefe(name, ok, info) { anzahl++; console.log((ok ? 'OK   ' : 'FEHL ') + name + (info !== undefined && info !== '' ? '  (' + info + ')' : '')); if (!ok) fehler++; }
const nah = (a, b, tol) => Math.abs(a - b) <= (tol === undefined ? 1e-9 : tol);

const bisMega = S.MODULE.indexOf('src/track/megastrecke.js');
const BASIS = S.MODULE.slice(0, bisMega + 1).filter((m) => m !== 'vendor/three.min.js');
const LISTE = ['vendor/three.min.js'].concat(BASIS.filter((m) => m !== 'src/main.js'), ['src/world/garage.js', 'src/moto/stunts.js', 'src/moto/stuntWelt.js', 'src/moto/unfall.js']);
const R = S.kontextLaden(['tests/moto_flag.js'].concat(LISTE));
const U = R.Moto.unfall, cfg = R.config.motoUnfall;

// ---------- 1. Verteilung ----------
function verteilung(modus, saat, anzahlStuerze, fahrerZahl) {
  const z = { schreck: 0, schaden: 0, leicht: 0, schwer: 0, schadenSchwer: 0, n: 0 };
  for (let nr = 0; nr < fahrerZahl; nr++) {
    const u = U.zNeu(modus);
    for (let i = 0; i < anzahlStuerze / fahrerZahl; i++) {
      const e = U.folge(modus, saat, nr, u.sturzNr + 1); u.sturzNr++;
      z[e.art]++; z.n++; if (e.schwer) z.schadenSchwer++;
    }
  }
  return z;
}
for (const modus of ['sanft', 'echt']) {
  const k = cfg.modi[modus], v = verteilung(modus, 'moto|wiese|', 1000, 4);
  const proz = (a) => v[a] / v.n;
  const ok = ['schreck', 'schaden', 'leicht', 'schwer'].every((a) => Math.abs(proz(a) - k[a]) <= 0.03);
  pruefe(`Verteilung ${modus} (1000 Stürze, 4 Fahrer): Schreck/Schaden/leicht/schwer = ${['schreck', 'schaden', 'leicht', 'schwer'].map((a) => (proz(a) * 100).toFixed(1)).join(' / ')} % (Soll ${['schreck', 'schaden', 'leicht', 'schwer'].map((a) => k[a] * 100).join(' / ')}, ±3)`, ok);
  const ant = v.schadenSchwer / v.schaden;
  pruefe(`Anteil schwerer Motorrad-Schäden ${modus}: ${(ant * 100).toFixed(1)} % (Soll ${(k.schadenSchwer * 100).toFixed(0)} %, ±6)`, Math.abs(ant - k.schadenSchwer) <= 0.06);
}
pruefe('Schwere Schäden: im Modus „echt“ häufiger (≈ 1/3) als im Modus „sanft“', cfg.modi.echt.schadenSchwer > cfg.modi.sanft.schadenSchwer && nah(cfg.modi.echt.schadenSchwer, 1 / 3, 1e-9));
// andere Saat/Strecke: Verteilung bleibt innerhalb der Toleranz
{
  const ok = ['moto|wald|', 'moto|alpen|xl', 'moto|mega|'].every((saat) => { const v = verteilung('sanft', saat, 1000, 2); return ['schreck', 'schaden', 'leicht', 'schwer'].every((a) => Math.abs(v[a] / v.n - cfg.modi.sanft[a]) <= 0.03); });
  pruefe('Verteilung sanft bleibt mit anderen Saaten (Wald, Alpen XL, Mega) innerhalb ±3 Prozentpunkte', ok);
}
{
  const u = U.zNeu('aus'); let folgen = 0, art = '';
  for (let i = 0; i < 1000; i++) { const e = U.sturz(u, 'moto|wiese|', 0); if (e.art !== 'keine') { folgen++; art = e.art; } }
  pruefe('Modus „aus“: 1000 Stürze ohne eine einzige Folge (Zustand 100 %, Fahrer ok)', folgen === 0 && u.zustand === 100 && u.fahrer === 'ok' && u.modus === 'aus', art);
}

// ---------- 2. Deterministisch ----------
{
  const lauf = (saat, nr) => { const u = U.zNeu('echt'); const r = []; for (let i = 0; i < 60; i++) { const e = U.sturz(u, saat, nr); r.push(e.art + (e.abschlepp ? '!' : '') + u.zustand + u.fahrer); } return r.join(','); };
  pruefe('Deterministisch: gleiche Saat und Fahrer-Nr. = gleiche Folge (auch in zwei getrennten Läufen)', lauf('moto|wiese|', 1) === lauf('moto|wiese|', 1));
  pruefe('Andere Fahrer-Nr. oder andere Saat = andere Folge', lauf('moto|wiese|', 1) !== lauf('moto|wiese|', 2) && lauf('moto|wiese|', 1) !== lauf('moto|wald|', 1));
  const a = []; for (let n = 1; n <= 10; n++) a.push(U.folge('sanft', 'x', 0, n).art);
  pruefe('folge() ist eine reine Funktion (nur Saat, Fahrer, Nr.): zweiter Aufruf gleich', a.join() === (() => { const b = []; for (let n = 1; n <= 10; n++) b.push(U.folge('sanft', 'x', 0, n).art); return b.join(); })(), a.join(' '));
  pruefe('Kein Math.random im Modul', !/Math\.random/.test(require('fs').readFileSync(require('path').join(__dirname, '..', 'src/moto/unfall.js'), 'utf8')));
}

// ---------- 3. Zustand ----------
{
  const u = U.zNeu('echt'); let minZ = 100, schwer = 0, schaeden = 0, abschleppUnter25 = 0, stufenOk = true;
  for (let i = 0; i < 1000; i++) {
    const vor = u.zustand, e = U.sturz(u, 'moto|dino|', 3);
    if (e.art === 'schaden') { schaeden++; if (u.zustand !== Math.max(25, vor - 25)) stufenOk = false; if (e.abschlepp) { schwer++; if (vor <= 25) abschleppUnter25++; U.abschlepp(u); } }
    minZ = Math.min(minZ, u.zustand);
    if (u.fahrer !== 'ok') U.heilen(u);
  }
  pruefe('Zustand: −25 % je Schaden, nie unter 25 % und nie 0 (1000 Stürze „echt“, Minimum ' + minZ + ' %)', stufenOk && minZ >= 25 && schaeden > 300, schaeden + ' Schäden');
  const v = U.zNeu('sanft'); v.zustand = 25;
  let ok = true; for (let i = 0; i < 300; i++) { const e = U.sturz(v, 'moto|wiese|', 0); if (e.art === 'schaden') { ok = ok && e.abschlepp === true && v.zustand === 25; } if (v.zustand < 25) ok = false; }
  pruefe('Bei 25 % bleibt der Zustand 25 %; ein weiterer Schaden ruft immer den Abschleppwagen (nie liegenbleiben)', ok);
  const w = U.zNeu('sanft'); w.zustand = 100;
  let s1 = null; for (let i = 0; i < 100 && !s1; i++) { const x = U.zNeu('echt'); const e = U.sturz(x, 'moto|wiese|', i); if (e.art === 'schaden' && !e.abschlepp) s1 = x; }
  pruefe('Erster leichter Schaden: 100 → 75 %, noch kein Abschleppwagen', !!s1 && s1.zustand === 75);
}

// ---------- 4. Tempo-Wirkung ----------
{
  const f = (z, fahrer) => { const u = U.zNeu('sanft'); u.zustand = z; u.fahrer = fahrer || 'ok'; return U.faktoren(u); };
  pruefe('Tempo: 100 % = ×1, 75 % = ×0,90, 50 % = ×0,80, 25 % = ×0,70 (etwa −30 %), Beschleunigung gleich', nah(f(100).vMax, 1) && nah(f(75).vMax, 0.9, 1e-9) && nah(f(50).vMax, 0.8, 1e-9) && nah(f(25).vMax, 0.7, 1e-9) && nah(f(25).beschleunigung, 0.7, 1e-9), [100, 75, 50, 25].map((z) => f(z).vMax.toFixed(2)).join(' '));
  pruefe('Pflaster: Höchsttempo −10 % (Beschleunigung unverändert), Verband: keine Strafe', nah(f(100, 'pflaster').vMax, 0.9) && nah(f(100, 'pflaster').beschleunigung, 1) && nah(f(100, 'verband').vMax, 1));
  pruefe('Schaden 25 % + Pflaster: ×0,63', nah(f(25, 'pflaster').vMax, 0.63, 1e-9));
}

// ---------- 5. Reparatur, Heilung, Krankenwagen, HUD ----------
{
  const u = U.zNeu('echt'); u.zustand = 50; u.fahrer = 'pflaster';
  U.reparieren(u);
  pruefe('Reparatur (Werkstatt) setzt 100 % (Pflaster bleibt, das heilt nur die Krankenstation)', u.zustand === 100 && u.fahrer === 'pflaster' && !U.brauchtWerkstatt(u) && U.brauchtKranken(u));
  U.heilen(u);
  pruefe('Krankenstation heilt das Pflaster (Fahrer wieder ok)', u.fahrer === 'ok' && !U.brauchtKranken(u));
  U.krankenwagen(u);
  pruefe('Krankenwagen: danach Verband (🩼), keine weitere Strafe; Krankenstation nimmt ihn ab', u.fahrer === 'verband' && nah(U.faktoren(u).vMax, 1) && U.hudZustand(u).symbol === '🩼' && (U.heilen(u), u.fahrer === 'ok'));
  const v = U.zNeu('sanft'); v.zustand = 50; U.abschlepp(v);
  pruefe('Abschleppwagen bringt das Motorrad zur Werkstatt: repariert, 100 %', v.zustand === 100 && v.stat.abschlepp === 1);
  const h = (z, f) => { const x = U.zNeu('sanft'); x.zustand = z; x.fahrer = f || 'ok'; return U.hudZustand(x); };
  pruefe('HUD: 100/75 % grün, 50 % gelb, 25 % rot; Fahrer 😀 / 🩹 / 🩼', h(100).farbe === 'gruen' && h(75).farbe === 'gruen' && h(50).farbe === 'gelb' && h(25).farbe === 'rot' && h(100).symbol === '😀' && h(100, 'pflaster').symbol === '🩹' && h(100, 'verband').symbol === '🩼');
}

// ---------- 6. Szenen ----------
for (const art of ['krank', 'abschlepp']) {
  const d = U.szeneDauer(art), pl = U.szenePlan(art);
  pruefe(`Szene ${art}: Gesamtdauer ${d.toFixed(1)} s (etwa 4–6 s, Teil A ${pl.dauerA.toFixed(1)} s am Unfallort, Teil B an der Station)`, d >= 4 && d <= 6.5);
  pruefe(`Szene ${art}: Zeitlimit ${cfg.szene.max} s ist deutlich länger als die Szene (Rückfall auf Kontrollpunkt nur bei Hängern)`, cfg.szene.max >= d * 1.8);
  const ph = []; for (let t = 0; t <= d + 0.5; t += 0.05) { const p = U.szenePhase(art, t); if (!ph.length || ph[ph.length - 1] !== p.seg + ':' + p.name) ph.push(p.seg + ':' + p.name); }
  const soll = art === 'krank' ? 'A:anfahrt,A:hin,A:zurueck,A:abfahrt,B:ankunft,B:hin,B:zurueck,B:abfahrt' : 'A:anfahrt,A:beladen,A:abfahrt,B:ankunft,B:abladen,B:abfahrt';
  pruefe(`Szene ${art}: Phasen ${ph.join(' → ')}`, ph.join(',') === soll);
  pruefe(`Szene ${art}: Ende erkannt (ende nach ${d.toFixed(1)} s)`, !U.szenePhase(art, d - 0.01).ende && U.szenePhase(art, d + 0.01).ende && U.szenePhase(art, 0).u === 0);
}

// ---------- 7. Stationen je Strecke ----------
function strecke(daten, welt, variante, menge) {
  const st = new R.Strecke(daten, { welt, variante, hindernisMenge: menge });
  st.tempoKlasse = 'normal';
  R.Kurvenschilder.einbauen(st, 'normal');
  R.Kollisionen.pflanzenSammeln(st, R.themes.dekoBauen(daten.thema, st, 'sommer'));
  if (R.Kollisionen.wracksEinbauen) R.Kollisionen.wracksEinbauen(st);
  if (R.Tribuenen) R.Tribuenen.einbauen(st);
  return st;
}
{
  let gesamt = 0, ok = 0; const fehlend = [], zuNah = [], nichtBefahrbar = [], inStunt = [], tab = [];
  for (const daten of R.trackCatalog) {
    const welten = Object.keys(daten.welten || {}); if (!welten.length) welten.push('');
    for (const variante of ['', ...Object.keys(daten.varianten || {})]) {
      let letzte = null;
      for (const welt of welten) {
        gesamt++;
        const st = strecke(daten, welt, variante, 'normal'), sp = st.spline, L = sp.laenge, name = daten.id + (variante ? '/' + variante : '') + '/' + welt;
        const b = U.stationenBilden(st);
        if (!b || !b.werkstatt || !b.kranken) { fehlend.push(name + (b && b.werkstatt ? ' (keine Krankenstation)' : ' (keine Werkstatt)')); continue; }
        const P = b.werkstatt.platz, K = b.kranken.platz, abstand = Math.abs(sp.differenzS(P.s, K.s));
        if (abstand < L * 0.1 || abstand < P.laenge + K.laenge) zuNah.push(name + ' ' + Math.round(abstand) + ' m');
        let befahrbar = true;
        for (const [w, p] of [[b.werkstatt, P], [b.kranken, K]]) {
          const mitte = (p.qA + p.qB) / 2, punkt = (ds, q) => { const pt = w.welt(p.s + ds, q); return sp.naechster(pt.x, pt.z, sp.indexBei(sp.wrapS(p.s + ds))); };
          const n0 = punkt(0, mitte), nZ = punkt(-p.laenge / 2 - 6, p.qE !== undefined ? p.qE + 0.3 : p.qA - 0.2), nR = punkt(0, st.breite / 2 + 0.5);
          const flaeche = w.untergrund({ untergrund: 'gras' }, n0), zufahrt = w.untergrund({ untergrund: 'gras' }, nZ);
          if (!(p.qB - p.qA >= 4.4 && p.laenge >= 30 && flaeche === 'strasse' && (zufahrt === 'rand' || zufahrt === null) && w.istDrin(n0) && p.qB < p.grenze - 1.0 && nR)) befahrbar = false;
          if (Math.abs(p.kruemmungMax) > 0.0022 * 8.5) befahrbar = false;
        }
        if (!befahrbar) nichtBefahrbar.push(name);
        // nicht in Schanze/Anlauf, Ring, Bus-Reihe, Zonen
        let stunt = false;
        const stellen = R.Anlauf.stellen(st).map((z) => z.s), daten2 = R.Moto.stuntWelt.stuntDaten(st);
        for (const p of [P, K]) {
          const lo = p.s - p.laenge / 2 - p.zufahrt, hi = p.s + p.laenge / 2 + p.ausfahrt;
          stellen.forEach((s) => { if (Math.abs(sp.differenzS(s, p.s)) < p.laenge / 2 + 40) stunt = true; });
          daten2.ringe.forEach((r) => { const ds = sp.differenzS(r.sK + 16, p.s); if (ds > -(p.laenge / 2 + p.zufahrt) - 10 && ds < p.laenge / 2 + p.ausfahrt + 10) stunt = true; });
          daten2.reihen.forEach((r) => { const ds = sp.differenzS(r.sK + r.a1, p.s); if (ds > -(p.laenge / 2 + p.zufahrt) - 10 && ds < p.laenge / 2 + p.ausfahrt + 10 + (r.a1 - r.a0)) stunt = true; });
          void lo; void hi;
        }
        if (stunt) inStunt.push(name);
        if (b.werkstatt.platz !== null && b.kranken.platz !== null && abstand >= L * 0.1 && befahrbar && !stunt) ok++;
        if (!letzte) { tab.push(name + ': Werkstatt s=' + Math.round(P.s) + ' (' + (P.seite > 0 ? 'rechts' : 'links') + '), Kranken s=' + Math.round(K.s) + ' (' + (K.seite > 0 ? 'rechts' : 'links') + '), ' + Math.round(abstand) + ' m auseinander, L ' + Math.round(L)); letzte = name; }
      }
    }
  }
  tab.forEach((t) => console.log('       ' + t));
  pruefe(`Je Strecke genau 1 Werkstatt und 1 Krankenstation (${gesamt} Kombinationen aus Strecke × Welt × Variante)`, !fehlend.length, fehlend.slice(0, 4).join('; '));
  pruefe('Werkstatt und Krankenstation nie am selben Fleck (≥ 10 % der Streckenlänge auseinander)', !zuNah.length, zuNah.slice(0, 4).join('; '));
  pruefe('Beide Stationen auf befahrbarer Lage (Fläche ≥ 4,4 × 30 m, Fläche Asphalt, Zufahrt Randstreifen, gerade, innerhalb der Bande)', !nichtBefahrbar.length, nichtBefahrbar.slice(0, 4).join('; '));
  pruefe('Keine Station in Schanze/Anlauf, Feuerring oder Bus-Reihe', !inStunt.length, inStunt.slice(0, 4).join('; '));
  pruefe(`Alle ${gesamt} Kombinationen komplett in Ordnung`, ok === gesamt, ok + '/' + gesamt);
}

// ---------- 8. Megastrecke: eine Werkstatt (nicht zwei wie im Autorennen) ----------
{
  const daten = R.trackCatalog.find((t) => t.id === 'mega');
  if (daten) {
    const st = strecke(daten, Object.keys(daten.welten || { x: 1 })[0], '', 'normal'), b = U.stationenBilden(st);
    pruefe('Megastrecke: trotzdem genau eine Werkstatt und eine Krankenstation', !!(b && b.werkstatt && b.kranken) && Math.abs(st.spline.differenzS(b.werkstatt.platz.s, b.kranken.platz.s)) > st.spline.laenge * 0.1, st.spline.laenge | 0);
  }
}

console.log(`\n${anzahl - fehler}/${anzahl} Prüfungen bestanden`);
process.exit(fehler ? 1 : 0);
