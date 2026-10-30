// ============================================================
// Stufe R3 – Tricks online im Browser (Autorennen UND Motorrad; läuft ganz am Ende, nur Umhüllungen von R.Online.Bildschirm, wie spassOnlineR2.js):
//   Lobby (nur Host, nur wenn der Server `hallo.r3` meldet):  Zeile „🤸 Tricks“ An/Aus (Standard aus) → einstellungen.tricks
//     Auto-Raum      Menschen: in der Luft Umschalt-Taste = Fassrolle, + ↑/↓ = Schraube (Eingabe-Bit k, Richtung aus der Steuerung); Computer machen auch Tricks
//     Motorrad-Raum  Menschen wie bisher (Umschalt + Pfeil, läuft immer); NEU: die Computer-Gegner machen Tricks (Anzeige über zustand.mo[13..14], Motorrad-Online)
//   Der SERVER rechnet alles (server/r3Sim.js + spassTricks.js im Server-Kontext); der Browser zeigt nur an:
//     zustand.at[i] = [Code 4 Fassrolle · 5 Schraube, Fortschritt 0..1, Richtung ±1] → Auto-Pose (spassTricksFahrer.autoPose über spiel._t3.fz[i].pose), weich nachgeführt
//     Ereignis trick { nr, st, name, p, m, g }: eigene Meldung/Konfetti/Sticker; st 'fehl' = Wackel-Landung (Meldung, Kamerawackeln, Wackeln der Pose bei allen)
//   Ohne Raum-Schalter `tricks` und ohne `hallo.r3` ändert sich nichts (kein Codepfad, alles bitgleich wie vorher).
// ============================================================
(function () {
  const R = window.Rennspiel;
  if (!R || !R.Online || !R.Online.Bildschirm || !R.SpassTricks) return;
  const B = R.Online.Bildschirm.prototype;
  if (B._spassR3) return;
  B._spassR3 = true;
  const ST = R.SpassTricks;
  const moto = () => window.MOTORRAD === true;
  const S = { serverR3: false, ui: null };
  const esc = (t) => String(t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;' }[c]));
  const einst = (ui) => (ui.lobby && ui.lobby.einstellungen) || {};
  const jetzt = () => ((typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now());
  const ART = { 4: 'fassrolle', 5: 'schraube' };

  // ---------- hallo.r3 merken (ein alter Server schweigt → keine Zeile) ----------
  if (R.NetzVerbindung && R.NetzVerbindung.prototype) {
    const NV = R.NetzVerbindung.prototype, bei = NV.bei;
    NV.bei = function (t) {
      if (t === 'hallo' && !this._r3h) { this._r3h = true; S.serverR3 = false; bei.call(this, 'hallo', (m) => { S.serverR3 = !!m && m.r3 === true; }); }
      return bei.apply(this, arguments);
    };
    // Trick-Taste (Bit k) in jede Eingabe-Nachricht des Auto-Raums (im Motorrad macht das R.Moto.online.eingabe)
    const senden = NV.senden;
    NV.senden = function (msg) {
      try { const ui = S.ui; if (ui && ui._r3 && ui.verb === this && msg && msg.t === 'eingabe' && !ui.dialog) eingabe(ui, msg); } catch (e) { /* Taste egal */ }
      return senden.apply(this, arguments);
    };
  }

  // ================================================================ Lobby
  const LABEL = '🤸 Tricks';
  const zeilen = B.zeilen;
  B.zeilen = function () {
    const z = zeilen.apply(this, arguments);
    if (this.istHost && S.serverR3 && z.indexOf('r3tricks') < 0) {
      // R4-FIX: „Tricks“ steht oben bei den Spaß-Zeilen (nach Spaß-Elemente / Fahr-Zauber / Loopings, vor „Strecke“); ohne diese Zeilen vor „Strecke“, sonst hinten
      let i = Math.max(z.indexOf('loopmag'), z.indexOf('zauber'), z.indexOf('spass')); i = i >= 0 ? i + 1 : z.indexOf('strecke');
      if (i < 0) z.push('r3tricks'); else z.splice(i, 0, 'r3tricks');
    }
    return z;
  };
  const werte = B.werte;
  B.werte = function (zeile) {
    if (zeile !== 'r3tricks') return werte.apply(this, arguments);
    return { wert: einst(this).tricks === true ? 'an' : 'aus', liste: [{ k: 'aus', text: 'Aus' }, { k: 'an', text: '🤸 An' }] };
  };
  const wertSetzen = B.wertSetzen;
  B.wertSetzen = function (zeile, k) {
    if (zeile === 'r3tricks') {
      if (!this.verb || !this.lobby || !this.istHost || !S.serverR3) return;
      this.verb.senden({ t: 'einstellungen', einstellungen: { tricks: k === 'an' } });
      return;
    }
    return wertSetzen.apply(this, arguments);
  };
  const hinweis = () => (moto()
    ? '🤸 Tricks: auch die Computer-Gegner machen Tricks in der Luft (du wie gewohnt: Umschalt + Pfeil).'
    : '🤸 Tricks: in der Luft Umschalt-Taste = Fassrolle, dazu ↑/↓ = Schraube. Landest du mitten im Trick, wackelt es. Die Computer machen auch Tricks.');
  const htmlLobby = B.htmlLobby;
  B.htmlLobby = function () {
    let h = htmlLobby.apply(this, arguments);
    try {
      const an = einst(this).tricks === true;
      if (this.istHost && S.serverR3) {
        const z = this.zeilen(), w = this.werte('r3tricks');
        const reihe = `<div class="on-zeile${z.indexOf('r3tricks') === this.fokus ? ' fokus' : ''}" data-a="fokus:${z.indexOf('r3tricks')}"><div class="on-label">${LABEL}</div><div class="on-werte">` +
          w.liste.map((x) => `<span class="pille${x.k === w.wert ? ' aktiv' : ''}" data-a="wert:r3tricks:${esc(x.k)}">${esc(x.text)}</span>`).join('') + '</div></div>' + (an ? `<div class="on-info on-r3">${esc(hinweis())}</div>` : '');
        h = R.SpassOnlineS8 && R.SpassOnlineS8.vorStrecke ? R.SpassOnlineS8.vorStrecke(h, reihe) : h.replace('<div class="on-fest">', reihe + '<div class="on-fest">');      // R4-FIX: oben direkt vor „Strecke“
      } else if (an) {
        h = h.replace(/(<div class="on-zusammen">[\s\S]*?)(<\/div>)/, `$1<br>${esc(LABEL + ': an')}$2`);
      }
    } catch (err) { console.error('R3 (Lobby):', err); }
    return h;
  };
  const lobbyEmpfangen = B.lobbyEmpfangen;
  B.lobbyEmpfangen = function (m) {
    const r = lobbyEmpfangen.apply(this, arguments);
    try { const n = this.zeilen().length; if (this.fokus >= n) this.fokus = Math.max(0, n - 1); } catch (e) { /* egal */ }
    return r;
  };

  // ================================================================ Rennen (nur Auto-Räume mit Raum-Schalter tricks)
  function aufbau(ui, m) {
    const spiel = ui.spiel, n = (m.teilnehmer || []).length;
    const K = ui._r3 = { nT: n, du: m.du, ziel: [], anz: [], wackel: [], tipp: {} };
    S.ui = ui;
    spiel._t3 = { rennen: spiel.rennen, fz: Array.from({ length: n }, () => ST.zNeu()), zeit: 0 };       // nur die Pose je Fahrzeug (spassTricksFahrer.bild liest spiel._t3.fz[i].pose)
    const codes = ST.config().taste;
    if (spiel.input && spiel.input.spielTasten) codes.forEach((c) => spiel.input.spielTasten.add(c));
    const I = ST._intern;
    codes.forEach((c) => { K.tipp[c] = (I && I.ZAEHL[c]) || 0; });
    if (ST.ui && ST.ui.touchKnopf) { try { ST.ui.touchKnopf(spiel); } catch (e) { /* ohne Touch */ } }
  }
  function abbau(ui) {
    if (S.ui === ui) S.ui = null;
    if (ui._r3) { try { if (ui.spiel) ui.spiel._t3 = null; } catch (e) { /* egal */ } ui._r3 = null; }
  }
  const rennenAufbauen = B.rennenAufbauen;
  B.rennenAufbauen = function (m) {
    abbau(this);
    const r = rennenAufbauen.apply(this, arguments);
    if (!moto() && m && m.einstellungen && m.einstellungen.tricks === true) { try { aufbau(this, m); } catch (err) { console.error('R3 online (Aufbau):', err); } }
    return r;
  };
  const rennenAbbauen = B.rennenAbbauen;
  B.rennenAbbauen = function () { try { abbau(this); } catch (e) { console.error('R3 online (Abbau):', e); } return rennenAbbauen.apply(this, arguments); };

  /** Trick-Taste gehalten oder seit der letzten Nachricht angetippt → Bit k (Richtung steckt in der normalen Steuerung). */
  function eingabe(ui, msg) {
    const K = ui._r3, inp = ui.spiel.input, I = ST._intern;
    if (!K || !inp) return;
    let k = false;
    ST.config().taste.forEach((c) => {
      if (inp.istGedrueckt && inp.istGedrueckt(c)) k = true;
      const n = (I && I.ZAEHL[c]) || 0;
      if (n > (K.tipp[c] || 0)) { K.tipp[c] = n; k = true; }
    });
    if (k) msg.k = 1;
  }

  const zustandEmpfangen = B.zustandEmpfangen;
  B.zustandEmpfangen = function (z) {
    const r = zustandEmpfangen.apply(this, arguments);
    const K = this._r3;
    if (K && z && Array.isArray(z.at)) {
      try {
        const t = jetzt();
        for (let i = 0; i < K.nT && i < z.at.length; i++) {
          const a = z.at[i], art = a && ART[a[0]];
          K.ziel[i] = art ? { art, p: +a[1] || 0, dir: a[2] < 0 ? -1 : 1, t } : null;
        }
      } catch (e) { console.error('R3 online (Zustand):', e); }
    }
    return r;
  };

  const ereignisEmpfangen = B.ereignisEmpfangen;
  B.ereignisEmpfangen = function (m) {
    const r = ereignisEmpfangen.apply(this, arguments);
    const K = this._r3;
    if (K && this.phase === 'rennen' && m && m.art === 'trick') { try { ereignis(this, K, m); } catch (e) { console.error('R3 online (Ereignis):', e); } }
    return r;
  };
  function ereignis(ui, K, m) {
    const spiel = ui.spiel, f = spiel.fahrzeuge[m.nr];
    if (m.st === 'fehl') K.wackel[m.nr] = { t: 0 };                                   // alle sehen das Wackeln
    if (m.nr !== K.du || !f) return;
    const hud = spiel.huds && spiel.huds[0];
    if (m.st === 'fehl') {
      if (hud && hud.meldung) hud.meldung('Wackel! 😬', 1000);
      spiel.kameras.forEach((c) => { if (c.ziel === f.vehicle && c.wackeln) c.wackeln(3); });
      if (R.Audio && R.Audio.kollision) { try { R.Audio.kollision(4); } catch (e) { /* Ton egal */ } }
      return;
    }
    let text = m.name + ' +' + m.p;
    if (m.m > 1) text += ' ×' + m.m;
    text += '\n⭐ ' + m.g + ' Trickpunkte';
    if (hud && hud.meldung) hud.meldung(text, 1500);
    const v = f.vehicle;
    if (spiel.spassKonfetti) spiel.spassKonfetti.burst(v.x, v.y + 1.5, v.z, 18 + 8 * Math.min(4, m.m));
    if (m.m >= 3 && R.SpassStimme) { try { R.SpassStimme.jubeln(); } catch (e) { /* Ton egal */ } }
    if (m.st === 'fassrolle' && ST.ui && ST.ui.sticker) { try { ST.ui.sticker('fassrolle'); } catch (e) { /* Sticker egal */ } }
  }

  /** Pose je Fahrzeug aus dem letzten Serverwert, weich nachgeführt (der Server meldet alle 3 Ticks): vor dem Zeichnen, damit spassTricksFahrer.autoPose sie nimmt. */
  function poseSetzen(ui, dt) {
    const K = ui._r3, spiel = ui.spiel, S3 = spiel._t3;
    if (!K || !S3 || !S3.fz) return;
    const t = jetzt(), cfg = ST.config();
    for (let i = 0; i < K.nT; i++) {
      const z3 = S3.fz[i], zl = K.ziel[i];
      if (!z3) continue;
      const po = z3.pose;
      let a = null;
      if (zl) {
        const dauer = cfg.zeit[zl.art].dauer, pT = Math.min(1, zl.p + Math.min(0.12, (t - zl.t) / 1000 / dauer));
        const alt = K.anz[i];
        let p = alt && alt.art === zl.art ? alt.p : zl.p;
        p = Math.max(p, p + (pT - p) * (1 - Math.exp(-Math.max(0, dt || 0.016) / 0.04)));
        K.anz[i] = { art: zl.art, p };
        a = ST.anzeige(zl.art, p, zl.dir, cfg);
      } else K.anz[i] = null;
      if (a) { po.art = a.art; po.p = a.p; po.w = a.w; po.salto = a.salto; po.rolle = a.rolle; po.schraube = a.schraube; po.hoehe = a.hoehe; po.dir = zl.dir; }
      else { po.art = null; po.p = 0; po.w = 0; po.salto = 0; po.rolle = 0; po.schraube = 0; po.hoehe = 0; }
      const w = K.wackel[i];
      if (w) {
        const c = cfg.wackeln;
        w.t += Math.max(0, dt || 0.016);
        if (w.t >= c.dauer) K.wackel[i] = null; else po.rolle += c.amp * (1 - w.t / c.dauer) * Math.sin(w.t * 26);
      }
    }
  }
  if (R.dach && typeof R.dach.frame === 'function' && !R.dach._r3) {
    R.dach._r3 = true;
    const frame = R.dach.frame;
    R.dach.frame = function (spiel, dt) {
      try { const ui = S.ui; if (ui && ui._r3 && ui.spiel === spiel) poseSetzen(ui, dt); } catch (e) { if (typeof console !== 'undefined') console.error('R3 online (Pose):', e); }
      return frame.apply(this, arguments);
    };
  }
  R.SpassOnlineR3 = { S, ART, poseSetzen, eingabe };
})();
