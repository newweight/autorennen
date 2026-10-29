// ============================================================
// Spaß-Paket S1 – Verdrahtung im Rennen (Autorennen UND Motorrad; läuft ganz am Ende, alles Umhüllungen zur Laufzeit):
//   Spiel.streckeSzeneBauen  umhüllt: Trampolin/Kanone (R.SpassWelt.bauen) und Konfetti in die Szene
//   Spiel.rennenStarten      umhüllt: Zustand je Rennen (spiel.spass): Geist (nur offline, Solo, Schalter 👻), Zähler für Sticker, Hupe-Tasten
//   Spiel.physikSchritt      umhüllt: Geist aufzeichnen/abspielen, Sticker (Ziel, Münzen, Stunts), Jubel (Ziel, großer Sprung/Stunt)
//   Spiel.spassEreignis      neu (von spassPhysik.js gerufen): Trampolin/Kanone → Meldung, Konfetti, Ton, Kamerawackeln, Sticker
//   Spiel._flugEreignis      umhüllt: Landung nach langem Flug → Jubel, Sticker
//   Spiel.hupen(spielerNr)   Hupe (Taste/Touch), nur lokal hörbar
//   R.dach.frame             umhüllt: Konfetti-Bewegung, Geist-Pose je Bild
// Hupe-Tasten: Spieler 1 (Pfeile) „-“ (Slash), allein auch Q; Spieler 2 (WASD) Q. Touch: Knopf 📯.
// ============================================================
(function () {
  const R = window.Rennspiel;
  if (!R || !R.Spiel || !R.Spass || !R.SpassStimme || !R.SpassSticker || !R.SpassGeist) return;
  const P = R.Spiel.prototype, St = R.SpassStimme, SK = R.SpassSticker, GE = R.SpassGeist;
  const spielName = () => (window.MOTORRAD === true ? 'motorrad' : 'auto');
  const HUPE = { 0: ['Slash'], 1: ['KeyQ'] };
  R.config.spass.tasten = HUPE;
  R.config.spass.tasteAllein = 'KeyQ';

  // ---------- Szene ----------
  function loesen(g) {
    if (!g) return;
    if (g.parent) g.parent.remove(g);
    g.traverse((c) => { if (c.geometry) c.geometry.dispose(); if (c.material) { const m = Array.isArray(c.material) ? c.material : [c.material]; m.forEach((x) => x.dispose()); } });
  }
  const streckeSzeneBauen = P.streckeSzeneBauen;
  P.streckeSzeneBauen = function () {
    const r = streckeSzeneBauen.apply(this, arguments);
    try {
      loesen(this.spassGruppe); loesen(this.spassKonfetti && this.spassKonfetti.punkte); loesen(this.spassGeistMesh);
      this.spassGruppe = null; this.spassKonfetti = null; this.spassGeistMesh = null;
      if (this.strecke && this.szene && R.SpassWelt) {
        if (this.strecke.spass && this.strecke.spass.liste.length) { this.spassGruppe = R.SpassWelt.bauen(this.strecke); this.szene.add(this.spassGruppe); }
        this.spassKonfetti = R.SpassWelt.konfetti(this.szene);
      }
    } catch (e) { console.error('Spaß (Szene):', e); }
    return r;
  };

  // ---------- Toast „Neuer Sticker!“ ----------
  const toasts = [];
  let toastLaeuft = false;
  function toastStil() {
    if (typeof document === 'undefined' || document.getElementById('spass-stil')) return;
    const s = document.createElement('style');
    s.id = 'spass-stil';
    s.textContent = '.spass-toast{position:fixed;left:50%;top:14%;transform:translateX(-50%) scale(.6);z-index:300;pointer-events:none;opacity:0;background:linear-gradient(#fff6c8,#ffd23a);color:#2a2f6b;' +
      'border:.18em solid #fff;border-radius:1.2em;padding:.5em 1.1em;text-align:center;font:900 clamp(18px,3.2vh,32px)/1.15 Arial,sans-serif;box-shadow:0 .3em 1em rgba(0,0,0,.45);transition:all .35s cubic-bezier(.2,1.6,.4,1)}' +
      '.spass-toast.an{opacity:1;transform:translateX(-50%) scale(1)}.spass-toast b{display:block;font-size:2.4em;line-height:1.1}.spass-toast small{display:block;font-weight:800;opacity:.8}';
    document.head.appendChild(s);
  }
  function toastZeigen(st) {
    toasts.push(st);
    if (toastLaeuft) return;
    toastLaeuft = true;
    const weiter = () => {
      const n = toasts.shift();
      if (!n) { toastLaeuft = false; return; }
      const d = document.createElement('div');
      d.className = 'spass-toast';
      d.innerHTML = `<small>Neuer Sticker! 🎉</small><b>${n.emoji}</b>${n.name}`;
      document.body.appendChild(d);
      setTimeout(() => d.classList.add('an'), 30);
      setTimeout(() => d.classList.remove('an'), 2700);
      setTimeout(() => { d.remove(); weiter(); }, 3100);
    };
    weiter();
  }
  /** Ereignis an das Sticker-Album melden; neue Sticker werden eingeblendet. */
  function sticker(name, d) {
    try {
      const neu = SK.ereignis(spielName(), name, d);
      if (neu.length && typeof document !== 'undefined') { toastStil(); neu.forEach(toastZeigen); if (R.Audio && R.Audio.runde) try { R.Audio.runde(); } catch (e) { /* egal */ } }
      return neu;
    } catch (e) { return []; }
  }
  P.spassSticker = function (name, d) { return sticker(name, d); };
  R.Spass.sticker = sticker;

  // ---------- Hupe ----------
  P.hupen = function (nr) {
    const f = (this.fahrzeuge || []).find((x) => x.istSpieler && x.spielerNr === (nr || 0));
    if (!f || f.ausgeschieden) return false;
    const ok = St.hupen();
    if (ok) sticker('hupe');
    return ok;
  };
  function hupeTaste(spiel, code) {
    if (!spiel || (spiel.zustand !== 'rennen' && spiel.zustand !== 'online') || spiel.pausiert) return;
    const zwei = (spiel.fahrzeuge || []).filter((f) => f.istSpieler).length > 1;
    if (HUPE[0].includes(code) || (!zwei && code === R.config.spass.tasteAllein)) return spiel.hupen(0);
    if (zwei && HUPE[1].includes(code)) return spiel.hupen(1);
    if (!zwei && HUPE[1].includes(code)) return spiel.hupen(0);
  }
  let tasteGebunden = false;
  function tastenBinden() {
    if (tasteGebunden || typeof window === 'undefined') return;
    tasteGebunden = true;
    window.addEventListener('keydown', (e) => {
      if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
      const c = e.code;
      if (c !== 'Slash' && c !== 'KeyQ') return;
      try { hupeTaste(R.spiel, c); } catch (err) { /* egal */ }
    });
  }
  function tastenFreigeben(spiel) {
    if (spiel.input && spiel.input.spielTasten) ['Slash', 'KeyQ'].forEach((c) => spiel.input.spielTasten.add(c));
  }

  // ---------- Touch-Knopf 📯 ----------
  function touchKnopf(spiel) {
    if (typeof document === 'undefined') return;
    const wurzel = document.getElementById('touch');
    if (!wurzel || wurzel.querySelector('.spass-touch')) return;
    if (!document.getElementById('spass-touch-stil')) {
      const s = document.createElement('style'); s.id = 'spass-touch-stil';
      s.textContent = '#touch .spass-touch{left:var(--rand);bottom:calc(var(--rand)*2 + var(--tb) + 8px);width:calc(var(--tb)*.85);height:calc(var(--tb)*.85);font-size:calc(var(--tb)*.42);background:rgba(255,210,58,.45);border-color:#fff}' +
        '#touch .spass-touch.an{background:rgba(255,138,26,.85)}';
      document.head.appendChild(s);
    }
    const k = document.createElement('div');
    k.className = 't-knopf klein spass-touch';
    k.textContent = '📯';
    k.title = 'Hupe';
    wurzel.appendChild(k);
    k.addEventListener('pointerdown', (e) => { e.preventDefault(); k.classList.add('an'); (R.spiel || spiel).hupen(0); try { k.setPointerCapture(e.pointerId); } catch (err) { /* egal */ } });
    const hoch = () => k.classList.remove('an');
    k.addEventListener('pointerup', hoch); k.addEventListener('pointercancel', hoch);
  }

  // ---------- Rennstart ----------
  function geistMesh(spiel, f) {
    try {
      const m = f.mesh.clone(true), weg = [];
      m.traverse((o) => {
        if (o.isLight) weg.push(o);
        if (o.isMesh && o.material) {
          const arr = Array.isArray(o.material) ? o.material : [o.material];
          const neu = arr.map((x) => { const c = x.clone(); c.transparent = true; c.opacity = 0.34; c.depthWrite = false; if (c.emissive) { c.emissive.setHex(0x335588); } return c; });
          o.material = Array.isArray(o.material) ? neu : neu[0];
          o.renderOrder = 5;
        }
      });
      weg.forEach((o) => o.parent && o.parent.remove(o));
      m.name = 'SpassGeist'; m.visible = false;
      spiel.szene.add(m);
      return m;
    } catch (e) { console.error('Spaß (Geist-Mesh):', e); return null; }
  }
  const rennenStarten = P.rennenStarten;
  P.rennenStarten = function () {
    const r = rennenStarten.apply(this, arguments);
    try {
      loesen(this.spassGeistMesh); this.spassGeistMesh = null;
      this.spass = null;
      if (this.rennen && this.strecke && this.fahrzeuge) {
        const e = this.einstellungen || {};
        const menschen = this.fahrzeuge.map((f, i) => (f.istSpieler ? i : -1)).filter((i) => i >= 0);
        const s = this.spass = { geist: null, muenzen: {}, ziel: {}, stunt: {}, grossSprung: {} };
        // Geist: nur Solo (ein Mensch), offline, Schalter 👻 an, nicht im Stunt-Park
        const park = !!(e.stuntpark || (this.strecke.daten && (this.strecke.daten.motoFelder || this.strecke.daten.motoKisten)));
        if (e.geist !== false && menschen.length === 1 && !park && this.zustand !== 'online') {
          const i = menschen[0], f = this.fahrzeuge[i];
          const key = GE.schluessel(this.strecke.id + (this.strecke.variante ? '/' + this.strecke.variante : ''), (e.autoIds && e.autoIds[0]) || 'auto');
          const satz = GE.holen(spielName(), key), g = satz ? GE.entpacken(satz) : null;
          s.geist = { i, key, satz, g, rec: GE.neu(), t: 0, runden: 0, mesh: g ? geistMesh(this, f) : null, pose: {} };
          this.spassGeistMesh = s.geist.mesh;
        }
      }
      tastenBinden(); tastenFreigeben(this); touchKnopf(this);
      St.laden();
    } catch (e) { console.error('Spaß (Start):', e); }
    return r;
  };

  // ---------- Physik: Geist, Sticker, Jubel ----------
  function spassSchritt(spiel, dt) {
    const s = spiel.spass, rennen = spiel.rennen;
    if (!s || !rennen || spiel.zustand !== 'rennen' || spiel.pausiert || !(dt > 0)) return;
    const laeuft = !!rennen.gasErlaubt;
    for (let i = 0; i < spiel.fahrzeuge.length; i++) {
      const f = spiel.fahrzeuge[i];
      if (!f.istSpieler) continue;
      const t = rennen.teilnehmer[i];
      // Münzen
      if (spiel.muenzen && laeuft) {
        const n = spiel.muenzen.anzahlVon(i), alt = s.muenzen[i] || 0;
        if (n !== alt) { s.muenzen[i] = n; if (n > alt) sticker('muenzen', { rennen: n, neu: n - alt }); }
      }
      // Ziel
      if (t && t.imZiel && !s.ziel[i]) {
        s.ziel[i] = true;
        const e = spiel.einstellungen || {};
        const platz = t.zielPlatz || 0;
        sticker('ziel', { platz, streckeId: spiel.strecke.id, nacht: e.tageszeit === 'nacht', zwei: (e.modus === 'zwei') });
        St.jubeln();
        if (spiel.spassKonfetti) { const v = f.vehicle; spiel.spassKonfetti.burst(v.x, v.y + 3, v.z, 90); }
      }
      // Motorrad-Stunts (Zähler der Stunt-Zustandsmaschine)
      const sz = spiel.stunt && spiel.stunt.fz && spiel.stunt.fz[i];
      if (sz && sz.stat) {
        const a = s.stunt[i] || (s.stunt[i] = { saltos: 0, ringe: 0, busse: 0, w: 0, sp: 0 }), z = sz.stat;
        let gross = false;
        if (z.saltos > a.saltos) { a.saltos = z.saltos; sticker('salto'); gross = true; }
        if (z.ringe > a.ringe) { a.ringe = z.ringe; sticker('ring'); gross = true; }
        if (z.busse > a.busse) { a.busse = z.busse; sticker('bus'); gross = true; }
        if (z.wheelieM > a.w + 1) { a.w = z.wheelieM; sticker('wheelie', { m: z.wheelieM }); }
        if (z.stoppieM > a.sp + 1) { a.sp = z.stoppieM; sticker('stoppie', { m: z.stoppieM }); }
        if (gross) { St.jubeln(); const v = f.vehicle; if (spiel.spassKonfetti) spiel.spassKonfetti.burst(v.x, v.y + 2, v.z, 50); }
      }
    }
    // Geist
    const g = s.geist;
    if (g && laeuft) {
      const f = spiel.fahrzeuge[g.i], t = rennen.teilnehmer[g.i], v = f.vehicle;
      if (!t.imZiel) {
        g.t += dt;
        GE.schritt(g.rec, dt, v.x, v.z, v.heading, v.y);
        if (t.rundenzeiten.length > g.runden) {
          const zeit = t.rundenzeiten[t.rundenzeiten.length - 1];
          g.runden = t.rundenzeiten.length;
          if (g.satz && g.g && zeit < g.satz.zeit) { spiel._meldung(g.i, 'Geist geschlagen! 👻🎉', 2500); sticker('geist'); St.jubeln(); }
          if (g.rec.n > 5 && GE.besser(g.satz, zeit)) {
            g.satz = GE.abschluss(g.rec, zeit); GE.ablegen(spielName(), g.key, g.satz); g.g = GE.entpacken(g.satz);
            if (!g.mesh && g.g) { g.mesh = geistMesh(spiel, f); spiel.spassGeistMesh = g.mesh; }
          }
          g.rec = GE.neu(); g.t = 0;
        }
      }
    }
  }
  const physikSchritt = P.physikSchritt;
  P.physikSchritt = function (dt) {
    const r = physikSchritt.apply(this, arguments);
    try { spassSchritt(this, dt); } catch (e) { console.error('Spaß (Physik):', e); }
    return r;
  };

  // ---------- Ereignisse der Elemente ----------
  P.spassEreignis = function (i, name) {
    const f = this.fahrzeuge[i];
    if (!f || !f.vehicle) return;
    const v = f.vehicle, k = this.spassKonfetti, mensch = !!f.istSpieler;
    const wackeln = (w) => this.kameras.forEach((c) => { if (c.ziel === v) c.wackeln(w); });
    if (name === 'trampolin') {
      if (mensch) { this._meldung(i, 'Boing! 🤸', 1200); sticker('trampolin'); if (R.Audio && R.Audio.kollision) R.Audio.kollision(2); }
      if (k) k.burst(v.x, v.y + 1, v.z, 24);
    } else if (name === 'kanoneEin') {
      if (mensch) this._meldung(i, 'In die Kanone! 💥', 1300);
    } else if (name === 'kanone3' || name === 'kanone2' || name === 'kanone1') {
      if (mensch) { this._meldung(i, name.slice(-1), 450); if (R.Audio && R.Audio.countdown) try { R.Audio.countdown(+name.slice(-1)); } catch (e) { /* egal */ } wackeln(0.5); }
    } else if (name === 'kanoneBumm') {
      if (mensch) { this._meldung(i, 'RUMMS! 💥', 1400); sticker('kanone'); if (R.Audio && R.Audio.kollision) R.Audio.kollision(6); wackeln(3); }
      if (k) k.burst(v.x, v.y + 2, v.z, 140);
    } else if (name === 'kanoneLand') {
      if (mensch) { this._meldung(i, 'Gelandet! 🎉', 1400); St.jubeln(); wackeln(1.5); }
      if (k) k.burst(v.x, v.y + 2, v.z, 60);
    }
  };

  const flugEreignis = P._flugEreignis;
  P._flugEreignis = function (i, e) {
    const r = flugEreignis.apply(this, arguments);
    try {
      if (e === 'landung' || e === 'landungSchraeg') {
        const f = this.fahrzeuge[i];
        if (f && f.istSpieler && f.flug && !(f.flug.trampolin) && this.spass) {
          const sek = f.flug.letzteFlugzeit || 0;
          sticker('sprung', { sek });
          if (sek >= 2.0 && window.MOTORRAD !== true) { St.jubeln(); if (this.spassKonfetti) this.spassKonfetti.burst(f.vehicle.x, f.vehicle.y + 2, f.vehicle.z, 40); }
        }
      }
    } catch (err) { console.error('Spaß (Flug):', err); }
    return r;
  };

  // ---------- Bild: Konfetti, Geist ----------
  function bild(spiel, dt) {
    if (spiel.spassKonfetti) spiel.spassKonfetti.update(spiel.pausiert ? 0 : dt);
    const s = spiel.spass, g = s && s.geist;
    if (!g || !g.mesh) return;
    const aktiv = spiel.zustand === 'rennen' && spiel.rennen && spiel.rennen.gasErlaubt && !spiel.rennen.teilnehmer[g.i].imZiel;
    const p = aktiv && g.g ? GE.pose(g.g, g.t, g.pose) : null;
    g.mesh.visible = !!p;
    if (p) { g.mesh.position.set(p.x, p.y, p.z); g.mesh.rotation.set(0, p.h, 0, 'YXZ'); }
  }
  if (R.dach && typeof R.dach.frame === 'function') {
    const frame = R.dach.frame;
    R.dach.frame = function (spiel, dt) {
      const r = frame.apply(this, arguments);
      try { bild(spiel, dt); } catch (e) { console.error('Spaß (Bild):', e); }
      return r;
    };
  }

  // ---------- Kanone: Kamera außen (im Cockpit sah man nur das dunkle Rohr) ----------
  // Solange das eigene Fahrzeug in der Kanone steckt (Einziehen, Countdown, Schuss), zeigt eine Cockpit-Kamera kurz die Verfolger-Ansicht; danach wieder Cockpit.
  const KAM = R.FahrzeugKamera && R.FahrzeugKamera.prototype;
  if (KAM && !KAM._spassKanoneKamera) {
    KAM._spassKanoneKamera = true;
    const kamUpdate = KAM.update;
    KAM.update = function (dt) {
      try {
        const sp = R.spiel, idx = R.config.kamera.modi.indexOf('verfolger');
        let aussen = false;
        if (idx >= 0 && sp && sp.fahrzeuge && this.ziel && (this._spassAlt !== undefined || this.modus === 'cockpit')) {
          const f = sp.fahrzeuge.find((x) => x.vehicle === this.ziel);
          aussen = !!(f && f.flug && f.flug.kanone);
        }
        // Moduswechsel echt (nicht nur im Update), damit Cockpit-Anzeigen, Lenker und Spiegel zur Ansicht passen
        if (aussen && this._spassAlt === undefined) { this._spassAlt = this.modusIndex; this.modusIndex = idx; this._erstesMal = true; }
        else if (!aussen && this._spassAlt !== undefined) { this.modusIndex = this._spassAlt; this._spassAlt = undefined; this._erstesMal = true; }
      } catch (e) { /* Kamera darf nie ausfallen */ }
      return kamUpdate.apply(this, arguments);
    };
  }

  R.SpassStart = { spassSchritt, bild, hupeTaste, geistMesh, toastZeigen, toastStil };
})();
