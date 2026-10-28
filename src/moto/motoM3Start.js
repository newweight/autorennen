// ============================================================
// Motorrad M3 – Verdrahtung: läuft ganz am Ende (nach src/main.js und allen anderen moto-Dateien, damit die Umhüllungen außen liegen), nur MOTORRAD-Modus.
// Alle Eingriffe sind Umhüllungen zur Laufzeit; keine Datei außerhalb von src/moto/ wird geändert.
//
//   Spiel.streckeSzeneBauen   umhüllt: Partikel-Gruppe (Funken/Spritzer) immer, Park-Elemente (Steilwand, Schlamm, Wasser, Kisten) beim Stunt-Park
//   Spiel.rennenStarten       umhüllt: Stunt-Park-Modus (einstellungen.stuntpark): Strecke 'stuntpark' (nur für den Start in R.trackCatalog), 0 Gegner,
//                             999 Runden, Polizei/Tiere aus; Einstellungen danach wieder auf die alten Werte (Streckenwahl bleibt unberührt)
//   Spiel.physikSchritt       umhüllt: Quad entschärfen (kein Überschlag), Schlamm/Wasser (Tempo-Faktor), Kisten, Auspuffknall, Funken, Spritzer
//   R.dach.frame              umhüllt (außen): Quad ohne Schräglage/Salto + Wackeln, Partikel und Park-Animation je Bild
//   Spiel.fahrzeugHinzufuegen umhüllt: Garage-Stil (Helm, Kombi, Nummer) des Spielers ins Modell; R.Garage.fahrzeugWerte liefert den Stil mit
//   Garage-Bildschirm         umhüllt: Zeilen Helm/Kombi/Nummer (Maus/Touch und Tasten H, K, N/M), Texte Auto → Motorrad, Vorschau mit Stil
//   Menü                      Modus-Karte „Stunt-Park“ (sechste Karte), Streckenschritt zeigt dort nur den Park, Gegner-/Runden-Zeilen ausgeblendet
// ============================================================
(function () {
  if (window.MOTORRAD !== true) return;
  const R = window.Rennspiel;
  if (!R || !R.Spiel || !R.Moto || !R.Moto.m3welt || !R.Moto.m3fx || !R.Moto.typen) return;
  const Wl = R.Moto.m3welt, FX = R.Moto.m3fx, TY = R.Moto.typen, G3 = R.Moto.m3garage;
  const P = R.Spiel.prototype, CFG = () => R.config.motoM3;
  const SL = () => R.Moto.schraeglage;

  // ---------- Szene ----------
  function gruppeLoesen(g) {
    if (!g) return;
    if (g.parent) g.parent.remove(g);
    g.traverse((c) => { if (c.geometry) c.geometry.dispose(); if (c.material) { if (c.material.map) c.material.map.dispose(); c.material.dispose(); } if (c.dispose && c.isInstancedMesh) c.dispose(); });
  }
  const streckeSzeneBauen = P.streckeSzeneBauen;
  P.streckeSzeneBauen = function () {
    const r = streckeSzeneBauen.apply(this, arguments);
    try {
      gruppeLoesen(this.motoFxGruppe); gruppeLoesen(this.motoParkGruppe); this.motoFxGruppe = null; this.motoParkGruppe = null;
      if (this.strecke && this.szene) {
        const fx = FX.gruppeBauen();
        if (fx) { this.szene.add(fx); this.motoFxGruppe = fx; }
        if (this.strecke.daten && (this.strecke.daten.motoFelder || this.strecke.daten.motoKisten)) {
          const pk = Wl.bauen(this.strecke);
          if (pk) { this.szene.add(pk); this.motoParkGruppe = pk; }
        }
      }
    } catch (e) { console.error('Motorrad M3 (Szene):', e); }
    return r;
  };

  // ---------- Stunt-Park starten ----------
  const rennenStarten = P.rennenStarten;
  P.rennenStarten = function (einst, opt) {
    const e0 = this.einstellungen || {};
    const park = einst && einst.stuntpark !== undefined ? !!einst.stuntpark : !!e0.stuntpark;
    try { document.body.classList.toggle('moto-park', park); } catch (e) { /* ohne DOM */ }
    if (!park) { const r = rennenStarten.apply(this, arguments); if (this.einstellungen) this.einstellungen.stuntpark = false; return r; }
    const merk = {}; ['streckeId', 'welt', 'variante', 'gegner', 'runden', 'polizei', 'tiere', 'spielart', 'stuntrennen'].forEach((k) => { merk[k] = e0[k]; });
    const eintrag = Wl.parkEintrag(), kat = R.trackCatalog, schonDa = kat.some((t) => t.id === eintrag.id);
    if (!schonDa) kat.push(eintrag);
    let r;
    try {
      const ein = Object.assign({}, einst || {}, { stuntpark: false, streckeId: eintrag.id, welt: '', variante: '', gegner: 0, runden: CFG().park.runden, polizei: false, tiere: false, spielart: 'rennen', stuntrennen: false });
      r = rennenStarten.call(this, ein, opt);
    } finally {
      if (!schonDa) { const i = kat.indexOf(eintrag); if (i >= 0) kat.splice(i, 1); }
    }
    try {
      if (this.rennen) this.rennen.runden = CFG().park.runden;                 // kein Rennen-Ende (die Einstellung erlaubt höchstens 10)
      Object.assign(this.einstellungen, merk, { stuntpark: true });
      if (this.einstellungenSpeichern) this.einstellungenSpeichern();
    } catch (e) { console.error('Motorrad M3 (Park):', e); }
    return r;
  };

  // ---------- Physik: Quad, Felder, Kisten, Knall, Funken ----------
  function zustand3(f) { return f.m3 || (f.m3 = { knall: FX.knallZustand(), wackel: 0, landungen: f.flug ? f.flug.landungen : 0, spritz: { schlamm: 0, wasser: 0 }, funkenRest: 0 }); }
  const SPRITZ_FARBEN = { schlamm: [0x6b4423, 0x7a5230, 0x4f3118], wasser: [0x7fc8ff, 0xdff3ff, 0x4fb0ff] };

  function physikM3(spiel, dt) {
    if (spiel.zustand !== 'rennen' || spiel.pausiert || !(dt > 0) || !spiel.strecke || !spiel.fahrzeuge) return;
    const strecke = spiel.strecke, sp = strecke.spline, felder = strecke._m3Felder || (strecke._m3Felder = Wl.felder(strecke));
    const fxg = spiel.motoFxGruppe && spiel.motoFxGruppe.userData.fx, K = spiel.motoParkGruppe && spiel.motoParkGruppe.userData.kisten;
    const St = R.Moto.stunts, t = spiel.rennen ? spiel.rennen.zeit : 0, purzelK = SL() ? SL().PURZEL : null;
    for (let i = 0; i < spiel.fahrzeuge.length; i++) {
      const f = spiel.fahrzeuge[i], v = f && f.vehicle;
      if (!f || !v || f.ausgeschieden) continue;
      const z3 = zustand3(f), u = f.mesh && f.mesh.userData, luft = !!(f.flug && f.flug.aktiv);
      const boden = strecke.hoeheAn(v.x, v.z), tempo = Math.abs(v.vLaengs), r = v.richtung();
      // 1. Quad: kein Überschlag
      if (u && u.kippt === false) TY.quadEntschaerfen(f.motoZ, z3, purzelK);
      // 2. Schlamm / Wasser
      if (f.nah && !luft && !v.imFlug && felder.length) {
        const fd = Wl.feldBei(felder, sp, f.nah.s, f.nah.seitenabstand);
        if (fd) {
          v.vLaengs *= Wl.feldFaktor(fd.art, dt);
          if (fxg && tempo > 2) {
            z3.spritz[fd.art] += CFG().feld[fd.art].spritz * Math.min(1, tempo / 12) * dt;
            const n = Math.floor(z3.spritz[fd.art]); z3.spritz[fd.art] -= n;
            if (n > 0) { const q = v.rechts(); FX.spritzSpawn(fxg.spritzer, n, v.x - r.x * 0.6, boden, v.z - r.z * 0.6, q.x, q.z, SPRITZ_FARBEN[fd.art]); }
          }
        }
      }
      // 3. Kistenstapel
      if (K && !(luft && f.flug.y - boden > 1.6)) {
        const h = Wl.kistenTreffer(K.stapel, K.zust, v.x, v.z, tempo);
        if (h >= 0) {
          Wl.kistenWegschleudern(K.stapel, K.zust, h, { x: r.x, z: r.z }, tempo);
          v.vLaengs *= 0.93;
          const sz = spiel.stunt, zz = sz && sz.fz[i];
          if (zz && St) St.vergeben(zz, 'kisten', 'Kisten!', CFG().kisten.punkte, sz.zeit);
          if (f.istSpieler && R.Audio && R.Audio.bande) R.Audio.bande(0.5);
        }
      }
      // 4. Auspuffknall (nur die Spieler hören ihn)
      if (f.istSpieler && !luft) FX.knallSpielen(FX.knallPruefen(z3.knall, { gas: v.letzteSteuerung ? v.letzteSteuerung.gas : 0, tempo: v.tempo !== undefined ? v.tempo : tempo, vMax: v.daten.vMax, t }));
      // 5. Funken: Sturz-Rutschen und Aufsetzen
      if (fxg) {
        const mz = f.motoZ, pz = mz && mz.purzel;
        let n = 0;
        if (pz) {
          const rate = FX.rutschFunken({ purzelAktiv: pz.aktiv, purzelT: pz.t, purzelDauer: purzelK ? purzelK.dauer : 1.2, abkling: pz.abkling, abklingzeit: purzelK ? purzelK.abklingzeit : 2, tempo, untergrund: v.untergrund });
          z3.funkenRest += rate * dt; const k = Math.floor(z3.funkenRest); z3.funkenRest -= k; n += k;
        }
        const fl = f.flug;
        if (fl && fl.landungen > z3.landungen) { z3.landungen = fl.landungen; n += FX.aufsetzFunken({ landungNeu: true, landeStaerke: fl.landeStaerke, untergrund: v.untergrund }); }
        if (n > 0) FX.funkenSpawn(fxg.funken, n, v.x, boden, v.z, r.x, r.z);
      }
    }
  }
  const physikSchritt = P.physikSchritt;
  P.physikSchritt = function (dt) {
    const r = physikSchritt.apply(this, arguments);
    try { physikM3(this, dt); } catch (e) { console.error('Motorrad M3 (Physik):', e); }
    return r;
  };

  // ---------- Anzeige je Bild ----------
  function bildM3(spiel, dt) {
    const sz = spiel.stunt, liste = spiel.fahrzeuge || [];
    for (let i = 0; i < liste.length; i++) {
      const f = liste[i], u = f && f.mesh && f.mesh.userData;
      if (!u || u.kippt !== false) continue;
      const z3 = zustand3(f), zz = sz && sz.fz[i], pose = zz && zz.pose;
      TY.quadAnwenden(f.mesh, { wackel: z3.wackel, salto: pose ? pose.salto : 0, gier: pose ? pose.gier : 0 });
      if (f.motoZ) { f.motoZ.lean = 0; f.motoZ.leanRate = 0; }
      if (dt > 0 && z3.wackel > 0) z3.wackel = Math.max(0, z3.wackel - dt);
    }
    if (dt > 0) {
      if (spiel.motoFxGruppe) spiel.motoFxGruppe.userData.fx.aktualisieren(dt);
      if (spiel.motoParkGruppe) Wl.animieren(spiel.motoParkGruppe, dt);
    }
  }
  if (R.dach && typeof R.dach.frame === 'function') {
    const frame = R.dach.frame;
    R.dach.frame = function (spiel, dt) {
      const r = frame.apply(this, arguments);
      try { bildM3(spiel, dt); } catch (e) { console.error('Motorrad M3 (Bild):', e); }
      return r;
    };
  }

  // ---------- Garage: Stil ins Modell ----------
  if (R.Garage && R.Garage.fahrzeugWerte) {
    const fw = R.Garage.fahrzeugWerte;
    R.Garage.fahrzeugWerte = function (name, autoId) {
      const r = fw.apply(this, arguments);
      try { const a = R.carCatalog.finde(autoId); if (r && a && a.sonderbau === 'motorrad') r.stil = G3.stilHolen(name, autoId); } catch (e) { /* egal */ }
      return r;
    };
  }
  const fahrzeugHinzufuegen = P.fahrzeugHinzufuegen;
  P.fahrzeugHinzufuegen = function (auto, x, z, heading, garage) {
    try { if (garage && garage.stil && auto && auto.sonderbau === 'motorrad') auto = G3.stilAuto(auto, garage.stil); } catch (e) { /* egal */ }
    return fahrzeugHinzufuegen.call(this, auto, x, z, heading, garage);
  };

  // ---------- Garage-Bildschirm ----------
  const STIL_CSS = `
.m3-zeile .g-farben { flex-wrap: wrap; gap: .25em; }
.m3-zeile .g-farbe { min-width: 2.4em; padding: .1em .15em; }
.m3-zeile .g-farbe i { width: 1.7em; height: 1.7em; }
.m3-zeile .g-wert { display: flex; align-items: center; gap: .5em; }
.m3-hinweis { font-size: .62em; opacity: .8; margin: .2em 0 0 .3em; }
.reihe.modus-reihe .karte.gross { width: min(10.6em, calc((100vw - 6vw - 5 * .6em - 1.6em) / 6)); }
body.moto-park .hud-runde, body.moto-park .hud-platz { display: none !important; }
`;
  function stilCss() {
    if (typeof document === 'undefined' || document.getElementById('m3-stil')) return;
    const s = document.createElement('style'); s.id = 'm3-stil'; s.textContent = STIL_CSS; document.head.appendChild(s);
  }
  const hex = (n) => '#' + (n >>> 0).toString(16).padStart(6, '0');
  function stilZeilen(b) {
    const a = b.autoDaten ? b.autoDaten() : null;
    if (!a || a.sonderbau !== 'motorrad') return '';
    const st = G3.stilHolen(b.fahrer, a.id), helm = st.helm !== null ? st.helm : (a.optionen ? a.optionen.helm : null), kombi = st.kombi !== null ? st.kombi : a.farbe2, nr = st.nr !== null ? st.nr : (a.optionen ? a.optionen.nummer : 1);
    const reihe = (art, aktiv) => G3.FARBEN.map((c) => `<div class="g-farbe${aktiv === c.hex ? ' aktiv' : ''}" data-m3="${art}:${c.hex}" title="${c.name}"><i style="background:${hex(c.hex)}"></i></div>`).join('');
    return `<div class="g-zeile m3-zeile"><div class="g-label">⛑️ Helm</div><div class="g-farben">${reihe('helm', helm)}</div></div>` +
      `<div class="g-zeile m3-zeile"><div class="g-label">🧥 Kombi</div><div class="g-farben">${reihe('kombi', kombi)}</div></div>` +
      `<div class="g-zeile m3-zeile"><div class="g-label">🔢 Nummer</div><div class="g-wert"><span class="rund" data-m3="nr:-1">−</span><span class="zahl">${nr}</span><span class="rund" data-m3="nr:1">+</span>` +
      `<span class="g-text klein">gratis, wird gespeichert</span></div></div>` +
      `<div class="m3-hinweis">Tasten: <kbd>H</kbd> Helm · <kbd>K</kbd> Kombi · <kbd>N</kbd> / <kbd>M</kbd> Nummer + / −</div>`;
  }
  function stilAendern(b, art, wert) {
    const a = b.autoDaten ? b.autoDaten() : null;
    if (!a || a.sonderbau !== 'motorrad' || !b.fahrer) return false;
    const st = G3.stilHolen(b.fahrer, a.id), o = a.optionen || {};
    if (art === 'helm') G3.stilSetzen(b.fahrer, a.id, { helm: wert });
    else if (art === 'kombi') G3.stilSetzen(b.fahrer, a.id, { kombi: wert });
    else if (art === 'nr') G3.stilSetzen(b.fahrer, a.id, { nr: (st.nr !== null ? st.nr : (o.nummer || 1)) + wert });
    return true;
  }
  if (R.Garage && R.Garage.Bildschirm) {
    const B = R.Garage.Bildschirm.prototype;
    const buehneBinden = B.buehneBinden;
    B.buehneBinden = function () { G3.aktuell = this.fahrer; try { return buehneBinden.apply(this, arguments); } finally { G3.aktuell = null; } };
    const zeichnen = B.zeichnen;
    B.zeichnen = function () {
      stilCss();
      const r = zeichnen.apply(this, arguments);
      try {
        if (!this._m3) {
          this._m3 = true;
          this.wurzel.addEventListener('click', (e) => {
            const t = e.target.closest && e.target.closest('[data-m3]');
            if (!t) return;
            const [art, w] = t.dataset.m3.split(':');
            if (stilAendern(this, art, +w)) { this.ton && this.ton('klick'); this.zeichnen(); }
          });
        }
        if (this.sichtbar && this.phase === 'werkstatt') {
          const rechts = this.wurzel.querySelector('.g-rechts');
          if (rechts) { const msg = rechts.querySelector('.g-nachricht'), div = document.createElement('div'); div.innerHTML = stilZeilen(this); while (div.firstChild) rechts.insertBefore(div.firstChild, msg || null); }
        }
        G3.texteErsetzen(this.wurzel);
      } catch (e) { console.error('Motorrad M3 (Garage):', e); }
      return r;
    };
    const taste = B.taste;
    B.taste = function (code) {
      if (this.sichtbar && this.phase === 'werkstatt') {
        const a = this.autoDaten ? this.autoDaten() : null;
        if (a && a.sonderbau === 'motorrad') {
          const st = G3.stilHolen(this.fahrer, a.id), o = a.optionen || {};
          if (code === 'KeyH') { stilAendern(this, 'helm', G3.naechsteFarbe(st.helm !== null ? st.helm : o.helm, 1)); this.zeichnen(); return true; }
          if (code === 'KeyK') { stilAendern(this, 'kombi', G3.naechsteFarbe(st.kombi !== null ? st.kombi : a.farbe2, 1)); this.zeichnen(); return true; }
          if (code === 'KeyN') { stilAendern(this, 'nr', 1); this.zeichnen(); return true; }
          if (code === 'KeyM') { stilAendern(this, 'nr', -1); this.zeichnen(); return true; }
        }
      }
      return taste.apply(this, arguments);
    };
  }
  if (R.AutoVorschau && R.AutoVorschau.binden) {
    const binden = R.AutoVorschau.binden; let zaehler = 0, letzt = null;
    R.AutoVorschau.binden = function (index, canvas, auto, w, h, farbe) {
      try {
        if (G3.aktuell && auto && auto.sonderbau === 'motorrad') {
          const st = G3.stilHolen(G3.aktuell, auto.id), key = auto.id + '|' + G3.stilSchluessel(st);
          if (key !== letzt) { letzt = key; zaehler++; }
          const a2 = G3.stilAuto(auto, st);
          if (a2 !== auto) { const basis = farbe !== undefined && farbe !== null ? farbe : auto.farbe; auto = a2; farbe = (basis ^ (zaehler & 1)) >>> 0; }    // Lack-Bit kippen → Vorschau baut neu (gleicher Winkel)
        }
      } catch (e) { /* egal */ }
      return binden.call(this, index, canvas, auto, w, h, farbe);
    };
  }

  // ---------- Menü: Stunt-Park ----------
  if (R.Menue) {
    const M = R.Menue.prototype;
    const htmlModus = M.htmlModus;
    M.htmlModus = function () {
      let h = htmlModus.apply(this, arguments);
      const e = this.e || {}, an = !!e.stuntpark && !this.onlineGewaehlt;
      if (an) h = h.replace(/ gewaehlt/g, '');
      const pille = (m) => `<span class="pille${an && e.modus === m ? ' aktiv' : ''}" data-a="spieler:${m}:park">${m === 'solo' ? '👤 allein' : '👫 zu zweit'}</span>`;
      const karte = `<div class="karte gross modus-karte m-park${an ? ' gewaehlt' : ''}" data-a="modus:park"><div class="emoji">🎪</div>` +
        `<div class="karten-name">Stunt-Park</div><div class="karten-sub">Ohne Gegner: Schanzen, Steilwand, Schlamm, Wasser und Kisten</div>` +
        `<div class="modus-pillen">${pille('solo')}${pille('zwei')}</div></div>`;
      return h.replace(/<\/div>\s*$/, karte + '</div>');
    };
    const modusKarte = M.modusKarte;
    M.modusKarte = function (k) {
      const e = this.e || (this.spiel && this.spiel.einstellungen) || {};
      if (k === 'park') { e.spielart = 'rennen'; e.stuntrennen = false; e.stuntpark = true; this.onlineGewaehlt = false; return; }
      if (k === 'online') {          // Pfeiltasten laufen über die unsichtbare Karte: Stuntrennen → Stunt-Park → Letzter fliegt raus (→ Stuntrennen …)
        if (e.stuntpark) { e.stuntpark = false; return modusKarte.call(this, 'elimination'); }
        if (e.stuntrennen) { e.stuntrennen = false; e.stuntpark = true; e.spielart = 'rennen'; this.onlineGewaehlt = false; return; }
        return modusKarte.apply(this, arguments);
      }
      e.stuntpark = false;
      return modusKarte.apply(this, arguments);
    };
    const htmlStrecke = M.htmlStrecke;
    M.htmlStrecke = function () {
      const e = this.e || {};
      if (!e.stuntpark) return htmlStrecke.apply(this, arguments);
      return `<div class="reihe strecken"><div class="karte strecke t-wiese gewaehlt"><div class="strecken-bild" style="background:linear-gradient(180deg,#8fc8ff 0%,#8fc8ff 35%,#7ed957 35%,#3a8f2f 100%)"><div class="strasse"></div></div>` +
        `<div class="karten-name">🎪 Stunt-Park</div><div class="karten-sub">Feste Strecke ohne Gegner und ohne Ende: Schanzen, Feuerring, Steilwand, Schlamm, Wasser, Kisten und Busse.</div></div></div>`;
    };
    const zeichnen = M.zeichnen;
    M.zeichnen = function () {
      const r = zeichnen.apply(this, arguments);
      try {
        stilCss();
        if (this.e && this.e.stuntpark) this.wurzel.querySelectorAll('[data-a^="stepper:runden:"], [data-a^="stepper:gegner:"]').forEach((el) => { const zl = el.closest('.zeile'); if (zl) zl.style.display = 'none'; });
      } catch (err) { /* nur Optik */ }
      return r;
    };
  }

  R.Moto.m3start = { physikM3, bildM3, zustand3 };
})();
