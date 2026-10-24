// Node-Test Motorrad-Unfälle (Stufe M2c): node tests/test_moto_unfall.js
// Prüft die reine Logik (src/moto/unfall.js) und die Stationen je Strecke ohne Browser:
//   1. Verteilung der Folgen je Modus (sanft 50/30/15/5, echt 20/40/28/12) über ~1000 Stürze innerhalb ±3 Prozentpunkten, Modus „aus“ ohne Folgen
//   2. Deterministisch (gleiche Saat/Fahrer/Nr. = gleiche Folge, kein Math.random), andere Saat/Fahrer = andere Folge
//   3. Zwei Zustände (Motorrad, Fahrer-Gesundheit): Abzüge in Prozent, nie unter 10 %, schwerer Schaden / Minimum ruft den Abschleppwagen, 'schwer' den Krankenwagen
//   4. Tempo-Wirkung proportional zum Fehlbetrag (Motorrad bis −35 % Höchsttempo und Beschleunigung, Fahrer bis −15 % Höchsttempo)
//   5. Pflege-Raten: vor Ort 3 s je 10 % (30 % = 9 s), Station 0,5 s je 10 % (30 % = 1,5 s), bis 100 %; HUD-Zustand/Farben
//   6. Szenen-Zeitplan: anfahrt → pflege → abfahrt, Dauer = Pflege + Fahrzeiten, Zeitlimit (Rückfall auf Kontrollpunkt) größer als jede mögliche Szene
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
  pruefe('Modus „aus“: 1000 Stürze ohne eine einzige Folge (beide Zustände 100 %)', folgen === 0 && u.zustand === 100 && u.gesundheit === 100 && u.modus === 'aus', art);
}

// ---------- 2. Deterministisch ----------
{
  const lauf = (saat, nr) => { const u = U.zNeu('echt'); const r = []; for (let i = 0; i < 60; i++) { const e = U.sturz(u, saat, nr); r.push(e.art + (e.szene ? '!' + e.szene : '') + u.zustand + '/' + u.gesundheit); } return r.join(','); };
  pruefe('Deterministisch: gleiche Saat und Fahrer-Nr. = gleiche Folge (auch in zwei getrennten Läufen)', lauf('moto|wiese|', 1) === lauf('moto|wiese|', 1));
  pruefe('Andere Fahrer-Nr. oder andere Saat = andere Folge', lauf('moto|wiese|', 1) !== lauf('moto|wiese|', 2) && lauf('moto|wiese|', 1) !== lauf('moto|wald|', 1));
  const a = []; for (let n = 1; n <= 10; n++) a.push(U.folge('sanft', 'x', 0, n).art);
  pruefe('folge() ist eine reine Funktion (nur Saat, Fahrer, Nr.): zweiter Aufruf gleich', a.join() === (() => { const b = []; for (let n = 1; n <= 10; n++) b.push(U.folge('sanft', 'x', 0, n).art); return b.join(); })(), a.join(' '));
  pruefe('Kein Math.random im Modul', !/Math\.random/.test(require('fs').readFileSync(require('path').join(__dirname, '..', 'src/moto/unfall.js'), 'utf8')));
}

// ---------- 3. Zwei Zustände ----------
{
  const u = U.zNeu('echt'); let minZ = 100, minG = 100, schaeden = 0, schwerCount = 0, abzugOk = true, szeneOk = true;
  for (let i = 0; i < 1500; i++) {
    const vz = u.zustand, vg = u.gesundheit, e = U.sturz(u, 'moto|dino|', 3);
    if (e.art === 'schaden') {
      schaeden++;
      if (u.zustand !== Math.max(cfg.minimum, vz - (e.schwer ? cfg.abzug.schadenSchwer : cfg.abzug.schaden)) || u.gesundheit !== vg) abzugOk = false;
      if ((e.szene === 'abschlepp') !== (e.schwer || u.zustand <= cfg.minimum)) szeneOk = false;
      if (e.szene) U.pflegeSchritt(u, 'motorrad', 'vorOrt', 1e6);
    } else if (e.art === 'leicht') {
      if (u.gesundheit !== Math.max(cfg.minimum, vg - cfg.abzug.leicht) || u.zustand !== vz || e.szene) abzugOk = false;
    } else if (e.art === 'schwer') {
      schwerCount++;
      if (u.gesundheit !== Math.max(cfg.minimum, vg - cfg.abzug.schwer) || e.szene !== 'krankenwagen') szeneOk = false;
      U.pflegeSchritt(u, 'fahrer', 'vorOrt', 1e6);
    }
    minZ = Math.min(minZ, u.zustand); minG = Math.min(minG, u.gesundheit);
    if (i % 3 === 0) { U.pflegeSchritt(u, 'fahrer', 'station', 1e6); }
  }
  pruefe(`Abzüge in Prozent wie in der Tabelle (Schaden −${cfg.abzug.schaden}/−${cfg.abzug.schadenSchwer}, leicht −${cfg.abzug.leicht}, schwer −${cfg.abzug.schwer}); Minimum Motorrad ${minZ} %, Fahrer ${minG} %`, abzugOk && schaeden > 300 && schwerCount > 80);
  pruefe('Nie unter 10 % (beide Zustände), schwerer Schaden oder Minimum ruft den Abschleppwagen, „schwer“ den Krankenwagen', minZ >= 10 && minG >= 10 && szeneOk);
  const v = U.zNeu('sanft'); v.zustand = 10; v.gesundheit = 10;
  let ok = true; for (let i = 0; i < 300; i++) { const e = U.sturz(v, 'moto|wiese|', 0); if (e.art === 'schaden') ok = ok && e.szene === 'abschlepp' && v.zustand === 10; if (v.zustand < 10 || v.gesundheit < 10) ok = false; if (e.art === 'schwer') ok = ok && e.szene === 'krankenwagen'; }
  pruefe('Bei 10 % bleibt es bei 10 %; ein weiterer Schaden ruft immer den Abschleppwagen (nie liegenbleiben)', ok);
  const w = U.zNeu('echt'); let s1 = null; for (let i = 0; i < 200 && !s1; i++) { const x = U.zNeu('echt'); const e = U.sturz(x, 'moto|wiese|', i); if (e.art === 'schaden' && !e.szene) s1 = x; }
  pruefe(`Erster leichter Schaden: 100 → ${100 - cfg.abzug.schaden} %, noch kein Abschleppwagen`, !!s1 && s1.zustand === 100 - cfg.abzug.schaden && void w === undefined);
}

// ---------- 4. Tempo-Wirkung ----------
{
  const f = (z, g) => { const u = U.zNeu('sanft'); u.zustand = z; u.gesundheit = g === undefined ? 100 : g; return U.faktoren(u); };
  const tm = cfg.tempo.motorrad, tf = cfg.tempo.fahrer;
  pruefe(`Tempo Motorrad proportional: 100 % = ×1, 55 % = ×${(1 - tm / 2).toFixed(3)}, 10 % = ×${(1 - tm).toFixed(2)} (≈ −${Math.round(tm * 100)} %), Beschleunigung gleich`,
    nah(f(100).vMax, 1) && nah(f(55).vMax, 1 - tm / 2, 1e-9) && nah(f(10).vMax, 1 - tm, 1e-9) && nah(f(10).beschleunigung, 1 - tm, 1e-9), [100, 75, 55, 10].map((z) => f(z).vMax.toFixed(3)).join(' '));
  pruefe(`Tempo Fahrer proportional: Gesundheit 10 % = Höchsttempo ×${(1 - tf).toFixed(2)}, Beschleunigung unverändert`, nah(f(100, 10).vMax, 1 - tf, 1e-9) && nah(f(100, 10).beschleunigung, 1) && nah(f(100, 55).vMax, 1 - tf / 2, 1e-9));
  pruefe('Beide kaputt (10 %/10 %) multipliziert, Reparatur/Heilung gibt volles Tempo zurück', nah(f(10, 10).vMax, (1 - tm) * (1 - tf), 1e-9) && nah(f(100, 100).vMax, 1));
}

// ---------- 5. Pflege-Raten, HUD ----------
{
  const zeit = (was, ort, start) => { const u = U.zNeu('echt'); if (was === 'motorrad') u.zustand = start; else u.gesundheit = start; let t = 0; const dt = 1 / 60; while (!U.pflegeSchritt(u, was, ort, dt) && t < 200) t += dt; return { t, u }; };
  pruefe('Konfig: vorOrtSekundenJe10 = 3, stationSekundenJe10 = 0,5', cfg.vorOrtSekundenJe10 === 3 && cfg.stationSekundenJe10 === 0.5);
  const a = zeit('fahrer', 'vorOrt', 70), b = zeit('motorrad', 'vorOrt', 70), c = zeit('fahrer', 'station', 70), d = zeit('motorrad', 'station', 70);
  pruefe(`Vor Ort 30 % = 9 s (gemessen ${a.t.toFixed(2)} s Fahrer, ${b.t.toFixed(2)} s Motorrad), Station 30 % = 1,5 s (${c.t.toFixed(2)} / ${d.t.toFixed(2)} s)`,
    nah(a.t, 9, 0.05) && nah(b.t, 9, 0.05) && nah(c.t, 1.5, 0.05) && nah(d.t, 1.5, 0.05) && nah(U.pflegeDauer(70, 'vorOrt'), 9) && nah(U.pflegeDauer(70, 'station'), 1.5));
  pruefe('Pflege bis 100 % (nicht darüber), Statistik zählt, Rest „schon 100 %“ ist sofort fertig', a.u.gesundheit === 100 && b.u.zustand === 100 && b.u.stat.repariert === 1 && a.u.stat.geheilt === 1 && U.pflegeSchritt(U.zNeu('echt'), 'fahrer', 'station', 0.1) === true);
  const u = U.zNeu('echt'); u.zustand = 50; U.pflegeSchritt(u, 'motorrad', 'station', 0.5); // 0,5 s = 10 %
  pruefe('Zählt gleichmäßig hoch: 50 % + 0,5 s Station = 60 %; Reparatur lässt die Gesundheit in Ruhe', nah(u.zustand, 60, 1e-9) && u.gesundheit === 100 && U.brauchtWerkstatt(u) && !U.brauchtKranken(u));
  const h = (z, g) => { const x = U.zNeu('sanft'); x.zustand = z; x.gesundheit = g === undefined ? 100 : g; return U.hudZustand(x); };
  pruefe('HUD: 100/75 % grün, 60 % gelb, 30 % rot; Fahrer 😀 (100) / 🩹 / 🩼 (< 75), Prozent gerundet',
    h(100).farbe === 'gruen' && h(75).farbe === 'gruen' && h(60).farbe === 'gelb' && h(30).farbe === 'rot' && h(100).symbol === '😀' && h(100, 85).symbol === '🩹' && h(100, 40).symbol === '🩼' && h(100, 40).fahrerFarbe === 'rot' && h(54.6).prozent === 55);
}

// ---------- 6. Szenen ----------
{
  const k = cfg.szene;
  for (const [name, start] of [['Krankenwagen', 50], ['Abschleppwagen', 10]]) {
    const pflege = U.pflegeDauer(start, 'vorOrt'), pl = U.szenePlan(pflege);
    pruefe(`Szene ${name} (${start} % → 100 %): Pflege ${pflege.toFixed(1)} s, Gesamt ${pl.dauer.toFixed(1)} s = Anfahrt + Pflege + Abfahrt`, nah(pl.dauer, k.anfahrt + pflege + k.abfahrt, 1e-9));
    const ph = []; for (let t = 0; t <= pl.dauer + 0.5; t += 0.05) { const p = U.szenePhase(pflege, t); if (!ph.length || ph[ph.length - 1] !== p.name) ph.push(p.name); }
    pruefe(`Szene ${name}: Phasen ${ph.join(' → ')}`, ph.join(',') === 'anfahrt,pflege,abfahrt');
    pruefe(`Szene ${name}: Ende erkannt, Zeitlimit ${pl.limit.toFixed(1)} s > Szene (Rückfall nur bei Hängern)`, !U.szenePhase(pflege, pl.dauer - 0.01).ende && U.szenePhase(pflege, pl.dauer + 0.01).ende && U.szenePhase(pflege, 0).u === 0 && pl.limit >= pl.dauer + 5);
  }
  const lang = U.szenePlan(U.pflegeDauer(cfg.minimum, 'vorOrt'));
  pruefe(`Längste Szene (von ${cfg.minimum} % bis 100 %): ${lang.dauer.toFixed(1)} s, Zeitlimit ${lang.limit.toFixed(1)} s`, lang.dauer < 40 && lang.limit > lang.dauer);
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
        // nicht in Schanze/Anlauf, Ring, Bus-Reihe: Fläche samt Zufahrt-Keil darf die Bereiche nicht überlappen
        let stunt = '';
        const stellen = R.Anlauf.stellen(st), daten2 = R.Moto.stuntWelt.stuntDaten(st), ra = R.config.motoStunts.ring.abstand;
        for (const p of [P, K]) {
          const von = -(p.laenge / 2 + p.zufahrt), bis = p.laenge / 2 + p.ausfahrt;   // Längsbereich relativ zu p.s
          const trifft = (s0, s1) => { const a0 = sp.differenzS(s0, p.s), a1 = a0 + (s1 - s0); return a1 > von && a0 < bis; };
          stellen.forEach((z) => { if (z.art === 'schanze' || z.art === 'looping') { if (trifft(z.s - 5, z.s + 20) || (Math.abs(sp.differenzS(z.s, p.s)) < p.laenge / 2 + 6)) stunt += ' Schanze@' + Math.round(z.s); } });
          daten2.ringe.forEach((r) => { if (trifft(r.sK + ra - 4, r.sK + ra + 4)) stunt += ' Ring@' + Math.round(r.sK + ra); });
          daten2.reihen.forEach((r) => { if (trifft(r.sK - 4, r.sK + r.a1 + 4)) stunt += ' Reihe@' + Math.round(r.sK); });
          if (stunt) stunt += ' (Station s=' + Math.round(p.s) + ')';
        }
        if (stunt) inStunt.push(name + stunt);
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
