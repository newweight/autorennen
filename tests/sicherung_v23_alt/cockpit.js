// ============================================================
// Cockpit-Anzeigen (14.10. v21): markenspezifische Instrumente unten in der Mitte (HUD-Canvas), Rückspiegel-Rahmen, Wischer-Einbindung.
//
//   Passat Variant / Polizei-Passat / Multivan (T7) / T-Roc Cabrio:  "vw"      = VW „Digital Cockpit Pro“ (10,25 Zoll, Ansicht Classic):
//                              links Drehzahlmesser, rechts Tacho (je rund, dunkel, blau/weiße Grafik), Mitte Platz + Runde
//   Porsche 911 (992):         "porsche" = „Classic“-Anzeige mit fünf Rundinstrumenten: Mitte großer analoger Drehzahlmesser mit digitalem
//                              Tacho darin; links Gang + Runde, rechts Platz + Öltemperatur (kleine digitale Rundanzeigen)
//   alle anderen Autos:        "standard" = die bisherige Anzeige (Tacho rechts unten)
//   Quellen (grobe Vorbilder): VW Newsroom (Digital Cockpit Pro: 10,25 Zoll, 1280×480, Ansichten Classic/Progressive/Navigation),
//                              Porsche Newsroom (911: 12,6-Zoll-Curved-Display, „Classic“-Ansicht im Fünftuben-Design mit zentralem Drehzahlmesser).
//
// API (alles unter Rennspiel.cockpit):
//   drehzahl(auto, v, vMax?)   → Motordrehzahl in 1/min aus Tempo v (m/s, mit Vorzeichen) und simuliertem Gang. `auto` = Katalogeintrag oder id.
//                                vMax (m/s) optional: tatsächliche Höchstgeschwindigkeit (Tempo-Klasse, Garage); sonst auto.fahrwerte.vMax.
//                                ZUSTANDSLOS (nur v → Drehzahl): darf der Sound-Agent/Motorton direkt nutzen. Leerlauf bei Stillstand.
//   getriebe(auto, v, vMax?)   → { rpm, gang (1..n, −1 = Rückwärts), gaenge, leerlauf, rot (Schaltdrehzahl/rote Zone), skala (Anzeige-Ende), anteil (rpm/rot) }
//   motor(auto)                → Motordaten { name, leerlauf, rot, skala, uebers[], schalt }
//   stilFuer(autoId)           → 'vw' | 'porsche' | 'standard'
//   fuerHud(hud, wurzel)       → Anzeige-Objekt für ein HUD (wird in hud.js angelegt; update()/groesse()/zerstoeren())
//
// Alle Positionen/Größen: config.cockpit (Prozent der Ansicht), siehe ANLEITUNG.md „Cockpit, Rückspiegel, Wischer“.
// ============================================================
(function () {
  const R = window.Rennspiel;
  const K = {};
  R.cockpit = K;

  // ------------------------------------------------------------------ Drehzahl / Gang (rein, ohne DOM)
  // uebers = Übersetzung je Gang RELATIV zum höchsten Gang (= 1). Der höchste Gang erreicht bei Höchsttempo 92 % der roten Zone.
  // schalt = Anteil der roten Zone, bei dem hochgeschaltet wird.
  const MOTOREN = {
    diesel7:  { name: 'Diesel 7-Gang-DSG',    leerlauf: 800,  rot: 4500,  skala: 6000,  schalt: 0.82, uebers: [5.0, 3.3, 2.35, 1.8, 1.4, 1.15, 1.0] },
    benzin7:  { name: 'Benziner 7-Gang-DSG',  leerlauf: 800,  rot: 6500,  skala: 8000,  schalt: 0.80, uebers: [4.9, 3.2, 2.3, 1.75, 1.38, 1.14, 1.0] },
    pdk8:     { name: 'Boxer 8-Gang-PDK',     leerlauf: 800,  rot: 7500,  skala: 8000,  schalt: 0.86, uebers: [5.4, 3.7, 2.75, 2.15, 1.7, 1.35, 1.12, 1.0] },
    benzin8:  { name: 'Sechszylinder 8-Gang', leerlauf: 850,  rot: 7000,  skala: 8000,  schalt: 0.85, uebers: [5.3, 3.6, 2.7, 2.1, 1.65, 1.32, 1.1, 1.0] },
    benzin6:  { name: 'Benziner 6-Gang',      leerlauf: 850,  rot: 6500,  skala: 8000,  schalt: 0.82, uebers: [4.2, 2.6, 1.8, 1.35, 1.1, 1.0] },
    formel:   { name: 'Rennmotor 8-Gang',     leerlauf: 3500, rot: 12500, skala: 14000, schalt: 0.90, uebers: [5.5, 3.8, 2.8, 2.2, 1.75, 1.4, 1.15, 1.0] },
  };
  const AUTO_MOTOR = { 'passat': 'diesel7', 'polizei': 'diesel7', 'multivan': 'diesel7', 'troc-cabrio': 'benzin7', 'porsche-911': 'pdk8',
    'bmw-m4': 'benzin8', 'amg-gt': 'benzin8', 'audi-rs6': 'benzin8', 'mini-cooper': 'benzin6', 'formel': 'formel' };
  K.MOTOREN = MOTOREN; K.AUTO_MOTOR = AUTO_MOTOR;

  function autoId(auto) { return typeof auto === 'string' ? auto : (auto && auto.id) || ''; }
  K.motor = function (auto) { return MOTOREN[AUTO_MOTOR[autoId(auto)] || 'benzin6']; };

  K.getriebe = function (auto, v, vMax) {
    const m = K.motor(auto);
    let vm = vMax;
    if (!(vm > 0)) vm = auto && auto.fahrwerte ? auto.fahrwerte.vMax : (R.carCatalog && R.carCatalog.finde && R.carCatalog.finde(autoId(auto)) ? R.carCatalog.finde(autoId(auto)).fahrwerte.vMax : 60);
    const kmh = Math.abs(v || 0) * 3.6, kTop = 0.92 * m.rot / (vm * 3.6), u = m.uebers;
    let g = 0;
    while (g < u.length - 1 && kTop * u[g] * kmh > m.schalt * m.rot) g++;
    let rpm = kTop * u[g] * kmh;
    if (kmh < 14) rpm = Math.max(rpm, m.leerlauf + kmh * (m.rot * 0.17));     // Anfahren: Kupplung schleift, Drehzahl steigt schneller
    rpm = Math.max(m.leerlauf, Math.min(m.rot * 1.02, rpm));
    return { rpm, gang: v < -0.5 ? -1 : g + 1, gaenge: u.length, leerlauf: m.leerlauf, rot: m.rot, skala: m.skala, anteil: rpm / m.rot };
  };

  K.drehzahl = function (auto, v, vMax) { return K.getriebe(auto, v, vMax).rpm; };

  K.stilFuer = function (id) { const c = R.config.cockpit; return (c && c.stile && c.stile[autoId(id)]) || 'standard'; };

  // ------------------------------------------------------------------ Zeichnen: Rundinstrumente
  const TAU = Math.PI * 2, A0 = Math.PI * 0.75, SW = Math.PI * 1.5;
  const ang = (f) => A0 + SW * Math.max(0, Math.min(1, f));
  const SCHRIFT = '"Helvetica Neue", Arial, system-ui, sans-serif';
  const cache = {};
  function leinwand(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
  function gleich(a, b) { return Math.abs(a - b) < 1e-6; }

  /** Skala: { max, gross (Abstand der Zahlen), klein (Abstand der Striche), rot (ab hier rot, oder Infinity), zahl(v) → Text }. */
  function skalaZeichnen(g, m, sk, farben, rZahl, rAussen, rGross, rKlein, zahlGroesse) {
    g.textAlign = 'center'; g.textBaseline = 'middle';
    for (let v = 0; v <= sk.max + 1e-6; v += sk.klein) {
      const gross = gleich(v / sk.gross, Math.round(v / sk.gross)), a = ang(v / sk.max);
      const rot = v >= sk.rot - 1e-6;
      g.strokeStyle = rot ? farben.rot : farben.strich;
      g.lineWidth = m * (gross ? 0.036 : 0.017); g.lineCap = 'butt';
      const r2 = gross ? rGross : rKlein;
      g.beginPath(); g.moveTo(m + Math.cos(a) * rAussen, m + Math.sin(a) * rAussen); g.lineTo(m + Math.cos(a) * r2, m + Math.sin(a) * r2); g.stroke();
      if (gross) {
        g.fillStyle = rot ? farben.rot : farben.zahl; g.font = '700 ' + Math.round(m * zahlGroesse) + 'px ' + SCHRIFT;
        g.fillText(sk.zahl(v), m + Math.cos(a) * rZahl, m + Math.sin(a) * rZahl);
      }
    }
  }

  // ---- VW Digital Cockpit Pro (Classic): dunkle Scheibe, weiße Skala, blauer Fortschrittsbogen, weißer Zeiger
  function vwStatik(S, sk) {
    const c = leinwand(S, S), g = c.getContext('2d'), m = S / 2;
    const bg = g.createRadialGradient(m, m * 0.85, S * 0.04, m, m, m);
    bg.addColorStop(0, '#16222f'); bg.addColorStop(1, '#06090e');
    g.fillStyle = bg; g.beginPath(); g.arc(m, m, m * 0.985, 0, TAU); g.fill();
    g.strokeStyle = 'rgba(110,150,200,.5)'; g.lineWidth = m * 0.03; g.beginPath(); g.arc(m, m, m * 0.955, 0, TAU); g.stroke();
    // dünner Bogen als Bahn für den blauen Fortschritt
    g.strokeStyle = 'rgba(70,100,140,.38)'; g.lineWidth = m * 0.07; g.lineCap = 'butt';
    g.beginPath(); g.arc(m, m, m * 0.86, ang(0), ang(1)); g.stroke();
    skalaZeichnen(g, m, sk, { strich: '#e6eefc', zahl: '#ffffff', rot: '#ff4a3a' }, m * 0.54, m * 0.78, m * 0.68, m * 0.73, sk.zahlGroesse || 0.17);
    return c;
  }

  function vwZeichnen(g, S, stat, sk, wert, mitteText, mitteKlein, rotAb) {
    const m = S / 2;
    g.clearRect(0, 0, S, S);
    g.drawImage(stat, 0, 0);
    const f = Math.max(0, Math.min(1, wert / sk.max));
    // blauer Fortschritt (rot im roten Bereich)
    g.lineCap = 'butt'; g.lineWidth = m * 0.07;
    const fRot = rotAb < Infinity ? rotAb / sk.max : 2;
    g.strokeStyle = '#2ea6ff'; g.beginPath(); g.arc(m, m, m * 0.86, ang(0), ang(Math.min(f, fRot))); g.stroke();
    if (f > fRot) { g.strokeStyle = '#ff4a3a'; g.beginPath(); g.arc(m, m, m * 0.86, ang(fRot), ang(f)); g.stroke(); }
    // Zeiger (nur außen, die Mitte bleibt für die Ziffern frei)
    const a = ang(f);
    g.strokeStyle = '#ffffff'; g.lineWidth = m * 0.045; g.lineCap = 'round';
    g.beginPath(); g.moveTo(m + Math.cos(a) * m * 0.40, m + Math.sin(a) * m * 0.40); g.lineTo(m + Math.cos(a) * m * 0.80, m + Math.sin(a) * m * 0.80); g.stroke();
    // Mitte
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#ffffff';
    g.font = '800 ' + Math.round(m * 0.44) + 'px ' + SCHRIFT; g.fillText(mitteText, m, m * 0.98);
    g.fillStyle = '#7fc4ff'; g.font = '700 ' + Math.round(m * 0.15) + 'px ' + SCHRIFT; g.fillText(mitteKlein, m, m * 1.56);
  }

  // ---- Porsche 911 „Classic“: schwarz, weiße Zahlen, rot-orange Zeiger, rote Zone
  function pStatik(S, sk, grossDial) {
    const c = leinwand(S, S), g = c.getContext('2d'), m = S / 2;
    g.fillStyle = '#050505'; g.beginPath(); g.arc(m, m, m * 0.985, 0, TAU); g.fill();
    g.strokeStyle = '#c8cdd4'; g.lineWidth = m * 0.035; g.beginPath(); g.arc(m, m, m * 0.95, 0, TAU); g.stroke();       // Chromring
    g.strokeStyle = '#1b1b1d'; g.lineWidth = m * 0.02; g.beginPath(); g.arc(m, m, m * 0.915, 0, TAU); g.stroke();
    if (grossDial) {
      // rote Zone als Bogen
      g.strokeStyle = 'rgba(230,40,30,.9)'; g.lineWidth = m * 0.045; g.lineCap = 'butt';
      g.beginPath(); g.arc(m, m, m * 0.835, ang(sk.rot / sk.max), ang(1)); g.stroke();
      skalaZeichnen(g, m, sk, { strich: '#f2f2f2', zahl: '#ffffff', rot: '#ff4338' }, m * 0.60, m * 0.80, m * 0.69, m * 0.74, 0.19);
    }
    return c;
  }

  function pDrehzahl(g, S, stat, sk, rpm, kmh, gangText) {
    const m = S / 2;
    g.clearRect(0, 0, S, S);
    g.drawImage(stat, 0, 0);
    const a = ang(rpm / sk.max);
    // Zeiger: konisch, außen
    const r1 = m * 0.50, r2 = m * 0.86, br = m * 0.05;
    const nx = -Math.sin(a), ny = Math.cos(a);
    g.fillStyle = '#ff5a1e'; g.beginPath();
    g.moveTo(m + Math.cos(a) * r2, m + Math.sin(a) * r2);
    g.lineTo(m + Math.cos(a) * r1 + nx * br, m + Math.sin(a) * r1 + ny * br);
    g.lineTo(m + Math.cos(a) * r1 - nx * br, m + Math.sin(a) * r1 - ny * br);
    g.closePath(); g.fill();
    // Digital-Tacho in der Mitte
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = '#ffffff'; g.font = '800 ' + Math.round(m * 0.50) + 'px ' + SCHRIFT; g.fillText(String(kmh), m, m * 0.98);
    g.fillStyle = '#9aa3ad'; g.font = '700 ' + Math.round(m * 0.15) + 'px ' + SCHRIFT; g.fillText('km/h', m, m * 1.27);
    g.fillStyle = '#ffb347'; g.font = '800 ' + Math.round(m * 0.2) + 'px ' + SCHRIFT; g.fillText(gangText, m, m * 0.62);
  }

  /** Kleine digitale Rundanzeige (Porsche): Ring + Titel + großer Wert (+ optional Bogen 0..1). */
  function pKlein(g, S, titel, wert, bogen, farbe) {
    const m = S / 2;
    g.clearRect(0, 0, S, S);
    g.fillStyle = '#050505'; g.beginPath(); g.arc(m, m, m * 0.985, 0, TAU); g.fill();
    g.strokeStyle = '#c8cdd4'; g.lineWidth = m * 0.04; g.beginPath(); g.arc(m, m, m * 0.95, 0, TAU); g.stroke();
    if (bogen >= 0) {
      g.lineCap = 'round'; g.lineWidth = m * 0.07;
      g.strokeStyle = 'rgba(255,255,255,.14)'; g.beginPath(); g.arc(m, m, m * 0.8, ang(0), ang(1)); g.stroke();
      g.strokeStyle = farbe; g.beginPath(); g.arc(m, m, m * 0.8, ang(0), ang(Math.max(0.001, bogen))); g.stroke();
    }
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = '#9aa3ad'; g.font = '700 ' + Math.round(m * 0.21) + 'px ' + SCHRIFT; g.fillText(titel, m, m * 0.50);
    g.fillStyle = '#ffffff'; g.font = '800 ' + Math.round(m * (wert.length > 4 ? 0.36 : 0.5)) + 'px ' + SCHRIFT; g.fillText(wert, m, m * 1.05);
  }

  /** VW-Mitte: Platz + Runde als Text auf transparentem Grund. */
  function vwMitte(g, w, h, platz, von, runde, runden) {
    g.clearRect(0, 0, w, h);
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = '#7fc4ff'; g.font = '700 ' + Math.round(h * 0.11) + 'px ' + SCHRIFT; g.fillText('PLATZ', w / 2, h * 0.12);
    g.fillStyle = '#fff'; g.font = '800 ' + Math.round(h * 0.26) + 'px ' + SCHRIFT; g.fillText(platz + '/' + von, w / 2, h * 0.32);
    g.fillStyle = '#2ea6ff'; g.fillRect(w * 0.18, h * 0.5, w * 0.64, Math.max(1, h * 0.012));
    g.fillStyle = '#7fc4ff'; g.font = '700 ' + Math.round(h * 0.11) + 'px ' + SCHRIFT; g.fillText('RUNDE', w / 2, h * 0.63);
    g.fillStyle = '#fff'; g.font = '800 ' + Math.round(h * 0.26) + 'px ' + SCHRIFT; g.fillText(runde + '/' + runden, w / 2, h * 0.83);
  }

  // ------------------------------------------------------------------ Anzeige je HUD
  const stil = (e, k) => Object.assign(e.style, k);
  const q = (v, s) => Math.round(v / s) * s;

  class Anzeige {
    constructor(hud, wurzel) {
      this.hud = hud;
      this.autoId = hud.f && hud.f.auto ? hud.f.auto.id : '';
      this.stil = K.stilFuer(this.autoId);
      this.vw = 0; this.vh = 0;
      this.teile = {};                   // name → { el, canvas, g, S, W, H, letzte }
      this.rpm = 0; this.zeit = 0; this.letzteZeichnung = 0;
      this.dpr = Math.min(2, (typeof window !== 'undefined' && window.devicePixelRatio) || 1);
      this.alterTacho = hud.el.querySelector('.hud-tacho');
      this.wurzel = document.createElement('div');
      this.wurzel.className = 'hud-cockpit';
      stil(this.wurzel, { position: 'absolute', inset: '0', pointerEvents: 'none' });
      wurzel.insertBefore(this.wurzel, wurzel.firstChild);       // unter den übrigen HUD-Teilen (Banner, Meldungen bleiben oben)
      // Rückspiegel-Rahmen
      this.rahmen = document.createElement('div');
      this.rahmen.className = 'hud-spiegel';
      stil(this.rahmen, { position: 'absolute', boxSizing: 'border-box', display: 'none', pointerEvents: 'none', borderRadius: '14px',
        border: '4px solid #15171c', boxShadow: '0 0 0 2px rgba(255,255,255,.28), 0 3px 8px rgba(0,0,0,.55), inset 0 0 10px rgba(0,0,0,.5)',
        background: 'linear-gradient(115deg, rgba(255,255,255,.14) 0%, rgba(255,255,255,0) 28%)' });
      this.wurzel.appendChild(this.rahmen);
      this.rahmenAn = false;
      this.wischer = R.wischer ? R.wischer.fuerHud(hud, wurzel) : null;
      if (this.stil !== 'standard') this._bauen();
      this.aktiv = false;
    }

    _teil(name, art) {
      const el = document.createElement(art === 'tafel' ? 'div' : 'canvas');
      el.className = 'cp-' + name;
      stil(el, { position: 'absolute', display: 'none' });
      this.wurzel.appendChild(el);
      const t = { el, canvas: art === 'tafel' ? null : el, g: art === 'tafel' ? null : el.getContext('2d'), S: 0, W: 0, H: 0, letzte: '' };
      if (art === 'tafel') stil(el, { borderRadius: '2.2em', boxSizing: 'border-box', border: '3px solid rgba(150,170,200,.35)',
        boxShadow: '0 4px 14px rgba(0,0,0,.6), inset 0 0 18px rgba(0,0,0,.7)' });
      this.teile[name] = t;
      return t;
    }

    _bauen() {
      this._teil('tafel', 'tafel');
      if (this.stil === 'vw') { this._teil('drehzahl'); this._teil('tacho'); this._teil('mitte'); }
      else { this._teil('drehzahl'); ['linksAussen', 'linksInnen', 'rechtsInnen', 'rechtsAussen'].forEach((n) => this._teil(n)); }
    }

    groesse(vw, vh) { this.vw = vw; this.vh = vh; this._layout = true; if (this.wischer) this.wischer.groesse(vw, vh); }

    /** Positionen/Größen aus config.cockpit[stil] (Prozent) in Pixel umrechnen und Canvas anlegen. */
    _layoutAnwenden() {
      this._layout = false;
      const c = R.config.cockpit, cfg = c[this.stil], split = this.hud.split;
      const f = split ? (cfg.zweispielerFaktor || c.zweispielerFaktor) : 1;
      Object.keys(this.teile).forEach((n) => {
        const t = this.teile[n], e = cfg[n];
        if (!e) return;
        const rc = R.rueckspiegel.rechteckAus(e, this.vw, this.vh, f);
        stil(t.el, { left: rc.x + 'px', top: rc.y + 'px', width: rc.b + 'px', height: rc.h + 'px' });
        if (t.el.tagName === 'DIV') { t.el.style.background = e.farbe || '#05080d'; return; }
        const W = Math.max(8, Math.min(Math.round(rc.b * this.dpr), 420)), H = Math.max(8, Math.min(Math.round(rc.h * this.dpr), 420));
        if (t.W !== W || t.H !== H) { t.W = W; t.H = H; t.canvas.width = W; t.canvas.height = H; t.letzte = ''; t.S = Math.min(W, H); t.statik = null; }
      });
    }

    update() {
      const c = R.config.cockpit, hud = this.hud, spiel = R.spiel;
      const kam = spiel && spiel.kameras && spiel.kameras[hud.nr];
      const modus = kam ? kam.modus : 'verfolger';
      const wetter = hud.wetter;

      // Wischer (eigene Prüfung: nur bei Niederschlag)
      if (this.wischer) this.wischer.update(R.wischer.art(wetter), wetter ? wetter.windStaerke : 0, c.an && c.wischer.an && c.wischer.modi.indexOf(modus) >= 0);

      // Rückspiegel-Rahmen
      const sp = R.rueckspiegel && R.rueckspiegel.sichtbar(spiel, hud.nr);
      if (sp !== this.rahmenAn || (sp && this._layoutSp !== this.vw + 'x' + this.vh)) {
        this.rahmenAn = sp;
        this.rahmen.style.display = sp ? 'block' : 'none';
        if (sp) {
          const rc = R.rueckspiegel.rechteck(this.vw || hud.el.clientWidth, this.vh || hud.el.clientHeight, hud.split);
          stil(this.rahmen, { left: (rc.x - 4) + 'px', top: (rc.y - 4) + 'px', width: (rc.b + 8) + 'px', height: (rc.h + 8) + 'px' });
          this._layoutSp = this.vw + 'x' + this.vh;
        }
      }
      // Hinweis (Festgefahren? …) liegt sonst genau auf dem Spiegel → höher setzen
      if (hud.eHinweis && this._hinweisHoch !== (sp || this.aktiv)) {
        this._hinweisHoch = sp || this.aktiv;
        hud.eHinweis.style.bottom = this._hinweisHoch ? '32%' : '';
      }

      // Instrumente (auf dem Handy (Touch-Bedienung) bleibt die alte, kleine Anzeige: unten Mitte liegen dort die Touch-Tasten)
      const touch = typeof document !== 'undefined' && document.documentElement.classList.contains('t-rennen');
      const soll = c.an && this.stil !== 'standard' && c.modi.indexOf(modus) >= 0 && !touch;
      if (soll !== this.aktiv) {
        this.aktiv = soll;
        Object.keys(this.teile).forEach((n) => { this.teile[n].el.style.display = soll ? 'block' : 'none'; });
        if (soll) this._layout = true;
      }
      const tachoWeg = c.an && this.stil !== 'standard' && !touch;
      if (this.alterTacho && this._tachoWeg !== tachoWeg) { this._tachoWeg = tachoWeg; this.alterTacho.style.display = tachoWeg ? 'none' : ''; }
      if (!soll) return;
      if (!this.vw) { this.vw = hud.el.clientWidth; this.vh = hud.el.clientHeight; this._layout = true; }
      if (this._layout) this._layoutAnwenden();

      const jetzt = performance.now(), dt = Math.min(0.1, (jetzt - (this.zeit || jetzt)) / 1000);
      this.zeit = jetzt;
      if (jetzt - this.letzteZeichnung < 1000 / (c.zeichenrate || 30) - 1) return;
      this.letzteZeichnung = jetzt; this.zeichnungen = (this.zeichnungen || 0) + 1;

      const v = hud.f.vehicle, t = hud.t, r = hud.rennen;
      const gt = K.getriebe(hud.f.auto, v.vLaengs, v.daten && v.daten.vMax);
      // Nadel weich nachführen (Drehzahl springt beim Schalten)
      this.rpm += (gt.rpm - this.rpm) * (1 - Math.exp(-14 * Math.max(dt, 0.016)));
      const kmh = Math.abs(Math.round(v.vLaengs * 3.6));
      const runde = Math.min(r.runden, t.runde + 1), platz = t.imZiel && t.zielPlatz ? t.zielPlatz : t.platz, von = r.teilnehmer.length;
      const gangText = gt.gang < 0 ? 'R' : (Math.abs(v.vLaengs) < 0.3 ? 'N' : 'D' + gt.gang);
      const rpmQ = q(this.rpm, 25);
      const maxKmh = Math.ceil(((v.daten && v.daten.vMax) || 70) * 3.6 / 40) * 40;

      if (this.stil === 'vw') {
        const sk = this._skalen(gt, maxKmh);
        const d = this.teile.drehzahl, tc = this.teile.tacho, m = this.teile.mitte;
        let k = rpmQ + '|' + gangText;
        if (d.letzte !== k) { d.letzte = k; this._vwDial(d, sk.rpm, 'vwR', this.rpm, gangText, 'x1000', gt.rot); }
        k = kmh + '|' + Math.round(kmh / 2);
        if (tc.letzte !== k) { tc.letzte = k; this._vwDial(tc, sk.kmh, 'vwK', kmh, String(kmh), 'km/h', Infinity, kmh); }
        k = platz + '/' + von + '|' + runde + '/' + r.runden;
        if (m.letzte !== k) { m.letzte = k; vwMitte(m.g, m.W, m.H, platz, von, runde, r.runden); }
      } else {
        const sk = this._skalen(gt, maxKmh), d = this.teile.drehzahl;
        let k = rpmQ + '|' + kmh + '|' + gangText;
        if (d.letzte !== k) {
          d.letzte = k;
          if (!d.statik || d.statikKey !== sk.rpm.max) { d.statik = pStatik(d.S, sk.rpm, true); d.statikKey = sk.rpm.max; }
          pDrehzahl(d.g, d.S, d.statik, sk.rpm, this.rpm, kmh, gangText);
        }
        const kl = (n, titel, wert, bogen, farbe) => { const p = this.teile[n]; const kk = titel + wert + (bogen >= 0 ? Math.round(bogen * 40) : ''); if (p.letzte !== kk) { p.letzte = kk; pKlein(p.g, p.S, titel, wert, bogen, farbe); } };
        kl('linksAussen', 'PDK', gt.gang < 0 ? 'R' : String(gt.gang), gt.gang < 0 ? -1 : gt.gang / gt.gaenge, '#ffb347');
        kl('linksInnen', 'RUNDE', runde + '/' + r.runden, -1, '');
        kl('rechtsInnen', 'PLATZ', platz + '/' + von, -1, '');
        const oel = 0.55 + 0.25 * Math.min(1, this.rpm / gt.rot);
        kl('rechtsAussen', 'ÖL °C', String(Math.round(70 + oel * 40)), oel, '#7fe08a');
      }
    }

    _skalen(gt, maxKmh) {
      const key = gt.skala + '|' + gt.rot + '|' + maxKmh;
      if (this._sk && this._sk.key === key) return this._sk;
      const porsche = this.stil === 'porsche';
      this._sk = { key,
        rpm: { max: gt.skala / 1000, gross: 1, klein: 0.5, rot: gt.rot / 1000, zahl: (v) => String(v), zahlGroesse: porsche ? 0.19 : 0.17 },
        kmh: { max: maxKmh, gross: 40, klein: 20, rot: Infinity, zahl: (v) => String(v), zahlGroesse: 0.15 } };
      return this._sk;
    }

    _vwDial(t, sk, schluessel, wert, mitte, klein, rotAb, kmhWert) {
      if (!t.statik || t.statikKey !== sk.max + schluessel) { t.statik = vwStatik(t.S, sk); t.statikKey = sk.max + schluessel; }
      const w = kmhWert !== undefined ? kmhWert : wert / 1000;
      // VW: Zahlen innen, Mitte = Gang (Drehzahlmesser) bzw. km/h
      vwZeichnen(t.g, t.S, t.statik, sk, w, mitte, klein, rotAb === Infinity ? Infinity : rotAb / 1000);
    }

    zerstoeren() {
      if (this.wischer) this.wischer.zerstoeren();
      if (this.wurzel.parentNode) this.wurzel.parentNode.removeChild(this.wurzel);
    }
  }

  K.fuerHud = function (hud, wurzel) { return new Anzeige(hud, wurzel); };
})();
