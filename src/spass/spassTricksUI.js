// ============================================================
// Spaß-Paket S3 – Oberfläche, Zeitlupe, Kamera, Sticker, Online-Anbindung der neuen Tricks (nur Browser; läuft ganz am Ende, alles Umhüllungen):
//   Menü (R.Menue)        Pillen „🤸 Auto-Tricks“ (nur Autorennen) und „🎬 Zeitlupe“ im Spaß-Streifen (Fokus-Zeilen 'autoTricks' / 'zeitlupe', Standard an) + Zeile „Tricks“ in der Steuerungs-Tafel
//   Spiel.spassGrosserSprung    (von spassTricks.js gerufen, offline) Zeitlupe (Anzeige-Zeit ×0,4 für ~1 s, Physik-Takt bleibt gleich: nur weniger Schritte je Sekunde) + Kamera-Schwenk
//   Spiel._frameRumpf           umhüllt: dehnt die Zeit des Bildes (dt × Faktor); die Physik rechnet in festen Schritten – deterministisch, nur langsamer abgespielt
//   FahrzeugKamera.update       umhüllt: Kamera schwenkt seitlich um das springende Fahrzeug (auch ohne Zeitlupe-Zeit: online nur dieser Schwenk)
//   Spiel.spassTrickEreignis / spassTrickSticker / spassTrickWackeln    Meldung, Sticker, Kamerawackeln
//   Motorrad online (R.Moto.online.zustand/ereignis)   Trick-Pose aus zustand.mo[i][13..14], Sticker aus Stunt-Ereignissen, Kamera-Schwenk bei langer Flugzeit (keine Zeitlupe online)
//   Touch-Knopf 🌀 (Auto)       Trick-Taste für Handy/Tablet
// ============================================================
(function () {
  const R = window.Rennspiel;
  if (!R || !R.Spiel || !R.SpassTricks) return;
  const P = R.Spiel.prototype, ST = R.SpassTricks, SK = R.SpassSticker;
  const moto = () => window.MOTORRAD === true;
  const spielName = () => (moto() ? 'motorrad' : 'auto');
  const C = () => R.config.spass.tricks;
  const klemme = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
  const glatt = ST.glatt;

  // ---------- Sticker ----------
  function sticker(name, d) {
    if (R.Spass && typeof R.Spass.sticker === 'function') return R.Spass.sticker(name, d);
    return SK ? SK.ereignis(spielName(), name, d) : [];
  }
  const STICKER_ART = { superman: 'superman', handstand: 'handstand', backflip: 'backflip', fassrolle: 'fassrolle' };
  P.spassTrickSticker = function (i, art) {
    const f = this.fahrzeuge[i];
    if (!f || !f.istSpieler) return;
    if (STICKER_ART[art]) sticker(STICKER_ART[art]);
  };

  // ---------- Auto: Meldung, Wackeln ----------
  P.spassTrickEreignis = function (i, ev) {
    const f = this.fahrzeuge[i];
    if (!f || !f.istSpieler) return;
    let text = ev.name + ' +' + ev.punkte;
    if (ev.mult > 1) text += ' ×' + ev.mult;
    text += '\n⭐ ' + ev.gesamt + ' Trickpunkte';
    this._meldung(i, text, 1500);
    const v = f.vehicle, k = this.spassKonfetti;
    if (k) k.burst(v.x, v.y + 1.5, v.z, 18 + 8 * Math.min(4, ev.mult));
    if (ev.mult >= 3 && R.SpassStimme) { try { R.SpassStimme.jubeln(); } catch (e) { /* Ton egal */ } }
  };
  P.spassTrickWackeln = function (i) {
    const f = this.fahrzeuge[i];
    if (!f || !f.istSpieler) return;
    this._meldung(i, 'Wackel! 😬', 1000);
    this.kameras.forEach((c) => { if (c.ziel === f.vehicle) c.wackeln(3); });
    if (R.Audio && R.Audio.kollision) { try { R.Audio.kollision(4); } catch (e) { /* Ton egal */ } }
  };

  // ---------- Zeitlupe ----------
  const ZL = { start: false, t0: null, aktiv: false, faktor: 1, i: -1 };
  /** Zeitfaktor (1 = normal) bei echter Zeit tr (s) seit dem Start: weich auf `faktor`, halten, weich zurück; danach null (zu Ende). */
  function zlFaktor(tr, c) {
    c = c || C().zeitlupe;
    if (tr < 0 || tr >= c.dauer) return tr >= c.dauer ? null : 1;
    const ein = glatt(tr / c.ein), aus = glatt((c.dauer - tr) / c.aus);
    return 1 - (1 - c.faktor) * Math.min(ein, aus);
  }
  const offline = (sp) => sp.zustand === 'rennen' && !sp.online;
  P.spassGrosserSprung = function (i /* , rest0 */) {
    const f = this.fahrzeuge[i];
    if (!f || !f.istSpieler || !ST.an('zeit') || !offline(this)) return;
    ZL.start = true; ZL.t0 = null; ZL.i = i;
    schwenkStart(this, i);
    this._meldung(i, '🎬 Zeitlupe!', 900);
    sticker('zeitlupe');
  };
  const rumpf = P._frameRumpf;
  if (rumpf && !P._spassZeitlupe) {
    P._spassZeitlupe = true;
    P._frameRumpf = function (jetzt) {
      if (!ZL.start && !ZL.aktiv) return rumpf.apply(this, arguments);
      if (this.zustand !== 'rennen' || this.pausiert || !this.uhr || typeof jetzt !== 'number') { ZL.start = false; ZL.aktiv = false; return rumpf.apply(this, arguments); }
      if (ZL.start) { ZL.start = false; ZL.aktiv = true; ZL.t0 = jetzt; }
      const f = zlFaktor((jetzt - ZL.t0) / 1000);
      if (f === null) { ZL.aktiv = false; ZL.faktor = 1; return rumpf.apply(this, arguments); }
      ZL.faktor = f;
      const real = jetzt - this.uhr.letzte;
      if (!(real > 0) || real > 250 || f >= 0.999) return rumpf.apply(this, arguments);
      const r = rumpf.call(this, this.uhr.letzte + real * f);          // das Bild sieht nur dt × Faktor: weniger Physik-Schritte je Sekunde, jeder Schritt bleibt gleich groß
      this.uhr.letzte = jetzt;                                          // echte Uhr weiter
      return r;
    };
  }

  // ---------- Kamera-Schwenk ----------
  const SW = { aktiv: false, t0: 0, i: -1, seite: 1, dauer: 1.5 };
  function jetztMs() { return (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now(); }
  function schwenkStart(spiel, i) {
    if (!ST.an('zeit')) return;
    SW.aktiv = true; SW.t0 = jetztMs(); SW.i = i; SW.seite = -SW.seite; SW.dauer = C().zeitlupe.schwenk.dauer;
    SW.spiel = spiel;
  }
  const KAM = R.FahrzeugKamera && R.FahrzeugKamera.prototype;
  if (KAM && !KAM._spassSchwenk) {
    KAM._spassSchwenk = true;
    const upd = KAM.update;
    KAM.update = function (dt) {
      let aktiv = false, sp = null, f = null;
      try {
        sp = R.spiel;
        if (SW.aktiv && sp && sp.fahrzeuge && this.ziel) {
          if ((jetztMs() - SW.t0) / 1000 >= SW.dauer) SW.aktiv = false;
          else { f = sp.fahrzeuge[SW.i]; aktiv = !!(f && f.vehicle === this.ziel); }
        }
        // Cockpit: für den Schwenk kurz auf die Verfolger-Ansicht (sonst sähe man nur das Innere)
        const idx = R.config.kamera.modi.indexOf('verfolger');
        if (aktiv && this.modus === 'cockpit' && this._spassSwAlt === undefined && idx >= 0) { this._spassSwAlt = this.modusIndex; this.modusIndex = idx; this._erstesMal = true; }
        else if (!aktiv && this._spassSwAlt !== undefined) { this.modusIndex = this._spassSwAlt; this._spassSwAlt = undefined; this._erstesMal = true; }
      } catch (e) { aktiv = false; }
      const r = upd.apply(this, arguments);
      if (aktiv && this.modus !== 'cockpit') {
        try {
          const c = C().zeitlupe.schwenk, u = klemme((jetztMs() - SW.t0) / 1000 / SW.dauer, 0, 1), g = glatt(u / 0.3) * glatt((1 - u) / 0.35);
          if (g > 0.001) {
            const v = f.vehicle, cam = this.kamera, ang = c.winkel * g * SW.seite;
            let dx = cam.position.x - v.x, dz = cam.position.z - v.z;
            const len = Math.hypot(dx, dz) || 1, ca = Math.cos(ang), sa = Math.sin(ang);
            const nx = dx * ca - dz * sa, nz = dx * sa + dz * ca, L = len + (c.abstand - len) * g;
            cam.position.x = v.x + nx / len * L; cam.position.z = v.z + nz / len * L;
            cam.position.y += (v.y + c.hoehe - cam.position.y) * g;
            cam.lookAt(v.x, v.y + 0.8, v.z);
          }
        } catch (e) { /* Kamera darf nie ausfallen */ }
      }
      return r;
    };
  }

  // ---------- Menü ----------
  function stil() {
    if (typeof document === 'undefined' || document.getElementById('spass-tricks-stil')) return;
    const s = document.createElement('style');
    s.id = 'spass-tricks-stil';
    s.textContent = '#touch .tricks-touch{right:calc(var(--rand)*2 + var(--tb)*1.9);bottom:calc(var(--rand)*2 + var(--tb)*.2);width:calc(var(--tb)*.85);height:calc(var(--tb)*.85);font-size:calc(var(--tb)*.4);background:rgba(120,200,255,.45);border-color:#fff}' +
      '#touch .tricks-touch.an{background:rgba(255,138,26,.85)}' +
      '.m-spass{gap:.25em .5em!important;font-size:.78em!important}.m-spass .gr{padding:.1em .3em!important;gap:.2em!important}';
    document.head.appendChild(s);
  }
  if (R.Menue) {
    const M = R.Menue.prototype;
    const zeilen = M.zeilen;
    M.zeilen = function () { const z = zeilen.apply(this, arguments), i = z.indexOf('start'); z.splice(i < 0 ? z.length : i, 0, ...(moto() ? ['zeitlupe'] : ['autoTricks', 'zeitlupe'])); return z; };
    const zeilenWert = M.zeilenWert;
    M.zeilenWert = function (zeile, dx) {
      if (zeile === 'autoTricks' || zeile === 'zeitlupe') { if (dx) this.wertSetzen(zeile, dx > 0 ? 'an' : 'aus'); return; }
      return zeilenWert.apply(this, arguments);
    };
    const wertSetzen = M.wertSetzen;
    M.wertSetzen = function (zeile, k) {
      if (zeile === 'autoTricks') { ST.anSetzen('auto', k === 'an'); this.e.autoTricks = k === 'an'; return; }
      if (zeile === 'zeitlupe') { ST.anSetzen('zeit', k === 'an'); this.e.zeitlupe = k === 'an'; return; }
      return wertSetzen.apply(this, arguments);
    };
    const htmlStart = M.htmlStart;
    M.htmlStart = function () {
      let h = htmlStart.apply(this, arguments);
      try {
        stil();
        const z = this.zeilen(), gf = z[this.fokus];
        const gr = (zeile, art, label, titel) => {
          const an = ST.an(art);
          return `<span class="gr${gf === zeile ? ' fokus' : ''}" title="${titel}"><span class="z-label" data-a="fokus:${z.indexOf(zeile)}">${label}</span>` +
            `<span class="pille${an ? '' : ' aktiv'}" data-a="wert:${zeile}:aus">Aus</span><span class="pille${an ? ' aktiv' : ''}" data-a="wert:${zeile}:an">An</span></span>`;
        };
        let teil = '';
        if (!moto()) teil += gr('autoTricks', 'auto', '🤸 Auto-Tricks', 'In der Luft Fassrolle und Schraube (Umschalt-Taste) – Aus: Autos fliegen wie früher');
        teil += gr('zeitlupe', 'zeit', '🎬 Zeitlupe', 'Bei großen Sprüngen kurz Zeitlupe und Kamera-Schwenk – Aus: wie früher');
        h = h.replace('<span class="knopf klein" data-a="album"', teil + '<span class="knopf klein" data-a="album"');
        const tz = moto()
          ? `<div class="t-zeile"><b>Tricks</b><span>In der Luft <kbd>⇧ rechts</kbd>${this.zwei ? ' (②: <kbd>⇧ links</kbd>)' : ''} + <kbd>↓</kbd> Backflip · <kbd>↑</kbd> Superman · <kbd>←</kbd><kbd>→</kbd> Handstand</span></div>`
          : `<div class="t-zeile"><b>Tricks</b><span>In der Luft <kbd>⇧ rechts</kbd>${this.zwei ? ' (②: <kbd>⇧ links</kbd>)' : ''} Fassrolle · + <kbd>↑</kbd>/<kbd>↓</kbd> Schraube</span></div>`;
        h = h.replace('<div class="t-zeile"><b>Alle</b>', tz + '<div class="t-zeile"><b>Alle</b>');
      } catch (err) { console.error('Tricks (Menü):', err); }
      return h;
    };
  }

  // ---------- Auto: Touch-Knopf für die Trick-Taste ----------
  function touchKnopf(spiel) {
    if (moto() || typeof document === 'undefined') return;
    const wurzel = document.getElementById('touch');
    if (!wurzel || wurzel.querySelector('.tricks-touch')) return;
    stil();
    const k = document.createElement('div');
    k.className = 't-knopf klein tricks-touch';
    k.innerHTML = '<span>🌀</span>';
    k.title = 'Trick in der Luft: Fassrolle (mit ▲/▼: Schraube)';
    wurzel.appendChild(k);
    const code = () => C().taste[0];
    k.addEventListener('pointerdown', (e) => {
      e.preventDefault(); k.classList.add('an');
      const inp = (R.spiel || spiel).input; if (inp) { inp.gedrueckt.add(code()); inp.geradeGedrueckt.add(code()); }
      const I = ST._intern; if (I) I.ZAEHL[code()] = (I.ZAEHL[code()] || 0) + 1;
      try { k.setPointerCapture(e.pointerId); } catch (err) { /* egal */ }
    });
    const hoch = () => { k.classList.remove('an'); const inp = (R.spiel || spiel).input; if (inp) inp.gedrueckt.delete(code()); };
    k.addEventListener('pointerup', hoch); k.addEventListener('pointercancel', hoch);
  }
  const rennenStarten = P.rennenStarten;
  P.rennenStarten = function () {
    const r = rennenStarten.apply(this, arguments);
    try { ZL.start = false; ZL.aktiv = false; SW.aktiv = false; this._t3 = null; this._tricksZeit = 0; touchKnopf(this); } catch (e) { console.error('Tricks (Start):', e); }
    return r;
  };

  // ---------- Motorrad online ----------
  const MO = R.Moto && R.Moto.online;
  if (MO && !MO._tricks3) {
    MO._tricks3 = true;
    const zustand = MO.zustand;
    MO.zustand = function (ui, z) {
      const r = zustand.apply(this, arguments);
      try {
        const spiel = ui.spiel, K = ui._mo;
        if (K && z.mo && spiel.stunt) {
          for (let i = 0; i < K.nT && i < z.mo.length; i++) {
            const a = z.mo[i], zs = spiel.stunt.fz[i];
            if (!a || !zs) continue;
            const code = a[13] | 0, p = +a[14] || 0, art = code === 1 ? 'superman' : code === 2 ? 'handstand' : null;
            if (art) { const n = zs.neuPoseZiel || (zs.neuPoseZiel = { art, w: 0, p: 0, wAnz: 0 }); n.art = art; n.p = p; n.w = ST.gewicht(p); }
            else if (zs.neuPoseZiel) { zs.neuPoseZiel.w = 0; }
          }
          // Kamera-Schwenk bei langer Flugzeit (online keine Zeitlupe)
          const mine = z.mo[K.du], luft = !!(mine && (mine[6] & 128));
          if (luft) {
            if (!K.luftSeit) K.luftSeit = jetztMs();
            else if (!K.schwenkGetan && (jetztMs() - K.luftSeit) / 1000 >= C().zeitlupe.onlineMinLuft) { K.schwenkGetan = true; schwenkStart(spiel, K.du); }
          } else { K.luftSeit = 0; K.schwenkGetan = false; }
        }
      } catch (e) { console.error('Tricks (online Zustand):', e); }
      return r;
    };
    const ereignis = MO.ereignis;
    MO.ereignis = function (ui, m) {
      const r = ereignis.apply(this, arguments);
      try {
        const K = ui._mo;
        if (K && m && m.art === 'stunt' && m.nr === K.du && STICKER_ART[m.st]) sticker(STICKER_ART[m.st]);
      } catch (e) { /* Sticker egal */ }
      return r;
    };
  }

  ST.ui = { zlFaktor, schwenkStart, touchKnopf, ZL, SW, sticker };
})();
