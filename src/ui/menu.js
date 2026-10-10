// ============================================================
// Menü, Ergebnis-Tafel und Pause als HTML-Overlay über dem Canvas.
//
// Hauptmenü in 4 Schritten (alles per Tastatur UND Maus):
//   1 Modus  2 Strecke  3 Auto (je Spieler)  4 Einstellungen + Start
// Tasten: Pfeile bzw. WASD bewegen, Enter/Leertaste = weiter, Esc = zurück.
// Im Auto-Schritt steuert Spieler 1 mit den Pfeilen, Spieler 2 mit WASD.
// Das Menü ändert nur spiel.einstellungen (und speichert sie); gestartet
// wird mit spiel.rennenStarten().
// ============================================================
(function () {
  const R = window.Rennspiel;

  const SPALTEN = 4;                       // Auto-Raster
  const SCHRITTE = [
    { id: 'modus', name: 'Modus' },
    { id: 'strecke', name: 'Strecke' },
    { id: 'auto', name: 'Auto' },
    { id: 'start', name: 'Los!' },
  ];
  const HEX = (n) => '#' + (n >>> 0).toString(16).padStart(6, '0');

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
    const kat = R.carCatalog;
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
      this.norm = normiert();
      this.wurzel.addEventListener('click', (e) => {
        const t = e.target.closest('[data-a]');
        if (t) this.aktion(t.dataset.a);
      });
    }

    get e() { return this.spiel.einstellungen; }
    get zwei() { return this.e.modus === 'zwei'; }

    zeigen(schritt) {
      this.sichtbar = true;
      this.schritt = schritt === undefined ? 0 : schritt;
      this.fokus = 0;
      this.wurzel.style.display = '';
      this.spiel.menueHintergrund(this.e.streckeId);
      this.zeichnen();
    }
    verstecken() { this.sichtbar = false; this.wurzel.style.display = 'none'; }

    zeilen() {
      const z = ['runden', 'gegner', 'schwierigkeit', 'hilfe0'];
      if (this.zwei) z.push('hilfe1');
      z.push('start');
      return z;
    }

    aenderung() {
      this.spiel.einstellungenSpeichern();
      this.zeichnen();
    }

    // ---------- Eingabe ----------
    /** Taste im Menü. Gibt true zurück, wenn sie verwendet wurde. */
    taste(code) {
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
      const rich = richtung(code);
      if (!rich) return false;
      const [dx, dy] = rich;

      if (id === 'modus') {
        this.e.modus = this.e.modus === 'solo' ? 'zwei' : 'solo';
        this.aenderung();
      } else if (id === 'strecke') {
        const liste = R.trackCatalog, i = liste.findIndex((s) => s.id === this.e.streckeId);
        const n = liste[(i + (dx || dy) + liste.length * 2) % liste.length];
        this.e.streckeId = n.id;
        this.spiel.menueHintergrund(n.id);
        this.aenderung();
      } else if (id === 'auto') {
        const spieler = [];
        if (!this.zwei) spieler.push(0);
        else {
          if (code === P1.links || code === P1.rechts || code === P1.gas || code === P1.bremse) spieler.push(0);
          if (code === P2.links || code === P2.rechts || code === P2.gas || code === P2.bremse) spieler.push(1);
        }
        spieler.forEach((s) => this.autoBewegen(s, dx, dy));
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
      const kat = R.carCatalog, n = kat.length;
      let i = kat.findIndex((a) => a.id === this.e.autoIds[spieler]);
      if (i < 0) i = 0;
      i = dx ? (i + dx + n) % n : (i + dy * SPALTEN + n * 2) % n;
      this.e.autoIds[spieler] = kat[i].id;
    }

    /** Wert einer Einstellungs-Zeile um dx Schritte ändern. */
    zeilenWert(zeile, dx) {
      const rc = R.config.rennen, e = this.e;
      const klemme = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
      if (zeile === 'runden') e.runden = klemme(e.runden + dx, rc.rundenMin, rc.rundenMax);
      else if (zeile === 'gegner') e.gegner = klemme(e.gegner + dx, 0, rc.gegnerMax);
      else if (zeile === 'schwierigkeit' || zeile.startsWith('hilfe')) {
        const hilfe = zeile.startsWith('hilfe'), sp = hilfe ? +zeile.slice(5) : 0;
        const keys = Object.keys(hilfe ? R.config.fahrhilfen : R.config.schwierigkeiten);
        const aktuell = hilfe ? e.fahrhilfe[sp] : e.schwierigkeit;
        const neu = keys[klemme(keys.indexOf(aktuell) + dx, 0, keys.length - 1)];
        if (hilfe) e.fahrhilfe[sp] = neu; else e.schwierigkeit = neu;
      }
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
    starten() { this.spiel.einstellungenSpeichern(); this.spiel.rennenStarten(); }

    aktion(a) {
      const [art, p1, p2] = a.split(':');
      const e = this.e;
      if (art === 'schritt') { this.schritt = +p1; this.fokus = 0; }
      else if (art === 'weiter') return this.weiter();
      else if (art === 'zurueck') return this.zurueck();
      else if (art === 'modus') { e.modus = p1; this.einstellungenFix(); this.schritt = 1; }
      else if (art === 'strecke') { e.streckeId = p1; this.spiel.menueHintergrund(p1); this.schritt = 2; }
      else if (art === 'auto') e.autoIds[+p1] = p2;
      else if (art === 'stepper') this.zeilenWert(p1, +p2);
      else if (art === 'wert') {
        if (p1 === 'schwierigkeit') e.schwierigkeit = p2;
        else e.fahrhilfe[+p1.slice(5)] = p2;
      } else if (art === 'fokus') this.fokus = +p1;
      else if (art === 'start') return this.starten();
      else if (art === 'ton') { if (R.Audio) R.Audio.schalten(); }
      if (R.Audio) R.Audio.menueKlick();
      this.aenderung();
    }
    einstellungenFix() { this.fokus = Math.min(this.fokus, this.zeilen().length - 1); }

    // ---------- Darstellung ----------
    zeichnen() {
      if (!this.sichtbar) return;
      const id = SCHRITTE[this.schritt].id;
      const kopf = SCHRITTE.map((s, i) =>
        `<div class="m-schritt${i === this.schritt ? ' aktiv' : ''}${i < this.schritt ? ' fertig' : ''}" data-a="schritt:${i}">` +
        `<b>${i + 1}</b> ${s.name}</div>`).join('<span class="m-pfeil">›</span>');
      let inhalt = '', hinweis = '', titel = '';
      if (id === 'modus') { titel = 'Wie wollt ihr fahren?'; inhalt = this.htmlModus(); hinweis = '<kbd>←</kbd><kbd>→</kbd> auswählen · <kbd>Enter</kbd> weiter'; }
      if (id === 'strecke') { titel = 'Welche Strecke?'; inhalt = this.htmlStrecke(); hinweis = '<kbd>←</kbd><kbd>→</kbd> auswählen · <kbd>Enter</kbd> weiter · <kbd>Esc</kbd> zurück'; }
      if (id === 'auto') {
        titel = this.zwei ? 'Wählt eure Autos!' : 'Welches Auto fährst du?';
        inhalt = this.htmlAuto();
        hinweis = this.zwei
          ? 'Spieler 1: <kbd>←</kbd><kbd>↑</kbd><kbd>↓</kbd><kbd>→</kbd> · Spieler 2: <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> · <kbd>Enter</kbd> weiter'
          : '<kbd>←</kbd><kbd>↑</kbd><kbd>↓</kbd><kbd>→</kbd> auswählen · <kbd>Enter</kbd> weiter · <kbd>Esc</kbd> zurück';
      }
      if (id === 'start') { titel = 'Fast geschafft!'; inhalt = this.htmlStart(); hinweis = '<kbd>↑</kbd><kbd>↓</kbd> Zeile · <kbd>←</kbd><kbd>→</kbd> ändern · <kbd>Enter</kbd> weiter / Start · <kbd>Esc</kbd> zurück'; }

      const nav = (this.schritt > 0 ? '<div class="knopf klein" data-a="zurueck">◀ Zurück</div>' : '<span></span>') +
        (this.schritt < SCHRITTE.length - 1 ? '<div class="knopf klein gruen" data-a="weiter">Weiter ▶</div>' : '<span></span>');
      this.wurzel.innerHTML =
        `<div class="m-kopf"><div class="m-titel">🏎️ AUTORENNEN</div><div class="m-schritte">${kopf}</div></div>` +
        `<div class="m-inhalt"><h1>${titel}</h1>${inhalt}</div>` +
        `<div class="m-fuss"><div class="m-nav">${nav}</div><div class="m-hinweis">${hinweis}</div></div>`;
    }

    htmlModus() {
      const k = (id, emoji, text, sub) =>
        `<div class="karte gross${this.e.modus === id ? ' gewaehlt' : ''}" data-a="modus:${id}">` +
        `<div class="emoji">${emoji}</div><div class="karten-name">${text}</div><div class="karten-sub">${sub}</div></div>`;
      return `<div class="reihe">` +
        k('solo', '🏁', 'Allein gegen Computer', 'Du fährst gegen die Computer-Autos') +
        k('zwei', '👫', 'Zu zweit', 'Geteilter Bildschirm: links Pfeile, rechts WASD') +
        `</div>`;
    }

    htmlStrecke() {
      const farben = { wiese: ['#7ed957', '#3a8f2f'], wald: ['#2f7a3a', '#143d1f'], wueste: ['#f2c768', '#c98a34'] };
      return `<div class="reihe">` + R.trackCatalog.map((s) => {
        const f = farben[s.thema] || farben.wiese;
        return `<div class="karte strecke${this.e.streckeId === s.id ? ' gewaehlt' : ''}" data-a="strecke:${s.id}">` +
          `<div class="strecken-bild" style="background:linear-gradient(180deg,#8fc8ff 0%,#8fc8ff 35%,${f[0]} 35%,${f[1]} 100%)">` +
          `<div class="strasse"></div></div>` +
          `<div class="karten-name">${s.name}</div><div class="karten-sub">${s.beschreibung}</div></div>`;
      }).join('') + `</div>`;
    }

    htmlAuto() {
      const spieler = this.zwei ? [0, 1] : [0];
      const panels = spieler.map((sp) => {
        const wahl = R.carCatalog.find((a) => a.id === this.e.autoIds[sp]) || R.carCatalog[0];
        const karten = R.carCatalog.map((a) => {
          const bar = (k, emoji) => `<div class="bar"><span>${emoji}</span><div class="spur"><i style="width:${Math.round(this.norm(a, k) * 100)}%"></i></div></div>`;
          return `<div class="karte auto${a.id === wahl.id ? ' gewaehlt' : ''}" data-a="auto:${sp}:${a.id}">` +
            `<div class="auto-bild">${autoSvg(a)}</div><div class="karten-name">${a.name}</div>` +
            bar('tempo', '🚀') + bar('start', '⚡') + bar('kurven', '🌀') + `</div>`;
        }).join('');
        const kopf = this.zwei
          ? `<h2 class="p${sp + 1}"><span class="marke">${sp + 1}</span> Spieler ${sp + 1}</h2>`
          : '';
        return `<div class="m-spieler p${sp + 1}">${kopf}<div class="raster">${karten}</div>` +
          `<p class="beschreibung">${wahl.beschreibung}</p></div>`;
      }).join('');
      return `<div class="m-autos${this.zwei ? ' zwei' : ''}">${panels}</div>` +
        `<div class="legende">🚀 Tempo &nbsp; ⚡ Beschleunigung &nbsp; 🌀 Wendigkeit</div>`;
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
      const pillen = (zeile, emoji, name, liste, aktuell) =>
        `<div class="zeile${fk(zeile)}" ${fz(zeile)}><div class="z-label">${emoji} ${name}</div><div class="z-wert">` +
        Object.keys(liste).map((k) => `<span class="pille${k === aktuell ? ' aktiv' : ''}" data-a="wert:${zeile}:${k}">${liste[k].name}</span>`).join('') +
        `</div></div>`;
      const cfg = R.config;
      const name1 = this.zwei ? 'Fahrhilfe Spieler 1' : 'Fahrhilfe';
      let reihen =
        stepper('runden', '🔁', 'Runden', e.runden, e.runden === 1 ? '(kurz)' : '') +
        stepper('gegner', '🤖', 'Computer-Gegner', e.gegner, e.gegner === 0 ? '(keine)' : '') +
        pillen('schwierigkeit', '🎚️', 'Computer-Stärke', cfg.schwierigkeiten, e.schwierigkeit) +
        pillen('hilfe0', '🛟', name1, cfg.fahrhilfen, e.fahrhilfe[0]);
      if (this.zwei) reihen += pillen('hilfe1', '🛟', 'Fahrhilfe Spieler 2', cfg.fahrhilfen, e.fahrhilfe[1]);
      const tonAn = !R.Audio || R.Audio.an;
      const start = `<div class="start-knopf${fk('start')}" data-a="start">🏁 LOS GEHT'S!</div>` +
        `<div class="knopf klein ton" data-a="ton">${tonAn ? '🔊 Ton an' : '🔇 Ton aus'} <kbd>M</kbd></div>`;
      const tafel =
        `<div class="tafel"><h2>🎮 Steuerung</h2>` +
        `<div class="t-zeile p1"><b>Spieler 1</b><span><kbd>↑</kbd> Gas <kbd>↓</kbd> Bremse <kbd>←</kbd><kbd>→</kbd> Lenken <kbd>R</kbd> zurück auf die Strecke</span></div>` +
        `<div class="t-zeile p2${this.zwei ? '' : ' aus'}"><b>Spieler 2</b><span><kbd>W</kbd> Gas <kbd>S</kbd> Bremse <kbd>A</kbd><kbd>D</kbd> Lenken <kbd>T</kbd> zurück auf die Strecke</span></div>` +
        `<div class="t-zeile"><b>Alle</b><span><kbd>C</kbd> Kamera <kbd>F</kbd> Vollbild <kbd>Esc</kbd> Pause</span></div></div>`;
      return `<div class="m-start"><div class="m-einstellungen">${reihen}${start}</div>${tafel}</div>`;
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
        const zeit = z.zeit !== null ? R.zeitText(z.zeit) : '<span class="noch">unterwegs</span>';
        return `<tr class="${z.istSpieler ? 'spieler p' + (z.spielerNr + 1) : 'computer'}">` +
          `<td class="platz">${z.platz}.</td><td class="name">${z.istSpieler ? '' : '🤖 '}${z.name}</td>` +
          `<td class="auto"><i style="background:${farbe}"></i>${z.auto ? z.auto.name : ''}</td>` +
          `<td class="zeit">${zeit}</td><td class="zeit">${z.beste !== null ? R.zeitText(z.beste) : '–'}</td></tr>`;
      }).join('');
      this.wurzel.innerHTML =
        `<div class="ergebnis-karte"><h1>🏆 Ergebnis</h1>` +
        `<table><thead><tr><th>Platz</th><th>Name</th><th>Auto</th><th>Gesamtzeit</th><th>Beste Runde</th></tr></thead>` +
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
