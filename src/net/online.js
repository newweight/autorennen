// ============================================================
// W5-2 Mehrspieler: Online-Modus im Browser – Bildschirme (Start, Code, Lobby, Ergebnis) und das Online-Rennen.
//
// Ablauf: Menü-Karte „🌐 Online“ → R.Online.Bildschirm.oeffnen() → „Raum erstellen“ (Host) oder „Raum beitreten“
// (4 Felder, nur Zeichen ohne 0/O/1/I; Link ?raum=ABCD füllt vor) → Lobby (Code groß, Link, QR, Spielerliste,
// eigene Wahl Fahrer/Auto/Fahrhilfe, Host: Einstellungen + Start; Gäste: Bereit mit Leertaste/Enter) → Rennen.
//
// Rennen: main.js bekommt den Zustand 'online' (spiel.online = dieser Bildschirm). physikSchritt() rechnet dann
// NICHT die lokale Rennleitung, sondern: Eingabe lesen (input.steuerung – Tastatur und Touch), quantisiert an den
// Server schicken (60 Hz, Folge-Nr), eigenen Wagen vorhersagen (R.NetzVorhersage), andere Autos 100 ms hinter dem
// Server interpolieren (R.NetzPuffer), Rennleitung/HUD aus den Server-Zuständen setzen (Puppen-RaceManager).
// Szene, Autos, Kamera, HUD, Minimap, Ton: die bestehenden Teile aus main.js (streckeSzeneBauen, fahrzeugHinzufuegen,
// kameraHinzufuegen, R.Hud). Stufe 1 = Geister: alle anderen Autos halbtransparent (0,6), Durchfahren.
// Lokal/Split-Screen bleiben unverändert (alle Haken in main.js fragen zustand === 'online').
// ============================================================
(function () {
  const R = window.Rennspiel;
  const N = R.Netz;

  /** Online geht nur, wenn die Seite vom Server kommt (http/https), nicht von der Festplatte (file://). */
  function verfuegbar() { return /^https?:$/.test(window.location.protocol) && typeof WebSocket !== 'undefined'; }

  function el(tag, klasse, parent) {
    const e = document.createElement(tag);
    if (klasse) e.className = klasse;
    if (parent) parent.appendChild(e);
    return e;
  }
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const HEX = (n) => '#' + (n >>> 0).toString(16).padStart(6, '0');
  /**
   * Basis-Adresse für Link/QR: die Adresse, über die die Seite geöffnet wurde (location.origin + '/'). Hat der Host
   * das Spiel lokal geöffnet (localhost/127.0.0.1/Heimnetz-IP) und kennt der Server eine öffentliche Adresse
   * (Tailscale Funnel, Startskript), wird diese genommen – sonst könnten Gäste den Link nicht öffnen.
   */
  function einladungsBasis(oeffentlich) {
    const h = window.location.hostname;
    const lokal = h === 'localhost' || h === '::1' || h === '[::1]' || /^127\./.test(h) || /^10\./.test(h) || /^192\.168\./.test(h) ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(h) || /\.local$/.test(h);
    if (lokal && typeof oeffentlich === 'string' && /^https:\/\//.test(oeffentlich)) return oeffentlich.replace(/\/?$/, '/');
    return window.location.origin + '/';
  }

  // Eigene Stile (styles.css bleibt unverändert; nur Klassen mit Präfix on-)
  const STIL = `
.online .on-wahl { gap: 2em; }
.online .on-wahl .karte.gross { width: 13em; }
.online .on-hinweis { margin-top: 1em; background: rgba(214,40,40,.75); border: .12em solid #fff; padding: .35em 1em; border-radius: 1em; font-size: .85em; }
.online .on-info { margin-top: .8em; font-size: .75em; opacity: .9; max-width: 34em; text-align: center; }
.online .on-codefelder { display: flex; gap: .5em; margin: .2em 0 .6em; }
.online .on-codefelder span { width: 1.6em; height: 1.9em; line-height: 1.9em; text-align: center; font-size: 2.4em; font-weight: 900; border-radius: .25em;
  background: rgba(14,24,58,.8); border: .1em solid rgba(255,255,255,.45); color: #fff; font-family: ui-monospace, Menlo, monospace; }
.online .on-codefelder span.cursor { border-color: var(--gelb); box-shadow: 0 0 .5em rgba(255,210,58,.8); }
.online .on-tasten { display: grid; grid-template-columns: repeat(11, 2.1em); gap: .25em; margin-bottom: .7em; }
.online .on-tasten span { background: rgba(255,255,255,.18); border-radius: .4em; text-align: center; padding: .2em 0; cursor: pointer; font-size: .9em; user-select: none; }
.online .on-tasten span:hover { background: rgba(255,255,255,.35); }
.online .on-lobby { display: grid; grid-template-columns: 15.5em 1fr 1fr; gap: 1em; width: 100%; height: 100%; min-height: 0; padding-top: .4em; box-sizing: border-box; }
.online .on-spalte { background: var(--tafel); border-radius: 1em; padding: .55em .7em; min-height: 0; overflow: hidden; display: flex; flex-direction: column; gap: .3em; }
.online .on-spalte h3 { margin: .1em 0 .1em; font-size: .8em; color: var(--gelb); }
.online .on-einladung { align-items: center; text-align: center; }
.online .on-code { font-size: 2.6em; font-weight: 900; letter-spacing: .12em; color: var(--gelb); font-family: ui-monospace, Menlo, monospace; line-height: 1.1;
  text-shadow: 0 .06em 0 #8f2412; }
.online .on-qr { background: #fff; border-radius: .4em; padding: .2em; line-height: 0; }
.online .on-qr svg { width: 9.5em; height: 9.5em; }
.online .on-link { font-size: .55em; word-break: break-all; opacity: .95; background: rgba(0,0,0,.25); padding: .25em .5em; border-radius: .5em; user-select: all; }
.online .on-klein { font-size: .6em; opacity: .85; }
.online .on-spieler { display: flex; flex-direction: column; gap: .2em; }
.online .on-sp { display: flex; align-items: center; gap: .4em; background: rgba(255,255,255,.1); border-radius: .6em; padding: .15em .5em; font-size: .78em; }
.online .on-sp.ich { background: rgba(47,139,255,.45); }
.online .on-sp .on-emoji { font-size: 1.4em; }
.online .on-sp .on-name { flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.online .on-sp .on-auto { font-size: .75em; opacity: .85; white-space: nowrap; }
.online .on-sp .on-auto i { display: inline-block; width: .8em; height: .8em; border-radius: 50%; border: .1em solid #fff; margin-right: .3em; vertical-align: -.1em; }
.online .on-zeile { border-radius: .6em; padding: .06em .3em; border: .1em solid transparent; }
.online .on-zeile.fokus { border-color: var(--gelb); background: rgba(255,210,58,.12); }
.online .on-zeile .on-label { font-size: .62em; opacity: .9; margin-bottom: .1em; }
.online .on-zeile .on-werte { display: flex; flex-wrap: wrap; gap: .2em; }
.online .on-einst { gap: .2em; }
.online .on-zeile .pille { font-size: .6em; padding: .1em .45em; }
.online .on-zeile .pille.aus { opacity: .35; cursor: default; }
.online .on-zeile .pille.emoji { font-size: .85em; padding: .02em .25em; }
.online .on-zeile .pille.tod { }
.online .on-fest { font-size: .62em; opacity: .9; padding: .1em .3em; }
.online .on-aktion { display: flex; gap: .8em; align-items: center; }
.online .on-aktion .knopf.aus { filter: grayscale(.8); opacity: .6; }
.online .on-mitte .on-wahl-block { margin-top: .2em; display: flex; flex-direction: column; gap: .15em; }
.online .on-zusammen { font-size: .7em; line-height: 1.5; }
.on-ergebnis .on-weg { opacity: .7; font-size: .8em; }
.hud-netz { font-size: .8em; opacity: .95; white-space: nowrap; }
.karte.online-karte { display: flex; align-items: center; gap: .6em; padding: .45em 1.2em; text-align: left; }
.karte.online-karte .emoji { font-size: 2.2em; line-height: 1; }
.karte.online-karte .karten-name { font-size: 1.15em; color: #9fd4ff; }
.karte.online-karte .karten-sub { font-size: .7em; opacity: .9; max-width: 15em; }
.karte.online-karte.aus { filter: grayscale(1); opacity: .6; cursor: not-allowed; }
.karte.online-karte.aus:hover { transform: none; }
`;
  function stilEinfuegen() {
    if (document.getElementById('online-stil')) return;
    const s = document.createElement('style');
    s.id = 'online-stil';
    s.textContent = STIL;
    document.head.appendChild(s);
  }

  class OnlineBildschirm {
    /**
     * @param {Spiel} spiel
     * @param {HTMLElement} ui
     * @param {Function} zurueck Aufruf beim Verlassen (Menü wieder zeigen)
     */
    constructor(spiel, ui, zurueck) {
      stilEinfuegen();
      this.spiel = spiel;
      this.ui = ui;
      this.zurueckFn = zurueck;
      this.wurzel = el('div', 'overlay menue online', ui);
      this.wurzel.id = 'online';
      this.wurzel.style.display = 'none';
      this.ergEl = el('div', 'overlay ergebnis on-ergebnis', ui);
      this.ergEl.style.display = 'none';
      this.dialogEl = el('div', 'overlay pause', ui);
      this.dialogEl.style.display = 'none';
      this.sichtbar = false;
      this.ansicht = 'start';       // start | code | verbinden | lobby | laden
      this.phase = null;            // null | 'laden' | 'rennen' | 'ergebnis' (Online-Rennen)
      this.wahl = 0;                // Start-Bildschirm: 0 erstellen, 1 beitreten
      this.code = ['', '', '', ''];
      this.hinweis = '';
      this.fokus = 0;
      this.lobby = null;
      this.verb = null;
      this.dialog = false;
      this.statistik = { korrekturen: null };
      [this.wurzel, this.ergEl, this.dialogEl].forEach((w) => w.addEventListener('click', (e) => {
        const t = e.target.closest('[data-a]');
        if (t) this.aktion(t.dataset.a);
      }));
      // Code-Eingabe: Buchstaben abfangen, bevor die Spiel-Tasten (F Vollbild, H Debug, M Ton) greifen
      this._tastenFang = (e) => {
        if (!this.sichtbar || this.ansicht !== 'code') return;
        const z = e.code && /^(Key[A-Z]|Digit[0-9]|Numpad[0-9])$/.test(e.code) ? e.code.slice(-1) : null;
        if (z || e.code === 'Backspace' || e.code === 'Delete') {
          e.preventDefault(); e.stopImmediatePropagation();
          if (z) this.codeZeichen(z); else this.codeLoeschen();
        }
      };
      window.addEventListener('keydown', this._tastenFang, true);
    }

    // ================================================================ Bildschirm
    oeffnen(opt) {
      this.sichtbar = true;
      this.wurzel.style.display = '';
      this.hinweis = '';
      if (opt && opt.code) {
        const c = N.codeNormal(opt.code);
        if (c) { this.code = c.split(''); this.ansicht = 'code'; }
        else this.ansicht = 'start';
      } else if (this.lobby && this.verb && this.verb.offen) this.ansicht = 'lobby';
      else this.ansicht = 'start';
      this.zeichnen();
    }
    verstecken() { this.sichtbar = false; this.wurzel.style.display = 'none'; }

    /** Ganz raus aus dem Online-Modus (zurück ins Hauptmenü). */
    schliessen() {
      if (this.phase) this.rennenAbbauen();
      if (this.verb) { this.verb.senden({ t: 'verlassen' }); const v = this.verb; this.verb = null; setTimeout(() => v.schliessen(), 50); }
      this.lobby = null;
      this.einstellungenZurueck();
      this.verstecken();
      this.ergEl.style.display = 'none';
      this.dialogEl.style.display = 'none';
      if (this.zurueckFn) this.zurueckFn();
    }

    einstellungenZurueck() {
      if (this.basis) { this.spiel.einstellungen = this.basis; this.basis = null; }
    }

    // ---------- Verbindung ----------
    async verbindung() {
      if (this.verb && this.verb.offen) return this.verb;
      const v = new R.NetzVerbindung();
      v.bei('raum', (m) => { this.istHost = !!m.host; this.ichId = m.du; this.raumCode = m.code; });
      v.bei('lobby', (m) => this.lobbyEmpfangen(m));
      v.bei('fehler', (m) => this.fehlerEmpfangen(m));
      v.bei('raumZu', () => this.raumZu('Der Raum wurde geschlossen – der Host ist gegangen.'));
      v.bei('start', (m) => this.startEmpfangen(m));
      v.bei('zustand', (m) => this.zustandEmpfangen(m));
      v.bei('ereignis', (m) => this.ereignisEmpfangen(m));
      v.bei('ergebnis', (m) => this.ergebnisEmpfangen(m));
      v.bei('zu', () => { if (this.verb === v) { this.verb = null; this.raumZu('Die Verbindung zum Server ist weg.'); } });
      await v.verbinden();
      this.verb = v;
      return v;
    }

    /** Meine Wahl aus den lokalen Einstellungen (Fahrer/Auto/Fahrhilfe von Spieler 1). */
    meineWahl() {
      const e = this.spiel.einstellungen;
      return { fahrer: e.fahrer[0], auto: e.autoIds[0], hilfe: e.fahrhilfe[0] };
    }

    async erstellen() {
      this.ansicht = 'verbinden'; this.hinweis = ''; this.zeichnen();
      try {
        const v = await this.verbindung();
        const e = this.spiel.einstellungen;
        v.senden(Object.assign({ t: 'raumErstellen', einstellungen: { streckeId: e.streckeId, welt: e.welt, variante: e.variante, runden: e.runden,
          gegner: e.gegner, schwierigkeit: e.schwierigkeit, tempoKlasse: e.tempoKlasse, jahreszeit: e.jahreszeit, wetter: e.wetter,
          tageszeit: e.tageszeit, kollisionen: e.kollisionen === true, hindernisMenge: e.hindernisMenge } }, this.meineWahl()));   // Stufe 2: zuletzt gewählt (Standard Geister)
      } catch (err) { this.ansicht = 'start'; this.hinweis = 'Keine Verbindung zum Server 😕'; this.zeichnen(); }
    }

    async beitreten() {
      const code = N.codeNormal(this.code.join(''));
      if (!code) { this.hinweis = 'Bitte alle 4 Zeichen eingeben'; this.zeichnen(); return; }
      this.ansicht = 'verbinden'; this.hinweis = ''; this.zeichnen();
      try {
        const v = await this.verbindung();
        v.senden(Object.assign({ t: 'raumBeitreten', code }, this.meineWahl()));
      } catch (err) { this.ansicht = 'code'; this.hinweis = 'Keine Verbindung zum Server 😕'; this.zeichnen(); }
    }

    lobbyEmpfangen(m) {
      const neu = !this.lobby;
      this.lobby = m;
      this.istHost = m.spieler.some(s => s.id === m.du && s.istHost);
      // Meine bestätigte Wahl in die lokalen Einstellungen übernehmen (nächstes Mal vorausgewählt)
      const ich = m.spieler.find(s => s.id === m.du);
      if (ich) {
        const e = this.basis || this.spiel.einstellungen;
        e.fahrer[0] = ich.fahrer; e.autoIds[0] = ich.auto; e.fahrhilfe[0] = ich.hilfe;
        if (!this.basis) this.spiel.einstellungenSpeichern();
      }
      if (this.phase) this.rennenAbbauen();        // Host hat „Zur Lobby“ gedrückt
      if (neu) this.fokus = 0;
      this.ansicht = 'lobby';
      this.sichtbar = true; this.wurzel.style.display = '';
      this.ergEl.style.display = 'none';
      if (this.spiel.zustand === 'menue' && this.spiel.strecke && this.spiel.strecke.id !== m.einstellungen.streckeId) {
        try { this.spiel.menueHintergrund(m.einstellungen.streckeId); } catch (e) { /* nur Deko */ }
      }
      this.zeichnen();
    }

    fehlerEmpfangen(m) {
      if (m.grund === 'keinRaum' && !this.lobby && !this.phase) return;   // Nachzügler einer Eingabe nach „Raum zu“: Hinweis des Hosts nicht überschreiben
      if (this.phase === 'rennen') { const hd = this.spiel.huds[0]; if (hd) hd.meldung(m.text || 'Fehler', 1800); return; }
      this.hinweis = m.text || 'Fehler';
      if (this.ansicht === 'verbinden') this.ansicht = this.lobby ? 'lobby' : (m.grund === 'unbekannt' || m.grund === 'voll' || m.grund === 'laeuft' ? 'code' : 'start');
      this.zeichnen();
    }

    raumZu(text) {
      if (this.phase) this.rennenAbbauen();
      this.lobby = null;
      this.ergEl.style.display = 'none';
      this.dialogEl.style.display = 'none'; this.dialog = false;
      this.hinweis = text;
      this.ansicht = 'start';
      this.sichtbar = true; this.wurzel.style.display = '';
      if (this.spiel.menue) this.spiel.menue.sichtbar = false;
      this.zeichnen();
    }

    // ---------- Eingabe ----------
    codeZeichen(z) {
      if (!N.codeZeichenOk(z)) { this.hinweis = '„' + z + '“ gibt es im Code nicht (kein 0, O, 1, I)'; this.zeichnen(); return; }
      const i = this.code.findIndex(c => !c);
      if (i < 0) return;
      this.code[i] = z.toUpperCase(); this.hinweis = '';
      this.zeichnen();
    }
    codeLoeschen() {
      let i = this.code.length - 1;
      while (i >= 0 && !this.code[i]) i--;
      if (i >= 0) this.code[i] = '';
      this.hinweis = '';
      this.zeichnen();
    }

    /** Taste im Menü-Zustand (Menue.taste leitet weiter, solange dieser Bildschirm offen ist). */
    taste(code) {
      const T = R.config.tasten, P1 = T.spieler[0], P2 = T.spieler[1];
      const dx = code === P1.links || code === P2.links ? -1 : code === P1.rechts || code === P2.rechts ? 1 : 0;
      const dy = code === P1.gas || code === P2.gas ? -1 : code === P1.bremse || code === P2.bremse ? 1 : 0;
      const ok = T.bestaetigen.includes(code);
      if (this.ansicht === 'start') {
        if (code === T.pause) return this.schliessen();
        if (dx) { this.wahl = (this.wahl + dx + 2) % 2; this.zeichnen(); }
        if (ok) this.aktion(this.wahl === 0 ? 'erstellen' : 'beitretenAnsicht');
        return true;
      }
      if (this.ansicht === 'code') {
        if (code === T.pause) { this.ansicht = 'start'; this.hinweis = ''; this.zeichnen(); }
        else if (code === 'Enter') this.beitreten();
        return true;
      }
      if (this.ansicht === 'verbinden') { if (code === T.pause) { this.ansicht = 'start'; this.zeichnen(); } return true; }
      if (this.ansicht === 'lobby') {
        if (code === T.pause) { this.raumVerlassen(); return true; }
        const z = this.zeilen();
        if (dy) { this.fokus = (this.fokus + dy + z.length) % z.length; this.zeichnen(); }
        else if (dx) this.zeileWert(z[this.fokus], dx);
        else if (ok) {
          if (this.istHost) this.aktion('start');
          else this.aktion('bereit');
        }
        return true;
      }
      return true;
    }

    raumVerlassen() {
      if (this.verb) this.verb.senden({ t: 'verlassen' });
      this.lobby = null;
      this.ansicht = 'start'; this.hinweis = '';
      this.zeichnen();
    }

    aktion(a) {
      const [art, p1, p2] = a.split(':');
      if (R.Audio && R.Audio.menueKlick) R.Audio.menueKlick();
      if (art === 'zurueck') return this.schliessen();
      if (art === 'erstellen') return this.erstellen();
      if (art === 'beitretenAnsicht') { this.ansicht = 'code'; this.hinweis = ''; return this.zeichnen(); }
      if (art === 'zumStart') { this.ansicht = 'start'; this.hinweis = ''; return this.zeichnen(); }
      if (art === 'zeichen') return this.codeZeichen(p1);
      if (art === 'loeschen') return this.codeLoeschen();
      if (art === 'beitreten') return this.beitreten();
      if (art === 'verlassen') return this.raumVerlassen();
      if (art === 'bereit') {
        const ich = this.ichLobby();
        if (ich && !this.istHost && this.verb) this.verb.senden({ t: 'bereit', an: !ich.bereit });
        return;
      }
      if (art === 'start') {
        if (!this.istHost || !this.verb) return;
        if (!this.alleBereit()) { this.hinweis = 'Warte, bis alle bereit sind ✋'; this.zeichnen(); return; }
        this.verb.senden({ t: 'start' });
        return;
      }
      if (art === 'wert') return this.wertSetzen(p1, p2);
      if (art === 'fokus') { this.fokus = +p1; return this.zeichnen(); }
      if (art === 'zurLobby') { if (this.verb && this.istHost) this.verb.senden({ t: 'zurLobby' }); return; }
      if (art === 'rennenVerlassen') return this.rennenVerlassen();
      if (art === 'weiterfahren') { this.dialog = false; this.dialogEl.style.display = 'none'; return; }
    }

    ichLobby() { return this.lobby ? this.lobby.spieler.find(s => s.id === this.lobby.du) : null; }
    alleBereit() { return !!this.lobby && this.lobby.spieler.every(s => s.bereit || s.istHost); }

    // ---------- Lobby-Zeilen (Tastatur: ↑↓ Zeile, ←→ Wert) ----------
    zeilen() {
      const z = ['fahrer', 'auto', 'hilfe'];
      if (this.istHost) {
        z.push('strecke', 'welt');
        if (this.variantenListe().length) z.push('variante');
        z.push('hindernisMenge');      // 12.10.: Viele / Sehr viele Hindernisse (nur wirksam in Welten mit Hindernissen)
        z.push('runden', 'gegner', 'schwierigkeit', 'tempoKlasse', 'jahreszeit', 'wetter', 'tageszeit', 'kollisionen');
      }
      return z;
    }
    streckeDaten() {
      const id = this.lobby ? this.lobby.einstellungen.streckeId : this.spiel.einstellungen.streckeId;
      return R.trackCatalog.find(t => t.id === id) || R.trackCatalog[0];
    }
    /** 12.10.: Hat die gewählte Welt Hindernis-Schichten (sonst wirkt „Hindernisse: Viele" nicht)? */
    hindernisMengeAktiv() {
      const e = this.lobby ? this.lobby.einstellungen : {};
      return !R.Strecke || !R.Strecke.weltHatHindernisse || R.Strecke.weltHatHindernisse(this.streckeDaten(), e.welt);
    }
    variantenListe() {
      const v = this.streckeDaten().varianten || {};
      const ks = Object.keys(v);
      return ks.length ? [{ k: '', text: 'Normal' }].concat(ks.map(k => ({ k, text: '📏 ' + (v[k].name || k) }))) : [];
    }
    /** Werte einer Zeile: [{ k, text, aus, tod }] und der aktuelle Wert. */
    werte(zeile) {
      const c = R.config, L = this.lobby, e = L ? L.einstellungen : {}, ich = this.ichLobby() || {};
      if (zeile === 'fahrer') {
        const belegt = new Set(L ? L.spieler.filter(s => s.id !== L.du).map(s => s.fahrer) : []);
        return { wert: ich.fahrer, liste: c.fahrer.map(f => ({ k: f.name, text: f.emoji, titel: f.name, aus: belegt.has(f.name), emoji: true })) };
      }
      if (zeile === 'auto') return { wert: ich.auto, liste: R.carCatalog.waehlbare().map(a => ({ k: a.id, text: a.name.replace(/^(VW|Mercedes-AMG|Porsche|BMW|Audi) /, '') })) };
      if (zeile === 'hilfe') return { wert: ich.hilfe, liste: Object.keys(c.fahrhilfen).map(k => ({ k, text: c.fahrhilfen[k].name })) };
      if (zeile === 'strecke') return { wert: e.streckeId, liste: R.trackCatalog.map(t => ({ k: t.id, text: t.name })) };
      if (zeile === 'welt') {
        const d = this.streckeDaten(), info = R.weltInfo || {};
        return { wert: e.welt || d.weltStandard, liste: Object.keys(d.welten || {}).map(k => ({ k, text: ((info[k] && info[k].emoji) || '🌍') + ' ' + ((info[k] && info[k].name) || k) })) };
      }
      if (zeile === 'variante') return { wert: e.variante || '', liste: this.variantenListe() };
      if (zeile === 'hindernisMenge') {
        const S = (c.hindernisMenge && c.hindernisMenge.stufen) || {}, an = this.hindernisMengeAktiv();
        return { wert: e.hindernisMenge || 'normal', liste: Object.keys(S).map(k => ({ k, text: S[k].name, aus: !an })) };
      }
      if (zeile === 'runden') {
        const l = [];
        for (let r = c.rennen.rundenMin; r <= c.rennen.rundenMax; r++) l.push({ k: String(r), text: String(r) });
        return { wert: String(e.runden), liste: l };
      }
      if (zeile === 'gegner') {
        const max = Math.max(0, Math.min(c.rennen.gegnerMax, N.MAX_AUTOS - (L ? L.spieler.length : 1))), l = [];
        for (let g = 0; g <= max; g++) l.push({ k: String(g), text: String(g) });
        return { wert: String(e.gegner), liste: l };
      }
      if (zeile === 'schwierigkeit') {
        const S = c.schwierigkeiten;
        return { wert: e.schwierigkeit, liste: Object.keys(S).sort((a, b) => (S[a].rang || 0) - (S[b].rang || 0)).map(k => ({ k, text: (k === 'unschlagbar' ? '💀 ' : '') + S[k].name, tod: k === 'unschlagbar' })) };
      }
      if (zeile === 'tempoKlasse') return { wert: e.tempoKlasse, liste: [{ k: 'normal', text: 'Normal' }, { k: 'schnell', text: 'Schnell' }] };
      if (zeile === 'jahreszeit') {
        const thema = this.streckeDaten().thema, J = c.jahreszeiten || {};
        const l = Object.keys(J).filter(k => !R.Wetter || !R.Wetter.erlaubt || R.Wetter.erlaubt(thema, k).length > 0)
          .map(k => ({ k, text: (thema === 'wueste' && k === 'winter') ? '🌪️ Sandsturm' : J[k].emoji + ' ' + J[k].name }));
        l.push({ k: 'zufall', text: '🎲' });
        return { wert: e.jahreszeit, liste: l };
      }
      if (zeile === 'wetter') {
        const thema = this.streckeDaten().thema, W = c.wetter || {};
        let ks = ['klar'];
        if (e.jahreszeit !== 'zufall' && R.Wetter && R.Wetter.erlaubt) ks = R.Wetter.erlaubt(thema, e.jahreszeit);
        const l = ks.map(k => ({ k, text: (W[k].emoji || '☀️') + ' ' + W[k].name }));
        l.push({ k: 'zufall', text: '🎲' });
        return { wert: e.wetter, liste: l };
      }
      if (zeile === 'kollisionen') return { wert: e.kollisionen ? 'an' : 'aus', liste: [{ k: 'aus', text: '👻 Geister' }, { k: 'an', text: '💥 Rempeln' }] };
      if (zeile === 'tageszeit') return { wert: e.tageszeit, liste: [{ k: 'tag', text: '☀️ Tag' }, { k: 'daemmerung', text: '🌇 Dämmerung' }, { k: 'nacht', text: '🌙 Nacht' }] };
      return { wert: null, liste: [] };
    }
    zeileWert(zeile, dx) {
      const w = this.werte(zeile), l = w.liste;
      if (!l.length || l.every(x => x.aus)) return;      // 12.10.: Zeile ausgegraut (z. B. Hindernisse in Welt ohne Hindernisse)
      let i = l.findIndex(x => x.k === w.wert);
      for (let k = 0; k < l.length; k++) {
        i = (i + dx + l.length) % l.length;
        if (!l[i].aus) break;
      }
      this.wertSetzen(zeile, l[i].k);
    }
    wertSetzen(zeile, k) {
      if (!this.verb || !this.lobby) return;
      if (zeile === 'fahrer' || zeile === 'auto' || zeile === 'hilfe') { this.verb.senden({ t: 'wahl', [zeile]: k }); return; }
      if (!this.istHost) return;
      const e = {};
      if (zeile === 'strecke') { e.streckeId = k; e.welt = ''; e.variante = ''; }
      else if (zeile === 'welt') e.welt = k === this.streckeDaten().weltStandard ? '' : k;
      else if (zeile === 'runden' || zeile === 'gegner') e[zeile] = +k;
      else if (zeile === 'jahreszeit') { e.jahreszeit = k; e.wetter = 'klar'; }
      else if (zeile === 'hindernisMenge') {
        e.hindernisMenge = k;
        // zuletzt gewählten Wert merken (wie bei Rempeln)
        const lok = this.basis || this.spiel.einstellungen;
        lok.hindernisMenge = k;
        if (!this.basis) this.spiel.einstellungenSpeichern();
      }
      else if (zeile === 'kollisionen') {
        e.kollisionen = k === 'an';
        // zuletzt gewählten Wert merken (nächster „Raum erstellen“ startet damit)
        const lok = this.basis || this.spiel.einstellungen;
        lok.kollisionen = e.kollisionen;
        if (!this.basis) this.spiel.einstellungenSpeichern();
      }
      else e[zeile] = k;
      this.verb.senden({ t: 'einstellungen', einstellungen: e });
    }

    // ---------- Zeichnen ----------
    zeichnen() {
      if (!this.sichtbar) return;
      const kopf = `<div class="m-kopf"><div class="m-logo"><div class="m-titel">🔥 ${R.config.titel} 🏎️</div>` +
        `<div class="m-untertitel">${R.config.untertitel}</div></div><div class="m-schritte"><div class="m-schritt aktiv"><b>🌐</b> Online</div></div></div>`;
      let inhalt = '', fuss = '', hinweis = '';
      const hw = this.hinweis ? `<div class="on-hinweis">${esc(this.hinweis)}</div>` : '';
      if (this.ansicht === 'start') {
        inhalt = `<h1>Online spielen</h1><div class="reihe on-wahl">` +
          `<div class="karte gross${this.wahl === 0 ? ' gewaehlt' : ''}" data-a="erstellen"><div class="emoji">🏠</div><div class="karten-name">Raum erstellen</div>` +
          `<div class="karten-sub">Du bist der Host und bekommst einen Code für die anderen</div></div>` +
          `<div class="karte gross${this.wahl === 1 ? ' gewaehlt' : ''}" data-a="beitretenAnsicht"><div class="emoji">🔑</div><div class="karten-name">Raum beitreten</div>` +
          `<div class="karten-sub">Gib den Code ein, den du bekommen hast</div></div></div>${hw}` +
          `<div class="on-info">👻 Online fahren die Autos meist durcheinander durch (Geister), der Host kann 💥 Rempeln einschalten · Schaden ist online aus · kein Chat</div>`;
        fuss = `<div class="knopf klein" data-a="zurueck">◀ Zurück</div>`;
        hinweis = '<kbd>←</kbd><kbd>→</kbd> auswählen · <kbd>Enter</kbd> weiter · <kbd>Esc</kbd> zurück';
      } else if (this.ansicht === 'code') {
        const cur = this.code.findIndex(c => !c);
        inhalt = `<h1>Raumcode eingeben</h1><div class="on-codefelder">` +
          this.code.map((c, i) => `<span class="${i === cur ? 'cursor' : ''}">${c || ''}</span>`).join('') + `</div>` +
          `<div class="on-tasten">` + N.CODE_ZEICHEN.split('').map(z => `<span data-a="zeichen:${z}">${z}</span>`).join('') +
          `<span data-a="loeschen" title="löschen">⌫</span></div>` +
          `<div class="knopf gruen" data-a="beitreten">Beitreten ▶ <kbd>Enter</kbd></div>${hw}`;
        fuss = `<div class="knopf klein" data-a="zumStart">◀ Zurück</div>`;
        hinweis = 'Buchstaben/Ziffern tippen · <kbd>⌫</kbd> löschen · <kbd>Enter</kbd> beitreten';
      } else if (this.ansicht === 'verbinden') {
        inhalt = `<h1>Verbinde … 🌐</h1>${hw}`;
        fuss = `<div class="knopf klein" data-a="zumStart">◀ Zurück</div>`;
      } else if (this.ansicht === 'laden') {
        inhalt = `<h1>Rennen wird geladen … 🏁</h1>`;
      } else if (this.ansicht === 'lobby' && this.lobby) {
        inhalt = this.htmlLobby(hw);
        const alle = this.alleBereit(), ich = this.ichLobby() || {};
        fuss = `<div class="on-aktion"><div class="knopf klein" data-a="verlassen">🚪 Verlassen <kbd>Esc</kbd></div>` +
          (this.istHost
            ? `<div class="knopf gruen${alle ? '' : ' aus'}" data-a="start">🏁 Start <kbd>Enter</kbd></div>`
            : `<div class="knopf ${ich.bereit ? 'gruen' : 'blau'}" data-a="bereit">${ich.bereit ? '✅ Bereit!' : '✋ Bereit?'} <kbd>Leertaste</kbd></div>`) + `</div>`;
        hinweis = '<kbd>↑</kbd><kbd>↓</kbd> Zeile · <kbd>←</kbd><kbd>→</kbd> ändern' + (this.istHost ? ' · <kbd>Enter</kbd> Start' : ' · <kbd>Leertaste</kbd> bereit');
      }
      this.wurzel.innerHTML = kopf + `<div class="m-inhalt">${inhalt}</div>` +
        `<div class="m-fuss"><div class="m-nav">${fuss}</div><div class="m-hinweis">${hinweis}</div></div>`;
    }

    htmlLobby(hw) {
      const L = this.lobby, e = L.einstellungen, c = R.config;
      const link = einladungsBasis(L.oeffentlich) + '?raum=' + L.code;
      let qr = '';
      try { qr = R.QR ? R.QR.svg(link, { modul: 3, rand: 2 }) : ''; } catch (err) { qr = ''; }
      const autoName = (id) => { const a = R.carCatalog.waehlbare().find(x => x.id === id); return a ? a.name : id; };
      const autoFarbe = (id) => { const a = R.carCatalog.waehlbare().find(x => x.id === id); return a ? HEX(a.farbe) : '#888'; };
      const spieler = L.spieler.map(s => `<div class="on-sp${s.id === L.du ? ' ich' : ''}"><span class="on-emoji">${R.fahrerEmoji(s.fahrer)}</span>` +
        `<span class="on-name">${esc(s.fahrer)}${s.istHost ? ' 👑' : ''}</span><span class="on-auto"><i style="background:${autoFarbe(s.auto)}"></i>${esc(autoName(s.auto))}</span>` +
        `<span>${s.istHost ? '🏁' : s.bereit ? '✅' : '⏳'}</span></div>`).join('');
      const z = this.zeilen();
      const zeile = (id, label) => {
        const w = this.werte(id), i = z.indexOf(id);
        return `<div class="on-zeile${i === this.fokus ? ' fokus' : ''}" data-a="fokus:${i}"><div class="on-label">${label}</div><div class="on-werte">` +
          w.liste.map(x => `<span class="pille${x.k === w.wert ? ' aktiv' : ''}${x.aus ? ' aus' : ''}${x.emoji ? ' emoji' : ''}${x.tod ? ' tod' : ''}"` +
            `${x.aus ? '' : ` data-a="wert:${id}:${x.k}"`}${x.titel ? ` title="${esc(x.titel)}"` : ''}>${esc(x.text)}</span>`).join('') + `</div></div>`;
      };
      const meine = zeile('fahrer', '🧑 Fahrer') + zeile('auto', '🚗 Auto') + zeile('hilfe', '🛟 Fahrhilfe');
      let rechts;
      const daten = this.streckeDaten();
      if (this.istHost) {
        rechts = `<h3>⚙️ Rennen (du bist der Host)</h3>` + zeile('strecke', '🗺️ Strecke') + zeile('welt', '🌍 Welt') +
          (this.variantenListe().length ? zeile('variante', '📏 Variante') : '') +
          zeile('hindernisMenge', this.hindernisMengeAktiv() ? '🚧 Hindernisse' : '🚧 Hindernisse <small>(erst ab Welt „Hindernisse“)</small>') + zeile('runden', '🔁 Runden') +
          zeile('gegner', '🤖 Computer-Gegner') + zeile('schwierigkeit', '🎚️ Computer-Stärke') + zeile('tempoKlasse', '🏎️ Tempo') +
          zeile('jahreszeit', '🍂 Jahreszeit') + zeile('wetter', '🌦️ Wetter') + zeile('tageszeit', '🌗 Tageszeit') +
          `<div class="on-fest">💥 Schaden: aus (online) · ${e.kollisionen ? '💥 Rempeln an' : '👻 Geister: Autos fahren durcheinander durch'}</div>`;
      } else {
        const wi = (R.weltInfo || {})[e.welt || daten.weltStandard] || {};
        const S = c.schwierigkeiten[e.schwierigkeit] || {};
        const J = (c.jahreszeiten || {})[e.jahreszeit], W = (c.wetter || {})[e.wetter], T = { tag: '☀️ Tag', daemmerung: '🌇 Dämmerung', nacht: '🌙 Nacht' };
        rechts = `<h3>⚙️ Rennen (stellt der Host ein)</h3><div class="on-zusammen">` +
          `🗺️ ${esc(daten.name)} · ${wi.emoji || '🌍'} ${esc(wi.name || e.welt || '')}${e.variante ? ' · 📏 XL' : ''}<br>` +
          `🔁 ${e.runden} Runden · 🤖 ${e.gegner} Computer (${esc(S.name || e.schwierigkeit)})<br>` +
          (e.hindernisMenge && e.hindernisMenge !== 'normal' && this.hindernisMengeAktiv() ? `🚧 Hindernisse: ${esc(((c.hindernisMenge.stufen[e.hindernisMenge]) || {}).name || e.hindernisMenge)}<br>` : '') +
          `🏎️ ${e.tempoKlasse === 'schnell' ? 'Schnell' : 'Normal'} · ${J ? J.emoji + ' ' + J.name : '🎲'} · ${W ? (W.emoji || '☀️') + ' ' + W.name : '🎲'} · ${T[e.tageszeit] || ''}<br>` +
          `💥 Schaden: aus (online) · ${e.kollisionen ? '💥 Rempeln an' : '👻 Geister'}</div>`;
      }
      return `<div class="on-lobby">` +
        `<div class="on-spalte on-einladung"><div class="on-klein">Raumcode</div><div class="on-code">${esc(L.code)}</div>` +
        (qr ? `<div class="on-qr" title="QR-Code mit dem Handy scannen">${qr}</div>` : '') +
        `<div class="on-link">${esc(link)}</div><div class="on-klein">Code eingeben, Link öffnen oder QR scannen</div></div>` +
        `<div class="on-spalte on-mitte"><h3>👥 Spieler (${L.spieler.length}/${L.max || N.MAX_SPIELER})</h3><div class="on-spieler">${spieler}</div>` +
        `<div class="on-wahl-block"><h3>Deine Wahl</h3>${meine}</div>` +
        // W5 Stufe 2: Geister/Rempeln (nur der Host stellt es ein; Gäste sehen den Wert rechts in der Zusammenfassung)
        (this.istHost ? `<div class="on-wahl-block"><h3>🚗💥 Autos untereinander (Host)</h3>${zeile('kollisionen', '💥 Rempeln (gut bei Ping unter 100 ms)')}</div>` : '') +
        `${hw}</div>` +
        `<div class="on-spalte on-einst">${rechts}</div></div>`;
    }

    // ================================================================ Online-Rennen
    startEmpfangen(m) {
      this.ansicht = 'laden'; this.zeichnen();
      // kurz warten, damit „wird geladen“ sichtbar ist (der Aufbau blockiert den Browser einen Moment)
      setTimeout(() => {
        try { this.rennenAufbauen(m); } catch (err) {
          console.error(err);
          this.raumZu('Das Rennen konnte nicht geladen werden 😕');
          if (this.verb) this.verb.senden({ t: 'verlassen' });
        }
      }, 40);
    }

    rennenAufbauen(m) {
      const spiel = this.spiel, e = m.einstellungen, du = m.du;
      if (!this.basis) this.basis = spiel.einstellungen;
      spiel.einstellungen = Object.assign({}, this.basis, {
        streckeId: e.streckeId, welt: e.welt, variante: e.variante, jahreszeit: e.jahreszeit, wetter: e.wetter, windStaerke: e.windStaerke,
        windRichtung: e.windRichtung, tageszeit: e.tageszeit, hindernisMenge: e.hindernisMenge, tempoKlasse: e.tempoKlasse, runden: e.runden, gegner: e.gegner,
        schaden: false, polizei: false, rempeln: 'sanft', modus: 'solo', spielart: 'rennen',
      });
      if (spiel.menue) spiel.menue.verstecken();
      spiel.ergebnisAnzeige.verstecken(); spiel.pauseAnzeige.verstecken();
      if (spiel.pokalAnzeige) spiel.pokalAnzeige.verstecken();
      this.verstecken();
      this.ergEl.style.display = 'none';
      spiel.szeneAbbauen();
      spiel.pausiert = false;
      spiel.tempoKlasse = e.tempoKlasse;
      const strecke = spiel.streckeSzeneBauen(e.streckeId);
      const katalog = R.carCatalog.waehlbare();
      const plaetze = strecke.startpositionen(m.teilnehmer.length);
      const tl = [];
      this.geisterMat = [];
      m.teilnehmer.forEach((t, i) => {
        const p = plaetze[i], auto = katalog.find(a => a.id === t.autoId) || katalog[0];
        const f = spiel.fahrzeugHinzufuegen(auto, p.x, p.z, p.heading, null);
        f.vehicle.y = strecke.hoeheAn(p.x, p.z);
        spiel._vorherAngleichen(f);
        f.istSpieler = i === du; f.spielerNr = i === du ? 0 : -1;
        f.fahrhilfe = t.hilfe; f.index = -1; f.stehZeit = 0; f.resetHinweis = false; f.falschHerum = false; f.falschZeit = 0;
        f.netRs = 0; f.netWinkel = null;
        f.schatten = new R.Vehicle(auto.fahrwerte, { tempoKlasse: e.tempoKlasse });
        if (i !== du && !e.kollisionen) this.geist(f.mesh);          // Stufe 1: Geister; Stufe 2 (kollisionen) deckend
        tl.push({ vehicle: f.vehicle, name: t.name, istSpieler: !!t.mensch });
      });
      const rennen = new R.RaceManager(strecke, tl, { runden: e.runden, countdown: m.countdown });
      spiel.rennen = rennen;
      spiel.startBoost = null; spiel.schaden = null; spiel.polizei = null; spiel.muenzen = null;
      const mein = spiel.fahrzeuge[du];
      spiel.kameraHinzufuegen(mein);
      const hud = new R.Hud(spiel.hudWurzel, { rennen, teilnehmer: rennen.teilnehmer[du], fahrzeug: mein, nr: 0, split: false });
      spiel.huds = [hud];
      if (spiel.wetter) { spiel.wetter.partikelBauen(1); if (hud.wetterSetzen) hud.wetterSetzen(spiel.wetter); }
      if (hud.schadenSetzen) hud.schadenSetzen(null, du);
      if (hud.itemSetzen) hud.itemSetzen(spiel.pickups, du, 0);
      if (hud.polizeiSetzen) hud.polizeiSetzen(null, 0);
      if (hud.muenzenSetzen) hud.muenzenSetzen(null);
      // Ping + 🌐 in der Namens-Karte oben links
      const links = hud.el.querySelector('.hud-links');
      this.pingEl = el('div', 'hud-netz', links || hud.el);
      this.pingEl.textContent = '🌐 … ms';
      if (R.Audio) {
        const A = R.Audio; spiel._tonCd = -1;
        spiel.fahrzeuge.forEach((f, i) => A.motorAnlegen(i, { spieler: f.istSpieler }));
      }
      // Netz-Zustand
      this.du = du;
      this.teilnehmer = m.teilnehmer;
      this.kollisionen = e.kollisionen === true;        // Stufe 2 (Rempeln): Vorhersage kennt die anderen Autos
      const andere = this.kollisionen ? m.teilnehmer.map((t, i) => (i === du ? null : { nr: i, auto: katalog.find(a => a.id === t.autoId) || katalog[0] })).filter(Boolean) : [];
      this.vorhersage = new R.NetzVorhersage({ strecke, auto: mein.auto, tempoKlasse: e.tempoKlasse, fahrhilfe: m.teilnehmer[du].hilfe,
        umwelt: () => (spiel.wetter ? spiel.wetter.umwelt() : undefined), kollisionen: this.kollisionen, andere, rempeln: 'sanft' });
      const vp = this.vorhersage.vp, p0 = plaetze[du];
      vp.setzen(p0.x, p0.z, p0.heading); vp.y = strecke.hoeheAn(p0.x, p0.z);
      this.puffer = new R.NetzPuffer();
      if (this.verb) this.verb.uhrNeu();
      this.n = 0; this.t0 = null; this.empfangen = false; this._letzteS = null; this.itemFlag = false; this.resetFlag = false;
      this.startTick = null; this.dynTick = 0; this._gestartet = false; this.warSonder = false;
      this.schattenListe = spiel.fahrzeuge.map(f => ({ vehicle: f.schatten, istSpieler: false }));
      this._pingZeit = 0;
      this.dialog = false; this.dialogEl.style.display = 'none';
      this.phase = 'rennen';
      spiel.online = this;
      spiel.zustand = 'online';
      spiel.uhr.rest = 0;
      spiel.qualitaet.stufe = 0; spiel.qualitaet.unten = spiel.qualitaet.oben = 0; spiel.qualitaet.fpsGlatt = 60;
      spiel._hudZeit = -1e9;
      spiel._physikZeit = 0;
      if (spiel.tunnelLichter) spiel._tunnelLichterVorkompilieren();
      spiel.groesse();
      if (this.verb) this.verb.senden({ t: 'geladen' });
    }

    /** Geister-Darstellung: alle Materialien des Autos als Kopie halbtransparent (Cache-Materialien bleiben unberührt). */
    geist(mesh) {
      const kopien = new Map(), ud = mesh.userData || {};
      mesh.traverse((o) => {
        if (!o.material) return;
        const ein = (m) => {
          if (m === ud.bremslichtMaterial) { m.transparent = true; m.opacity = 0.6; return m; }
          if (!kopien.has(m)) {
            const k = m.clone();
            k.transparent = true; k.opacity = (m.opacity === undefined ? 1 : m.opacity) * 0.6;
            kopien.set(m, k); this.geisterMat.push(k);
          }
          return kopien.get(m);
        };
        o.material = Array.isArray(o.material) ? o.material.map(ein) : ein(o.material);
      });
    }

    rennenAbbauen() {
      const spiel = this.spiel;
      this.phase = null;
      spiel.online = null;
      this.dialog = false; this.dialogEl.style.display = 'none';
      spiel.szeneAbbauen();
      (this.geisterMat || []).forEach(m => m.dispose());
      this.geisterMat = [];
      spiel.zustand = 'menue';
      spiel.ui.classList.remove('split');
      this.vorhersage = null; this.puffer = null; this.pingEl = null;
      const id = this.lobby ? this.lobby.einstellungen.streckeId : spiel.einstellungen.streckeId;
      this.einstellungenZurueck();
      try { spiel.menueHintergrund(id); } catch (e) { /* nur Deko */ }
    }

    rennenVerlassen() {
      this.raumVerlassen();
      this.rennenAbbauen();
      this.ergEl.style.display = 'none';
      this.sichtbar = true; this.wurzel.style.display = '';
      this.zeichnen();
    }

    /** Spiel-Taste im Zustand 'online' (main.js taste). */
    rennTaste(code, wiederholt) {
      const T = R.config.tasten;
      if (this.dialog) {
        if (wiederholt) return;
        if (code === T.pause) this.aktion('weiterfahren');
        else if (T.bestaetigen.includes(code)) this.aktion('rennenVerlassen');
        return;
      }
      if (this.phase === 'ergebnis') {
        if (wiederholt) return;
        if (code === 'Enter' && this.istHost) this.aktion('zurLobby');
        else if (code === T.pause) this.aktion('rennenVerlassen');
        return;
      }
      if (this.phase !== 'rennen' || wiederholt) return;
      if (code === T.pause) {
        this.dialog = true;
        this.dialogEl.innerHTML = `<div class="pause-karte"><h1>🌐 Rennen verlassen?</h1>` +
          `<div class="knopf gruen" data-a="weiterfahren">▶ Weiterfahren <kbd>Esc</kbd></div>` +
          `<div class="knopf blau" data-a="rennenVerlassen">🚪 Verlassen <kbd>Enter</kbd></div>` +
          `<div class="on-klein" style="text-align:center;font-size:.6em">Das Rennen läuft weiter – online gibt es keine Pause</div></div>`;
        this.dialogEl.style.display = '';
      } else if (code === T.kamera) this.spiel.kameras.forEach(k => k.naechsterModus());
      else if (code === T.resetSpieler1 || code === T.resetSpieler2) this.reset();
      else if (code === T.item1 || code === T.item2) this.item();
    }
    item() { if (this.phase === 'rennen') this.itemFlag = true; }
    reset() { if (this.phase === 'rennen') this.resetFlag = true; }

    // ---------- Server-Nachrichten im Rennen ----------
    zustandEmpfangen(z) {
      if (this.phase !== 'rennen') return;
      const spiel = this.spiel, r = spiel.rennen;
      this.empfangen = true;
      this.puffer.rein(z);
      // Rennleitung (Puppe): Zustand, Zeit, Plätze, Runden
      if (r.zustand === 'countdown' && z.rz !== 'countdown') this._start(z.k);
      r.zustand = z.rz;
      r.countdown = z.cd;
      if (Math.abs(r.zeit - z.zt) > 0.15 || z.rz !== 'laeuft') r.zeit = z.zt;
      for (let i = 0; i < z.a.length && i < r.teilnehmer.length; i++) {
        const a = z.a[i], t = r.teilnehmer[i];
        t.runde = a[9]; t.platz = a[10]; t.naechsterCheckpoint = a[11]; t.fortschritt = a[12];
        t.istSpieler = !!(a[6] & 128);
        if (a[6] & 16) t.imZiel = true;
      }
      r.rangliste = r.teilnehmer.slice().sort((x, y) => x.platz - y.platz);
      // eigener Wagen
      if (z.ich) {
        const ich = z.ich, f = spiel.fahrzeuge[this.du], t = r.teilnehmer[this.du];
        const v = f.vehicle, anzeige = { x: v.x, z: v.z, y: v.y, heading: v.heading };
        this.vorhersage.abgleich(ich, anzeige, this.kollisionen === true ? z.a : undefined, z.k);
        f.resetHinweis = !!ich.rh; f.falschHerum = !!ich.fh;
        t.rundenStart = ich.rs; t.rundenzeiten = ich.rzn || []; t.bestzeit = ich.bz;
        if (ich.zz !== null && ich.zz !== undefined) t.zielZeit = ich.zz;
        if (ich.zp) t.zielPlatz = ich.zp;
        if (this.vorhersage.hart) { this.vorhersage.anzeigen(v); spiel._vorherAngleichen(f); this.vorhersage.hart = false; }
      }
      // Pickups (Turbo, Schild, Ölfässer, Ölflecken) für die Anzeige übernehmen
      const pu = spiel.pickups;
      if (pu && z.pu) {
        pu.kugeln.forEach((k, i) => { const da = z.pu.k[i] === '1'; if (da && !k.da) k.erschienen = 0; k.da = da; });
        pu.faesser.forEach((k, i) => { const da = z.pu.f[i] === '1'; if (da && !k.da) k.erschienen = 0; k.da = da; });
        pu.oel.length = 0;
        for (const o of z.pu.o) pu.oel.push({ x: o[0], z: o[1], heading: o[2], alter: o[3], owner: o[4], geschuetzt: new Set() });
        z.a.forEach((a, i) => {
          const s = pu._auto(i), w = z.pu.v[i];
          s.v = spiel.fahrzeuge[i] ? spiel.fahrzeuge[i].vehicle : null;
          if (w) { s.turbo = w[0]; s.vFaktor = w[1]; s.bFaktor = w[2]; }
          s.schild = !!(a[6] & 4); s.item = (a[6] & 8) ? 1 : 0;
          if ((a[6] & 64) && !(s.platzt > 0)) s.platzt = 0.4;
        });
      }
    }

    _start(k) {
      if (this._gestartet) return;
      this._gestartet = true;
      const r = this.spiel.rennen;
      this.startTick = k;
      r.zustand = 'laeuft'; r.zeit = 0;
      r._melden('start');
      if (R.Audio) R.Audio.countdown(0);
    }

    ereignisEmpfangen(m) {
      if (this.phase !== 'rennen') return;
      const spiel = this.spiel, r = spiel.rennen, hud = spiel.huds[0];
      const t = r.teilnehmer[m.nr];
      if (m.art === 'start') this._start(m.k);
      else if (m.art === 'meldung') { if (hud) hud.meldung(m.text, String(m.text).indexOf('\n') >= 0 ? 3200 : 1500); }
      else if (m.art === 'runde' && t) {
        t.runde = m.runde;
        if (m.nr === this.du) t.rundenzeiten = t.rundenzeiten.concat([m.zeit]);
        r._melden('runde', t, m.zeit);
        spiel.strecke.pylonenZurueck(m.nr);
        if (R.Audio && m.nr === this.du && t.runde < r.runden) R.Audio.runde();
      } else if (m.art === 'ziel' && t) {
        t.imZiel = true; t.zielPlatz = m.platz; t.zielZeit = m.zeit;
        r._melden('ziel', t);
        if (R.Audio && m.nr === this.du) R.Audio.ziel(m.platz);
      } else if (m.art === 'weg') {
        if (t) t.istSpieler = false;
        if (hud) hud.meldung(m.text, 2500);
      }
    }

    ergebnisEmpfangen(m) {
      if (this.phase !== 'rennen') return;
      this.phase = 'ergebnis';
      this.dialog = false; this.dialogEl.style.display = 'none';
      const autos = R.carCatalog.waehlbare();
      const zeilen = m.zeilen.map((z) => {
        const a = autos.find(x => x.id === z.autoId);
        const ich = z.nr === this.du;
        const zeit = z.zeit !== null ? R.zeitText(z.zeit) : '<span class="noch">unterwegs</span>';
        return `<tr class="${ich ? 'spieler p1' : z.mensch ? 'spieler p2' : 'computer'}"><td class="platz">${z.platz}.</td>` +
          `<td class="name">${z.mensch ? R.fahrerEmoji(z.name) + ' ' : '🤖 '}${esc(z.name)}${z.weg ? ' <span class="on-weg">🚪 weg</span>' : ''}</td>` +
          `<td class="auto"><i style="background:${a ? HEX(a.farbe) : '#888'}"></i>${a ? esc(a.name) : ''}</td>` +
          `<td class="zeit">${zeit}</td><td class="zeit">${z.beste !== null ? R.zeitText(z.beste) : '–'}</td></tr>`;
      }).join('');
      this.ergEl.innerHTML = `<div class="ergebnis-karte"><h1>🌐 Ergebnis</h1>` +
        `<table><thead><tr><th>Platz</th><th>Name</th><th>Auto</th><th>Gesamtzeit</th><th>Beste Runde</th></tr></thead><tbody>${zeilen}</tbody></table>` +
        `<div class="knoepfe">` + (this.istHost ? `<div class="knopf gruen" data-a="zurLobby">👥 Zur Lobby <kbd>Enter</kbd></div>`
          : `<div class="knopf" style="background:rgba(255,255,255,.2)">⏳ Warten auf den Host …</div>`) +
        `<div class="knopf blau" data-a="rennenVerlassen">🚪 Verlassen <kbd>Esc</kbd></div></div></div>`;
      this.ergEl.style.display = '';
      this.statistik.korrekturen = this.vorhersage ? Object.assign({}, this.vorhersage.stat) : null;
    }

    // ---------- fester Schritt (main.js physikSchritt im Zustand 'online') ----------
    physikSchritt(dt) {
      if (this.phase !== 'rennen') return;
      const spiel = this.spiel, fz = spiel.fahrzeuge, r = spiel.rennen, st = spiel.strecke, V = this.vorhersage;
      spiel._physikZeit = (spiel._physikZeit || 0) + dt;
      for (let i = 0; i < fz.length; i++) {
        const v = fz[i].vehicle, a = fz[i].vorher;
        a.x = v.x; a.y = v.y; a.z = v.z; a.heading = v.heading; a.nicken = v.nicken; a.neigung = v.neigung;
      }
      const mein = fz[this.du], meinT = r.teilnehmer[this.du];
      let sd = this._letzteS || { gas: 0, bremse: 0, lenkung: 0 };
      const DT = R.config.physik.schritt;
      if (this.empfangen && this.verb) {
        // Eingaben im Echtzeit-Takt (60 je Sekunde), unabhängig von der Bildrate: langsame Geräte schicken pro
        // Bild mehrere Schritte nach, damit der Server (der in Echtzeit rechnet) nie ohne Eingabe dasteht.
        const jetzt = performance.now() / 1000;
        if (this.t0 === null) this.t0 = jetzt - DT;
        let soll = Math.floor((jetzt - this.t0) / DT);
        if (soll - this.n > 120) { this.t0 = jetzt - (this.n + 1) * DT; soll = this.n + 1; }   // > 2 s: Tab war im Hintergrund
        for (let k = 0; this.n < soll && k < 40; k++) {
          // Eingabe je Schritt: Pfeile ODER WASD (online fährt jeder allein); Touch mischt input.steuerung selbst ein
          let s = { gas: 0, bremse: 0, lenkung: 0 };
          if (!this.dialog) {
            const a = spiel.input.steuerung(0), b = spiel.input.steuerung(1);
            s = { gas: Math.max(a.gas || 0, b.gas || 0), bremse: Math.max(a.bremse || 0, b.bremse || 0),
              lenkung: Math.max(-1, Math.min(1, (a.lenkung || 0) + (b.lenkung || 0))) };
          }
          const kod = N.eingabeKodieren(s);
          sd = N.eingabeDekodieren(kod);
          this._letzteS = sd;
          this.n++;
          const msg = { t: 'eingabe', n: this.n, g: kod.g, b: kod.b, l: kod.l };
          if (this.itemFlag) msg.i = 1;
          if (this.resetFlag) msg.r = 1;
          this.itemFlag = this.resetFlag = false;
          this.verb.senden(msg);
          V.schritt(this.n, sd, { countdown: r.zustand === 'countdown', imZiel: meinT.imZiel });
        }
      }
      const tick = this.verb ? this.verb.serverTick() : null;
      // --- eigener Wagen ---
      if (!V.sonder) {
        if (this.warSonder) { this.warSonder = false; }
        V.abklingen(dt);
        V.anzeigen(mein.vehicle);
        mein.bremst = V.bremst;
        if (mein.looping) mein.looping.aktiv = false;
        if (mein.flug) mein.flug.aktiv = false;
        mein.index = V.idx;
      } else if (tick !== null) {
        const ziel = this._tmp || (this._tmp = { x: 0, z: 0, y: 0, heading: 0, vLaengs: 0, lenkung: 0, nicken: 0, neigung: 0 });
        const um = this.puffer.um(tick - 0.05 / DT);
        if (um) {
          const lp = R.NetzPuffer.interpolieren(um.a.a[this.du], um.b.a[this.du], um.t, ziel);
          if (!this.warSonder) { this.warSonder = true; V.uebergang(mein.vehicle, ziel); }
          V.abklingen(dt);
          const v = mein.vehicle, c = V.korr;
          v.x = ziel.x + c.x; v.z = ziel.z + c.z; v.y = ziel.y + c.y; v.heading = ziel.heading + c.h;
          v.vLaengs = ziel.vLaengs; v.lenkung = ziel.lenkung; v.nicken = ziel.nicken; v.neigung = ziel.neigung;
          this._looping(mein, lp);
          this._flags(mein, um.b.a[this.du]);
          if (V.hart) { spiel._vorherAngleichen(mein); V.hart = false; }
        }
      }
      v_letzte(mein.vehicle, sd);       // Motorton/Bremslicht
      // --- andere Autos: 100 ms hinter dem Server interpolieren ---
      if (tick !== null) {
        const um = this.puffer.um(tick - N.INTERP_VERZUG / DT);
        if (um) {
          for (let i = 0; i < fz.length; i++) {
            if (i === this.du) continue;
            const f = fz[i], a0 = um.a.a[i], a1 = um.b.a[i];
            if (!a0 || !a1) continue;
            const lp = R.NetzPuffer.interpolieren(a0, a1, um.t, f.vehicle);
            const rs = um.t > 0.5 ? a1[13] : a0[13];
            if (f.netRs !== rs) { f.netRs = rs; spiel._vorherAngleichen(f); }
            this._looping(f, lp);
            this._flags(f, a1);
          }
        }
      }
      // Streckenindex/Nähe (Kamera-Höhe, Scheinwerfer im Tunnel)
      for (let i = 0; i < fz.length; i++) {
        const f = fz[i];
        const n = st.spline.naechster(f.vehicle.x, f.vehicle.z, f.index >= 0 ? f.index : undefined);
        if (i !== this.du || V.sonder) f.index = n.index;
        f.nah = n;
      }
      // --- Rennuhr zwischen den Zuständen weiterlaufen lassen ---
      if (r.zustand === 'laeuft') r.zeit += dt;
      else if (r.zustand === 'countdown') r.countdown = Math.max(0, r.countdown - dt);
      // --- Optik: Bälle/Dinos/Strohballen und Pylonen wie beim Server (eigene Rechnung, nur Anzeige) ---
      this._weltOptik(tick, dt);
      // Ping-Anzeige (2× je Sekunde)
      this._pingZeit -= dt;
      if (this._pingZeit <= 0 && this.pingEl && this.verb) {
        this._pingZeit = 0.5;
        const p = this.verb.ping;
        const text = '🌐 ' + (p === null ? '…' : Math.round(p)) + ' ms';
        if (this.pingEl._t !== text) { this.pingEl._t = text; this.pingEl.textContent = text; }
      }
    }

    /** Looping-Pose aus dem Server-Zustand (anzeigePose in main.js zeichnet dann den Kreis). */
    _looping(f, lp) {
      if (!f.looping) return;
      const L = lp && this.spiel.strecke.loopings[lp[0]];
      if (L) {
        const alt = f.looping.aktiv && f.looping.looping === L ? f.looping.winkel : lp[1];
        f.looping.aktiv = true; f.looping.fallen = false; f.looping.looping = L;
        f.looping.winkelVorher = alt; f.looping.winkel = lp[1]; f.looping.qEin = lp[2];
        f.vehicle.imLooping = true;
      } else if (f.looping.aktiv) { f.looping.aktiv = false; f.vehicle.imLooping = false; }
    }
    _flags(f, a) {
      const fl = a[6];
      f.bremst = !!(fl & 1);
      if (f.flug) { f.flug.aktiv = !!(fl & 32); f.flug.nicken = f.flug.nickenVorher = 0; }
      f.vehicle.imFlug = !!(fl & 32);
    }

    /** Dynamik (Bälle, Strohballen, Dinos …) im Takt des Servers rechnen, Pylonen umfahren lassen – nur Anzeige. */
    _weltOptik(tick, dt) {
      const spiel = this.spiel, r = spiel.rennen, fz = spiel.fahrzeuge, st = spiel.strecke;
      for (let i = 0; i < fz.length; i++) {
        const v = fz[i].vehicle, s = fz[i].schatten;
        s.x = v.x; s.z = v.z; s.y = v.y; s.heading = v.heading; s.vLaengs = v.vLaengs; s.vQuer = 0; s.imLooping = !!v.imLooping; s.imFlug = !!v.imFlug;
        s.huepfer = 0;
      }
      try { R.Kollisionen.hindernisse(this.schattenListe, st, { dt, zeit: spiel._physikZeit, countdown: r.zustand === 'countdown' }); } catch (e) { /* nur Optik */ }
      const d = spiel.dynamik;
      if (!d || tick === null || this.startTick === null) return;
      const ziel = Math.floor(tick - N.INTERP_VERZUG / R.config.physik.schritt) - this.startTick;
      let n = 0;
      const autos = this._dynAutos || (this._dynAutos = []);
      while (this.dynTick < ziel && n < 6) {
        let fuehrend = null;
        autos.length = fz.length;
        for (let i = 0; i < fz.length; i++) {
          const t = r.teilnehmer[i];
          autos[i] = { vehicle: fz[i].schatten, istSpieler: !!t.istSpieler, fortschritt: t.fortschritt };
          if (t.istSpieler && (fuehrend === null || t.fortschritt > fuehrend)) fuehrend = t.fortschritt;
        }
        const e = d.schritt(R.config.physik.schritt, { fortschritt: fuehrend === null ? 0 : fuehrend, runden: r.runden, autos });
        if (e && e.ereignisse && e.ereignisse.length) {
          const m = spiel._meldung; spiel._meldung = () => {};       // Meldungen schickt der Server
          try { spiel._dinoEreignisse(e.ereignisse); } finally { spiel._meldung = m; }
        }
        try { d.kollisionen(this.schattenListe); } catch (err) { /* nur Optik */ }
        this.dynTick++; n++;
      }
      if (ziel - this.dynTick > 60) this.dynTick = ziel;   // weit zurück (Tab im Hintergrund): springen
    }
  }

  /** Letzte Steuerung für Motorton/Bremslicht des eigenen Wagens. */
  function v_letzte(v, s) { v.letzteSteuerung = s; }

  R.Online = { verfuegbar, Bildschirm: OnlineBildschirm };
  try { stilEinfuegen(); } catch (e) { /* ohne DOM (Node-Tests) */ }

  // Link mit ?raum=ABCD: nach dem Start direkt in die Code-Eingabe (vorausgefüllt)
  window.addEventListener('load', () => {
    try {
      const code = new URLSearchParams(window.location.search).get('raum');
      if (code && verfuegbar() && R.spiel && R.spiel.menue && R.spiel.menue.onlineOeffnen) R.spiel.menue.onlineOeffnen({ code });
    } catch (e) { /* ohne Parameter */ }
  });
})();
