// ============================================================
// R4 – Auto-Stunt-Arena (nur Autorennen; offline). Eigenes Gegenstück zum Motorrad-Stunt-Park, ohne eine Zeile in src/moto/ anzufassen.
//   Strecke 'autoarena'   Stadion wie der Stunt-Park (zwei 360-m-Geraden, zwei Halbkreise R 100 m, 40 m breit, flach), auf Gerade 1 zwei Schanzen (8° / 12°),
//                         auf Gerade 2 die Halfpipe (spassZauber.js, pipeAuto: 250 m lang, Radius 7 m). Katalog-Eintrag mit stuntBereich: true und motoFelder: []
//                         (die leere Liste hält Trampolin/Kanone/Tore/Zufall/Geist fern – alle prüfen „motoFelder“).
//   Der Eintrag steht NICHT dauerhaft in R.trackCatalog (nicht in der Streckenwahl): nur während rennenStarten (Hülle unten), danach wieder weg.
//   Start             Menü, Schritt „Modus“: Karte „🎪 Stunt-Arena“ (spassMenue.js) → R.SpassModi-Handler 'arena': keine Gegner, kein Rennende (999 Runden), Polizei/Tiere/Verkehr aus.
//   Fahr-Zauber       wird für die Arena erzwungen (R.SpassZauber.erzwingen), sonst gäbe es keine Halfpipe – die Einstellung des Spielers bleibt unberührt.
// Rechenteil (R.SpassArena.eintrag / punkte) läuft auch ohne Browser (Tests); Menü und Hüllen nur mit R.Spiel / R.SpassModi / R.Menue.
// ============================================================
(function () {
  if (typeof window === 'undefined') return;
  const R = window.Rennspiel;
  if (!R || !R.config || R.SpassArena) return;

  R.config.arena = { id: 'autoarena', breite: 40, gerade: 360, radius: 100, runden: 999, schanzen: [{ s: 150, winkel: 8, laenge: 10 }, { s: 240, winkel: 12, laenge: 10 }] };
  const C = () => R.config.arena;

  /** Mittellinie (Stadion, wie motoM3Welt.parkPunkte): Start (0,0) → −z über die Gerade, rechter Halbkreis, zurück über die zweite Gerade, zweiter Halbkreis. */
  function punkte() {
    const c = C(), Ls = c.gerade, Rr = c.radius, p = [];
    for (let z = 0; z > -Ls; z -= 40) p.push([0, 0, Math.round(z * 10) / 10]);
    for (let i = 0; i < 12; i++) { const a = Math.PI + (i / 12) * Math.PI; p.push([Math.round((Rr + Rr * Math.cos(a)) * 10) / 10, 0, Math.round((-Ls + Rr * Math.sin(a)) * 10) / 10]); }
    for (let z = -Ls; z < 0; z += 40) p.push([2 * Rr, 0, Math.round(z * 10) / 10]);
    for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI; p.push([Math.round((Rr + Rr * Math.cos(a)) * 10) / 10, 0, Math.round((Rr * Math.sin(a)) * 10) / 10]); }
    return p;
  }
  const AUS = { hindernisse: false, wracks: false, strohballen: false, spuren: false, schanzen: false, baelle: false, wasserstrahlen: false, boost: false, schild: false, loopings: false, kleber: false, dinos: false };

  /** Katalogeintrag 'autoarena' (frisch erzeugt). s in m ab Start: Gerade 1 0–360, Bogen 360–674, Gerade 2 674–1034 (hier die Halfpipe 700–950), Bogen 1034–1348. */
  function eintrag() {
    const c = C();
    return {
      id: c.id, name: 'Stunt-Arena', emoji: '🎪', thema: 'wiese',
      beschreibung: 'Offene Spielwiese ohne Gegner: zwei Schanzen und eine lange Halfpipe zum Schaukeln und Springen.',
      schwierigkeit: 'leicht', breite: c.breite, randBreite: 1.5, zaunAbstand: 32, checkpointAbstand: 120, zielRundenzeit: 150,
      abseitsUntergrund: 'gras', weltStandard: 'klassisch', welten: { klassisch: Object.assign({}, AUS, { schanzen: true }) },
      huegel: [],
      schanzen: c.schanzen.map((x) => Object.assign({}, x)),
      stuntBereich: true,
      motoFelder: [],
      punkte: punkte(),
    };
  }
  R.SpassArena = { eintrag, punkte, id: () => C().id };

  // ------------------------------------------------------------ ab hier nur Browser/Spiel (nicht im Server)
  const P = R.Spiel && R.Spiel.prototype;
  if (!P || !R.SpassModi || typeof document === 'undefined') return;
  if (window.MOTORRAD === true) return;                         // Motorrad hat den Stunt-Park
  const SM = R.SpassModi;

  function stil() {
    if (document.getElementById('r4-arena-stil')) return;
    const s = document.createElement('style'); s.id = 'r4-arena-stil';
    s.textContent = 'body.r4-arena .hud-runde,body.r4-arena .hud-platz{display:none!important}';
    document.head.appendChild(s);
  }

  // Modus-Handler: Einstellungen (nur vorübergehend, spassModi sichert und stellt sie im Hauptmenü zurück)
  SM.registriere('arena', {
    einstellungen() {
      return { streckeId: C().id, welt: '', variante: '', gegner: 0, runden: R.config.rennen.rundenMax, polizei: false, tiere: false, krankenwagen: false, abschleppwagen: false, geisterfahrer: false, geist: false, spielart: 'rennen', spass: true, zufall: false };
    },
    start(spiel) {
      stil(); document.body.classList.add('r4-arena');
      if (spiel.rennen) spiel.rennen.runden = C().runden;       // kein Rennende (die Einstellung erlaubt höchstens 10)
      spiel.s4.arena = { max: 0 };
    },
    bild(spiel) {
      const r = spiel.rennen;
      if (!r || spiel.zustand !== 'rennen') { SM.hudWeg(); return; }
      let m = 0;
      (spiel.fahrzeuge || []).forEach((f) => { if (f.istSpieler && f.flug && f.flug.z && f.flug.z.pipeMax > m) m = f.flug.z.pipeMax; });
      const a = spiel.s4 && spiel.s4.arena; if (a && m > a.max) a.max = m;
      SM.hud('🎪 <b>Stunt-Arena</b><small>Halfpipe: seitlich lenken, hochschaukeln, in der Luft Tricks · höchster Punkt <b>' + (a ? a.max.toFixed(1) : '0.0') + ' m</b></small>');
    },
    aufraeumen() { try { document.body.classList.remove('r4-arena'); } catch (e) { /* egal */ } },
  });

  // Hülle um rennenStarten (außen): Eintrag nur für die Dauer des Starts im Katalog, Fahr-Zauber erzwingen
  const rennenStarten = P.rennenStarten;
  P.rennenStarten = function () {
    const m = this._s4Modus;
    if (!m || m.art !== 'arena') return rennenStarten.apply(this, arguments);
    const kat = R.trackCatalog, e = eintrag(), schonDa = kat.some((t) => t.id === e.id), SZ = R.SpassZauber;
    if (!schonDa) kat.push(e);
    if (SZ && SZ.erzwingen) SZ.erzwingen(true);
    try { return rennenStarten.apply(this, arguments); }
    finally {
      if (SZ && SZ.erzwingen) SZ.erzwingen(false);
      if (!schonDa) { const i = kat.indexOf(e); if (i >= 0) kat.splice(i, 1); }
    }
  };

  // Menü: im Streckenschritt nur die feste Arena zeigen, Gegner-/Runden-Zeilen weg
  if (R.Menue) {
    const M = R.Menue.prototype, istArena = (m) => !!(m.e && m.e.spassModus === 'arena' && !m.onlineGewaehlt);
    const htmlStrecke = M.htmlStrecke;
    M.htmlStrecke = function () {
      if (!istArena(this)) return htmlStrecke.apply(this, arguments);
      return '<div class="reihe strecken"><div class="karte strecke t-wiese gewaehlt"><div class="strecken-bild" style="background:linear-gradient(180deg,#8fc8ff 0%,#8fc8ff 35%,#7ed957 35%,#3a8f2f 100%)"><div class="strasse"></div></div>' +
        '<div class="karten-name">🎪 Stunt-Arena</div><div class="karten-sub">Feste Strecke ohne Gegner und ohne Ende: zwei Schanzen und eine lange Halfpipe.</div></div></div>';
    };
    const zeilen = M.zeilen;
    if (zeilen) M.zeilen = function () {
      const z = zeilen.apply(this, arguments);
      return istArena(this) ? z.filter((k) => k !== 'runden' && k !== 'gegner' && k !== 'schwierigkeit') : z;
    };
    const zeichnen = M.zeichnen;
    M.zeichnen = function () {
      const r = zeichnen.apply(this, arguments);
      try {
        if (istArena(this)) this.wurzel.querySelectorAll('[data-a^="stepper:runden:"], [data-a^="stepper:gegner:"], [data-a^="wert:schwierigkeit:"], [data-a^="fokus:"][data-a$=":schwierigkeit"]').forEach((el) => { const zl = el.closest('.zeile'); if (zl) zl.style.display = 'none'; });
      } catch (err) { /* nur Optik */ }
      return r;
    };
    const htmlStart = M.htmlStart;
    M.htmlStart = function () {
      let h = htmlStart.apply(this, arguments);
      try {
        if (istArena(this)) h = h.replace('<div class="m-spalten"', '<div class="m-modushinweis">🎪 <b>Stunt-Arena:</b> keine Gegner, kein Rennende – spring über die Schanzen und schaukel dich in der Halfpipe hoch.</div><div class="m-spalten"');
      } catch (err) { console.error('R4 (Arena-Hinweis):', err); }
      return h;
    };
  }
})();
