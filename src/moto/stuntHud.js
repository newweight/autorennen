// ============================================================
// Motorrad-Stunts (Stufe M2) – Anzeige: Stuntpunkte + Combo oben im HUD, große Einblendungen („Salto! +400"), Ergebnistafel beim Stuntrennen.
// Reine DOM-Anzeige: Stuntfeld im Spieler-Chip (kein Überlappen), Einblendungen über den Meldungsplatz des HUDs; styles.css bleibt unverändert (Stil per <style>).
// Im Zweispieler hat jede Bildhälfte ihr eigenes Feld. Aufruf aus stuntStart.js:
//   anlegen(spiel)            nach dem Rennstart: Felder in jedes HUD
//   ereignis(spiel, i, e)     Stunt von Fahrzeug i (nur Spieler zeigen es an; eine Einblendung ersetzt die vorige)
//   frame(spiel)              je Bild: Punkte, Combo-Balken, Live-Anzeige (Wheelie/Stoppie)
//   ergebnisHtml(spiel, erg)  Inhalt der Ergebnistafel (Stuntrennen), sortiert nach Gesamtpunkten
// ============================================================
window.Rennspiel = window.Rennspiel || {};

(function () {
  const R = window.Rennspiel;
  R.Moto = R.Moto || {};

  // Aufbau: Das Stuntfeld (Punkte, Combo, Zeitbalken, Live-Zeile) steckt IM Spieler-Chip (.hud-links, oben links in jeder Bildhälfte) und wächst mit ihm nach unten –
  // dadurch kann es keine Nachbar-Elemente überdecken (Platz-Chip, Zeiten, Spiegel, Minikarte, Zählrad, Banner liegen woanders).
  // Einblendungen („Salto! +400“) laufen über denselben Meldungsplatz wie die HUD-Meldungen des Spiels (hud.meldung: „Sprung!“, „Preisgeld“): immer nur EINE,
  // die nächste ersetzt die vorige. Der Meldungsplatz wird nur im Motorradmodus unter den Platz-Chip gelegt (sonst überdeckt ihn der Platz-Chip im Splitscreen).
  const STIL = `
.hud-links .moto-stunt { display: block; margin-top: .3em; padding-top: .25em; border-top: .1em solid rgba(255,255,255,.28); white-space: nowrap; pointer-events: none; }
.moto-stunt .ms-punkte { display: block; font-size: 1.25em; color: #ffd23a; line-height: 1.15; font-variant-numeric: tabular-nums; }
.moto-stunt .ms-combo { display: none; font-size: 1.1em; color: #ff9a2a; line-height: 1.2; font-weight: 900; }
.moto-stunt .ms-combo.an { display: block; }
.moto-stunt .ms-combo.gross { font-size: 1.45em; color: #ff7a00; text-shadow: 0 0 .5em rgba(255,160,40,.7), 0 .1em .2em rgba(0,0,0,.7); }
.moto-stunt .ms-balken { display: none; height: .3em; margin-top: .15em; border-radius: .15em; background: rgba(255,255,255,.18); overflow: hidden; }
.moto-stunt .ms-balken.an { display: block; }
.moto-stunt .ms-balken b { display: block; height: 100%; width: 0; background: linear-gradient(90deg, #ff8a1a, #ffd23a); }
.moto-stunt .ms-live { display: none; font-size: 1.05em; color: #7fe3ff; line-height: 1.2; }
.moto-stunt .ms-live.an { display: block; }
.hud.voll .hud-meldung, .hud.links .hud-meldung, .hud.rechts .hud-meldung { top: 24% !important; font-size: 1.3em !important; }
.hud .hud-banner { top: 35% !important; }
.hud.links .hud-banner, .hud.rechts .hud-banner { top: 35% !important; }
.hud.links .hud-meldung, .hud.rechts .hud-meldung { top: 29% !important; font-size: 1.15em !important; }
.hud.links .hud-hinweis, .hud.rechts .hud-hinweis { left: 68% !important; font-size: 1.5em !important; }
.hud.links .hud-countdown, .hud.rechts .hud-countdown { top: 27% !important; }
.moto-touch { right: var(--rand); bottom: calc(var(--rand) * 2 + var(--tb) * 1.15 + 6px); width: calc(var(--tb) * .95); height: calc(var(--tb) * .95); font-size: calc(var(--tb) * .5);
  background: rgba(255,138,26,.38); border-color: rgba(255,230,190,.9); }
.moto-touch.an { background: rgba(255,138,26,.8); }
.ergebnis .moto-erg td.punkte, .ergebnis .moto-erg th.punkte { text-align: right; }
.ergebnis .moto-erg tr.gesamt-spitze td { font-weight: 900; }
`;
  const MELDUNG_STANDARD = 'linear-gradient(90deg, rgba(255,90,170,.9), rgba(150,110,255,.9))';
  const MELDUNG_FARBE = {
    ring: 'linear-gradient(90deg, rgba(255,59,0,.95), rgba(255,154,0,.95))', voll: 'linear-gradient(90deg, rgba(255,45,111,.95), rgba(255,176,0,.95))',
    bus: 'linear-gradient(90deg, rgba(28,95,208,.95), rgba(47,139,255,.95))', zone: 'linear-gradient(90deg, rgba(15,143,90,.95), rgba(47,207,138,.95))',
    trick: 'linear-gradient(90deg, rgba(255,122,0,.95), rgba(255,176,0,.95))',
  };
  let stilDa = false;
  function stilEinbauen() {
    if (stilDa || typeof document === 'undefined') return;
    const st = document.createElement('style');
    st.textContent = STIL;
    document.head.appendChild(st);
    stilDa = true;
  }

  const zahl = (n) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');

  /** Stuntfeld in den Spieler-Chip jedes HUDs hängen; Meldungsplatz des HUDs übernehmen (immer nur eine Einblendung). */
  function anlegen(spiel) {
    stilEinbauen();
    (spiel.huds || []).forEach((hd) => {
      if (!hd || !hd.el || hd._motoStunt) return;
      const chip = hd.el.querySelector('.hud-links') || hd.el;
      const wrap = document.createElement('div');
      wrap.className = 'moto-stunt';
      wrap.innerHTML = '<span class="ms-punkte">⭐ 0</span><span class="ms-combo"></span><span class="ms-balken"><b></b></span><span class="ms-live"></span>';
      chip.appendChild(wrap);
      hd._motoStunt = { wrap, ePunkte: wrap.querySelector('.ms-punkte'), eCombo: wrap.querySelector('.ms-combo'), eBalken: wrap.querySelector('.ms-balken b'), eBalkenBox: wrap.querySelector('.ms-balken'),
        eLive: wrap.querySelector('.ms-live'), zuletzt: { p: -1, c: '', b: -1, l: '', g: null } };
      // Meldungsplatz: Standardfarbe zurücksetzen, wenn eine normale Spielmeldung kommt (z. B. „Sprung!“ nach einer farbigen Stunt-Einblendung)
      if (typeof hd.meldung === 'function' && !hd._motoMeldungOrig) {
        const orig = hd.meldung;
        hd._motoMeldungOrig = orig;
        hd.meldung = function (text, ms, farbe) { if (this.eMeldung) this.eMeldung.style.background = farbe || MELDUNG_STANDARD; return orig.call(this, text, ms); };
      }
    });
  }

  function hudFuer(spiel, fi) {
    const f = spiel.fahrzeuge[fi];
    if (!f || !f.istSpieler) return null;
    return (spiel.huds || []).find((hd) => hd && hd.nr === f.spielerNr && hd._motoStunt) || null;
  }

  /** Einblendung für einen Stunt („Salto! +400 ×2“) auf dem Meldungsplatz des HUDs – ersetzt die vorige Einblendung, überdeckt kein anderes Feld. */
  function ereignis(spiel, fi, e) {
    const hd = hudFuer(spiel, fi);
    if (!hd || typeof hd.meldung !== 'function') return;
    let text = e.name + ' +' + zahl(e.punkte);
    if (e.art === 'bus') text = 'Bus-Sprung! +' + zahl(e.punkte) + ' (' + e.n + ' Busse)';
    else if (e.art === 'wheelie' || e.art === 'stoppie') text += ' (' + e.meter + ' m)';
    if (e.mult > 1) text += ' ×' + e.mult;
    const farbe = e.art === 'volltreffer' ? MELDUNG_FARBE.voll : e.art === 'feuerring' ? MELDUNG_FARBE.ring : e.art === 'bus' ? MELDUNG_FARBE.bus :
      (e.art === 'wheelie' || e.art === 'stoppie') ? MELDUNG_FARBE.zone : MELDUNG_FARBE.trick;
    hd.meldung(text, e.art === 'volltreffer' || e.art === 'bus' ? 1700 : 1300, farbe);
  }

  /** Punkte, Combo und Live-Anzeige aktualisieren. Combo ist sichtbar, sobald ein Stunt im Fenster liegt (ab ×2 groß und leuchtend). */
  function frame(spiel) {
    const sz = spiel.stunt;
    if (!sz) return;
    const St = R.Moto.stunts;
    (spiel.huds || []).forEach((hd) => {
      if (!hd || !hd._motoStunt) return;
      const fi = spiel.fahrzeuge.findIndex((f) => f.istSpieler && f.spielerNr === hd.nr);
      const z = sz.fz[fi];
      if (!z) return;
      const m = hd._motoStunt, zl = m.zuletzt;
      if (zl.f !== hd.el.style.fontSize) { zl.f = hd.el.style.fontSize; hd.el.style.setProperty('--hf', zl.f); }
      if (zl.p !== z.punkte) { zl.p = z.punkte; m.ePunkte.textContent = '⭐ ' + zahl(z.punkte); }
      const c = St.comboRest(z.combo, z.jetzt), ct = c.mult >= 1 ? 'Combo ×' + c.mult : '';
      const b = c.mult ? Math.round(c.rest / R.config.motoStunts.combo.fenster * 100) : 0;
      if (zl.c !== ct) { zl.c = ct; m.eCombo.textContent = ct; m.eCombo.classList.toggle('an', !!ct); m.eBalkenBox.classList.toggle('an', !!ct); m.eCombo.classList.toggle('gross', c.mult >= 2); }
      if (zl.b !== b) { zl.b = b; m.eBalken.style.width = b + '%'; }
      const live = z.wheelie.aktiv ? '🔥 Wheelie ' + Math.round(z.wheelie.meter) + ' m' : z.stoppie.aktiv ? '🔥 Stoppie ' + Math.round(z.stoppie.meter) + ' m' : '';
      if (zl.l !== live) { zl.l = live; m.eLive.textContent = live; m.eLive.classList.toggle('an', !!live); }
    });
  }

  /** Inhalt der Ergebnistafel (Stuntrennen): Rang nach Gesamtpunkten, Platz im Ziel, Platzpunkte, Stuntpunkte, Gesamt. */
  function ergebnisHtml(spiel, erg, zeilen) {
    const HEX = (c) => '#' + ('000000' + (c >>> 0).toString(16)).slice(-6);
    const k = R.config.motoStunts;
    const tr = zeilen.map((z) => {
      const farbe = z.auto ? HEX(z.auto.farbe) : '#888';
      const zeit = z.raus ? '🚪 raus' : z.zeit !== null && z.zeit !== undefined ? R.zeitText(z.zeit) : '<span class="noch">unterwegs</span>';
      return `<tr class="${z.istSpieler ? 'spieler p' + (z.spielerNr + 1) : 'computer'}${z.rang === 1 ? ' gesamt-spitze' : ''}">` +
        `<td class="platz">${z.rang}.</td><td class="name">${z.istSpieler ? '' : '🤖 '}${z.name}</td>` +
        `<td class="auto"><i style="background:${farbe}"></i>${z.auto ? z.auto.name : ''}</td>` +
        `<td class="zeit">${z.platz}. · ${zeit}</td>` +
        `<td class="punkte">${zahl(z.platzPunkte)}</td><td class="punkte">⭐ ${zahl(z.stuntPunkte)}</td><td class="punkte"><b>${zahl(z.gesamt)}</b></td></tr>`;
    }).join('');
    return `<h1>🏍️ Stuntrennen – Ergebnis</h1>` +
      `<table class="moto-erg"><thead><tr><th>Rang</th><th>Name</th><th>Motorrad</th><th>Im Ziel</th><th class="punkte">Platzpunkte</th><th class="punkte">Stuntpunkte</th><th class="punkte">Gesamt</th></tr></thead>` +
      `<tbody>${tr}</tbody></table>` +
      `<div class="welt-text" style="margin:.4em 0;opacity:.85">Platzpunkte: 1. ${zahl(k.platzpunkte[0])} · 2. ${zahl(k.platzpunkte[1])} · 3. ${zahl(k.platzpunkte[2])} · sonst ${zahl(k.platzRest)}</div>` +
      `<div class="knoepfe"><div class="knopf gruen" data-a="nochmal">🔄 Nochmal <kbd>Enter</kbd></div>` +
      `<div class="knopf blau" data-a="menue">🏠 Hauptmenü <kbd>Esc</kbd></div></div>`;
  }

  R.Moto.stuntHud = { anlegen, ereignis, frame, ergebnisHtml, stilEinbauen, zahl, STIL };
})();
