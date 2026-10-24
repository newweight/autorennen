// ============================================================
// Motorrad-Stunts (Stufe M2) – Anzeige: Stuntpunkte + Combo oben im HUD, große Einblendungen („Salto! +400"), Ergebnistafel beim Stuntrennen.
// Reine DOM-Anzeige, hängt eigene Elemente an die vorhandenen HUD-Wurzeln (Hud.el); styles.css bleibt unverändert (Stil inline/per <style>).
// Im Zweispieler hat jede Bildhälfte ihr eigenes Feld. Aufruf aus stuntStart.js:
//   anlegen(spiel)            nach dem Rennstart: Felder in jedes HUD
//   ereignis(spiel, i, e)     Stunt von Fahrzeug i (nur Spieler zeigen es an)
//   frame(spiel)              je Bild: Punkte, Combo-Balken, Live-Anzeige (Wheelie/Stoppie)
//   ergebnisHtml(spiel, erg)  Inhalt der Ergebnistafel (Stuntrennen), sortiert nach Gesamtpunkten
// ============================================================
window.Rennspiel = window.Rennspiel || {};

(function () {
  const R = window.Rennspiel;
  R.Moto = R.Moto || {};

  const STIL = `
.moto-stunt { position: absolute; left: 50%; top: 6.6em; transform: translateX(-50%); min-width: 9em; text-align: center; pointer-events: none;
  background: rgba(14,24,58,.7); border: .15em solid rgba(255,255,255,.3); border-radius: .8em; padding: .25em .9em .3em; white-space: nowrap; }
.hud.links .moto-stunt, .hud.rechts .moto-stunt { left: .5em; top: 6.3em; transform: none; min-width: 7.5em; padding: .15em .6em .2em; }
.hud.links .moto-stunt .ms-punkte, .hud.rechts .moto-stunt .ms-punkte { font-size: 1.35em; }
.hud.links .moto-pop, .hud.rechts .moto-pop { font-size: 1.9em; }
.moto-stunt .ms-punkte { font-size: 1.7em; color: #ffd23a; line-height: 1.1; }
.moto-stunt .ms-combo { display: block; font-size: 1.15em; color: #ff8a1a; min-height: 1.2em; }
.moto-stunt .ms-balken { display: block; height: .3em; margin-top: .15em; border-radius: .15em; background: rgba(255,255,255,.18); overflow: hidden; }
.moto-stunt .ms-balken b { display: block; height: 100%; width: 0; background: linear-gradient(90deg, #ff8a1a, #ffd23a); }
.moto-stunt .ms-live { display: block; font-size: 1.05em; color: #7fe3ff; min-height: 1.2em; }
.moto-popups { position: absolute; left: 0; right: 0; top: 24%; display: flex; flex-direction: column; align-items: center; gap: .15em; pointer-events: none; }
.moto-pop { font-size: 2.7em; font-weight: 900; color: #fff; white-space: nowrap; padding: .05em .6em; border-radius: .6em; border: .06em solid #fff;
  background: linear-gradient(90deg, #ff7a00, #ffb000); text-shadow: 0 .06em .12em rgba(0,0,0,.6); opacity: 0; transform: scale(.5) translateY(.6em);
  transition: opacity .15s, transform .25s cubic-bezier(.3,1.6,.6,1); }
.moto-pop.an { opacity: 1; transform: scale(1) translateY(0); }
.moto-pop.weg { opacity: 0; transform: scale(1) translateY(-1.2em); transition: opacity .4s, transform .5s; }
.moto-pop.ring { background: linear-gradient(90deg, #ff3b00, #ff9a00); }
.moto-pop.voll { background: linear-gradient(90deg, #ff2d6f, #ffb000); font-size: 3.1em; }
.moto-pop.bus { background: linear-gradient(90deg, #1c5fd0, #2f8bff); }
.moto-pop.zone { background: linear-gradient(90deg, #0f8f5a, #2fcf8a); }
.moto-pop small { font-size: .55em; opacity: .9; margin-left: .4em; }
.moto-touch { right: var(--rand); bottom: calc(var(--rand) * 2 + var(--tb) * 1.15 + 6px); width: calc(var(--tb) * .95); height: calc(var(--tb) * .95); font-size: calc(var(--tb) * .5);
  background: rgba(255,138,26,.38); border-color: rgba(255,230,190,.9); }
.moto-touch.an { background: rgba(255,138,26,.8); }
.ergebnis .moto-erg td.punkte, .ergebnis .moto-erg th.punkte { text-align: right; }
.ergebnis .moto-erg tr.gesamt-spitze td { font-weight: 900; }
`;
  let stilDa = false;
  function stilEinbauen() {
    if (stilDa || typeof document === 'undefined') return;
    const st = document.createElement('style');
    st.textContent = STIL;
    document.head.appendChild(st);
    stilDa = true;
  }

  const zahl = (n) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');

  /** Felder in jedes HUD hängen. */
  function anlegen(spiel) {
    stilEinbauen();
    (spiel.huds || []).forEach((hd) => {
      if (!hd || !hd.el || hd._motoStunt) return;
      const wrap = document.createElement('div');
      wrap.className = 'moto-stunt';
      wrap.innerHTML = '<span class="ms-punkte">⭐ 0</span><span class="ms-combo"></span><span class="ms-balken"><b></b></span><span class="ms-live"></span>';
      const pops = document.createElement('div');
      pops.className = 'moto-popups';
      hd.el.appendChild(wrap); hd.el.appendChild(pops);
      hd._motoStunt = { wrap, pops, ePunkte: wrap.querySelector('.ms-punkte'), eCombo: wrap.querySelector('.ms-combo'), eBalken: wrap.querySelector('.ms-balken b'),
        eLive: wrap.querySelector('.ms-live'), zuletzt: { p: -1, c: '', b: -1, l: '' } };
    });
  }

  function hudFuer(spiel, fi) {
    const f = spiel.fahrzeuge[fi];
    if (!f || !f.istSpieler) return null;
    return (spiel.huds || []).find((hd) => hd && hd.nr === f.spielerNr && hd._motoStunt) || null;
  }

  /** Große Einblendung für einen Stunt. */
  function ereignis(spiel, fi, e) {
    const hd = hudFuer(spiel, fi);
    if (!hd) return;
    const m = hd._motoStunt;
    let text = e.name + ' +' + zahl(e.punkte), klein = '';
    if (e.art === 'bus') text = 'Bus-Sprung! +' + zahl(e.punkte), klein = e.n + ' × ' + R.config.motoStunts.punkte.busProFahrzeug;
    else if (e.art === 'wheelie' || e.art === 'stoppie') klein = e.meter + ' m';
    if (e.mult > 1) klein += (klein ? ' · ' : '') + '×' + e.mult;
    const klasse = e.art === 'volltreffer' ? 'voll' : e.art === 'feuerring' ? 'ring' : e.art === 'bus' ? 'bus' : (e.art === 'wheelie' || e.art === 'stoppie') ? 'zone' : '';
    const el = document.createElement('div');
    el.className = 'moto-pop ' + klasse;
    el.textContent = text;
    if (klein) { const s = document.createElement('small'); s.textContent = klein; el.appendChild(s); }
    m.pops.appendChild(el);
    while (m.pops.children.length > 3) m.pops.removeChild(m.pops.firstChild);
    requestAnimationFrame(() => requestAnimationFrame(() => { el.classList.add('an'); }));
    setTimeout(() => { el.classList.remove('an'); el.classList.add('weg'); }, 1300);
    setTimeout(() => { if (el.parentNode) el.parentNode.removeChild(el); }, 1900);
  }

  /** Punkte, Combo und Live-Anzeige aktualisieren. */
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
      if (zl.p !== z.punkte) { zl.p = z.punkte; m.ePunkte.textContent = '⭐ ' + zahl(z.punkte); }
      const c = St.comboRest(z.combo, z.jetzt), ct = c.mult > 1 ? 'Combo ×' + c.mult : (c.mult === 1 ? 'Combo… (' + c.rest.toFixed(1) + ' s)' : '');
      const b = c.mult ? Math.round(c.rest / R.config.motoStunts.combo.fenster * 100) : 0;
      if (zl.c !== ct) { zl.c = ct; m.eCombo.textContent = ct; }
      if (zl.b !== b) { zl.b = b; m.eBalken.style.width = b + '%'; }
      const live = z.wheelie.aktiv ? '🔥 Wheelie ' + Math.round(z.wheelie.meter) + ' m' : z.stoppie.aktiv ? '🔥 Stoppie ' + Math.round(z.stoppie.meter) + ' m' : '';
      if (zl.l !== live) { zl.l = live; m.eLive.textContent = live; }
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
