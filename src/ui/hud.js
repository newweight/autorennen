// ============================================================
// HUD: eine Anzeige pro Spieler-Ansicht (Tacho, Runde, Platz, Zeiten,
// Countdown, Meldungen, Hinweise, Minimap). Reines DOM über dem Canvas.
// Im Split-Screen gibt es zwei HUDs (links / rechts), je eine Bildhälfte.
// Runde 4: wetterSetzen(wetter) → Wetter-Symbol + Windpfeil (relativ zur Fahrtrichtung, Stufe 1–5)
// unter der Rundenanzeige; ohne Aufruf (oder klar + Wind 0) bleibt das HUD wie bisher.
// Runde 4: schadenSetzen(schaden, index) → Gesundheitsbalken (❤️ + Balken grün→gelb→rot) unter der Rundenanzeige,
// nur wenn schaden.an; liegengeblieben: Balken blinkt rot. Meldungen dazu kommen über meldung().
// Runde 5b: polizeiSetzen(polizei, index) → „🚨 Polizei! Anhalten… N s" (Countdown) bzw. „🚨 Polizei!" (verfolgt), Minimap: Streifenwagen blau blinkend.
// ============================================================
(function () {
  const R = window.Rennspiel;

  /** Sekunden → "1:52.3" (null → "–:––.–"). */
  function zeitText(sek) {
    if (sek === null || sek === undefined || !isFinite(sek)) return '–:––.–';
    const zehntel = Math.max(0, Math.round(sek * 10));
    const m = Math.floor(zehntel / 600), s = (zehntel % 600) / 10;
    return m + ':' + (s < 10 ? '0' : '') + s.toFixed(1);
  }
  R.zeitText = zeitText;

  // ---------------------------------------------------------- Minimap
  const MINIMAP_PX = 160;         // Kantenlänge in CSS-Pixeln
  const MINIMAP_RAND = 12;        // Innenabstand (px)
  const KI_FARBE = '#a7adb5';

  /**
   * Minimap: Streckenumriss einmal in ein Offscreen-Canvas zeichnen (je Strecke
   * und Pixeldichte zwischengespeichert, Split-Screen teilt ihn), dann pro Frame
   * nur Bild + Punkte. Norden (−z) ist oben, keine Drehung.
   */
  class Minimap {
    constructor(el, strecke) {
      this.strecke = strecke;
      this.dpr = Math.min(2, (typeof window !== 'undefined' && window.devicePixelRatio) || 1);
      this.canvas = document.createElement('canvas');
      this.canvas.className = 'hud-minimap';
      this.canvas.width = this.canvas.height = Math.round(MINIMAP_PX * this.dpr);
      el.appendChild(this.canvas);
      this.ctx = this.canvas.getContext('2d');
      this.karte = Minimap.vorrendern(strecke, this.canvas.width, this.dpr);
    }

    /** Umriss + Startlinie vorrendern (Cache je Strecke). */
    static vorrendern(strecke, groesse, dpr) {
      const schluessel = strecke.id + ':' + groesse;
      const cache = Minimap._cache || (Minimap._cache = {});
      if (cache[schluessel] && cache[schluessel].strecke === strecke) return cache[schluessel];
      const pk = strecke.spline.punkte;
      let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
      pk.forEach((p) => { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); z0 = Math.min(z0, p.z); z1 = Math.max(z1, p.z); });
      const rand = MINIMAP_RAND * dpr, nutz = groesse - 2 * rand;
      const mass = nutz / Math.max(x1 - x0, z1 - z0);            // Pixel je Meter
      const ox = rand + (nutz - (x1 - x0) * mass) / 2 - x0 * mass;
      const oz = rand + (nutz - (z1 - z0) * mass) / 2 - z0 * mass;
      const nachPx = (x, z) => [ox + x * mass, oz + z * mass];

      const c = document.createElement('canvas');
      c.width = c.height = groesse;
      const g = c.getContext('2d');
      g.lineJoin = g.lineCap = 'round';
      const pfad = () => {
        g.beginPath();
        pk.forEach((p, i) => { const [x, y] = nachPx(p.x, p.z); if (i) g.lineTo(x, y); else g.moveTo(x, y); });
        g.closePath();
      };
      const breite = Math.max(4 * dpr, strecke.breite * mass);
      pfad(); g.strokeStyle = 'rgba(255,255,255,0.9)'; g.lineWidth = breite + 3 * dpr; g.stroke();   // heller Rand
      pfad(); g.strokeStyle = '#3a3f4a'; g.lineWidth = breite; g.stroke();                        // Fahrbahn
      // Startlinie: quer zur Fahrbahn, schwarz-weiß
      const s0 = strecke.spline.punktBei(0), q = breite / mass / 2 + 3;
      const [ax, ay] = nachPx(s0.x - s0.nx * q, s0.z - s0.nz * q), [bx, by] = nachPx(s0.x + s0.nx * q, s0.z + s0.nz * q);
      g.lineCap = 'butt';
      g.strokeStyle = '#fff'; g.lineWidth = 4 * dpr; g.beginPath(); g.moveTo(ax, ay); g.lineTo(bx, by); g.stroke();
      g.setLineDash([2 * dpr, 2 * dpr]);
      g.strokeStyle = '#111'; g.lineWidth = 4 * dpr; g.beginPath(); g.moveTo(ax, ay); g.lineTo(bx, by); g.stroke();
      g.setLineDash([]);
      const eintrag = { strecke, canvas: c, nachPx };
      cache[schluessel] = eintrag;
      return eintrag;
    }

    /** Karte + Punkte für alle Autos zeichnen (Umriss kommt fertig aus dem Offscreen-Canvas). */
    zeichnen(teilnehmer, eigener, polizei) {
      const g = this.ctx, k = this.karte, dpr = this.dpr, farben = R.config.ui.spielerFarben;
      g.clearRect(0, 0, this.canvas.width, this.canvas.height);
      g.drawImage(k.canvas, 0, 0);
      const punkt = (t, r, farbe) => {
        const v = t.vehicle, [x, y] = k.nachPx(v.x, v.z);
        g.beginPath(); g.arc(x, y, r * dpr, 0, Math.PI * 2);
        g.fillStyle = farbe; g.fill();
        g.lineWidth = 1.5 * dpr; g.strokeStyle = '#10182f'; g.stroke();
      };
      // erst KI, dann die anderen Spieler, zuletzt der eigene Punkt (oben, größer)
      teilnehmer.forEach((t) => { if (!t.istSpieler) punkt(t, 3.5, KI_FARBE); });
      // Runde 5b: Streifenwagen blau blinkend (polizei = Liste von Vehicles, .blink = Phase)
      if (polizei) for (let j = 0; j < polizei.length; j++) punkt({ vehicle: polizei[j] }, 4.5, polizei.blink ? '#d6e2ff' : '#2a5cff');
      teilnehmer.forEach((t, i) => { if (t.istSpieler && t !== eigener) punkt(t, 4.5, farben[i] || '#fff'); });
      if (eigener) {
        const i = teilnehmer.indexOf(eigener);
        // heller Hof statt shadowBlur (Weichzeichner ist im 2D-Canvas teuer)
        const v = eigener.vehicle, [x, y] = k.nachPx(v.x, v.z);
        g.beginPath(); g.arc(x, y, 9.5 * dpr, 0, Math.PI * 2);
        g.fillStyle = 'rgba(255,255,255,0.45)'; g.fill();
        punkt(eigener, 6.5, farben[i] || '#fff');
      }
    }
  }
  R.Minimap = Minimap;

  /** Text nur setzen, wenn er sich geändert hat (spart DOM-Arbeit). */
  function setzeText(el, text) {
    if (el._text !== text) { el._text = text; el.textContent = text; }
  }

  /** Element zeigen/verstecken – style nur bei Änderung anfassen (sonst Style-Neuberechnung). */
  function setzeAnzeige(el, an) {
    if (el._an !== an) { el._an = an; el.style.display = an ? '' : 'none'; }
  }

  class Hud {
    /**
     * @param {HTMLElement} wurzel  Container für alle HUDs
     * @param {{rennen:object, teilnehmer:object, fahrzeug:object, nr:number, split:boolean}} opt
     */
    constructor(wurzel, opt) {
      this.rennen = opt.rennen;
      this.t = opt.teilnehmer;
      this.f = opt.fahrzeug;
      this.nr = opt.nr;
      this.split = !!opt.split;
      this.bannerTimer = null;
      this.bannerFest = false;     // Zieleinlauf-Meldung bleibt stehen

      const farbe = R.config.ui.spielerFarben[this.nr] || '#fff';
      const el = document.createElement('div');
      el.className = 'hud ' + (this.split ? (this.nr === 0 ? 'links' : 'rechts') : 'voll');
      el.style.setProperty('--spielerfarbe', farbe);
      el.innerHTML =
        '<div class="hud-oben">' +
          '<div class="chip hud-links">' +
            '<div class="hud-name"></div>' +
            '<div class="hud-runde"></div>' +
            '<div class="hud-gesundheit" style="display:none"><span class="g-herz">❤️</span>' +
              '<span class="g-balken"><i></i></span><b class="g-zahl"></b></div>' +
            '<div class="hud-wetter" style="display:none"><span class="w-symbol"></span>' +
              '<span class="w-wind"><i class="w-pfeil">➜</i><b></b></span></div>' +
          '</div>' +
          '<div class="chip hud-platz"><b></b><span></span></div>' +
          '<div class="chip hud-zeiten">' +
            '<div class="z-aktuell"></div><div class="z-letzte"></div><div class="z-beste"></div>' +
          '</div>' +
        '</div>' +
        '<div class="hud-countdown"></div>' +
        '<div class="hud-banner"></div>' +
        '<div class="hud-hinweis"></div>' +
        '<div class="hud-meldung"></div>' +
        '<div class="hud-tacho"><div class="kmh"><b>0</b><span>km/h</span></div>' +
          '<div class="balken"><i></i></div></div>';
      wurzel.appendChild(el);
      this.el = el;
      this.minimap = this.rennen.strecke ? new Minimap(el, this.rennen.strecke) : null;
      const q = (s) => el.querySelector(s);
      this.eName = q('.hud-name'); this.eRunde = q('.hud-runde');
      this.ePlatz = q('.hud-platz b'); this.ePlatzVon = q('.hud-platz span');
      this.eAktuell = q('.z-aktuell'); this.eLetzte = q('.z-letzte'); this.eBeste = q('.z-beste');
      this.eCountdown = q('.hud-countdown'); this.eBanner = q('.hud-banner'); this.eHinweis = q('.hud-hinweis');
      // Meldung oben (Looping, Bälle, Wasser): Stil hier inline, damit styles.css unverändert bleibt
      this.eMeldung = q('.hud-meldung'); this.meldungTimer = null;
      Object.assign(this.eMeldung.style, { position: 'absolute', left: '50%', top: '19%', transform: 'translateX(-50%) scale(.6)',
        whiteSpace: 'nowrap', fontSize: '2.3em', fontWeight: '900', color: '#fff', padding: '.2em .9em', borderRadius: '1em',
        background: 'linear-gradient(90deg, rgba(255,90,170,.9), rgba(150,110,255,.9))', border: '.08em solid #fff',
        opacity: '0', transition: 'opacity .18s, transform .25s cubic-bezier(.3,1.6,.6,1)', pointerEvents: 'none' });
      this.eKmh = q('.kmh b'); this.eBalken = q('.balken i');
      this.eWetter = q('.hud-wetter'); this.eWSymbol = q('.w-symbol'); this.eWind = q('.w-wind');
      this.eWPfeil = q('.w-pfeil'); this.eWStufe = q('.w-wind b');
      this.wetter = null;
      this.eGesund = q('.hud-gesundheit'); this.eGBalken = q('.g-balken i'); this.eGZahl = q('.g-zahl');
      this.schaden = null; this.schadenIndex = -1;
      if (this.eName) setzeText(this.eName, R.fahrerEmoji(this.t.name) + ' ' + this.t.name);

      // Meldungen bei Rennereignissen
      const r = this.rennen;
      r.bei('runde', (t) => {
        if (t !== this.t || t.runde >= r.runden) return;
        this.banner(t.runde + 1 === r.runden ? 'Letzte Runde!' : 'Runde ' + (t.runde + 1) + '!', 2000, '', t.name);
      });
      r.bei('ziel', (t) => {
        if (t !== this.t) return;
        const platz = t.zielPlatz;
        this.banner('🏁 Platz ' + platz + '!', 0, platz === 1 ? 'gold' : '', t.name);
      });
      // Runde 6 (W3-F): „Letzter fliegt raus" – eigenes Auto ausgeschieden (die Meldung „X ist raus!" für die anderen kommt aus main.js)
      r.bei('raus', (t) => { if (t === this.t) this.banner('🚪 Du bist raus!', 3500, '', t.name); });
    }

    /** Kurze Meldung groß in der Bildmitte (ms = 0: bleibt stehen). Mit `name`: Fahrername in kleiner Zeile darüber. */
    banner(text, ms, klasse, name) {
      const b = this.eBanner;
      clearTimeout(this.bannerTimer);
      if (name) {
        b.innerHTML = '<span class="b-name"></span>';
        b.firstChild.textContent = name;
        b.appendChild(document.createTextNode(text));
      } else b.textContent = text;
      b.className = 'hud-banner an' + (klasse ? ' ' + klasse : '');
      this.bannerFest = !ms;
      if (ms) this.bannerTimer = setTimeout(() => { b.className = 'hud-banner'; }, ms);
    }

    /** Kurze Meldung oben in der Mitte (Looping, Bälle, Wasserstrahl), ms Anzeigedauer. */
    meldung(text, ms) {
      const m = this.eMeldung;
      if (!m) return;
      clearTimeout(this.meldungTimer);
      // Runde 5: lange Meldungen (mit Zeilenumbruch \n, z. B. Anlauf-Hinweis) umbrechen + kleiner, passt auch im Split-Screen
      const lang = String(text).indexOf('\n') >= 0;
      Object.assign(m.style, lang ? { whiteSpace: 'pre-line', width: '86%', boxSizing: 'border-box', textAlign: 'center', fontSize: '1.55em', lineHeight: '1.25' }
        : { whiteSpace: 'nowrap', width: '', textAlign: '', fontSize: '2.3em', lineHeight: '' });
      m.textContent = text;
      m.style.opacity = '1'; m.style.transform = 'translateX(-50%) scale(1)';
      this.meldungText = text;
      this.meldungTimer = setTimeout(() => { m.style.opacity = '0'; m.style.transform = 'translateX(-50%) scale(.6)'; this.meldungText = ''; }, ms || 1800);
    }

    /** Runde 4: Wetter-Objekt (R.Wetter) für Symbol + Windpfeil setzen; null = nichts anzeigen. */
    wetterSetzen(wetter) {
      this.wetter = wetter || null;
      // Runde 6 (W2-D): Tageszeit-Symbol 🌇/🌙 vor dem Wetter-Symbol ('' bei Tag)
      const w = this.wetter, symbol = w ? (w.tageszeitEmoji || '') + w.emoji : '', wind = w ? w.windStaerke : 0;
      setzeText(this.eWSymbol, symbol);
      setzeAnzeige(this.eWSymbol, !!symbol);
      setzeText(this.eWStufe, wind ? String(wind) : '');
      setzeAnzeige(this.eWind, wind > 0);
      setzeAnzeige(this.eWetter, !!symbol || wind > 0);
      this.eWind.title = 'Wind Stärke ' + wind;
    }

    /** Runde 4: Schaden-System (R.Schaden) + Fahrzeug-Index für den Gesundheitsbalken; null/aus = verstecken. */
    schadenSetzen(schaden, index) {
      this.schaden = schaden && schaden.an ? schaden : null;
      this.schadenIndex = index;
      setzeAnzeige(this.eGesund, !!this.schaden);
    }

    /**
     * Runde 5b: Polizei-System (R.Polizei) + Fahrzeug-Index. Anzeige „🚨 Polizei! Anhalten… 10 s" mit Countdown
     * (angehalten) bzw. kleines „🚨 Polizei!" (wird verfolgt); null = nichts.
     */
    /** Runde 6 (W3-H): Item-Symbol (🛢️ + Taste) neben der Minimap, solange das Auto ein Item hält. fahrzeugIndex = Fahrzeugnummer. */
    itemSetzen(pickups, fahrzeugIndex) {
      this.pickups = pickups && pickups.faesser && pickups.faesser.length ? pickups : null;
      this.itemIndex = fahrzeugIndex;
      if (!this.pickups) { if (this.eItem) setzeAnzeige(this.eItem, false); return; }
      if (!this.eItem) {
        const e = document.createElement('div');
        e.className = 'hud-item';
        Object.assign(e.style, { position: 'absolute', left: this.split && this.nr === 1 ? '1.6em' : '1em', bottom: 'calc(1em + 168px)', whiteSpace: 'nowrap',
          fontSize: '1.5em', fontWeight: '900', color: '#fff', padding: '.15em .55em', borderRadius: '.8em', border: '.07em solid #fff',
          background: 'rgba(20,20,30,.78)', pointerEvents: 'none', display: 'none', textShadow: '0 .05em .1em rgba(0,0,0,.5)' });
        this.el.appendChild(e);
        this.eItem = e;
      }
    }

    _itemAnzeigen() {
      const it = this.pickups.itemVon(this.itemIndex), e = this.eItem;
      const text = it ? '🛢️ ' + (this.nr === 1 ? 'E' : 'Leertaste') : '';
      setzeText(e, text);
      setzeAnzeige(e, !!text);
    }

    polizeiSetzen(polizei, index) {
      this.polizei = polizei || null;
      this.polizeiIndex = index;
      if (!this.polizei) { if (this.ePolizei) setzeAnzeige(this.ePolizei, false); return; }
      if (!this.ePolizei) {
        const e = document.createElement('div');
        e.className = 'hud-polizei';
        Object.assign(e.style, { position: 'absolute', left: '50%', top: '31%', transform: 'translateX(-50%)', whiteSpace: 'nowrap',
          fontSize: '2.1em', fontWeight: '900', color: '#fff', padding: '.25em .9em', borderRadius: '1em', border: '.08em solid #fff',
          background: 'linear-gradient(90deg, rgba(40,90,255,.92), rgba(255,40,40,.92))', pointerEvents: 'none', display: 'none',
          textShadow: '0 .06em .12em rgba(0,0,0,.4)' });
        this.el.appendChild(e);
        this.ePolizei = e;
      }
    }

    _polizeiAnzeigen() {
      const a = this.polizei.anzeige(this.polizeiIndex), e = this.ePolizei;
      let text = '';
      if (a && a.art === 'stopp') text = '🚨 Polizei! Anhalten… ' + a.rest + ' s';
      else if (a && a.art === 'verfolgt') text = '🚨 Polizei!';
      setzeText(e, text);
      const klein = !!a && a.art === 'verfolgt';
      if (e._klein !== klein) { e._klein = klein; e.style.fontSize = klein ? '1.3em' : '2.1em'; e.style.top = klein ? '12%' : '31%'; }
      setzeAnzeige(e, !!text);
    }

    /**
     * Runde 6 (W3-G): Münzzähler „🪙 n" unter Name/Runde (n = in diesem Rennen gesammelt); plus > 0 → kurzes „+1"-Hüpfen.
     * null = verstecken (Rennen ohne Münzen).
     */
    muenzenSetzen(n, plus) {
      if (n === null || n === undefined) { if (this.eMuenzen) setzeAnzeige(this.eMuenzen, false); return; }
      if (!this.eMuenzen) {
        const e = document.createElement('div');
        e.className = 'hud-muenzen';
        e.innerHTML = '<span class="mz-zahl"></span><b class="mz-plus"></b>';
        Object.assign(e.style, { fontWeight: '900', fontSize: '1.05em', position: 'relative', whiteSpace: 'nowrap' });
        const p = e.querySelector('.mz-plus');
        Object.assign(p.style, { position: 'absolute', left: '100%', marginLeft: '.35em', top: '0', color: '#ffd23a', opacity: '0',
          transition: 'opacity .15s, transform .45s', textShadow: '0 .05em .1em rgba(0,0,0,.6)', pointerEvents: 'none' });
        const links = this.el.querySelector('.hud-links');
        (links || this.el).insertBefore(e, this.eGesund || null);
        this.eMuenzen = e; this.eMzZahl = e.querySelector('.mz-zahl'); this.eMzPlus = p;
      }
      setzeAnzeige(this.eMuenzen, true);
      setzeText(this.eMzZahl, '🪙 ' + n);
      this.muenzenZahl = n;
      if (plus > 0) {
        const p = this.eMzPlus;
        setzeText(p, '+' + plus);
        p.style.transition = 'none'; p.style.opacity = '1'; p.style.transform = 'translateY(0) scale(1.3)';
        void p.offsetWidth;
        p.style.transition = 'opacity .5s .35s, transform .8s'; p.style.opacity = '0'; p.style.transform = 'translateY(-.9em) scale(1)';
      }
    }

    /** Gesundheitsbalken: Breite = Prozent, Farbe grün (> 60 %) → gelb (> 30 %) → rot; liegengeblieben blinkt. */
    _gesundheitAnzeigen() {
      const z = this.schaden.zustand(this.schadenIndex), p = z.prozent;
      const breite = p + '%';
      if (this.eGBalken._b !== breite) {
        this.eGBalken._b = breite;
        this.eGBalken.style.width = breite;
        this.eGBalken.style.background = p > 60 ? '#3ddc6a' : p > 30 ? '#ffd23a' : '#ff4a3a';
      }
      setzeText(this.eGZahl, p + '%');
      this.eGesund.classList.toggle('kaputt', !!z.liegengeblieben);
    }

    /** Windpfeil drehen: Pfeil zeigt, wohin der Wind weht (oben = Rückenwind, rechts = drückt nach rechts). */
    _windAnzeigen(v) {
      const w = this.wetter;
      if (!w || !(w.windStaerke > 0)) return;
      const r = w.windFuer(v);
      const grad = Math.round(Math.atan2(r.seitlich, r.laengs) * 180 / Math.PI / 5) * 5;   // 5°-Schritte: wenig DOM-Arbeit
      if (this.eWPfeil._grad !== grad) {
        this.eWPfeil._grad = grad;
        this.eWPfeil.style.transform = 'rotate(' + (grad - 90) + 'deg)';   // ➜ zeigt nach rechts → −90° = oben
        // Seitenwind kräftig (> 60° zur Fahrtrichtung): Pfeil orange
        const seit = Math.abs(Math.abs(grad) - 90) < 30;
        this.eWind.classList.toggle('seite', seit);
      }
    }

    /** Schriftgröße an die Größe der Ansicht anpassen. */
    groesse(w, h) {
      this.el.style.fontSize = Math.max(11, Math.min(w / 40, h / 36)) + 'px';
    }

    update() {
      const r = this.rennen, t = this.t, f = this.f, v = f.vehicle;

      // Tacho
      const kmh = Math.abs(Math.round(v.vLaengs * 3.6));
      setzeText(this.eKmh, String(kmh));
      const anteil = Math.min(1, kmh / R.config.ui.tachoMaxKmh);
      const breite = (anteil * 100).toFixed(0) + '%';
      if (this.eBalken._b !== breite) {
        this.eBalken._b = breite;
        this.eBalken.style.width = breite;
        this.eBalken.style.background = anteil < 0.5 ? '#3ddc6a' : anteil < 0.8 ? '#ffd23a' : '#ff5a3a';
      }

      // Runde / Platz / Zeiten
      const runde = Math.min(r.runden, t.runde + 1);
      setzeText(this.eRunde, 'Runde ' + runde + '/' + r.runden);
      setzeText(this.ePlatz, t.imZiel && t.zielPlatz ? t.zielPlatz + '.' : t.platz + '.');
      setzeText(this.ePlatzVon, 'von ' + r.teilnehmer.length);
      const aktuell = t.imZiel ? t.zielZeit : r.rundenzeit(t);
      setzeText(this.eAktuell, '⏱ ' + zeitText(aktuell));
      const letzte = t.rundenzeiten.length ? t.rundenzeiten[t.rundenzeiten.length - 1] : null;
      setzeText(this.eLetzte, 'Letzte ' + zeitText(letzte));
      setzeText(this.eBeste, 'Beste ' + zeitText(t.bestzeit));

      // Countdown 3-2-1-LOS
      let cd = '';
      if (r.countdownZahl > 0) cd = String(r.countdownZahl);
      else if (r.zustand !== 'countdown' && r.zeit < 1.0) cd = 'LOS!';
      if (this.eCountdown._text !== cd) {
        setzeText(this.eCountdown, cd);
        this.eCountdown.classList.remove('puls');
        void this.eCountdown.offsetWidth;   // Animation neu starten
        if (cd) this.eCountdown.classList.add('puls');
      }
      setzeAnzeige(this.eCountdown, !!cd);

      // Hinweise
      let hinweis = '';
      if (t.ausgeschieden) {          // W3-F: Zuschauer-Kamera auf den Führenden
        const fuehrend = r.rangliste && r.rangliste.find((x) => !x.ausgeschieden);
        hinweis = '👀 Du schaust zu' + (fuehrend ? ': ' + fuehrend.name : '');
      } else if (!t.imZiel) {
        if (f.resetHinweis) hinweis = 'Festgefahren? ' + (this.nr === 0 ? 'R' : 'T') + ' drücken';
        else if (f.falschHerum) hinweis = '↩ Falsch herum!';
      }
      setzeText(this.eHinweis, hinweis);
      setzeAnzeige(this.eHinweis, !!hinweis);

      if (this.wetter) this._windAnzeigen(v);
      if (this.schaden) this._gesundheitAnzeigen();
      if (this.polizei && this.ePolizei) this._polizeiAnzeigen();
      if (this.pickups && this.eItem) this._itemAnzeigen();
      if (this.minimap) this.minimap.zeichnen(r.teilnehmer, t, this.polizei ? this.polizei.minimapPunkte() : null);
    }

    zerstoeren() {
      clearTimeout(this.bannerTimer); clearTimeout(this.meldungTimer);
      if (this.el.parentNode) this.el.parentNode.removeChild(this.el);
    }
  }

  R.Hud = Hud;
})();
