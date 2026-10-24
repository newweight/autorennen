// ============================================================
// Motorrad-Stunts (Stufe M2) – Verdrahtung: läuft NACH src/main.js und src/moto/motoStart.js, nur mit window.MOTORRAD === true.
// Alle Eingriffe sind Umhüllungen zur Laufzeit; keine Datei im Repo wird geändert (Autorennen.html lädt dieses Skript nicht).
//
//   Spiel.streckeSzeneBauen   umhüllt: nach dem Aufbau Feuerring, Bus-Reihe, Zonen-Markierungen (stuntWelt.bauen) in die Szene
//   Spiel.rennenStarten       umhüllt: Stunt-Zustand je Fahrzeug (spiel.stunt), HUD-Felder, Trick-Taste in input.spielTasten, Touch-Knopf
//   Spiel.physikSchritt       umhüllt: nach dem Schritt je Fahrzeug Flug/Tricks/Ring/Bus-Reihe/Zonen/Combo auswerten (stunts.schritt)
//   R.dach.frame              umhüllt (außen um die Schräglage aus schraeglage.js): Tricks und Wheelie/Stoppie als Pose auf lage/purzel, Flammen, HUD
//   ErgebnisAnzeige.zeigen    umhüllt: beim Stuntrennen Tafel mit Rang, Platz-/Stuntpunkten, Gesamt
//   Menue.htmlModus/modusKarte umhüllt: zusätzliche Modus-Karte „Stuntrennen“ (Flag einstellungen.stuntrennen; Pfeiltasten: nach „Letzter fliegt raus“)
// Trick-Taste: Spieler 1 (Pfeile) rechte Umschalt-Taste, Spieler 2 (WASD) linke Umschalt-Taste; Touch: zusätzlicher Knopf (nur Motorradmodus).
// Einmal tippen = Drehung, zweimal schnell = Salto; am Boden in einer Wheelie-Zone gehalten = Wheelie; Bremse in der Stoppie-Zone = Stoppie.
// ============================================================
(function () {
  if (window.MOTORRAD !== true) return;
  const R = window.Rennspiel;
  if (!R || !R.Spiel || !R.Moto || !R.Moto.stunts || !R.Moto.stuntWelt) return;
  const St = R.Moto.stunts, W = R.Moto.stuntWelt, H = R.Moto.stuntHud;
  const CFG = () => R.config.motoStunts;
  const P = R.Spiel.prototype;

  // ---------- Trick-Taste: eigener Tipp-Zähler ----------
  // Input.geradeGedrueckt wird nach jedem Bild geleert; bei niedriger Bildrate (zwei Tipps in einem Bild) oder sehr hoher (Bild ohne Physikschritt)
  // ginge ein schnelles Doppeltippen (= Salto) sonst verloren. Darum zählt ein eigener keydown-Zähler jeden Tastendruck, die Physik holt sich die neuen ab.
  const TIPP = {};
  let tippLauscher = false;
  function tippZaehlen(code) { TIPP[code] = (TIPP[code] || 0) + 1; }
  function tippLauschen() {
    if (tippLauscher || typeof window === 'undefined' || !window.addEventListener) return;
    tippLauscher = true;
    window.addEventListener('keydown', (e) => { if (!e.repeat && CFG().taste.indexOf(e.code) >= 0) tippZaehlen(e.code); }, true);
  }

  // ---------- Szene: Ring, Reihe, Zonen ----------
  const streckeSzeneBauen = P.streckeSzeneBauen;
  P.streckeSzeneBauen = function () {
    const r = streckeSzeneBauen.apply(this, arguments);
    try {
      if (this.motoStuntGruppe && this.motoStuntGruppe.parent) this.motoStuntGruppe.parent.remove(this.motoStuntGruppe);
      this.motoStuntGruppe = null;
      if (this.strecke && this.szene) {
        const g = W.bauen(this.strecke);
        this.szene.add(g);
        this.motoStuntGruppe = g;
      }
    } catch (e) { console.error('Motorrad-Stunts (Szene):', e); }
    return r;
  };

  // ---------- Rennstart ----------
  function stuntNeu(spiel, stuntrennen) {
    const sz = { stuntrennen: !!stuntrennen, zeit: 0, saat: 'moto|' + (spiel.strecke ? spiel.strecke.id : '') + '|' + (spiel.strecke ? spiel.strecke.variante : ''), fz: [], alle: [] };
    spiel.fahrzeuge.forEach((f, i) => {
      const z = St.zNeu();
      z.fluegeGesehen = 0; z.purzelGesehen = 0; z.ringPrev = []; z.reihe = []; z.kiPlan = null;
      z.tippGesehen = (f.istSpieler && f.spielerNr >= 0 && TIPP[CFG().taste[f.spielerNr]]) || 0; z.tippOffen = 0;
      sz.fz[i] = z;
    });
    return sz;
  }
  const rennenStarten = P.rennenStarten;
  P.rennenStarten = function (einst) {
    const wunsch = einst && einst.stuntrennen !== undefined ? !!einst.stuntrennen : !!(this.einstellungen && this.einstellungen.stuntrennen);
    const r = rennenStarten.apply(this, arguments);
    try {
      if (this.einstellungen) this.einstellungen.stuntrennen = wunsch;
      this.stunt = this.rennen && this.strecke ? stuntNeu(this, wunsch) : null;
      if (this.input && this.input.spielTasten) CFG().taste.forEach((c) => this.input.spielTasten.add(c));
      tippLauschen();
      if (H) H.anlegen(this);
      touchKnopf(this);
    } catch (e) { console.error('Motorrad-Stunts (Start):', e); }
    return r;
  };

  // ---------- Physikschritt ----------
  function stuntSchritt(spiel, dt) {
    const sz = spiel.stunt, strecke = spiel.strecke, rennen = spiel.rennen;
    if (sz && (spiel.zustand !== 'rennen' || spiel.pausiert)) {            // Tastendrücke außerhalb des Rennens (Menü, Pause) nicht nachholen
      sz.fz.forEach((z, i) => { const f = spiel.fahrzeuge[i]; if (z && f && f.istSpieler && f.spielerNr >= 0) { z.tippGesehen = TIPP[CFG().taste[f.spielerNr]] || 0; z.tippOffen = 0; } });
    }
    // Ergebnistafel nach dem Ziel sicher zeigen: Das Spiel wartet bei laufendem Feuerwerk (config.feuerwerk.tafelNach, 6 s) auf BILDER – wird die Zeit nur vorgespult
    // (kein Zeichnen), käme die Tafel nie. Darum zählt hier die Spielzeit im Physikschritt mit; die Tafel erscheint nach derselben Wartezeit.
    if (sz && spiel._tafelWarten && spiel.zustand === 'rennen' && !spiel.pausiert) {
      sz.tafelT = (sz.tafelT || 0) + dt;
      const fw = spiel.feuerwerk;
      if (sz.tafelT >= ((fw && fw.c && fw.c.tafelNach) || 6)) { sz.tafelT = 0; spiel.rennenFertig(true); return; }
    } else if (sz) sz.tafelT = 0;
    if (!sz || spiel.zustand !== 'rennen' || !strecke || !rennen || spiel.pausiert) return;
    const cfg = CFG(), D = W.stuntDaten(strecke), input = spiel.input, sch = R.Moto.schraeglage;
    sz.zeit += dt;
    for (let i = 0; i < spiel.fahrzeuge.length; i++) {
      const f = spiel.fahrzeuge[i], z = sz.fz[i], fl = f && f.flug;
      if (!f || !z || !fl || f.ausgeschieden) continue;
      const v = f.vehicle, luft = !!fl.aktiv, rampe = !!fl.rampe && !luft;
      const abflug = fl.fluege > z.fluegeGesehen;
      if (abflug) { z.fluegeGesehen = fl.fluege; z.kiPlan = f.istSpieler ? null : St.kiPlan(sz.saat, i, fl.fluege); }
      // --- Eingaben: Menschen/Autopilot über die Trick-Taste, KI über den deterministischen Plan ---
      let tipp = false, halten = false, bremse = false;
      if (f.istSpieler && f.spielerNr >= 0 && input) {
        const code = cfg.taste[f.spielerNr];
        halten = input.istGedrueckt(code);
        tipp = St.tasteKante(z, halten || input.wurdeGedrueckt(code));
        const n = TIPP[code] || 0;
        if (n > z.tippGesehen) { z.tippOffen = (z.tippOffen || 0) + (n - z.tippGesehen - 1); z.tippGesehen = n; tipp = true; }     // mehrere Tipps in einem Bild (niedrige Bildrate): der Rest folgt in den nächsten Schritten
        else if (z.tippOffen > 0 && !tipp) { z.tippOffen--; tipp = true; }
        if (!f.autopilot) bremse = input.steuerung(f.spielerNr).bremse > 0;
      } else if (z.kiPlan && luft) {
        const k = z.kiPlan;
        if (!k.t1 && fl.t >= k.startT) { k.t1 = true; tipp = true; }
        else if (k.art === 'salto' && k.t1 && !k.t2 && fl.t >= k.startT + 0.12) { k.t2 = true; tipp = true; }
      }
      // --- Sturz (Purzelbaum) ---
      let sturz = false;
      const mz = f.motoZ;
      if (mz && mz.purzel.anzahl > z.purzelGesehen) { z.purzelGesehen = mz.purzel.anzahl; sturz = true; }
      // --- Feuerring ---
      let ring = null;
      for (let ri = 0; ri < D.ringe.length; ri++) {
        const r = D.ringe[ri], dx = v.x - r.x, dz = v.z - r.z, d = dx * r.tx + dz * r.tz, q = dx * r.nx + dz * r.nz, vor = z.ringPrev[ri];
        if (luft && vor) {
          const hit = St.ringDurchflug(vor.d, d, vor.q, q, vor.y, v.y, r.y, cfg);
          if (hit && hit.bewertung !== 'vorbei' && (!ring || hit.bewertung === 'volltreffer')) ring = hit;
        }
        z.ringPrev[ri] = luft ? { d, q, y: v.y } : null;
      }
      // --- Bus-Reihe ---
      let bus = null;
      for (let ri = 0; ri < D.reihen.length; ri++) {
        const L = D.reihen[ri], dx = v.x - L.x, dz = v.z - L.z, a = dx * L.tx + dz * L.tz, q = dx * L.nx + dz * L.nz;
        const status = St.reiheStatus(L, a, q, v.y - strecke.hoeheAn(v.x, v.z), luft, cfg);
        const rs = z.reihe[ri] || (z.reihe[ri] = { letzt: 'ausser', kontakt: false });
        if (status === 'kontakt' && !rs.kontakt) {            // zu tief / am Boden in der Reihe: Purzelbaum + weiter, kein Steckenbleiben
          rs.kontakt = true; sturz = true;
          if (sch && mz) { sch.purzelStart(mz); z.purzelGesehen = mz.purzel.anzahl; }     // zählt hier schon, nicht noch einmal als fremder Sturz
          v.vLaengs *= 0.5;
          if (f.istSpieler) { spiel._meldung(i, 'Rumms! 😬', 900); if (R.Audio) R.Audio.kollision(5); }
        } else if (status === 'hinter' && rs.letzt === 'drueber' && !rs.kontakt) bus = { n: L.n };
        if (status === 'ausser') rs.kontakt = false;
        rs.letzt = status;
      }
      // --- Wheelie-/Stoppie-Zone ---
      let zone = null;
      if (!luft && !rampe && f.nah && Math.abs(f.nah.seitenabstand) <= strecke.breite / 2) { const zo = W.zoneBei(strecke, f.nah.s); zone = zo ? zo.art : null; }
      const ev = St.schritt(z, {
        dt, jetzt: sz.zeit, luft, rampe, flugT: fl.t, y: fl.y, vy: fl.vy, boden: strecke.hoeheAn(v.x, v.z, f.index),
        tippen: tipp, halten, bremse, v: v.vLaengs, weg: Math.abs(v.vLaengs) * dt, zone, abflug, sturz, ring, bus,
      }, cfg);
      if (ev.length) {
        for (let k = 0; k < ev.length; k++) { sz.alle.push(Object.assign({ fahrzeug: i, zeit: sz.zeit }, ev[k])); if (H && f.istSpieler) H.ereignis(spiel, i, ev[k]); }
        ev.length = 0;
      }
    }
  }
  const physikSchritt = P.physikSchritt;
  P.physikSchritt = function (dt) {
    const r = physikSchritt.apply(this, arguments);
    try { stuntSchritt(this, dt); } catch (e) { console.error('Motorrad-Stunts:', e); }
    return r;
  };

  // ---------- Anzeige-Pose + HUD je Bild ----------
  function stuntBild(spiel, dt) {
    const sz = spiel.stunt;
    if (!sz) return;
    const piv = (R.Moto.modell && R.Moto.modell.PIVOT_Y) || 0.7;
    for (let i = 0; i < spiel.fahrzeuge.length; i++) {
      const f = spiel.fahrzeuge[i], z = sz.fz[i], u = f && f.mesh && f.mesh.userData;
      if (!z || !u || !u.lage || !u.purzel) continue;
      const pose = z.pose;
      u.lage.rotation.y = pose.gier;
      let rx = u.purzel.rotation.x + pose.salto, py = u.purzel.position.y + pose.hoehe, pz = 0;
      if (Math.abs(pose.nick) > 0.002) {
        const achse = pose.nick > 0 ? { y: 0.33, z: 0.70 } : { y: 0.34, z: -0.78 };           // Hinterachse (Wheelie) / Vorderachse (Stoppie)
        const o = St.achsenVersatz(pose.nick, achse.y, achse.z, piv, 0);
        py = o.y + (u.purzel.position.y - piv) + pose.hoehe; pz = o.z; rx += pose.nick;
      }
      u.purzel.rotation.x = rx; u.purzel.position.y = py; u.purzel.position.z = pz;
    }
    if (spiel.motoStuntGruppe) W.animieren(spiel.motoStuntGruppe, dt);
    if (H) H.frame(spiel);
  }
  if (R.dach && typeof R.dach.frame === 'function') {
    const frame = R.dach.frame;
    R.dach.frame = function (spiel, dt) {
      const r = frame.apply(this, arguments);
      try { stuntBild(spiel, dt); } catch (e) { console.error('Motorrad-Stunts (Bild):', e); }
      return r;
    };
  }

  // ---------- Ergebnistafel (Stuntrennen) ----------
  /** Wertung zur Ergebnistafel: Platzpunkte + Stuntpunkte je Fahrer, sortiert nach Gesamt. */
  function wertung(spiel, erg) {
    const sz = spiel.stunt;
    const zeilen = erg.zeilen.map((z) => ({ platz: z.platz, nr: z.nr, name: z.name, istSpieler: z.istSpieler, spielerNr: z.spielerNr, auto: z.auto, zeit: z.zeit, raus: z.raus,
      stunt: sz && sz.fz[z.nr] ? sz.fz[z.nr].punkte : 0 }));
    return St.stuntrennenWertung(zeilen);
  }
  if (R.ErgebnisAnzeige) {
    const zeigen = R.ErgebnisAnzeige.prototype.zeigen;
    R.ErgebnisAnzeige.prototype.zeigen = function (erg) {
      const r = zeigen.apply(this, arguments);
      try {
        const sp = this.spiel, sz = sp && sp.stunt;
        if (sz && sz.stuntrennen && !sp.pokal && erg && erg.zeilen) {
          const w = wertung(sp, erg);
          erg.stuntWertung = w;
          const karte = this.wurzel.querySelector('.ergebnis-karte');
          if (karte && H) karte.innerHTML = H.ergebnisHtml(sp, erg, w);
        }
      } catch (e) { console.error('Motorrad-Stunts (Ergebnis):', e); }
      return r;
    };
  }

  // ---------- Menü: Modus-Karte „Stuntrennen“ ----------
  if (H && H.menueStilEinbauen) H.menueStilEinbauen();       // fünf Karten in einer Reihe: nichts mehr am Rand abgeschnitten (nur Motorradmodus)
  if (R.Menue) {
    const M = R.Menue.prototype;
    const htmlModus = M.htmlModus;
    M.htmlModus = function () {
      let h = htmlModus.apply(this, arguments);
      const e = this.e || {}, an = !!e.stuntrennen && !this.onlineGewaehlt;
      if (an) h = h.replace('m-solo gewaehlt', 'm-solo').replace('m-zwei gewaehlt', 'm-zwei');
      const pille = (m) => `<span class="pille${an && e.modus === m ? ' aktiv' : ''}" data-a="spieler:${m}:stunt">${m === 'solo' ? '👤 allein' : '👫 zu zweit'}</span>`;
      const karte = `<div class="karte gross modus-karte m-stunt${an ? ' gewaehlt' : ''}" data-a="modus:stunt"><div class="emoji">🏍️</div>` +
        `<div class="karten-name">Stuntrennen</div><div class="karten-sub">Schanzen, Tricks, Feuerring und Busse – Platz und Stuntpunkte zählen</div>` +
        `<div class="modus-pillen">${pille('solo')}${pille('zwei')}</div></div>`;
      return h.replace(/<\/div>\s*$/, karte + '</div>');
    };
    const modusKarte = M.modusKarte;
    M.modusKarte = function (k) {
      const e = this.e || (this.spiel && this.spiel.einstellungen) || {};
      if (k === 'stunt') { e.spielart = 'rennen'; e.stuntrennen = true; this.onlineGewaehlt = false; return; }
      if (k === 'online') {                       // Pfeiltasten laufen über die unsichtbare 5. Karte: von „Letzter fliegt raus“ → Stuntrennen, von dort zurück
        if (e.stuntrennen) { e.stuntrennen = false; return modusKarte.call(this, 'elimination'); }
        if (e.spielart === 'elimination') { e.spielart = 'rennen'; e.stuntrennen = true; this.onlineGewaehlt = false; return; }
        return modusKarte.apply(this, arguments);
      }
      e.stuntrennen = false;
      return modusKarte.apply(this, arguments);
    };
  }

  // ---------- Touch: Trick-Knopf ----------
  function touchKnopf(spiel) {
    if (typeof document === 'undefined') return;
    const wurzel = document.getElementById('touch');
    if (!wurzel || wurzel.querySelector('.moto-touch')) return;
    if (H) H.stilEinbauen();
    const k = document.createElement('div');
    k.className = 't-knopf klein moto-touch';
    k.innerHTML = '<span>🌀</span><small>Trick</small>';
    k.title = 'Trick: in der Luft tippen = Drehung, zweimal = Salto; in der Wheelie-Zone halten = Wheelie';
    wurzel.appendChild(k);
    const code = () => CFG().taste[0];
    const runter = (e) => {
      e.preventDefault(); k.classList.add('an');
      const inp = (R.spiel || spiel).input;
      if (inp) { inp.gedrueckt.add(code()); inp.geradeGedrueckt.add(code()); }
      tippZaehlen(code());
      try { k.setPointerCapture(e.pointerId); } catch (err) { /* egal */ }
    };
    const hoch = () => { k.classList.remove('an'); const inp = (R.spiel || spiel).input; if (inp) inp.gedrueckt.delete(code()); };
    k.addEventListener('pointerdown', runter);
    k.addEventListener('pointerup', hoch);
    k.addEventListener('pointercancel', hoch);
  }

  R.Moto.stuntStart = { TIPP, tippZaehlen, stuntNeu, stuntSchritt, stuntBild, wertung, touchKnopf };
})();
