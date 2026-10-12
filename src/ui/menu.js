// ============================================================
// Menü, Ergebnis-Tafel und Pause als HTML-Overlay über dem Canvas.
//
// Hauptmenü in 5 Schritten (alles per Tastatur UND Maus):
//   1 Modus  2 Strecke (+ Welt)  3 Fahrer (je Spieler)  4 Auto (je Spieler)  5 Einstellungen + Start
// Tasten: Pfeile bzw. WASD bewegen, Enter/Leertaste = weiter, Esc = zurück.
// Runde 4: Strecken-Schritt hat eine Zeile „Welt“ (←→ Strecke, ↑↓ Welt; einstellungen.welt, '' = Standard der Strecke).
// Einstellungen-Schritt in zwei Spalten: links Rennen (Runden, Gegner bis 10, Stärke, Fahrhilfe),
// rechts Welt-Extras (Jahreszeit, Wetter je Jahreszeit+Thema aus wetter.js, Wind 0–5/🎲, Schaden aus/an).
// Im Fahrer- und Auto-Schritt steuert Spieler 1 mit den Pfeilen, Spieler 2 mit WASD.
// Zwei Spieler können nicht denselben Fahrer wählen (der Bewegende springt weiter).
// Das Menü ändert nur spiel.einstellungen (und speichert sie); gestartet
// wird mit spiel.rennenStarten().
// ============================================================
(function () {
  const R = window.Rennspiel;

  const SPALTEN = 3;                       // Auto-Raster
  const FAHRER_SPALTEN = { solo: 6, zwei: 3 };   // Fahrer-Raster (12 Karten: 6×2 bzw. je Spieler 3×4)
  const SCHRITTE = [
    { id: 'modus', name: 'Modus' },
    { id: 'strecke', name: 'Strecke' },
    { id: 'fahrer', name: 'Fahrer' },
    { id: 'auto', name: 'Auto' },
    { id: 'start', name: 'Los!' },
  ];
  // Bühne drehen (Auto-Schritt): Spieler 1 mit , und . — Spieler 2 mit Q und E (im Solo-Modus gelten beide)
  const DREH_TASTEN = { Comma: [0, -1], Period: [0, 1], KeyQ: [1, -1], KeyE: [1, 1] };
  const BUEHNE = { solo: { w: 480, h: 300 }, zwei: { w: 380, h: 240 } };   // Renderauflösung der Bühne
  const HEX = (n) => '#' + (n >>> 0).toString(16).padStart(6, '0');
  const WIND_FOLGE = [0, 1, 2, 3, 4, 5, 'zufall'];   // Runde 4: Reihenfolge des Wind-Steppers (🎲 = zufällig)

  // ---------- Hilfsfunktionen ----------

  /** Einfaches Auto-Bild (Seitenansicht, Front rechts) in der Autofarbe. */
  function autoSvg(a) {
    const farbe = HEX(a.farbe), dach = a.farbe2 !== undefined ? HEX(a.farbe2) : farbe;
    // [Dachhöhe, Kabine hinten, Kabine vorn, Karosserie hinten, Karosserie vorn]
    const form = {
      van: [5, 20, 100, 6, 114], kombi: [11, 18, 94, 6, 114], limousine: [11, 28, 92, 6, 114],
      coupe: [13, 32, 90, 6, 114], sportwagen: [17, 36, 86, 6, 114], kleinwagen: [11, 30, 88, 14, 106],
      suv: [9, 22, 94, 6, 114], cabrio: [20, 52, 88, 6, 114],
    }[a.karosserie] || [11, 28, 92, 6, 114];
    const [oben, kh, kv, bh, bv] = form;
    const cabrio = a.karosserie === 'cabrio';
    const kabine = `M${kh} 28 L${kh + 11} ${oben} L${kv - 11} ${oben} L${kv} 28 Z`;
    const fenster = `M${kh + 7} 28 L${kh + 14} ${oben + 4} L${kv - 13} ${oben + 4} L${kv - 5} 28 Z`;
    return `<svg viewBox="0 0 120 56" aria-hidden="true">` +
      `<ellipse cx="60" cy="52" rx="52" ry="3.5" fill="rgba(0,0,0,.25)"/>` +
      `<path d="${kabine}" fill="${cabrio ? '#2a2a2a' : dach}" stroke="rgba(0,0,0,.35)" stroke-width="1.5"/>` +
      `<path d="${fenster}" fill="#bfe6ff" opacity=".9"/>` +
      `<rect x="${bh}" y="26" width="${bv - bh}" height="17" rx="7" fill="${farbe}" stroke="rgba(0,0,0,.4)" stroke-width="1.5"/>` +
      `<rect x="${bv - 8}" y="29" width="6" height="4" rx="2" fill="#fff6c8"/>` +
      `<circle cx="${bh + 24}" cy="44" r="9" fill="#222"/><circle cx="${bh + 24}" cy="44" r="4" fill="#ccc"/>` +
      `<circle cx="${bv - 24}" cy="44" r="9" fill="#222"/><circle cx="${bv - 24}" cy="44" r="4" fill="#ccc"/>` +
      `</svg>`;
  }

  /** Fahrwerte auf 0.3..1 normieren (kleinster Katalogwert = 30 %). */
  function normiert() {
    const kat = R.carCatalog.waehlbare();
    const felder = { tempo: 'vMax', start: 'beschleunigung', kurven: 'wendigkeit' };
    const grenzen = {};
    Object.keys(felder).forEach((k) => {
      const w = kat.map((a) => a.fahrwerte[felder[k]]);
      grenzen[k] = [Math.min(...w), Math.max(...w)];
    });
    return (a, k) => {
      const [lo, hi] = grenzen[k], x = a.fahrwerte[felder[k]];
      return hi > lo ? 0.3 + 0.7 * (x - lo) / (hi - lo) : 1;
    };
  }

  function el(tag, klasse, parent) {
    const e = document.createElement(tag);
    if (klasse) e.className = klasse;
    if (parent) parent.appendChild(e);
    return e;
  }

  // ============================================================
  // Hauptmenü
  // ============================================================
  class Menue {
    constructor(spiel, ui) {
      this.spiel = spiel;
      this.wurzel = el('div', 'overlay menue', ui);
      this.wurzel.id = 'menue';
      this.schritt = 0;
      this.fokus = 0;               // Zeile im Einstellungs-Schritt
      this.sichtbar = false;
      this.tafelOffen = false;      // Runde 4: Steuerungs-Tafel im Einstellungen-Schritt aufgeklappt?
      this._bgTimer = null;
      this.norm = normiert();
      this.wurzel.addEventListener('click', (e) => {
        const t = e.target.closest('[data-a]');
        if (t) this.aktion(t.dataset.a);
      });
      // Kachelbilder der Autos einmal im Leerlauf erzeugen (danach nur Cache)
      if (R.AutoVorschau) setTimeout(() => { try { R.AutoVorschau.alleKacheln(); } catch (e) { /* egal */ } }, 600);
    }

    get e() { return this.spiel.einstellungen; }
    get zwei() { return this.e.modus === 'zwei'; }

    zeigen(schritt) {
      this.sichtbar = true;
      this.schritt = schritt === undefined ? 0 : schritt;
      this.fokus = 0;
      this.wurzel.style.display = '';
      this.weltFix();
      this.spiel.menueHintergrund(this.e.streckeId);
      this.zeichnen();
    }
    verstecken() {
      this.sichtbar = false; this.wurzel.style.display = 'none';
      if (R.AutoVorschau) R.AutoVorschau.stoppen();
    }

    /** Fokus-Reihenfolge: linke Spalte (Rennen), rechte Spalte (Welt-Extras), dann Start. */
    zeilen() {
      const z = ['runden', 'gegner', 'schwierigkeit', 'hilfe0'];
      if (this.e.spielart === 'pokal') z.unshift('pokal');     // Runde 6 (W3-F): Pokal-Größe 3/4/5 Rennen
      if (this.zwei) z.push('hilfe1');
      z.push('tageszeit');      // Runde 6 (W2-D): unten in der linken Spalte (rechts ist kein Platz mehr)
      z.push('jahreszeit', 'wetter', 'wind', 'schaden', 'tempo', 'polizei', 'rempeln', 'start');   // Runde 5: Tempo-Klasse, 5b: Polizei, 6: Rempeln
      return z;
    }

    // ---------- Runde 4: Welt / Jahreszeit / Wetter ----------
    streckeDaten(id) { return R.trackCatalog.find((s) => s.id === (id || this.e.streckeId)) || R.trackCatalog[0]; }
    /** Gültige Welt der gewählten Strecke: Name oder '' (= Standard). */
    weltGueltig() {
      const d = this.streckeDaten(), w = this.e.welt;
      return w && d.welten && d.welten[w] && w !== d.weltStandard ? w : '';
    }
    /** Welten der Strecke: [{ k, info, standard }] in Katalogreihenfolge. */
    weltListe(id) {
      const d = this.streckeDaten(id), info = R.weltInfo || {};
      return Object.keys(d.welten || {}).map((k) => ({
        k, info: info[k] || { name: k, emoji: '🌍', beschreibung: '' }, standard: k === d.weltStandard,
      }));
    }
    // ---------- Runde 6 (W2-E): Streckenvariante (Normal / XL), Taste V ----------
    /** Varianten der Strecke: [{ k, name, beschreibung }] – Normal ('' ) zuerst; leer, wenn die Strecke keine hat. */
    varianteListe(id) {
      const d = this.streckeDaten(id), v = d.varianten || {};
      const ks = Object.keys(v);
      if (!ks.length) return [];
      return [{ k: '', name: 'Normal', beschreibung: 'Die Strecke in der gewohnten Länge.' }]
        .concat(ks.map((k) => ({ k, name: v[k].name || k, beschreibung: v[k].beschreibung || '' })));
    }
    /** Gültige Variante der gewählten Strecke: Name oder '' (= Normal). */
    varianteGueltig() {
      const d = this.streckeDaten(), v = this.e.variante;
      return v && d.varianten && d.varianten[v] ? v : '';
    }
    varianteSetzen(k) {
      this.e.variante = k;
      this.varianteFix();
      this.hintergrundNeu();
    }
    varianteFix() { this.e.variante = this.varianteGueltig(); }
    /** Variante um eins weiterschalten (Taste V): Normal → XL → Normal. */
    varianteBewegen() {
      const l = this.varianteListe();
      if (!l.length) return;
      const i = Math.max(0, l.findIndex((x) => x.k === this.varianteGueltig()));
      this.varianteSetzen(l[(i + 1) % l.length].k);
    }

    /** Jahreszeit-Pillen für das Thema der Strecke (Wüste: Winter = Sandsturm-Zeit). */
    jahreszeitListe() {
      const thema = this.streckeDaten().thema, J = R.config.jahreszeiten || {};
      const erl = (jz) => (R.Wetter && R.Wetter.erlaubt ? R.Wetter.erlaubt(thema, jz) : (J[jz].wetter || ['klar']));
      const liste = Object.keys(J).filter((k) => erl(k).length > 0).map((k) => {
        const wuesteWinter = thema === 'wueste' && k === 'winter';
        return { k, text: wuesteWinter ? '🌪️ Sandsturm-Zeit' : `${J[k].emoji} ${J[k].name}` };
      });
      liste.push({ k: 'zufall', text: '🎲 Zufall' });
      return liste;
    }
    /** Wetter-Pillen für Thema + gewählte Jahreszeit (ungültige ausgeblendet). */
    wetterListe() {
      const thema = this.streckeDaten().thema, W = R.config.wetter || {}, jz = this.e.jahreszeit;
      let ks = ['klar'];
      if (jz !== 'zufall') ks = R.Wetter && R.Wetter.erlaubt ? R.Wetter.erlaubt(thema, jz) : ['klar'];
      const liste = ks.map((k) => ({ k, text: `${W[k].emoji || '☀️'} ${W[k].name}` }));
      liste.push({ k: 'zufall', text: '🎲 Zufall' });
      return liste;
    }
    /** Ungültige Welt/Wetter-Kombinationen (z. B. nach Streckenwechsel) zurücksetzen. */
    weltFix() {
      const e = this.e;
      e.welt = this.weltGueltig();
      e.variante = this.varianteGueltig();
      if (!this.jahreszeitListe().some((x) => x.k === e.jahreszeit)) e.jahreszeit = 'sommer';
      if (!this.wetterListe().some((x) => x.k === e.wetter)) e.wetter = 'klar';
    }
    /** Menü-Hintergrund mit neuer Welt/Jahreszeit/Wetter neu aufbauen (kurz verzögert, damit Klicks nicht ruckeln). */
    hintergrundNeu() {
      clearTimeout(this._bgTimer);
      this._bgTimer = setTimeout(() => {
        if (!this.sichtbar || this.spiel.zustand !== 'menue') return;
        try { this.spiel.szeneAbbauen(); this.spiel.menueHintergrund(this.e.streckeId); } catch (err) { /* Hintergrund ist nur Deko */ }
      }, 250);
    }
    /** Streckenwechsel: Welt zurück auf Standard, Wetter prüfen. */
    streckeWaehlen(id) {
      if (this.e.streckeId !== id) { this.e.streckeId = id; this.e.welt = ''; this.e.variante = ''; this.weltFix(); }
      this.spiel.menueHintergrund(id);
    }
    /** Welt der Strecke um `d` weiterschalten (Tastatur ↑↓). */
    weltBewegen(d) {
      const l = this.weltListe(), akt = this.weltGueltig() || this.streckeDaten().weltStandard;
      const i = Math.max(0, l.findIndex((w) => w.k === akt));
      this.weltSetzen(l[(i + d + l.length) % l.length].k);
    }
    weltSetzen(k) {
      this.e.welt = k === this.streckeDaten().weltStandard ? '' : k;
      this.hintergrundNeu();
    }

    aenderung() {
      this.spiel.einstellungenSpeichern();
      this.zeichnen();
    }

    // ---------- Eingabe ----------
    /** Taste im Menü. Gibt true zurück, wenn sie verwendet wurde. */
    taste(code) {
      if (this.garageUi && this.garageUi.sichtbar) return this.garageUi.taste(code);   // Runde 6 (W3-G): Garage offen
      const T = R.config.tasten;
      const P1 = T.spieler[0], P2 = T.spieler[1];
      const richtung = (c) => {
        if (c === P1.links || c === P2.links) return [-1, 0];
        if (c === P1.rechts || c === P2.rechts) return [1, 0];
        if (c === P1.gas || c === P2.gas) return [0, -1];
        if (c === P1.bremse || c === P2.bremse) return [0, 1];
        return null;
      };
      if (code === T.pause) { this.zurueck(); return true; }
      if (T.bestaetigen.includes(code)) { this.weiter(); return true; }
      const id = SCHRITTE[this.schritt].id;
      if (id === 'modus' && code === 'KeyG' && R.Garage) { this.garageOeffnen(); return true; }   // W3-G: Taste G = Garage
      if (id === 'auto' && DREH_TASTEN[code] && R.AutoVorschau) {
        const [sp, r] = DREH_TASTEN[code];
        R.AutoVorschau.drehen(this.zwei ? sp : 0, r);
        return true;
      }
      if (id === 'strecke' && code === 'KeyV' && this.varianteListe().length) {   // Runde 6: Variante Normal/XL
        this.varianteBewegen();
        this.aenderung();
        return true;
      }
      const rich = richtung(code);
      if (!rich) return false;
      const [dx, dy] = rich;

      if (id === 'modus') {
        // Runde 6 (W3-F): ←→ wandert über die Karten Allein · Zu zweit · Pokal · Letzter fliegt raus,
        // ↑↓ schaltet bei Pokal/„Letzter fliegt raus" allein ↔ zu zweit
        const e = this.e, sa = e.spielart || 'rennen';
        if (dx) {
          const karten = ['solo', 'zwei', 'pokal', 'elimination'];
          const i = sa === 'rennen' ? (e.modus === 'zwei' ? 1 : 0) : karten.indexOf(sa);
          this.modusKarte(karten[(i + dx + 4) % 4]);
        } else if (sa !== 'rennen') e.modus = e.modus === 'solo' ? 'zwei' : 'solo';
        else e.modus = e.modus === 'solo' ? 'zwei' : 'solo';
        this.einstellungenFix();
        this.aenderung();
      } else if (id === 'strecke') {
        if (dy) this.weltBewegen(dy);              // ↑↓ Welt, ←→ Strecke
        else {
          const liste = R.trackCatalog, i = liste.findIndex((s) => s.id === this.e.streckeId);
          this.streckeWaehlen(liste[(i + dx + liste.length * 2) % liste.length].id);
        }
        this.aenderung();
      } else if (id === 'auto' || id === 'fahrer') {
        const spieler = [];
        if (!this.zwei) spieler.push(0);
        else {
          if (code === P1.links || code === P1.rechts || code === P1.gas || code === P1.bremse) spieler.push(0);
          if (code === P2.links || code === P2.rechts || code === P2.gas || code === P2.bremse) spieler.push(1);
        }
        spieler.forEach((s) => (id === 'auto' ? this.autoBewegen(s, dx, dy) : this.fahrerBewegen(s, dx, dy)));
        this.aenderung();
      } else {
        const z = this.zeilen();
        if (dy) this.fokus = (this.fokus + dy + z.length) % z.length;
        else this.zeilenWert(z[this.fokus], dx);
        this.aenderung();
      }
      return true;
    }

    autoBewegen(spieler, dx, dy) {
      const kat = R.carCatalog.waehlbare(), n = kat.length;
      let i = kat.findIndex((a) => a.id === this.e.autoIds[spieler]);
      if (i < 0) i = 0;
      i = dx ? (i + dx + n) % n : (i + dy * SPALTEN + n * 2) % n;
      this.e.autoIds[spieler] = kat[i].id;
    }

    /** Fahrer-Cursor von Spieler `spieler` bewegen; der Fahrer des anderen Spielers wird übersprungen. */
    fahrerBewegen(spieler, dx, dy) {
      const liste = R.config.fahrer, n = liste.length;
      const spalten = FAHRER_SPALTEN[this.zwei ? 'zwei' : 'solo'];
      let i = liste.findIndex((f) => f.name === this.e.fahrer[spieler]);
      if (i < 0) i = 0;
      const andere = this.zwei ? liste.findIndex((f) => f.name === this.e.fahrer[1 - spieler]) : -1;
      const schritt = dx || dy * spalten;
      for (let k = 0; k < n; k++) {
        i = (i + schritt + n * 4) % n;
        if (i !== andere) break;
      }
      this.e.fahrer[spieler] = liste[i].name;
    }

    /** Wert einer Einstellungs-Zeile um dx Schritte ändern. */
    zeilenWert(zeile, dx) {
      const rc = R.config.rennen, e = this.e;
      const klemme = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
      const elim = e.spielart === 'elimination', minG = elim ? ((R.config.pokal && R.config.pokal.elimination && R.config.pokal.elimination.minGegner) || 3) : 0;
      if (zeile === 'runden') { if (!elim) e.runden = klemme(e.runden + dx, rc.rundenMin, rc.rundenMax); }   // W3-F: Elimination = automatisch
      else if (zeile === 'gegner') e.gegner = klemme(Math.max(minG, e.gegner) + dx, minG, rc.gegnerMax);
      else if (zeile === 'pokal') {           // W3-F: 3 / 4 / 5 Rennen
        const gs = (R.config.pokal && R.config.pokal.groessen) || [3, 4, 5], i = gs.indexOf(e.pokalGroesse);
        e.pokalGroesse = gs[klemme((i < 0 ? 0 : i) + dx, 0, gs.length - 1)];
      }
      else if (zeile === 'schwierigkeit' || zeile.startsWith('hilfe')) {
        const hilfe = zeile.startsWith('hilfe'), sp = hilfe ? +zeile.slice(5) : 0;
        const keys = Object.keys(hilfe ? R.config.fahrhilfen : R.config.schwierigkeiten);
        const aktuell = hilfe ? e.fahrhilfe[sp] : e.schwierigkeit;
        const neu = keys[klemme(keys.indexOf(aktuell) + dx, 0, keys.length - 1)];
        if (hilfe) e.fahrhilfe[sp] = neu; else e.schwierigkeit = neu;
      } else if (zeile === 'jahreszeit' || zeile === 'wetter') {
        const l = (zeile === 'jahreszeit' ? this.jahreszeitListe() : this.wetterListe()).map((x) => x.k);
        const i = l.indexOf(e[zeile]);
        this.wertSetzen(zeile, l[klemme((i < 0 ? 0 : i) + dx, 0, l.length - 1)]);
      } else if (zeile === 'wind') {
        const i = WIND_FOLGE.indexOf(e.windStaerke);
        e.windStaerke = WIND_FOLGE[klemme((i < 0 ? 0 : i) + dx, 0, WIND_FOLGE.length - 1)];
      } else if (zeile === 'schaden') {
        if (dx) e.schaden = dx > 0;
      } else if (zeile === 'tempo') {
        if (dx) e.tempoKlasse = dx > 0 ? 'schnell' : 'normal';
      } else if (zeile === 'polizei') {
        if (dx) e.polizei = dx > 0;
      } else if (zeile === 'tageszeit') {      // Runde 6 (W2-D): Tag → Dämmerung → Nacht
        const l = Object.keys(R.config.tageszeit || { tag: 1 }), i = l.indexOf(e.tageszeit || 'tag');
        this.wertSetzen('tageszeit', l[klemme((i < 0 ? 0 : i) + dx, 0, l.length - 1)]);
      } else if (zeile === 'rempeln') {
        if (dx) e.rempeln = dx > 0 ? 'echt' : 'sanft';
      }
    }

    /** Pillen-Wert setzen (Maus und Tastatur). Jahreszeit-Wechsel setzt das Wetter auf klar. */
    wertSetzen(zeile, k) {
      const e = this.e;
      if (zeile === 'schwierigkeit') e.schwierigkeit = k;
      else if (zeile.startsWith('hilfe')) e.fahrhilfe[+zeile.slice(5)] = k;
      else if (zeile === 'jahreszeit') { if (e.jahreszeit !== k) { e.jahreszeit = k; e.wetter = 'klar'; this.hintergrundNeu(); } }
      else if (zeile === 'wetter') { if (e.wetter !== k) { e.wetter = k; this.hintergrundNeu(); } }
      else if (zeile === 'wind') e.windStaerke = k === 'zufall' ? 'zufall' : +k;
      else if (zeile === 'schaden') e.schaden = k === 'an';
      else if (zeile === 'tempo' && R.config.tempoKlassen[k]) e.tempoKlasse = k;
      else if (zeile === 'polizei') e.polizei = k === 'an';
      else if (zeile === 'rempeln') e.rempeln = k === 'echt' ? 'echt' : 'sanft';
      else if (zeile === 'tageszeit') { if (R.config.tageszeit && R.config.tageszeit[k] && e.tageszeit !== k) { e.tageszeit = k; this.hintergrundNeu(); } }
    }

    weiter() {
      if (this.schritt < SCHRITTE.length - 1) { this.schritt++; this.fokus = 0; this.zeichnen(); return; }
      const z = this.zeilen();
      if (z[this.fokus] === 'start') this.starten();
      else { this.fokus++; this.zeichnen(); }
    }
    zurueck() {
      if (this.schritt > 0) { this.schritt--; this.zeichnen(); }
    }
    starten() {
      this.spiel.einstellungenSpeichern();
      if (this.e.spielart === 'pokal' && this.spiel.pokalStarten) this.spiel.pokalStarten();   // Runde 6 (W3-F)
      else this.spiel.rennenStarten();
    }
    /** Runde 6 (W3-F): Modus-Karte wählen: 'solo'/'zwei' = Einzelrennen, 'pokal'/'elimination' = Spielart (Spielerzahl bleibt). */
    modusKarte(k) {
      const e = this.e;
      if (k === 'solo' || k === 'zwei') { e.modus = k; e.spielart = 'rennen'; }
      else if (k === 'pokal' || k === 'elimination') {
        e.spielart = k;
        const minG = (R.config.pokal && R.config.pokal.elimination && R.config.pokal.elimination.minGegner) || 3;
        if (k === 'elimination' && e.gegner < minG) e.gegner = minG;
      }
    }

    aktion(a) {
      const [art, p1, p2] = a.split(':');
      const e = this.e;
      if (art === 'garage') return this.garageOeffnen();      // Runde 6 (W3-G)
      if (art === 'schritt') { this.schritt = +p1; this.fokus = 0; }
      else if (art === 'weiter') return this.weiter();
      else if (art === 'zurueck') return this.zurueck();
      else if (art === 'modus') { this.modusKarte(p1); this.einstellungenFix(); this.schritt = 1; }
      else if (art === 'spieler') { e.modus = p1 === 'zwei' ? 'zwei' : 'solo'; if (p2) this.modusKarte(p2); this.einstellungenFix(); }   // W3-F: Pille auf Pokal-/Raus-Karte
      else if (art === 'pokalgroesse') { e.pokalGroesse = +p1; this.modusKarte('pokal'); }
      else if (art === 'strecke') this.streckeWaehlen(p1);     // bleibt im Schritt: darunter die Welt wählen, dann „Weiter“
      else if (art === 'welt') this.weltSetzen(p1);
      else if (art === 'variante') this.varianteSetzen(p1);
      else if (art === 'tafel') this.tafelOffen = !this.tafelOffen;
      else if (art === 'auto') e.autoIds[+p1] = p2;
      else if (art === 'fahrer') {
        const sp = +p1;
        e.fahrer[sp] = p2;
        if (this.zwei && e.fahrer[1 - sp] === p2) this.fahrerBewegen(sp, 1, 0);   // schon vergeben → weiterspringen
      }
      else if (art === 'stepper') this.zeilenWert(p1, +p2);
      else if (art === 'wert') this.wertSetzen(p1, p2);
      else if (art === 'fokus') this.fokus = +p1;
      else if (art === 'start') return this.starten();
      else if (art === 'ton') { if (R.Audio) R.Audio.schalten(); }
      if (R.Audio) R.Audio.menueKlick();
      this.aenderung();
    }
    einstellungenFix() {
      this.fokus = Math.min(this.fokus, this.zeilen().length - 1);
      if (this.zwei) this.e.fahrer = R.fahrerEindeutig(this.e.fahrer);
    }

    // ---------- Darstellung ----------
    zeichnen() {
      if (!this.sichtbar) return;
      const id = SCHRITTE[this.schritt].id;
      const kopf = SCHRITTE.map((s, i) =>
        `<div class="m-schritt${i === this.schritt ? ' aktiv' : ''}${i < this.schritt ? ' fertig' : ''}" data-a="schritt:${i}">` +
        `<b>${i + 1}</b> ${s.name}</div>`).join('<span class="m-pfeil">›</span>');
      let inhalt = '', hinweis = '', titel = '';
      if (id === 'modus') { titel = 'Wie wollt ihr fahren?'; inhalt = this.htmlModus() + this.htmlGarageKarte(); hinweis = '<kbd>←</kbd><kbd>→</kbd> auswählen · <kbd>Enter</kbd> weiter' + (R.Garage ? ' · <kbd>G</kbd> Garage' : ''); }
      if (id === 'strecke') { titel = 'Welche Strecke?'; inhalt = this.htmlStrecke(); hinweis = '<kbd>←</kbd><kbd>→</kbd> Strecke · <kbd>↑</kbd><kbd>↓</kbd> Welt · <kbd>Enter</kbd> weiter · <kbd>Esc</kbd> zurück'; }
      if (id === 'fahrer') {
        titel = this.zwei ? 'Wer fährt? Wählt eure Fahrer!' : 'Wer fährt?';
        inhalt = this.htmlFahrer();
        hinweis = this.zwei
          ? 'Spieler 1: <kbd>←</kbd><kbd>↑</kbd><kbd>↓</kbd><kbd>→</kbd> · Spieler 2: <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> · <kbd>Enter</kbd> weiter'
          : '<kbd>←</kbd><kbd>↑</kbd><kbd>↓</kbd><kbd>→</kbd> auswählen · <kbd>Enter</kbd> weiter · <kbd>Esc</kbd> zurück';
      }
      if (id === 'auto') {
        titel = this.zwei ? 'Wählt eure Autos!' : 'Welches Auto fährst du?';
        inhalt = this.htmlAuto();
        hinweis = this.zwei
          ? '① <kbd>←</kbd><kbd>↑</kbd><kbd>↓</kbd><kbd>→</kbd> <kbd>,</kbd><kbd>.</kbd> drehen · ② <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> <kbd>Q</kbd><kbd>E</kbd> drehen · <kbd>Enter</kbd> weiter'
          : '<kbd>←</kbd><kbd>↑</kbd><kbd>↓</kbd><kbd>→</kbd> wählen · <kbd>,</kbd><kbd>.</kbd> / <kbd>Q</kbd><kbd>E</kbd> drehen · <kbd>Enter</kbd> weiter';
      }
      if (id === 'start') { titel = 'Fast geschafft!'; inhalt = this.htmlStart(); hinweis = '<kbd>↑</kbd><kbd>↓</kbd> Zeile · <kbd>←</kbd><kbd>→</kbd> ändern · <kbd>Enter</kbd> weiter / Start · <kbd>Esc</kbd> zurück'; }

      const nav = (this.schritt > 0 ? '<div class="knopf klein" data-a="zurueck">◀ Zurück</div>' : '<span></span>') +
        (this.schritt < SCHRITTE.length - 1 ? '<div class="knopf klein gruen" data-a="weiter">Weiter ▶</div>' : '<span></span>');
      this.wurzel.innerHTML =
        `<div class="m-kopf"><div class="m-logo"><div class="m-titel">🔥 ${R.config.titel} 🏎️</div>` +
        `<div class="m-untertitel">${R.config.untertitel}</div></div><div class="m-schritte">${kopf}</div></div>` +
        `<div class="m-inhalt">${id === 'start' && this.tafelOffen ? '' : `<h1>${titel}</h1>`}${inhalt}</div>` +
        `<div class="m-fuss"><div class="m-nav">${nav}</div><div class="m-hinweis">${hinweis}</div></div>`;
      if (id === 'auto') this.buehnenBinden();
      else if (R.AutoVorschau) R.AutoVorschau.stoppen();
    }

    /** 3D-Bühnen (Canvas pro Spieler) mit dem Vorschau-Renderer verbinden. */
    buehnenBinden() {
      const AV = R.AutoVorschau;
      if (!AV) return;
      const felder = this.wurzel.querySelectorAll('canvas.buehne');
      AV.behalten(felder.length);
      const g = BUEHNE[this.zwei ? 'zwei' : 'solo'];
      felder.forEach((c) => {
        const sp = +c.dataset.sp;
        const auto = R.carCatalog.waehlbare().find((a) => a.id === this.e.autoIds[sp]) || R.carCatalog.waehlbare()[0];
        AV.binden(sp, c, auto, g.w, g.h);
      });
    }

    // ---------- Runde 6 (W3-G): Garage ----------
    /** Karte „🔧 Garage" unter den Modus-Karten (öffnet R.Garage.Bildschirm). */
    htmlGarageKarte() {
      if (!R.Garage) return '';
      return `<div class="reihe garage-reihe"><div class="karte garage-karte" data-a="garage">` +
        `<div class="emoji">🔧</div><div><div class="karten-name">Garage</div><div class="karten-sub">Münzen ausgeben: Farben, Motor, Reifen, Bremsen <kbd>G</kbd></div></div></div></div>`;
    }
    /** Garage-Bildschirm öffnen; beim Schließen kommt das Menü (Modus-Schritt) zurück. */
    garageOeffnen() {
      if (!R.Garage || !R.Garage.Bildschirm) return;
      if (!this.garageUi) this.garageUi = new R.Garage.Bildschirm(this.spiel, this.wurzel.parentNode, () => {
        this.sichtbar = true; this.wurzel.style.display = ''; this.zeichnen();
      });
      if (R.Audio) R.Audio.menueKlick();
      this.sichtbar = false; this.wurzel.style.display = 'none';
      if (R.AutoVorschau) R.AutoVorschau.stoppen();
      this.garageUi.oeffnen();
    }

    htmlModus() {
      // Runde 6 (W3-F): 4 Karten – Einzelrennen allein / zu zweit, Pokal, „Letzter fliegt raus" (Pillen: allein/zu zweit, Pokal-Größe)
      const e = this.e, sa = e.spielart || 'rennen';
      const gew = (id) => (id === 'solo' || id === 'zwei' ? sa === 'rennen' && e.modus === id : sa === id);
      const k = (id, emoji, text, sub, extra) =>
        `<div class="karte gross modus-karte m-${id}${gew(id) ? ' gewaehlt' : ''}" data-a="modus:${id}">` +
        `<div class="emoji">${emoji}</div><div class="karten-name">${text}</div><div class="karten-sub">${sub}</div>${extra || ''}</div>`;
      const sp = (id) => `<div class="modus-pillen"><span class="pille${sa === id && e.modus === 'solo' ? ' aktiv' : ''}" data-a="spieler:solo:${id}">👤 allein</span>` +
        `<span class="pille${sa === id && e.modus === 'zwei' ? ' aktiv' : ''}" data-a="spieler:zwei:${id}">👫 zu zweit</span></div>`;
      const gs = (R.config.pokal && R.config.pokal.groessen) || [3, 4, 5];
      const groesse = `<div class="modus-pillen">` + gs.map((g) =>
        `<span class="pille${sa === 'pokal' && e.pokalGroesse === g ? ' aktiv' : ''}" data-a="pokalgroesse:${g}">${g} Rennen</span>`).join('') + `</div>`;
      return `<div class="reihe modus-reihe">` +
        k('solo', '🏁', 'Allein gegen Computer', 'Du fährst gegen die Computer-Autos') +
        k('zwei', '👫', 'Zu zweit', 'Geteilter Bildschirm: links Pfeile, rechts WASD') +
        k('pokal', '🏆', 'Pokal', 'Mehrere Rennen, Punkte sammeln – wer gewinnt den Pokal?', groesse + sp('pokal')) +
        k('elimination', '🚪', 'Letzter fliegt raus', 'Nach jeder Runde scheidet der Letzte aus', sp('elimination')) +
        `</div>`;
    }

    htmlStrecke() {
      const farben = { wiese: ['#7ed957', '#3a8f2f'], wald: ['#2f7a3a', '#143d1f'], wueste: ['#f2c768', '#c98a34'], fantasie: ['#ff8fd8', '#9b5de5'], dino: ['#6fae3a', '#3d6b1e'] };
      const labels = { leicht: 'leicht', mittel: 'mittel', schnell: 'schnell', spass: 'spaß' };
      return `<div class="reihe strecken">` + R.trackCatalog.map((s) => {
        const f = farben[s.thema] || farben.wiese;
        const himmel = s.thema === 'fantasie' ? '#b48cff' : s.thema === 'dino' ? '#f2b36a' : '#8fc8ff';   // Dino: Vulkan-Dunst
        // Hinweis aus den Katalogdaten (Fantasie: Loopings, Bälle, Wasserstrahl)
        const teile = [];
        // nur, was in der Standard-Welt der Strecke aktiv ist (Runde 4: Wiese/Wald/Wüste haben Bälle erst in „Verrückt“)
        const sw = (s.welten && s.welten[s.weltStandard]) || null, aktiv = (k) => !sw || sw[k];
        if (s.loopings && s.loopings.length && aktiv('loopings')) teile.push(s.loopings.length + ' Loopings');
        if (s.baelle && s.baelle.length && aktiv('baelle')) teile.push('Bälle');
        if (s.wasserstrahlen && s.wasserstrahlen.length && aktiv('wasserstrahlen')) teile.push('Wasserstrahl');
        const hinweis = teile.length ? `<div class="strecken-hinweis">🎡 ${teile.join(', ')}</div>` : '';
        const pille = s.schwierigkeit ? `<span class="s-pille s-${s.schwierigkeit}">${labels[s.schwierigkeit] || s.schwierigkeit}</span>` : '';
        return `<div class="karte strecke t-${s.thema}${this.e.streckeId === s.id ? ' gewaehlt' : ''}" data-a="strecke:${s.id}">` +
          `<div class="strecken-bild" style="background:linear-gradient(180deg,${himmel} 0%,${himmel} 35%,${f[0]} 35%,${f[1]} 100%)">` +
          `<div class="strasse"></div>${pille}</div>` +
          `<div class="karten-name">${s.name}</div><div class="karten-sub">${s.beschreibung}</div>${hinweis}</div>`;
      }).join('') + `</div>` + this.htmlWelt() + this.htmlVariante();
    }

    /** Runde 4: Zeile „Welt“ unter den Strecken-Karten (Pillen je Strecke, eine Zeile Erklärung). */
    htmlWelt() {
      const liste = this.weltListe(), akt = this.weltGueltig() || this.streckeDaten().weltStandard;
      const a = liste.find((w) => w.k === akt) || liste[0];
      if (!a) return '';
      const pillen = liste.map((w) =>
        `<span class="pille welt${w.k === a.k ? ' aktiv' : ''}" data-a="welt:${w.k}" title="${w.info.beschreibung}">` +
        `${w.info.emoji} ${w.info.name}${w.standard ? ' <small>Standard</small>' : ''}</span>`).join('');
      return `<div class="m-welt"><div class="z-label">🌍 Welt</div><div class="z-wert">${pillen}</div>` +
        `<div class="welt-text"><b>${a.info.emoji} ${a.info.name}${a.standard && !this.weltGueltig() ? ' (Standard)' : ''}:</b> ${a.info.beschreibung}</div></div>`;
    }

    /** Runde 6 (W2-E): Zeile „Variante“ unter der Welt-Zeile – nur bei Strecken mit `varianten` (Wüste, Fantasie). */
    htmlVariante() {
      const liste = this.varianteListe();
      if (!liste.length) return '';
      const akt = this.varianteGueltig(), a = liste.find((x) => x.k === akt) || liste[0];
      const pillen = liste.map((x) =>
        `<span class="pille variante${x.k === a.k ? ' aktiv' : ''}" data-a="variante:${x.k}" title="${x.beschreibung}">` +
        `${x.k ? '📏 ' : ''}${x.name}</span>`).join('');
      return `<div class="m-variante"><div class="z-label">📏 Variante <small>(Taste V)</small></div><div class="z-wert">${pillen}</div>` +
        `<div class="welt-text"><b>${a.name}:</b> ${a.beschreibung}</div></div>`;
    }

    htmlFahrer() {
      const spieler = this.zwei ? [0, 1] : [0];
      const panels = spieler.map((sp) => {
        const andere = this.zwei ? this.e.fahrer[1 - sp] : null;
        const karten = R.config.fahrer.map((f) => {
          const gewaehlt = f.name === this.e.fahrer[sp], vergeben = f.name === andere;
          const sterneGes = R.Sterne ? R.Sterne.summe(f.name) : 0;   // Runde 6: „⭐ 12" an der Karte
          const pokaleGes = R.Pokal ? R.Pokal.gewinne(f.name) : 0;   // Runde 6 (W3-F): „🏆 2"
          return `<div class="karte fahrer${gewaehlt ? ' gewaehlt' : ''}${vergeben ? ' vergeben' : ''}" data-a="fahrer:${sp}:${f.name}">` +
            (vergeben ? `<span class="vergeben-marke p${2 - sp}">${2 - sp}</span>` : '') +
            `<div class="avatar">${f.emoji}</div><div class="karten-name">${f.name}</div>` +
            (sterneGes > 0 || pokaleGes > 0 ? `<div class="karten-sterne">${sterneGes > 0 ? '⭐ ' + sterneGes : ''}${sterneGes > 0 && pokaleGes > 0 ? ' · ' : ''}` +
              `${pokaleGes > 0 ? '<span class="karten-pokale">🏆 ' + pokaleGes + '</span>' : ''}</div>` : '') +   // W3-F: Pokal-Gewinne
            (R.Garage && R.Garage.konto(f.name) > 0 ? `<div class="karten-muenzen">🪙 ${R.Garage.konto(f.name)}</div>` : '') + `</div>`;   // W3-G
        }).join('');
        const kopf = this.zwei
          ? `<h2 class="p${sp + 1}"><span class="marke">${sp + 1}</span> Spieler ${sp + 1}: ${R.fahrerEmoji(this.e.fahrer[sp])} ${this.e.fahrer[sp]}</h2>`
          : '';
        return `<div class="m-spieler p${sp + 1}">${kopf}<div class="raster">${karten}</div></div>`;
      }).join('');
      return `<div class="m-autos m-fahrer${this.zwei ? ' zwei' : ''}">${panels}</div>`;
    }

    htmlAuto() {
      const AV = R.AutoVorschau, dreid = !!(AV && AV.verfuegbar);
      const spieler = this.zwei ? [0, 1] : [0];
      const bar = (a, k, emoji, name, extra) =>
        `<div class="bar"><span class="b-ico">${emoji}</span>${name ? `<span class="b-name">${name}</span>` : ''}` +
        `<div class="spur"><i style="width:${Math.round(this.norm(a, k) * 100)}%"></i></div>${extra ? `<span class="b-wert">${extra}</span>` : ''}</div>`;
      const panels = spieler.map((sp) => {
        const wahl = R.carCatalog.waehlbare().find((a) => a.id === this.e.autoIds[sp]) || R.carCatalog.waehlbare()[0];
        const g = BUEHNE[this.zwei ? 'zwei' : 'solo'];
        const karten = R.carCatalog.waehlbare().map((a) => {
          const url = dreid ? AV.kachel(a) : null;
          const bild = url ? `<img src="${url}" alt="${a.name}" draggable="false">` : autoSvg(a);
          // Im Solo-Modus Balken auf jeder Karte; zu zweit nur im Infofeld der Bühne (Platz)
          const balken = this.zwei ? '' : bar(a, 'tempo', '🚀') + bar(a, 'start', '⚡') + bar(a, 'kurven', '🌀');
          return `<div class="karte auto${a.id === wahl.id ? ' gewaehlt' : ''}" data-a="auto:${sp}:${a.id}">` +
            `<div class="auto-bild">${bild}</div><div class="karten-name">${a.name}</div>${balken}</div>`;
        }).join('');
        const kopf = this.zwei
          ? `<h2 class="p${sp + 1}"><span class="marke">${sp + 1}</span> ${R.fahrerEmoji(this.e.fahrer[sp])} ${this.e.fahrer[sp]}</h2>`
          : '';
        const kmh = Math.round(wahl.fahrwerte.vMax * 3.6);
        const buehne = dreid
          ? `<div class="buehne-rahmen"><canvas class="buehne" data-sp="${sp}" width="${g.w}" height="${g.h}" title="Ziehen zum Drehen"></canvas>` +
            `<div class="buehne-tipp">↔ ziehen · ${this.zwei ? (sp === 0 ? ', .' : 'Q E') : ', . / Q E'}</div></div>`
          : `<div class="buehne-rahmen svg">${autoSvg(wahl)}</div>`;
        const info = `<div class="a-info"><div class="a-name">${wahl.name}</div>` +
          bar(wahl, 'tempo', '🚀', 'Tempo', kmh + ' km/h') + bar(wahl, 'start', '⚡', 'Beschleunigung') + bar(wahl, 'kurven', '🌀', 'Wendigkeit') +
          `<p class="beschreibung">${wahl.beschreibung}</p></div>`;
        return `<div class="m-spieler p${sp + 1}">${kopf}<div class="a-oben">${buehne}${info}</div><div class="raster">${karten}</div></div>`;
      }).join('');
      return `<div class="m-autos auto3d${this.zwei ? ' zwei' : ''}">${panels}</div>`;
    }

    /** Runde 6 (W3-F): Zeile „🏆 Pokal" im Einstellungs-Schritt: 3/4/5 Rennen + Strecken-Reihenfolge. */
    htmlPokalZeile(fk, fz) {
      const e = this.e, gs = (R.config.pokal && R.config.pokal.groessen) || [3, 4, 5];
      const namen = R.Pokal ? R.Pokal.strecken(e.pokalGroesse).map((id) => (R.trackCatalog.find((t) => t.id === id) || { name: id }).name) : [];
      // steht statt der Spaltenüberschrift „Rennen" (keine zusätzliche Höhe – passt auch zu zweit in 1280×800)
      return `<h3 class="pokal-zeile${fk('pokal')}" ${fz('pokal')} title="Computer werden jedes Rennen eine Stufe stärker">🏆 Pokal ` +
        gs.map((g) => `<span class="pille${e.pokalGroesse === g ? ' aktiv' : ''}" data-a="pokalgroesse:${g}">${g} Rennen</span>`).join('') +
        `<span class="pokal-strecken">${namen.join(' → ')}</span></h3>`;
    }

    htmlStart() {
      const e = this.e, z = this.zeilen();
      const fk = (zeile) => (z[this.fokus] === zeile ? ' fokus' : '');
      const fz = (zeile) => `data-a="fokus:${z.indexOf(zeile)}"`;
      const stepper = (zeile, emoji, name, wert, extra) =>
        `<div class="zeile${fk(zeile)}" ${fz(zeile)}><div class="z-label">${emoji} ${name}</div>` +
        `<div class="z-wert"><span class="rund" data-a="stepper:${zeile}:-1">−</span>` +
        `<span class="zahl">${wert}</span><span class="rund" data-a="stepper:${zeile}:1">+</span>` +
        `<span class="extra">${extra || ''}</span></div></div>`;
      // Pillen aus Konfig-Objekt (Stärke, Fahrhilfe): { schluessel: { name, rang } }
      const pillen = (zeile, emoji, name, liste, aktuell) =>
        `<div class="zeile${fk(zeile)}${Object.keys(liste).length > 4 ? ' viele' : ''}" ${fz(zeile)}><div class="z-label">${emoji} ${name}</div><div class="z-wert">` +
        Object.keys(liste).sort((x, y) => (liste[x].rang || 0) - (liste[y].rang || 0)).map((k) => `<span class="pille${k === aktuell ? ' aktiv' : ''}${k === 'unschlagbar' ? ' tod' : ''}" data-a="wert:${zeile}:${k}">${k === 'unschlagbar' ? '💀 ' : ''}${liste[k].name}</span>`).join('') +
        `</div></div>`;
      // Pillen aus Liste [{ k, text }] (Jahreszeit, Wetter, Schaden)
      const pillenL = (zeile, emoji, name, liste, aktuell, tipp) =>
        `<div class="zeile viele${fk(zeile)}" ${fz(zeile)}${tipp ? ` title="${tipp}"` : ''}><div class="z-label">${emoji} ${name}</div><div class="z-wert">` +
        liste.map((x) => `<span class="pille${x.k === aktuell ? ' aktiv' : ''}" data-a="wert:${zeile}:${x.k}">${x.text}</span>`).join('') +
        `</div></div>`;
      const cfg = R.config;
      const name1 = this.zwei ? 'Fahrhilfe ' + e.fahrer[0] : 'Fahrhilfe';
      let links =
        (e.spielart === 'elimination'
          ? stepper('runden', '🔁', 'Runden', (this.zwei ? 2 : 1) + Math.max(3, e.gegner) - 1, '(1 weniger als Autos)')
          : stepper('runden', '🔁', e.spielart === 'pokal' ? 'Runden je Rennen' : 'Runden', e.runden, e.runden === 1 ? '(kurz)' : '')) +
        stepper('gegner', '🤖', 'Computer-Gegner', e.spielart === 'elimination' ? Math.max(3, e.gegner) : e.gegner, e.gegner === 0 ? '(keine)' : '') +
        pillen('schwierigkeit', '🎚️', e.spielart === 'pokal' ? 'Start-Stärke' : 'Computer-Stärke', cfg.schwierigkeiten, e.schwierigkeit) +
        pillen('hilfe0', '🛟', name1, cfg.fahrhilfen, e.fahrhilfe[0]);
      if (this.zwei) links += pillen('hilfe1', '🛟', 'Fahrhilfe ' + e.fahrer[1], cfg.fahrhilfen, e.fahrhilfe[1]);
      // Runde 6 (W2-D): Tageszeit (alle Strecken) – Dämmerung: Licht an, Nacht: Mond, Sterne, Scheinwerfer, Laternen
      links += pillenL('tageszeit', '🌗', 'Tageszeit', [{ k: 'tag', text: '☀️ Tag' }, { k: 'daemmerung', text: '🌇 Dämmerung' }, { k: 'nacht', text: '🌙 Nacht' }],
        e.tageszeit || 'tag', 'Dämmerung: tiefe Sonne, Licht an – Nacht: Mond, Sterne, Scheinwerfer und Laternen')
        .replace('<div class="zeile viele', '<div style="padding-top:.1em;padding-bottom:.1em" class="zeile viele');
      const windZahl = e.windStaerke === 'zufall' ? '🎲' : e.windStaerke;
      const windExtra = e.windStaerke === 0 ? 'aus' : (e.windStaerke === 'zufall' ? '' : '💨');
      const wind =
        `<div class="zeile${fk('wind')}" ${fz('wind')}><div class="z-label">💨 Wind</div>` +
        `<div class="z-wert"><span class="rund" data-a="stepper:wind:-1">−</span><span class="zahl">${windZahl}</span>` +
        `<span class="rund" data-a="stepper:wind:1">+</span>` +
        `<span class="pille${e.windStaerke === 'zufall' ? ' aktiv' : ''}" data-a="wert:wind:zufall" title="Zufälliger Wind">🎲</span>` +
        `<span class="extra">${windExtra}</span></div></div>`;
      const rechts =
        pillenL('jahreszeit', '🍂', 'Jahreszeit', this.jahreszeitListe(), e.jahreszeit) +
        pillenL('wetter', '🌦️', 'Wetter', this.wetterListe(), e.wetter) +
        wind +
        pillenL('schaden', '💥', 'Schaden', [{ k: 'aus', text: 'Aus' }, { k: 'an', text: 'An' }], e.schaden ? 'an' : 'aus',
          'Treffer kosten Energie, bei 0 % kommt der Abschleppwagen') +
        // Runde 5: Tempo-Klasse (Spieler und Computer gleich)
        pillenL('tempo', '🏎️', 'Tempo', [{ k: 'normal', text: 'Normal' }, { k: 'schnell', text: 'Schnell (220–270 km/h)' }],
          e.tempoKlasse === 'schnell' ? 'schnell' : 'normal', 'Normal ≈ 155–190 km/h, leichter zu fahren – Schnell = volle Leistung') +
        // Runde 5b: Polizei (Streifenwagen hält dich 10 s an, wenn er dich einholt)
        pillenL('polizei', '🚓', 'Polizei', [{ k: 'aus', text: 'Aus' }, { k: 'an', text: 'An' }], e.polizei ? 'an' : 'aus',
          'Ein Streifenwagen jagt dich – holt er dich ein, musst du 10 s anhalten') +
        // Runde 6: Rempeln (sanft = nur abprallen, echt = Autos drehen sich / werden abgedrängt); etwas flacher (passt in 1440×900)
        pillenL('rempeln', '🌀', 'Rempeln', [{ k: 'sanft', text: 'Sanft' }, { k: 'echt', text: 'Echt' }], e.rempeln === 'echt' ? 'echt' : 'sanft',
          'Sanft: Autos prallen nur ab – Echt: Autos drehen sich oder werden von der Bahn geschubst')
          .replace('<div class="zeile viele', '<div style="padding-top:.1em;padding-bottom:.1em" class="zeile viele');
      const tonAn = !R.Audio || R.Audio.an;
      const aktionen = `<div class="m-aktionen"><div class="start-knopf${fk('start')}" data-a="start">🏁 LOS GEHT'S!</div>` +
        `<div class="knopf klein ton" data-a="ton">${tonAn ? '🔊 Ton an' : '🔇 Ton aus'} <kbd>M</kbd></div>` +
        `<div class="knopf klein ton" data-a="tafel">🎮 Steuerung ${this.tafelOffen ? '▴' : '▾'}</div></div>`;
      const tafel = !this.tafelOffen ? '' :
        `<div class="tafel"><div class="t-zeile"><b>Menü</b><span>${this.zwei ? '①' : ''} <kbd>←</kbd><kbd>↑</kbd><kbd>↓</kbd><kbd>→</kbd>${this.zwei ? ' ② <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd>' : ''} <kbd>Enter</kbd> weiter</span></div>` +
        `<div class="t-zeile p1"><b>${e.fahrer[0]}</b><span><kbd>↑</kbd> Gas <kbd>↓</kbd> Bremse <kbd>←</kbd><kbd>→</kbd> Lenken <kbd>R</kbd> zurück</span></div>` +
        `<div class="t-zeile p2${this.zwei ? '' : ' aus'}"><b>${e.fahrer[1]}</b><span><kbd>W</kbd> Gas <kbd>S</kbd> Bremse <kbd>A</kbd><kbd>D</kbd> Lenken <kbd>T</kbd> zurück</span></div>` +
        `<div class="t-zeile"><b>Alle</b><span><kbd>C</kbd> Kamera <kbd>F</kbd> Vollbild <kbd>Esc</kbd> Pause</span></div></div>`;
      return `<div class="m-start"><div class="m-spalten">` +
        `<div class="m-einstellungen">${e.spielart === 'pokal' ? this.htmlPokalZeile(fk, fz)      // W3-F: Pokal-Größe als Überschrift
          : `<h3>${e.spielart === 'elimination' ? '🚪 Letzter fliegt raus' : '🏎️ Rennen'}</h3>`}${links}</div>` +
        `<div class="m-einstellungen"><h3>🌍 Welt &amp; Wetter</h3>${rechts}</div></div>${aktionen}${tafel}</div>`;
    }
  }

  // ============================================================
  // Ergebnis-Tafel
  // ============================================================
  class ErgebnisAnzeige {
    constructor(spiel, ui) {
      this.spiel = spiel;
      this.wurzel = el('div', 'overlay ergebnis', ui);
      this.wurzel.id = 'ergebnis';
      this.wurzel.style.display = 'none';
      this.sichtbar = false;
      this.seit = 0;
      this.wurzel.addEventListener('click', (e) => {
        const t = e.target.closest('[data-a]');
        if (t) this.aktion(t.dataset.a);
      });
    }
    zeigen(erg) {
      this.sichtbar = true; this.seit = performance.now();
      const zeilen = erg.zeilen.map((z) => {
        const farbe = z.auto ? HEX(z.auto.farbe) : '#888';
        const zeit = z.raus ? `<span class="raus">🚪 raus in Runde ${z.raus}</span>`      // W3-F: „Letzter fliegt raus"
          : z.zeit !== null ? R.zeitText(z.zeit) : '<span class="noch">unterwegs</span>';
        return `<tr class="${z.istSpieler ? 'spieler p' + (z.spielerNr + 1) : 'computer'}">` +
          `<td class="platz">${z.platz}.</td><td class="name">${z.istSpieler ? '' : '🤖 '}${z.name}` +
          (z.sterne ? ` <span class="sterne" title="Sterne gesamt: ${z.sterneGesamt}">${R.Sterne ? R.Sterne.text(z.sterne) : '⭐'.repeat(z.sterne)}</span>` : '') + `</td>` +
          `<td class="auto"><i style="background:${farbe}"></i>${z.auto ? z.auto.name : ''}</td>` +
          `<td class="zeit">${zeit}</td><td class="zeit">${z.beste !== null ? R.zeitText(z.beste) : '–'}</td>` +
          // Runde 6 (Polierrunde W3): Preisgeld + im Rennen gesammelte Münzen (nur Spieler; KI „–")
          `<td class="zeit preisgeld">${z.istSpieler && z.preisgeld !== undefined ? `+${z.preisgeld} 🪙` + (z.muenzenRennen ? ` <small>(+${z.muenzenRennen} gesammelt)</small>` : '') : '–'}</td></tr>`;
      }).join('');
      this.wurzel.innerHTML =
        `<div class="ergebnis-karte"><h1>${erg.elimination ? '🚪 Letzter fliegt raus' : '🏆 Ergebnis'}</h1>` +
        `<table><thead><tr><th>Platz</th><th>Name</th><th>Auto</th><th>Gesamtzeit</th><th>Beste Runde</th><th>🪙 Preisgeld</th></tr></thead>` +
        `<tbody>${zeilen}</tbody></table>` +
        `<div class="knoepfe"><div class="knopf gruen" data-a="nochmal">🔄 Nochmal <kbd>Enter</kbd></div>` +
        `<div class="knopf blau" data-a="menue">🏠 Hauptmenü <kbd>Esc</kbd></div></div></div>`;
      this.wurzel.style.display = '';
    }
    verstecken() { this.sichtbar = false; this.wurzel.style.display = 'none'; }
    aktion(a) {
      if (performance.now() - this.seit < R.config.ui.ergebnisSperreMs) return;
      if (a === 'nochmal') this.spiel.rennenStarten();
      else if (a === 'menue') this.spiel.zumMenue();
    }
    taste(code) {
      const T = R.config.tasten;
      if (T.bestaetigen.includes(code)) this.aktion('nochmal');
      else if (code === T.pause) this.aktion('menue');
    }
  }

  // ============================================================
  // Pause
  // ============================================================
  class PauseAnzeige {
    constructor(spiel, ui) {
      this.spiel = spiel;
      this.wurzel = el('div', 'overlay pause', ui);
      this.wurzel.id = 'pause';
      this.wurzel.style.display = 'none';
      this.sichtbar = false;
      this.fokus = 0;
      this.wurzel.addEventListener('click', (e) => {
        const t = e.target.closest('[data-a]');
        if (t) this.aktion(t.dataset.a);
      });
    }
    zeigen() { this.sichtbar = true; this.fokus = 0; this.wurzel.style.display = ''; this.zeichnen(); }
    verstecken() { this.sichtbar = false; this.wurzel.style.display = 'none'; }
    zeichnen() {
      this.wurzel.innerHTML =
        `<div class="pause-karte"><h1>⏸️ Pause</h1>` +
        `<div class="knopf gruen${this.fokus === 0 ? ' fokus' : ''}" data-a="weiter">▶ Weiter <kbd>Esc</kbd></div>` +
        `<div class="knopf blau${this.fokus === 1 ? ' fokus' : ''}" data-a="menue">🏠 Hauptmenü</div></div>`;
    }
    aktion(a) {
      if (a === 'weiter') this.spiel.pauseSetzen(false);
      else if (a === 'menue') this.spiel.zumMenue();
    }
    taste(code) {
      const T = R.config.tasten, P1 = T.spieler[0], P2 = T.spieler[1];
      if (code === T.pause) this.aktion('weiter');
      else if ([P1.gas, P1.bremse, P2.gas, P2.bremse].includes(code)) { this.fokus = 1 - this.fokus; this.zeichnen(); }
      else if (T.bestaetigen.includes(code)) this.aktion(this.fokus === 0 ? 'weiter' : 'menue');
    }
  }

  R.Menue = Menue;
  R.ErgebnisAnzeige = ErgebnisAnzeige;
  R.PauseAnzeige = PauseAnzeige;
})();
