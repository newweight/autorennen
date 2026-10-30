// ============================================================
// Stufe R2 – Online-Modi: Server-Zusatz der Simulation (Node, CommonJS; Vorbild server/motoSim.js). Wird NUR benutzt, wenn der Raum eine R2-Wahl hat
// (Einstellungen modus 'kurz' | 'ko' | 'frei' oder dino 'dino' | 'immer'); sonst bleibt `simulation.r2` null und nichts ändert sich.
//
// Der Server entscheidet alles (deterministisch, keine Math.random, keine Uhr):
//   ⭐ Kurz-Level   Start nebeneinander am Level-Start; Wertung je Spieler mit R.SpassKurz.auswerten (Sterne, Zeit, Zähler); eigene Münzwelt je Spieler;
//                   Sprung/Kanone über die Flug-/Spaß-Ereignisse der Simulation, Ring/Bus/Tricks aus dem Stunt-Zähler (Motorrad). Fertig, wenn alle Menschen ein Ergebnis haben.
//   🏁 K.-o.-Rallye  RaceManager mit elimination { ko: true } (spassKO.js): wer ausscheidet, wird geparkt (sim._ausgeschieden) + Ereignis `raus`; Finale bei ≤ 2 Aktiven.
//   🗺️ Freie Fahrt   12 ❓-Kisten (R.SpassFrei.plan); die erste Fahrerin/der erste Fahrer an einer freien Kiste bekommt die Aufgabe (privat), die Kiste ist „vergeben“;
//                   Scheitern gibt sie wieder frei, Erfolg setzt ✔. Ende nach freiZeit Minuten oder wenn alle 12 ✔ sind.
//   🦖 Dino          Je Mensch ein Aufgaben-Zustand (R.SpassWelten.dino, Seed = hash32(Raum-Seed, Nr, 0xD10)); Ereignisse nur an den Besitzer.
// Ereignisse siehe server/PROTOKOLL.md, Abschnitt „R2“.
// ============================================================
'use strict';

/**
 * @param {object} simulation  die Simulation (server/simulation.js; Teilnehmer, Strecke, sim.fahrzeuge sind schon da)
 * @param {object} R           Rennspiel-Namensraum des Kontexts (Auto oder Motorrad)
 * @param {object} e           geprüfte Raum-Einstellungen (modus, level, freiZeit, dino …)
 * @param {number} seed        Raum-Seed
 */
function einbauen(simulation, R, e, seed) {
  const sim = simulation.sim, K = R.SpassR2, nT = simulation.nT, st = sim.strecke, rn = sim.rennen, art = K.artVon(e);
  const ev = (o) => simulation.ereignisse.push(o);
  const rd = R.Netz.rund;
  const menschen = () => { const l = []; for (let i = 0; i < nT; i++) if (sim.fahrzeuge[i].istSpieler) l.push(i); return l; };
  const teile = [];

  // ---------------------------------------------------------------- Kurz-Level
  function kurz() {
    const k = K.kurzAbschnitt(st, e), def = k.def, ab = k.ab, SK = R.SpassKurz, cps = st.checkpoints;
    const lauf = SK.neuerLauf(def, ab);
    rn.runden = 99;                                                    // Rennende gibt es nicht (nur das Level-Ziel)
    const z = {};
    const stat = (i) => { const s = sim.stunt && sim.stunt.fz && sim.stunt.fz[i]; return s && s.stat ? { ring: s.stat.ringe + s.stat.volltreffer, bus: s.stat.busse, tricks: s.stat.ereignisse } : null; };
    for (let i = 0; i < nT; i++) {
      const t = rn.teilnehmer[i], v = sim.fahrzeuge[i].vehicle;
      t.gestartet = true; t.letzterCheckpoint = ab.cp0; t.naechsterCheckpoint = (ab.cp0 + 1) % cps.length; t.rundenStart = 0; t.cpAst = 0;
      rn.verfolgungSetzen(t, v.x, v.z, ab.s0);
      z[i] = { zaehl: { muenzen: 0, sprung: 0, kanone: 0, ring: 0, bus: 0, tricks: 0 }, base: stat(i) || { ring: 0, bus: 0, tricks: 0 }, muenzen: null, erg: null };
      if (def.art === 'muenzen') z[i].muenzen = new K.Muenzen(K.weltPunkte(st, SK.muenzPlan(st, ab.s0, ab.s1, def.n)));       // jede/r hat die Münzen für sich
    }
    rn._fortschrittBerechnen();
    const code = { geschafft: 1, zeitUm: 2, verpasst: 3 };
    return {
      flug(i, name) { const c = z[i]; if (c && !c.erg && sim.fahrzeuge[i].istSpieler && (name === 'landung' || name === 'landungSchraeg')) c.zaehl.sprung++; },
      spass(i, name) { const c = z[i]; if (c && !c.erg && sim.fahrzeuge[i].istSpieler && name === 'kanoneBumm') c.zaehl.kanone++; },
      schritt() {
        let offen = 0;
        for (let i = 0; i < nT; i++) {
          const f = sim.fahrzeuge[i], c = z[i], t = rn.teilnehmer[i];
          if (!f.istSpieler) continue;
          if (c.erg) continue;
          const v = f.vehicle;
          if (c.muenzen) {
            const neu = c.muenzen.schritt(v.x, v.y, v.z);
            if (neu.length) { c.zaehl.muenzen += neu.length; ev({ an: i, art: 'kMuenze', ids: neu, n: c.zaehl.muenzen }); }
          }
          const s = stat(i);
          if (s) { c.zaehl.ring = s.ring - c.base.ring; c.zaehl.bus = s.bus - c.base.bus; c.zaehl.tricks = s.tricks - c.base.tricks; }
          const erg = SK.auswerten(lauf, { zeit: rn.zustand === 'laeuft' ? rn.zeit : 0, fortschritt: t.fortschritt, zaehl: c.zaehl });
          if (erg.status !== 'laeuft') {
            c.erg = erg;
            ev({ an: null, art: 'kurz', nr: i, status: erg.status, sterne: erg.sterne, zeit: rd(erg.zeit, 3) });
          } else offen++;
        }
        if (!offen && rn.zustand !== 'countdown') simulation.fertig = true;      // alle Menschen haben ein Ergebnis (oder sind weg)
      },
      weg() { /* wer geht, behält sein Ergebnis oder gilt als „weg“ (siehe ergebnis) */ },
      ich(i) { const c = z[i]; if (!c) return null; return [def.art === 'ziel' ? 0 : (c.zaehl[SK.ZAEHLER[def.art]] || 0), c.erg ? code[c.erg.status] : 0]; },
      startInfo() { return { kurz: { level: def.id, cp0: ab.cp0, cp1: ab.cp1, s0: rd(ab.s0, 3), s1: rd(ab.s1, 3), t3: lauf.z.t3, t2: lauf.z.t2, limit: lauf.z.limit } }; },
      ergebnis(erg) {
        const zeilen = erg.zeilen.map((r) => {
          const c = z[r.nr];
          if (!c) return r;
          const info = simulation.teilnehmerInfo[r.nr];
          return Object.assign({}, r, { kurz: c.erg ? { status: c.erg.status, sterne: c.erg.sterne, zeit: rd(c.erg.zeit, 3) } : { status: info.weg ? 'weg' : 'offen', sterne: 0, zeit: null } });
        });
        zeilen.sort((a, b) => ((b.kurz ? b.kurz.sterne : 0) - (a.kurz ? a.kurz.sterne : 0)) || ((a.kurz && a.kurz.zeit !== null ? a.kurz.zeit : 1e9) - (b.kurz && b.kurz.zeit !== null ? b.kurz.zeit : 1e9)) || (a.nr - b.nr));
        zeilen.forEach((r, i) => { r.platz = i + 1; });
        return Object.assign({}, erg, { zeilen, kurz: { level: def.id, t3: lauf.z.t3, t2: lauf.z.t2, limit: lauf.z.limit } });
      },
    };
  }

  // ---------------------------------------------------------------- K.-o.-Rallye
  function ko() {
    rn._koWert = R.SpassKO.wertungen(st);
    let finale = false;
    rn.bei('raus', (t) => {
      sim._ausgeschieden(t);                                           // parkt das Fahrzeug (kein Mesh/keine Szene im Server)
      sim.puffs = [];
      ev({ an: null, art: 'raus', nr: t.nr, n: t.ausscheidNr, w: t.ausscheidRunde });
    });
    rn.bei('wertung', (t, n) => { if (t.istSpieler) ev({ an: t.nr, art: 'wertung', nr: t.nr, n }); });
    return {
      schritt() {
        if (finale) return;
        if (R.SpassKO.status(rn).finale) { finale = true; ev({ an: null, art: 'finale' }); }
      },
      weg() { },
      ich() { return null; },
      startInfo() { return { ko: { wertungen: rn._koWert.slice() } }; },
      ergebnis(erg) {
        const zeilen = erg.zeilen.map((r) => { const t = rn.teilnehmer[r.nr]; return t.ausgeschieden ? Object.assign({}, r, { raus: true, w: t.ausscheidRunde }) : r; });
        return Object.assign({}, erg, { zeilen, ko: true });
      },
    };
  }

  // ---------------------------------------------------------------- Freie Fahrt
  function frei() {
    const SF = R.SpassFrei, C = R.config.spass.frei, FA = K.FreiAufgabe, sp = st.spline;
    rn.runden = 99;
    const kisten = SF.plan(st).map((k) => { const p = sp.punktBei(k.s), x = p.x + p.nx * k.q, zz = p.z + p.nz * k.q; return { e: k, x, z: zz, y: st.hoeheAn(x, zz), st: 0, von: -1 }; });    // st: 0 frei · 1 vergeben · 2 geschafft
    const limit = (e.freiZeit || K.STD.freiZeit) * 60;
    const z = {};
    for (let i = 0; i < nT; i++) z[i] = { aufgabe: null, kiste: null, sperreBis: 0, gefunden: 0, geschafft: 0, gold: 0 };
    let zeit = 0;
    const kisteMelden = (k) => ev({ an: null, art: 'frKiste', k: k.e.nr, st: k.st, von: k.von });
    const ende = (i, ok, text) => {
      const c = z[i], a = c.aufgabe, k = c.kiste;
      const gold = ok ? FA.gold(a.art) : 0;
      c.aufgabe = null; c.kiste = null; c.sperreBis = zeit + 6;          // damit die Kiste nicht sofort wieder auslöst
      if (ok) { k.st = 2; c.geschafft++; c.gold += gold; } else { k.st = 0; k.von = -1; }
      ev({ an: i, art: 'frEnde', k: k.e.nr, aufgabe: a.art, ok, text, gold });
      kisteMelden(k);
    };
    return {
      flug(i, name) { const c = z[i]; if (c && c.aufgabe && c.aufgabe.art === 'sprung' && sim.fahrzeuge[i].istSpieler && (name === 'landung' || name === 'landungSchraeg')) c.aufgabe.landungen++; },
      schritt(dt) {
        if (rn.zustand !== 'laeuft') return;
        zeit += dt;
        for (let i = 0; i < nT; i++) {
          const f = sim.fahrzeuge[i], c = z[i], t = rn.teilnehmer[i], v = f.vehicle;
          if (!f.istSpieler) continue;
          const a = c.aufgabe;
          if (a) {
            const r = FA.schritt(a, st, { x: v.x, y: v.y, z: v.z, s: t.s, q: t.seitenabstand, weite: f.flug ? f.flug.letzteWeite : 0 }, dt);
            if (r.neueMuenzen.length) ev({ an: i, art: 'frMuenze', ids: r.neueMuenzen, n: a.zaehl });
            for (const tor of r.tore) ev({ an: i, art: 'frTor', k: tor.k, ok: tor.ok, n: a.zaehl });
            if (r.kurz) ev({ an: i, art: 'frWeite', text: r.kurz });
            if (r.ende) ende(i, r.ende.ok, r.ende.text);
            continue;
          }
          if ((f.flug && f.flug.aktiv) || zeit < c.sperreBis) continue;
          for (const k of kisten) {
            if (k.st !== 0) continue;
            const dx = k.x - v.x, dz = k.z - v.z;
            if (dx * dx + dz * dz < C.trigger * C.trigger && Math.abs(k.y - v.y) < 4) {
              k.st = 1; k.von = i; c.kiste = k; c.gefunden++;
              c.aufgabe = FA.neu(st, k.e.art, t.s, t.seitenabstand >= 0 ? 1 : -1);
              ev({ an: i, art: 'frAufgabe', k: k.e.nr, aufgabe: k.e.art, s: rd(t.s, 3), seite: c.aufgabe.seite });
              kisteMelden(k);
              break;
            }
          }
        }
        if (zeit >= limit || kisten.every((k) => k.st === 2)) simulation.fertig = true;
      },
      weg(nr, i) { const c = z[i]; if (c && c.aufgabe) { const k = c.kiste; c.aufgabe = null; c.kiste = null; k.st = 0; k.von = -1; kisteMelden(k); } },
      ich() { return null; },
      startInfo() { return { frei: { kisten: kisten.length, limit } }; },
      ergebnis(erg) {
        const zeilen = erg.zeilen.map((r) => (z[r.nr] ? Object.assign({}, r, { frei: { geschafft: z[r.nr].geschafft, gefunden: z[r.nr].gefunden, gold: z[r.nr].gold } }) : r));
        zeilen.sort((a, b) => ((b.frei ? b.frei.geschafft : 0) - (a.frei ? a.frei.geschafft : 0)) || ((b.frei ? b.frei.gold : 0) - (a.frei ? a.frei.gold : 0)) || (a.nr - b.nr));
        zeilen.forEach((r, i) => { r.platz = i + 1; });
        return Object.assign({}, erg, { zeilen, frei: { geschafft: kisten.filter((k) => k.st === 2).length, kisten: kisten.length, zeit: rd(zeit, 1) } });
      },
      zustand() { return kisten.map((k) => [k.st, k.von]); },     // Test/Diagnose
      kisten,
    };
  }

  // ---------------------------------------------------------------- Dino-Aufgaben
  function dino() {
    const SW = R.SpassWelten;
    const aktiv = e.dino === 'immer' || (e.dino === 'dino' && st.id === 'dino');
    if (!aktiv || !SW || !SW.dino) return null;
    const D = [];
    for (let i = 0; i < nT; i++) { D[i] = SW.dino.neu(st); D[i].seed = R.Zufall.hash32(seed >>> 0, i, 0xD10, 3); }
    const schw = e.schwierigkeit || 'mittel';
    return {
      schritt(dt) {
        if (!rn.gasErlaubt) return;
        for (let i = 0; i < nT; i++) {
          const f = sim.fahrzeuge[i], t = rn.teilnehmer[i], v = f.vehicle;
          if (!f.istSpieler || !f.nah || f.ausgeschieden || t.imZiel) continue;
          const K2 = { s: f.nah.s, x: v.x, z: v.z, v: Math.abs(v.vLaengs || 0), vMax: v.daten && v.daten.vMax, schw, bereit: !v.imFlug && !v.imLooping && !(f.flug && f.flug.aktiv) && !v.verkehr };
          SW.dino.schritt(D[i], st, K2, dt);
          const L = D[i].ereig;
          while (L.length) {
            const x = L.shift();
            if (x.name === 'gold') ev({ an: i, art: 'dinoGold', n: x.n, s0: rd(x.muenzen[0].s, 3), q: rd(x.muenzen[0].q, 3) });
            else if (x.name === 'sammeln') ev({ an: i, art: 'dinoSammeln', id: x.id });
            else if (x.name === 'wettrennen') ev({ an: i, art: 'dinoWett', weg: x.weg, vD: rd(x.vD, 3), s0: rd(D[i].rennen.s0, 3), sMark: rd(D[i].rennen.sMark, 3) });
            else if (x.name === 'sieg' || x.name === 'verloren' || x.name === 'abbruch') ev({ an: i, art: 'dinoEnde', ende: x.name, zeit: x.zeit === undefined ? 0 : rd(x.zeit, 2) });
          }
        }
      },
      weg() { },
      D,
    };
  }

  // ---------------------------------------------------------------- Teile zusammenbauen
  if (e.modus === 'kurz') teile.push(kurz());
  else if (e.modus === 'ko') teile.push(ko());
  else if (e.modus === 'frei') teile.push(frei());
  if (!e.modus && e.dino) { const d = dino(); if (d) teile.push(d); }

  // Haken: Flug- und Spaß-Ereignisse der Simulation an die Teile weiterreichen
  if (teile.some((t) => t.flug)) {
    const flugEreignis = sim._flugEreignis;
    sim._flugEreignis = function (i, name) { const r = flugEreignis.apply(this, arguments); for (const t of teile) if (t.flug) t.flug(i, name); return r; };
  }
  if (teile.some((t) => t.spass)) {
    const alt = sim.spassEreignis;
    sim.spassEreignis = function (i, name) { const r = typeof alt === 'function' ? alt.apply(this, arguments) : undefined; for (const t of teile) if (t.spass) t.spass(i, name); return r; };
  }

  return {
    nachSchritt(dt) { for (const t of teile) if (t.schritt) t.schritt(dt); },
    weg(nr, i) { for (const t of teile) if (t.weg) t.weg(nr, i); },
    ich(i) { for (const t of teile) { const x = t.ich && t.ich(i); if (x) return x; } return null; },
    startInfo() { const o = {}; for (const t of teile) if (t.startInfo) Object.assign(o, t.startInfo()); return Object.keys(o).length ? o : undefined; },
    ergebnis(erg) { let r = erg; for (const t of teile) if (t.ergebnis) r = t.ergebnis(r); return r; },
    menschen, teile,
  };
}

module.exports = { einbauen };
