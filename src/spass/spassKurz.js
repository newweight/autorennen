// ============================================================
// Spaß-Paket S4 – „⭐ Kurz-Level“ (Autorennen UND Motorrad): 12 kurze Aufgaben (60–90 s) je Spiel auf Abschnitten der vorhandenen Strecken.
//   Rechenteil (Node-testbar, ohne Three.js): LEVEL (Daten), abschnitt (Start/Ziel auf Checkpoints), zeiten/sterne (1–3 Sterne nach Zeit), muenzPlan,
//   auswerten (geschafft / Zeit um / Ziel verpasst), Speicher je Spiel (Sterne, Bestzeit), freigeschaltet (nächstes Level erst mit ≥ 1 Stern im vorigen).
//   Oberfläche: Level-Übersicht (Karten mit Sternen, 🔒), Anzeige oben, Ergebnis-Karte (Nächstes / Nochmal / Übersicht). Neustart am letzten Checkpoint: Taste R (wie immer).
// Aufgaben (art): ziel („Erreiche das Ziel“) · muenzen (n Goldstücke, eigene Reihen) · sprung (n Landungen nach Trampolin/Kanone/Schanze) · kanone ·
//   Motorrad: ring (Feuerring) · bus (Busse) · tricks (n Stunt-/Trick-Ereignisse).
// Ablauf: Spiel.rennenStarten mit Modus { art: 'kurz', level: id } → Einstellungen (Strecke, 0 Gegner, 99 Runden, ohne Verkehr/Zufall) → Fahrer auf den Startcheckpoint setzen,
//   die Rennleitung kennt ihn (Checkpoints ab dort). Das Ziel ist die Bogenlänge s1 (Checkpoint); die normale Zielzeile des Rennens wird nie erreicht (99 Runden).
// Speicher: localStorage 'rennspiel.spass.kurz.<spiel>' = { sterne: { id: 1..3 }, zeit: { id: s } }.
// ============================================================
(function () {
  const R = window.Rennspiel;
  if (!R || !R.config) return;

  // ---------------------------------------------------------------- Daten
  // von/bis = Bogenlänge s (m) auf der Strecke; wird auf den nächsten Checkpoint gelegt. n = Anzahl.
  const LEVEL = {
    auto: [
      { id: 'a01', emoji: '🏁', titel: 'Auf geht’s!', strecke: 'wiese', von: 120, bis: 2100, art: 'ziel' },
      { id: 'a02', emoji: '🪙', titel: 'Goldrausch im Wald', strecke: 'wald', von: 120, bis: 2000, art: 'muenzen', n: 12 },
      { id: 'a03', emoji: '🤸', titel: 'Zirkus-Sprünge', strecke: 'wiese', von: 400, bis: 1900, art: 'sprung', n: 2 },
      { id: 'a04', emoji: '💥', titel: 'Kanone frei!', strecke: 'wueste', von: 120, bis: 1000, art: 'kanone', n: 1 },
      { id: 'a05', emoji: '🏜️', titel: 'Wüsten-Flitzer', strecke: 'wueste', von: 900, bis: 3000, art: 'ziel' },
      { id: 'a06', emoji: '🦖', titel: 'Dino-Tour', strecke: 'dino', von: 1400, bis: 2700, art: 'ziel' },
      { id: 'a07', emoji: '🚀', titel: 'Kanonenkugel', strecke: 'dino', von: 700, bis: 1500, art: 'kanone', n: 1 },
      { id: 'a08', emoji: '⛰️', titel: 'Berg-Schatz', strecke: 'alpen', von: 120, bis: 1300, art: 'muenzen', n: 15 },
      { id: 'a09', emoji: '🏎️', titel: 'Formel-Sprint', strecke: 'formel1', von: 120, bis: 1700, art: 'ziel' },
      { id: 'a10', emoji: '✈️', titel: 'Dreimal in die Luft', strecke: 'formel1', von: 600, bis: 2300, art: 'sprung', n: 3 },
      { id: 'a11', emoji: '🏔️', titel: 'Alpen-Pass', strecke: 'alpen', von: 1300, bis: 2700, art: 'ziel' },
      { id: 'a12', emoji: '💰', titel: 'Super-Gold', strecke: 'wueste', von: 900, bis: 2600, art: 'muenzen', n: 20 },
    ],
    motorrad: [
      { id: 'm01', emoji: '🏁', titel: 'Auf geht’s!', strecke: 'wiese', von: 120, bis: 2100, art: 'ziel' },
      { id: 'm02', emoji: '🔥', titel: 'Feuerring!', strecke: 'wiese', von: 400, bis: 1100, art: 'ring', n: 1 },
      { id: 'm03', emoji: '🪙', titel: 'Goldrausch im Wald', strecke: 'wald', von: 120, bis: 2000, art: 'muenzen', n: 12 },
      { id: 'm04', emoji: '🚌', titel: 'Über die Busse', strecke: 'wald', von: 1800, bis: 2400, art: 'bus', n: 1 },
      { id: 'm05', emoji: '💥', titel: 'Kanone frei!', strecke: 'wiese', von: 500, bis: 1300, art: 'kanone', n: 1 },
      { id: 'm06', emoji: '🤹', titel: 'Drei Tricks', strecke: 'formel1', von: 700, bis: 2500, art: 'tricks', n: 3 },
      { id: 'm07', emoji: '🏜️', titel: 'Wüsten-Flitzer', strecke: 'wueste', von: 120, bis: 1900, art: 'ziel' },
      { id: 'm08', emoji: '🔥', titel: 'Feuerring in der Wüste', strecke: 'wueste', von: 1800, bis: 2600, art: 'ring', n: 1 },
      { id: 'm09', emoji: '⛰️', titel: 'Berg-Schatz', strecke: 'alpen', von: 120, bis: 1300, art: 'muenzen', n: 15 },
      { id: 'm10', emoji: '🦖', titel: 'Dino-Sprünge', strecke: 'dino', von: 100, bis: 1700, art: 'tricks', n: 2 },
      { id: 'm11', emoji: '🏔️', titel: 'Alpen-Pass', strecke: 'alpen', von: 1300, bis: 2700, art: 'ziel' },
      { id: 'm12', emoji: '💰', titel: 'Super-Gold', strecke: 'wueste', von: 900, bis: 2800, art: 'muenzen', n: 20 },
    ],
  };
  const ZAEHLER = { muenzen: 'muenzen', sprung: 'sprung', kanone: 'kanone', ring: 'ring', bus: 'bus', tricks: 'tricks' };

  const K = () => R.config.spass.kurz;
  R.config.spass = R.config.spass || {};
  R.config.spass.kurz = Object.assign({
    vSterne3: 27, vSterne2: 21, vLimit: 15, limitMax: 120,     // m/s: Zeit für 3 Sterne = Länge / 27, 2 Sterne = / 21, Abbruch = / 15 (höchstens 120 s); Computerfahrer mittel ≈ 24 m/s
    muenzReserve: 1.25, reiheAnzahl: 5, reiheAbstand: 6, muenzRand: 0.38,   // Münzen liegen auf 125 % der verlangten Zahl
    abschnittMin: 300, zielAbstandEnde: 40,
    goldJeStern: 5,
  }, R.config.spass.kurz || {});

  const liste = (spiel) => LEVEL[spiel === 'motorrad' ? 'motorrad' : 'auto'];
  const level = (spiel, id) => liste(spiel).find((l) => l.id === id) || null;

  const AUFGABEN = {
    ziel: () => 'Erreiche das Ziel',
    muenzen: (d) => 'Sammle ' + d.n + ' Goldstücke',
    sprung: (d) => (d.n === 1 ? 'Mach einen Sprung' : 'Mach ' + d.n + ' Sprünge'),
    kanone: () => 'Benutze die Kanone',
    ring: () => 'Spring durch den Feuerring',
    bus: () => 'Spring über die Busse',
    tricks: (d) => 'Mach ' + d.n + ' Tricks',
  };
  const aufgabeText = (def) => AUFGABEN[def.art](def);

  // ---------------------------------------------------------------- Abschnitt, Zeiten, Sterne
  /** Start und Ziel auf Checkpoints (nächster zu von/bis); Ziel höchstens L − 40; mindestens abschnittMin lang. */
  function abschnitt(strecke, def) {
    const cps = strecke.checkpoints, L = strecke.spline.laenge, c = K();
    const naechster = (s) => { let b = 1; for (let i = 1; i < cps.length; i++) if (Math.abs(cps[i].s - s) < Math.abs(cps[b].s - s)) b = i; return b; };
    let i0 = naechster(def.von), i1 = naechster(def.bis);
    while (i1 > i0 + 1 && cps[i1].s > L - c.zielAbstandEnde) i1--;
    while (i1 < cps.length - 1 && cps[i1].s - cps[i0].s < c.abschnittMin) i1++;
    return { cp0: i0, cp1: i1, s0: cps[i0].s, s1: cps[i1].s, laenge: cps[i1].s - cps[i0].s };
  }
  /** { t3, t2, limit } in Sekunden (3 Sterne bis t3, 2 Sterne bis t2, sonst 1 Stern bis limit; danach Zeit um). */
  function zeiten(def, laenge) {
    const c = K();
    if (def.zeiten) return { t3: def.zeiten[0], t2: def.zeiten[1], limit: def.zeiten[2] };
    return { t3: Math.round(laenge / c.vSterne3), t2: Math.round(laenge / c.vSterne2), limit: Math.min(c.limitMax, Math.round(laenge / c.vLimit)) };
  }
  function sterne(z, zeit) { return zeit <= z.t3 ? 3 : zeit <= z.t2 ? 2 : zeit <= z.limit ? 1 : 0; }

  /** Münz-Reihen (je reiheAnzahl im Abstand reiheAbstand) gleichmäßig im Abschnitt, Seite wechselt; nicht in Gabelung/Kreuzung/Looping/Tunnel. → [{ s, q }] */
  function muenzPlan(strecke, s0, s1, n) {
    const c = K(), sp = strecke.spline, halb = (strecke.breite || 12) / 2;
    const reihen = Math.max(1, Math.ceil(n * c.muenzReserve / c.reiheAnzahl)), ab = c.reiheAbstand;
    const von = s0 + 90, bis = s1 - 90, span = Math.max(1, bis - von);
    const sperr = (s) => {
      if (strecke.gabelBei && strecke.gabelBei(s)) return true;
      if (strecke.kreuzungNah && strecke.kreuzungNah(s, 30)) return true;
      for (const l of strecke.loopings || []) if (sp.differenzS(s, l.s0) > -40 && sp.differenzS(s, l.s1) < 40) return true;
      for (const t of strecke.tunnel || []) if (sp.differenzS(s, t.s0) > -10 && sp.differenzS(s, t.s1) < 10) return true;
      for (const t of strecke.bruecken || []) if (sp.differenzS(s, t.s0) > -10 && sp.differenzS(s, t.s1) < 10) return true;
      return false;
    };
    const versatz = [-c.muenzRand, 0, c.muenzRand];
    const liste = [];
    for (let r = 0; r < reihen; r++) {
      let sM = von + span * (r + 0.5) / reihen, ok = false;
      for (let v = 0; v < 12 && !ok; v++) {
        ok = true;
        for (let k = 0; k < c.reiheAnzahl; k++) if (sperr(sM + (k - (c.reiheAnzahl - 1) / 2) * ab)) { ok = false; break; }
        if (!ok) sM += 20;
      }
      if (!ok) continue;
      const q = versatz[r % 3] * halb;
      for (let k = 0; k < c.reiheAnzahl; k++) liste.push({ s: sM + (k - (c.reiheAnzahl - 1) / 2) * ab, q });
    }
    return liste;
  }

  // ---------------------------------------------------------------- Auswertung
  /** Lauf neu: { def, ab, z (Zeiten) }. */
  const neuerLauf = (def, ab) => ({ def, ab, z: zeiten(def, ab.laenge) });
  /**
   * ctx = { zeit (s seit „LOS“), fortschritt (m, Bogenlänge im Rennen), zaehl: { muenzen, sprung, kanone, ring, bus, tricks } }
   * → { status: 'laeuft' | 'geschafft' | 'zeitUm' | 'verpasst', sterne, zeit }
   */
  function auswerten(lauf, ctx) {
    const d = lauf.def, z = lauf.z;
    const erfuellt = d.art === 'ziel' ? ctx.fortschritt >= lauf.ab.s1 : (ctx.zaehl[ZAEHLER[d.art]] || 0) >= d.n;
    if (erfuellt) { const st = sterne(z, ctx.zeit); return { status: st > 0 ? 'geschafft' : 'zeitUm', sterne: st, zeit: ctx.zeit }; }
    if (ctx.zeit > z.limit) return { status: 'zeitUm', sterne: 0, zeit: ctx.zeit };
    if (ctx.fortschritt >= lauf.ab.s1) return { status: 'verpasst', sterne: 0, zeit: ctx.zeit };
    return { status: 'laeuft', sterne: 0, zeit: ctx.zeit };
  }

  // ---------------------------------------------------------------- Speicher
  const key = (sp) => 'rennspiel.spass.kurz.' + sp;
  const SP = () => (R.SpassModi && R.SpassModi.speicher) || null;
  const ramStand = {};
  function stand(sp) {
    let o = null;
    const s = SP();
    if (s) o = s.lade(key(sp), null); else o = ramStand[sp] || null;
    if (!o || typeof o !== 'object') o = {};
    if (!o.sterne || typeof o.sterne !== 'object') o.sterne = {};
    if (!o.zeit || typeof o.zeit !== 'object') o.zeit = {};
    return o;
  }
  function sichern(sp, o) { const s = SP(); if (s) s.sichern(key(sp), o); else ramStand[sp] = JSON.parse(JSON.stringify(o)); }
  /** Ergebnis eintragen (nur Verbesserungen). → { neuerRekord, besserSterne, gold } */
  function eintragen(sp, id, st, zeit) {
    const o = stand(sp), alt = o.sterne[id] || 0, altZ = o.zeit[id];
    let gold = 0;
    if (st > alt) { gold = (st - alt) * K().goldJeStern; o.sterne[id] = st; }
    if (st > 0 && (altZ === undefined || zeit < altZ)) o.zeit[id] = Math.round(zeit * 10) / 10;
    sichern(sp, o);
    return { besserSterne: st > alt, neuerRekord: st > 0 && (altZ === undefined || zeit < altZ), gold };
  }
  /** Level i frei? Das erste immer, danach mit ≥ 1 Stern im vorigen. */
  function freigeschaltet(o, lst, i) { return i <= 0 || (o.sterne[lst[i - 1].id] || 0) >= 1; }
  const summeSterne = (o, lst) => lst.reduce((a, l) => a + (o.sterne[l.id] || 0), 0);
  const alleGeschafft = (o, lst) => lst.every((l) => (o.sterne[l.id] || 0) >= 1);

  R.SpassKurz = { LEVEL, liste, level, aufgabeText, abschnitt, zeiten, sterne, muenzPlan, neuerLauf, auswerten, stand, eintragen, freigeschaltet, summeSterne, alleGeschafft, ZAEHLER };

  // ================================================================ Browser: Übersicht, Ablauf
  const M = R.SpassModi;
  if (!M || typeof document === 'undefined') return;
  const spielName = M.spielName;
  const sternText = (n, pop) => '<span class="s4-sterne">' + [1, 2, 3].map((i) => `<span class="${i <= n ? (pop ? 'pop' : '') : 'aus'}"${pop && i <= n ? ` style="animation-delay:${(i - 1) * 0.25}s"` : ''}>⭐</span>`).join('') + '</span>';
  const sternKlein = (n) => '⭐'.repeat(n) + '<span style="filter:grayscale(1);opacity:.35">' + '⭐'.repeat(3 - n) + '</span>';
  const fmt = (s) => (s === undefined ? '–' : s.toFixed(1).replace('.', ',') + ' s');

  let fokus = 0;
  function uebersicht(spiel) {
    const sp = spielName(), lst = liste(sp), o = stand(sp);
    if (fokus >= lst.length || !freigeschaltet(o, lst, fokus)) fokus = Math.max(0, lst.findIndex((l, i) => freigeschaltet(o, lst, i) && !(o.sterne[l.id] > 0)));
    if (fokus < 0) fokus = 0;
    const raster = lst.map((l, i) => {
      const frei = freigeschaltet(o, lst, i), st = o.sterne[l.id] || 0;
      return `<div class="s4-lv${i === fokus ? ' f' : ''}${frei ? '' : ' zu'}" data-s4="lv:${i}"><b>${frei ? l.emoji : '🔒'}</b><span class="nr">${i + 1}</span>` +
        `<div class="t">${l.titel}</div><small>${frei ? aufgabeText(l) : 'Noch gesperrt'}</small><div class="st">${frei ? sternKlein(st) : ''}</div>` +
        `<small>${frei && o.zeit[l.id] !== undefined ? 'Bestzeit ' + fmt(o.zeit[l.id]) : '&nbsp;'}</small></div>`;
    }).join('');
    M.stil();
    if (!document.getElementById('s4-lv-stil')) {
      const s = document.createElement('style'); s.id = 's4-lv-stil';
      s.textContent = '.s4-lvraster{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:.5em;margin:.4em 0}' +
        '.s4-lv{position:relative;background:linear-gradient(#fff6c8,#ffd23a);color:#2a2f6b;border-radius:.9em;padding:.3em .3em .25em;border:.14em solid #fff;cursor:pointer;line-height:1.1;min-width:0}' +
        '.s4-lv b{display:block;font-size:1.8em;line-height:1.15}.s4-lv .nr{position:absolute;top:.15em;left:.4em;font-size:.8em;opacity:.7}' +
        '.s4-lv .t{font-weight:900;font-size:.9em}.s4-lv small{display:block;font-size:.66em;font-weight:800;opacity:.85}.s4-lv .st{font-size:.85em;margin:.1em 0}' +
        '.s4-lv.f{outline:.18em solid #2f8bff;outline-offset:.05em;transform:scale(1.04)}.s4-lv.zu{background:#6a7090;color:#cfd3e6;cursor:not-allowed}' +
        '@media (max-width:700px),(max-height:520px){.s4-lvraster{grid-template-columns:repeat(6,minmax(0,1fr))}.s4-lv small{display:none}.s4-lv .t{font-size:.75em}.s4-lv b{font-size:1.4em}.s4-karte h1{font-size:1.2em}}';
      document.head.appendChild(s);
    }
    const gesamt = summeSterne(o, lst);
    const bewegen = (dx, dy) => {
      const sp2 = window.innerWidth <= 700 || window.innerHeight <= 520 ? 6 : 4;
      let n = fokus + dx + dy * sp2; n = Math.max(0, Math.min(lst.length - 1, n)); fokus = n; uebersicht(spiel);
    };
    const T = R.config.tasten, P1 = T.spieler[0], P2 = T.spieler[1];
    const tasten = {
      Escape: () => zurueck(spiel), Enter: () => starten(spiel, fokus), Space: () => starten(spiel, fokus),
      [P1.links]: () => bewegen(-1, 0), [P1.rechts]: () => bewegen(1, 0), [P1.gas]: () => bewegen(0, -1), [P1.bremse]: () => bewegen(0, 1),
      [P2.links]: () => bewegen(-1, 0), [P2.rechts]: () => bewegen(1, 0), [P2.gas]: () => bewegen(0, -1), [P2.bremse]: () => bewegen(0, 1),
    };
    M.karte({
      html: `<h1>⭐ Kurz-Level</h1><div>${gesamt} von ${lst.length * 3} Sternen · Level schaffen schaltet das nächste frei</div><div class="s4-lvraster">${raster}</div>` +
        `<div class="s4-knoepfe"><div class="s4-knopf gruen" data-s4="los">Los! <kbd>Enter</kbd></div><div class="s4-knopf blau" data-s4="fahrer">Fahrer / ${sp === 'motorrad' ? 'Motorrad' : 'Auto'} ändern</div><div class="s4-knopf" data-s4="zurueck">◀ Menü <kbd>Esc</kbd></div></div>`,
      tasten,
      klick: (a) => {
        if (a === 'zurueck') zurueck(spiel);
        else if (a === 'los') starten(spiel, fokus);
        else if (a === 'fahrer') { M.karteZu(); spiel.menue.zeigen(2); }
        else if (a.startsWith('lv:')) { const i = +a.slice(3); if (freigeschaltet(o, lst, i)) { fokus = i; starten(spiel, i); } }
      },
    });
  }
  function zurueck(spiel) { M.karteZu(); spiel.menue.zeigen(0); }
  function starten(spiel, i) {
    const sp = spielName(), lst = liste(sp), o = stand(sp);
    if (!freigeschaltet(o, lst, i)) return;
    fokus = i; M.karteZu();
    spiel._s4Modus = { art: 'kurz', level: lst[i].id };
    spiel.rennenStarten();
  }

  // ---------- Ablauf im Rennen ----------
  M.registriere('kurz', {
    einstellungen(spiel, m) {
      const def = level(spielName(), m.level), e = spiel._s4Basis || spiel.einstellungen;
      void e;
      return { streckeId: def.strecke, gegner: 0, runden: R.config.rennen.rundenMax, modus: 'solo', spielart: 'rennen', polizei: false, tiere: false, krankenwagen: false, abschleppwagen: false, geisterfahrer: false,
        geist: false, schaden: false, spass: true, zufall: false, variante: '', welt: '', tageszeit: 'tag', jahreszeit: 'sommer', wetter: 'klar', windStaerke: 0, stuntrennen: false };
    },
    start(spiel, m) {
      const sp = spielName(), def = level(sp, m.level), st = spiel.strecke, spl = st.spline, r = spiel.rennen, t = r.teilnehmer[0], f = spiel.fahrzeuge[0];
      const ab = abschnitt(st, def), cps = st.checkpoints;
      const p = spl.punktBei(ab.s0), q = (def.q || 0);
      const x = p.x + p.nx * q, zz = p.z + p.nz * q;
      f.vehicle.setzen(x, zz, R.headingAus(p.tx, p.tz)); f.vehicle.y = st.hoeheAn(x, zz); f.index = -1; spiel._vorherAngleichen(f);
      t.gestartet = true; t.letzterCheckpoint = ab.cp0; t.naechsterCheckpoint = (ab.cp0 + 1) % cps.length; t.rundenStart = 0; t.cpAst = 0;
      r.verfolgungSetzen(t, x, zz, ab.s0); r._fortschrittBerechnen();
      (spiel.kameras || []).forEach((k) => { k._erstesMal = true; });
      const z = spiel.s4.kurz = { def, lauf: neuerLauf(def, ab), zaehl: { muenzen: 0, sprung: 0, kanone: 0, ring: 0, bus: 0, tricks: 0 }, muenzen: null, aus: false, cpLetzt: ab.cp0, ende: false,
        base: { ring: 0, bus: 0, tricks: 0 } };
      const sz = spiel.stunt && spiel.stunt.fz && spiel.stunt.fz[0];
      if (sz && sz.stat) z.base = { ring: sz.stat.ringe + sz.stat.volltreffer, bus: sz.stat.busse, tricks: sz.stat.ereignisse };
      if (def.art === 'muenzen') {
        if (spiel.muenzen) { try { spiel.muenzen.zerstoeren(); } catch (e) { /* egal */ } spiel.muenzen = null; }       // die Garage-Münzen stören hier (andere Zählung)
        const pl = muenzPlan(st, ab.s0, ab.s1, def.n);
        const pts = pl.map((c) => { const pp = spl.punktBei(c.s), xx = pp.x + pp.nx * c.q, z2 = pp.z + pp.nz * c.q; return { x: xx, z: z2, y: st.hoeheAn(xx, z2) }; });
        z.muenzen = new M.Muenzen(spiel, pts);
      }
      if (spiel.spass && spiel.spass.geist) spiel.spass.geist = null;
    },
    schritt(spiel, dt) {
      const z = spiel.s4.kurz, r = spiel.rennen, t = r.teilnehmer[0], f = spiel.fahrzeuge[0], v = f.vehicle;
      if (!z || z.ende) return;
      if (z.muenzen) { const n = z.muenzen.schritt(v.x, v.y, v.z); if (n) { z.zaehl.muenzen += n; if (R.Audio && R.Audio.muenze) try { R.Audio.muenze(); } catch (e) { /* egal */ } } }
      const sz = spiel.stunt && spiel.stunt.fz && spiel.stunt.fz[0];
      if (sz && sz.stat) {
        z.zaehl.ring = sz.stat.ringe + sz.stat.volltreffer - z.base.ring;
        z.zaehl.bus = sz.stat.busse - z.base.bus;
        z.zaehl.tricks = sz.stat.ereignisse - z.base.tricks;
      }
      if (t.letzterCheckpoint !== z.cpLetzt) { z.cpLetzt = t.letzterCheckpoint; if (r.zustand === 'laeuft') spiel._meldung(0, '✔ Checkpoint', 700); }
      const zeit = r.zustand === 'laeuft' ? r.zeit : 0;
      const e = auswerten(z.lauf, { zeit, fortschritt: t.fortschritt, zaehl: z.zaehl });
      if (e.status !== 'laeuft') beenden(spiel, z, e);
    },
    bild(spiel, dt) {
      const z = spiel.s4 && spiel.s4.kurz, r = spiel.rennen;
      if (!z) return;
      if (z.muenzen) z.muenzen.animieren(spiel._physikZeit || 0);
      if (z.ende || !r || spiel.zustand !== 'rennen') { if (!z.ende) M.hudWeg(); return; }
      const d = z.def, t = r.teilnehmer[0], zeit = r.zustand === 'laeuft' ? r.zeit : 0, rest = Math.max(0, Math.round(z.lauf.ab.s1 - t.fortschritt));
      const n = d.art === 'ziel' ? '' : (d.art === 'muenzen' ? '🪙 ' : '') + Math.min(z.zaehl[ZAEHLER[d.art]], d.n) + '/' + d.n + ' · ';
      const lim = z.lauf.z.limit - zeit, rot = lim < 10 ? ' class="rot"' : '';
      M.hud(`${d.emoji} <b>Level ${liste(spielName()).indexOf(d) + 1}</b> · ${aufgabeText(d)}<small>${n}⏱ <span${rot}>${zeit.toFixed(0)} s</span> (Limit ${z.lauf.z.limit} s) · ${rest} m bis zum Ziel</small>`);
    },
    flug(spiel, i, e) {
      const z = spiel.s4.kurz, f = spiel.fahrzeuge[i];
      if (z && !z.ende && f && f.istSpieler && (e === 'landung' || e === 'landungSchraeg')) z.zaehl.sprung++;
    },
    ereignis(spiel, i, name) {
      const z = spiel.s4.kurz, f = spiel.fahrzeuge[i];
      if (z && !z.ende && f && f.istSpieler && name === 'kanoneBumm') z.zaehl.kanone++;
    },
    aufraeumen(spiel) {
      const z = spiel.s4 && spiel.s4.kurz;
      if (z && z.muenzen) { z.muenzen.entfernen(); z.muenzen = null; }
    },
  });

  function beenden(spiel, z, e) {
    z.ende = true;
    const sp = spielName(), lst = liste(sp), idx = lst.indexOf(z.def), name = spiel.fahrzeuge[0].istSpieler ? (spiel.rennen.teilnehmer[0].name) : '';
    spiel.pausiert = true; M.hudWeg();
    const nochmal = () => { M.karteZu(); spiel.pausiert = false; spiel.uhr.rest = 0; spiel.rennenStarten(); };
    const uebers = () => { M.karteZu(); spiel.pausiert = false; spiel.zumMenue(); setTimeout(() => uebersicht(spiel), 0); };
    if (e.status === 'geschafft') {
      const alt = stand(sp), vorher = alt.sterne[z.def.id] || 0, vorherAlle = alleGeschafft(alt, lst);
      const erg = eintragen(sp, z.def.id, e.sterne, e.zeit);
      if (erg.gold && R.Garage && R.Garage.gutschreiben && name) { try { R.Garage.gutschreiben(name, erg.gold); } catch (er) { /* egal */ } }
      const neu = stand(sp), hatNaechstes = idx + 1 < lst.length;
      if (R.Spass.sticker) R.Spass.sticker('kurz', { sterne: e.sterne, alle: alleGeschafft(neu, lst) && !vorherAlle, alle3: lst.every((l) => (neu.sterne[l.id] || 0) >= 3) });
      if (R.Audio && R.Audio.ziel) { try { R.Audio.ziel(1); } catch (er) { /* egal */ } }
      if (spiel.spassKonfetti) { const v = spiel.fahrzeuge[0].vehicle; spiel.spassKonfetti.burst(v.x, v.y + 3, v.z, 120); }
      const naechste = () => { M.karteZu(); spiel.pausiert = false; spiel.uhr.rest = 0; spiel._s4Modus = { art: 'kurz', level: lst[idx + 1].id }; spiel.rennenStarten(); };
      M.karte({
        html: `<h1>🎉 Geschafft!</h1><div>${z.def.emoji} Level ${idx + 1} · ${z.def.titel}</div>${sternText(e.sterne, true)}` +
          `<div>Zeit <b>${fmt(e.zeit)}</b>${erg.neuerRekord && vorher > 0 ? ' · 🏅 neue Bestzeit!' : ''}${erg.gold ? ` · +${erg.gold} 🪙` : ''}</div>` +
          `<small>⭐⭐⭐ bis ${z.lauf.z.t3} s · ⭐⭐ bis ${z.lauf.z.t2} s</small>` +
          `<div class="s4-knoepfe">${hatNaechstes ? '<div class="s4-knopf gruen" data-s4="weiter">Nächstes Level ▶ <kbd>Enter</kbd></div>' : ''}` +
          `<div class="s4-knopf blau" data-s4="nochmal">Nochmal <kbd>N</kbd></div><div class="s4-knopf" data-s4="uebersicht">Übersicht <kbd>Esc</kbd></div></div>`,
        tasten: { Enter: hatNaechstes ? naechste : nochmal, Space: hatNaechstes ? naechste : nochmal, KeyN: nochmal, Escape: uebers },
        klick: (a) => { if (a === 'weiter') naechste(); else if (a === 'nochmal') nochmal(); else if (a === 'uebersicht') uebers(); },
      });
    } else {
      const grund = e.status === 'zeitUm' ? '⏱️ Zeit um!' : '🚩 Ziel verpasst!';
      const hinweis = e.status === 'zeitUm' ? 'Du hast ' + z.lauf.z.limit + ' Sekunden. Probier es gleich noch einmal!' : 'Die Aufgabe ist noch nicht geschafft – nochmal von vorn!';
      M.karte({
        html: `<h1>${grund}</h1><div>${z.def.emoji} ${aufgabeText(z.def)}</div><div class="gross">💪</div><div>${hinweis}</div>` +
          `<div class="s4-knoepfe"><div class="s4-knopf gruen" data-s4="nochmal">Nochmal <kbd>Enter</kbd></div><div class="s4-knopf" data-s4="uebersicht">Übersicht <kbd>Esc</kbd></div></div>`,
        tasten: { Enter: nochmal, Space: nochmal, KeyN: nochmal, Escape: uebers },
        klick: (a) => { if (a === 'nochmal') nochmal(); else if (a === 'uebersicht') uebers(); },
      });
    }
  }

  M.kurzUebersicht = uebersicht;
})();
